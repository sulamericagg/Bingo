/* ============================================================
 *  BLOOP ENGINE — modo foto (📷 / tecla P) + painel de capa.
 *  STUB do W0: dono = W5 (docs/ENGINE-PLANO.md §2.7). Mantém as assinaturas.
 * ============================================================ */
import type { Studio } from '../studio';
import type { PanelCtx } from '../ui/panels';

export interface PhotoShot {
  /** data URL (JPEG/WebP) */
  url: string;
  w: number;
  h: number;
}

/**
 * Abre o modo foto (pausa o jogo/editor, esconde o HUD, câmera livre).
 * Resolve com as fotos tiradas, ou null se o modo não existe/foi cancelado.
 * STUB: não faz nada (o Studio continua como antes).
 */
export async function openPhotoMode(_s: Studio, _from: 'edit' | 'play'): Promise<PhotoShot[] | null> {
  return null;
}

/** painel 'photo' (capa do jogo) */
export function renderPanel(_ctx: PanelCtx): void {
  /* W5 preenche */
}
