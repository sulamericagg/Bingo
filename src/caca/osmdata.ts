/**
 * CAÇA BLOOP — dados do mapa real (OpenStreetMap via tiles vetoriais OpenMapTiles, zoom 14).
 *
 * buildTile() é PURO (sem DOM): roda no Web Worker (osm.worker.ts) ou na thread principal como reserva.
 * Converte o MVT em geometria pronta para desenhar, em "pixels do mundo" zoom 17 RELATIVOS ao canto do tile z14
 * (um tile z14 = 2048 px z17 = 8×8 "pedaços" de 256 px), e calcula:
 *   - grade de uso do solo 64×64 (célula = 32 px ≈ 30–38 m): cidade / parque / água / praça / proibido
 *     (escolas, creches, hospitais, área militar, cemitérios: nenhum bichinho aparece ali);
 *   - ninhos (parques grandes), árvores e ondinhas (pontos determinísticos), Pontos Bloop e Arenas (POIs).
 * Escolas/hospitais NUNCA viram Ponto Bloop (privacidade/segurança de crianças).
 */
import { decodeMvt, type MvtFeature } from './mvt';

export const TILE_Z = 14;
export const TILE_PX = 2048; // px z17 por tile z14
export const CHUNK = 256; // px z17 (= tile z17)
export const CHUNKS = TILE_PX / CHUNK; // 8
export const GRID = 64;
export const CELL = TILE_PX / GRID; // 32 px

/** códigos da grade */
export const G_CITY = 0;
export const G_PARK = 1;
export const G_WATER = 2;
export const G_PLAZA = 3;
export const G_NOSPAWN = 4;

export type AreaKind = 'water' | 'pool' | 'park' | 'grass' | 'wood' | 'sand' | 'plaza' | 'pitch' | 'residential' | 'commercial' | 'industrial' | 'nospawn' | 'farm';
export type LineKind = 'motorway' | 'major' | 'medium' | 'minor' | 'service' | 'path' | 'track' | 'rail' | 'river' | 'stream';
export type BB = [number, number, number, number];

export interface OsmArea {
  k: AreaKind;
  rings: Float32Array[];
  bb: BB;
}
export interface OsmLine {
  k: LineKind;
  pts: Float32Array;
  bridge: boolean;
  bb: BB;
}
export interface OsmBuilding {
  ring: Float32Array;
  /** altura (m) e altura da base (m) */
  h: number;
  min: number;
  bb: BB;
  /** índice de cor (estável por prédio) */
  c: number;
}
export interface OsmPoi {
  id: string;
  x: number;
  y: number;
  name: string;
  cls: string;
  arena: boolean;
}
export interface OsmNest {
  id: string;
  x: number;
  y: number;
  m2: number;
}
export interface OsmTile {
  tx: number;
  ty: number;
  empty: boolean;
  areas: OsmArea[];
  lines: OsmLine[];
  buildings: OsmBuilding[];
  pois: OsmPoi[];
  nests: OsmNest[];
  /** x,y alternados; ordenados por pedaço (treeOff[c]..treeOff[c+1]) */
  trees: Float32Array;
  treeOff: Uint32Array;
  waves: Float32Array;
  grid: Uint8Array;
  /** índice do ninho + 1 por célula (0 = nenhum) */
  nestGrid: Uint8Array;
  /** prédios por pedaço (índices) */
  chunkB: Uint32Array[];
}

/* ---------------- utilidades ---------------- */
function h32(a: number, b: number, c: number): number {
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
function hStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h32(h, 7, 11);
}
function bbOf(rings: ArrayLike<number>[]): BB {
  let a = Infinity,
    b = Infinity,
    c = -Infinity,
    d = -Infinity;
  for (const r of rings)
    for (let i = 0; i + 1 < r.length; i += 2) {
      const x = r[i],
        y = r[i + 1];
      if (x < a) a = x;
      if (y < b) b = y;
      if (x > c) c = x;
      if (y > d) d = y;
    }
  return [a, b, c, d];
}
function ringArea(r: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i + 3 < r.length; i += 2) s += r[i] * r[i + 3] - r[i + 2] * r[i + 1];
  return s / 2;
}
/** ponto dentro (par-ímpar sobre todos os anéis) */
export function inRings(rings: ArrayLike<number>[], x: number, y: number): boolean {
  let inside = false;
  for (const r of rings) {
    const n = r.length;
    for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
      const yi = r[i + 1],
        yj = r[j + 1];
      if (yi > y !== yj > y) {
        const xi = r[i],
          xj = r[j];
        if (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
  }
  return inside;
}
/** rasteriza polígono na grade (centro das células, scanline par-ímpar) */
function fillGrid(rings: ArrayLike<number>[], bb: BB, grid: Uint8Array, v: number, only?: (old: number) => boolean): number {
  let n = 0;
  const r0 = Math.max(0, Math.floor(bb[1] / CELL - 0.5));
  const r1 = Math.min(GRID - 1, Math.ceil(bb[3] / CELL - 0.5));
  const xs: number[] = [];
  for (let row = r0; row <= r1; row++) {
    const y = (row + 0.5) * CELL;
    xs.length = 0;
    for (const r of rings) {
      const L = r.length;
      for (let i = 0, j = L - 2; i < L; j = i, i += 2) {
        const yi = r[i + 1],
          yj = r[j + 1];
        if (yi > y !== yj > y) xs.push(((r[j] - r[i]) * (y - yi)) / (yj - yi) + r[i]);
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil(xs[k] / CELL - 0.5));
      const c1 = Math.min(GRID - 1, Math.floor(xs[k + 1] / CELL - 0.5));
      for (let col = c0; col <= c1; col++) {
        const idx = row * GRID + col;
        if (only && !only(grid[idx])) continue;
        grid[idx] = v;
        n++;
      }
    }
  }
  return n;
}
/** rasteriza linha grossa (rios) */
function strokeGrid(pts: ArrayLike<number>, halfW: number, grid: Uint8Array, v: number): void {
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const x0 = pts[i],
      y0 = pts[i + 1],
      x1 = pts[i + 2],
      y1 = pts[i + 3];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(len / (CELL / 2)));
    for (let s = 0; s <= steps; s++) {
      const x = x0 + ((x1 - x0) * s) / steps;
      const y = y0 + ((y1 - y0) * s) / steps;
      const rr = Math.max(0, Math.floor(halfW / CELL));
      const cx = Math.floor(x / CELL),
        cy = Math.floor(y / CELL);
      for (let dy = -rr; dy <= rr; dy++)
        for (let dx = -rr; dx <= rr; dx++) {
          const gx = cx + dx,
            gy = cy + dy;
          if (gx >= 0 && gy >= 0 && gx < GRID && gy < GRID) grid[gy * GRID + gx] = v;
        }
    }
  }
}

/* ---------------- classificação OpenMapTiles ---------------- */
const NOSPAWN_LU = new Set(['school', 'kindergarten', 'college', 'university', 'hospital', 'military', 'prison', 'cemetery', 'grave_yard', 'quarry', 'landfill']);
const PARK_LU = new Set(['pitch', 'playground', 'track', 'stadium', 'recreation_ground', 'park', 'garden', 'village_green']);
const STOP_PRI: Record<string, number> = {
  monument: 9, castle: 9, museum: 8, attraction: 8, place_of_worship: 8, zoo: 8, aquarium: 8, theatre: 7, art_gallery: 7, library: 7,
  stadium: 7, park: 6, townhall: 6, cinema: 5, fountain: 6, artwork: 6, memorial: 7, viewpoint: 6, garden: 6, playground: 4, ice_cream: 3,
};
const ARENA_OK = new Set(['monument', 'castle', 'museum', 'attraction', 'place_of_worship', 'zoo', 'aquarium', 'stadium', 'park', 'townhall', 'theatre', 'memorial']);
const NO_STOP = /school|kindergarten|college|university|hospital|clinic|doctors|police|prison|childcare|dentist|pharmacy|bus|shop|grocery|alcohol|bar|pub|nightclub|casino|fuel|parking|bank|atm|toilets|military/;

function lineKind(cls: string, sub: string): LineKind | null {
  switch (cls) {
    case 'motorway':
    case 'trunk':
      return 'motorway';
    case 'primary':
    case 'secondary':
      return 'major';
    case 'tertiary':
      return 'medium';
    case 'minor':
    case 'busway':
      return 'minor';
    case 'service':
    case 'raceway':
      return 'service';
    case 'track':
      return 'track';
    case 'path':
      return sub === 'steps' || sub === 'platform' ? 'path' : 'path';
    case 'rail':
      return 'rail';
    case 'transit':
      return sub === 'tram' || sub === 'light_rail' ? 'rail' : null;
    default:
      return null;
  }
}

const S = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

export interface BuildOpts {
  /** metros por px z17 no centro do tile */
  mpp: number;
}

/** Constrói o tile a partir do MVT bruto. tx,ty = tile z14. */
export function buildTile(buf: ArrayBuffer | Uint8Array, tx: number, ty: number, o: BuildOpts): OsmTile {
  const grid = new Uint8Array(GRID * GRID);
  const nestGrid = new Uint8Array(GRID * GRID);
  const out: OsmTile = {
    tx, ty, empty: true, areas: [], lines: [], buildings: [], pois: [], nests: [],
    trees: new Float32Array(0), treeOff: new Uint32Array(CHUNKS * CHUNKS + 1), waves: new Float32Array(0), grid, nestGrid, chunkB: [],
  };
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (!bytes.length) return finishChunks(out);
  const layers = decodeMvt(bytes, new Set(['water', 'waterway', 'landcover', 'landuse', 'park', 'transportation', 'building', 'poi']));
  out.empty = false;
  const conv = (g: number[][], ext: number): Float32Array[] => {
    const k = TILE_PX / ext;
    return g.filter((r) => r.length >= 4).map((r) => {
      const a = new Float32Array(r.length);
      for (let i = 0; i < r.length; i++) a[i] = r[i] * k;
      return a;
    });
  };
  const area = (k: AreaKind, f: MvtFeature, ext: number): OsmArea | null => {
    if (f.type !== 3) return null;
    const rings = conv(f.geom, ext);
    if (!rings.length) return null;
    const a: OsmArea = { k, rings, bb: bbOf(rings) };
    return a;
  };
  const byName = new Map(layers.map((l) => [l.name, l]));
  const areasLow: OsmArea[] = []; // uso do solo (desenha primeiro)
  const areasMid: OsmArea[] = []; // vegetação
  const areasTop: OsmArea[] = []; // água / praças
  const parkPolys: OsmArea[] = [];

  const lu = byName.get('landuse');
  if (lu)
    for (const f of lu.features) {
      const c = S(f.props.class);
      let k: AreaKind | null = null;
      if (NOSPAWN_LU.has(c)) k = 'nospawn';
      else if (PARK_LU.has(c)) k = c === 'pitch' || c === 'track' || c === 'stadium' ? 'pitch' : 'park';
      else if (c === 'residential' || c === 'suburb' || c === 'quarter' || c === 'neighbourhood') k = 'residential';
      else if (c === 'commercial' || c === 'retail') k = 'commercial';
      else if (c === 'industrial' || c === 'railway' || c === 'garages') k = 'industrial';
      else if (c === 'square' || c === 'pedestrian') k = 'plaza';
      if (!k) continue;
      const a = area(k, f, lu.extent);
      if (!a) continue;
      (k === 'park' || k === 'pitch' || k === 'plaza' ? areasMid : areasLow).push(a);
      if (k === 'park') parkPolys.push(a);
    }
  const lc = byName.get('landcover');
  if (lc)
    for (const f of lc.features) {
      const c = S(f.props.class);
      const sub = S(f.props.subclass);
      let k: AreaKind | null = null;
      if (c === 'wood') k = 'wood';
      else if (c === 'grass') k = sub === 'park' || sub === 'garden' || sub === 'recreation_ground' || sub === 'village_green' ? 'park' : 'grass';
      else if (c === 'sand') k = 'sand';
      else if (c === 'farmland') k = 'farm';
      else if (c === 'wetland') k = 'grass';
      if (!k) continue;
      const a = area(k, f, lc.extent);
      if (!a) continue;
      areasMid.push(a);
      if (k === 'park' || k === 'wood') parkPolys.push(a);
    }
  const pk = byName.get('park');
  if (pk)
    for (const f of pk.features) {
      const a = area('park', f, pk.extent);
      if (!a) continue;
      areasMid.push(a);
      parkPolys.push(a);
    }
  const tr = byName.get('transportation');
  if (tr)
    for (const f of tr.features) {
      const c = S(f.props.class);
      const sub = S(f.props.subclass);
      const brunnel = S(f.props.brunnel);
      if (f.type === 3) {
        if (c === 'path' || c === 'pedestrian' || sub === 'pedestrian' || c === 'bridge') {
          const a = area(c === 'bridge' ? 'plaza' : 'plaza', f, tr.extent);
          if (a) areasTop.push(a);
        }
        continue;
      }
      if (f.type !== 2 || brunnel === 'tunnel') continue;
      const k = lineKind(c, sub);
      if (!k) continue;
      for (const pts of conv(f.geom, tr.extent)) out.lines.push({ k, pts, bridge: brunnel === 'bridge', bb: bbOf([pts]) });
    }
  const ww = byName.get('waterway');
  if (ww)
    for (const f of ww.features) {
      if (f.type !== 2 || S(f.props.brunnel) === 'tunnel') continue;
      const c = S(f.props.class);
      const k: LineKind = c === 'river' || c === 'canal' ? 'river' : 'stream';
      for (const pts of conv(f.geom, ww.extent)) {
        out.lines.push({ k, pts, bridge: false, bb: bbOf([pts]) });
        if (k === 'river') strokeGrid(pts, 8, grid, G_WATER);
      }
    }
  const wa = byName.get('water');
  if (wa)
    for (const f of wa.features) {
      if (S(f.props.brunnel) === 'tunnel') continue;
      const c = S(f.props.class);
      const a = area(c === 'swimming_pool' ? 'pool' : 'water', f, wa.extent);
      if (a) areasTop.push(a);
    }
  // ordem de desenho: uso do solo → vegetação (maiores primeiro) → água/praças
  const big = (a: OsmArea) => -(a.bb[2] - a.bb[0]) * (a.bb[3] - a.bb[1]);
  areasMid.sort((a, b) => big(a) - big(b));
  out.areas = [...areasLow, ...areasMid, ...areasTop];

  // grade de uso do solo (ordem de prioridade: parque < praça < água < proibido)
  for (const a of areasMid) if (a.k === 'park' || a.k === 'grass' || a.k === 'wood' || a.k === 'pitch' || a.k === 'sand') fillGrid(a.rings, a.bb, grid, G_PARK);
  for (const a of areasMid) if (a.k === 'plaza') fillGrid(a.rings, a.bb, grid, G_PLAZA);
  for (const a of areasTop) if (a.k === 'plaza') fillGrid(a.rings, a.bb, grid, G_PLAZA, (o2) => o2 !== G_PARK);
  for (const a of areasTop) if (a.k === 'water') fillGrid(a.rings, a.bb, grid, G_WATER);
  for (const a of areasLow) if (a.k === 'nospawn') fillGrid(a.rings, a.bb, grid, G_NOSPAWN);

  // ninhos: parques grandes (≥ 3,5 ha)
  const m2px = o.mpp * o.mpp;
  for (const a of parkPolys) {
    let s = 0;
    for (const r of a.rings) s += ringArea(r);
    const m2 = Math.abs(s) * m2px;
    if (m2 < 35000) continue;
    const cx = (a.bb[0] + a.bb[2]) / 2;
    const cy = (a.bb[1] + a.bb[3]) / 2;
    const gx = tx * TILE_PX + cx;
    const gy = ty * TILE_PX + cy;
    if (out.nests.some((n) => Math.hypot(n.x - cx, n.y - cy) < 300)) continue;
    if (out.nests.length >= 250) break;
    out.nests.push({ id: `n${Math.round(gx / 128)}_${Math.round(gy / 128)}`, x: cx, y: cy, m2: Math.round(m2) });
    fillGrid(a.rings, a.bb, nestGrid, out.nests.length, (old) => old === 0);
  }
  // nada de ninho em área proibida
  for (let i = 0; i < grid.length; i++) if (grid[i] === G_NOSPAWN || grid[i] === G_WATER) nestGrid[i] = 0;

  // prédios
  const bl = byName.get('building');
  if (bl)
    for (const f of bl.features) {
      if (f.type !== 3 || f.props.hide_3d) continue;
      const rings = conv(f.geom, bl.extent);
      // só anéis externos (área positiva no sistema y-para-baixo do MVT)
      for (const r of rings) {
        if (ringArea(r) <= 4) continue;
        const bb = bbOf([r]);
        const h = Math.max(3, Number(f.props.render_height) || 6);
        const min = Math.max(0, Number(f.props.render_min_height) || 0);
        out.buildings.push({ ring: r, h, min, bb, c: h32(Math.round(bb[0]), Math.round(bb[1]), 3) % 6 });
      }
    }

  // Pontos Bloop e Arenas
  const po = byName.get('poi');
  if (po) {
    const k = TILE_PX / po.extent;
    const best = new Map<number, { p: OsmPoi; pri: number }>();
    for (const f of po.features) {
      if (f.type !== 1 || !f.geom.length) continue;
      const name = S(f.props.name).trim();
      if (!name || name.length > 60) continue;
      const cls = S(f.props.class);
      const sub = S(f.props.subclass);
      if (NO_STOP.test(cls) || NO_STOP.test(sub)) continue;
      const pri0 = STOP_PRI[sub] ?? STOP_PRI[cls];
      if (!pri0) continue;
      const x = f.geom[0][0] * k;
      const y = f.geom[0][1] * k;
      if (x < 0 || y < 0 || x >= TILE_PX || y >= TILE_PX) continue;
      if (grid[Math.floor(y / CELL) * GRID + Math.floor(x / CELL)] === G_NOSPAWN) continue;
      const rank = Number(f.props.rank) || 30;
      const pri = pri0 * 10 - Math.min(40, rank);
      const cell = Math.floor(y / 128) * 16 + Math.floor(x / 128);
      const gx = Math.round(tx * TILE_PX + x);
      const gy = Math.round(ty * TILE_PX + y);
      const p: OsmPoi = { id: `p${(hStr(name) ^ h32(gx >> 3, gy >> 3, 1)).toString(36)}`, x, y, name, cls: sub && STOP_PRI[sub] ? sub : cls, arena: false };
      const cur = best.get(cell);
      if (!cur || pri > cur.pri) best.set(cell, { p, pri });
    }
    const arenaBest = new Map<number, { p: OsmPoi; pri: number }>();
    for (const { p, pri } of best.values()) {
      out.pois.push(p);
      if (!ARENA_OK.has(p.cls)) continue;
      const cell = Math.floor(p.y / 512) * 4 + Math.floor(p.x / 512);
      const cur = arenaBest.get(cell);
      if (!cur || pri > cur.pri) arenaBest.set(cell, { p, pri });
    }
    for (const { p } of arenaBest.values()) p.arena = true;
  }

  // árvores (parques/matas) e ondinhas (água)
  const trees: number[][] = Array.from({ length: CHUNKS * CHUNKS }, () => []);
  let nT = 0;
  const veg = out.areas.filter((a) => a.k === 'park' || a.k === 'wood' || a.k === 'grass');
  for (const a of veg) {
    const step = a.k === 'wood' ? 18 : a.k === 'park' ? 30 : 44;
    for (let y = Math.ceil(a.bb[1] / step) * step; y < a.bb[3] && nT < 6000; y += step)
      for (let x = Math.ceil(a.bb[0] / step) * step; x < a.bb[2] && nT < 6000; x += step) {
        const hh = h32(tx * 4096 + x, ty * 4096 + y, 17);
        if ((hh & 7) < (a.k === 'park' ? 3 : 1)) continue; // clareiras
        const px = x + ((hh >>> 8) % step) - step / 2;
        const py = y + ((hh >>> 16) % step) - step / 2;
        if (px < 0 || py < 0 || px >= TILE_PX || py >= TILE_PX) continue;
        const g = grid[Math.floor(py / CELL) * GRID + Math.floor(px / CELL)];
        if (g === G_WATER || g === G_PLAZA) continue;
        if (!inRings(a.rings, px, py)) continue;
        trees[Math.floor(py / CHUNK) * CHUNKS + Math.floor(px / CHUNK)].push(px, py);
        nT++;
      }
  }
  const tf = new Float32Array(nT * 2);
  let off = 0;
  for (let c = 0; c < trees.length; c++) {
    out.treeOff[c] = off / 2;
    tf.set(trees[c], off);
    off += trees[c].length;
  }
  out.treeOff[trees.length] = off / 2;
  out.trees = tf;
  const wv: number[] = [];
  for (const a of out.areas) {
    if (a.k !== 'water') continue;
    const step = 64;
    for (let y = Math.ceil(a.bb[1] / step) * step; y < a.bb[3] && wv.length < 5000; y += step)
      for (let x = Math.ceil(a.bb[0] / step) * step; x < a.bb[2] && wv.length < 5000; x += step) {
        const hh = h32(tx * 4096 + x, ty * 4096 + y, 29);
        const px = x + ((hh >>> 4) % 40) - 20;
        const py = y + ((hh >>> 12) % 40) - 20;
        if (px < 0 || py < 0 || px >= TILE_PX || py >= TILE_PX) continue;
        if (inRings(a.rings, px, py)) wv.push(px, py);
      }
  }
  out.waves = new Float32Array(wv);
  return finishChunks(out);
}

function finishChunks(t: OsmTile): OsmTile {
  const lists: number[][] = Array.from({ length: CHUNKS * CHUNKS }, () => []);
  t.buildings.forEach((b, i) => {
    // cada prédio fica num só pedaço (o do centro); centro fora do tile = é do vizinho (não duplica)
    const mx = (b.bb[0] + b.bb[2]) / 2;
    const my = (b.bb[1] + b.bb[3]) / 2;
    if (mx < 0 || my < 0 || mx >= TILE_PX || my >= TILE_PX) return;
    lists[Math.floor(my / CHUNK) * CHUNKS + Math.floor(mx / CHUNK)].push(i);
  });
  t.chunkB = lists.map((l) => Uint32Array.from(l));
  return t;
}

/** grade → bioma (coordenadas locais do tile em px z17) */
export function gridAt(t: OsmTile, lx: number, ly: number): number {
  const gx = Math.floor(lx / CELL);
  const gy = Math.floor(ly / CELL);
  if (gx < 0 || gy < 0 || gx >= GRID || gy >= GRID) return G_CITY;
  return t.grid[gy * GRID + gx];
}
