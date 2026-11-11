/* ============================================================
 *  CASA DO BLOOP — lógica do bichinho (sem DOM/canvas: barato de importar).
 *
 *  Status 0..100 que caem em TEMPO REAL (inclusive com o app fechado,
 *  calculado pelos timestamps). Ajuste: 1 dia sem jogar deixa com fome,
 *  sujinho e tristinho, mas NUNCA "morre" — fica fraco, perde XP devagar
 *  e se recupera com carinho. À noite (21h–9h) ele dorme: gasta menos e
 *  recupera energia.
 * ============================================================ */
import { bus } from '../core/events';
import { addCoins, addGems } from '../core/economy';
import { dayNumber, persist, save, type PetSave } from '../core/storage';
import { foodById, tasteFor, type FoodDef, type Taste } from './catalog';

export type StatKey = 'food' | 'clean' | 'fun' | 'energy';
export const STATS: StatKey[] = ['food', 'clean', 'fun', 'energy'];

/** Abaixo disso o status pede atenção (badge, notificação, visual). */
export const LOW = 30;

/** Perda por hora acordado / dormindo (noite). Energia dormindo SOBE. */
const RATE_DAY: Record<StatKey, number> = { food: 4.2, clean: 4.0, fun: 4.4, energy: 3.0 };
const RATE_NIGHT: Record<StatKey, number> = { food: 2.1, clean: 2.0, fun: 1.8, energy: -6 };
/** XP perdido por hora quando a saúde está muito baixa. */
const XP_LOSS_H = 3;
/** Limite diário de XP ganho com cuidados (evita "farmar" cócegas). */
const XP_DAY_CAP = 260;

export const QUIET_START = 21;
export const QUIET_END = 9;

export const pet = (): PetSave => save.pet;

export const isNightHour = (h: number): boolean => h >= QUIET_START || h < QUIET_END;

const clamp = (v: number): number => (v < 0 ? 0 : v > 100 ? 100 : v);

/** Saúde derivada (0..100). */
export function health(p: PetSave = save.pet): number {
  return Math.round(p.food * 0.32 + p.clean * 0.22 + p.fun * 0.26 + p.energy * 0.2);
}

/* ---------------------------- nível ---------------------------- */

/** XP necessário para ir do nível L para L+1. */
export const xpForLevel = (L: number): number => 40 + (L - 1) * 25;

export interface LevelInfo {
  level: number;
  /** XP dentro do nível atual */
  cur: number;
  need: number;
}

export function levelInfo(xp = save.pet.xp): LevelInfo {
  let L = 1;
  let rest = Math.max(0, xp);
  while (rest >= xpForLevel(L) && L < 99) {
    rest -= xpForLevel(L);
    L++;
  }
  return { level: L, cur: rest, need: xpForLevel(L) };
}

export const petLevel = (): number => levelInfo().level;

/**
 * Bônus de moedas para TODOS os jogos: +1% por nível (máx. +20%).
 * Pela metade se o bichinho estiver fraquinho. Ex.: 0.05 = +5%.
 * Uso nos jogos: coins = Math.round(base * (1 + petCoinBonus()))
 */
export function petCoinBonus(): number {
  const lv = levelInfo().level - 1;
  const b = Math.min(0.2, lv * 0.01);
  return health() < LOW ? b / 2 : b;
}

/* ---------------------------- desgaste ---------------------------- */

let emitTimer = 0;
function changed(immediate = false): void {
  persist();
  if (immediate) {
    bus.emit('pet');
    return;
  }
  if (emitTimer) return;
  emitTimer = window.setTimeout(() => {
    emitTimer = 0;
    bus.emit('pet');
  }, 120);
}

/** Aplica o desgaste desde a última vez. Chame à vontade (barato). */
export function tick(now = Date.now()): void {
  const p = save.pet;
  if (!p.last || p.last > now) {
    p.last = now;
    return;
  }
  let from = p.last;
  // máximo de 10 dias simulados
  if (now - from > 10 * 86400000) from = now - 10 * 86400000;
  if (now - from < 1000) return;
  const STEP = 15 * 60000;
  const d = new Date(from);
  while (from < now) {
    const to = Math.min(now, from + STEP);
    const hrs = (to - from) / 3600000;
    d.setTime(from);
    const R = isNightHour(d.getHours()) ? RATE_NIGHT : RATE_DAY;
    p.food = clamp(p.food - R.food * hrs);
    p.clean = clamp(p.clean - R.clean * hrs);
    p.fun = clamp(p.fun - R.fun * hrs);
    p.energy = clamp(p.energy - R.energy * hrs);
    if (health(p) < LOW) p.xp = Math.max(0, p.xp - XP_LOSS_H * hrs);
    from = to;
  }
  p.last = now;
  changed();
}

/** Prevê (ms a partir de agora) quando `stat` cruza `th`; Infinity se não cruza em 3 dias. */
export function predictCross(stat: StatKey, th: number, now = Date.now()): number {
  const p = save.pet;
  let v = p[stat];
  if (v < th) return 0;
  const STEP = 15 * 60000;
  const d = new Date(now);
  for (let tt = 0; tt < 3 * 86400000; tt += STEP) {
    d.setTime(now + tt);
    const R = isNightHour(d.getHours()) ? RATE_NIGHT : RATE_DAY;
    v -= R[stat] * 0.25;
    if (v > 100) v = 100;
    if (v < th) return tt + STEP;
  }
  return Infinity;
}

/* ---------------------------- humor ---------------------------- */

export interface Mood {
  hungry: boolean;
  dirty: boolean;
  sad: boolean;
  tired: boolean;
  weak: boolean;
  happy: boolean;
  shiny: boolean;
}

let cheerUntil = 0;
/** Deixa o bichinho radiante por alguns segundos (depois de jogar/brincar). */
export function cheer(ms = 8000): void {
  cheerUntil = Math.max(cheerUntil, Date.now() + ms);
}

export function mood(now = Date.now()): Mood {
  const p = save.pet;
  const h = health(p);
  const hungry = p.food < 35;
  const dirty = p.clean < 35;
  const tired = p.energy < 30;
  const sad = p.fun < 30 || h < 30;
  const cheering = now < cheerUntil;
  return {
    hungry,
    dirty,
    sad: sad && !cheering,
    tired,
    weak: h < LOW,
    happy: cheering || (!sad && !hungry && !dirty && !tired && p.fun >= 65 && h >= 65),
    shiny: now < p.shineUntil,
  };
}

/** Quantos status estão abaixo de LOW (badge do menu). */
export function needsCount(): number {
  tick();
  const p = save.pet;
  let n = 0;
  for (const k of STATS) if (p[k] < LOW) n++;
  return n;
}

/** Status mais urgente (ou null se tudo bem). */
export function worstStat(): StatKey | null {
  const p = save.pet;
  let best: StatKey | null = null;
  let v = LOW;
  for (const k of STATS)
    if (p[k] < v) {
      v = p[k];
      best = k;
    }
  return best;
}

/* ---------------------------- ações ---------------------------- */

/** Ganha XP de cuidado (com teto diário). Retorna XP efetivo. */
export function addXp(n: number): number {
  const p = save.pet;
  const today = dayNumber();
  if (p.xpDay !== today) {
    p.xpDay = today;
    p.xpToday = 0;
  }
  const g = Math.max(0, Math.min(n, XP_DAY_CAP - p.xpToday));
  if (g <= 0) return 0;
  const before = levelInfo().level;
  p.xp += g;
  p.xpToday += g;
  const after = levelInfo().level;
  if (after > before) {
    p.bestLevel = Math.max(p.bestLevel, after);
    persist();
    bus.emit('pet-levelup', after);
  }
  changed();
  return g;
}

export function addStat(k: StatKey, n: number): void {
  tick();
  save.pet[k] = clamp(save.pet[k] + n);
  changed();
}

/** Compra 1 unidade da comida para a despensa. */
export function buyFood(id: string): boolean {
  const f = foodById(id);
  if (!f) return false;
  if (f.coins) {
    if (save.coins < f.coins) return false;
    addCoins(-f.coins);
  } else if (f.gems) {
    if (save.gems < f.gems) return false;
    addGems(-f.gems);
  } else return false;
  save.pet.pantry[id] = (save.pet.pantry[id] ?? 0) + 1;
  changed(true);
  return true;
}

export const pantryCount = (id: string): number => save.pet.pantry[id] ?? 0;

/** Gosto do bichinho atual (pela skin) por uma comida. */
export const taste = (foodId: string): Taste => tasteFor(save.skin, foodId);

/** Come 1 unidade da despensa. Retorna a comida ou null. */
export function eat(id: string): FoodDef | null {
  const f = foodById(id);
  if (!f || pantryCount(id) <= 0) return null;
  tick();
  const p = save.pet;
  p.pantry[id] = pantryCount(id) - 1;
  const wasHungry = p.food < 60;
  const tt = taste(id);
  // odiada: cospe metade e fica um pouquinho emburrado; favorita: alegria extra
  p.food = clamp(p.food + (tt === 'hate' ? f.food * 0.5 : f.food));
  p.fun = clamp(p.fun + (tt === 'hate' ? -4 : tt === 'fav' ? f.fun + 6 : f.fun));
  p.energy = clamp(p.energy + f.energy);
  addXp(tt === 'hate' ? 1 : wasHungry ? 4 + Math.round(f.food / 8) : 1);
  changed(true);
  return f;
}

/* ---------------------------- travessuras ---------------------------- */

/** "Birra" acumulada (só na memória): sobe com travessuras, desce sozinha. */
let grump = 0;
let grumpAt = 0;
const GRUMP_DECAY = 0.12; // pontos por segundo

/** Nível atual de birra (0..~12). */
export function grumpiness(now = Date.now()): number {
  if (grumpAt) grump = Math.max(0, grump - ((now - grumpAt) / 1000) * GRUMP_DECAY);
  grumpAt = now;
  return grump;
}

/**
 * Uma travessura (cutucão, travesseirada, borrifo...). Pequena queda de
 * alegria — só humor, nunca saúde/XP — e retorna a birra acumulada.
 */
export function mischief(n = 1): number {
  const g = grumpiness() + n;
  grump = g;
  tick();
  save.pet.fun = clamp(save.pet.fun - n * 0.8);
  changed();
  return g;
}

/** Fez as pazes (carinho depois da birra). */
export function forgive(): void {
  grump = 0;
  grumpAt = Date.now();
}

/** Banho completo (espuma + enxágue + toalha). */
export function bathed(): void {
  tick();
  const p = save.pet;
  const gain = 100 - p.clean;
  p.clean = 100;
  p.fun = clamp(p.fun + 6);
  addXp(gain > 30 ? 14 : 3);
  changed(true);
}

/** Polimento: brilho por algumas horas. */
export function polished(): void {
  const p = save.pet;
  p.shineUntil = Date.now() + 4 * 3600000;
  p.fun = clamp(p.fun + 8);
  addXp(6);
  changed(true);
}

/** Recupera energia dormindo no quarto (chamado a cada frame com dt em s). */
export function sleepTick(dt: number): void {
  const p = save.pet;
  const before = p.energy;
  p.energy = clamp(p.energy + dt * 2.2);
  if (before < 100 && p.energy >= 100) addXp(8);
  changed();
}

/** Brincadeira na sala (cócegas, bola...). */
export function played(fun: number, xp = 0): void {
  tick();
  const p = save.pet;
  p.fun = clamp(p.fun + fun);
  p.energy = clamp(p.energy - fun * 0.15);
  if (xp) addXp(xp);
  changed();
}

/* ---------------------------- partidas ---------------------------- */

/** Reação a uma partida de qualquer minigame (bus 'run-end'). */
export function onRunEnd(r: { coins: number; won?: boolean; durationSec: number }): void {
  tick();
  const p = save.pet;
  const play = Math.min(1, r.durationSec / 60);
  p.fun = clamp(p.fun + 8 + play * 6 + (r.won ? 6 : 0));
  p.food = clamp(p.food - 1.5 - play * 2);
  p.energy = clamp(p.energy - 1.5 - play * 2.5);
  addXp(3);
  cheer(30000);
  changed();
}
