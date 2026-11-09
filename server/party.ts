/**
 * FESTA — Durable Object `PartyRoom` (binding PARTY, SQLite, plano grátis). Uma instância por anfitrião
 * (idFromName(hostId)). WebSocket com hibernação em /api/party/<hostId>.
 *
 * Quem entra: o dono, ou amigos (verificado no FriendsHub). Se o dono não está na festa, amigos só
 * entram se a casa estiver aberta para visitas (`visitsOpen`, padrão true). Máx. 8 pessoas.
 * Bots: só no cliente (botsIfAlone), o servidor não simula.
 *
 * Protocolo (JSON):
 *   cliente → {type:'hello', id, name, handle?, skin, avatar?}
 *             {type:'s', s:{x,y,room,holding?,emote?}}          (estado, até 8 Hz)
 *             {type:'ev', e: PartyEvent}                          (throw/splat/clean/eat/cake/chat)
 *   servidor → {type:'welcome', you, host, hostHere, peers: PartyPeer[], mess: MessItem[]}
 *              {type:'join', p} {type:'leave', id} {type:'s', id, s} {type:'ev', e}
 *              {type:'reject', reason}  (not_friend | closed | full | bad_id)
 *
 * Sujeira: este DO é a fonte da verdade durante a festa (splat adiciona, clean remove). Grava no
 * armazenamento do DO a cada ~5 s (barato) e no KV no fim da festa ou no máx. a cada 60 s.
 * Chat: SÓ códigos de atalho (PARTY_CODES), nada de texto livre.
 */
import { DurableObject } from 'cloudflare:workers';
import { hub } from './friends';
import { cleanMess, loadHome, loadMess, MESS_MAX, saveMess, type MessItem } from './home';
import { safeName } from './moderation';
import { cleanName, json, PLAYER_ID_RE } from './util';

export const PARTY_MAX = 8;
const MIN_STATE_MS = 110;
const EV_BURST = 12;
const EV_PER_S = 8;
const LOCAL_SAVE_MS = 5000;
const KV_SAVE_MS = 60_000;
export const PARTY_CODES = [
  'oi', 'boa', 'gg', 'vamos', 'uau', 'joinha', 'rindo', 'coracao', 'obrigado', 'denovo', 'quase', 'tchau',
  'festa', 'bolo', 'parabens', 'limpar', 'yum', 'splat', 'ajuda', 'vem', 'olha', 'danca', 'surpresa', 'desculpa',
];
const TOKEN_RE = /^[a-z0-9_-]{1,24}$/;

interface Att {
  id: string;
  name: string;
  handle: string;
  skin: string;
  avatar?: unknown;
}
interface Stored {
  mess: MessItem[];
  at: number;
  kvDirty: boolean;
  lastKv: number;
}

export class PartyRoom extends DurableObject<Env> {
  private host = '';
  private st: Stored | null = null;
  private pos = new Map<string, Record<string, unknown>>();
  private lastState = new Map<string, number>();
  private bucket = new Map<string, { n: number; at: number }>();

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'expected_websocket' }, 426);
    const host = new URL(req.url).searchParams.get('host') ?? '';
    if (!PLAYER_ID_RE.test(host)) return json({ error: 'bad_host' }, 400);
    await this.setHost(host);
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  private async setHost(h: string): Promise<void> {
    if (this.host === h) return;
    this.host = h;
    await this.ctx.storage.put('host', h);
  }
  private async getHost(): Promise<string> {
    if (!this.host) this.host = (await this.ctx.storage.get<string>('host')) ?? '';
    return this.host;
  }

  /** Sujeira atual: a mais nova entre o armazenamento do DO e o KV. */
  private async state(): Promise<Stored> {
    if (this.st) return this.st;
    const local = await this.ctx.storage.get<Stored>('mess');
    const host = await this.getHost();
    const kv = host ? await loadMess(this.env, host) : { mess: [], updatedAt: 0 };
    this.st = local && (local.kvDirty || local.at >= kv.updatedAt) ? local : { mess: kv.mess, at: kv.updatedAt, kvDirty: false, lastKv: local?.lastKv ?? 0 };
    return this.st;
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
  private reject(ws: WebSocket, reason: string): void {
    this.send(ws, { type: 'reject', reason });
    try {
      ws.close(1008, reason);
    } catch {
      /* */
    }
  }

  private peerOut(a: Att): Record<string, unknown> {
    const p = this.pos.get(a.id) ?? {};
    return { x: 0, y: 0, room: '', ...p, id: a.id, name: a.name, handle: a.handle, skin: a.skin, ...(a.avatar ? { avatar: a.avatar } : {}) };
  }

  /* ---------------- sujeira: gravação econômica ---------------- */

  private async dirty(): Promise<void> {
    const s = await this.state();
    s.kvDirty = true;
    s.at = Date.now();
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + LOCAL_SAVE_MS);
  }

  private async flush(forceKv: boolean): Promise<void> {
    const s = await this.state();
    const now = Date.now();
    if (s.kvDirty && (forceKv || now - s.lastKv >= KV_SAVE_MS)) {
      const host = await this.getHost();
      if (host) {
        s.at = await saveMess(this.env, host, s.mess);
        s.lastKv = now;
        s.kvDirty = false;
      }
    }
    await this.ctx.storage.put('mess', s);
    if (s.kvDirty) await this.ctx.storage.setAlarm(Math.min(now + LOCAL_SAVE_MS, s.lastKv + KV_SAVE_MS));
  }

  async alarm(): Promise<void> {
    await this.flush(this.members().length === 0);
  }

  /* ---------------- WebSocket ---------------- */

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    if (typeof data !== 'string' || data.length > 4096) return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(data);
      if (!msg || typeof msg !== 'object') return;
    } catch {
      return;
    }
    const a = ws.deserializeAttachment() as Att | null;
    if (!a) {
      if (msg.type === 'hello') await this.hello(ws, msg);
      return;
    }
    if (msg.type === 's') this.onState(ws, a, msg.s);
    else if (msg.type === 'ev') await this.onEvent(ws, a, msg.e);
  }

  private async hello(ws: WebSocket, msg: Record<string, unknown>): Promise<void> {
    const id = String(msg.id ?? '');
    if (!PLAYER_ID_RE.test(id)) return this.reject(ws, 'bad_id');
    const host = await this.getHost();
    const others = this.members().filter((m) => m.a.id !== id);
    if (id !== host) {
      if (!(await hub(this.env).areFriends(host, id))) return this.reject(ws, 'not_friend');
      if (!others.some((m) => m.a.id === host)) {
        const home = await loadHome(this.env, host);
        if (home && home.visitsOpen === false) return this.reject(ws, 'closed');
      }
    }
    if (others.length >= PARTY_MAX) return this.reject(ws, 'full');
    for (const m of this.members()) if (m.a.id === id && m.ws !== ws) this.drop(m.ws, m.a, false);
    let avatar: unknown;
    try {
      if (msg.avatar && JSON.stringify(msg.avatar).length <= 1200) avatar = msg.avatar;
    } catch {
      /* */
    }
    const handle = String(msg.handle ?? '').toLowerCase();
    const me: Att = {
      id,
      name: safeName(cleanName(msg.name) || 'Bloop'),
      handle: /^[a-z0-9_.]{3,16}$/.test(handle) ? handle : '',
      skin: String(msg.skin ?? 'bloop').slice(0, 24),
      ...(avatar ? { avatar } : {}),
    };
    ws.serializeAttachment(me);
    const s = await this.state();
    const peers = this.members().filter((m) => m.ws !== ws);
    this.send(ws, { type: 'welcome', you: id, host, hostHere: id === host || peers.some((m) => m.a.id === host), peers: peers.map((m) => this.peerOut(m.a)), mess: s.mess });
    this.broadcast({ type: 'join', p: this.peerOut(me) }, ws);
    const h = hub(this.env);
    await h.touch(id).catch(() => {});
    if (peers.length) await h.met([id, ...peers.map((m) => m.a.id)]).catch(() => {});
  }

  private onState(ws: WebSocket, a: Att, src: unknown): void {
    const now = Date.now();
    if (now - (this.lastState.get(a.id) ?? 0) < MIN_STATE_MS || !src || typeof src !== 'object') return;
    this.lastState.set(a.id, now);
    const o = src as Record<string, unknown>;
    const s: Record<string, unknown> = {};
    for (const k of ['x', 'y']) {
      const v = Number(o[k]);
      if (Number.isFinite(v)) s[k] = Math.round(v * 100) / 100;
    }
    if (typeof o.room === 'string' && o.room.length <= 32) s.room = o.room;
    if (o.holding === null || o.holding === '' || (typeof o.holding === 'string' && TOKEN_RE.test(o.holding))) s.holding = o.holding || undefined;
    if (typeof o.emote === 'string' && PARTY_CODES.includes(o.emote)) s.emote = o.emote;
    this.pos.set(a.id, { ...(this.pos.get(a.id) ?? {}), ...s });
    this.broadcast({ type: 's', id: a.id, s }, ws);
  }

  private allow(id: string): boolean {
    const now = Date.now();
    const b = this.bucket.get(id) ?? { n: EV_BURST, at: now };
    b.n = Math.min(EV_BURST, b.n + ((now - b.at) / 1000) * EV_PER_S);
    b.at = now;
    this.bucket.set(id, b);
    if (b.n < 1) return false;
    b.n -= 1;
    return true;
  }

  private async onEvent(ws: WebSocket, a: Att, raw: unknown): Promise<void> {
    if (!raw || typeof raw !== 'object' || !this.allow(a.id)) return;
    const e = raw as Record<string, unknown>;
    const num = (v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
    };
    const food = typeof e.food === 'string' && TOKEN_RE.test(e.food) ? e.food : '';
    switch (e.t) {
      case 'throw':
        if (food) this.broadcast({ type: 'ev', e: { t: 'throw', from: a.id, food, x: num(e.x), y: num(e.y), vx: num(e.vx), vy: num(e.vy) } }, ws);
        return;
      case 'eat':
        if (food) this.broadcast({ type: 'ev', e: { t: 'eat', by: a.id, food } }, ws);
        return;
      case 'cake':
        this.broadcast({ type: 'ev', e: { t: 'cake', slices: Math.max(0, Math.min(64, Math.floor(num(e.slices)))) } }, ws);
        return;
      case 'chat': {
        const code = String(e.code ?? '');
        if (PARTY_CODES.includes(code)) this.broadcast({ type: 'ev', e: { t: 'chat', by: a.id, code } }, ws);
        return;
      }
      case 'splat': {
        const m = cleanMess(e.mess);
        const s = await this.state();
        if (!m || s.mess.length >= MESS_MAX || s.mess.some((x) => x.id === m.id)) return;
        s.mess.push(m);
        await this.dirty();
        this.broadcast({ type: 'ev', e: { t: 'splat', mess: m } }, ws);
        return;
      }
      case 'clean': {
        const id = String(e.messId ?? '');
        const s = await this.state();
        const i = s.mess.findIndex((x) => x.id === id);
        if (i < 0) return;
        s.mess.splice(i, 1);
        await this.dirty();
        this.broadcast({ type: 'ev', e: { t: 'clean', messId: id, by: a.id } }, ws);
        return;
      }
    }
  }

  private drop(ws: WebSocket, a: Att, notify = true): void {
    ws.serializeAttachment(null);
    this.pos.delete(a.id);
    this.lastState.delete(a.id);
    this.bucket.delete(a.id);
    try {
      ws.close(1000, 'bye');
    } catch {
      /* */
    }
    if (notify) this.broadcast({ type: 'leave', id: a.id }, ws);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const a = ws.deserializeAttachment() as Att | null;
    if (a) this.drop(ws, a);
    // fim da festa: grava a sujeira no KV agora
    if (this.members().length) return;
    if (!this.st) this.st = (await this.ctx.storage.get<Stored>('mess')) ?? null;
    if (this.st?.kvDirty) await this.flush(true);
    // sem ninguém: esquece o cache (o dono pode limpar pelo REST até a próxima festa)
    this.st = null;
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  /* ---------------- RPC ---------------- */

  /**
   * PUT /api/home/mess durante a festa. null = não há festa (o chamador grava direto no KV).
   * Dono: substitui. Membro da festa: remove e adiciona. Amigo fora da festa: só remove.
   */
  async applyMess(id: string, next: MessItem[]): Promise<{ ok: boolean; error?: string; count?: number } | null> {
    const mem = this.members();
    if (!mem.length) return null;
    const host = await this.getHost();
    const s = await this.state();
    const isMember = mem.some((m) => m.a.id === id);
    const cur = new Map(s.mess.map((m) => [m.id, m]));
    const added = next.filter((m) => !cur.has(m.id));
    if (added.length && id !== host && !isMember) return { ok: false, error: 'not_in_party' };
    const keep = new Set(next.map((m) => m.id));
    const removed = s.mess.filter((m) => !keep.has(m.id));
    s.mess = [...s.mess.filter((m) => keep.has(m.id)), ...added].slice(0, MESS_MAX);
    for (const m of removed) this.broadcast({ type: 'ev', e: { t: 'clean', messId: m.id, by: id } });
    for (const m of added) this.broadcast({ type: 'ev', e: { t: 'splat', mess: m } });
    if (removed.length || added.length) await this.dirty();
    return { ok: true, count: s.mess.length };
  }

  /** Admin: limpa tudo (se houver festa, avisa os clientes). */
  async clearMess(host: string): Promise<void> {
    await this.setHost(host);
    const s = await this.state();
    for (const m of s.mess) this.broadcast({ type: 'ev', e: { t: 'clean', messId: m.id, by: 'admin' } });
    s.mess = [];
    s.kvDirty = false;
    s.at = Date.now();
    s.lastKv = Date.now();
    await this.ctx.storage.put('mess', s);
    if (!this.members().length) this.st = null;
  }

  async info(): Promise<{ members: string[]; mess: number }> {
    return { members: this.members().map((m) => m.a.id), mess: this.st?.mess.length ?? 0 };
  }
}

/** GET /api/party/<hostId> (WebSocket) */
export async function partyJoin(req: Request, env: Env, hostId: string): Promise<Response> {
  if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'expected_websocket', message: 'Use WebSocket' }, 426);
  if (!PLAYER_ID_RE.test(hostId)) return json({ error: 'bad_host' }, 400);
  const url = new URL(req.url);
  url.searchParams.set('host', hostId);
  return env.PARTY.get(env.PARTY.idFromName(hostId)).fetch(new Request(url.toString(), req));
}
