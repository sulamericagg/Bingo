/* BLOOP NO LUGAR — trilha de fases. Cada fase = (tamanho pela trilha, semente da tabela).
 * A tabela (levels-data.ts) é gerada por scripts/lugar/gen-levels.mjs: para cada vaga a
 * semente é escolhida até bater a dificuldade-alvo, e cada capítulo vem ordenado da mais
 * fácil para a mais difícil. */
import { generate, hash32, type Puzzle } from './engine';
import { SEEDS } from './levels-data';

export const PER_CHAPTER = 20;
/** tamanho do tabuleiro por capítulo: rampa 5→12 e depois um ciclo misturando tamanhos */
const RAMP = [5, 5, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 12, 12];
const CYCLE = [8, 9, 10, 11, 12, 9, 10, 11, 12, 10];
export const CHAPTERS = 60;
export const LEVELS = CHAPTERS * PER_CHAPTER;

export function chapterSize(ch: number): number {
  return ch < RAMP.length ? RAMP[ch] : CYCLE[(ch - RAMP.length) % CYCLE.length];
}
export const levelSize = (i: number): number => chapterSize(Math.floor(i / PER_CHAPTER));

/** dificuldade-alvo (0..4) da vaga i (usada só pelo gerador da tabela) */
export function targetTier(i: number): number {
  const ch = Math.floor(i / PER_CHAPTER);
  const j = i % PER_CHAPTER;
  const n = chapterSize(ch);
  const cap = n <= 6 ? 1 : n <= 8 ? 2 : n <= 10 ? 3 : 4;
  if (i < 4) return 0;
  const heat = Math.min(1, ch / 40); // 0..1 ao longo da trilha
  // mistura: 0..1 dentro do capítulo + calor geral
  const x = (j / PER_CHAPTER) * 1.2 + heat * 3.2 + (ch < RAMP.length ? (ch % 3) * 0.25 : 0.6);
  const tier = Math.floor(x * 0.9 + ((hash32(i, 7) % 100) / 100) * 0.8);
  return Math.max(0, Math.min(cap, tier));
}

const cache = new Map<number, Puzzle>();
export function levelPuzzle(i: number): Puzzle {
  let p = cache.get(i);
  if (p) return p;
  const seed = SEEDS[i] ?? hash32(i, 99) % 100000;
  p = generate(levelSize(i), seed);
  cache.set(i, p);
  if (cache.size > 30) cache.delete(cache.keys().next().value!);
  return p;
}

/** Desafio do dia: igual para todo mundo (data local → número do dia). */
export function dailyPuzzle(day: number): Puzzle {
  const n = [8, 9, 10, 9, 8, 10, 11][day % 7];
  let best: Puzzle | null = null;
  for (let k = 0; k < 12; k++) {
    const p = generate(n, hash32(day, k, 0xda11) % 1000000);
    if (p.rating.tier >= 1 && p.rating.tier <= 2) return p;
    if (!best || Math.abs(p.rating.tier - 1.5) < Math.abs(best.rating.tier - 1.5)) best = p;
  }
  return best!;
}
