/* ============================================================
 *  ARTE PROCEDURAL DA TEMPORADA (cabeçalho do passe, pop-up, faixa da loja).
 *  Paleta + semente da temporada → céu, planeta com anel, colinas e
 *  símbolos flutuando. Desenha num canvas; anima só se a qualidade permitir.
 * ============================================================ */
import type { SeasonInfo } from '../creatures/seasons';
import { rng } from './catalog';

interface Layout {
  stars: Float32Array; // x,y,r,phase
  floaters: Float32Array; // x,y,s,kind,phase
  planet: [number, number, number, number]; // x,y,r,tilt
  hills: Float32Array;
}

const layouts = new Map<number, Layout>();

function layout(s: SeasonInfo): Layout {
  let L = layouts.get(s.index);
  if (L) return L;
  const r = rng(0x5ea5 + s.index * 131);
  const stars = new Float32Array(60 * 4);
  for (let i = 0; i < 60; i++) stars.set([r(), r() * 0.8, 0.4 + r() * 1.4, r() * 6.28], i * 4);
  const floaters = new Float32Array(9 * 5);
  for (let i = 0; i < 9; i++) floaters.set([0.05 + r() * 0.9, 0.1 + r() * 0.6, 0.5 + r() * 0.8, Math.floor(r() * 4), r() * 6.28], i * 5);
  const hills = new Float32Array(12);
  for (let i = 0; i < 12; i++) hills[i] = 0.72 + r() * 0.14;
  L = { stars, floaters, planet: [0.62 + r() * 0.25, 0.28 + r() * 0.2, 0.16 + r() * 0.08, -0.5 + r() * 1], hills };
  layouts.set(s.index, L);
  return L;
}

function shape(x: CanvasRenderingContext2D, kind: number, r: number): void {
  x.beginPath();
  if (kind === 0) {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      if (i) x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else x.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    x.closePath();
  } else if (kind === 1) {
    x.moveTo(0, r * 0.85);
    x.bezierCurveTo(-r * 1.3, -r * 0.05, -r * 0.55, -r * 1.05, 0, -r * 0.4);
    x.bezierCurveTo(r * 0.55, -r * 1.05, r * 1.3, -r * 0.05, 0, r * 0.85);
  } else if (kind === 2) {
    x.moveTo(0, -r);
    x.quadraticCurveTo(r * 0.15, -r * 0.15, r, 0);
    x.quadraticCurveTo(r * 0.15, r * 0.15, 0, r);
    x.quadraticCurveTo(-r * 0.15, r * 0.15, -r, 0);
    x.quadraticCurveTo(-r * 0.15, -r * 0.15, 0, -r);
  } else {
    x.arc(0, 0, r * 0.7, 0, Math.PI * 2);
  }
}

/** Desenha a arte da temporada em (0,0,w,h). t em segundos (0 = estático). */
export function drawSeasonArt(x: CanvasRenderingContext2D, w: number, h: number, s: SeasonInfo, t = 0): void {
  const [bg, a, b] = s.palette;
  const L = layout(s);
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, bg);
  g.addColorStop(0.65, mixHex(bg, a, 0.28));
  g.addColorStop(1, mixHex(bg, b, 0.4));
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  // estrelas
  x.fillStyle = '#ffffff';
  for (let i = 0; i < 60; i++) {
    const o = i * 4;
    x.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.5 + L.stars[o + 3]));
    x.fillRect(L.stars[o] * w, L.stars[o + 1] * h, L.stars[o + 2], L.stars[o + 2]);
  }
  x.globalAlpha = 1;
  // planeta com anel
  const [px, py, pr, tilt] = L.planet;
  const R = pr * Math.min(w, h * 1.6);
  const cx = px * w;
  const cy = py * h;
  const glow = x.createRadialGradient(cx, cy, R * 0.5, cx, cy, R * 2.2);
  glow.addColorStop(0, a + '66');
  glow.addColorStop(1, a + '00');
  x.fillStyle = glow;
  x.fillRect(cx - R * 2.2, cy - R * 2.2, R * 4.4, R * 4.4);
  x.save();
  x.translate(cx, cy);
  x.rotate(tilt);
  x.strokeStyle = b;
  x.lineWidth = R * 0.12;
  x.beginPath();
  x.ellipse(0, 0, R * 1.7, R * 0.45, 0, Math.PI, Math.PI * 2);
  x.stroke();
  const pg = x.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R);
  pg.addColorStop(0, '#ffffff');
  pg.addColorStop(0.25, a);
  pg.addColorStop(1, mixHex(a, bg, 0.6));
  x.fillStyle = pg;
  x.beginPath();
  x.arc(0, 0, R, 0, Math.PI * 2);
  x.fill();
  x.beginPath();
  x.ellipse(0, 0, R * 1.7, R * 0.45, 0, 0, Math.PI);
  x.stroke();
  x.restore();
  // símbolos flutuando
  for (let i = 0; i < 9; i++) {
    const o = i * 5;
    const fx = L.floaters[o] * w;
    const fy = L.floaters[o + 1] * h + Math.sin(t * 1.2 + L.floaters[o + 4]) * h * 0.03;
    const fs = L.floaters[o + 2] * h * 0.06;
    x.save();
    x.translate(fx, fy);
    x.rotate(Math.sin(t * 0.8 + i) * 0.3);
    x.globalAlpha = 0.85;
    x.fillStyle = i % 2 ? a : b;
    shape(x, L.floaters[o + 3], fs);
    x.fill();
    x.restore();
  }
  x.globalAlpha = 1;
  // colinas
  for (let layer = 0; layer < 2; layer++) {
    x.fillStyle = layer ? mixHex(bg, '#000000', 0.25) : mixHex(bg, a, 0.18);
    x.beginPath();
    x.moveTo(0, h);
    for (let i = 0; i < 12; i++) {
      const hx = (i / 11) * w;
      const hy = (L.hills[(i + layer * 5) % 12] + layer * 0.08) * h;
      x.lineTo(hx, hy);
    }
    x.lineTo(w, h);
    x.closePath();
    x.fill();
  }
}

export function mixHex(c1: string, c2: string, k: number): string {
  const p = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const A = p(c1);
  const B = p(c2);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join('');
}
