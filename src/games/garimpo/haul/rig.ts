/* ============================================================
 *  GARIMPO — CAVALO MECÂNICO + CARRETAS ARTICULADAS (física leve, sem alocação).
 *  Cavalo: modelo de bicicleta (entre-eixos, esterço que diminui com a velocidade,
 *  subesterço), força do motor por potência, freio, freio-motor, rampa, rolamento e ar.
 *  Carretas: cada uma presa no pino-rei (5ª roda do da frente): o eixo de trás não
 *  escorrega de lado → θ̇ = (V_pino · n) / L. Isso dá o "corte de curva" (off-tracking)
 *  de verdade. Engavetamento: frear forte descendo pesado empurra a articulação.
 * ============================================================ */
import { HALF, type Road } from './road';

const G = 9.81;
export interface Unit {
  /** eixo traseiro (cavalo) / eixo da carreta */
  x: number;
  z: number;
  y: number;
  yaw: number;
  pitch: number;
  /** comprimento pino-rei → eixo (carretas) */
  len: number;
  spin: number;
}
export interface RigInput {
  steer: number;
  gas: number;
  brake: number;
  /** modo simples: assistente de faixa + câmbio/freio ABS */
  simple: boolean;
  /** velocidade do piloto automático (m/s, 0 = desligado) */
  cruise: number;
}

const WB = 4.3; // entre-eixos do cavalo
const FW = 0.35; // 5ª roda à frente do eixo traseiro
export const LANE = -1.9; // faixa da direita (lat + = esquerda)

export class Rig {
  readonly tr: Unit = { x: 0, z: 0, y: 0, yaw: 0, pitch: 0, len: WB, spin: 0 };
  readonly tl: Unit[] = [];
  coupled = false;
  v = 0;
  gear = 1;
  steer = 0;
  s = 0;
  lat = 0;
  loadT = 0;
  dmg = 0;
  /** 0..1 risco de engavetar (HUD) */
  risk = 0;
  jack = false;
  offroad = 0;
  rpm = 0;
  private revT = 0;
  private proj = { s: 0, lat: 0 };
  private tmp = [0, 0, 0, 0, 0];
  /** chamado ao bater/sacudir (intensidade) */
  onHit: ((k: number) => void) | null = null;

  constructor(
    private road: Road,
    n: number,
    len: number,
  ) {
    for (let i = 0; i < n; i++) this.tl.push({ x: 0, z: 0, y: 0, yaw: 0, pitch: 0, len, spin: 0 });
  }

  get massT(): number {
    return 9 + this.tl.length * 6.5 * (this.coupled ? 1 : 0) + (this.coupled ? this.loadT : 0);
  }

  /** põe o cavalo em s (lat) e as carretas alinhadas atrás (gap = vão até o 1º pino) */
  placeAt(s: number, lat: number, gap = 0): void {
    const o = this.tmp;
    this.road.sample(s, o);
    const h = o[3];
    this.tr.x = o[0] + Math.cos(h) * lat;
    this.tr.z = o[2] - Math.sin(h) * lat;
    this.tr.yaw = h;
    this.v = 0;
    this.s = s;
    // carretas em fila atrás, seguindo a linha da estrada
    let ps = s + FW - gap;
    for (const u of this.tl) {
      const as = ps - u.len;
      this.road.sample(as, o);
      const kx = o[0] + Math.cos(o[3]) * lat;
      const kz = o[2] - Math.sin(o[3]) * lat;
      this.road.sample(ps, o);
      const px = o[0] + Math.cos(o[3]) * lat;
      const pz = o[2] - Math.sin(o[3]) * lat;
      u.x = kx;
      u.z = kz;
      u.yaw = Math.atan2(px - kx, pz - kz);
      ps = as;
    }
    this.jack = false;
    this.risk = 0;
    this.heights();
  }

  /** distância 5ª roda ↔ pino da 1ª carreta e diferença de ângulo (para engatar) */
  hitchGap(): [number, number] {
    const t = this.tr;
    const fx = t.x + Math.sin(t.yaw) * FW;
    const fz = t.z + Math.cos(t.yaw) * FW;
    const u = this.tl[0];
    if (!u) return [99, 0];
    const kx = u.x + Math.sin(u.yaw) * u.len;
    const kz = u.z + Math.cos(u.yaw) * u.len;
    let d = t.yaw - u.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    // sinal: + = 5ª roda ainda à frente do pino
    const along = (fx - kx) * Math.sin(u.yaw) + (fz - kz) * Math.cos(u.yaw);
    return [Math.hypot(fx - kx, fz - kz) * Math.sign(along || 1), d];
  }

  step(dt: number, inp: RigInput): void {
    const t = this.tr;
    const road = this.road;
    road.project(t.x, t.z, this.s, this.proj);
    this.s = this.proj.s;
    this.lat = this.proj.lat;
    const grade = road.grade(this.s) * Math.cos(this.relYaw());
    const m = this.massT * 1000;
    // ---- direção (assistente de faixa no simples) ----
    let st = inp.steer;
    if (inp.simple && this.v > 3 && this.s > 5) {
      road.sample(this.s + Math.max(8, this.v * 1.2), this.tmp);
      const want = LANE;
      const errLat = want - this.lat;
      let he = this.tmp[3] - t.yaw;
      he = Math.atan2(Math.sin(he), Math.cos(he));
      const assist = Math.max(-1, Math.min(1, -errLat * 0.07 - he * 2.2 - this.tmp[4] * 40));
      st = st + (1 - Math.min(1, Math.abs(st) * 1.6)) * assist;
    }
    this.steer += (st - this.steer) * Math.min(1, dt * (inp.simple ? 4 : 6));
    const maxA = 0.62 / (1 + Math.max(0, this.v) * 0.09);
    const delta = -this.steer * maxA;
    // ---- motor / freio ----
    let gas = inp.gas;
    let brake = inp.brake;
    if (inp.cruise > 0 && gas < 0.05 && brake < 0.05) {
      const e = inp.cruise - this.v;
      gas = Math.max(0, Math.min(1, e * 0.5));
      if (e < -1.5) brake = Math.min(0.5, -e * 0.1);
    }
    // ré automática: parado + freio segurado
    if (this.gear > 0 && brake > 0.1 && gas < 0.1 && this.v < 0.3) {
      this.revT += dt;
      if (this.revT > 0.35) this.gear = -1;
    } else if (this.gear < 0 && gas > 0.1 && this.v > -0.3) {
      this.revT += dt;
      if (this.revT > 0.2) this.gear = 1;
    } else this.revT = 0;
    if (this.gear < 0) {
      const g2 = gas;
      gas = brake;
      brake = g2;
    }
    const dir = this.gear < 0 ? -1 : 1;
    const av = Math.abs(this.v);
    let F = 0;
    if (gas > 0) {
      const P = 330000 * gas;
      F = Math.min(95000 * gas, P / Math.max(3, av)) * dir;
      if (dir < 0 && av > 3.2) F = 0;
    }
    // resistências
    const roll = 0.008 * m * G;
    const aero = 0.5 * 1.2 * (6 + this.tl.length * 0.8 * (this.coupled ? 1 : 0)) * this.v * Math.abs(this.v);
    let a = (F - Math.sign(this.v) * roll - aero) / m - G * grade;
    // freio (ABS no simples) + freio-motor
    const bk = Math.max(brake, gas < 0.05 && av > 1 ? 0.06 : 0);
    if (bk > 0) {
      const dec = bk * (inp.simple ? 6.5 : 7.5);
      if (av < dec * dt) {
        if (a * this.v <= 0 || av < 0.2) {
          this.v = 0;
          a = Math.abs(G * grade) < bk * 6 ? 0 : a;
        }
      } else a -= Math.sign(this.v) * dec;
    }
    // fora da pista: grama segura
    this.offroad = Math.max(0, Math.abs(this.lat) - HALF - 0.6);
    if (this.offroad > 0) a -= Math.sign(this.v) * Math.min(4, this.offroad * 1.2);
    // segura parado sem pedal (ladeira não arrasta o caminhão)
    if (gas < 0.05 && brake < 0.05 && Math.abs(this.v) < 0.6 && inp.cruise <= 0) {
      this.v = 0;
      a = 0;
    }
    this.v += a * dt;
    if (this.jack) this.v *= 1 - Math.min(1, dt * 2.5);
    // marcha (só para mostrar) e giro
    const sp = Math.abs(this.v) * 3.6;
    this.gear = this.gear < 0 ? -1 : Math.max(1, Math.min(12, 1 + Math.floor(sp / 9)));
    const band = (sp % 9) / 9;
    this.rpm += (Math.min(1, 0.25 + band * 0.6 + gas * 0.15) - this.rpm) * Math.min(1, dt * 5);
    // ---- cinemática ----
    const yr = (this.v / WB) * Math.tan(delta) / (1 + (this.v * this.v) / 900);
    t.yaw += yr * dt;
    const sx = Math.sin(t.yaw);
    const cz = Math.cos(t.yaw);
    t.x += sx * this.v * dt;
    t.z += cz * this.v * dt;
    t.spin += (this.v / 0.52) * dt;
    if (this.coupled) {
      // velocidade da 5ª roda: v·frente + ω × (FW·frente)
      let vx = sx * this.v + cz * yr * FW;
      let vz = cz * this.v - sx * yr * FW;
      let px = t.x + sx * FW;
      let pz = t.z + cz * FW;
      let prevYaw = t.yaw;
      // risco de engavetar: freio forte + descida + peso + velocidade
      const down = Math.max(0, -road.grade(this.s) - 0.025);
      const heavy = Math.min(1, this.loadT / 40 + this.tl.length * 0.12);
      this.risk = Math.max(0, Math.min(1, (brake - 0.55) * 2.2)) * Math.min(1, down * 30) * heavy * Math.min(1, (av - 8) / 10) * (inp.simple ? 0.6 : 1);
      for (let i = 0; i < this.tl.length; i++) {
        const u = this.tl[i];
        const nx = Math.cos(u.yaw);
        const nz = -Math.sin(u.yaw);
        let w = (vx * nx + vz * nz) / u.len;
        let art = prevYaw - u.yaw;
        art = Math.atan2(Math.sin(art), Math.cos(art));
        // a carreta empurra o cavalo: articulação cresce (instável) com risco alto
        if (i === 0 && this.risk > 0.15) w -= art * this.risk * 2.2 + (this.risk > 0.6 ? Math.sign(art || 1) * this.risk * 0.12 : 0);
        u.yaw += w * dt;
        // eixo segue o pino
        u.x = px - Math.sin(u.yaw) * u.len;
        u.z = pz - Math.cos(u.yaw) * u.len;
        // velocidade do eixo (sem escorregar de lado) = próxima 5ª roda
        const ux = Math.sin(u.yaw);
        const uz = Math.cos(u.yaw);
        const along = vx * ux + vz * uz;
        vx = ux * along;
        vz = uz * along;
        u.spin += (along / 0.5) * dt;
        px = u.x;
        pz = u.z;
        if (Math.abs(art) > 1.05 && !this.jack) {
          this.jack = true;
          this.dmg = Math.min(100, this.dmg + 22);
          this.onHit?.(1);
        }
        // limite físico da articulação (ré apertada)
        if (Math.abs(art) > 1.3) {
          u.yaw = prevYaw - Math.sign(art) * 1.3;
          u.x = (i === 0 ? t.x + sx * FW : this.tl[i - 1].x) - Math.sin(u.yaw) * u.len;
          u.z = (i === 0 ? t.z + cz * FW : this.tl[i - 1].z) - Math.cos(u.yaw) * u.len;
          if (this.v < 0) this.v *= 0.5;
        }
        prevYaw = u.yaw;
      }
    } else this.risk = 0;
    // batida no barranco fora da pista
    if (this.offroad > 2.5 && av > 6) {
      this.dmg = Math.min(100, this.dmg + dt * av * 0.4);
      this.onHit?.(0.3);
    }
    this.heights();
  }

  /** ângulo do cavalo relativo à estrada */
  relYaw(): number {
    this.road.sample(this.s, this.tmp);
    const d = this.tr.yaw - this.tmp[3];
    return Math.atan2(Math.sin(d), Math.cos(d));
  }

  private heights(): void {
    const road = this.road;
    const p = this.proj;
    const set = (u: Unit, fwd: number) => {
      road.project(u.x, u.z, this.s - fwd, p);
      road.sample(p.s, this.tmp);
      const yc = road.ground(p.s, p.lat, this.tmp[1]);
      u.y = Math.max(yc, this.tmp[1] - 3);
      u.pitch = -Math.atan(road.grade(p.s) * Math.cos(u.yaw - this.tmp[3]));
    };
    set(this.tr, 0);
    let back = 0;
    for (const u of this.tl) {
      back += u.len;
      set(u, back);
    }
    road.project(this.tr.x, this.tr.z, this.s, p);
  }
}
