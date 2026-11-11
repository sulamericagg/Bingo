/**
 * Registro do minigame "Queda Giratória" no hub.
 * Só a vitrine (leve) entra no pacote principal; o jogo é carregado sob demanda.
 */
import { registerGame } from '../../hub/registry';
import { registerDuelGame } from '../../party/duel-link';
import { t } from '../../i18n';
import { drawTuboShowcase } from './showcase';

export function registerTubo(): void {
  registerDuelGame('tubo'); // grupo/links: duelo online (src/party/duel.ts)
  registerGame({
    id: 'tubo',
    get name() {
      return t('tubo.name', 'Queda Giratória');
    },
    get tagline() {
      return t('tubo.tagline', 'Mergulhe pelas aberturas e fuja do vermelho!');
    },
    icon: 'target',
    theme: {
      bg: ['#ffc07a', '#ff5e8a'],
      accent: '#ff7a45',
      accent2: '#ffd166',
      title: ['#fff6d6', '#ffc15e'],
    },
    drawShowcase: drawTuboShowcase,
    async launch(root, exit) {
      const m = await import('./game');
      return m.launch(root, exit);
    },
  });
}
