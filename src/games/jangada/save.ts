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
  /** 1 = jangada que vai à deriva com 1 ilha por vez; 2 = mapa com ilhas fixas, barcos, chefes */
  v: 1 | 2;
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
  /* ---------- v2 ---------- */
  /** estado das ilhas: nós mortos, descoberta, pedido feito */
  isles?: Record<number, { d: number[]; k?: 1; q?: 1 }>;
  boats?: import('./boats').BoatSave[];
  /** baús boiando: [id, tipo, x, z, itens, moedas] */
  dch?: [number, number, number, number, Bag, number][];
  /** chefes derrotados (dia) */
  boss?: Record<string, number>;
  target?: number;
  wind?: number;
  /** trocas feitas (pedidos) */
  quests?: string[];
}
export interface JgSlotMeta {
  diff: Diff;
  last: number;
}
export interface JgSave {
  v: 1;
  diff: Diff;
  cam: number;
  /** jangada do espaço ativo (`slot`) */
  world: JgWorld | null;
  /** 3 espaços de jogo (como no Minecraft); `world` é sempre o do espaço ativo */
  slot?: number;
  slots?: (JgWorld | null)[];
  meta?: (JgSlotMeta | null)[];
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
function syncSlots(s: JgSave): void {
  const i = Math.max(0, Math.min(2, s.slot ?? 0));
  s.slot = i;
  if (!s.slots) s.slots = [null, null, null];
  if (!s.meta) s.meta = [null, null, null];
  s.slots[i] = s.world;
  if (s.world) s.meta[i] = { diff: s.diff, last: Date.now() };
  else s.meta[i] = null;
}
/** troca o espaço ativo (guarda o atual antes) */
export function useSlot(i: number): void {
  const s = jgSave();
  syncSlots(s);
  s.slot = Math.max(0, Math.min(2, i));
  s.world = s.slots![s.slot] ?? null;
  const m = s.meta![s.slot];
  if (m) s.diff = m.diff;
  persist();
}
/** apaga um espaço */
export function dropSlot(i: number): void {
  const s = jgSave();
  syncSlots(s);
  s.slots![i] = null;
  s.meta![i] = null;
  if (i === s.slot) s.world = null;
  persist();
}
export function slotList(): { world: JgWorld | null; meta: JgSlotMeta | null }[] {
  const s = jgSave();
  if (!s.slots) syncSlots(s);
  return [0, 1, 2].map((i) => ({ world: i === s.slot ? s.world : (s.slots![i] ?? null), meta: s.meta![i] ?? null }));
}
export function persist(): void {
  try {
    if (cache) syncSlots(cache);
    if (cache) localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* sem armazenamento */
  }
}
