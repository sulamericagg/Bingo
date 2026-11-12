/* ============================================================
 *  JANGADA BLOOP — cardumes de peixinhos (só debaixo d'água).
 *  Uma InstancedMesh (1 chamada de desenho) para todos os cardumes;
 *  cada cardume passeia em volta da câmera e os peixes ondulam em
 *  formação. Quantidade pelo nível de qualidade.
 * ============================================================ */
import * as THREE from 'three';
import { cone, merge, sph } from './models';

interface School {
  /** centro (relativo à câmera), raio da volta, velocidade, fase, cor */
  ox: number;
  oz: number;
  rad: number;
  sp: number;
  ph: number;
  y: number;
  n: number;
  /** âncora no mundo (fica parada; se a câmera se afasta, o cardume reaparece por perto) */
  ax: number;
  az: number;
  off: Float32Array;
}
const COLS = ['#ffb03a', '#5ad8ff', '#ff7aa8', '#ffe45c', '#9aff8a', '#c8a0ff'];

export class FishSchools {
  readonly group = new THREE.Group();
  private mesh: THREE.InstancedMesh;
  private schools: School[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3(1.6, 1.6, 1.6);
  constructor(tier: number) {
    const ns = [1, 2, 3, 4][tier] ?? 2;
    const per = [6, 9, 11, 13][tier] ?? 9;
    // peixinho: corpo achatado + rabo (aponta para +x)
    const g = merge([sph(0.09, '#ffffff', 0, 0, 0, 1.6, 0.85, 0.55, 6), cone(0.07, 0.12, '#ffffff', -0.17, 0, 0, 0, 0, Math.PI / 2, 4), sph(0.022, '#1a1a2a', 0.1, 0.025, 0.04, 1, 1, 1, 4)]);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.mesh = new THREE.InstancedMesh(g, mat, ns * per);
    this.mesh.frustumCulled = false;
    const c = new THREE.Color();
    let k = 0;
    for (let i = 0; i < ns; i++) {
      const off = new Float32Array(per * 4);
      for (let j = 0; j < per; j++) {
        off.set([(Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 1.6, Math.random() * 6.28], j * 4);
        c.set(COLS[i % COLS.length]).multiplyScalar(0.85 + Math.random() * 0.3);
        this.mesh.setColorAt(k++, c);
      }
      const a = (i / ns) * Math.PI * 2 + Math.random();
      this.schools.push({ ox: Math.cos(a) * 5, oz: Math.sin(a) * 5, rad: 2.5 + Math.random() * 3, sp: (0.25 + Math.random() * 0.2) * (Math.random() < 0.5 ? -1 : 1), ph: Math.random() * 6.28, y: 0.3 + Math.random() * 0.5, n: per, off, ax: NaN, az: NaN });
    }
    this.group.add(this.mesh);
    this.group.visible = false;
  }
  /** chão = altura do fundo onde fica o cardume (cardumes ficam entre o fundo e a superfície) */
  update(cam: THREE.Camera, on: boolean, time: number, dt: number, waterY: number, floor = -16): void {
    this.group.visible = on;
    if (!on) return;
    void dt;
    let k = 0;
    const cx = cam.position.x;
    const cz = cam.position.z;
    for (const s of this.schools) {
      // âncora parada no mundo; longe demais (fora da neblina) → reaparece perto da câmera
      if (!(Math.hypot(s.ax - cx, s.az - cz) < 26)) {
        s.ax = cx + s.ox * (1 + Math.random());
        s.az = cz + s.oz * (1 + Math.random());
      }
      const a = time * s.sp + s.ph;
      const sx = s.ax + Math.cos(a) * s.rad;
      const sz = s.az + Math.sin(a) * s.rad;
      const top = waterY - 1.2;
      const lo = Math.min(floor + 0.8, top);
      const sy = lo + Math.max(0, top - lo) * s.y + Math.sin(time * 0.3 + s.ph) * Math.min(0.6, Math.max(0, top - lo) * 0.2);
      const yaw = -a - (s.sp > 0 ? Math.PI / 2 : -Math.PI / 2);
      for (let j = 0; j < s.n; j++) {
        const o = s.off;
        const w = Math.sin(time * 6 + o[j * 4 + 3]);
        this.v.set(sx + o[j * 4] + Math.sin(time + j) * 0.15, sy + o[j * 4 + 1] + w * 0.04, sz + o[j * 4 + 2] + Math.cos(time * 0.8 + j) * 0.15);
        this.q.setFromEuler(this.e.set(0, yaw + w * 0.25, 0));
        this.mesh.setMatrixAt(k++, this.m.compose(this.v, this.q, this.s));
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
