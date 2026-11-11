/* ============================================================
 *  JANGADA BLOOP — modelos low-poly próprios (geometria juntada com
 *  cores por vértice = poucas chamadas de desenho em tablet fraco).
 *  Peças da jangada, restos boiando, Mordelão, Capitão Bu, ferramentas.
 * ============================================================ */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { DK, ItemId, PK } from './data';

export const CELL = 1.5;
export const FLOOR_H = 2.4;
export const DECK = 0.32;

/* ------------------------------ texturas ------------------------------ */
let woodTex: THREE.CanvasTexture | null = null;
export function woodTexture(): THREE.CanvasTexture {
  if (woodTex) return woodTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#e8e0d4';
  x.fillRect(0, 0, 128, 128);
  // veios
  for (let i = 0; i < 70; i++) {
    const y = Math.random() * 128;
    x.strokeStyle = `rgba(90,60,30,${0.05 + Math.random() * 0.12})`;
    x.lineWidth = 0.6 + Math.random() * 1.6;
    x.beginPath();
    x.moveTo(0, y);
    for (let s = 0; s <= 8; s++) x.lineTo(s * 16, y + Math.sin(s * 0.9 + i) * 1.6);
    x.stroke();
  }
  // nós
  for (let i = 0; i < 3; i++) {
    const cx = Math.random() * 128,
      cy = Math.random() * 128;
    x.strokeStyle = 'rgba(80,50,20,0.35)';
    for (let r = 2; r < 7; r += 1.6) {
      x.beginPath();
      x.ellipse(cx, cy, r * 2, r, 0, 0, 7);
      x.stroke();
    }
  }
  woodTex = new THREE.CanvasTexture(c);
  woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
  woodTex.colorSpace = THREE.SRGBColorSpace;
  return woodTex;
}

let flameTex: THREE.CanvasTexture | null = null;
/** chama em gota (sprite aditivo) */
export function flameTexture(): THREE.CanvasTexture {
  if (flameTex) return flameTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 92, 2, 32, 80, 40);
  g.addColorStop(0, 'rgba(255,250,210,1)');
  g.addColorStop(0.35, 'rgba(255,200,80,0.95)');
  g.addColorStop(0.7, 'rgba(255,110,30,0.6)');
  g.addColorStop(1, 'rgba(255,60,20,0)');
  x.fillStyle = g;
  x.beginPath();
  x.moveTo(32, 4);
  x.bezierCurveTo(46, 40, 62, 70, 58, 96);
  x.bezierCurveTo(54, 122, 10, 122, 6, 96);
  x.bezierCurveTo(2, 70, 18, 40, 32, 4);
  x.fill();
  flameTex = new THREE.CanvasTexture(c);
  flameTex.colorSpace = THREE.SRGBColorSpace;
  return flameTex;
}

/* ------------------------------ helpers ------------------------------ */
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _c = new THREE.Color();
function paint(g: THREE.BufferGeometry, col: string, jitter = 0): THREE.BufferGeometry {
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  _c.set(col);
  const k = 1 + (Math.random() - 0.5) * jitter;
  for (let i = 0; i < n; i++) {
    a[i * 3] = Math.min(1, _c.r * k);
    a[i * 3 + 1] = Math.min(1, _c.g * k);
    a[i * 3 + 2] = Math.min(1, _c.b * k);
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
function place(g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s = 1): THREE.BufferGeometry {
  _q.setFromEuler(_e.set(rx, ry, rz));
  _m.compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(s, s, s));
  g.applyMatrix4(_m);
  return g;
}
/** só posição/normal/uv/cor (para juntar sem erro de atributos) */
function clean(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) ng.deleteAttribute(k);
  if (!ng.getAttribute('uv')) ng.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ng.getAttribute('position').count * 2), 2));
  return ng;
}
export function box(w: number, h: number, d: number, col: string, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, jit = 0.12): THREE.BufferGeometry {
  return clean(place(paint(new THREE.BoxGeometry(w, h, d), col, jit), x, y, z, rx, ry, rz));
}
export function cyl(rt: number, rb: number, h: number, col: string, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 8): THREE.BufferGeometry {
  return clean(place(paint(new THREE.CylinderGeometry(rt, rb, h, seg), col, 0.08), x, y, z, rx, ry, rz));
}
export function sph(r: number, col: string, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, seg = 8): THREE.BufferGeometry {
  const g = paint(new THREE.SphereGeometry(r, seg, Math.max(4, Math.round(seg * 0.7))), col, 0.06);
  g.scale(sx, sy, sz);
  return clean(place(g, x, y, z));
}
export function cone(r: number, h: number, col: string, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 6): THREE.BufferGeometry {
  return clean(place(paint(new THREE.ConeGeometry(r, h, seg), col, 0.06), x, y, z, rx, ry, rz));
}
export function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(list, false)!;
  for (const x of list) x.dispose();
  g.computeBoundingSphere();
  return g;
}

/* ------------------------------ materiais ------------------------------ */
export const MAT = {
  wood: null as unknown as THREE.MeshLambertMaterial,
  vc: null as unknown as THREE.MeshLambertMaterial,
  glow: null as unknown as THREE.MeshBasicMaterial,
  ghost: null as unknown as THREE.MeshLambertMaterial,
  ghostRed: null as unknown as THREE.MeshLambertMaterial,
  cloth: null as unknown as THREE.MeshLambertMaterial,
  net: null as unknown as THREE.MeshLambertMaterial,
  flame: null as unknown as THREE.MeshBasicMaterial,
  water: null as unknown as THREE.MeshBasicMaterial,
};
let matsDone = false;
export function initMats(): void {
  if (matsDone) return;
  matsDone = true;
  MAT.wood = new THREE.MeshLambertMaterial({ vertexColors: true, map: woodTexture() });
  MAT.vc = new THREE.MeshLambertMaterial({ vertexColors: true });
  MAT.glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  MAT.ghost = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.78, emissive: new THREE.Color('#2a8a7a'), depthWrite: false });
  MAT.ghostRed = new THREE.MeshLambertMaterial({ color: '#ffffff', transparent: true, opacity: 0.4, depthWrite: false, emissive: new THREE.Color('#3aa890') });
  MAT.cloth = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  MAT.net = new THREE.MeshLambertMaterial({ map: netTexture(), transparent: true, side: THREE.DoubleSide, alphaTest: 0.3 });
  MAT.flame = new THREE.MeshBasicMaterial({ color: '#ffb040', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  MAT.water = new THREE.MeshBasicMaterial({ color: '#7fe8ff', transparent: true, opacity: 0.7 });
}
function netTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  x.strokeStyle = '#e8c27a';
  x.lineWidth = 3;
  for (let i = 0; i <= 64; i += 16) {
    x.beginPath();
    x.moveTo(i, 0);
    x.lineTo(i, 64);
    x.moveTo(0, i);
    x.lineTo(64, i);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------ peças ------------------------------ */
const WOOD = ['#d8a468', '#c8935a', '#e0b078', '#c08850', '#d49c60'];
/** piso: tábuas com frestas, vigas embaixo e boias de plástico (variação pela semente) */
export function foundationGeo(seed: number): THREE.BufferGeometry {
  const L: THREE.BufferGeometry[] = [];
  const h = CELL / 2;
  const n = 4;
  const pw = CELL / n;
  for (let i = 0; i < n; i++) {
    const off = ((seed * 7 + i * 3) % 5) * 0.012;
    L.push(box(pw - 0.022, 0.09, CELL - 0.012 - off, WOOD[(seed + i) % WOOD.length], -h + pw * (i + 0.5), DECK - 0.045, off * 0.5, 0, ((seed + i) % 3 - 1) * 0.008, 0));
  }
  // base escura: as frestas mostram madeira, não o mar
  L.push(box(CELL, 0.04, CELL, '#5a3a20', 0, DECK - 0.1, 0, 0, 0, 0, 0));
  L.push(box(CELL - 0.06, 0.1, 0.14, '#9a6a3a', 0, DECK - 0.14, -h + 0.25));
  L.push(box(CELL - 0.06, 0.1, 0.14, '#9a6a3a', 0, DECK - 0.14, h - 0.25));
  // boias (garrafas/galões)
  const cols = ['#5ec8ff', '#ff8ab8', '#ffd34a', '#7ad86a'];
  L.push(cyl(0.16, 0.16, 0.9, cols[seed % 4], -0.35, DECK - 0.33, 0, 0, 0, Math.PI / 2, 7));
  L.push(cyl(0.15, 0.15, 0.8, cols[(seed + 2) % 4], 0.4, DECK - 0.33, 0.1, 0, 0.3, Math.PI / 2, 7));
  return merge(L);
}
/** dano: tábuas "mordidas" (escurece e entorta) — feito por tinta na malha da jangada */

/** cerca/parede: poste no centro + braços até os vizinhos (máscara N=1 L=2 S=4 O=8) */
export function linkGeo(k: 'rail' | 'wall', mask: number): THREE.BufferGeometry {
  const L: THREE.BufferGeometry[] = [];
  const h = CELL / 2;
  const dirs: [number, number, number][] = [
    [1, 0, -1],
    [2, 1, 0],
    [4, 0, 1],
    [8, -1, 0],
  ];
  if (k === 'rail') {
    L.push(box(0.14, 1.05, 0.14, '#b07840', 0, DECK + 0.52, 0));
    L.push(cone(0.11, 0.12, '#ffd34a', 0, DECK + 1.1, 0, 0, Math.PI / 4, 0, 4));
    let any = false;
    for (const [bit, dx, dz] of dirs) {
      if (!(mask & bit)) continue;
      any = true;
      const len = h;
      const cx = (dx * len) / 2;
      const cz = (dz * len) / 2;
      const rot = dx ? 0 : Math.PI / 2;
      L.push(box(len, 0.09, 0.07, '#d8a060', cx, DECK + 0.95, cz, 0, rot, 0));
      L.push(box(len, 0.07, 0.06, '#c8904e', cx, DECK + 0.55, cz, 0, rot, 0));
      // ripa no meio do braço
      L.push(box(0.07, 0.5, 0.06, '#c08850', dx * len * 0.55, DECK + 0.72, dz * len * 0.55, 0, rot, 0));
    }
    if (!any) L.push(box(0.5, 0.08, 0.07, '#d8a060', 0, DECK + 0.95, 0));
  } else {
    L.push(box(0.26, 2.3, 0.26, '#9a6a3a', 0, DECK + 1.15, 0));
    let any = false;
    for (const [bit, dx, dz] of dirs) {
      if (!(mask & bit)) continue;
      any = true;
      const len = h + 0.02;
      const cx = (dx * len) / 2;
      const cz = (dz * len) / 2;
      const rot = dx ? 0 : Math.PI / 2;
      for (let r = 0; r < 5; r++) L.push(box(len, 0.44, 0.16, WOOD[(r + bit) % WOOD.length], cx, DECK + 0.24 + r * 0.45, cz, 0, rot, 0));
    }
    if (!any) for (let r = 0; r < 5; r++) L.push(box(CELL * 0.8, 0.44, 0.16, WOOD[r % WOOD.length], 0, DECK + 0.24 + r * 0.45, 0));
  }
  return merge(L);
}
export function floorGeo(): THREE.BufferGeometry {
  const L: THREE.BufferGeometry[] = [];
  const h = CELL / 2;
  for (let i = 0; i < 4; i++) L.push(box(CELL / 4 - 0.03, 0.08, CELL - 0.02, WOOD[i], -h + (CELL / 4) * (i + 0.5), DECK + FLOOR_H - 0.04, 0));
  L.push(box(CELL, 0.12, 0.12, '#8a5a2a', 0, DECK + FLOOR_H - 0.14, -h + 0.08));
  L.push(box(CELL, 0.12, 0.12, '#8a5a2a', 0, DECK + FLOOR_H - 0.14, h - 0.08));
  return merge(L);
}
/** escada: sobe para +Z local (gire com ro) */
export function stairsGeo(): THREE.BufferGeometry {
  const L: THREE.BufferGeometry[] = [];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    L.push(box(CELL * 0.8, 0.07, CELL / n + 0.02, WOOD[i % 5], 0, DECK + t * FLOOR_H, -CELL / 2 + t * CELL));
  }
  const len = Math.hypot(CELL, FLOOR_H);
  const ang = Math.atan2(FLOOR_H, CELL);
  for (const s of [-1, 1]) L.push(box(0.08, 0.16, len, '#9a6a3a', s * CELL * 0.42, DECK + FLOOR_H / 2, 0, -ang, 0, 0));
  return merge(L);
}
export function pieceGeo(k: PK, data = 0): THREE.BufferGeometry {
  const L: THREE.BufferGeometry[] = [];
  const y = DECK;
  switch (k) {
    case 'pillar':
      L.push(box(0.24, FLOOR_H, 0.24, '#9a6a3a', 0, y + FLOOR_H / 2, 0));
      L.push(box(0.4, 0.12, 0.4, '#8a5a2a', 0, y + 0.06, 0));
      break;
    case 'chest':
      L.push(box(0.9, 0.5, 0.6, '#b0703a', 0, y + 0.25, 0));
      L.push(box(0.94, 0.16, 0.64, '#c8884a', 0, y + 0.58, 0));
      L.push(box(0.96, 0.06, 0.08, '#6a4a2a', 0, y + 0.42, -0.31));
      L.push(box(0.14, 0.16, 0.06, '#ffd34a', 0, y + 0.46, -0.33));
      for (const s of [-1, 1]) L.push(box(0.06, 0.52, 0.62, '#6a4a2a', s * 0.42, y + 0.27, 0));
      break;
    case 'bed':
      L.push(box(0.95, 0.3, 1.4, '#9a6a3a', 0, y + 0.15, 0));
      L.push(box(0.88, 0.16, 1.3, '#7ac8ff', 0, y + 0.37, 0.02));
      L.push(box(0.6, 0.12, 0.3, '#ffffff', 0, y + 0.5, -0.45));
      L.push(box(0.9, 0.06, 0.7, '#ff8ab8', 0, y + 0.47, 0.3));
      L.push(box(0.95, 0.6, 0.1, '#b07840', 0, y + 0.3, -0.72));
      break;
    case 'fire': {
      // grelha de pedras + toras; nível muda o tamanho (data = nível)
      const lv = Math.max(1, data);
      const r = 0.38 + lv * 0.06;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        L.push(sph(0.11 + lv * 0.01, lv >= 3 ? '#d88a6a' : '#9a98a8', Math.cos(a) * r, y + 0.08, Math.sin(a) * r, 1.2, 0.8, 1));
      }
      for (let i = 0; i < 3; i++) L.push(cyl(0.05, 0.05, 0.6, '#6a4220', 0, y + 0.1, 0, Math.PI / 2, (i * Math.PI) / 3, 0, 5));
      // espeto/grelha
      for (const s of [-1, 1]) L.push(box(0.05, 0.6, 0.05, '#5a5a6a', s * (r + 0.05), y + 0.3, 0));
      L.push(box(r * 2 + 0.2, 0.04, 0.04, '#8a8a9a', 0, y + 0.58, 0));
      if (lv >= 2) {
        L.push(box(0.5, 0.03, 0.5, '#7a7a8a', 0, y + 0.42, 0));
        for (let i = -2; i <= 2; i++) L.push(box(0.03, 0.035, 0.5, '#a8a8b8', i * 0.1, y + 0.44, 0));
      }
      if (lv >= 3) {
        L.push(cyl(0.22, 0.26, 0.5, '#c87a5a', 0.5 + r * 0.5, y + 0.25, 0, 0, 0, 0, 8));
        L.push(cyl(0.07, 0.07, 0.6, '#8a5a4a', 0.5 + r * 0.5, y + 0.75, 0, 0, 0, 0, 6));
      }
      break;
    }
    case 'purifier':
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        L.push(box(0.05, 0.5, 0.05, '#6a6a7a', Math.cos(a) * 0.25, y + 0.25, Math.sin(a) * 0.25));
      }
      L.push(cyl(0.3, 0.24, 0.32, '#b8c4d8', 0, y + 0.62, 0, 0, 0, 0, 10));
      L.push(cyl(0.31, 0.31, 0.04, '#8a94a8', 0, y + 0.8, 0, 0, 0, 0, 10));
      L.push(cyl(0.12, 0.12, 0.06, '#3a9ad8', 0, y + 0.84, 0, 0, 0, 0, 8));
      L.push(cone(0.12, 0.18, '#ff8a3a', 0, y + 0.12, 0, 0, 0, 0, 5));
      L.push(cyl(0.06, 0.06, 0.4, '#5a3a20', 0, y + 0.05, 0, Math.PI / 2, 0.6, 0, 5));
      break;
    case 'planter':
      L.push(box(1.1, 0.4, 1.1, '#a8703a', 0, y + 0.2, 0));
      L.push(box(1.0, 0.06, 1.0, '#5a3a20', 0, y + 0.38, 0));
      break;
    case 'sail':
      L.push(cyl(0.08, 0.1, 4.4, '#8a5a2a', 0, y + 2.2, 0, 0, 0, 0, 6));
      L.push(cyl(0.05, 0.05, 2.6, '#8a5a2a', 0, y + 1.0, 0.2, 0, 0, Math.PI / 2, 5));
      L.push(box(0.5, 0.3, 0.5, '#8a5a2a', 0, y + 0.15, 0));
      break;
    case 'anchor':
      L.push(box(0.8, 0.5, 0.5, '#8a5a2a', 0, y + 0.25, 0));
      L.push(cyl(0.18, 0.18, 0.7, '#6a6a7a', 0, y + 0.62, 0, 0, 0, Math.PI / 2, 8));
      for (const s of [-1, 1]) L.push(box(0.06, 0.6, 0.1, '#6a4a2a', s * 0.4, y + 0.5, 0));
      L.push(box(0.4, 0.06, 0.06, '#6a4a2a', 0.55, y + 0.85, 0, 0, 0, 0.5));
      break;
    case 'lamp':
      L.push(box(0.1, 1.5, 0.1, '#6a4a2a', 0, y + 0.75, 0));
      L.push(box(0.4, 0.06, 0.06, '#6a4a2a', 0.15, y + 1.5, 0));
      break;
    case 'flag':
      L.push(cyl(0.04, 0.05, 2.6, '#8a5a2a', 0, y + 1.3, 0, 0, 0, 0, 5));
      L.push(sph(0.07, '#ffd34a', 0, y + 2.62, 0));
      break;
  }
  return merge(L);
}

/* ------------------------------ restos boiando ------------------------------ */
export function debrisGeo(k: DK): THREE.BufferGeometry {
  const L: THREE.BufferGeometry[] = [];
  switch (k) {
    case 'plank':
      L.push(box(0.9, 0.07, 0.22, '#d8a060', 0, 0.03, 0, 0, 0.2, 0));
      L.push(box(0.7, 0.07, 0.2, '#c08850', 0.05, 0.08, 0.08, 0, -0.3, 0.05));
      break;
    case 'plastic':
      L.push(cyl(0.12, 0.12, 0.42, '#7fd8ff', 0, 0.06, 0, 0, 0.4, Math.PI / 2, 8));
      L.push(cyl(0.06, 0.06, 0.1, '#ff5c8a', -0.23 * Math.cos(0.4), 0.06, 0.23 * Math.sin(0.4), 0, 0.4, Math.PI / 2, 6));
      L.push(box(0.3, 0.04, 0.3, '#ffd34a', 0.25, 0.02, 0.15, 0, 0.7, 0));
      break;
    case 'leaf':
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.3;
        L.push(box(0.7, 0.025, 0.2, i % 2 ? '#5cc85a' : '#3aa84a', Math.cos(a) * 0.2, 0.03 + i * 0.012, Math.sin(a) * 0.2, 0, -a, 0));
      }
      break;
    case 'barrel':
      L.push(cyl(0.32, 0.32, 0.8, '#c87a3a', 0, 0.12, 0, 0, 0, Math.PI / 2, 10));
      for (const s of [-0.28, 0, 0.28]) L.push(cyl(0.335, 0.335, 0.06, '#6a6a7a', s, 0.12, 0, 0, 0, Math.PI / 2, 10));
      break;
    case 'coco':
      L.push(sph(0.17, '#8a5a32', 0, 0.06, 0));
      L.push(sph(0.15, '#7a4a28', 0.25, 0.05, 0.08));
      break;
    case 'rope':
      L.push(clean(paint(new THREE.TorusGeometry(0.22, 0.06, 5, 12), '#e8c27a', 0.05).rotateX(Math.PI / 2).translate(0, 0.05, 0)));
      L.push(clean(paint(new THREE.TorusGeometry(0.15, 0.05, 5, 10), '#d8b06a', 0.05).rotateX(Math.PI / 2).translate(0.05, 0.11, 0)));
      break;
  }
  return merge(L);
}

/* ------------------------------ ilha: árvores, pedras, arbustos ------------------------------ */
export function palmGeo(h: number, lean: number): THREE.BufferGeometry {
  const L: THREE.BufferGeometry[] = [];
  const seg = 6;
  for (let i = 0; i < seg; i++) {
    const t = i / seg;
    const x = Math.sin(t * 1.2) * lean;
    L.push(cyl(0.16 - t * 0.05, 0.19 - t * 0.05, h / seg + 0.04, i % 2 ? '#a87a4a' : '#8a6038', x, (i + 0.5) * (h / seg), 0, 0, 0, -lean * 0.25, 6));
  }
  const tx = Math.sin(1.2) * lean;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const leaf = new THREE.PlaneGeometry(1.9, 0.5, 3, 1);
    const p = leaf.getAttribute('position');
    for (let v = 0; v < p.count; v++) {
      const lx = p.getX(v) + 0.95;
      p.setX(v, lx);
      p.setY(v, p.getY(v));
      p.setZ(v, -lx * lx * 0.18);
    }
    leaf.rotateX(-Math.PI / 2);
    leaf.rotateY(a);
    L.push(clean(place(paint(leaf, i % 2 ? '#4cc05a' : '#3aa84e', 0.1), tx, h, 0)));
  }
  L.push(sph(0.14, '#7a4a28', tx + 0.12, h - 0.15, 0.1));
  L.push(sph(0.14, '#7a4a28', tx - 0.1, h - 0.18, -0.08));
  return merge(L);
}
export function rockGeo(s: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(s, 0);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * 0.7);
  return merge([clean(paint(g, '#a8a6b8', 0.15))]);
}
export function bushGeo(): THREE.BufferGeometry {
  const L = [sph(0.45, '#3aa84e', 0, 0.35, 0, 1.2, 0.8, 1.1), sph(0.35, '#4cc05a', 0.35, 0.3, 0.1, 1, 0.8, 1)];
  for (let i = 0; i < 6; i++) {
    const a = i * 1.7;
    L.push(sph(0.07, '#ff4f8a', Math.cos(a) * 0.45, 0.45 + (i % 3) * 0.08, Math.sin(a) * 0.4, 1, 1, 1, 6));
  }
  return merge(L);
}
export function seabedGeo(k: 'seaweed' | 'clay' | 'scrap' | 'shell' | 'stone'): THREE.BufferGeometry {
  const L: THREE.BufferGeometry[] = [];
  if (k === 'seaweed') for (let i = 0; i < 5; i++) L.push(box(0.08, 1 + Math.random() * 0.8, 0.02, i % 2 ? '#2f9a5e' : '#3aba6a', (i - 2) * 0.12, 0.6, Math.random() * 0.2, 0, i, (i - 2) * 0.1));
  else if (k === 'clay') L.push(sph(0.35, '#d8865a', 0, 0.15, 0, 1.3, 0.6, 1));
  else if (k === 'scrap') {
    L.push(box(0.5, 0.2, 0.3, '#8a94a8', 0, 0.1, 0, 0.2, 0.5, 0.1));
    L.push(cyl(0.1, 0.1, 0.5, '#aab4c8', 0.2, 0.2, 0.1, 0.5, 0, 1));
  } else if (k === 'shell') L.push(cone(0.18, 0.2, '#ffb8d0', 0, 0.08, 0, Math.PI / 2, 0, 0, 7));
  else L.push(...[rockGeo(0.35)]);
  return merge(L);
}

/* ------------------------------ Mordelão (tubarão fofo) ------------------------------ */
export function sharkModel(): { root: THREE.Group; tail: THREE.Object3D; jaw: THREE.Object3D } {
  initMats();
  const root = new THREE.Group();
  const body = merge([
    sph(0.6, '#8a7ae8', 0, 0, 0, 1, 0.75, 2.4, 12),
    sph(0.52, '#f0ecff', 0, -0.2, 0.15, 0.9, 0.5, 2.1, 10),
    // barbatana dorsal
    clean(place(paint(new THREE.ConeGeometry(0.32, 0.9, 4), '#7a6ad8', 0.05), 0, 0.72, -0.1, -0.35, Math.PI / 4, 0)),
    // nadadeiras laterais
    box(0.9, 0.06, 0.35, '#7a6ad8', 0.55, -0.25, 0.4, 0, 0.3, -0.4),
    box(0.9, 0.06, 0.35, '#7a6ad8', -0.55, -0.25, 0.4, 0, -0.3, 0.4),
    // olhos grandes e bochechas
    sph(0.17, '#ffffff', 0.32, 0.18, 1.0, 1, 1, 0.6),
    sph(0.17, '#ffffff', -0.32, 0.18, 1.0, 1, 1, 0.6),
    sph(0.085, '#1a1440', 0.34, 0.2, 1.08, 1, 1, 0.6),
    sph(0.085, '#1a1440', -0.34, 0.2, 1.08, 1, 1, 0.6),
    sph(0.035, '#ffffff', 0.37, 0.24, 1.12),
    sph(0.035, '#ffffff', -0.31, 0.24, 1.12),
    sph(0.1, '#ff8ab8', 0.42, -0.02, 0.95, 1, 0.6, 0.5),
    sph(0.1, '#ff8ab8', -0.42, -0.02, 0.95, 1, 0.6, 0.5),
    // sobrancelhas bravinhas
    box(0.2, 0.04, 0.04, '#3a2a8a', 0.3, 0.38, 1.05, 0, 0, -0.35),
    box(0.2, 0.04, 0.04, '#3a2a8a', -0.3, 0.38, 1.05, 0, 0, 0.35),
  ]);
  root.add(new THREE.Mesh(body, MAT.vc));
  const jaw = new THREE.Group();
  const jg: THREE.BufferGeometry[] = [sph(0.4, '#f0ecff', 0, -0.05, 0.25, 1, 0.3, 0.7, 10)];
  for (let i = 0; i < 6; i++) jg.push(cone(0.05, 0.12, '#ffffff', (i - 2.5) * 0.11, 0.06, 0.62 - Math.abs(i - 2.5) * 0.06, 0, 0, 0, 4));
  jaw.add(new THREE.Mesh(merge(jg), MAT.vc));
  jaw.position.set(0, -0.2, 0.75);
  root.add(jaw);
  // dentes de cima
  const top: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) top.push(cone(0.05, 0.12, '#ffffff', (i - 2.5) * 0.11, -0.22, 1.32 - Math.abs(i - 2.5) * 0.06, Math.PI, 0, 0, 4));
  root.add(new THREE.Mesh(merge(top), MAT.vc));
  const tail = new THREE.Group();
  tail.add(new THREE.Mesh(merge([sph(0.3, '#8a7ae8', 0, 0, -0.2, 0.7, 0.7, 1.4), box(0.08, 1.0, 0.5, '#7a6ad8', 0, 0.15, -0.65, 0.3, 0, 0)]), MAT.vc));
  tail.position.set(0, 0, -1.3);
  root.add(tail);
  return { root, tail, jaw };
}

/* ------------------------------ Capitão Bu (fantasminha pirata) ------------------------------ */
export function ghostModel(): { root: THREE.Group; body: THREE.Mesh; bag: THREE.Mesh } {
  initMats();
  const root = new THREE.Group();
  // corpo: gota com saia ondulada
  const g = new THREE.LatheGeometry(
    Array.from({ length: 12 }, (_, i) => {
      const t = i / 11;
      const r = t < 0.85 ? Math.sin(Math.min(1, t / 0.6) * Math.PI * 0.5) * 0.48 : 0.48 - (t - 0.85) * 0.4;
      return new THREE.Vector2(Math.max(0.001, r), 1.05 - t * 1.05);
    }).reverse(),
    16,
  );
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < 0.12) {
      const a = Math.atan2(p.getZ(i), p.getX(i));
      p.setY(i, y - Math.max(0, Math.sin(a * 6) * 0.1));
    }
  }
  g.computeVertexNormals();
  const body = new THREE.Mesh(merge([clean(paint(g, '#d8fff4', 0))]), MAT.ghost);
  root.add(body);
  const face = merge([
    sph(0.1, '#1a2a3a', 0.15, 0.68, 0.38, 1, 1.3, 0.5),
    sph(0.1, '#1a2a3a', -0.15, 0.68, 0.38, 1, 1.3, 0.5),
    sph(0.03, '#ffffff', 0.17, 0.73, 0.43),
    sph(0.03, '#ffffff', -0.13, 0.73, 0.43),
    sph(0.07, '#ff8ab8', 0.27, 0.55, 0.36, 1, 0.6, 0.5),
    sph(0.07, '#ff8ab8', -0.27, 0.55, 0.36, 1, 0.6, 0.5),
    sph(0.06, '#2a1a3a', 0, 0.52, 0.43, 1.4, 0.7, 0.5),
    // chapéu de pirata (tricórnio) com caveirinha-bolha
    cyl(0.5, 0.5, 0.08, '#2a2a4a', 0, 1.0, 0, 0, 0, 0, 3),
    cyl(0.3, 0.36, 0.28, '#2a2a4a', 0, 1.14, 0, 0, 0, 0, 10),
    sph(0.07, '#ffffff', 0, 1.17, 0.31),
    box(0.14, 0.02, 0.02, '#ffd34a', 0, 1.06, 0.36),
  ]);
  root.add(new THREE.Mesh(face, MAT.vc));
  const bag = new THREE.Mesh(merge([sph(0.22, '#c8a060', 0, 0, 0, 1, 1.1, 1), box(0.1, 0.12, 0.1, '#8a6a3a', 0, 0.24, 0)]), MAT.vc);
  bag.position.set(0.5, 0.35, 0.1);
  bag.visible = false;
  root.add(bag);
  return { root, body, bag };
}
export function ghostShipModel(): THREE.Group {
  initMats();
  const root = new THREE.Group();
  const hull = merge([box(1.6, 0.5, 4, '#bff8ea', 0, 0.25, 0), cone(0.8, 1.2, '#bff8ea', 0, 0.25, 2.5, Math.PI / 2, 0, 0, 4), cyl(0.07, 0.07, 3.2, '#bff8ea', 0, 1.9, 0)]);
  root.add(new THREE.Mesh(hull, MAT.ghostRed));
  const sail = new THREE.Mesh(merge([box(1.6, 1.5, 0.04, '#e8fff8', 0, 2.2, 0.1)]), MAT.ghostRed);
  root.add(sail);
  return root;
}

/* ------------------------------ ferramentas (na mão) ------------------------------ */
export function toolGeo(id: ItemId): THREE.BufferGeometry | null {
  const L: THREE.BufferGeometry[] = [];
  switch (id) {
    case 'hook':
    case 'hook2': {
      const m = id === 'hook2' ? '#7fe0ff' : '#c8d0e0';
      L.push(cyl(0.025, 0.03, 0.55, id === 'hook2' ? '#5a6a8a' : '#a8703a', 0, 0, 0));
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        L.push(clean(paint(new THREE.TorusGeometry(0.07, 0.014, 4, 8, Math.PI), m, 0).rotateY(a).rotateZ(Math.PI).translate(Math.cos(a) * 0.05, 0.3, Math.sin(a) * 0.05)));
      }
      L.push(cyl(0.03, 0.03, 0.06, '#e8c27a', 0, -0.2, 0));
      break;
    }
    case 'hammer':
      L.push(cyl(0.025, 0.03, 0.45, '#a8703a', 0, 0, 0));
      L.push(box(0.2, 0.08, 0.08, '#ffb03a', 0, 0.24, 0));
      L.push(box(0.06, 0.09, 0.09, '#8a94a8', 0.11, 0.24, 0));
      break;
    case 'spear':
    case 'spear2':
      L.push(cyl(0.02, 0.025, 1.2, id === 'spear2' ? '#5a6a8a' : '#c8a070', 0, 0.2, 0));
      L.push(cone(0.05, 0.2, id === 'spear2' ? '#9ae0ff' : '#d8dce8', 0, 0.9, 0, 0, 0, 0, 4));
      L.push(box(0.06, 0.06, 0.06, '#ff5c5c', 0, 0.75, 0, 0, 0.7, 0));
      break;
    case 'axe':
      L.push(cyl(0.025, 0.03, 0.5, '#a8703a', 0, 0, 0));
      L.push(box(0.04, 0.16, 0.18, '#ff7a5a', 0, 0.2, 0.08));
      L.push(box(0.045, 0.14, 0.04, '#d8dce8', 0, 0.2, 0.18));
      break;
    case 'rod':
      L.push(cyl(0.012, 0.025, 1.1, '#7ad86a', 0, 0.3, 0));
      L.push(cyl(0.05, 0.05, 0.05, '#ffd34a', 0.05, -0.05, 0, 0, 0, Math.PI / 2, 8));
      break;
    case 'lantern':
      L.push(box(0.16, 0.2, 0.16, '#ffe45c', 0, 0, 0));
      L.push(box(0.18, 0.04, 0.18, '#8a94a8', 0, 0.12, 0));
      L.push(box(0.18, 0.04, 0.18, '#8a94a8', 0, -0.12, 0));
      break;
    default:
      return null;
  }
  return merge(L);
}

/* ------------------------------ ícones como sprite (comida na mão, itens no baú) ------------------------------ */
const iconTexCache = new Map<string, THREE.Texture>();
export function iconTexture(img: HTMLImageElement, key: string): THREE.Texture {
  let t = iconTexCache.get(key);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const draw = () => {
      const x = c.getContext('2d')!;
      x.clearRect(0, 0, 96, 96);
      x.drawImage(img, 0, 0, 96, 96);
      tex.needsUpdate = true;
    };
    if (img.complete && img.naturalWidth) draw();
    else img.addEventListener('load', draw, { once: true });
    t = tex;
    iconTexCache.set(key, t);
  }
  return t;
}
