/* ============================================================
 *  CASA DO BLOOP — desenho (canvas 2D).
 *  - fundos dos cômodos cacheados por tamanho/decoração (1 drawImage/frame)
 *  - personagem do jogador (drawPlayer) GRANDE + camadas de estado
 *    procedurais (sujeira, espuma, lágrimas, olheiras, brilho...)
 *  - partículas em pool de arrays tipados (zero alocação por frame)
 * ============================================================ */
import { drawPlayer, type PlayerPose } from '../game/character';
import type { Skin } from '../game/skins';
import { decorById, type FoodShape } from './catalog';
import type { Mood } from './state';
import { gameFont } from '../i18n/font';

export type Room = 'kitchen' | 'bath' | 'bed' | 'play';
export const ROOMS: Room[] = ['kitchen', 'bath', 'bed', 'play'];

const TAU = Math.PI * 2;

/* ============================================================
 *  PARTÍCULAS
 * ============================================================ */

export const enum PK {
  Crumb,
  Bubble,
  Water,
  Sparkle,
  Heart,
  Zzz,
  Star,
  Tear,
  Puff,
  Note,
  Fire,
  Coin,
}

const PCOL = ['#ffffff', '#ffd36b', '#c98a4a', '#8fe3ff', '#ff7ab8', '#ffe27a', '#b9a6ff', '#7fd67a', '#ff9a2e', '#e8f6ff', '#ff4a2e', '#a6e36b'];

export class Fx {
  readonly n: number;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  life: Float32Array;
  max: Float32Array;
  size: Float32Array;
  kind: Uint8Array;
  col: Uint8Array;
  budget = 1;
  floorY = 1e9;
  private head = 0;

  constructor(n = 260) {
    this.n = n;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n);
    this.size = new Float32Array(n);
    this.kind = new Uint8Array(n);
    this.col = new Uint8Array(n);
  }

  emit(kind: PK, x: number, y: number, vx: number, vy: number, life: number, size: number, col = 0): void {
    // corações, Zzz, lágrimas e notas carregam significado: nunca são cortados
    if (this.budget < 1 && kind !== PK.Heart && kind !== PK.Zzz && kind !== PK.Tear && kind !== PK.Note && kind !== PK.Coin && Math.random() > this.budget) return;
    const i = this.head;
    this.head = (this.head + 1) % this.n;
    this.kind[i] = kind;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = life;
    this.max[i] = life;
    this.size[i] = size;
    this.col[i] = col;
  }

  burst(kind: PK, x: number, y: number, count: number, speed: number, life: number, size: number, col = 0, up = 0): void {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * TAU;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.emit(kind, x, y, Math.cos(a) * s, Math.sin(a) * s - up, life * (0.7 + Math.random() * 0.5), size * (0.7 + Math.random() * 0.6), col);
    }
  }

  clear(): void {
    this.life.fill(0);
  }

  update(dt: number): void {
    const { x, y, vx, vy, life, kind, n } = this;
    for (let i = 0; i < n; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      const k = kind[i];
      if (k === PK.Crumb || k === PK.Water || k === PK.Tear || k === PK.Coin) {
        vy[i] += (k === PK.Tear ? 260 : 1400) * dt;
        if (y[i] > this.floorY && vy[i] > 0) {
          if ((k === PK.Crumb || k === PK.Coin) && Math.abs(vy[i]) > 120) {
            vy[i] *= -0.35;
            vx[i] *= 0.6;
          } else if (k !== PK.Crumb && k !== PK.Coin) life[i] = 0;
          else vy[i] = 0;
        }
      } else if (k === PK.Bubble || k === PK.Heart || k === PK.Zzz || k === PK.Note) {
        vy[i] -= 40 * dt;
        vx[i] += Math.sin((life[i] + i) * 5) * 30 * dt;
      } else if (k === PK.Puff || k === PK.Fire) {
        vx[i] *= 1 - 2 * dt;
        vy[i] *= 1 - 2 * dt;
        if (k === PK.Fire) vy[i] -= 120 * dt;
      } else {
        vx[i] *= 1 - 3 * dt;
        vy[i] *= 1 - 3 * dt;
      }
      x[i] += vx[i] * dt;
      y[i] += vy[i] * dt;
    }
  }

  draw(c: CanvasRenderingContext2D): void {
    const { x, y, life, max, size, kind, col, n } = this;
    for (let i = 0; i < n; i++) {
      if (life[i] <= 0) continue;
      const u = life[i] / max[i];
      const s = size[i];
      const px = x[i];
      const py = y[i];
      c.globalAlpha = u < 0.3 ? u / 0.3 : 1;
      c.fillStyle = PCOL[col[i]];
      switch (kind[i]) {
        case PK.Crumb:
          c.fillRect(px - s / 2, py - s / 2, s, s);
          break;
        case PK.Bubble: {
          c.globalAlpha *= 0.85;
          c.strokeStyle = 'rgba(255,255,255,0.95)';
          c.lineWidth = Math.max(1, s * 0.16);
          c.fillStyle = 'rgba(200,240,255,0.35)';
          c.beginPath();
          c.arc(px, py, s, 0, TAU);
          c.fill();
          c.stroke();
          c.fillStyle = '#fff';
          c.beginPath();
          c.arc(px - s * 0.35, py - s * 0.35, s * 0.22, 0, TAU);
          c.fill();
          break;
        }
        case PK.Water:
        case PK.Tear:
          c.beginPath();
          c.moveTo(px, py - s * 1.6);
          c.quadraticCurveTo(px + s, py, px, py + s);
          c.quadraticCurveTo(px - s, py, px, py - s * 1.6);
          c.fill();
          if (kind[i] === PK.Tear) {
            c.strokeStyle = 'rgba(42,11,92,0.5)';
            c.lineWidth = 1.5;
            c.stroke();
          }
          break;
        case PK.Sparkle:
        case PK.Star: {
          const k = s * (0.4 + 0.6 * Math.sin(u * Math.PI));
          sparkle(c, px, py, k);
          break;
        }
        case PK.Heart:
          heart(c, px, py, s);
          break;
        case PK.Zzz: {
          const fs = Math.round(s * (1.4 - u * 0.6));
          c.font = gameFont(700, fs);
          c.textAlign = 'center';
          c.lineJoin = 'round';
          c.strokeStyle = '#2a0b5c';
          c.lineWidth = Math.max(3, fs * 0.16);
          c.strokeText('Z', px, py);
          c.fillText('Z', px, py);
          break;
        }
        case PK.Puff:
          c.globalAlpha = u * 0.6;
          c.beginPath();
          c.arc(px, py, s * (1.6 - u * 0.6), 0, TAU);
          c.fill();
          break;
        case PK.Note:
          c.beginPath();
          c.ellipse(px, py, s * 0.45, s * 0.34, -0.4, 0, TAU);
          c.fill();
          c.fillRect(px + s * 0.32, py - s * 1.2, s * 0.14, s * 1.2);
          break;
        case PK.Fire: {
          // chaminha: vermelho -> laranja -> amarelo conforme apaga
          const r = s * (0.6 + (1 - u) * 0.8);
          c.fillStyle = u > 0.66 ? '#ffe27a' : u > 0.33 ? '#ff9a2e' : '#ff4a2e';
          c.beginPath();
          c.moveTo(px, py - r * 1.5);
          c.quadraticCurveTo(px + r, py - r * 0.2, px, py + r);
          c.quadraticCurveTo(px - r, py - r * 0.2, px, py - r * 1.5);
          c.fill();
          break;
        }
        case PK.Coin:
          c.fillStyle = '#ffcf2e';
          c.strokeStyle = '#a86a00';
          c.lineWidth = Math.max(1.5, s * 0.18);
          c.beginPath();
          c.ellipse(px, py, s * Math.abs(Math.cos(life[i] * 9)) + 1, s, 0, 0, TAU);
          c.fill();
          c.stroke();
          break;
      }
    }
    c.globalAlpha = 1;
  }
}

export function sparkle(c: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  const q = s * 0.2;
  c.beginPath();
  c.moveTo(x, y - s);
  c.quadraticCurveTo(x + q, y - q, x + s, y);
  c.quadraticCurveTo(x + q, y + q, x, y + s);
  c.quadraticCurveTo(x - q, y + q, x - s, y);
  c.quadraticCurveTo(x - q, y - q, x, y - s);
  c.fill();
}

export function heart(c: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  c.beginPath();
  c.moveTo(x, y + s * 0.9);
  c.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.7, y - s * 1.1, x, y - s * 0.4);
  c.bezierCurveTo(x + s * 0.7, y - s * 1.1, x + s * 1.4, y - s * 0.1, x, y + s * 0.9);
  c.fill();
}

/* ============================================================
 *  COMIDAS
 * ============================================================ */

export function drawFood(c: CanvasRenderingContext2D, shape: FoodShape, x: number, y: number, s: number, bite = 0): void {
  c.save();
  c.translate(x, y);
  c.lineJoin = 'round';
  c.strokeStyle = '#2a0b5c';
  c.lineWidth = Math.max(1.5, s * 0.07);
  const r = s * 0.5;
  switch (shape) {
    case 'cookie': {
      c.fillStyle = '#e9a85a';
      star(c, 0, 0, r, r * 0.62, 5);
      c.fill();
      c.stroke();
      c.fillStyle = '#7a3e1d';
      for (let i = 0; i < 4; i++) {
        c.beginPath();
        c.arc(Math.cos(i * 1.7) * r * 0.32, Math.sin(i * 1.7) * r * 0.32, r * 0.08, 0, TAU);
        c.fill();
      }
      c.fillStyle = 'rgba(255,255,255,0.4)';
      c.beginPath();
      c.ellipse(-r * 0.25, -r * 0.3, r * 0.18, r * 0.08, -0.6, 0, TAU);
      c.fill();
      break;
    }
    case 'apple': {
      c.fillStyle = '#ff4f6a';
      c.beginPath();
      c.moveTo(0, -r * 0.55);
      c.bezierCurveTo(r * 0.7, -r * 1.0, r * 1.15, -r * 0.1, r * 0.75, r * 0.55);
      c.bezierCurveTo(r * 0.5, r * 1.0, r * 0.1, r * 0.85, 0, r * 0.75);
      c.bezierCurveTo(-r * 0.1, r * 0.85, -r * 0.5, r * 1.0, -r * 0.75, r * 0.55);
      c.bezierCurveTo(-r * 1.15, -r * 0.1, -r * 0.7, -r * 1.0, 0, -r * 0.55);
      c.fill();
      c.stroke();
      c.fillStyle = '#3ee07a';
      c.beginPath();
      c.ellipse(r * 0.28, -r * 0.82, r * 0.28, r * 0.13, -0.5, 0, TAU);
      c.fill();
      c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.55)';
      c.beginPath();
      c.ellipse(-r * 0.4, -r * 0.2, r * 0.12, r * 0.24, 0.4, 0, TAU);
      c.fill();
      break;
    }
    case 'carrot': {
      c.rotate(0.6);
      c.fillStyle = '#ff9a2e';
      c.beginPath();
      c.moveTo(-r * 0.35, -r * 0.55);
      c.quadraticCurveTo(0, -r * 0.75, r * 0.35, -r * 0.55);
      c.lineTo(0, r * 0.95);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = '#3ee07a';
      for (let i = -1; i <= 1; i++) {
        c.beginPath();
        c.ellipse(i * r * 0.18, -r * 0.82, r * 0.1, r * 0.26, i * 0.4, 0, TAU);
        c.fill();
        c.stroke();
      }
      c.strokeStyle = 'rgba(160,70,0,0.55)';
      c.beginPath();
      c.moveTo(-r * 0.2, -r * 0.1);
      c.lineTo(r * 0.05, -r * 0.08);
      c.moveTo(-r * 0.05, r * 0.3);
      c.lineTo(r * 0.12, r * 0.28);
      c.stroke();
      break;
    }
    case 'soup': {
      c.fillStyle = '#5ef0ff';
      c.beginPath();
      c.moveTo(-r, -r * 0.1);
      c.lineTo(r, -r * 0.1);
      c.quadraticCurveTo(r * 0.95, r * 0.85, 0, r * 0.85);
      c.quadraticCurveTo(-r * 0.95, r * 0.85, -r, -r * 0.1);
      c.fill();
      c.stroke();
      c.fillStyle = '#ffb347';
      c.beginPath();
      c.ellipse(0, -r * 0.1, r * 0.92, r * 0.22, 0, 0, TAU);
      c.fill();
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.7)';
      c.lineWidth = s * 0.05;
      c.beginPath();
      c.moveTo(-r * 0.3, -r * 0.45);
      c.quadraticCurveTo(-r * 0.15, -r * 0.65, -r * 0.3, -r * 0.85);
      c.moveTo(r * 0.2, -r * 0.45);
      c.quadraticCurveTo(r * 0.35, -r * 0.65, r * 0.2, -r * 0.85);
      c.stroke();
      break;
    }
    case 'melon': {
      c.fillStyle = '#3ee07a';
      c.beginPath();
      c.moveTo(-r, -r * 0.2);
      c.lineTo(r, -r * 0.2);
      c.arc(0, -r * 0.2, r, 0, Math.PI);
      c.fill();
      c.stroke();
      c.fillStyle = '#ff5c7a';
      c.beginPath();
      c.moveTo(-r * 0.82, -r * 0.2);
      c.lineTo(r * 0.82, -r * 0.2);
      c.arc(0, -r * 0.2, r * 0.82, 0, Math.PI);
      c.fill();
      c.fillStyle = '#2a0b5c';
      for (let i = -2; i <= 2; i++) {
        c.beginPath();
        c.ellipse(i * r * 0.25, r * 0.15 + Math.abs(i) * -r * 0.05, r * 0.05, r * 0.09, 0, 0, TAU);
        c.fill();
      }
      break;
    }
    case 'pudding': {
      c.fillStyle = '#ffe680';
      c.beginPath();
      c.moveTo(-r * 0.6, -r * 0.45);
      c.lineTo(r * 0.6, -r * 0.45);
      c.lineTo(r * 0.85, r * 0.6);
      c.lineTo(-r * 0.85, r * 0.6);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = '#b5651d';
      c.beginPath();
      c.moveTo(-r * 0.62, -r * 0.42);
      c.lineTo(r * 0.62, -r * 0.42);
      c.quadraticCurveTo(r * 0.7, -r * 0.05, r * 0.5, -r * 0.1);
      c.quadraticCurveTo(r * 0.3, r * 0.1, r * 0.1, -r * 0.15);
      c.quadraticCurveTo(-r * 0.2, r * 0.05, -r * 0.4, -r * 0.12);
      c.quadraticCurveTo(-r * 0.7, -r * 0.05, -r * 0.62, -r * 0.42);
      c.fill();
      c.fillStyle = '#ffe27a';
      sparkle(c, r * 0.05, -r * 0.7, r * 0.22);
      c.fillStyle = '#c9a3ff';
      c.beginPath();
      c.ellipse(0, r * 0.66, r * 1.05, r * 0.16, 0, 0, TAU);
      c.fill();
      c.stroke();
      break;
    }
    case 'cake': {
      c.fillStyle = '#fff1c7';
      c.beginPath();
      c.roundRect(-r * 0.85, -r * 0.35, r * 1.7, r * 1.05, r * 0.15);
      c.fill();
      c.stroke();
      c.fillStyle = '#ff7ab8';
      c.beginPath();
      c.moveTo(-r * 0.85, -r * 0.35);
      c.lineTo(r * 0.85, -r * 0.35);
      c.lineTo(r * 0.85, -r * 0.05);
      for (let i = 4; i >= 0; i--) c.quadraticCurveTo(-r * 0.85 + (i + 0.5) * r * 0.34, r * 0.22, -r * 0.85 + i * r * 0.34, -r * 0.05);
      c.closePath();
      c.fill();
      c.fillStyle = '#ffcf2e';
      c.beginPath();
      c.arc(0, -r * 0.6, r * 0.22, 0, TAU);
      c.fill();
      c.stroke();
      c.strokeStyle = '#ffcf2e';
      c.lineWidth = s * 0.06;
      c.beginPath();
      c.moveTo(r * 0.15, -r * 0.65);
      c.quadraticCurveTo(r * 0.5, -r * 0.8, r * 0.75, -r * 0.6);
      c.stroke();
      break;
    }
    case 'jelly': {
      c.fillStyle = 'rgba(160,110,255,0.92)';
      c.beginPath();
      c.moveTo(-r * 0.8, r * 0.6);
      c.quadraticCurveTo(-r * 0.9, -r * 0.7, 0, -r * 0.75);
      c.quadraticCurveTo(r * 0.9, -r * 0.7, r * 0.8, r * 0.6);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = '#5ef0ff';
      sparkle(c, -r * 0.2, -r * 0.1, r * 0.2);
      c.fillStyle = '#ffe27a';
      sparkle(c, r * 0.3, r * 0.2, r * 0.14);
      c.fillStyle = 'rgba(255,255,255,0.55)';
      c.beginPath();
      c.ellipse(-r * 0.45, -r * 0.25, r * 0.1, r * 0.25, 0.3, 0, TAU);
      c.fill();
      break;
    }
    case 'broccoli': {
      c.fillStyle = '#9be27a';
      c.beginPath();
      c.moveTo(-r * 0.2, r * 0.1);
      c.lineTo(-r * 0.28, r * 0.9);
      c.lineTo(r * 0.28, r * 0.9);
      c.lineTo(r * 0.2, r * 0.1);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = '#2f9e44';
      c.beginPath();
      for (const [bx, by, br] of [[-0.45, -0.1, 0.36], [0.45, -0.1, 0.36], [0, -0.45, 0.42], [-0.15, 0.05, 0.3], [0.2, 0.05, 0.3]]) {
        c.moveTo(bx * r + br * r, by * r);
        c.arc(bx * r, by * r, br * r, 0, TAU);
      }
      c.fill();
      c.stroke();
      c.fillStyle = '#1f7a33';
      for (let i = 0; i < 7; i++) {
        c.beginPath();
        c.arc(Math.cos(i * 2.3) * r * 0.45, -r * 0.2 + Math.sin(i * 2.3) * r * 0.3, r * 0.06, 0, TAU);
        c.fill();
      }
      break;
    }
    case 'sock': {
      // tigela verde-gosma com uma meia listrada dentro
      c.fillStyle = '#c6b3ff';
      c.beginPath();
      c.moveTo(-r, -r * 0.05);
      c.lineTo(r, -r * 0.05);
      c.quadraticCurveTo(r * 0.95, r * 0.85, 0, r * 0.85);
      c.quadraticCurveTo(-r * 0.95, r * 0.85, -r, -r * 0.05);
      c.fill();
      c.stroke();
      c.fillStyle = '#a6c94a';
      c.beginPath();
      c.ellipse(0, -r * 0.05, r * 0.92, r * 0.22, 0, 0, TAU);
      c.fill();
      c.stroke();
      c.save();
      c.translate(r * 0.15, -r * 0.35);
      c.rotate(-0.5);
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.moveTo(-r * 0.18, -r * 0.5);
      c.lineTo(r * 0.18, -r * 0.5);
      c.lineTo(r * 0.18, r * 0.1);
      c.quadraticCurveTo(r * 0.55, r * 0.15, r * 0.5, r * 0.32);
      c.lineTo(-r * 0.18, r * 0.32);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = '#ff5c7a';
      c.fillRect(-r * 0.16, -r * 0.4, r * 0.32, r * 0.09);
      c.fillRect(-r * 0.16, -r * 0.2, r * 0.32, r * 0.09);
      c.restore();
      c.strokeStyle = 'rgba(120,170,60,0.9)';
      c.lineWidth = s * 0.05;
      c.beginPath();
      c.moveTo(-r * 0.45, -r * 0.35);
      c.quadraticCurveTo(-r * 0.3, -r * 0.55, -r * 0.45, -r * 0.8);
      c.stroke();
      break;
    }
    case 'pepper': {
      c.rotate(-0.5);
      c.fillStyle = '#ff2e3a';
      c.beginPath();
      c.moveTo(-r * 0.25, -r * 0.6);
      c.quadraticCurveTo(r * 0.45, -r * 0.65, r * 0.3, 0);
      c.quadraticCurveTo(r * 0.15, r * 0.7, -r * 0.35, r * 0.95);
      c.quadraticCurveTo(-r * 0.1, r * 0.4, -r * 0.4, -r * 0.2);
      c.quadraticCurveTo(-r * 0.45, -r * 0.5, -r * 0.25, -r * 0.6);
      c.fill();
      c.stroke();
      c.fillStyle = '#3ee07a';
      c.beginPath();
      c.ellipse(-r * 0.05, -r * 0.66, r * 0.28, r * 0.12, 0.1, 0, TAU);
      c.fill();
      c.stroke();
      c.beginPath();
      c.moveTo(0, -r * 0.75);
      c.quadraticCurveTo(r * 0.1, -r * 1.0, r * 0.3, -r * 0.98);
      c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.55)';
      c.beginPath();
      c.ellipse(r * 0.05, -r * 0.3, r * 0.08, r * 0.2, 0.3, 0, TAU);
      c.fill();
      break;
    }
    case 'onion': {
      // picolé de cebola: palito + cebola roxa
      c.fillStyle = '#f2c38a';
      c.beginPath();
      c.roundRect(-r * 0.1, r * 0.2, r * 0.2, r * 0.75, r * 0.08);
      c.fill();
      c.stroke();
      c.fillStyle = '#c86bd6';
      c.beginPath();
      c.moveTo(0, -r * 0.95);
      c.quadraticCurveTo(r * 0.15, -r * 0.6, r * 0.6, -r * 0.3);
      c.quadraticCurveTo(r * 0.85, r * 0.15, r * 0.35, r * 0.35);
      c.lineTo(-r * 0.35, r * 0.35);
      c.quadraticCurveTo(-r * 0.85, r * 0.15, -r * 0.6, -r * 0.3);
      c.quadraticCurveTo(-r * 0.15, -r * 0.6, 0, -r * 0.95);
      c.fill();
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.6)';
      c.lineWidth = s * 0.04;
      c.beginPath();
      c.moveTo(-r * 0.25, -r * 0.4);
      c.quadraticCurveTo(-r * 0.4, 0, -r * 0.2, r * 0.25);
      c.moveTo(r * 0.2, -r * 0.4);
      c.quadraticCurveTo(r * 0.35, 0, r * 0.18, r * 0.25);
      c.stroke();
      c.fillStyle = '#e8f6ff';
      sparkle(c, r * 0.55, -r * 0.65, r * 0.14);
      break;
    }
    case 'worm': {
      // pão + minhocas de goma coloridas saindo
      c.strokeStyle = '#2a0b5c';
      c.lineCap = 'round';
      const worms = ['#ff5c7a', '#ffcf2e', '#5ef0ff'];
      for (let i = 0; i < 3; i++) {
        c.lineWidth = r * 0.2;
        c.beginPath();
        c.moveTo(-r * 0.5 + i * r * 0.5, 0);
        c.bezierCurveTo(-r * 0.7 + i * r * 0.5, -r * 0.4, -r * 0.2 + i * r * 0.5, -r * 0.5, -r * 0.45 + i * r * 0.55, -r * 0.85);
        c.stroke();
        c.strokeStyle = worms[i];
        c.lineWidth = r * 0.12;
        c.stroke();
        c.strokeStyle = '#2a0b5c';
      }
      c.lineWidth = Math.max(1.5, s * 0.07);
      c.fillStyle = '#f2b765';
      c.beginPath();
      c.roundRect(-r * 0.9, -r * 0.05, r * 1.8, r * 0.38, r * 0.18);
      c.fill();
      c.stroke();
      c.fillStyle = '#7fd67a';
      c.beginPath();
      c.roundRect(-r * 0.95, r * 0.28, r * 1.9, r * 0.12, r * 0.06);
      c.fill();
      c.fillStyle = '#e9a85a';
      c.beginPath();
      c.roundRect(-r * 0.9, r * 0.38, r * 1.8, r * 0.34, r * 0.16);
      c.fill();
      c.stroke();
      break;
    }
    case 'lemon': {
      c.fillStyle = '#fff04a';
      c.beginPath();
      c.ellipse(0, 0, r * 0.82, r * 0.6, -0.3, 0, TAU);
      c.fill();
      c.stroke();
      c.beginPath();
      c.ellipse(r * 0.78, -r * 0.25, r * 0.12, r * 0.08, -0.3, 0, TAU);
      c.fill();
      c.stroke();
      c.fillStyle = '#3ee07a';
      c.beginPath();
      c.ellipse(-r * 0.6, -r * 0.5, r * 0.22, r * 0.1, 0.6, 0, TAU);
      c.fill();
      c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.6)';
      c.beginPath();
      c.ellipse(-r * 0.25, -r * 0.2, r * 0.22, r * 0.08, -0.3, 0, TAU);
      c.fill();
      break;
    }
  }
  if (bite > 0) {
    // mordidas: recorta círculos no canto superior direito
    c.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < bite; i++) {
      c.beginPath();
      c.arc(r * 0.7 - i * r * 0.35, -r * 0.6 + i * r * 0.25, r * 0.38, 0, TAU);
      c.fill();
    }
    c.globalCompositeOperation = 'source-over';
  }
  c.restore();
}

function star(c: CanvasRenderingContext2D, x: number, y: number, R: number, r: number, k: number): void {
  c.beginPath();
  for (let i = 0; i < k * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / k;
    const rr = i % 2 ? r : R;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
}

/* ============================================================
 *  CÔMODOS — fundo cacheado
 * ============================================================ */

export interface Layout {
  W: number;
  H: number;
  floorY: number;
  cx: number;
  cy: number;
  R: number;
}

export function layoutFor(W: number, H: number): Layout {
  const floorY = Math.round(H * 0.66);
  const R = Math.round(Math.min(W * 0.25, H * 0.15));
  return { W, H, floorY, cx: W / 2, cy: floorY - R * 0.98, R };
}

export interface DecorState {
  wall: string;
  floor: string;
  items: string[];
}

const bgCache = new Map<string, HTMLCanvasElement>();

export function roomBg(room: Room, L: Layout, dec: DecorState, dpr: number): HTMLCanvasElement {
  const key = `${room}|${L.W}x${L.H}@${dpr}|${dec.wall}|${dec.floor}|${dec.items.join(',')}`;
  let cv = bgCache.get(key);
  if (cv) return cv;
  if (bgCache.size > 10) bgCache.clear();
  cv = document.createElement('canvas');
  cv.width = Math.round(L.W * dpr);
  cv.height = Math.round(L.H * dpr);
  const c = cv.getContext('2d')!;
  c.scale(dpr, dpr);
  paintRoom(c, room, L, dec);
  bgCache.set(key, cv);
  return cv;
}

export function clearBgCache(): void {
  bgCache.clear();
}

const INK = '#2a0b5c';

function paintWall(c: CanvasRenderingContext2D, L: Layout, id: string): void {
  const d = decorById(id) ?? decorById('wp_dots')!;
  const [a, b, e] = d.colors;
  const { W, floorY } = L;
  const g = c.createLinearGradient(0, 0, 0, floorY);
  g.addColorStop(0, b);
  g.addColorStop(1, a);
  c.fillStyle = g;
  c.fillRect(0, 0, W, floorY);
  c.fillStyle = e;
  c.strokeStyle = e;
  const s = Math.max(22, W / 12);
  switch (id) {
    case 'wp_stripes':
      c.globalAlpha = 0.45;
      for (let x = 0; x < W; x += s * 1.4) c.fillRect(x, 0, s * 0.55, floorY);
      break;
    case 'wp_hearts':
      c.globalAlpha = 0.6;
      for (let y = s * 0.6, r = 0; y < floorY; y += s * 1.3, r++) for (let x = (r % 2) * s * 0.75 + s * 0.4; x < W; x += s * 1.5) heart(c, x, y, s * 0.2);
      break;
    case 'wp_stars':
      c.globalAlpha = 0.85;
      for (let i = 0; i < 46; i++) {
        const x = (i * 97.3) % W;
        const y = (i * 53.7) % floorY;
        sparkle(c, x, y, 2 + (i % 4) * 1.6);
      }
      break;
    case 'wp_waves':
      c.globalAlpha = 0.5;
      c.lineWidth = s * 0.16;
      for (let y = s * 0.6; y < floorY; y += s * 0.9) {
        c.beginPath();
        for (let x = 0; x <= W + 10; x += 8) c.lineTo(x, y + Math.sin(x / s * 2) * s * 0.18);
        c.stroke();
      }
      break;
    case 'wp_candy':
      c.globalAlpha = 0.5;
      for (let y = 0, r = 0; y < floorY + s; y += s, r++)
        for (let x = (r % 2) * s * 0.6; x < W + s; x += s * 1.2) {
          c.fillStyle = r % 2 ? '#ffffff' : '#c7e4ff';
          c.beginPath();
          c.arc(x, y, s * 0.36, 0, TAU);
          c.arc(x + s * 0.3, y + s * 0.08, s * 0.28, 0, TAU);
          c.fill();
        }
      break;
    default:
      c.globalAlpha = 0.55;
      for (let y = s * 0.5, r = 0; y < floorY; y += s, r++)
        for (let x = (r % 2) * s * 0.5 + s * 0.25; x < W; x += s) {
          c.beginPath();
          c.arc(x, y, s * 0.12, 0, TAU);
          c.fill();
        }
  }
  c.globalAlpha = 1;
}

function paintFloor(c: CanvasRenderingContext2D, L: Layout, id: string): void {
  const d = decorById(id) ?? decorById('fl_wood')!;
  const [a, b, e] = d.colors;
  const { W, H, floorY } = L;
  const g = c.createLinearGradient(0, floorY, 0, H);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  c.fillStyle = g;
  c.fillRect(0, floorY, W, H - floorY);
  c.strokeStyle = b;
  c.fillStyle = e;
  c.lineWidth = 2;
  const vp = W / 2;
  if (id === 'fl_tiles') {
    const rows = 7;
    for (let r = 0; r < rows; r++) {
      const y0 = floorY + ((H - floorY) * (r * r)) / (rows * rows);
      const y1 = floorY + ((H - floorY) * ((r + 1) * (r + 1))) / (rows * rows);
      for (let k = -8; k < 8; k++) {
        if ((k + r) % 2) continue;
        const sx = (x: number, y: number) => vp + (x - vp) * (0.5 + ((y - floorY) / (H - floorY)) * 0.9);
        const xa = vp + k * (W / 8);
        const xb = xa + W / 8;
        c.globalAlpha = 0.6;
        c.beginPath();
        c.moveTo(sx(xa, y0), y0);
        c.lineTo(sx(xb, y0), y0);
        c.lineTo(sx(xb, y1), y1);
        c.lineTo(sx(xa, y1), y1);
        c.closePath();
        c.fill();
      }
    }
  } else if (id === 'fl_grass') {
    c.globalAlpha = 0.7;
    c.strokeStyle = e;
    for (let i = 0; i < 80; i++) {
      const x = (i * 61.7) % W;
      const y = floorY + 6 + ((i * 37.3) % (H - floorY - 6));
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x - 2, y - 7);
      c.moveTo(x + 3, y);
      c.lineTo(x + 4, y - 6);
      c.stroke();
    }
  } else if (id === 'fl_cloud') {
    c.globalAlpha = 0.8;
    for (let i = 0; i < 14; i++) {
      const x = (i * 83.3) % W;
      const y = floorY + 14 + ((i * 41.9) % (H - floorY - 14));
      c.fillStyle = i % 2 ? e : '#ffffff';
      c.beginPath();
      c.arc(x, y, 14 + (i % 3) * 6, 0, TAU);
      c.arc(x + 16, y + 4, 10 + (i % 2) * 5, 0, TAU);
      c.fill();
    }
  } else {
    // tábuas em perspectiva
    c.globalAlpha = 0.5;
    for (let k = -10; k <= 10; k++) {
      c.beginPath();
      c.moveTo(vp + k * (W / 12), floorY);
      c.lineTo(vp + k * (W / 5.5), H);
      c.stroke();
    }
    c.globalAlpha = 0.25;
    c.fillStyle = e;
    for (let i = 0; i < 6; i++) c.fillRect((i * 71) % W, floorY + 10 + i * ((H - floorY) / 7), W / 9, 2);
  }
  c.globalAlpha = 1;
  // rodapé
  c.fillStyle = 'rgba(255,255,255,0.9)';
  c.fillRect(0, floorY - 7, W, 9);
  c.fillStyle = 'rgba(42,11,92,0.18)';
  c.fillRect(0, floorY + 2, W, 5);
}

function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient, stroke = true): void {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.strokeStyle = INK;
    c.lineWidth = 3;
    c.stroke();
  }
}

function windowFrame(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, night: boolean): void {
  rr(c, x - 6, y - 6, w + 12, h + 12, 14, '#ffffff');
  const g = c.createLinearGradient(0, y, 0, y + h);
  if (night) {
    g.addColorStop(0, '#1b1150');
    g.addColorStop(1, '#4a2fa0');
  } else {
    g.addColorStop(0, '#7fd3ff');
    g.addColorStop(1, '#d9f4ff');
  }
  c.fillStyle = g;
  c.beginPath();
  c.roundRect(x, y, w, h, 9);
  c.fill();
  c.save();
  c.clip();
  if (night) {
    c.fillStyle = '#fff6b0';
    c.beginPath();
    c.arc(x + w * 0.7, y + h * 0.32, w * 0.16, 0, TAU);
    c.fill();
    c.fillStyle = '#1b1150';
    c.beginPath();
    c.arc(x + w * 0.62, y + h * 0.27, w * 0.14, 0, TAU);
    c.fill();
  } else {
    c.fillStyle = '#ffffff';
    for (const [u, v, s] of [
      [0.3, 0.35, 0.12],
      [0.42, 0.33, 0.09],
      [0.75, 0.6, 0.1],
    ]) {
      c.beginPath();
      c.arc(x + w * u, y + h * v, w * s, 0, TAU);
      c.fill();
    }
    c.fillStyle = '#7fd67a';
    c.beginPath();
    c.ellipse(x + w * 0.5, y + h * 1.05, w * 0.8, h * 0.3, 0, 0, TAU);
    c.fill();
  }
  c.restore();
  c.strokeStyle = '#ffffff';
  c.lineWidth = 5;
  c.beginPath();
  c.moveTo(x + w / 2, y);
  c.lineTo(x + w / 2, y + h);
  c.moveTo(x, y + h / 2);
  c.lineTo(x + w, y + h / 2);
  c.stroke();
}

function paintRoom(c: CanvasRenderingContext2D, room: Room, L: Layout, dec: DecorState): void {
  const { W, H, floorY, R } = L;
  if (room === 'bath') {
    // azulejos
    const g = c.createLinearGradient(0, 0, 0, floorY);
    g.addColorStop(0, '#bfeeff');
    g.addColorStop(1, '#e9fbff');
    c.fillStyle = g;
    c.fillRect(0, 0, W, floorY);
    const s = Math.max(30, W / 9);
    c.strokeStyle = 'rgba(80,160,210,0.28)';
    c.lineWidth = 2;
    for (let x = 0; x < W; x += s) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, floorY);
      c.stroke();
    }
    for (let y = 0; y < floorY; y += s) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(W, y);
      c.stroke();
    }
    c.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 9; i++) sparkle(c, (i * 113) % W, (i * 67) % (floorY - 20) + 10, 4);
    paintFloor(c, L, 'fl_tiles');
    // espelho redondo + prateleira de frascos
    // espelho com moldura lilás
    const mx = W * 0.06;
    const my = H * 0.17;
    const mw = W * 0.2;
    const mh = W * 0.26;
    rr(c, mx - 6, my - 6, mw + 12, mh + 12, 18, '#c9a3ff');
    const mg = c.createLinearGradient(mx, my, mx + mw, my + mh);
    mg.addColorStop(0, '#f4fcff');
    mg.addColorStop(1, '#b9e6ff');
    rr(c, mx, my, mw, mh, 12, mg, false);
    c.strokeStyle = 'rgba(255,255,255,0.95)';
    c.lineWidth = 5;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(mx + mw * 0.25, my + mh * 0.45);
    c.lineTo(mx + mw * 0.55, my + mh * 0.18);
    c.moveTo(mx + mw * 0.35, my + mh * 0.62);
    c.lineTo(mx + mw * 0.75, my + mh * 0.28);
    c.stroke();
    rr(c, W * 0.7, H * 0.28, W * 0.26, 10, 5, '#ffffff');
    const jars = ['#ff9ec7', '#8fd3ff', '#ffd36b'];
    for (let i = 0; i < 3; i++) rr(c, W * (0.72 + i * 0.08), H * 0.28 - 26 - (i % 2) * 8, W * 0.06, 26 + (i % 2) * 8, 6, jars[i]);
    return;
  }

  paintWall(c, L, dec.wall);
  paintFloor(c, L, dec.floor);

  if (room === 'kitchen') {
    // balcão ao fundo
    const ty = floorY - H * 0.12;
    rr(c, -10, ty, W * 0.3, H * 0.12 + 4, 8, '#ffffff');
    rr(c, W * 0.72, ty, W * 0.3, H * 0.12 + 4, 8, '#ffffff');
    rr(c, -10, ty - 8, W * 0.32, 12, 5, '#ffb8d6');
    rr(c, W * 0.7, ty - 8, W * 0.32, 12, 5, '#ffb8d6');
    // geladeira fofinha à direita
    rr(c, W * 0.78, ty - H * 0.24, W * 0.18, H * 0.24 - 10, 14, '#c9f5ff');
    c.strokeStyle = INK;
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(W * 0.78, ty - H * 0.13);
    c.lineTo(W * 0.96, ty - H * 0.13);
    c.stroke();
    rr(c, W * 0.8, ty - H * 0.2, 5, H * 0.05, 3, '#8a5cff', false);
    rr(c, W * 0.8, ty - H * 0.1, 5, H * 0.05, 3, '#8a5cff', false);
    // panela pendurada e prateleira
    rr(c, W * 0.04, H * 0.2, W * 0.24, 9, 4, '#ffffff');
    rr(c, W * 0.06, H * 0.2 - 30, 24, 30, 7, '#ffd36b');
    rr(c, W * 0.06 + 30, H * 0.2 - 22, 20, 22, 6, '#8fe3ff');
    c.fillStyle = '#ff7ab8';
    c.beginPath();
    c.arc(W * 0.06 + 64, H * 0.2 - 12, 11, 0, TAU);
    c.fill();
    c.stroke();
    windowFrame(c, W * 0.36, H * 0.14, W * 0.28, H * 0.15, false);
  } else if (room === 'bed') {
    windowFrame(c, W * 0.6, H * 0.13, W * 0.3, H * 0.16, true);
    // quadro de estrela
    rr(c, W * 0.1, H * 0.16, W * 0.18, W * 0.18, 8, '#fff6b0');
    c.fillStyle = '#ffcf2e';
    star(c, W * 0.19, H * 0.16 + W * 0.09, W * 0.06, W * 0.028, 5);
    c.fill();
    c.stroke();
    // espelho mágico oval (abre o Bloop Espelho)
    {
      const m = mirrorRect(L);
      c.fillStyle = '#ffcf2e';
      c.strokeStyle = INK;
      c.lineWidth = 3;
      c.beginPath();
      c.ellipse(m.x + m.w / 2, m.y + m.h / 2, m.w / 2 + 5, m.h / 2 + 5, 0, 0, TAU);
      c.fill();
      c.stroke();
      const mg = c.createLinearGradient(m.x, m.y, m.x + m.w, m.y + m.h);
      mg.addColorStop(0, '#f4fcff');
      mg.addColorStop(1, '#a9dcff');
      c.fillStyle = mg;
      c.beginPath();
      c.ellipse(m.x + m.w / 2, m.y + m.h / 2, m.w / 2 - 2, m.h / 2 - 2, 0, 0, TAU);
      c.fill();
      c.stroke();
      c.fillStyle = '#ff7ab8';
      star(c, m.x + m.w / 2, m.y - 6, 9, 4, 5);
      c.fill();
      c.stroke();
    }
    // criado-mudo (o abajur é desenhado por frame)
    rr(c, W * 0.03, floorY - H * 0.1, W * 0.2, H * 0.1 + 4, 8, '#c9a3ff');
    rr(c, W * 0.05, floorY - H * 0.07, W * 0.16, 6, 3, '#ffffff', false);
    // caminha (almofada redonda) atrás do bichinho
    const by = L.cy + R * 0.85;
    c.fillStyle = '#8a5cff';
    c.strokeStyle = INK;
    c.lineWidth = 3;
    c.beginPath();
    c.ellipse(L.cx, by, R * 1.55, R * 0.42, 0, 0, TAU);
    c.fill();
    c.stroke();
    c.fillStyle = '#b79bff';
    c.beginPath();
    c.ellipse(L.cx, by - R * 0.06, R * 1.25, R * 0.28, 0, 0, TAU);
    c.fill();
    paintItems(c, L, dec, 'bed');
  } else {
    // sala: sofá ao fundo + janela
    windowFrame(c, W * 0.08, H * 0.14, W * 0.26, H * 0.15, false);
    const sy = floorY - H * 0.1;
    rr(c, W * 0.52, sy - H * 0.06, W * 0.46, H * 0.12, 18, '#ff9ec7');
    rr(c, W * 0.5, sy + H * 0.02, W * 0.5, H * 0.08 + 4, 14, '#ff7ab8');
    rr(c, W * 0.5, sy - H * 0.02, W * 0.07, H * 0.12, 10, '#ffb8d6');
    rr(c, W * 0.93, sy - H * 0.02, W * 0.07 + 6, H * 0.12, 10, '#ffb8d6');
    paintItems(c, L, dec, 'play');
  }
}

function paintItems(c: CanvasRenderingContext2D, L: Layout, dec: DecorState, room: Room): void {
  const { W, H, floorY } = L;
  for (const id of dec.items) {
    const d = decorById(id);
    if (!d) continue;
    const [a, b, e] = d.colors;
    switch (id) {
      case 'it_plant': {
        if (room !== 'play') break;
        const x = W * 0.1;
        const y = floorY - 4;
        c.fillStyle = a;
        c.strokeStyle = INK;
        c.lineWidth = 3;
        for (let i = -2; i <= 2; i++) {
          c.beginPath();
          c.ellipse(x + i * 8, y - 52 - Math.abs(i) * -6, 7, 22, i * 0.35, 0, TAU);
          c.fill();
          c.stroke();
        }
        rr(c, x - 18, y - 32, 36, 32, 8, e);
        break;
      }
      case 'it_rug':
        c.fillStyle = a;
        c.strokeStyle = b;
        c.lineWidth = 6;
        c.beginPath();
        c.ellipse(W / 2, floorY + (H - floorY) * 0.3, W * 0.36, (H - floorY) * 0.16, 0, 0, TAU);
        c.fill();
        c.stroke();
        c.strokeStyle = e;
        c.lineWidth = 3;
        c.beginPath();
        c.ellipse(W / 2, floorY + (H - floorY) * 0.3, W * 0.27, (H - floorY) * 0.1, 0, 0, TAU);
        c.stroke();
        break;
      case 'it_frame': {
        const x = room === 'play' ? W * 0.62 : W * 0.36;
        const y = H * 0.13;
        rr(c, x, y, W * 0.17, W * 0.14, 6, a);
        rr(c, x + 6, y + 6, W * 0.17 - 12, W * 0.14 - 12, 4, '#1b1150', false);
        c.fillStyle = b;
        c.beginPath();
        c.arc(x + W * 0.085, y + W * 0.07, W * 0.035, 0, TAU);
        c.fill();
        c.strokeStyle = e;
        c.lineWidth = 2;
        c.beginPath();
        c.ellipse(x + W * 0.085, y + W * 0.07, W * 0.06, W * 0.015, -0.3, 0, TAU);
        c.stroke();
        break;
      }
      case 'it_lights': {
        c.strokeStyle = INK;
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(0, H * 0.06);
        c.quadraticCurveTo(W / 2, H * 0.12, W, H * 0.06);
        c.stroke();
        for (let i = 1; i < 12; i++) {
          const u = i / 12;
          const x = u * W;
          const y = H * 0.06 + 4 * u * (1 - u) * H * 0.06 * 1;
          c.fillStyle = d.colors[i % 3];
          c.beginPath();
          c.ellipse(x, y + 7, 4.5, 6.5, 0, 0, TAU);
          c.fill();
        }
        break;
      }
      case 'it_bowl': {
        if (room !== 'play') break;
        const x = W * 0.86;
        const y = H * 0.36 - 30;
        rr(c, x - 34, y + 26, 68, 9, 4, '#ffffff');
        rr(c, x - 22, y + 20, 44, 8, 4, '#c9a3ff');
        c.fillStyle = 'rgba(143,227,255,0.7)';
        c.strokeStyle = INK;
        c.lineWidth = 3;
        c.beginPath();
        c.arc(x, y, 26, 0, TAU);
        c.fill();
        c.stroke();
        c.fillStyle = b;
        c.beginPath();
        c.ellipse(x - 2, y + 4, 9, 6, 0, 0, TAU);
        c.moveTo(x + 6, y + 4);
        c.lineTo(x + 14, y - 2);
        c.lineTo(x + 14, y + 10);
        c.fill();
        c.fillStyle = e;
        c.beginPath();
        c.arc(x - 12, y - 10, 4, 0, TAU);
        c.fill();
        break;
      }
      case 'it_trophy': {
        const x = room === 'play' ? W * 0.12 : W * 0.13;
        const y = room === 'play' ? H * 0.42 : floorY - H * 0.1;
        if (room === 'play') rr(c, x - 30, y, 60, 9, 4, '#ffffff');
        c.fillStyle = a;
        c.strokeStyle = INK;
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(x - 14, y - 40);
        c.lineTo(x + 14, y - 40);
        c.quadraticCurveTo(x + 14, y - 16, x, y - 14);
        c.quadraticCurveTo(x - 14, y - 16, x - 14, y - 40);
        c.fill();
        c.stroke();
        rr(c, x - 4, y - 15, 8, 8, 2, b);
        rr(c, x - 12, y - 8, 24, 8, 3, b);
        c.fillStyle = '#ff7ab8';
        heart(c, x, y - 30, 5);
        break;
      }
    }
  }
}

/** Primeiro plano do banheiro (frente da banheira) — por cima do bichinho. */
export function drawTubFront(c: CanvasRenderingContext2D, L: Layout, t: number): void {
  const { cx, R, floorY } = L;
  const w = R * 2.6;
  const top = L.cy + R * 0.45;
  c.fillStyle = 'rgba(143,227,255,0.55)';
  c.beginPath();
  c.ellipse(cx, top, w * 0.5, R * 0.16, 0, 0, TAU);
  c.fill();
  c.fillStyle = '#ffffff';
  c.strokeStyle = INK;
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(cx - w / 2 - 6, top);
  c.lineTo(cx + w / 2 + 6, top);
  c.quadraticCurveTo(cx + w / 2, floorY + 2, cx + w * 0.3, floorY + 2);
  c.lineTo(cx - w * 0.3, floorY + 2);
  c.quadraticCurveTo(cx - w / 2, floorY + 2, cx - w / 2 - 6, top);
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = 'rgba(138,92,255,0.18)';
  c.fillRect(cx - w * 0.42, top + (floorY - top) * 0.55, w * 0.84, 6);
  c.fillStyle = '#c9a3ff';
  c.beginPath();
  c.roundRect(cx - w * 0.38, floorY - 2, 14, 14, 5);
  c.roundRect(cx + w * 0.38 - 14, floorY - 2, 14, 14, 5);
  c.fill();
  // bolhas na borda
  c.fillStyle = '#ffffff';
  for (let i = 0; i < 7; i++) {
    const x = cx - w * 0.45 + (i / 6) * w * 0.9;
    const r = R * (0.1 + ((i * 7) % 4) * 0.025) * (1 + Math.sin(t * 2 + i) * 0.08);
    c.beginPath();
    c.arc(x, top - r * 0.4, r, 0, TAU);
    c.fill();
  }
}

/** Abajur do quarto (aceso/apagado). */
export function drawLamp(c: CanvasRenderingContext2D, L: Layout, on: boolean, glowOk: boolean): void {
  const { W, H, floorY } = L;
  const x = W * 0.13;
  const y = floorY - H * 0.1;
  if (on && glowOk) {
    const g = c.createRadialGradient(x, y - 50, 4, x, y - 50, W * 0.4);
    g.addColorStop(0, 'rgba(255,230,140,0.45)');
    g.addColorStop(1, 'rgba(255,230,140,0)');
    c.fillStyle = g;
    c.fillRect(x - W * 0.4, y - 50 - W * 0.4, W * 0.8, W * 0.8);
  }
  c.strokeStyle = INK;
  c.lineWidth = 3;
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.roundRect(x - 4, y - 46, 8, 46, 3);
  c.fill();
  c.stroke();
  c.fillStyle = on ? '#ffe27a' : '#b9a6ff';
  c.beginPath();
  c.moveTo(x - 16, y - 70);
  c.lineTo(x + 16, y - 70);
  c.lineTo(x + 26, y - 42);
  c.lineTo(x - 26, y - 42);
  c.closePath();
  c.fill();
  c.stroke();
}

/* ============================================================
 *  BICHINHO + CAMADAS DE ESTADO
 * ============================================================ */

/** Manchas de sujeira (unidades de R), longe dos olhos. */
export const SPOTS: readonly [number, number, number][] = [
  [-0.55, 0.35, 0.16],
  [0.5, 0.42, 0.14],
  [0.05, 0.62, 0.15],
  [-0.2, -0.55, 0.13],
  [0.62, -0.05, 0.12],
  [-0.7, -0.1, 0.12],
  [0.3, -0.62, 0.11],
  [-0.38, 0.68, 0.1],
  [0.72, 0.3, 0.09],
  [-0.08, 0.38, 0.09],
  [0.25, 0.75, 0.08],
  [-0.62, 0.55, 0.08],
  [0.52, -0.42, 0.09],
  [-0.5, -0.45, 0.08],
];

/** Visibilidade inicial de cada mancha a partir da limpeza (0..100). */
export function spotAlphaFromClean(clean: number, out: Float32Array): void {
  const dirt = 1 - clean / 100;
  for (let i = 0; i < out.length; i++) {
    const th = 0.35 + (i / out.length) * 0.55;
    const v = (dirt - th) * 5;
    out[i] = v < 0 ? 0 : v > 1 ? 1 : v;
  }
}

export const FOAM_MAX = 60;
export const WET_MAX = 26;

export interface PetView {
  t: number;
  pose: PlayerPose;
  /** salto/deslocamento vertical (px) e rotação (rad) */
  hop: number;
  tilt: number;
  /** escala extra (squash & stretch) */
  sx: number;
  sy: number;
  m: Mood;
  sleeping: boolean;
  yawn: number;
  rumble: number;
  spotA: Float32Array;
  foam: Float32Array; // x,y,r em unidades de R
  foamN: number;
  wet: Float32Array; // x,y
  wetN: number;
  /** 0..1 progresso do polimento (brilho parcial) */
  polish: number;
  thinkFood: FoodShape | null;
  drool: number;
  /** 0..1 pose de "escutando" (mão na orelha + ondas) e volume do microfone */
  listen: number;
  mic: number;
  /** careta especial (substitui olhos/boca) — '' = rosto normal */
  expr: Expr;
  /** tons de pele temporários 0..1 (verde de nojo, vermelho de pimenta) */
  green: number;
  red: number;
  /** pelos arrepiados (susto) 0..1 e nariz vermelho (peteleco) 0..1 */
  fur: number;
  nose: number;
  /** deslocamento horizontal (px) — arremesso na cama */
  ox: number;
}

export type Expr = '' | 'gross' | 'spicy' | 'sour' | 'annoyed' | 'grumpy' | 'dizzy' | 'scared' | 'laugh' | 'squint' | 'love' | 'blub';

export function makeView(): PetView {
  return {
    t: 0,
    pose: { t: 0, blink: 0, lookX: 0, lookY: 0, sx: 1, sy: 1, mood: 'idle', lx: -0.55, ly: -0.83 },
    hop: 0,
    tilt: 0,
    sx: 1,
    sy: 1,
    m: { hungry: false, dirty: false, sad: false, tired: false, weak: false, happy: false, shiny: false },
    sleeping: false,
    yawn: 0,
    rumble: 0,
    spotA: new Float32Array(SPOTS.length),
    foam: new Float32Array(FOAM_MAX * 3),
    foamN: 0,
    wet: new Float32Array(WET_MAX * 2),
    wetN: 0,
    polish: 0,
    thinkFood: null,
    drool: 0,
    listen: 0,
    mic: 0,
    expr: '',
    green: 0,
    red: 0,
    fur: 0,
    nose: 0,
    ox: 0,
  };
}

let shineGrad: CanvasGradient | null = null;
let shineR = 0;

export function drawPet(c: CanvasRenderingContext2D, skin: Skin, L: Layout, v: PetView, hiFx: boolean): void {
  const { R } = L;
  const t = v.t;
  const m = v.m;
  const x0 = L.cx + v.ox + (v.rumble > 0 ? Math.sin(t * 60) * R * 0.025 * v.rumble : 0);
  const y0 = L.cy - v.hop;

  // sombra no chão
  c.fillStyle = 'rgba(42,11,92,0.22)';
  c.beginPath();
  const sh = 1 - Math.min(0.5, Math.abs(v.hop) / (R * 2));
  c.ellipse(L.cx + v.ox, L.cy + R * 0.98, R * 0.85 * sh, R * 0.2 * sh, 0, 0, TAU);
  c.fill();

  c.save();
  c.translate(x0, y0 + R);
  c.rotate(v.tilt);
  c.scale(v.sx, v.sy);
  c.translate(0, -R);

  // pelos arrepiados (atrás do corpo)
  if (v.fur > 0.01) drawFur(c, R, v.fur, t, skin.dark);
  v.pose.noFace = v.expr !== '';
  drawPlayer(c, skin, R, v.pose);
  v.pose.noFace = false;
  // tons de careta (verde/vermelho) por cima da pele
  if (v.green > 0.01 || v.red > 0.01) {
    c.fillStyle = v.green >= v.red ? `rgba(120,205,70,${0.5 * v.green})` : `rgba(255,70,40,${0.45 * v.red})`;
    c.beginPath();
    c.arc(0, 0, R * 0.97, 0, TAU);
    c.fill();
  }
  if (v.expr) drawExpr(c, R, v);
  if (v.nose > 0.01) {
    c.globalAlpha = Math.min(1, v.nose * 2);
    c.fillStyle = '#ff4a5e';
    c.strokeStyle = INK;
    c.lineWidth = R * 0.03;
    c.beginPath();
    c.arc(0, R * 0.1, R * (0.07 + v.nose * 0.04), 0, TAU);
    c.fill();
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.8)';
    c.beginPath();
    c.arc(-R * 0.03, R * 0.07, R * 0.02, 0, TAU);
    c.fill();
    c.globalAlpha = 1;
  }

  // ---------- camadas de estado (mesmo espaço do corpo) ----------
  // fraquinho: palidez
  if (m.weak && !v.sleeping) {
    c.fillStyle = 'rgba(200,210,235,0.22)';
    c.beginPath();
    c.arc(0, 0, R * 0.98, 0, TAU);
    c.fill();
  }

  // sujeira
  let anyDirt = false;
  for (let i = 0; i < SPOTS.length; i++) {
    const a = v.spotA[i];
    if (a <= 0.02) continue;
    anyDirt = true;
    const [sx, sy, sr] = SPOTS[i];
    c.globalAlpha = a * 0.9;
    c.fillStyle = '#8a5a34';
    c.beginPath();
    c.ellipse(sx * R, sy * R, sr * R, sr * R * 0.78, i, 0, TAU);
    c.fill();
    c.fillStyle = '#6b4224';
    c.beginPath();
    c.arc(sx * R + sr * R * 0.55, sy * R - sr * R * 0.35, sr * R * 0.35, 0, TAU);
    c.arc(sx * R - sr * R * 0.6, sy * R + sr * R * 0.3, sr * R * 0.25, 0, TAU);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.25)';
    c.beginPath();
    c.arc(sx * R - sr * R * 0.3, sy * R - sr * R * 0.3, sr * R * 0.2, 0, TAU);
    c.fill();
  }
  c.globalAlpha = 1;

  const eyeY = -0.1 * R;
  // olheiras (cansado)
  if (m.tired && !v.sleeping) {
    c.strokeStyle = 'rgba(110,60,170,0.5)';
    c.lineWidth = R * 0.05;
    c.lineCap = 'round';
    for (let s = -1; s <= 1; s += 2) {
      c.beginPath();
      c.arc(s * 0.33 * R, eyeY + R * 0.13, R * 0.16, 0.25 * Math.PI, 0.75 * Math.PI);
      c.stroke();
    }
  }
  // sobrancelhas tristes
  if (m.sad && !v.sleeping && v.pose.mood !== 'happy') {
    c.strokeStyle = '#2a0b5c';
    c.lineWidth = R * 0.055;
    c.lineCap = 'round';
    for (let s = -1; s <= 1; s += 2) {
      c.beginPath();
      c.moveTo(s * 0.18 * R, eyeY - R * 0.36);
      c.lineTo(s * 0.46 * R, eyeY - R * 0.26);
      c.stroke();
    }
  }
  // babinha (fome): fiozinho no canto da boca + gota
  if (v.drool > 0.01 && !v.expr) {
    const dl = v.drool * R * (0.1 + Math.sin(t * 2.4) * 0.03);
    const bx = R * 0.17;
    const by = R * 0.3;
    c.strokeStyle = 'rgba(170,230,255,0.95)';
    c.lineWidth = R * 0.03;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(bx, by);
    c.lineTo(bx + R * 0.01, by + dl);
    c.stroke();
    c.fillStyle = 'rgba(170,230,255,0.95)';
    c.beginPath();
    c.arc(bx + R * 0.01, by + dl + R * 0.03, R * 0.04 * v.drool, 0, TAU);
    c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(bx, by + dl + R * 0.02, R * 0.012, 0, TAU);
    c.fill();
  }
  // ronco da barriga
  if (m.hungry && v.rumble > 0.05) {
    c.strokeStyle = `rgba(42,11,92,${0.6 * v.rumble})`;
    c.lineWidth = R * 0.03;
    for (let s = -1; s <= 1; s += 2) {
      c.beginPath();
      for (let k = 0; k < 3; k++) {
        const yy = R * (0.45 + k * 0.1);
        c.moveTo(s * R * 1.05, yy);
        c.quadraticCurveTo(s * R * 1.13, yy - R * 0.04, s * R * 1.2, yy);
      }
      c.stroke();
    }
  }

  // espuma: contorno azulado (união das bolhas) + miolo branco + reflexos
  if (v.foamN > 0) {
    const fo = v.foam;
    c.fillStyle = '#b8e4ff';
    c.beginPath();
    for (let i = 0; i < v.foamN; i++) {
      const r = fo[i * 3 + 2] * R;
      if (r < 0.5) continue;
      c.moveTo(fo[i * 3] * R + r + 2.5, fo[i * 3 + 1] * R);
      c.arc(fo[i * 3] * R, fo[i * 3 + 1] * R, r + 2.5, 0, TAU);
    }
    c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath();
    for (let i = 0; i < v.foamN; i++) {
      const r = fo[i * 3 + 2] * R;
      if (r < 0.5) continue;
      c.moveTo(fo[i * 3] * R + r, fo[i * 3 + 1] * R);
      c.arc(fo[i * 3] * R, fo[i * 3 + 1] * R, r, 0, TAU);
    }
    c.fill();
    c.fillStyle = 'rgba(184,228,255,0.7)';
    c.beginPath();
    for (let i = 0; i < v.foamN; i++) {
      const r = fo[i * 3 + 2] * R;
      if (r < 3) continue;
      const x = fo[i * 3] * R + r * 0.3;
      const y = fo[i * 3 + 1] * R + r * 0.35;
      c.moveTo(x + r * 0.32, y);
      c.arc(x, y, r * 0.32, 0, TAU);
    }
    c.fill();
    c.fillStyle = '#ffffff';
  }
  // gotinhas (molhado)
  if (v.wetN > 0) {
    c.fillStyle = 'rgba(143,227,255,0.95)';
    c.strokeStyle = 'rgba(42,11,92,0.35)';
    c.lineWidth = 1.2;
    for (let i = 0; i < v.wetN; i++) {
      const wx = v.wet[i * 2] * R;
      const wy = v.wet[i * 2 + 1] * R;
      if (wx > 1e5) continue;
      const s = R * 0.05;
      c.beginPath();
      c.moveTo(wx, wy - s * 1.6);
      c.quadraticCurveTo(wx + s, wy, wx, wy + s);
      c.quadraticCurveTo(wx - s, wy, wx, wy - s * 1.6);
      c.fill();
      c.stroke();
    }
  }

  // brilho (polido)
  const shine = m.shiny ? 1 : v.polish;
  if (shine > 0.01) {
    if (!shineGrad || shineR !== R) {
      shineR = R;
      shineGrad = c.createLinearGradient(-R * 0.4, 0, R * 0.4, 0);
      shineGrad.addColorStop(0, 'rgba(255,255,255,0)');
      shineGrad.addColorStop(0.5, 'rgba(255,255,255,0.75)');
      shineGrad.addColorStop(1, 'rgba(255,255,255,0)');
    }
    c.save();
    c.beginPath();
    c.arc(0, 0, R * 0.97, 0, TAU);
    c.clip();
    const sweep = ((t * 0.45) % 1.6) - 0.3;
    c.globalAlpha = 0.5 + shine * 0.5;
    c.translate(-R * 1.4 + sweep * R * 2.8, 0);
    c.rotate(0.45);
    c.fillStyle = shineGrad;
    c.fillRect(-R * 0.4, -R * 2, R * 0.8, R * 4);
    c.restore();
    c.fillStyle = '#ffffff';
    const n = Math.round(2 + shine * 4);
    for (let i = 0; i < n; i++) {
      const a = i * 2.4 + 0.5;
      const k = Math.max(0, Math.sin(t * 3 + i * 1.7));
      if (k < 0.1) continue;
      sparkle(c, Math.cos(a) * R * 0.75, Math.sin(a) * R * 0.7, R * 0.09 * k);
    }
  }

  // escutando: mãozinha em concha na "orelha"
  if (v.listen > 0.01) {
    const k = v.listen;
    c.save();
    c.translate(R * (0.98 + (1 - k) * 0.4), -R * 0.18);
    c.rotate(-0.35);
    c.globalAlpha = k;
    c.fillStyle = '#ffffff';
    c.strokeStyle = INK;
    c.lineWidth = Math.max(2, R * 0.035);
    c.beginPath();
    c.ellipse(0, 0, R * 0.17, R * 0.24, 0, 0, TAU);
    c.fill();
    c.stroke();
    c.beginPath();
    c.ellipse(-R * 0.13, R * 0.08, R * 0.07, R * 0.1, 0.5, 0, TAU);
    c.fill();
    c.stroke();
    c.strokeStyle = 'rgba(42,11,92,0.35)';
    c.beginPath();
    c.moveTo(-R * 0.02, -R * 0.12);
    c.lineTo(-R * 0.02, R * 0.06);
    c.moveTo(R * 0.07, -R * 0.1);
    c.lineTo(R * 0.07, R * 0.06);
    c.stroke();
    c.restore();
  }

  c.restore();

  // ---------- coisas fora do corpo ----------
  if (v.expr === 'dizzy') {
    // estrelinhas girando em volta da cabeça
    c.fillStyle = '#ffe27a';
    c.strokeStyle = INK;
    c.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const a = t * 4 + (i * TAU) / 4;
      const sx = x0 + Math.cos(a) * R * 0.75;
      const sy = y0 - R * 1.02 + Math.sin(a) * R * 0.18;
      star(c, sx, sy, R * 0.13, R * 0.06, 5);
      c.fill();
      c.stroke();
    }
  }
  if (v.expr === 'gross' && v.green > 0.2) {
    // linhas de "eca" subindo
    c.strokeStyle = 'rgba(110,180,50,0.8)';
    c.lineWidth = R * 0.05;
    c.lineCap = 'round';
    for (let k = -1; k <= 1; k++) {
      const ph = (t * 0.9 + k * 0.33 + 1) % 1;
      const bx = x0 + k * R * 0.45;
      const by = y0 - R * 1.0 - ph * R * 0.5;
      c.globalAlpha = Math.sin(ph * Math.PI) * v.green;
      c.beginPath();
      c.moveTo(bx, by);
      c.bezierCurveTo(bx + R * 0.12, by - R * 0.1, bx - R * 0.12, by - R * 0.2, bx, by - R * 0.32);
      c.stroke();
    }
    c.globalAlpha = 1;
  }
  // ondas de som chegando (escutando)
  if (v.listen > 0.01) {
    const hx = x0 + R * 1.25;
    const hy = y0 - R * 0.2;
    c.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const ph = (t * 1.6 + i / 3) % 1;
      const rr2 = R * (0.25 + (1 - ph) * 0.55) * (1 + v.mic * 0.4);
      c.globalAlpha = v.listen * Math.sin(ph * Math.PI) * (0.7 + v.mic * 0.3);
      c.strokeStyle = v.mic > 0.15 ? '#ff5cc8' : '#8a5cff';
      c.lineWidth = R * (0.04 + v.mic * 0.04);
      c.beginPath();
      c.arc(hx, hy, rr2, -0.7, 0.7);
      c.stroke();
    }
    c.globalAlpha = 1;
  }
  // moscas fofinhas + cheirinho
  if (anyDirt && v.m.dirty && v.foamN === 0) {
    c.strokeStyle = 'rgba(120,170,60,0.55)';
    c.lineWidth = R * 0.04;
    c.lineCap = 'round';
    for (let k = -1; k <= 1; k++) {
      const bx = x0 + k * R * 0.42;
      const ph = (t * 0.6 + k * 0.33) % 1;
      const by = y0 - R * 1.05 - ph * R * 0.5;
      c.globalAlpha = Math.sin(ph * Math.PI) * 0.9;
      c.beginPath();
      c.moveTo(bx, by);
      c.bezierCurveTo(bx + R * 0.1, by - R * 0.1, bx - R * 0.1, by - R * 0.2, bx, by - R * 0.3);
      c.stroke();
    }
    c.globalAlpha = 1;
    for (let k = 0; k < 3; k++) {
      const a = t * (1.6 + k * 0.4) + k * 2.1;
      const fx = x0 + Math.cos(a) * R * (1.15 + k * 0.1);
      const fy = y0 - R * 0.6 + Math.sin(a * 2) * R * 0.35;
      c.fillStyle = 'rgba(255,255,255,0.8)';
      const wing = Math.abs(Math.sin(t * 40 + k)) * R * 0.05;
      c.beginPath();
      c.ellipse(fx - R * 0.03, fy - R * 0.04, R * 0.035, wing + 1, -0.5, 0, TAU);
      c.ellipse(fx + R * 0.03, fy - R * 0.04, R * 0.035, wing + 1, 0.5, 0, TAU);
      c.fill();
      c.fillStyle = '#3a2a4a';
      c.beginPath();
      c.arc(fx, fy, R * 0.035, 0, TAU);
      c.fill();
    }
  }
  // balão de pensamento (fome)
  if (v.thinkFood) {
    const bx = x0 + R * 1.05;
    const by = y0 - R * 1.25;
    const bob = Math.sin(t * 2) * R * 0.04;
    c.fillStyle = '#ffffff';
    c.strokeStyle = INK;
    c.lineWidth = 2.5;
    c.beginPath();
    c.arc(x0 + R * 0.62, y0 - R * 0.78, R * 0.06, 0, TAU);
    c.fill();
    c.stroke();
    c.beginPath();
    c.arc(x0 + R * 0.78, y0 - R * 0.95, R * 0.09, 0, TAU);
    c.fill();
    c.stroke();
    c.beginPath();
    c.ellipse(bx, by + bob, R * 0.42, R * 0.34, 0, 0, TAU);
    c.fill();
    c.stroke();
    drawFood(c, v.thinkFood, bx, by + bob, R * 0.42);
  }
  // nuvenzinha triste
  if (m.sad && !v.sleeping && v.pose.mood !== 'happy' && hiFx) {
    const bx = x0 - R * 0.05;
    const by = y0 - R * 1.55 + Math.sin(t * 1.5) * R * 0.04;
    c.fillStyle = '#b9b3d6';
    c.beginPath();
    c.arc(bx - R * 0.22, by, R * 0.17, 0, TAU);
    c.arc(bx, by - R * 0.08, R * 0.22, 0, TAU);
    c.arc(bx + R * 0.24, by, R * 0.16, 0, TAU);
    c.fill();
    c.fillStyle = '#8fd3ff';
    for (let k = 0; k < 3; k++) {
      const ph = (t * 1.2 + k * 0.33) % 1;
      c.globalAlpha = 1 - ph;
      c.fillRect(bx - R * 0.2 + k * R * 0.2, by + R * 0.15 + ph * R * 0.3, 2, R * 0.08);
    }
    c.globalAlpha = 1;
  }
}

/* ============================================================
 *  CARETAS (desenhadas no lugar dos olhos/boca)
 * ============================================================ */

const EXX = 0.33;
const EXY = -0.1;

function eyeBall(c: CanvasRenderingContext2D, x: number, y: number, rw: number, rh: number, px: number, py: number, pr: number): void {
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.ellipse(x, y, rw, rh, 0, 0, TAU);
  c.fill();
  c.stroke();
  c.fillStyle = '#1a1030';
  c.beginPath();
  c.arc(x + px, y + py, pr, 0, TAU);
  c.fill();
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.arc(x + px - pr * 0.35, y + py - pr * 0.4, pr * 0.35, 0, TAU);
  c.fill();
}

/** olho apertado em ">" / "<" */
function squeeze(c: CanvasRenderingContext2D, x: number, y: number, s: number, side: number): void {
  c.beginPath();
  c.moveTo(x - side * s, y - s * 0.75);
  c.lineTo(x + side * s * 0.7, y);
  c.lineTo(x - side * s, y + s * 0.75);
  c.stroke();
}

function brow(c: CanvasRenderingContext2D, R: number, side: number, inner: number, outer: number): void {
  c.beginPath();
  c.moveTo(side * 0.16 * R, (EXY - inner) * R);
  c.lineTo(side * 0.5 * R, (EXY - outer) * R);
  c.stroke();
}

function cheeks(c: CanvasRenderingContext2D, R: number, col: string, k = 1): void {
  c.fillStyle = col;
  for (const sd of [-1, 1]) {
    c.beginPath();
    c.ellipse(sd * R * 0.6, R * 0.16, R * 0.15 * k, R * 0.1 * k, 0, 0, TAU);
    c.fill();
  }
}

function drawExpr(c: CanvasRenderingContext2D, R: number, v: PetView): void {
  const t = v.t;
  const lx = v.pose.lookX * R * 0.05;
  const ey = EXY * R;
  c.save();
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.strokeStyle = INK;
  c.lineWidth = R * 0.06;
  switch (v.expr) {
    case 'gross': {
      cheeks(c, R, 'rgba(90,170,40,0.45)');
      squeeze(c, -EXX * R, ey, R * 0.12, -1);
      squeeze(c, EXX * R, ey, R * 0.12, 1);
      // boca torta aberta + língua pra fora
      c.fillStyle = '#5a1030';
      c.beginPath();
      c.moveTo(-R * 0.26, R * 0.3);
      c.quadraticCurveTo(-R * 0.1, R * 0.2, 0, R * 0.28);
      c.quadraticCurveTo(R * 0.12, R * 0.36, R * 0.26, R * 0.26);
      c.quadraticCurveTo(R * 0.15, R * 0.5, 0, R * 0.46);
      c.quadraticCurveTo(-R * 0.18, R * 0.5, -R * 0.26, R * 0.3);
      c.fill();
      c.stroke();
      const wig = Math.sin(t * 14) * R * 0.03;
      c.fillStyle = '#ff6b9a';
      c.lineWidth = R * 0.04;
      c.beginPath();
      c.moveTo(-R * 0.12, R * 0.4);
      c.quadraticCurveTo(-R * 0.14 + wig, R * 0.68, R * 0.02 + wig, R * 0.66);
      c.quadraticCurveTo(R * 0.16 + wig, R * 0.64, R * 0.12, R * 0.4);
      c.fill();
      c.stroke();
      c.beginPath();
      c.moveTo(wig * 0.5, R * 0.45);
      c.lineTo(wig, R * 0.58);
      c.stroke();
      break;
    }
    case 'spicy': {
      const jit = Math.sin(t * 40) * R * 0.012;
      c.lineWidth = R * 0.04;
      eyeBall(c, -EXX * R + jit, ey - R * 0.02, R * 0.17, R * 0.2, 0, 0, R * 0.05);
      eyeBall(c, EXX * R - jit, ey - R * 0.02, R * 0.17, R * 0.2, 0, 0, R * 0.05);
      c.lineWidth = R * 0.06;
      c.fillStyle = '#5a1030';
      c.beginPath();
      c.ellipse(0, R * 0.42, R * 0.28, R * 0.2 + Math.abs(Math.sin(t * 12)) * R * 0.04, 0, 0, TAU);
      c.fill();
      c.stroke();
      c.fillStyle = '#ff9a2e';
      c.beginPath();
      c.ellipse(0, R * 0.48, R * 0.16, R * 0.09, 0, 0, TAU);
      c.fill();
      // gotinhas de suor
      c.fillStyle = '#8fe3ff';
      c.lineWidth = R * 0.02;
      for (const sd of [-1, 1]) {
        const yy = -R * 0.45 + ((t * 1.5 + (sd + 1) * 0.3) % 1) * R * 0.25;
        c.beginPath();
        c.moveTo(sd * R * 0.72, yy - R * 0.08);
        c.quadraticCurveTo(sd * R * 0.77, yy, sd * R * 0.72, yy + R * 0.04);
        c.quadraticCurveTo(sd * R * 0.67, yy, sd * R * 0.72, yy - R * 0.08);
        c.fill();
        c.stroke();
      }
      break;
    }
    case 'sour': {
      cheeks(c, R, 'rgba(255,90,140,0.45)', 0.8);
      // olhos espremidos em espiralzinha
      for (const sd of [-1, 1]) {
        c.beginPath();
        c.moveTo(sd * EXX * R - R * 0.13, ey);
        c.quadraticCurveTo(sd * EXX * R - R * 0.06, ey - R * 0.08, sd * EXX * R, ey);
        c.quadraticCurveTo(sd * EXX * R + R * 0.06, ey + R * 0.08, sd * EXX * R + R * 0.13, ey);
        c.stroke();
      }
      brow(c, R, -1, 0.2, 0.3);
      brow(c, R, 1, 0.2, 0.3);
      // biquinho
      c.fillStyle = '#ff6b9a';
      c.beginPath();
      c.arc(0, R * 0.34, R * 0.07, 0, TAU);
      c.fill();
      c.stroke();
      c.lineWidth = R * 0.025;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + 0.3;
        c.beginPath();
        c.moveTo(Math.cos(a) * R * 0.11, R * 0.34 + Math.sin(a) * R * 0.11);
        c.lineTo(Math.cos(a) * R * 0.16, R * 0.34 + Math.sin(a) * R * 0.16);
        c.stroke();
      }
      break;
    }
    case 'annoyed':
    case 'grumpy': {
      const turn = v.expr === 'grumpy' ? -R * 0.12 : lx;
      const pc = v.expr === 'grumpy';
      if (pc) cheeks(c, R, 'rgba(255,90,140,0.55)', 1.35);
      c.lineWidth = R * 0.045;
      for (const sd of [-1, 1]) {
        const x = sd * EXX * R + turn;
        if (pc) {
          // olhos fechados emburrados
          c.beginPath();
          c.arc(x, ey + R * 0.04, R * 0.1, 1.15 * Math.PI, 1.85 * Math.PI);
          c.stroke();
        } else {
          eyeBall(c, x, ey, R * 0.15, R * 0.15, v.pose.lookX * R * 0.06, R * 0.04, R * 0.065);
          // pálpebra caída (meia-lua de cima)
          c.fillStyle = 'rgba(42,11,92,0.85)';
          c.beginPath();
          c.ellipse(x, ey, R * 0.155, R * 0.155, 0, Math.PI, TAU);
          c.closePath();
          c.fill();
        }
      }
      c.lineWidth = R * 0.06;
      brow(c, R, -1, 0.15 - turn / R, 0.3);
      brow(c, R, 1, 0.15 + turn / R, 0.3);
      c.beginPath();
      if (pc) {
        c.arc(turn, R * 0.42, R * 0.1, 1.1 * Math.PI, 1.9 * Math.PI);
      } else {
        c.moveTo(-R * 0.16, R * 0.34);
        for (let i = 1; i <= 4; i++) c.lineTo(-R * 0.16 + i * R * 0.08, R * 0.34 + (i % 2 ? -1 : 1) * R * 0.025);
      }
      c.stroke();
      // marquinha de bravo (cartoon)
      const k = 1 + Math.sin(t * 10) * 0.12;
      c.strokeStyle = '#ff3a5c';
      c.lineWidth = R * 0.045;
      c.save();
      c.translate(R * 0.62, -R * 0.62);
      c.scale(k, k);
      for (let i = 0; i < 4; i++) {
        c.rotate(TAU / 4);
        c.beginPath();
        c.moveTo(R * 0.04, R * 0.04);
        c.quadraticCurveTo(R * 0.06, R * 0.12, R * 0.04, R * 0.16);
        c.stroke();
      }
      c.restore();
      break;
    }
    case 'dizzy': {
      c.lineWidth = R * 0.04;
      for (const sd of [-1, 1]) {
        c.beginPath();
        for (let i = 0; i < 26; i++) {
          const a = i * 0.55 + t * 9 * sd;
          const rr2 = (i / 26) * R * 0.15;
          const x = sd * EXX * R + Math.cos(a) * rr2;
          const y = ey + Math.sin(a) * rr2;
          if (i) c.lineTo(x, y);
          else c.moveTo(x, y);
        }
        c.stroke();
      }
      c.lineWidth = R * 0.05;
      c.beginPath();
      for (let i = 0; i <= 8; i++) {
        const x = -R * 0.22 + i * R * 0.055;
        const y = R * 0.36 + Math.sin(i * 1.4 + t * 8) * R * 0.035;
        if (i) c.lineTo(x, y);
        else c.moveTo(x, y);
      }
      c.stroke();
      break;
    }
    case 'scared': {
      const jit = Math.sin(t * 50) * R * 0.015;
      c.lineWidth = R * 0.04;
      eyeBall(c, -EXX * R + jit, ey - R * 0.04, R * 0.2, R * 0.24, 0, 0, R * 0.045);
      eyeBall(c, EXX * R + jit, ey - R * 0.04, R * 0.2, R * 0.24, 0, 0, R * 0.045);
      c.lineWidth = R * 0.05;
      brow(c, R, -1, 0.4, 0.33);
      brow(c, R, 1, 0.4, 0.33);
      c.fillStyle = '#5a1030';
      c.beginPath();
      c.ellipse(jit, R * 0.44, R * 0.14, R * 0.2, 0, 0, TAU);
      c.fill();
      c.stroke();
      break;
    }
    case 'laugh': {
      cheeks(c, R, 'rgba(255,90,140,0.55)');
      for (const sd of [-1, 1]) {
        c.beginPath();
        c.arc(sd * EXX * R, ey + R * 0.05, R * 0.11, 1.1 * Math.PI, 1.9 * Math.PI);
        c.stroke();
      }
      const op = 0.75 + Math.abs(Math.sin(t * 16)) * 0.25;
      c.fillStyle = '#5a1030';
      c.beginPath();
      c.moveTo(-R * 0.3, R * 0.26);
      c.lineTo(R * 0.3, R * 0.26);
      c.quadraticCurveTo(R * 0.28, R * (0.26 + 0.38 * op), 0, R * (0.26 + 0.38 * op));
      c.quadraticCurveTo(-R * 0.28, R * (0.26 + 0.38 * op), -R * 0.3, R * 0.26);
      c.fill();
      c.stroke();
      c.fillStyle = '#ff6b9a';
      c.beginPath();
      c.ellipse(0, R * (0.26 + 0.3 * op), R * 0.14, R * 0.07, 0, 0, TAU);
      c.fill();
      break;
    }
    case 'squint': {
      cheeks(c, R, 'rgba(255,90,140,0.5)');
      squeeze(c, -EXX * R, ey, R * 0.11, -1);
      squeeze(c, EXX * R, ey, R * 0.11, 1);
      c.fillStyle = '#5a1030';
      c.beginPath();
      c.ellipse(0, R * 0.38, R * 0.08, R * 0.1, 0, 0, TAU);
      c.fill();
      c.stroke();
      break;
    }
    case 'blub': {
      c.lineWidth = R * 0.05;
      for (const sd of [-1, 1]) {
        c.beginPath();
        c.moveTo(sd * EXX * R - R * 0.12, ey);
        c.lineTo(sd * EXX * R + R * 0.12, ey);
        c.stroke();
      }
      c.beginPath();
      for (let i = 0; i <= 6; i++) {
        const x = -R * 0.18 + i * R * 0.06;
        const y = R * 0.36 + (i % 2 ? -1 : 1) * R * 0.03;
        if (i) c.lineTo(x, y);
        else c.moveTo(x, y);
      }
      c.stroke();
      break;
    }
    case 'love': {
      cheeks(c, R, 'rgba(255,90,140,0.55)');
      c.fillStyle = '#ff3a7a';
      c.lineWidth = R * 0.03;
      const b = 1 + Math.sin(t * 8) * 0.1;
      for (const sd of [-1, 1]) {
        heart(c, sd * EXX * R, ey, R * 0.15 * b);
        c.stroke();
      }
      c.lineWidth = R * 0.06;
      c.beginPath();
      c.arc(0, R * 0.24, R * 0.16, 0.15 * Math.PI, 0.85 * Math.PI);
      c.stroke();
      break;
    }
  }
  c.restore();
}

function drawFur(c: CanvasRenderingContext2D, R: number, k: number, t: number, col: string): void {
  c.fillStyle = col;
  c.strokeStyle = INK;
  c.lineWidth = R * 0.05;
  c.lineJoin = 'round';
  c.beginPath();
  const n = 22;
  for (let i = 0; i <= n * 2; i++) {
    const a = (i / (n * 2)) * TAU;
    const spike = i % 2 === 0 ? 1 + 0.3 * k + Math.sin(t * 40 + i) * 0.03 * k : 0.94;
    const x = Math.cos(a) * R * spike;
    const y = Math.sin(a) * R * spike;
    if (i) c.lineTo(x, y);
    else c.moveTo(x, y);
  }
  c.closePath();
  c.fill();
  c.stroke();
}

/* ============================================================
 *  BRINQUEDOS DE TRAVESSURA + COBERTOR + ESPELHO
 * ============================================================ */

export type Toy = 'pillow' | 'spray' | 'cushion' | 'box' | 'spider' | 'shake' | 'feather';

/** Desenha um brinquedo centrado em (x,y), tamanho s. `k` = estado (caixa: mola 0..1). */
export function drawToy(c: CanvasRenderingContext2D, toy: Toy, x: number, y: number, s: number, k = 0, t = 0): void {
  const r = s * 0.5;
  c.save();
  c.translate(x, y);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.strokeStyle = INK;
  c.lineWidth = Math.max(1.5, s * 0.06);
  switch (toy) {
    case 'pillow': {
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.moveTo(-r * 0.95, -r * 0.6);
      c.quadraticCurveTo(0, -r * 0.4, r * 0.95, -r * 0.6);
      c.quadraticCurveTo(r * 0.75, 0, r * 0.95, r * 0.6);
      c.quadraticCurveTo(0, r * 0.4, -r * 0.95, r * 0.6);
      c.quadraticCurveTo(-r * 0.75, 0, -r * 0.95, -r * 0.6);
      c.fill();
      c.stroke();
      c.fillStyle = '#ff9ec7';
      for (const [px, py] of [[-0.3, -0.1], [0.25, 0.15], [0.05, -0.25], [-0.15, 0.25]]) {
        c.beginPath();
        c.arc(px * r, py * r, r * 0.09, 0, TAU);
        c.fill();
      }
      break;
    }
    case 'spray': {
      c.fillStyle = '#8fe3ff';
      c.beginPath();
      c.roundRect(-r * 0.4, -r * 0.2, r * 0.8, r * 1.1, r * 0.2);
      c.fill();
      c.stroke();
      c.fillStyle = '#ff7ab8';
      c.beginPath();
      c.roundRect(-r * 0.25, -r * 0.55, r * 0.5, r * 0.38, r * 0.08);
      c.fill();
      c.stroke();
      c.beginPath();
      c.moveTo(-r * 0.25, -r * 0.5);
      c.lineTo(-r * 0.75, -r * 0.45);
      c.lineTo(-r * 0.75, -r * 0.32);
      c.lineTo(-r * 0.25, -r * 0.3);
      c.fill();
      c.stroke();
      c.beginPath();
      c.moveTo(r * 0.1, -r * 0.18);
      c.quadraticCurveTo(r * 0.2, r * 0.1, r * 0.05, r * 0.15);
      c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.6)';
      c.fillRect(-r * 0.28, 0, r * 0.12, r * 0.6);
      break;
    }
    case 'cushion': {
      c.fillStyle = '#ff5c7a';
      c.beginPath();
      c.ellipse(0, r * 0.1, r * 0.85, r * 0.55, 0, 0, TAU);
      c.fill();
      c.stroke();
      c.beginPath();
      c.moveTo(r * 0.7, -r * 0.05);
      c.lineTo(r * 1.0, -r * 0.3);
      c.lineTo(r * 1.05, -r * 0.1);
      c.lineTo(r * 0.8, r * 0.15);
      c.fill();
      c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.45)';
      c.beginPath();
      c.ellipse(-r * 0.3, -r * 0.1, r * 0.25, r * 0.1, -0.3, 0, TAU);
      c.fill();
      break;
    }
    case 'box': {
      // mola + cabeça de palhacinho (k = 0 fechada .. 1 aberta)
      if (k > 0) {
        const top = -r * 0.5 - k * r * 1.6;
        c.strokeStyle = '#7a7a8c';
        c.lineWidth = s * 0.06;
        c.beginPath();
        for (let i = 0; i <= 10; i++) {
          const yy = -r * 0.5 + (top + r * 0.5) * (i / 10);
          c.lineTo((i % 2 ? 1 : -1) * r * 0.22, yy);
        }
        c.stroke();
        c.strokeStyle = INK;
        c.lineWidth = Math.max(1.5, s * 0.06);
        const wob = Math.sin(t * 18) * 0.25 * k;
        c.save();
        c.translate(0, top - r * 0.3);
        c.rotate(wob);
        c.fillStyle = '#fff1c7';
        c.beginPath();
        c.arc(0, 0, r * 0.42, 0, TAU);
        c.fill();
        c.stroke();
        c.fillStyle = '#ff3a5c';
        c.beginPath();
        c.arc(0, r * 0.05, r * 0.1, 0, TAU);
        c.fill();
        c.fillStyle = INK;
        c.beginPath();
        c.arc(-r * 0.15, -r * 0.1, r * 0.05, 0, TAU);
        c.arc(r * 0.15, -r * 0.1, r * 0.05, 0, TAU);
        c.fill();
        c.beginPath();
        c.arc(0, r * 0.12, r * 0.2, 0.15 * Math.PI, 0.85 * Math.PI);
        c.stroke();
        c.fillStyle = '#8a5cff';
        c.beginPath();
        c.moveTo(-r * 0.32, -r * 0.28);
        c.lineTo(0, -r * 0.95);
        c.lineTo(r * 0.32, -r * 0.28);
        c.closePath();
        c.fill();
        c.stroke();
        c.fillStyle = '#ffe27a';
        c.beginPath();
        c.arc(0, -r * 0.95, r * 0.1, 0, TAU);
        c.fill();
        c.stroke();
        c.restore();
      }
      c.fillStyle = '#ff9a2e';
      c.beginPath();
      c.roundRect(-r * 0.6, -r * 0.5, r * 1.2, r * 1.1, r * 0.1);
      c.fill();
      c.stroke();
      c.fillStyle = '#ffe27a';
      star(c, 0, r * 0.05, r * 0.28, r * 0.12, 5);
      c.fill();
      c.stroke();
      // tampa
      c.fillStyle = '#ffb347';
      c.save();
      c.translate(-r * 0.6, -r * 0.5);
      c.rotate(-k * 2.2);
      c.beginPath();
      c.roundRect(0, -r * 0.12, r * 1.2, r * 0.12, r * 0.05);
      c.fill();
      c.stroke();
      c.restore();
      // manivela
      c.save();
      c.translate(r * 0.65, 0);
      c.rotate(t * 8 * (k > 0 ? 0 : 1));
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(r * 0.25, 0);
      c.stroke();
      c.fillStyle = '#ff5c7a';
      c.beginPath();
      c.arc(r * 0.25, 0, r * 0.07, 0, TAU);
      c.fill();
      c.stroke();
      c.restore();
      break;
    }
    case 'spider': {
      // aranha de brinquedo (fofinha, olhos esbugalhados)
      c.lineWidth = Math.max(1.5, s * 0.05);
      for (const sd of [-1, 1])
        for (let i = 0; i < 4; i++) {
          const a = -0.6 + i * 0.4;
          const w = Math.sin(t * 12 + i) * 0.12;
          c.beginPath();
          c.moveTo(sd * r * 0.3, 0);
          c.quadraticCurveTo(sd * r * 0.7, -r * 0.35 + a * r * 0.6, sd * r * (0.85 + w), a * r * 0.9 + r * 0.25);
          c.stroke();
        }
      c.fillStyle = '#2a2040';
      c.beginPath();
      c.arc(0, 0, r * 0.42, 0, TAU);
      c.fill();
      c.stroke();
      c.fillStyle = '#ffffff';
      for (const sd of [-1, 1]) {
        c.beginPath();
        c.arc(sd * r * 0.15, -r * 0.08, r * 0.14, 0, TAU);
        c.fill();
      }
      c.fillStyle = '#111';
      for (const sd of [-1, 1]) {
        c.beginPath();
        c.arc(sd * r * 0.15 + Math.sin(t * 5) * r * 0.04, -r * 0.05, r * 0.06, 0, TAU);
        c.fill();
      }
      c.strokeStyle = '#ffffff';
      c.lineWidth = Math.max(1, s * 0.03);
      c.beginPath();
      c.arc(0, r * 0.12, r * 0.12, 0.2 * Math.PI, 0.8 * Math.PI);
      c.stroke();
      break;
    }
    case 'shake': {
      // setas girando (virar de ponta-cabeça)
      c.strokeStyle = '#8a5cff';
      c.lineWidth = s * 0.12;
      c.beginPath();
      c.arc(0, 0, r * 0.6, -0.3, Math.PI - 0.5);
      c.stroke();
      c.strokeStyle = '#ff7ab8';
      c.beginPath();
      c.arc(0, 0, r * 0.6, Math.PI - 0.3, TAU - 0.5);
      c.stroke();
      c.fillStyle = '#8a5cff';
      c.beginPath();
      c.moveTo(Math.cos(Math.PI - 0.5) * r * 0.6 - r * 0.25, Math.sin(Math.PI - 0.5) * r * 0.6 - r * 0.05);
      c.lineTo(Math.cos(Math.PI - 0.5) * r * 0.6 + r * 0.15, Math.sin(Math.PI - 0.5) * r * 0.6 - r * 0.25);
      c.lineTo(Math.cos(Math.PI - 0.5) * r * 0.6 + r * 0.05, Math.sin(Math.PI - 0.5) * r * 0.6 + r * 0.2);
      c.fill();
      c.fillStyle = '#ff7ab8';
      c.beginPath();
      c.moveTo(Math.cos(-0.5) * r * 0.6 + r * 0.25, Math.sin(-0.5) * r * 0.6 + r * 0.05);
      c.lineTo(Math.cos(-0.5) * r * 0.6 - r * 0.15, Math.sin(-0.5) * r * 0.6 + r * 0.25);
      c.lineTo(Math.cos(-0.5) * r * 0.6 - r * 0.05, Math.sin(-0.5) * r * 0.6 - r * 0.2);
      c.fill();
      c.fillStyle = '#ffcf2e';
      c.strokeStyle = '#a86a00';
      c.lineWidth = s * 0.05;
      c.beginPath();
      c.arc(0, 0, r * 0.22, 0, TAU);
      c.fill();
      c.stroke();
      break;
    }
    case 'feather': {
      c.rotate(-0.7);
      c.fillStyle = '#b9a6ff';
      c.beginPath();
      c.moveTo(0, -r);
      c.quadraticCurveTo(r * 0.45, -r * 0.3, r * 0.1, r * 0.6);
      c.lineTo(-r * 0.1, r * 0.6);
      c.quadraticCurveTo(-r * 0.45, -r * 0.3, 0, -r);
      c.fill();
      c.stroke();
      c.beginPath();
      c.moveTo(0, -r * 0.8);
      c.lineTo(0, r * 0.95);
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.7)';
      c.lineWidth = Math.max(1, s * 0.03);
      for (let i = 0; i < 4; i++) {
        c.beginPath();
        c.moveTo(0, -r * 0.5 + i * r * 0.25);
        c.lineTo(r * 0.22, -r * 0.65 + i * r * 0.25);
        c.moveTo(0, -r * 0.5 + i * r * 0.25);
        c.lineTo(-r * 0.22, -r * 0.65 + i * r * 0.25);
        c.stroke();
      }
      break;
    }
  }
  c.restore();
}

/** Cobertor caindo sobre o bichinho (k 0..1) — ele se esconde e espia. */
export function drawBlanket(c: CanvasRenderingContext2D, L: Layout, k: number, t: number, peek: boolean): void {
  if (k <= 0) return;
  const { R, cx } = L;
  const base = L.cy + R * 0.98;
  const lift = (1 - k) * (L.cy + R * 2);
  const breathe = Math.sin(t * 2.2) * R * 0.03;
  const top = L.cy - R * 1.05 - lift + breathe;
  c.save();
  c.translate(0, 0);
  c.fillStyle = '#7d5cff';
  c.strokeStyle = INK;
  c.lineWidth = 3;
  c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(cx - R * 1.6, base - lift);
  c.quadraticCurveTo(cx - R * 1.35, top + R * 0.2, cx, top);
  c.quadraticCurveTo(cx + R * 1.35, top + R * 0.2, cx + R * 1.6, base - lift);
  for (let i = 0; i <= 8; i++) c.lineTo(cx + R * 1.6 - (i / 8) * R * 3.2, base - lift + (i % 2 ? R * 0.08 : 0));
  c.closePath();
  c.fill();
  c.stroke();
  c.save();
  c.clip();
  c.fillStyle = '#ffd36b';
  for (let i = 0; i < 14; i++) {
    const sx = cx - R * 1.4 + ((i * 53) % 28) * R * 0.1;
    const sy = top + R * 0.3 + ((i * 37) % 19) * R * 0.1;
    star(c, sx, sy, R * 0.09, R * 0.04, 5);
    c.fill();
  }
  c.restore();
  if (peek && k >= 1) {
    // olhinhos espiando pela fresta
    c.fillStyle = '#1a1030';
    const ey = base - R * 0.25;
    c.fillStyle = 'rgba(20,8,40,0.9)';
    c.beginPath();
    c.ellipse(cx + R * 0.15, ey, R * 0.45, R * 0.13, 0, 0, TAU);
    c.fill();
    c.fillStyle = '#ffffff';
    for (const sd of [-1, 1]) {
      c.beginPath();
      c.ellipse(cx + R * 0.15 + sd * R * 0.15, ey, R * 0.07, R * 0.07, 0, 0, TAU);
      c.fill();
    }
  }
  c.restore();
}

/** Retângulo (em px) do espelho na parede do quarto. */
export function mirrorRect(L: Layout): { x: number; y: number; w: number; h: number } {
  const w = Math.round(Math.min(L.W * 0.17, L.H * 0.1));
  const h = Math.round(w * 1.4);
  return { x: Math.round(L.W * 0.44 - w / 2), y: Math.round(L.H * 0.14), w, h };
}

/** Brilho que passa no espelho do quarto (por frame, leve). */
export function drawMirrorGlint(c: CanvasRenderingContext2D, L: Layout, t: number): void {
  const m = mirrorRect(L);
  const ph = (t * 0.35) % 1.8;
  if (ph > 1) return;
  c.save();
  c.beginPath();
  c.ellipse(m.x + m.w / 2, m.y + m.h / 2, m.w / 2 - 4, m.h / 2 - 4, 0, 0, TAU);
  c.clip();
  c.strokeStyle = 'rgba(255,255,255,0.85)';
  c.lineWidth = m.w * 0.16;
  const x = m.x - m.w * 0.5 + ph * m.w * 2;
  c.beginPath();
  c.moveTo(x, m.y + m.h);
  c.lineTo(x + m.w * 0.6, m.y);
  c.stroke();
  c.restore();
  c.fillStyle = '#ffffff';
  sparkle(c, m.x + m.w * 0.85, m.y + m.h * 0.12, 4 + Math.sin(t * 5) * 3);
}

/** Coordenada do canto da boca no espaço da tela (para comida, migalhas, lágrimas). */
export function mouthPos(L: Layout, v: PetView): [number, number] {
  return [L.cx, L.cy - v.hop + L.R * 0.28 * v.sy];
}
