/**
 * CAÇA BLOOP — ilustração 2D dos genomas no estilo Bloop World
 * (contorno tinta roxo-escuro, corpo com degradê, brilhos ovais, bochechas, pupilas com reflexo).
 *
 * Espaço local: 100 unidades ≈ tamanho nominal; criatura centrada em (0,0).
 * Cada genoma vira 3 sprites estáticos (atrás, frente, frente piscando) em cache LRU por tamanho;
 * por quadro só desenhamos os sprites + aura/partículas animadas.
 */
import type { Genome, Hsl, Rarity, Element } from './genome';
import { Rng, type Seed64 } from './rng';

type C = CanvasRenderingContext2D;
type P = [number, number];

/* ============================== cores ============================== */
const hsl = (c: Hsl, a = 1, dl = 0, ds = 0): string =>
  `hsla(${c.h.toFixed(1)},${Math.max(0, Math.min(100, c.s + ds)).toFixed(1)}%,${Math.max(0, Math.min(100, c.l + dl)).toFixed(1)}%,${a})`;
const H = (h: number, s: number, l: number): Hsl => ({ h, s, l });

export const EL_COLOR: Record<Element, string> = {
  fogo: '#ff6a3d', agua: '#3fa8ff', planta: '#4fd36a', eletrico: '#ffd83a', gelo: '#8fe6ff',
  terra: '#c58a4a', ar: '#9ff0d8', luz: '#fff09a', sombra: '#8a5cff', som: '#ff6fd0',
};
export const RARITY_COL: [string, string, string][] = [
  ['#8fa0c8', '#4a5680', '#d8e0f5'],
  ['#3ecf7a', '#1d7a4a', '#c8ffe0'],
  ['#3f8cff', '#1d4aa8', '#c8e0ff'],
  ['#b45cff', '#5a1da8', '#ecd4ff'],
  ['#ffc23a', '#c96a00', '#fff4c0'],
  ['#ff5cc8', '#2a0b5c', '#ffffff'],
];

let INK = '#2a0b5c';
let LW = 2.4;

/* ============================== geometria ============================== */
interface Geo {
  pts: P[];
  W: number;
  Hh: number;
  cy: number;
  top: number;
  bottom: number;
  eyeY: number;
  eyeDX: number;
  eyeR: number;
  mouthY: number;
  float: boolean;
}

const DIMS: Record<Genome['shape'], [number, number]> = {
  redondo: [27, 25], alto: [21, 31], gordo: [34, 25], magro: [16, 31], longo: [36, 19],
  blob: [29, 24], estrela: [31, 31], cubo: [26, 25], gota: [25, 29], pera: [26, 29],
};

const sgnPow = (v: number, p: number) => Math.sign(v) * Math.pow(Math.abs(v), p);

function shapePoints(g: Genome, W: number, Hh: number, cy: number): P[] {
  const N = 72;
  const out: P[] = [];
  const ph = (g.detail & 255) / 40;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    const th = t - Math.PI / 2;
    const c = Math.cos(th);
    const s = Math.sin(th);
    let x = 0;
    let y = 0;
    switch (g.shape) {
      case 'redondo':
        x = W * c;
        y = Hh * s * (s > 0 ? 0.93 : 1);
        break;
      case 'alto':
      case 'magro':
      case 'longo':
      case 'cubo': {
        const n = { alto: 3.2, magro: 2.6, longo: 2.8, cubo: 4.6 }[g.shape];
        x = W * sgnPow(c, 2 / n);
        y = Hh * sgnPow(s, 2 / n);
        break;
      }
      case 'gordo':
        x = W * sgnPow(c, 0.85) * (1 + 0.1 * Math.max(0, s));
        y = Hh * sgnPow(s, s > 0 ? 0.75 : 1.05);
        break;
      case 'blob': {
        const r = 1 + 0.07 * Math.sin(3 * th + ph) + 0.04 * Math.sin(5 * th + ph * 2);
        x = W * c * r;
        y = Hh * s * r * (s > 0 ? 0.92 : 1);
        break;
      }
      case 'estrela': {
        const r = 0.8 + 0.2 * Math.cos(5 * t);
        x = W * r * c;
        y = Hh * r * s * 0.95;
        break;
      }
      case 'gota': {
        x = W * 1.15 * Math.sin(t) * Math.pow(Math.sin(t / 2), 1.1);
        y = -Hh * Math.cos(t);
        break;
      }
      case 'pera':
        x = W * c * (0.66 + 0.4 * ((s + 1) / 2));
        y = Hh * s * (s > 0 ? 0.94 : 1);
        break;
    }
    out.push([x, y + cy]);
  }
  return out;
}

function geo(g: Genome): Geo {
  const [w0, h0] = DIMS[g.shape];
  const W = w0 * g.aspect;
  const Hh = h0 / Math.sqrt(g.aspect);
  const float = g.limbs === 'nenhum' || g.limbs === 'barbatanas' || g.limbs === 'tentaculos' || g.limbs === 'asas';
  const cy = g.limbs === 'tentaculos' ? -6 : float ? -2 : 0;
  const pts = shapePoints(g, W, Hh, cy);
  let top = 1e9;
  let bottom = -1e9;
  for (const p of pts) (top = Math.min(top, p[1])), (bottom = Math.max(bottom, p[1]));
  const eyeOff = { redondo: -0.1, alto: -0.32, gordo: -0.12, magro: -0.38, longo: -0.12, blob: -0.05, estrela: -0.05, cubo: -0.15, gota: 0.18, pera: 0.02 }[g.shape];
  const eyeY = cy + Hh * eyeOff;
  const eyeR = 5.2 * g.eyes.size * Math.min(1.12, Math.max(0.78, W / 26));
  const eyeDX = Math.min(W * 0.45, 11.5);
  return { pts, W, Hh, cy, top, bottom, eyeY, eyeDX, eyeR, mouthY: eyeY + eyeR + 6.5, float };
}

/** y do contorno superior em x (interpolado) */
function topAt(G: Geo, x: number): number {
  let best = G.cy;
  const pts = G.pts;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if ((a[0] - x) * (b[0] - x) <= 0 && a[0] !== b[0]) {
      const y = a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
      if (y < best) best = y;
    }
  }
  return best;
}
/** meia-largura do contorno na altura y */
function sideAt(G: Geo, y: number): number {
  let best = 0;
  const pts = G.pts;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if ((a[1] - y) * (b[1] - y) <= 0 && a[1] !== b[1]) {
      const x = a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
      if (Math.abs(x) > best) best = Math.abs(x);
    }
  }
  return best;
}

function smoothPath(c: C, pts: P[]): void {
  const n = pts.length;
  const m = (i: number): P => {
    const a = pts[i % n];
    const b = pts[(i + 1) % n];
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  };
  const s = m(n - 1);
  c.moveTo(s[0], s[1]);
  for (let i = 0; i < n; i++) {
    const e = m(i);
    c.quadraticCurveTo(pts[i][0], pts[i][1], e[0], e[1]);
  }
  c.closePath();
}
/** borda em "gomos" (fofo / nuvem) */
function scallopPath(c: C, pts: P[], step: number, bulge: number, cy: number): void {
  const n = pts.length;
  const sel: P[] = [];
  for (let i = 0; i < n; i += step) sel.push(pts[i]);
  const k = sel.length;
  c.moveTo(sel[0][0], sel[0][1]);
  for (let i = 0; i < k; i++) {
    const a = sel[i];
    const b = sel[(i + 1) % k];
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const dx = mx;
    const dy = my - cy;
    const L = Math.hypot(dx, dy) || 1;
    c.quadraticCurveTo(mx + (dx / L) * bulge, my + (dy / L) * bulge, b[0], b[1]);
  }
  c.closePath();
}
function bodyPath(c: C, g: Genome, G: Geo): void {
  if (g.material === 'fofo') scallopPath(c, G.pts, 3, 2.2, G.cy);
  else if (g.material === 'nuvem') scallopPath(c, G.pts, 8, 5.5, G.cy);
  else smoothPath(c, G.pts);
}

/* ============================== primitivas ============================== */
function ell(c: C, x: number, y: number, rx: number, ry: number, rot = 0): void {
  c.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot));
  c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}
function circ(c: C, x: number, y: number, r: number): void {
  c.moveTo(x + r, y);
  c.arc(x, y, r, 0, Math.PI * 2);
}
function starPath(c: C, x: number, y: number, R: number, r: number, k = 5, rot = -Math.PI / 2): void {
  for (let i = 0; i < k * 2; i++) {
    const a = rot + (i * Math.PI) / k;
    const rad = i % 2 ? r : R;
    if (i === 0) c.moveTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    else c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  c.closePath();
}
function shape(c: C, fill: string | CanvasGradient, fn: (c: C) => void, lw = LW): void {
  c.beginPath();
  fn(c);
  c.fillStyle = fill;
  c.fill();
  if (lw > 0) {
    c.lineWidth = lw;
    c.strokeStyle = INK;
    c.stroke();
  }
}
function line(c: C, color: string, w: number, fn: (c: C) => void, outline = true): void {
  c.beginPath();
  fn(c);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  if (outline) {
    c.lineWidth = w + LW * 1.6;
    c.strokeStyle = INK;
    c.stroke();
  }
  c.lineWidth = w;
  c.strokeStyle = color;
  c.stroke();
}
function shine(c: C, x: number, y: number, rx: number, ry: number, a = 0.55, rot = -0.5): void {
  c.beginPath();
  ell(c, x, y, rx, ry, rot);
  c.fillStyle = `rgba(255,255,255,${a})`;
  c.fill();
}

/* ============================== partes de trás ============================== */
function drawTail(c: C, g: Genome, G: Geo): void {
  if (g.tail === 'nenhuma') return;
  const y0 = G.cy + G.Hh * 0.45;
  const x0 = sideAt(G, y0) - 3;
  const B = g.pal.body;
  const A = g.pal.acc;
  const P2 = g.pal.pat;
  switch (g.tail) {
    case 'enrolada':
      line(c, hsl(B), 5, (c) => {
        c.moveTo(x0, y0);
        c.bezierCurveTo(x0 + 14, y0 + 2, x0 + 20, y0 - 12, x0 + 12, y0 - 16);
        c.bezierCurveTo(x0 + 6, y0 - 19, x0 + 4, y0 - 10, x0 + 10, y0 - 9);
      });
      break;
    case 'fofa':
      shape(c, hsl(B, 1, 6), (c) => ell(c, x0 + 12, y0 - 10, 10, 15, 0.6));
      shape(c, hsl(P2, 1, 18), (c) => ell(c, x0 + 17, y0 - 20, 5, 6, 0.6), 0);
      break;
    case 'seta':
      line(c, hsl(B, 1, -6), 3, (c) => {
        c.moveTo(x0, y0);
        c.bezierCurveTo(x0 + 16, y0 + 6, x0 + 18, y0 - 8, x0 + 22, y0 - 16);
      });
      shape(c, hsl(A), (c) => {
        const x = x0 + 23;
        const y = y0 - 18;
        c.moveTo(x, y - 6);
        c.quadraticCurveTo(x + 7, y + 1, x + 1, y + 5);
        c.lineTo(x - 1, y + 2);
        c.lineTo(x - 4, y + 4);
        c.quadraticCurveTo(x - 6, y - 2, x, y - 6);
      }, 2);
      break;
    case 'folha':
      line(c, '#3a9a4a', 2.4, (c) => {
        c.moveTo(x0, y0);
        c.quadraticCurveTo(x0 + 10, y0 - 2, x0 + 14, y0 - 10);
      });
      shape(c, '#5fd36a', (c) => {
        c.moveTo(x0 + 14, y0 - 10);
        c.quadraticCurveTo(x0 + 26, y0 - 14, x0 + 26, y0 - 28);
        c.quadraticCurveTo(x0 + 12, y0 - 26, x0 + 14, y0 - 10);
      }, 2);
      break;
    case 'peixe':
      shape(c, hsl(P2, 1, 6), (c) => {
        c.moveTo(x0, y0 - 2);
        c.quadraticCurveTo(x0 + 10, y0 - 4, x0 + 18, y0 - 14);
        c.quadraticCurveTo(x0 + 16, y0 - 1, x0 + 20, y0 + 10);
        c.quadraticCurveTo(x0 + 10, y0 + 4, x0, y0 + 3);
      }, 2.2);
      break;
    case 'raio':
      shape(c, '#ffe14f', (c) => {
        c.moveTo(x0 - 1, y0 - 2);
        c.lineTo(x0 + 12, y0 - 8);
        c.lineTo(x0 + 9, y0 - 2);
        c.lineTo(x0 + 22, y0 - 14);
        c.lineTo(x0 + 14, y0 + 1);
        c.lineTo(x0 + 17, y0 - 4);
        c.lineTo(x0 + 1, y0 + 4);
        c.closePath();
      }, 2);
      break;
    case 'aneis':
      for (let i = 4; i >= 0; i--) {
        const k = i / 4;
        shape(c, i % 2 ? hsl(P2) : hsl(B), (c) => circ(c, x0 + 4 + k * 18, y0 - k * 16 - Math.sin(k * 3) * 3, 5.5 - k * 2.2), 2);
      }
      break;
  }
}

function drawWings(c: C, g: Genome, G: Geo): void {
  const y = G.cy - G.Hh * 0.15;
  const B = g.pal.body;
  for (const sx of [-1, 1]) {
    const x = sx * (sideAt(G, y) - 4);
    c.save();
    c.translate(x, y);
    c.scale(sx, 1);
    if (g.wing === 'pena') {
      const f = c.createLinearGradient(0, -10, 26, 10);
      f.addColorStop(0, hsl(B, 1, 22));
      f.addColorStop(1, hsl(g.pal.pat, 1, 10));
      shape(c, f, (c) => {
        c.moveTo(0, 2);
        c.bezierCurveTo(6, -18, 26, -22, 30, -10);
        c.quadraticCurveTo(30, -4, 25, -3);
        c.quadraticCurveTo(28, 3, 21, 4);
        c.quadraticCurveTo(22, 10, 13, 9);
        c.quadraticCurveTo(8, 12, 0, 8);
        c.closePath();
      });
      line(c, hsl(B, 0.5, -10), 1.4, (c) => {
        c.moveTo(6, 2);
        c.quadraticCurveTo(14, -4, 22, -8);
      }, false);
    } else if (g.wing === 'morcego') {
      shape(c, hsl(B, 1, -14, -10), (c) => {
        c.moveTo(0, 4);
        c.quadraticCurveTo(10, -22, 30, -16);
        c.quadraticCurveTo(27, -8, 30, -2);
        c.quadraticCurveTo(24, -2, 22, 4);
        c.quadraticCurveTo(16, 2, 13, 8);
        c.quadraticCurveTo(8, 4, 0, 9);
        c.closePath();
      });
    } else {
      c.globalAlpha = 0.85;
      shape(c, 'rgba(210,240,255,0.65)', (c) => ell(c, 13, -10, 15, 7.5, -0.5), 1.8);
      shape(c, 'rgba(210,240,255,0.55)', (c) => ell(c, 11, 2, 10, 5, 0.35), 1.8);
      c.globalAlpha = 1;
      shine(c, 12, -13, 6, 2, 0.6, -0.5);
    }
    c.restore();
  }
}

function drawBackLimbs(c: C, g: Genome, G: Geo): void {
  const B = g.pal.body;
  const dark = hsl(B, 1, -12);
  if (g.limbs === 'pernas4') {
    for (const sx of [-1, 1]) shape(c, dark, (c) => c.roundRect(sx * G.W * 0.62 - 5, G.bottom - 8, 10, 13, 5));
  }
  if (g.limbs === 'pernas6') {
    for (const sx of [-1, 1])
      for (let i = 0; i < 3; i++) {
        const y = G.cy + G.Hh * (0.05 + i * 0.28);
        const x = sx * (sideAt(G, y) - 3);
        line(c, dark, 2.6, (c) => {
          c.moveTo(x, y);
          c.lineTo(x + sx * 9, y - 5 + i * 2);
          c.lineTo(x + sx * 12, Math.min(G.bottom + 5, y + 10));
        });
      }
  }
  if (g.limbs === 'barbatanas') {
    // barbatana dorsal
    const tx = 0;
    const ty = topAt(G, 0);
    shape(c, hsl(g.pal.pat, 1, 5), (c) => {
      c.moveTo(tx - 9, ty + 4);
      c.quadraticCurveTo(tx - 2, ty - 14, tx + 10, ty - 10);
      c.quadraticCurveTo(tx + 6, ty - 2, tx + 9, ty + 4);
      c.closePath();
    });
  }
  if (g.limbs === 'asas') drawWings(c, g, G);
}

/* ============================== topo (orelhas/chifres) ============================== */
function drawTop(c: C, g: Genome, G: Geo): void {
  const B = g.pal.body;
  const A = g.pal.acc;
  const ex = Math.min(G.W * 0.52, 16);
  const ty = (x: number) => topAt(G, x) + 3;
  const inner = 'hsla(340,85%,78%,0.9)';
  switch (g.top) {
    case 'gato':
      for (const s of [-1, 1]) {
        const x = s * ex;
        const y = ty(x);
        shape(c, hsl(B), (c) => {
          c.moveTo(x - 8 * s - s * 1, y + 3);
          c.quadraticCurveTo(x + s * 1, y - 20, x + s * 4, y - 17);
          c.quadraticCurveTo(x + s * 8, y - 8, x + s * 8, y + 4);
          c.closePath();
        });
        shape(c, inner, (c) => {
          c.moveTo(x - s * 3, y + 1);
          c.lineTo(x + s * 3, y - 12);
          c.lineTo(x + s * 5, y + 1);
          c.closePath();
        }, 0);
      }
      break;
    case 'redondas':
      for (const s of [-1, 1]) {
        const x = s * ex;
        const y = ty(x) - 3;
        shape(c, hsl(B), (c) => circ(c, x, y, 7.5));
        shape(c, inner, (c) => circ(c, x, y + 0.5, 4), 0);
      }
      break;
    case 'coelho':
      for (const s of [-1, 1]) {
        const x = s * ex * 0.7;
        const y = ty(x);
        shape(c, hsl(B), (c) => ell(c, x + s * 3, y - 14, 5.5, 16, s * 0.18));
        shape(c, inner, (c) => ell(c, x + s * 3, y - 13, 2.6, 11, s * 0.18), 0);
      }
      break;
    case 'caidas':
      for (const s of [-1, 1]) {
        const x = s * (ex + 2);
        const y = ty(x);
        shape(c, hsl(B, 1, -10), (c) => ell(c, x + s * 6, y + 9, 6, 13, -s * 0.5));
      }
      break;
    case 'chifres':
      for (const s of [-1, 1]) {
        const x = s * ex * 0.75;
        const y = ty(x);
        shape(c, '#fff3d6', (c) => {
          c.moveTo(x - 4, y + 3);
          c.quadraticCurveTo(x + s * 2, y - 12, x + s * 9, y - 17);
          c.quadraticCurveTo(x + s * 5, y - 6, x + 4, y + 3);
          c.closePath();
        });
      }
      break;
    case 'unichifre': {
      const y = ty(0);
      const f = c.createLinearGradient(0, y - 24, 0, y);
      f.addColorStop(0, '#fff6c0');
      f.addColorStop(1, hsl(A, 1, 10));
      shape(c, f, (c) => {
        c.moveTo(-5, y + 3);
        c.lineTo(0, y - 24);
        c.lineTo(5, y + 3);
        c.closePath();
      });
      line(c, 'rgba(42,11,92,0.35)', 1.2, (c) => {
        c.moveTo(-3, y - 4);
        c.lineTo(3, y - 7);
        c.moveTo(-2, y - 12);
        c.lineTo(2, y - 14);
      }, false);
      break;
    }
    case 'antenas':
      for (const s of [-1, 1]) {
        const x = s * ex * 0.5;
        const y = ty(x);
        line(c, hsl(B, 1, -14), 2, (c) => {
          c.moveTo(x, y + 2);
          c.quadraticCurveTo(x + s * 2, y - 12, x + s * 8, y - 16);
        });
        shape(c, hsl(A), (c) => circ(c, x + s * 8, y - 17, 3.6), 2);
      }
      break;
    case 'crista': {
      const y = ty(0);
      shape(c, hsl(A), (c) => {
        c.moveTo(-10, y + 4);
        c.quadraticCurveTo(-9, y - 10, -4, y - 6);
        c.quadraticCurveTo(-1, y - 16, 3, y - 7);
        c.quadraticCurveTo(8, y - 12, 10, y + 4);
        c.closePath();
      });
      break;
    }
    case 'broto': {
      const y = ty(0);
      line(c, '#3a9a4a', 2.2, (c) => {
        c.moveTo(0, y + 2);
        c.lineTo(0, y - 9);
      });
      for (const s of [-1, 1])
        shape(c, '#6ee07a', (c) => {
          c.moveTo(0, y - 8);
          c.quadraticCurveTo(s * 6, y - 18, s * 14, y - 12);
          c.quadraticCurveTo(s * 7, y - 4, 0, y - 8);
        }, 2);
      break;
    }
    case 'chama': {
      const y = ty(0);
      const f = c.createLinearGradient(0, y - 22, 0, y + 2);
      f.addColorStop(0, '#fff3a0');
      f.addColorStop(0.5, '#ffb02e');
      f.addColorStop(1, '#ff5a2a');
      shape(c, f, (c) => {
        c.moveTo(-9, y + 3);
        c.quadraticCurveTo(-12, y - 10, -3, y - 14);
        c.quadraticCurveTo(-4, y - 7, 0, y - 6);
        c.quadraticCurveTo(-1, y - 18, 6, y - 24);
        c.quadraticCurveTo(5, y - 14, 11, y - 8);
        c.quadraticCurveTo(12, y - 1, 9, y + 3);
        c.closePath();
      }, 2);
      break;
    }
    case 'cristais':
      for (const [dx, h, rot] of [[-7, 13, -0.35], [0, 18, 0], [7, 12, 0.35]] as const) {
        const y = ty(dx);
        c.save();
        c.translate(dx, y + 3);
        c.rotate(rot);
        shape(c, hsl(H(g.pal.acc.h, 70, 82), 0.92), (c) => {
          c.moveTo(-3.5, 0);
          c.lineTo(-3.5, -h + 4);
          c.lineTo(0, -h);
          c.lineTo(3.5, -h + 4);
          c.lineTo(3.5, 0);
          c.closePath();
        }, 1.8);
        shine(c, -1.2, -h * 0.55, 0.9, h * 0.25, 0.8, 0);
        c.restore();
      }
      break;
    case 'carneiro':
      for (const s of [-1, 1]) {
        const x = s * (ex + 1);
        const y = ty(x) + 4;
        line(c, '#e9d2a8', 4.5, (c) => {
          c.moveTo(x - s * 3, y - 2);
          c.bezierCurveTo(x + s * 10, y - 14, x + s * 16, y + 2, x + s * 8, y + 6);
          c.quadraticCurveTo(x + s * 3, y + 6, x + s * 4, y + 1);
        });
      }
      break;
  }
}

/* ============================== corpo, padrão, material ============================== */
function drawPattern(c: C, g: Genome, G: Geo): void {
  const P2 = g.pal.pat;
  const r = new Rng({ hi: g.detail, lo: g.signature } as Seed64, 7);
  const { W, Hh, cy } = G;
  switch (g.pattern) {
    case 'barriga':
      c.beginPath();
      ell(c, 0, cy + Hh * 0.45, W * 0.62, Hh * 0.55);
      c.fillStyle = hsl(g.pal.body, 0.9, 20, -10);
      c.fill();
      break;
    case 'pintas': {
      c.fillStyle = hsl(P2, 0.85);
      c.beginPath();
      const n = 6 + r.int(5);
      for (let i = 0; i < n; i++) {
        const x = r.range(-W, W);
        const y = cy + r.range(-Hh, Hh * 0.8);
        if (Math.abs(x) < G.eyeDX + 6 && Math.abs(y - G.eyeY) < 9) continue;
        circ(c, x, y, r.range(2.2, 5.2));
      }
      c.fill();
      break;
    }
    case 'listras': {
      c.strokeStyle = hsl(P2, 0.85);
      c.lineWidth = 3.4;
      c.lineCap = 'round';
      const vert = r.chance(0.35);
      c.beginPath();
      for (let i = -2; i <= 2; i++) {
        if (vert) {
          const x = i * W * 0.38;
          c.moveTo(x, G.top - 4);
          c.quadraticCurveTo(x + 4, cy, x, G.top + Hh * 0.55);
        } else {
          const y = G.top + 2 + (i + 2) * 4.2;
          if (i > 0) continue;
          c.moveTo(-W - 2, y + 4);
          c.quadraticCurveTo(0, y - 3, W + 2, y + 4);
          for (const s of [-1, 1]) {
            c.moveTo(s * (W + 2), cy + i * 7 + 6);
            c.lineTo(s * (W - 8), cy + i * 7 + 8);
          }
        }
      }
      c.stroke();
      break;
    }
    case 'manchas': {
      c.fillStyle = hsl(P2, 0.8);
      for (let i = 0; i < 3; i++) {
        const x = r.range(-W, W);
        const y = cy + r.range(-Hh * 0.6, Hh);
        c.beginPath();
        const R = r.range(6, 11);
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2;
          const rr = R * (0.75 + r.next() * 0.4);
          if (k === 0) c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
          else c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        c.closePath();
        c.fill();
      }
      break;
    }
    case 'degrade': {
      const f = c.createLinearGradient(0, G.top, 0, G.bottom);
      f.addColorStop(0, hsl(P2, 0));
      f.addColorStop(0.45, hsl(P2, 0.15));
      f.addColorStop(1, hsl(P2, 0.95));
      c.fillStyle = f;
      c.fillRect(-60, G.top - 10, 120, G.bottom - G.top + 20);
      break;
    }
    case 'galaxia': {
      const f = c.createRadialGradient(-W * 0.2, cy - Hh * 0.3, 2, 0, cy, Math.max(W, Hh) * 1.3);
      f.addColorStop(0, 'rgba(60,30,140,0.55)');
      f.addColorStop(1, 'rgba(14,6,48,0.92)');
      c.fillStyle = f;
      c.fillRect(-60, G.top - 10, 120, G.bottom - G.top + 20);
      for (let i = 0; i < 3; i++) {
        const x = r.range(-W, W);
        const y = cy + r.range(-Hh, Hh);
        const n = c.createRadialGradient(x, y, 0, x, y, r.range(9, 16));
        const hh = i % 2 ? P2 : g.pal.acc;
        n.addColorStop(0, hsl(hh, 0.6, 10));
        n.addColorStop(1, hsl(hh, 0));
        c.fillStyle = n;
        c.fillRect(x - 20, y - 20, 40, 40);
      }
      c.fillStyle = '#ffffff';
      c.beginPath();
      for (let i = 0; i < 16; i++) circ(c, r.range(-W, W), cy + r.range(-Hh, Hh), r.range(0.4, 1.2));
      c.fill();
      c.beginPath();
      starPath(c, r.range(-W * 0.6, W * 0.6), cy + Hh * 0.5, 3, 1, 4, 0);
      c.fill();
      break;
    }
    case 'xadrez': {
      c.fillStyle = hsl(P2, 0.4);
      const s = 7;
      for (let x = -42; x < 42; x += s)
        for (let y = -42; y < 42; y += s) if (((x / s) + (y / s)) % 2 === 0) c.fillRect(x, y, s, s);
      break;
    }
    case 'brilhos': {
      c.fillStyle = hsl(H(P2.h, 90, 92), 0.95);
      c.beginPath();
      for (let i = 0; i < 7; i++) starPath(c, r.range(-W, W), cy + r.range(-Hh, Hh), r.range(2.2, 4), 0.8, 4, 0);
      c.fill();
      break;
    }
    case 'aneis': {
      c.strokeStyle = hsl(P2, 0.6);
      c.lineWidth = 2.6;
      c.beginPath();
      for (let k = 1; k <= 4; k++) ell(c, 0, cy + Hh * 0.55, k * 6, k * 4.5);
      c.stroke();
      break;
    }
  }
}

function drawMaterial(c: C, g: Genome, G: Geo): void {
  const B = g.pal.body;
  const { W, Hh, cy } = G;
  const r = new Rng({ hi: g.signature, lo: g.detail } as Seed64, 9);
  switch (g.material) {
    case 'cristal': {
      c.strokeStyle = 'rgba(255,255,255,0.55)';
      c.lineWidth = 1.2;
      c.beginPath();
      const cx = W * 0.15;
      const cc = cy - Hh * 0.1;
      for (let i = 0; i < G.pts.length; i += 9) {
        c.moveTo(cx, cc);
        c.lineTo(G.pts[i][0], G.pts[i][1]);
      }
      c.stroke();
      for (let i = 0; i < G.pts.length; i += 18) {
        const a = G.pts[i];
        const b = G.pts[(i + 9) % G.pts.length];
        c.beginPath();
        c.moveTo(cx, cc);
        c.lineTo(a[0], a[1]);
        c.lineTo(b[0], b[1]);
        c.closePath();
        c.fillStyle = 'rgba(255,255,255,0.16)';
        c.fill();
      }
      break;
    }
    case 'metal': {
      const f = c.createLinearGradient(-W, G.top, W, G.bottom);
      f.addColorStop(0, 'rgba(255,255,255,0.45)');
      f.addColorStop(0.3, 'rgba(255,255,255,0)');
      f.addColorStop(0.48, 'rgba(255,255,255,0.5)');
      f.addColorStop(0.56, 'rgba(0,0,0,0.12)');
      f.addColorStop(0.8, 'rgba(255,255,255,0.1)');
      f.addColorStop(1, 'rgba(0,0,0,0.2)');
      c.fillStyle = f;
      c.fillRect(-60, G.top - 10, 120, G.bottom - G.top + 20);
      // rebites
      c.fillStyle = 'rgba(255,255,255,0.7)';
      c.beginPath();
      for (const s of [-1, 1]) circ(c, s * W * 0.7, cy + Hh * 0.55, 1.3);
      c.fill();
      break;
    }
    case 'gelatina': {
      c.fillStyle = 'rgba(255,255,255,0.18)';
      c.beginPath();
      ell(c, 0, cy + Hh * 0.2, W * 0.6, Hh * 0.55);
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.7)';
      c.lineWidth = 1;
      c.beginPath();
      for (let i = 0; i < 5; i++) circ(c, r.range(-W * 0.7, W * 0.7), cy + r.range(0, Hh * 0.8), r.range(1.2, 2.8));
      c.stroke();
      break;
    }
    case 'lava': {
      c.fillStyle = 'rgba(30,8,20,0.35)';
      c.fillRect(-60, G.top - 10, 120, G.bottom - G.top + 20);
      c.lineCap = 'round';
      c.lineJoin = 'round';
      const cracks: P[][] = [];
      for (let i = 0; i < 5; i++) {
        let x = r.range(-W, W);
        let y = cy + r.range(-Hh, Hh);
        const pl: P[] = [[x, y]];
        for (let k = 0; k < 4; k++) {
          x += r.range(-8, 8);
          y += r.range(-7, 7);
          pl.push([x, y]);
        }
        cracks.push(pl);
      }
      for (const [w, col] of [[3.4, 'rgba(255,90,30,0.55)'], [1.6, '#ffd36a']] as const) {
        c.strokeStyle = col;
        c.lineWidth = w;
        c.beginPath();
        for (const pl of cracks) {
          c.moveTo(pl[0][0], pl[0][1]);
          for (const p of pl) c.lineTo(p[0], p[1]);
        }
        c.stroke();
      }
      break;
    }
    case 'prisma': {
      const cc = c as C & { createConicGradient?: (a: number, x: number, y: number) => CanvasGradient };
      let f: CanvasGradient;
      if (cc.createConicGradient) f = cc.createConicGradient(0, 0, cy);
      else f = c.createLinearGradient(-W, G.top, W, G.bottom);
      for (let i = 0; i <= 6; i++) f.addColorStop(i / 6, `hsla(${i * 60},95%,70%,0.42)`);
      c.fillStyle = f;
      c.fillRect(-60, G.top - 10, 120, G.bottom - G.top + 20);
      break;
    }
    case 'fofo': {
      c.strokeStyle = hsl(B, 0.35, 16);
      c.lineWidth = 1.2;
      c.beginPath();
      for (let i = 0; i < 9; i++) {
        const x = r.range(-W * 0.8, W * 0.8);
        const y = cy + r.range(-Hh * 0.6, Hh * 0.8);
        c.moveTo(x, y);
        c.quadraticCurveTo(x + 1.5, y - 2, x + 3, y);
      }
      c.stroke();
      break;
    }
    case 'nuvem': {
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.beginPath();
      circ(c, -W * 0.35, G.top + Hh * 0.45, 8);
      circ(c, W * 0.1, G.top + Hh * 0.3, 7);
      c.fill();
      break;
    }
  }
}

function drawBody(c: C, g: Genome, G: Geo): void {
  const B = g.pal.body;
  const R = g.rarity;
  const grad = c.createLinearGradient(0, G.top, 0, G.bottom);
  if (g.material === 'lava') {
    grad.addColorStop(0, hsl(B, 1, -14));
    grad.addColorStop(1, hsl(B, 1, -30));
  } else if (g.material === 'metal') {
    grad.addColorStop(0, hsl(B, 1, 14, -30));
    grad.addColorStop(1, hsl(B, 1, -12, -30));
  } else {
    grad.addColorStop(0, hsl(B, 1, R >= 2 ? 16 : 10));
    grad.addColorStop(0.6, hsl(B));
    grad.addColorStop(1, hsl(B, 1, -8));
  }
  const translucent = g.material === 'gelatina' || g.material === 'cristal';
  c.save();
  c.globalAlpha = translucent ? 0.86 : 1;
  c.beginPath();
  bodyPath(c, g, G);
  c.fillStyle = grad;
  c.fill();
  c.restore();
  c.save();
  c.beginPath();
  bodyPath(c, g, G);
  c.clip();
  drawPattern(c, g, G);
  drawMaterial(c, g, G);
  // sombra inferior interna
  c.beginPath();
  ell(c, 5, G.bottom + 5, G.W + 6, 12);
  c.fillStyle = 'rgba(26,6,56,0.14)';
  c.fill();
  if (g.rarity === 5) drawConstellation(c, g, G);
  c.restore();
  c.beginPath();
  bodyPath(c, g, G);
  c.lineWidth = LW;
  c.strokeStyle = INK;
  c.lineJoin = 'round';
  c.stroke();
  // brilhos
  const hx = -G.W * 0.48;
  const hy = G.top + (G.bottom - G.top) * 0.2;
  const strong = g.material === 'cristal' || g.material === 'gelatina' || g.material === 'metal' || g.material === 'prisma';
  shine(c, hx, hy, strong ? 7 : 5.5, strong ? 4 : 3.2, strong ? 0.8 : 0.55);
  if (R >= 1 || strong) shine(c, hx + 8, hy - 3, 1.8, 1.8, 0.75, 0);
  if (g.material === 'gelatina') {
    c.beginPath();
    c.arc(0, G.cy, Math.min(G.W, G.Hh) * 0.85, 0.2, 1.1);
    c.strokeStyle = 'rgba(255,255,255,0.55)';
    c.lineWidth = 1.8;
    c.stroke();
  }
}

function drawConstellation(c: C, g: Genome, G: Geo): void {
  const r = new Rng({ hi: g.signature, lo: ~g.signature >>> 0 }, 3);
  const n = 5 + (g.signature & 3);
  const pts: P[] = [];
  for (let i = 0; i < n; i++) pts.push([r.range(-G.W * 0.75, G.W * 0.75), G.cy + r.range(-G.Hh * 0.2, G.Hh * 0.85)]);
  pts.sort((a, b) => a[0] - b[0]);
  c.strokeStyle = 'rgba(255,255,255,0.7)';
  c.lineWidth = 0.9;
  c.beginPath();
  pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
  c.stroke();
  c.fillStyle = '#fff';
  c.beginPath();
  for (const p of pts) starPath(c, p[0], p[1], 2.4, 0.8, 4, 0);
  c.fill();
}

function drawFrontLimbs(c: C, g: Genome, G: Geo): void {
  const B = g.pal.body;
  const foot = hsl(B, 1, -6);
  const L = g.limbs;
  if (L === 'pes' || L === 'bracos' || L === 'asas') {
    for (const s of [-1, 1]) shape(c, foot, (c) => ell(c, s * Math.min(G.W * 0.45, 12), G.bottom + 1, 7, 4.6));
  }
  if (L === 'pernas4') {
    for (const s of [-1, 1]) shape(c, foot, (c) => c.roundRect(s * G.W * 0.32 - 5.5, G.bottom - 7, 11, 13, 5));
  }
  if (L === 'bracos') {
    const y = G.cy + G.Hh * 0.25;
    for (const s of [-1, 1]) {
      const x = s * (sideAt(G, y) - 1);
      shape(c, hsl(B), (c) => ell(c, x + s * 3, y + 2, 5, 7, -s * 0.6));
    }
  }
  if (L === 'barbatanas') {
    const y = G.cy + G.Hh * 0.25;
    for (const s of [-1, 1]) {
      const x = s * (sideAt(G, y) - 2);
      shape(c, hsl(g.pal.pat, 1, 6), (c) => {
        c.moveTo(x, y - 5);
        c.quadraticCurveTo(x + s * 14, y - 2, x + s * 13, y + 9);
        c.quadraticCurveTo(x + s * 5, y + 6, x, y + 4);
        c.closePath();
      });
    }
  }
  if (L === 'tentaculos') {
    const n = 4;
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * (G.W * 0.48);
      const y = G.bottom - 6;
      line(c, hsl(B, 1, -4), 5, (c) => {
        c.moveTo(x, y);
        c.bezierCurveTo(x + 4, y + 6, x - 5, y + 10, x + (i % 2 ? 3 : -3), y + 15);
      });
    }
  }
}

/* ============================== rosto ============================== */
function drawEyes(c: C, g: Genome, G: Geo, closed: boolean): void {
  const n = g.eyes.n;
  let R = G.eyeR;
  const pos: P[] = [];
  const y = G.eyeY;
  const dx = G.eyeDX;
  if (n === 1) {
    R *= 1.55;
    pos.push([0, y]);
  } else if (n === 2) pos.push([-dx, y], [dx, y]);
  else if (n === 3) {
    R *= 0.8;
    pos.push([-dx * 1.05, y + 1], [0, y - R * 1.3], [dx * 1.05, y + 1]);
  } else {
    R *= 0.7;
    pos.push([-dx * 1.15, y], [-dx * 0.4, y - R * 0.9], [dx * 0.4, y - R * 0.9], [dx * 1.15, y]);
  }
  const dark = g.pal.body.l < 45 || g.pattern === 'galaxia';
  const iris = hsl(g.pal.eye);
  const pupil = '#1d0b3a';
  // bochechas
  if (g.cheeks !== 'nenhuma') {
    const cc = g.cheeks === 'rosa' ? 'rgba(255,111,159,0.45)' : hsl(H(g.pal.acc.h, 90, 70), 0.5);
    c.beginPath();
    const cdx = n === 1 ? R * 1.1 : dx + 3.5;
    ell(c, -cdx, y + G.eyeR + 3.5, 4.2, 2.6);
    ell(c, cdx, y + G.eyeR + 3.5, 4.2, 2.6);
    c.fillStyle = cc;
    c.fill();
  }
  const arc = (x: number, yy: number, w: number, up: boolean) =>
    line(c, INK, 2.2, (c) => {
      c.moveTo(x - w, yy);
      c.quadraticCurveTo(x, yy + (up ? -w * 1.1 : w * 1.1), x + w, yy);
    }, false);
  const S = g.eyes.shape;
  if (closed && S !== 'feliz') {
    for (const [x, yy] of pos) arc(x, yy, R * 0.9, false);
    return;
  }
  for (const [x, yy] of pos) {
    if (S === 'feliz') {
      arc(x, yy + 1, R * 0.9, true);
      continue;
    }
    if (S === 'sono') {
      shape(c, dark ? '#fff' : '#ffffff', (c) => ell(c, x, yy, R * 0.95, R * 0.95), 1.6);
      c.beginPath();
      circ(c, x, yy + R * 0.25, R * 0.5);
      c.fillStyle = pupil;
      c.fill();
      shape(c, hsl(g.pal.body, 1, -6), (c) => {
        c.moveTo(x - R * 1.05, yy);
        c.arc(x, yy, R * 1.05, Math.PI, 0);
        c.closePath();
      }, 1.6);
      continue;
    }
    if (S === 'desenho' || S === 'fenda' || dark) {
      shape(c, '#ffffff', (c) => ell(c, x, yy, R * 0.95, R * 1.1), 1.8);
      if (S === 'fenda') {
        c.beginPath();
        ell(c, x, yy, R * 0.62, R * 0.95);
        c.fillStyle = iris;
        c.fill();
        c.beginPath();
        ell(c, x, yy, R * 0.18, R * 0.75);
        c.fillStyle = pupil;
        c.fill();
      } else {
        c.beginPath();
        circ(c, x + R * 0.15, yy + R * 0.15, R * 0.55);
        c.fillStyle = S === 'desenho' ? pupil : iris;
        c.fill();
        if (S !== 'desenho') {
          c.beginPath();
          circ(c, x + R * 0.15, yy + R * 0.15, R * 0.28);
          c.fillStyle = pupil;
          c.fill();
        }
      }
      shine(c, x - R * 0.2, yy - R * 0.35, R * 0.22, R * 0.22, 0.95, 0);
      continue;
    }
    if (S === 'ponto') {
      c.beginPath();
      ell(c, x, yy, R * 0.5, R * 0.65);
      c.fillStyle = pupil;
      c.fill();
      shine(c, x - R * 0.15, yy - R * 0.25, R * 0.18, R * 0.18, 0.95, 0);
      continue;
    }
    // grande / brilho: pupila escura com íris embaixo e reflexos
    c.beginPath();
    ell(c, x, yy, R * 0.86, R * 1.05);
    c.fillStyle = pupil;
    c.fill();
    c.save();
    c.beginPath();
    ell(c, x, yy, R * 0.86, R * 1.05);
    c.clip();
    c.beginPath();
    ell(c, x, yy + R * 0.8, R * 1.1, R * 0.75);
    c.fillStyle = iris;
    c.fill();
    c.restore();
    if (S === 'brilho') {
      c.beginPath();
      starPath(c, x - R * 0.22, yy - R * 0.3, R * 0.55, R * 0.2, 4, 0);
      c.fillStyle = '#fff';
      c.fill();
    } else shine(c, x - R * 0.3, yy - R * 0.4, R * 0.36, R * 0.36, 0.95, 0);
    shine(c, x + R * 0.32, yy + R * 0.38, R * 0.15, R * 0.15, 0.9, 0);
  }
}

function drawMouth(c: C, g: Genome, G: Geo): void {
  const y = G.mouthY + (g.eyes.n === 1 ? 3 : 0);
  const tongue = '#ff6f9f';
  switch (g.mouth) {
    case 'sorriso':
      line(c, INK, 2, (c) => {
        c.moveTo(-4.5, y);
        c.quadraticCurveTo(0, y + 4.5, 4.5, y);
      }, false);
      break;
    case 'aberta':
      shape(c, '#5a1238', (c) => {
        c.moveTo(-5, y - 1);
        c.quadraticCurveTo(0, y + 9, 5, y - 1);
        c.closePath();
      }, 1.8);
      c.save();
      c.beginPath();
      c.moveTo(-5, y - 1);
      c.quadraticCurveTo(0, y + 9, 5, y - 1);
      c.closePath();
      c.clip();
      c.beginPath();
      circ(c, 0, y + 6, 3.4);
      c.fillStyle = tongue;
      c.fill();
      c.restore();
      break;
    case 'gato':
      line(c, INK, 1.9, (c) => {
        c.moveTo(-5, y);
        c.quadraticCurveTo(-2.5, y + 3.5, 0, y);
        c.quadraticCurveTo(2.5, y + 3.5, 5, y);
      }, false);
      break;
    case 'presa':
      line(c, INK, 2, (c) => {
        c.moveTo(-5, y);
        c.quadraticCurveTo(0, y + 4, 5, y);
      }, false);
      shape(c, '#fff', (c) => {
        c.moveTo(1.5, y + 1.6);
        c.lineTo(3.4, y + 5.4);
        c.lineTo(4.4, y + 1.1);
        c.closePath();
      }, 1.2);
      break;
    case 'lingua':
      line(c, INK, 2, (c) => {
        c.moveTo(-5, y);
        c.quadraticCurveTo(0, y + 3.5, 5, y);
      }, false);
      shape(c, tongue, (c) => {
        c.moveTo(-1, y + 1.8);
        c.quadraticCurveTo(-1.5, y + 7, 1.8, y + 6.5);
        c.quadraticCurveTo(3.6, y + 5, 3, y + 1.6);
        c.closePath();
      }, 1.4);
      break;
    case 'oh':
      shape(c, '#5a1238', (c) => ell(c, 0, y + 1.5, 2.6, 3.2), 1.8);
      break;
    case 'dentes':
      shape(c, '#fff', (c) => c.roundRect(-6, y - 1.5, 12, 6, 3), 1.8);
      line(c, 'rgba(42,11,92,.6)', 1, (c) => {
        c.moveTo(-6, y + 1.5);
        c.lineTo(6, y + 1.5);
        c.moveTo(-2, y - 1.5);
        c.lineTo(-2, y + 4.5);
        c.moveTo(2, y - 1.5);
        c.lineTo(2, y + 4.5);
      }, false);
      break;
    case 'bico':
      shape(c, '#ffb43a', (c) => {
        c.moveTo(-5, y - 2);
        c.quadraticCurveTo(0, y - 4, 5, y - 2);
        c.quadraticCurveTo(1, y + 6, 0, y + 6);
        c.quadraticCurveTo(-1, y + 6, -5, y - 2);
        c.closePath();
      }, 1.8);
      break;
    case 'presas':
      line(c, INK, 2, (c) => {
        c.moveTo(-5, y + 1);
        c.quadraticCurveTo(0, y + 3, 5, y + 1);
      }, false);
      for (const s of [-1, 1])
        shape(c, '#fff8e6', (c) => {
          c.moveTo(s * 3.5, y + 1);
          c.quadraticCurveTo(s * 6.5, y - 2, s * 6, y - 6);
          c.quadraticCurveTo(s * 4.5, y - 2, s * 1.8, y + 1.5);
          c.closePath();
        }, 1.4);
      break;
    case 'pontinho':
      c.beginPath();
      ell(c, 0, y + 0.5, 1.6, 1.2);
      c.fillStyle = INK;
      c.fill();
      break;
  }
}

/* ============================== adereços ============================== */
function drawAccessory(c: C, g: Genome, G: Geo): void {
  const A = g.pal.acc;
  const a = g.accessory;
  const ex = Math.min(G.W * 0.5, 15);
  const top0 = topAt(G, 0);
  switch (a) {
    case 'laco': {
      const x = ex * 0.9;
      const y = topAt(G, x) + 4;
      shape(c, hsl(A), (c) => {
        c.moveTo(x, y);
        c.lineTo(x - 8, y - 6);
        c.lineTo(x - 8, y + 5);
        c.closePath();
        c.moveTo(x, y);
        c.lineTo(x + 8, y - 6);
        c.lineTo(x + 8, y + 5);
        c.closePath();
      }, 1.8);
      shape(c, hsl(A, 1, -10), (c) => circ(c, x, y, 2.6), 1.6);
      break;
    }
    case 'cachecol': {
      const y = G.mouthY + 6;
      const w = sideAt(G, y) + 1.5;
      shape(c, hsl(A), (c) => c.roundRect(-w, y - 3, w * 2, 6.5, 3.2), 2);
      shape(c, hsl(A, 1, -8), (c) => c.roundRect(w * 0.35, y, 5.5, 13, 2.5), 2);
      line(c, hsl(A, 0.8, 18), 1.4, (c) => {
        for (let x = -w + 4; x < w - 2; x += 5) {
          c.moveTo(x, y - 2);
          c.lineTo(x, y + 2);
        }
      }, false);
      break;
    }
    case 'coroa': {
      const y = top0 + 2;
      const gold = g.rarity >= 4 ? '#ffd24a' : hsl(A);
      shape(c, gold, (c) => {
        c.moveTo(-9, y);
        c.lineTo(-10, y - 10);
        c.lineTo(-5, y - 5);
        c.lineTo(0, y - 13);
        c.lineTo(5, y - 5);
        c.lineTo(10, y - 10);
        c.lineTo(9, y);
        c.closePath();
      }, 2);
      c.fillStyle = '#ff4f8a';
      c.beginPath();
      circ(c, 0, y - 4, 1.8);
      c.fill();
      shine(c, -6, y - 4, 1.2, 2, 0.8, 0);
      break;
    }
    case 'flor': {
      const x = -ex;
      const y = topAt(G, x) + 4;
      c.fillStyle = hsl(A, 1, 10);
      for (let i = 0; i < 5; i++) {
        const an = (i / 5) * Math.PI * 2;
        shape(c, hsl(A, 1, 8), (c) => circ(c, x + Math.cos(an) * 3.6, y + Math.sin(an) * 3.6, 3), 1.4);
      }
      shape(c, '#ffe14f', (c) => circ(c, x, y, 2.4), 1.4);
      break;
    }
    case 'oculos':
    case 'monoculo': {
      const ys = G.eyeY;
      const R = G.eyeR * (g.eyes.n === 1 ? 1.9 : 1.35);
      const xs = g.eyes.n === 1 || a === 'monoculo' ? [g.eyes.n === 1 ? 0 : G.eyeDX] : [-G.eyeDX, G.eyeDX];
      c.lineWidth = 2;
      c.strokeStyle = INK;
      for (const x of xs) {
        c.beginPath();
        circ(c, x, ys, R);
        c.fillStyle = 'rgba(200,235,255,0.25)';
        c.fill();
        c.stroke();
      }
      if (xs.length === 2) {
        c.beginPath();
        c.moveTo(-G.eyeDX + R, ys);
        c.quadraticCurveTo(0, ys - 3, G.eyeDX - R, ys);
        c.stroke();
      }
      if (a === 'monoculo') {
        c.strokeStyle = '#ffd24a';
        c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(xs[0] + R * 0.7, ys + R * 0.7);
        c.quadraticCurveTo(xs[0] + R + 2, ys + 12, xs[0] + R - 2, ys + 18);
        c.stroke();
      }
      break;
    }
    case 'bone': {
      const y = top0 + 3;
      shape(c, hsl(A), (c) => {
        c.moveTo(-12, y + 2);
        c.quadraticCurveTo(-12, y - 11, 0, y - 11);
        c.quadraticCurveTo(12, y - 11, 12, y + 2);
        c.closePath();
      }, 2);
      shape(c, hsl(A, 1, -10), (c) => c.roundRect(4, y - 1, 15, 4.5, 2.2), 2);
      shape(c, '#fff', (c) => circ(c, 0, y - 11, 1.8), 1.2);
      break;
    }
    case 'sino': {
      const y = G.mouthY + 6;
      const w = sideAt(G, y);
      line(c, hsl(A), 2.6, (c) => {
        c.moveTo(-w + 1, y - 1);
        c.quadraticCurveTo(0, y + 4, w - 1, y - 1);
      });
      shape(c, '#ffd24a', (c) => {
        c.moveTo(-3.5, y + 6);
        c.quadraticCurveTo(-3.5, y + 1, 0, y + 1);
        c.quadraticCurveTo(3.5, y + 1, 3.5, y + 6);
        c.closePath();
      }, 1.6);
      break;
    }
    case 'estrela': {
      const x = ex;
      const y = topAt(G, x) + 3;
      shape(c, '#ffe14f', (c) => starPath(c, x, y, 6, 2.6), 1.8);
      break;
    }
    case 'bandana': {
      const y = top0 + 5;
      const w = sideAt(G, y + 2);
      shape(c, hsl(A), (c) => {
        c.moveTo(-w, y + 3);
        c.quadraticCurveTo(0, y - 6, w, y + 3);
        c.lineTo(w, y + 7);
        c.quadraticCurveTo(0, y - 1, -w, y + 7);
        c.closePath();
      }, 1.8);
      c.fillStyle = '#fff';
      c.beginPath();
      for (let i = -2; i <= 2; i++) circ(c, i * w * 0.35, y + 2.5 - (2 - Math.abs(i)) * 1.2, 0.9);
      c.fill();
      break;
    }
    case 'folha': {
      const y = top0 + 3;
      shape(c, '#5fd36a', (c) => {
        c.moveTo(-12, y);
        c.quadraticCurveTo(-4, y - 14, 12, y - 8);
        c.quadraticCurveTo(4, y + 2, -12, y);
        c.closePath();
      }, 1.8);
      line(c, '#3a9a4a', 1.2, (c) => {
        c.moveTo(-10, y - 0.5);
        c.quadraticCurveTo(0, y - 6, 10, y - 7.5);
      }, false);
      break;
    }
    case 'fones': {
      const y = G.eyeY - 2;
      const w = sideAt(G, y) + 1;
      line(c, '#3a3560', 2.6, (c) => {
        c.moveTo(-w + 1, y);
        c.bezierCurveTo(-w, top0 - 12, w, top0 - 12, w - 1, y);
      });
      for (const s of [-1, 1]) shape(c, hsl(A), (c) => c.roundRect(s * w - 4, y - 5, 8, 11, 4), 2);
      break;
    }
  }
}

/* ============================== composição ============================== */
type Layer = 'back' | 'front' | 'all';

/** Desenha o genoma estático em unidades (100u). */
export function paintGenome(c: C, g: Genome, layer: Layer, closed = false): void {
  const G = geo(g);
  INK = `hsl(${(g.pal.body.h * 0.25 + 262 * 0.75).toFixed(0)},62%,15%)`;
  LW = 2.4;
  c.save();
  const k = 0.95 * g.size;
  c.scale(k, k);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  if (layer !== 'front') {
    drawTail(c, g, G);
    drawBackLimbs(c, g, G);
    if (g.top === 'caidas') drawTop(c, g, G);
  }
  if (layer !== 'back') {
    if (g.top !== 'caidas') drawTop(c, g, G);
    if (g.limbs === 'tentaculos') drawFrontLimbs(c, g, G);
    drawBody(c, g, G);
    if (g.limbs !== 'tentaculos') drawFrontLimbs(c, g, G);
    drawEyes(c, g, G, closed);
    drawMouth(c, g, G);
    drawAccessory(c, g, G);
  }
  c.restore();
}

/* ============================== cache de sprites ============================== */
const VIEW = 170;
interface Sprites {
  back: HTMLCanvasElement;
  body: HTMLCanvasElement;
  blink: HTMLCanvasElement;
}
const sprites = new Map<string, Sprites>();
const BUCKETS = [32, 48, 64, 96, 128, 160, 200, 256, 320, 400, 512];
function makeCanvas(px: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = Math.max(1, Math.ceil(px));
  return cv;
}
function getSprites(g: Genome, sizePx: number): Sprites {
  const want = sizePx * Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  const b = BUCKETS.find((x) => x >= want) ?? 512;
  const key = `${g.id}@${b}`;
  let s = sprites.get(key);
  if (s) {
    sprites.delete(key);
    sprites.set(key, s);
    return s;
  }
  const px = (b * VIEW) / 100;
  const mk = (layer: Layer, closed: boolean) => {
    const cv = makeCanvas(px);
    const c = cv.getContext('2d')!;
    c.translate(px / 2, px / 2);
    c.scale(b / 100, b / 100);
    paintGenome(c, g, layer, closed);
    return cv;
  };
  s = { back: mk('back', false), body: mk('front', false), blink: mk('front', true) };
  sprites.set(key, s);
  if (sprites.size > 60) sprites.delete(sprites.keys().next().value!);
  return s;
}
export function clearGenomeSprites(): void {
  sprites.clear();
  icons.clear();
}

/* ============================== aura animada ============================== */
function drawAura(c: C, g: Genome, t: number, front: boolean): void {
  const a = g.aura;
  if (a === 'nenhuma') return;
  const col = EL_COLOR[g.element];
  if (a === 'brilho' && !front) {
    const r = 58 + Math.sin(t * 2) * 3;
    const f = c.createRadialGradient(0, 0, 4, 0, 0, r);
    f.addColorStop(0, col + 'aa');
    f.addColorStop(1, col + '00');
    c.fillStyle = f;
    c.fillRect(-r, -r, r * 2, r * 2);
  }
  if (a === 'prisma' && !front) {
    c.save();
    c.rotate(t * 0.3);
    for (let i = 0; i < 12; i++) {
      c.rotate(Math.PI / 6);
      c.fillStyle = `hsla(${(i * 30 + t * 60) % 360},95%,70%,0.32)`;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(-7, -72);
      c.lineTo(7, -72);
      c.closePath();
      c.fill();
    }
    c.restore();
  }
  if (a === 'anel') {
    c.save();
    c.strokeStyle = col;
    c.lineWidth = 2.4;
    c.globalAlpha = 0.85;
    c.beginPath();
    c.ellipse(0, 6, 44, 11, Math.sin(t) * 0.1, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
    c.stroke();
    const an = t * 1.6;
    const bx = Math.cos(an) * 44;
    const by = 6 + Math.sin(an) * 11;
    if (Math.sin(an) > 0 === front) {
      c.fillStyle = '#fff';
      c.beginPath();
      circ(c, bx, by, 2.6);
      c.fill();
    }
    c.restore();
  }
  if (!front) return;
  const n = 7;
  for (let i = 0; i < n; i++) {
    const ph = (t * 0.35 + i / n) % 1;
    const x = Math.sin(i * 2.4 + t * 0.5) * 36;
    const y = 34 - ph * 84;
    c.globalAlpha = Math.sin(ph * Math.PI) * 0.9;
    c.fillStyle = col;
    c.strokeStyle = col;
    c.beginPath();
    switch (a) {
      case 'faiscas':
        c.moveTo(x, y - 4);
        c.lineTo(x - 2, y + 0.5);
        c.lineTo(x + 0.5, y + 0.5);
        c.lineTo(x - 1, y + 4);
        c.lineTo(x + 3, y - 1);
        c.lineTo(x, y - 1);
        c.closePath();
        c.fill();
        break;
      case 'chamas':
        c.fillStyle = i % 2 ? '#ffb02e' : '#ff5a2a';
        c.moveTo(x, y - 5);
        c.quadraticCurveTo(x + 4, y + 1, x, y + 3);
        c.quadraticCurveTo(x - 4, y + 1, x, y - 5);
        c.fill();
        break;
      case 'bolhas':
        circ(c, x, y, 2.5 + (i % 3));
        c.lineWidth = 1;
        c.strokeStyle = '#dff6ff';
        c.stroke();
        break;
      case 'notas':
        ell(c, x, y, 2.4, 1.8, -0.4);
        c.rect(x + 1.6, y - 7, 1, 7);
        c.fill();
        break;
      default:
        c.fillStyle = a === 'prisma' ? `hsl(${(i * 50 + t * 80) % 360},95%,75%)` : '#ffffff';
        starPath(c, x, y, 3.2, 1, 4, 0);
        c.fill();
    }
  }
  c.globalAlpha = 1;
}

export interface DrawOpts {
  still?: boolean;
  shadow?: boolean;
  /** 'hurt' pisca vermelho, 'happy' pula */
  mood?: 'idle' | 'happy' | 'hurt';
}

/** Desenha o bichinho animado centrado em (0,0) ocupando ~sizePx. */
export function drawGenome(c: C, g: Genome, sizePx: number, t: number, o: DrawOpts = {}): void {
  const sp = getSprites(g, sizePx);
  const k = sizePx / 100;
  const ph = (g.detail % 1000) / 100;
  const still = !!o.still;
  const tt = still ? 0 : t + ph;
  const G = DIMS[g.shape];
  const float = g.limbs === 'nenhum' || g.limbs === 'barbatanas' || g.limbs === 'tentaculos' || g.limbs === 'asas';
  if (o.shadow !== false) {
    c.save();
    c.scale(k, k);
    const sw = (float ? 0.8 + 0.08 * Math.sin(tt * 2.4) : 1) * (G[0] + 6) * g.size;
    c.fillStyle = 'rgba(20,6,50,0.22)';
    c.beginPath();
    c.ellipse(0, 33 * g.size + 4, sw, 6, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
  if (!still) {
    c.save();
    c.scale(k, k);
    drawAura(c, g, tt, false);
    c.restore();
  }
  const speed = o.mood === 'happy' ? 6 : 2.4;
  const s = Math.sin(tt * speed);
  const bob = still ? 0 : float ? -3 * s - 3 : -Math.abs(s) * 2.4 * (o.mood === 'happy' ? 2.5 : 1);
  const sq = still ? 0 : 0.035 * s;
  const wings = g.limbs === 'asas';
  const flap = still ? 1 : 1 + (wings ? 0.08 * Math.sin(tt * 7) : 0.02 * Math.sin(tt * 3));
  const W = VIEW * k;
  c.save();
  c.translate(0, bob * k);
  c.save();
  c.scale(flap, 1);
  c.drawImage(sp.back, -W / 2, -W / 2, W, W);
  c.restore();
  c.scale(1 + sq, 1 - sq);
  const blink = !still && tt % 3.4 < 0.12;
  c.drawImage(blink ? sp.blink : sp.body, -W / 2, -W / 2, W, W);
  c.restore();
  if (!still) {
    c.save();
    c.scale(k, k);
    drawAura(c, g, tt, true);
    if (g.rarity >= 2 && g.aura === 'nenhuma') {
      for (let i = 0; i < 2; i++) {
        const q = (tt * 0.7 + i * 0.5) % 1;
        c.globalAlpha = Math.sin(q * Math.PI);
        c.fillStyle = '#fff';
        c.beginPath();
        starPath(c, i ? 30 : -32, i ? -24 : -8, 2.6 + q * 1.5, 0.9, 4, 0);
        c.fill();
      }
      c.globalAlpha = 1;
    }
    c.restore();
  }
}

/* ============================== ícones / cartão ============================== */
/** Fator para caber num raio de `half` unidades (considera largura, asas, cauda e topo). */
export function fitScale(g: Genome, half: number): number {
  const [w, h] = DIMS[g.shape];
  const ext = Math.max(w * g.aspect + (g.limbs === 'asas' ? 22 : g.limbs === 'barbatanas' ? 12 : 4) + (g.tail !== 'nenhuma' ? 10 : 0), h + (g.top !== 'nenhum' ? 14 : 4)) * 0.95 * g.size;
  return Math.min(1.1, half / ext);
}

const icons = new Map<string, HTMLCanvasElement>();

function rarityBackdrop(c: C, S: number, R: Rarity, locked = false): void {
  const [a, b, light] = locked ? ['#2a2050', '#140c30', '#3a3070'] : RARITY_COL[R];
  const f = c.createRadialGradient(S * 0.5, S * 0.42, S * 0.05, S * 0.5, S * 0.5, S * 0.72);
  f.addColorStop(0, light);
  f.addColorStop(0.45, a);
  f.addColorStop(1, b);
  c.fillStyle = f;
  c.beginPath();
  c.roundRect(0, 0, S, S, S * 0.2);
  c.fill();
  if (R === 5 && !locked) {
    const cc = c as C & { createConicGradient?: (a: number, x: number, y: number) => CanvasGradient };
    if (cc.createConicGradient) {
      const g = cc.createConicGradient(0, S / 2, S / 2);
      for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsla(${i * 60},95%,65%,0.55)`);
      c.fillStyle = g;
      c.fill();
    }
  }
}

/** Ícone estático com fundo de raridade (cache). */
export function genomeIcon(g: Genome, px: number, o: { backdrop?: boolean; locked?: boolean } = {}): HTMLCanvasElement {
  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  const key = `${g.id}|${px}|${o.backdrop === false ? 0 : 1}|${o.locked ? 1 : 0}|${dpr}`;
  const hit = icons.get(key);
  if (hit) return hit;
  const S = Math.round(px * dpr);
  const cv = makeCanvas(S);
  cv.style.width = cv.style.height = px + 'px';
  const c = cv.getContext('2d')!;
  if (o.backdrop !== false) rarityBackdrop(c, S, g.rarity, o.locked);
  const layer = makeCanvas(S);
  const lc = layer.getContext('2d')!;
  lc.translate(S / 2, S * 0.53);
  const k = (S / 100) * fitScale(g, 44);
  lc.scale(k, k);
  paintGenome(lc, g, 'all');
  if (o.locked) {
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalCompositeOperation = 'source-in';
    lc.fillStyle = '#0d0624';
    lc.fillRect(0, 0, S, S);
  }
  c.save();
  c.beginPath();
  c.roundRect(0, 0, S, S, S * 0.2);
  c.clip();
  c.drawImage(layer, 0, 0);
  c.restore();
  icons.set(key, cv);
  if (icons.size > 300) icons.delete(icons.keys().next().value!);
  return cv;
}

export { rarityBackdrop };
