/* ============================================================
 *  BLOOP PINK — miniaturas 2D dos produtos (tablet, caixa, coleção), em cache (dataURL).
 * ============================================================ */
import type { Product } from './catalog';
import { drawBrandLogo } from './brand';

const CACHE = new Map<string, string>();
const W = 120;
const H = 100;

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
function rr(x: CanvasRenderingContext2D, X: number, Y: number, w: number, h: number, r: number): void {
  x.beginPath();
  x.roundRect(X, Y, w, h, r);
}
function body(x: CanvasRenderingContext2D, col: string, X: number, Y: number, w: number, h: number, r: number): void {
  const g = x.createLinearGradient(X, 0, X + w, 0);
  g.addColorStop(0, shade(col, 0.82));
  g.addColorStop(0.35, shade(col, 1.12));
  g.addColorStop(1, shade(col, 0.75));
  x.fillStyle = g;
  rr(x, X, Y, w, h, r);
  x.fill();
  x.strokeStyle = 'rgba(58,13,42,.55)';
  x.lineWidth = 2;
  x.stroke();
  x.fillStyle = 'rgba(255,255,255,.35)';
  rr(x, X + w * 0.15, Y + h * 0.08, w * 0.12, h * 0.75, w * 0.06);
  x.fill();
}
function label(x: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  x.fillStyle = 'rgba(255,248,251,.95)';
  rr(x, cx - s, cy - s * 0.7, s * 2, s * 1.4, s * 0.25);
  x.fill();
  drawBrandLogo(x, cx, cy, s * 1.1, { badgeOnly: true });
}

export function drawProduct(x: CanvasRenderingContext2D, p: Product, w = W, h = H): void {
  x.save();
  x.scale(w / W, h / H);
  // sombra
  x.fillStyle = 'rgba(58,13,42,.12)';
  x.beginPath();
  x.ellipse(60, 92, 30, 5, 0, 0, Math.PI * 2);
  x.fill();
  const c = p.color;
  const k = p.cap;
  switch (p.shape) {
    case 'splash':
      body(x, c, 42, 26, 36, 64, 14);
      body(x, k, 52, 12, 16, 16, 4);
      label(x, 60, 60, 11);
      break;
    case 'perfume':
      x.fillStyle = 'rgba(220,240,255,.6)';
      rr(x, 34, 40, 52, 50, 10);
      x.fill();
      x.strokeStyle = 'rgba(58,13,42,.5)';
      x.lineWidth = 2;
      x.stroke();
      body(x, c, 39, 46, 42, 40, 8);
      body(x, k, 46, 16, 28, 24, 6);
      label(x, 60, 66, 8);
      break;
    case 'lipstick':
      body(x, k, 48, 50, 24, 40, 4);
      body(x, '#e6dcd4', 50, 42, 20, 9, 2);
      x.fillStyle = c;
      x.beginPath();
      x.moveTo(52, 42);
      x.lineTo(52, 20);
      x.quadraticCurveTo(60, 8, 68, 16);
      x.lineTo(68, 42);
      x.fill();
      x.strokeStyle = 'rgba(58,13,42,.5)';
      x.stroke();
      break;
    case 'gloss':
    case 'mascara':
      body(x, c, 51, 40, 18, 50, 6);
      body(x, k, 50, 10, 20, 32, 6);
      break;
    case 'compact':
      x.fillStyle = shade(k, 1);
      x.beginPath();
      x.ellipse(60, 70, 34, 16, 0, 0, Math.PI * 2);
      x.fill();
      x.fillRect(26, 58, 68, 12);
      x.beginPath();
      x.ellipse(60, 58, 34, 16, 0, 0, Math.PI * 2);
      x.fillStyle = shade(k, 1.25);
      x.fill();
      x.fillStyle = c;
      x.beginPath();
      x.ellipse(60, 58, 24, 10, 0, 0, Math.PI * 2);
      x.fill();
      break;
    case 'polish':
      x.fillStyle = 'rgba(220,240,255,.7)';
      rr(x, 40, 52, 40, 38, 12);
      x.fill();
      body(x, c, 44, 56, 32, 31, 9);
      body(x, k, 51, 14, 18, 40, 4);
      break;
    case 'tube':
      body(x, k, 48, 74, 24, 16, 3);
      x.fillStyle = c;
      x.beginPath();
      x.moveTo(46, 76);
      x.lineTo(40, 14);
      x.lineTo(80, 14);
      x.lineTo(74, 76);
      x.closePath();
      x.fill();
      x.strokeStyle = 'rgba(58,13,42,.5)';
      x.lineWidth = 2;
      x.stroke();
      label(x, 60, 44, 10);
      break;
    case 'dropper':
      x.fillStyle = 'rgba(220,240,255,.7)';
      rr(x, 40, 46, 40, 44, 10);
      x.fill();
      body(x, c, 44, 52, 32, 34, 8);
      body(x, k, 50, 32, 20, 15, 3);
      body(x, '#e6dcd4', 53, 12, 14, 21, 7);
      break;
    case 'jar':
    case 'tub':
      body(x, c, 30, p.shape === 'tub' ? 34 : 50, 60, p.shape === 'tub' ? 56 : 40, 8);
      body(x, k, 28, p.shape === 'tub' ? 22 : 40, 64, 14, 5);
      label(x, 60, p.shape === 'tub' ? 62 : 72, 11);
      break;
    case 'pump':
      body(x, c, 38, 34, 44, 56, 10);
      body(x, k, 54, 20, 12, 15, 2);
      body(x, k, 46, 12, 30, 9, 3);
      label(x, 60, 62, 11);
      break;
    case 'pills':
      body(x, c, 40, 38, 40, 52, 8);
      body(x, k, 42, 22, 36, 18, 4);
      label(x, 60, 64, 11);
      break;
    case 'pouch':
      body(x, c, 22, 36, 76, 52, 18);
      x.fillStyle = k;
      x.fillRect(28, 38, 64, 5);
      break;
    case 'brush':
      body(x, c, 54, 46, 12, 44, 5);
      body(x, '#e6dcd4', 52, 36, 16, 12, 2);
      x.fillStyle = k;
      x.beginPath();
      x.ellipse(60, 26, 12, 16, 0, 0, Math.PI * 2);
      x.fill();
      break;
    case 'giftbox':
      body(x, c, 26, 40, 68, 48, 4);
      body(x, c, 22, 32, 76, 14, 3);
      x.fillStyle = k;
      x.fillRect(55, 32, 10, 56);
      x.beginPath();
      x.ellipse(50, 28, 10, 6, -0.4, 0, Math.PI * 2);
      x.ellipse(70, 28, 10, 6, 0.4, 0, Math.PI * 2);
      x.fill();
      break;
  }
  x.restore();
}

export function thumbUrl(p: Product): string {
  let u = CACHE.get(p.id);
  if (u) return u;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  drawProduct(c.getContext('2d')!, p);
  u = c.toDataURL();
  CACHE.set(p.id, u);
  return u;
}
