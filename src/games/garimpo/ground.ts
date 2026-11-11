/* ============================================================
 *  GARIMPO BRUTO — aparência do chão (interface pequena e trocável).
 *  Hoje: cor por vértice (terra vermelha, grama, lama, estrada, areia, umidade)
 *  × detalhe projetado do módulo de natureza (groundDetail). Quando a biblioteca
 *  de texturas compartilhada (src/3d/nature/textures.ts) chegar, troca só aqui.
 * ============================================================ */
import type * as THREE from 'three';
import { groundDetail } from '../../3d/nature';

export function applyGroundLook(mat: THREE.Material, macro = true): void {
  groundDetail(mat, { amount: 0.62, scale: 0.42, macro });
}
