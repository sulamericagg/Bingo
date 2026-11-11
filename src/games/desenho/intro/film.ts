/* ============================================================
 *  DESENHA E VIRA! — abertura curta (≈13 s): numa folha de caderno o lápis desenha uma
 *  estrela, o SEU Bloop espia... BUM! a estrela vira um balão fofinho "3D" que quica; uma
 *  bolinha rabiscada vira bola de verdade e rola, e o título aparece. 2D procedural.
 * ============================================================ */
import { t } from '../../../i18n';
import { sfx } from '../../../3d/common/sfx';
import { playFilm, type Stage } from '../../_intro2/stage';
import { INK, TAU, bloop, circle, clamp, confetti, ease, easeOut, fillAll, fs, glow, hop, lerp, rr, seg, shadow, twinkle, vgrad, within, type X } from '../../_intro2/draw';

const T_BOOM = 3.4;
const T_BALL = 5.6;
const T_BOOM2 = 6.8;
const T_TITLE = 8.6;
const T_END = 13.2;
const GY = 18;

function starPts(cx: number, cy: number, R: number, r: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU - Math.PI / 2;
    const rr2 = i % 2 ? r : R;
    out.push([cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2]);
  }
  return out;
}
/** traço de lápis parcial (k = 0..1 do caminho fechado) */
function sketch(x: X, pts: [number, number][], k: number, col = '#2a1e3a'): [number, number] {
  const segs = pts.length;
  const n = k * segs;
  x.strokeStyle = col;
  x.lineWidth = 1.1;
  x.lineCap = 'round';
  x.lineJoin = 'round';
  x.beginPath();
  x.moveTo(pts[0][0], pts[0][1]);
  let tip: [number, number] = pts[0];
  for (let i = 0; i < Math.min(n, segs); i++) {
    const a = pts[i];
    const b = pts[(i + 1) % segs];
    const f = Math.min(1, n - i);
    tip = [lerp(a[0], b[0], f), lerp(a[1], b[1], f)];
    x.lineTo(tip[0], tip[1]);
  }
  x.stroke();
  return tip;
}
function pencil(x: X, px: number, py: number): void {
  x.save();
  x.translate(px, py);
  x.rotate(-0.7);
  rr(x, -1.6, -24, 3.2, 20, 0.6);
  fs(x, '#ffd23d', 0.5);
  x.fillStyle = '#ff8fa8';
  x.fillRect(-1.6, -26.5, 3.2, 2.5);
  x.beginPath();
  x.moveTo(-1.6, -4);
  x.lineTo(1.6, -4);
  x.lineTo(0, 0);
  x.closePath();
  fs(x, '#ffe0b8', 0.4);
  circle(x, 0, -0.6, 0.5);
  x.fillStyle = '#2a1e3a';
  x.fill();
  x.restore();
}
/** estrela fofinha com volume (gradiente + brilho) */
function puffyStar(x: X, cx: number, cy: number, R: number, sx: number, sy: number, rot: number): void {
  x.save();
  x.translate(cx, cy);
  x.rotate(rot);
  x.scale(sx, sy);
  const pts = starPts(0, 0, R, R * 0.55);
  x.beginPath();
  pts.forEach(([a, b], i) => {
    const [na, nb] = pts[(i + 1) % pts.length];
    const mx = (a + na) / 2;
    const my = (b + nb) / 2;
    if (i === 0) x.moveTo(mx, my);
    x.quadraticCurveTo(na, nb, (na + pts[(i + 2) % pts.length][0]) / 2, (nb + pts[(i + 2) % pts.length][1]) / 2);
  });
  x.closePath();
  const g = x.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R * 1.1);
  g.addColorStop(0, '#fff6b0');
  g.addColorStop(0.55, '#ffd23d');
  g.addColorStop(1, '#ff9a1f');
  fs(x, g, R * 0.06);
  x.fillStyle = 'rgba(255,255,255,.75)';
  x.beginPath();
  x.ellipse(-R * 0.25, -R * 0.3, R * 0.2, R * 0.09, -0.6, 0, TAU);
  x.fill();
  // carinha
  x.fillStyle = INK;
  circle(x, -R * 0.16, -R * 0.02, R * 0.07);
  x.fill();
  circle(x, R * 0.16, -R * 0.02, R * 0.07);
  x.fill();
  x.strokeStyle = INK;
  x.lineWidth = R * 0.05;
  x.beginPath();
  x.arc(0, R * 0.08, R * 0.12, 0.3, Math.PI - 0.3);
  x.stroke();
  x.restore();
}
function ball3d(x: X, cx: number, cy: number, r: number, rot: number): void {
  circle(x, cx, cy, r);
  const g = x.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  g.addColorStop(0, '#d8f4ff');
  g.addColorStop(0.6, '#4cc9f0');
  g.addColorStop(1, '#2a6dff');
  fs(x, g, r * 0.08);
  x.save();
  x.beginPath();
  x.arc(cx, cy, r, 0, TAU);
  x.clip();
  x.strokeStyle = 'rgba(255,255,255,.8)';
  x.lineWidth = r * 0.18;
  x.beginPath();
  x.ellipse(cx, cy, r * Math.abs(Math.cos(rot)), r, 0, 0, TAU);
  x.stroke();
  x.restore();
}
function poof(x: X, cx: number, cy: number, k: number, R: number): void {
  if (k <= 0 || k >= 1) return;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    const d = R * (0.4 + k * 1.1);
    circle(x, cx + Math.cos(a) * d, cy + Math.sin(a) * d, R * 0.35 * (1 - k));
    x.fillStyle = `rgba(255,255,255,${1 - k})`;
    x.fill();
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.3;
    twinkle(x, cx + Math.cos(a) * R * (0.6 + k * 1.6), cy + Math.sin(a) * R * (0.6 + k * 1.6), R * 0.18 * (1 - k), ['#ffd23d', '#ff5e8a', '#8a5cff'][i % 3]);
  }
}
function paper(x: X, st: Stage): void {
  fillAll(x, st, vgrad(x, -st.hh, st.hh, ['#ffd23d', '#ff5e8a']));
  x.fillStyle = 'rgba(255,255,255,.18)';
  for (let i = 0; i < 14; i++) {
    circle(x, ((i * 97) % 200) - 100, ((i * 53) % 120) - 60, 2 + (i % 3) * 2);
    x.fill();
  }
  // folha de caderno levemente girada
  x.save();
  x.rotate(-0.03);
  rr(x, -62, -40, 124, 70, 2);
  fs(x, '#fffdf6', 0.9);
  x.strokeStyle = 'rgba(80,140,255,.28)';
  x.lineWidth = 0.4;
  for (let y = -32; y < 30; y += 6) {
    x.beginPath();
    x.moveTo(-60, y);
    x.lineTo(60, y);
    x.stroke();
  }
  x.strokeStyle = 'rgba(255,90,120,.4)';
  x.beginPath();
  x.moveTo(-48, -40);
  x.lineTo(-48, 30);
  x.stroke();
  x.restore();
}
function scene(st: Stage, tt: number): void {
  const x = st.x;
  const fit = Math.min(1, st.hw / 64);
  const z = lerp(1.08, 1.0, ease(seg(tt, 0, T_TITLE)));
  x.save();
  x.scale(fit * z, fit * z);
  paper(x, st);
  // o Bloop espiando pela borda da folha
  const R = 9;
  const peek = easeOut(seg(tt, 0.4, 1.2));
  const cheer = tt > T_BOOM + 0.3;
  const hp = hop(tt, cheer ? 1.9 : 1, cheer ? 2.4 : 0.5);
  const bX = -40;
  shadow(x, bX, GY + 8, R * 0.8);
  bloop(x, bX, lerp(GY + 30, GY + 8 - R * 1.05, peek) + hp.dy, R, { t: tt, sx: hp.sx, sy: hp.sy, lookX: tt < T_BOOM ? 0.8 : 0.6, lookY: tt < T_BOOM ? 0.3 : -0.1, mood: 'happy' });
  // 1) o lápis desenha a estrela
  const sc = 14;
  const sX = 8;
  const sY = -8;
  const pts = starPts(sX, sY, sc, sc * 0.48);
  const dk = seg(tt, 0.6, T_BOOM - 0.4);
  if (tt < T_BOOM) {
    const tip = sketch(x, pts, dk);
    pencil(x, tip[0], tip[1]);
  }
  // 2) BUM: vira estrela fofinha que quica
  poof(x, sX, sY, seg(tt, T_BOOM, T_BOOM + 0.7), sc);
  if (tt >= T_BOOM) {
    const k = tt - T_BOOM;
    const pop = Math.min(1, k / 0.25);
    const bounceH = Math.abs(Math.sin(k * 3.2)) * 16 * Math.exp(-k * 0.25);
    const land = Math.pow(Math.max(0, Math.cos(k * 3.2)), 12);
    const cy = lerp(sY, GY - sc * 0.75, Math.min(1, k / 0.6)) - (k > 0.6 ? bounceH : 0);
    shadow(x, sX, GY + 2, sc * 0.9 * (1 - bounceH / 40));
    puffyStar(x, sX, cy, sc * pop * 0.82, 1 + land * 0.12, 1 - land * 0.12, Math.sin(k * 2) * 0.12);
  }
  // 3) uma bolinha rabiscada vira bola e rola
  const bk = seg(tt, T_BALL, T_BOOM2 - 0.2);
  const ballPts: [number, number][] = Array.from({ length: 16 }, (_, i) => [42 + Math.cos((i / 16) * TAU) * 6, GY - 6 + Math.sin((i / 16) * TAU) * 6]);
  if (tt >= T_BALL && tt < T_BOOM2) {
    const tip = sketch(x, ballPts, bk);
    pencil(x, tip[0], tip[1]);
  }
  poof(x, 42, GY - 6, seg(tt, T_BOOM2, T_BOOM2 + 0.6), 7);
  if (tt >= T_BOOM2) {
    const k = tt - T_BOOM2;
    const rx = 42 - Math.min(k, 3) * 6 - Math.max(0, k - 3) * 1;
    shadow(x, rx, GY + 2, 5);
    ball3d(x, rx, GY - 4 - Math.abs(Math.sin(k * 5)) * 2 * Math.exp(-k), 6 * Math.min(1, k / 0.2), -rx * 0.18);
  }
  // brilho no título
  if (tt > T_TITLE - 0.4) glow(x, 0, -30, 60, 'rgba(255,255,255,.35)', within(tt, T_TITLE - 0.4, T_END, 0.6, 0.6));
  confetti(x, st, tt, T_TITLE + 0.2, Math.round(55 * st.q), 13, ['#ffd23d', '#ff5e8a', '#8a5cff', '#4cc9f0', '#fff']);
  x.restore();
  void clamp;
}

export default function play(parent: HTMLElement): Promise<void> {
  return playFilm(parent, {
    id: 'desenho',
    dur: T_END,
    music: 'desenho',
    bg: '#ff9a4a',
    titleCols: ['#fff3a0', '#ff9a1f', '#ff5e3a', '#4a1060'],
    title: () => t('dv.name', 'Desenha e Vira!'),
    tagline: () => t('dv.tagline', 'Desenhe com o dedo e veja virar 3D!'),
    titleAt: T_TITLE,
    subs: [
      { t: 0.3, icons: ['pencil'], text: () => t('intro2.dv.s1', 'Desenhe qualquer coisa...') },
      { t: T_BOOM + 0.1, icons: ['sparkle'], text: () => t('intro2.dv.s2', 'BUM! Virou de verdade!') },
      { t: T_BALL + 0.2, icons: ['ball'], text: () => t('intro2.dv.s3', 'E dá para brincar com tudo!') },
      { t: T_TITLE, icons: [], text: () => '' },
    ],
    cues: [
      { t: 0.6, fn: sfx.scrub },
      { t: T_BOOM, fn: sfx.poof },
      { t: T_BOOM + 0.7, fn: sfx.boing },
      { t: T_BALL, fn: sfx.scrub },
      { t: T_BOOM2, fn: sfx.poof },
    ],
    draw(st, tt) {
      scene(st, tt);
      if (tt >= T_BOOM && tt < T_BOOM + 0.1) st.flash(0.5);
    },
  });
}
