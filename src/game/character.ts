/* ============================================================
 *  PERSONAGEM — desenhado em vetor, 1 vez por frame.
 *  Regras de performance: sem shadowBlur, sem canvas novos por frame;
 *  brilhos usam o sprite cacheado `glow()`.
 * ============================================================ */
import { rng, TAU } from './math';
import { glow } from './sprites';
import type { Face, Skin } from './skins';
import { drawAvatar } from './avatar';
import { save } from '../core/storage';

export interface PlayerPose {
  t: number;
  blink: number; // 0..1 (1 = fechado)
  lookX: number;
  lookY: number;
  sx: number;
  sy: number;
  mood: 'idle' | 'fly' | 'dead' | 'happy';
  /** direção da luz no espaço local (para sombreamento) */
  lx: number;
  ly: number;
  /** desliga a "respiração" do idle (ícones estáticos) */
  still?: boolean;
  /** não desenha olhos/boca (quem chama desenha uma careta própria por cima) */
  noFace?: boolean;
  /** PAPER (src/3d/paper): 'back' = visto de costas (sem rosto/barriga; costas na frente do corpo) */
  view?: 'back';
  /** PAPER: não desenha os pezinhos (o billboard 3D anima os próprios) */
  noFeet?: boolean;
  /** PAPER: sem o contorno do corpo (vistas giradas ganham contorno próprio) */
  noLine?: boolean;
}

const PI = Math.PI;

/* ---------------------------- cores ---------------------------- */

function hx(h: string): [number, number, number] {
  const n = parseInt(h.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: string, b: string, t: number): string {
  const A = hx(a);
  const B = hx(b);
  const r = Math.round(A[0] + (B[0] - A[0]) * t);
  const g = Math.round(A[1] + (B[1] - A[1]) * t);
  const bl = Math.round(A[2] + (B[2] - A[2]) * t);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}
function al(h: string, a: number): string {
  const [r, g, b] = hx(h);
  return `rgba(${r},${g},${b},${a})`;
}
function lum(h: string): number {
  const [r, g, b] = hx(h);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

interface Derived {
  face: Face;
  hi: string;
  outline: string;
  feet: string;
  feetHi: string;
  rim: string;
  iris: string;
  irisHi: string;
  irisEdge: string;
  pupil: string;
  lid: string;
  lidSkin: string;
  lidShade: string;
  lidShade0: string;
  eyeLine: string;
  sh0: string;
  shM: string;
  shA: string;
  ao: string;
  ao0: string;
  mouth: string;
  belly: boolean;
  /** geometria pré-calculada (coordenadas unitárias) — rachaduras, circuitos, facetas */
  geo: number[][];
}

const cache = new WeakMap<Skin, Derived>();

function hashId(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function derive(s: Skin): Derived {
  let d = cache.get(s);
  if (d) return d;
  const deep = mix(s.dark, '#12001f', 0.55);
  const iris = s.iris ?? mix(s.dark, s.eye, 0.25);
  const pupil = lum(s.eye) > 0.55 ? '#16112a' : s.eye;
  const darkBody = lum(s.light) < 0.35;
  d = {
    face: s.face ?? (s.accessory === 'robot' ? 'robot' : 'cute'),
    hi: mix(s.light, '#ffffff', 0.4),
    outline: darkBody ? al(mix(s.rim ?? s.light, '#ffffff', 0.2), 0.55) : al(deep, 0.55),
    feet: mix(s.dark, deep, 0.25),
    feetHi: al(mix(s.light, '#ffffff', 0.3), 0.55),
    rim: s.rim ?? mix(s.light, '#ffffff', 0.55),
    iris,
    irisHi: mix(iris, '#ffffff', 0.5),
    irisEdge: mix(iris, pupil, 0.6),
    pupil,
    lid: darkBody ? mix(s.light, '#ffffff', 0.6) : mix(deep, '#2a1140', 0.5),
    lidSkin: mix(s.light, s.dark, 0.35),
    lidShade: al(deep, 0.3),
    lidShade0: al(deep, 0),
    eyeLine: al(deep, darkBody ? 0.2 : 0.35),
    sh0: al(deep, 0),
    shM: al(deep, 0.08),
    shA: al(deep, darkBody ? 0.25 : 0.42),
    ao: al(deep, 0.45),
    ao0: al(deep, 0),
    mouth: mix(deep, '#5a1030', 0.5),
    belly: !['lava', 'void', 'jersey', 'pumpkin', 'circuit', 'gold', 'crystal', 'rainbow', 'holo', 'ember', 'bee'].includes(s.pattern),
    geo: buildGeo(s),
  };
  cache.set(s, d);
  return d;
}

function buildGeo(s: Skin): number[][] {
  const r = rng(hashId(s.id));
  const out: number[][] = [];
  if (s.pattern === 'lava') {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + r() * 0.5;
      let px = Math.cos(a) * 1.05;
      let py = Math.sin(a) * 1.05;
      const line = [px, py];
      for (let k = 0; k < 4; k++) {
        const ia = Math.atan2(-py, -px) + (r() - 0.5) * 1.6;
        const st = 0.16 + r() * 0.14;
        px += Math.cos(ia) * st;
        py += Math.sin(ia) * st;
        const rr = Math.hypot(px, py);
        if (rr < 0.66) {
          px *= 0.66 / rr;
          py *= 0.66 / rr;
        }
        line.push(px, py);
      }
      out.push(line);
    }
  } else if (s.pattern === 'circuit') {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.3 + r() * 0.3;
      const px = Math.cos(a) * 1.05;
      const py = Math.sin(a) * 1.05;
      const mx = px * (0.55 + r() * 0.2);
      const my = py;
      const ex = mx;
      const ey = py * (0.45 + r() * 0.2);
      out.push([px, py, mx, my, ex, ey]);
    }
  } else if (s.pattern === 'crystal') {
    const n = 8;
    const inner: number[] = [];
    const rim: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + r() * 0.3;
      const ri = 0.38 + r() * 0.18;
      inner.push(Math.cos(a) * ri, Math.sin(a) * ri);
      const b = ((i + 0.5) / n) * TAU + r() * 0.3;
      rim.push(Math.cos(b) * 1.25, Math.sin(b) * 1.25);
    }
    const cx = (r() - 0.5) * 0.2;
    const cy = (r() - 0.5) * 0.2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      out.push([cx, cy, inner[i * 2], inner[i * 2 + 1], inner[j * 2], inner[j * 2 + 1]]);
      out.push([inner[i * 2], inner[i * 2 + 1], rim[i * 2], rim[i * 2 + 1], inner[j * 2], inner[j * 2 + 1]]);
      const k = (i + n - 1) % n;
      out.push([inner[i * 2], inner[i * 2 + 1], rim[k * 2], rim[k * 2 + 1], rim[i * 2], rim[i * 2 + 1]]);
    }
  } else {
    // pontos genéricos (estrelas, brilhos)
    for (let i = 0; i < 18; i++) out.push([(r() - 0.5) * 1.8, (r() - 0.5) * 1.8, r(), r()]);
  }
  return out;
}

/* ---------------------------- helpers ---------------------------- */

function ell(x: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, rot = 0): void {
  x.beginPath();
  x.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
}
function circ(x: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  x.beginPath();
  x.arc(cx, cy, Math.max(0.01, r), 0, TAU);
}
function lin(x: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, ...cols: string[]): CanvasGradient {
  const g = x.createLinearGradient(x0, y0, x1, y1);
  const n = cols.length - 1;
  cols.forEach((c, i) => g.addColorStop(n ? i / n : 0, c));
  return g;
}
function rad(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, ...cols: string[]): CanvasGradient {
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, Math.max(0.01, r));
  const n = cols.length - 1;
  cols.forEach((c, i) => g.addColorStop(n ? i / n : 0, c));
  return g;
}
function glowAt(x: CanvasRenderingContext2D, color: string, cx: number, cy: number, r: number, a = 1): void {
  const o = x.globalAlpha;
  x.globalAlpha = o * a;
  x.drawImage(glow(color, 64), cx - r, cy - r, r * 2, r * 2);
  x.globalAlpha = o;
}
function star4(x: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  x.beginPath();
  x.moveTo(cx, cy - r);
  x.quadraticCurveTo(cx, cy, cx + r, cy);
  x.quadraticCurveTo(cx, cy, cx, cy + r);
  x.quadraticCurveTo(cx, cy, cx - r, cy);
  x.quadraticCurveTo(cx, cy, cx, cy - r);
  x.fill();
}
function star5(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, rot = 0): void {
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -PI / 2 + rot + (i / 10) * TAU;
    const rr = i % 2 ? r * 0.45 : r;
    x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  x.closePath();
  x.fill();
}

const DASH_LAVA = [0, 0];
const DASH_NONE: number[] = [];

/* ============================================================
 *  drawPlayer
 * ============================================================ */

export function drawPlayer(x: CanvasRenderingContext2D, skin: Skin, R: number, p: PlayerPose): void {
  if (skin.id === 'custom') return drawAvatar(x, save.avatar, R, p);
  const d = derive(skin);
  const back = p.view === 'back';
  const ghost = skin.pattern === 'ghost';
  const calm = (p.mood === 'idle' || p.mood === 'happy') && !p.still;
  const br = calm ? Math.sin(p.t * 2.6) * 0.035 : 0;

  x.save();
  x.scale(p.sx * (1 + br), p.sy * (1 - br));
  if (br) x.translate(0, R * br);

  // pezinhos
  if (p.mood !== 'fly' && !ghost && !p.noFeet) {
    for (const s of [-1, 1]) {
      x.fillStyle = d.feet;
      ell(x, s * R * 0.42, R * 0.86, R * 0.28, R * 0.18);
      x.fill();
      x.fillStyle = d.feetHi;
      ell(x, s * R * 0.42 - R * 0.06, R * 0.8, R * 0.12, R * 0.06);
      x.fill();
    }
  }

  if (!back) drawAccessory(x, skin, R, p, true);

  // corpo
  bodyPath(x, R, p.t, ghost);
  const g = x.createRadialGradient(p.lx * R * 0.42, p.ly * R * 0.42, R * 0.05, 0, 0, R * 1.08);
  g.addColorStop(0, d.hi);
  g.addColorStop(0.45, skin.light);
  g.addColorStop(1, skin.dark);
  x.fillStyle = g;
  x.globalAlpha = ghost ? 0.9 : 1;
  x.fill();
  x.globalAlpha = 1;

  x.save();
  x.clip();
  drawPattern(x, skin, d, R, p);
  if (d.belly && !back) {
    x.fillStyle = skin.belly;
    x.globalAlpha = 0.55;
    ell(x, 0, R * 0.55, R * 0.6, R * 0.42);
    x.fill();
    x.globalAlpha = 1;
  }
  hatAO(x, skin, d, R);
  // sombra interna suave (lado oposto à luz)
  const sg = x.createRadialGradient(p.lx * R * 0.3, p.ly * R * 0.3, R * 0.5, -p.lx * R * 0.05, -p.ly * R * 0.05, R * 1.18);
  sg.addColorStop(0, d.sh0);
  sg.addColorStop(0.6, d.shM);
  sg.addColorStop(1, d.shA);
  x.fillStyle = sg;
  x.fillRect(-R * 1.3, -R * 1.3, R * 2.6, R * 2.6);
  // rim light (contraluz)
  const ra = Math.atan2(-p.ly, -p.lx);
  x.strokeStyle = d.rim;
  x.lineCap = 'round';
  x.globalAlpha = 0.28;
  x.lineWidth = R * 0.22;
  x.beginPath();
  x.arc(0, 0, R * 0.99, ra - 1.0, ra + 1.0);
  x.stroke();
  x.globalAlpha = 0.75;
  x.lineWidth = R * 0.07;
  x.beginPath();
  x.arc(0, 0, R * 0.92, ra - 0.65, ra + 0.65);
  x.stroke();
  x.globalAlpha = 1;
  // especular
  const sa = Math.atan2(p.ly, p.lx);
  x.fillStyle = 'rgba(255,255,255,0.45)';
  ell(x, p.lx * R * 0.52, p.ly * R * 0.52, R * 0.3, R * 0.16, sa + PI / 2);
  x.fill();
  x.fillStyle = 'rgba(255,255,255,0.9)';
  circ(x, p.lx * R * 0.5 + p.ly * R * 0.2, p.ly * R * 0.5 - p.lx * R * 0.2, R * 0.065);
  x.fill();
  if (skin.pattern === 'shine') {
    x.strokeStyle = 'rgba(255,255,255,0.6)';
    x.lineWidth = R * 0.1;
    x.beginPath();
    x.arc(0, 0, R * 0.78, -2.6, -1.9);
    x.stroke();
  }
  x.restore();

  // contorno
  x.strokeStyle = d.outline;
  x.lineWidth = R * 0.065;
  if (p.noLine) {
    /* PAPER: sem contorno */
  } else if (ghost) {
    x.globalAlpha = 0.5;
    bodyPath(x, R * 0.985, p.t, true);
    x.stroke();
    x.globalAlpha = 1;
  } else {
    circ(x, 0, 0, R * 0.97);
    x.stroke();
  }

  if (back) drawAccessory(x, skin, R, p, true);
  else if (!p.noFace) drawFace(x, skin, d, R, p);
  drawAccessory(x, skin, R, p, false);
  x.restore();
}

function bodyPath(x: CanvasRenderingContext2D, R: number, t: number, ghost: boolean): void {
  x.beginPath();
  if (ghost) {
    x.arc(0, -R * 0.05, R, PI, 0);
    const waves = 4;
    for (let i = 0; i <= waves * 2; i++) {
      const px = R - (i / (waves * 2)) * R * 2;
      const py = R * 0.75 + (i % 2 ? -1 : 1) * R * 0.14 + Math.sin(t * 8 + i) * R * 0.06;
      x.lineTo(px, py);
    }
    x.closePath();
  } else {
    x.arc(0, 0, R, 0, TAU);
  }
}

/** sombra de oclusão onde chapéus/faixas encostam na cabeça */
const HAT_AO: Partial<Record<string, [number, number, number]>> = {
  chef: [-0.86, 0.8, 1],
  pirate: [-0.66, 1.0, 1],
  wizard: [-0.74, 0.95, 1],
  samurai: [-0.5, 1.05, 1],
  snowhat: [-0.78, 0.75, 1],
  crown: [-0.8, 0.6, 0.8],
  laurel: [-0.72, 0.85, 0.7],
  headband: [-0.32, 1.05, 0.5],
  soccer: [-0.5, 1.05, 0.5],
  zombie: [-0.62, 0.9, 0.5],
  capy: [-0.92, 0.45, 0.8],
  crystals: [-0.88, 0.55, 0.8],
  rocks: [-0.82, 0.7, 0.9],
  stem: [-0.94, 0.35, 0.8],
  unicorn: [-0.85, 0.35, 0.7],
  cyber: [-0.9, 0.5, 0.6],
  phoenix: [-0.92, 0.4, 0.6],
  astro: [0.82, 0.9, 0.6],
};

function hatAO(x: CanvasRenderingContext2D, skin: Skin, d: Derived, R: number): void {
  const ao = HAT_AO[skin.accessory];
  if (!ao) return;
  x.save();
  x.translate(0, ao[0] * R);
  x.scale(1, 0.38);
  const g = x.createRadialGradient(0, 0, 0, 0, 0, ao[1] * R);
  g.addColorStop(0, d.ao);
  g.addColorStop(1, d.ao0);
  x.globalAlpha = ao[2];
  x.fillStyle = g;
  x.fillRect(-R * 1.2, -R * 1.2, R * 2.4, R * 2.4);
  x.restore();
}

/* ============================================================
 *  PADRÕES (dentro do clip do corpo)
 * ============================================================ */

function drawPattern(x: CanvasRenderingContext2D, s: Skin, d: Derived, R: number, p: PlayerPose): void {
  const t = p.t;
  switch (s.pattern) {
    case 'spots': {
      x.fillStyle = 'rgba(255,255,255,0.3)';
      for (const [sx, sy, sr] of [[-0.5, -0.45, 0.18], [0.58, -0.2, 0.13], [0.42, 0.52, 0.15], [-0.62, 0.32, 0.1], [0.1, -0.78, 0.08]]) {
        circ(x, sx * R, sy * R, sr * R);
        x.fill();
      }
      break;
    }
    case 'stripes': {
      x.strokeStyle = s.dark;
      x.globalAlpha = 0.55;
      x.lineWidth = R * 0.15;
      x.lineCap = 'round';
      for (const sx of [-0.75, 0.75]) {
        for (const sy of [-0.38, 0, 0.38]) {
          x.beginPath();
          x.moveTo(sx * R * 1.2, sy * R);
          x.lineTo(sx * R * 0.72, sy * R + R * 0.08);
          x.stroke();
        }
      }
      x.beginPath();
      x.moveTo(-R * 0.12, -R * 1.0);
      x.lineTo(-R * 0.08, -R * 0.72);
      x.moveTo(R * 0.12, -R * 1.0);
      x.lineTo(R * 0.08, -R * 0.72);
      x.stroke();
      x.globalAlpha = 1;
      break;
    }
    case 'galaxy': {
      x.fillStyle = rad(x, R * 0.35, R * 0.3, R, 'rgba(255,92,220,0.6)', 'rgba(255,92,220,0)');
      x.fillRect(-R, -R, R * 2, R * 2);
      x.fillStyle = rad(x, -R * 0.5, -R * 0.2, R * 0.8, 'rgba(80,200,255,0.45)', 'rgba(80,200,255,0)');
      x.fillRect(-R, -R, R * 2, R * 2);
      x.fillStyle = '#ffffff';
      for (let i = 0; i < d.geo.length; i++) {
        const q = d.geo[i];
        x.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t * 2 + i));
        if (q[2] > 0.82) star4(x, q[0] * R, q[1] * R, R * 0.12);
        else {
          circ(x, q[0] * R, q[1] * R, R * (0.03 + q[3] * 0.04));
          x.fill();
        }
      }
      x.globalAlpha = 1;
      break;
    }
    case 'bee': {
      x.fillStyle = s.accent;
      x.globalAlpha = 0.92;
      for (const [y0, h] of [[-0.62, 0.2], [0.02, 0.2], [0.58, 0.22]]) {
        x.beginPath();
        x.moveTo(-R * 1.1, (y0 + 0.12) * R);
        x.quadraticCurveTo(0, (y0 - 0.1) * R, R * 1.1, (y0 + 0.12) * R);
        x.lineTo(R * 1.1, (y0 + h + 0.12) * R);
        x.quadraticCurveTo(0, (y0 + h - 0.1) * R, -R * 1.1, (y0 + h + 0.12) * R);
        x.closePath();
        x.fill();
      }
      x.globalAlpha = 1;
      break;
    }
    case 'patches': {
      x.fillStyle = mix(s.light, '#9fd0ff', 0.35);
      x.beginPath();
      x.moveTo(R * 0.45, -R * 1.05);
      x.lineTo(R * 1.05, -R * 0.75);
      x.lineTo(R * 1.05, R * 0.15);
      x.lineTo(R * 0.72, -R * 0.35);
      x.closePath();
      x.fill();
      x.fillStyle = mix(s.light, '#d0a0ff', 0.3);
      ell(x, -R * 0.62, R * 0.55, R * 0.3, R * 0.22, 0.4);
      x.fill();
      x.strokeStyle = d.mouth;
      x.lineWidth = R * 0.045;
      x.lineCap = 'round';
      x.beginPath();
      x.moveTo(R * 0.45, -R * 1.05);
      x.lineTo(R * 0.72, -R * 0.35);
      x.lineTo(R * 1.05, R * 0.15);
      for (let i = 0; i < 3; i++) {
        const k = i / 2;
        const mx = R * (0.47 + (0.72 - 0.47) * k);
        const my = R * (-0.98 + (-0.35 + 0.98) * k);
        x.moveTo(mx - R * 0.08, my + R * 0.02);
        x.lineTo(mx + R * 0.08, my - R * 0.02);
      }
      x.stroke();
      break;
    }
    case 'jersey': {
      // faixa verde inferior com friso azul + losango amarelo
      x.fillStyle = s.accent;
      x.beginPath();
      x.moveTo(-R * 1.1, R * 0.38);
      x.quadraticCurveTo(0, R * 0.62, R * 1.1, R * 0.38);
      x.lineTo(R * 1.1, R * 1.1);
      x.lineTo(-R * 1.1, R * 1.1);
      x.closePath();
      x.fill();
      x.strokeStyle = s.accent2 ?? '#1f4fd1';
      x.lineWidth = R * 0.07;
      x.beginPath();
      x.moveTo(-R * 1.1, R * 0.38);
      x.quadraticCurveTo(0, R * 0.62, R * 1.1, R * 0.38);
      x.stroke();
      x.strokeStyle = '#ffffff';
      x.lineWidth = R * 0.03;
      x.beginPath();
      x.moveTo(-R * 1.1, R * 0.46);
      x.quadraticCurveTo(0, R * 0.7, R * 1.1, R * 0.46);
      x.stroke();
      // escudinho
      x.fillStyle = s.accent2 ?? '#1f4fd1';
      circ(x, R * 0.55, R * 0.78, R * 0.13);
      x.fill();
      x.fillStyle = '#ffdf1f';
      star5(x, R * 0.55, R * 0.78, R * 0.08);
      break;
    }
    case 'pumpkin': {
      x.lineCap = 'round';
      for (const k of [-0.62, -0.25, 0.25, 0.62]) {
        x.strokeStyle = al(s.dark, 0.55);
        x.lineWidth = R * 0.08;
        x.beginPath();
        x.moveTo(k * R * 0.3, -R);
        x.quadraticCurveTo(k * R * 1.7, 0, k * R * 0.3, R);
        x.stroke();
        x.strokeStyle = 'rgba(255,230,170,0.35)';
        x.lineWidth = R * 0.05;
        x.beginPath();
        x.moveTo(k * R * 0.3 - R * 0.08, -R);
        x.quadraticCurveTo(k * R * 1.7 - R * 0.14, 0, k * R * 0.3 - R * 0.08, R);
        x.stroke();
      }
      break;
    }
    case 'snow': {
      x.fillStyle = 'rgba(150,190,240,0.35)';
      ell(x, 0, R * 1.05, R * 1.1, R * 0.5);
      x.fill();
      x.fillStyle = '#ffffff';
      for (let i = 0; i < 8; i++) {
        const q = d.geo[i];
        x.globalAlpha = 0.3 + 0.7 * Math.max(0, Math.sin(t * 2.5 + i * 1.7));
        x.fillStyle = i % 2 ? '#bfe6ff' : '#ffffff';
        star4(x, q[0] * R, q[1] * R, R * (0.06 + q[3] * 0.06));
      }
      x.globalAlpha = 1;
      break;
    }
    case 'sparkle': {
      x.globalAlpha = 0.45;
      x.fillStyle = lin(x, -R, -R, R, R, '#ffb3ec', '#d9b3ff', '#b3e6ff', '#b3ffd9');
      x.fillRect(-R, -R, R * 2, R * 2);
      x.globalAlpha = 1;
      for (let i = 0; i < 7; i++) {
        const q = d.geo[i];
        const tw = Math.sin(t * 3 + i * 2.1);
        if (tw < 0) continue;
        x.globalAlpha = tw;
        x.fillStyle = i % 2 ? '#ffffff' : s.accent;
        star4(x, q[0] * R, q[1] * R, R * (0.08 + tw * 0.06));
      }
      x.globalAlpha = 1;
      break;
    }
    case 'scales': {
      x.strokeStyle = al(s.accent2 ?? s.dark, 0.4);
      x.lineWidth = R * 0.05;
      for (let row = 0; row < 4; row++) {
        const y = -R * 0.95 + row * R * 0.2;
        for (let col = -5; col <= 5; col++) {
          const cx = col * R * 0.22 + (row % 2) * R * 0.11;
          if (row > 1 && Math.abs(cx) < R * 0.6) continue;
          x.beginPath();
          x.arc(cx, y, R * 0.11, 0.15, PI - 0.15);
          x.stroke();
        }
      }
      for (const sx of [-1, 1]) {
        for (let row = 0; row < 4; row++) {
          const y = -R * 0.1 + row * R * 0.22;
          x.beginPath();
          x.arc(sx * R * (0.9 - row * 0.05), y, R * 0.11, 0.15, PI - 0.15);
          x.stroke();
        }
      }
      // placas da barriga
      x.fillStyle = s.belly;
      x.globalAlpha = 0.85;
      ell(x, 0, R * 0.6, R * 0.5, R * 0.42);
      x.fill();
      x.globalAlpha = 1;
      x.strokeStyle = al(s.dark, 0.35);
      x.lineWidth = R * 0.04;
      for (let i = 0; i < 3; i++) {
        const y = R * (0.38 + i * 0.16);
        x.beginPath();
        x.moveTo(-R * 0.4, y);
        x.quadraticCurveTo(0, y + R * 0.06, R * 0.4, y);
        x.stroke();
      }
      break;
    }
    case 'rainbow': {
      const cols = ['#ff4f6b', '#ff9f3a', '#ffe53a', '#4fe37a', '#3ac8ff', '#9b6bff'];
      const off = (t * 0.6) % 1;
      x.save();
      x.rotate(-0.35);
      x.globalAlpha = 0.85;
      const bw = R * 0.42;
      for (let i = -1; i < 7; i++) {
        x.fillStyle = cols[(((i - Math.floor(t * 0.6)) % 6) + 6) % 6];
        x.fillRect(-R * 1.5, -R * 1.4 + (i + off) * bw, R * 3, bw + 0.5);
      }
      x.globalAlpha = 0.35;
      const sx = ((t * 0.9) % 2) * R * 2.6 - R * 2.6;
      x.fillStyle = lin(x, sx, 0, sx + R * 0.9, 0, 'rgba(255,255,255,0)', '#ffffff', 'rgba(255,255,255,0)');
      x.fillRect(sx, -R * 1.5, R * 0.9, R * 3);
      x.restore();
      x.globalAlpha = 1;
      break;
    }
    case 'holo': {
      const a = t * 0.7;
      const c = Math.cos(a) * R;
      const sn = Math.sin(a) * R;
      x.globalAlpha = 0.55;
      x.fillStyle = lin(x, -c, -sn, c, sn, '#ff9cf0', '#9ffcff', '#fff59c', '#c8a6ff', '#ff9cf0');
      x.fillRect(-R, -R, R * 2, R * 2);
      x.globalAlpha = 0.5;
      const sx = ((t * 0.8) % 2) * R * 3 - R * 2;
      x.save();
      x.rotate(0.6);
      x.fillStyle = lin(x, sx, 0, sx + R * 0.6, 0, 'rgba(255,255,255,0)', '#ffffff', 'rgba(255,255,255,0)');
      x.fillRect(sx, -R * 1.5, R * 0.6, R * 3);
      x.restore();
      x.globalAlpha = 1;
      break;
    }
    case 'circuit': {
      x.lineCap = 'round';
      x.lineJoin = 'round';
      for (let pass = 0; pass < 2; pass++) {
        x.strokeStyle = pass ? s.accent : (s.accent2 ?? s.accent);
        x.lineWidth = R * (pass ? 0.05 : 0.04);
        x.globalAlpha = pass ? 0.9 : 0.35;
        if (pass) {
          DASH_LAVA[0] = R * 0.25;
          DASH_LAVA[1] = R * 0.6;
          x.setLineDash(DASH_LAVA);
          x.lineDashOffset = -t * R * 1.6;
        }
        x.beginPath();
        for (const q of d.geo) {
          x.moveTo(q[0] * R, q[1] * R);
          x.lineTo(q[2] * R, q[3] * R);
          x.lineTo(q[4] * R, q[5] * R);
        }
        x.stroke();
      }
      x.setLineDash(DASH_NONE);
      x.globalAlpha = 1;
      x.fillStyle = s.accent;
      for (let i = 0; i < d.geo.length; i++) {
        const q = d.geo[i];
        x.globalAlpha = 0.5 + 0.5 * Math.sin(t * 4 + i);
        circ(x, q[4] * R, q[5] * R, R * 0.05);
        x.fill();
      }
      x.globalAlpha = 1;
      break;
    }
    case 'crystal': {
      x.strokeStyle = 'rgba(255,255,255,0.28)';
      x.lineWidth = R * 0.025;
      for (let i = 0; i < d.geo.length; i++) {
        const q = d.geo[i];
        const v = Math.sin(t * 1.8 + i * 1.3);
        x.fillStyle = v > 0 ? `rgba(255,255,255,${(0.08 + v * 0.3).toFixed(3)})` : al(i % 3 ? s.dark : s.accent, 0.12 - v * 0.15);
        x.beginPath();
        x.moveTo(q[0] * R, q[1] * R);
        x.lineTo(q[2] * R, q[3] * R);
        x.lineTo(q[4] * R, q[5] * R);
        x.closePath();
        x.fill();
        x.stroke();
      }
      break;
    }
    case 'lava': {
      // rocha esfriada
      x.fillStyle = 'rgba(0,0,0,0.25)';
      for (let i = 0; i < 6; i++) {
        const q = d.geo[i];
        circ(x, q[2] * R * 0.8, q[3] * R * 0.8, R * 0.22);
        x.fill();
      }
      // brilho quente pulsante embaixo
      x.globalAlpha = 0.55 + 0.2 * Math.sin(t * 3);
      x.fillStyle = rad(x, 0, R * 0.9, R * 1.0, al(s.accent, 0.9), al(s.accent, 0));
      x.fillRect(-R, -R, R * 2, R * 2);
      x.globalAlpha = 1;
      x.lineCap = 'round';
      x.lineJoin = 'round';
      const crack = () => {
        x.beginPath();
        for (const q of d.geo) {
          x.moveTo(q[0] * R, q[1] * R);
          for (let k = 2; k < q.length; k += 2) x.lineTo(q[k] * R, q[k + 1] * R);
        }
        x.stroke();
      };
      x.strokeStyle = al(s.accent, 0.35);
      x.lineWidth = R * 0.24;
      crack();
      x.strokeStyle = s.accent;
      x.lineWidth = R * 0.1;
      crack();
      DASH_LAVA[0] = R * 0.18;
      DASH_LAVA[1] = R * 0.3;
      x.setLineDash(DASH_LAVA);
      x.lineDashOffset = t * R * 0.9;
      x.strokeStyle = s.accent2 ?? '#ffd84a';
      x.lineWidth = R * 0.05;
      crack();
      x.setLineDash(DASH_NONE);
      break;
    }
    case 'ember': {
      x.globalAlpha = 0.5;
      x.fillStyle = rad(x, 0, R, R * 1.4, '#ffffff', s.accent, al(s.accent2 ?? s.dark, 0));
      x.fillRect(-R, -R, R * 2, R * 2);
      for (let i = 0; i < 12; i++) {
        const q = d.geo[i];
        const ph = (t * 0.45 + q[2]) % 1;
        const ex = q[0] * R * 0.9 + Math.sin(t * 3 + i) * R * 0.08;
        const ey = R * (1 - ph * 2);
        x.globalAlpha = Math.sin(ph * PI) * 0.9;
        x.fillStyle = i % 3 ? '#fff3a0' : '#ffffff';
        circ(x, ex, ey, R * (0.035 + q[3] * 0.04));
        x.fill();
      }
      x.globalAlpha = 1;
      break;
    }
    case 'void': {
      for (let i = 0; i < 3; i++) {
        const a = t * (0.6 + i * 0.25) + i * 2.1;
        const cx = Math.cos(a) * R * 0.5;
        const cy = Math.sin(a) * R * 0.45;
        x.fillStyle = rad(x, cx, cy, R * 0.75, al(i === 1 ? '#3d5cff' : s.accent, 0.45), al(s.accent, 0));
        x.fillRect(-R, -R, R * 2, R * 2);
      }
      for (let i = 0; i < 12; i++) {
        const q = d.geo[i];
        x.globalAlpha = 0.2 + 0.8 * Math.abs(Math.sin(t * 1.7 + i * 1.3));
        x.fillStyle = i % 3 ? '#e6c8ff' : '#ffffff';
        circ(x, q[0] * R, q[1] * R, R * (0.02 + q[3] * 0.03));
        x.fill();
      }
      x.globalAlpha = 1;
      break;
    }
    case 'gold': {
      x.globalAlpha = 0.45;
      x.fillStyle = lin(x, 0, -R, 0, R, '#fff8d0', '#d99a00', '#fff2a0', '#b07000', '#ffe680');
      x.fillRect(-R, -R, R * 2, R * 2);
      x.globalAlpha = 0.65;
      const sx = ((t * 0.7) % 2) * R * 3 - R * 2;
      x.save();
      x.rotate(0.5);
      x.fillStyle = lin(x, sx, 0, sx + R * 0.5, 0, 'rgba(255,255,255,0)', '#ffffff', 'rgba(255,255,255,0)');
      x.fillRect(sx, -R * 1.5, R * 0.5, R * 3);
      x.restore();
      x.globalAlpha = 1;
      x.fillStyle = '#ffffff';
      for (let i = 0; i < 4; i++) {
        const q = d.geo[i];
        const tw = Math.sin(t * 2.4 + i * 1.9);
        if (tw <= 0) continue;
        x.globalAlpha = tw;
        star4(x, q[0] * R, q[1] * R, R * 0.12 * tw);
      }
      x.globalAlpha = 1;
      break;
    }
  }
}

/* ============================================================
 *  ROSTO
 * ============================================================ */

const EX = 0.33;
const EY = -0.1;

function drawFace(x: CanvasRenderingContext2D, s: Skin, d: Derived, R: number, p: PlayerPose): void {
  const ex = R * EX;
  const ey = R * EY;
  const face = d.face;
  x.lineCap = 'round';
  x.lineJoin = 'round';

  // bochechas
  if (face !== 'robot' && face !== 'visor' && face !== 'glow' && face !== 'pumpkin') {
    const cheek = face === 'zombie' ? '#b46bd8' : '#ff5a8c';
    for (const sd of [-1, 1]) glowAt(x, cheek, sd * R * 0.6, R * 0.14, R * 0.24, face === 'zombie' ? 0.35 : 0.6);
  }

  switch (face) {
    case 'robot':
      faceRobot(x, s, R, p, ex, ey);
      return;
    case 'visor':
      faceVisor(x, s, R, p, ey);
      return;
    case 'glow':
      faceGlow(x, s, R, p, ex, ey);
      return;
    case 'pumpkin':
      facePumpkin(x, s, R, p, ex, ey);
      return;
    case 'coal':
      faceCoal(x, R, p, ex, ey);
      return;
    default:
      break;
  }

  // olhos
  for (const sd of [-1, 1]) {
    x.save();
    x.translate(sd * ex, ey);
    if (p.mood === 'dead') deadX(x, d.lid, R);
    else if (p.mood === 'happy') happyEye(x, d.lid, R);
    else if (face === 'patch' && sd === 1) {
      // tapa-olho
      x.fillStyle = '#1a1420';
      ell(x, 0, 0, R * 0.22, R * 0.2);
      x.fill();
      x.fillStyle = 'rgba(255,255,255,0.25)';
      ell(x, -R * 0.07, -R * 0.07, R * 0.07, R * 0.04, -0.6);
      x.fill();
    } else if (face === 'zombie') eyeCute(x, d, R, p, sd === -1 ? 1.12 : 0.82, sd === 1 ? 0.4 : 0, sd === -1 ? 0.6 : 1);
    else if (face === 'snout') eyeCute(x, d, R, p, 0.85, 0.32, 1);
    else eyeCute(x, d, R, p, 1, 0, 1);
    x.restore();
  }
  if (face === 'patch') {
    // cordão do tapa-olho
    x.strokeStyle = '#1a1420';
    x.lineWidth = R * 0.055;
    x.beginPath();
    x.moveTo(ex - R * 0.15, ey - R * 0.12);
    x.lineTo(-R * 0.55, -R * 0.75);
    x.moveTo(ex + R * 0.18, ey - R * 0.08);
    x.lineTo(R * 0.85, -R * 0.45);
    x.stroke();
  }
  if (face === 'zombie') {
    // olheiras
    x.strokeStyle = 'rgba(90,40,110,0.4)';
    x.lineWidth = R * 0.04;
    x.beginPath();
    x.arc(-ex, ey + R * 0.04, R * 0.24, 0.5, PI - 0.5);
    x.stroke();
  }

  // nariz / focinho
  if (face === 'snout') {
    x.fillStyle = rad(x, -R * 0.08, R * 0.2, R * 0.5, mix(s.light, '#ffffff', 0.25), mix(s.light, s.dark, 0.35));
    ell(x, 0, R * 0.3, R * 0.42, R * 0.27);
    x.fill();
    x.strokeStyle = al(s.dark, 0.5);
    x.lineWidth = R * 0.035;
    x.stroke();
    x.fillStyle = mix(s.dark, '#000000', 0.45);
    for (const sd of [-1, 1]) {
      ell(x, sd * R * 0.13, R * 0.22, R * 0.055, R * 0.075, sd * 0.4);
      x.fill();
    }
  } else if (face === 'mustache') {
    x.fillStyle = '#ff9a8a';
    ell(x, 0, R * 0.13, R * 0.08, R * 0.06);
    x.fill();
  }

  mouthCute(x, s, d, R, p, face);

  if (face === 'mustache') {
    x.fillStyle = '#5a3418';
    for (const sd of [-1, 1]) {
      x.beginPath();
      x.moveTo(0, R * 0.17);
      x.bezierCurveTo(sd * R * 0.12, R * 0.1, sd * R * 0.3, R * 0.16, sd * R * 0.36, R * 0.1);
      x.bezierCurveTo(sd * R * 0.42, R * 0.06, sd * R * 0.44, R * 0.16, sd * R * 0.38, R * 0.22);
      x.bezierCurveTo(sd * R * 0.28, R * 0.3, sd * R * 0.1, R * 0.27, 0, R * 0.22);
      x.closePath();
      x.fill();
    }
    x.fillStyle = 'rgba(255,255,255,0.25)';
    ell(x, -R * 0.2, R * 0.16, R * 0.07, R * 0.025, -0.2);
    x.fill();
  }
}

function eyeCute(x: CanvasRenderingContext2D, d: Derived, R: number, p: PlayerPose, sc: number, lidTop: number, pupilK: number): void {
  const open = 1 - p.blink;
  const ew = R * 0.205 * sc;
  const eh = R * 0.25 * sc;
  if (open < 0.22) {
    x.strokeStyle = d.lid;
    x.lineWidth = R * 0.075;
    x.beginPath();
    x.moveTo(-ew, 0);
    x.quadraticCurveTo(0, eh * 0.5, ew, 0);
    x.stroke();
    return;
  }
  const h = eh * (0.25 + 0.75 * open) * (p.mood === 'fly' ? 1.08 : 1);
  x.save();
  ell(x, 0, 0, ew, h);
  x.fillStyle = '#ffffff';
  x.fill();
  x.clip();
  const ix = p.lookX * R * 0.07 * sc;
  const iy = p.lookY * R * 0.075 * sc + R * 0.02 * sc;
  const ir = R * 0.148 * sc;
  const ig = x.createRadialGradient(ix, iy + ir * 0.35, ir * 0.1, ix, iy, ir);
  ig.addColorStop(0, d.irisHi);
  ig.addColorStop(0.55, d.iris);
  ig.addColorStop(1, d.irisEdge);
  x.fillStyle = ig;
  circ(x, ix, iy, ir);
  x.fill();
  x.fillStyle = d.pupil;
  circ(x, ix, iy, ir * 0.5 * pupilK);
  x.fill();
  // sombra da pálpebra
  const lg = x.createLinearGradient(0, -h, 0, -h * 0.15);
  lg.addColorStop(0, d.lidShade);
  lg.addColorStop(1, d.lidShade0);
  x.fillStyle = lg;
  x.fillRect(-ew, -h, ew * 2, h);
  if (lidTop > 0) {
    const ly = -h + h * 2 * lidTop;
    x.fillStyle = d.lidSkin;
    x.fillRect(-ew, -h, ew * 2, ly + h);
    x.strokeStyle = d.lid;
    x.lineWidth = R * 0.05;
    x.beginPath();
    x.moveTo(-ew, ly);
    x.lineTo(ew, ly);
    x.stroke();
  }
  x.restore();
  // dois brilhos
  if (lidTop < 0.45) {
    x.fillStyle = '#ffffff';
    circ(x, ix - ir * 0.38, iy - ir * 0.42 + lidTop * ir, ir * 0.36);
    x.fill();
    x.globalAlpha = 0.85;
    circ(x, ix + ir * 0.42, iy + ir * 0.38, ir * 0.17);
    x.fill();
    x.globalAlpha = 1;
  }
  x.strokeStyle = d.eyeLine;
  x.lineWidth = R * 0.035;
  ell(x, 0, 0, ew, h);
  x.stroke();
}

function happyEye(x: CanvasRenderingContext2D, col: string, R: number): void {
  x.strokeStyle = col;
  x.lineWidth = R * 0.095;
  x.beginPath();
  x.arc(0, R * 0.06, R * 0.15, PI * 1.15, PI * 1.85);
  x.stroke();
}

function deadX(x: CanvasRenderingContext2D, col: string, R: number): void {
  x.strokeStyle = col;
  x.lineWidth = R * 0.1;
  const k = R * 0.14;
  x.beginPath();
  x.moveTo(-k, -k);
  x.lineTo(k, k);
  x.moveTo(k, -k);
  x.lineTo(-k, k);
  x.stroke();
}

function mouthCute(x: CanvasRenderingContext2D, s: Skin, d: Derived, R: number, p: PlayerPose, face: Face): void {
  const snout = face === 'snout';
  const my = snout ? R * 0.42 : face === 'mustache' ? R * 0.3 : R * 0.24;
  const sc = snout ? 0.7 : face === 'mustache' ? 0.75 : 1;
  x.strokeStyle = d.lid;
  x.lineWidth = R * 0.07;
  if (p.mood === 'fly') {
    const k = 1 + Math.sin(p.t * 9) * 0.08;
    x.fillStyle = d.mouth;
    ell(x, 0, my, R * 0.1 * sc, R * 0.13 * sc * k);
    x.fill();
    x.fillStyle = '#ff7a9a';
    ell(x, 0, my + R * 0.06 * sc, R * 0.06 * sc, R * 0.045 * sc);
    x.fill();
  } else if (p.mood === 'dead') {
    x.beginPath();
    x.moveTo(-R * 0.16 * sc, my + R * 0.06);
    x.quadraticCurveTo(-R * 0.08 * sc, my - R * 0.02, 0, my + R * 0.04);
    x.quadraticCurveTo(R * 0.08 * sc, my + R * 0.1, R * 0.16 * sc, my + R * 0.02);
    x.stroke();
  } else if (p.mood === 'happy') {
    const w = R * 0.21 * sc;
    x.fillStyle = d.mouth;
    x.beginPath();
    x.moveTo(-w, my - R * 0.08);
    x.quadraticCurveTo(0, my - R * 0.03, w, my - R * 0.08);
    x.quadraticCurveTo(w * 0.9, my + R * 0.22 * sc, 0, my + R * 0.22 * sc);
    x.quadraticCurveTo(-w * 0.9, my + R * 0.22 * sc, -w, my - R * 0.08);
    x.closePath();
    x.fill();
    x.save();
    x.clip();
    x.fillStyle = '#ff6f92';
    ell(x, 0, my + R * 0.2 * sc, w * 0.7, R * 0.12 * sc);
    x.fill();
    x.fillStyle = '#ffffff';
    x.fillRect(-w * 0.6, my - R * 0.1, w * 1.2, R * 0.06);
    x.restore();
  } else {
    if (s.accessory === 'cat') {
      x.lineWidth = R * 0.06;
      x.beginPath();
      x.arc(-R * 0.08, my - R * 0.02, R * 0.08, 0.2, PI - 0.2);
      x.arc(R * 0.08, my - R * 0.02, R * 0.08, 0.2, PI - 0.2);
      x.stroke();
    } else if (face === 'zombie') {
      x.lineWidth = R * 0.05;
      x.beginPath();
      x.moveTo(-R * 0.16, my + R * 0.02);
      x.quadraticCurveTo(0, my + R * 0.08, R * 0.16, my);
      for (const k of [-0.1, 0, 0.1]) {
        x.moveTo(k * R, my - R * 0.03);
        x.lineTo(k * R, my + R * 0.1);
      }
      x.stroke();
    } else {
      x.beginPath();
      x.arc(0, my - R * 0.1 * sc, R * 0.14 * sc, 0.35, PI - 0.35);
      x.stroke();
    }
    // dentinho / presinha
    if (s.accessory === 'horns' || face === 'patch' || s.accessory === 'dragon' || face === 'snout') {
      x.fillStyle = face === 'patch' ? '#ffd84a' : '#ffffff';
      x.beginPath();
      const tx = face === 'snout' ? -R * 0.04 : R * 0.07;
      const ty = my + R * 0.03 * sc;
      if (face === 'snout') {
        x.fillRect(tx - R * 0.02, ty - R * 0.02, R * 0.08, R * 0.07);
      } else {
        x.moveTo(tx - R * 0.045, ty);
        x.lineTo(tx + R * 0.045, ty - R * 0.01);
        x.lineTo(tx, ty + R * 0.08);
        x.closePath();
        x.fill();
      }
    }
  }
}

function faceRobot(x: CanvasRenderingContext2D, s: Skin, R: number, p: PlayerPose, ex: number, ey: number): void {
  x.fillStyle = lin(x, 0, ey - R * 0.25, 0, ey + R * 0.25, '#2a3550', '#0d1220');
  x.beginPath();
  x.roundRect(-R * 0.64, ey - R * 0.26, R * 1.28, R * 0.5, R * 0.2);
  x.fill();
  x.strokeStyle = 'rgba(160,200,255,0.4)';
  x.lineWidth = R * 0.04;
  x.stroke();
  for (const sd of [-1, 1]) {
    x.save();
    x.translate(sd * ex, ey);
    if (p.mood === 'dead') deadX(x, s.eye, R * 0.9);
    else if (p.mood === 'happy') happyEye(x, s.eye, R * 0.9);
    else {
      const eh = R * 0.15 * Math.max(0.12, 1 - p.blink);
      const ox = p.lookX * R * 0.06;
      const oy = p.lookY * R * 0.04;
      glowAt(x, s.eye, ox, oy, R * 0.42, 0.9);
      x.fillStyle = s.eye;
      ell(x, ox, oy, R * 0.13, eh);
      x.fill();
      x.fillStyle = 'rgba(255,255,255,0.85)';
      ell(x, ox - R * 0.03, oy - eh * 0.35, R * 0.05, eh * 0.3);
      x.fill();
    }
    x.restore();
  }
  // boca de LEDs
  x.fillStyle = s.eye;
  const n = 5;
  for (let i = 0; i < n; i++) {
    const h = p.mood === 'happy' ? 0.06 + Math.abs(Math.sin(p.t * 10 + i)) * 0.06 : p.mood === 'fly' ? 0.08 : 0.035;
    x.globalAlpha = 0.85;
    x.fillRect((i - (n - 1) / 2) * R * 0.08 - R * 0.025, R * 0.33 - h * R, R * 0.05, h * R * 2);
  }
  x.globalAlpha = 1;
}

function faceVisor(x: CanvasRenderingContext2D, s: Skin, R: number, p: PlayerPose, ey: number): void {
  const a2 = s.accent2 ?? s.accent;
  glowAt(x, s.eye, 0, ey, R * 0.9, 0.35);
  x.fillStyle = lin(x, 0, ey - R * 0.2, 0, ey + R * 0.2, '#1e2350', '#05060f');
  x.beginPath();
  x.roundRect(-R * 0.82, ey - R * 0.21, R * 1.64, R * 0.4, R * 0.2);
  x.fill();
  x.strokeStyle = s.eye;
  x.lineWidth = R * 0.045;
  x.stroke();
  x.save();
  x.clip();
  // scanline
  const sx = (((p.t * 0.8) % 1.6) - 0.3) * R * 1.8 - R * 0.8;
  x.fillStyle = lin(x, sx, 0, sx + R * 0.3, 0, al(a2, 0), al(a2, 0.6), al(a2, 0));
  x.fillRect(sx, ey - R * 0.3, R * 0.3, R * 0.6);
  x.restore();
  const ex = R * 0.3;
  x.strokeStyle = s.eye;
  x.fillStyle = s.eye;
  for (const sd of [-1, 1]) {
    x.save();
    x.translate(sd * ex + p.lookX * R * 0.06, ey + p.lookY * R * 0.03);
    if (p.mood === 'dead') deadX(x, s.eye, R * 0.7);
    else if (p.mood === 'happy') happyEye(x, s.eye, R * 0.7);
    else {
      const h = R * 0.11 * Math.max(0.15, 1 - p.blink);
      x.beginPath();
      x.roundRect(-R * 0.13, -h / 2, R * 0.26, h, h / 2);
      x.fill();
    }
    x.restore();
  }
  // boca neon
  x.strokeStyle = a2;
  x.lineWidth = R * 0.06;
  x.beginPath();
  if (p.mood === 'fly') {
    circ(x, 0, R * 0.32, R * 0.07);
    x.stroke();
  } else if (p.mood === 'dead') {
    x.moveTo(-R * 0.14, R * 0.34);
    x.lineTo(R * 0.14, R * 0.34);
    x.stroke();
  } else {
    x.moveTo(-R * 0.14, R * 0.28);
    x.lineTo(-R * 0.05, R * 0.35);
    x.lineTo(R * 0.05, R * 0.35);
    x.lineTo(R * 0.14, R * 0.28);
    x.stroke();
  }
}

function faceGlow(x: CanvasRenderingContext2D, s: Skin, R: number, p: PlayerPose, ex: number, ey: number): void {
  for (const sd of [-1, 1]) {
    x.save();
    x.translate(sd * ex, ey);
    if (p.mood === 'dead') deadX(x, s.eye, R);
    else if (p.mood === 'happy') happyEye(x, s.eye, R);
    else {
      const ox = p.lookX * R * 0.05;
      const oy = p.lookY * R * 0.05;
      x.fillStyle = 'rgba(10,0,10,0.55)';
      ell(x, 0, 0, R * 0.25, R * 0.22, sd * -0.3);
      x.fill();
      glowAt(x, s.eye, ox, oy, R * 0.5, 0.9);
      const h = R * 0.15 * Math.max(0.12, 1 - p.blink);
      x.fillStyle = s.eye;
      ell(x, ox, oy, R * 0.17, h, sd * -0.3);
      x.fill();
      x.fillStyle = '#ffffff';
      x.globalAlpha = 0.9;
      ell(x, ox, oy, R * 0.08, h * 0.45, sd * -0.3);
      x.fill();
      x.globalAlpha = 1;
    }
    x.restore();
  }
  // sorriso brilhante em zigue-zague
  const my = R * 0.3;
  x.strokeStyle = s.eye;
  x.lineWidth = R * 0.06;
  x.beginPath();
  if (p.mood === 'fly') {
    circ(x, 0, my, R * 0.08);
  } else if (p.mood === 'dead') {
    x.moveTo(-R * 0.16, my);
    x.lineTo(R * 0.16, my);
  } else {
    const w = p.mood === 'happy' ? 0.24 : 0.18;
    x.moveTo(-w * R, my - R * 0.05);
    x.lineTo(-w * R * 0.5, my + R * 0.03);
    x.lineTo(0, my - R * 0.01);
    x.lineTo(w * R * 0.5, my + R * 0.03);
    x.lineTo(w * R, my - R * 0.05);
  }
  x.stroke();
}

function facePumpkin(x: CanvasRenderingContext2D, s: Skin, R: number, p: PlayerPose, ex: number, ey: number): void {
  const fl = 0.85 + 0.15 * Math.sin(p.t * 11) * Math.sin(p.t * 7.3);
  const inner = '#5a1a00';
  const lit = s.eye;
  const tri = (cx: number, cy: number, w: number, h: number, up: boolean) => {
    x.beginPath();
    if (up) {
      x.moveTo(cx - w, cy + h);
      x.lineTo(cx + w, cy + h);
      x.lineTo(cx, cy - h);
    } else {
      x.moveTo(cx - w, cy - h);
      x.lineTo(cx + w, cy - h);
      x.lineTo(cx, cy + h);
    }
    x.closePath();
  };
  for (const sd of [-1, 1]) {
    x.save();
    x.translate(sd * ex, ey);
    if (p.mood === 'dead') deadX(x, inner, R);
    else {
      const h = R * 0.16 * (p.mood === 'happy' ? 0.6 : Math.max(0.15, 1 - p.blink));
      const up = p.mood !== 'happy';
      const cx = p.lookX * R * 0.03;
      tri(cx, 0, R * 0.19, h, up);
      x.fillStyle = inner;
      x.fill();
      x.globalAlpha = fl;
      tri(cx, h * (up ? 0.26 : -0.26), R * 0.1, h * 0.52, up);
      x.fillStyle = lit;
      x.fill();
      tri(cx, h * (up ? 0.42 : -0.42), R * 0.055, h * 0.3, up);
      x.fillStyle = '#fffbe0';
      x.fill();
      x.globalAlpha = 1;
    }
    x.restore();
  }
  // nariz
  tri(0, R * 0.13, R * 0.07, R * 0.06, true);
  x.fillStyle = inner;
  x.fill();
  tri(0, R * 0.15, R * 0.035, R * 0.03, true);
  x.fillStyle = lit;
  x.fill();
  // boca serrilhada
  const my = R * 0.34;
  const w = p.mood === 'happy' ? R * 0.5 : R * 0.44;
  const open = p.mood === 'fly' ? R * 0.2 : p.mood === 'dead' ? R * 0.04 : R * 0.13;
  const mouth = (k: number, dy: number) => {
    x.beginPath();
    x.moveTo(-w * k, my - R * 0.06 + dy);
    x.quadraticCurveTo(0, my + R * 0.06 + dy, w * k, my - R * 0.06 + dy);
    x.quadraticCurveTo(0, my + (open * 2.4 + R * 0.12) * k + dy, -w * k, my - R * 0.06 + dy);
    x.closePath();
  };
  mouth(1, 0);
  x.fillStyle = inner;
  x.fill();
  x.globalAlpha = fl;
  mouth(0.74, R * 0.045);
  x.fillStyle = lit;
  x.fill();
  x.globalAlpha = 1;
  // dentes
  x.fillStyle = s.light;
  x.fillRect(-R * 0.2, my - R * 0.03, R * 0.1, R * 0.09);
  x.fillRect(R * 0.1, my - R * 0.03, R * 0.1, R * 0.09);
  x.fillRect(-R * 0.05, my + open * 1.1 + R * 0.02, R * 0.1, R * 0.08);
}

function faceCoal(x: CanvasRenderingContext2D, R: number, p: PlayerPose, ex: number, ey: number): void {
  for (const sd of [-1, 1]) {
    x.save();
    x.translate(sd * ex, ey);
    if (p.mood === 'dead') deadX(x, '#1a1a24', R);
    else if (p.mood === 'happy') happyEye(x, '#1a1a24', R);
    else {
      const h = R * 0.13 * Math.max(0.15, 1 - p.blink);
      x.fillStyle = rad(x, -R * 0.04, -R * 0.04, R * 0.16, '#55556a', '#1a1a24', '#0a0a10');
      ell(x, p.lookX * R * 0.04, p.lookY * R * 0.04, R * 0.12, h);
      x.fill();
      x.fillStyle = '#ffffff';
      circ(x, p.lookX * R * 0.04 - R * 0.04, p.lookY * R * 0.04 - h * 0.4, R * 0.035);
      x.fill();
    }
    x.restore();
  }
  // nariz de cenoura
  x.fillStyle = lin(x, 0, R * 0.06, R * 0.42, R * 0.16, '#ff9a2f', '#e8560a');
  x.beginPath();
  x.moveTo(-R * 0.02, R * 0.04);
  x.quadraticCurveTo(R * 0.25, R * 0.08, R * 0.42, R * 0.16);
  x.quadraticCurveTo(R * 0.2, R * 0.2, -R * 0.02, R * 0.2);
  x.closePath();
  x.fill();
  x.strokeStyle = 'rgba(160,60,0,0.6)';
  x.lineWidth = R * 0.025;
  x.beginPath();
  x.moveTo(R * 0.1, R * 0.08);
  x.lineTo(R * 0.12, R * 0.13);
  x.moveTo(R * 0.22, R * 0.11);
  x.lineTo(R * 0.24, R * 0.15);
  x.stroke();
  // boca de carvão
  x.fillStyle = '#1a1a24';
  const n = 5;
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1) - 0.5;
    let mx = k * R * 0.42;
    let my = R * 0.32 + (0.25 - k * k) * -R * 0.0 + k * k * -R * 0.3;
    if (p.mood === 'happy') my = R * 0.28 + (0.25 - k * k) * R * 0.3;
    if (p.mood === 'fly') {
      const a = (i / n) * TAU;
      mx = Math.cos(a) * R * 0.09;
      my = R * 0.34 + Math.sin(a) * R * 0.09;
    }
    if (p.mood === 'dead') my = R * 0.34;
    circ(x, mx, my, R * 0.04);
    x.fill();
  }
}

/* ============================================================
 *  ACESSÓRIOS
 * ============================================================ */

function drawAccessory(x: CanvasRenderingContext2D, s: Skin, R: number, p: PlayerPose, back: boolean): void {
  const a = s.accessory;
  if (a === 'none') return;
  const t = p.t;
  const sway = Math.sin(t * 6) * 0.15;
  x.save();
  x.lineCap = 'round';
  x.lineJoin = 'round';
  if (back) {
    switch (a) {
      case 'cat': {
        for (const sd of [-1, 1]) {
          x.fillStyle = lin(x, 0, -R * 1.25, 0, -R * 0.5, s.light, s.dark);
          x.beginPath();
          x.moveTo(sd * R * 0.78, -R * 0.42);
          x.quadraticCurveTo(sd * R * 0.75, -R * 1.0, sd * R * 0.64, -R * 1.28);
          x.quadraticCurveTo(sd * R * 0.35, -R * 1.08, sd * R * 0.1, -R * 0.86);
          x.closePath();
          x.fill();
          x.fillStyle = s.accent;
          x.beginPath();
          x.moveTo(sd * R * 0.62, -R * 0.62);
          x.lineTo(sd * R * 0.6, -R * 1.08);
          x.lineTo(sd * R * 0.32, -R * 0.84);
          x.closePath();
          x.fill();
        }
        // rabo
        const w = Math.sin(t * 3) * 0.2;
        x.strokeStyle = s.dark;
        x.lineWidth = R * 0.2;
        x.beginPath();
        x.moveTo(R * 0.6, R * 0.55);
        x.quadraticCurveTo(R * 1.35, R * (0.5 + w), R * (1.25 + w * 0.5), -R * 0.15);
        x.stroke();
        x.strokeStyle = s.light;
        x.lineWidth = R * 0.08;
        x.beginPath();
        x.moveTo(R * 1.2 + w * R * 0.5, R * 0.02);
        x.lineTo(R * (1.25 + w * 0.5), -R * 0.12);
        x.stroke();
        break;
      }
      case 'horns': {
        for (const sd of [-1, 1]) {
          x.fillStyle = lin(x, sd * R * 0.3, -R * 0.6, sd * R * 0.9, -R * 1.35, s.accent, mix(s.accent, '#ff5a7a', 0.45));
          x.beginPath();
          x.moveTo(sd * R * 0.68, -R * 0.52);
          x.quadraticCurveTo(sd * R * 1.08, -R * 1.0, sd * R * 0.78, -R * 1.38);
          x.quadraticCurveTo(sd * R * 0.66, -R * 0.95, sd * R * 0.24, -R * 0.84);
          x.closePath();
          x.fill();
          x.strokeStyle = 'rgba(255,255,255,0.35)';
          x.lineWidth = R * 0.05;
          x.beginPath();
          x.moveTo(sd * R * 0.62, -R * 0.75);
          x.quadraticCurveTo(sd * R * 0.82, -R * 1.0, sd * R * 0.78, -R * 1.25);
          x.stroke();
        }
        // rabinho pontudo
        const w = Math.sin(t * 4) * 0.15;
        x.strokeStyle = s.dark;
        x.lineWidth = R * 0.09;
        x.beginPath();
        x.moveTo(R * 0.55, R * 0.6);
        x.bezierCurveTo(R * 1.2, R * 0.9, R * 1.4, R * (0.2 + w), R * 1.2, -R * (0.05 - w));
        x.stroke();
        x.fillStyle = s.dark;
        x.save();
        x.translate(R * 1.2, -R * (0.05 - w));
        x.rotate(-0.5);
        x.beginPath();
        x.moveTo(0, -R * 0.22);
        x.lineTo(R * 0.15, R * 0.06);
        x.lineTo(0, 0);
        x.lineTo(-R * 0.15, R * 0.06);
        x.closePath();
        x.fill();
        x.restore();
        break;
      }
      case 'flame': {
        glowAt(x, '#ff7a00', 0, -R * 1.0, R * 1.3, 0.6);
        for (let i = 0; i < 3; i++) {
          const f = Math.sin(t * 14 + i * 2) * 0.1;
          x.fillStyle = i === 0 ? '#ff3d00' : i === 1 ? '#ff9800' : '#ffea00';
          const k = 1 - i * 0.25;
          x.beginPath();
          x.moveTo(-R * 0.62 * k, -R * 0.5);
          x.quadraticCurveTo(-R * 0.75 * k, -R * (1.1 + f) * k, -R * 0.35 * k, -R * (1.35 - f) * k);
          x.quadraticCurveTo(-R * 0.3 * k, -R * (1.6 + f) * k, 0, -R * (1.95 + f) * k);
          x.quadraticCurveTo(R * 0.25 * k, -R * (1.5 - f) * k, R * 0.4 * k, -R * (1.45 + f) * k);
          x.quadraticCurveTo(R * 0.75 * k, -R * (1.05 - f) * k, R * 0.62 * k, -R * 0.5);
          x.closePath();
          x.fill();
        }
        break;
      }
      case 'halo': {
        wings(x, R, t, '#ffffff', '#c9d6ff', 0.75, 2.2);
        break;
      }
      case 'bee': {
        const fl = Math.abs(Math.sin(t * 28));
        for (const sd of [-1, 1]) {
          x.save();
          x.translate(sd * R * 0.55, -R * 0.65);
          x.rotate(sd * (0.6 + fl * 0.25));
          x.fillStyle = 'rgba(220,245,255,0.75)';
          ell(x, 0, -R * 0.38, R * 0.24, R * 0.42);
          x.fill();
          x.strokeStyle = 'rgba(120,170,220,0.8)';
          x.lineWidth = R * 0.035;
          x.stroke();
          x.strokeStyle = 'rgba(255,255,255,0.8)';
          x.beginPath();
          x.moveTo(0, -R * 0.05);
          x.lineTo(sd * R * 0.04, -R * 0.55);
          x.stroke();
          x.restore();
        }
        break;
      }
      case 'astro': {
        for (const sd of [-1, 1]) {
          x.fillStyle = lin(x, sd * R * 0.8, 0, sd * R * 1.2, 0, '#e8edf7', '#8f9ab5');
          x.beginPath();
          x.roundRect(sd * R * 1.0 - R * 0.17, -R * 0.45, R * 0.34, R * 0.9, R * 0.12);
          x.fill();
          x.fillStyle = s.accent;
          x.fillRect(sd * R * 1.0 - R * 0.17, -R * 0.05, R * 0.34, R * 0.08);
        }
        break;
      }
      case 'unicorn': {
        // crina pastel
        const cols = ['#ff9bd8', '#c79bff', '#9bd8ff', '#9bffd0', '#fff09b'];
        for (let i = 0; i < 6; i++) {
          const a = -PI * 0.62 + i * 0.32;
          const w = Math.sin(t * 3 + i) * 0.04;
          x.fillStyle = cols[i % cols.length];
          circ(x, Math.cos(a) * R * (1.0 + w), Math.sin(a) * R * (1.0 + w), R * (0.3 - i * 0.02));
          x.fill();
        }
        break;
      }
      case 'samurai': {
        // shikoro (protetor de nuca)
        for (let i = 0; i < 3; i++) {
          x.strokeStyle = i % 2 ? (s.accent2 ?? '#c4122f') : '#2a2d45';
          x.lineWidth = R * 0.16;
          x.beginPath();
          x.arc(0, -R * 0.15, R * (1.05 + i * 0.13), PI * 1.08 - i * 0.05, PI * 1.92 + i * 0.05);
          x.stroke();
        }
        break;
      }
      case 'dragon': {
        // asas de morcego
        const f = Math.sin(t * 5) * 0.25;
        for (const sd of [-1, 1]) {
          x.save();
          x.translate(sd * R * 0.6, -R * 0.35);
          x.scale(sd, 1);
          x.rotate(-0.25 - f);
          x.fillStyle = lin(x, 0, 0, R * 1.2, -R * 0.4, s.accent, mix(s.accent, '#ff4a2a', 0.4));
          x.beginPath();
          x.moveTo(0, 0);
          x.lineTo(R * 0.55, -R * 0.75);
          x.lineTo(R * 1.25, -R * 0.55);
          x.quadraticCurveTo(R * 1.05, -R * 0.3, R * 1.12, -R * 0.05);
          x.quadraticCurveTo(R * 0.85, -R * 0.1, R * 0.8, R * 0.2);
          x.quadraticCurveTo(R * 0.55, R * 0.05, R * 0.4, R * 0.35);
          x.quadraticCurveTo(R * 0.25, R * 0.15, 0, R * 0.25);
          x.closePath();
          x.fill();
          x.strokeStyle = s.accent2 ?? s.dark;
          x.lineWidth = R * 0.08;
          x.beginPath();
          x.moveTo(0, 0);
          x.lineTo(R * 0.55, -R * 0.75);
          x.lineTo(R * 1.25, -R * 0.55);
          x.moveTo(R * 0.55, -R * 0.75);
          x.lineTo(R * 1.12, -R * 0.05);
          x.moveTo(R * 0.55, -R * 0.75);
          x.lineTo(R * 0.8, R * 0.2);
          x.moveTo(R * 0.55, -R * 0.75);
          x.lineTo(R * 0.4, R * 0.35);
          x.stroke();
          x.restore();
        }
        // cauda
        const w = Math.sin(t * 3) * 0.12;
        x.strokeStyle = s.dark;
        x.lineWidth = R * 0.22;
        x.beginPath();
        x.moveTo(R * 0.3, R * 0.7);
        x.quadraticCurveTo(R * 1.2, R * 1.05, R * 1.35, R * (0.45 + w));
        x.stroke();
        x.fillStyle = s.accent;
        x.save();
        x.translate(R * 1.35, R * (0.45 + w));
        x.rotate(-0.4);
        x.beginPath();
        x.moveTo(0, -R * 0.28);
        x.lineTo(R * 0.18, R * 0.04);
        x.lineTo(0, R * 0.08);
        x.lineTo(-R * 0.18, R * 0.04);
        x.closePath();
        x.fill();
        x.restore();
        break;
      }
      case 'phoenix': {
        glowAt(x, '#ff8a00', 0, -R * 0.2, R * 2.0, 0.45);
        const f = Math.sin(t * 4) * 0.2;
        for (const sd of [-1, 1]) {
          x.save();
          x.translate(sd * R * 0.55, -R * 0.2);
          x.scale(sd, 1);
          x.rotate(-0.2 - f);
          for (let i = 0; i < 5; i++) {
            const a = -0.9 + i * 0.32;
            const len = R * (1.35 - i * 0.12);
            x.fillStyle = i % 2 ? s.accent2 ?? '#ff3d00' : s.accent;
            x.save();
            x.rotate(a);
            x.beginPath();
            x.moveTo(0, -R * 0.12);
            x.quadraticCurveTo(len * 0.6, -R * 0.3, len, 0);
            x.quadraticCurveTo(len * 0.6, R * 0.2, 0, R * 0.12);
            x.closePath();
            x.fill();
            x.restore();
          }
          x.fillStyle = 'rgba(255,240,160,0.8)';
          x.beginPath();
          x.moveTo(0, -R * 0.08);
          x.quadraticCurveTo(R * 0.5, -R * 0.35, R * 0.95, -R * 0.55);
          x.quadraticCurveTo(R * 0.45, -R * 0.1, 0, R * 0.08);
          x.fill();
          x.restore();
        }
        // penas da cauda
        for (let i = -1; i <= 1; i++) {
          const w = Math.sin(t * 3 + i) * 0.1;
          x.fillStyle = i ? s.accent : (s.accent2 ?? '#ff3d00');
          x.save();
          x.translate(i * R * 0.25, R * 0.75);
          x.rotate(i * 0.4 + w);
          x.beginPath();
          x.moveTo(-R * 0.1, 0);
          x.quadraticCurveTo(-R * 0.15, R * 0.6, 0, R * 0.85);
          x.quadraticCurveTo(R * 0.15, R * 0.6, R * 0.1, 0);
          x.fill();
          x.restore();
        }
        break;
      }
      case 'wisps': {
        x.lineWidth = R * 0.16;
        for (let i = 0; i < 4; i++) {
          const a = t * 0.8 + (i / 4) * TAU;
          const r1 = R * 1.05;
          x.strokeStyle = i % 2 ? 'rgba(60,20,110,0.7)' : 'rgba(20,8,40,0.8)';
          x.beginPath();
          x.moveTo(Math.cos(a) * R * 0.7, Math.sin(a) * R * 0.7);
          x.quadraticCurveTo(Math.cos(a + 0.5) * r1 * 1.3, Math.sin(a + 0.5) * r1 * 1.3, Math.cos(a + 1.1) * r1 * 1.15, Math.sin(a + 1.1) * r1 * 1.15);
          x.stroke();
        }
        orbiters(x, s, R, t, true);
        break;
      }
      case 'crystals':
      case 'rocks':
        orbiters(x, s, R, t, true);
        break;
      case 'laurel': {
        // capa de campeão
        const w = Math.sin(t * 3) * 0.08;
        x.fillStyle = lin(x, -R, 0, R, R, '#ff3b5c', '#a30d2c');
        x.beginPath();
        x.moveTo(-R * 0.7, -R * 0.2);
        x.quadraticCurveTo(-R * 1.25, R * 0.6, -R * (1.2 + w), R * 1.15);
        x.quadraticCurveTo(0, R * (1.3 + w), R * (1.2 - w), R * 1.15);
        x.quadraticCurveTo(R * 1.25, R * 0.6, R * 0.7, -R * 0.2);
        x.closePath();
        x.fill();
        x.strokeStyle = '#ffd84a';
        x.lineWidth = R * 0.06;
        x.stroke();
        break;
      }
      case 'capy': {
        for (const sd of [-1, 1]) {
          x.fillStyle = s.dark;
          ell(x, sd * R * 0.62, -R * 0.78, R * 0.17, R * 0.14, sd * 0.5);
          x.fill();
          x.fillStyle = mix(s.dark, '#000000', 0.3);
          ell(x, sd * R * 0.62, -R * 0.76, R * 0.08, R * 0.07, sd * 0.5);
          x.fill();
        }
        break;
      }
      case 'cyber': {
        // barbatana de dados (atrás)
        for (let i = 0; i < 4; i++) {
          const h = R * (0.35 + 0.08 * Math.sin(t * 6 + i));
          x.fillStyle = i % 2 ? (s.accent2 ?? s.accent) : s.accent;
          x.globalAlpha = 0.9;
          x.save();
          x.translate(-R * 0.3 + i * R * 0.2, -R * 0.9 + Math.abs(i - 1.5) * R * 0.06);
          x.rotate(0.35);
          x.beginPath();
          x.roundRect(-R * 0.05, -h, R * 0.1, h, R * 0.05);
          x.fill();
          x.restore();
        }
        x.globalAlpha = 1;
        break;
      }
    }
    x.restore();
    return;
  }

  switch (a) {
    case 'antenna': {
      const tx = R * sway * 2;
      x.strokeStyle = s.dark;
      x.lineWidth = R * 0.09;
      x.beginPath();
      x.moveTo(0, -R * 0.95);
      x.quadraticCurveTo(R * sway, -R * 1.3, tx, -R * 1.5);
      x.stroke();
      glowAt(x, s.accent, tx, -R * 1.5, R * 0.62);
      x.fillStyle = rad(x, tx - R * 0.06, -R * 1.56, R * 0.22, '#ffffff', s.accent, mix(s.accent, s.dark, 0.35));
      circ(x, tx, -R * 1.5, R * 0.19);
      x.fill();
      x.fillStyle = '#ffffff';
      circ(x, tx - R * 0.06, -R * 1.56, R * 0.05);
      x.fill();
      break;
    }
    case 'leaf': {
      x.translate(0, -R * 0.95);
      x.rotate(sway);
      x.strokeStyle = '#2b7a3a';
      x.lineWidth = R * 0.08;
      x.beginPath();
      x.moveTo(0, 0);
      x.quadraticCurveTo(-R * 0.05, -R * 0.15, 0, -R * 0.28);
      x.stroke();
      for (const [lx2, ly2, rot, sc] of [[0.27, -0.38, -0.5, 1], [-0.18, -0.3, 0.6 + PI, 0.6]] as const) {
        x.save();
        x.translate(lx2 * R, ly2 * R);
        x.rotate(rot);
        x.scale(sc, sc);
        x.fillStyle = lin(x, 0, -R * 0.15, 0, R * 0.15, mix(s.accent, '#ffffff', 0.3), mix(s.accent, '#0a5a20', 0.35));
        x.beginPath();
        x.moveTo(-R * 0.34, 0);
        x.quadraticCurveTo(0, -R * 0.24, R * 0.34, 0);
        x.quadraticCurveTo(0, R * 0.24, -R * 0.34, 0);
        x.fill();
        x.strokeStyle = 'rgba(20,90,40,0.6)';
        x.lineWidth = R * 0.03;
        x.beginPath();
        x.moveTo(-R * 0.3, 0);
        x.lineTo(R * 0.3, 0);
        x.stroke();
        x.restore();
      }
      break;
    }
    case 'bow': {
      x.translate(R * 0.45, -R * 0.8);
      x.rotate(0.4 + sway * 0.2);
      for (const sd of [-1, 1]) {
        x.fillStyle = lin(x, 0, -R * 0.25, 0, R * 0.25, mix(s.accent, '#ffffff', 0.25), mix(s.accent, '#a0003a', 0.3));
        x.beginPath();
        x.moveTo(0, 0);
        x.quadraticCurveTo(sd * R * 0.2, -R * 0.32, sd * R * 0.44, -R * 0.22);
        x.quadraticCurveTo(sd * R * 0.5, 0, sd * R * 0.44, R * 0.22);
        x.quadraticCurveTo(sd * R * 0.2, R * 0.32, 0, 0);
        x.fill();
        x.fillStyle = 'rgba(255,255,255,0.75)';
        circ(x, sd * R * 0.3, -R * 0.06, R * 0.045);
        x.fill();
        circ(x, sd * R * 0.22, R * 0.12, R * 0.035);
        x.fill();
        x.strokeStyle = 'rgba(120,0,40,0.35)';
        x.lineWidth = R * 0.03;
        x.beginPath();
        x.moveTo(sd * R * 0.08, 0);
        x.lineTo(sd * R * 0.36, -R * 0.1);
        x.moveTo(sd * R * 0.08, 0);
        x.lineTo(sd * R * 0.36, R * 0.1);
        x.stroke();
      }
      x.fillStyle = mix(s.accent, '#ffffff', 0.2);
      ell(x, 0, 0, R * 0.1, R * 0.12);
      x.fill();
      break;
    }
    case 'helmet': {
      x.fillStyle = rad(x, 0, -R * 0.05, R * 1.22, 'rgba(190,240,255,0.04)', 'rgba(190,240,255,0.1)', 'rgba(190,240,255,0.35)');
      circ(x, 0, -R * 0.05, R * 1.22);
      x.fill();
      x.strokeStyle = 'rgba(220,250,255,0.85)';
      x.lineWidth = R * 0.07;
      x.stroke();
      // bolhinhas
      for (let i = 0; i < 2; i++) {
        const ph = (t * 0.5 + i * 0.5) % 1;
        x.strokeStyle = `rgba(255,255,255,${(0.7 * (1 - ph)).toFixed(3)})`;
        x.lineWidth = R * 0.03;
        circ(x, R * (0.7 - i * 0.15), R * (0.6 - ph * 1.4), R * (0.06 + i * 0.03));
        x.stroke();
      }
      // colar de latão
      x.strokeStyle = lin(x, -R, 0, R, 0, '#ffd27a', '#b77a1a', '#ffd27a');
      x.lineWidth = R * 0.16;
      x.beginPath();
      x.arc(0, -R * 0.05, R * 1.2, PI * 0.3, PI * 0.7);
      x.stroke();
      x.strokeStyle = 'rgba(255,255,255,0.85)';
      x.lineWidth = R * 0.1;
      x.beginPath();
      x.arc(0, -R * 0.05, R * 1.02, -2.7, -2.0);
      x.stroke();
      x.lineWidth = R * 0.06;
      x.beginPath();
      x.arc(0, -R * 0.05, R * 1.02, -1.8, -1.6);
      x.stroke();
      break;
    }
    case 'crown': {
      x.translate(0, -R * 0.84);
      x.rotate(-0.08);
      glowAt(x, '#ffd400', 0, -R * 0.3, R * 0.8, 0.4);
      x.fillStyle = lin(x, 0, -R * 0.6, 0, 0, '#fff6a0', '#ffd400', '#d99000');
      x.strokeStyle = '#a86a00';
      x.lineWidth = R * 0.05;
      x.beginPath();
      x.moveTo(-R * 0.52, 0);
      x.lineTo(-R * 0.58, -R * 0.5);
      x.lineTo(-R * 0.28, -R * 0.26);
      x.lineTo(0, -R * 0.62);
      x.lineTo(R * 0.28, -R * 0.26);
      x.lineTo(R * 0.58, -R * 0.5);
      x.lineTo(R * 0.52, 0);
      x.closePath();
      x.fill();
      x.stroke();
      x.fillStyle = '#ffe680';
      for (const [cx, cy] of [[-0.58, -0.5], [0, -0.62], [0.58, -0.5]]) {
        circ(x, cx * R, cy * R, R * 0.07);
        x.fill();
      }
      x.fillStyle = 'rgba(160,90,0,0.45)';
      x.fillRect(-R * 0.52, -R * 0.12, R * 1.04, R * 0.1);
      x.fillStyle = s.accent;
      ell(x, 0, -R * 0.2, R * 0.09, R * 0.11);
      x.fill();
      x.fillStyle = '#3fd9ff';
      for (const sd of [-1, 1]) {
        circ(x, sd * R * 0.3, -R * 0.12, R * 0.055);
        x.fill();
      }
      x.fillStyle = 'rgba(255,255,255,0.8)';
      circ(x, -R * 0.03, -R * 0.24, R * 0.03);
      x.fill();
      break;
    }
    case 'halo': {
      x.translate(0, -R * 1.32 + Math.sin(t * 3) * R * 0.06);
      glowAt(x, s.accent, 0, 0, R * 0.9, 0.9);
      x.strokeStyle = mix(s.accent, '#ff9a00', 0.3);
      x.lineWidth = R * 0.16;
      ell(x, 0, 0, R * 0.55, R * 0.16);
      x.stroke();
      x.strokeStyle = '#fffbe0';
      x.lineWidth = R * 0.06;
      ell(x, 0, -R * 0.02, R * 0.52, R * 0.13);
      x.stroke();
      break;
    }
    case 'headband': {
      x.save();
      circ(x, 0, 0, R);
      x.clip();
      x.fillStyle = lin(x, 0, -R * 0.6, 0, -R * 0.36, mix(s.accent, '#ffffff', 0.25), s.accent, mix(s.accent, '#600010', 0.35));
      x.beginPath();
      x.moveTo(-R, -R * 0.52);
      x.quadraticCurveTo(0, -R * 0.66, R, -R * 0.52);
      x.lineTo(R, -R * 0.3);
      x.quadraticCurveTo(0, -R * 0.44, -R, -R * 0.3);
      x.closePath();
      x.fill();
      // placa metálica
      x.fillStyle = lin(x, 0, -R * 0.6, 0, -R * 0.38, '#e8eef8', '#8f9ab5');
      x.beginPath();
      x.roundRect(-R * 0.22, -R * 0.6, R * 0.44, R * 0.2, R * 0.05);
      x.fill();
      x.strokeStyle = '#5a647a';
      x.lineWidth = R * 0.03;
      x.beginPath();
      x.arc(0, -R * 0.5, R * 0.05, 0, TAU);
      x.stroke();
      x.restore();
      x.fillStyle = mix(s.accent, '#600010', 0.15);
      for (let i = 0; i < 2; i++) {
        const sw = sway * (1 + i * 0.6);
        x.beginPath();
        x.moveTo(R * 0.88, -R * 0.42);
        x.quadraticCurveTo(R * 1.3, -R * (0.5 - sw - i * 0.1), R * (1.6 - i * 0.12), -R * (0.18 - sw - i * 0.25));
        x.lineTo(R * (1.42 - i * 0.12), -R * (0.1 - sw - i * 0.25));
        x.quadraticCurveTo(R * 1.15, -R * (0.32 - i * 0.1), R * 0.88, -R * 0.3);
        x.closePath();
        x.fill();
      }
      x.fillStyle = s.accent;
      circ(x, R * 0.9, -R * 0.37, R * 0.1);
      x.fill();
      break;
    }
    case 'robot': {
      x.strokeStyle = '#8fa3bf';
      x.lineWidth = R * 0.08;
      x.beginPath();
      x.moveTo(0, -R * 0.95);
      x.lineTo(0, -R * 1.35);
      x.stroke();
      const on = Math.sin(t * 6) > 0;
      const lc = on ? '#ff3b5c' : '#00e5ff';
      glowAt(x, lc, 0, -R * 1.4, R * 0.45);
      x.fillStyle = lc;
      circ(x, 0, -R * 1.4, R * 0.13);
      x.fill();
      for (const sd of [-1, 1]) {
        x.fillStyle = lin(x, sd * R * 0.98, 0, sd * R * 1.2, 0, '#c9d6e8', '#6d7f99');
        x.beginPath();
        x.roundRect(sd * R * 1.08 - R * 0.11, -R * 0.28, R * 0.22, R * 0.5, R * 0.07);
        x.fill();
        x.fillStyle = '#4a5670';
        circ(x, sd * R * 1.08, -R * 0.03, R * 0.045);
        x.fill();
      }
      break;
    }
    case 'bee': {
      for (const sd of [-1, 1]) {
        const w = Math.sin(t * 5 + sd) * 0.06;
        x.strokeStyle = s.accent;
        x.lineWidth = R * 0.06;
        x.beginPath();
        x.moveTo(sd * R * 0.22, -R * 0.92);
        x.quadraticCurveTo(sd * R * 0.3, -R * 1.3, sd * R * (0.48 + w), -R * 1.42);
        x.stroke();
        x.fillStyle = s.accent;
        circ(x, sd * R * (0.48 + w), -R * 1.42, R * 0.11);
        x.fill();
        x.fillStyle = 'rgba(255,255,255,0.5)';
        circ(x, sd * R * (0.48 + w) - R * 0.03, -R * 1.45, R * 0.035);
        x.fill();
      }
      break;
    }
    case 'chef': {
      // touca
      x.fillStyle = lin(x, 0, -R * 1.0, 0, -R * 0.7, '#ffffff', '#e4e4ee');
      x.beginPath();
      x.moveTo(-R * 0.55, -R * 0.75);
      x.quadraticCurveTo(0, -R * 0.92, R * 0.55, -R * 0.75);
      x.lineTo(R * 0.52, -R * 1.08);
      x.lineTo(-R * 0.52, -R * 1.08);
      x.closePath();
      x.fill();
      x.strokeStyle = 'rgba(160,160,190,0.6)';
      x.lineWidth = R * 0.035;
      x.stroke();
      for (const [cx, cy, r] of [[-0.42, -1.28, 0.3], [0.42, -1.28, 0.3], [0, -1.45, 0.38]]) {
        x.fillStyle = rad(x, cx * R - R * 0.08, cy * R - R * 0.1, r * R * 1.2, '#ffffff', '#ffffff', '#dcdcea');
        circ(x, cx * R, cy * R, r * R);
        x.fill();
        x.stroke();
      }
      x.fillStyle = '#ffffff';
      x.fillRect(-R * 0.5, -R * 1.14, R * 1.0, R * 0.14);
      x.strokeStyle = 'rgba(160,160,190,0.5)';
      x.beginPath();
      for (const k of [-0.2, 0.15]) {
        x.moveTo(k * R, -R * 0.82);
        x.lineTo(k * R + R * 0.03, -R * 1.05);
      }
      x.stroke();
      // lencinho
      x.fillStyle = s.accent;
      x.beginPath();
      x.moveTo(-R * 0.35, R * 0.62);
      x.quadraticCurveTo(0, R * 0.75, R * 0.35, R * 0.62);
      x.lineTo(R * 0.08, R * 0.98);
      x.lineTo(-R * 0.08, R * 0.98);
      x.closePath();
      x.fill();
      x.fillStyle = 'rgba(255,255,255,0.7)';
      for (const [cx, cy] of [[-0.15, 0.72], [0.12, 0.74], [0, 0.88]]) {
        circ(x, cx * R, cy * R, R * 0.035);
        x.fill();
      }
      break;
    }
    case 'astro': {
      x.fillStyle = rad(x, -R * 0.3, -R * 0.4, R * 1.3, 'rgba(200,230,255,0.06)', 'rgba(170,210,255,0.14)', 'rgba(140,190,255,0.38)');
      circ(x, 0, -R * 0.08, R * 1.24);
      x.fill();
      x.strokeStyle = 'rgba(230,245,255,0.9)';
      x.lineWidth = R * 0.06;
      x.stroke();
      // reflexo
      x.strokeStyle = 'rgba(255,255,255,0.85)';
      x.lineWidth = R * 0.12;
      x.beginPath();
      x.arc(0, -R * 0.08, R * 1.04, -2.75, -2.15);
      x.stroke();
      x.fillStyle = 'rgba(255,255,255,0.6)';
      circ(x, R * 0.62, -R * 0.82, R * 0.07);
      x.fill();
      // colar
      x.fillStyle = lin(x, 0, R * 0.75, 0, R * 1.15, '#ffffff', '#aeb8cf');
      x.beginPath();
      x.ellipse(0, R * 1.0, R * 0.95, R * 0.22, 0, 0, TAU);
      x.fill();
      x.strokeStyle = '#8a95b0';
      x.lineWidth = R * 0.04;
      x.stroke();
      x.fillStyle = s.accent;
      x.fillRect(-R * 0.55, R * 0.94, R * 0.25, R * 0.1);
      x.fillStyle = '#3fd9ff';
      x.fillRect(R * 0.3, R * 0.94, R * 0.25, R * 0.1);
      // antena
      x.strokeStyle = '#c9d2e6';
      x.lineWidth = R * 0.05;
      x.beginPath();
      x.moveTo(R * 0.7, -R * 1.05);
      x.lineTo(R * 0.85, -R * 1.45);
      x.stroke();
      const on = Math.sin(t * 4) > 0.2;
      if (on) glowAt(x, s.accent, R * 0.85, -R * 1.47, R * 0.35);
      x.fillStyle = on ? s.accent : mix(s.accent, '#000000', 0.4);
      circ(x, R * 0.85, -R * 1.47, R * 0.08);
      x.fill();
      break;
    }
    case 'pirate': {
      const hc = s.accent2 ?? '#2a1e2e';
      x.translate(0, -R * 0.7);
      x.rotate(-0.06);
      // chapéu tricorne
      x.fillStyle = lin(x, 0, -R * 0.7, 0, R * 0.1, mix(hc, '#ffffff', 0.15), hc);
      x.beginPath();
      x.moveTo(-R * 1.15, -R * 0.05);
      x.quadraticCurveTo(-R * 0.9, -R * 0.75, -R * 0.35, -R * 0.65);
      x.quadraticCurveTo(0, -R * 0.95, R * 0.35, -R * 0.65);
      x.quadraticCurveTo(R * 0.9, -R * 0.75, R * 1.15, -R * 0.05);
      x.quadraticCurveTo(R * 0.6, -R * 0.25, 0, -R * 0.08);
      x.quadraticCurveTo(-R * 0.6, -R * 0.25, -R * 1.15, -R * 0.05);
      x.closePath();
      x.fill();
      x.strokeStyle = '#ffd84a';
      x.lineWidth = R * 0.06;
      x.beginPath();
      x.moveTo(-R * 1.15, -R * 0.05);
      x.quadraticCurveTo(-R * 0.6, -R * 0.25, 0, -R * 0.08);
      x.quadraticCurveTo(R * 0.6, -R * 0.25, R * 1.15, -R * 0.05);
      x.stroke();
      // emblema
      x.fillStyle = '#ffffff';
      ell(x, 0, -R * 0.45, R * 0.13, R * 0.12);
      x.fill();
      x.fillRect(-R * 0.07, -R * 0.38, R * 0.14, R * 0.07);
      x.fillStyle = hc;
      circ(x, -R * 0.05, -R * 0.46, R * 0.03);
      x.fill();
      circ(x, R * 0.05, -R * 0.46, R * 0.03);
      x.fill();
      x.strokeStyle = '#ffffff';
      x.lineWidth = R * 0.045;
      x.beginPath();
      x.moveTo(-R * 0.22, -R * 0.24);
      x.lineTo(R * 0.22, -R * 0.36);
      x.moveTo(R * 0.22, -R * 0.24);
      x.lineTo(-R * 0.22, -R * 0.36);
      x.stroke();
      // pena
      x.fillStyle = s.accent;
      x.save();
      x.translate(R * 0.55, -R * 0.62);
      x.rotate(0.7 + sway * 0.4);
      ell(x, 0, -R * 0.3, R * 0.09, R * 0.32);
      x.fill();
      x.restore();
      break;
    }
    case 'headphones': {
      const beat = Math.max(0, Math.sin(t * 8));
      const hc = s.accent2 ?? '#2a2f45';
      x.strokeStyle = hc;
      x.lineWidth = R * 0.16;
      x.beginPath();
      x.arc(0, -R * 0.08, R * 1.02, PI * 1.08, PI * 1.92);
      x.stroke();
      x.strokeStyle = 'rgba(255,255,255,0.25)';
      x.lineWidth = R * 0.05;
      x.beginPath();
      x.arc(0, -R * 0.12, R * 1.02, PI * 1.25, PI * 1.6);
      x.stroke();
      for (const sd of [-1, 1]) {
        const cx = sd * R * 0.98;
        const cy = -R * 0.12;
        glowAt(x, s.accent, cx, cy, R * (0.45 + beat * 0.15), 0.5 + beat * 0.4);
        x.fillStyle = lin(x, cx - R * 0.2, cy - R * 0.3, cx + R * 0.2, cy + R * 0.3, mix(hc, '#ffffff', 0.3), hc);
        x.beginPath();
        x.roundRect(cx - R * 0.2, cy - R * 0.32, R * 0.4, R * 0.64, R * 0.18);
        x.fill();
        x.strokeStyle = s.accent;
        x.lineWidth = R * 0.06;
        ell(x, cx + sd * R * 0.04, cy, R * 0.1, R * 0.2);
        x.stroke();
      }
      break;
    }
    case 'zombie': {
      // atadura
      x.save();
      circ(x, 0, 0, R);
      x.clip();
      x.translate(0, -R * 0.6);
      x.rotate(0.35);
      x.fillStyle = s.accent;
      x.fillRect(-R * 1.2, -R * 0.12, R * 2.4, R * 0.24);
      x.strokeStyle = 'rgba(160,140,110,0.6)';
      x.lineWidth = R * 0.025;
      x.beginPath();
      for (let i = -5; i <= 5; i++) {
        x.moveTo(i * R * 0.2, -R * 0.12);
        x.lineTo(i * R * 0.2 + R * 0.08, R * 0.12);
      }
      x.stroke();
      x.restore();
      // tufinho de cabelo
      x.strokeStyle = mix(s.dark, '#000000', 0.3);
      x.lineWidth = R * 0.06;
      x.beginPath();
      for (const k of [-0.15, 0, 0.15]) {
        x.moveTo(k * R - R * 0.2, -R * 0.96);
        x.quadraticCurveTo(k * R - R * 0.2 + sway * R * 0.4, -R * 1.25, k * R - R * 0.05, -R * 1.3);
      }
      x.stroke();
      // band-aid
      x.save();
      x.translate(R * 0.62, R * 0.32);
      x.rotate(-0.6);
      x.fillStyle = '#ffd0a6';
      x.beginPath();
      x.roundRect(-R * 0.17, -R * 0.065, R * 0.34, R * 0.13, R * 0.06);
      x.fill();
      x.fillStyle = '#f0b080';
      x.fillRect(-R * 0.06, -R * 0.065, R * 0.12, R * 0.13);
      x.restore();
      break;
    }
    case 'capy': {
      // tangerina na cabeça
      const by = -R * 1.17 + Math.sin(t * 2.6) * R * 0.03;
      x.fillStyle = rad(x, -R * 0.1, by - R * 0.1, R * 0.35, '#ffd08a', s.accent, mix(s.accent, '#a04000', 0.4));
      ell(x, 0, by, R * 0.3, R * 0.26);
      x.fill();
      x.fillStyle = 'rgba(160,70,0,0.35)';
      for (const [cx, cy] of [[0.12, 0.06], [-0.1, 0.1], [0.02, -0.04]]) {
        circ(x, cx * R, by + cy * R, R * 0.025);
        x.fill();
      }
      x.fillStyle = '#3f9f3a';
      x.save();
      x.translate(R * 0.04, by - R * 0.24);
      x.rotate(-0.5 + sway * 0.4);
      ell(x, R * 0.14, 0, R * 0.16, R * 0.07);
      x.fill();
      x.restore();
      x.fillStyle = '#6a4a1a';
      x.fillRect(-R * 0.02, by - R * 0.3, R * 0.05, R * 0.08);
      break;
    }
    case 'soccer': {
      // faixa verde-amarela
      x.save();
      circ(x, 0, 0, R);
      x.clip();
      x.fillStyle = s.accent;
      x.beginPath();
      x.moveTo(-R, -R * 0.5);
      x.quadraticCurveTo(0, -R * 0.68, R, -R * 0.5);
      x.lineTo(R, -R * 0.3);
      x.quadraticCurveTo(0, -R * 0.48, -R, -R * 0.3);
      x.closePath();
      x.fill();
      x.strokeStyle = '#ffdf1f';
      x.lineWidth = R * 0.05;
      x.beginPath();
      x.moveTo(-R, -R * 0.4);
      x.quadraticCurveTo(0, -R * 0.58, R, -R * 0.4);
      x.stroke();
      x.restore();
      // bola quicando (embaixadinha)
      const ph = Math.abs(Math.sin(t * 3.4));
      const by = -R * (1.38 + ph * 0.5);
      const br = R * 0.32;
      x.fillStyle = 'rgba(0,0,0,0.18)';
      ell(x, 0, -R * 0.98, br * (0.9 - ph * 0.3), br * 0.18);
      x.fill();
      x.save();
      x.translate(0, by);
      x.rotate(t * 3);
      x.fillStyle = rad(x, -br * 0.3, -br * 0.3, br * 1.3, '#ffffff', '#ffffff', '#c9cfdc');
      circ(x, 0, 0, br);
      x.fill();
      x.strokeStyle = '#2a2a38';
      x.lineWidth = R * 0.04;
      x.stroke();
      x.fillStyle = '#2a2a38';
      x.beginPath();
      for (let i = 0; i < 5; i++) {
        const aa = -PI / 2 + (i / 5) * TAU;
        x.lineTo(Math.cos(aa) * br * 0.38, Math.sin(aa) * br * 0.38);
      }
      x.closePath();
      x.fill();
      x.beginPath();
      for (let i = 0; i < 5; i++) {
        const aa = -PI / 2 + (i / 5) * TAU;
        x.moveTo(Math.cos(aa) * br * 0.38, Math.sin(aa) * br * 0.38);
        x.lineTo(Math.cos(aa) * br, Math.sin(aa) * br);
      }
      x.stroke();
      x.restore();
      break;
    }
    case 'wizard': {
      const hc = s.accent2 ?? '#2b1a7a';
      const tipX = R * (0.55 + sway * 0.5);
      // aba
      x.fillStyle = lin(x, 0, -R * 0.95, 0, -R * 0.6, mix(hc, '#ffffff', 0.2), hc);
      ell(x, 0, -R * 0.74, R * 1.05, R * 0.2);
      x.fill();
      // cone
      x.fillStyle = lin(x, -R * 0.6, 0, R * 0.6, 0, mix(hc, '#ffffff', 0.25), hc, mix(hc, '#000000', 0.3));
      x.beginPath();
      x.moveTo(-R * 0.6, -R * 0.78);
      x.quadraticCurveTo(-R * 0.3, -R * 1.5, tipX, -R * 2.0);
      x.quadraticCurveTo(R * 0.05, -R * 1.55, R * 0.6, -R * 0.78);
      x.quadraticCurveTo(0, -R * 0.9, -R * 0.6, -R * 0.78);
      x.closePath();
      x.fill();
      // faixa
      x.strokeStyle = s.accent;
      x.lineWidth = R * 0.12;
      x.beginPath();
      x.moveTo(-R * 0.55, -R * 0.9);
      x.quadraticCurveTo(0, -R * 1.02, R * 0.52, -R * 0.9);
      x.stroke();
      // estrelas e lua
      x.fillStyle = s.accent;
      star5(x, -R * 0.12, -R * 1.3, R * 0.13, 0.2);
      star5(x, R * 0.25, -R * 1.62, R * 0.08);
      x.beginPath();
      x.arc(R * 0.22, -R * 1.18, R * 0.11, 0, TAU);
      x.arc(R * 0.27, -R * 1.21, R * 0.09, 0, TAU, true);
      x.fill('evenodd');
      const tw = Math.sin(t * 4);
      if (tw > 0) {
        glowAt(x, s.accent, tipX, -R * 2.0, R * 0.35 * tw);
        x.fillStyle = '#ffffff';
        star4(x, tipX, -R * 2.0, R * 0.14 * tw);
      }
      break;
    }
    case 'unicorn': {
      // chifre espiral
      x.save();
      x.translate(0, -R * 0.82);
      x.rotate(0.12);
      x.fillStyle = lin(x, -R * 0.15, 0, R * 0.15, 0, '#fff6c0', s.accent, '#e0a000');
      x.beginPath();
      x.moveTo(-R * 0.17, 0);
      x.lineTo(0, -R * 0.92);
      x.lineTo(R * 0.17, 0);
      x.quadraticCurveTo(0, R * 0.06, -R * 0.17, 0);
      x.closePath();
      x.fill();
      x.strokeStyle = 'rgba(180,110,0,0.6)';
      x.lineWidth = R * 0.035;
      x.beginPath();
      for (let i = 0; i < 4; i++) {
        const y = -R * (0.12 + i * 0.2);
        const w = R * 0.17 * (1 - (0.12 + i * 0.2) / 0.92);
        x.moveTo(-w, y + R * 0.04);
        x.lineTo(w, y - R * 0.06);
      }
      x.stroke();
      const tw = Math.sin(t * 3.5);
      if (tw > 0) {
        glowAt(x, '#ff9bf0', 0, -R * 0.95, R * 0.4 * tw);
        x.fillStyle = '#ffffff';
        star4(x, R * 0.05, -R * 0.95, R * 0.16 * tw);
      }
      x.restore();
      // orelhinhas
      for (const sd of [-1, 1]) {
        x.fillStyle = s.light;
        x.beginPath();
        x.moveTo(sd * R * 0.42, -R * 0.82);
        x.lineTo(sd * R * 0.62, -R * 1.18);
        x.lineTo(sd * R * 0.75, -R * 0.62);
        x.closePath();
        x.fill();
        x.fillStyle = '#ffb3e6';
        x.beginPath();
        x.moveTo(sd * R * 0.52, -R * 0.8);
        x.lineTo(sd * R * 0.62, -R * 1.04);
        x.lineTo(sd * R * 0.68, -R * 0.72);
        x.closePath();
        x.fill();
      }
      // franjinha
      const cols = ['#ff9bd8', '#c79bff', '#9bd8ff'];
      for (let i = 0; i < 3; i++) {
        x.fillStyle = cols[i];
        circ(x, -R * (0.25 + i * 0.17), -R * (0.82 - i * 0.1), R * 0.15);
        x.fill();
      }
      break;
    }
    case 'samurai': {
      const hc = '#2a2d45';
      // capacete
      x.fillStyle = lin(x, -R * 0.4, -R, R * 0.4, -R * 0.4, '#5a607f', hc, '#14162a');
      x.beginPath();
      x.arc(0, -R * 0.1, R * 1.03, PI * 1.1, PI * 1.9);
      x.quadraticCurveTo(0, -R * 0.62, -R * 0.98, -R * 0.42);
      x.closePath();
      x.fill();
      // aba frontal + abas laterais (fukigaeshi)
      x.fillStyle = s.accent2 ?? '#c4122f';
      x.beginPath();
      x.moveTo(-R * 1.0, -R * 0.45);
      x.quadraticCurveTo(0, -R * 0.68, R * 1.0, -R * 0.45);
      x.lineTo(R * 1.02, -R * 0.36);
      x.quadraticCurveTo(0, -R * 0.56, -R * 1.02, -R * 0.36);
      x.closePath();
      x.fill();
      for (const sd of [-1, 1]) {
        x.fillStyle = hc;
        x.beginPath();
        x.moveTo(sd * R * 0.88, -R * 0.62);
        x.quadraticCurveTo(sd * R * 1.32, -R * 0.7, sd * R * 1.35, -R * 0.35);
        x.quadraticCurveTo(sd * R * 1.15, -R * 0.38, sd * R * 0.98, -R * 0.36);
        x.closePath();
        x.fill();
        x.strokeStyle = s.accent;
        x.lineWidth = R * 0.04;
        x.stroke();
      }
      // cordões
      x.strokeStyle = 'rgba(255,255,255,0.18)';
      x.lineWidth = R * 0.04;
      x.beginPath();
      x.arc(0, -R * 0.1, R * 0.85, PI * 1.25, PI * 1.5);
      x.stroke();
      // crista dourada (lua crescente)
      x.fillStyle = lin(x, -R * 0.6, -R * 1.5, R * 0.6, -R * 1.0, '#fff2a0', s.accent, '#c08000');
      x.beginPath();
      x.moveTo(0, -R * 0.82);
      x.quadraticCurveTo(-R * 0.55, -R * 1.0, -R * 0.75, -R * 1.62);
      x.quadraticCurveTo(-R * 0.3, -R * 1.18, 0, -R * 1.08);
      x.quadraticCurveTo(R * 0.3, -R * 1.18, R * 0.75, -R * 1.62);
      x.quadraticCurveTo(R * 0.55, -R * 1.0, 0, -R * 0.82);
      x.closePath();
      x.fill();
      x.fillStyle = s.accent2 ?? '#c4122f';
      circ(x, 0, -R * 0.9, R * 0.09);
      x.fill();
      break;
    }
    case 'stem': {
      x.fillStyle = lin(x, -R * 0.1, 0, R * 0.12, 0, '#8fbf4a', '#4f7a1f');
      x.beginPath();
      x.moveTo(-R * 0.12, -R * 0.9);
      x.quadraticCurveTo(-R * 0.1, -R * 1.2, R * 0.1, -R * 1.38);
      x.lineTo(R * 0.22, -R * 1.28);
      x.quadraticCurveTo(R * 0.08, -R * 1.15, R * 0.12, -R * 0.9);
      x.closePath();
      x.fill();
      // gavinha
      x.strokeStyle = s.accent;
      x.lineWidth = R * 0.045;
      x.beginPath();
      x.moveTo(R * 0.05, -R * 1.05);
      x.bezierCurveTo(R * 0.4, -R * 1.0, R * 0.55, -R * 1.3, R * 0.4, -R * 1.35);
      x.bezierCurveTo(R * 0.28, -R * 1.38, R * 0.3, -R * 1.2, R * 0.42, -R * 1.22);
      x.stroke();
      x.save();
      x.translate(-R * 0.15, -R * 1.02);
      x.rotate(-0.5 + sway * 0.5);
      x.fillStyle = lin(x, -R * 0.4, 0, 0, 0, '#5fbf3a', s.accent);
      x.beginPath();
      x.moveTo(0, 0);
      x.quadraticCurveTo(-R * 0.2, -R * 0.22, -R * 0.45, -R * 0.08);
      x.quadraticCurveTo(-R * 0.25, R * 0.12, 0, 0);
      x.fill();
      x.restore();
      break;
    }
    case 'snowhat': {
      const hc = s.accent2 ?? '#2a2a38';
      // cachecol
      x.fillStyle = s.accent;
      x.beginPath();
      x.moveTo(-R * 0.9, R * 0.4);
      x.quadraticCurveTo(0, R * 0.68, R * 0.9, R * 0.4);
      x.lineTo(R * 0.85, R * 0.62);
      x.quadraticCurveTo(0, R * 0.9, -R * 0.85, R * 0.62);
      x.closePath();
      x.fill();
      const w = Math.sin(t * 3) * 0.06;
      x.beginPath();
      x.moveTo(R * 0.45, R * 0.62);
      x.lineTo(R * (0.72 + w), R * 1.12);
      x.lineTo(R * (0.95 + w), R * 1.0);
      x.lineTo(R * 0.72, R * 0.55);
      x.closePath();
      x.fill();
      x.strokeStyle = 'rgba(255,255,255,0.85)';
      x.lineWidth = R * 0.05;
      x.beginPath();
      for (const k of [-0.5, -0.15, 0.2]) {
        x.moveTo(k * R, R * 0.52 + Math.abs(k) * -R * 0.1);
        x.lineTo(k * R + R * 0.06, R * 0.75 + Math.abs(k) * -R * 0.1);
      }
      x.moveTo(R * (0.6 + w * 0.5), R * 0.85);
      x.lineTo(R * (0.84 + w * 0.5), R * 0.76);
      x.stroke();
      // cartola
      x.save();
      x.translate(R * 0.1, -R * 0.82);
      x.rotate(0.15);
      x.fillStyle = lin(x, 0, -R * 0.1, 0, R * 0.12, mix(hc, '#ffffff', 0.2), hc);
      ell(x, 0, 0, R * 0.7, R * 0.15);
      x.fill();
      x.fillStyle = lin(x, -R * 0.45, 0, R * 0.45, 0, mix(hc, '#ffffff', 0.25), hc, mix(hc, '#000000', 0.4));
      x.fillRect(-R * 0.45, -R * 0.75, R * 0.9, R * 0.75);
      ell(x, 0, -R * 0.75, R * 0.45, R * 0.1);
      x.fill();
      x.fillStyle = s.accent;
      x.fillRect(-R * 0.45, -R * 0.24, R * 0.9, R * 0.17);
      // azevinho
      x.fillStyle = '#2f9f4a';
      ell(x, R * 0.22, -R * 0.2, R * 0.15, R * 0.07, -0.5);
      x.fill();
      ell(x, R * 0.42, -R * 0.22, R * 0.15, R * 0.07, 0.4);
      x.fill();
      x.fillStyle = '#ff2a3f';
      for (const [cx, cy] of [[0.3, -0.12], [0.38, -0.08], [0.33, -0.02]]) {
        circ(x, cx * R, cy * R, R * 0.05);
        x.fill();
      }
      x.fillStyle = 'rgba(255,255,255,0.18)';
      x.fillRect(-R * 0.35, -R * 0.72, R * 0.1, R * 0.45);
      x.restore();
      break;
    }
    case 'cloud': {
      const by = -R * 1.42 + Math.sin(t * 2) * R * 0.06;
      // mini arco-íris
      const cols = ['#ff4f6b', '#ffb03a', '#ffe53a', '#4fe37a', '#3ac8ff', '#9b6bff'];
      x.lineWidth = R * 0.07;
      for (let i = 0; i < cols.length; i++) {
        x.strokeStyle = cols[i];
        x.beginPath();
        x.arc(0, by + R * 0.1, R * (0.62 - i * 0.065), PI * 1.05, PI * 1.95);
        x.stroke();
      }
      // nuvem
      x.fillStyle = rad(x, -R * 0.1, by - R * 0.15, R * 0.7, '#ffffff', '#ffffff', '#dfe6ff');
      for (const [cx, cy, r] of [[-0.42, 0.08, 0.22], [-0.15, -0.06, 0.3], [0.2, -0.02, 0.27], [0.45, 0.1, 0.2], [0, 0.14, 0.25]]) {
        circ(x, cx * R, by + cy * R, r * R);
        x.fill();
      }
      break;
    }
    case 'dragon': {
      for (const sd of [-1, 1]) {
        x.fillStyle = lin(x, 0, -R * 1.3, 0, -R * 0.7, '#fffbe0', '#e8d090');
        x.beginPath();
        x.moveTo(sd * R * 0.32, -R * 0.88);
        x.quadraticCurveTo(sd * R * 0.48, -R * 1.2, sd * R * 0.62, -R * 1.32);
        x.quadraticCurveTo(sd * R * 0.62, -R * 1.0, sd * R * 0.6, -R * 0.75);
        x.closePath();
        x.fill();
      }
      x.fillStyle = s.accent;
      for (const [cx, cy, h] of [[0, -0.98, 0.26], [-0.18, -0.95, 0.18], [0.18, -0.95, 0.18]]) {
        x.beginPath();
        x.moveTo(cx * R - R * 0.09, cy * R + R * 0.06);
        x.lineTo(cx * R, (cy - h) * R);
        x.lineTo(cx * R + R * 0.09, cy * R + R * 0.06);
        x.closePath();
        x.fill();
      }
      // narinas
      x.fillStyle = al(s.accent2 ?? s.dark, 0.6);
      for (const sd of [-1, 1]) {
        circ(x, sd * R * 0.07, R * 0.12, R * 0.025);
        x.fill();
      }
      break;
    }
    case 'cyber': {
      for (const sd of [-1, 1]) {
        x.fillStyle = lin(x, sd * R * 0.9, 0, sd * R * 1.2, 0, '#3a3f6b', '#141632');
        x.beginPath();
        x.moveTo(sd * R * 0.88, -R * 0.35);
        x.lineTo(sd * R * 1.18, -R * 0.55);
        x.lineTo(sd * R * 1.2, R * 0.1);
        x.lineTo(sd * R * 0.9, R * 0.15);
        x.closePath();
        x.fill();
        x.strokeStyle = sd < 0 ? s.accent : (s.accent2 ?? s.accent);
        x.lineWidth = R * 0.05;
        x.stroke();
        const on = Math.sin(t * 5 + sd) > 0;
        if (on) glowAt(x, s.accent, sd * R * 1.06, -R * 0.12, R * 0.25);
        x.fillStyle = on ? s.accent : '#2a2f55';
        circ(x, sd * R * 1.06, -R * 0.12, R * 0.05);
        x.fill();
      }
      break;
    }
    case 'crystals': {
      const shard = (cx: number, cy: number, h: number, w: number, rot: number) => {
        x.save();
        x.translate(cx, cy);
        x.rotate(rot);
        x.fillStyle = lin(x, -w, 0, w, 0, '#ffffff', mix(s.accent, '#ffffff', 0.3), s.accent, mix(s.dark, s.accent, 0.4));
        x.beginPath();
        x.moveTo(-w, 0);
        x.lineTo(-w * 0.9, -h * 0.7);
        x.lineTo(0, -h);
        x.lineTo(w * 0.9, -h * 0.7);
        x.lineTo(w, 0);
        x.closePath();
        x.fill();
        x.fillStyle = 'rgba(255,255,255,0.55)';
        x.beginPath();
        x.moveTo(-w * 0.9, -h * 0.7);
        x.lineTo(0, -h);
        x.lineTo(-w * 0.1, -h * 0.65);
        x.closePath();
        x.fill();
        x.strokeStyle = 'rgba(255,255,255,0.6)';
        x.lineWidth = R * 0.025;
        x.beginPath();
        x.moveTo(-w * 0.1, -h * 0.65);
        x.lineTo(0, 0);
        x.stroke();
        x.restore();
      };
      shard(-R * 0.32, -R * 0.82, R * 0.45, R * 0.13, -0.45);
      shard(R * 0.34, -R * 0.82, R * 0.5, R * 0.14, 0.4);
      shard(0, -R * 0.9, R * 0.75, R * 0.17, 0.05);
      const tw = Math.sin(t * 3);
      if (tw > 0.2) {
        x.fillStyle = '#ffffff';
        star4(x, R * 0.05, -R * 1.62, R * 0.18 * tw);
      }
      orbiters(x, s, R, t, false);
      break;
    }
    case 'rocks': {
      x.fillStyle = lin(x, 0, -R * 1.25, 0, -R * 0.7, '#7a5a50', s.dark);
      for (const [cx, cy, r, rot] of [[-0.4, -0.86, 0.24, 0.3], [0.38, -0.88, 0.26, -0.4], [0, -1.02, 0.3, 0.1]]) {
        x.save();
        x.translate(cx * R, cy * R);
        x.rotate(rot);
        x.beginPath();
        x.moveTo(-r * R, r * R * 0.3);
        x.lineTo(-r * R * 0.7, -r * R * 0.7);
        x.lineTo(r * R * 0.3, -r * R);
        x.lineTo(r * R, -r * R * 0.2);
        x.lineTo(r * R * 0.6, r * R * 0.5);
        x.closePath();
        x.fill();
        x.strokeStyle = s.accent;
        x.globalAlpha = 0.6 + 0.4 * Math.sin(t * 3 + cx * 5);
        x.lineWidth = R * 0.04;
        x.stroke();
        x.globalAlpha = 1;
        x.restore();
      }
      orbiters(x, s, R, t, false);
      break;
    }
    case 'phoenix': {
      glowAt(x, '#ffb300', 0, -R * 1.1, R * 0.8, 0.6);
      for (let i = -1; i <= 1; i++) {
        const f = Math.sin(t * 8 + i * 1.7) * 0.08;
        x.save();
        x.translate(i * R * 0.18, -R * 0.88);
        x.rotate(i * 0.4 + f);
        x.fillStyle = lin(x, 0, 0, 0, -R * 0.75, s.accent2 ?? '#ff3d00', s.accent, '#fff3a0');
        x.beginPath();
        x.moveTo(-R * 0.1, 0);
        x.quadraticCurveTo(-R * 0.18, -R * 0.45, 0, -R * (i ? 0.62 : 0.8));
        x.quadraticCurveTo(R * 0.12, -R * 0.4, R * 0.1, 0);
        x.closePath();
        x.fill();
        x.restore();
      }
      break;
    }
    case 'wisps': {
      for (const sd of [-1, 1]) {
        x.fillStyle = s.dark;
        x.beginPath();
        x.moveTo(sd * R * 0.35, -R * 0.88);
        x.quadraticCurveTo(sd * R * 0.62, -R * 1.15, sd * R * 0.72, -R * 1.32);
        x.quadraticCurveTo(sd * R * 0.8, -R * 1.0, sd * R * 0.75, -R * 0.62);
        x.closePath();
        x.fill();
        x.strokeStyle = s.accent;
        x.globalAlpha = 0.8;
        x.lineWidth = R * 0.04;
        x.stroke();
        x.globalAlpha = 1;
      }
      orbiters(x, s, R, t, false);
      break;
    }
    case 'laurel': {
      x.save();
      x.translate(0, -R * 0.05);
      for (const sd of [-1, 1]) {
        for (let i = 0; i < 6; i++) {
          const a = PI * 1.5 + sd * (0.35 + i * 0.2);
          const r = R * 0.98;
          const cx = Math.cos(a) * r;
          const cy = Math.sin(a) * r;
          x.save();
          x.translate(cx, cy);
          x.rotate(a + (sd > 0 ? PI * 0.5 + 0.6 : -PI * 0.5 - 0.6));
          x.fillStyle = lin(x, 0, -R * 0.1, 0, R * 0.1, '#fff2a0', '#e0a800', '#a87000');
          ell(x, 0, 0, R * 0.17, R * 0.08);
          x.fill();
          x.restore();
        }
      }
      x.restore();
      // medalha
      const my = -R * 1.12;
      glowAt(x, '#ffd84a', 0, my, R * 0.5, 0.7);
      x.fillStyle = lin(x, 0, my - R * 0.2, 0, my + R * 0.2, '#fff6b0', '#ffc400', '#c08000');
      circ(x, 0, my, R * 0.2);
      x.fill();
      x.strokeStyle = '#a06a00';
      x.lineWidth = R * 0.035;
      x.stroke();
      x.fillStyle = '#ffffff';
      star5(x, 0, my + R * 0.01, R * 0.12, Math.sin(t * 2) * 0.2);
      break;
    }
  }
  x.restore();
}

/** asas emplumadas (anjo) */
function wings(x: CanvasRenderingContext2D, R: number, t: number, c1: string, c2: string, alpha: number, speed: number): void {
  const f = Math.sin(t * speed * 2) * 0.18;
  x.globalAlpha = alpha + 0.25;
  for (const sd of [-1, 1]) {
    x.save();
    x.translate(sd * R * 0.7, -R * 0.15);
    x.scale(sd, 1);
    x.rotate(-0.2 - f);
    for (let i = 0; i < 3; i++) {
      x.fillStyle = i === 0 ? c2 : c1;
      x.beginPath();
      x.moveTo(0, -R * 0.12);
      x.quadraticCurveTo(R * (0.7 - i * 0.12), -R * (0.65 - i * 0.12), R * (0.95 - i * 0.18), -R * (0.15 - i * 0.18));
      x.quadraticCurveTo(R * (0.5 - i * 0.1), R * 0.05, 0, R * 0.18);
      x.closePath();
      x.fill();
    }
    x.restore();
  }
  x.globalAlpha = 1;
}

/** pedrinhas/cristais/faíscas orbitando (metade atrás, metade na frente) */
function orbiters(x: CanvasRenderingContext2D, s: Skin, R: number, t: number, back: boolean): void {
  const n = s.accessory === 'rocks' ? 3 : s.accessory === 'wisps' ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const a = t * 1.6 + (i / n) * TAU;
    const z = Math.sin(a);
    if ((z < 0) !== back) continue;
    const ox = Math.cos(a) * R * 1.4;
    const oy = -R * 0.1 + z * R * 0.35;
    const k = 0.8 + z * 0.2;
    if (s.accessory === 'crystals') {
      glowAt(x, s.accent, ox, oy, R * 0.4 * k, 0.6);
      x.fillStyle = lin(x, ox - R * 0.1, oy, ox + R * 0.1, oy, '#ffffff', s.accent);
      x.beginPath();
      x.moveTo(ox, oy - R * 0.22 * k);
      x.lineTo(ox + R * 0.12 * k, oy);
      x.lineTo(ox, oy + R * 0.22 * k);
      x.lineTo(ox - R * 0.12 * k, oy);
      x.closePath();
      x.fill();
    } else if (s.accessory === 'rocks') {
      glowAt(x, s.accent, ox, oy, R * 0.32 * k, 0.7);
      x.fillStyle = '#4a302a';
      x.save();
      x.translate(ox, oy);
      x.rotate(a * 2);
      x.beginPath();
      x.moveTo(-R * 0.13 * k, -R * 0.06 * k);
      x.lineTo(R * 0.02, -R * 0.14 * k);
      x.lineTo(R * 0.14 * k, R * 0.02);
      x.lineTo(-R * 0.02, R * 0.13 * k);
      x.closePath();
      x.fill();
      x.strokeStyle = s.accent;
      x.lineWidth = R * 0.04;
      x.stroke();
      x.restore();
    } else {
      glowAt(x, s.accent, ox, oy, R * 0.4 * k, 0.9);
      x.fillStyle = '#ffffff';
      circ(x, ox, oy, R * 0.06 * k);
      x.fill();
    }
  }
}
