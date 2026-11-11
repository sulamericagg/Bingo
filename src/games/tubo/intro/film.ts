/* ============================================================
 *  QUEDA GIRATÓRIA — abertura curta (≈12 s): o SEU Bloop na beirada lá no alto da torre
 *  espia o buraco (glup!), pula e cai pelo túnel: anéis girando passam voando, ele mergulha
 *  pelas aberturas e desvia do vermelho; título no meio da queda. 2D procedural.
 * ============================================================ */
import { t } from '../../../i18n';
import { sfx } from '../../../3d/common/sfx';
import { playFilm, type Stage } from '../../_intro2/stage';
import { INK, TAU, bloop, circle, ease, easeIn, fillAll, fs, glow, hop, lerp, seg, shadow, twinkle, vgrad, within, type X } from '../../_intro2/draw';

const T_JUMP = 2.8;
const T_FALL = 3.6;
const T_TITLE = 8.0;
const T_END = 12.4;
const COLS = ['#ffd166', '#7ad3ff', '#9be86b', '#ff9ec4', '#c6a8ff'];

/** anel (disco com abertura) visto de cima, raio r, girando, com fatias vermelhas */
function ring(x: X, r: number, rot: number, i: number, a: number): void {
  if (r <= 0.5) return;
  const gap = 0.9;
  x.save();
  x.globalAlpha = a;
  x.rotate(rot);
  const inner = r * 0.38;
  // disco
  x.beginPath();
  x.arc(0, 0, r, gap / 2, TAU - gap / 2);
  x.arc(0, 0, inner, TAU - gap / 2, gap / 2, true);
  x.closePath();
  fs(x, COLS[i % COLS.length], r * 0.025);
  // fatia vermelha
  const ra = Math.PI * 0.9 + (i % 3) * 0.6;
  x.beginPath();
  x.arc(0, 0, r, ra, ra + 0.7);
  x.arc(0, 0, inner, ra + 0.7, ra, true);
  x.closePath();
  fs(x, '#ff3b5c', r * 0.025);
  x.strokeStyle = 'rgba(255,255,255,.35)';
  x.lineWidth = r * 0.03;
  x.beginPath();
  x.arc(0, 0, (r + inner) / 2, gap, Math.PI * 0.8);
  x.stroke();
  x.restore();
}
function tower(st: Stage, tt: number): void {
  const x = st.x;
  const fit = Math.min(1, st.hw / 50);
  const look = ease(seg(tt, 0.6, 1.4));
  const z = lerp(1.0, 1.25, ease(seg(tt, 0, T_FALL)));
  x.save();
  x.scale(fit * z, fit * z);
  fillAll(x, st, vgrad(x, -st.hh, st.hh, ['#ffc07a', '#ff5e8a']));
  // nuvens embaixo (está bem alto)
  for (let i = 0; i < 6; i++) {
    const cx = -80 + i * 32 + Math.sin(tt * 0.4 + i) * 3;
    x.fillStyle = 'rgba(255,255,255,.75)';
    x.beginPath();
    x.ellipse(cx, 34 + (i % 2) * 6, 16, 5, 0, 0, TAU);
    x.fill();
  }
  // a torre: o topo (disco em perspectiva) com o buraco
  x.save();
  x.translate(0, 12);
  x.fillStyle = vgrad(x, 0, 80, ['#ff9a6a', '#d9466a']);
  x.fillRect(-30, 0, 60, 120);
  x.fillStyle = 'rgba(255,255,255,.15)';
  for (let i = 0; i < 5; i++) x.fillRect(-30 + i * 14, 0, 4, 120);
  x.beginPath();
  x.ellipse(0, 0, 30, 9, 0, 0, TAU);
  fs(x, '#ffd166', 0.8);
  x.beginPath();
  x.ellipse(6, 0.6, 12, 4, 0, 0, TAU);
  fs(x, '#3a1450', 0.6);
  x.restore();
  // o Bloop na beirada
  const R = 8;
  const jump = seg(tt, T_JUMP, T_FALL);
  const gulp = within(tt, 1.6, 2.6, 0.1, 0.2);
  const hp = hop(tt, 1.2, 0.6);
  let bx = -12;
  let by = 12 - R * 1.05 + hp.dy;
  if (jump > 0) {
    bx = lerp(-12, 6, jump);
    by = lerp(12 - R * 1.05, 14, easeIn(jump)) - Math.sin(jump * Math.PI) * 14;
  }
  if (jump < 0.6) shadow(x, bx, 12, R * 0.8);
  bloop(x, bx, by, R * (1 - Math.max(0, jump - 0.6) * 1.5), { t: tt, lookX: lerp(0.2, 0.5, look), lookY: lerp(0, 0.85, look), sx: 1 + gulp * 0.06, sy: 1 - gulp * 0.06, mood: jump > 0 ? 'fly' : 'happy' });
  if (gulp > 0) {
    x.strokeStyle = `rgba(42,11,92,${gulp})`;
    x.lineWidth = 0.5;
    for (let i = 0; i < 3; i++) {
      x.beginPath();
      x.arc(bx + R + 2, by - R, 1.5 + i * 1.6, -0.8, 0.8);
      x.stroke();
    }
  }
  x.restore();
}
function fall(st: Stage, tt: number): void {
  const x = st.x;
  const k = tt - T_FALL;
  const span = Math.max(st.hw, st.hh) * 1.3;
  fillAll(x, st, '#3a1450');
  // paredes do túnel (anéis de fundo)
  for (let i = 8; i >= 0; i--) {
    circle(x, 0, 0, span * (1 - i / 9));
    x.fillStyle = i % 2 ? '#ff7a8a' : '#ff9a6a';
    x.fill();
  }
  glow(x, 0, 0, span * 0.4, 'rgba(255,230,180,.8)');
  // anéis vindo do fundo (perspectiva: r = f / profundidade)
  const N = 7;
  const speed = 1.15;
  const base = k * speed;
  for (let j = N - 1; j >= 0; j--) {
    const idx = Math.floor(base) + j;
    const d = idx + 1 - base; // profundidade 0..N
    if (d <= 0.08) continue;
    const r = (span * 0.32) / d;
    const a = Math.min(1, (N - d) / 2);
    const rot = idx * 1.7 + tt * (idx % 2 ? 0.8 : -0.6);
    ring(x, r, rot, idx, a);
  }
  // linhas de velocidade
  x.strokeStyle = 'rgba(255,255,255,.5)';
  x.lineWidth = 0.5;
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU + i;
    const q = (tt * 2.2 + i * 0.37) % 1;
    const r0 = 14 + q * span;
    x.beginPath();
    x.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    x.lineTo(Math.cos(a) * (r0 + 10 + q * 12), Math.sin(a) * (r0 + 10 + q * 12));
    x.stroke();
  }
  // o Bloop caindo (de cima, girando de leve, desviando)
  const R = 9;
  const dx = Math.sin(tt * 1.7) * 9;
  const dy = Math.cos(tt * 1.3) * 5 + 4;
  bloop(x, dx, dy, R, { t: tt, rot: Math.sin(tt * 2) * 0.25, mood: 'fly', lookX: -dx * 0.03, lookY: 0.2 });
  for (let i = 0; i < 6; i++) twinkle(x, Math.cos(i + tt * 3) * 22, Math.sin(i * 1.3 + tt * 2.5) * 22, 1.3, i % 2 ? '#fff' : '#ffd166', 0.8);
}

export default function play(parent: HTMLElement): Promise<void> {
  return playFilm(parent, {
    id: 'tubo',
    dur: T_END,
    music: 'tubo',
    bg: '#3a1450',
    titleCols: ['#fff6d6', '#ffc15e', '#ff7a45', '#5a1450'],
    title: () => t('tubo.name', 'Queda Giratória'),
    tagline: () => t('tubo.tagline', 'Mergulhe pelas aberturas e fuja do vermelho!'),
    titleAt: T_TITLE,
    subs: [
      { t: 0.3, icons: ['target'], text: () => t('intro2.tu.s1', 'Lá embaixo... bem lá embaixo!') },
      { t: T_FALL + 0.1, icons: ['rocket'], text: () => t('intro2.tu.s2', 'Mergulhe pelas aberturas!') },
      { t: 5.9, icons: ['warning'], text: () => t('intro2.tu.s3', 'E fuja do vermelho!') },
      { t: T_TITLE, icons: [], text: () => '' },
    ],
    cues: [
      { t: 1.7, fn: sfx.squeak },
      { t: T_JUMP, fn: sfx.boing },
      { t: T_FALL, fn: sfx.whoosh },
      { t: T_FALL + 1.6, fn: sfx.swish },
      { t: T_FALL + 3.0, fn: sfx.swish },
    ],
    draw(st, tt) {
      if (tt < T_FALL) tower(st, tt);
      else fall(st, tt);
      const a = 1 - Math.abs(tt - T_FALL) / 0.22;
      if (a > 0) {
        st.x.save();
        st.x.globalAlpha = a;
        fillAll(st.x, st, '#3a1450');
        st.x.restore();
      }
      void INK;
    },
  });
}
