/**
 * CAÇA BLOOP — mapa 2,5D (Canvas 2D, leve para aparelhos antigos).
 *
 * Câmera ortográfica inclinada: girar (arrastar), zoom (pinça) e inclinação que acompanha o zoom, como no gênero.
 * Tudo é uma transformação afim do plano do chão: o "chão" (ruas, parques, água) é pré-desenhado em pedaços
 * de 256 px z17 (cache LRU) e colado com setTransform; prédios (extrudados), árvores e sprites do jogo são
 * desenhados por quadro, ordenados por profundidade.
 */
import type { Tier } from '../core/quality';
import { CHUNK, CHUNKS, TILE_PX, type OsmArea, type OsmLine, type OsmTile } from './osmdata';
import { OsmStore } from './osmtiles';
import { darken, drawProceduralTile, lighten, type MapTheme } from './world';

/* ============================== câmera ============================== */
export interface Cam {
  /** centro (px do mundo z17) — fica no ponto (ox, oy) da tela */
  cx: number;
  cy: number;
  /** px CSS por px do mundo */
  S: number;
  /** rotação do mapa (rad; 0 = norte para cima) */
  rot: number;
  /** cos(inclinação): achata o eixo de profundidade */
  tilt: number;
  /** sen(inclinação): quanto a altura sobe na tela */
  elev: number;
  ox: number;
  oy: number;
  W: number;
  H: number;
}
export type Mat = [number, number, number, number, number, number];

export function camMatrix(k: Cam): Mat {
  const cs = Math.cos(k.rot);
  const sn = Math.sin(k.rot);
  const a = k.S * cs;
  const c = -k.S * sn;
  const b = k.S * k.tilt * sn;
  const d = k.S * k.tilt * cs;
  return [a, b, c, d, k.ox - (a * k.cx + c * k.cy), k.oy - (b * k.cx + d * k.cy)];
}
export function toScreen(m: Mat, wx: number, wy: number): [number, number] {
  return [m[0] * wx + m[2] * wy + m[4], m[1] * wx + m[3] * wy + m[5]];
}
export function toWorld(m: Mat, sx: number, sy: number): [number, number] {
  const det = m[0] * m[3] - m[1] * m[2];
  const x = sx - m[4];
  const y = sy - m[5];
  return [(m[3] * x - m[2] * y) / det, (-m[1] * x + m[0] * y) / det];
}
/** retângulo do mundo visível (de yTop até o pé da tela) */
export function visibleBounds(m: Mat, W: number, H: number, yTop: number): [number, number, number, number] {
  const pts = [toWorld(m, 0, yTop), toWorld(m, W, yTop), toWorld(m, 0, H), toWorld(m, W, H)];
  return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
}

/** algo desenhado na fase de profundidade (prédios, árvores, bichinhos, jogador...) */
export interface Sprite {
  /** profundidade = y da base na tela */
  d: number;
  draw(c: CanvasRenderingContext2D): void;
}

/* ============================== pedaços do chão ============================== */
const AREA_FILL = (th: MapTheme, k: OsmArea['k']): string =>
  ({
    water: th.water, pool: th.water, park: th.park, grass: th.grass, wood: th.wood, sand: th.sand, plaza: th.plaza, pitch: th.pitch,
    residential: th.resid, commercial: th.commerce, industrial: th.industry, nospawn: th.nospawn, farm: th.grass,
  })[k];
const ROAD_W: Record<OsmLine['k'], number> = { motorway: 15, major: 12, medium: 10, minor: 8, service: 5, track: 3, path: 2.4, rail: 2, river: 12, stream: 3.5 };
const ROAD_ORDER: OsmLine['k'][] = ['track', 'path', 'service', 'minor', 'medium', 'major', 'motorway'];

function pathRings(c: CanvasRenderingContext2D, rings: Float32Array[]): void {
  c.beginPath();
  for (const r of rings) {
    c.moveTo(r[0], r[1]);
    for (let i = 2; i < r.length; i += 2) c.lineTo(r[i], r[i + 1]);
    c.closePath();
  }
}
function pathLine(c: CanvasRenderingContext2D, p: Float32Array): void {
  c.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]);
}
const hit = (bb: number[], x0: number, y0: number, x1: number, y1: number, m = 0) => bb[2] >= x0 - m && bb[0] <= x1 + m && bb[3] >= y0 - m && bb[1] <= y1 + m;

/** desenha o pedaço (lcx, lcy) do tile t num contexto já escalado para 256 px */
function drawOsmChunk(c: CanvasRenderingContext2D, t: OsmTile, lcx: number, lcy: number, th: MapTheme, tier: Tier): void {
  const x0 = lcx * CHUNK;
  const y0 = lcy * CHUNK;
  const x1 = x0 + CHUNK;
  const y1 = y0 + CHUNK;
  c.translate(-x0, -y0);
  c.fillStyle = th.ground;
  c.fillRect(x0, y0, CHUNK, CHUNK);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  // áreas
  for (const a of t.areas) {
    if (!hit(a.bb, x0, y0, x1, y1)) continue;
    pathRings(c, a.rings);
    c.fillStyle = AREA_FILL(th, a.k);
    c.fill('evenodd');
    if (a.k === 'water') {
      // margem clara — sem os cortes retos da borda do tile
      c.beginPath();
      for (const r of a.rings)
        for (let i = 0; i + 3 < r.length; i += 2) {
          const ax = r[i],
            ay = r[i + 1],
            bx = r[i + 2],
            by = r[i + 3];
          const E = 0.5;
          if ((ax <= E && bx <= E) || (ay <= E && by <= E) || (ax >= TILE_PX - E && bx >= TILE_PX - E) || (ay >= TILE_PX - E && by >= TILE_PX - E)) continue;
          c.moveTo(ax, ay);
          c.lineTo(bx, by);
        }
      c.strokeStyle = th.water2;
      c.lineWidth = 3;
      c.stroke();
    } else if (a.k === 'wood' || a.k === 'park') {
      c.strokeStyle = darken(AREA_FILL(th, a.k), 0.08);
      c.lineWidth = 1.5;
      c.stroke();
    } else if (a.k === 'pitch') {
      c.strokeStyle = 'rgba(255,255,255,0.7)';
      c.lineWidth = 1;
      c.stroke();
    } else if (a.k === 'pool') {
      c.strokeStyle = '#ffffff';
      c.lineWidth = 1;
      c.stroke();
    }
  }
  // rios e córregos
  for (const l of t.lines) {
    if ((l.k !== 'river' && l.k !== 'stream') || !hit(l.bb, x0, y0, x1, y1, 16)) continue;
    c.strokeStyle = th.river;
    c.lineWidth = ROAD_W[l.k];
    c.beginPath();
    pathLine(c, l.pts);
    c.stroke();
  }
  // ruas: contorno (calçada) de todas → miolo por ordem de importância
  const roads = t.lines.filter((l) => l.k !== 'river' && l.k !== 'stream' && hit(l.bb, x0, y0, x1, y1, 20));
  for (const k of ROAD_ORDER) {
    const w = ROAD_W[k];
    c.beginPath();
    let any = false;
    for (const l of roads) if (l.k === k) (pathLine(c, l.pts), (any = true));
    if (!any) continue;
    c.strokeStyle = th.casing;
    c.lineWidth = w + (k === 'path' || k === 'track' ? 1.4 : 4);
    c.stroke();
  }
  for (const l of roads)
    if (l.bridge && l.k !== 'path') {
      c.beginPath();
      pathLine(c, l.pts);
      c.strokeStyle = th.ink + '70';
      c.lineWidth = ROAD_W[l.k] + 7;
      c.stroke();
      c.strokeStyle = th.casing;
      c.lineWidth = ROAD_W[l.k] + 4;
      c.stroke();
    }
  for (const k of ROAD_ORDER) {
    c.beginPath();
    let any = false;
    for (const l of roads) if (l.k === k) (pathLine(c, l.pts), (any = true));
    if (!any) continue;
    c.strokeStyle = k === 'path' ? th.path : k === 'track' ? th.sand : k === 'major' || k === 'motorway' ? th.roadMain : th.road;
    c.lineWidth = ROAD_W[k];
    c.stroke();
    if (k === 'major' || k === 'motorway') {
      c.strokeStyle = th.roadLine;
      c.lineWidth = 1.1;
      c.setLineDash([6, 7]);
      c.stroke();
      c.setLineDash([]);
    }
  }
  c.beginPath();
  for (const l of roads) if (l.k === 'rail') pathLine(c, l.pts);
  c.strokeStyle = th.rail;
  c.lineWidth = 2.2;
  c.setLineDash([4, 3]);
  c.stroke();
  c.setLineDash([]);
  // prédios: no chão fica a "base" (cor da parede); o telhado sobe por quadro.
  // No nível 0 (aparelho fraco) o prédio é só desenhado aqui, com um volume falso.
  for (let gy = Math.max(0, lcy - 1); gy <= Math.min(CHUNKS - 1, lcy + 1); gy++)
    for (let gx = Math.max(0, lcx - 1); gx <= Math.min(CHUNKS - 1, lcx + 1); gx++)
      for (const i of t.chunkB[gy * CHUNKS + gx]) {
        const b = t.buildings[i];
        if (!hit(b.bb, x0, y0, x1, y1)) continue;
        const col = th.bld[b.c];
        c.beginPath();
        pathRings(c, [b.ring]);
        if (tier === 0) {
          c.fillStyle = darken(col, th.id === 'noite' ? 0.35 : 0.2);
          c.fill();
          c.save();
          c.translate(0, -3);
          c.fillStyle = lighten(col, th.roof);
          c.fill();
          c.strokeStyle = th.ink + '50';
          c.lineWidth = 0.8;
          c.stroke();
          c.restore();
        } else {
          c.fillStyle = darken(col, th.id === 'noite' ? 0.45 : 0.3);
          c.fill();
        }
      }
  if (tier === 0) {
    const s = t.treeOff[lcy * CHUNKS + lcx];
    const e = t.treeOff[lcy * CHUNKS + lcx + 1];
    for (let i = s; i < e; i++) {
      const x = t.trees[i * 2];
      const y = t.trees[i * 2 + 1];
      c.fillStyle = i % 2 ? th.tree : th.tree2;
      c.beginPath();
      c.arc(x, y, 4.5, 0, Math.PI * 2);
      c.fill();
    }
  }
}

/* ============================== sprites prontos ============================== */
function treeSprite(th: MapTheme, v: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 84;
  const c = cv.getContext('2d')!;
  c.fillStyle = 'rgba(20,10,50,0.22)';
  c.beginPath();
  c.ellipse(32, 78, 18, 5, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = th.id === 'noite' ? '#4a3a5a' : '#9a6a4a';
  c.beginPath();
  c.roundRect(28, 50, 8, 28, 3);
  c.fill();
  const main = v ? th.tree : th.tree2;
  const blobs = v ? [[32, 34, 22], [20, 44, 13], [44, 44, 13]] : [[32, 40, 20], [32, 22, 14]];
  c.fillStyle = darken(main, 0.25);
  for (const [x, y, r] of blobs) {
    c.beginPath();
    c.arc(x, y + 2, r, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = main;
  for (const [x, y, r] of blobs) {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = 'rgba(255,255,255,0.28)';
  c.beginPath();
  c.arc(25, 26, 7, 0, Math.PI * 2);
  c.fill();
  return cv;
}

/* ============================== renderizador ============================== */
export interface DrawOpts {
  th: MapTheme;
  dpr: number;
  time: number;
  /** metros por px do mundo (z17) na latitude atual */
  mpp: number;
  /** usa os dados do OSM (senão: mapa procedural) */
  osm: boolean;
}

export class MapRenderer {
  private chunks = new Map<string, HTMLCanvasElement>();
  private trees = new Map<string, HTMLCanvasElement[]>();
  private maxChunks = 64;
  private builtThisFrame = 0;
  constructor(
    private store: OsmStore | null,
    public tier: Tier,
  ) {}

  private chunkPx(S: number, dpr: number): number {
    const want = CHUNK * S * dpr;
    const cap = this.tier >= 2 ? 768 : 512;
    const steps = [256, 384, 512, 768];
    for (const s of steps) if (s >= want * 0.85) return Math.min(cap, s);
    return cap;
  }

  /** canvas do pedaço (cx, cy z17) ou null se ainda não dá (carregando / limite por quadro) */
  private chunk(cx: number, cy: number, px: number, o: DrawOpts): HTMLCanvasElement | null {
    let src: 'osm' | 'proc' = 'proc';
    let tile: OsmTile | null = null;
    if (o.osm && this.store) {
      const tx = Math.floor((cx * CHUNK) / TILE_PX);
      const ty = Math.floor((cy * CHUNK) / TILE_PX);
      tile = this.store.get(tx, ty);
      const st = this.store.state(tx, ty);
      if (tile && !tile.empty) src = 'osm';
      else if (tile && tile.empty) src = 'osm';
      else if (st !== 'err') return null;
    }
    const key = `${src}:${o.th.id}:${this.tier}:${cx}:${cy}:${px}`;
    const got = this.chunks.get(key);
    if (got) {
      this.chunks.delete(key);
      this.chunks.set(key, got);
      return got;
    }
    if (this.builtThisFrame >= (this.tier >= 2 ? 3 : 2)) {
      // reaproveita outra resolução enquanto isso
      for (const s of [768, 512, 384, 256]) {
        const alt = this.chunks.get(`${src}:${o.th.id}:${this.tier}:${cx}:${cy}:${s}`);
        if (alt) return alt;
      }
      return null;
    }
    this.builtThisFrame++;
    const cv = document.createElement('canvas');
    cv.width = cv.height = px;
    const c = cv.getContext('2d')!;
    c.scale(px / CHUNK, px / CHUNK);
    if (src === 'osm' && tile) {
      if (tile.empty) {
        c.fillStyle = o.th.water;
        c.fillRect(0, 0, CHUNK, CHUNK);
      } else drawOsmChunk(c, tile, cx - tile.tx * CHUNKS, cy - tile.ty * CHUNKS, o.th, this.tier);
    } else drawProceduralTile(c, cx, cy, o.th);
    this.chunks.set(key, cv);
    while (this.chunks.size > this.maxChunks) this.chunks.delete(this.chunks.keys().next().value!);
    return cv;
  }

  /** chão + água animada. Devolve a matriz da câmera. */
  drawGround(c: CanvasRenderingContext2D, k: Cam, o: DrawOpts): Mat {
    this.builtThisFrame = 0;
    const m = camMatrix(k);
    const [x0, y0, x1, y1] = visibleBounds(m, k.W, k.H, k.H * 0.06);
    if (o.osm && this.store) this.store.ensure(x0, y0, x1, y1);
    const px = this.chunkPx(k.S, o.dpr);
    const c0 = Math.floor(x0 / CHUNK);
    const c1 = Math.floor(x1 / CHUNK);
    const r0 = Math.floor(y0 / CHUNK);
    const r1 = Math.floor(y1 / CHUNK);
    this.maxChunks = Math.max(48, (c1 - c0 + 2) * (r1 - r0 + 2) + 8);
    const d = o.dpr;
    c.setTransform(m[0] * d, m[1] * d, m[2] * d, m[3] * d, m[4] * d, m[5] * d);
    c.imageSmoothingEnabled = true;
    // mais perto primeiro (o pedaço do jogador fica pronto antes)
    const order: [number, number][] = [];
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) order.push([cx, cy]);
    const pcx = k.cx / CHUNK;
    const pcy = k.cy / CHUNK;
    order.sort((a, b) => Math.hypot(a[0] + 0.5 - pcx, a[1] + 0.5 - pcy) - Math.hypot(b[0] + 0.5 - pcx, b[1] + 0.5 - pcy));
    for (const [cx, cy] of order) {
      const cv = this.chunk(cx, cy, px, o);
      if (cv) c.drawImage(cv, cx * CHUNK - 0.3, cy * CHUNK - 0.3, CHUNK + 0.6, CHUNK + 0.6);
      else {
        // carregando: chão liso com bolinhas suaves
        c.fillStyle = o.th.ground;
        c.fillRect(cx * CHUNK - 0.3, cy * CHUNK - 0.3, CHUNK + 0.6, CHUNK + 0.6);
        c.fillStyle = o.th.sidewalk;
        for (let i = 0; i < 4; i++)
          for (let j = 0; j < 4; j++) {
            c.beginPath();
            c.arc(cx * CHUNK + 32 + i * 64, cy * CHUNK + 32 + j * 64, 5 + Math.sin(o.time * 3 + i + j) * 2, 0, Math.PI * 2);
            c.fill();
          }
      }
    }
    // ondinhas na água
    if (o.osm && this.store && this.tier >= 1) {
      c.strokeStyle = o.th.id === 'noite' ? 'rgba(160,190,255,0.55)' : 'rgba(255,255,255,0.7)';
      c.lineWidth = 2;
      c.lineCap = 'round';
      c.beginPath();
      let n = 0;
      const lim = this.tier >= 2 ? 220 : 90;
      for (const t of this.store.loaded(x0, y0, x1, y1)) {
        const ox = t.tx * TILE_PX;
        const oy = t.ty * TILE_PX;
        for (let i = 0; i < t.waves.length && n < lim; i += 2) {
          const wx = ox + t.waves[i];
          const wy = oy + t.waves[i + 1];
          if (wx < x0 || wx > x1 || wy < y0 || wy > y1) continue;
          const ph = o.time * 1.4 + i * 0.37;
          const dx = Math.sin(ph) * 4;
          const a = 0.5 + 0.5 * Math.sin(ph * 0.7);
          if (a < 0.25) continue;
          const sx = wx + dx;
          c.moveTo(sx - 7, wy);
          c.quadraticCurveTo(sx - 3.5, wy - 3, sx, wy);
          c.quadraticCurveTo(sx + 3.5, wy + 3, sx + 7, wy);
          n++;
        }
      }
      c.stroke();
    }
    return m;
  }

  /** prédios extrudados e árvores visíveis → sprites ordenáveis */
  collect(k: Cam, m: Mat, o: DrawOpts, out: Sprite[]): void {
    if (!o.osm || !this.store || this.tier === 0) return;
    const [x0, y0, x1, y1] = visibleBounds(m, k.W, k.H, -k.H * 0.1);
    const tiles = this.store.loaded(x0 - 64, y0 - 64, x1 + 64, y1 + 64);
    const th = o.th;
    const E = k.S * k.elev;
    const maxB = this.tier >= 3 ? 1600 : this.tier === 2 ? 800 : 280;
    const maxT = this.tier >= 3 ? 700 : this.tier === 2 ? 380 : 140;
    let tsp = this.trees.get(th.id);
    if (!tsp) this.trees.set(th.id, (tsp = [treeSprite(th, 0), treeSprite(th, 1)]));
    const trees = tsp;
    const cand: { d: number; ring: Float32Array; ox: number; oy: number; h: number; col: string }[] = [];
    const tcand: [number, number, number][] = [];
    for (const t of tiles) {
      const ox = t.tx * TILE_PX;
      const oy = t.ty * TILE_PX;
      const lc0 = Math.max(0, Math.floor((x0 - ox) / CHUNK));
      const lc1 = Math.min(CHUNKS - 1, Math.floor((x1 - ox) / CHUNK));
      const lr0 = Math.max(0, Math.floor((y0 - oy) / CHUNK));
      const lr1 = Math.min(CHUNKS - 1, Math.floor((y1 - oy) / CHUNK));
      for (let ly = lr0; ly <= lr1; ly++)
        for (let lx = lc0; lx <= lc1; lx++) {
          const ci = ly * CHUNKS + lx;
          for (const i of t.chunkB[ci]) {
            const b = t.buildings[i];
            if (b.min > 0 && b.h - b.min < 3) continue;
            const mx = ox + (b.bb[0] + b.bb[2]) / 2;
            const my = oy + (b.bb[1] + b.bb[3]) / 2;
            if (mx < x0 - 40 || mx > x1 + 40 || my < y0 - 40 || my > y1 + 40) continue;
            const dd = (mx - k.cx) ** 2 + (my - k.cy) ** 2;
            cand.push({ d: dd, ring: b.ring, ox, oy, h: (Math.min(b.h, 36) * 0.55 + 2) / o.mpp, col: th.bld[b.c] });
          }
          for (let j = t.treeOff[ci]; j < t.treeOff[ci + 1]; j++) {
            const wx = ox + t.trees[j * 2];
            const wy = oy + t.trees[j * 2 + 1];
            if (wx < x0 || wx > x1 || wy < y0 || wy > y1) continue;
            tcand.push([wx, wy, (wx - k.cx) ** 2 + (wy - k.cy) ** 2]);
          }
        }
    }
    if (cand.length > maxB) cand.sort((a, b) => a.d - b.d).length = maxB;
    if (tcand.length > maxT) tcand.sort((a, b) => a[2] - b[2]).length = maxT;
    const night = th.id === 'noite';
    for (const b of cand) {
      const r = b.ring;
      const n = r.length >> 1;
      const sx = new Float32Array(n);
      const sy = new Float32Array(n);
      let maxY = -Infinity;
      for (let i = 0; i < n; i++) {
        const wx = b.ox + r[i * 2];
        const wy = b.oy + r[i * 2 + 1];
        sx[i] = m[0] * wx + m[2] * wy + m[4];
        sy[i] = m[1] * wx + m[3] * wy + m[5];
        if (sy[i] > maxY) maxY = sy[i];
      }
      const up = b.h * E;
      const wall = darken(b.col, night ? 0.4 : 0.22);
      const wall2 = darken(b.col, night ? 0.5 : 0.34);
      const roof = lighten(b.col, th.roof);
      out.push({
        d: maxY - up * 0.35,
        draw: (c) => {
          // paredes da frente (aresta indo para a esquerda na tela = virada para o jogador)
          for (let i = 0; i < n - 1; i++) {
            const ax = sx[i],
              ay = sy[i],
              bx = sx[i + 1],
              by = sy[i + 1];
            if (bx >= ax) continue;
            c.fillStyle = by - ay > 0 ? wall2 : wall;
            c.beginPath();
            c.moveTo(ax, ay);
            c.lineTo(bx, by);
            c.lineTo(bx, by - up);
            c.lineTo(ax, ay - up);
            c.closePath();
            c.fill();
            if (night && up > 10 && ax - bx > 10) {
              c.fillStyle = th.window;
              const mx = (ax + bx) / 2;
              const my = (ay + by) / 2 - up * 0.55;
              c.fillRect(mx - 2, my - 2, 3, 3);
            }
          }
          c.beginPath();
          c.moveTo(sx[0], sy[0] - up);
          for (let i = 1; i < n; i++) c.lineTo(sx[i], sy[i] - up);
          c.closePath();
          c.fillStyle = roof;
          c.fill();
          c.strokeStyle = th.ink + '44';
          c.lineWidth = 1;
          c.stroke();
        },
      });
    }
    const tw = 11 * k.S;
    for (const [wx, wy] of tcand) {
      const [x, y] = toScreen(m, wx, wy);
      const v = ((wx * 7 + wy * 3) | 0) & 1;
      const s = tw * (0.85 + (((wx * 13 + wy * 5) | 0) & 3) * 0.08);
      out.push({ d: y, draw: (c) => c.drawImage(trees[v], x - s / 2, y - s * 1.22, s, s * 1.31) });
    }
  }

  dispose(): void {
    this.chunks.clear();
    this.trees.clear();
  }
}
