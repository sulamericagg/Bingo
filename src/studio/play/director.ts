/* ============================================================
 *  BLOOP ENGINE — GameDirector: fluxo do jogo acima do PlaySession
 *  (modo, cena de abertura, fases, Historinha com save, fim de jogo, HUD).
 *  STUB do W0: dono = W1 (docs/ENGINE-PLANO.md §2.2). Mantém a assinatura.
 * ============================================================ */
import type { Creation } from '../format';
import type { Studio } from '../studio';
import type { PlayMode } from './hooks';

/**
 * Começa um JOGO v4 no modo pedido. true = o diretor assumiu;
 * false = não é com ele (ou ainda não existe) → o Studio usa o startPlay() de sempre.
 */
export async function startGame(_s: Studio, _doc: Creation, _mode: PlayMode): Promise<boolean> {
  return false;
}
