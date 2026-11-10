/* ============================================================
 *  ADAPTADOR 2D ↔ 3D
 *  Converte RoomDesign/MessItem (sala lógica 360×420 do 2D) em posições 3D
 *  (metros) e de volta. Também identifica o "tipo" de cada móvel pelo id
 *  (catálogo: kind + variante, ex. "sofa1") com fallback por palavra-chave.
 *
 *  Sistema de coordenadas (alinhado com src/home/catalog.ts):
 *   - sala 2D: x 0..360 (esquerda→direita), y 0..420 (topo→baixo).
 *     A parede do fundo ocupa y < FLOOR_Y0; o chão vai de FLOOR_Y0 (fundo) a 420 (frente).
 *   - itens de chão: (x, y) = base do móvel → 3D (x/PX, z) com z = profundidade a partir da parede do fundo.
 *   - itens de parede (poster, quadro, janela...): ficam na parede do fundo, altura vem de y.
 *   - cada cômodo 3D tem largura ROOM_W, profundidade ROOM_D, pé-direito WALL_H (metros).
 * ============================================================ */
import type { HomeDesign, HomeRole, MessItem, RoomDesign } from '../home/api';
import type { MessItem3D, RoomItem3D } from './types';

export const PX = 60; // px lógicos por metro
export const ROOM_W = 360 / PX; // 6 m
export const ROOM_D = 4.8;
export const WALL_H = 2.7;
export const WALL_T = 0.12;
/** linha da parede do fundo no 2D (render-room.ts WALL_Y) */
export const FLOOR_Y0 = 230;
export const ROOM_IDS = ['living', 'kitchen', 'bedroom', 'bath', 'party'] as const;

/** Paleta curada — espelho de PALETTE em src/home/catalog.ts (mesma ordem). */
export const PALETTE = [
  '#ff5c7a', '#ff8a3d', '#ffc93d', '#fff27a', '#b6f25a', '#4fd67a', '#2fb39a', '#46d9e6',
  '#3fa0ff', '#5866f0', '#8a5cff', '#c46bff', '#ff7ad9', '#ffb3c7', '#f5e6c8', '#c89a6a',
  '#8a5a3c', '#5b3a29', '#ffffff', '#d5d0e8', '#8f88a8', '#4a4466', '#262238', '#ffe0a3',
] as const;
export function palColor(v: string | number | undefined, fallback = '#f5e6c8'): string {
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v === 'string' && v.startsWith('#')) return v;
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return PALETTE[((Math.round(n) % PALETTE.length) + PALETTE.length) % PALETTE.length];
}

/* ---------------- tipos de móvel ---------------- */
export type Kind =
  | 'sofa' | 'armchair' | 'bed' | 'bunk' | 'table' | 'chair' | 'stool' | 'floorlamp' | 'tablelamp' | 'plant' | 'cactus' | 'poster'
  | 'painting' | 'rug' | 'tv' | 'arcade' | 'aquarium' | 'bookcase' | 'shelf' | 'wardrobe' | 'fridge' | 'stove' | 'sink' | 'counter'
  | 'bathtub' | 'toilet' | 'mirror' | 'clock' | 'window' | 'piano' | 'guitar' | 'speaker' | 'discoball' | 'balloons' | 'toybox'
  | 'teddy' | 'beanbag' | 'desk' | 'computer' | 'fireplace' | 'partytable' | 'garland' | 'box';

/** Mesma ordem do catálogo 2D (FK) — usada para a cor padrão (ki*5 + v*7) % 24. */
export const KIND_ORDER: Kind[] = [
  'sofa', 'armchair', 'bed', 'bunk', 'table', 'chair', 'stool', 'floorlamp', 'tablelamp', 'plant', 'cactus', 'poster', 'painting', 'rug', 'tv',
  'arcade', 'aquarium', 'bookcase', 'shelf', 'wardrobe', 'fridge', 'stove', 'sink', 'counter', 'bathtub', 'toilet', 'mirror', 'clock', 'window', 'piano',
  'guitar', 'speaker', 'discoball', 'balloons', 'toybox', 'teddy', 'beanbag', 'desk', 'computer', 'fireplace', 'partytable', 'garland',
];

export interface KindInfo {
  /** largura × profundidade × altura (m) */
  w: number;
  d: number;
  h: number;
  /** pendurado na parede do fundo */
  wall?: boolean;
  /** tapete (achatado) */
  flat?: boolean;
  /** leve: dá pra pegar e jogar */
  light?: boolean;
  /** quebra em pedacinhos (QUEBRAR) */
  fragile?: boolean;
  /** pendurado no teto */
  ceil?: boolean;
  name: string;
}
const K = (w: number, d: number, h: number, name: string, f: Partial<KindInfo> = {}): KindInfo => ({ w, d, h, name, ...f });
export const KINDS: Record<Kind, KindInfo> = {
  sofa: K(1.9, 0.85, 0.85, 'Sofá'),
  armchair: K(0.9, 0.85, 0.85, 'Poltrona', { light: true }),
  bed: K(1.3, 2.0, 0.6, 'Cama'),
  bunk: K(1.1, 2.0, 1.75, 'Beliche'),
  table: K(1.4, 0.8, 0.72, 'Mesa'),
  chair: K(0.45, 0.45, 0.9, 'Cadeira', { light: true }),
  stool: K(0.38, 0.38, 0.5, 'Banquinho', { light: true }),
  floorlamp: K(0.4, 0.4, 1.6, 'Abajur de pé', { light: true, fragile: true }),
  tablelamp: K(0.3, 0.3, 0.45, 'Luminária', { light: true, fragile: true }),
  plant: K(0.5, 0.5, 1.0, 'Planta', { light: true, fragile: true }),
  cactus: K(0.35, 0.35, 0.65, 'Cacto', { light: true, fragile: true }),
  poster: K(0.8, 0.03, 1.0, 'Pôster', { wall: true }),
  painting: K(1.0, 0.05, 0.75, 'Quadro', { wall: true }),
  rug: K(2.2, 1.4, 0.02, 'Tapete', { flat: true }),
  tv: K(1.3, 0.45, 1.1, 'TV', { fragile: true }),
  arcade: K(0.75, 0.7, 1.7, 'Fliperama'),
  aquarium: K(1.2, 0.5, 1.15, 'Aquário'),
  bookcase: K(1.0, 0.4, 1.8, 'Estante'),
  shelf: K(1.1, 0.28, 0.35, 'Prateleira', { wall: true }),
  wardrobe: K(1.2, 0.6, 2.0, 'Guarda-roupa'),
  fridge: K(0.8, 0.7, 1.85, 'Geladeira'),
  stove: K(0.85, 0.65, 0.9, 'Fogão'),
  sink: K(1.0, 0.6, 0.9, 'Pia'),
  counter: K(1.3, 0.65, 0.9, 'Balcão'),
  bathtub: K(1.7, 0.8, 0.6, 'Banheira'),
  toilet: K(0.45, 0.65, 0.75, 'Vaso'),
  mirror: K(0.65, 0.04, 0.9, 'Espelho', { wall: true, fragile: true }),
  clock: K(0.55, 0.06, 0.55, 'Relógio', { wall: true }),
  window: K(1.0, 0.08, 1.0, 'Janela', { wall: true }),
  piano: K(1.5, 0.6, 1.25, 'Piano'),
  guitar: K(0.4, 0.15, 1.0, 'Violão', { light: true }),
  speaker: K(0.5, 0.45, 1.0, 'Caixa de som', { light: true }),
  discoball: K(0.5, 0.5, 0.5, 'Globo de luz', { ceil: true, fragile: true }),
  balloons: K(0.7, 0.7, 1.7, 'Balões', { light: true, fragile: true }),
  toybox: K(0.9, 0.55, 0.6, 'Baú de brinquedos', { light: true }),
  teddy: K(0.45, 0.4, 0.55, 'Ursinho', { light: true }),
  beanbag: K(0.85, 0.85, 0.6, 'Pufe', { light: true }),
  desk: K(1.3, 0.65, 0.76, 'Escrivaninha'),
  computer: K(0.6, 0.35, 0.5, 'Computador', { light: true, fragile: true }),
  fireplace: K(1.4, 0.45, 1.25, 'Lareira'),
  partytable: K(1.8, 0.9, 0.75, 'Mesa de festa'),
  garland: K(2.2, 0.05, 0.4, 'Bandeirinhas', { wall: true }),
  box: K(0.6, 0.6, 0.6, 'Caixa', { light: true }),
};

const KEYWORDS: [RegExp, Kind][] = [
  [/sofa|couch/, 'sofa'], [/armchair|poltrona/, 'armchair'], [/bunk|beliche/, 'bunk'], [/bed|cama/, 'bed'], [/partytable|party/, 'partytable'],
  [/desk|escriv/, 'desk'], [/table|mesa/, 'table'], [/chair|cadeira/, 'chair'], [/stool|banq/, 'stool'], [/floorlamp/, 'floorlamp'],
  [/lamp|abajur|lumin/, 'tablelamp'], [/cact/, 'cactus'], [/plant|flor|tree/, 'plant'], [/poster/, 'poster'], [/paint|quadro|frame/, 'painting'],
  [/rug|carpet|tapete/, 'rug'], [/tv|telev/, 'tv'], [/arcade|flip/, 'arcade'], [/aqua|fish/, 'aquarium'], [/bookcase|estante/, 'bookcase'],
  [/shelf|prateleira/, 'shelf'], [/wardrobe|closet|guarda/, 'wardrobe'], [/fridge|gelad/, 'fridge'], [/stove|oven|fog/, 'stove'], [/sink|pia/, 'sink'],
  [/counter|balc/, 'counter'], [/bath|tub|banh/, 'bathtub'], [/toilet|vaso/, 'toilet'], [/mirror|espelho/, 'mirror'], [/clock|rel/, 'clock'],
  [/window|janela/, 'window'], [/piano/, 'piano'], [/guitar|viol/, 'guitar'], [/speaker|som/, 'speaker'], [/disco|globo/, 'discoball'],
  [/balloon|bal/, 'balloons'], [/toy|ba[uú]/, 'toybox'], [/teddy|urso|plush/, 'teddy'], [/bean|pufe|pouf/, 'beanbag'], [/computer|pc|laptop/, 'computer'],
  [/fire|lareira/, 'fireplace'], [/garland|bandeir/, 'garland'],
];

/** "sofa1" → { kind: 'sofa', v: 1 }. Ids desconhecidos caem por palavra-chave ou 'box'. */
export function kindOf(id: string): { kind: Kind; v: number } {
  const m = /^([a-z]+)(\d*)$/i.exec(id);
  if (m && (m[1] as Kind) in KINDS) return { kind: m[1] as Kind, v: Math.min(2, Number(m[2]) || 0) };
  const low = id.toLowerCase();
  for (const [re, k] of KEYWORDS) if (re.test(low)) return { kind: k, v: (Number(/\d+/.exec(low)?.[0]) || 0) % 3 };
  return { kind: 'box', v: 0 };
}
export function defaultColorIdx(kind: Kind, v: number): number {
  const ki = Math.max(0, KIND_ORDER.indexOf(kind));
  return (ki * 5 + v * 7) % PALETTE.length;
}
export function itemColor(it: { id: string; color?: string }): string {
  const { kind, v } = kindOf(it.id);
  return palColor(it.color, PALETTE[defaultColorIdx(kind, v)]);
}
/** dimensões 3D com variante (v1 um pouco menor, v2 um pouco maior — igual ao 2D) */
export function dimsOf(kind: Kind, v: number): { w: number; d: number; h: number } {
  const k = KINDS[kind];
  const s = v === 1 ? 0.92 : v === 2 ? 1.06 : 1;
  return { w: k.w * s, d: k.d * s, h: k.h * (v === 2 ? 1.04 : 1) };
}

/* ---------------- posições ----------------
 * MAPEAMENTO 2D → 3D (igual ao que o jogador vê no 2D, src/home/room.ts):
 *  - o 2D desenha cada móvel de FRENTE com a base em (x, y): x = centro, y = borda da FRENTE no chão.
 *    O arrasto do 2D limita a base de chão a y ∈ [FY0, FY1] (WALL_Y+20 .. RH-2).
 *  - 3D: a faixa [FY0, FY1] cobre o piso interno inteiro (parede do fundo → parede da frente).
 *    y = FY0 → móvel encostado na parede do fundo; a FRENTE do móvel fica em zFront(y) e o centro
 *    em zFront - profundidade/2 (antes o centro ia direto em y, então tudo "flutuava" no meio do
 *    cômodo e camas/sofás com giro atravessavam paredes, já que o limite usava a largura sem giro).
 *  - giro: r3 (quartos de volta). Camas e beliches são desenhados DE LADO no 2D (cabeceira à
 *    esquerda), então no 3D ganham +1/4 de volta de base; o flip do 2D vira r3 = 2 só nesses.
 *  - a 20 cm de uma parede ou menos → encosta (o 2D não tem paredes laterais visíveis).
 */
export interface Place3D {
  /** coordenadas LOCAIS do cômodo (m): x 0..ROOM_W, z 0..ROOM_D (0 = parede do fundo), y = altura da base */
  x: number;
  y: number;
  z: number;
  /** giro em torno de Y (rad) */
  yaw: number;
}
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
/** faixa do chão no 2D (base dos móveis) */
export const FY0 = 250;
export const FY1 = 418;
/** piso interno (entre as paredes) */
export const IN_X0 = WALL_T;
export const IN_X1 = ROOM_W - WALL_T;
export const IN_Z0 = WALL_T;
export const IN_Z1 = ROOM_D - WALL_T;
/** folga entre móvel e parede */
export const GAP = 0.015;
/** distância até a parede abaixo da qual o móvel encosta */
export const WALL_SNAP = 0.2;
/** móveis desenhados de lado no 2D: base de 1/4 de volta no 3D */
const SIDE_KINDS: Partial<Record<Kind, 1>> = { bed: 1, bunk: 1 };
export const isSideKind = (k: Kind): boolean => !!SIDE_KINDS[k];
/** quartos de volta efetivos do item (0..3) */
export function quarterOf(it: { id: string; r3?: number; flip?: boolean }): number {
  const { kind } = kindOf(it.id);
  const r3 = it.r3 ?? (it.flip && isSideKind(kind) ? 2 : 0);
  return (((r3 + (SIDE_KINDS[kind] ?? 0)) % 4) + 4) % 4;
}
/** meia-largura (x) e meia-profundidade (z) da pegada no cômodo para um giro */
export function halfExt(kind: Kind, v: number, q: number): { hx: number; hz: number } {
  const dm = dimsOf(kind, v);
  return q % 2 ? { hx: dm.d / 2, hz: dm.w / 2 } : { hx: dm.w / 2, hz: dm.d / 2 };
}
/** prende o centro dentro do piso e encosta nas paredes próximas */
export function fitInRoom(x: number, z: number, hx: number, hz: number, snap = WALL_SNAP): { x: number; z: number } {
  const x0 = IN_X0 + hx + GAP,
    x1 = IN_X1 - hx - GAP,
    z0 = IN_Z0 + hz + GAP,
    z1 = IN_Z1 - hz - GAP;
  x = x0 > x1 ? ROOM_W / 2 : clamp(x, x0, x1);
  z = z0 > z1 ? ROOM_D / 2 : clamp(z, z0, z1);
  if (snap > 0) {
    if (x - x0 < snap) x = x0;
    else if (x1 - x < snap) x = x1;
    if (z - z0 < snap) z = z0;
    else if (z1 - z < snap) z = z1;
  }
  return { x, z };
}
/** y da base no 2D → z da frente do móvel no 3D */
export const yToFrontZ = (y: number): number => IN_Z0 + clamp((y - FY0) / (FY1 - FY0), 0, 1) * (IN_Z1 - IN_Z0);
export const frontZToY = (z: number): number => FY0 + clamp((z - IN_Z0) / (IN_Z1 - IN_Z0), 0, 1) * (FY1 - FY0);

export function itemToPlace(it: RoomItem3D): Place3D {
  const { kind, v } = kindOf(it.id);
  const k = KINDS[kind];
  const dm = dimsOf(kind, v);
  if (k.wall) {
    const x = clamp(it.x / PX, IN_X0 + dm.w / 2 + GAP, IN_X1 - dm.w / 2 - GAP);
    const h = clamp(WALL_H * (1 - it.y / FLOOR_Y0), 0.6 + dm.h / 2, WALL_H - dm.h / 2 - 0.05) - dm.h / 2;
    return { x, y: h, z: WALL_T + dm.d / 2 + 0.006, yaw: 0 };
  }
  if (k.ceil) {
    const x = clamp(it.x / PX, 0.8, ROOM_W - 0.8);
    const z = it.y > FY0 ? clamp(yToFrontZ(it.y), 0.8, ROOM_D - 0.8) : ROOM_D / 2;
    return { x, y: WALL_H - dm.h - 0.25, z, yaw: 0 };
  }
  const q = quarterOf(it);
  const { hx, hz } = halfExt(kind, v, q);
  const p = fitInRoom(it.x / PX, yToFrontZ(it.y) - hz, hx, hz);
  return { x: p.x, y: 0, z: p.z, yaw: (q * Math.PI) / 2 };
}
/** centro local (m) de um item → (x, y) do 2D (inverso de itemToPlace) */
export function placeItemXY(it: { id: string; r3?: number; flip?: boolean }, p: { x: number; y: number; z: number }): { x: number; y: number } {
  const { kind, v } = kindOf(it.id);
  const k = KINDS[kind];
  const x = Math.round(clamp(p.x, 0, ROOM_W) * PX);
  if (k.wall) return { x, y: Math.round(clamp(FLOOR_Y0 * (1 - (p.y + dimsOf(kind, v).h / 2) / WALL_H), 10, FLOOR_Y0 - 10)) };
  if (k.ceil) return { x, y: Math.round(frontZToY(p.z)) };
  const { hz } = halfExt(kind, v, quarterOf(it));
  return { x, y: Math.round(frontZToY(p.z + hz)) };
}
/** grava giro no item mantendo o flip do 2D coerente */
export function setQuarter(it: RoomItem3D, r3: number): void {
  it.r3 = ((r3 % 4) + 4) % 4;
  if (isSideKind(kindOf(it.id).kind)) it.flip = it.r3 === 2;
}
/** ponto local 3D → (x, y) do 2D (sujeira, móvel derrubado) — mesmo mapeamento do chão dos móveis */
export function placeToXY(kind: Kind, p: { x: number; y: number; z: number }): { x: number; y: number } {
  const k = KINDS[kind];
  const x = Math.round(clamp(p.x, 0, ROOM_W) * PX);
  if (k.wall) return { x, y: Math.round(clamp(FLOOR_Y0 * (1 - (p.y + KINDS[kind].h / 2) / WALL_H), 10, FLOOR_Y0 - 10)) };
  return localToFloorXY(p.x, p.z);
}
export function floorXYToLocal(x: number, y: number): { x: number; z: number } {
  return { x: clamp(x / PX, 0.1, ROOM_W - 0.1), z: clamp(yToFrontZ(y), 0.1, ROOM_D - 0.1) };
}
export function localToFloorXY(x: number, z: number): { x: number; y: number } {
  return { x: Math.round(clamp(x, 0, ROOM_W) * PX), y: Math.round(frontZToY(z)) };
}
/** altura na parede do fundo → y do 2D (y < FLOOR_Y0) */
export function wallHToY(h: number): number {
  return Math.round(clamp(FLOOR_Y0 * (1 - h / WALL_H), 4, FLOOR_Y0 - 4));
}

/* ---------------- sujeira ---------------- */
export type MessKind = MessItem['kind'];
export const MESS_COLORS: Record<MessKind, string[]> = {
  cake: ['#ffe0a3', '#ff7ad9', '#8a5a3c'],
  frosting: ['#ffb3c7', '#ffffff', '#ff7ad9'],
  juice: ['#ff8a3d', '#ffc93d'],
  crumbs: ['#c89a6a', '#8a5a3c'],
  confetti: ['#ff5c7a', '#3fa0ff', '#ffc93d', '#4fd67a', '#c46bff'],
  tomato: ['#ff5c4a', '#d8322e'],
  pie: ['#ffe0a3', '#c46bff', '#8a5cff'],
  'balloon-pop': ['#ff5c7a', '#3fa0ff', '#ffc93d'],
  mud: ['#8a5a3c', '#5b3a29'],
};
/** sujeira "de aspirar" (migalhas) em vez de esfregar */
export const isVacuum = (k: MessKind) => k === 'crumbs' || k === 'confetti' || k === 'balloon-pop';
export function isDirt(m: MessItem): boolean {
  return !m.moved && m.r > 0;
}
let uid = 0;
export function newMessId(): string {
  return 'm3' + Date.now().toString(36) + (uid++).toString(36) + Math.floor(Math.random() * 1e4).toString(36);
}

/* ---------------- móveis: identidade estável ---------------- */
/** chave da instância: cômodo + índice no array de itens */
export const itemKey = (room: string, idx: number) => room + '#' + idx;

/** Copia profunda (o 3D nunca muta o objeto recebido até devolver no onChange). */
export function cloneDesign(d: HomeDesign): HomeDesign {
  return JSON.parse(JSON.stringify(d)) as HomeDesign;
}
export function cloneMess(m: MessItem[]): MessItem3D[] {
  return JSON.parse(JSON.stringify(m)) as MessItem3D[];
}
export function ensureRooms(d: HomeDesign): HomeDesign {
  const have = new Set(d.rooms.map((r) => r.id));
  for (const id of ROOM_IDS) if (!have.has(id)) d.rooms.push({ id, floor: 'wood:15', wall: 'paint:14', items: [] } as RoomDesign);
  return d;
}

/* ---------------- permissões ---------------- */
export type Tool = 'clean' | 'decorate' | 'paint' | 'build';
const RANK: Record<HomeRole, number> = { view: 0, clean: 1, decorate: 2, build: 3 };
export function roleFor(d: HomeDesign, editable: boolean, viewerId?: string): HomeRole {
  if (editable) return 'build';
  const a = d.access;
  if (!a) return 'clean';
  return (viewerId && a.roles?.[viewerId]) || a.defaultRole || 'clean';
}
export function canUse(role: HomeRole, tool: Tool): boolean {
  const need: HomeRole = tool === 'clean' ? 'clean' : tool === 'build' ? 'build' : 'decorate';
  return RANK[role] >= RANK[need];
}

/* ---------------- superfícies ---------------- */
/** "wood:3" → ['wood', '#cor'] */
export function surface(spec: string | undefined, fallback: string): [string, string] {
  const [a, b] = (spec || fallback).split(':');
  return [a || fallback.split(':')[0], palColor(b ?? 14)];
}
export const FLOOR_STYLES = ['wood', 'tile', 'carpet', 'checker', 'stone', 'grass', 'stars', 'hex', 'stripes', 'dots', 'marble', 'candy'] as const;
export const WALL_STYLES = ['paint', 'stripes', 'dots', 'brick', 'wood', 'stars', 'hearts', 'waves', 'tile', 'check', 'clouds', 'space'] as const;

/* ---------------- pintura (HomeDesign.paint) — MESMO formato do 2D (src/home/paint.ts) ----------------
 * paint[roomId] = { wall, strokes?, w3? }
 *   wall:    tinta "de base" já completa ('<corIdx>:<acabamento>' ou 'pass:<id>'), pintada por cima do papel de parede
 *   strokes: camada em andamento "<spec>;<hex>" — grade 36×23 (células de 10 u) da parede do fundo do 2D
 *   w3:      (opcional, só 3D) "<spec>|<base64>" cobertura das 4 paredes (grade PAINT_GW×PAINT_GH cada, ordem n,e,s,w)
 * Completa (>= 90% no 3D, 97% no 2D) → { wall: spec } e a camada some.
 */
export const PAINT_GW = 48;
export const PAINT_GH = 16;
export const FINISHES = ['solid', 'gradient', 'stripes', 'stars', 'glitter'] as const;
export type Finish = (typeof FINISHES)[number];
/** grade do 2D (Painter(0,0,360,WALL_Y-8), célula 10) */
const P2_COLS = 36;
const P2_ROWS = Math.ceil((FLOOR_Y0 - 8) / 10);
export function parsePaintSpec(spec: string | undefined): { col: string; finish: Finish } | null {
  if (!spec) return null;
  if (spec.startsWith('pass:')) return { col: '#ffd84a', finish: 'glitter' };
  const [a, b] = spec.split(':');
  const f = (FINISHES as readonly string[]).includes(b) ? (b as Finish) : 'solid';
  return { col: palColor(Number(a) || 0), finish: f };
}
/** bits → base64 */
export function bitsToB64(cells: Uint8Array): string {
  const bytes = new Uint8Array(Math.ceil(cells.length / 8));
  for (let i = 0; i < cells.length; i++) if (cells[i]) bytes[i >> 3] |= 1 << (i & 7);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
export function b64ToBits(b64: string, n: number): Uint8Array {
  const out = new Uint8Array(n);
  try {
    const s = atob(b64);
    for (let i = 0; i < n; i++) out[i] = (s.charCodeAt(i >> 3) >> (i & 7)) & 1;
  } catch {
    /* */
  }
  return out;
}
/** célula do 3D (parede do fundo) ↔ ponto 2D */
function cell3To2D(gx: number, gy: number): [number, number] {
  const x = ((gx + 0.5) / PAINT_GW) * 360;
  const h = ((gy + 0.5) / PAINT_GH) * WALL_H;
  return [x, FLOOR_Y0 * (1 - h / WALL_H)];
}
/** lê strokes do 2D ("spec;hex") para a parede do fundo (wi = 0) da cobertura 3D */
export function decodeStrokes(strokes: string | undefined, w3: string | undefined, cover: Uint8Array): string | null {
  cover.fill(0);
  if (!strokes) return null;
  const [spec, hex] = strokes.split(';');
  if (w3 && w3.startsWith(spec + '|')) {
    cover.set(b64ToBits(w3.slice(spec.length + 1), cover.length));
    return spec;
  }
  if (!hex) return spec;
  const per = Math.ceil(P2_COLS / 4);
  for (let gy = 0; gy < PAINT_GH; gy++)
    for (let gx = 0; gx < PAINT_GW; gx++) {
      const [x, y] = cell3To2D(gx, gy);
      const cx = Math.floor(x / 10),
        cy = Math.floor(y / 10);
      if (cy < 0 || cy >= P2_ROWS) continue;
      const n = parseInt(hex[cy * per + (cx >> 2)] || '0', 16);
      if (n & (1 << (cx & 3))) cover[gy * PAINT_GW + gx] = 1;
    }
  return spec;
}
/** cobertura 3D → strokes do 2D (só a parede do fundo cabe no 2D) */
export function encodeStrokes(spec: string, cover: Uint8Array): string {
  let s = '';
  for (let cy = 0; cy < P2_ROWS; cy++)
    for (let k = 0; k < P2_COLS; k += 4) {
      let n = 0;
      for (let b = 0; b < 4; b++) {
        const cx = k + b;
        if (cx >= P2_COLS) continue;
        const x = cx * 10 + 5,
          y = cy * 10 + 5;
        const gx = Math.min(PAINT_GW - 1, Math.floor((x / 360) * PAINT_GW));
        const gy = Math.min(PAINT_GH - 1, Math.max(0, Math.floor((1 - y / FLOOR_Y0) * PAINT_GH)));
        if (cover[gy * PAINT_GW + gx]) n |= 1 << b;
      }
      s += n.toString(16);
    }
  return spec + ';' + s;
}
