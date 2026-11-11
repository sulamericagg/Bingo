/* ============================================================
 *  Ajudantes dos ganchos "// AUDIO" nos jogos (mantêm a linha no jogo curtinha).
 * ============================================================ */
import { play } from './sound';
import type { Material } from './index';

/**
 * Mundo/Floresta: material dominante de uma escavação (Map id-do-material → quantidade,
 * ids de src/games/floresta/world/vox.ts) → som de cavar desse material.
 */
const FLORESTA_MAT: Record<number, Material> = {
  1: 'dirt', 2: 'dirt', 3: 'dirt', 4: 'sand', 5: 'stone', 6: 'stone', 7: 'stone', 8: 'stone',
  9: 'stone', 10: 'stone', 11: 'stone', 12: 'stone', 13: 'glass', 14: 'glass', 15: 'snow',
};
export function digSound(counts: Map<number, number>, machine = false): void {
  let best = 0;
  let mat: Material = 'dirt';
  for (const [m, k] of counts)
    if (k > best && FLORESTA_MAT[m]) {
      best = k;
      mat = FLORESTA_MAT[m];
    }
  play(`floresta.${machine ? 'break' : 'dig'}_${mat}`);
}
