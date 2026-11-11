/* ============================================================
 *  GARIMPO BRUTO — física de veículo própria (rodas por raio no campo de alturas).
 *  Corpo rígido (posição, quaternion, velocidade, velocidade angular) + molas por roda,
 *  atrito com círculo de aderência, diferencial aberto/bloqueado, 2H/4H/4L, câmbio
 *  automático ou H manual, calibragem dos pneus, lama (menos aderência + sulcos que afundam).
 *  Esteiras (trator/escavadeira) = várias rodas com direção por diferença de velocidade.
 *  Sem alocações por quadro: vetores temporários do módulo.
 * ============================================================ */
import * as THREE from 'three';
import { MAT_GRIP, type Terrain } from './terrain';

export interface WheelDef {
  x: number;
  y: number;
  z: number;
  r: number;
  /** fator de esterço (1 dianteira, 0 fixa) */
  steer: number;
  axle: number;
  /** +1 = lado +x (esquerda do motorista), -1 = direita */
  side: 1 | -1;
}
export interface VehSpec {
  mass: number;
  /** largura, altura, comprimento (inércia e colisão) */
  dims: [number, number, number];
  wheels: WheelDef[];
  rest: number;
  travel: number;
  /** compressão estática desejada (m) */
  sag: number;
  tracked: boolean;
  steerMax: number;
  /** força de tração na 1ª marcha (N) */
  force: number;
  /** velocidade máxima por marcha (m/s): [ré, 1ª..6ª] */
  tops: number[];
  /** eixos tracionados em 2H e em 4H/4L */
  drive2: number[];
  drive4: number[];
  grip: number;
  /** pontos do chassi que batem no chão (locais) */
  belly: [number, number, number][];
  /** raio de colisão entre veículos e centros (z) */
  rad: number;
  circles: number[];
}

export interface DriveInput {
  steer: number;
  gas: number;
  brake: number;
  hand: boolean;
  /** câmbio: true = automático */
  auto: boolean;
  /** marcha escolhida no H (manual): -1 ré, 0 neutro, 1..6 */
  gearSel: number;
  diff: boolean;
  /** 0 = 2H, 1 = 4H, 2 = 4L */
  mode4: 0 | 1 | 2;
  /** 0 baixa, 1 normal, 2 alta */
  pressure: 0 | 1 | 2;
}

const G = 9.81;
const _up = new THREE.Vector3();
const _fw = new THREE.Vector3();
const _m = new THREE.Vector3();
const _n = new THREE.Vector3();
const _r = new THREE.Vector3();
const _v = new THREE.Vector3();
const _f = new THREE.Vector3();
const _s = new THREE.Vector3();
const _F = new THREE.Vector3();
const _T = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _qi = new THREE.Quaternion();
const _dq = new THREE.Quaternion();

export class Vehicle {
  readonly pos = new THREE.Vector3();
  readonly q = new THREE.Quaternion();
  readonly vel = new THREE.Vector3();
  readonly ang = new THREE.Vector3();
  readonly spec: VehSpec;
  /** massa extra (carga) */
  load = 0;
  /** força de resistência da ferramenta (N), contra o movimento */
  toolDrag = 0;
  readonly input: DriveInput = { steer: 0, gas: 0, brake: 0, hand: false, auto: true, gearSel: 1, diff: false, mode4: 1, pressure: 1 };
  /** marcha engatada: -1 ré, 0 neutro, 1..6 */
  gear = 1;
  rpm = 0;
  speed = 0;
  asleep = false;
  private sleepT = 0;
  private revT = 0;
  private shiftT = 0;
  private k: number;
  private c: number;
  private invI = new THREE.Vector3();
  // por roda
  readonly comp: Float32Array;
  private prev: Float32Array;
  readonly contact: Uint8Array;
  readonly Fn: Float32Array;
  readonly spin: Float32Array;
  readonly slip: Float32Array;
  readonly susp: Float32Array;
  readonly cpx: Float32Array;
  readonly cpy: Float32Array;
  readonly cpz: Float32Array;
  private nx: Float32Array;
  private ny: Float32Array;
  private nz: Float32Array;
  private avail: Float32Array;
  private drive: Float32Array;
  private wetW: Float32Array;
  /** chamado quando uma roda patina na lama (x,y,z, intensidade) */
  onSpray: ((x: number, y: number, z: number, k: number, dx: number, dz: number) => void) | null = null;

  constructor(spec: VehSpec) {
    this.spec = spec;
    const n = spec.wheels.length;
    this.comp = new Float32Array(n);
    this.prev = new Float32Array(n);
    this.contact = new Uint8Array(n);
    this.Fn = new Float32Array(n);
    this.spin = new Float32Array(n);
    this.slip = new Float32Array(n);
    this.susp = new Float32Array(n).fill(spec.rest);
    this.cpx = new Float32Array(n);
    this.cpy = new Float32Array(n);
    this.cpz = new Float32Array(n);
    this.nx = new Float32Array(n);
    this.ny = new Float32Array(n);
    this.nz = new Float32Array(n);
    this.avail = new Float32Array(n);
    this.drive = new Float32Array(n);
    this.wetW = new Float32Array(n);
    const per = (spec.mass * G) / n;
    this.k = per / spec.sag;
    this.c = 2 * 0.55 * Math.sqrt(this.k * (spec.mass / n));
    this.setInertia();
  }

  private setInertia(): void {
    const [w, h, l] = this.spec.dims;
    const m = (this.spec.mass + this.load) * 1.6;
    this.invI.set(12 / (m * (h * h + l * l)), 12 / (m * (w * w + l * l)), 12 / (m * (w * w + h * h)));
  }

  place(x: number, z: number, yaw: number, T: Terrain): void {
    this.q.setFromAxisAngle(_tmp.set(0, 1, 0), yaw);
    const y = T.heightAt(x, z);
    const w0 = this.spec.wheels[0];
    this.pos.set(x, y + w0.r + this.spec.rest - this.spec.sag - w0.y + 0.05, z);
    this.vel.set(0, 0, 0);
    this.ang.set(0, 0, 0);
    this.prev.fill(0);
    this.asleep = false;
    this.sleepT = 0;
  }

  get mass(): number {
    return this.spec.mass + this.load;
  }
  setLoad(kg: number): void {
    if (Math.abs(kg - this.load) < 1) return;
    this.load = kg;
    this.setInertia();
    this.wake();
  }
  wake(): void {
    this.asleep = false;
    this.sleepT = 0;
  }
  /** de cabeça para baixo? */
  flipped(): boolean {
    return _up.set(0, 1, 0).applyQuaternion(this.q).y < 0.25;
  }
  yaw(): number {
    _fw.set(0, 0, 1).applyQuaternion(this.q);
    return Math.atan2(_fw.x, _fw.z);
  }

  /** aderência da roda i (material, umidade, pressão, esteira) */
  private grip(i: number, T: Terrain, x: number, z: number): number {
    const k = T.idx(x, z);
    const w = T.wetK(k);
    this.wetW[i] = w;
    let mu = MAT_GRIP[T.mat[k]] * this.spec.grip * (1 - 0.6 * w);
    const p = this.input.pressure;
    if (w > 0.35) mu *= p === 0 ? 1.28 : p === 2 ? 0.86 : 1;
    else mu *= p === 0 ? 0.96 : p === 2 ? 1.03 : 1;
    if (this.spec.tracked) mu *= 1.25;
    return mu;
  }

  step(dt: number, T: Terrain, controlled: boolean): void {
    const s = this.spec;
    const inp = this.input;
    if (!controlled && this.asleep) return;
    const m = this.mass;
    const q = this.q;
    _up.set(0, 1, 0).applyQuaternion(q);
    _fw.set(0, 0, 1).applyQuaternion(q);
    _F.set(0, -G * m, 0);
    _T.set(0, 0, 0);
    const W = s.wheels;
    const nW = W.length;
    const upY = Math.max(0.15, _up.y);
    let nC = 0;
    // ---------- 1) suspensão ----------
    for (let i = 0; i < nW; i++) {
      const w = W[i];
      _m.set(w.x, w.y, w.z).applyQuaternion(q).add(this.pos);
      let t = (_m.y - T.heightAt(_m.x, _m.z)) / upY;
      t = (_m.y - T.heightAt(_m.x - _up.x * t, _m.z - _up.z * t)) / upY;
      const L = t - w.r;
      if (L < s.rest && _up.y > 0.2) {
        const c = s.rest - L;
        const cc = Math.min(c, s.travel);
        const bump = Math.max(0, c - s.travel);
        const was = this.contact[i];
        const cv = was ? (c - this.prev[i]) / dt : 0;
        let Fs = this.k * cc + this.c * cv + bump * this.k * 8;
        if (Fs < 0) Fs = 0;
        if (Fs > m * G * 3) Fs = m * G * 3;
        this.prev[i] = c;
        this.contact[i] = 1;
        this.comp[i] = cc;
        this.susp[i] = s.rest - cc;
        this.Fn[i] = Fs * _up.y;
        const px = _m.x - _up.x * (L + w.r);
        const pz = _m.z - _up.z * (L + w.r);
        this.cpx[i] = px;
        this.cpz[i] = pz;
        this.cpy[i] = T.heightAt(px, pz);
        T.normalAt(px, pz, _n);
        this.nx[i] = _n.x;
        this.ny[i] = _n.y;
        this.nz[i] = _n.z;
        this.avail[i] = this.grip(i, T, px, pz) * this.Fn[i];
        // suspensão
        _r.set(px - this.pos.x, this.cpy[i] - this.pos.y, pz - this.pos.z);
        _tmp.copy(_up).multiplyScalar(Fs);
        _F.add(_tmp);
        _T.add(_v.crossVectors(_r, _tmp));
        nC++;
      } else {
        this.contact[i] = 0;
        this.comp[i] = 0;
        this.Fn[i] = 0;
        this.avail[i] = 0;
        this.prev[i] = 0;
        this.susp[i] += (s.rest - this.susp[i]) * Math.min(1, dt * 10);
      }
    }
    // ---------- 2) motor / câmbio ----------
    const vF = this.vel.dot(_fw);
    this.speed = vF;
    this.drive.fill(0);
    let gas = inp.gas;
    let brake = inp.brake;
    if (s.tracked) {
      this.trackDrive(dt, vF);
    } else {
      if (inp.auto) {
        // automático: freio parado vira ré; acelerador parado volta para a 1ª
        if (this.gear > 0 && brake > 0.1 && gas < 0.1 && vF < 0.4) {
          this.revT += dt;
          if (this.revT > 0.25) this.gear = -1;
        } else if (this.gear < 0 && gas > 0.1 && vF > -0.4) {
          this.revT += dt;
          if (this.revT > 0.15) this.gear = 1;
        } else this.revT = 0;
        if (this.gear < 0) {
          const g2 = gas;
          gas = brake;
          brake = g2;
        }
      } else this.gear = inp.gearSel;
      const low = inp.mode4 === 2;
      const g = this.gear;
      const top = (g < 0 ? s.tops[0] : g === 0 ? 1 : s.tops[g]) * (low ? 0.45 : 1);
      const rpmV = Math.abs(vF) / top;
      // giro sobe com a roda patinando
      let spinV = 0;
      for (let i = 0; i < nW; i++) if (this.slip[i] > spinV) spinV = this.slip[i];
      const rpmT = g === 0 ? 0.15 + gas * 0.85 : Math.max(0.14 + gas * 0.08, Math.min(1.08, rpmV + spinV * 0.5 * gas));
      this.rpm += (rpmT - this.rpm) * Math.min(1, dt * 8);
      if (inp.auto && g > 0) {
        this.shiftT -= dt;
        if (this.shiftT <= 0) {
          if (rpmV > 0.93 && g < s.tops.length - 1 && gas > 0.2) {
            this.gear = g + 1;
            this.shiftT = 0.6;
          } else if (rpmV < 0.36 && g > 1) {
            this.gear = g - 1;
            this.shiftT = 0.5;
          }
        }
      }
      if (g !== 0 && gas > 0) {
        const gm = g < 0 ? 1 : Math.pow(s.tops[1] / s.tops[g], 0.8);
        const curve = rpmV < 0.9 ? 1 : Math.max(0, (1.06 - rpmV) / 0.16);
        const Ftot = gas * s.force * gm * curve * (low ? 2.1 : 1) * (g < 0 ? -1 : 1);
        const axles = inp.mode4 === 0 ? s.drive2 : s.drive4;
        const Fax = Ftot / axles.length;
        for (const ax of axles) {
          let a = -1;
          let b = -1;
          for (let i = 0; i < nW; i++)
            if (W[i].axle === ax) {
              if (a < 0) a = i;
              else b = i;
            }
          if (a < 0) continue;
          if (b < 0) {
            this.drive[a] = Fax;
            if (Math.abs(Fax) > this.avail[a] * 1.05) this.slip[a] = Math.max(this.slip[a], Math.min(4, (Math.abs(Fax) - this.avail[a]) / Math.max(400, this.avail[a])));
            continue;
          }
          const half = Fax / 2;
          const A = this.avail[a];
          const B = this.avail[b];
          const sg = Math.sign(half);
          const hm = Math.abs(half);
          if (inp.diff) {
            // bloqueado: o que uma roda não aguenta vai para a outra
            this.drive[a] = sg * Math.min(A, hm + Math.max(0, hm - B));
            this.drive[b] = sg * Math.min(B, hm + Math.max(0, hm - A));
          } else {
            // aberto: a roda mais solta manda (a outra recebe o mesmo torque)
            const lim = Math.min(hm, Math.min(A, B) * 1.05);
            this.drive[a] = sg * lim;
            this.drive[b] = sg * lim;
          }
          // a roda sem aderência gira em falso (efeito visual + sulco)
          if (hm > A * 1.05) this.slip[a] = Math.max(this.slip[a], Math.min(4, (hm - A) / Math.max(400, A)));
          if (hm > B * 1.05) this.slip[b] = Math.max(this.slip[b], Math.min(4, (hm - B) / Math.max(400, B)));
        }
      }
    }
    // segura parado sem pedal (criança não precisa de freio de mão em ladeira)
    const hold = !s.tracked && gas < 0.05 && brake < 0.05 && Math.abs(vF) < 0.5 && this.gear !== 0;
    // ---------- 3) atrito por roda ----------
    const share = m / Math.max(1, nC);
    for (let i = 0; i < nW; i++) {
      if (!this.contact[i]) {
        this.spin[i] += this.drive[i] !== 0 ? Math.sign(this.drive[i]) * 12 * dt : 0;
        continue;
      }
      const w = W[i];
      const px = this.cpx[i];
      const py = this.cpy[i];
      const pz = this.cpz[i];
      _n.set(this.nx[i], this.ny[i], this.nz[i]);
      _r.set(px - this.pos.x, py - this.pos.y, pz - this.pos.z);
      _v.crossVectors(this.ang, _r).add(this.vel);
      const a = -inp.steer * s.steerMax * w.steer;
      _f.set(Math.sin(a), 0, Math.cos(a)).applyQuaternion(q);
      _f.addScaledVector(_n, -_f.dot(_n)).normalize();
      _s.crossVectors(_n, _f);
      const vl = _v.dot(_f);
      const vs = _v.dot(_s);
      const avail = this.avail[i];
      const latK = s.tracked ? 0.35 : 0.75;
      let Flat = (-vs * share * latK) / dt;
      const latMax = avail * (s.tracked ? 0.55 : 1);
      if (Flat > latMax) Flat = latMax;
      else if (Flat < -latMax) Flat = -latMax;
      // freio
      let bk = brake;
      if (inp.hand && (w.axle >= 1 || s.tracked)) bk = 1;
      if (hold) bk = Math.max(bk, 0.7);
      const kill = (vl * share) / dt;
      let Fb = 0;
      if (bk > 0) {
        const bmax = bk * this.Fn[i] * 1.2;
        Fb = -(kill > bmax ? bmax : kill < -bmax ? -bmax : kill);
      }
      // rolagem (mais na lama, mais com pneu murcho em chão duro)
      const wW = this.wetW[i];
      const crr = (0.018 + wW * 0.09 + this.comp[i] * 0) * (inp.pressure === 0 ? (wW > 0.35 ? 1.1 : 1.6) : inp.pressure === 2 ? 0.85 : 1);
      const rrMax = crr * this.Fn[i];
      const Frr = -(kill > rrMax ? rrMax : kill < -rrMax ? -rrMax : kill);
      const Fd = this.drive[i];
      let Fl = Fd + Fb + Frr;
      const tot = Math.hypot(Fl, Flat);
      let sl = 0;
      if (tot > avail && tot > 0) {
        const kk = avail / tot;
        Fl *= kk;
        Flat *= kk;
        if (Math.abs(Fd) > avail * 0.5) sl = Math.min(4, (Math.abs(Fd) - avail * 0.5) / Math.max(300, avail));
      }
      if (sl > this.slip[i]) this.slip[i] = sl;
      this.slip[i] *= 1 - Math.min(1, dt * 6);
      _tmp.copy(_f).multiplyScalar(Fl).addScaledVector(_s, Flat);
      _F.add(_tmp);
      _T.add(_v.crossVectors(_r, _tmp));
      this.spin[i] += (vl / w.r + Math.sign(Fd) * this.slip[i] * 6) * dt;
      // sulco: peso + patinada, na terra molhada
      if (wW > 0.12) {
        const load = this.Fn[i] / ((m * G) / nW);
        const rate = (0.02 + Math.abs(vl) * 0.03 + this.slip[i] * 0.25) * wW * wW * load * (inp.pressure === 0 ? 0.45 : inp.pressure === 2 ? 1.35 : 1) * (s.tracked ? 0.35 : 1);
        const d = rate * dt;
        if (d > 0.0004) T.rutAt(px, pz, d, _s.x, _s.z);
        if (this.slip[i] > 0.25 && this.onSpray && wW > 0.25) this.onSpray(px, py, pz, this.slip[i], -_f.x * Math.sign(Fd), -_f.z * Math.sign(Fd));
      } else if (Math.abs(vl) > 0.5 && (s.tracked || this.Fn[i] > 30000)) T.rutAt(px, pz, 0.0006 * dt * 60, _s.x, _s.z);
    }
    // resistência da ferramenta (lâmina cheia de terra)
    if (this.toolDrag > 0) {
      const vf = this.vel.dot(_fw);
      const kill = Math.abs(vf * m) / dt;
      const Fd = Math.min(this.toolDrag, kill) * Math.sign(vf);
      _F.addScaledVector(_fw, -Fd);
    }
    // ---------- 4) chassi no chão ----------
    for (const b of s.belly) {
      _m.set(b[0], b[1], b[2]).applyQuaternion(q).add(this.pos);
      const g = T.heightAt(_m.x, _m.z);
      if (_m.y >= g) continue;
      const d = g - _m.y;
      T.normalAt(_m.x, _m.z, _n);
      _r.subVectors(_m, this.pos);
      _v.crossVectors(this.ang, _r).add(this.vel);
      const vn = _v.dot(_n);
      let Fn = d * m * 60 - vn * m * 4;
      if (Fn < 0) Fn = 0;
      _tmp.copy(_v).addScaledVector(_n, -vn);
      const vt = _tmp.length();
      _tmp.multiplyScalar(vt > 1e-4 ? -Math.min((Fn * 0.6) / vt, (m * 0.3) / s.belly.length / dt) : 0);
      _tmp.addScaledVector(_n, Fn);
      _F.add(_tmp);
      _T.add(_v.crossVectors(_r, _tmp));
    }
    // ---------- 5) integração ----------
    this.vel.addScaledVector(_F, dt / m);
    this.vel.multiplyScalar(1 - 0.02 * dt);
    // torque → aceleração angular (no referencial do corpo)
    _qi.copy(q).invert();
    _tmp.copy(_T).applyQuaternion(_qi).multiply(this.invI).applyQuaternion(q);
    this.ang.addScaledVector(_tmp, dt);
    this.ang.multiplyScalar(1 - Math.min(0.5, 1.4 * dt));
    this.pos.addScaledVector(this.vel, dt);
    _dq.set(this.ang.x * dt * 0.5, this.ang.y * dt * 0.5, this.ang.z * dt * 0.5, 0).multiply(q);
    q.set(q.x + _dq.x, q.y + _dq.y, q.z + _dq.z, q.w + _dq.w).normalize();
    // dorme parado (veículos estacionados não custam nada)
    if (!controlled && this.vel.lengthSq() < 0.004 && this.ang.lengthSq() < 0.004) {
      this.sleepT += dt;
      if (this.sleepT > 1.2) {
        this.asleep = true;
        this.vel.set(0, 0, 0);
        this.ang.set(0, 0, 0);
      }
    } else this.sleepT = 0;
  }

  /** esteiras: cada lado persegue uma velocidade (pedal + direção) */
  private trackDrive(dt: number, vF: number): void {
    const s = this.spec;
    const inp = this.input;
    const thr = inp.gas - inp.brake;
    const top = s.tops[1];
    const vT = thr * top;
    const turn = inp.steer * top * 0.75;
    const vL = vT + turn;
    const vR = vT - turn;
    const share = this.mass / s.wheels.length;
    for (let i = 0; i < s.wheels.length; i++) {
      if (!this.contact[i]) continue;
      const w = s.wheels[i];
      // velocidade aproximada daquele lado: vF ± ω·meia-bitola
      const half = Math.abs(w.x);
      const vSide = vF - w.side * this.ang.dot(_up) * half;
      const want = w.side > 0 ? vL : vR;
      let F = ((want - vSide) * share * 0.5) / dt;
      const a = this.avail[i] * 0.9;
      if (F > a) F = a;
      else if (F < -a) F = -a;
      this.drive[i] = F;
    }
    this.gear = thr < -0.05 ? -1 : 1;
    const rpmT = Math.min(1, 0.18 + Math.abs(thr) * 0.5 + Math.abs(vF) / top * 0.4 + Math.abs(inp.steer) * 0.2);
    this.rpm += (rpmT - this.rpm) * Math.min(1, dt * 6);
  }
}
