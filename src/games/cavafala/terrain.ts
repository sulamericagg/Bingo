/* ============================================================
 *  CAVA & FALA — TERRENO LISO DESTRUTÍVEL.
 *  Campo de densidade (≈ distância com sinal, em metros; >0 = sólido)
 *  numa grade de voxels + material por voxel. Malha por pedaços
 *  (16³) com "surface nets" (superfície lisa, 1 vértice por célula),
 *  normais pelo gradiente, cor por vértice com variação, inclinação
 *  (grama só no plano), oclusão barata e detalhe "triplanar" no shader.
 *  Só os pedaços sujos são refeitos (orçamento por quadro).
 * ============================================================ */
import * as THREE from 'three';
import { HARD, M, MAT_COL, type Inv, type Theme } from './data';
import { hash3 } from './noise';

export const CS = 16;
const W = CS + 2; // janela de células por pedaço
const WP = W + 1; // janela de voxels (cantos)

export interface TerrainOpts {
  /** tamanho em voxels (múltiplos de CS) */
  nx: number;
  ny: number;
  nz: number;
  /** tamanho do voxel (m) */
  vs: number;
  /** canto mínimo no mundo */
  ox: number;
  oy: number;
  oz: number;
}

export interface RayHit {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  mat: number;
  dist: number;
}

const TC = new THREE.Color();
const EDGES: [number, number][] = [
  [0, 1], [2, 3], [4, 5], [6, 7],
  [0, 2], [1, 3], [4, 6], [5, 7],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

function detailTexture(): THREE.Texture {
  const N = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const c = cv.getContext('2d')!;
  const img = c.createImageData(N, N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      // ruído periódico (soma de oitavas com wrap)
      let v = 0;
      let a = 0.55;
      for (let o = 0; o < 4; o++) {
        const f = 4 << o;
        const fx = (x / N) * f;
        const fy = (y / N) * f;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const ux = fx - ix;
        const uy = fy - iy;
        const h = (i: number, j: number) => hash3(((i % f) + f) % f, ((j % f) + f) % f, o, 77);
        const sx = ux * ux * (3 - 2 * ux);
        const sy = uy * uy * (3 - 2 * uy);
        const n = h(ix, iy) * (1 - sx) * (1 - sy) + h(ix + 1, iy) * sx * (1 - sy) + h(ix, iy + 1) * (1 - sx) * sy + h(ix + 1, iy + 1) * sx * sy;
        v += n * a;
        a *= 0.5;
      }
      // pedrinhas
      if (hash3(x, y, 9, 3) > 0.985) v += 0.25;
      const g = Math.max(0, Math.min(255, v * 255));
      const i = (y * N + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = g;
      img.data[i + 3] = 255;
    }
  c.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 2;
  return t;
}

export class Terrain {
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly vs: number;
  readonly ox: number;
  readonly oy: number;
  readonly oz: number;
  readonly d: Float32Array;
  readonly m: Uint8Array;
  /** unidades de inventário por voxel (1 unidade = 1/2 m³) */
  readonly unit: number;
  readonly group = new THREE.Group();
  readonly material: THREE.MeshLambertMaterial;
  private ncx: number;
  private ncy: number;
  private ncz: number;
  private meshes: (THREE.Mesh | null)[];
  private dirty: Uint8Array;
  private dirtyN = 0;
  private cols: string[];
  private tex: THREE.Texture;
  // rascunhos do mesher
  private cache = new Float32Array(WP * WP * WP);
  private mcache = new Uint8Array(WP * WP * WP);
  private vidx = new Int32Array(W * W * W);
  private sPos = new Float32Array(W * W * W * 3);
  private sNor = new Float32Array(W * W * W * 3);
  private sCol = new Float32Array(W * W * W * 3);
  private sGlow = new Float32Array(W * W * W);
  private sIdx = new Uint16Array(W * W * W * 18);
  /** voxels sólidos (para medir quanto a ilha encolheu) */
  solidCount = 0;

  constructor(o: TerrainOpts, theme: Theme | null, detail: boolean) {
    this.nx = o.nx;
    this.ny = o.ny;
    this.nz = o.nz;
    this.vs = o.vs;
    this.ox = o.ox;
    this.oy = o.oy;
    this.oz = o.oz;
    this.unit = o.vs * o.vs * o.vs * 2;
    const n = o.nx * o.ny * o.nz;
    this.d = new Float32Array(n).fill(-1);
    this.m = new Uint8Array(n);
    this.ncx = Math.ceil(o.nx / CS);
    this.ncy = Math.ceil(o.ny / CS);
    this.ncz = Math.ceil(o.nz / CS);
    this.meshes = new Array(this.ncx * this.ncy * this.ncz).fill(null);
    this.dirty = new Uint8Array(this.meshes.length);
    this.cols = MAT_COL.map((c, i) => theme?.mat[i] ?? c);
    this.tex = detailTexture();
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    const tex = this.tex;
    this.material.onBeforeCompile = (sh) => {
      sh.uniforms.tDet = { value: tex };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;\nvarying vec3 vWPos;\nvarying vec3 vWNor;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;\nvWPos = position;\nvWNor = normal;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D tDet;\nvarying float vGlow;\nvarying vec3 vWPos;\nvarying vec3 vWNor;')
        .replace(
          '#include <color_fragment>',
          detail
            ? `#include <color_fragment>
  vec3 bw = pow(abs(normalize(vWNor)), vec3(4.0)); bw /= (bw.x + bw.y + bw.z + 1e-4);
  float dtl = texture2D(tDet, vWPos.yz * 0.31).r * bw.x + texture2D(tDet, vWPos.xz * 0.31).r * bw.y + texture2D(tDet, vWPos.xy * 0.31).r * bw.z;
  float dt2 = texture2D(tDet, vWPos.xz * 1.7 + vWPos.y * 0.3).r;
  diffuseColor.rgb *= 0.74 + 0.4 * dtl + 0.12 * (dt2 - 0.5);`
            : '#include <color_fragment>',
        )
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vGlow;');
    };
  }

  idx(i: number, j: number, k: number): number {
    return (k * this.ny + j) * this.nx + i;
  }
  /** densidade do voxel (fora da grade = ar) */
  D(i: number, j: number, k: number): number {
    if (i < 0 || j < 0 || k < 0 || i >= this.nx || j >= this.ny || k >= this.nz) return -1;
    return this.d[(k * this.ny + j) * this.nx + i];
  }
  /** amostra trilinear em coordenadas do mundo */
  sample(x: number, y: number, z: number): number {
    const fx = (x - this.ox) / this.vs;
    const fy = (y - this.oy) / this.vs;
    const fz = (z - this.oz) / this.vs;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const k = Math.floor(fz);
    if (i < -1 || j < -1 || k < -1 || i >= this.nx || j >= this.ny || k >= this.nz) return -1.5;
    const u = fx - i;
    const v = fy - j;
    const w = fz - k;
    const a = this.D(i, j, k) * (1 - u) + this.D(i + 1, j, k) * u;
    const b = this.D(i, j + 1, k) * (1 - u) + this.D(i + 1, j + 1, k) * u;
    const c = this.D(i, j, k + 1) * (1 - u) + this.D(i + 1, j, k + 1) * u;
    const e = this.D(i, j + 1, k + 1) * (1 - u) + this.D(i + 1, j + 1, k + 1) * u;
    return (a * (1 - v) + b * v) * (1 - w) + (c * (1 - v) + e * v) * w;
  }
  /** normal para fora do sólido */
  normal(x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    const h = this.vs * 0.5;
    out.set(this.sample(x - h, y, z) - this.sample(x + h, y, z), this.sample(x, y - h, z) - this.sample(x, y + h, z), this.sample(x, y, z - h) - this.sample(x, y, z + h));
    const l = out.length();
    if (l < 1e-6) out.set(0, 1, 0);
    else out.multiplyScalar(1 / l);
    return out;
  }
  matAt(x: number, y: number, z: number): number {
    const i = Math.round((x - this.ox) / this.vs);
    const j = Math.round((y - this.oy) / this.vs);
    const k = Math.round((z - this.oz) / this.vs);
    // material do voxel sólido mais próximo
    let best = 0;
    let bd = -1e9;
    for (let dz = -1; dz <= 1; dz++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const a = i + dx,
            b = j + dy,
            c = k + dz;
          if (a < 0 || b < 0 || c < 0 || a >= this.nx || b >= this.ny || c >= this.nz) continue;
          const q = this.idx(a, b, c);
          if (this.d[q] > bd) {
            bd = this.d[q];
            best = this.m[q];
          }
        }
    return best;
  }
  colorOf(m: number): string {
    return this.cols[m] ?? '#888';
  }
  get worldMax(): THREE.Vector3 {
    return new THREE.Vector3(this.ox + (this.nx - 1) * this.vs, this.oy + (this.ny - 1) * this.vs, this.oz + (this.nz - 1) * this.vs);
  }

  /* ----------------------- edição ----------------------- */
  private markRange(i0: number, j0: number, k0: number, i1: number, j1: number, k1: number): void {
    const a0 = Math.max(0, Math.floor((i0 - 2) / CS));
    const a1 = Math.min(this.ncx - 1, Math.floor((i1 + 2) / CS));
    const b0 = Math.max(0, Math.floor((j0 - 2) / CS));
    const b1 = Math.min(this.ncy - 1, Math.floor((j1 + 2) / CS));
    const c0 = Math.max(0, Math.floor((k0 - 2) / CS));
    const c1 = Math.min(this.ncz - 1, Math.floor((k1 + 2) / CS));
    for (let c = c0; c <= c1; c++)
      for (let b = b0; b <= b1; b++)
        for (let a = a0; a <= a1; a++) {
          const q = (c * this.ncy + b) * this.ncx + a;
          if (!this.dirty[q]) {
            this.dirty[q] = 1;
            this.dirtyN++;
          }
        }
  }
  markAllDirty(): void {
    this.dirty.fill(1);
    this.dirtyN = this.dirty.length;
  }
  recount(): void {
    let n = 0;
    for (let i = 0; i < this.d.length; i++) if (this.d[i] > 0 && this.m[i] !== M.Base) n++;
    this.solidCount = n;
  }

  /**
   * Cava uma esfera: materiais duros encolhem o raio efetivo (precisa de mais tempo/broca melhor).
   * Soma no `out` as unidades removidas por material. Devolve o total removido.
   */
  dig(x: number, y: number, z: number, r: number, out: Inv | null, power = 1): number {
    const vs = this.vs;
    const gi = (x - this.ox) / vs;
    const gj = (y - this.oy) / vs;
    const gk = (z - this.oz) / vs;
    const rr = Math.ceil((r * 1.2 + 1.5) / vs);
    const i0 = Math.max(0, Math.floor(gi - rr)),
      i1 = Math.min(this.nx - 1, Math.ceil(gi + rr));
    const j0 = Math.max(0, Math.floor(gj - rr)),
      j1 = Math.min(this.ny - 1, Math.ceil(gj + rr));
    const k0 = Math.max(0, Math.floor(gk - rr)),
      k1 = Math.min(this.nz - 1, Math.ceil(gk + rr));
    if (i0 > i1 || j0 > j1 || k0 > k1) return 0;
    let total = 0;
    let touched = false;
    for (let k = k0; k <= k1; k++)
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const q = (k * this.ny + j) * this.nx + i;
          const mm = this.m[q];
          if (mm === M.Base) continue;
          const d0 = this.d[q];
          if (d0 < -2.5) continue;
          const dx = this.ox + i * vs - x,
            dy = this.oy + j * vs - y,
            dz = this.oz + k * vs - z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const reff = (r * power) / Math.pow(HARD[mm] || 1, 0.6);
          const tgt = dist - reff;
          if (tgt < d0) {
            const nd = Math.max(-3, tgt);
            this.d[q] = nd;
            touched = true;
            if (d0 > 0 && nd <= 0) {
              total += this.unit;
              this.solidCount--;
              if (out && mm >= 1 && mm <= 7) out[mm] = (out[mm] ?? 0) + this.unit;
            }
          }
        }
    if (touched) this.markRange(i0, j0, k0, i1, j1, k1);
    return total;
  }

  /** acrescenta material numa esfera (r) ou caixa (hx,hy,hz, giro yaw). Devolve unidades adicionadas. */
  add(x: number, y: number, z: number, shape: { r?: number; hx?: number; hy?: number; hz?: number; yaw?: number }, mat: number, limit = Infinity): number {
    const vs = this.vs;
    const ext = shape.r ?? Math.hypot(shape.hx ?? 0, shape.hy ?? 0, shape.hz ?? 0);
    const rr = Math.ceil((ext + 1.5) / vs);
    const gi = (x - this.ox) / vs,
      gj = (y - this.oy) / vs,
      gk = (z - this.oz) / vs;
    const i0 = Math.max(0, Math.floor(gi - rr)),
      i1 = Math.min(this.nx - 1, Math.ceil(gi + rr));
    const j0 = Math.max(1, Math.floor(gj - rr)),
      j1 = Math.min(this.ny - 2, Math.ceil(gj + rr));
    const k0 = Math.max(0, Math.floor(gk - rr)),
      k1 = Math.min(this.nz - 1, Math.ceil(gk + rr));
    const cy = Math.cos(-(shape.yaw ?? 0)),
      sy = Math.sin(-(shape.yaw ?? 0));
    let added = 0;
    let touched = false;
    for (let k = k0; k <= k1; k++)
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const q = (k * this.ny + j) * this.nx + i;
          const dx = this.ox + i * vs - x,
            dy = this.oy + j * vs - y,
            dz = this.oz + k * vs - z;
          let sd: number;
          if (shape.r !== undefined) sd = shape.r - Math.sqrt(dx * dx + dy * dy + dz * dz);
          else {
            const lx = Math.abs(dx * cy - dz * sy) - shape.hx!;
            const lz = Math.abs(dx * sy + dz * cy) - shape.hz!;
            const ly = Math.abs(dy) - shape.hy!;
            const ox = Math.max(lx, 0),
              oy = Math.max(ly, 0),
              oz = Math.max(lz, 0);
            sd = -(Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(lx, ly, lz), 0));
          }
          sd = Math.min(3, sd);
          const d0 = this.d[q];
          if (sd > d0) {
            if (d0 <= 0 && sd > 0) {
              if (added >= limit) continue;
              added += this.unit;
              this.solidCount++;
              this.m[q] = mat;
            } else if (d0 <= 0) this.m[q] = mat;
            this.d[q] = sd;
            touched = true;
          }
        }
    if (touched) this.markRange(i0, j0, k0, i1, j1, k1);
    return added;
  }

  /** raio contra o terreno (marcha + bisseção) */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): RayHit | null {
    const step = this.vs * 0.35;
    let prev = this.sample(ox, oy, oz);
    if (prev > 0) return { x: ox, y: oy, z: oz, nx: -dx, ny: -dy, nz: -dz, mat: this.matAt(ox, oy, oz), dist: 0 };
    let tPrev = 0;
    for (let tt = step; tt <= max; tt += Math.max(step, Math.min(-prev * 0.8, 1))) {
      const v = this.sample(ox + dx * tt, oy + dy * tt, oz + dz * tt);
      if (v > 0) {
        let a = tPrev,
          b = tt;
        for (let it = 0; it < 6; it++) {
          const mid = (a + b) / 2;
          if (this.sample(ox + dx * mid, oy + dy * mid, oz + dz * mid) > 0) b = mid;
          else a = mid;
        }
        const x = ox + dx * b,
          y = oy + dy * b,
          z = oz + dz * b;
        const n = this.normal(x, y, z, new THREE.Vector3());
        return { x, y, z, nx: n.x, ny: n.y, nz: n.z, mat: this.matAt(x - n.x * 0.2, y - n.y * 0.2, z - n.z * 0.2), dist: b };
      }
      prev = v;
      tPrev = tt;
    }
    return null;
  }

  /** altura do chão (primeiro sólido descendo de `fromY`) */
  groundY(x: number, z: number, fromY: number, minY = -50): number {
    for (let y = fromY; y > minY; y -= this.vs * 0.5) if (this.sample(x, y, z) > 0) return y;
    return -Infinity;
  }

  /* ----------------------- malha ----------------------- */
  /** refaz até `budget` pedaços sujos (mais perto de `near` primeiro). Devolve quantos refez. */
  update(budget: number, near: THREE.Vector3 | null): number {
    if (!this.dirtyN) return 0;
    let done = 0;
    while (done < budget && this.dirtyN > 0) {
      let best = -1;
      let bd = Infinity;
      for (let q = 0; q < this.dirty.length; q++) {
        if (!this.dirty[q]) continue;
        if (!near) {
          best = q;
          break;
        }
        const a = q % this.ncx;
        const b = Math.floor(q / this.ncx) % this.ncy;
        const c = Math.floor(q / (this.ncx * this.ncy));
        const s = CS * this.vs;
        const dx = this.ox + (a + 0.5) * s - near.x,
          dy = this.oy + (b + 0.5) * s - near.y,
          dz = this.oz + (c + 0.5) * s - near.z;
        const dd = dx * dx + dy * dy + dz * dz;
        if (dd < bd) {
          bd = dd;
          best = q;
        }
      }
      if (best < 0) break;
      this.dirty[best] = 0;
      this.dirtyN--;
      this.rebuild(best);
      done++;
    }
    return done;
  }
  get pending(): number {
    return this.dirtyN;
  }

  private rebuild(q: number): void {
    const a = q % this.ncx;
    const b = Math.floor(q / this.ncx) % this.ncy;
    const c = Math.floor(q / (this.ncx * this.ncy));
    const g = this.meshChunk(a, b, c);
    const old = this.meshes[q];
    if (old) {
      if (g) {
        old.geometry.dispose();
        old.geometry = g;
      } else {
        this.group.remove(old);
        old.geometry.dispose();
        this.meshes[q] = null;
      }
    } else if (g) {
      const mesh = new THREE.Mesh(g, this.material);
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.meshes[q] = mesh;
    }
  }

  private meshChunk(ci: number, cj: number, ck: number): THREE.BufferGeometry | null {
    const x0 = ci * CS - 2,
      y0 = cj * CS - 2,
      z0 = ck * CS - 2;
    // cópia local das densidades (WP³), fora = ar
    const cache = this.cache;
    const mc = this.mcache;
    let any = false,
      anySolid = false,
      anyAir = false;
    for (let k = 0; k < WP; k++)
      for (let j = 0; j < WP; j++)
        for (let i = 0; i < WP; i++) {
          const gi = x0 + i,
            gj = y0 + j,
            gk = z0 + k;
          const o = (k * WP + j) * WP + i;
          if (gi < 0 || gj < 0 || gk < 0 || gi >= this.nx || gj >= this.ny || gk >= this.nz) {
            cache[o] = -1;
            mc[o] = 0;
            anyAir = true;
          } else {
            const q = (gk * this.ny + gj) * this.nx + gi;
            const v = this.d[q];
            cache[o] = v;
            mc[o] = this.m[q];
            if (v > 0) anySolid = true;
            else anyAir = true;
          }
        }
    any = anySolid && anyAir;
    if (!any) return null;
    const vidx = this.vidx;
    vidx.fill(-1);
    const P = this.sPos,
      N = this.sNor,
      C = this.sCol,
      G = this.sGlow;
    const vs = this.vs;
    const v = new Float32Array(8);
    let nv = 0;
    const cols = this.cols;
    const nrm = new THREE.Vector3();
    for (let k = 0; k < W; k++)
      for (let j = 0; j < W; j++)
        for (let i = 0; i < W; i++) {
          let mask = 0;
          for (let bb = 0; bb < 8; bb++) {
            const val = cache[((k + (bb >> 2)) * WP + (j + ((bb >> 1) & 1))) * WP + (i + (bb & 1))];
            v[bb] = val;
            if (val > 0) mask |= 1 << bb;
          }
          if (mask === 0 || mask === 255) continue;
          let sx = 0,
            sy = 0,
            sz = 0,
            cnt = 0;
          for (let e = 0; e < 12; e++) {
            const [p0, p1] = EDGES[e];
            const a0 = v[p0],
              a1 = v[p1];
            if (a0 > 0 === a1 > 0) continue;
            const tt = a0 / (a0 - a1);
            sx += (p0 & 1) + ((p1 & 1) - (p0 & 1)) * tt;
            sy += ((p0 >> 1) & 1) + (((p1 >> 1) & 1) - ((p0 >> 1) & 1)) * tt;
            sz += (p0 >> 2) + ((p1 >> 2) - (p0 >> 2)) * tt;
            cnt++;
          }
          const px = this.ox + (x0 + i + sx / cnt) * vs;
          const py = this.oy + (y0 + j + sy / cnt) * vs;
          const pz = this.oz + (z0 + k + sz / cnt) * vs;
          // gradiente dentro da célula
          let gx = v[1] - v[0] + v[3] - v[2] + v[5] - v[4] + v[7] - v[6];
          let gy = v[2] - v[0] + v[3] - v[1] + v[6] - v[4] + v[7] - v[5];
          let gz = v[4] - v[0] + v[5] - v[1] + v[6] - v[2] + v[7] - v[3];
          let gl = Math.sqrt(gx * gx + gy * gy + gz * gz);
          if (gl < 1e-6) {
            gx = 0;
            gy = -1;
            gz = 0;
            gl = 1;
          }
          nrm.set(-gx / gl, -gy / gl, -gz / gl);
          // material: canto mais sólido
          let bm = 0;
          let bv = -1e9;
          for (let bb = 0; bb < 8; bb++)
            if (v[bb] > bv) {
              bv = v[bb];
              bm = mc[((k + (bb >> 2)) * WP + (j + ((bb >> 1) & 1))) * WP + (i + (bb & 1))];
            }
          TC.set(cols[bm] ?? '#888');
          // grama só no plano: encosta vira terra
          if (bm === M.Grama && nrm.y < 0.62) {
            const tt = Math.max(0, Math.min(1, (0.62 - nrm.y) / 0.3));
            const r = TC.r,
              gg = TC.g,
              bl = TC.b;
            TC.set(cols[M.Terra]);
            TC.setRGB(r + (TC.r - r) * tt, gg + (TC.g - gg) * tt, bl + (TC.b - bl) * tt);
          }
          // variação + topo mais claro + oclusão barata
          const jit = 0.9 + hash3(Math.round(px * 1.7), Math.round(py * 1.7), Math.round(pz * 1.7), 11) * 0.2;
          const ao = this.sample(px + nrm.x * 1.1, py + nrm.y * 1.1, pz + nrm.z * 1.1);
          const occ = ao > -0.9 ? 0.72 + 0.28 * Math.max(0, Math.min(1, (-ao - 0.1) / 0.8)) : 1;
          const top = 0.93 + 0.12 * Math.max(0, nrm.y);
          const kk = jit * occ * top;
          const o3 = nv * 3;
          P[o3] = px;
          P[o3 + 1] = py;
          P[o3 + 2] = pz;
          N[o3] = nrm.x;
          N[o3 + 1] = nrm.y;
          N[o3 + 2] = nrm.z;
          C[o3] = TC.r * kk;
          C[o3 + 1] = TC.g * kk;
          C[o3 + 2] = TC.b * kk;
          G[nv] = bm === M.Cristal ? 0.55 : bm === M.Ouro ? 0.25 : 0;
          vidx[(k * W + j) * W + i] = nv++;
        }
    if (!nv) return null;
    // quadriláteros: arestas com dono neste pedaço
    const I = this.sIdx;
    let ni = 0;
    const lo = (cc: number) => (cc === 0 ? 1 : 2);
    const li0 = lo(ci),
      lj0 = lo(cj),
      lk0 = lo(ck);
    const hi = CS + 2;
    const cv = (i: number, j: number, k: number) => vidx[(k * W + j) * W + i];
    for (let k = lk0; k < hi; k++)
      for (let j = lj0; j < hi; j++)
        for (let i = li0; i < hi; i++) {
          const d0 = cache[(k * WP + j) * WP + i] > 0;
          for (let ax = 0; ax < 3; ax++) {
            const i1 = i + (ax === 0 ? 1 : 0),
              j1 = j + (ax === 1 ? 1 : 0),
              k1 = k + (ax === 2 ? 1 : 0);
            const d1 = cache[(k1 * WP + j1) * WP + i1] > 0;
            if (d0 === d1) continue;
            let a: number, b: number, c: number, e: number;
            // u=(ax+1)%3, v=(ax+2)%3 ; c0=p-u-v, c1=p-v, c2=p, c3=p-u
            if (ax === 0) {
              a = cv(i, j - 1, k - 1);
              b = cv(i, j, k - 1);
              c = cv(i, j, k);
              e = cv(i, j - 1, k);
            } else if (ax === 1) {
              a = cv(i - 1, j, k - 1);
              b = cv(i - 1, j, k);
              c = cv(i, j, k);
              e = cv(i, j, k - 1);
            } else {
              a = cv(i - 1, j - 1, k);
              b = cv(i, j - 1, k);
              c = cv(i, j, k);
              e = cv(i - 1, j, k);
            }
            if (a < 0 || b < 0 || c < 0 || e < 0) continue;
            if (d0) {
              I[ni++] = a;
              I[ni++] = b;
              I[ni++] = c;
              I[ni++] = a;
              I[ni++] = c;
              I[ni++] = e;
            } else {
              I[ni++] = a;
              I[ni++] = c;
              I[ni++] = b;
              I[ni++] = a;
              I[ni++] = e;
              I[ni++] = c;
            }
          }
        }
    if (!ni) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P.slice(0, nv * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(N.slice(0, nv * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(C.slice(0, nv * 3), 3));
    g.setAttribute('glow', new THREE.BufferAttribute(G.slice(0, nv), 1));
    g.setIndex(new THREE.BufferAttribute(I.slice(0, ni), 1));
    g.computeBoundingSphere();
    return g;
  }

  dispose(): void {
    for (const m of this.meshes) m?.geometry.dispose();
    this.material.dispose();
    this.tex.dispose();
    this.group.clear();
  }
}
