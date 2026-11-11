/* ============================================================
 *  ANOMALIAS — DIRETOR de anomalias (puro, determinístico por semente).
 *  Escolhe ponto/tipo/variante, agenda com frequência crescente por noite,
 *  nunca duas no mesmo ponto, e só cria quando o ponto NÃO está à vista
 *  (predicado `canPlace` fornecido pelo turno — no co-op o host checa todos).
 *  Mesma semente + mesmas respostas de canPlace = mesma sequência.
 * ============================================================ */
import type { AnomalyKind } from '../maps/types';
import { DIFF, FIRST_DELAY, nightCfg, type Diff, type NightCfg } from './data';
import { Rng } from './util';

export interface DirSlot {
  id: string;
  room: string;
  kinds: AnomalyKind[];
  variants: number;
  minNight: number;
}

export interface Active {
  /** id sequencial (para rede/relatório) */
  id: number;
  slot: number;
  kind: AnomalyKind;
  variant: number;
  at: number;
  deadline: number;
  hinted: boolean;
}

export type DirEvent = { type: 'spawn'; a: Active } | { type: 'expire'; a: Active };

export class Director {
  readonly cfg: NightCfg;
  private rng: Rng;
  private nextAt = Infinity;
  private seq = 0;
  readonly active: Active[] = [];
  /** quando cada ponto ficou livre (cooldown) */
  private freeAt: number[];
  private lastRoom = '';
  private endAt: number;
  taskRooms = new Set<string>();
  /** histórico (debug / resultado) */
  spawned = 0;

  constructor(
    readonly slots: DirSlot[],
    readonly night: number,
    readonly diff: Diff,
    seed: number,
  ) {
    this.cfg = nightCfg(night);
    this.rng = new Rng(seed);
    this.freeAt = slots.map(() => -1e9);
    this.endAt = DIFF[diff].shiftSec - 22;
  }

  /** começa a agendar (fim da fase de memorizar). `t` = tempo do turno (s). */
  start(t: number): void {
    this.nextAt = t + FIRST_DELAY;
  }

  private gap(): number {
    return this.cfg.gap * DIFF[this.diff].gapMul * this.rng.range(0.7, 1.3);
  }

  /** tipos possíveis de um ponto nesta noite */
  kindsOf(i: number): AnomalyKind[] {
    const s = this.slots[i];
    if (s.minNight > this.night) return [];
    return s.kinds.filter((k) => this.cfg.kinds.includes(k));
  }

  update(t: number, canPlace: (slot: number) => boolean): DirEvent[] {
    const ev: DirEvent[] = [];
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i];
      if (t >= a.deadline) {
        this.active.splice(i, 1);
        this.freeAt[a.slot] = t + 40;
        ev.push({ type: 'expire', a });
      }
    }
    if (t >= this.nextAt && t < this.endAt) {
      if (this.active.length >= this.cfg.maxActive) this.nextAt = t + 5;
      else {
        const a = this.trySpawn(t, canPlace);
        if (a) {
          ev.push({ type: 'spawn', a });
          this.nextAt = t + this.gap();
        } else this.nextAt = t + 2;
      }
    }
    return ev;
  }

  /** força uma anomalia agora (debug/testes). `slotId` opcional. */
  forceSpawn(t: number, canPlace: (slot: number) => boolean, slotId?: string, kind?: AnomalyKind, variant?: number): Active | null {
    if (slotId) {
      const i = this.slots.findIndex((s) => s.id === slotId);
      if (i < 0 || this.active.some((a) => a.slot === i)) return null;
      const ks = this.slots[i].kinds;
      const k = kind && ks.includes(kind) ? kind : this.rng.pick(ks);
      return this.make(t, i, k, variant ?? this.rng.int(Math.max(1, this.slots[i].variants)));
    }
    return this.trySpawn(t, canPlace);
  }

  private trySpawn(t: number, canPlace: (slot: number) => boolean): Active | null {
    const busy = new Set(this.active.map((a) => a.slot));
    const busyRooms = new Set(this.active.map((a) => this.slots[a.slot].room));
    const w: number[] = this.slots.map((s, i) => {
      if (busy.has(i) || t < this.freeAt[i]) return 0;
      if (!this.kindsOf(i).length) return 0;
      let x = 1;
      if (this.taskRooms.has(s.room)) x *= 1.8; // anomalias puxam para as salas de tarefa
      if (s.room === this.lastRoom) x *= 0.35; // variedade
      if (busyRooms.has(s.room)) x *= 0.4;
      return x;
    });
    // tenta até 8 sorteios; um ponto à vista do jogador é descartado nesta rodada
    for (let tries = 0; tries < 8; tries++) {
      const i = this.rng.weighted(w);
      if (i < 0) return null;
      if (!canPlace(i)) {
        w[i] = 0;
        continue;
      }
      const ks = this.kindsOf(i);
      const kind = this.rng.pick(ks);
      const variant = this.rng.int(Math.max(1, this.slots[i].variants));
      return this.make(t, i, kind, variant);
    }
    return null;
  }

  private make(t: number, i: number, kind: AnomalyKind, variant: number): Active {
    const a: Active = { id: ++this.seq, slot: i, kind, variant, at: t, deadline: t + DIFF[this.diff].window, hinted: false };
    this.active.push(a);
    this.lastRoom = this.slots[i].room;
    this.spawned++;
    return a;
  }

  /** anomalia fotografada: sai da lista */
  resolve(id: number, t: number): Active | null {
    const i = this.active.findIndex((a) => a.id === id);
    if (i < 0) return null;
    const [a] = this.active.splice(i, 1);
    this.freeAt[a.slot] = t + 45;
    return a;
  }

  /** limpa tudo (fim do turno / pego) */
  clear(): Active[] {
    const all = this.active.splice(0);
    return all;
  }
}
