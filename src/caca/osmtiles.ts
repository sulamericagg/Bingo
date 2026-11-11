/**
 * CAÇA BLOOP — tiles do mapa real: busca pelo NOSSO servidor (proxy + cache, server/caca-tiles.ts),
 * cache no aparelho (IndexedDB, funciona offline e poupa dados), decodificação num Web Worker.
 *
 * O servidor só vê "qual quadradão de ~2 km" (tile z14) — nunca o GPS. Nada de localização é salvo fora do aparelho.
 * Dados © OpenStreetMap contributors (ODbL) — a atribuição fica visível no canto do mapa.
 */
import { ONLINE } from '../config';
import { isNative } from '../core/platform';
import { metersPerPx, unproject } from './geo';
import { buildTile, CELL, CHUNK, CHUNKS, G_CITY, GRID, inRings, TILE_PX, TILE_Z, type OsmTile } from './osmdata';
import { WZ } from './world';

const IDB = 'bw-caca-osm';
const STORE = 'tiles';
const IDB_MAX = 60; // ~10–25 MB
const IDB_FRESH = 45 * 24 * 3600 * 1000;
const MEM_MAX = 12;

export type TileState = 'load' | 'ok' | 'err';
interface Entry {
  st: TileState;
  data: OsmTile | null;
  at: number;
  tries: number;
}

const apiBase = (): string => (ONLINE.apiBase || (isNative ? ONLINE.nativeApiBase : '')).replace(/\/+$/, '');

/* ---------------- IndexedDB (best-effort; navegadores antigos/privados seguem sem) ---------------- */
let dbP: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  dbP ??= new Promise((res) => {
    try {
      const r = indexedDB.open(IDB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
      r.onblocked = () => res(null);
    } catch {
      res(null);
    }
  });
  return dbP;
}
async function idbGet(key: string): Promise<{ buf: ArrayBuffer; at: number } | null> {
  const d = await db();
  if (!d) return null;
  return new Promise((res) => {
    try {
      const q = d.transaction(STORE).objectStore(STORE).get(key);
      q.onsuccess = () => res((q.result as { buf: ArrayBuffer; at: number }) ?? null);
      q.onerror = () => res(null);
    } catch {
      res(null);
    }
  });
}
async function idbPut(key: string, buf: ArrayBuffer): Promise<void> {
  const d = await db();
  if (!d) return;
  try {
    const tx = d.transaction(STORE, 'readwrite');
    const st = tx.objectStore(STORE);
    st.put({ buf, at: Date.now() }, key);
    const all = st.getAllKeys();
    all.onsuccess = () => {
      const keys = all.result as string[];
      if (keys.length <= IDB_MAX) return;
      // poda simples: apaga os mais antigos (lê "at" de cada um)
      const ages: [string, number][] = [];
      let n = 0;
      for (const k of keys) {
        const g = st.get(k);
        g.onsuccess = () => {
          ages.push([k, (g.result as { at: number })?.at ?? 0]);
          if (++n === keys.length) {
            ages.sort((a, b) => a[1] - b[1]);
            for (const [kk] of ages.slice(0, keys.length - IDB_MAX)) st.delete(kk);
          }
        };
      }
    };
  } catch {
    /* sem espaço: ignora */
  }
}

/* ---------------- worker ---------------- */
let worker: Worker | null | undefined;
let wSeq = 0;
const wWait = new Map<number, (t: OsmTile | null) => void>();
function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./osm.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; tile?: OsmTile; error?: string }>) => {
      const f = wWait.get(e.data.id);
      wWait.delete(e.data.id);
      f?.(e.data.tile ?? null);
    };
    worker.onerror = () => {
      worker?.terminate();
      worker = null;
      for (const f of wWait.values()) f(null);
      wWait.clear();
    };
  } catch {
    worker = null;
  }
  return worker;
}
function build(buf: ArrayBuffer, tx: number, ty: number): Promise<OsmTile | null> {
  const lat = unproject(0, (ty + 0.5) * 256, TILE_Z)[0];
  const mpp = metersPerPx(lat, WZ);
  const w = getWorker();
  if (!w) {
    try {
      return Promise.resolve(buildTile(buf, tx, ty, { mpp }));
    } catch {
      return Promise.resolve(null);
    }
  }
  return new Promise((res) => {
    const id = ++wSeq;
    wWait.set(id, (t) => {
      if (t) return res(t);
      // worker falhou: tenta na thread principal
      try {
        res(buildTile(buf, tx, ty, { mpp }));
      } catch {
        res(null);
      }
    });
    w.postMessage({ id, buf, tx, ty, mpp });
  });
}

/* ---------------- loja de tiles ---------------- */
export interface LandInfo {
  /** código da grade (G_*) */
  g: number;
  /** id do ninho (parque grande) ou null */
  nest: string | null;
  /** dentro de um prédio */
  bld: boolean;
}

export class OsmStore {
  private tiles = new Map<string, Entry>();
  private queue: [number, number][] = [];
  private inflight = 0;
  private dead = false;
  /** sobe a cada tile que chega (quem depende dos dados recalcula) */
  version = 0;
  constructor(private onChange: () => void) {}

  static tileOfWorld(wx: number, wy: number): [number, number] {
    return [Math.floor(wx / TILE_PX), Math.floor(wy / TILE_PX)];
  }
  state(tx: number, ty: number): TileState | null {
    return this.tiles.get(tx + '/' + ty)?.st ?? null;
  }
  /** dados do tile (z14) — pede se ainda não tem */
  get(tx: number, ty: number, request = true): OsmTile | null {
    const k = tx + '/' + ty;
    const e = this.tiles.get(k);
    if (e) {
      if (e.st === 'err' && request && Date.now() - e.at > 60000) {
        e.st = 'load';
        this.enqueue(tx, ty);
      }
      if (e.data) {
        // LRU
        this.tiles.delete(k);
        this.tiles.set(k, e);
      }
      return e.data;
    }
    if (!request) return null;
    this.tiles.set(k, { st: 'load', data: null, at: Date.now(), tries: 0 });
    this.enqueue(tx, ty);
    this.prune();
    return null;
  }
  private prune(): void {
    let n = 0;
    for (const e of this.tiles.values()) if (e.data) n++;
    if (n <= MEM_MAX) return;
    for (const [k, e] of this.tiles) {
      if (!e.data) continue;
      this.tiles.delete(k);
      if (--n <= MEM_MAX) break;
    }
  }
  private enqueue(tx: number, ty: number): void {
    this.queue.push([tx, ty]);
    this.pump();
  }
  private pump(): void {
    while (this.inflight < 2 && this.queue.length && !this.dead) {
      const [tx, ty] = this.queue.shift()!;
      this.inflight++;
      void this.load(tx, ty).finally(() => {
        this.inflight--;
        this.pump();
      });
    }
  }
  private async load(tx: number, ty: number): Promise<void> {
    const k = tx + '/' + ty;
    const e = this.tiles.get(k);
    if (!e) return;
    const cached = await idbGet(k);
    let buf: ArrayBuffer | null = cached && Date.now() - cached.at < IDB_FRESH ? cached.buf : null;
    if (!buf) {
      buf = await this.fetchTile(tx, ty);
      if (buf) void idbPut(k, buf);
      else if (cached) buf = cached.buf; // velho, mas melhor que nada (offline)
    }
    if (this.dead) return;
    if (!buf) {
      e.tries++;
      e.st = 'err';
      e.at = Date.now();
      this.version++;
      this.onChange();
      return;
    }
    const data = await build(buf, tx, ty);
    if (this.dead) return;
    e.data = data;
    e.st = data ? 'ok' : 'err';
    e.at = Date.now();
    this.version++;
    this.onChange();
  }
  private async fetchTile(tx: number, ty: number): Promise<ArrayBuffer | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      try {
        const r = await fetch(`${apiBase()}/api/caca/tile/${TILE_Z}/${tx}/${ty}`, { signal: ctrl.signal });
        if (r.status === 204) return new ArrayBuffer(0);
        if (r.ok) return await r.arrayBuffer();
        if (r.status !== 503 && r.status !== 429 && r.status < 500) return null;
      } catch {
        /* rede */
      } finally {
        clearTimeout(timer);
      }
      if (this.dead) return null;
      await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
    }
    return null;
  }

  /** pede os tiles que cobrem um retângulo do mundo (px z17) */
  ensure(x0: number, y0: number, x1: number, y1: number): void {
    const [a, b] = OsmStore.tileOfWorld(x0, y0);
    const [c, d] = OsmStore.tileOfWorld(x1, y1);
    for (let ty = b; ty <= d; ty++) for (let tx = a; tx <= c; tx++) this.get(tx, ty);
  }

  /** uso do solo num ponto do mundo (px z17). null = ainda carregando; err → G_CITY genérico */
  landAt(wx: number, wy: number): LandInfo | null | 'err' {
    const [tx, ty] = OsmStore.tileOfWorld(wx, wy);
    const e = this.tiles.get(tx + '/' + ty);
    if (!e) {
      this.get(tx, ty);
      return null;
    }
    if (!e.data) return e.st === 'err' ? 'err' : null;
    const t = e.data;
    const lx = wx - tx * TILE_PX;
    const ly = wy - ty * TILE_PX;
    const gi = Math.min(GRID - 1, Math.floor(ly / CELL)) * GRID + Math.min(GRID - 1, Math.floor(lx / CELL));
    const g = t.empty ? G_CITY : t.grid[gi];
    const ni = t.nestGrid[gi];
    return { g, nest: ni ? t.nests[ni - 1]?.id ?? null : null, bld: this.inBuilding(t, lx, ly) };
  }
  private inBuilding(t: OsmTile, lx: number, ly: number): boolean {
    const cx = Math.floor(lx / CHUNK);
    const cy = Math.floor(ly / CHUNK);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const X = cx + dx,
          Y = cy + dy;
        if (X < 0 || Y < 0 || X >= CHUNKS || Y >= CHUNKS) continue;
        for (const i of t.chunkB[Y * CHUNKS + X]) {
          const b = t.buildings[i];
          if (lx < b.bb[0] || lx > b.bb[2] || ly < b.bb[1] || ly > b.bb[3]) continue;
          if (inRings([b.ring], lx, ly)) return true;
        }
      }
    return false;
  }

  /** ponto mais próximo numa rua/calçada (px z17) dentro de maxD; null se nenhum */
  nearestWay(wx: number, wy: number, maxD: number): [number, number] | null {
    const [tx, ty] = OsmStore.tileOfWorld(wx, wy);
    const t = this.tiles.get(tx + '/' + ty)?.data;
    if (!t) return null;
    const lx = wx - tx * TILE_PX;
    const ly = wy - ty * TILE_PX;
    let best: [number, number] | null = null;
    let bd = maxD * maxD;
    for (const l of t.lines) {
      if (l.k === 'rail' || l.k === 'river' || l.k === 'stream' || l.k === 'motorway') continue;
      if (lx < l.bb[0] - maxD || lx > l.bb[2] + maxD || ly < l.bb[1] - maxD || ly > l.bb[3] + maxD) continue;
      const p = l.pts;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const ax = p[i],
          ay = p[i + 1],
          bx = p[i + 2],
          by = p[i + 3];
        const vx = bx - ax,
          vy = by - ay;
        const L = vx * vx + vy * vy;
        const u = L > 0 ? Math.max(0, Math.min(1, ((lx - ax) * vx + (ly - ay) * vy) / L)) : 0;
        const qx = ax + vx * u,
          qy = ay + vy * u;
        const d = (qx - lx) ** 2 + (qy - ly) ** 2;
        if (d < bd) {
          bd = d;
          best = [qx + tx * TILE_PX, qy + ty * TILE_PX];
        }
      }
    }
    return best;
  }

  /** tiles carregados que cobrem o retângulo */
  loaded(x0: number, y0: number, x1: number, y1: number): OsmTile[] {
    const [a, b] = OsmStore.tileOfWorld(x0, y0);
    const [c, d] = OsmStore.tileOfWorld(x1, y1);
    const out: OsmTile[] = [];
    for (let ty = b; ty <= d; ty++)
      for (let tx = a; tx <= c; tx++) {
        const t = this.tiles.get(tx + '/' + ty)?.data;
        if (t) out.push(t);
      }
    return out;
  }
  /** resumo para a interface: algum tile visível carregando / com erro */
  status(x0: number, y0: number, x1: number, y1: number): 'ok' | 'load' | 'err' {
    const [a, b] = OsmStore.tileOfWorld(x0, y0);
    const [c, d] = OsmStore.tileOfWorld(x1, y1);
    let st: 'ok' | 'load' | 'err' = 'ok';
    for (let ty = b; ty <= d; ty++)
      for (let tx = a; tx <= c; tx++) {
        const s = this.tiles.get(tx + '/' + ty)?.st ?? 'load';
        if (s === 'err') return 'err';
        if (s === 'load') st = 'load';
      }
    return st;
  }
  dispose(): void {
    this.dead = true;
    this.queue = [];
    this.tiles.clear();
  }
}
