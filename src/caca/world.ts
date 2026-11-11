/**
 * CAÇA BLOOP — mundo procedural: biomas e mapa estilizado gerados do hash da grade (sem serviço de mapas).
 *
 * Tudo é medido em "pixels do mundo" Web Mercator no zoom 17 (≈ 1,2 m/px no equador).
 * Quarteirão = 64 px (~75 m). Ruas nas bordas dos quarteirões; avenidas a cada 256 px (borda do tile).
 * O MESMO ruído decide o desenho do mapa e o bioma das aparições (água no mapa = bichos de água ali).
 *
 * Uso hoje: modo casa (sem GPS) e reserva quando o mapa real (OSM, ver osmdata.ts/osmtiles.ts/mapview.ts)
 * não carregou (offline e sem cache) — o MapRenderer desenha estes tiles como "pedaços" de 256 px.
 * `TileProvider`/`UrlTileProvider` ficam para um eventual serviço raster próprio; o mapa real NÃO usa
 * servidores de tiles diretamente do aparelho: passa pelo proxy com cache do nosso Worker (server/caca-tiles.ts).
 */
import { hashN } from './rng';

export const WZ = 17; // zoom do mundo
export const BLOCK = 64;

export type Biome = 'cidade' | 'parque' | 'agua' | 'praca';

/* ---------------- ruído ---------------- */
const lattice = (x: number, y: number, salt: number) => hashN(x | 0, y | 0, salt) / 4294967296;
const smooth = (t: number) => t * t * (3 - 2 * t);
function vnoise(x: number, y: number, salt: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const a = lattice(x0, y0, salt);
  const b = lattice(x0 + 1, y0, salt);
  const c = lattice(x0, y0 + 1, salt);
  const d = lattice(x0 + 1, y0 + 1, salt);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
const S_WATER = 0x5a7e1;
const S_RIVER = 0x41b3;
const S_PARK = 0x9a2c;

const biomeCache = new Map<number, Biome>();
/** bioma de um quarteirão (coordenadas de quarteirão no zoom 17) */
export function biomeAtBlock(bx: number, by: number): Biome {
  const key = (bx & 0xfffff) * 1048576 + (by & 0xfffff);
  const hit = biomeCache.get(key);
  if (hit) return hit;
  let b: Biome;
  const w = vnoise(bx / 7, by / 7, S_WATER) * 0.7 + vnoise(bx / 2.5, by / 2.5, S_WATER + 1) * 0.3;
  const river = Math.abs(vnoise(bx / 11, by / 11, S_RIVER) - 0.5);
  const p = vnoise(bx / 4, by / 4, S_PARK) * 0.75 + vnoise(bx / 1.7, by / 1.7, S_PARK + 3) * 0.25;
  if (w > 0.72 || river < 0.024) b = 'agua';
  else if (p > 0.64) b = 'parque';
  else if (hashN(bx, by, 'praca') % 100 < 7) b = 'praca';
  else b = 'cidade';
  biomeCache.set(key, b);
  if (biomeCache.size > 20000) biomeCache.clear();
  return b;
}
export const biomeAtWorld = (wx: number, wy: number): Biome => biomeAtBlock(Math.floor(wx / BLOCK), Math.floor(wy / BLOCK));

/** existe rua (secundária) entre quarteirões? vertical: entre (bx-1,by) e (bx,by) */
function roadV(bx: number, by: number): boolean {
  if (bx % 4 === 0) return true;
  return hashN(bx, by, 'rv') % 6 !== 0;
}
function roadH(bx: number, by: number): boolean {
  if (by % 4 === 0) return true;
  return hashN(bx, by, 'rh') % 6 !== 0;
}

/* ---------------- temas ---------------- */
export interface MapTheme {
  id: 'dia' | 'tarde' | 'noite';
  ground: string;
  sidewalk: string;
  road: string;
  roadMain: string;
  roadLine: string;
  park: string;
  park2: string;
  tree: string;
  tree2: string;
  water: string;
  water2: string;
  plaza: string;
  plaza2: string;
  bld: string[];
  roof: number; // clarear telhado
  window: string;
  ink: string;
  /* mapa real (OSM) */
  grass: string;
  wood: string;
  sand: string;
  pitch: string;
  resid: string;
  commerce: string;
  industry: string;
  nospawn: string;
  casing: string;
  path: string;
  rail: string;
  river: string;
  sky: [string, string];
}
export const THEMES: Record<MapTheme['id'], MapTheme> = {
  dia: {
    id: 'dia', ground: '#cfe9c4', sidewalk: '#ece6f7', road: '#b9b0d8', roadMain: '#a59bd0', roadLine: '#fff6d2',
    park: '#8fdc8a', park2: '#7fcf7c', tree: '#4fb85f', tree2: '#3a9a4a', water: '#6cc4ff', water2: '#a8e0ff',
    plaza: '#f6e3c8', plaza2: '#ead2b0', bld: ['#ffd9e6', '#fff0c2', '#d9ecff', '#e6dcff', '#d7f5e4', '#ffe1cc'], roof: 0.25, window: '#9fc6ff', ink: '#5b4a8a',
    grass: '#a6e39a', wood: '#6cc777', sand: '#f6e7b4', pitch: '#9fe0a0', resid: '#d6edc9', commerce: '#ebe0f2', industry: '#ddd8e8', nospawn: '#e4dcef',
    casing: '#fbf7ff', path: '#fff3d6', rail: '#9a8fbf', river: '#7cc8ff', sky: ['#a9d8ff', '#e3f3ff'],
  },
  tarde: {
    id: 'tarde', ground: '#e9c9b8', sidewalk: '#f3dfe3', road: '#b79ac0', roadMain: '#a483b3', roadLine: '#ffe7b0',
    park: '#b9cf7a', park2: '#a9c06c', tree: '#7aa64f', tree2: '#5d8a3d', water: '#7fa8e8', water2: '#bcd0f4',
    plaza: '#f6d2b0', plaza2: '#e8bf98', bld: ['#ffc7c7', '#ffe0a8', '#e4c9f0', '#ffd0b0', '#d6c8f4', '#f4e1c0'], roof: 0.2, window: '#ffd27a', ink: '#6a3a6a',
    grass: '#c6d68a', wood: '#8fae5c', sand: '#f8dcae', pitch: '#bcd98c', resid: '#ecd4c4', commerce: '#f0d6dc', industry: '#e2cfd0', nospawn: '#ead2d8',
    casing: '#fff0ea', path: '#ffe6c4', rail: '#a785a8', river: '#8aaee8', sky: ['#ffb58a', '#ffe1c2'],
  },
  noite: {
    id: 'noite', ground: '#2a2a5a', sidewalk: '#3a3672', road: '#22204a', roadMain: '#1b1940', roadLine: '#ffe48a',
    park: '#24584e', park2: '#1f4c44', tree: '#2f7a5a', tree2: '#1f5a44', water: '#1d3f8a', water2: '#3a64b8',
    plaza: '#4a4282', plaza2: '#3d3672', bld: ['#4a3f8a', '#3f4a8f', '#55407f', '#3c3a78', '#4d3b7a', '#3a4680'], roof: 0.12, window: '#ffe48a', ink: '#120a30',
    grass: '#2c6152', wood: '#235546', sand: '#5a5276', pitch: '#2f6a58', resid: '#2e2e62', commerce: '#352f68', industry: '#2f2c5c', nospawn: '#332c64',
    casing: '#4a4486', path: '#5d5598', rail: '#6a64a8', river: '#2a4f9e', sky: ['#0d0a2e', '#2a2466'],
  },
};
export function themeForHour(h: number): MapTheme {
  if (h >= 19 || h < 6) return THEMES.noite;
  if (h >= 17) return THEMES.tarde;
  return THEMES.dia;
}

/* ---------------- interface plugável ---------------- */
export interface TileProvider {
  readonly id: string;
  /** zoom inteiro dos tiles pedidos */
  readonly zoom: number;
  readonly attribution?: string;
  /**
   * Tile (x,y) no `zoom`. `px` = resolução desejada em pixels do aparelho.
   * Devolve a imagem se pronta; senão null e chama `ready()` quando chegar (o mapa redesenha).
   */
  getTile(x: number, y: number, px: number, theme: MapTheme, ready: () => void): CanvasImageSource | null;
  dispose(): void;
}

/** Mapa estilizado offline (padrão). */
export class ProceduralTileProvider implements TileProvider {
  readonly id = 'procedural';
  readonly zoom = WZ;
  private cache = new Map<string, HTMLCanvasElement>();
  getTile(x: number, y: number, px: number, theme: MapTheme): CanvasImageSource {
    const key = `${theme.id}:${x}:${y}:${px}`;
    let cv = this.cache.get(key);
    if (cv) {
      this.cache.delete(key);
      this.cache.set(key, cv);
      return cv;
    }
    cv = document.createElement('canvas');
    cv.width = cv.height = px;
    const c = cv.getContext('2d')!;
    c.scale(px / 256, px / 256);
    drawProceduralTile(c, x, y, theme);
    this.cache.set(key, cv);
    if (this.cache.size > 48) this.cache.delete(this.cache.keys().next().value!);
    return cv;
  }
  dispose(): void {
    this.cache.clear();
  }
}

/**
 * Tiles raster de um serviço COMERCIAL configurado pelo dono (URL com {z}/{x}/{y} e a chave dele).
 * Não é usado por padrão. Limita requisições simultâneas, guarda cache e não pré-carrega fora da tela.
 */
export class UrlTileProvider implements TileProvider {
  readonly id: string;
  private cache = new Map<string, HTMLImageElement | 'err' | 'load'>();
  private inflight = 0;
  private queue: (() => void)[] = [];
  constructor(
    private template: string,
    readonly zoom = WZ,
    readonly attribution = '',
    private maxInflight = 4,
  ) {
    this.id = 'url:' + new URL(template.replace(/[{}]/g, ''), location.href).host;
  }
  getTile(x: number, y: number, _px: number, _t: MapTheme, ready: () => void): CanvasImageSource | null {
    const key = `${x}/${y}`;
    const v = this.cache.get(key);
    if (v instanceof HTMLImageElement) return v;
    if (v) return null;
    this.cache.set(key, 'load');
    const run = () => {
      this.inflight++;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.cache.set(key, img);
        this.done();
        ready();
      };
      img.onerror = () => {
        this.cache.set(key, 'err');
        this.done();
      };
      img.src = this.template.replace('{z}', String(this.zoom)).replace('{x}', String(x)).replace('{y}', String(y));
    };
    if (this.inflight < this.maxInflight) run();
    else this.queue.push(run);
    if (this.cache.size > 160) this.cache.delete(this.cache.keys().next().value!);
    return null;
  }
  private done(): void {
    this.inflight--;
    this.queue.shift()?.();
  }
  dispose(): void {
    this.queue = [];
    this.cache.clear();
  }
}

/* ---------------- desenho do tile procedural ---------------- */
function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}
export function lighten(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v + (255 - v) * k);
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
export function darken(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * (1 - k));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

export function drawProceduralTile(c: CanvasRenderingContext2D, tx: number, ty: number, th: MapTheme): void {
  c.fillStyle = th.sidewalk;
  c.fillRect(0, 0, 256, 256);
  const bx0 = tx * 4;
  const by0 = ty * 4;
  const RW = 7; // meia largura máx. da rua
  // quarteirões (inclui uma borda de vizinhos para a água se fundir)
  for (let j = -1; j <= 4; j++)
    for (let i = -1; i <= 4; i++) {
      const bx = bx0 + i;
      const by = by0 + j;
      const b = biomeAtBlock(bx, by);
      const x = i * BLOCK;
      const y = j * BLOCK;
      const h = hashN(bx, by, 'blk');
      if (b === 'agua') {
        // água invade a rua quando o vizinho também é água (rio contínuo)
        const m = (nb: Biome) => (nb === 'agua' ? -RW - 2 : 4);
        const l = m(biomeAtBlock(bx - 1, by));
        const r = m(biomeAtBlock(bx + 1, by));
        const tp = m(biomeAtBlock(bx, by - 1));
        const bt = m(biomeAtBlock(bx, by + 1));
        c.fillStyle = th.water;
        c.beginPath();
        rr(c, x + l, y + tp, BLOCK - l - r, BLOCK - tp - bt, 14);
        c.fill();
        c.strokeStyle = th.water2;
        c.lineWidth = 1.6;
        c.lineCap = 'round';
        c.beginPath();
        for (let k = 0; k < 3; k++) {
          const wx = x + 10 + ((h >> (k * 4)) & 31);
          const wy = y + 14 + k * 16;
          c.moveTo(wx, wy);
          c.quadraticCurveTo(wx + 5, wy - 3, wx + 10, wy);
          c.quadraticCurveTo(wx + 15, wy + 3, wx + 20, wy);
        }
        c.stroke();
        continue;
      }
      if (i < 0 || j < 0 || i > 3 || j > 3) continue;
      if (b === 'parque') {
        c.fillStyle = th.park;
        c.beginPath();
        rr(c, x + RW, y + RW, BLOCK - RW * 2, BLOCK - RW * 2, 10);
        c.fill();
        c.strokeStyle = th.plaza;
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(x + RW, y + 20 + (h & 15));
        c.bezierCurveTo(x + 24, y + 10, x + 40, y + 54, x + BLOCK - RW, y + 30 + ((h >> 4) & 15));
        c.stroke();
        const n = 4 + (h % 4);
        for (let k = 0; k < n; k++) {
          const hx = hashN(bx, by, k, 'tree');
          const px = x + 14 + (hx % 36);
          const py = y + 14 + ((hx >> 8) % 36);
          const r = 4.5 + ((hx >> 16) % 3);
          c.fillStyle = 'rgba(0,0,0,0.12)';
          c.beginPath();
          c.ellipse(px + 1.5, py + 2.5, r, r * 0.7, 0, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = k % 2 ? th.tree : th.tree2;
          c.beginPath();
          c.arc(px, py, r, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = 'rgba(255,255,255,0.25)';
          c.beginPath();
          c.arc(px - r * 0.35, py - r * 0.35, r * 0.35, 0, Math.PI * 2);
          c.fill();
        }
      } else if (b === 'praca') {
        c.fillStyle = th.plaza;
        c.beginPath();
        rr(c, x + RW, y + RW, BLOCK - RW * 2, BLOCK - RW * 2, 8);
        c.fill();
        c.strokeStyle = th.plaza2;
        c.lineWidth = 1;
        c.beginPath();
        for (let k = 1; k < 6; k++) {
          c.moveTo(x + RW + k * 8.4, y + RW);
          c.lineTo(x + RW + k * 8.4, y + BLOCK - RW);
          c.moveTo(x + RW, y + RW + k * 8.4);
          c.lineTo(x + BLOCK - RW, y + RW + k * 8.4);
        }
        c.stroke();
        c.fillStyle = th.water;
        c.strokeStyle = th.ink;
        c.lineWidth = 1.2;
        c.beginPath();
        c.arc(x + 32, y + 32, 9, 0, Math.PI * 2);
        c.fill();
        c.stroke();
        c.fillStyle = th.water2;
        c.beginPath();
        c.arc(x + 32, y + 32, 3.5, 0, Math.PI * 2);
        c.fill();
      } else {
        // cidade: 1–4 prédios fofinhos com "lateral" para dar volume
        const n = 1 + (h % 4);
        const cells = n === 1 ? [[0, 0, 1, 1]] : n === 2 ? [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]] : n === 3 ? [[0, 0, 0.5, 1], [0.5, 0, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]] : [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]];
        const inner = BLOCK - RW * 2 - 4;
        cells.forEach(([u, v, w, hh], k) => {
          const hk = hashN(bx, by, k, 'bld');
          const col = th.bld[hk % th.bld.length];
          const bxp = x + RW + 2 + u * inner + 2;
          const byp = y + RW + 2 + v * inner + 2;
          const bw = w * inner - 4;
          const bh = hh * inner - 4;
          const depth = 3 + (hk >> 8) % 4;
          c.fillStyle = darken(col, th.id === 'noite' ? 0.35 : 0.18);
          c.beginPath();
          rr(c, bxp, byp + depth, bw, bh - depth, 4);
          c.fill();
          c.fillStyle = lighten(col, th.roof);
          c.beginPath();
          rr(c, bxp, byp, bw, bh - depth, 4);
          c.fill();
          c.strokeStyle = th.ink + '55';
          c.lineWidth = 0.8;
          c.stroke();
          if (th.id === 'noite' || (hk & 3) === 0) {
            c.fillStyle = th.window;
            for (let q = 0; q < 3; q++) if ((hk >> (q + 12)) & 1) c.fillRect(bxp + 3 + q * (bw / 3.2), byp + bh - depth + 0.5, 2.4, Math.max(1, depth - 1.5));
          }
          if (((hk >> 20) & 7) === 0) {
            // telhado-jardim
            c.fillStyle = th.park;
            c.beginPath();
            c.arc(bxp + bw / 2, byp + (bh - depth) / 2, Math.min(bw, bh) * 0.22, 0, Math.PI * 2);
            c.fill();
          }
        });
      }
    }
  // ruas
  for (let j = 0; j <= 4; j++)
    for (let i = 0; i <= 4; i++) {
      const bx = bx0 + i;
      const by = by0 + j;
      const x = i * BLOCK;
      const y = j * BLOCK;
      // vertical: borda esquerda do quarteirão (bx,by), do y ao y+64
      if (j < 4 && roadV(bx, by)) {
        const main = bx % 4 === 0;
        const wl = biomeAtBlock(bx - 1, by) === 'agua' && biomeAtBlock(bx, by) === 'agua';
        if (!wl || main) seg(c, th, x, y - (main ? 0 : 0), x, y + BLOCK, main, wl);
      }
      if (i < 4 && roadH(bx, by)) {
        const main = by % 4 === 0;
        const wl = biomeAtBlock(bx, by - 1) === 'agua' && biomeAtBlock(bx, by) === 'agua';
        if (!wl || main) seg(c, th, x, y, x + BLOCK, y, main, wl);
      }
    }
}

function seg(c: CanvasRenderingContext2D, th: MapTheme, x1: number, y1: number, x2: number, y2: number, main: boolean, bridge: boolean): void {
  const w = main ? 10 : 6;
  c.lineCap = 'round';
  if (bridge) {
    c.strokeStyle = th.ink + '88';
    c.lineWidth = w + 4;
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
  }
  c.strokeStyle = main ? th.roadMain : th.road;
  c.lineWidth = w;
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.stroke();
  if (main) {
    c.strokeStyle = th.roadLine;
    c.lineWidth = 1.2;
    c.setLineDash([5, 6]);
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
    c.setLineDash([]);
  }
}
