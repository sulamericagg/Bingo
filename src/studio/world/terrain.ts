/* ============================================================
 *  BLOOP STUDIO — os 3 mundos:
 *   Infinito: terreno procedural sem fim, em pedaços (chunks), biomas e árvores
 *             (ideias copiadas de src/games/floresta/world — sem importar de lá);
 *   Plano:    chão enorme e liso com grade suave;
 *   Vazio:    só um pedestal redondo (vitrine).
 *  A área de construção (raio ~30 m em volta da origem) é sempre plana em y=0.
 * ============================================================ */
import * as THREE from 'three';
import type { WorldKind } from '../format';

/* ------------------------------ ruído (cópia) ------------------------------ */
function hash2(x: number, z: number, seed: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(seed | 0, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
function fbm(x: number, z: number, seed: number, oct = 4): number {
  let s = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    s += vnoise(x, z, seed + i * 101) * amp;
    norm += amp;
    amp *= 0.5;
    const nx = x * 1.6 + z * 1.2;
    z = z * 1.6 - x * 1.2;
    x = nx;
  }
  return s / norm;
}
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* -------------------------------- biomas -------------------------------- */
interface Biome {
  T: number;
  H: number;
  grass: THREE.Color;
  tree: 'round' | 'pine' | 'cactus' | 'palm' | 'none';
  leaf: string;
  dens: number;
  hill: number;
}
const C = (h: string) => new THREE.Color(h);
const BIOMES: Biome[] = [
  { T: 0.5, H: 0.5, grass: C('#6cc24a'), tree: 'round', leaf: '#4fae5a', dens: 0.1, hill: 1 }, // campo
  { T: 0.45, H: 0.85, grass: C('#3f9a46'), tree: 'round', leaf: '#2f8a3e', dens: 0.32, hill: 1.2 }, // floresta
  { T: 0.95, H: 0.1, grass: C('#f0d494'), tree: 'cactus', leaf: '#4aa85a', dens: 0.04, hill: 0.6 }, // deserto
  { T: 0.05, H: 0.5, grass: C('#eef4fb'), tree: 'pine', leaf: '#3f8a76', dens: 0.18, hill: 1.6 }, // neve
  { T: 0.3, H: 0.45, grass: C('#c49a4a'), tree: 'round', leaf: '#ff8a2e', dens: 0.18, hill: 1.1 }, // outono
  { T: 0.85, H: 0.8, grass: C('#34b84e'), tree: 'palm', leaf: '#22a04a', dens: 0.12, hill: 0.8 }, // tropical
  { T: 0.6, H: 0.25, grass: C('#d8c45a'), tree: 'round', leaf: '#9ac24a', dens: 0.03, hill: 0.5 }, // savana
];
const NB = BIOMES.length;
const SAND = C('#ead9a0');
const ROCK = C('#9a96a0');
const SNOW = C('#f6f9ff');

export const WATER_Y = -1.2;
export const CH = 48; // m por pedaço
export const RES = 16; // células por lado (3 m)
const VN = RES + 1;
const FLAT_R = 34; // área de construção plana

export class InfiniteGen {
  private w = new Float32Array(NB);
  constructor(readonly seed: number) {}
  weights(x: number, z: number): Float32Array {
    const s = this.seed;
    const T = Math.max(0, Math.min(1, (fbm(x / 520, z / 520, s + 10, 3) - 0.5) * 2.6 + 0.5));
    const H = Math.max(0, Math.min(1, (fbm(x / 460 + 31, z / 460 - 17, s + 11, 3) - 0.5) * 2.6 + 0.5));
    let sum = 0;
    const r = Math.hypot(x, z);
    const home = smooth(260, 90, r);
    for (let i = 0; i < NB; i++) {
      const b = BIOMES[i];
      let w = Math.exp(-((T - b.T) ** 2 + (H - b.H) ** 2) / 0.02);
      if (i === 0) w += home * 4;
      else w *= 1 - home;
      this.w[i] = w;
      sum += w;
    }
    const k = sum > 0 ? 1 / sum : 0;
    for (let i = 0; i < NB; i++) this.w[i] *= k;
    if (sum <= 0) this.w[0] = 1;
    return this.w;
  }
  height(x: number, z: number): number {
    const s = this.seed;
    const w = this.weights(x, z);
    let hill = 0;
    for (let i = 0; i < NB; i++) hill += w[i] * BIOMES[i].hill;
    const c = fbm(x / 700, z / 700, s + 1, 3);
    const hills = (fbm(x / 120, z / 120, s + 2, 4) - 0.5) * 18 * hill;
    const mnt = Math.max(0, fbm(x / 300, z / 300, s + 3, 4) - 0.55) * 120 * w[3];
    let h = (c - 0.42) * 30 + hills + mnt + 2;
    // lagos
    const lake = fbm(x / 260 + 7, z / 260 - 3, s + 5, 3);
    h -= smooth(0.62, 0.74, lake) * 14;
    const r = Math.hypot(x, z);
    return h * smooth(FLAT_R, FLAT_R + 60, r);
  }
  /** cor do chão (mistura de biomas + areia perto da água + rocha/neve no alto) */
  color(x: number, z: number, h: number, slope: number, out: THREE.Color): THREE.Color {
    const w = this.weights(x, z);
    out.setRGB(0, 0, 0);
    for (let i = 0; i < NB; i++) if (w[i] > 0.001) out.r += BIOMES[i].grass.r * w[i], out.g += BIOMES[i].grass.g * w[i], out.b += BIOMES[i].grass.b * w[i];
    const n = hash2(Math.floor(x * 0.5), Math.floor(z * 0.5), this.seed + 40) * 0.08 - 0.04;
    out.offsetHSL(0, 0, n);
    if (h < WATER_Y + 1.2) out.lerp(SAND, smooth(WATER_Y + 1.2, WATER_Y + 0.2, h));
    if (slope > 0.6) out.lerp(ROCK, smooth(0.6, 1.1, slope) * 0.8);
    if (h > 30) out.lerp(SNOW, smooth(30, 42, h));
    return out;
  }
  biomeAt(x: number, z: number): Biome {
    const w = this.weights(x, z);
    let b = 0;
    for (let i = 1; i < NB; i++) if (w[i] > w[b]) b = i;
    return BIOMES[b];
  }
}

/* ------------------------------ mundo (view) ------------------------------ */

export interface TreeInfo {
  x: number;
  y: number;
  z: number;
  r: number;
  h: number;
}

export interface WorldView {
  kind: WorldKind;
  group: THREE.Group;
  sky: THREE.Color;
  fogFar: number;
  /** altura do chão em (x,z); -Infinity = sem chão (vazio fora do pedestal) */
  heightAt(x: number, z: number): number;
  /** árvores perto de (x,z) (física) */
  treesNear(x: number, z: number, r: number): TreeInfo[];
  /** avança o carregamento em volta do foco */
  update(focus: THREE.Vector3): void;
  /** malhas do chão (para tocar/colar peças no chão) */
  pickables(): THREE.Object3D[];
  dispose(): void;
}

function gridTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const x = cv.getContext('2d')!;
  x.fillStyle = '#7ccf62';
  x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#74c65b';
  x.fillRect(0, 0, 64, 64);
  x.fillRect(64, 64, 64, 64);
  x.strokeStyle = 'rgba(255,255,255,.35)';
  x.lineWidth = 2;
  x.strokeRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function createWorld(kind: WorldKind, seed: number, tier: number): WorldView {
  if (kind === 'flat') return flatWorld(tier);
  if (kind === 'void') return voidWorld();
  return new Infinite(seed, tier);
}

function flatWorld(tier: number): WorldView {
  const group = new THREE.Group();
  const tex = gridTexture();
  tex.repeat.set(1000, 1000);
  const mat = tier <= 1 ? new THREE.MeshLambertMaterial({ map: tex }) : new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
  const g = new THREE.PlaneGeometry(4000, 4000);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  m.userData.ground = true;
  group.add(m);
  // algumas nuvens/montes no horizonte para dar escala
  const hillMat = new THREE.MeshLambertMaterial({ color: '#9ad88a' });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + i;
    const r = 700 + (i % 3) * 120;
    const hg = new THREE.SphereGeometry(1, 12, 8);
    const hm = new THREE.Mesh(hg, hillMat);
    hm.position.set(Math.cos(a) * r, -20, Math.sin(a) * r);
    hm.scale.set(160 + (i % 4) * 40, 70 + (i % 5) * 20, 160);
    group.add(hm);
  }
  return {
    kind: 'flat',
    group,
    sky: new THREE.Color('#8fd0ff'),
    fogFar: 900,
    heightAt: () => 0,
    treesNear: () => [],
    update: () => undefined,
    pickables: () => [m],
    dispose() {
      group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      mat.dispose();
      hillMat.dispose();
      tex.dispose();
    },
  };
}

const PAD_R = 7;
function voidWorld(): WorldView {
  const group = new THREE.Group();
  const top = new THREE.MeshStandardMaterial({ color: '#f4efff', roughness: 0.5 });
  const side = new THREE.MeshStandardMaterial({ color: '#8a5cff', roughness: 0.4, metalness: 0.2 });
  const g = new THREE.CylinderGeometry(PAD_R, PAD_R * 0.86, 0.8, 48);
  g.translate(0, -0.4, 0);
  const pad = new THREE.Mesh(g, [side, top, side]);
  pad.receiveShadow = true;
  pad.userData.ground = true;
  group.add(pad);
  const ringG = new THREE.TorusGeometry(PAD_R + 0.05, 0.08, 8, 64);
  ringG.rotateX(Math.PI / 2);
  const ring = new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({ color: '#ff5cc8' }));
  group.add(ring);
  // estrelinhas
  const sg = new THREE.BufferGeometry();
  const pos: number[] = [];
  for (let i = 0; i < 400; i++) {
    const u = hash2(i, 1, 9) * 2 - 1;
    const a = hash2(i, 2, 9) * Math.PI * 2;
    const rr = Math.sqrt(1 - u * u);
    pos.push(Math.cos(a) * rr * 300, u * 300, Math.sin(a) * rr * 300);
  }
  sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false }));
  group.add(stars);
  return {
    kind: 'void',
    group,
    sky: new THREE.Color('#2a1658'),
    fogFar: 400,
    heightAt: (x, z) => (x * x + z * z <= PAD_R * PAD_R ? 0 : -Infinity),
    treesNear: () => [],
    update: () => undefined,
    pickables: () => [pad],
    dispose() {
      group.traverse((o) => {
        (o as THREE.Mesh).geometry?.dispose();
        const m = (o as THREE.Mesh).material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else (m as THREE.Material | undefined)?.dispose();
      });
    },
  };
}

interface Chunk {
  cx: number;
  cz: number;
  mesh: THREE.Mesh;
  trees: TreeInfo[];
  inst: THREE.InstancedMesh[];
}

class Infinite implements WorldView {
  kind: WorldKind = 'infinite';
  group = new THREE.Group();
  sky = new THREE.Color('#8fd0ff');
  fogFar: number;
  private gen: InfiniteGen;
  private chunks = new Map<string, Chunk>();
  private radius: number;
  private groundMat: THREE.Material;
  private water: THREE.Mesh;
  private trunkMat = new THREE.MeshLambertMaterial({ color: '#8a5a34' });
  private leafMat: THREE.Material;
  private geo = {
    trunk: new THREE.CylinderGeometry(0.18, 0.28, 1, 6).translate(0, 0.5, 0),
    round: new THREE.IcosahedronGeometry(1, 1),
    pine: new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0),
    cactus: new THREE.CapsuleGeometry(0.35, 1, 3, 7).translate(0, 0.85, 0),
    palm: new THREE.ConeGeometry(1.4, 0.5, 6).translate(0, 0, 0),
  };
  constructor(
    seed: number,
    tier: number,
  ) {
    this.gen = new InfiniteGen(seed);
    this.radius = [2, 3, 3, 4][tier] ?? 3;
    this.fogFar = (this.radius + 0.5) * CH;
    this.groundMat = tier <= 1 ? new THREE.MeshLambertMaterial({ vertexColors: true }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    this.leafMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    const wg = new THREE.PlaneGeometry(CH * (this.radius * 2 + 3), CH * (this.radius * 2 + 3));
    wg.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(wg, new THREE.MeshLambertMaterial({ color: '#3ab0e0', transparent: true, opacity: 0.78 }));
    this.water.position.y = WATER_Y;
    this.group.add(this.water);
  }
  heightAt(x: number, z: number): number {
    return Math.max(this.gen.height(x, z), WATER_Y - 6);
  }
  treesNear(x: number, z: number, r: number): TreeInfo[] {
    const out: TreeInfo[] = [];
    const c0x = Math.floor((x - r) / CH);
    const c1x = Math.floor((x + r) / CH);
    const c0z = Math.floor((z - r) / CH);
    const c1z = Math.floor((z + r) / CH);
    for (let cz = c0z; cz <= c1z; cz++)
      for (let cx = c0x; cx <= c1x; cx++) {
        const ch = this.chunks.get(cx + ',' + cz);
        if (ch) for (const t of ch.trees) if (Math.abs(t.x - x) < r && Math.abs(t.z - z) < r) out.push(t);
      }
    return out;
  }
  pickables(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    for (const c of this.chunks.values()) out.push(c.mesh);
    return out;
  }
  update(focus: THREE.Vector3): void {
    const fx = Math.floor(focus.x / CH);
    const fz = Math.floor(focus.z / CH);
    this.water.position.x = focus.x;
    this.water.position.z = focus.z;
    // cria no máximo 1 pedaço por quadro (o mais perto primeiro); o primeiro quadro cria o centro 3×3
    let best: [number, number] | null = null;
    let bd = Infinity;
    const R = this.radius;
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) {
        const cx = fx + dx;
        const cz = fz + dz;
        if (this.chunks.has(cx + ',' + cz)) continue;
        const d = dx * dx + dz * dz;
        if (d > R * R + 1) continue;
        if (d <= 2) this.make(cx, cz);
        else if (d < bd) {
          bd = d;
          best = [cx, cz];
        }
      }
    if (best) this.make(best[0], best[1]);
    for (const [k, c] of this.chunks)
      if (Math.abs(c.cx - fx) > R + 1 || Math.abs(c.cz - fz) > R + 1) {
        this.drop(c);
        this.chunks.delete(k);
      }
  }
  private make(cx: number, cz: number): void {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(VN * VN * 3);
    const col = new Float32Array(VN * VN * 3);
    const hs = new Float32Array(VN * VN);
    const step = CH / RES;
    const x0 = cx * CH;
    const z0 = cz * CH;
    for (let j = 0; j < VN; j++)
      for (let i = 0; i < VN; i++) {
        const x = x0 + i * step;
        const z = z0 + j * step;
        hs[j * VN + i] = this.gen.height(x, z);
      }
    const c = new THREE.Color();
    for (let j = 0; j < VN; j++)
      for (let i = 0; i < VN; i++) {
        const k = j * VN + i;
        const x = x0 + i * step;
        const z = z0 + j * step;
        const h = hs[k];
        pos[k * 3] = x;
        pos[k * 3 + 1] = h;
        pos[k * 3 + 2] = z;
        const hx = hs[j * VN + Math.min(VN - 1, i + 1)] - hs[j * VN + Math.max(0, i - 1)];
        const hz = hs[Math.min(VN - 1, j + 1) * VN + i] - hs[Math.max(0, j - 1) * VN + i];
        const slope = Math.hypot(hx, hz) / (2 * step);
        this.gen.color(x, z, h, slope, c);
        col[k * 3] = c.r;
        col[k * 3 + 1] = c.g;
        col[k * 3 + 2] = c.b;
      }
    const idx: number[] = [];
    for (let j = 0; j < RES; j++)
      for (let i = 0; i < RES; i++) {
        const a = j * VN + i;
        idx.push(a, a + VN, a + 1, a + 1, a + VN, a + VN + 1);
      }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, this.groundMat);
    mesh.receiveShadow = true;
    mesh.userData.ground = true;
    this.group.add(mesh);
    // árvores (grade de 6 m com jitter), nunca na área de construção nem na água
    const trees: TreeInfo[] = [];
    const kinds: Record<'round' | 'pine' | 'cactus' | 'palm', { m: THREE.Matrix4; c: THREE.Color }[]> = { round: [], pine: [], cactus: [], palm: [] };
    const trunks: THREE.Matrix4[] = [];
    const TS = 6;
    for (let tz = 0; tz < CH / TS; tz++)
      for (let tx = 0; tx < CH / TS; tx++) {
        const gx = cx * (CH / TS) + tx;
        const gz = cz * (CH / TS) + tz;
        const x = (gx + 0.2 + hash2(gx, gz, this.gen.seed + 50) * 0.6) * TS;
        const z = (gz + 0.2 + hash2(gx, gz, this.gen.seed + 51) * 0.6) * TS;
        if (Math.hypot(x, z) < FLAT_R + 16) continue;
        const b = this.gen.biomeAt(x, z);
        if (b.tree === 'none' || hash2(gx, gz, this.gen.seed + 52) > b.dens) continue;
        const y = this.gen.height(x, z);
        if (y < WATER_Y + 0.6 || y > 40) continue;
        const sc = 0.8 + hash2(gx, gz, this.gen.seed + 53) * 0.7;
        const leaf = new THREE.Color(b.leaf).offsetHSL((hash2(gx, gz, 54) - 0.5) * 0.04, 0, (hash2(gx, gz, 55) - 0.5) * 0.1);
        const rot = hash2(gx, gz, 56) * Math.PI * 2;
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
        const P = (yy: number, s: THREE.Vector3) => new THREE.Matrix4().compose(new THREE.Vector3(x, y + yy, z), q, s);
        let h = 5 * sc;
        if (b.tree === 'round') {
          trunks.push(P(-0.2, new THREE.Vector3(sc, 3.2 * sc, sc)));
          kinds.round.push({ m: P(3.6 * sc, new THREE.Vector3(1.9 * sc, 1.7 * sc, 1.9 * sc)), c: leaf });
        } else if (b.tree === 'pine') {
          h = 7 * sc;
          trunks.push(P(-0.2, new THREE.Vector3(sc, 1.6 * sc, sc)));
          kinds.pine.push({ m: P(1.2 * sc, new THREE.Vector3(2 * sc, 5.6 * sc, 2 * sc)), c: leaf });
        } else if (b.tree === 'cactus') {
          h = 2.4 * sc;
          kinds.cactus.push({ m: P(-0.1, new THREE.Vector3(sc, sc * 1.2, sc)), c: leaf });
        } else {
          h = 6 * sc;
          trunks.push(P(-0.2, new THREE.Vector3(0.8 * sc, 5.6 * sc, 0.8 * sc)));
          kinds.palm.push({ m: P(5.4 * sc, new THREE.Vector3(1.6 * sc, 1, 1.6 * sc)), c: leaf });
        }
        trees.push({ x, y, z, r: b.tree === 'cactus' ? 0.4 * sc : 0.3 * sc, h });
      }
    const inst: THREE.InstancedMesh[] = [];
    if (trunks.length) {
      const im = new THREE.InstancedMesh(this.geo.trunk, this.trunkMat, trunks.length);
      trunks.forEach((m, i) => im.setMatrixAt(i, m));
      inst.push(im);
    }
    for (const k of Object.keys(kinds) as (keyof typeof kinds)[]) {
      const list = kinds[k];
      if (!list.length) continue;
      const im = new THREE.InstancedMesh(this.geo[k], this.leafMat, list.length);
      list.forEach((e, i) => {
        im.setMatrixAt(i, e.m);
        im.setColorAt(i, e.c);
      });
      inst.push(im);
    }
    for (const im of inst) {
      im.castShadow = true;
      im.computeBoundingSphere();
      this.group.add(im);
    }
    this.chunks.set(cx + ',' + cz, { cx, cz, mesh, trees, inst });
  }
  private drop(c: Chunk): void {
    this.group.remove(c.mesh);
    c.mesh.geometry.dispose();
    for (const im of c.inst) {
      this.group.remove(im);
      im.dispose();
    }
  }
  dispose(): void {
    for (const c of this.chunks.values()) this.drop(c);
    this.chunks.clear();
    this.groundMat.dispose();
    this.trunkMat.dispose();
    this.leafMat.dispose();
    for (const g of Object.values(this.geo)) g.dispose();
    this.water.geometry.dispose();
    (this.water.material as THREE.Material).dispose();
  }
}
