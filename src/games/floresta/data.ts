/* ============================================================
 *  LENHADORES DO BOSQUE — dados do jogo (biomas, árvores, ferramentas,
 *  veículos, máquinas, construções). Nomes via t() com chaves estáticas.
 * ============================================================ */
import { t } from '../../i18n';

/** comprimento de cada bioma (m) e início do primeiro (depois da base) */
export const BASE_END = 34;
export const BIOME_LEN = 110;
export const WORLD_Z = 7; // meia-largura do corredor 3D (m)
export const INTAKE_X = 26; // funil da serraria: soltar toras aqui

export interface Biome {
  id: string;
  name: () => string;
  /** espécie comum do bioma */
  species: number;
  sky: [string, string, string];
  far: string;
  mid: string;
  ground: [string, string];
  grass: string;
  /** construção que abre este bioma (índice em BUILDS) */
  build: number;
  night?: boolean;
}

export const BIOMES: Biome[] = [
  { id: 'bosque', name: () => t('floresta.b.bosque', 'Bosque Inicial'), species: 0, sky: ['#7cc8ff', '#bfe8ff', '#eaffd9'], far: '#8fbfd9', mid: '#6fae6a', ground: ['#7a5a3a', '#5d4129'], grass: '#6cc24a', build: -1 },
  { id: 'pinheiral', name: () => t('floresta.b.pinheiral', 'Pinheiral'), species: 1, sky: ['#9fc6ef', '#d6ecff', '#f2f8ff'], far: '#93a9c9', mid: '#4f8a72', ground: ['#6e5a48', '#4e3f31'], grass: '#4fa86a', build: 0 },
  { id: 'tropical', name: () => t('floresta.b.tropical', 'Floresta Tropical'), species: 2, sky: ['#5fd0e8', '#b6f2e6', '#fbffd0'], far: '#5fb8a0', mid: '#2f9a5a', ground: ['#6b4a2a', '#4a321c'], grass: '#3cc25a', build: 1 },
  { id: 'cerejeiras', name: () => t('floresta.b.cerejeiras', 'Bosque de Cerejeiras'), species: 3, sky: ['#ffc3dc', '#ffe3ee', '#fff6f0'], far: '#e9a9c9', mid: '#c98fb3', ground: ['#7a5a4a', '#5a4034'], grass: '#8fd27a', build: 2 },
  { id: 'cogumelos', name: () => t('floresta.b.cogumelos', 'Floresta de Cogumelos Gigantes'), species: 4, sky: ['#2a2350', '#4a3a7a', '#7a5aa0'], far: '#3a3070', mid: '#4a3a80', ground: ['#4a3a5a', '#2e2440'], grass: '#7a6ad0', build: 3, night: true },
  { id: 'cristal', name: () => t('floresta.b.cristal', 'Floresta de Cristal'), species: 5, sky: ['#7a9cff', '#c4d4ff', '#effaff'], far: '#a0b4f0', mid: '#8ac0e0', ground: ['#6a7a9a', '#4a5470'], grass: '#a8e4ff', build: 4 },
  { id: 'nuvens', name: () => t('floresta.b.nuvens', 'Árvores-Nuvem'), species: 6, sky: ['#ffd2a0', '#ffeccc', '#fff9ef'], far: '#ffe0c0', mid: '#ffffff', ground: ['#e8eef8', '#c8d4ea'], grass: '#ffffff', build: 5 },
];

export interface Species {
  name: () => string;
  hp: number;
  logs: number;
  value: number;
  /** altura (m) */
  h: number;
  trunk: string;
  trunkDark: string;
  leaf: string;
  leaf2: string;
  shape: 'round' | 'pine' | 'palm' | 'blossom' | 'mushroom' | 'crystal' | 'cloud';
}

export const SPECIES: Species[] = [
  { name: () => t('floresta.s.carvalho', 'Carvalho'), hp: 6, logs: 2, value: 3, h: 7, trunk: '#9a6a3c', trunkDark: '#6e4626', leaf: '#5cc24a', leaf2: '#3e9a3a', shape: 'round' },
  { name: () => t('floresta.s.pinheiro', 'Pinheiro'), hp: 14, logs: 3, value: 6, h: 10, trunk: '#8a5a34', trunkDark: '#5e3a20', leaf: '#3a9a6a', leaf2: '#2a7452', shape: 'pine' },
  { name: () => t('floresta.s.palmeira', 'Palmeira-Leque'), hp: 30, logs: 3, value: 14, h: 11, trunk: '#b08a5a', trunkDark: '#7e6040', leaf: '#3ed06a', leaf2: '#22a24a', shape: 'palm' },
  { name: () => t('floresta.s.cerejeira', 'Cerejeira'), hp: 60, logs: 3, value: 32, h: 8, trunk: '#7a4a3a', trunkDark: '#523024', leaf: '#ffb3d1', leaf2: '#ff86b6', shape: 'blossom' },
  { name: () => t('floresta.s.cogumelo', 'Cogumelo-Gigante'), hp: 120, logs: 4, value: 70, h: 9, trunk: '#f2e6d0', trunkDark: '#c9b89a', leaf: '#ff5a6a', leaf2: '#d8364a', shape: 'mushroom' },
  { name: () => t('floresta.s.cristal', 'Árvore de Cristal'), hp: 260, logs: 4, value: 150, h: 10, trunk: '#b8c8ff', trunkDark: '#7a8ad8', leaf: '#9ef0ff', leaf2: '#5ac8f0', shape: 'crystal' },
  { name: () => t('floresta.s.nuvem', 'Árvore-Nuvem'), hp: 520, logs: 5, value: 330, h: 13, trunk: '#e0c8a8', trunkDark: '#b09878', leaf: '#ffffff', leaf2: '#dfe8ff', shape: 'cloud' },
];

/** variantes raras (multiplicam o valor e o hp) */
export type Rare = 0 | 1 | 2 | 3; // nenhuma, dourada, cristalina, bioluminescente
export const RARES = [
  { name: () => '', mult: 1, hpMult: 1, color: '' },
  { name: () => t('floresta.r.gold', 'Dourada'), mult: 8, hpMult: 2, color: '#ffd34a' },
  { name: () => t('floresta.r.crystal', 'Cristalina'), mult: 5, hpMult: 1.6, color: '#8ff0ff' },
  { name: () => t('floresta.r.glow', 'Bioluminescente'), mult: 6, hpMult: 1.6, color: '#7affc4' },
];

export interface Tool {
  name: () => string;
  dmg: number;
  rate: number; // golpes por segundo
  cost: number;
  kind: 'axe' | 'saw' | 'laser';
  color: string;
}

export const TOOLS: Tool[] = [
  { name: () => t('floresta.t.0', 'Machadinho'), dmg: 1, rate: 2.2, cost: 0, kind: 'axe', color: '#c9c9d6' },
  { name: () => t('floresta.t.1', 'Machado Robusto'), dmg: 2, rate: 2.3, cost: 60, kind: 'axe', color: '#a8b8c8' },
  { name: () => t('floresta.t.2', 'Machado de Aço'), dmg: 4, rate: 2.4, cost: 380, kind: 'axe', color: '#e0e8f4' },
  { name: () => t('floresta.t.3', 'Machado Duplo'), dmg: 8, rate: 2.5, cost: 1800, kind: 'axe', color: '#ffd34a' },
  { name: () => t('floresta.t.4', 'Serra Zum-Zum'), dmg: 16, rate: 3.2, cost: 9000, kind: 'saw', color: '#ff8a3a' },
  { name: () => t('floresta.t.5', 'Serra Turbo'), dmg: 34, rate: 3.5, cost: 42000, kind: 'saw', color: '#ff4a6a' },
  { name: () => t('floresta.t.6', 'Cortador a Laser'), dmg: 75, rate: 4, cost: 190000, kind: 'laser', color: '#5af0ff' },
  { name: () => t('floresta.t.7', 'Laser Estelar'), dmg: 170, rate: 5, cost: 900000, kind: 'laser', color: '#c07aff' },
];

export interface Vehicle {
  name: () => string;
  cap: number;
  speed: number;
  /** raio de coleta automática de toras (m) */
  reach: number;
  cost: number;
}

export const VEHICLES: Vehicle[] = [
  { name: () => t('floresta.v.0', 'A pé'), cap: 2, speed: 6.5, reach: 1.6, cost: 0 },
  { name: () => t('floresta.v.1', 'Carrinho de Mão'), cap: 5, speed: 7.5, reach: 1.8, cost: 150 },
  { name: () => t('floresta.v.2', 'Caminhãozinho'), cap: 12, speed: 11, reach: 2.2, cost: 2600 },
  { name: () => t('floresta.v.3', 'Carregadeira'), cap: 26, speed: 12, reach: 4, cost: 28000 },
  { name: () => t('floresta.v.4', 'Trem do Bosque'), cap: 60, speed: 15, reach: 5, cost: 320000 },
];

export type MachineId = 'saw' | 'planer' | 'belt' | 'nursery';
export interface Machine {
  id: MachineId;
  name: () => string;
  desc: () => string;
  base: number;
  growth: number;
}
export const MACHINES: Machine[] = [
  { id: 'saw', name: () => t('floresta.m.saw', 'Serraria'), desc: () => t('floresta.m.saw.d', 'Mais tábuas por tora'), base: 90, growth: 2.1 },
  { id: 'planer', name: () => t('floresta.m.planer', 'Plaina'), desc: () => t('floresta.m.planer.d', 'Tábuas lisinhas valem mais'), base: 140, growth: 1.9 },
  { id: 'belt', name: () => t('floresta.m.belt', 'Esteira'), desc: () => t('floresta.m.belt.d', 'Esteira mais rápida'), base: 70, growth: 1.8 },
  { id: 'nursery', name: () => t('floresta.m.nursery', 'Viveiro de Mudas'), desc: () => t('floresta.m.nursery.d', 'Replantio mais rápido'), base: 60, growth: 1.7 },
];

export function machineCost(m: Machine, lvl: number): number {
  return Math.round(m.base * Math.pow(m.growth, lvl));
}
export const planksPerLog = (sawLvl: number): number => 2 + Math.min(10, sawLvl);
export const planerMult = (lvl: number): number => 1 + lvl * 0.3;
export const beltSpeed = (lvl: number): number => 1.6 + lvl * 0.45; // m/s
export const sawTime = (lvl: number): number => Math.max(0.18, 1.1 / (1 + lvl * 0.35));
/** segundos até o toco virar muda */
export const replantDelay = (nursery: number, planters: number): number => Math.max(1.5, 14 / (1 + nursery * 0.4 + planters * 0.5));
/** segundos para a muda crescer */
export const growTime = (nursery: number): number => Math.max(8, 40 / (1 + nursery * 0.25));

export type HelperId = 'bots' | 'drones' | 'planters';
export const HELPERS: { id: HelperId; name: () => string; desc: () => string; base: number; growth: number; max: number }[] = [
  { id: 'bots', name: () => t('floresta.h.bots', 'Robô Lenhador'), desc: () => t('floresta.h.bots.d', 'Corta e traz toras sozinho'), base: 400, growth: 3, max: 6 },
  { id: 'drones', name: () => t('floresta.h.drones', 'Drone Podador'), desc: () => t('floresta.h.drones.d', 'Voa, corta e entrega rapidinho'), base: 6000, growth: 3.2, max: 6 },
  { id: 'planters', name: () => t('floresta.h.planters', 'Robô Plantador'), desc: () => t('floresta.h.planters.d', 'Planta mudas onde há tocos'), base: 250, growth: 2.6, max: 6 },
];
export const helperCost = (i: number, n: number): number => Math.round(HELPERS[i].base * Math.pow(HELPERS[i].growth, n));

/** construções: cada uma abre o bioma seguinte */
export const BUILDS = [
  { name: () => t('floresta.c.0', 'Cerca com Portão'), planks: 25, cost: 80 },
  { name: () => t('floresta.c.1', 'Ponte de Tábuas'), planks: 90, cost: 900 },
  { name: () => t('floresta.c.2', 'Cabana do Guarda'), planks: 260, cost: 7000 },
  { name: () => t('floresta.c.3', 'Escadaria de Raízes'), planks: 700, cost: 50000 },
  { name: () => t('floresta.c.4', 'Torre de Vigia'), planks: 1800, cost: 300000 },
  { name: () => t('floresta.c.5', 'Balão de Tábuas'), planks: 4500, cost: 1800000 },
];

export const gateX = (biome: number): number => BASE_END + biome * BIOME_LEN;
export const biomeAt = (x: number): number => Math.max(0, Math.min(BIOMES.length - 1, Math.floor((x - BASE_END) / BIOME_LEN)));

/** sementes douradas ganhas ao renovar o bosque */
export const prestigeSeeds = (earnedRun: number): number => Math.floor(Math.sqrt(Math.max(0, earnedRun) / 2500));
export const prestigeMult = (seeds: number): number => 1 + seeds * 0.15;

export function mulberry(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** formata números grandes: 1.2k, 3.4M */
export function short(n: number): string {
  n = Math.floor(n);
  if (n < 10000) return String(n);
  if (n < 1e6) return (n / 1000).toFixed(n < 1e5 ? 1 : 0) + 'k';
  if (n < 1e9) return (n / 1e6).toFixed(n < 1e8 ? 1 : 0) + 'M';
  return (n / 1e9).toFixed(1) + 'B';
}
