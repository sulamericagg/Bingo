/* Progresso persistente do "Cava & Fala" (localStorage 'bw-cavafala'). */
import type { ThemeId } from './data';
import { GADGETS } from './gadgets';

export type Diff = 0 | 1 | 2;
export interface CavaSave {
  v: 1;
  /** tutorial guiado concluído */
  tut: boolean;
  /** receitas descobertas (aparecem no círculo) */
  found: string[];
  towns: Partial<Record<ThemeId, { best: number; stars: number }>>;
  arenaWins: number;
  arenaPlays: number;
  diff: Diff;
  bots: number;
  practice: boolean;
  lastTheme: ThemeId;
  /** pedidos de voz bem-sucedidos (estatística) */
  spoken: number;
}

const KEY = 'bw-cavafala';
let cache: CavaSave | null = null;

export function fresh(): CavaSave {
  return { v: 1, tut: false, found: GADGETS.filter((g) => g.starter).map((g) => g.id), towns: {}, arenaWins: 0, arenaPlays: 0, diff: 1, bots: 2, practice: false, lastTheme: 'pesca', spoken: 0 };
}

export function cavaSave(): CavaSave {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as Partial<CavaSave>) : null;
    cache = { ...fresh(), ...(s ?? {}) } as CavaSave;
  } catch {
    cache = fresh();
  }
  return cache;
}

export function persist(): void {
  try {
    if (cache) localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* sem armazenamento */
  }
}

export function discover(id: string): boolean {
  const s = cavaSave();
  if (s.found.includes(id)) return false;
  s.found.push(id);
  persist();
  return true;
}
