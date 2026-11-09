/**
 * RENDERIZAÇÃO DOS BICHINHOS — biblioteca procedural de peças (Canvas 2D).
 *
 * Espaço local: 100 unidades = sizePx, criatura centrada em (0,0).
 * Desempenho: cada criatura vira 3 sprites estáticos por tamanho (asas/cauda, corpo, corpo piscando),
 * guardados num cache LRU. Por quadro só desenhamos sprites + poucas partículas (sem alocar).
 */
import { bus } from '../core/events';
import type { CreatureRarity } from './api';
import { creatureById, type CreatureDesign, type CreatureFull, type FxKind } from './catalog';
import { gameFont } from '../i18n/font';

/* ============================== cores ============================== */

const rgbCache = new Map<string, [number, number, number]>();
function rgb(hex: string): [number, number, number] {
  let v = rgbCache.get(hex);
  if (!v) {
    const n = parseInt(hex.slice(1), 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache.set(hex, v);
  }
  return v;
}
function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  const h = (i: number) => Math.round(x[i] + (y[i] - x[i]) * t).toString(16).padStart(2, '0');
  return `#${h(0)}${h(1)}${h(2)}`;
}
const lighten = (c: string, t: number) => mix(c, '#ffffff', t);
const darken = (c: string, t: number) => mix(c, '#1a0638', t);
function luma(c: string): number {
  const [r, g, b] = rgb(c);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
function alpha(c: string, a: number): string {
  const [r, g, b] = rgb(c);
  return `rgba(${r},${g},${b},${a})`;
}

interface Pal {
  body: string;
  light: string;
  dark: string;
  ink: string;
  belly: string;
  acc: string;
  acc2: string;
  accLight: string;
  gold: string;
  pupil: string;
  cheek: string;
}

function palette(d: CreatureDesign): Pal {
  const body = d.col;
  const L = luma(body);
  return {
    body,
    light: lighten(body, 0.45),
    dark: darken(body, 0.28),
    ink: L < 0.25 ? '#0d0420' : mix(body, '#2a0b5c', 0.78),
    belly: L > 0.85 ? mix(body, d.acc2, 0.25) : lighten(body, 0.6),
    acc: d.acc,
    acc2: d.acc2,
    accLight: lighten(d.acc, 0.5),
    gold: '#ffd84a',
    pupil: '#24123f',
    cheek: '#ff6f9f',
  };
}

/* ============================== geometria ============================== */

type C = CanvasRenderingContext2D;

interface Geo {
  top: number;
  bottom: number;
  w: number; // meia largura
  hw: number; // meia largura do topo da cabeça (chapéus)
  eyeY: number;
  eyeDX: number;
  eyeR: number;
  mouthY: number;
  earX: number;
  earY: number;
  handY: number;
  neckY: number;
  float?: boolean;
  path(c: C): void;
}

function rr(c: C, x: number, y: number, w: number, h: number, r: number): void {
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
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
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) c.moveTo(px, py);
    else c.lineTo(px, py);
  }
  c.closePath();
}
function heartPath(c: C, x: number, y: number, s: number): void {
  c.moveTo(x, y + s * 0.9);
  c.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.7, y - s * 1.1, x, y - s * 0.35);
  c.bezierCurveTo(x + s * 0.7, y - s * 1.1, x + s * 1.4, y - s * 0.1, x, y + s * 0.9);
  c.closePath();
}

const base = (o: Partial<Geo> & { path(c: C): void }): Geo => ({
  top: -24,
  bottom: 29,
  w: 27,
  hw: 18,
  eyeY: 2,
  eyeDX: 10,
  eyeR: 5.2,
  mouthY: 11,
  earX: 15,
  earY: -16,
  handY: 14,
  neckY: 17,
  ...o,
});

const GEOS: Record<string, Geo> = {
  blob: base({
    top: -22,
    path: (c) => {
      c.moveTo(0, -22);
      c.bezierCurveTo(18, -22, 29, -10, 29, 8);
      c.bezierCurveTo(29, 24, 18, 29, 0, 29);
      c.bezierCurveTo(-18, 29, -29, 24, -29, 8);
      c.bezierCurveTo(-29, -10, -18, -22, 0, -22);
      c.closePath();
    },
  }),
  bean: base({
    top: -29, w: 22, hw: 15, eyeY: -6, eyeDX: 8.5, mouthY: 3, earX: 11, earY: -24, handY: 10, neckY: 9,
    path: (c) => rr(c, -22, -29, 44, 59, 21),
  }),
  egg: base({
    top: -29, w: 24, hw: 13, eyeY: 2, eyeDX: 9, mouthY: 11, earX: 10, earY: -24,
    path: (c) => {
      c.moveTo(0, -29);
      c.bezierCurveTo(15, -29, 25, -2, 25, 10);
      c.bezierCurveTo(25, 23, 14, 30, 0, 30);
      c.bezierCurveTo(-14, 30, -25, 23, -25, 10);
      c.bezierCurveTo(-25, -2, -15, -29, 0, -29);
      c.closePath();
    },
  }),
  cone: base({
    top: -30, w: 28, hw: 8, eyeY: 8, eyeDX: 9, mouthY: 16, earX: 7, earY: -22, handY: 18, neckY: 22,
    path: (c) => {
      c.moveTo(-4, -28);
      c.quadraticCurveTo(0, -33, 4, -28);
      c.lineTo(27, 20);
      c.quadraticCurveTo(30, 29, 20, 29);
      c.lineTo(-20, 29);
      c.quadraticCurveTo(-30, 29, -27, 20);
      c.closePath();
    },
  }),
  cat: base({
    top: -20, w: 30, hw: 19, eyeY: 3, eyeDX: 11,
    path: (c) => {
      c.moveTo(0, -20);
      c.bezierCurveTo(20, -20, 27, -10, 28, 2);
      c.quadraticCurveTo(32, 8, 28, 13);
      c.bezierCurveTo(27, 25, 16, 29, 0, 29);
      c.bezierCurveTo(-16, 29, -27, 25, -28, 13);
      c.quadraticCurveTo(-32, 8, -28, 2);
      c.bezierCurveTo(-27, -10, -20, -20, 0, -20);
      c.closePath();
    },
  }),
  fox: base({
    top: -20, w: 30, hw: 18, eyeY: 2, eyeDX: 11,
    path: (c) => {
      c.moveTo(0, -20);
      c.bezierCurveTo(19, -20, 27, -9, 27, 4);
      c.lineTo(33, 12);
      c.lineTo(26, 14);
      c.bezierCurveTo(24, 25, 14, 29, 0, 29);
      c.bezierCurveTo(-14, 29, -24, 25, -26, 14);
      c.lineTo(-33, 12);
      c.lineTo(-27, 4);
      c.bezierCurveTo(-27, -9, -19, -20, 0, -20);
      c.closePath();
    },
  }),
  bird: base({
    top: -24, w: 26, hw: 16, eyeY: -2, eyeDX: 9.5, mouthY: 6, earX: 12, earY: -19,
    path: (c) => ell(c, 0, 3, 26, 27),
  }),
  dino: base({
    top: -27, w: 24, hw: 15, eyeY: -6, eyeDX: 9, mouthY: 4, earX: 11, earY: -22, handY: 10, neckY: 10,
    path: (c) => {
      c.moveTo(0, -27);
      c.bezierCurveTo(16, -27, 23, -16, 23, -4);
      c.bezierCurveTo(23, 6, 26, 14, 25, 20);
      c.bezierCurveTo(24, 28, 14, 30, 0, 30);
      c.bezierCurveTo(-14, 30, -24, 28, -25, 20);
      c.bezierCurveTo(-26, 14, -23, 6, -23, -4);
      c.bezierCurveTo(-23, -16, -16, -27, 0, -27);
      c.closePath();
    },
  }),
  jelly: base({
    top: -24, bottom: 12, w: 28, hw: 19, eyeY: -3, eyeDX: 10, mouthY: 5, earY: -18, handY: 6, neckY: 8, float: true,
    path: (c) => {
      c.moveTo(-28, 8);
      c.bezierCurveTo(-29, -14, -16, -24, 0, -24);
      c.bezierCurveTo(16, -24, 29, -14, 28, 8);
      for (let i = 0; i < 4; i++) {
        const x0 = 28 - i * 14;
        c.quadraticCurveTo(x0 - 3.5, 14, x0 - 7, 9);
        c.quadraticCurveTo(x0 - 10.5, 14, x0 - 14, 8);
      }
      c.closePath();
    },
  }),
  fish: base({
    top: -20, bottom: 22, w: 26, hw: 15, eyeY: -1, eyeDX: 9, mouthY: 8, earY: -15, handY: 8, neckY: 12, float: true,
    path: (c) => ell(c, -2, 1, 27, 21),
  }),
  bug: base({
    top: -22, w: 27, hw: 15, eyeY: -4, eyeDX: 9,  mouthY: 5, earX: 9, earY: -18,
    path: (c) => ell(c, 0, 4, 27, 26),
  }),
  sprout: base({
    top: -24, w: 25, hw: 12, eyeY: 6, eyeDX: 9, mouthY: 14, earX: 4, earY: -22,
    path: (c) => {
      c.moveTo(0, -24);
      c.bezierCurveTo(6, -16, 25, -10, 25, 8);
      c.bezierCurveTo(25, 23, 14, 29, 0, 29);
      c.bezierCurveTo(-14, 29, -25, 23, -25, 8);
      c.bezierCurveTo(-25, -10, -6, -16, 0, -24);
      c.closePath();
    },
  }),
  cloud: base({
    top: -20, bottom: 22, w: 33, hw: 14, eyeY: 2, eyeDX: 10, mouthY: 10, earX: 8, earY: -16, handY: 10, neckY: 14, float: true,
    path: (c) => {
      c.moveTo(-24, 22);
      c.arc(-24, 10, 12, Math.PI / 2, Math.PI * 1.35);
      c.arc(-10, -6, 13, Math.PI * 1.1, Math.PI * 1.75);
      c.arc(6, -10, 13, Math.PI * 1.2, Math.PI * 1.95);
      c.arc(21, 3, 12, Math.PI * 1.45, Math.PI * 0.2);
      c.arc(21, 12, 10, -Math.PI * 0.1, Math.PI / 2);
      c.closePath();
    },
  }),
  robot: base({
    top: -24, w: 25, hw: 19, eyeY: -2, eyeDX: 9.5, mouthY: 9, earX: 13, earY: -22,
    path: (c) => rr(c, -25, -24, 50, 53, 10),
  }),
  ghost: base({
    top: -27, bottom: 26, w: 25, hw: 16, eyeY: -5, eyeDX: 9, mouthY: 5, earY: -22, handY: 8, neckY: 10, float: true,
    path: (c) => {
      c.moveTo(-25, 24);
      c.lineTo(-25, -4);
      c.bezierCurveTo(-25, -19, -14, -27, 0, -27);
      c.bezierCurveTo(14, -27, 25, -19, 25, -4);
      c.lineTo(25, 24);
      c.quadraticCurveTo(21, 30, 16, 24);
      c.quadraticCurveTo(12, 19, 8, 24);
      c.quadraticCurveTo(4, 30, 0, 24);
      c.quadraticCurveTo(-4, 19, -8, 24);
      c.quadraticCurveTo(-12, 30, -16, 24);
      c.quadraticCurveTo(-21, 19, -25, 24);
      c.closePath();
    },
  }),
  star: base({
    top: -32, w: 31, hw: 7, eyeY: 2, eyeDX: 8, eyeR: 4.6, mouthY: 10, earX: 6, earY: -26, handY: 2, neckY: 15,
    path: (c) => {
      c.lineJoin = 'round';
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? 16 : 32;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r + 3;
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.closePath();
    },
  }),
  slime: base({
    top: -16, w: 30, hw: 15, eyeY: 6, eyeDX: 10, mouthY: 14, earX: 10, earY: -12, handY: 16, neckY: 20,
    path: (c) => {
      c.moveTo(-30, 26);
      c.bezierCurveTo(-31, 4, -18, -16, 0, -16);
      c.bezierCurveTo(18, -16, 31, 4, 30, 26);
      c.quadraticCurveTo(30, 30, 24, 29);
      c.lineTo(-24, 29);
      c.quadraticCurveTo(-30, 30, -30, 26);
      c.closePath();
      ell(c, 19, 31, 3, 3.6);
      ell(c, -12, 32, 2.6, 3.4);
    },
  }),
  fluff: base({
    top: -27, w: 29, hw: 17, eyeY: 2, eyeDX: 10,
    path: (c) => {
      const n = 18;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const a2 = ((i + 0.5) / n) * Math.PI * 2;
        const x = Math.cos(a) * 27;
        const y = Math.sin(a) * 26 + 2;
        if (i === 0) c.moveTo(x, y);
        else c.quadraticCurveTo(Math.cos(a2 - Math.PI / n) * 31, Math.sin(a2 - Math.PI / n) * 30 + 2, x, y);
      }
      c.closePath();
    },
  }),
  dragon: base({
    top: -26, w: 25, hw: 16, eyeY: -5, eyeDX: 9.5, mouthY: 5, earX: 12, earY: -21, handY: 11, neckY: 11,
    path: (c) => {
      c.moveTo(0, -26);
      c.bezierCurveTo(18, -26, 25, -14, 25, 0);
      c.bezierCurveTo(25, 20, 18, 30, 0, 30);
      c.bezierCurveTo(-18, 30, -25, 20, -25, 0);
      c.bezierCurveTo(-25, -14, -18, -26, 0, -26);
      c.closePath();
    },
  }),
  bunny: base({
    top: -24, w: 25, hw: 15, eyeY: -2, eyeDX: 9.5, mouthY: 7, earX: 10, earY: -20,
    path: (c) => {
      c.moveTo(0, -24);
      c.bezierCurveTo(16, -24, 22, -12, 22, 0);
      c.bezierCurveTo(26, 8, 26, 30, 0, 30);
      c.bezierCurveTo(-26, 30, -26, 8, -22, 0);
      c.bezierCurveTo(-22, -12, -16, -24, 0, -24);
      c.closePath();
    },
  }),
  bear: base({
    top: -23, w: 28, hw: 18, eyeY: 0, eyeDX: 10.5, mouthY: 11, earX: 17, earY: -16,
    path: (c) => ell(c, 0, 3, 28, 26),
  }),
  penguin: base({
    top: -27, w: 25, hw: 14, eyeY: -5, eyeDX: 8.5, mouthY: 2, earX: 10, earY: -22, handY: 10, neckY: 7,
    path: (c) => {
      c.moveTo(0, -27);
      c.bezierCurveTo(16, -27, 24, -8, 25, 10);
      c.bezierCurveTo(26, 24, 15, 30, 0, 30);
      c.bezierCurveTo(-15, 30, -26, 24, -25, 10);
      c.bezierCurveTo(-24, -8, -16, -27, 0, -27);
      c.closePath();
    },
  }),
  mushroom: base({
    top: -30, w: 32, hw: 20, eyeY: 9, eyeDX: 7.5, eyeR: 4.6, mouthY: 17, earX: 14, earY: -24, handY: 16, neckY: 22,
    path: (c) => rr(c, -15, -6, 30, 35, 12),
  }),
  cube: base({
    top: -25, w: 26, hw: 20, eyeY: 0, eyeDX: 10, mouthY: 10, earX: 14, earY: -22,
    path: (c) => rr(c, -26, -25, 52, 54, 11),
  }),
  seal: base({
    top: -12, w: 31, hw: 18, eyeY: 4, eyeDX: 10, mouthY: 13, earX: 15, earY: -8, handY: 18, neckY: 20,
    path: (c) => {
      c.moveTo(0, -12);
      c.bezierCurveTo(22, -12, 32, 2, 32, 14);
      c.bezierCurveTo(32, 26, 20, 29, 0, 29);
      c.bezierCurveTo(-20, 29, -32, 26, -32, 14);
      c.bezierCurveTo(-32, 2, -22, -12, 0, -12);
      c.closePath();
    },
  }),
  gem: base({
    top: -30, w: 27, hw: 12, eyeY: 2, eyeDX: 9, mouthY: 11, earX: 10, earY: -24,
    path: (c) => {
      c.moveTo(-12, -30);
      c.lineTo(12, -30);
      c.lineTo(27, -12);
      c.lineTo(27, 8);
      c.lineTo(0, 31);
      c.lineTo(-27, 8);
      c.lineTo(-27, -12);
      c.closePath();
    },
  }),
  drop: base({
    top: -33, w: 25, hw: 10, eyeY: 6, eyeDX: 9, mouthY: 15, earX: 6, earY: -25, handY: 16, neckY: 21,
    path: (c) => {
      c.moveTo(0, -33);
      c.bezierCurveTo(6, -22, 25, -8, 25, 9);
      c.bezierCurveTo(25, 22, 14, 30, 0, 30);
      c.bezierCurveTo(-14, 30, -25, 22, -25, 9);
      c.bezierCurveTo(-25, -8, -6, -22, 0, -33);
      c.closePath();
    },
  }),
  octo: base({
    top: -27, bottom: 18, w: 26, hw: 18, eyeY: -4, eyeDX: 9.5, mouthY: 5, earY: -20, handY: 8, neckY: 12,
    path: (c) => ell(c, 0, -3, 26, 24),
  }),
  snail: base({
    top: -16, w: 22, hw: 13, eyeY: 2, eyeDX: 8, eyeR: 4.8, mouthY: 11, earX: 8, earY: -12, handY: 14, neckY: 18,
    path: (c) => rr(c, -20, -16, 40, 46, 18),
  }),
};

/* ============================== desenho básico ============================== */

let LW = 2.4;
let INK = '#2a0b5c';

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
function stroke(c: C, color: string, w: number, fn: (c: C) => void, outline = true): void {
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

/* ============================== topo (atrás do corpo) ============================== */

const LEAF = '#4fcf6a';

function drawTop(c: C, g: Geo, d: CreatureDesign, p: Pal): void {
  const ex = g.earX;
  const ey = g.earY;
  switch (d.top) {
    case 'cat':
      for (const s of [-1, 1]) {
        shape(c, p.body, (c) => { c.moveTo(s * (ex - 9), ey + 8); c.lineTo(s * (ex + 6), ey - 14); c.lineTo(s * (ex + 9), ey + 8); c.closePath(); });
        shape(c, p.cheek, (c) => { c.moveTo(s * (ex - 3), ey + 4); c.lineTo(s * (ex + 5), ey - 8); c.lineTo(s * (ex + 5), ey + 5); c.closePath(); }, 0);
      }
      break;
    case 'fox':
      for (const s of [-1, 1]) {
        shape(c, p.body, (c) => { c.moveTo(s * (ex - 9), ey + 9); c.quadraticCurveTo(s * (ex + 2), ey - 18, s * (ex + 5), ey - 21); c.quadraticCurveTo(s * (ex + 11), ey - 6, s * (ex + 10), ey + 9); c.closePath(); });
        shape(c, p.dark, (c) => { c.moveTo(s * (ex - 2), ey + 4); c.quadraticCurveTo(s * (ex + 3), ey - 10, s * (ex + 5), ey - 15); c.quadraticCurveTo(s * (ex + 8), ey - 4, s * (ex + 6), ey + 5); c.closePath(); }, 0);
      }
      break;
    case 'bunny':
      for (const s of [-1, 1]) {
        shape(c, p.body, (c) => ell(c, s * (ex - 1), ey - 15, 7, 18, s * 0.18));
        shape(c, p.cheek, (c) => ell(c, s * (ex - 1), ey - 14, 3.5, 13, s * 0.18), 0);
      }
      break;
    case 'bear':
      for (const s of [-1, 1]) {
        shape(c, p.body, (c) => circ(c, s * ex, ey, 8.5));
        shape(c, p.belly, (c) => circ(c, s * ex, ey + 0.5, 4.5), 0);
      }
      break;
    case 'droop':
      for (const s of [-1, 1]) shape(c, p.dark, (c) => ell(c, s * (g.w - 1), ey + 16, 7.5, 15, s * -0.3));
      break;
    case 'bigears':
      for (const s of [-1, 1]) {
        shape(c, p.body, (c) => ell(c, s * (g.w + 1), ey + 10, 13, 15, s * 0.2));
        shape(c, p.cheek, (c) => ell(c, s * (g.w + 1), ey + 11, 7.5, 9.5, s * 0.2), 0);
      }
      break;
    case 'antlers':
      for (const s of [-1, 1]) {
        stroke(c, '#e7c08a', 3.2, (c) => {
          c.moveTo(s * 9, g.top + 6); c.quadraticCurveTo(s * 14, g.top - 8, s * 22, g.top - 18);
          c.moveTo(s * 15, g.top - 6); c.lineTo(s * 9, g.top - 15);
          c.moveTo(s * 19, g.top - 13); c.lineTo(s * 26, g.top - 9);
        });
      }
      if (d.props.length && luma(p.acc) > 0) for (const s of [-1, 1]) { c.beginPath(); starPath(c, s * 22, g.top - 19, 3.5, 1.5); c.fillStyle = p.gold; c.fill(); }
      break;
    case 'horns':
      for (const s of [-1, 1]) shape(c, '#fff3d6', (c) => { c.moveTo(s * (ex - 4), ey + 6); c.quadraticCurveTo(s * (ex + 2), ey - 12, s * (ex + 8), ey - 12); c.quadraticCurveTo(s * (ex + 5), ey - 2, s * (ex + 5), ey + 6); c.closePath(); });
      break;
    case 'ramhorns':
      for (const s of [-1, 1]) {
        shape(c, p.gold, (c) => circ(c, s * (g.w - 3), ey + 9, 10));
        stroke(c, '#e09a1a', 2, (c) => { c.arc(s * (g.w - 3), ey + 9, 5.5, 0, Math.PI * 1.5); }, false);
      }
      break;
    case 'unihorn': {
      const ty = g.top + 3;
      shape(c, p.gold, (c) => { c.moveTo(-6, ty); c.lineTo(0, ty - 22); c.lineTo(6, ty); c.closePath(); });
      stroke(c, '#fff6c2', 1.6, (c) => { c.moveTo(-4, ty - 5); c.lineTo(3.5, ty - 8); c.moveTo(-2.5, ty - 11); c.lineTo(2.5, ty - 13); }, false);
      break;
    }
    case 'antennae':
      for (const s of [-1, 1]) {
        stroke(c, p.dark, 2, (c) => { c.moveTo(s * 7, g.top + 4); c.quadraticCurveTo(s * 8, g.top - 10, s * 15, g.top - 14); });
        shape(c, p.acc, (c) => circ(c, s * 15, g.top - 14, 4));
      }
      break;
    case 'crest':
      for (let i = -1; i <= 1; i++) shape(c, i === 0 ? p.acc : p.dark, (c) => ell(c, i * 5, g.top - 7 + Math.abs(i) * 3, 3.6, 10, i * 0.45));
      break;
    case 'tufts':
      for (const s of [-1, 1]) shape(c, p.dark, (c) => { c.moveTo(s * (ex - 7), ey + 6); c.lineTo(s * (ex + 10), ey - 12); c.lineTo(s * (ex + 8), ey + 8); c.closePath(); });
      break;
    case 'sprout':
      stroke(c, '#3a9a4a', 3, (c) => { c.moveTo(0, g.top + 4); c.lineTo(0, g.top - 7); });
      shape(c, LEAF, (c) => ell(c, 6, g.top - 9, 7, 3.6, -0.5));
      break;
    case 'leaves':
      for (let i = -1; i <= 1; i++) shape(c, i ? LEAF : '#7ee05a', (c) => ell(c, i * 8, g.top - 8 + Math.abs(i) * 3, 4.6, 12, i * 0.6));
      break;
    case 'spikes':
      for (let i = -1; i <= 1; i++) shape(c, p.acc2, (c) => { const x = i * 9; const y = g.top + 3 + Math.abs(i) * 3; c.moveTo(x - 5, y + 3); c.lineTo(x, y - 9); c.lineTo(x + 5, y + 3); c.closePath(); });
      break;
    case 'fin':
      shape(c, p.dark, (c) => { c.moveTo(-9, g.top + 5); c.quadraticCurveTo(-2, g.top - 16, 12, g.top - 12); c.quadraticCurveTo(6, g.top - 2, 9, g.top + 6); c.closePath(); });
      break;
    case 'flame':
      shape(c, p.acc, (c) => { c.moveTo(-11, g.top + 6); c.quadraticCurveTo(-14, g.top - 10, -3, g.top - 20); c.quadraticCurveTo(-2, g.top - 10, 3, g.top - 9); c.quadraticCurveTo(4, g.top - 18, 9, g.top - 22); c.quadraticCurveTo(16, g.top - 6, 11, g.top + 6); c.closePath(); });
      shape(c, '#ffe9a0', (c) => ell(c, 1, g.top - 3, 5, 7), 0);
      break;
    case 'curl':
      stroke(c, p.dark, 3.2, (c) => { c.moveTo(0, g.top + 3); c.bezierCurveTo(0, g.top - 10, 10, g.top - 12, 9, g.top - 5); c.bezierCurveTo(8, g.top - 1, 3, g.top - 3, 5, g.top - 6); });
      break;
    case 'tuft':
      for (let i = 0; i < 4; i++) shape(c, i % 2 ? p.acc : p.acc2, (c) => circ(c, -8 + i * 5.5, g.top - 2 - (i === 1 || i === 2 ? 5 : 1), 5.5));
      break;
    case 'gills':
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) shape(c, p.cheek, (c) => ell(c, s * (g.w + 3), g.eyeY - 8 + i * 7, 7, 2.8, s * (-0.5 + i * 0.45)));
      break;
    case 'bolt':
      stroke(c, '#8a93a8', 2.4, (c) => { c.moveTo(0, g.top + 2); c.lineTo(0, g.top - 10); });
      shape(c, p.acc, (c) => circ(c, 0, g.top - 12, 4.5));
      shine(c, -1.4, g.top - 13.5, 1.6, 1.2, 0.8);
      break;
    case 'propeller':
      stroke(c, '#8a93a8', 2.4, (c) => { c.moveTo(0, g.top + 2); c.lineTo(0, g.top - 8); });
      shape(c, p.acc, (c) => { ell(c, -9, g.top - 9, 9, 2.8); ell(c, 9, g.top - 9, 9, 2.8); });
      shape(c, p.acc2, (c) => circ(c, 0, g.top - 9, 2.6));
      break;
    case 'mane': {
      const cy = (g.top + g.bottom) / 2 - 2;
      const R = g.w + 7;
      c.beginPath();
      for (let i = 0; i <= 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const x = Math.cos(a) * R;
        const y = cy + Math.sin(a) * (R - 2);
        if (i === 0) c.moveTo(x, y);
        else {
          const am = ((i - 0.5) / 14) * Math.PI * 2;
          c.quadraticCurveTo(Math.cos(am) * (R + 7), cy + Math.sin(am) * (R + 5), x, y);
        }
      }
      c.closePath();
      c.fillStyle = mix(p.acc, p.dark, 0.25);
      c.fill();
      c.lineWidth = LW;
      c.strokeStyle = INK;
      c.stroke();
      break;
    }
    case 'knobs':
      for (const s of [-1, 1]) {
        stroke(c, p.body, 3.4, (c) => { c.moveTo(s * 6, g.top + 4); c.lineTo(s * 8, g.top - 8); });
        shape(c, p.dark, (c) => circ(c, s * 8, g.top - 9, 3.6));
      }
      break;
    case 'flower':
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        shape(c, i % 2 ? p.acc : lighten(p.acc, 0.3), (c) => circ(c, Math.cos(a) * 5, g.top - 6 + Math.sin(a) * 5, 4.2));
      }
      shape(c, p.gold, (c) => circ(c, 0, g.top - 6, 3));
      break;
    case 'crystals':
      for (let i = -1; i <= 1; i++) {
        const x = i * 9;
        const h = i === 0 ? 18 : 12;
        const y = g.top + 4 + Math.abs(i) * 3;
        shape(c, i === 0 ? lighten(p.acc2, 0.3) : p.acc2, (c) => { c.moveTo(x - 4.5, y); c.lineTo(x - 4.5, y - h + 5); c.lineTo(x, y - h); c.lineTo(x + 4.5, y - h + 5); c.lineTo(x + 4.5, y); c.closePath(); });
        shine(c, x - 1.6, y - h + 7, 1, 3, 0.7, 0);
      }
      break;
    case 'lure':
      stroke(c, p.dark, 2.2, (c) => { c.moveTo(0, g.top + 3); c.quadraticCurveTo(4, g.top - 18, 16, g.top - 12); });
      shape(c, '#fff6a0', (c) => circ(c, 16, g.top - 10, 4.5));
      break;
    case 'vfin':
      shape(c, p.gold, (c) => { c.moveTo(-3, g.top + 4); c.lineTo(-18, g.top - 10); c.lineTo(0, g.top - 1); c.lineTo(18, g.top - 10); c.lineTo(3, g.top + 4); c.closePath(); });
      break;
  }
  // olhos de sapo / pedúnculos ficam atrás do corpo
  if (d.eyes === 'frog') for (const s of [-1, 1]) shape(c, p.body, (c) => circ(c, s * g.eyeDX, g.top + 2, 8));
  if (d.eyes === 'stalk') for (const s of [-1, 1]) stroke(c, p.body, 3.4, (c) => { c.moveTo(s * 6, g.top + 4); c.lineTo(s * 10, g.top - 9); });
}

/* ============================== membros ============================== */

function drawBackLimbs(c: C, g: Geo, d: CreatureDesign, p: Pal): void {
  const L = d.limbs;
  const wy = g.handY - 14;
  const wingCol = d.arch === 'dragon' ? p.acc : lighten(p.acc2, 0.25);
  if (L === 'wings')
    for (const s of [-1, 1]) {
      shape(c, wingCol, (c) => ell(c, s * (g.w + 7), wy, 11, 7, s * -0.5));
      shine(c, s * (g.w + 5), wy - 2, 4, 2, 0.5, s * -0.5);
    }
  if (L === 'bigwings')
    for (const s of [-1, 1]) {
      shape(c, wingCol, (c) => {
        const x0 = s * (g.w - 6);
        c.moveTo(x0, wy + 8);
        c.quadraticCurveTo(s * (g.w + 6), wy - 22, s * (g.w + 26), wy - 20);
        c.quadraticCurveTo(s * (g.w + 22), wy - 12, s * (g.w + 24), wy - 8);
        c.quadraticCurveTo(s * (g.w + 18), wy - 4, s * (g.w + 20), wy + 2);
        c.quadraticCurveTo(s * (g.w + 12), wy + 2, s * (g.w + 12), wy + 10);
        c.quadraticCurveTo(s * (g.w + 2), wy + 6, x0, wy + 8);
        c.closePath();
      });
      shine(c, s * (g.w + 10), wy - 12, 7, 2.4, 0.45, s * -0.4);
    }
  if (L === 'batwings')
    for (const s of [-1, 1])
      shape(c, darken(p.acc2, 0.35), (c) => {
        const x0 = s * (g.w - 5);
        c.moveTo(x0, wy - 2);
        c.lineTo(s * (g.w + 20), wy - 14);
        c.quadraticCurveTo(s * (g.w + 18), wy - 2, s * (g.w + 22), wy + 6);
        c.quadraticCurveTo(s * (g.w + 13), wy + 2, s * (g.w + 12), wy + 10);
        c.quadraticCurveTo(s * (g.w + 6), wy + 5, x0, wy + 10);
        c.closePath();
      });
  if (L === 'bfwings')
    for (const s of [-1, 1]) {
      shape(c, p.acc, (c) => ell(c, s * (g.w + 9), wy - 6, 12, 10, s * -0.4));
      shape(c, p.acc2, (c) => ell(c, s * (g.w + 6), wy + 10, 8, 7, s * 0.4));
      shape(c, '#ffffff', (c) => circ(c, s * (g.w + 11), wy - 7, 3), 0);
    }
  const tailX = g.w - 4;
  const ty = g.bottom - 8;
  const tail = L === 'tail' || ((d.arch === 'dino' || d.arch === 'dragon') && L !== 'fluffytail');
  if (tail) {
    if (d.arch === 'dino' || d.arch === 'dragon')
      shape(c, p.body, (c) => { c.moveTo(tailX - 6, ty - 8); c.quadraticCurveTo(tailX + 18, ty - 2, tailX + 22, ty - 16); c.quadraticCurveTo(tailX + 22, ty + 6, tailX - 4, ty + 6); c.closePath(); });
    else stroke(c, p.body, 5, (c) => { c.moveTo(tailX - 2, ty); c.bezierCurveTo(tailX + 16, ty + 2, tailX + 10, ty - 22, tailX + 20, ty - 24); });
  }
  if (L === 'fluffytail') {
    shape(c, p.body, (c) => ell(c, tailX + 12, ty - 12, 10, 16, 0.6));
    shape(c, '#ffffff', (c) => ell(c, tailX + 18, ty - 23, 5, 6, 0.6), 0);
  }
  if (d.arch === 'fish') shape(c, p.acc2, (c) => { c.moveTo(20, 1); c.lineTo(36, -12); c.quadraticCurveTo(31, 1, 36, 14); c.closePath(); });
  if (d.arch === 'bunny') shape(c, '#ffffff', (c) => circ(c, g.w - 1, g.bottom - 8, 6.5));
  if (d.arch === 'snail') {
    shape(c, p.acc2, (c) => circ(c, 12, -4, 19));
    stroke(c, darken(p.acc2, 0.3), 2.4, (c) => { c.arc(12, -4, 12, 0, Math.PI * 1.6); c.arc(13, -3, 6, Math.PI * 1.6, Math.PI * 3.4, false); }, false);
    if (d.pattern === 'rainbow') rainbowArcs(c, 12, -4, 17);
  }
  if (d.arch === 'jelly')
    for (let i = 0; i < 4; i++) stroke(c, lighten(p.body, 0.2), 3.2, (c) => { const x = -15 + i * 10; c.moveTo(x, 8); c.bezierCurveTo(x - 5, 16, x + 5, 22, x - 1, 32); });
}

function drawFrontLimbs(c: C, g: Geo, d: CreatureDesign, p: Pal): void {
  const L = d.limbs;
  const b = g.bottom;
  if (L === 'feet' || d.arch === 'penguin' || (d.arch === 'bird' && L !== 'bigwings'))
    for (const s of [-1, 1]) shape(c, d.arch === 'penguin' || d.arch === 'bird' ? '#ffa23a' : p.dark, (c) => ell(c, s * 10, b, 7.5, 4.5));
  if (L === 'arms' || L === 'cactusarms' || L === 'leafarms' || L === 'claws' || L === 'flippers' || L === 'fins') {
    for (const s of [-1, 1]) {
      const x = s * (g.w - 1);
      const y = g.handY;
      if (L === 'arms') shape(c, p.body, (c) => ell(c, x + s * 2, y, 6, 5, s * 0.4));
      if (L === 'flippers') shape(c, p.dark, (c) => ell(c, x + s * 3, y - 2, 4.5, 10, s * -0.5));
      if (L === 'fins') shape(c, p.acc2, (c) => ell(c, x + s * 4, y - 3, 7, 3.6, s * 0.4));
      if (L === 'leafarms') shape(c, LEAF, (c) => ell(c, x + s * 6, y - 4, 8, 3.8, s * -0.5));
      if (L === 'cactusarms') shape(c, p.body, (c) => { rr(c, s > 0 ? x - 2 : x - 7, y - 6, 9, 7, 3.5); rr(c, s > 0 ? x + 2 : x - 7, y - 18, 7, 16, 3.5); });
      if (L === 'claws') {
        shape(c, p.body, (c) => { c.moveTo(x, y); c.lineTo(x + s * 8, y - 10); c.lineTo(x + s * 4, y - 12); c.closePath(); });
        shape(c, p.body, (c) => { c.moveTo(x + s * 8, y - 8); c.arc(x + s * 10, y - 16, 7, Math.PI * 0.5, Math.PI * 2.2); c.closePath(); });
      }
    }
  }
  if (L === 'legs6')
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) stroke(c, p.dark, 2.2, (c) => { const y = g.handY - 6 + i * 7; c.moveTo(s * (g.w - 4), y); c.lineTo(s * (g.w + 6), y + 3); c.lineTo(s * (g.w + 7), y + 7); });
  if (L === 'wheels') for (const s of [-1, 1]) { shape(c, '#3a3550', (c) => circ(c, s * 13, b + 1, 6)); shape(c, '#c9d0e0', (c) => circ(c, s * 13, b + 1, 2.4), 0); }
  if (L === 'jet')
    for (const s of [-1, 1]) {
      shape(c, '#ffd84a', (c) => { c.moveTo(s * 11 - 4, b + 3); c.lineTo(s * 11, b + 13); c.lineTo(s * 11 + 4, b + 3); c.closePath(); }, 0);
      shape(c, '#9aa3b8', (c) => rr(c, s * 11 - 5, b - 6, 10, 10, 3));
    }
  if (L === 'tentacles')
    for (let i = 0; i < 4; i++) stroke(c, p.body, 4.2, (c) => { const x = -13 + i * 8.6; c.moveTo(x, b - 4); c.quadraticCurveTo(x + (i % 2 ? 5 : -5), b + 5, x, b + 10); });
  if (d.arch === 'octo')
    for (let i = 0; i < 4; i++) stroke(c, p.body, 5.4, (c) => { const x = -16 + i * 10.6; c.moveTo(x, 14); c.bezierCurveTo(x, 24, x + (i < 2 ? -9 : 9), 26, x + (i < 2 ? -6 : 6), 32); });
  if (d.arch === 'mushroom') {
    // chapéu do cogumelo (atrás do rosto, sobre o tronco)
    shape(c, p.acc2 === p.body ? p.dark : mix(p.body, p.acc, 0.2), (c) => { c.moveTo(-32, -2); c.bezierCurveTo(-32, -26, -16, -30, 0, -30); c.bezierCurveTo(16, -30, 32, -26, 32, -2); c.quadraticCurveTo(0, 6, -32, -2); c.closePath(); });
    if (d.pattern === 'spots' || d.pattern === 'dots')
      for (const [x, y, r] of [[-17, -14, 5], [3, -22, 4.5], [18, -10, 5.5], [-3, -9, 3.5]]) shape(c, '#ffffff', (c) => circ(c, x, y, r), 0);
    shine(c, -16, -22, 8, 3, 0.4);
  }
}

function rainbowArcs(c: C, x: number, y: number, R: number): void {
  const cols = ['#ff5c5c', '#ffb03c', '#ffe14f', '#5cff8a', '#5cc8ff', '#a66bff'];
  c.lineWidth = 2.6;
  for (let i = 0; i < cols.length; i++) {
    c.beginPath();
    c.arc(x, y, R - i * 2.6, 0, Math.PI * 2);
    c.strokeStyle = cols[i];
    c.stroke();
  }
}

/* ============================== padrões (recortados no corpo) ============================== */

function drawPattern(c: C, g: Geo, d: CreatureDesign, p: Pal): void {
  const P = d.pattern;
  const cy = (g.top + g.bottom) / 2;
  const W = g.w;
  const fillDots = (pts: number[][], col: string) => { c.beginPath(); for (const [x, y, r] of pts) circ(c, x, y, r); c.fillStyle = col; c.fill(); };
  switch (P) {
    case 'belly':
      fillDots([[0, g.bottom - 6, W * 0.62]], p.belly);
      break;
    case 'spots':
      if (d.arch !== 'mushroom') fillDots([[-W * 0.6, cy - 8, 4.5], [W * 0.55, cy - 12, 3.4], [W * 0.62, cy + 10, 5], [-W * 0.45, cy + 13, 3.2], [W * 0.1, g.top + 6, 3]], alpha(darken(p.acc2, 0.15), 0.85));
      break;
    case 'stripes':
      c.lineWidth = 4;
      c.strokeStyle = alpha(p.dark, 0.75);
      c.lineCap = 'round';
      c.beginPath();
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { c.moveTo(s * (W + 2), cy - 10 + i * 9); c.lineTo(s * (W - 8), cy - 7 + i * 9); }
      c.moveTo(-4, g.top - 1); c.lineTo(-2, g.top + 7); c.moveTo(4, g.top - 1); c.lineTo(2, g.top + 7);
      c.stroke();
      break;
    case 'stars':
      c.beginPath();
      for (const [x, y, r] of [[-W * 0.62, cy - 6, 3.6], [W * 0.6, cy + 2, 4.2], [-W * 0.35, g.bottom - 7, 3], [W * 0.3, g.bottom - 5, 2.6], [W * 0.4, g.top + 8, 2.4]]) starPath(c, x, y, r, r * 0.45);
      c.fillStyle = p.gold;
      c.fill();
      break;
    case 'hearts':
      c.beginPath();
      for (const [x, y, r] of [[-W * 0.6, cy - 4, 3.4], [W * 0.62, cy + 4, 3.8], [0, g.bottom - 6, 3.2]]) heartPath(c, x, y, r);
      c.fillStyle = alpha(p.cheek, 0.9);
      c.fill();
      break;
    case 'cap': {
      c.beginPath();
      const y = g.top + (g.bottom - g.top) * 0.36;
      c.moveTo(-W - 6, g.top - 10);
      c.lineTo(W + 6, g.top - 10);
      c.lineTo(W + 6, y);
      for (let i = 0; i < 6; i++) { const x = W + 6 - (i + 1) * ((2 * W + 12) / 6); c.quadraticCurveTo(x + (W + 6) / 6, y + (i % 2 ? 9 : 4), x, y); }
      c.closePath();
      c.fillStyle = d.arch === 'egg' ? '#8a5a3a' : lighten(p.acc, 0.35);
      c.fill();
      break;
    }
    case 'checker': {
      c.fillStyle = alpha(darken(p.body, 0.2), 0.45);
      c.beginPath();
      const s = 7;
      for (let x = -42; x < 42; x += s) for (let y = -42; y < 42; y += s) if (((x + y) / s) % 2 === 0) c.rect(x, y, s, s);
      c.fill();
      break;
    }
    case 'freckles':
      fillDots([[-g.eyeDX - 3, g.eyeY + 7, 1], [-g.eyeDX, g.eyeY + 9, 1], [-g.eyeDX - 6, g.eyeY + 9, 1], [g.eyeDX + 3, g.eyeY + 7, 1], [g.eyeDX, g.eyeY + 9, 1], [g.eyeDX + 6, g.eyeY + 9, 1]], alpha(p.dark, 0.8));
      break;
    case 'zigzag':
      c.beginPath();
      c.moveTo(-W - 6, cy + 6);
      for (let i = 0; i <= 10; i++) c.lineTo(-W - 6 + i * ((2 * W + 12) / 10), cy + (i % 2 ? 0 : 6) + 6);
      c.lineTo(W + 6, cy + 14);
      for (let i = 10; i >= 0; i--) c.lineTo(-W - 6 + i * ((2 * W + 12) / 10), cy + (i % 2 ? 8 : 14) + 6);
      c.closePath();
      c.fillStyle = alpha(p.acc2, 0.9);
      c.fill();
      break;
    case 'dots': {
      const cols = [p.acc, p.acc2, '#ffffff', p.gold];
      const pts = [[-W * 0.55, cy - 8], [W * 0.5, cy - 12], [W * 0.6, cy + 8], [-W * 0.5, cy + 12], [0, g.bottom - 5], [-W * 0.15, g.top + 8], [W * 0.25, cy + 17]];
      pts.forEach(([x, y], i) => { c.beginPath(); circ(c, x, y, 2.4); c.fillStyle = cols[i % 4]; c.fill(); });
      break;
    }
    case 'bands':
      c.fillStyle = alpha(p.acc2, 0.8);
      c.fillRect(-50, cy + 4, 100, 5);
      c.fillStyle = alpha(p.acc, 0.8);
      c.fillRect(-50, cy + 13, 100, 4);
      break;
    case 'mask':
      c.beginPath();
      ell(c, -g.eyeDX, g.eyeY, g.eyeR + 5, g.eyeR + 3.5, -0.2);
      ell(c, g.eyeDX, g.eyeY, g.eyeR + 5, g.eyeR + 3.5, 0.2);
      c.rect(-g.eyeDX, g.eyeY - 3, g.eyeDX * 2, 6);
      c.fillStyle = alpha(darken(p.body, 0.5), 0.85);
      c.fill();
      break;
    case 'panda':
      c.beginPath();
      ell(c, -g.eyeDX, g.eyeY + 1, g.eyeR + 2.5, g.eyeR + 4, 0.5);
      ell(c, g.eyeDX, g.eyeY + 1, g.eyeR + 2.5, g.eyeR + 4, -0.5);
      c.fillStyle = '#2a2a3a';
      c.fill();
      break;
    case 'ribs':
      c.lineWidth = 2;
      c.strokeStyle = alpha(p.dark, 0.6);
      c.beginPath();
      for (const x of [-14, 14]) { c.moveTo(x * 0.4, g.top + 1); c.quadraticCurveTo(x * 1.25, cy, x * 0.4, g.bottom - 1); }
      c.stroke();
      break;
    case 'scales':
      c.lineWidth = 1.6;
      c.strokeStyle = alpha(p.light, 0.8);
      c.beginPath();
      for (let r = 0; r < 3; r++) for (let i = -2; i <= 2; i++) { const x = i * 7 + (r % 2) * 3.5; const y = cy + r * 6; c.moveTo(x + 3.5, y); c.arc(x, y, 3.5, 0, Math.PI); }
      c.stroke();
      break;
    case 'cracks':
      c.lineWidth = 2.2;
      c.strokeStyle = '#ffb03c';
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-W + 2, cy - 4); c.lineTo(-W * 0.6, cy); c.lineTo(-W * 0.65, cy + 8);
      c.moveTo(W - 2, cy + 6); c.lineTo(W * 0.55, cy + 3); c.lineTo(W * 0.4, cy + 10);
      c.moveTo(-4, g.bottom); c.lineTo(-1, g.bottom - 6); c.lineTo(4, g.bottom - 8);
      c.stroke();
      break;
    case 'rainbow':
      if (d.arch !== 'snail') rainbowArcs(c, 0, g.bottom + 10, 20);
      break;
    case 'gears':
      c.lineWidth = 2;
      c.strokeStyle = alpha(p.dark, 0.7);
      for (const [x, y, r] of [[-W * 0.5, cy + 8, 5], [W * 0.5, cy + 12, 4]]) {
        c.beginPath();
        for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; const rad = i % 2 ? r : r + 2; c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); }
        c.closePath();
        c.stroke();
        c.beginPath(); circ(c, x, y, 1.6); c.stroke();
      }
      break;
    case 'gems':
      for (const [x, y, s] of [[-W * 0.55, cy + 6, 4], [W * 0.55, cy + 2, 4.5], [0, g.bottom - 7, 3.5]]) {
        c.beginPath(); c.moveTo(x, y - s); c.lineTo(x + s * 0.8, y); c.lineTo(x, y + s); c.lineTo(x - s * 0.8, y); c.closePath();
        c.fillStyle = p.acc; c.fill();
        c.beginPath(); c.moveTo(x, y - s); c.lineTo(x - s * 0.8, y); c.lineTo(x, y); c.closePath(); c.fillStyle = 'rgba(255,255,255,.55)'; c.fill();
      }
      break;
    case 'soccer':
      c.fillStyle = '#2a2a3a';
      for (const [x, y, r] of [[0, g.top + 4, 5], [-W * 0.75, cy + 2, 5], [W * 0.75, cy + 2, 5], [-W * 0.45, g.bottom - 3, 4.5], [W * 0.45, g.bottom - 3, 4.5]]) { c.beginPath(); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i * Math.PI * 2) / 5; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } c.closePath(); c.fill(); }
      break;
    case 'swirl':
      c.lineWidth = 2.4;
      c.strokeStyle = alpha(p.acc2, 0.7);
      c.beginPath();
      for (let i = 0; i < 60; i++) { const a = i * 0.32; const r = 2 + i * 0.42; const x = Math.cos(a) * r; const y = cy + 2 + Math.sin(a) * r * 0.9; if (i) c.lineTo(x, y); else c.moveTo(x, y); }
      c.stroke();
      break;
  }
}

/* ============================== corpo ============================== */

function drawBody(c: C, g: Geo, d: CreatureDesign, p: Pal, rarity: CreatureRarity): void {
  const grad = c.createLinearGradient(0, g.top, 0, g.bottom);
  if (rarity === 'epic') {
    grad.addColorStop(0, lighten(p.body, 0.35));
    grad.addColorStop(0.55, p.body);
    grad.addColorStop(1, mix(p.body, p.acc2, 0.45));
  } else if (rarity === 'legendary') {
    grad.addColorStop(0, lighten(mix(p.body, p.gold, 0.15), 0.4));
    grad.addColorStop(0.5, p.body);
    grad.addColorStop(1, mix(p.body, p.acc, 0.4));
  } else {
    grad.addColorStop(0, lighten(p.body, rarity === 'common' ? 0.12 : 0.25));
    grad.addColorStop(1, rarity === 'common' ? p.body : darken(p.body, 0.08));
  }
  c.beginPath();
  g.path(c);
  c.fillStyle = grad;
  c.fill();
  // detalhes internos recortados
  c.save();
  c.beginPath();
  g.path(c);
  c.clip();
  if (d.arch === 'penguin') {
    c.beginPath();
    ell(c, 0, 10, 18, 21);
    c.fillStyle = '#ffffff';
    c.fill();
  }
  if (d.arch === 'bug') {
    c.fillStyle = darken(p.body, 0.45);
    c.fillRect(-40, g.top - 4, 80, 13);
  }
  drawPattern(c, g, d, p);
  // sombra inferior + brilho
  c.beginPath();
  ell(c, 4, g.bottom + 6, g.w + 6, 14);
  c.fillStyle = 'rgba(26,6,56,0.13)';
  c.fill();
  if (d.arch === 'robot') {
    c.beginPath();
    rr(c, -18, g.eyeY - 10, 36, 25, 7);
    c.fillStyle = 'rgba(20,16,40,.82)';
    c.fill();
  }
  c.restore();
  c.beginPath();
  g.path(c);
  c.lineWidth = LW;
  c.strokeStyle = INK;
  c.lineJoin = 'round';
  c.stroke();
  // brilho
  const hx = -g.w * 0.5;
  const hy = g.top + (g.bottom - g.top) * 0.22;
  shine(c, hx, hy, rarity === 'common' ? 5 : 7, rarity === 'common' ? 3 : 4, rarity === 'rare' || rarity === 'legendary' ? 0.7 : 0.5);
  if (rarity !== 'common') shine(c, hx + 8, hy - 3, 1.8, 1.8, 0.7, 0);
  if (d.arch === 'robot') for (const s of [-1, 1]) shape(c, '#c9d0e0', (c) => circ(c, s * 21, g.top + 7, 2), 1.4);
  if (d.arch === 'gem') {
    c.lineWidth = 1.4;
    c.strokeStyle = alpha(p.light, 0.7);
    c.beginPath(); c.moveTo(-12, -30); c.lineTo(-17, -12); c.lineTo(0, 31); c.moveTo(12, -30); c.lineTo(17, -12); c.lineTo(0, 31); c.moveTo(-27, -12); c.lineTo(27, -12); c.stroke();
  }
  if (d.arch === 'bear' || d.arch === 'seal') {
    c.beginPath();
    ell(c, 0, g.mouthY - 1, 8.5, 6.5);
    c.fillStyle = p.belly;
    c.fill();
  }
  if (d.arch === 'bug') stroke(c, alpha(p.ink, 0.6), 1.6, (c) => { c.moveTo(0, g.top + 9); c.lineTo(0, g.bottom); }, false);
}

/* ============================== rosto ============================== */

function drawEyes(c: C, g: Geo, d: CreatureDesign, p: Pal, closed: boolean): void {
  const E = d.eyes;
  const r = g.eyeR;
  let ey = g.eyeY;
  const pos: number[] = E === 'cyclops' ? [0] : E === 'triple' ? [-g.eyeDX - 2, 0, g.eyeDX + 2] : [-g.eyeDX, g.eyeDX];
  if (E === 'frog') ey = g.top + 2;
  if (E === 'stalk') ey = g.top - 10;
  // bochechas
  if (E !== 'visor' && d.arch !== 'robot') {
    c.beginPath();
    ell(c, -g.eyeDX - 4, g.eyeY + r + 3.2, 4.2, 2.6);
    ell(c, g.eyeDX + 4, g.eyeY + r + 3.2, 4.2, 2.6);
    c.fillStyle = alpha(p.cheek, 0.45);
    c.fill();
  }
  if (E === 'visor') {
    shape(c, '#1d1838', (c) => rr(c, -g.eyeDX - 7, ey - 5, g.eyeDX * 2 + 14, 10, 5));
    c.beginPath();
    if (closed) { c.rect(-g.eyeDX - 3, ey - 0.6, 6, 1.6); c.rect(g.eyeDX - 3, ey - 0.6, 6, 1.6); }
    else { ell(c, -g.eyeDX, ey, 3.4, 2.8); ell(c, g.eyeDX, ey, 3.4, 2.8); }
    c.fillStyle = p.acc2;
    c.fill();
    shine(c, -g.eyeDX - 4, ey - 2.5, 3, 1, 0.45, 0);
    return;
  }
  const arc = (x: number, y: number, w: number, up: boolean) =>
    stroke(c, INK, 2.2, (c) => { c.moveTo(x - w, y); c.quadraticCurveTo(x, y + (up ? -w * 1.1 : w * 1.1), x + w, y); }, false);
  if (closed && E !== 'happy' && E !== 'sleepy') {
    for (const x of pos) arc(x, ey, E === 'cyclops' ? r * 1.4 : r * 0.9, false);
    return;
  }
  for (let i = 0; i < pos.length; i++) {
    const x = pos[i];
    const k = E === 'cyclops' ? 1.6 : E === 'triple' ? 0.78 : 1;
    const R = r * k;
    switch (E) {
      case 'dot':
        c.beginPath(); ell(c, x, ey, R * 0.5, R * 0.65); c.fillStyle = p.pupil; c.fill();
        shine(c, x - 0.8, ey - 1.2, 0.9, 0.9, 0.9, 0);
        break;
      case 'happy':
        arc(x, ey + 1, R * 0.9, true);
        break;
      case 'sleepy':
        arc(x, ey, R * 0.9, false);
        stroke(c, INK, 1.4, (c) => { c.moveTo(x - R * 0.4, ey + R * 0.75); c.lineTo(x - R * 0.55, ey + R * 1.2); c.moveTo(x + R * 0.4, ey + R * 0.75); c.lineTo(x + R * 0.55, ey + R * 1.2); }, false);
        break;
      case 'wink':
        if (i === 1) { arc(x, ey + 1, R * 0.9, true); break; }
      // fallthrough
      case 'big':
      case 'lash':
      case 'triple':
      case 'frog':
      case 'stalk':
        if (E === 'frog' || E === 'stalk') { c.beginPath(); circ(c, x, ey, R + 1.6); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 1.6; c.strokeStyle = INK; c.stroke(); }
        c.beginPath(); ell(c, x, ey, R * 0.82, R); c.fillStyle = p.pupil; c.fill();
        shine(c, x - R * 0.3, ey - R * 0.4, R * 0.36, R * 0.36, 0.95, 0);
        shine(c, x + R * 0.3, ey + R * 0.4, R * 0.16, R * 0.16, 0.9, 0);
        if (E === 'lash') stroke(c, INK, 1.5, (c) => { const s = x < 0 ? -1 : 1; c.moveTo(x + s * R * 0.7, ey - R * 0.6); c.lineTo(x + s * R * 1.3, ey - R * 1.1); c.moveTo(x + s * R * 0.85, ey - R * 0.1); c.lineTo(x + s * R * 1.5, ey - R * 0.3); }, false);
        break;
      case 'cyclops':
        shape(c, '#ffffff', (c) => circ(c, x, ey, R), 1.8);
        c.beginPath(); circ(c, x, ey + 1, R * 0.6); c.fillStyle = p.acc2; c.fill();
        c.beginPath(); circ(c, x, ey + 1, R * 0.34); c.fillStyle = p.pupil; c.fill();
        shine(c, x - R * 0.3, ey - R * 0.25, R * 0.2, R * 0.2, 0.95, 0);
        break;
      case 'sparkle':
      case 'star': {
        c.beginPath(); ell(c, x, ey, R * 0.9, R * 1.08); c.fillStyle = p.pupil; c.fill();
        c.save(); c.beginPath(); ell(c, x, ey, R * 0.9, R * 1.08); c.clip();
        c.beginPath(); ell(c, x, ey + R * 0.75, R * 1.1, R * 0.8); c.fillStyle = E === 'star' ? p.gold : p.acc2; c.fill();
        c.restore();
        c.beginPath(); starPath(c, x - R * 0.2, ey - R * 0.3, R * 0.55, R * 0.22, 4, 0); c.fillStyle = '#fff'; c.fill();
        shine(c, x + R * 0.38, ey + R * 0.15, R * 0.15, R * 0.15, 0.9, 0);
        break;
      }
      case 'heart':
        c.beginPath(); heartPath(c, x, ey, R * 0.85); c.fillStyle = '#ff3c7a'; c.fill(); c.lineWidth = 1.4; c.strokeStyle = INK; c.stroke();
        shine(c, x - R * 0.35, ey - R * 0.3, R * 0.2, R * 0.2, 0.9, 0);
        break;
      case 'spiral':
        c.beginPath(); circ(c, x, ey, R * 0.95); c.fillStyle = '#fff'; c.fill();
        stroke(c, INK, 1.4, (c) => { for (let k2 = 0; k2 < 26; k2++) { const a = k2 * 0.5; const rr2 = (k2 / 26) * R * 0.9; c.lineTo(x + Math.cos(a) * rr2, ey + Math.sin(a) * rr2); } }, false);
        break;
      case 'pixel':
        c.fillStyle = p.pupil;
        c.fillRect(x - R * 0.6, ey - R * 0.75, R * 1.2, R * 1.5);
        c.fillStyle = '#fff';
        c.fillRect(x - R * 0.6, ey - R * 0.75, R * 0.5, R * 0.5);
        break;
    }
  }
}

function drawMouth(c: C, g: Geo, d: CreatureDesign, p: Pal): void {
  const y = g.mouthY;
  const M = d.mouth;
  const smile = (w = 3.6, yy = y) => stroke(c, INK, 1.8, (c) => { c.moveTo(-w, yy); c.quadraticCurveTo(0, yy + w * 0.9, w, yy); }, false);
  switch (M) {
    case 'smile': smile(); break;
    case 'dot': c.beginPath(); circ(c, 0, y + 1, 1.3); c.fillStyle = INK; c.fill(); break;
    case 'ooh': shape(c, '#5a1a3a', (c) => ell(c, 0, y + 1, 2.4, 3.2), 1.2); break;
    case 'cat': stroke(c, INK, 1.8, (c) => { c.moveTo(-4.5, y); c.quadraticCurveTo(-2.2, y + 3, 0, y); c.quadraticCurveTo(2.2, y + 3, 4.5, y); }, false);
      c.beginPath(); ell(c, 0, y - 2, 1.8, 1.2); c.fillStyle = p.cheek; c.fill();
      if (d.arch === 'cat' || d.arch === 'fox') stroke(c, alpha(p.ink, 0.6), 1.1, (c) => { for (const s of [-1, 1]) { c.moveTo(s * 9, y - 1); c.lineTo(s * 17, y - 3); c.moveTo(s * 9, y + 1.5); c.lineTo(s * 17, y + 2.5); } }, false);
      break;
    case 'open':
    case 'grin': {
      const w = M === 'grin' ? 6 : 4.2;
      shape(c, '#5a1a3a', (c) => { c.moveTo(-w, y - 1); c.quadraticCurveTo(0, y + w * 1.5, w, y - 1); c.closePath(); }, 1.6);
      if (M === 'grin') { c.fillStyle = '#fff'; c.fillRect(-w + 1.5, y - 0.9, (w - 1.5) * 2, 1.8); }
      else { c.beginPath(); ell(c, 0, y + w * 0.8, w * 0.5, w * 0.3); c.fillStyle = '#ff7a9a'; c.fill(); }
      break;
    }
    case 'fang': smile(); shape(c, '#fff', (c) => { c.moveTo(1, y + 1.8); c.lineTo(3.4, y + 1.4); c.lineTo(2.2, y + 4.4); c.closePath(); }, 1); break;
    case 'tongue': shape(c, '#ff7a9a', (c) => ell(c, 1.5, y + 3.2, 2.4, 3), 1.2); smile(); break;
    case 'teeth': smile(); shape(c, '#fff', (c) => { rr(c, -2.4, y + 1.6, 2.3, 3.2, 0.6); rr(c, 0.1, y + 1.6, 2.3, 3.2, 0.6); }, 1); break;
    case 'beak': shape(c, '#ffa23a', (c) => { c.moveTo(-4.5, y - 2); c.lineTo(4.5, y - 2); c.lineTo(0, y + 4); c.closePath(); }, 1.6); break;
    case 'bigbeak':
      shape(c, '#ffa23a', (c) => { c.moveTo(-6, y - 3); c.quadraticCurveTo(0, y - 6, 6, y - 3); c.quadraticCurveTo(6, y + 8, 0, y + 13); c.quadraticCurveTo(-6, y + 8, -6, y - 3); c.closePath(); }, 1.8);
      shape(c, '#ffd84a', (c) => ell(c, 0, y - 1, 4, 1.8), 0);
      break;
    case 'nose': shape(c, d.props.includes('party') ? '#ff3b3b' : '#ff4f6a', (c) => ell(c, 0, y - 3, 3.6, 2.8), 1.4); shine(c, -1, y - 4, 1, 0.7, 0.9, 0); smile(2.6, y + 1.2); break;
    case 'wavy': stroke(c, INK, 1.8, (c) => { c.moveTo(-5, y); c.quadraticCurveTo(-2.5, y - 2, 0, y); c.quadraticCurveTo(2.5, y + 2, 5, y); }, false); break;
    case 'trunk':
      stroke(c, p.body, 5.6, (c) => { c.moveTo(0, y - 6); c.bezierCurveTo(0, y + 4, 2, y + 10, 7, y + 9); });
      smile(2.6, y + 5);
      break;
    case 'carrot': shape(c, '#ff8a2a', (c) => { c.moveTo(0, y - 5); c.lineTo(11, y - 2); c.lineTo(0, y + 0.5); c.closePath(); }, 1.4); smile(2.6, y + 4); break;
    case 'tusks':
      shape(c, '#fff8e6', (c) => { c.moveTo(-4, y); c.lineTo(-3, y + 8); c.lineTo(-1.6, y); c.moveTo(4, y); c.lineTo(3, y + 8); c.lineTo(1.6, y); }, 1.2);
      stroke(c, darken(p.body, 0.35), 2.4, (c) => { c.moveTo(-6, y - 1); c.quadraticCurveTo(0, y - 4, 6, y - 1); }, false);
      break;
  }
}

/* ============================== adereços ============================== */

const HATS = new Set(['beanie', 'party', 'tophat', 'crown', 'tiara', 'leafhat', 'cherry', 'straw', 'pirate', 'witch', 'cowboy', 'helmet', 'topstar', 'wizard', 'laurel', 'chef', 'nightcap', 'headband', 'kabuto', 'beret', 'sleuth', 'mushhat', 'candle', 'nemes']);

function drawBackProps(c: C, g: Geo, d: CreatureDesign, p: Pal): void {
  for (const pr of d.props) {
    if (pr === 'cape') shape(c, luma(p.acc) > 0.8 ? p.acc2 : p.acc, (c) => { c.moveTo(-g.w * 0.7, g.neckY - 6); c.quadraticCurveTo(-g.w - 10, g.bottom, -g.w - 6, g.bottom + 4); c.lineTo(g.w + 6, g.bottom + 4); c.quadraticCurveTo(g.w + 10, g.bottom, g.w * 0.7, g.neckY - 6); c.closePath(); });
    if (pr === 'ring') stroke(c, p.acc2, 4, (c) => ell(c, 0, 6, 42, 9, -0.15));
    if (pr === 'pole') { shape(c, '#ffd84a', (c) => rr(c, -3, -48, 6, 100, 3)); }
    if (pr === 'balloon') {
      stroke(c, INK, 1, (c) => { c.moveTo(g.w, g.handY); c.quadraticCurveTo(g.w + 12, -6, g.w + 10, -26); }, false);
      shape(c, p.acc, (c) => ell(c, g.w + 10, -36, 10, 12));
      shine(c, g.w + 6, -41, 2.6, 4, 0.6, 0.3);
    }
    if (pr === 'windkey') { shape(c, '#c9a040', (c) => { rr(c, g.w - 2, -1, 12, 4, 2); ell(c, g.w + 12, -6, 3.5, 6); ell(c, g.w + 12, 7, 3.5, 6); }); }
    if (pr === 'spout') for (const s of [-1, 0, 1]) stroke(c, '#9ff0ff', 3, (c) => { c.moveTo(0, g.top - 4); c.quadraticCurveTo(s * 6, g.top - 20, s * 14, g.top - 16); });
  }
}

const TALL_TOPS = new Set(['unihorn', 'antlers', 'flame', 'crystals', 'propeller', 'bolt', 'lure', 'spikes', 'crest', 'leaves', 'flower', 'tuft', 'curl', 'sprout', 'vfin', 'knobs', 'antennae', 'fin']);

function drawHat(c: C, g: Geo, pr: string, p: Pal, hasOther: boolean): void {
  const T = g.top;
  const hw = g.hw;
  switch (pr) {
    case 'beanie':
      shape(c, p.acc, (c) => { c.moveTo(-hw - 2, T + 7); c.bezierCurveTo(-hw, T - 14, hw, T - 14, hw + 2, T + 7); c.closePath(); });
      shape(c, '#ffffff', (c) => rr(c, -hw - 3, T + 2, hw * 2 + 6, 7, 3.5));
      shape(c, '#ffffff', (c) => circ(c, 0, T - 11, 5));
      break;
    case 'party':
      shape(c, p.acc2, (c) => { c.moveTo(-9, T + 4); c.lineTo(hasOther ? 10 : 2, T - 20); c.lineTo(9, T + 4); c.closePath(); });
      stroke(c, p.acc, 2, (c) => { c.moveTo(-6, T - 2); c.lineTo(6, T - 5); c.moveTo(-3, T - 10); c.lineTo(4, T - 12); }, false);
      shape(c, p.gold, (c) => circ(c, hasOther ? 10 : 2, T - 21, 3.6));
      break;
    case 'tophat':
      shape(c, '#2a2240', (c) => { rr(c, -hw - 3, T - 1, hw * 2 + 6, 5, 2.5); rr(c, -hw * 0.7, T - 19, hw * 1.4, 19, 2); });
      c.fillStyle = p.acc; c.fillRect(-hw * 0.7 + 1, T - 6, hw * 1.4 - 2, 4);
      break;
    case 'crown': {
      const w = Math.min(hw, 14);
      shape(c, p.gold, (c) => { c.moveTo(-w, T + 3); c.lineTo(-w - 2, T - 13); c.lineTo(-w / 2, T - 5); c.lineTo(0, T - 17); c.lineTo(w / 2, T - 5); c.lineTo(w + 2, T - 13); c.lineTo(w, T + 3); c.closePath(); });
      shape(c, p.acc, (c) => circ(c, 0, T - 3, 2.6), 1.2);
      shape(c, '#7dfcff', (c) => { circ(c, -w + 2, T - 1, 1.8); circ(c, w - 2, T - 1, 1.8); }, 1);
      shine(c, -w / 2 - 1, T - 3, 1.4, 3, 0.7, 0);
      break;
    }
    case 'tiara':
      shape(c, '#e8ecff', (c) => { c.moveTo(-10, T + 3); c.quadraticCurveTo(0, T - 4, 10, T + 3); c.lineTo(5, T - 2); c.lineTo(0, T - 10); c.lineTo(-5, T - 2); c.closePath(); }, 1.6);
      shape(c, p.acc, (c) => circ(c, 0, T - 3, 2), 1);
      break;
    case 'leafhat':
      shape(c, LEAF, (c) => ell(c, 3, T - 2, 13, 5, -0.25));
      stroke(c, '#2f8a3f', 1.2, (c) => { c.moveTo(-8, T + 1); c.lineTo(14, T - 5); }, false);
      break;
    case 'cherry':
      stroke(c, '#3a9a4a', 1.8, (c) => { c.moveTo(0, T - 4); c.quadraticCurveTo(2, T - 14, 7, T - 16); });
      shape(c, '#ff2f55', (c) => circ(c, 0, T - 2, 6));
      shine(c, -2, T - 4, 1.6, 1.2, 0.8);
      break;
    case 'straw':
    case 'cowboy': {
      const col = pr === 'straw' ? '#f5d27a' : '#a8642f';
      shape(c, col, (c) => ell(c, 0, T + 2, hw + 11, 5.5));
      shape(c, col, (c) => { c.moveTo(-hw * 0.65, T + 2); c.bezierCurveTo(-hw * 0.7, T - 16, hw * 0.7, T - 16, hw * 0.65, T + 2); c.closePath(); });
      c.fillStyle = pr === 'straw' ? p.acc : '#5a2a10';
      c.fillRect(-hw * 0.62, T - 4, hw * 1.24, 3.5);
      break;
    }
    case 'pirate':
      shape(c, '#2a2240', (c) => { c.moveTo(-hw - 6, T + 3); c.quadraticCurveTo(-hw, T - 16, 0, T - 14); c.quadraticCurveTo(hw, T - 16, hw + 6, T + 3); c.quadraticCurveTo(0, T - 3, -hw - 6, T + 3); c.closePath(); });
      c.beginPath(); starPath(c, 0, T - 7, 3.6, 1.6); c.fillStyle = p.gold; c.fill();
      break;
    case 'witch':
    case 'wizard': {
      const col = pr === 'witch' ? '#3a2a5a' : p.acc;
      shape(c, col, (c) => ell(c, 0, T + 2, hw + 8, 4.5));
      shape(c, col, (c) => { c.moveTo(-hw * 0.7, T + 1); c.quadraticCurveTo(-2, T - 18, 8, T - 28); c.quadraticCurveTo(4, T - 14, hw * 0.7, T + 1); c.closePath(); });
      if (pr === 'witch') { c.fillStyle = p.acc; c.fillRect(-hw * 0.62, T - 3, hw * 1.24, 3); }
      else { c.beginPath(); starPath(c, 1, T - 9, 3.6, 1.6); starPath(c, 4, T - 18, 2.2, 1); c.fillStyle = p.gold; c.fill(); }
      break;
    }
    case 'helmet':
      shape(c, p.acc, (c) => { c.moveTo(-hw - 3, T + 9); c.bezierCurveTo(-hw - 2, T - 12, hw + 2, T - 12, hw + 3, T + 9); c.closePath(); });
      stroke(c, '#ffffff', 2.4, (c) => { c.moveTo(-3, T - 6); c.lineTo(-3, T + 6); c.moveTo(3, T - 6); c.lineTo(3, T + 6); }, false);
      shine(c, -hw * 0.5, T - 2, 3, 1.6, 0.6);
      break;
    case 'topstar':
      shape(c, p.gold, (c) => starPath(c, 0, T - 8, 9, 4));
      shine(c, -2, T - 10, 1.6, 1.2, 0.8);
      break;
    case 'laurel':
      for (const s of [-1, 1]) for (let i = 0; i < 4; i++) shape(c, '#7ed957', (c) => ell(c, s * (hw - 2 - i * 3.5), T + 3 - i * 2.6, 3.6, 1.8, s * (0.6 + i * 0.25)), 1);
      break;
    case 'chef':
      shape(c, '#ffffff', (c) => { circ(c, -6, T - 10, 7); circ(c, 6, T - 10, 7); circ(c, 0, T - 14, 7.5); });
      shape(c, '#ffffff', (c) => rr(c, -10, T - 8, 20, 10, 2));
      break;
    case 'nightcap':
      shape(c, p.acc2, (c) => { c.moveTo(-hw - 1, T + 5); c.bezierCurveTo(-hw, T - 12, 8, T - 16, hw + 10, T + 2); c.lineTo(hw + 1, T + 5); c.closePath(); });
      shape(c, '#ffffff', (c) => circ(c, hw + 11, T + 4, 4.2));
      shape(c, '#ffffff', (c) => rr(c, -hw - 2, T + 2, hw * 2 + 4, 6, 3));
      break;
    case 'headband':
      shape(c, p.acc2 === '#ff3b5c' ? p.acc2 : p.acc, (c) => rr(c, -g.w + 1, g.eyeY - g.eyeR - 10, g.w * 2 - 2, 5.5, 2.5));
      shape(c, p.acc, (c) => { c.moveTo(g.w - 2, g.eyeY - g.eyeR - 7); c.lineTo(g.w + 10, g.eyeY - g.eyeR - 2); c.lineTo(g.w + 8, g.eyeY - g.eyeR + 2); c.closePath(); });
      break;
    case 'kabuto':
      shape(c, '#3a3050', (c) => { c.moveTo(-hw - 6, T + 9); c.bezierCurveTo(-hw - 2, T - 12, hw + 2, T - 12, hw + 6, T + 9); c.quadraticCurveTo(0, T + 2, -hw - 6, T + 9); c.closePath(); });
      shape(c, p.gold, (c) => { c.moveTo(-3, T - 4); c.quadraticCurveTo(-16, T - 10, -14, T - 22); c.quadraticCurveTo(-8, T - 10, 0, T - 7); c.quadraticCurveTo(8, T - 10, 14, T - 22); c.quadraticCurveTo(16, T - 10, 3, T - 4); c.closePath(); });
      break;
    case 'beret':
      shape(c, p.acc, (c) => ell(c, 3, T - 1, hw - 2, 6, -0.15));
      shape(c, p.acc, (c) => circ(c, 3, T - 7, 2));
      break;
    case 'sleuth':
      shape(c, '#a87a4a', (c) => { c.moveTo(-hw - 1, T + 5); c.bezierCurveTo(-hw, T - 12, hw, T - 12, hw + 1, T + 5); c.closePath(); });
      shape(c, '#a87a4a', (c) => ell(c, hw - 1, T + 4, 7, 2.6, 0.2));
      stroke(c, '#6a4a2a', 1.4, (c) => { c.moveTo(-hw * 0.6, T - 4); c.lineTo(hw * 0.6, T - 4); c.moveTo(-hw * 0.5, T + 1); c.lineTo(hw * 0.5, T + 1); }, false);
      break;
    case 'mushhat':
      shape(c, '#ff4f6a', (c) => { c.moveTo(-hw - 8, T + 4); c.bezierCurveTo(-hw - 6, T - 16, hw + 6, T - 16, hw + 8, T + 4); c.quadraticCurveTo(0, T, -hw - 8, T + 4); c.closePath(); });
      c.beginPath(); circ(c, -6, T - 5, 2.6); circ(c, 6, T - 7, 2.2); circ(c, 13, T - 1, 1.8); c.fillStyle = '#fff'; c.fill();
      break;
    case 'candle':
      shape(c, p.acc2, (c) => rr(c, -3.5, T - 16, 7, 18, 2));
      shape(c, '#ffb000', (c) => { c.moveTo(0, T - 28); c.quadraticCurveTo(5, T - 20, 0, T - 17); c.quadraticCurveTo(-5, T - 20, 0, T - 28); c.closePath(); }, 1.2);
      break;
    case 'nemes':
      shape(c, p.gold, (c) => { c.moveTo(-hw - 2, T + 6); c.bezierCurveTo(-hw, T - 10, hw, T - 10, hw + 2, T + 6); c.lineTo(hw + 6, T + 26); c.lineTo(hw - 2, T + 26); c.lineTo(hw - 4, T + 8); c.lineTo(-hw + 4, T + 8); c.lineTo(-hw + 2, T + 26); c.lineTo(-hw - 6, T + 26); c.closePath(); });
      stroke(c, '#3cc8c8', 2, (c) => { c.moveTo(-hw, T + 1); c.quadraticCurveTo(0, T - 6, hw, T + 1); }, false);
      break;
  }
}

function drawFrontProps(c: C, g: Geo, d: CreatureDesign, p: Pal): void {
  const props = d.props;
  const hats = props.filter((x) => HATS.has(x));
  // topo alto (chifre, chama, antenas...) + chapéu: o chapéu fica de lado, charmoso
  const tilt = hats.length > 0 && TALL_TOPS.has(d.top) && !hats.includes('headband') && !hats.includes('nemes');
  if (tilt) {
    c.save();
    c.translate(-g.hw * 0.55, g.top + 4);
    c.rotate(-0.42);
    c.scale(0.8, 0.8);
    c.translate(0, -g.top);
  }
  hats.forEach((h, i) => drawHat(c, g, h, p, i > 0));
  if (tilt) c.restore();
  const hx = g.w + 3;
  const hy = g.handY;
  for (const pr of props) {
    switch (pr) {
      case 'earmuffs':
        stroke(c, '#ffffff', 3, (c) => c.arc(0, g.eyeY - 2, g.w - 1, Math.PI * 1.1, Math.PI * 1.9), true);
        for (const s of [-1, 1]) shape(c, p.acc, (c) => circ(c, s * (g.w - 2), g.eyeY - 2, 7));
        break;
      case 'scarf':
        shape(c, p.acc, (c) => rr(c, -g.w * 0.85, g.neckY - 4, g.w * 1.7, 7.5, 3.6));
        shape(c, p.acc, (c) => rr(c, g.w * 0.25, g.neckY, 7, 15, 3));
        c.fillStyle = '#ffffff'; c.fillRect(g.w * 0.25 + 1.2, g.neckY + 8, 4.6, 2.2); c.fillRect(-g.w * 0.4, g.neckY - 3, 3, 5.5); c.fillRect(-g.w * 0.05, g.neckY - 3, 3, 5.5);
        break;
      case 'bowtie':
        shape(c, p.acc, (c) => { c.moveTo(0, g.neckY); c.lineTo(-7, g.neckY - 4.5); c.lineTo(-7, g.neckY + 4.5); c.closePath(); c.moveTo(0, g.neckY); c.lineTo(7, g.neckY - 4.5); c.lineTo(7, g.neckY + 4.5); c.closePath(); }, 1.6);
        shape(c, darken(p.acc, 0.2), (c) => circ(c, 0, g.neckY, 2.2), 1.2);
        break;
      case 'bow':
        shape(c, p.acc, (c) => { ell(c, -g.hw * 0.55 - 4, g.top + 4, 5.5, 4, -0.4); ell(c, -g.hw * 0.55 + 5, g.top + 4, 5.5, 4, 0.4); }, 1.6);
        shape(c, darken(p.acc, 0.15), (c) => circ(c, -g.hw * 0.55 + 0.5, g.top + 4, 2.2), 1.2);
        break;
      case 'pearls': {
        c.beginPath();
        for (let i = 0; i <= 8; i++) { const a = Math.PI * (0.15 + 0.7 * (i / 8)); circ(c, Math.cos(a) * g.w * 0.75, g.neckY - 14 + Math.sin(a) * 14, 1.9); }
        c.fillStyle = '#fff6fb'; c.fill(); c.lineWidth = 0.8; c.strokeStyle = INK; c.stroke();
        break;
      }
      case 'lei':
        for (let i = 0; i <= 6; i++) { const a = Math.PI * (0.15 + 0.7 * (i / 6)); shape(c, i % 2 ? p.acc2 : '#ff8fc0', (c) => circ(c, Math.cos(a) * g.w * 0.8, g.neckY - 12 + Math.sin(a) * 12, 3.2), 1); }
        break;
      case 'medal':
      case 'badge':
      case 'bell': {
        const y = g.neckY + 4;
        if (pr === 'medal') { stroke(c, p.acc, 2.4, (c) => { c.moveTo(-5, g.neckY - 6); c.lineTo(0, y); c.lineTo(5, g.neckY - 6); }, false); shape(c, p.gold, (c) => circ(c, 0, y + 2, 4.5)); }
        if (pr === 'badge') { shape(c, p.gold, (c) => starPath(c, -g.w * 0.45, g.neckY + 2, 5.5, 2.6), 1.4); }
        if (pr === 'bell') { stroke(c, '#ff3c5c', 3, (c) => { c.moveTo(-g.w * 0.6, g.neckY - 3); c.quadraticCurveTo(0, g.neckY + 2, g.w * 0.6, g.neckY - 3); }); shape(c, p.gold, (c) => circ(c, 0, g.neckY + 3, 4)); c.fillStyle = INK; c.fillRect(-0.6, g.neckY + 3.5, 1.2, 3); }
        break;
      }
      case 'bandana':
        shape(c, p.acc2 === p.body ? p.acc : p.acc2, (c) => { c.moveTo(-g.w * 0.7, g.neckY - 3); c.lineTo(g.w * 0.7, g.neckY - 3); c.lineTo(0, g.neckY + 9); c.closePath(); }, 1.6);
        c.beginPath(); circ(c, -3, g.neckY, 1); circ(c, 3, g.neckY, 1); circ(c, 0, g.neckY + 4, 1); c.fillStyle = '#fff'; c.fill();
        break;
      case 'cape':
        shape(c, p.gold, (c) => circ(c, 0, g.neckY - 3, 3), 1.2);
        break;
      case 'mask':
        shape(c, p.acc, (c) => { ell(c, -g.eyeDX, g.eyeY, g.eyeR + 3.5, g.eyeR + 2); ell(c, g.eyeDX, g.eyeY, g.eyeR + 3.5, g.eyeR + 2); c.rect(-g.eyeDX, g.eyeY - 2, g.eyeDX * 2, 4); }, 1.6);
        break;
      case 'eyepatch':
        stroke(c, '#2a2240', 1.6, (c) => { c.moveTo(-g.w, g.eyeY - 9); c.lineTo(g.w, g.eyeY + 3); }, false);
        shape(c, '#2a2240', (c) => ell(c, g.eyeDX, g.eyeY, g.eyeR + 1.5, g.eyeR + 1), 1.2);
        c.beginPath(); starPath(c, g.eyeDX, g.eyeY, 2.6, 1.1); c.fillStyle = p.gold; c.fill();
        break;
      case 'goggles':
      case 'sunglasses':
      case 'glasses': {
        const y = pr === 'goggles' && hats.length === 0 && d.eyes !== 'cyclops' ? g.eyeY - g.eyeR - 6 : g.eyeY;
        const R = g.eyeR + 2.2;
        if (pr === 'goggles') stroke(c, '#5a4030', 2.6, (c) => { c.moveTo(-g.w, y); c.lineTo(g.w, y); }, false);
        const lens = pr === 'sunglasses' ? '#1d1838' : pr === 'goggles' ? alpha(p.acc2, 0.55) : 'rgba(255,255,255,0.2)';
        const xs = d.eyes === 'cyclops' ? [0] : [-g.eyeDX, g.eyeDX];
        for (const x of xs) shape(c, lens, (c) => (pr === 'sunglasses' ? rr(c, x - R, y - R * 0.75, R * 2, R * 1.5, 3) : circ(c, x, y, R)), pr === 'glasses' ? 1.8 : 2.2);
        if (xs.length === 2) stroke(c, INK, 1.6, (c) => { c.moveTo(-g.eyeDX + R, y); c.lineTo(g.eyeDX - R, y); }, false);
        if (pr === 'sunglasses') for (const x of xs) shine(c, x - R * 0.4, y - R * 0.25, R * 0.4, R * 0.18, 0.5, -0.3);
        break;
      }
      case 'headphones':
        stroke(c, '#2a2240', 3, (c) => c.arc(0, g.eyeY - 2, g.w + 1, Math.PI * 1.08, Math.PI * 1.92), false);
        for (const s of [-1, 1]) shape(c, p.acc, (c) => rr(c, s * (g.w + 1) - 4, g.eyeY - 7, 8, 12, 3.5));
        break;
      case 'astro':
        c.beginPath(); circ(c, 0, g.eyeY - 2, g.w + 8); c.fillStyle = 'rgba(190,240,255,0.18)'; c.fill(); c.lineWidth = 2; c.strokeStyle = 'rgba(220,250,255,.9)'; c.stroke();
        shine(c, -g.w * 0.6, g.eyeY - g.w * 0.6, 4, 7, 0.55, 0.6);
        break;
      case 'flower':
        if (!props.includes('crown') || true) {
          const fx = g.hw * 0.7 + 3;
          const fy = g.top + 5;
          for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; shape(c, '#ff8fc0', (c) => circ(c, fx + Math.cos(a) * 3.6, fy + Math.sin(a) * 3.6, 3), 1); }
          shape(c, p.gold, (c) => circ(c, fx, fy, 2.2), 1);
        }
        break;
      case 'eggshell':
        shape(c, '#fff8e6', (c) => { c.moveTo(-g.w - 3, g.bottom - 14); for (let i = 0; i <= 8; i++) c.lineTo(-g.w - 3 + i * ((2 * g.w + 6) / 8), g.bottom - 14 + (i % 2 ? -5 : 2)); c.lineTo(g.w + 1, g.bottom + 1); c.quadraticCurveTo(0, g.bottom + 8, -g.w - 1, g.bottom + 1); c.closePath(); });
        c.beginPath(); circ(c, -10, g.bottom - 3, 2); circ(c, 8, g.bottom - 5, 2.4); c.fillStyle = alpha(p.acc, 0.5); c.fill();
        break;
      case 'ring':
        c.save(); c.beginPath(); c.rect(-60, 6, 120, 40); c.clip();
        stroke(c, p.acc2, 4, (c) => ell(c, 0, 6, 42, 9, -0.15));
        c.restore();
        break;
      case 'saucer':
        shape(c, '#c9d0e0', (c) => ell(c, 0, g.bottom + 2, g.w + 12, 7));
        c.beginPath(); for (let i = -2; i <= 2; i++) circ(c, i * 9, g.bottom + 3, 1.8); c.fillStyle = p.gold; c.fill();
        break;
      // itens segurados (lado direito)
      case 'clock':
        shape(c, '#fff8e0', (c) => circ(c, hx + 2, hy - 2, 7.5));
        stroke(c, INK, 1.4, (c) => { c.moveTo(hx + 2, hy - 2); c.lineTo(hx + 2, hy - 7); c.moveTo(hx + 2, hy - 2); c.lineTo(hx + 6, hy - 2); }, false);
        shape(c, p.acc, (c) => rr(c, hx - 1, hy - 12.5, 6, 3.2, 1.4), 1);
        break;
      case 'hourglass':
        shape(c, '#c9a040', (c) => { rr(c, hx - 5, hy - 13, 12, 3, 1); rr(c, hx - 5, hy + 3, 12, 3, 1); });
        shape(c, 'rgba(220,250,255,.7)', (c) => { c.moveTo(hx - 3, hy - 10); c.lineTo(hx + 5, hy - 10); c.lineTo(hx + 1, hy - 3.5); c.lineTo(hx + 5, hy + 3); c.lineTo(hx - 3, hy + 3); c.lineTo(hx + 1, hy - 3.5); c.closePath(); }, 1.2);
        c.beginPath(); c.moveTo(hx - 1.6, hy + 3); c.lineTo(hx + 1, hy - 1); c.lineTo(hx + 3.6, hy + 3); c.fillStyle = p.gold; c.fill();
        break;
      case 'wand':
        stroke(c, '#5a3a20', 2.2, (c) => { c.moveTo(hx - 2, hy + 2); c.lineTo(hx + 8, hy - 14); });
        shape(c, p.gold, (c) => starPath(c, hx + 9, hy - 16, 6, 2.6), 1.4);
        break;
      case 'lollipop':
        stroke(c, '#ffffff', 2, (c) => { c.moveTo(hx, hy + 4); c.lineTo(hx + 3, hy - 10); });
        shape(c, p.acc, (c) => circ(c, hx + 4, hy - 16, 8));
        stroke(c, '#ffffff', 2, (c) => { c.arc(hx + 4, hy - 16, 4.5, 0, Math.PI * 1.5); }, false);
        break;
      case 'popcorn':
        shape(c, '#ff4f4f', (c) => { c.moveTo(hx - 7, hy - 8); c.lineTo(hx + 9, hy - 8); c.lineTo(hx + 6, hy + 8); c.lineTo(hx - 4, hy + 8); c.closePath(); });
        c.fillStyle = '#fff'; c.fillRect(hx - 2, hy - 8, 3, 16);
        shape(c, '#fff6d0', (c) => { circ(c, hx - 4, hy - 10, 3.4); circ(c, hx + 1, hy - 12, 3.6); circ(c, hx + 6, hy - 10, 3.2); }, 1.2);
        break;
      case 'gear':
        shape(c, p.gold, (c) => { for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; const r = i % 2 ? 6 : 8.5; c.lineTo(hx + 3 + Math.cos(a) * r, hy - 4 + Math.sin(a) * r); } c.closePath(); }, 1.6);
        shape(c, darken(p.gold, 0.3), (c) => circ(c, hx + 3, hy - 4, 2.4), 0);
        break;
      case 'map':
        shape(c, '#f3e0b0', (c) => rr(c, hx - 5, hy - 10, 15, 14, 2), 1.6);
        stroke(c, '#ff3b5c', 1.6, (c) => { c.moveTo(hx + 2, hy - 6); c.lineTo(hx + 6, hy - 2); c.moveTo(hx + 6, hy - 6); c.lineTo(hx + 2, hy - 2); }, false);
        break;
      case 'snowball':
        shape(c, '#ffffff', (c) => circ(c, hx + 2, hy - 2, 6.5));
        break;
      case 'note':
        shape(c, p.acc2, (c) => { ell(c, hx, hy, 4.4, 3.4, -0.4); rr(c, hx + 2.6, hy - 15, 2.4, 15, 1); }, 1.4);
        shape(c, p.acc2, (c) => { c.moveTo(hx + 4, hy - 15); c.quadraticCurveTo(hx + 12, hy - 12, hx + 9, hy - 6); c.quadraticCurveTo(hx + 9, hy - 10, hx + 4, hy - 10); c.closePath(); }, 1.2);
        break;
      case 'mic':
        shape(c, '#3a3550', (c) => rr(c, hx - 1, hy - 6, 5, 13, 2));
        shape(c, '#c9d0e0', (c) => circ(c, hx + 1.5, hy - 8, 5));
        break;
      case 'guitar':
        shape(c, p.acc2, (c) => { ell(c, hx - 2, hy + 4, 7, 6.5); ell(c, hx + 2, hy - 3, 5.5, 5); });
        shape(c, '#5a3a20', (c) => rr(c, hx + 3, hy - 22, 3.4, 18, 1.2), 1.2);
        c.beginPath(); circ(c, hx, hy + 1, 2); c.fillStyle = INK; c.fill();
        break;
      case 'potion':
        shape(c, 'rgba(230,250,255,.85)', (c) => { c.moveTo(hx - 1, hy - 12); c.lineTo(hx + 4, hy - 12); c.lineTo(hx + 4, hy - 7); c.arc(hx + 1.5, hy, 7.5, -Math.PI * 0.35, Math.PI * 1.35); c.closePath(); }, 1.6);
        c.beginPath(); c.arc(hx + 1.5, hy, 6, 0, Math.PI); c.closePath(); c.fillStyle = p.acc2; c.fill();
        shape(c, '#a8642f', (c) => rr(c, hx - 1.5, hy - 15, 7, 4, 1.2), 1);
        break;
      case 'spoon':
        stroke(c, '#c9d0e0', 2.6, (c) => { c.moveTo(hx, hy + 6); c.lineTo(hx + 5, hy - 8); });
        shape(c, '#c9d0e0', (c) => ell(c, hx + 6, hy - 12, 4, 5.6, 0.35));
        break;
      case 'moon':
        shape(c, p.gold, (c) => { c.arc(hx + 3, hy - 6, 8, Math.PI * 0.35, Math.PI * 1.65); c.arc(hx + 7, hy - 6, 6, Math.PI * 1.55, Math.PI * 0.45, true); c.closePath(); });
        break;
      case 'lantern':
        stroke(c, INK, 1.2, (c) => { c.moveTo(hx + 2, hy - 18); c.lineTo(hx + 2, hy - 13); }, false);
        shape(c, '#ff4f4f', (c) => ell(c, hx + 2, hy - 5, 8, 8.5));
        c.beginPath(); ell(c, hx + 2, hy - 5, 4.5, 5); c.fillStyle = 'rgba(255,230,120,.8)'; c.fill();
        shape(c, p.gold, (c) => { rr(c, hx - 2, hy - 15, 8, 3, 1); rr(c, hx - 2, hy + 2.5, 8, 3, 1); }, 1);
        break;
      case 'trophy':
        shape(c, p.gold, (c) => { c.moveTo(hx - 6, hy - 14); c.lineTo(hx + 10, hy - 14); c.quadraticCurveTo(hx + 10, hy - 2, hx + 2, hy - 1); c.quadraticCurveTo(hx - 6, hy - 2, hx - 6, hy - 14); c.closePath(); rr(c, hx - 3, hy + 2, 10, 4, 1); });
        stroke(c, p.gold, 2, (c) => { c.arc(hx - 6, hy - 9, 3.5, Math.PI * 0.5, Math.PI * 1.5); c.moveTo(hx + 10, hy - 12.5); c.arc(hx + 10, hy - 9, 3.5, -Math.PI * 0.5, Math.PI * 0.5); });
        shine(c, hx - 2, hy - 10, 1.4, 3, 0.7, 0);
        break;
      case 'flag':
        stroke(c, '#5a3a20', 2, (c) => { c.moveTo(hx, hy + 4); c.lineTo(hx + 2, hy - 22); });
        c.save(); c.beginPath(); rr(c, hx + 2, hy - 22, 16, 11, 1.5); c.clip();
        for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { c.fillStyle = (i + j) % 2 ? '#ffffff' : '#2a2240'; c.fillRect(hx + 2 + i * 4, hy - 22 + j * 3.7, 4, 3.7); }
        c.restore();
        c.beginPath(); rr(c, hx + 2, hy - 22, 16, 11, 1.5); c.lineWidth = 1.4; c.strokeStyle = INK; c.stroke();
        break;
      case 'ball':
        shape(c, '#ffffff', (c) => circ(c, hx + 3, g.bottom - 3, 7));
        c.beginPath(); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i * Math.PI * 2) / 5; c.lineTo(hx + 3 + Math.cos(a) * 2.6, g.bottom - 3 + Math.sin(a) * 2.6); } c.closePath(); c.fillStyle = '#2a2240'; c.fill();
        break;
      case 'torch':
        shape(c, '#c9a040', (c) => { c.moveTo(hx - 3, hy - 8); c.lineTo(hx + 7, hy - 8); c.lineTo(hx + 3.5, hy + 6); c.lineTo(hx + 0.5, hy + 6); c.closePath(); });
        shape(c, '#ff7a1a', (c) => { c.moveTo(hx + 2, hy - 24); c.quadraticCurveTo(hx + 10, hy - 14, hx + 6, hy - 8); c.lineTo(hx - 2, hy - 8); c.quadraticCurveTo(hx - 5, hy - 15, hx + 2, hy - 24); c.closePath(); }, 1.4);
        c.beginPath(); ell(c, hx + 2, hy - 12, 2.4, 3.6); c.fillStyle = '#ffe14f'; c.fill();
        break;
      case 'magnifier':
        stroke(c, '#5a3a20', 3, (c) => { c.moveTo(hx - 1, hy + 5); c.lineTo(hx + 5, hy - 4); });
        shape(c, 'rgba(200,240,255,.45)', (c) => circ(c, hx + 9, hy - 10, 7), 2.2);
        shine(c, hx + 6.5, hy - 12.5, 1.6, 2.6, 0.8, 0.6);
        break;
      case 'crystal':
        shape(c, lighten(p.acc2, 0.2), (c) => { c.moveTo(hx + 3, hy - 18); c.lineTo(hx + 9, hy - 8); c.lineTo(hx + 3, hy + 4); c.lineTo(hx - 3, hy - 8); c.closePath(); }, 1.6);
        shine(c, hx + 1, hy - 9, 1.2, 4, 0.7, 0);
        break;
    }
  }
}

/* ============================== composição ============================== */

export const RARITY_SCALE: Record<CreatureRarity, number> = { common: 0.84, medio: 0.88, rare: 0.92, epic: 0.96, legendary: 1.04 };

type Layer = 'back' | 'front' | 'all';

/** Desenha a criatura (estática) em unidades: 100u = escala 1. */
export function paintCreature(c: C, cr: CreatureFull, layer: Layer, closed = false): void {
  const d = cr.design;
  const g = GEOS[d.arch];
  const p = palette(d);
  INK = p.ink;
  LW = cr.rarity === 'legendary' ? 2.6 : 2.4;
  const s = RARITY_SCALE[cr.rarity];
  c.save();
  c.scale(s, s);
  c.translate(0, g.float ? -2 : -2);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  if (layer !== 'front') {
    drawBackProps(c, g, d, p);
    drawBackLimbs(c, g, d, p);
  }
  if (layer !== 'back') {
    drawTop(c, g, d, p);
    drawFrontLimbs(c, g, d, p);
    drawBody(c, g, d, p, cr.rarity);
    if (d.limbs === 'arms') for (const sx of [-1, 1]) shine(c, sx * (g.w + 1), g.handY - 1.5, 1.6, 1, 0.5, 0);
    drawEyes(c, g, d, p, closed);
    drawMouth(c, g, d, p);
    drawFrontProps(c, g, d, p);
  }
  c.restore();
}

/* ============================== cache de sprites ============================== */

const VIEW = 150; // unidades cobertas pelo sprite (−75..75)
interface Sprites {
  back: HTMLCanvasElement;
  body: HTMLCanvasElement;
  blink: HTMLCanvasElement;
  px: number;
}
const sprites = new Map<string, Sprites>();
const MAX_SPRITES = 48;
const BUCKETS = [24, 32, 48, 64, 96, 128, 160, 200, 256, 320, 400, 512];

function makeCanvas(px: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = Math.max(1, Math.ceil(px));
  return cv;
}

function getSprites(cr: CreatureFull, sizePx: number): Sprites {
  const want = sizePx * Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  const b = BUCKETS.find((x) => x >= want) ?? 512;
  const key = `${cr.id}@${b}`;
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
    paintCreature(c, cr, layer, closed);
    return cv;
  };
  s = { back: mk('back', false), body: mk('front', false), blink: mk('front', true), px };
  sprites.set(key, s);
  if (sprites.size > MAX_SPRITES) sprites.delete(sprites.keys().next().value!);
  return s;
}

/* ============================== efeitos animados ============================== */

let tier = 2;
bus.on('quality', (t: number) => {
  tier = t;
});

const glowCache = new Map<string, HTMLCanvasElement>();
function glowSprite(col: string, rays: boolean): HTMLCanvasElement {
  const key = col + (rays ? 'r' : '');
  let cv = glowCache.get(key);
  if (cv) return cv;
  cv = makeCanvas(128);
  const c = cv.getContext('2d')!;
  if (rays) {
    c.translate(64, 64);
    for (let i = 0; i < 12; i++) {
      c.rotate(Math.PI / 6);
      const g = c.createLinearGradient(0, 0, 0, -64);
      g.addColorStop(0, alpha(col, 0.55));
      g.addColorStop(1, alpha(col, 0));
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(-7, -64);
      c.lineTo(7, -64);
      c.closePath();
      c.fill();
    }
  } else {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, alpha(col, 0.75));
    g.addColorStop(0.45, alpha(col, 0.3));
    g.addColorStop(1, alpha(col, 0));
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  }
  glowCache.set(key, cv);
  return cv;
}

const FX_COLORS: Record<FxKind, string[]> = {
  snow: ['#ffffff', '#dff6ff'],
  stars: ['#ffe14f', '#ffffff'],
  confetti: ['#ff5cc8', '#ffe14f', '#5ef0ff', '#7dff6b'],
  leaves: ['#6dff8a', '#ffb347'],
  hearts: ['#ff6fa8', '#ffb3d6'],
  bubbles: ['#bff6ff', '#ffffff'],
  embers: ['#ffb000', '#ff5a1f'],
  gears: ['#ffd166', '#c9d0e0'],
  notes: ['#ff3cac', '#3cf0ff'],
  pixels: ['#4fff7a', '#ff4fd8', '#ffe14f'],
  petals: ['#ffa6e0', '#ffffff'],
  sparkles: ['#ffffff', '#ffe08a'],
  bolts: ['#ffe14f', '#7dfcff'],
  moons: ['#fff3c0', '#c7d4ff'],
  gems: ['#b06bff', '#6dfcff'],
};

function particle(c: C, kind: FxKind, x: number, y: number, r: number, rot: number, col: string): void {
  c.fillStyle = col;
  c.strokeStyle = col;
  c.beginPath();
  switch (kind) {
    case 'snow':
    case 'embers':
      circ(c, x, y, r * 0.6);
      c.fill();
      return;
    case 'bubbles':
      circ(c, x, y, r);
      c.lineWidth = r * 0.3;
      c.stroke();
      return;
    case 'confetti':
    case 'pixels':
      c.save();
      c.translate(x, y);
      c.rotate(kind === 'pixels' ? 0 : rot);
      c.fillRect(-r * 0.8, -r * 0.4, r * 1.6, kind === 'pixels' ? r * 1.6 : r * 0.8);
      c.restore();
      return;
    case 'leaves':
    case 'petals':
      ell(c, x, y, r, r * 0.5, rot);
      c.fill();
      return;
    case 'hearts':
      heartPath(c, x, y, r * 0.8);
      c.fill();
      return;
    case 'notes':
      ell(c, x, y, r * 0.6, r * 0.45, -0.4);
      c.rect(x + r * 0.4, y - r * 1.6, r * 0.25, r * 1.6);
      c.fill();
      return;
    case 'moons':
      c.arc(x, y, r, Math.PI * 0.3, Math.PI * 1.7);
      c.arc(x + r * 0.5, y, r * 0.75, Math.PI * 1.6, Math.PI * 0.4, true);
      c.fill();
      return;
    case 'bolts':
      c.moveTo(x, y - r);
      c.lineTo(x - r * 0.5, y + r * 0.1);
      c.lineTo(x + r * 0.1, y + r * 0.1);
      c.lineTo(x - r * 0.2, y + r);
      c.lineTo(x + r * 0.6, y - r * 0.2);
      c.lineTo(x, y - r * 0.2);
      c.closePath();
      c.fill();
      return;
    case 'gears':
      circ(c, x, y, r * 0.75);
      c.lineWidth = r * 0.45;
      c.setLineDash([r * 0.4, r * 0.3]);
      c.stroke();
      c.setLineDash([]);
      return;
    case 'gems':
      c.moveTo(x, y - r);
      c.lineTo(x + r * 0.7, y);
      c.lineTo(x, y + r);
      c.lineTo(x - r * 0.7, y);
      c.closePath();
      c.fill();
      return;
    default:
      // estrela de 4 pontas (stars / sparkles)
      starPath(c, x, y, r, r * 0.35, 4, rot);
      c.fill();
  }
}

function drawFx(c: C, cr: CreatureFull, t: number, front: boolean): void {
  const d = cr.design;
  const kind = d.fx;
  const cols = FX_COLORS[kind];
  const R = cr.rarity;
  if (R === 'legendary') {
    const n = tier === 0 ? 4 : tier === 1 ? 7 : 11;
    for (let i = 0; i < n; i++) {
      const ph = (t * 0.18 + i / n) % 1;
      const ang = i * 2.399 + t * 0.4;
      const isFront = i % 2 === 0;
      if (isFront !== front) continue;
      const rad = 30 + (i % 3) * 9;
      const x = Math.cos(ang) * rad;
      const y = 30 - ph * 80 + Math.sin(ang) * 6;
      c.globalAlpha = Math.sin(ph * Math.PI);
      particle(c, kind, x, y, 3.2 + (i % 3), t + i, cols[i % cols.length]);
    }
    c.globalAlpha = 1;
  } else if (R === 'epic' && front) {
    for (let i = 0; i < 4; i++) {
      const a = t * 1.2 + (i * Math.PI) / 2;
      c.globalAlpha = 0.55 + 0.45 * Math.sin(t * 3 + i);
      particle(c, 'sparkles', Math.cos(a) * 40, Math.sin(a) * 14 - 4, 3, 0, cols[i % cols.length]);
    }
    c.globalAlpha = 1;
  } else if (R === 'rare' && front) {
    for (let i = 0; i < 2; i++) {
      const k = (t * 0.7 + i * 0.5) % 1;
      c.globalAlpha = Math.sin(k * Math.PI);
      particle(c, 'sparkles', i ? 30 : -32, i ? -22 : -8, 2.6 + k * 1.5, 0, '#ffffff');
    }
    c.globalAlpha = 1;
  }
}

/* ============================== API pública ============================== */

export interface DrawOpts {
  mood?: 'happy' | 'sad' | 'sleep' | 'idle';
  still?: boolean;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
const phaseCache = new Map<string, number>();

/**
 * Desenha a criatura animada centrada em (0,0) do contexto atual, ocupando ~sizePx.
 * `t` em segundos. Usa sprites em cache; por quadro só faz transformações + partículas.
 */
export function drawCreature(c: C, id: string, sizePx: number, t: number, opts: DrawOpts = {}): void {
  const cr = creatureById(id);
  if (!cr) return;
  const sp = getSprites(cr, sizePx);
  const still = !!opts.still;
  const mood = opts.mood ?? 'idle';
  let ph = phaseCache.get(id);
  if (ph === undefined) {
    ph = (hash(id) % 1000) / 1000;
    phaseCache.set(id, ph);
  }
  const tt = still ? 0 : t + ph * 10;
  const k = sizePx / 100; // px por unidade
  const draw = (cv: HTMLCanvasElement, sx = 1, sy = 1, dy = 0) => {
    const w = (VIEW * k * sx) / 1;
    const h = VIEW * k * sy;
    c.drawImage(cv, -w / 2, -h / 2 + dy * k - (sy - 1) * VIEW * k * 0.5 * 0.2, w, h);
  };
  const legendary = cr.rarity === 'legendary';
  const epic = cr.rarity === 'epic';
  // aura
  if ((legendary || epic) && tier > 0) {
    const pulse = still ? 1 : 1 + 0.06 * Math.sin(tt * 2.2);
    if (legendary) {
      c.save();
      c.rotate(still ? 0 : tt * 0.25);
      const r = 62 * k * pulse;
      c.globalAlpha = 0.8;
      c.drawImage(glowSprite(cr.design.acc, true), -r, -r, r * 2, r * 2);
      c.restore();
    }
    const r = (legendary ? 52 : 44) * k * pulse;
    c.globalAlpha = legendary ? 0.9 : 0.6;
    c.drawImage(glowSprite(legendary ? '#ffe08a' : cr.design.acc2, false), -r, -r, r * 2, r * 2);
    c.globalAlpha = 1;
  }
  const fxOn = !still && (tier > 0 || legendary);
  if (fxOn && legendary) {
    c.save();
    c.scale(k, k);
    drawFx(c, cr, tt, false);
    c.restore();
  }
  // movimento
  const speed = mood === 'happy' ? 4.4 : mood === 'sad' ? 1.4 : mood === 'sleep' ? 1 : 2.4;
  const amp = mood === 'happy' ? 1 : mood === 'sleep' ? 0.4 : 0.6;
  const s = Math.sin(tt * speed);
  const bob = still ? 0 : (cr.design.arch === 'jelly' || cr.design.arch === 'ghost' || cr.design.arch === 'cloud' || cr.design.arch === 'fish' ? -2.6 * s : -Math.abs(s) * 2.2) * amp;
  const sq = still ? 0 : 0.035 * s * amp;
  const wings = cr.design.limbs.includes('wings') || cr.design.limbs === 'bigwings';
  const flap = still ? 1 : 1 + (wings ? 0.07 * Math.sin(tt * (legendary ? 7 : 5.5)) : 0.025 * Math.sin(tt * 3));
  c.save();
  c.translate(0, (bob + (mood === 'sad' ? 2 : 0)) * k);
  draw(sp.back, flap, wings ? 1 + 0.03 * Math.sin(tt * 6) : 1);
  const blinking = mood === 'sleep' || (!still && (tt % 3.6) < 0.13);
  c.scale(1 + sq, 1 - sq);
  draw(blinking ? sp.blink : sp.body);
  c.restore();
  if (fxOn) {
    c.save();
    c.scale(k, k);
    drawFx(c, cr, tt, true);
    if (mood === 'sleep') {
      c.fillStyle = '#ffffff';
      c.font = gameFont('bold', 9);
      const z = (tt * 0.6) % 1;
      c.globalAlpha = 1 - z;
      c.fillText('z', 22 + z * 8, -28 - z * 16);
      c.globalAlpha = 1;
    }
    c.restore();
  }
}

/** Seguidor pequeno ao lado do jogador nos minigames (usa sprites em cache). */
export function drawCompanion(c: C, id: string, x: number, y: number, size: number, t: number): void {
  c.save();
  c.translate(x, y + Math.sin(t * 3.1) * size * 0.06);
  drawCreature(c, id, size, t, {});
  c.restore();
}

export const RARITY_COLORS: Record<CreatureRarity, [string, string, string]> = {
  common: ['#7f8fb8', '#4a5680', '#c9d3f0'],
  medio: ['#3ecf7a', '#1d7a4a', '#b8ffd6'],
  rare: ['#3f8cff', '#1d4aa8', '#b8d8ff'],
  epic: ['#b45cff', '#5a1da8', '#e6c8ff'],
  legendary: ['#ffc23a', '#c96a00', '#fff2b0'],
};

const iconCache = new Map<string, HTMLCanvasElement>();

/**
 * Ícone estático (cache) com fundo de raridade — para foto de perfil, cartões de recompensa e grade.
 * `locked`: silhueta escura (sem fundo colorido).
 */
export function renderCreatureIcon(id: string, px: number, opts: { locked?: boolean; backdrop?: boolean } = {}): HTMLCanvasElement {
  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  const key = `${id}|${px}|${opts.locked ? 1 : 0}|${opts.backdrop === false ? 0 : 1}|${dpr}`;
  const hit = iconCache.get(key);
  if (hit) return hit;
  const cr = creatureById(id);
  const cv = makeCanvas(px * dpr);
  cv.style.width = cv.style.height = `${px}px`;
  if (!cr) return cv;
  const c = cv.getContext('2d')!;
  const S = px * dpr;
  if (opts.backdrop !== false) {
    const [a, b, light] = opts.locked ? ['#2a2050', '#140c30', '#3a3070'] : RARITY_COLORS[cr.rarity];
    const g = c.createRadialGradient(S * 0.5, S * 0.42, S * 0.05, S * 0.5, S * 0.5, S * 0.72);
    g.addColorStop(0, light);
    g.addColorStop(0.45, a);
    g.addColorStop(1, b);
    c.fillStyle = g;
    c.beginPath();
    rr(c, 0, 0, S, S, S * 0.2);
    c.fill();
    if (!opts.locked && cr.rarity === 'legendary') {
      c.save();
      c.translate(S / 2, S / 2);
      c.globalAlpha = 0.5;
      c.drawImage(glowSprite('#ffffff', true), -S * 0.7, -S * 0.7, S * 1.4, S * 1.4);
      c.restore();
    }
  }
  // criatura num canvas separado (para silhueta)
  const layer = makeCanvas(S);
  const lc = layer.getContext('2d')!;
  lc.translate(S / 2, S * 0.56);
  const k = (S / 100) * 1.12;
  lc.scale(k, k);
  paintCreature(lc, cr, 'all');
  if (opts.locked) {
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalCompositeOperation = 'source-in';
    lc.fillStyle = '#0d0624';
    lc.fillRect(0, 0, S, S);
  }
  c.save();
  c.beginPath();
  rr(c, 0, 0, S, S, S * 0.2);
  c.clip();
  c.drawImage(layer, 0, 0);
  c.restore();
  iconCache.set(key, cv);
  if (iconCache.size > 400) iconCache.delete(iconCache.keys().next().value!);
  return cv;
}

/** Limpa caches (ex.: ao sair da coleção em aparelhos fracos). */
export function clearCreatureCaches(): void {
  sprites.clear();
  iconCache.clear();
}
