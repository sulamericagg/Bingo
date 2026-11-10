/* ============================================================
 *  MUNDO ABERTO — biomas (temperatura × umidade × "magia") e espécies.
 *  Cada bioma: árvores, chão, rochas, neblina, céu, partículas e clima.
 * ============================================================ */
import { t } from '../../../i18n';
import { SPECIES, type Species } from '../data';

export type WShape = Species['shape'] | 'snowpine' | 'acacia' | 'cactus' | 'willow' | 'bamboo';
export interface WSpecies extends Omit<Species, 'shape'> {
  shape: WShape;
  /** bioma "de casa" (livro de coleção) */
  home: number;
}

const S = (i: number, home: number): WSpecies => ({ ...SPECIES[i], home });
/** espécies do mundo aberto (0..5 são as do bosque clássico) */
export const WSPECIES: WSpecies[] = [
  S(0, 0),
  S(1, 1),
  S(2, 2),
  S(3, 3),
  S(4, 4),
  S(5, 5),
  { name: () => t('floresta.ws.neve', 'Pinheiro-Nevado'), hp: 16, logs: 3, value: 8, h: 9, trunk: '#7a5034', trunkDark: '#523420', leaf: '#3f8a76', leaf2: '#2a6a5a', shape: 'snowpine', home: 1 },
  { name: () => t('floresta.ws.bordo', 'Bordo-Brasa'), hp: 12, logs: 2, value: 7, h: 7.5, trunk: '#6e4a36', trunkDark: '#4a2e20', leaf: '#ff8a2e', leaf2: '#e2482e', shape: 'round', home: 9 },
  { name: () => t('floresta.ws.acacia', 'Acácia-Sombrinha'), hp: 18, logs: 2, value: 9, h: 7, trunk: '#8a6a44', trunkDark: '#5e4428', leaf: '#9ac24a', leaf2: '#6e9a34', shape: 'acacia', home: 6 },
  { name: () => t('floresta.ws.cacto', 'Cacto-Candelabro'), hp: 10, logs: 1, value: 11, h: 4.5, trunk: '#4aa85a', trunkDark: '#2e7a40', leaf: '#ff7ab0', leaf2: '#ffd34a', shape: 'cactus', home: 8 },
  { name: () => t('floresta.ws.salgueiro', 'Salgueiro-Chorão'), hp: 22, logs: 3, value: 10, h: 8, trunk: '#6a5a40', trunkDark: '#463a28', leaf: '#8acb6a', leaf2: '#5a9a4a', shape: 'willow', home: 7 },
  { name: () => t('floresta.ws.bambu', 'Bambu-Gigante'), hp: 8, logs: 2, value: 6, h: 10, trunk: '#9ad05a', trunkDark: '#6aa03a', leaf: '#7ad06a', leaf2: '#4aa04a', shape: 'bamboo', home: 11 },
  { name: () => t('floresta.ws.betula', 'Bétula-Dourada'), hp: 10, logs: 2, value: 7, h: 8.5, trunk: '#f2eee2', trunkDark: '#3a3430', leaf: '#ffd34a', leaf2: '#f0a82e', shape: 'round', home: 9 },
];

export type Particle = 'leaf' | 'snow' | 'petal' | 'spore' | 'sparkle' | 'firefly' | 'dust' | 'pollen';
export interface WBiome {
  id: string;
  name: () => string;
  /** centro no espaço de clima (0..1) */
  T: number;
  H: number;
  M: number;
  grass: string;
  grass2: string;
  dirt: string;
  rock: string;
  sky: [string, string, string];
  fog: string;
  /** multiplica a distância da neblina */
  fogK: number;
  /** espécies [índice WSPECIES, peso] */
  sp: [number, number][];
  /** chance de árvore por célula de 4 m */
  dens: number;
  bush: string;
  flower: string;
  part: Particle;
  partCol: string;
  /** intensidade da música (clima do bioma) */
  mood: number;
  /** água com cor própria */
  water: string;
  /** minério típico (índice ORES) */
  ore: number;
}

export const WBIOMES: WBiome[] = [
  { id: 'bosque', name: () => t('floresta.wb.bosque', 'Bosque'), T: 0.5, H: 0.55, M: 0, grass: '#6cc24a', grass2: '#58a83e', dirt: '#8a6440', rock: '#9a96a0', sky: ['#6ab8f0', '#bfe8ff', '#eaffd9'], fog: '#cfeaf2', fogK: 1, sp: [[0, 6], [7, 1]], dens: 0.34, bush: '#4fa83e', flower: '#ffd34a', part: 'leaf', partCol: '#7ad04a', mood: 0.2, water: '#3ab0e0', ore: 0 },
  { id: 'nevado', name: () => t('floresta.wb.nevado', 'Pinheiral Nevado'), T: 0.08, H: 0.5, M: 0, grass: '#eef4fb', grass2: '#d6e2f0', dirt: '#7a6a5a', rock: '#8a92a6', sky: ['#8ab0e0', '#dce8f8', '#f6f9ff'], fog: '#e8eff8', fogK: 0.75, sp: [[6, 6], [1, 2]], dens: 0.3, bush: '#3f7a66', flower: '#bfe0ff', part: 'snow', partCol: '#ffffff', mood: 0.1, water: '#8ac8ea', ore: 2 },
  { id: 'tropical', name: () => t('floresta.wb.tropical', 'Floresta Tropical'), T: 0.85, H: 0.85, M: 0, grass: '#34b84e', grass2: '#22963e', dirt: '#6b4a2a', rock: '#7a8a7a', sky: ['#4ac8e8', '#b6f2e6', '#fbffd0'], fog: '#b8ecd8', fogK: 0.7, sp: [[2, 5], [0, 1]], dens: 0.45, bush: '#1f8a3a', flower: '#ff4a8a', part: 'pollen', partCol: '#fff07a', mood: 0.6, water: '#2ac0c0', ore: 3 },
  { id: 'cerejeiras', name: () => t('floresta.wb.cerejeiras', 'Cerejeiras'), T: 0.55, H: 0.45, M: 1, grass: '#9ad87a', grass2: '#86c46a', dirt: '#8a6050', rock: '#b0a0b0', sky: ['#ffb0d0', '#ffe3ee', '#fff6f0'], fog: '#ffe0ec', fogK: 1, sp: [[3, 6], [0, 1]], dens: 0.3, bush: '#ff9ac8', flower: '#ffffff', part: 'petal', partCol: '#ffb3d1', mood: 0.3, water: '#7ad0f0', ore: 4 },
  { id: 'cogumelos', name: () => t('floresta.wb.cogumelos', 'Cogumelos Gigantes'), T: 0.45, H: 0.85, M: 1, grass: '#7a6ad0', grass2: '#5e50b0', dirt: '#4a3a5a', rock: '#6a5a8a', sky: ['#2a2350', '#5a4a8a', '#9a7ac0'], fog: '#6a5a9a', fogK: 0.65, sp: [[4, 6]], dens: 0.28, bush: '#a07aff', flower: '#7affc4', part: 'spore', partCol: '#9affe0', mood: 0.4, water: '#6a7aff', ore: 5 },
  { id: 'cristal', name: () => t('floresta.wb.cristal', 'Vale de Cristal'), T: 0.18, H: 0.25, M: 1, grass: '#b8dcf8', grass2: '#98c0e8', dirt: '#6a7a9a', rock: '#a0b4f0', sky: ['#6a8cff', '#c4d4ff', '#effaff'], fog: '#d4e0ff', fogK: 1.1, sp: [[5, 6]], dens: 0.22, bush: '#8ad0ff', flower: '#ffffff', part: 'sparkle', partCol: '#bff6ff', mood: 0.35, water: '#9ae8ff', ore: 6 },
  { id: 'savana', name: () => t('floresta.wb.savana', 'Savana'), T: 0.8, H: 0.28, M: 0, grass: '#d8c45a', grass2: '#c4ac48', dirt: '#a07040', rock: '#b0906a', sky: ['#5ab0f0', '#ffe0a0', '#fff4d0'], fog: '#f8e8c0', fogK: 1.3, sp: [[8, 6]], dens: 0.08, bush: '#a0a83a', flower: '#ff8a3a', part: 'dust', partCol: '#e8d090', mood: 0.5, water: '#4ab0d0', ore: 1 },
  { id: 'pantano', name: () => t('floresta.wb.pantano', 'Pântano'), T: 0.6, H: 0.97, M: 0, grass: '#6a8a4a', grass2: '#56743c', dirt: '#4a4030', rock: '#5a6a5a', sky: ['#7a9a8a', '#b8c8a8', '#d8e0c0'], fog: '#a8b898', fogK: 0.55, sp: [[10, 6], [0, 1]], dens: 0.26, bush: '#4a6a3a', flower: '#e0ff7a', part: 'firefly', partCol: '#e8ff6a', mood: 0.25, water: '#5a8a5a', ore: 3 },
  { id: 'deserto', name: () => t('floresta.wb.deserto', 'Deserto de Cactos'), T: 0.97, H: 0.04, M: 0, grass: '#f0d494', grass2: '#e4c47e', dirt: '#c49a5a', rock: '#c48a5a', sky: ['#4aa8f0', '#ffe6b0', '#fff8e0'], fog: '#fff0d0', fogK: 1.4, sp: [[9, 6]], dens: 0.07, bush: '#9ab04a', flower: '#ff7ab0', part: 'dust', partCol: '#f0d494', mood: 0.55, water: '#3ac0d0', ore: 7 },
  { id: 'outono', name: () => t('floresta.wb.outono', 'Outono Rubro'), T: 0.32, H: 0.48, M: 0, grass: '#c49a4a', grass2: '#b0843a', dirt: '#7a5236', rock: '#9a8a80', sky: ['#7aa8e0', '#ffd8b0', '#fff0e0'], fog: '#f8dcc0', fogK: 0.95, sp: [[7, 4], [12, 4], [0, 1]], dens: 0.34, bush: '#e26a2e', flower: '#ffd34a', part: 'leaf', partCol: '#ff7a2e', mood: 0.15, water: '#4aa0d0', ore: 0 },
  { id: 'montanha', name: () => t('floresta.wb.montanha', 'Montanhas Rochosas'), T: 0.3, H: 0.18, M: 0, grass: '#a4a48e', grass2: '#8e907e', dirt: '#6a5a4a', rock: '#7a7a86', sky: ['#6a9ad8', '#cfe0f0', '#f0f4f8'], fog: '#dfe6ee', fogK: 1.2, sp: [[1, 4], [6, 3]], dens: 0.12, bush: '#6a8a5a', flower: '#c0a0ff', part: 'dust', partCol: '#d0d0d8', mood: 0.2, water: '#5aa8d8', ore: 1 },
  { id: 'bambu', name: () => t('floresta.wb.bambu', 'Bambuzal'), T: 0.7, H: 0.66, M: 0.5, grass: '#8ad85a', grass2: '#6ec04a', dirt: '#7a6a3a', rock: '#8a9a7a', sky: ['#7ad0d8', '#d8f8d0', '#f8fff0'], fog: '#d8f0d0', fogK: 0.8, sp: [[11, 6]], dens: 0.5, bush: '#5ab04a', flower: '#fff07a', part: 'leaf', partCol: '#a8e07a', mood: 0.3, water: '#4ac0b0', ore: 4 },
];
export const NB = WBIOMES.length;

/** minérios / gemas que aparecem em crateras e buracos */
export interface Ore {
  name: () => string;
  color: string;
  value: number;
}
export const ORES: Ore[] = [
  { name: () => t('floresta.ore.0', 'Pedra Lisa'), color: '#b8b4c0', value: 4 },
  { name: () => t('floresta.ore.1', 'Cobre Brilhante'), color: '#e88a4a', value: 12 },
  { name: () => t('floresta.ore.2', 'Gelo Eterno'), color: '#bff0ff', value: 18 },
  { name: () => t('floresta.ore.3', 'Esmeralda'), color: '#3ae08a', value: 30 },
  { name: () => t('floresta.ore.4', 'Quartzo Rosa'), color: '#ffa8d0', value: 26 },
  { name: () => t('floresta.ore.5', 'Opala Lunar'), color: '#c8a8ff', value: 40 },
  { name: () => t('floresta.ore.6', 'Safira'), color: '#4a7aff', value: 55 },
  { name: () => t('floresta.ore.7', 'Âmbar do Sol'), color: '#ffc02e', value: 35 },
  { name: () => t('floresta.ore.8', 'Meteorito Estrelado'), color: '#ff5af0', value: 160 },
];
export const ORE_METEOR = 8;
