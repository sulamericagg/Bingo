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
 *   i:<id>  Invite[]   convites de amigos (festa/casa/jogo), expiram em 20 min
 *
 * SQLite do DO (ctx.storage.sql) — índice da BUSCA de @nomes (docs/CASA-AMIGOS.md):
 *   hidx(id, h, sk, hidden)  @nome atual de cada jogador (h) + "esqueleto" sem _ e . (sk); índices em h e sk
 *   htok(tok, id)            pedaços do @ ("ana_star10" → ana, star, 10) para achar pelo meio
 *   pc(id, j)                cópia do perfil público (nome/skin/avatar) — lista de amigos e busca sem ler o KV
 * Prefixo = faixa no índice (h >= q AND h < q||'\uffff'): O(log n + 10), serve para muitos jogadores.
 * O índice nasce do cartão s:<id>.h (backfill em lotes) e é mantido por setHandle() (claim/admin/ban).
 *
 * Segurança (13+): o pedido de amizade é SEMPRE por @nome exato (escolhido na busca/QR) ou por id de
 * alguém com quem jogou junto recentemente (registrado pelo servidor). A busca nunca devolve id,
 * esconde quem bloqueou/foi bloqueado, @ banidos e quem desligou "aparecer na busca"; limitada por IP/jogador.
 */
import { DurableObject } from 'cloudflare:workers';
import { HttpError, json, PLAYER_ID_RE, readJson } from './util';
import { getHandleOwner, normalizeHandle } from './handles';
import { editDistance, fuzzyBudget, prefixDistance, searchNorm, skeleton, tokens } from '../shared/handle-search';

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
  /** não aparecer na busca de @ */
  hide?: boolean;
}
export type InviteKind = 'party' | 'house' | 'game';
export interface Invite {
  from: string;
  kind: InviteKind;
  game?: string;
  at: number;
}
/** Perfil público resumido (cópia do prof:<id> do KV). */
export interface ProfLite {
  name: string;
  skin: string;
  avatar?: unknown;
  creature?: string;
}
export interface SearchHit {
  /** só para o Worker completar o perfil — removido antes de responder */
  _id: string;
  handle: string;
  /** JSON do perfil resumido (ProfLite) — string para atravessar o RPC */
  p?: string;
  online: boolean;
  rel: 'friend' | 'sent' | 'received' | null;
  _prof: boolean;
}
const INVITE_TTL = 20 * 60_000;
const INVITE_GAP = 20_000;
const SEARCH_WINDOW = 60_000;
const SEARCH_PER_PLAYER = 45;
const SEARCH_PER_IP = 150;
const END = '\uffff';
export type RequestResult = 'sent' | 'already' | 'accepted' | 'not_found' | 'limit' | 'not_met';

const emptyRec = (): FriendRec => ({ friends: [], inbox: [], outbox: [], blocked: [], day: 0, sent: 0 });
const day = () => Math.floor(Date.now() / 86400_000);

export class FriendsHub extends DurableObject<Env> {
  private seenMem = new Map<string, number>();
  private rl = new Map<string, { n: number; t: number }>();
  private idxDone = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const sql = ctx.storage.sql;
    sql.exec(`CREATE TABLE IF NOT EXISTS hidx (id TEXT PRIMARY KEY, h TEXT NOT NULL, sk TEXT NOT NULL, hidden INTEGER NOT NULL DEFAULT 0)`);
    sql.exec(`CREATE INDEX IF NOT EXISTS hidx_h ON hidx(h)`);
    sql.exec(`CREATE INDEX IF NOT EXISTS hidx_sk ON hidx(sk)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS htok (tok TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY (tok, id)) WITHOUT ROWID`);
    sql.exec(`CREATE TABLE IF NOT EXISTS pc (id TEXT PRIMARY KEY, j TEXT NOT NULL)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`);
  }

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
    const c = await this.card(id);
    await this.ctx.storage.put('s:' + id, { ...c, h });
    this.indexHandle(id, h, !!c.hide);
  }

  /* ---------- índice da busca ---------- */

  private indexHandle(id: string, h: string, hidden: boolean): void {
    const sql = this.ctx.storage.sql;
    sql.exec('DELETE FROM htok WHERE id = ?', id);
    if (!h) {
      sql.exec('DELETE FROM hidx WHERE id = ?', id);
      return;
    }
    // o @ é único: se outro id ainda aponta para ele (corrida do KV), o último a gravar vence
    const old = sql.exec<{ id: string }>('SELECT id FROM hidx WHERE h = ? AND id <> ?', h, id).toArray();
    for (const o of old) {
      sql.exec('DELETE FROM hidx WHERE id = ?', o.id);
      sql.exec('DELETE FROM htok WHERE id = ?', o.id);
    }
    sql.exec(
      'INSERT INTO hidx (id, h, sk, hidden) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET h = excluded.h, sk = excluded.sk, hidden = excluded.hidden',
      id,
      h,
      skeleton(h),
      hidden ? 1 : 0,
    );
    for (const tk of tokens(h)) if (!h.startsWith(tk)) sql.exec('INSERT OR IGNORE INTO htok (tok, id) VALUES (?, ?)', tk, id);
  }

  /** Monta o índice a partir dos cartões já existentes (lotes de 1000; retoma de onde parou). */
  private async backfill(): Promise<void> {
    if (this.idxDone) return;
    const sql = this.ctx.storage.sql;
    const meta = (k: string) => sql.exec<{ v: string }>('SELECT v FROM meta WHERE k = ?', k).toArray()[0]?.v;
    if (meta('idx') === 'done') {
      this.idxDone = true;
      return;
    }
    const cur = meta('idxcur');
    const got = await this.ctx.storage.list<Card>({ prefix: 's:', limit: 1000, ...(cur ? { startAfter: cur } : {}) });
    let last = '';
    for (const [k, c] of got) {
      last = k;
      if (c?.h && !sql.exec('SELECT 1 FROM hidx WHERE id = ?', k.slice(2)).toArray().length) this.indexHandle(k.slice(2), c.h, !!c.hide);
    }
    if (got.size < 1000) {
      sql.exec("INSERT OR REPLACE INTO meta (k, v) VALUES ('idx', 'done')");
      this.idxDone = true;
    } else sql.exec("INSERT OR REPLACE INTO meta (k, v) VALUES ('idxcur', ?)", last);
  }

  /** @nome → id pelo índice (consistente na hora, ao contrário do KV que demora até 60 s). */
  async lookup(h: string): Promise<string | null> {
    await this.backfill();
    return this.ctx.storage.sql.exec<{ id: string }>('SELECT id FROM hidx WHERE h = ?', h).toArray()[0]?.id ?? null;
  }

  async setHidden(id: string, hidden: boolean): Promise<void> {
    const c = await this.card(id);
    await this.ctx.storage.put('s:' + id, { ...c, hide: hidden });
    this.ctx.storage.sql.exec('UPDATE hidx SET hidden = ? WHERE id = ?', hidden ? 1 : 0, id);
  }

  async setProfile(id: string, p: ProfLite): Promise<void> {
    if (!PLAYER_ID_RE.test(id)) return;
    const j = JSON.stringify({ name: p.name, skin: p.skin, ...(p.avatar ? { avatar: p.avatar } : {}), ...(p.creature ? { creature: p.creature } : {}) });
    if (j.length <= 2000) this.ctx.storage.sql.exec('INSERT OR REPLACE INTO pc (id, j) VALUES (?, ?)', id, j);
  }
  private profs(ids: string[]): Map<string, ProfLite> {
    const out = new Map<string, ProfLite>();
    for (let i = 0; i < ids.length; i += 50) {
      const part = ids.slice(i, i + 50);
      const rows = this.ctx.storage.sql.exec<{ id: string; j: string }>(`SELECT id, j FROM pc WHERE id IN (${part.map(() => '?').join(',')})`, ...part).toArray();
      for (const r of rows) {
        try {
          out.set(r.id, JSON.parse(r.j));
        } catch {
          /* */
        }
      }
    }
    return out;
  }
  /** Cartões + perfis em cache (o Worker completa pelo KV só quem faltar). */
  async infos(ids: string[]): Promise<{ cards: Record<string, Card>; profs: Record<string, string> }> {
    const list = ids.slice(0, 128);
    return { cards: await this.cards(list), profs: Object.fromEntries([...this.profs(list)].map(([k, v]) => [k, JSON.stringify(v)])) };
  }

  /** Limite de buscas: por jogador e por IP (janela de 1 min, memória do DO — instância única). */
  private allow(key: string, max: number): boolean {
    const now = Date.now();
    const r = this.rl.get(key);
    if (!r || now - r.t > SEARCH_WINDOW) {
      if (this.rl.size > 20_000) this.rl.clear();
      this.rl.set(key, { n: 1, t: now });
      return true;
    }
    return ++r.n <= max;
  }

  /**
   * Busca de @: exato > começa com > pedaço do meio > sem separadores > parecido (erro de digitação).
   * Nunca devolve o próprio jogador, bloqueados (dos dois lados), banidos ou escondidos.
   */
  async search(me: string, raw: string, ip: string): Promise<{ rate: true } | { items: SearchHit[] }> {
    if (!this.allow('p:' + me, SEARCH_PER_PLAYER) || !this.allow('ip:' + ip, SEARCH_PER_IP)) return { rate: true };
    const q = searchNorm(raw);
    if (q.length < 2) return { items: [] };
    await this.backfill();
    const sql = this.ctx.storage.sql;
    const score = new Map<string, number>();
    const hOf = new Map<string, string>();
    const add = (rows: { id: string; h: string }[], s: (h: string) => number) => {
      for (const r of rows) {
        hOf.set(r.id, r.h);
        const v = s(r.h);
        if (!score.has(r.id) || score.get(r.id)! > v) score.set(r.id, v);
      }
    };
    type Row = { id: string; h: string };
    const range = (col: 'h' | 'sk', p: string, lim: number) =>
      sql.exec<Row>(`SELECT id, h FROM hidx WHERE ${col} >= ? AND ${col} < ? AND hidden = 0 ORDER BY ${col} LIMIT ${lim}`, p, p + END).toArray();
    add(range('h', q, 30), (h) => (h === q ? 0 : 1 + (h.length - q.length) / 100));
    const sk = skeleton(q);
    if (/^[a-z0-9]+$/.test(q) && q.length >= 2) {
      const ids = sql.exec<{ id: string }>('SELECT id FROM htok WHERE tok >= ? AND tok < ? LIMIT 30', q, q + END).toArray().map((r) => r.id);
      if (ids.length) add(sql.exec<Row>(`SELECT id, h FROM hidx WHERE hidden = 0 AND id IN (${ids.map(() => '?').join(',')})`, ...ids).toArray(), (h) => 2 + h.length / 100);
    }
    if (sk.length >= 2) add(range('sk', sk, 30), (h) => 3 + h.length / 100);
    const budget = fuzzyBudget(q.length);
    if (budget && score.size < 10) {
      const seeds = new Set([q.slice(0, 2), q[1] + q[0], q[0] + (q[2] ?? '')]);
      for (const p of seeds) if (p.length === 2)
        add(
          range('h', p, 300).filter((r) => Math.min(prefixDistance(q, r.h, budget), editDistance(sk, skeleton(r.h).slice(0, sk.length + 1), budget)) <= budget),
          (h) => 4 + prefixDistance(q, h, budget) + h.length / 100,
        );
    }
    score.delete(me);
    if (!score.size) return { items: [] };
    const mine = await this.rec(me);
    const top = [...score.entries()]
      .filter(([id]) => !mine.blocked.includes(id))
      .sort((a, b) => a[1] - b[1])
      .slice(0, 24)
      .map(([id]) => id);
    const recs = top.length ? await this.ctx.storage.get<FriendRec>(top.map((i) => 'f:' + i)) : new Map<string, FriendRec>();
    const ok = top.filter((id) => !(recs.get('f:' + id)?.blocked ?? []).includes(me)).slice(0, 10);
    const cards = await this.cards(ok);
    const profs = this.profs(ok);
    const now = Date.now();
    const rel = (id: string): SearchHit['rel'] =>
      mine.friends.includes(id) ? 'friend' : mine.outbox.includes(id) ? 'sent' : mine.inbox.some((x) => x.from === id) ? 'received' : null;
    const items = ok.map((id): SearchHit => {
      const p = profs.get(id);
      return {
        _id: id,
        _prof: !!p,
        handle: hOf.get(id)!,
        ...(p ? { p: JSON.stringify(p) } : {}),
        online: now - (cards[id]?.seen ?? 0) < ONLINE_MS,
        rel: rel(id),
      };
    });
    // empate de pontuação: online primeiro
    items.sort((a, b) => score.get(a._id)! - score.get(b._id)! || Number(b.online) - Number(a.online));
    return { items };
  }

  /* ---------- convites (festa / casa / jogo) ---------- */

  private async invitesOf(id: string): Promise<Invite[]> {
    const now = Date.now();
    return ((await this.ctx.storage.get<Invite[]>('i:' + id)) ?? []).filter((x) => now - x.at < INVITE_TTL);
  }
  async invite(from: string, to: string, kind: InviteKind, game?: string): Promise<'sent' | 'not_friend' | 'wait'> {
    const a = await this.rec(from);
    if (!a.friends.includes(to)) return 'not_friend';
    const b = await this.rec(to);
    if (b.blocked.includes(from) || !b.friends.includes(from)) return 'not_friend';
    const list = await this.invitesOf(to);
    const prev = list.find((x) => x.from === from);
    if (prev && Date.now() - prev.at < INVITE_GAP) return 'wait';
    const inv: Invite = { from, kind, ...(kind === 'game' && game ? { game } : {}), at: Date.now() };
    await this.ctx.storage.put('i:' + to, [...list.filter((x) => x.from !== from), inv].slice(-20));
    return 'sent';
  }
  async clearInvite(id: string, from: string): Promise<void> {
    const list = await this.invitesOf(id);
    await this.ctx.storage.put('i:' + id, list.filter((x) => x.from !== from));
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

  async list(id: string): Promise<{ friends: string[]; inbox: { from: string; at: number }[]; outbox: string[]; blocked: string[]; invites: Invite[]; hidden: boolean }> {
    const r = await this.rec(id);
    const inv = (await this.invitesOf(id)).filter((x) => r.friends.includes(x.from));
    return { friends: r.friends, inbox: r.inbox, outbox: r.outbox, blocked: r.blocked, invites: inv, hidden: !!(await this.card(id)).hide };
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
      await this.clearInvite(id, target);
      await this.clearInvite(target, id);
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

/** Perfil público do KV → resumo (e guarda a cópia no FriendsHub para as próximas vezes). */
async function kvProfs(env: Env, ids: string[]): Promise<Record<string, ProfLite>> {
  const out: Record<string, ProfLite> = {};
  const got = await Promise.all(ids.map((id) => env.DATA.get<Prof>('prof:' + id, 'json').catch(() => null)));
  const h = hub(env);
  await Promise.all(
    ids.map(async (id, i) => {
      const p = got[i];
      const lite: ProfLite = { name: p?.name || 'Bloop', skin: p?.skin || 'bloop', ...(p?.avatar ? { avatar: p.avatar } : {}), ...(p?.creature ? { creature: p.creature } : {}) };
      out[id] = lite;
      if (p) await h.setProfile(id, lite).catch(() => {});
    }),
  );
  return out;
}

/** Monta FriendInfo (contrato src/home/api.ts). `showOnline=false` para desconhecidos. */
export async function friendInfos(env: Env, ids: string[], showOnline = true): Promise<Record<string, unknown>[]> {
  if (!ids.length) return [];
  const got = await hub(env).infos(ids);
  const cards = got.cards;
  const profs: Record<string, ProfLite> = {};
  for (const [k, v] of Object.entries(got.profs)) profs[k] = JSON.parse(v);
  const missing = ids.filter((id) => !profs[id]);
  if (missing.length) Object.assign(profs, await kvProfs(env, missing));
  const now = Date.now();
  return ids.map((id) => {
    const p = profs[id] ?? { name: 'Bloop', skin: 'bloop' };
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

/**
 * GET /api/friends?id= → { friends, requests, sent, invites, blocked, hidden } (também marca "online").
 * O app chama a cada ~40 s com a tela aberta (avisos de pedido/convite + bolinha "online").
 */
export async function friendsGet(req: Request, env: Env): Promise<Response> {
  const id = requireId(new URL(req.url).searchParams.get('id'));
  const h = hub(env);
  await h.touch(id);
  const l = await h.list(id);
  const [friends, from, sent] = await Promise.all([
    friendInfos(env, l.friends),
    friendInfos(env, l.inbox.map((x) => x.from), false),
    friendInfos(env, l.outbox.slice(-20), false),
  ]);
  const byId = new Map(friends.map((f) => [f.id as string, f]));
  return json({
    friends,
    requests: from.map((f, i) => ({ from: f, at: l.inbox[i].at })),
    sent: sent.map((f) => ({ handle: f.handle, name: f.name, skin: f.skin, ...(f.avatar ? { avatar: f.avatar } : {}) })),
    invites: l.invites.filter((x) => byId.has(x.from)).map((x) => ({ from: byId.get(x.from), kind: x.kind, ...(x.game ? { game: x.game } : {}), at: x.at })),
    blocked: l.blocked,
    hidden: l.hidden,
  });
}

/** @nome → id: índice do FriendsHub (na hora) e, se não estiver lá, o KV. */
export async function resolveHandle(env: Env, raw: string): Promise<string | null> {
  const h = normalizeHandle(raw);
  if (!h) return null;
  // banir um @ (painel admin) já tira do índice (setHandle(id, ''))
  return (await hub(env).lookup(h).catch(() => null)) ?? getHandleOwner(env, h);
}

/** POST /api/friends/request { id, handle? | to? } → { result } */
export async function friendsRequest(req: Request, env: Env): Promise<Response> {
  const b = await readJson(req);
  const id = requireId(b.id);
  let to = '';
  let byHandle = false;
  if (b.handle) {
    to = (await resolveHandle(env, String(b.handle))) || '';
    byHandle = true;
  } else if (b.to && PLAYER_ID_RE.test(String(b.to))) to = String(b.to);
  if (!to) return json({ result: 'not_found' });
  return json({ result: await hub(env).request(id, to, byHandle) });
}

/** POST /api/friends/invite { id, to, kind: 'party'|'house'|'game', game? } → { result: 'sent'|'not_friend'|'wait' } */
export async function friendsInvite(req: Request, env: Env): Promise<Response> {
  const b = await readJson(req);
  const id = requireId(b.id);
  const to = requireId(b.to, 'to');
  const kind = String(b.kind ?? '');
  if (kind !== 'party' && kind !== 'house' && kind !== 'game') throw new HttpError(400, 'bad_kind', 'Convite inválido.');
  const game = /^[a-z0-9-]{1,24}$/.test(String(b.game ?? '')) ? String(b.game) : undefined;
  return json({ result: await hub(env).invite(id, to, kind, game) });
}

/** POST /api/friends/invite/clear { id, from } — some com o convite (entrou ou ignorou). */
export async function friendsInviteClear(req: Request, env: Env): Promise<Response> {
  const b = await readJson(req);
  await hub(env).clearInvite(requireId(b.id), requireId(b.from, 'from'));
  return json({ ok: true });
}

/** POST /api/friends/visibility { id, hidden } — aparecer (ou não) na busca de @. */
export async function friendsVisibility(req: Request, env: Env): Promise<Response> {
  const b = await readJson(req);
  await hub(env).setHidden(requireId(b.id), !!b.hidden);
  return json({ ok: true, hidden: !!b.hidden });
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
