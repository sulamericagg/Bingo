/* ============================================================
 *  CAVA & FALA — física arcade simples (sem motor externo):
 *  corpos = cápsula aproximada por 2 esferas (pé e cabeça),
 *  colisão contra o campo de densidade do terreno (empurra pelo
 *  gradiente) e contra caixas orientadas (casas, engenhocas).
 * ============================================================ */
import * as THREE from 'three';
import type { Terrain } from './terrain';

export type BoxTag = '' | 'bounce' | 'launch' | 'tele' | 'slide' | 'water' | 'jelly' | 'lift';

/** caixa orientada (giro yaw em Y, depois inclinação pitch em X local) */
export class OBox {
  readonly m = new THREE.Matrix4();
  readonly mi = new THREE.Matrix4();
  r = 1;
  tag: BoxTag = '';
  power = 1;
  /** dono (engenhoca/prédio) */
  owner: unknown = null;
  /** dir. de lançamento (catapulta) */
  dir = new THREE.Vector3(0, 1, 0);
  active = true;
  constructor(
    public x: number,
    public y: number,
    public z: number,
    public hx: number,
    public hy: number,
    public hz: number,
    public yaw = 0,
    public pitch = 0,
  ) {
    this.update();
  }
  update(): void {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    this.m.compose(new THREE.Vector3(this.x, this.y, this.z), q, new THREE.Vector3(1, 1, 1));
    this.mi.copy(this.m).invert();
    this.r = Math.hypot(this.hx, this.hy, this.hz);
  }
  /** topo (y) no ponto x,z (para caixas sem inclinação) */
  get top(): number {
    return this.y + this.hy;
  }
}

const L = new THREE.Vector3();
const Q = new THREE.Vector3();
const NW = new THREE.Vector3();
const TN = new THREE.Vector3();

/** empurra a esfera (c, r) para fora da caixa. Devolve a normal (mundo) em `n` e a penetração, ou 0. */
export function pushBox(b: OBox, c: THREE.Vector3, r: number, n: THREE.Vector3): number {
  const dx = c.x - b.x,
    dy = c.y - b.y,
    dz = c.z - b.z;
  const rr = b.r + r;
  if (dx * dx + dy * dy + dz * dz > rr * rr) return 0;
  L.copy(c).applyMatrix4(b.mi);
  Q.set(Math.max(-b.hx, Math.min(b.hx, L.x)), Math.max(-b.hy, Math.min(b.hy, L.y)), Math.max(-b.hz, Math.min(b.hz, L.z)));
  const ex = L.x - Q.x,
    ey = L.y - Q.y,
    ez = L.z - Q.z;
  const d2 = ex * ex + ey * ey + ez * ez;
  let pen: number;
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    if (d >= r) return 0;
    pen = r - d;
    NW.set(ex / d, ey / d, ez / d);
  } else {
    // centro dentro da caixa: sai pelo lado de menor penetração
    const px = b.hx - Math.abs(L.x),
      py = b.hy - Math.abs(L.y),
      pz = b.hz - Math.abs(L.z);
    if (py <= px && py <= pz) {
      NW.set(0, Math.sign(L.y) || 1, 0);
      pen = py + r;
    } else if (px <= pz) {
      NW.set(Math.sign(L.x) || 1, 0, 0);
      pen = px + r;
    } else {
      NW.set(0, 0, Math.sign(L.z) || 1);
      pen = pz + r;
    }
  }
  n.copy(NW).transformDirection(b.m);
  c.addScaledVector(n, pen);
  return pen;
}

/** raio contra caixa (slab) — devolve distância ou -1 */
export function rayBox(b: OBox, o: THREE.Vector3, d: THREE.Vector3, max: number): number {
  const lo = L.copy(o).applyMatrix4(b.mi);
  const ld = Q.copy(d).transformDirection(b.mi);
  let t0 = 0,
    t1 = max;
  const h = [b.hx, b.hy, b.hz];
  const oo = [lo.x, lo.y, lo.z];
  const dd = [ld.x, ld.y, ld.z];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(dd[a]) < 1e-9) {
      if (oo[a] < -h[a] || oo[a] > h[a]) return -1;
      continue;
    }
    let ta = (-h[a] - oo[a]) / dd[a];
    let tb = (h[a] - oo[a]) / dd[a];
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return -1;
  }
  return t0;
}

export interface Body {
  p: THREE.Vector3; // pés
  v: THREE.Vector3;
  r: number;
  h: number;
  onGround: boolean;
  groundBox: OBox | null;
  groundN: THREE.Vector3;
  /** tempo no ar */
  air: number;
  /** atrito no chão (0..1 por passo) */
  inWater: boolean;
  /** maior impacto do último passo (para "tum") */
  hitV: number;
}

export function makeBody(x: number, y: number, z: number, r = 0.38, h = 1.45): Body {
  return { p: new THREE.Vector3(x, y, z), v: new THREE.Vector3(), r, h, onGround: false, groundBox: null, groundN: new THREE.Vector3(0, 1, 0), air: 0, inWater: false, hitV: 0 };
}

export interface PhysWorld {
  terrain: Terrain;
  boxes: OBox[];
  /** limites XZ (null = sem paredes: dá para cair no vazio) */
  bounds: { x0: number; z0: number; x1: number; z1: number; r?: number } | null;
  waterY: number;
  gravity: number;
}

const C = new THREE.Vector3();
const N = new THREE.Vector3();

function collideSphere(w: PhysWorld, b: Body, cy: number, isFoot: boolean): void {
  C.set(b.p.x, b.p.y + cy, b.p.z);
  const r = b.r;
  for (let it = 0; it < 3; it++) {
    const d = w.terrain.sample(C.x, C.y, C.z);
    const pen = d + r;
    if (pen <= 0) break;
    w.terrain.normal(C.x, C.y, C.z, TN);
    C.addScaledVector(TN, Math.min(pen, 0.6));
    const vn = b.v.dot(TN);
    if (vn < 0) {
      b.hitV = Math.max(b.hitV, -vn);
      b.v.addScaledVector(TN, -vn);
    }
    if (isFoot && TN.y > 0.5) {
      b.onGround = true;
      b.groundN.copy(TN);
      b.groundBox = null;
    }
  }
  for (const bx of w.boxes) {
    if (!bx.active) continue;
    const pen = pushBox(bx, C, r, N);
    if (pen > 0) {
      const vn = b.v.dot(N);
      if (vn < 0) {
        b.hitV = Math.max(b.hitV, -vn);
        b.v.addScaledVector(N, -vn);
      }
      if (N.y > 0.5) {
        b.onGround = true;
        b.groundN.copy(N);
        b.groundBox = bx;
      }
    }
  }
  b.p.set(C.x, C.y - cy, C.z);
}

/** integra e resolve colisões (com subpassos para não atravessar) */
export function stepBody(w: PhysWorld, b: Body, dt: number, grav = 1): void {
  const sp = b.v.length() * dt;
  const n = Math.min(6, Math.max(1, Math.ceil(sp / (b.r * 0.6))));
  const h = dt / n;
  b.hitV = 0;
  const wasGround = b.onGround;
  b.onGround = false;
  b.groundBox = null;
  for (let s = 0; s < n; s++) {
    b.v.y -= w.gravity * grav * h;
    b.inWater = b.p.y + 0.5 < w.waterY;
    if (b.inWater) {
      b.v.y += w.gravity * 0.75 * h;
      b.v.multiplyScalar(Math.max(0, 1 - 2.2 * h));
    }
    b.p.addScaledVector(b.v, h);
    collideSphere(w, b, b.r, true);
    collideSphere(w, b, b.h - b.r, false);
    if (w.bounds) {
      const B = w.bounds;
      if (b.p.x < B.x0) (b.p.x = B.x0), (b.v.x = Math.max(0, b.v.x));
      if (b.p.x > B.x1) (b.p.x = B.x1), (b.v.x = Math.min(0, b.v.x));
      if (b.p.z < B.z0) (b.p.z = B.z0), (b.v.z = Math.max(0, b.v.z));
      if (b.p.z > B.z1) (b.p.z = B.z1), (b.v.z = Math.min(0, b.v.z));
      if (B.r) {
        const rr = Math.hypot(b.p.x, b.p.z);
        if (rr > B.r) {
          const k = B.r / rr;
          const nx = b.p.x / rr,
            nz = b.p.z / rr;
          b.p.x *= k;
          b.p.z *= k;
          const out = b.v.x * nx + b.v.z * nz;
          if (out > 0) (b.v.x -= out * nx), (b.v.z -= out * nz);
        }
      }
    }
  }
  // "gruda" no chão ao descer rampas suaves
  if (!b.onGround && wasGround && b.v.y <= 0.5) {
    const d = w.terrain.sample(b.p.x, b.p.y - 0.25, b.p.z);
    if (d > -0.3) {
      b.p.y -= 0.12;
      b.onGround = true;
    }
  }
  b.air = b.onGround ? 0 : b.air + dt;
}
