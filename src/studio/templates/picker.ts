/* ============================================================
 *  BLOOP ENGINE — "Criar jogo": escolha de modelo (Corrida, Historinha, Pega-pega,
 *  Plataforma, Lojinha, Em branco) + tutorial guiado.
 *  STUB do W0: dono = W6 (docs/ENGINE-PLANO.md §2.9). Mantém as assinaturas.
 * ============================================================ */
import type { Studio } from '../studio';
import type { PanelCtx } from '../ui/panels';

/**
 * Mostra a escolha de modelos. true = cuidou de tudo (abriu um modelo/tutorial);
 * false = não existe ainda → o Studio cai no "novo mapa" de sempre.
 */
export async function openPicker(_s: Studio): Promise<boolean> {
  return false;
}

/** painel 'templates' */
export function renderPanel(_ctx: PanelCtx): void {
  /* W6 preenche */
}
