/* ============================================================
 *  RASTROS — emissão de partículas atrás do personagem em voo.
 *  Chame a cada frame enquanto voa; o throttle (~70 Hz) é interno.
 *  Partículas passam por `fx.spawn`, que já respeita `fx.budget`.
 * ============================================================ */
import { rand } from './math';
import { PType, type Particles } from './particles';
import type { Trail } from './skins';

interface EmitState {
  last: number;
  n: number;
  /** pontos anteriores das fitas (neon): [x0, y0, x1, y1] */
  rib: number[];
  ribOk: boolean;
}

const states = new WeakMap<Particles, EmitState>();

function st(fx: Particles): EmitState {
  let s = states.get(fx);
  if (!s) {
    s = { last: -1, n: 0, rib: [0, 0, 0, 0], ribOk: false };
    states.set(fx, s);
  }
  return s;
}

/**
 * @param x,y   centro do personagem (px)
 * @param vx,vy velocidade do personagem (px/s)
 * @param time  relógio do jogo em segundos (monotônico)
 * @param pr    raio do personagem (px)
 */
export function emitTrail(fx: Particles, trail: Trail, x: number, y: number, vx: number, vy: number, time: number, pr: number): void {
  const S = st(fx);
  const gap = time - S.last;
  if (S.last >= 0 && gap >= 0 && gap < 0.014) return;
  if (gap < 0 || gap > 0.12) S.ribOk = false;
  S.last = time;
  S.n++;

  const c = trail.colors;
  const col = c[Math.floor(Math.random() * c.length)];
  const back = Math.atan2(-vy, -vx);
  const bx = x + Math.cos(back) * pr * 0.6;
  const by = y + Math.sin(back) * pr * 0.6;
  const nx = Math.cos(back + Math.PI / 2);
  const ny = Math.sin(back + Math.PI / 2);
  const side = rand(-1, 1);
  const ox = nx * side * 5;
  const oy = ny * side * 5;

  switch (trail.id) {
    /* ---------------- clássicos (mesmo visual de antes) ---------------- */
    case 'spark':
      fx.spawn({ x: bx + ox, y: by + oy, vx: rand(-30, 30), vy: rand(-30, 30), life: 0.45, size: rand(3, 6), color: col, drag: 2 });
      break;
    case 'bubbles':
      if (Math.random() < 0.5) fx.spawn({ x: bx + ox * 2, y: by + oy * 2, vx: rand(-20, 20), vy: rand(-40, 0), life: 0.8, size: rand(3, 7), color: col, type: PType.Bubble, additive: false });
      break;
    case 'fire':
      fx.spawn({ x: bx + ox, y: by + oy, vx: rand(-40, 40), vy: rand(-80, -20), life: 0.4, size: rand(5, 9), color: col, drag: 3 });
      break;
    case 'stars':
      fx.spawn({ x: bx + ox * 2, y: by + oy * 2, vx: rand(-30, 30), vy: rand(-30, 30), life: 0.7, size: rand(3, 6), color: col, type: PType.Star, vr: rand(-6, 6), drag: 2 });
      break;
    case 'hearts':
      if (Math.random() < 0.6) fx.spawn({ x: bx + ox * 2, y: by + oy * 2, vx: rand(-20, 20), vy: rand(-50, -10), life: 0.8, size: rand(4, 7), color: col, type: PType.Heart, rot: 0, additive: false });
      break;
    case 'confetti':
      fx.spawn({ x: bx + ox * 2, y: by + oy * 2, vx: rand(-60, 60), vy: rand(-60, 60), life: 0.9, size: rand(3, 5), color: col, type: PType.Confetti, vr: rand(-10, 10), grav: 120, drag: 2, additive: false });
      break;
    case 'rainbow': {
      for (let i = 0; i < 3; i++) {
        const k = (i - 1) * 4;
        const cc = c[(Math.floor(time * 20) + i) % c.length];
        fx.spawn({ x: bx + nx * k, y: by + ny * k, life: 0.35, size: 4, color: cc, drag: 0 });
      }
      break;
    }
    case 'lightning':
      fx.spawn({ x: bx + ox, y: by + oy, vx: rand(-200, 200), vy: rand(-200, 200), life: 0.18, size: rand(2, 4), color: col, type: PType.Spark, drag: 1 });
      fx.spawn({ x: bx, y: by, life: 0.3, size: 5, color: '#7df9ff', drag: 0 });
      break;

    /* ---------------- novos ---------------- */
    case 'smoke':
      fx.spawn({ x: bx + ox, y: by + oy, vx: -vx * 0.04 + rand(-15, 15), vy: -vy * 0.04 + rand(-25, 5), life: 0.9, size: rand(4, 7), color: col, type: PType.Smoke, drag: 1.5, additive: false });
      break;
    case 'petals':
      if (Math.random() < 0.55)
        fx.spawn({ x: bx + ox * 2, y: by + oy * 2, vx: rand(-25, 25), vy: rand(-15, 25), life: 1.1, size: rand(3.5, 5.5), color: col, type: PType.Petal, vr: rand(-5, 5), grav: 30, drag: 1.5, additive: false });
      if (S.n % 3 === 0) fx.spawn({ x: bx, y: by, life: 0.3, size: 2.5, color: '#ffd1e6', drag: 0 });
      break;
    case 'notes':
      fx.spawn({ x: bx + ox * 0.5, y: by + oy * 0.5, life: 0.35, size: 2.4, color: col, drag: 0 });
      if (Math.random() < 0.28)
        fx.spawn({ x: bx + ox * 2, y: by + oy * 2, vx: nx * side * 30 + rand(-10, 10), vy: rand(-55, -20), life: 1.0, size: rand(5, 7.5), color: col, type: PType.Note, rot: rand(-0.3, 0.3), drag: 1, additive: false });
      break;
    case 'pixels': {
      const g = 4;
      fx.spawn({ x: Math.round((bx + ox) / g) * g, y: Math.round((by + oy) / g) * g, life: 0.6, size: rand(4, 6), color: col, type: PType.Pixel, drag: 0, additive: false });
      if (S.n % 2 === 0) fx.spawn({ x: bx + ox * 2, y: by + oy * 2, vx: nx * side * 40, vy: ny * side * 40, life: 0.45, size: 3, color: c[(S.n >> 1) % c.length], type: PType.Pixel, drag: 3, additive: false });
      break;
    }
    case 'comet':
      fx.spawn({ x: bx, y: by, vx: -vx * 0.1, vy: -vy * 0.1, life: 0.22, size: 6, color: '#ffffff', drag: 0 });
      fx.spawn({ x: bx + ox * 0.6, y: by + oy * 0.6, vx: -vx * 0.15, vy: -vy * 0.15, life: 0.55, size: rand(5, 8), color: col, drag: 0.5 });
      if (Math.random() < 0.45)
        fx.spawn({ x: bx + ox, y: by + oy, vx: -vx * 0.3 + rand(-60, 60), vy: -vy * 0.3 + rand(-60, 60), life: 0.35, size: rand(1.5, 3), color: c[1], type: PType.Spark, drag: 2 });
      break;
    case 'brasil': {
      for (let i = 0; i < 2; i++) {
        const k = (i - 0.5) * 6;
        fx.spawn({ x: bx + nx * k, y: by + ny * k, life: 0.4, size: 3.6, color: c[i], drag: 0 });
      }
      if (Math.random() < 0.35)
        fx.spawn({ x: bx + ox * 2, y: by + oy * 2, vx: rand(-60, 60), vy: rand(-60, 60), life: 0.9, size: rand(3, 5), color: c[2 + (S.n % 2)], type: PType.Confetti, vr: rand(-10, 10), grav: 120, drag: 2, additive: false });
      if (S.n % 6 === 0) fx.spawn({ x: bx + ox * 2, y: by + oy * 2, vx: rand(-20, 20), vy: rand(-20, 20), life: 0.7, size: 4, color: c[1], type: PType.Star, vr: rand(-6, 6), drag: 2 });
      break;
    }
    case 'nebula':
      if (S.n % 2 === 0) fx.spawn({ x: bx + ox * 1.5, y: by + oy * 1.5, vx: rand(-12, 12), vy: rand(-12, 12), life: 0.9, size: rand(4.5, 7), color: col, drag: 1 });
      else fx.spawn({ x: bx + ox * 2.5, y: by + oy * 2.5, vx: rand(-25, 25), vy: rand(-25, 25), life: 0.6, size: rand(2, 3.5), color: c[(S.n >> 1) % c.length], drag: 2 });
      if (Math.random() < 0.4) fx.spawn({ x: bx + ox * 3, y: by + oy * 3, vx: rand(-20, 20), vy: rand(-20, 20), life: 0.8, size: rand(1.8, 3), color: '#ffffff', type: PType.Star, vr: rand(-4, 4), drag: 2 });
      break;
    case 'neon': {
      const ph = time * 14;
      const R = S.rib;
      for (let k = 0; k < 2; k++) {
        const off = Math.sin(ph + k * Math.PI) * 6;
        const px = bx + nx * off;
        const py = by + ny * off;
        if (S.ribOk) {
          const dx = R[k * 2] - px;
          const dy = R[k * 2 + 1] - py;
          const len = Math.hypot(dx, dy);
          if (len < 60) {
            const rot = Math.atan2(dy, dx);
            fx.spawn({ x: px, y: py, life: 0.5, size: 3.4, size2: len, rot, color: c[k], type: PType.Ribbon, drag: 0 });
            fx.spawn({ x: px, y: py, life: 0.3, size: 1.2, size2: len, rot, color: c[2] ?? '#ffffff', type: PType.Ribbon, drag: 0 });
          }
        }
        R[k * 2] = px;
        R[k * 2 + 1] = py;
      }
      S.ribOk = true;
      if (S.n % 4 === 0) fx.spawn({ x: bx + ox, y: by + oy, vx: rand(-30, 30), vy: rand(-30, 30), life: 0.4, size: 2.5, color: col, drag: 2 });
      break;
    }
  }
}
