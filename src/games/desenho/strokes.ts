/* ============================================================
 *  DESENHA E VIRA! — modelo do desenho (traços) + código compacto.
 *  O que se guarda é o TRAÇO (não a malha): galeria e código de
 *  compartilhar refazem tudo a partir dele.
 *  Formato binário (v1): varints + deltas em zigue-zague → base64url.
 * ============================================================ */

export type Tool = 'pen' | 'erase' | 'fill';
export type Material = 'inflate' | 'extrude' | 'lathe' | 'tube';

export interface Stroke {
  t: Tool;
  /** índice da paleta */
  c: number;
  /** índice do tamanho do pincel */
  s: number;
  /** espelhado (simetria ligada) */
  m: boolean;
  /** x,y,w,x,y,w... (unidades lógicas do papel; w = 0..255 fator de largura) */
  p: number[];
}

export interface Drawing {
  w: number;
  h: number;
  strokes: Stroke[];
}

export const PALETTE = ['#2a1e3a', '#ff4d5e', '#ff9a2e', '#ffd93d', '#8be04e', '#2fbf71', '#22c3c9', '#3d7cf0', '#8a5cff', '#ff6fc8', '#9a6238', '#ffffff'] as const;
export const SIZES = [5, 10, 18, 30] as const;

/** largura real (lógica) de um ponto */
export const ptWidth = (s: Stroke, wb: number): number => SIZES[s.s] * (0.45 + (wb / 255) * 0.95);

export function emptyDrawing(w = 512, h = 512): Drawing {
  return { w, h, strokes: [] };
}

/** comprimento total de tinta (lógico) — base do medidor de tinta dos desafios */
export function inkLength(d: Drawing): number {
  let L = 0;
  for (const s of d.strokes) if (s.t === 'pen') L += strokeLen(s) * (s.m ? 2 : 1);
  return L;
}
export function strokeLen(s: Stroke): number {
  const p = s.p;
  let L = p.length < 6 ? SIZES[s.s] : 0;
  for (let i = 3; i < p.length; i += 3) L += Math.hypot(p[i] - p[i - 3], p[i + 1] - p[i - 2]);
  return L;
}

/** pontos de um traço (com a cópia espelhada, se houver) */
export function strokePaths(d: Drawing, s: Stroke): number[][] {
  if (!s.m) return [s.p];
  const q = s.p.slice();
  for (let i = 0; i < q.length; i += 3) q[i] = d.w - q[i];
  return [s.p, q];
}

/* ----------------------------- código binário ----------------------------- */

const TOOLS: Tool[] = ['pen', 'erase', 'fill'];

class W {
  b: number[] = [];
  u(n: number): void {
    n = Math.max(0, Math.round(n));
    while (n >= 0x80) {
      this.b.push((n & 0x7f) | 0x80);
      n = Math.floor(n / 128);
    }
    this.b.push(n);
  }
  z(n: number): void {
    n = Math.round(n);
    this.u(n < 0 ? -n * 2 - 1 : n * 2);
  }
}
class R {
  i = 0;
  constructor(private b: Uint8Array) {}
  u(): number {
    let n = 0;
    let m = 1;
    for (;;) {
      if (this.i >= this.b.length) throw new Error('eof');
      const c = this.b[this.i++];
      n += (c & 0x7f) * m;
      if (c < 0x80) return n;
      m *= 128;
    }
  }
  z(): number {
    const n = this.u();
    return n & 1 ? -(n + 1) / 2 : n / 2;
  }
  byte(): number {
    if (this.i >= this.b.length) throw new Error('eof');
    return this.b[this.i++];
  }
}

const MAT_IDS: Material[] = ['inflate', 'extrude', 'lathe', 'tube'];

/** Desenho (+ material e extras) → bytes */
export function encodeDrawing(d: Drawing, mat: Material = 'inflate', flags = 0): Uint8Array {
  const w = new W();
  w.u(1); // versão
  w.u(d.w);
  w.u(d.h);
  w.u(MAT_IDS.indexOf(mat));
  w.u(flags);
  w.u(d.strokes.length);
  for (const s of d.strokes) {
    w.b.push(TOOLS.indexOf(s.t) | (s.m ? 4 : 0) | (s.s << 3));
    w.b.push(s.c);
    const n = Math.floor(s.p.length / 3);
    w.u(n);
    let px = 0;
    let py = 0;
    for (let i = 0; i < n; i++) {
      const x = Math.round(s.p[i * 3]);
      const y = Math.round(s.p[i * 3 + 1]);
      w.z(x - px);
      w.z(y - py);
      px = x;
      py = y;
      if (s.t === 'pen' || s.t === 'erase') w.b.push(Math.max(0, Math.min(255, Math.round(s.p[i * 3 + 2]))));
    }
  }
  return new Uint8Array(w.b);
}

export interface Decoded {
  d: Drawing;
  mat: Material;
  flags: number;
}

export function decodeDrawing(b: Uint8Array): Decoded {
  const r = new R(b);
  const v = r.u();
  if (v !== 1) throw new Error('version');
  const d: Drawing = { w: r.u(), h: r.u(), strokes: [] };
  if (d.w < 16 || d.h < 16 || d.w > 4096 || d.h > 4096) throw new Error('size');
  const mat = MAT_IDS[r.u()] ?? 'inflate';
  const flags = r.u();
  const ns = r.u();
  if (ns > 5000) throw new Error('count');
  for (let k = 0; k < ns; k++) {
    const h = r.byte();
    const s: Stroke = { t: TOOLS[h & 3] ?? 'pen', m: !!(h & 4), s: Math.min(SIZES.length - 1, (h >> 3) & 3), c: r.byte() % PALETTE.length, p: [] };
    const n = r.u();
    if (n > 20000) throw new Error('points');
    let px = 0;
    let py = 0;
    for (let i = 0; i < n; i++) {
      px += r.z();
      py += r.z();
      s.p.push(px, py, s.t === 'fill' ? 0 : r.byte());
    }
    d.strokes.push(s);
  }
  return { d, mat, flags };
}

export function toB64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function fromB64(s: string): Uint8Array {
  const t = s.replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
  const bin = atob(t + '==='.slice((t.length + 3) % 4));
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b;
}

const PREFIX = 'DV1-';
export function shareCode(d: Drawing, mat: Material, flags = 0): string {
  return PREFIX + toB64(encodeDrawing(d, mat, flags));
}
export function parseShareCode(code: string): Decoded | null {
  const c = code.trim();
  const i = c.indexOf(PREFIX);
  if (i < 0) return null;
  try {
    return decodeDrawing(fromB64(c.slice(i + PREFIX.length).split(/[^A-Za-z0-9_-]/)[0]));
  } catch {
    return null;
  }
}

/** remove pontos quase repetidos (traço mais leve para guardar) */
export function thinPoints(p: number[], minD = 1.6): number[] {
  if (p.length <= 6) return p;
  const out = [p[0], p[1], p[2]];
  for (let i = 3; i < p.length - 3; i += 3) {
    const lx = out[out.length - 3];
    const ly = out[out.length - 2];
    if (Math.hypot(p[i] - lx, p[i + 1] - ly) >= minD) out.push(p[i], p[i + 1], p[i + 2]);
  }
  const n = p.length;
  out.push(p[n - 3], p[n - 2], p[n - 1]);
  return out;
}

export function cloneDrawing(d: Drawing): Drawing {
  return { w: d.w, h: d.h, strokes: d.strokes.map((s) => ({ ...s, p: s.p.slice() })) };
}
