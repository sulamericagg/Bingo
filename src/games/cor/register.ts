/* ============================================================
 *  PINTOU, GANHOU! — registro no hub. Leve: o jogo é importado sob demanda.
 *  Vitrine: anel de cores girando + duas amostras que "batem" e mostram a %.
 * ============================================================ */
import { t } from '../../i18n';
import { registerGame } from '../../hub/registry';

const INK = '#1d0b48';
const SAMPLES = [
  ['#f3d03e', '#e9c845', 97],
  ['#f48fa8', '#e98aa8', 95],
  ['#c0202a', '#b02a3a', 91],
  ['#2ec2c8', '#30b0d0', 93],
  ['#6b4429', '#7a4a30', 96],
] as const;

function drawShowcase(x: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  const g = x.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#5b3aa8');
  g.addColorStop(1, '#ff5e8a');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h * 0.5;
  const R = Math.min(w, h) * 0.38;
  // anel de matiz
  const n = 36;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2 + time * 0.4;
    x.beginPath();
    x.arc(cx, cy, R, a0, a0 + (Math.PI * 2) / n + 0.02);
    x.arc(cx, cy, R * 0.8, a0 + (Math.PI * 2) / n + 0.02, a0, true);
    x.closePath();
    x.fillStyle = `hsl(${(i / n) * 360},90%,58%)`;
    x.fill();
  }
  x.lineWidth = 3;
  x.strokeStyle = INK;
  x.beginPath();
  x.arc(cx, cy, R, 0, Math.PI * 2);
  x.stroke();
  x.beginPath();
  x.arc(cx, cy, R * 0.8, 0, Math.PI * 2);
  x.stroke();
  // duas amostras que se aproximam
  const k = (time / 2.2) % 1;
  const s = SAMPLES[Math.floor(time / 2.2) % SAMPLES.length];
  const join = Math.min(1, k / 0.35);
  const e = 1 - Math.pow(1 - join, 3);
  const sw = R * 0.62;
  const sh = R * 1.0;
  for (const side of [-1, 1]) {
    const px = cx + side * (sw / 2 + (1 - e) * R * 0.5) - sw / 2;
    x.fillStyle = side < 0 ? s[0] : s[1];
    x.beginPath();
    x.roundRect(px, cy - sh / 2, sw, sh, side < 0 ? [14, 0, 0, 14] : [0, 14, 14, 0]);
    x.fill();
    x.lineWidth = 3;
    x.strokeStyle = INK;
    x.stroke();
  }
  if (k > 0.35) {
    const pop = Math.min(1, (k - 0.35) / 0.12);
    x.save();
    x.translate(cx, cy);
    x.scale(0.6 + 0.4 * pop, 0.6 + 0.4 * pop);
    x.font = `700 ${Math.round(R * 0.36)}px Fredoka, system-ui, sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.lineWidth = 6;
    x.strokeStyle = INK;
    x.strokeText(s[2] + '%', 0, 0);
    x.fillStyle = '#fff';
    x.fillText(s[2] + '%', 0, 0);
    x.restore();
  }
}

export function registerCor(): void {
  registerGame({
    id: 'cor',
    get name() {
      return t('cor.name', 'Pintou, Ganhou!');
    },
    get tagline() {
      return t('cor.tagline', 'Memorize a cor e pinte igualzinho!');
    },
    icon: 'paint',
    theme: { bg: ['#5b3aa8', '#ff5e8a'], accent: '#ff5e8a', accent2: '#ffd166', title: ['#fff6d6', '#ffd166'] },
    drawShowcase,
    async launch(root, exit) {
      const m = await import('./game');
      return m.launch(root, exit);
    },
  });
}
