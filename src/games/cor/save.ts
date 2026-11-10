/* PINTOU, GANHOU! — progresso local (localStorage 'bw-cor', aditivo e tolerante). */
export interface CorRecord {
  score: number;
  mode: 'duel' | 'practice' | 'daily';
  day: number;
}
export interface CorSave {
  v: 1;
  xp: number;
  games: number;
  wins: number;
  picks: number;
  perfects: number;
  bestAcc: number;
  bestStreak: number;
  /** desafio do dia */
  dailyDay: number;
  dailyScore: number;
  dailyBest: number;
  dailyStreak: number;
  /** itens já vistos (álbum) */
  seen: number[];
  records: CorRecord[];
  /** preferências */
  humans: number;
  bots: number;
  level: number;
  items: number;
  sets: number;
  hints: boolean;
  showTarget: boolean;
  noTimer: boolean;
  cat: string;
}
const KEY = 'bw-cor';
let cache: CorSave | null = null;

const fresh = (): CorSave => ({
  v: 1, xp: 0, games: 0, wins: 0, picks: 0, perfects: 0, bestAcc: 0, bestStreak: 0,
  dailyDay: 0, dailyScore: 0, dailyBest: 0, dailyStreak: 0, seen: [], records: [],
  humans: 1, bots: 2, level: 1, items: 5, sets: 3, hints: false, showTarget: false, noTimer: false, cat: '',
});

export function corSave(): CorSave {
  if (cache) return cache;
  const s = fresh();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw) as Partial<CorSave>;
      Object.assign(s, o);
      if (!Array.isArray(s.seen)) s.seen = [];
      if (!Array.isArray(s.records)) s.records = [];
    }
  } catch {
    /* save corrompido: começa de novo */
  }
  cache = s;
  return s;
}
export function persistCor(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(corSave()));
  } catch {
    /* sem espaço */
  }
}

/** nível a partir do XP: cada nível pede um pouco mais */
export function levelOf(xp: number): { lv: number; cur: number; need: number } {
  let lv = 1;
  let need = 120;
  let rest = Math.max(0, Math.floor(xp));
  while (rest >= need) {
    rest -= need;
    lv++;
    need = Math.round(need * 1.15 + 20);
  }
  return { lv, cur: rest, need };
}

export function addRecord(r: CorRecord): number {
  const s = corSave();
  s.records.push(r);
  s.records.sort((a, b) => b.score - a.score);
  s.records = s.records.slice(0, 10);
  return s.records.indexOf(r);
}
