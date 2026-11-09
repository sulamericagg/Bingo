/* ============================================================
 *  COZINHA MALUCA — arte vetorial em cache (2D e texturas do 3D).
 *  Ingredientes: atlas preguiçoso (célula desenhada na 1ª vez).
 *  Personagens: drawPlayer → bitmap com chapéu de chef, por skin.
 * ============================================================ */
import { drawPlayer, type PlayerPose } from '../../game/character';
import { skinById } from '../../game/skins';
import { INGS, compIng, compRoute, compStage, type Role } from './data';

export const INK = '#2a0b5c';
const TAU = Math.PI * 2;

/** estado visual de um componente */
export const enum Vis {
  Raw = 0,
  Chop = 1,
  Cook = 2,
  Blend = 3,
  Burnt = 4,
}
export function visOf(c: number, burnt: boolean): Vis {
  if (burnt) return Vis.Burnt;
  const s = compStage(c);
  if (!s) return Vis.Raw;
  const g = INGS[compIng(c)];
  const last = g.routes[compRoute(c)][s - 1];
  return last === 'chop' ? Vis.Chop : last === 'blend' ? Vis.Blend : Vis.Cook;
}

function rr(x: CanvasRenderingContext2D, a: number, b: number, w: number, h: number, r: number): void {
  x.beginPath();
  x.roundRect(a, b, w, h, r);
}
function outline(x: CanvasRenderingContext2D, lw: number): void {
  x.lineWidth = lw;
  x.strokeStyle = INK;
  x.lineJoin = 'round';
  x.stroke();
}
function mix(a: string, b: string, t: number): string {
  const A = parseInt(a.slice(1), 16);
  const B = parseInt(b.slice(1), 16);
  const r = Math.round(((A >> 16) & 255) * (1 - t) + ((B >> 16) & 255) * t);
  const g = Math.round(((A >> 8) & 255) * (1 - t) + ((B >> 8) & 255) * t);
  const bl = Math.round((A & 255) * (1 - t) + (B & 255) * t);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}

/** desenha o ingrediente centrado em 0,0 com raio ~r */
export function drawIng(x: CanvasRenderingContext2D, ing: number, vis: Vis, r: number): void {
  const g = INGS[ing];
  let [c0, c1, c2] = g.c;
  if (vis === Vis.Burnt) {
    c0 = '#3a3340';
    c1 = '#1d1822';
    c2 = '#5a5060';
  } else if (vis === Vis.Cook) {
    c0 = mix(c0, '#c9782c', g.shape === 'grain' || g.shape === 'egg' || g.shape === 'drop' ? 0.08 : 0.38);
    c1 = mix(c1, '#7a3a10', 0.35);
  }
  const lw = Math.max(1.5, r * 0.12);
  x.save();
  if (vis === Vis.Blend) {
    // copo com a bebida
    x.beginPath();
    x.moveTo(-r * 0.62, -r * 0.7);
    x.lineTo(r * 0.62, -r * 0.7);
    x.lineTo(r * 0.45, r * 0.9);
    x.lineTo(-r * 0.45, r * 0.9);
    x.closePath();
    x.fillStyle = '#e8f6ff';
    x.fill();
    outline(x, lw);
    x.beginPath();
    x.moveTo(-r * 0.56, -r * 0.35);
    x.lineTo(r * 0.56, -r * 0.35);
    x.lineTo(r * 0.43, r * 0.82);
    x.lineTo(-r * 0.43, r * 0.82);
    x.closePath();
    x.fillStyle = c0;
    x.fill();
    x.fillStyle = 'rgba(255,255,255,.45)';
    x.fillRect(-r * 0.4, -r * 0.3, r * 0.14, r * 0.9);
    x.strokeStyle = INK;
    x.lineWidth = lw * 1.6;
    x.beginPath();
    x.moveTo(r * 0.15, -r * 0.4);
    x.lineTo(r * 0.45, -r * 1.05);
    x.stroke();
    x.strokeStyle = '#ff5cc8';
    x.lineWidth = lw * 0.8;
    x.stroke();
    x.restore();
    return;
  }
  if (vis === Vis.Chop) {
    // 3 pedaços
    const pts = [
      [-0.42, 0.2, 0.52],
      [0.38, 0.28, 0.5],
      [0, -0.32, 0.55],
    ];
    for (const [px, py, s] of pts) {
      x.save();
      x.translate(px * r, py * r);
      chunk(x, g.shape, c0, c1, c2, r * s, lw * 0.8);
      x.restore();
    }
    x.restore();
    return;
  }
  whole(x, g.shape, c0, c1, c2, r, lw, vis === Vis.Cook);
  if (vis === Vis.Burnt) {
    x.strokeStyle = 'rgba(80,70,90,.7)';
    x.lineWidth = lw;
    x.beginPath();
    x.moveTo(-r * 0.2, -r * 0.8);
    x.quadraticCurveTo(-r * 0.6, -r * 1.1, -r * 0.1, -r * 1.35);
    x.stroke();
  }
  x.restore();
}

function chunk(x: CanvasRenderingContext2D, shape: string, c0: string, c1: string, c2: string, r: number, lw: number): void {
  x.beginPath();
  if (shape === 'leaf') {
    x.moveTo(-r, 0);
    x.quadraticCurveTo(0, -r * 1.2, r, 0);
    x.quadraticCurveTo(0, r * 0.9, -r, 0);
  } else if (shape === 'block' || shape === 'meat' || shape === 'sheet' || shape === 'dough') x.roundRect(-r * 0.8, -r * 0.6, r * 1.6, r * 1.2, r * 0.3);
  else if (shape === 'long') x.ellipse(0, 0, r * 0.8, r * 0.8, 0, 0, TAU);
  else x.arc(0, 0, r * 0.8, 0, Math.PI);
  x.closePath();
  x.fillStyle = c0;
  x.fill();
  outline(x, lw);
  x.fillStyle = shape === 'long' || shape === 'round' ? c2 : c1;
  x.globalAlpha = 0.55;
  x.beginPath();
  x.arc(0, 0, r * 0.32, 0, TAU);
  x.fill();
  x.globalAlpha = 1;
}

function whole(x: CanvasRenderingContext2D, shape: string, c0: string, c1: string, c2: string, r: number, lw: number, cooked: boolean): void {
  const hi = (a: number, b: number, w: number, h: number) => {
    x.fillStyle = 'rgba(255,255,255,.55)';
    x.beginPath();
    x.ellipse(a, b, w, h, -0.6, 0, TAU);
    x.fill();
  };
  switch (shape) {
    case 'round': {
      x.beginPath();
      x.arc(0, r * 0.08, r * 0.86, 0, TAU);
      x.fillStyle = c0;
      x.fill();
      outline(x, lw);
      x.fillStyle = c1;
      x.globalAlpha = 0.45;
      x.beginPath();
      x.arc(r * 0.18, r * 0.25, r * 0.6, 0, TAU);
      x.fill();
      x.globalAlpha = 1;
      hi(-r * 0.32, -r * 0.25, r * 0.2, r * 0.12);
      x.fillStyle = c2;
      x.beginPath();
      x.ellipse(r * 0.1, -r * 0.8, r * 0.28, r * 0.13, -0.4, 0, TAU);
      x.fill();
      outline(x, lw * 0.7);
      break;
    }
    case 'leaf': {
      x.beginPath();
      for (let i = 0; i <= 10; i++) {
        const a = (i / 10) * TAU;
        const k = r * (0.82 + Math.sin(i * 2.7) * 0.1);
        if (i) x.lineTo(Math.cos(a) * k, Math.sin(a) * k * 0.9);
        else x.moveTo(Math.cos(a) * k, Math.sin(a) * k * 0.9);
      }
      x.closePath();
      x.fillStyle = c0;
      x.fill();
      outline(x, lw);
      x.strokeStyle = c2;
      x.lineWidth = lw * 0.8;
      x.beginPath();
      x.moveTo(0, r * 0.6);
      x.lineTo(0, -r * 0.5);
      x.moveTo(0, 0);
      x.lineTo(r * 0.4, -r * 0.3);
      x.moveTo(0, 0.2 * r);
      x.lineTo(-r * 0.4, -r * 0.15);
      x.stroke();
      break;
    }
    case 'block': {
      x.beginPath();
      x.moveTo(-r * 0.85, r * 0.55);
      x.lineTo(r * 0.85, r * 0.55);
      x.lineTo(r * 0.85, -r * 0.1);
      x.lineTo(-r * 0.6, -r * 0.65);
      x.closePath();
      x.fillStyle = c0;
      x.fill();
      outline(x, lw);
      x.fillStyle = c1;
      for (const [a, b, s] of [
        [-0.2, 0.15, 0.15],
        [0.45, 0.25, 0.12],
        [0.2, -0.12, 0.09],
      ]) {
        x.beginPath();
        x.arc(a * r, b * r, s * r, 0, TAU);
        x.fill();
      }
      break;
    }
    case 'long': {
      x.rotate(-0.6);
      rr(x, -r * 0.95, -r * 0.32, r * 1.9, r * 0.64, r * 0.32);
      x.fillStyle = c0;
      x.fill();
      outline(x, lw);
      x.fillStyle = c2;
      x.beginPath();
      x.ellipse(-r * 0.95, 0, r * 0.18, r * 0.28, 0, 0, TAU);
      x.fill();
      x.strokeStyle = c1;
      x.lineWidth = lw * 0.7;
      x.beginPath();
      x.moveTo(-r * 0.3, -r * 0.15);
      x.lineTo(-r * 0.1, -r * 0.15);
      x.moveTo(r * 0.2, r * 0.1);
      x.lineTo(r * 0.45, r * 0.1);
      x.stroke();
      hi(-r * 0.1, -r * 0.16, r * 0.4, r * 0.06);
      break;
    }
    case 'bun': {
      x.beginPath();
      x.moveTo(-r * 0.9, r * 0.3);
      x.quadraticCurveTo(-r * 0.9, -r * 0.75, 0, -r * 0.75);
      x.quadraticCurveTo(r * 0.9, -r * 0.75, r * 0.9, r * 0.3);
      x.closePath();
      x.fillStyle = c0;
      x.fill();
      outline(x, lw);
      rr(x, -r * 0.9, r * 0.38, r * 1.8, r * 0.36, r * 0.15);
      x.fillStyle = c1;
      x.fill();
      outline(x, lw);
      x.fillStyle = c2;
      for (const [a, b] of [
        [-0.4, -0.3],
        [0.1, -0.5],
        [0.45, -0.2],
        [-0.05, -0.1],
      ]) {
        x.beginPath();
        x.ellipse(a * r, b * r, r * 0.08, r * 0.045, 0.5, 0, TAU);
        x.fill();
      }
      break;
    }
    case 'meat': {
      x.beginPath();
      x.ellipse(0, 0, r * 0.9, r * 0.66, 0.2, 0, TAU);
      x.fillStyle = c0;
      x.fill();
      outline(x, lw);
      x.strokeStyle = cooked ? '#5a2a10' : c2;
      x.lineWidth = lw * (cooked ? 1.1 : 0.8);
      x.beginPath();
      if (cooked) {
        for (let i = -1; i <= 1; i++) {
          x.moveTo(-r * 0.45 + i * r * 0.32, -r * 0.4);
          x.lineTo(-r * 0.05 + i * r * 0.32, r * 0.45);
        }
      } else {
        x.moveTo(-r * 0.4, -r * 0.1);
        x.quadraticCurveTo(0, -r * 0.4, r * 0.4, 0);
        x.moveTo(-r * 0.3, r * 0.25);
        x.quadraticCurveTo(r * 0.1, r * 0.05, r * 0.45, r * 0.3);
      }
      x.stroke();
      break;
    }
    case 'fish': {
      x.beginPath();
      x.ellipse(-r * 0.1, 0, r * 0.75, r * 0.45, 0, 0, TAU);
      x.moveTo(r * 0.55, 0);
      x.lineTo(r * 0.95, -r * 0.4);
      x.lineTo(r * 0.95, r * 0.4);
      x.closePath();
      x.fillStyle = c0;
      x.fill();
      outline(x, lw);
      x.fillStyle = INK;
      x.beginPath();
      x.arc(-r * 0.5, -r * 0.08, r * 0.08, 0, TAU);
      x.fill();
      x.strokeStyle = c2;
      x.lineWidth = lw * 0.7;
      x.beginPath();
      x.moveTo(-r * 0.1, -r * 0.3);
      x.quadraticCurveTo(r * 0.05, 0, -r * 0.1, r * 0.3);
      x.stroke();
      break;
    }
    case 'grain': {
      if (cooked) {
        // montinho em tigela
        x.beginPath();
        x.ellipse(0, r * 0.2, r * 0.9, r * 0.55, 0, 0, Math.PI);
        x.closePath();
        x.fillStyle = '#ffffff';
        x.fill();
        outline(x, lw);
        x.beginPath();
        x.ellipse(0, r * 0.2, r * 0.82, r * 0.62, 0, Math.PI, TAU);
        x.fillStyle = c0;
        x.fill();
        outline(x, lw);
        x.fillStyle = c2;
        for (let i = 0; i < 6; i++) {
          x.beginPath();
          x.ellipse(Math.cos(i * 1.7) * r * 0.45, -r * 0.05 - Math.abs(Math.sin(i * 2.1)) * r * 0.25, r * 0.09, r * 0.05, i, 0, TAU);
          x.fill();
        }
        // vapor
        x.strokeStyle = 'rgba(255,255,255,.8)';
        x.lineWidth = lw;
        x.beginPath();
        x.moveTo(-r * 0.2, -r * 0.55);
        x.quadraticCurveTo(-r * 0.4, -r * 0.8, -r * 0.15, -r * 1);
        x.stroke();
      } else {
        // saquinho
        x.beginPath();
        x.moveTo(-r * 0.7, r * 0.8);
        x.lineTo(-r * 0.6, -r * 0.4);
        x.lineTo(r * 0.6, -r * 0.4);
        x.lineTo(r * 0.7, r * 0.8);
        x.closePath();
        x.fillStyle = '#e8d3a8';
        x.fill();
        outline(x, lw);
        x.beginPath();
        x.ellipse(0, -r * 0.45, r * 0.6, r * 0.3, 0, 0, TAU);
        x.fillStyle = c0;
        x.fill();
        outline(x, lw);
        x.fillStyle = c1;
        x.beginPath();
        x.arc(0, r * 0.25, r * 0.22, 0, TAU);
        x.fill();
      }
      break;
    }
    case 'egg': {
      if (cooked) {
        x.beginPath();
        for (let i = 0; i <= 12; i++) {
          const a = (i / 12) * TAU;
          const k = r * (0.85 + Math.sin(i * 3.3) * 0.1);
          if (i) x.lineTo(Math.cos(a) * k, Math.sin(a) * k * 0.8);
          else x.moveTo(Math.cos(a) * k, Math.sin(a) * k * 0.8);
        }
        x.closePath();
        x.fillStyle = '#ffffff';
        x.fill();
        outline(x, lw);
        x.beginPath();
        x.arc(r * 0.05, 0, r * 0.34, 0, TAU);
        x.fillStyle = c2;
        x.fill();
        outline(x, lw * 0.7);
      } else {
        x.beginPath();
        x.ellipse(0, r * 0.05, r * 0.62, r * 0.82, 0, 0, TAU);
        x.fillStyle = c0;
        x.fill();
        outline(x, lw);
        hi(-r * 0.2, -r * 0.3, r * 0.14, r * 0.22);
      }
      break;
    }
    case 'dough': {
      if (cooked) {
        x.beginPath();
        x.ellipse(0, r * 0.05, r * 0.92, r * 0.62, 0, 0, TAU);
        x.fillStyle = c0;
        x.fill();
        outline(x, lw);
        x.beginPath();
        x.ellipse(0, r * 0.02, r * 0.68, r * 0.42, 0, 0, TAU);
        x.fillStyle = mix(c2, '#ffffff', 0.15);
        x.fill();
        hi(-r * 0.35, -r * 0.2, r * 0.18, r * 0.08);
      } else {
        x.beginPath();
        x.ellipse(0, r * 0.15, r * 0.82, r * 0.62, 0, 0, TAU);
        x.fillStyle = c0;
        x.fill();
        outline(x, lw);
        hi(-r * 0.3, -r * 0.05, r * 0.25, r * 0.12);
        x.fillStyle = c2;
        x.globalAlpha = 0.6;
        x.beginPath();
        x.arc(r * 0.3, r * 0.2, r * 0.1, 0, TAU);
        x.fill();
        x.globalAlpha = 1;
      }
      break;
    }
    case 'bottle': {
      rr(x, -r * 0.45, -r * 0.4, r * 0.9, r * 1.25, r * 0.2);
      x.fillStyle = c0;
      x.fill();
      outline(x, lw);
      rr(x, -r * 0.22, -r * 0.85, r * 0.44, r * 0.5, r * 0.1);
      x.fillStyle = c0;
      x.fill();
      outline(x, lw);
      rr(x, -r * 0.25, -r * 0.98, r * 0.5, r * 0.2, r * 0.08);
      x.fillStyle = c2;
      x.fill();
      outline(x, lw * 0.7);
      x.fillStyle = c2;
      x.fillRect(-r * 0.45, -r * 0.05, r * 0.9, r * 0.3);
      break;
    }
    case 'berry': {
      x.beginPath();
      x.moveTo(0, r * 0.9);
      x.bezierCurveTo(-r * 1.1, r * 0.1, -r * 0.6, -r * 0.75, 0, -r * 0.5);
      x.bezierCurveTo(r * 0.6, -r * 0.75, r * 1.1, r * 0.1, 0, r * 0.9);
      x.fillStyle = c0;
      x.fill();
      outline(x, lw);
      x.fillStyle = 'rgba(255,255,255,.75)';
      for (const [a, b] of [
        [-0.3, 0],
        [0.25, -0.05],
        [0, 0.35],
        [-0.15, 0.6],
      ]) {
        x.beginPath();
        x.ellipse(a * r, b * r, r * 0.06, r * 0.04, 0, 0, TAU);
        x.fill();
      }
      x.fillStyle = c2;
      x.beginPath();
      x.ellipse(0, -r * 0.6, r * 0.35, r * 0.14, 0, 0, TAU);
      x.fill();
      outline(x, lw * 0.7);
      break;
    }
    case 'drop': {
      x.beginPath();
      if (cooked) x.ellipse(0, r * 0.1, r * 0.95, r * 0.5, 0, 0, TAU);
      else {
        x.moveTo(0, -r * 0.85);
        x.quadraticCurveTo(r * 0.9, r * 0.1, r * 0.6, r * 0.6);
        x.quadraticCurveTo(0, r * 0.95, -r * 0.6, r * 0.6);
        x.quadraticCurveTo(-r * 0.9, r * 0.1, 0, -r * 0.85);
      }
      x.fillStyle = c0;
      x.fill();
      outline(x, lw);
      if (cooked) {
        x.strokeStyle = '#e8c27a';
        x.lineWidth = lw * 0.8;
        x.beginPath();
        x.moveTo(-r * 0.7, r * 0.1);
        x.quadraticCurveTo(0, -r * 0.2, r * 0.7, r * 0.1);
        x.stroke();
      }
      hi(-r * 0.2, -r * 0.1, r * 0.15, r * 0.1);
      break;
    }
    case 'sheet': {
      if (cooked) {
        x.beginPath();
        x.moveTo(-r * 0.9, r * 0.35);
        x.quadraticCurveTo(0, -r * 1.0, r * 0.9, r * 0.35);
        x.closePath();
      } else rr(x, -r * 0.82, -r * 0.62, r * 1.64, r * 1.24, r * 0.25);
      x.fillStyle = c0;
      x.fill();
      outline(x, lw);
      x.strokeStyle = c1;
      x.lineWidth = lw * 0.6;
      x.beginPath();
      if (cooked) {
        for (let i = -3; i <= 3; i++) {
          x.moveTo(i * r * 0.22, r * 0.35);
          x.lineTo(i * r * 0.22, r * 0.2);
        }
      } else {
        x.moveTo(-r * 0.5, -r * 0.2);
        x.lineTo(r * 0.5, -r * 0.2);
        x.moveTo(-r * 0.5, r * 0.15);
        x.lineTo(r * 0.3, r * 0.15);
      }
      x.stroke();
      break;
    }
    default: {
      // nut: montinho
      for (let i = 0; i < 7; i++) {
        const a = i * 2.3;
        const k = i === 0 ? 0 : r * 0.5;
        x.beginPath();
        x.ellipse(Math.cos(a) * k, Math.sin(a) * k * 0.7 + r * 0.1, r * 0.3, r * 0.2, a, 0, TAU);
        x.fillStyle = i % 3 === 2 ? c2 : i % 2 ? c1 : c0;
        x.fill();
        outline(x, lw * 0.7);
      }
    }
  }
}

/* ------------------------------ atlas preguiçoso ------------------------------ */
const CELL = 64;
const VIS_N = 5;
let atlas: HTMLCanvasElement | null = null;
let atlasDone: Uint8Array | null = null;
export function ingAtlas(): HTMLCanvasElement {
  if (!atlas) {
    atlas = document.createElement('canvas');
    atlas.width = CELL * VIS_N;
    atlas.height = CELL * INGS.length;
    atlasDone = new Uint8Array(VIS_N * INGS.length);
  }
  return atlas;
}
/** garante a célula e devolve [sx, sy] (tamanho CELL) */
export function ingCell(ing: number, vis: Vis): number {
  const a = ingAtlas();
  const k = ing * VIS_N + vis;
  if (!atlasDone![k]) {
    atlasDone![k] = 1;
    const x = a.getContext('2d')!;
    x.save();
    x.translate(vis * CELL + CELL / 2, ing * CELL + CELL / 2 + 2);
    drawIng(x, ing, vis, CELL * 0.36);
    x.restore();
  }
  return k;
}
export const CELL_PX = CELL;
export const cellSX = (k: number): number => (k % VIS_N) * CELL;
export const cellSY = (k: number): number => Math.floor(k / VIS_N) * CELL;

/** desenha componente (via atlas) centrado em x,y com tamanho s */
export function blitIng(ctx: CanvasRenderingContext2D, c: number, burnt: boolean, x: number, y: number, s: number): void {
  const k = ingCell(compIng(c), visOf(c, burnt));
  ctx.drawImage(atlas!, cellSX(k), cellSY(k), CELL, CELL, x - s / 2, y - s / 2, s, s);
}

/** prato com até 4 componentes */
export function drawPlate(ctx: CanvasRenderingContext2D, parts: number[], x: number, y: number, s: number, dirty = false, dish: 'plate' | 'bowl' | 'cup' = 'plate'): void {
  const lw = Math.max(1.2, s * 0.05);
  ctx.beginPath();
  if (dish === 'bowl') {
    ctx.ellipse(x, y + s * 0.05, s * 0.46, s * 0.3, 0, 0, TAU);
  } else ctx.ellipse(x, y + s * 0.06, s * 0.5, s * 0.34, 0, 0, TAU);
  ctx.fillStyle = dirty ? '#d9cbb0' : dish === 'bowl' ? '#bfe8ff' : '#ffffff';
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x, y + s * 0.06, s * 0.36, s * 0.22, 0, 0, TAU);
  ctx.strokeStyle = dirty ? 'rgba(120,90,40,.5)' : 'rgba(42,11,92,.15)';
  ctx.lineWidth = lw * 0.8;
  ctx.stroke();
  if (dirty) {
    ctx.fillStyle = 'rgba(140,100,40,.55)';
    ctx.beginPath();
    ctx.arc(x - s * 0.12, y, s * 0.08, 0, TAU);
    ctx.arc(x + s * 0.14, y + s * 0.1, s * 0.06, 0, TAU);
    ctx.fill();
    return;
  }
  const n = parts.length;
  const is = s * (n <= 1 ? 0.62 : n === 2 ? 0.5 : 0.42);
  for (let i = 0; i < n; i++) {
    const a = n === 1 ? 0 : (i / n) * TAU - Math.PI / 2;
    const off = n === 1 ? 0 : s * 0.17;
    blitIng(ctx, parts[i], false, x + Math.cos(a) * off * 1.3, y - s * 0.02 + Math.sin(a) * off * 0.8, is);
  }
}

/* ------------------------------ personagens ------------------------------ */
const ROLE_COL: Record<Role, string> = { cook: '#ff5cc8', chopper: '#3ee07a', washer: '#5ef0ff', server: '#ffcf2e' };
const charCache = new Map<string, HTMLCanvasElement>();
const pose: PlayerPose = { t: 0, blink: 0, lookX: 0, lookY: 0.2, sx: 1, sy: 1, mood: 'idle', lx: -0.55, ly: -0.83, still: true };
/** bitmap do personagem com chapéu de chef (tamanho px) */
export function charSprite(skin: string, role: Role, px: number, happy = false, blink = false): HTMLCanvasElement {
  const key = skin + '|' + role + '|' + px + '|' + (happy ? 1 : 0) + (blink ? 1 : 0);
  let c = charCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = px;
  c.height = Math.round(px * 1.25);
  const x = c.getContext('2d')!;
  const R = px * 0.34;
  x.translate(px / 2, c.height - R * 1.15);
  pose.mood = happy ? 'happy' : 'idle';
  pose.blink = blink ? 1 : 0;
  try {
    drawPlayer(x, skinById(skin), R, pose);
  } catch {
    x.beginPath();
    x.arc(0, 0, R, 0, TAU);
    x.fillStyle = '#8a5cff';
    x.fill();
  }
  // chapéu de chef
  const hy = -R * 0.98;
  x.lineWidth = Math.max(1.5, R * 0.09);
  x.strokeStyle = INK;
  x.fillStyle = '#ffffff';
  x.beginPath();
  x.arc(-R * 0.32, hy - R * 0.32, R * 0.3, 0, TAU);
  x.arc(R * 0.32, hy - R * 0.32, R * 0.3, 0, TAU);
  x.arc(0, hy - R * 0.5, R * 0.36, 0, TAU);
  x.fill();
  x.stroke();
  x.beginPath();
  x.arc(-R * 0.32, hy - R * 0.32, R * 0.3 - x.lineWidth / 2, 0, TAU);
  x.arc(R * 0.32, hy - R * 0.32, R * 0.3 - x.lineWidth / 2, 0, TAU);
  x.arc(0, hy - R * 0.5, R * 0.36 - x.lineWidth / 2, 0, TAU);
  x.fill();
  rr(x, -R * 0.5, hy - R * 0.18, R, R * 0.3, R * 0.08);
  x.fillStyle = ROLE_COL[role];
  x.fill();
  x.stroke();
  charCache.set(key, c);
  if (charCache.size > 80) charCache.delete(charCache.keys().next().value!);
  return c;
}
export function clearArtCache(): void {
  charCache.clear();
}
