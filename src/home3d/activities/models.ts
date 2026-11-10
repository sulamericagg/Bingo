/* ============================================================
 *  CASA 3D · ATIVIDADES — modelinhos procedurais (cor por vértice,
 *  geometria mesclada e em cache): ingredientes inteiros, fatias,
 *  cubinhos, pratos compostos, louça, utensílios, móveis extras
 *  (lixeira, máquina de lavar, horta...), enfeites de festa.
 * ============================================================ */
import * as THREE from 'three';
import { GeoBuilder } from '../../3d/common/geo';
import { ING, madeColor } from './data';
import { shade } from '../../3d/common/tex';

const cache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: (b: GeoBuilder) => void, center = true): THREE.BufferGeometry {
  let g = cache.get(key);
  if (!g) {
    const b = new GeoBuilder();
    b.bevel = 1;
    b.ao = false;
    make(b);
    g = b.build();
    if (center) g.center();
    g.computeBoundingSphere();
    cache.set(key, g);
  }
  return g;
}
export function disposeActModels(): void {
  for (const g of cache.values()) g.dispose();
  cache.clear();
}
const LEAF = '#3ec95a';
const WHITE = '#fffaf0';
const METAL = '#c9cbd8';
const DARK = '#3a3550';

/* ---------------- ingrediente inteiro ---------------- */
export function ingGeo(id: string): THREE.BufferGeometry {
  return cached('i:' + id, (b) => {
    const d = ING.get(id);
    const c = d?.skin ?? '#ffffff';
    const r = d?.r ?? 0.05;
    switch (id) {
      case 'tomate':
        b.sph(r, 0, 0, 0, c, 1, 0.85, 1, 12);
        b.cyl(0.006, 0.006, 0.02, 0, r * 0.8, 0, '#2f9e44', 5);
        for (let i = 0; i < 5; i++) b.box(0.03, 0.006, 0.01, Math.cos(i * 1.26) * 0.012, r * 0.82, Math.sin(i * 1.26) * 0.012, LEAF, -i * 1.26);
        break;
      case 'morango':
        b.sph(r, 0, 0, 0, c, 1, 1.2, 1, 10);
        b.cyl(0.02, 0.012, 0.012, 0, r * 1.1, 0, LEAF, 6);
        for (let i = 0; i < 6; i++) b.sph(0.004, Math.cos(i) * r * 0.9, Math.sin(i * 2) * r * 0.5, Math.sin(i) * r * 0.9, '#fff3a0', 1, 1, 1, 4);
        break;
      case 'laranja':
      case 'maca':
        b.sph(r, 0, 0, 0, c, 1, id === 'maca' ? 0.9 : 1, 1, 12);
        b.cyl(0.004, 0.004, 0.025, 0, r * 0.85, 0, '#6b3a1a', 4);
        if (id === 'maca') b.sph(0.016, 0.012, r * 1.05, 0, LEAF, 1.6, 0.4, 1, 6);
        break;
      case 'cenoura':
        b.cyl(r * 0.75, 0.008, r * 3.4, 0, -r * 1.7, 0, c, 9);
        for (let i = 0; i < 3; i++) b.cyl(0.006, 0.01, 0.06, (i - 1) * 0.01, r * 1.7, 0, LEAF, 5, 0, (i - 1) * 0.35);
        break;
      case 'batata':
        b.sph(r, 0, 0, 0, c, 1.25, 0.8, 0.95, 9);
        for (let i = 0; i < 4; i++) b.sph(0.005, Math.cos(i * 2) * r, (i % 2) * 0.01, Math.sin(i * 2) * r * 0.8, shade(c, -0.3), 1, 1, 1, 4);
        break;
      case 'cebola':
        b.sph(r, 0, 0, 0, c, 1, 0.95, 1, 12);
        b.cyl(0.002, r * 0.35, r * 0.7, 0, r * 0.6, 0, shade(c, 0.15), 8);
        break;
      case 'alface':
        for (let i = 0; i < 7; i++) {
          const a = i * 0.9;
          b.sph(r * 0.75, Math.cos(a) * r * 0.25, (i % 3) * 0.01 - 0.01, Math.sin(a) * r * 0.25, i % 2 ? c : shade(c, 0.2), 1, 0.8, 1, 8);
        }
        break;
      case 'pimentao':
        for (let i = 0; i < 4; i++) b.sph(r * 0.62, Math.cos(i * 1.57) * r * 0.32, 0, Math.sin(i * 1.57) * r * 0.32, c, 1, 1.3, 1, 8);
        b.cyl(0.006, 0.008, 0.03, 0, r * 0.75, 0, '#2f7a3a', 5);
        break;
      case 'brocolis':
        b.cyl(r * 0.25, r * 0.35, r * 1.1, 0, -r, 0, '#8fd36a', 7);
        for (let i = 0; i < 6; i++) b.sph(r * 0.45, Math.cos(i * 1.05) * r * 0.45, r * 0.25 + (i % 2) * 0.01, Math.sin(i * 1.05) * r * 0.45, i % 2 ? c : shade(c, 0.15), 1, 1, 1, 7);
        b.sph(r * 0.5, 0, r * 0.45, 0, c, 1, 1, 1, 7);
        break;
      case 'cogumelo':
        b.cyl(r * 0.35, r * 0.4, r * 0.9, 0, -r * 0.8, 0, '#fff6e6', 8);
        b.sph(r, 0, 0, 0, '#c87a4a', 1, 0.6, 1, 10);
        b.sph(0.008, r * 0.4, r * 0.45, 0.01, '#ffffff', 1, 0.5, 1, 4);
        break;
      case 'milho':
        b.cyl(r * 0.6, r * 0.5, r * 3, 0, -r * 1.5, 0, c, 10);
        for (let i = 0; i < 3; i++) b.sph(r * 0.45, Math.cos(i * 2.1) * r * 0.55, -r * 0.6, Math.sin(i * 2.1) * r * 0.55, LEAF, 0.4, 2.2, 0.4, 6);
        break;
      case 'ovo':
        b.sph(r, 0, 0, 0, c, 0.85, 1.12, 0.85, 12);
        break;
      case 'queijo': {
        const sh = new THREE.Shape();
        sh.moveTo(-r, -r * 0.8);
        sh.lineTo(r, -r * 0.8);
        sh.lineTo(-r, r * 0.8);
        sh.closePath();
        const g = new THREE.ExtrudeGeometry(sh, { depth: r * 1.2, bevelEnabled: false });
        b.geo(g, c);
        for (let i = 0; i < 3; i++) b.sph(0.008, -r * 0.4 + i * 0.02, -r * 0.2 + i * 0.01, r * 1.21, '#e9a400', 1, 1, 0.3, 5);
        break;
      }
      case 'pao':
        b.sph(r, 0, 0, 0, c, 1.3, 0.62, 0.85, 12);
        for (let i = -1; i <= 1; i++) b.box(0.012, 0.006, r * 1.2, i * r * 0.5, r * 0.55, 0, '#fff0c9', 0.4);
        break;
      case 'carne':
        b.sph(r, 0, 0, 0, c, 1.2, 0.4, 0.9, 10);
        b.sph(r * 0.35, r * 0.5, 0.004, 0.006, '#fff0f0', 1, 0.5, 0.7, 6);
        break;
      case 'tofu':
        b.box(r * 1.6, r * 1.2, r * 1.6, 0, 0, 0, c);
        break;
      case 'macarrao':
        b.box(r * 1.1, r * 1.9, r * 0.55, 0, 0, 0, '#3fa0ff');
        b.box(r * 0.8, r * 1.0, 0.004, 0, r * 0.4, r * 0.28, '#ffe18a');
        break;
      case 'arroz':
        b.sph(r, 0, 0, 0, '#e8dcc0', 0.95, 1.1, 0.8, 9);
        b.cyl(0.012, r * 0.4, r * 0.4, 0, r * 0.9, 0, '#e8dcc0', 7);
        b.box(r * 1.2, r * 0.6, 0.004, 0, -r * 0.2, r * 0.82, '#ff5c7a');
        break;
      case 'banana':
        b.tube([[-r * 1.4, r * 0.5, 0], [-r * 0.6, -r * 0.2, 0], [r * 0.6, -r * 0.2, 0], [r * 1.4, r * 0.5, 0]], r * 0.36, c, 10, 7);
        b.sph(r * 0.15, r * 1.45, r * 0.55, 0, '#5a3a10', 1, 1, 1, 5);
        break;
      case 'leite':
        b.box(r * 1.1, r * 2.0, r * 1.1, 0, -r, 0, '#ffffff');
        b.frustum(r * 1.1, r * 1.1, 0.01, r * 1.1, r * 0.5, 0, r, 0, '#3fa0ff');
        b.box(r * 1.12, r * 0.6, r * 1.12, 0, -r * 0.3, 0, '#3fa0ff');
        break;
      case 'farinha':
        b.box(r * 1.3, r * 1.8, r * 0.9, 0, -r * 0.9, 0, c);
        b.box(r * 1.1, r * 0.4, r * 0.7, 0, r * 0.9, 0, shade(c, -0.1));
        b.box(r * 0.9, r * 0.6, 0.004, 0, -r * 0.3, r * 0.46, '#ff9a2e');
        break;
      case 'chocolate':
        b.box(r * 1.9, r * 0.35, r * 1.1, 0, 0, 0, c);
        for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) b.box(r * 0.5, 0.008, r * 0.42, (i - 1) * r * 0.6, r * 0.35, (j - 0.5) * r * 0.5, shade(c, 0.15));
        break;
      default:
        b.sph(r, 0, 0, 0, c, 1, 1, 1, 10);
    }
  });
}
/** fatia (cut 1) ou cubinho (cut 2) */
export function pieceGeo(id: string, cut: number): THREE.BufferGeometry {
  return cached('p' + cut + ':' + id, (b) => {
    const d = ING.get(id);
    const skin = d?.skin ?? '#ffffff';
    const flesh = d?.flesh ?? '#ffffff';
    const r = d?.r ?? 0.05;
    if (cut >= 2) {
      const s = Math.max(0.022, r * 0.45);
      b.box(s, s * 0.9, s, 0, 0, 0, flesh);
      b.box(s * 1.01, s * 0.25, s * 1.01, 0, s * 0.7, 0, skin);
      return;
    }
    if (id === 'pao' || id === 'queijo' || id === 'tofu' || id === 'carne') {
      b.box(r * 1.5, r * 0.32, r * 1.1, 0, 0, 0, flesh);
      b.box(r * 1.55, r * 0.33, r * 0.12, 0, 0, r * 0.55, skin);
      return;
    }
    b.cyl(r * 0.85, r * 0.85, r * 0.3, 0, 0, 0, skin, 12);
    b.cyl(r * 0.78, r * 0.78, r * 0.31, 0, 0, 0, flesh, 12);
    if (id === 'tomate' || id === 'laranja' || id === 'pimentao') for (let i = 0; i < 4; i++) b.box(r * 0.7, r * 0.32, 0.006, 0, 0, 0, skin, i * 0.78);
  });
}
/** prato composto (forno, frigideira) */
export function madeGeo(m: string): THREE.BufferGeometry {
  return cached('m:' + m, (b) => {
    const c = madeColor(m);
    switch (m) {
      case 'cake':
      case 'choccake': {
        const base = m === 'cake' ? '#ffd9a8' : '#7b4a2b';
        b.cyl(0.11, 0.11, 0.05, 0, 0, 0, base, 18);
        b.cyl(0.112, 0.112, 0.012, 0, 0.05, 0, m === 'cake' ? '#ff9ad5' : '#4b2814', 18);
        b.cyl(0.1, 0.1, 0.045, 0, 0.062, 0, base, 18);
        b.cyl(0.103, 0.103, 0.015, 0, 0.105, 0, m === 'cake' ? '#ffffff' : '#a8714a', 18);
        for (let i = 0; i < 8; i++) b.sph(0.012, Math.cos(i * 0.785) * 0.085, 0.122, Math.sin(i * 0.785) * 0.085, '#ffffff', 1, 0.8, 1, 5);
        b.sph(0.018, 0, 0.13, 0, '#ff2e4a', 1, 1, 1, 7);
        break;
      }
      case 'pizza':
        b.cyl(0.12, 0.12, 0.016, 0, 0, 0, '#f2b25c', 20);
        b.cyl(0.105, 0.105, 0.018, 0, 0.002, 0, '#ff5a3c', 20);
        for (let i = 0; i < 9; i++) b.cyl(0.02, 0.02, 0.008, Math.cos(i * 2.4) * 0.065 * ((i % 3) / 2 + 0.3), 0.016, Math.sin(i * 2.4) * 0.065 * ((i % 3) / 2 + 0.3), i % 3 ? '#ffe27a' : '#3ec95a', 8);
        break;
      case 'pancake':
        for (let i = 0; i < 3; i++) b.cyl(0.075 - i * 0.004, 0.075 - i * 0.004, 0.014, 0, i * 0.015, 0, i % 2 ? '#e8a24c' : '#f2c27a', 16);
        b.cyl(0.03, 0.03, 0.01, 0, 0.045, 0, '#ffe27a', 10);
        break;
      case 'friedegg':
        b.sph(0.065, 0, 0, 0, '#fffbf0', 1, 0.14, 0.85, 12);
        b.sph(0.024, 0.008, 0.006, 0.004, '#ffc21f', 1, 0.55, 1, 10);
        break;
      case 'popcorn':
        for (let i = 0; i < 5; i++) b.sph(0.01, Math.cos(i * 1.3) * 0.008, (i % 2) * 0.006, Math.sin(i * 1.3) * 0.008, i === 2 ? '#ffe27a' : c, 1, 1, 1, 5);
        break;
      default:
        b.sph(0.05, 0, 0, 0, c, 1, 1, 1, 8);
    }
  });
}

/* ---------------- louça ---------------- */
export function plateGeo(): THREE.BufferGeometry {
  return cached('plate', (b) => b.lathe([[0, 0], [0.09, 0], [0.1, 0.006], [0.14, 0.018], [0.145, 0.022], [0.138, 0.024], [0.098, 0.012], [0, 0.012]], 0, 0, 0, WHITE, 22), false);
}
export function bowlGeo(): THREE.BufferGeometry {
  return cached('bowl', (b) => b.lathe([[0, 0], [0.05, 0], [0.06, 0.008], [0.09, 0.045], [0.095, 0.075], [0.088, 0.077], [0.08, 0.05], [0.05, 0.016], [0, 0.016]], 0, 0, 0, '#ffd9e8', 18), false);
}
export function cupGeo(): THREE.BufferGeometry {
  return cached('cup', (b) => {
    b.lathe([[0, 0], [0.035, 0], [0.042, 0.01], [0.048, 0.13], [0.044, 0.13], [0.038, 0.012], [0, 0.012]], 0, 0, 0, '#d9f2ff', 14);
    b.cyl(0.004, 0.004, 0.16, 0.02, 0.05, 0, '#ff5c7a', 5, 0, -0.2);
  }, false);
}
/** sujeira no prato (marrom) */
export function smudgeGeo(): THREE.BufferGeometry {
  return cached('smudge', (b) => {
    for (let i = 0; i < 5; i++) b.sph(0.025 + (i % 2) * 0.01, Math.cos(i * 1.7) * 0.05, 0, Math.sin(i * 1.7) * 0.05, i % 2 ? '#8a5a3c' : '#c87a4a', 1, 0.15, 1, 6);
  }, false);
}

/* ---------------- utensílios fixos ---------------- */
export function panGeo(): THREE.BufferGeometry {
  return cached('pan', (b) => {
    b.lathe([[0, 0], [0.13, 0], [0.145, 0.01], [0.16, 0.05], [0.15, 0.05], [0.135, 0.014], [0, 0.014]], 0, 0, 0, '#2e2a40', 22);
    b.box(0.24, 0.022, 0.035, 0.27, 0.035, 0, '#c2384a', 0, 0, 0.12);
  }, false);
}
export function potGeo(): THREE.BufferGeometry {
  return cached('pot', (b) => {
    b.lathe([[0, 0], [0.13, 0], [0.14, 0.015], [0.14, 0.17], [0.15, 0.18], [0.13, 0.18], [0.125, 0.02], [0, 0.02]], 0, 0, 0, METAL, 22);
    for (const s of [-1, 1]) b.torus(0.03, 0.008, s * 0.16, 0.14, 0, DARK, 0, 10, Math.PI / 2, Math.PI);
  }, false);
}
export function boardGeo(): THREE.BufferGeometry {
  return cached('board', (b) => {
    b.box(0.42, 0.025, 0.28, 0, 0, 0, '#d9a066');
    b.cyl(0.015, 0.015, 0.03, 0.18, 0, 0.1, '#8a5a3c', 8);
    // faca encostada
    b.box(0.18, 0.006, 0.035, -0.05, 0.026, -0.11, '#e8ecf8', 0.1);
    b.box(0.08, 0.016, 0.022, 0.08, 0.026, -0.097, '#ff5c7a', 0.1);
  }, false);
}
export function blenderGeo(): THREE.BufferGeometry {
  return cached('blender', (b) => {
    b.box(0.18, 0.13, 0.18, 0, 0, 0, '#ff5c7a');
    for (let i = 0; i < 3; i++) b.cyl(0.012, 0.012, 0.01, -0.05 + i * 0.05, 0.06, 0.09, '#fff', 8, Math.PI / 2);
    b.cyl(0.055, 0.06, 0.03, 0, 0.13, 0, DARK, 12);
  }, false);
}
export function jarGeo(): THREE.BufferGeometry {
  return cached('jar', (b) => b.lathe([[0.05, 0], [0.06, 0.02], [0.085, 0.24], [0.09, 0.25], [0.0, 0.25]], 0, 0, 0, '#e8f6ff', 16), false);
}
export function rackGeo(): THREE.BufferGeometry {
  return cached('rack', (b) => {
    b.box(0.26, 0.012, 0.32, 0, 0, 0, METAL);
    for (let i = 0; i < 6; i++) b.cyl(0.004, 0.004, 0.12, -0.1, 0.01, -0.13 + i * 0.052, METAL, 4);
    for (let i = 0; i < 6; i++) b.cyl(0.004, 0.004, 0.12, 0.1, 0.01, -0.13 + i * 0.052, METAL, 4);
  }, false);
}
export function trashGeo(): THREE.BufferGeometry {
  return cached('trash', (b) => {
    b.lathe([[0, 0], [0.15, 0], [0.18, 0.5], [0.165, 0.5], [0.135, 0.02], [0, 0.02]], 0, 0, 0, '#4fd67a', 16, 0, 0, 0, 0.25);
    b.torus(0.175, 0.012, 0, 0.5, 0, '#2fb39a', Math.PI / 2, 18);
    b.box(0.12, 0.08, 0.004, 0, 0.22, 0.165, '#ffffff', 0, -0.06);
  }, false);
}
export function washerGeo(): THREE.BufferGeometry {
  return cached('washer', (b) => {
    b.box(0.62, 0.85, 0.6, 0, 0, 0, '#f4f2ff');
    b.box(0.6, 0.12, 0.02, 0, 0.72, 0.3, '#d5d0e8');
    b.cyl(0.21, 0.21, 0.03, 0, 0.4, 0.3, '#8f88a8', 22, Math.PI / 2);
    b.cyl(0.16, 0.16, 0.035, 0, 0.4, 0.3, '#46d9e6', 22, Math.PI / 2);
    for (let i = 0; i < 3; i++) b.cyl(0.02, 0.02, 0.02, -0.2 + i * 0.07, 0.78, 0.31, i === 2 ? '#4fd67a' : '#5866f0', 8, Math.PI / 2);
  }, false);
}
export function basketGeo(): THREE.BufferGeometry {
  return cached('basket', (b) => {
    b.lathe([[0, 0], [0.17, 0], [0.2, 0.36], [0.185, 0.36], [0.155, 0.02], [0, 0.02]], 0, 0, 0, '#d9a066', 14, 0, 0, 0, 0.3);
    for (let i = 0; i < 4; i++) b.torus(0.17 + i * 0.008, 0.006, 0, 0.06 + i * 0.09, 0, '#b07a44', Math.PI / 2, 16);
  }, false);
}
export function planterGeo(): THREE.BufferGeometry {
  return cached('planter', (b) => {
    b.box(1.0, 0.34, 0.4, 0, 0, 0, '#b07a44');
    b.box(0.94, 0.03, 0.34, 0, 0.3, 0, '#5b3a29');
    for (let i = 0; i < 3; i++) b.box(0.012, 0.36, 0.41, -0.33 + i * 0.33, 0, 0, '#8a5a3c');
  }, false);
}
export function extGeo(): THREE.BufferGeometry {
  return cached('ext', (b) => {
    b.rcyl(0.05, 0.26, 0, -0.15, 0, '#ff3048', 12);
    b.cyl(0.02, 0.025, 0.04, 0, 0.11, 0, DARK, 8);
    b.box(0.08, 0.015, 0.02, 0.03, 0.15, 0, DARK);
    b.tube([[0, 0.14, 0], [0.04, 0.12, 0.04], [0.06, 0.02, 0.06]], 0.008, DARK, 6, 5);
    b.box(0.07, 0.04, 0.002, 0, -0.03, 0.05, '#ffffff');
  });
}
export function bagGeo(): THREE.BufferGeometry {
  return cached('bag', (b) => {
    b.sph(0.13, 0, 0, 0, '#262238', 1, 1.1, 1, 10);
    b.cyl(0.02, 0.04, 0.07, 0, 0.12, 0, '#262238', 7);
    b.torus(0.025, 0.008, 0, 0.2, 0, '#ffc93d', 0, 8);
  });
}
export function clothGeo(kind: number, col: string): THREE.BufferGeometry {
  return cached('cl' + kind + col, (b) => {
    if (kind === 0) {
      // meia
      b.box(0.05, 0.03, 0.16, 0, 0, 0, col);
      b.box(0.05, 0.03, 0.08, 0, 0, 0.1, col, 0.9);
      b.box(0.052, 0.032, 0.03, 0, 0, -0.07, '#ffffff');
    } else if (kind === 1) {
      // camiseta
      b.box(0.26, 0.03, 0.3, 0, 0, 0, col);
      for (const s of [-1, 1]) b.box(0.12, 0.028, 0.1, s * 0.17, 0, -0.08, col, s * 0.4);
      b.box(0.08, 0.032, 0.02, 0, 0, -0.14, shade(col, -0.2));
    } else {
      // pilha dobrada (roupa limpa)
      for (let i = 0; i < 3; i++) b.box(0.22, 0.035, 0.18, 0, i * 0.036, 0, i % 2 ? col : shade(col, 0.25));
    }
  });
}
export function balloonGeo(col: string): THREE.BufferGeometry {
  return cached('bal' + col, (b) => {
    b.sph(0.16, 0, 0, 0, col, 1, 1.18, 1, 12);
    b.cyl(0.02, 0.01, 0.03, 0, -0.2, 0, shade(col, -0.2), 6);
    b.cyl(0.0025, 0.0025, 0.45, 0, -0.65, 0, '#ffffff', 3);
  });
}
export function bannerGeo(): THREE.BufferGeometry {
  return cached('banner', (b) => {
    const cols = ['#ff5c7a', '#ffc93d', '#3fa0ff', '#4fd67a', '#c46bff'];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const x = -0.8 + (i / (n - 1)) * 1.6;
      const sag = -Math.sin((i / (n - 1)) * Math.PI) * 0.14;
      const tri = new THREE.BufferGeometry();
      tri.setAttribute('position', new THREE.Float32BufferAttribute([0.07, 0, 0, -0.07, 0, 0, 0, -0.17, 0, -0.07, 0, 0.004, 0.07, 0, 0.004, 0, -0.17, 0.004], 3));
      tri.computeVertexNormals();
      b.geo(tri, cols[i % cols.length], x, sag, 0);
    }
    b.tube(Array.from({ length: 9 }, (_, i) => [-0.85 + (i / 8) * 1.7, -Math.sin((i / 8) * Math.PI) * 0.14, 0] as [number, number, number]), 0.004, '#ffffff', 16, 3);
  }, false);
}
export function lightsGeo(): THREE.BufferGeometry {
  return cached('lights', (b) => {
    b.tube(Array.from({ length: 9 }, (_, i) => [-0.85 + (i / 8) * 1.7, -Math.sin((i / 8) * Math.PI) * 0.12, 0] as [number, number, number]), 0.004, '#3a5a3a', 16, 3);
  }, false);
}
export function bulbsGeo(): THREE.BufferGeometry {
  return cached('bulbs', (b) => {
    const cols = ['#ffe27a', '#ff7ab8', '#7af0ff', '#9dff7a'];
    for (let i = 0; i < 11; i++) {
      const u = i / 10;
      b.sph(0.022, -0.8 + u * 1.6, -Math.sin(u * Math.PI) * 0.12 - 0.025, 0, cols[i % 4], 1, 1.3, 1, 6);
    }
  }, false);
}
export function flameGeo(): THREE.BufferGeometry {
  return cached('flame', (b) => {
    b.cyl(0.0, 0.09, 0.26, 0, 0, 0, '#ff7a1a', 8);
    b.cyl(0.0, 0.06, 0.2, 0.05, 0, 0.03, '#ffc21f', 7);
    b.cyl(0.0, 0.05, 0.17, -0.05, 0, -0.02, '#ffc21f', 7);
    b.cyl(0.0, 0.035, 0.12, 0, 0, 0, '#fff3a0', 6);
  }, false);
}
/** plantinha da horta em 3 estágios + fruto */
export function sproutGeo(stage: number, seed: string): THREE.BufferGeometry {
  return cached('sp' + stage + seed, (b) => {
    const s = 0.4 + stage * 0.3;
    b.cyl(0.006, 0.008, 0.12 * s, 0, 0, 0, '#3ea84a', 5);
    for (let i = 0; i < 2 + stage * 2; i++) b.sph(0.035 * s, Math.cos(i * 2.2) * 0.03 * s, 0.06 * s + i * 0.015 * s, Math.sin(i * 2.2) * 0.03 * s, i % 2 ? LEAF : '#2f9e44', 1.6, 0.35, 0.8, 6);
    if (stage >= 2) {
      const c = ING.get(seed)?.skin ?? '#ff4a3d';
      for (let i = 0; i < 3; i++) b.sph(0.025, Math.cos(i * 2.1) * 0.05, 0.08 + i * 0.03, Math.sin(i * 2.1) * 0.05, c, 1, 1, 1, 7);
    }
  }, false);
}
export function tubBubblesGeo(): THREE.BufferGeometry {
  return cached('tubb', (b) => {
    for (let i = 0; i < 16; i++) b.sph(0.06 + (i % 3) * 0.02, Math.cos(i * 2.4) * (0.15 + (i % 4) * 0.12), (i % 2) * 0.03, Math.sin(i * 2.4) * (0.08 + (i % 3) * 0.08), '#ffffff', 1, 0.7, 1, 6);
  }, false);
}
/** lençol amarrotado por cima da cama */
export function messySheetGeo(w: number, d: number, col: string): THREE.BufferGeometry {
  return cached('sheet' + w.toFixed(2) + d.toFixed(2) + col, (b) => {
    for (let i = 0; i < 7; i++) b.sph(w * 0.22, Math.cos(i * 2.3) * w * 0.25, (i % 3) * 0.02, Math.sin(i * 1.7) * d * 0.25, i % 2 ? col : shade(col, 0.2), 1, 0.25, 1.3, 7);
  }, false);
}
