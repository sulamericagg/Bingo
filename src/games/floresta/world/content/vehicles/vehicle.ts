/* ============================================================
 *  VEÍCULOS DO MUNDO — veículo em jogo (física cannon-es + modelo).
 *  Rodas: RaycastVehicle. Esteiras: rodas escondidas + tração
 *  diferencial (gira parado). Barco: empuxo por ponto nas boias.
 *  Helicóptero/avião: forças arcade estáveis. A carga (toras etc.) são
 *  corpos físicos de verdade dentro das caçambas — a massa delas pesa
 *  na aceleração, na frenagem, na subida e no CONSUMO.
 * ============================================================ */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { FUEL_ITEMS, type FuelKind } from './parts';
import { analyze, layout, burnRate, driveForce, dragOf, CRR, DECK_T, DRIVER, KP, type Analysis, type Layout, type Spot, type VehicleDesign } from './design';
import { buildVehicleModel, cargoWallH, STAKE_H, poseWheel, restHeight, SUSP, type VehicleModel } from './models';

/** grupo de colisão padrão = o das toras do motor (G_LOG), que já colide com chão/estáticos/toras */
export const VEH_GROUP = 2;

export type VSound = 'start' | 'stop' | 'horn' | 'crash' | 'refuel' | 'grab' | 'drop' | 'dig' | 'broken' | 'repair' | 'hitch';

/** o que o mundo oferece aos veículos (tudo opcional, menos `world`) */
export interface VehicleHost {
  world: CANNON.World;
  /** veículo novo no mundo (o motor garante o chão físico debaixo dele) */
  spawned?: (v: Vehicle) => void;
  /** material do chassi (atrito com o chão) */
  material?: CANNON.Material;
  /** filtro de colisão do chassi (padrão VEH_GROUP / −1) */
  group?: number;
  mask?: number;
  /** nível da água em (x, z); −Infinity = seco */
  waterLevel?(x: number, z: number): number;
  /** altura do terreno (câmera, estacionar, lâmina) */
  heightAt?(x: number, z: number): number;
  /** gancho do motor: cava uma esfera e devolve os itens retirados (ex.: VoxWorld.edit) */
  dig?(x: number, y: number, z: number, r: number): Map<string, number> | null;
  /** gancho do motor: aplaina para a altura y (ex.: World.deform(x, z, r, 0, 0, y)) */
  flatten?(x: number, z: number, r: number, y: number): void;
  /** gancho do motor: ara a terra (canteiro) */
  till?(x: number, z: number, r: number): void;
  /** corpo que o guindaste pode pegar perto de (x,y,z); padrão: corpo dinâmico mais perto */
  findGrabbable?(x: number, y: number, z: number, r: number): CANNON.Body | null;
  /** itens que não couberam nos compartimentos */
  onItems?(v: Vehicle, items: Map<string, number>): void;
  sound?(id: VSound, v: Vehicle): void;
  /** mensagem curta para o jogador (toast) */
  say?(text: string, v: Vehicle): void;
}

export interface VInput {
  /** −1..1 (direita +) */
  steer: number;
  /** −1..1: fração da velocidade máx. desejada (ré = negativo) */
  throttle: number;
  brake: boolean;
  /** ar: −1..1 subir/descer; avião: acelerar */
  up: number;
}

const _v = new CANNON.Vec3();
const _v2 = new CANNON.Vec3();
const _fwd = new CANNON.Vec3();
const FWD_L = new CANNON.Vec3(0, 0, -1);
const UP_L = new CANNON.Vec3(0, 1, 0);
const RIGHT_L = new CANNON.Vec3(1, 0, 0);
const _rel = new CANNON.Vec3();
const _tv = new THREE.Vector3();
const _tq = new THREE.Quaternion();
const _tm = new THREE.Matrix4();
const _tmi = new THREE.Matrix4();
const _one = new THREE.Vector3(1, 1, 1);
const _wp = new THREE.Vector3();
const _wq = new THREE.Quaternion();
const _ws = new THREE.Vector3();
/** rigidez da suspensão (o cannon multiplica pela massa do chassi; a carga entra em scanCargo) */
const STIFF = 46;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export interface VehicleState {
  design: VehicleDesign;
  x: number;
  y: number;
  z: number;
  q: [number, number, number, number];
  fuel: number;
  hp: number;
  items: [string, number][];
}

let NEXT_ID = 1;

export class Vehicle {
  readonly id = NEXT_ID++;
  readonly design: VehicleDesign;
  readonly stats: Analysis;
  readonly lay: Layout;
  readonly model: VehicleModel;
  readonly body: CANNON.Body;
  readonly rv: CANNON.RaycastVehicle | null = null;
  /** centro de massa no referencial do projeto */
  readonly com = new CANNON.Vec3();
  readonly input: VInput = { steer: 0, throttle: 0, brake: false, up: 0 };

  fuel: number;
  hp: number;
  driver = false;
  lights = false;
  engineOn = false;
  /** itens guardados nos compartimentos */
  readonly items = new Map<string, number>();
  /** corpos dentro das caçambas (atualizado ~4×/s) */
  readonly cargo = new Set<CANNON.Body>();
  cargoMass = 0;
  /* telemetria */
  speed = 0;
  odometer = 0;
  fuelUsed = 0;
  /** potência usada agora (0..1) para som/fumaça */
  load = 0;
  broken = false;
  parked = false;
  /* ferramentas */
  toolOn = false;
  craneMode = false;
  /** braço em repouso apontando para trás (por cima da caçamba, fora da cabine) */
  craneYaw = Math.PI;
  cranePitch = 0.45;
  craneCable = 1.2;
  readonly craneIn = { yaw: 0, pitch: 0, winch: 0 };
  grabbed: CANNON.Body | null = null;
  private grabC: CANNON.PointToPointConstraint | null = null;
  hitch: { other: Vehicle; c: CANNON.PointToPointConstraint } | null = null;
  /** veículo que puxa este (reboque) */
  towedBy: Vehicle | null = null;

  private steerNow = 0;
  private stillT = 0;
  private cargoT = 0;
  private toolT = 0;
  private dumpT = 0;
  private cargoWalls: CANNON.Shape[] = [];
  private listening = false;
  private spinA = 0;
  private hitT = 0;
  private host: VehicleHost;
  private onWake = () => this.unpark();
  /* ---- rede (mundo online) ---- */
  /** id na sala (vazio = só local) */
  nid = '';
  /** espelho de um veículo simulado em outro aparelho: corpo cinemático, sem forças */
  remote = false;
  /** esterço/motor vindos do dono (para as rodas/giratórios do espelho) */
  netSteer = 0;
  netEngine = false;
  /** alguém (outro jogador) está dirigindo este espelho */
  netBusy = false;

  constructor(host: VehicleHost, design: VehicleDesign, pos: { x: number; y: number; z: number }, yaw = 0, state?: Partial<Pick<VehicleState, 'fuel' | 'hp' | 'items' | 'q'>>) {
    this.host = host;
    this.design = design;
    this.stats = analyze(design);
    this.model = buildVehicleModel(design);
    this.lay = this.model.lay;
    this.fuel = state?.fuel ?? this.stats.tank * 0.5;
    this.hp = state?.hp ?? this.stats.hp;
    if (state?.items) for (const [k, n] of state.items) this.items.set(k, n);
    // centro de massa: média ponderada das peças, bem baixo (estável)
    let mx = 0;
    let mz = 0;
    let mt = 0;
    for (const s of this.lay.spots) {
      mx += s.x * s.def.mass;
      mz += s.z * s.def.mass;
      mt += s.def.mass;
    }
    const chM = this.stats.mass - mt;
    mt += chM;
    this.com.set(mt ? mx / mt : 0, -DECK_T - 0.15, mt ? mz / mt : 0);

    const body = new CANNON.Body({
      mass: this.stats.mass + DRIVER,
      material: host.material,
      collisionFilterGroup: host.group ?? VEH_GROUP,
      collisionFilterMask: host.mask ?? -1,
      linearDamping: 0.02,
      angularDamping: 0.25,
      allowSleep: true,
      sleepSpeedLimit: 0.12,
      sleepTimeLimit: 1.2,
    });
    this.body = body;
    const off = (x: number, y: number, z: number) => new CANNON.Vec3(x - this.com.x, y - this.com.y, z - this.com.z);
    const L = this.lay;
    body.addShape(new CANNON.Box(new CANNON.Vec3(L.hw, DECK_T / 2, L.hl)), off(0, -DECK_T / 2, 0));
    for (const s of L.spots) {
      const d = s.def;
      if (d.cat === 'cargo') {
        const h = cargoWallH(d.cap!) + STAKE_H; // paredes + estacas (as toras não pulam fora)
        const walls: [number, number, number, number, number, number][] = [
          // grossas (não deixam esfera atravessar), com a face de dentro na borda da pegada
          [s.x - s.hw - 0.14, h / 2, s.z, 0.14, h / 2, s.hl + 0.28],
          [s.x + s.hw + 0.14, h / 2, s.z, 0.14, h / 2, s.hl + 0.28],
          [s.x, h / 2, s.z - s.hl - 0.14, s.hw, h / 2, 0.14],
          [s.x, h / 2, s.z + s.hl + 0.14, s.hw, h / 2, 0.14],
        ];
        walls.forEach(([x, y, z, a, b, c], i) => {
          const sh = new CANNON.Box(new CANNON.Vec3(a, b, c));
          body.addShape(sh, off(x, y, z));
          if (i === 3) this.cargoWalls.push(sh);
        });
      } else if (d.cat === 'engine' && d.fuel !== 'none') body.addShape(new CANNON.Box(new CANNON.Vec3(s.hw * 0.8, 0.22, s.hl * 0.85)), off(s.x, 0.22, s.z));
      else if (d.cat === 'box') body.addShape(new CANNON.Box(new CANNON.Vec3(s.hw * 0.86, 0.2, s.hl * 0.86)), off(s.x, 0.2, s.z));
      else if (d.cat === 'blade') body.addShape(new CANNON.Box(new CANNON.Vec3(s.hw + 0.15, 0.3, 0.06)), off(s.x, -0.2, -L.hl - 0.42));
      else if (d.cat === 'float') body.addShape(new CANNON.Box(new CANNON.Vec3(0.24, 0.2, s.hl * 0.95)), off(s.x, -DECK_T - 0.12, s.z));
    }
    // sem rodas: o próprio casco/chassi apoia no chão
    body.position.set(pos.x, pos.y, pos.z);
    if (state?.q) body.quaternion.set(...state.q);
    else body.quaternion.setFromEuler(0, yaw, 0);
    body.updateMassProperties();
    // inércia um pouco maior = menos capotagem (arcade)
    body.inertia.scale(1.4, body.inertia);
    body.invInertia.set(1 / body.inertia.x, 1 / body.inertia.y, 1 / body.inertia.z);
    body.updateInertiaWorld(true);
    (body as unknown as { vehicle: Vehicle }).vehicle = this;

    if (L.wheels.length) {
      const rv = new CANNON.RaycastVehicle({ chassisBody: body, indexRightAxis: 0, indexUpAxis: 1, indexForwardAxis: 2 });
      for (const w of L.wheels) {
        rv.addWheel({
          radius: w.radius,
          directionLocal: new CANNON.Vec3(0, -1, 0),
          axleLocal: new CANNON.Vec3(1, 0, 0),
          chassisConnectionPointLocal: off(w.x, w.y, w.z),
          suspensionRestLength: SUSP,
          suspensionStiffness: STIFF,
          dampingRelaxation: 2.4,
          dampingCompression: 4.2,
          frictionSlip: w.grip * (w.track >= 0 ? 2.2 : 2.6),
          rollInfluence: 0.04,
          maxSuspensionForce: 1e6,
          maxSuspensionTravel: 0.26,
          customSlidingRotationalSpeed: -30,
          useCustomSlidingRotationalSpeed: true,
        });
      }
      this.rv = rv;
    }
    this.addToWorld();
    body.addEventListener('collide', (e: { body: CANNON.Body; contact: CANNON.ContactEquation }) => this.onCollide(e));
    this.syncModel();
  }

  /* ------------------------------ ciclo de vida ------------------------------ */
  private addToWorld(): void {
    const w = this.host.world;
    if (this.rv) this.rv.addToWorld(w);
    else w.addBody(this.body);
    this.listening = !!this.rv;
    this.body.addEventListener('wakeup', this.onWake);
  }
  dispose(): void {
    this.release();
    this.unhitch();
    const w = this.host.world;
    if (this.rv) {
      if (!this.listening) w.addEventListener('preStep', this.rv.preStepCallback);
      this.rv.removeFromWorld(w);
    } else w.removeBody(this.body);
    this.body.removeEventListener('wakeup', this.onWake);
    this.model.dispose();
  }
  /** estaciona: dorme o corpo e para os raios das rodas (custo ~0) */
  park(): void {
    if (this.parked) return;
    this.parked = true;
    if (this.rv && this.listening) {
      this.host.world.removeEventListener('preStep', this.rv.preStepCallback);
      this.listening = false;
    }
    this.body.velocity.setZero();
    this.body.angularVelocity.setZero();
    this.body.sleep();
  }
  unpark(): void {
    if (!this.parked) return;
    this.parked = false;
    this.stillT = 0;
    if (this.rv && !this.listening) {
      this.host.world.addEventListener('preStep', this.rv.preStepCallback);
      this.listening = true;
    }
    this.body.wakeUp();
  }

  /* ------------------------------ consultas ------------------------------ */
  /** vetor frente (mundo) */
  forward(out = new CANNON.Vec3()): CANNON.Vec3 {
    return this.body.quaternion.vmult(FWD_L, out);
  }
  up(out = new CANNON.Vec3()): CANNON.Vec3 {
    return this.body.quaternion.vmult(UP_L, out);
  }
  /** ponto do projeto (referencial do layout) → mundo */
  toWorld(x: number, y: number, z: number, out = new CANNON.Vec3()): CANNON.Vec3 {
    return this.body.pointToWorldFrame(new CANNON.Vec3(x - this.com.x, y - this.com.y, z - this.com.z), out);
  }
  /** mundo → referencial do layout */
  toLocal(p: CANNON.Vec3, out = new CANNON.Vec3()): CANNON.Vec3 {
    this.body.pointToLocalFrame(p, out);
    out.x += this.com.x;
    out.y += this.com.y;
    out.z += this.com.z;
    return out;
  }
  get yaw(): number {
    const f = this.forward(_v2);
    return Math.atan2(-f.x, -f.z);
  }
  get upsideDown(): boolean {
    return this.up(_v2).y < 0.35;
  }
  get wheelsOnGround(): number {
    return this.rv ? this.rv.numWheelsOnGround : 0;
  }
  /** massa total agora (com piloto e carga) */
  get totalMass(): number {
    return this.body.mass + this.cargoMass;
  }
  /** 0..1 de vida; o motor perde força abaixo de 50% */
  get health(): number {
    return this.stats.hp ? this.hp / this.stats.hp : 1;
  }
  get fuelFrac(): number {
    return this.stats.fuel === 'none' ? 1 : this.stats.tank ? this.fuel / this.stats.tank : 0;
  }
  /** velocidade máxima de cruzeiro que o acelerador pede */
  get cruiseCap(): number {
    const s = this.stats;
    if (s.kind === 'land' || s.kind === 'tracked') return Math.max(2, Math.min(s.vmaxWheels || 99, s.topSpeed * 1.15));
    return Math.max(2, s.topSpeed);
  }
  /** pode andar (tem energia, não quebrou) */
  get canRun(): boolean {
    return !this.broken && (this.stats.fuel === 'none' || this.fuel > 0) && this.stats.power > 0;
  }
  /** ponto do assento (mundo) — para pôr/tirar o jogador */
  seatWorld(out = new CANNON.Vec3()): CANNON.Vec3 {
    const s = this.lay.seat;
    return this.toWorld(s ? s.x : 0, 0.5, s ? s.z : 0, out);
  }
  /** lugar para descer (ao lado do banco) */
  exitPoint(out = new CANNON.Vec3()): CANNON.Vec3 {
    const s = this.lay.seat;
    return this.toWorld(-(this.lay.hw + 0.9), 0.6, s ? s.z : 0, out);
  }
  /** ponto acima da caçamba i (para soltar carga) */
  cargoDrop(i = 0, out = new CANNON.Vec3()): CANNON.Vec3 | null {
    const s = this.lay.cargo[i];
    if (!s) return null;
    return this.toWorld(s.x, 0.9, s.z, out);
  }

  /* ------------------------------ energia e reparo ------------------------------ */
  /** quantas unidades deste item o tanque aceita agora */
  fuelRoom(itemId: string): number {
    const f = FUEL_ITEMS[itemId];
    if (!f || f.kind !== this.stats.fuel || this.stats.fuel === 'none') return 0;
    return Math.max(0, Math.floor((this.stats.tank - this.fuel) / f.e + 0.999));
  }
  /** abastece com até n itens; devolve quantos usou */
  refuel(itemId: string, n: number): number {
    const f = FUEL_ITEMS[itemId];
    const k = Math.min(n, this.fuelRoom(itemId));
    if (!f || k <= 0) return 0;
    this.fuel = Math.min(this.stats.tank, this.fuel + f.e * k);
    this.host.sound?.('refuel', this);
    return k;
  }
  /** repara com 'kit_reparo' (tudo) ou 'barra_ferro' (+25%); devolve true se usou */
  repair(itemId: string): boolean {
    if (this.hp >= this.stats.hp) return false;
    if (itemId === 'kit_reparo') this.hp = this.stats.hp;
    else if (itemId === 'barra_ferro') this.hp = Math.min(this.stats.hp, this.hp + this.stats.hp * 0.25);
    else return false;
    if (this.hp > 0) this.broken = false;
    this.host.sound?.('repair', this);
    return true;
  }
  damage(n: number): void {
    if (n <= 0 || this.broken) return;
    this.hp = Math.max(0, this.hp - n * (1 - this.stats.armor));
    if (this.hp <= 0) {
      this.broken = true;
      this.engineOn = false;
      this.host.sound?.('broken', this);
    }
  }
  private onCollide(e: { body: CANNON.Body; contact: CANNON.ContactEquation }): void {
    if (this.hitT > 0 || this.remote) return;
    const o = e.body;
    if (o === this.grabbed || this.cargo.has(o) || (o.type === CANNON.Body.DYNAMIC && o.mass < 6 && !(o as unknown as { vehicle?: Vehicle }).vehicle)) return;
    const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
    if (this.parked && v > 1.5) this.unpark();
    if (v > 7) {
      this.damage((v - 7) * 5);
      this.hitT = 0.4;
      this.host.sound?.('crash', this);
    }
  }

  /* ------------------------------ compartimentos ------------------------------ */
  /** guarda itens; devolve o que não coube */
  store(items: Map<string, number>): Map<string, number> {
    const left = new Map<string, number>();
    const STACK = 50;
    for (const [k, n] of items) {
      let rest = n;
      const have = this.items.get(k) ?? 0;
      const kinds = this.items.size + (have ? 0 : 1);
      if (kinds <= this.stats.slots) {
        const room = STACK * Math.max(1, Math.ceil((have + 1) / STACK)) - have;
        const free = (this.stats.slots - this.items.size) * STACK + room;
        const put = Math.min(rest, Math.max(0, free));
        if (put > 0) this.items.set(k, have + put);
        rest -= put;
      }
      if (rest > 0) left.set(k, rest);
    }
    return left;
  }
  /** tira tudo dos compartimentos */
  takeItems(): Map<string, number> {
    const m = new Map(this.items);
    this.items.clear();
    return m;
  }

  /* ------------------------------ ferramentas ------------------------------ */
  get hasCrane(): boolean {
    return !!this.model.crane;
  }
  /** pega/solta com o guindaste */
  grab(): boolean {
    if (this.grabbed) {
      this.release();
      return false;
    }
    const c = this.model.crane;
    if (!c) return false;
    const hp = this.hookWorld(new CANNON.Vec3());
    const b = this.host.findGrabbable ? this.host.findGrabbable(hp.x, hp.y, hp.z, 1.6) : this.nearestBody(hp, 1.6);
    if (!b) return false;
    const pivot = this.hookLocalBody(new CANNON.Vec3());
    const cst = new CANNON.PointToPointConstraint(this.body, pivot, b, new CANNON.Vec3(0, 0, 0), this.stats.lift * Math.abs(this.host.world.gravity.y || 20) * 1.8);
    this.host.world.addConstraint(cst);
    this.grabbed = b;
    this.grabC = cst;
    b.wakeUp();
    b.linearDamping = Math.max(b.linearDamping, 0.4);
    b.angularDamping = Math.max(b.angularDamping, 0.6);
    this.host.sound?.('grab', this);
    return true;
  }
  release(): void {
    if (!this.grabC) return;
    this.host.world.removeConstraint(this.grabC);
    this.grabC = null;
    this.grabbed = null;
    this.host.sound?.('drop', this);
  }
  private nearestBody(p: CANNON.Vec3, r: number): CANNON.Body | null {
    let best: CANNON.Body | null = null;
    let bd = r * r;
    for (const b of this.host.world.bodies) {
      if (b.type !== CANNON.Body.DYNAMIC || b === this.body || (b as unknown as { vehicle?: Vehicle }).vehicle) continue;
      const d = b.position.distanceSquared(p);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }
  /** ponta da lança no referencial do layout */
  private craneTip(out: THREE.Vector3): THREE.Vector3 {
    const c = this.model.crane!;
    const r = c.reach * Math.cos(this.cranePitch);
    const h = 0.7 + c.reach * Math.sin(this.cranePitch);
    return out.set(c.base.x - Math.sin(this.craneYaw) * r, c.base.y + h, c.base.z - Math.cos(this.craneYaw) * r);
  }
  /** gancho no referencial do corpo (pivô do vínculo) */
  private hookLocalBody(out: CANNON.Vec3): CANNON.Vec3 {
    this.craneTip(_tv);
    return out.set(_tv.x - this.com.x, _tv.y - this.craneCable - this.com.y, _tv.z - this.com.z);
  }
  hookWorld(out: CANNON.Vec3): CANNON.Vec3 {
    this.hookLocalBody(_v2);
    return this.body.pointToWorldFrame(_v2, out);
  }
  /** abre a tampa traseira e empurra a carga para fora */
  dump(): void {
    this.dumpT = 1.6;
    for (const w of this.cargoWalls) w.collisionResponse = false;
    const f = this.forward(_v2);
    for (const b of this.cargo) {
      b.wakeUp();
      b.velocity.x -= f.x * 3;
      b.velocity.z -= f.z * 3;
      b.velocity.y += 1.5;
    }
  }
  /** engata o reboque `t` (engate traseiro deste ↔ dianteiro do outro), se perto */
  hitchTo(t: Vehicle, maxDist = 1.8): boolean {
    if (this.hitch || t.towedBy || !this.lay.hitchBack || !t.lay.hitchFront) return false;
    const a = this.lay.hitchBack;
    const b = t.lay.hitchFront;
    const pa = new CANNON.Vec3(a.x - this.com.x, 0.02 - this.com.y, a.z + a.hl + 0.22 - this.com.z);
    const pb = new CANNON.Vec3(b.x - t.com.x, 0.02 - t.com.y, b.z - b.hl - 0.22 - t.com.z);
    const wa = this.body.pointToWorldFrame(pa, new CANNON.Vec3());
    const wb = t.body.pointToWorldFrame(pb, new CANNON.Vec3());
    if (wa.distanceTo(wb) > maxDist) return false;
    t.unpark();
    const c = new CANNON.PointToPointConstraint(this.body, pa, t.body, pb, 1e6);
    this.host.world.addConstraint(c);
    this.hitch = { other: t, c };
    t.towedBy = this;
    this.host.sound?.('hitch', this);
    return true;
  }
  unhitch(): void {
    if (!this.hitch) return;
    this.host.world.removeConstraint(this.hitch.c);
    this.hitch.other.towedBy = null;
    this.hitch = null;
  }
  /** desvira (botão para crianças): põe de pé um pouco acima */
  unflip(): void {
    this.unpark();
    const yaw = this.yaw;
    this.body.quaternion.setFromEuler(0, yaw, 0);
    this.body.position.y += 1.2;
    this.body.velocity.setZero();
    this.body.angularVelocity.setZero();
  }

  /* ------------------------------ passo de simulação ------------------------------ */
  /** chame ANTES de world.step */
  /** liga/desliga o modo espelho (outro aparelho simula; aqui o corpo é cinemático) */
  setRemote(on: boolean): void {
    if (on === this.remote) return;
    this.remote = on;
    const b = this.body;
    if (on) {
      this.release();
      if (this.hitch) this.unhitch();
      this.driver = false;
      this.toolOn = false;
      this.craneMode = false;
      this.input.steer = this.input.throttle = this.input.up = 0;
      b.type = CANNON.Body.KINEMATIC;
      b.velocity.setZero();
      b.angularVelocity.setZero();
      for (const w of this.cargoWalls) w.collisionResponse = true;
      this.dumpT = 0;
    } else {
      b.type = CANNON.Body.DYNAMIC;
      b.updateMassProperties();
      b.inertia.scale(1.4, b.inertia);
      b.invInertia.set(1 / b.inertia.x, 1 / b.inertia.y, 1 / b.inertia.z);
      b.updateInertiaWorld(true);
      b.wakeUp();
    }
    b.aabbNeedsUpdate = true;
  }

  /** esterço aplicado agora (rad, para a rede) */
  get steerAngle(): number {
    return this.steerNow;
  }
  /** passo do espelho: só direção das rodas e telemetria (sem forças) */
  private remoteStep(): void {
    const rv = this.rv;
    this.engineOn = this.netEngine;
    this.load = this.netEngine ? Math.min(1, Math.abs(this.speed) / 8) : 0;
    if (rv) {
      for (let i = 0; i < rv.wheelInfos.length; i++) {
        rv.applyEngineForce(0, i);
        rv.setBrake(0, i);
        if (this.lay.wheels[i].steer && this.stats.kind !== 'tracked') rv.setSteeringValue(-this.netSteer, i);
      }
    }
  }

  preStep(dt: number): void {
    if (this.remote) return this.remoteStep();
    const b = this.body;
    const g = Math.abs(this.host.world.gravity.y) || 20;
    const s = this.stats;
    const inp = this.driver ? this.input : { steer: 0, throttle: 0, brake: !this.towedBy, up: 0 };
    this.hitT = Math.max(0, this.hitT - dt);
    if (this.dumpT > 0) {
      this.dumpT -= dt;
      if (this.dumpT <= 0) for (const w of this.cargoWalls) w.collisionResponse = true;
    }
    // estacionar sozinho
    const still = b.velocity.lengthSquared() < 0.04 && b.angularVelocity.lengthSquared() < 0.04;
    if (!this.driver && !this.towedBy && !this.grabbed && !this.hitch && still) {
      this.stillT += dt;
      if (this.stillT > 1.5 && !this.parked) this.park();
    } else this.stillT = 0;
    if (this.parked) {
      this.load = 0;
      return;
    }
    this.cargoT -= dt;
    if (this.cargoT <= 0) {
      this.cargoT = 0.25;
      this.scanCargo();
    }

    const fwd = this.forward(_fwd);
    const v = b.velocity.dot(fwd);
    this.speed = v;
    this.odometer += Math.abs(v) * dt;
    const run = this.driver && this.canRun;
    this.engineOn = run;
    const P = s.power * (0.4 + 0.6 * Math.min(1, this.health * 2));
    let mech = 0;
    let used = 0;

    // ---- rodas / esteiras ----
    const rv = this.rv;
    if (rv) {
      const n = rv.wheelInfos.length;
      const target = inp.throttle * this.cruiseCap * (inp.throttle < 0 ? 0.45 : 1);
      let F = 0;
      let brake = 0;
      const air = s.kind === 'heli' || s.kind === 'plane';
      if (inp.brake) brake = 1;
      else if (Math.abs(inp.throttle) < 0.04) brake = 0.12;
      else if (v * target < 0 && Math.abs(v) > 0.6) brake = 1;
      else if (run && (!air || s.kind === 'plane')) {
        const err = target - v;
        let u = clamp(err * 2.5, -1, 1);
        if (Math.abs(v) > (s.vmaxWheels || 99)) u = 0;
        if (s.kind === 'plane') u = Math.max(u, inp.up);
        F = u * driveForce(P, v);
      }
      const drive: number[] = [];
      let contact = 0;
      for (let i = 0; i < n; i++) if (rv.wheelInfos[i].isInContact) contact++;
      const tracked = s.kind === 'tracked';
      if (s.kind === 'plane') {
        // avião: a hélice empurra (abaixo); rodas livres
        for (let i = 0; i < n; i++) drive.push(0);
      } else {
        const per = contact ? F / contact : 0;
        for (let i = 0; i < n; i++) {
          const w = this.lay.wheels[i];
          let f = rv.wheelInfos[i].isInContact ? per : 0;
          if (tracked && rv.wheelInfos[i].isInContact && run) {
            // tração diferencial: uma esteira para frente, a outra para trás (gira parado)
            f *= 1 + clamp(inp.steer, -1, 1) * 0.6 * (w.side > 0 ? -1 : 1);
            f += (w.side > 0 ? -1 : 1) * clamp(inp.steer, -1, 1) * driveForce(P, 2) * 0.5 / Math.max(1, contact);
          }
          drive.push(f);
        }
      }
      // limite de aderência do conjunto (não "sobe parede")
      for (let i = 0; i < n; i++) {
        rv.applyEngineForce(drive[i], i);
        // freio fixo (dimensionado pelo veículo vazio): carregado, para mais longe
        rv.setBrake(brake * b.mass * 0.05, i);
      }
      if (F * v > 0 || (F !== 0 && Math.abs(v) < 0.5)) mech += Math.abs(F) * Math.max(Math.abs(v), 0.3);
      used = Math.abs(F) / Math.max(1, driveForce(P, v));
      // direção
      const maxSteer = 0.55 / (1 + Math.abs(v) * 0.07);
      this.steerNow += (clamp(inp.steer, -1, 1) * maxSteer - this.steerNow) * Math.min(1, dt * 8);
      if (!tracked) for (let i = 0; i < n; i++) if (this.lay.wheels[i].steer) rv.setSteeringValue(-this.steerNow, i); // + no cannon = esquerda com as rodas da frente em −Z
      // esteiras/sem esterço: ajuda a girar (inclusive parado)
      const steerless = tracked || !this.lay.wheels.some((w) => w.steer);
      if (steerless && contact > 0 && run && Math.abs(inp.steer) > 0.05) {
        const want = -inp.steer * (tracked ? 1.1 : 0.8) * (v < -0.3 ? -1 : 1);
        const up = this.up(_v);
        const cur = b.angularVelocity.dot(up);
        const k = Math.min(1, dt * (tracked ? 14 : 6)) * (want - cur);
        b.angularVelocity.x += up.x * k;
        b.angularVelocity.y += up.y * k;
        b.angularVelocity.z += up.z * k;
        mech += Math.abs(k) * b.mass * 2;
      }
    }

    // ---- arrasto do ar + rolagem (o RaycastVehicle não tem) ----
    const cd = dragOf(this.lay.hw * 2);
    const sp2 = b.velocity.lengthSquared();
    if (sp2 > 0.01) {
      const sp = Math.sqrt(sp2);
      const k = (cd * sp + (this.wheelsOnGround ? CRR * (b.mass + this.cargoMass) * g : 0)) / sp;
      b.applyForce(_v.set(-b.velocity.x * k, 0, -b.velocity.z * k));
    }

    // ---- água: empuxo nas boias / casco ----
    const wl = this.host.waterLevel;
    let wet = 0;
    if (wl && this.lay.floats.length) {
      const per = 1 / (this.lay.floats.length * 3);
      const pv = new CANNON.Vec3();
      for (const f of this.lay.floats) {
        const B = f.def.buoy! / 3;
        for (let i = 0; i < 3; i++) {
          const pz = f.z - f.hl * 0.8 + f.hl * 0.8 * i;
          const p = this.toWorld(f.x, -DECK_T - 0.12, pz, _v);
          const lvl = wl(p.x, p.z);
          if (!isFinite(lvl)) continue;
          const sub = clamp((lvl - (p.y - 0.26)) / 0.52, 0, 1);
          if (sub <= 0) continue;
          wet += sub * per;
          b.getVelocityAtWorldPoint(p, pv);
          const fy = B * g * sub - pv.y * B * sub * 1.5;
          p.vsub(b.position, _rel); // applyForce quer o ponto RELATIVO ao centro
          b.applyForce(new CANNON.Vec3(0, Math.max(0, fy), 0), _rel);
        }
      }
      if (wet > 0) {
        // arrasto da água (frente pouco, lado muito) + giro
        const right = b.quaternion.vmult(new CANNON.Vec3(1, 0, 0));
        const vs = b.velocity.dot(right);
        const kf = cd * 4 * Math.abs(v) * wet;
        const ks = b.mass * 2.5 * wet;
        b.applyForce(new CANNON.Vec3(-fwd.x * v * kf - right.x * vs * ks, -b.velocity.y * b.mass * 0.8 * wet, -fwd.z * v * kf - right.z * vs * ks));
        b.angularVelocity.scale(1 - Math.min(0.5, dt * 2.5 * wet), b.angularVelocity);
      }
    }
    // hélice (barco: na água; avião: no ar)
    if (s.tools.props > 0 && run && (s.kind === 'water' || wet > 0.05 || s.kind === 'plane')) {
      const thr = s.kind === 'plane' ? Math.max(inp.up, inp.throttle) : inp.throttle;
      const capV = s.kind === 'plane' ? 34 : this.cruiseCap;
      const err = thr * capV * (thr < 0 ? 0.4 : 1) - v;
      const u = s.kind === 'plane' ? clamp(thr, 0, 1) : clamp(err * 0.8, -1, 1);
      const F = u * driveForce(P * (s.kind === 'plane' ? 1 : 0.7), v);
      b.applyForce(_v.set(fwd.x * F, fwd.y * F, fwd.z * F));
      mech += Math.abs(F * Math.max(Math.abs(v), 0.5));
      used = Math.max(used, Math.abs(u));
      if (s.kind === 'water' || wet > 0.05) {
        // leme
        const want = -inp.steer * 1.0 * Math.min(1, Math.abs(v) / 2 + 0.35) * (v < -0.2 ? -1 : 1);
        b.angularVelocity.y += (want - b.angularVelocity.y) * Math.min(1, dt * 3);
      }
    }

    // ---- helicóptero ----
    if (s.kind === 'heli') {
      const total = b.mass + this.cargoMass + (this.grabbed ? this.grabbed.mass : 0);
      const maxLift = run ? P * KP * 0.2 : 0;
      const vy = b.velocity.y;
      const wantVy = inp.up * 5;
      const hover = this.driver && run && (inp.up > 0.05 || this.wheelsOnGround < 2);
      let lift = 0;
      if (hover) lift = clamp(total * g + (wantVy - vy) * total * 2.5, 0, maxLift);
      if (lift > 0) {
        b.applyForce(_v.set(0, lift, 0));
        // anda na direção do nariz
        const wantV = inp.throttle * this.cruiseCap;
        const fx = (fwd.x * wantV - b.velocity.x) * total * 1.4;
        const fz = (fwd.z * wantV - b.velocity.z) * total * 1.4;
        b.applyForce(_v.set(fx, 0, fz));
        // fica de pé + gira no eixo
        this.selfRight(dt, 5, -inp.steer * 1.5, clamp((wantV - v) * 0.03, -0.25, 0.25));
        mech += lift * 2 + Math.hypot(fx, fz) * 0.5;
        used = lift / Math.max(1, maxLift);
      }
    }
    // ---- avião (arcade estável) ----
    if (s.kind === 'plane') {
      const air = this.wheelsOnGround === 0;
      const total = b.mass + this.cargoMass;
      // sustentação ∝ v²; o manche pede uma razão de subida (baixo = sobe), sem input mantém a altura
      const liftMax = s.tools.wings * 1.1 * Math.max(0, v) * Math.max(0, v);
      const wantVy = air ? -inp.throttle * 6 : -inp.throttle > 0.3 ? 3 : 0;
      const need = total * g + (wantVy - b.velocity.y) * total * 2;
      const lift = clamp(need, 0, liftMax);
      if (lift > 0) b.applyForce(_v.set(0, lift, 0));
      mech += lift * 0.15 * Math.max(0, v) * 0.1;
      if (air) {
        // quilha: a velocidade segue o nariz (curva de verdade)
        const right = b.quaternion.vmult(RIGHT_L, new CANNON.Vec3());
        const vs = b.velocity.dot(right);
        b.applyForce(new CANNON.Vec3(-right.x * vs * total * 2, 0, -right.z * vs * total * 2));
        const climb = clamp(b.velocity.y / Math.max(4, Math.abs(v)), -0.5, 0.5);
        this.selfRight(dt, 4, -inp.steer * 0.9, -climb, -inp.steer * 0.5);
      }
    }

    // ---- consumo ----
    if (run) {
      const rate = burnRate(s.power, s.burn, mech);
      const e = rate * dt;
      if (s.fuel !== 'none') {
        this.fuel = Math.max(0, this.fuel - e);
        this.fuelUsed += e;
        if (this.fuel <= 0) this.host.say?.('', this);
      }
    }
    this.load += (clamp(used, 0, 1) - this.load) * Math.min(1, dt * 5);

    // ---- guindaste ----
    const c = this.model.crane;
    if (c) {
      const ci = this.craneIn;
      this.craneYaw += ci.yaw * dt * 1.2;
      this.cranePitch = clamp(this.cranePitch + ci.pitch * dt * 0.7, -0.15, 1.15);
      this.craneCable = clamp(this.craneCable + ci.winch * dt * 1.6, 0.4, 4);
      if (this.grabC) this.hookLocalBody(this.grabC.pivotA);
    }
    // ---- ferramentas de terreno ----
    this.toolT -= dt;
    if (this.toolOn && this.driver && run && this.toolT <= 0) this.useTerrainTool();
  }

  /** põe o veículo "de pé" (ar): pitch > 0 = nariz para baixo; bank > 0 = inclina para a direita */
  private selfRight(dt: number, k: number, yawRate: number, pitch: number, bank = 0): void {
    const b = this.body;
    const up = this.up(new CANNON.Vec3());
    const fwd = this.forward(new CANNON.Vec3());
    const rt = b.quaternion.vmult(RIGHT_L, new CANNON.Vec3());
    const want = new CANNON.Vec3(fwd.x * pitch + rt.x * bank, 1, fwd.z * pitch + rt.z * bank);
    want.normalize();
    const axis = up.cross(want);
    const kk = Math.min(1, dt * k);
    b.angularVelocity.x += (axis.x * k - b.angularVelocity.x) * kk;
    b.angularVelocity.z += (axis.z * k - b.angularVelocity.z) * kk;
    b.angularVelocity.y += (yawRate - b.angularVelocity.y) * kk;
  }

  private useTerrainTool(): void {
    const s = this.stats;
    const h = this.host;
    if (s.tools.drill && h.dig) {
      this.toolT = 0.14;
      const sp = this.lay.spots.find((x) => x.def.cat === 'drill')!;
      const p = this.toWorld(sp.x, -0.25, -this.lay.hl - 1.05, _v);
      // a broca morde o chão à frente (e um pouco abaixo): dá para abrir túnel/rampa
      const top = h.heightAt ? h.heightAt(p.x, p.z) : p.y;
      const got = h.dig(p.x, Math.min(p.y - 0.3, top - 0.15), p.z, 0.85);
      if (got && got.size) {
        const left = this.store(got);
        if (left.size) h.onItems?.(this, left);
        h.sound?.('dig', this);
      }
    }
    if (s.tools.blade && h.flatten) {
      this.toolT = 0.2;
      const p = this.toWorld(0, 0, -this.lay.hl - 0.8, _v);
      const ground = this.groundY();
      if (ground !== null) h.flatten(p.x, p.z, this.lay.hw + 0.4, ground);
    }
    if (s.tools.plow && h.till) {
      this.toolT = 0.25;
      const p = this.toWorld(0, 0, this.lay.hl + 0.4, _v);
      h.till(p.x, p.z, this.lay.hw);
    }
  }
  /** altura média do chão sob as rodas em contato */
  groundY(): number | null {
    if (!this.rv) return null;
    let y = 0;
    let n = 0;
    for (const w of this.rv.wheelInfos)
      if (w.isInContact) {
        y += w.raycastResult.hitPointWorld.y;
        n++;
      }
    return n ? y / n : null;
  }

  private scanCargo(): void {
    // "cintas": carga dentro da caçamba balança menos (sai com a mão, o guindaste ou basculando)
    for (const o of this.cargo) {
      const sv = (o as unknown as { _mvDamp?: [number, number] })._mvDamp;
      if (sv) [o.linearDamping, o.angularDamping] = sv;
    }
    this.cargo.clear();
    this.cargoMass = 0;
    if (!this.lay.cargo.length) return;
    const lp = new CANNON.Vec3();
    const pad = 0.15;
    for (const o of this.host.world.bodies) {
      if (o.type !== CANNON.Body.DYNAMIC || o === this.body || (o as unknown as { vehicle?: Vehicle }).vehicle) continue;
      if (o.position.distanceSquared(this.body.position) > 64) continue;
      this.toLocal(o.position, lp);
      if (lp.y < -0.2 || lp.y > 2.2) continue;
      for (const s of this.lay.cargo)
        if (Math.abs(lp.x - s.x) < s.hw + pad && Math.abs(lp.z - s.z) < s.hl + pad) {
          this.cargo.add(o);
          this.cargoMass += o.mass;
          break;
        }
    }
    // a força da mola do cannon é k·x·(massa do chassi): sem isso a carga faria a suspensão bater no fim
    if (this.rv) {
      const k = STIFF * (1 + (0.75 * this.cargoMass) / this.body.mass);
      for (const w of this.rv.wheelInfos) w.suspensionStiffness = k;
    }
    if (this.dumpT > 0 || this.grabbed) return;
    for (const o of this.cargo) {
      const h = o as unknown as { _mvDamp?: [number, number] };
      h._mvDamp ??= [o.linearDamping, o.angularDamping];
      o.linearDamping = Math.max(h._mvDamp[0], 0.35);
      o.angularDamping = Math.max(h._mvDamp[1], 0.85);
    }
  }
  /** espaço livre nas caçambas (toras) */
  get cargoFree(): number {
    return Math.max(0, this.stats.cargo - this.cargo.size);
  }

  /* ------------------------------ visual ------------------------------ */
  /** copia a pose da física para o modelo (chame depois de world.step) */
  syncModel(dt = 0): void {
    const m = this.model;
    const b = this.body;
    m.root.position.set(b.position.x, b.position.y, b.position.z);
    m.root.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    // desloca pelo centro de massa (o modelo está no referencial do layout)
    _tv.set(-this.com.x, -this.com.y, -this.com.z).applyQuaternion(m.root.quaternion);
    m.root.position.add(_tv);
    m.root.updateMatrixWorld();
    if (this.rv && m.wheels && !this.parked) {
      _tmi.copy(m.root.matrixWorld).invert();
      for (let i = 0; i < this.rv.wheelInfos.length; i++) {
        if (m.wheelInst[i] < 0) continue;
        const wi = this.rv.wheelInfos[i];
        const inC = wi.isInContact;
        this.rv.updateWheelTransform(i);
        wi.isInContact = inC; // updateWheelTransform zera o contato (o passo seguinte precisa dele)
        const t = wi.worldTransform;
        _tm.compose(_tv.set(t.position.x, t.position.y, t.position.z), _tq.set(t.quaternion.x, t.quaternion.y, t.quaternion.z, t.quaternion.w), _one);
        _tm.premultiply(_tmi);
        _tm.decompose(_wp, _wq, _ws);
        poseWheel(m, i, _wp, _wq);
      }
      m.wheels.instanceMatrix.needsUpdate = true;
    }
    // giratórios
    this.spinA += dt * (this.engineOn ? 0.25 + this.load : 0);
    for (const sp of m.spinners) {
      const on = sp.kind === 'drill' ? this.toolOn && this.engineOn : this.engineOn;
      if (!on && sp.kind !== 'rotor') continue;
      const rate = sp.rate * (sp.kind === 'rotor' ? (this.engineOn ? 0.5 + this.load : 0.15) : 1);
      sp.o.rotation[sp.axis] += dt * rate * (on ? 1 : 0.2);
    }
    const c = m.crane;
    if (c) {
      c.yaw.rotation.y = this.craneYaw;
      c.boom.rotation.x = this.cranePitch;
      this.craneTip(_tv);
      c.hook.position.set(_tv.x, _tv.y - this.craneCable, _tv.z);
      c.cable.position.set(_tv.x, _tv.y - this.craneCable / 2, _tv.z);
      c.cable.scale.set(0.02, this.craneCable, 0.02);
    }
  }

  /* ------------------------------ salvar ------------------------------ */
  save(): VehicleState {
    const b = this.body;
    return {
      design: this.design,
      x: b.position.x,
      y: b.position.y,
      z: b.position.z,
      q: [b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w],
      fuel: this.fuel,
      hp: this.hp,
      items: [...this.items],
    };
  }
  /** altura do centro do corpo acima do chão para nascer apoiado nas rodas */
  static spawnHeight(d: VehicleDesign): number {
    return restHeight(layout(d)) + 0.25;
  }
  fuelKind(): FuelKind {
    return this.stats.fuel;
  }
}

export type { Spot };
