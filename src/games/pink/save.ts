/* ============================================================
 *  BLOOP PINK — saves: 3 espaços por modo em localStorage['bw-pink'].
 * ============================================================ */
import type { FurnKind, Goal, StaffKind } from './data';
import { RENOV0, type Renov } from './store3d';
import { migrateGrow } from './grow';

export type Mode = 'shop' | 'factory';

export interface FurnSave {
  id: number;
  k: FurnKind;
  x: number;
  z: number;
  /** rotação em quartos de volta (0..3) */
  r: number;
  /** vagas: [produto, quantidade] */
  s: ([string, number] | null)[];
}
export interface BoxSave {
  p: string;
  n: number;
  x: number;
  y: number;
  z: number;
  open?: boolean;
}
export interface ShopSave {
  v: 1;
  money: number;
  xp: number;
  lvl: number;
  day: number;
  rep: number;
  renov: Renov;
  lic: string[];
  furn: FurnSave[];
  boxes: BoxSave[];
  trash: { x: number; z: number }[];
  dirt: { x: number; z: number; a: number; k: 'dirt' | 'spill' | 'glass' | 'mud' }[];
  staff: { k: StaffKind; name: string; c: string }[];
  prices: Record<string, number>;
  sold: Record<string, number>;
  hist: { d: number; rev: number; prof: number; cust: number; happy: number }[];
  goals: Goal[];
  tab: number;
  orders: { p: string; n: number }[];
  auto: boolean;
  tut: number;
  bestCombo: number;
  totalCust: number;
  nextId: number;
  coupons: number;
  created: number;
}
export interface FactorySave {
  v: 1;
  money: number;
  xp: number;
  lvl: number;
  day: number;
  truck: number;
  ups: string[];
  shipped: number;
  dirt: { x: number; z: number; a: number; k: 'dirt' | 'spill' | 'glass' | 'mud' }[];
  tut: number;
  created: number;
}
interface Slot<T> {
  data: T | null;
  last?: number;
}
interface Root {
  shop: Slot<ShopSave>[];
  factory: Slot<FactorySave>[];
  sel: Record<Mode, number>;
}

const KEY = 'bw-pink';
let root: Root | null = null;

function load(): Root {
  if (root) return root;
  let r: Root | null = null;
  try {
    r = JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    r = null;
  }
  if (!r || !Array.isArray(r.shop)) r = { shop: [], factory: [], sel: { shop: 0, factory: 0 } };
  while (r.shop.length < 3) r.shop.push({ data: null });
  while (r.factory.length < 3) r.factory.push({ data: null });
  r.sel ??= { shop: 0, factory: 0 };
  root = r;
  return r;
}
export function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(load()));
  } catch {
    /* sem espaço */
  }
}
export function slots(m: Mode): Slot<ShopSave | FactorySave>[] {
  return load()[m] as Slot<ShopSave | FactorySave>[];
}
export function selSlot(m: Mode): number {
  return load().sel[m] ?? 0;
}
export function setSel(m: Mode, i: number): void {
  load().sel[m] = i;
  persist();
}
export function getShop(i: number): ShopSave | null {
  const d = load().shop[i]?.data ?? null;
  if (d) {
    // migração leve: campos novos
    const r = (d.renov ?? {}) as Renov;
    migrateGrow(r);
    d.renov = { ...RENOV0, ...r };
    d.coupons ??= 0;
    d.nextId ??= 1000;
  }
  return d;
}
export function putShop(i: number, s: ShopSave): void {
  const r = load();
  r.shop[i] = { data: s, last: Date.now() };
  persist();
}
export function getFactory(i: number): FactorySave | null {
  return load().factory[i]?.data ?? null;
}
export function putFactory(i: number, s: FactorySave): void {
  const r = load();
  r.factory[i] = { data: s, last: Date.now() };
  persist();
}
export function dropSlot(m: Mode, i: number): void {
  const r = load();
  r[m][i] = { data: null };
  persist();
}

export function newShop(): ShopSave {
  return {
    v: 1,
    money: 1800,
    xp: 0,
    lvl: 1,
    day: 1,
    rep: 50,
    renov: { ...RENOV0 },
    lic: [],
    furn: [],
    boxes: [],
    // garagem abandonada: sacos de lixo para levar à lixeira
    trash: [
      { x: -1.7, z: -2.4 },
      { x: 1.6, z: -4.9 },
      { x: -1.1, z: -5.2 },
    ],
    dirt: [],
    staff: [],
    prices: {},
    sold: {},
    hist: [],
    goals: [],
    tab: 0,
    orders: [],
    auto: false,
    tut: 0,
    bestCombo: 0,
    totalCust: 0,
    nextId: 1,
    coupons: 0,
    created: Date.now(),
  };
}
export function newFactory(): FactorySave {
  return { v: 1, money: 600, xp: 0, lvl: 1, day: 1, truck: 0, ups: [], shipped: 0, dirt: [], tut: 0, created: Date.now() };
}
