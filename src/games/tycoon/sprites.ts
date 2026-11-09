/* ============================================================
 *  FÁBRICA ESTELAR — sprites pré-renderizados (cache por escala).
 *  S = tamanho do tile em pixels de canvas. Nada aqui roda por frame:
 *  o jogo só faz drawImage desses canvases.
 * ============================================================ */
import { drawPlayer } from '../../game/character';
import { makeCanvas } from '../../game/math';
import { skinById } from '../../game/skins';
import { LINE_COLORS, PLOT_H, PLOT_W } from './data';

export const INK = '#2a0b5c';
const TAU = Math.PI * 2;

type C2 = CanvasRenderingContext2D;

export function rr(x: C2, a: number, b: number, w: number, h: number, r: number): void {
  r = Math.min(r, w / 2, h / 2);
  x.beginPath();
  x.moveTo(a + r, b);
  x.arcTo(a + w, b, a + w, b + h, r);
  x.arcTo(a + w, b + h, a, b + h, r);
  x.arcTo(a, b + h, a, b, r);
  x.arcTo(a, b, a + w, b, r);
  x.closePath();
}

function grad(x: C2, y0: number, y1: number, stops: string[]): CanvasGradient {
  const g = x.createLinearGradient(0, y0, 0, y1);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
}

function inked(x: C2, lw: number, fill: string | CanvasGradient): void {
  x.lineJoin = 'round';
  x.lineWidth = lw;
  x.strokeStyle = INK;
  x.stroke();
  x.fillStyle = fill;
  x.fill();
}

export function starPath(x: C2, cx: number, cy: number, R: number, r: number, rot = -Math.PI / 2): void {
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5;
    const rad = i % 2 ? r : R;
    if (i === 0) x.moveTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
    else x.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  x.closePath();
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  if (k >= 0) {
    r += (255 - r) * k;
    g += (255 - g) * k;
    b += (255 - b) * k;
  } else {
    r *= 1 + k;
    g *= 1 + k;
    b *= 1 + k;
  }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

/* ---------------------------- estrelas ---------------------------- */
export const STAR_TIERS = ['#ffd84a', '#5ef0ff', '#ff7ae0', '#b38bff', '#7dffb0', '#ffffff'];

export interface Sheet {
  S: number;
  star: HTMLCanvasElement[];
  starGlow: HTMLCanvasElement[];
  belt: HTMLCanvasElement[]; // frames
  collector: HTMLCanvasElement[]; // por linha
  dropper: HTMLCanvasElement[]; // por linha
  upgrader: HTMLCanvasElement;
  upgGlow: HTMLCanvasElement;
  cofre: HTMLCanvasElement;
  padOn: HTMLCanvasElement;
  padOff: HTMLCanvasElement;
  padTurbo: HTMLCanvasElement;
  padIcon: Record<string, HTMLCanvasElement>;
  garden: HTMLCanvasElement;
  fountain: HTMLCanvasElement;
  rocket: HTMLCanvasElement;
  rocketBase: HTMLCanvasElement;
  flame: HTMLCanvasElement;
  drone: HTMLCanvasElement;
  dock: HTMLCanvasElement;
  booster: HTMLCanvasElement;
  shadow: HTMLCanvasElement;
  puff: HTMLCanvasElement;
  spark: HTMLCanvasElement;
  zap: HTMLCanvasElement;
  confetti: HTMLCanvasElement[];
}

function mkStar(S: number, col: string, glow: boolean): HTMLCanvasElement {
  const R = S * 0.2;
  const P = glow ? R * 2.4 : R * 1.25;
  const [c, x] = makeCanvas(P * 2, P * 2);
  if (glow) {
    const g = x.createRadialGradient(P, P, 0, P, P, P);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.3, col + '66');
    g.addColorStop(1, col + '00');
    x.fillStyle = g;
    x.fillRect(0, 0, P * 2, P * 2);
  }
  starPath(x, P, P, R, R * 0.48);
  inked(x, Math.max(1.5, S * 0.035), grad(x, P - R, P + R, ['#ffffff', col, shade(col, -0.25)]));
  x.fillStyle = 'rgba(255,255,255,0.7)';
  x.beginPath();
  x.ellipse(P - R * 0.25, P - R * 0.3, R * 0.22, R * 0.12, -0.6, 0, TAU);
  x.fill();
  return c;
}

/* ---------------------------- esteira ---------------------------- */
export const BELT_FRAMES = 8;
function mkBelt(S: number, f: number): HTMLCanvasElement {
  const len = 5; // tiles 1..6
  const w = len * S;
  const h = S * 0.62;
  const [c, x] = makeCanvas(w + 4, h + S * 0.2);
  const lw = Math.max(1.5, S * 0.04);
  // base
  rr(x, 2, 2 + S * 0.1, w, h, h * 0.3);
  inked(x, lw, '#4b3b7a');
  rr(x, 2 + lw, 2 + lw, w - lw * 2, h - lw * 1.5, h * 0.25);
  x.fillStyle = grad(x, 0, h, ['#6d6aa0', '#3b3466']);
  x.fill();
  // chevrons animados
  x.save();
  rr(x, 2 + lw, 2 + lw, w - lw * 2, h - lw * 1.5, h * 0.25);
  x.clip();
  const sp = S * 0.5;
  const off = (f / BELT_FRAMES) * sp;
  x.strokeStyle = 'rgba(255,216,74,0.55)';
  x.lineWidth = S * 0.07;
  x.lineCap = 'round';
  for (let px = -sp + off; px < w + sp; px += sp) {
    x.beginPath();
    x.moveTo(px, 2 + h * 0.2);
    x.lineTo(px + S * 0.16, 2 + h * 0.5);
    x.lineTo(px, 2 + h * 0.8);
    x.stroke();
  }
  x.restore();
  // brilho superior
  x.fillStyle = 'rgba(255,255,255,0.18)';
  rr(x, 2 + S * 0.1, 2 + lw * 1.3, w - S * 0.2, S * 0.06, S * 0.03);
  x.fill();
  return c;
}

function mkCollector(S: number, col: string): HTMLCanvasElement {
  const [c, x] = makeCanvas(S * 1.3, S * 1.5);
  const lw = Math.max(1.5, S * 0.045);
  const cx = S * 0.6;
  // caixa
  rr(x, S * 0.12, S * 0.45, S * 0.96, S * 0.9, S * 0.18);
  inked(x, lw, grad(x, S * 0.45, S * 1.35, ['#fff3a0', '#ffcf2e', '#e98f00']));
  // boca do funil
  x.beginPath();
  x.ellipse(cx, S * 0.48, S * 0.42, S * 0.2, 0, 0, TAU);
  inked(x, lw, grad(x, S * 0.3, S * 0.7, [shade(col, 0.4), col]));
  x.beginPath();
  x.ellipse(cx, S * 0.5, S * 0.28, S * 0.11, 0, 0, TAU);
  x.fillStyle = '#2a1650';
  x.fill();
  // estrela gravada
  starPath(x, cx, S * 0.92, S * 0.2, S * 0.09);
  x.fillStyle = 'rgba(255,255,255,0.75)';
  x.fill();
  x.fillStyle = 'rgba(255,255,255,0.35)';
  rr(x, S * 0.2, S * 0.62, S * 0.1, S * 0.5, S * 0.05);
  x.fill();
  return c;
}

function mkDropper(S: number, col: string): HTMLCanvasElement {
  const W = S * 1.0;
  const H = S * 1.3;
  const [c, x] = makeCanvas(W + 6, H + 6);
  const lw = Math.max(1.5, S * 0.045);
  const cx = W / 2 + 3;
  // bico
  x.beginPath();
  x.moveTo(cx - S * 0.2, H * 0.78);
  x.lineTo(cx + S * 0.2, H * 0.78);
  x.lineTo(cx + S * 0.11, H - 2);
  x.lineTo(cx - S * 0.11, H - 2);
  x.closePath();
  inked(x, lw, '#8a82b8');
  // corpo
  rr(x, cx - S * 0.42, H * 0.3, S * 0.84, H * 0.5, S * 0.2);
  inked(x, lw, grad(x, H * 0.3, H * 0.8, [shade(col, 0.45), col, shade(col, -0.3)]));
  // janela
  x.beginPath();
  x.arc(cx, H * 0.53, S * 0.21, 0, TAU);
  inked(x, lw, grad(x, H * 0.45, H * 0.6, ['#3a2a7a', '#1a1040']));
  starPath(x, cx, H * 0.535, S * 0.13, S * 0.06);
  x.fillStyle = '#ffd84a';
  x.fill();
  x.fillStyle = 'rgba(255,255,255,0.6)';
  x.beginPath();
  x.ellipse(cx - S * 0.08, H * 0.49, S * 0.06, S * 0.03, -0.5, 0, TAU);
  x.fill();
  // tampa + antena com lâmpada
  rr(x, cx - S * 0.3, H * 0.22, S * 0.6, H * 0.1, S * 0.05);
  inked(x, lw, '#fff3a0');
  x.strokeStyle = INK;
  x.lineWidth = lw * 1.4;
  x.beginPath();
  x.moveTo(cx, H * 0.22);
  x.lineTo(cx, H * 0.1);
  x.stroke();
  x.beginPath();
  x.arc(cx, H * 0.08, S * 0.09, 0, TAU);
  inked(x, lw, grad(x, H * 0.02, H * 0.14, ['#ffffff', '#ffd84a']));
  // brilho no corpo
  x.fillStyle = 'rgba(255,255,255,0.4)';
  rr(x, cx - S * 0.34, H * 0.34, S * 0.08, H * 0.3, S * 0.04);
  x.fill();
  return c;
}

function mkUpgrader(S: number): HTMLCanvasElement {
  const W = S * 1.0;
  const H = S * 1.35;
  const [c, x] = makeCanvas(W + 6, H + 4);
  const lw = Math.max(1.5, S * 0.045);
  const L = 3;
  const R = W + 3;
  for (const px of [L + S * 0.04, R - S * 0.2]) {
    rr(x, px, H * 0.3, S * 0.16, H * 0.68, S * 0.06);
    inked(x, lw, grad(x, 0, H, ['#c8ffe0', '#3ee07a', '#17994a']));
  }
  rr(x, L, H * 0.14, W, H * 0.24, S * 0.12);
  inked(x, lw, grad(x, H * 0.14, H * 0.38, ['#fff6b0', '#ffcf2e', '#e98f00']));
  x.beginPath();
  x.arc(W / 2 + 3, H * 0.26, S * 0.15, 0, TAU);
  inked(x, lw, '#5ef0ff');
  x.fillStyle = INK;
  x.font = `900 ${Math.round(S * 0.17)}px Fredoka, system-ui, sans-serif`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('x2', W / 2 + 3, H * 0.27);
  return c;
}

function mkGlow(S: number, col: string): HTMLCanvasElement {
  const P = S * 0.7;
  const [c, x] = makeCanvas(P * 2, P * 2);
  const g = x.createRadialGradient(P, P, 0, P, P, P);
  g.addColorStop(0, '#ffffffcc');
  g.addColorStop(0.35, col + '88');
  g.addColorStop(1, col + '00');
  x.fillStyle = g;
  x.fillRect(0, 0, P * 2, P * 2);
  return c;
}

function mkCofre(S: number): HTMLCanvasElement {
  const [c, x] = makeCanvas(S * 1.5, S * 1.1);
  const lw = Math.max(1.5, S * 0.045);
  const cx = S * 0.75;
  x.beginPath();
  x.ellipse(cx, S * 0.62, S * 0.68, S * 0.4, 0, 0, TAU);
  inked(x, lw, grad(x, S * 0.3, S, ['#c9a7ff', '#7b3dff']));
  x.beginPath();
  x.ellipse(cx, S * 0.52, S * 0.62, S * 0.34, 0, 0, TAU);
  inked(x, lw, grad(x, S * 0.2, S * 0.85, ['#fff6b0', '#ffcf2e', '#e98f00']));
  starPath(x, cx, S * 0.52, S * 0.22, S * 0.1);
  x.save();
  x.scale(1, 1);
  inked(x, lw * 0.8, '#fff8d0');
  x.restore();
  return c;
}

function mkPad(S: number, on: boolean, turbo = false): HTMLCanvasElement {
  const W = turbo ? S * 1.6 : S * 0.9;
  const [c, x] = makeCanvas(W + 6, S * 0.7);
  const lw = Math.max(1.5, S * 0.045);
  // base 3D
  rr(x, 3, S * 0.14, W, S * 0.5, S * 0.16);
  inked(x, lw, on ? '#17994a' : '#6a6290');
  rr(x, 3, S * 0.06, W, S * 0.46, S * 0.16);
  inked(x, lw, turbo ? grad(x, 0, S * 0.5, ['#ffe680', '#ff9a2e', '#ff3c7a']) : on ? grad(x, 0, S * 0.5, ['#c9ffdc', '#3ee07a']) : grad(x, 0, S * 0.5, ['#d8d2ef', '#9b92bf']));
  x.fillStyle = 'rgba(255,255,255,0.45)';
  rr(x, 3 + S * 0.1, S * 0.1, W - S * 0.2, S * 0.07, S * 0.035);
  x.fill();
  return c;
}

function mkPadIcon(S: number, kind: string): HTMLCanvasElement {
  const P = S * 0.42;
  const [c, x] = makeCanvas(P, P);
  const lw = Math.max(1, S * 0.03);
  const m = P / 2;
  x.lineJoin = 'round';
  if (kind === 'dropper') {
    rr(x, m - P * 0.3, P * 0.14, P * 0.6, P * 0.5, P * 0.14);
    inked(x, lw, '#ffffff');
    x.beginPath();
    x.moveTo(m - P * 0.12, P * 0.64);
    x.lineTo(m + P * 0.12, P * 0.64);
    x.lineTo(m, P * 0.86);
    x.closePath();
    inked(x, lw, '#ffd84a');
  } else if (kind === 'upgrader') {
    x.font = `900 ${Math.round(P * 0.6)}px Fredoka, system-ui, sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.lineWidth = lw * 2.4;
    x.strokeStyle = INK;
    x.strokeText('x2', m, m + P * 0.04);
    x.fillStyle = '#fff';
    x.fillText('x2', m, m + P * 0.04);
  } else if (kind === 'belt') {
    for (let i = 0; i < 2; i++) {
      x.beginPath();
      x.moveTo(P * (0.2 + i * 0.3), P * 0.25);
      x.lineTo(P * (0.42 + i * 0.3), P * 0.5);
      x.lineTo(P * (0.2 + i * 0.3), P * 0.75);
      x.strokeStyle = INK;
      x.lineWidth = lw * 4;
      x.lineCap = 'round';
      x.stroke();
      x.strokeStyle = '#fff';
      x.lineWidth = lw * 2;
      x.stroke();
    }
  } else if (kind === 'helper') {
    x.beginPath();
    x.arc(m, m + P * 0.05, P * 0.3, 0, TAU);
    inked(x, lw, '#ffffff');
    x.fillStyle = INK;
    x.fillRect(m - P * 0.14, m, P * 0.08, P * 0.08);
    x.fillRect(m + P * 0.06, m, P * 0.08, P * 0.08);
    x.fillStyle = '#5ef0ff';
    rr(x, m - P * 0.3, P * 0.08, P * 0.6, P * 0.1, P * 0.05);
    x.fill();
  } else if (kind === 'deco') {
    x.beginPath();
    x.arc(m, m - P * 0.08, P * 0.26, 0, TAU);
    inked(x, lw, '#3ee07a');
    rr(x, m - P * 0.06, m + P * 0.12, P * 0.12, P * 0.26, P * 0.04);
    inked(x, lw, '#b77a3a');
  } else {
    starPath(x, m, m, P * 0.42, P * 0.2);
    inked(x, lw, '#ffffff');
  }
  return c;
}

function mkGarden(S: number): HTMLCanvasElement {
  const [c, x] = makeCanvas(S * 1.4, S * 1.8);
  const lw = Math.max(1.5, S * 0.045);
  const cx = S * 0.7;
  rr(x, cx - S * 0.08, S * 0.95, S * 0.16, S * 0.6, S * 0.05);
  inked(x, lw, '#b77a3a');
  for (const [dx, dy, r] of [
    [0, 0.55, 0.42],
    [-0.28, 0.82, 0.3],
    [0.28, 0.82, 0.3],
  ]) {
    x.beginPath();
    x.arc(cx + dx * S, dy * S, r * S, 0, TAU);
    inked(x, lw, grad(x, (dy - r) * S, (dy + r) * S, ['#c9ffdc', '#3ee07a', '#17994a']));
  }
  const fl = ['#ff7ae0', '#ffd84a', '#5ef0ff', '#ffffff'];
  for (let i = 0; i < 5; i++) {
    const fx = S * (0.15 + i * 0.27);
    const fy = S * (1.55 + (i % 2) * 0.1);
    x.beginPath();
    x.arc(fx, fy, S * 0.08, 0, TAU);
    inked(x, lw * 0.7, fl[i % 4]);
  }
  for (let i = 0; i < 3; i++) {
    x.beginPath();
    x.arc(cx + (i - 1) * S * 0.2, S * (0.45 + (i % 2) * 0.25), S * 0.05, 0, TAU);
    x.fillStyle = '#ff5c8f';
    x.fill();
  }
  return c;
}

function mkFountain(S: number): HTMLCanvasElement {
  const [c, x] = makeCanvas(S * 1.4, S * 1.6);
  const lw = Math.max(1.5, S * 0.045);
  const cx = S * 0.7;
  x.beginPath();
  x.ellipse(cx, S * 1.2, S * 0.62, S * 0.3, 0, 0, TAU);
  inked(x, lw, grad(x, S * 0.9, S * 1.5, ['#e0e6ff', '#9b92bf']));
  x.beginPath();
  x.ellipse(cx, S * 1.15, S * 0.48, S * 0.2, 0, 0, TAU);
  x.fillStyle = grad(x, S, S * 1.3, ['#9ffcff', '#3fb8ff']);
  x.fill();
  rr(x, cx - S * 0.1, S * 0.6, S * 0.2, S * 0.55, S * 0.06);
  inked(x, lw, '#d9d2f5');
  starPath(x, cx, S * 0.45, S * 0.26, S * 0.12);
  inked(x, lw, grad(x, S * 0.2, S * 0.7, ['#ffffff', '#ffd84a', '#e98f00']));
  return c;
}

function mkRocket(S: number): HTMLCanvasElement {
  const W = S * 1.3;
  const H = S * 2.6;
  const [c, x] = makeCanvas(W + 8, H + 8);
  const lw = Math.max(2, S * 0.05);
  const cx = W / 2 + 4;
  // aletas
  for (const s of [-1, 1]) {
    x.beginPath();
    x.moveTo(cx + s * S * 0.28, H * 0.6);
    x.quadraticCurveTo(cx + s * S * 0.62, H * 0.75, cx + s * S * 0.58, H * 0.95);
    x.lineTo(cx + s * S * 0.25, H * 0.86);
    x.closePath();
    inked(x, lw, grad(x, H * 0.6, H, ['#ffbcc7', '#ff4f6a']));
  }
  // corpo
  x.beginPath();
  x.moveTo(cx, 4);
  x.bezierCurveTo(cx + S * 0.55, H * 0.2, cx + S * 0.4, H * 0.7, cx + S * 0.3, H * 0.9);
  x.lineTo(cx - S * 0.3, H * 0.9);
  x.bezierCurveTo(cx - S * 0.4, H * 0.7, cx - S * 0.55, H * 0.2, cx, 4);
  x.closePath();
  inked(x, lw, grad(x, 0, H, ['#ffffff', '#f4efff', '#c8b9f5']));
  // ponta dourada
  x.save();
  x.clip();
  x.fillStyle = grad(x, 0, H * 0.25, ['#fff6b0', '#ffcf2e']);
  x.fillRect(0, 0, W + 8, H * 0.2);
  x.fillStyle = '#3ee07a';
  x.fillRect(0, H * 0.66, W + 8, H * 0.08);
  x.restore();
  // janela
  x.beginPath();
  x.arc(cx, H * 0.42, S * 0.2, 0, TAU);
  inked(x, lw, grad(x, H * 0.35, H * 0.5, ['#9ffcff', '#3fb8ff']));
  starPath(x, cx, H * 0.42, S * 0.11, S * 0.05);
  x.fillStyle = '#ffd84a';
  x.fill();
  // bocal
  rr(x, cx - S * 0.22, H * 0.88, S * 0.44, H * 0.08, S * 0.04);
  inked(x, lw, '#8a82b8');
  return c;
}

function mkRocketBase(S: number): HTMLCanvasElement {
  const [c, x] = makeCanvas(S * 2.2, S * 0.9);
  const lw = Math.max(1.5, S * 0.045);
  x.beginPath();
  x.ellipse(S * 1.1, S * 0.45, S * 1.0, S * 0.36, 0, 0, TAU);
  inked(x, lw, grad(x, 0, S * 0.9, ['#d8d2ef', '#8a82b8']));
  x.beginPath();
  x.ellipse(S * 1.1, S * 0.4, S * 0.7, S * 0.22, 0, 0, TAU);
  x.strokeStyle = '#ffd84a';
  x.setLineDash([S * 0.12, S * 0.1]);
  x.lineWidth = lw;
  x.stroke();
  return c;
}

function mkFlame(S: number): HTMLCanvasElement {
  const [c, x] = makeCanvas(S * 0.8, S * 1.4);
  const g = x.createLinearGradient(0, 0, 0, S * 1.4);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.3, '#ffd84a');
  g.addColorStop(0.7, '#ff7a2f');
  g.addColorStop(1, 'rgba(255,60,122,0)');
  x.fillStyle = g;
  x.beginPath();
  x.moveTo(S * 0.1, 0);
  x.quadraticCurveTo(S * 0.4, S * 1.6, S * 0.7, 0);
  x.closePath();
  x.fill();
  return c;
}

function mkDrone(S: number): HTMLCanvasElement {
  const [c, x] = makeCanvas(S * 0.8, S * 0.7);
  const lw = Math.max(1.2, S * 0.035);
  const cx = S * 0.4;
  x.strokeStyle = INK;
  x.lineWidth = lw;
  x.beginPath();
  x.moveTo(cx, S * 0.25);
  x.lineTo(cx, S * 0.1);
  x.stroke();
  rr(x, cx - S * 0.3, S * 0.04, S * 0.6, S * 0.08, S * 0.04);
  inked(x, lw, '#5ef0ff');
  x.beginPath();
  x.arc(cx, S * 0.42, S * 0.2, 0, TAU);
  inked(x, lw, grad(x, S * 0.22, S * 0.62, ['#ffffff', '#c8b9f5']));
  rr(x, cx - S * 0.13, S * 0.36, S * 0.26, S * 0.11, S * 0.05);
  x.fillStyle = '#2a1650';
  x.fill();
  x.fillStyle = '#5ef0ff';
  x.fillRect(cx - S * 0.09, S * 0.395, S * 0.05, S * 0.04);
  x.fillRect(cx + S * 0.04, S * 0.395, S * 0.05, S * 0.04);
  return c;
}

function mkDock(S: number): HTMLCanvasElement {
  const [c, x] = makeCanvas(S * 1.0, S * 0.7);
  const lw = Math.max(1.5, S * 0.045);
  x.beginPath();
  x.ellipse(S * 0.5, S * 0.38, S * 0.42, S * 0.24, 0, 0, TAU);
  inked(x, lw, grad(x, S * 0.1, S * 0.6, ['#e0feff', '#5ef0ff', '#2a9be0']));
  x.beginPath();
  x.ellipse(S * 0.5, S * 0.35, S * 0.24, S * 0.12, 0, 0, TAU);
  x.fillStyle = 'rgba(255,255,255,0.6)';
  x.fill();
  return c;
}

function mkBooster(S: number): HTMLCanvasElement {
  const [c, x] = makeCanvas(S * 1.0, S * 1.2);
  const lw = Math.max(1.5, S * 0.045);
  rr(x, S * 0.1, S * 0.35, S * 0.8, S * 0.75, S * 0.16);
  inked(x, lw, grad(x, S * 0.35, S * 1.1, ['#ffe680', '#ff9a2e', '#ff3c7a']));
  x.beginPath();
  x.arc(S * 0.5, S * 0.68, S * 0.22, 0, TAU);
  inked(x, lw, '#2a1650');
  // raio
  x.beginPath();
  x.moveTo(S * 0.54, S * 0.5);
  x.lineTo(S * 0.42, S * 0.7);
  x.lineTo(S * 0.52, S * 0.7);
  x.lineTo(S * 0.46, S * 0.86);
  x.lineTo(S * 0.6, S * 0.64);
  x.lineTo(S * 0.5, S * 0.64);
  x.closePath();
  x.fillStyle = '#ffd84a';
  x.fill();
  rr(x, S * 0.3, S * 0.18, S * 0.4, S * 0.2, S * 0.06);
  inked(x, lw, '#d9d2f5');
  return c;
}

function mkShadow(S: number): HTMLCanvasElement {
  const [c, x] = makeCanvas(S, S * 0.4);
  const g = x.createRadialGradient(S / 2, S * 0.2, 0, S / 2, S * 0.2, S / 2);
  g.addColorStop(0, 'rgba(20,10,60,0.4)');
  g.addColorStop(1, 'rgba(20,10,60,0)');
  x.fillStyle = g;
  x.save();
  x.scale(1, 0.4);
  x.fillRect(0, 0, S, S);
  x.restore();
  return c;
}

function mkPuff(S: number): HTMLCanvasElement {
  const P = S * 0.3;
  const [c, x] = makeCanvas(P * 2, P * 2);
  x.beginPath();
  x.arc(P, P, P * 0.9, 0, TAU);
  x.fillStyle = 'rgba(255,255,255,0.9)';
  x.fill();
  return c;
}

function mkSpark(S: number, col = '#fff6b0'): HTMLCanvasElement {
  const P = S * 0.22;
  const [c, x] = makeCanvas(P * 2, P * 2);
  x.beginPath();
  x.moveTo(P, 0);
  x.quadraticCurveTo(P, P, P * 2, P);
  x.quadraticCurveTo(P, P, P, P * 2);
  x.quadraticCurveTo(P, P, 0, P);
  x.quadraticCurveTo(P, P, P, 0);
  x.fillStyle = col;
  x.fill();
  return c;
}

function mkConfetti(S: number, col: string): HTMLCanvasElement {
  const [c, x] = makeCanvas(S * 0.16, S * 0.1);
  x.fillStyle = col;
  x.fillRect(0, 0, S * 0.16, S * 0.1);
  return c;
}

const sheets = new Map<number, Sheet>();
export function getSheet(S: number, glows: boolean): Sheet {
  S = Math.max(12, Math.round(S));
  const key = S * 2 + (glows ? 1 : 0);
  let sh = sheets.get(key);
  if (sh) return sh;
  if (sheets.size > 1) sheets.clear();
  const belt: HTMLCanvasElement[] = [];
  for (let f = 0; f < BELT_FRAMES; f++) belt.push(mkBelt(S, f));
  const padIcon: Record<string, HTMLCanvasElement> = {};
  for (const k of ['dropper', 'upgrader', 'belt', 'helper', 'deco', 'turbo']) padIcon[k] = mkPadIcon(S, k);
  sh = {
    S,
    star: STAR_TIERS.map((c) => mkStar(S, c, false)),
    starGlow: STAR_TIERS.map((c) => mkStar(S, c, glows)),
    belt,
    collector: LINE_COLORS.map((c) => mkCollector(S, c)),
    dropper: LINE_COLORS.map((c) => mkDropper(S, c)),
    upgrader: mkUpgrader(S),
    upgGlow: mkGlow(S, '#5ef0ff'),
    cofre: mkCofre(S),
    padOn: mkPad(S, true),
    padOff: mkPad(S, false),
    padTurbo: mkPad(S, true, true),
    padIcon,
    garden: mkGarden(S),
    fountain: mkFountain(S),
    rocket: mkRocket(S),
    rocketBase: mkRocketBase(S),
    flame: mkFlame(S),
    drone: mkDrone(S),
    dock: mkDock(S),
    booster: mkBooster(S),
    shadow: mkShadow(S),
    puff: mkPuff(S),
    spark: mkSpark(S),
    zap: mkSpark(S * 1.8, '#9ffcff'),
    confetti: ['#ffd84a', '#ff7ae0', '#5ef0ff', '#3ee07a', '#ff9a2e'].map((c) => mkConfetti(S, c)),
  };
  sheets.set(key, sh);
  return sh;
}

/* ---------------------------- chão / ilha do lote ---------------------------- */

export const ISLAND_PAD = 0.45; // borda de grama (tiles)
export const ISLAND_DEPTH = 0.9; // face de terra abaixo

/** Ilha flutuante do lote: grama, piso de fábrica, cerquinha e placa com o nome. */
export function buildFloor(S: number, color: string, name: string): HTMLCanvasElement {
  const pad = ISLAND_PAD * S;
  const W = PLOT_W * S + pad * 2;
  const H = PLOT_H * S + pad * 2;
  const D = ISLAND_DEPTH * S;
  const [c, x] = makeCanvas(W, H + D);
  const lw = Math.max(2, S * 0.06);
  const r = S * 0.6;
  // face de terra (frente da ilha)
  x.beginPath();
  x.moveTo(0, H - r);
  x.lineTo(0, H - r + D * 0.4);
  x.quadraticCurveTo(W * 0.15, H + D, W * 0.5, H + D * 0.95);
  x.quadraticCurveTo(W * 0.85, H + D, W, H - r + D * 0.4);
  x.lineTo(W, H - r);
  x.closePath();
  x.fillStyle = grad(x, H - r, H + D, ['#8a5a9e', '#5a3a7a', '#3a2460']);
  x.fill();
  x.lineWidth = lw;
  x.strokeStyle = INK;
  x.stroke();
  // pedrinhas na terra
  x.fillStyle = 'rgba(255,255,255,0.12)';
  for (let i = 0; i < 9; i++) {
    x.beginPath();
    x.ellipse(W * (0.1 + i * 0.1), H + D * (0.15 + ((i * 37) % 5) * 0.08), S * 0.12, S * 0.06, 0, 0, TAU);
    x.fill();
  }
  // grama
  rr(x, lw / 2, lw / 2, W - lw, H - lw, r);
  inked(x, lw, grad(x, 0, H, ['#7df0a0', '#3ec46e']));
  // tufos
  x.fillStyle = 'rgba(255,255,255,0.18)';
  for (let i = 0; i < 26; i++) {
    const px = ((i * 97) % 100) / 100;
    const onTop = i % 2 === 0;
    const gx = onTop ? px * W : i % 4 === 1 ? pad * 0.4 : W - pad * 0.5;
    const gy = onTop ? (i % 4 === 0 ? pad * 0.45 : H - pad * 0.5) : px * H;
    x.beginPath();
    x.ellipse(gx, gy, S * 0.08, S * 0.04, 0, 0, TAU);
    x.fill();
  }
  // piso da fábrica (xadrez suave)
  x.save();
  rr(x, pad, pad, PLOT_W * S, PLOT_H * S, S * 0.25);
  x.clip();
  for (let ty = 0; ty < PLOT_H; ty++)
    for (let tx = 0; tx < PLOT_W; tx++) {
      x.fillStyle = (tx + ty) % 2 ? '#e9f7ef' : '#d6f0e2';
      x.fillRect(pad + tx * S, pad + ty * S, S, S);
    }
  x.fillStyle = 'rgba(255,255,255,0.35)';
  for (let ty = 0; ty < PLOT_H; ty++) x.fillRect(pad, pad + ty * S, PLOT_W * S, S * 0.03);
  // trilha de pedras amarela até o cofre
  x.fillStyle = 'rgba(255,207,46,0.35)';
  rr(x, pad + 0.4 * S, pad + 8.6 * S, 7.2 * S, 1.1 * S, S * 0.4);
  x.fill();
  x.restore();
  rr(x, pad, pad, PLOT_W * S, PLOT_H * S, S * 0.25);
  x.lineWidth = lw * 0.8;
  x.strokeStyle = 'rgba(42,11,92,0.35)';
  x.stroke();
  // placa com o nome (embaixo)
  x.font = `700 ${Math.round(S * 0.34)}px Fredoka, system-ui, sans-serif`;
  const tw = Math.min(W * 0.6, x.measureText(name).width + S * 0.6);
  const bx = W / 2 - tw / 2;
  const by = H - pad * 0.15;
  rr(x, bx, by - S * 0.05, tw, S * 0.5, S * 0.2);
  inked(x, lw * 0.8, color);
  x.fillStyle = '#ffffff';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineWidth = lw * 0.9;
  x.strokeStyle = INK;
  x.strokeText(name, W / 2, by + S * 0.2, tw - S * 0.3);
  x.fillText(name, W / 2, by + S * 0.2, tw - S * 0.3);
  // bandeirinhas de canto
  for (const fx of [pad * 0.9, W - pad * 0.9]) {
    x.strokeStyle = INK;
    x.lineWidth = lw * 0.8;
    x.beginPath();
    x.moveTo(fx, pad * 1.2);
    x.lineTo(fx, -S * 0.0 + pad * 0.1);
    x.stroke();
  }
  return c;
}

/* ---------------------------- personagens ---------------------------- */

const charCache = new Map<string, HTMLCanvasElement>();
/** Sprite do Bloop parado (2 direções do olhar), cacheado por skin+tamanho. */
export function charSprite(skinId: string, R: number, face: number): HTMLCanvasElement {
  R = Math.max(6, Math.round(R));
  const key = `${skinId}|${R}|${face > 0 ? 1 : 0}`;
  let c = charCache.get(key);
  if (c) return c;
  const P = Math.ceil(R * 1.9);
  const [cv, x] = makeCanvas(P * 2, P * 2);
  x.translate(P, P * 1.08);
  try {
    drawPlayer(x, skinById(skinId), R, { t: 0.5, blink: 0, lookX: face > 0 ? 0.35 : -0.35, lookY: 0.15, sx: 1, sy: 1, mood: 'idle', lx: -0.55, ly: -0.83, still: true });
  } catch {
    x.beginPath();
    x.arc(0, 0, R, 0, TAU);
    x.fillStyle = '#ff8fd8';
    x.fill();
  }
  if (charCache.size > 40) charCache.clear();
  charCache.set(key, cv);
  return cv;
}
export function clearCharCache(): void {
  charCache.clear();
}

/* ---------------------------- fundo (céu) ---------------------------- */
export function buildSky(w: number, h: number, S: number): HTMLCanvasElement {
  const [c, x] = makeCanvas(w, h);
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#20104a');
  g.addColorStop(0.55, '#2b1660');
  g.addColorStop(1, '#14352f');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 90; i++) {
    const px = rnd() * w;
    const py = rnd() * h;
    const r = (0.6 + rnd() * 1.6) * (S / 40);
    x.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.6})`;
    x.beginPath();
    x.arc(px, py, r, 0, TAU);
    x.fill();
  }
  for (let i = 0; i < 6; i++) {
    starPath(x, rnd() * w, rnd() * h, S * 0.12, S * 0.05);
    x.fillStyle = 'rgba(255,216,74,0.5)';
    x.fill();
  }
  return c;
}
