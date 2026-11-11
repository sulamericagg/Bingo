/* MONTA & LEVA — progresso local (localStorage 'bw-montaleva', aditivo e tolerante).
 * v1 → v2: as 30 fases antigas foram espalhadas entre as 200 novas (levels.ts guarda `old`); o progresso,
 * os projetos e as estrelas migram para a numeração nova e nada que já estava liberado volta a trancar. */
import { LEVELS } from './levels';
import type { Placed } from './parts';

export interface LevelRec {
  done: boolean;
  /** metas conquistadas: [tempo, sem tombar, poucas peças] */
  goals: [boolean, boolean, boolean];
  best: number;
  design?: Placed[];
}
export interface MLSave {
  v: 1 | 2;
  /** fases até aqui ficam liberadas mesmo sem concluir as anteriores (migração) */
  floor?: number;
  /** já viu o tutorial dos fios */
  wireTut?: boolean;
  gears: number;
  levels: Record<number, LevelRec>;
  up: { motor: number; grip: number; spring: number; pad: number; frame: number };
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
  v: 2,
  gears: 0,
  levels: {},
  up: { motor: 0, grip: 0, spring: 0, pad: 0, frame: 0 },
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
      if ((o.v ?? 1) < 2) migrateV1(s);
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

/** próxima fase a jogar: a primeira liberada e não concluída */
export function unlockedUpTo(): number {
  const s = mlSave();
  for (let n = 1; n <= LEVELS.length; n++) if (!s.levels[n]?.done && isUnlocked(n)) return n;
  return LEVELS.length;
}

/** numeração antiga (1..30) → nova (1..200) */
function migrateV1(s: MLSave): void {
  const old = s.levels;
  const map = new Map<number, number>();
  for (const L of LEVELS) if (L.old) map.set(L.old, L.n);
  const next: Record<number, LevelRec> = {};
  let floor = 1;
  for (const k of Object.keys(old)) {
    const n = map.get(+k);
    const r = old[+k];
    if (!n || !r) continue;
    next[n] = r;
    if (r.done) floor = Math.max(floor, n + 1);
  }
  s.levels = next;
  s.floor = floor;
  s.v = 2;
}

/** fase liberada? (sequencial; a migração mantém aberto o que já estava) */
export function isUnlocked(n: number): boolean {
  const s = mlSave();
  return n <= 1 || n <= (s.floor ?? 1) || !!s.levels[n]?.done || !!s.levels[n - 1]?.done;
}
