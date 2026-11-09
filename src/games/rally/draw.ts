/* ============================================================
 *  RALLY LUNAR — desenho: carros, sprites cacheados, emotes e cenário
 *  Nada aqui aloca por frame (sprites/gradientes/Path2D em cache).
 * ============================================================ */
import { drawPlayer, type PlayerPose } from '../../game/character';
import type { Skin } from '../../game/skins';
import type { VehicleDef, ZoneDef } from './data';

const TAU = Math.PI * 2;
export const INK = '#2a0b5c';

function rr(x: CanvasRenderingContext2D, X: number, Y: number, W: number, H: number, r: number): void {
  x.beginPath();
  x.roundRect(X, Y, W, H, r);
}

/* ---------------------------- sprites ---------------------------- */

function sprite(size: number, fn: (x: CanvasRenderingContext2D, s: number) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d')!;
  fn(x, size);
  return c;
}

export function coinSprite(size = 48): HTMLCanvasElement {
  return sprite(size, (x, s) => {
    const r = s * 0.4;
    x.translate(s / 2, s / 2);
    x.fillStyle = INK;
    x.beginPath();
    x.arc(0, 0, r + s * 0.05, 0, TAU);
    x.fill();
    const g = x.createLinearGradient(0, -r, 0, r);
    g.addColorStop(0, '#fff6b0');
    g.addColorStop(0.5, '#ffcf2e');
    g.addColorStop(1, '#e98f00');
    x.fillStyle = g;
    x.beginPath();
    x.arc(0, 0, r, 0, TAU);
    x.fill();
    x.fillStyle = '#ffb400';
    x.beginPath();
    x.arc(0, 0, r * 0.68, 0, TAU);
    x.fill();
    star(x, 0, r * 0.03, r * 0.46, r * 0.2, '#fff3a0');
    x.fillStyle = 'rgba(255,255,255,.8)';
    x.beginPath();
    x.ellipse(-r * 0.45, -r * 0.5, r * 0.28, r * 0.13, -0.7, 0, TAU);
    x.fill();
  });
}

function star(x: CanvasRenderingContext2D, cx: number, cy: number, R: number, r: number, col: string): void {
  x.fillStyle = col;
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const q = i % 2 ? r : R;
    if (i) x.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q);
    else x.moveTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q);
  }
  x.closePath();
  x.fill();
}

/** galão de combustível (original: gota-tanque com tampinha) */
export function fuelSprite(size = 56): HTMLCanvasElement {
  return sprite(size, (x, s) => {
    const u = s / 48;
    x.scale(u, u);
    x.lineJoin = 'round';
    x.fillStyle = INK;
    rr(x, 9, 11, 30, 33, 8);
    x.fill();
    rr(x, 18, 4, 12, 9, 3);
    x.fill();
    const g = x.createLinearGradient(0, 12, 0, 42);
    g.addColorStop(0, '#ffbcc7');
    g.addColorStop(0.5, '#ff4f6a');
    g.addColorStop(1, '#c21d3c');
    x.fillStyle = g;
    rr(x, 12, 14, 24, 27, 6);
    x.fill();
    x.fillStyle = '#ffd23f';
    rr(x, 20, 6, 8, 6, 2);
    x.fill();
    // gota
    x.fillStyle = '#fff';
    x.beginPath();
    x.moveTo(24, 19);
    x.quadraticCurveTo(31, 28, 28.5, 32);
    x.arc(24, 31, 4.6, 0.2, Math.PI - 0.2);
    x.quadraticCurveTo(17, 28, 24, 19);
    x.fill();
    x.fillStyle = 'rgba(255,255,255,.5)';
    rr(x, 14, 16, 4, 12, 2);
    x.fill();
  });
}

/** emotes rápidos: desenhos simples dentro de uma bolha */
export const EMOTES = ['joinha', 'vamos', 'uau', 'oi', 'gg'] as const;
export type EmoteCode = (typeof EMOTES)[number];

export function drawEmoteGlyph(x: CanvasRenderingContext2D, code: string, s: number): void {
  // centro 0,0 ; s = tamanho
  const u = s / 48;
  x.save();
  x.scale(u, u);
  x.lineJoin = 'round';
  x.lineCap = 'round';
  switch (code) {
    case 'joinha': {
      // polegar para cima
      x.fillStyle = INK;
      rr(x, -15, -4, 24, 22, 7);
      x.fill();
      rr(x, -6, -21, 11, 22, 5.5);
      x.fill();
      x.fillStyle = '#ffd36b';
      rr(x, -12, -1, 18, 16, 5);
      x.fill();
      rr(x, -3, -18, 5.5, 18, 2.75);
      x.fill();
      x.fillStyle = '#3fb8ff';
      rr(x, 9, -2, 8, 22, 3);
      x.fill();
      x.strokeStyle = 'rgba(42,11,92,.35)';
      x.lineWidth = 2;
      x.beginPath();
      x.moveTo(-10, 5);
      x.lineTo(4, 5);
      x.moveTo(-10, 10);
      x.lineTo(4, 10);
      x.stroke();
      break;
    }
    case 'vamos': {
      // setas duplas para frente
      for (const ox of [-8, 6]) {
        x.strokeStyle = INK;
        x.lineWidth = 11;
        x.beginPath();
        x.moveTo(ox - 6, -12);
        x.lineTo(ox + 5, 0);
        x.lineTo(ox - 6, 12);
        x.stroke();
        x.strokeStyle = '#3ee07a';
        x.lineWidth = 5.5;
        x.stroke();
      }
      break;
    }
    case 'uau': {
      x.save();
      x.fillStyle = INK;
      star(x, 0, 1, 21, 10, INK);
      star(x, 0, 1, 16.5, 7.5, '#ffcf2e');
      x.fillStyle = '#fff';
      x.beginPath();
      x.arc(-4, -3, 2, 0, TAU);
      x.arc(4, -3, 2, 0, TAU);
      x.fill();
      x.fillStyle = INK;
      x.beginPath();
      x.ellipse(0, 4, 2.4, 3, 0, 0, TAU);
      x.fill();
      x.restore();
      break;
    }
    case 'oi': {
      // mãozinha acenando
      x.rotate(-0.25);
      x.fillStyle = INK;
      rr(x, -12, -6, 24, 24, 9);
      x.fill();
      for (let i = 0; i < 4; i++) {
        rr(x, -12 + i * 6.2, -21, 7, 20, 3.5);
        x.fill();
      }
      rr(x, -20, 0, 14, 7, 3.5);
      x.fill();
      x.fillStyle = '#ffb3d9';
      rr(x, -9, -3, 18, 18, 7);
      x.fill();
      for (let i = 0; i < 4; i++) {
        rr(x, -9.5 + i * 5.3, -18, 4.2, 18, 2.1);
        x.fill();
      }
      rr(x, -17, 2.5, 10, 3, 1.5);
      x.fill();
      x.rotate(0.25);
      x.strokeStyle = '#5ef0ff';
      x.lineWidth = 3;
      x.beginPath();
      x.arc(4, -6, 24, -0.9, -0.4);
      x.stroke();
      break;
    }
    case 'gg': {
      x.font = '900 26px Fredoka, system-ui, sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.lineWidth = 7;
      x.strokeStyle = INK;
      x.strokeText('GG', 0, 2);
      x.fillStyle = '#ff9a2e';
      x.fillText('GG', 0, 2);
      break;
    }
  }
  x.restore();
}

export function emoteSprite(code: string, size = 72): HTMLCanvasElement {
  return sprite(size, (x, s) => {
    x.translate(s / 2, s / 2 - s * 0.04);
    const r = s * 0.38;
    // bolha com rabinho
    x.fillStyle = INK;
    x.beginPath();
    x.arc(0, 0, r + 3, 0, TAU);
    x.moveTo(-8, r - 2);
    x.lineTo(0, r + 13);
    x.lineTo(8, r - 2);
    x.fill();
    x.fillStyle = '#fff';
    x.beginPath();
    x.arc(0, 0, r, 0, TAU);
    x.moveTo(-6, r - 4);
    x.lineTo(0, r + 8);
    x.lineTo(6, r - 4);
    x.fill();
    drawEmoteGlyph(x, code, r * 1.55);
  });
}

/* ---------------------------- carro ---------------------------- */

export interface CarPose {
  /** posições locais (px, y para baixo) das rodas e seu giro */
  w0x: number;
  w0y: number;
  w1x: number;
  w1y: number;
  spin0: number;
  spin1: number;
  gas: boolean;
  t: number;
  mood: PlayerPose['mood'];
}

const pose: PlayerPose = { t: 0, blink: 0, lookX: 0.4, lookY: 0, sx: 1, sy: 1, mood: 'idle', lx: -0.55, ly: -0.83 };

function wheel(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, spin: number, rim: string, big: boolean): void {
  x.fillStyle = INK;
  x.beginPath();
  x.arc(cx, cy, r, 0, TAU);
  x.fill();
  x.fillStyle = '#3b3355';
  x.beginPath();
  x.arc(cx, cy, r * 0.86, 0, TAU);
  x.fill();
  // cravos do pneu
  x.fillStyle = INK;
  const n = big ? 10 : 8;
  for (let i = 0; i < n; i++) {
    const a = spin + (i * TAU) / n;
    x.beginPath();
    x.arc(cx + Math.cos(a) * r * 0.93, cy + Math.sin(a) * r * 0.93, r * 0.11, 0, TAU);
    x.fill();
  }
  x.fillStyle = rim;
  x.beginPath();
  x.arc(cx, cy, r * 0.5, 0, TAU);
  x.fill();
  x.strokeStyle = INK;
  x.lineWidth = Math.max(1, r * 0.1);
  x.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = spin + (i * TAU) / 3;
    x.moveTo(cx, cy);
    x.lineTo(cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5);
  }
  x.stroke();
  x.fillStyle = 'rgba(255,255,255,.55)';
  x.beginPath();
  x.arc(cx - r * 0.15, cy - r * 0.18, r * 0.14, 0, TAU);
  x.fill();
}

function hoverPad(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, t: number, col: string): void {
  x.fillStyle = INK;
  rr(x, cx - r * 1.1, cy - r * 0.55, r * 2.2, r * 0.9, r * 0.4);
  x.fill();
  x.fillStyle = col;
  rr(x, cx - r * 0.95, cy - r * 0.42, r * 1.9, r * 0.62, r * 0.3);
  x.fill();
  const k = 0.55 + Math.sin(t * 20 + cx) * 0.2;
  x.fillStyle = 'rgba(120,255,240,' + k.toFixed(2) + ')';
  x.beginPath();
  x.ellipse(cx, cy + r * 0.55, r * 0.8, r * 0.32, 0, 0, TAU);
  x.fill();
}

/**
 * Desenha o carro com origem no centro do chassi (já rotacionado), em px com y para baixo.
 * S = pixels por metro.
 */
export function drawCar(x: CanvasRenderingContext2D, def: VehicleDef, S: number, p: CarPose, skin: Skin | null): void {
  const L = (def.wheelBase + 0.3) * S;
  const big = def.shape === 'monster';
  x.lineJoin = 'round';
  x.lineCap = 'round';
  const ol = Math.max(2, S * 0.07);

  // suportes da suspensão
  x.strokeStyle = INK;
  x.lineWidth = Math.max(2, S * 0.09);
  x.beginPath();
  x.moveTo(-L * 0.6, 0.05 * S);
  x.lineTo(p.w0x, p.w0y);
  x.moveTo(L * 0.6, 0.05 * S);
  x.lineTo(p.w1x, p.w1y);
  x.stroke();

  // motorista (atrás da carroceria)
  if (skin) {
    pose.t = p.t;
    pose.mood = p.mood;
    pose.blink = (p.t % 3.3) < 0.12 ? 1 : 0;
    const R = 0.36 * S;
    x.save();
    x.translate(def.shape === 'rocket' ? 0.05 * S : -0.05 * S, (def.shape === 'monster' ? -0.95 : def.shape === 'icecream' ? -0.5 : -0.62) * S);
    drawPlayer(x, skin, R, pose);
    x.restore();
  }

  const B = def.body;
  const B2 = def.body2;
  const T = def.trim;
  x.lineWidth = ol;
  x.strokeStyle = INK;
  switch (def.shape) {
    case 'buggy': {
      // santo-antônio
      x.lineWidth = Math.max(2, S * 0.1);
      x.beginPath();
      x.moveTo(-0.7 * S, -0.1 * S);
      x.quadraticCurveTo(-0.55 * S, -1.25 * S, 0.2 * S, -1.15 * S);
      x.lineTo(0.45 * S, -0.2 * S);
      x.stroke();
      x.strokeStyle = T;
      x.lineWidth = Math.max(1, S * 0.05);
      x.stroke();
      x.strokeStyle = INK;
      x.lineWidth = ol;
      x.fillStyle = B;
      x.beginPath();
      x.moveTo(-L, -0.3 * S);
      x.lineTo(-0.35 * S, -0.3 * S);
      x.quadraticCurveTo(0, -0.05 * S, 0.45 * S, -0.35 * S);
      x.lineTo(L * 0.92, -0.25 * S);
      x.quadraticCurveTo(L * 1.05, 0.1 * S, L * 0.8, 0.3 * S);
      x.lineTo(-L * 0.9, 0.3 * S);
      x.quadraticCurveTo(-L * 1.05, 0, -L, -0.3 * S);
      x.closePath();
      x.fill();
      x.stroke();
      x.fillStyle = B2;
      rr(x, -L * 0.75, 0.02 * S, L * 1.45, 0.14 * S, 0.07 * S);
      x.fill();
      // bandeirinha
      x.strokeStyle = INK;
      x.lineWidth = Math.max(1.5, S * 0.04);
      x.beginPath();
      x.moveTo(-L * 0.95, -0.3 * S);
      x.lineTo(-L * 1.05, -1.3 * S);
      x.stroke();
      x.fillStyle = T;
      x.beginPath();
      x.moveTo(-L * 1.05, -1.3 * S);
      x.lineTo(-L * 1.05 - 0.45 * S, -1.18 * S + Math.sin(p.t * 9) * 0.06 * S);
      x.lineTo(-L * 1.04, -1.05 * S);
      x.fill();
      break;
    }
    case 'rover': {
      // antena parabólica
      x.strokeStyle = INK;
      x.lineWidth = Math.max(1.5, S * 0.05);
      x.beginPath();
      x.moveTo(-L * 0.7, -0.35 * S);
      x.lineTo(-L * 0.7, -1.1 * S);
      x.stroke();
      x.fillStyle = B2;
      x.beginPath();
      x.ellipse(-L * 0.7, -1.15 * S, 0.32 * S, 0.12 * S, -0.5 + Math.sin(p.t * 1.5) * 0.3, 0, TAU);
      x.fill();
      x.stroke();
      x.fillStyle = B;
      rr(x, -L, -0.35 * S, L * 2, 0.62 * S, 0.14 * S);
      x.fill();
      x.lineWidth = ol;
      x.stroke();
      // painel solar
      x.fillStyle = '#2a6dff';
      rr(x, 0.2 * S, -0.55 * S, L * 0.75, 0.16 * S, 0.05 * S);
      x.fill();
      x.stroke();
      x.fillStyle = B2;
      for (let i = 0; i < 4; i++) {
        x.beginPath();
        x.arc(-L * 0.6 + i * L * 0.4, 0.05 * S, 0.07 * S, 0, TAU);
        x.fill();
      }
      x.fillStyle = T;
      rr(x, L * 0.82, -0.25 * S, 0.18 * S, 0.18 * S, 0.06 * S);
      x.fill();
      break;
    }
    case 'icecream': {
      // carroceria com janela vazada (o motorista aparece por ela)
      x.fillStyle = B;
      x.beginPath();
      x.roundRect(-L, -0.95 * S, L * 2, 1.25 * S, 0.2 * S);
      x.roundRect(-0.42 * S, -0.84 * S, 0.8 * S, 0.52 * S, 0.12 * S);
      x.fill('evenodd');
      x.stroke();
      x.fillStyle = 'rgba(191,243,255,.3)';
      rr(x, -0.42 * S, -0.84 * S, 0.8 * S, 0.52 * S, 0.12 * S);
      x.fill();
      x.fillStyle = B2;
      rr(x, -L, 0.05 * S, L * 2, 0.22 * S, 0.1 * S);
      x.fill();
      // casquinha gigante no teto
      x.fillStyle = '#f0b060';
      x.beginPath();
      x.moveTo(0.5 * S, -1.05 * S);
      x.lineTo(1.0 * S, -1.05 * S);
      x.lineTo(0.75 * S, -0.92 * S);
      x.closePath();
      x.fill();
      x.fillStyle = T;
      x.beginPath();
      x.arc(0.75 * S, -1.25 * S, 0.3 * S, 0, TAU);
      x.fill();
      x.stroke();
      x.fillStyle = '#fff';
      x.beginPath();
      x.arc(0.75 * S, -1.55 * S, 0.2 * S, 0, TAU);
      x.fill();
      x.stroke();
      x.fillStyle = '#ff5d8f';
      x.beginPath();
      x.arc(0.8 * S, -1.78 * S, 0.07 * S, 0, TAU);
      x.fill();
      break;
    }
    case 'monster': {
      // santo-antônio alto
      x.lineWidth = Math.max(2, S * 0.1);
      x.beginPath();
      x.moveTo(-0.75 * S, -0.5 * S);
      x.quadraticCurveTo(-0.6 * S, -1.6 * S, 0.25 * S, -1.5 * S);
      x.lineTo(0.5 * S, -0.55 * S);
      x.stroke();
      x.strokeStyle = T;
      x.lineWidth = Math.max(1, S * 0.05);
      x.stroke();
      x.strokeStyle = INK;
      x.lineWidth = ol;
      x.fillStyle = B;
      x.beginPath();
      x.moveTo(-L, -0.1 * S);
      x.lineTo(-L * 0.92, -0.6 * S);
      x.lineTo(-0.35 * S, -0.6 * S);
      x.quadraticCurveTo(0, -0.4 * S, 0.45 * S, -0.62 * S);
      x.lineTo(L * 0.95, -0.5 * S);
      x.lineTo(L, 0.15 * S);
      x.lineTo(-L, 0.15 * S);
      x.closePath();
      x.fill();
      x.stroke();
      x.fillStyle = B2;
      for (let i = 0; i < 3; i++) {
        x.beginPath();
        x.moveTo(-L * 0.8 + i * 0.45 * S, 0.1 * S);
        x.lineTo(-L * 0.6 + i * 0.45 * S, -0.35 * S);
        x.lineTo(-L * 0.45 + i * 0.45 * S, -0.35 * S);
        x.lineTo(-L * 0.65 + i * 0.45 * S, 0.1 * S);
        x.fill();
      }
      x.fillStyle = T;
      rr(x, L * 0.75, -0.42 * S, 0.22 * S, 0.14 * S, 0.06 * S);
      x.fill();
      break;
    }
    case 'rocket': {
      // chama do foguete
      if (p.gas) {
        const fl = 0.5 + Math.sin(p.t * 40) * 0.15;
        x.fillStyle = '#ffb02e';
        x.beginPath();
        x.moveTo(-L, -0.35 * S);
        x.lineTo(-L - fl * S, -0.2 * S);
        x.lineTo(-L, -0.05 * S);
        x.fill();
        x.fillStyle = '#fff36b';
        x.beginPath();
        x.moveTo(-L, -0.28 * S);
        x.lineTo(-L - fl * 0.55 * S, -0.2 * S);
        x.lineTo(-L, -0.12 * S);
        x.fill();
      }
      x.fillStyle = B;
      x.beginPath();
      x.moveTo(-L, -0.45 * S);
      x.lineTo(0.3 * S, -0.45 * S);
      x.quadraticCurveTo(L * 1.1, -0.35 * S, L * 1.15, 0);
      x.quadraticCurveTo(L * 1.1, 0.25 * S, 0.3 * S, 0.25 * S);
      x.lineTo(-L, 0.25 * S);
      x.closePath();
      x.fill();
      x.stroke();
      // aleta
      x.fillStyle = B2;
      x.beginPath();
      x.moveTo(-L, -0.45 * S);
      x.lineTo(-L * 1.05, -1.0 * S);
      x.lineTo(-L * 0.55, -0.45 * S);
      x.closePath();
      x.fill();
      x.stroke();
      x.fillStyle = T;
      rr(x, -L * 0.6, -0.12 * S, L * 1.2, 0.12 * S, 0.06 * S);
      x.fill();
      x.fillStyle = '#bff3ff';
      x.beginPath();
      x.arc(L * 0.65, -0.15 * S, 0.12 * S, 0, TAU);
      x.fill();
      x.stroke();
      break;
    }
    case 'hover': {
      x.fillStyle = B;
      x.beginPath();
      x.ellipse(0, -0.05 * S, L * 1.02, 0.4 * S, 0, 0, TAU);
      x.fill();
      x.stroke();
      x.fillStyle = B2;
      x.beginPath();
      x.ellipse(0, 0.08 * S, L * 0.9, 0.16 * S, 0, 0, TAU);
      x.fill();
      x.fillStyle = T;
      for (let i = 0; i < 5; i++) {
        const k = (i + ((p.t * 3) % 1)) / 5;
        x.globalAlpha = 0.5 + 0.5 * Math.sin(k * Math.PI);
        x.beginPath();
        x.arc(-L * 0.7 + k * L * 1.4, 0.08 * S, 0.06 * S, 0, TAU);
        x.fill();
      }
      x.globalAlpha = 1;
      // bolha de vidro
      x.fillStyle = 'rgba(190,240,255,.28)';
      x.beginPath();
      x.ellipse(-0.05 * S, -0.55 * S, 0.62 * S, 0.62 * S, 0, Math.PI, TAU);
      x.fill();
      x.strokeStyle = 'rgba(42,11,92,.6)';
      x.stroke();
      break;
    }
  }
  // brilho
  x.fillStyle = 'rgba(255,255,255,.35)';
  rr(x, -L * 0.6, -0.28 * S, L * 0.6, 0.07 * S, 0.035 * S);
  x.fill();

  // rodas por cima
  const wr = def.wheelR * S;
  if (def.shape === 'hover') {
    hoverPad(x, p.w0x, p.w0y, wr, p.t, T);
    hoverPad(x, p.w1x, p.w1y, wr, p.t, T);
  } else {
    wheel(x, p.w0x, p.w0y, wr, p.spin0, T, big);
    wheel(x, p.w1x, p.w1y, wr, p.spin1, T, big);
  }
}

/* ---------------------------- cenário ---------------------------- */

interface Backdrop {
  sky: CanvasGradient;
  far: Path2D;
  mid: Path2D;
  tile: number;
}
const bdCache = new Map<string, Backdrop>();
let bdW = 0;
let bdH = 0;

function hills(w: number, h: number, base: number, amp: number, n: number, seed: number, bumpy: boolean): Path2D {
  const p = new Path2D();
  p.moveTo(0, h);
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    let y = base;
    for (let k = 1; k <= 3; k++) y -= Math.sin(u * TAU * n * k + seed * k) * (amp / (k * (bumpy ? 1 : 1.6)));
    p.lineTo(u * w, y);
  }
  p.lineTo(w, h);
  p.closePath();
  return p;
}

function backdrop(x: CanvasRenderingContext2D, z: ZoneDef, w: number, h: number): Backdrop {
  if (w !== bdW || h !== bdH) {
    bdCache.clear();
    bdW = w;
    bdH = h;
  }
  let b = bdCache.get(z.id);
  if (!b) {
    const sky = x.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, z.sky[0]);
    sky.addColorStop(1, z.sky[1]);
    const tile = Math.max(w, 600) * 1.5;
    const seed = z.id.length * 1.7;
    const spiky = z.deco === 'ice';
    b = {
      sky,
      tile,
      far: hills(tile, h, h * 0.55, h * (spiky ? 0.12 : 0.07), 2, seed, spiky),
      mid: hills(tile, h, h * 0.7, h * 0.05, 3, seed + 2, z.deco === 'jungle'),
    };
    bdCache.set(z.id, b);
  }
  return b;
}

const STARS = (() => {
  const a = new Float32Array(90);
  let s = 7;
  for (let i = 0; i < a.length; i++) {
    s = (s * 16807) % 2147483647;
    a[i] = s / 2147483647;
  }
  return a;
})();

/** fundo com parallax (sky + astro + 2 camadas de morros + enfeites) */
export function drawBackdrop(x: CanvasRenderingContext2D, z: ZoneDef, w: number, h: number, camX: number, S: number, t: number, layers: number): void {
  const b = backdrop(x, z, w, h);
  x.fillStyle = b.sky;
  x.fillRect(0, 0, w, h);
  // astro
  if (z.deco === 'stars') {
    x.fillStyle = '#fff';
    for (let i = 0; i < STARS.length; i += 3) {
      const sx = ((STARS[i] * w * 1.2 - camX * S * 0.02) % w + w) % w;
      const sy = STARS[i + 1] * h * 0.55;
      const r = 0.6 + STARS[i + 2] * 1.6;
      x.globalAlpha = 0.5 + 0.5 * Math.sin(t * 2 + i);
      x.fillRect(sx, sy, r, r);
    }
    x.globalAlpha = 1;
    // planeta azul (lar distante)
    const px = w * 0.78;
    const py = h * 0.17;
    const pr = Math.min(w, h) * 0.09;
    x.fillStyle = '#3fb8ff';
    x.beginPath();
    x.arc(px, py, pr, 0, TAU);
    x.fill();
    x.fillStyle = '#3ee07a';
    x.beginPath();
    x.ellipse(px - pr * 0.3, py - pr * 0.1, pr * 0.35, pr * 0.22, 0.5, 0, TAU);
    x.ellipse(px + pr * 0.35, py + pr * 0.35, pr * 0.25, pr * 0.15, -0.3, 0, TAU);
    x.fill();
    x.fillStyle = 'rgba(18,11,58,.35)';
    x.beginPath();
    x.arc(px + pr * 0.25, py + pr * 0.1, pr, 0, TAU);
    x.fill();
  } else if (z.deco === 'dunes' || z.deco === 'candy') {
    x.fillStyle = z.deco === 'dunes' ? 'rgba(255,240,170,.9)' : 'rgba(255,255,255,.85)';
    x.beginPath();
    x.arc(w * 0.75, h * 0.18, Math.min(w, h) * 0.08, 0, TAU);
    x.fill();
  }
  if (z.deco !== 'stars') {
    // nuvenzinhas
    x.fillStyle = 'rgba(255,255,255,.55)';
    for (let i = 0; i < 3; i++) {
      const cx = (((i * 0.37 + 0.1) * w * 1.4 - camX * S * 0.04 - t * 6) % (w * 1.4) + w * 1.4) % (w * 1.4) - w * 0.2;
      const cy = h * (0.12 + i * 0.08);
      x.beginPath();
      x.ellipse(cx, cy, 36, 12, 0, 0, TAU);
      x.ellipse(cx + 22, cy - 8, 22, 13, 0, 0, TAU);
      x.fill();
    }
  }
  if (layers >= 2) {
    x.fillStyle = z.far;
    const o = -((camX * S * 0.12) % b.tile);
    x.save();
    x.translate(o, 0);
    x.fill(b.far);
    x.translate(b.tile, 0);
    x.fill(b.far);
    x.restore();
  }
  // camada do meio com enfeites
  const o2 = -((camX * S * 0.3) % b.tile);
  x.fillStyle = z.mid;
  x.save();
  x.translate(o2, 0);
  x.fill(b.mid);
  x.translate(b.tile, 0);
  x.fill(b.mid);
  x.restore();
  if (layers >= 3) drawDecos(x, z, w, h, camX * S * 0.3, Math.min(w, h) / 9);
}

function drawDecos(x: CanvasRenderingContext2D, z: ZoneDef, w: number, h: number, off: number, u: number): void {
  const gap = u * 2.6;
  const first = Math.floor(off / gap);
  const last = Math.ceil((off + w) / gap);
  for (let i = first; i <= last; i++) {
    const r = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
    if (r < 0.45) continue;
    const sx = i * gap - off + r * gap * 0.5;
    const sy = h * 0.69 + r * u * 0.3;
    const k = 0.6 + r * 0.5;
    switch (z.deco) {
      case 'candy': {
        x.fillStyle = '#fff';
        x.fillRect(sx - 2, sy - u * 1.1 * k, 4, u * 1.1 * k);
        x.fillStyle = r > 0.7 ? '#ff5cc8' : '#5ef0ff';
        x.beginPath();
        x.arc(sx, sy - u * 1.15 * k, u * 0.38 * k, 0, TAU);
        x.fill();
        x.strokeStyle = '#fff';
        x.lineWidth = 3;
        x.beginPath();
        x.arc(sx, sy - u * 1.15 * k, u * 0.2 * k, 0, 4.5);
        x.stroke();
        break;
      }
      case 'ice': {
        x.fillStyle = 'rgba(255,255,255,.85)';
        x.beginPath();
        x.moveTo(sx, sy - u * 1.2 * k);
        x.lineTo(sx + u * 0.35 * k, sy);
        x.lineTo(sx - u * 0.35 * k, sy);
        x.fill();
        x.fillStyle = 'rgba(160,220,255,.9)';
        x.beginPath();
        x.moveTo(sx, sy - u * 1.2 * k);
        x.lineTo(sx + u * 0.35 * k, sy);
        x.lineTo(sx, sy);
        x.fill();
        break;
      }
      case 'jungle': {
        x.strokeStyle = '#6b4a2a';
        x.lineWidth = Math.max(3, u * 0.12);
        x.beginPath();
        x.moveTo(sx, sy);
        x.quadraticCurveTo(sx + u * 0.2, sy - u * 0.7 * k, sx + u * 0.1, sy - u * 1.4 * k);
        x.stroke();
        x.fillStyle = '#2fbf5a';
        for (let j = 0; j < 4; j++) {
          x.beginPath();
          x.ellipse(sx + u * 0.1, sy - u * 1.4 * k, u * 0.55 * k, u * 0.16 * k, (j * Math.PI) / 4 + 0.3, 0, TAU);
          x.fill();
        }
        break;
      }
      case 'dunes': {
        x.fillStyle = '#2fa8a0';
        x.beginPath();
        x.roundRect(sx - u * 0.13 * k, sy - u * 1.1 * k, u * 0.26 * k, u * 1.1 * k, u * 0.13 * k);
        x.roundRect(sx - u * 0.42 * k, sy - u * 0.75 * k, u * 0.18 * k, u * 0.4 * k, u * 0.09 * k);
        x.roundRect(sx + u * 0.24 * k, sy - u * 0.9 * k, u * 0.18 * k, u * 0.4 * k, u * 0.09 * k);
        x.fill();
        break;
      }
      case 'stars': {
        x.fillStyle = '#5a4e94';
        x.beginPath();
        x.ellipse(sx, sy, u * 0.5 * k, u * 0.25 * k, 0, Math.PI, TAU);
        x.fill();
        break;
      }
    }
  }
}
