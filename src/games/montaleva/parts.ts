/* ============================================================
 *  MONTA & LEVA — catálogo de peças (dados puros, sem DOM).
 *  Grade: célula U = 0,5 m. Peça colocada = { t, x, y, r } com (x,y) = célula âncora
 *  (canto inferior esquerdo da pegada já girada). r = 0..3 (passos de 90°, anti-horário).
 * ============================================================ */
import { t } from '../../i18n';

export const U = 0.5; // metros por célula

export type PartId =
  | 'block'
  | 'beam'
  | 'tri'
  | 'motor'
  | 'spring'
  | 'hinge'
  | 'weight'
  | 'basket'
  | 'wheelS'
  | 'wheelL'
  | 'wheelG'
  | 'thruster'
  | 'balloon';

/** struct = ocupa células; mount = vai EM CIMA de uma célula estrutural (roda, propulsor, balão) */
export type Layer = 'struct' | 'mount';

export interface PartDef {
  id: PartId;
  layer: Layer;
  /** quantas rotações distintas (1, 2 ou 4) */
  rots: 1 | 2 | 4;
  cost: number;
  density: number;
  friction: number;
  color: string;
  dark: string;
  /** raio (rodas) */
  radius?: number;
  /** ordem no inventário */
  order: number;
}

export const PARTS: Record<PartId, PartDef> = {
  block: { id: 'block', layer: 'struct', rots: 1, cost: 10, density: 2, friction: 0.6, color: '#5b8def', dark: '#2f5bb8', order: 0 },
  beam: { id: 'beam', layer: 'struct', rots: 2, cost: 20, density: 2.4, friction: 0.6, color: '#8a6cf0', dark: '#5a3fc0', order: 1 },
  tri: { id: 'tri', layer: 'struct', rots: 4, cost: 8, density: 2, friction: 0.6, color: '#f2a541', dark: '#c47a17', order: 2 },
  wheelS: { id: 'wheelS', layer: 'mount', rots: 1, cost: 15, density: 1.2, friction: 1.0, color: '#2d3340', dark: '#151a22', radius: 0.36, order: 3 },
  wheelL: { id: 'wheelL', layer: 'mount', rots: 1, cost: 25, density: 0.8, friction: 1.0, color: '#2d3340', dark: '#151a22', radius: 0.65, order: 4 },
  motor: { id: 'motor', layer: 'struct', rots: 1, cost: 30, density: 4, friction: 0.6, color: '#ef5d60', dark: '#b8333a', order: 5 },
  spring: { id: 'spring', layer: 'struct', rots: 1, cost: 15, density: 1.6, friction: 0.6, color: '#3cc9a4', dark: '#1f8f72', order: 6 },
  hinge: { id: 'hinge', layer: 'struct', rots: 1, cost: 12, density: 3, friction: 0.6, color: '#9aa3b2', dark: '#5f6878', order: 7 },
  weight: { id: 'weight', layer: 'struct', rots: 1, cost: 12, density: 12, friction: 0.7, color: '#3e4756', dark: '#1f2530', order: 8 },
  basket: { id: 'basket', layer: 'struct', rots: 1, cost: 25, density: 2, friction: 0.8, color: '#f7c548', dark: '#c49414', order: 9 },
  wheelG: { id: 'wheelG', layer: 'mount', rots: 1, cost: 30, density: 1.2, friction: 2.6, color: '#3a3f2d', dark: '#1c2014', radius: 0.45, order: 10 },
  thruster: { id: 'thruster', layer: 'mount', rots: 4, cost: 40, density: 2, friction: 0.5, color: '#ff7a59', dark: '#c94a2b', order: 11 },
  balloon: { id: 'balloon', layer: 'mount', rots: 1, cost: 30, density: 0, friction: 0, color: '#ff6fa8', dark: '#cc3f78', order: 12 },
};

export const PART_IDS = (Object.keys(PARTS) as PartId[]).sort((a, b) => PARTS[a].order - PARTS[b].order);

export function partName(id: PartId): string {
  switch (id) {
    case 'block':
      return t('ml.p.block', 'Bloco');
    case 'beam':
      return t('ml.p.beam', 'Viga');
    case 'tri':
      return t('ml.p.tri', 'Triângulo');
    case 'wheelS':
      return t('ml.p.wheelS', 'Roda pequena');
    case 'wheelL':
      return t('ml.p.wheelL', 'Roda grande');
    case 'wheelG':
      return t('ml.p.wheelG', 'Roda de tração');
    case 'motor':
      return t('ml.p.motor', 'Motor');
    case 'spring':
      return t('ml.p.spring', 'Suspensão');
    case 'hinge':
      return t('ml.p.hinge', 'Dobradiça');
    case 'weight':
      return t('ml.p.weight', 'Peso');
    case 'basket':
      return t('ml.p.basket', 'Caçamba');
    case 'thruster':
      return t('ml.p.thruster', 'Propulsor');
    case 'balloon':
      return t('ml.p.balloon', 'Balão');
  }
}

export function partDesc(id: PartId): string {
  switch (id) {
    case 'block':
      return t('ml.d.block', 'Estrutura básica. Gruda nos vizinhos.');
    case 'beam':
      return t('ml.d.beam', 'Longa e leve. Gire para ficar em pé.');
    case 'tri':
      return t('ml.d.tri', 'Rampa e bico. Só gruda pelos lados retos.');
    case 'wheelS':
      return t('ml.d.wheelS', 'Coloque sobre uma peça. Gira livre ou com motor.');
    case 'wheelL':
      return t('ml.d.wheelL', 'Passa por cima de buracos e degraus.');
    case 'wheelG':
      return t('ml.d.wheelG', 'Borracha que agarra: sobe rampas íngremes.');
    case 'motor':
      return t('ml.d.motor', 'Gira as rodas a até 2 casas de distância.');
    case 'spring':
      return t('ml.d.spring', 'Roda montada aqui ganha amortecedor.');
    case 'hinge':
      return t('ml.d.hinge', 'Tudo que encosta nela gira em volta dela.');
    case 'weight':
      return t('ml.d.weight', 'Pesado: baixa o centro de gravidade.');
    case 'basket':
      return t('ml.d.basket', 'Bordas que seguram a carga.');
    case 'thruster':
      return t('ml.d.thruster', 'Empurra quando você aperta o jato. Combustível limitado.');
    case 'balloon':
      return t('ml.d.balloon', 'Puxa para cima o tempo todo.');
  }
}

export interface Placed {
  t: PartId;
  x: number;
  y: number;
  r: number;
}

/** células ocupadas (camada struct) ou a célula de montagem (mount), relativas à âncora */
export function footprint(t: PartId, r: number): [number, number][] {
  if (t === 'beam') return r % 2 === 0 ? [[0, 0], [1, 0], [2, 0]] : [[0, 0], [0, 1], [0, 2]];
  if (t === 'basket') return [[0, 0], [1, 0], [2, 0]];
  return [[0, 0]];
}

export function cellsOf(p: Placed): [number, number][] {
  return footprint(p.t, p.r).map(([dx, dy]) => [p.x + dx, p.y + dy]);
}

/** lados retos (completos) de uma peça estrutural numa célula: 0=dir 1=cima 2=esq 3=baixo */
export function fullSide(p: Placed, side: number): boolean {
  if (p.t !== 'tri') return true;
  // r=0: ângulo reto embaixo-esquerda → lados cheios: esquerda(2) e baixo(3)
  const a = (2 + p.r) % 4;
  const b = (3 + p.r) % 4;
  return side === a || side === b;
}

/** vértices do triângulo (em unidades de célula, origem no canto inf. esq. da célula) */
export function triVerts(r: number): [number, number][] {
  const base: [number, number][][] = [
    [[0, 0], [1, 0], [0, 1]],
    [[1, 0], [1, 1], [0, 0]],
    [[1, 1], [0, 1], [1, 0]],
    [[0, 1], [0, 0], [1, 1]],
  ];
  return base[r & 3];
}

export const MOTOR_REACH = 2;
export const THRUST_FUEL = 3.5; // segundos por propulsor
