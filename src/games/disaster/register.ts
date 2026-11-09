/* Registro do minigame "Sobreviva aos Desastres" no hub (leve: o jogo é carregado sob demanda). */
import { registerGame, type MiniGameHandle } from '../../hub/registry';
import { t } from '../../i18n';

export function registerDisaster(): void {
  registerGame({
    id: 'disaster',
    get name() {
      return t('dz.name', 'Sobreviva aos Desastres');
    },
    get tagline() {
      return t('dz.tagline', 'Suba, corra e escape de 100 desastres!');
    },
    icon: 'warning',
    theme: { bg: ['#25427e', '#0d1830'], accent: '#ff8a1f', accent2: '#ffc94d', title: ['#ffe08a', '#ff7a2e'] },
    drawShowcase,
    online: true,
    async launch(root: HTMLElement, exit: () => void): Promise<MiniGameHandle> {
      const { DisasterGame } = await import('./game');
      return new DisasterGame(root, exit);
    },
  });
}

/* ------------------------------ vitrine ------------------------------ */

const TAU = Math.PI * 2;
const HOUSES = [
  { x: 0.12, w: 0.2, h: 0.22, wall: '#ffd9a8', roof: '#e2574c' },
  { x: 0.4, w: 0.22, h: 0.3, wall: '#cfe8ff', roof: '#9b5de5' },
  { x: 0.7, w: 0.2, h: 0.2, wall: '#f6c9e4', roof: '#d9822b' },
];

/** Cena pequena: uma onda gigante atravessa a vila e derruba as casas; o Bloop pula no telhado. */
export function drawShowcase(x: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  const cyc = (time % 6) / 6; // 0..1
  const gy = h * 0.82;
  // céu de tempestade
  const sky = x.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#24345f');
  sky.addColorStop(0.7, '#5a6fa8');
  sky.addColorStop(1, '#ffb070');
  x.fillStyle = sky;
  x.fillRect(0, 0, w, h);
  // sirene
  const blink = Math.sin(time * 10) > 0;
  x.fillStyle = blink ? 'rgba(255,60,60,.25)' : 'rgba(60,140,255,.2)';
  x.beginPath();
  x.arc(blink ? 0 : w, 0, h * 0.5, 0, TAU);
  x.fill();
  // nuvens
  x.fillStyle = 'rgba(40,50,90,.7)';
  for (let i = 0; i < 5; i++) {
    const cx = ((i * 0.27 + time * 0.02) % 1.2) * w - w * 0.1;
    x.beginPath();
    x.arc(cx, h * 0.12, h * 0.08, 0, TAU);
    x.arc(cx + h * 0.08, h * 0.1, h * 0.1, 0, TAU);
    x.arc(cx + h * 0.17, h * 0.13, h * 0.07, 0, TAU);
    x.fill();
  }
  // chão
  x.fillStyle = '#7a5233';
  x.fillRect(0, gy, w, h - gy);
  x.fillStyle = '#59c35a';
  x.fillRect(0, gy, w, h * 0.025);
  const front = -0.25 + cyc * 1.6; // posição da onda (fração de w)
  // casas
  for (const ho of HOUSES) {
    const hx = ho.x * w;
    const hw = ho.w * w;
    const hh = ho.h * h;
    const hit = front > ho.x + ho.w * 0.3;
    // a casa do meio é a "firme" (o Bloop está nela): só balança, não tomba
    const sturdy = ho === HOUSES[1];
    const tip = hit ? Math.min(1, (front - ho.x - ho.w * 0.3) * 4) : 0;
    x.save();
    x.translate(hx + hw, gy);
    x.rotate(sturdy ? (hit && tip < 1 ? Math.sin(time * 18) * 0.015 : 0) : tip * tip * 1.3);
    x.translate(-hx - hw, -gy);
    x.fillStyle = '#2a1a3a';
    x.fillRect(hx - 2, gy - hh - 2, hw + 4, hh + 4);
    x.fillStyle = ho.wall;
    x.fillRect(hx, gy - hh, hw, hh);
    x.fillStyle = '#5a7ab8';
    x.fillRect(hx + hw * 0.2, gy - hh * 0.7, hw * 0.22, hh * 0.25);
    x.fillRect(hx + hw * 0.58, gy - hh * 0.7, hw * 0.22, hh * 0.25);
    x.fillStyle = '#2a1a3a';
    x.beginPath();
    x.moveTo(hx - 6, gy - hh + 1);
    x.lineTo(hx + hw / 2, gy - hh - h * 0.13);
    x.lineTo(hx + hw + 6, gy - hh + 1);
    x.fill();
    x.fillStyle = ho.roof;
    x.beginPath();
    x.moveTo(hx - 3, gy - hh - 1);
    x.lineTo(hx + hw / 2, gy - hh - h * 0.12);
    x.lineTo(hx + hw + 3, gy - hh - 1);
    x.fill();
    x.restore();
  }
  // Bloop no telhado do meio, pulando quando a onda chega
  const mid = HOUSES[1];
  const near = Math.abs(front - mid.x) < 0.25;
  const jy = near ? Math.abs(Math.sin(time * 6)) * h * 0.08 : Math.abs(Math.sin(time * 3)) * h * 0.02;
  const bx = (mid.x + mid.w / 2) * w;
  const by = gy - mid.h * h - h * 0.12 - jy;
  const r = h * 0.055;
  const sq = near ? 1 + Math.sin(time * 12) * 0.06 : 1;
  x.save();
  x.translate(bx, by - r);
  x.scale(1 / sq, sq);
  x.fillStyle = '#2a0b5c';
  x.beginPath();
  x.arc(0, 0, r + 2, 0, TAU);
  x.fill();
  x.fillStyle = '#ff8fd8';
  x.beginPath();
  x.arc(0, 0, r, 0, TAU);
  x.fill();
  x.fillStyle = '#fff';
  x.beginPath();
  x.arc(-r * 0.32, -r * 0.15, r * 0.26, 0, TAU);
  x.arc(r * 0.32, -r * 0.15, r * 0.26, 0, TAU);
  x.fill();
  x.fillStyle = '#2a1140';
  x.beginPath();
  x.arc(-r * 0.28, -r * 0.1, r * 0.13, 0, TAU);
  x.arc(r * 0.36, -r * 0.1, r * 0.13, 0, TAU);
  x.fill();
  x.restore();
  // onda
  const fx = front * w;
  const lvl = h * 0.2;
  x.fillStyle = 'rgba(40,130,240,.88)';
  x.beginPath();
  x.moveTo(-10, h);
  for (let px = -10; px <= Math.min(w + 10, fx + 30); px += 8) {
    const d = px - fx;
    const crest = d > -h * 0.45 ? h * 0.22 * Math.max(0, 1 - Math.abs(d + h * 0.12) / (h * 0.3)) : 0;
    x.lineTo(px, gy - lvl * Math.min(1, (fx - px + 30) / (h * 0.5)) - crest - Math.sin(px * 0.05 + time * 3) * 3);
  }
  x.lineTo(Math.min(w + 10, fx + 30), h);
  x.fill();
  x.strokeStyle = '#d8f3ff';
  x.lineWidth = 4;
  x.beginPath();
  let first = true;
  for (let px = -10; px <= Math.min(w + 10, fx + 30); px += 8) {
    const d = px - fx;
    const crest = d > -h * 0.45 ? h * 0.22 * Math.max(0, 1 - Math.abs(d + h * 0.12) / (h * 0.3)) : 0;
    const py = gy - lvl * Math.min(1, (fx - px + 30) / (h * 0.5)) - crest - Math.sin(px * 0.05 + time * 3) * 3;
    if (first) x.moveTo(px, py);
    else x.lineTo(px, py);
    first = false;
  }
  x.stroke();
}
