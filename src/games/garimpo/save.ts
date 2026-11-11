/* ============================================================
 *  GARIMPO BRUTO — saves: 3 espaços (cada um com semente, dificuldade, dinheiro,
 *  estoque, máquinas e as escavações do terreno em delta compacto).
 *  localStorage 'bw-garimpo' (resumo) + 'bw-garimpo-<n>' (jogo).
 * ============================================================ */
import type { Kind } from './machines';
import { V, type Terrain } from './terrain';

export type Diff = 0 | 1 | 2 | 3;
export const SLOTS = 3;

export interface MSave {
  kind: Kind;
  x: number;
  z: number;
  yaw: number;
  vol: number;
  gold: number;
}
export interface SlotSave {
  v: 1;
  seed: number;
  diff: Diff;
  created: number;
  played: number;
  money: number;
  /** ouro no estoque (g) */
  stock: number;
  sold: number;
  plantVol: number;
  plantGold: number;
  machines: MSave[];
  worker: { x: number; z: number; yaw: number; vol: number; gold: number };
  /** CARRINHO largado no chão [x, z, guinada] (ausente = na mão) */
  barrow?: number[];
  /** índice em machines da máquina dirigida (-1 = a pé) */
  driving: number;
  upg: { shovel: number; barrow: number; plant: number };
  /** ajudantes contratados */
  bots: { drivers: number; miners: number };
  expert: boolean;
  rain: boolean;
  /** tempo até o próximo caminhão de exportação e o próximo incêndio */
  exportT: number;
  fireT: number;
  terrain: string;
  /** dicas já vistas */
  tips: string[];
  /** mina subterrânea aberta e seu estado */
  mineOpen?: boolean;
  ug?: import('./underground').UgSave;
  /** água: profundidades, tanque da lavadora, poços/bombas/canos, tempo */
  water?: import('./water/system').WaterSave;
  /** beneficiamento: melhorias da lavadora, calhas, caixa do ouro, rejeitos (proc/system.ts) */
  proc?: import('./proc/system').ProcSave;
  /** CONSERTOS: desgaste/quebras por máquina, peças no estoque (repair/) */
  repair?: import('./repair/model').RepairSave;
}
export interface SlotMeta {
  seed: number;
  diff: Diff;
  money: number;
  sold: number;
  played: number;
  machines: number;
  at: number;
}

const META = 'bw-garimpo';
const key = (n: number) => `bw-garimpo-${n}`;

export function loadMeta(): (SlotMeta | null)[] {
  try {
    const o = JSON.parse(localStorage.getItem(META) || '[]') as (SlotMeta | null)[];
    const a: (SlotMeta | null)[] = [];
    for (let i = 0; i < SLOTS; i++) a.push(o[i] ?? null);
    return a;
  } catch {
    return Array(SLOTS).fill(null);
  }
}
function saveMeta(m: (SlotMeta | null)[]): void {
  try {
    localStorage.setItem(META, JSON.stringify(m));
  } catch {
    /* sem espaço */
  }
}
export function loadSlot(n: number): SlotSave | null {
  try {
    const raw = localStorage.getItem(key(n));
    if (!raw) return null;
    const o = JSON.parse(raw) as SlotSave;
    if (!o || o.v !== 1) return null;
    o.upg = Object.assign({ shovel: 0, barrow: 0, plant: 0 }, o.upg || {});
    o.tips = o.tips || [];
    o.bots = Object.assign({ drivers: 0, miners: 0 }, o.bots || {});
    return o;
  } catch {
    return null;
  }
}
export function writeSlot(n: number, s: SlotSave): boolean {
  try {
    localStorage.setItem(key(n), JSON.stringify(s));
    const m = loadMeta();
    m[n] = { seed: s.seed, diff: s.diff, money: s.money, sold: s.sold, played: s.played, machines: s.machines.length, at: Date.now() };
    saveMeta(m);
    return true;
  } catch {
    return false;
  }
}
export function deleteSlot(n: number): void {
  try {
    localStorage.removeItem(key(n));
  } catch {
    /* */
  }
  const m = loadMeta();
  m[n] = null;
  saveMeta(m);
}

export const START_MONEY = [600, 250, 100, 0];
/** preço do grama por dificuldade */
export const GOLD_PRICE = [14, 10, 8, 6];
/** intervalo do caminhão de exportação (s) */
export const EXPORT_EVERY = [60, 75, 95, 120];
/** intervalo de incêndios (s): raro; frequente só no "muito difícil" */
export const FIRE_EVERY: [number, number][] = [
  [1e9, 1e9],
  [900, 1500],
  [600, 1000],
  [240, 420],
];

export function freshSlot(seed: number, diff: Diff): SlotSave {
  return {
    v: 1,
    seed,
    diff,
    created: Date.now(),
    played: 0,
    money: START_MONEY[diff],
    stock: 0,
    sold: 0,
    plantVol: 0,
    plantGold: 0,
    machines: [],
    worker: { x: -1, z: -1, yaw: 0, vol: 0, gold: 0 },
    driving: -1,
    upg: { shovel: 0, barrow: 0, plant: 0 },
    bots: { drivers: 0, miners: 0 },
    expert: false,
    rain: false,
    exportT: EXPORT_EVERY[diff],
    fireT: FIRE_EVERY[diff][0] + Math.random() * (FIRE_EVERY[diff][1] - FIRE_EVERY[diff][0]),
    terrain: '',
    tips: [],
  };
}

/* ---------------- terreno: delta (h - h0) em cm + teor da terra solta ---------------- */
export function encodeTerrain(T: Terrain): string {
  const out: number[] = [];
  const n = V * V;
  let skip = 0;
  let i = 0;
  while (i < n) {
    const d = Math.round((T.h[i] - T.h0[i]) * 100);
    if (d === 0) {
      skip++;
      i++;
      continue;
    }
    while (skip > 32767) {
      out.push(32767, 0);
      skip -= 32767;
    }
    // sequência de células alteradas
    const vals: number[] = [];
    while (i < n && vals.length < 32000) {
      const dd = Math.round((T.h[i] - T.h0[i]) * 100);
      if (dd === 0) break;
      vals.push(Math.max(-32767, Math.min(32767, dd)), Math.min(32767, Math.round(T.pay[i] * 10)));
      i++;
    }
    out.push(skip, vals.length / 2, ...vals);
    skip = 0;
  }
  const a = new Int16Array(out);
  let s = '';
  const u8 = new Uint8Array(a.buffer);
  for (let k = 0; k < u8.length; k += 8192) s += String.fromCharCode(...u8.subarray(k, k + 8192));
  return btoa(s);
}
export function decodeTerrain(T: Terrain, b64: string): void {
  if (!b64) return;
  try {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k);
    const a = new Int16Array(u8.buffer, 0, u8.length >> 1);
    let p = 0;
    let i = 0;
    const n = V * V;
    while (p < a.length && i < n) {
      i += a[p++];
      const cnt = a[p++];
      for (let c = 0; c < cnt && i < n; c++, i++) {
        T.h[i] = T.h0[i] + a[p++] / 100;
        T.pay[i] = a[p++] / 10;
        if (T.mat[i] === 1 || T.mat[i] === 4) T.mat[i] = 0;
      }
    }
  } catch (e) {
    console.warn('[garimpo] terreno corrompido', e);
  }
}
