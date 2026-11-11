/* ============================================================
 *  COZINHA MALUCA — ABERTURA (≈30 s, "Pular" sempre visível; toca no 1º turno e dá para rever).
 *   1. Manhã na cozinha: o SEU Bloop veste o avental (laço!) e o chapéu de chef cai na cabeça.
 *   2. A fachada do restaurante: a plaquinha vira de FECHADO para ABERTO e as portas se abrem.
 *   3. Travelling pela calçada: uma fila de clientes famintos, cada um sonhando com um prato.
 *   4. Close na impressora: sai o primeiro pedido (Plim!).
 *   5. Fogão a mil, panquecas voando, confete e o título.
 *  2D procedural (src/games/_intro2), gradação quente, música do tema 'cozinha'.
 * ============================================================ */
import { t } from '../../../i18n';
import { sfx } from '../../../3d/common/sfx';
import { playFilm, type Stage } from '../../_intro2/stage';
import {
  INK, TAU, back, bloop, bounce, circle, cloud, confetti, dip, ease, easeOut, fillAll, friendSkins, fs, glow, hop, label,
  lerp, rays, rr, seg, shadow, twinkle, vgrad, within, type X,
} from '../../_intro2/draw';

/* roteiro (s) */
const T_DOOR = 6.6;
const T_LINE = 12.4;
const T_TICKET = 18.8;
const T_TITLE = 24.2;
const T_END = 30.5;

/* ------------------------------ comidas ------------------------------ */
type Food = 'burger' | 'pizza' | 'soup' | 'cake' | 'juice' | 'ice';
function food(x: X, k: Food, cx: number, cy: number, s: number): void {
  const lw = s * 0.12;
  x.save();
  x.translate(cx, cy);
  if (k === 'burger') {
    x.beginPath();
    x.ellipse(0, -s * 0.2, s * 0.9, s * 0.55, 0, Math.PI, 0);
    x.closePath();
    fs(x, '#ffb648', lw);
    rr(x, -s * 0.95, -s * 0.18, s * 1.9, s * 0.24, s * 0.12);
    fs(x, '#62d26f', lw);
    rr(x, -s * 0.9, s * 0.02, s * 1.8, s * 0.3, s * 0.14);
    fs(x, '#8a4a2a', lw);
    rr(x, -s * 0.85, s * 0.3, s * 1.7, s * 0.32, s * 0.14);
    fs(x, '#ffb648', lw);
    x.fillStyle = '#fff6d0';
    for (const [a, b] of [[-0.4, -0.45], [0.1, -0.55], [0.45, -0.35]]) {
      x.beginPath();
      x.ellipse(a * s, b * s, s * 0.07, s * 0.04, 0.3, 0, TAU);
      x.fill();
    }
  } else if (k === 'pizza') {
    x.beginPath();
    x.moveTo(0, s * 0.85);
    x.lineTo(-s * 0.75, -s * 0.55);
    x.quadraticCurveTo(0, -s * 0.95, s * 0.75, -s * 0.55);
    x.closePath();
    fs(x, '#ffd45a', lw);
    x.beginPath();
    x.moveTo(-s * 0.78, -s * 0.55);
    x.quadraticCurveTo(0, -s * 0.98, s * 0.78, -s * 0.55);
    x.lineWidth = s * 0.22;
    x.strokeStyle = '#d98a3a';
    x.stroke();
    x.fillStyle = '#e2453c';
    for (const [a, b] of [[-0.25, -0.3], [0.25, -0.25], [0, 0.2]]) {
      circle(x, a * s, b * s, s * 0.14);
      x.fill();
    }
  } else if (k === 'soup') {
    x.beginPath();
    x.moveTo(-s * 0.9, -s * 0.1);
    x.quadraticCurveTo(-s * 0.85, s * 0.75, 0, s * 0.75);
    x.quadraticCurveTo(s * 0.85, s * 0.75, s * 0.9, -s * 0.1);
    x.closePath();
    fs(x, '#ff7aa8', lw);
    x.beginPath();
    x.ellipse(0, -s * 0.1, s * 0.9, s * 0.22, 0, 0, TAU);
    fs(x, '#ffb03a', lw);
    x.strokeStyle = 'rgba(255,255,255,.8)';
    x.lineWidth = s * 0.1;
    x.lineCap = 'round';
    for (const a of [-0.3, 0.1, 0.45]) {
      x.beginPath();
      x.moveTo(a * s, -s * 0.35);
      x.quadraticCurveTo(a * s + s * 0.18, -s * 0.6, a * s, -s * 0.85);
      x.stroke();
    }
  } else if (k === 'cake') {
    rr(x, -s * 0.8, -s * 0.2, s * 1.6, s * 0.85, s * 0.12);
    fs(x, '#ffc6e0', lw);
    x.beginPath();
    x.moveTo(-s * 0.8, -s * 0.05);
    for (let i = 0; i <= 6; i++) x.quadraticCurveTo(-s * 0.8 + (i - 0.5) * s * 0.267, s * 0.2, -s * 0.8 + i * s * 0.267, -s * 0.05);
    x.lineTo(s * 0.8, -s * 0.25);
    x.lineTo(-s * 0.8, -s * 0.25);
    x.closePath();
    fs(x, '#fff6fb', lw * 0.8);
    circle(x, 0, -s * 0.45, s * 0.2);
    fs(x, '#e2453c', lw);
  } else if (k === 'juice') {
    x.beginPath();
    x.moveTo(-s * 0.55, -s * 0.6);
    x.lineTo(s * 0.55, -s * 0.6);
    x.lineTo(s * 0.42, s * 0.8);
    x.lineTo(-s * 0.42, s * 0.8);
    x.closePath();
    fs(x, '#ffa23a', lw);
    x.beginPath();
    x.moveTo(s * 0.1, -s * 0.6);
    x.lineTo(s * 0.4, -s * 1.05);
    x.lineWidth = s * 0.14;
    x.strokeStyle = '#4cc9f0';
    x.stroke();
    circle(x, -s * 0.45, -s * 0.6, s * 0.22);
    fs(x, '#9be86b', lw * 0.8);
  } else {
    x.beginPath();
    x.moveTo(-s * 0.45, -s * 0.1);
    x.lineTo(0, s * 0.95);
    x.lineTo(s * 0.45, -s * 0.1);
    x.closePath();
    fs(x, '#e6a35a', lw);
    circle(x, -s * 0.18, -s * 0.3, s * 0.36);
    fs(x, '#ffb3d9', lw);
    circle(x, s * 0.2, -s * 0.35, s * 0.36);
    fs(x, '#9be8ff', lw);
    circle(x, 0, -s * 0.65, s * 0.32);
    fs(x, '#fff3b0', lw);
  }
  x.restore();
}

/* ------------------------------ figurino ------------------------------ */
/** chapéu de chef (base em y=0, centro x) */
function chefHat(x: X, cx: number, cy: number, R: number, squash = 1): void {
  x.save();
  x.translate(cx, cy);
  x.scale(1 + (1 - squash) * 0.5, squash);
  const lw = R * 0.06;
  x.beginPath();
  x.arc(-R * 0.42, -R * 0.62, R * 0.38, 0, TAU);
  x.arc(R * 0.42, -R * 0.62, R * 0.38, 0, TAU);
  x.arc(0, -R * 0.82, R * 0.46, 0, TAU);
  fs(x, '#ffffff', lw);
  rr(x, -R * 0.62, -R * 0.42, R * 1.24, R * 0.46, R * 0.12);
  fs(x, '#f3f0ff', lw);
  x.strokeStyle = 'rgba(42,11,92,.25)';
  x.lineWidth = R * 0.04;
  x.beginPath();
  x.moveTo(-R * 0.2, -R * 0.38);
  x.lineTo(-R * 0.2, -R * 0.02);
  x.moveTo(R * 0.2, -R * 0.38);
  x.lineTo(R * 0.2, -R * 0.02);
  x.stroke();
  x.restore();
}
/** avental de cintura (abaixo do rosto) no Bloop de raio R; k = laço aparecendo (0..1) */
function apronPath(x: X, R: number): void {
  x.beginPath();
  x.moveTo(-R * 0.62, R * 0.5);
  x.lineTo(R * 0.62, R * 0.5);
  x.quadraticCurveTo(R * 0.7, R * 0.85, R * 0.5, R * 1.08);
  x.quadraticCurveTo(0, R * 1.18, -R * 0.5, R * 1.08);
  x.quadraticCurveTo(-R * 0.7, R * 0.85, -R * 0.62, R * 0.5);
  x.closePath();
}
function apron(x: X, cx: number, cy: number, R: number, k = 1): void {
  x.save();
  x.translate(cx, cy);
  const lw = R * 0.06;
  // fita da cintura
  x.save();
  x.beginPath();
  x.arc(0, 0, R * 1.01, 0, TAU);
  x.clip();
  x.fillStyle = '#ff6b6b';
  x.fillRect(-R * 1.1, R * 0.42, R * 2.2, R * 0.12);
  x.restore();
  apronPath(x, R);
  fs(x, '#ffffff', 0);
  x.save();
  x.clip();
  x.fillStyle = 'rgba(255,107,107,.8)';
  for (let i = -4; i < 5; i++) x.fillRect(i * R * 0.24 - R * 0.04, R * 0.4, R * 0.09, R * 0.9);
  x.restore();
  apronPath(x, R);
  x.lineWidth = lw;
  x.strokeStyle = INK;
  x.stroke();
  // bolso com coração
  rr(x, -R * 0.2, R * 0.66, R * 0.4, R * 0.26, R * 0.06);
  fs(x, '#fff3d6', lw * 0.8);
  x.fillStyle = '#ff5fa2';
  x.beginPath();
  x.moveTo(0, R * 0.87);
  x.bezierCurveTo(-R * 0.13, R * 0.78, -R * 0.07, R * 0.69, 0, R * 0.75);
  x.bezierCurveTo(R * 0.07, R * 0.69, R * 0.13, R * 0.78, 0, R * 0.87);
  x.fill();
  // laço do lado (k = 0..1 aparecendo)
  if (k > 0) {
    x.save();
    x.translate(R * 0.84, R * 0.46);
    x.scale(k, k);
    x.rotate(Math.sin(k * 9) * 0.15 * (1 - k));
    x.beginPath();
    x.ellipse(-R * 0.13, 0, R * 0.15, R * 0.09, -0.4, 0, TAU);
    fs(x, '#ff6b6b', lw * 0.8);
    x.beginPath();
    x.ellipse(R * 0.13, 0, R * 0.15, R * 0.09, 0.4, 0, TAU);
    fs(x, '#ff6b6b', lw * 0.8);
    x.strokeStyle = '#ff6b6b';
    x.lineWidth = R * 0.06;
    x.beginPath();
    x.moveTo(-R * 0.02, R * 0.02);
    x.lineTo(-R * 0.08, R * 0.28);
    x.moveTo(R * 0.02, R * 0.02);
    x.lineTo(R * 0.12, R * 0.26);
    x.stroke();
    circle(x, 0, 0, R * 0.06);
    fs(x, '#ff4d4d', lw * 0.6);
    x.restore();
  }
  x.restore();
}

/* ------------------------------ cenários ------------------------------ */
function kitchenWall(x: X, st: Stage, tt: number, floorY: number): void {
  fillAll(x, st, vgrad(x, -st.hh, floorY, ['#ffd9a8', '#ffe9c8']));
  // azulejos
  x.strokeStyle = 'rgba(200,120,60,.18)';
  x.lineWidth = 0.35;
  x.beginPath();
  for (let gx = -130; gx <= 130; gx += 8) {
    x.moveTo(gx, -st.hh - 2);
    x.lineTo(gx, floorY);
  }
  for (let gy = floorY; gy > -st.hh - 2; gy -= 8) {
    x.moveTo(-st.hw - 2, gy);
    x.lineTo(st.hw + 2, gy);
  }
  x.stroke();
  // piso xadrez
  x.fillStyle = '#c96b4a';
  x.fillRect(-st.hw - 2, floorY, st.hw * 2 + 4, st.hh + 4 - floorY + 2);
  x.fillStyle = '#e8946a';
  for (let gx = -132; gx < 132; gx += 10)
    for (let gy = 0; gy < 3; gy++) if (((gx / 10) | 0) % 2 === gy % 2) x.fillRect(gx, floorY + gy * 6, 10, 6);
  x.fillStyle = 'rgba(0,0,0,.08)';
  x.fillRect(-st.hw - 2, floorY, st.hw * 2 + 4, 1.2);
  void tt;
}
/** janela com sol da manhã + fachos de luz */
function sunWindow(x: X, cx: number, cy: number, tt: number): void {
  rr(x, cx - 14, cy - 12, 28, 24, 3);
  fs(x, '#8a5a3a', 0.8);
  rr(x, cx - 12, cy - 10, 24, 20, 2);
  x.fillStyle = vgrad(x, cy - 10, cy + 10, ['#ffd27a', '#ffb3c8']);
  x.fill();
  circle(x, cx + 3, cy + 2, 5);
  x.fillStyle = '#fff3b0';
  x.fill();
  cloud(x, cx - 5 + Math.sin(tt * 0.3) * 2, cy - 4, 2.2, '#fff', 0.85);
  x.fillStyle = '#8a5a3a';
  x.fillRect(cx - 0.6, cy - 10, 1.2, 20);
  x.fillRect(cx - 12, cy - 0.6, 24, 1.2);
  // fachos
  x.save();
  x.globalCompositeOperation = 'lighter';
  x.globalAlpha = 0.16 + Math.sin(tt * 0.8) * 0.03;
  x.fillStyle = '#fff2c0';
  x.beginPath();
  x.moveTo(cx - 12, cy - 10);
  x.lineTo(cx + 12, cy - 10);
  x.lineTo(cx + 62, cy + 70);
  x.lineTo(cx + 18, cy + 70);
  x.closePath();
  x.fill();
  x.restore();
}
function shelf(x: X, cx: number, cy: number): void {
  rr(x, cx - 18, cy, 36, 2.2, 1);
  fs(x, '#b06a3a', 0.6);
  // panelas penduradas
  const pans: [number, number, string][] = [[-12, 4, '#ff8a5c'], [-2, 5, '#ffd23f'], [9, 3.6, '#4cc9f0']];
  for (const [ox, r, c] of pans) {
    x.strokeStyle = INK;
    x.lineWidth = 0.5;
    x.beginPath();
    x.moveTo(cx + ox, cy + 2.2);
    x.lineTo(cx + ox, cy + 4);
    x.stroke();
    rr(x, cx + ox - 0.6, cy + 3.5, 1.2, r * 0.9, 0.5);
    fs(x, '#6b4a3a', 0.5);
    circle(x, cx + ox, cy + 4 + r * 1.4, r);
    fs(x, c, 0.7);
    circle(x, cx + ox - r * 0.3, cy + 4 + r * 1.2, r * 0.3);
    x.fillStyle = 'rgba(255,255,255,.5)';
    x.fill();
  }
}

/** fachada do restaurante (portas no centro em x=0; chão em y=GY) */
const GY = 26;
function street(x: X, st: Stage, tt: number): void {
  fillAll(x, st, vgrad(x, -st.hh, GY, ['#7ec8ff', '#bfe6ff', '#ffe6c0']));
  // sol
  glow(x, -60, -34, 26, 'rgba(255,240,180,.9)');
  circle(x, -60, -34, 8);
  x.fillStyle = '#fff3b0';
  x.fill();
  for (let i = 0; i < 4; i++) cloud(x, ((i * 70 + tt * 2.2) % 300) - 150, -38 + (i % 2) * 8, 4 + (i % 3), '#fff', 0.9);
  // prédios ao fundo
  const R = [16, 22, 12, 26, 18, 14, 24, 20];
  for (let i = 0; i < 12; i++) {
    const bx = -170 + i * 30;
    const h = R[i % R.length];
    rr(x, bx, GY - 18 - h, 24, 40 + h, 2);
    x.fillStyle = ['#ffcfa0', '#ffb8c8', '#c8d8ff', '#bff0d8'][i % 4];
    x.fill();
    x.fillStyle = 'rgba(255,255,255,.5)';
    for (let wy = 0; wy < 3; wy++) for (let wx = 0; wx < 3; wx++) x.fillRect(bx + 3 + wx * 7, GY - 14 - h + wy * 8, 3.5, 4);
  }
  // calçada e rua
  x.fillStyle = '#d9c8b8';
  x.fillRect(-st.hw - 2, GY, st.hw * 2 + 4, 8);
  x.fillStyle = '#b8a594';
  for (let i = -20; i < 20; i++) x.fillRect(i * 12, GY, 0.4, 8);
  x.fillStyle = '#6a6a80';
  x.fillRect(-st.hw - 2, GY + 8, st.hw * 2 + 4, st.hh + 4);
  x.fillStyle = '#fff';
  for (let i = -20; i < 20; i++) x.fillRect(i * 16, GY + 15, 8, 1.2);
}
/** o restaurante; open = 0..1 (portas abertas), sign = ângulo da placa (0 = FECHADO, π = ABERTO) */
function restaurant(x: X, tt: number, open: number, sign: number): void {
  // corpo
  rr(x, -38, -30, 76, GY + 30, 2);
  fs(x, '#fff1dc', 0.9);
  // tijolinhos
  x.fillStyle = 'rgba(220,130,90,.25)';
  for (let r = 0; r < 12; r++) for (let c = 0; c < 10; c++) x.fillRect(-36 + c * 8 + (r % 2) * 4, -26 + r * 4.4, 6, 1.6);
  // letreiro
  rr(x, -30, -28, 60, 11, 3);
  fs(x, vgrad(x, -28, -17, ['#ff8a5c', '#ff5a7a']), 0.9);
  label(x, t('cozinha.name', 'Cozinha Maluca'), 0, -22.4, 6.2, '#fff6d6', INK, 54);
  // toldo listrado
  x.save();
  x.beginPath();
  x.moveTo(-40, -14);
  x.lineTo(40, -14);
  x.lineTo(44, -7);
  for (let i = 0; i <= 10; i++) x.quadraticCurveTo(44 - i * 8.8 - 4.4, -3, 44 - (i + 1) * 8.8 + 0.01, -7);
  x.closePath();
  x.clip();
  for (let i = -6; i < 6; i++) {
    x.fillStyle = i % 2 ? '#ff5a5a' : '#ffffff';
    x.fillRect(i * 8.8, -16, 8.8, 14);
  }
  x.restore();
  x.beginPath();
  x.moveTo(-40, -14);
  x.lineTo(40, -14);
  x.lineTo(44, -7);
  x.lineTo(-44, -7);
  x.closePath();
  x.lineWidth = 0.7;
  x.strokeStyle = INK;
  x.stroke();
  // janelas com luz
  for (const sx of [-1, 1]) {
    rr(x, sx * 27 - 8, -1, 16, 15, 2);
    fs(x, '#8a5a3a', 0.7);
    rr(x, sx * 27 - 6.5, 0.5, 13, 12, 1.5);
    x.fillStyle = vgrad(x, 0, 12, ['#fff3b0', '#ffc070']);
    x.fill();
    x.fillStyle = 'rgba(138,90,58,.9)';
    x.fillRect(sx * 27 - 0.4, 0.5, 0.8, 12);
    // vaso com plantinha
    rr(x, sx * 27 - 5, GY - 6, 10, 6, 1.5);
    fs(x, '#d9744a', 0.6);
    for (let i = -2; i <= 2; i++) {
      x.beginPath();
      x.ellipse(sx * 27 + i * 1.8, GY - 8 - Math.abs(i) * -0.6, 1.4, 3, i * 0.35 + Math.sin(tt * 2 + i) * 0.05, 0, TAU);
      fs(x, '#4fbf6a', 0.4);
    }
  }
  // porta: luz de dentro
  const dl = -11;
  const dw = 22;
  const dt = -1;
  rr(x, dl - 1.5, dt - 1.5, dw + 3, GY - dt + 1.5, 2);
  fs(x, '#6b3f2a', 0.8);
  x.fillStyle = vgrad(x, dt, GY, ['#fff6c8', '#ffcf7a']);
  x.fillRect(dl, dt, dw, GY - dt);
  if (open > 0.05) {
    x.save();
    x.globalCompositeOperation = 'lighter';
    x.globalAlpha = open * 0.5;
    x.fillStyle = '#ffe8a0';
    x.beginPath();
    x.moveTo(dl, GY);
    x.lineTo(dl + dw, GY);
    x.lineTo(dl + dw + 18 * open, GY + 14);
    x.lineTo(dl - 18 * open, GY + 14);
    x.closePath();
    x.fill();
    x.restore();
  }
  // folhas da porta (abrem para fora: encolhem na horizontal)
  const leaf = (x0: number, dir: number) => {
    const w = (dw / 2) * (1 - open * 0.82);
    const a = dir > 0 ? x0 : x0 - w;
    rr(x, a, dt, w, GY - dt, 1);
    fs(x, vgrad(x, dt, GY, ['#c9784a', '#a85a32']), 0.7);
    if (w > 3) {
      rr(x, a + w * 0.18, dt + 3, w * 0.64, 9, 1);
      x.fillStyle = 'rgba(255,240,200,.75)';
      x.fill();
      circle(x, dir > 0 ? a + w - 1.6 : a + 1.6, dt + 15, 0.7);
      x.fillStyle = '#ffd23f';
      x.fill();
    }
  };
  leaf(dl, 1);
  leaf(dl + dw, -1);
  // plaquinha FECHADO/ABERTO pendurada na porta (vira)
  if (open < 0.35) {
    const c = Math.cos(sign);
    const shown = c > 0 ? t('intro2.cz.closed', 'FECHADO') : t('intro2.cz.open', 'ABERTO');
    x.save();
    x.translate(0, dt + 6 + Math.sin(tt * 3) * 0.2);
    x.strokeStyle = INK;
    x.lineWidth = 0.4;
    x.beginPath();
    x.moveTo(-4, -4);
    x.lineTo(0, -6.5);
    x.lineTo(4, -4);
    x.stroke();
    x.scale(Math.max(0.06, Math.abs(c)), 1);
    rr(x, -9, -4, 18, 7, 1.5);
    fs(x, c > 0 ? '#ff6b6b' : '#3ddc97', 0.6);
    label(x, shown, 0, -0.4, 3.2, '#fff', INK, 16);
    x.restore();
  }
}
/** balão de pensamento com um prato */
function thought(x: X, cx: number, cy: number, k: number, f: Food, tt: number): void {
  if (k <= 0) return;
  x.save();
  x.translate(cx, cy);
  x.scale(k, k);
  x.translate(0, Math.sin(tt * 2 + cx) * 0.6);
  circle(x, -3.5, 7.5, 0.9);
  fs(x, '#fff', 0.4);
  circle(x, -2, 5, 1.4);
  fs(x, '#fff', 0.4);
  x.beginPath();
  x.ellipse(0, -2, 6.5, 5.2, 0, 0, TAU);
  fs(x, '#fff', 0.5);
  food(x, f, 0, -2, 3.2);
  x.restore();
}

/* ------------------------------ cenas ------------------------------ */
function sceneDress(st: Stage, tt: number): void {
  const x = st.x;
  const z = lerp(1, 1.18, ease(seg(tt, 0, T_DOOR)));
  x.save();
  x.scale(z, z);
  x.translate(0, -2);
  kitchenWall(x, st, tt, 20);
  sunWindow(x, -42, -20, tt);
  shelf(x, 38, -32);
  // bancada ao fundo
  rr(x, -st.hw - 4, 8, st.hw * 2 + 8, 13, 1);
  fs(x, '#9a6a4a', 0);
  rr(x, -st.hw - 4, 6, st.hw * 2 + 8, 3, 1);
  fs(x, '#e8e0f0', 0.6);
  // vapor de uma chaleira
  rr(x, 28, 0, 9, 6.5, 3);
  fs(x, '#4cc9f0', 0.6);
  for (let i = 0; i < 3; i++) {
    const k = ((tt * 0.5 + i / 3) % 1);
    glow(x, 34 + Math.sin(k * 6 + i) * 2, -2 - k * 14, 3 + k * 3, 'rgba(255,255,255,.8)', 1 - k);
  }
  // o Bloop
  const R = 12;
  const jump = within(tt, 4.7, 5.9, 0.3, 0.5);
  const hp = hop(tt, 1.1, 0.8);
  const by = 6 - jump * 9 + hp.dy;
  shadow(x, 0, 20, R * (1 - jump * 0.25));
  const lookX = tt < 1.8 ? lerp(0.6, 0.15, seg(tt, 0.8, 1.8)) : tt < 3.4 ? 0.1 : 0.05;
  const lookY = tt > 3.2 && tt < 4.3 ? -0.6 : 0.05;
  bloop(x, 0, by, R, { t: tt, lookX, lookY, sx: hp.sx, sy: hp.sy, mood: 'happy' });
  // avental voando até a barriga
  const ak = easeOut(seg(tt, 0.8, 2.2));
  if (tt >= 0.8) {
    const ax = lerp(60, 0, ak);
    const ay = lerp(-50, by, ak) - Math.sin(ak * Math.PI) * 18;
    x.save();
    x.translate(ax, ay);
    x.rotate((1 - ak) * 2.4);
    x.scale(lerp(0.7, 1, ak), lerp(0.7, 1, ak));
    apron(x, 0, 0, R, back(seg(tt, 2.5, 3.1), 2.5));
    x.restore();
    if (tt > 2.5 && tt < 3.6) for (let i = 0; i < 4; i++) twinkle(x, R * 0.84 + Math.cos(i * 1.6 + tt * 4) * 5, by + R * 0.46 + Math.sin(i * 1.6 + tt * 4) * 5, 1.4, '#fff3a0', within(tt, 2.5, 3.6));
  }
  // chapéu caindo com quique
  if (tt >= 3.5) {
    const hk = seg(tt, 3.5, 4.4);
    const hy = lerp(-st.hh - 20, by - R * 0.72, bounce(hk));
    const sq = hk > 0.35 && hk < 0.6 ? 0.82 : 1;
    chefHat(x, 0, hy, R * 0.95, sq);
  }
  if (jump > 0) for (let i = 0; i < 6; i++) twinkle(x, Math.cos(i * 1.05 + tt) * 20, by + Math.sin(i * 1.05 + tt) * 14, 2 * jump, i % 2 ? '#fff' : '#ffd23f');
  x.restore();
}

function sceneDoor(st: Stage, tt: number): void {
  const x = st.x;
  const k = seg(tt, T_DOOR, T_LINE);
  const fit = Math.min(1, st.hw / 52);
  const z = lerp(1.55, 0.95, ease(seg(tt, T_DOOR + 0.6, T_DOOR + 3.2))) * fit;
  const py = lerp(2, 0, ease(seg(tt, T_DOOR + 0.6, T_DOOR + 3.2)));
  x.save();
  x.scale(z, z);
  x.translate(0, -py - 2);
  street(x, st, tt);
  const sign = ease(seg(tt, T_DOOR + 1.2, T_DOOR + 2.0)) * Math.PI;
  const open = easeOut(seg(tt, T_DOOR + 2.6, T_DOOR + 3.6));
  restaurant(x, tt, open, sign);
  if (open > 0.1) {
    rays(x, 0, 12, tt * 0.4, 46, `rgba(255,236,160,${(0.22 * open).toFixed(3)})`, 12, 0.1);
    const pop = back(seg(tt, T_DOOR + 3.2, T_DOOR + 3.9));
    const hp = hop(tt, 1.6, 2.4);
    shadow(x, 0, GY, 6 * pop);
    if (pop > 0) {
      bloop(x, 0, GY - 7.4 + hp.dy, 7 * pop, { t: tt, sx: hp.sx, sy: hp.sy, mood: 'happy', lookX: 0.2 * Math.sin(tt), lookY: 0.15 });
      apron(x, 0, GY - 7.4 + hp.dy, 7 * pop, 1);
      chefHat(x, 0, GY - 7.4 + hp.dy - 7 * pop * 0.72, 7 * pop * 0.95);
    }
  }
  // cliente curioso espiando na borda (prenúncio da fila)
  const peek = ease(seg(tt, T_LINE - 1.6, T_LINE - 0.6));
  if (peek > 0) bloop(x, lerp(st.hw / z + 10, st.hw / z - 8, peek), GY - 6, 6, { t: tt, skin: friendSkins(1)[0], flip: true, lookX: 0.5, mood: 'happy' });
  x.restore();
  void k;
}

const LINE: Food[] = ['burger', 'pizza', 'soup', 'cake', 'juice', 'ice'];
function sceneLine(st: Stage, tt: number): void {
  const x = st.x;
  const k = ease(seg(tt, T_LINE + 0.3, T_TICKET - 0.6));
  const need = 60;
  const fit = Math.min(1, st.hw / need);
  const z = 0.95 * fit;
  const camX = lerp(10, 58, k);
  x.save();
  x.scale(z, z);
  x.translate(-camX, -2);
  street(x, st, tt);
  restaurant(x, tt, 1, Math.PI);
  bloop(x, -4, GY - 7.4, 7, { t: tt, mood: 'happy', lookX: 0.8 });
  apron(x, -4, GY - 7.4, 7, 1);
  chefHat(x, -4, GY - 7.4 - 5, 6.6);
  const sk = friendSkins(6);
  for (let i = 0; i < 6; i++) {
    const bx = 22 + i * 15;
    const hp = hop(tt + i * 0.37, 1.3 + (i % 3) * 0.2, 1.6 + (i % 2));
    const R = 6 + (i % 3) * 0.5;
    shadow(x, bx, GY, R * 0.9);
    bloop(x, bx, GY - R * 1.05 + hp.dy, R, { t: tt + i, skin: sk[i % sk.length], flip: true, sx: hp.sx, sy: hp.sy, lookX: 0.6, lookY: -0.1, mood: 'happy' });
    // barriguinha roncando
    if ((tt * 1.3 + i) % 2.4 < 0.6) {
      x.strokeStyle = 'rgba(42,11,92,.55)';
      x.lineWidth = 0.4;
      x.beginPath();
      for (let j = 0; j < 3; j++) {
        x.moveTo(bx - R - 1.5 - j * 0.8, GY - R * 0.7 + j * 1.6);
        x.quadraticCurveTo(bx - R - 2.5 - j * 0.8, GY - R * 0.5 + j * 1.6, bx - R - 1.5 - j * 0.8, GY - R * 0.3 + j * 1.6);
      }
      x.stroke();
    }
    const bk = back(seg(tt, T_LINE + 0.9 + i * 0.55, T_LINE + 1.4 + i * 0.55), 2);
    thought(x, bx + 5, GY - R * 2 - 9, bk, LINE[i], tt);
  }
  x.restore();
}

function sceneTicket(st: Stage, tt: number): void {
  const x = st.x;
  const z = lerp(1, 1.12, ease(seg(tt, T_TICKET, T_TITLE)));
  x.save();
  x.scale(z, z);
  kitchenWall(x, st, tt, 24);
  shelf(x, -40, -36);
  // bancada
  rr(x, -st.hw - 4, 14, st.hw * 2 + 8, 14, 1);
  fs(x, '#a8704a', 0.7);
  rr(x, -st.hw - 4, 11, st.hw * 2 + 8, 4, 1.2);
  fs(x, '#f3eefc', 0.7);
  // trilho de pedidos
  rr(x, -40, -38, 80, 2.4, 1.2);
  fs(x, '#c8c0e0', 0.6);
  // impressora
  const pk = seg(tt, T_TICKET + 0.8, T_TICKET + 2.9);
  const pr = Math.sin(tt * 40) * (pk > 0 && pk < 1 ? 0.25 : 0);
  x.save();
  x.translate(pr, 0);
  rr(x, -15, -6, 30, 18, 4);
  fs(x, vgrad(x, -6, 12, ['#5ef0d0', '#1b9e9e']), 0.9);
  rr(x, -11, 4, 22, 5, 2);
  fs(x, '#0d5a66', 0.5);
  circle(x, 9, 6.5, 1.2);
  x.fillStyle = Math.sin(tt * 10) > 0 && pk > 0 && pk < 1 ? '#7bff7b' : '#3ddc97';
  x.fill();
  // ticket saindo para cima
  const th = 31 * easeOut(pk);
  const rip = seg(tt, T_TICKET + 3.6, T_TICKET + 4.2);
  if (th > 0.2) {
    x.save();
    x.translate(0, -6 - rip * 6);
    x.rotate(rip * -0.12);
    x.beginPath();
    x.rect(-10, -th, 20, th);
    x.save();
    x.clip();
    x.translate(0, 36 - th);
    rr(x, -10, -36, 20, 36, 0.5);
    fs(x, '#fffdf4', 0.5);
    // serrilhado no topo
    x.fillStyle = '#ffd9a8';
    for (let i = 0; i < 10; i++) {
      x.beginPath();
      x.moveTo(-10 + i * 2, -36);
      x.lineTo(-9 + i * 2, -35);
      x.lineTo(-8 + i * 2, -36);
      x.fill();
    }
    label(x, t('intro2.cz.order', 'PEDIDO #1'), 0, -31, 3.1, '#ff5a7a', INK, 18);
    x.strokeStyle = 'rgba(42,11,92,.35)';
    x.setLineDash([0.8, 0.8]);
    x.lineWidth = 0.35;
    x.beginPath();
    x.moveTo(-8, -27.4);
    x.lineTo(8, -27.4);
    x.moveTo(-8, -6);
    x.lineTo(8, -6);
    x.stroke();
    x.setLineDash([]);
    food(x, 'burger', -3, -21.5, 3.4);
    label(x, '×1', 5, -21.5, 3, '#2a0b5c', '#fff', 0);
    food(x, 'juice', -3, -12.5, 3.2);
    label(x, '×1', 5, -12.5, 3, '#2a0b5c', '#fff', 0);
    x.restore();
    x.restore();
  }
  x.restore();
  // sininho de balcão
  const ding = within(tt, T_TICKET + 2.9, T_TICKET + 3.4, 0.05, 0.4);
  x.save();
  x.translate(28, 11);
  x.scale(1 + ding * 0.15, 1 - ding * 0.1);
  rr(x, -5, -1.2, 10, 1.6, 0.8);
  fs(x, '#8a6a4a', 0.5);
  x.beginPath();
  x.arc(0, -1.2, 4, Math.PI, 0);
  x.closePath();
  fs(x, vgrad(x, -5, -1, ['#fff6b0', '#ffc02e']), 0.6);
  circle(x, 0, -5.8, 0.8);
  fs(x, '#ffc02e', 0.5);
  x.restore();
  if (ding > 0) {
    x.strokeStyle = `rgba(255,210,63,${ding})`;
    x.lineWidth = 0.6;
    for (let i = 0; i < 3; i++) {
      x.beginPath();
      x.arc(28, 6, 6 + i * 2.5 + ding * 2, -2.4, -0.7);
      x.stroke();
    }
  }
  // o chef espiando da esquerda
  const pe = ease(seg(tt, T_TICKET + 0.3, T_TICKET + 1.2));
  const jump = within(tt, T_TICKET + 3.6, T_TICKET + 4.6, 0.25, 0.5);
  const R = 10;
  const bx = lerp(-st.hw / z - 14, -28, pe);
  const by = 4 - jump * 8;
  bloop(x, bx, by, R, { t: tt, lookX: 0.8, lookY: tt < T_TICKET + 3 ? -0.5 : 0.1, mood: 'happy', sy: 1 + jump * 0.06 });
  apron(x, bx, by, R, 1);
  chefHat(x, bx, by - R * 0.72, R * 0.95);
  if (pk > 0.2 && pk < 1) for (let i = 0; i < 3; i++) twinkle(x, -12 + i * 12, -8 - th * 0.5 + Math.sin(tt * 5 + i) * 3, 1.3, '#fff', 0.8);
  x.restore();
}

function stove(x: X, tt: number, t0: number): void {
  // corpo com forno
  rr(x, -30, 6, 60, 22, 2.5);
  fs(x, vgrad(x, 6, 28, ['#f6f2ff', '#cfc6ea']), 0.8);
  rr(x, -22, 12.5, 44, 12, 2);
  fs(x, '#3a3a52', 0.7);
  rr(x, -19, 15, 38, 7, 1.5);
  x.fillStyle = vgrad(x, 15, 22, ['#ffb03a', '#ff6b3a']);
  x.fill();
  glow(x, 0, 18.5, 14, 'rgba(255,190,90,.55)', 0.6 + Math.sin(tt * 5) * 0.1);
  rr(x, -10, 11, 20, 1.6, 0.8);
  fs(x, '#c8c0e0', 0.5);
  for (let i = 0; i < 4; i++) {
    circle(x, -21 + i * 14, 9, 1.4);
    fs(x, ['#ff6b6b', '#ffd23f', '#3ddc97', '#4cc9f0'][i], 0.5);
  }
  rr(x, -32, 3, 64, 3.5, 1.5);
  fs(x, '#e8e0f0', 0.8);
  for (const fx of [-16, 16]) {
    for (let i = 0; i < 5; i++) {
      const h = 2.2 + Math.sin(tt * 18 + i * 2 + fx) * 0.7;
      x.beginPath();
      x.ellipse(fx - 4 + i * 2, 3 - h * 0.45, 0.8, h * 0.6, 0, 0, TAU);
      x.fillStyle = i % 2 ? '#ffb03a' : '#ff6b3a';
      x.fill();
    }
    rr(x, fx - 7.5, -0.4, 15, 3, 1.4);
    fs(x, '#3a3a52', 0.6);
    rr(x, fx + (fx > 0 ? 7 : -14.5), 0.3, 7.5, 1.4, 0.6);
    fs(x, '#8a5a3a', 0.4);
    // panqueca voando
    const ph = ((tt - t0) * 0.85 + (fx > 0 ? 0.5 : 0)) % 1;
    const py = -0.6 - Math.sin(ph * Math.PI) * 15;
    x.save();
    x.translate(fx, py);
    x.rotate(ph * TAU * (fx > 0 ? -1 : 1));
    x.beginPath();
    x.ellipse(0, 0, 5, 1.5, 0, 0, TAU);
    fs(x, '#ffcf6a', 0.5);
    x.beginPath();
    x.ellipse(0, -0.4, 2.8, 0.55, 0, 0, TAU);
    x.fillStyle = '#e8a03a';
    x.fill();
    x.restore();
  }
}
function sceneTitle(st: Stage, tt: number): void {
  const x = st.x;
  const k = seg(tt, T_TITLE, T_END);
  const z = lerp(0.95, 1.03, ease(k)) * Math.min(1, st.hw / 62);
  x.save();
  x.scale(z, z);
  x.translate(0, 2);
  kitchenWall(x, st, tt, 28);
  rays(x, 0, -8, tt * 0.25, 170, 'rgba(255,255,255,.16)', 16, 0.08);
  stove(x, tt, T_TITLE);
  // vapor
  for (let i = 0; i < 4; i++) {
    const kk = (tt * 0.6 + i / 4) % 1;
    glow(x, -24 + i * 16 + Math.sin(kk * 7) * 1.5, -2 - kk * 22, 2.6 + kk * 4, 'rgba(255,255,255,.8)', (1 - kk) * 0.8);
  }
  // equipe: o chef no meio (na frente do fogão) e dois ajudantes
  const sk = friendSkins(2);
  const team: [number, number, string | undefined, number][] = [[-46, 8.5, sk[0], 0.3], [46, 8.5, sk[1], 0.7], [0, 10, undefined, 0]];
  for (const [bx, R, skin, ph] of team) {
    const hp = hop(tt + ph, 1.8, bx === 0 ? 3 : 2);
    const by = 28 - R * 1.05 + hp.dy;
    shadow(x, bx, 28, R * 0.9);
    bloop(x, bx, by, R, { t: tt + ph, skin, sx: hp.sx, sy: hp.sy, mood: 'happy', flip: bx > 0, lookX: bx === 0 ? 0 : 0.4, lookY: 0.1 });
    apron(x, bx, by, R, 1);
    chefHat(x, bx, by - R * 0.72, R * 0.95);
  }
  confetti(x, st, tt, T_TITLE + 1.2, Math.round(70 * st.q), 11);
  x.restore();
}

export default function play(parent: HTMLElement): Promise<void> {
  return playFilm(parent, {
    id: 'cozinha',
    dur: T_END,
    music: 'cozinha',
    bg: '#2a1408',
    grade: 'radial-gradient(ellipse at 50% 40%,rgba(255,200,140,0) 50%,rgba(120,40,10,.28) 100%)',
    filter: 'saturate(1.12) contrast(1.03)',
    titleCols: ['#fff6d6', '#ffd27a', '#ff8a3d', '#8a2a10'],
    title: () => t('cozinha.name', 'Cozinha Maluca'),
    tagline: () => t('intro2.cz.tag', 'Cozinhe com os amigos e deixe todo mundo feliz!'),
    titleAt: T_TITLE + 0.9,
    subs: [
      { t: 0.6, icons: ['food', 'sparkle'], text: () => t('intro2.cz.s1', 'Primeiro dia no restaurante!') },
      { t: 2.7, icons: ['check'], text: () => t('intro2.cz.s2', 'Avental amarrado, chapéu no lugar...') },
      { t: T_DOOR + 0.8, icons: ['home'], text: () => t('intro2.cz.s3', 'É hora de abrir as portas!') },
      { t: T_LINE + 0.6, icons: ['smile', 'food'], text: () => t('intro2.cz.s4', 'Olha a fila! Todo mundo com fome!') },
      { t: T_TICKET + 0.6, icons: ['ticket'], text: () => t('intro2.cz.s5', 'Plim! Saiu o primeiro pedido!') },
      { t: T_TICKET + 3.4, icons: ['fire', 'food'], text: () => t('intro2.cz.s6', 'Mãos à obra, chef!') },
    ],
    cues: [
      { t: 0.9, fn: sfx.whoosh },
      { t: 2.55, fn: sfx.pop },
      { t: 4.2, fn: sfx.boing },
      { t: 4.8, fn: sfx.yay },
      { t: T_DOOR + 1.4, fn: sfx.swish },
      { t: T_DOOR + 2.6, fn: sfx.door },
      { t: T_DOOR + 3.3, fn: sfx.sparkle },
      { t: T_LINE + 1.0, fn: sfx.pop },
      { t: T_LINE + 2.1, fn: sfx.pop },
      { t: T_LINE + 3.2, fn: sfx.pop },
      { t: T_TICKET + 0.8, fn: sfx.print },
      { t: T_TICKET + 2.9, fn: sfx.ding },
      { t: T_TICKET + 3.7, fn: sfx.swish },
      { t: T_TITLE + 0.4, fn: sfx.sizzle },
    ],
    draw(st, tt) {
      if (tt < T_DOOR) sceneDress(st, tt);
      else if (tt < T_LINE) sceneDoor(st, tt);
      else if (tt < T_TICKET) sceneLine(st, tt);
      else if (tt < T_TITLE) sceneTicket(st, tt);
      else sceneTitle(st, tt);
      dip(st.x, st, tt, [T_DOOR, T_LINE, T_TICKET, T_TITLE], '#1a0a12');
    },
  });
}
