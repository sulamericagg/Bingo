/* Progresso local da Bloop Banda (localStorage 'bo-band'). */
import type { Difficulty, Instrument } from './model';
import { dayNumber, save } from '../../core/storage';

export interface Best {
  s: number; // pontos
  st: number; // estrelas 0..5
}

export interface Creation {
  id: string;
  code: string; // código BB1…
  at: number;
}

export interface BandSave {
  calib: number; // ms (positivo = você toca atrasado)
  inst: Instrument;
  diff: Difficulty;
  best: Record<string, Best>;
  eq: { highway: string; note: string; line: string; fx: string; inst: Partial<Record<Instrument, string>> };
  owned: string[];
  creations: Creation[];
  madeDay: number;
  madeCount: number;
  extraSlots: number;
  plays: number;
}

const KEY = 'bo-band';
const def = (): BandSave => ({
  calib: 0,
  inst: 'guitar',
  diff: 'facil',
  best: {},
  eq: { highway: 'auto', note: 'auto', line: 'teclas', fx: 'confete', inst: {} },
  owned: [],
  creations: [],
  madeDay: 0,
  madeCount: 0,
  extraSlots: 0,
  plays: 0,
});

function load(): BandSave {
  const d = def();
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...d, ...o, eq: { ...d.eq, ...(o.eq ?? {}), inst: { ...(o.eq?.inst ?? {}) } }, best: o.best ?? {}, owned: Array.isArray(o.owned) ? o.owned : [], creations: Array.isArray(o.creations) ? o.creations : [] };
  } catch {
    return d;
  }
}

export const bs: BandSave = load();

export function persistBand(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(bs));
  } catch {
    /* */
  }
}

export const bestKey = (song: string, inst: Instrument, diff: Difficulty): string => `${song}|${inst}|${diff}`;
export const getBest = (song: string, inst: Instrument, diff: Difficulty): Best | undefined => bs.best[bestKey(song, inst, diff)];

/** grava se for recorde; devolve true se bateu */
export function recordBest(song: string, inst: Instrument, diff: Difficulty, score: number, stars: number): boolean {
  const k = bestKey(song, inst, diff);
  const o = bs.best[k];
  const better = !o || score > o.s;
  bs.best[k] = { s: Math.max(score, o?.s ?? 0), st: Math.max(stars, o?.st ?? 0) };
  persistBand();
  return better;
}

/** melhor estrela da música em qualquer instrumento/dificuldade */
export function bestStarsAny(song: string): number {
  let m = 0;
  for (const k in bs.best) if (k.startsWith(song + '|')) m = Math.max(m, bs.best[k].st);
  return m;
}

/* -------------------- limite diário do Estúdio -------------------- */

export const FREE_PER_DAY = 2;

export function madeToday(): number {
  const d = dayNumber();
  if (bs.madeDay !== d) {
    bs.madeDay = d;
    bs.madeCount = 0;
  }
  return bs.madeCount;
}
export function noteMade(): void {
  madeToday();
  if (bs.madeCount >= FREE_PER_DAY && bs.extraSlots > 0) bs.extraSlots--;
  bs.madeCount++;
  persistBand();
}

/** passe da temporada N comprado (vigente ou histórico) */
export function ownsSeasonPass(season: number): boolean {
  const p = save.pass;
  if (!p) return false;
  if (p.season === season && p.cur?.premium) return true;
  const id = 's' + String(season).padStart(2, '0');
  return !!(p.history?.[id]?.premium || p.history?.[String(season)]?.premium);
}
