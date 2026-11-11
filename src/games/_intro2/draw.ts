/* ============================================================
 *  ABERTURAS (lote 2) — pincéis 2D: o SEU Bloop (desenho do hub), amigos, céu, nuvens, brilhos,
 *  confete, raios, balões e utilidades de tempo (easing, segmentos). Estilo "adesivo": cores
 *  chapadas com contorno roxo-escuro, igual às vitrines do hub.
 * ============================================================ */
import { drawPlayer, type PlayerPose } from '../../game/character';
import { SKINS, skinById, type Skin } from '../../game/skins';
import { save } from '../../core/storage';

export type X = CanvasRenderingContext2D;
export const INK = '#2a0b5c';
export const TAU = Math.PI * 2;

/* ------------------------------ tempo ------------------------------ */
export const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** progresso 0..1 de tt entre a e b */
export const seg = (tt: number, a: number, b: number) => clamp((tt - a) / (b - a));
export const ease = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
export const easeOut = (k: number) => 1 - Math.pow(1 - clamp(k), 3);
export const easeIn = (k: number) => Math.pow(clamp(k), 3);
export function back(k: number, s = 1.7): number {
  k = clamp(k);
  const c = s + 1;
  return Math.max(0, 1 + c * Math.pow(k - 1, 3) + s * Math.pow(k - 1, 2));
}
/** quique amortecido (0 → 1 com rebotes) */
export function bounce(k: number): number {
  k = clamp(k);
  return 1 - Math.abs(Math.cos(k * Math.PI * 2.5)) * Math.pow(1 - k, 2);
}
/** entra em a..a+i, fica, sai em b-o..b (0..1) */
export function within(tt: number, a: number, b: number, i = 0.4, o = 0.4): number {
  if (tt < a || tt > b) return 0;
  return Math.min(ease((tt - a) / i), ease((b - tt) / o));
}
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let r = s;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------ formas ------------------------------ */
export function rr(x: X, a: number, b: number, w: number, h: number, r: number): void {
  x.beginPath();
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  x.moveTo(a + r, b);
  x.arcTo(a + w, b, a + w, b + h, r);
  x.arcTo(a + w, b + h, a, b + h, r);
  x.arcTo(a, b + h, a, b, r);
  x.arcTo(a, b, a + w, b, r);
  x.closePath();
}
/** preenche o caminho atual e contorna em tinta */
export function fs(x: X, fill: string | CanvasGradient, lw = 0.7, ink = INK): void {
  x.fillStyle = fill;
  x.fill();
  if (lw > 0) {
    x.lineWidth = lw;
    x.strokeStyle = ink;
    x.lineJoin = 'round';
    x.stroke();
  }
}
export function circle(x: X, cx: number, cy: number, r: number): void {
  x.beginPath();
  x.arc(cx, cy, Math.max(0.001, r), 0, TAU);
}
export function vgrad(x: X, y0: number, y1: number, stops: string[]): CanvasGradient {
  const g = x.createLinearGradient(0, y0, 0, y1);
  stops.forEach((c, i) => g.addColorStop(i / Math.max(1, stops.length - 1), c));
  return g;
}
/** fundo que cobre a tela toda (qualquer orientação) */
export function fillAll(x: X, st: { hw: number; hh: number }, fill: string | CanvasGradient): void {
  x.fillStyle = fill;
  x.fillRect(-st.hw - 2, -st.hh - 2, st.hw * 2 + 4, st.hh * 2 + 4);
}
export function star5(x: X, cx: number, cy: number, R: number, rot = 0, inner = 0.48): void {
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot - Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? R * inner : R;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i) x.lineTo(px, py);
    else x.moveTo(px, py);
  }
  x.closePath();
}
/** brilho de 4 pontas */
export function twinkle(x: X, cx: number, cy: number, r: number, col = '#fff', a = 1): void {
  if (r <= 0 || a <= 0) return;
  x.save();
  x.globalAlpha *= a;
  x.fillStyle = col;
  x.beginPath();
  x.moveTo(cx, cy - r);
  x.quadraticCurveTo(cx, cy, cx + r, cy);
  x.quadraticCurveTo(cx, cy, cx, cy + r);
  x.quadraticCurveTo(cx, cy, cx - r, cy);
  x.quadraticCurveTo(cx, cy, cx, cy - r);
  x.fill();
  x.restore();
}
export function cloud(x: X, cx: number, cy: number, s: number, col = '#fff', a = 1): void {
  x.save();
  x.globalAlpha *= a;
  x.fillStyle = col;
  x.beginPath();
  x.arc(cx - s * 0.9, cy + s * 0.15, s * 0.55, 0, TAU);
  x.arc(cx - s * 0.2, cy - s * 0.25, s * 0.75, 0, TAU);
  x.arc(cx + s * 0.6, cy - s * 0.05, s * 0.6, 0, TAU);
  x.arc(cx + s * 1.15, cy + s * 0.25, s * 0.42, 0, TAU);
  x.rect(cx - s * 0.9, cy + s * 0.1, s * 2.05, s * 0.6);
  x.fill();
  x.restore();
}
/** raios girando atrás de algo */
export function rays(x: X, cx: number, cy: number, rot: number, len: number, col: string, n = 14, w = 0.12): void {
  x.save();
  x.translate(cx, cy);
  x.rotate(rot);
  x.fillStyle = col;
  for (let i = 0; i < n; i++) {
    x.rotate(TAU / n);
    x.beginPath();
    x.moveTo(0, 0);
    x.lineTo(len, -len * w);
    x.lineTo(len, len * w);
    x.closePath();
    x.fill();
  }
  x.restore();
}
/** brilho radial suave */
export function glow(x: X, cx: number, cy: number, r: number, col: string, a = 1): void {
  if (r <= 0 || a <= 0) return;
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, col);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.save();
  x.globalAlpha *= a;
  x.fillStyle = g;
  x.fillRect(cx - r, cy - r, r * 2, r * 2);
  x.restore();
}
export function shadow(x: X, cx: number, cy: number, rx: number, a = 0.22): void {
  if (!(rx > 0.01)) return;
  x.save();
  x.globalAlpha *= a;
  x.fillStyle = '#1a0830';
  x.beginPath();
  x.ellipse(cx, cy, rx, rx * 0.28, 0, 0, TAU);
  x.fill();
  x.restore();
}

/** confete determinístico: n pedaços caindo desde t0 (sem estado) */
export function confetti(x: X, st: { hw: number; hh: number }, tt: number, t0: number, n: number, seed = 3, cols = ['#ff5fa2', '#ffd23f', '#3ddc97', '#4cc9f0', '#a974ff', '#ff8a3d']): void {
  const k = tt - t0;
  if (k <= 0) return;
  const R = rng(seed);
  for (let i = 0; i < n; i++) {
    const x0 = (R() * 2 - 1) * st.hw;
    const v = 14 + R() * 18;
    const delay = R() * 1.4;
    const kk = k - delay;
    const sp = R() * 6 + 2;
    const ph = R() * TAU;
    const c = cols[i % cols.length];
    if (kk <= 0) {
      R();
      continue;
    }
    const y = -st.hh - 4 + kk * v;
    if (y > st.hh + 4) continue;
    const px = x0 + Math.sin(kk * 2 + ph) * 3;
    x.save();
    x.translate(px, y);
    x.rotate(kk * sp + ph);
    x.scale(1, Math.cos(kk * (3 + R() * 4) + ph));
    x.fillStyle = c;
    x.fillRect(-0.9, -0.5, 1.8, 1);
    x.restore();
  }
}

/* ------------------------------ Bloops ------------------------------ */
export interface BloopO {
  t: number;
  mood?: PlayerPose['mood'];
  lookX?: number;
  lookY?: number;
  sx?: number;
  sy?: number;
  /** espelha (olhando para a esquerda) */
  flip?: boolean;
  blink?: number;
  /** skin de amigo (id); sem = o Bloop do jogador */
  skin?: string;
  rot?: number;
  view?: 'back';
  noFeet?: boolean;
}
export function mySkin(): Skin {
  return skinById(save.skin);
}
/** amigos coloridos que não repetem a skin do jogador */
export function friendSkins(n: number): string[] {
  const pool = ['mint', 'sunny', 'ocean', 'kitty', 'bee', 'dj', 'capy', 'astro', 'unicorn', 'chef', 'devil', 'robot'].filter((s) => s !== save.skin && SKINS.some((k) => k.id === s));
  return pool.slice(0, n);
}
/** pisca sozinho de tempos em tempos (determinístico) */
export function autoBlink(tt: number, ph = 0): number {
  const k = (tt + ph) % 3.4;
  return k < 0.12 ? Math.sin((k / 0.12) * Math.PI) : 0;
}
/** desenha um Bloop com o CENTRO DO CORPO em (cx,cy) e raio R */
export function bloop(x: X, cx: number, cy: number, R: number, o: BloopO): void {
  if (!(R > 0.05)) return;
  const skin = o.skin ? skinById(o.skin) : mySkin();
  x.save();
  x.translate(cx, cy);
  if (o.rot) x.rotate(o.rot);
  if (o.flip) x.scale(-1, 1);
  try {
    drawPlayer(x, skin, R, {
      t: o.t,
      blink: o.blink ?? autoBlink(o.t, cx * 0.13),
      lookX: o.lookX ?? 0.2,
      lookY: o.lookY ?? 0.05,
      sx: o.sx ?? 1,
      sy: o.sy ?? 1,
      mood: o.mood ?? 'happy',
      lx: -0.55,
      ly: -0.83,
      view: o.view,
      noFeet: o.noFeet,
    });
  } catch {
    circle(x, 0, 0, R);
    fs(x, skin.light, R * 0.08);
  }
  x.restore();
}
/** pulinho: deslocamento vertical e achatamento para um Bloop saltitante */
export function hop(tt: number, freq = 2, amp = 3): { dy: number; sx: number; sy: number } {
  const ph = (tt * freq) % 1;
  const h = Math.sin(ph * Math.PI);
  const land = ph < 0.12 ? 1 - ph / 0.12 : 0;
  return { dy: -h * amp, sx: 1 + land * 0.12 - h * 0.04, sy: 1 - land * 0.12 + h * 0.06 };
}

/* ------------------------------ texto ------------------------------ */
/** texto grosso com contorno (para placas/telas dentro da cena) */
export function label(x: X, s: string, cx: number, cy: number, size: number, fill = '#fff', ink = INK, maxW = 0, align: CanvasTextAlign = 'center'): void {
  x.save();
  x.font = `800 ${size}px Fredoka, system-ui, sans-serif`;
  x.textAlign = align;
  x.textBaseline = 'middle';
  if (maxW > 0) {
    const w = x.measureText(s).width;
    if (w > maxW) {
      const k = maxW / w;
      x.translate(cx, cy);
      x.scale(k, k);
      x.translate(-cx, -cy);
    }
  }
  x.lineJoin = 'round';
  x.lineWidth = size * 0.22;
  x.strokeStyle = ink;
  x.strokeText(s, cx, cy);
  x.fillStyle = fill;
  x.fillText(s, cx, cy);
  x.restore();
}

/** corte com mergulho rápido no escuro (em volta de cada instante de `cuts`) */
export function dip(x: X, st: { hw: number; hh: number }, tt: number, cuts: number[], col = '#140a1e', w = 0.28): void {
  let a = 0;
  for (const c of cuts) a = Math.max(a, 1 - Math.abs(tt - c) / w);
  if (a <= 0) return;
  x.save();
  x.globalAlpha = clamp(a);
  fillAll(x, st, col);
  x.restore();
}
