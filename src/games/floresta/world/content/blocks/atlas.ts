/* ============================================================
 *  BLOCOS — atlas de texturas PROCEDURAL (gerado em tempo de execução,
 *  sem imagem externa). 16×16 ladrilhos de 32 px (512×512), todos
 *  "emendáveis" (o desenho dá a volta nas bordas).
 *  - colorCanvas: as cores reais (ícones usam este)
 *  - canvas: o que vai para a GPU (ladrilhos de detalhe viram cor/cor-base×0,5)
 * ============================================================ */
import { ATLAS_COLS, TILES, TILE_DETAIL } from './registry';
import type { Tex } from './types';

export const TILE = 32;
export const ATLAS_SIZE = TILE * ATLAS_COLS;

type RGB = [number, number, number];
const rgb = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];

/** pincel sobre um ladrilho RGBA 32×32 com volta nas bordas */
class Tile {
  d = new Float32Array(TILE * TILE * 4);
  private s: number;
  constructor(seed: number) {
    this.s = seed * 7919 + 13;
  }
  r(): number {
    this.s = (Math.imul(this.s ^ (this.s >>> 15), 2246822519) + 0x9e3779b9) | 0;
    return ((this.s >>> 0) % 100000) / 100000;
  }
  set(x: number, y: number, c: RGB, a = 1): void {
    x = ((Math.round(x) % TILE) + TILE) % TILE;
    y = ((Math.round(y) % TILE) + TILE) % TILE;
    const o = (y * TILE + x) * 4;
    const d = this.d;
    if (a >= 1 || d[o + 3] === 0) {
      d[o] = c[0];
      d[o + 1] = c[1];
      d[o + 2] = c[2];
      d[o + 3] = Math.max(d[o + 3], a >= 1 ? 1 : a);
      if (a >= 1) d[o + 3] = 1;
      return;
    }
    d[o] += (c[0] - d[o]) * a;
    d[o + 1] += (c[1] - d[o + 1]) * a;
    d[o + 2] += (c[2] - d[o + 2]) * a;
    d[o + 3] = d[o + 3] + (1 - d[o + 3]) * a;
  }
  get(x: number, y: number): RGB {
    x = ((x % TILE) + TILE) % TILE;
    y = ((y % TILE) + TILE) % TILE;
    const o = (y * TILE + x) * 4;
    return [this.d[o], this.d[o + 1], this.d[o + 2]];
  }
  fill(c: RGB, jit = 0, a = 1): void {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) this.set(x, y, mul(c, 1 + (this.r() - 0.5) * jit), a);
  }
  /** ruído de valor periódico (escala em células por ladrilho) */
  noise(cells: number, seed: number): (x: number, y: number) => number {
    const g: number[] = [];
    for (let i = 0; i < cells * cells; i++) g.push(hashf(i, seed));
    return (x, y) => {
      const fx = (x / TILE) * cells;
      const fy = (y / TILE) * cells;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = fx - ix;
      const ty = fy - iy;
      const at = (a: number, b: number) => g[(((a % cells) + cells) % cells) + cells * (((b % cells) + cells) % cells)];
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const a0 = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx;
      const a1 = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
      return a0 + (a1 - a0) * sy;
    };
  }
  shade(c: RGB, amp: number, cells: number, seed: number, jit = 0.04): void {
    const n = this.noise(cells, seed);
    const n2 = this.noise(cells * 2, seed + 5);
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const v = (n(x, y) * 0.65 + n2(x, y) * 0.35 - 0.5) * amp;
        this.set(x, y, mul(c, 1 + v + (this.r() - 0.5) * jit));
      }
  }
  disc(cx: number, cy: number, r: number, c: RGB, a = 1, soft = false): void {
    for (let y = Math.floor(-r - 1); y <= r + 1; y++)
      for (let x = Math.floor(-r - 1); x <= r + 1; x++) {
        const d = Math.hypot(x, y);
        if (d > r) continue;
        this.set(cx + x, cy + y, c, soft ? a * (1 - d / (r + 0.01)) : a);
      }
  }
  rect(x0: number, y0: number, w: number, h: number, c: RGB, a = 1): void {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) this.set(x0 + x, y0 + y, c, a);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: RGB, a = 1): void {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let i = 0; i <= n; i++) this.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c, a);
  }
  clear(): void {
    this.d.fill(0);
  }
  /** pontos de Voronoi (para pedras/células); devolve f(x,y) → [id, d1, d2] */
  voronoi(n: number): (x: number, y: number) => [number, number, number] {
    const pts: number[] = [];
    for (let i = 0; i < n; i++) pts.push(this.r() * TILE, this.r() * TILE);
    return (x, y) => {
      let d1 = 1e9;
      let d2 = 1e9;
      let id = 0;
      for (let i = 0; i < n; i++)
        for (let oy = -1; oy <= 1; oy++)
          for (let ox = -1; ox <= 1; ox++) {
            const d = Math.hypot(x - pts[i * 2] - ox * TILE, y - pts[i * 2 + 1] - oy * TILE);
            if (d < d1) {
              d2 = d1;
              d1 = d;
              id = i;
            } else if (d < d2) d2 = d;
          }
      return [id, d1, d2];
    };
  }
}
function hashf(i: number, s: number): number {
  let h = Math.imul(i ^ Math.imul(s, 0x27d4eb2d), 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/* ------------------------------ desenhos ------------------------------ */
function paint(T: Tile, x: Tex, seed: number): void {
  const A = rgb(x.a);
  const Bc = rgb(x.b ?? x.a);
  const C = rgb(x.c ?? x.a);
  const r = () => T.r();
  switch (x.p) {
    case 'soil':
    case 'ash':
    case 'mud': {
      T.shade(A, 0.28, 4, seed, 0.1);
      const k = x.p === 'mud' ? 10 : 22;
      for (let i = 0; i < k; i++) T.disc(r() * 32, r() * 32, 0.6 + r() * 1.6, r() < 0.6 ? Bc : C, 0.75);
      if (x.p === 'mud') for (let i = 0; i < 8; i++) T.disc(r() * 32, r() * 32, 1 + r() * 1.5, mix(C, [255, 255, 255], 0.3), 0.35, true);
      if (x.p === 'soil') for (let i = 0; i < 4; i++) T.disc(r() * 32, r() * 32, 1, mix(C, [200, 200, 200], 0.5), 0.9);
      break;
    }
    case 'grass': {
      T.shade(A, 0.22, 4, seed, 0.08);
      for (let i = 0; i < 90; i++) {
        const px = r() * 32;
        const py = r() * 32;
        T.line(px, py, px + (r() - 0.5) * 2, py - 1 - r() * 2.5, r() < 0.5 ? Bc : C, 0.8);
      }
      break;
    }
    case 'sand': {
      T.shade(A, 0.12, 4, seed, 0.12);
      for (let y = 0; y < 32; y++) for (let xx = 0; xx < 32; xx++) if (Math.sin((y + Math.sin(xx * 0.39) * 1.5) * 0.785) > 0.85) T.set(xx, y, Bc, 0.25);
      for (let i = 0; i < 26; i++) T.set(r() * 32, r() * 32, r() < 0.5 ? Bc : C, 0.8);
      break;
    }
    case 'snow':
      T.shade(A, 0.08, 3, seed, 0.03);
      for (let i = 0; i < 18; i++) T.set(r() * 32, r() * 32, r() < 0.7 ? C : Bc, 0.9);
      break;
    case 'clay':
      T.shade(A, 0.12, 2, seed, 0.03);
      for (let i = 0; i < 6; i++) {
        const y = r() * 32;
        T.line(0, y, 32, y + (r() - 0.5) * 4, r() < 0.5 ? Bc : C, 0.35);
      }
      break;
    case 'gravel': {
      T.fill(mul(Bc, 0.8), 0.1);
      for (let i = 0; i < 40; i++) T.disc(r() * 32, r() * 32, 1.2 + r() * 2, mix(A, r() < 0.5 ? Bc : C, r() * 0.7));
      break;
    }
    case 'moss':
      T.shade(A, 0.3, 4, seed, 0.1);
      for (let i = 0; i < 26; i++) T.disc(r() * 32, r() * 32, 1 + r() * 2.5, r() < 0.5 ? Bc : C, 0.5, true);
      break;
    case 'stone':
    case 'porous': {
      T.shade(A, 0.25, 3, seed, 0.06);
      if (x.p === 'stone') {
        for (let i = 0; i < 3; i++) {
          let px = r() * 32;
          let py = r() * 32;
          for (let k = 0; k < 7; k++) {
            const nx = px + (r() - 0.5) * 7;
            const ny = py + (r() - 0.3) * 5;
            T.line(px, py, nx, ny, Bc, 0.55);
            px = nx;
            py = ny;
          }
        }
        for (let i = 0; i < 14; i++) T.set(r() * 32, r() * 32, C, 0.8);
      } else for (let i = 0; i < 26; i++) T.disc(r() * 32, r() * 32, 0.5 + r() * 1.3, mul(Bc, 0.8), 0.85);
      break;
    }
    case 'cobble': {
      const v = T.voronoi(9);
      for (let y = 0; y < 32; y++)
        for (let xx = 0; xx < 32; xx++) {
          const [id, d1, d2] = v(xx, y);
          const edge = d2 - d1;
          const base = mix(A, id % 3 === 0 ? C : Bc, (id % 4) * 0.12);
          T.set(xx, y, edge < 1.3 ? mul(Bc, 0.7) : mul(base, 1.05 - d1 * 0.02 + (r() - 0.5) * 0.06));
        }
      break;
    }
    case 'strata': {
      const n = T.noise(4, seed);
      for (let y = 0; y < 32; y++)
        for (let xx = 0; xx < 32; xx++) {
          const band = Math.sin((y + n(xx, y) * 5) * 0.785);
          T.set(xx, y, mul(band > 0.55 ? C : band < -0.6 ? Bc : A, 1 + (r() - 0.5) * 0.06));
        }
      break;
    }
    case 'smooth':
    case 'plaster':
    case 'concrete': {
      T.shade(A, x.p === 'plaster' ? 0.1 : 0.06, 3, seed, x.p === 'concrete' ? 0.05 : 0.025);
      if (x.p === 'smooth')
        for (let i = 0; i < 32; i++) {
          T.set(i, 0, C, 0.6);
          T.set(0, i, C, 0.6);
          T.set(i, 31, Bc, 0.6);
          T.set(31, i, Bc, 0.6);
        }
      break;
    }
    case 'basalt': {
      T.shade(A, 0.18, 3, seed, 0.05);
      for (const cx of [0, 11, 21]) {
        T.line(cx, 0, cx + 1, 31, mul(Bc, 0.8), 0.8);
        T.line(cx + 1, 0, cx + 2, 31, C, 0.25);
      }
      for (let i = 0; i < 6; i++) {
        const y = r() * 32;
        const cx = [0, 11, 21][(r() * 3) | 0];
        T.line(cx, y, cx + 10, y, Bc, 0.5);
      }
      break;
    }
    case 'glossy':
      T.shade(A, 0.3, 3, seed, 0.04);
      for (let i = 0; i < 5; i++) {
        const px = r() * 32;
        T.line(px, 0, px + 12, 32, C, 0.25);
      }
      for (let i = 0; i < 10; i++) T.set(r() * 32, r() * 32, C, 0.8);
      break;
    case 'marble': {
      const n = T.noise(3, seed);
      for (let y = 0; y < 32; y++)
        for (let xx = 0; xx < 32; xx++) {
          const v = Math.abs(Math.sin((xx + y) * 0.2 + n(xx, y) * 6));
          T.set(xx, y, v < 0.12 ? Bc : mix(A, C, n(y, xx) * 0.5));
        }
      break;
    }
    case 'magma': {
      const v = T.voronoi(7);
      for (let y = 0; y < 32; y++)
        for (let xx = 0; xx < 32; xx++) {
          const [, d1, d2] = v(xx, y);
          const e = d2 - d1;
          T.set(xx, y, e < 1.2 ? C : e < 2.4 ? Bc : mul(A, 1 + (r() - 0.5) * 0.15));
        }
      break;
    }
    case 'ore':
    case 'gem': {
      if (x.p === 'ore') {
        T.shade(A, 0.22, 3, seed, 0.06);
        for (let i = 0; i < 9; i++) T.set(r() * 32, r() * 32, mul(A, 1.3), 0.8);
        for (let i = 0; i < 6; i++) {
          const cx = r() * 32;
          const cy = r() * 32;
          const rr = 1.4 + r() * 1.6;
          T.disc(cx + 0.7, cy + 0.7, rr, mul(Bc, 0.55));
          T.disc(cx, cy, rr, Bc);
          T.disc(cx - rr * 0.35, cy - rr * 0.35, rr * 0.4, C);
        }
      } else {
        T.shade(A, 0.25, 3, seed, 0.06);
        for (let i = 0; i < 4; i++) {
          const cx = r() * 32;
          const cy = r() * 32;
          const s = 2.5 + r() * 2;
          for (let y = -s; y <= s; y++)
            for (let xx = -s; xx <= s; xx++) {
              const d = Math.abs(xx) + Math.abs(y);
              if (d > s) continue;
              T.set(cx + xx, cy + y, xx + y < 0 ? C : d > s - 1 ? mul(Bc, 0.6) : Bc);
            }
        }
      }
      break;
    }
    case 'crystal': {
      T.fill(A, 0.05, 0.85);
      for (let i = 0; i < 6; i++) {
        const px = r() * 32;
        T.line(px, 0, px - 10, 32, C, 0.5);
        T.line(px + 3, 0, px - 7, 32, Bc, 0.4);
      }
      for (let i = 0; i < 32; i++) {
        T.set(i, 0, C, 0.8);
        T.set(0, i, C, 0.8);
      }
      break;
    }
    case 'metal': {
      for (let y = 0; y < 32; y++) {
        const k = 1 + (r() - 0.5) * 0.08;
        for (let xx = 0; xx < 32; xx++) T.set(xx, y, mul(A, k + (r() - 0.5) * 0.04));
      }
      for (let i = 0; i < 32; i++) {
        T.set(i, 0, C);
        T.set(0, i, C);
        T.set(i, 31, Bc);
        T.set(31, i, Bc);
      }
      for (const [cx, cy] of [
        [4, 4],
        [27, 4],
        [4, 27],
        [27, 27],
      ]) {
        T.disc(cx, cy, 1.3, Bc);
        T.set(cx - 0.5, cy - 0.5, C);
      }
      break;
    }
    case 'bark':
    case 'stem': {
      const n = T.noise(4, seed);
      for (let y = 0; y < 32; y++)
        for (let xx = 0; xx < 32; xx++) {
          const v = Math.sin(xx * 1.1 + n(xx, y) * 4);
          T.set(xx, y, mul(v > 0.6 ? Bc : A, 1 + (r() - 0.5) * 0.1));
        }
      if (x.b === '#3a3430') for (let i = 0; i < 7; i++) T.rect(r() * 32, r() * 32, 3 + r() * 4, 1, Bc); // bétula: listras
      break;
    }
    case 'rings':
      for (let y = 0; y < 32; y++)
        for (let xx = 0; xx < 32; xx++) {
          const d = Math.hypot(xx - 15.5, y - 15.5);
          const ring = Math.sin(d * 1.6) > 0.5;
          T.set(xx, y, d > 14.5 ? C : mul(ring ? Bc : A, 1 + (r() - 0.5) * 0.06));
        }
      break;
    case 'planks':
    case 'bench':
    case 'door':
    case 'chestf': {
      const vert = x.p === 'door';
      for (let y = 0; y < 32; y++)
        for (let xx = 0; xx < 32; xx++) {
          const a = vert ? xx : y;
          const b = vert ? y : xx;
          const board = (a / 8) | 0;
          const k = 1 + hashf(board, seed) * 0.12 - 0.06;
          const grain = Math.sin(b * 0.4 + board * 3 + Math.sin(a * 0.9) * 0.8) > 0.85;
          const seam = a % 8 === 7;
          const off = (board % 2) * 16;
          const butt = !vert && (b + off) % 32 === 0;
          T.set(xx, y, seam || butt ? mul(Bc, 0.75) : mul(grain ? Bc : A, k));
        }
      if (x.p === 'bench') {
        for (let i = 0; i < 32; i++) {
          T.set(i, 15, Bc);
          T.set(15, i, Bc);
        }
        T.rect(4, 4, 7, 2, C);
        T.rect(20, 20, 2, 8, C);
        T.rect(18, 20, 6, 2, mul(C, 0.8));
      } else if (x.p === 'door') {
        T.rect(0, 0, 32, 2, Bc);
        T.rect(0, 30, 32, 2, Bc);
        T.rect(0, 0, 2, 32, Bc);
        T.rect(30, 0, 2, 32, Bc);
        T.rect(8, 5, 16, 9, [190, 230, 255]);
        T.rect(15, 5, 2, 9, Bc);
        T.disc(25, 18, 1.6, C);
      } else if (x.p === 'chestf') {
        T.rect(0, 12, 32, 3, C);
        T.rect(13, 11, 6, 8, Bc);
        T.rect(15, 14, 2, 3, mul(C, 0.6));
      }
      break;
    }
    case 'leaves': {
      T.clear();
      for (let i = 0; i < 70; i++) {
        const cx = r() * 32;
        const cy = r() * 32;
        const rr = 1.3 + r() * 2;
        T.disc(cx, cy, rr, mix(A, r() < 0.5 ? Bc : C, r() * 0.8));
        T.disc(cx - rr * 0.3, cy - rr * 0.3, rr * 0.4, mix(A, [255, 255, 255], 0.25), 0.8);
      }
      break;
    }
    case 'bamboo':
      T.fill(A, 0.05);
      for (const cx of [0, 16]) {
        T.line(cx, 0, cx, 31, mul(Bc, 0.8));
        T.line(cx + 3, 0, cx + 3, 31, C, 0.4);
      }
      for (const cy of [6, 22]) T.rect(0, cy, 32, 2, Bc);
      break;
    case 'hay':
    case 'thatch': {
      T.fill(A, 0.08);
      for (let i = 0; i < 120; i++) {
        const px = r() * 32;
        const py = r() * 32;
        const l = 3 + r() * 5;
        if (x.p === 'hay') T.line(px, py, px + l, py + (r() - 0.5), r() < 0.5 ? Bc : C, 0.7);
        else T.line(px, py, px + l * 0.4, py + l, r() < 0.5 ? Bc : C, 0.7);
      }
      if (x.p === 'hay') {
        T.rect(0, 7, 32, 2, mul(Bc, 0.7));
        T.rect(0, 23, 32, 2, mul(Bc, 0.7));
      }
      break;
    }
    case 'cap':
      T.shade(A, 0.12, 3, seed, 0.04);
      for (let i = 0; i < 7; i++) T.disc(r() * 32, r() * 32, 1.8 + r() * 2.2, Bc);
      break;
    case 'bricks': {
      for (let y = 0; y < 32; y++)
        for (let xx = 0; xx < 32; xx++) {
          const row = (y / 8) | 0;
          const off = (row % 2) * 8;
          const bx = ((xx + off) / 16) | 0;
          const mortar = y % 8 === 7 || (xx + off) % 16 === 15;
          const k = 1 + hashf(row * 7 + bx, seed) * 0.16 - 0.08;
          T.set(xx, y, mortar ? Bc : mul(y % 8 === 0 ? mix(A, C, 0.5) : A, k + (r() - 0.5) * 0.08));
        }
      break;
    }
    case 'tiles':
    case 'checker':
    case 'mosaic': {
      const cell = x.p === 'mosaic' ? 8 : 16;
      for (let y = 0; y < 32; y++)
        for (let xx = 0; xx < 32; xx++) {
          const cx = (xx / cell) | 0;
          const cy = (y / cell) | 0;
          const grout = xx % cell === cell - 1 || y % cell === cell - 1;
          let c = A;
          if (x.p === 'checker') c = (cx + cy) % 2 ? Bc : A;
          else if (x.p === 'mosaic') c = [A, Bc, C][(hashf(cx + cy * 4, seed) * 3) | 0];
          const gloss = xx % cell < 3 && y % cell < 3;
          T.set(xx, y, grout ? (x.p === 'tiles' ? Bc : [230, 230, 236]) : gloss ? mix(c, [255, 255, 255], 0.3) : mul(c, 1 + (r() - 0.5) * 0.04));
        }
      break;
    }
    case 'roof': {
      for (let y = 0; y < 32; y++)
        for (let xx = 0; xx < 32; xx++) {
          const row = (y / 8) | 0;
          const off = (row % 2) * 4;
          const lx = (xx + off) % 8;
          const ly = y % 8;
          const arc = Math.hypot(lx - 3.5, ly - 8) > 7.6;
          T.set(xx, y, arc || ly === 7 ? mul(Bc, 0.85) : mul(ly < 2 ? C : A, 1 + (r() - 0.5) * 0.06));
        }
      break;
    }
    case 'panel':
      T.fill(A, 0.03);
      T.rect(0, 0, 32, 2, C);
      T.rect(0, 0, 2, 32, C);
      T.rect(0, 30, 32, 2, Bc);
      T.rect(30, 0, 2, 32, Bc);
      T.rect(6, 6, 20, 1, Bc);
      T.rect(6, 6, 1, 20, Bc);
      T.rect(6, 25, 20, 1, C);
      T.rect(25, 6, 1, 20, C);
      break;
    case 'glass':
      T.fill(A, 0, 0.18);
      for (let i = 0; i < 32; i++) {
        T.set(i, 0, C, 0.9);
        T.set(0, i, C, 0.9);
        T.set(i, 31, C, 0.9);
        T.set(31, i, C, 0.9);
      }
      T.line(7, 22, 20, 9, Bc, 0.7);
      T.line(10, 24, 23, 11, Bc, 0.5);
      break;
    case 'ice':
      T.fill(A, 0.04, 0.6);
      for (let i = 0; i < 8; i++) {
        const px = r() * 32;
        const py = r() * 32;
        T.line(px, py, px + (r() - 0.5) * 14, py + (r() - 0.5) * 14, C, 0.6);
      }
      for (let i = 0; i < 5; i++) T.disc(r() * 32, r() * 32, 1, [255, 255, 255], 0.7);
      break;
    case 'weave':
      for (let y = 0; y < 32; y++)
        for (let xx = 0; xx < 32; xx++) {
          const ux = (xx / 4) | 0;
          const uy = (y / 4) | 0;
          const over = (ux + uy) % 2 === 0;
          const t = over ? (xx % 4) / 3 : (y % 4) / 3;
          T.set(xx, y, mul(A, 0.86 + Math.sin(t * Math.PI) * 0.14 + (r() - 0.5) * 0.03));
        }
      break;
    case 'lamp':
      for (let y = 0; y < 32; y++)
        for (let xx = 0; xx < 32; xx++) {
          const d = Math.hypot(xx - 15.5, y - 15.5) / 16;
          T.set(xx, y, mix(C, A, Math.min(1, d * 1.2)));
        }
      for (let i = 0; i < 32; i++) {
        T.set(i, 0, Bc);
        T.set(0, i, Bc);
        T.set(i, 31, Bc);
        T.set(31, i, Bc);
        T.set(i, 1, Bc, 0.5);
        T.set(1, i, Bc, 0.5);
      }
      break;
    case 'furnace': {
      T.shade(A, 0.2, 3, seed, 0.06);
      for (let i = 0; i < 32; i += 8) T.rect(0, i, 32, 1, mul(A, 0.75));
      T.rect(7, 14, 18, 13, C);
      for (let y = 0; y < 10; y++) for (let xx = 0; xx < 16; xx++) if (r() < 0.6 - y * 0.05) T.set(8 + xx, 26 - y, mix(Bc, [255, 220, 120], r() * 0.6));
      T.rect(5, 12, 22, 2, mul(A, 0.6));
      break;
    }
    case 'rail':
    case 'railx': {
      T.clear();
      const ties = (i: number) => (x.p === 'rail' ? T.rect(2, i, 28, 3, Bc) : T.rect(i, 2, 3, 28, Bc));
      for (const i of [2, 10, 18, 26]) ties(i);
      if (x.p === 'rail') {
        T.rect(7, 0, 3, 32, A);
        T.rect(22, 0, 3, 32, A);
        T.rect(7, 0, 1, 32, C);
        T.rect(22, 0, 1, 32, C);
      } else {
        T.rect(0, 7, 32, 3, A);
        T.rect(0, 22, 32, 3, A);
        T.rect(0, 7, 32, 1, C);
        T.rect(0, 22, 32, 1, C);
      }
      break;
    }
    case 'ladder':
      T.clear();
      T.rect(3, 0, 4, 32, A);
      T.rect(25, 0, 4, 32, A);
      T.rect(3, 0, 1, 32, Bc);
      T.rect(25, 0, 1, 32, Bc);
      for (const y of [4, 12, 20, 28]) T.rect(3, y, 26, 3, mix(A, Bc, 0.3));
      break;
    case 'bed':
      T.fill(A, 0.03);
      for (let y = 0; y < 32; y += 6) T.rect(0, y, 32, 1, mul(A, 0.85));
      T.rect(0, 0, 32, 9, Bc);
      T.rect(0, 9, 32, 1, mul(Bc, 0.8));
      break;
    case 'cactus':
      T.fill(A, 0.05);
      for (const cx of [3, 11, 19, 27]) T.rect(cx, 0, 2, 32, Bc);
      for (let i = 0; i < 14; i++) T.set(((r() * 4) | 0) * 8 + 6, r() * 32, C);
      break;
    /* ------------------- sprites de planta (fundo transparente) ------------------- */
    case 'sp_grass':
    case 'sp_tall': {
      T.clear();
      const tall = x.p === 'sp_tall';
      for (let i = 0; i < (tall ? 14 : 16); i++) {
        const bx = 3 + r() * 26;
        const h = tall ? 18 + r() * 13 : 8 + r() * 16;
        const lean = (r() - 0.5) * 8;
        const c = r() < 0.5 ? A : Bc;
        T.line(bx, 31, bx + lean, 31 - h, c);
        T.line(bx + 1, 31, bx + lean + 0.5, 31 - h + 2, c);
        if (tall && r() < 0.5) T.disc(bx + lean, 31 - h, 1.3, C);
      }
      break;
    }
    case 'sp_flower': {
      T.clear();
      for (let i = 0; i < 3; i++) {
        const bx = 7 + i * 9 + r() * 3;
        const top = 8 + r() * 9;
        T.line(bx, 31, bx + (r() - 0.5) * 3, top, A);
        T.line(bx, 26, bx - 3, 23, A);
        for (let k = 0; k < 5; k++) {
          const ang = (k / 5) * Math.PI * 2;
          T.disc(bx + Math.cos(ang) * 2.4, top + Math.sin(ang) * 2.4, 1.6, Bc);
        }
        T.disc(bx, top, 1.3, C);
      }
      break;
    }
    case 'sp_fern':
      T.clear();
      for (let i = 0; i < 5; i++) {
        const ang = -Math.PI / 2 + (i - 2) * 0.45;
        const ex = 16 + Math.cos(ang) * 15;
        const ey = 31 + Math.sin(ang) * 26;
        T.line(16, 31, ex, ey, Bc);
        for (let k = 1; k < 9; k++) {
          const px = 16 + ((ex - 16) * k) / 9;
          const py = 31 + ((ey - 31) * k) / 9;
          T.line(px, py, px - 3, py - 2, A);
          T.line(px, py, px + 3, py - 2, C);
        }
      }
      break;
    case 'sp_reed':
      T.clear();
      for (let i = 0; i < 6; i++) {
        const bx = 4 + r() * 24;
        const h = 18 + r() * 12;
        T.line(bx, 31, bx + (r() - 0.5) * 3, 31 - h, r() < 0.5 ? A : Bc);
        if (r() < 0.6) T.rect(bx - 1, 31 - h, 3, 6, C);
      }
      break;
    case 'sp_mush':
      T.clear();
      for (const [bx, s] of [
        [10, 1],
        [22, 0.7],
      ]) {
        T.rect(bx - 2 * s, 31 - 12 * s, 4 * s + 1, 12 * s + 1, C);
        for (let y = 0; y < 8 * s; y++) {
          const w = Math.sqrt(1 - (y / (8 * s)) ** 2) * 8 * s;
          T.rect(bx - w, 31 - 12 * s - y, w * 2 + 1, 1, A);
        }
        T.disc(bx - 3 * s, 31 - 15 * s, 1.3 * s, Bc);
        T.disc(bx + 3 * s, 31 - 17 * s, 1.1 * s, Bc);
      }
      break;
    case 'sp_bush':
      T.clear();
      for (let i = 0; i < 9; i++) {
        let px = 16;
        let py = 31;
        for (let k = 0; k < 4; k++) {
          const nx = px + (r() - 0.5) * 12;
          const ny = py - 3 - r() * 5;
          T.line(px, py, nx, ny, k < 2 ? Bc : A);
          px = nx;
          py = ny;
        }
        T.set(px, py, C);
      }
      break;
    case 'sp_sprout':
      T.clear();
      T.line(16, 31, 16, 12, Bc);
      T.line(17, 31, 17, 12, Bc);
      for (const [px, py, s] of [
        [11, 15, 1],
        [21, 13, 1],
        [16, 9, 1.2],
        [12, 22, 0.8],
        [20, 21, 0.8],
      ]) {
        T.disc(px, py, 3.2 * s, A);
        T.disc(px - 1, py - 1, 1.3 * s, C);
      }
      break;
    case 'sp_vine':
      T.clear();
      for (let i = 0; i < 5; i++) {
        const bx = 3 + i * 6 + r() * 3;
        const l = 14 + r() * 17;
        for (let y = 0; y < l; y++) T.set(bx + Math.sin(y * 0.4 + i) * 1.5, y, Bc);
        for (let y = 2; y < l; y += 4) T.disc(bx + Math.sin(y * 0.4 + i) * 1.5 + (y % 8 ? 2 : -2), y, 1.6, r() < 0.5 ? A : C);
      }
      break;
    case 'sp_lichen':
      T.clear();
      for (let i = 0; i < 14; i++) T.disc(4 + r() * 24, 22 + r() * 9, 1.2 + r() * 2, r() < 0.4 ? C : r() < 0.5 ? A : Bc);
      for (let i = 0; i < 5; i++) {
        const bx = 6 + r() * 20;
        T.line(bx, 31, bx, 22 - r() * 6, Bc);
        T.disc(bx, 20 - r() * 4, 1.4, Bc);
      }
      break;
    case 'sp_coral':
      T.clear();
      for (let i = 0; i < 5; i++) {
        let px = 10 + r() * 12;
        let py = 31;
        for (let k = 0; k < 5; k++) {
          const nx = px + (r() - 0.5) * 8;
          const ny = py - 3 - r() * 4;
          T.line(px, py, nx, ny, A);
          T.line(px + 1, py, nx + 1, ny, Bc);
          px = nx;
          py = ny;
        }
        T.disc(px, py, 1.4, C);
      }
      break;
  }
}

/* ------------------------------ montagem ------------------------------ */
export interface Atlas {
  /** vai para a GPU (detalhe codificado nos ladrilhos dos macios) */
  canvas: HTMLCanvasElement;
  /** cores reais por ladrilho (ícones) */
  colorCanvas: HTMLCanvasElement;
  /** cor média de cada ladrilho (sRGB 0..255) e cobertura alfa */
  avg: Float32Array;
  ms: number;
}

let cached: Atlas | null = null;

const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toSrgb = (l: number) => (l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055);

/** gera (uma vez) o atlas 512×512 */
export function buildAtlas(): Atlas {
  if (cached) return cached;
  const t0 = performance.now();
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = c.height = ATLAS_SIZE;
    return c;
  };
  const colorCanvas = mk();
  const canvas = mk();
  const cx = colorCanvas.getContext('2d')!;
  const gx = canvas.getContext('2d')!;
  const avg = new Float32Array(TILES.length * 4);
  const img = cx.createImageData(TILE, TILE);
  const img2 = gx.createImageData(TILE, TILE);
  TILES.forEach((tx, i) => {
    const T = new Tile(i + 1);
    paint(T, tx, i + 1);
    const base = rgb(tx.a).map((v) => Math.max(0.02, toLin(v / 255)));
    const det = TILE_DETAIL[i] === 1;
    let sr = 0;
    let sg = 0;
    let sb = 0;
    let sa = 0;
    for (let p = 0; p < TILE * TILE; p++) {
      const o = p * 4;
      const r = Math.max(0, Math.min(255, T.d[o]));
      const g = Math.max(0, Math.min(255, T.d[o + 1]));
      const b = Math.max(0, Math.min(255, T.d[o + 2]));
      const a = Math.max(0, Math.min(1, T.d[o + 3]));
      img.data[o] = r;
      img.data[o + 1] = g;
      img.data[o + 2] = b;
      img.data[o + 3] = a * 255;
      sr += r * a;
      sg += g * a;
      sb += b * a;
      sa += a;
      if (det) {
        // detalhe = cor/base (linear) × 0,5, gravado em sRGB (a GPU decodifica de volta)
        const d = (v: number, k: number) => Math.round(toSrgb(Math.min(1, (toLin(v / 255) / base[k]) * 0.5)) * 255);
        img2.data[o] = d(r, 0);
        img2.data[o + 1] = d(g, 1);
        img2.data[o + 2] = d(b, 2);
      } else {
        img2.data[o] = r;
        img2.data[o + 1] = g;
        img2.data[o + 2] = b;
      }
      img2.data[o + 3] = a * 255;
    }
    const x = (i % ATLAS_COLS) * TILE;
    const y = Math.floor(i / ATLAS_COLS) * TILE;
    cx.putImageData(img, x, y);
    gx.putImageData(img2, x, y);
    avg[i * 4] = sa ? sr / sa : 0;
    avg[i * 4 + 1] = sa ? sg / sa : 0;
    avg[i * 4 + 2] = sa ? sb / sa : 0;
    avg[i * 4 + 3] = sa / (TILE * TILE);
  });
  cached = { canvas, colorCanvas, avg, ms: performance.now() - t0 };
  return cached;
}
