/* ============================================================
 *  BLOOP BANDA — abertura curta (≈13 s): palco escuro, o canhão de luz acende no microfone
 *  e o SEU Bloop aparece; a banda entra um a um (bateria, guitarra, teclado), notas voando,
 *  a pista de notas desce no ritmo, luzes varrendo e o título. 2D procedural.
 * ============================================================ */
import { t } from '../../../i18n';
import { sfx } from '../../../3d/common/sfx';
import { playFilm, type Stage } from '../../_intro2/stage';
import { INK, TAU, back, bloop, circle, confetti, ease, fillAll, friendSkins, fs, glow, hop, lerp, rr, seg, shadow, twinkle, vgrad, type X } from '../../_intro2/draw';

const T_SPOT = 0.8;
const T_BAND = 2.8;
const T_TITLE = 8.4;
const T_END = 13.2;
const LANES = ['#ff5fa2', '#ffb627', '#3ddc97', '#4cc9f0', '#a974ff'];
const GY = 14;

function note(x: X, cx: number, cy: number, s: number, col: string, rot = 0): void {
  x.save();
  x.translate(cx, cy);
  x.rotate(rot);
  x.beginPath();
  x.ellipse(0, 0, s * 0.55, s * 0.4, -0.4, 0, TAU);
  fs(x, col, s * 0.1);
  x.fillStyle = INK;
  x.fillRect(s * 0.42, -s * 1.5, s * 0.14, s * 1.5);
  x.beginPath();
  x.moveTo(s * 0.56, -s * 1.5);
  x.quadraticCurveTo(s * 1.1, -s * 1.1, s * 0.9, -s * 0.6);
  x.lineWidth = s * 0.14;
  x.strokeStyle = INK;
  x.stroke();
  x.restore();
}
function spot(x: X, cx: number, top: number, w: number, a: number, col = 'rgba(255,245,200,1)'): void {
  if (a <= 0) return;
  x.save();
  x.globalAlpha = a * 0.35;
  x.globalCompositeOperation = 'lighter';
  x.fillStyle = col;
  x.beginPath();
  x.moveTo(cx - 2, top);
  x.lineTo(cx + 2, top);
  x.lineTo(cx + w, GY + 2);
  x.lineTo(cx - w, GY + 2);
  x.closePath();
  x.fill();
  x.restore();
  x.save();
  x.globalAlpha = a * 0.5;
  x.fillStyle = col;
  x.beginPath();
  x.ellipse(cx, GY + 1, w, w * 0.18, 0, 0, TAU);
  x.fill();
  x.restore();
}
function drums(x: X, cx: number, tt: number): void {
  const hit = Math.pow(Math.max(0, Math.sin(tt * 8)), 8);
  circle(x, cx, GY - 6, 6);
  fs(x, '#ff5fa2', 0.6);
  circle(x, cx, GY - 6, 4);
  fs(x, '#fff1f8', 0.5);
  rr(x, cx - 11, GY - 9, 6, 4, 1.5);
  fs(x, '#ffb627', 0.5);
  rr(x, cx + 5, GY - 9, 6, 4, 1.5);
  fs(x, '#ffb627', 0.5);
  x.beginPath();
  x.ellipse(cx + 10, GY - 17 + hit, 4.5, 1, 0.2, 0, TAU);
  fs(x, '#ffd84a', 0.4);
}
function guitar(x: X, cx: number, cy: number, tt: number): void {
  x.save();
  x.translate(cx, cy);
  x.rotate(-0.5 + Math.sin(tt * 4) * 0.08);
  rr(x, -1, -14, 2, 12, 0.6);
  fs(x, '#8a5a3a', 0.4);
  x.beginPath();
  x.ellipse(0, 1, 4, 3.2, 0, 0, TAU);
  fs(x, '#a974ff', 0.5);
  x.beginPath();
  x.ellipse(0, -2.4, 3, 2.4, 0, 0, TAU);
  fs(x, '#a974ff', 0.5);
  circle(x, 0, 0, 0.9);
  x.fillStyle = INK;
  x.fill();
  x.restore();
}
function keys(x: X, cx: number): void {
  rr(x, cx - 10, GY - 9, 20, 5, 1);
  fs(x, '#2a1e4a', 0.6);
  for (let i = 0; i < 8; i++) {
    x.fillStyle = '#fff';
    x.fillRect(cx - 9 + i * 2.3, GY - 7.4, 1.9, 2.8);
  }
  x.fillStyle = '#6a5a9a';
  x.fillRect(cx - 7, GY - 4, 1.2, 4);
  x.fillRect(cx + 6, GY - 4, 1.2, 4);
}
function highway(x: X, st: Stage, tt: number, a: number): void {
  if (a <= 0) return;
  const top = GY + 6;
  const bot = Math.min(st.hh - 10, GY + (st.tall ? 70 : 34));
  const w0 = 14;
  const w1 = st.tall ? 46 : 60;
  x.save();
  x.globalAlpha = a;
  x.beginPath();
  x.moveTo(-w0, top);
  x.lineTo(w0, top);
  x.lineTo(w1, bot);
  x.lineTo(-w1, bot);
  x.closePath();
  fs(x, 'rgba(20,10,46,.85)', 0.6);
  for (let i = 0; i < 5; i++) {
    const f = (i + 0.5) / 5 - 0.5;
    // trilho
    x.strokeStyle = 'rgba(255,255,255,.12)';
    x.lineWidth = 0.4;
    x.beginPath();
    x.moveTo(f * 2 * w0, top);
    x.lineTo(f * 2 * w1, bot);
    x.stroke();
    // notas descendo
    for (let j = 0; j < 3; j++) {
      const q = ((tt * 0.55 + j / 3 + i * 0.21) % 1);
      const y = lerp(top, bot, q * q);
      const w = lerp(w0, w1, q * q);
      x.beginPath();
      x.ellipse(f * 2 * w, y, 1.4 + q * 3, 0.7 + q * 1.3, 0, 0, TAU);
      fs(x, LANES[i], 0.3 + q * 0.4);
    }
    // alvo na linha de acerto
    const hy = lerp(top, bot, 0.86);
    const hw = lerp(w0, w1, 0.86);
    x.strokeStyle = LANES[i];
    x.lineWidth = 0.7;
    x.beginPath();
    x.ellipse(f * 2 * hw, hy, 3.6, 1.6, 0, 0, TAU);
    x.stroke();
  }
  x.restore();
}
function scene(st: Stage, tt: number): void {
  const x = st.x;
  const fit = Math.min(1, st.hw / 56);
  x.save();
  x.scale(fit, fit);
  fillAll(x, st, vgrad(x, -st.hh, st.hh, ['#1a0a40', '#3a1a7a']));
  // cortinas
  for (const s of [-1, 1]) {
    x.fillStyle = '#c4123a';
    x.beginPath();
    x.moveTo(s * (st.hw + 2), -st.hh);
    x.lineTo(s * 40, -st.hh);
    x.quadraticCurveTo(s * 46, -10, s * 52, GY);
    x.lineTo(s * (st.hw + 2), GY);
    x.closePath();
    x.fill();
    x.strokeStyle = 'rgba(0,0,0,.2)';
    x.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      x.beginPath();
      x.moveTo(s * (44 + i * 6), -st.hh);
      x.quadraticCurveTo(s * (48 + i * 6), -10, s * (54 + i * 6), GY);
      x.stroke();
    }
  }
  // palco
  x.fillStyle = '#5a3aa8';
  x.fillRect(-st.hw * 3, GY, st.hw * 6, st.hh * 3);
  x.fillStyle = '#7a5ad8';
  x.fillRect(-st.hw * 3, GY, st.hw * 6, 1.4);
  const lit = ease(seg(tt, T_BAND, T_BAND + 1.2));
  // luzes coloridas varrendo
  for (let i = 0; i < 4; i++) {
    const cx = Math.sin(tt * 0.9 + i * 1.6) * 34;
    spot(x, -30 + i * 20, -st.hh, 9, lit * 0.8, ['#ff5fa2', '#4cc9f0', '#ffd23f', '#a974ff'][i]);
    void cx;
  }
  spot(x, 0, -st.hh, 11, ease(seg(tt, T_SPOT, T_SPOT + 0.3)));
  const sk = friendSkins(3);
  // banda: bateria atrás, guitarra à esquerda, teclado à direita
  const pop = (t0: number) => back(seg(tt, t0, t0 + 0.45), 2.2);
  const members: [number, number, string, number, (cx: number) => void][] = [
    [0, -2, sk[0], T_BAND, (cx) => drums(x, cx, tt)],
    [-30, 4, sk[1], T_BAND + 1.0, () => void 0],
    [30, 4, sk[2], T_BAND + 2.0, (cx) => keys(x, cx)],
  ];
  for (const [mx, my, skin, t0, inst] of members) {
    const k = pop(t0);
    if (k <= 0) continue;
    const R = 7 * k;
    const hp = hop(tt + mx, 2, 1.6);
    const cy = GY - 4 + my;
    if (mx === 0) {
      bloop(x, mx, cy - 14 + hp.dy, R, { t: tt, skin, sx: hp.sx, sy: hp.sy, mood: 'happy', lookY: 0.2 });
      inst(mx);
    } else {
      shadow(x, mx, GY + my, R * 0.9);
      bloop(x, mx, GY + my - R * 1.05 + hp.dy, R, { t: tt, skin, sx: hp.sx, sy: hp.sy, mood: 'happy', flip: mx > 0, lookX: 0.4, lookY: 0.1 });
      if (mx < 0) guitar(x, mx + 2, GY + my - R * 0.3 + hp.dy, tt);
      else inst(mx);
    }
  }
  // o vocalista (o jogador) no microfone
  const vk = back(seg(tt, T_SPOT + 0.3, T_SPOT + 0.8), 2);
  if (vk > 0) {
    const R = 9 * vk;
    const hp = hop(tt, 2, tt > T_BAND ? 2.4 : 0.6);
    shadow(x, 0, GY + 8, R * 0.9);
    bloop(x, 0, GY + 8 - R * 1.05 + hp.dy, R, { t: tt, sx: hp.sx, sy: hp.sy, mood: 'happy', lookY: 0.15 });
    x.strokeStyle = INK;
    x.lineWidth = 0.6;
    x.beginPath();
    x.moveTo(7, GY + 8);
    x.lineTo(7, GY - 4);
    x.lineTo(4.5, GY - 6);
    x.stroke();
    circle(x, 4, GY - 6.4, 1.4);
    fs(x, '#c8c0e0', 0.4);
  }
  // notas musicais voando
  if (tt > T_BAND)
    for (let i = 0; i < 8; i++) {
      const q = (tt * 0.45 + i / 8) % 1;
      const px = Math.sin(i * 2.1) * 30 + Math.sin(q * 6 + i) * 4;
      const py = GY - 10 - q * 46;
      x.save();
      x.globalAlpha = Math.sin(q * Math.PI) * lit;
      note(x, px, py, 2.6, LANES[i % 5], Math.sin(tt * 3 + i) * 0.3);
      x.restore();
    }
  highway(x, st, tt, ease(seg(tt, 5.4, 6.4)));
  // plateia (silhuetas) — só em pé há espaço
  if (!st.tall)
    for (let i = 0; i < 12; i++) {
      const px = -st.hw + 8 + i * ((st.hw * 2 - 16) / 11);
      const jump = Math.abs(Math.sin(tt * 4 + i)) * (tt > T_BAND ? 1.6 : 0);
      circle(x, px, st.hh - 4 - jump, 5);
      x.fillStyle = '#120a2e';
      x.fill();
    }
  glow(x, 0, GY - 8, 40, 'rgba(255,95,162,.25)', lit);
  for (let i = 0; i < 6; i++) twinkle(x, Math.cos(i * 1.1 + tt) * 44, -26 + Math.sin(i * 1.7 + tt) * 10, 1.4 * lit, '#fff');
  confetti(x, st, tt, T_TITLE + 0.3, Math.round(60 * st.q), 12, LANES);
  x.restore();
}

export default function play(parent: HTMLElement): Promise<void> {
  return playFilm(parent, {
    id: 'band',
    dur: T_END,
    music: 'studio',
    bg: '#120a2e',
    titleCols: ['#ffffff', '#fff1b0', '#ff8fd8', '#3a0a5a'],
    title: () => t('band.name', 'Bloop Banda'),
    tagline: () => t('band.tagline', 'Monte sua banda e toque no ritmo!'),
    titleAt: T_TITLE,
    subs: [
      { t: 0.4, icons: ['mic'], text: () => t('intro2.ba.s1', 'Luz, palco... e microfone!') },
      { t: T_BAND + 0.1, icons: ['music', 'party'], text: () => t('intro2.ba.s2', 'Chama a banda!') },
      { t: 5.6, icons: ['star'], text: () => t('intro2.ba.s3', 'Toque as notas no ritmo!') },
      { t: T_TITLE, icons: [], text: () => '' },
    ],
    cues: [
      { t: T_SPOT, fn: sfx.thunk },
      { t: T_SPOT + 0.4, fn: sfx.pop },
      { t: T_BAND, fn: sfx.pop },
      { t: T_BAND + 1.0, fn: sfx.pop },
      { t: T_BAND + 2.0, fn: sfx.pop },
      { t: T_BAND + 2.4, fn: sfx.yay },
    ],
    draw: scene,
  });
}
