/* ============================================================
 *  GARIMPO — estado da "vida de garimpeiro": necessidades, mochila, força,
 *  combustível e opções. Salvo dentro do espaço do jogo (SlotSave.rp).
 *  Tudo é dado simples (JSON): nada de three.js aqui.
 * ============================================================ */
import { t } from '../../../i18n';
import type { WeatherSave } from '../weather';
import type { RIcon } from './icons';
import type { HaulSave } from '../haul/freight';

export type ItemId = 'marmita' | 'lanche' | 'agua' | 'jerry' | 'kit' | 'cinta' | 'lanterna' | 'saco' | 'pepita';

export interface ItemDef {
  id: ItemId;
  icon: RIcon;
  /** kg por unidade (pepita: por grama) */
  kg: number;
  price: number;
  name: () => string;
}
export const ITEMS: Record<ItemId, ItemDef> = {
  marmita: { id: 'marmita', icon: 'food', kg: 0.8, price: 25, name: () => t('gb.rp.it.marmita', 'Marmita') },
  lanche: { id: 'lanche', icon: 'snack', kg: 0.3, price: 10, name: () => t('gb.rp.it.lanche', 'Lanche') },
  agua: { id: 'agua', icon: 'water', kg: 1, price: 5, name: () => t('gb.rp.it.agua', 'Garrafa de água') },
  jerry: { id: 'jerry', icon: 'jerry', kg: 18, price: 40, name: () => t('gb.rp.it.jerry', 'Galão de diesel (20 L)') },
  kit: { id: 'kit', icon: 'tire', kg: 6, price: 120, name: () => t('gb.rp.it.kit', 'Kit de pneu') },
  cinta: { id: 'cinta', icon: 'hitch', kg: 3, price: 80, name: () => t('gb.rp.it.cinta', 'Cinta de reboque') },
  lanterna: { id: 'lanterna', icon: 'lights', kg: 0.4, price: 35, name: () => t('gb.rp.it.lanterna', 'Lanterna') },
  saco: { id: 'saco', icon: 'bag', kg: 12, price: 0, name: () => t('gb.rp.it.saco', 'Saco de cascalho') },
  pepita: { id: 'pepita', icon: 'nugget', kg: 0.001, price: 0, name: () => t('gb.rp.it.pepita', 'Pepitas (g)') },
};
/** m³ de terra num saco de cascalho */
export const SACK_VOL = 0.008;

export interface Needs {
  food: number;
  water: number;
  energy: number;
  stam: number;
}

export interface RpSave {
  v: 1;
  wx?: WeatherSave;
  needs: Needs;
  inv: Partial<Record<ItemId, number>>;
  /** ouro (g) dentro dos sacos */
  sackGold: number;
  str: { lvl: number; xp: number };
  /** litros por máquina (mesma ordem de SlotSave.machines) */
  fuel: number[];
  opt: { spooky: boolean | null; dayLen: number };
  ev: { cd: Record<string, number>; recent: string[]; n: number; seen: number };
  haul?: HaulSave;
  faints: number;
}

export function freshRp(): RpSave {
  return {
    v: 1,
    needs: { food: 85, water: 85, energy: 90, stam: 100 },
    inv: { agua: 1, lanche: 1 },
    sackGold: 0,
    str: { lvl: 1, xp: 0 },
    fuel: [],
    opt: { spooky: null, dayLen: 22 },
    ev: { cd: {}, recent: [], n: 0, seen: 0 },
    faints: 0,
  };
}
export function fixRp(o: Partial<RpSave> | undefined): RpSave {
  const f = freshRp();
  if (!o || o.v !== 1) return f;
  return {
    ...f,
    ...o,
    needs: { ...f.needs, ...(o.needs || {}) },
    inv: { ...(o.inv || {}) },
    str: { ...f.str, ...(o.str || {}) },
    opt: { ...f.opt, ...(o.opt || {}) },
    ev: { ...f.ev, ...(o.ev || {}) },
    fuel: Array.isArray(o.fuel) ? o.fuel : [],
  };
}

/* ---------------- sistemas por dificuldade ---------------- */
export interface Systems {
  fuel: boolean;
  needs: boolean;
  weight: boolean;
  /** multiplicador de gasto (necessidades, combustível) */
  rate: number;
  /** eventos por hora de jogo */
  evRate: number;
  /** só eventos bons/neutros (fácil) */
  gentle: boolean;
  /** preço do diesel por litro */
  diesel: number;
}
export function systems(diff: number): Systems {
  return [
    { fuel: false, needs: false, weight: false, rate: 0.6, evRate: 0.18, gentle: true, diesel: 0 },
    { fuel: true, needs: false, weight: false, rate: 0.85, evRate: 0.3, gentle: false, diesel: 0.9 },
    { fuel: true, needs: true, weight: true, rate: 1, evRate: 0.4, gentle: false, diesel: 1.1 },
    { fuel: true, needs: true, weight: true, rate: 1.35, evRate: 0.6, gentle: false, diesel: 1.3 },
  ][Math.max(0, Math.min(3, diff))];
}

/* ---------------- força ---------------- */
export const STR_MAX = 10;
export const xpNeed = (lvl: number): number => 50 + lvl * 40;
/** kg que dá para carregar sem ficar lento */
export const capKg = (lvl: number): number => 16 + lvl * 4;
/** fôlego máximo */
export const stamMax = (lvl: number): number => 80 + lvl * 5;
/** bônus na pá */
export const digMul = (lvl: number): number => 1 + (lvl - 1) * 0.04;

export function invKg(s: RpSave): number {
  let kg = 0;
  for (const k in s.inv) {
    const id = k as ItemId;
    kg += (s.inv[id] ?? 0) * ITEMS[id].kg;
  }
  return kg;
}

/* ---------------- combustível ---------------- */
/** litros do tanque e consumo (L/s com acelerador no fundo) */
export const TANK: Record<string, [number, number]> = {
  pickup: [70, 0.05],
  truck: [300, 0.16],
  excavator: [350, 0.18],
  dozer: [300, 0.17],
  heli: [500, 0.28],
};
