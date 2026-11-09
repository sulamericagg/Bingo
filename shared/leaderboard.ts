/** Ranking global — tipos e regras compartilhadas entre o Worker e o jogo. */

export type LbScope = 'all' | 'week';

export interface LbRow {
  rank: number;
  name: string;
  score: number;
  skin: string;
  /** a linha é do jogador que pediu (?me=<id>) */
  me?: boolean;
}

export interface LbResponse {
  scope: LbScope;
  week: string;
  total: number;
  entries: LbRow[];
  me: { rank: number; score: number; name: string; skin: string } | null;
}

/** Semana ISO no horário de Brasília (UTC−3), ex.: "2026-W46". Vira na segunda 00:00. */
export function isoWeek(ms = Date.now()): string {
  const d = new Date(ms - 3 * 3600_000);
  const day = (d.getUTCDay() + 6) % 7; // seg = 0
  const th = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3));
  const y = th.getUTCFullYear();
  const week = 1 + Math.floor((th.getTime() - Date.UTC(y, 0, 1)) / (7 * 86400_000));
  return `${y}-W${String(week).padStart(2, '0')}`;
}

/** Máximo plausível para uma partida de `durSec` segundos (≤ ~4 pontos por planeta, ≥ 0,5 s por planeta). */
export const plausibleMax = (durSec: number) => Math.floor(20 + durSec * 8);
