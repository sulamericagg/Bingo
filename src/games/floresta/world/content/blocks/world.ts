/* ============================================================
 *  BLOCOS — mundo de blocos para o motor (three): pedaços 16³, malha só
 *  dos sujos com orçamento por quadro (Worker quando dá), 1 malha por
 *  grupo de material por pedaço, luzes dos blocos que brilham, raio de mira.
 *
 *  Uso mínimo (ver docs/MUNDO-BLOCOS.md):
 *    const bw = new BlockWorld({ parent: scene, tier, terrain: { height: gen.height } });
 *    bw.setBlock(x, y, z, 'tijolo');      // ou num
 *    bw.remesh();                          // todo quadro (respeita o orçamento)
 *    bw.dispose();
 * ============================================================ */
import * as THREE from 'three';
import { BLOCK_QUALITY, type BlockQuality } from './quality';
import { createBlockMaterials, type BlockMaterials } from './material';
import { CS, meshChunk, type GroupMesh, type MeshJob, type MeshResult } from './mesher';
import { BLOCKS, blockDef, blockNum } from './registry';
import { BlockStore, chunkKey, type BlockChunk, type FallMove } from './store';
import type { TerrainSampler } from './types';

export interface BlockWorldOptions {
  /** onde pendurar as malhas */
  parent: THREE.Object3D;
  /** nível de qualidade (src/core/quality.ts) */
  tier?: 0 | 1 | 2 | 3;
  /** chão natural do motor (para os macios se fundirem nele) */
  terrain?: TerrainSampler | null;
  /** força ligar/desligar o Worker (padrão: o do nível) */
  worker?: boolean;
}

export interface BlockLight {
  x: number;
  y: number;
  z: number;
  num: number;
  /** 0..15 */
  level: number;
  color: string;
  d2: number;
}

export interface BlockHit {
  /** célula atingida */
  x: number;
  y: number;
  z: number;
  num: number;
  /** normal da face (onde colocar um bloco novo = célula + normal) */
  nx: number;
  ny: number;
  nz: number;
  dist: number;
}

interface ChunkGfx {
  meshes: (THREE.Mesh | null)[];
  lights: number[];
  tris: number;
}

export class BlockWorld {
  readonly store = new BlockStore();
  readonly root = new THREE.Group();
  mats: BlockMaterials;
  q: BlockQuality;
  tier: 0 | 1 | 2 | 3;
  terrain: TerrainSampler | null;
  /** foco para prioridade de malha (jogador/câmera) */
  readonly focus = new THREE.Vector3();
  readonly stats = { chunks: 0, tris: 0, draws: 0, meshMs: 0, jobs: 0, lastFrameMs: 0 };
  private gfx = new Map<string, ChunkGfx>();
  private dirty = new Set<string>();
  private worker: Worker | null = null;
  private inflight = new Map<string, number>();
  private ready: { key: string; ver: number; r: MeshResult }[] = [];

  constructor(o: BlockWorldOptions) {
    this.tier = o.tier ?? 2;
    this.q = BLOCK_QUALITY[this.tier];
    this.terrain = o.terrain ?? null;
    this.mats = createBlockMaterials(this.q.texture);
    this.root.name = 'blocos';
    o.parent.add(this.root);
    this.store.onDirty = (c) => this.dirty.add(c.key);
    if (o.worker ?? this.q.worker) this.startWorker();
  }

  private startWorker(): void {
    try {
      const w = new Worker(new URL('./mesh.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<{ key: string; ver: number; r: MeshResult }>) => {
        this.inflight.delete(e.data.key);
        this.ready.push(e.data);
      };
      w.onerror = () => {
        // sem Worker (WebView antigo / CSP): volta para o main thread
        w.terminate();
        this.worker = null;
        for (const k of this.inflight.keys()) this.dirty.add(k);
        this.inflight.clear();
      };
      this.worker = w;
    } catch {
      this.worker = null;
    }
  }

  /* ------------------------------ dados ------------------------------ */
  createBlockChunk(cx: number, cy: number, cz: number): BlockChunk {
    return this.store.createBlockChunk(cx, cy, cz);
  }
  getBlock(x: number, y: number, z: number): number {
    return this.store.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
  }
  getBlockId(x: number, y: number, z: number): string {
    return blockDef(this.getBlock(x, y, z)).id;
  }
  /** b: num ou id ('tijolo'); 0/'ar' tira. rot 0..3 (blocos que giram). */
  setBlock(x: number, y: number, z: number, b: number | string, rot = 0): boolean {
    const n = typeof b === 'string' ? blockNum(b) : b;
    return this.store.setBlock(Math.floor(x), Math.floor(y), Math.floor(z), n, rot & 3);
  }
  /** gravidade (areia cai): chame algumas vezes por segundo */
  tickGravity(max = 64): FallMove[] {
    return this.store.tickGravity(max);
  }

  /** descarrega um pedaço (devolve os bytes para salvar, ou null se vazio) */
  unloadChunk(cx: number, cy: number, cz: number): Uint8Array | null {
    const c = this.store.chunk(cx, cy, cz);
    if (!c) return null;
    const data = BlockStore.encode(c);
    this.store.removeChunk(cx, cy, cz);
    this.dropGfx(c.key);
    this.dirty.delete(c.key);
    return data;
  }
  /** carrega bytes salvos (encode) */
  loadChunk(cx: number, cy: number, cz: number, data: Uint8Array): void {
    this.store.load(cx, cy, cz, data);
  }

  /* ------------------------------ malha ------------------------------ */
  /**
   * Remonta pedaços sujos (mais perto do foco primeiro) dentro do orçamento (ms).
   * Com Worker: aqui só monta o job e sobe os buffers prontos. Devolve quantos aplicou.
   */
  remesh(budgetMs = this.q.budgetMs): number {
    const t0 = performance.now();
    let applied = 0;
    // 1) aplica resultados prontos do Worker
    while (this.ready.length) {
      const m = this.ready.shift()!;
      const c = this.store.chunks.get(m.key);
      if (!c) continue;
      if (c.ver !== m.ver) {
        this.dirty.add(m.key); // ficou velho no caminho
        continue;
      }
      this.apply(c, m.r);
      applied++;
      if (performance.now() - t0 > budgetMs) break;
    }
    if (!this.dirty.size) {
      this.stats.lastFrameMs = performance.now() - t0;
      return applied;
    }
    // 2) ordena sujos por distância ao foco
    const f = this.focus;
    const list = [...this.dirty]
      .map((k) => this.store.chunks.get(k))
      .filter((c): c is BlockChunk => !!c && !this.inflight.has(c.key))
      .sort((a, b) => dist2(a, f) - dist2(b, f));
    for (const c of list) {
      if (performance.now() - t0 > budgetMs) break;
      if (this.worker && this.inflight.size >= 3) break;
      this.dirty.delete(c.key);
      c.dirty = false;
      if (!c.count && !this.hasNeighborBlocks(c)) {
        this.dropGfx(c.key);
        continue;
      }
      const job = this.store.buildJob(c, this.q.mesh, this.terrain);
      if (this.worker) {
        this.inflight.set(c.key, c.ver);
        const tr: Transferable[] = [job.ids.buffer, job.meta.buffer];
        if (job.terr) tr.push(job.terr.buffer);
        if (job.terrId) tr.push(job.terrId.buffer);
        this.worker.postMessage({ key: c.key, ver: c.ver, job }, tr);
      } else {
        this.apply(c, meshChunk(job));
        applied++;
      }
    }
    this.stats.lastFrameMs = performance.now() - t0;
    return applied;
  }

  /** tudo de uma vez, no main thread (carregamento/benchmark/demo) */
  remeshAll(): { ms: number; chunks: number; tris: number } {
    const t0 = performance.now();
    let n = 0;
    for (const k of [...this.dirty]) {
      const c = this.store.chunks.get(k);
      this.dirty.delete(k);
      if (!c) continue;
      c.dirty = false;
      const job: MeshJob = this.store.buildJob(c, this.q.mesh, this.terrain);
      this.apply(c, meshChunk(job));
      n++;
    }
    return { ms: performance.now() - t0, chunks: n, tris: this.stats.tris };
  }

  /** ainda há malha por fazer? */
  get busy(): boolean {
    return this.dirty.size > 0 || this.inflight.size > 0 || this.ready.length > 0;
  }

  private hasNeighborBlocks(c: BlockChunk): boolean {
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (this.store.chunk(c.cx + dx, c.cy + dy, c.cz + dz)?.count) return true;
    return false;
  }

  private apply(c: BlockChunk, r: MeshResult): void {
    const old = this.gfx.get(c.key);
    const g: ChunkGfx = old ?? { meshes: [null, null, null], lights: [], tris: 0 };
    this.stats.tris += r.tris - g.tris;
    g.tris = r.tris;
    g.lights = r.lights;
    for (let i = 0; i < 3; i++) {
      const gm = r.groups[i];
      const m = g.meshes[i];
      if (!gm) {
        if (m) {
          m.geometry.dispose();
          this.root.remove(m);
          g.meshes[i] = null;
          this.stats.draws--;
        }
        continue;
      }
      const geo = toGeometry(gm);
      if (m) {
        m.geometry.dispose();
        m.geometry = geo;
      } else {
        const mesh = new THREE.Mesh(geo, this.mats.list[i]);
        mesh.position.set(c.cx * CS, c.cy * CS, c.cz * CS);
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        mesh.renderOrder = i === 2 ? 2 : 0;
        mesh.name = 'blocos:' + c.key + ':' + i;
        this.root.add(mesh);
        g.meshes[i] = mesh;
        this.stats.draws++;
      }
    }
    this.gfx.set(c.key, g);
    this.stats.chunks = this.gfx.size;
    this.stats.jobs++;
    this.stats.meshMs = r.ms;
  }

  private dropGfx(key: string): void {
    const g = this.gfx.get(key);
    if (!g) return;
    for (const m of g.meshes)
      if (m) {
        m.geometry.dispose();
        this.root.remove(m);
        this.stats.draws--;
      }
    this.stats.tris -= g.tris;
    this.gfx.delete(key);
    this.stats.chunks = this.gfx.size;
  }

  /** troca o nível de qualidade (refaz materiais se precisar e remonta tudo) */
  setTier(tier: 0 | 1 | 2 | 3): void {
    if (tier === this.tier) return;
    const hqChange = BLOCK_QUALITY[tier].texture !== this.q.texture;
    this.tier = tier;
    this.q = BLOCK_QUALITY[tier];
    if (hqChange) {
      this.mats.dispose();
      this.mats = createBlockMaterials(this.q.texture);
      for (const g of this.gfx.values()) g.meshes.forEach((m, i) => m && (m.material = this.mats.list[i]));
    }
    for (const c of this.store.chunks.values()) this.store.markDirty(c);
  }

  /* ------------------------------ luzes / mira ------------------------------ */
  /** blocos que emitem luz perto de (x,y,z), do mais perto ao mais longe */
  lightsNear(x: number, y: number, z: number, radius = 24, max = this.q.pointLights): BlockLight[] {
    const out: BlockLight[] = [];
    const r2 = radius * radius;
    const ccx = Math.floor(x / CS);
    const ccy = Math.floor(y / CS);
    const ccz = Math.floor(z / CS);
    const R = Math.ceil(radius / CS);
    for (let dz = -R; dz <= R; dz++)
      for (let dy = -R; dy <= R; dy++)
        for (let dx = -R; dx <= R; dx++) {
          const g = this.gfx.get(chunkKey(ccx + dx, ccy + dy, ccz + dz));
          if (!g) continue;
          const L = g.lights;
          for (let i = 0; i < L.length; i += 4) {
            const d2 = (L[i] - x) ** 2 + (L[i + 1] - y) ** 2 + (L[i + 2] - z) ** 2;
            if (d2 > r2) continue;
            const d = BLOCKS[L[i + 3]];
            out.push({ x: L[i], y: L[i + 1], z: L[i + 2], num: d.num, level: d.light, color: d.lightColor, d2 });
          }
        }
    out.sort((a, b) => a.d2 / (a.level + 1) - b.d2 / (b.level + 1));
    return out.slice(0, max);
  }

  /** raio pela grade (DDA): primeiro bloco não-ar até maxDist */
  pick(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist = 8): BlockHit | null {
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l;
    dy /= l;
    dz /= l;
    let x = Math.floor(ox);
    let y = Math.floor(oy);
    let z = Math.floor(oz);
    const sx = dx > 0 ? 1 : -1;
    const sy = dy > 0 ? 1 : -1;
    const sz = dz > 0 ? 1 : -1;
    const tdx = Math.abs(1 / dx);
    const tdy = Math.abs(1 / dy);
    const tdz = Math.abs(1 / dz);
    let tx = (dx > 0 ? x + 1 - ox : ox - x) * tdx;
    let ty = (dy > 0 ? y + 1 - oy : oy - y) * tdy;
    let tz = (dz > 0 ? z + 1 - oz : oz - z) * tdz;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    let t = 0;
    while (t <= maxDist) {
      const n = this.store.getBlock(x, y, z);
      if (n) return { x, y, z, num: n, nx, ny, nz, dist: t };
      if (tx < ty && tx < tz) {
        x += sx;
        t = tx;
        tx += tdx;
        nx = -sx;
        ny = nz = 0;
      } else if (ty < tz) {
        y += sy;
        t = ty;
        ty += tdy;
        ny = -sy;
        nx = nz = 0;
      } else {
        z += sz;
        t = tz;
        tz += tdz;
        nz = -sz;
        nx = ny = 0;
      }
    }
    return null;
  }

  dispose(): void {
    for (const k of [...this.gfx.keys()]) this.dropGfx(k);
    this.root.removeFromParent();
    this.mats.dispose();
    this.worker?.terminate();
    this.worker = null;
    this.dirty.clear();
    this.inflight.clear();
    this.ready.length = 0;
  }
}

function dist2(c: BlockChunk, f: THREE.Vector3): number {
  return ((c.cx + 0.5) * CS - f.x) ** 2 + ((c.cy + 0.5) * CS - f.y) ** 2 + ((c.cz + 0.5) * CS - f.z) ** 2;
}

function toGeometry(g: GroupMesh): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(g.pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(g.nrm, 3, true));
  geo.setAttribute('color', new THREE.BufferAttribute(g.col, 3, true));
  geo.setAttribute('buv', new THREE.BufferAttribute(g.uv, 2));
  geo.setAttribute('bmat', new THREE.BufferAttribute(g.mat, 2));
  geo.setIndex(new THREE.BufferAttribute(g.idx, 1));
  geo.computeBoundingSphere();
  return geo;
}
