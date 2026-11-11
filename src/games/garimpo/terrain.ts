/* ============================================================
 *  GARIMPO BRUTO — terreno deformável (campo de alturas).
 *  Grade física fixa N×N (0,5 m) com altura, umidade, material e trilha (sulco).
 *  A malha é dividida em blocos de CHUNK células; só as linhas sujas de cada bloco
 *  sobem para a GPU (addUpdateRange). O passo da malha (1 ou 2) segue a qualidade.
 * ============================================================ */
import * as THREE from 'three';
import { groundMaterial, NL, TL, lerpSplat } from './ground';
import { setSplat, splatAttributes } from '../../3d/nature';

export const N = 384;
export const SIZE = 192;
export const CELL = SIZE / N;
export const V = N + 1;
export const CA = CELL * CELL; // área de uma célula (m²)

export const MAT_DIRT = 0;
export const MAT_GRASS = 1;
export const MAT_ROAD = 2;
export const MAT_MUD = 3;
export const MAT_SAND = 4;

/** cores-base (terra vermelha amazônica, grama, estrada batida, lama, areia) */
const BASE: [number, number, number][] = [
  [0.78, 0.36, 0.17],
  [0.27, 0.45, 0.13],
  [0.84, 0.5, 0.28],
  [0.4, 0.23, 0.13],
  [0.86, 0.68, 0.44],
];
/** atrito-base por material */
export const MAT_GRIP = [0.85, 0.78, 0.95, 0.6, 0.7];

interface Chunk {
  ci: number;
  cj: number;
  nv: number;
  geo: THREE.BufferGeometry;
  mesh: THREE.Mesh;
  pos: THREE.BufferAttribute;
  nrm: THREE.BufferAttribute;
  col: THREE.BufferAttribute;
  sp: Uint8Array[];
  dirty: boolean;
  i0: number;
  j0: number;
  i1: number;
  j1: number;
}

export interface BladeState {
  carry: number;
  /** ouro (g) misturado na terra que está na lâmina */
  gold: number;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const qcm = (d: number) => Math.max(-32767, Math.min(32767, Math.round(d * 100)));
function i16b64(out: number[]): string {
  const u8 = new Uint8Array(new Int16Array(out).buffer);
  let s = '';
  for (let k = 0; k < u8.length; k += 8192) s += String.fromCharCode(...u8.subarray(k, k + 8192));
  return btoa(s);
}
function b64i16(b64: string): Int16Array {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length & ~1);
  for (let k = 0; k < u8.length; k++) u8[k] = bin.charCodeAt(k);
  return new Int16Array(u8.buffer);
}

export class Terrain {
  readonly h = new Float32Array(V * V);
  readonly wet = new Float32Array(V * V);
  readonly mat = new Uint8Array(V * V);
  readonly rut = new Float32Array(V * V);
  readonly tint = new Float32Array(V * V);
  readonly basin = new Float32Array(V * V);
  /** altura original (gerada) — profundidade cavada = h0 - h */
  readonly h0 = new Float32Array(V * V);
  /** minério: teor de pico (g/m³) e profundidade do pico (m) por célula */
  readonly oreR = new Float32Array(V * V);
  readonly oreD = new Float32Array(V * V);
  /** teor (g/m³) da terra solta despejada por cima do terreno original */
  readonly pay = new Float32Array(V * V);
  /** ouro (g) tirado pela última operação de corte (dig) */
  goldOut = 0;
  /** chuva acumulada 0..1 (umidade extra, maior nas baixadas) */
  rain = 0;
  /** avisado quando o chão muda (x0,z0,x1,z1 em metros) — a grama se refaz ali */
  onEdit: ((x0: number, z0: number, x1: number, z1: number) => void) | null = null;
  /** sobreposição colorida (meta de altura): devolve h - alvo, ou NaN fora da área */
  overlay: ((k: number) => number) | null = null;
  overlayTol = 0.12;
  readonly group = new THREE.Group();
  material: THREE.MeshLambertMaterial;
  readonly uRain = { value: 0 };
  private chunks: Chunk[] = [];
  private stride = 1;
  /** células por bloco da malha (32 cheio, 64 no passo 2 → 4× menos draw calls) */
  private CHUNK = 32;
  private NC = N / 32;
  private stamp = new Uint32Array(V * V);
  private stampId = 1;

  constructor() {
    this.material = this.makeMat(2);
  }

  /** material do chão (biblioteca compartilhada) + chuva/poças por cima */
  private makeMat(tier: number): THREE.MeshLambertMaterial {
    const m = groundMaterial(tier);
    const uRain = this.uRain;
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
      prev.call(m, sh, r);
      sh.uniforms.uRain = uRain;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float basin;\nvarying float vBasin;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBasin = basin;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uRain;\nvarying float vBasin;').replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        float wr = uRain * (0.35 + 0.65 * vBasin);
        gl_FragColor.rgb *= 1.0 - 0.3 * wr;
        float pud = smoothstep(0.5, 0.85, uRain * vBasin);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.16, 0.15, 0.15), pud * 0.7);`,
      );
    };
    const key = m.customProgramCacheKey.bind(m);
    m.customProgramCacheKey = () => key() + '|garimpo-rain';
    return m;
  }
  /** troca o material conforme a qualidade (0 = uma camada só) */
  setTier(tier: number): void {
    const old = this.material;
    this.material = this.makeMat(tier);
    for (const c of this.chunks) c.mesh.material = this.material;
    old.dispose();
  }

  /* ------------------------- consulta ------------------------- */

  heightAt(x: number, z: number): number {
    let fx = x / CELL;
    let fz = z / CELL;
    fx = fx < 0 ? 0 : fx > N - 1e-4 ? N - 1e-4 : fx;
    fz = fz < 0 ? 0 : fz > N - 1e-4 ? N - 1e-4 : fz;
    const i = fx | 0;
    const j = fz | 0;
    const tx = fx - i;
    const tz = fz - j;
    const k = j * V + i;
    const h = this.h;
    const a = h[k] + (h[k + 1] - h[k]) * tx;
    const b = h[k + V] + (h[k + V + 1] - h[k + V]) * tx;
    return a + (b - a) * tz;
  }

  normalAt(x: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    const d = CELL;
    const hx = this.heightAt(x + d, z) - this.heightAt(x - d, z);
    const hz = this.heightAt(x, z + d) - this.heightAt(x, z - d);
    return out.set(-hx, 2 * d, -hz).normalize();
  }

  /** índice da célula mais próxima */
  idx(x: number, z: number): number {
    const i = clamp(Math.round(x / CELL), 0, N);
    const j = clamp(Math.round(z / CELL), 0, N);
    return j * V + i;
  }

  /** umidade efetiva (inclui a chuva) */
  wetK(k: number): number {
    const w = this.wet[k] + this.rain * (0.18 + 0.55 * this.basin[k]);
    return w > 1 ? 1 : w;
  }
  wetAt(x: number, z: number): number {
    return this.wetK(this.idx(x, z));
  }

  /** teor (g/m³) da terra na célula k na profundidade do corte */
  grade(k: number, hMid: number): number {
    if (hMid > this.h0[k] + 0.02) return this.pay[k];
    const d = this.h0[k] - hMid;
    const r = this.oreR[k];
    if (r <= 0) return 0.15;
    const e = (d - this.oreD[k]) / 1.7;
    return r * (Math.exp(-e * e) + 0.04) + 0.15;
  }
  /** mistura terra com teor g (g/m³) espessura add em cima da célula k */
  private mix(k: number, add: number, g: number): void {
    const loose = Math.max(0, this.h[k] - this.h0[k]);
    const tot = loose + add;
    this.pay[k] = tot > 1e-5 ? (this.pay[k] * loose + g * add) / tot : g;
  }

  /* ------------------------- malha ------------------------- */

  /** (re)cria a malha com o passo dado (1 = cheia, 2 = metade dos vértices) */
  build(stride: 1 | 2): void {
    for (const c of this.chunks) {
      c.geo.dispose();
      this.group.remove(c.mesh);
    }
    this.chunks = [];
    this.stride = stride;
    this.CHUNK = stride === 2 ? 64 : 32;
    this.NC = N / this.CHUNK;
    const nq = this.CHUNK / stride;
    const nv = nq + 1;
    // índice compartilhado entre os blocos (mesma topologia)
    const idx: number[] = [];
    for (let b = 0; b < nq; b++)
      for (let a = 0; a < nq; a++) {
        const p = b * nv + a;
        if ((a + b) & 1) idx.push(p, p + nv, p + 1, p + 1, p + nv, p + nv + 1);
        else idx.push(p, p + nv, p + nv + 1, p, p + nv + 1, p + 1);
      }
    const index = new THREE.Uint16BufferAttribute(idx, 1);
    for (let cj = 0; cj < this.NC; cj++)
      for (let ci = 0; ci < this.NC; ci++) {
        const geo = new THREE.BufferGeometry();
        const cnt = nv * nv;
        const pos = new THREE.BufferAttribute(new Float32Array(cnt * 3), 3);
        const nrm = new THREE.BufferAttribute(new Float32Array(cnt * 3), 3);
        const col = new THREE.BufferAttribute(new Float32Array(cnt * 3), 3);
        const uv = new Float32Array(cnt * 2);
        const bas = new Float32Array(cnt);
        pos.setUsage(THREE.DynamicDrawUsage);
        nrm.setUsage(THREE.DynamicDrawUsage);
        col.setUsage(THREE.DynamicDrawUsage);
        for (let b = 0; b < nv; b++)
          for (let a = 0; a < nv; a++) {
            const gi = ci * this.CHUNK + a * stride;
            const gj = cj * this.CHUNK + b * stride;
            const p = b * nv + a;
            pos.array[p * 3] = gi * CELL;
            pos.array[p * 3 + 2] = gj * CELL;
            uv[p * 2] = (gi * CELL) / 3.2;
            uv[p * 2 + 1] = (gj * CELL) / 3.2;
            bas[p] = this.basin[gj * V + gi];
          }
        geo.setAttribute('position', pos);
        geo.setAttribute('normal', nrm);
        geo.setAttribute('color', col);
        geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        geo.setAttribute('basin', new THREE.BufferAttribute(bas, 1));
        geo.setIndex(index);
        const sp = splatAttributes(geo, cnt);
        for (let q = 0; q < 3; q++) (geo.getAttribute('aSplat' + q) as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
        const cx = (ci + 0.5) * this.CHUNK * CELL;
        const cz = (cj + 0.5) * this.CHUNK * CELL;
        let lo = 1e9;
        let hi = -1e9;
        for (let j = cj * this.CHUNK; j <= (cj + 1) * this.CHUNK; j += 4)
          for (let i = ci * this.CHUNK; i <= (ci + 1) * this.CHUNK; i += 4) {
            const y = this.h[j * V + i];
            if (y < lo) lo = y;
            if (y > hi) hi = y;
          }
        const half = this.CHUNK * CELL * 0.5;
        geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, (lo + hi) / 2, cz), Math.hypot(half * 1.42, (hi - lo) / 2 + 8));
        const mesh = new THREE.Mesh(geo, this.material);
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        this.group.add(mesh);
        const c: Chunk = { ci, cj, nv, geo, mesh, pos, nrm, col, sp, dirty: true, i0: ci * this.CHUNK, j0: cj * this.CHUNK, i1: (ci + 1) * this.CHUNK, j1: (cj + 1) * this.CHUNK };
        this.chunks.push(c);
        this.writeChunk(c, true);
      }
  }

  /* ---------------- rede (anfitrião): edições em delta ---------------- */
  /** células candidatas a mudar desde o último retrato (só com startNet) */
  private netMark: Uint8Array | null = null;
  private netList: number[] = [];
  /** último valor mandado (cm acima/abaixo do original) */
  private netSent: Int16Array | null = null;
  startNet(): void {
    this.netMark = new Uint8Array(V * V);
    this.netSent = new Int16Array(V * V);
    for (let k = 0; k < V * V; k++) this.netSent[k] = qcm(this.h[k] - this.h0[k]);
    this.netList = [];
  }
  stopNet(): void {
    this.netMark = null;
    this.netSent = null;
    this.netList = [];
  }
  /** delta compacto (base64 de Int16: pulo, quantas, valores em cm) ou '' se nada mudou */
  takeNetDelta(): string {
    const mark = this.netMark;
    const sent = this.netSent;
    if (!mark || !sent || !this.netList.length) return '';
    const ks: number[] = [];
    for (const k of this.netList) {
      mark[k] = 0;
      const q = qcm(this.h[k] - this.h0[k]);
      if (q !== sent[k]) {
        sent[k] = q;
        ks.push(k);
      }
    }
    this.netList = [];
    if (!ks.length) return '';
    ks.sort((a, b) => a - b);
    const out: number[] = [];
    let prev = 0;
    let i = 0;
    while (i < ks.length) {
      let skip = ks[i] - prev;
      while (skip > 32767) {
        out.push(32767, 0);
        skip -= 32767;
      }
      let n = 1;
      while (i + n < ks.length && ks[i + n] === ks[i] + n && n < 32000) n++;
      out.push(skip, n);
      for (let c = 0; c < n; c++) out.push(sent[ks[i + c]]);
      prev = ks[i] + n;
      i += n;
    }
    return i16b64(out);
  }
  /** convidado: aplica um delta do anfitrião (alturas absolutas em cm sobre o original) */
  applyNetDelta(b64: string): void {
    let a: Int16Array;
    try {
      a = b64i16(b64);
    } catch {
      return;
    }
    let p = 0;
    let k = 0;
    let i0 = V;
    let j0 = V;
    let i1 = -1;
    let j1 = -1;
    const n = V * V;
    while (p + 1 < a.length) {
      k += a[p++];
      const cnt = a[p++];
      for (let c = 0; c < cnt && k < n && p < a.length; c++, k++) {
        this.h[k] = this.h0[k] + a[p++] / 100;
        if (this.mat[k] === MAT_GRASS || this.mat[k] === MAT_SAND) this.mat[k] = MAT_DIRT;
        const i = k % V;
        const j = (k / V) | 0;
        if (i < i0) i0 = i;
        if (i > i1) i1 = i;
        if (j < j0) j0 = j;
        if (j > j1) j1 = j;
      }
      // blocos longe um do outro: marca cada um (não refaz o mapa inteiro)
      if (i1 >= 0 && (i1 - i0 > 24 || j1 - j0 > 24)) {
        this.markRect(i0, j0, i1, j1);
        i0 = j0 = V;
        i1 = j1 = -1;
      }
    }
    if (i1 >= 0) this.markRect(i0, j0, i1, j1);
  }

  /** marca vértices [i0..i1]×[j0..j1] como alterados */
  markRect(i0: number, j0: number, i1: number, j1: number): void {
    this.onEdit?.(i0 * CELL, j0 * CELL, i1 * CELL, j1 * CELL);
    const nm = this.netMark;
    if (nm) {
      const a0 = clamp(i0, 0, N);
      const a1 = clamp(i1, 0, N);
      const b0 = clamp(j0, 0, N);
      const b1 = clamp(j1, 0, N);
      for (let j = b0; j <= b1; j++)
        for (let i = a0; i <= a1; i++) {
          const k = j * V + i;
          if (!nm[k]) {
            nm[k] = 1;
            this.netList.push(k);
          }
        }
    }
    i0 = clamp(i0 - 1, 0, N);
    j0 = clamp(j0 - 1, 0, N);
    i1 = clamp(i1 + 1, 0, N);
    j1 = clamp(j1 + 1, 0, N);
    const c0 = Math.max(0, Math.floor((i0 - 1) / this.CHUNK));
    const c1 = Math.min(this.NC - 1, Math.floor(i1 / this.CHUNK));
    const r0 = Math.max(0, Math.floor((j0 - 1) / this.CHUNK));
    const r1 = Math.min(this.NC - 1, Math.floor(j1 / this.CHUNK));
    for (let cj = r0; cj <= r1; cj++)
      for (let ci = c0; ci <= c1; ci++) {
        const c = this.chunks[cj * this.NC + ci];
        if (!c) continue;
        const a0 = Math.max(i0, ci * this.CHUNK);
        const a1 = Math.min(i1, (ci + 1) * this.CHUNK);
        const b0 = Math.max(j0, cj * this.CHUNK);
        const b1 = Math.min(j1, (cj + 1) * this.CHUNK);
        if (a0 > a1 || b0 > b1) continue;
        if (!c.dirty) {
          c.dirty = true;
          c.i0 = a0;
          c.i1 = a1;
          c.j0 = b0;
          c.j1 = b1;
        } else {
          if (a0 < c.i0) c.i0 = a0;
          if (a1 > c.i1) c.i1 = a1;
          if (b0 < c.j0) c.j0 = b0;
          if (b1 > c.j1) c.j1 = b1;
        }
      }
  }
  markAll(): void {
    this.markRect(0, 0, N, N);
  }
  /** marca a célula k (e vizinhas) */
  markK(k: number): void {
    const i = k % V;
    const j = (k / V) | 0;
    this.markRect(i, j, i, j);
  }

  /** envia para a GPU só o que mudou (uma vez por quadro) */
  flush(): void {
    for (const c of this.chunks) if (c.dirty) this.writeChunk(c, false);
  }

  private writeChunk(c: Chunk, all: boolean): void {
    const s = this.stride;
    const nv = c.nv;
    const bi0 = c.ci * this.CHUNK;
    const bj0 = c.cj * this.CHUNK;
    let a0 = 0;
    let a1 = nv - 1;
    let b0 = 0;
    let b1 = nv - 1;
    if (!all) {
      a0 = clamp(Math.floor((c.i0 - bi0) / s), 0, nv - 1);
      a1 = clamp(Math.ceil((c.i1 - bi0) / s), 0, nv - 1);
      b0 = clamp(Math.floor((c.j0 - bj0) / s), 0, nv - 1);
      b1 = clamp(Math.ceil((c.j1 - bj0) / s), 0, nv - 1);
    }
    const P = c.pos.array as Float32Array;
    const Nn = c.nrm.array as Float32Array;
    const C = c.col.array as Float32Array;
    const h = this.h;
    const ov = this.overlay;
    const tol = this.overlayTol;
    for (let b = b0; b <= b1; b++) {
      const gj = bj0 + b * s;
      for (let a = a0; a <= a1; a++) {
        const gi = bi0 + a * s;
        const k = gj * V + gi;
        const p = (b * nv + a) * 3;
        P[p + 1] = h[k];
        // normal por diferenças centrais
        const il = gi - s < 0 ? 0 : gi - s;
        const ir = gi + s > N ? N : gi + s;
        const jd = gj - s < 0 ? 0 : gj - s;
        const ju = gj + s > N ? N : gj + s;
        const dx = (h[gj * V + ir] - h[gj * V + il]) / ((ir - il) * CELL);
        const dz = (h[ju * V + gi] - h[jd * V + gi]) / ((ju - jd) * CELL);
        const inv = 1 / Math.sqrt(dx * dx + 1 + dz * dz);
        Nn[p] = -dx * inv;
        Nn[p + 1] = inv;
        Nn[p + 2] = -dz * inv;
        // cor
        const m = this.mat[k];
        const base = BASE[m];
        let r = base[0];
        let g = base[1];
        let bl = base[2];
        // pesos das camadas de textura
        const W = SPW;
        W.fill(0);
        const tn = this.tint[k];
        if (m === MAT_GRASS) {
          W[TL.grass] = 1;
          lerpSplat(W, TL.forestFloor, Math.max(0, -tn * 6));
        } else if (m === MAT_DIRT) W[TL.redDirt] = 1;
        else if (m === MAT_ROAD) {
          W[TL.redDirt] = 1;
          lerpSplat(W, TL.gravel, 0.45 + tn * 2);
        } else if (m === MAT_MUD) W[TL.mud] = 1;
        else W[TL.sand] = 1;
        if (inv < 0.8) {
          // barranco: grama dá lugar à terra, muito íngreme vira pedra
          const f = Math.min(1, (0.8 - inv) * 4);
          if (m === MAT_GRASS) {
            r += (BASE[0][0] - r) * f;
            g += (BASE[0][1] - g) * f;
            bl += (BASE[0][2] - bl) * f;
            lerpSplat(W, TL.redDirt, f);
          }
          lerpSplat(W, TL.stone, Math.min(1, (0.62 - inv) * 4));
        }
        const w = this.wet[k];
        const ru = this.rut[k];
        // escavação: terra recém-cortada mais escura/avermelhada; buracos com sombra (AO)
        const dug = this.h0[k] - h[k];
        const loose = -dug;
        let ao = 1;
        if (dug > 0.03) {
          const f = Math.min(1, dug * 1.4);
          r += (0.62 - r) * f;
          g += (0.25 - g) * f;
          bl += (0.12 - bl) * f;
          lerpSplat(W, TL.redDirt, Math.min(1, dug * 3));
          if (dug > 1.2) lerpSplat(W, TL.stone, Math.min(0.6, (dug - 1.2) * 0.4));
        } else if (loose > 0.05) {
          // terra solta (monte da lâmina, pilhas): mais clara e granulada
          const f = Math.min(1, loose * 1.5);
          r += (0.86 - r) * f * 0.6;
          g += (0.45 - g) * f * 0.6;
          bl += (0.24 - bl) * f * 0.6;
          lerpSplat(W, TL.dirt, f * 0.5);
        }
        {
          // oclusão: quanto o vértice está abaixo da média dos vizinhos (3 células)
          const q = 3 * s;
          const i0 = gi - q < 0 ? 0 : gi - q;
          const i1 = gi + q > N ? N : gi + q;
          const j0 = gj - q < 0 ? 0 : gj - q;
          const j1 = gj + q > N ? N : gj + q;
          const avg = (h[gj * V + i0] + h[gj * V + i1] + h[j0 * V + gi] + h[j1 * V + gi]) * 0.25;
          const cav = avg - h[k];
          if (cav > 0.02) ao = 1 - Math.min(0.42, cav * 0.55);
        }
        if (ru > 0.01) lerpSplat(W, w > 0.4 ? TL.mud : TL.dirt, Math.min(0.8, ru * 4));
        setSplat(c.sp, b * nv + a, W);
        const dk = (1 - 0.4 * w) * (1 - Math.min(0.32, ru * 1.6)) * (1 + tn) * ao;
        r *= dk;
        g *= dk;
        bl *= dk;
        if (ov) {
          const d = ov(k);
          if (d === d) {
            let tr: number;
            let tg: number;
            let tb: number;
            let f: number;
            if (Math.abs(d) < tol) {
              tr = 0.35;
              tg = 0.9;
              tb = 0.35;
              f = 0.5;
            } else if (d > 0) {
              tr = 1;
              tg = 0.55;
              tb = 0.12;
              f = Math.min(0.75, 0.35 + d * 0.5);
            } else {
              tr = 0.25;
              tg = 0.5;
              tb = 1;
              f = Math.min(0.75, 0.35 - d * 0.5);
            }
            r += (tr - r) * f;
            g += (tg - g) * f;
            bl += (tb - bl) * f;
          }
        }
        C[p] = r;
        C[p + 1] = g;
        C[p + 2] = bl;
      }
    }
    c.dirty = false;
    const start = (b0 * nv + a0) * 3;
    const count = ((b1 - b0) * nv + (a1 - a0) + 1) * 3;
    for (const at of [c.pos, c.nrm, c.col]) {
      if (!all) {
        at.clearUpdateRanges();
        at.addUpdateRange(start, count);
      }
      at.needsUpdate = true;
    }
    for (let q = 0; q < 3; q++) {
      const at = c.geo.getAttribute('aSplat' + q) as THREE.BufferAttribute;
      if (!all) {
        at.clearUpdateRanges();
        at.addUpdateRange((start / 3) * 4, (count / 3) * 4);
      }
      at.needsUpdate = true;
    }
  }

  /* ------------------------- deformação ------------------------- */

  private begin(): void {
    this.stampId++;
    if (this.stampId > 4e9) {
      this.stamp.fill(0);
      this.stampId = 1;
    }
  }
  private once(k: number): boolean {
    if (this.stamp[k] === this.stampId) return false;
    this.stamp[k] = this.stampId;
    return true;
  }

  /**
   * Lâmina de A até B (A = ponta que recebe, B = ponta que despeja), fundo em yA..yB.
   * Corta o que está acima do fundo, enche buracos com o estoque da lâmina (st.carry, m³)
   * e despeja o resto: modo 0 (trator) à frente (dx,dz); modo 1 (motoniveladora) na ponta B.
   * Devolve o volume cortado neste passo (m³).
   */
  blade(ax: number, az: number, ay: number, bx: number, bz: number, by: number, dx: number, dz: number, mode: 0 | 1, st: BladeState, maxCut: number): number {
    this.begin();
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(2, Math.ceil(len / (CELL * 0.45)));
    let cut = 0;
    let i0 = V;
    let j0 = V;
    let i1 = -1;
    let j1 = -1;
    const h = this.h;
    for (let s = 0; s <= n; s++) {
      const t = s / n;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      const y = ay + (by - ay) * t;
      // duas fileiras (lâmina tem espessura): na linha e meio passo atrás
      for (let r = 0; r < 2; r++) {
        const k = this.idx(x - dx * r * CELL * 0.7, z - dz * r * CELL * 0.7);
        if (!this.once(k)) continue;
        const hk = h[k];
        if (hk > y + 0.004) {
          const c = Math.min(hk - y, maxCut);
          st.gold += c * CA * this.grade(k, hk - c * 0.5);
          h[k] = hk - c;
          st.carry += c * CA;
          cut += c * CA;
          this.rut[k] *= 0.6;
          if (this.mat[k] === MAT_GRASS || this.mat[k] === MAT_SAND) this.mat[k] = MAT_DIRT;
        } else if (hk < y - 0.01 && st.carry > 0) {
          const f = Math.min(y - hk, st.carry / CA, maxCut);
          const gr = st.gold / st.carry;
          this.mix(k, f, gr);
          h[k] = hk + f;
          st.gold -= f * CA * gr;
          st.carry -= f * CA;
          this.rut[k] *= 0.5;
          if (this.mat[k] !== MAT_MUD) this.mat[k] = MAT_DIRT;
        } else continue;
        const i = k % V;
        const j = (k / V) | 0;
        if (i < i0) i0 = i;
        if (i > i1) i1 = i;
        if (j < j0) j0 = j;
        if (j > j1) j1 = j;
      }
    }
    if (i1 >= 0) this.markRect(i0, j0, i1, j1);
    // despejo do estoque
    if (st.carry > 0.0005) {
      if (mode === 0) {
        const amt = st.carry * 0.3;
        const gr = st.gold / st.carry;
        st.gold -= amt * gr;
        st.carry -= amt;
        this.begin();
        const m = Math.max(2, Math.ceil(len / CELL));
        const off = 0.85;
        let cnt = 0;
        const ks = TMP_KS;
        for (let s = 0; s <= m && cnt < ks.length; s++) {
          const t = s / m;
          // deixa as bordas mais baixas: a terra escapa um pouco pelas laterais
          const k = this.idx(ax + (bx - ax) * t + dx * off, az + (bz - az) * t + dz * off);
          if (this.once(k)) ks[cnt++] = k;
        }
        const per = amt / Math.max(1, cnt) / CA;
        for (let q = 0; q < cnt; q++) {
          const k = ks[q];
          this.mix(k, per, gr);
          h[k] += per;
          if (this.mat[k] === MAT_GRASS) this.mat[k] = MAT_DIRT;
          this.markK(k);
        }
      } else {
        const amt = st.carry * 0.25;
        const gr = st.gold / st.carry;
        st.gold -= amt * gr;
        st.carry -= amt;
        const ex = bx - ax;
        const ez = bz - az;
        const el = Math.hypot(ex, ez) || 1;
        this.deposit(bx + (ex / el) * 0.55, bz + (ez / el) * 0.55, amt, 0.9, gr);
      }
    }
    return cut;
  }

  /** espalha `vol` m³ em volta de (x,z), raio r (pilha em cone) */
  deposit(x: number, z: number, vol: number, r: number, grade = 0): void {
    if (vol <= 0) return;
    const i0 = clamp(Math.floor((x - r) / CELL), 0, N);
    const i1 = clamp(Math.ceil((x + r) / CELL), 0, N);
    const j0 = clamp(Math.floor((z - r) / CELL), 0, N);
    const j1 = clamp(Math.ceil((z + r) / CELL), 0, N);
    let sw = 0;
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(i * CELL - x, j * CELL - z);
        if (d < r) sw += 1 - d / r;
      }
    if (sw <= 0) {
      const k = this.idx(x, z);
      this.mix(k, vol / CA, grade);
      this.h[k] += vol / CA;
      this.markK(k);
      return;
    }
    const f = vol / CA / sw;
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(i * CELL - x, j * CELL - z);
        if (d >= r) continue;
        const k = j * V + i;
        this.mix(k, f * (1 - d / r), grade);
        this.h[k] += f * (1 - d / r);
        if (this.mat[k] === MAT_GRASS || this.mat[k] === MAT_SAND) this.mat[k] = MAT_DIRT;
        this.rut[k] *= 0.5;
      }
    this.markRect(i0, j0, i1, j1);
  }

  /** caçamba da escavadeira: corta até a ponta (x,y,z) num raio r; devolve o volume tirado (≤ maxVol) */
  dig(x: number, y: number, z: number, r: number, maxVol: number, maxCut: number): number {
    if (maxVol <= 0) return 0;
    const i0 = clamp(Math.floor((x - r) / CELL), 0, N);
    const i1 = clamp(Math.ceil((x + r) / CELL), 0, N);
    const j0 = clamp(Math.floor((z - r) / CELL), 0, N);
    const j1 = clamp(Math.ceil((z + r) / CELL), 0, N);
    let vol = 0;
    this.goldOut = 0;
    for (let j = j0; j <= j1 && vol < maxVol; j++)
      for (let i = i0; i <= i1 && vol < maxVol; i++) {
        const d = Math.hypot(i * CELL - x, j * CELL - z);
        if (d >= r) continue;
        const k = j * V + i;
        const tgt = y + (d / r) * (d / r) * r * 0.5;
        const hk = this.h[k];
        if (hk <= tgt) continue;
        const c = Math.min(hk - tgt, maxCut, (maxVol - vol) / CA);
        this.goldOut += c * CA * this.grade(k, hk - c * 0.5);
        this.h[k] = hk - c;
        vol += c * CA;
        if (this.mat[k] === MAT_GRASS) this.mat[k] = MAT_DIRT;
      }
    if (vol > 0) this.markRect(i0, j0, i1, j1);
    return vol;
  }

  /** pneu/esteira passando: afunda (sulco) e levanta um pouco as bordas. Devolve o afundamento aplicado. */
  rutAt(x: number, z: number, depth: number, sx: number, sz: number): number {
    const k = this.idx(x, z);
    const w = this.wetK(k);
    const max = 0.025 + 0.36 * w * w;
    const room = max - this.rut[k];
    if (room <= 0.0004) return 0;
    const d = Math.min(depth, room);
    this.h[k] -= d;
    this.rut[k] += d;
    // metade vira "beirada" dos lados (o resto compacta)
    const kl = this.idx(x + sx * CELL * 1.1, z + sz * CELL * 1.1);
    const kr = this.idx(x - sx * CELL * 1.1, z - sz * CELL * 1.1);
    if (kl !== k) this.h[kl] += d * 0.22;
    if (kr !== k) this.h[kr] += d * 0.22;
    const i = k % V;
    const j = (k / V) | 0;
    this.markRect(i - 2, j - 2, i + 2, j + 2);
    return d;
  }

  /** ângulo de repouso: terra solta escorre (só numa janela pequena em volta da ferramenta) */
  relax(x: number, z: number, r: number, talus = 0.72): void {
    const i0 = clamp(Math.floor((x - r) / CELL), 1, N - 1);
    const i1 = clamp(Math.ceil((x + r) / CELL), 1, N - 1);
    const j0 = clamp(Math.floor((z - r) / CELL), 1, N - 1);
    const j1 = clamp(Math.ceil((z + r) / CELL), 1, N - 1);
    const lim = talus * CELL;
    const h = this.h;
    let moved = false;
    for (let j = j0; j < j1; j++)
      for (let i = i0; i < i1; i++) {
        const k = j * V + i;
        // vizinho da direita e de cima (cada par uma vez)
        for (let q = 0; q < 2; q++) {
          const n = q === 0 ? k + 1 : k + V;
          const d = h[k] - h[n];
          if (d > lim) {
            const m = (d - lim) * 0.25;
            h[k] -= m;
            h[n] += m;
            if (this.mat[n] === MAT_GRASS) this.mat[n] = MAT_DIRT;
            moved = true;
          } else if (-d > lim) {
            const m = (-d - lim) * 0.25;
            h[n] -= m;
            h[k] += m;
            if (this.mat[k] === MAT_GRASS) this.mat[k] = MAT_DIRT;
            moved = true;
          }
        }
      }
    if (moved) this.markRect(i0, j0, i1, j1);
  }

  dispose(): void {
    for (const c of this.chunks) c.geo.dispose();
    this.material.dispose();
  }
}

const TMP_KS = new Int32Array(64);
const SPW = new Float32Array(NL);

