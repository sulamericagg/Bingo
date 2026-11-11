/* ============================================================
 *  MUNDO — catálogo de itens e receitas (originais do Bloop World).
 *  Ferramentas/armaduras por nível são geradas por composição
 *  (nome = modelo traduzido "{t} de {m}"), o resto é tabela.
 *  Ícones são desenhados em canvas (ver itemicons.ts) a partir de `ic`.
 * ============================================================ */
import { t } from '../../../i18n';

export type Cat = 'rec' | 'comida' | 'ferr' | 'arma' | 'armad' | 'const' | 'luz' | 'movel' | 'maq' | 'peca' | 'deco' | 'fazenda';
export type ToolKind = 'pick' | 'axe' | 'shovel' | 'hoe' | 'sword' | 'hammer' | 'sling' | 'boomerang';
export type ArmorSlot = 0 | 1 | 2 | 3;
/** formas de ícone */
export type Shape =
  | 'log' | 'plank' | 'stick' | 'fiber' | 'leaf' | 'rope' | 'cloth' | 'rock' | 'dirt' | 'ore' | 'ingot' | 'gem' | 'glass' | 'brick' | 'blob' | 'feather' | 'wool' | 'shell' | 'dust' | 'spike' | 'drop' | 'gear' | 'wire' | 'seed' | 'sapling' | 'pebble'
  | 'fruit' | 'berry' | 'mush' | 'egg' | 'wheat' | 'bread' | 'potato' | 'carrot' | 'corn' | 'popcorn' | 'pie' | 'bowl' | 'cup' | 'cake' | 'skewer' | 'salad'
  | 'pick' | 'axe' | 'shovel' | 'hoe' | 'sword' | 'hammer' | 'sling' | 'boomerang' | 'tnt'
  | 'helmet' | 'vest' | 'pants' | 'boots'
  | 'floor' | 'wall' | 'half' | 'roof' | 'door' | 'window' | 'stairs' | 'fence' | 'pillar' | 'gwall'
  | 'torch' | 'lamp' | 'lantern' | 'crystallamp'
  | 'chair' | 'table' | 'bed' | 'shelf' | 'sofa' | 'rug' | 'frame' | 'vase' | 'clock' | 'stool' | 'wardrobe' | 'floorlamp' | 'flag' | 'statue' | 'cushion' | 'bench'
  | 'workbench' | 'furnace' | 'anvil' | 'workshop' | 'chest' | 'bigchest' | 'campfire' | 'rail' | 'boostrail' | 'cart'
  | 'wheel' | 'engine' | 'chassis' | 'seat' | 'steering' | 'rotor' | 'hull' | 'bucket' | 'tracks' | 'fork' | 'kit'
  | 'flower' | 'pinwheel' | 'balloon' | 'fountain' | 'totem' | 'plant' | 'pumpkin' | 'bell' | 'bunting' | 'plot';

export interface ItemDef {
  id: string;
  name: () => string;
  cat: Cat;
  stack: number;
  ic: { s: Shape; c: string; c2?: string };
  tool?: ToolKind;
  tier?: number;
  dur?: number;
  dmg?: number;
  armor?: { slot: ArmorSlot; def: number };
  /** pontos de fome repostos */
  food?: number;
  /** segundos de fogo como combustível */
  fuel?: number;
  /** peça/objeto que este item coloca no mundo */
  place?: string;
  /** material do subsolo que ele "enche" quando colocado como bloco suave */
  fill?: number;
  /** semente: planta qual cultivo */
  crop?: string;
  /** veículo (índice VDEFS) que o kit monta */
  veh?: number;
  /** ícone pronto (módulos de conteúdo, ex.: blocos) */
  iconUrl?: () => string;
}

export const ITEMS: ItemDef[] = [];
export const ITEM = new Map<string, ItemDef>();
const add = (d: ItemDef) => {
  ITEMS.push(d);
  ITEM.set(d.id, d);
  return d;
};
const R = (id: string, name: () => string, s: Shape, c: string, c2?: string, extra: Partial<ItemDef> = {}): ItemDef =>
  add({ id, name, cat: 'rec', stack: 99, ic: { s, c, c2 }, ...extra });

/* ------------------------------ recursos ------------------------------ */
R('tora', () => t('mundo.i.tora', 'Tora'), 'log', '#9a6a3c', '#f3d9a8', { fuel: 15 });
R('tabua', () => t('mundo.i.tabua', 'Tábua'), 'plank', '#d8a060', '#a8743c', { fuel: 7 });
R('graveto', () => t('mundo.i.graveto', 'Graveto'), 'stick', '#a8743c', undefined, { fuel: 3 });
R('fibra', () => t('mundo.i.fibra', 'Fibra'), 'fiber', '#9ad05a');
R('folha', () => t('mundo.i.folha', 'Folha'), 'leaf', '#5cc24a', undefined, { fuel: 2 });
R('corda', () => t('mundo.i.corda', 'Corda'), 'rope', '#d8b47a');
R('tecido', () => t('mundo.i.tecido', 'Tecido'), 'cloth', '#ff8ac8', '#ffd0e8');
R('pedra', () => t('mundo.i.pedra', 'Pedra'), 'rock', '#9a96a0', undefined, { fill: 5 });
R('pedra_funda', () => t('mundo.i.pedraFunda', 'Pedra Profunda'), 'rock', '#5a5668', undefined, { fill: 6 });
R('pedra_lisa', () => t('mundo.i.pedraLisa', 'Pedra Lisa'), 'brick', '#c8c4d0', '#a8a4b0');
R('terra', () => t('mundo.i.terra', 'Terra'), 'dirt', '#8a6440', undefined, { fill: 2 });
R('argila', () => t('mundo.i.argila', 'Argila'), 'dirt', '#c07a5a', undefined, { fill: 3 });
R('areia', () => t('mundo.i.areia', 'Areia'), 'dirt', '#e8d49a', undefined, { fill: 4 });
R('neve', () => t('mundo.i.neve', 'Neve'), 'dirt', '#f4f8ff', undefined, { fill: 15 });
R('carvao', () => t('mundo.i.carvao', 'Carvão'), 'ore', '#3a3438', '#1a1418', { fuel: 40 });
R('min_cobre', () => t('mundo.i.minCobre', 'Pedra de Cobre'), 'ore', '#9a96a0', '#f08a4a');
R('min_ferro', () => t('mundo.i.minFerro', 'Pedra de Ferro'), 'ore', '#9a96a0', '#d8b49a');
R('min_prata', () => t('mundo.i.minPrata', 'Pedra de Prata'), 'ore', '#6a6678', '#e8f0ff');
R('min_ouro', () => t('mundo.i.minOuro', 'Pedra de Ouro'), 'ore', '#6a6678', '#ffd02e');
R('cristal', () => t('mundo.i.cristal', 'Cristal Bruto'), 'gem', '#7af0ff', '#3ab0d0');
R('gema', () => t('mundo.i.gema', 'Gema-Estrela'), 'gem', '#ff4ad8', '#ffd0f4');
R('barra_cobre', () => t('mundo.i.barCobre', 'Barra de Cobre'), 'ingot', '#f08a4a', '#ffc08a');
R('barra_ferro', () => t('mundo.i.barFerro', 'Barra de Ferro'), 'ingot', '#c8ccd8', '#f4f6fc');
R('barra_prata', () => t('mundo.i.barPrata', 'Barra de Prata'), 'ingot', '#e8f0ff', '#ffffff');
R('barra_ouro', () => t('mundo.i.barOuro', 'Barra de Ouro'), 'ingot', '#ffd02e', '#fff09a');
R('cristal_lap', () => t('mundo.i.cristalLap', 'Cristal Lapidado'), 'gem', '#aaf8ff', '#ffffff');
R('vidro', () => t('mundo.i.vidro', 'Vidro'), 'glass', '#bfeaff');
R('tijolo', () => t('mundo.i.tijolo', 'Tijolo'), 'brick', '#d0603a', '#f08a5a');
R('gosma', () => t('mundo.i.gosma', 'Gosma'), 'blob', '#7aff8a');
R('pena', () => t('mundo.i.pena', 'Pena'), 'feather', '#ffd34a');
R('la', () => t('mundo.i.la', 'Lã-Nuvem'), 'wool', '#ffffff', '#d8e8ff');
R('casca', () => t('mundo.i.casca', 'Casca'), 'shell', '#5aa86a', '#8ad89a');
R('po_sombra', () => t('mundo.i.poSombra', 'Pó de Sombra'), 'dust', '#8a6aff');
R('espinho', () => t('mundo.i.espinho', 'Espinho'), 'spike', '#4aa85a');
R('resina', () => t('mundo.i.resina', 'Resina'), 'drop', '#ffb02e', undefined, { fuel: 10 });
R('engrenagem', () => t('mundo.i.engrenagem', 'Engrenagem'), 'gear', '#c8ccd8');
R('fio', () => t('mundo.i.fio', 'Fio de Cobre'), 'wire', '#f08a4a');
R('semente', () => t('mundo.i.semente', 'Semente de Trigo'), 'seed', '#d8c45a', undefined, { cat: 'fazenda', crop: 'trigo' });
R('muda', () => t('mundo.i.muda', 'Muda de Árvore'), 'sapling', '#6cc24a', '#9a6a3c', { cat: 'fazenda', place: 'muda' });
R('pedrinha', () => t('mundo.i.pedrinha', 'Pedrinha'), 'pebble', '#b8b4c0');

/* ------------------------------ comida ------------------------------ */
const F = (id: string, name: () => string, s: Shape, c: string, food: number, c2?: string, extra: Partial<ItemDef> = {}) => add({ id, name, cat: 'comida', stack: 32, ic: { s, c, c2 }, food, ...extra });
F('fruta', () => t('mundo.i.fruta', 'Fruta-Bolha'), 'fruit', '#ff5a6a', 3, '#5cc24a');
F('amora', () => t('mundo.i.amora', 'Amora-Lua'), 'berry', '#8a5aff', 2);
F('cogumelo', () => t('mundo.i.cogumelo', 'Cogumelo'), 'mush', '#ff7a5a', 2, '#fff');
F('cogumelo_assado', () => t('mundo.i.cogumeloAssado', 'Cogumelo Assado'), 'mush', '#b85a3a', 5, '#ffe2b0');
F('ovo', () => t('mundo.i.ovo', 'Ovo de Pipoco'), 'egg', '#fff4e0', 1);
F('ovo_frito', () => t('mundo.i.ovoFrito', 'Ovo Frito'), 'egg', '#ffffff', 5, '#ffd34a');
F('trigo', () => t('mundo.i.trigo', 'Trigo'), 'wheat', '#e8c45a', 1);
F('farinha', () => t('mundo.i.farinha', 'Farinha'), 'dust', '#fff8e8', 0);
F('pao', () => t('mundo.i.pao', 'Pão'), 'bread', '#d8944a', 7);
F('batata', () => t('mundo.i.batata', 'Batata'), 'potato', '#c8a060', 1, undefined, { cat: 'comida', crop: 'batata' });
F('batata_assada', () => t('mundo.i.batataAssada', 'Batata Assada'), 'potato', '#a8703a', 6, '#ffe08a');
F('cenoura', () => t('mundo.i.cenoura', 'Cenoura'), 'carrot', '#ff8a2e', 3, '#5cc24a', { crop: 'cenoura' });
F('milho', () => t('mundo.i.milho', 'Milho'), 'corn', '#ffd34a', 2, '#7ad04a', { crop: 'milho' });
F('pipoca', () => t('mundo.i.pipoca', 'Pipoca'), 'popcorn', '#fff8e0', 4, '#ff4f6a');
F('torta', () => t('mundo.i.torta', 'Torta de Frutas'), 'pie', '#d8944a', 10, '#ff5a6a');
F('sopa', () => t('mundo.i.sopa', 'Sopa de Cogumelo'), 'bowl', '#c8703a', 8, '#a8743c');
F('salada', () => t('mundo.i.salada', 'Salada'), 'salad', '#7ad04a', 6, '#ff8a2e');
F('suco', () => t('mundo.i.suco', 'Suco de Amora'), 'cup', '#8a5aff', 4, '#bfeaff');
F('bolo', () => t('mundo.i.bolo', 'Bolo Fofo'), 'cake', '#ffb3d1', 14, '#fff');
F('espetinho', () => t('mundo.i.espetinho', 'Espetinho de Legumes'), 'skewer', '#ff8a2e', 9, '#7ad04a');

/* ------------------------------ ferramentas e armaduras por nível ------------------------------ */
export interface Tier {
  key: string;
  name: () => string;
  mat: string;
  col: string;
  col2: string;
}
export const TOOL_TIERS: Tier[] = [
  { key: 'madeira', name: () => t('mundo.m.madeira', 'Madeira'), mat: 'tabua', col: '#d8a060', col2: '#a8743c' },
  { key: 'pedra', name: () => t('mundo.m.pedra', 'Pedra'), mat: 'pedra', col: '#a8a4b0', col2: '#6a6678' },
  { key: 'cobre', name: () => t('mundo.m.cobre', 'Cobre'), mat: 'barra_cobre', col: '#f08a4a', col2: '#b05a2a' },
  { key: 'ferro', name: () => t('mundo.m.ferro', 'Ferro'), mat: 'barra_ferro', col: '#dce0ea', col2: '#8a90a0' },
  { key: 'prata', name: () => t('mundo.m.prata', 'Prata'), mat: 'barra_prata', col: '#f4f8ff', col2: '#a0b0d0' },
  { key: 'ouro', name: () => t('mundo.m.ouro', 'Ouro'), mat: 'barra_ouro', col: '#ffd02e', col2: '#c89a10' },
  { key: 'cristal', name: () => t('mundo.m.cristal', 'Cristal'), mat: 'cristal_lap', col: '#7af0ff', col2: '#3ab0d0' },
];
const TOOL_NAMES: Record<string, () => string> = {
  pick: () => t('mundo.tool.pick', 'Picareta'),
  axe: () => t('mundo.tool.axe', 'Machado'),
  shovel: () => t('mundo.tool.shovel', 'Pá'),
  hoe: () => t('mundo.tool.hoe', 'Enxada'),
  sword: () => t('mundo.tool.sword', 'Espada de Espuma'),
};
const compose = (tool: () => string, mat: () => string) => () => t('mundo.compose', '{t} de {m}', { t: tool(), m: mat() });
for (let i = 0; i < TOOL_TIERS.length; i++) {
  const T = TOOL_TIERS[i];
  const tier = i + 1;
  for (const k of ['pick', 'axe', 'shovel', 'hoe', 'sword'] as ToolKind[]) {
    add({
      id: `${k}_${T.key}`,
      name: compose(TOOL_NAMES[k], T.name),
      cat: k === 'sword' ? 'arma' : 'ferr',
      stack: 1,
      ic: { s: k as Shape, c: T.col, c2: T.col2 },
      tool: k,
      tier,
      dur: 30 + tier * tier * 18,
      dmg: k === 'sword' ? 3 + tier * 1.4 : k === 'axe' ? 2 + tier * 0.9 : 1 + tier * 0.4,
    });
  }
}
export const ARMOR_TIERS: Tier[] = [
  { key: 'tecido', name: () => t('mundo.m.tecido', 'Tecido'), mat: 'tecido', col: '#ff8ac8', col2: '#c85a98' },
  TOOL_TIERS[2],
  TOOL_TIERS[3],
  TOOL_TIERS[4],
  TOOL_TIERS[5],
  TOOL_TIERS[6],
];
const ARMOR_NAMES: [Shape, () => string, number][] = [
  ['helmet', () => t('mundo.arm.helmet', 'Capacete'), 1],
  ['vest', () => t('mundo.arm.vest', 'Colete'), 3],
  ['pants', () => t('mundo.arm.pants', 'Calça'), 2],
  ['boots', () => t('mundo.arm.boots', 'Botas'), 1],
];
for (let i = 0; i < ARMOR_TIERS.length; i++) {
  const T = ARMOR_TIERS[i];
  for (let s = 0; s < 4; s++) {
    const [sh, nm, base] = ARMOR_NAMES[s];
    add({ id: `${sh}_${T.key}`, name: compose(nm, T.name), cat: 'armad', stack: 1, ic: { s: sh, c: T.col, c2: T.col2 }, armor: { slot: s as ArmorSlot, def: Math.round(base * (0.7 + i * 0.45) * 10) / 10 }, dur: 60 + i * 50 });
  }
}
add({ id: 'martelo', name: () => t('mundo.i.martelo', 'Martelo de Obra'), cat: 'ferr', stack: 1, ic: { s: 'hammer', c: '#c8ccd8', c2: '#a8743c' }, tool: 'hammer', tier: 1, dur: 400, dmg: 2 });
add({ id: 'estilingue', name: () => t('mundo.i.estilingue', 'Estilingue'), cat: 'arma', stack: 1, ic: { s: 'sling', c: '#a8743c', c2: '#ff4f6a' }, tool: 'sling', tier: 2, dur: 200, dmg: 4 });
add({ id: 'bumerangue', name: () => t('mundo.i.bumerangue', 'Bumerangue'), cat: 'arma', stack: 1, ic: { s: 'boomerang', c: '#ffb02e', c2: '#ff4f6a' }, tool: 'boomerang', tier: 3, dur: 250, dmg: 6 });
add({ id: 'dinamite', name: () => t('mundo.i.dinamite', 'Dinamite'), cat: 'arma', stack: 16, ic: { s: 'tnt', c: '#ff4f6a', c2: '#ffd34a' } });

/* ------------------------------ construção ------------------------------ */
export const BUILD_MATS = [
  { key: 'madeira', name: () => t('mundo.m.madeira', 'Madeira'), mat: 'tabua', col: '#d8a060', col2: '#a8743c' },
  { key: 'pedra', name: () => t('mundo.m.pedra', 'Pedra'), mat: 'pedra_lisa', col: '#c8c4d0', col2: '#8a8696' },
  { key: 'tijolo', name: () => t('mundo.m.tijolo', 'Tijolo'), mat: 'tijolo', col: '#d0603a', col2: '#f0a080' },
];
export const PIECE_KINDS: [string, Shape, () => string][] = [
  ['piso', 'floor', () => t('mundo.pc.piso', 'Piso')],
  ['parede', 'wall', () => t('mundo.pc.parede', 'Parede')],
  ['meia', 'half', () => t('mundo.pc.meia', 'Mureta')],
  ['telhado', 'roof', () => t('mundo.pc.telhado', 'Telhado')],
  ['porta', 'door', () => t('mundo.pc.porta', 'Porta')],
  ['janela', 'window', () => t('mundo.pc.janela', 'Janela')],
  ['escada', 'stairs', () => t('mundo.pc.escada', 'Escada')],
  ['cerca', 'fence', () => t('mundo.pc.cerca', 'Cerca')],
  ['pilar', 'pillar', () => t('mundo.pc.pilar', 'Pilar')],
];
for (const M of BUILD_MATS)
  for (const [k, sh, nm] of PIECE_KINDS) {
    const id = `${k}_${M.key}`;
    add({ id, name: compose(nm, M.name), cat: 'const', stack: 64, ic: { s: sh, c: M.col, c2: M.col2 }, place: id });
  }
add({ id: 'parede_vidro', name: () => t('mundo.i.paredeVidro', 'Parede de Vidro'), cat: 'const', stack: 64, ic: { s: 'gwall', c: '#bfeaff', c2: '#ffffff' }, place: 'parede_vidro' });

const P = (id: string, cat: Cat, name: () => string, s: Shape, c: string, c2?: string, extra: Partial<ItemDef> = {}) => add({ id, name, cat, stack: 16, ic: { s, c, c2 }, place: id, ...extra });
/* luzes */
P('tocha', 'luz', () => t('mundo.i.tocha', 'Tocha'), 'torch', '#a8743c', '#ffb02e', { stack: 64 });
P('lampiao', 'luz', () => t('mundo.i.lampiao', 'Lampião'), 'lamp', '#3a3a4a', '#ffd34a');
P('luz_cristal', 'luz', () => t('mundo.i.luzCristal', 'Luz de Cristal'), 'crystallamp', '#7af0ff', '#ffffff');
P('luminaria', 'luz', () => t('mundo.i.luminaria', 'Luminária de Teto'), 'lantern', '#ffd34a', '#fff6c0');
/* móveis */
P('cadeira', 'movel', () => t('mundo.i.cadeira', 'Cadeira'), 'chair', '#d8a060', '#a8743c');
P('mesa', 'movel', () => t('mundo.i.mesa', 'Mesa'), 'table', '#d8a060', '#a8743c');
P('cama', 'movel', () => t('mundo.i.cama', 'Cama Fofa'), 'bed', '#ff8ac8', '#ffffff');
P('estante', 'movel', () => t('mundo.i.estante', 'Estante'), 'shelf', '#a8743c', '#ff8a3a');
P('sofa', 'movel', () => t('mundo.i.sofa', 'Sofá'), 'sofa', '#7a8aff', '#5a6ad8');
P('tapete', 'movel', () => t('mundo.i.tapete', 'Tapete'), 'rug', '#ff6a8a', '#ffd34a');
P('quadro', 'movel', () => t('mundo.i.quadro', 'Quadro'), 'frame', '#ffd34a', '#7ad0ff');
P('vaso', 'movel', () => t('mundo.i.vaso', 'Vaso de Flor'), 'vase', '#d0603a', '#ff5a8a');
P('relogio', 'movel', () => t('mundo.i.relogio', 'Relógio'), 'clock', '#ffd34a', '#ffffff');
P('banquinho', 'movel', () => t('mundo.i.banquinho', 'Banquinho'), 'stool', '#d8a060');
P('armario', 'movel', () => t('mundo.i.armario', 'Armário'), 'wardrobe', '#a8743c', '#ffd34a');
P('abajur', 'movel', () => t('mundo.i.abajur', 'Abajur'), 'floorlamp', '#ffd34a', '#a8743c');
P('bandeira', 'movel', () => t('mundo.i.bandeira', 'Bandeira'), 'flag', '#ff4f6a', '#a8743c');
P('estatua', 'movel', () => t('mundo.i.estatua', 'Estátua do Bloop'), 'statue', '#c8c4d0', '#8a8696');
P('almofada', 'movel', () => t('mundo.i.almofada', 'Almofada'), 'cushion', '#ffb3d1');
P('banco', 'movel', () => t('mundo.i.banco', 'Banco de Praça'), 'bench', '#3ec05a', '#a8743c');
/* máquinas e estações */
P('bancada', 'maq', () => t('mundo.i.bancada', 'Bancada'), 'workbench', '#d8a060', '#a8743c', { stack: 8 });
P('fornalha', 'maq', () => t('mundo.i.fornalha', 'Fornalha'), 'furnace', '#8a8696', '#ff7a1a', { stack: 8 });
P('bigorna', 'maq', () => t('mundo.i.bigorna', 'Bigorna'), 'anvil', '#5a5668', '#c8ccd8', { stack: 8 });
P('oficina', 'maq', () => t('mundo.i.oficina', 'Oficina de Máquinas'), 'workshop', '#ffb02e', '#3a3a4a', { stack: 8 });
P('bau', 'maq', () => t('mundo.i.bau', 'Baú'), 'chest', '#c8843c', '#ffd34a', { stack: 8 });
P('bau_grande', 'maq', () => t('mundo.i.bauGrande', 'Baú Grandão'), 'bigchest', '#8a5aff', '#ffd34a', { stack: 8 });
P('fogueira', 'maq', () => t('mundo.i.fogueira', 'Fogueira'), 'campfire', '#a8743c', '#ff7a1a', { stack: 8 });
P('trilho', 'maq', () => t('mundo.i.trilho', 'Trilho'), 'rail', '#c8ccd8', '#a8743c', { stack: 64 });
P('trilho_turbo', 'maq', () => t('mundo.i.trilhoTurbo', 'Trilho Turbo'), 'boostrail', '#ffd02e', '#ff4f6a', { stack: 64 });
P('vagonete', 'maq', () => t('mundo.i.vagonete', 'Vagonete'), 'cart', '#8a8696', '#ffd34a', { stack: 4 });
P('canteiro', 'fazenda', () => t('mundo.i.canteiro', 'Canteiro'), 'plot', '#6a4a2a', '#7ad04a', { stack: 64 });
/* peças de veículo e kits */
R('roda', () => t('mundo.i.roda', 'Roda'), 'wheel', '#3a3a4a', '#c8ccd8', { cat: 'peca', stack: 16 });
R('motor', () => t('mundo.i.motor', 'Motor'), 'engine', '#8a8696', '#ff4f6a', { cat: 'peca', stack: 8 });
R('chassi', () => t('mundo.i.chassi', 'Chassi'), 'chassis', '#5a5668', '#c8ccd8', { cat: 'peca', stack: 8 });
R('assento', () => t('mundo.i.assento', 'Assento'), 'seat', '#ff4f6a', '#3a3a4a', { cat: 'peca', stack: 8 });
R('volante', () => t('mundo.i.volante', 'Volante'), 'steering', '#3a3a4a', '#c8ccd8', { cat: 'peca', stack: 8 });
R('helice', () => t('mundo.i.helice', 'Hélice'), 'rotor', '#c8ccd8', '#8a5aff', { cat: 'peca', stack: 8 });
R('casco', () => t('mundo.i.casco', 'Casco de Barco'), 'hull', '#ff8a3a', '#ffffff', { cat: 'peca', stack: 8 });
R('cacamba', () => t('mundo.i.cacamba', 'Caçamba'), 'bucket', '#3ec05a', '#c8ccd8', { cat: 'peca', stack: 8 });
R('esteira', () => t('mundo.i.esteira', 'Esteira'), 'tracks', '#3a3a4a', '#8a8696', { cat: 'peca', stack: 8 });
R('garfo', () => t('mundo.i.garfo', 'Garfo de Carga'), 'fork', '#ffd34a', '#3a3a4a', { cat: 'peca', stack: 8 });
export const KIT_NAMES: (() => string)[] = [
  () => t('mundo.kit.0', 'Kit Quadriciclo'),
  () => t('mundo.kit.1', 'Kit Trator com Reboque'),
  () => t('mundo.kit.2', 'Kit Caminhão Toreiro'),
  () => t('mundo.kit.3', 'Kit Escavadeira'),
  () => t('mundo.kit.4', 'Kit Trator de Esteira'),
  () => t('mundo.kit.5', 'Kit Helicóptero'),
  () => t('mundo.kit.6', 'Kit Barco'),
  () => t('mundo.kit.7', 'Kit Empilhadeira'),
];
const KIT_COL = ['#ff4f6a', '#3ec05a', '#3a8aff', '#ffb02e', '#ffcf2e', '#8a5cff', '#ff8a3a', '#ffd34a'];
for (let k = 0; k < 8; k++) add({ id: `kit_${k}`, name: KIT_NAMES[k], cat: 'peca', stack: 1, ic: { s: 'kit', c: KIT_COL[k], c2: '#ffffff' }, veh: k });
/* decoração */
P('flor_rosa', 'deco', () => t('mundo.i.florRosa', 'Flor Rosa'), 'flower', '#ff6aa8', '#7ad04a', { stack: 64 });
P('flor_amarela', 'deco', () => t('mundo.i.florAmarela', 'Flor Amarela'), 'flower', '#ffd34a', '#7ad04a', { stack: 64 });
P('flor_azul', 'deco', () => t('mundo.i.florAzul', 'Flor Azul'), 'flower', '#5aa8ff', '#7ad04a', { stack: 64 });
P('lanterna_rosa', 'deco', () => t('mundo.i.lanternaRosa', 'Lanterna Rosa'), 'lantern', '#ff8ac8', '#fff');
P('lanterna_azul', 'deco', () => t('mundo.i.lanternaAzul', 'Lanterna Azul'), 'lantern', '#7ab0ff', '#fff');
P('lanterna_verde', 'deco', () => t('mundo.i.lanternaVerde', 'Lanterna Verde'), 'lantern', '#7aff8a', '#fff');
P('bandeirinhas', 'deco', () => t('mundo.i.bandeirinhas', 'Bandeirinhas'), 'bunting', '#ff4f6a', '#ffd34a');
P('cata_vento', 'deco', () => t('mundo.i.cataVento', 'Cata-Vento'), 'pinwheel', '#ff4f6a', '#5aa8ff');
P('balao', 'deco', () => t('mundo.i.balao', 'Balão'), 'balloon', '#ff4f6a', '#fff');
P('fonte', 'deco', () => t('mundo.i.fonte', 'Fonte'), 'fountain', '#c8c4d0', '#5ac8ff');
P('totem', 'deco', () => t('mundo.i.totem', 'Totem Sorridente'), 'totem', '#d8a060', '#ff4f6a');
P('planta', 'deco', () => t('mundo.i.planta', 'Planta no Vaso'), 'plant', '#5cc24a', '#d0603a');
P('abobora', 'deco', () => t('mundo.i.abobora', 'Abóbora-Luz'), 'pumpkin', '#ff8a2e', '#ffd34a');
P('sino', 'deco', () => t('mundo.i.sino', 'Sino'), 'bell', '#ffd02e', '#a8743c');

/* ------------------------------ receitas ------------------------------ */
export type Station = 'mao' | 'bancada' | 'bigorna' | 'oficina' | 'fornalha';
export interface Recipe {
  out: string;
  n: number;
  /** padrão (linhas) com letras → ids; ou lista sem forma */
  pat?: string[];
  key?: Record<string, string>;
  ing?: [string, number][];
  st: Station;
  /** fornalha: segundos */
  time?: number;
}
export const RECIPES: Recipe[] = [];
const S = (out: string, n: number, st: Station, pat: string[], key: Record<string, string>) => RECIPES.push({ out, n, st, pat, key });
const L = (out: string, n: number, st: Station, ing: [string, number][]) => RECIPES.push({ out, n, st, ing });
const COOK = (inp: string, out: string, time = 6) => RECIPES.push({ out, n: 1, st: 'fornalha', ing: [[inp, 1]], time });

// básicos (mão = grade 2×2)
L('tabua', 4, 'mao', [['tora', 1]]);
S('graveto', 4, 'mao', ['T', 'T'], { T: 'tabua' });
S('bancada', 1, 'mao', ['TT', 'TT'], { T: 'tabua' });
L('corda', 1, 'mao', [['fibra', 3]]);
S('tocha', 4, 'mao', ['C', 'G'], { C: 'carvao', G: 'graveto' });
S('tocha', 2, 'mao', ['R', 'G'], { R: 'resina', G: 'graveto' });
L('tecido', 1, 'mao', [['la', 2]]);
L('tecido', 1, 'mao', [['fibra', 4]]);
L('pedrinha', 4, 'mao', [['pedra', 1]]);
L('farinha', 1, 'mao', [['trigo', 2]]);
L('salada', 1, 'mao', [['cenoura', 1], ['folha', 1], ['fruta', 1]]);
L('suco', 1, 'mao', [['amora', 3]]);
S('canteiro', 2, 'mao', ['TT'], { T: 'terra' });
L('flor_rosa', 1, 'mao', [['fibra', 1], ['fruta', 1]]);
L('flor_amarela', 1, 'mao', [['fibra', 1], ['trigo', 1]]);
L('flor_azul', 1, 'mao', [['fibra', 1], ['amora', 1]]);
// bancada (3×3)
S('fornalha', 1, 'bancada', ['PPP', 'PCP', 'PPP'], { P: 'pedra', C: 'carvao' });
S('bau', 1, 'bancada', ['T.T', 'TTT'], { T: 'tabua' });
S('bau_grande', 1, 'bancada', ['TBT', 'TFT'], { T: 'tabua', B: 'bau', F: 'barra_ferro' });
S('bigorna', 1, 'bancada', ['FFF', '.F.', 'PPP'], { F: 'barra_ferro', P: 'pedra' });
S('oficina', 1, 'bancada', ['FEF', 'TBT', 'FEF'], { F: 'barra_ferro', E: 'engrenagem', T: 'tabua', B: 'bancada' });
S('fogueira', 1, 'bancada', ['.G.', 'GTG', 'PPP'], { G: 'graveto', T: 'tora', P: 'pedra' });
S('martelo', 1, 'bancada', ['FFF', '.G.', '.G.'], { F: 'pedra', G: 'graveto' });
S('estilingue', 1, 'bancada', ['G.G', 'CGC', '.G.'], { G: 'graveto', C: 'corda' });
S('bumerangue', 1, 'bancada', ['TT.', '..T'], { T: 'tabua' });
S('dinamite', 2, 'oficina', ['PCP', 'GPG'], { P: 'carvao', C: 'corda', G: 'gosma' });
S('muda', 1, 'mao', ['F', 'G'], { F: 'folha', G: 'graveto' });
L('semente', 2, 'mao', [['trigo', 1]]);
// ferramentas: madeira/pedra na bancada, metais na bigorna
const TOOL_PAT: Record<string, string[]> = {
  pick: ['MMM', 'MG.', '.G.'],
  axe: ['MM', 'MG', '.G'],
  shovel: ['M', 'G', 'G'],
  hoe: ['MM', '.G', '.G'],
  sword: ['..M', '.M.', 'G..'],
};
for (let i = 0; i < TOOL_TIERS.length; i++) {
  const T = TOOL_TIERS[i];
  for (const k of Object.keys(TOOL_PAT)) S(`${k}_${T.key}`, 1, i < 2 ? 'bancada' : 'bigorna', TOOL_PAT[k], { M: T.mat, G: 'graveto' });
}
const ARMOR_PAT = [
  ['MMM', 'M.M'],
  ['M.M', 'MMM', 'MMM'],
  ['MMM', 'M.M', 'M.M'],
  ['M.M', 'M.M'],
];
for (let i = 0; i < ARMOR_TIERS.length; i++) {
  const T = ARMOR_TIERS[i];
  for (let s = 0; s < 4; s++) S(`${ARMOR_NAMES[s][0]}_${T.key}`, 1, i === 0 ? 'bancada' : 'bigorna', ARMOR_PAT[s], { M: T.mat });
}
// peças de construção (bancada)
const PIECE_PAT: Record<string, [string[], number]> = {
  piso: [['MM'], 2],
  parede: [['MM', 'MM'], 2],
  meia: [['MM'], 3],
  telhado: [['.M.', 'MMM'], 2],
  porta: [['MM', 'MM', 'MM'], 1],
  janela: [['MVM'], 2],
  escada: [['M..', 'MM.', 'MMM'], 2],
  cerca: [['MGM', 'MGM'], 4],
  pilar: [['M', 'M', 'M'], 2],
};
for (const M of BUILD_MATS)
  for (const k of Object.keys(PIECE_PAT)) {
    const [pat, n] = PIECE_PAT[k];
    S(`${k}_${M.key}`, n, 'bancada', pat, { M: M.mat, V: 'vidro', G: 'graveto' });
  }
S('parede_vidro', 2, 'bancada', ['VV', 'VV'], { V: 'vidro' });
// luzes
S('lampiao', 1, 'bancada', ['.F.', 'VTV', '.F.'], { F: 'barra_ferro', V: 'vidro', T: 'tocha' });
S('luz_cristal', 2, 'bancada', ['VCV'], { V: 'vidro', C: 'cristal' });
S('luminaria', 1, 'bancada', ['.C.', 'VTV'], { C: 'corda', V: 'vidro', T: 'tocha' });
// móveis
S('cadeira', 1, 'bancada', ['T..', 'TTT', 'G.G'], { T: 'tabua', G: 'graveto' });
S('mesa', 1, 'bancada', ['TTT', 'G.G'], { T: 'tabua', G: 'graveto' });
S('cama', 1, 'bancada', ['LLL', 'TTT'], { L: 'la', T: 'tabua' });
S('estante', 1, 'bancada', ['TTT', 'T.T', 'TTT'], { T: 'tabua' });
S('sofa', 1, 'bancada', ['P..', 'PPP', 'TTT'], { P: 'tecido', T: 'tabua' });
S('tapete', 1, 'mao', ['PP'], { P: 'tecido' });
S('quadro', 1, 'bancada', ['GGG', 'GPG', 'GGG'], { G: 'graveto', P: 'tecido' });
S('vaso', 1, 'mao', ['F', 'A'], { F: 'flor_rosa', A: 'argila' });
S('relogio', 1, 'bigorna', ['.O.', 'OEO', '.O.'], { O: 'barra_ouro', E: 'engrenagem' });
S('banquinho', 1, 'bancada', ['TT', 'GG'], { T: 'tabua', G: 'graveto' });
S('armario', 1, 'bancada', ['TTT', 'TFT', 'TTT'], { T: 'tabua', F: 'barra_ferro' });
S('abajur', 1, 'bancada', ['.P.', '.T.', '.G.'], { P: 'tecido', T: 'tocha', G: 'graveto' });
S('bandeira', 1, 'bancada', ['PP', 'G.', 'G.'], { P: 'tecido', G: 'graveto' });
S('estatua', 1, 'bancada', ['.P.', 'PPP', 'PPP'], { P: 'pedra_lisa' });
L('almofada', 1, 'mao', [['tecido', 1], ['la', 1]]);
S('banco', 1, 'bancada', ['TTT', 'F.F'], { T: 'tabua', F: 'barra_ferro' });
// trilhos e vagonete
S('trilho', 8, 'bigorna', ['F.F', 'FGF', 'F.F'], { F: 'barra_ferro', G: 'graveto' });
S('trilho_turbo', 4, 'bigorna', ['O.O', 'OGO', 'OCO'], { O: 'barra_ouro', G: 'graveto', C: 'fio' });
S('vagonete', 1, 'oficina', ['F.F', 'FFF', 'R.R'], { F: 'barra_ferro', R: 'roda' });
// peças de máquina
S('engrenagem', 2, 'bigorna', ['.F.', 'F.F', '.F.'], { F: 'barra_ferro' });
L('fio', 4, 'bigorna', [['barra_cobre', 1]]);
S('roda', 2, 'oficina', ['.G.', 'GFG', '.G.'], { G: 'gosma', F: 'barra_ferro' });
S('motor', 1, 'oficina', ['FEF', 'CFC', 'FEF'], { F: 'barra_ferro', E: 'engrenagem', C: 'fio' });
S('chassi', 1, 'oficina', ['FFF', 'F.F'], { F: 'barra_ferro' });
S('assento', 1, 'oficina', ['P.', 'PP'], { P: 'tecido' });
S('volante', 1, 'oficina', ['FFF', 'F.F', 'FFF'], { F: 'barra_cobre' });
S('helice', 1, 'oficina', ['F.F', '.E.', 'F.F'], { F: 'barra_prata', E: 'engrenagem' });
S('casco', 1, 'oficina', ['T.T', 'TTT'], { T: 'tabua' });
S('cacamba', 1, 'oficina', ['F.F', 'FFF'], { F: 'barra_ferro' });
S('esteira', 1, 'oficina', ['RRR', 'FFF', 'RRR'], { R: 'roda', F: 'barra_ferro' });
S('garfo', 1, 'oficina', ['F.', 'F.', 'FF'], { F: 'barra_ferro' });
// kits de veículo
const KIT_ING: [string, number][][] = [
  [['chassi', 1], ['roda', 4], ['motor', 1], ['assento', 1]],
  [['chassi', 1], ['roda', 4], ['motor', 1], ['assento', 1], ['cacamba', 1], ['volante', 1]],
  [['chassi', 2], ['roda', 6], ['motor', 1], ['assento', 1], ['cacamba', 1], ['volante', 1]],
  [['chassi', 1], ['esteira', 2], ['motor', 1], ['assento', 1], ['cacamba', 1]],
  [['chassi', 1], ['esteira', 2], ['motor', 1], ['assento', 1]],
  [['chassi', 1], ['helice', 2], ['motor', 2], ['assento', 1]],
  [['casco', 1], ['motor', 1], ['assento', 1], ['helice', 1]],
  [['chassi', 1], ['roda', 4], ['motor', 1], ['assento', 1], ['garfo', 1]],
];
for (let k = 0; k < 8; k++) L(`kit_${k}`, 1, 'oficina', KIT_ING[k]);
// decoração
S('lanterna_rosa', 2, 'bancada', ['PTP'], { P: 'tecido', T: 'tocha' });
S('lanterna_azul', 2, 'bancada', ['VTV'], { V: 'po_sombra', T: 'tocha' });
S('lanterna_verde', 2, 'bancada', ['GTG'], { G: 'gosma', T: 'tocha' });
S('bandeirinhas', 2, 'bancada', ['CCC', 'PPP'], { C: 'corda', P: 'tecido' });
S('cata_vento', 1, 'bancada', ['P.P', '.G.', 'PGP'], { P: 'pena', G: 'graveto' });
S('balao', 1, 'mao', ['G', 'C'], { G: 'gosma', C: 'corda' });
S('fonte', 1, 'bancada', ['P.P', 'PVP', 'PPP'], { P: 'pedra_lisa', V: 'vidro' });
S('totem', 1, 'bancada', ['T', 'T', 'T'], { T: 'tora' });
S('planta', 1, 'mao', ['M', 'A'], { M: 'muda', A: 'argila' });
S('abobora', 1, 'bancada', ['FTF'], { F: 'fruta', T: 'tocha' });
S('sino', 1, 'bigorna', ['.O.', 'OOO'], { O: 'barra_ouro' });
// comida pronta
S('pao', 1, 'bancada', ['FFF'], { F: 'farinha' });
S('torta', 1, 'bancada', ['FFF', 'OAO'], { F: 'fruta', O: 'ovo', A: 'farinha' });
L('sopa', 1, 'bancada', [['cogumelo', 3], ['casca', 1]]);
L('bolo', 1, 'bancada', [['farinha', 3], ['ovo', 2], ['amora', 2]]);
S('espetinho', 2, 'mao', ['C', 'B', 'G'], { C: 'cenoura', B: 'batata_assada', G: 'graveto' });
// fornalha: metais, vidro, tijolos e comida
COOK('min_cobre', 'barra_cobre', 6);
COOK('min_ferro', 'barra_ferro', 8);
COOK('min_prata', 'barra_prata', 10);
COOK('min_ouro', 'barra_ouro', 10);
COOK('cristal', 'cristal_lap', 12);
COOK('areia', 'vidro', 5);
COOK('argila', 'tijolo', 5);
COOK('pedra', 'pedra_lisa', 4);
COOK('tora', 'carvao', 6);
COOK('cogumelo', 'cogumelo_assado', 4);
COOK('batata', 'batata_assada', 5);
COOK('ovo', 'ovo_frito', 3);
COOK('milho', 'pipoca', 3);
COOK('resina', 'gosma', 6);

export const SMELT = new Map<string, Recipe>();
for (const r of RECIPES) if (r.st === 'fornalha') SMELT.set(r.ing![0][0], r);

/* ------------------------------ utilidades ------------------------------ */
export function itemName(id: string): string {
  return ITEM.get(id)?.name() ?? id;
}
/** grade usada pela estação (2 = mão; 3 = bancada etc.) */
export function gridOf(st: Station): number {
  return st === 'mao' ? 2 : 3;
}
/** estações aceitas onde se está (a bigorna e a oficina também fazem coisas da bancada) */
export function stationsFor(here: Station): Station[] {
  if (here === 'bancada') return ['mao', 'bancada'];
  if (here === 'bigorna') return ['mao', 'bancada', 'bigorna'];
  if (here === 'oficina') return ['mao', 'bancada', 'oficina'];
  return ['mao'];
}

/**
 * Procura a receita que casa com a grade (n×n de ids ou ''), respeitando a estação.
 * Padrões casam em qualquer posição e espelhados; listas sem forma só olham os itens.
 */
export function matchGrid(grid: string[], n: number, here: Station): Recipe | null {
  const ok = stationsFor(here);
  // limites da área ocupada
  let x0 = n;
  let y0 = n;
  let x1 = -1;
  let y1 = -1;
  const cnt = new Map<string, number>();
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const id = grid[y * n + x];
      if (!id) continue;
      cnt.set(id, (cnt.get(id) ?? 0) + 1);
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  for (const r of RECIPES) {
    if (!ok.includes(r.st)) continue;
    if (r.pat) {
      const pw = r.pat[0].length;
      const ph = r.pat.length;
      if (pw !== w || ph !== h || pw > n || ph > n) continue;
      for (const mir of [false, true]) {
        let good = true;
        for (let y = 0; y < h && good; y++)
          for (let x = 0; x < w && good; x++) {
            const ch = r.pat[y][mir ? w - 1 - x : x];
            const want = ch === '.' ? '' : r.key![ch];
            if ((grid[(y0 + y) * n + x0 + x] || '') !== want) good = false;
          }
        if (good) return r;
      }
    } else if (r.ing) {
      if (r.ing.length !== cnt.size) continue;
      let good = true;
      for (const [id, k] of r.ing) if (cnt.get(id) !== k) good = false;
      if (good && r.ing.reduce((a, b) => a + b[1], 0) <= n * n) return r;
    }
  }
  return null;
}

/** coloca o padrão da receita na grade (para o livro de receitas); devolve ids por casa */
export function layout(r: Recipe, n: number): string[] {
  const g = new Array<string>(n * n).fill('');
  if (r.pat) {
    for (let y = 0; y < r.pat.length; y++) for (let x = 0; x < r.pat[y].length; x++) if (r.pat[y][x] !== '.') g[y * n + x] = r.key![r.pat[y][x]];
  } else if (r.ing) {
    let i = 0;
    for (const [id, k] of r.ing) for (let j = 0; j < k; j++) g[i++] = id;
  }
  return g;
}
/** quanto de cada item a receita gasta */
export function cost(r: Recipe): Map<string, number> {
  const m = new Map<string, number>();
  if (r.pat) for (const row of r.pat) for (const ch of row) if (ch !== '.') m.set(r.key![ch], (m.get(r.key![ch]) ?? 0) + 1);
  if (r.ing) for (const [id, k] of r.ing) m.set(id, (m.get(id) ?? 0) + k);
  return m;
}
