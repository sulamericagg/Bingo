/* ============================================================
 *  RALLY LUNAR — física do carrinho (passo fixo, sem alocação)
 *  Chassi rígido + 2 rodas presas por molas (suspensão) ao longo do eixo
 *  "para baixo" do chassi; mola lateral dura mantém a roda no lugar.
 *  Metros, y para cima, ângulo anti-horário.
 * ============================================================ */
import type { CarStats, VehicleDef } from './data';
import type { Terrain } from './terrain';

export const DT = 1 / 120;

export interface Wheel {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  spin: number;
  ground: boolean;
  lx: number; // posição local da fixação
  comp: number; // compressão visual (m)
}

export interface Input {
  gas: boolean;
  brake: boolean;
}

// pontos do chassi (locais) testados contra o chão: frente/trás baixo e topo + cabeça
const HULL_X = [-1, 1, -0.75, 0.75, 0];
const HULL_Y = [0.05, 0.05, 0.7, 0.7, 1.15];

export class Car {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  a = 0;
  w = 0;
  mass = 1;
  inertia = 1;
  wheels: Wheel[];
  def: VehicleDef;
  st: CarStats;
  hover: boolean;
  /** escala de tamanho (monstro) */
  rest = 0.45;
  mountY = -0.1;
  halfLen = 1.2;

  // estado de jogo
  airTime = 0;
  airRot = 0;
  roofTime = 0;
  crashed = false;
  headHit = false;
  grounded = false;
  landed = 0; // impacto do último pouso (para efeitos)
  wheelsOnGround = 0;

  constructor(def: VehicleDef, st: CarStats) {
    this.def = def;
    this.st = st;
    this.hover = def.shape === 'hover';
    this.mass = def.mass;
    this.inertia = def.mass * 0.9;
    this.halfLen = def.wheelBase + 0.25;
    this.rest = def.shape === 'monster' ? 0.6 : 0.45;
    this.mountY = def.shape === 'monster' ? -0.05 : -0.1;
    const mk = (lx: number): Wheel => ({ x: 0, y: 0, vx: 0, vy: 0, r: def.wheelR, spin: 0, ground: false, lx, comp: 0 });
    this.wheels = [mk(-def.wheelBase), mk(def.wheelBase)];
  }

  place(x: number, terrain: Terrain): void {
    const g = terrain.height(x);
    this.x = x;
    this.y = g + this.wheels[0].r + this.rest - this.mountY + 0.05;
    this.vx = this.vy = this.w = 0;
    this.a = Math.atan(terrain.slope(x));
    this.crashed = false;
    this.airTime = this.airRot = this.roofTime = 0;
    for (const wh of this.wheels) {
      const c = Math.cos(this.a);
      const s = Math.sin(this.a);
      const ly = this.mountY - this.rest;
      wh.x = this.x + wh.lx * c - ly * s;
      wh.y = this.y + wh.lx * s + ly * c;
      wh.vx = wh.vy = 0;
    }
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vy);
  }

  /** um passo fixo. `fuelOk` = motor funciona */
  step(inp: Input, terrain: Terrain, gravity: number, gripMul: number, fuelOk: boolean): void {
    const dt = DT;
    const st = this.st;
    const c = Math.cos(this.a);
    const s = Math.sin(this.a);
    // eixo para baixo do chassi (local (0,-1))
    const ux = s;
    const uy = -c;
    const M = this.mass;
    const mw = 0.14 * M;
    const k = 260 * M * st.spring;
    const cd = 15 * M * st.damp;
    const kl = 2600 * M;
    const cl = 45 * M;
    let fx = 0;
    let fy = -gravity * M;
    let tq = 0;
    const gas = inp.gas && fuelOk;
    const brake = inp.brake;
    let onG = 0;

    for (let i = 0; i < 2; i++) {
      const wh = this.wheels[i];
      // ponto de fixação no mundo
      const px = this.x + wh.lx * c - this.mountY * s;
      const py = this.y + wh.lx * s + this.mountY * c;
      const rx = px - this.x;
      const ry = py - this.y;
      // velocidade do ponto
      const pvx = this.vx - this.w * ry;
      const pvy = this.vy + this.w * rx;
      const dx = wh.x - px;
      const dy = wh.y - py;
      const along = dx * ux + dy * uy;
      const latx = dx - along * ux;
      const laty = dy - along * uy;
      const rvx = wh.vx - pvx;
      const rvy = wh.vy - pvy;
      const rva = rvx * ux + rvy * uy;
      // mola da suspensão (+ batente)
      let f = -k * (along - this.rest) - cd * rva;
      if (along < 0.12) f += (0.12 - along) * k * 6;
      if (along > this.rest + 0.35) f -= (along - this.rest - 0.35) * k * 6;
      wh.comp = this.rest - along;
      // mola lateral dura
      const rvlx = rvx - rva * ux;
      const rvly = rvy - rva * uy;
      const flx = -kl * latx - cl * rvlx;
      const fly = -kl * laty - cl * rvly;
      const Fx = f * ux + flx;
      const Fy = f * uy + fly;
      // aplica na roda
      wh.vx += (Fx / mw) * dt;
      wh.vy += ((Fy - gravity * mw) / mw) * dt;
      // reação no chassi
      fx -= Fx;
      fy -= Fy;
      tq += rx * -Fy - ry * -Fx;
    }

    // integra chassi
    this.vx += (fx / M) * dt;
    this.vy += (fy / M) * dt;
    this.w += (tq / this.inertia) * dt;

    // contato das rodas com o chão
    let impact = 0;
    for (let i = 0; i < 2; i++) {
      const wh = this.wheels[i];
      wh.x += wh.vx * dt;
      wh.y += wh.vy * dt;
      const h = terrain.height(wh.x);
      const sl = terrain.slope(wh.x);
      const inv = 1 / Math.sqrt(1 + sl * sl);
      const nx = -sl * inv;
      const ny = inv;
      const r = wh.r + (this.hover ? 0.12 : 0);
      const dist = (wh.y - h) * ny;
      wh.ground = dist < r + 0.03;
      if (dist < r) {
        onG++;
        wh.x += nx * (r - dist);
        wh.y += ny * (r - dist);
        const tx = ny;
        const ty = -nx;
        let vn = wh.vx * nx + wh.vy * ny;
        let vt = wh.vx * tx + wh.vy * ty;
        if (vn < 0) {
          if (vn < -3) impact = Math.max(impact, -vn);
          vn = -vn * 0.08;
        }
        // tração
        const grip = st.grip * gripMul;
        const acc = st.power * grip * dt * (this.hover ? 1.1 : 1);
        if (gas) {
          if (vt < st.topSpeed) vt = Math.min(st.topSpeed, vt + acc);
        } else if (brake) {
          if (vt > 0.3) vt = Math.max(-0.2, vt - acc * 1.6);
          else if (fuelOk) vt = Math.max(-st.topSpeed * 0.35, vt - acc * 0.6);
        } else {
          // rolamento livre + atrito leve
          vt -= vt * 0.12 * dt * (this.hover ? 0.4 : 1);
        }
        // deslize lateral em gelo: tração limitada já pelo grip
        wh.vx = vn * nx + vt * tx;
        wh.vy = vn * ny + vt * ty;
      }
      // giro visual
      const tvel = wh.vx * Math.cos(this.a) + wh.vy * Math.sin(this.a);
      if (wh.ground) wh.spin -= (tvel / wh.r) * dt;
      else if (gas) wh.spin -= 18 * dt;
      else if (brake) wh.spin *= 0.98;
    }

    // controle no ar / empinada no chão
    if (onG === 0) {
      const target = gas ? st.airTorque : brake ? -st.airTorque : 0;
      this.w += (target - this.w * 0.25) * dt * 1.6;
    } else {
      if (gas) this.w += 2.2 * dt; // empina de leve
      if (brake && this.speed > 1) this.w -= 1.6 * dt;
    }
    this.w *= 1 - 0.4 * dt;

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.a += this.w * dt;

    // colisão do casco
    this.headHit = false;
    let roof = false;
    const c2 = Math.cos(this.a);
    const s2 = Math.sin(this.a);
    for (let i = 0; i < HULL_X.length; i++) {
      const lx = HULL_X[i] * this.halfLen * (i === 4 ? 0 : 1);
      const ly = HULL_Y[i];
      const qx = this.x + lx * c2 - ly * s2;
      const qy = this.y + lx * s2 + ly * c2;
      const h = terrain.height(qx);
      if (qy < h + 0.02) {
        if (i >= 2) roof = true;
        if (i === 4) this.headHit = true;
        const pen = h + 0.02 - qy;
        this.y += pen;
        const rx = qx - this.x;
        const ry = qy - this.y;
        const pvy = this.vy + this.w * rx;
        if (pvy < 0) {
          const rn = rx; // braço para normal (0,1)
          const j = (-(1 + 0.25) * pvy) / (1 / M + (rn * rn) / this.inertia);
          this.vy += j / M;
          this.w += (rx * j) / this.inertia;
          // atrito do casco
          this.vx *= 0.97;
          if (-pvy > 3) impact = Math.max(impact, -pvy);
        }
        for (const wh of this.wheels) wh.y += pen;
      }
    }

    // estado
    this.wheelsOnGround = onG;
    const upsideDown = Math.cos(this.a) < -0.2;
    if (roof && upsideDown) this.roofTime += dt;
    else this.roofTime = Math.max(0, this.roofTime - dt * 2);
    if (this.headHit && upsideDown) this.roofTime += dt * 4;
    this.landed = impact;
    if (onG === 0 && !roof) {
      this.airTime += dt;
      this.airRot += this.w * dt;
      this.grounded = false;
    } else {
      this.grounded = true;
    }
  }
}
