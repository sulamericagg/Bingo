/* ============================================================
 *  MONTA & LEVA — 30 fases (dados). Cada fase: grade de montagem, peças disponíveis,
 *  carga (posições na grade), pista (trechos, ver track.ts) e metas opcionais.
 *  Toda fase tem solução verificada por solutions.ts (window.__montaleva.verifyAll()).
 * ============================================================ */
import { t } from '../../i18n';
import type { PartId, Placed } from './parts';
import type { Seg } from './track';
import { GEN_LEVELS } from './levels-data';

export type CargoType = 'crate' | 'big' | 'ball' | 'glass' | 'drops' | 'bot';
export interface CargoDef {
  t: CargoType;
  x: number;
  y: number;
}

export interface LevelDef {
  n: number;
  grid: [number, number];
  parts: Partial<Record<PartId, number>>;
  budget?: number;
  cargo: CargoDef[];
  /** peças de carga necessárias (padrão: todas) */
  need?: number;
  track: Seg[];
  /** metas: tempo (s) e nº máximo de peças */
  goals: { time: number; parts: number };
  /** peças já montadas (tutorial) */
  pre?: Placed[];
  tut?: 1 | 2 | 3 | 4;
  /** peças apresentadas nesta fase (destaque "novo") */
  intro?: PartId[];
  /** motores só giram ligados por fio a um botão (controles = botões na tela) */
  wired?: boolean;
  /** pista espelhada: a saída fica à esquerda */
  mirror?: boolean;
  /** poços com água (buracos, pontes e balsas ganham água) */
  wet?: boolean;
  /** nº da fase clássica de origem (1..30), se for uma delas */
  old?: number;
}

const c = (t: CargoType, x: number, y: number): CargoDef => ({ t, x, y });
const P = (t: PartId, x: number, y: number, r = 0): Placed => ({ t, x, y, r });

/** as 30 fases originais (numeração antiga, usada pela migração do save e pelas soluções de 1ª geração) */
export const CLASSIC: LevelDef[] = [
  /* ---------------- Capítulo 1 — Primeiros passos ---------------- */
  {
    n: 1,
    tut: 1,
    grid: [8, 5],
    parts: { block: 4, wheelS: 2, motor: 1 },
    pre: [P('block', 1, 1), P('block', 2, 1), P('block', 3, 1), P('block', 4, 1), P('wheelS', 1, 1)],
    cargo: [c('crate', 3, 2)],
    track: [['f', 7], ['zone', 4]],
    goals: { time: 7, parts: 7 },
    intro: ['wheelS', 'motor'],
  },
  {
    n: 2,
    tut: 2,
    grid: [8, 5],
    parts: { block: 4, wheelS: 2, motor: 1 },
    cargo: [c('crate', 3, 2)],
    track: [['f', 5], ['r', 3, 0.5], ['f', 4], ['zone', 4]],
    goals: { time: 8, parts: 7 },
    intro: ['block'],
  },
  {
    n: 3,
    tut: 3,
    grid: [8, 5],
    parts: { beam: 3, block: 2, wheelS: 2, motor: 1 },
    cargo: [c('ball', 2, 2)],
    track: [['f', 4], ['b', 3, 0.3], ['f', 4], ['zone', 4]],
    goals: { time: 8, parts: 7 },
    intro: ['beam'],
  },
  {
    n: 4,
    grid: [10, 6],
    parts: { block: 5, tri: 2, wheelS: 2, motor: 1 },
    cargo: [c('crate', 3, 2)],
    track: [['f', 3], ['r', 4, 1.2], ['f', 2], ['r', 4, -1.2], ['f', 3], ['zone', 4]],
    goals: { time: 9, parts: 8 },
    intro: ['tri'],
  },
  {
    n: 5,
    grid: [10, 6],
    parts: { block: 5, wheelL: 2, wheelS: 2, motor: 1 },
    cargo: [c('crate', 3, 3)],
    track: [['f', 4], ['g', 1.4], ['f', 5], ['g', 1.6], ['f', 3], ['zone', 4]],
    goals: { time: 10, parts: 8 },
    intro: ['wheelL'],
  },
  {
    n: 6,
    grid: [10, 6],
    parts: { block: 4, basket: 1, wheelS: 2, motor: 1 },
    cargo: [c('ball', 4, 3)],
    track: [['f', 4], ['b', 3, 0.5], ['f', 2], ['b', 3, 0.5], ['f', 3], ['zone', 4]],
    goals: { time: 9, parts: 7 },
    intro: ['basket'],
  },
  {
    n: 7,
    grid: [10, 6],
    parts: { block: 6, tri: 2, wheelL: 2, wheelS: 2, motor: 1 },
    cargo: [c('crate', 3, 3)],
    track: [['f', 4], ['s', 0.35], ['f', 3], ['s', 0.35], ['f', 3], ['s', -0.6], ['f', 3], ['zone', 4]],
    goals: { time: 10, parts: 8 },
  },
  {
    n: 8,
    grid: [10, 6],
    parts: { block: 6, beam: 2, wheelS: 3, motor: 2 },
    cargo: [c('big', 3, 2)],
    track: [['f', 3], ['r', 6, 1.8], ['f', 4], ['zone', 4]],
    goals: { time: 8, parts: 6 },
  },
  {
    n: 9,
    grid: [10, 6],
    parts: { block: 6, wheelL: 2, wheelS: 2, motor: 1 },
    cargo: [c('crate', 3, 3)],
    track: [['f', 3], ['seesaw', 9], ['f', 3], ['zone', 4]],
    goals: { time: 9, parts: 7 },
  },
  {
    n: 10,
    grid: [10, 6],
    parts: { block: 5, spring: 2, basket: 1, wheelS: 2, motor: 1 },
    cargo: [c('ball', 4, 3)],
    track: [['f', 3], ['b', 2.5, 0.3], ['f', 0.6], ['b', 2.5, 0.3], ['f', 0.6], ['b', 2.5, 0.3], ['f', 3], ['zone', 4]],
    goals: { time: 11, parts: 7 },
    intro: ['spring'],
  },
  /* ---------------- Capítulo 2 — Terreno difícil ---------------- */
  {
    n: 11,
    grid: [10, 6],
    parts: { block: 5, spring: 2, wheelS: 2, wheelL: 2, motor: 1 },
    cargo: [c('glass', 3, 3)],
    track: [['f', 3], ['b', 3, 0.6], ['f', 2], ['b', 3, 0.6], ['f', 2], ['r', 2, -0.8], ['f', 3], ['zone', 4]],
    goals: { time: 10, parts: 9 },
  },
  {
    n: 12,
    grid: [10, 6],
    parts: { block: 5, wheelG: 2, wheelS: 2, motor: 2, tri: 2 },
    cargo: [c('crate', 3, 2)],
    track: [['f', 3], ['r', 2.2, 1.9], ['f', 3], ['r', 4, -1.9], ['f', 2], ['zone', 4]],
    goals: { time: 11, parts: 7 },
    intro: ['wheelG'],
  },
  {
    n: 13,
    grid: [10, 6],
    parts: { block: 6, beam: 2, wheelS: 2, wheelL: 2, motor: 2 },
    cargo: [c('big', 3, 2)],
    track: [['f', 3], ['bridge', 6], ['f', 3], ['zone', 4]],
    goals: { time: 7, parts: 6 },
  },
  {
    n: 14,
    grid: [10, 6],
    parts: { block: 5, wheelS: 2, motor: 1, tri: 2 },
    cargo: [c('crate', 2, 2)],
    track: [['f', 3], ['gate', 3], ['f', 3], ['gate', 3], ['f', 2], ['zone', 4]],
    goals: { time: 10, parts: 7 },
  },
  {
    n: 15,
    grid: [10, 6],
    parts: { block: 6, beam: 3, basket: 1, wheelS: 2, motor: 1 },
    cargo: [c('drops', 3, 2)],
    need: 6,
    track: [['f', 4], ['r', 3, 0.5], ['f', 3], ['r', 3, -0.5], ['f', 3], ['zone', 4]],
    goals: { time: 9, parts: 10 },
  },
  {
    n: 16,
    grid: [10, 6],
    parts: { block: 6, wheelS: 2, wheelL: 2, motor: 1 },
    cargo: [c('crate', 3, 2)],
    track: [['f', 4], ['lift', 5, 2], ['f', 3], ['zone', 4]],
    goals: { time: 11, parts: 8 },
  },
  {
    n: 17,
    grid: [10, 6],
    parts: { block: 8, weight: 2, wheelS: 2, wheelL: 2, motor: 1 },
    cargo: [c('big', 3, 3)],
    track: [['f', 3], ['r', 4, 1.5], ['f', 2], ['r', 2.5, -1.5], ['f', 2], ['r', 3, 1], ['f', 2], ['zone', 4]],
    goals: { time: 11, parts: 8 },
    intro: ['weight'],
  },
  {
    n: 18,
    grid: [10, 6],
    parts: { block: 8, beam: 3, wheelS: 3, wheelL: 2, motor: 2, spring: 2 },
    budget: 150,
    cargo: [c('crate', 4, 2), c('crate', 4, 3)],
    track: [['f', 3], ['b', 3, 0.4], ['f', 2], ['g', 1], ['f', 3], ['r', 3, 0.8], ['f', 3], ['zone', 4]],
    goals: { time: 10, parts: 10 },
  },
  {
    n: 19,
    grid: [10, 6],
    parts: { block: 6, wheelS: 2, motor: 1, tri: 2 },
    cargo: [c('crate', 3, 2)],
    track: [['f', 3], ['pend', 5], ['f', 3], ['zone', 4]],
    goals: { time: 8, parts: 7 },
  },
  {
    n: 20,
    grid: [10, 6],
    parts: { block: 6, basket: 1, spring: 2, wheelS: 2, wheelL: 2, motor: 1 },
    cargo: [c('ball', 4, 3)],
    track: [['f', 3], ['seesaw', 8], ['g', 1.2], ['f', 3], ['b', 3, 0.4], ['f', 2], ['zone', 4]],
    goals: { time: 11, parts: 8 },
  },
  /* ---------------- Capítulo 3 — Engenhocas ---------------- */
  {
    n: 21,
    grid: [12, 6],
    parts: { block: 8, hinge: 1, wheelS: 4, motor: 2, tri: 4 },
    cargo: [c('crate', 2, 2), c('crate', 8, 2)],
    track: [['f', 3], ['b', 4, 0.75], ['f', 1], ['b', 4, 0.75], ['f', 2], ['zone', 6]],
    goals: { time: 10, parts: 17 },
    intro: ['hinge'],
  },
  {
    n: 22,
    grid: [10, 6],
    parts: { block: 5, wheelS: 2, motor: 1, thruster: 2 },
    cargo: [c('crate', 3, 2)],
    track: [['f', 6], ['g', 3.4], ['f', 3], ['zone', 4]],
    goals: { time: 7, parts: 9 },
    intro: ['thruster'],
  },
  {
    n: 23,
    grid: [10, 6],
    parts: { block: 5, wheelS: 2, motor: 1, balloon: 3 },
    cargo: [c('glass', 3, 2)],
    track: [['f', 4], ['s', -3], ['f', 9], ['zone', 4]],
    goals: { time: 8, parts: 9 },
    intro: ['balloon'],
  },
  {
    n: 24,
    grid: [10, 6],
    parts: { block: 6, wheelS: 2, wheelL: 2, motor: 1, tri: 2 },
    cargo: [c('crate', 3, 3)],
    track: [['f', 3], ['gate', 3], ['seesaw', 8], ['gate', 3], ['f', 2], ['zone', 4]],
    goals: { time: 11, parts: 7 },
  },
  {
    n: 25,
    grid: [10, 6],
    parts: { block: 6, beam: 3, basket: 2, spring: 2, wheelS: 2, wheelL: 2, motor: 2 },
    cargo: [c('drops', 3, 2)],
    need: 6,
    track: [['f', 3], ['b', 2.5, 0.35], ['f', 1], ['b', 2.5, 0.35], ['f', 1], ['b', 2.5, 0.35], ['f', 3], ['zone', 4]],
    goals: { time: 9, parts: 10 },
  },
  {
    n: 26,
    grid: [10, 6],
    parts: { block: 7, beam: 2, weight: 1, wheelG: 2, wheelL: 2, motor: 2 },
    cargo: [c('big', 3, 2)],
    track: [['f', 3], ['bridge', 5], ['f', 2], ['r', 2.6, 1.8], ['f', 3], ['zone', 4]],
    goals: { time: 10, parts: 8 },
  },
  {
    n: 27,
    grid: [10, 6],
    parts: { block: 6, wheelS: 2, wheelL: 2, motor: 1, thruster: 2 },
    cargo: [c('crate', 3, 2)],
    track: [['f', 4], ['lift', 5, 1.8], ['f', 4], ['g', 3.2], ['f', 3], ['zone', 4]],
    goals: { time: 12, parts: 11 },
  },
  {
    n: 28,
    grid: [10, 6],
    parts: { block: 6, spring: 2, wheelS: 2, wheelL: 2, motor: 1, tri: 2 },
    cargo: [c('glass', 3, 2)],
    track: [['f', 3], ['b', 3, 0.45], ['pend', 5], ['b', 3, 0.45], ['f', 2], ['zone', 4]],
    goals: { time: 10, parts: 7 },
  },
  {
    n: 29,
    grid: [12, 6],
    parts: { block: 8, beam: 2, basket: 1, spring: 2, wheelS: 2, wheelL: 2, motor: 2, weight: 1 },
    cargo: [c('ball', 4, 3), c('crate', 8, 2)],
    track: [['f', 3], ['r', 4, 1.2], ['g', 1.2], ['f', 2], ['bridge', 5], ['gate', 3], ['b', 3, 0.4], ['r', 3, -1.2], ['f', 2], ['zone', 5]],
    goals: { time: 17, parts: 13 },
  },
  {
    n: 30,
    grid: [12, 6],
    parts: { block: 8, beam: 3, basket: 1, spring: 2, wheelS: 2, wheelL: 2, wheelG: 2, motor: 2, thruster: 2, balloon: 2 },
    budget: 330,
    cargo: [c('glass', 3, 2), c('ball', 7, 3)],
    track: [['f', 3], ['seesaw', 8], ['f', 2], ['lift', 5, 1.6], ['f', 3], ['g', 1.8], ['f', 2], ['pend', 5], ['r', 3, -1.6], ['f', 2], ['zone', 5]],
    goals: { time: 20, parts: 17 },
  },
];

/** composição final: 200 fases em 10 capítulos de 20 (dados gerados em levels-data.ts; número = fase clássica) */
export const LEVELS: LevelDef[] = GEN_LEVELS.map((e, i) =>
  typeof e === 'number' ? { ...CLASSIC[e - 1], n: i + 1, old: e } : ({ ...e, n: i + 1 } as LevelDef),
);

export const CHAPTER_SIZE = 20;
export const CHAPTERS = Math.ceil(LEVELS.length / CHAPTER_SIZE);

export function chapterOf(n: number): number {
  return Math.floor((n - 1) / CHAPTER_SIZE);
}
export function chapterName(i: number): string {
  return (
    [
      t('ml.ch1', 'Primeiros passos'),
      t('ml.ch2', 'Terreno difícil'),
      t('ml.chW', 'Botões e fios'),
      t('ml.ch3', 'Engenhocas'),
      t('ml.chUp', 'Sobe e desce'),
      t('ml.chCeil', 'Teto baixo'),
      t('ml.chWater', 'Água à vista'),
      t('ml.chRev', 'De marcha à ré'),
      t('ml.chGlass', 'Frágil!'),
      t('ml.chMaster', 'Mestre construtor'),
    ][i] ?? ''
  );
}
/** cor de fundo (tinta suave) de cada capítulo */
export const CHAPTER_TINT = ['#f6f7f9', '#f7f6f2', '#f3f6fa', '#f8f4f1', '#f2f7f4', '#f5f3f8', '#eef6f9', '#f8f5ef', '#f3f7f8', '#f7f3f4'];
/** cor de destaque de cada capítulo (cartões da seleção) */
export const CHAPTER_ACCENT = ['#f59a32', '#c98a3a', '#ef4444', '#8b5cf6', '#22b07d', '#64748b', '#0ea5e9', '#f97316', '#38bdf8', '#e11d48'];
