/* ============================================================
 *  RALLY LUNAR — relevo procedural (ruído suave determinístico)
 *  Unidades em metros, y para CIMA. Pedaços (chunks) guardam um Path2D
 *  pronto para desenhar e são reciclados quando ficam para trás.
 * ============================================================ */
import { ZONES, ZONE_LEN, type ZoneDef } from './data';

export const CHUNK_LEN = 32; // m
export const STEP = 0.5; // m entre amostras
const N = CHUNK_LEN / STEP;
const FLAT_START = 24;

function hash(i: number, seed: number): number {
  let h = (i * 374761393 + seed * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** ruído de valor 1D com interpolação suave (cosseno) */
function vnoise(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hash(i, seed);
  const b = hash(i + 1, seed);
  return a + (b - a) * u; // 0..1
}

const TRANS = 70; // m de mistura entre zonas

export class Terrain {
  seed: number;
  chunks = new Map<number, Chunk>();
  private pool: Chunk[] = [];
  constructor(seed: number) {
    this.seed = seed | 0;
  }

  /** pesos de oitavas no ponto x (mistura entre zonas na fronteira) */
  private w = [0, 0, 0, 0];
  private weights(x: number): number[] {
    const zi = Math.max(0, Math.floor(x / ZONE_LEN));
    const local = x - zi * ZONE_LEN;
    const za = ZONES[zi % ZONES.length].oct;
    const w = this.w;
    if (local < TRANS && zi > 0) {
      const zb = ZONES[(zi - 1) % ZONES.length].oct;
      const k = local / TRANS;
      const s = k * k * (3 - 2 * k);
      for (let i = 0; i < 4; i++) w[i] = zb[i] + (za[i] - zb[i]) * s;
    } else for (let i = 0; i < 4; i++) w[i] = za[i];
    return w;
  }

  /** altura do chão em x (m) */
  height(x: number): number {
    if (x < 0) return 0;
    const s = this.seed;
    const w = this.weights(x);
    const diff = Math.min(1.7, 0.55 + x / 1400);
    let h = (vnoise(x / 46, s) - 0.5) * 22 * w[0];
    h += (vnoise(x / 17, s + 7) - 0.5) * 9 * w[1] * diff;
    h += (vnoise(x / 5.5, s + 13) - 0.5) * 2.2 * w[2] * diff;
    if (w[3] > 0) {
      // crateras: tigelas espaçadas ~30 m
      const cell = Math.floor(x / 30);
      const r = hash(cell, s + 99);
      if (r > 0.35) {
        const cx = cell * 30 + 15;
        const rad = 6 + r * 6;
        const d = (x - cx) / rad;
        if (d > -1.25 && d < 1.25) {
          const bowl = d * d < 1 ? -(1 - d * d) * (1.6 + r * 1.4) : 0;
          const rim = Math.exp(-((Math.abs(d) - 1.05) ** 2) * 30) * 0.9;
          h += (bowl + rim) * w[3] * diff;
        }
      }
    }
    // começo plano e suave
    if (x < FLAT_START + 30) {
      const k = Math.max(0, (x - FLAT_START) / 30);
      h *= k * k * (3 - 2 * k);
    }
    return h;
  }

  slope(x: number): number {
    return (this.height(x + 0.1) - this.height(x - 0.1)) / 0.2;
  }

  zone(x: number): ZoneDef {
    return ZONES[Math.max(0, Math.floor(x / ZONE_LEN)) % ZONES.length];
  }

  /** garante pedaços entre x0 e x1, recicla os de fora */
  ensure(x0: number, x1: number): void {
    const a = Math.floor(x0 / CHUNK_LEN);
    const b = Math.floor(x1 / CHUNK_LEN);
    for (const [k, c] of this.chunks) {
      if (k < a - 1 || k > b + 1) {
        this.chunks.delete(k);
        this.pool.push(c);
      }
    }
    for (let k = a; k <= b; k++) {
      if (!this.chunks.has(k)) {
        const c = this.pool.pop() ?? new Chunk();
        c.build(this, k);
        this.chunks.set(k, c);
      }
    }
  }
}

export class Chunk {
  idx = 0;
  x0 = 0;
  hs = new Float32Array(N + 1);
  fill: Path2D | null = null;
  edge: Path2D | null = null;
  zone: ZoneDef = ZONES[0];
  minH = 0;

  build(t: Terrain, idx: number): void {
    this.idx = idx;
    this.x0 = idx * CHUNK_LEN;
    let mn = 1e9;
    for (let i = 0; i <= N; i++) {
      const h = t.height(this.x0 + i * STEP);
      this.hs[i] = h;
      if (h < mn) mn = h;
    }
    this.minH = mn;
    this.zone = t.zone(this.x0 + CHUNK_LEN * 0.5);
    // Path2D em metros com y para cima (o desenho aplica escala -y)
    const f = new Path2D();
    const e = new Path2D();
    f.moveTo(this.x0 - 0.05, mn - 80);
    for (let i = 0; i <= N; i++) {
      const x = this.x0 + i * STEP;
      f.lineTo(x + (i === N ? 0.05 : 0), this.hs[i]);
      if (i === 0) e.moveTo(x, this.hs[i]);
      else e.lineTo(x, this.hs[i]);
    }
    f.lineTo(this.x0 + CHUNK_LEN + 0.05, mn - 80);
    f.closePath();
    this.fill = f;
    this.edge = e;
  }
}
