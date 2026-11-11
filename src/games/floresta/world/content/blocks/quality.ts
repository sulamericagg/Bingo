/* ============================================================
 *  BLOCOS — orçamento por nível de qualidade (src/core/quality.ts: Tier 0..3).
 *  Puro (só números) para entrar no Worker e no benchmark.
 * ============================================================ */
import type { MeshOpts } from './mesher';

export interface BlockQuality {
  mesh: MeshOpts;
  /** textura procedural do atlas (senão só cor de vértice) */
  texture: boolean;
  /** ms por quadro para remontar malhas (main thread: montar job + subir buffers) */
  budgetMs: number;
  /** malha num Web Worker */
  worker: boolean;
  /** luzes pontuais reais para blocos que emitem luz (o resto é só brilho) */
  pointLights: number;
  /** raio (em pedaços de 16 m) a manter com malha */
  viewChunks: number;
}

export const BLOCK_QUALITY: Record<0 | 1 | 2 | 3, BlockQuality> = {
  0: { mesh: { bevel: false, smooth: 1, ao: true, greedy: true }, texture: false, budgetMs: 2, worker: true, pointLights: 0, viewChunks: 3 },
  1: { mesh: { bevel: true, smooth: 2, ao: true, greedy: true }, texture: true, budgetMs: 3, worker: true, pointLights: 2, viewChunks: 4 },
  2: { mesh: { bevel: true, smooth: 3, ao: true, greedy: true }, texture: true, budgetMs: 4, worker: true, pointLights: 4, viewChunks: 5 },
  3: { mesh: { bevel: true, smooth: 3, ao: true, greedy: true }, texture: true, budgetMs: 6, worker: true, pointLights: 8, viewChunks: 6 },
};
