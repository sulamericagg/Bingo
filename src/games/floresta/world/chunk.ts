/* ============================================================
 *  MUNDO ABERTO — um pedaço de 32×32 m: alturas (naturais + escavação),
 *  cores do chão misturadas por bioma, árvores, pedras, plantinhas.
 *  Malha com 3 níveis de detalhe + saia (sem frestas entre níveis),
 *  re-malha local em ~1 ms; heightfield do cannon-es atualizado no lugar.
 * ============================================================ */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CH, RES, VN, WATER_Y, RAIL_Z, type Camp, type WorldGen } from './gen';
import { hash2 } from './noise';
import { NB, WBIOMES, WSPECIES } from './biomes';

export const TREE_STRIDE = 8; // x, y, z, rotY, escala, espécie, rara, bioma
export const enum TState {
  Grown = 0,
  Stump = 1,
  Sapling = 2,
  Gone = 3,
}

const rgb = (hex: string): [number, number, number] => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};
const BG = WBIOMES.map((b) => rgb(b.grass));
const BG2 = WBIOMES.map((b) => rgb(b.grass2));
const BD = WBIOMES.map((b) => rgb(b.dirt));
const BR = WBIOMES.map((b) => rgb(b.rock));
const SAND = rgb('#e8d49a');
const MUD = rgb('#6a5236');
const SNOW = rgb('#f4f8ff');
const DUG = rgb('#7a5434');
const RAIL_GRAVEL = rgb('#a89a88');

/** índices compartilhados por nível de detalhe (grade + saia) */
const IDX = new Map<number, THREE.BufferAttribute>();
function indexFor(step: number): THREE.BufferAttribute {
  let a = IDX.get(step);
  if (a) return a;
  const n = RES / step + 1;
  const idx: number[] = [];
  for (let j = 0; j < n - 1; j++)
    for (let i = 0; i < n - 1; i++) {
      const a0 = j * n + i;
      const b0 = a0 + 1;
      const c0 = a0 + n;
      const d0 = c0 + 1;
      idx.push(a0, c0, b0, b0, c0, d0);
    }
  // saia: 4 bordas, cada vértice da borda ganha um "irmão" 3 m abaixo
  const base = n * n;
  const ring: number[] = [];
  for (let i = 0; i < n; i++) ring.push(i); // z0
  for (let j = 1; j < n; j++) ring.push(j * n + n - 1); // x1
  for (let i = n - 2; i >= 0; i--) ring.push((n - 1) * n + i); // z1
  for (let j = n - 2; j >= 1; j--) ring.push(j * n); // x0
  for (let r = 0; r < ring.length; r++) {
    const a0 = ring[r];
    const b0 = ring[(r + 1) % ring.length];
    const a1 = base + r;
    const b1 = base + ((r + 1) % ring.length);
    idx.push(a0, b0, a1, b0, b1, a1, a0, a1, b0, b0, a1, b1);
  }
  a = new THREE.BufferAttribute(new Uint16Array(idx), 1);
  IDX.set(step, a);
  return a;
}
function ringFor(step: number): Int32Array {
  const n = RES / step + 1;
  const ring: number[] = [];
  for (let i = 0; i < n; i++) ring.push(i);
  for (let j = 1; j < n; j++) ring.push(j * n + n - 1);
  for (let i = n - 2; i >= 0; i--) ring.push((n - 1) * n + i);
  for (let j = n - 2; j >= 1; j--) ring.push(j * n);
  return new Int32Array(ring);
}
const RINGS = new Map<number, Int32Array>();

const W = new Float32Array(NB);

export class Chunk {
  readonly x0: number;
  readonly z0: number;
  base = new Float32Array(VN * VN);
  h = new Float32Array(VN * VN);
  edit: Float32Array | null = null;
  /** cores misturadas: grama(3) grama2(3) terra(3) rocha(3) + tom (1) */
  col = new Float32Array(VN * VN * 13);
  trees: Float32Array;
  nt = 0;
  tstate: Uint8Array;
  tgrow: Float32Array;
  thp: Float32Array;
  /** quem derrubou (0 natural, 1 jogador) — os ajudantes só carregam do jogador */
  rocks: Float32Array;
  nr = 0;
  deco: Float32Array;
  nd = 0;
  /** bioma dominante no centro */
  biome = 0;
  railK: number | null = null;
  camp: Camp | null = null;
  mesh: THREE.Mesh | null = null;
  lod = -1;
  body: CANNON.Body | null = null;
  private hfData: number[][] | null = null;
  /** modificado (salvar) */
  modified = false;
  /** árvores mudaram (refazer instâncias) */
  treesDirty = true;
  minY = 0;
  maxY = 0;
  /** menor altura natural (água) */
  minBase = 0;
  /** volume escavado (cavernas, túneis) — null = só heightfield */
  vol: import('./vox').VolChunk | null = null;
  /** malhas do volume cobrem a superfície (heightfield escondido) */
  volReady = false;
  /** tem boca de caverna/ravina natural */
  natVol = false;

  constructor(
    readonly cx: number,
    readonly cz: number,
  ) {
    this.x0 = cx * CH;
    this.z0 = cz * CH;
    this.trees = new Float32Array(72 * TREE_STRIDE);
    this.tstate = new Uint8Array(72);
    this.tgrow = new Float32Array(72);
    this.thp = new Float32Array(72);
    this.rocks = new Float32Array(8 * 5);
    this.deco = new Float32Array(40 * 6);
  }

  key(): string {
    return this.cx + ',' + this.cz;
  }

  private genRow = 0;
  private gMn = 1e9;
  private gMx = -1e9;

  generate(gen: WorldGen): void {
    while (!this.generateStep(gen, Infinity));
  }

  /**
   * Gera o pedaço aos poucos (linhas do relevo) até gastar budgetMs; devolve true quando
   * terminou. O streaming divide a geração entre quadros em vez de travar um quadro inteiro.
   */
  generateStep(gen: WorldGen, budgetMs: number): boolean {
    const t0 = performance.now();
    while (this.genRow < VN) {
      this.genRowAt(gen, this.genRow++);
      if (performance.now() - t0 > budgetMs) break;
    }
    if (this.genRow < VN) return false;
    this.finishGen(gen);
    return true;
  }

  private genRowAt(gen: WorldGen, j: number): void {
    const c = this.col;
    let mn = this.gMn;
    let mx = this.gMx;
    for (let i = 0; i < VN; i++) {
        const x = this.x0 + i;
        const z = this.z0 + j;
        const k = j * VN + i;
        const y = gen.height(x, z);
        this.base[k] = y;
        this.h[k] = y;
        if (y < mn) mn = y;
        if (y > mx) mx = y;
        gen.weights(x, z, W);
        let gr = 0, gg = 0, gb = 0, hr = 0, hg = 0, hb = 0, dr = 0, dg = 0, db = 0, rr = 0, rg = 0, rb = 0;
        for (let b = 0; b < NB; b++) {
          const w = W[b];
          if (w < 0.004) continue;
          gr += BG[b][0] * w; gg += BG[b][1] * w; gb += BG[b][2] * w;
          hr += BG2[b][0] * w; hg += BG2[b][1] * w; hb += BG2[b][2] * w;
          dr += BD[b][0] * w; dg += BD[b][1] * w; db += BD[b][2] * w;
          rr += BR[b][0] * w; rg += BR[b][1] * w; rb += BR[b][2] * w;
        }
        const o = k * 13;
        c[o] = gr; c[o + 1] = gg; c[o + 2] = gb;
        c[o + 3] = hr; c[o + 4] = hg; c[o + 5] = hb;
        c[o + 6] = dr; c[o + 7] = dg; c[o + 8] = db;
        c[o + 9] = rr; c[o + 10] = rg; c[o + 11] = rb;
        c[o + 12] = gen.tint(x, z);
      }
    this.gMn = mn;
    this.gMx = mx;
  }

  private finishGen(gen: WorldGen): void {
    const mn = this.gMn;
    const mx = this.gMx;
    this.minY = mn;
    this.maxY = mx;
    this.minBase = mn;
    this.biome = gen.weights(this.x0 + CH / 2, this.z0 + CH / 2, W);
    // trilho que cruza este pedaço
    const k = Math.round((this.z0 + CH / 2) / RAIL_Z);
    if (k * RAIL_Z >= this.z0 && k * RAIL_Z < this.z0 + CH) this.railK = k;
    // acampamento cujo centro está aqui
    for (let kk = k - 1; kk <= k + 1; kk++) {
      const j = Math.round((this.x0 + CH / 2) / 224);
      for (let jj = j - 1; jj <= j + 1; jj++) {
        const cp = gen.camp(jj, kk);
        if (cp && cp.x >= this.x0 && cp.x < this.x0 + CH && cp.z >= this.z0 && cp.z < this.z0 + CH) this.camp = cp;
      }
    }
    this.genContent(gen);
  }

  private genContent(gen: WorldGen): void {
    const s = gen.seed;
    this.nt = 0;
    const cell = 4;
    for (let gj = 0; gj < CH / cell; gj++)
      for (let gi = 0; gi < CH / cell; gi++) {
        const wx = this.cx * 8 + gi;
        const wz = this.cz * 8 + gj;
        const r0 = hash2(wx, wz, s + 50);
        const x = this.x0 + gi * cell + 0.6 + hash2(wx, wz, s + 51) * (cell - 1.2);
        const z = this.z0 + gj * cell + 0.6 + hash2(wx, wz, s + 52) * (cell - 1.2);
        gen.weights(x, z, W);
        let dens = 0;
        for (let b = 0; b < NB; b++) dens += W[b] * WBIOMES[b].dens;
        // bosquezinhos: o ruído de densidade agrupa as árvores
        dens *= 0.45 + hash2(wx >> 2, wz >> 2, s + 53) * 1.1;
        if (r0 > dens) continue;
        const y = this.hAt(x - this.x0, z - this.z0);
        if (y < WATER_Y + 0.5 && !(W[7] > 0.5 && y > WATER_Y - 0.4)) continue;
        if (this.slope(x - this.x0, z - this.z0) > 0.85) continue;
        const k = Math.round(z / RAIL_Z);
        if (Math.abs(z - k * RAIL_Z) < 9) continue;
        if (Math.hypot(x, z - 14) < 22) continue;
        if (Math.abs(x) < 30 && z > 34 && z < 58) continue; // garagem inicial
        const cp = gen.nearestCamp(x, z, 30);
        if (cp && Math.hypot(x - cp.x, z - cp.z) < 26) continue;
        if (this.nt >= this.tstate.length) break;
        const { sp, b } = gen.pickSpecies(hash2(wx, wz, s + 54), hash2(wx, wz, s + 55), W);
        const q = hash2(wx, wz, s + 56);
        const rare = q < 0.018 ? 1 : q < 0.03 ? 2 : q < 0.042 ? 3 : 0;
        const o = this.nt * TREE_STRIDE;
        const T = this.trees;
        T[o] = x;
        T[o + 1] = y;
        T[o + 2] = z;
        T[o + 3] = hash2(wx, wz, s + 57) * Math.PI * 2;
        T[o + 4] = 0.8 + hash2(wx, wz, s + 58) * 0.45;
        T[o + 5] = sp;
        T[o + 6] = rare;
        T[o + 7] = b;
        this.tstate[this.nt] = TState.Grown;
        this.tgrow[this.nt] = 1;
        this.thp[this.nt] = WSPECIES[sp].hp * (rare ? 1.6 : 1);
        this.nt++;
      }
    // pedras
    this.nr = 0;
    const nr = Math.floor(hash2(this.cx, this.cz, s + 60) * 4);
    for (let i = 0; i < nr; i++) {
      const x = this.x0 + 2 + hash2(this.cx * 7 + i, this.cz, s + 61) * (CH - 4);
      const z = this.z0 + 2 + hash2(this.cx, this.cz * 7 + i, s + 62) * (CH - 4);
      const y = this.hAt(x - this.x0, z - this.z0);
      if (y < WATER_Y - 0.5 || Math.abs(z - Math.round(z / RAIL_Z) * RAIL_Z) < 6) continue;
      const o = this.nr * 5;
      this.rocks[o] = x;
      this.rocks[o + 1] = y;
      this.rocks[o + 2] = z;
      this.rocks[o + 3] = 0.5 + hash2(i, this.cx + this.cz, s + 63) * 1.3;
      this.rocks[o + 4] = gen.weights(x, z, W);
      this.nr++;
    }
    // plantinhas e flores
    this.nd = 0;
    for (let i = 0; i < 40; i++) {
      const x = this.x0 + hash2(this.cx * 41 + i, this.cz, s + 70) * CH;
      const z = this.z0 + hash2(this.cx, this.cz * 41 + i, s + 71) * CH;
      const y = this.hAt(x - this.x0, z - this.z0);
      if (y < WATER_Y + 0.2) continue;
      const b = gen.weights(x, z, W);
      if (hash2(i, this.cx - this.cz, s + 72) > WBIOMES[b].dens * 1.6 + 0.12) continue;
      const o = this.nd * 6;
      this.deco[o] = x;
      this.deco[o + 1] = y;
      this.deco[o + 2] = z;
      this.deco[o + 3] = 0.6 + hash2(i, this.cz, s + 73) * 0.7;
      this.deco[o + 4] = hash2(i, this.cx, s + 74) < 0.35 ? 1 : 0;
      this.deco[o + 5] = b;
      this.nd++;
    }
  }

  /** altura natural (sem escavação) bilinear */
  bAt(lx: number, lz: number): number {
    return this.interp(this.base, lx, lz);
  }
  /** altura bilinear em coordenadas locais (0..CH) */
  hAt(lx: number, lz: number): number {
    return this.interp(this.h, lx, lz);
  }
  private interp(h: Float32Array, lx: number, lz: number): number {
    if (lx < 0) lx = 0;
    else if (lx > RES - 1e-4) lx = RES - 1e-4;
    if (lz < 0) lz = 0;
    else if (lz > RES - 1e-4) lz = RES - 1e-4;
    const i = Math.floor(lx);
    const j = Math.floor(lz);
    const fx = lx - i;
    const fz = lz - j;
    const k = j * VN + i;
    const a = h[k];
    const b = h[k + 1];
    const c = h[k + VN];
    const d = h[k + VN + 1];
    // mesma divisão em triângulos da malha (a,c,b)/(b,c,d)
    if (fx + fz <= 1) return a + (b - a) * fx + (c - a) * fz;
    return d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
  }
  slope(lx: number, lz: number): number {
    return Math.hypot(this.hAt(lx + 0.7, lz) - this.hAt(lx - 0.7, lz), this.hAt(lx, lz + 0.7) - this.hAt(lx, lz - 0.7)) / 1.4;
  }

  /** soma dy ao vértice (i,j) — chamado pelo editor do mundo */
  addH(i: number, j: number, dy: number, minY: number): void {
    const k = j * VN + i;
    if (!this.edit) this.edit = new Float32Array(VN * VN);
    let ny = this.h[k] + dy;
    if (ny < minY) ny = minY;
    this.edit[k] = ny - this.base[k];
    this.h[k] = ny;
    if (ny < this.minY) this.minY = ny;
    if (ny > this.maxY) this.maxY = ny;
    this.modified = true;
  }

  /* ------------------------------ malha ------------------------------ */

  buildMesh(step: number, mat: THREE.Material): THREE.Mesh {
    const n = RES / step + 1;
    const ring = RINGS.get(step) ?? (RINGS.set(step, ringFor(step)), RINGS.get(step)!);
    const nv = n * n + ring.length;
    let m = this.mesh;
    if (!m || this.lod !== step) {
      if (m) m.geometry.dispose();
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
      g.setIndex(indexFor(step));
      if (!m) {
        m = new THREE.Mesh(g, mat);
        m.matrixAutoUpdate = false;
        m.receiveShadow = true;
        this.mesh = m;
      } else m.geometry = g;
      this.lod = step;
    }
    this.fillMesh();
    return m;
  }

  /** reescreve posições/normais/cores no lugar (sem alocar) */
  fillMesh(): void {
    const m = this.mesh!;
    const step = this.lod;
    const n = RES / step + 1;
    const g = m.geometry;
    const P = (g.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    const N = (g.getAttribute('normal') as THREE.BufferAttribute).array as Float32Array;
    const C = (g.getAttribute('color') as THREE.BufferAttribute).array as Float32Array;
    const h = this.h;
    const col = this.col;
    const ed = this.edit;
    const rail = this.railK;
    for (let jj = 0; jj < n; jj++)
      for (let ii = 0; ii < n; ii++) {
        const i = ii * step;
        const j = jj * step;
        const k = j * VN + i;
        const v = jj * n + ii;
        const y = h[k];
        P[v * 3] = this.x0 + i;
        P[v * 3 + 1] = y;
        P[v * 3 + 2] = this.z0 + j;
        const hl = h[j * VN + Math.max(0, i - 1)];
        const hr = h[j * VN + Math.min(RES, i + 1)];
        const hd = h[Math.max(0, j - 1) * VN + i];
        const hu = h[Math.min(RES, j + 1) * VN + i];
        const dx = (hr - hl) / (i > 0 && i < RES ? 2 : 1);
        const dz = (hu - hd) / (j > 0 && j < RES ? 2 : 1);
        const il = 1 / Math.sqrt(dx * dx + 1 + dz * dz);
        N[v * 3] = -dx * il;
        N[v * 3 + 1] = il;
        N[v * 3 + 2] = -dz * il;
        // cor: grama ↔ grama2 pelo tom; rocha nas encostas; areia/lama na beira d'água; neve no alto; terra onde cavou
        const o = k * 13;
        const tn = col[o + 12];
        let r = col[o] + (col[o + 3] - col[o]) * tn;
        let gg = col[o + 1] + (col[o + 4] - col[o + 1]) * tn;
        let b = col[o + 2] + (col[o + 5] - col[o + 2]) * tn;
        const sl = Math.sqrt(dx * dx + dz * dz);
        const rk = sl > 0.75 ? Math.min(1, (sl - 0.75) * 2.5) : 0;
        if (rk > 0) {
          r += (col[o + 9] - r) * rk;
          gg += (col[o + 10] - gg) * rk;
          b += (col[o + 11] - b) * rk;
        }
        if (y > 34) {
          const s = Math.min(1, (y - 34) / 8) * (1 - rk * 0.6);
          r += (SNOW[0] - r) * s;
          gg += (SNOW[1] - gg) * s;
          b += (SNOW[2] - b) * s;
        }
        const by = this.base[k];
        if (by < WATER_Y + 1.1 && y > by - 1) {
          const s = Math.min(1, (WATER_Y + 1.1 - by) / 0.8);
          const sand = col[o + 1] > col[o] * 1.4 && col[o + 2] < 0.3 ? MUD : SAND;
          r += (sand[0] - r) * s;
          gg += (sand[1] - gg) * s;
          b += (sand[2] - b) * s;
        }
        if (ed && ed[k] !== 0) {
          const e = ed[k];
          const s = Math.min(1, Math.abs(e) * 1.5);
          const tgt = e < -1.4 ? col.subarray(o + 9, o + 12) : DUG;
          r += (tgt[0] * (e < -1.4 ? 1 : 1) - r) * s;
          gg += (tgt[1] - gg) * s;
          b += (tgt[2] - b) * s;
        }
        if (rail !== null) {
          const d = Math.abs(this.z0 + j - rail * RAIL_Z);
          if (d < 3.2) {
            const s = d < 2.4 ? 0.85 : (3.2 - d) / 0.8 * 0.85;
            r += (RAIL_GRAVEL[0] - r) * s;
            gg += (RAIL_GRAVEL[1] - gg) * s;
            b += (RAIL_GRAVEL[2] - b) * s;
          }
        }
        // listras suaves (variação)
        const sh = 0.93 + ((i * 7 + j * 13) % 5) * 0.018;
        C[v * 3] = r * sh;
        C[v * 3 + 1] = gg * sh;
        C[v * 3 + 2] = b * sh;
      }
    const base = n * n;
    const ring = RINGS.get(step)!;
    for (let r = 0; r < ring.length; r++) {
      const s = ring[r];
      const d = base + r;
      P[d * 3] = P[s * 3];
      P[d * 3 + 1] = P[s * 3 + 1] - 3;
      P[d * 3 + 2] = P[s * 3 + 2];
      N[d * 3] = N[s * 3];
      N[d * 3 + 1] = N[s * 3 + 1];
      N[d * 3 + 2] = N[s * 3 + 2];
      C[d * 3] = C[s * 3] * 0.8;
      C[d * 3 + 1] = C[s * 3 + 1] * 0.8;
      C[d * 3 + 2] = C[s * 3 + 2] * 0.8;
    }
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('normal') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    if (!g.boundingSphere) g.boundingSphere = new THREE.Sphere();
    const cy = (this.minY + this.maxY) / 2;
    g.boundingSphere.center.set(this.x0 + CH / 2, cy, this.z0 + CH / 2);
    g.boundingSphere.radius = Math.hypot(CH * 0.71, (this.maxY - this.minY) / 2 + 3);
    if (!g.boundingBox) g.boundingBox = new THREE.Box3();
    g.boundingBox.min.set(this.x0, this.minY - 3, this.z0);
    g.boundingBox.max.set(this.x0 + CH, this.maxY, this.z0 + CH);
  }

  /* ------------------------------ física ------------------------------ */

  makeBody(mat: CANNON.Material, group: number): CANNON.Body {
    const data: number[][] = [];
    for (let i = 0; i < VN; i++) {
      const row: number[] = [];
      for (let j = 0; j < VN; j++) row.push(this.h[(RES - j) * VN + i]);
      data.push(row);
    }
    this.hfData = data;
    const shape = new CANNON.Heightfield(data, { elementSize: 1 });
    const body = new CANNON.Body({ mass: 0, material: mat, collisionFilterGroup: group });
    body.addShape(shape);
    body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    body.position.set(this.x0, 0, this.z0 + CH);
    this.body = body;
    return body;
  }
  /** copia as alturas para o heightfield (depois de escavar) */
  syncBody(): void {
    const b = this.body;
    const d = this.hfData;
    if (!b || !d) return;
    for (let i = 0; i < VN; i++) for (let j = 0; j < VN; j++) d[i][j] = this.h[(RES - j) * VN + i];
    const s = b.shapes[0] as CANNON.Heightfield;
    s.updateMinValue();
    s.updateMaxValue();
    s.update();
    s.updateBoundingSphereRadius();
    b.updateBoundingRadius();
    b.aabbNeedsUpdate = true;
  }
  dropBody(): void {
    this.body = null;
    this.hfData = null;
  }

  /* ------------------------------ salvar ------------------------------ */

  /** escavação quantizada (int8, 0.25 m) em base64 */
  encodeEdit(): string {
    if (!this.edit) return '';
    let s = '';
    let any = false;
    for (let k = 0; k < VN * VN; k++) {
      const q = Math.max(-127, Math.min(127, Math.round(this.edit[k] * 4)));
      if (q) any = true;
      s += String.fromCharCode(q & 255);
    }
    return any ? btoa(s) : '';
  }
  decodeEdit(b64: string): void {
    try {
      const s = atob(b64);
      if (s.length !== VN * VN) return;
      this.edit = new Float32Array(VN * VN);
      for (let k = 0; k < VN * VN; k++) {
        let q = s.charCodeAt(k);
        if (q > 127) q -= 256;
        this.edit[k] = q / 4;
        this.h[k] = this.base[k] + this.edit[k];
        if (this.h[k] < this.minY) this.minY = this.h[k];
        if (this.h[k] > this.maxY) this.maxY = this.h[k];
      }
      // árvores sobre buracos acompanham o chão
      for (let i = 0; i < this.nt; i++) {
        const o = i * TREE_STRIDE;
        this.trees[o + 1] = this.hAt(this.trees[o] - this.x0, this.trees[o + 2] - this.z0);
      }
    } catch {
      /* dado ruim: ignora */
    }
  }
}
