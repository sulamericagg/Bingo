/**
 * Painéis globais que já existiam no Orbit e viram itens da barra inferior do hub.
 * Outros agentes registram os seus (Passe, Bichinho, Social, Campeonatos, Coleção)
 * com registerPanel e navOrder entre estes números.
 */
import { itemsAffordable } from '../core/economy';
import { save } from '../core/storage';
import { t } from '../i18n';
import { openCreator } from '../ui/creator';
import type { UI } from '../ui/ui';
import { registerPanel } from './registry';

/** Ordem sugerida na barra: Loja 10 · Passe 20 · Bichinho 30 · Criar 40 · Social 50 · Campeonatos 60 · Coleção 70 · Ranking 80 */
export function registerCorePanels(ui: UI): void {
  registerPanel({
    id: 'shop',
    get label() {
      return t('nav.shop', 'Loja');
    },
    icon: 'bag',
    navOrder: 10,
    open: () => ui.open('shop', 'skins'),
    badge: () => itemsAffordable(),
  });
  registerPanel({
    id: 'creator',
    get label() {
      return t('nav.create', 'Criar');
    },
    icon: 'user',
    navOrder: 40,
    open: () => openCreator(),
    badge: () => (save.tips.creator ? 0 : t('nav.new', 'NOVO')),
  });
  registerPanel({
    id: 'ranking',
    get label() {
      return t('nav.ranking', 'Ranking');
    },
    icon: 'trophy',
    navOrder: 80,
    open: () => document.getElementById('btn-ranking')?.click(),
  });
}
