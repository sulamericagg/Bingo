/* ============================================================
 *  POUSO FORÇADO — dados: planta do avião (coordenadas locais),
 *  pontos de emergência, papéis da tripulação, pinturas e cabines.
 *  Coordenadas do avião: x = direita(+)/esquerda(-), z = para trás
 *  (nariz em -z), y = para cima, piso em y = 0. Unidades: metros.
 * ============================================================ */
import { t } from '../../i18n';

export const HALF_W = 1.75;
export const NOSE_Z = -4.0;
export const TAIL_Z = 21.0;
export const CEIL = 2.3;
export const P_RAD = 0.26;
export const REACH = 1.6;

/** caixas sólidas no piso (x0, x1, z0, z1) */
export type Box = [number, number, number, number];
const mirror = (b: Box): Box => [-b[1], -b[0], b[2], b[3]];
const LEFT: Box[] = [
  // parede da cabine de comando (porta no meio)
  [-1.75, -0.45, -1.3, -1.1],
  // assentos dos pilotos e painel
  [-0.85, -0.25, -3.2, -2.6],
  [-1.75, 1.75, -4.0, -3.55],
  // primeira classe
  [-1.75, -0.6, -0.3, 0.6],
  [-1.75, -0.6, 1.5, 2.4],
  // galley
  [-1.75, -1.15, 3.9, 5.9],
  // econômica (saída de emergência entre 10.1 e 11.1)
  [-1.75, -0.5, 6.25, 9.75],
  [-1.75, -0.5, 11.05, 14.55],
  // parede do porão
  [-1.75, -0.5, 16.5, 16.7],
  // prateleiras do porão
  [-1.75, -1.2, 17.2, 18.7],
];
export const BOXES: Box[] = [];
for (const b of LEFT) {
  BOXES.push(b);
  if (b[0] === -1.75 && b[1] === 1.75) continue;
  BOXES.push(mirror(b));
}
BOXES.push([-0.2, 0.2, -3.5, -2.6]); // console central
BOXES.push([-1.75, -0.9, 18.9, 20.7], [1.42, 1.75, 19.55, 20.05], [0.72, 1.75, 20.38, 21]); // tanque, bomba, malas

export const ZONES: { id: string; z0: number; z1: number; name: () => string }[] = [
  { id: 'cockpit', z0: -4, z1: -1.2, name: () => t('voo.z.cockpit', 'Cabine de comando') },
  { id: 'first', z0: -1.2, z1: 3.8, name: () => t('voo.z.first', 'Primeira classe') },
  { id: 'galley', z0: 3.8, z1: 6.1, name: () => t('voo.z.galley', 'Copa') },
  { id: 'eco', z0: 6.1, z1: 16.5, name: () => t('voo.z.eco', 'Classe econômica') },
  { id: 'cargo', z0: 16.5, z1: 21, name: () => t('voo.z.cargo', 'Porão de carga') },
];
export function zoneName(z: number): string {
  for (const zn of ZONES) if (z < zn.z1) return zn.name();
  return ZONES[ZONES.length - 1].name();
}

export type SpotId =
  | 'pilot' | 'copilot' | 'elec' | 'doorF' | 'doorR' | 'oven' | 'water' | 'snack' | 'engL' | 'engR'
  | 'cabinA' | 'cabinB' | 'valve' | 'cargoFire' | 'leak' | 'pump' | 'gear' | 'win' | 'maskSw' | 'vent';
export interface Spot {
  x: number;
  z: number;
  /** altura do ponto (para marcador/3D) */
  y: number;
}
export const SPOTS: Record<Exclude<SpotId, 'win'>, Spot> = {
  pilot: { x: -0.55, z: -2.9, y: 0.9 },
  copilot: { x: 0.55, z: -2.9, y: 0.9 },
  elec: { x: 1.7, z: -0.72, y: 1.3 },
  doorF: { x: -1.72, z: -0.72, y: 1.1 },
  doorR: { x: -1.72, z: 15.6, y: 1.1 },
  oven: { x: 1.5, z: 5.25, y: 1.5 },
  water: { x: -1.55, z: 4.35, y: 1.0 },
  snack: { x: -1.55, z: 5.35, y: 0.95 },
  engL: { x: -1.68, z: 10.6, y: 1.0 },
  engR: { x: 1.68, z: 10.6, y: 1.0 },
  cabinA: { x: -0.7, z: 8.0, y: 0.7 },
  cabinB: { x: 0.7, z: 12.8, y: 0.7 },
  valve: { x: 1.68, z: 15.6, y: 1.2 },
  cargoFire: { x: 1.35, z: 18.0, y: 0.6 },
  leak: { x: -1.65, z: 19.8, y: 0.7 },
  pump: { x: 1.62, z: 19.8, y: 1.0 },
  gear: { x: 0, z: 20.4, y: 0.25 },
  /** botão amarelo das máscaras de oxigênio (painel dos comissários, parede direita antes da copa) */
  maskSw: { x: 1.7, z: 3.2, y: 1.35 },
  /** chave "ventilar" no painel de cima da cabine de comando (o piloto também tem no HUD) */
  vent: { x: 0.45, z: -2.45, y: 1.9 },
};
/** janelas da econômica (pássaros) */
export const WIN_Z = [6.6, 7.5, 8.4, 9.3, 11.4, 12.3, 13.2, 14.1];

/** fileiras de passageiros: [x, z] de cada assento */
export const SEATS: [number, number][] = [];
for (const z of [0.15, 1.95]) for (const x of [-1.15, 1.15]) SEATS.push([x, z]);
for (const z of WIN_Z) for (const x of [-1.3, -0.82, 0.82, 1.3]) SEATS.push([x, z]);

export type ItemKind = 'ext' | 'tape' | 'water' | 'snack' | 'bag' | 'tray';
export const ITEM_HOMES: { kind: ItemKind; x: number; z: number; y: number }[] = [
  { kind: 'ext', x: 1.5, z: 4.25, y: 0.9 },
  { kind: 'ext', x: -1.48, z: 18.3, y: 0.95 },
  { kind: 'tape', x: -1.48, z: 17.55, y: 0.95 },
  { kind: 'tape', x: 1.45, z: 5.85, y: 1.0 },
];
export function itemName(k: ItemKind): string {
  switch (k) {
    case 'ext':
      return t('voo.i.ext', 'Extintor');
    case 'tape':
      return t('voo.i.tape', 'Fita adesiva');
    case 'water':
      return t('voo.i.water', 'Água');
    case 'snack':
      return t('voo.i.snack', 'Lanchinho');
    case 'tray':
      return t('voo.i.tray', 'Bandeja');
    default:
      return t('voo.i.bag', 'Mala');
  }
}

export type EmerKind = 'fire' | 'leak' | 'spark' | 'pressure' | 'door' | 'turb' | 'panic' | 'bird' | 'gear' | 'smoke';
export function emerName(k: EmerKind): string {
  switch (k) {
    case 'fire':
      return t('voo.e.fire', 'Fogo!');
    case 'leak':
      return t('voo.e.leak', 'Vazamento de combustível!');
    case 'spark':
      return t('voo.e.spark', 'Pane elétrica!');
    case 'pressure':
      return t('voo.e.pressure', 'Cabine despressurizando!');
    case 'door':
      return t('voo.e.door', 'Alarme da porta!');
    case 'turb':
      return t('voo.e.turb', 'Turbulência forte!');
    case 'panic':
      return t('voo.e.panic', 'Passageiros em pânico!');
    case 'bird':
      return t('voo.e.bird', 'Pássaro trincou a janela!');
    case 'smoke':
      return t('voo.e.smoke', 'Fumaça na cabine!');
    default:
      return t('voo.e.gear', 'Trem de pouso travado!');
  }
}
export function emerHow(k: EmerKind, stage = 0): string {
  switch (k) {
    case 'fire':
      return t('voo.h.fire', 'Pegue um extintor e segure USAR perto do fogo');
    case 'leak':
      return stage === 0 ? t('voo.h.leak', 'Leve fita adesiva ao tanque no porão') : t('voo.h.refuel', 'Bombeie combustível na bomba do porão');
    case 'spark':
      return t('voo.h.spark', 'Religue os fios no painel elétrico');
    case 'pressure':
      return t('voo.h.pressure', 'Gire a válvula de pressão no fundo');
    case 'door':
      return t('voo.h.door', 'Segure a alavanca da porta!');
    case 'turb':
      return t('voo.h.turb', 'Piloto: mantenha as asas niveladas');
    case 'panic':
      return t('voo.h.panic', 'Acalme com um abraço, água ou lanchinho');
    case 'bird':
      return t('voo.h.bird', 'Tape a janela com fita adesiva');
    case 'smoke':
      return stage === 0 ? t('voo.h.smoke', 'Solte as máscaras, ande abaixado e apague o forno com o extintor') : t('voo.h.smokeVent', 'Tire a fumaça: chave VENTILAR na cabine de comando ou abra uma porta');
    default:
      return t('voo.h.gear', 'Gire a manivela do trem no porão');
  }
}

/* ------------------------------ tripulação ------------------------------ */

export type Role = 0 | 1 | 2 | 3;
export const ROLE_COUNT = 4;
export function roleName(r: number): string {
  switch (r) {
    case 0:
      return t('voo.r.pilot', 'Piloto');
    case 1:
      return t('voo.r.copilot', 'Copiloto');
    case 2:
      return t('voo.r.fa1', 'Comissário(a) 1');
    default:
      return t('voo.r.fa2', 'Comissário(a) 2');
  }
}
/** cores de cada chapéu: [copa, aba/faixa, detalhe] */
export const HAT_COLS: [string, string, string][] = [
  ['#2b2f6b', '#ffd34a', '#ffffff'], // piloto: quepe azul-noite, asinhas douradas
  ['#ffffff', '#2fb6ff', '#2b2f6b'], // copiloto: quepe branco, faixa celeste
  ['#ff5c8a', '#ffe1ec', '#ffd34a'], // comissária 1: boina rosa + lenço
  ['#18b89a', '#e4fff7', '#ff8a3a'], // comissário 2: chapeuzinho verde-água + lenço
];
export const BOT_NAMES = ['Pipoca', 'Tufo', 'Biscoito', 'Lumi', 'Fofa', 'Gominho', 'Zuzu', 'Nino'];
export const BOT_SKINS = ['mint', 'sunny', 'ocean', 'kitty', 'bee', 'astro', 'dj', 'chef'];

/* ------------------------------ cosméticos ------------------------------ */

export interface Livery {
  id: string;
  name: () => string;
  stars: number;
  body: string;
  belly: string;
  stripe: string;
  tail: string;
}
export const LIVERIES: Livery[] = [
  { id: 'classic', name: () => t('voo.l.classic', 'Bloop Air'), stars: 0, body: '#ffffff', belly: '#dfe6f5', stripe: '#ff5cae', tail: '#8a5cff' },
  { id: 'sunset', name: () => t('voo.l.sunset', 'Pôr do Sol'), stars: 3, body: '#fff3e6', belly: '#ffd2a8', stripe: '#ff7a3a', tail: '#ff3d6e' },
  { id: 'mint', name: () => t('voo.l.mint', 'Hortelã'), stars: 6, body: '#effff7', belly: '#c8f5e0', stripe: '#19c28a', tail: '#0f8a7a' },
  { id: 'night', name: () => t('voo.l.night', 'Coruja Noturna'), stars: 10, body: '#2b2f6b', belly: '#1c1f4a', stripe: '#ffd34a', tail: '#6a7aff' },
  { id: 'rainbow', name: () => t('voo.l.rainbow', 'Arco-íris'), stars: 15, body: '#ffffff', belly: '#e9e2ff', stripe: '#ffb02e', tail: '#2fb6ff' },
  { id: 'gold', name: () => t('voo.l.gold', 'Asa Dourada'), stars: 24, body: '#fff6d6', belly: '#f2d77a', stripe: '#d99a00', tail: '#b36b00' },
];
export interface Cabin {
  id: string;
  name: () => string;
  perfect: number;
  seat: string;
  seat2: string;
  carpet: string;
}
export const CABINS: Cabin[] = [
  { id: 'classic', name: () => t('voo.c.classic', 'Clássica'), perfect: 0, seat: '#4a6cff', seat2: '#ff5cae', carpet: '#5b4a8a' },
  { id: 'lilac', name: () => t('voo.c.lilac', 'Lavanda'), perfect: 1, seat: '#a78bff', seat2: '#ffd34a', carpet: '#4a3a6e' },
  { id: 'forest', name: () => t('voo.c.forest', 'Floresta'), perfect: 3, seat: '#2fa56a', seat2: '#ffb02e', carpet: '#3d5a3a' },
  { id: 'candy', name: () => t('voo.c.candy', 'Docinho'), perfect: 6, seat: '#ff7ab8', seat2: '#7ad8ff', carpet: '#7a4a6a' },
];

/** cidades fictícias para o dossiê */
export const CITIES = ['Bolhópolis', 'Porto Gelatina', 'Vila Pudim', 'Nuvemburgo', 'São Brigadeiro', 'Cerro Pipoca', 'Lago Marshmallow', 'Ilha Tutti'];
export function weatherName(i: number): string {
  switch (i) {
    case 0:
      return t('voo.w.clear', 'Céu limpo, ventinho de lado');
    case 1:
      return t('voo.w.clouds', 'Nuvens fofas e turbulência');
    default:
      return t('voo.w.wind', 'Vento cruzado forte');
  }
}
