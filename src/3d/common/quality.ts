/* ============================================================
 *  Qualidade dos modos 3D (casa, cozinha): mapeia o nível automático
 *  de src/core/quality.ts (0 Mínimo … 3 Alto) para opções do three.js.
 * ============================================================ */
import { settingsFor, type Tier } from '../../core/quality';

export interface Q3 {
  tier: Tier;
  /** pixel ratio do renderer */
  pr: number;
  shadows: boolean;
  /** MeshStandardMaterial (senão Lambert, mais barato) */
  standard: boolean;
  /** corpos físicos acordados ao mesmo tempo */
  maxBodies: number;
  /** segmentos das caixas arredondadas */
  seg: number;
  pointLight: boolean;
  /** fração de partículas emitidas */
  particles: number;
}
export function q3For(tier: Tier): Q3 {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  // pixel ratio e sombras vêm de settingsFor (fonte única: src/core/quality.ts)
  const s = settingsFor(tier);
  const pr = Math.min(dpr, s.pr3d);
  const shadows = s.shadows;
  switch (tier) {
    case 0:
      return { tier, pr, shadows, standard: false, maxBodies: 6, seg: 1, pointLight: false, particles: 0.35 };
    case 1:
      return { tier, pr, shadows, standard: false, maxBodies: 10, seg: 1, pointLight: false, particles: 0.6 };
    case 2:
      return { tier, pr, shadows, standard: true, maxBodies: 16, seg: 2, pointLight: true, particles: 0.85 };
    default:
      return { tier, pr, shadows, standard: true, maxBodies: 24, seg: 2, pointLight: true, particles: 1 };
  }
}
