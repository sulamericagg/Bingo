/* ============================================================
 *  JANGADA BLOOP — dados puros (sem three/DOM): itens, peças,
 *  receitas, comida, dificuldade e missões.
 *  Índices numéricos (idx) são estáveis (rede/salvamento): só acrescentar.
 * ============================================================ */
import { t } from '../../i18n';

/* ------------------------------ itens ------------------------------ */
export type Mat = 'wood' | 'plastic' | 'leaf' | 'rope' | 'scrap' | 'stone' | 'clay' | 'seaweed' | 'shell' | 'seed';
export type Food = 'fish' | 'fishc' | 'bigfish' | 'bigfishc' | 'potato' | 'potatoc' | 'coco' | 'berry' | 'water';
export type Tool = 'hook' | 'hook2' | 'hammer' | 'spear' | 'spear2' | 'axe' | 'rod' | 'lantern';
export type ItemId = Mat | Food | Tool;
export type Bag = Partial<Record<ItemId, number>>;

export interface ItemDef {
  id: ItemId;
  kind: 'mat' | 'food' | 'tool';
  col: string;
  n: () => string;
}
const I = (id: ItemId, kind: ItemDef['kind'], col: string, n: () => string): ItemDef => ({ id, kind, col, n });
export const ITEMS: ItemDef[] = [
  I('wood', 'mat', '#c88a4a', () => t('jangada.i.wood', 'Tábua')),
  I('plastic', 'mat', '#5ec8ff', () => t('jangada.i.plastic', 'Plástico')),
  I('leaf', 'mat', '#5cc85a', () => t('jangada.i.leaf', 'Folha')),
  I('rope', 'mat', '#e8c27a', () => t('jangada.i.rope', 'Corda')),
  I('scrap', 'mat', '#aab4c8', () => t('jangada.i.scrap', 'Sucata')),
  I('stone', 'mat', '#9a98a8', () => t('jangada.i.stone', 'Pedra')),
  I('clay', 'mat', '#d8865a', () => t('jangada.i.clay', 'Argila')),
  I('seaweed', 'mat', '#3aa86a', () => t('jangada.i.seaweed', 'Alga')),
  I('shell', 'mat', '#ffb8d0', () => t('jangada.i.shell', 'Concha')),
  I('seed', 'mat', '#b88a3a', () => t('jangada.i.seed', 'Semente de batata')),
  I('fish', 'food', '#8ad0ff', () => t('jangada.i.fish', 'Peixe cru')),
  I('fishc', 'food', '#ffb05a', () => t('jangada.i.fishc', 'Peixe assado')),
  I('bigfish', 'food', '#6aa8ff', () => t('jangada.i.bigfish', 'Peixão cru')),
  I('bigfishc', 'food', '#ff9a3a', () => t('jangada.i.bigfishc', 'Peixão assado')),
  I('potato', 'food', '#d8b06a', () => t('jangada.i.potato', 'Batata')),
  I('potatoc', 'food', '#e89a3a', () => t('jangada.i.potatoc', 'Batata assada')),
  I('coco', 'food', '#8a5a32', () => t('jangada.i.coco', 'Coco')),
  I('berry', 'food', '#ff4f8a', () => t('jangada.i.berry', 'Frutinha')),
  I('water', 'food', '#4fd8ff', () => t('jangada.i.water', 'Água doce')),
  I('hook', 'tool', '#c8d0e0', () => t('jangada.i.hook', 'Gancho')),
  I('hook2', 'tool', '#7fe0ff', () => t('jangada.i.hook2', 'Gancho de metal')),
  I('hammer', 'tool', '#ffb03a', () => t('jangada.i.hammer', 'Martelo')),
  I('spear', 'tool', '#c8a070', () => t('jangada.i.spear', 'Lança')),
  I('spear2', 'tool', '#9ae0ff', () => t('jangada.i.spear2', 'Lança de metal')),
  I('axe', 'tool', '#ff7a5a', () => t('jangada.i.axe', 'Machado')),
  I('rod', 'tool', '#7ad86a', () => t('jangada.i.rod', 'Vara de pesca')),
  I('lantern', 'tool', '#ffe45c', () => t('jangada.i.lantern', 'Lanterna')),
];
export const ITEM = Object.fromEntries(ITEMS.map((d) => [d.id, d])) as Record<ItemId, ItemDef>;
export const isTool = (id: ItemId) => ITEM[id]?.kind === 'tool';
export const isFood = (id: ItemId) => ITEM[id]?.kind === 'food';
export const itemName = (id: ItemId) => ITEM[id]?.n() ?? id;
/** ordem da barra de atalhos: ferramentas primeiro, depois comida */
export const HOT_ORDER: ItemId[] = ['hook2', 'hook', 'hammer', 'spear2', 'spear', 'axe', 'rod', 'lantern', 'water', 'coco', 'berry', 'fishc', 'bigfishc', 'potatoc', 'fish', 'bigfish', 'potato'];

/** comida: [fome, sede, vida] */
export const FOOD: Record<Food, [number, number, number]> = {
  fish: [8, -2, 0],
  fishc: [30, 0, 5],
  bigfish: [12, -3, 0],
  bigfishc: [52, 0, 10],
  potato: [8, 0, 0],
  potatoc: [28, 2, 5],
  coco: [12, 18, 0],
  berry: [8, 5, 2],
  water: [0, 38, 0],
};
/** cru → assado (fogueira) */
export const COOK: Partial<Record<ItemId, ItemId>> = { fish: 'fishc', bigfish: 'bigfishc', potato: 'potatoc' };
/** combustível (segundos de fogo por unidade) */
export const FUEL: Partial<Record<ItemId, number>> = { wood: 45, leaf: 15, seaweed: 20 };

/* ------------------------------ peças da jangada ------------------------------ */
export type PK = 'found' | 'net' | 'floor' | 'pillar' | 'wall' | 'rail' | 'stairs' | 'chest' | 'bed' | 'fire' | 'purifier' | 'planter' | 'sail' | 'anchor' | 'lamp' | 'flag';
export interface PieceDef {
  id: PK;
  idx: number;
  cost: Bag;
  hp: number;
  /** onde fica: 'found' piso (nível 0), 'water' na água ao lado, 'surf' piso de cima (nível 1), 'obj' objeto sobre um piso */
  slot: 'found' | 'water' | 'surf' | 'obj';
  /** liga com vizinhos iguais (cerca/parede) */
  link?: boolean;
  /** nível mínimo da fogueira para construir */
  fire?: number;
  /** gira (escada, vela) */
  rot?: boolean;
  /** pode ficar no piso de cima também */
  up?: boolean;
  col: string;
  n: () => string;
  say: () => string;
}
const P = (d: PieceDef) => d;
export const PIECES: PieceDef[] = [
  P({ id: 'found', idx: 0, cost: { wood: 2, plastic: 2 }, hp: 100, slot: 'found', col: '#c88a4a', n: () => t('jangada.p.found', 'Piso'), say: () => t('jangada.s.found', 'Aumente a jangada pela beirada!') }),
  P({ id: 'net', idx: 1, cost: { rope: 3, wood: 2 }, hp: 60, slot: 'water', col: '#e8c27a', n: () => t('jangada.p.net', 'Rede'), say: () => t('jangada.s.net', 'A rede pega o que passar boiando.') }),
  P({ id: 'floor', idx: 2, cost: { wood: 4, rope: 1 }, hp: 80, slot: 'surf', col: '#d89a5a', n: () => t('jangada.p.floor', 'Andar de cima'), say: () => t('jangada.s.floor', 'Precisa de pilar, parede ou escada embaixo.') }),
  P({ id: 'pillar', idx: 3, cost: { wood: 2, rope: 1 }, hp: 80, slot: 'obj', col: '#a8703a', n: () => t('jangada.p.pillar', 'Pilar'), say: () => t('jangada.s.pillar', 'Segura o andar de cima.') }),
  P({ id: 'wall', idx: 4, cost: { wood: 4 }, hp: 90, slot: 'obj', link: true, up: true, col: '#b87a42', n: () => t('jangada.p.wall', 'Parede'), say: () => t('jangada.s.wall', 'Paredes se juntam sozinhas.') }),
  P({ id: 'rail', idx: 5, cost: { wood: 2, rope: 1 }, hp: 60, slot: 'obj', link: true, up: true, col: '#d8a060', n: () => t('jangada.p.rail', 'Cerca'), say: () => t('jangada.s.rail', 'Cerca na beirada: ninguém cai!') }),
  P({ id: 'stairs', idx: 6, cost: { wood: 6, rope: 2 }, hp: 80, slot: 'obj', rot: true, col: '#c08048', n: () => t('jangada.p.stairs', 'Escada'), say: () => t('jangada.s.stairs', 'Sobe para o andar de cima.') }),
  P({ id: 'chest', idx: 7, cost: { wood: 6, plastic: 2 }, hp: 60, slot: 'obj', up: true, rot: true, col: '#b0703a', n: () => t('jangada.p.chest', 'Baú'), say: () => t('jangada.s.chest', 'Guarde coisas. Cuidado com o fantasminha!') }),
  P({ id: 'bed', idx: 8, cost: { wood: 6, leaf: 6 }, hp: 60, slot: 'obj', up: true, rot: true, col: '#7ac8ff', n: () => t('jangada.p.bed', 'Cama'), say: () => t('jangada.s.bed', 'Durma à noite e acorde aqui.') }),
  P({ id: 'fire', idx: 9, cost: { wood: 5, rope: 2, leaf: 3 }, hp: 70, slot: 'obj', col: '#ff8a3a', n: () => t('jangada.p.fire', 'Fogueira'), say: () => t('jangada.s.fire', 'Assa comida. Fogo maior = mais receitas!') }),
  P({ id: 'purifier', idx: 10, cost: { plastic: 6, leaf: 4, rope: 1 }, hp: 60, slot: 'obj', col: '#4fd8ff', n: () => t('jangada.p.purifier', 'Purificador'), say: () => t('jangada.s.purifier', 'Ferve a água do mar: vira água doce.') }),
  P({ id: 'planter', idx: 11, cost: { wood: 4, rope: 2, plastic: 2 }, hp: 60, slot: 'obj', up: true, col: '#7ad86a', n: () => t('jangada.p.planter', 'Horta'), say: () => t('jangada.s.planter', 'Plante sementes de batata.') }),
  P({ id: 'sail', idx: 12, cost: { wood: 8, rope: 6, plastic: 4, leaf: 4 }, hp: 80, slot: 'obj', col: '#fff3d6', n: () => t('jangada.p.sail', 'Vela'), say: () => t('jangada.s.sail', 'Abra a vela para ir para onde você olha!') }),
  P({ id: 'anchor', idx: 13, cost: { wood: 4, rope: 4, scrap: 2 }, hp: 90, slot: 'obj', col: '#8a94a8', n: () => t('jangada.p.anchor', 'Âncora'), say: () => t('jangada.s.anchor', 'Para a jangada (perto de ilhas!).') }),
  P({ id: 'lamp', idx: 14, cost: { wood: 2, leaf: 2, scrap: 1 }, hp: 40, slot: 'obj', up: true, fire: 2, col: '#ffd34a', n: () => t('jangada.p.lamp', 'Lampião'), say: () => t('jangada.s.lamp', 'Luz à noite: o fantasminha não gosta!') }),
  P({ id: 'flag', idx: 15, cost: { wood: 2, plastic: 2 }, hp: 30, slot: 'obj', up: true, col: '#ff4fa3', n: () => t('jangada.p.flag', 'Bandeira Bloop'), say: () => t('jangada.s.flag', 'A bandeira da sua jangada!') }),
];
export const PIECE = Object.fromEntries(PIECES.map((d) => [d.id, d])) as Record<PK, PieceDef>;
export const BUILD_ORDER: PK[] = ['found', 'rail', 'wall', 'fire', 'purifier', 'chest', 'bed', 'net', 'planter', 'sail', 'anchor', 'pillar', 'stairs', 'floor', 'lamp', 'flag'];

/** níveis da fogueira (custo para subir PARA o nível n) */
export const FIRE_UP: Record<number, Bag> = {
  2: { scrap: 3, stone: 4 },
  3: { scrap: 5, clay: 4, stone: 4 },
};
export const FIRE_MAX = 3;

/* ------------------------------ receitas ------------------------------ */
export type Cat = 'mat' | 'tool' | 'build' | 'food';
export interface Recipe {
  id: string;
  out: ItemId;
  n: number;
  cost: Bag;
  fire?: number;
  cat: Cat;
}
export const RECIPES: Recipe[] = [
  { id: 'rope', out: 'rope', n: 1, cost: { leaf: 2 }, cat: 'mat' },
  { id: 'rope2', out: 'rope', n: 1, cost: { seaweed: 2 }, cat: 'mat' },
  { id: 'spear', out: 'spear', n: 1, cost: { wood: 4, rope: 2 }, cat: 'tool' },
  { id: 'rod', out: 'rod', n: 1, cost: { wood: 4, rope: 4 }, cat: 'tool' },
  { id: 'axe', out: 'axe', n: 1, cost: { wood: 3, rope: 2, scrap: 2 }, cat: 'tool' },
  { id: 'hook2', out: 'hook2', n: 1, cost: { scrap: 4, rope: 3 }, fire: 2, cat: 'tool' },
  { id: 'spear2', out: 'spear2', n: 1, cost: { scrap: 4, wood: 2, rope: 2 }, fire: 2, cat: 'tool' },
  { id: 'lantern', out: 'lantern', n: 1, cost: { scrap: 2, wood: 1, leaf: 2 }, fire: 2, cat: 'tool' },
  { id: 'hammer', out: 'hammer', n: 1, cost: { wood: 3, rope: 1 }, cat: 'tool' },
  { id: 'hook', out: 'hook', n: 1, cost: { wood: 2, plastic: 2, rope: 2 }, cat: 'tool' },
];
/** cozinhar (informativo na aba Comida: assa na fogueira) */
export const COOK_LIST: [ItemId, ItemId, number][] = [
  ['fish', 'fishc', 1],
  ['potato', 'potatoc', 1],
  ['bigfish', 'bigfishc', 2],
];

/* ------------------------------ dificuldade ------------------------------ */
export type Diff = 0 | 1 | 2;
export interface DiffDef {
  /** fome/sede por segundo */
  hunger: number;
  thirst: number;
  /** dano por segundo com fome/sede zerada (0 = só deixa lento) */
  starve: number;
  /** dano da mordida no piso por mordida */
  bite: number;
  /** dano no jogador nadando */
  biteMe: number;
  /** espera do tubarão entre ataques (s) */
  shark: [number, number];
  /** primeiro dia com tubarão */
  sharkDay: number;
  /** chance de tempestade por dia */
  storm: number;
  /** quanto o fantasma rouba */
  steal: number;
  /** perde metade dos materiais ao desmaiar */
  lose: boolean;
}
export const DIFFS: Record<Diff, DiffDef> = {
  0: { hunger: 0.12, thirst: 0.16, starve: 0, bite: 10, biteMe: 8, shark: [110, 170], sharkDay: 2, storm: 0.25, steal: 1, lose: false },
  1: { hunger: 0.2, thirst: 0.28, starve: 1.2, bite: 16, biteMe: 15, shark: [70, 120], sharkDay: 1, storm: 0.4, steal: 2, lose: false },
  2: { hunger: 0.28, thirst: 0.38, starve: 2.2, bite: 24, biteMe: 22, shark: [45, 80], sharkDay: 1, storm: 0.6, steal: 3, lose: true },
};
export const diffName = (d: Diff) => [t('jangada.diff.0', 'Tranquilo'), t('jangada.diff.1', 'Normal'), t('jangada.diff.2', 'Aventura')][d];

/* ------------------------------ tempo ------------------------------ */
/** duração do dia completo (s) */
export const DAY_LEN = 360;
/** 0 = amanhecer; noite entre NIGHT0 e NIGHT1 */
export const NIGHT0 = 0.74;
export const NIGHT1 = 0.96;
export const isNight = (tod: number) => tod > NIGHT0 + 0.03 && tod < NIGHT1 - 0.01;

/* ------------------------------ missões ------------------------------ */
export type MisKind = 'hook' | 'found' | 'craft' | 'build' | 'drink' | 'catch' | 'cook' | 'shark' | 'island' | 'night' | 'ghost' | 'fireLv' | 'harvest' | 'tiles' | 'up' | 'eat' | 'dive';
export interface Mission {
  k: MisKind;
  /** item/peça alvo (craft/build) */
  a?: string;
  n: number;
  coins: number;
  icon: string;
  txt: () => string;
}
const M = (k: MisKind, n: number, coins: number, icon: string, txt: () => string, a?: string): Mission => ({ k, n, coins, icon, txt, a });
export const MISSIONS: Mission[] = [
  M('hook', 3, 10, 'hook', () => t('jangada.m.hook', 'Pesque 3 coisas com o gancho')),
  M('found', 2, 10, 'found', () => t('jangada.m.found', 'Aumente a jangada: 2 pisos novos')),
  M('craft', 2, 10, 'rope', () => t('jangada.m.rope', 'Faça 2 cordas'), 'rope'),
  M('build', 1, 15, 'fire', () => t('jangada.m.fire', 'Construa uma fogueira'), 'fire'),
  M('build', 1, 15, 'purifier', () => t('jangada.m.purifier', 'Construa um purificador'), 'purifier'),
  M('drink', 1, 10, 'water', () => t('jangada.m.drink', 'Beba água doce')),
  M('craft', 1, 10, 'rod', () => t('jangada.m.rod', 'Faça uma vara de pesca'), 'rod'),
  M('catch', 1, 15, 'fish', () => t('jangada.m.catch', 'Pesque um peixe com a vara')),
  M('cook', 1, 15, 'fishc', () => t('jangada.m.cook', 'Asse comida na fogueira')),
  M('craft', 1, 10, 'spear', () => t('jangada.m.spear', 'Faça uma lança'), 'spear'),
  M('shark', 1, 25, 'spear', () => t('jangada.m.shark', 'Espante o Mordelão com a lança')),
  M('build', 1, 20, 'sail', () => t('jangada.m.sail', 'Construa uma vela'), 'sail'),
  M('island', 1, 25, 'island', () => t('jangada.m.island', 'Pise numa ilha')),
  M('dive', 3, 15, 'stone', () => t('jangada.m.dive', 'Mergulhe e pegue 3 coisas do fundo')),
  M('build', 1, 15, 'anchor', () => t('jangada.m.anchor', 'Construa uma âncora'), 'anchor'),
  M('build', 1, 10, 'chest', () => t('jangada.m.chest', 'Construa um baú'), 'chest'),
  M('night', 1, 20, 'moon', () => t('jangada.m.night', 'Sobreviva a uma noite')),
  M('ghost', 1, 25, 'ghost', () => t('jangada.m.ghost', 'Espante o Capitão Bu')),
  M('fireLv', 2, 25, 'fire', () => t('jangada.m.fireLv', 'Fogueira nível 2')),
  M('harvest', 1, 20, 'potato', () => t('jangada.m.harvest', 'Plante e colha batatas')),
  M('tiles', 16, 25, 'found', () => t('jangada.m.tiles', 'Jangada com 16 pisos')),
  M('up', 1, 25, 'stairs', () => t('jangada.m.up', 'Construa um andar de cima')),
  M('fireLv', 3, 40, 'fire', () => t('jangada.m.fireLv3', 'Fogueira nível 3')),
];
/** missões do dia (depois da lista principal): sorteadas a cada amanhecer */
export const DAILY: Mission[] = [
  M('hook', 12, 12, 'hook', () => t('jangada.d.hook', 'Pesque 12 coisas com o gancho')),
  M('cook', 3, 12, 'fishc', () => t('jangada.d.cook', 'Asse 3 comidas')),
  M('catch', 3, 12, 'fish', () => t('jangada.d.catch', 'Pesque 3 peixes')),
  M('found', 4, 12, 'found', () => t('jangada.d.found', 'Construa 4 pisos')),
  M('shark', 1, 15, 'spear', () => t('jangada.d.shark', 'Espante o Mordelão')),
  M('night', 1, 15, 'moon', () => t('jangada.d.night', 'Sobreviva à noite')),
  M('dive', 4, 12, 'stone', () => t('jangada.d.dive', 'Pegue 4 coisas do fundo do mar')),
  M('eat', 4, 10, 'coco', () => t('jangada.d.eat', 'Coma ou beba 4 vezes')),
];

/* ------------------------------ restos boiando ------------------------------ */
export type DK = 'plank' | 'plastic' | 'leaf' | 'barrel' | 'coco' | 'rope';
export const DEBRIS: DK[] = ['plank', 'plastic', 'leaf', 'barrel', 'coco', 'rope'];
/** pesos do sorteio */
export const DEBRIS_W: Record<DK, number> = { plank: 34, plastic: 28, leaf: 24, barrel: 6, coco: 5, rope: 3 };
/** o que cada um dá (barril sorteia) */
export function debrisLoot(k: DK, r: () => number): Bag {
  switch (k) {
    case 'plank':
      return { wood: r() < 0.25 ? 2 : 1 };
    case 'plastic':
      return { plastic: r() < 0.25 ? 2 : 1 };
    case 'leaf':
      return { leaf: r() < 0.3 ? 3 : 2 };
    case 'coco':
      return { coco: 1 };
    case 'rope':
      return { rope: 1, leaf: 1 };
    case 'barrel': {
      const b: Bag = {};
      const pool: [ItemId, number, number][] = [
        ['wood', 2, 4],
        ['plastic', 2, 4],
        ['scrap', 1, 3],
        ['rope', 1, 2],
        ['seed', 1, 2],
        ['potato', 1, 2],
        ['water', 1, 1],
        ['coco', 1, 2],
        ['leaf', 2, 3],
      ];
      const n = 3 + Math.floor(r() * 2);
      for (let i = 0; i < n; i++) {
        const [id, a, z] = pool[Math.floor(r() * pool.length)];
        b[id] = (b[id] ?? 0) + a + Math.floor(r() * (z - a + 1));
      }
      if (r() < 0.6) b.scrap = (b.scrap ?? 0) + 1;
      return b;
    }
  }
}

export function bagAdd(b: Bag, add: Bag, k = 1): void {
  for (const key in add) {
    const id = key as ItemId;
    b[id] = Math.max(0, (b[id] ?? 0) + (add[id] ?? 0) * k);
    if (!b[id]) delete b[id];
  }
}
export function bagHas(b: Bag, need: Bag): boolean {
  for (const key in need) if ((b[key as ItemId] ?? 0) < (need[key as ItemId] ?? 0)) return false;
  return true;
}
export const bagCount = (b: Bag) => Object.values(b).reduce((a, v) => a + (v ?? 0), 0);
