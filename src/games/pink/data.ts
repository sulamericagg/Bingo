/* ============================================================
 *  BLOOP PINK — dados de jogo: móveis, reforma, equipe, níveis, metas.
 * ============================================================ */
import { t } from '../../i18n';
import type { Shape } from './catalog';

/* ------------------------------ produtos: tamanho no mundo ------------------------------ */
/** largura, altura, profundidade (m) — um pouco maiores que o real para ler na prateleira */
export const SHAPE_DIM: Record<Shape, [number, number, number]> = {
  splash: [0.075, 0.22, 0.05],
  perfume: [0.09, 0.14, 0.06],
  lipstick: [0.036, 0.11, 0.036],
  gloss: [0.032, 0.12, 0.032],
  compact: [0.1, 0.032, 0.1],
  mascara: [0.03, 0.15, 0.03],
  polish: [0.046, 0.085, 0.046],
  tube: [0.06, 0.17, 0.04],
  dropper: [0.05, 0.13, 0.05],
  jar: [0.09, 0.07, 0.09],
  pump: [0.08, 0.24, 0.06],
  tub: [0.14, 0.18, 0.14],
  pills: [0.06, 0.11, 0.06],
  pouch: [0.18, 0.12, 0.08],
  brush: [0.04, 0.18, 0.04],
  giftbox: [0.22, 0.12, 0.16],
  fruit: [0.085, 0.08, 0.085],
  veg: [0.06, 0.2, 0.06],
  tray: [0.2, 0.05, 0.15],
  carton: [0.08, 0.2, 0.08],
  bottle: [0.085, 0.29, 0.085],
  sack: [0.17, 0.25, 0.08],
  can: [0.07, 0.11, 0.07],
  loaf: [0.22, 0.11, 0.12],
};
export const SLOT_W = 0.3;
export const SLOT_D = 0.36;
/** quantos itens cabem numa vaga (frentes × fundo) */
export function slotCap(s: Shape): { nx: number; nz: number; ny: number } {
  const [w, hh, d] = SHAPE_DIM[s];
  const nx = Math.max(1, Math.floor(SLOT_W / (w + 0.012)));
  const nz = Math.max(1, Math.floor(SLOT_D / (d + 0.012)));
  // embalagens baixas empilham
  const ny = hh < 0.05 ? 3 : hh < 0.13 && s === 'giftbox' ? 1 : 1;
  const tot = nx * nz * ny;
  if (tot > 12) {
    const nz2 = Math.max(1, Math.floor(12 / (nx * ny)));
    return { nx, nz: nz2, ny };
  }
  return { nx, nz, ny };
}
export const capOf = (s: Shape) => {
  const c = slotCap(s);
  return c.nx * c.nz * c.ny;
};

/* ------------------------------ móveis ------------------------------ */
export type FurnKind =
  | 'shelf'
  | 'shelfLux'
  | 'gondola'
  | 'table'
  | 'tableRound'
  | 'checkout'
  | 'checkout2'
  | 'selfcheck'
  | 'testPerfume'
  | 'testMakeup'
  | 'testNails'
  | 'plant'
  | 'pouf'
  | 'rug'
  | 'neon'
  | 'mirror'
  | 'flowers'
  | 'balloons'
  | 'lamp'
  | 'crate'
  | 'fridge'
  | 'freezer'
  | 'butcher'
  | 'desk'
  | 'rack'
  | 'safe'
  | 'sofa'
  | 'art'
  | 'bin';

export interface FurnDef {
  kind: FurnKind;
  name: string;
  price: number;
  lvl: number;
  /** pegada (m) com rotação 0: w ao longo de x, d ao longo de z */
  w: number;
  d: number;
  h: number;
  /** beleza que soma */
  beauty: number;
  /** encosta na parede (só nas bordas) */
  wall?: boolean;
  /** não bloqueia o caminho (tapete) */
  flat?: boolean;
  group: 'shelf' | 'checkout' | 'tester' | 'decor' | 'office';
  /** pode ficar no estoque (fundos) */
  stock?: boolean;
  /** frio: 1 geladeira (laticínios), 2 freezer/açougue (carnes, aceita também 1) */
  cold?: 1 | 2;
  icon: string;
}
export const FURN: Record<FurnKind, FurnDef> = {
  shelf: { kind: 'shelf', get name() { return t('pink.f.shelf', 'Prateleira'); }, price: 220, lvl: 1, w: 1.2, d: 0.46, h: 1.75, beauty: 1, group: 'shelf', icon: 'shelf' },
  gondola: { kind: 'gondola', get name() { return t('pink.f.gondola', 'Gôndola dupla'); }, price: 480, lvl: 6, w: 1.45, d: 0.9, h: 1.35, beauty: 2, group: 'shelf', icon: 'gondola' },
  shelfLux: { kind: 'shelfLux', get name() { return t('pink.f.shelfLux', 'Estante iluminada'); }, price: 900, lvl: 8, w: 1.2, d: 0.46, h: 2.0, beauty: 6, group: 'shelf', icon: 'shelfLux' },
  table: { kind: 'table', get name() { return t('pink.f.table', 'Mesa expositora'); }, price: 260, lvl: 3, w: 1.4, d: 0.75, h: 0.82, beauty: 3, group: 'shelf', icon: 'table' },
  tableRound: { kind: 'tableRound', get name() { return t('pink.f.tableRound', 'Ilha redonda'); }, price: 640, lvl: 14, w: 1.3, d: 1.3, h: 0.9, beauty: 6, group: 'shelf', icon: 'tableRound' },
  checkout: { kind: 'checkout', get name() { return t('pink.f.checkout', 'Caixa'); }, price: 300, lvl: 1, w: 1.6, d: 0.7, h: 1.0, beauty: 1, group: 'checkout', icon: 'register' },
  checkout2: { kind: 'checkout2', get name() { return t('pink.f.checkout2', 'Caixa com leitor'); }, price: 1400, lvl: 9, w: 1.6, d: 0.7, h: 1.0, beauty: 3, group: 'checkout', icon: 'scanner' },
  selfcheck: { kind: 'selfcheck', get name() { return t('pink.f.selfcheck', 'Autoatendimento'); }, price: 4200, lvl: 20, w: 0.8, d: 0.7, h: 1.5, beauty: 3, group: 'checkout', icon: 'kiosk' },
  testPerfume: { kind: 'testPerfume', get name() { return t('pink.f.testPerfume', 'Provador de perfume'); }, price: 380, lvl: 3, w: 0.9, d: 0.6, h: 1.25, beauty: 5, group: 'tester', icon: 'perfume' },
  testMakeup: { kind: 'testMakeup', get name() { return t('pink.f.testMakeup', 'Espelho de maquiagem'); }, price: 520, lvl: 5, w: 1.0, d: 0.6, h: 1.9, beauty: 6, group: 'tester', icon: 'mirror' },
  testNails: { kind: 'testNails', get name() { return t('pink.f.testNails', 'Mesa de unhas'); }, price: 460, lvl: 7, w: 1.1, d: 0.7, h: 0.9, beauty: 5, group: 'tester', icon: 'nails' },
  plant: { kind: 'plant', get name() { return t('pink.f.plant', 'Planta'); }, price: 60, lvl: 1, w: 0.5, d: 0.5, h: 1.3, beauty: 3, group: 'decor', icon: 'plant' },
  pouf: { kind: 'pouf', get name() { return t('pink.f.pouf', 'Pufe'); }, price: 90, lvl: 2, w: 0.6, d: 0.6, h: 0.45, beauty: 3, group: 'decor', icon: 'pouf' },
  rug: { kind: 'rug', get name() { return t('pink.f.rug', 'Tapete'); }, price: 120, lvl: 2, w: 2.0, d: 1.4, h: 0.02, beauty: 4, flat: true, group: 'decor', icon: 'rug' },
  flowers: { kind: 'flowers', get name() { return t('pink.f.flowers', 'Vaso de flores'); }, price: 80, lvl: 3, w: 0.45, d: 0.45, h: 1.0, beauty: 4, group: 'decor', icon: 'flowers' },
  mirror: { kind: 'mirror', get name() { return t('pink.f.mirror', 'Espelho de chão'); }, price: 240, lvl: 6, w: 0.8, d: 0.3, h: 1.9, beauty: 6, group: 'decor', icon: 'mirror' },
  neon: { kind: 'neon', get name() { return t('pink.f.neon', 'Neon de coração'); }, price: 420, lvl: 10, w: 1.0, d: 0.15, h: 1.0, beauty: 9, wall: true, group: 'decor', icon: 'heart' },
  balloons: { kind: 'balloons', get name() { return t('pink.f.balloons', 'Arco de balões'); }, price: 300, lvl: 12, w: 1.6, d: 0.5, h: 2.3, beauty: 8, group: 'decor', icon: 'balloon' },
  lamp: { kind: 'lamp', get name() { return t('pink.f.lamp', 'Luminária de chão'); }, price: 180, lvl: 8, w: 0.45, d: 0.45, h: 1.7, beauty: 5, group: 'decor', icon: 'lamp' },
  crate: { kind: 'crate', get name() { return t('pink.f.crate', 'Banca de hortifruti'); }, price: 200, lvl: 1, w: 1.4, d: 0.9, h: 1.0, beauty: 3, group: 'shelf', icon: 'apple' },
  fridge: { kind: 'fridge', get name() { return t('pink.f.fridge', 'Geladeira de porta de vidro'); }, price: 900, lvl: 2, w: 1.2, d: 0.7, h: 2.0, beauty: 3, group: 'shelf', icon: 'fridge', cold: 1 },
  freezer: { kind: 'freezer', get name() { return t('pink.f.freezer', 'Freezer horizontal'); }, price: 1100, lvl: 5, w: 1.6, d: 0.8, h: 0.9, beauty: 2, group: 'shelf', icon: 'fridge', cold: 2 },
  butcher: { kind: 'butcher', get name() { return t('pink.f.butcher', 'Balcão do açougue'); }, price: 1600, lvl: 5, w: 1.8, d: 0.9, h: 1.25, beauty: 5, group: 'shelf', icon: 'meat', cold: 2 },
  desk: { kind: 'desk', get name() { return t('pink.f.desk', 'Escritório (mesa e computador)'); }, price: 650, lvl: 4, w: 1.4, d: 0.75, h: 1.2, beauty: 2, group: 'office', icon: 'office', stock: true },
  rack: { kind: 'rack', get name() { return t('pink.f.rack', 'Porta-pallet do estoque'); }, price: 380, lvl: 5, w: 2.0, d: 0.8, h: 2.4, beauty: 0, group: 'office', icon: 'pallet', stock: true },
  safe: { kind: 'safe', get name() { return t('pink.f.safe', 'Cofre'); }, price: 1500, lvl: 8, w: 0.7, d: 0.65, h: 1.0, beauty: 0, group: 'office', icon: 'safe', stock: true },
  sofa: { kind: 'sofa', get name() { return t('pink.f.sofa', 'Sofá de espera'); }, price: 520, lvl: 4, w: 1.7, d: 0.8, h: 0.85, beauty: 6, group: 'decor', icon: 'sofa' },
  art: { kind: 'art', get name() { return t('pink.f.art', 'Quadro na parede'); }, price: 160, lvl: 2, w: 0.9, d: 0.12, h: 1.0, beauty: 4, wall: true, group: 'decor', icon: 'album' },
  bin: { kind: 'bin', get name() { return t('pink.f.bin', 'Lixeira de caixas'); }, price: 0, lvl: 99, w: 0.7, d: 0.7, h: 1.0, beauty: 0, group: 'decor', icon: 'bin' },
};
/** móveis do Mercadinho */
export const GROCERY_FURN: FurnKind[] = ['shelf', 'gondola', 'crate', 'fridge', 'freezer', 'butcher', 'table', 'checkout', 'checkout2', 'selfcheck', 'desk', 'rack', 'safe', 'plant', 'art', 'rug', 'flowers', 'lamp'];
export const SHOP_FURN: FurnKind[] = ['shelf', 'table', 'gondola', 'shelfLux', 'tableRound', 'checkout', 'checkout2', 'selfcheck', 'testPerfume', 'testMakeup', 'testNails', 'desk', 'rack', 'safe', 'plant', 'pouf', 'sofa', 'art', 'rug', 'flowers', 'mirror', 'lamp', 'neon', 'balloons'];

/** vagas de produto de cada móvel (no espaço local do móvel, frente = +z) */
export interface SlotSpec {
  x: number;
  y: number;
  z: number;
  /** 1 = vaga virada para +z, -1 = para -z */
  face: 1 | -1;
}
export function slotSpecs(kind: FurnKind): SlotSpec[] {
  const out: SlotSpec[] = [];
  if (kind === 'shelf' || kind === 'shelfLux') {
    const ys = kind === 'shelf' ? [0.14, 0.52, 0.9, 1.28] : [0.14, 0.52, 0.9, 1.28, 1.62];
    for (const y of ys) for (let i = 0; i < 4; i++) out.push({ x: -0.45 + i * 0.3, y: y + 0.025, z: 0.02, face: 1 });
  } else if (kind === 'gondola') {
    for (const y of [0.14, 0.52, 0.9]) for (const f of [1, -1] as const) for (let i = 0; i < 4; i++) out.push({ x: -0.45 + i * 0.3, y: y + 0.025, z: f * 0.22, face: f });
  } else if (kind === 'crate') {
    // caixotes inclinados: 2 fileiras × 3
    for (let r = 0; r < 2; r++) for (let i = 0; i < 3; i++) out.push({ x: -0.44 + i * 0.44, y: 0.62 + r * 0.26, z: 0.2 - r * 0.32, face: 1 });
  } else if (kind === 'fridge') {
    for (const y of [0.2, 0.62, 1.04, 1.46]) for (let i = 0; i < 3; i++) out.push({ x: -0.36 + i * 0.36, y: y + 0.02, z: 0.02, face: 1 });
  } else if (kind === 'freezer') {
    for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) out.push({ x: -0.54 + i * 0.36, y: 0.42, z: 0.17 - r * 0.34, face: 1 });
  } else if (kind === 'butcher') {
    for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) out.push({ x: -0.6 + i * 0.4, y: 0.82 + r * 0.06, z: 0.16 - r * 0.26, face: 1 });
  } else if (kind === 'table') {
    for (const f of [1, -1] as const) for (let i = 0; i < 4; i++) out.push({ x: -0.48 + i * 0.32, y: 0.82, z: f * 0.18, face: f });
  } else if (kind === 'tableRound') {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      out.push({ x: Math.sin(a) * 0.42, y: 0.9, z: Math.cos(a) * 0.42, face: 1 });
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      out.push({ x: Math.sin(a) * 0.14, y: 1.18, z: Math.cos(a) * 0.14, face: 1 });
    }
  }
  return out;
}

/* ------------------------------ reforma ------------------------------ */
export const PAINTS: { id: string; c: string; name: string }[] = [
  { id: 'blush', c: '#f8d7e3', get name() { return t('pink.paint.blush', 'Rosa bebê'); } },
  { id: 'rose', c: '#f2a7c3', get name() { return t('pink.paint.rose', 'Rosa'); } },
  { id: 'cream', c: '#f7efe4', get name() { return t('pink.paint.cream', 'Creme'); } },
  { id: 'lilac', c: '#ddd0f2', get name() { return t('pink.paint.lilac', 'Lilás'); } },
  { id: 'mint', c: '#d3efe4', get name() { return t('pink.paint.mint', 'Menta'); } },
  { id: 'peach', c: '#fbd9c4', get name() { return t('pink.paint.peach', 'Pêssego'); } },
  { id: 'white', c: '#f6f4f2', get name() { return t('pink.paint.white', 'Branco'); } },
  { id: 'sky', c: '#d6e8f7', get name() { return t('pink.paint.sky', 'Céu'); } },
  { id: 'berry', c: '#c75b8a', get name() { return t('pink.paint.berry', 'Framboesa'); } },
  { id: 'wine', c: '#7a2a4f', get name() { return t('pink.paint.wine', 'Vinho'); } },
];
export type FloorId = 'broken' | 'concrete' | 'tile' | 'terrazzo' | 'wood' | 'marble';
export const FLOORS: { id: FloorId; price: number; lvl: number; beauty: number; name: string }[] = [
  { id: 'broken', price: 0, lvl: 99, beauty: -10, get name() { return t('pink.floor.broken', 'Piso quebrado'); } },
  { id: 'concrete', price: 300, lvl: 1, beauty: 2, get name() { return t('pink.floor.concrete', 'Cimento queimado'); } },
  { id: 'tile', price: 700, lvl: 2, beauty: 8, get name() { return t('pink.floor.tile', 'Porcelanato'); } },
  { id: 'terrazzo', price: 1300, lvl: 4, beauty: 12, get name() { return t('pink.floor.terrazzo', 'Granilite rosa'); } },
  { id: 'wood', price: 1800, lvl: 5, beauty: 14, get name() { return t('pink.floor.wood', 'Madeira'); } },
  { id: 'marble', price: 4800, lvl: 15, beauty: 20, get name() { return t('pink.floor.marble', 'Mármore'); } },
];
export type SignId = 'none' | 'simple' | 'box' | 'neon' | 'gold' | 'flowers';
export const SIGNS: { id: SignId; price: number; lvl: number; beauty: number; name: string }[] = [
  { id: 'none', price: 0, lvl: 99, beauty: -8, get name() { return t('pink.sign.none', 'Sem placa'); } },
  { id: 'simple', price: 250, lvl: 1, beauty: 4, get name() { return t('pink.sign.simple', 'Placa pintada'); } },
  { id: 'box', price: 900, lvl: 2, beauty: 8, get name() { return t('pink.sign.box', 'Luminoso'); } },
  { id: 'neon', price: 1800, lvl: 6, beauty: 12, get name() { return t('pink.sign.neon', 'Neon'); } },
  { id: 'gold', price: 3200, lvl: 12, beauty: 15, get name() { return t('pink.sign.gold', 'Letras douradas'); } },
  { id: 'flowers', price: 5200, lvl: 20, beauty: 20, get name() { return t('pink.sign.flowers', 'Parede de flores'); } },
];
export const LIGHTS: { lvl: number; price: number; beauty: number; name: string }[] = [
  { lvl: 1, price: 0, beauty: -4, get name() { return t('pink.light.0', 'Lâmpada velha'); } },
  { lvl: 1, price: 350, beauty: 4, get name() { return t('pink.light.1', 'Luz branca'); } },
  { lvl: 4, price: 1200, beauty: 9, get name() { return t('pink.light.2', 'Spots quentes'); } },
  { lvl: 11, price: 3000, beauty: 14, get name() { return t('pink.light.3', 'Pendentes de vidro'); } },
];
export const FIX_WALLS = 400;
export const FIX_WINDOW = 350;
export const FIX_DOOR = 200;

/* ------------------------------ equipe ------------------------------ */
export type StaffKind = 'cleaner' | 'cashier' | 'stocker' | 'guard' | 'finance' | 'stockMgr' | 'robotStock' | 'robotClean';
export const STAFF: Record<StaffKind, { kind: StaffKind; name: string; lvl: number; hire: number; wage: number; color: string; robot?: boolean; icon: string; help?: string }> = {
  cleaner: { kind: 'cleaner', get name() { return t('pink.st.cleaner', 'Faxineira'); }, lvl: 2, hire: 150, wage: 40, color: '#7fd1c7', icon: 'mop' },
  cashier: { kind: 'cashier', get name() { return t('pink.st.cashier', 'Caixa'); }, lvl: 3, hire: 200, wage: 60, color: '#ff8cc0', icon: 'register' },
  guard: { kind: 'guard', get name() { return t('pink.st.guard', 'Segurança'); }, get help() { return t('pink.st.guardH', 'Barra ladrões e assustam assaltantes (às vezes se distrai)'); }, lvl: 3, hire: 260, wage: 70, color: '#2c3e6a', icon: 'guard' },
  finance: { kind: 'finance', get name() { return t('pink.st.finance', 'Financeiro'); }, get help() { return t('pink.st.financeH', 'Fica no escritório e dá alertas e dicas'); }, lvl: 6, hire: 420, wage: 110, color: '#7fd1a0', icon: 'office' },
  stockMgr: { kind: 'stockMgr', get name() { return t('pink.st.stockMgr', 'Gestor de estoque'); }, get help() { return t('pink.st.stockMgrH', 'Pede o que está acabando e leva caixas para os fundos'); }, lvl: 9, hire: 520, wage: 120, color: '#ffb27a', icon: 'pallet' },
  stocker: { kind: 'stocker', get name() { return t('pink.st.stocker', 'Repositora'); }, lvl: 7, hire: 260, wage: 70, color: '#b48cff', icon: 'box' },
  robotStock: { kind: 'robotStock', get name() { return t('pink.st.robotStock', 'Robô repositor'); }, lvl: 40, hire: 9000, wage: 0, color: '#c0c8d8', robot: true, icon: 'robot' },
  robotClean: { kind: 'robotClean', get name() { return t('pink.st.robotClean', 'Robô faxineiro'); }, lvl: 45, hire: 7000, wage: 0, color: '#c0c8d8', robot: true, icon: 'robot' },
};
export const STAFF_NAMES = ['Lulu', 'Mimi', 'Bia', 'Nina', 'Dudu', 'Tetê', 'Juju', 'Cacá', 'Lili', 'Bebel', 'Gigi', 'Fafá', 'Zizi', 'Malu', 'Pipa'];

/* ------------------------------ níveis ------------------------------ */
export const MAX_LEVEL = 100;
export const xpNeed = (lvl: number) => Math.round(60 * Math.pow(lvl, 1.55));
/** expansões da loja */
export const EXPANSIONS = [
  { lvl: 10, price: 6000, get name() { return t('pink.exp.1', 'Ampliação lateral'); } },
  { lvl: 25, price: 22000, get name() { return t('pink.exp.2', 'Salão dos fundos'); } },
];
export const RENT = (lvl: number, exp: number) => 60 + lvl * 8 + exp * 120;

/* ------------------------------ tablet ------------------------------ */
export const TABLET_UP = [
  { price: 0, get name() { return t('pink.tab.0', 'Tablet velhinho'); }, load: 0.6, bo: 0.3 },
  { price: 600, get name() { return t('pink.tab.1', 'Tablet novo'); }, load: 0.15, bo: 0.088 },
  { price: 2500, get name() { return t('pink.tab.2', 'Tablet Pro'); }, load: 0.15, bo: 0.08 },
  { price: 8000, get name() { return t('pink.tab.3', 'Tablet Ultra + fibra'); }, load: 0.05, bo: 0.03 },
];

/* ------------------------------ metas do dia ------------------------------ */
export type GoalKind = 'sell' | 'serve' | 'earn' | 'clean' | 'tester' | 'combo' | 'cat';
export interface Goal {
  k: GoalKind;
  n: number;
  have: number;
  cat?: string;
  xp: number;
  cash: number;
  done?: boolean;
}

/* ------------------------------ fábrica ------------------------------ */
export const TRUCKS = [
  { price: 0, cap: 6, trip: 60, get name() { return t('pink.truck.0', 'Furgão'); } },
  { price: 3500, cap: 10, trip: 55, get name() { return t('pink.truck.1', 'Caminhão-baú'); } },
  { price: 12000, cap: 16, trip: 45, get name() { return t('pink.truck.2', 'Carreta rosa'); } },
];
export const FACTORY_UPS = [
  { id: 'conveyor', lvl: 6, price: 2500, get name() { return t('pink.fu.conveyor', 'Esteira até a doca'); } },
  { id: 'dock2', lvl: 10, price: 6000, get name() { return t('pink.fu.dock2', 'Segunda doca'); } },
  { id: 'packer', lvl: 15, price: 9000, get name() { return t('pink.fu.packer', 'Embaladora automática'); } },
  { id: 'picker', lvl: 25, price: 18000, get name() { return t('pink.fu.picker', 'Robô separador'); } },
  { id: 'loader', lvl: 40, price: 40000, get name() { return t('pink.fu.loader', 'Carregador automático'); } },
] as const;
export type FactoryUp = (typeof FACTORY_UPS)[number]['id'];
