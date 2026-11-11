/* ============================================================
 *  BLOOP STUDIO — relevo esculpido (formato v3 `terrain`).
 *  Grade n×n de alturas + materiais, centrada na origem; fora dela o
 *  chão é plano em y=0. Pincéis: subir, baixar, suavizar, aplainar,
 *  nivelar, rampa, pintar (inclui água, que cava um pouco) e lagos.
 *  A borda da grade fica sempre em 0 (emenda sem degrau com o chão).
 * ============================================================ */
import * as THREE from 'three';
import { decodeHeights, encodeHeights, b64ToBytes, bytesToB64, TERRAIN_MATS, type TerrainData, type TerrainMat, type WaterBody } from '../format';

export type Brush = 'raise' | 'lower' | 'smooth' | 'flatten' | 'level' | 'ramp' | 'paint' | 'water' | 'lake';

export const MAT_COLORS: Record<TerrainMat, string> = {
  grass: '#78c85a',
  sand: '#ead9a0',
  snow: '#f4f8ff',
  rock: '#9a96a0',
  dirt: '#9a6a42',
  water: '#c9b68a', // fundo do lago (areia molhada)
};
export const WATER_COLOR = '#3ab0e0';
const WATER_IDX = TERRAIN_MATS.indexOf('water');

export class TerrainField {
  n: number;
  cell: number;
  h: Float32Array;
  m: Uint8Array;
  wy: number;
  water: WaterBody[];

  constructor(d?: TerrainData | null, n = 65, cell = 2) {
    this.n = d?.n ?? n;
    this.cell = d?.cell ?? cell;
    const N = this.n * this.n;
    this.h = (d && decodeHeights(d.h, N)) || new Float32Array(N);
    const m = d?.m ? b64ToBytes(d.m) : null;
    this.m = m && m.length === N ? m : new Uint8Array(N);
    this.wy = d?.wy ?? -0.3;
    this.water = d?.water ? d.water.map((w) => ({ ...w })) : [];
  }

  get half(): number {
    return ((this.n - 1) * this.cell) / 2;
  }

  encode(): TerrainData {
    const t: TerrainData = { n: this.n, cell: this.cell, h: encodeHeights(this.h) };
    if (this.m.some((x) => x !== 0)) t.m = bytesToB64(this.m);
    if (this.wy !== -0.3) t.wy = Math.round(this.wy * 100) / 100;
    if (this.water.length) t.water = this.water.map((w) => ({ x: r2(w.x), z: r2(w.z), w: r2(w.w), d: r2(w.d), y: r2(w.y) }));
    return t;
  }

  /** está tudo plano e sem água? (então nem salva) */
  isEmpty(): boolean {
    return !this.water.length && this.h.every((v) => v === 0) && this.m.every((v) => v === 0);
  }

  inside(x: number, z: number): boolean {
    const H = this.half;
    return x > -H && x < H && z > -H && z < H;
  }

  heightAt(x: number, z: number): number {
    const H = this.half;
    const fx = (x + H) / this.cell;
    const fz = (z + H) / this.cell;
    if (fx <= 0 || fz <= 0 || fx >= this.n - 1 || fz >= this.n - 1) return 0;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const n = this.n;
    const a = this.h[j * n + i];
    const b = this.h[j * n + i + 1];
    const c = this.h[(j + 1) * n + i];
    const d = this.h[(j + 1) * n + i + 1];
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  }

  /** altura da superfície da água em (x,z) ou -Infinity */
  waterAt(x: number, z: number): number {
    let y = -Infinity;
    for (const w of this.water) if (Math.abs(x - w.x) <= w.w / 2 && Math.abs(z - w.z) <= w.d / 2 && w.y > y) y = w.y;
    const H = this.half;
    const i = Math.round((x + H) / this.cell);
    const j = Math.round((z + H) / this.cell);
    if (i >= 0 && j >= 0 && i < this.n && j < this.n && this.m[j * this.n + i] === WATER_IDX && this.wy > y) y = this.wy;
    return y;
  }

  /**
   * Aplica o pincel em volta de (x,z). `k` = força × dt. Devolve true se mudou algo.
   *  target: altura alvo (aplainar/nivelar) · mat: material (pintar)
   */
  brush(b: Brush, x: number, z: number, radius: number, k: number, o: { target?: number; mat?: number } = {}): boolean {
    const n = this.n;
    const H = this.half;
    const c = this.cell;
    const r = Math.max(c * 0.6, radius);
    const i0 = Math.max(1, Math.floor((x - r + H) / c));
    const i1 = Math.min(n - 2, Math.ceil((x + r + H) / c));
    const j0 = Math.max(1, Math.floor((z - r + H) / c));
    const j1 = Math.min(n - 2, Math.ceil((z + r + H) / c));
    if (i0 > i1 || j0 > j1) return false;
    let changed = false;
    const src = b === 'smooth' ? this.h.slice() : this.h;
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const px = i * c - H;
        const pz = j * c - H;
        const d = Math.hypot(px - x, pz - z) / r;
        if (d >= 1) continue;
        const f = 0.5 + 0.5 * Math.cos(d * Math.PI); // queda suave
        const id = j * n + i;
        const h0 = this.h[id];
        let h = h0;
        if (b === 'raise') h += 3 * k * f;
        else if (b === 'lower') h -= 3 * k * f;
        else if (b === 'smooth') {
          const avg = (src[id - 1] + src[id + 1] + src[id - n] + src[id + n] + src[id] * 2) / 6;
          h += (avg - h) * Math.min(1, 6 * k * f);
        } else if ((b === 'flatten' || b === 'level') && o.target != null) h += (o.target - h) * Math.min(1, 5 * k * f + (f > 0.6 ? 0.2 : 0));
        else if (b === 'paint' && o.mat != null) {
          if (f > 0.25 && this.m[id] !== o.mat) {
            this.m[id] = o.mat;
            changed = true;
          }
        } else if (b === 'water') {
          if (f > 0.25 && this.m[id] !== WATER_IDX) {
            this.m[id] = WATER_IDX;
            changed = true;
          }
          // cava o leito: a água fica abaixo do chão em volta
          const bed = this.wy - 0.4 - 1.1 * f;
          if (h > bed) h += (bed - h) * Math.min(1, 6 * k + 0.25);
        }
        h = Math.max(-40, Math.min(80, h));
        if (h !== h0) {
          this.h[id] = h;
          changed = true;
        }
      }
    return changed;
  }

  /** rampa reta de A (altura ha) até B (altura hb), largura = 2·radius */
  ramp(ax: number, az: number, ha: number, bx: number, bz: number, hb: number, radius: number): boolean {
    const n = this.n;
    const H = this.half;
    const c = this.cell;
    const L2 = (bx - ax) ** 2 + (bz - az) ** 2;
    if (L2 < 0.25) return false;
    let changed = false;
    for (let j = 1; j < n - 1; j++)
      for (let i = 1; i < n - 1; i++) {
        const px = i * c - H;
        const pz = j * c - H;
        const t = ((px - ax) * (bx - ax) + (pz - az) * (bz - az)) / L2;
        if (t < 0 || t > 1) continue;
        const qx = ax + (bx - ax) * t;
        const qz = az + (bz - az) * t;
        const d = Math.hypot(px - qx, pz - qz) / radius;
        if (d >= 1) continue;
        const f = d < 0.6 ? 1 : 0.5 + 0.5 * Math.cos(((d - 0.6) / 0.4) * Math.PI);
        const id = j * n + i;
        const want = ha + (hb - ha) * t;
        const h = this.h[id] + (want - this.h[id]) * f;
        if (h !== this.h[id]) {
          this.h[id] = h;
          changed = true;
        }
      }
    return changed;
  }

  /** lago retangular (ou aumenta/remove um que já está ali) */
  addLake(x: number, z: number, size: number, y: number): void {
    this.water.push({ x, z, w: size, d: size, y });
    if (this.water.length > 16) this.water.shift();
  }
  removeLakeAt(x: number, z: number): boolean {
    const i = this.water.findIndex((w) => Math.abs(x - w.x) <= w.w / 2 && Math.abs(z - w.z) <= w.d / 2);
    if (i < 0) return false;
    this.water.splice(i, 1);
    return true;
  }
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/* -------------------------------- malhas -------------------------------- */

const COLS = TERRAIN_MATS.map((k) => new THREE.Color(MAT_COLORS[k]));
const ROCK = new THREE.Color(MAT_COLORS.rock);

/** malha do relevo + água; refresh() depois de pincelar */
export class TerrainView {
  readonly group = new THREE.Group();
  readonly mesh: THREE.Mesh;
  private geo: THREE.BufferGeometry;
  private waterMesh: THREE.Mesh | null = null;
  private waterMat: THREE.MeshStandardMaterial;
  private lakes = new THREE.Group();
  private lakeGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

  constructor(
    public field: TerrainField,
    mat: THREE.Material,
  ) {
    const n = field.n;
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * n * 3), 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * n * 3), 3));
    const idx: number[] = [];
    for (let j = 0; j < n - 1; j++)
      for (let i = 0; i < n - 1; i++) {
        const a = j * n + i;
        idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
      }
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.userData.ground = true;
    this.waterMat = new THREE.MeshStandardMaterial({ color: WATER_COLOR, transparent: true, opacity: 0.72, roughness: 0.15, metalness: 0.1, depthWrite: false });
    this.group.add(this.mesh, this.lakes);
    this.refresh();
  }

  refresh(): void {
    const f = this.field;
    const n = f.n;
    const H = f.half;
    const c = f.cell;
    const pos = this.geo.getAttribute('position') as THREE.BufferAttribute;
    const col = this.geo.getAttribute('color') as THREE.BufferAttribute;
    const tmp = new THREE.Color();
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        const h = f.h[k];
        pos.setXYZ(k, i * c - H, h, j * c - H);
        const hx = f.h[j * n + Math.min(n - 1, i + 1)] - f.h[j * n + Math.max(0, i - 1)];
        const hz = f.h[Math.min(n - 1, j + 1) * n + i] - f.h[Math.max(0, j - 1) * n + i];
        const slope = Math.hypot(hx, hz) / (2 * c);
        tmp.copy(COLS[f.m[k]] ?? COLS[0]);
        if (f.m[k] === 0 && slope > 0.7) tmp.lerp(ROCK, Math.min(0.75, (slope - 0.7) * 1.5));
        const nz = (((i * 73856093) ^ (j * 19349663)) & 255) / 255;
        tmp.offsetHSL(0, 0, (nz - 0.5) * 0.05);
        col.setXYZ(k, tmp.r, tmp.g, tmp.b);
      }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
    this.geo.computeBoundingBox();
    this.refreshWater();
  }

  private refreshWater(): void {
    const f = this.field;
    const n = f.n;
    const H = f.half;
    const c = f.cell;
    // água pintada: um quadrado por célula com algum vértice de água, na altura wy
    const W = TERRAIN_MATS.indexOf('water');
    const pts: number[] = [];
    for (let j = 0; j < n - 1; j++)
      for (let i = 0; i < n - 1; i++) {
        const a = j * n + i;
        if (f.m[a] !== W && f.m[a + 1] !== W && f.m[a + n] !== W && f.m[a + n + 1] !== W) continue;
        const x0 = i * c - H;
        const z0 = j * c - H;
        const x1 = x0 + c;
        const z1 = z0 + c;
        const y = f.wy;
        pts.push(x0, y, z0, x0, y, z1, x1, y, z0, x1, y, z0, x0, y, z1, x1, y, z1);
      }
    if (this.waterMesh) {
      this.group.remove(this.waterMesh);
      this.waterMesh.geometry.dispose();
      this.waterMesh = null;
    }
    if (pts.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      g.computeVertexNormals();
      this.waterMesh = new THREE.Mesh(g, this.waterMat);
      this.waterMesh.renderOrder = 2;
      this.group.add(this.waterMesh);
    }
    this.lakes.clear();
    for (const w of f.water) {
      const m = new THREE.Mesh(this.lakeGeo, this.waterMat);
      m.position.set(w.x, w.y, w.z);
      m.scale.set(w.w, 1, w.d);
      m.renderOrder = 2;
      this.lakes.add(m);
    }
  }

  dispose(): void {
    this.geo.dispose();
    this.waterMesh?.geometry.dispose();
    this.lakeGeo.dispose();
    this.waterMat.dispose();
  }
}
