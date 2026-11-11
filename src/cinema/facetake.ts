/* ============================================================
 *  BLOOP CINEMA — captura de rosto: quantização (1 byte por canal
 *  por quadro, base64) e leitura interpolada. Sem DOM.
 *  Formato documentado em docs/CINEMA-FORMATO.md (FaceTake).
 * ============================================================ */
import { FACE_CH, FACE_RANGE, type FaceFrame, type FaceTake } from './format';

const NC = FACE_CH.length;
const HEAD = 0.6;

const enc = (ch: (typeof FACE_CH)[number], v: number): number => {
  const r = FACE_RANGE[ch];
  const u = r === 0 ? v : r === 1 ? (v + 1) / 2 : v / (HEAD * 2) + 0.5;
  return Math.max(0, Math.min(255, Math.round(u * 255)));
};
const dec = (r: 0 | 1 | 2, b: number): number => {
  const u = b / 255;
  return r === 0 ? u : r === 1 ? u * 2 - 1 : (u - 0.5) * HEAD * 2;
};

export const neutralFrame = (): FaceFrame => Object.fromEntries(FACE_CH.map((c) => [c, 0])) as FaceFrame;

function toB64(u: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u.length; i += 0x4000) s += String.fromCharCode(...u.subarray(i, i + 0x4000));
  return btoa(s);
}
function fromB64(s: string): Uint8Array {
  const b = atob(s);
  const u = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  return u;
}

/** Quadros (já na taxa `hz`) → FaceTake compacto. */
export function encodeTake(frames: FaceFrame[], hz: number): FaceTake {
  const u = new Uint8Array(frames.length * NC);
  frames.forEach((f, i) => FACE_CH.forEach((c, j) => (u[i * NC + j] = enc(c, f[c] ?? 0))));
  return { hz, n: frames.length, q: toB64(u) };
}

const decoded = new WeakMap<FaceTake, Float32Array>();
function data(tk: FaceTake): Float32Array {
  let d = decoded.get(tk);
  if (d) return d;
  let u: Uint8Array;
  try {
    u = fromB64(tk.q);
  } catch {
    u = new Uint8Array(0);
  }
  d = new Float32Array(tk.n * NC);
  for (let i = 0; i < tk.n; i++) for (let j = 0; j < NC; j++) d[i * NC + j] = dec(FACE_RANGE[FACE_CH[j]], u[i * NC + j] ?? 128);
  decoded.set(tk, d);
  return d;
}

export const takeDuration = (tk: FaceTake): number => tk.n / tk.hz;

/** Quadro interpolado no tempo `s` (segundos da gravação). null fora da gravação. */
export function sampleTake(tk: FaceTake, s: number, out: FaceFrame = neutralFrame()): FaceFrame | null {
  if (s < 0 || s > takeDuration(tk)) return null;
  const d = data(tk);
  const f = Math.min(tk.n - 1, s * tk.hz);
  const i = Math.floor(f);
  const k = f - i;
  const i2 = Math.min(tk.n - 1, i + 1);
  for (let j = 0; j < NC; j++) out[FACE_CH[j]] = d[i * NC + j] * (1 - k) + d[i2 * NC + j] * k;
  return out;
}
