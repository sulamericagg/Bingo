/* ============================================================
 *  BLOOP CINEMA — personagem 2D: o Bloop do jogo (drawAvatar) ganha
 *  bracinhos, pezinhos animados, 16 expressões e 20 poses que se
 *  misturam suavemente (blend de parâmetros do "rig").
 *  Os olhos/bocas de expressão são instalados como peças extras
 *  ('cin_e' / 'cin_m') nos mapas EYES/MOUTHS — o resto do visual
 *  (corpo, material, padrão, cabeça, rosto, costas) é o do jogo.
 * ============================================================ */
import { drawAvatar, type AvatarData } from '../game/avatar';
import { al, circ, cols, ell, heart, mix, SHAPES, star4 } from '../game/avatar-gfx';
import type { DC } from '../game/avatar-mat';
import { BACKS, EYES, HEADS, MOUTHS } from '../game/avatar-parts';
import type { PlayerPose } from '../game/character';
import { drawCreature } from '../creatures/render';
import { gameFont } from '../i18n/font';
import type { CastMember, ExprId, PoseId } from './format';
import { lookSig, type MakeupLook } from '../makeup/format';
import { drawLook, makeupOverlay } from '../makeup/render';

const PI = Math.PI;

/* ============================================================
 *  RIG — parâmetros que as poses produzem (unidades de R do corpo)
 * ============================================================ */
export interface Rig {
  hop: number; // sobe (R)
  dy: number; // abaixa (sentar) (R)
  lean: number; // inclinação (rad, + = para frente)
  sx: number;
  sy: number;
  /** mãos (x para frente quando virado p/ direita, y para baixo), em R */
  hlx: number;
  hly: number;
  hrx: number;
  hry: number;
  /** mão na frente do corpo (0..1) */
  hlf: number;
  hrf: number;
  /** pés: avanço e levantada */
  flx: number;
  fly: number;
  frx: number;
  fry: number;
  lookX: number;
  lookY: number;
  /** deitado 0..1 */
  lie: number;
  /** giro (espelha o corpo) — cos do ângulo */
  spin: number;
  /** tremedeira */
  shiver: number;
}

const REST: Rig = { hop: 0, dy: 0, lean: 0, sx: 1, sy: 1, hlx: -1.02, hly: 0.42, hrx: 1.02, hry: 0.42, hlf: 0, hrf: 0, flx: -0.42, fly: 0, frx: 0.42, fry: 0, lookX: 0, lookY: 0, lie: 0, spin: 1, shiver: 0 };
const KEYS = Object.keys(REST) as (keyof Rig)[];

const S = Math.sin;
const C = Math.cos;
const ab = Math.abs;

/** Pose → rig no tempo t (s). `face` não entra aqui (o espelhamento é aplicado no desenho). */
export function poseRig(pose: PoseId, t: number, out: Rig): Rig {
  Object.assign(out, REST);
  const br = S(t * 2.4) * 0.025;
  out.sx = 1 + br;
  out.sy = 1 - br;
  switch (pose) {
    case 'stand':
      out.hly += S(t * 2.4) * 0.03;
      out.hry += S(t * 2.4 + 0.5) * 0.03;
      break;
    case 'walk': {
      const w = t * 7;
      out.hop = ab(S(w)) * 0.1;
      out.flx = -0.42 + S(w) * 0.32;
      out.frx = 0.42 - S(w) * 0.32;
      out.fly = Math.max(0, S(w)) * 0.16;
      out.fry = Math.max(0, -S(w)) * 0.16;
      out.hlx = -1.0 - S(w) * 0.18;
      out.hrx = 1.0 + S(w) * 0.18;
      out.lean = 0.05;
      break;
    }
    case 'run': {
      const w = t * 12;
      out.hop = ab(S(w)) * 0.28;
      out.lean = 0.2;
      out.flx = -0.3 + S(w) * 0.5;
      out.frx = 0.5 - S(w) * 0.5;
      out.fly = Math.max(0, S(w)) * 0.3;
      out.fry = Math.max(0, -S(w)) * 0.3;
      out.hlx = -0.9 - S(w) * 0.4;
      out.hly = 0.2;
      out.hrx = 1.05 + S(w) * 0.4;
      out.hry = 0.2;
      out.sy = 1 + ab(C(w)) * 0.04;
      break;
    }
    case 'wave':
      out.hrx = 1.12 + S(t * 9) * 0.2;
      out.hry = -0.72 + C(t * 9) * 0.05;
      out.lean = -0.04;
      break;
    case 'point':
      out.hrx = 1.62;
      out.hry = -0.12;
      out.lean = 0.06;
      out.hlx = -0.98;
      break;
    case 'sit':
      out.dy = 0.5;
      out.sy = 0.94;
      out.sx = 1.05;
      out.flx = 0.25;
      out.frx = 0.72;
      out.fly = 0.1;
      out.fry = 0.1;
      out.hlx = -0.95;
      out.hly = 0.62;
      out.hrx = 0.95;
      out.hry = 0.62;
      break;
    case 'jump': {
      const k = (t * 1.6) % 1;
      const air = S(k * PI);
      out.hop = air * 1.6;
      const land = k < 0.12 ? 1 - k / 0.12 : k > 0.9 ? (k - 0.9) / 0.1 : 0;
      out.sy = 1 + air * 0.12 - land * 0.18;
      out.sx = 1 - air * 0.08 + land * 0.15;
      out.hlx = -1.1;
      out.hly = -0.4 * air + 0.3 * (1 - air);
      out.hrx = 1.1;
      out.hry = out.hly;
      out.fly = air * 0.12;
      out.fry = air * 0.12;
      break;
    }
    case 'dance': {
      const b = t * 6.5;
      out.hop = ab(S(b)) * 0.3;
      out.lean = S(b * 0.5) * 0.22;
      out.hlx = -1.0 + S(b * 0.5) * 0.3;
      out.hly = S(b * 0.5) > 0 ? -0.9 : 0.3;
      out.hrx = 1.0 + S(b * 0.5) * 0.3;
      out.hry = S(b * 0.5) > 0 ? 0.3 : -0.9;
      out.fly = Math.max(0, S(b)) * 0.15;
      out.fry = Math.max(0, -S(b)) * 0.15;
      out.sx = 1 + S(b) * 0.05;
      out.sy = 1 - S(b) * 0.05;
      break;
    }
    case 'lie':
      out.lie = 1;
      out.hlx = -0.9;
      out.hly = 0.6;
      out.hrx = 0.9;
      out.hry = 0.6;
      out.sx = 1 + S(t * 1.4) * 0.03;
      out.sy = 1 - S(t * 1.4) * 0.03;
      break;
    case 'hug':
      out.hlx = 1.25;
      out.hly = 0.05;
      out.hrx = 1.4;
      out.hry = -0.05;
      out.hlf = 0;
      out.hrf = 1;
      out.lean = 0.12;
      out.sx = 1 + S(t * 5) * 0.03;
      break;
    case 'facepalm':
      out.hrx = 0.3;
      out.hry = -0.12;
      out.hrf = 1;
      out.lean = 0.14;
      out.lookY = 0.6;
      out.hop = 0;
      out.sy = 0.97;
      break;
    case 'think':
      out.hrx = 0.38;
      out.hry = 0.42;
      out.hrf = 1;
      out.hlx = 0.05;
      out.hly = 0.62;
      out.hlf = 1;
      out.lookX = -0.5;
      out.lookY = -0.7;
      out.lean = -0.05 + S(t * 1.2) * 0.03;
      break;
    case 'cheer':
      out.hlx = -1.0 + S(t * 8) * 0.12;
      out.hly = -1.15;
      out.hrx = 1.0 - S(t * 8) * 0.12;
      out.hry = -1.15;
      out.hop = ab(S(t * 5)) * 0.35;
      break;
    case 'shrug':
      out.hlx = -1.4;
      out.hly = -0.25;
      out.hrx = 1.4;
      out.hry = -0.25;
      out.sy = 0.95;
      out.sx = 1.04;
      out.hop = ab(S(t * 3)) * 0.05;
      break;
    case 'bow': {
      const k = Math.min(1, (t % 2.4) / 0.6) * (t % 2.4 < 1.8 ? 1 : 1 - (t % 2.4 - 1.8) / 0.6);
      out.lean = 0.55 * k;
      out.hlx = -0.5;
      out.hly = 0.6;
      out.hlf = 1;
      out.hrx = 0.8;
      out.hry = 0.3;
      break;
    }
    case 'clap': {
      const k = ab(S(t * 9));
      out.hlx = 0.55 - k * 0.3;
      out.hly = 0.05;
      out.hrx = 0.75 + k * 0.25;
      out.hry = 0.05;
      out.hlf = 1;
      out.hrf = 1;
      out.hop = ab(S(t * 4.5)) * 0.06;
      break;
    }
    case 'scared':
      out.hlx = -0.55;
      out.hly = -0.15;
      out.hrx = 0.6;
      out.hry = -0.15;
      out.hlf = 1;
      out.hrf = 1;
      out.lean = -0.12;
      out.shiver = 1;
      out.sy = 0.96;
      break;
    case 'spin':
      out.spin = C(t * 9);
      out.hlx = -1.3;
      out.hly = -0.2;
      out.hrx = 1.3;
      out.hry = -0.2;
      out.hop = ab(S(t * 4.5)) * 0.15;
      break;
    case 'flex':
      out.hlx = -1.28;
      out.hly = -0.62 + S(t * 6) * 0.06;
      out.hrx = 1.28;
      out.hry = -0.62 - S(t * 6) * 0.06;
      out.sx = 1.06;
      out.sy = 1.02;
      break;
    case 'sneak': {
      const w = t * 4;
      out.lean = 0.25;
      out.hop = ab(S(w)) * 0.16;
      out.hlx = 0.35;
      out.hly = -0.25;
      out.hlf = 1;
      out.hrx = 0.75;
      out.hry = -0.35;
      out.hrf = 1;
      out.flx = -0.4 + S(w) * 0.25;
      out.frx = 0.45 - S(w) * 0.25;
      out.fly = Math.max(0, S(w)) * 0.22;
      out.fry = Math.max(0, -S(w)) * 0.22;
      break;
    }
  }
  return out;
}

const tmpA = { ...REST };
const tmpB = { ...REST };
/** Rig misturado entre a pose anterior e a atual (w: 0 = anterior, 1 = atual). */
export function blendRig(prev: PoseId, cur: PoseId, w: number, t: number, out: Rig): Rig {
  if (w >= 1 || prev === cur) return poseRig(cur, t, out);
  poseRig(prev, t, tmpA);
  poseRig(cur, t, tmpB);
  const k = w * w * (3 - 2 * w);
  for (const key of KEYS) out[key] = tmpA[key] + (tmpB[key] - tmpA[key]) * k;
  return out;
}

/* ============================================================
 *  EXPRESSÕES (instaladas como olhos/boca 'cin_e' / 'cin_m')
 * ============================================================ */
interface FaceState {
  expr: ExprId;
  /** boca aberta 0..1 (falando) */
  open: number;
  blink: number;
}
const FS: FaceState & { flip: number } = { expr: 'neutral', open: 0, blink: 0, flip: 1 };

function eyeOpen(d: DC, sd: number, sc: number, lid: number, slant: number, lookX: number, lookY: number, pupil = 1): void {
  const { x, R, c } = d;
  const ew = R * 0.2 * sc;
  const eh = R * 0.25 * sc;
  const open = 1 - FS.blink;
  x.save();
  x.translate(sd * d.ex, d.ey);
  if (open < 0.25) {
    x.strokeStyle = c.ink;
    x.lineWidth = R * 0.07;
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(-ew, 0);
    x.quadraticCurveTo(0, eh * 0.45, ew, 0);
    x.stroke();
    x.restore();
    return;
  }
  const h = eh * (0.3 + 0.7 * open);
  x.save();
  ell(x, 0, 0, ew, h);
  x.fillStyle = '#ffffff';
  x.fill();
  x.clip();
  const ix = lookX * R * 0.07 * sc;
  const iy = lookY * R * 0.08 * sc + R * 0.02;
  const ir = R * 0.15 * sc * pupil;
  x.fillStyle = mix(c.S, '#16112a', 0.25);
  circ(x, ix, iy, ir);
  x.fill();
  x.fillStyle = '#16112a';
  circ(x, ix, iy, ir * 0.52);
  x.fill();
  if (lid > 0) {
    // pálpebra: s = inclinação (+ = canto de dentro mais baixo → bravo; − = triste)
    const ly = -h + h * 2 * lid;
    const sl = slant * R * sd;
    x.fillStyle = mix(c.P, c.Pd, 0.35);
    x.beginPath();
    x.moveTo(-ew - 1, -h - 1);
    x.lineTo(ew + 1, -h - 1);
    x.lineTo(ew + 1, ly - sl);
    x.lineTo(-ew - 1, ly + sl);
    x.closePath();
    x.fill();
    x.strokeStyle = c.ink;
    x.lineWidth = R * 0.05;
    x.beginPath();
    x.moveTo(-ew, ly + sl);
    x.lineTo(ew, ly - sl);
    x.stroke();
  }
  x.restore();
  if (lid < 0.5 && pupil > 0.6) {
    x.fillStyle = '#ffffff';
    circ(x, ix - ir * 0.35, iy - ir * 0.4 + lid * ir, ir * 0.32);
    x.fill();
  }
  x.strokeStyle = al(c.Pdd, 0.45);
  x.lineWidth = R * 0.035;
  ell(x, 0, 0, ew, h);
  x.stroke();
  x.restore();
}

function arcEye(d: DC, sd: number, up: boolean, w = 0.16): void {
  const { x, R, c } = d;
  x.strokeStyle = c.ink;
  x.lineWidth = R * 0.085;
  x.lineCap = 'round';
  x.beginPath();
  if (up) x.arc(sd * d.ex, d.ey + R * 0.07, R * w, PI * 1.15, PI * 1.85);
  else x.arc(sd * d.ex, d.ey - R * 0.07, R * w, PI * 0.15, PI * 0.85);
  x.stroke();
}

function brows(d: DC, inner: number, outer: number, lift = 0, only?: number): void {
  // inner/outer: deslocamento vertical (R) das pontas; + = para baixo
  const { x, R, c } = d;
  x.strokeStyle = c.ink;
  x.lineWidth = R * 0.07;
  x.lineCap = 'round';
  x.beginPath();
  for (const sd of [-1, 1]) {
    if (only && only !== sd) continue;
    const by = d.ey - R * 0.36 - lift * R;
    x.moveTo(sd * (d.ex - R * 0.17), by + inner * R);
    x.lineTo(sd * (d.ex + R * 0.17), by + outer * R);
  }
  x.stroke();
}

function blush(d: DC, a = 0.55): void {
  const { x, R } = d;
  x.fillStyle = al('#ff5c8a', a);
  for (const sd of [-1, 1]) {
    ell(x, sd * (d.ex + R * 0.12), d.ey + R * 0.25, R * 0.15, R * 0.08);
    x.fill();
  }
}

function tear(d: DC, sd: number, k: number): void {
  const { x, R } = d;
  const px = sd * (d.ex + R * 0.12);
  const py = d.ey + R * 0.12 + k * R * 0.55;
  x.fillStyle = al('#7fd4ff', 1 - k * 0.6);
  x.beginPath();
  x.moveTo(px, py - R * 0.1);
  x.quadraticCurveTo(px + R * 0.07, py + R * 0.02, px, py + R * 0.06);
  x.quadraticCurveTo(px - R * 0.07, py + R * 0.02, px, py - R * 0.1);
  x.fill();
}

function cinEyes(d: DC): void {
  const { x, R, t } = d;
  const e = FS.expr;
  switch (e) {
    case 'neutral':
      for (const sd of [-1, 1]) eyeOpen(d, sd, 1, 0, 0, d.p.lookX, d.p.lookY);
      break;
    case 'happy':
      for (const sd of [-1, 1]) arcEye(d, sd, true);
      blush(d, 0.35);
      break;
    case 'laughing':
      x.strokeStyle = d.c.ink;
      x.lineWidth = R * 0.08;
      x.lineCap = 'round';
      x.lineJoin = 'round';
      for (const sd of [-1, 1]) {
        const k = R * 0.13;
        x.beginPath();
        x.moveTo(sd * d.ex - sd * k, d.ey - k);
        x.lineTo(sd * d.ex + sd * k * 0.6, d.ey);
        x.lineTo(sd * d.ex - sd * k, d.ey + k);
        x.stroke();
      }
      tear(d, 1, (t * 1.5) % 1);
      blush(d, 0.4);
      break;
    case 'sad':
      for (const sd of [-1, 1]) eyeOpen(d, sd, 0.95, 0.35, -0.08, 0, 0.5);
      brows(d, -0.08, 0.06);
      tear(d, -1, (t * 0.6) % 1);
      break;
    case 'crying':
      for (const sd of [-1, 1]) arcEye(d, sd, false, 0.15);
      brows(d, -0.09, 0.07);
      // rios de lágrimas
      x.strokeStyle = al('#7fd4ff', 0.9);
      x.lineWidth = R * 0.09;
      x.lineCap = 'round';
      for (const sd of [-1, 1]) {
        x.beginPath();
        const px = sd * (d.ex + R * 0.05);
        x.moveTo(px, d.ey + R * 0.08);
        for (let i = 1; i <= 6; i++) x.lineTo(px + S(t * 12 + i) * R * 0.04 + sd * i * R * 0.02, d.ey + R * 0.08 + i * R * 0.12);
        x.stroke();
      }
      break;
    case 'angry':
      for (const sd of [-1, 1]) eyeOpen(d, sd, 0.95, 0.38, 0.09, 0, 0.1);
      brows(d, 0.1, -0.06, -0.02);
      break;
    case 'surprised':
      for (const sd of [-1, 1]) eyeOpen(d, sd, 1.25, 0, 0, 0, 0, 0.55);
      brows(d, 0, 0, 0.16);
      break;
    case 'sleepy': {
      for (const sd of [-1, 1]) eyeOpen(d, sd, 0.95, 0.62, 0, 0, 0.6);
      const u = (t * 0.45) % 1;
      x.fillStyle = d.c.ink;
      x.globalAlpha *= S(u * PI);
      x.font = gameFont(700, Math.round(R * (0.28 + u * 0.18)));
      x.save();
      x.translate(R * (0.75 + u * 0.35), -R * (0.6 + u * 0.55));
      x.scale(FS.flip, 1);
      x.fillText('z', 0, 0);
      x.restore();
      x.globalAlpha = 1;
      break;
    }
    case 'love':
      for (const sd of [-1, 1]) {
        const k = 1 + S(t * 7) * 0.12;
        x.fillStyle = '#ff2e63';
        heart(x, sd * d.ex, d.ey + R * 0.02, R * 0.26 * k);
        x.fill();
        x.fillStyle = 'rgba(255,255,255,.7)';
        circ(x, sd * d.ex - R * 0.06, d.ey - R * 0.05, R * 0.04);
        x.fill();
      }
      blush(d);
      break;
    case 'thinking':
      for (const sd of [-1, 1]) eyeOpen(d, sd, 0.9, sd > 0 ? 0.3 : 0, 0, -0.7, -0.8);
      brows(d, 0.02, 0.02, 0.06, -1);
      brows(d, 0.03, 0.03, -0.02, 1);
      break;
    case 'scared': {
      const j = S(t * 40) * R * 0.012;
      x.translate(j, 0);
      for (const sd of [-1, 1]) eyeOpen(d, sd, 1.15, 0, 0, 0, 0, 0.32);
      brows(d, -0.1, 0.04, 0.1);
      x.translate(-j, 0);
      break;
    }
    case 'smug':
      for (const sd of [-1, 1]) eyeOpen(d, sd, 0.95, 0.5, 0, 0.7, 0.1);
      brows(d, 0.02, 0.02, 0.1, 1);
      break;
    case 'wink':
      eyeOpen(d, -1, 1, 0, 0, 0, 0);
      arcEye(d, 1, true);
      if ((t % 2) < 0.6) {
        x.fillStyle = '#ffe14f';
        star4(x, R * 0.95, -R * 0.35, R * 0.12 * S(((t % 2) / 0.6) * PI));
        x.fill();
      }
      break;
    case 'dizzy':
      x.strokeStyle = d.c.ink;
      x.lineWidth = R * 0.05;
      for (const sd of [-1, 1]) {
        x.beginPath();
        for (let i = 0; i < 30; i++) {
          const a = i * 0.55 + t * 8 * sd;
          const r = (i / 30) * R * 0.18;
          const px = sd * d.ex + C(a) * r;
          const py = d.ey + S(a) * r;
          if (i) x.lineTo(px, py);
          else x.moveTo(px, py);
        }
        x.stroke();
      }
      break;
    case 'shy':
      for (const sd of [-1, 1]) eyeOpen(d, sd, 0.9, 0.15, -0.04, 0.6, 0.7);
      blush(d, 0.8);
      x.strokeStyle = al('#ff5c8a', 0.9);
      x.lineWidth = R * 0.03;
      for (const sd of [-1, 1])
        for (let i = 0; i < 3; i++) {
          x.beginPath();
          const bx = sd * (d.ex + R * 0.04) + (i - 1) * R * 0.08;
          x.moveTo(bx + R * 0.03, d.ey + R * 0.2);
          x.lineTo(bx - R * 0.02, d.ey + R * 0.3);
          x.stroke();
        }
      break;
    case 'confused':
      eyeOpen(d, -1, 1.12, 0, 0, 0.2, -0.2);
      eyeOpen(d, 1, 0.8, 0.35, 0, 0.2, 0);
      brows(d, 0.02, -0.04, 0.12, -1);
      x.fillStyle = d.c.ink;
      x.font = gameFont(700, Math.round(R * 0.55));
      x.save();
      x.translate(R * 0.85, -R * 0.75 + S(t * 3) * R * 0.05);
      x.scale(FS.flip, 1);
      x.fillText('?', 0, 0);
      x.restore();
      break;
  }
}

function mouthShape(d: DC, kind: 'smile' | 'frown' | 'line' | 'O' | 'D' | 'teeth' | 'wave' | 'smirk' | 'wail', open: number): void {
  const { x, R, c } = d;
  const my = d.my;
  const W = R * 0.24;
  x.lineCap = 'round';
  x.lineJoin = 'round';
  x.strokeStyle = c.ink;
  x.lineWidth = R * 0.065;
  const dark = '#3a0f24';
  const fillOpen = (path: () => void, tongue = true) => {
    path();
    x.fillStyle = dark;
    x.fill();
    if (tongue) {
      x.save();
      path();
      x.clip();
      x.fillStyle = '#ff6b8a';
      ell(x, 0, my + R * 0.16 * (0.5 + open), W * 0.6, R * 0.12);
      x.fill();
      x.restore();
    }
    path();
    x.stroke();
  };
  const o = Math.max(0, Math.min(1, open));
  switch (kind) {
    case 'smile':
      if (o > 0.08) {
        fillOpen(() => {
          x.beginPath();
          x.moveTo(-W, my - R * 0.02);
          x.quadraticCurveTo(0, my + R * (0.08 + 0.3 * o), W, my - R * 0.02);
          x.quadraticCurveTo(0, my + R * 0.04, -W, my - R * 0.02);
          x.closePath();
        });
      } else {
        x.beginPath();
        x.moveTo(-W, my - R * 0.03);
        x.quadraticCurveTo(0, my + R * 0.15, W, my - R * 0.03);
        x.stroke();
      }
      break;
    case 'D':
      fillOpen(() => {
        x.beginPath();
        x.moveTo(-W * 1.15, my - R * 0.04);
        x.lineTo(W * 1.15, my - R * 0.04);
        x.quadraticCurveTo(W * 1.1, my + R * (0.22 + 0.15 * o), 0, my + R * (0.24 + 0.16 * o));
        x.quadraticCurveTo(-W * 1.1, my + R * (0.22 + 0.15 * o), -W * 1.15, my - R * 0.04);
        x.closePath();
      });
      break;
    case 'frown':
      if (o > 0.08) {
        fillOpen(() => {
          x.beginPath();
          ell(x, 0, my + R * 0.05, W * 0.7, R * (0.05 + 0.13 * o));
        }, false);
      } else {
        x.beginPath();
        x.moveTo(-W * 0.9, my + R * 0.08);
        x.quadraticCurveTo(0, my - R * 0.08, W * 0.9, my + R * 0.08);
        x.stroke();
      }
      break;
    case 'wail':
      fillOpen(() => {
        x.beginPath();
        x.moveTo(-W, my + R * 0.16);
        x.quadraticCurveTo(0, my - R * (0.12 + 0.1 * o), W, my + R * 0.16);
        x.quadraticCurveTo(0, my + R * (0.28 + 0.12 * o), -W, my + R * 0.16);
        x.closePath();
      });
      break;
    case 'O':
      fillOpen(() => {
        x.beginPath();
        ell(x, 0, my + R * 0.05, R * (0.09 + 0.06 * o), R * (0.11 + 0.1 * o));
      }, false);
      break;
    case 'teeth': {
      const h = R * (0.1 + 0.16 * o);
      x.beginPath();
      x.roundRect(-W, my - h / 2 + R * 0.04, W * 2, h, R * 0.05);
      x.fillStyle = '#ffffff';
      x.fill();
      x.stroke();
      x.lineWidth = R * 0.03;
      x.beginPath();
      x.moveTo(-W, my + R * 0.04);
      x.lineTo(W, my + R * 0.04);
      for (let i = -1; i <= 1; i++) {
        x.moveTo(i * W * 0.5, my - h / 2 + R * 0.04);
        x.lineTo(i * W * 0.5, my + h / 2 + R * 0.04);
      }
      x.stroke();
      break;
    }
    case 'wave':
      if (o > 0.15) {
        fillOpen(() => {
          x.beginPath();
          ell(x, 0, my + R * 0.05, W * 0.6, R * (0.06 + 0.12 * o));
        }, false);
        break;
      }
      x.beginPath();
      for (let i = 0; i <= 8; i++) {
        const px = -W + (i / 8) * W * 2;
        const py = my + R * 0.05 + (i % 2 ? -1 : 1) * R * 0.035;
        if (i) x.lineTo(px, py);
        else x.moveTo(px, py);
      }
      x.stroke();
      break;
    case 'smirk':
      if (o > 0.1) {
        fillOpen(() => {
          x.beginPath();
          x.moveTo(-W * 0.8, my + R * 0.06);
          x.quadraticCurveTo(0, my + R * (0.1 + 0.2 * o), W, my - R * 0.06);
          x.quadraticCurveTo(0, my + R * 0.04, -W * 0.8, my + R * 0.06);
          x.closePath();
        });
        break;
      }
      x.beginPath();
      x.moveTo(-W * 0.8, my + R * 0.06);
      x.quadraticCurveTo(W * 0.3, my + R * 0.1, W, my - R * 0.06);
      x.stroke();
      break;
    case 'line':
    default:
      if (o > 0.08) {
        fillOpen(() => {
          x.beginPath();
          ell(x, 0, my + R * 0.04, W * 0.65, R * (0.03 + 0.14 * o));
        });
      } else {
        x.beginPath();
        x.moveTo(-W * 0.7, my + R * 0.04);
        x.lineTo(W * 0.7, my + R * 0.04);
        x.stroke();
      }
  }
}

function cinMouth(d: DC): void {
  const o = FS.open;
  switch (FS.expr) {
    case 'happy':
    case 'love':
    case 'wink':
      return mouthShape(d, 'smile', o);
    case 'laughing':
      return mouthShape(d, 'D', 0.5 + o * 0.5 + S(d.t * 18) * 0.15);
    case 'sad':
      return mouthShape(d, 'frown', o);
    case 'crying':
      return mouthShape(d, 'wail', 0.5 + o * 0.5);
    case 'angry':
      return mouthShape(d, 'teeth', o);
    case 'surprised':
      return mouthShape(d, 'O', 0.4 + o * 0.6);
    case 'scared':
    case 'shy':
    case 'dizzy':
      return mouthShape(d, 'wave', o);
    case 'smug':
    case 'thinking':
    case 'confused':
      return mouthShape(d, 'smirk', o);
    case 'sleepy':
      return mouthShape(d, 'O', o * 0.6);
    default:
      return mouthShape(d, 'line', o);
  }
}

let installed = false;
function install(): void {
  if (installed) return;
  installed = true;
  EYES.cin_e = cinEyes;
  MOUTHS.cin_m = cinMouth;
}

/* ============================================================
 *  ATOR
 * ============================================================ */

export interface ActorDraw {
  rig: Rig;
  expr: ExprId;
  /** boca 0..1 (falando) */
  talk: number;
  t: number;
  face: -1 | 0 | 1;
  blink: number;
}

interface AvCache {
  own: AvatarData;
  expr: AvatarData;
  talk: AvatarData;
}
const avCache = new WeakMap<AvatarData, AvCache>();
function variants(a: AvatarData): AvCache {
  let v = avCache.get(a);
  if (!v) {
    v = {
      own: a,
      expr: { parts: { ...a.parts, eyes: 'cin_e', mouth: 'cin_m' }, colors: a.colors },
      talk: { parts: { ...a.parts, mouth: 'cin_m' }, colors: a.colors },
    };
    avCache.set(a, v);
  }
  return v;
}

const PP: PlayerPose = { t: 0, blink: 0, lookX: 0, lookY: 0, sx: 1, sy: 1, mood: 'fly', lx: -0.5, ly: -0.8 };

/** Raio do corpo (px) para um ator de "altura" h px (corpo + pés). */
export const radiusFor = (h: number): number => h / 2.25;

/** Piscar natural (determinístico por tempo + semente). */
export function blinkAt(t: number, seed: number): number {
  const p = 3.1 + (seed % 7) * 0.31;
  const k = ((t + seed * 0.37) % p) / p;
  return k > 0.965 ? S(((k - 0.965) / 0.035) * PI) : 0;
}

function drawArm(x: CanvasRenderingContext2D, R: number, sd: number, hx: number, hy: number, col: string, ink: string, hand: string): void {
  const sx = sd * 0.72 * R;
  const sy = 0.12 * R;
  const ex = hx * R;
  const ey = hy * R;
  const mx = (sx + ex) / 2 + sd * R * 0.1;
  const my = (sy + ey) / 2 + R * 0.12;
  x.lineCap = 'round';
  x.strokeStyle = ink;
  x.lineWidth = R * 0.3;
  x.beginPath();
  x.moveTo(sx, sy);
  x.quadraticCurveTo(mx, my, ex, ey);
  x.stroke();
  x.strokeStyle = col;
  x.lineWidth = R * 0.2;
  x.stroke();
  x.fillStyle = ink;
  circ(x, ex, ey, R * 0.19);
  x.fill();
  x.fillStyle = hand;
  circ(x, ex, ey, R * 0.145);
  x.fill();
}

function drawFeet(x: CanvasRenderingContext2D, R: number, bottom: number, r: Rig, col: string, hi: string, ink: string): void {
  const fy = bottom * R * 0.88;
  for (const [fx, ly] of [
    [r.flx, r.fly],
    [r.frx, r.fry],
  ] as const) {
    x.fillStyle = ink;
    ell(x, fx * R, fy - ly * R, R * 0.31, R * 0.21);
    x.fill();
    x.fillStyle = col;
    ell(x, fx * R, fy - ly * R, R * 0.27, R * 0.17);
    x.fill();
    x.fillStyle = hi;
    x.globalAlpha = 0.5;
    ell(x, fx * R - R * 0.06, fy - ly * R - R * 0.06, R * 0.11, R * 0.05);
    x.fill();
    x.globalAlpha = 1;
  }
}

/**
 * Desenha o ator com os PÉS em (0,0) do contexto atual. `h` = altura alvo em px.
 * Devolve a posição da cabeça (topo) relativa aos pés, para bolhas/efeitos.
 */
export function drawActor2D(x: CanvasRenderingContext2D, cast: CastMember, h: number, a: ActorDraw): { headY: number; mouthY: number } {
  install();
  const r = a.rig;
  const R = radiusFor(h) * (cast.size ?? 1);
  // sombra no chão
  const lift = r.hop * R;
  x.fillStyle = 'rgba(20,0,40,.22)';
  const sh = Math.max(0.35, 1 - lift / (R * 3));
  ell(x, 0, 0, R * 1.05 * sh * (r.lie ? 1.5 : 1), R * 0.2 * sh);
  x.fill();
  const flip = (a.face === -1 ? -1 : 1) * (r.spin < 0 ? -1 : 1);
  const spinSx = Math.max(0.15, ab(r.spin));

  if (cast.kind === 'creature' && cast.creature) {
    const size = R * 2.5;
    x.save();
    x.translate(r.shiver ? S(a.t * 50) * R * 0.03 : 0, -lift + r.dy * R * 0.6);
    x.translate(0, -size * 0.42);
    if (r.lie) x.rotate(-flip * r.lie * PI * 0.45);
    x.rotate(flip * r.lean * 0.6);
    x.scale(flip * r.sx * spinSx, r.sy * (1 + a.talk * 0.06));
    const mood = a.expr === 'happy' || a.expr === 'laughing' || a.expr === 'love' ? 'happy' : a.expr === 'sad' || a.expr === 'crying' ? 'sad' : a.expr === 'sleepy' ? 'sleep' : 'idle';
    drawCreature(x, cast.creature, size, a.t, { mood });
    x.restore();
    const headY = -lift - size * 0.85;
    emote(x, a.expr, 0, headY, R, a.t);
    return { headY, mouthY: -lift - size * 0.35 };
  }

  const avd = cast.avatar!;
  const shp = SHAPES[avd.parts.body] ?? SHAPES.b_blob;
  const c = cols(avd.colors.primary, avd.colors.secondary);
  const bottom = shp.bottom;
  const footBase = bottom * R * 0.88 + R * 0.19;
  x.save();
  x.translate(r.shiver ? S(a.t * 50) * R * 0.025 : 0, -lift + r.dy * R);
  // eixo de giro nos pés quando deita / inclina
  if (r.lie) {
    x.translate(0, -R * 0.9 * r.lie);
    x.rotate(-flip * r.lie * PI * 0.5);
    x.translate(0, R * 0.9 * r.lie);
  }
  x.rotate(flip * r.lean);
  x.translate(0, -footBase);
  x.scale(flip * spinSx, 1);
  const front = r.spin >= -0.2;
  if (!front) {
    // de costas: só o corpo
  }
  const hand = c.P;
  if (r.hlf < 0.5) drawArm(x, R, -1, r.hlx, r.hly, c.Pd, c.Pdd, hand);
  if (r.hrf < 0.5) drawArm(x, R, 1, r.hrx, r.hry, c.Pd, c.Pdd, hand);
  if (shp.feet && r.dy < 0.3) drawFeet(x, R, bottom, r, c.Pd, c.Ph, c.Pdd);
  // corpo (mood 'fly' = sem pés do drawAvatar; os pés animados são nossos)
  const own = a.expr === 'neutral' && a.talk < 0.04;
  const v = variants(avd);
  const avUse = own ? v.own : a.expr === 'neutral' ? v.talk : v.expr;
  FS.expr = a.expr;
  FS.open = a.talk;
  FS.blink = a.blink;
  FS.flip = flip < 0 ? -1 : 1;
  PP.t = a.t;
  PP.blink = a.blink;
  PP.lookX = r.lookX;
  PP.lookY = r.lookY;
  PP.sx = r.sx;
  PP.sy = r.sy;
  PP.mood = 'fly';
  x.save();
  x.translate(0, bottom * R * (1 - r.sy));
  drawAvatar(x, avUse, R, PP, makeupOverlay(cast.makeup));
  x.restore();
  if (shp.feet && r.dy >= 0.3) drawFeet(x, R, bottom, r, c.Pd, c.Ph, c.Pdd);
  if (r.hlf >= 0.5) drawArm(x, R, -1, r.hlx, r.hly, c.Pd, c.Pdd, hand);
  if (r.hrf >= 0.5) drawArm(x, R, 1, r.hrx, r.hry, c.Pd, c.Pdd, hand);
  x.restore();
  const top = shp.top * R; // negativo
  const headY = -lift + r.dy * R - footBase + top;
  return { headY, mouthY: -lift + r.dy * R - footBase + R * (shp.fy + 0.25) };
}

/** Balõezinhos de emoção sobre bichinhos (que não têm rosto editável). */
function emote(x: CanvasRenderingContext2D, e: ExprId, cx: number, cy: number, R: number, t: number): void {
  const map: Partial<Record<ExprId, string>> = { angry: '💢', surprised: '❗', love: '💗', crying: '💧', sad: '💧', thinking: '💭', confused: '❓', scared: '💦', dizzy: '💫', shy: '❤️', laughing: '😆', smug: '✨', wink: '✨', sleepy: '💤' };
  const g = map[e];
  if (!g) return;
  x.save();
  x.font = `${Math.round(R * 0.7)}px system-ui, sans-serif`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(g, cx + R * 0.7, cy + S(t * 4) * R * 0.08);
  x.restore();
}

/* ---------------------------- miniaturas ---------------------------- */
const thumbCache = new Map<string, HTMLCanvasElement>();

/** Miniatura do ator numa pose/expressão (cache por chave). */
export function actorThumb(cast: CastMember, px: number, pose: PoseId, expr: ExprId, t = 0.35, key = ''): HTMLCanvasElement {
  const k = `${cast.id}|${lookSig(cast.makeup)}|${JSON.stringify(cast.avatar?.colors ?? cast.creature)}|${cast.avatar ? Object.values(cast.avatar.parts).join(',') : ''}|${px}|${pose}|${expr}|${key}`;
  let cv = thumbCache.get(k);
  if (cv) return cv;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv = document.createElement('canvas');
  cv.width = cv.height = Math.round(px * dpr);
  cv.style.width = cv.style.height = px + 'px';
  const x = cv.getContext('2d')!;
  x.scale(dpr, dpr);
  const rig = poseRig(pose, t, { ...REST });
  const isClose = key === 'face';
  x.translate(px / 2, isClose ? px * 1.12 : px * 0.93);
  const h = isClose ? px * 1.12 : px * 0.7;
  drawActor2D(x, cast, h, { rig, expr, talk: 0, t, face: 0, blink: 0 });
  if (thumbCache.size > 400) thumbCache.clear();
  thumbCache.set(k, cv);
  return cv;
}
export function clearThumbs(): void {
  thumbCache.clear();
}

export const restRig = (): Rig => ({ ...REST });

/* ---------------------------- texturas para o 3D ---------------------------- */

function makeDC(x: CanvasRenderingContext2D, avd: AvatarData, R: number, t: number): DC {
  const sh = SHAPES[avd.parts.body] ?? SHAPES.b_blob;
  PP.t = t;
  PP.mood = 'fly';
  return {
    x,
    R,
    p: PP,
    c: cols(avd.colors.primary, avd.colors.secondary),
    sh,
    pts: sh.pts,
    t,
    ex: R * 0.33 * Math.min(1.15, Math.max(0.9, sh.side)),
    ey: R * (sh.fy - 0.1),
    my: R * (sh.fy + 0.25),
  };
}

/**
 * Rosto (olhos + boca + bochechas) centrado no meio do canvas (corpo de raio R),
 * para a textura projetada na frente do Bloop 3D. Fundo transparente.
 */
export function drawFaceTex(x: CanvasRenderingContext2D, avd: AvatarData, R: number, expr: ExprId, open: number, blink: number, t: number, lookX = 0, lookY = 0, makeup?: MakeupLook): void {
  install();
  const d = makeDC(x, avd, R, t);
  if (makeup) drawLook(x, makeup, R, d.sh.fy);
  PP.blink = blink;
  PP.lookX = lookX;
  PP.lookY = lookY;
  FS.expr = expr;
  FS.open = open;
  FS.blink = blink;
  FS.flip = 1;
  x.lineCap = 'round';
  x.lineJoin = 'round';
  const own = expr === 'neutral';
  (own ? EYES[avd.parts.eyes] ?? cinEyes : cinEyes)(d);
  (own && open < 0.04 ? MOUTHS[avd.parts.mouth] ?? cinMouth : cinMouth)(d);
}

/** Acessório de cabeça (chapéu, orelhas...) num canvas — vira um sprite em cima do Bloop 3D. */
export function drawHeadTex(x: CanvasRenderingContext2D, avd: AvatarData, R: number, t: number): boolean {
  const fn = HEADS[avd.parts.head];
  if (!fn || avd.parts.head === 'h_none') return false;
  const d = makeDC(x, avd, R, t);
  x.lineCap = 'round';
  x.lineJoin = 'round';
  x.save();
  x.translate(0, d.sh.top * R);
  fn(d, -d.sh.top * R);
  x.restore();
  return true;
}

/** Costas (asas, capa...) — camada de trás. */
export function drawBackTex(x: CanvasRenderingContext2D, avd: AvatarData, R: number, t: number): boolean {
  const fn = BACKS[avd.parts.back];
  if (!fn || avd.parts.back === 'k_none') return false;
  const d = makeDC(x, avd, R, t);
  fn(d, 0);
  return true;
}
