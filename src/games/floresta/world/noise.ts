/* ============================================================
 *  MUNDO ABERTO — ruído determinístico (sem tabelas, sem alocação).
 *  hash 2D inteiro → ruído de valor suave → fbm / ridged.
 * ============================================================ */

/** hash inteiro de (x, z, semente) → [0, 1) */
export function hash2(x: number, z: number, seed: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(seed | 0, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** ruído de valor suave (quíntico) em [0, 1) */
export function vnoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

/** soma fractal normalizada em [0, 1) */
export function fbm(x: number, z: number, seed: number, oct = 4): number {
  let s = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    s += vnoise(x, z, seed + i * 101) * amp;
    norm += amp;
    amp *= 0.5;
    // rotação leve entre oitavas: esconde a grade
    const nx = x * 1.6 + z * 1.2;
    z = z * 1.6 - x * 1.2;
    x = nx;
  }
  return s / norm;
}

/** cristas (montanhas): 1 nas cristas, 0 nos vales */
export function ridged(x: number, z: number, seed: number, oct = 4): number {
  let s = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    const n = 1 - Math.abs(vnoise(x, z, seed + i * 57) * 2 - 1);
    s += n * n * amp;
    norm += amp;
    amp *= 0.5;
    const nx = x * 1.9 + z * 0.9;
    z = z * 1.9 - x * 0.9;
    x = nx;
  }
  return s / norm;
}

export const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
