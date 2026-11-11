/**
 * DUELO — Durable Object `DuelRoom` (binding DUEL, SQLite, plano grátis). Uma instância por (jogo, código).
 * Serve qualquer jogo solo que vira "todo mundo joga o MESMO desafio ao mesmo tempo" (src/party/duel.ts).
 *
 * O servidor guarda a sala (quem está, pontos, fase) e decide início, fim e pódio — os celulares só jogam.
 * WebSocket com hibernação em /api/duel/<jogo>/<CÓDIGO>?id=&name=&skin=&create=1
 *
 * Protocolo (JSON, campo t):
 *   cliente → {t:'cfg', rank:'score'|'time', limit, n}   (anfitrião) regras: maior pontuação ou menor tempo,
 *                                                         limite em s, quantos o grupo espera
 *             {t:'start'}                                 (anfitrião) contagem 3‑2‑1 e semente nova
 *             {t:'p', s, p, x?}                           pontos, progresso 0..1, fantasma opcional (≤ 8/s)
 *             {t:'fin', s, ms}                            terminou (pontos finais, tempo em ms)
 *             {t:'again'}                                 revanche (volta para a sala; qualquer um pede)
 *             {t:'e', code}                               emote
 *   servidor → {t:'state', now, s:{phase, host, round, seed, at, limit, rank, players:[{id,name,skin,s,p,done,ms,on}]}, you}
 *             {t:'p', id, s, p, x?}   {t:'e', id, code}
 *             {t:'res', ranks:[{id,name,skin,s,ms,done,place}]}
 *             {t:'reject', reason}    bad_code | bad_id | no_room | full | started
 * Limites: 4 jogadores, mensagens ≤ 2 KB, ~12 msg/s por conexão. Fim: todos terminaram ou o tempo acabou (+5 s).
 */
import { DurableObject } from 'cloudflare:workers';
import { hub } from './friends';
import { safeName } from './moderation';
import { cleanName, json, PLAYER_ID_RE } from './util';

export const DUEL_MAX = 4;
export const DUEL_CODE_RE = /^[A-HJ-NP-Z2-9]{5}$/;
export const DUEL_GAME_RE = /^[a-z]{2,12}$/;
const MSG_MAX = 2048;
const PER_S = 12;
const SKIN_RE = /^[a-z0-9_-]{1,24}$/;
const COUNT_MS = 3500;

interface Att {
  id: string;
  name: string;
  skin: string;
}
interface Player {
  id: string;
  name: string;
  skin: string;
  s: number;
  p: number;
  done: boolean;
  ms: number;
  on: boolean;
}
interface Room {
  phase: 'lobby' | 'count' | 'play' | 'done';
  host: string;
  round: number;
  seed: number;
  at: number;
  limit: number;
  rank: 'score' | 'time';
  n: number;
  players: Player[];
  ranks?: Rank[];
}
interface Rank {
  id: string;
  name: string;
  skin: string;
  s: number;
  ms: number;
  done: boolean;
  place: number;
}

const num = (v: unknown, max: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0;
};

export class DuelRoom extends DurableObject<Env> {
  private rate = new Map<WebSocket, { n: number; at: number }>();
  private room: Room | null = null;

  private async load(): Promise<Room | null> {
    if (!this.room) this.room = (await this.ctx.storage.get<Room>('room')) ?? null;
    return this.room;
  }
  private async save(): Promise<void> {
    if (this.room) await this.ctx.storage.put('room', this.room);
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'expected_websocket' }, 426);
    const u = new URL(req.url);
    const code = u.searchParams.get('code') ?? '';
    const id = u.searchParams.get('id') ?? '';
    const create = u.searchParams.get('create') === '1';
    const pair = new WebSocketPair();
    const ws = pair[1];
    this.ctx.acceptWebSocket(ws);
    const fail = (reason: string) => {
      ws.send(JSON.stringify({ t: 'reject', reason }));
      ws.close(1008, reason);
      return new Response(null, { status: 101, webSocket: pair[0] });
    };
    if (!DUEL_CODE_RE.test(code)) return fail('bad_code');
    if (!PLAYER_ID_RE.test(id)) return fail('bad_id');
    const skin = u.searchParams.get('skin') ?? '';
    const a: Att = { id, name: safeName(cleanName(u.searchParams.get('name') ?? '')) || 'Bloop', skin: SKIN_RE.test(skin) ? skin : 'bloop' };
    let r = await this.load();
    const alive = this.members().filter((m) => m.ws !== ws);
    // sala vazia há tempo (todos saíram): recomeça
    if (r && !alive.length) r = null;
    if (!r) {
      if (!create) return fail('no_room');
      r = this.room = { phase: 'lobby', host: id, round: 0, seed: 0, at: 0, limit: 120, rank: 'score', n: 2, players: [] };
    }
    for (const m of alive) if (m.a.id === id) this.drop(m.ws, 'replaced');
    let p = r.players.find((x) => x.id === id);
    if (!p) {
      if (r.phase !== 'lobby' && r.phase !== 'done') return fail('started');
      if (r.players.length >= DUEL_MAX) return fail('full');
      p = { id, name: a.name, skin: a.skin, s: 0, p: 0, done: false, ms: 0, on: true };
      r.players.push(p);
    }
    p.on = true;
    p.name = a.name;
    p.skin = a.skin;
    if (create && !r.players.some((x) => x.id === r!.host && x.on)) r.host = id;
    ws.serializeAttachment(a);
    await this.save();
    this.send(ws, { t: 'state', s: r, you: id, now: Date.now() });
    this.broadcast({ t: 'state', s: r, now: Date.now() }, ws);
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
  private broadcast(data: unknown, except?: WebSocket): void {
    const s = JSON.stringify(data);
    for (const m of this.members()) if (m.ws !== except) this.send(m.ws, s);
  }
  private drop(ws: WebSocket, reason: string): void {
    try {
      ws.serializeAttachment(null);
      ws.close(1000, reason);
    } catch {
      /* */
    }
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    if (typeof data !== 'string' || data.length > MSG_MAX) return;
    const a = ws.deserializeAttachment() as Att | null;
    if (!a) return;
    const now = Date.now();
    const b = this.rate.get(ws) ?? { n: 0, at: now };
    if (now - b.at > 1000) (b.n = 0), (b.at = now);
    if (++b.n > PER_S) return;
    this.rate.set(ws, b);
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(data);
      if (!m || typeof m !== 'object') return;
    } catch {
      return;
    }
    const r = await this.load();
    if (!r) return;
    const me = r.players.find((x) => x.id === a.id);
    if (!me) return;
    const host = r.host === a.id;
    if (m.t === 'cfg' && host && r.phase !== 'play' && r.phase !== 'count') {
      r.rank = m.rank === 'time' ? 'time' : 'score';
      r.limit = Math.round(num(m.limit, 900)) || 120;
      r.n = Math.max(1, Math.min(DUEL_MAX, Math.round(num(m.n, DUEL_MAX)) || 2));
      await this.save();
      this.broadcast({ t: 'state', s: r, now: Date.now() });
    } else if (m.t === 'start' && host && (r.phase === 'lobby' || r.phase === 'done')) {
      r.round++;
      r.seed = (Math.random() * 2 ** 31) | 0;
      r.at = now + COUNT_MS;
      r.phase = 'count';
      delete r.ranks;
      // quem saiu na sala não volta para a rodada
      r.players = r.players.filter((x) => x.on);
      for (const p of r.players) (p.s = 0), (p.p = 0), (p.done = false), (p.ms = 0);
      await this.save();
      await this.ctx.storage.setAlarm(r.at + r.limit * 1000 + 5000);
      this.broadcast({ t: 'state', s: r, now: Date.now() });
      const ids = r.players.map((p) => p.id);
      if (ids.length > 1) this.ctx.waitUntil(hub(this.env).met(ids).catch(() => {}));
    } else if (m.t === 'p' && (r.phase === 'count' || r.phase === 'play') && !me.done) {
      if (r.phase === 'count' && now >= r.at) r.phase = 'play';
      me.s = Math.round(num(m.s, 1e9));
      me.p = num(m.p, 1);
      const out: Record<string, unknown> = { t: 'p', id: a.id, s: me.s, p: me.p };
      if (m.x && typeof m.x === 'object') out.x = m.x;
      this.broadcast(out, ws);
      // progresso não precisa ir para o disco a cada mensagem (o fim manda o valor final)
    } else if (m.t === 'fin' && (r.phase === 'count' || r.phase === 'play') && !me.done) {
      me.s = Math.round(num(m.s, 1e9));
      me.ms = Math.round(num(m.ms, 3_600_000)) || Math.max(1, now - r.at);
      me.p = 1;
      me.done = true;
      r.phase = 'play';
      if (r.players.every((x) => x.done || !x.on)) await this.finish(r);
      else {
        await this.save();
        this.broadcast({ t: 'state', s: r, now: Date.now() });
      }
    } else if (m.t === 'again' && r.phase === 'done') {
      r.phase = 'lobby';
      delete r.ranks;
      for (const p of r.players) (p.s = 0), (p.p = 0), (p.done = false), (p.ms = 0);
      await this.save();
      this.broadcast({ t: 'state', s: r, now: Date.now() });
    } else if (m.t === 'e' && typeof m.code === 'string' && /^[a-z]{1,12}$/.test(m.code)) {
      this.broadcast({ t: 'e', id: a.id, code: m.code }, ws);
    }
  }

  private async finish(r: Room): Promise<void> {
    if (r.phase === 'done') return;
    r.phase = 'done';
    const list = r.players.slice().sort((x, y) => {
      if (x.done !== y.done) return x.done ? -1 : 1;
      if (r.rank === 'time') {
        if (x.done && y.done) return x.ms - y.ms || y.s - x.s;
        return y.p - x.p || y.s - x.s;
      }
      return y.s - x.s || x.ms - y.ms;
    });
    let place = 0;
    let prev: Player | null = null;
    r.ranks = list.map((p, i) => {
      const tie = prev && prev.done === p.done && prev.s === p.s && (r.rank !== 'time' || prev.ms === p.ms);
      if (!tie) place = i + 1;
      prev = p;
      return { id: p.id, name: p.name, skin: p.skin, s: p.s, ms: p.ms, done: p.done, place };
    });
    await this.ctx.storage.deleteAlarm();
    await this.save();
    this.broadcast({ t: 'state', s: r, now: Date.now() });
    this.broadcast({ t: 'res', ranks: r.ranks });
  }

  async alarm(): Promise<void> {
    const r = await this.load();
    if (r && (r.phase === 'play' || r.phase === 'count')) await this.finish(r);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const a = ws.deserializeAttachment() as Att | null;
    if (!a) return;
    ws.serializeAttachment(null);
    this.rate.delete(ws);
    const r = await this.load();
    if (!r) return;
    const still = this.members().some((m) => m.a.id === a.id);
    if (still) return;
    const p = r.players.find((x) => x.id === a.id);
    if (p) p.on = false;
    if (r.phase === 'lobby' || r.phase === 'done') r.players = r.players.filter((x) => x.on);
    const left = this.members();
    if (!left.length) {
      this.room = null;
      await this.ctx.storage.deleteAll();
      return;
    }
    if (r.host === a.id) r.host = (r.players.find((x) => x.on) ?? r.players[0])?.id ?? left[0].a.id;
    if ((r.phase === 'play' || r.phase === 'count') && r.players.every((x) => x.done || !x.on)) await this.finish(r);
    else {
      await this.save();
      this.broadcast({ t: 'state', s: r, now: Date.now() });
    }
  }
  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }
}

/** WebSocket: /api/duel/<jogo>/<CÓDIGO>?id=&name=&skin=&create=1 */
export async function duelJoin(req: Request, env: Env, game: string, code: string): Promise<Response> {
  if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'expected_websocket', message: 'Use WebSocket' }, 426);
  if (!DUEL_CODE_RE.test(code) || !DUEL_GAME_RE.test(game)) return json({ error: 'bad_code' }, 400);
  const url = new URL(req.url);
  url.searchParams.set('code', code);
  return env.DUEL.get(env.DUEL.idFromName(`duel:${game}:${code}`)).fetch(new Request(url.toString(), req));
}
