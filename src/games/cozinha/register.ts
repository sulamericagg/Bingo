/* ============================================================
 *  COZINHA MALUCA — registro no hub (leve: o jogo carrega sob demanda).
 * ============================================================ */
import { registerGame } from '../../hub/registry';
import { t } from '../../i18n';
import { drawCozinhaShowcase } from './showcase';

export function registerCozinha(): void {
  registerGame({
    id: 'cozinha',
    get name() {
      return t('cozinha.name', 'Cozinha Maluca');
    },
    get tagline() {
      return t('cozinha.tagline', 'Cozinhe com amigos, cresça o restaurante e apague os incêndios!');
    },
    icon: 'food',
    theme: {
      bg: ['#ffb36b', '#ff5a7a'],
      accent: '#ff7a2e',
      accent2: '#ffd84a',
      title: ['#fff6d6', '#ffd27a'],
    },
    drawShowcase: drawCozinhaShowcase,
    online: true,
    async launch(root, exit) {
      const m = await import('./game');
      return m.launch(root, exit);
    },
  });
}
