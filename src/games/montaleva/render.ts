/* ============================================================
 *  MONTA & LEVA — desenho (Canvas 2D). Estilo: geométrico, chapado, contorno nítido, sombra sutil.
 *  Coordenadas do mundo em metros (y para cima). As peças são desenhadas em "unidades de célula".
 * ============================================================ */
import type { CargoDef } from './levels';
import { PARTS, U, triVerts, type PartId, type Placed } from './parts';
import type { Pt, Track, TrackObj } from './track';

export interface View {
  /** px por metro */
  s: number;
  /** tela = (ox + x*s, oy - y*s) */
  ox: number;
  oy: number;
  w: number;
  h: number;
}

export const INK = '#26303d';
export const COL = {
  bg: '#f3f5f8',
  dot: '#dfe4ec',
  far: '#eef1f5',
  ground: '#dde3eb',
  groundTop: '#8f9bad',
  groundIn: '#cfd6e0',
  zone: '#2fbf8f',
  grid: '#c9d3e0',
  gridBg: 'rgba(91,141,239,0.06)',
  ok: '#2fbf8f',
  bad: '#ef5d60',
  shadow: 'rgba(25,35,55,0.12)',
};

export type Palette = Partial<Record<PartId, [string, string]>>;
export const PALETTES: Record<string, Palette> = {
  classic: {},
  pastel: {
    block: ['#8fb3f5', '#4f73c0'],
    beam: ['#b7a3f5', '#7258c8'],
    tri: ['#f7c98a', '#c88e3c'],
    motor: ['#f59a9c', '#c2575b'],
    spring: ['#8fdcc6', '#3e9c80'],
    basket: ['#f9dc8c', '#c9a03a'],
  },
  graphite: {
    block: ['#4a5568', '#232a35'],
    beam: ['#5f6b80', '#2c3442'],
    tri: ['#718096', '#3a4352'],
    motor: ['#e8505b', '#a2262f'],
    spring: ['#38b2ac', '#1d7470'],
    basket: ['#ecc94b', '#a7851c'],
  },
  citrus: {
    block: ['#4cc38a', '#22875a'],
    beam: ['#25a5b8', '#126f7e'],
    tri: ['#ffcf3d', '#c99a0a'],
    motor: ['#ff6b3d', '#c23e14'],
    spring: ['#b4d84a', '#7a9a18'],
    basket: ['#ffe066', '#c7a316'],
  },
};
let pal: Palette = {};
export function setPalette(id: string): void {
  pal = PALETTES[id] ?? {};
}
export function colorOf(t: PartId): [string, string] {
  return pal[t] ?? [PARTS[t].color, PARTS[t].dark];
}

export const wx = (v: View, x: number) => v.ox + x * v.s;
export const wy = (v: View, y: number) => v.oy - y * v.s;

/* ------------------------------ fundo ------------------------------ */
export function drawBackground(x: CanvasRenderingContext2D, v: View, time: number, far = true): void {
  x.fillStyle = COL.bg;
  x.fillRect(0, 0, v.w, v.h);
  if (far) drawFar(x, v);
  drawDots(x, v);
  void time;
}

function drawFar(x: CanvasRenderingContext2D, v: View): void {
  // formas grandes e claras ao longe (paralaxe lenta)
  const par = 0.25;
  const camX = (v.w / 2 - v.ox) / v.s;
  x.fillStyle = COL.far;
  const step = 9;
  const base = Math.floor((camX * par) / step) - 2;
  for (let i = base; i < base + 8; i++) {
    const h = 2.5 + ((i * 7919) % 5) * 0.6;
    const px = i * step;
    const sx = v.w / 2 + (px - camX * par) * v.s * 0.6;
    const sw = (3 + ((i * 31) % 3)) * v.s * 0.6;
    const sy = v.h * 0.72;
    const hh = h * v.s * 0.6;
    x.beginPath();
    x.roundRect(sx, sy - hh, sw, hh + v.h, sw * 0.18);
    x.fill();
  }
}

function drawDots(x: CanvasRenderingContext2D, v: View): void {
  // grade de pontos do mundo
  const ds = v.s >= 40 ? 1 : 2;
  const x0 = Math.floor(-v.ox / v.s / ds) * ds;
  const x1 = (v.w - v.ox) / v.s;
  const y0 = Math.floor((v.oy - v.h) / v.s / ds) * ds;
  const y1 = v.oy / v.s;
  x.fillStyle = COL.dot;
  const r = Math.max(1, v.s * 0.03);
  for (let gx = x0; gx <= x1; gx += ds)
    for (let gy = y0; gy <= y1; gy += ds) {
      x.fillRect(wx(v, gx) - r / 2, wy(v, gy) - r / 2, r, r);
    }
}

/* ------------------------------ pista ------------------------------ */
export function drawTrack(x: CanvasRenderingContext2D, v: View, tr: Track): void {
  const bottom = v.h + 40;
  for (const line of tr.lines) drawGround(x, v, line, bottom);
  // parede do começo
  if (tr.lines[0]) {
    const p0 = tr.lines[0][0];
    x.fillStyle = COL.ground;
    x.fillRect(wx(v, p0.x) - 2 * v.s, wy(v, p0.y), 2 * v.s, bottom - wy(v, p0.y));
    x.strokeStyle = COL.groundTop;
    x.lineWidth = Math.max(2, v.s * 0.05);
    x.beginPath();
    x.moveTo(wx(v, p0.x) - 2 * v.s, wy(v, p0.y));
    x.lineTo(wx(v, p0.x), wy(v, p0.y));
    x.lineTo(wx(v, p0.x), wy(v, 0));
    x.stroke();
  }
  // parede final
  const wl = tr.wall;
  x.fillStyle = COL.ground;
  x.strokeStyle = COL.groundTop;
  x.lineWidth = Math.max(2, v.s * 0.05);
  x.beginPath();
  x.rect(wx(v, wl.x), wy(v, wl.y1), 0.5 * v.s, bottom - wy(v, wl.y1));
  x.fill();
  x.beginPath();
  x.moveTo(wx(v, wl.x), wy(v, wl.y0));
  x.lineTo(wx(v, wl.x), wy(v, wl.y1));
  x.lineTo(wx(v, wl.x + 0.5), wy(v, wl.y1));
  x.stroke();
}

function drawGround(x: CanvasRenderingContext2D, v: View, line: Pt[], bottom: number): void {
  if (line.length < 2) return;
  x.beginPath();
  x.moveTo(wx(v, line[0].x), bottom);
  for (const p of line) x.lineTo(wx(v, p.x), wy(v, p.y));
  x.lineTo(wx(v, line[line.length - 1].x), bottom);
  x.closePath();
  x.fillStyle = COL.ground;
  x.fill();
  // faixa interna mais escura (dá volume sem textura)
  x.save();
  x.clip();
  x.beginPath();
  for (let i = 0; i < line.length; i++) {
    const p = line[i];
    const X = wx(v, p.x);
    const Y = wy(v, p.y) + v.s * 0.22;
    if (i === 0) x.moveTo(X, Y);
    else x.lineTo(X, Y);
  }
  x.lineWidth = v.s * 0.18;
  x.strokeStyle = COL.groundIn;
  x.stroke();
  x.restore();
  x.beginPath();
  for (let i = 0; i < line.length; i++) {
    const p = line[i];
    if (i === 0) x.moveTo(wx(v, p.x), wy(v, p.y));
    else x.lineTo(wx(v, p.x), wy(v, p.y));
  }
  x.lineJoin = 'round';
  x.lineWidth = Math.max(2, v.s * 0.05);
  x.strokeStyle = COL.groundTop;
  x.stroke();
}

export function drawZone(x: CanvasRenderingContext2D, v: View, tr: Track, time: number, label: string, done: boolean): void {
  const z = tr.zone;
  const X0 = wx(v, z.x0);
  const X1 = wx(v, z.x1);
  const Y = wy(v, z.y);
  const H = 2.6 * v.s;
  const g = x.createLinearGradient(0, Y - H, 0, Y);
  g.addColorStop(0, 'rgba(47,191,143,0)');
  g.addColorStop(1, done ? 'rgba(47,191,143,0.30)' : 'rgba(47,191,143,0.16)');
  x.fillStyle = g;
  x.fillRect(X0, Y - H, X1 - X0, H);
  // faixas no chão
  x.save();
  x.beginPath();
  x.rect(X0, Y - v.s * 0.12, X1 - X0, v.s * 0.12);
  x.clip();
  x.fillStyle = COL.zone;
  x.fillRect(X0, Y - v.s * 0.12, X1 - X0, v.s * 0.12);
  x.fillStyle = 'rgba(255,255,255,0.55)';
  const sw = v.s * 0.35;
  const off = (time * v.s * 0.4) % (sw * 2);
  for (let sx = X0 - sw * 2 + off; sx < X1; sx += sw * 2) {
    x.beginPath();
    x.moveTo(sx, Y);
    x.lineTo(sx + sw, Y - v.s * 0.12);
    x.lineTo(sx + sw * 1.6, Y - v.s * 0.12);
    x.lineTo(sx + sw * 0.6, Y);
    x.fill();
  }
  x.restore();
  // bandeira
  const fx = X0 + v.s * 0.2;
  x.strokeStyle = INK;
  x.lineWidth = Math.max(2, v.s * 0.05);
  x.beginPath();
  x.moveTo(fx, Y);
  x.lineTo(fx, Y - v.s * 2.1);
  x.stroke();
  const wave = Math.sin(time * 4) * v.s * 0.06;
  x.fillStyle = COL.zone;
  x.beginPath();
  x.moveTo(fx, Y - v.s * 2.1);
  x.lineTo(fx + v.s * 0.85, Y - v.s * 1.9 + wave);
  x.lineTo(fx, Y - v.s * 1.65);
  x.closePath();
  x.fill();
  x.stroke();
  if (v.s > 18) {
    x.font = `700 ${Math.round(Math.max(10, v.s * 0.24))}px Fredoka, system-ui, sans-serif`;
    x.textAlign = 'left';
    x.textBaseline = 'alphabetic';
    x.fillStyle = 'rgba(31,143,106,0.9)';
    x.fillText(label, fx + v.s * 0.16, Y - v.s * 0.3);
  }
}

/* ------------------------------ objetos ------------------------------ */
export interface ObjPose {
  o: TrackObj;
  bodies: { x: number; y: number; a: number }[];
}

export function drawObj(x: CanvasRenderingContext2D, v: View, op: ObjPose, time: number): void {
  const o = op.o;
  const lw = Math.max(2, v.s * 0.045);
  x.lineWidth = lw;
  x.strokeStyle = INK;
  x.lineJoin = 'round';
  const body = (i: number, fn: () => void) => {
    const b = op.bodies[i];
    if (!b) return;
    x.save();
    x.translate(wx(v, b.x), wy(v, b.y));
    x.rotate(-b.a);
    fn();
    x.restore();
  };
  switch (o.k) {
    case 'seesaw': {
      x.fillStyle = '#b9c3d1';
      x.beginPath();
      x.moveTo(wx(v, o.x - 0.45), wy(v, o.y));
      x.lineTo(wx(v, o.x + 0.45), wy(v, o.y));
      x.lineTo(wx(v, o.x), wy(v, o.y + 0.62));
      x.closePath();
      x.fill();
      x.stroke();
      body(0, () => {
        const L = o.len * v.s;
        x.fillStyle = '#f2a541';
        x.beginPath();
        x.roundRect(-L / 2, -0.09 * v.s, L, 0.18 * v.s, 0.05 * v.s);
        x.fill();
        x.stroke();
        x.fillStyle = '#fff';
        x.beginPath();
        x.arc(0, 0, 0.07 * v.s, 0, Math.PI * 2);
        x.fill();
        x.stroke();
      });
      break;
    }
    case 'lift': {
      // trilhos
      x.strokeStyle = '#b9c3d1';
      x.lineWidth = Math.max(2, v.s * 0.06);
      for (const sx of [o.x - o.w / 2 + 0.2, o.x + o.w / 2 - 0.2]) {
        x.beginPath();
        x.moveTo(wx(v, sx), wy(v, o.y0 - 3));
        x.lineTo(wx(v, sx), wy(v, o.y1 + 0.4));
        x.stroke();
      }
      x.strokeStyle = INK;
      x.lineWidth = lw;
      body(0, () => {
        const W = o.w * v.s;
        const H = 0.3 * v.s;
        x.save();
        x.beginPath();
        x.roundRect(-W / 2, -H / 2, W, H, 0.05 * v.s);
        x.clip();
        x.fillStyle = '#ffd45c';
        x.fillRect(-W / 2, -H / 2, W, H);
        x.fillStyle = INK;
        for (let sx = -W / 2; sx < W / 2; sx += 0.5 * v.s) {
          x.beginPath();
          x.moveTo(sx, H / 2);
          x.lineTo(sx + 0.2 * v.s, -H / 2);
          x.lineTo(sx + 0.36 * v.s, -H / 2);
          x.lineTo(sx + 0.16 * v.s, H / 2);
          x.fill();
        }
        x.restore();
        x.beginPath();
        x.roundRect(-W / 2, -H / 2, W, H, 0.05 * v.s);
        x.stroke();
      });
      break;
    }
    case 'bridge': {
      // cordas
      x.strokeStyle = '#8f9bad';
      x.lineWidth = Math.max(1.5, v.s * 0.03);
      x.beginPath();
      x.moveTo(wx(v, o.x0), wy(v, o.y - 0.08));
      for (const b of op.bodies) x.lineTo(wx(v, b.x), wy(v, b.y));
      x.lineTo(wx(v, o.x1), wy(v, o.y - 0.08));
      x.stroke();
      x.strokeStyle = INK;
      x.lineWidth = lw;
      const pw = (o.x1 - o.x0) / Math.max(1, op.bodies.length);
      op.bodies.forEach((_, i) =>
        body(i, () => {
          x.fillStyle = i % 2 ? '#c9d1dc' : '#d6dce5';
          x.beginPath();
          x.roundRect((-pw / 2 + 0.015) * v.s, -0.08 * v.s, (pw - 0.03) * v.s, 0.16 * v.s, 0.04 * v.s);
          x.fill();
          x.stroke();
        }),
      );
      break;
    }
    case 'gate': {
      body(0, () => {
        const W = 0.4 * v.s;
        const H = 1.6 * v.s;
        x.save();
        x.beginPath();
        x.roundRect(-W / 2, -H / 2, W, H, 0.06 * v.s);
        x.clip();
        x.fillStyle = '#fff';
        x.fillRect(-W / 2, -H / 2, W, H);
        x.fillStyle = '#ef5d60';
        for (let k = 0; k < 6; k++) x.fillRect(-W / 2, -H / 2 + (k * H) / 6 + ((k % 2) * H) / 12, W, H / 12);
        x.restore();
        x.beginPath();
        x.roundRect(-W / 2, -H / 2, W, H, 0.06 * v.s);
        x.stroke();
      });
      // fenda no chão
      x.fillStyle = INK;
      x.fillRect(wx(v, o.x - 0.26), wy(v, o.y) - 1, 0.52 * v.s, Math.max(2, v.s * 0.05));
      break;
    }
    case 'pend': {
      const b = op.bodies[0];
      if (!b) break;
      x.strokeStyle = '#8f9bad';
      x.lineWidth = Math.max(1.5, v.s * 0.035);
      x.beginPath();
      x.moveTo(wx(v, o.x), wy(v, o.y));
      x.lineTo(wx(v, b.x), wy(v, b.y));
      x.stroke();
      x.fillStyle = '#b9c3d1';
      x.strokeStyle = INK;
      x.lineWidth = lw;
      x.beginPath();
      x.roundRect(wx(v, o.x - 0.35), wy(v, o.y + 0.15), 0.7 * v.s, 0.3 * v.s, 0.06 * v.s);
      x.fill();
      x.stroke();
      x.fillStyle = '#3e4756';
      x.beginPath();
      x.arc(wx(v, b.x), wy(v, b.y), 0.42 * v.s, 0, Math.PI * 2);
      x.fill();
      x.stroke();
      x.fillStyle = 'rgba(255,255,255,0.25)';
      x.beginPath();
      x.arc(wx(v, b.x - 0.12), wy(v, b.y + 0.12), 0.13 * v.s, 0, Math.PI * 2);
      x.fill();
      break;
    }
    case 'box':
      body(0, () => {
        const S = o.s * v.s;
        x.fillStyle = '#c9d1dc';
        x.beginPath();
        x.roundRect(-S / 2, -S / 2, S, S, 0.06 * v.s);
        x.fill();
        x.stroke();
        x.beginPath();
        x.moveTo(-S / 2 + lw, -S / 2 + lw);
        x.lineTo(S / 2 - lw, S / 2 - lw);
        x.stroke();
      });
      break;
  }
  void time;
}

/* ------------------------------ carga ------------------------------ */
export function drawCargo(x: CanvasRenderingContext2D, v: View, t: CargoDef['t'], px: number, py: number, a: number, broken = false, ghost = false): void {
  x.save();
  x.translate(wx(v, px), wy(v, py));
  x.rotate(-a);
  const s = v.s;
  x.lineWidth = Math.max(1.6, s * 0.04);
  x.strokeStyle = INK;
  x.lineJoin = 'round';
  if (ghost) x.globalAlpha *= 0.55;
  switch (t) {
    case 'crate':
    case 'big': {
      const S = (t === 'big' ? 0.94 : 0.46) * s;
      x.fillStyle = '#ffb547';
      x.beginPath();
      x.roundRect(-S, -S, S * 2, S * 2, S * 0.18);
      x.fill();
      x.stroke();
      x.strokeStyle = 'rgba(38,48,61,0.45)';
      x.beginPath();
      x.roundRect(-S * 0.62, -S * 0.62, S * 1.24, S * 1.24, S * 0.1);
      x.moveTo(-S * 0.62, -S * 0.62);
      x.lineTo(S * 0.62, S * 0.62);
      x.stroke();
      if (t === 'big') {
        x.fillStyle = INK;
        x.font = `700 ${Math.round(S * 0.45)}px Fredoka, system-ui, sans-serif`;
        x.textAlign = 'center';
        x.textBaseline = 'middle';
      }
      break;
    }
    case 'glass': {
      const S = 0.44 * s;
      x.fillStyle = broken ? 'rgba(170,215,240,0.35)' : 'rgba(150,215,250,0.55)';
      x.beginPath();
      x.roundRect(-S, -S, S * 2, S * 2, S * 0.12);
      x.fill();
      x.strokeStyle = '#4a8fbf';
      x.stroke();
      x.strokeStyle = 'rgba(255,255,255,0.9)';
      x.lineWidth = Math.max(1.5, s * 0.05);
      x.beginPath();
      x.moveTo(-S * 0.6, S * 0.2);
      x.lineTo(-S * 0.2, S * 0.6);
      x.moveTo(-S * 0.6, -S * 0.15);
      x.lineTo(S * 0.15, S * 0.6);
      x.stroke();
      if (broken) {
        x.strokeStyle = '#2c5f86';
        x.lineWidth = Math.max(1, s * 0.025);
        x.beginPath();
        x.moveTo(-S, -S * 0.2);
        x.lineTo(-S * 0.1, S * 0.1);
        x.lineTo(S * 0.3, -S * 0.7);
        x.moveTo(-S * 0.1, S * 0.1);
        x.lineTo(S, S * 0.4);
        x.stroke();
      }
      break;
    }
    case 'ball': {
      const R = 0.22 * s;
      x.fillStyle = '#49c6e5';
      x.beginPath();
      x.arc(0, 0, R, 0, Math.PI * 2);
      x.fill();
      x.stroke();
      x.strokeStyle = 'rgba(255,255,255,0.85)';
      x.lineWidth = Math.max(1.5, s * 0.04);
      x.beginPath();
      x.arc(0, 0, R * 0.62, -0.3, 1.2);
      x.stroke();
      break;
    }
    case 'drops': {
      const R = 0.1 * s;
      x.fillStyle = '#4a90ff';
      x.beginPath();
      x.arc(0, 0, R, 0, Math.PI * 2);
      x.fill();
      x.lineWidth = Math.max(1, s * 0.025);
      x.strokeStyle = '#2a5fb8';
      x.stroke();
      x.fillStyle = 'rgba(255,255,255,0.7)';
      x.beginPath();
      x.arc(-R * 0.3, R * 0.3, R * 0.3, 0, Math.PI * 2);
      x.fill();
      break;
    }
  }
  x.restore();
}

/** carga parada na grade de montagem (posições iniciais) */
export function cargoPieces(c: CargoDef): { x: number; y: number }[] {
  const big = c.t === 'big' || c.t === 'drops';
  const cx = (c.x + (big ? 1 : 0.5)) * U;
  const cy = (c.y + (big ? 1 : 0.5)) * U;
  if (c.t !== 'drops') return [{ x: cx, y: cy }];
  const r = U * 0.2;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < 8; i++) out.push({ x: cx + ((i % 4) - 1.5) * r * 2.05, y: cy - U * 0.6 + Math.floor(i / 4) * r * 2.05 });
  return out;
}

/* ------------------------------ peças ------------------------------ */
/**
 * Desenha uma peça estrutural com o contexto já em unidades de CÉLULA (y para cima, 1 = uma casa).
 * `lw` = espessura de linha em unidades de célula.
 */
export function drawStructCell(x: CanvasRenderingContext2D, p: Placed, lw: number, alpha = 1): void {
  const [fill, dark] = colorOf(p.t);
  x.globalAlpha = alpha;
  x.lineWidth = lw;
  x.strokeStyle = dark;
  x.lineJoin = 'round';
  const X = p.x;
  const Y = p.y;
  const ins = 0.03;
  switch (p.t) {
    case 'beam': {
      const hor = p.r % 2 === 0;
      const w = hor ? 3 : 0.6;
      const h = hor ? 0.6 : 3;
      const bx = X + (hor ? 0 : 0.2);
      const by = Y + (hor ? 0.2 : 0);
      x.fillStyle = fill;
      x.beginPath();
      x.roundRect(bx + ins, by + ins, w - ins * 2, h - ins * 2, 0.16);
      x.fill();
      x.stroke();
      x.fillStyle = 'rgba(255,255,255,0.85)';
      for (let k = 0; k < 3; k++) {
        x.beginPath();
        x.arc(X + (hor ? k + 0.5 : 0.5), Y + (hor ? 0.5 : k + 0.5), 0.1, 0, Math.PI * 2);
        x.fill();
        x.stroke();
      }
      break;
    }
    case 'tri': {
      const v = triVerts(p.r);
      x.fillStyle = fill;
      x.beginPath();
      v.forEach(([a, b], i) => {
        const px = X + 0.5 + (a - 0.5) * 0.94;
        const py = Y + 0.5 + (b - 0.5) * 0.94;
        if (i === 0) x.moveTo(px, py);
        else x.lineTo(px, py);
      });
      x.closePath();
      x.fill();
      x.stroke();
      break;
    }
    case 'basket': {
      x.fillStyle = fill;
      x.beginPath();
      x.moveTo(X + ins, Y + 1.0);
      x.lineTo(X + ins, Y + 0.34);
      x.lineTo(X + 3 - ins, Y + 0.34);
      x.lineTo(X + 3 - ins, Y + 1.0);
      x.lineTo(X + 3 - ins, Y + 2.0);
      x.lineTo(X + 2.78, Y + 2.0);
      x.lineTo(X + 2.78, Y + 1.0);
      x.lineTo(X + 0.22, Y + 1.0);
      x.lineTo(X + 0.22, Y + 2.0);
      x.lineTo(X + ins, Y + 2.0);
      x.closePath();
      x.fill();
      x.stroke();
      x.strokeStyle = 'rgba(38,48,61,0.25)';
      x.beginPath();
      for (let k = 1; k < 6; k++) {
        x.moveTo(X + k * 0.5, Y + 0.42);
        x.lineTo(X + k * 0.5, Y + 0.92);
      }
      x.stroke();
      break;
    }
    case 'hinge': {
      x.fillStyle = '#e4e8ee';
      x.beginPath();
      x.roundRect(X + 0.12, Y + 0.12, 0.76, 0.76, 0.2);
      x.fill();
      x.strokeStyle = dark;
      x.stroke();
      x.fillStyle = fill;
      x.beginPath();
      x.arc(X + 0.5, Y + 0.5, 0.3, 0, Math.PI * 2);
      x.fill();
      x.stroke();
      x.fillStyle = '#fff';
      x.beginPath();
      x.arc(X + 0.5, Y + 0.5, 0.09, 0, Math.PI * 2);
      x.fill();
      break;
    }
    default: {
      x.fillStyle = fill;
      x.beginPath();
      x.roundRect(X + ins, Y + ins, 1 - ins * 2, 1 - ins * 2, 0.14);
      x.fill();
      x.stroke();
      // brilho superior
      x.fillStyle = 'rgba(255,255,255,0.18)';
      x.beginPath();
      x.roundRect(X + 0.12, Y + 0.62, 0.76, 0.22, 0.08);
      x.fill();
      if (p.t === 'motor') drawGear(x, X + 0.5, Y + 0.48, 0.27, lw);
      else if (p.t === 'spring') {
        x.strokeStyle = 'rgba(255,255,255,0.9)';
        x.lineWidth = lw * 1.2;
        x.beginPath();
        x.moveTo(X + 0.2, Y + 0.3);
        for (let k = 0; k < 5; k++) x.lineTo(X + 0.28 + k * 0.12, Y + (k % 2 ? 0.3 : 0.62));
        x.lineTo(X + 0.8, Y + 0.62);
        x.stroke();
      } else if (p.t === 'weight') {
        x.fillStyle = 'rgba(255,255,255,0.88)';
        x.beginPath();
        x.moveTo(X + 0.3, Y + 0.24);
        x.lineTo(X + 0.7, Y + 0.24);
        x.lineTo(X + 0.62, Y + 0.56);
        x.lineTo(X + 0.38, Y + 0.56);
        x.closePath();
        x.fill();
        x.beginPath();
        x.arc(X + 0.5, Y + 0.62, 0.08, 0, Math.PI * 2);
        x.lineWidth = lw;
        x.strokeStyle = 'rgba(255,255,255,0.88)';
        x.stroke();
      }
    }
  }
  x.globalAlpha = 1;
}

function drawGear(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, lw: number): void {
  x.fillStyle = 'rgba(255,255,255,0.92)';
  x.beginPath();
  const n = 8;
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const rr = i % 2 ? r * 0.78 : r;
    x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  x.closePath();
  x.fill();
  x.fillStyle = colorOf('motor')[0];
  x.beginPath();
  x.arc(cx, cy, r * 0.36, 0, Math.PI * 2);
  x.fill();
  void lw;
}

/** silhueta (para a sombra) */
export function structSilhouette(x: CanvasRenderingContext2D, p: Placed): void {
  const X = p.x;
  const Y = p.y;
  if (p.t === 'beam') {
    const hor = p.r % 2 === 0;
    x.roundRect(X + (hor ? 0 : 0.2), Y + (hor ? 0.2 : 0), hor ? 3 : 0.6, hor ? 0.6 : 3, 0.16);
  } else if (p.t === 'tri') {
    const v = triVerts(p.r);
    x.moveTo(X + v[0][0], Y + v[0][1]);
    x.lineTo(X + v[1][0], Y + v[1][1]);
    x.lineTo(X + v[2][0], Y + v[2][1]);
    x.closePath();
  } else if (p.t === 'basket') {
    x.rect(X, Y + 0.34, 3, 0.66);
  } else x.roundRect(X, Y, 1, 1, 0.14);
}

/** roda em unidades de célula, centrada em (cx,cy); ang = giro */
export function drawWheel(x: CanvasRenderingContext2D, t: PartId, cx: number, cy: number, ang: number, lw: number, powered: boolean, alpha = 1): void {
  const r = (PARTS[t].radius ?? 0.4) / U;
  x.globalAlpha = alpha;
  x.lineWidth = lw;
  x.fillStyle = t === 'wheelG' ? '#3b4232' : '#2d3340';
  x.strokeStyle = '#141820';
  x.beginPath();
  x.arc(cx, cy, r, 0, Math.PI * 2);
  x.fill();
  x.stroke();
  if (t === 'wheelG') {
    // garras
    x.fillStyle = '#5a6448';
    for (let i = 0; i < 12; i++) {
      const a = ang + (i / 12) * Math.PI * 2;
      x.save();
      x.translate(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92);
      x.rotate(a);
      x.fillRect(-0.06, -0.07, 0.14, 0.14);
      x.restore();
    }
  }
  const hr = r * 0.56;
  x.fillStyle = '#e9edf2';
  x.beginPath();
  x.arc(cx, cy, hr, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = '#9aa5b5';
  x.lineWidth = lw * 0.8;
  x.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = ang + (i / 3) * Math.PI * 2;
    x.moveTo(cx + Math.cos(a) * hr * 0.3, cy + Math.sin(a) * hr * 0.3);
    x.lineTo(cx + Math.cos(a) * hr * 0.92, cy + Math.sin(a) * hr * 0.92);
  }
  x.stroke();
  x.fillStyle = powered ? colorOf('motor')[0] : '#9aa5b5';
  x.beginPath();
  x.arc(cx, cy, hr * 0.32, 0, Math.PI * 2);
  x.fill();
  x.globalAlpha = 1;
}

export function drawThruster(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, lw: number, flame: number, time: number, alpha = 1): void {
  x.save();
  x.globalAlpha = alpha;
  x.translate(cx, cy);
  x.rotate((r * Math.PI) / 2);
  // empurra para +x: bocal aponta para -x
  if (flame > 0) {
    const L = 0.55 + 0.25 * Math.sin(time * 40) * flame;
    x.fillStyle = '#ffd45c';
    x.beginPath();
    x.moveTo(-0.32, 0.17);
    x.lineTo(-0.32 - L * flame * 1.4, 0);
    x.lineTo(-0.32, -0.17);
    x.fill();
    x.fillStyle = '#ff7a59';
    x.beginPath();
    x.moveTo(-0.32, 0.1);
    x.lineTo(-0.32 - L * flame * 0.8, 0);
    x.lineTo(-0.32, -0.1);
    x.fill();
  }
  const [fill, dark] = colorOf('thruster');
  x.fillStyle = fill;
  x.strokeStyle = dark;
  x.lineWidth = lw;
  x.beginPath();
  x.moveTo(0.34, 0.2);
  x.lineTo(-0.1, 0.2);
  x.lineTo(-0.34, 0.3);
  x.lineTo(-0.34, -0.3);
  x.lineTo(-0.1, -0.2);
  x.lineTo(0.34, -0.2);
  x.closePath();
  x.fill();
  x.stroke();
  x.fillStyle = 'rgba(255,255,255,0.85)';
  x.beginPath();
  x.moveTo(0.22, 0);
  x.lineTo(0.05, 0.1);
  x.lineTo(0.05, -0.1);
  x.fill();
  x.restore();
}

export function drawBalloon(x: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, lw: number, alpha = 1): void {
  x.globalAlpha = alpha;
  x.strokeStyle = '#8f9bad';
  x.lineWidth = lw * 0.7;
  x.beginPath();
  x.moveTo(ax, ay);
  x.quadraticCurveTo((ax + bx) / 2 + 0.15, (ay + by) / 2, bx, by - 0.55);
  x.stroke();
  const [fill, dark] = colorOf('balloon');
  x.fillStyle = fill;
  x.strokeStyle = dark;
  x.lineWidth = lw;
  x.beginPath();
  x.ellipse(bx, by, 0.48, 0.58, 0, 0, Math.PI * 2);
  x.fill();
  x.stroke();
  x.beginPath();
  x.moveTo(bx - 0.08, by - 0.58);
  x.lineTo(bx + 0.08, by - 0.58);
  x.lineTo(bx, by - 0.68);
  x.closePath();
  x.fillStyle = dark;
  x.fill();
  x.fillStyle = 'rgba(255,255,255,0.45)';
  x.beginPath();
  x.ellipse(bx - 0.17, by + 0.2, 0.1, 0.17, -0.4, 0, Math.PI * 2);
  x.fill();
  x.globalAlpha = 1;
}

/** rebite de conexão */
export function drawLink(x: CanvasRenderingContext2D, cx: number, cy: number, lw: number): void {
  x.fillStyle = '#fff';
  x.strokeStyle = INK;
  x.lineWidth = lw * 0.8;
  x.beginPath();
  x.arc(cx, cy, 0.075, 0, Math.PI * 2);
  x.fill();
  x.stroke();
}

/* ------------------------------ partículas ------------------------------ */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  rot: number;
  vr: number;
  color: string;
  shape: 0 | 1 | 2;
  grav: number;
}

export class Particles {
  list: Particle[] = [];
  budget = 1;
  emit(n: number, x: number, y: number, o: { speed?: number; color?: string | string[]; size?: number; life?: number; up?: number; grav?: number; shape?: 0 | 1 | 2 } = {}): void {
    const k = Math.max(1, Math.round(n * this.budget));
    for (let i = 0; i < k && this.list.length < 260; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (o.speed ?? 2) * (0.4 + Math.random() * 0.8);
      const cols = Array.isArray(o.color) ? o.color : [o.color ?? '#b9c3d1'];
      const life = (o.life ?? 0.6) * (0.7 + Math.random() * 0.6);
      this.list.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp + (o.up ?? 1),
        life,
        max: life,
        size: (o.size ?? 0.09) * (0.6 + Math.random() * 0.8),
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 12,
        color: cols[i % cols.length],
        shape: o.shape ?? ((i % 3) as 0 | 1 | 2),
        grav: o.grav ?? 9,
      });
    }
  }
  update(dt: number): void {
    const l = this.list;
    for (let i = l.length - 1; i >= 0; i--) {
      const p = l[i];
      p.life -= dt;
      if (p.life <= 0) {
        l[i] = l[l.length - 1];
        l.pop();
        continue;
      }
      p.vy -= p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  }
  draw(x: CanvasRenderingContext2D, v: View): void {
    for (const p of this.list) {
      const k = p.life / p.max;
      x.globalAlpha = Math.min(1, k * 1.6);
      x.fillStyle = p.color;
      const S = p.size * v.s * (0.5 + 0.5 * k);
      x.save();
      x.translate(wx(v, p.x), wy(v, p.y));
      x.rotate(p.rot);
      x.beginPath();
      if (p.shape === 0) x.rect(-S / 2, -S / 2, S, S);
      else if (p.shape === 1) {
        x.moveTo(0, -S * 0.6);
        x.lineTo(S * 0.55, S * 0.45);
        x.lineTo(-S * 0.55, S * 0.45);
        x.closePath();
      } else x.arc(0, 0, S * 0.5, 0, Math.PI * 2);
      x.fill();
      x.restore();
    }
    x.globalAlpha = 1;
  }
}

/** ícone de peça (para a bandeja): canvas pequeno */
export function partIcon(t: PartId, r: number, size: number, dpr: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = Math.round(size * dpr);
  const x = c.getContext('2d')!;
  const p: Placed = { t, x: 0, y: 0, r };
  // enquadramento em células
  let w = 1;
  let h = 1;
  let ox = 0;
  let oy = 0;
  if (t === 'beam') {
    if (r % 2 === 0) w = 3;
    else h = 3;
  } else if (t === 'basket') {
    w = 3;
    h = 2;
  } else if (t === 'wheelL') {
    w = h = 2.7;
    ox = oy = 0.85;
  } else if (t === 'wheelS' || t === 'wheelG') {
    w = h = 1.9;
    ox = oy = 0.45;
  } else if (t === 'balloon') {
    w = 1.4;
    h = 2.3;
    ox = 0.2;
  }
  const k = (size * dpr * 0.82) / Math.max(w, h);
  x.translate((size * dpr - w * k) / 2 + ox * k, (size * dpr + h * k) / 2 - oy * k);
  x.scale(k, -k);
  const lw = 1.8 / (k / dpr);
  if (PARTS[t].layer === 'struct') drawStructCell(x, p, lw);
  else if (PARTS[t].radius) drawWheel(x, t, 0.5, 0.5, 0.4, lw, false);
  else if (t === 'thruster') drawThruster(x, 0.5, 0.5, r, lw, 0, 0);
  else if (t === 'balloon') drawBalloon(x, 0.5, 0.05, 0.5, 1.35, lw);
  return c;
}
