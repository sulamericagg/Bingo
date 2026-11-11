/* ============================================================
 *  Régua de dificuldade compartilhada pelo 2D e pelo 3D (docs/DISASTER-DESIGN.md §3).
 *  Arquivo pequeno de propósito: o 3D importa daqui sem puxar o jogo 2D inteiro.
 * ============================================================ */
import type { DisasterId } from './scenarios';

/** modo de dificuldade (escolhido na tela 2D/3D; docs/DISASTER-DESIGN.md §3) */
export type DzMode = 'facil' | 'normal' | 'dificil';
export const MODE_KEY = 'bo-disaster-diff';
export function loadMode(): DzMode {
  try {
    const m = localStorage.getItem(MODE_KEY);
    if (m === 'facil' || m === 'dificil') return m;
  } catch {
    /* */
  }
  return 'normal';
}
export const MODE_MUL: Record<DzMode, number> = { facil: 0.72, normal: 1, dificil: 1.3 };
/** intensidade: modo × (estrelas + sequência) — a mesma régua no 2D e no 3D */
export function intensityOf(mode: DzMode, stars: number, streak: number, training: boolean): number {
  return MODE_MUL[mode] * (0.85 + 0.1 * (stars - 1) + 0.035 * Math.min(12, Math.max(0, streak))) * (training ? 0.8 : 1);
}
/** desastres de fluido (combo = 1 fluido + 1 golpe) */
export const isFluidD = (d: DisasterId): boolean => d === 'tsunami' || d === 'enchente' || d === 'acido' || d === 'avalanche' || d === 'vulcao';

