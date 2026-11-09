/* ============================================================
 *  RALLY LUNAR — registro no hub. Leve: o jogo é importado sob demanda.
 * ============================================================ */
import { t } from '../../i18n';
import { registerGame } from '../../hub/registry';

const INK = '#2a0b5c';

/** altura do morro da vitrine (px) */
function hill(x: number, h: number): number {
  return h * 0.74 - Math.sin(x * 0.012) * h * 0.07 - Math.sin(x * 0.031 + 1) * h * 0.03;
}

/** Vitrine: carrinho quicando sobre morros, céu laranja-poeira com planeta turquesa. */
function drawShowcase(x: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  const sky = x.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#ff9a5a');
  sky.addColorStop(1, '#ffe0b0');
  x.fillStyle = sky;
  x.fillRect(0, 0, w, h);
  // planeta
  const pr = Math.min(w, h) * 0.13;
  x.fillStyle = '#2fb7b0';
  x.beginPath();
  x.arc(w * 0.78, h * 0.24, pr, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = 'rgba(255,255,255,.55)';
  x.lineWidth = pr * 0.12;
  x.beginPath();
  x.ellipse(w * 0.78, h * 0.24, pr * 1.6, pr * 0.35, -0.3, 0, Math.PI * 2);
  x.stroke();
  // morros ao fundo
  const scroll = t * 90;
  x.fillStyle = '#e38b4f';
  x.beginPath();
  x.moveTo(0, h);
  for (let i = 0; i <= 24; i++) {
    const px = (i / 24) * w;
    x.lineTo(px, h * 0.6 - Math.sin((px + scroll * 0.3) * 0.01) * h * 0.06);
  }
  x.lineTo(w, h);
  x.fill();
  // chão
  x.fillStyle = '#c46a35';
  x.strokeStyle = INK;
  x.lineWidth = 4;
  x.beginPath();
  x.moveTo(0, h);
  for (let i = 0; i <= 40; i++) {
    const px = (i / 40) * w;
    x.lineTo(px, hill(px + scroll, h));
  }
  x.lineTo(w, h);
  x.closePath();
  x.fill();
  x.beginPath();
  for (let i = 0; i <= 40; i++) {
    const px = (i / 40) * w;
    if (i) x.lineTo(px, hill(px + scroll, h));
    else x.moveTo(px, hill(px + scroll, h));
  }
  x.stroke();
  x.strokeStyle = '#ffd28a';
  x.lineWidth = 2.5;
  x.stroke();
  // carrinho
  const s = Math.min(w, h) / 9;
  const cx = w * 0.42;
  const a = hill(cx - s + scroll, h);
  const b = hill(cx + s + scroll, h);
  const bounce = Math.max(0, Math.sin(t * 5)) ** 2 * s * 0.3;
  const cy = (a + b) / 2 - s * 0.86 - bounce;
  const ang = Math.atan2(b - a, 2 * s) + Math.sin(t * 5) * 0.06;
  x.save();
  x.translate(cx, cy);
  x.rotate(ang);
  // motorista (bolinha rosa)
  x.fillStyle = INK;
  x.beginPath();
  x.arc(-s * 0.05, -s * 0.62, s * 0.42, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#ff8fd8';
  x.beginPath();
  x.arc(-s * 0.05, -s * 0.62, s * 0.35, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = INK;
  x.beginPath();
  x.arc(s * 0.05, -s * 0.68, s * 0.06, 0, Math.PI * 2);
  x.arc(s * 0.22, -s * 0.68, s * 0.06, 0, Math.PI * 2);
  x.fill();
  // carroceria
  x.fillStyle = '#ff8a3d';
  x.strokeStyle = INK;
  x.lineWidth = Math.max(2, s * 0.08);
  x.lineJoin = 'round';
  x.beginPath();
  x.roundRect(-s * 1.3, -s * 0.32, s * 2.6, s * 0.62, s * 0.25);
  x.fill();
  x.stroke();
  x.fillStyle = '#2fb7b0';
  x.beginPath();
  x.roundRect(-s * 1, -s * 0.05, s * 2, s * 0.14, s * 0.07);
  x.fill();
  // rodas
  for (const wx of [-s * 0.95, s * 0.95]) {
    x.fillStyle = INK;
    x.beginPath();
    x.arc(wx, s * 0.45, s * 0.42, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#ffd36b';
    x.beginPath();
    x.arc(wx, s * 0.45, s * 0.2, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = INK;
    x.lineWidth = s * 0.06;
    x.beginPath();
    const r = t * 12;
    x.moveTo(wx + Math.cos(r) * s * 0.2, s * 0.45 + Math.sin(r) * s * 0.2);
    x.lineTo(wx - Math.cos(r) * s * 0.2, s * 0.45 - Math.sin(r) * s * 0.2);
    x.stroke();
  }
  x.restore();
}

export function registerRally(): void {
  registerGame({
    id: 'rally',
    get name() {
      return t('rally.name', 'Rally Lunar');
    },
    get tagline() {
      return t('rally.tagline', 'Acelere pelas colinas e vá o mais longe possível!');
    },
    icon: 'car',
    theme: { bg: ['#ff9a5a', '#1d6f74'], accent: '#ff8a3d', accent2: '#2fb7b0', title: ['#ffe0b0', '#ff8a3d'] },
    drawShowcase,
    online: true,
    async launch(root, exit) {
      const m = await import('./game');
      return m.launchRally(root, exit);
    },
  });
}
