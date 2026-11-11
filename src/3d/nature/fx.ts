/* ============================================================
 *  NATUREZA — efeitos de corte de árvore:
 *  - natureHit: a copa da árvore golpeada sacode (uniform no shader do
 *    vento; nada muda nas instâncias) — chame hitTreeShake(x, z) a cada golpe
 *    e natureTick(dt) por quadro;
 *  - LeafBurst: chuva de folhas instanciada (uma chamada de desenho, CPU sem
 *    alocar por quadro): explode da copa no impacto, flutua e pousa no chão.
 * ============================================================ */
import * as THREE from 'three';

/** x, z da árvore golpeada; força (decai); — */
export const natureHit = { value: new THREE.Vector4(0, 0, 0, 0) };

/** sacode a copa da árvore em (x,z) */
export function hitTreeShake(x: number, z: number, k = 1): void {
  natureHit.value.set(x, z, Math.max(natureHit.value.z * 0.5, k), 0);
}
/** por quadro: amortece a sacudida */
export function natureTick(dt: number): void {
  const v = natureHit.value;
  if (v.z > 0.001) v.z *= Math.exp(-dt * 5.5);
  else v.z = 0;
}

let leafTex: THREE.CanvasTexture | null = null;
function leafTexture(): THREE.CanvasTexture {
  if (leafTex) return leafTex;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 32, 32);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#c8c8c8');
  x.fillStyle = g;
  x.beginPath();
  x.moveTo(16, 2);
  x.quadraticCurveTo(30, 14, 16, 30);
  x.quadraticCurveTo(2, 14, 16, 2);
  x.fill();
  x.strokeStyle = 'rgba(120,120,120,0.6)';
  x.beginPath();
  x.moveTo(16, 4);
  x.lineTo(16, 29);
  x.stroke();
  leafTex = new THREE.CanvasTexture(c);
  leafTex.colorSpace = THREE.SRGBColorSpace;
  return leafTex;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _c2 = new THREE.Color();

/** folhas voando (até `cap` ao mesmo tempo) */
export class LeafBurst {
  readonly mesh: THREE.InstancedMesh;
  private P: Float32Array;
  private V: Float32Array;
  private R: Float32Array;
  private L: Float32Array;
  private n = 0;
  private cap: number;
  /** altura do chão (as folhas pousam) */
  ground: (x: number, z: number) => number = () => 0;

  constructor(parent: THREE.Object3D, cap = 180) {
    this.cap = cap;
    const g = new THREE.PlaneGeometry(0.3, 0.3);
    const m = new THREE.MeshLambertMaterial({ map: leafTexture(), alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(g, m, cap);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.set('#ffffff'));
    parent.add(this.mesh);
    this.P = new Float32Array(cap * 3);
    this.V = new Float32Array(cap * 3);
    this.R = new Float32Array(cap * 4); // rotação x, y, z, giro
    this.L = new Float32Array(cap * 2); // vida, vida total
  }

  /** n folhas em volta de (x,y,z) num raio r, saindo para cima/fora com velocidade sp */
  emit(n: number, x: number, y: number, z: number, r: number, col: string | THREE.Color, sp = 3): void {
    _c.set(col);
    for (let k = 0; k < n; k++) {
      let i = this.n;
      if (i >= this.cap) {
        // recicla a mais velha
        i = Math.floor(Math.random() * this.cap);
      } else this.n++;
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * r;
      this.P[i * 3] = x + Math.cos(a) * rr;
      this.P[i * 3 + 1] = y + (Math.random() - 0.3) * r * 0.6;
      this.P[i * 3 + 2] = z + Math.sin(a) * rr;
      this.V[i * 3] = Math.cos(a) * sp * (0.3 + Math.random());
      this.V[i * 3 + 1] = sp * (0.4 + Math.random() * 0.9);
      this.V[i * 3 + 2] = Math.sin(a) * sp * (0.3 + Math.random());
      this.R[i * 4] = Math.random() * 6;
      this.R[i * 4 + 1] = Math.random() * 6;
      this.R[i * 4 + 2] = Math.random() * 6;
      this.R[i * 4 + 3] = 2 + Math.random() * 5;
      const life = 2.2 + Math.random() * 1.8;
      this.L[i * 2] = life;
      this.L[i * 2 + 1] = life;
      const t = 0.8 + Math.random() * 0.4;
      this.mesh.setColorAt(i, _c2.copy(_c).multiplyScalar(t));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number, wind = 0.6): void {
    const P = this.P;
    const V = this.V;
    const R = this.R;
    const L = this.L;
    let live = 0;
    for (let i = 0; i < this.n; i++) {
      L[i * 2] -= dt;
      const life = L[i * 2];
      if (life <= 0) {
        _m.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, _m);
        continue;
      }
      live++;
      const gy = this.ground(P[i * 3], P[i * 3 + 2]) + 0.03;
      if (P[i * 3 + 1] > gy) {
        // queda freada (arrasto alto: folha plana), balanço lateral
        V[i * 3 + 1] -= 6 * dt;
        const drag = Math.exp(-dt * 2.2);
        V[i * 3] = V[i * 3] * drag + Math.sin(life * 3 + i) * wind * dt * 3;
        V[i * 3 + 1] = Math.max(-1.4, V[i * 3 + 1] * drag);
        V[i * 3 + 2] = V[i * 3 + 2] * drag + Math.cos(life * 2.6 + i) * wind * dt * 3;
        P[i * 3] += V[i * 3] * dt;
        P[i * 3 + 1] += V[i * 3 + 1] * dt;
        P[i * 3 + 2] += V[i * 3 + 2] * dt;
        R[i * 4] += R[i * 4 + 3] * dt;
        R[i * 4 + 2] += R[i * 4 + 3] * 0.7 * dt;
      } else {
        // pousou: deita no chão
        P[i * 3 + 1] = gy;
        R[i * 4] += (Math.PI / 2 - R[i * 4]) * Math.min(1, dt * 8);
        R[i * 4 + 2] *= 1 - Math.min(1, dt * 8);
      }
      const sc = Math.min(1, life / 0.6);
      _q.setFromEuler(_e.set(R[i * 4], R[i * 4 + 1], R[i * 4 + 2]));
      _m.compose(_p.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]), _q, _s.set(sc, sc, sc));
      this.mesh.setMatrixAt(i, _m);
    }
    if (!live) this.n = 0;
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = this.n > 0;
  }

  dispose(): void {
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
