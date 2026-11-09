/**
 * Corrida Orbital — Durable Object `RaceRoom` (binding RACE, SQLite, funciona no plano grátis).
 *
 * A mesma classe tem dois papéis:
 *  - "lobby" (instância única, idFromName('lobby')): só distribui jogadores em salas
 *    via RPC assign() — agrupa quem chega em até ~4,5 s na mesma sala (máx. 5).
 *  - sala (idFromName('room-…')): recebe os WebSockets, espera jogadores, completa
 *    com bots, sorteia a seed, retransmite a classificação e anuncia o resultado.
 *
 * Nada é gravado no storage: o estado da sala vive na memória enquanto houver conexões.
 */
import { DurableObject } from 'cloudflare:workers';
import { CATALOG_SKINS } from '../shared/catalog';
import {
  botName,
  botSkill,
  compareStanding,
  makeBot,
  maxPlausibleScore,
  mulberry32,
  RACE,
  rewardForPlace,
  stepBot,
  type BotSim,
  type ClientMsg,
  type RacePlayerInfo,
  type RaceResult,
  type ServerMsg,
  type StandingRow,
} from '../shared/race';
import { cleanName, json, PLAYER_ID_RE } from './util';

/** Janela em que o lobby ainda manda gente para a mesma sala (um pouco menor que a espera da sala). */
const ASSIGN_WINDOW_MS = RACE.lobbyWaitMs - 600;
/** Sem mensagens por este tempo durante a corrida = desconectado. */
const IDLE_MS = 6000;

interface Slot {
  slot: number;
  name: string;
  skin: string;
  id: string;
  ws: WebSocket | null;
  debug: boolean;
  bot: BotSim | null;
  score: number;
  p: number;
  alive: boolean;
  tAlive: number;
  last: number;
  left: boolean;
}

type Phase = 'lobby' | 'countdown' | 'race' | 'done';

export class RaceRoom extends DurableObject<Env> {
  // ----- papel de lobby -----
  private open: { name: string; created: number; count: number } | null = null;

  // ----- papel de sala -----
  private phase: Phase = 'lobby';
  private created = 0;
  private slots: Slot[] = [];
  private seed = 0;
  private raceStart = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private tick: ReturnType<typeof setInterval> | null = null;
  private roomName = '';
  private allHumansOutAt = 0;

  /** RPC (lobby): devolve o nome da sala para o próximo jogador. */
  async assign(): Promise<string> {
    const now = Date.now();
    const o = this.open;
    if (o && o.count < RACE.players && now - o.created < ASSIGN_WINDOW_MS) {
      o.count++;
      return o.name;
    }
    const name = `room-${now.toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
    this.open = { name, created: now, count: 1 };
    return name;
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'expected_websocket' }, 426);
    const url = new URL(req.url);
    this.roomName ||= url.searchParams.get('room') ?? 'room';
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();
    this.onSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  /* ---------------- conexões ---------------- */

  private onSocket(ws: WebSocket): void {
    let me: Slot | null = null;
    const hello = setTimeout(() => {
      if (!me) this.close(ws, 'no_hello');
    }, 8000);
    ws.addEventListener('message', (ev) => {
      let msg: ClientMsg;
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data as ArrayBuffer));
      } catch {
        return;
      }
      if (!me) {
        if (msg.type !== 'hello') return;
        clearTimeout(hello);
        me = this.join(ws, msg);
        return;
      }
      if (msg.type === 'state') this.onState(me, msg);
      else if (msg.type === 'leave') this.drop(me);
    });
    const gone = () => {
      clearTimeout(hello);
      if (me) this.drop(me);
    };
    ws.addEventListener('close', gone);
    ws.addEventListener('error', gone);
  }

  private join(ws: WebSocket, msg: Extract<ClientMsg, { type: 'hello' }>): Slot | null {
    const humans = this.slots.filter((s) => !s.bot && !s.left).length;
    if (this.phase !== 'lobby' || this.slots.length >= RACE.players || humans >= RACE.players) {
      this.close(ws, this.phase === 'lobby' ? 'full' : 'started');
      return null;
    }
    const id = PLAYER_ID_RE.test(String(msg.id)) ? String(msg.id) : '';
    // mesmo jogador abrindo duas abas: só a mais nova vale
    if (id) for (const s of this.slots) if (s.id === id && !s.bot) this.drop(s);
    const used = new Set(this.slots.map((s) => s.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    const s: Slot = {
      slot,
      name: cleanName(msg.name) || 'Bloop',
      skin: validSkin(msg.skin) ? msg.skin : 'bloop',
      id,
      ws,
      debug: !!msg.debug,
      bot: null,
      score: 0,
      p: 0,
      alive: true,
      tAlive: 0,
      last: Date.now(),
      left: false,
    };
    this.slots.push(s);
    if (!this.created) {
      this.created = Date.now();
      this.later(RACE.lobbyWaitMs, () => this.fillAndStart());
    }
    this.send(s, { type: 'welcome', you: slot, room: this.roomName });
    this.broadcastLobby();
    if (this.slots.length >= RACE.players) this.later(700, () => this.startCountdown());
    return s;
  }

  private drop(s: Slot): void {
    if (s.left) return;
    s.left = true;
    const ws = s.ws;
    s.ws = null;
    if (ws) this.close(ws, 'bye');
    if (this.phase === 'lobby') {
      this.slots = this.slots.filter((x) => x !== s);
      if (!this.slots.some((x) => !x.bot)) this.reset();
      else this.broadcastLobby();
    } else if (this.phase === 'countdown' || this.phase === 'race') {
      if (s.alive) {
        s.alive = false;
        s.tAlive = this.elapsed();
      }
    }
  }

  private onState(s: Slot, m: Extract<ClientMsg, { type: 'state' }>): void {
    s.last = Date.now();
    if (this.phase !== 'race' || !s.alive) return;
    const t = this.elapsed();
    const score = Math.max(s.score, Math.min(Math.floor(Number(m.score) || 0), maxPlausibleScore(t)));
    s.score = score;
    s.p = Math.max(0, Math.min(100_000, Math.floor(Number(m.p) || 0)));
    s.tAlive = t;
    if (m.alive === false) s.alive = false;
  }

  /* ---------------- fases ---------------- */

  private fillAndStart(): void {
    if (this.phase !== 'lobby' || !this.slots.length) return;
    const r = mulberry32((Date.now() ^ (Math.random() * 1e9)) >>> 0);
    const taken = new Set(this.slots.map((s) => s.name));
    let delay = 0;
    const missing = RACE.players - this.slots.length;
    for (let i = 0; i < missing; i++) {
      delay += 250 + r() * 450;
      this.later(delay, () => {
        if (this.phase !== 'lobby' || this.slots.length >= RACE.players) return;
        const used = new Set(this.slots.map((s) => s.slot));
        let slot = 0;
        while (used.has(slot)) slot++;
        const skin = CATALOG_SKINS[weightedSkinIndex(r)]?.id ?? 'bloop';
        this.slots.push({
          slot,
          name: botName(r, taken),
          skin,
          id: '',
          ws: null,
          debug: false,
          bot: makeBot(Math.floor(r() * 2 ** 32), botSkill(r)),
          score: 0,
          p: 0,
          alive: true,
          tAlive: 0,
          last: Date.now(),
          left: false,
        });
        this.broadcastLobby();
      });
    }
    this.later(delay + 600, () => this.startCountdown());
  }

  private startCountdown(): void {
    if (this.phase !== 'lobby') return;
    if (this.slots.length < RACE.players) return void this.fillAndStart();
    this.phase = 'countdown';
    this.seed = (Math.random() * 2 ** 32) >>> 0;
    this.slots.sort((a, b) => a.slot - b.slot);
    for (const s of this.slots) {
      if (!s.ws) continue;
      this.send(s, { type: 'start', seed: this.seed, countdownMs: RACE.countdownMs, durationSec: RACE.durationSec, players: this.playerList(s.debug), you: s.slot });
    }
    this.raceStart = Date.now() + RACE.countdownMs;
    this.later(RACE.countdownMs, () => {
      this.phase = 'race';
      for (const s of this.slots) s.last = Date.now();
      this.tick = setInterval(() => this.onTick(), RACE.tickMs);
    });
  }

  private elapsed(): number {
    return this.raceStart ? Math.max(0, (Date.now() - this.raceStart) / 1000) : 0;
  }

  private onTick(): void {
    if (this.phase !== 'race') return;
    const t = Math.min(RACE.durationSec, this.elapsed());
    const now = Date.now();
    for (const s of this.slots) {
      if (s.bot) {
        stepBot(s.bot, t);
        s.score = s.bot.score;
        s.p = s.bot.p;
        s.alive = s.bot.alive;
        s.tAlive = s.bot.tAlive;
      } else if (s.alive && now - s.last > IDLE_MS) {
        s.alive = false; // sem sinal: conta como queda
      }
    }
    const rows: StandingRow[] = this.slots.map((s) => [s.slot, s.score, s.p, s.alive ? 1 : 0, Math.round(s.tAlive * 10)]);
    this.broadcast({ type: 'tick', t: Math.round(t * 10) / 10, s: rows });

    const anyAlive = this.slots.some((s) => s.alive);
    const humansIn = this.slots.some((s) => !s.bot && s.alive && !s.left);
    if (!humansIn && anyAlive) {
      // todos os humanos caíram: espera um pouquinho e "adianta" os bots até o fim
      if (!this.allHumansOutAt) this.allHumansOutAt = now;
      if (now - this.allHumansOutAt > 1800) return this.end(RACE.durationSec);
    }
    if (t >= RACE.durationSec || !anyAlive) this.end(t);
  }

  private end(t: number): void {
    if (this.phase === 'done') return;
    this.phase = 'done';
    if (this.tick) clearInterval(this.tick);
    this.tick = null;
    for (const s of this.slots) {
      if (!s.bot) continue;
      stepBot(s.bot, t);
      s.score = s.bot.score;
      s.alive = s.bot.alive;
      s.tAlive = s.bot.tAlive;
    }
    const order = [...this.slots].sort(compareStanding);
    const results = (debug: boolean): RaceResult[] =>
      order.map((s, i) => {
        const rw = rewardForPlace(i + 1);
        return { slot: s.slot, name: s.name, skin: s.skin, score: s.score, tAlive: Math.round(s.tAlive * 10) / 10, place: i + 1, coins: rw.coins, gems: rw.gems, ...(debug && s.bot ? { bot: true } : {}) };
      });
    for (const s of this.slots) if (s.ws) this.send(s, { type: 'end', results: results(s.debug) });
    // fecha as conexões logo depois (o cliente já tem o resultado)
    this.later(1500, () => {
      for (const s of this.slots) if (s.ws) this.close(s.ws, 'done');
      this.reset();
    });
  }

  private reset(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    if (this.tick) clearInterval(this.tick);
    this.tick = null;
    this.slots = [];
    this.phase = 'done'; // sala é de uso único
  }

  /* ---------------- envio ---------------- */

  private playerList(debug: boolean): RacePlayerInfo[] {
    return [...this.slots].sort((a, b) => a.slot - b.slot).map((s) => ({ slot: s.slot, name: s.name, skin: s.skin, ...(debug && s.bot ? { bot: true } : {}) }));
  }

  private broadcastLobby(): void {
    const startsInMs = Math.max(0, this.created + RACE.lobbyWaitMs - Date.now());
    for (const s of this.slots) if (s.ws) this.send(s, { type: 'lobby', players: this.playerList(s.debug), startsInMs });
  }

  private broadcast(msg: ServerMsg): void {
    const data = JSON.stringify(msg);
    for (const s of this.slots) {
      if (!s.ws) continue;
      try {
        s.ws.send(data);
      } catch {
        this.drop(s);
      }
    }
  }

  private send(s: Slot, msg: ServerMsg): void {
    try {
      s.ws?.send(JSON.stringify(msg));
    } catch {
      /* fechado */
    }
  }

  private close(ws: WebSocket, reason: string): void {
    try {
      if (reason !== 'bye' && reason !== 'done') ws.send(JSON.stringify({ type: 'error', code: reason } satisfies ServerMsg));
      ws.close(1000, reason);
    } catch {
      /* já fechado */
    }
  }

  private later(ms: number, fn: () => void): void {
    this.timers.push(setTimeout(fn, ms));
  }
}

const SKIN_IDS = new Set(CATALOG_SKINS.map((s) => s.id));
const validSkin = (id: unknown): id is string => typeof id === 'string' && SKIN_IDS.has(id);

/** Bots preferem skins comuns/raras (parecem jogadores normais), às vezes uma lendária. */
function weightedSkinIndex(r: () => number): number {
  const W: Record<string, number> = { common: 6, rare: 4, epic: 2, legendary: 1, mythic: 0.4 };
  const total = CATALOG_SKINS.reduce((s, k) => s + (W[k.rarity ?? 'common'] ?? 1), 0);
  let x = r() * total;
  for (let i = 0; i < CATALOG_SKINS.length; i++) {
    x -= W[CATALOG_SKINS[i].rarity ?? 'common'] ?? 1;
    if (x <= 0) return i;
  }
  return 0;
}

/** GET /api/race/join (WebSocket) → lobby escolhe a sala → sala recebe o socket. */
export async function raceJoin(req: Request, env: Env): Promise<Response> {
  if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'expected_websocket', message: 'Use WebSocket' }, 426);
  if (!env.RACE) return json({ error: 'unavailable' }, 503);
  const lobby = env.RACE.get(env.RACE.idFromName('lobby'));
  const room = await lobby.assign();
  const url = new URL(req.url);
  url.searchParams.set('room', room);
  return env.RACE.get(env.RACE.idFromName(room)).fetch(new Request(url.toString(), req));
}
