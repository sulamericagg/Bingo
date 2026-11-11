/* ============================================================
 *  NATUREZA — orçamento por nível (src/core/quality.ts: 0 Mínimo … 3 Alto).
 *  Mínimo: sem lâminas (só a textura de grama no chão), sombras de contato.
 * ============================================================ */
import type { Tier } from '../../core/quality';
import type { GrassQ } from './grass';

export interface NatureQ {
  /** grama de lâminas (null = só o chão texturizado) */
  grass: GrassQ | null;
  /** sombras de contato borradas sob árvores/pedras */
  blobs: boolean;
  /** opacidade das sombras de contato */
  blobAlpha: number;
  /** textura de detalhe do chão: 2ª amostra (manchas grandes) */
  macro: boolean;
  /** fração das plantinhas (flores, samambaias, arbustos) */
  deco: number;
}

export function natureQ(tier: Tier): NatureQ {
  switch (tier) {
    case 0:
      return { grass: null, blobs: true, blobAlpha: 0.4, macro: false, deco: 0.35 };
    case 1:
      return { grass: { density: 4, dist: 15, segs: 1, width: 0.07, height: 0.9 }, blobs: true, blobAlpha: 0.4, macro: true, deco: 0.6 };
    case 2:
      return { grass: { density: 9, dist: 22, segs: 2, width: 0.055, height: 0.95 }, blobs: true, blobAlpha: 0.38, macro: true, deco: 0.85 };
    default:
      return { grass: { density: 14, dist: 30, segs: 2, width: 0.05, height: 1 }, blobs: true, blobAlpha: 0.26, macro: true, deco: 1 };
  }
}
