/* ============================================================
 *  CAMADA DE ENTRADA (teclado, mouse, controle, toque) — compartilhada pelo Studio e jogos futuros.
 *  STUB do W0: dono = W3 (docs/ENGINE-PLANO.md §2.6). Mantém a assinatura `createStudioInput`.
 *  O contrato (InputSource / InputFrame / InputButton) está em src/studio/play/hooks.ts.
 * ============================================================ */
import { noopInput, type InputSource } from '../../studio/play/hooks';

export interface StudioInputOptions {
  /** raiz do app (teclas/ponteiro) */
  root: HTMLElement;
  /** canvas do jogo (pointer lock) */
  canvas: HTMLCanvasElement;
}

/** STUB: entrada vazia — o Studio continua usando os controles que já tem. */
export function createStudioInput(_o: StudioInputOptions): InputSource {
  return noopInput();
}
