/**
 * JANGADA BLOOP online — Durable Object `RaftRoom` (binding RAFT, SQLite, plano grátis).
 *
 * Também serve o Bloop Pink (Minha Loja em grupo): /api/pink/room/<CÓDIGO> → idFromName('pink:room:<CÓDIGO>'),
 * mesmo protocolo (o anfitrião = dono da loja; o save dele manda). Sem classe nova nem migração.
 *
 * Dois papéis na mesma classe (como o RaftRoom):
 *  - sala (idFromName('room:<CÓDIGO>')): RELÉ para até 4 Bloops na mesma jangada. O anfitrião (quem criou)
 *    manda no mundo: jangada, restos boiando, tubarão, fantasma, hora, clima e ilhas. Cada um simula o
 *    PRÓPRIO Bloop e manda posição (10/s) e pedidos ('act': pegar resto, construir, usar peça...).
 *    O servidor não simula nada.
 *  - caixa de convites (idFromName('inbox:<id>')): RPC invite()/list().
 *
 * Protocolo (JSON, campo t). Toda mensagem repassada leva `from` (id de quem mandou, carimbado aqui):
 *   anfitrião → todos os outros (ou só `to`, se vier);  convidado → todos os outros.
 *   servidor → quem entra: {t:'welcome', host, you, peers:[{id,name,skin}]}
 *              | {t:'reject', reason}  (bad_code | bad_id | taken | no_room | full)
 *   servidor → os outros: {t:'join', id, name, skin} · {t:'leave', id}
 *   servidor → todos: {t:'host', id} quando o anfitrião sai e o mais antigo assume (o mundo continua).
 * Modo "auto" (?auto=1, grupo/party): cria se a sala não existe, senão entra.
 * Sem texto livre (nomes vêm do servidor e passam por safeName).
 * Limites: 4 pessoas; mensagem ≤ 16 KB (anfitrião: a jangada inteira) / 4 KB (convidado); ~50 msg/s.
 */
import { DurableObject } from 'cloudflare:workers';
import { hub } from './friends';
import { safeName } from './moderation';
import { cleanName, HttpError, json, PLAYER_ID_RE, readJson } from './util';

export const RAFT_MAX = 4;
export const RAFT_CODE_RE = /^[A-HJ-NP-Z2-9]{5}$/;
const HOST_MAX = 16_000;
const GUEST_MAX = 4_000;
const PER_S = 50;
const INVITE_TTL = 3 * 60_000;
const INVITES_MAX = 10;
const SKIN_RE = /^[a-z0-9_-]{1,24}$/;

interface Att {
  id: string;
  name: string;
  skin: string;
  host: boolean;
  /** ordem de chegada (para escolher o próximo anfitrião) */
  at: number;
}
export interface RaftInvite {
  from: string;
  name: string;
  code: string;
  at: number;
}

export class RaftRoom extends DurableObject<Env> {
  private rate = new Map<string, { n: number; at: number }>();

  /* ============================== sala ============================== */

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'expected_websocket' }, 426);
    const u = new URL(req.url);
    const code = u.searchParams.get('code') ?? '';
    const id = u.searchParams.get('id') ?? '';
    const auto = u.searchParams.get('auto') === '1';
    let create = u.searchParams.get('create') === '1';
    const pair = new WebSocketPair();
    const ws = pair[1];
    this.ctx.acceptWebSocket(ws);
    const fail = (reason: string) => {
      ws.send(JSON.stringify({ t: 'reject', reason }));
      ws.close(1008, reason);
      return new Response(null, { status: 101, webSocket: pair[0] });
    };
    if (!RAFT_CODE_RE.test(code)) return fail('bad_code');
    if (!PLAYER_ID_RE.test(id)) return fail('bad_id');
    const skin = u.searchParams.get('skin') ?? '';
    const others = this.members().filter((m) => m.ws !== ws);
    let host = others.find((m) => m.a.host);
    if (auto) create = !host || host.a.id === id;
    const a: Att = { id, name: safeName(cleanName(u.searchParams.get('name') ?? '')) || 'Bloop', skin: SKIN_RE.test(skin) ? skin : 'bloop', host: create, at: Date.now() };
    if (create) {
      if (host && host.a.id !== id) return fail('taken');
      // sala nova (ou o mesmo anfitrião reconectando): quem estava recomeça
      for (const m of others) this.close(m.ws, 'reset');
      host = undefined;
    } else {
      if (!host) return fail('no_room');
      for (const m of others) if (m.a.id === id) this.close(m.ws, 'replaced');
      if (this.members().filter((m) => m.ws !== ws && m.a.id !== id).length >= RAFT_MAX) return fail('full');
    }
    ws.serializeAttachment(a);
    const peers = this.members()
      .filter((m) => m.ws !== ws)
      .map((m) => ({ id: m.a.id, name: m.a.name, skin: m.a.skin }));
    ws.send(JSON.stringify({ t: 'welcome', host: create ? id : host!.a.id, you: id, peers }));
    if (!create) {
      for (const m of this.members()) if (m.ws !== ws) this.send(m.ws, { t: 'join', id: a.id, name: a.name, skin: a.skin });
      // quem navegou junto pode virar amigo depois (registro do servidor, não forjável)
      this.ctx.waitUntil(hub(this.env).met([host!.a.id, a.id]).catch(() => {}));
    }
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  private members(): { ws: WebSocket; a: Att }[] {
    const out: { ws: WebSocket; a: Att }[] = [];
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Att | null;
      if (a) out.push({ ws, a });
    }
    return out;
  }
  private send(ws: WebSocket, data: unknown): void {
    try {
      ws.send(typeof data === 'string' ? data : JSON.stringify(data));
    } catch {
      /* fechado */
    }
  }
  private close(ws: WebSocket, reason: string): void {
    try {
      ws.serializeAttachment(null);
      ws.close(1000, reason);
    } catch {
      /* */
    }
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    if (typeof data !== 'string') return;
    const a = ws.deserializeAttachment() as Att | null;
    if (!a) return;
    if (data.length > (a.host ? HOST_MAX : GUEST_MAX)) return;
    const now = Date.now();
    const r = this.rate.get(a.id) ?? { n: 0, at: now };
    if (now - r.at > 1000) (r.n = 0), (r.at = now);
    if (++r.n > PER_S * (a.host ? 2 : 1)) return;
    this.rate.set(a.id, r);
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(data);
      if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string' || msg.t.length > 12) return;
    } catch {
      return;
    }
    const to = a.host && typeof msg.to === 'string' ? msg.to : '';
    msg.from = a.id;
    const out = JSON.stringify(msg);
    for (const x of this.members()) if (x.ws !== ws && (!to || x.a.id === to)) this.send(x.ws, out);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const a = ws.deserializeAttachment() as Att | null;
    if (!a) return;
    ws.serializeAttachment(null);
    this.rate.delete(a.id);
    const rest = this.members().filter((m) => m.ws !== ws);
    if (!rest.length) {
      await this.ctx.storage.deleteAll();
      return;
    }
    for (const m of rest) this.send(m.ws, { t: 'leave', id: a.id });
    if (a.host && !rest.some((m) => m.a.host)) {
      // anfitrião saiu: o mais antigo assume a partida (bots, borda, placar)
      const nh = rest.reduce((b, m) => (m.a.at < b.a.at ? m : b));
      nh.a.host = true;
      nh.ws.serializeAttachment(nh.a);
      for (const m of rest) this.send(m.ws, { t: 'host', id: nh.a.id });
    }
  }
  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  /* ============================== convites ============================== */

  async invite(inv: RaftInvite): Promise<void> {
    const now = Date.now();
    const list = ((await this.ctx.storage.get<RaftInvite[]>('inv')) ?? []).filter((i) => now - i.at < INVITE_TTL && i.from !== inv.from);
    list.push(inv);
    await this.ctx.storage.put('inv', list.slice(-INVITES_MAX));
  }
  async list(): Promise<RaftInvite[]> {
    const now = Date.now();
    return ((await this.ctx.storage.get<RaftInvite[]>('inv')) ?? []).filter((i) => now - i.at < INVITE_TTL);
  }
}

/* ============================== rotas ============================== */

/** Jogos que reaproveitam este relé (mesma classe, salas separadas por prefixo): '' = Jangada · 'pink' = Bloop Pink (Minha Loja em grupo). */
export type RelayNs = '' | 'pink';
export const relayRoomName = (ns: RelayNs, code: string): string => (ns ? `${ns}:room:${code}` : 'room:' + code);

/** WebSocket: /api/raft/room/<CÓDIGO>?id=&name=&skin=&create=1|auto=1 (e /api/pink/room/<CÓDIGO>, ns 'pink') */
export async function raftJoin(req: Request, env: Env, code: string, ns: RelayNs = ''): Promise<Response> {
  if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'expected_websocket', message: 'Use WebSocket' }, 426);
  if (!RAFT_CODE_RE.test(code)) return json({ error: 'bad_code' }, 400);
  const url = new URL(req.url);
  url.searchParams.set('code', code);
  return env.RAFT.get(env.RAFT.idFromName(relayRoomName(ns, code))).fetch(new Request(url.toString(), req));
}

/** POST /api/raft/invite {id, to, code, name} — só entre amigos */
export async function raftInvite(req: Request, env: Env): Promise<Response> {
  const b = await readJson<{ id?: string; to?: string; code?: string; name?: string }>(req);
  const id = String(b.id ?? '');
  const to = String(b.to ?? '');
  const code = String(b.code ?? '');
  if (!PLAYER_ID_RE.test(id) || !PLAYER_ID_RE.test(to) || !RAFT_CODE_RE.test(code)) throw new HttpError(400, 'bad_request', 'Dados inválidos');
  if (!(await hub(env).areFriends(id, to))) throw new HttpError(403, 'not_friend', 'Só amigos podem chamar');
  await env.RAFT.get(env.RAFT.idFromName('inbox:' + to)).invite({ from: id, name: safeName(cleanName(b.name ?? '')) || 'Bloop', code, at: Date.now() });
  return json({ ok: true });
}

/** GET /api/raft/invites?id= */
export async function raftInvites(req: Request, env: Env): Promise<Response> {
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!PLAYER_ID_RE.test(id)) throw new HttpError(400, 'bad_id', 'id inválido');
  return json({ invites: await env.RAFT.get(env.RAFT.idFromName('inbox:' + id)).list() });
}
