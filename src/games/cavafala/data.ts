/* ============================================================
 *  CAVA & FALA — dados: materiais do solo e temas das vilas.
 * ============================================================ */
import { t } from '../../i18n';

export const enum M {
  Air = 0,
  Grama = 1,
  Terra = 2,
  Argila = 3,
  Areia = 4,
  Pedra = 5,
  Cristal = 6,
  Ouro = 7,
  /** rocha-mãe: indestrutível, não entra no inventário */
  Base = 8,
}
/** materiais coletáveis, na ordem do HUD */
export const MATS = [M.Grama, M.Terra, M.Argila, M.Areia, M.Pedra, M.Cristal, M.Ouro] as const;
export type Mat = (typeof MATS)[number];
export type Inv = Record<number, number>;

export const MAT_KEY: Record<number, string> = { 1: 'grama', 2: 'terra', 3: 'argila', 4: 'areia', 5: 'pedra', 6: 'cristal', 7: 'ouro' };
export const HARD: number[] = [0, 1, 1, 1.35, 0.85, 1.9, 2.3, 2.1, 1e9];
/** cor base (padrão) de cada material */
export const MAT_COL: string[] = ['#000', '#6cc24a', '#9a6a3f', '#c8714a', '#f0d48a', '#8d8f99', '#7ff0ff', '#ffcc33', '#4b3f52'];

export function matName(m: number, theme?: Theme): string {
  if (m === M.Grama && theme?.snow) return t('cavafala.mat.neve', 'neve');
  switch (m) {
    case M.Grama:
      return t('cavafala.mat.grama', 'grama');
    case M.Terra:
      return t('cavafala.mat.terra', 'terra');
    case M.Argila:
      return t('cavafala.mat.argila', 'argila');
    case M.Areia:
      return t('cavafala.mat.areia', 'areia');
    case M.Pedra:
      return t('cavafala.mat.pedra', 'pedra');
    case M.Cristal:
      return t('cavafala.mat.cristal', 'cristal');
    case M.Ouro:
      return t('cavafala.mat.ouro', 'ouro');
  }
  return '';
}

export const emptyInv = (): Inv => ({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 });

export type ThemeId = 'pesca' | 'neve' | 'deserto' | 'caverna';
export interface Theme {
  id: ThemeId;
  name: () => string;
  desc: () => string;
  seed: number;
  /** cores dos materiais (substitui MAT_COL) */
  mat: Partial<Record<number, string>>;
  sky: [string, string];
  night: [string, string];
  fog: string;
  sun: string;
  /** paredes / telhados / detalhes das casas */
  walls: string[];
  roofs: string[];
  trim: string;
  snow?: boolean;
  /** vila dentro de caverna (teto de pedra, cristais que brilham) */
  cave?: boolean;
  /** nível do mar (água ao redor) */
  sea?: boolean;
  tree: 'round' | 'pine' | 'palm' | 'mushroom';
  /** espessura extra de terra sobre a vila (m) */
  cover: number;
  /** cor do minimapa / cartão */
  card: [string, string];
}

export const THEMES: Theme[] = [
  {
    id: 'pesca',
    name: () => t('cavafala.town.pesca', 'Vila de Pescadores'),
    desc: () => t('cavafala.town.pescaD', 'Casinhas coloridas, píer e um farol escondidos sob a duna.'),
    seed: 1301,
    mat: { 1: '#7fd35a', 4: '#f3dc96' },
    sky: ['#7fd0ff', '#dff6ff'],
    night: ['#1b1f5a', '#5a3f8a'],
    fog: '#cfefff',
    sun: '#fff3d6',
    walls: ['#ffffff', '#8fd3ff', '#ffd7e8', '#fff1a8', '#b6f0c8'],
    roofs: ['#3a7bd5', '#e8504a', '#2fb39a', '#ff9a3a'],
    trim: '#2a4c8a',
    sea: true,
    tree: 'palm',
    cover: 3.2,
    card: ['#5ec8ff', '#2a6fd5'],
  },
  {
    id: 'neve',
    name: () => t('cavafala.town.neve', 'Vila da Neve'),
    desc: () => t('cavafala.town.neveD', 'Chalés de telhado branco e uma torre de relógio debaixo da neve.'),
    seed: 2207,
    mat: { 1: '#f4f9ff', 2: '#8d6a55', 4: '#e6e0d0', 5: '#7d8aa0' },
    sky: ['#a9d4ff', '#f2f8ff'],
    night: ['#151a40', '#3b3f7a'],
    fog: '#e8f2ff',
    sun: '#ffffff',
    walls: ['#c85a3a', '#7a4a2e', '#3a6a8a', '#e8d6b0'],
    roofs: ['#ffffff', '#e8f0ff'],
    trim: '#fff6e0',
    snow: true,
    tree: 'pine',
    cover: 3.6,
    card: ['#bfe3ff', '#5a7ad8'],
  },
  {
    id: 'deserto',
    name: () => t('cavafala.town.deserto', 'Cidade do Deserto'),
    desc: () => t('cavafala.town.desertoD', 'Cúpulas, palmeiras e um oásis enterrados na areia.'),
    seed: 3119,
    mat: { 1: '#f1d27a', 2: '#d9a35a', 3: '#c8653a', 4: '#ffe2a0' },
    sky: ['#ffc77a', '#fff0c8'],
    night: ['#2a1650', '#8a3f6a'],
    fog: '#ffe8c0',
    sun: '#fff0c0',
    walls: ['#f6deb0', '#f0c890', '#ffe6c8', '#e8b07a'],
    roofs: ['#3ab0a0', '#e86a4a', '#5a8aff', '#ffd040'],
    trim: '#8a4a2a',
    tree: 'palm',
    cover: 3.4,
    card: ['#ffc46a', '#e0663a'],
  },
  {
    id: 'caverna',
    name: () => t('cavafala.town.caverna', 'Vila Flutuante das Cavernas'),
    desc: () => t('cavafala.town.cavernaD', 'Casas-cogumelo em ilhas de pedra, cristais que brilham no escuro.'),
    seed: 4421,
    mat: { 1: '#5ad6a0', 2: '#6a5a7a', 3: '#8a5a8a', 5: '#5a5f78', 6: '#9af6ff' },
    sky: ['#2a2f5a', '#5a4f8a'],
    night: ['#100c2a', '#2a1f4a'],
    fog: '#3a3560',
    sun: '#c8b8ff',
    walls: ['#fff0f6', '#e8f8ff', '#fff6d8'],
    roofs: ['#ff5a8a', '#a05aff', '#3ad0a0', '#ffb03a'],
    trim: '#3a2a5a',
    cave: true,
    tree: 'mushroom',
    cover: 3,
    card: ['#7a5aff', '#2a1a6a'],
  },
];

export const themeById = (id: string): Theme => THEMES.find((x) => x.id === id) ?? THEMES[0];
export const matColor = (m: number, th?: Theme): string => th?.mat[m] ?? MAT_COL[m];
