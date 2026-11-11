/* ============================================================
 *  FÁBRICA ESTELAR — abertura curta (≈13 s): fábrica no escuro, o SEU Bloop de capacete aperta
 *  o botão vermelho, as luzes acendem, a esteira anda, a prensa carimba estrelas coloridas,
 *  moedas pulam e as estrelas sobem formando o céu do título. 2D procedural.
 * ============================================================ */
import { t } from '../../../i18n';
import { sfx } from '../../../3d/common/sfx';
import { playFilm, type Stage } from '../../_intro2/stage';
import { INK, TAU, back, bloop, circle, confetti, ease, easeOut, fillAll, fs, glow, hop, label, lerp, rays, rr, seg, shadow, star5, twinkle, vgrad, within, type X } from '../../_intro2/draw';

const T_PRESS = 1.6;
const T_LIGHT = 2.0;
const T_BELT = 3.2;
const T_TITLE = 8.6;
const T_END = 13.4;
const STAR = ['#ffd84a', '#5ef0ff', '#ff7ae0'];
const BY = 12; // altura da esteira

function hardHat(x: X, cx: number, cy: number, R: number): void {
  x.beginPath();
  x.ellipse(cx, cy - R * 0.62, R * 0.72, R * 0.55, 0, Math.PI, 0);
  x.closePath();
  fs(x, vgrad(x, cy - R * 1.2, cy - R * 0.6, ['#fff36b', '#ffb627']), R * 0.06);
  rr(x, cx - R * 0.95, cy - R * 0.68, R * 1.9, R * 0.16, R * 0.08);
  fs(x, '#ffb627', R * 0.06);
  x.fillStyle = '#ff7a2e';
  x.fillRect(cx - R * 0.08, cy - R * 1.16, R * 0.16, R * 0.5);
}
function factory(x: X, st: Stage, tt: number, light: number): void {
  fillAll(x, st, vgrad(x, -st.hh, st.hh, ['#2a1a6a', '#5a3aa8']));
  // janelas altas com céu estrelado
  for (let i = -3; i <= 3; i++) {
    rr(x, i * 24 - 8, -46, 16, 22, 3);
    fs(x, '#1a1040', 0.6);
    for (let j = 0; j < 3; j++) twinkle(x, i * 24 - 4 + j * 4, -40 + ((j * 7 + i * 3) % 12), 0.9, '#fff', 0.8);
  }
  // canos
  x.strokeStyle = '#8a7ac8';
  x.lineWidth = 2.4;
  x.beginPath();
  x.moveTo(-st.hw * 3, -18);
  x.lineTo(st.hw + 2, -18);
  x.stroke();
  // lâmpadas de teto
  for (let i = -2; i <= 2; i++) {
    const lx = i * 30;
    x.strokeStyle = INK;
    x.lineWidth = 0.4;
    x.beginPath();
    x.moveTo(lx, -st.hh);
    x.lineTo(lx, -24);
    x.stroke();
    x.beginPath();
    x.moveTo(lx - 5, -20);
    x.lineTo(lx + 5, -20);
    x.lineTo(lx + 2.5, -24);
    x.lineTo(lx - 2.5, -24);
    x.closePath();
    fs(x, '#6a5a9a', 0.4);
    circle(x, lx, -19.6, 1.8);
    fs(x, light > 0 ? '#fff6c0' : '#3a3060', 0.3);
    if (light > 0) {
      x.save();
      x.globalAlpha = light * 0.22;
      x.fillStyle = '#fff2b0';
      x.beginPath();
      x.moveTo(lx - 2, -19);
      x.lineTo(lx + 2, -19);
      x.lineTo(lx + 14, BY + 6);
      x.lineTo(lx - 14, BY + 6);
      x.closePath();
      x.fill();
      x.restore();
    }
  }
  // piso
  x.fillStyle = '#3a2a7a';
  x.fillRect(-st.hw * 3, BY + 10, st.hw * 6, st.hh * 3);
  x.fillStyle = 'rgba(255,255,255,.06)';
  for (let i = -12; i < 12; i++) x.fillRect(i * 10, BY + 10, 0.5, st.hh * 3);
  void tt;
}
/** esteira com roletes girando; off = deslocamento */
function belt(x: X, x0: number, x1: number, off: number): void {
  rr(x, x0, BY, x1 - x0, 5, 2.5);
  fs(x, '#2a1e4a', 0.7);
  x.save();
  rr(x, x0, BY, x1 - x0, 5, 2.5);
  x.clip();
  x.fillStyle = '#4a3a7a';
  for (let px = x0 - 6 + (off % 6); px < x1; px += 6) x.fillRect(px, BY, 3, 1.2);
  x.restore();
  for (let px = x0 + 3; px < x1; px += 8) {
    circle(x, px, BY + 3, 1.5);
    fs(x, '#c8c0e0', 0.3);
  }
  // pernas
  x.fillStyle = '#6a5a9a';
  for (const px of [x0 + 4, x1 - 6]) x.fillRect(px, BY + 5, 2, 6);
}
function scene(st: Stage, tt: number): void {
  const x = st.x;
  const fit = Math.min(1, st.hw / 52);
  const light = ease(seg(tt, T_LIGHT, T_LIGHT + 0.3));
  x.save();
  x.scale(fit, fit);
  factory(x, st, tt, light);
  // escuro antes das luzes
  const run = Math.max(0, tt - T_BELT);
  const off = run * 14;
  belt(x, -70, 70, off);
  // a prensa no meio
  const ph = (run * 0.9) % 1;
  const down = run > 0 ? Math.pow(Math.max(0, Math.sin(ph * TAU)), 6) : 0;
  rr(x, -9, -16, 18, 10, 2);
  fs(x, vgrad(x, -16, -6, ['#ff8fd8', '#a974ff']), 0.7);
  x.fillStyle = '#c8c0e0';
  x.fillRect(-1.5, -6, 3, 3 + down * 7);
  rr(x, -6, -3 + down * 7, 12, 3, 1);
  fs(x, '#ffd23f', 0.6);
  // massinhas -> estrelas
  for (let i = 0; i < 12; i++) {
    const px = -70 + ((i * 12 + off) % 140);
    const yy = BY - 2.6;
    if (run <= 0 && px > -40) continue;
    if (px < 0) {
      x.beginPath();
      x.ellipse(px, yy + 0.5, 3, 2, 0, 0, TAU);
      fs(x, '#b8b0d8', 0.5);
    } else {
      const s = px < 6 ? back((px) / 6) : 1;
      star5(x, px, yy - 1, 3.4 * s, Math.sin(tt * 2 + i) * 0.1);
      fs(x, STAR[i % 3], 0.6);
      twinkle(x, px + 1.2, yy - 2.2, 0.9, '#fff', 0.9);
    }
  }
  // moedas pulando no fim da esteira
  for (let i = 0; i < 4; i++) {
    const k = (run * 0.8 + i / 4) % 1;
    if (run <= 0.4) break;
    const cx = 44 + i * 4;
    const cy = BY - 6 - Math.sin(k * Math.PI) * 18;
    x.save();
    x.translate(cx, cy);
    x.scale(Math.cos(k * 12), 1);
    circle(x, 0, 0, 2.4);
    fs(x, vgrad(x, -2.4, 2.4, ['#fff6b0', '#ffb627']), 0.5);
    x.restore();
  }
  // o chefe da fábrica
  const R = 9;
  const bx = st.tall ? -26 : -46;
  const press = within(tt, T_PRESS - 0.15, T_PRESS + 0.3, 0.1, 0.2);
  const happy = tt > T_LIGHT;
  const hp = happy ? hop(tt, 1.6, 2) : { dy: 0, sx: 1, sy: 1 };
  const by = BY + 10 - R * 1.05 + hp.dy;
  // botão vermelho
  rr(x, bx + 9, BY + 1, 7, 9, 1.5);
  fs(x, '#6a5a9a', 0.5);
  x.beginPath();
  x.ellipse(bx + 12.5, BY + 1 + press * 1.2, 3.4, 1.6, 0, 0, TAU);
  fs(x, '#ff3b5c', 0.5);
  shadow(x, bx, BY + 10, R * 0.9);
  bloop(x, bx, by + press * 1.2, R, { t: tt, sx: hp.sx * (1 + press * 0.08), sy: hp.sy * (1 - press * 0.08), lookX: happy ? 0.5 : 0.7, lookY: happy ? -0.2 : 0.4, mood: 'happy' });
  hardHat(x, bx, by + press * 1.2, R);
  // escuridão sumindo
  if (light < 1) {
    x.save();
    x.globalAlpha = (1 - light) * 0.78;
    fillAll(x, st, '#0a0620');
    x.restore();
    if (tt < T_LIGHT) glow(x, bx + 12.5, BY + 1, 10, 'rgba(255,80,110,.9)', 0.6 + Math.sin(tt * 6) * 0.3);
  }
  // título: as estrelas sobem e viram céu
  if (tt > T_TITLE - 0.6) {
    const k = seg(tt, T_TITLE - 0.6, T_END);
    rays(x, 0, -30, tt * 0.3, 150, `rgba(255,240,160,${(0.14 * ease(k * 3)).toFixed(3)})`, 16, 0.08);
    for (let i = 0; i < 14; i++) {
      const q = easeOut(seg(tt, T_TITLE - 0.6 + i * 0.05, T_TITLE + 1.4 + i * 0.05));
      const a = (i / 14) * TAU + tt * 0.5;
      const px = lerp(-40 + i * 6, Math.cos(a) * 44, q);
      const py = lerp(BY - 4, -30 + Math.sin(a) * 18, q);
      star5(x, px, py, 2.4 + (i % 3), tt + i);
      fs(x, STAR[i % 3], 0.5);
    }
    confetti(x, st, tt, T_TITLE + 0.4, Math.round(40 * st.q), 2, STAR);
  }
  // "+1" de moedas
  if (run > 1) label(x, '+1', 48, BY - 26 - ((run * 0.8) % 1) * 6, 4, '#ffd84a', INK);
  x.restore();
}

export default function play(parent: HTMLElement): Promise<void> {
  return playFilm(parent, {
    id: 'tycoon',
    dur: T_END,
    music: 'tycoon',
    bg: '#0a0620',
    titleCols: ['#ffffff', '#ffe680', '#ffb627', '#2a0b5c'],
    title: () => t('tycoon.name', 'Fábrica Estelar'),
    tagline: () => t('tycoon.tagline', 'Construa a fábrica de estrelas mais brilhante!'),
    titleAt: T_TITLE,
    subs: [
      { t: 0.3, icons: ['bolt'], text: () => t('intro2.ty.s1', 'Hora de ligar a fábrica!') },
      { t: T_BELT + 0.2, icons: ['star', 'coins'], text: () => t('intro2.ty.s2', 'Cada estrela vira moedinha!') },
      { t: 6.0, icons: ['arrow-up'], text: () => t('intro2.ty.s3', 'Melhore as máquinas e cresça sem parar!') },
      { t: T_TITLE, icons: [], text: () => '' },
    ],
    cues: [
      { t: T_PRESS, fn: sfx.press },
      { t: T_LIGHT, fn: sfx.thunk },
      { t: T_BELT, fn: sfx.knob },
      { t: T_BELT + 1.1, fn: sfx.thud },
      { t: T_BELT + 2.2, fn: sfx.thud },
      { t: T_BELT + 3.3, fn: sfx.thud },
    ],
    draw: scene,
  });
}
