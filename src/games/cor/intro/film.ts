/* ============================================================
 *  PINTOU, GANHOU! — abertura curta (≈12 s): a amostra de cor aparece com o relógio
 *  ("memorize!"), vira de costas; o SEU Bloop de boina mistura no anel de cores e pinta a tela
 *  do cavalete; o medidor sobe até 97% e respingos de tinta explodem no título.
 * ============================================================ */
import { t } from '../../../i18n';
import { sfx } from '../../../3d/common/sfx';
import { playFilm, type Stage } from '../../_intro2/stage';
import { INK, TAU, back, bloop, circle, confetti, ease, easeOut, fillAll, fs, hop, label, lerp, rays, rr, seg, shadow, twinkle, vgrad, within, type X } from '../../_intro2/draw';

const TARGET = '#2ec2c8';
const T_FLIP = 2.6;
const T_PAINT = 3.2;
const T_SCORE = 6.2;
const T_TITLE = 8.4;
const T_END = 12.6;

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mixCol(a: string, b: string, k: number): string {
  const A = hex(a);
  const B = hex(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',')})`;
}
function beret(x: X, cx: number, cy: number, R: number): void {
  x.beginPath();
  x.ellipse(cx - R * 0.15, cy - R * 0.82, R * 0.7, R * 0.28, -0.15, 0, TAU);
  fs(x, '#e2453c', R * 0.06);
  circle(x, cx - R * 0.1, cy - R * 1.1, R * 0.08);
  fs(x, '#e2453c', R * 0.05);
}
function splat(x: X, cx: number, cy: number, r: number, col: string, seed: number): void {
  x.beginPath();
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * TAU;
    const rr2 = r * (0.75 + 0.35 * Math.abs(Math.sin(seed * 7 + i * 2.3)));
    const px = cx + Math.cos(a) * rr2;
    const py = cy + Math.sin(a) * rr2;
    if (i) x.lineTo(px, py);
    else x.moveTo(px, py);
  }
  x.closePath();
  fs(x, col, r * 0.05);
  for (let i = 0; i < 4; i++) {
    const a = seed * 3 + i * 1.7;
    circle(x, cx + Math.cos(a) * r * 1.4, cy + Math.sin(a) * r * 1.4, r * 0.16);
    x.fillStyle = col;
    x.fill();
  }
}
function scene(st: Stage, tt: number): void {
  const x = st.x;
  const fit = Math.min(1, st.hw / 56);
  fillAll(x, st, vgrad(x, -st.hh, st.hh, ['#5b3aa8', '#ff5e8a']));
  rays(x, 0, 0, tt * 0.2, 160, 'rgba(255,255,255,.07)', 16, 0.08);
  x.save();
  x.scale(fit, fit);
  const tall = st.tall;
  // 1) a amostra para memorizar (com relógio)
  const sIn = back(seg(tt, 0.2, 0.7), 2);
  const flip = seg(tt, T_FLIP, T_FLIP + 0.5);
  const sY = tall ? -38 : -14;
  const sX = tall ? 0 : lerp(0, -40, ease(seg(tt, T_PAINT - 0.4, T_PAINT + 0.4)));
  if (sIn > 0) {
    x.save();
    x.translate(sX, sY - (tall ? 0 : 0));
    const sc = sIn * lerp(1.2, 0.8, ease(seg(tt, T_PAINT - 0.4, T_PAINT + 0.4)));
    x.scale(sc * Math.abs(Math.cos(flip * Math.PI)), sc);
    rr(x, -11, -13, 22, 26, 3);
    fs(x, '#fff', 0.8);
    rr(x, -8.5, -10.5, 17, 17, 2);
    fs(x, flip < 0.5 ? TARGET : '#e8e0f8', 0.6);
    if (flip >= 0.5) label(x, '?', 0, -2, 9, '#a08ad8', '#fff');
    x.restore();
    // relógio circular
    if (tt < T_FLIP) {
      const k = seg(tt, 0.6, T_FLIP);
      x.strokeStyle = '#fff';
      x.lineWidth = 1.4;
      x.beginPath();
      x.arc(sX + 13 * sIn, sY - 15 * sIn, 3.4, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - k));
      x.stroke();
    }
  }
  // 2) cavalete + o pintor
  const ek = back(seg(tt, T_PAINT - 0.6, T_PAINT), 1.6);
  const eX = tall ? 4 : 14;
  const eY = tall ? 18 : 6;
  if (ek > 0) {
    x.save();
    x.translate(eX, eY);
    x.scale(ek, ek);
    x.strokeStyle = '#8a5a3a';
    x.lineWidth = 1.6;
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(-9, 22);
    x.lineTo(0, -16);
    x.lineTo(9, 22);
    x.moveTo(0, -16);
    x.lineTo(0, 22);
    x.stroke();
    rr(x, -13, -14, 26, 22, 1.5);
    fs(x, '#fffdf4', 0.8);
    // pinceladas chegando na cor certa
    const pk = seg(tt, T_PAINT, T_SCORE);
    x.save();
    rr(x, -12, -13, 24, 20, 1);
    x.clip();
    const strokes = 7;
    for (let i = 0; i < strokes; i++) {
      const sk = seg(pk, i / strokes, (i + 1) / strokes);
      if (sk <= 0) continue;
      const col = mixCol('#ff9ec4', TARGET, Math.min(1, (i + 1) / strokes + 0.1));
      x.strokeStyle = col;
      x.lineWidth = 4.2;
      x.beginPath();
      const y = -11 + i * 3;
      x.moveTo(-14, y);
      x.lineTo(lerp(-14, 14, sk), y + Math.sin(i) * 0.8);
      x.stroke();
    }
    x.restore();
    x.fillStyle = '#c98a5a';
    x.fillRect(-14, 7, 28, 2);
    x.restore();
  }
  // o Bloop pintor com paleta e pincel
  const R = 9;
  const bX = tall ? -22 : -12;
  const bY = tall ? 40 : 28;
  const pk = seg(tt, T_PAINT, T_SCORE);
  const cheer = tt > T_SCORE + 0.3;
  const hp = hop(tt, cheer ? 2 : 1.2, cheer ? 3 : 0.8);
  if (ek > 0) {
    shadow(x, bX, bY, R * 0.9);
    bloop(x, bX, bY - R * 1.05 + hp.dy, R, { t: tt, sx: hp.sx, sy: hp.sy, lookX: 0.6, lookY: -0.3, mood: 'happy' });
    beret(x, bX, bY - R * 1.05 + hp.dy, R);
    // pincel indo e vindo
    const sw = pk > 0 && pk < 1 ? Math.sin(tt * 12) : 0;
    x.save();
    x.translate(bX + R * 0.9, bY - R * 1.2 + hp.dy);
    x.rotate(-0.9 + sw * 0.4);
    rr(x, -0.6, -11, 1.2, 11, 0.5);
    fs(x, '#c98a5a', 0.3);
    x.beginPath();
    x.ellipse(0, -12, 1.2, 2.2, 0, 0, TAU);
    fs(x, mixCol('#ff9ec4', TARGET, pk), 0.3);
    x.restore();
    // paleta (anel de cores)
    x.save();
    x.translate(bX - R * 1.1, bY - R * 0.6 + hp.dy);
    x.rotate(tt * 0.6);
    for (let i = 0; i < 12; i++) {
      x.beginPath();
      x.arc(0, 0, 5, (i / 12) * TAU, ((i + 1) / 12) * TAU + 0.02);
      x.arc(0, 0, 2.6, ((i + 1) / 12) * TAU + 0.02, (i / 12) * TAU, true);
      x.closePath();
      x.fillStyle = `hsl(${i * 30},90%,60%)`;
      x.fill();
    }
    circle(x, 0, 0, 5);
    x.strokeStyle = INK;
    x.lineWidth = 0.5;
    x.stroke();
    x.restore();
  }
  // 3) o medidor sobe até 97%
  const sc = seg(tt, T_SCORE, T_SCORE + 1.3);
  if (sc > 0) {
    const n = Math.round(easeOut(sc) * 97);
    const mX = tall ? 22 : 40;
    const mY = tall ? 44 : -16;
    const pop = back(seg(tt, T_SCORE, T_SCORE + 0.4), 2);
    x.save();
    x.translate(mX, mY);
    x.scale(pop * (1 + within(tt, T_SCORE + 1.3, T_SCORE + 1.7, 0.1, 0.3) * 0.2), pop);
    circle(x, 0, 0, 10);
    fs(x, '#fff', 0.8);
    x.strokeStyle = n > 90 ? '#3ddc97' : '#ffb627';
    x.lineWidth = 2;
    x.beginPath();
    x.arc(0, 0, 8, -Math.PI / 2, -Math.PI / 2 + TAU * (n / 100));
    x.stroke();
    label(x, `${n}%`, 0, 0.4, 5, '#2a0b5c', '#fff');
    x.restore();
    if (sc >= 1) for (let i = 0; i < 6; i++) twinkle(x, mX + Math.cos(i + tt * 2) * 15, mY + Math.sin(i * 1.4 + tt * 2) * 13, 1.5, i % 2 ? '#fff' : '#ffd166');
  }
  // 4) respingos no título
  const tk = seg(tt, T_TITLE - 0.3, T_TITLE + 0.5);
  if (tk > 0) {
    const cols = ['#ff5e8a', '#ffd166', '#3ddc97', '#4cc9f0', '#a974ff', TARGET];
    for (let i = 0; i < 9; i++) {
      const k = back(seg(tt, T_TITLE - 0.3 + i * 0.07, T_TITLE + 0.1 + i * 0.07), 2.2);
      if (k <= 0) continue;
      const a = i * 0.7 + 0.3;
      const px = Math.cos(a) * (tall ? 34 : 70) * (0.6 + (i % 3) * 0.2);
      const py = (tall ? -40 : -30) + Math.sin(a * 1.3) * (tall ? 10 : 12);
      splat(x, px, py, 5 * k, cols[i % cols.length], i);
    }
    confetti(x, st, tt, T_TITLE + 0.2, Math.round(50 * st.q), 8, cols);
  }
  x.restore();
}

export default function play(parent: HTMLElement): Promise<void> {
  return playFilm(parent, {
    id: 'cor',
    dur: T_END,
    music: 'cor',
    bg: '#5b3aa8',
    titleCols: ['#ffffff', '#fff6d6', '#ffd166', '#3a0a6a'],
    title: () => t('cor.name', 'Pintou, Ganhou!'),
    tagline: () => t('cor.tagline', 'Memorize a cor e pinte igualzinho!'),
    titleAt: T_TITLE,
    subs: [
      { t: 0.3, icons: ['sparkle'], text: () => t('intro2.co.s1', 'Olhe bem esta cor...') },
      { t: T_PAINT - 0.2, icons: ['paint'], text: () => t('intro2.co.s2', 'Agora pinte igualzinho!') },
      { t: T_SCORE + 0.8, icons: ['star', 'trophy'], text: () => t('intro2.co.s3', 'Quase perfeito!') },
      { t: T_TITLE, icons: [], text: () => '' },
    ],
    cues: [
      { t: 0.3, fn: sfx.pop },
      { t: T_FLIP, fn: sfx.swish },
      { t: T_PAINT, fn: sfx.paint },
      { t: T_PAINT + 1.2, fn: sfx.paint },
      { t: T_PAINT + 2.2, fn: sfx.paint },
      { t: T_SCORE + 1.3, fn: sfx.ding },
      { t: T_TITLE - 0.2, fn: sfx.splat },
    ],
    draw: scene,
  });
}
