/* ============================================================
 *  MONTA & LEVA — registro no hub. Leve: o jogo (e o planck.js) é importado sob demanda.
 *  Vitrine: carrinho geométrico levando uma caixa sobre lombadas.
 * ============================================================ */
import { t } from '../../i18n';
import { registerGame } from '../../hub/registry';

function drawShowcase(x: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#f7f9fc');
  g.addColorStop(1, '#e4e9f1');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  const s = Math.min(w, h) / 9;
  // grade de pontos
  x.fillStyle = '#d5dce6';
  for (let gx = (-(time * s * 1.2) % s) + s / 2; gx < w; gx += s) for (let gy = s / 2; gy < h; gy += s) x.fillRect(gx - 1, gy - 1, 2, 2);
  // chão ondulado rolando
  const base = h * 0.72;
  const hy = (px: number) => base - Math.max(0, Math.sin((px + time * s * 1.6) / (s * 1.6))) * s * 0.5;
  x.beginPath();
  x.moveTo(0, h);
  for (let px = 0; px <= w; px += 4) x.lineTo(px, hy(px));
  x.lineTo(w, h);
  x.closePath();
  x.fillStyle = '#dde3eb';
  x.fill();
  x.strokeStyle = '#8f9bad';
  x.lineWidth = 3;
  x.beginPath();
  for (let px = 0; px <= w; px += 4) px === 0 ? x.moveTo(px, hy(px)) : x.lineTo(px, hy(px));
  x.stroke();
  // carrinho
  const cx = w * 0.5;
  const r = s * 0.42;
  const yA = hy(cx - s * 1.2) - r;
  const yB = hy(cx + s * 1.2) - r;
  const ang = Math.atan2(yB - yA, s * 2.4);
  x.save();
  x.translate(cx, (yA + yB) / 2);
  x.rotate(ang);
  const blk = (bx: number, by: number, f: string, d: string) => {
    x.fillStyle = f;
    x.strokeStyle = d;
    x.lineWidth = 2.5;
    x.beginPath();
    x.roundRect(bx, by, s * 0.8, s * 0.8, s * 0.12);
    x.fill();
    x.stroke();
  };
  blk(-s * 1.6, -s * 1.0, '#f59a32', '#c46a10');
  blk(-s * 0.8, -s * 1.0, '#5d6573', '#323844');
  blk(0, -s * 1.0, '#f59a32', '#c46a10');
  blk(s * 0.8, -s * 1.0, '#f59a32', '#c46a10');
  // caixa de carga
  x.fillStyle = '#c98b52';
  x.strokeStyle = '#7d5129';
  x.beginPath();
  x.roundRect(-s * 0.4, -s * 1.85, s * 0.8, s * 0.8, s * 0.12);
  x.fill();
  x.stroke();
  for (const wx of [-s * 1.2, s * 1.2]) {
    x.save();
    x.translate(wx, -s * 0.2);
    x.rotate(time * 5);
    x.fillStyle = '#202227';
    x.beginPath();
    x.arc(0, 0, r, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#d9dde3';
    x.beginPath();
    x.arc(0, 0, r * 0.6, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = '#3a3f48';
    x.lineWidth = 2;
    x.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      x.moveTo(0, 0);
      x.lineTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5);
    }
    x.stroke();
    x.restore();
  }
  x.restore();
}

export function registerMontaLeva(): void {
  registerGame({
    id: 'montaleva',
    get name() {
      return t('ml.name', 'Monta & Leva');
    },
    get tagline() {
      return t('ml.tagline', 'Monte o veículo. Entregue a carga.');
    },
    icon: 'car',
    theme: { bg: ['#5b8def', '#2fbf8f'], accent: '#2fbf8f', accent2: '#ffb547', title: ['#ffffff', '#e9fff6'] },
    drawShowcase,
    async launch(root, exit) {
      const m = await import('./game');
      return m.launch(root, exit);
    },
  });
}
