/**
 * Mola criticamente amortecida (solução exata — estável para qualquer dt).
 * Sem "atraso de lerp": acelera e para suavemente, sem ultrapassar o alvo.
 */
export class Spring2 {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  /** ω (rad/s). ~28 → assenta em ~0,15 s */
  constructor(public omega = 28) {}
  step(tx: number, ty: number, dt: number): void {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.1);
    const w = this.omega;
    const e = Math.exp(-w * dt);
    const yx = this.x - tx,
      cx = this.vx + w * yx;
    this.x = tx + (yx + cx * dt) * e;
    this.vx = (this.vx - w * cx * dt) * e;
    const yy = this.y - ty,
      cy = this.vy + w * yy;
    this.y = ty + (yy + cy * dt) * e;
    this.vy = (this.vy - w * cy * dt) * e;
    if (Math.abs(this.x - tx) < 1e-4 && Math.abs(this.vx) < 1e-3) (this.x = tx), (this.vx = 0);
    if (Math.abs(this.y - ty) < 1e-4 && Math.abs(this.vy) < 1e-3) (this.y = ty), (this.vy = 0);
  }
  reset(x = 0, y = 0): void {
    this.x = x;
    this.y = y;
    this.vx = this.vy = 0;
  }
}
