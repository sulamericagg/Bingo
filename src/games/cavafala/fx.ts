/* ============================================================
 *  CAVA & FALA — efeitos: torrões que voam e quicam no terreno
 *  (InstancedMesh), poeira/brilhos (partículas compartilhadas),
 *  tremidinha de câmera e confete.
 * ============================================================ */
import * as THREE from 'three';
import { Particles, PT } from '../../3d/common/particles';
import type { Terrain } from './terrain';

const MAXD = 90;
const M4 = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();
const V = new THREE.Vector3();
const SC = new THREE.Vector3();
const CC = new THREE.Color();
const C2 = new THREE.Color();

export class Fx {
  readonly debris: THREE.InstancedMesh;
  readonly parts: Particles;
  private d = new Float32Array(MAXD * 10); // x y z vx vy vz life rot rs size
  private n = 0;
  private head = 0;
  shake = 0;
  budget = 1;
  constructor(
    scene: THREE.Scene,
    private T: () => Terrain,
  ) {
    const g = new THREE.DodecahedronGeometry(0.16, 0);
    this.debris = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color: '#ffffff' }), MAXD);
    this.debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.debris.count = 0;
    this.debris.frustumCulled = false;
    for (let i = 0; i < MAXD; i++) this.debris.setColorAt(i, CC.set('#ffffff'));
    scene.add(this.debris);
    this.parts = new Particles(700);
    this.parts.floorY = -1e9;
    scene.add(this.parts.obj);
  }
  /** torrões de terra saindo do ponto (nx,ny,nz = normal da superfície) */
  chunks(x: number, y: number, z: number, nx: number, ny: number, nz: number, col: string, n: number, speed = 4): void {
    n = Math.max(1, Math.round(n * this.budget));
    for (let k = 0; k < n; k++) {
      let i: number;
      if (this.n < MAXD) i = this.n++;
      else {
        i = this.head;
        this.head = (this.head + 1) % MAXD;
      }
      const b = i * 10;
      const s = speed * (0.5 + Math.random() * 0.7);
      this.d[b] = x;
      this.d[b + 1] = y;
      this.d[b + 2] = z;
      this.d[b + 3] = (nx + (Math.random() - 0.5) * 1.4) * s;
      this.d[b + 4] = (Math.max(0.3, ny) + Math.random() * 0.8) * s;
      this.d[b + 5] = (nz + (Math.random() - 0.5) * 1.4) * s;
      this.d[b + 6] = 0.9 + Math.random() * 0.6;
      this.d[b + 7] = Math.random() * 6;
      this.d[b + 8] = (Math.random() - 0.5) * 14;
      this.d[b + 9] = 0.5 + Math.random() * 0.9;
      CC.set(col).multiplyScalar(0.8 + Math.random() * 0.4);
      this.debris.setColorAt(i, CC);
    }
    if (this.debris.instanceColor) this.debris.instanceColor.needsUpdate = true;
  }
  dust(x: number, y: number, z: number, col: string, n = 8): void {
    this.parts.budget = this.budget;
    this.parts.burst(x, y, z, n, 'poof', col, 1.6);
  }
  sparkle(x: number, y: number, z: number, n = 14, col = '#fff6a0'): void {
    this.parts.budget = this.budget;
    this.parts.burst(x, y, z, n, 'spark', col, 3);
  }
  foam(x: number, y: number, z: number, n = 12, col = '#ffffff'): void {
    this.parts.budget = this.budget;
    for (let i = 0; i < Math.round(n * this.budget); i++) {
      const a = Math.random() * 6.28;
      const s = 1 + Math.random() * 3;
      this.parts.emit(x, y, z, Math.cos(a) * s, Math.random() * 3, Math.sin(a) * s, { tile: PT.Foam, color: col, life: 0.6 + Math.random() * 0.5, size: 0.12 + Math.random() * 0.12, grow: 0.1, grav: 6, drag: 1.5 });
    }
  }
  confetti(x: number, y: number, z: number, n = 30): void {
    const cols = ['#ff4f6a', '#ffd34a', '#5ab0ff', '#5ad6a0', '#b05aff', '#ff8a3a'];
    for (let i = 0; i < Math.round(n * this.budget); i++) {
      const a = Math.random() * 6.28;
      const s = 2 + Math.random() * 4;
      this.parts.emit(x, y, z, Math.cos(a) * s, 3 + Math.random() * 5, Math.sin(a) * s, { tile: PT.Chunk, color: cols[i % cols.length], life: 1.4 + Math.random(), size: 0.07, grav: 7, drag: 1.2 });
    }
  }
  water(x: number, y: number, z: number, dx: number, dy: number, dz: number): void {
    for (let i = 0; i < 3; i++) this.parts.emit(x, y, z, dx * 6 + (Math.random() - 0.5), dy * 6 + Math.random(), dz * 6 + (Math.random() - 0.5), { tile: PT.Foam, color: '#8fd3ff', life: 0.7, size: 0.06, grav: 9 });
  }
  addShake(v: number): void {
    this.shake = Math.min(0.5, this.shake + v);
  }
  update(dt: number, cam: THREE.PerspectiveCamera, h: number): void {
    const d = this.d;
    const T = this.T();
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      const b = i * 10;
      d[b + 6] -= dt;
      if (d[b + 6] <= 0) continue;
      d[b + 4] -= 16 * dt;
      const nx = d[b] + d[b + 3] * dt,
        ny = d[b + 1] + d[b + 4] * dt,
        nz = d[b + 2] + d[b + 5] * dt;
      if (T.sample(nx, ny, nz) > 0) {
        d[b + 4] = Math.abs(d[b + 4]) * 0.35;
        d[b + 3] *= 0.6;
        d[b + 5] *= 0.6;
        d[b + 8] *= 0.5;
      } else {
        d[b] = nx;
        d[b + 1] = ny;
        d[b + 2] = nz;
      }
      d[b + 7] += d[b + 8] * dt;
      if (w !== i) {
        d.copyWithin(w * 10, b, b + 10);
        this.debris.getColorAt(i, C2);
        this.debris.setColorAt(w, C2);
      }
      const o = w * 10;
      const life = d[o + 6];
      const s = d[o + 9] * Math.min(1, life * 2.5);
      E.set(d[o + 7], d[o + 7] * 0.7, 0);
      Q.setFromEuler(E);
      M4.compose(V.set(d[o], d[o + 1], d[o + 2]), Q, SC.set(s, s, s));
      this.debris.setMatrixAt(w, M4);
      w++;
    }
    if (w !== this.n) {
      this.head = 0;
      if (this.debris.instanceColor) this.debris.instanceColor.needsUpdate = true;
    }
    this.n = w;
    this.debris.count = w;
    this.debris.instanceMatrix.needsUpdate = true;
    this.parts.update(dt, cam.fov, h);
    this.shake = Math.max(0, this.shake - dt * 1.6);
  }
  dispose(): void {
    this.debris.geometry.dispose();
    (this.debris.material as THREE.Material).dispose();
    this.debris.dispose();
    this.parts.obj.parent?.remove(this.parts.obj);
    this.parts.dispose();
  }
}
