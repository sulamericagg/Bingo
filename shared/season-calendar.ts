/**
 * Calendário das temporadas do Passe SEM dependências (roda no Worker e no app).
 * Réplica exata da fórmula de src/creatures/seasons.ts: 60 temporadas mensais,
 * a s00 começa em 1º/dez/2026 00:00 (Brasília = 03:00 UTC). Se mudar lá, mude aqui.
 */
export const SEASON_COUNT = 60;

export interface SeasonWindow {
  index: number;
  id: string;
  start: number; // ms
  end: number; // ms (exclusivo)
}

export function seasonWindow(i: number): SeasonWindow | null {
  if (!Number.isInteger(i) || i < 0 || i >= SEASON_COUNT) return null;
  const at = (k: number) => Date.UTC(2026 + Math.floor((11 + k) / 12), (11 + k) % 12, 1, 3, 0, 0);
  return { index: i, id: `s${String(i).padStart(2, '0')}`, start: at(i), end: at(i + 1) };
}

/** Temporada vigente em `ms` (null antes de dez/2026 ou depois de nov/2031). */
export function seasonIndexAt(ms = Date.now()): number | null {
  for (let i = 0; i < SEASON_COUNT; i++) {
    const w = seasonWindow(i)!;
    if (ms >= w.start && ms < w.end) return i;
  }
  return null;
}

/** Próxima temporada a começar depois de `ms`. */
export function nextSeasonIndex(ms = Date.now()): number | null {
  for (let i = 0; i < SEASON_COUNT; i++) if (seasonWindow(i)!.start > ms) return i;
  return null;
}
