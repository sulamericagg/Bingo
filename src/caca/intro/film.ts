/* ============================================================
 *  CAÇA BLOOP — ABERTURA (≈28 s, "Pular" sempre visível; toca ao chegar no mapa pela 1ª vez).
 *   1. Manhã na pracinha: o SEU Bloop passeia e o celular vibra e acende.
 *   2. Zoom na tela: o mapa no estilo do jogo (ruas lilás, parques, prédios), o alcance girando
 *      e um "!" pulsando perto de um arbusto.
 *   3. De volta à praça: o arbusto treme... e um bichinho (genoma de verdade do jogo) espia e pula!
 *   4. A Bolha de captura (aparelho do jogo) brilha, é lançada e balança 3 vezes — pego!
 *   5. Os dois juntos pulando entre alfinetes do mapa + título.
 *  2D procedural (src/games/_intro2); o bichinho usa src/caca/draw (mesmo desenho do jogo).
 * ============================================================ */
import { t } from '../../i18n';
import { sfx } from '../../3d/common/sfx';
import { playFilm, type Stage } from '../../games/_intro2/stage';
import {
  INK, TAU, back, bloop, circle, clamp, cloud, confetti, dip, ease, easeIn, easeOut, fillAll, fs, glow, hop, lerp, rays, rr, seg,
  shadow, star5, twinkle, vgrad, within, type X,
} from '../../games/_intro2/draw';
import { drawGenome } from '../draw';
import { genome, type Genome } from '../genome';
import { seedFrom } from '../rng';
import { THEMES } from '../world';

const T_MAP = 5.6;
const T_BUSH = 11.6;
const T_BUBBLE = 17.4;
const T_TITLE = 23.2;
const T_END = 29.2;

const TH = THEMES.dia;
let pet: Genome | null = null;

/** desenha o bichinho do jogo com nitidez (o sprite dele é em px de tela) */
function creature(st: Stage, zoom: number, cx: number, cy: number, size: number, tt: number, mood?: 'idle' | 'happy', still = false): void {
  if (!pet) return;
  const x = st.x;
  const S = st.u * zoom;
  x.save();
  x.translate(cx, cy);
  x.scale(1 / S, 1 / S);
  drawGenome(x, pet, size * S, tt, { mood, shadow: false, still });
  x.restore();
}

/* ------------------------------ cenário: a praça ------------------------------ */
const GY = 22;
function park(x: X, st: Stage, tt: number): void {
  fillAll(x, st, vgrad(x, -st.hh, GY, ['#7ec8ff', '#d6f0ff']));
  glow(x, 56, -34, 22, 'rgba(255,245,190,.9)');
  circle(x, 56, -34, 6.5);
  x.fillStyle = '#fff6c0';
  x.fill();
  for (let i = 0; i < 4; i++) cloud(x, ((i * 64 + tt * 2) % 280) - 140, -38 + (i % 2) * 7, 4 + (i % 3), '#fff', 0.9);
  // prédios ao longe (do mapa)
  for (let i = 0; i < 10; i++) {
    const bx = -140 + i * 30;
    const h = 14 + ((i * 7) % 5) * 5;
    rr(x, bx, GY - 10 - h, 22, h + 12, 1.5);
    x.fillStyle = TH.bld[i % TH.bld.length] ?? '#c8b8f0';
    x.fill();
    x.fillStyle = 'rgba(255,255,255,.55)';
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) x.fillRect(bx + 3 + c * 6.5, GY - 6 - h + r * 7, 3, 3.5);
  }
  // árvores redondas
  for (let i = 0; i < 6; i++) {
    const px = -100 + i * 50;
    rr(x, px - 1, GY - 12, 2, 12, 1);
    fs(x, '#8a5a3a', 0.4);
    circle(x, px, GY - 16, 7);
    fs(x, i % 2 ? TH.tree : TH.tree2, 0.5);
  }
  x.fillStyle = TH.park;
  x.fillRect(-st.hw * 3, GY, st.hw * 6, st.hh * 3);
  x.fillStyle = TH.sidewalk;
  x.fillRect(-st.hw * 3, GY + 3, st.hw * 6, 6);
  x.fillStyle = TH.park2;
  x.fillRect(-st.hw * 3, GY, st.hw * 6, 1.2);
  // flores
  for (let i = 0; i < 14; i++) {
    const px = -110 + i * 17;
    circle(x, px, GY + 13 + (i % 3), 1);
    x.fillStyle = ['#ff8fd8', '#ffe14d', '#fff'][i % 3];
    x.fill();
  }
}
/** arbusto; shake 0..1 */
function bush(x: X, cx: number, cy: number, s: number, shake: number, tt: number): void {
  const w = Math.sin(tt * 40) * shake * 1.2;
  x.save();
  x.translate(cx, cy);
  x.rotate(w * 0.03);
  const blobs: [number, number, number][] = [[-8, -4, 6], [0, -8, 7.5], [8, -4, 6], [-4, -1, 6], [4, -1, 6]];
  x.beginPath();
  for (const [a, b, r] of blobs) {
    x.moveTo(a * s + r * s, b * s);
    x.arc(a * s, b * s, r * s, 0, TAU);
  }
  fs(x, TH.tree, 0.7);
  x.fillStyle = TH.tree2;
  for (const [a, b, r] of blobs) {
    circle(x, a * s + r * s * 0.2, b * s + r * s * 0.35, r * s * 0.55);
    x.fill();
  }
  x.fillStyle = '#ff8fd8';
  for (const [a, b] of [[-6, -7], [5, -10], [8, -2]]) {
    circle(x, a * s, b * s, 0.9 * s);
    x.fill();
  }
  x.restore();
  if (shake > 0.2)
    for (let i = 0; i < 3; i++) {
      const k = (tt * 2 + i / 3) % 1;
      x.save();
      x.translate(cx + (i - 1) * 6 * s + k * 4, cy - 10 * s - k * 6);
      x.rotate(k * 4);
      x.globalAlpha = (1 - k) * shake;
      x.beginPath();
      x.ellipse(0, 0, 1.4, 0.7, 0, 0, TAU);
      x.fillStyle = TH.tree;
      x.fill();
      x.restore();
    }
}
/** o celular (em pé), tela opcional desenhada por `screen` */
function phone(x: X, cx: number, cy: number, s: number, rot: number, lit: number, screen?: () => void): void {
  x.save();
  x.translate(cx, cy);
  x.rotate(rot);
  rr(x, -5 * s, -9 * s, 10 * s, 18 * s, 2 * s);
  fs(x, '#2a1e4a', 0.7);
  rr(x, -4.2 * s, -7.8 * s, 8.4 * s, 15.6 * s, 1.2 * s);
  x.fillStyle = '#1a1030';
  x.fill();
  if (lit > 0) {
    x.save();
    rr(x, -4.2 * s, -7.8 * s, 8.4 * s, 15.6 * s, 1.2 * s);
    x.clip();
    x.globalAlpha = lit;
    if (screen) screen();
    else {
      x.fillStyle = vgrad(x, -8 * s, 8 * s, ['#7a5cff', '#43c08a']);
      x.fillRect(-5 * s, -9 * s, 10 * s, 18 * s);
    }
    x.restore();
  }
  x.restore();
  if (lit > 0) glow(x, cx, cy, 16 * s, 'rgba(160,220,255,.45)', lit);
}
/** mapinha no estilo do jogo: ruas, parque, prédios, alcance e o "!" (coordenadas locais ±50) */
function miniMap(x: X, tt: number, k: number, found: number): void {
  x.fillStyle = TH.ground;
  x.fillRect(-60, -60, 120, 120);
  x.save();
  x.rotate(-0.35 + k * 0.25);
  // parque e lago
  rr(x, 6, -40, 34, 30, 6);
  x.fillStyle = TH.park;
  x.fill();
  x.beginPath();
  x.ellipse(-26, 22, 14, 9, 0.3, 0, TAU);
  x.fillStyle = TH.water;
  x.fill();
  x.fillStyle = TH.water2;
  x.beginPath();
  x.ellipse(-29, 20, 6, 2.5, 0.3, 0, TAU);
  x.fill();
  // ruas
  x.strokeStyle = TH.roadMain;
  x.lineWidth = 7;
  x.lineCap = 'round';
  x.beginPath();
  x.moveTo(-70, 0);
  x.lineTo(70, 0);
  x.moveTo(0, -70);
  x.lineTo(0, 70);
  x.stroke();
  x.strokeStyle = TH.road;
  x.lineWidth = 4.5;
  x.beginPath();
  x.moveTo(-70, -34);
  x.lineTo(70, -30);
  x.moveTo(-36, -70);
  x.lineTo(-30, 70);
  x.moveTo(44, -70);
  x.lineTo(40, 70);
  x.stroke();
  x.strokeStyle = TH.roadLine;
  x.lineWidth = 0.6;
  x.setLineDash([2.5, 2.5]);
  x.beginPath();
  x.moveTo(-70, 0);
  x.lineTo(70, 0);
  x.moveTo(0, -70);
  x.lineTo(0, 70);
  x.stroke();
  x.setLineDash([]);
  // prédios em 2,5D
  const blds: [number, number, number, number, number][] = [[-22, -22, 12, 10, 5], [-52, -18, 10, 12, 7], [14, 8, 14, 10, 4], [52, 12, 10, 14, 8], [-18, 40, 12, 10, 6], [20, 38, 12, 12, 5]];
  blds.forEach(([bx, by, bw, bh, h], i) => {
    rr(x, bx - bw / 2, by - bh / 2, bw, bh, 1);
    x.fillStyle = 'rgba(42,11,92,.18)';
    x.fill();
    rr(x, bx - bw / 2, by - bh / 2 - h, bw, bh, 1);
    fs(x, TH.bld[i % TH.bld.length] ?? '#c8b8f0', 0.4);
  });
  // árvores
  for (const [a, b] of [[12, -30], [28, -14], [32, -32], [12, -14]]) {
    circle(x, a, b, 3.2);
    fs(x, TH.tree, 0.4);
  }
  // o "!" no arbusto do parque
  if (found > 0) {
    const px = 20;
    const py = -20;
    for (let i = 0; i < 3; i++) {
      const q = (tt * 0.9 + i / 3) % 1;
      x.strokeStyle = `rgba(255,95,162,${(1 - q) * found})`;
      x.lineWidth = 1;
      circle(x, px, py, 3 + q * 14);
      x.stroke();
    }
    x.save();
    x.translate(px, py - 6 - Math.abs(Math.sin(tt * 4)) * 2);
    x.rotate(0.35 - k * 0.25);
    x.scale(back(found), back(found));
    x.beginPath();
    x.moveTo(0, 6);
    x.bezierCurveTo(-6, -1, -5, -8, 0, -8);
    x.bezierCurveTo(5, -8, 6, -1, 0, 6);
    fs(x, '#ff5fa2', 0.7);
    x.font = '800 9px Fredoka, system-ui, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = '#fff';
    x.fillText('!', 0, -2.4);
    x.restore();
  }
  x.restore();
  // alcance tracejado girando + o jogador no centro
  x.setLineDash([3, 2.4]);
  x.lineDashOffset = -tt * 6;
  x.strokeStyle = 'rgba(255,255,255,.95)';
  x.lineWidth = 1;
  circle(x, 0, 0, 22);
  x.stroke();
  x.setLineDash([]);
  x.fillStyle = 'rgba(122,92,255,.12)';
  circle(x, 0, 0, 22);
  x.fill();
}

/* ------------------------------ a Bolha de captura ------------------------------ */
function captureBubble(x: X, cx: number, cy: number, R: number, tt: number, glowK: number, rot = 0): void {
  x.save();
  x.translate(cx, cy);
  x.rotate(rot);
  if (glowK > 0) {
    glow(x, 0, 0, R * 3.2, 'rgba(255,170,240,.75)', glowK);
    rays(x, 0, 0, tt * 1.2, R * 3, `rgba(255,255,255,${(0.25 * glowK).toFixed(3)})`, 10, 0.12);
  }
  const g = x.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R);
  g.addColorStop(0, 'rgba(255,255,255,0.6)');
  g.addColorStop(0.7, 'rgba(180,220,255,0.35)');
  g.addColorStop(1, 'rgba(255,140,230,0.7)');
  circle(x, 0, 0, R);
  x.fillStyle = g;
  x.fill();
  x.lineWidth = R * 0.08;
  x.strokeStyle = 'rgba(255,255,255,.95)';
  x.stroke();
  // anel arco-íris girando
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + tt * 2;
    circle(x, Math.cos(a) * R * 1.12, Math.sin(a) * R * 1.12, R * 0.07);
    x.fillStyle = `hsl(${i * 30},95%,70%)`;
    x.fill();
  }
  x.fillStyle = 'rgba(255,255,255,.85)';
  x.beginPath();
  x.ellipse(-R * 0.4, -R * 0.45, R * 0.2, R * 0.1, -0.6, 0, TAU);
  x.fill();
  star5(x, 0, 0, R * 0.32, tt);
  fs(x, '#ffe14d', R * 0.05);
  x.restore();
}

/* ------------------------------ cenas ------------------------------ */
function scenePhone(st: Stage, tt: number): void {
  const x = st.x;
  const push = ease(seg(tt, 2.6, T_MAP));
  const z = lerp(1.05, 1.35, push) * Math.min(1, st.hw / 56);
  x.save();
  x.scale(z, z);
  x.translate(lerp(10, 0, push), 0);
  park(x, st, tt);
  bush(x, 40, GY, 1, 0, tt);
  const walk = seg(tt, 0, 2.6);
  const bx = lerp(-40, -6, easeOut(walk));
  const hp = hop(tt, walk < 1 ? 2.2 : 0.9, walk < 1 ? 2 : 0.6);
  const R = 10;
  const buzz = within(tt, 2.4, 5.2, 0.1, 0.3);
  shadow(x, bx, GY, R * 0.9);
  bloop(x, bx, GY - R * 1.05 + hp.dy, R, { t: tt, sx: hp.sx, sy: hp.sy, lookX: tt > 2.6 ? 0.55 : 0.4, lookY: tt > 2.6 ? 0.2 : 0, mood: 'happy' });
  // celular "na mão" (flutuando na frente)
  const lit = seg(tt, 2.7, 3.1);
  const sh = Math.sin(tt * 60) * 0.06 * (tt > 2.4 && tt < 3.2 ? 1 : 0);
  phone(x, bx + 13, GY - 13 + hp.dy * 0.5, 0.8, 0.15 + sh, lit, () => {
    x.fillStyle = vgrad(x, -8, 8, ['#7a5cff', '#43c08a']);
    x.fillRect(-5, -9, 10, 18);
    circle(x, 0, -1, 2.4);
    fs(x, '#ff5fa2', 0.3);
    x.font = '800 3px Fredoka, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = '#fff';
    x.fillText('!', 0, -1.2);
  });
  if (buzz > 0) {
    x.strokeStyle = `rgba(42,11,92,${buzz * 0.7})`;
    x.lineWidth = 0.6;
    for (const s of [-1, 1]) for (let i = 0; i < 2; i++) {
      x.beginPath();
      x.arc(bx + 13, GY - 13, 9 + i * 2.5, s > 0 ? -0.6 : Math.PI - 0.6, s > 0 ? 0.6 : Math.PI + 0.6);
      x.stroke();
    }
  }
  x.restore();
}
function sceneMap(st: Stage, tt: number): void {
  const x = st.x;
  const k = seg(tt, T_MAP, T_BUSH);
  fillAll(x, st, '#1a1030');
  // a tela do celular enche o quadro (moldura do aparelho nas bordas)
  const s = Math.min(st.hw / 56, (st.hh - 9) / 44) * lerp(0.92, 1.0, ease(k));
  x.save();
  x.scale(s, s);
  rr(x, -54, -44, 108, 88, 10);
  fs(x, '#2a1e4a', 1);
  x.save();
  rr(x, -50, -40, 100, 80, 7);
  x.clip();
  x.save();
  const z = lerp(1.4, 1.0, ease(seg(tt, T_MAP, T_MAP + 2.4)));
  x.scale(z, z);
  miniMap(x, tt, k, seg(tt, T_MAP + 2.2, T_MAP + 2.8));
  x.restore();
  // o jogador no centro do mapa
  const R = 4.2;
  const hp = hop(tt, 1.4, 0.8);
  shadow(x, 0, 4, R);
  bloop(x, 0, 4 - R * 1.05 + hp.dy, R, { t: tt, sx: hp.sx, sy: hp.sy, lookX: 0.6, lookY: -0.4, mood: 'happy' });
  // barra de status do app
  x.fillStyle = 'rgba(26,16,48,.55)';
  x.fillRect(-50, -40, 100, 7);
  x.fillStyle = '#fff';
  x.font = '700 4px Fredoka, sans-serif';
  x.textAlign = 'left';
  x.textBaseline = 'middle';
  x.fillText(t('caca.name', 'Caça Bloop'), -46, -36.4);
  x.restore();
  x.restore();
}
function sceneBush(st: Stage, tt: number): void {
  const x = st.x;
  const k = seg(tt, T_BUSH, T_BUBBLE);
  const z = lerp(1.15, 1.3, ease(k)) * Math.min(1, st.hw / 56);
  x.save();
  x.scale(z, z);
  x.translate(-6, -2);
  park(x, st, tt);
  const shake = within(tt, T_BUSH + 0.6, T_BUSH + 2.6, 0.2, 0.3);
  const peek = easeOut(seg(tt, T_BUSH + 2.6, T_BUSH + 3.2));
  const popUp = back(seg(tt, T_BUSH + 4.0, T_BUSH + 4.6), 2.2);
  const bxC = 26;
  // bichinho atrás do arbusto (espia e pula para fora)
  const cy = lerp(GY + 2, GY - 12, peek) - popUp * 6;
  const cxp = bxC + popUp * 8;
  if (peek > 0 && popUp < 0.5) creature(st, z, cxp, cy, 22, tt, 'idle');
  bush(x, bxC, GY, 1.2, shake, tt);
  if (popUp >= 0.5) {
    shadow(x, cxp, GY + 1, 7);
    creature(st, z, cxp, cy, 22, tt, 'happy');
    for (let i = 0; i < 6; i++) twinkle(x, cxp + Math.cos(i + tt * 2) * 14, cy - 4 + Math.sin(i * 1.7 + tt * 2) * 9, 1.6, i % 2 ? '#fff' : '#ffe14d', 0.9);
  }
  // o Bloop surpreso
  const R = 10;
  const sur = within(tt, T_BUSH + 2.7, T_BUSH + 3.5, 0.08, 0.3);
  const hp = hop(tt, 1, 0.6);
  shadow(x, -24, GY, R * 0.9);
  bloop(x, -24, GY - R * 1.05 + hp.dy - sur * 5, R, { t: tt, sx: hp.sx * (1 - sur * 0.08), sy: hp.sy * (1 + sur * 0.12), lookX: 0.8, lookY: shake > 0 ? 0.1 : -0.05, mood: 'happy' });
  if (sur > 0) {
    x.save();
    x.translate(-24, GY - R * 2.6 - sur * 5);
    x.scale(sur, sur);
    x.font = '800 9px Fredoka, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.lineWidth = 2;
    x.strokeStyle = INK;
    x.strokeText('!', 0, 0);
    x.fillStyle = '#ffe14d';
    x.fillText('!', 0, 0);
    x.restore();
  }
  x.restore();
}
function sceneBubble(st: Stage, tt: number): void {
  const x = st.x;
  const z = Math.min(1, st.hw / 56) * 1.15;
  x.save();
  x.scale(z, z);
  x.translate(-6, -2);
  park(x, st, tt);
  const bxC = 34;
  bush(x, bxC + 10, GY, 1, 0, tt);
  const R = 10;
  const thrown = seg(tt, T_BUBBLE + 2.2, T_BUBBLE + 3.0);
  const lift = easeOut(seg(tt, T_BUBBLE + 0.2, T_BUBBLE + 1.0));
  const glowK = within(tt, T_BUBBLE + 0.6, T_BUBBLE + 2.3, 0.4, 0.2);
  // o bichinho (antes de ser pego)
  const caught = tt > T_BUBBLE + 3.0;
  const wob = seg(tt, T_BUBBLE + 3.0, T_BUBBLE + 4.8);
  const pop = tt > T_BUBBLE + 4.8;
  const cyy = GY - 12;
  if (!caught) {
    shadow(x, bxC, GY + 1, 7);
    creature(st, z, bxC, cyy, 22, tt, 'idle');
  }
  // o Bloop segurando a Bolha
  const hp = hop(tt, 1, 0.6);
  const jump = within(tt, T_BUBBLE + 1.9, T_BUBBLE + 2.5, 0.2, 0.25);
  shadow(x, -24, GY, R * 0.9);
  bloop(x, -24, GY - R * 1.05 + hp.dy - jump * 4, R, { t: tt, sx: hp.sx, sy: hp.sy, lookX: 0.7, lookY: 0, mood: 'happy' });
  // a Bolha: sobe, brilha, é lançada e engole o bichinho
  if (thrown <= 0) {
    captureBubble(x, -11, lerp(GY - 6, GY - 16, lift) + Math.sin(tt * 3) * 0.6, 4 + lift * 1.5, tt, glowK);
  } else if (!caught) {
    const k = easeIn(thrown) * 0.4 + thrown * 0.6;
    const px = lerp(-11, bxC, k);
    const py = lerp(GY - 16, cyy, k) - Math.sin(k * Math.PI) * 20;
    captureBubble(x, px, py, lerp(5.5, 9, k), tt, 0.4, k * 6);
  } else {
    const rot = wob < 1 ? Math.sin(((wob * 3) % 1) * TAU) * 0.3 : 0;
    const by = GY - 9 + (wob >= 1 ? 0 : -Math.abs(Math.sin(wob * 3 * Math.PI)) * 2);
    shadow(x, bxC, GY + 1, 8);
    x.save();
    x.translate(bxC, by);
    x.rotate(rot);
    creature(st, z, 0, 0, 14, tt, 'idle', true);
    x.restore();
    captureBubble(x, bxC, by, 9, tt, pop ? within(tt, T_BUBBLE + 4.8, T_BUBBLE + 6, 0.1, 0.6) : 0, rot);
    if (pop) for (let i = 0; i < 10; i++) {
      const q = seg(tt, T_BUBBLE + 4.8, T_BUBBLE + 5.8);
      const a = (i / 10) * TAU;
      twinkle(x, bxC + Math.cos(a) * (10 + q * 12), by + Math.sin(a) * (10 + q * 12), 2 * (1 - q), `hsl(${i * 36},95%,72%)`);
    }
  }
  x.restore();
}
function sceneTitle(st: Stage, tt: number): void {
  const x = st.x;
  const k = seg(tt, T_TITLE, T_END);
  const fit = Math.min(1, st.hw / 56);
  x.save();
  x.scale(fit, fit);
  // o mapa ao fundo, inclinado, com alfinetes
  fillAll(x, st, vgrad(x, -st.hh, st.hh, ['#3a2a9a', '#43c08a']));
  x.save();
  x.translate(0, 8);
  x.scale(1.7, 0.85);
  x.rotate(tt * 0.04);
  x.globalAlpha = 0.5;
  miniMap(x, tt, 0, 0);
  x.restore();
  x.globalAlpha = 1;
  rays(x, 0, 6, tt * 0.3, 150, 'rgba(255,255,255,.12)', 16, 0.08);
  for (let i = 0; i < 5; i++) {
    const a = i * 1.3;
    const px = Math.cos(a) * 46 + (i % 2 ? 6 : -6);
    const py = 2 + Math.sin(a) * 10;
    const d = back(seg(tt, T_TITLE + 0.3 + i * 0.18, T_TITLE + 0.7 + i * 0.18), 2);
    if (d <= 0) continue;
    x.save();
    x.translate(px, py - Math.abs(Math.sin(tt * 2 + i)) * 1.5);
    x.scale(d, d);
    x.beginPath();
    x.moveTo(0, 5);
    x.bezierCurveTo(-5, -1, -4, -7, 0, -7);
    x.bezierCurveTo(4, -7, 5, -1, 0, 5);
    fs(x, ['#ff5fa2', '#ffd23f', '#4cc9f0', '#3ddc97', '#a974ff'][i], 0.6);
    circle(x, 0, -2.6, 1.6);
    x.fillStyle = '#fff';
    x.fill();
    x.restore();
  }
  // os dois amigos pulando
  const R = 9;
  const hp = hop(tt, 1.8, 3);
  const hp2 = hop(tt + 0.3, 1.8, 3.5);
  const gy = 22;
  shadow(x, -13, gy, R * 0.9);
  bloop(x, -13, gy - R * 1.05 + hp.dy, R, { t: tt, sx: hp.sx, sy: hp.sy, lookX: 0.4, lookY: 0.1, mood: 'happy' });
  shadow(x, 14, gy, 8);
  creature(st, fit, 14, gy - 11 + hp2.dy, 22, tt, 'happy');
  for (let i = 0; i < 8; i++) twinkle(x, Math.cos(i * 0.8 + tt) * 40, 8 + Math.sin(i * 1.3 + tt * 1.2) * 12, 1.5 + Math.sin(tt * 5 + i) * 0.5, i % 2 ? '#fff' : '#ffe14d');
  confetti(x, st, tt, T_TITLE + 1, Math.round(60 * st.q), 9);
  x.restore();
  void k;
  void clamp;
}

export default function play(parent: HTMLElement): Promise<void> {
  try {
    pet = genome(seedFrom('bloop-world', 'intro2', 'caca', 5));
  } catch {
    pet = null;
  }
  return playFilm(parent, {
    id: 'caca',
    dur: T_END,
    music: 'caca',
    bg: '#1a1030',
    grade: 'radial-gradient(ellipse at 50% 45%,rgba(255,230,190,0) 55%,rgba(30,10,60,.3) 100%)',
    filter: 'saturate(1.08)',
    titleCols: ['#ffffff', '#b8ffe0', '#3ddc97', '#2a0b5c'],
    title: () => t('caca.name', 'Caça Bloop'),
    tagline: () => t('caca.tagline', 'Ande por aí e encontre bichinhos únicos!'),
    titleAt: T_TITLE + 0.8,
    subs: [
      { t: 0.6, icons: ['sparkle'], text: () => t('intro2.cc.s1', 'Um passeio tranquilo na pracinha...') },
      { t: 2.8, icons: ['vibration'], text: () => t('intro2.cc.s2', 'Bzz! O celular acendeu!') },
      { t: T_MAP + 0.4, icons: ['planet', 'target'], text: () => t('intro2.cc.s3', 'No mapa de verdade, tem alguma coisa aqui perto...') },
      { t: T_BUSH + 0.5, icons: ['warning'], text: () => t('intro2.cc.s4', 'O arbusto mexeu...') },
      { t: T_BUSH + 3.4, icons: ['heart'], text: () => t('intro2.cc.s5', 'Olha! Um bichinho único!') },
      { t: T_BUBBLE + 0.4, icons: ['sparkle', 'magnet'], text: () => t('intro2.cc.s6', 'Prepara a Bolha de captura... e lá vai!') },
      { t: T_BUBBLE + 4.8, icons: ['check', 'star'], text: () => t('intro2.cc.s7', 'Pegou! Um novo amigo!') },
    ],
    cues: [
      { t: 2.5, fn: sfx.squeak },
      { t: 2.9, fn: sfx.ding },
      { t: T_MAP + 2.3, fn: sfx.pop },
      { t: T_BUSH + 0.7, fn: sfx.scrub },
      { t: T_BUSH + 2.7, fn: sfx.boing },
      { t: T_BUSH + 4.0, fn: sfx.pop },
      { t: T_BUBBLE + 0.7, fn: sfx.sparkle },
      { t: T_BUBBLE + 2.2, fn: sfx.throw },
      { t: T_BUBBLE + 3.0, fn: sfx.catch },
      { t: T_BUBBLE + 3.6, fn: sfx.knob },
      { t: T_BUBBLE + 4.2, fn: sfx.knob },
      { t: T_BUBBLE + 4.8, fn: sfx.yay },
    ],
    draw(st, tt) {
      if (tt < T_MAP) scenePhone(st, tt);
      else if (tt < T_BUSH) sceneMap(st, tt);
      else if (tt < T_BUBBLE) sceneBush(st, tt);
      else if (tt < T_TITLE) sceneBubble(st, tt);
      else sceneTitle(st, tt);
      dip(st.x, st, tt, [T_MAP, T_BUSH, T_BUBBLE, T_TITLE], '#1a1030', 0.25);
    },
  });
}
