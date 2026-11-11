/* BLOOP NO LUGAR — progresso local (localStorage 'bw-lugar', aditivo e tolerante). */
import { dayNumber } from '../../core/storage';

export type InputMode = 'cycle' | 'double';

export interface Progress {
  /** chave da partida: L<idx> | D<dia> | Z<n>-<seed> */
  key: string;
  cells: number[];
  hearts: number;
  time: number;
  hints: number;
  mistakes: number;
}

export interface LugarSave {
  v: 1;
  /** próxima fase liberada (índice 0-based) */
  unlocked: number;
  /** estrelas por fase: bitmask (1 sem erros, 2 sem dicas, 4 rapidinho) + 8 = concluída */
  stars: Record<number, number>;
  /** melhor tempo por fase (s) */
  times: Record<number, number>;
  solved: number;
  zenSolved: number;
  /** desafio do dia */
  dailyDay: number;
  dailyStreak: number;
  dailyBestStreak: number;
  dailyTime: number;
  /** dicas grátis: dia + usadas hoje + extras ganhas com vídeo */
  hintDay: number;
  hintUsed: number;
  hintBonus: number;
  /** preferências */
  autoX: boolean;
  input: InputMode;
  patterns: boolean;
  infinite: boolean;
  zenSize: number;
  tutorial: boolean;
  /** partida em andamento */
  prog: Progress | null;
}

const KEY = 'bw-lugar';
let cache: LugarSave | null = null;

const fresh = (): LugarSave => ({
  v: 1,
  unlocked: 0,
  stars: {},
  times: {},
  solved: 0,
  zenSolved: 0,
  dailyDay: 0,
  dailyStreak: 0,
  dailyBestStreak: 0,
  dailyTime: 0,
  hintDay: 0,
  hintUsed: 0,
  hintBonus: 0,
  autoX: true,
  input: 'cycle',
  patterns: false,
  infinite: false,
  zenSize: 8,
  tutorial: false,
  prog: null,
});

export function lugarSave(): LugarSave {
  if (cache) return cache;
  const s = fresh();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw) as Partial<LugarSave>;
      Object.assign(s, o);
      if (!s.stars || typeof s.stars !== 'object') s.stars = {};
      if (!s.times || typeof s.times !== 'object') s.times = {};
      if (s.input !== 'cycle' && s.input !== 'double') s.input = 'cycle';
    }
  } catch {
    /* save corrompido: começa de novo */
  }
  cache = s;
  return s;
}

export function persistLugar(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(lugarSave()));
  } catch {
    /* sem espaço */
  }
}

export const FREE_HINTS = 3;
/** dicas que ainda dá para usar hoje */
export function hintsLeft(): number {
  const s = lugarSave();
  const d = dayNumber();
  if (s.hintDay !== d) {
    s.hintDay = d;
    s.hintUsed = 0;
  }
  return Math.max(0, FREE_HINTS - s.hintUsed) + s.hintBonus;
}
export function spendHint(): void {
  const s = lugarSave();
  hintsLeft();
  if (s.hintUsed < FREE_HINTS) s.hintUsed++;
  else s.hintBonus = Math.max(0, s.hintBonus - 1);
  persistLugar();
}

export const starCount = (mask: number): number => ((mask & 1) ? 1 : 0) + ((mask & 2) ? 1 : 0) + ((mask & 4) ? 1 : 0);
export function totalStars(): number {
  const s = lugarSave();
  let n = 0;
  for (const k in s.stars) n += starCount(s.stars[k]);
  return n;
}
