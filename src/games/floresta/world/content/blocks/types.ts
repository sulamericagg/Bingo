/* ============================================================
 *  BLOCOS — tipos do catálogo de materiais / blocos de construção.
 *  Puro (sem DOM, sem three): também entra no Web Worker de malha.
 * ============================================================ */

/** Como o bloco é desenhado */
export const enum Render {
  /** nada (ar) */
  None = 0,
  /** duro: caixa com quinas chanfradas, junta com vizinhos iguais */
  Hard = 1,
  /** macio: superfície suave (surface nets) que se funde com vizinhos macios e com o terreno */
  Soft = 2,
  /** planta: dois planos cruzados com recorte (alpha test) */
  Cross = 3,
  /** forma: lista de caixas (tocha, cerca, porta, escada…) — ver shapes.ts */
  Shape = 4,
}

/** grupo de desenho (1 draw call por grupo por pedaço) */
export const enum Group {
  Opaque = 0,
  /** recorte (folhas, plantas, grades) */
  Cutout = 1,
  /** translúcido (vidro, gelo) */
  Glass = 2,
}

export type BlockCat =
  | 'solo' // terra & solo
  | 'areia'
  | 'gelo' // gelo e neve
  | 'pedra'
  | 'minerio'
  | 'madeira'
  | 'planta'
  | 'folhagem'
  | 'construcao'
  | 'decoracao'
  | 'funcional';

/** ferramenta que acelera/permite quebrar */
export type BlockTool = 'mao' | 'pick' | 'axe' | 'shovel';

/** desenhos procedurais do atlas (ver atlas.ts) */
export type Pat =
  | 'soil' | 'grass' | 'sand' | 'snow' | 'clay' | 'mud' | 'gravel' | 'ash' | 'moss'
  | 'stone' | 'cobble' | 'strata' | 'smooth' | 'basalt' | 'glossy' | 'marble' | 'porous' | 'magma'
  | 'ore' | 'gem' | 'crystal' | 'metal'
  | 'bark' | 'rings' | 'planks' | 'leaves' | 'bamboo' | 'stem' | 'cap'
  | 'bricks' | 'tiles' | 'roof' | 'concrete' | 'panel' | 'glass' | 'ice' | 'weave' | 'thatch' | 'plaster' | 'mosaic' | 'checker'
  | 'lamp' | 'furnace' | 'chestf' | 'bench' | 'door' | 'rail' | 'railx' | 'ladder' | 'bed' | 'cactus' | 'hay'
  | 'sp_grass' | 'sp_tall' | 'sp_flower' | 'sp_fern' | 'sp_reed' | 'sp_mush' | 'sp_bush' | 'sp_vine' | 'sp_sprout' | 'sp_lichen' | 'sp_coral';

/** desenho de um ladrilho: padrão + até 3 cores (#rrggbb) */
export interface Tex {
  p: Pat;
  a: string;
  b?: string;
  c?: string;
}

export type ShapeKind =
  | 'torch' | 'lantern' | 'fence' | 'pane' | 'door' | 'stairs' | 'slab' | 'carpet' | 'bed' | 'chest' | 'bench'
  | 'rail' | 'ladder' | 'spike_down' | 'spike_up' | 'cluster' | 'cactus' | 'post' | 'cube';

export interface Drop {
  /** id do item (ver BlockDef.item / itens do motor) */
  id: string;
  /** quantidade mínima e máxima */
  n?: [number, number];
  /** chance 0..1 (padrão 1) */
  p?: number;
}

export interface BlockDef {
  /** id estável (gravado em saves junto com `num`) */
  id: string;
  /** índice numérico (Uint16 nos pedaços). Só cresce — nunca reordenar. */
  num: number;
  name: () => string;
  cat: BlockCat;
  render: Render;
  group: Group;
  shape?: ShapeKind;
  /** ladrilhos por face (índices no atlas) */
  tiles: { top: number; side: number; bottom: number; front: number };
  /** cor média por face (0..1) — é a cor do vértice (o atlas só traz o detalhe) */
  colTop: [number, number, number];
  colSide: [number, number, number];
  /** cor que tinge um ladrilho branco compartilhado (lã, vidro, concreto) */
  tint?: string;
  /** segundos para quebrar com a ferramenta certa de nível 1 (mão = ×3) */
  hardness: number;
  tool: BlockTool;
  /** nível mínimo da ferramenta: 0 mão, 1 madeira, 2 pedra, 3 cobre, 4 ferro, 5 prata, 6 ouro, 7 cristal; 99 = inquebrável */
  tier: number;
  /** o que sai ao quebrar (vazio = nada). Padrão: o próprio item. */
  drops: Drop[];
  /** id do item que coloca este bloco (padrão = id) */
  item: string;
  stack: number;
  /** emite luz 0..15 */
  light: number;
  lightColor: string;
  /** queima / vira combustível (segundos de fogo, 0 = não) */
  flammable: number;
  /** cai quando não tem apoio (areia, cascalho, neve fofa) */
  gravity: boolean;
  /** tem colisão */
  solid: boolean;
  /** largura base do chanfro (blocos duros; 0 = quina viva) */
  bevel: number;
  /** cobre a face do vizinho inteira (para descartar faces escondidas) */
  occludes: boolean;
  /** biomas onde aparece naturalmente (dica para o gerador) */
  biomes: string[];
  /** usa a rotação (meta 0..3) ao colocar */
  rotates: boolean;
}

export interface TerrainSampler {
  /** altura do chão natural em (x,z) — o mais barato; vira densidade h−y */
  height?(x: number, z: number): number;
  /** densidade do terreno (>0 sólido), se o terreno tiver cavernas */
  density?(x: number, y: number, z: number): number;
  /** bloco (num) do terreno em (x,y,z) — só para cor da emenda; padrão 'grama' */
  block?(x: number, y: number, z: number): number;
}
