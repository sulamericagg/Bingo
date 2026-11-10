/**
 * CAÇA BLOOP — hashes e PRNG determinísticos (iguais em todo aparelho/navegador).
 * Semente de 64 bits = dois uint32 (hi, lo), escrita como 16 dígitos hex.
 */

/** Finalizador do murmur3 (avalanche em 32 bits). */
export function fmix(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** FNV-1a de uma string → uint32 com avalanche. */
export function hashStr(s: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return fmix(h);
}

/** Combina números/strings num uint32. */
export function hashN(...parts: (number | string)[]): number {
  let h = 0x9e3779b9;
  for (const p of parts) {
    const v = typeof p === 'string' ? hashStr(p) : p >>> 0;
    h = fmix((h ^ v) + 0x7f4a7c15 + (h << 6) + (h >>> 2));
  }
  return h;
}

export interface Seed64 {
  hi: number;
  lo: number;
}

export const seedHex = (s: Seed64): string => (s.hi >>> 0).toString(16).padStart(8, '0') + (s.lo >>> 0).toString(16).padStart(8, '0');
export function parseSeed(hex: string): Seed64 {
  const h = hex.replace(/[^0-9a-f]/gi, '').padStart(16, '0').slice(-16);
  return { hi: parseInt(h.slice(0, 8), 16) >>> 0, lo: parseInt(h.slice(8), 16) >>> 0 };
}
export function seedFrom(...parts: (number | string)[]): Seed64 {
  const hi = hashN(...parts, 'hi');
  const lo = hashN(...parts, 'lo');
  return { hi, lo };
}

/** sfc32: PRNG rápido e de boa qualidade, 128 bits de estado. */
export function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export class Rng {
  readonly next: () => number;
  constructor(s: Seed64, stream = 0) {
    this.next = sfc32(s.hi ^ 0xa5a5a5a5, s.lo, fmix(s.hi + stream), fmix(s.lo ^ (stream * 0x9e3779b9)));
    for (let i = 0; i < 12; i++) this.next();
  }
  /** [a, b) */
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  /** escolhe por pesos ([item, peso][]) */
  weighted<T>(items: readonly (readonly [T, number])[]): T {
    let sum = 0;
    for (const [, w] of items) sum += Math.max(0, w);
    let r = this.next() * sum;
    for (const [v, w] of items) {
      r -= Math.max(0, w);
      if (r <= 0) return v;
    }
    return items[items.length - 1][0];
  }
}
