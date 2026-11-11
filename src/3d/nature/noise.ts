/* ============================================================
 *  NATUREZA — ruído determinístico barato (sem tabelas, sem alocar).
 * ============================================================ */

/** hash inteiro → 0..1 */
export function hash3(x: number, y: number, z: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function hash2(x: number, y: number, s = 0): number {
  return hash3(x, y, s * 7919 + 13);
}

const fade = (t: number) => t * t * (3 - 2 * t);

/** ruído de valor 2D suave 0..1 */
export function vnoise2(x: number, y: number, s = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = fade(x - xi);
  const fy = fade(y - yi);
  const a = hash2(xi, yi, s);
  const b = hash2(xi + 1, yi, s);
  const c = hash2(xi, yi + 1, s);
  const d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** ruído de valor 3D suave 0..1 */
export function vnoise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fx = fade(x - xi);
  const fy = fade(y - yi);
  const fz = fade(z - zi);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const v00 = l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), fx);
  const v10 = l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), fx);
  const v01 = l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), fx);
  const v11 = l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), fx);
  return l(l(v00, v10, fy), l(v01, v11, fy), fz);
}

/** fbm 2D de 2-3 oitavas, 0..1 */
export function fbm2(x: number, y: number, s = 0, oct = 3): number {
  let a = 0.5;
  let f = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += vnoise2(x * f, y * f, s + i * 31) * a;
    norm += a;
    a *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

/** gerador pseudo-aleatório determinístico */
export function rng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
