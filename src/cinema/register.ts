/* ============================================================
 *  BLOOP CINEMA — registro no hub (leve: o estúdio inteiro e a
 *  vitrine animada são carregados sob demanda).
 * ============================================================ */
import { t } from '../i18n';
import { registerGame, registerPanel } from '../hub/registry';

type Draw = (x: CanvasRenderingContext2D, w: number, h: number, t: number) => void;
let rich: Draw | null = null;
let asked = false;

function placeholder(x: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#2a0b5c');
  g.addColorStop(1, '#ff5cc8');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  // claquete
  x.save();
  x.translate(w / 2, h / 2);
  x.rotate(Math.sin(time * 2) * 0.05);
  x.fillStyle = '#1d0b48';
  x.fillRect(-w * 0.2, -h * 0.12, w * 0.4, h * 0.3);
  x.fillStyle = '#fff';
  for (let i = 0; i < 5; i++) x.fillRect(-w * 0.2 + i * w * 0.085, -h * 0.2, w * 0.04, h * 0.08);
  x.restore();
}

export function registerCinema(): void {
  // TV Bloop: canal ao vivo com os filmes aprovados (botão na barra do hub)
  registerPanel({
    id: 'tv',
    get label() {
      return t('tv.name', 'TV Bloop');
    },
    icon: 'video',
    navOrder: 65,
    open: () => void import('./tv').then((m) => m.openTv()),
  });
  registerGame({
    id: 'cinema',
    get name() {
      return t('cin.name', 'Bloop Cinema');
    },
    get tagline() {
      return t('cin.tagline', 'Crie filmes e novelinhas com seus Bloops — em 2D e 3D!');
    },
    icon: 'video',
    theme: { bg: ['#2a0b5c', '#ff5cc8'], accent: '#ff5cc8', accent2: '#ffd93b', title: ['#fff6d6', '#ffd93b'] },
    drawShowcase(x, w, h, time) {
      if (!rich && !asked) {
        asked = true;
        import('./showcase').then((m) => (rich = m.drawShowcase)).catch(() => {});
      }
      (rich ?? placeholder)(x, w, h, time);
    },
    async launch(root, exit) {
      const m = await import('./app');
      return m.launch(root, exit);
    },
  });
}
