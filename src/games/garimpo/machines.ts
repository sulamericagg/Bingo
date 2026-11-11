/* ============================================================
 *  GARIMPO BRUTO — máquinas: garimpeiro (pá + carrinho de mão), pickup 4x4,
 *  caminhão basculante 6x4, escavadeira, trator de esteira e helicóptero com balde.
 *  Toda terra carrega ouro (g): cargas são {vol m³, gold g}.
 * ============================================================ */
import * as THREE from 'three';
import { buildDozer, buildExcavator, buildHeli, buildPickup, buildTruck, buildWorker, EXC, wheelMesh, type ExcavatorParts, type Ram, type WorkerParts } from './models';
import { CELL, type BladeState } from './terrain';
import { Vehicle, type VehSpec, type WheelDef } from './vehicle';
import type { World } from './world';

export type Kind = 'worker' | 'pickup' | 'truck' | 'excavator' | 'dozer' | 'heli';

/** entrada de controle (preenchida pelo HUD/teclado) */
export interface Ctl {
  /** analógico esquerdo (-1..1; y para BAIXO +) */
  mx: number;
  my: number;
  /** analógico direito (escavadeira) */
  rx: number;
  ry: number;
  gas: number;
  brake: number;
  hand: boolean;
  auto: boolean;
  gearSel: number;
  diff: boolean;
  mode4: 0 | 1 | 2;
  pressure: 0 | 1 | 2;
  /** ação principal segurada (PÁ, CAVAR, SOLTAR ÁGUA) */
  act: boolean;
  /** ação 2 (DESPEJAR / CAÇAMBA) — segurado */
  act2: boolean;
  up: boolean;
  down: boolean;
  /** modo especialista (painel completo) */
  expert: boolean;
  /** escavadeira: andar (true) ou braço */
  drive: boolean;
}
export function newCtl(): Ctl {
  return { mx: 0, my: 0, rx: 0, ry: 0, gas: 0, brake: 0, hand: false, auto: true, gearSel: 1, diff: false, mode4: 1, pressure: 1, act: false, act2: false, up: false, down: false, expert: false, drive: true };
}

export interface Cargo {
  vol: number;
  gold: number;
  cap: number;
}
/** quem pode receber terra despejada num ponto (moega, caçamba...) */
export interface Receiver {
  /** devolve quanto aceitou (m³) */
  take(vol: number, gold: number): number;
}
export interface Env {
  world: World;
  /** câmera: guinada (para o garimpeiro andar relativo à tela) */
  camYaw: number;
  /** drop: a terra cai de cima (caçamba da escavadeira) — vale a caçamba de caminhão embaixo, em qualquer altura */
  receiverAt(x: number, y: number, z: number, self: Machine | null, slack?: number, drop?: boolean): Receiver | null;
  /** som curto */
  sfx(name: 'dig' | 'dump' | 'splash' | 'full' | 'clank'): void;
  others: Machine[];
}

const SOIL_KG = 1600;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

let NEXT = 1;
export abstract class Machine {
  readonly id = NEXT++;
  abstract readonly kind: Kind;
  readonly group = new THREE.Group();
  veh: Vehicle | null = null;
  cargo: Cargo = { vol: 0, gold: 0, cap: 0 };
  /** 0..1 — para o HUD ("cheio") */
  get fill(): number {
    return this.cargo.cap > 0 ? this.cargo.vol / this.cargo.cap : 0;
  }
  abstract update(dt: number, ctl: Ctl | null, env: Env): void;
  physics(dt: number, env: Env, controlled: boolean): void {
    this.veh?.step(dt, env.world.T, controlled);
  }
  abstract sync(dt: number): void;
  get pos(): THREE.Vector3 {
    return this.veh ? this.veh.pos : this.group.position;
  }
  yaw(): number {
    return this.veh ? this.veh.yaw() : this.group.rotation.y;
  }
  /** distância e altura da câmera de perseguição; yaw extra (casa da escavadeira) */
  cam = { dist: 9, height: 3.6, look: 1.4, yawOff: 0 };
  /** raio de colisão e centros ao longo do comprimento */
  rad = 1;
  circles: number[] = [0];
  /** ponto da porta (onde o garimpeiro entra) */
  door = new THREE.Vector3(1.4, 0, 0);
  dispose(): void {
    this.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }
  /** rede: estado extra da máquina (articulações) — o anfitrião manda, o convidado aplica */
  netExtra(): number[] {
    return [];
  }
  /** rede (convidado): pose vinda do anfitrião, sem simular (sem cavar, sem física) */
  netApply(x: number, y: number, z: number, q: THREE.Quaternion, speed: number, steer: number, ex: number[], dt: number): void {
    void ex;
    const v = this.veh;
    if (!v) return;
    v.pos.set(x, y, z);
    v.q.copy(q);
    v.vel.set(0, 0, 0);
    v.speed = speed;
    v.input.steer = steer;
    v.asleep = true;
    for (let i = 0; i < v.spin.length; i++) v.spin[i] += (speed * dt) / (v.spec.wheels[i]?.r || 0.5);
    this.syncLoad();
  }
  /** suspensão (rodas) para o retrato */
  netSusp(): number[] {
    const v = this.veh;
    return v && !v.spec.tracked ? Array.from(v.susp, (s) => Math.round(s * 100) / 100) : [];
  }
  netSetSusp(a: number[] | undefined): void {
    const v = this.veh;
    if (!v || !a) return;
    for (let i = 0; i < a.length && i < v.susp.length; i++) v.susp[i] = a[i];
  }
  /** carga em kg (física) */
  protected syncLoad(): void {
    this.veh?.setLoad(this.cargo.vol * SOIL_KG);
  }
}

/* ============================== veículo com rodas ============================== */
abstract class Wheeled extends Machine {
  protected wheels: THREE.Object3D[] = [];
  protected body!: THREE.Object3D;
  protected setup(spec: VehSpec, body: THREE.Object3D, rim?: number): void {
    this.veh = new Vehicle(spec);
    this.body = body;
    this.group.add(body);
    if (!spec.tracked)
      for (const w of spec.wheels) {
        const m = wheelMesh(w.r, 0.42, rim);
        this.wheels.push(m);
        this.group.add(m);
      }
    this.rad = spec.rad;
    this.circles = spec.circles;
  }
  sync(): void {
    const v = this.veh!;
    this.group.position.copy(v.pos);
    this.group.quaternion.copy(v.q);
    const W = v.spec.wheels;
    for (let i = 0; i < this.wheels.length; i++) {
      const w = W[i];
      const m = this.wheels[i];
      m.position.set(w.x, w.y - v.susp[i], w.z);
      m.rotation.set(v.spin[i], -v.input.steer * v.spec.steerMax * w.steer, 0, 'YXZ');
    }
  }
}

function wheels4(x: number, y: number, zf: number, zr: number, r: number): WheelDef[] {
  return [
    { x, y, z: zf, r, steer: 1, axle: 0, side: 1 },
    { x: -x, y, z: zf, r, steer: 1, axle: 0, side: -1 },
    { x, y, z: zr, r, steer: 0, axle: 1, side: 1 },
    { x: -x, y, z: zr, r, steer: 0, axle: 1, side: -1 },
  ];
}
function applyDrive(v: Vehicle, ctl: Ctl | null): void {
  const i = v.input;
  if (!ctl) {
    i.gas = i.brake = i.steer = 0;
    i.hand = true;
    return;
  }
  i.steer = ctl.mx;
  i.gas = ctl.gas;
  i.brake = ctl.brake;
  if (ctl.expert) {
    i.hand = ctl.hand;
    i.auto = ctl.auto;
    i.gearSel = ctl.gearSel;
    i.diff = ctl.diff;
    i.mode4 = ctl.mode4;
    i.pressure = ctl.pressure;
  } else {
    // modo simples: o carro se ajeita sozinho (4x4 ligado, bloqueio quando patina)
    i.hand = false;
    i.auto = true;
    i.mode4 = 1;
    i.pressure = 1;
    let sl = 0;
    for (let k = 0; k < v.slip.length; k++) sl = Math.max(sl, v.slip[k]);
    i.diff = sl > 0.4 || (i.diff && sl > 0.05);
  }
  v.wake();
}

/* ============================== PICKUP ============================== */
export class Pickup extends Wheeled {
  readonly kind = 'pickup';
  constructor() {
    super();
    const p = buildPickup();
    this.setup(
      {
        mass: 2100,
        dims: [1.9, 1.5, 5],
        wheels: wheels4(0.86, -0.3, 1.52, -1.45, 0.44),
        rest: 0.36,
        travel: 0.3,
        sag: 0.13,
        tracked: false,
        steerMax: 0.55,
        force: 10500,
        tops: [5, 5, 9, 13, 18, 23, 28],
        drive2: [1],
        drive4: [0, 1],
        grip: 1,
        belly: [[0.8, -0.35, 2.3], [-0.8, -0.35, 2.3], [0.8, -0.35, -2.3], [-0.8, -0.35, -2.3], [0.7, 0.95, 0.6], [-0.7, 0.95, 0.6], [0.7, 0.95, -0.6], [-0.7, 0.95, -0.6]],
        rad: 1.1,
        circles: [-1.5, 0, 1.5],
      },
      p.body,
    );
    this.cargo.cap = 0.8;
    this.cam = { dist: 8.5, height: 3.2, look: 1.2, yawOff: 0 };
    this.door.set(1.5, 0, 0.3);
    const hk = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1, 1.5), new THREE.MeshLambertMaterial({ color: 0x8a4a26, flatShading: true }));
    hk.position.set(0, 0.0, -1.6);
    hk.visible = false;
    this.heap = hk;
    p.body.add(hk);
  }
  private heap: THREE.Mesh;
  /** caçamba: caixa local onde cai a terra */
  inBed(p: THREE.Vector3, slack = 0): boolean {
    _v.copy(p).sub(this.veh!.pos).applyQuaternion(_q.copy(this.veh!.q).invert());
    return Math.abs(_v.x) < 0.95 + slack && _v.z > -2.5 - slack && _v.z < -0.7 + slack && _v.y > -0.3 && _v.y < 2.6 + slack;
  }
  update(_dt: number, ctl: Ctl | null): void {
    applyDrive(this.veh!, ctl);
    this.pose();
  }
  private pose(): void {
    const f = this.fill;
    this.heap.visible = f > 0.01;
    this.heap.scale.set(1, Math.max(0.05, f * 0.5), 1);
    this.heap.position.y = 0.05 + f * 0.25;
    this.syncLoad();
  }
  netApply(x: number, y: number, z: number, q: THREE.Quaternion, speed: number, steer: number, ex: number[], dt: number): void {
    super.netApply(x, y, z, q, speed, steer, ex, dt);
    this.pose();
  }
  /** descarrega devagar num recebedor (moega) */
  unload(dt: number, r: Receiver): number {
    if (this.cargo.vol <= 0) return 0;
    const v = Math.min(this.cargo.vol, dt * 0.5);
    const g = (this.cargo.gold * v) / this.cargo.vol;
    const took = r.take(v, g);
    this.cargo.gold -= (g * took) / v;
    this.cargo.vol -= took;
    if (this.cargo.vol < 1e-4) this.cargo.vol = this.cargo.gold = 0;
    return took;
  }
}

/* ============================== CAMINHÃO 6x4 ============================== */
export class Truck extends Wheeled {
  readonly kind = 'truck';
  private bed: THREE.Group;
  private heap: THREE.Mesh;
  private ram: Ram;
  tilt = 0;
  /** caçamba subindo (botão alterna) */
  raise = false;
  constructor() {
    super();
    const t = buildTruck();
    const r = 0.56;
    this.setup(
      {
        mass: 9500,
        dims: [2.5, 3, 8],
        wheels: [
          { x: 1.08, y: -0.4, z: 2.6, r, steer: 1, axle: 0, side: 1 },
          { x: -1.08, y: -0.4, z: 2.6, r, steer: 1, axle: 0, side: -1 },
          { x: 1.08, y: -0.4, z: -1.35, r, steer: 0, axle: 1, side: 1 },
          { x: -1.08, y: -0.4, z: -1.35, r, steer: 0, axle: 1, side: -1 },
          { x: 1.08, y: -0.4, z: -2.75, r, steer: 0, axle: 2, side: 1 },
          { x: -1.08, y: -0.4, z: -2.75, r, steer: 0, axle: 2, side: -1 },
        ],
        rest: 0.42,
        travel: 0.32,
        sag: 0.11,
        tracked: false,
        steerMax: 0.5,
        force: 62000,
        tops: [4, 4, 7, 10, 14, 18, 22],
        drive2: [1],
        drive4: [1, 2],
        grip: 1,
        belly: [[1, -0.4, 3.7], [-1, -0.4, 3.7], [1, -0.35, -3.9], [-1, -0.35, -3.9], [1.1, 1.8, 2.8], [-1.1, 1.8, 2.8], [1.1, 1.5, -2], [-1.1, 1.5, -2]],
        rad: 1.35,
        circles: [-2.6, -0.6, 1.5, 3.0],
      },
      t.body,
    );
    this.bed = t.bed;
    this.heap = t.heap;
    this.ram = t.ram;
    this.cargo.cap = 8;
    this.cam = { dist: 13, height: 5, look: 1.8, yawOff: 0 };
    this.door.set(1.8, 0, 2.6);
  }
  inBed(p: THREE.Vector3, slack = 0): boolean {
    if (this.tilt > 0.15) return false;
    _v.copy(p).sub(this.veh!.pos).applyQuaternion(_q.copy(this.veh!.q).invert());
    return Math.abs(_v.x) < 1.25 + slack && _v.z > -4.0 - slack && _v.z < -0.2 + slack && _v.y > -0.2 && _v.y < 4.5 + slack;
  }
  update(dt: number, ctl: Ctl | null, env: Env): void {
    applyDrive(this.veh!, ctl);
    if (ctl) this.raise = ctl.act2 ? true : this.raise;
    const want = this.raise ? 0.85 : 0;
    this.tilt += Math.sign(want - this.tilt) * Math.min(Math.abs(want - this.tilt), dt * 0.45);
    this.poseBed();
    // despejo pela traseira
    if (this.tilt > 0.4 && this.cargo.vol > 0) {
      const rate = (this.tilt - 0.35) * 3.2 * dt;
      const v = Math.min(this.cargo.vol, rate);
      const g = (this.cargo.gold * v) / this.cargo.vol;
      this.group.updateMatrixWorld();
      _v2.set(0, 0.2, -4.6);
      this.group.localToWorld(_v2);
      const rc = env.receiverAt(_v2.x, _v2.y, _v2.z, this, 1.2);
      let took = 0;
      if (rc) took = rc.take(v, g);
      if (took < v) {
        _v3.set(0, 0, -5.4);
        this.group.localToWorld(_v3);
        env.world.T.deposit(_v3.x, _v3.z, v - took, 1.6, g / v);
        env.world.T.relax(_v3.x, _v3.z, 3);
      }
      this.cargo.vol -= v;
      this.cargo.gold -= g;
      if (this.cargo.vol < 1e-4) {
        this.cargo.vol = this.cargo.gold = 0;
        this.raise = false;
      }
      if (Math.random() < 0.7) {
        const T = env.world.T;
        env.world.clods.spawn(_v2.x + (Math.random() - 0.5) * 1.8, _v2.y, _v2.z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5), -0.5, (Math.random() - 0.5), 0.12 + Math.random() * 0.12, 0.5, 0.25, 0.12);
        void T;
      }
    }
    this.poseHeap();
    this.syncLoad();
  }
  private poseBed(): void {
    this.bed.rotation.x = -this.tilt;
    this.bed.updateMatrix();
    _v3.set(0, 0.05, 2.0).applyMatrix4(this.bed.matrix);
    this.ram.set(0, 0.0, -1.6, _v3.x, _v3.y, _v3.z);
  }
  /** monte na caçamba: já aparece com uma caçambada (cresce em raiz: 1 de 9 já se vê) */
  private poseHeap(): void {
    const f = Math.min(1.08, this.fill);
    this.heap.visible = f > 0.004;
    const k = Math.sqrt(f);
    this.heap.scale.set(0.55 + 0.45 * k, 0.4 + 0.72 * k, 0.45 + 0.55 * k);
  }
  netExtra(): number[] {
    return [Math.round(this.tilt * 100) / 100];
  }
  netApply(x: number, y: number, z: number, q: THREE.Quaternion, speed: number, steer: number, ex: number[], dt: number): void {
    super.netApply(x, y, z, q, speed, steer, ex, dt);
    this.tilt = ex[0] ?? 0;
    this.poseBed();
    this.poseHeap();
  }
}

/* ============================== esteiras ============================== */
function trackWheels(gauge: number, y: number, len: number, r: number): WheelDef[] {
  const out: WheelDef[] = [];
  for (const s of [1, -1] as const)
    for (let i = 0; i < 3; i++) out.push({ x: s * gauge, y, z: -len / 2 + (i * len) / 2, r, steer: 0, axle: i, side: s });
  return out;
}

/* ============================== TRATOR (lâmina) ============================== */
export class Dozer extends Wheeled {
  readonly kind = 'dozer';
  private blade: THREE.Group;
  private rams: Ram[];
  lift = 0.2;
  private bst: BladeState = { carry: 0, gold: 0 };
  constructor() {
    super();
    const d = buildDozer();
    this.setup(
      {
        mass: 18000,
        dims: [3, 2.6, 4.4],
        wheels: trackWheels(1.08, -0.62, 3.0, 0.39),
        rest: 0.1,
        travel: 0.08,
        sag: 0.04,
        tracked: true,
        steerMax: 0,
        force: 0,
        tops: [2.2, 2.6],
        drive2: [],
        drive4: [],
        grip: 1,
        belly: [[1.6, -0.6, 3.1], [-1.6, -0.6, 3.1], [1.2, -0.7, -2.1], [-1.2, -0.7, -2.1], [0.7, 1.7, -0.95], [-0.7, 1.7, -0.95]],
        rad: 1.6,
        circles: [-1.2, 0.4, 2.2],
      },
      d.body,
    );
    this.blade = d.blade;
    this.rams = d.rams;
    this.cam = { dist: 10, height: 4.5, look: 1.0, yawOff: 0 };
    this.door.set(1.9, 0, -0.9);
  }
  update(dt: number, ctl: Ctl | null, env: Env): void {
    const v = this.veh!;
    const i = v.input;
    if (ctl) {
      i.steer = ctl.mx;
      i.gas = ctl.gas;
      i.brake = ctl.brake;
      if (ctl.up) this.lift = Math.min(0.95, this.lift + dt * 0.6);
      if (ctl.down) this.lift = Math.max(-0.3, this.lift - dt * 0.6);
      v.wake();
    } else {
      i.steer = i.gas = i.brake = 0;
    }
    this.poseBlade();
    // fio da lâmina no mundo
    this.group.updateMatrixWorld();
    _v.set(1.72, -0.66, 0.16).applyMatrix4(this.blade.matrixWorld);
    _v2.set(-1.72, -0.66, 0.16).applyMatrix4(this.blade.matrixWorld);
    _v3.set(0, 0, 1).applyQuaternion(v.q);
    const fl = Math.hypot(_v3.x, _v3.z) || 1;
    const dx = _v3.x / fl;
    const dz = _v3.z / fl;
    const T = env.world.T;
    const cut = T.blade(_v.x, _v.z, _v.y, _v2.x, _v2.z, _v2.y, dx, dz, 0, this.bst, 0.03);
    // resistência proporcional à terra na frente da lâmina
    v.toolDrag = Math.min(120000, this.bst.carry * 26000 + cut * 400000);
    if (cut > 0.0006 || this.bst.carry > 0.05) {
      T.relax((_v.x + _v2.x) / 2 + dx, (_v.z + _v2.z) / 2 + dz, 3.2);
      const sp = Math.abs(v.speed);
      if (sp > 0.3 && Math.random() < 0.5 + cut * 30) {
        const t = Math.random();
        const x = _v.x + (_v2.x - _v.x) * t + dx * 0.8;
        const z = _v.z + (_v2.z - _v.z) * t + dz * 0.8;
        env.world.clods.spawn(x, T.heightAt(x, z) + 0.6, z, dx * sp * 0.8 + (Math.random() - 0.5), 1.4 + Math.random() * 1.6, dz * sp * 0.8 + (Math.random() - 0.5), 0.1 + Math.random() * 0.16, 0.62, 0.29, 0.13);
      }
    }
    if (!ctl) this.bst.carry *= 0.99;
  }
  private poseBlade(): void {
    this.blade.position.y = this.lift - 0.42;
    this.blade.rotation.x = -this.lift * 0.12;
    this.blade.updateMatrix();
    for (let i = 0; i < 2; i++) {
      const sx = i ? -0.62 : 0.62;
      _v3.set(sx, 0.25, -0.2).applyMatrix4(this.blade.matrix);
      this.rams[i].set(sx, 0.62, 1.55, _v3.x, _v3.y, _v3.z);
    }
  }
  netExtra(): number[] {
    return [Math.round(this.lift * 100) / 100];
  }
  netApply(x: number, y: number, z: number, q: THREE.Quaternion, speed: number, steer: number, ex: number[], dt: number): void {
    super.netApply(x, y, z, q, speed, steer, ex, dt);
    this.lift = ex[0] ?? this.lift;
    this.poseBlade();
  }
}

/* ============================== ESCAVADEIRA ============================== */
export class Excavator extends Wheeled {
  readonly kind = 'excavator';
  private p: ExcavatorParts;
  swing = 0;
  boomA = 0.35;
  armA = 1.3;
  bucketA = 0.8;
  private phase = 0;
  private bdug = 0;
  constructor() {
    super();
    const p = buildExcavator();
    this.p = p;
    this.setup(
      {
        mass: 21000,
        dims: [3, 2.8, 4.6],
        wheels: trackWheels(1.15, -0.6, 3.2, 0.4),
        rest: 0.1,
        travel: 0.08,
        sag: 0.04,
        tracked: true,
        steerMax: 0,
        force: 0,
        tops: [1.8, 2.0],
        drive2: [],
        drive4: [],
        grip: 1,
        belly: [[1.4, -0.6, 2.2], [-1.4, -0.6, 2.2], [1.4, -0.6, -2.2], [-1.4, -0.6, -2.2], [1.2, 2.3, -1], [-1.2, 2.3, -1]],
        rad: 1.7,
        circles: [-1.2, 0.9],
      },
      p.body,
    );
    this.cargo.cap = 0.9;
    this.cam = { dist: 11, height: 5.5, look: 1.4, yawOff: 0 };
    this.door.set(2.1, 0, 0.5);
  }
  /** ponta da caçamba (mundo) */
  tip(out: THREE.Vector3): THREE.Vector3 {
    return this.p.tip.getWorldPosition(out);
  }
  update(dt: number, ctl: Ctl | null, env: Env): void {
    const v = this.veh!;
    const i = v.input;
    const T = env.world.T;
    if (ctl && ctl.drive) {
      i.steer = ctl.mx;
      i.gas = ctl.gas;
      i.brake = ctl.brake;
      v.wake();
    } else i.steer = i.gas = i.brake = 0;
    if (ctl && !ctl.drive) {
      // ISO: esquerdo = giro (x) + braço (y); direito = lança (y) + caçamba (x)
      this.swing -= ctl.mx * dt * 0.9;
      this.armA += ctl.my * dt * 0.9;
      this.boomA -= ctl.ry * dt * 0.6;
      this.bucketA -= ctl.rx * dt * 1.4;
      // CAVAR automático (segura): estica, desce, puxa enchendo, levanta
      if (ctl.act) this.autoDig(dt, T);
      else this.phase = 0;
      if (ctl.act2) this.bucketA -= dt * 2.6; // despejar
    }
    this.cam.yawOff = this.swing + (ctl && !ctl.drive ? 0.38 : 0);
    this.poseArm();
    const p = this.p;
    // cavar: ponta abaixo do chão enchendo a caçamba
    this.dirt(dt, env, T);
    void p;
  }
  /** articulações → malhas e pistões */
  private poseArm(): void {
    this.boomA = Math.max(-0.55, Math.min(1.05, this.boomA));
    this.armA = Math.max(0.35, Math.min(2.55, this.armA));
    this.bucketA = Math.max(-0.75, Math.min(2.45, this.bucketA));
    const p = this.p;
    p.house.rotation.y = this.swing;
    p.boom.rotation.x = -this.boomA;
    p.arm.rotation.x = this.armA;
    p.bucket.rotation.x = this.bucketA;
    // pistões (entre pinos de peças diferentes)
    this.group.updateMatrixWorld(true);
    const pin = (cyl: Ram, par: THREE.Object3D, ax: number, ay: number, az: number, other: THREE.Object3D, bx: number, by: number, bz: number) => {
      _v3.set(bx, by, bz);
      other.localToWorld(_v3);
      par.worldToLocal(_v3);
      cyl.set(ax, ay, az, _v3.x, _v3.y, _v3.z);
    };
    pin(p.cylBoom, p.house, 0, 0.45, 1.75, p.boom, 0, 0.62, 1.7);
    pin(p.cylArm, p.boom, 0, 0.82, EXC.boomL * 0.42, p.arm, 0, 0.42, -0.3);
    pin(p.cylBucket, p.arm, 0, 0.36, 0.5, p.bucket, 0, 0.3, 0.05);
    this.group.updateMatrixWorld(true);
    p.heap.visible = this.cargo.vol > 0.02;
    p.heap.scale.setScalar(0.5 + this.fill * 0.6);
  }
  netExtra(): number[] {
    const r = (v: number) => Math.round(v * 1000) / 1000;
    return [r(this.swing), r(this.boomA), r(this.armA), r(this.bucketA)];
  }
  netApply(x: number, y: number, z: number, q: THREE.Quaternion, speed: number, steer: number, ex: number[], dt: number): void {
    super.netApply(x, y, z, q, speed, steer, ex, dt);
    if (ex.length >= 4) [this.swing, this.boomA, this.armA, this.bucketA] = ex;
    this.group.position.copy(this.veh!.pos);
    this.group.quaternion.copy(this.veh!.q);
    this.poseArm();
  }
  /** ponta cavando / caçamba despejando (só o anfitrião) */
  private dirt(dt: number, env: Env, T: import('./terrain').Terrain): void {
    const p = this.p;
    this.tip(_v);
    const gy = T.heightAt(_v.x, _v.z);
    // boca da caçamba para baixo → derrama
    _v2.set(0, -1, 0).applyQuaternion(p.bucket.getWorldQuaternion(_q));
    const mouthDown = _v2.y < -0.55 && this.bucketA < 0.35;
    if (_v.y < gy - 0.04 && this.cargo.vol < this.cargo.cap && !mouthDown && this.bucketA > -0.3) {
      const got = T.dig(_v.x, _v.y + 0.04, _v.z, 0.75, this.cargo.cap - this.cargo.vol, 0.05);
      if (got > 0) {
        this.cargo.vol += got;
        this.cargo.gold += T.goldOut;
        T.relax(_v.x, _v.z, 2.5);
        this.bdug += got;
        if (this.bdug > 0.05) {
          this.bdug = 0;
          env.sfx('dig');
          env.world.clods.spawn(_v.x, gy + 0.2, _v.z, (Math.random() - 0.5) * 1.5, 1.5 + Math.random(), (Math.random() - 0.5) * 1.5, 0.12 + Math.random() * 0.12, 0.6, 0.28, 0.13);
        }
        if (this.cargo.vol >= this.cargo.cap - 1e-3) env.sfx('full');
      }
    }
    if (mouthDown && this.cargo.vol > 0) {
      const amt = Math.min(this.cargo.vol, dt * 1.4);
      const g = (this.cargo.gold * amt) / this.cargo.vol;
      p.heap.getWorldPosition(_v3);
      // caçamba de caminhão embaixo (em qualquer altura, com folga): a terra cai dentro dela
      const rc = env.receiverAt(_v3.x, _v3.y, _v3.z, this, 1.4, true);
      let took = 0;
      if (rc) took = rc.take(amt, g);
      if (took < amt) {
        T.deposit(_v3.x, _v3.z, amt - took, 1.1, g / amt);
        T.relax(_v3.x, _v3.z, 2.6);
      }
      this.cargo.vol -= amt;
      this.cargo.gold -= g;
      if (this.cargo.vol < 1e-4) this.cargo.vol = this.cargo.gold = 0;
      if (Math.random() < 0.8) env.world.clods.spawn(_v3.x + (Math.random() - 0.5) * 0.8, _v3.y - 0.3, _v3.z + (Math.random() - 0.5) * 0.8, 0, -1, 0, 0.1 + Math.random() * 0.14, 0.6, 0.28, 0.13);
      if (Math.random() < dt * 4) env.sfx('dump');
    }
    p.heap.visible = this.cargo.vol > 0.02;
    p.heap.scale.setScalar(0.5 + this.fill * 0.6);
  }
  /** sequência automática para crianças: alcança → desce → puxa → levanta */
  private autoDig(dt: number, T: import('./terrain').Terrain): void {
    this.tip(_v);
    const gy = T.heightAt(_v.x, _v.z);
    const full = this.cargo.vol >= this.cargo.cap * 0.95;
    if (full) this.phase = 3;
    switch (this.phase) {
      case 0: // estica o braço e abre a caçamba
        this.armA += Math.sign(1.0 - this.armA) * Math.min(Math.abs(1.0 - this.armA), dt * 1.2);
        this.bucketA += Math.sign(0.15 - this.bucketA) * Math.min(Math.abs(0.15 - this.bucketA), dt * 1.6);
        if (Math.abs(this.armA - 1.0) < 0.05) this.phase = 1;
        break;
      case 1: // desce a lança até cravar
        this.boomA -= dt * 0.55;
        if (_v.y < gy - 0.35 || this.boomA <= -0.54) this.phase = 2;
        break;
      case 2: // puxa o braço segurando a profundidade e fecha a caçamba
        this.armA += dt * 0.65;
        this.boomA += (_v.y - (gy - 0.4)) * dt * 1.2;
        this.bucketA += dt * 0.55;
        if (this.armA > 2.2) this.phase = 3;
        break;
      case 3: // levanta com a caçamba fechada
        this.bucketA += Math.sign(2.0 - this.bucketA) * Math.min(Math.abs(2.0 - this.bucketA), dt * 1.5);
        this.boomA += Math.sign(0.75 - this.boomA) * Math.min(Math.abs(0.75 - this.boomA), dt * 0.6);
        if (!full && this.boomA > 0.7) this.phase = 0;
        break;
    }
  }
}

/* ============================== GARIMPEIRO ============================== */
export class Worker extends Machine {
  readonly kind = 'worker';
  private p: WorkerParts;
  private walk = 0;
  private dig = -1;
  /** balde de água (fogo) */
  water = 0;
  speedNow = 0;
  digPow = 1;
  /** convidado online: anda e anima aqui, mas cavar/despejar acontece no anfitrião */
  ghost = false;
  /** despejando o carrinho agora (anima no convidado) */
  dumping = false;
  /** anfitrião: velocidade de andar vinda do convidado (anima as pernas; -1 = usa a própria) */
  extMove = -1;
  constructor(shirt?: number) {
    super();
    this.p = buildWorker(shirt);
    this.group.add(this.p.root);
    this.cargo.cap = 0.12;
    this.cam = { dist: 5.8, height: 3.2, look: 0.9, yawOff: 0 };
    this.rad = 0.5;
    this.circles = [0.4];
  }
  place(x: number, z: number, yaw: number, env: World): void {
    this.group.position.set(x, env.T.heightAt(x, z), z);
    this.group.rotation.y = yaw;
  }
  update(dt: number, ctl: Ctl | null, env: Env): void {
    const T = env.world.T;
    const g = this.group;
    let mv = 0;
    if (ctl && this.dig < 0) {
      const mx = ctl.mx;
      const my = ctl.my;
      const mag = Math.min(1, Math.hypot(mx, my));
      if (mag > 0.08) {
        // relativo à câmera: para cima = para onde a câmera olha
        const a = env.camYaw + Math.atan2(-mx, -my);
        let d = a - g.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        g.rotation.y += d * Math.min(1, dt * 10);
        const wet = T.wetAt(g.position.x, g.position.z);
        const sp = mag * (3.4 - this.fill * 1.0) * (1 - wet * 0.45);
        mv = sp;
        g.position.x += Math.sin(g.rotation.y) * sp * dt;
        g.position.z += Math.cos(g.rotation.y) * sp * dt;
      }
    }
    // colisão com prédios/árvores/máquinas e o lago fundo
    const pos = g.position;
    env.world.near(pos.x, pos.z, (c) => {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const d = Math.hypot(dx, dz);
      const r = c.r + 0.35;
      if (d < r && d > 1e-4) {
        pos.x = c.x + (dx / d) * r;
        pos.z = c.z + (dz / d) * r;
      }
    });
    for (const o of env.others) {
      if (o === this || !o.veh) continue;
      const yaw = o.yaw();
      for (const cz of o.circles) {
        const cx = o.pos.x + Math.sin(yaw) * cz;
        const czz = o.pos.z + Math.cos(yaw) * cz;
        const dx = pos.x - cx;
        const dz = pos.z - czz;
        const d = Math.hypot(dx, dz);
        const r = o.rad + 0.35;
        if (d < r && d > 1e-4) {
          pos.x = cx + (dx / d) * r;
          pos.z = czz + (dz / d) * r;
        }
      }
    }
    const wl = env.world.waterY(pos.x, pos.z);
    const gy = T.heightAt(pos.x, pos.z);
    if (wl - gy > 0.9) {
      // fundo demais: volta
      pos.x -= Math.sin(g.rotation.y) * mv * dt * 1.5;
      pos.z -= Math.cos(g.rotation.y) * mv * dt * 1.5;
    }
    pos.x = Math.max(8, Math.min(184, pos.x));
    pos.z = Math.max(8, Math.min(184, pos.z));
    pos.y += (T.heightAt(pos.x, pos.z) - pos.y) * Math.min(1, dt * 20);
    if (this.extMove >= 0) mv = this.extMove;
    this.speedNow = mv;
    // andar
    this.walk += mv * dt * 3.2;
    const sw = Math.sin(this.walk) * Math.min(1, mv) * 0.6;
    this.p.legL.rotation.x = sw;
    this.p.legR.rotation.x = -sw;
    // balde d'água (incêndio): na beira do lago enche; cheio, joga para a frente
    const fx0 = pos.x + Math.sin(g.rotation.y) * 1.3;
    const fz0 = pos.z + Math.cos(g.rotation.y) * 1.3;
    const atWater = env.world.waterY(fx0, fz0) > T.heightAt(fx0, fz0) + 0.15;
    if (ctl && ctl.act && this.dig < 0 && this.water > 0) {
      const amt = Math.min(this.water, dt * 1.2);
      this.water -= amt;
      for (let i = 0; i < 3; i++)
        env.world.drops.spawn(pos.x + Math.sin(g.rotation.y) * 0.6, pos.y + 1.3, pos.z + Math.cos(g.rotation.y) * 0.6, Math.sin(g.rotation.y) * (5 + Math.random() * 2) + (Math.random() - 0.5), 3 + Math.random(), Math.cos(g.rotation.y) * (5 + Math.random() * 2) + (Math.random() - 0.5), 0.1, 0.55, 0.75, 1);
      this.p.armR.rotation.x = -1.4;
      this.p.armL.rotation.x = -1.4;
    } else if (ctl && ctl.act && this.dig < 0 && atWater) {
      if (this.water <= 0) env.sfx('splash');
      this.water = 1;
    } else if (ctl && ctl.act && this.dig < 0) {
      if (this.cargo.vol >= this.cargo.cap - 1e-3) env.sfx('full');
      else this.dig = 0;
    }
    const sh = this.p.shovel;
    if (this.dig >= 0) {
      this.dig += dt / 0.6;
      sh.visible = true;
      this.p.barrow.visible = true;
      const k = this.dig;
      sh.rotation.x = k < 0.5 ? -0.2 + k * 2.2 : 0.9 - (k - 0.5) * 2.4;
      this.p.armR.rotation.x = -0.6 - Math.sin(k * Math.PI) * 0.9;
      if (k >= 0.5 && k - dt / 0.6 < 0.5 && !this.ghost) {
        // cava na frente (ao lado do carrinho)
        const fx = pos.x + Math.sin(g.rotation.y) * 1.0 - Math.cos(g.rotation.y) * 0.7;
        const fz = pos.z + Math.cos(g.rotation.y) * 1.0 + Math.sin(g.rotation.y) * 0.7;
        const y = T.heightAt(fx, fz);
        const got = T.dig(fx, y - 0.2 * this.digPow, fz, 0.55, Math.min(0.03 * this.digPow, this.cargo.cap - this.cargo.vol), 0.12);
        if (got > 0) {
          this.cargo.vol += got;
          this.cargo.gold += T.goldOut;
          env.sfx('dig');
          for (let i = 0; i < 4; i++) env.world.clods.spawn(fx, y + 0.1, fz, (Math.random() - 0.5) * 1.2, 1.5 + Math.random(), (Math.random() - 0.5) * 1.2, 0.05 + Math.random() * 0.06, 0.62, 0.3, 0.14);
        } else env.sfx('clank');
      }
      if (this.dig >= 1) {
        this.dig = -1;
        sh.visible = false;
      }
    } else if (!(ctl && ctl.act && this.water > 0)) {
      this.p.armR.rotation.x = -0.5;
      this.p.armL.rotation.x = -0.5;
    }
    // despejar o carrinho
    this.dumping = !!(ctl && ctl.act2 && this.cargo.vol > 0);
    if (this.dumping && this.ghost) {
      this.p.barrow.rotation.x = -0.35;
    } else if (ctl && ctl.act2 && this.cargo.vol > 0) {
      const fx = pos.x + Math.sin(g.rotation.y) * 1.6;
      const fz = pos.z + Math.cos(g.rotation.y) * 1.6;
      const rc = env.receiverAt(fx, T.heightAt(fx, fz) + 1.0, fz, this, 1.8);
      const v = Math.min(this.cargo.vol, dt * 0.35);
      const gg = (this.cargo.gold * v) / this.cargo.vol;
      let took = 0;
      if (rc) took = rc.take(v, gg);
      if (took < v) T.deposit(fx, fz, v - took, 0.8, gg / v);
      this.cargo.vol -= v;
      this.cargo.gold -= gg;
      if (this.cargo.vol < 1e-4) this.cargo.vol = this.cargo.gold = 0;
      this.p.barrow.rotation.x = -0.35;
      if (Math.random() < 0.5) env.world.clods.spawn(fx, T.heightAt(fx, fz) + 0.8, fz, 0, -0.5, 0, 0.06, 0.6, 0.3, 0.14);
    } else this.p.barrow.rotation.x *= 0.85;
    this.p.heap.visible = this.cargo.vol > 0.003;
    this.p.heap.scale.set(1, 0.4 + this.fill * 0.8, 1);
    this.p.bucket.visible = this.water > 0;
  }
  /** retrato: [x,y,z,yaw, velocidade, fase da pá (-1 = parado), carga 0..1, água, despejando] */
  netState(): number[] {
    const g = this.group.position;
    const r = (v: number) => Math.round(v * 100) / 100;
    return [r(g.x), r(g.y), r(g.z), r(this.group.rotation.y), r(this.speedNow), r(this.dig), r(this.fill), this.water > 0 ? 1 : 0, this.dumping ? 1 : 0];
  }
  /** convidado: põe o boneco de outro jogador/bot na pose recebida (sem simular) */
  netPose(a: number[], dt: number): void {
    const g = this.group;
    g.position.set(a[0], a[1], a[2]);
    g.rotation.y = a[3];
    const mv = a[4];
    this.speedNow = mv;
    this.walk += mv * dt * 3.2;
    const sw = Math.sin(this.walk) * Math.min(1, mv) * 0.6;
    this.p.legL.rotation.x = sw;
    this.p.legR.rotation.x = -sw;
    const k = a[5];
    const sh = this.p.shovel;
    if (k >= 0) {
      sh.visible = true;
      sh.rotation.x = k < 0.5 ? -0.2 + k * 2.2 : 0.9 - (k - 0.5) * 2.4;
      this.p.armR.rotation.x = -0.6 - Math.sin(k * Math.PI) * 0.9;
    } else {
      sh.visible = false;
      this.p.armR.rotation.x = this.p.armL.rotation.x = a[7] && a[8] ? -1.4 : -0.5;
    }
    this.cargo.vol = a[6] * this.cargo.cap;
    this.water = a[7];
    this.p.barrow.rotation.x = a[8] ? -0.35 : this.p.barrow.rotation.x * 0.85;
    this.p.heap.visible = a[6] > 0.02;
    this.p.heap.scale.set(1, 0.4 + a[6] * 0.8, 1);
    this.p.bucket.visible = this.water > 0;
  }
  sync(): void {}
}

/* ============================== HELICÓPTERO ============================== */
export class Heli extends Machine {
  readonly kind = 'heli';
  private h = buildHeli();
  vel = new THREE.Vector3();
  private bp = new THREE.Vector3();
  private bv = new THREE.Vector3();
  water = 0;
  private rope: THREE.Line;
  private ropeAttr: THREE.BufferAttribute;
  alt = 0;
  private pitch = 0;
  private roll = 0;
  private spinK = 0;
  constructor() {
    super();
    this.group.add(this.h.body);
    const g = new THREE.BufferGeometry();
    this.ropeAttr = new THREE.BufferAttribute(new Float32Array(6), 3);
    g.setAttribute('position', this.ropeAttr);
    this.rope = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x222222 }));
    this.rope.frustumCulled = false;
    this.cam = { dist: 17, height: 3.5, look: -2.5, yawOff: 0 };
    this.rad = 3;
    this.circles = [0];
    this.door.set(1.6, 0, 0.6);
  }
  /** balde e corda vivem no mundo (pêndulo) */
  attach(scene: THREE.Scene): void {
    scene.add(this.h.bucket, this.rope);
  }
  detach(): void {
    this.h.bucket.removeFromParent();
    this.rope.removeFromParent();
  }
  place(x: number, z: number, yaw: number, w: World): void {
    const y = w.T.heightAt(x, z) + 0.45;
    this.group.position.set(x, y, z);
    this.group.rotation.set(0, yaw, 0);
    this.bp.set(x + 2.5, w.T.heightAt(x + 2.5, z) + 0.5, z);
    this.bv.set(0, 0, 0);
    this.alt = 0;
  }
  get bucketPos(): THREE.Vector3 {
    return this.bp;
  }
  update(dt: number, ctl: Ctl | null, env: Env): void {
    const T = env.world.T;
    const g = this.group;
    const gy = Math.max(T.heightAt(g.position.x, g.position.z), env.world.waterY(g.position.x, g.position.z));
    let ax = 0;
    let az = 0;
    if (ctl) {
      if (ctl.up) this.alt = Math.min(34, this.alt + dt * 5);
      if (ctl.down) this.alt = Math.max(0, this.alt - dt * 5);
      const mag = Math.min(1, Math.hypot(ctl.mx, ctl.my));
      if (mag > 0.08 && this.alt > 1.5) {
        const a = env.camYaw + Math.atan2(-ctl.mx, -ctl.my);
        ax = Math.sin(a) * mag * 14;
        az = Math.cos(a) * mag * 14;
        let d = a - g.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        g.rotation.y += d * Math.min(1, dt * 1.6 * mag);
      }
    }
    this.vel.x += (ax - this.vel.x * 0.9) * dt;
    this.vel.z += (az - this.vel.z * 0.9) * dt;
    g.position.x = Math.max(10, Math.min(182, g.position.x + this.vel.x * dt));
    g.position.z = Math.max(10, Math.min(182, g.position.z + this.vel.z * dt));
    const ty = gy + 0.45 + this.alt;
    g.position.y += (ty - g.position.y) * Math.min(1, dt * 2);
    if (g.position.y < gy + 0.45) g.position.y = gy + 0.45;
    // inclina na direção da aceleração
    const fx = Math.sin(g.rotation.y);
    const fz = Math.cos(g.rotation.y);
    const fwd = this.vel.x * fx + this.vel.z * fz;
    const side = this.vel.x * fz - this.vel.z * fx;
    this.pitch += (fwd * 0.03 - this.pitch) * Math.min(1, dt * 3);
    this.roll += (-side * 0.03 - this.roll) * Math.min(1, dt * 3);
    g.rotation.x = this.pitch;
    g.rotation.z = this.roll;
    const spin = this.alt > 0.2 || ctl ? 1 : 0;
    this.spinK += (spin - this.spinK) * Math.min(1, dt * 0.8);
    this.h.rotor.rotation.y += dt * 30 * this.spinK;
    this.h.tail.rotation.x += dt * 45 * this.spinK;
    // pás nítidas devagar, disco borrado rápido
    for (const o of [this.h.rotor, this.h.tail])
      for (const ch of o.children) {
        if (ch.name === 'blur') {
          ch.visible = this.spinK > 0.35;
          ch.rotation.y = -o.rotation.y * 0.97;
        } else ch.visible = this.spinK < 0.7;
      }
    // pêndulo do balde (corda 7 m)
    const hook = _v.set(0, -0.2, 0.3);
    g.localToWorld(hook);
    this.bv.y -= 9.8 * dt;
    this.bv.multiplyScalar(1 - dt * 0.6);
    this.bp.addScaledVector(this.bv, dt);
    const L = 7;
    _v2.subVectors(this.bp, hook);
    const d = _v2.length();
    if (d > L) {
      _v2.multiplyScalar(1 / d);
      this.bp.copy(hook).addScaledVector(_v2, L);
      const vr = this.bv.dot(_v2);
      if (vr > 0) this.bv.addScaledVector(_v2, -vr);
    }
    const by = T.heightAt(this.bp.x, this.bp.z) + 0.5;
    if (this.bp.y < by) {
      this.bp.y = by;
      this.bv.y = Math.max(0, this.bv.y);
      this.bv.x *= 0.8;
      this.bv.z *= 0.8;
    }
    // enche no lago
    const wl = env.world.waterY(this.bp.x, this.bp.z);
    if (this.bp.y < wl + 0.1 && this.water < 1) {
      if (this.water < 0.05) env.sfx('splash');
      this.water = Math.min(1, this.water + dt * 0.8);
      this.bv.multiplyScalar(0.9);
    }
    // soltar água
    if (ctl && ctl.act && this.water > 0) {
      const amt = Math.min(this.water, dt * 0.7);
      this.water -= amt;
      for (let i = 0; i < 4; i++) env.world.drops.spawn(this.bp.x + (Math.random() - 0.5) * 0.9, this.bp.y - 0.5, this.bp.z + (Math.random() - 0.5) * 0.9, this.bv.x + (Math.random() - 0.5) * 2, -2 - Math.random() * 2, this.bv.z + (Math.random() - 0.5) * 2, 0.12 + Math.random() * 0.1, 0.55, 0.75, 1);
    }
    this.h.bucket.position.copy(this.bp);
    this.h.bucket.rotation.y = g.rotation.y;
    this.h.water.visible = this.water > 0.02;
    this.h.water.position.y = -0.4 + this.water * 0.8;
    const a = this.ropeAttr.array as Float32Array;
    a[0] = hook.x;
    a[1] = hook.y;
    a[2] = hook.z;
    a[3] = this.bp.x;
    a[4] = this.bp.y + 0.55;
    a[5] = this.bp.z;
    this.ropeAttr.needsUpdate = true;
  }
  netExtra(): number[] {
    const r = (v: number) => Math.round(v * 100) / 100;
    return [r(this.bp.x), r(this.bp.y), r(this.bp.z), r(this.water), r(this.spinK), r(this.alt), r(this.group.rotation.x), r(this.group.rotation.y), r(this.group.rotation.z)];
  }
  netApply(x: number, y: number, z: number, _q: THREE.Quaternion, _speed: number, _steer: number, ex: number[], dt: number): void {
    const g = this.group;
    g.position.set(x, y, z);
    if (ex.length < 9) return;
    this.bp.set(ex[0], ex[1], ex[2]);
    this.water = ex[3];
    this.spinK = ex[4];
    this.alt = ex[5];
    g.rotation.set(ex[6], ex[7], ex[8]);
    this.h.rotor.rotation.y += dt * 30 * this.spinK;
    this.h.tail.rotation.x += dt * 45 * this.spinK;
    for (const o of [this.h.rotor, this.h.tail])
      for (const ch of o.children) {
        if (ch.name === 'blur') {
          ch.visible = this.spinK > 0.35;
          ch.rotation.y = -o.rotation.y * 0.97;
        } else ch.visible = this.spinK < 0.7;
      }
    this.h.bucket.position.copy(this.bp);
    this.h.bucket.rotation.y = g.rotation.y;
    this.h.water.visible = this.water > 0.02;
    this.h.water.position.y = -0.4 + this.water * 0.8;
    const hook = _v.set(0, -0.2, 0.3);
    g.updateMatrixWorld();
    g.localToWorld(hook);
    const a = this.ropeAttr.array as Float32Array;
    a[0] = hook.x;
    a[1] = hook.y;
    a[2] = hook.z;
    a[3] = this.bp.x;
    a[4] = this.bp.y + 0.55;
    a[5] = this.bp.z;
    this.ropeAttr.needsUpdate = true;
  }
  sync(): void {}
}

export function makeMachine(k: Kind): Machine {
  switch (k) {
    case 'pickup':
      return new Pickup();
    case 'truck':
      return new Truck();
    case 'dozer':
      return new Dozer();
    case 'excavator':
      return new Excavator();
    case 'heli':
      return new Heli();
    default:
      return new Worker();
  }
}

/** colisão entre máquinas e com obstáculos fixos (empurra e tira a velocidade de aproximação) */
export function collide(ms: Machine[], w: World): void {
  for (const m of ms) {
    const v = m.veh;
    if (!v || v.asleep) continue;
    const yaw = m.yaw();
    const sy = Math.sin(yaw);
    const cy = Math.cos(yaw);
    for (const cz of m.circles) {
      const cx = v.pos.x + sy * cz;
      const czz = v.pos.z + cy * cz;
      w.near(cx, czz, (c) => {
        const dx = cx - c.x;
        const dz = czz - c.z;
        const d = Math.hypot(dx, dz);
        const r = c.r + m.rad;
        if (d < r && d > 1e-4) {
          const nx = dx / d;
          const nz = dz / d;
          v.pos.x += nx * (r - d);
          v.pos.z += nz * (r - d);
          const vn = v.vel.x * nx + v.vel.z * nz;
          if (vn < 0) {
            v.vel.x -= nx * vn * 1.2;
            v.vel.z -= nz * vn * 1.2;
          }
        }
      });
      for (const o of ms) {
        if (o === m || !o.veh) continue;
        const oy = o.yaw();
        for (const oz of o.circles) {
          const ox = o.pos.x + Math.sin(oy) * oz;
          const ozz = o.pos.z + Math.cos(oy) * oz;
          const dx = cx - ox;
          const dz = czz - ozz;
          const d = Math.hypot(dx, dz);
          const r = o.rad + m.rad;
          if (d < r && d > 1e-4) {
            const nx = dx / d;
            const nz = dz / d;
            const push = (r - d) * 0.5;
            v.pos.x += nx * push;
            v.pos.z += nz * push;
            const ov = o.veh;
            ov.wake();
            ov.pos.x -= nx * push;
            ov.pos.z -= nz * push;
            const rel = (v.vel.x - ov.vel.x) * nx + (v.vel.z - ov.vel.z) * nz;
            if (rel < 0) {
              const mt = v.mass + ov.mass;
              v.vel.x -= (nx * rel * ov.mass) / mt;
              v.vel.z -= (nz * rel * ov.mass) / mt;
              ov.vel.x += (nx * rel * v.mass) / mt;
              ov.vel.z += (nz * rel * v.mass) / mt;
            }
          }
        }
      }
    }
    // fica dentro do mapa
    v.pos.x = Math.max(6, Math.min(186, v.pos.x));
    v.pos.z = Math.max(6, Math.min(186, v.pos.z));
  }
}

export const CELL_M = CELL;
void _up;
