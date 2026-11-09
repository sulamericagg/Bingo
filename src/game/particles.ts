import { glow } from './sprites';
import { TAU } from './math';

export const enum PType {
  Glow,
  Star,
  Heart,
  Confetti,
  Bubble,
  Spark,
  Ring,
  Chunk,
}

export interface Particle {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  size2: number;
  color: string;
  type: PType;
  rot: number;
  vr: number;
  drag: number;
  grav: number;
  additive: boolean;
}

/** Pool fixo: zero alocação durante o jogo. */
export class Particles {
  private pool: Particle[] = [];
  private cursor = 0;
  budget = 1;

  constructor(n = 700) {
    for (let i = 0; i < n; i++)
      this.pool.push({ alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, size2: 0, color: '#fff', type: PType.Glow, rot: 0, vr: 0, drag: 0, grav: 0, additive: true });
  }

  spawn(o: Partial<Particle> & { x: number; y: number }): Particle | null {
    if (this.budget < 1 && Math.random() > this.budget) return null;
    const n = this.pool.length;
    for (let k = 0; k < n; k++) {
      const p = this.pool[(this.cursor + k) % n];
      if (!p.alive) {
        this.cursor = (this.cursor + k + 1) % n;
        p.alive = true;
        p.x = o.x;
        p.y = o.y;
        p.vx = o.vx ?? 0;
        p.vy = o.vy ?? 0;
        p.max = p.life = o.life ?? 0.6;
        p.size = o.size ?? 4;
        p.size2 = o.size2 ?? 0;
        p.color = o.color ?? '#ffffff';
        p.type = o.type ?? PType.Glow;
        p.rot = o.rot ?? Math.random() * TAU;
        p.vr = o.vr ?? 0;
        p.drag = o.drag ?? 0;
        p.grav = o.grav ?? 0;
        p.additive = o.additive ?? true;
        return p;
      }
    }
    return null;
  }

  burst(x: number, y: number, n: number, colors: string[], speed: number, o: Partial<Particle> = {}): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.spawn({
        life: 0.4 + Math.random() * 0.5,
        size: 2 + Math.random() * 4,
        drag: 3,
        ...o,
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        color: colors[i % colors.length],
      });
    }
  }

  clear(): void {
    for (const p of this.pool) p.alive = false;
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        continue;
      }
      const d = 1 / (1 + p.drag * dt);
      p.vx *= d;
      p.vy = p.vy * d + p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  }

  draw(x: CanvasRenderingContext2D): void {
    for (let pass = 0; pass < 2; pass++) {
      const add = pass === 1;
      x.globalCompositeOperation = add ? 'lighter' : 'source-over';
      for (const p of this.pool) {
        if (!p.alive || p.additive !== add) continue;
        const t = p.life / p.max;
        const s = p.size * (p.type === PType.Ring ? 1 : 0.4 + 0.6 * t);
        x.globalAlpha = Math.min(1, t * 1.6);
        switch (p.type) {
          case PType.Glow: {
            const g = glow(p.color, 32);
            x.drawImage(g, p.x - s * 2, p.y - s * 2, s * 4, s * 4);
            break;
          }
          case PType.Spark: {
            x.strokeStyle = p.color;
            x.lineWidth = s * 0.5;
            x.lineCap = 'round';
            x.beginPath();
            x.moveTo(p.x, p.y);
            x.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
            x.stroke();
            break;
          }
          case PType.Ring: {
            const k = 1 - t;
            x.strokeStyle = p.color;
            x.lineWidth = Math.max(0.5, p.size2 * t);
            x.beginPath();
            x.arc(p.x, p.y, p.size + k * p.size * 2.2, 0, TAU);
            x.stroke();
            break;
          }
          case PType.Bubble: {
            x.strokeStyle = p.color;
            x.lineWidth = 1.2;
            x.beginPath();
            x.arc(p.x, p.y, s, 0, TAU);
            x.stroke();
            x.fillStyle = 'rgba(255,255,255,0.6)';
            x.beginPath();
            x.arc(p.x - s * 0.35, p.y - s * 0.35, s * 0.25, 0, TAU);
            x.fill();
            break;
          }
          default: {
            x.save();
            x.translate(p.x, p.y);
            x.rotate(p.rot);
            x.fillStyle = p.color;
            if (p.type === PType.Star) {
              x.beginPath();
              for (let i = 0; i < 10; i++) {
                const a = (i / 10) * TAU;
                const r = i % 2 ? s * 0.45 : s;
                x.lineTo(Math.cos(a) * r, Math.sin(a) * r);
              }
              x.closePath();
              x.fill();
            } else if (p.type === PType.Heart) {
              x.beginPath();
              x.moveTo(0, s * 0.35);
              x.bezierCurveTo(-s * 1.1, -s * 0.4, -s * 0.4, -s * 1.1, 0, -s * 0.4);
              x.bezierCurveTo(s * 0.4, -s * 1.1, s * 1.1, -s * 0.4, 0, s * 0.35);
              x.fill();
            } else if (p.type === PType.Confetti) {
              x.fillRect(-s * 0.6, -s * 0.3, s * 1.2, s * 0.6);
            } else {
              x.beginPath();
              x.moveTo(-s, -s * 0.6);
              x.lineTo(s * 0.8, -s * 0.8);
              x.lineTo(s, s * 0.7);
              x.lineTo(-s * 0.7, s);
              x.closePath();
              x.fill();
            }
            x.restore();
          }
        }
      }
    }
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'source-over';
  }
}
