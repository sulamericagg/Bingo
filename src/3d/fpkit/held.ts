/* ============================================================
 *  FPKIT — HeldItem: "viewmodel" de qualquer Object3D preso à câmera (ferramenta, lanterna,
 *  picareta, prancheta...). Atraso de mola ao olhar, respiração parada, passo em "oito"
 *  sincronizado com speedK e golpes (swing/thrust/raise). Mesmas constantes da mão
 *  (3d/common/hand → Hand, que continua sendo o viewmodel da pata).
 * ============================================================ */
import type * as THREE from 'three';

/** mola amortecida (passo semi-implícito) — a mesma da Hand */
export class Spring {
  x = 0;
  v = 0;
  constructor(
    public k: number,
    public d: number,
  ) {}
  step(target: number, dt: number): number {
    const h = Math.max(0, Math.min(dt, 1 / 30));
    this.v += (target - this.x) * this.k * h;
    this.v *= Math.exp(-this.d * h);
    this.x += this.v * h;
    return this.x;
  }
}

export type HeldSwing = 'swing' | 'thrust' | 'raise';

export interface HeldItemOptions {
  /** posição de repouso no espaço da câmera */
  base?: [number, number, number];
  /** rotação de repouso (rad, XYZ) */
  rot?: [number, number, number];
  /** intensidade do atraso ao olhar / balanço de passo / respiração */
  lag?: number;
  bob?: number;
  idle?: number;
}

export class HeldItem {
  readonly base: [number, number, number];
  readonly rot: [number, number, number];
  lag: number;
  bob: number;
  idle: number;
  private lagX = new Spring(140, 13);
  private lagY = new Spring(140, 13);
  private t = 0;
  private walk = 0;
  private spd = 0;
  private sw: HeldSwing | '' = '';
  private st = 0;
  private sd = 0.3;
  constructor(
    readonly obj: THREE.Object3D,
    o: HeldItemOptions = {},
  ) {
    this.base = o.base ?? [0.24, -0.22, -0.5];
    this.rot = o.rot ?? [0, 0.3, 0];
    this.lag = o.lag ?? 1;
    this.bob = o.bob ?? 1;
    this.idle = o.idle ?? 1;
  }
  /** golpe/uso (dur em s) */
  swing(kind: HeldSwing = 'swing', dur = 0.32): void {
    this.sw = kind;
    this.st = 0;
    this.sd = dur;
  }
  get swinging(): boolean {
    return this.sw !== '';
  }
  /** speed 0..1 (FpController.speedK); look = giro do quadro (FpCamera.lookDX/lookDY) */
  update(dt: number, speed: number, lookDX: number, lookDY: number): void {
    dt = Math.max(0, Math.min(0.1, dt || 0));
    this.t += dt;
    this.spd += (speed - this.spd) * Math.min(1, dt * 6);
    const sp = this.spd;
    this.walk += dt * (5.2 + sp * 5) * (sp > 0.04 ? 1 : 0);
    const L = this.lag;
    const lx = Math.max(-0.07, Math.min(0.07, this.lagX.step(-lookDX * 0.9 * L, dt)));
    const ly = Math.max(-0.06, Math.min(0.06, this.lagY.step(lookDY * 0.9 * L, dt)));
    const I = this.idle * (1 - sp);
    const br = Math.sin(this.t * 1.7);
    const B = this.bob * sp;
    let x = lx + Math.sin(this.walk) * 0.02 * B + Math.sin(this.t * 0.73) * 0.004 * I;
    let y = ly - Math.abs(Math.cos(this.walk)) * 0.026 * B + 0.012 * B + br * 0.006 * I;
    let z = 0;
    let rx = 0;
    let rz = Math.sin(this.t * 0.9) * 0.025 * I + Math.sin(this.walk) * 0.05 * B - lx * 2.2;
    if (this.sw) {
      this.st += dt / this.sd;
      const p = Math.min(1, this.st);
      // antecipa (0..0.3), golpe (0.3..0.55), volta (0.55..1)
      const a = p < 0.3 ? p / 0.3 : p < 0.55 ? 1 - ((p - 0.3) / 0.25) * 2 : -1 + (p - 0.55) / 0.45;
      if (this.sw === 'swing') {
        rx += a * 0.6;
        y += a * 0.05;
        x -= Math.max(0, -a) * 0.04;
      } else if (this.sw === 'thrust') z -= Math.max(0, -a) * 0.12 - Math.max(0, a) * 0.03;
      else {
        y += Math.sin(p * Math.PI) * 0.12;
        rx -= Math.sin(p * Math.PI) * 0.4;
      }
      if (p >= 1) this.sw = '';
    }
    const b = this.base;
    this.obj.position.set(b[0] + x, b[1] + y, b[2] + z);
    this.obj.rotation.set(this.rot[0] + rx, this.rot[1], this.rot[2] + rz);
  }
}
