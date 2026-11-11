/**
 * CAÇA BLOOP — progresso local (localStorage 'bw-caca'). Só os SEUS bichinhos; nada de localização é salvo
 * além do "ponto virtual" aleatório do modo casa (que não é um lugar real).
 */
import { dayNumber } from '../core/storage';
import { genome, randomSeed, rarityOf, type Rarity } from './genome';
import { hashN, parseSeed, seedFrom, seedHex } from './rng';

export interface Mon {
  uid: string;
  seed: string;
  evo: number;
  lvl: number;
  xp: number;
  at: number;
}
export interface Egg {
  id: string;
  seed: string;
  needKm: number;
  km: number;
  at: number;
}
export interface DexEntry {
  seen: number;
  caught: number;
  /** maior raridade capturada (-1 = nenhuma) */
  best: number;
}
export interface CacaSave {
  v: 1;
  safetyOk: boolean;
  locMode: 'gps' | 'casa' | null;
  homeSeed: string;
  ar: boolean;
  mons: Mon[];
  team: string[];
  dex: Record<string, DexEntry>;
  done: string[]; // aparições já resolvidas (capturadas/fugiram)
  streak: { day: number; count: number; best: number };
  eggs: Egg[];
  eggN: number;
  km: number;
  catches: number;
  battles: number;
  wins: number;
  starter: boolean;
}

const KEY = 'bw-caca';
let cache: CacaSave | null = null;

const fresh = (): CacaSave => ({
  v: 1, safetyOk: false, locMode: null, homeSeed: seedHex(randomSeed()), ar: false, mons: [], team: [], dex: {}, done: [],
  streak: { day: 0, count: 0, best: 0 }, eggs: [], eggN: 0, km: 0, catches: 0, battles: 0, wins: 0, starter: false,
});

export function cacaSave(): CacaSave {
  if (cache) return cache;
  const s = fresh();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(s, JSON.parse(raw) as Partial<CacaSave>);
  } catch {
    /* corrompido: começa de novo */
  }
  for (const k of ['mons', 'team', 'done', 'eggs'] as const) if (!Array.isArray(s[k])) (s as unknown as Record<string, unknown>)[k] = [];
  if (!s.dex || typeof s.dex !== 'object') s.dex = {};
  cache = s;
  return s;
}
export function persistCaca(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(cacaSave()));
  } catch {
    /* sem espaço */
  }
}

/** XP para passar do nível l para l+1 */
export const xpNeed = (l: number): number => 60 + l * 25;
export const MAX_LVL = 40;
export const EVO_LVL = [10, 22];

export function markSeen(family: string): void {
  const s = cacaSave();
  const d = (s.dex[family] ??= { seen: 0, caught: 0, best: -1 });
  d.seen++;
}

export function addMon(seed: string, lvl: number, evo = 0): Mon {
  const s = cacaSave();
  const g = genome(seed, evo);
  const m: Mon = { uid: seed + '-' + (s.catches + s.mons.length).toString(36) + Date.now().toString(36).slice(-4), seed, evo, lvl: Math.max(1, Math.min(MAX_LVL, lvl)), xp: 0, at: Date.now() };
  s.mons.push(m);
  const d = (s.dex[g.family] ??= { seen: 0, caught: 0, best: -1 });
  d.caught++;
  if (!d.seen) d.seen = 1;
  d.best = Math.max(d.best, g.rarity);
  if (s.team.length < 6) s.team.push(m.uid);
  persistCaca();
  return m;
}

export function monById(uid: string): Mon | undefined {
  return cacaSave().mons.find((m) => m.uid === uid);
}
export function teamMons(): Mon[] {
  const s = cacaSave();
  return s.team.map((u) => s.mons.find((m) => m.uid === u)).filter((m): m is Mon => !!m);
}
export function toggleTeam(uid: string): boolean {
  const s = cacaSave();
  const i = s.team.indexOf(uid);
  if (i >= 0) s.team.splice(i, 1);
  else if (s.team.length < 6) s.team.push(uid);
  else return false;
  persistCaca();
  return true;
}
export function releaseMon(uid: string): void {
  const s = cacaSave();
  s.mons = s.mons.filter((m) => m.uid !== uid);
  s.team = s.team.filter((u) => u !== uid);
  persistCaca();
}

/** Dá XP; devolve quantos níveis subiu. */
export function giveXp(m: Mon, xp: number): number {
  let up = 0;
  m.xp += Math.round(xp);
  while (m.lvl < MAX_LVL && m.xp >= xpNeed(m.lvl)) {
    m.xp -= xpNeed(m.lvl);
    m.lvl++;
    up++;
  }
  if (m.lvl >= MAX_LVL) m.xp = 0;
  return up;
}
export const canEvolve = (m: Mon): boolean => m.evo < 2 && m.lvl >= EVO_LVL[m.evo];
export function evolve(m: Mon): boolean {
  if (!canEvolve(m)) return false;
  m.evo++;
  const g = genome(m.seed, m.evo);
  const s = cacaSave();
  const d = (s.dex[g.family] ??= { seen: 1, caught: 0, best: -1 });
  d.caught++;
  d.best = Math.max(d.best, g.rarity);
  persistCaca();
  return true;
}

export function markDone(spawnId: string): void {
  const s = cacaSave();
  s.done.push(spawnId);
  if (s.done.length > 300) s.done.splice(0, s.done.length - 300);
  persistCaca();
}

/** Atualiza a sequência diária na 1ª captura do dia. Devolve {count, novo} */
export function bumpStreak(): { count: number; fresh: boolean } {
  const s = cacaSave();
  const today = dayNumber();
  if (s.streak.day === today) return { count: s.streak.count, fresh: false };
  s.streak.count = s.streak.day === today - 1 ? s.streak.count + 1 : 1;
  s.streak.day = today;
  s.streak.best = Math.max(s.streak.best, s.streak.count);
  persistCaca();
  return { count: s.streak.count, fresh: true };
}
export function streakAlive(): number {
  const s = cacaSave();
  const today = dayNumber();
  return s.streak.day >= today - 1 ? s.streak.count : 0;
}

/* ---------------- ovos (chocam andando) ---------------- */
export const MAX_EGGS = 6;
const EGG_KM = [2, 5, 10];
/** Ovo novo: semente determinística a partir da semente local; ovos maiores escolhem o melhor de N sementes. */
export function addEgg(tier: 0 | 1 | 2): Egg | null {
  const s = cacaSave();
  if (s.eggs.length >= MAX_EGGS) return null;
  const tries = [1, 3, 8][tier];
  let best = seedFrom(s.homeSeed, 'egg', s.eggN, 0);
  for (let i = 1; i < tries; i++) {
    const c = seedFrom(s.homeSeed, 'egg', s.eggN, i);
    if (rarityOf(c) > rarityOf(best)) best = c;
  }
  s.eggN++;
  const e: Egg = { id: 'egg' + s.eggN + '-' + (hashN(s.homeSeed, s.eggN) % 9999), seed: seedHex(best), needKm: EGG_KM[tier], km: 0, at: Date.now() };
  s.eggs.push(e);
  persistCaca();
  return e;
}
/** Soma distância andada (km) nos ovos; devolve os que chocaram (já viram bichinhos). */
export function walkEggs(km: number): { egg: Egg; mon: Mon }[] {
  const s = cacaSave();
  s.km += km;
  const out: { egg: Egg; mon: Mon }[] = [];
  for (const e of [...s.eggs]) {
    e.km = Math.min(e.needKm, e.km + km);
    if (e.km >= e.needKm) {
      s.eggs = s.eggs.filter((x) => x !== e);
      const g = genome(parseSeed(e.seed));
      out.push({ egg: e, mon: addMon(e.seed, 1 + (g.rarity as Rarity)) });
    }
  }
  persistCaca();
  return out;
}

/** 3 opções de inicial (comuns, uma de cada: fogo / água / planta) — sementes desta instalação. */
export function starterSeeds(): string[] {
  const s = cacaSave();
  const out: string[] = [];
  for (const el of [0, 1, 2]) {
    for (let i = 0; i < 400; i++) {
      const sd = seedFrom(s.homeSeed, 'starter', el, i);
      sd.lo = ((sd.lo & ~15) | el) >>> 0;
      if (rarityOf(sd) === 0) {
        out.push(seedHex(sd));
        break;
      }
    }
  }
  return out;
}
