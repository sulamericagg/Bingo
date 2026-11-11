/* ============================================================
 *  BLOCOS — catálogo (dados). Materiais e blocos ORIGINAIS do Bloop World.
 *  Regras:
 *   - `num` = ordem de registro. Saves gravam `num` → SÓ ACRESCENTE no fim
 *     de cada seção nova; nunca reordene/remova (troque por `legado`).
 *   - nomes via t('blk.*') (traduzidos na exibição);
 *   - item = o que o jogador carrega; por padrão o próprio id. Ids que já
 *     existem no motor (terra, pedra, areia, argila, neve, carvao, min_*)
 *     são os mesmos, então "cavou terra → ganhou terra".
 *  Puro (sem DOM/three): entra no Worker de malha.
 * ============================================================ */
import { t } from '../../../../../i18n';
import { Group, Render, type BlockCat, type BlockDef, type BlockTool, type Drop, type ShapeKind, type Tex } from './types';

/* ------------------------------ ladrilhos ------------------------------ */
/** ladrilhos únicos do atlas (dedup por desenho+cores) */
export const TILES: Tex[] = [];
const tileIx = new Map<string, number>();
export const ATLAS_COLS = 16;
export const MAX_TILES = ATLAS_COLS * ATLAS_COLS;
function tile(x: Tex): number {
  const k = `${x.p}|${x.a}|${x.b ?? ''}|${x.c ?? ''}`;
  let i = tileIx.get(k);
  if (i === undefined) {
    i = TILES.length;
    if (i >= MAX_TILES) throw new Error('atlas de blocos cheio');
    TILES.push(x);
    tileIx.set(k, i);
  }
  return i;
}

/** '#rrggbb' → [r,g,b] lineares 0..1 (cores de vértice do three são lineares) */
export function hexLin(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)];
}

/* ------------------------------ registro ------------------------------ */
export const BLOCKS: BlockDef[] = [];
const byId = new Map<string, BlockDef>();

interface Opts {
  top?: Tex;
  bottom?: Tex;
  front?: Tex;
  /** cor do vértice no lugar da cor do ladrilho (ladrilhos brancos compartilhados: lã, vidro, concreto) */
  tint?: string;
  hardness?: number;
  tool?: BlockTool;
  tier?: number;
  drops?: Drop[];
  item?: string;
  stack?: number;
  light?: number;
  lightColor?: string;
  flammable?: number;
  gravity?: boolean;
  group?: Group;
  bevel?: number;
  solid?: boolean;
  biomes?: string[];
  shape?: ShapeKind;
  rotates?: boolean;
  occludes?: boolean;
}

function def(id: string, name: () => string, cat: BlockCat, render: Render, tex: Tex, o: Opts = {}): BlockDef {
  if (byId.has(id)) throw new Error('bloco repetido: ' + id);
  const soft = render === Render.Soft;
  const hard = render === Render.Hard;
  const cross = render === Render.Cross;
  const group = o.group ?? (cross ? Group.Cutout : Group.Opaque);
  const side = tile(tex);
  const top = o.top ? tile(o.top) : side;
  const tint = o.tint;
  const d: BlockDef = {
    id,
    num: BLOCKS.length,
    name,
    cat,
    render,
    group,
    shape: o.shape,
    tiles: { top, side, bottom: o.bottom ? tile(o.bottom) : side, front: o.front ? tile(o.front) : side },
    colTop: [1, 1, 1],
    colSide: [1, 1, 1],
    tint,
    hardness: o.hardness ?? (soft ? 0.6 : hard ? 1.6 : cross ? 0.05 : 0.8),
    tool: o.tool ?? (soft ? 'shovel' : hard ? 'pick' : 'mao'),
    tier: o.tier ?? (hard ? 1 : 0),
    drops: o.drops ?? [{ id: o.item ?? id }],
    item: o.item ?? id,
    stack: o.stack ?? (render === Render.Shape ? 16 : 99),
    light: o.light ?? 0,
    lightColor: o.lightColor ?? '#ffd08a',
    flammable: o.flammable ?? 0,
    gravity: o.gravity ?? false,
    solid: o.solid ?? !cross,
    bevel: o.bevel ?? (hard ? 0.075 : 0),
    occludes: o.occludes ?? ((soft || hard) && group === Group.Opaque),
    biomes: o.biomes ?? [],
    rotates: o.rotates ?? false,
  };
  BLOCKS.push(d);
  byId.set(id, d);
  return d;
}

export function block(id: string): BlockDef | undefined {
  return byId.get(id);
}
/** num do bloco pelo id (0 = ar se não existir) */
export function blockNum(id: string): number {
  return byId.get(id)?.num ?? 0;
}
export function blockDef(num: number): BlockDef {
  return BLOCKS[num] ?? BLOCKS[0];
}
/** bloco que um item coloca (null se o item não é bloco) */
export function blockForItem(itemId: string): BlockDef | null {
  for (const b of BLOCKS) if (b.num > 0 && b.item === itemId) return b;
  return null;
}

const soft = (id: string, n: () => string, cat: BlockCat, tex: Tex, o?: Opts) => def(id, n, cat, Render.Soft, tex, o);
const hard = (id: string, n: () => string, cat: BlockCat, tex: Tex, o?: Opts) => def(id, n, cat, Render.Hard, tex, o);
const plant = (id: string, n: () => string, tex: Tex, o?: Opts) => def(id, n, 'planta', Render.Cross, tex, { flammable: 2, ...o });
const shape = (id: string, n: () => string, cat: BlockCat, sh: ShapeKind, tex: Tex, o?: Opts) => def(id, n, cat, Render.Shape, tex, { shape: sh, ...o });
const T = (p: Tex['p'], a: string, b?: string, c?: string): Tex => ({ p, a, b, c });

/* ============================== 0. ar ============================== */
def('ar', () => t('blk.ar', 'Ar'), 'solo', Render.None, T('smooth', '#000000'), { solid: false, drops: [], occludes: false, hardness: 0 });

/* ============================== terra & solo (macios) ============================== */
const DIRT = '#8a6440';
soft('terra', () => t('blk.terra', 'Terra'), 'solo', T('soil', DIRT, '#6a4a2c', '#a8805a'), { biomes: ['bosque', 'tropical', 'outono'] });
soft('grama', () => t('blk.grama', 'Grama'), 'solo', T('soil', DIRT, '#6a4a2c', '#a8805a'), { top: T('grass', '#6cc24a', '#4e9e36', '#9ae070'), drops: [{ id: 'terra' }], biomes: ['bosque', 'cerejeiras'] });
soft('terra_arada', () => t('blk.terraArada', 'Terra Arada'), 'solo', T('soil', '#6e4a2c', '#4e321c', '#8a6440'), { drops: [{ id: 'terra' }] });
soft('terra_escura', () => t('blk.terraEscura', 'Terra Escura'), 'solo', T('soil', '#4a3a2a', '#2e2418', '#6a5640'), { biomes: ['pantano'] });
soft('terra_vermelha', () => t('blk.terraVermelha', 'Terra Vermelha'), 'solo', T('soil', '#b0603a', '#8a4428', '#d08a5a'), { biomes: ['savana'] });
soft('grama_seca', () => t('blk.gramaSeca', 'Grama Seca'), 'solo', T('soil', '#b0603a', '#8a4428', '#d08a5a'), { top: T('grass', '#d8c45a', '#b8a03a', '#f0de8a'), drops: [{ id: 'terra_vermelha' }], biomes: ['savana'] });
soft('grama_orvalho', () => t('blk.gramaOrvalho', 'Grama-Orvalho'), 'solo', T('soil', '#6a7a9a', '#4a5470', '#8a9ab8'), { top: T('grass', '#a8dcf8', '#80b8e0', '#e0f6ff'), drops: [{ id: 'terra' }], biomes: ['cristal'] });
soft('grama_lilas', () => t('blk.gramaLilas', 'Grama Lilás'), 'solo', T('soil', '#4a3a5a', '#2e2440', '#6a5a7a'), { top: T('grass', '#7a6ad0', '#5e50b0', '#a89aff'), drops: [{ id: 'terra' }], biomes: ['cogumelos'] });
soft('turfa', () => t('blk.turfa', 'Turfa'), 'solo', T('soil', '#3a3024', '#241c14', '#5a4a34'), { flammable: 20, biomes: ['pantano'] });
soft('lama', () => t('blk.lama', 'Lama'), 'solo', T('mud', '#5a4632', '#3a2c1e', '#7a6448'), { hardness: 0.4, biomes: ['pantano'] });
soft('argila', () => t('blk.argila', 'Argila'), 'solo', T('clay', '#c07a5a', '#a0624a', '#d89a7a'), { biomes: ['pantano', 'tropical'] });
soft('argila_cinza', () => t('blk.argilaCinza', 'Argila Cinza'), 'solo', T('clay', '#9a9aa4', '#7a7a86', '#babac4'));
soft('cascalho', () => t('blk.cascalho', 'Cascalho'), 'solo', T('gravel', '#8a8690', '#5a5660', '#b4b0ba'), { gravity: true, hardness: 0.7, drops: [{ id: 'cascalho' }, { id: 'pedrinha', p: 0.2 }] });
soft('cinza_vulcanica', () => t('blk.cinzaVulcanica', 'Cinza Vulcânica'), 'solo', T('ash', '#5a5658', '#3a3638', '#7a7678'), { gravity: true, biomes: ['vulcanico'] });
soft('musgo', () => t('blk.musgo', 'Tapete de Musgo'), 'solo', T('moss', '#4a8a3a', '#2e6a24', '#7ab85a'), { hardness: 0.3, flammable: 6, biomes: ['caverna', 'pantano'] });
soft('humus', () => t('blk.humus', 'Húmus'), 'solo', T('soil', '#3e2e22', '#2a1e14', '#5e4a36'), { top: T('moss', '#5a7a3a', '#3e5a26', '#7a9a52'), biomes: ['tropical', 'pantano'] });

/* ============================== areias ============================== */
soft('areia', () => t('blk.areia', 'Areia'), 'areia', T('sand', '#e8d49a', '#d4bc80', '#f6e8be'), { gravity: true, hardness: 0.5, biomes: ['praia', 'deserto'] });
soft('areia_dourada', () => t('blk.areiaDourada', 'Areia Dourada'), 'areia', T('sand', '#f0c46a', '#d8a44a', '#ffe0a0'), { gravity: true, hardness: 0.5, biomes: ['deserto'] });
soft('areia_rosa', () => t('blk.areiaRosa', 'Areia Rosada'), 'areia', T('sand', '#f0b4a8', '#d8948a', '#ffd8d0'), { gravity: true, hardness: 0.5, biomes: ['cerejeiras'] });
soft('areia_negra', () => t('blk.areiaNegra', 'Areia Negra'), 'areia', T('sand', '#4a4648', '#2e2a2c', '#6a6668'), { gravity: true, hardness: 0.5, biomes: ['vulcanico'] });
soft('areia_branca', () => t('blk.areiaBranca', 'Areia Branca'), 'areia', T('sand', '#f6f0e0', '#e0d8c4', '#ffffff'), { gravity: true, hardness: 0.5, biomes: ['praia'] });
hard('arenito', () => t('blk.arenito', 'Arenito'), 'areia', T('strata', '#e0c890', '#c8ac70', '#f0dcae'), { top: T('sand', '#e8d49a', '#d4bc80', '#f6e8be'), hardness: 1.2, biomes: ['deserto'] });
hard('arenito_liso', () => t('blk.arenitoLiso', 'Arenito Liso'), 'areia', T('smooth', '#ead6a0', '#d4bc84', '#f6e8c0'), { hardness: 1.2 });
hard('arenito_vermelho', () => t('blk.arenitoVermelho', 'Arenito Vermelho'), 'areia', T('strata', '#c8744a', '#a85a36', '#e09a6a'), { hardness: 1.2, biomes: ['deserto', 'savana'] });

/* ============================== gelo & neve ============================== */
soft('neve', () => t('blk.neve', 'Neve'), 'gelo', T('snow', '#f4f8ff', '#d8e4f4', '#ffffff'), { hardness: 0.3, biomes: ['nevado', 'montanha'] });
soft('neve_fofa', () => t('blk.neveFofa', 'Neve Fofa'), 'gelo', T('snow', '#fafcff', '#e4ecf8', '#ffffff'), { hardness: 0.15, gravity: true, drops: [{ id: 'neve' }], biomes: ['nevado'] });
soft('neve_compacta', () => t('blk.neveCompacta', 'Neve Compacta'), 'gelo', T('snow', '#e0eaf6', '#c4d2e4', '#f4f8ff'), { hardness: 0.7 });
hard('gelo', () => t('blk.gelo', 'Gelo'), 'gelo', T('ice', '#a8dcf8', '#80c0e8', '#e8f8ff'), { group: Group.Glass, hardness: 0.8, bevel: 0.05, biomes: ['nevado'] });
hard('gelo_azul', () => t('blk.geloAzul', 'Gelo Azul-Profundo'), 'gelo', T('ice', '#5a9ae8', '#3a76c8', '#a8d4ff'), { hardness: 1.4, bevel: 0.05 });
hard('gelo_eterno', () => t('blk.geloEterno', 'Gelo Eterno'), 'gelo', T('crystal', '#bff0ff', '#80d0f0', '#ffffff'), { group: Group.Glass, hardness: 2, tier: 3, light: 4, lightColor: '#bff0ff', biomes: ['cristal'] });
soft('permafrost', () => t('blk.permafrost', 'Chão Congelado'), 'gelo', T('soil', '#6a6a7a', '#4a4a5a', '#c8d8ec'), { hardness: 1, biomes: ['nevado'] });

/* ============================== pedras ============================== */
const STONE = '#8e8a96';
hard('pedra', () => t('blk.pedra', 'Pedra'), 'pedra', T('stone', STONE, '#6e6a76', '#aeaab6'));
hard('pedra_funda', () => t('blk.pedraFunda', 'Pedra Profunda'), 'pedra', T('stone', '#5a5668', '#3e3a4a', '#77738a'), { hardness: 2.6, tier: 2 });
hard('rocha_mae', () => t('blk.rochaMae', 'Rocha-Mãe'), 'pedra', T('basalt', '#2a2436', '#16121e', '#3e3650'), { tier: 99, hardness: 999, drops: [] });
hard('pedregulho', () => t('blk.pedregulho', 'Pedregulho'), 'pedra', T('cobble', '#9a96a0', '#6a6672', '#c4c0ca'), { bevel: 0.1 });
hard('pedra_lisa', () => t('blk.pedraLisa', 'Pedra Lisa'), 'pedra', T('smooth', '#c8c4d0', '#a8a4b0', '#e0dce6'), { bevel: 0.05 });
hard('calcario', () => t('blk.calcario', 'Calcário'), 'pedra', T('porous', '#e0d8c4', '#c4baa2', '#f4eedc'), { hardness: 1.2 });
hard('granito_rosa', () => t('blk.granitoRosa', 'Granito Rosado'), 'pedra', T('stone', '#c49a94', '#9a6e6a', '#e8c4bc'), { hardness: 2 });
hard('ardosia', () => t('blk.ardosia', 'Ardósia'), 'pedra', T('strata', '#4e5866', '#3a424e', '#6a7684'), { hardness: 1.8 });
hard('basalto', () => t('blk.basalto', 'Basalto'), 'pedra', T('basalt', '#3e3a40', '#2a262c', '#5a5660'), { hardness: 2.2, tier: 2, biomes: ['vulcanico'] });
hard('obsidiana', () => t('blk.obsidiana', 'Obsidiana'), 'pedra', T('glossy', '#1e1428', '#0e0814', '#5a3a8a'), { hardness: 8, tier: 4, bevel: 0.04, biomes: ['vulcanico'] });
hard('pedra_pomes', () => t('blk.pedraPomes', 'Pedra-Pomes'), 'pedra', T('porous', '#b4aca0', '#8a8278', '#d4ccc0'), { hardness: 0.8, biomes: ['vulcanico'] });
hard('marmore', () => t('blk.marmore', 'Mármore Nuvem'), 'pedra', T('marble', '#f0eef4', '#c8c4d8', '#ffffff'), { hardness: 2, bevel: 0.05 });
hard('quartzito', () => t('blk.quartzito', 'Quartzito'), 'pedra', T('smooth', '#e8dcea', '#ccbcd0', '#fff4ff'), { hardness: 2.2, tier: 2 });
hard('pedra_musgosa', () => t('blk.pedraMusgosa', 'Pedra Musgosa'), 'pedra', T('stone', STONE, '#6e6a76', '#5a9a46'), { top: T('moss', '#4a8a3a', '#2e6a24', '#7ab85a'), biomes: ['caverna', 'pantano'] });
hard('xisto', () => t('blk.xisto', 'Xisto Brilhante'), 'pedra', T('strata', '#6a7470', '#4e5654', '#b8c4c0'), { hardness: 1.8, biomes: ['montanha'] });
hard('rocha_brasa', () => t('blk.rochaBrasa', 'Rocha-Brasa'), 'pedra', T('magma', '#3a2420', '#ff6a1a', '#ffd04a'), { hardness: 2, tier: 2, light: 9, lightColor: '#ff7a2a', biomes: ['vulcanico'] });
hard('travertino', () => t('blk.travertino', 'Travertino'), 'pedra', T('strata', '#d8c8a8', '#bca888', '#ece0c8'), { hardness: 1.5 });
hard('pedra_orvalho', () => t('blk.pedraOrvalho', 'Pedra-Orvalho'), 'pedra', T('stone', '#a0b4f0', '#7a8ed0', '#d0dcff'), { hardness: 1.8, biomes: ['cristal'] });

/* ============================== minérios ============================== */
const ore = (id: string, n: () => string, host: string, spot: string, spot2: string, tier: number, drop: string, o: Opts = {}) =>
  hard(id, n, 'minerio', T('ore', host, spot, spot2), { tier, hardness: 1.8 + tier * 0.4, drops: [{ id: drop }], bevel: 0.08, ...o });
ore('min_carvao', () => t('blk.minCarvao', 'Veio de Carvão'), STONE, '#2a2630', '#4a4650', 1, 'carvao');
ore('min_cobre', () => t('blk.minCobre', 'Pedra de Cobre'), STONE, '#f08a4a', '#ffc08a', 2, 'min_cobre');
ore('min_ferro', () => t('blk.minFerro', 'Pedra de Ferro'), STONE, '#d8b49a', '#f4e0d0', 3, 'min_ferro');
ore('min_prata', () => t('blk.minPrata', 'Pedra de Prata'), '#6a6678', '#e8f0ff', '#ffffff', 4, 'min_prata');
ore('min_ouro', () => t('blk.minOuro', 'Pedra de Ouro'), '#6a6678', '#ffd02e', '#fff09a', 4, 'min_ouro');
ore('min_cristal', () => t('blk.minCristal', 'Veio de Cristal'), '#5a5668', '#7af0ff', '#e0ffff', 5, 'cristal', { light: 6, lightColor: '#7af0ff' });
ore('min_gema', () => t('blk.minGema', 'Ninho de Gema-Estrela'), '#5a5668', '#ff4ad8', '#ffd0f4', 6, 'gema', { light: 5, lightColor: '#ff7ae0' });
ore('min_cobre_fundo', () => t('blk.minCobreFundo', 'Cobre Profundo'), '#5a5668', '#f08a4a', '#ffc08a', 2, 'min_cobre', { drops: [{ id: 'min_cobre', n: [1, 2] }] });
ore('min_ferro_fundo', () => t('blk.minFerroFundo', 'Ferro Profundo'), '#5a5668', '#d8b49a', '#f4e0d0', 3, 'min_ferro', { drops: [{ id: 'min_ferro', n: [1, 2] }] });
ore('min_ouro_fundo', () => t('blk.minOuroFundo', 'Ouro Profundo'), '#3e3a4a', '#ffd02e', '#fff09a', 4, 'min_ouro', { drops: [{ id: 'min_ouro', n: [1, 2] }] });
/* gemas raras (originais) */
const gem = (id: string, n: () => string, c: string, c2: string, light: number, tier: number) =>
  hard(id, n, 'minerio', T('gem', '#4a4658', c, c2), { tier, hardness: 3 + tier * 0.3, drops: [{ id: id.replace('min_', 'gema_') }], light, lightColor: c2, bevel: 0.08 });
gem('min_solarita', () => t('blk.minSolarita', 'Solarita'), '#ffb02e', '#fff0a0', 7, 5);
gem('min_lumelita', () => t('blk.minLumelita', 'Lumelita'), '#3a8aff', '#bfe0ff', 8, 6);
gem('min_roselio', () => t('blk.minRoselio', 'Rosélio'), '#ff6aa8', '#ffd0e4', 5, 5);
gem('min_verdambar', () => t('blk.minVerdambar', 'Verdâmbar'), '#3ad07a', '#c0ffd8', 5, 6);
gem('min_noctita', () => t('blk.minNoctita', 'Noctita'), '#7a3aff', '#d8b8ff', 6, 7);
hard('enxofre', () => t('blk.enxofre', 'Crosta de Enxofre'), 'minerio', T('porous', '#e8d43a', '#c4b020', '#fff07a'), { hardness: 1, biomes: ['vulcanico'], drops: [{ id: 'enxofre', n: [1, 3] }] });
/* blocos de metal refinado */
const metal = (id: string, n: () => string, c: string, c2: string, c3: string, tier: number, o: Opts = {}) =>
  hard(id, n, 'minerio', T('metal', c, c2, c3), { tier, hardness: 4, bevel: 0.06, ...o });
metal('bloco_cobre', () => t('blk.blocoCobre', 'Bloco de Cobre'), '#f08a4a', '#b05a2a', '#ffc08a', 2);
metal('bloco_ferro', () => t('blk.blocoFerro', 'Bloco de Ferro'), '#c8ccd8', '#8a90a0', '#f4f6fc', 3);
metal('bloco_prata', () => t('blk.blocoPrata', 'Bloco de Prata'), '#e8f0ff', '#a0b0d0', '#ffffff', 4);
metal('bloco_ouro', () => t('blk.blocoOuro', 'Bloco de Ouro'), '#ffd02e', '#c89a10', '#fff09a', 4);
hard('bloco_cristal', () => t('blk.blocoCristal', 'Bloco de Cristal'), 'minerio', T('crystal', '#7af0ff', '#3ab0d0', '#e0ffff'), { group: Group.Glass, tier: 4, hardness: 3, light: 10, lightColor: '#7af0ff', bevel: 0.1 });
metal('bloco_carvao', () => t('blk.blocoCarvao', 'Bloco de Carvão'), '#2e2a30', '#1a161c', '#4a4650', 1, { flammable: 400 });

/* ============================== madeiras (9 árvores) ============================== */
interface Wood {
  k: string;
  n: () => string;
  bark: string;
  bark2: string;
  wood: string;
  wood2: string;
  leaf: string;
  leaf2: string;
  biome: string;
}
const WOODS: Wood[] = [
  { k: 'carvalho', n: () => t('blk.w.carvalho', 'Carvalho'), bark: '#7a5434', bark2: '#5a3a20', wood: '#d8a060', wood2: '#b07a40', leaf: '#5cc24a', leaf2: '#3e9a3a', biome: 'bosque' },
  { k: 'pinheiro', n: () => t('blk.w.pinheiro', 'Pinheiro'), bark: '#6a4428', bark2: '#4a2e18', wood: '#c89a64', wood2: '#a07444', leaf: '#3a9a6a', leaf2: '#2a7452', biome: 'nevado' },
  { k: 'palmeira', n: () => t('blk.w.palmeira', 'Palmeira-Leque'), bark: '#b08a5a', bark2: '#7e6040', wood: '#e8c890', wood2: '#c8a46a', leaf: '#3ed06a', leaf2: '#22a24a', biome: 'tropical' },
  { k: 'cerejeira', n: () => t('blk.w.cerejeira', 'Cerejeira-Nuvem'), bark: '#6a4448', bark2: '#4a2c30', wood: '#e8a8a0', wood2: '#c88078', leaf: '#ffb3d1', leaf2: '#ff8ab8', biome: 'cerejeiras' },
  { k: 'sombrinha', n: () => t('blk.w.sombrinha', 'Sombrinha'), bark: '#8a6a44', bark2: '#5e4428', wood: '#e0a84a', wood2: '#b8822e', leaf: '#9ac24a', leaf2: '#6e9a34', biome: 'savana' },
  { k: 'chorao', n: () => t('blk.w.chorao', 'Chorão-do-Brejo'), bark: '#5a4e38', bark2: '#3a3224', wood: '#a8a070', wood2: '#847c50', leaf: '#8acb6a', leaf2: '#5a9a4a', biome: 'pantano' },
  { k: 'brasa', n: () => t('blk.w.brasa', 'Bordo-Brasa'), bark: '#6e4a36', bark2: '#4a2e20', wood: '#c8603a', wood2: '#9a4428', leaf: '#ff8a2e', leaf2: '#e2482e', biome: 'outono' },
  { k: 'betula', n: () => t('blk.w.betula', 'Bétula-Dourada'), bark: '#f2eee2', bark2: '#3a3430', wood: '#f4e4bc', wood2: '#d8c494', leaf: '#ffd34a', leaf2: '#f0a82e', biome: 'outono' },
  { k: 'cogulo', n: () => t('blk.w.cogulo', 'Cogumelo-Torre'), bark: '#e8dcd0', bark2: '#b8a898', wood: '#c8b8e8', wood2: '#a090c8', leaf: '#8a5aff', leaf2: '#ff6ad0', biome: 'cogumelos' },
];
for (const W of WOODS) {
  hard(`tora_${W.k}`, () => t('blk.tpl.tora', 'Tora de {w}', { w: W.n() }), 'madeira', T('bark', W.bark, W.bark2, W.wood), {
    top: T('rings', W.wood, W.wood2, W.bark),
    tool: 'axe',
    tier: 0,
    hardness: 1.4,
    flammable: 15,
    bevel: 0.1,
    biomes: [W.biome],
  });
  hard(`tabuas_${W.k}`, () => t('blk.tpl.tabuas', 'Tábuas de {w}', { w: W.n() }), 'madeira', T('planks', W.wood, W.wood2, W.bark2), { tool: 'axe', tier: 0, hardness: 1, flammable: 7, bevel: 0.05 });
  hard(`folhas_${W.k}`, () => t('blk.tpl.folhas', 'Folhas de {w}', { w: W.n() }), 'folhagem', T('leaves', W.leaf, W.leaf2, W.leaf), {
    group: Group.Cutout,
    tool: 'mao',
    tier: 0,
    hardness: 0.2,
    flammable: 2,
    bevel: 0,
    solid: true,
    drops: [{ id: 'folha', n: [0, 1] }, { id: `muda_${W.k}`, p: 0.08 }],
    biomes: [W.biome],
  });
}
hard('bambu', () => t('blk.bambu', 'Bloco de Bambu'), 'madeira', T('bamboo', '#9ad05a', '#6aa03a', '#d8f0a0'), { tool: 'axe', tier: 0, hardness: 0.8, flammable: 5, bevel: 0.08, biomes: ['bambu'] });
hard('palha', () => t('blk.palha', 'Fardo de Palha'), 'madeira', T('hay', '#e8c45a', '#c4a038', '#fff0a0'), { tool: 'mao', tier: 0, hardness: 0.5, flammable: 8, bevel: 0.12 });
hard('cogumelo_chapeu', () => t('blk.cogumeloChapeu', 'Chapéu de Cogumelo'), 'folhagem', T('cap', '#ff5a6a', '#ffffff', '#d83a4a'), { tool: 'axe', tier: 0, hardness: 0.5, bevel: 0.14, biomes: ['cogumelos'] });
hard('cogumelo_chapeu_azul', () => t('blk.cogumeloChapeuAzul', 'Chapéu de Cogumelo-Luar'), 'folhagem', T('cap', '#5a7aff', '#bfe0ff', '#3a4ad8'), { tool: 'axe', tier: 0, hardness: 0.5, bevel: 0.14, light: 6, lightColor: '#8ab0ff', biomes: ['cogumelos'] });

/* ============================== plantas (cruzadas) ============================== */
plant('capim', () => t('blk.capim', 'Tufo de Capim'), T('sp_grass', '#6cc24a', '#4e9e36', '#9ae070'), { drops: [{ id: 'fibra', p: 0.3 }], biomes: ['bosque'] });
plant('capim_alto', () => t('blk.capimAlto', 'Capim-Alto'), T('sp_tall', '#d8c45a', '#a8943a', '#f0de8a'), { drops: [{ id: 'fibra', n: [1, 2] }], biomes: ['savana'] });
plant('flor_sol', () => t('blk.florSol', 'Flor-Sol'), T('sp_flower', '#4e9e36', '#ffd34a', '#ff8a2e'), { drops: [{ id: 'flor_sol' }] });
plant('flor_lilas', () => t('blk.florLilas', 'Sininho Lilás'), T('sp_flower', '#4e9e36', '#b08aff', '#ffffff'));
plant('flor_brasa', () => t('blk.florBrasa', 'Flor-Brasa'), T('sp_flower', '#4e9e36', '#ff4a3a', '#ffd34a'), { biomes: ['savana', 'outono'] });
plant('flor_gelo', () => t('blk.florGelo', 'Flor-de-Gelo'), T('sp_flower', '#5a8aa0', '#e0f6ff', '#7ad0ff'), { light: 3, lightColor: '#bff0ff', biomes: ['nevado', 'cristal'] });
plant('samambaia', () => t('blk.samambaia', 'Samambaia'), T('sp_fern', '#3e9a3a', '#2a7a2a', '#7ad05a'), { biomes: ['tropical', 'pantano'] });
plant('junco', () => t('blk.junco', 'Junco'), T('sp_reed', '#7a9a4a', '#5a7a34', '#8a5a2a'), { biomes: ['pantano'] });
plant('cogumelo_vermelho', () => t('blk.cogumeloVermelho', 'Cogumelo-Bolinha'), T('sp_mush', '#ff5a6a', '#ffffff', '#f4e8d8'), { drops: [{ id: 'cogumelo' }], biomes: ['caverna', 'cogumelos'] });
plant('cogumelo_luar', () => t('blk.cogumeloLuar', 'Cogumelo-Luar'), T('sp_mush', '#5ac8ff', '#e0ffff', '#d8e0f8'), { light: 7, lightColor: '#7ad8ff', drops: [{ id: 'cogumelo_luar' }], biomes: ['caverna'] });
plant('arbusto_seco', () => t('blk.arbustoSeco', 'Arbusto Seco'), T('sp_bush', '#a8743c', '#7a5028', '#c49a5a'), { drops: [{ id: 'graveto', n: [0, 2] }], biomes: ['deserto'] });
plant('broto', () => t('blk.broto', 'Broto'), T('sp_sprout', '#6cc24a', '#9a6a3c', '#9ae070'), { drops: [{ id: 'muda' }] });
plant('cipo', () => t('blk.cipo', 'Cipó Pendente'), T('sp_vine', '#4a9a3a', '#2e7a2a', '#8ad05a'), { biomes: ['tropical', 'caverna'] });
plant('liquen_luz', () => t('blk.liquenLuz', 'Líquen-Vaga-lume'), T('sp_lichen', '#a8ff6a', '#e8ffb0', '#5ac83a'), { light: 5, lightColor: '#c8ff7a', biomes: ['caverna'] });
plant('coral_seco', () => t('blk.coralSeco', 'Coral-de-Pedra'), T('sp_coral', '#ff8a7a', '#ffc0a8', '#d85a4a'), { biomes: ['praia'] });
shape('cacto', () => t('blk.cacto', 'Cacto-Coluna'), 'planta', 'cactus', T('cactus', '#4aa85a', '#2e7a40', '#f4f0d0'), { top: T('cactus', '#5ab86a', '#2e7a40', '#ff7ab0'), tool: 'mao', hardness: 0.4, biomes: ['deserto'] });

/* ============================== natureza: cavernas ============================== */
shape('estalactite', () => t('blk.estalactite', 'Estalactite'), 'pedra', 'spike_down', T('stone', '#a49aa0', '#7a7076', '#c8bec4'), { tool: 'pick', tier: 1, hardness: 0.8, solid: false, drops: [{ id: 'pedrinha', n: [1, 2] }], biomes: ['caverna'] });
shape('estalagmite', () => t('blk.estalagmite', 'Estalagmite'), 'pedra', 'spike_up', T('stone', '#a49aa0', '#7a7076', '#c8bec4'), { tool: 'pick', tier: 1, hardness: 0.8, drops: [{ id: 'pedrinha', n: [1, 2] }], biomes: ['caverna'] });
shape('cacho_cristal', () => t('blk.cachoCristal', 'Cacho de Cristal'), 'minerio', 'cluster', T('crystal', '#7af0ff', '#3ab0d0', '#e0ffff'), { tool: 'pick', tier: 2, hardness: 1, light: 8, lightColor: '#7af0ff', solid: false, group: Group.Glass, drops: [{ id: 'cristal', n: [1, 2] }], biomes: ['caverna', 'cristal'] });
shape('cacho_ametista', () => t('blk.cachoRoxo', 'Cacho de Noctita'), 'minerio', 'cluster', T('crystal', '#b07aff', '#7a3aff', '#f0e0ff'), { tool: 'pick', tier: 3, hardness: 1, light: 7, lightColor: '#c08aff', solid: false, group: Group.Glass, drops: [{ id: 'gema_noctita', p: 0.5 }], biomes: ['caverna'] });

/* ============================== construção ============================== */
const brick = (id: string, n: () => string, c: string, c2: string, c3: string, o: Opts = {}) => hard(id, n, 'construcao', T('bricks', c, c2, c3), { hardness: 2, bevel: 0.05, ...o });
brick('tijolo', () => t('blk.tijolo', 'Tijolos'), '#d0603a', '#f0e0d0', '#a8482a');
brick('tijolo_claro', () => t('blk.tijoloClaro', 'Tijolos Areia'), '#e8c49a', '#fff4e4', '#c8a07a');
brick('tijolo_pedra', () => t('blk.tijoloPedra', 'Blocos de Pedra'), '#a8a4b0', '#5a5660', '#c8c4d0');
brick('tijolo_musgoso', () => t('blk.tijoloMusgoso', 'Blocos Musgosos'), '#98a49a', '#4a5a40', '#6aa04a');
brick('tijolo_escuro', () => t('blk.tijoloEscuro', 'Tijolos de Basalto'), '#4e4a54', '#2a262c', '#6a6670');
brick('tijolo_neve', () => t('blk.tijoloNeve', 'Tijolos de Neve'), '#eef4fc', '#b8c8dc', '#ffffff', { hardness: 0.6 });
brick('tijolo_vulcanico', () => t('blk.tijoloVulcanico', 'Tijolos de Brasa'), '#5a2a24', '#ff7a2a', '#7a3a2e', { light: 4, lightColor: '#ff7a2a' });
hard('ladrilho', () => t('blk.ladrilho', 'Ladrilho Branco'), 'construcao', T('tiles', '#f0f0f4', '#b8b8c4', '#ffffff'), { hardness: 1.5, bevel: 0.04 });
hard('ladrilho_xadrez', () => t('blk.ladrilhoXadrez', 'Ladrilho Xadrez'), 'construcao', T('checker', '#f0f0f4', '#3a3a4a', '#ffffff'), { hardness: 1.5, bevel: 0.04 });
hard('mosaico', () => t('blk.mosaico', 'Mosaico Colorido'), 'construcao', T('mosaic', '#7ad0ff', '#ff8ac8', '#ffd34a'), { hardness: 1.5, bevel: 0.04 });
const roof = (id: string, n: () => string, c: string, c2: string, c3: string) => hard(id, n, 'construcao', T('roof', c, c2, c3), { hardness: 1.4, bevel: 0.06 });
roof('telha_barro', () => t('blk.telhaBarro', 'Telhas de Barro'), '#c8603a', '#8a3a24', '#e8906a');
roof('telha_ardosia', () => t('blk.telhaArdosia', 'Telhas de Ardósia'), '#4e5866', '#2e3640', '#6e7a88');
roof('telha_azul', () => t('blk.telhaAzul', 'Telhas Azul-Céu'), '#4a8ad8', '#2a5aa8', '#8ac0ff');
roof('telha_verde', () => t('blk.telhaVerde', 'Telhas Verde-Musgo'), '#5a9a4a', '#3a6a30', '#8ac87a');
hard('reboco', () => t('blk.reboco', 'Reboco'), 'construcao', T('plaster', '#f4ecdc', '#dcd0bc', '#ffffff'), { hardness: 1.2, bevel: 0.04 });
hard('palha_teto', () => t('blk.palhaTeto', 'Telhado de Palha'), 'construcao', T('thatch', '#d8b45a', '#a8843a', '#f0d48a'), { tool: 'mao', tier: 0, hardness: 0.6, flammable: 8, bevel: 0.12 });
hard('painel_madeira', () => t('blk.painelMadeira', 'Painel de Madeira'), 'construcao', T('panel', '#c8904a', '#8a5a2e', '#e8b47a'), { tool: 'axe', tier: 0, hardness: 1, flammable: 6, bevel: 0.05 });
hard('painel_metal', () => t('blk.painelMetal', 'Painel de Metal'), 'construcao', T('panel', '#a8b0c0', '#6a7280', '#dce0ea'), { tier: 3, hardness: 3, bevel: 0.04 });
hard('painel_branco', () => t('blk.painelBranco', 'Painel Branco'), 'construcao', T('panel', '#f4f4f8', '#c4c4d0', '#ffffff'), { hardness: 1.2, bevel: 0.04 });
/* 16 cores originais (nomes-substantivo: "Lã Coral", "Vidro Menta"…) */
export const COLORS: [string, () => string, string][] = [
  ['neve', () => t('blk.cor.neve', 'Neve'), '#f8f8fc'],
  ['grafite', () => t('blk.cor.grafite', 'Grafite'), '#3a3a46'],
  ['nevoa', () => t('blk.cor.nevoa', 'Névoa'), '#a8acb8'],
  ['cereja', () => t('blk.cor.cereja', 'Cereja'), '#e23a4a'],
  ['coral', () => t('blk.cor.coral', 'Coral'), '#ff7a6a'],
  ['abobora', () => t('blk.cor.abobora', 'Abóbora'), '#ff8a2e'],
  ['mostarda', () => t('blk.cor.mostarda', 'Mostarda'), '#ffc82e'],
  ['limao', () => t('blk.cor.limao', 'Limão'), '#b8e83a'],
  ['menta', () => t('blk.cor.menta', 'Menta'), '#5ae0a0'],
  ['oliva', () => t('blk.cor.oliva', 'Oliva'), '#6a8a3a'],
  ['turquesa', () => t('blk.cor.turquesa', 'Turquesa'), '#2ac8d0'],
  ['ceu', () => t('blk.cor.ceu', 'Céu'), '#6ab0ff'],
  ['anil', () => t('blk.cor.anil', 'Anil'), '#4a5ad8'],
  ['lavanda', () => t('blk.cor.lavanda', 'Lavanda'), '#b08aff'],
  ['ameixa', () => t('blk.cor.ameixa', 'Ameixa'), '#8a3a8a'],
  ['chiclete', () => t('blk.cor.chiclete', 'Chiclete'), '#ff8ac8'],
];
const CONCRETE = ['neve', 'grafite', 'nevoa', 'cereja', 'mostarda', 'menta', 'ceu', 'lavanda', 'abobora', 'chiclete'];
const GLASS = ['cereja', 'abobora', 'mostarda', 'menta', 'turquesa', 'anil', 'lavanda', 'chiclete'];
for (const [k, cn, hx] of COLORS)
  if (CONCRETE.includes(k))
    hard(`concreto_${k}`, () => t('blk.tpl.concreto', 'Concreto {c}', { c: cn() }), 'construcao', T('concrete', '#ffffff', '#e8e8e8', '#f8f8f8'), { tint: hx, hardness: 1.8, bevel: 0.03 });
hard('vidro', () => t('blk.vidro', 'Vidro'), 'construcao', T('glass', '#d8f4ff', '#ffffff', '#a8d8f0'), { group: Group.Glass, hardness: 0.4, tier: 0, bevel: 0.03 });
hard('vidro_fosco', () => t('blk.vidroFosco', 'Vidro Fosco'), 'construcao', T('ice', '#e8f4fa', '#ffffff', '#c8e0ea'), { group: Group.Glass, hardness: 0.4, tier: 0, bevel: 0.03 });
for (const [k, cn, hx] of COLORS)
  if (GLASS.includes(k))
    hard(`vidro_${k}`, () => t('blk.tpl.vidro', 'Vidro {c}', { c: cn() }), 'construcao', T('glass', '#ffffff', '#ffffff', '#e0e0e0'), { tint: hx, group: Group.Glass, hardness: 0.4, tier: 0, bevel: 0.03 });

/* ============================== decoração ============================== */
for (const [k, cn, hx] of COLORS)
  hard(`la_${k}`, () => t('blk.tpl.la', 'Lã {c}', { c: cn() }), 'decoracao', T('weave', '#ffffff', '#e4e4e4', '#ffffff'), { tint: hx, tool: 'mao', tier: 0, hardness: 0.5, flammable: 5, bevel: 0.16 });
hard('pedra_vagalume', () => t('blk.pedraVagalume', 'Pedra-Vaga-lume'), 'decoracao', T('lamp', '#ffd86a', '#fff4c0', '#c89a2e'), { light: 15, lightColor: '#ffe08a', hardness: 0.6, tier: 0, bevel: 0.08 });
hard('lampada_cristal', () => t('blk.lampadaCristal', 'Lâmpada de Cristal'), 'decoracao', T('lamp', '#9af4ff', '#ffffff', '#3ab0d0'), { light: 14, lightColor: '#aaf8ff', hardness: 0.6, tier: 0, bevel: 0.08 });
hard('lampada_rosa', () => t('blk.lampadaRosa', 'Lâmpada Chiclete'), 'decoracao', T('lamp', '#ff9ad0', '#ffe8f4', '#d85a9a'), { light: 13, lightColor: '#ffb0dc', hardness: 0.6, tier: 0, bevel: 0.08 });
shape('lanterna', () => t('blk.lanterna', 'Lanterna de Papel'), 'decoracao', 'lantern', T('lamp', '#ff8a5a', '#ffe0a0', '#c84a2a'), { light: 12, lightColor: '#ffb07a', solid: false, flammable: 2 });
shape('lampiao', () => t('blk.lampiao', 'Lampião de Ferro'), 'decoracao', 'lantern', T('lamp', '#ffd34a', '#fff6c0', '#3a3a4a'), { light: 14, lightColor: '#ffd88a', solid: false, item: 'lampiao' });
shape('tapete_vermelho', () => t('blk.tapeteVermelho', 'Tapete Cereja'), 'decoracao', 'carpet', T('weave', '#ffffff', '#e4e4e4', '#ffffff'), { tint: '#e23a4a', solid: false, flammable: 3 });
shape('tapete_azul', () => t('blk.tapeteAzul', 'Tapete Céu'), 'decoracao', 'carpet', T('weave', '#ffffff', '#e4e4e4', '#ffffff'), { tint: '#6ab0ff', solid: false, flammable: 3 });
shape('poste_luz', () => t('blk.posteLuz', 'Poste de Luz'), 'decoracao', 'post', T('metal', '#3a3a4a', '#1e1e28', '#6a6a7a'), { top: T('lamp', '#ffd86a', '#fff4c0', '#c89a2e'), light: 13, lightColor: '#ffe08a', tool: 'pick' });

/* ============================== funcionais ============================== */
shape('tocha', () => t('blk.tocha', 'Tocha'), 'funcional', 'torch', T('planks', '#a8743c', '#7a5028', '#5a3a20'), { top: T('lamp', '#ffb02e', '#fff0a0', '#ff6a1a'), light: 13, lightColor: '#ffb060', solid: false, stack: 64, flammable: 1 });
shape('tocha_cristal', () => t('blk.tochaCristal', 'Tocha de Cristal'), 'funcional', 'torch', T('planks', '#6a6678', '#4a4658', '#3a3648'), { top: T('lamp', '#9af4ff', '#ffffff', '#3ab0d0'), light: 14, lightColor: '#aaf8ff', solid: false, stack: 64 });
shape('bancada', () => t('blk.bancada', 'Bancada'), 'funcional', 'bench', T('panel', '#c8904a', '#8a5a2e', '#e8b47a'), { top: T('bench', '#d8a060', '#8a5a2e', '#c8ccd8'), tool: 'axe', hardness: 1.2, flammable: 6, stack: 8, rotates: true });
shape('fornalha', () => t('blk.fornalha', 'Fornalha'), 'funcional', 'cube', T('cobble', '#8a8696', '#5a5668', '#b4b0ba'), { front: T('furnace', '#8a8696', '#ff7a1a', '#3a3648'), tool: 'pick', tier: 1, hardness: 2, light: 6, lightColor: '#ff8a3a', stack: 8, rotates: true });
shape('bau', () => t('blk.bau', 'Baú'), 'funcional', 'chest', T('planks', '#c8843c', '#8a5a2e', '#5a3a20'), { front: T('chestf', '#c8843c', '#ffd34a', '#5a3a20'), tool: 'axe', hardness: 1, flammable: 6, stack: 8, rotates: true });
shape('bau_ferro', () => t('blk.bauFerro', 'Baú de Ferro'), 'funcional', 'chest', T('metal', '#8a90a0', '#5a6070', '#c8ccd8'), { front: T('chestf', '#8a90a0', '#ffd34a', '#3a3a4a'), tool: 'pick', tier: 2, hardness: 3, stack: 8, rotates: true });
shape('porta_madeira', () => t('blk.portaMadeira', 'Porta de Madeira'), 'funcional', 'door', T('door', '#c8904a', '#8a5a2e', '#ffd34a'), { tool: 'axe', hardness: 1, flammable: 6, stack: 8, rotates: true });
shape('porta_ferro', () => t('blk.portaFerro', 'Porta de Ferro'), 'funcional', 'door', T('door', '#a8b0c0', '#6a7280', '#3a3a4a'), { tool: 'pick', tier: 2, hardness: 3, stack: 8, rotates: true });
shape('escada_madeira', () => t('blk.escadaMadeira', 'Degraus de Madeira'), 'funcional', 'stairs', T('planks', '#d8a060', '#b07a40', '#5a3a20'), { tool: 'axe', hardness: 1, flammable: 6, stack: 64, rotates: true });
shape('escada_pedra', () => t('blk.escadaPedra', 'Degraus de Pedra'), 'funcional', 'stairs', T('bricks', '#a8a4b0', '#5a5660', '#c8c4d0'), { tool: 'pick', tier: 1, hardness: 2, stack: 64, rotates: true });
shape('escada_mao', () => t('blk.escadaMao', 'Escada de Mão'), 'funcional', 'ladder', T('ladder', '#c8904a', '#8a5a2e', '#5a3a20'), { group: Group.Cutout, tool: 'axe', hardness: 0.5, flammable: 3, stack: 64, rotates: true, solid: false });
shape('laje_madeira', () => t('blk.lajeMadeira', 'Meia-Laje de Madeira'), 'funcional', 'slab', T('planks', '#d8a060', '#b07a40', '#5a3a20'), { tool: 'axe', hardness: 1, flammable: 4, stack: 64 });
shape('laje_pedra', () => t('blk.lajePedra', 'Meia-Laje de Pedra'), 'funcional', 'slab', T('smooth', '#c8c4d0', '#a8a4b0', '#e0dce6'), { tool: 'pick', tier: 1, hardness: 2, stack: 64 });
shape('cerca_madeira', () => t('blk.cercaMadeira', 'Cerca de Madeira'), 'funcional', 'fence', T('planks', '#c8904a', '#8a5a2e', '#5a3a20'), { tool: 'axe', hardness: 1, flammable: 5, stack: 64 });
shape('cerca_ferro', () => t('blk.cercaFerro', 'Grade de Ferro'), 'funcional', 'fence', T('metal', '#5a6070', '#3a4050', '#a8b0c0'), { tool: 'pick', tier: 2, hardness: 3, stack: 64 });
shape('vidraca', () => t('blk.vidraca', 'Vidraça'), 'funcional', 'pane', T('glass', '#d8f4ff', '#ffffff', '#a8d8f0'), { group: Group.Glass, hardness: 0.3, stack: 64 });
shape('trilho', () => t('blk.trilho', 'Trilho'), 'funcional', 'rail', T('rail', '#c8ccd8', '#8a5a2e', '#5a5668'), { front: T('railx', '#c8ccd8', '#8a5a2e', '#5a5668'), group: Group.Cutout, tool: 'pick', tier: 0, hardness: 0.6, solid: false, stack: 64, rotates: true });
shape('trilho_turbo', () => t('blk.trilhoTurbo', 'Trilho Turbo'), 'funcional', 'rail', T('rail', '#ffd02e', '#8a3a2e', '#ff4f6a'), { front: T('railx', '#ffd02e', '#8a3a2e', '#ff4f6a'), group: Group.Cutout, tool: 'pick', tier: 0, hardness: 0.6, solid: false, stack: 64, rotates: true, light: 3, lightColor: '#ffd02e' });
shape('cama', () => t('blk.cama', 'Cama Fofa'), 'funcional', 'bed', T('weave', '#ffffff', '#e4e4e4', '#ffffff'), { tint: '#ff8ac8', top: T('bed', '#ff8ac8', '#ffffff', '#c8904a'), tool: 'mao', hardness: 0.4, flammable: 6, stack: 4, rotates: true });

/** total de blocos (inclui o ar) */
export const BLOCK_COUNT = BLOCKS.length;

/*
 * Ladrilhos "de detalhe" (os dos macios): o atlas guarda cor/cor-base (×0,5) e a cor
 * base vai no vértice — assim terra↔grama↔areia se misturam suave na superfície.
 * Os demais são "de cor": o atlas guarda a cor e o vértice só leva AO × tinta.
 */
export const TILE_DETAIL = new Uint8Array(MAX_TILES);
for (const b of BLOCKS) if (b.render === Render.Soft) for (const k of [b.tiles.top, b.tiles.side, b.tiles.bottom]) TILE_DETAIL[k] = 1;
for (const b of BLOCKS) {
  const c = (ti: number): [number, number, number] => (b.tint ? hexLin(b.tint) : TILE_DETAIL[ti] ? hexLin(TILES[ti].a) : [1, 1, 1]);
  b.colTop = c(b.tiles.top);
  b.colSide = c(b.tiles.side);
}

/** nomes das categorias (UI de inventário/criativo) */
export const CAT_NAMES: Record<BlockCat, () => string> = {
  solo: () => t('blk.cat.solo', 'Terra & Solo'),
  areia: () => t('blk.cat.areia', 'Areias'),
  gelo: () => t('blk.cat.gelo', 'Gelo & Neve'),
  pedra: () => t('blk.cat.pedra', 'Pedras'),
  minerio: () => t('blk.cat.minerio', 'Minérios & Metais'),
  madeira: () => t('blk.cat.madeira', 'Madeiras'),
  planta: () => t('blk.cat.planta', 'Plantas'),
  folhagem: () => t('blk.cat.folhagem', 'Folhagens'),
  construcao: () => t('blk.cat.construcao', 'Construção'),
  decoracao: () => t('blk.cat.decoracao', 'Decoração'),
  funcional: () => t('blk.cat.funcional', 'Funcionais'),
};
