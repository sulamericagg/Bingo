/* ============================================================
 *  PASSE ESTELAR — ponto de entrada para o lead.
 *    import { registerPass } from './pass/register';
 *    registerPass();   // na abertura do app, depois de initBilling()
 *  Registra o painel 'pass' (navOrder 1) e liga XP/desafios/pop-ups.
 *  A tela e a arte são carregadas sob demanda (dynamic import).
 * ============================================================ */
import { bus } from '../core/events';
import { registerPanel } from '../hub/registry';
import { t } from '../i18n';
import { claimableCount, currentTheme, startPass } from './state';

export { currentTheme, runXp, isPremium, passLevel } from './state';

/** Abre a tela do passe (aba opcional: 'rewards' | 'weekly' | 'history' | 'club'). */
export function openPass(tab?: 'rewards' | 'weekly' | 'history' | 'club'): void {
  import('./ui').then((m) => m.openPassUI(tab));
}

/** Folha do Clube Bloop (para a loja abrir direto). */
export function openClub(): void {
  import('./ui').then((m) => m.openClubSheet());
}

/** Medidor "vídeos = tempo sem anúncios" para montar na loja. */
export function mountAdFreeMeter(el: HTMLElement): void {
  import('./ui').then((m) => m.mountAdFreeMeter(el));
}

/** Faixa da temporada para a loja (arte + chamada), abre o passe ao tocar. */
export function mountSeasonBanner(el: HTMLElement): void {
  import('./announce').then((m) => m.seasonBanner(el));
}

let done = false;
export function registerPass(): void {
  if (done) return;
  done = true;
  startPass();
  registerPanel({
    id: 'pass',
    get label() {
      return t('pass.nav', 'Passe');
    },
    icon: 'star',
    navOrder: 20,
    open: () => openPass(),
    badge: () => claimableCount(),
  });
  // pop-up da temporada (1x por temporada) e "últimos 3 dias" — depois da abertura
  setTimeout(() => import('./announce').then((m) => m.maybeAnnounce()), 2500);
  bus.on('pass-open', (tab?: 'rewards' | 'weekly' | 'history' | 'club') => openPass(tab));
}

void currentTheme;
