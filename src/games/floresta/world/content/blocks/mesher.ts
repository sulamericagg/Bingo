/* ============================================================
 *  BLOCOS — malha de um pedaço (puro: roda no main thread ou no Worker).
 *
 *  Entrada: blocos do pedaço + borda (PAD) dos vizinhos, já copiados.
 *  Saída: até 3 grupos (opaco / recorte / vidro) → 1 draw call cada.
 *
 *  - Duros: faces só onde o vizinho não cobre; quinas convexas chanfradas
 *    (largura varia um pouco por bloco = leve irregularidade, sem rachaduras
 *    porque o chanfro é só do próprio bloco); faces sem chanfro viram quads
 *    "gulosos" (greedy) por fatia; AO por vértice; vizinho igual = sem emenda.
 *  - Macios: surface nets em 2× (amostras a cada 0,5 m) sobre a ocupação dos
 *    blocos + densidade do terreno natural; relaxamento (Laplace) arredonda
 *    degraus e quinas; uma "saia" fina sobre o terreno faz a emenda orgânica.
 *  - Plantas: dois planos cruzados (UV explícito). Formas: caixas (shapes.ts).
 *
 *  Atributos: position f32×3 · normal i8×3 · color u8×3 (cor×AO, linear)
 *             buv f32×2 (só plantas) · bmat u16×2 = (ladrilho, flags)
 *  flags: bits 0..4 = emissão 0..31 · 32 = ladrilho de detalhe (×2) · 64 = macio
 *         (sem variação por bloco) · 128 = usa buv (senão projeção planar pela normal)
 * ============================================================ */
import { BLOCKS, TILE_DETAIL } from './registry';
import { Group, Render } from './types';
import { BoxTile, CON_NX, CON_NZ, CON_PX, CON_PZ, rotXZ, shapeBoxes, shapeConnects } from './shapes';

/** lado do pedaço em blocos */
export const CS = 16;
/** borda copiada dos vizinhos */
export const PAD = 2;
/** lado do volume copiado */
export const P = CS + 2 * PAD;
export const P3 = P * P * P;
/** amostras do campo macio por lado (2× por bloco) */
const NS = P * 2;
const NS3 = NS * NS * NS;
const NC = NS - 1;

export interface MeshOpts {
  /** chanfros nas quinas dos blocos duros */
  bevel: boolean;
  /** iterações de relaxamento dos macios (0 = facetado) */
  smooth: number;
  /** oclusão de ambiente por vértice */
  ao: boolean;
  /** juntar faces iguais em quads grandes */
  greedy: boolean;
  /** saia fina dos macios por cima do terreno do motor (emenda colorida; padrão desligada) */
  skirt?: boolean;
}

export interface MeshJob {
  /** blocos (num) do volume P³ (x + P*(y + P*z)), já com a borda dos vizinhos */
  ids: Uint16Array;
  /** meta por célula (bits 0..1 = rotação) */
  meta: Uint8Array;
  /** densidade do terreno natural nas amostras NS³ (≥ 0 sólido), ou null */
  terr: Float32Array | null;
  /** bloco do terreno por célula P³ (cor da emenda), ou null */
  terrId: Uint16Array | null;
  /** canto mínimo do pedaço em coordenadas de bloco do mundo */
  ox: number;
  oy: number;
  oz: number;
  opt: MeshOpts;
}

export interface GroupMesh {
  pos: Float32Array;
  nrm: Int8Array;
  col: Uint8Array;
  uv: Float32Array;
  mat: Uint16Array;
  idx: Uint32Array | Uint16Array;
}

export interface MeshResult {
  groups: (GroupMesh | null)[];
  tris: number;
  /** blocos que emitem luz: x,y,z (mundo, centro) , num … */
  lights: number[];
  ms: number;
}

/* ------------------------------ tabelas do catálogo ------------------------------ */
const N = BLOCKS.length;
const R = new Uint8Array(N);
const GRP = new Uint8Array(N);
/** cobre a face do vizinho inteira */
const OCC = new Uint8Array(N);
const EMIT = new Uint8Array(N);
const BEV = new Float32Array(N);
for (const b of BLOCKS) {
  R[b.num] = b.render;
  GRP[b.num] = b.group;
  OCC[b.num] = b.occludes || b.shape === 'cube' ? 1 : 0;
  EMIT[b.num] = Math.min(31, Math.round((b.light / 15) * 24));
  BEV[b.num] = b.bevel;
}
const SOFT = Render.Soft;
const HARD = Render.Hard;

const AOF = [0.5, 0.68, 0.84, 1];

/* ------------------------------ buffer que cresce ------------------------------ */
class Buf {
  n = 0;
  ni = 0;
  pos = new Float32Array(3 * 1024);
  nrm = new Int8Array(3 * 1024);
  col = new Uint8Array(3 * 1024);
  uv = new Float32Array(2 * 1024);
  mat = new Uint16Array(2 * 1024);
  idx = new Uint32Array(1536);
  private grow(): void {
    const c = this.pos.length / 3;
    const g = <T extends Float32Array | Int8Array | Uint8Array | Uint16Array>(a: T, k: number): T => {
      const b = new (a.constructor as { new (n: number): T })(c * 2 * k);
      b.set(a);
      return b;
    };
    this.pos = g(this.pos, 3);
    this.nrm = g(this.nrm, 3);
    this.col = g(this.col, 3);
    this.uv = g(this.uv, 2);
    this.mat = g(this.mat, 2);
  }
  v(x: number, y: number, z: number, nx: number, ny: number, nz: number, r: number, g: number, b: number, tile: number, flags: number, u = 0, w = 0): number {
    if (this.n * 3 >= this.pos.length) this.grow();
    const i = this.n++;
    const o = i * 3;
    this.pos[o] = x;
    this.pos[o + 1] = y;
    this.pos[o + 2] = z;
    this.nrm[o] = Math.round(nx * 127);
    this.nrm[o + 1] = Math.round(ny * 127);
    this.nrm[o + 2] = Math.round(nz * 127);
    this.col[o] = r >= 1 ? 255 : r <= 0 ? 0 : (r * 255 + 0.5) | 0;
    this.col[o + 1] = g >= 1 ? 255 : g <= 0 ? 0 : (g * 255 + 0.5) | 0;
    this.col[o + 2] = b >= 1 ? 255 : b <= 0 ? 0 : (b * 255 + 0.5) | 0;
    this.uv[i * 2] = u;
    this.uv[i * 2 + 1] = w;
    this.mat[i * 2] = tile;
    this.mat[i * 2 + 1] = flags | (TILE_DETAIL[tile] ? 32 : 0);
    return i;
  }
  tri(a: number, b: number, c: number): void {
    if (this.ni + 3 > this.idx.length) {
      const n = new Uint32Array(this.idx.length * 2);
      n.set(this.idx);
      this.idx = n;
    }
    this.idx[this.ni++] = a;
    this.idx[this.ni++] = b;
    this.idx[this.ni++] = c;
  }
  quad(a: number, b: number, c: number, d: number, flip = false): void {
    if (flip) {
      this.tri(a, b, d);
      this.tri(b, c, d);
    } else {
      this.tri(a, b, c);
      this.tri(a, c, d);
    }
  }
  out(): GroupMesh | null {
    if (!this.ni) return null;
    const n = this.n;
    const idx = n < 65536 ? Uint16Array.from(this.idx.subarray(0, this.ni)) : this.idx.slice(0, this.ni);
    return { pos: this.pos.slice(0, n * 3), nrm: this.nrm.slice(0, n * 3), col: this.col.slice(0, n * 3), uv: this.uv.slice(0, n * 2), mat: this.mat.slice(0, n * 2), idx };
  }
}

/** hash 0..1 de inteiros */
function h3(x: number, y: number, z: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const I = (x: number, y: number, z: number) => x + P * (y + P * z);
/** passos no índice P³ por eixo */
const STEP = [1, P, P * P];

/* ============================================================ */
export function meshChunk(job: MeshJob): MeshResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const { ids } = job;
  const bufs = [new Buf(), new Buf(), new Buf()];

  // sólido para AO (blocos opacos + terreno)
  const solid = new Uint8Array(P3);
  let hasSoft = false;
  let any = false;
  for (let i = 0; i < P3; i++) {
    const n = ids[i];
    if (n) any = true;
    if (OCC[n] || R[n] === SOFT) solid[i] = 1;
  }
  if (job.terr) {
    const T = job.terr;
    for (let z = 0; z < P; z++)
      for (let y = 0; y < P; y++)
        for (let x = 0; x < P; x++) {
          const s = 2 * x + NS * (2 * y + NS * 2 * z);
          // centro da célula ≈ média das 8 amostras
          const d = T[s] + T[s + 1] + T[s + NS] + T[s + NS + 1] + T[s + NS * NS] + T[s + NS * NS + 1] + T[s + NS * NS + NS] + T[s + NS * NS + NS + 1];
          if (d > 0) solid[I(x, y, z)] = 1;
        }
  }
  const lights: number[] = [];
  if (any) {
    for (let z = PAD - 1; z <= PAD + CS && !hasSoft; z++)
      for (let y = PAD - 1; y <= PAD + CS && !hasSoft; y++)
        for (let x = PAD - 1; x <= PAD + CS; x++)
          if (R[ids[I(x, y, z)]] === SOFT) {
            hasSoft = true;
            break;
          }
    hardPass(job, solid, bufs, lights);
    if (hasSoft) softPass(job, solid, bufs[Group.Opaque]);
    smallPass(job, bufs);
  }
  let tris = 0;
  const groups = bufs.map((b) => {
    tris += b.ni / 3;
    return b.out();
  });
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return { groups, tris, lights, ms: t1 - t0 };
}

/* ------------------------------ duros ------------------------------ */
/** um macio "fundo" (todo cercado) esconde a face do duro vizinho */
function softDeep(ids: Uint16Array, solid: Uint8Array, i: number): boolean {
  return solid[i + 1] === 1 && solid[i - 1] === 1 && solid[i + P] === 1 && solid[i - P] === 1 && solid[i + P * P] === 1 && solid[i - P * P] === 1 && ids[i] !== 0;
}

function faceVisible(ids: Uint16Array, solid: Uint8Array, n: number, j: number): boolean {
  const m = ids[j];
  if (!m) return true;
  const r = R[m];
  if (r === HARD) {
    if (OCC[m]) return false;
    return m !== n; // vidro/folha iguais se fundem
  }
  if (r === SOFT) return !softDeep(ids, solid, j);
  return !OCC[m];
}

function hardPass(job: MeshJob, solid: Uint8Array, bufs: Buf[], lights: number[]): void {
  const { ids, opt } = job;
  // máscara de faces sem chanfro (para o greedy): por face 6 × CS³ → chave
  const GM = new Int32Array(6 * CS * CS * CS);
  const vis = [false, false, false, false, false, false];
  const aoC = new Float32Array(24); // [face][corner 0..3]
  const bevelOn = opt.bevel;
  for (let lz = 0; lz < CS; lz++)
    for (let ly = 0; ly < CS; ly++)
      for (let lx = 0; lx < CS; lx++) {
        const i = I(lx + PAD, ly + PAD, lz + PAD);
        const n = ids[i];
        if (!n) continue;
        if (EMIT[n]) lights.push(job.ox + lx + 0.5, job.oy + ly + 0.5, job.oz + lz + 0.5, n);
        if (R[n] !== HARD) continue;
        let nv = 0;
        for (let f = 0; f < 6; f++) {
          const a = f >> 1;
          const s = f & 1 ? -1 : 1;
          vis[f] = faceVisible(ids, solid, n, i + s * STEP[a]);
          if (vis[f]) nv++;
        }
        if (!nv) continue;
        const bev = bevelOn && BEV[n] > 0;
        // AO por canto de cada face visível
        for (let f = 0; f < 6; f++) {
          if (!vis[f]) continue;
          const a = f >> 1;
          const s = f & 1 ? -1 : 1;
          const u = (a + 1) % 3;
          const v = (a + 2) % 3;
          const base = i + s * STEP[a];
          for (let c = 0; c < 4; c++) {
            if (!opt.ao) {
              aoC[f * 4 + c] = 1;
              continue;
            }
            const du = c === 1 || c === 2 ? 1 : -1;
            const dv = c >= 2 ? 1 : -1;
            const s1 = solid[base + du * STEP[u]];
            const s2 = solid[base + dv * STEP[v]];
            const cc = solid[base + du * STEP[u] + dv * STEP[v]];
            aoC[f * 4 + c] = s1 && s2 ? 0 : 3 - (s1 + s2 + cc);
          }
        }
        // quinas chanfradas?
        let anyBev = false;
        if (bev)
          for (let f = 0; f < 6 && !anyBev; f++)
            if (vis[f]) for (let g = 0; g < 6; g++) if (vis[g] && g >> 1 !== f >> 1) anyBev = true;
        if (anyBev) {
          emitBevelled(job, lx, ly, lz, n, vis, aoC, bufs[GRP[n]]);
          continue;
        }
        for (let f = 0; f < 6; f++) {
          if (!vis[f]) continue;
          if (opt.greedy) {
            const k = aoC[f * 4] | (aoC[f * 4 + 1] << 2) | (aoC[f * 4 + 2] << 4) | (aoC[f * 4 + 3] << 6);
            GM[f * CS * CS * CS + lx + CS * (ly + CS * lz)] = (n | (k << 16)) + 1;
          } else emitFace(job, lx, ly, lz, f, 1, 1, n, aoC, f * 4, bufs[GRP[n]]);
        }
      }
  if (opt.greedy) greedy(job, GM, bufs);
}

const NRM = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

function faceCol(n: number, f: number): [number, number, number] {
  const b = BLOCKS[n];
  return f === 2 ? b.colTop : b.colSide;
}
function faceTile(n: number, f: number): number {
  const t = BLOCKS[n].tiles;
  return f === 2 ? t.top : f === 3 ? t.bottom : t.side;
}

/** face plana (w×h células nas direções u,v), aoArr[ao0..ao3] em níveis 0..3 */
function emitFace(job: MeshJob, lx: number, ly: number, lz: number, f: number, w: number, h: number, n: number, aoArr: ArrayLike<number>, ao0: number, B: Buf): void {
  void job;
  const a = f >> 1;
  const s = f & 1 ? -1 : 1;
  const u = (a + 1) % 3;
  const v = (a + 2) % 3;
  const p = [lx, ly, lz];
  p[a] += s > 0 ? 1 : 0;
  const nn = NRM[f];
  const col = faceCol(n, f);
  const tile = faceTile(n, f);
  const fl = EMIT[n];
  const ix: number[] = [];
  for (let c = 0; c < 4; c++) {
    const q = [p[0], p[1], p[2]];
    if (c === 1 || c === 2) q[u] += w;
    if (c >= 2) q[v] += h;
    const k = AOF[aoArr[ao0 + c]];
    ix.push(B.v(q[0], q[1], q[2], nn[0], nn[1], nn[2], col[0] * k, col[1] * k, col[2] * k, tile, fl));
  }
  const flip = aoArr[ao0] + aoArr[ao0 + 2] < aoArr[ao0 + 1] + aoArr[ao0 + 3];
  if (s > 0) B.quad(ix[0], ix[1], ix[2], ix[3], flip);
  else B.quad(ix[0], ix[3], ix[2], ix[1], flip);
}

function greedy(job: MeshJob, GM: Int32Array, bufs: Buf[]): void {
  const C3 = CS * CS * CS;
  const mask = new Int32Array(CS * CS);
  const ao = new Float32Array(4);
  for (let f = 0; f < 6; f++) {
    const a = f >> 1;
    const u = (a + 1) % 3;
    const v = (a + 2) % 3;
    for (let d = 0; d < CS; d++) {
      // fatia d no eixo a: máscara (iu, iv)
      let cnt = 0;
      for (let iv = 0; iv < CS; iv++)
        for (let iu = 0; iu < CS; iu++) {
          const p = [0, 0, 0];
          p[a] = d;
          p[u] = iu;
          p[v] = iv;
          const k = GM[f * C3 + p[0] + CS * (p[1] + CS * p[2])];
          mask[iu + CS * iv] = k;
          if (k) cnt++;
        }
      if (!cnt) continue;
      for (let iv = 0; iv < CS; iv++)
        for (let iu = 0; iu < CS; ) {
          const k = mask[iu + CS * iv];
          if (!k) {
            iu++;
            continue;
          }
          const aok = (k - 1) >>> 16;
          const uniform = (aok & 3) === ((aok >> 2) & 3) && (aok & 3) === ((aok >> 4) & 3) && (aok & 3) === ((aok >> 6) & 3);
          let w = 1;
          let h = 1;
          if (uniform) {
            while (iu + w < CS && mask[iu + w + CS * iv] === k) w++;
            outer: while (iv + h < CS) {
              for (let x = 0; x < w; x++) if (mask[iu + x + CS * (iv + h)] !== k) break outer;
              h++;
            }
          }
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) mask[iu + x + CS * (iv + y)] = 0;
          const n = (k - 1) & 0xffff;
          ao[0] = aok & 3;
          ao[1] = (aok >> 2) & 3;
          ao[2] = (aok >> 4) & 3;
          ao[3] = (aok >> 6) & 3;
          const p = [0, 0, 0];
          p[a] = d;
          p[u] = iu;
          p[v] = iv;
          emitFace(job, p[0], p[1], p[2], f, w, h, n, ao, 0, bufs[GRP[n]]);
          iu += w;
        }
    }
  }
}

/** bloco duro com quinas convexas chanfradas */
function emitBevelled(job: MeshJob, lx: number, ly: number, lz: number, n: number, vis: boolean[], aoC: Float32Array, B: Buf): void {
  const b = BEV[n] * (0.7 + 0.6 * h3(job.ox + lx, job.oy + ly, job.oz + lz));
  const fl = EMIT[n];
  const base = [lx, ly, lz];
  /** posição do canto (du,dv ∈ {0,1}) da face f, recuada nas arestas chanfradas */
  const cp = (f: number, du: number, dv: number): number[] => {
    const a = f >> 1;
    const s = f & 1 ? -1 : 1;
    const u = (a + 1) % 3;
    const v = (a + 2) % 3;
    const q = [0, 0, 0];
    q[a] = s > 0 ? 1 : 0;
    q[u] = du ? (vis[u * 2] ? 1 - b : 1) : vis[u * 2 + 1] ? b : 0;
    q[v] = dv ? (vis[v * 2] ? 1 - b : 1) : vis[v * 2 + 1] ? b : 0;
    return q;
  };
  const cornerOf = (du: number, dv: number) => (dv ? (du ? 2 : 3) : du ? 1 : 0);
  const vtx = (q: number[], nx: number, ny: number, nz: number, col: number[], k: number, tile: number) =>
    B.v(base[0] + q[0], base[1] + q[1], base[2] + q[2], nx, ny, nz, col[0] * k, col[1] * k, col[2] * k, tile, fl);
  // faces recuadas
  for (let f = 0; f < 6; f++) {
    if (!vis[f]) continue;
    const s = f & 1 ? -1 : 1;
    const nn = NRM[f];
    const col = faceCol(n, f);
    const tile = faceTile(n, f);
    const ix: number[] = [];
    for (let c = 0; c < 4; c++) {
      const du = c === 1 || c === 2 ? 1 : 0;
      const dv = c >= 2 ? 1 : 0;
      ix.push(vtx(cp(f, du, dv), nn[0], nn[1], nn[2], col, AOF[aoC[f * 4 + c]], tile));
    }
    if (s > 0) B.quad(ix[0], ix[1], ix[2], ix[3]);
    else B.quad(ix[0], ix[3], ix[2], ix[1]);
  }
  // tiras de chanfro nas arestas entre duas faces visíveis
  const side = BLOCKS[n].colSide;
  const tileS = BLOCKS[n].tiles.side;
  for (let f1 = 0; f1 < 6; f1++) {
    if (!vis[f1]) continue;
    for (let f2 = f1 + 1; f2 < 6; f2++) {
      if (!vis[f2] || f1 >> 1 === f2 >> 1) continue;
      const a1 = f1 >> 1;
      const a2 = f2 >> 1;
      const a3 = 3 - a1 - a2;
      const n1 = NRM[f1];
      const n2 = NRM[f2];
      let nx = n1[0] + n2[0];
      let ny = n1[1] + n2[1];
      let nz = n1[2] + n2[2];
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const pts: number[][] = [];
      const ks: number[] = [];
      for (const [ff, d3] of [
        [f1, 0],
        [f1, 1],
        [f2, 1],
        [f2, 0],
      ]) {
        // canto da face ff na ponta d3 da aresta: coordenadas u,v da face ff
        const a = ff >> 1;
        const u = (a + 1) % 3;
        const other = ff === f1 ? f2 : f1;
        const oa = other >> 1;
        const os = other & 1 ? 0 : 1; // lado da outra face (1 = +)
        let du: number;
        let dv: number;
        if (u === oa) {
          du = os;
          dv = d3;
        } else {
          du = d3;
          dv = os;
        }
        void a3;
        pts.push(cp(ff, du, dv));
        ks.push(AOF[aoC[ff * 4 + cornerOf(du, dv)]]);
      }
      const col = f1 === 2 || f2 === 2 ? BLOCKS[n].colTop : side;
      const ix = pts.map((q, k) => vtx(q, nx, ny, nz, col, ks[k], tileS));
      orientQuad(B, ix, pts, nx, ny, nz);
    }
  }
  // triângulos dos cantos com 3 faces visíveis
  for (let c = 0; c < 8; c++) {
    const fx = c & 1 ? 0 : 1;
    const fy = c & 2 ? 2 : 3;
    const fz = c & 4 ? 4 : 5;
    if (!vis[fx] || !vis[fy] || !vis[fz]) continue;
    const sx = c & 1 ? 1 : 0;
    const sy = c & 2 ? 1 : 0;
    const sz = c & 4 ? 1 : 0;
    // face X: u=y, v=z ; face Y: u=z, v=x ; face Z: u=x, v=y
    const q1 = cp(fx, sy, sz);
    const q2 = cp(fy, sz, sx);
    const q3 = cp(fz, sx, sy);
    let nx = c & 1 ? 1 : -1;
    let ny = c & 2 ? 1 : -1;
    let nz = c & 4 ? 1 : -1;
    const k = 1 / Math.sqrt(3);
    nx *= k;
    ny *= k;
    nz *= k;
    const col = sy ? BLOCKS[n].colTop : side;
    const ix = [vtx(q1, nx, ny, nz, col, AOF[aoC[fx * 4 + cornerOf(sy, sz)]], tileS), vtx(q2, nx, ny, nz, col, AOF[aoC[fy * 4 + cornerOf(sz, sx)]], tileS), vtx(q3, nx, ny, nz, col, AOF[aoC[fz * 4 + cornerOf(sx, sy)]], tileS)];
    const e1 = [q2[0] - q1[0], q2[1] - q1[1], q2[2] - q1[2]];
    const e2 = [q3[0] - q1[0], q3[1] - q1[1], q3[2] - q1[2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1];
    const cy = e1[2] * e2[0] - e1[0] * e2[2];
    const cz = e1[0] * e2[1] - e1[1] * e2[0];
    if (cx * nx + cy * ny + cz * nz >= 0) B.tri(ix[0], ix[1], ix[2]);
    else B.tri(ix[0], ix[2], ix[1]);
  }
}

function orientQuad(B: Buf, ix: number[], p: number[][], nx: number, ny: number, nz: number): void {
  const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
  const e2 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
  const cx = e1[1] * e2[2] - e1[2] * e2[1];
  const cy = e1[2] * e2[0] - e1[0] * e2[2];
  const cz = e1[0] * e2[1] - e1[1] * e2[0];
  if (cx * nx + cy * ny + cz * nz >= 0) B.quad(ix[0], ix[1], ix[2], ix[3]);
  else B.quad(ix[0], ix[3], ix[2], ix[1]);
}

/* ------------------------------ macios (surface nets 2×) ------------------------------ */
const T_AIR = 0;
const T_SOFT = 1;
const T_HARD = 2;
const T_TERR = 3;
const GRAMA = BLOCKS.find((b) => b.id === 'grama')?.num ?? 1;

/** cantos de uma célula (bit0 x, bit1 y, bit2 z) e as 12 arestas (k0 → k1, eixo, ponto inicial) */
const S1 = NS;
const S2 = NS * NS;
const OFF8 = [0, 1, S1, S1 + 1, S2, S2 + 1, S2 + S1, S2 + S1 + 1];
const EDGES: number[] = []; // k0, k1, ax, c0x, c0y, c0z
for (let e = 0; e < 12; e++) {
  const ax = e >> 2;
  const c0 = [0, 0, 0];
  c0[(ax + 1) % 3] = e & 1;
  c0[(ax + 2) % 3] = (e >> 1) & 1;
  const k0 = c0[0] | (c0[1] << 1) | (c0[2] << 2);
  EDGES.push(k0, k0 | (1 << ax), ax, c0[0], c0[1], c0[2]);
}
/** por eixo da aresta: deslocamentos (no índice de célula NC³) das 4 células em volta, em ordem anti-horária */
const NC1 = NC;
const NC2 = NC * NC;
const CSTEP = [1, NC1, NC2];
const QCELLS: number[][] = [0, 1, 2].map((a) => {
  const u = CSTEP[(a + 1) % 3];
  const v = CSTEP[(a + 2) % 3];
  return [-u - v, -v, 0, -u];
});

function softPass(job: MeshJob, solid: Uint8Array, B: Buf): void {
  void solid;
  const { ids, terr, opt } = job;
  // caixa dos macios (+2 blocos) — fora dela não há superfície macia
  let bx0 = P;
  let by0 = P;
  let bz0 = P;
  let bx1 = -1;
  let by1 = -1;
  let bz1 = -1;
  for (let z = 0; z < P; z++)
    for (let y = 0; y < P; y++)
      for (let x = 0; x < P; x++)
        if (R[ids[I(x, y, z)]] === SOFT) {
          if (x < bx0) bx0 = x;
          if (x > bx1) bx1 = x;
          if (y < by0) by0 = y;
          if (y > by1) by1 = y;
          if (z < bz0) bz0 = z;
          if (z > bz1) bz1 = z;
        }
  if (bx1 < 0) return;
  // em amostras, com folga de 2 blocos
  const sx0 = Math.max(0, (bx0 - 2) * 2);
  const sy0 = Math.max(0, (by0 - 2) * 2);
  const sz0 = Math.max(0, (bz0 - 2) * 2);
  const sx1 = Math.min(NS - 1, (bx1 + 3) * 2 - 1);
  const sy1 = Math.min(NS - 1, (by1 + 3) * 2 - 1);
  const sz1 = Math.min(NS - 1, (bz1 + 3) * 2 - 1);
  // densidade: ocupação (macio + duro opaco) interpolada trilinearmente dos centros
  // dos blocos para as amostras 2× (separável: x → y → z). Degraus viram rampas
  // arredondadas; amostra dentro de bloco sólido nunca fica "fora" (bloco sozinho
  // vira um torrão redondo, não some).
  const occ = new Float32Array(P3);
  for (let i = 0; i < P3; i++) {
    const n = ids[i];
    if (R[n] === SOFT || OCC[n]) occ[i] = 1;
  }
  const ax = new Float32Array(NS * P * P);
  for (let z = 0; z < P; z++)
    for (let y = 0; y < P; y++)
      for (let x = 0; x < NS; x++) {
        const b = x >> 1;
        const o = x & 1 ? (b + 1 < P ? b + 1 : b) : b > 0 ? b - 1 : b;
        ax[x + NS * (y + P * z)] = occ[I(b, y, z)] * 0.75 + occ[I(o, y, z)] * 0.25;
      }
  const ay = new Float32Array(NS * NS * P);
  for (let z = 0; z < P; z++)
    for (let y = 0; y < NS; y++) {
      const b = y >> 1;
      const o = y & 1 ? (b + 1 < P ? b + 1 : b) : b > 0 ? b - 1 : b;
      for (let x = 0; x < NS; x++) ay[x + NS * (y + NS * z)] = ax[x + NS * (b + P * z)] * 0.75 + ax[x + NS * (o + P * z)] * 0.25;
    }
  const dens = new Float32Array(NS3).fill(-0.5);
  const typ = new Uint8Array(NS3);
  const sid = new Uint16Array(NS3);
  for (let z = sz0; z <= sz1; z++) {
    const bz = z >> 1;
    const oz = z & 1 ? (bz + 1 < P ? bz + 1 : bz) : bz > 0 ? bz - 1 : bz;
    for (let y = sy0; y <= sy1; y++) {
      let s = sx0 + NS * (y + NS * z);
      for (let x = sx0; x <= sx1; x++, s++) {
        const c = I(x >> 1, y >> 1, z >> 1);
        const n = ids[c];
        const r = R[n];
        let d = ay[x + NS * (y + NS * bz)] * 0.75 + ay[x + NS * (y + NS * oz)] * 0.25 - 0.5;
        let t = T_AIR;
        if (r === SOFT) {
          if (d < 0.06) d = 0.06;
          t = T_SOFT;
          sid[s] = n;
        } else if (OCC[n]) {
          if (d < 0.06) d = 0.06;
          t = T_HARD;
        } else if (d >= 0) d = -0.01;
        if (terr && t === T_AIR) {
          const td = terr[s];
          if (td > d) d = td > 0.5 ? 0.5 : td;
          if (d >= 0) {
            t = T_TERR;
            sid[s] = job.terrId ? job.terrId[c] || GRAMA : GRAMA;
          }
        }
        dens[s] = d;
        typ[s] = t;
      }
    }
  }
  // vértices por célula
  const vidx = new Int32Array(NC * NC * NC).fill(-1);
  let cap = 4096;
  let vx = new Float32Array(cap * 3);
  let vf = new Uint8Array(cap); // bits: 1 tem macio · 2 toca duro · 4 toca terreno
  let vm = new Uint16Array(cap);
  let vcell = new Int32Array(cap);
  let nv = 0;
  const cnt = new Uint16Array(BLOCKS.length);
  const cx1 = Math.min(NC - 1, sx1);
  const cy1 = Math.min(NC - 1, sy1);
  const cz1 = Math.min(NC - 1, sz1);
  for (let z = sz0; z <= cz1; z++)
    for (let y = sy0; y <= cy1; y++)
      for (let x = sx0; x <= cx1; x++) {
        const s = x + S1 * (y + S1 * z);
        let mask = 0;
        let fl = 0;
        for (let k = 0; k < 8; k++) {
          const sk = s + OFF8[k];
          if (dens[sk] >= 0) mask |= 1 << k;
          const t = typ[sk];
          if (t === T_SOFT) fl |= 1;
          else if (t === T_HARD) fl |= 2;
          else if (t === T_TERR) fl |= 4;
        }
        if (mask === 0 || mask === 255) continue;
        if (!(fl & 5)) continue; // só duro/ar: o duro cuida
        // média dos cruzamentos nas 12 arestas
        let px = 0;
        let py = 0;
        let pz = 0;
        let ne = 0;
        for (let e = 0; e < 72; e += 6) {
          const k0 = EDGES[e];
          const k1 = EDGES[e + 1];
          if (((mask >> k0) & 1) === ((mask >> k1) & 1)) continue;
          const d0 = dens[s + OFF8[k0]];
          const d1 = dens[s + OFF8[k1]];
          const tt = d0 / (d0 - d1);
          const ax = EDGES[e + 2];
          px += EDGES[e + 3] + (ax === 0 ? tt : 0);
          py += EDGES[e + 4] + (ax === 1 ? tt : 0);
          pz += EDGES[e + 5] + (ax === 2 ? tt : 0);
          ne++;
        }
        if (nv >= cap) {
          cap *= 2;
          const a = new Float32Array(cap * 3);
          a.set(vx);
          vx = a;
          const b = new Uint8Array(cap);
          b.set(vf);
          vf = b;
          const m = new Uint16Array(cap);
          m.set(vm);
          vm = m;
          const cc = new Int32Array(cap);
          cc.set(vcell);
          vcell = cc;
        }
        // amostra k está em (k + 0.5)/2 blocos do canto do volume
        vx[nv * 3] = (x + px / ne + 0.5) * 0.5 - PAD;
        vx[nv * 3 + 1] = (y + py / ne + 0.5) * 0.5 - PAD;
        vx[nv * 3 + 2] = (z + pz / ne + 0.5) * 0.5 - PAD;
        vf[nv] = fl;
        // material: o macio mais frequente; senão o do terreno
        let best = 0;
        let bc = 0;
        for (let k = 0; k < 8; k++) {
          const sk = s + OFF8[k];
          const m = sid[sk];
          if (!m || (typ[sk] !== T_SOFT && fl & 1)) continue;
          const c = ++cnt[m];
          if (c > bc) {
            bc = c;
            best = m;
          }
        }
        for (let k = 0; k < 8; k++) cnt[sid[s + OFF8[k]]] = 0;
        vm[nv] = best || GRAMA;
        vcell[nv] = s;
        vidx[x + NC * (y + NC * z)] = nv++;
      }
  if (!nv) return;
  // quads: arestas com troca de sinal
  const quads: number[] = []; // v0,v1,v2,v3, owned
  const lo = 2 * PAD;
  const hi = 2 * PAD + 2 * CS;
  for (let z = Math.max(1, sz0); z <= Math.min(NC - 1, sz1); z++)
    for (let y = Math.max(1, sy0); y <= Math.min(NC - 1, sy1); y++)
      for (let x = Math.max(1, sx0); x <= Math.min(NC - 1, sx1); x++) {
        const s = x + S1 * (y + S1 * z);
        const in0 = dens[s] >= 0;
        const ci = x + NC * (y + NC * z);
        for (let a = 0; a < 3; a++) {
          const s2 = s + (a === 0 ? 1 : a === 1 ? S1 : S2);
          const in1 = dens[s2] >= 0;
          if (in0 === in1) continue;
          const st = in0 ? typ[s] : typ[s2];
          if (st === T_HARD) continue;
          const qc = QCELLS[a];
          const v0 = vidx[ci + qc[0]];
          const v1 = vidx[ci + qc[1]];
          const v2 = vidx[ci + qc[2]];
          const v3 = vidx[ci + qc[3]];
          if (v0 < 0 || v1 < 0 || v2 < 0 || v3 < 0) continue;
          if (st === T_TERR && (!opt.skirt || !((vf[v0] | vf[v1] | vf[v2] | vf[v3]) & 1))) continue; // terreno: é do motor (saia opcional)
          const owned = x >= lo && x < hi && y >= lo && y < hi && z >= lo && z < hi ? 1 : 0;
          if (in0) quads.push(v0, v1, v2, v3, owned);
          else quads.push(v0, v3, v2, v1, owned);
        }
      }
  const nq = quads.length / 5;
  if (!nq) return;
  // relaxamento (Laplace) — só vértices com macio e sem duro
  if (opt.smooth > 0) {
    const acc = new Float32Array(nv * 3);
    const deg = new Uint16Array(nv);
    const tmp = new Float32Array(nv * 3);
    for (let it = 0; it < opt.smooth * 2; it++) {
      // Taubin: passo que alisa (λ) + passo que devolve volume (μ) — arredonda sem encolher
      const k = it & 1 ? -0.34 : 0.62;
      acc.fill(0);
      deg.fill(0);
      for (let q = 0; q < nq; q++) {
        const o = q * 5;
        for (let k = 0; k < 4; k++) {
          const a = quads[o + k];
          const b = quads[o + ((k + 1) & 3)];
          acc[a * 3] += vx[b * 3];
          acc[a * 3 + 1] += vx[b * 3 + 1];
          acc[a * 3 + 2] += vx[b * 3 + 2];
          acc[b * 3] += vx[a * 3];
          acc[b * 3 + 1] += vx[a * 3 + 1];
          acc[b * 3 + 2] += vx[a * 3 + 2];
          deg[a]++;
          deg[b]++;
        }
      }
      tmp.set(vx.subarray(0, nv * 3));
      for (let i = 0; i < nv; i++) {
        const f = vf[i];
        if (!(f & 1) || f & 2 || !deg[i]) continue;
        const d = deg[i];
        // não deixa escapar da própria célula (evita dobras)
        for (let c = 0; c < 3; c++) {
          const tv = vx[i * 3 + c] + (acc[i * 3 + c] / d - vx[i * 3 + c]) * k;
          tmp[i * 3 + c] = tv;
        }
      }
      vx.set(tmp.subarray(0, nv * 3));
    }
  }
  // saia sobre o terreno: levanta de leve os vértices só-terreno (sem briga de z)
  for (let i = 0; i < nv; i++) if (!(vf[i] & 1) && vf[i] & 4) vx[i * 3 + 1] += 0.025;
  // normais por área
  const nrm = new Float32Array(nv * 3);
  for (let q = 0; q < nq; q++) {
    const o = q * 5;
    const a = quads[o] * 3;
    const b = quads[o + 1] * 3;
    const c = quads[o + 2] * 3;
    const d = quads[o + 3] * 3;
    const e1x = vx[c] - vx[a];
    const e1y = vx[c + 1] - vx[a + 1];
    const e1z = vx[c + 2] - vx[a + 2];
    const e2x = vx[d] - vx[b];
    const e2y = vx[d + 1] - vx[b + 1];
    const e2z = vx[d + 2] - vx[b + 2];
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    for (const vi of [a, b, c, d]) {
      nrm[vi] += nx;
      nrm[vi + 1] += ny;
      nrm[vi + 2] += nz;
    }
  }
  // emite só o que é deste pedaço
  const remap = new Int32Array(nv).fill(-1);
  const emitV = (i: number): number => {
    let r = remap[i];
    if (r >= 0) return r;
    let nx = nrm[i * 3];
    let ny = nrm[i * 3 + 1];
    let nz = nrm[i * 3 + 2];
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    const m = vm[i];
    const def = BLOCKS[m];
    // AO: ocupação numa vizinhança 4×4×4 de amostras
    let k = 1;
    if (opt.ao) {
      const s = vcell[i];
      const sx = s % NS;
      const sy = ((s / NS) | 0) % NS;
      const sz = (s / S2) | 0;
      let occ = 0;
      let tot = 0;
      for (let dz = -1; dz <= 2; dz++) {
        const zz = sz + dz;
        if (zz < 0 || zz >= NS) continue;
        for (let dy = -1; dy <= 2; dy++) {
          const yy = sy + dy;
          if (yy < 0 || yy >= NS) continue;
          for (let dx = -1; dx <= 2; dx++) {
            const xx = sx + dx;
            if (xx < 0 || xx >= NS) continue;
            tot++;
            if (dens[xx + S1 * (yy + S1 * zz)] >= 0) occ++;
          }
        }
      }
      const o = occ / tot;
      k = 1 - (o - 0.5) * 1.5;
      k = k > 1 ? 1 : k < 0.5 ? 0.5 : k;
    }
    // topo (grama) x lado (terra)
    let tt = (ny - 0.35) / 0.4;
    tt = tt < 0 ? 0 : tt > 1 ? 1 : tt * tt * (3 - 2 * tt);
    const ct = def.colTop;
    const cs = def.colSide;
    const tile = ny > 0.55 ? def.tiles.top : def.tiles.side;
    r = B.v(
      vx[i * 3],
      vx[i * 3 + 1],
      vx[i * 3 + 2],
      nx,
      ny,
      nz,
      (cs[0] + (ct[0] - cs[0]) * tt) * k,
      (cs[1] + (ct[1] - cs[1]) * tt) * k,
      (cs[2] + (ct[2] - cs[2]) * tt) * k,
      tile,
      EMIT[m] | 64,
    );
    remap[i] = r;
    return r;
  };
  for (let q = 0; q < nq; q++) {
    const o = q * 5;
    if (!quads[o + 4]) continue;
    const a = emitV(quads[o]);
    const b = emitV(quads[o + 1]);
    const c = emitV(quads[o + 2]);
    const d = emitV(quads[o + 3]);
    // diagonal mais curta (menos "dobra")
    const pa = quads[o] * 3;
    const pb = quads[o + 1] * 3;
    const pc = quads[o + 2] * 3;
    const pd = quads[o + 3] * 3;
    const dac = (vx[pa] - vx[pc]) ** 2 + (vx[pa + 1] - vx[pc + 1]) ** 2 + (vx[pa + 2] - vx[pc + 2]) ** 2;
    const dbd = (vx[pb] - vx[pd]) ** 2 + (vx[pb + 1] - vx[pd + 1]) ** 2 + (vx[pb + 2] - vx[pd + 2]) ** 2;
    B.quad(a, b, c, d, dbd < dac);
  }
}

/* ------------------------------ plantas e formas ------------------------------ */
function smallPass(job: MeshJob, bufs: Buf[]): void {
  const { ids, meta } = job;
  for (let lz = 0; lz < CS; lz++)
    for (let ly = 0; ly < CS; ly++)
      for (let lx = 0; lx < CS; lx++) {
        const i = I(lx + PAD, ly + PAD, lz + PAD);
        const n = ids[i];
        const r = R[n];
        if (r === Render.Cross) cross(job, lx, ly, lz, n, bufs[GRP[n]]);
        else if (r === Render.Shape) shapeMesh(ids, meta, i, lx, ly, lz, n, bufs[GRP[n]]);
      }
}

function cross(job: MeshJob, lx: number, ly: number, lz: number, n: number, B: Buf): void {
  const wx = job.ox + lx;
  const wy = job.oy + ly;
  const wz = job.oz + lz;
  const h = h3(wx, wy, wz);
  const h2 = h3(wz, wx, wy + 7);
  const ox = lx + 0.5 + (h - 0.5) * 0.3;
  const oz = lz + 0.5 + (h2 - 0.5) * 0.3;
  const sc = 0.82 + h * 0.3;
  const r = 0.5 * sc;
  const top = ly + sc;
  const def = BLOCKS[n];
  const c = def.colSide;
  const tile = def.tiles.side;
  const fl = EMIT[n] | 128;
  const ang = h2 * Math.PI;
  for (let k = 0; k < 2; k++) {
    const a = ang + (k * Math.PI) / 2 + Math.PI / 4;
    const dx = Math.cos(a) * r;
    const dz = Math.sin(a) * r;
    const lo = 0.72;
    const v0 = B.v(ox - dx, ly, oz - dz, 0, 1, 0, c[0] * lo, c[1] * lo, c[2] * lo, tile, fl, 0, 0);
    const v1 = B.v(ox + dx, ly, oz + dz, 0, 1, 0, c[0] * lo, c[1] * lo, c[2] * lo, tile, fl, 1, 0);
    const v2 = B.v(ox + dx, top, oz + dz, 0, 1, 0, c[0], c[1], c[2], tile, fl, 1, 1);
    const v3 = B.v(ox - dx, top, oz - dz, 0, 1, 0, c[0], c[1], c[2], tile, fl, 0, 1);
    B.quad(v0, v1, v2, v3);
  }
}

function shapeMesh(ids: Uint16Array, meta: Uint8Array, i: number, lx: number, ly: number, lz: number, n: number, B: Buf): void {
  const def = BLOCKS[n];
  const k = def.shape!;
  let con = 0;
  if (shapeConnects(k)) {
    const ok = (m: number) => m !== 0 && (BLOCKS[m].shape === k || OCC[m] === 1);
    if (ok(ids[i + 1])) con |= CON_PX;
    if (ok(ids[i - 1])) con |= CON_NX;
    if (ok(ids[i + P * P])) con |= CON_PZ;
    if (ok(ids[i - P * P])) con |= CON_NZ;
  }
  const rot = def.rotates ? meta[i] & 3 : 0;
  const boxes = shapeBoxes(k, con);
  const fl = EMIT[n];
  // direção da frente depois de girar (+Z original)
  const [fx, fz] = rotXZ(0.5, 1, rot);
  const frontF = fx > 0.9 ? 0 : fx < 0.1 ? 1 : fz > 0.9 ? 4 : 5;
  for (const bx of boxes) {
    const [ax, az] = rotXZ(bx.a[0], bx.a[2], rot);
    const [bxx, bzz] = rotXZ(bx.b[0], bx.b[2], rot);
    const x0 = Math.min(ax, bxx);
    const x1 = Math.max(ax, bxx);
    const z0 = Math.min(az, bzz);
    const z1 = Math.max(az, bzz);
    const y0 = bx.a[1];
    const y1 = bx.b[1];
    const tk = bx.topK ?? 1;
    const bk = bx.botK ?? 1;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const hx = (x1 - x0) / 2;
    const hz = (z1 - z0) / 2;
    // 8 cantos: bit0 x, bit1 y, bit2 z
    const P8: number[][] = [];
    for (let c = 0; c < 8; c++) {
      const kk = c & 2 ? tk : bk;
      P8.push([lx + cx + (c & 1 ? hx : -hx) * kk, ly + (c & 2 ? y1 : y0), lz + cz + (c & 4 ? hz : -hz) * kk]);
    }
    const taper = tk !== 1 || bk !== 1;
    const faces: [number, number[]][] = [
      [0, [1, 5, 7, 3]],
      [1, [4, 0, 2, 6]],
      [2, [2, 3, 7, 6]],
      [3, [4, 5, 1, 0]],
      [4, [5, 4, 6, 7]],
      [5, [0, 1, 3, 2]],
    ];
    for (const [f, q] of faces) {
      // descarte: face na borda da célula encostada num bloco que cobre
      if (!taper) {
        const a = f >> 1;
        const s = f & 1 ? -1 : 1;
        const coord = a === 0 ? (s > 0 ? x1 : x0) : a === 1 ? (s > 0 ? y1 : y0) : s > 0 ? z1 : z0;
        if ((s > 0 && coord >= 0.999) || (s < 0 && coord <= 0.001)) {
          if (OCC[ids[i + s * STEP[a]]]) continue;
        }
      }
      let tile: number;
      let col = def.colSide;
      if (bx.tile === BoxTile.Top || (bx.tile === BoxTile.Auto && f === 2)) {
        tile = k === 'rail' && rot & 1 ? def.tiles.front : def.tiles.top;
        col = def.colTop;
      } else if (bx.tile === BoxTile.Front || (bx.tile === BoxTile.Auto && f === frontF)) tile = def.tiles.front;
      else if (bx.tile === BoxTile.Auto && f === 3) tile = def.tiles.bottom;
      else tile = def.tiles.side;
      const pts = q.map((c) => P8[c]);
      const an = NRM[f];
      let nx = an[0];
      let ny = an[1];
      let nz = an[2];
      if (taper && f !== 2 && f !== 3) {
        const e1 = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]];
        const e2 = [pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]];
        nx = e1[1] * e2[2] - e1[2] * e2[1];
        ny = e1[2] * e2[0] - e1[0] * e2[2];
        nz = e1[0] * e2[1] - e1[1] * e2[0];
        const l = (nx * an[0] + ny * an[1] + nz * an[2] < 0 ? -1 : 1) * (Math.hypot(nx, ny, nz) || 1);
        nx /= l;
        ny /= l;
        nz /= l;
      }
      const ao = f === 3 ? 0.7 : f === 2 ? 1 : 0.88;
      const ix = pts.map((p) => B.v(p[0], p[1], p[2], nx, ny, nz, col[0] * ao, col[1] * ao, col[2] * ao, tile, fl));
      orientQuad(B, ix, pts, an[0], an[1], an[2]);
    }
  }
}
