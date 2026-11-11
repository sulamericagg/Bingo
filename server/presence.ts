/**
 * Presença "drop-in" — Durable Object `PresenceRoom` (binding PRESENCE, SQLite, plano grátis).
 *
 * Papéis da mesma classe:
 *  - lobby do jogo  (idFromName('lobby:<gameId>')): RPC assign() escolhe o shard com vaga (máx. 6).
 *  - shard          (idFromName('<gameId>:<n>')):   recebe os WebSockets (com hibernação) e
 *                    só RETRANSMITE: estado (~5 Hz, limitado a 8 Hz por cliente), emotes, entrada/saída.
 * Bots NÃO rodam no servidor: o cliente (src/services/presence.ts) cria bots locais quando está sozinho.
 *
 * Protocolo:
 *   cliente → {type:'hello', id, name, skin, avatar?}  {type:'s', s:{...números}}  {type:'e', code}
 *   servidor → {type:'welcome', you, peers:[{id,name,skin,avatar?,s}]}
 *              {type:'join', p}  {type:'leave', id}  {type:'s', id, s}  {type:'e', id, code}
 */
import { DurableObject } from 'cloudflare:workers';
import { cleanName, json, PLAYER_ID_RE } from './util';
import { safeName } from './moderation';

export const SHARD_SIZE = 6;
const HARD_MAX = 8;
const MIN_STATE_MS = 120;
const MAX_KEYS = 16;
export const EMOTE_CODES = ['joinha', 'vamos', 'uau', 'oi', 'gg', 'rindo', 'coracao', 'boa'];
export const GAME_RE = /^[a-z0-9-]{1,24}$/;

interface Att {
  id: string;
  name: string;
  skin: string;
  avatar?: unknown;
}

export class PresenceRoom extends DurableObject<Env> {
  /* lobby */
  private counts = new Map<number, { n: number; at: number }>();
  /* shard (memória; some ao hibernar — o próximo estado repõe) */
  private states = new Map<string, Record<string, number>>();
  private lastState = new Map<string, number>();
  private gameId = '';
  private shard = -1;

  /** RPC (lobby): shard com vaga. Contagens provisórias expiram em 20 s. */
  async assign(): Promise<number> {
    const now = Date.now();
    for (let i = 0; i < 1000; i++) {
      const c = this.counts.get(i);
      const n = c ? c.n : 0;
      if (n < SHARD_SIZE) {
        this.counts.set(i, { n: n + 1, at: now });
        return i;
      }
      if (c && now - c.at > 20_000) {
        this.counts.set(i, { n: 1, at: now });
        return i;
      }
    }
    return 0;
  }

  /** RPC (lobby): o shard informa quantos estão conectados de verdade. */
  async report(shard: number, n: number): Promise<void> {
    if (n <= 0) this.counts.delete(shard);
    else this.counts.set(shard, { n, at: Date.now() });
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'expected_websocket' }, 426);
    const url = new URL(req.url);
    this.gameId = url.searchParams.get('game') ?? this.gameId;
    this.shard = Number(url.searchParams.get('shard') ?? this.shard);
    await this.ctx.storage.put('meta', { game: this.gameId, shard: this.shard });
    if (this.members().length >= HARD_MAX) return json({ error: 'full' }, 503);
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
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

  private sendOthers(except: WebSocket | null, data: string): void {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except || !ws.deserializeAttachment()) continue;
      try {
        ws.send(data);
      } catch {
        /* */
      }
    }
  }

  private async reportCount(): Promise<void> {
    if (this.shard < 0 && this.gameId) return; // sala de grupo: fora do lobby
    if (!this.gameId) {
      const meta = await this.ctx.storage.get<{ game: string; shard: number }>('meta');
      if (!meta) return;
      this.gameId = meta.game;
      this.shard = meta.shard;
      if (this.shard < 0) return;
    }
    const lobby = this.env.PRESENCE.get(this.env.PRESENCE.idFromName('lobby:' + this.gameId));
    await lobby.report(this.shard, this.members().length).catch(() => {});
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    if (typeof data !== 'string' || data.length > 2048) return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(data);
      if (!msg || typeof msg !== 'object') return;
    } catch {
      return;
    }
    const a = ws.deserializeAttachment() as Att | null;
    if (!a) {
      if (msg.type !== 'hello') return;
      const id = String(msg.id ?? '');
      if (!PLAYER_ID_RE.test(id)) return ws.close(1008, 'bad_id');
      // mesma pessoa em duas abas: derruba a antiga
      for (const m of this.members()) if (m.a.id === id) this.drop(m.ws, m.a);
      let avatar: unknown;
      try {
        if (msg.avatar && JSON.stringify(msg.avatar).length <= 1200) avatar = msg.avatar;
      } catch {
        /* */
      }
      const me: Att = { id, name: safeName(cleanName(msg.name) || 'Bloop'), skin: String(msg.skin ?? 'bloop').slice(0, 24), ...(avatar ? { avatar } : {}) };
      ws.serializeAttachment(me);
      const peers = this.members()
        .filter((m) => m.ws !== ws)
        .map((m) => ({ ...m.a, s: this.states.get(m.a.id) ?? {} }));
      ws.send(JSON.stringify({ type: 'welcome', you: id, peers }));
      this.sendOthers(ws, JSON.stringify({ type: 'join', p: { ...me, s: {} } }));
      await this.reportCount();
      // amizades: "jogaram juntos" (permite pedir amizade pelo id) + online
      const fh = this.env.FRIENDS.get(this.env.FRIENDS.idFromName('hub'));
      await fh.touch(id).catch(() => {});
      if (peers.length) await fh.met([id, ...peers.map((p) => p.id)]).catch(() => {});
      return;
    }
    if (msg.type === 's') {
      const now = Date.now();
      if (now - (this.lastState.get(a.id) ?? 0) < MIN_STATE_MS) return;
      this.lastState.set(a.id, now);
      const src = msg.s as Record<string, unknown>;
      if (!src || typeof src !== 'object') return;
      const s: Record<string, number> = {};
      let k = 0;
      for (const key in src) {
        if (++k > MAX_KEYS || key.length > 12) break;
        const v = Number(src[key]);
        if (Number.isFinite(v)) s[key] = Math.round(v * 100) / 100;
      }
      this.states.set(a.id, s);
      this.sendOthers(ws, JSON.stringify({ type: 's', id: a.id, s }));
    } else if (msg.type === 'e') {
      const code = String(msg.code ?? '');
      if (EMOTE_CODES.includes(code)) this.sendOthers(ws, JSON.stringify({ type: 'e', id: a.id, code }));
    }
  }

  private drop(ws: WebSocket, a: Att): void {
    ws.serializeAttachment(null);
    this.states.delete(a.id);
    this.lastState.delete(a.id);
    try {
      ws.close(1000, 'bye');
    } catch {
      /* */
    }
    this.sendOthers(ws, JSON.stringify({ type: 'leave', id: a.id }));
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const a = ws.deserializeAttachment() as Att | null;
    if (a) this.drop(ws, a);
    await this.reportCount();
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }
}

/** GET /api/presence/<gameId> (WebSocket) → lobby escolhe o shard → shard recebe o socket. */
export async function presenceJoin(req: Request, env: Env, gameId: string): Promise<Response> {
  if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'expected_websocket', message: 'Use WebSocket' }, 426);
  if (!GAME_RE.test(gameId)) return json({ error: 'bad_game' }, 400);
  const url = new URL(req.url);
  // grupo jogando junto (docs/PARTY.md): sala própria do grupo, sem passar pelo lobby
  const party = url.searchParams.get('party') ?? '';
  if (/^[a-z0-9-]{4,48}$/.test(party)) {
    url.searchParams.set('game', gameId);
    url.searchParams.set('shard', '-1');
    return env.PRESENCE.get(env.PRESENCE.idFromName(`${gameId}:party:${party}`)).fetch(new Request(url.toString(), req));
  }
  const lobby = env.PRESENCE.get(env.PRESENCE.idFromName('lobby:' + gameId));
  const shard = await lobby.assign();
  url.searchParams.set('game', gameId);
  url.searchParams.set('shard', String(shard));
  return env.PRESENCE.get(env.PRESENCE.idFromName(`${gameId}:${shard}`)).fetch(new Request(url.toString(), req));
}
