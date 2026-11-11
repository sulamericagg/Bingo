/**
 * MUNDO ABERTO online ("Servidores") — Durable Object `WorldRoom` (binding MUNDO, SQLite).
 *
 * Dois papéis (como o FlightRoom):
 *  - mundo (idFromName('room:<CÓDIGO>')): até 8 jogadores. O ANFITRIÃO é a autoridade das
 *    entidades (bichos, vagonetes) e manda retratos; o servidor só repassa e GUARDA as edições do
 *    mundo (terreno, peças, portas, baús) como uma lista de operações em lotes no armazenamento
 *    do DO. Quem entra recebe a semente/opções + todas as operações e remonta o mundo igual.
 *    O mundo continua existindo depois que todos saem (o anfitrião reabre com o mesmo código).
 *  - caixa de convites (idFromName('inbox:<id>')): amigo chamou para o mundo.
 *
 * Protocolo (JSON, campo t):
 *   cliente → {t:'s', p:[x,y,z,yaw,pitch], v?, h?}          estado (≤ 12/s)
 *             {t:'op', op}                                   edição do mundo (guardada + repassada)
 *             {t:'ent', l:[...]}                              (anfitrião) retratos das entidades
 *             {t:'hit', to, d}                                golpe PvP (só se pvp ligado)
 *             {t:'pvp', on} {t:'kick', id} {t:'mg', ...}      (anfitrião) regras/minigame
 *             {t:'ev', ...}                                   efeito passageiro (repassado)
 *   servidor → {t:'welcome', you, host, pvp, meta, ops, peers}
 *              {t:'join', p} {t:'leave', id} {t:'host', id} {t:'s', id, p, v?, h?}
 *              {t:'op', id, op} {t:'ent', l} {t:'hit', from, d} {t:'pvp', on} {t:'mg', ...} {t:'ev', ...}
 *              {t:'reject', reason}   bad_code | bad_id | no_world | full | kicked
 */
import { DurableObject } from 'cloudflare:workers';
import { hub } from './friends';
import { safeName } from './moderation';
import { cleanName, HttpError, json, PLAYER_ID_RE, readJson } from './util';

export const MUNDO_MAX = 8;
export const MCODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
const MSG_MAX = 48_000;
const STATE_MIN_MS = 70;
const OPS_PER_S = 25;
const BATCH = 400;
const OPS_MAX = 60_000;
const INVITE_TTL = 5 * 60_000;
const SKIN_RE = /^[a-z0-9_-]{1,24}$/;

interface Att {
  id: string;
  name: string;
  skin: string;
}
interface Meta {
  owner: string;
  name: string;
  seed: number;
  gen: unknown;
  mode: string;
  mini: string;
  pvp: boolean;
  nOps: number;
  created: number;
}
export interface MInvite {
  from: string;
  name: string;
  code: string;
  world: string;
  at: number;
}

export class WorldRoom extends DurableObject<Env> {
  private meta: Meta | null = null;
  private host = '';
  private pos = new Map<string, unknown>();
  private lastS = new Map<string, number>();
  private rate = new Map<string, { n: number; at: number }>();
  private tail: unknown[] | null = null;
  private kicked = new Set<string>();

  private async getMeta(): Promise<Meta | null> {
    if (!this.meta) this.meta = (await this.ctx.storage.get<Meta>('meta')) ?? null;
    return this.meta;
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'expected_websocket' }, 426);
    const u = new URL(req.url);
    const code = u.searchParams.get('code') ?? '';
    const id = u.searchParams.get('id') ?? '';
    const pair = new WebSocketPair();
    const ws = pair[1];
    this.ctx.acceptWebSocket(ws);
    const fail = (reason: string) => {
      ws.send(JSON.stringify({ t: 'reject', reason }));
      ws.close(1008, reason);
      return new Response(null, { status: 101, webSocket: pair[0] });
    };
    if (!MCODE_RE.test(code)) return fail('bad_code');
    if (!PLAYER_ID_RE.test(id)) return fail('bad_id');
    if (this.kicked.has(id)) return fail('kicked');
    const skin = u.searchParams.get('skin') ?? '';
    const a: Att = { id, name: safeName(cleanName(u.searchParams.get('name') ?? '')) || 'Bloop', skin: SKIN_RE.test(skin) ? skin : 'bloop' };
    let meta = await this.getMeta();
    const create = u.searchParams.get('create');
    if (create) {
      // criar (ou reabrir) o mundo: só o dono, ou código livre
      let opts: Record<string, unknown> = {};
      try {
        opts = JSON.parse(create);
      } catch {
        /* */
      }
      if (meta && meta.owner !== id) return fail('taken');
      if (!meta) {
        meta = {
          owner: id,
          name: safeName(cleanName(String(opts.name ?? ''))) || 'Mundo',
          seed: Number.isFinite(+opts.seed!) ? Math.floor(+opts.seed!) : 1,
          gen: typeof opts.gen === 'object' ? opts.gen : null,
          mode: ['sobrevivencia', 'criativo', 'pacifico'].includes(String(opts.mode)) ? String(opts.mode) : 'sobrevivencia',
          mini: ['', 'ceu', 'corrida', 'esconde'].includes(String(opts.mini ?? '')) ? String(opts.mini ?? '') : '',
          pvp: !!opts.pvp,
          nOps: 0,
          created: Date.now(),
        };
        await this.ctx.storage.put('meta', meta);
        this.meta = meta;
      }
    } else if (!meta) return fail('no_world');
    const others = this.members().filter((m) => m.ws !== ws);
    for (const m of others) if (m.a.id === id) this.close(m.ws, 'replaced');
    if (this.members().filter((m) => m.ws !== ws && m.a.id !== id).length >= MUNDO_MAX) return fail('full');
    ws.serializeAttachment(a);
    // anfitrião: o dono quando está; senão o primeiro que chegou
    const ms = this.members();
    const owner = ms.find((m) => m.a.id === meta!.owner);
    const prevHost = this.host;
    if (owner) this.host = owner.a.id;
    else if (!ms.some((m) => m.a.id === this.host)) this.host = ms[0]?.a.id ?? id;
    const ops = await this.allOps();
    const peers = ms.filter((m) => m.ws !== ws).map((m) => ({ ...m.a, p: this.pos.get(m.a.id) ?? null }));
    ws.send(JSON.stringify({ t: 'welcome', you: id, host: this.host, pvp: meta.pvp, meta: { name: meta.name, seed: meta.seed, gen: meta.gen, mode: meta.mode, mini: meta.mini, owner: meta.owner }, ops, peers }));
    this.broadcast({ t: 'join', p: a }, ws);
    if (prevHost !== this.host) this.broadcast({ t: 'host', id: this.host });
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  private async allOps(): Promise<unknown[]> {
    const meta = await this.getMeta();
    if (!meta) return [];
    const nb = Math.ceil(meta.nOps / BATCH);
    const keys: string[] = [];
    for (let i = 0; i < nb; i++) keys.push('ops:' + i);
    const out: unknown[] = [];
    for (let i = 0; i < keys.length; i += 120) {
      const m = await this.ctx.storage.get<unknown[]>(keys.slice(i, i + 120));
      for (const k of keys.slice(i, i + 120)) for (const op of m.get(k) ?? []) out.push(op);
    }
    return out;
  }
  private async pushOp(op: unknown): Promise<void> {
    const meta = (await this.getMeta())!;
    if (meta.nOps >= OPS_MAX) return;
    const b = Math.floor(meta.nOps / BATCH);
    if (!this.tail || meta.nOps % BATCH === 0) this.tail = meta.nOps % BATCH === 0 ? [] : ((await this.ctx.storage.get<unknown[]>('ops:' + b)) ?? []);
    this.tail.push(op);
    meta.nOps++;
    await this.ctx.storage.put({ ['ops:' + b]: this.tail, meta });
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
  private broadcast(data: unknown, except: WebSocket | null = null): void {
    const s = JSON.stringify(data);
    for (const m of this.members()) if (m.ws !== except) this.send(m.ws, s);
  }
  private close(ws: WebSocket, reason: string): void {
    try {
      ws.serializeAttachment(null);
      ws.close(1000, reason);
    } catch {
      /* */
    }
  }
  private hostId(): string {
    const ms = this.members();
    if (!ms.some((m) => m.a.id === this.host)) {
      const owner = ms.find((m) => m.a.id === this.meta?.owner);
      this.host = owner?.a.id ?? ms[0]?.a.id ?? '';
      if (this.host) this.broadcast({ t: 'host', id: this.host });
    }
    return this.host;
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    if (typeof data !== 'string' || data.length > MSG_MAX) return;
    const a = ws.deserializeAttachment() as Att | null;
    if (!a) return;
    let msg: Record<string, any>;
    try {
      msg = JSON.parse(data);
      if (!msg || typeof msg !== 'object') return;
    } catch {
      return;
    }
    const now = Date.now();
    const isHost = a.id === this.hostId();
    const meta = await this.getMeta();
    if (!meta) return;
    switch (msg.t) {
      case 's': {
        const last = this.lastS.get(a.id) ?? 0;
        if (now - last < STATE_MIN_MS) return;
        this.lastS.set(a.id, now);
        if (!Array.isArray(msg.p) || msg.p.length > 6 || !msg.p.every((v: unknown) => typeof v === 'number' && Number.isFinite(v))) return;
        this.pos.set(a.id, msg.p);
        const out: Record<string, unknown> = { t: 's', id: a.id, p: msg.p };
        if (typeof msg.v === 'object' && msg.v) out.v = msg.v;
        if (typeof msg.h === 'string' && msg.h.length < 32) out.h = msg.h;
        this.broadcast(out, ws);
        return;
      }
      case 'op': {
        const r = this.rate.get(a.id) ?? { n: 0, at: now };
        if (now - r.at > 1000) (r.n = 0), (r.at = now);
        if (++r.n > OPS_PER_S) return;
        this.rate.set(a.id, r);
        const op = msg.op;
        if (!op || typeof op !== 'object' || JSON.stringify(op).length > 6000) return;
        await this.pushOp(op);
        this.broadcast({ t: 'op', id: a.id, op }, ws);
        return;
      }
      case 'ent':
        if (isHost) this.broadcast({ t: 'ent', l: msg.l }, ws);
        return;
      case 'ev':
        this.broadcast({ ...msg, from: a.id }, ws);
        return;
      case 'hit': {
        if (!meta.pvp || typeof msg.to !== 'string') return;
        const d = Math.max(0, Math.min(12, +msg.d || 0));
        for (const m of this.members()) if (m.a.id === msg.to) this.send(m.ws, { t: 'hit', from: a.id, d });
        return;
      }
      case 'pvp':
        if (!isHost) return;
        meta.pvp = !!msg.on;
        await this.ctx.storage.put('meta', meta);
        this.broadcast({ t: 'pvp', on: meta.pvp });
        return;
      case 'kick':
        if (!isHost || typeof msg.id !== 'string' || msg.id === a.id) return;
        this.kicked.add(msg.id);
        for (const m of this.members())
          if (m.a.id === msg.id) {
            this.send(m.ws, { t: 'reject', reason: 'kicked' });
            this.close(m.ws, 'kicked');
          }
        return;
      case 'mg':
        // minigame: só o anfitrião manda regras; jogadores mandam votos/eventos ao anfitrião
        if (isHost) this.broadcast({ ...msg, from: a.id }, ws);
        else {
          const h = this.members().find((m) => m.a.id === this.host);
          if (h) this.send(h.ws, { ...msg, from: a.id });
        }
        return;
      case 'reset':
        // anfitrião dono pode recomeçar a partida de minigame (apaga as edições)
        if (!isHost || a.id !== meta.owner) return;
        await this.ctx.storage.deleteAll();
        meta.nOps = 0;
        this.tail = null;
        await this.ctx.storage.put('meta', meta);
        this.broadcast({ t: 'reset' });
        return;
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const a = ws.deserializeAttachment() as Att | null;
    if (!a) return;
    ws.serializeAttachment(null);
    this.pos.delete(a.id);
    this.broadcast({ t: 'leave', id: a.id });
    if (a.id === this.host) this.hostId();
  }
  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  /* ============================== convites ============================== */

  async invite(inv: MInvite): Promise<void> {
    const now = Date.now();
    const list = ((await this.ctx.storage.get<MInvite[]>('inv')) ?? []).filter((i) => now - i.at < INVITE_TTL && i.from !== inv.from);
    list.push(inv);
    await this.ctx.storage.put('inv', list.slice(-10));
  }
  async list(): Promise<MInvite[]> {
    const now = Date.now();
    return ((await this.ctx.storage.get<MInvite[]>('inv')) ?? []).filter((i) => now - i.at < INVITE_TTL);
  }
}

/* ============================== rotas ============================== */

/** WebSocket: /api/mundo/room/<CÓDIGO>?id=&name=&skin=&create={json} */
export async function mundoJoin(req: Request, env: Env, code: string): Promise<Response> {
  if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'expected_websocket', message: 'Use WebSocket' }, 426);
  if (!MCODE_RE.test(code)) return json({ error: 'bad_code' }, 400);
  const url = new URL(req.url);
  url.searchParams.set('code', code);
  return env.MUNDO.get(env.MUNDO.idFromName('room:' + code)).fetch(new Request(url.toString(), req));
}

/** POST /api/mundo/invite {id, to, code, name, world} — só entre amigos */
export async function mundoInvite(req: Request, env: Env): Promise<Response> {
  const b = await readJson<{ id?: string; to?: string; code?: string; name?: string; world?: string }>(req);
  const id = String(b.id ?? '');
  const to = String(b.to ?? '');
  const code = String(b.code ?? '');
  if (!PLAYER_ID_RE.test(id) || !PLAYER_ID_RE.test(to) || !MCODE_RE.test(code)) throw new HttpError(400, 'bad_request', 'Dados inválidos');
  if (!(await hub(env).areFriends(id, to))) throw new HttpError(403, 'not_friend', 'Só amigos podem chamar');
  await env.MUNDO.get(env.MUNDO.idFromName('inbox:' + to)).invite({ from: id, name: safeName(cleanName(b.name ?? '')) || 'Bloop', code, world: safeName(cleanName(b.world ?? '')) || 'Mundo', at: Date.now() });
  return json({ ok: true });
}

/** GET /api/mundo/invites?id= */
export async function mundoInvites(req: Request, env: Env): Promise<Response> {
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!PLAYER_ID_RE.test(id)) throw new HttpError(400, 'bad_id', 'id inválido');
  return json({ invites: await env.MUNDO.get(env.MUNDO.idFromName('inbox:' + id)).list() });
}
