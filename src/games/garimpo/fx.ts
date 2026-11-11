/* ============================================================
 *  GARIMPO BRUTO — efeitos: torrões de terra / gotas (InstancedMesh em pool),
 *  chuva (linhas animadas no shader, zero CPU por quadro), fogo e fumaça.
 * ============================================================ */
import * as THREE from 'three';
import type { Terrain } from './terrain';

export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private max: number;
  private n = 0;
  private px: Float32Array;
  private py: Float32Array;
  private pz: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private vz: Float32Array;
  private ra: Float32Array;
  private rb: Float32Array;
  private life: Float32Array;
  private size: Float32Array;
  private settled: Uint8Array;
  private cr: Float32Array;
  private cg: Float32Array;
  private cb: Float32Array;
  /** 0..1 — fração das partículas pedidas que nascem (qualidade) */
  budget = 1;
  private acc = 0;
  /** gota caindo no chão/água: (x, z) */
  onLand: ((x: number, z: number) => void) | null = null;
  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, max: number, private water = false) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    const f = () => new Float32Array(max);
    this.px = f();
    this.py = f();
    this.pz = f();
    this.vx = f();
    this.vy = f();
    this.vz = f();
    this.ra = f();
    this.rb = f();
    this.life = f();
    this.size = f();
    this.cr = f();
    this.cg = f();
    this.cb = f();
    this.settled = new Uint8Array(max);
  }
  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, r: number, g: number, b: number): void {
    this.acc += this.budget;
    if (this.acc < 1) return;
    this.acc -= 1;
    if (this.n >= this.max) return;
    const i = this.n++;
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.ra[i] = Math.random() * 6;
    this.rb[i] = Math.random() * 6;
    this.life[i] = 4;
    this.size[i] = size;
    this.settled[i] = 0;
    this.cr[i] = r;
    this.cg[i] = g;
    this.cb[i] = b;
  }
  clear(): void {
    this.n = 0;
    this.mesh.count = 0;
  }
  update(dt: number, T: Terrain, waterY: (x: number, z: number) => number): void {
    const M = this.mesh.instanceMatrix.array as Float32Array;
    const Cc = this.mesh.instanceColor!.array as Float32Array;
    let i = 0;
    while (i < this.n) {
      if (!this.settled[i]) {
        this.vy[i] -= 9.8 * dt;
        this.px[i] += this.vx[i] * dt;
        this.py[i] += this.vy[i] * dt;
        this.pz[i] += this.vz[i] * dt;
        this.ra[i] += dt * 7;
        const g = Math.max(T.heightAt(this.px[i], this.pz[i]), waterY(this.px[i], this.pz[i]));
        if (this.py[i] < g + this.size[i] * 0.3) {
          if (this.water) {
            this.onLand?.(this.px[i], this.pz[i]);
            this.life[i] = 0;
          } else {
            this.py[i] = g + this.size[i] * 0.2;
            this.settled[i] = 1;
            this.life[i] = Math.min(this.life[i], 1.4);
          }
        }
      }
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // troca com o último (sem buracos no pool)
        const l = --this.n;
        if (i !== l) {
          this.px[i] = this.px[l];
          this.py[i] = this.py[l];
          this.pz[i] = this.pz[l];
          this.vx[i] = this.vx[l];
          this.vy[i] = this.vy[l];
          this.vz[i] = this.vz[l];
          this.ra[i] = this.ra[l];
          this.rb[i] = this.rb[l];
          this.life[i] = this.life[l];
          this.size[i] = this.size[l];
          this.settled[i] = this.settled[l];
          this.cr[i] = this.cr[l];
          this.cg[i] = this.cg[l];
          this.cb[i] = this.cb[l];
        }
        continue;
      }
      const s = this.size[i] * Math.min(1, this.life[i] / 0.7);
      const ca = Math.cos(this.ra[i]);
      const sa = Math.sin(this.ra[i]);
      const cb = Math.cos(this.rb[i]);
      const sb = Math.sin(this.rb[i]);
      const o = i * 16;
      // R = Ry(b) * Rx(a), escala uniforme
      M[o] = cb * s;
      M[o + 1] = 0;
      M[o + 2] = -sb * s;
      M[o + 3] = 0;
      M[o + 4] = sb * sa * s;
      M[o + 5] = ca * s;
      M[o + 6] = cb * sa * s;
      M[o + 7] = 0;
      M[o + 8] = sb * ca * s;
      M[o + 9] = -sa * s;
      M[o + 10] = cb * ca * s;
      M[o + 11] = 0;
      M[o + 12] = this.px[i];
      M[o + 13] = this.py[i];
      M[o + 14] = this.pz[i];
      M[o + 15] = 1;
      Cc[i * 3] = this.cr[i];
      Cc[i * 3 + 1] = this.cg[i];
      Cc[i * 3 + 2] = this.cb[i];
      i++;
    }
    this.mesh.count = this.n;
    if (this.n) {
      this.mesh.instanceMatrix.clearUpdateRanges();
      this.mesh.instanceMatrix.addUpdateRange(0, this.n * 16);
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor!.clearUpdateRanges();
      this.mesh.instanceColor!.addUpdateRange(0, this.n * 3);
      this.mesh.instanceColor!.needsUpdate = true;
    }
  }
  get active(): number {
    return this.n;
  }
}

export function makeClods(max: number): Particles {
  const geo = new THREE.DodecahedronGeometry(1, 0);
  return new Particles(geo, new THREE.MeshLambertMaterial({ flatShading: true }), max);
}
export function makeDrops(max: number): Particles {
  const geo = new THREE.IcosahedronGeometry(1, 0);
  geo.scale(0.7, 1.4, 0.7);
  return new Particles(geo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.75 }), max, true);
}

/* ------------------------------ chuva ------------------------------ */
export class Rain {
  readonly mesh: THREE.LineSegments;
  private u: { uTime: { value: number }; uCam: { value: THREE.Vector3 }; uAlpha: { value: number } };
  constructor(count: number) {
    const pos = new Float32Array(count * 6);
    const end = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const x = Math.random();
      const y = Math.random();
      const z = Math.random();
      pos.set([x, y, z, x, y, z], i * 6);
      end[i * 2 + 1] = 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.u = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uAlpha: { value: 0 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.u,
      transparent: true,
      depthWrite: false,
      vertexShader: `attribute float aEnd; uniform float uTime; uniform vec3 uCam; varying float vA;
        void main(){ vec3 p = position; vec3 box = vec3(40.0, 26.0, 40.0);
          p.y = fract(p.y - uTime * 0.85);
          vec3 w = uCam + (p - 0.5) * box;
          w.xz = uCam.xz + (fract((w.xz - uCam.xz) / box.xz + 0.5) - 0.5) * box.xz;
          w.y += aEnd * 0.9; w.x += aEnd * 0.12;
          vA = aEnd;
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0); }`,
      fragmentShader: `uniform float uAlpha; varying float vA; void main(){ gl_FragColor = vec4(0.78, 0.84, 0.92, uAlpha * (0.25 + 0.4 * vA)); }`,
    });
    this.mesh = new THREE.LineSegments(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }
  update(t: number, cam: THREE.Vector3, k: number): void {
    this.mesh.visible = k > 0.02;
    this.u.uTime.value = t;
    this.u.uCam.value.copy(cam);
    this.u.uAlpha.value = k;
  }
  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/* ------------------------------ fogo ------------------------------ */
/** chamas (cones laranja/amarelos) e fumaça para um conjunto de pontos queimando */
export class Flames {
  readonly group = new THREE.Group();
  private fl: THREE.InstancedMesh;
  private sm: THREE.InstancedMesh;
  private max: number;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  constructor(max: number) {
    this.max = max;
    const cg = new THREE.ConeGeometry(0.8, 2.2, 6);
    cg.translate(0, 1.1, 0);
    this.fl = new THREE.InstancedMesh(cg, new THREE.MeshBasicMaterial({ color: 0xffffff }), max * 2);
    this.fl.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 6), 3);
    this.sm = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x555555, transparent: true, opacity: 0.55, depthWrite: false }), max);
    this.fl.frustumCulled = this.sm.frustumCulled = false;
    this.fl.count = this.sm.count = 0;
    this.group.add(this.fl, this.sm);
  }
  /** pts: [x,y,z,intensidade]*n */
  update(t: number, pts: Float32Array, n: number): void {
    n = Math.min(n, this.max);
    let f = 0;
    for (let i = 0; i < n; i++) {
      const x = pts[i * 4];
      const y = pts[i * 4 + 1];
      const z = pts[i * 4 + 2];
      const k = pts[i * 4 + 3];
      for (let j = 0; j < 2; j++) {
        const fl = 0.7 + 0.3 * Math.sin(t * (9 + j * 4) + i * 1.7 + j);
        const sc = k * (j ? 0.65 : 1) * fl * 2.4;
        this.q.setFromAxisAngle(this.v.set(0, 1, 0), t * 2 + i);
        this.m4.compose(this.v.set(x + (j ? 0.4 : -0.2), y, z + (j ? -0.3 : 0.2)), this.q, this.s.set(sc, sc * (1.2 + 0.3 * fl), sc));
        this.fl.setMatrixAt(f, this.m4);
        this.fl.setColorAt(f, _col.setRGB(1, j ? 0.85 : 0.42, j ? 0.2 : 0.05));
        f++;
      }
      const ph = (t * 0.35 + i * 0.37) % 1;
      const ss = (1.2 + ph * 3.5) * k;
      this.m4.compose(this.v.set(x + ph * 2, y + 4 + ph * 12, z + ph), this.q.identity(), this.s.set(ss, ss, ss));
      this.sm.setMatrixAt(i, this.m4);
    }
    this.fl.count = f;
    this.sm.count = n;
    this.fl.instanceMatrix.needsUpdate = true;
    if (this.fl.instanceColor) this.fl.instanceColor.needsUpdate = true;
    this.sm.instanceMatrix.needsUpdate = true;
  }
}
const _col = new THREE.Color();
