/* ============================================================
 *  BLOOP PINK — texturas procedurais realistas (canvas, uma vez, repetem sem emenda).
 *  Cada textura gera cor + altura → mapa de normais (Sobel) + rugosidade, para
 *  MeshStandardMaterial. AO "assado" nas juntas/rejuntes (escurece a cor nas frestas).
 *  Mesma abordagem da natureza (src/3d/nature/textures.ts): ruído periódico + desenho em canvas.
 * ============================================================ */
import * as THREE from 'three';
import { hash2 } from '../../3d/nature/noise';
import { brandCanvas, drawBrandLogo, PINK } from './brand';

export type TexId =
  | 'tile'
  | 'terrazzo'
  | 'wood'
  | 'marble'
  | 'concrete'
  | 'concreteBroken'
  | 'plaster'
  | 'plasterDirty'
  | 'brick'
  | 'sidewalk'
  | 'asphalt'
  | 'cardboard'
  | 'ceiling'
  | 'metal'
  | 'woodLight'
  | 'fabric'
  | 'shutter';

export interface TexSet {
  map: THREE.Texture;
  normal: THREE.Texture | null;
  rough: THREE.Texture | null;
  /** metros cobertos por uma repetição */
  meters: number;
}

let S = 512;
/** tamanho pelo nível de qualidade (0..3) */
export function setTexQuality(tier: number): void {
  S = tier <= 0 ? 256 : tier === 1 ? 384 : 512;
}

/* ------------------------------ ruído periódico ------------------------------ */
function pn(x: number, y: number, per: number, seed: number): number {
  const px = (x / S) * per;
  const py = (y / S) * per;
  const xi = Math.floor(px);
  const yi = Math.floor(py);
  const fx = px - xi;
  const fy = py - yi;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const hh = (i: number, j: number) => hash2(((i % per) + per) % per, ((j % per) + per) % per, seed);
  const a = hh(xi, yi);
  const b = hh(xi + 1, yi);
  const c = hh(xi, yi + 1);
  const d = hh(xi + 1, yi + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm(x: number, y: number, seed: number, base = 4, oct = 4): number {
  let v = 0;
  let a = 0.5;
  let p = base;
  let n = 0;
  for (let i = 0; i < oct; i++) {
    v += pn(x, y, p, seed + i * 11) * a;
    n += a;
    a *= 0.5;
    p *= 2;
  }
  return v / n;
}
function rnd(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type RGB = [number, number, number];
const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

interface Gen {
  /** cor RGB 0..255 */
  col: Float32Array;
  /** altura 0..1 */
  ht: Float32Array;
  /** rugosidade 0..1 */
  ro: Float32Array;
}
function newGen(): Gen {
  const n = S * S;
  return { col: new Float32Array(n * 3), ht: new Float32Array(n).fill(0.5), ro: new Float32Array(n).fill(0.6) };
}
function each(_g: Gen, f: (i: number, j: number, o: number) => void): void {
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) f(i, j, j * S + i);
}
function setC(g: Gen, o: number, c: RGB): void {
  g.col[o * 3] = c[0];
  g.col[o * 3 + 1] = c[1];
  g.col[o * 3 + 2] = c[2];
}
function mulC(g: Gen, o: number, k: number): void {
  g.col[o * 3] *= k;
  g.col[o * 3 + 1] *= k;
  g.col[o * 3 + 2] *= k;
}

/* ------------------------------ geradores ------------------------------ */
/** porcelanato 60×60 com rejunte; 2 placas por repetição (1,2 m) */
function genTile(g: Gen, a: string, b: string, grout: string, n = 2, seed = 1): void {
  const A = hex(a);
  const B = hex(b);
  const G = hex(grout);
  const cell = S / n;
  const gw = Math.max(1.5, S / 260);
  each(g, (i, j, o) => {
    const ci = Math.floor(i / cell);
    const cj = Math.floor(j / cell);
    const lx = i - ci * cell;
    const ly = j - cj * cell;
    const edge = Math.min(lx, ly, cell - lx, cell - ly);
    const tone = hash2(ci, cj, seed) * 0.5;
    const nz = fbm(i, j, seed + 3, 3, 4);
    let c = mix(A, B, Math.min(1, tone + nz * 0.6));
    // veio suave do porcelanato
    const vein = Math.abs(Math.sin((i * 0.7 + j * 0.3) / S * 12 + fbm(i, j, seed + 9, 2, 3) * 9));
    c = mix(c, B, (1 - Math.min(1, vein * 4)) * 0.25);
    if (edge < gw) {
      setC(g, o, G);
      g.ht[o] = 0.1;
      g.ro[o] = 0.9;
    } else {
      // AO no rejunte + bisel
      const k = edge < gw * 3 ? 0.9 + ((edge - gw) / (gw * 2)) * 0.1 : 1;
      setC(g, o, c);
      mulC(g, o, k);
      g.ht[o] = edge < gw * 2.2 ? 0.5 + (edge - gw) / (gw * 1.2) * 0.3 : 0.8;
      g.ro[o] = 0.18 + nz * 0.12;
    }
  });
}
function genTerrazzo(g: Gen, seed = 5): void {
  const base = hex('#f3dfe4');
  const base2 = hex('#ead2d9');
  each(g, (i, j, o) => {
    const n = fbm(i, j, seed, 4, 4);
    setC(g, o, mix(base, base2, n));
    g.ht[o] = 0.6;
    g.ro[o] = 0.22;
  });
  // lascas
  const R = rnd(seed);
  const cols = ['#e48aa8', '#c8587e', '#ffffff', '#b0a0a8', '#f5b9c9', '#7a5060', '#e8c0a0'];
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const x = cv.getContext('2d')!;
  const N = Math.round(S * S * 0.0016);
  for (let k = 0; k < N; k++) {
    const px = R() * S;
    const py = R() * S;
    const r = 1 + R() * R() * S * 0.016;
    x.fillStyle = cols[Math.floor(R() * cols.length)];
    for (const ox of [-S, 0, S])
      for (const oy of [-S, 0, S]) {
        x.beginPath();
        const m = 5 + Math.floor(R() * 3);
        for (let q = 0; q < m; q++) {
          const a = (q / m) * Math.PI * 2;
          const rr = r * (0.6 + R() * 0.5);
          x.lineTo(px + ox + Math.cos(a) * rr, py + oy + Math.sin(a) * rr);
        }
        x.fill();
      }
  }
  const d = x.getImageData(0, 0, S, S).data;
  for (let o = 0; o < S * S; o++)
    if (d[o * 4 + 3] > 10) {
      setC(g, o, [d[o * 4], d[o * 4 + 1], d[o * 4 + 2]]);
      g.ht[o] = 0.62;
      g.ro[o] = 0.15;
    }
  // juntas grandes (placas 1,2 m)
  each(g, (i, j, o) => {
    if (i < 2 || j < 2) {
      mulC(g, o, 0.75);
      g.ht[o] = 0.3;
    }
  });
}
function genWood(g: Gen, a: string, b: string, planks = 6, seed = 7): void {
  const A = hex(a);
  const B = hex(b);
  const pw = S / planks;
  each(g, (i, j, o) => {
    const pi = Math.floor(i / pw);
    const off = hash2(pi, 0, seed) * S;
    const jj = (j + off) % S;
    // tábuas com comprimentos diferentes
    const lenN = 2 + Math.floor(hash2(pi, 1, seed) * 2);
    const seg = Math.floor((jj / S) * lenN);
    const segY = (jj / S) * lenN - seg;
    const tone = hash2(pi, seg + 7, seed);
    const lx = i - pi * pw;
    const grain = Math.sin((lx / pw) * 6 + fbm(i * 0.25, j * 4, seed + seg, 2, 3) * 14 + tone * 9);
    const n = fbm(i, j, seed + 2, 6, 3);
    let c = mix(A, B, 0.5 + grain * 0.22 + (tone - 0.5) * 0.5 + (n - 0.5) * 0.3);
    // nós
    const kx = pw * (0.3 + hash2(pi, seg, seed + 3) * 0.4);
    const ky = 0.5;
    const dk = Math.hypot(lx - kx, (segY - ky) * (S / lenN) * 0.5);
    if (hash2(pi, seg, seed + 5) > 0.6 && dk < pw * 0.12) c = mix(c, B, 0.6 - dk / (pw * 0.12) * 0.6);
    const edge = Math.min(lx, pw - lx);
    const endEdge = Math.min(segY, 1 - segY) * (S / lenN);
    if (edge < 1.2 || endEdge < 1) {
      c = mix(c, [40, 25, 15], 0.6);
      g.ht[o] = 0.2;
    } else g.ht[o] = 0.6 + grain * 0.05;
    setC(g, o, c);
    g.ro[o] = 0.38 + n * 0.15;
  });
}
function genMarble(g: Gen, seed = 11): void {
  const A = hex('#f4f1ee');
  const V = hex('#9a8f96');
  const P = hex('#e9d6dc');
  const cell = S / 2;
  each(g, (i, j, o) => {
    const t = fbm(i, j, seed, 3, 5);
    const v = Math.abs(Math.sin(((i + j * 0.6) / S) * 9 + t * 11));
    const v2 = Math.abs(Math.sin(((i * 0.3 - j) / S) * 5 + fbm(i, j, seed + 4, 4, 4) * 8));
    let c = mix(A, P, fbm(i, j, seed + 8, 2, 3) * 0.6);
    c = mix(c, V, Math.pow(1 - Math.min(1, v * 6), 3) * 0.7);
    c = mix(c, V, Math.pow(1 - Math.min(1, v2 * 10), 3) * 0.35);
    const lx = i % cell;
    const ly = j % cell;
    const e = Math.min(lx, ly);
    if (e < 1.2) {
      c = mix(c, [120, 110, 115], 0.6);
      g.ht[o] = 0.3;
    } else g.ht[o] = 0.7;
    setC(g, o, c);
    g.ro[o] = 0.08;
  });
}
function genConcrete(g: Gen, broken: boolean, seed = 13): void {
  const A = hex(broken ? '#8a8580' : '#b9b4ae');
  const B = hex(broken ? '#5e5a55' : '#a29c96');
  each(g, (i, j, o) => {
    const n = fbm(i, j, seed, 4, 5);
    const sp = hash2(i, j, seed + 1);
    let c = mix(A, B, n);
    if (sp > 0.985) c = mix(c, [60, 58, 55], 0.5);
    if (sp < 0.01) c = mix(c, [230, 228, 224], 0.4);
    // manchas (óleo, umidade)
    const st = fbm(i, j, seed + 5, 2, 3);
    if (broken && st > 0.62) c = mix(c, [55, 48, 40], (st - 0.62) * 2.2);
    setC(g, o, c);
    g.ht[o] = 0.5 + (n - 0.5) * 0.4 + (sp > 0.97 ? 0.1 : 0);
    g.ro[o] = broken ? 0.9 : 0.55 + n * 0.2;
  });
  if (broken) cracks(g, seed + 7, 6, 0.3, 0.6);
}
/** rachaduras (linhas ramificadas escuras e fundas) */
function cracks(g: Gen, seed: number, n: number, dark: number, wk = 1): void {
  const R = rnd(seed);
  for (let k = 0; k < n; k++) {
    let x = R() * S;
    let y = R() * S;
    let a = R() * Math.PI * 2;
    const len = S * (0.15 + R() * 0.35);
    for (let s = 0; s < len; s++) {
      a += (R() - 0.5) * 0.5;
      x += Math.cos(a);
      y += Math.sin(a);
      const w = (0.6 + (1 - s / len) * 0.9) * wk * (S / 512);
      for (let dy = -w; dy <= w; dy++)
        for (let dx = -w; dx <= w; dx++) {
          const ii = ((Math.round(x + dx) % S) + S) % S;
          const jj = ((Math.round(y + dy) % S) + S) % S;
          const o = jj * S + ii;
          const f = 1 - Math.hypot(dx, dy) / (w + 0.5);
          if (f <= 0) continue;
          mulC(g, o, 1 - dark * f);
          g.ht[o] = Math.min(g.ht[o], 0.5 - f * 0.4);
        }
      if (R() < 0.01) {
        // galho
        const b = { x, y, a: a + (R() - 0.5) * 2 };
        for (let q = 0; q < len * 0.3; q++) {
          b.a += (R() - 0.5) * 0.5;
          b.x += Math.cos(b.a);
          b.y += Math.sin(b.a);
          const ii = ((Math.round(b.x) % S) + S) % S;
          const jj = ((Math.round(b.y) % S) + S) % S;
          mulC(g, jj * S + ii, 1 - dark * 0.8);
          g.ht[jj * S + ii] = 0.2;
        }
      }
    }
  }
}
function genPlaster(g: Gen, dirty: boolean, seed = 17): void {
  each(g, (i, j, o) => {
    const n = fbm(i, j, seed, 8, 4);
    const fine = hash2(i, j, seed);
    const v = 238 + (n - 0.5) * 14 + (fine - 0.5) * 5;
    setC(g, o, [v, v - 1, v - 2]);
    g.ht[o] = 0.5 + (n - 0.5) * 0.25 + (fine - 0.5) * 0.05;
    g.ro[o] = 0.85;
  });
  if (!dirty) return;
  // encardido: umidade subindo do rodapé, escorridos verticais e manchas amareladas
  each(g, (i, j, o) => {
    const n = fbm(i, j, seed + 3, 3, 5);
    const n2 = fbm(i, j, seed + 11, 6, 3);
    const yk = j / S; // 0 topo .. 1 base (v de cima para baixo)
    const rise = Math.max(0, (yk - 0.62) / 0.38);
    const wave = 0.62 + Math.sin(i / S * Math.PI * 6 + n * 5) * 0.06;
    const damp = yk > wave ? Math.min(1, (yk - wave) * 6) * (0.45 + n * 0.5) : 0;
    const drip = Math.pow(Math.max(0, Math.sin((i / S) * Math.PI * 22 + fbm(i, 0, seed + 5, 8, 2) * 9)), 18) * fbm(i, j, seed + 6, 2, 3) * 0.5;
    const stain = n2 > 0.64 ? (n2 - 0.64) * 1.8 : 0;
    const k = damp * 0.55 + rise * 0.12 + drip + stain;
    const c: RGB = [g.col[o * 3], g.col[o * 3 + 1], g.col[o * 3 + 2]];
    setC(g, o, mix(c, [150, 132, 108], Math.min(0.6, k)));
    if (damp > 0.2 && Math.abs(yk - wave) < 0.004) mulC(g, o, 0.85);
    g.ro[o] = 0.9;
  });
  cracks(g, seed + 9, 5, 0.38, 0.35);
  // reboco caído: placas irregulares com tijolo e borda escura
  const R = rnd(seed + 2);
  for (let k = 0; k < 2; k++) {
    const cx = R() * S;
    const cy = S * (0.25 + R() * 0.55);
    const r = S * (0.05 + R() * 0.04);
    each(g, (i, j, o) => {
      let dx = Math.abs(i - cx);
      let dy = Math.abs(j - cy);
      dx = Math.min(dx, S - dx);
      dy = Math.min(dy, S - dy);
      if (dx > r * 2 || dy > r * 2) return;
      const d = Math.hypot(dx * 0.8, dy * 1.2) / r + (fbm(i, j, seed + k * 7, 16, 3) - 0.5) * 1.1;
      if (d < 1) {
        const row = Math.floor(j / (S / 48));
        const col = Math.floor((i + (row % 2) * (S / 40)) / (S / 20));
        const mortar = j % (S / 48) < 1.2 || (i + (row % 2) * (S / 40)) % (S / 20) < 1.2;
        const tone = hash2(col, row, 5);
        setC(g, o, mortar ? [176, 168, 158] : mix([176, 96, 74], [140, 74, 58], tone));
        g.ht[o] = mortar ? 0.2 : 0.32;
      } else if (d < 1.12) {
        mulC(g, o, 0.72);
        g.ht[o] = 0.62;
      }
    });
  }
}
function genBrick(g: Gen, seed = 19): void {
  const bh = S / 16;
  const bw = S / 6;
  each(g, (i, j, o) => {
    const row = Math.floor(j / bh);
    const off = (row % 2) * bw * 0.5;
    const col = Math.floor((i + off) / bw);
    const lx = (i + off) % bw;
    const ly = j % bh;
    const e = Math.min(lx, ly, bw - lx, bh - ly);
    const tone = hash2(col, row, seed);
    const n = fbm(i, j, seed + 1, 8, 3);
    let c = mix(hex('#b9654a'), hex('#8a4636'), tone * 0.7 + n * 0.3);
    if (e < 2) {
      c = hex('#cfc6bb');
      g.ht[o] = 0.2;
      g.ro[o] = 0.95;
    } else {
      if (e < 4) c = mix(c, [60, 30, 20], 0.15);
      g.ht[o] = 0.65 + (n - 0.5) * 0.1;
      g.ro[o] = 0.85;
    }
    setC(g, o, c);
  });
}
function genSidewalk(g: Gen, seed = 23): void {
  const cell = S / 3;
  each(g, (i, j, o) => {
    const ci = Math.floor(i / cell);
    const cj = Math.floor(j / cell);
    const lx = i % cell;
    const ly = j % cell;
    const e = Math.min(lx, ly, cell - lx, cell - ly);
    const n = fbm(i, j, seed, 6, 4);
    let c = mix(hex('#c9c3bb'), hex('#a8a29a'), n * 0.8 + hash2(ci, cj, seed) * 0.3);
    if (hash2(i, j, seed + 2) > 0.97) c = mix(c, [90, 90, 90], 0.4);
    if (e < 2) {
      c = mix(c, [70, 66, 60], 0.6);
      g.ht[o] = 0.15;
    } else g.ht[o] = 0.6 + (n - 0.5) * 0.2;
    setC(g, o, c);
    g.ro[o] = 0.85;
  });
}
function genAsphalt(g: Gen, seed = 29): void {
  each(g, (i, j, o) => {
    const n = fbm(i, j, seed, 8, 4);
    const s = hash2(i, j, seed);
    const v = 58 + n * 22 + (s > 0.93 ? 30 : 0) - (s < 0.05 ? 18 : 0);
    setC(g, o, [v, v, v + 2]);
    g.ht[o] = 0.5 + (s - 0.5) * 0.3;
    g.ro[o] = 0.92;
  });
}
function genCardboard(g: Gen, seed = 31): void {
  each(g, (i, j, o) => {
    const n = fbm(i, j, seed, 6, 4);
    const flute = Math.sin(j * 0.9) * 0.5 + 0.5;
    const c = mix(hex('#c99a62'), hex('#b0824e'), n * 0.8 + flute * 0.06);
    setC(g, o, c);
    g.ht[o] = 0.5 + flute * 0.05 + (n - 0.5) * 0.1;
    g.ro[o] = 0.9;
  });
}
function genCeiling(g: Gen, seed = 37): void {
  const cell = S / 2;
  each(g, (i, j, o) => {
    const lx = i % cell;
    const ly = j % cell;
    const e = Math.min(lx, ly, cell - lx, cell - ly);
    const s = hash2(i, j, seed);
    let v = 238 - (s > 0.8 ? 14 : 0) - fbm(i, j, seed, 8, 2) * 6;
    if (e < 3) {
      v = 210;
      g.ht[o] = 0.8;
    } else g.ht[o] = 0.5 - (s > 0.8 ? 0.08 : 0);
    setC(g, o, [v, v, v - 2]);
    g.ro[o] = 0.95;
  });
}
function genMetal(g: Gen, seed = 41): void {
  each(g, (i, j, o) => {
    const brush = fbm(i * 0.05, j * 3, seed, 4, 4);
    const v = 188 + brush * 40;
    setC(g, o, [v, v, v + 4]);
    g.ht[o] = 0.5 + brush * 0.05;
    g.ro[o] = 0.35 + brush * 0.15;
  });
}
function genFabric(g: Gen, seed = 43): void {
  each(g, (i, j, o) => {
    const w = ((i >> 1) + (j >> 1)) % 2 ? 1 : 0.9;
    const n = fbm(i, j, seed, 8, 3);
    const v = (220 + n * 30) * w;
    setC(g, o, [v, v, v]);
    g.ht[o] = 0.5 + w * 0.1;
    g.ro[o] = 0.95;
  });
}
function genShutter(g: Gen, seed = 47): void {
  const sh = S / 20;
  each(g, (i, j, o) => {
    const ly = j % sh;
    const prof = Math.sin((ly / sh) * Math.PI);
    const n = fbm(i, j, seed, 6, 3);
    const rust = fbm(i, j, seed + 3, 4, 4);
    let c = mix([150, 155, 162], [110, 114, 120], 1 - prof);
    if (rust > 0.62) c = mix(c, [140, 80, 50], (rust - 0.62) * 2);
    c = mix(c, [90, 90, 90], n * 0.2);
    setC(g, o, c);
    g.ht[o] = 0.3 + prof * 0.5;
    g.ro[o] = 0.5 + rust * 0.3;
  });
}

/* ------------------------------ saída ------------------------------ */
function toCanvas(g: Gen): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const x = cv.getContext('2d')!;
  const img = x.createImageData(S, S);
  const d = img.data;
  for (let o = 0; o < S * S; o++) {
    d[o * 4] = Math.max(0, Math.min(255, g.col[o * 3]));
    d[o * 4 + 1] = Math.max(0, Math.min(255, g.col[o * 3 + 1]));
    d[o * 4 + 2] = Math.max(0, Math.min(255, g.col[o * 3 + 2]));
    d[o * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return cv;
}
function normalCanvas(g: Gen, strength: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const x = cv.getContext('2d')!;
  const img = x.createImageData(S, S);
  const d = img.data;
  const H = g.ht;
  const at = (i: number, j: number) => H[(((j + S) % S) * S + ((i + S) % S)) | 0];
  for (let j = 0; j < S; j++)
    for (let i = 0; i < S; i++) {
      const dx = (at(i + 1, j) - at(i - 1, j)) * strength;
      const dy = (at(i, j + 1) - at(i, j - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const o = (j * S + i) * 4;
      d[o] = (-dx / l) * 127 + 128;
      d[o + 1] = (dy / l) * 127 + 128;
      d[o + 2] = (1 / l) * 127 + 128;
      d[o + 3] = 255;
    }
  x.putImageData(img, 0, 0);
  return cv;
}
function roughCanvas(g: Gen): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const x = cv.getContext('2d')!;
  const img = x.createImageData(S, S);
  const d = img.data;
  for (let o = 0; o < S * S; o++) {
    const v = Math.max(0, Math.min(255, g.ro[o] * 255));
    d[o * 4] = v; // R (ignorado)
    d[o * 4 + 1] = v; // G = rugosidade
    d[o * 4 + 2] = v;
    d[o * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return cv;
}

function tex(cv: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

const SPEC: Record<TexId, { gen: (g: Gen) => void; m: number; n: number; rough: boolean }> = {
  tile: { gen: (g) => genTile(g, '#f4f1ef', '#e3dcd9', '#c9c2bd'), m: 1.2, n: 2.5, rough: true },
  terrazzo: { gen: (g) => genTerrazzo(g), m: 1.6, n: 1.5, rough: false },
  wood: { gen: (g) => genWood(g, '#c08a5a', '#7a4f2e'), m: 1.4, n: 2, rough: true },
  woodLight: { gen: (g) => genWood(g, '#e8cfae', '#c49a70', 5, 9), m: 1.0, n: 1.5, rough: true },
  marble: { gen: (g) => genMarble(g), m: 1.6, n: 1, rough: false },
  concrete: { gen: (g) => genConcrete(g, false), m: 2.4, n: 1.5, rough: true },
  concreteBroken: { gen: (g) => genConcrete(g, true), m: 2.6, n: 4, rough: true },
  plaster: { gen: (g) => genPlaster(g, false), m: 2.0, n: 1.2, rough: false },
  plasterDirty: { gen: (g) => genPlaster(g, true), m: 3.0, n: 3, rough: false },
  brick: { gen: (g) => genBrick(g), m: 1.8, n: 3, rough: true },
  sidewalk: { gen: (g) => genSidewalk(g), m: 1.5, n: 3, rough: false },
  asphalt: { gen: (g) => genAsphalt(g), m: 3, n: 1.5, rough: false },
  cardboard: { gen: (g) => genCardboard(g), m: 0.6, n: 1, rough: false },
  ceiling: { gen: (g) => genCeiling(g), m: 1.2, n: 2, rough: false },
  metal: { gen: (g) => genMetal(g), m: 1, n: 0.6, rough: true },
  fabric: { gen: (g) => genFabric(g), m: 0.4, n: 1.2, rough: false },
  shutter: { gen: (g) => genShutter(g), m: 2, n: 4, rough: false },
};

/** gera (sem cache — quem chama guarda e libera) */
export function makeTex(id: TexId): TexSet {
  const sp = SPEC[id];
  const g = newGen();
  sp.gen(g);
  return {
    map: tex(toCanvas(g), true),
    normal: sp.n > 0 ? tex(normalCanvas(g, sp.n * (S / 256)), false) : null,
    rough: sp.rough ? tex(roughCanvas(g), false) : null,
    meters: sp.m,
  };
}

/* ------------------------------ texturas de arte (placas, rótulos) ------------------------------ */
/** rótulo branco/rosado com o selo da marca (vai na frente dos produtos) */
export function labelCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#fff8fb';
  x.fillRect(0, 0, 128, 128);
  x.fillStyle = PINK.rose;
  x.fillRect(0, 100, 128, 10);
  drawBrandLogo(x, 64, 52, 54, { badgeOnly: true });
  x.fillStyle = '#c9a0b4';
  x.fillRect(22, 84, 84, 4);
  return c;
}
/** lateral da caixa de papelão: logo, setas "este lado para cima", fita */
export function boxSideCanvas(prodColor: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const x = c.getContext('2d')!;
  const g = newGenSmall(256);
  x.drawImage(g, 0, 0);
  // logo
  x.globalAlpha = 0.85;
  x.drawImage(brandCanvas(220, 80), 18, 70);
  x.globalAlpha = 1;
  // faixa de cor do produto
  x.fillStyle = prodColor;
  x.fillRect(30, 160, 196, 26);
  x.strokeStyle = 'rgba(60,30,20,.55)';
  x.lineWidth = 3;
  x.strokeRect(30, 160, 196, 26);
  // setas
  x.fillStyle = 'rgba(60,30,20,.6)';
  for (const ax of [190, 216]) {
    x.beginPath();
    x.moveTo(ax, 20);
    x.lineTo(ax + 9, 34);
    x.lineTo(ax + 3, 34);
    x.lineTo(ax + 3, 50);
    x.lineTo(ax - 3, 50);
    x.lineTo(ax - 3, 34);
    x.lineTo(ax - 9, 34);
    x.fill();
  }
  // fita
  x.fillStyle = 'rgba(214,200,170,.85)';
  x.fillRect(118, 0, 20, 256);
  return c;
}
let cardCache: HTMLCanvasElement | null = null;
function newGenSmall(n: number): HTMLCanvasElement {
  if (cardCache && cardCache.width === n) return cardCache;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const x = c.getContext('2d')!;
  const img = x.createImageData(n, n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const v = hash2(i >> 2, j >> 2, 3) * 0.3 + hash2(i, j, 4) * 0.1 + Math.sin(j * 0.9) * 0.04;
      const o = (j * n + i) * 4;
      img.data[o] = 201 - v * 40;
      img.data[o + 1] = 154 - v * 34;
      img.data[o + 2] = 98 - v * 26;
      img.data[o + 3] = 255;
    }
  x.putImageData(img, 0, 0);
  // AO nas bordas
  const gr = x.createLinearGradient(0, 0, 0, n);
  gr.addColorStop(0, 'rgba(0,0,0,.12)');
  gr.addColorStop(0.08, 'rgba(0,0,0,0)');
  gr.addColorStop(0.92, 'rgba(0,0,0,0)');
  gr.addColorStop(1, 'rgba(0,0,0,.15)');
  x.fillStyle = gr;
  x.fillRect(0, 0, n, n);
  cardCache = c;
  return c;
}

/** sombra de contato (AO assada): retângulo suave escuro no centro */
export function contactShadowCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const img = x.createImageData(128, 128);
  for (let j = 0; j < 128; j++)
    for (let i = 0; i < 128; i++) {
      const dx = Math.max(0, Math.abs(i - 63.5) - 34) / 30;
      const dy = Math.max(0, Math.abs(j - 63.5) - 34) / 30;
      const d = Math.min(1, Math.hypot(dx, dy));
      const a = Math.pow(1 - d, 2) * 0.62;
      const o = (j * 128 + i) * 4;
      img.data[o] = img.data[o + 1] = 20;
      img.data[o + 2] = 30;
      img.data[o + 3] = a * 255;
    }
  x.putImageData(img, 0, 0);
  return c;
}
/** degradê vertical de AO (canto parede/chão) */
export function aoStripCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(20,10,20,.45)');
  g.addColorStop(0.35, 'rgba(20,10,20,.16)');
  g.addColorStop(1, 'rgba(20,10,20,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 4, 64);
  return c;
}
/** mancha de sujeira/poça (alfa) — kind: 'dirt' pegadas/poeira, 'spill' poça rosa, 'glass' cacos */
export function stainCanvas(kind: 'dirt' | 'spill' | 'glass' | 'mud', seed: number): HTMLCanvasElement {
  const n = 128;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const x = c.getContext('2d')!;
  const img = x.createImageData(n, n);
  const col: RGB = kind === 'spill' ? [255, 120, 180] : kind === 'mud' ? [92, 66, 44] : kind === 'glass' ? [210, 150, 190] : [110, 96, 80];
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const dx = (i - 63.5) / 64;
      const dy = (j - 63.5) / 64;
      const r = Math.hypot(dx, dy);
      const nz = fbmSmall(i, j, seed);
      let a = 0;
      if (kind === 'spill') a = r + (nz - 0.5) * 0.5 < 0.62 ? 0.78 : 0;
      else a = Math.max(0, 1 - r * 1.4) * (nz > 0.45 ? (nz - 0.45) * 2.6 : 0);
      const o = (j * n + i) * 4;
      img.data[o] = col[0];
      img.data[o + 1] = col[1];
      img.data[o + 2] = col[2];
      img.data[o + 3] = Math.min(1, a) * 255;
    }
  x.putImageData(img, 0, 0);
  if (kind === 'spill') {
    // brilho da poça
    x.globalCompositeOperation = 'source-atop';
    const g = x.createRadialGradient(50, 45, 2, 50, 45, 40);
    g.addColorStop(0, 'rgba(255,255,255,.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, n, n);
    x.globalCompositeOperation = 'source-over';
  }
  if (kind === 'dirt' || kind === 'mud') {
    // pegadas de Bloop (bolinhas)
    x.fillStyle = `rgba(${col[0] - 30},${col[1] - 30},${col[2] - 30},.55)`;
    const R = rnd(seed);
    for (let k = 0; k < 6; k++) {
      const px = 30 + R() * 68;
      const py = 30 + R() * 68;
      x.beginPath();
      x.ellipse(px, py, 7, 9, R() * 3, 0, Math.PI * 2);
      x.fill();
    }
  }
  return c;
}
function fbmSmall(i: number, j: number, seed: number): number {
  const v = (x: number, y: number, p: number, s: number) => {
    const xi = Math.floor(x / p);
    const yi = Math.floor(y / p);
    const fx = x / p - xi;
    const fy = y / p - yi;
    const a = hash2(xi, yi, s);
    const b = hash2(xi + 1, yi, s);
    const c = hash2(xi, yi + 1, s);
    const d = hash2(xi + 1, yi + 1, s);
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
  return v(i, j, 24, seed) * 0.55 + v(i, j, 10, seed + 1) * 0.3 + v(i, j, 4, seed + 2) * 0.15;
}
