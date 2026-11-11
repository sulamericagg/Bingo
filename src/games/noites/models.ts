/* ============================================================
 *  NOITES — modelos low-poly com cor por vértice (uma malha por
 *  tipo → instâncias). Estilo Bloop: redondo, fofo, assustador-fofo.
 * ============================================================ */
import * as THREE from 'three';
import { ITEM } from './data';
import { TK, NK } from './world';

const TAU = Math.PI * 2;
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  cyl12: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
  taper: new THREE.CylinderGeometry(0.36, 0.5, 1, 7),
  cone: new THREE.ConeGeometry(0.5, 1, 8),
  cone5: new THREE.ConeGeometry(0.5, 1, 5),
  ico: new THREE.IcosahedronGeometry(0.5, 1),
  ico0: new THREE.IcosahedronGeometry(0.5, 0),
  sph: new THREE.SphereGeometry(0.5, 14, 10),
  dodec: new THREE.DodecahedronGeometry(0.5, 0),
  torus: new THREE.TorusGeometry(0.5, 0.12, 6, 14),
};

/** construtor de peças → uma geometria com cores por vértice */
export class PB {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private m = new THREE.Matrix4();
  private nm = new THREE.Matrix3();
  private c = new THREE.Color();
  private v = new THREE.Vector3();
  add(g: THREE.BufferGeometry, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0, shadeLow = 0): this {
    this.m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
    const gg = g.index ? g.toNonIndexed() : g;
    const pa = gg.getAttribute('position');
    const na = gg.getAttribute('normal');
    this.nm.getNormalMatrix(this.m);
    this.c.set(color);
    for (let i = 0; i < pa.count; i++) {
      const ly = pa.getY(i);
      const k = shadeLow ? 1 - shadeLow + shadeLow * Math.min(1, Math.max(0, ly + 0.5)) : 1;
      this.v.fromBufferAttribute(pa, i).applyMatrix4(this.m);
      this.pos.push(this.v.x, this.v.y, this.v.z);
      this.v.fromBufferAttribute(na, i).applyMatrix3(this.nm).normalize();
      this.nor.push(this.v.x, this.v.y, this.v.z);
      this.col.push(this.c.r * k, this.c.g * k, this.c.b * k);
    }
    if (gg !== g) gg.dispose();
    return this;
  }
  geo(): THREE.BufferGeometry {
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    out.computeBoundingSphere();
    return out;
  }
  get empty(): boolean {
    return this.pos.length === 0;
  }
}

export const vcMat = (): THREE.MeshLambertMaterial => new THREE.MeshLambertMaterial({ vertexColors: true });
export const glowMat = (c: string, opacity = 1): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({ color: c, transparent: opacity < 1, opacity, fog: false });

/* ------------------------------ árvores ------------------------------ */
export function treeGeo(k: TK, lod: number): THREE.BufferGeometry {
  const b = new PB();
  const cl = lod ? G.ico0 : G.ico;
  switch (k) {
    case TK.Round:
      b.add(G.taper, '#7a4a2a', 0, 1.1, 0, 0.42, 2.2, 0.42);
      b.add(cl, '#3f9a4a', 0, 3.1, 0, 2.6, 2.2, 2.6, 0, 0, 0, 0.5);
      b.add(cl, '#4fb05a', 0.7, 3.7, 0.3, 1.6, 1.4, 1.6, 0, 1, 0, 0.4);
      if (!lod) b.add(cl, '#358a40', -0.8, 3.2, -0.4, 1.5, 1.3, 1.5, 0, 2, 0, 0.5);
      break;
    case TK.Pine:
      b.add(G.taper, '#6a3f22', 0, 1, 0, 0.34, 2, 0.34);
      for (let i = 0; i < (lod ? 2 : 3); i++) b.add(lod ? G.cone5 : G.cone, i % 2 ? '#2f7a52' : '#276a48', 0, 2 + i * 1.05, 0, 2.6 - i * 0.65, 1.7, 2.6 - i * 0.65, 0, i, 0, 0.45);
      break;
    case TK.Twisty:
      b.add(G.taper, '#3a2a40', 0, 0.9, 0, 0.5, 1.8, 0.5, 0, 0, 0.15);
      b.add(G.taper, '#3a2a40', 0.35, 2.3, 0, 0.32, 1.4, 0.32, 0, 0, -0.45);
      b.add(G.cyl, '#3a2a40', -0.45, 2, 0.1, 0.16, 1.2, 0.16, 0, 0, 0.9);
      b.add(cl, '#3b4f6a', 0.7, 3.3, 0, 1.9, 1.4, 1.9, 0, 0, 0, 0.55);
      if (!lod) b.add(cl, '#4a3f6a', -0.9, 2.6, 0.2, 1.1, 0.9, 1.1, 0, 0, 0, 0.5);
      break;
    case TK.Birch:
      b.add(G.taper, '#e8e0d0', 0, 1.3, 0, 0.3, 2.6, 0.3);
      b.add(G.cyl, '#2a2420', 0, 1.6, 0, 0.31, 0.08, 0.31);
      b.add(G.cyl, '#2a2420', 0, 0.9, 0, 0.31, 0.06, 0.31);
      b.add(cl, '#8ccf5a', 0, 3.2, 0, 1.8, 2.2, 1.8, 0, 0, 0, 0.45);
      if (!lod) b.add(cl, '#a8dc6a', 0.4, 3.9, 0.2, 1.1, 1.1, 1.1, 0, 0, 0, 0.4);
      break;
  }
  return b.geo();
}
export function stumpGeo(): THREE.BufferGeometry {
  return new PB().add(G.cyl, '#7a4a2a', 0, 0.22, 0, 0.6, 0.44, 0.6).add(G.cyl, '#f3d9a8', 0, 0.45, 0, 0.5, 0.02, 0.5).geo();
}
/** muralha de árvores escuras além da borda */
export function wallTreeGeo(): THREE.BufferGeometry {
  return new PB().add(G.cyl, '#2a1a20', 0, 1.5, 0, 0.5, 3, 0.5).add(G.cone5, '#14222a', 0, 4.5, 0, 4, 6, 4, 0, 0, 0, 0.6).geo();
}

/* ------------------------------ nós de recurso ------------------------------ */
export function nodeGeo(k: NK): THREE.BufferGeometry {
  const b = new PB();
  switch (k) {
    case NK.Rock:
      b.add(G.dodec, '#8a8aa0', 0, 0.35, 0, 1.6, 0.9, 1.3, 0.2, 0.4, 0, 0.4).add(G.dodec, '#a0a0b8', 0.6, 0.25, 0.4, 0.8, 0.6, 0.8, 0, 1, 0);
      break;
    case NK.Bush:
      b.add(G.ico, '#3d8a3a', 0, 0.5, 0, 1.5, 1.1, 1.5, 0, 0, 0, 0.5);
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9;
        b.add(G.sph, '#ff3a6a', Math.cos(a) * 0.62, 0.45 + (i % 3) * 0.18, Math.sin(a) * 0.62, 0.18, 0.18, 0.18);
      }
      break;
    case NK.Grass:
      for (let i = 0; i < 6; i++) {
        const a = i * 1.1;
        b.add(G.cone5, i % 2 ? '#8ac84a' : '#6aaa3a', Math.cos(a) * 0.25, 0.4, Math.sin(a) * 0.25, 0.18, 0.8 + (i % 3) * 0.2, 0.18, Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3);
      }
      b.add(G.sph, '#f0e8c0', 0, 0.9, 0, 0.16, 0.24, 0.16);
      break;
    case NK.Shroom:
      for (let i = 0; i < 3; i++) {
        const x = [0, 0.4, -0.35][i];
        const z = [0, 0.2, 0.3][i];
        const s = [1, 0.7, 0.55][i];
        b.add(G.cyl, '#f6eedc', x, 0.2 * s, z, 0.16 * s, 0.4 * s, 0.16 * s);
        b.add(G.sph, '#e83a4a', x, 0.42 * s, z, 0.62 * s, 0.34 * s, 0.62 * s);
        b.add(G.sph, '#ffffff', x + 0.12 * s, 0.56 * s, z, 0.1 * s, 0.06 * s, 0.1 * s);
      }
      break;
    case NK.Carrot:
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * 0.35;
        b.add(G.cone5, '#ff8a2a', x, 0.05, 0, 0.18, 0.2, 0.18, Math.PI);
        b.add(G.cone5, '#4ac04a', x, 0.35, 0, 0.12, 0.5, 0.12, 0, 0, (i - 1) * 0.3);
      }
      break;
    case NK.Pumpkin:
      for (let i = 0; i < 6; i++) b.add(G.sph, i % 2 ? '#ff8a1a' : '#f07a10', Math.cos((i / 6) * TAU) * 0.15, 0.35, Math.sin((i / 6) * TAU) * 0.15, 0.55, 0.65, 0.55);
      b.add(G.cyl, '#5a7a2a', 0, 0.75, 0, 0.08, 0.2, 0.08, 0.2);
      break;
    case NK.Junk:
      b.add(G.box, '#8a6a4a', 0, 0.3, 0, 0.8, 0.6, 0.6, 0, 0.3, 0);
      b.add(G.cyl12, '#7a8aa0', 0.6, 0.25, 0.3, 0.4, 0.5, 0.4, 0, 0, 0);
      b.add(G.torus, '#2a2a30', -0.5, 0.15, 0.3, 0.7, 0.7, 1.4, Math.PI / 2);
      b.add(G.box, '#b8c0d0', 0.1, 0.7, 0.1, 0.5, 0.15, 0.3, 0, 1, 0.3);
      break;
    case NK.Apple:
      b.add(G.taper, '#7a4a2a', 0, 0.7, 0, 0.26, 1.4, 0.26);
      b.add(G.ico, '#5ab04a', 0, 1.9, 0, 1.8, 1.4, 1.8, 0, 0, 0, 0.45);
      for (let i = 0; i < 6; i++) b.add(G.sph, '#ff3a3a', Math.cos(i) * 0.75, 1.6 + (i % 2) * 0.4, Math.sin(i) * 0.75, 0.24, 0.24, 0.24);
      break;
    case NK.Sap:
      b.add(G.taper, '#6a3f22', 0, 0.9, 0, 0.5, 1.8, 0.5);
      b.add(G.cone, '#276a48', 0, 2.6, 0, 1.8, 2.2, 1.8, 0, 0, 0, 0.4);
      b.add(G.cyl, '#b8c0d0', 0, 0.5, 0.36, 0.3, 0.32, 0.3);
      b.add(G.sph, '#ffb02e', 0, 0.85, 0.27, 0.16, 0.24, 0.12);
      break;
  }
  return b.geo();
}

export function chestGeo(open: boolean, tier: number): THREE.BufferGeometry {
  const wood = ['#a8743c', '#7a8aa0', '#8a5cff'][tier];
  const trim = ['#ffcf2e', '#e0f4ff', '#ffd34a'][tier];
  const b = new PB().add(G.box, wood, 0, 0.3, 0, 1.1, 0.6, 0.7).add(G.box, trim, 0, 0.3, 0.36, 0.2, 0.25, 0.04);
  if (open) b.add(G.box, wood, 0, 0.78, -0.45, 1.1, 0.5, 0.12, -0.3).add(G.box, '#ffe680', 0, 0.58, 0, 0.9, 0.06, 0.5);
  else b.add(G.cyl, wood, 0, 0.6, 0, 0.7, 1.1, 0.7, 0, 0, Math.PI / 2).add(G.box, trim, 0, 0.62, 0, 1.14, 0.12, 0.74);
  return b.geo();
}

/* ------------------------------ acampamento ------------------------------ */
export function fireBaseGeo(ring: boolean, big: boolean): THREE.BufferGeometry {
  const b = new PB();
  const n = big ? 14 : 10;
  const R = big ? 1.35 : 1.05;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    b.add(G.dodec, ring ? '#b8b8c8' : '#8a8a9a', Math.cos(a) * R, 0.12, Math.sin(a) * R, 0.45, 0.35, 0.45, 0, a, 0);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4;
    b.add(G.cyl, '#6a3f22', Math.cos(a) * 0.35, 0.22, Math.sin(a) * 0.35, 0.2, 1.2, 0.2, Math.PI / 2 - 0.25, a, 0);
  }
  return b.geo();
}
export function benchGeo(level: number): THREE.BufferGeometry {
  const top = ['#c08a52', '#c08a52', '#9aa8c0', '#7ad0ff', '#ff9ff3'][level];
  const b = new PB().add(G.box, top, 0, 0.85, 0, 1.8, 0.14, 0.9);
  for (const sx of [-0.75, 0.75]) for (const sz of [-0.35, 0.35]) b.add(G.box, '#7a4a2a', sx, 0.4, sz, 0.12, 0.8, 0.12);
  b.add(G.box, '#5a6478', -0.4, 1.0, 0, 0.3, 0.18, 0.3).add(G.cyl, '#8a5228', 0.4, 0.98, 0.1, 0.06, 0.6, 0.06, 0, 0, Math.PI / 2).add(G.box, '#dcd6f0', 0.68, 0.98, 0.1, 0.06, 0.22, 0.16);
  // placa com o nível (bolinhas)
  for (let i = 0; i < level; i++) b.add(G.sph, '#ffd34a', -0.6 + i * 0.25, 0.85, 0.47, 0.14, 0.14, 0.06);
  return b.geo();
}

/* ------------------------------ construções ------------------------------ */
export interface StructModel {
  geo: THREE.BufferGeometry;
  /** partes que brilham (luz) */
  glow?: THREE.BufferGeometry;
  glowCol?: string;
  /** altura da luz */
  ly: number;
}
const SM = new Map<string, StructModel>();
export function structModel(id: string): StructModel {
  let m = SM.get(id);
  if (m) return m;
  const d = ITEM[id]?.place;
  const b = new PB();
  const g = new PB();
  let ly = 1;
  const glowCol = d?.lc ?? '#ffe680';
  switch (d?.kind) {
    case 'torch':
      b.add(G.cyl, '#7a4a2a', 0, 0.7, 0, 0.12, 1.4, 0.12).add(G.cyl, '#5a3a20', 0, 1.42, 0, 0.2, 0.12, 0.2);
      g.add(G.cone, '#ffb040', 0, 1.7, 0, 0.3, 0.55, 0.3).add(G.cone, '#fff0a0', 0, 1.62, 0, 0.16, 0.3, 0.16);
      ly = 1.8;
      break;
    case 'fence': {
      const v = d.v ?? 0;
      const c = ['#a8743c', '#9aa0b0', '#6a7aa0'][v];
      for (const x of [-0.75, 0, 0.75]) b.add(v === 1 ? G.box : G.cyl, c, x, 0.55, 0, v === 1 ? 0.3 : 0.16, 1.1, v === 1 ? 0.3 : 0.16);
      for (const y of [0.35, 0.8]) b.add(G.box, ['#c08a52', '#b8bcc8', '#7a8ab0'][v], 0, y, 0, 1.7, 0.12, 0.08);
      for (const x of [-0.75, 0, 0.75]) b.add(G.cone5, c, x, 1.18, 0, 0.18, 0.2, 0.18);
      if (v === 2) g.add(G.box, '#9ffcff', 0, 0.58, 0, 1.6, 0.06, 0.1);
      ly = 0.8;
      break;
    }
    case 'bedroll':
      b.add(G.cyl12, '#3a7ad0', 0, 0.14, 0, 0.3, 1.7, 0.3, Math.PI / 2, 0, 0).add(G.box, '#8ad8ff', 0, 0.06, 0.15, 0.7, 0.1, 1.4).add(G.sph, '#ffffff', 0, 0.18, -0.55, 0.5, 0.18, 0.3);
      break;
    case 'tent':
      b.add(G.cone, '#ff8a3a', 0, 0.95, 0, 2.6, 1.9, 2.6, 0, Math.PI / 4).add(G.box, '#3a1a10', 0, 0.45, 0.9, 0.5, 0.9, 0.05);
      g.add(G.sph, '#ffb070', 0, 1.6, 0, 0.18, 0.22, 0.18);
      ly = 1.2;
      break;
    case 'pot':
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU;
        b.add(G.cyl, '#6a3f22', Math.cos(a) * 0.45, 0.7, Math.sin(a) * 0.45, 0.07, 1.5, 0.07, Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
      }
      b.add(G.sph, '#3a4250', 0, 0.55, 0, 0.8, 0.6, 0.8).add(G.cyl12, '#c97a4a', 0, 0.78, 0, 0.62, 0.04, 0.62).add(G.torus, '#2a3040', 0, 0.84, 0, 0.8, 0.8, 0.5, Math.PI / 2);
      break;
    case 'trap':
      b.add(G.cyl12, '#c8f0ff', 0, 0.3, 0, 0.5, 0.6, 0.5).add(G.cyl12, '#a8743c', 0, 0.63, 0, 0.42, 0.08, 0.42);
      g.add(G.sph, '#c8ff6a', 0.1, 0.3, 0, 0.1, 0.1, 0.1).add(G.sph, '#c8ff6a', -0.1, 0.42, 0.08, 0.08, 0.08, 0.08).add(G.sph, '#efff9a', 0, 0.2, -0.1, 0.08, 0.08, 0.08);
      ly = 0.5;
      break;
    case 'tower': {
      const v = d.v ?? 0;
      const h = [3.6, 4.6, 5.6][v];
      const c = ['#a8743c', '#8a9ab0', '#c8b0ff'][v];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + Math.PI / 4;
        b.add(G.cyl, c, Math.cos(a) * 0.55, h / 2, Math.sin(a) * 0.55, 0.14, h, 0.14, Math.sin(a) * 0.08, 0, -Math.cos(a) * 0.08);
      }
      for (let y = 0.8; y < h; y += 1.2) b.add(G.torus, c, 0, y, 0, 1.0, 1.0, 0.4, Math.PI / 2);
      b.add(G.cone, ['#ff8a3a', '#3a8aff', '#ff5cc8'][v], 0, h + 0.9, 0, 1.4, 0.7, 1.4).add(G.cyl12, '#3a3a48', 0, h, 0, 1.2, 0.15, 1.2);
      g.add(G.sph, glowCol, 0, h + 0.35, 0, 0.7, 0.6, 0.7);
      ly = h + 0.4;
      break;
    }
    case 'post':
      b.add(G.cyl, '#3a3a48', 0, 1.2, 0, 0.14, 2.4, 0.14).add(G.box, '#3a3a48', 0.25, 2.35, 0, 0.6, 0.08, 0.08).add(G.cone5, '#3a3a48', 0.5, 2.25, 0, 0.36, 0.2, 0.36, Math.PI);
      g.add(G.sph, '#ffe39a', 0.5, 2.0, 0, 0.28, 0.32, 0.28);
      ly = 2;
      break;
    case 'scare':
      b.add(G.cyl, '#7a4a2a', 0, 0.9, 0, 0.12, 1.8, 0.12).add(G.cyl, '#7a4a2a', 0, 1.35, 0, 0.1, 1.5, 0.1, 0, 0, Math.PI / 2).add(G.box, '#3a8aff', 0, 1.15, 0, 0.6, 0.6, 0.3).add(G.cone, '#c08a52', 0, 2.25, 0, 0.8, 0.35, 0.8);
      g.add(G.sph, '#ffb02e', 0, 1.85, 0, 0.55, 0.5, 0.55);
      ly = 1.9;
      break;
    case 'bell':
      b.add(G.cyl, '#7a4a2a', -0.4, 0.7, 0, 0.1, 1.4, 0.1).add(G.cyl, '#7a4a2a', 0.4, 0.7, 0, 0.1, 1.4, 0.1).add(G.cyl, '#7a4a2a', 0, 1.4, 0, 0.08, 0.9, 0.08, 0, 0, Math.PI / 2);
      b.add(G.cone, '#ffcf2e', 0, 1.1, 0, 0.5, 0.5, 0.5).add(G.sph, '#e0a000', 0, 0.85, 0, 0.12, 0.12, 0.12);
      break;
    case 'logbench':
      b.add(G.cyl12, '#8a5a32', 0, 0.3, 0, 0.5, 1.8, 0.5, 0, 0, Math.PI / 2).add(G.cyl12, '#f3d9a8', 0.91, 0.3, 0, 0.42, 0.02, 0.42, 0, 0, Math.PI / 2).add(G.cyl12, '#f3d9a8', -0.91, 0.3, 0, 0.42, 0.02, 0.42, 0, 0, Math.PI / 2);
      break;
    case 'garden':
    case 'berrybed': {
      b.add(G.box, '#8a5a32', 0, 0.15, 0, 1.6, 0.3, 1.1).add(G.box, '#4a3020', 0, 0.28, 0, 1.45, 0.05, 0.95);
      const ber = d.kind === 'berrybed';
      for (let i = 0; i < 6; i++) {
        const x = -0.5 + (i % 3) * 0.5;
        const z = i < 3 ? -0.22 : 0.22;
        b.add(ber ? G.ico : G.cone5, '#4ac04a', x, 0.5, z, ber ? 0.35 : 0.12, ber ? 0.3 : 0.4, ber ? 0.35 : 0.12);
      }
      break;
    }
    case 'drum':
      b.add(G.cyl12, '#ff4f6a', 0, 0.4, 0, 0.9, 0.8, 0.9).add(G.cyl12, '#f6eedc', 0, 0.81, 0, 0.88, 0.03, 0.88).add(G.torus, '#ffd34a', 0, 0.4, 0, 0.92, 0.92, 0.6, Math.PI / 2);
      break;
    case 'glowshroom':
      b.add(G.cyl, '#e0f8f0', 0, 0.3, 0, 0.18, 0.6, 0.18);
      g.add(G.sph, '#7affd8', 0, 0.62, 0, 0.75, 0.4, 0.75);
      ly = 0.7;
      break;
    case 'kiln':
      b.add(G.sph, '#8a7a6a', 0, 0.5, 0, 1.6, 1.4, 1.6).add(G.cyl, '#6a5a4a', 0.4, 1.4, 0, 0.3, 0.8, 0.3).add(G.box, '#2a1a10', 0, 0.35, 0.72, 0.5, 0.45, 0.1);
      g.add(G.box, '#ff8a3a', 0, 0.3, 0.74, 0.36, 0.25, 0.06);
      ly = 0.5;
      break;
    case 'still':
      b.add(G.cyl12, '#b8c8d8', 0, 0.55, 0, 0.8, 1.1, 0.8).add(G.sph, '#b8c8d8', 0, 1.1, 0, 0.8, 0.5, 0.8).add(G.cyl, '#c97a4a', 0.4, 1.1, 0, 0.08, 1, 0.08, 0, 0, 1).add(G.cyl12, '#5ab04a', 0.8, 0.25, 0, 0.35, 0.5, 0.35);
      break;
    case 'charger':
      b.add(G.box, '#3a4250', 0, 0.4, 0, 0.9, 0.8, 0.6).add(G.box, '#7aff8a', 0, 0.85, 0, 0.3, 0.12, 0.3);
      g.add(G.box, '#7aff8a', 0, 0.5, 0.31, 0.5, 0.12, 0.02);
      ly = 0.6;
      break;
    case 'solar':
      b.add(G.cyl, '#5a6478', 0, 0.5, 0, 0.12, 1, 0.12).add(G.box, '#2a5ac0', 0, 1.05, 0, 1.6, 0.06, 1.0, -0.5).add(G.box, '#c8d8f0', 0, 1.02, 0, 1.65, 0.04, 1.05, -0.5);
      break;
    case 'garage':
      b.add(G.box, '#c08a52', -1.4, 1.1, 0, 0.15, 2.2, 3).add(G.box, '#c08a52', 1.4, 1.1, 0, 0.15, 2.2, 3).add(G.box, '#c08a52', 0, 1.1, -1.5, 2.9, 2.2, 0.15);
      b.add(G.box, '#ff8a3a', 0, 2.35, 0, 3.2, 0.2, 3.3).add(G.box, '#5a6478', 0, 0.02, 0.2, 2.6, 0.04, 2.6);
      g.add(G.sph, '#ffe39a', 0, 2.1, 1.3, 0.2, 0.15, 0.2);
      ly = 2;
      break;
    default:
      b.add(G.box, '#ffffff', 0, 0.3, 0, 0.6, 0.6, 0.6);
  }
  m = { geo: b.geo(), glow: g.empty ? undefined : g.geo(), glowCol, ly };
  SM.set(id, m);
  return m;
}

/* ------------------------------ Bloops ------------------------------ */
export interface BloopCols {
  light: string;
  dark: string;
  belly: string;
  eye: string;
}
function eyeTex(eye: string, sad = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  x.fillStyle = '#fff';
  x.beginPath();
  x.arc(32, 32, 30, 0, TAU);
  x.fill();
  x.fillStyle = eye;
  x.beginPath();
  x.arc(34, 36, 17, 0, TAU);
  x.fill();
  x.fillStyle = '#fff';
  x.beginPath();
  x.arc(40, 28, 6, 0, TAU);
  x.fill();
  if (sad) {
    x.fillStyle = '#7ad0ff';
    x.beginPath();
    x.arc(20, 56, 6, 0, TAU);
    x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const EYE_T = new Map<string, THREE.CanvasTexture>();
const eyeMat = (eye: string, sad = false) => {
  const k = eye + sad;
  let t = EYE_T.get(k);
  if (!t) EYE_T.set(k, (t = eyeTex(eye, sad)));
  return new THREE.MeshLambertMaterial({ map: t });
};

export interface BloopRig {
  g: THREE.Group;
  body: THREE.Group;
  hand: THREE.Group;
  hat: THREE.Group;
  feet: THREE.Mesh[];
}
export function bloopModel(c: BloopCols, scale = 1, sad = false): BloopRig {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const mBody = new THREE.MeshLambertMaterial({ color: c.light });
  const bm = new THREE.Mesh(G.sph, mBody);
  bm.scale.set(1, 0.92, 1);
  bm.position.y = 0.5;
  body.add(bm);
  const belly = new THREE.Mesh(G.sph, new THREE.MeshLambertMaterial({ color: c.belly }));
  belly.scale.set(0.62, 0.55, 0.3);
  belly.position.set(0, 0.42, 0.36);
  body.add(belly);
  const em = eyeMat(c.eye, sad);
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(G.sph, em);
    e.scale.set(0.24, 0.28, 0.14);
    e.position.set(sx * 0.17, 0.62, 0.42);
    e.rotation.y = sx * 0.25 + Math.PI / 2 - Math.PI / 2;
    body.add(e);
    const ch = new THREE.Mesh(G.sph, new THREE.MeshBasicMaterial({ color: '#ff7aa8', transparent: true, opacity: 0.55 }));
    ch.scale.set(0.12, 0.07, 0.05);
    ch.position.set(sx * 0.3, 0.48, 0.43);
    body.add(ch);
  }
  const feet: THREE.Mesh[] = [];
  const fm = new THREE.MeshLambertMaterial({ color: c.dark });
  for (const sx of [-1, 1]) {
    const f = new THREE.Mesh(G.sph, fm);
    f.scale.set(0.24, 0.14, 0.32);
    f.position.set(sx * 0.2, 0.06, 0.05);
    g.add(f);
    feet.push(f);
  }
  const hand = new THREE.Group();
  hand.position.set(0.48, 0.45, 0.15);
  body.add(hand);
  const nub = new THREE.Mesh(G.sph, mBody);
  nub.scale.setScalar(0.16);
  hand.add(nub);
  const hat = new THREE.Group();
  hat.position.y = 0.95;
  body.add(hat);
  g.scale.setScalar(scale);
  return { g, body, hand, hat, feet };
}

/** chapéu cosmético (ou roupa de cabeça) */
export function hatMesh(id: string): THREE.Object3D | null {
  const b = new PB();
  switch (id) {
    case 'leaf':
      b.add(G.cyl, '#5a3a20', 0, 0.06, 0, 0.04, 0.14, 0.04).add(G.sph, '#3ec05a', 0.1, 0.14, 0, 0.26, 0.05, 0.14, 0, 0, 0.3);
      break;
    case 'acorn':
      b.add(G.sph, '#9a6a3c', 0, 0, 0, 0.62, 0.3, 0.62).add(G.cyl, '#5a3a20', 0, 0.14, 0, 0.05, 0.14, 0.05);
      break;
    case 'mush':
      b.add(G.sph, '#ff4f6a', 0, 0.02, 0, 0.8, 0.36, 0.8).add(G.sph, '#fff', 0.18, 0.15, 0.1, 0.12, 0.06, 0.12).add(G.sph, '#fff', -0.15, 0.12, -0.12, 0.1, 0.05, 0.1);
      break;
    case 'star':
      for (let i = 0; i < 5; i++) b.add(G.cone5, '#ffd34a', Math.sin((i / 5) * TAU) * 0.1, 0.18 + Math.cos((i / 5) * TAU) * 0.1, 0, 0.12, 0.22, 0.08, 0, 0, -(i / 5) * TAU);
      break;
    case 'crown':
      b.add(G.cyl12, '#ffcf2e', 0, 0.06, 0, 0.42, 0.14, 0.42);
      for (let i = 0; i < 5; i++) b.add(G.cone5, '#ffcf2e', Math.cos((i / 5) * TAU) * 0.18, 0.18, Math.sin((i / 5) * TAU) * 0.18, 0.1, 0.16, 0.1);
      break;
    case 'moon':
      b.add(G.torus, '#c8d8ff', 0, 0.2, 0, 0.3, 0.3, 0.5, 0, 0, 0.5);
      break;
    case 'sun':
      b.add(G.sph, '#ffb02e', 0, 0.15, 0, 0.3, 0.3, 0.3);
      for (let i = 0; i < 8; i++) b.add(G.cone5, '#ff9a2e', Math.cos((i / 8) * TAU) * 0.22, 0.15 + Math.sin((i / 8) * TAU) * 0.22, 0, 0.07, 0.14, 0.07, 0, 0, (i / 8) * TAU - Math.PI / 2);
      break;
    case 'beanie':
      b.add(G.sph, '#3a8aff', 0, -0.05, 0, 0.85, 0.5, 0.85).add(G.sph, '#ffffff', 0, 0.2, 0, 0.18, 0.18, 0.18);
      break;
    default:
      return null;
  }
  return new THREE.Mesh(b.geo(), vcMat());
}

/** ferramenta na mão */
export function toolMesh(kind: 'axe' | 'lamp' | 'hammer', col: string): THREE.Object3D {
  const b = new PB();
  if (kind === 'axe') b.add(G.cyl, '#8a5228', 0, 0.2, 0, 0.06, 0.6, 0.06).add(G.box, col, 0.08, 0.45, 0, 0.24, 0.18, 0.05).add(G.box, '#5a5a6a', -0.03, 0.45, 0, 0.06, 0.12, 0.07);
  else if (kind === 'hammer') b.add(G.cyl, '#c08a52', 0, 0.2, 0, 0.05, 0.55, 0.05).add(G.cyl12, col, 0, 0.5, 0, 0.22, 0.38, 0.22, 0, 0, Math.PI / 2);
  else b.add(G.cyl12, '#3a4250', 0, 0, 0.08, 0.1, 0.3, 0.1, Math.PI / 2).add(G.cyl12, col, 0, 0, 0.24, 0.14, 0.05, 0.14, Math.PI / 2);
  return new THREE.Mesh(b.geo(), vcMat());
}

/* ------------------------------ Sombrinhas ------------------------------ */
export function shadowBodyGeo(king: boolean): THREE.BufferGeometry {
  const b = new PB();
  b.add(G.sph, '#1a1030', 0, 0.55, 0, 1, 1.05, 1);
  // pezinhos de fumaça
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    b.add(G.cone5, '#241640', Math.cos(a) * 0.32, 0.1, Math.sin(a) * 0.32, 0.3, 0.4, 0.3, Math.PI);
  }
  // orelhinhas / chifres
  b.add(G.cone5, '#241640', -0.28, 1.08, 0, 0.22, 0.4, 0.22, 0, 0, 0.4).add(G.cone5, '#241640', 0.28, 1.08, 0, 0.22, 0.4, 0.22, 0, 0, -0.4);
  if (king) for (let i = 0; i < 5; i++) b.add(G.cone5, '#3a1a5a', (i - 2) * 0.16, 1.15, -0.05, 0.12, 0.38, 0.12, 0, 0, (i - 2) * -0.25);
  return b.geo();
}

/** textura de chão de luz (gradiente radial) */
export function glowTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.4)');
  g.addColorStop(0.9, 'rgba(255,255,255,0.08)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  return t;
}
/** sprite de ícone (SVG → canvas) para balões sobre cabeças */
export function iconSprite(svg: string, bg = '#ffffff'): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const x = c.getContext('2d')!;
  x.fillStyle = bg;
  x.strokeStyle = '#2a0b5c';
  x.lineWidth = 6;
  x.beginPath();
  x.arc(48, 44, 38, 0, TAU);
  x.fill();
  x.stroke();
  x.beginPath();
  x.moveTo(38, 78);
  x.lineTo(48, 94);
  x.lineTo(58, 78);
  x.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const img = new Image();
  img.onload = () => {
    x.drawImage(img, 20, 16, 56, 56);
    tex.needsUpdate = true;
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'));
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false, depthTest: true }));
  s.scale.setScalar(0.9);
  return s;
}
