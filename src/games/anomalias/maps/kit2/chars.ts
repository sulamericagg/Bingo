/* ============================================================
 *  ANOMALIAS (kit2) — Bloops clientes (mesmo desenho dos Bloops 3D do
 *  jogo: bolinha fofa, barriga clara, pezinhos, bracinhos, bochechas —
 *  ver src/games/voo/models.ts bloopGeo) numa malha só por cliente,
 *  com rostos alternativos para a anomalia 'face', e o "Sombrito":
 *  criaturinha escura de bocão com dentinhos de vampiro (fofo-assustador).
 *  Tudo olha para +Z.
 * ============================================================ */
import * as THREE from 'three';
import { GeoBuilder } from '../../../../3d/common/geo';

export interface BloopPal {
  light: string;
  dark: string;
  belly: string;
}
export type Face = 'normal' | 'bigmouth' | 'cyclops' | 'blank' | 'manyeyes' | 'spiral';
export type Hat = '' | 'cap' | 'beanie' | 'bow' | 'visor' | 'chef';

export const BLOOP_PALS: BloopPal[] = [
  { light: '#7ad0ff', dark: '#3a8ad0', belly: '#d8f2ff' },
  { light: '#ff9ac0', dark: '#d0507a', belly: '#ffe2ee' },
  { light: '#9ee07a', dark: '#4a9a3a', belly: '#e6ffd8' },
  { light: '#ffd35a', dark: '#d09a2a', belly: '#fff4cc' },
  { light: '#c79bff', dark: '#7a50c8', belly: '#efe2ff' },
  { light: '#ffad6b', dark: '#d0702a', belly: '#ffe8d4' },
  { light: '#6be0c8', dark: '#2a9a88', belly: '#dcfff6' },
];
const INK = '#2a1140';

/** Bloop (~1,0 m antes da escala). pose 'sit' = pés à frente (no banco) */
export function bloopGeo(c: BloopPal, face: Face = 'normal', hat: Hat = '', pose: 'stand' | 'sit' = 'stand', seg = 16): THREE.BufferGeometry {
  const g = new GeoBuilder();
  g.bevel = 1;
  g.ao = false;
  const R = 0.42;
  const cy = 0.5;
  g.sph(R, 0, cy, 0, c.light, 1, 1.08, 0.96, seg);
  g.sph(R * 0.7, 0, cy - 0.06, R * 0.42, c.belly, 0.95, 0.9, 0.5, Math.max(8, seg - 4));
  // pés
  for (const s of [-1, 1]) {
    if (pose === 'sit') g.sph(0.12, s * 0.18, 0.14, 0.3, c.dark, 1.15, 0.7, 1.5, 8);
    else g.sph(0.12, s * 0.18, 0.08, 0.08, c.dark, 1.2, 0.7, 1.5, 8);
  }
  // bracinhos
  for (const s of [-1, 1]) g.sph(0.09, s * 0.42, cy - 0.05, 0.05, c.light, 0.8, 1.3, 0.8, 8);
  const ey = cy + 0.13;
  const es = seg >= 14 ? 12 : 9;
  const eye = (ex: number, eyy: number, k = 1, look = 0) => {
    g.sph(0.11 * k, ex, eyy, R * 0.82, '#ffffff', 1, 1.15, 0.55, es);
    g.sph(0.055 * k, ex + look, eyy - 0.01, R * 0.82 + 0.045 * k, INK, 1, 1.15, 0.6, es - 2);
    g.sph(0.02 * k, ex + 0.02 * k, eyy + 0.03 * k, R * 0.82 + 0.075 * k, '#ffffff', 1, 1, 0.6, 5);
  };
  switch (face) {
    case 'normal':
      for (const s of [-1, 1]) eye(s * 0.15, ey);
      g.torus(0.05, 0.016, 0, cy - 0.02, R * 0.93, INK, Math.PI, 10, 0, Math.PI);
      break;
    case 'bigmouth': {
      // olhinhos miúdos + bocão escancarado com presinhas
      for (const s of [-1, 1]) {
        g.sph(0.08, s * 0.16, ey + 0.06, R * 0.8, '#ffffff', 1, 1, 0.5, 10);
        g.sph(0.022, s * 0.16, ey + 0.06, R * 0.8 + 0.04, INK, 1, 1, 0.6, 6);
      }
      g.sph(0.26, 0, cy - 0.08, R * 0.7, '#4a0c1e', 1.15, 0.85, 0.42, 14);
      g.sph(0.14, 0, cy - 0.2, R * 0.78, '#ff6a8a', 1.3, 0.5, 0.5, 10);
      for (const s of [-1, 1]) {
        g.cyl(0, 0.035, 0.1, s * 0.13, cy + 0.12, R * 0.86, '#ffffff', 6, Math.PI);
        g.cyl(0, 0.02, 0.05, s * 0.05, cy + 0.13, R * 0.9, '#ffffff', 5, Math.PI);
      }
      break;
    }
    case 'cyclops':
      eye(0, ey - 0.01, 1.9);
      g.torus(0.04, 0.014, 0, cy - 0.1, R * 0.93, INK, Math.PI, 10, 0, Math.PI);
      break;
    case 'blank':
      break;
    case 'manyeyes':
      for (const [ex, eyy, k] of [
        [-0.17, ey, 0.8],
        [0.17, ey, 0.8],
        [0, ey + 0.13, 0.65],
        [-0.27, ey + 0.1, 0.5],
        [0.27, ey + 0.1, 0.5],
        [0, ey - 0.06, 0.55],
      ])
        eye(ex, eyy, k);
      break;
    case 'spiral':
      for (const s of [-1, 1]) {
        g.sph(0.11, s * 0.15, ey, R * 0.82, '#ffffff', 1, 1.15, 0.55, 12);
        g.torus(0.065, 0.012, s * 0.15, ey, R * 0.9 + 0.035, INK, 0, 14);
        g.torus(0.03, 0.012, s * 0.15, ey, R * 0.9 + 0.04, INK, 0, 10);
      }
      // sorriso largo demais
      g.torus(0.2, 0.02, 0, cy + 0.05, R * 0.9, INK, Math.PI, 16, 0, Math.PI);
      break;
  }
  if (face !== 'blank' && face !== 'bigmouth') for (const s of [-1, 1]) g.sph(0.05, s * 0.27, cy - 0.02, R * 0.78, '#ff9ab8', 1, 0.6, 0.4, 6);
  const top = cy + R * 1.0;
  switch (hat) {
    case 'cap':
      g.sph(0.3, 0, top - 0.06, 0, '#e8423a', 1, 0.5, 1, 14);
      g.cyl(0.2, 0.2, 0.02, 0, top - 0.05, 0.2, '#e8423a', 14, -0.12);
      break;
    case 'beanie':
      g.sph(0.31, 0, top - 0.08, 0, '#3a6ad0', 1, 0.62, 1, 14);
      g.sph(0.07, 0, top + 0.12, 0, '#ffffff', 1, 1, 1, 8);
      break;
    case 'bow':
      g.sph(0.08, 0.16, top - 0.02, 0.06, '#ff4f8a', 1.4, 0.8, 0.5, 8);
      g.sph(0.08, 0.32, top - 0.06, 0.06, '#ff4f8a', 1.4, 0.8, 0.5, 8);
      g.sph(0.04, 0.24, top - 0.04, 0.08, '#ff9ac0', 1, 1, 1, 6);
      break;
    case 'visor':
      g.torus(0.3, 0.03, 0, top - 0.12, 0, '#ffd23a', Math.PI / 2, 18);
      g.cyl(0.18, 0.18, 0.02, 0, top - 0.13, 0.26, '#ffd23a', 12, -0.1);
      break;
    case 'chef':
      g.cyl(0.24, 0.22, 0.12, 0, top - 0.08, 0, '#ffffff', 14);
      g.sph(0.26, 0, top + 0.08, 0, '#ffffff', 1, 0.7, 1, 12);
      break;
  }
  return g.build();
}

/**
 * Sombrito — criaturinha (anomalia 'creature'): corpo escuro, bocão com
 * presinhas brancas, olhos que brilham (malha à parte, sem luz).
 */
export function sombritoGeo(): { body: THREE.BufferGeometry; eyes: THREE.BufferGeometry } {
  const g = new GeoBuilder();
  g.bevel = 1;
  g.ao = false;
  const R = 0.4;
  const cy = 0.48;
  g.sph(R, 0, cy, 0, '#3a2660', 1, 1.12, 0.95, 16);
  g.sph(R * 0.6, 0, cy - 0.1, R * 0.45, '#5a3e8a', 1, 0.9, 0.5, 12);
  // orelhinhas pontudas
  for (const s of [-1, 1]) g.cyl(0, 0.1, 0.22, s * 0.22, cy + 0.32, 0, '#3a2660', 6, 0, s * -0.5);
  // bocão
  g.sph(0.24, 0, cy - 0.06, R * 0.7, '#14060f', 1.25, 0.7, 0.4, 14);
  g.sph(0.12, 0, cy - 0.15, R * 0.78, '#b0305a', 1.3, 0.45, 0.5, 10);
  for (const s of [-1, 1]) {
    g.cyl(0, 0.04, 0.12, s * 0.14, cy + 0.08, R * 0.86, '#ffffff', 6, Math.PI);
    g.cyl(0, 0.025, 0.06, s * 0.05, cy + 0.09, R * 0.9, '#f4f0ff', 5, Math.PI);
  }
  // patinhas
  for (const s of [-1, 1]) g.sph(0.11, s * 0.18, 0.07, 0.06, '#1c1030', 1.2, 0.7, 1.4, 8);
  for (const s of [-1, 1]) g.sph(0.08, s * 0.4, cy - 0.08, 0.06, '#3a2660', 0.8, 1.4, 0.8, 8);
  const e = new GeoBuilder();
  e.ao = false;
  for (const s of [-1, 1]) {
    e.sph(0.085, s * 0.15, cy + 0.17, R * 0.78, '#fff27a', 1, 0.8, 0.5, 10);
    e.sph(0.035, s * 0.15, cy + 0.17, R * 0.78 + 0.04, '#ff3a3a', 1, 1.4, 0.5, 8);
  }
  return { body: g.build(), eyes: e.build() };
}
