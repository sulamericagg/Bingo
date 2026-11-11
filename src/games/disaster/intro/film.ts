/* ============================================================
 *  SOBREVIVA AOS DESASTRES — ABERTURA (≈27 s, "Pular" sempre visível; 1ª partida + rever no menu).
 *   1. Sala de casa, TV ligada: o SEU Bloop é o âncora do "Plantão Bloop" — ALERTA DE DESASTRES!
 *      (câmera entra na TV; faixa vermelha correndo).
 *   2. A roleta gira (tique-tique-tique)... e a montagem: tsunami, tornado, enchente de chocolate
 *      na cidade de doces (a roletinha continua girando no canto).
 *   3. Travelling: o Bloop e os amigos correm, o chocolate vem atrás, e eles sobem na torre.
 *   4. Lá de cima, todo mundo a salvo: comemoração, confete e o título.
 *  2D procedural (src/games/_intro2), cores da cidade de doces do jogo, música 'disaster'.
 * ============================================================ */
import { t } from '../../../i18n';
import { music } from '../../../audio';
import { sfx } from '../../../3d/common/sfx';
import { playFilm, type Stage } from '../../_intro2/stage';
import {
  INK, TAU, back, bloop, circle, clamp, cloud, confetti, dip, ease, easeIn, easeOut, fillAll, friendSkins, fs, glow, hop, label,
  lerp, rays, rng, rr, seg, shadow, star5, twinkle, vgrad, type X,
} from '../../_intro2/draw';

const T_WHEEL = 6.8;
const T_MONT = 9.0;
const V = 1.85; // duração de cada desastre da montagem
const T_RUN = T_MONT + V * 3;
const T_SAFE = T_RUN + 6.2;
const T_END = T_SAFE + 6.4;

/* ------------------------------ ícones da roleta ------------------------------ */
type Dz = 'wave' | 'tornado' | 'choco' | 'meteor' | 'volcano' | 'snow' | 'bolt' | 'ufo';
const WHEEL: { k: Dz; c: string }[] = [
  { k: 'wave', c: '#4cc9f0' },
  { k: 'tornado', c: '#a9b8d8' },
  { k: 'choco', c: '#ff9ec4' },
  { k: 'meteor', c: '#ffb03a' },
  { k: 'volcano', c: '#ff6b5a' },
  { k: 'snow', c: '#c8f0ff' },
  { k: 'bolt', c: '#ffe14d' },
  { k: 'ufo', c: '#9be86b' },
];
function dzIcon(x: X, k: Dz, s: number): void {
  const lw = s * 0.12;
  if (k === 'wave') {
    x.beginPath();
    x.moveTo(-s, s * 0.6);
    x.quadraticCurveTo(-s * 0.9, -s * 0.9, s * 0.3, -s * 0.8);
    x.quadraticCurveTo(s * 0.9, -s * 0.7, s * 0.8, -s * 0.1);
    x.quadraticCurveTo(s * 0.3, -s * 0.5, 0, -s * 0.1);
    x.quadraticCurveTo(s * 0.3, s * 0.3, s, s * 0.6);
    x.closePath();
    fs(x, '#2a8dff', lw);
    x.beginPath();
    x.arc(s * 0.35, -s * 0.45, s * 0.22, Math.PI, TAU);
    x.strokeStyle = '#fff';
    x.lineWidth = lw;
    x.stroke();
  } else if (k === 'tornado') {
    for (let i = 0; i < 4; i++) {
      const w = s * (1 - i * 0.22);
      x.beginPath();
      x.ellipse(i * s * 0.08, -s * 0.6 + i * s * 0.42, w, s * 0.2, 0, 0, TAU);
      fs(x, i % 2 ? '#c8d0e8' : '#8a96b8', lw * 0.8);
    }
  } else if (k === 'choco') {
    x.beginPath();
    x.moveTo(0, -s);
    x.bezierCurveTo(s * 0.2, -s * 0.4, s * 0.8, 0, s * 0.8, s * 0.35);
    x.arc(0, s * 0.35, s * 0.8, 0, Math.PI);
    x.bezierCurveTo(-s * 0.8, 0, -s * 0.2, -s * 0.4, 0, -s);
    fs(x, '#7a3f1f', lw);
    x.beginPath();
    x.ellipse(-s * 0.3, s * 0.2, s * 0.14, s * 0.26, 0.4, 0, TAU);
    x.fillStyle = 'rgba(255,255,255,.6)';
    x.fill();
  } else if (k === 'meteor') {
    x.beginPath();
    x.moveTo(-s, -s);
    x.lineTo(s * 0.1, -s * 0.1);
    x.lineTo(-s * 0.3, s * 0.3);
    x.closePath();
    x.fillStyle = '#ffd23f';
    x.fill();
    circle(x, s * 0.25, s * 0.25, s * 0.55);
    fs(x, '#a0705a', lw);
  } else if (k === 'volcano') {
    x.beginPath();
    x.moveTo(-s, s * 0.8);
    x.lineTo(-s * 0.3, -s * 0.4);
    x.lineTo(s * 0.3, -s * 0.4);
    x.lineTo(s, s * 0.8);
    x.closePath();
    fs(x, '#8a5a4a', lw);
    x.beginPath();
    x.moveTo(-s * 0.3, -s * 0.4);
    x.quadraticCurveTo(0, -s * 1.1, s * 0.3, -s * 0.4);
    x.lineTo(s * 0.1, 0);
    x.lineTo(-s * 0.1, -s * 0.1);
    x.closePath();
    fs(x, '#ff5a2a', lw * 0.8);
  } else if (k === 'snow') {
    x.strokeStyle = '#2a8dff';
    x.lineWidth = lw * 1.4;
    x.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 3;
      x.beginPath();
      x.moveTo(Math.cos(a) * s, Math.sin(a) * s);
      x.lineTo(-Math.cos(a) * s, -Math.sin(a) * s);
      x.stroke();
    }
  } else if (k === 'bolt') {
    x.beginPath();
    x.moveTo(s * 0.2, -s);
    x.lineTo(-s * 0.5, s * 0.15);
    x.lineTo(0, s * 0.15);
    x.lineTo(-s * 0.2, s);
    x.lineTo(s * 0.55, -s * 0.2);
    x.lineTo(s * 0.05, -s * 0.2);
    x.closePath();
    fs(x, '#ffd23f', lw);
  } else {
    x.beginPath();
    x.ellipse(0, -s * 0.15, s * 0.45, s * 0.4, 0, Math.PI, 0);
    fs(x, '#bff3ff', lw);
    x.beginPath();
    x.ellipse(0, s * 0.05, s, s * 0.3, 0, 0, TAU);
    fs(x, '#9be86b', lw);
  }
}
/** roleta com ponteiro; rot = ângulo atual */
function wheel(x: X, cx: number, cy: number, R: number, rot: number, tt: number): void {
  x.save();
  x.translate(cx, cy);
  glow(x, 0, 0, R * 1.6, 'rgba(255,220,120,.55)');
  // lâmpadas em volta
  circle(x, 0, 0, R * 1.12);
  fs(x, '#ff5a7a', R * 0.05);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    circle(x, Math.cos(a) * R * 1.06, Math.sin(a) * R * 1.06, R * 0.045);
    x.fillStyle = (i + Math.floor(tt * 8)) % 2 ? '#fff6b0' : '#ffb03a';
    x.fill();
  }
  x.rotate(rot);
  const n = WHEEL.length;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU - Math.PI / 2 - Math.PI / n;
    x.beginPath();
    x.moveTo(0, 0);
    x.arc(0, 0, R, a0, a0 + TAU / n);
    x.closePath();
    fs(x, WHEEL[i].c, R * 0.03);
    const am = a0 + Math.PI / n;
    x.save();
    x.translate(Math.cos(am) * R * 0.66, Math.sin(am) * R * 0.66);
    x.rotate(am + Math.PI / 2);
    dzIcon(x, WHEEL[i].k, R * 0.16);
    x.restore();
  }
  x.rotate(-rot);
  circle(x, 0, 0, R * 0.16);
  fs(x, vgrad(x, -R * 0.16, R * 0.16, ['#fff6b0', '#ffb03a']), R * 0.04);
  // ponteiro em cima
  x.beginPath();
  x.moveTo(-R * 0.12, -R * 1.2);
  x.lineTo(R * 0.12, -R * 1.2);
  x.lineTo(0, -R * 0.92);
  x.closePath();
  fs(x, '#fff', R * 0.04);
  x.restore();
}
/** ângulo da roleta parando na fatia `idx` em `t1` (gira rápido e desacelera) */
function spinTo(tt: number, t0: number, t1: number, idx: number, turns = 4): number {
  const k = easeOut(seg(tt, t0, t1));
  const target = -(idx / WHEEL.length) * TAU - turns * TAU;
  return target * k;
}

/* ------------------------------ cidade de doces ------------------------------ */
const GY = 24;
const HOUSES = [
  { x: -96, w: 22, h: 20, wall: '#ffd9a8', roof: '#e2574c' },
  { x: -68, w: 18, h: 26, wall: '#cfe8ff', roof: '#9b5de5' },
  { x: -44, w: 24, h: 18, wall: '#f6c9e4', roof: '#d9822b' },
  { x: -14, w: 20, h: 24, wall: '#d5f5c8', roof: '#ff5fa2' },
  { x: 12, w: 22, h: 19, wall: '#fff1a8', roof: '#3fa7e0' },
  { x: 40, w: 18, h: 27, wall: '#ffd0c0', roof: '#7a5cff' },
  { x: 64, w: 24, h: 20, wall: '#cfe8ff', roof: '#ff8a3d' },
  { x: 92, w: 20, h: 23, wall: '#f6c9e4', roof: '#3ddc97' },
];
function sky(x: X, st: Stage, top: string, bot: string): void {
  fillAll(x, st, vgrad(x, -st.hh, GY, [top, bot]));
}
function house(x: X, h: (typeof HOUSES)[0], ox: number, tilt = 0, lift = 0): void {
  x.save();
  x.translate(h.x + ox + h.w / 2, GY - lift);
  x.rotate(tilt);
  rr(x, -h.w / 2, -h.h, h.w, h.h, 1.2);
  fs(x, h.wall, 0.6);
  // telhado de bala (listrado)
  x.beginPath();
  x.moveTo(-h.w / 2 - 2, -h.h);
  x.lineTo(0, -h.h - h.w * 0.5);
  x.lineTo(h.w / 2 + 2, -h.h);
  x.closePath();
  fs(x, h.roof, 0.6);
  x.save();
  x.clip();
  x.strokeStyle = 'rgba(255,255,255,.45)';
  x.lineWidth = 1.4;
  for (let i = -6; i < 6; i++) {
    x.beginPath();
    x.moveTo(i * 4, -h.h);
    x.lineTo(i * 4 + 8, -h.h - h.w);
    x.stroke();
  }
  x.restore();
  rr(x, -h.w * 0.32, -h.h * 0.65, h.w * 0.26, h.w * 0.22, 0.6);
  fs(x, '#fff6c8', 0.4);
  rr(x, h.w * 0.08, -h.h * 0.42, h.w * 0.24, h.h * 0.42, 0.6);
  fs(x, '#c97a4a', 0.4);
  x.restore();
}
function town(x: X, st: Stage, tt: number, ox = 0, tilt: (i: number) => number = () => 0): void {
  // morros de sorvete ao fundo
  x.fillStyle = '#ffc6e0';
  x.beginPath();
  x.moveTo(-st.hw - 10, GY);
  for (let i = 0; i <= 30; i++) {
    const px = -st.hw - 10 + (i / 30) * (st.hw * 2 + 20);
    x.lineTo(px, GY - 16 - Math.sin(px * 0.05 + 1) * 6);
  }
  x.lineTo(st.hw + 10, GY);
  x.fill();
  for (let i = 0; i < HOUSES.length; i++) house(x, HOUSES[i], ox, tilt(i));
  // pirulitos
  for (let i = 0; i < 5; i++) {
    const px = -110 + i * 52 + ox;
    x.strokeStyle = '#fff';
    x.lineWidth = 0.9;
    x.beginPath();
    x.moveTo(px, GY);
    x.lineTo(px, GY - 12);
    x.stroke();
    circle(x, px, GY - 14, 3.2);
    fs(x, ['#ff5fa2', '#4cc9f0', '#ffd23f'][i % 3], 0.5);
    x.strokeStyle = 'rgba(255,255,255,.8)';
    x.lineWidth = 0.6;
    x.beginPath();
    x.arc(px, GY - 14, 1.6, tt * 2, tt * 2 + 4);
    x.stroke();
  }
  x.fillStyle = '#7ad35a';
  x.fillRect(-st.hw * 3, GY, st.hw * 6, st.hh * 3);
  x.fillStyle = '#5ab84a';
  x.fillRect(-st.hw * 3, GY, st.hw * 6, 1.4);
}

/* ------------------------------ 1. TV ------------------------------ */
function sceneTV(st: Stage, tt: number): void {
  const x = st.x;
  const push = easeIn(seg(tt, 4.6, T_WHEEL));
  const z = lerp(1.2, 3.6, push) * Math.min(1, st.hw / 60);
  x.save();
  x.scale(z, z);
  x.translate(0, lerp(0, 4, push));
  // sala aconchegante
  fillAll(x, st, vgrad(x, -st.hh, 30, ['#6a5acd', '#8a6ad8']));
  x.fillStyle = 'rgba(255,255,255,.07)';
  for (let i = -12; i < 12; i++) x.fillRect(i * 10, -st.hh - 2, 4, st.hh * 2);
  x.fillStyle = '#c98a5a';
  x.fillRect(-st.hw * 3, 26, st.hw * 6, st.hh * 3);
  // abajur e planta
  rr(x, -54, 4, 3, 22, 1);
  fs(x, '#8a5a3a', 0.5);
  x.beginPath();
  x.moveTo(-60, 4);
  x.lineTo(-45, 4);
  x.lineTo(-49, -6);
  x.lineTo(-56, -6);
  x.closePath();
  fs(x, '#ffd27a', 0.6);
  glow(x, -52.5, 0, 22, 'rgba(255,220,140,.45)');
  rr(x, 46, 16, 10, 10, 2);
  fs(x, '#ff8a5c', 0.5);
  for (let i = -2; i <= 2; i++) {
    x.beginPath();
    x.ellipse(51 + i * 2, 10, 1.6, 6, i * 0.3, 0, TAU);
    fs(x, '#4fbf6a', 0.4);
  }
  // móvel + TV
  rr(x, -30, 18, 60, 8, 1.5);
  fs(x, '#a8704a', 0.7);
  x.strokeStyle = INK;
  x.lineWidth = 0.8;
  x.beginPath();
  x.moveTo(-4, -22);
  x.lineTo(-12, -34);
  x.moveTo(4, -22);
  x.lineTo(13, -33);
  x.stroke();
  circle(x, -12, -34, 1.2);
  fs(x, '#ff5a5a', 0.5);
  circle(x, 13, -33, 1.2);
  fs(x, '#ff5a5a', 0.5);
  rr(x, -30, -22, 60, 40, 5);
  fs(x, vgrad(x, -22, 18, ['#ffb86b', '#e08a3a']), 0.9);
  rr(x, -26, -18, 44, 32, 3.5);
  fs(x, '#1a1030', 0.6);
  for (let i = 0; i < 2; i++) {
    circle(x, 23, -10 + i * 8, 2);
    fs(x, '#fff1c8', 0.5);
  }
  // a tela
  x.save();
  rr(x, -25, -17, 42, 30, 3);
  x.clip();
  x.translate(-4, -2);
  newsroom(x, tt);
  // reflexo e linhas
  x.fillStyle = 'rgba(255,255,255,.06)';
  for (let i = -16; i < 16; i += 1.2) x.fillRect(-22, i, 44, 0.35);
  x.restore();
  rr(x, -26, -18, 44, 32, 3.5);
  x.save();
  x.clip();
  x.fillStyle = 'rgba(255,255,255,.12)';
  x.beginPath();
  x.moveTo(-26, -18);
  x.lineTo(-6, -18);
  x.lineTo(-22, 14);
  x.lineTo(-26, 14);
  x.fill();
  x.restore();
  x.restore();
}
/** o estúdio do Plantão Bloop (dentro da TV; ~44×30, centro 0,0) */
function newsroom(x: X, tt: number): void {
  const blink = Math.sin(tt * 9) > 0;
  fillAll(x, { hw: 30, hh: 20 }, vgrad(x, -16, 16, ['#2a4fae', '#163070']));
  x.translate(0, 0);
  // mapa do mundo estilizado ao fundo
  x.fillStyle = 'rgba(120,180,255,.35)';
  for (const [a, b, r] of [[-12, -6, 5], [-4, -3, 4], [8, -7, 6], [13, 0, 3], [-10, 2, 3]]) {
    x.beginPath();
    x.ellipse(a, b, r, r * 0.6, 0.3, 0, TAU);
    x.fill();
  }
  // sinal de alerta piscando
  x.save();
  x.translate(13, -7);
  x.scale(blink ? 1.08 : 1, blink ? 1.08 : 1);
  x.beginPath();
  x.moveTo(0, -5);
  x.lineTo(5.5, 4.5);
  x.lineTo(-5.5, 4.5);
  x.closePath();
  fs(x, blink ? '#ffe14d' : '#ffb03a', 0.6);
  label(x, '!', 0, 1.2, 6, '#2a0b5c', '#ffe14d');
  x.restore();
  // âncora (o SEU Bloop)
  const R = 7.5;
  const talk = Math.abs(Math.sin(tt * 7)) * (tt > 0.5 && tt < 6 ? 1 : 0);
  bloop(x, -5, -3, R, { t: tt, mood: 'happy', lookX: 0, lookY: 0.1, sy: 1 + talk * 0.03, sx: 1 - talk * 0.015 });
  // gravatinha
  x.beginPath();
  x.moveTo(-5, -3 + R * 0.5);
  x.lineTo(-6.3, -3 + R * 0.85);
  x.lineTo(-5, -3 + R * 1.0);
  x.lineTo(-3.7, -3 + R * 0.85);
  x.closePath();
  fs(x, '#ff3b5c', 0.35);
  // bancada
  rr(x, -19, 3, 28, 7, 1.5);
  fs(x, vgrad(x, 3, 10, ['#ffffff', '#c8d4ff']), 0.5);
  label(x, t('intro2.dz.news', 'PLANTÃO BLOOP'), -5, 6.4, 2.6, '#2a4fae', '#fff', 24);
  // microfone
  x.strokeStyle = INK;
  x.lineWidth = 0.5;
  x.beginPath();
  x.moveTo(3, 3);
  x.lineTo(0.8, 0.5);
  x.stroke();
  circle(x, 0.5, 0.2, 0.9);
  fs(x, '#555', 0.3);
  // faixa vermelha com o letreiro correndo
  x.fillStyle = blink ? '#ff2e4a' : '#e01e3a';
  x.fillRect(-24, 10, 48, 6);
  const msg = t('intro2.dz.alert', 'ALERTA DE DESASTRES!');
  x.save();
  x.beginPath();
  x.rect(-12, 10, 36, 6);
  x.clip();
  x.font = '800 3.6px Fredoka, system-ui, sans-serif';
  const mw = x.measureText(msg).width + 14;
  const off = (tt * 10) % mw;
  for (let i = 0; i < 4; i++) label(x, msg, -12 + mw / 2 - off + i * mw, 13, 3.6, '#fff', '#8a0018', 0, 'center');
  x.restore();
  x.fillStyle = '#ffe14d';
  x.fillRect(-24, 10, 12, 6);
  circle(x, -21.4, 13, 0.9);
  x.fillStyle = blink ? '#e01e3a' : '#ff8a9a';
  x.fill();
  label(x, t('intro2.dz.live', 'AO VIVO'), -16.4, 13, 2.3, '#e01e3a', '#ffe14d', 7.6);
}

/* ------------------------------ 2. roleta e montagem ------------------------------ */
function sceneWheel(st: Stage, tt: number): void {
  const x = st.x;
  fillAll(x, st, vgrad(x, -st.hh, st.hh, ['#25427e', '#0d1830']));
  rays(x, 0, 0, tt * 0.5, 160, 'rgba(255,200,90,.12)', 18, 0.08);
  const R = 30 * back(seg(tt, T_WHEEL, T_WHEEL + 0.6));
  if (R > 0.5) wheel(x, 0, -2, R, spinTo(tt, T_WHEEL + 0.3, T_MONT, 0, 3), tt);
  for (let i = 0; i < 10; i++) twinkle(x, Math.cos(i * 2.3) * 70, Math.sin(i * 1.7) * 38, 1.4 + Math.sin(tt * 4 + i), '#ffe14d', 0.8);
}
function vignetteCard(x: X, st: Stage, tt: number, t0: number, txt: string, col: string): void {
  const k = back(seg(tt, t0 + 0.1, t0 + 0.45), 2.2);
  const out = seg(tt, t0 + V - 0.3, t0 + V);
  if (k <= 0) return;
  x.save();
  x.translate(0, -st.hh * 0.62 + 4);
  x.rotate(-0.04);
  x.scale(k * (1 - out), k * (1 - out));
  rr(x, -36, -6, 72, 12, 6);
  fs(x, col, 0.9);
  label(x, txt, 0, 0.2, 7, '#fff', INK, 66);
  x.restore();
}
function miniWheel(x: X, st: Stage, tt: number, idx: number, t0: number): void {
  const cx = -st.hw + 16;
  const cy = -st.hh + 16 + (st.tall ? 8 : 6);
  wheel(x, cx, cy, 9, spinTo(tt, t0 - 0.9, t0 + 0.1, idx, 2), tt);
}
function tsunami(st: Stage, tt: number, t0: number): void {
  const x = st.x;
  const k = seg(tt, t0, t0 + V);
  sky(x, st, '#5aa8ff', '#c8ecff');
  cloud(x, -40, -30, 5);
  cloud(x, 50, -36, 4);
  const front = lerp(-st.hw - 30, st.hw + 30, k);
  town(x, st, tt, 0, (i) => {
    const hx = HOUSES[i].x + HOUSES[i].w / 2;
    return front > hx - 8 ? clamp((front - hx + 8) / 30) * 0.25 : 0;
  });
  // onda: corpo baixo (molha as casas) + crista enrolada na frente
  x.save();
  x.translate(front, 0);
  x.beginPath();
  x.moveTo(-400, st.hh * 3);
  x.lineTo(-400, 12);
  for (let px = -400; px < -26; px += 8) x.lineTo(px, 12 + Math.sin(px * 0.2 + tt * 5) * 1.2);
  x.quadraticCurveTo(-8, 6, 0, -10);
  x.quadraticCurveTo(6, -18, 15, -16);
  x.quadraticCurveTo(22, -13, 19, -6);
  x.quadraticCurveTo(14, -11, 9, -7);
  x.quadraticCurveTo(10, 8, 20, GY + 2);
  x.lineTo(20, st.hh * 3);
  x.closePath();
  fs(x, vgrad(x, -16, GY, ['#7adcff', '#1e6fd8']), 0.9);
  x.strokeStyle = 'rgba(255,255,255,.5)';
  x.lineWidth = 0.8;
  x.beginPath();
  x.moveTo(-20, 12);
  x.quadraticCurveTo(-6, 8, 0, -6);
  x.stroke();
  // espuma
  x.fillStyle = '#ffffff';
  for (let i = 0; i < 6; i++) {
    circle(x, 2 + i * 3, -14 - Math.sin((i / 5) * Math.PI) * 3 + Math.sin(tt * 10 + i) * 0.5, 2.3 - i * 0.15);
    x.fill();
  }
  for (let i = 0; i < 14; i++) {
    circle(x, -24 - i * 10, 11.6 + Math.sin(tt * 4 + i) * 1, 2);
    x.fill();
  }
  x.restore();
  for (let i = 0; i < 6; i++) twinkle(x, front + 10 + Math.cos(i + tt * 6) * 8, -20 + Math.sin(i * 2 + tt * 5) * 6, 1.4, '#fff');
  miniWheel(x, st, tt, 0, t0);
  vignetteCard(x, st, tt, t0, t('intro2.dz.wave', 'TSUNAMI!'), '#2a8dff');
}
function tornado(st: Stage, tt: number, t0: number): void {
  const x = st.x;
  const k = seg(tt, t0, t0 + V);
  sky(x, st, '#8a96c8', '#e0e4f4');
  cloud(x, -60, -38, 7, '#c8cce0');
  cloud(x, 20, -40, 8, '#c8cce0');
  town(x, st, tt);
  const cx = lerp(-30, 30, k);
  // funil em camadas girando
  for (let i = 0; i < 9; i++) {
    const y = GY - 2 - i * 6.5;
    const w = 4 + i * 3.2;
    const sway = Math.sin(tt * 3 + i * 0.6) * (i * 0.6);
    x.beginPath();
    x.ellipse(cx + sway, y, w, 2.6 + i * 0.25, 0, 0, TAU);
    fs(x, i % 2 ? 'rgba(200,208,232,.95)' : 'rgba(150,160,196,.95)', 0.5);
    x.strokeStyle = 'rgba(255,255,255,.6)';
    x.lineWidth = 0.5;
    x.beginPath();
    x.ellipse(cx + sway, y, w * 0.7, 1.4, 0, tt * 6 + i, tt * 6 + i + 2);
    x.stroke();
  }
  // doces voando em volta
  const R = rng(5);
  for (let i = 0; i < 7; i++) {
    const a = tt * (3 + R()) + i;
    const rr2 = 12 + R() * 14;
    const py = GY - 12 - R() * 36;
    const px = cx + Math.cos(a) * rr2;
    const front = Math.sin(a) > 0;
    x.save();
    x.translate(px, py);
    x.rotate(a * 2);
    x.globalAlpha = front ? 1 : 0.6;
    if (i % 3 === 0) {
      rr(x, -2.4, -1.2, 4.8, 2.4, 1.2);
      fs(x, '#ff5fa2', 0.4);
    } else if (i % 3 === 1) {
      star5(x, 0, 0, 2.2);
      fs(x, '#ffd23f', 0.4);
    } else {
      circle(x, 0, 0, 1.8);
      fs(x, '#4cc9f0', 0.4);
    }
    x.restore();
  }
  miniWheel(x, st, tt, 1, t0);
  vignetteCard(x, st, tt, t0, t('intro2.dz.tornado', 'TORNADO!'), '#7a86b8');
}
/** superfície de chocolate brilhante no nível y */
function chocolate(x: X, st: { hh: number }, tt: number, level: number, x0 = -400, x1 = 400): void {
  x.beginPath();
  x.moveTo(x0, st.hh + 10);
  for (let px = x0; px <= x1; px += 4) x.lineTo(px, level + Math.sin(px * 0.12 + tt * 3) * 1.2 + Math.sin(px * 0.05 - tt * 2) * 1.0);
  x.lineTo(x1, st.hh + 10);
  x.closePath();
  fs(x, vgrad(x, level - 2, level + 30, ['#9a5a2f', '#5a2e14']), 0.9);
  // brilho
  x.strokeStyle = 'rgba(255,230,200,.55)';
  x.lineWidth = 0.8;
  x.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    const px = x0 + ((i * 37 + tt * 6) % (x1 - x0));
    x.beginPath();
    x.moveTo(px, level + 2.6 + (i % 3));
    x.lineTo(px + 5, level + 2.4 + (i % 3));
    x.stroke();
  }
}
function chocoFlood(st: Stage, tt: number, t0: number): void {
  const x = st.x;
  const k = seg(tt, t0, t0 + V);
  sky(x, st, '#ff9ec4', '#ffe0c8');
  cloud(x, -50, -32, 5);
  cloud(x, 40, -38, 6);
  town(x, st, tt);
  const level = lerp(GY + 6, GY - 13, easeOut(k));
  chocolate(x, st, tt, level);
  // pirulito boiando
  x.save();
  x.translate(lerp(-40, 20, k), level - 1.5);
  x.rotate(Math.sin(tt * 2) * 0.3 + 1.2);
  x.strokeStyle = '#fff';
  x.lineWidth = 1;
  x.beginPath();
  x.moveTo(0, 0);
  x.lineTo(0, 8);
  x.stroke();
  circle(x, 0, -2, 3);
  fs(x, '#4cc9f0', 0.5);
  x.restore();
  // gotas espirrando
  for (let i = 0; i < 5; i++) {
    const kk = (tt * 1.4 + i / 5) % 1;
    const px = -60 + i * 30;
    circle(x, px + kk * 4, level - Math.sin(kk * Math.PI) * 8, 1.2);
    fs(x, '#7a3f1f', 0.3);
  }
  miniWheel(x, st, tt, 2, t0);
  vignetteCard(x, st, tt, t0, t('intro2.dz.choco', 'ENCHENTE DE CHOCOLATE!'), '#8a4a22');
}

/* ------------------------------ 3. a corrida ------------------------------ */
const TOWER_X = 150;
function tower(x: X, ox: number): void {
  const bx = TOWER_X + ox;
  // morro de degraus de bolo (do mais alto para o da frente)
  const cols = ['#ffe14d', '#ffd27a', '#ffb86b', '#ff9a5a', '#ff7a5a'];
  for (let i = 4; i >= 0; i--) {
    const x0 = bx - 24 + i * 6;
    const top = GY - (i + 1) * 8;
    rr(x, x0, top, bx + 44 - x0, GY - top + 2, 1.5);
    fs(x, cols[i], 0.7);
    // cobertura
    x.fillStyle = 'rgba(255,255,255,.55)';
    x.fillRect(x0 + 0.8, top + 0.8, 5, 1.2);
  }
  x.strokeStyle = INK;
  x.lineWidth = 0.8;
  x.beginPath();
  x.moveTo(bx + 38, GY - 40);
  x.lineTo(bx + 38, GY - 58);
  x.stroke();
  x.beginPath();
  x.moveTo(bx + 38, GY - 58);
  x.lineTo(bx + 47, GY - 54.5);
  x.lineTo(bx + 38, GY - 51);
  x.closePath();
  fs(x, '#3ddc97', 0.6);
}
/** posição de um corredor (sobe os degraus no fim) */
function runner(tt: number, i: number): { x: number; y: number } {
  const k = seg(tt, T_RUN, T_SAFE - 0.4);
  const xw = lerp(-60 - i * 12, TOWER_X + 6 + (3 - i) * 8, easeOut(k));
  // altura: degraus
  const rel = xw - (TOWER_X - 22);
  const step = clamp(Math.floor(rel / 6) + 1, 0, 5);
  const y = GY - Math.min(40, step * 8);
  return { x: xw, y };
}
function sceneRun(st: Stage, tt: number): void {
  const x = st.x;
  const k = seg(tt, T_RUN, T_SAFE);
  const fit = Math.min(1, st.hw / 70);
  const camX = lerp(-20, TOWER_X - 10, ease(clamp(k * 1.15)));
  const camY = lerp(0, -14, ease(seg(tt, T_SAFE - 2.4, T_SAFE)));
  x.save();
  x.scale(fit, fit);
  sky(x, st, '#ffb08a', '#ffe8c8');
  // sol baixando
  glow(x, 40, -30, 30, 'rgba(255,240,180,.8)');
  circle(x, 40, -30, 8);
  x.fillStyle = '#fff3b0';
  x.fill();
  x.translate(-camX * 0.3, -camY * 0.3);
  for (let i = 0; i < 6; i++) cloud(x, -80 + i * 60, -36 + (i % 2) * 8, 4 + (i % 3), '#fff', 0.85);
  x.translate(-camX * 0.7, -camY * 0.7);
  // cidade passando (duas cópias)
  town(x, st, tt, -40);
  town(x, st, tt, 170);
  x.fillStyle = '#7ad35a';
  x.fillRect(-200, GY, 600, 80);
  tower(x, 0);
  // o chocolate vem atrás
  const front = Math.min(runner(tt, 3).x - lerp(46, 20, k), TOWER_X - 30);
  const lvl = GY - 2 - seg(tt, T_SAFE - 1, T_SAFE + 3) * 14;
  x.save();
  x.beginPath();
  x.rect(-400, -200, front + 400, 400);
  x.clip();
  chocolate(x, { hh: 80 }, tt, lvl, -400, front + 10);
  x.restore();
  // a crista da onda de chocolate
  x.beginPath();
  x.moveTo(front - 20, lvl + 2);
  x.quadraticCurveTo(front - 2, lvl - 12, front + 8, lvl - 6);
  x.quadraticCurveTo(front + 4, lvl - 1, front + 10, lvl + 3);
  x.lineTo(front - 20, lvl + 3);
  x.closePath();
  fs(x, '#8a4a22', 0.8);
  // corredores: o jogador na frente, 3 amigos atrás
  const sk = friendSkins(3);
  for (let i = 3; i >= 0; i--) {
    const p = runner(tt, i);
    const hp = hop(tt + i * 0.21, 3.2, 2.6);
    const R = i === 0 ? 6.5 : 5.6;
    const top = p.y <= GY - 40;
    shadow(x, p.x, p.y, R * 0.8);
    bloop(x, p.x, p.y - R * 1.05 + (top ? hop(tt + i, 1.6, 3).dy : hp.dy), R, { t: tt + i, skin: i ? sk[i - 1] : undefined, sx: hp.sx, sy: hp.sy, lookX: top ? 0 : 0.8, lookY: top ? 0.1 : -0.1, mood: top ? 'happy' : 'idle' });
    // linhas de velocidade
    if (!top) {
      x.strokeStyle = 'rgba(255,255,255,.8)';
      x.lineWidth = 0.6;
      for (let j = 0; j < 3; j++) {
        x.beginPath();
        x.moveTo(p.x - R - 2 - j, p.y - R - j * 2.4);
        x.lineTo(p.x - R - 7 - j * 2, p.y - R - j * 2.4);
        x.stroke();
      }
    }
  }
  x.restore();
}

/* ------------------------------ 4. a salvo + título ------------------------------ */
function sceneSafe(st: Stage, tt: number): void {
  const x = st.x;
  const k = seg(tt, T_SAFE, T_END);
  const fit = Math.min(1, st.hw / 56);
  const z = lerp(1.25, 1.05, ease(k)) * fit;
  x.save();
  x.scale(z, z);
  x.translate(0, 3);
  fillAll(x, st, vgrad(x, -st.hh / z - 20, 30, ['#ff9a6a', '#ffd8a0']));
  rays(x, 0, -10, tt * 0.25, 170, 'rgba(255,255,255,.18)', 16, 0.08);
  glow(x, 0, -6, 46, 'rgba(255,240,190,.7)');
  // plataforma do mirante
  rr(x, -40, 12, 80, 5, 2);
  fs(x, '#ffe14d', 0.8);
  rr(x, -36, 17, 72, 40, 2);
  fs(x, '#ff9a5a', 0.8);
  // chocolate lá embaixo
  chocolate(x, st, tt, 30);
  const sk = friendSkins(3);
  const pos: [number, number, string | undefined][] = [[-27, 6, sk[1]], [-9, 7.5, undefined], [9, 6.5, sk[0]], [26, 6, sk[2]]];
  pos.forEach(([bx, R, skin], i) => {
    const hp = hop(tt + i * 0.27, 1.9, 3.2);
    shadow(x, bx, 12, R * 0.9);
    bloop(x, bx, 12 - R * 1.05 + hp.dy, R, { t: tt + i, skin, sx: hp.sx, sy: hp.sy, mood: 'happy', lookX: bx < 0 ? 0.3 : -0.3, lookY: 0.15 });
  });
  for (let i = 0; i < 8; i++) twinkle(x, Math.cos(i * 0.8 + tt) * 44, -6 + Math.sin(i * 1.3 + tt * 1.2) * 12, 1.6 + Math.sin(tt * 5 + i) * 0.6, i % 2 ? '#fff' : '#ffe14d');
  confetti(x, st, tt, T_SAFE + 1, Math.round(70 * st.q), 7);
  x.restore();
}

let lastT = -1;
export default function play(parent: HTMLElement): Promise<void> {
  lastT = -1;
  return playFilm(parent, {
    id: 'disaster',
    dur: T_END,
    music: 'disaster',
    bg: '#0d1830',
    grade: 'radial-gradient(ellipse at 50% 42%,rgba(255,220,160,0) 52%,rgba(30,10,60,.3) 100%)',
    filter: 'saturate(1.1)',
    titleCols: ['#fff3b0', '#ffe08a', '#ff7a2e', '#2a0b5c'],
    title: () => t('dz.name', 'Sobreviva aos Desastres'),
    tagline: () => t('dz.tagline', 'Suba, corra e escape de 100 desastres!'),
    titleAt: T_SAFE + 0.9,
    subs: [
      { t: 0.6, icons: ['megaphone', 'warning'], text: () => t('intro2.dz.s1', 'Plantão do Bloop: alerta de desastres!') },
      { t: 3.4, icons: ['video'], text: () => t('intro2.dz.s2', 'Atenção, amiguinhos: hoje pode acontecer de tudo!') },
      { t: T_WHEEL + 0.3, icons: ['refresh'], text: () => t('intro2.dz.s3', 'A roleta escolhe o desastre da vez...') },
      { t: T_MONT + 0.2, icons: ['drop', 'warning'], text: () => t('intro2.dz.s4', 'Tsunami, tornado... e até enchente de chocolate!') },
      { t: T_RUN + 0.3, icons: ['user', 'arrow-up'], text: () => t('intro2.dz.s5', 'Corra com os amigos para o lugar mais alto!') },
      { t: T_SAFE + 0.2, icons: ['shield', 'heart'], text: () => t('intro2.dz.s6', 'Ufa! Todo mundo a salvo!') },
    ],
    cues: [
      { t: 0.3, fn: () => sfx.alarm() },
      { t: T_WHEEL + 0.3, fn: sfx.whoosh },
      ...Array.from({ length: 12 }, (_, i) => ({ t: T_WHEEL + 0.4 + Math.pow(i / 12, 1.8) * 1.9, fn: sfx.knob })),
      { t: T_MONT - 0.05, fn: sfx.ding },
      { t: T_MONT + 0.2, fn: sfx.splash },
      { t: T_MONT + V + 0.2, fn: sfx.whoosh },
      { t: T_MONT + V * 2 + 0.2, fn: sfx.bubble },
      { t: T_RUN, fn: () => music.setState('tension') },
      { t: T_SAFE - 0.6, fn: sfx.boing },
      { t: T_SAFE + 0.3, fn: sfx.yay },
    ],
    draw(st, tt) {
      if (tt < T_WHEEL) sceneTV(st, tt);
      else if (tt < T_MONT) sceneWheel(st, tt);
      else if (tt < T_MONT + V) tsunami(st, tt, T_MONT);
      else if (tt < T_MONT + V * 2) tornado(st, tt, T_MONT + V);
      else if (tt < T_RUN) chocoFlood(st, tt, T_MONT + V * 2);
      else if (tt < T_SAFE) sceneRun(st, tt);
      else sceneSafe(st, tt);
      dip(st.x, st, tt, [T_WHEEL, T_RUN, T_SAFE], '#0d1830', 0.25);
      // corte seco com clarão entre os desastres
      for (const c of [T_MONT, T_MONT + V, T_MONT + V * 2]) if (lastT < c && tt >= c && tt < c + 0.3) st.flash(0.55);
      lastT = tt;
    },
  });
}
