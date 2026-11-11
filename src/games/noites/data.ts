/* ============================================================
 *  NOITES DO ACAMPAMENTO — dados puros (sem DOM/three).
 *  Recursos, ~60 receitas da bancada, criaturas (Sombrinhas),
 *  noites especiais e chapéus (cosméticos por recorde).
 * ============================================================ */
import { t } from '../../i18n';

export const GAME_ID = 'noites';
export const GOAL_NIGHTS = 30;

/** duração das fases (s). ?noitesfast encurta (testes). */
const FAST = typeof location !== 'undefined' && /noitesfast/.test(location.search);
export const DAY_LEN = FAST ? 25 : 150;
export const NIGHT_LEN = FAST ? 25 : 115;
export const DUSK = 10; // últimos s do dia = entardecer

export const WORLD_R = 112;
export const CAMP_R = 13; // clareira sem árvores
export const BENCH_POS: [number, number] = [5.5, -3.5];
export const MAX_PLAYERS = 4;
export const BAG_BASE = 12;
export const HEARTS = 5;

/* ------------------------------ recursos ------------------------------ */
export type Res = 'wood' | 'stone' | 'scrap' | 'fiber' | 'spark' | 'berry' | 'mush' | 'apple' | 'carrot' | 'pumpkin' | 'coal' | 'fuel' | 'battery' | 'sap';
export const RES: Res[] = ['wood', 'stone', 'scrap', 'fiber', 'spark', 'berry', 'mush', 'apple', 'carrot', 'pumpkin', 'coal', 'fuel', 'battery', 'sap'];
/** alimentos crus (comer direto do saco) */
export const RAW_FOOD: Partial<Record<Res, number>> = { berry: 8, mush: 10, apple: 12, carrot: 12, pumpkin: 16 };

export function resName(r: Res): string {
  switch (r) {
    case 'wood':
      return t('noites.r.wood', 'Lenha');
    case 'stone':
      return t('noites.r.stone', 'Pedra');
    case 'scrap':
      return t('noites.r.scrap', 'Sucata');
    case 'fiber':
      return t('noites.r.fiber', 'Fibra');
    case 'spark':
      return t('noites.r.spark', 'Brilhinho');
    case 'berry':
      return t('noites.r.berry', 'Frutinhas');
    case 'mush':
      return t('noites.r.mush', 'Cogumelo');
    case 'apple':
      return t('noites.r.apple', 'Maçã');
    case 'carrot':
      return t('noites.r.carrot', 'Cenoura');
    case 'pumpkin':
      return t('noites.r.pumpkin', 'Abóbora');
    case 'coal':
      return t('noites.r.coal', 'Carvão');
    case 'fuel':
      return t('noites.r.fuel', 'Combustível');
    case 'battery':
      return t('noites.r.battery', 'Bateria');
    case 'sap':
      return t('noites.r.sap', 'Seiva');
  }
}

/* ------------------------------ itens ------------------------------ */
export type Cat = 'tool' | 'light' | 'build' | 'food' | 'wear' | 'camp';
export type Slot = 'head' | 'neck' | 'body' | 'feet' | 'back' | 'cape';
export type PlaceKind =
  | 'torch'
  | 'fence'
  | 'bedroll'
  | 'tent'
  | 'pot'
  | 'trap'
  | 'tower'
  | 'post'
  | 'scare'
  | 'bell'
  | 'logbench'
  | 'garden'
  | 'berrybed'
  | 'drum'
  | 'glowshroom'
  | 'kiln'
  | 'still'
  | 'charger'
  | 'solar'
  | 'garage';

export interface PlaceDef {
  kind: PlaceKind;
  /** raio de luz (afasta Sombrinhas) */
  light?: number;
  /** luz que acaba: segundos de queima (tocha) */
  burn?: number;
  /** cor da luz */
  lc?: string;
  /** cerca: pontos de vida (Sombrinhas empurram) */
  hp?: number;
  /** tamanho de colisão (m) */
  size?: number;
  /** variante visual 0..2 */
  v?: number;
}

export interface ItemDef {
  id: string;
  cat: Cat;
  tier: 1 | 2 | 3 | 4;
  cost: Partial<Record<Res, number>>;
  icon: string;
  col: string;
  n: () => string;
  /** machado: força do golpe */
  axe?: number;
  /** martelo de travesseiro: dano em Sombrinhas */
  bonk?: number;
  /** lanterna de mão: [alcance m, dano/s, meio-ângulo rad] */
  lamp?: [number, number, number];
  /** arremessável de luz (consumível) */
  throwLight?: { r: number; t: number; dmg: number };
  place?: PlaceDef;
  food?: { hunger: number; warmth?: number; hearts?: number };
  /** precisa da panela montada */
  pot?: boolean;
  wear?: { slot: Slot; warm?: number; speed?: number; cap?: number; glow?: number };
  camp?: 'bench' | 'ring' | 'bellows' | 'bigfire' | 'compass';
  /** nível que a bancada vira (camp:'bench') */
  benchTo?: number;
  /** quantos vêm por receita */
  qty?: number;
}

const I = (d: ItemDef) => d;
export const ITEMS: ItemDef[] = [
  /* ---------- ferramentas ---------- */
  I({ id: 'axe2', cat: 'tool', tier: 1, cost: { wood: 4, scrap: 2 }, icon: 'axe', col: '#b8c4d8', axe: 2, n: () => t('noites.it.axe2', 'Machado de Lata') }),
  I({ id: 'axe3', cat: 'tool', tier: 2, cost: { wood: 6, scrap: 5, stone: 3 }, icon: 'axe', col: '#7ad0ff', axe: 3, n: () => t('noites.it.axe3', 'Machado de Ferro') }),
  I({ id: 'axe4', cat: 'tool', tier: 3, cost: { wood: 8, scrap: 8, spark: 6 }, icon: 'axe', col: '#ffd34a', axe: 4.5, n: () => t('noites.it.axe4', 'Machado Brilhante') }),
  I({ id: 'axe5', cat: 'tool', tier: 4, cost: { wood: 10, scrap: 12, spark: 14 }, icon: 'axe', col: '#ff8fd8', axe: 6.5, n: () => t('noites.it.axe5', 'Machado Estelar') }),
  I({ id: 'bonk1', cat: 'tool', tier: 1, cost: { fiber: 4, wood: 2 }, icon: 'hammer', col: '#ffb3d9', bonk: 1, n: () => t('noites.it.bonk1', 'Martelo de Travesseiro') }),
  I({ id: 'bonk2', cat: 'tool', tier: 2, cost: { fiber: 6, scrap: 3, spark: 3 }, icon: 'hammer', col: '#9dffcb', bonk: 2, n: () => t('noites.it.bonk2', 'Martelo de Pelúcia') }),
  I({ id: 'bonk3', cat: 'tool', tier: 3, cost: { fiber: 8, scrap: 6, spark: 8 }, icon: 'hammer', col: '#ffe45c', bonk: 4, n: () => t('noites.it.bonk3', 'Martelo de Estrelinha') }),
  /* ---------- luz ---------- */
  I({ id: 'lamp2', cat: 'light', tier: 1, cost: { scrap: 4, spark: 2 }, icon: 'lamp', col: '#ffe680', lamp: [13, 2.2, 0.42], n: () => t('noites.it.lamp2', 'Lanterna Forte') }),
  I({ id: 'lamp3', cat: 'light', tier: 2, cost: { scrap: 7, spark: 6 }, icon: 'lamp', col: '#9ffcff', lamp: [17, 3.4, 0.48], n: () => t('noites.it.lamp3', 'Lanterna Azulada') }),
  I({ id: 'lamp4', cat: 'light', tier: 3, cost: { scrap: 10, spark: 12 }, icon: 'lamp', col: '#ff9ff3', lamp: [22, 5, 0.55], n: () => t('noites.it.lamp4', 'Lanterna Estelar') }),
  I({ id: 'torch', cat: 'light', tier: 1, cost: { wood: 2, fiber: 1 }, icon: 'torch', col: '#ff9a2e', qty: 2, place: { kind: 'torch', light: 5, burn: 200, lc: '#ffa040', size: 0.3 }, n: () => t('noites.it.torch', 'Tocha') }),
  I({ id: 'flare', cat: 'light', tier: 1, cost: { scrap: 1, spark: 1 }, icon: 'flare', col: '#ff4f6a', qty: 2, throwLight: { r: 9, t: 7, dmg: 4 }, n: () => t('noites.it.flare', 'Sinalizador') }),
  I({ id: 'bubble', cat: 'light', tier: 2, cost: { sap: 1, spark: 2 }, icon: 'bubble', col: '#9ffcff', qty: 3, throwLight: { r: 5, t: 4, dmg: 6 }, n: () => t('noites.it.bubble', 'Bolha de Luz') }),
  I({ id: 'flare2', cat: 'light', tier: 3, cost: { scrap: 2, spark: 4 }, icon: 'flare', col: '#ffd34a', qty: 2, throwLight: { r: 15, t: 10, dmg: 8 }, n: () => t('noites.it.flare2', 'Super Sinalizador') }),
  I({ id: 'orb', cat: 'light', tier: 3, cost: { spark: 6, stone: 2 }, icon: 'orb', col: '#c9a3ff', throwLight: { r: 8, t: 30, dmg: 3 }, n: () => t('noites.it.orb', 'Orbe de Luz') }),
  I({ id: 'post', cat: 'light', tier: 2, cost: { wood: 4, scrap: 3, spark: 2 }, icon: 'post', col: '#ffe680', place: { kind: 'post', light: 7, lc: '#ffe39a', size: 0.4 }, n: () => t('noites.it.post', 'Poste de Lampião') }),
  I({ id: 'tower1', cat: 'light', tier: 2, cost: { wood: 8, scrap: 4, spark: 4 }, icon: 'tower', col: '#ffd34a', place: { kind: 'tower', light: 10, lc: '#fff0b0', size: 0.9, v: 0 }, n: () => t('noites.it.tower1', 'Torre de Luz') }),
  I({ id: 'tower2', cat: 'light', tier: 3, cost: { wood: 12, scrap: 8, spark: 10 }, icon: 'tower', col: '#9ffcff', place: { kind: 'tower', light: 14, lc: '#c8f4ff', size: 1, v: 1 }, n: () => t('noites.it.tower2', 'Torre de Luz Grande') }),
  I({ id: 'tower3', cat: 'light', tier: 4, cost: { stone: 12, scrap: 12, spark: 20 }, icon: 'tower', col: '#ff9ff3', place: { kind: 'tower', light: 19, lc: '#ffd8fa', size: 1.2, v: 2 }, n: () => t('noites.it.tower3', 'Farol Estelar') }),
  I({ id: 'glowshroom', cat: 'light', tier: 2, cost: { mush: 2, spark: 1 }, icon: 'shroom', col: '#7affd8', qty: 2, place: { kind: 'glowshroom', light: 3.5, lc: '#7affd8', size: 0.3 }, n: () => t('noites.it.glowshroom', 'Cogumelo Luminoso') }),
  I({ id: 'trap', cat: 'light', tier: 1, cost: { scrap: 1, spark: 2, fiber: 1 }, icon: 'jar', col: '#c8ff6a', place: { kind: 'trap', size: 0.4 }, n: () => t('noites.it.trap', 'Pote de Vagalumes') }),
  /* ---------- construir ---------- */
  I({ id: 'fence1', cat: 'build', tier: 1, cost: { wood: 3 }, icon: 'fence', col: '#c08a52', place: { kind: 'fence', hp: 6, size: 1.6, v: 0 }, n: () => t('noites.it.fence1', 'Cerca de Gravetos') }),
  I({ id: 'fence2', cat: 'build', tier: 2, cost: { wood: 2, stone: 4 }, icon: 'fence', col: '#a8b0c0', place: { kind: 'fence', hp: 14, size: 1.6, v: 1 }, n: () => t('noites.it.fence2', 'Cerca de Pedra') }),
  I({ id: 'fence3', cat: 'build', tier: 3, cost: { stone: 4, spark: 3 }, icon: 'fence', col: '#9ffcff', place: { kind: 'fence', hp: 24, size: 1.6, v: 2, light: 1.6, lc: '#9ffcff' }, n: () => t('noites.it.fence3', 'Cerca Brilhante') }),
  I({ id: 'scare', cat: 'build', tier: 2, cost: { wood: 4, fiber: 4, spark: 3 }, icon: 'scare', col: '#ffd34a', place: { kind: 'scare', light: 6, lc: '#ffe680', size: 0.5 }, n: () => t('noites.it.scare', 'Espantalho Brilhante') }),
  I({ id: 'bell', cat: 'build', tier: 1, cost: { scrap: 2, wood: 1 }, icon: 'bell', col: '#ffcf2e', place: { kind: 'bell', size: 0.4 }, n: () => t('noites.it.bell', 'Sininho de Alerta') }),
  I({ id: 'bedroll', cat: 'build', tier: 1, cost: { fiber: 4 }, icon: 'bed', col: '#8ad8ff', place: { kind: 'bedroll', size: 0.9 }, n: () => t('noites.it.bedroll', 'Saco de Dormir') }),
  I({ id: 'tent', cat: 'build', tier: 2, cost: { fiber: 8, wood: 4 }, icon: 'tent', col: '#ff8a3a', place: { kind: 'tent', size: 1.6, light: 2.5, lc: '#ffb070' }, n: () => t('noites.it.tent', 'Barraca') }),
  I({ id: 'logbench', cat: 'build', tier: 1, cost: { wood: 4 }, icon: 'logbench', col: '#9a6a3c', place: { kind: 'logbench', size: 1 }, n: () => t('noites.it.logbench', 'Banco de Troncos') }),
  I({ id: 'pot', cat: 'build', tier: 1, cost: { stone: 3, scrap: 2 }, icon: 'pot', col: '#5a6478', place: { kind: 'pot', size: 0.6 }, n: () => t('noites.it.pot', 'Panela de Ensopado') }),
  I({ id: 'garden', cat: 'build', tier: 2, cost: { wood: 3, carrot: 2 }, icon: 'garden', col: '#ff9a2e', place: { kind: 'garden', size: 1.1 }, n: () => t('noites.it.garden', 'Hortinha de Cenoura') }),
  I({ id: 'berrybed', cat: 'build', tier: 1, cost: { wood: 2, berry: 3 }, icon: 'garden', col: '#ff5d8f', place: { kind: 'berrybed', size: 1.1 }, n: () => t('noites.it.berrybed', 'Canteiro de Frutinhas') }),
  I({ id: 'drum', cat: 'build', tier: 3, cost: { wood: 6, fiber: 4, spark: 5 }, icon: 'drum', col: '#ff4f6a', place: { kind: 'drum', size: 0.6 }, n: () => t('noites.it.drum', 'Tambor da Coragem') }),
  I({ id: 'kiln', cat: 'build', tier: 2, cost: { stone: 8, wood: 2 }, icon: 'kiln', col: '#8a7a6a', place: { kind: 'kiln', size: 1 }, n: () => t('noites.it.kiln', 'Forno de Carvão') }),
  I({ id: 'still', cat: 'build', tier: 2, cost: { scrap: 6, stone: 2 }, icon: 'still', col: '#7ad0ff', place: { kind: 'still', size: 0.8 }, n: () => t('noites.it.still', 'Destilador de Seiva') }),
  I({ id: 'charger', cat: 'build', tier: 3, cost: { scrap: 8, spark: 4 }, icon: 'battery', col: '#7aff8a', place: { kind: 'charger', size: 0.7 }, n: () => t('noites.it.charger', 'Montador de Baterias') }),
  I({ id: 'solar', cat: 'build', tier: 3, cost: { scrap: 6, spark: 6, stone: 2 }, icon: 'solar', col: '#3a8aff', place: { kind: 'solar', size: 1 }, n: () => t('noites.it.solar', 'Painel Solar') }),
  I({ id: 'garage', cat: 'build', tier: 2, cost: { wood: 12, scrap: 6, stone: 4 }, icon: 'garage', col: '#ffb02e', place: { kind: 'garage', size: 2.4 }, n: () => t('noites.it.garage', 'Garagem') }),
  /* ---------- comida ---------- */
  I({ id: 'salad', cat: 'food', tier: 1, cost: { apple: 1, berry: 2 }, icon: 'bowl', col: '#ff5d8f', food: { hunger: 30 }, n: () => t('noites.it.salad', 'Salada de Frutas') }),
  I({ id: 'skewer', cat: 'food', tier: 1, cost: { mush: 2, wood: 1 }, icon: 'skewer', col: '#c08a52', food: { hunger: 28, warmth: 8 }, n: () => t('noites.it.skewer', 'Espetinho de Cogumelo') }),
  I({ id: 'roast', cat: 'food', tier: 1, cost: { pumpkin: 1 }, icon: 'pumpkin', col: '#ff9a2e', food: { hunger: 34, warmth: 10 }, n: () => t('noites.it.roast', 'Abóbora Assada') }),
  I({ id: 'tea', cat: 'food', tier: 1, cost: { berry: 1, fiber: 1 }, icon: 'cup', col: '#c97a4a', food: { hunger: 6, warmth: 45 }, n: () => t('noites.it.tea', 'Chá Quentinho') }),
  I({ id: 'stew', cat: 'food', tier: 1, cost: { mush: 2, carrot: 1 }, icon: 'bowl', col: '#c97a4a', pot: true, food: { hunger: 55, warmth: 25, hearts: 1 }, n: () => t('noites.it.stew', 'Ensopado da Floresta') }),
  I({ id: 'pie', cat: 'food', tier: 2, cost: { apple: 2, berry: 1, wood: 1 }, icon: 'pie', col: '#e8a85a', food: { hunger: 60, hearts: 1 }, n: () => t('noites.it.pie', 'Torta de Maçã') }),
  I({ id: 'soup', cat: 'food', tier: 2, cost: { pumpkin: 1, carrot: 1 }, icon: 'bowl', col: '#ff9a2e', pot: true, food: { hunger: 70, warmth: 35, hearts: 2 }, n: () => t('noites.it.soup', 'Sopa de Abóbora') }),
  I({ id: 'cocoa', cat: 'food', tier: 3, cost: { berry: 2, sap: 1 }, icon: 'cup', col: '#7a4a2a', food: { hunger: 20, warmth: 80, hearts: 1 }, n: () => t('noites.it.cocoa', 'Chocolate Quente') }),
  I({ id: 'heal', cat: 'food', tier: 1, cost: { fiber: 2, berry: 1 }, icon: 'heal', col: '#7aff8a', food: { hunger: 0, hearts: 2 }, n: () => t('noites.it.heal', 'Curativo de Folhinha') }),
  I({ id: 'feast', cat: 'food', tier: 4, cost: { pumpkin: 2, carrot: 2, apple: 2, mush: 2 }, icon: 'pie', col: '#ffd34a', pot: true, qty: 3, food: { hunger: 100, warmth: 60, hearts: 5 }, n: () => t('noites.it.feast', 'Banquete do Acampamento') }),
  /* ---------- roupas ---------- */
  I({ id: 'scarf', cat: 'wear', tier: 1, cost: { fiber: 3 }, icon: 'scarf', col: '#ff4f6a', wear: { slot: 'neck', warm: 0.25 }, n: () => t('noites.it.scarf', 'Cachecol') }),
  I({ id: 'beanie', cat: 'wear', tier: 1, cost: { fiber: 4 }, icon: 'beanie', col: '#3a8aff', wear: { slot: 'head', warm: 0.2 }, n: () => t('noites.it.beanie', 'Gorro Fofinho') }),
  I({ id: 'coat', cat: 'wear', tier: 2, cost: { fiber: 10, scrap: 1 }, icon: 'coat', col: '#ffb02e', wear: { slot: 'body', warm: 0.45 }, n: () => t('noites.it.coat', 'Casaco Fofo') }),
  I({ id: 'boots1', cat: 'wear', tier: 2, cost: { fiber: 4, scrap: 2 }, icon: 'boots', col: '#9a6a3c', wear: { slot: 'feet', speed: 0.15 }, n: () => t('noites.it.boots1', 'Botas Ligeiras') }),
  I({ id: 'boots2', cat: 'wear', tier: 3, cost: { fiber: 6, spark: 6 }, icon: 'boots', col: '#e0f4ff', wear: { slot: 'feet', speed: 0.3 }, n: () => t('noites.it.boots2', 'Botas de Nuvem') }),
  I({ id: 'bag2', cat: 'wear', tier: 1, cost: { fiber: 5, wood: 2 }, icon: 'bag', col: '#c08a52', wear: { slot: 'back', cap: 22 }, n: () => t('noites.it.bag2', 'Mochila Média') }),
  I({ id: 'bag3', cat: 'wear', tier: 3, cost: { fiber: 10, scrap: 4 }, icon: 'bag', col: '#3ec05a', wear: { slot: 'back', cap: 36 }, n: () => t('noites.it.bag3', 'Mochila Grande') }),
  I({ id: 'cape', cat: 'wear', tier: 4, cost: { fiber: 8, spark: 16 }, icon: 'cape', col: '#c8ff6a', wear: { slot: 'cape', glow: 4.5, warm: 0.2 }, n: () => t('noites.it.cape', 'Capa de Vagalume') }),
  I({ id: 'lantern', cat: 'wear', tier: 2, cost: { scrap: 4, spark: 3 }, icon: 'lantern', col: '#ffd34a', wear: { slot: 'cape', glow: 3.2 }, n: () => t('noites.it.lantern', 'Lampião de Cinto') }),
  /* ---------- acampamento ---------- */
  I({ id: 'bench2', cat: 'camp', tier: 1, cost: { wood: 10, stone: 4, scrap: 3 }, icon: 'bench', col: '#c08a52', camp: 'bench', benchTo: 2, n: () => t('noites.it.bench2', 'Bancada Nível 2') }),
  I({ id: 'bench3', cat: 'camp', tier: 2, cost: { wood: 16, stone: 8, scrap: 8, spark: 6 }, icon: 'bench', col: '#7ad0ff', camp: 'bench', benchTo: 3, n: () => t('noites.it.bench3', 'Bancada Nível 3') }),
  I({ id: 'bench4', cat: 'camp', tier: 3, cost: { wood: 24, stone: 12, scrap: 14, spark: 14 }, icon: 'bench', col: '#ff9ff3', camp: 'bench', benchTo: 4, n: () => t('noites.it.bench4', 'Bancada Nível 4') }),
  I({ id: 'ring', cat: 'camp', tier: 1, cost: { stone: 6 }, icon: 'ring', col: '#a8b0c0', camp: 'ring', n: () => t('noites.it.ring', 'Anel de Pedras da Fogueira') }),
  I({ id: 'bellows', cat: 'camp', tier: 2, cost: { fiber: 6, wood: 4, scrap: 2 }, icon: 'bellows', col: '#c97a4a', camp: 'bellows', n: () => t('noites.it.bellows', 'Fole Mágico') }),
  I({ id: 'bigfire', cat: 'camp', tier: 3, cost: { stone: 12, spark: 8 }, icon: 'fire', col: '#ff9a2e', camp: 'bigfire', n: () => t('noites.it.bigfire', 'Fogueira Gigante') }),
  I({ id: 'compass', cat: 'camp', tier: 1, cost: { scrap: 2, spark: 1 }, icon: 'compass', col: '#ffd34a', camp: 'compass', n: () => t('noites.it.compass', 'Bússola de Bebês') }),
];
export const ITEM: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((d) => [d.id, d]));

/** bancada: quantos bebês resgatados liberam cada nível */
export const BENCH_BABIES = [0, 0, 1, 3, 6];
export const BABIES = 8;

export function catName(c: Cat): string {
  switch (c) {
    case 'tool':
      return t('noites.cat.tool', 'Ferramentas');
    case 'light':
      return t('noites.cat.light', 'Luz');
    case 'build':
      return t('noites.cat.build', 'Construir');
    case 'food':
      return t('noites.cat.food', 'Comida');
    case 'wear':
      return t('noites.cat.wear', 'Roupas');
    case 'camp':
      return t('noites.cat.camp', 'Acampamento');
  }
}
export const CATS: Cat[] = ['tool', 'light', 'build', 'food', 'wear', 'camp'];

/* ------------------------------ Sombrinhas ------------------------------ */
export const enum CK {
  Small = 0,
  Hopper = 1,
  Big = 2,
  Mist = 3,
  King = 4,
}
export interface CDef {
  hp: number;
  speed: number;
  size: number;
  /** de qual noite aparecem */
  from: number;
  spark: number;
}
export const CDEFS: CDef[] = [
  { hp: 3, speed: 2.2, size: 0.8, from: 1, spark: 1 },
  { hp: 2.5, speed: 3.6, size: 0.65, from: 3, spark: 1 },
  { hp: 9, speed: 1.5, size: 1.5, from: 5, spark: 3 },
  { hp: 4, speed: 2.6, size: 0.9, from: 4, spark: 2 },
  { hp: 90, speed: 1.1, size: 4.2, from: 10, spark: 25 },
];

export interface NightInfo {
  fog: boolean;
  boss: boolean;
  moon: boolean;
  /** criaturas vivas ao mesmo tempo */
  cap: number;
  /** segundos entre aparições */
  every: number;
  /** escuridão 0..1 */
  dark: number;
}
export function nightInfo(n: number): NightInfo {
  const boss = n > 0 && n % 10 === 0;
  const fog = !boss && n >= 4 && n % 4 === 0;
  const moon = !boss && !fog && n >= 3 && n % 7 === 3;
  return {
    boss,
    fog,
    moon,
    cap: Math.min(30, 4 + Math.round(n * 1.3) + (fog ? 4 : 0)),
    every: Math.max(0.9, 4.2 - n * 0.14) * (fog ? 0.8 : 1),
    dark: Math.min(1, 0.55 + n * 0.03),
  };
}

/* ------------------------------ chapéus (recordes) ------------------------------ */
export interface HatDef {
  id: string;
  need: number;
  col: string;
  n: () => string;
}
export const HATS: HatDef[] = [
  { id: 'none', need: 0, col: '#ffffff', n: () => t('noites.hat.none', 'Sem chapéu') },
  { id: 'leaf', need: 0, col: '#3ec05a', n: () => t('noites.hat.leaf', 'Folhinha') },
  { id: 'acorn', need: 2, col: '#9a6a3c', n: () => t('noites.hat.acorn', 'Chapéu de Bolota') },
  { id: 'mush', need: 5, col: '#ff4f6a', n: () => t('noites.hat.mush', 'Chapéu de Cogumelo') },
  { id: 'star', need: 8, col: '#ffd34a', n: () => t('noites.hat.star', 'Estrela Cadente') },
  { id: 'crown', need: 10, col: '#ffcf2e', n: () => t('noites.hat.crown', 'Coroa de Vagalumes') },
  { id: 'moon', need: 20, col: '#c8d8ff', n: () => t('noites.hat.moon', 'Lua Crescente') },
  { id: 'sun', need: 30, col: '#ff9a2e', n: () => t('noites.hat.sun', 'Sol Nascente') },
];

/* ------------------------------ util ------------------------------ */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const TAU = Math.PI * 2;
