/* ============================================================
 *  CRIE SEU BLOOP — materiais (cor/acabamento) e padrões do corpo.
 *  Tudo desenhado DENTRO do clip do corpo (exceto under/outline).
 * ============================================================ */
import type { PlayerPose } from './character';
import { rng, TAU } from './math';
import { A, al, circ, type Cols, ell, glowAt, heart, hsl, lin, mix, NP, PI, rad, type Shape, star4, star5, tracePts } from './avatar-gfx';

export interface DC {
  x: CanvasRenderingContext2D;
  R: number;
  p: PlayerPose;
  c: Cols;
  sh: Shape;
  pts: Float32Array;
  t: number;
  /** olhos (meia distância), y dos olhos, y da boca */
  ex: number;
  ey: number;
  my: number;
}

export type OutlineKind = 'marker' | 'soft' | 'fur' | 'glow' | 'none' | 'light';

export interface Material {
  fill: (d: DC) => void;
  /** 0..1 — quanto do sombreamento padrão (sombra interna, rim, especular) */
  shade: number;
  spec?: number;
  outline: OutlineKind;
  /** cor do contorno (padrão: c.outline) */
  line?: (c: Cols) => string;
  /** brilho por trás do corpo */
  under?: (d: DC) => void;
  /** depois do sombreamento, ainda no clip */
  over?: (d: DC) => void;
  /** cor dos pés [base, brilho] */
  feet?: (c: Cols) => [string, string];
  /** cor de "pele" para pálpebras etc. */
  skin?: (c: Cols) => string;
  anim?: boolean;
}

/* ---------------------------- geometria fixa ---------------------------- */

const R0 = rng(4242);
/** linhas de hachura tosca: [x0,y0,x1,y1,x2,y2] */
const HATCH: number[][] = [];
for (let i = 0; i < 13; i++) {
  const off = -1.2 + i * 0.2 + (R0() - 0.5) * 0.08;
  const x0 = off - 0.5;
  const y0 = 0.9 + (R0() - 0.5) * 0.3;
  HATCH.push([x0, y0, x0 + 0.5 + (R0() - 0.5) * 0.1, y0 - 0.85, x0 + 1.05, y0 - 1.75 + (R0() - 0.5) * 0.2]);
}
const SPECKS: number[][] = [];
for (let i = 0; i < 34; i++) SPECKS.push([(R0() - 0.5) * 2, (R0() - 0.5) * 2, R0(), R0()]);
const STARS: number[][] = [];
for (let i = 0; i < 26; i++) STARS.push([(R0() - 0.5) * 2.1, (R0() - 0.5) * 2.1, R0(), R0() * TAU]);
/** facetas (gelo): triângulos */
const FACETS: number[][] = [];
{
  const n = 7;
  const inner: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + R0() * 0.4;
    const r = 0.42 + R0() * 0.2;
    inner.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    FACETS.push([0.05, -0.1, inner[i * 2], inner[i * 2 + 1], inner[j * 2], inner[j * 2 + 1], R0()]);
    const a = ((i + 0.5) / n) * TAU;
    FACETS.push([inner[i * 2], inner[i * 2 + 1], Math.cos(a) * 1.4, Math.sin(a) * 1.4, inner[j * 2], inner[j * 2 + 1], R0()]);
  }
}
/** rachaduras (lava / luz): polilinhas da borda para dentro */
function cracks(seed: number, n: number): number[][] {
  const r = rng(seed);
  const out: number[][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r() * 0.5;
    let px = Math.cos(a) * 1.1;
    let py = Math.sin(a) * 1.1;
    const line = [px, py];
    for (let k = 0; k < 4; k++) {
      const ia = Math.atan2(-py, -px) + (r() - 0.5) * 1.5;
      const st = 0.15 + r() * 0.14;
      px += Math.cos(ia) * st;
      py += Math.sin(ia) * st;
      line.push(px, py);
    }
    out.push(line);
  }
  return out;
}
const LAVA = cracks(77, 8);
const LIGHT_CRACKS = cracks(91, 7);
/** circuitos: [px,py,mx,my,ex,ey] */
const CIRCUIT: number[][] = [];
{
  const r = rng(303);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + 0.3 + r() * 0.3;
    const px = Math.cos(a) * 1.1;
    const py = Math.sin(a) * 1.1;
    const mx = px * (0.55 + r() * 0.2);
    CIRCUIT.push([px, py, mx, py, mx, py * (0.4 + r() * 0.2)]);
  }
}
/** manchas de vaca */
const PATCHES: { x: number; y: number; s: number; pts: number[] }[] = [];
{
  const r = rng(515);
  const spots = [
    [-0.55, -0.45, 0.42],
    [0.6, 0.15, 0.36],
    [-0.2, 0.62, 0.3],
    [0.35, -0.75, 0.22],
  ];
  for (const [sx, sy, s] of spots) {
    const pts: number[] = [];
    for (let i = 0; i < 10; i++) pts.push(0.75 + r() * 0.45);
    PATCHES.push({ x: sx, y: sy, s, pts });
  }
}
/** rabisco tosco */
const DOODLE: number[] = [];
{
  const r = rng(99);
  let px = -0.75;
  for (let i = 0; i < 9; i++) {
    DOODLE.push(px, 0.25 + (i % 2 ? 0.28 : -0.05) + (r() - 0.5) * 0.12);
    px += 0.19 + (r() - 0.5) * 0.05;
  }
}
const RUNES: number[][] = [];
{
  const r = rng(808);
  for (let i = 0; i < 8; i++) {
    const g: number[] = [];
    for (let k = 0; k < 3; k++) g.push((r() - 0.5) * 1.6, (r() - 0.5) * 2, (r() - 0.5) * 1.6, (r() - 0.5) * 2);
    RUNES.push(g);
  }
}

/* ---------------------------- iluminação padrão ---------------------------- */

export function shadeBody(d: DC, amount: number, spec = 1): void {
  const { x, R, p, c } = d;
  if (amount <= 0) return;
  const sg = x.createRadialGradient(p.lx * R * 0.3, p.ly * R * 0.3, R * 0.5, -p.lx * R * 0.05, -p.ly * R * 0.05, R * 1.2);
  sg.addColorStop(0, c.sh0);
  sg.addColorStop(0.6, c.shM);
  sg.addColorStop(1, c.shA);
  x.fillStyle = sg;
  A(x, amount);
  x.fillRect(-R * 1.6, -R * 1.6, R * 3.2, R * 3.2);
  // contraluz
  const ra = Math.atan2(-p.ly, -p.lx);
  x.strokeStyle = c.rim;
  x.lineCap = 'round';
  A(x, 0.28 * amount);
  x.lineWidth = R * 0.22;
  x.beginPath();
  x.arc(0, 0, R * 0.99, ra - 1.0, ra + 1.0);
  x.stroke();
  A(x, 0.7 * amount);
  x.lineWidth = R * 0.07;
  x.beginPath();
  x.arc(0, 0, R * 0.92, ra - 0.65, ra + 0.65);
  x.stroke();
  // especular
  if (spec > 0) {
    const sa = Math.atan2(p.ly, p.lx);
    x.fillStyle = '#ffffff';
    A(x, 0.45 * spec);
    ell(x, p.lx * R * 0.52, p.ly * R * 0.52, R * 0.3, R * 0.16, sa + PI / 2);
    x.fill();
    A(x, 0.9 * spec);
    circ(x, p.lx * R * 0.5 + p.ly * R * 0.2, p.ly * R * 0.5 - p.lx * R * 0.2, R * 0.065);
    x.fill();
  }
  A(x, 1);
}

const fillAll = (x: CanvasRenderingContext2D, R: number) => x.fillRect(-R * 1.6, -R * 1.6, R * 3.2, R * 3.2);

/* ============================================================
 *  MATERIAIS
 * ============================================================ */

const PAPER = '#efe6cf';

export const MATERIALS: Record<string, Material> = {
  /* tosco: papel + giz que não pinta até a borda */
  m_crayon: {
    shade: 0,
    outline: 'marker',
    fill(d) {
      const { x, R, c, sh, pts } = d;
      x.fillStyle = PAPER;
      fillAll(x, R);
      x.fillStyle = c.P;
      tracePts(x, pts, R, sh.sharp, undefined, 0, R * 0.07, R * 0.06, 0.88);
      x.fill();
      // hachura torta
      x.strokeStyle = c.Pd;
      x.lineWidth = R * 0.045;
      x.lineCap = 'round';
      A(x, 0.4);
      x.beginPath();
      for (const h of HATCH) {
        x.moveTo(h[0] * R, h[1] * R);
        x.lineTo(h[2] * R, h[3] * R);
        x.lineTo(h[4] * R, h[5] * R);
      }
      x.stroke();
      // risco que escapou
      A(x, 0.7);
      x.strokeStyle = c.P;
      x.lineWidth = R * 0.06;
      x.beginPath();
      x.moveTo(-R * 0.95, -R * 0.1);
      x.lineTo(-R * 0.7, R * 0.12);
      x.lineTo(-R * 0.98, R * 0.3);
      x.stroke();
      A(x, 1);
    },
    feet: (c) => [c.P, c.P],
    skin: (c) => c.P,
  },
  m_clay: {
    shade: 0.35,
    spec: 0.3,
    outline: 'soft',
    fill(d) {
      const { x, R, c } = d;
      x.fillStyle = c.P;
      fillAll(x, R);
      x.fillStyle = c.Pd;
      A(x, 0.28);
      ell(x, R * 0.1, R * 0.9, R * 1.3, R * 0.55);
      x.fill();
      // marcas de dedo
      x.strokeStyle = c.Pd;
      x.lineWidth = R * 0.03;
      A(x, 0.35);
      for (const [px, py] of [[-0.45, 0.35], [0.5, -0.4], [0.3, 0.55]]) {
        for (let k = 0; k < 3; k++) {
          x.beginPath();
          x.arc(px * R, py * R, R * (0.05 + k * 0.045), -2.4, -0.6);
          x.stroke();
        }
      }
      A(x, 1);
    },
  },
  m_soft: {
    shade: 1,
    outline: 'soft',
    fill(d) {
      const { x, R, p, c } = d;
      const g = x.createRadialGradient(p.lx * R * 0.42, p.ly * R * 0.42, R * 0.05, 0, 0, R * 1.1);
      g.addColorStop(0, c.Ph);
      g.addColorStop(0.45, c.P);
      g.addColorStop(1, c.Pd);
      x.fillStyle = g;
      fillAll(x, R);
    },
  },
  m_duo: {
    shade: 1,
    outline: 'soft',
    fill(d) {
      const { x, R, p, c } = d;
      x.fillStyle = lin(x, 0, -R, 0, R, c.Pl, c.P, mix(c.P, c.S, 0.5), c.S, c.Sd);
      fillAll(x, R);
      x.fillStyle = rad(x, p.lx * R * 0.4, p.ly * R * 0.4, R * 0.9, al(c.Ph, 0.7), al(c.Ph, 0));
      fillAll(x, R);
    },
  },
  m_plush: {
    shade: 0.8,
    spec: 0.25,
    outline: 'fur',
    fill(d) {
      const { x, R, p, c } = d;
      x.fillStyle = rad(x, p.lx * R * 0.4, p.ly * R * 0.4, R * 1.15, c.Pl, c.P, c.Pd);
      fillAll(x, R);
      x.fillStyle = c.Ph;
      for (const s of SPECKS) {
        A(x, 0.18 + s[2] * 0.2);
        ell(x, s[0] * R, s[1] * R, R * 0.035, R * 0.016, s[3] * 3);
        x.fill();
      }
      A(x, 1);
    },
  },
  m_jelly: {
    shade: 0.45,
    spec: 1.3,
    outline: 'soft',
    line: (c) => al(c.Pd, 0.8),
    fill(d) {
      const { x, R, p, c } = d;
      x.fillStyle = rad(x, 0, R * 0.25, R * 1.15, c.Ph, c.P, c.Pd);
      fillAll(x, R);
      // núcleo luminoso
      x.fillStyle = rad(x, -p.lx * R * 0.25, -p.ly * R * 0.25 + R * 0.2, R * 0.7, al(c.Ph, 0.75), al(c.Ph, 0));
      fillAll(x, R);
      // bolhinhas presas
      x.strokeStyle = c.Ph;
      x.lineWidth = R * 0.025;
      A(x, 0.7);
      for (const [bx, by, br] of [[0.42, 0.42, 0.07], [0.55, 0.15, 0.04], [-0.35, 0.6, 0.05], [0.2, 0.68, 0.03]]) {
        circ(x, bx * R, (by - Math.sin(d.t * 1.5 + bx * 9) * 0.02) * R, br * R);
        x.stroke();
      }
      A(x, 1);
    },
    over(d) {
      const { x, R, p } = d;
      // reflexo grande de gelatina
      x.fillStyle = '#ffffff';
      A(x, 0.35);
      ell(x, p.lx * R * 0.38, p.ly * R * 0.38, R * 0.55, R * 0.26, Math.atan2(p.ly, p.lx) + PI / 2);
      x.fill();
      A(x, 1);
    },
    anim: true,
  },
  m_metal: {
    shade: 0.55,
    spec: 1.5,
    outline: 'soft',
    line: (c) => al(c.Pdd, 0.8),
    fill(d) {
      const { x, R, c } = d;
      const g = x.createLinearGradient(0, -R, 0, R);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.18, c.Ph);
      g.addColorStop(0.42, c.P);
      g.addColorStop(0.5, c.Pdd);
      g.addColorStop(0.56, c.Pd);
      g.addColorStop(0.72, c.Pl);
      g.addColorStop(0.86, mix(c.Ph, '#ffffff', 0.4));
      g.addColorStop(1, c.Pd);
      x.fillStyle = g;
      fillAll(x, R);
      // reflexos verticais
      x.fillStyle = '#ffffff';
      A(x, 0.35);
      ell(x, -R * 0.45, -R * 0.1, R * 0.09, R * 0.75, 0.15);
      x.fill();
      A(x, 0.18);
      ell(x, R * 0.55, R * 0.05, R * 0.05, R * 0.7, 0.1);
      x.fill();
      A(x, 1);
    },
    feet: (c) => [c.Pd, c.Ph],
  },
  m_pearl: {
    shade: 0.6,
    spec: 1.1,
    outline: 'soft',
    fill(d) {
      const { x, R, p, c } = d;
      x.fillStyle = rad(x, p.lx * R * 0.4, p.ly * R * 0.4, R * 1.15, '#ffffff', c.Ph, mix(c.P, c.S, 0.4));
      fillAll(x, R);
      const s = Math.sin(d.t * 0.8) * 0.3;
      x.fillStyle = lin(x, -R, -R * (1 + s), R, R, al('#9ff7ff', 0.0), al('#9ff7ff', 0.35), al('#ffb3ef', 0.3), al(c.S, 0.25), al('#fff6b0', 0.3), al('#fff6b0', 0));
      fillAll(x, R);
    },
    anim: true,
  },
  m_ice: {
    shade: 0.45,
    spec: 1.4,
    outline: 'light',
    line: () => 'rgba(235,252,255,0.85)',
    fill(d) {
      const { x, R, p, c } = d;
      const base = mix(c.P, '#bdf3ff', 0.6);
      x.fillStyle = rad(x, p.lx * R * 0.3, p.ly * R * 0.3, R * 1.2, '#ffffff', base, mix(base, '#2a4cff', 0.45));
      fillAll(x, R);
      for (const f of FACETS) {
        x.fillStyle = f[6] > 0.5 ? '#ffffff' : '#1a3a9a';
        A(x, f[6] > 0.5 ? 0.12 + f[6] * 0.14 : 0.1 + f[6] * 0.08);
        x.beginPath();
        x.moveTo(f[0] * R, f[1] * R);
        x.lineTo(f[2] * R, f[3] * R);
        x.lineTo(f[4] * R, f[5] * R);
        x.closePath();
        x.fill();
      }
      x.strokeStyle = '#ffffff';
      x.lineWidth = R * 0.018;
      A(x, 0.4);
      x.beginPath();
      for (const f of FACETS) {
        x.moveTo(f[0] * R, f[1] * R);
        x.lineTo(f[2] * R, f[3] * R);
      }
      x.stroke();
      A(x, 1);
    },
    over(d) {
      const { x, R, t } = d;
      x.fillStyle = '#ffffff';
      for (let i = 0; i < 3; i++) {
        const k = Math.max(0, Math.sin(t * 2 + i * 2.1));
        if (k < 0.1) continue;
        A(x, k);
        star4(x, (-0.4 + i * 0.45) * R, (-0.3 + (i % 2) * 0.6) * R, R * 0.12 * k);
      }
      A(x, 1);
    },
    anim: true,
    feet: () => ['#8fd8ff', '#ffffff'],
    skin: (c) => mix(c.P, '#bdf3ff', 0.6),
  },
  m_neon: {
    shade: 0.2,
    spec: 0.6,
    outline: 'glow',
    line: (c) => mix(c.P, '#ffffff', 0.3),
    under(d) {
      const k = 0.75 + Math.sin(d.t * 4) * 0.25;
      glowAt(d.x, mix(d.c.P, '#ffffff', 0.2), 0, 0, d.R * 2.1, 0.55 * k);
    },
    fill(d) {
      const { x, R, c, sh, pts, t } = d;
      x.fillStyle = mix(c.P, '#0a0018', 0.82);
      fillAll(x, R);
      x.fillStyle = rad(x, 0, R * 0.2, R * 1.1, al(c.P, 0.05), al(c.P, 0.15), al(c.P, 0.45));
      fillAll(x, R);
      // grade
      x.strokeStyle = c.S;
      x.lineWidth = R * 0.02;
      A(x, 0.25);
      x.beginPath();
      for (let i = -3; i <= 3; i++) {
        const yy = (i * 0.32 + ((t * 0.3) % 0.32)) * R;
        x.moveTo(-R * 1.5, yy);
        x.lineTo(R * 1.5, yy);
      }
      x.stroke();
      // borda luminosa interna
      const k = 0.6 + Math.sin(t * 4) * 0.3;
      x.strokeStyle = c.P;
      A(x, 0.5 * k);
      x.lineWidth = R * 0.3;
      tracePts(x, pts, R, sh.sharp);
      x.stroke();
      A(x, 1);
    },
    anim: true,
    feet: (c) => [mix(c.P, '#0a0018', 0.7), c.P],
    skin: (c) => mix(c.P, '#0a0018', 0.7),
  },
  m_gold: {
    shade: 0.5,
    spec: 1.5,
    outline: 'soft',
    line: () => 'rgba(122,70,0,0.8)',
    fill(d) {
      const { x, R, p } = d;
      x.fillStyle = rad(x, p.lx * R * 0.42, p.ly * R * 0.42, R * 1.15, '#fffbe0', '#ffe066', '#f2b200', '#a86200');
      fillAll(x, R);
      x.fillStyle = '#fff7c2';
      A(x, 0.35);
      ell(x, 0, R * 0.62, R * 0.9, R * 0.22);
      x.fill();
      A(x, 1);
    },
    over(d) {
      const { x, R, t } = d;
      const ph = (t * 0.45) % 1;
      const cx = (-1.8 + ph * 3.6) * R;
      const g = x.createLinearGradient(cx - R * 0.4, 0, cx + R * 0.4, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.75)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.save();
      x.rotate(0.5);
      x.fillStyle = g;
      x.fillRect(cx - R * 0.4, -R * 2, R * 0.8, R * 4);
      x.restore();
      x.fillStyle = '#ffffff';
      const k = Math.max(0, Math.sin(t * 3));
      A(x, k);
      star4(x, -R * 0.5, -R * 0.45, R * 0.16 * k);
      A(x, 1);
    },
    anim: true,
    feet: () => ['#c98a00', '#fff3a0'],
    skin: () => '#f2b200',
  },
  m_holo: {
    shade: 0.45,
    spec: 1.2,
    outline: 'light',
    line: () => 'rgba(255,255,255,0.85)',
    fill(d) {
      const { x, R, p, t } = d;
      x.fillStyle = rad(x, p.lx * R * 0.4, p.ly * R * 0.4, R * 1.2, '#ffffff', '#eef0ff', '#b8b8e8');
      fillAll(x, R);
      const h = t * 70;
      const g = x.createLinearGradient(-R, -R, R, R);
      for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, al(hsl(h + i * 55, 0.95, 0.68), 0.6));
      x.fillStyle = g;
      fillAll(x, R);
      // faixas de difração
      x.save();
      x.rotate(-0.6);
      for (let i = -3; i <= 3; i++) {
        x.fillStyle = hsl(h * 1.4 + i * 40, 1, 0.8);
        A(x, 0.22);
        x.fillRect(-R * 1.6, (i * 0.34 + Math.sin(t + i) * 0.04) * R, R * 3.2, R * 0.07);
      }
      x.restore();
      A(x, 1);
    },
    anim: true,
    feet: () => ['#b8b8e8', '#ffffff'],
    skin: () => '#dfe2ff',
  },
  m_lava: {
    shade: 0.6,
    spec: 0.4,
    outline: 'glow',
    line: () => '#ff7a1a',
    under(d) {
      glowAt(d.x, '#ff6a00', 0, 0, d.R * 2.1, 0.45 + Math.sin(d.t * 3) * 0.12);
    },
    fill(d) {
      const { x, R, p, t } = d;
      x.fillStyle = rad(x, p.lx * R * 0.4, p.ly * R * 0.4, R * 1.15, '#7a5048', '#4a2c26', '#1c0f0e');
      fillAll(x, R);
      // brasas por baixo
      x.fillStyle = rad(x, 0, R * 0.9, R * 1.1, 'rgba(255,90,0,0.55)', 'rgba(255,90,0,0)');
      fillAll(x, R);
      const k = 0.75 + Math.sin(t * 3) * 0.25;
      x.lineCap = 'round';
      x.lineJoin = 'round';
      for (const pass of [0, 1]) {
        x.strokeStyle = pass ? '#ffe36b' : '#ff6a00';
        x.lineWidth = R * (pass ? 0.035 : 0.1);
        A(x, pass ? k : 0.85);
        x.beginPath();
        for (const l of LAVA) {
          x.moveTo(l[0] * R, l[1] * R);
          for (let i = 2; i < l.length; i += 2) x.lineTo(l[i] * R, l[i + 1] * R);
        }
        x.stroke();
      }
      A(x, 1);
      for (let i = 0; i < 4; i++) {
        const l = LAVA[i * 2];
        glowAt(x, '#ff8a00', l[l.length - 2] * R, l[l.length - 1] * R, R * 0.35, 0.5 * k);
      }
    },
    anim: true,
    feet: () => ['#2a1714', '#ff7a1a'],
    skin: () => '#4a2c26',
  },
  m_galaxy: {
    shade: 0.5,
    spec: 0.8,
    outline: 'glow',
    line: (c) => mix(c.P, '#ffffff', 0.55),
    under(d) {
      glowAt(d.x, mix(d.c.P, '#7a5cff', 0.5), 0, 0, d.R * 2.2, 0.5);
    },
    fill(d) {
      const { x, R, c, t } = d;
      x.fillStyle = rad(x, -R * 0.2, -R * 0.2, R * 1.3, mix(c.P, '#3a1aa0', 0.6), mix(c.P, '#140638', 0.75), '#05010f');
      fillAll(x, R);
      // nebulosas
      const neb: [string, number, number, number][] = [
        [mix(c.S, '#ff4fd8', 0.4), -0.35, 0.3, 0.75],
        ['#3fd9ff', 0.45, -0.25, 0.6],
        [mix(c.P, '#b44dff', 0.5), 0.1, 0.55, 0.65],
      ];
      for (let i = 0; i < neb.length; i++) {
        const [col, nx, ny, nr] = neb[i];
        const ox = Math.sin(t * 0.4 + i * 2) * 0.12;
        const oy = Math.cos(t * 0.33 + i) * 0.1;
        x.fillStyle = rad(x, (nx + ox) * R, (ny + oy) * R, nr * R, al(col, 0.55), al(col, 0));
        fillAll(x, R);
      }
      // faixa da via láctea
      x.save();
      x.rotate(-0.5 + Math.sin(t * 0.2) * 0.05);
      x.fillStyle = lin(x, 0, -R * 0.25, 0, R * 0.25, 'rgba(255,255,255,0)', 'rgba(255,240,255,0.22)', 'rgba(255,255,255,0)');
      x.fillRect(-R * 1.6, -R * 0.25, R * 3.2, R * 0.5);
      x.restore();
      x.fillStyle = '#ffffff';
      for (const s of STARS) {
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * (1 + s[2] * 2) + s[3]));
        A(x, tw);
        if (s[2] > 0.82) star4(x, s[0] * R, s[1] * R, R * 0.09 * tw);
        else {
          circ(x, s[0] * R, s[1] * R, R * (0.012 + s[2] * 0.02));
          x.fill();
        }
      }
      A(x, 1);
    },
    anim: true,
    feet: () => ['#140638', '#b49cff'],
    skin: () => '#2a1070',
  },
  m_aurora: {
    shade: 0.45,
    spec: 0.8,
    outline: 'glow',
    line: () => '#7dffc8',
    under(d) {
      glowAt(d.x, '#3dffb0', 0, 0, d.R * 2.2, 0.4 + Math.sin(d.t * 2) * 0.1);
    },
    fill(d) {
      const { x, R, t } = d;
      x.fillStyle = rad(x, 0, -R * 0.3, R * 1.3, '#123a5a', '#071a33', '#020611');
      fillAll(x, R);
      x.lineCap = 'round';
      const bands: [string, string, number][] = [
        ['#3dffb0', '#3fd9ff', -0.35],
        ['#7dffc8', '#b44dff', 0.05],
        ['#3fd9ff', '#ff6bd5', 0.42],
      ];
      for (let b = 0; b < bands.length; b++) {
        const [c1, c2, by] = bands[b];
        x.strokeStyle = lin(x, -R, 0, R, 0, al(c1, 0), al(c1, 0.75), al(c2, 0.75), al(c2, 0));
        x.lineWidth = R * 0.26;
        A(x, 0.75);
        x.beginPath();
        for (let i = 0; i <= 12; i++) {
          const u = i / 12;
          const px = (-1.3 + u * 2.6) * R;
          const py = (by + Math.sin(u * 5 + t * 1.6 + b * 1.7) * 0.14) * R;
          if (i) x.lineTo(px, py);
          else x.moveTo(px, py);
        }
        x.stroke();
      }
      x.fillStyle = '#ffffff';
      for (let i = 0; i < 10; i++) {
        const s = STARS[i];
        A(x, 0.3 + 0.7 * Math.abs(Math.sin(t * 1.5 + s[3])));
        circ(x, s[0] * R, s[1] * R, R * 0.02);
        x.fill();
      }
      A(x, 1);
    },
    anim: true,
    feet: () => ['#071a33', '#7dffc8'],
    skin: () => '#0d2a48',
  },
};

/* ============================================================
 *  PADRÕES (cor secundária)
 * ============================================================ */

export interface Pattern {
  draw: (d: DC) => void;
  anim?: boolean;
}

export const PATTERNS: Record<string, Pattern> = {
  p_none: { draw() {} },
  p_doodle: {
    draw(d) {
      const { x, R, c } = d;
      x.strokeStyle = c.Sd;
      x.lineWidth = R * 0.055;
      x.lineCap = 'round';
      x.lineJoin = 'round';
      A(x, 0.75);
      x.beginPath();
      x.moveTo(DOODLE[0] * R, DOODLE[1] * R);
      for (let i = 2; i < DOODLE.length; i += 2) x.lineTo(DOODLE[i] * R, DOODLE[i + 1] * R);
      x.stroke();
      // espiral torta
      x.beginPath();
      for (let i = 0; i < 26; i++) {
        const a = i * 0.5;
        const r = 0.02 + i * 0.0075;
        const px = (0.5 + Math.cos(a) * r * 1.2) * R;
        const py = (-0.45 + Math.sin(a) * r) * R;
        if (i) x.lineTo(px, py);
        else x.moveTo(px, py);
      }
      x.stroke();
      A(x, 1);
    },
  },
  p_spots: {
    draw(d) {
      const { x, R, c } = d;
      const S: number[][] = [[-0.55, -0.4, 0.17], [0.5, -0.55, 0.12], [0.62, 0.25, 0.16], [-0.35, 0.5, 0.13], [0.1, 0.72, 0.1], [-0.8, 0.15, 0.1], [0.18, -0.85, 0.09]];
      for (const [sx, sy, sr] of S) {
        x.fillStyle = c.S;
        circ(x, sx * R, sy * R, sr * R);
        x.fill();
        x.fillStyle = c.Sh;
        A(x, 0.5);
        circ(x, (sx - sr * 0.3) * R, (sy - sr * 0.3) * R, sr * 0.35 * R);
        x.fill();
        A(x, 1);
      }
    },
  },
  p_belly: {
    draw(d) {
      const { x, R, c } = d;
      x.fillStyle = rad(x, 0, R * 0.5, R * 0.75, c.Sh, c.S);
      A(x, 0.9);
      ell(x, 0, R * 0.58, R * 0.62, R * 0.44);
      x.fill();
      A(x, 1);
    },
  },
  p_stripes: {
    draw(d) {
      const { x, R, c } = d;
      x.fillStyle = c.S;
      for (let i = -2; i <= 2; i++) {
        const y0 = (i * 0.48 - 0.08) * R;
        const h = R * 0.2;
        x.beginPath();
        x.moveTo(-R * 1.6, y0);
        x.quadraticCurveTo(0, y0 + R * 0.18, R * 1.6, y0);
        x.lineTo(R * 1.6, y0 + h);
        x.quadraticCurveTo(0, y0 + h + R * 0.18, -R * 1.6, y0 + h);
        x.closePath();
        x.fill();
      }
    },
  },
  p_patches: {
    draw(d) {
      const { x, R, c } = d;
      x.fillStyle = c.S;
      for (const pa of PATCHES) {
        x.beginPath();
        const n = pa.pts.length;
        for (let i = 0; i <= n; i++) {
          const a = (i / n) * TAU;
          const r = pa.pts[i % n] * pa.s;
          const px = (pa.x + Math.cos(a) * r) * R;
          const py = (pa.y + Math.sin(a) * r) * R;
          if (i) x.lineTo(px, py);
          else x.moveTo(px, py);
        }
        x.closePath();
        x.fill();
      }
    },
  },
  p_hearts: {
    draw(d) {
      const { x, R, c } = d;
      const H: number[][] = [[-0.55, -0.35, 0.13, -0.3], [0.55, -0.5, 0.1, 0.3], [0.6, 0.3, 0.13, 0.2], [-0.4, 0.55, 0.11, -0.2], [0.05, 0.75, 0.08, 0.1], [-0.85, 0.15, 0.08, 0]];
      for (const [hxv, hyv, s, r] of H) {
        x.save();
        x.translate(hxv * R, hyv * R);
        x.rotate(r);
        x.fillStyle = c.S;
        heart(x, 0, 0, s * R);
        x.fill();
        x.fillStyle = c.Sh;
        A(x, 0.6);
        circ(x, -s * R * 0.4, -s * R * 0.25, s * R * 0.2);
        x.fill();
        A(x, 1);
        x.restore();
      }
    },
  },
  p_stars: {
    draw(d) {
      const { x, R, c } = d;
      const H: number[][] = [[-0.55, -0.4, 0.15, 0.2], [0.5, -0.6, 0.11, -0.2], [0.65, 0.2, 0.14, 0.4], [-0.35, 0.5, 0.12, 0], [0.12, 0.75, 0.08, 0.3], [-0.85, 0.1, 0.09, 0.1], [0.15, -0.15, 0.06, 0]];
      for (const [sx, sy, s, r] of H) {
        x.fillStyle = c.S;
        star5(x, sx * R, sy * R, s * R, r, 0.5);
        x.fill();
        x.fillStyle = c.Sh;
        A(x, 0.55);
        star5(x, (sx - s * 0.12) * R, (sy - s * 0.15) * R, s * R * 0.45, r, 0.5);
        x.fill();
        A(x, 1);
      }
    },
  },
  p_tiger: {
    draw(d) {
      const { x, R, c } = d;
      x.fillStyle = c.Sd;
      for (const sd of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const y0 = (-0.75 + i * 0.45) * R;
          const len = (0.42 + (i % 2) * 0.15) * R;
          x.beginPath();
          x.moveTo(sd * R * 1.2, y0 - R * 0.09);
          x.quadraticCurveTo(sd * (R * 1.1 - len * 0.5), y0 - R * 0.06, sd * (R * 1.05 - len), y0 + R * 0.04);
          x.quadraticCurveTo(sd * (R * 1.1 - len * 0.5), y0 + R * 0.06, sd * R * 1.2, y0 + R * 0.1);
          x.closePath();
          x.fill();
        }
      }
      // na testa
      for (const k of [-0.18, 0, 0.18]) {
        x.beginPath();
        x.moveTo((k - 0.06) * R, -R * 1.05);
        x.lineTo(k * R * 0.8, -R * (0.62 + Math.abs(k)));
        x.lineTo((k + 0.06) * R, -R * 1.05);
        x.closePath();
        x.fill();
      }
    },
  },
  p_scales: {
    draw(d) {
      const { x, R, c } = d;
      x.lineWidth = R * 0.035;
      const s = 0.27;
      for (let row = 0; row < 9; row++) {
        const yy = (-1.15 + row * s * 0.8) * R;
        const off = row % 2 ? s / 2 : 0;
        for (let col = -5; col <= 5; col++) {
          const xx = (col * s + off) * R;
          x.fillStyle = c.Sh;
          A(x, 0.18);
          x.beginPath();
          x.arc(xx, yy, s * 0.5 * R, 0, PI);
          x.fill();
          x.strokeStyle = c.S;
          A(x, 0.7);
          x.stroke();
        }
      }
      A(x, 1);
    },
  },
  p_circuit: {
    anim: true,
    draw(d) {
      const { x, R, c, t } = d;
      x.strokeStyle = c.S;
      x.lineWidth = R * 0.06;
      x.lineCap = 'round';
      x.lineJoin = 'round';
      A(x, 0.9);
      x.beginPath();
      for (const l of CIRCUIT) {
        x.moveTo(l[0] * R, l[1] * R);
        x.lineTo(l[2] * R, l[3] * R);
        x.lineTo(l[4] * R, l[5] * R);
      }
      x.stroke();
      A(x, 1);
      x.fillStyle = c.Sh;
      for (let i = 0; i < CIRCUIT.length; i++) {
        const l = CIRCUIT[i];
        circ(x, l[4] * R, l[5] * R, R * 0.055);
        x.fill();
        // pulso viajando
        const u = (t * 0.8 + i * 0.37) % 1;
        const k = u < 0.5 ? u * 2 : (u - 0.5) * 2;
        const px = u < 0.5 ? l[0] + (l[2] - l[0]) * k : l[2];
        const py = u < 0.5 ? l[1] : l[3] + (l[5] - l[3]) * k;
        glowAt(x, c.S.length === 7 ? mix(c.S, '#ffffff', 0.3) : '#ffffff', px * R, py * R, R * 0.2, 0.9);
      }
    },
  },
  p_runes: {
    anim: true,
    draw(d) {
      const { x, R, c, t } = d;
      const k = 0.65 + Math.sin(t * 2.5) * 0.3;
      x.save();
      x.translate(0, R * 0.3);
      x.strokeStyle = c.S;
      x.lineWidth = R * 0.04;
      A(x, 0.8 * k);
      circ(x, 0, 0, R * 0.62);
      x.stroke();
      circ(x, 0, 0, R * 0.44);
      x.stroke();
      x.rotate(t * 0.5);
      A(x, k);
      x.lineWidth = R * 0.04;
      x.lineCap = 'round';
      for (let i = 0; i < RUNES.length; i++) {
        const a = (i / RUNES.length) * TAU;
        x.save();
        x.rotate(a);
        x.translate(0, -R * 0.53);
        const g = RUNES[i];
        x.beginPath();
        for (let j = 0; j < g.length; j += 4) {
          x.moveTo(g[j] * R * 0.065, g[j + 1] * R * 0.065);
          x.lineTo(g[j + 2] * R * 0.065, g[j + 3] * R * 0.065);
        }
        x.stroke();
        x.restore();
      }
      x.restore();
      A(x, 1);
      glowAt(x, c.S, 0, R * 0.3, R * 0.9, 0.25 * k);
    },
  },
  p_cracks: {
    anim: true,
    draw(d) {
      const { x, R, c, t } = d;
      const k = 0.7 + Math.sin(t * 3.2) * 0.3;
      x.lineCap = 'round';
      x.lineJoin = 'round';
      for (const pass of [0, 1]) {
        x.strokeStyle = pass ? '#ffffff' : c.S;
        x.lineWidth = R * (pass ? 0.025 : 0.08);
        A(x, pass ? k : 0.8 * k);
        x.beginPath();
        for (const l of LIGHT_CRACKS) {
          x.moveTo(l[0] * R, l[1] * R);
          for (let i = 2; i < l.length; i += 2) x.lineTo(l[i] * R, l[i + 1] * R);
        }
        x.stroke();
      }
      A(x, 1);
      for (let i = 0; i < 3; i++) {
        const l = LIGHT_CRACKS[i * 2];
        glowAt(x, c.S, l[l.length - 2] * R, l[l.length - 1] * R, R * 0.3, 0.6 * k);
      }
    },
  },
};

/* ---------------------------- contornos ---------------------------- */

export function drawOutline(d: DC, m: Material): void {
  const { x, R, c, sh, pts, t } = d;
  const kind = m.outline;
  if (kind === 'none') return;
  x.lineJoin = 'round';
  x.lineCap = 'round';
  if (kind === 'marker') {
    // canetinha tremida (boil a ~6 fps)
    const f = Math.floor(t * 6) % 3;
    x.strokeStyle = '#2a2420';
    x.lineWidth = R * 0.08;
    tracePts(x, pts, R, sh.sharp, sh.jit[f], 1);
    x.stroke();
    x.lineWidth = R * 0.035;
    A(x, 0.55);
    tracePts(x, pts, R, sh.sharp, sh.jit[(f + 1) % 3], 1.4, R * 0.02, -R * 0.015);
    x.stroke();
    A(x, 1);
    return;
  }
  const col = m.line ? m.line(c) : c.outline;
  if (kind === 'fur') {
    x.strokeStyle = c.Pd;
    x.lineWidth = R * 0.05;
    tracePts(x, pts, R, sh.sharp);
    x.stroke();
    // tufos
    x.lineWidth = R * 0.06;
    for (let pass = 0; pass < 2; pass++) {
      x.strokeStyle = pass ? c.Pl : c.P;
      x.beginPath();
      for (let i = pass; i < NP; i += 2) {
        const px = pts[i * 2];
        const py = pts[i * 2 + 1];
        const l = Math.hypot(px, py) || 1;
        const w = Math.sin(t * 3 + i) * 0.02;
        x.moveTo(px * R * 0.94, py * R * 0.94);
        x.lineTo((px + (px / l) * 0.075 + w) * R, (py + (py / l) * 0.075) * R);
      }
      x.stroke();
    }
    return;
  }
  x.strokeStyle = col;
  if (kind === 'glow') {
    x.lineWidth = R * 0.14;
    A(x, 0.35);
    tracePts(x, pts, R, sh.sharp);
    x.stroke();
    A(x, 1);
    x.lineWidth = R * 0.045;
    x.stroke();
    return;
  }
  x.lineWidth = R * (kind === 'light' ? 0.045 : 0.065);
  tracePts(x, pts, R, sh.sharp, undefined, 0, 0, 0, 0.985);
  x.stroke();
}
