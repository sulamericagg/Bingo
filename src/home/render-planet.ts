/* ============================================================
 *  PLANETA + CASA (exterior) — tudo procedural, desenhado UMA vez
 *  num canvas em cache (por design+tamanho). O laço só faz drawImage.
 * ============================================================ */
import type { HomeDesign } from './api';
import { mulberry, num, pal, hashStr } from './catalog';
import { FINISHES, finishFill } from './paint';
import { INK, TAU, alpha, circ, ell, fs, heartPath, makeCanvas, rr, shade, star } from './gfx';

type Rec = Record<string, string | number>;

export const SKIES: [string, string, string][] = [
  ['#0d0a2e', '#2a1a63', '#5a3fb0'], ['#2b1240', '#8a3a6e', '#ff9a6a'], ['#3a2160', '#c46bd6', '#ffc0e6'], ['#04203a', '#0d5a8a', '#3fd0e0'],
  ['#061a2a', '#145a5a', '#5effb0'], ['#200808', '#6a1a12', '#ff6a2a'], ['#0a2a24', '#2a8a74', '#b8ffe0'], ['#1a0830', '#4a1a7a', '#a05cff'],
  ['#2a1a00', '#7a5208', '#ffd35a'], ['#000000', '#141428', '#3a3a6a'], ['#3a1a2a', '#c4607a', '#ffd0a0'], ['#05001a', '#3a0a6a', '#ff5cc8'],
];

/* ---------------- forma do planeta (raio por ângulo) ---------------- */
export function planetRad(shape: number, a: number): number {
  switch (shape) {
    case 1:
      return 1 + 0.06 * Math.sin(a * 7) + 0.03 * Math.sin(a * 3 + 1);
    case 2: {
      const k = Math.PI / 4;
      const d = ((a % k) + k) % k - k / 2;
      return 0.97 / Math.cos(d) * 0.94;
    }
    case 3: {
      const c = Math.abs(Math.cos(a)),
        s = Math.abs(Math.sin(a));
      return 1 / Math.pow(Math.pow(c, 4) + Math.pow(s, 4), 0.25) * 0.9;
    }
    case 4: {
      const up = a + Math.PI / 2;
      const dn = a - Math.PI / 2;
      const w = (x: number) => {
        x = Math.atan2(Math.sin(x), Math.cos(x));
        return x * x;
      };
      return 1 - 0.26 * Math.exp(-w(up) / 0.05) + 0.2 * Math.exp(-w(dn) / 0.12) + 0.05 * Math.sin(a);
    }
    case 5:
      return 1 + 0.07 * Math.abs(Math.sin(a * 4.5));
    default:
      return 1;
  }
}
function shapePath(c: CanvasRenderingContext2D, shape: number, R: number): void {
  c.beginPath();
  for (let i = 0; i <= 120; i++) {
    const a = (i / 120) * TAU;
    const r = R * planetRad(shape, a);
    c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  c.closePath();
}

/* ---------------- objetinhos na superfície (desenhados "em pé", base em 0,0, s = escala) ---------------- */
function drawVeg(c: CanvasRenderingContext2D, kind: number, s: number, col: string, r: () => number): void {
  const h = s * (0.8 + r() * 0.5);
  switch (kind) {
    case 1: // árvore redonda
      rr(c, -s * 0.08, -h * 0.6, s * 0.16, h * 0.62, 3);
      fs(c, '#8a5a3c', 1.5);
      circ(c, 0, -h * 0.75, s * 0.36);
      fs(c, shade(col, -0.1), 1.5);
      circ(c, -s * 0.1, -h * 0.85, s * 0.12);
      fs(c, alpha('#ffffff', 0.35));
      break;
    case 2: // pinheiro
      rr(c, -s * 0.06, -h * 0.3, s * 0.12, h * 0.32, 2);
      fs(c, '#6a432c', 1.5);
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.moveTo(-s * (0.36 - i * 0.08), -h * (0.25 + i * 0.25));
        c.lineTo(0, -h * (0.62 + i * 0.25));
        c.lineTo(s * (0.36 - i * 0.08), -h * (0.25 + i * 0.25));
        c.closePath();
        fs(c, shade('#2fb39a', -0.15 + i * 0.1), 1.5);
      }
      break;
    case 3: // coqueiro
      c.beginPath();
      c.moveTo(-s * 0.05, 0);
      c.quadraticCurveTo(s * 0.15, -h * 0.5, s * 0.05, -h);
      c.lineWidth = s * 0.12;
      c.strokeStyle = '#a8784a';
      c.stroke();
      for (let i = 0; i < 5; i++) {
        c.save();
        c.translate(s * 0.05, -h);
        c.rotate(-2.6 + i * 0.75);
        ell(c, s * 0.28, 0, s * 0.3, s * 0.08);
        fs(c, '#4fd67a', 1.2);
        c.restore();
      }
      break;
    case 4: // cogumelo
      rr(c, -s * 0.09, -h * 0.5, s * 0.18, h * 0.52, 4);
      fs(c, '#fff2e0', 1.5);
      c.beginPath();
      c.ellipse(0, -h * 0.5, s * 0.34, s * 0.26, 0, Math.PI, 0);
      c.closePath();
      fs(c, col, 1.5);
      circ(c, -s * 0.12, -h * 0.6, s * 0.05);
      fs(c, '#fff');
      circ(c, s * 0.1, -h * 0.66, s * 0.06);
      fs(c, '#fff');
      break;
    case 5: // pirulito
      c.fillStyle = '#fff';
      c.fillRect(-s * 0.03, -h * 0.75, s * 0.06, h * 0.75);
      circ(c, 0, -h * 0.85, s * 0.26);
      fs(c, col, 1.5);
      c.beginPath();
      c.arc(0, -h * 0.85, s * 0.14, 0, Math.PI * 1.5);
      c.strokeStyle = '#fff';
      c.lineWidth = s * 0.06;
      c.stroke();
      break;
    case 6: // cristais
      for (let i = -1; i <= 1; i++) {
        c.beginPath();
        c.moveTo(i * s * 0.16 - s * 0.08, 0);
        c.lineTo(i * s * 0.16, -h * (i ? 0.6 : 0.95));
        c.lineTo(i * s * 0.16 + s * 0.08, 0);
        c.closePath();
        fs(c, shade(col, 0.3 - Math.abs(i) * 0.2), 1.3);
      }
      break;
  }
}

function drawDecor(c: CanvasRenderingContext2D, kind: number, s: number, col: string): void {
  switch (kind) {
    case 1:
      drawVeg(c, 1, s, '#4fd67a', () => 0.5);
      break;
    case 2:
      ell(c, 0, -s * 0.16, s * 0.3, s * 0.2);
      fs(c, '#a49cbf', 1.5);
      ell(c, -s * 0.08, -s * 0.24, s * 0.1, s * 0.05);
      fs(c, alpha('#ffffff', 0.5));
      break;
    case 3:
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * s * 0.18;
        c.strokeStyle = '#2fb39a';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(x, 0);
        c.lineTo(x, -s * 0.35);
        c.stroke();
        star(c, x, -s * 0.4, s * 0.12, 5, 0.55);
        fs(c, ['#ff7ad9', '#ffc93d', '#46d9e6'][i], 1.2);
      }
      break;
    case 4:
      c.fillStyle = INK;
      c.fillRect(-s * 0.04, -s * 0.9, s * 0.08, s * 0.9);
      circ(c, 0, -s * 0.95, s * 0.13);
      fs(c, '#ffe680', 1.5);
      break;
    case 5:
      rr(c, -s * 0.2, -s * 0.2, s * 0.4, s * 0.2, 3);
      fs(c, '#d5d0e8', 1.5);
      circ(c, 0, -s * 0.5, s * 0.22);
      fs(c, col, 1.5);
      circ(c, -s * 0.07, -s * 0.53, s * 0.03);
      fs(c, INK);
      circ(c, s * 0.07, -s * 0.53, s * 0.03);
      fs(c, INK);
      break;
    case 6:
      c.fillStyle = '#f5e6c8';
      c.fillRect(-s * 0.05, -s * 0.8, s * 0.1, s * 0.8);
      for (let i = 0; i < 4; i++) {
        c.save();
        c.translate(0, -s * 0.8);
        c.rotate(i * (Math.PI / 2) + 0.3);
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(s * 0.35, -s * 0.08);
        c.lineTo(s * 0.35, s * 0.06);
        c.closePath();
        fs(c, i % 2 ? col : '#fff', 1.2);
        c.restore();
      }
      break;
    case 7:
      ell(c, 0, -s * 0.12, s * 0.34, s * 0.14);
      fs(c, '#d5d0e8', 1.5);
      ell(c, 0, -s * 0.16, s * 0.26, s * 0.07);
      fs(c, '#46d9e6');
      c.fillStyle = alpha('#46d9e6', 0.8);
      c.fillRect(-s * 0.03, -s * 0.5, s * 0.06, s * 0.36);
      circ(c, 0, -s * 0.52, s * 0.07);
      fs(c, '#bff6ff');
      break;
    case 8:
      c.strokeStyle = '#8a5a3c';
      c.lineWidth = s * 0.06;
      c.beginPath();
      c.moveTo(-s * 0.3, 0);
      c.lineTo(-s * 0.2, -s * 0.8);
      c.lineTo(s * 0.2, -s * 0.8);
      c.lineTo(s * 0.3, 0);
      c.stroke();
      c.lineWidth = 1.5;
      c.strokeStyle = INK;
      c.beginPath();
      c.moveTo(-s * 0.08, -s * 0.8);
      c.lineTo(-s * 0.08, -s * 0.3);
      c.moveTo(s * 0.08, -s * 0.8);
      c.lineTo(s * 0.08, -s * 0.3);
      c.stroke();
      rr(c, -s * 0.12, -s * 0.32, s * 0.24, s * 0.06, 2);
      fs(c, col, 1);
      break;
    case 9:
      c.beginPath();
      c.moveTo(0, -s * 1.0);
      c.quadraticCurveTo(s * 0.2, -s * 0.6, s * 0.14, -s * 0.1);
      c.lineTo(-s * 0.14, -s * 0.1);
      c.quadraticCurveTo(-s * 0.2, -s * 0.6, 0, -s * 1.0);
      fs(c, '#ffffff', 1.5);
      circ(c, 0, -s * 0.55, s * 0.07);
      fs(c, '#46d9e6', 1);
      c.beginPath();
      c.moveTo(-s * 0.14, -s * 0.1);
      c.lineTo(-s * 0.25, s * 0.02);
      c.lineTo(-s * 0.1, -s * 0.25);
      fs(c, col, 1);
      c.beginPath();
      c.moveTo(s * 0.14, -s * 0.1);
      c.lineTo(s * 0.25, s * 0.02);
      c.lineTo(s * 0.1, -s * 0.25);
      fs(c, col, 1);
      break;
    case 10:
      drawVeg(c, 6, s * 1.1, col, () => 0.6);
      break;
    case 11:
      rr(c, -s * 0.16, -s * 0.45, s * 0.32, s * 0.45, 6);
      fs(c, '#fff2e0', 1.5);
      rr(c, -s * 0.06, -s * 0.22, s * 0.12, s * 0.22, 4);
      fs(c, '#8a5a3c', 1);
      c.beginPath();
      c.ellipse(0, -s * 0.45, s * 0.36, s * 0.3, 0, Math.PI, 0);
      c.closePath();
      fs(c, col, 1.5);
      break;
    case 12:
      c.fillStyle = INK;
      c.fillRect(-s * 0.02, -s * 0.9, s * 0.04, s * 0.9);
      c.beginPath();
      c.moveTo(s * 0.02, -s * 0.9);
      c.quadraticCurveTo(s * 0.25, -s * 0.85, s * 0.42, -s * 0.78);
      c.lineTo(s * 0.02, -s * 0.6);
      c.closePath();
      fs(c, col, 1.2);
      break;
    case 13:
      circ(c, 0, -s * 0.2, s * 0.22);
      fs(c, '#ffffff', 1.5);
      circ(c, 0, -s * 0.55, s * 0.16);
      fs(c, '#ffffff', 1.5);
      c.beginPath();
      c.moveTo(0, -s * 0.55);
      c.lineTo(s * 0.18, -s * 0.52);
      c.lineTo(0, -s * 0.5);
      fs(c, '#ff8a3d');
      c.fillStyle = col;
      c.fillRect(-s * 0.18, -s * 0.42, s * 0.36, s * 0.05);
      break;
  }
}

/* ---------------- texturas do terreno ---------------- */
function terrainTex(c: CanvasRenderingContext2D, kind: number, R: number, col: string, r: () => number): void {
  const lite = shade(col, 0.35);
  const dark = shade(col, -0.25);
  switch (kind) {
    case 0:
      c.strokeStyle = lite;
      c.lineWidth = Math.max(1, R * 0.015);
      for (let i = 0; i < 40; i++) {
        const x = (r() * 2 - 1) * R,
          y = (r() * 2 - 1) * R;
        c.beginPath();
        c.moveTo(x - R * 0.02, y);
        c.lineTo(x, y - R * 0.04);
        c.lineTo(x + R * 0.02, y);
        c.stroke();
      }
      break;
    case 1:
      c.strokeStyle = dark;
      c.lineWidth = Math.max(1, R * 0.02);
      for (let i = 0; i < 9; i++) {
        const y = -R + (i / 8) * 2 * R;
        c.beginPath();
        c.arc(r() * R - R / 2, y + R * 0.3, R * 0.4, Math.PI * 1.2, Math.PI * 1.8);
        c.stroke();
      }
      break;
    case 2:
      c.fillStyle = '#ffffff';
      for (let i = 0; i < 7; i++) {
        ell(c, (r() * 2 - 1) * R * 0.8, (r() * 2 - 1) * R * 0.8, R * (0.18 + r() * 0.2), R * (0.08 + r() * 0.08));
        c.fill();
      }
      break;
    case 3:
      c.strokeStyle = alpha('#ffffff', 0.7);
      c.lineWidth = R * 0.09;
      for (let i = -6; i < 6; i++) {
        c.beginPath();
        c.moveTo(i * R * 0.35, -R * 1.2);
        c.lineTo(i * R * 0.35 + R * 1.2, R * 1.2);
        c.stroke();
      }
      break;
    case 4:
      for (let i = 0; i < 9; i++) {
        const x = (r() * 2 - 1) * R * 0.8,
          y = (r() * 2 - 1) * R * 0.8,
          q = R * (0.06 + r() * 0.12);
        circ(c, x, y, q);
        c.fillStyle = dark;
        c.fill();
        circ(c, x - q * 0.2, y - q * 0.2, q * 0.7);
        c.fillStyle = shade(col, -0.1);
        c.fill();
      }
      break;
    case 5:
      c.strokeStyle = '#ff8a3d';
      c.lineWidth = Math.max(1.5, R * 0.025);
      c.lineJoin = 'round';
      for (let i = 0; i < 6; i++) {
        let x = (r() * 2 - 1) * R * 0.8,
          y = (r() * 2 - 1) * R * 0.8;
        c.beginPath();
        c.moveTo(x, y);
        for (let k = 0; k < 4; k++) {
          x += (r() - 0.5) * R * 0.35;
          y += (r() - 0.5) * R * 0.35;
          c.lineTo(x, y);
        }
        c.stroke();
      }
      break;
    case 6:
      for (let i = 0; i < 14; i++) {
        const x = (r() * 2 - 1) * R,
          y = (r() * 2 - 1) * R,
          q = R * (0.1 + r() * 0.15);
        c.beginPath();
        c.moveTo(x, y - q);
        c.lineTo(x + q * 0.7, y);
        c.lineTo(x, y + q);
        c.lineTo(x - q * 0.7, y);
        c.closePath();
        c.fillStyle = i % 2 ? alpha('#ffffff', 0.3) : alpha(dark, 0.5);
        c.fill();
      }
      break;
    case 7:
      for (let i = 0; i < 16; i++) {
        circ(c, (r() * 2 - 1) * R, (r() * 2 - 1) * R, R * (0.05 + r() * 0.12));
        c.fillStyle = i % 2 ? dark : lite;
        c.fill();
      }
      break;
    case 8:
      for (let i = 0; i < 12; i++) {
        circ(c, (r() * 2 - 1) * R * 0.85, (r() * 2 - 1) * R * 0.85, R * (0.04 + r() * 0.1));
        c.fillStyle = shade(col, -0.3);
        c.fill();
      }
      break;
    case 9: {
      const q = R * 0.25;
      c.fillStyle = alpha('#ffffff', 0.35);
      for (let x = -5; x < 5; x++) for (let y = -5; y < 5; y++) if ((x + y) & 1) c.fillRect(x * q, y * q, q, q);
      break;
    }
  }
}

/* ---------------- cena completa ---------------- */
export interface PlanetOpts {
  name?: string;
  mess?: number; // 0..1 sujeira (pinta respingos na casa)
  stars?: boolean; // fundo com estrelas e céu
}

/** Desenha o planeta + casa centrado em (cx, cy) com raio R. */
export function drawPlanetScene(c: CanvasRenderingContext2D, d: HomeDesign, cx: number, cy: number, R: number, o: PlanetOpts = {}): void {
  const P = d.planet as Rec;
  const seed = hashStr(JSON.stringify(P));
  const r = mulberry(seed);
  const shape = num(P, 'shape');
  R *= [0.82, 0.92, 1, 1.08][num(P, 'size')] ?? 1;
  const tcol = pal(P.tcol);
  const sky = SKIES[num(P, 'sky')] ?? SKIES[0];
  const rcol = pal(P.rcol);
  const ring = num(P, 'ring');
  const tilt = -0.18;

  c.save();
  c.translate(cx, cy);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  // atmosfera
  const g = c.createRadialGradient(0, 0, R * 0.9, 0, 0, R * 1.5);
  g.addColorStop(0, alpha(sky[2], 0.55));
  g.addColorStop(1, alpha(sky[2], 0));
  c.fillStyle = g;
  circ(c, 0, 0, R * 1.5);
  c.fill();

  // luas atrás (metade)
  const moons = num(P, 'moons');
  for (let i = 0; i < moons; i++) {
    const a = -0.6 + i * 2.3 + r() * 0.4;
    const mr = R * (0.12 + i * 0.03);
    const mx = Math.cos(a) * R * 1.55,
      my = Math.sin(a) * R * 1.2;
    circ(c, mx, my, mr);
    fs(c, i === 1 ? '#ffd0a0' : '#e8e2ff', 1.5);
    circ(c, mx - mr * 0.3, my + mr * 0.1, mr * 0.25);
    fs(c, alpha(INK, 0.15));
    circ(c, mx + mr * 0.35, my - mr * 0.3, mr * 0.15);
    fs(c, alpha(INK, 0.15));
  }

  // anel (metade de trás)
  if (ring) drawRing(c, ring, R, rcol, tilt, true);

  // corpo
  shapePath(c, shape, R);
  const bg = c.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R * 1.1);
  bg.addColorStop(0, shade(tcol, 0.25));
  bg.addColorStop(1, shade(tcol, -0.2));
  c.fillStyle = bg;
  c.fill();
  c.save();
  shapePath(c, shape, R);
  c.clip();
  const terr = num(P, 'terrain');
  if (terr === 5) {
    c.fillStyle = alpha('#2a0b0b', 0.35);
    c.fillRect(-R * 1.2, -R * 1.2, R * 2.4, R * 2.4);
  }
  terrainTex(c, terr, R, tcol, r);
  // água
  const water = num(P, 'water');
  if (water === 1) {
    ell(c, R * 0.25, R * 0.35, R * 0.35, R * 0.2);
    fs(c, '#3fa0ff');
    ell(c, R * 0.18, R * 0.3, R * 0.15, R * 0.05);
    fs(c, alpha('#ffffff', 0.5));
  } else if (water === 2) {
    c.strokeStyle = '#46b4ff';
    c.lineWidth = R * 0.08;
    for (let k = 0; k < 2; k++) {
      c.beginPath();
      c.moveTo(-R, R * (0.1 + k * 0.35));
      c.bezierCurveTo(-R * 0.3, R * (-0.2 + k * 0.4), R * 0.2, R * (0.5 + k * 0.2), R, R * (0.1 + k * 0.3));
      c.stroke();
    }
  } else if (water === 3) {
    c.fillStyle = '#2f8cff';
    c.fillRect(-R * 1.3, R * 0.35, R * 2.6, R);
    c.strokeStyle = alpha('#ffffff', 0.6);
    c.lineWidth = 2;
    for (let k = 0; k < 4; k++) {
      c.beginPath();
      c.arc(-R * 0.6 + k * R * 0.4, R * 0.55, R * 0.08, Math.PI, 0);
      c.stroke();
    }
  } else if (water === 4) {
    for (let k = 0; k < 3; k++) {
      ell(c, (k - 1) * R * 0.5, R * (0.3 + (k % 2) * 0.25), R * 0.28, R * 0.14);
      fs(c, alpha('#d8f6ff', 0.9));
    }
  }
  // caminho
  const path = num(P, 'path');
  if (path) drawPath(c, path, R);
  // sombra (terminador) e brilho
  const sh = c.createRadialGradient(-R * 0.5, -R * 0.6, R * 0.4, -R * 0.2, -R * 0.2, R * 1.7);
  sh.addColorStop(0, 'rgba(255,255,255,0.12)');
  sh.addColorStop(0.55, 'rgba(20,0,50,0)');
  sh.addColorStop(1, 'rgba(20,0,50,0.45)');
  c.fillStyle = sh;
  c.fillRect(-R * 1.3, -R * 1.3, R * 2.6, R * 2.6);
  c.restore();
  shapePath(c, shape, R);
  c.lineWidth = Math.max(2, R * 0.025);
  c.strokeStyle = INK;
  c.stroke();

  // vegetação ao redor (borda)
  const veg = num(P, 'veg');
  const vegCol = ['#4fd67a', '#4fd67a', '#2fb39a', '#4fd67a', '#ff5c7a', '#ff7ad9', '#46d9e6'][veg] ?? '#4fd67a';
  const vegAngles = [-0.25, 0.35, 0.75, 1.2, 1.6, 2.0, 2.4, 2.9, 3.4];
  if (veg)
    for (let i = 0; i < vegAngles.length; i++) {
      const a = vegAngles[i] + (r() - 0.5) * 0.12;
      placeOnSurface(c, shape, R, a, () => drawVeg(c, veg, R * 0.24, i % 2 ? vegCol : shade(vegCol, 0.15), r));
    }
  // enfeites (6 posições ao lado da casa)
  const DA = [-Math.PI / 2 - 0.62, -Math.PI / 2 + 0.62, -Math.PI / 2 - 0.98, -Math.PI / 2 + 0.98, -Math.PI / 2 - 1.34, -Math.PI / 2 + 1.34];
  for (let i = 0; i < 6; i++) {
    const k = num(P, 'd' + i);
    if (k) placeOnSurface(c, shape, R, DA[i], () => drawDecor(c, k, R * 0.26, PALETTE_DECO[(i + k) % PALETTE_DECO.length]));
  }

  // casa no topo
  const topR = R * planetRad(shape, -Math.PI / 2);
  c.save();
  c.translate(0, -topR + R * 0.04);
  const hs = R / 150;
  c.scale(hs, hs);
  drawHouse(c, d.exterior as Rec, o.name ?? '', R / hs, o.mess ?? 0);
  c.restore();

  // nuvens
  const clouds = num(P, 'clouds');
  if (clouds) {
    const n = clouds === 1 ? 2 : 4;
    for (let i = 0; i < n; i++) {
      const a = 0.3 + i * 1.5 + r() * 0.3;
      const x = Math.cos(a) * R * 1.05,
        y = Math.sin(a) * R * 0.95;
      const col = clouds === 3 ? ['#ffb3c7', '#bff6ff', '#fff27a', '#d2bdff'][i] : '#ffffff';
      c.fillStyle = alpha(col, 0.92);
      circ(c, x, y, R * 0.11);
      c.fill();
      circ(c, x + R * 0.12, y + R * 0.02, R * 0.09);
      c.fill();
      circ(c, x - R * 0.12, y + R * 0.03, R * 0.08);
      c.fill();
    }
  }
  // anel (frente)
  if (ring) drawRing(c, ring, R, rcol, tilt, false);
  c.restore();
}
const PALETTE_DECO = ['#ff5c7a', '#46d9e6', '#ffc93d', '#8a5cff', '#4fd67a', '#ff8a3d'];

function placeOnSurface(c: CanvasRenderingContext2D, shape: number, R: number, a: number, fn: () => void): void {
  const rr2 = R * planetRad(shape, a) * 0.985;
  c.save();
  c.translate(Math.cos(a) * rr2, Math.sin(a) * rr2);
  c.rotate(a + Math.PI / 2);
  c.lineWidth = 1.5;
  c.strokeStyle = INK;
  fn();
  c.restore();
}

function drawRing(c: CanvasRenderingContext2D, kind: number, R: number, col: string, tilt: number, back: boolean): void {
  c.save();
  c.rotate(tilt);
  const a0 = back ? Math.PI : 0,
    a1 = back ? TAU : Math.PI;
  const band = (rx: number, w: number, color: string) => {
    c.beginPath();
    c.ellipse(0, 0, rx, rx * 0.22, 0, a0, a1);
    c.lineWidth = w + 3;
    c.strokeStyle = INK;
    c.stroke();
    c.lineWidth = w;
    c.strokeStyle = color;
    c.stroke();
  };
  if (kind === 1) band(R * 1.45, R * 0.05, col);
  else if (kind === 2) band(R * 1.5, R * 0.16, col);
  else if (kind === 3) {
    band(R * 1.38, R * 0.07, col);
    band(R * 1.62, R * 0.05, shade(col, 0.35));
  } else if (kind === 4) {
    for (let i = 0; i < 26; i++) {
      const a = a0 + ((i + 0.5) / 26) * Math.PI;
      circ(c, Math.cos(a) * R * 1.5, Math.sin(a) * R * 1.5 * 0.22, R * 0.035);
      fs(c, col, 1);
    }
  } else if (kind === 5) {
    const cols = ['#ff5c7a', '#ffc93d', '#4fd67a', '#3fa0ff', '#8a5cff'];
    for (let i = 0; i < 5; i++) {
      c.beginPath();
      c.ellipse(0, 0, R * (1.35 + i * 0.06), R * (1.35 + i * 0.06) * 0.22, 0, a0, a1);
      c.lineWidth = R * 0.05;
      c.strokeStyle = cols[i];
      c.stroke();
    }
  }
  c.restore();
}

function drawPath(c: CanvasRenderingContext2D, kind: number, R: number): void {
  c.save();
  if (kind === 1) {
    for (let i = 0; i < 7; i++) {
      ell(c, Math.sin(i * 0.9) * R * 0.12, -R * 0.8 + i * R * 0.24, R * 0.07, R * 0.045);
      fs(c, '#d5d0e8', 1);
    }
  } else if (kind === 2) {
    c.beginPath();
    for (let i = 0; i < 80; i++) {
      const a = i * 0.2,
        q = R * 0.85 * (1 - i / 80);
      c.lineTo(Math.cos(a - Math.PI / 2) * q, Math.sin(a - Math.PI / 2) * q);
    }
    c.lineWidth = R * 0.05;
    c.strokeStyle = alpha('#f5e6c8', 0.85);
    c.stroke();
  } else if (kind === 3) {
    for (let i = 0; i < 6; i++) {
      ell(c, (i % 2 ? 1 : -1) * R * 0.08, -R * 0.75 + i * R * 0.28, R * 0.05, R * 0.07);
      fs(c, '#8a5a3c', 1);
    }
  } else if (kind === 4) {
    const cols = ['#ff5c7a', '#ffc93d', '#4fd67a', '#3fa0ff'];
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.moveTo(-R * 0.06 + i * R * 0.04, -R);
      c.quadraticCurveTo(-R * 0.5, 0, R * 0.2 + i * R * 0.04, R);
      c.lineWidth = R * 0.04;
      c.strokeStyle = cols[i];
      c.stroke();
    }
  }
  c.restore();
}

/* ============================================================
 *  CASA — origem na base (0,0), unidades: largura do corpo = 100.
 *  Rc = raio do planeta nas mesmas unidades (itens do quintal seguem a curva).
 * ============================================================ */
export function drawHouse(c: CanvasRenderingContext2D, E: Rec, name: string, Rc: number, mess: number): void {
  const floors = num(E, 'floors') + 1;
  const FH = 46;
  const W = 100;
  const H = floors * FH;
  const wcol = pal(E.wcol);
  const rf = pal(E.rfcol);
  const dcol = pal(E.dcol);
  const wf = pal(E.wfcol);
  const fcol = pal(E.fcol);
  const found = num(E, 'found');
  const lift = found === 3 ? 10 : found === 1 ? 12 : 0;
  c.lineJoin = 'round';
  c.lineCap = 'round';

  const yard = (x: number, fn: () => void) => {
    const a = x / Rc;
    c.save();
    c.translate(Math.sin(a) * Rc, -(Math.cos(a) * Rc - Rc) + 4);
    c.rotate(a);
    fn();
    c.restore();
  };

  // torre/anexo atrás à direita
  const tower = num(E, 'tower');
  if (tower) {
    c.save();
    c.translate(W * 0.5 + 6, -lift);
    const th = tower === 3 ? FH * 0.8 : H + 26;
    if (tower === 1 || tower === 4) {
      rr(c, -14, -th, 30, th + 6, 6);
      fs(c, shade(wcol, -0.12), 2);
      if (tower === 4) {
        c.beginPath();
        c.arc(1, -th, 17, Math.PI, 0);
        c.closePath();
        fs(c, '#d5d0e8', 2);
        c.save();
        c.translate(1, -th - 8);
        c.rotate(-0.6);
        rr(c, -3, -14, 8, 16, 2);
        fs(c, '#5866f0', 1.5);
        c.restore();
      } else {
        c.beginPath();
        c.moveTo(-20, -th);
        c.lineTo(1, -th - 30);
        c.lineTo(22, -th);
        c.closePath();
        fs(c, shade(rf, -0.1), 2);
      }
      circ(c, 1, -th + 18, 6);
      fs(c, '#bff6ff', 1.5);
    } else if (tower === 2) {
      rr(c, -14, -th, 30, th + 6, 2);
      fs(c, shade(wcol, -0.12), 2);
      for (let i = 0; i < 4; i++) {
        c.fillStyle = shade(wcol, -0.12);
        c.fillRect(-14 + i * 8, -th - 7, 6, 8);
        c.strokeStyle = INK;
        c.lineWidth = 1.5;
        c.strokeRect(-14 + i * 8, -th - 7, 6, 8);
      }
      rr(c, -5, -th + 12, 12, 14, 3);
      fs(c, '#bff6ff', 1.5);
    } else {
      rr(c, -6, -th, 44, th + 6, 4);
      fs(c, shade(wcol, -0.12), 2);
      rr(c, 0, -th + 10, 32, th - 4, 3);
      fs(c, '#d5d0e8', 1.5);
      for (let i = 1; i < 4; i++) {
        c.beginPath();
        c.moveTo(0, -th + 10 + i * 8);
        c.lineTo(32, -th + 10 + i * 8);
        c.strokeStyle = alpha(INK, 0.4);
        c.lineWidth = 1;
        c.stroke();
      }
      rr(c, -8, -th - 6, 48, 8, 3);
      fs(c, rf, 2);
    }
    c.restore();
  }

  // base
  c.save();
  c.translate(0, -lift);
  if (found === 0) {
    rr(c, -W / 2 - 6, -4, W + 12, 18, 4);
    fs(c, '#a49cbf', 2);
    c.fillStyle = alpha(INK, 0.15);
    for (let i = 0; i < 5; i++) c.fillRect(-W / 2 + i * 22, 2, 12, 4);
  } else if (found === 1) {
    for (let i = 0; i < 4; i++) {
      rr(c, -W / 2 + 4 + i * 28, -2, 7, lift + 14, 2);
      fs(c, '#8a5a3c', 1.5);
    }
    rr(c, -W / 2 - 4, -4, W + 8, 7, 2);
    fs(c, '#c89a6a', 2);
  } else if (found === 2) {
    rr(c, -W / 2 - 4, -4, W + 8, 16, 2);
    fs(c, '#c4553a', 2);
    c.strokeStyle = alpha('#ffe0d0', 0.6);
    c.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      c.beginPath();
      c.moveTo(-W / 2 + i * 12 + (i % 2) * 4, -4);
      c.lineTo(-W / 2 + i * 12 + (i % 2) * 4, 12);
      c.stroke();
    }
  } else if (found === 3) {
    ell(c, 0, 10, W * 0.5, 7);
    fs(c, alpha('#5ef0ff', 0.45));
    ell(c, 0, 4, W * 0.55, 6);
    fs(c, '#d5d0e8', 2);
  } else {
    c.beginPath();
    c.moveTo(-W / 2 - 6, -4);
    c.lineTo(W / 2 + 6, -4);
    c.lineTo(W / 2 - 6, 14);
    c.lineTo(-W / 2 + 6, 14);
    c.closePath();
    fs(c, '#9ffcff', 2);
    c.fillStyle = alpha('#ffffff', 0.5);
    c.fillRect(-W / 2, -2, W * 0.4, 3);
  }

  // paredes
  const wall = num(E, 'wall');
  rr(c, -W / 2, -H, W, H, 4);
  c.fillStyle = wcol;
  c.fill();
  c.save();
  rr(c, -W / 2, -H, W, H, 4);
  c.clip();
  const fin = num(E, 'wfin');
  if (fin) {
    c.save();
    c.translate(-W / 2, -H);
    c.fillStyle = finishFill(c, Number(E.wcol) || 0, FINISHES[fin] ?? 'solid', H);
    c.globalAlpha = 0.9;
    c.fillRect(0, 0, W, H);
    c.restore();
  }
  wallTex(c, wall, W, H, wcol);
  // sombra lateral
  c.fillStyle = alpha(INK, 0.12);
  c.fillRect(W / 2 - 14, -H, 14, H);
  c.restore();
  rr(c, -W / 2, -H, W, H, 4);
  c.lineWidth = 2.5;
  c.strokeStyle = INK;
  c.stroke();
  for (let f = 1; f < floors; f++) {
    c.fillStyle = shade(wcol, -0.25);
    c.fillRect(-W / 2, -f * FH - 2, W, 4);
  }

  // janelas
  const win = num(E, 'win');
  const wn = num(E, 'wn') + 1;
  const lights = num(E, 'lights');
  for (let f = 0; f < floors; f++) {
    const slots: number[] = [];
    if (f === 0) {
      // térreo: janelas nas laterais da porta
      const side = Math.max(1, Math.ceil(wn / 2));
      for (let i = 0; i < side; i++) {
        slots.push(-W / 2 + 12 + i * (26 / side) + 4);
        if (slots.length < wn) slots.push(W / 2 - 16 - i * (26 / side) - 4);
      }
    } else for (let i = 0; i < wn; i++) slots.push(-W / 2 + (W / (wn + 1)) * (i + 1));
    for (const x of slots.slice(0, wn)) drawWindow(c, win, x, -f * FH - FH * 0.58, wn >= 4 ? 12 : 15, wf, lights === 1);
  }

  // sacada
  const balc = num(E, 'balc');
  if (balc && floors > 1) {
    const y = -FH - 2;
    if (balc === 3) {
      c.beginPath();
      c.ellipse(0, y, 30, 8, 0, 0, Math.PI);
      c.closePath();
      fs(c, '#d5d0e8', 2);
    } else {
      rr(c, -30, y - 3, 60, 6, 2);
      fs(c, '#d5d0e8', 2);
    }
    if (balc === 1) {
      c.strokeStyle = INK;
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(-30, y - 14);
      c.lineTo(30, y - 14);
      for (let i = 0; i <= 8; i++) {
        c.moveTo(-30 + i * 7.5, y - 14);
        c.lineTo(-30 + i * 7.5, y - 3);
      }
      c.stroke();
    } else if (balc === 2) {
      rr(c, -28, y - 12, 56, 9, 3);
      fs(c, '#8a5a3c', 1.5);
      for (let i = 0; i < 6; i++) {
        circ(c, -24 + i * 9.5, y - 14, 4);
        fs(c, ['#ff5c7a', '#ffc93d', '#ff7ad9'][i % 3], 1);
      }
    }
  }

  // porta
  const door = num(E, 'door');
  drawDoor(c, door, 0, 0, dcol);

  // varanda
  const porch = num(E, 'porch');
  if (porch === 1) {
    rr(c, -16, -2, 32, 5, 2);
    fs(c, '#d5d0e8', 1.5);
    rr(c, -20, 3, 40, 5, 2);
    fs(c, '#a49cbf', 1.5);
  } else if (porch === 2) {
    c.beginPath();
    c.moveTo(-22, -40);
    c.lineTo(22, -40);
    c.lineTo(26, -30);
    c.lineTo(-26, -30);
    c.closePath();
    fs(c, rf, 2);
    c.fillStyle = '#fff';
    for (let i = 0; i < 6; i++) c.fillRect(-24 + i * 9, -30, 4, 3);
  } else if (porch === 3) {
    for (const x of [-22, 18]) {
      rr(c, x, -40, 5, 40, 2);
      fs(c, '#ffffff', 1.5);
    }
    rr(c, -26, -44, 52, 6, 2);
    fs(c, '#ffffff', 2);
  }

  // telhado
  drawRoof(c, num(E, 'roof'), W, H, rf, num(E, 'chim'));

  // luzes
  if (lights === 2) {
    c.strokeStyle = INK;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(-W / 2, -H + 4);
    c.quadraticCurveTo(0, -H + 14, W / 2, -H + 4);
    c.stroke();
    for (let i = 0; i < 9; i++) {
      const tt = i / 8;
      const x = -W / 2 + tt * W;
      const y = -H + 4 + 2 * tt * (1 - tt) * 10 * 2 * 0.5 + 2;
      circ(c, x, y + 2, 2.6);
      fs(c, ['#ff5c7a', '#ffc93d', '#4fd67a', '#46d9e6'][i % 4]);
    }
  } else if (lights === 3) {
    rr(c, -W / 2 - 2, -H - 2, W + 4, H + 4, 6);
    c.lineWidth = 3;
    c.strokeStyle = alpha('#ff7ad9', 0.9);
    c.stroke();
    c.lineWidth = 1;
    c.strokeStyle = '#ffffff';
    c.stroke();
  } else if (lights === 4) {
    for (let i = 0; i < 6; i++) {
      star(c, -W / 2 + 8 + i * 17, -H - 8 - (i % 2) * 6, 4, 5, 0.45);
      fs(c, '#fff27a', 1);
    }
  }
  if (mess > 0.02) {
    const r = mulberry(7);
    const n = Math.round(2 + mess * 8);
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + 8 + r() * (W - 16),
        y = -H + 10 + r() * (H - 16);
      splatShape(c, x, y, 4 + r() * 5, ['#ff7ad9', '#ffffff', '#ff5c7a', '#ffc93d', '#8a5a3c'][i % 5], r);
    }
  }
  c.restore();

  // quintal: jardim, cerca, placa, correio (seguindo a curva)
  const garden = num(E, 'garden');
  if (garden)
    for (const x of [-W / 2 - 18, W / 2 + 16]) {
      yard(x, () => drawGarden(c, garden, x < 0 ? 0 : 1));
    }
  const fence = num(E, 'fence');
  if (fence)
    for (let i = 0; i < 6; i++) {
      const x = (i < 3 ? -1 : 1) * (W / 2 + 32 + (i % 3) * 13);
      yard(x, () => drawFence(c, fence, fcol));
    }
  const sign = num(E, 'sign');
  if (sign) yard(-W / 2 - 46 - (fence ? 30 : 0), () => drawSign(c, sign, name));
  const mail = num(E, 'mail');
  if (mail) yard(W / 2 + 40 + (fence ? 30 : 0), () => drawMailbox(c, mail));
}

export function splatShape(c: CanvasRenderingContext2D, x: number, y: number, s: number, col: string, r: () => number): void {
  c.fillStyle = col;
  circ(c, x, y, s);
  c.fill();
  for (let k = 0; k < 6; k++) {
    const a = r() * TAU,
      d = s * (0.8 + r() * 0.7);
    circ(c, x + Math.cos(a) * d, y + Math.sin(a) * d, s * (0.2 + r() * 0.35));
    c.fill();
  }
}

function wallTex(c: CanvasRenderingContext2D, k: number, W: number, H: number, col: string): void {
  const d = shade(col, -0.18);
  const l = shade(col, 0.25);
  c.lineWidth = 1.2;
  if (k === 1) {
    c.strokeStyle = d;
    for (let y = 0; y < H; y += 8) {
      c.beginPath();
      c.moveTo(-W / 2, -y);
      c.lineTo(W / 2, -y);
      c.stroke();
      for (let x = -W / 2 + ((y / 8) % 2) * 8; x < W / 2; x += 16) {
        c.beginPath();
        c.moveTo(x, -y);
        c.lineTo(x, -y - 8);
        c.stroke();
      }
    }
  } else if (k === 2) {
    c.strokeStyle = d;
    for (let x = -W / 2; x < W / 2; x += 10) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, -H);
      c.stroke();
    }
  } else if (k === 3) {
    const r = mulberry(3);
    for (let i = 0; i < H / 5; i++) {
      ell(c, -W / 2 + r() * W, -r() * H, 6 + r() * 4, 4 + r() * 2);
      c.fillStyle = i % 2 ? d : l;
      c.fill();
    }
  } else if (k === 4) {
    for (let y = 5; y < H; y += 10) {
      rr(c, -W / 2 - 4, -y - 5, W + 8, 9, 4.5);
      c.fillStyle = i2(y) ? d : shade(col, -0.08);
      c.fill();
      c.strokeStyle = shade(col, -0.35);
      c.stroke();
    }
  } else if (k === 5) {
    c.strokeStyle = l;
    for (let x = -W / 2; x < W / 2; x += 10) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, -H);
      c.stroke();
    }
    for (let y = 0; y < H; y += 10) {
      c.beginPath();
      c.moveTo(-W / 2, -y);
      c.lineTo(W / 2, -y);
      c.stroke();
    }
  } else if (k === 6) {
    c.fillStyle = l;
    for (let x = -W / 2; x < W / 2; x += 16) c.fillRect(x, -H, 8, H);
  } else if (k === 7) {
    c.fillStyle = l;
    for (let y = 6; y < H; y += 12) for (let x = -W / 2 + ((y / 12) % 2 ? 6 : 0); x < W / 2; x += 12) {
      circ(c, x, -y, 2.4);
      c.fill();
    }
  }
}
const i2 = (y: number) => Math.floor(y / 10) % 2 === 0;

function drawWindow(c: CanvasRenderingContext2D, k: number, x: number, y: number, s: number, frame: string, warm: boolean): void {
  const glass = warm ? '#ffe680' : '#bff6ff';
  c.save();
  c.translate(x, y);
  if (k === 1) {
    circ(c, 0, 0, s * 0.6);
    fs(c, glass, 0);
    c.lineWidth = 3.5;
    c.strokeStyle = frame;
    c.stroke();
    circ(c, 0, 0, s * 0.6 + 2);
    c.lineWidth = 1.2;
    c.strokeStyle = INK;
    c.stroke();
  } else if (k === 4) {
    star(c, 0, 0, s * 0.72, 5, 0.5);
    fs(c, glass, 0);
    c.lineWidth = 3;
    c.strokeStyle = frame;
    c.stroke();
  } else if (k === 5) {
    heartPath(c, 0, s * 0.15, s * 0.75);
    fs(c, glass, 0);
    c.lineWidth = 3;
    c.strokeStyle = frame;
    c.stroke();
  } else {
    if (k === 2) {
      c.beginPath();
      c.moveTo(-s / 2, s / 2);
      c.lineTo(-s / 2, -s * 0.1);
      c.arc(0, -s * 0.1, s / 2, Math.PI, 0);
      c.lineTo(s / 2, s / 2);
      c.closePath();
    } else rr(c, -s / 2, -s / 2, s, s, 2);
    fs(c, glass, 0);
    c.lineWidth = 3;
    c.strokeStyle = frame;
    c.stroke();
    if (k === 3 || k === 0) {
      c.beginPath();
      c.moveTo(0, -s / 2);
      c.lineTo(0, s / 2);
      if (k === 3) {
        c.moveTo(-s / 2, 0);
        c.lineTo(s / 2, 0);
      }
      c.lineWidth = 2;
      c.stroke();
    }
  }
  c.fillStyle = alpha('#ffffff', 0.7);
  c.fillRect(-s * 0.3, -s * 0.3, s * 0.12, s * 0.3);
  c.restore();
}

function drawDoor(c: CanvasRenderingContext2D, k: number, x: number, y: number, col: string): void {
  c.save();
  c.translate(x, y);
  const w = k === 3 ? 26 : 18,
    h = 30;
  c.beginPath();
  if (k === 1 || k === 4 || k === 7) {
    c.moveTo(-w / 2, 0);
    c.lineTo(-w / 2, -h + w / 2);
    c.arc(0, -h + w / 2, w / 2, Math.PI, 0);
    c.lineTo(w / 2, 0);
    c.closePath();
  } else if (k === 2) {
    c.arc(0, -h / 2 + 2, 13, 0, TAU);
  } else rr(c, -w / 2, -h, w, h, 3);
  if (k === 7) {
    const g = c.createLinearGradient(0, -h, 0, 0);
    g.addColorStop(0, '#c46bff');
    g.addColorStop(1, col);
    fs(c, g, 2);
    circ(c, 0, -h / 2, 6);
    fs(c, alpha('#ffffff', 0.5));
  } else fs(c, col, 2);
  c.strokeStyle = alpha(INK, 0.5);
  c.lineWidth = 1.2;
  if (k === 3) {
    c.beginPath();
    c.moveTo(0, -h);
    c.lineTo(0, 0);
    c.stroke();
  } else if (k === 4) {
    circ(c, 0, -h + 10, 5);
    fs(c, '#bff6ff', 1.2);
  } else if (k === 5) {
    star(c, 0, -h / 2, 6, 5, 0.5);
    fs(c, '#ffc93d', 1.2);
  } else if (k === 6) {
    c.beginPath();
    c.moveTo(-w / 2, -h);
    c.lineTo(w / 2, 0);
    c.moveTo(w / 2, -h);
    c.lineTo(-w / 2, 0);
    c.lineWidth = 2;
    c.strokeStyle = '#ffffff';
    c.stroke();
  }
  circ(c, w / 2 - 4, -h / 2 + 2, 1.8);
  fs(c, '#ffc93d');
  c.restore();
}

function drawRoof(c: CanvasRenderingContext2D, k: number, W: number, H: number, col: string, chim: number): void {
  const y = -H;
  const ov = 10;
  // chaminé atrás do telhado
  if (chim) {
    const cx = W * 0.25;
    if (chim === 3) {
      rr(c, cx - 6, y - 34, 12, 30, 6);
      fs(c, '#d5d0e8', 2);
    } else if (chim === 2) {
      rr(c, cx - 4, y - 36, 8, 34, 2);
      fs(c, '#8f88a8', 2);
      rr(c, cx - 6, y - 38, 12, 5, 2);
      fs(c, '#8f88a8', 2);
    } else {
      rr(c, cx - 7, y - 32, 14, 30, 2);
      fs(c, '#c4553a', 2);
    }
    if (chim === 4) {
      heartPath(c, cx + 4, y - 44, 5);
      fs(c, alpha('#ffb3c7', 0.9));
      heartPath(c, cx + 10, y - 56, 4);
      fs(c, alpha('#ffb3c7', 0.7));
    } else {
      circ(c, cx + 2, y - 42, 5);
      fs(c, alpha('#ffffff', 0.7));
      circ(c, cx + 8, y - 52, 4);
      fs(c, alpha('#ffffff', 0.5));
    }
  }
  c.beginPath();
  switch (k) {
    case 1:
      rr(c, -W / 2 - 6, y - 10, W + 12, 12, 3);
      break;
    case 2:
      c.moveTo(-W / 2 - 2, y + 2);
      c.bezierCurveTo(-W / 2, y - 60, W / 2, y - 60, W / 2 + 2, y + 2);
      c.closePath();
      break;
    case 3:
      c.moveTo(-W / 2 - ov, y + 2);
      c.quadraticCurveTo(-8, y - 30, 6, y - 76);
      c.quadraticCurveTo(10, y - 30, W / 2 + ov, y + 2);
      c.closePath();
      break;
    case 4:
      c.moveTo(-W / 2 - ov, y + 2);
      c.lineTo(-W / 4, y - 32);
      c.lineTo(W / 4, y - 32);
      c.lineTo(W / 2 + ov, y + 2);
      c.closePath();
      break;
    case 5:
      c.moveTo(-W / 2 - 18, y + 4);
      c.bezierCurveTo(-W / 2 - 18, y - 70, W / 2 + 18, y - 70, W / 2 + 18, y + 4);
      c.closePath();
      break;
    case 6:
      c.moveTo(-W / 2 - 4, y + 2);
      for (let i = 0; i < 4; i++) {
        c.lineTo(-W / 2 - 4 + i * 27, y - 26);
        c.lineTo(-W / 2 - 4 + (i + 1) * 27, y + 2);
      }
      c.closePath();
      break;
    case 7:
      c.moveTo(-W / 2 + 4, y + 2);
      c.bezierCurveTo(-W / 2 - 12, y - 40, -6, y - 46, 0, y - 70);
      c.bezierCurveTo(6, y - 46, W / 2 + 12, y - 40, W / 2 - 4, y + 2);
      c.closePath();
      break;
    default:
      c.moveTo(-W / 2 - ov, y + 2);
      c.lineTo(0, y - 44);
      c.lineTo(W / 2 + ov, y + 2);
      c.closePath();
  }
  const g = c.createLinearGradient(0, y - 60, 0, y);
  g.addColorStop(0, shade(col, 0.2));
  g.addColorStop(1, shade(col, -0.15));
  fs(c, g, 2.5);
  // detalhes
  c.save();
  c.clip();
  if (k === 5) {
    for (let i = 0; i < 5; i++) {
      circ(c, -W / 2 + 10 + i * 22, y - 20 - (i % 2) * 16, 6);
      fs(c, '#ffffff');
    }
  } else if (k === 0 || k === 4 || k === 3) {
    c.strokeStyle = alpha(INK, 0.22);
    c.lineWidth = 1.5;
    for (let i = 1; i < 6; i++) {
      c.beginPath();
      c.moveTo(-W, y - i * 9);
      c.lineTo(W, y - i * 9);
      c.stroke();
    }
  }
  c.restore();
  if (k === 7) {
    circ(c, 0, y - 72, 3.5);
    fs(c, '#ffc93d', 1.5);
  }
  if (k === 3) {
    star(c, 6, y - 80, 5, 5, 0.5);
    fs(c, '#ffc93d', 1.5);
  }
}

function drawGarden(c: CanvasRenderingContext2D, k: number, side: number): void {
  if (k === 1) {
    circ(c, -6, -8, 9);
    fs(c, '#4fd67a', 1.5);
    circ(c, 6, -7, 8);
    fs(c, '#2fb39a', 1.5);
  } else if (k === 2) {
    for (let i = 0; i < 4; i++) {
      c.strokeStyle = '#2fb39a';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(-9 + i * 6, 0);
      c.lineTo(-9 + i * 6, -10 - (i % 2) * 4);
      c.stroke();
      star(c, -9 + i * 6, -12 - (i % 2) * 4, 3.5, 5, 0.55);
      fs(c, ['#ff7ad9', '#ffc93d', '#ff5c7a', '#c46bff'][(i + side) % 4], 1);
    }
  } else if (k === 3) {
    rr(c, -14, -5, 28, 6, 2);
    fs(c, '#8a5a3c', 1.5);
    for (let i = 0; i < 3; i++) {
      ell(c, -8 + i * 8, -9, 3, 5);
      fs(c, i === 1 ? '#ff5c7a' : '#ff8a3d', 1);
      c.fillStyle = '#4fd67a';
      c.fillRect(-9 + i * 8, -16, 2, 4);
    }
  } else if (k === 4) {
    ell(c, 0, -2, 15, 5);
    fs(c, '#3fa0ff', 1.5);
    ell(c, -4, -3, 5, 1.5);
    fs(c, alpha('#ffffff', 0.6));
  } else if (k === 5) {
    c.fillStyle = '#8a5a3c';
    c.fillRect(-1.5, -8, 3, 8);
    circ(c, 0, -14, 7);
    fs(c, '#4fd67a', 1.5);
    circ(c, 0, -24, 5);
    fs(c, '#4fd67a', 1.5);
  }
}
function drawFence(c: CanvasRenderingContext2D, k: number, col: string): void {
  if (k === 1) {
    for (const x of [-4, 4]) {
      c.beginPath();
      c.moveTo(x - 2.5, 0);
      c.lineTo(x - 2.5, -12);
      c.lineTo(x, -15);
      c.lineTo(x + 2.5, -12);
      c.lineTo(x + 2.5, 0);
      fs(c, col, 1.2);
    }
    c.fillStyle = col;
    c.fillRect(-7, -9, 14, 2.5);
  } else if (k === 2) {
    rr(c, -7, -12, 14, 12, 5);
    fs(c, shade('#4fd67a', -0.1), 1.5);
  } else if (k === 3) {
    rr(c, -7, -9, 14, 9, 2);
    fs(c, col === '#ffffff' ? '#d5d0e8' : col, 1.5);
  } else if (k === 4) {
    c.lineWidth = 3;
    c.strokeStyle = '#ffffff';
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(0, -12);
    c.arc(3, -12, 3, Math.PI, 0);
    c.stroke();
    c.lineWidth = 1.5;
    c.strokeStyle = col;
    c.stroke();
  } else if (k === 5) {
    c.fillStyle = '#8a5a3c';
    c.fillRect(-1.5, -12, 3, 12);
    c.strokeStyle = col;
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(-7, -9);
    c.quadraticCurveTo(0, -5, 7, -9);
    c.stroke();
  }
}
function drawSign(c: CanvasRenderingContext2D, k: number, name: string): void {
  c.fillStyle = '#8a5a3c';
  c.fillRect(-1.5, -16, 3, 16);
  const label = name ? '@' + name : '';
  c.font = '700 7px Fredoka, system-ui, sans-serif';
  const w = Math.max(24, Math.min(60, c.measureText(label).width + 8));
  if (k === 3) {
    c.beginPath();
    c.moveTo(-w / 2, -28);
    c.lineTo(w / 2, -28);
    c.lineTo(w / 2 - 4, -22);
    c.lineTo(w / 2, -16);
    c.lineTo(-w / 2, -16);
    c.lineTo(-w / 2 + 4, -22);
    c.closePath();
    fs(c, '#ff5c7a', 1.2);
  } else {
    rr(c, -w / 2, -28, w, 12, 3);
    fs(c, k === 2 ? '#262238' : '#c89a6a', 1.2);
  }
  c.fillStyle = k === 2 ? '#5ef0ff' : k === 3 ? '#ffffff' : INK;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(label, 0, -21.6, w - 4);
}
function drawMailbox(c: CanvasRenderingContext2D, k: number): void {
  c.fillStyle = INK;
  c.fillRect(-1.2, -12, 2.4, 12);
  if (k === 1) {
    rr(c, -6, -20, 12, 9, 4);
    fs(c, '#3fa0ff', 1.2);
    c.fillStyle = '#ff5c7a';
    c.fillRect(5, -22, 1.6, 6);
  } else if (k === 2) {
    rr(c, -6, -22, 12, 11, 2);
    fs(c, '#d5d0e8', 1.2);
    circ(c, -2.5, -17, 1.5);
    fs(c, '#46d9e6');
    circ(c, 2.5, -17, 1.5);
    fs(c, '#46d9e6');
  } else if (k === 3) {
    rr(c, -6, -21, 12, 10, 3);
    fs(c, '#ffc93d', 1.2);
    circ(c, 0, -23, 3);
    fs(c, '#ff8a3d', 1);
  } else {
    c.beginPath();
    c.moveTo(0, -28);
    c.quadraticCurveTo(6, -20, 5, -12);
    c.lineTo(-5, -12);
    c.quadraticCurveTo(-6, -20, 0, -28);
    fs(c, '#ffffff', 1.2);
    circ(c, 0, -19, 2);
    fs(c, '#ff5c7a');
  }
}

/* ---------------- fundo do espaço ---------------- */
export function drawSpaceBg(c: CanvasRenderingContext2D, d: HomeDesign, w: number, h: number): void {
  const sky = SKIES[num(d.planet as Rec, 'sky')] ?? SKIES[0];
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, sky[0]);
  g.addColorStop(0.65, sky[1]);
  g.addColorStop(1, shade(sky[2], -0.2));
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  const r = mulberry(99);
  for (let i = 0; i < 70; i++) {
    const s = r() * 1.6 + 0.4;
    c.fillStyle = alpha('#ffffff', 0.35 + r() * 0.6);
    c.fillRect(r() * w, r() * h, s, s);
  }
  for (let i = 0; i < 5; i++) {
    star(c, r() * w, r() * h, 3 + r() * 3, 4, 0.35);
    c.fillStyle = alpha('#ffffff', 0.8);
    c.fill();
  }
}

/* ---------------- cache ---------------- */
const sceneCache = new Map<string, HTMLCanvasElement>();
/** Canvas pronto com fundo + planeta + casa (w×h em px já com dpr). */
export function planetSceneCanvas(d: HomeDesign, w: number, h: number, o: PlanetOpts & { R?: number; cy?: number } = {}): HTMLCanvasElement {
  const key = `${w}x${h}|${o.R ?? ''}|${o.cy ?? ''}|${o.name}|${Math.round((o.mess ?? 0) * 10)}|${o.stars !== false}|${JSON.stringify(d.planet)}|${JSON.stringify(d.exterior)}`;
  const hit = sceneCache.get(key);
  if (hit) return hit;
  const [cv, c] = makeCanvas(w, h);
  if (o.stars !== false) drawSpaceBg(c, d, w, h);
  const R = o.R ?? Math.min(w, h) * 0.3;
  drawPlanetScene(c, d, w / 2, o.cy ?? h * 0.58, R, o);
  if (sceneCache.size > 24) sceneCache.delete(sceneCache.keys().next().value!);
  sceneCache.set(key, cv);
  return cv;
}
