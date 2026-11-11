/* ============================================================
 *  GARIMPO BRUTO — aparência do chão (interface pequena e trocável).
 *  Usa a biblioteca compartilhada src/3d/nature/textures.ts: material de terreno com
 *  camadas misturadas por pesos por vértice (terra vermelha, grama, chão de mata,
 *  lama, cascalho, pedra, areia) projetadas no mundo; a cor por vértice dá o tom.
 * ============================================================ */
import type * as THREE from 'three';
import { NL, TL, lerpSplat, terrainMaterial } from '../../3d/nature';

export { NL, TL, lerpSplat };

/** material do terreno para o nível de qualidade */
export function groundMaterial(tier: number): THREE.MeshLambertMaterial {
  return terrainMaterial({ tier });
}
