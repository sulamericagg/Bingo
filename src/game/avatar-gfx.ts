/* ============================================================
 *  CRIE SEU BLOOP — utilitários de desenho compartilhados.
 *  Cores derivadas (cacheadas), formas do corpo (pré-calculadas em
 *  coordenadas unitárias) e helpers de path. Nada aqui aloca canvas
 *  por frame nem usa shadowBlur.
 * ============================================================ */
import { rng, TAU } from './math';
import { glow } from './sprites';

export const PI = Math.PI;

/* ---------------------------- cores ---------------------------- */

export function hx(h: string): [number, number, number] {
  const n = parseInt(h.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function mix(a: string, b: string, t: number): string {
  const A = hx(a);
  const B = hx(b);
  const r = Math.round(A[0] + (B[0] - A[0]) * t);
  const g = Math.round(A[1] + (B[1] - A[1]) * t);
  const bl = Math.round(A[2] + (B[2] - A[2]) * t);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}
export function al(h: string, a: number): string {
  const [r, g, b] = hx(h);
  return `rgba(${r},${g},${b},${a})`;
}
export function lum(h: string): number {
  const [r, g, b] = hx(h);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
/** HSL → hex (h em graus). */
export function hsl(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const xx = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, xx, 0];
  else if (h < 120) [r, g, b] = [xx, c, 0];
  else if (h < 180) [r, g, b] = [0, c, xx];
  else if (h < 240) [r, g, b] = [0, xx, c];
  else if (h < 300) [r, g, b] = [xx, 0, c];
  else [r, g, b] = [c, 0, xx];
  const f = (v: number) => Math.round((v + m) * 255);
  return '#' + ((1 << 24) | (f(r) << 16) | (f(g) << 8) | f(b)).toString(16).slice(1);
}

export interface Cols {
  P: string;
  Ph: string;
  Pl: string;
  Pd: string;
  Pdd: string;
  S: string;
  Sh: string;
  Sd: string;
  ink: string;
  inkA: string;
  outline: string;
  lumP: number;
  lumS: number;
  /** rgba(P) 0 */
  P0: string;
  S0: string;
  shA: string;
  shM: string;
  sh0: string;
  rim: string;
}

const colCache = new Map<string, Cols>();
export function cols(P: string, S: string, darkSkin = false): Cols {
  const key = P + S + (darkSkin ? 'd' : '');
  let c = colCache.get(key);
  if (c) return c;
  const deep = mix(P, '#12001f', 0.6);
  const dark = darkSkin || lum(P) < 0.3;
  c = {
    P,
    Ph: mix(P, '#ffffff', 0.45),
    Pl: mix(P, '#ffffff', 0.22),
    Pd: mix(P, '#1a0830', 0.38),
    Pdd: deep,
    S,
    Sh: mix(S, '#ffffff', 0.45),
    Sd: mix(S, '#1a0830', 0.4),
    ink: dark ? mix(P, '#ffffff', 0.75) : mix(P, '#14001f', 0.8),
    inkA: al(deep, 0.55),
    outline: dark ? al(mix(P, '#ffffff', 0.5), 0.6) : al(deep, 0.6),
    lumP: lum(P),
    lumS: lum(S),
    P0: al(P, 0),
    S0: al(S, 0),
    shA: al(deep, dark ? 0.3 : 0.45),
    shM: al(deep, 0.08),
    sh0: al(deep, 0),
    rim: mix(P, '#ffffff', 0.6),
  };
  if (colCache.size > 64) colCache.clear();
  colCache.set(key, c);
  return c;
}

/* ---------------------------- alpha base ---------------------------- */

let BA = 1;
/** alpha base da chamada (respeita o pisca-pisca de invencibilidade do jogo) */
export const setBase = (a: number) => (BA = a);
export const A = (x: CanvasRenderingContext2D, a: number) => (x.globalAlpha = BA * a);

/* ---------------------------- primitivas ---------------------------- */

export function ell(x: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, rot = 0): void {
  x.beginPath();
  x.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
}
export function circ(x: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  x.beginPath();
  x.arc(cx, cy, Math.max(0.01, r), 0, TAU);
}
export function lin(x: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, ...cs: string[]): CanvasGradient {
  const g = x.createLinearGradient(x0, y0, x1, y1);
  const n = cs.length - 1;
  for (let i = 0; i <= n; i++) g.addColorStop(n ? i / n : 0, cs[i]);
  return g;
}
export function rad(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, ...cs: string[]): CanvasGradient {
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, Math.max(0.01, r));
  const n = cs.length - 1;
  for (let i = 0; i <= n; i++) g.addColorStop(n ? i / n : 0, cs[i]);
  return g;
}
/** brilho aditivo barato (sprite cacheado) */
export function glowAt(x: CanvasRenderingContext2D, color: string, cx: number, cy: number, r: number, a = 1): void {
  const o = x.globalAlpha;
  x.globalAlpha = o * a;
  x.drawImage(glow(color, 64), cx - r, cy - r, r * 2, r * 2);
  x.globalAlpha = o;
}
export function star4(x: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  x.beginPath();
  x.moveTo(cx, cy - r);
  x.quadraticCurveTo(cx, cy, cx + r, cy);
  x.quadraticCurveTo(cx, cy, cx, cy + r);
  x.quadraticCurveTo(cx, cy, cx - r, cy);
  x.quadraticCurveTo(cx, cy, cx, cy - r);
  x.fill();
}
export function star5(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, rot = 0, inner = 0.45): void {
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -PI / 2 + rot + (i / 10) * TAU;
    const rr = i % 2 ? r * inner : r;
    x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  x.closePath();
}
export function heart(x: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  x.beginPath();
  x.moveTo(cx, cy + s * 0.9);
  x.bezierCurveTo(cx - s * 1.25, cy + s * 0.05, cx - s * 0.75, cy - s * 0.95, cx, cy - s * 0.35);
  x.bezierCurveTo(cx + s * 0.75, cy - s * 0.95, cx + s * 1.25, cy + s * 0.05, cx, cy + s * 0.9);
  x.closePath();
}
export function rrect(x: CanvasRenderingContext2D, px: number, py: number, w: number, h: number, r: number): void {
  r = Math.min(r, w / 2, h / 2);
  x.beginPath();
  x.moveTo(px + r, py);
  x.arcTo(px + w, py, px + w, py + h, r);
  x.arcTo(px + w, py + h, px, py + h, r);
  x.arcTo(px, py + h, px, py, r);
  x.arcTo(px, py, px + w, py, r);
  x.closePath();
}
/** pseudo-aleatório determinístico 0..1 */
export const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/* ============================================================
 *  FORMAS DO CORPO — pontos unitários (raio ~1), começando no topo.
 * ============================================================ */

export const NP = 64;

export interface Shape {
  pts: Float32Array;
  /** cantos vivos (polígono) em vez de curva suave */
  sharp?: boolean;
  feet: boolean;
  /** y do topo da cabeça (x≈0), lateral máxima, base */
  top: number;
  side: number;
  bottom: number;
  /** deslocamento vertical do rosto (unidades de R) */
  fy: number;
  /** formas animadas recalculam os pontos por frame */
  anim?: (t: number, out: Float32Array) => void;
  /** variações de tremido para o contorno "rabiscado" */
  jit: Float32Array[];
}

function radial(f: (a: number) => number, sx = 1, sy = 1, ox = 0, oy = 0): Float32Array {
  const out = new Float32Array(NP * 2);
  for (let i = 0; i < NP; i++) {
    const a = (i / NP) * TAU - PI / 2;
    const r = f(a);
    out[i * 2] = Math.cos(a) * r * sx + ox;
    out[i * 2 + 1] = Math.sin(a) * r * sy + oy;
  }
  return out;
}

function makeJit(seed: number): Float32Array[] {
  const r = rng(seed);
  const out: Float32Array[] = [];
  for (let k = 0; k < 3; k++) {
    const j = new Float32Array(NP * 2);
    for (let i = 0; i < NP * 2; i++) j[i] = (r() - 0.5) * 0.07;
    out.push(j);
  }
  return out;
}

function finish(s: Omit<Shape, 'top' | 'side' | 'bottom' | 'jit'> & { fy: number }, seed: number): Shape {
  const p = s.pts;
  let top = 0;
  let side = 0;
  let bottom = 0;
  for (let i = 0; i < NP; i++) {
    const px = p[i * 2];
    const py = p[i * 2 + 1];
    if (Math.abs(px) < 0.3) top = Math.min(top, py);
    side = Math.max(side, Math.abs(px));
    bottom = Math.max(bottom, py);
  }
  return { ...s, top, side, bottom, jit: makeJit(seed) };
}

const gauss = (d: number, w: number) => Math.exp(-(d / w) * (d / w));
const angd = (a: number, b: number) => {
  let d = a - b;
  while (d > PI) d -= TAU;
  while (d < -PI) d += TAU;
  return d;
};

const heartPts = (): Float32Array => {
  const out = new Float32Array(NP * 2);
  for (let i = 0; i < NP; i++) {
    const t = (i / NP) * TAU;
    const hxv = 16 * Math.pow(Math.sin(t), 3);
    const hyv = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    out[i * 2] = (hxv / 16) * 1.12;
    out[i * 2 + 1] = (hyv / 16) * 1.12 + 0.02;
  }
  return out;
};

function ghostAnim(t: number, out: Float32Array): void {
  for (let i = 0; i < NP; i++) {
    const a = (i / NP) * TAU - PI / 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    let px = c;
    let py = s;
    if (s > 0) {
      px = Math.sign(c) * Math.pow(Math.abs(c), 0.35);
      const w = Math.pow(s, 4);
      py = s * 0.8 + w * Math.sin(px * PI * 2.5 + t * 7) * 0.17;
    }
    out[i * 2] = px;
    out[i * 2 + 1] = py - 0.04;
  }
}

export const SHAPES: Record<string, Shape> = {
  b_blob: finish(
    {
      pts: radial((a) => 1 + 0.07 * Math.sin(2 * a + 1.1) + 0.06 * Math.sin(3 * a + 2.3) + 0.045 * Math.sin(5 * a + 0.4) + 0.03 * Math.sin(7 * a + 4), 1.02, 0.97, 0.02, 0.02),
      feet: true,
      fy: 0.02,
    },
    11,
  ),
  b_round: finish({ pts: radial(() => 1), feet: true, fy: 0 }, 12),
  b_bean: finish({ pts: radial((a) => 1 - 0.1 * gauss(angd(a, -PI / 2), 0.5), 1.13, 0.88, 0, 0.05), feet: true, fy: 0.06 }, 13),
  b_egg: finish({ pts: radial((a) => 1 + (Math.sin(a) < 0 ? -Math.sin(a) * 0.14 : -Math.sin(a) * 0.02), 0.92, 1.02, 0, 0.05), feet: true, fy: 0.08 }, 14),
  b_drop: finish({ pts: radial((a) => 1 + 0.55 * Math.pow(Math.max(0, -Math.sin(a)), 9), 1, 1, 0, 0.06), feet: true, fy: 0.1 }, 15),
  b_square: finish({ pts: radial((a) => 0.98 * Math.pow(Math.pow(Math.abs(Math.cos(a)), 4) + Math.pow(Math.abs(Math.sin(a)), 4), -0.25)), feet: true, fy: 0 }, 16),
  b_cloud: finish({ pts: radial((a) => 0.9 + 0.13 * Math.abs(Math.cos(3.5 * (a + PI / 2)))), feet: true, fy: 0.02 }, 17),
  b_cat: finish(
    { pts: radial((a) => 1 + 0.48 * gauss(angd(a, -PI / 2 - 0.72), 0.2) + 0.48 * gauss(angd(a, -PI / 2 + 0.72), 0.2)), feet: true, fy: 0.05 },
    18,
  ),
  b_star: finish({ pts: radial((a) => 0.84 + 0.34 * Math.pow((Math.cos(5 * (a + PI / 2)) + 1) / 2, 1.5)), feet: false, fy: 0.05 }, 19),
  b_heart: finish({ pts: heartPts(), feet: true, fy: 0.05 }, 20),
  b_ghost: finish({ pts: (() => { const o = new Float32Array(NP * 2); ghostAnim(0, o); return o; })(), feet: false, fy: 0, anim: ghostAnim }, 21),
  b_gem: finish(
    { pts: radial((a) => { const n = 8; const s = TAU / n; const m = ((((a + PI / 2) % s) + s) % s) - s / 2; return (1.04 * Math.cos(s / 2)) / Math.cos(m); }), sharp: true, feet: true, fy: 0 },
    22,
  ),
};

/** traça o contorno da forma (fechado). jit/k: tremido do traço rabiscado */
export function tracePts(x: CanvasRenderingContext2D, pts: Float32Array, R: number, sharp = false, jit?: Float32Array, k = 0, ox = 0, oy = 0, sc = 1): void {
  x.beginPath();
  const n = NP;
  const X = (i: number) => (pts[i * 2] + (jit ? jit[i * 2] * k : 0)) * R * sc + ox;
  const Y = (i: number) => (pts[i * 2 + 1] + (jit ? jit[i * 2 + 1] * k : 0)) * R * sc + oy;
  if (sharp) {
    x.moveTo(X(0), Y(0));
    for (let i = 1; i < n; i++) x.lineTo(X(i), Y(i));
    x.closePath();
    return;
  }
  x.moveTo((X(n - 1) + X(0)) / 2, (Y(n - 1) + Y(0)) / 2);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    x.quadraticCurveTo(X(i), Y(i), (X(i) + X(j)) / 2, (Y(i) + Y(j)) / 2);
  }
  x.closePath();
}
