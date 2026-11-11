/* ============================================================
 *  NATUREZA — acumulador de malha indexada (posição, normal, cor)
 *  + primitivas "macias": bolhas de copa com normais esféricas
 *  (a copa inteira sombreia como um volume só, sem facetas),
 *  troncos afinando com raízes e galhos.
 * ============================================================ */
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash3, vnoise3 } from './noise';

/** bolha de copa registrada (para os cartões de folhas) */
export interface Lump {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  cp: Canopy;
  tone: number;
}

export class Mesher {
  /** bolhas de folhagem (copas) — viram userData.lumps da geometria */
  lumps: Lump[] = [];
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  get nv(): number {
    return this.pos.length / 3;
  }
  get ntri(): number {
    return this.idx.length / 3;
  }
  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, r: number, g: number, b: number): number {
    this.pos.push(x, y, z);
    const l = Math.hypot(nx, ny, nz) || 1;
    this.nor.push(nx / l, ny / l, nz / l);
    this.col.push(r, g, b);
    return this.pos.length / 3 - 1;
  }
  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }
  quad(a: number, b: number, c: number, d: number): void {
    this.idx.push(a, b, c, a, c, d);
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.nv > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    if (this.lumps.length) g.userData.lumps = this.lumps;
    return g;
  }
}

/* ------------------------------ esferas unitárias compartilhadas ------------------------------ */

interface Unit {
  p: Float32Array;
  i: ArrayLike<number>;
}
const UNITS: (Unit | null)[] = [null, null, null];
/** icosfera unitária indexada (detail 0 = 20 tri, 1 = 80 tri, 2 = 320 tri) */
export function unitIco(detail: 0 | 1 | 2): Unit {
  let u = UNITS[detail];
  if (u) return u;
  const g0 = new THREE.IcosahedronGeometry(1, detail);
  g0.deleteAttribute('normal');
  g0.deleteAttribute('uv');
  const g = mergeVertices(g0, 1e-4);
  g0.dispose();
  u = { p: (g.getAttribute('position') as THREE.BufferAttribute).array as Float32Array, i: g.getIndex()!.array };
  UNITS[detail] = u;
  return u;
}

const _c = new THREE.Color();
const _d = new THREE.Color();

/** volume da copa: centro, raios, cores clara/escura e quão "esférica" fica a normal */
export interface Canopy {
  cx: number;
  cy: number;
  cz: number;
  rx: number;
  ry: number;
  rz: number;
  light: THREE.Color;
  dark: THREE.Color;
  /** 0 = normal da própria bolha, 1 = normal da copa inteira */
  soft: number;
  /** quanto as normais puxam para cima (copas mais claras por baixo) */
  lift: number;
  /** variação de brilho por vértice */
  jit: number;
  /** recebe cartões de folhas (níveis Médio/Alto) */
  cards?: boolean;
  /** salpicos (flores) — cor e fração */
  speck?: THREE.Color;
  speckK?: number;
}

export function canopy(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, light: string | THREE.Color, dark: string | THREE.Color, soft = 0.88): Canopy {
  return {
    cx,
    cy,
    cz,
    rx,
    ry,
    rz,
    light: new THREE.Color(light),
    dark: new THREE.Color(dark),
    soft,
    lift: 0.28,
    jit: 0.04,
  };
}

/** cor da folhagem no ponto: escura por dentro/embaixo, clara no topo/fora, com variação */
export function leafColor(cp: Canopy, px: number, py: number, pz: number, tone: number, out: THREE.Color): THREE.Color {
  const qx = (px - cp.cx) / cp.rx;
  const qy = (py - cp.cy) / cp.ry;
  const qz = (pz - cp.cz) / cp.rz;
  const ql = Math.min(1, Math.hypot(qx, qy, qz));
  const up = Math.min(1, Math.max(0, qy * 0.5 + 0.5));
  // oclusão: escuro por dentro e embaixo; claro na casca e no topo; cada bolha com seu tom
  let k = 0.1 + 0.55 * ql * ql + 0.45 * up + tone * 0.2;
  k = Math.max(0, Math.min(1.15, k));
  out.copy(cp.dark).lerp(cp.light, Math.min(1, k));
  if (k > 1) out.multiplyScalar(1 + (k - 1) * 0.8);
  out.multiplyScalar(1 + (hash3(Math.round(px * 7), Math.round(py * 7), Math.round(pz * 7)) - 0.5) * 2 * cp.jit);
  if (cp.speck && cp.speckK && hash3(Math.round(px * 11) + 3, Math.round(py * 11), Math.round(pz * 11)) < cp.speckK * (0.4 + up)) out.lerp(cp.speck, 0.75);
  return out;
}

/**
 * Bolha de folhagem: icosfera deformada por ruído, transformada para (x,y,z) com raios (sx,sy,sz).
 * Normais misturadas entre a bolha e a copa toda; cor escura por dentro/embaixo, clara no topo/fora.
 * `tone` desloca a cor (−1..1) para variar bolhas vizinhas.
 */
export function blob(m: Mesher, cp: Canopy, x: number, y: number, z: number, sx: number, sy: number, sz: number, detail: 0 | 1 | 2, seed: number, amp = 0.16, tone = 0, rotY = 0): void {
  const u = unitIco(detail);
  if (cp.cards) m.lumps.push({ x, y, z, sx, sy, sz, cp, tone });
  const base = m.nv;
  const cs = Math.cos(rotY);
  const sn = Math.sin(rotY);
  for (let k = 0; k < u.p.length; k += 3) {
    const ux = u.p[k];
    const uy = u.p[k + 1];
    const uz = u.p[k + 2];
    const n = vnoise3(ux * 1.6 + seed * 3.7, uy * 1.6 + seed, uz * 1.6 - seed * 1.3);
    // base achatada (folhagem pesa para baixo)
    const r = 1 + (n - 0.5) * 2 * amp - (uy < -0.55 ? (-0.55 - uy) * 0.3 : 0);
    const lx = ux * r * sx;
    const lz = uz * r * sz;
    const px = x + lx * cs - lz * sn;
    const py = y + uy * r * sy;
    const pz = z + lx * sn + lz * cs;
    // normal da bolha (elipsoide) e da copa
    let bx = ux / sx;
    let by = uy / sy;
    let bz = uz / sz;
    const bl = Math.hypot(bx, by, bz) || 1;
    bx /= bl;
    by /= bl;
    bz /= bl;
    const qx = (px - cp.cx) / cp.rx;
    const qy = (py - cp.cy) / cp.ry;
    const qz = (pz - cp.cz) / cp.rz;
    const ql = Math.hypot(qx, qy, qz) || 1;
    const s = cp.soft;
    const nx = bx * (1 - s) + (qx / ql) * s;
    const ny = by * (1 - s) + (qy / ql) * s + cp.lift;
    const nz = bz * (1 - s) + (qz / ql) * s;
    leafColor(cp, px, py, pz, tone, _c);
    m.vert(px, py, pz, nx, ny, nz, _c.r, _c.g, _c.b);
  }
  for (let k = 0; k < u.i.length; k += 3) m.tri(base + u.i[k], base + u.i[k + 1], base + u.i[k + 2]);
}

export interface TrunkOpts {
  h: number;
  r0: number;
  r1: number;
  radial: number;
  rings: number;
  bx?: number;
  bz?: number;
  col: string | THREE.Color;
  dark?: string | THREE.Color;
  /** alargamento das raízes (0..1) */
  flare?: number;
  /** listras escuras (bétula) */
  birch?: boolean;
  /** anéis (palmeira) */
  bands?: boolean;
  /** começa abaixo do chão (esconde a base em encostas) */
  y0?: number;
  /** tampa no topo */
  cap?: boolean;
}

/** ponto no eixo do tronco (t = 0..1) */
export type TrunkAt = (t: number, out: THREE.Vector3) => THREE.Vector3;

/** tronco curvo afinando, com raízes e sulcos de casca; normais suaves analíticas */
export function trunk(m: Mesher, o: TrunkOpts): TrunkAt {
  const bx = o.bx ?? 0;
  const bz = o.bz ?? 0;
  const y0 = o.y0 ?? -0.25;
  const at: TrunkAt = (t, out) => out.set(bx * t * t, y0 + (o.h - y0) * t, bz * t * t);
  const c = new THREE.Vector3();
  _c.set(o.col);
  _d.set(o.dark ?? o.col);
  if (!o.dark) _d.multiplyScalar(0.62);
  const n = o.radial;
  const base = m.nv;
  const fl = o.flare ?? 0.5;
  for (let j = 0; j <= o.rings; j++) {
    const t = j / o.rings;
    at(t, c);
    const r = o.r0 + (o.r1 - o.r0) * Math.pow(t, 0.85);
    // inclinação do eixo (derivada) para a normal acompanhar a curva
    const dx = 2 * bx * t;
    const dz = 2 * bz * t;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const flare = 1 + Math.pow(Math.max(0, 0.16 - t) / 0.16, 2) * fl * (0.7 + 0.3 * Math.cos(a * 3 + 0.5));
      const ridge = Math.abs(Math.sin(a * 2.5 + t * 5));
      const rr = r * flare * (0.94 + ridge * 0.08);
      // cor: escura na base (oclusão do chão), clara em cima; sulcos
      let k = 0.55 + 0.45 * Math.min(1, t * 2.2 + 0.1);
      k *= 0.9 + ridge * 0.14;
      let cr = _d.r + (_c.r - _d.r) * k;
      let cg = _d.g + (_c.g - _d.g) * k;
      let cb = _d.b + (_c.b - _d.b) * k;
      if (o.birch) {
        const mark = hash3(j * 3 + (i >> 1), i, 7) < 0.33 && t > 0.08;
        if (mark || t < 0.05) {
          cr *= 0.25;
          cg *= 0.24;
          cb *= 0.24;
        }
      }
      if (o.bands && j % 2 === 1) {
        cr *= 0.78;
        cg *= 0.76;
        cb *= 0.74;
      }
      m.vert(c.x + ca * rr, c.y, c.z + sa * rr, ca, -(dx * ca + dz * sa) * 0.3 + (o.r0 - o.r1) / o.h, sa, cr, cg, cb);
    }
  }
  const row = n + 1;
  for (let j = 0; j < o.rings; j++)
    for (let i = 0; i < n; i++) {
      const a = base + j * row + i;
      m.quad(a, a + row, a + row + 1, a + 1);
    }
  if (o.cap) {
    at(1, c);
    const top = m.vert(c.x, c.y + o.r1 * 0.4, c.z, 0, 1, 0, _c.r, _c.g, _c.b);
    const r0 = base + o.rings * row;
    for (let i = 0; i < n; i++) m.tri(r0 + i + 1, r0 + i, top);
  }
  return at;
}

/** galho afinando de a até b (raio r na base), sem tampas */
export function branch(m: Mesher, a: THREE.Vector3, b: THREE.Vector3, r: number, col: THREE.Color, radial = 4): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const L = Math.hypot(dx, dy, dz) || 1;
  const ax = dx / L;
  const ay = dy / L;
  const az = dz / L;
  // base ortonormal
  let ux = -az;
  let uy = 0;
  let uz = ax;
  let ul = Math.hypot(ux, uy, uz);
  if (ul < 1e-3) {
    ux = 1;
    uy = 0;
    uz = 0;
    ul = 1;
  }
  ux /= ul;
  uz /= ul;
  // v = u × eixo (mesmo sentido de giro do tronco: faces para fora)
  const vx = uy * az - uz * ay;
  const vy = uz * ax - ux * az;
  const vz = ux * ay - uy * ax;
  const base = m.nv;
  for (let j = 0; j <= 1; j++) {
    const rr = j ? r * 0.35 : r;
    const px = j ? b.x : a.x;
    const py = j ? b.y : a.y;
    const pz = j ? b.z : a.z;
    const k = j ? 1 : 0.8;
    for (let i = 0; i <= radial; i++) {
      const t = (i / radial) * Math.PI * 2;
      const nx = ux * Math.cos(t) + vx * Math.sin(t);
      const ny = uy * Math.cos(t) + vy * Math.sin(t);
      const nz = uz * Math.cos(t) + vz * Math.sin(t);
      m.vert(px + nx * rr, py + ny * rr, pz + nz * rr, nx, ny, nz, col.r * k, col.g * k, col.b * k);
    }
  }
  const row = radial + 1;
  for (let i = 0; i < radial; i++) m.quad(base + i, base + row + i, base + row + i + 1, base + i + 1);
}
