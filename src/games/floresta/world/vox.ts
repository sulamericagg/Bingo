/* ============================================================
 *  MUNDO ABERTO — SUBSOLO VOLUMÉTRICO.
 *  O chão continua sendo um heightfield suave (barato) até alguém cavar
 *  ou até existir uma boca de caverna/ravina natural no pedaço. Aí o
 *  pedaço vira "volume": um campo de densidade 3D (1 m) em seções de
 *  32×16×32, com cavernas, túneis, ravinas, camadas (terra → argila →
 *  pedra → pedra profunda → rocha-mãe), veios de minério por profundidade,
 *  bolsões de lava e aquíferos. Malha por "surface nets" (suave, sem cubos),
 *  só das seções sujas, com orçamento de tempo por quadro.
 *  Densidade > 0 = sólido.  Valores quantizados em int8 (×10).
 * ============================================================ */
import * as THREE from 'three';
import { CH, RES, VN } from './gen';
import type { Chunk } from './chunk';
import { fbm } from './noise';

export const BED_Y = -64;
export const TOP_Y = 128;
export const SEC = 16;
export const NSEC = (TOP_Y - BED_Y) / SEC;
const SX = CH + 1; // 33 amostras por lado
const SY = SEC + 1; // 17
const SN = SX * SY * SX;
const Q = 10;
const DMAX = 12.7;

/** materiais do subsolo (índices gravados no save — não reordenar) */
export const enum M {
  Air = 0,
  Topo = 1,
  Terra = 2,
  Argila = 3,
  Areia = 4,
  Pedra = 5,
  Funda = 6,
  RochaMae = 7,
  Carvao = 8,
  Cobre = 9,
  Ferro = 10,
  Prata = 11,
  Ouro = 12,
  Cristal = 13,
  Gema = 14,
  Neve = 15,
  Agua = 20,
  Lava = 21,
}
export interface MatInfo {
  col: [number, number, number];
  /** nível mínimo da picareta */
  hard: number;
  /** item que sai ao minerar (id) */
  drop: string;
  /** amostras por item */
  per: number;
  glow?: boolean;
}
const hex = (h: string): [number, number, number] => {
  const c = new THREE.Color(h);
  return [c.r, c.g, c.b];
};
export const MATS: Record<number, MatInfo> = {
  [M.Topo]: { col: hex('#6cc24a'), hard: 0, drop: 'terra', per: 3 },
  [M.Terra]: { col: hex('#8a6440'), hard: 0, drop: 'terra', per: 3 },
  [M.Argila]: { col: hex('#c07a5a'), hard: 0, drop: 'argila', per: 3 },
  [M.Areia]: { col: hex('#e8d49a'), hard: 0, drop: 'areia', per: 3 },
  [M.Pedra]: { col: hex('#8e8a96'), hard: 1, drop: 'pedra', per: 3 },
  [M.Funda]: { col: hex('#5a5668'), hard: 2, drop: 'pedra_funda', per: 3 },
  [M.RochaMae]: { col: hex('#2a2436'), hard: 99, drop: '', per: 1 },
  [M.Carvao]: { col: hex('#2e2a30'), hard: 1, drop: 'carvao', per: 2 },
  [M.Cobre]: { col: hex('#f08a4a'), hard: 2, drop: 'min_cobre', per: 2 },
  [M.Ferro]: { col: hex('#d8b49a'), hard: 2, drop: 'min_ferro', per: 2 },
  [M.Prata]: { col: hex('#e8f0ff'), hard: 4, drop: 'min_prata', per: 2 },
  [M.Ouro]: { col: hex('#ffd02e'), hard: 4, drop: 'min_ouro', per: 2 },
  [M.Cristal]: { col: hex('#7af0ff'), hard: 5, drop: 'cristal', per: 2, glow: true },
  [M.Gema]: { col: hex('#ff4ad8'), hard: 5, drop: 'gema', per: 2, glow: true },
  [M.Neve]: { col: hex('#f4f8ff'), hard: 0, drop: 'neve', per: 3 },
};

/* ------------------------------ ruído 3D ------------------------------ */

export function hash3(x: number, y: number, z: number, seed: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 1440670441) + Math.imul(z | 0, 668265263) + Math.imul(seed | 0, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function noise3(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash3(ix, iy, iz, seed);
  const b = hash3(ix + 1, iy, iz, seed);
  const c = hash3(ix, iy + 1, iz, seed);
  const d = hash3(ix + 1, iy + 1, iz, seed);
  const e = hash3(ix, iy, iz + 1, seed);
  const f = hash3(ix + 1, iy, iz + 1, seed);
  const g = hash3(ix, iy + 1, iz + 1, seed);
  const h = hash3(ix + 1, iy + 1, iz + 1, seed);
  const x0 = a + (b - a) * ux;
  const x1 = c + (d - c) * ux;
  const x2 = e + (f - e) * ux;
  const x3 = g + (h - g) * ux;
  const y0 = x0 + (x1 - x0) * uy;
  const y1 = x2 + (x3 - x2) * uy;
  return y0 + (y1 - y0) * uz;
}

/* ------------------------------ gerador ------------------------------ */

const ORE_TAB: [number, number, number, number][] = [
  // material, yMax, yMin, peso
  [M.Carvao, 40, -34, 4],
  [M.Cobre, -2, -42, 3],
  [M.Ferro, -12, -58, 3],
  [M.Prata, -28, -64, 2],
  [M.Ouro, -38, -64, 1.4],
  [M.Cristal, -30, -64, 1],
  [M.Gema, -48, -64, 0.45],
];

export class VolGen {
  /** ilhas no céu: função da máscara (só no tipo "flutuantes") */
  sky: ((x: number, z: number, out: Float32Array) => void) | null = null;
  private sk = new Float32Array(2);
  private lx = NaN;
  private lz = NaN;
  constructor(readonly seed: number) {}
  /** densidade das ilhas flutuantes (ou -99) */
  island(wx: number, wy: number, wz: number, out: { d: number; m: number }): boolean {
    if (!this.sky) return false;
    if (wx !== this.lx || wz !== this.lz) {
      this.lx = wx;
      this.lz = wz;
      this.sky(wx, wz, this.sk);
    }
    const m = this.sk[0];
    if (m <= 0) return false;
    const cy = this.sk[1];
    const top = cy + m * 5;
    const bot = cy - m * 26 - noise3(wx / 9, wy / 9, wz / 9, this.seed + 97) * 3;
    const d = Math.min(top - wy, wy - bot);
    if (d <= 0) return false;
    out.d = Math.min(DMAX, d);
    const dep = top - wy;
    out.m = dep < 1 ? M.Topo : dep < 3 ? M.Terra : M.Pedra;
    if (dep > 3 && noise3(wx / 4, wy / 4, wz / 4, this.seed + 98) > 0.76) out.m = wy > 50 ? M.Ouro : M.Ferro;
    return true;
  }
  /** fatores por coluna (bocas de caverna, ravinas) */
  column(wx: number, wz: number, out: Float32Array): void {
    const s = this.seed;
    const m = fbm(wx / 80, wz / 80, s + 300, 2);
    out[0] = m < 0.6 ? 0 : m > 0.68 ? 1 : (m - 0.6) / 0.08;
    const rv = fbm(wx / 260, wz / 260, s + 310, 2);
    const rm = fbm(wx / 520, wz / 520, s + 311, 1);
    out[1] = rm > 0.56 ? (Math.abs(rv - 0.5) - 0.011) * 260 : 99;
    out[2] = fbm(wx / 300, wz / 300, s + 320, 1); // aquífero
  }
  /** densidade (m) e material num ponto; H = altura do terreno na coluna */
  point(wx: number, wy: number, wz: number, H: number, col: Float32Array, desert: boolean, out: { d: number; m: number }): void {
    if (wy > H + 8 && this.island(wx, wy, wz, out)) return;
    const s = this.seed;
    const depth = H - wy;
    // rocha-mãe ondulada no fundo
    const bed = BED_Y + 2 + hash3(wx, 0, wz, s + 5) * 1.6;
    if (wy <= bed) {
      out.d = DMAX;
      out.m = M.RochaMae;
      return;
    }
    let d = depth;
    if (depth > -1.5 && wy > bed + 1) {
      const mouth = col[0];
      let allow = depth > 6 ? 1 : depth > 2 ? (depth - 2) / 4 : 0;
      if (mouth > allow) allow = mouth;
      if (allow > 0) {
        const a = noise3(wx / 26, wy / 17, wz / 26, s + 1) - 0.5;
        const b = noise3(wx / 26 + 7.7, wy / 17, wz / 26, s + 2) - 0.5;
        let cd = (Math.sqrt(a * a + b * b) - 0.085) * 28;
        if (wy < -12) {
          const c = noise3(wx / 44, wy / 24, wz / 44, s + 3);
          const c2 = (0.66 - c) * 36 + (wy < -54 ? (wy + 54) * -0.8 : 0);
          if (c2 < cd) cd = c2;
        }
        cd += (1 - allow) * 8;
        if (cd < d) d = cd;
      }
      // ravina: corte estreito e fundo
      const rd = col[1];
      if (rd < 6) {
        let rr = rd;
        const fl = H - 26 - wy;
        if (fl > rr) rr = fl;
        if (rr < d) d = rr;
      }
    }
    if (d > DMAX) d = DMAX;
    else if (d < -DMAX) d = -DMAX;
    out.d = d;
    if (d <= 0) {
      // ar: lava bem fundo, água nos aquíferos
      if (depth > 0) {
        if (wy <= -52) out.m = M.Lava;
        else if (wy <= -16 && wy > -40 && col[2] > 0.6 && depth > 8) out.m = M.Agua;
        else out.m = M.Air;
      } else out.m = M.Air;
      return;
    }
    if (depth < 1) out.m = desert ? M.Areia : H > 36 ? M.Neve : M.Topo;
    else if (depth < 3.5) out.m = desert ? M.Areia : M.Terra;
    else if (depth < 8) out.m = desert ? M.Areia : M.Argila;
    else {
      out.m = wy > -24 ? M.Pedra : M.Funda;
      const v = noise3(wx / 4.5, wy / 4.5, wz / 4.5, s + 50);
      if (v > 0.73) {
        const h = hash3(wx >> 3, wy >> 3, wz >> 3, s + 51);
        let tot = 0;
        for (let i = 0; i < ORE_TAB.length; i++) {
          const o = ORE_TAB[i];
          if (wy <= o[1] && wy >= o[2] && (o[0] !== M.Gema || v > 0.8)) tot += o[3];
        }
        let q = h * tot;
        for (let i = 0; i < ORE_TAB.length; i++) {
          const o = ORE_TAB[i];
          if (!(wy <= o[1] && wy >= o[2] && (o[0] !== M.Gema || v > 0.8))) continue;
          q -= o[3];
          if (q <= 0) {
            out.m = o[0];
            break;
          }
        }
      }
    }
  }
}

/* ------------------------------ seções ------------------------------ */

export class Section {
  d = new Int8Array(SN);
  m = new Uint8Array(SN);
  /** cópia do gerado (só depois da primeira edição) */
  bd: Int8Array | null = null;
  bm: Uint8Array | null = null;
  mesh: THREE.Mesh | null = null;
  fluid: THREE.Mesh | null = null;
  lava: THREE.Mesh | null = null;
  /** posições/índices para a física (trimesh) */
  pos: Float32Array | null = null;
  idx: Uint32Array | null = null;
  dirty = true;
  queued = false;
  constructor(readonly s: number) {}
  get edited(): boolean {
    return this.bd !== null;
  }
  markEdit(): void {
    if (this.bd) return;
    this.bd = this.d.slice();
    this.bm = this.m.slice();
  }
}
const sidx = (x: number, y: number, z: number) => x + y * SX + z * SX * SY;

const _col = new Float32Array(3);
const _pt = { d: 0, m: 0 };

export class VolChunk {
  secs: (Section | null)[] = new Array(NSEC).fill(null);
  /** altura do terreno usada para gerar (natural + escavação antiga do heightfield) */
  hGen: Float32Array;
  colData: Float32Array;
  desert: boolean;
  /** diffs do save a aplicar quando a seção for gerada */
  pend: Record<number, string> = {};
  readonly cx: number;
  readonly cz: number;
  constructor(
    readonly c: Chunk,
    readonly vg: VolGen,
  ) {
    this.cx = c.cx;
    this.cz = c.cz;
    this.hGen = new Float32Array(VN * VN);
    for (let k = 0; k < VN * VN; k++) this.hGen[k] = c.base[k] + (c.edit ? c.edit[k] : 0);
    this.colData = new Float32Array(VN * VN * 3);
    for (let j = 0; j < VN; j++)
      for (let i = 0; i < VN; i++) {
        vg.column(c.x0 + i, c.z0 + j, _col);
        const o = (j * VN + i) * 3;
        this.colData[o] = _col[0];
        this.colData[o + 1] = _col[1];
        this.colData[o + 2] = _col[2];
      }
    this.desert = c.biome === 8;
  }

  /** seção s (gera na hora se preciso) */
  sec(s: number): Section {
    let S = this.secs[s];
    if (S) return S;
    S = new Section(s);
    const y0 = BED_Y + s * SEC;
    const x0 = this.c.x0;
    const z0 = this.c.z0;
    const cd = this.colData;
    for (let z = 0; z < SX; z++)
      for (let x = 0; x < SX; x++) {
        const k = z * VN + x;
        const H = this.hGen[k];
        _col[0] = cd[k * 3];
        _col[1] = cd[k * 3 + 1];
        _col[2] = cd[k * 3 + 2];
        // coluna toda no ar ou toda maciça longe da superfície e sem cavernas: atalho
        for (let y = 0; y < SY; y++) {
          const wy = y0 + y;
          const i = sidx(x, y, z);
          if (wy > H + 2 && _col[1] > 6 && !this.vg.sky) {
            S.d[i] = -127;
            S.m[i] = M.Air;
            continue;
          }
          this.vg.point(x0 + x, wy, z0 + z, H, _col, this.desert, _pt);
          let q = Math.round(_pt.d * Q);
          if (q > 127) q = 127;
          else if (q < -127) q = -127;
          S.d[i] = q;
          S.m[i] = _pt.m;
        }
      }
    this.secs[s] = S;
    const p = this.pend[s];
    if (p) {
      delete this.pend[s];
      decodeSec(S, p);
    }
    return S;
  }

  /** densidade inteira (amostra) em coordenadas locais */
  dAt(lx: number, wy: number, lz: number): number {
    let s = Math.floor((wy - BED_Y) / SEC);
    if (s < 0) return DMAX;
    if (s >= NSEC) return -DMAX;
    let ly = wy - BED_Y - s * SEC;
    // amostras da borda de cima pertencem às duas seções: usa a de baixo se existir
    if (ly === 0 && s > 0 && this.secs[s - 1]) {
      s--;
      ly = SEC;
    }
    return this.sec(s).d[sidx(lx, ly, lz)] / Q;
  }
  mAt(lx: number, wy: number, lz: number): number {
    let s = Math.floor((wy - BED_Y) / SEC);
    if (s < 0) return M.RochaMae;
    if (s >= NSEC) return M.Air;
    let ly = wy - BED_Y - s * SEC;
    if (ly === 0 && s > 0 && this.secs[s - 1]) {
      s--;
      ly = SEC;
    }
    return this.sec(s).m[sidx(lx, ly, lz)];
  }

  /** densidade trilinear (m) num ponto do mundo dentro deste pedaço */
  dens(x: number, y: number, z: number): number {
    let lx = x - this.c.x0;
    let lz = z - this.c.z0;
    if (lx < 0) lx = 0;
    else if (lx > RES - 1e-4) lx = RES - 1e-4;
    if (lz < 0) lz = 0;
    else if (lz > RES - 1e-4) lz = RES - 1e-4;
    const ix = Math.floor(lx);
    const iz = Math.floor(lz);
    const iy = Math.floor(y);
    const fx = lx - ix;
    const fz = lz - iz;
    const fy = y - iy;
    const a = this.dAt(ix, iy, iz);
    const b = this.dAt(ix + 1, iy, iz);
    const c = this.dAt(ix, iy + 1, iz);
    const d = this.dAt(ix + 1, iy + 1, iz);
    const e = this.dAt(ix, iy, iz + 1);
    const f = this.dAt(ix + 1, iy, iz + 1);
    const g = this.dAt(ix, iy + 1, iz + 1);
    const h = this.dAt(ix + 1, iy + 1, iz + 1);
    const x0 = a + (b - a) * fx;
    const x1 = c + (d - c) * fx;
    const x2 = e + (f - e) * fx;
    const x3 = g + (h - g) * fx;
    const y0 = x0 + (x1 - x0) * fy;
    const y1 = x2 + (x3 - x2) * fy;
    return y0 + (y1 - y0) * fz;
  }

  /** primeiro chão sólido descendo a partir de y (até 24 m) */
  floor(x: number, y: number, z: number): number {
    let prev = this.dens(x, y, z);
    if (prev > 0) {
      // dentro do sólido: sobe até sair (no máx 2 m)
      for (let k = 1; k <= 8; k++) {
        const yy = y + k * 0.25;
        const d = this.dens(x, yy, z);
        if (d <= 0) return this.refine(x, z, yy - 0.25, yy, prev, d);
        prev = d;
      }
      return y;
    }
    // passos de 0,5 m perto, 1 m longe (cavernas fundas, ilhas no céu)
    let yy = y;
    for (let k = 0; k < 400; k++) {
      const st = k < 16 ? 0.5 : 1;
      yy -= st;
      if (yy < BED_Y) return BED_Y + 2;
      const d = this.dens(x, yy, z);
      if (d > 0) return this.refine(x, z, yy, yy + st, d, prev);
      prev = d;
    }
    return BED_Y + 2;
  }

  /** superfície entre lo (sólido, dLo > 0) e hi (ar, dHi ≤ 0): bisseção + interpolação final.
   *  Sem isso a resposta dependia da fase da amostragem de 0,5 m (o pé "tremia" ±8 cm andando). */
  private refine(x: number, z: number, lo: number, hi: number, dLo: number, dHi: number): number {
    for (let i = 0; i < 4; i++) {
      const m = (lo + hi) * 0.5;
      const d = this.dens(x, m, z);
      if (d > 0) {
        lo = m;
        dLo = d;
      } else {
        hi = m;
        dHi = d;
      }
    }
    return lo + (dLo / (dLo - dHi)) * (hi - lo);
  }

  /** topo sólido da coluna (para heightAt / árvores) */
  topAt(lx: number, lz: number, from: number): number {
    let prev = this.dAt(lx, Math.ceil(from), lz);
    for (let y = Math.ceil(from) - 1; y >= BED_Y; y--) {
      const d = this.dAt(lx, y, lz);
      if (d > 0) return y + d / (d - prev);
      prev = d;
    }
    return BED_Y;
  }
}

/* ------------------------------ save (diffs esparsos) ------------------------------ */

export function encodeSec(S: Section): string {
  if (!S.bd || !S.bm) return '';
  const out: number[] = [];
  let last = 0;
  let any = false;
  for (let i = 0; i < SN; i++) {
    if (S.d[i] === S.bd[i] && S.m[i] === S.bm[i]) continue;
    any = true;
    let gap = i - last;
    last = i;
    // varint
    while (gap >= 128) {
      out.push((gap & 127) | 128);
      gap >>>= 7;
    }
    out.push(gap);
    out.push(S.d[i] & 255, S.m[i]);
  }
  if (!any) return '';
  let s = '';
  for (let i = 0; i < out.length; i++) s += String.fromCharCode(out[i]);
  return btoa(s);
}
export function decodeSec(S: Section, b64: string): void {
  try {
    const s = atob(b64);
    S.markEdit();
    let p = 0;
    let i = 0;
    while (p < s.length) {
      let gap = 0;
      let sh = 0;
      for (;;) {
        const b = s.charCodeAt(p++);
        gap |= (b & 127) << sh;
        sh += 7;
        if (!(b & 128)) break;
      }
      i += gap;
      if (i >= SN || p + 2 > s.length) break;
      let d = s.charCodeAt(p++);
      if (d > 127) d -= 256;
      S.d[i] = d;
      S.m[i] = s.charCodeAt(p++);
    }
  } catch {
    /* dado ruim */
  }
}

/* ------------------------------ malha (surface nets) ------------------------------ */

const PX = SX + 2; // amostras -1..33 → 35 (a borda +x/+z pode ser nossa)
const PY = SY + 1; // -1..16 → 18
const PN = PX * PY * PX;
const pD = new Float32Array(PN);
const pM = new Uint8Array(PN);
const CX = SX + 1; // células -1..32 → 34
const CY = SY; // -1..15 → 17
const cellV = new Int32Array(CX * CY * CX);
const EDGES: [number, number][] = [];
for (let a = 0; a < 8; a++) for (const bit of [1, 2, 4]) if (!(a & bit)) EDGES.push([a, a | bit]);
const CORN = [
  [0, 0, 0],
  [1, 0, 0],
  [0, 1, 0],
  [1, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [0, 1, 1],
  [1, 1, 1],
];
const pi = (x: number, y: number, z: number) => x + 1 + (y + 1) * PX + (z + 1) * PX * PY;
const COFF = CORN.map(([x, y, z]) => x + y * PX + z * PX * PY);

/** saída reaproveitada do mesher (cresce sob demanda) */
let oP = new Float32Array(30000);
let oN = new Float32Array(30000);
let oC = new Float32Array(30000);
let oM = new Uint8Array(10000);
let oI = new Uint32Array(60000);
let fP = new Float32Array(6000);

export interface MeshCtx {
  /** densidade/material de um ponto inteiro do mundo (fora da seção) */
  sample: (wx: number, wy: number, wz: number, out: { d: number; m: number }) => void;
  /** cor de grama do pedaço (vértice local) */
  grass: (c: Chunk, lx: number, lz: number, out: [number, number, number]) => void;
  /** o vizinho +x / +z não é volume: esta seção fecha a costura da borda */
  ownX: boolean;
  ownZ: boolean;
}

const _g: [number, number, number] = [0, 0, 0];
const _sp = { d: 0, m: 0 };

/** monta posições/normais/cores/índices da seção; devolve contagens */
export function meshSection(v: VolChunk, S: Section, ctx: MeshCtx): { nv: number; ni: number; nf: number } {
  const c = v.c;
  const y0 = BED_Y + S.s * SEC;
  const x0 = c.x0;
  const z0 = c.z0;
  // 1) amostras com borda
  for (let z = -1; z < PX - 1; z++)
    for (let y = -1; y < PY - 1; y++)
      for (let x = -1; x < PX - 1; x++) {
        const p = pi(x, y, z);
        if (x >= 0 && x < SX && y >= 0 && y < SY && z >= 0 && z < SX) {
          const i = sidx(x, y, z);
          pD[p] = S.d[i] / Q;
          pM[p] = S.m[i];
        } else {
          ctx.sample(x0 + x, y0 + y, z0 + z, _sp);
          pD[p] = _sp.d;
          pM[p] = _sp.m;
        }
      }
  // 2) um vértice por célula cruzada
  let nv = 0;
  let ni = 0;
  for (let z = -1; z < CX - 1; z++)
    for (let y = -1; y < CY - 1; y++)
      for (let x = -1; x < CX - 1; x++) {
        const ci = x + 1 + (y + 1) * CX + (z + 1) * CX * CY;
        const p0 = pi(x, y, z);
        let mask = 0;
        for (let k = 0; k < 8; k++) if (pD[p0 + COFF[k]] > 0) mask |= 1 << k;
        if (mask === 0 || mask === 255) {
          cellV[ci] = -1;
          continue;
        }
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let n = 0;
        for (let e = 0; e < 12; e++) {
          const a = EDGES[e][0];
          const b = EDGES[e][1];
          const da = pD[p0 + COFF[a]];
          const db = pD[p0 + COFF[b]];
          if (da > 0 === db > 0) continue;
          const t = da / (da - db);
          const A = CORN[a];
          const B = CORN[b];
          sx += A[0] + (B[0] - A[0]) * t;
          sy += A[1] + (B[1] - A[1]) * t;
          sz += A[2] + (B[2] - A[2]) * t;
          n++;
        }
        if (nv * 3 + 3 > oP.length) {
          const g = (a: Float32Array) => {
            const b = new Float32Array(a.length * 2);
            b.set(a);
            return b;
          };
          oP = g(oP);
          oN = g(oN);
          oC = g(oC);
          const m2 = new Uint8Array(oM.length * 2);
          m2.set(oM);
          oM = m2;
        }
        const o = nv * 3;
        const vx = x + sx / n;
        const vy = y + sy / n;
        const vz = z + sz / n;
        oP[o] = x0 + vx;
        oP[o + 1] = y0 + vy;
        oP[o + 2] = z0 + vz;
        // normal = -gradiente
        const d0 = pD[p0];
        const d1 = pD[p0 + COFF[1]];
        const d2 = pD[p0 + COFF[2]];
        const d3 = pD[p0 + COFF[3]];
        const d4 = pD[p0 + COFF[4]];
        const d5 = pD[p0 + COFF[5]];
        const d6 = pD[p0 + COFF[6]];
        const d7 = pD[p0 + COFF[7]];
        let gx = d1 - d0 + d3 - d2 + d5 - d4 + d7 - d6;
        let gy = d2 - d0 + d3 - d1 + d6 - d4 + d7 - d5;
        let gz = d4 - d0 + d5 - d1 + d6 - d2 + d7 - d3;
        const gl = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
        gx = -gx / gl;
        gy = -gy / gl;
        gz = -gz / gl;
        oN[o] = gx;
        oN[o + 1] = gy;
        oN[o + 2] = gz;
        // cor: material do canto mais "sólido"
        let best = -1e9;
        let bm = 0;
        for (let k = 0; k < 8; k++) {
          const dd = pD[p0 + COFF[k]];
          if (dd > best && pM[p0 + COFF[k]]) {
            best = dd;
            bm = pM[p0 + COFF[k]];
          }
        }
        let r: number;
        let g: number;
        let b: number;
        const mi = MATS[bm];
        if (bm === M.Topo || (bm === M.Neve && gy < 0.5)) {
          const lx = Math.max(0, Math.min(RES, Math.round(vx)));
          const lz = Math.max(0, Math.min(RES, Math.round(vz)));
          ctx.grass(c, lx, lz, _g);
          r = _g[0];
          g = _g[1];
          b = _g[2];
          if (gy < 0.62) {
            const k = Math.min(1, (0.62 - gy) * 3);
            const t = MATS[M.Terra].col;
            r += (t[0] - r) * k;
            g += (t[1] - g) * k;
            b += (t[2] - b) * k;
          }
        } else if (mi) {
          r = mi.col[0];
          g = mi.col[1];
          b = mi.col[2];
          // estrias de camadas
          const st = 0.9 + ((Math.floor(y0 + vy) * 7) & 3) * 0.04;
          r *= st;
          g *= st;
          b *= st;
        } else {
          r = g = b = 0.5;
        }
        // cavernas mais escuras quanto mais fundo (sem luz real)

        if (bm >= M.Carvao && bm <= M.Gema && bm !== M.Carvao) {
          // minério: pintinhas que brilham (alguns vértices bem claros)
          const h = hash3(x0 + x, y0 + y, z0 + z, 77);
          const k = h > 0.72 ? 1.9 : 1.15 + h * 0.3;
          r = Math.min(1, r * k);
          g = Math.min(1, g * k);
          b = Math.min(1, b * k);
        } else if (bm === M.Funda) {
          const k = 0.92;
          r *= k;
          g *= k;
          b *= k;
        }
        oC[o] = r;
        oC[o + 1] = g;
        oC[o + 2] = b;
        oM[nv] = bm;
        cellV[ci] = nv++;
      }
  // 3) quads nas arestas cruzadas (só as desta seção)
  const quad = (a: number, b: number, cc: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || cc < 0 || d < 0) return;
    if (ni + 6 > oI.length) {
      const nI = new Uint32Array(oI.length * 2);
      nI.set(oI);
      oI = nI;
    }
    if (flip) oI.set([a, cc, b, a, d, cc], ni);
    else oI.set([a, b, cc, a, cc, d], ni);
    ni += 6;
  };
  const cv = (x: number, y: number, z: number) => cellV[x + 1 + (y + 1) * CX + (z + 1) * CX * CY];
  const zM = ctx.ownZ ? SX : SX - 1;
  const xM = ctx.ownX ? SX : SX - 1;
  for (let z = 0; z < zM; z++)
    for (let y = 0; y < SY - 1; y++)
      for (let x = 0; x < xM; x++) {
        const p = pi(x, y, z);
        const s0 = pD[p] > 0;
        // aresta X
        if (x < SX - 1 && s0 !== pD[p + 1] > 0) quad(cv(x, y - 1, z - 1), cv(x, y, z - 1), cv(x, y, z), cv(x, y - 1, z), !s0);
        // aresta Y
        if (s0 !== pD[p + PX] > 0) quad(cv(x - 1, y, z - 1), cv(x - 1, y, z), cv(x, y, z), cv(x, y, z - 1), !s0);
        // aresta Z
        if (z < SX - 1 && s0 !== pD[p + PX * PY] > 0) quad(cv(x - 1, y - 1, z), cv(x, y - 1, z), cv(x, y, z), cv(x - 1, y, z), !s0);
      }
  // 4) superfícies de líquido (água de aquífero / lava)
  let nf = 0;
  for (let z = 0; z < SX - 1; z++)
    for (let y = 0; y < SY - 1; y++)
      for (let x = 0; x < SX - 1; x++) {
        const p = pi(x, y, z);
        const m = pM[p];
        if ((m !== M.Agua && m !== M.Lava) || pD[p] > 0) continue;
        const up = pM[p + PX];
        if (up === m || pD[p + PX] > 0) continue;
        if (nf * 3 + 18 > fP.length) {
          const n2 = new Float32Array(fP.length * 2);
          n2.set(fP);
          fP = n2;
        }
        const wx = x0 + x;
        const wz = z0 + z;
        const yy = y0 + y + 0.4;
        const L = m === M.Lava ? 1 : 0;
        fP.set([wx - 0.5, yy, wz - 0.5, wx - 0.5, yy, wz + 0.5, wx + 0.5, yy, wz - 0.5, wx + 0.5, yy, wz - 0.5, wx - 0.5, yy, wz + 0.5, wx + 0.5, yy, wz + 0.5], nf * 3);
        // marca lava no y (sinal) — separado depois
        if (L) for (let k = 0; k < 6; k++) fP[nf * 3 + k * 3 + 1] += 1000;
        nf += 6;
      }
  return { nv, ni, nf };
}

/** copia a saída do mesher para geometrias novas */
/**
 * Versão "rocha lapidada" para o subsolo: triângulos soltos com cor por face
 * (média dos cantos ± um tom por face) e normal da face. Sem degradê borrado:
 * paredes, chão e veios de minério ficam nítidos (veio = face com canto de minério).
 */
export function takeFacetMesh(nv: number, ni: number): THREE.BufferGeometry {
  const pos = new Float32Array(ni * 3);
  const nor = new Float32Array(ni * 3);
  const col = new Float32Array(ni * 3);
  for (let t = 0; t < ni; t += 3) {
    const a = oI[t];
    const b = oI[t + 1];
    const c = oI[t + 2];
    const ax = oP[a * 3], ay = oP[a * 3 + 1], az = oP[a * 3 + 2];
    const bx = oP[b * 3], by = oP[b * 3 + 1], bz = oP[b * 3 + 2];
    const cx = oP[c * 3], cy = oP[c * 3 + 1], cz = oP[c * 3 + 2];
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    // minério ganha a face inteira (veio nítido)
    let ore = -1;
    for (const v of [a, b, c]) if (oM[v] >= M.Cobre && oM[v] <= M.Gema) ore = v;
    let r: number, g: number, bl: number;
    const h = hash3(Math.floor(ax * 3), Math.floor(ay * 3), Math.floor(az * 3), 5);
    if (ore >= 0) {
      const mi = MATS[oM[ore]];
      const k = h > 0.6 ? 1.35 : 1.1;
      r = Math.min(1, mi.col[0] * k);
      g = Math.min(1, mi.col[1] * k);
      bl = Math.min(1, mi.col[2] * k);
    } else {
      const k = 0.86 + h * 0.22;
      r = ((oC[a * 3] + oC[b * 3] + oC[c * 3]) / 3) * k;
      g = ((oC[a * 3 + 1] + oC[b * 3 + 1] + oC[c * 3 + 1]) / 3) * k;
      bl = ((oC[a * 3 + 2] + oC[b * 3 + 2] + oC[c * 3 + 2]) / 3) * k;
    }
    const o = t * 3;
    pos.set([ax, ay, az, bx, by, bz, cx, cy, cz], o);
    for (let k = 0; k < 3; k++) {
      nor[o + k * 3] = nx;
      nor[o + k * 3 + 1] = ny;
      nor[o + k * 3 + 2] = nz;
      col[o + k * 3] = r;
      col[o + k * 3 + 1] = g;
      col[o + k * 3 + 2] = bl;
    }
  }
  void nv;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  return geo;
}

export function takeMesh(nv: number, ni: number): { g: THREE.BufferGeometry; pos: Float32Array; idx: Uint32Array } {
  const g = new THREE.BufferGeometry();
  const pos = oP.slice(0, nv * 3);
  const idx = oI.slice(0, ni);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(oN.slice(0, nv * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(oC.slice(0, nv * 3), 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return { g, pos, idx };
}
export function takeFluid(nf: number, lava: boolean): THREE.BufferGeometry | null {
  const out: number[] = [];
  for (let i = 0; i < nf; i += 6) {
    const isL = fP[i * 3 + 1] > 500;
    if (isL !== lava) continue;
    for (let k = 0; k < 6; k++) out.push(fP[(i + k) * 3], fP[(i + k) * 3 + 1] - (isL ? 1000 : 0), fP[(i + k) * 3 + 2]);
  }
  if (!out.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  const n = new Float32Array(out.length);
  for (let i = 1; i < n.length; i += 3) n[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  g.computeBoundingSphere();
  return g;
}

export { SX, SY, SN, Q, sidx };
