/* ============================================================
 *  ANOMALIAS (kit2) — comidinhas 3D (para bandejas, chapa, balcão)
 *  e mascote-estátua "Burgo" (hambúrguer de pezinho, criação nossa).
 * ============================================================ */
import type { GeoBuilder } from '../../../../3d/common/geo';

/** hambúrguer (base em y) */
export function burger3(g: GeoBuilder, x: number, y: number, z: number, s = 1, patty = '#6a3420'): void {
  g.cyl(0.055 * s, 0.05 * s, 0.025 * s, x, y, z, '#e6a050', 14);
  g.cyl(0.058 * s, 0.058 * s, 0.022 * s, x, y + 0.025 * s, z, patty, 14);
  g.cyl(0.062 * s, 0.06 * s, 0.006 * s, x, y + 0.047 * s, z, '#ffcc2a', 4);
  g.cyl(0.06 * s, 0.06 * s, 0.008 * s, x, y + 0.052 * s, z, '#5ac64a', 12);
  g.sph(0.058 * s, x, y + 0.06 * s, z, '#eea24c', 1, 0.62, 1, 12);
}
/** caixinha de batata frita */
export function fries3(g: GeoBuilder, x: number, y: number, z: number, s = 1, box = '#e8423a', ry = 0): void {
  g.frustum(0.05 * s, 0.03 * s, 0.07 * s, 0.035 * s, 0.09 * s, x, y, z, box, ry);
  for (let i = 0; i < 9; i++) {
    const ox = ((i % 3) - 1) * 0.02 * s;
    const oz = (Math.floor(i / 3) - 1) * 0.01 * s;
    g.sharp(0.012 * s, (0.07 + (i % 4) * 0.012) * s, 0.012 * s, x + ox, y + 0.06 * s, z + oz, i % 2 ? '#ffd45a' : '#ffc93a', ry + i * 0.2, (i % 3) * 0.08 - 0.08);
  }
}
/** copo de refri com tampa e canudo */
export function cup3(g: GeoBuilder, x: number, y: number, z: number, s = 1, col = '#ffffff', band = '#e8423a'): void {
  g.cyl(0.045 * s, 0.035 * s, 0.14 * s, x, y, z, col, 12);
  g.cyl(0.0455 * s, 0.042 * s, 0.035 * s, x, y + 0.06 * s, z, band, 12);
  g.cyl(0.048 * s, 0.048 * s, 0.012 * s, x, y + 0.14 * s, z, '#f2f2f2', 12);
  g.cyl(0.005 * s, 0.005 * s, 0.09 * s, x + 0.012 * s, y + 0.14 * s, z, '#ff5a6a', 5, 0, 0.18);
}
/** bandeja */
export function tray3(g: GeoBuilder, x: number, y: number, z: number, col = '#c8302a', ry = 0): void {
  g.box(0.42, 0.02, 0.3, x, y, z, col, ry);
  g.sharp(0.36, 0.002, 0.24, x, y + 0.02, z, '#f6eedc', ry);
}
/** bisnaga (ketchup/mostarda) */
export function bottle3(g: GeoBuilder, x: number, y: number, z: number, col: string, s = 1): void {
  g.lathe(
    [
      [0, 0],
      [0.03 * s, 0],
      [0.033 * s, 0.03 * s],
      [0.032 * s, 0.13 * s],
      [0.02 * s, 0.16 * s],
      [0.008 * s, 0.17 * s],
      [0, 0.17 * s],
    ],
    x,
    y,
    z,
    col,
    10,
  );
  g.cyl(0.004 * s, 0.009 * s, 0.035 * s, x, y + 0.17 * s, z, col === '#ffffff' ? '#ddd' : '#f2f2f2', 6);
}

/**
 * Burgo — mascote: hambúrguer de pé com bracinhos e tênis (~1,45 m, base em 0).
 * face 'smile' | 'fangs' (anomalia)
 */
export function burgo3(g: GeoBuilder, face: 'smile' | 'fangs' = 'smile'): void {
  const INK = '#2a1140';
  // pedestal
  g.rcyl(0.42, 0.2, 0, 0, 0, '#d8302a', 20, 0.3);
  g.rcyl(0.36, 0.04, 0, 0.2, 0, '#ffd35a', 20, 0.3);
  // pernas + tênis
  for (const s of [-1, 1]) {
    g.cyl(0.05, 0.05, 0.3, s * 0.14, 0.24, 0, '#f2d2a0', 8);
    g.sph(0.1, s * 0.15, 0.27, 0.05, '#e8423a', 1, 0.6, 1.5, 10);
  }
  const y0 = 0.52;
  g.cyl(0.36, 0.32, 0.16, 0, y0, 0, '#e6a050', 20); // pão de baixo
  g.cyl(0.4, 0.4, 0.12, 0, y0 + 0.16, 0, '#6a3420', 20); // carne
  // queijo derretido (quadrado com pontas)
  g.box(0.74, 0.03, 0.74, 0, y0 + 0.28, 0, '#ffcc2a', Math.PI / 4);
  g.cyl(0.42, 0.42, 0.04, 0, y0 + 0.3, 0, '#5ac64a', 16); // alface
  g.lathe(
    [
      [0.4, 0],
      [0.42, 0.06],
      [0.4, 0.2],
      [0.32, 0.34],
      [0.18, 0.42],
      [0, 0.44],
    ],
    0,
    y0 + 0.34,
    0,
    '#eea24c',
    22,
  );
  // gergelim
  for (let i = 0; i < 10; i++) {
    const a = i * 2.39;
    const r = 0.12 + (i % 3) * 0.08;
    g.sph(0.02, Math.cos(a) * r, y0 + 0.34 + 0.41 - r * 0.45, Math.sin(a) * r * 0.6 - 0.04, '#fff6d8', 1.4, 0.6, 1, 6);
  }
  // rosto no pão de cima (frente +Z)
  const fy = y0 + 0.52;
  for (const s of [-1, 1]) {
    g.sph(0.07, s * 0.12, fy, 0.34, '#ffffff', 1, 1.2, 0.5, 10);
    g.sph(0.034, s * 0.12, fy - 0.005, 0.37, face === 'fangs' ? '#d0102a' : INK, 1, 1.2, 0.6, 8);
  }
  if (face === 'fangs') {
    g.sph(0.15, 0, y0 + 0.24, 0.39, '#3a0818', 1.3, 0.6, 0.35, 12);
    for (const s of [-1, 1]) g.cyl(0, 0.025, 0.07, s * 0.08, y0 + 0.3, 0.42, '#ffffff', 6, Math.PI);
  } else {
    g.torus(0.08, 0.02, 0, fy - 0.12, 0.36, INK, Math.PI, 12, 0, Math.PI);
  }
  // bracinhos acenando
  g.tube(
    [
      [0.38, y0 + 0.2, 0],
      [0.52, y0 + 0.35, 0.05],
      [0.58, y0 + 0.55, 0.08],
    ],
    0.035,
    '#f2d2a0',
    8,
    6,
  );
  g.sph(0.07, 0.58, y0 + 0.58, 0.08, '#ffffff', 1, 1, 1, 8);
  g.tube(
    [
      [-0.38, y0 + 0.2, 0],
      [-0.5, y0 + 0.08, 0.05],
      [-0.54, y0 - 0.02, 0.06],
    ],
    0.035,
    '#f2d2a0',
    8,
    6,
  );
  g.sph(0.07, -0.54, y0 - 0.04, 0.06, '#ffffff', 1, 1, 1, 8);
}
