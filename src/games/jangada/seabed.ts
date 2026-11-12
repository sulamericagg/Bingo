/* ============================================================
 *  JANGADA BLOOP — fundo do mar aberto: areia com dunas suaves, manchas
 *  de cascalho, pedras e tufos de alga espalhados (determinístico por
 *  posição: online todos veem igual). Uma malha só (1 draw call) que
 *  acompanha a câmera em passos de STEP m (refeita só ao passar do passo).
 *  Cáusticas + absorção da água: ocean.ts → patchSeabed (o mesmo das ilhas).
 *  Debaixo d'água a neblina esconde tudo além de ~40 m, então a malha é pequena.
 * ============================================================ */
import * as THREE from 'three';
import { box, clean, merge, paint } from './models';
import { SEABED_SAND, SEA_FLOOR, patchSeabed } from './ocean';
import { coralCluster } from './coral';

const STEP = 24;
const CELL = 12;
/** altura da areia (dunas suaves, sempre abaixo do limite do mergulho) */
export function seabedH(x: number, z: number): number {
  return SEA_FLOOR + Math.sin(x * 0.11 + Math.sin(z * 0.05) * 2) * Math.cos(z * 0.09 - 0.7) * 0.22 + Math.sin(x * 0.37 + z * 0.29) * 0.05;
}
const hash = (x: number, z: number, k: number) => {
  const s = Math.sin(x * 127.1 + z * 311.7 + k * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

export class Seabed {
  readonly mesh: THREE.Mesh;
  private cx = NaN;
  private cz = NaN;
  private readonly half: number;
  private readonly seg: number;
  private readonly deco: number;
  /** ilhas (centro + raio da malha): sem pedras/algas dentro da encosta delas */
  constructor(
    tier: number,
    private isles: () => { x: number; z: number; r: number }[],
  ) {
    this.half = tier <= 0 ? 60 : 84;
    this.seg = tier <= 0 ? 20 : 32;
    this.deco = [0.25, 0.45, 0.7, 0.8][tier] ?? 0.5;
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    patchSeabed(mat, tier, 0.05, 0.05);
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.receiveShadow = false;
  }
  update(x: number, z: number): void {
    const cx = Math.round(x / STEP) * STEP;
    const cz = Math.round(z / STEP) * STEP;
    if (cx === this.cx && cz === this.cz) return;
    this.cx = cx;
    this.cz = cz;
    const g = this.build(cx, cz);
    this.mesh.geometry.dispose();
    this.mesh.geometry = g;
  }
  private build(cx: number, cz: number): THREE.BufferGeometry {
    const H = this.half;
    const n = this.seg;
    const sand = new THREE.Color(SEABED_SAND);
    const sand2 = new THREE.Color('#c4b890');
    const grit = new THREE.Color('#7e8a7c');
    const c = new THREE.Color();
    const pos: number[] = [];
    const col: number[] = [];
    for (let j = 0; j <= n; j++)
      for (let i = 0; i <= n; i++) {
        const x = cx - H + (i / n) * H * 2;
        const z = cz - H + (j / n) * H * 2;
        pos.push(x, seabedH(x, z), z);
        const a = Math.sin(x * 0.07 + z * 0.045) * Math.sin(z * 0.06 - x * 0.03);
        c.copy(sand).lerp(sand2, Math.max(0, a) * 0.8);
        if (a < -0.35) c.lerp(grit, Math.min(1, (-a - 0.35) * 2.2));
        c.multiplyScalar(0.95 + Math.sin(x * 1.7 + z * 2.3) * 0.05);
        col.push(c.r, c.g, c.b);
      }
    const idx: number[] = [];
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const a = j * (n + 1) + i;
        const b = a + n + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    const g0 = new THREE.BufferGeometry();
    g0.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g0.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g0.setIndex(idx);
    g0.computeVertexNormals();
    const L: THREE.BufferGeometry[] = [clean(g0)];
    // pedras e algas por célula do mundo (a mesma em qualquer aparelho)
    const isl = this.isles();
    for (let gz = Math.ceil((cz - H) / CELL); gz * CELL < cz + H - 2; gz++)
      for (let gx = Math.ceil((cx - H) / CELL); gx * CELL < cx + H - 2; gx++) {
        const r0 = hash(gx, gz, 1);
        if (r0 > this.deco) continue;
        const x = (gx + 0.15 + hash(gx, gz, 2) * 0.7) * CELL;
        const z = (gz + 0.15 + hash(gx, gz, 3) * 0.7) * CELL;
        if (isl.some((q) => Math.hypot(q.x - x, q.z - z) < q.r)) continue;
        const y = seabedH(x, z);
        const k = hash(gx, gz, 4);
        if (k < 0.35) L.push(rockGeo(x, y, z, 0.5 + hash(gx, gz, 5) * 1.1, hash(gx, gz, 6)));
        else if (k < 0.6) L.push(weedGeo(x, y, z, hash(gx, gz, 7)));
        else if (k < 0.85) {
          let sd = gx * 73 + gz * 151;
          L.push(coralCluster(() => ((sd = (sd * 16807 + 11) % 2147483647) / 2147483647), x, y, z, 0.9 + hash(gx, gz, 9) * 0.6));
        }
        else {
          L.push(rockGeo(x, y, z, 0.4 + hash(gx, gz, 5) * 0.5, hash(gx, gz, 6)));
          L.push(weedGeo(x + 0.9, seabedH(x + 0.9, z + 0.4), z + 0.4, hash(gx, gz, 8)));
        }
      }
    return merge(L);
  }
  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/** pedra achatada (enterrada um pouco na areia: sem fresta embaixo) */
function rockGeo(x: number, y: number, z: number, s: number, h: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(s, 0);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const k = 0.8 + Math.sin(p.getX(i) * 4.1 + h * 9 + p.getZ(i) * 3.3) * 0.2;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * 0.6 * k, p.getZ(i) * k * (0.8 + h * 0.4));
  }
  g.rotateY(h * 6.28);
  g.translate(x, y + s * 0.18, z);
  g.computeVertexNormals();
  return clean(paint(g, h < 0.5 ? '#5d6f78' : '#6f7c74', 0.15));
}
/** tufo de alga (fitas finas, alturas diferentes) */
function weedGeo(x: number, y: number, z: number, h: number): THREE.BufferGeometry {
  const L: THREE.BufferGeometry[] = [];
  const n = 3 + Math.floor(h * 3);
  for (let i = 0; i < n; i++) {
    const a = i * 2.4 + h * 6;
    const len = 0.9 + ((h * 7 + i * 0.37) % 1) * 1.4;
    L.push(box(0.09, len, 0.025, i % 2 ? '#2f8a5a' : '#3aa86a', x + Math.cos(a) * 0.18, y + len / 2 - 0.05, z + Math.sin(a) * 0.18, Math.sin(a) * 0.18, a, Math.cos(a) * 0.18, 0.1));
  }
  return merge(L);
}
