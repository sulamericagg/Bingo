/* ============================================================
 *  CASA, PLANETA & AMIGOS — catálogo de peças.
 *
 *  Toda escolha é INDEPENDENTE (cada campo do design é um índice) e
 *  cada opção muda o desenho de verdade. countCombinations() multiplica
 *  o número de opções de cada campo — é o número honesto de casas
 *  diferentes que o construtor consegue gerar (sem contar a posição
 *  livre dos móveis, que só aumentaria).
 * ============================================================ */
import { t } from '../i18n';
import type { HomeDesign, RoomDesign } from './api';

/* ---------------- paleta curada (seletor de cor livre) ---------------- */
export const PALETTE = [
  '#ff5c7a', '#ff8a3d', '#ffc93d', '#fff27a', '#b6f25a', '#4fd67a', '#2fb39a', '#46d9e6',
  '#3fa0ff', '#5866f0', '#8a5cff', '#c46bff', '#ff7ad9', '#ffb3c7', '#f5e6c8', '#c89a6a',
  '#8a5a3c', '#5b3a29', '#ffffff', '#d5d0e8', '#8f88a8', '#4a4466', '#262238', '#ffe0a3',
] as const;
export const pal = (i: number | string | undefined): string => PALETTE[((Number(i) || 0) % PALETTE.length + PALETTE.length) % PALETTE.length];

/* ---------------- preços ---------------- */
export type Cost =
  | { kind: 'free' }
  | { kind: 'coins'; n: number }
  | { kind: 'gems'; n: number }
  | { kind: 'video' }
  | { kind: 'pass' }
  | { kind: 'event' };

/** Preço determinístico por posição: 3 primeiras grátis (kit inicial). */
export function optionCost(field: string, idx: number, count: number): Cost {
  if (idx < 3) return { kind: 'free' };
  if (field.startsWith('d') && field.length === 2 && idx < 6) return { kind: 'free' };
  if (idx === count - 1 && count >= 6) return idx % 2 ? { kind: 'pass' } : { kind: 'event' };
  if (idx % 5 === 4) return { kind: 'video' };
  if (idx % 7 === 6) return { kind: 'gems', n: 3 + (idx % 4) };
  return { kind: 'coins', n: 40 + idx * 30 };
}
/** Cores: 12 primeiras grátis; depois moedas; 2 últimas por vídeo. */
export function colorCost(idx: number): Cost {
  if (idx < 12) return { kind: 'free' };
  if (idx >= PALETTE.length - 2) return { kind: 'video' };
  return { kind: 'coins', n: 25 };
}

/* ---------------- campos ---------------- */
export interface Field {
  key: string;
  label: () => string;
  /** opções (rótulos) OU `color: true` para paleta */
  options?: (() => string)[];
  color?: boolean;
  /** grupo de UI */
  group: string;
}

const L = (k: string, pt: string) => () => t('home.opt.' + k, pt);
const opts = (prefix: string, names: [string, string][]) => names.map(([k, pt]) => L(prefix + '.' + k, pt));

export const DECOR_OPTS = opts('decor', [
  ['none', 'Vazio'], ['tree', 'Árvore'], ['rock', 'Pedra'], ['flower', 'Flores'], ['lamp', 'Poste'], ['statue', 'Estátua'],
  ['windmill', 'Cata-vento'], ['fountain', 'Fonte'], ['swing', 'Balanço'], ['rocket', 'Foguete'], ['crystal', 'Cristal'],
  ['mushroom', 'Cogumelo'], ['flag', 'Bandeira'], ['snowman', 'Boneco de neve'],
]);

export const PLANET_FIELDS: Field[] = [
  { key: 'shape', group: 'shape', label: L('f.shape', 'Formato'), options: opts('shape', [['round', 'Redondo'], ['bumpy', 'Calombo'], ['gem', 'Joia'], ['squircle', 'Quadradinho'], ['heart', 'Coração'], ['cloud', 'Nuvem']]) },
  { key: 'size', group: 'shape', label: L('f.size', 'Tamanho'), options: opts('size', [['s', 'Mini'], ['m', 'Médio'], ['l', 'Grande'], ['xl', 'Gigante']]) },
  { key: 'terrain', group: 'ground', label: L('f.terrain', 'Terreno'), options: opts('terrain', [['grass', 'Grama'], ['sand', 'Areia'], ['snow', 'Neve'], ['candy', 'Doce'], ['rock', 'Rocha'], ['lava', 'Vulcão'], ['crystal', 'Cristal'], ['moss', 'Musgo'], ['cheese', 'Queijo'], ['checker', 'Xadrez']]) },
  { key: 'tcol', group: 'ground', label: L('f.tcol', 'Cor do chão'), color: true },
  { key: 'water', group: 'ground', label: L('f.water', 'Água'), options: opts('water', [['none', 'Sem água'], ['lake', 'Lago'], ['river', 'Rios'], ['ocean', 'Oceano'], ['ice', 'Gelo']]) },
  { key: 'path', group: 'ground', label: L('f.path', 'Caminho'), options: opts('path', [['none', 'Sem caminho'], ['stone', 'Pedrinhas'], ['spiral', 'Espiral'], ['steps', 'Passos'], ['rainbow', 'Arco-íris']]) },
  { key: 'sky', group: 'sky', label: L('f.sky', 'Céu do espaço'), options: opts('sky', [['night', 'Noite'], ['dusk', 'Entardecer'], ['candy', 'Algodão-doce'], ['ocean', 'Oceano'], ['aurora', 'Aurora'], ['ember', 'Brasa'], ['mint', 'Menta'], ['grape', 'Uva'], ['gold', 'Dourado'], ['ink', 'Nanquim'], ['peach', 'Pêssego'], ['galaxy', 'Galáxia']]) },
  { key: 'ring', group: 'sky', label: L('f.ring', 'Anéis'), options: opts('ring', [['none', 'Sem anel'], ['thin', 'Fino'], ['thick', 'Largo'], ['double', 'Duplo'], ['dots', 'Pontilhado'], ['rainbow', 'Arco-íris']]) },
  { key: 'rcol', group: 'sky', label: L('f.rcol', 'Cor do anel'), color: true },
  { key: 'moons', group: 'sky', label: L('f.moons', 'Luas'), options: opts('moons', [['0', 'Nenhuma'], ['1', '1 lua'], ['2', '2 luas'], ['3', '3 luas']]) },
  { key: 'clouds', group: 'sky', label: L('f.clouds', 'Nuvens'), options: opts('clouds', [['none', 'Céu limpo'], ['few', 'Poucas'], ['many', 'Muitas'], ['rainbow', 'Coloridas']]) },
  { key: 'veg', group: 'nature', label: L('f.veg', 'Vegetação'), options: opts('veg', [['none', 'Nenhuma'], ['round', 'Árvores'], ['pine', 'Pinheiros'], ['palm', 'Coqueiros'], ['mush', 'Cogumelos'], ['candy', 'Pirulitos'], ['crystal', 'Cristais']]) },
  ...[0, 1, 2, 3, 4, 5].map<Field>((i) => ({ key: 'd' + i, group: 'decor', label: () => t('home.opt.f.decor', 'Enfeite {n}', { n: i + 1 }), options: DECOR_OPTS })),
];

export const EXTERIOR_FIELDS: Field[] = [
  { key: 'found', group: 'base', label: L('f.found', 'Base'), options: opts('found', [['stone', 'Pedra'], ['wood', 'Palafita'], ['brick', 'Tijolo'], ['float', 'Flutuante'], ['crystal', 'Cristal']]) },
  { key: 'floors', group: 'base', label: L('f.floors', 'Andares'), options: opts('floors', [['1', '1 andar'], ['2', '2 andares'], ['3', '3 andares']]) },
  { key: 'wall', group: 'walls', label: L('f.wall', 'Parede'), options: opts('wall', [['paint', 'Pintada'], ['brick', 'Tijolinho'], ['wood', 'Tábuas'], ['stone', 'Pedra'], ['log', 'Tronco'], ['tile', 'Azulejo'], ['stripe', 'Listrada'], ['dots', 'Bolinhas']]) },
  { key: 'wcol', group: 'walls', label: L('f.wcol', 'Cor da parede'), color: true },
  { key: 'wfin', group: 'walls', label: L('f.wfin', 'Acabamento'), options: opts('wfin', [['solid', 'Lisa'], ['gradient', 'Degradê'], ['stripes', 'Listras'], ['stars', 'Estrelas'], ['glitter', 'Glitter']]) },
  { key: 'roof', group: 'roof', label: L('f.roof', 'Telhado'), options: opts('roof', [['gable', 'Triângulo'], ['flat', 'Reto'], ['dome', 'Cúpula'], ['tall', 'Bruxinha'], ['hip', 'Chalé'], ['mush', 'Cogumelo'], ['saw', 'Serrinha'], ['onion', 'Cebola']]) },
  { key: 'rfcol', group: 'roof', label: L('f.rfcol', 'Cor do telhado'), color: true },
  { key: 'chim', group: 'roof', label: L('f.chim', 'Chaminé'), options: opts('chim', [['none', 'Sem'], ['brick', 'Tijolo'], ['pipe', 'Cano'], ['round', 'Redonda'], ['heart', 'Fumaça coração']]) },
  { key: 'door', group: 'door', label: L('f.door', 'Porta'), options: opts('door', [['plain', 'Simples'], ['arch', 'Arco'], ['round', 'Redonda'], ['double', 'Dupla'], ['window', 'Com janela'], ['star', 'Estrela'], ['barn', 'Celeiro'], ['portal', 'Portal']]) },
  { key: 'dcol', group: 'door', label: L('f.dcol', 'Cor da porta'), color: true },
  { key: 'win', group: 'windows', label: L('f.win', 'Janelas'), options: opts('win', [['square', 'Quadrada'], ['round', 'Redonda'], ['arch', 'Arco'], ['cross', 'Cruz'], ['star', 'Estrela'], ['heart', 'Coração']]) },
  { key: 'wn', group: 'windows', label: L('f.wn', 'Quantidade'), options: opts('wn', [['1', '1 por andar'], ['2', '2 por andar'], ['3', '3 por andar'], ['4', '4 por andar']]) },
  { key: 'wfcol', group: 'windows', label: L('f.wfcol', 'Moldura'), color: true },
  { key: 'porch', group: 'extras', label: L('f.porch', 'Varanda'), options: opts('porch', [['none', 'Sem'], ['steps', 'Degraus'], ['awning', 'Toldo'], ['columns', 'Colunas']]) },
  { key: 'balc', group: 'extras', label: L('f.balc', 'Sacada'), options: opts('balc', [['none', 'Sem'], ['rail', 'Grade'], ['flowers', 'Floreira'], ['round', 'Redonda']]) },
  { key: 'tower', group: 'extras', label: L('f.tower', 'Torre/anexo'), options: opts('tower', [['none', 'Sem'], ['round', 'Torre redonda'], ['square', 'Torre quadrada'], ['garage', 'Garagem'], ['observ', 'Observatório']]) },
  { key: 'garden', group: 'yard', label: L('f.garden', 'Jardim'), options: opts('garden', [['none', 'Sem'], ['bush', 'Arbustos'], ['flowers', 'Flores'], ['veggies', 'Horta'], ['pond', 'Laguinho'], ['topiary', 'Esculturas']]) },
  { key: 'fence', group: 'yard', label: L('f.fence', 'Cerca'), options: opts('fence', [['none', 'Sem'], ['picket', 'Estacas'], ['hedge', 'Cerca viva'], ['stone', 'Muro'], ['candy', 'Bengalas'], ['rope', 'Corda']]) },
  { key: 'fcol', group: 'yard', label: L('f.fcol', 'Cor da cerca'), color: true },
  { key: 'sign', group: 'yard', label: L('f.sign', 'Placa com nome'), options: opts('sign', [['none', 'Sem'], ['wood', 'Madeira'], ['neon', 'Neon'], ['banner', 'Faixa']]) },
  { key: 'mail', group: 'yard', label: L('f.mail', 'Caixa de correio'), options: opts('mail', [['none', 'Sem'], ['classic', 'Clássica'], ['robot', 'Robô'], ['bird', 'Passarinho'], ['rocket', 'Foguete']]) },
  { key: 'lights', group: 'yard', label: L('f.lights', 'Luzes'), options: opts('lights', [['none', 'Sem'], ['warm', 'Amarelas'], ['string', 'Varal'], ['neon', 'Neon'], ['stars', 'Estrelinhas']]) },
];

/* ---------------- cômodos ---------------- */
export const ROOM_IDS = ['living', 'kitchen', 'bedroom', 'bath', 'party'] as const;
export type RoomId = (typeof ROOM_IDS)[number];
export const roomName = (r: string): string =>
  r === 'kitchen' ? t('home.room.kitchen', 'Cozinha') : r === 'bath' ? t('home.room.bath', 'Banheiro') : r === 'bedroom' ? t('home.room.bedroom', 'Quarto') : r === 'party' ? t('home.room.party', 'Salão de festa') : t('home.room.living', 'Sala');

export const FLOORS = ['wood', 'tile', 'carpet', 'checker', 'stone', 'grass', 'stars', 'hex', 'stripes', 'dots', 'marble', 'candy'] as const;
export const WALLS = ['paint', 'stripes', 'dots', 'brick', 'wood', 'stars', 'hearts', 'waves', 'tile', 'check', 'clouds', 'space'] as const;
export const floorName = (id: string) => t('home.floor.' + id, ({ wood: 'Taco', tile: 'Piso', carpet: 'Carpete', checker: 'Xadrez', stone: 'Pedra', grass: 'Gramado', stars: 'Estrelas', hex: 'Colmeia', stripes: 'Listras', dots: 'Bolinhas', marble: 'Mármore', candy: 'Doce' } as Record<string, string>)[id] ?? id);
export const wallName = (id: string) => t('home.wall.' + id, ({ paint: 'Pintura', stripes: 'Listras', dots: 'Bolinhas', brick: 'Tijolos', wood: 'Madeira', stars: 'Estrelas', hearts: 'Corações', waves: 'Ondas', tile: 'Azulejo', check: 'Xadrez', clouds: 'Nuvens', space: 'Espaço' } as Record<string, string>)[id] ?? id);
/** piso/parede id + cor: "wood:3" */
export const SURFACE_COLORS = 24;

/* ---------------- móveis (~120) ---------------- */
export type FurnKind =
  | 'sofa' | 'armchair' | 'bed' | 'bunk' | 'table' | 'chair' | 'stool' | 'floorlamp' | 'tablelamp' | 'plant' | 'cactus' | 'poster'
  | 'painting' | 'rug' | 'tv' | 'arcade' | 'aquarium' | 'bookcase' | 'shelf' | 'wardrobe' | 'fridge' | 'stove' | 'sink' | 'counter'
  | 'bathtub' | 'toilet' | 'mirror' | 'clock' | 'window' | 'piano' | 'guitar' | 'speaker' | 'discoball' | 'balloons' | 'toybox'
  | 'teddy' | 'beanbag' | 'desk' | 'computer' | 'fireplace' | 'partytable' | 'garland';
export interface FurnDef {
  id: string;
  kind: FurnKind;
  v: number; // variante de forma 0..2
  w: number; // tamanho lógico (sala 360×420)
  h: number;
  wall?: boolean; // vai na parede
  flat?: boolean; // tapete (sempre atrás)
  color: number; // cor padrão (índice da paleta)
  cost: Cost;
  name: () => string;
  /** cor exata (itens do Passe da Casa) */
  hex?: string;
  /** id do item do passe (desenho especial) */
  passId?: string;
}
const FK: [FurnKind, string, number, number, boolean?, boolean?][] = [
  ['sofa', 'Sofá', 120, 62], ['armchair', 'Poltrona', 62, 64], ['bed', 'Cama', 130, 70], ['bunk', 'Beliche', 92, 140], ['table', 'Mesa', 96, 52],
  ['chair', 'Cadeira', 40, 62], ['stool', 'Banquinho', 34, 38], ['floorlamp', 'Abajur de pé', 34, 110], ['tablelamp', 'Luminária', 28, 40], ['plant', 'Planta', 44, 70],
  ['cactus', 'Cacto', 32, 52], ['poster', 'Pôster', 54, 70, true], ['painting', 'Quadro', 70, 52, true], ['rug', 'Tapete', 150, 44, false, true], ['tv', 'TV', 90, 76],
  ['arcade', 'Fliperama', 54, 104], ['aquarium', 'Aquário', 86, 76], ['bookcase', 'Estante', 74, 120], ['shelf', 'Prateleira', 80, 34, true], ['wardrobe', 'Guarda-roupa', 84, 130],
  ['fridge', 'Geladeira', 58, 124], ['stove', 'Fogão', 64, 70], ['sink', 'Pia', 74, 70], ['counter', 'Balcão', 90, 66], ['bathtub', 'Banheira', 120, 60],
  ['toilet', 'Vaso', 44, 58], ['mirror', 'Espelho', 46, 64, true], ['clock', 'Relógio', 40, 40, true], ['window', 'Janela', 70, 70, true], ['piano', 'Piano', 100, 84],
  ['guitar', 'Violão', 34, 80], ['speaker', 'Caixa de som', 40, 70], ['discoball', 'Globo de luz', 40, 60, true], ['balloons', 'Balões', 50, 110], ['toybox', 'Baú de brinquedos', 60, 46],
  ['teddy', 'Ursinho', 40, 46], ['beanbag', 'Pufe', 58, 44], ['desk', 'Escrivaninha', 96, 66], ['computer', 'Computador', 50, 40], ['fireplace', 'Lareira', 100, 96],
  ['partytable', 'Mesa de festa', 120, 60], ['garland', 'Bandeirinhas', 140, 30, true],
];
const VNAME = ['', ' Fofo', ' Moderno'];
export const FURNITURE: FurnDef[] = [];
FK.forEach(([kind, pt, w, h, wall, flat], ki) => {
  for (let v = 0; v < 3; v++) {
    const n = FURNITURE.length;
    FURNITURE.push({
      id: kind + v,
      kind,
      v,
      w: Math.round(w * (v === 1 ? 0.92 : v === 2 ? 1.06 : 1)),
      h: Math.round(h * (v === 2 ? 1.04 : 1)),
      wall,
      flat,
      color: (ki * 5 + v * 7) % PALETTE.length,
      cost: v === 0 && ki % 3 === 0 ? { kind: 'free' } : v === 0 ? { kind: 'coins', n: 60 } : v === 1 ? (n % 4 === 1 ? { kind: 'video' } : { kind: 'coins', n: 120 }) : ki % 6 === 5 ? { kind: 'gems', n: 5 } : ki === 41 ? { kind: 'event' } : { kind: 'coins', n: 200 },
      name: () => t('home.furn.' + kind, pt) + (v ? t('home.furn.v' + v, VNAME[v]) : ''),
    });
  }
});
export const furnById = (id: string): FurnDef | undefined => FURN_MAP.get(id);
const FURN_MAP = new Map(FURNITURE.map((f) => [f.id, f]));
/** Móveis extras (Passe da Casa). Não entram na contagem de combinações. */
export function addExtraFurn(defs: FurnDef[]): void {
  for (const d of defs) if (!FURN_MAP.has(d.id)) FURN_MAP.set(d.id, d);
}
/** cor de piso/parede do passe ("base:pass:<id>") */
let passColor: (id: string) => string | undefined = () => undefined;
export function setPassColorResolver(fn: (id: string) => string | undefined): void {
  passColor = fn;
}
export function surfaceColor(spec: string): string {
  const p = spec.split(':');
  if (p[1] === 'pass') return passColor(p[2]) ?? PALETTE[0];
  return pal(Number(p[1]) || 0);
}
export const FURN_CATS: { id: string; label: () => string; kinds: FurnKind[] }[] = [
  { id: 'seat', label: L('cat.seat', 'Sentar'), kinds: ['sofa', 'armchair', 'chair', 'stool', 'beanbag', 'bed', 'bunk'] },
  { id: 'table', label: L('cat.table', 'Mesas'), kinds: ['table', 'desk', 'partytable', 'counter', 'toybox', 'bookcase', 'wardrobe'] },
  { id: 'fun', label: L('cat.fun', 'Diversão'), kinds: ['tv', 'arcade', 'aquarium', 'piano', 'guitar', 'speaker', 'computer', 'teddy', 'balloons', 'discoball'] },
  { id: 'deco', label: L('cat.deco', 'Enfeites'), kinds: ['plant', 'cactus', 'rug', 'floorlamp', 'tablelamp', 'fireplace', 'garland'] },
  { id: 'wall', label: L('cat.wall', 'Parede'), kinds: ['poster', 'painting', 'shelf', 'mirror', 'clock', 'window'] },
  { id: 'kb', label: L('cat.kb', 'Cozinha e banho'), kinds: ['fridge', 'stove', 'sink', 'bathtub', 'toilet'] },
];

/* ---------------- contagem de combinações ---------------- */
export interface ComboBreakdown {
  planet: bigint;
  exterior: bigint;
  interior: bigint;
  total: bigint;
  lines: string[];
}
function fieldCount(f: Field): number {
  return f.color ? PALETTE.length : f.options!.length;
}
export function countCombinations(): ComboBreakdown {
  const lines: string[] = [];
  let planet = 1n;
  for (const f of PLANET_FIELDS) {
    planet *= BigInt(fieldCount(f));
    lines.push(`planet.${f.key}: ${fieldCount(f)}`);
  }
  let exterior = 1n;
  for (const f of EXTERIOR_FIELDS) {
    exterior *= BigInt(fieldCount(f));
    lines.push(`exterior.${f.key}: ${fieldCount(f)}`);
  }
  // por cômodo: piso (estilo × cor) × parede (estilo × cor)
  const perRoom = BigInt(FLOORS.length * SURFACE_COLORS * WALLS.length * SURFACE_COLORS);
  let interior = 1n;
  for (const r of ROOM_IDS) {
    interior *= perRoom;
    lines.push(`room.${r}: ${FLOORS.length}x${SURFACE_COLORS} pisos × ${WALLS.length}x${SURFACE_COLORS} paredes = ${perRoom}`);
  }
  lines.push(`móveis: ${FURNITURE.length} itens × ${PALETTE.length} cores, posição livre (não contados)`);
  return { planet, exterior, interior, total: planet * exterior * interior, lines };
}
/** "1,2 × 10^47" */
export function sciBig(n: bigint): string {
  const s = n.toString();
  return `${s[0]},${s.slice(1, 3)} × 10^${s.length - 1}`;
}

/* ---------------- design ---------------- */
export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t2 = a;
    t2 = Math.imul(t2 ^ (t2 >>> 15), t2 | 1);
    t2 ^= t2 + Math.imul(t2 ^ (t2 >>> 7), t2 | 61);
    return ((t2 ^ (t2 >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function starterDesign(): HomeDesign {
  return {
    v: 1,
    planet: { shape: 0, size: 1, terrain: 0, tcol: 5, water: 1, path: 1, sky: 0, ring: 1, rcol: 2, moons: 1, clouds: 1, veg: 1, d0: 1, d1: 3, d2: 0, d3: 2, d4: 4, d5: 0 },
    exterior: { found: 0, floors: 0, wall: 0, wcol: 14, wfin: 0, roof: 0, rfcol: 0, chim: 1, door: 0, dcol: 16, win: 0, wn: 1, wfcol: 18, porch: 1, balc: 0, tower: 0, garden: 2, fence: 1, fcol: 18, sign: 1, mail: 1, lights: 0 },
    rooms: ROOM_IDS.map((id) => starterRoom(id)),
  };
}
function starterRoom(id: RoomId): RoomDesign {
  const it = (fid: string, x: number, y: number) => ({ id: fid, x, y });
  // Layout pensado para ficar bonito nos DOIS modos: (x, y) = centro e base (frente) do móvel no 2D.
  // y ≈ 262–298 = encostado na parede do fundo no 3D (src/home3d/adapter.ts itemToPlace).
  const base: Record<RoomId, RoomDesign> = {
    living: {
      id, floor: 'wood:15', wall: 'stripes:13',
      items: [it('rug1', 170, 360), it('painting0', 95, 105), it('window0', 200, 95), it('floorlamp0', 24, 262), it('sofa0', 105, 282), it('tv0', 278, 268), it('plant0', 338, 268), it('armchair1', 300, 378)],
    },
    kitchen: {
      id, floor: 'checker:18', wall: 'tile:7',
      items: [it('fridge0', 32, 276), it('stove0', 82, 274), it('sink0', 138, 272), it('counter0', 208, 274), it('clock0', 300, 80), it('plant1', 338, 268), it('table0', 258, 367), it('chair0', 201, 360), it('chair0', 315, 360)],
    },
    bedroom: {
      id, floor: 'carpet:11', wall: 'stars:9',
      items: [it('rug0', 150, 372), it('poster0', 70, 100), it('window0', 190, 90), it('bed0', 68, 298), it('desk0', 190, 274), it('wardrobe0', 316, 272), it('teddy0', 200, 362)],
    },
    bath: {
      id, floor: 'tile:7', wall: 'waves:7',
      items: [it('rug1', 60, 328), it('bathtub0', 59, 285), it('toilet0', 192, 274), it('sink1', 264, 271), it('mirror0', 264, 100), it('plant0', 338, 268)],
    },
    party: {
      id, floor: 'checker:12', wall: 'dots:3',
      items: [it('garland0', 180, 40), it('discoball0', 180, 330), it('balloons0', 29, 262), it('balloons1', 333, 262), it('speaker0', 290, 268), it('partytable0', 180, 336), it('chair2', 108, 330), it('chair2', 252, 330)],
    },
  };
  return base[id];
}

export interface OwnCheck {
  (field: string, idx: number): boolean;
}
/** Design aleatório. `own` limita às peças liberadas (Surpreenda-me do jogador). */
export function randomDesign(seed: number, own?: OwnCheck, keepRooms?: RoomDesign[]): HomeDesign {
  const r = mulberry(seed);
  const pickF = (f: Field, sect: string): number => {
    const n = fieldCount(f);
    for (let tries = 0; tries < 40; tries++) {
      const i = Math.floor(r() * n);
      if (!own || own(sect + '.' + f.key + (f.color ? '#' : ''), i)) return i;
    }
    return 0;
  };
  const planet: Record<string, number> = {};
  for (const f of PLANET_FIELDS) planet[f.key] = pickF(f, 'planet');
  const exterior: Record<string, number> = {};
  for (const f of EXTERIOR_FIELDS) exterior[f.key] = pickF(f, 'exterior');
  const rooms =
    keepRooms ??
    ROOM_IDS.map((id) => {
      const s = starterRoom(id);
      return { ...s, floor: FLOORS[Math.floor(r() * FLOORS.length)] + ':' + Math.floor(r() * 24), wall: WALLS[Math.floor(r() * WALLS.length)] + ':' + Math.floor(r() * 24) };
    });
  return { v: 1, planet, exterior, rooms };
}

export const num = (rec: Record<string, string | number>, k: string): number => Number(rec[k]) || 0;
export function fieldsFor(sect: 'planet' | 'exterior'): Field[] {
  return sect === 'planet' ? PLANET_FIELDS : EXTERIOR_FIELDS;
}
export function costOfField(f: Field, idx: number): Cost {
  return f.color ? colorCost(idx) : optionCost(f.key, idx, f.options!.length);
}
export function surface(spec: string): [string, number] {
  const [a, b] = spec.split(':');
  return [a, Number(b) || 0];
}
/** Normaliza design vindo do servidor/cache (campos faltando → padrão). */
export function normalizeDesign(d: HomeDesign | null | undefined): HomeDesign {
  const s = starterDesign();
  if (!d || d.v !== 1) return s;
  const rooms = ROOM_IDS.map((id) => {
    const rd = d.rooms?.find((x) => x.id === id);
    const base = s.rooms.find((x) => x.id === id)!;
    if (!rd) return base;
    return { id, floor: rd.floor || base.floor, wall: rd.wall || base.wall, items: (rd.items || []).filter((i) => furnById(i.id)).slice(0, 60) };
  });
  return { v: 1, planet: { ...s.planet, ...d.planet }, exterior: { ...s.exterior, ...d.exterior }, rooms };
}
