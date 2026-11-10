/* ============================================================
 *  LENHADORES — painel "Controles" dentro do jogo.
 *  As preferências são as compartilhadas (src/ui/touch: analógico
 *  flutuante/fixo, tamanho, posição, sensibilidade, canhoto...).
 * ============================================================ */
import { t } from '../../i18n';
import { isSolo, renderControlsSettings, setSolo, soloToggle } from '../../ui/touch';

/** ícone de engrenagem (configurações de controle) */
export const GEAR_SVG = (size = 24): string =>
  `<svg class="ico" viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true"><path d="M21 4h6l1 6 4 2 5-4 4 4-4 5 2 4 6 1v6l-6 1-2 4 4 5-4 4-5-4-4 2-1 6h-6l-1-6-4-2-5 4-4-4 4-5-2-4-6-1v-6l6-1 2-4-4-5 4-4 5 4 4-2z" fill="#d8e0f0" stroke="#2a0b5c" stroke-width="3" stroke-linejoin="round"/><circle cx="24" cy="24" r="6" fill="#8a5cff" stroke="#2a0b5c" stroke-width="3"/></svg>`;

export const PAW_SVG = (size = 24): string =>
  `<svg class="ico" viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true"><ellipse cx="24" cy="31" rx="11" ry="9" fill="#ffb347" stroke="#2a0b5c" stroke-width="3"/><circle cx="12" cy="18" r="5" fill="#ffb347" stroke="#2a0b5c" stroke-width="3"/><circle cx="20" cy="11" r="5" fill="#ffb347" stroke="#2a0b5c" stroke-width="3"/><circle cx="29" cy="11" r="5" fill="#ffb347" stroke="#2a0b5c" stroke-width="3"/><circle cx="37" cy="18" r="5" fill="#ffb347" stroke="#2a0b5c" stroke-width="3"/></svg>`;

/** abre/fecha o painel de Controles (sobre o jogo, fora das bordas) */
export function openControls(root: HTMLElement, onSolo?: (solo: boolean) => void): void {
  const old = root.querySelector('.fl-ctlpanel');
  if (old) {
    old.remove();
    return;
  }
  const m = document.createElement('div');
  m.className = 'fl-ctlpanel';
  m.dataset.touchIgnore = '1';
  m.innerHTML = `<div class="hd"><b>${t('floresta.ctl.title', 'Controles')}</b><button class="x" data-close="1">✕</button></div><div class="bd"></div>`;
  const bd = m.querySelector('.bd') as HTMLElement;
  if (onSolo) {
    const st = soloToggle('floresta', onSolo, t('floresta.soloSub', 'Sem ajudantes nem bots'));
    st.dataset.touchIgnore = '1';
    m.insertBefore(st, bd);
  }
  renderControlsSettings(bd);
  m.addEventListener('pointerdown', (e) => e.stopPropagation());
  m.addEventListener('click', (e) => {
    e.stopPropagation();
    if ((e.target as HTMLElement).closest('[data-close]')) m.remove();
  });
  root.appendChild(m);
}

export const forestSolo = (): boolean => isSolo('floresta');
export const setForestSolo = (on: boolean): void => setSolo('floresta', on);
