/**
 * Corrida Orbital — conexão com o servidor (WebSocket → Durable Object RaceRoom).
 *
 * Sempre funciona: se o WebSocket não conectar (offline, servidor sem a rota,
 * `vite dev`/`vite preview`), a corrida acontece LOCALMENTE com 4 bots simulados
 * pelo mesmo modelo do servidor (shared/race.ts). Se a conexão cair no meio da
 * corrida, os adversários passam a ser simulados localmente a partir de onde estavam.
 *
 * Sem interface: src/ui/race.ts usa os callbacks abaixo.
 */
import { SKINS } from '../game/skins';
import {
  botName,
  botSkill,
  compareStanding,
  makeBot,
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
} from '../../shared/race';
import { apiBase } from './leaderboard';

export type { RacePlayerInfo, RaceResult, StandingRow } from '../../shared/race';
export { RACE, rewardForPlace } from '../../shared/race';

export interface RaceStart {
  seed: number;
  countdownMs: number;
  durationSec: number;
  players: RacePlayerInfo[];
  you: number;
}

export interface RaceHandlers {
  /** sala de espera: jogadores já na sala e tempo até completar com bots */
  onLobby(players: RacePlayerInfo[], startsInMs: number): void;
  onStart(s: RaceStart): void;
  /** classificação ao vivo (t = s desde a largada) */
  onTick(t: number, rows: StandingRow[]): void;
  onEnd(results: RaceResult[]): void;
  /** mudou de online → local (apenas informativo) */
  onMode?(online: boolean): void;
}

export interface RaceMe {
  id: string;
  name: string;
  skin: string;
  debug?: boolean;
}

const CONNECT_TIMEOUT_MS = 4000;

function wsUrl(): string {
  const base = apiBase() || location.origin;
  return base.replace(/^http/, 'ws') + '/api/race/join';
}

export class RaceSession {
  online = false;
  private ws: WebSocket | null = null;
  private phase: 'connect' | 'lobby' | 'countdown' | 'race' | 'done' = 'connect';
  private you = 0;
  private players: RacePlayerInfo[] = [];
  private last: StandingRow[] = [];
  private my = { score: 0, p: 0, alive: true };
  private retries = 0;
  private timers: number[] = [];
  // modo local
  private local: { bots: Map<number, BotSim>; start: number; durationSec: number; meDeadAt: number; tick: number } | null = null;

  constructor(
    private me: RaceMe,
    private h: RaceHandlers,
  ) {
    this.connect();
  }

  /* ---------------- API usada pela UI ---------------- */

  /** Progresso do jogador local (~6x por segundo). */
  sendState(score: number, p: number, alive: boolean): void {
    this.my = { score, p, alive };
    if (this.online && this.ws?.readyState === WebSocket.OPEN && (this.phase === 'race' || this.phase === 'countdown')) {
      this.send({ type: 'state', score, p, alive });
    }
  }

  /** Sai da sala (cancelar na espera ou desistir). */
  leave(): void {
    this.phase = 'done';
    this.clearTimers();
    if (this.local) clearInterval(this.local.tick);
    this.local = null;
    if (this.ws) {
      try {
        this.send({ type: 'leave' });
        this.ws.close(1000, 'leave');
      } catch {
        /* ignora */
      }
    }
    this.ws = null;
  }

  /* ---------------- online ---------------- */

  private connect(): void {
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl());
    } catch {
      return this.goLocal();
    }
    this.ws = ws;
    let welcomed = false;
    const timer = window.setTimeout(() => {
      if (!welcomed && this.ws === ws) {
        this.ws = null;
        try {
          ws.close();
        } catch {
          /* ignora */
        }
        this.goLocal();
      }
    }, CONNECT_TIMEOUT_MS);
    this.timers.push(timer);
    ws.onopen = () => this.send({ type: 'hello', id: this.me.id, name: this.me.name, skin: this.me.skin, debug: this.me.debug });
    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      let m: ServerMsg;
      try {
        m = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (m.type === 'welcome') {
        welcomed = true;
        clearTimeout(timer);
        this.online = true;
        this.you = m.you;
        this.phase = 'lobby';
        this.h.onMode?.(true);
      } else this.onMsg(m);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      clearTimeout(timer);
      this.onDisconnect();
    };
    ws.onerror = () => {
      /* onclose cuida */
    };
  }

  private send(m: ClientMsg): void {
    try {
      this.ws?.send(JSON.stringify(m));
    } catch {
      /* ignora */
    }
  }

  private onMsg(m: ServerMsg): void {
    switch (m.type) {
      case 'lobby':
        this.players = m.players;
        this.h.onLobby(m.players, m.startsInMs);
        break;
      case 'start':
        this.phase = 'countdown';
        this.players = m.players;
        this.you = m.you;
        this.timers.push(window.setTimeout(() => this.phase === 'countdown' && (this.phase = 'race'), m.countdownMs));
        this.h.onStart({ seed: m.seed, countdownMs: m.countdownMs, durationSec: m.durationSec, players: m.players, you: m.you });
        break;
      case 'tick':
        if (this.phase === 'countdown') this.phase = 'race';
        this.last = m.s;
        this.lastT = m.t;
        this.h.onTick(m.t, m.s);
        break;
      case 'end':
        this.phase = 'done';
        this.h.onEnd(m.results);
        break;
      case 'error':
        // sala cheia / já começou: tenta outra sala uma vez
        if ((m.code === 'full' || m.code === 'started') && this.phase !== 'race' && this.retries++ < 1) {
          const old = this.ws;
          this.ws = null;
          try {
            old?.close();
          } catch {
            /* ignora */
          }
          this.connect();
        }
        break;
    }
  }

  private lastT = 0;

  private onDisconnect(): void {
    if (this.phase === 'done') return;
    this.online = false;
    this.h.onMode?.(false);
    if (this.phase === 'connect' || this.phase === 'lobby') return this.goLocal();
    // caiu durante a contagem/corrida: continua localmente a partir do último estado
    this.continueLocally();
  }

  /* ---------------- local (fallback) ---------------- */

  private goLocal(): void {
    if (this.phase === 'done' || this.local) return;
    this.clearTimers();
    this.online = false;
    this.phase = 'lobby';
    this.you = 0;
    const r = mulberry32((Math.random() * 2 ** 32) >>> 0);
    const taken = new Set([this.me.name]);
    this.players = [{ slot: 0, name: this.me.name, skin: this.me.skin }];
    const bots = new Map<number, BotSim>();
    const wait = 1800 + r() * 1600;
    this.h.onLobby([...this.players], wait);
    let at = 0;
    for (let slot = 1; slot < RACE.players; slot++) {
      at += 300 + r() * (wait / 4);
      this.timers.push(
        window.setTimeout(() => {
          if (this.phase !== 'lobby') return;
          const info: RacePlayerInfo = { slot, name: botName(r, taken), skin: randomSkin(r), ...(this.me.debug ? { bot: true } : {}) };
          bots.set(slot, makeBot(Math.floor(r() * 2 ** 32), botSkill(r)));
          this.players.push(info);
          this.h.onLobby([...this.players], Math.max(0, wait - at));
        }, Math.min(at, wait)),
      );
    }
    this.timers.push(
      window.setTimeout(() => {
        if (this.phase !== 'lobby') return;
        this.phase = 'countdown';
        const start = Date.now() + RACE.countdownMs;
        this.local = { bots, start, durationSec: RACE.durationSec, meDeadAt: 0, tick: 0 };
        this.h.onStart({ seed: (r() * 2 ** 32) >>> 0, countdownMs: RACE.countdownMs, durationSec: RACE.durationSec, players: [...this.players], you: 0 });
        this.timers.push(window.setTimeout(() => this.runLocal(), RACE.countdownMs));
      }, wait + 500),
    );
  }

  private continueLocally(): void {
    const bots = new Map<number, BotSim>();
    const t = this.lastT;
    for (const row of this.last) {
      const [slot, score, p, alive, tAlive] = row;
      if (slot === this.you) continue;
      const b = makeBot((Math.random() * 2 ** 32) >>> 0, 0.55);
      b.score = score;
      b.p = p;
      b.alive = !!alive;
      b.tAlive = tAlive / 10;
      b.next = t + 0.5 + Math.random();
      bots.set(slot, b);
    }
    // se nem havia classificação ainda, todos começam do zero
    if (!this.last.length) for (const pl of this.players) if (pl.slot !== this.you) bots.set(pl.slot, makeBot((Math.random() * 2 ** 32) >>> 0, 0.55));
    const start = this.phase === 'countdown' ? Date.now() + 1500 : Date.now() - t * 1000;
    this.local = { bots, start, durationSec: RACE.durationSec, meDeadAt: 0, tick: 0 };
    this.phase = 'race';
    this.runLocal();
  }

  private runLocal(): void {
    const L = this.local;
    if (!L || this.phase === 'done') return;
    this.phase = 'race';
    clearInterval(L.tick);
    L.tick = window.setInterval(() => {
      const t = Math.min(L.durationSec, Math.max(0, (Date.now() - L.start) / 1000));
      const rows: StandingRow[] = [];
      for (const pl of this.players) {
        if (pl.slot === this.you) {
          rows.push([pl.slot, this.my.score, this.my.p, this.my.alive ? 1 : 0, Math.round((this.my.alive ? t : L.meDeadAt || t) * 10)]);
          continue;
        }
        const b = L.bots.get(pl.slot);
        if (!b) continue;
        stepBot(b, t);
        rows.push([pl.slot, b.score, b.p, b.alive ? 1 : 0, Math.round(b.tAlive * 10)]);
      }
      if (!this.my.alive && !L.meDeadAt) L.meDeadAt = t || 0.1;
      this.last = rows;
      this.lastT = t;
      this.h.onTick(Math.round(t * 10) / 10, rows);
      const anyAlive = rows.some((r) => r[3]);
      const meOutFor = L.meDeadAt ? t - L.meDeadAt : 0;
      if (t >= L.durationSec || !anyAlive || meOutFor > 1.8) this.finishLocal(meOutFor > 1.8 ? L.durationSec : t);
    }, RACE.tickMs);
  }

  private finishLocal(t: number): void {
    const L = this.local!;
    clearInterval(L.tick);
    this.phase = 'done';
    const list = this.players.map((pl) => {
      if (pl.slot === this.you) return { pl, score: this.my.score, tAlive: L.meDeadAt || Math.min(t, L.durationSec) };
      const b = L.bots.get(pl.slot)!;
      stepBot(b, t);
      return { pl, score: b.score, tAlive: b.tAlive };
    });
    list.sort(compareStanding);
    const results: RaceResult[] = list.map((x, i) => {
      const rw = rewardForPlace(i + 1);
      return { slot: x.pl.slot, name: x.pl.name, skin: x.pl.skin, score: x.score, tAlive: Math.round(x.tAlive * 10) / 10, place: i + 1, coins: rw.coins, gems: rw.gems, ...(x.pl.bot ? { bot: true } : {}) };
    });
    this.local = null;
    this.h.onEnd(results);
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  get mySlot(): number {
    return this.you;
  }
}

/** Skins de bots: mais comuns/raras, às vezes uma lendária (parecem jogadores reais). */
function randomSkin(r: () => number): string {
  const W: Record<string, number> = { common: 6, rare: 4, epic: 2, legendary: 1, mythic: 0.4 };
  const total = SKINS.reduce((s, k) => s + (W[k.rarity] ?? 1), 0);
  let x = r() * total;
  for (const s of SKINS) {
    x -= W[s.rarity] ?? 1;
    if (x <= 0) return s.id;
  }
  return SKINS[0].id;
}

/** Entra na fila da corrida (online, com fallback local automático). */
export function joinRace(me: RaceMe, h: RaceHandlers): RaceSession {
  return new RaceSession(me, h);
}
