/**
 * AMIZADES — Durable Object `FriendsHub` (binding FRIENDS, SQLite, plano grátis), instância única 'hub'.
 *
 * Por que um DO e não KV? Pedidos/aceites mexem em DOIS jogadores ao mesmo tempo e precisam de
 * limites exatos (100 amigos, 20 pedidos/dia). O DO serializa tudo (sem corrida) e as escritas no
 * armazenamento SQLite do DO não gastam a cota de 1.000 escritas/dia do KV.
 *
 * Armazenamento do DO:
 *   f:<id>  FriendRec  (amigos, pedidos recebidos/enviados, bloqueados, limite diário)
 *   s:<id>  Card       (visto por último, @nome, nível de bagunça da casa 0..1)
 *   m:<id>  Record<outroId, ts>  quem jogou junto (presença/corrida/festa) nos últimos 7 dias
 *
 * Segurança infantil: pedido de amizade SÓ por @nome exato ou por id de alguém com quem jogou
 * junto recentemente (registrado pelo servidor — o cliente não consegue forjar). Não existe
 * listagem/busca aberta de jogadores.
 */
import { DurableObject } from 'cloudflare:workers';
import { HttpError, json, PLAYER_ID_RE, readJson } from './util';
import { getHandleOwner, normalizeHandle } from './handles';

export const FRIEND_MAX = 100;
export const REQ_PER_DAY = 20;
const INBOX_MAX = 50;
const MEET_TTL = 7 * 86400_000;
const MEET_MAX = 60;
const SEEN_SAVE_MS = 2 * 60_000;
export const ONLINE_MS = 3 * 60_000;

interface FriendRec {
  friends: string[];
  inbox: { from: string; at: number }[];
  outbox: string[];
  blocked: string[];
  day: number;
  sent: number;
}
export interface Card {
  seen: number;
  h: string;
  mess: number;
}
export type RequestResult = 'sent' | 'already' | 'accepted' | 'not_found' | 'limit' | 'not_met';

const emptyRec = (): FriendRec => ({ friends: [], inbox: [], outbox: [], blocked: [], day: 0, sent: 0 });
const day = () => Math.floor(Date.now() / 86400_000);

export class FriendsHub extends DurableObject<Env> {
  private seenMem = new Map<string, number>();

  private async rec(id: string): Promise<FriendRec> {
    return { ...emptyRec(), ...((await this.ctx.storage.get<FriendRec>('f:' + id)) ?? {}) };
  }
  private put(id: string, r: FriendRec): Promise<void> {
    return this.ctx.storage.put('f:' + id, r);
  }
  private async card(id: string): Promise<Card> {
    return { seen: 0, h: '', mess: 0, ...((await this.ctx.storage.get<Card>('s:' + id)) ?? {}) };
  }

  /* ---------- online / cartão ---------- */

  /** Marca "visto agora" (memória sempre; disco no máx. a cada 2 min). */
  async touch(id: string): Promise<void> {
    const now = Date.now();
    this.seenMem.set(id, now);
    const c = await this.card(id);
    if (now - c.seen >= SEEN_SAVE_MS) await this.ctx.storage.put('s:' + id, { ...c, seen: now });
  }
  async setHandle(id: string, h: string): Promise<void> {
    await this.ctx.storage.put('s:' + id, { ...(await this.card(id)), h });
  }
  async setMess(id: string, mess: number): Promise<void> {
    const c = await this.card(id);
    if (Math.abs(c.mess - mess) > 0.001) await this.ctx.storage.put('s:' + id, { ...c, mess });
  }
  async cards(ids: string[]): Promise<Record<string, Card>> {
    const keys = ids.slice(0, 128).map((i) => 's:' + i);
    const got = keys.length ? await this.ctx.storage.get<Card>(keys) : new Map<string, Card>();
    const out: Record<string, Card> = {};
    for (const id of ids.slice(0, 128)) {
      const c = { seen: 0, h: '', mess: 0, ...(got.get('s:' + id) ?? {}) };
      c.seen = Math.max(c.seen, this.seenMem.get(id) ?? 0);
      out[id] = c;
    }
    return out;
  }

  /* ---------- "jogaram juntos" ---------- */

  /** Registra que estes jogadores estiveram na mesma sala (presença/corrida/festa). */
  async met(ids: string[]): Promise<void> {
    const list = [...new Set(ids.filter((i) => PLAYER_ID_RE.test(i)))].slice(0, 12);
    if (list.length < 2) return;
    const now = Date.now();
    for (const a of list) {
      const m = (await this.ctx.storage.get<Record<string, number>>('m:' + a)) ?? {};
      for (const b of list) if (b !== a) m[b] = now;
      const keep = Object.entries(m)
        .filter(([, t]) => now - t < MEET_TTL)
        .sort((x, y) => y[1] - x[1])
        .slice(0, MEET_MAX);
      await this.ctx.storage.put('m:' + a, Object.fromEntries(keep));
    }
  }
  private async hasMet(a: string, b: string): Promise<boolean> {
    const m = (await this.ctx.storage.get<Record<string, number>>('m:' + a)) ?? {};
    return !!m[b] && Date.now() - m[b] < MEET_TTL;
  }

  /* ---------- amizades ---------- */

  async list(id: string): Promise<{ friends: string[]; inbox: { from: string; at: number }[]; blocked: string[] }> {
    const r = await this.rec(id);
    return { friends: r.friends, inbox: r.inbox, blocked: r.blocked };
  }

  async areFriends(a: string, b: string): Promise<boolean> {
    return (await this.rec(a)).friends.includes(b);
  }

  /** byHandle = o remetente digitou o @nome exato; senão precisa ter jogado junto. */
  async request(from: string, to: string, byHandle: boolean): Promise<RequestResult> {
    if (from === to) return 'not_found';
    const a = await this.rec(from);
    const b = await this.rec(to);
    if (a.friends.includes(to)) return 'already';
    // bloqueio (de qualquer lado): responde como "não encontrado" para não expor nada
    if (b.blocked.includes(from) || a.blocked.includes(to)) return 'not_found';
    // ele já me pediu? então é aceite direto
    if (a.inbox.some((x) => x.from === to)) return (await this.respond(from, to, true)) ? 'accepted' : 'limit';
    if (!byHandle && !(await this.hasMet(from, to))) return 'not_met';
    if (a.outbox.includes(to) && b.inbox.some((x) => x.from === from)) return 'sent';
    const d = day();
    if (a.day !== d) (a.day = d), (a.sent = 0);
    if (a.sent >= REQ_PER_DAY) return 'limit';
    if (a.friends.length >= FRIEND_MAX || b.friends.length >= FRIEND_MAX) return 'limit';
    a.sent++;
    a.outbox = [...a.outbox.filter((x) => x !== to), to].slice(-INBOX_MAX);
    b.inbox = [...b.inbox.filter((x) => x.from !== from), { from, at: Date.now() }].slice(-INBOX_MAX);
    await this.put(from, a);
    await this.put(to, b);
    return 'sent';
  }

  async respond(id: string, from: string, accept: boolean): Promise<boolean> {
    const me = await this.rec(id);
    if (!me.inbox.some((x) => x.from === from)) return false;
    const other = await this.rec(from);
    me.inbox = me.inbox.filter((x) => x.from !== from);
    other.outbox = other.outbox.filter((x) => x !== id);
    if (accept) {
      if (me.friends.length >= FRIEND_MAX || other.friends.length >= FRIEND_MAX) {
        await this.put(id, me);
        await this.put(from, other);
        return false;
      }
      if (!me.friends.includes(from)) me.friends.unshift(from);
      if (!other.friends.includes(id)) other.friends.unshift(id);
    }
    await this.put(id, me);
    await this.put(from, other);
    return true;
  }

  async remove(id: string, friend: string): Promise<boolean> {
    const me = await this.rec(id);
    const other = await this.rec(friend);
    const had = me.friends.includes(friend);
    me.friends = me.friends.filter((x) => x !== friend);
    other.friends = other.friends.filter((x) => x !== id);
    await this.put(id, me);
    await this.put(friend, other);
    return had;
  }

  /** Bloquear desfaz a amizade e apaga pedidos pendentes entre os dois. */
  async block(id: string, target: string, on: boolean): Promise<void> {
    const me = await this.rec(id);
    me.blocked = me.blocked.filter((x) => x !== target);
    if (on) {
      me.blocked = [...me.blocked, target].slice(-500);
      const other = await this.rec(target);
      me.friends = me.friends.filter((x) => x !== target);
      me.inbox = me.inbox.filter((x) => x.from !== target);
      me.outbox = me.outbox.filter((x) => x !== target);
      other.friends = other.friends.filter((x) => x !== id);
      other.inbox = other.inbox.filter((x) => x.from !== id);
      other.outbox = other.outbox.filter((x) => x !== id);
      await this.put(target, other);
    }
    await this.put(id, me);
  }
}

export const hub = (env: Env): DurableObjectStub<FriendsHub> => env.FRIENDS.get(env.FRIENDS.idFromName('hub'));

/* ======================= rotas HTTP ======================= */

export function requireId(v: unknown, field = 'id'): string {
  const id = String(v ?? '');
  if (!PLAYER_ID_RE.test(id)) throw new HttpError(400, 'bad_' + field, 'Jogador inválido.');
  return id;
}

interface Prof {
  name?: string;
  skin?: string;
  avatar?: unknown;
  creature?: string;
}

/** Monta FriendInfo (contrato src/home/api.ts). `showOnline=false` para desconhecidos. */
export async function friendInfos(env: Env, ids: string[], showOnline = true): Promise<Record<string, unknown>[]> {
  if (!ids.length) return [];
  const cards = await hub(env).cards(ids);
  const profs = await Promise.all(ids.map((id) => env.DATA.get<Prof>('prof:' + id, 'json').catch(() => null)));
  const now = Date.now();
  return ids.map((id, i) => {
    const p = profs[i] ?? {};
    const c = cards[id] ?? { seen: 0, h: '', mess: 0 };
    return {
      id,
      handle: c.h,
      name: p.name || 'Bloop',
      skin: p.skin || 'bloop',
      ...(p.avatar ? { avatar: p.avatar } : {}),
      ...(p.creature ? { creature: p.creature } : {}),
      online: showOnline && now - c.seen < ONLINE_MS,
      lastSeen: showOnline ? c.seen : 0,
      houseMess: showOnline ? c.mess : 0,
    };
  });
}

/** GET /api/friends?id= → { friends: FriendInfo[], requests: FriendRequest[] } (também marca "online"). */
export async function friendsGet(req: Request, env: Env): Promise<Response> {
  const id = requireId(new URL(req.url).searchParams.get('id'));
  const h = hub(env);
  await h.touch(id);
  const l = await h.list(id);
  const [friends, from] = await Promise.all([friendInfos(env, l.friends), friendInfos(env, l.inbox.map((x) => x.from), false)]);
  return json({ friends, requests: from.map((f, i) => ({ from: f, at: l.inbox[i].at })), blocked: l.blocked });
}

/** POST /api/friends/request { id, handle? | to? } → { result } */
export async function friendsRequest(req: Request, env: Env): Promise<Response> {
  const b = await readJson(req);
  const id = requireId(b.id);
  let to = '';
  let byHandle = false;
  if (b.handle) {
    const h = normalizeHandle(String(b.handle));
    to = (h && (await getHandleOwner(env, h))) || '';
    byHandle = true;
  } else if (b.to && PLAYER_ID_RE.test(String(b.to))) to = String(b.to);
  if (!to) return json({ result: 'not_found' });
  return json({ result: await hub(env).request(id, to, byHandle) });
}

/** POST /api/friends/respond { id, from, accept } */
export async function friendsRespond(req: Request, env: Env): Promise<Response> {
  const b = await readJson(req);
  return json({ ok: await hub(env).respond(requireId(b.id), requireId(b.from, 'from'), !!b.accept) });
}

/** POST /api/friends/remove { id, friend } */
export async function friendsRemove(req: Request, env: Env): Promise<Response> {
  const b = await readJson(req);
  return json({ ok: await hub(env).remove(requireId(b.id), requireId(b.friend, 'friend')) });
}

/** POST /api/friends/block { id, target, on } */
export async function friendsBlock(req: Request, env: Env): Promise<Response> {
  const b = await readJson(req);
  await hub(env).block(requireId(b.id), requireId(b.target, 'target'), b.on !== false);
  return json({ ok: true });
}
