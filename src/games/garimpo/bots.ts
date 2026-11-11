/* ============================================================
 *  GARIMPO BRUTO — ajudantes (bots), opcionais: dá para jogar 100% sozinho.
 *  MOTORISTA: pega um caminhão livre e faz a rota mina → lavadora → mina:
 *    espera encher no pátio da mina, desce a estrada, dá ré na moega, basculha e volta.
 *  GARIMPEIRO: cava no pátio da mina com pá e despeja no caminhão que está carregando
 *    (sem caminhão, faz um monte para a escavadeira pegar depois).
 * ============================================================ */
import * as THREE from 'three';
import { newCtl, Truck, Worker, type Ctl, type Env, type Machine } from './machines';
import type { P2 } from './gen';
import type { World } from './world';

const ang = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

export interface BotHost {
  w: World | null;
  ms: Machine[];
  cur: Machine | null;
  hopperPos(out: THREE.Vector3): THREE.Vector3;
  /** ponto do pátio da mina onde o caminhão espera carregar */
  loadSpot(): { x: number; z: number; yaw: number };
}

type DState = 'toLoad' | 'wait' | 'toPlant' | 'approach' | 'align' | 'reverse' | 'dump' | 'leave';

export class Driver {
  readonly ctl: Ctl = newCtl();
  truck: Truck | null = null;
  st: DState = 'toLoad';
  private path: P2[] = [];
  private pi = 0;
  private stuck = 0;
  private backT = 0;
  private waitT = 0;
  private tries = 0;
  constructor(private host: BotHost) {}

  /** caminhão livre (nem do jogador, nem de outro motorista) */
  claim(others: Driver[]): void {
    if (this.truck && this.host.ms.includes(this.truck)) return;
    this.truck = null;
    for (const m of this.host.ms)
      if (m instanceof Truck && m !== this.host.cur && !others.some((d) => d !== this && d.truck === m)) {
        this.truck = m;
        this.go('toLoad');
        return;
      }
  }
  private go(s: DState): void {
    this.st = s;
    this.stuck = 0;
    const w = this.host.w!;
    const map = w.map;
    const tr = this.truck!;
    const hp = this.host.hopperPos(_v);
    const out = this.hopperOut();
    const L = this.host.loadSpot();
    if (s === 'toLoad' || s === 'toPlant') {
      // estrada densa (a cada 5 m), a partir do ponto mais perto do caminhão
      const dense: P2[] = [];
      const road = map.road;
      for (let i = 0; i < road.length - 1; i++) {
        const a = road[i];
        const b = road[i + 1];
        const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 5));
        for (let k = 0; k < n; k++) dense.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
      }
      dense.push(road[road.length - 1]);
      if (s === 'toPlant') dense.reverse();
      let bi = 0;
      let bd = 1e9;
      dense.forEach((p, i) => {
        const d = Math.hypot(p.x - tr.pos.x, p.z - tr.pos.z);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      });
      this.path = dense.slice(Math.min(bi + 1, dense.length - 1));
      this.path.push(s === 'toLoad' ? { x: L.x, z: L.z } : { x: hp.x + out.x * 17, z: hp.z + out.z * 17 });
    } else if (s === 'approach') this.path = [{ x: hp.x + out.x * 17, z: hp.z + out.z * 17 }];
    else if (s === 'leave') this.path = [{ x: hp.x + out.x * 18, z: hp.z + out.z * 18 }];
    this.pi = 0;
    this.tries = 0;
  }
  private hopperOut(): { x: number; z: number } {
    const pl = this.host.w!.plant.root;
    const a = this.host.hopperPos(new THREE.Vector3());
    const b = new THREE.Vector3(0, 1.4, 14);
    pl.localToWorld(b);
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: (b.x - a.x) / l, z: (b.z - a.z) / l };
  }

  /** dirige até o ponto do caminho (frente) com velocidade-alvo */
  private drive(dt: number, tx: number, tz: number, vmax: number, reverse = false): number {
    const tr = this.truck!;
    const v = tr.veh!;
    const yaw = v.yaw();
    const dx = tx - v.pos.x;
    const dz = tz - v.pos.z;
    const d = Math.hypot(dx, dz);
    const c = this.ctl;
    if (!reverse) {
      const a = ang(Math.atan2(dx, dz) - yaw);
      c.mx = Math.max(-1, Math.min(1, -a * 2.2));
      const want = Math.min(vmax, 1.5 + d * 0.5) * (1 - Math.min(0.6, Math.abs(a)));
      c.gas = v.speed < want ? 0.75 : 0;
      c.brake = v.speed > want + 1.5 ? 0.4 : 0;
    } else {
      const b = ang(Math.atan2(dx, dz) - (yaw + Math.PI));
      c.mx = Math.max(-1, Math.min(1, b * 2.4));
      const want = Math.min(vmax, 0.8 + d * 0.35);
      // automático: freio parado = ré; em ré o freio acelera para trás
      c.gas = 0;
      c.brake = -v.speed < want ? 0.6 : 0;
    }
    // preso: dá uma ré curta
    if (Math.abs(v.speed) < 0.3 && (c.gas > 0 || c.brake > 0)) this.stuck += dt;
    else this.stuck = Math.max(0, this.stuck - dt);
    if (this.stuck > 5) {
      this.stuck = 0;
      this.backT = 1.6;
      // preso de novo no mesmo ponto: tenta o próximo
      if (++this.tries >= 2 && this.pi < this.path.length - 1) {
        this.pi++;
        this.tries = 0;
      }
    }
    if (this.backT > 0) {
      this.backT -= dt;
      c.mx = -c.mx;
      if (reverse) {
        c.gas = 0.7;
        c.brake = 0;
      } else {
        c.gas = 0;
        c.brake = 0.7;
      }
    }
    return d;
  }
  private follow(dt: number, vmax: number): boolean {
    // perseguição pura sobre a estrada densa: mira 8 m à frente
    const v = this.truck!.veh!;
    const last = this.path.length - 1;
    while (this.pi < last && Math.hypot(this.path[this.pi].x - v.pos.x, this.path[this.pi].z - v.pos.z) < 8) this.pi++;
    const p = this.path[this.pi];
    if (!p) return true;
    const d = this.drive(dt, p.x, p.z, vmax);
    return this.pi === last && d < 5;
  }

  /** o jogador largou o volante: retoma de onde faz sentido */
  resume(): void {
    if (!this.truck) return;
    this.go(this.truck.fill > 0.5 ? 'toPlant' : 'toLoad');
  }
  update(dt: number): void {
    const tr = this.truck;
    if (!tr || !tr.veh) return;
    if (tr === this.host.cur) return; // o jogador pegou o volante
    const c = this.ctl;
    c.act2 = false;
    c.gas = c.brake = c.mx = 0;
    switch (this.st) {
      case 'toLoad':
        if (this.follow(dt, 7)) {
          this.go('wait');
          this.waitT = 0;
        }
        break;
      case 'wait': {
        // parado com freio até encher (ou 3 min — leva o que tiver)
        c.brake = 0;
        this.waitT += dt;
        if (tr.fill > 0.92 || (this.waitT > 180 && tr.cargo.vol > 0.5)) this.go('toPlant');
        break;
      }
      case 'toPlant':
        if (this.follow(dt, 7)) this.go('approach');
        break;
      case 'approach': {
        const p = this.path[0];
        const d = this.drive(dt, p.x, p.z, 3);
        if (d < 9) this.st = 'align';
        break;
      }
      case 'align': {
        // manobra assistida (manobrista): parado, gira e encosta de frente para fora da moega
        const v = tr.veh;
        const p = this.path[0];
        const out = this.hopperOut();
        const want = Math.atan2(out.x, out.z);
        const da = ang(want - v.yaw());
        const step = Math.sign(da) * Math.min(Math.abs(da), dt * 0.9);
        v.q.premultiply(_q.setFromAxisAngle(_up, step));
        const dx = p.x - v.pos.x;
        const dz = p.z - v.pos.z;
        const dd = Math.hypot(dx, dz);
        if (dd > 0.05) {
          const k = Math.min(dd, dt * 2) / dd;
          v.pos.x += dx * k;
          v.pos.z += dz * k;
        }
        v.vel.multiplyScalar(0.8);
        v.ang.multiplyScalar(0.5);
        v.wake();
        c.brake = 0;
        if (Math.abs(da) < 0.03 && dd < 0.4) this.st = 'reverse';
        break;
      }
      case 'reverse': {
        const hp = this.host.hopperPos(_v);
        const out = this.hopperOut();
        // traseira (5,6 m atrás do centro) sobre a moega
        const d = this.drive(dt, hp.x + out.x * 7.2, hp.z + out.z * 7.2, 2, true);
        if (d < 1.2) {
          this.st = 'dump';
          tr.raise = true;
        }
        break;
      }
      case 'dump':
        c.brake = 0;
        if (tr.cargo.vol <= 0.01) {
          tr.raise = false;
          if (tr.tilt < 0.05) this.go('leave');
        }
        break;
      case 'leave':
        if (this.follow(dt, 4)) this.go('toLoad');
        break;
    }
  }
}

/** garimpeiro ajudante */
export class MinerBot {
  readonly ctl: Ctl = newCtl();
  readonly worker = new Worker();
  private target = { x: 0, z: 0 };
  private st: 'walk' | 'dig' | 'carry' | 'dump' = 'walk';
  private t = 0;
  constructor(
    private host: BotHost,
    private idx: number,
  ) {}
  place(): void {
    const L = this.host.loadSpot();
    const w = this.host.w!;
    this.worker.place(L.x + 6 + this.idx * 1.5, L.z - 4, 0, w);
    this.pick();
  }
  private pick(): void {
    const L = this.host.loadSpot();
    const a = (this.idx * 2.1 + Math.random() * 1.2) % (Math.PI * 2);
    const r = 7 + Math.random() * 5;
    this.target = { x: L.x + Math.cos(a) * r, z: L.z + Math.sin(a) * r };
    this.st = 'walk';
  }
  /** caminhão parado esperando carga perto */
  private loadingTruck(): Truck | null {
    const L = this.host.loadSpot();
    for (const m of this.host.ms) if (m instanceof Truck && m.tilt < 0.05 && m.fill < 1 && Math.hypot(m.pos.x - L.x, m.pos.z - L.z) < 9 && Math.abs(m.veh!.speed) < 0.3) return m;
    return null;
  }
  update(dt: number, env: Env): void {
    const wk = this.worker;
    const c = this.ctl;
    const g = wk.group;
    c.act = c.act2 = false;
    c.mx = c.my = 0;
    const walkTo = (x: number, z: number): number => {
      const dx = x - g.position.x;
      const dz = z - g.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.6) {
        // o garimpeiro anda relativo à "câmera" (env.camYaw): usa guinada 0 para os bots
        const a = Math.atan2(dx, dz);
        c.mx = -Math.sin(a);
        c.my = -Math.cos(a);
      }
      return d;
    };
    const L = this.host.loadSpot();
    switch (this.st) {
      case 'walk':
        if (walkTo(this.target.x, this.target.z) < 0.8) {
          this.st = 'dig';
          this.t = 0;
        }
        break;
      case 'dig':
        this.t += dt;
        c.act = this.t % 1.0 < 0.2;
        if (wk.fill > 0.97 || this.t > 20) this.st = 'carry';
        break;
      case 'carry': {
        const tr = this.loadingTruck();
        if (tr) {
          // lado da caçamba
          _v.set(1.9, 0, -2.2);
          tr.group.localToWorld(_v);
          if (walkTo(_v.x, _v.z) < 0.9) {
            // vira para a caçamba e despeja
            g.rotation.y = Math.atan2(tr.pos.x - g.position.x, tr.pos.z - g.position.z) - 0.4;
            this.st = 'dump';
            this.t = 0;
          }
        } else if (walkTo(L.x - 7, L.z + 5) < 1) {
          // sem caminhão: monte de terra rica ao lado do pátio
          this.st = 'dump';
          this.t = 0;
        }
        break;
      }
      case 'dump':
        this.t += dt;
        c.act2 = true;
        if (wk.cargo.vol <= 0.001 || this.t > 4) this.pick();
        break;
    }
    // bots andam relativos ao mundo (camYaw = 0)
    const saved = env.camYaw;
    env.camYaw = 0;
    wk.update(dt, c, env);
    env.camYaw = saved;
  }
}
