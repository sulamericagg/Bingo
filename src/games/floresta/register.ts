/* Registro do minigame "Lenhadores do Bosque" no hub.
 * Só a vitrine (leve) entra no pacote principal; o jogo é carregado sob demanda. */
import { registerGame, type MiniGameHandle } from '../../hub/registry';
import { t } from '../../i18n';

export function registerFloresta(): void {
  registerGame({
    id: 'floresta',
    get name() {
      return t('floresta.name', 'Lenhadores do Bosque');
    },
    get tagline() {
      return t('floresta.tagline', 'Corte, serre, replante e cresça seu bosque!');
    },
    icon: 'heart',
    theme: { bg: ['#7ad86a', '#1f6a3a'], accent: '#ff8a3a', accent2: '#ffd34a', title: ['#fff6d6', '#ffd34a'] },
    drawShowcase,
    online: true,
    async launch(root: HTMLElement, exit: () => void): Promise<MiniGameHandle> {
      const m = await import('./game');
      return m.launch(root, exit);
    },
  });
}

/* ------------------------------ vitrine ------------------------------ */

const TAU = Math.PI * 2;

/** Cena curta: o Bloop dá machadadas, a árvore tomba e uma muda nasce no lugar. */
export function drawShowcase(x: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  const cyc = time % 5; // 0..5 s
  const gy = h * 0.8;
  const sky = x.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#7cc8ff');
  sky.addColorStop(0.75, '#d6f4ff');
  sky.addColorStop(1, '#eaffd9');
  x.fillStyle = sky;
  x.fillRect(0, 0, w, h);
  // morros
  x.fillStyle = '#8fd27a';
  x.beginPath();
  x.moveTo(0, gy);
  for (let i = 0; i <= 20; i++) x.lineTo((i / 20) * w, gy - h * 0.12 - Math.sin(i * 0.9 + 1) * h * 0.05);
  x.lineTo(w, gy);
  x.fill();
  // árvores de fundo
  for (let i = 0; i < 5; i++) tree(x, w * (0.08 + i * 0.22), gy - h * 0.04, h * 0.3, '#4fae5a', '#7a4a2a', 0);
  x.fillStyle = '#7a5233';
  x.fillRect(0, gy, w, h - gy);
  x.fillStyle = '#6cc24a';
  x.fillRect(0, gy - 3, w, h * 0.03);
  // árvore principal
  const tx = w * 0.62;
  const fall = cyc < 1.8 ? 0 : Math.min(Math.PI / 2, Math.pow((cyc - 1.8) / 0.9, 2) * (Math.PI / 2));
  const shake = cyc < 1.8 ? Math.sin(time * 40) * 0.02 * (Math.sin(cyc * 7) > 0 ? 1 : 0) : 0;
  if (cyc < 3.6) {
    x.save();
    x.translate(tx, gy);
    x.rotate(fall + shake);
    tree(x, 0, 0, h * 0.55, '#5cc24a', '#9a6a3c', 1);
    x.restore();
  } else {
    // toras e muda nova
    for (let i = 0; i < 3; i++) {
      x.fillStyle = '#9a6a3c';
      x.beginPath();
      x.ellipse(tx + h * 0.1 + i * h * 0.13, gy - h * 0.04, h * 0.06, h * 0.035, 0, 0, TAU);
      x.fill();
      x.fillStyle = '#f3d9a8';
      x.beginPath();
      x.arc(tx + h * 0.15 + i * h * 0.13, gy - h * 0.04, h * 0.025, 0, TAU);
      x.fill();
    }
    const g = Math.min(1, (cyc - 3.6) / 1.2);
    tree(x, tx, gy, h * 0.18 * g + 2, '#7aff8a', '#9a6a3c', 0);
  }
  x.fillStyle = '#c9b89a';
  x.fillRect(tx - h * 0.025, gy - h * 0.03, h * 0.05, h * 0.03);
  // Bloop com machado
  const bx = w * 0.42;
  const r = h * 0.09;
  const swing = cyc < 1.8 ? Math.max(0, Math.sin(cyc * 7)) : 0;
  const by = gy - r - (cyc > 2.6 && cyc < 3.6 ? Math.abs(Math.sin(time * 8)) * h * 0.06 : 0);
  x.save();
  x.translate(bx + r * 0.8, by);
  x.rotate(-1.2 + swing * 1.7);
  x.fillStyle = '#8a5228';
  x.fillRect(-r * 0.08, -r * 1.5, r * 0.16, r * 1.5);
  x.fillStyle = '#dcd6f0';
  x.beginPath();
  x.moveTo(0, -r * 1.5);
  x.quadraticCurveTo(r * 0.8, -r * 1.55, r * 0.7, -r * 0.9);
  x.lineTo(0, -r * 1.05);
  x.fill();
  x.restore();
  x.fillStyle = '#2a0b5c';
  x.beginPath();
  x.arc(bx, by, r + 2, 0, TAU);
  x.fill();
  x.fillStyle = '#ff8fd8';
  x.beginPath();
  x.arc(bx, by, r, 0, TAU);
  x.fill();
  x.fillStyle = '#fff';
  x.beginPath();
  x.arc(bx + r * 0.05, by - r * 0.15, r * 0.24, 0, TAU);
  x.arc(bx + r * 0.6, by - r * 0.15, r * 0.24, 0, TAU);
  x.fill();
  x.fillStyle = '#2a1140';
  x.beginPath();
  x.arc(bx + r * 0.12, by - r * 0.12, r * 0.12, 0, TAU);
  x.arc(bx + r * 0.67, by - r * 0.12, r * 0.12, 0, TAU);
  x.fill();
  // lascas
  if (swing > 0.8) {
    x.fillStyle = '#ffe2b0';
    for (let i = 0; i < 5; i++) x.fillRect(tx - h * 0.04 - i * 5, gy - h * 0.12 - ((i * 7 + time * 90) % 20), 4, 3);
  }
}

function tree(x: CanvasRenderingContext2D, px: number, py: number, hh: number, leaf: string, trunk: string, out: number): void {
  x.fillStyle = trunk;
  x.fillRect(px - hh * 0.05, py - hh * 0.55, hh * 0.1, hh * 0.55);
  if (out) {
    x.fillStyle = '#2a0b5c';
    x.beginPath();
    x.arc(px, py - hh * 0.72, hh * 0.27, 0, TAU);
    x.arc(px - hh * 0.18, py - hh * 0.58, hh * 0.19, 0, TAU);
    x.arc(px + hh * 0.18, py - hh * 0.58, hh * 0.19, 0, TAU);
    x.fill();
  }
  x.fillStyle = leaf;
  x.beginPath();
  x.arc(px, py - hh * 0.72, hh * 0.25, 0, TAU);
  x.arc(px - hh * 0.18, py - hh * 0.58, hh * 0.17, 0, TAU);
  x.arc(px + hh * 0.18, py - hh * 0.58, hh * 0.17, 0, TAU);
  x.fill();
}
