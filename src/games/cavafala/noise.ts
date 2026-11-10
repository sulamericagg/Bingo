/* ============================================================
 *  CAVA & FALA — ruído determinístico (sem tabelas, sem alocação).
 *  hash inteiro → ruído de valor suave 2D/3D → fbm. RNG semeado.
 * ============================================================ */

export function hash3(x: number, y: number, z: number, seed: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 1103515245) + Math.imul(z | 0, 668265263) + Math.imul(seed | 0, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

export function noise2(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const ux = fade(x - ix);
  const uz = fade(z - iz);
  const a = hash3(ix, 0, iz, seed);
  const b = hash3(ix + 1, 0, iz, seed);
  const c = hash3(ix, 0, iz + 1, seed);
  const d = hash3(ix + 1, 0, iz + 1, seed);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

export function noise3(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const ux = fade(x - ix);
  const uy = fade(y - iy);
  const uz = fade(z - iz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c000 = hash3(ix, iy, iz, seed);
  const c100 = hash3(ix + 1, iy, iz, seed);
  const c010 = hash3(ix, iy + 1, iz, seed);
  const c110 = hash3(ix + 1, iy + 1, iz, seed);
  const c001 = hash3(ix, iy, iz + 1, seed);
  const c101 = hash3(ix + 1, iy, iz + 1, seed);
  const c011 = hash3(ix, iy + 1, iz + 1, seed);
  const c111 = hash3(ix + 1, iy + 1, iz + 1, seed);
  return l(l(l(c000, c100, ux), l(c010, c110, ux), uy), l(l(c001, c101, ux), l(c011, c111, ux), uy), uz);
}

export function fbm2(x: number, z: number, seed: number, oct = 4): number {
  let s = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    s += noise2(x, z, seed + i * 101) * amp;
    norm += amp;
    amp *= 0.5;
    const nx = x * 1.6 + z * 1.2;
    z = z * 1.6 - x * 1.2;
    x = nx;
  }
  return s / norm;
}

/** gerador pseudo-aleatório semeado (mulberry32) */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
