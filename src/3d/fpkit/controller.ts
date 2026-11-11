/* ============================================================
 *  FPKIT — FpController: entrada → velocidade (aceleração/frenagem exponencial da Cozinha)
 *  → movimento com colisão plugável (grade: desliza eixo a eixo; caixas/malha: sweep).
 *  Opcional: corrida, pulo, gravidade, chão por altura (HeightGround) e empurrão entre jogadores.
 *  Sem THREE, sem DOM: só números (dá para rodar no servidor/bot).
 * ============================================================ */
import type { FpCollider, SweepResult } from './collide';
import type { HeightGround } from './ground';
import { fpTuning, type FpTuning } from './tuning';

export interface FpMoveInput {
  /** direcional: x = direita, y = FRENTE (−1..1, módulo ≤ 1) — FpsControls.dir() */
  x: number;
  y: number;
  sprint?: boolean;
  /** pulo (borda de subida é tratada pelo chamador ou use jump()) */
  jump?: boolean;
}

const SW: SweepResult = { x: 0, z: 0, hitX: false, hitZ: false };

export class FpController {
  x = 0;
  z = 0;
  /** altura dos PÉS (0 em mundo plano) */
  y = 0;
  vx = 0;
  vz = 0;
  vy = 0;
  grounded = true;
  /** 0..1 — |v| / velocidade-alvo do quadro (alimenta balanço da câmera, mão, passos) */
  speedK = 0;
  /** força a resposta (1/s) neste quadro (piso escorregadio, gravidade zero...). null = accel/decel */
  accelOverride: number | null = null;
  /** velocidade-alvo usada no último steer() */
  curSpeed = 0;
  tune: FpTuning;
  constructor(
    tune: FpTuning | Readonly<FpTuning> = fpTuning(),
    public collider: FpCollider | null = null,
    public ground: HeightGround | null = null,
  ) {
    this.tune = { ...tune };
  }
  place(x: number, z: number, y = this.y): void {
    this.x = x;
    this.z = z;
    this.y = y;
    this.vx = this.vz = this.vy = 0;
  }
  stop(): void {
    this.vx = this.vz = this.vy = 0;
    this.speedK = 0;
  }
  /** fase 1: direcional + yaw → velocidade horizontal (sem mover) */
  steer(dt: number, mx: number, my: number, yaw: number, sprint = false): void {
    const t = this.tune;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const sp = sprint ? t.speed * t.sprintMul : t.speed;
    this.curSpeed = sp;
    const tvx = (fx * my + rx * mx) * sp;
    const tvz = (fz * my + rz * mx) * sp;
    let k = this.accelOverride ?? (mx || my ? t.accel : t.decel);
    if (!this.grounded && t.gravity > 0) k *= t.airControl;
    this.vx += (tvx - this.vx) * Math.min(1, dt * k);
    this.vz += (tvz - this.vz) * Math.min(1, dt * k);
  }
  /** pula se estiver no chão (precisa de tuning.jumpV > 0) */
  jump(): boolean {
    if (!this.grounded || !(this.tune.jumpV > 0)) return false;
    this.vy = this.tune.jumpV;
    this.grounded = false;
    return true;
  }
  private free(x: number, z: number): boolean {
    const c = this.collider;
    if (c?.isFree && !c.isFree(x, z, this.tune.radius)) return false;
    const g = this.ground;
    return !g || g.canWalk(this.x, this.z, x, z, this.y);
  }
  /** fase 2: aplica a velocidade com colisão (+ gravidade/chão) e atualiza speedK */
  move(dt: number): void {
    const t = this.tune;
    const dx = this.vx * dt;
    const dz = this.vz * dt;
    const c = this.collider;
    if (c && !c.isFree && c.sweep) {
      c.sweep(this.x, this.z, this.x + dx, this.z + dz, t.radius, SW);
      if (SW.hitX) this.vx *= -t.bounce;
      if (SW.hitZ) this.vz *= -t.bounce;
      if (!this.ground || this.ground.canWalk(this.x, this.z, SW.x, SW.z, this.y)) {
        this.x = SW.x;
        this.z = SW.z;
      } else this.vx = this.vz = 0;
    } else {
      // desliza eixo a eixo (moveGrid da Cozinha)
      if (this.free(this.x + dx, this.z)) this.x += dx;
      else this.vx *= -t.bounce;
      if (this.free(this.x, this.z + dz)) this.z += dz;
      else this.vz *= -t.bounce;
    }
    // vertical
    if (this.ground) this.ground.settle(this, dt, t.gravity, this.x, this.z);
    else if (t.gravity > 0 || this.y > 0) {
      if (!this.grounded || this.vy > 0) {
        this.vy -= t.gravity * dt;
        this.y += this.vy * dt;
        if (this.y <= 0) {
          this.y = 0;
          this.vy = 0;
          this.grounded = true;
        }
      }
    }
    this.speedK = Math.min(1, Math.hypot(this.vx, this.vz) / (this.curSpeed || t.speed));
  }
  /** empurrão suave de outro corpo em (ox, oz) — chame para cada colega depois de move() */
  pushAway(ox: number, oz: number): void {
    const t = this.tune;
    const dx = this.x - ox;
    const dz = this.z - oz;
    const d = Math.hypot(dx, dz);
    if (d > 0.01 && d < t.pushRadius) {
      const push = (t.pushRadius - d) * t.pushK;
      const ax = this.x + (dx / d) * push;
      const az = this.z + (dz / d) * push;
      if (this.free(ax, this.z)) this.x = ax;
      if (this.free(this.x, az)) this.z = az;
    }
  }
  /** tudo de uma vez: direcional → velocidade → pulo → movimento */
  update(dt: number, inp: FpMoveInput, yaw: number): void {
    this.steer(dt, inp.x, inp.y, yaw, !!inp.sprint);
    if (inp.jump) this.jump();
    this.move(dt);
  }
}
