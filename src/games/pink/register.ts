/* ============================================================
 *  BLOOP PINK — registro no hub (leve: só a vitrine; o jogo carrega sob demanda).
 * ============================================================ */
import { registerGame } from '../../hub/registry';
import { registerPartyGame } from '../../party/contract';
import { t } from '../../i18n';
import { BRAND_NAME, drawBrandLogo, PINK } from './brand';

export function registerPink(): void {
  // GRUPO: o líder escolhe a loja (save dele) e todos entram nela (game.ts → partySeat, coop.ts)
  registerPartyGame('pink', { mode: 'room' });
  registerGame({
    id: 'pink',
    get name() {
      return BRAND_NAME;
    },
    get tagline() {
      return t('pink.tagline', 'Monte sua loja de beleza, atenda clientes e cresça a franquia!');
    },
    icon: 'bag',
    theme: { bg: ['#ffb3d1', '#d63384'], accent: '#ff5fa2', accent2: '#ffd34a', title: ['#fff6fa', '#ffd3e6'] },
    drawShowcase,
    async launch(root, exit) {
      const m = await import('./game');
      return m.launch(root, exit);
    },
  });
}

const TAU = Math.PI * 2;
/** vitrine: fachada rosa da loja, toldo listrado, Bloop entrando com sacolinha, brilhos */
export function drawShowcase(x: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  const sky = x.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#ffd9ea');
  sky.addColorStop(1, '#fff4f8');
  x.fillStyle = sky;
  x.fillRect(0, 0, w, h);
  const gy = h * 0.82;
  // calçada
  x.fillStyle = '#e9dcd6';
  x.fillRect(0, gy, w, h - gy);
  x.fillStyle = 'rgba(0,0,0,.06)';
  for (let i = 0; i < 12; i++) x.fillRect((i / 12) * w, gy, 1.5, h - gy);
  // prédio
  const bx = w * 0.14;
  const bw = w * 0.72;
  const by = h * 0.16;
  x.fillStyle = '#fbeef3';
  x.fillRect(bx, by, bw, gy - by);
  x.fillStyle = 'rgba(0,0,0,.06)';
  x.fillRect(bx + bw - 6, by, 6, gy - by);
  // placa
  x.fillStyle = '#fff';
  x.beginPath();
  x.roundRect(bx + bw * 0.12, by + h * 0.03, bw * 0.76, h * 0.13, 10);
  x.fill();
  drawBrandLogo(x, bx + bw / 2, by + h * 0.095, h * 0.085, { glow: 0.3 + Math.sin(time * 3) * 0.2 });
  // toldo listrado
  const ay = by + h * 0.2;
  for (let i = 0; i < 10; i++) {
    x.fillStyle = i % 2 ? '#fff' : PINK.rose;
    x.beginPath();
    const ax = bx + (i / 10) * bw;
    x.moveTo(ax, ay);
    x.lineTo(ax + bw / 10, ay);
    x.lineTo(ax + bw / 10, ay + h * 0.06);
    x.quadraticCurveTo(ax + bw / 20, ay + h * 0.1, ax, ay + h * 0.06);
    x.fill();
  }
  // vitrines com produtos
  const vy = ay + h * 0.12;
  const vh = gy - vy - h * 0.04;
  for (const vx of [bx + bw * 0.05, bx + bw * 0.62]) {
    const vw = bw * 0.33;
    const g = x.createLinearGradient(vx, vy, vx + vw, vy + vh);
    g.addColorStop(0, '#e6f6ff');
    g.addColorStop(1, '#ffe3ef');
    x.fillStyle = g;
    x.fillRect(vx, vy, vw, vh);
    x.strokeStyle = '#3a2a30';
    x.lineWidth = 3;
    x.strokeRect(vx, vy, vw, vh);
    // prateleiras com frascos
    for (let r = 0; r < 2; r++) {
      const sy = vy + vh * (0.45 + r * 0.42);
      x.fillStyle = '#fff';
      x.fillRect(vx + 4, sy, vw - 8, 3);
      for (let k = 0; k < 5; k++) {
        const c = ['#ff8cc0', '#c3a6ff', '#ffd34a', '#8fdcff', '#ff5fa2'][(k + r * 2) % 5];
        const px = vx + 8 + k * (vw - 16) / 5;
        const ph = vh * 0.18 + ((k * 7) % 3) * 3;
        x.fillStyle = c;
        x.beginPath();
        x.roundRect(px, sy - ph, (vw - 16) / 5 - 5, ph, 4);
        x.fill();
      }
    }
    x.fillStyle = 'rgba(255,255,255,.4)';
    x.beginPath();
    x.moveTo(vx + vw * 0.1, vy);
    x.lineTo(vx + vw * 0.3, vy);
    x.lineTo(vx + vw * 0.1, vy + vh * 0.4);
    x.fill();
  }
  // porta
  const dx = bx + bw * 0.41;
  const dw = bw * 0.18;
  x.fillStyle = '#d6efff';
  x.fillRect(dx, vy, dw, gy - vy);
  x.strokeStyle = '#3a2a30';
  x.lineWidth = 3;
  x.strokeRect(dx, vy, dw, gy - vy);
  // Bloop pulando com sacolinha
  const t = time % 4;
  const hop = Math.abs(Math.sin(time * 5)) * h * 0.04;
  const px = w * 0.12 + (t / 4) * w * 0.32;
  const R = h * 0.075;
  const py = gy - R - hop;
  x.fillStyle = 'rgba(0,0,0,.12)';
  x.beginPath();
  x.ellipse(px, gy, R * 0.9, R * 0.25, 0, 0, TAU);
  x.fill();
  x.fillStyle = PINK.ink;
  x.beginPath();
  x.arc(px, py, R + 2, 0, TAU);
  x.fill();
  x.fillStyle = '#ff8fd8';
  x.beginPath();
  x.arc(px, py, R, 0, TAU);
  x.fill();
  x.fillStyle = '#fff';
  x.beginPath();
  x.arc(px + R * 0.25, py - R * 0.15, R * 0.24, 0, TAU);
  x.arc(px + R * 0.68, py - R * 0.15, R * 0.24, 0, TAU);
  x.fill();
  x.fillStyle = PINK.ink;
  x.beginPath();
  x.arc(px + R * 0.32, py - R * 0.12, R * 0.12, 0, TAU);
  x.arc(px + R * 0.75, py - R * 0.12, R * 0.12, 0, TAU);
  x.fill();
  // sacolinha
  x.fillStyle = PINK.rose;
  x.beginPath();
  x.roundRect(px + R * 0.7, py + R * 0.2, R * 0.7, R * 0.8, 4);
  x.fill();
  x.strokeStyle = PINK.ink;
  x.lineWidth = 2;
  x.beginPath();
  x.arc(px + R * 1.05, py + R * 0.2, R * 0.2, Math.PI, 0);
  x.stroke();
  // brilhos
  for (let i = 0; i < 6; i++) {
    const a = time * 1.5 + i;
    const sx = w * (0.2 + ((i * 0.17) % 0.7));
    const sy = h * (0.12 + ((i * 0.29) % 0.25));
    const s = (Math.sin(a * 2) * 0.5 + 0.5) * h * 0.02;
    x.fillStyle = '#ffd34a';
    x.beginPath();
    x.moveTo(sx, sy - s * 2);
    x.lineTo(sx + s * 0.5, sy - s * 0.5);
    x.lineTo(sx + s * 2, sy);
    x.lineTo(sx + s * 0.5, sy + s * 0.5);
    x.lineTo(sx, sy + s * 2);
    x.lineTo(sx - s * 0.5, sy + s * 0.5);
    x.lineTo(sx - s * 2, sy);
    x.lineTo(sx - s * 0.5, sy - s * 0.5);
    x.fill();
  }
}
