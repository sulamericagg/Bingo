/* Progresso persistente da "Jangada Bloop" (localStorage 'bw-jangada'). */
import type { Bag, Diff } from './data';

export interface JgStats {
  hooked: number;
  sharks: number;
  ghosts: number;
  islands: number;
  cooked: number;
  fish: number;
}
export interface JgWorld {
  v: 1;
  seed: number;
  day: number;
  /** hora do dia 0..1 */
  tod: number;
  raft: unknown[];
  inv: Bag;
  hp: number;
  food: number;
  water: number;
  /** missão principal atual e progresso */
  mis: number;
  misN: number;
  /** missões do dia: índice em DAILY, progresso */
  daily: [number, number][];
  dailyDay: number;
  off: [number, number];
  /** direção da correnteza */
  hdg: [number, number];
  isl: { seed: number; x: number; z: number; dead: number[] } | null;
  nextIsl: number;
  stats: JgStats;
  pos: [number, number, number];
  bed: [number, number] | null;
  sharkT: number;
  stormT: number;
  ghostDone: number;
  coinsDay: number;
}
export interface JgSave {
  v: 1;
  diff: Diff;
  cam: number;
  world: JgWorld | null;
  bestDay: number;
  plays: number;
}

const KEY = 'bw-jangada';
let cache: JgSave | null = null;

export function fresh(): JgSave {
  return { v: 1, diff: 1, cam: 0, world: null, bestDay: 0, plays: 0 };
}
export function jgSave(): JgSave {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as Partial<JgSave>) : null;
    cache = { ...fresh(), ...(s ?? {}) } as JgSave;
  } catch {
    cache = fresh();
  }
  return cache;
}
export function persist(): void {
  try {
    if (cache) localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* sem armazenamento */
  }
}
