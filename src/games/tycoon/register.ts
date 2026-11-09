/* ============================================================
 *  FÁBRICA ESTELAR — registro no hub (leve: o jogo carrega sob demanda).
 * ============================================================ */
import { registerGame } from '../../hub/registry';
import { t } from '../../i18n';
import { idlePending } from './save';

/** Moedas prontas na Minha Fábrica (para badge do hub). 0 se nada a coletar. */
export function tycoonIdleReady(): number {
  try {
    return idlePending();
  } catch {
    return 0;
  }
}

const INK = '#2a0b5c';
const TAU = Math.PI * 2;

function star(x: CanvasRenderingContext2D, cx: number, cy: number, R: number, rot: number): void {
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot - Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? R * 0.48 : R;
    if (i) x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    else x.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  x.closePath();
}
function box(x: CanvasRenderingContext2D, a: number, b: number, w: number, h: number, r: number, fill: string, lw: number): void {
  x.beginPath();
  x.roundRect ? x.roundRect(a, b, w, h, r) : x.rect(a, b, w, h);
  x.lineWidth = lw;
  x.strokeStyle = INK;
  x.stroke();
  x.fillStyle = fill;
  x.fill();
}

const STAR_COLS = ['#ffd84a', '#5ef0ff', '#ff7ae0'];

/** Vitrine: esteira com extratores, polidor e estrelas andando (vetor simples, sem cache). */
export function drawTycoonShowcase(x: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  const S = Math.min(w / 6.2, h / 3.4);
  const cx = w / 2;
  const by = h * 0.62;
  const lw = Math.max(1.5, S * 0.05);
  x.save();
  // ilha
  x.beginPath();
  x.ellipse(cx, by + S * 0.55, S * 3.1, S * 0.75, 0, 0, TAU);
  x.fillStyle = '#5a3a7a';
  x.fill();
  x.beginPath();
  x.ellipse(cx, by + S * 0.3, S * 3.1, S * 0.7, 0, 0, TAU);
  x.lineWidth = lw;
  x.strokeStyle = INK;
  x.stroke();
  x.fillStyle = '#5fdc8c';
  x.fill();
  // esteira
  const x0 = cx - S * 2.4;
  const x1 = cx + S * 1.9;
  box(x, x0, by - S * 0.25, x1 - x0, S * 0.5, S * 0.18, '#4b3b7a', lw);
  x.save();
  x.beginPath();
  x.rect(x0, by - S * 0.25, x1 - x0, S * 0.5);
  x.clip();
  x.strokeStyle = 'rgba(255,216,74,0.55)';
  x.lineWidth = S * 0.06;
  const off = ((time * 1.2) % 0.5) * S;
  for (let px = x0 - S + off; px < x1; px += S * 0.5) {
    x.beginPath();
    x.moveTo(px, by - S * 0.15);
    x.lineTo(px + S * 0.13, by);
    x.lineTo(px, by + S * 0.15);
    x.stroke();
  }
  x.restore();
  // coletor
  box(x, x1 - S * 0.1, by - S * 0.6, S * 0.8, S * 0.9, S * 0.16, '#ffcf2e', lw);
  star(x, x1 + S * 0.3, by - S * 0.15, S * 0.18, 0);
  x.fillStyle = '#fff8d0';
  x.fill();
  // estrelas
  const span = x1 - x0;
  for (let i = 0; i < 6; i++) {
    const u = (time * 0.22 + i / 6) % 1;
    const sx = x0 + S * 0.3 + u * (span - S * 0.3);
    const tier = sx > cx + S * 0.6 ? 2 : sx > cx - S * 0.1 ? 1 : 0;
    star(x, sx, by - S * 0.05 + Math.sin(time * 3 + i) * S * 0.03, S * 0.17, time * 2 + i);
    x.lineWidth = lw * 0.8;
    x.strokeStyle = INK;
    x.stroke();
    x.fillStyle = STAR_COLS[tier];
    x.fill();
  }
  // extratores
  for (let k = 0; k < 2; k++) {
    const dx = x0 + S * (0.55 + k * 1.05);
    const sq = Math.max(0, Math.sin(time * 4 + k * 2)) * 0.08;
    const bw = S * 0.8 * (1 + sq);
    const bh = S * 0.75 * (1 - sq);
    box(x, dx - bw / 2, by - S * 0.35 - bh, bw, bh, S * 0.18, k ? '#3fb8ff' : '#3ee07a', lw);
    x.beginPath();
    x.arc(dx, by - S * 0.35 - bh / 2, S * 0.17, 0, TAU);
    x.fillStyle = '#1a1040';
    x.fill();
    star(x, dx, by - S * 0.35 - bh / 2, S * 0.1, 0);
    x.fillStyle = '#ffd84a';
    x.fill();
    x.beginPath();
    x.arc(dx, by - S * 0.45 - bh, S * 0.08, 0, TAU);
    x.fillStyle = (time * 2 + k) % 1 > 0.5 ? '#fff36b' : '#ffffff';
    x.fill();
  }
  // polidor (arco)
  const ux = cx + S * 0.25;
  box(x, ux - S * 0.42, by - S * 0.95, S * 0.14, S * 0.95, S * 0.05, '#3ee07a', lw);
  box(x, ux + S * 0.28, by - S * 0.95, S * 0.14, S * 0.95, S * 0.05, '#3ee07a', lw);
  box(x, ux - S * 0.5, by - S * 1.15, S, S * 0.3, S * 0.12, '#ffcf2e', lw);
  const z = Math.max(0, Math.sin(time * 5.3));
  x.globalAlpha = 0.3 + z * 0.6;
  x.beginPath();
  x.arc(ux, by - S * 1.0, S * 0.11, 0, TAU);
  x.fillStyle = '#5ef0ff';
  x.fill();
  x.globalAlpha = 1;
  x.restore();
}

export function registerTycoon(): void {
  registerGame({
    id: 'tycoon',
    get name() {
      return t('tycoon.name', 'Fábrica Estelar');
    },
    get tagline() {
      return t('tycoon.tagline', 'Construa a fábrica de estrelas mais brilhante!');
    },
    icon: 'star',
    theme: {
      bg: ['#0f5a3a', '#1d2a14'],
      accent: '#ffcf2e',
      accent2: '#3ee07a',
      title: ['#fff6b0', '#ffcf2e'],
    },
    drawShowcase: drawTycoonShowcase,
    online: true,
    async launch(root, exit) {
      const m = await import('./index');
      return m.launchTycoon(root, exit);
    },
  });
}
