/* ============================================================
 *  RALLY LUNAR — abertura curta (≈13 s): semáforo de largada na Lua (vermelho, vermelho,
 *  amarelo... VERDE!), o SEU Bloop arranca no buggy, salto gigante sobre a cratera com o
 *  planeta turquesa ao fundo, poeira e bandeira quadriculada no título. 2D procedural.
 * ============================================================ */
import { t } from '../../../i18n';
import { sfx } from '../../../3d/common/sfx';
import { playFilm, type Stage } from '../../_intro2/stage';
import { INK, TAU, bloop, circle, clamp, confetti, ease, easeOut, fillAll, fs, glow, label, lerp, rng, rr, seg, twinkle, vgrad, type X } from '../../_intro2/draw';

const T_GO = 3.0;
const T_JUMP = 5.0;
const T_LAND = 7.0;
const T_TITLE = 8.4;
const T_END = 13.2;

/** chão da Lua no x do mundo (y para baixo) */
function ground(wx: number): number {
  return 20 + Math.sin(wx * 0.035) * 3 + Math.sin(wx * 0.011 + 1) * 5;
}
/** posição do buggy no mundo */
function car(tt: number): { x: number; y: number; rot: number; air: boolean } {
  const v = (k: number) => k * k * 30 + k * 10; // acelera
  const run = Math.max(0, tt - T_GO);
  const wx = v(Math.min(run, 2.2)) + Math.max(0, run - 2.2) * 68;
  if (tt >= T_JUMP && tt < T_LAND) {
    const k = seg(tt, T_JUMP, T_LAND);
    const a = car(T_JUMP - 0.001);
    const bx = wx;
    const y = lerp(a.y, ground(bx), k) - Math.sin(k * Math.PI) * 30;
    return { x: wx, y, rot: lerp(-0.35, 0.3, k), air: true };
  }
  const y = ground(wx);
  const rot = Math.atan2(ground(wx + 4) - ground(wx - 4), 8);
  return { x: wx, y, rot, air: false };
}

function buggy(x: X, tt: number, cx: number, cy: number, rot: number, s: number, spin: number, shake = 0): void {
  x.save();
  x.translate(cx, cy);
  x.rotate(rot);
  x.scale(s, s);
  x.translate(0, Math.sin(tt * 50) * shake);
  // o Bloop no banco
  bloop(x, -1, -10.5, 4.6, { t: tt, mood: 'happy', lookX: 0.6, lookY: 0.1 });
  // capacete-bolha
  circle(x, -1, -10.8, 6);
  x.fillStyle = 'rgba(200,240,255,.25)';
  x.fill();
  x.strokeStyle = 'rgba(255,255,255,.8)';
  x.lineWidth = 0.5;
  x.stroke();
  // carroceria
  x.beginPath();
  x.moveTo(-11, -5);
  x.lineTo(7, -6);
  x.quadraticCurveTo(12, -5.6, 12.5, -2);
  x.lineTo(12, 1);
  x.lineTo(-11.5, 1);
  x.closePath();
  fs(x, vgrad(x, -6, 1, ['#ffb86b', '#ff7a2e']), 0.7);
  x.fillStyle = '#2fb7b0';
  x.fillRect(-9, -3.4, 16, 1.4);
  // antena com bandeirinha
  x.strokeStyle = INK;
  x.lineWidth = 0.4;
  x.beginPath();
  x.moveTo(-10, -5);
  x.lineTo(-12, -16);
  x.stroke();
  x.beginPath();
  x.moveTo(-12, -16);
  x.lineTo(-7 + Math.sin(tt * 12) * 0.8, -14.6);
  x.lineTo(-11.6, -13);
  x.closePath();
  fs(x, '#ffe14d', 0.3);
  // rodas grandes
  for (const wx of [-7.5, 8]) {
    circle(x, wx, 2, 4.2);
    fs(x, '#3a2a5a', 0.7);
    circle(x, wx, 2, 2);
    fs(x, '#c8c0e0', 0.5);
    x.strokeStyle = '#3a2a5a';
    x.lineWidth = 0.5;
    for (let i = 0; i < 3; i++) {
      const a = spin + (i * TAU) / 3;
      x.beginPath();
      x.moveTo(wx, 2);
      x.lineTo(wx + Math.cos(a) * 2, 2 + Math.sin(a) * 2);
      x.stroke();
    }
  }
  x.restore();
}
function moonSky(x: X, st: Stage, tt: number): void {
  fillAll(x, st, vgrad(x, -st.hh, 30, ['#3a1a5c', '#ff9a5a', '#ffe0b0']));
  const R = rng(4);
  for (let i = 0; i < 40; i++) twinkle(x, (R() * 2 - 1) * st.hw, -st.hh + R() * st.hh * 0.8, 0.5 + R() * 0.7 + Math.sin(tt * 3 + i) * 0.2, '#fff', 0.8);
}
function planet(x: X, cx: number, cy: number, r: number): void {
  glow(x, cx, cy, r * 2, 'rgba(120,255,240,.4)');
  circle(x, cx, cy, r);
  fs(x, vgrad(x, cy - r, cy + r, ['#6ff0e0', '#1d8f8a']), 0.6);
  x.fillStyle = 'rgba(255,255,255,.25)';
  x.beginPath();
  x.ellipse(cx - r * 0.3, cy - r * 0.2, r * 0.5, r * 0.18, -0.3, 0, TAU);
  x.fill();
  x.strokeStyle = 'rgba(255,255,255,.65)';
  x.lineWidth = r * 0.1;
  x.beginPath();
  x.ellipse(cx, cy, r * 1.6, r * 0.35, -0.3, 0, TAU);
  x.stroke();
}
function terrain(x: X, st: Stage, camX: number, tt: number): void {
  const x0 = camX - st.hw * 2 - 10;
  const x1 = camX + st.hw * 2 + 10;
  // morros de trás
  x.fillStyle = '#e38b4f';
  x.beginPath();
  x.moveTo(x0, st.hh + 5);
  for (let px = x0; px <= x1; px += 4) x.lineTo(px, 4 - Math.sin((px - camX * 0.6) * 0.02) * 6 - Math.sin(px * 0.007) * 4 + camX * 0);
  x.lineTo(x1, st.hh + 5);
  x.fill();
  x.beginPath();
  x.moveTo(x0, st.hh + 5);
  for (let px = x0; px <= x1; px += 3) x.lineTo(px, ground(px));
  x.lineTo(x1, st.hh + 5);
  x.closePath();
  fs(x, vgrad(x, 10, 50, ['#ffcf9a', '#d9824a']), 0.8);
  // crateras
  for (let i = Math.floor(x0 / 37); i <= x1 / 37; i++) {
    const cx = i * 37 + (i % 3) * 7;
    const w = 3 + (Math.abs(i) % 3) * 1.6;
    x.beginPath();
    x.ellipse(cx, ground(cx) + 3 + (Math.abs(i) % 2) * 3, w, w * 0.32, 0, 0, TAU);
    x.fillStyle = 'rgba(160,80,40,.35)';
    x.fill();
  }
  void tt;
}
function gantry(x: X, gx: number, tt: number): void {
  const gy = ground(gx);
  x.fillStyle = '#5a3a7a';
  x.fillRect(gx - 16, gy - 34, 2, 34);
  x.fillRect(gx + 14, gy - 34, 2, 34);
  rr(x, gx - 18, gy - 40, 36, 10, 2.5);
  fs(x, '#2a1e4a', 0.7);
  const on = [tt >= 0.5, tt >= 1.3, tt >= 2.1, tt >= T_GO];
  const cols = ['#ff3b5c', '#ff3b5c', '#ffd23f', '#3ddc97'];
  for (let i = 0; i < 4; i++) {
    const lx = gx - 12 + i * 8;
    const lit = on[i] && (i === 3 || tt < T_GO);
    circle(x, lx, gy - 35, 2.8);
    fs(x, lit ? cols[i] : '#4a3a6a', 0.5);
    if (lit) glow(x, lx, gy - 35, 9, i === 3 ? 'rgba(120,255,170,.8)' : i === 2 ? 'rgba(255,220,90,.8)' : 'rgba(255,90,110,.8)');
  }
  // faixa quadriculada no chão
  for (let i = 0; i < 6; i++) {
    x.fillStyle = i % 2 ? '#fff' : '#2a1e4a';
    x.fillRect(gx - 1.5, gy - 1 + i * 1.2 - 3, 3, 1.2);
  }
}
function scene(st: Stage, tt: number): void {
  const x = st.x;
  const fit = st.tall ? 1.2 : Math.min(1, st.hw / 60);
  const c = car(tt);
  const camX = Math.max(0, c.x + 6);
  const camY = c.air ? (c.y - ground(c.x)) * 0.35 : 0;
  x.save();
  x.scale(fit, fit);
  moonSky(x, st, tt);
  planet(x, (st.tall ? 16 : 30) - camX * 0.02, -30, 12);
  x.save();
  x.translate(-camX, -camY - (st.tall ? 0 : 4));
  terrain(x, st, camX, tt);
  gantry(x, 6, tt);
  // poeira
  const R = rng(9);
  for (let i = 0; i < 14; i++) {
    const age = (tt * 1.6 + i / 14) % 1;
    const born = tt - age / 1.6;
    if (born < T_GO) continue;
    const p = car(born);
    if (p.air) continue;
    const px = p.x - 10 - age * 10;
    const py = p.y - age * 6 - R() * 2;
    circle(x, px, py, 1.4 + age * 4);
    x.fillStyle = `rgba(255,220,180,${(1 - age) * 0.7})`;
    x.fill();
  }
  // escapamento esperando a largada
  if (tt < T_GO)
    for (let i = 0; i < 3; i++) {
      const k = (tt * 3 + i / 3) % 1;
      circle(x, c.x - 13 - k * 6, c.y - 3 - k * 3, 1 + k * 2);
      x.fillStyle = `rgba(255,255,255,${(1 - k) * 0.6})`;
      x.fill();
    }
  const spin = c.x * 0.5;
  buggy(x, tt, c.x, c.y - 6.2, c.rot, 1, spin, tt < T_GO ? 0.25 : 0);
  // estrelinhas no salto
  if (c.air) for (let i = 0; i < 5; i++) twinkle(x, c.x - 12 - i * 5, c.y - 6 + Math.sin(tt * 8 + i) * 3, 1.4, '#fff', 1 - i / 5);
  x.restore();
  // "JÁ!"
  const go = seg(tt, T_GO, T_GO + 0.9);
  if (go > 0 && go < 1) {
    x.save();
    x.translate(0, -24);
    const sc = 1 + easeOut(go) * 0.6;
    x.scale(sc, sc);
    x.globalAlpha = 1 - ease(clamp((go - 0.5) * 2));
    label(x, t('intro2.ra.go', 'JÁ!'), 0, 0, 14, '#3ddc97', INK);
    x.restore();
  }
  confetti(x, st, tt, T_TITLE + 0.5, Math.round(50 * st.q), 4, ['#fff', '#2a1e4a', '#ff8a3d', '#2fb7b0']);
  x.restore();
}

export default function play(parent: HTMLElement): Promise<void> {
  return playFilm(parent, {
    id: 'rally',
    dur: T_END,
    music: 'rally',
    bg: '#3a1a5c',
    grade: 'radial-gradient(ellipse at 50% 45%,rgba(255,200,150,0) 55%,rgba(60,20,40,.3) 100%)',
    titleCols: ['#fff3d6', '#ffe0b0', '#ff8a3d', '#2a0b5c'],
    title: () => t('rally.name', 'Rally Lunar'),
    tagline: () => t('rally.tagline', 'Acelere pelas colinas e vá o mais longe possível!'),
    titleAt: T_TITLE,
    subs: [
      { t: 0.3, icons: ['car', 'clock'], text: () => t('intro2.ra.s1', 'Motor ligado na Lua...') },
      { t: T_GO + 0.2, icons: ['bolt'], text: () => t('intro2.ra.s2', 'Acelera!') },
      { t: T_JUMP + 0.1, icons: ['rocket'], text: () => t('intro2.ra.s3', 'Na Lua, o pulo é gigante!') },
      { t: T_TITLE, icons: [], text: () => '' },
    ],
    cues: [
      { t: 0.5, fn: sfx.knob },
      { t: 1.3, fn: sfx.knob },
      { t: 2.1, fn: sfx.knob },
      { t: T_GO, fn: sfx.ding },
      { t: T_GO + 0.1, fn: sfx.whoosh },
      { t: T_JUMP, fn: sfx.boing },
      { t: T_LAND, fn: sfx.thud },
    ],
    draw: scene,
  });
}
