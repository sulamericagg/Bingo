/* ============================================================
 *  BLOOP STUDIO — os 3 mundos:
 *   Infinito: terreno procedural sem fim, em pedaços (chunks), biomas e árvores
 *             (ideias copiadas de src/games/floresta/world — sem importar de lá);
 *   Plano:    chão enorme e liso com grade suave;
 *   Vazio:    só um pedestal redondo (vitrine).
 *  A área de construção (raio ~30 m em volta da origem) é sempre plana em y=0.
 * ============================================================ */
import * as THREE from 'three';
import type { BiomeId, TerrainData, TerrainMat, WorldGenSettings, WorldKind, WorldPreset } from '../format';
import { TerrainField, TerrainView } from './field';

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
export type TreeKind = 'round' | 'pine' | 'cactus' | 'palm' | 'mush' | 'none';
interface Biome {
  id: BiomeId;
  T: number;
  H: number;
  grass: THREE.Color;
  tree: TreeKind;
  leaf: string;
  dens: number;
  hill: number;
  /** desnível base (m): oceano afunda, montanhas sobem */
  base: number;
}
const C = (h: string) => new THREE.Color(h);
const BIOMES: Biome[] = [
  { id: 'campo', T: 0.5, H: 0.5, grass: C('#6cc24a'), tree: 'round', leaf: '#4fae5a', dens: 0.1, hill: 1, base: 0 },
  { id: 'floresta', T: 0.45, H: 0.85, grass: C('#3f9a46'), tree: 'round', leaf: '#2f8a3e', dens: 0.32, hill: 1.2, base: 0 },
  { id: 'deserto', T: 0.95, H: 0.1, grass: C('#f0d494'), tree: 'cactus', leaf: '#4aa85a', dens: 0.04, hill: 0.6, base: 0 },
  { id: 'neve', T: 0.05, H: 0.5, grass: C('#eef4fb'), tree: 'pine', leaf: '#3f8a76', dens: 0.18, hill: 1.6, base: 2 },
  { id: 'pantano', T: 0.6, H: 0.95, grass: C('#5a7a3a'), tree: 'round', leaf: '#4a6a2e', dens: 0.2, hill: 0.25, base: -1.6 },
  { id: 'montanhas', T: 0.25, H: 0.3, grass: C('#8a9a7a'), tree: 'pine', leaf: '#2e6a4a', dens: 0.08, hill: 2.6, base: 10 },
  { id: 'oceano', T: 0.5, H: 0.7, grass: C('#d8c890'), tree: 'none', leaf: '#000000', dens: 0, hill: 0.4, base: -16 },
  { id: 'savana', T: 0.75, H: 0.25, grass: C('#d8c45a'), tree: 'round', leaf: '#9ac24a', dens: 0.03, hill: 0.5, base: 0 },
  { id: 'outono', T: 0.3, H: 0.45, grass: C('#c49a4a'), tree: 'round', leaf: '#ff8a2e', dens: 0.18, hill: 1.1, base: 0 },
  { id: 'cogumelos', T: 0.4, H: 0.95, grass: C('#7a6ad0'), tree: 'mush', leaf: '#ff5c8a', dens: 0.16, hill: 0.9, base: 0 },
  { id: 'tropical', T: 0.85, H: 0.8, grass: C('#34b84e'), tree: 'palm', leaf: '#22a04a', dens: 0.12, hill: 0.8, base: 0 },
  { id: 'ilhas', T: 0.65, H: 0.6, grass: C('#7ad06a'), tree: 'round', leaf: '#4fbe5a', dens: 0.08, hill: 0.7, base: -6 },
];
const NB = BIOMES.length;
const SAND = C('#ead9a0');
const ROCK = C('#9a96a0');
const SNOW = C('#f6f9ff');
const LAYER_COL: Record<TerrainMat, THREE.Color> = { grass: C('#78c85a'), sand: C('#ead9a0'), snow: C('#f4f8ff'), rock: C('#9a96a0'), dirt: C('#9a6a42'), water: C('#3ab0e0') };
/** bioma: nome para a interface (o painel traduz pelo id) */
export const BIOME_LIST = BIOMES.map((b) => ({ id: b.id, color: '#' + b.grass.getHexString() }));

export const WATER_Y = -1.2;
export const CH = 48; // m por pedaço
export const RES = 16; // células por lado (3 m)
const VN = RES + 1;
const FLAT_R = 34; // área de construção plana

export interface Island {
  x: number;
  y: number;
  z: number;
  r: number;
}

/** gerador do mundo Infinito, com os ajustes de "Personalizar mundo" */
export class InfiniteGen {
  private w = new Float32Array(NB);
  private bw = new Float32Array(NB);
  readonly preset: WorldPreset;
  readonly sea: number;
  private hMul: number;
  private rough: number;
  private bScale: number;
  readonly trees: number;
  readonly caves: number;
  readonly ores: number;
  private flatTop: TerrainMat = 'grass';
  private flatY = 0;
  constructor(
    readonly seed: number,
    readonly g: WorldGenSettings = {},
  ) {
    this.preset = g.preset ?? 'normal';
    this.sea = WATER_Y + (g.sea ?? 0) + (this.preset === 'floating' ? -18 : 0);
    this.hMul = g.height ?? 1;
    this.rough = g.rough ?? 1;
    this.bScale = g.biomeSize ?? 1;
    this.trees = g.trees ?? 1;
    this.caves = g.caves ?? 0.5;
    this.ores = g.ores ?? 0.5;
    for (let i = 0; i < NB; i++) {
      let v = g.biomes?.[BIOMES[i].id] ?? (BIOMES[i].id === 'ilhas' ? 0.6 : 1);
      if (this.preset === 'islands' || this.preset === 'flatIslands') v = BIOMES[i].id === 'oceano' ? 3 : BIOMES[i].id === 'pantano' || BIOMES[i].id === 'montanhas' ? 0 : v;
      if (this.preset === 'floating') v = BIOMES[i].id === 'ilhas' ? 3 : BIOMES[i].id === 'oceano' ? 2 : 0;
      this.bw[i] = v;
    }
    if (!this.bw.some((v) => v > 0)) this.bw[0] = 1;
    if (this.preset === 'flat') {
      const L = g.layers?.length ? g.layers : [{ k: 'rock' as TerrainMat, n: 3 }, { k: 'dirt' as TerrainMat, n: 2 }, { k: 'grass' as TerrainMat, n: 1 }];
      this.flatTop = L[L.length - 1].k;
      // água por cima: o chão fica no fundo e o mar cobre
      if (this.flatTop === 'water') {
        this.flatY = -L[L.length - 1].n;
        (this as { sea: number }).sea = 0;
        this.flatTop = L.length > 1 ? L[L.length - 2].k : 'sand';
      } else (this as { sea: number }).sea = -100;
    }
  }
  weights(x: number, z: number): Float32Array {
    const s = this.seed;
    const k = this.bScale;
    const T = Math.max(0, Math.min(1, (fbm(x / (520 * k), z / (520 * k), s + 10, 3) - 0.5) * 2.6 + 0.5));
    const H = Math.max(0, Math.min(1, (fbm(x / (460 * k) + 31, z / (460 * k) - 17, s + 11, 3) - 0.5) * 2.6 + 0.5));
    let sum = 0;
    const r = Math.hypot(x, z);
    const home = smooth(260, 90, r);
    for (let i = 0; i < NB; i++) {
      const b = BIOMES[i];
      let w = Math.exp(-((T - b.T) ** 2 + (H - b.H) ** 2) / 0.02) * this.bw[i] + this.bw[i] * 1e-4;
      // perto da área de construção: o 1º bioma ligado (normalmente campo)
      if (i === this.homeBiome()) w += home * 4;
      else w *= 1 - home;
      this.w[i] = w;
      sum += w;
    }
    const kk = sum > 0 ? 1 / sum : 0;
    for (let i = 0; i < NB; i++) this.w[i] *= kk;
    if (sum <= 0) this.w[0] = 1;
    return this.w;
  }
  private home = -1;
  private homeBiome(): number {
    if (this.home < 0) {
      this.home = 0;
      for (let i = 0; i < NB; i++)
        if (this.bw[i] > 0 && BIOMES[i].id !== 'oceano') {
          this.home = i;
          break;
        }
    }
    return this.home;
  }
  height(x: number, z: number): number {
    const r = Math.hypot(x, z);
    const blend = smooth(FLAT_R, FLAT_R + 60, r);
    if (this.preset === 'flat') return this.flatY * blend;
    const s = this.seed;
    const w = this.weights(x, z);
    let hill = 0;
    let base = 0;
    for (let i = 0; i < NB; i++) {
      hill += w[i] * BIOMES[i].hill;
      base += w[i] * BIOMES[i].base;
    }
    const rf = 120 / Math.max(0.3, this.rough);
    const c = fbm(x / 700, z / 700, s + 1, 3);
    const hills = (fbm(x / rf, z / rf, s + 2, this.rough > 1.3 ? 5 : 4) - 0.5) * 18 * hill;
    const mnt = Math.max(0, fbm(x / 300, z / 300, s + 3, 4) - 0.55) * 120 * (w[3] + w[5] * 1.4);
    let h = ((c - 0.42) * 30 + hills + mnt) * this.hMul + 2 + base;
    const lake = fbm(x / 260 + 7, z / 260 - 3, s + 5, 3);
    h -= smooth(0.62, 0.74, lake) * 14;
    if (this.preset === 'islands' || this.preset === 'flatIslands') {
      const isl = fbm(x / 90, z / 90, s + 21, 3);
      const m = smooth(0.52, 0.6, isl);
      h = this.preset === 'flatIslands' ? this.sea - 8 + m * 9.5 : Math.min(h, this.sea - 8) * (1 - m) + Math.max(h, this.sea + 1 + (isl - 0.6) * 40 * this.hMul) * m;
    }
    if (this.preset === 'floating') h = this.sea - 10;
    return h * blend;
  }
  /** ilhas flutuantes de um pedaço (determinístico) */
  islands(cx: number, cz: number): Island[] {
    const out: Island[] = [];
    const n = this.preset === 'floating' ? 3 : 1;
    for (let k = 0; k < n; k++) {
      const x = (cx + 0.15 + hash2(cx, cz, this.seed + 70 + k) * 0.7) * CH;
      const z = (cz + 0.15 + hash2(cx, cz, this.seed + 80 + k) * 0.7) * CH;
      if (Math.hypot(x, z) < FLAT_R + 30) continue;
      const w = this.weights(x, z)[BIOMES.findIndex((b) => b.id === 'ilhas')];
      if (w < 0.35 || hash2(cx, cz, this.seed + 90 + k) > 0.55 + w * 0.4) continue;
      const r = 5 + hash2(cx, cz, this.seed + 91 + k) * 9;
      const gh = Math.max(this.height(x, z), this.sea);
      out.push({ x, z, r, y: gh + 14 + hash2(cx, cz, this.seed + 92 + k) * 26 });
    }
    return out;
  }
  /** cor do chão (mistura de biomas + areia perto da água + rocha/neve no alto) */
  color(x: number, z: number, h: number, slope: number, out: THREE.Color): THREE.Color {
    if (this.preset === 'flat') {
      out.copy(LAYER_COL[this.flatTop]);
      out.offsetHSL(0, 0, hash2(Math.floor(x * 0.5), Math.floor(z * 0.5), this.seed + 40) * 0.06 - 0.03);
      return out;
    }
    const w = this.weights(x, z);
    out.setRGB(0, 0, 0);
    for (let i = 0; i < NB; i++) if (w[i] > 0.001) ((out.r += BIOMES[i].grass.r * w[i]), (out.g += BIOMES[i].grass.g * w[i]), (out.b += BIOMES[i].grass.b * w[i]));
    const n = hash2(Math.floor(x * 0.5), Math.floor(z * 0.5), this.seed + 40) * 0.08 - 0.04;
    out.offsetHSL(0, 0, n);
    if (h < this.sea + 1.2) out.lerp(SAND, smooth(this.sea + 1.2, this.sea + 0.2, h));
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

/** mini-mapa de prévia (canvas): `meters` de lado, centrado na origem */
export function drawPreview(cv: HTMLCanvasElement, seed: number, g: WorldGenSettings, meters = 1600): void {
  const gen = new InfiniteGen(seed, g);
  const N = cv.width;
  const x = cv.getContext('2d')!;
  const img = x.createImageData(N, N);
  const c = new THREE.Color();
  const water = new THREE.Color('#3ab0e0');
  const deep = new THREE.Color('#1a6aa8');
  const isl = new Set<string>();
  const step = meters / N;
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const wx = (i - N / 2) * step;
      const wz = (j - N / 2) * step;
      const h = gen.height(wx, wz);
      const hx = gen.height(wx + step, wz) - h;
      gen.color(wx, wz, h, Math.abs(hx) / step, c);
      if (h < gen.sea) c.copy(water).lerp(deep, Math.min(1, (gen.sea - h) / 14));
      else c.offsetHSL(0, 0, Math.max(-0.15, Math.min(0.15, -hx * 0.08)));
      const k = (j * N + i) * 4;
      img.data[k] = c.r * 255;
      img.data[k + 1] = c.g * 255;
      img.data[k + 2] = c.b * 255;
      img.data[k + 3] = 255;
      isl.add(Math.floor(wx / CH) + ',' + Math.floor(wz / CH));
    }
  x.putImageData(img, 0, 0);
  // ilhas flutuantes (círculos brancos)
  x.strokeStyle = 'rgba(255,255,255,.9)';
  x.fillStyle = 'rgba(122,208,106,.9)';
  for (const k of isl) {
    const [cx, cz] = k.split(',').map(Number);
    for (const s of gen.islands(cx, cz)) {
      x.beginPath();
      x.arc(s.x / step + N / 2, s.z / step + N / 2, Math.max(1.5, s.r / step), 0, Math.PI * 2);
      x.fill();
      x.stroke();
    }
  }
  // área de construção
  x.strokeStyle = '#ff5cc8';
  x.lineWidth = 2;
  x.beginPath();
  x.arc(N / 2, N / 2, Math.max(3, FLAT_R / step), 0, Math.PI * 2);
  x.stroke();
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
  /** superfície da água em (x,z) ou -Infinity (boia/afunda) */
  waterAt(x: number, z: number): number;
  /** ilhas flutuantes perto de (x,z) (física) */
  islandsNear?(x: number, z: number, r: number): Island[];
  /** relevo esculpido (só no Plano) */
  field?: TerrainField;
  terrainView?: TerrainView;
  dispose(): void;
}

export interface WorldOptions {
  terrain?: TerrainData;
  gen?: WorldGenSettings;
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

export function createWorld(kind: WorldKind, seed: number, tier: number, o: WorldOptions = {}): WorldView {
  if (kind === 'flat') return flatWorld(tier, o.terrain);
  if (kind === 'void') return voidWorld();
  return new Infinite(seed, tier, o.gen);
}

/** chão plano com um buraco quadrado do tamanho do relevo (o relevo pode afundar) */
function holedPlane(half: number): THREE.BufferGeometry {
  const S = 2000;
  const sh = new THREE.Shape();
  sh.moveTo(-S, -S);
  sh.lineTo(S, -S);
  sh.lineTo(S, S);
  sh.lineTo(-S, S);
  sh.lineTo(-S, -S);
  if (half > 0) {
    const hole = new THREE.Path();
    hole.moveTo(-half, -half);
    hole.lineTo(-half, half);
    hole.lineTo(half, half);
    hole.lineTo(half, -half);
    hole.lineTo(-half, -half);
    sh.holes.push(hole);
  }
  const g = new THREE.ShapeGeometry(sh);
  // forma no plano XY → chão XZ (y para cima; z = −y da forma)
  g.rotateX(-Math.PI / 2);
  return g;
}

function flatWorld(tier: number, terrain?: TerrainData): WorldView {
  const group = new THREE.Group();
  const tex = gridTexture();
  tex.repeat.set(0.25, 0.25);
  const mat = tier <= 1 ? new THREE.MeshLambertMaterial({ map: tex }) : new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
  const field = terrain ? new TerrainField(terrain) : undefined;
  const g = holedPlane(field ? field.half : 0);
  const m = new THREE.Mesh(g, mat);
  const tmat = tier <= 1 ? new THREE.MeshLambertMaterial({ vertexColors: true }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const tv = field ? new TerrainView(field, tmat) : undefined;
  if (tv) group.add(tv.group);
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
    heightAt: (x, z) => (field ? field.heightAt(x, z) : 0),
    waterAt: (x, z) => (field ? field.waterAt(x, z) : -Infinity),
    treesNear: () => [],
    update: () => undefined,
    pickables: () => (tv ? [m, tv.mesh] : [m]),
    field,
    terrainView: tv,
    dispose() {
      tv?.dispose();
      tmat.dispose();
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
  const top = new THREE.MeshStandardMaterial({ color: '#7d68c4', roughness: 0.6 });
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
    waterAt: () => -Infinity,
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
  islands: Island[];
  extra: THREE.Object3D[];
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
    mush: new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    stem: new THREE.CylinderGeometry(0.35, 0.45, 1, 7).translate(0, 0.5, 0),
    cave: new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    mouth: new THREE.CircleGeometry(1, 14),
    ore: new THREE.OctahedronGeometry(0.5, 0),
    island: islandGeo(),
  };
  private stemMat = new THREE.MeshLambertMaterial({ color: '#f4ecd8' });
  private rockMat = new THREE.MeshLambertMaterial({ color: '#8a8696' });
  private darkMat = new THREE.MeshBasicMaterial({ color: '#1a1424' });
  private oreMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#5a4aff', emissiveIntensity: 0.5, roughness: 0.3 });
  private islandMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  constructor(
    seed: number,
    tier: number,
    g?: WorldGenSettings,
  ) {
    this.gen = new InfiniteGen(seed, g ?? {});
    if (this.gen.preset === 'floating' || this.gen.preset === 'islands') this.sky = new THREE.Color('#9fd8ff');
    this.radius = [2, 3, 3, 4][tier] ?? 3;
    this.fogFar = (this.radius + 0.5) * CH;
    this.groundMat = tier <= 1 ? new THREE.MeshLambertMaterial({ vertexColors: true }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    this.leafMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    const wg = new THREE.PlaneGeometry(CH * (this.radius * 2 + 3), CH * (this.radius * 2 + 3));
    wg.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(wg, new THREE.MeshLambertMaterial({ color: '#3ab0e0', transparent: true, opacity: 0.78 }));
    this.water.position.y = this.gen.sea;
    this.water.visible = this.gen.sea > -50;
    this.group.add(this.water);
  }
  heightAt(x: number, z: number): number {
    return Math.max(this.gen.height(x, z), this.gen.sea - 30);
  }
  waterAt(): number {
    return this.gen.sea > -50 ? this.gen.sea : -Infinity;
  }
  islandsNear(x: number, z: number, r: number): Island[] {
    const out: Island[] = [];
    for (const c of this.chunks.values()) for (const s of c.islands) if (Math.abs(s.x - x) < r + s.r && Math.abs(s.z - z) < r + s.r) out.push(s);
    return out;
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
    for (const c of this.chunks.values()) out.push(c.mesh, ...c.extra);
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
    const kinds: Record<'round' | 'pine' | 'cactus' | 'palm' | 'mush', { m: THREE.Matrix4; c: THREE.Color }[]> = { round: [], pine: [], cactus: [], palm: [], mush: [] };
    const trunks: THREE.Matrix4[] = [];
    const stems: THREE.Matrix4[] = [];
    const TS = 6;
    for (let tz = 0; tz < CH / TS; tz++)
      for (let tx = 0; tx < CH / TS; tx++) {
        const gx = cx * (CH / TS) + tx;
        const gz = cz * (CH / TS) + tz;
        const x = (gx + 0.2 + hash2(gx, gz, this.gen.seed + 50) * 0.6) * TS;
        const z = (gz + 0.2 + hash2(gx, gz, this.gen.seed + 51) * 0.6) * TS;
        if (Math.hypot(x, z) < FLAT_R + 16) continue;
        const b = this.gen.biomeAt(x, z);
        if (b.tree === 'none' || hash2(gx, gz, this.gen.seed + 52) > b.dens * this.gen.trees) continue;
        const y = this.gen.height(x, z);
        if (y < this.gen.sea + 0.6 || y > 40) continue;
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
        } else if (b.tree === 'mush') {
          h = 5 * sc;
          stems.push(P(-0.1, new THREE.Vector3(sc, 4.2 * sc, sc)));
          kinds.mush.push({ m: P(4 * sc, new THREE.Vector3(2.4 * sc, 1.6 * sc, 2.4 * sc)), c: leaf });
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
    const extra: THREE.Object3D[] = [];
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[], cols?: THREE.Color[]) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((m, i) => {
        im.setMatrixAt(i, m);
        if (cols) im.setColorAt(i, cols[i]);
      });
      inst.push(im);
    };
    add(this.geo.stem, this.stemMat, stems);
    // cavernas (entradas de pedra) e minérios (cristais) — enfeites, frequência do "Personalizar mundo"
    const caves: THREE.Matrix4[] = [];
    const mouths: THREE.Matrix4[] = [];
    const ores: THREE.Matrix4[] = [];
    const oreCols: THREE.Color[] = [];
    const ORE = ['#7ad8ff', '#ff6ad0', '#ffd34a', '#7aff9a', '#b07aff'];
    const gn = this.gen;
    for (let k = 0; k < 6; k++) {
      const x = x0c(cx) + hash2(cx * 7 + k, cz, gn.seed + 60) * CH;
      const z = cz * CH + hash2(cx, cz * 7 + k, gn.seed + 61) * CH;
      if (Math.hypot(x, z) < FLAT_R + 10) continue;
      const y = gn.height(x, z);
      if (y < gn.sea + 0.5) continue;
      const roll = hash2(cx + k, cz - k, gn.seed + 62);
      if (k < 2 && roll < 0.25 * gn.caves) {
        const s = 3 + hash2(cx, cz + k, gn.seed + 63) * 3;
        const rot = hash2(cx - k, cz, gn.seed + 64) * Math.PI * 2;
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
        caves.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y - 0.6, z), q, new THREE.Vector3(s * 1.3, s, s)));
        const fw = new THREE.Vector3(Math.sin(rot), 0, Math.cos(rot));
        mouths.push(new THREE.Matrix4().compose(new THREE.Vector3(x + fw.x * s * 1.25, y + s * 0.3, z + fw.z * s * 1.25), q, new THREE.Vector3(s * 0.55, s * 0.6, 1)));
      } else if (roll < 0.35 * gn.ores) {
        const col = new THREE.Color(ORE[Math.floor(hash2(cx, cz, gn.seed + 65 + k) * ORE.length)]);
        for (let q = 0; q < 3; q++) {
          const s = 0.5 + hash2(k, q, gn.seed + 66) * 0.7;
          const e = new THREE.Euler(hash2(q, k, 67) * 0.6 - 0.3, hash2(k, q, 68) * 3, hash2(q, k, 69) * 0.6 - 0.3);
          ores.push(new THREE.Matrix4().compose(new THREE.Vector3(x + q * 0.6 - 0.6, y + s * 0.4, z + (q % 2) * 0.5), new THREE.Quaternion().setFromEuler(e), new THREE.Vector3(s, s * 1.8, s)));
          oreCols.push(col);
        }
      }
    }
    add(this.geo.cave, this.rockMat, caves);
    add(this.geo.mouth, this.darkMat, mouths);
    add(this.geo.ore, this.oreMat, ores, oreCols);
    // ilhas flutuantes
    const islands = gn.islands(cx, cz);
    for (const s of islands) {
      const im = new THREE.Mesh(this.geo.island, this.islandMat);
      im.position.set(s.x, s.y, s.z);
      im.scale.set(s.r, s.r, s.r);
      im.castShadow = true;
      im.receiveShadow = true;
      im.userData.ground = true;
      extra.push(im);
      this.group.add(im);
    }
    for (const im of inst) {
      im.castShadow = true;
      im.computeBoundingSphere();
      this.group.add(im);
    }
    this.chunks.set(cx + ',' + cz, { cx, cz, mesh, trees, inst, islands, extra });
  }
  private drop(c: Chunk): void {
    for (const o of c.extra) this.group.remove(o);
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
    for (const m of [this.stemMat, this.rockMat, this.darkMat, this.oreMat, this.islandMat]) m.dispose();
    for (const g of Object.values(this.geo)) g.dispose();
    this.water.geometry.dispose();
    (this.water.material as THREE.Material).dispose();
  }
}

const x0c = (cx: number) => cx * CH;

/** ilha flutuante: topo plano de grama (y=0, raio 1) e um cone de pedra embaixo */
function islandGeo(): THREE.BufferGeometry {
  const top = new THREE.CylinderGeometry(1, 0.92, 0.35, 18).translate(0, -0.175, 0);
  const bot = new THREE.ConeGeometry(0.92, 1.6, 18, 3).rotateX(Math.PI).translate(0, -0.35 - 0.8, 0);
  const paint = (g: THREE.BufferGeometry, a: string, b: string) => {
    const n = g.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    const ca = new THREE.Color(a);
    const cb = new THREE.Color(b);
    for (let i = 0; i < n; i++) {
      const y = g.getAttribute('position').getY(i);
      const c = y > -0.05 ? ca : cb;
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g.toNonIndexed();
  };
  const A = paint(top, '#7ad06a', '#8a6440');
  const B = paint(bot, '#8a6440', '#8a6440');
  const pos = [...(A.getAttribute('position').array as Float32Array), ...(B.getAttribute('position').array as Float32Array)];
  const col = [...(A.getAttribute('color').array as Float32Array), ...(B.getAttribute('color').array as Float32Array)];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  top.dispose();
  bot.dispose();
  return g;
}
