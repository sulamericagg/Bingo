/* ============================================================
 *  MUNDO ABERTO — progresso (localStorage 'bw-floresta-mundo').
 *  Só os pedaços modificados entram (escavações + árvores cortadas).
 * ============================================================ */
export interface ChunkRec {
  /** escavação (int8 base64) */
  e?: string;
  /** árvores: [índice, estado, crescimento×100] */
  t?: number[];
}
export interface QuestRec {
  camp: string;
  /** 'logs' (espécie) | 'ore' (minério) | 'dig' (buracos) | 'plant' (mudas) */
  kind: 'logs' | 'ore' | 'dig' | 'plant';
  what: number;
  need: number;
  have: number;
  reward: number;
}
export interface WorldSave {
  v: 1;
  seed: number;
  px: number;
  pz: number;
  yaw: number;
  /** tempo de jogo no mundo (s) */
  time: number;
  chunks: Record<string, ChunkRec>;
  camps: string[];
  /** células de 64 m exploradas "cx,cz" */
  cells: string[];
  quests: QuestRec[];
  /** livro: espécies cortadas (contagem por índice), raras por espécie (bitmask), minérios achados */
  bookTrees: number[];
  bookRare: number[];
  bookOres: number[];
  biomes: number[];
  veh: { owned: number[]; lvl: number[]; paint: number[]; pos: number[][] };
  inv: { tnt: number; confetti: number; seeds: number };
  goals: { day: string; week: string; d: Record<string, number>; w: Record<string, number>; claimed: string[] };
  stats: { km: number; craters: number; holes: number; trees: number; ores: number; planted: number };
  pets: number;
}

const KEY = 'bw-floresta-mundo';
const MAX_CHUNKS = 400;

export function freshWorld(seed = 20261110): WorldSave {
  return {
    v: 1, seed, px: 0, pz: 30, yaw: 0, time: 0, chunks: {}, camps: [], cells: [], quests: [],
    bookTrees: [], bookRare: [], bookOres: [], biomes: [],
    veh: { owned: [0], lvl: [], paint: [], pos: [] },
    inv: { tnt: 3, confetti: 1, seeds: 10 },
    goals: { day: '', week: '', d: {}, w: {}, claimed: [] },
    stats: { km: 0, craters: 0, holes: 0, trees: 0, ores: 0, planted: 0 },
    pets: 1,
  };
}

export function loadWorld(): WorldSave {
  const d = freshWorld();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const o = JSON.parse(raw);
    if (!o || o.v !== 1) return d;
    const num = (v: unknown, def: number) => (typeof v === 'number' && Number.isFinite(v) ? v : def);
    d.seed = num(o.seed, d.seed);
    d.px = num(o.px, d.px);
    d.pz = num(o.pz, d.pz);
    d.yaw = num(o.yaw, 0);
    d.time = num(o.time, 0);
    if (o.chunks && typeof o.chunks === 'object') d.chunks = o.chunks;
    for (const k of ['camps', 'cells'] as const) if (Array.isArray(o[k])) d[k] = o[k].filter((x: unknown) => typeof x === 'string');
    if (Array.isArray(o.quests)) d.quests = o.quests.filter((q: any) => q && typeof q.need === 'number');
    for (const k of ['bookTrees', 'bookRare', 'bookOres', 'biomes'] as const) if (Array.isArray(o[k])) d[k] = o[k].map((x: unknown) => num(x, 0));
    if (o.veh && Array.isArray(o.veh.owned)) {
      d.veh.owned = o.veh.owned.map((x: unknown) => num(x, 0));
      if (!d.veh.owned.includes(0)) d.veh.owned.push(0);
      d.veh.lvl = Array.isArray(o.veh.lvl) ? o.veh.lvl.map((x: unknown) => num(x, 0)) : [];
      d.veh.paint = Array.isArray(o.veh.paint) ? o.veh.paint.map((x: unknown) => num(x, 0)) : [];
      d.veh.pos = Array.isArray(o.veh.pos) ? o.veh.pos.map((p: unknown) => (Array.isArray(p) ? p.map((x) => num(x, 0)) : [])) : [];
    }
    if (o.inv) for (const k of Object.keys(d.inv) as (keyof WorldSave['inv'])[]) d.inv[k] = num(o.inv[k], d.inv[k]);
    if (o.goals && typeof o.goals === 'object') d.goals = { ...d.goals, ...o.goals };
    if (o.stats) for (const k of Object.keys(d.stats) as (keyof WorldSave['stats'])[]) d.stats[k] = num(o.stats[k], 0);
    d.pets = Math.max(0, Math.min(3, num(o.pets, 1)));
  } catch {
    /* corrompido: recomeça */
  }
  return d;
}

export function writeWorld(w: WorldSave): void {
  // limita o tamanho: descarta pedaços só com árvores (as escavações ficam)
  const keys = Object.keys(w.chunks);
  if (keys.length > MAX_CHUNKS) for (const k of keys.slice(0, keys.length - MAX_CHUNKS)) if (!w.chunks[k].e) delete w.chunks[k];
  if (w.cells.length > 6000) w.cells.splice(0, w.cells.length - 6000);
  try {
    localStorage.setItem(KEY, JSON.stringify(w));
  } catch {
    /* sem espaço */
  }
}
