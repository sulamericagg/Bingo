/* ============================================================
 *  DESENHA E VIRA! — 20 desafios feitos à mão (palco 16 × 9 m, visto de lado).
 *  Caixas estáticas: [x0, y0, x1, y1]. Polígonos: rampas/morros fixos.
 *  Tinta em metros de traço. Estrelas: 1 = passou, +1 tinta ≤ par, +1 tempo ≤ time.
 * ============================================================ */
import { t } from '../../i18n';
import type { Material } from './strokes';

export type LevelKind = 'bridge' | 'cup' | 'ramp' | 'float' | 'tower' | 'car' | 'slide';
export type Box = [number, number, number, number];

export interface Level {
  id: string;
  kind: LevelKind;
  name: () => string;
  goal: () => string;
  tip?: () => string;
  boxes: Box[];
  polys?: [number, number][][];
  ball?: { x: number; y: number; r: number; vx?: number };
  marbles?: { at: [number, number][]; n: number; r: number; need: number; color: string };
  zone?: Box;
  water?: { x0: number; x1: number; top: number };
  weights?: { x: number; y: number; s: number; m: number }[];
  height?: number;
  ink: number;
  par: number;
  time: number;
  allowed?: Material[];
  /** baldinho de chegada (só visual + paredes) */
  basket?: { x: number; y: number; w: number; h: number };
}

const G: Box = [-2, -1, 18, 1];

export const LEVELS: Level[] = [
  {
    id: 'l1', kind: 'bridge', name: () => t('dv.l1', 'Primeira ponte'), goal: () => t('dv.g.bridge', 'Faça uma ponte para a bola chegar à bandeira'),
    tip: () => t('dv.tip.l1', 'Desenhe um traço de um lado ao outro do buraco e aperte BUM!'),
    boxes: [[-2, -1, 6, 3.2], [9, -1, 18, 3.2]], ball: { x: 1.2, y: 3.8, r: 0.5, vx: 4.5 }, zone: [12.5, 3.2, 16.5, 7], ink: 14, par: 6, time: 20,
  },
  {
    id: 'l2', kind: 'cup', name: () => t('dv.l2', 'Pegue as bolinhas'), goal: () => t('dv.g.cup', 'Desenhe um pote para pegar {n} bolinhas', { n: 4 }),
    tip: () => t('dv.tip.l2', 'Um traço em forma de U vira uma cesta de arame!'),
    boxes: [G], marbles: { at: [[8, 8.6]], n: 6, r: 0.2, need: 4, color: '#ff6fc8' }, ink: 14, par: 7, time: 20,
  },
  {
    id: 'l3', kind: 'ramp', name: () => t('dv.l3', 'Rampa radical'), goal: () => t('dv.g.ramp', 'Faça uma rampa para a bola subir até a bandeira'),
    boxes: [G, [10, -1, 18, 2.1]], polys: [[[-2, 1], [-2, 4.8], [1.2, 4.8], [4.8, 1]]], ball: { x: 0.2, y: 5.2, r: 0.38, vx: 1 }, zone: [12, 2.1, 16.5, 7], ink: 16, par: 8, time: 20,
  },
  {
    id: 'l4', kind: 'float', name: () => t('dv.l4', 'Barquinho'), goal: () => t('dv.g.float', 'Desenhe algo que boie e segure a caixa por 3 s'),
    tip: () => t('dv.tip.l4', 'Balão é levinho e boia fácil!'),
    boxes: [[-2, -1, 4, 3], [12, -1, 18, 3], [4, -1, 12, 0.4]], water: { x0: 4, x1: 12, top: 2.4 }, weights: [{ x: 8, y: 5.2, s: 0.6, m: 150 }], ink: 16, par: 8, time: 25,
  },
  {
    id: 'l5', kind: 'tower', name: () => t('dv.l5', 'Torre de papel'), goal: () => t('dv.g.tower', 'Alcance a linha pontilhada e fique parado'),
    boxes: [G], height: 4.2, ink: 22, par: 12, time: 25,
  },
  {
    id: 'l6', kind: 'car', name: () => t('dv.l6', 'Meu primeiro carro'), goal: () => t('dv.g.car', 'Desenhe um carro e dirija até a bandeira'),
    tip: () => t('dv.tip.l6', 'Rodas de outra cor viram rodas de verdade! Use os pedais.'),
    boxes: [G], zone: [13.5, 1, 16.5, 6], ink: 22, par: 12, time: 25,
  },
  {
    id: 'l7', kind: 'bridge', name: () => t('dv.l7', 'Ponte comprida'), goal: () => t('dv.g.bridge', 'Faça uma ponte para a bola chegar à bandeira'),
    boxes: [[-2, -1, 5, 3.2], [10.2, -1, 18, 3.2]], ball: { x: 1, y: 3.8, r: 0.5, vx: 4.8 }, zone: [12.5, 3.2, 16.5, 7], ink: 15, par: 7.5, time: 20,
  },
  {
    id: 'l8', kind: 'cup', name: () => t('dv.l8', 'Chuva de gotas'), goal: () => t('dv.g.cup', 'Desenhe um pote para pegar {n} bolinhas', { n: 9 }),
    boxes: [G], marbles: { at: [[6.5, 8.6]], n: 12, r: 0.14, need: 9, color: '#3d9cf0' }, ink: 14, par: 7, time: 22,
  },
  {
    id: 'l9', kind: 'car', name: () => t('dv.l9', 'Morro acima'), goal: () => t('dv.g.car', 'Desenhe um carro e dirija até a bandeira'),
    boxes: [G], polys: [[[5.5, 1], [8.5, 2.7], [11.5, 1]]], zone: [13.5, 1, 16.5, 6], ink: 22, par: 12, time: 25,
  },
  {
    id: 'l10', kind: 'float', name: () => t('dv.l10', 'Carga pesada'), goal: () => t('dv.g.float', 'Desenhe algo que boie e segure a caixa por 3 s'),
    boxes: [[-2, -1, 3.5, 3], [12.5, -1, 18, 3], [3.5, -1, 12.5, 0.4]], water: { x0: 3.5, x1: 12.5, top: 2.4 }, weights: [{ x: 8, y: 5.2, s: 0.8, m: 400 }], ink: 18, par: 10, time: 25,
  },
  {
    id: 'l11', kind: 'slide', name: () => t('dv.l11', 'Escorregador'), goal: () => t('dv.g.slide', 'Leve a bola até a cesta'),
    tip: () => t('dv.tip.pin', 'Toque um pontinho em cima do desenho para pregá-lo na parede!'),
    boxes: [G, [14.8, -1, 18, 5.5]], ball: { x: 2, y: 7.8, r: 0.34 }, basket: { x: 13.2, y: 1, w: 3.2, h: 1.5 }, zone: [11.7, 1, 14.7, 2.4], ink: 14, par: 8, time: 20,
  },
  {
    id: 'l12', kind: 'tower', name: () => t('dv.l12', 'Torre alta'), goal: () => t('dv.g.tower', 'Alcance a linha pontilhada e fique parado'),
    boxes: [G], height: 5.6, ink: 26, par: 15, time: 30,
  },
  {
    id: 'l13', kind: 'bridge', name: () => t('dv.l13', 'Ponte dupla'), goal: () => t('dv.g.bridge', 'Faça uma ponte para a bola chegar à bandeira'),
    boxes: [[-2, -1, 4.5, 3.2], [7.2, -1, 9, 3.2], [11.7, -1, 18, 3.2]], ball: { x: 0.8, y: 3.8, r: 0.5, vx: 5 }, zone: [13.5, 3.2, 16.5, 7], ink: 16, par: 8, time: 22,
  },
  {
    id: 'l14', kind: 'car', name: () => t('dv.l14', 'Buraco na estrada'), goal: () => t('dv.g.car', 'Desenhe um carro e dirija até a bandeira'),
    boxes: [[-2, -1, 7, 1.5], [8.6, -1, 18, 1.5]], zone: [13, 1.5, 16.5, 6], ink: 26, par: 14, time: 25,
  },
  {
    id: 'l15', kind: 'cup', name: () => t('dv.l15', 'Duas torneiras'), goal: () => t('dv.g.cup', 'Desenhe um pote para pegar {n} bolinhas', { n: 8 }),
    boxes: [G], marbles: { at: [[4.5, 8.6], [11.5, 8.6]], n: 10, r: 0.18, need: 8, color: '#ffb02e' }, ink: 18, par: 10, time: 25,
  },
  {
    id: 'l16', kind: 'float', name: () => t('dv.l16', 'Navio de carga'), goal: () => t('dv.g.float2', 'Desenhe algo que boie e segure as caixas por 3 s'),
    boxes: [[-2, -1, 3, 3], [13, -1, 18, 3], [3, -1, 13, 0.4]], water: { x0: 3, x1: 13, top: 2.4 }, weights: [{ x: 7.6, y: 5.2, s: 0.7, m: 200 }, { x: 8.4, y: 6.0, s: 0.7, m: 200 }], ink: 20, par: 11, time: 28,
  },
  {
    id: 'l17', kind: 'slide', name: () => t('dv.l17', 'Zigue-zague'), goal: () => t('dv.g.slide', 'Leve a bola até a cesta'),
    tip: () => t('dv.tip.pin', 'Toque um pontinho em cima do desenho para pregá-lo na parede!'),
    boxes: [G, [6.5, 3.5, 9.5, 4.1], [-2, -1, 0.6, 5.5]], ball: { x: 13.5, y: 7.8, r: 0.32 }, basket: { x: 2.2, y: 1, w: 3.2, h: 1.5 }, zone: [0.7, 1, 3.7, 2.4], ink: 16, par: 9, time: 25,
  },
  {
    id: 'l18', kind: 'tower', name: () => t('dv.l18', 'Arranha-céu'), goal: () => t('dv.g.tower', 'Alcance a linha pontilhada e fique parado'),
    boxes: [G], height: 6.8, ink: 30, par: 18, time: 35,
  },
  {
    id: 'l19', kind: 'car', name: () => t('dv.l19', 'Escadaria'), goal: () => t('dv.g.car', 'Desenhe um carro e dirija até a bandeira'),
    boxes: [G, [7, -1, 18, 1.45], [10.5, -1, 18, 1.9]], zone: [13.5, 1.9, 16.5, 6], ink: 26, par: 14, time: 30,
  },
  {
    id: 'l20', kind: 'bridge', name: () => t('dv.l20', 'Grande final'), goal: () => t('dv.g.bridge', 'Faça uma ponte para a bola chegar à bandeira'),
    boxes: [[-2, -1, 5, 4], [10.2, -1, 18, 4]], polys: [[[-2, 4], [-2, 5.4], [0.4, 5.4], [3, 4]]], ball: { x: -0.8, y: 5.95, r: 0.5, vx: 2.5 }, zone: [13, 4, 16.5, 8], ink: 16, par: 8, time: 25,
  },
];

export const levelIcon = (k: LevelKind): string => ({ bridge: 'tube', cup: 'lathe', ramp: 'extrude', float: 'inflate', tower: 'up', car: 'car', slide: 'play' })[k];
