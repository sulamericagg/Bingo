/* MONTA & LEVA — progresso local (localStorage 'bw-montaleva', aditivo e tolerante). */
import type { Placed } from './parts';

export interface LevelRec {
  done: boolean;
  /** metas conquistadas: [tempo, sem tombar, poucas peças] */
  goals: [boolean, boolean, boolean];
  best: number;
  design?: Placed[];
}
export interface MLSave {
  v: 1;
  gears: number;
  levels: Record<number, LevelRec>;
  up: { motor: number; grip: number; spring: number; pad: number };
  palettes: string[];
  palette: string;
  music: boolean;
  sfx: boolean;
  com: boolean;
  deliveries: number;
}
const KEY = 'bw-montaleva';
let cache: MLSave | null = null;

const fresh = (): MLSave => ({
  v: 1,
  gears: 0,
  levels: {},
  up: { motor: 0, grip: 0, spring: 0, pad: 0 },
  palettes: ['classic'],
  palette: 'classic',
  music: true,
  sfx: true,
  com: true,
  deliveries: 0,
});

export function mlSave(): MLSave {
  if (cache) return cache;
  const s = fresh();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw) as Partial<MLSave>;
      Object.assign(s, o);
      s.up = { ...fresh().up, ...(o.up ?? {}) };
      if (!Array.isArray(s.palettes)) s.palettes = ['classic'];
      if (!s.levels || typeof s.levels !== 'object') s.levels = {};
    }
  } catch {
    /* save corrompido: começa de novo */
  }
  cache = s;
  return s;
}

export function persistML(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(mlSave()));
  } catch {
    /* sem espaço */
  }
}

export function levelRec(n: number): LevelRec {
  const s = mlSave();
  return (s.levels[n] ??= { done: false, goals: [false, false, false], best: 0 });
}

export function starsOf(n: number): number {
  const r = mlSave().levels[n];
  if (!r || !r.done) return 0;
  return r.goals.filter(Boolean).length;
}

export function unlockedUpTo(): number {
  const s = mlSave();
  let n = 1;
  while (s.levels[n]?.done) n++;
  return n;
}
