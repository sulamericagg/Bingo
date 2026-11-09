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
  /** ajuda extra das primeiras corridas (somada a st.assist) */
  assistBoost = 0;
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
    // eixo "para baixo" do chassi
    const ux = s;
    const uy = -c;
    const M = this.mass;
    const k = 38 * M * st.spring;
    const cd = 5 * M * st.damp;
    let fx = 0;
    let fy = -gravity * M;
    let tq = 0;
    const gas = inp.gas && fuelOk;
    const brake = inp.brake;
    let onG = 0;
    let impact = 0;

    for (let i = 0; i < 2; i++) {
      const wh = this.wheels[i];
      const px = this.x + wh.lx * c - this.mountY * s;
      const py = this.y + wh.lx * s + this.mountY * c;
      const r = wh.r + (this.hover ? 0.12 : 0);
      // "raio" da suspensão: sobe a roda até não penetrar o chão
      let sl = this.rest;
      let nx = 0;
      let ny = 1;
      let pen = 0;
      for (let it = 0; it < 3; it++) {
        const cx = px + ux * sl;
        const cy = py + uy * sl;
        const h = terrain.height(cx);
        const d = terrain.slope(cx);
        const inv = 1 / Math.sqrt(1 + d * d);
        nx = -d * inv;
        ny = inv;
        pen = r - (cy - h) * ny;
        if (pen <= 0) break;
        const un = -(ux * nx + uy * ny); // quanto a distância cresce por metro subindo
        sl -= pen / Math.max(0.3, un);
        if (sl < 0) {
          sl = 0;
          break;
        }
      }
      const cx = px + ux * sl;
      const cy = py + uy * sl;
      const touching = sl < this.rest - 0.001 || pen > -0.03;
      wh.ground = touching;
      const comp = this.rest - sl;
      const compRate = (comp - wh.comp) / dt;
      wh.comp = comp;
      wh.x = cx;
      wh.y = cy;
      if (!touching) {
        if (gas) wh.spin -= 18 * dt;
        continue;
      }
      onG++;
      // braço do ponto de contato
      const qx = cx - nx * r;
      const qy = cy - ny * r;
      const rx = qx - this.x;
      const ry = qy - this.y;
      // mola + amortecedor (só empurra)
      let F = k * comp + cd * compRate;
      if (F < 0) F = 0;
      if (F > 60 * M) F = 60 * M;
      if (compRate > 3) impact = Math.max(impact, compRate);
      const sfx = -ux * F;
      const sfy = -uy * F;
      // velocidade do ponto de contato
      const vpx = this.vx - this.w * ry;
      const vpy = this.vy + this.w * rx;
      const tx = ny;
      const ty = -nx;
      const vt = vpx * tx + vpy * ty;
      const N = Math.max(F * (-(ux * nx + uy * ny)), 0);
      const grip = st.grip * gripMul;
      const maxT = (N + gravity * M * 0.25) * grip * 1.3;
      let Ft = 0;
      if (gas) {
        if (vt < st.topSpeed) Ft = st.power * M * 0.5 * grip * Math.min(1, (st.topSpeed - vt) * 0.6);
      } else if (brake) {
        if (vt > 0.4) Ft = -st.power * M * 0.6;
        else if (fuelOk && vt > -st.topSpeed * 0.35) Ft = -st.power * M * 0.3;
      } else {
        Ft = -vt * M * (this.hover ? 0.15 : 0.6);
      }
      if (Ft > maxT) Ft = maxT;
      if (Ft < -maxT) Ft = -maxT;
      const tfx = Ft * tx;
      const tfy = Ft * ty;
      fx += sfx + tfx;
      fy += sfy + tfy;
      // torque: mola no ponto de fixação, tração no contato
      tq += (px - this.x) * sfy - (py - this.y) * sfx;
      tq += rx * tfy - ry * tfx;
      wh.spin -= (vt / wh.r) * dt;
      // fundo de curso: impulso para não atravessar
      if (sl === 0 && pen > 0) {
        this.y += pen * ny;
        this.x += pen * nx;
        const vn = vpx * nx + vpy * ny;
        if (vn < 0) {
          const rn = rx * ny - ry * nx;
          const j = (-(1 + 0.2) * vn) / (1 / M + (rn * rn) / this.inertia);
          this.vx += (j * nx) / M;
          this.vy += (j * ny) / M;
          this.w += (rn * j) / this.inertia;
          if (-vn > 3) impact = Math.max(impact, -vn);
        }
      }
    }

    this.vx += (fx / M) * dt;
    this.vy += (fy / M) * dt;
    this.w += (tq / this.inertia) * dt;

    // controle no ar / empinada no chão
    if (onG === 0) {
      const target = gas ? st.airTorque * 0.55 : brake ? -st.airTorque * 0.55 : this.w;
      this.w += (target - this.w) * dt * 2.2;
    }
    this.w *= 1 - 0.3 * dt;

    // ajuda "anti-capotar": puxa o carro de volta para o ângulo do chão (forte nas primeiras corridas)
    const asst = Math.min(1, st.assist + this.assistBoost);
    if (asst > 0) {
      const ga = Math.atan(terrain.slope(this.x));
      let diff = this.a - ga;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const lim = onG === 0 ? 0.35 : 0.8; // no chão só age em empinadas fortes
      if (Math.abs(diff) > lim) {
        const want = -Math.sign(diff) * Math.min(3.2, (Math.abs(diff) - lim) * 5);
        this.w += (want - this.w) * dt * 3.2 * asst;
      }
    }

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
