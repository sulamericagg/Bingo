/* ============================================================
 *  BLOCOS — armazenamento por pedaço (16³, Uint16 por célula) e
 *  montagem do trabalho de malha (volume com borda dos vizinhos).
 *  Puro (sem DOM/three): serve para o jogo, para o servidor (multijogador)
 *  e para o benchmark em Node.
 * ============================================================ */
import { BLOCKS } from './registry';
import { CS, P, P3, PAD, type MeshJob, type MeshOpts } from './mesher';
import { Render, type TerrainSampler } from './types';

const C3 = CS * CS * CS;
const NS = P * 2;

export interface BlockChunk {
  cx: number;
  cy: number;
  cz: number;
  key: string;
  ids: Uint16Array;
  meta: Uint8Array;
  /** blocos não-ar */
  count: number;
  /** precisa de malha nova */
  dirty: boolean;
  /** muda a cada edição (descarta resultado velho do Worker) */
  ver: number;
}

export interface FallMove {
  from: [number, number, number];
  to: [number, number, number];
  num: number;
}

export const chunkKey = (cx: number, cy: number, cz: number) => cx + ',' + cy + ',' + cz;
const fdiv = (a: number) => Math.floor(a / CS);
const fmod = (a: number) => ((a % CS) + CS) % CS;
const GRAV = new Uint8Array(BLOCKS.length);
const REPLACEABLE = new Uint8Array(BLOCKS.length);
const SOFTR = new Uint8Array(BLOCKS.length);
for (const b of BLOCKS) {
  GRAV[b.num] = b.gravity ? 1 : 0;
  REPLACEABLE[b.num] = b.num === 0 || (b.render === Render.Cross && !b.solid) ? 1 : 0;
  SOFTR[b.num] = b.render === Render.Soft ? 1 : 0;
}

export class BlockStore {
  readonly chunks = new Map<string, BlockChunk>();
  /** chamado quando um pedaço fica sujo */
  onDirty: ((c: BlockChunk) => void) | null = null;
  private fallQ: number[] = [];

  createBlockChunk(cx: number, cy: number, cz: number): BlockChunk {
    const key = chunkKey(cx, cy, cz);
    let c = this.chunks.get(key);
    if (!c) {
      c = { cx, cy, cz, key, ids: new Uint16Array(C3), meta: new Uint8Array(C3), count: 0, dirty: false, ver: 0 };
      this.chunks.set(key, c);
    }
    return c;
  }
  chunk(cx: number, cy: number, cz: number): BlockChunk | undefined {
    return this.chunks.get(chunkKey(cx, cy, cz));
  }
  removeChunk(cx: number, cy: number, cz: number): void {
    this.chunks.delete(chunkKey(cx, cy, cz));
  }

  getBlock(x: number, y: number, z: number): number {
    const c = this.chunks.get(chunkKey(fdiv(x), fdiv(y), fdiv(z)));
    return c ? c.ids[fmod(x) + CS * (fmod(y) + CS * fmod(z))] : 0;
  }
  getMeta(x: number, y: number, z: number): number {
    const c = this.chunks.get(chunkKey(fdiv(x), fdiv(y), fdiv(z)));
    return c ? c.meta[fmod(x) + CS * (fmod(y) + CS * fmod(z))] : 0;
  }

  /** coloca (ou tira, num=0) um bloco. meta: bits 0..1 = rotação. Devolve true se mudou. */
  setBlock(x: number, y: number, z: number, num: number, meta = 0): boolean {
    x |= 0;
    y |= 0;
    z |= 0;
    const cx = fdiv(x);
    const cy = fdiv(y);
    const cz = fdiv(z);
    let c = this.chunks.get(chunkKey(cx, cy, cz));
    if (!c) {
      if (!num) return false;
      c = this.createBlockChunk(cx, cy, cz);
    }
    const i = fmod(x) + CS * (fmod(y) + CS * fmod(z));
    const old = c.ids[i];
    if (old === num && c.meta[i] === meta) return false;
    c.ids[i] = num;
    c.meta[i] = meta;
    c.count += (num ? 1 : 0) - (old ? 1 : 0);
    // suja este pedaço e os vizinhos cuja borda (PAD) enxerga esta célula
    const lx = fmod(x);
    const ly = fmod(y);
    const lz = fmod(z);
    const rx0 = lx < PAD ? -1 : 0;
    const rx1 = lx >= CS - PAD ? 1 : 0;
    const ry0 = ly < PAD ? -1 : 0;
    const ry1 = ly >= CS - PAD ? 1 : 0;
    const rz0 = lz < PAD ? -1 : 0;
    const rz1 = lz >= CS - PAD ? 1 : 0;
    for (let dz = rz0; dz <= rz1; dz++)
      for (let dy = ry0; dy <= ry1; dy++)
        for (let dx = rx0; dx <= rx1; dx++) {
          const n = dx || dy || dz ? this.chunks.get(chunkKey(cx + dx, cy + dy, cz + dz)) : c;
          if (n) this.markDirty(n);
        }
    if (GRAV[num] || !num) this.fallQ.push(x, y, z, x, y + 1, z);
    return true;
  }

  markDirty(c: BlockChunk): void {
    c.ver++;
    if (!c.dirty) {
      c.dirty = true;
      this.onDirty?.(c);
    }
  }

  /** enche uma caixa (inclusive) — útil para gerador/demo */
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, num: number, meta = 0): void {
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.setBlock(x, y, z, num, meta);
  }

  /**
   * Gravidade (areia, cascalho, neve fofa): processa até `max` posições da fila.
   * Move o bloco direto para onde ele para e devolve os movimentos (para o
   * motor animar a queda como entidade, se quiser).
   */
  tickGravity(max = 64): FallMove[] {
    const out: FallMove[] = [];
    const q = this.fallQ;
    let n = 0;
    while (q.length && n++ < max) {
      const z = q.pop()!;
      const y = q.pop()!;
      const x = q.pop()!;
      const b = this.getBlock(x, y, z);
      if (!GRAV[b] || !REPLACEABLE[this.getBlock(x, y - 1, z)]) continue;
      if (!this.chunk(fdiv(x), fdiv(y - 1), fdiv(z))) continue; // sem pedaço embaixo: o motor decide (terreno)
      let ty = y - 1;
      while (ty > y - 96 && REPLACEABLE[this.getBlock(x, ty - 1, z)] && this.chunk(fdiv(x), fdiv(ty - 1), fdiv(z))) ty--;
      const m = this.getMeta(x, y, z);
      this.setBlock(x, y, z, 0);
      this.setBlock(x, ty, z, b, m);
      out.push({ from: [x, y, z], to: [x, ty, z], num: b });
    }
    return out;
  }
  /** há blocos esperando cair? */
  get falling(): boolean {
    return this.fallQ.length > 0;
  }

  /**
   * Monta o volume P³ (pedaço + PAD dos vizinhos) para o mesher.
   * terrain: amostrado em 2× só perto de blocos macios (emenda com o chão).
   */
  buildJob(c: BlockChunk, opt: MeshOpts, terrain: TerrainSampler | null): MeshJob {
    const ids = new Uint16Array(P3);
    const meta = new Uint8Array(P3);
    const ox = c.cx * CS;
    const oy = c.cy * CS;
    const oz = c.cz * CS;
    // 27 vizinhos em vetor (evita Map por célula)
    const nb: (BlockChunk | undefined)[] = [];
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) nb.push(dx || dy || dz ? this.chunk(c.cx + dx, c.cy + dy, c.cz + dz) : c);
    let soft = false;
    for (let z = 0; z < P; z++) {
      const wz = z - PAD;
      const cz = wz < 0 ? 0 : wz >= CS ? 2 : 1;
      const lz = wz - (cz - 1) * CS;
      for (let y = 0; y < P; y++) {
        const wy = y - PAD;
        const cy = wy < 0 ? 0 : wy >= CS ? 2 : 1;
        const ly = wy - (cy - 1) * CS;
        for (let x = 0; x < P; x++) {
          const wx = x - PAD;
          const cx = wx < 0 ? 0 : wx >= CS ? 2 : 1;
          const ch = nb[cx + 3 * (cy + 3 * cz)];
          if (!ch) continue;
          const lx = wx - (cx - 1) * CS;
          const si = lx + CS * (ly + CS * lz);
          const di = x + P * (y + P * z);
          const n = ch.ids[si];
          ids[di] = n;
          meta[di] = ch.meta[si];
          if (SOFTR[n]) soft = true;
        }
      }
    }
    let terr: Float32Array | null = null;
    let terrId: Uint16Array | null = null;
    if (soft && terrain && (terrain.height || terrain.density)) {
      // células a até 2 blocos de um macio
      const near = new Uint8Array(P3);
      for (let z = 0; z < P; z++)
        for (let y = 0; y < P; y++)
          for (let x = 0; x < P; x++) {
            if (!SOFTR[ids[x + P * (y + P * z)]]) continue;
            for (let dz = -2; dz <= 2; dz++)
              for (let dy = -2; dy <= 2; dy++)
                for (let dx = -2; dx <= 2; dx++) {
                  const X = x + dx;
                  const Y = y + dy;
                  const Z = z + dz;
                  if (X >= 0 && Y >= 0 && Z >= 0 && X < P && Y < P && Z < P) near[X + P * (Y + P * Z)] = 1;
                }
          }
      terr = new Float32Array(NS * NS * NS).fill(-0.5);
      if (terrain.block) terrId = new Uint16Array(P3);
      const hcache = new Float32Array(NS * NS).fill(NaN);
      const H = (sx: number, sz: number, wx: number, wz: number) => {
        const k = sx + NS * sz;
        let h = hcache[k];
        if (h !== h) h = hcache[k] = terrain.height!(wx, wz);
        return h;
      };
      let anyT = false;
      for (let z = 0; z < P; z++)
        for (let y = 0; y < P; y++)
          for (let x = 0; x < P; x++) {
            const ci = x + P * (y + P * z);
            if (!near[ci]) continue;
            for (let k = 0; k < 8; k++) {
              const sx = 2 * x + (k & 1);
              const sy = 2 * y + ((k >> 1) & 1);
              const sz = 2 * z + ((k >> 2) & 1);
              const wx = ox - PAD + (sx + 0.5) * 0.5;
              const wy = oy - PAD + (sy + 0.5) * 0.5;
              const wz = oz - PAD + (sz + 0.5) * 0.5;
              let d = terrain.density ? terrain.density(wx, wy, wz) : H(sx, sz, wx, wz) - wy;
              d = d > 0.5 ? 0.5 : d < -0.5 ? -0.5 : d;
              if (d >= 0) anyT = true;
              terr[sx + NS * (sy + NS * sz)] = d;
            }
            if (terrId) terrId[ci] = terrain.block!(ox - PAD + x + 0.5, oy - PAD + y + 0.5, oz - PAD + z + 0.5);
          }
      if (!anyT) {
        terr = null;
        terrId = null;
      }
    }
    return { ids, meta, terr, terrId, ox, oy, oz, opt };
  }

  /* ------------------------------ save (RLE) ------------------------------ */
  /** pedaço → bytes (RLE de pares num/meta). Vazio → null. */
  static encode(c: BlockChunk): Uint8Array | null {
    if (!c.count) return null;
    const out: number[] = [];
    let i = 0;
    while (i < C3) {
      const n = c.ids[i];
      const m = c.meta[i];
      let r = 1;
      while (i + r < C3 && r < 65535 && c.ids[i + r] === n && c.meta[i + r] === m) r++;
      out.push(r & 255, r >> 8, n & 255, n >> 8, m);
      i += r;
    }
    return Uint8Array.from(out);
  }
  /** bytes de encode() → pedaço (cria se faltar) e marca para malha */
  load(cx: number, cy: number, cz: number, data: Uint8Array): BlockChunk {
    const c = this.createBlockChunk(cx, cy, cz);
    BlockStore.decode(c, data);
    this.markDirty(c);
    return c;
  }
  static decode(c: BlockChunk, data: Uint8Array): void {
    let i = 0;
    let cnt = 0;
    for (let o = 0; o + 4 < data.length && i < C3; o += 5) {
      const r = data[o] | (data[o + 1] << 8);
      const n = data[o + 2] | (data[o + 3] << 8);
      const m = data[o + 4];
      const nn = n < BLOCKS.length ? n : 0;
      c.ids.fill(nn, i, i + r);
      c.meta.fill(m, i, i + r);
      if (nn) cnt += r;
      i += r;
    }
    c.count = cnt;
  }
}
