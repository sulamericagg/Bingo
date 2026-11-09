/* ============================================================
 *  RALLY LUNAR — dados: veículos, zonas, melhorias e save (aditivo)
 * ============================================================ */
import { t } from '../../i18n';
import { persist, save, type SaveData } from '../../core/storage';
import { bus } from '../../core/events';
import { spend } from '../../core/economy';

export type UpgradeKey = 'motor' | 'tires' | 'susp' | 'tank';
export const UPGRADE_KEYS: UpgradeKey[] = ['motor', 'tires', 'susp', 'tank'];
export const MAX_UP = 5;

export type CarShape = 'buggy' | 'rover' | 'monster' | 'hover' | 'icecream' | 'rocket';

export interface VehicleDef {
  id: string;
  shape: CarShape;
  /** preço: moedas, gemas ou N vídeos premiados; vazio = grátis */
  price: { coins?: number; gems?: number; ads?: number };
  body: string; // cor principal
  body2: string; // cor secundária
  trim: string; // detalhe
  /** física base */
  mass: number;
  power: number; // aceleração em solo (m/s²)
  topSpeed: number; // m/s
  grip: number; // 0..1
  spring: number; // rigidez
  damp: number;
  fuel: number; // segundos de tanque
  wheelR: number; // raio da roda (m)
  wheelBase: number; // meia distância entre eixos (m)
  airTorque: number;
  /** custo base das melhorias (multiplicado pelo nível) */
  upBase: number;
}

export const VEHICLES: VehicleDef[] = [
  { id: 'pulga', shape: 'buggy', price: {}, body: '#ff8a3d', body2: '#ffd36b', trim: '#2fb7b0', mass: 1, power: 9, topSpeed: 15, grip: 0.8, spring: 1, damp: 1, fuel: 28, wheelR: 0.42, wheelBase: 1.05, airTorque: 7, upBase: 120 },
  { id: 'cratera', shape: 'rover', price: { coins: 2500 }, body: '#e9e4d8', body2: '#3fc4c0', trim: '#ff9a3d', mass: 1.2, power: 8.5, topSpeed: 14, grip: 0.92, spring: 0.9, damp: 1.25, fuel: 40, wheelR: 0.45, wheelBase: 1.25, airTorque: 5.5, upBase: 220 },
  { id: 'sorvetao', shape: 'icecream', price: { ads: 3 }, body: '#ffe1f0', body2: '#7fd8ff', trim: '#ff6fae', mass: 1.15, power: 9.5, topSpeed: 15.5, grip: 0.85, spring: 1.05, damp: 1.1, fuel: 34, wheelR: 0.44, wheelBase: 1.2, airTorque: 6, upBase: 200 },
  { id: 'trambolhao', shape: 'monster', price: { coins: 6000 }, body: '#7a5cff', body2: '#ffd23f', trim: '#2fe0a0', mass: 1.4, power: 11, topSpeed: 17, grip: 0.95, spring: 1.25, damp: 1.3, fuel: 32, wheelR: 0.7, wheelBase: 1.15, airTorque: 5, upBase: 320 },
  { id: 'foguetinho', shape: 'rocket', price: { coins: 12000 }, body: '#ff4f6a', body2: '#ffffff', trim: '#ffb02e', mass: 0.95, power: 13.5, topSpeed: 21, grip: 0.82, spring: 1.1, damp: 1, fuel: 24, wheelR: 0.4, wheelBase: 1.1, airTorque: 8.5, upBase: 420 },
  { id: 'flutua', shape: 'hover', price: { gems: 60 }, body: '#2fe0d0', body2: '#b98cff', trim: '#fff36b', mass: 0.9, power: 11, topSpeed: 18, grip: 1, spring: 0.8, damp: 1.4, fuel: 36, wheelR: 0.38, wheelBase: 1.1, airTorque: 9, upBase: 380 },
];

export function vehicleName(id: string): string {
  switch (id) {
    case 'pulga':
      return t('rally.car.pulga', 'Pulguinha');
    case 'cratera':
      return t('rally.car.cratera', 'Cratera');
    case 'sorvetao':
      return t('rally.car.sorvetao', 'Sorvetão');
    case 'trambolhao':
      return t('rally.car.trambolhao', 'Trambolhão');
    case 'foguetinho':
      return t('rally.car.foguetinho', 'Foguetinho');
    case 'flutua':
      return t('rally.car.flutua', 'Flutua');
  }
  return id;
}
export function vehicleDesc(id: string): string {
  switch (id) {
    case 'pulga':
      return t('rally.cardesc.pulga', 'Levinho e saltitante. Bom pra começar!');
    case 'cratera':
      return t('rally.cardesc.cratera', 'Firme no chão e com tanque grandão.');
    case 'sorvetao':
      return t('rally.cardesc.sorvetao', 'Toca musiquinha e não derrete nunca.');
    case 'trambolhao':
      return t('rally.cardesc.trambolhao', 'Rodas gigantes passam por cima de tudo.');
    case 'foguetinho':
      return t('rally.cardesc.foguetinho', 'Muito rápido, mas bebe combustível.');
    case 'flutua':
      return t('rally.cardesc.flutua', 'Paira no ar e gira como pião.');
  }
  return '';
}
export function upgradeName(k: UpgradeKey): string {
  switch (k) {
    case 'motor':
      return t('rally.up.motor', 'Motor');
    case 'tires':
      return t('rally.up.tires', 'Pneus');
    case 'susp':
      return t('rally.up.susp', 'Suspensão');
    case 'tank':
      return t('rally.up.tank', 'Tanque');
  }
}

export const vehicleById = (id: string): VehicleDef => VEHICLES.find((v) => v.id === id) ?? VEHICLES[0];

/* ---------------- zonas ---------------- */

export interface ZoneDef {
  id: string;
  sky: [string, string];
  far: string;
  mid: string;
  ground: [string, string];
  top: string; // borda (grama, cobertura...)
  gravity: number;
  grip: number; // multiplicador
  /** pesos das oitavas de relevo [longa, média, curta, crateras] */
  oct: [number, number, number, number];
  deco: 'stars' | 'candy' | 'ice' | 'jungle' | 'dunes';
  coin: string;
}

export const ZONE_LEN = 900; // m
export const ZONES: ZoneDef[] = [
  { id: 'moon', sky: ['#120b3a', '#3b2a78'], far: '#4a3d86', mid: '#6a5ea6', ground: ['#b9b2cf', '#7b7299'], top: '#e6e1f5', gravity: 6.2, grip: 0.95, oct: [1, 0.55, 0.15, 1], deco: 'stars', coin: '#ffd23f' },
  { id: 'dunes', sky: ['#ffb36b', '#ffe3b0'], far: '#e38b4f', mid: '#2fa8a0', ground: ['#f0a85a', '#c46a35'], top: '#ffd28a', gravity: 9.8, grip: 0.9, oct: [1.1, 0.6, 0.2, 0], deco: 'dunes', coin: '#fff36b' },
  { id: 'candy', sky: ['#ff9fd6', '#ffe0f3'], far: '#ff7fc4', mid: '#c98bff', ground: ['#ffb2dd', '#e86aa8'], top: '#ffffff', gravity: 9.8, grip: 1, oct: [0.7, 1, 0.25, 0], deco: 'candy', coin: '#ffe45c' },
  { id: 'ice', sky: ['#7fd2ff', '#e6f8ff'], far: '#a8dcf5', mid: '#7fb6e0', ground: ['#dff5ff', '#8cc2e6'], top: '#ffffff', gravity: 9.8, grip: 0.62, oct: [1.3, 0.4, 0.08, 0], deco: 'ice', coin: '#ffd23f' },
  { id: 'jungle', sky: ['#4fc49a', '#d7ffb8'], far: '#2f9a6e', mid: '#1f7a55', ground: ['#8a5a3a', '#5a3622'], top: '#4fd65a', gravity: 9.8, grip: 1, oct: [0.8, 0.8, 0.55, 0], deco: 'jungle', coin: '#ffe45c' },
];

export function zoneName(id: string): string {
  switch (id) {
    case 'moon':
      return t('rally.zone.moon', 'Crateras da Lua');
    case 'dunes':
      return t('rally.zone.dunes', 'Dunas Laranja');
    case 'candy':
      return t('rally.zone.candy', 'Colinas de Doce');
    case 'ice':
      return t('rally.zone.ice', 'Lago Congelado');
    case 'jungle':
      return t('rally.zone.jungle', 'Selva Saltitante');
  }
  return id;
}

export const zoneIndexAt = (x: number): number => (Math.max(0, Math.floor(x / ZONE_LEN)) % ZONES.length);

/* ---------------- save (campo aditivo `rally`) ---------------- */

export interface RallySave {
  owned: string[];
  sel: string;
  up: Record<string, Partial<Record<UpgradeKey, number>>>;
  best: number;
  ads: Record<string, number>;
  runs: number;
  totalDist: number;
}

type WithRally = SaveData & { rally?: RallySave };

export function rallySave(): RallySave {
  const s = save as WithRally;
  if (!s.rally || typeof s.rally !== 'object') s.rally = { owned: ['pulga'], sel: 'pulga', up: {}, best: 0, ads: {}, runs: 0, totalDist: 0 };
  const r = s.rally;
  if (!Array.isArray(r.owned)) r.owned = ['pulga'];
  if (!r.owned.includes('pulga')) r.owned.push('pulga');
  r.up ??= {};
  r.ads ??= {};
  r.best ??= 0;
  r.runs ??= 0;
  r.totalDist ??= 0;
  if (!r.owned.includes(r.sel)) r.sel = 'pulga';
  return r;
}

export const owns = (id: string): boolean => rallySave().owned.includes(id);
export const upLevel = (id: string, k: UpgradeKey): number => Math.max(0, Math.min(MAX_UP, rallySave().up[id]?.[k] ?? 0));

export function upCost(id: string, k: UpgradeKey): number | null {
  const lv = upLevel(id, k);
  if (lv >= MAX_UP) return null;
  const v = vehicleById(id);
  const mult = k === 'motor' ? 1.15 : k === 'tank' ? 1 : 0.9;
  return Math.round((v.upBase * Math.pow(lv + 1, 1.7) * mult) / 10) * 10;
}

export function buyUpgrade(id: string, k: UpgradeKey): boolean {
  const c = upCost(id, k);
  if (c === null || !owns(id)) return false;
  if (!spend({ coins: c })) return false;
  const r = rallySave();
  r.up[id] = { ...(r.up[id] ?? {}), [k]: upLevel(id, k) + 1 };
  persist();
  bus.emit('rally-garage');
  return true;
}

export function unlockVehicle(id: string): void {
  const r = rallySave();
  if (!r.owned.includes(id)) r.owned.push(id);
  r.sel = id;
  persist();
  bus.emit('rally-garage');
}

export function buyVehicle(id: string): boolean {
  const v = vehicleById(id);
  if (owns(id)) return true;
  if (v.price.coins && !spend({ coins: v.price.coins })) return false;
  if (v.price.gems && !spend({ gems: v.price.gems })) return false;
  if (v.price.ads) return false;
  unlockVehicle(id);
  return true;
}

/** Registra um vídeo assistido para veículos "por vídeo"; devolve true se desbloqueou. */
export function addVehicleAd(id: string): boolean {
  const v = vehicleById(id);
  const r = rallySave();
  r.ads[id] = (r.ads[id] ?? 0) + 1;
  persist();
  if (v.price.ads && r.ads[id] >= v.price.ads) {
    unlockVehicle(id);
    return true;
  }
  bus.emit('rally-garage');
  return false;
}

export function selectVehicle(id: string): void {
  if (!owns(id)) return;
  rallySave().sel = id;
  persist();
  bus.emit('rally-garage');
}

/** Stats efetivos (0..1 para barras) e parâmetros de física com melhorias. */
export interface CarStats {
  power: number;
  topSpeed: number;
  grip: number;
  spring: number;
  damp: number;
  fuel: number;
  airTorque: number;
}
export function effectiveStats(id: string, lv?: Partial<Record<UpgradeKey, number>>): CarStats {
  const v = vehicleById(id);
  const m = lv?.motor ?? upLevel(id, 'motor');
  const ti = lv?.tires ?? upLevel(id, 'tires');
  const su = lv?.susp ?? upLevel(id, 'susp');
  const ta = lv?.tank ?? upLevel(id, 'tank');
  return {
    power: v.power * (1 + m * 0.09),
    topSpeed: v.topSpeed * (1 + m * 0.06),
    grip: Math.min(1.25, v.grip * (1 + ti * 0.07)),
    spring: v.spring * (1 + su * 0.06),
    damp: v.damp * (1 + su * 0.1),
    fuel: v.fuel * (1 + ta * 0.16),
    airTorque: v.airTorque * (1 + su * 0.03),
  };
}

/** Semente da "Pista do dia": igual para todo mundo online no mesmo dia. */
export function trackSeed(): number {
  const d = new Date();
  return d.getUTCFullYear() * 400 + d.getUTCMonth() * 32 + d.getUTCDate();
}
