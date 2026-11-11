/* ============================================================
 *  NOITES — VEÍCULOS: projeto modular (encaixa peças em espaços
 *  fixos do chassi), 5 modelos prontos, custo, e física no host
 *  (cannon-es RaycastVehicle). Toras na caçamba são corpos físicos:
 *  a MASSA muda aceleração, frenagem, subida e gasto de combustível.
 *  Formato pequeno e estável (VDesign v1): salvo por jogador e
 *  repassado pela sala online. Frente do veículo = +Z local.
 * ============================================================ */
import * as CANNON from 'cannon-es';
import { t } from '../../i18n';
import { WORLD_R, CAMP_R, CDEFS, CK, type Res } from './data';
import type { Bag, LightSrc, Player, Sim } from './sim';
import { NODE_R, treeR } from './world';

export type Engine = 'pedal' | 'coal' | 'gas' | 'elec';
export interface VDesign {
  v: 1;
  id: string;
  name: string;
  /** chassi: 0 pequeno, 1 médio, 2 grande */
  ch: 0 | 1 | 2;
  /** rodas: 0 pequenas, 1 grandes, 2 de tração */
  wh: 0 | 1 | 2;
  en: Engine;
  /** nível do motor 1..3 */
  tier: 1 | 2 | 3;
  seats: 1 | 2 | 3 | 4;
  /** caçamba: 0 nenhuma, 1 pequena, 2 grande */
  cargo: 0 | 1 | 2;
  trailer: 0 | 1;
  /** faróis: 0 nenhum, 1 faróis, 2 holofote noturno */
  lights: 0 | 1 | 2;
  winch: 0 | 1;
  col: string;
}

export const READY: VDesign[] = [
  { v: 1, id: 'kart', name: '', ch: 0, wh: 0, en: 'pedal', tier: 1, seats: 1, cargo: 0, trailer: 0, lights: 1, winch: 0, col: '#ff4f6a' },
  { v: 1, id: 'pickup', name: '', ch: 1, wh: 1, en: 'gas', tier: 1, seats: 2, cargo: 1, trailer: 0, lights: 1, winch: 0, col: '#3a8aff' },
  { v: 1, id: 'tractor', name: '', ch: 1, wh: 1, en: 'coal', tier: 1, seats: 1, cargo: 0, trailer: 1, lights: 1, winch: 0, col: '#3ec05a' },
  { v: 1, id: 'hauler', name: '', ch: 2, wh: 2, en: 'gas', tier: 2, seats: 2, cargo: 2, trailer: 0, lights: 1, winch: 1, col: '#ffb02e' },
  { v: 1, id: 'buggy', name: '', ch: 0, wh: 2, en: 'elec', tier: 1, seats: 2, cargo: 0, trailer: 0, lights: 2, winch: 0, col: '#8a5cff' },
];
export function vName(d: VDesign): string {
  switch (d.id) {
    case 'kart':
      return t('noites.v.kart', 'Kart de Pedal');
    case 'pickup':
      return t('noites.v.pickup', 'Picape');
    case 'tractor':
      return t('noites.v.tractor', 'Trator com Reboque');
    case 'hauler':
      return t('noites.v.hauler', 'Carregadão');
    case 'buggy':
      return t('noites.v.buggy', 'Buggy Lanterna');
  }
  return d.name || t('noites.v.mine', 'Meu veículo');
}

const ENERGY: Record<Engine, Res | null> = { pedal: null, coal: 'coal', gas: 'fuel', elec: 'battery' };
/** unidades de energia por item */
export const ENERGY_PER: Partial<Record<Res, number>> = { coal: 15, fuel: 20, battery: 25 };

export interface VStats {
  mass: number;
  w: number;
  h: number;
  l: number;
  /** comprimento total com reboque */
  lt: number;
  wheelR: number;
  slip: number;
  force: number;
  vmax: number;
  fuelCap: number;
  energy: Res | null;
  /** toras que cabem */
  cap: number;
  burn: number;
  lightR: number;
  cost: Bag;
  bench: number;
}
export function stats(d: VDesign): VStats {
  const w = [1.5, 1.9, 2.2][d.ch];
  const h = [0.35, 0.45, 0.55][d.ch];
  const l = [2.3, 3.2, 4.2][d.ch];
  const lt = l + (d.trailer ? 3.2 : 0);
  const wheelR = [0.36, 0.55, 0.5][d.wh];
  const slip = [2.2, 2.8, 4.6][d.wh];
  const mass = [260, 480, 780][d.ch] + (d.trailer ? 220 : 0) + d.seats * 30 + (d.en === 'pedal' ? 0 : 90 * d.tier);
  const forceK = d.en === 'pedal' ? 2.6 : [0, 5.5, 7.5, 9.5][d.tier] * (d.en === 'gas' ? 1.1 : d.en === 'elec' ? 1 : 0.95);
  const cap = ([0, 6, 12][d.cargo] + (d.trailer ? 12 : 0)) * (d.cargo || d.trailer ? 1 : 0) + (d.cargo || d.trailer ? (d.tier - 1) * 2 : 0);
  const cost: Bag = {};
  const add = (k: Res, n: number) => n > 0 && (cost[k] = (cost[k] ?? 0) + n);
  add('wood', [6, 10, 16][d.ch]);
  add('scrap', [2, 4, 7][d.ch] + [4, 6, 8][d.wh]);
  add('fiber', d.seats * 2);
  if (d.en !== 'pedal') add('scrap', 3 * d.tier);
  if (d.en === 'coal') add('stone', 3 * d.tier);
  if (d.en === 'gas') add('sap', d.tier);
  if (d.en === 'elec') add('spark', 3 * d.tier);
  if (d.tier > 1) add('spark', 2 * d.tier);
  add('wood', [0, 4, 8][d.cargo] + (d.trailer ? 8 : 0));
  add('scrap', d.trailer ? 4 : 0);
  if (d.lights) add('spark', d.lights * 2);
  if (d.winch) add('scrap', 5);
  return {
    mass,
    w,
    h,
    l,
    lt,
    wheelR,
    slip,
    force: mass * forceK,
    vmax: d.en === 'pedal' ? 7 : [0, 11, 14, 17][d.tier],
    fuelCap: d.en === 'pedal' ? 0 : [0, 60, 90, 120][d.tier],
    energy: ENERGY[d.en],
    cap,
    burn: d.en === 'pedal' ? 0 : 0.5 + 0.15 * d.tier,
    lightR: [0, 6, 10][d.lights],
    cost,
    bench: Math.max(2, d.tier + 1),
  };
}

const COLS = /^#[0-9a-f]{6}$/i;
/** valida um projeto vindo da rede/armazenamento (nunca confia) */
export function validDesign(o: unknown): VDesign | null {
  if (!o || typeof o !== 'object') return null;
  const d = o as Record<string, unknown>;
  const pick = <T>(v: unknown, ok: readonly T[], def: T): T => (ok.includes(v as T) ? (v as T) : def);
  return {
    v: 1,
    id: typeof d.id === 'string' && /^[a-z0-9-]{1,24}$/.test(d.id) ? d.id : 'c' + Math.floor(Math.random() * 1e6),
    name: typeof d.name === 'string' ? d.name.replace(/[<>&"]/g, '').slice(0, 18) : '',
    ch: pick(d.ch, [0, 1, 2] as const, 0),
    wh: pick(d.wh, [0, 1, 2] as const, 0),
    en: pick(d.en, ['pedal', 'coal', 'gas', 'elec'] as const, 'pedal'),
    tier: pick(d.tier, [1, 2, 3] as const, 1),
    seats: pick(d.seats, [1, 2, 3, 4] as const, 1),
    cargo: pick(d.cargo, [0, 1, 2] as const, 0),
    trailer: pick(d.trailer, [0, 1] as const, 0),
    lights: pick(d.lights, [0, 1, 2] as const, 0),
    winch: pick(d.winch, [0, 1] as const, 0),
    col: typeof d.col === 'string' && COLS.test(d.col) ? d.col : '#ff4f6a',
  };
}

/* ------------------------------ física (host) ------------------------------ */
export const LOG_MASS = 22;
const GROUND = 1;
const LOGS = 2;
const BODY = 4;

export interface Veh {
  id: number;
  d: VDesign;
  st: VStats;
  body: CANNON.Body;
  rv: CANNON.RaycastVehicle;
  nWheels: number;
  front: number[];
  fuel: number;
  driver: string;
  riders: string[];
  thr: number;
  steer: number;
  logs: CANNON.Body[];
  /** posição/rotação para a rede e a vista */
  x: number;
  y: number;
  z: number;
  q: [number, number, number, number];
  speed: number;
  spin: number;
  noFuelT: number;
  owner: string;
  hitT: number;
}

export interface Loose {
  id: number;
  x: number;
  z: number;
}

export class Vehicles {
  world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  list: Veh[] = [];
  loose: Loose[] = [];
  ver = 0;
  private statics = new Map<number, CANNON.Body>();
  private staticT = 0;
  private nextId = 1;
  /** limite global de toras físicas (pelo nível de qualidade do host) */
  maxLogs = 40;

  constructor(private sim: Sim) {
    const w = this.world;
    w.broadphase = new CANNON.SAPBroadphase(w);
    w.allowSleep = true;
    (w.solver as CANNON.GSSolver).iterations = 8;
    w.defaultContactMaterial.friction = 0.45;
    w.defaultContactMaterial.restitution = 0.05;
    // chão com colinas (heightfield)
    const R = WORLD_R + 6;
    const es = 2;
    const n = Math.ceil((2 * R) / es) + 1;
    const data: number[][] = [];
    for (let i = 0; i < n; i++) {
      const row: number[] = [];
      for (let j = 0; j < n; j++) row.push(sim.w.height(-R + i * es, R - j * es));
      data.push(row);
    }
    const hf = new CANNON.Heightfield(data, { elementSize: es });
    const g = new CANNON.Body({ mass: 0, collisionFilterGroup: GROUND, collisionFilterMask: BODY | LOGS });
    g.addShape(hf);
    g.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    g.position.set(-R, 0, R);
    w.addBody(g);
    // fogueira e bancada
    const fire = new CANNON.Body({ mass: 0, collisionFilterGroup: GROUND, collisionFilterMask: BODY | LOGS });
    fire.addShape(new CANNON.Cylinder(1.2, 1.2, 1, 10));
    fire.position.set(0, 0.5, 0);
    w.addBody(fire);
  }

  spawn(d: VDesign, x: number, z: number, yaw: number, owner: string): Veh {
    const st = stats(d);
    const body = new CANNON.Body({ mass: st.mass, collisionFilterGroup: BODY, collisionFilterMask: GROUND | LOGS | BODY });
    body.addShape(new CANNON.Box(new CANNON.Vec3(st.w / 2, st.h / 2, st.l / 2)), new CANNON.Vec3(0, 0, 0));
    if (d.trailer) body.addShape(new CANNON.Box(new CANNON.Vec3(st.w / 2, st.h / 2, 1.4)), new CANNON.Vec3(0, 0, -st.l / 2 - 1.6));
    // paredes da caçamba
    const walls = (cz: number, len: number) => {
      const hh = 0.32;
      body.addShape(new CANNON.Box(new CANNON.Vec3(0.06, hh, len / 2)), new CANNON.Vec3(st.w / 2 - 0.06, st.h / 2 + hh, cz));
      body.addShape(new CANNON.Box(new CANNON.Vec3(0.06, hh, len / 2)), new CANNON.Vec3(-st.w / 2 + 0.06, st.h / 2 + hh, cz));
      body.addShape(new CANNON.Box(new CANNON.Vec3(st.w / 2, hh, 0.06)), new CANNON.Vec3(0, st.h / 2 + hh, cz - len / 2));
      body.addShape(new CANNON.Box(new CANNON.Vec3(st.w / 2, hh, 0.06)), new CANNON.Vec3(0, st.h / 2 + hh, cz + len / 2));
    };
    const cl = cargoLen(d, st);
    if (d.cargo) walls(-st.l / 2 + cl / 2 + 0.05, cl);
    if (d.trailer) walls(-st.l / 2 - 1.6, 2.7);
    body.position.set(x, this.sim.w.height(x, z) + st.wheelR + 0.8, z);
    body.quaternion.setFromEuler(0, yaw, 0);
    body.angularDamping = 0.4;
    body.linearDamping = 0.05;
    body.allowSleep = false;
    const rv = new CANNON.RaycastVehicle({ chassisBody: body, indexRightAxis: 0, indexUpAxis: 1, indexForwardAxis: 2 });
    const STIFF = 30;
    const rest = 0.35;
    const axles: [number, boolean][] = [
      [st.l / 2 - st.wheelR - 0.1, true],
      [-st.l / 2 + st.wheelR + 0.15, false],
    ];
    if (d.trailer) axles.push([-st.l / 2 - 2.4, false]);
    const front: number[] = [];
    for (const [az, isFront] of axles)
      for (const sx of [-1, 1]) {
        const idx = rv.addWheel({
          radius: st.wheelR,
          directionLocal: new CANNON.Vec3(0, -1, 0),
          suspensionStiffness: STIFF,
          suspensionRestLength: rest,
          frictionSlip: st.slip,
          dampingRelaxation: 2.4,
          dampingCompression: 4.2,
          maxSuspensionForce: 1e6,
          rollInfluence: 0.03,
          axleLocal: new CANNON.Vec3(1, 0, 0),
          chassisConnectionPointLocal: new CANNON.Vec3(sx * (st.w / 2 + 0.05), -st.h / 2 + 0.05, az),
          maxSuspensionTravel: 0.35,
          customSlidingRotationalSpeed: -30,
          useCustomSlidingRotationalSpeed: true,
        });
        if (isFront) front.push(idx);
      }
    rv.addToWorld(this.world);
    const v: Veh = { id: this.nextId++, d, st, body, rv, nWheels: axles.length * 2, front, fuel: st.fuelCap * 0.5, driver: '', riders: [], thr: 0, steer: 0, logs: [], x, y: 0, z, q: [0, 0, 0, 1], speed: 0, spin: 0, noFuelT: 0, owner, hitT: 0 };
    this.list.push(v);
    this.ver++;
    this.sync(v);
    return v;
  }
  remove(v: Veh): void {
    for (const l of v.logs) this.world.removeBody(l);
    v.rv.removeFromWorld(this.world);
    this.list = this.list.filter((q) => q !== v);
    this.ver++;
  }
  get(id: number): Veh | undefined {
    return this.list.find((v) => v.id === id);
  }
  load(v: Veh): number {
    return v.logs.length;
  }
  /** coloca n toras (corpos) na caçamba; devolve quantas couberam */
  addLogs(v: Veh, n: number): number {
    let k = 0;
    const total = this.list.reduce((s, q) => s + q.logs.length, 0);
    while (k < n && v.logs.length < v.st.cap && total + k < this.maxLogs) {
      const cz = v.d.cargo ? -v.st.l / 2 + cargoLen(v.d, v.st) / 2 : -v.st.l / 2 - 1.6;
      const useTrailer = v.d.trailer && (!v.d.cargo || v.logs.length >= [0, 6, 12][v.d.cargo]);
      const lz = useTrailer ? -v.st.l / 2 - 1.6 : cz;
      const local = new CANNON.Vec3((Math.random() - 0.5) * 0.3, v.st.h / 2 + 0.5 + (v.logs.length % 4) * 0.35, lz + (Math.random() - 0.5) * 0.6);
      const wp = v.body.pointToWorldFrame(local);
      const b = new CANNON.Body({ mass: LOG_MASS, collisionFilterGroup: LOGS, collisionFilterMask: GROUND | LOGS | BODY });
      b.addShape(new CANNON.Cylinder(0.16, 0.16, Math.min(1.1, v.st.w - 0.3), 8));
      b.position.copy(wp);
      // tora deitada de lado (eixo do cilindro = X do veículo)
      const q = new CANNON.Quaternion().setFromEuler(0, 0, Math.PI / 2);
      b.quaternion.copy(v.body.quaternion.mult(q));
      b.velocity.copy(v.body.velocity);
      b.linearDamping = 0.05;
      b.angularDamping = 0.3;
      this.world.addBody(b);
      v.logs.push(b);
      k++;
    }
    return k;
  }
  /** massa da carga */
  loadMass(v: Veh): number {
    return v.logs.length * LOG_MASS;
  }

  step(dt: number, events: (k: string, o: Record<string, unknown>) => void): void {
    // colisores estáticos (árvores/pedras) só perto dos veículos
    this.staticT -= dt;
    if (this.staticT <= 0) {
      this.staticT = 0.5;
      this.updStatics();
    }
    for (const v of this.list) {
      const st = v.st;
      const b = v.body;
      // frente = +Z local
      const fwd = b.quaternion.vmult(new CANNON.Vec3(0, 0, 1));
      const speed = b.velocity.dot(fwd);
      v.speed = speed;
      const loadK = 1 + this.loadMass(v) / st.mass;
      let thr = v.driver ? v.thr : 0;
      if (st.energy && v.fuel <= 0) {
        if (thr !== 0 && v.noFuelT <= 0) {
          v.noFuelT = 6;
          events('nofuel', { v: v.id, p: v.driver });
        }
        thr = 0;
      }
      v.noFuelT -= dt;
      if (st.energy && thr) v.fuel = Math.max(0, v.fuel - st.burn * Math.abs(thr) * loadK * dt);
      let force = 0;
      let brake = 0;
      if (thr > 0.05) force = speed > st.vmax || speed < -0.6 ? 0 : thr * st.force;
      else if (thr < -0.05) force = speed > 0.8 || speed < -st.vmax * 0.4 ? 0 : thr * st.force * 0.6;
      if ((thr < -0.05 && speed > 0.8) || (thr > 0.05 && speed < -0.6)) brake = st.mass * 0.6;
      else if (Math.abs(thr) < 0.05) brake = st.mass * (v.driver ? 0.05 : 0.4);
      const per = force / v.nWheels;
      for (let i = 0; i < v.nWheels; i++) {
        v.rv.applyEngineForce(-per, i);
        v.rv.setBrake(brake / v.nWheels, i);
      }
      const steerMax = 0.55 / (1 + Math.abs(speed) * 0.05);
      for (const i of v.front) v.rv.setSteeringValue(-v.steer * steerMax, i);
      // endireita (sem capotar de vez)
      const up = b.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
      if (up.y < 0.9) {
        const tq = up.cross(new CANNON.Vec3(0, 1, 0)).scale(st.mass * (up.y < 0.4 ? 18 : 6));
        b.torque.vadd(tq, b.torque);
      }
      v.spin += (speed / st.wheelR) * dt;
    }
    this.world.step(1 / 60, dt, 3);
    for (const v of this.list) {
      this.sync(v);
      // caiu do mapa? volta para perto da fogueira
      if (v.body.position.y < -5) {
        v.body.position.set(6, 3, 6);
        v.body.velocity.setZero();
      }
      // tora caiu para fora: vira tora solta no chão
      for (const l of v.logs) {
        const d = l.position.vsub(v.body.position).length();
        if (d > v.st.lt * 0.7 + 1.5) {
          this.world.removeBody(l);
          this.loose.push({ id: this.nextId++, x: l.position.x, z: l.position.z });
          this.ver++;
          events('logfall', { x: l.position.x, z: l.position.z });
        }
      }
      v.logs = v.logs.filter((l) => l.world === this.world);
      // descarrega sozinho no acampamento
      if (v.logs.length && Math.hypot(v.x, v.z) < CAMP_R + 3) {
        const n = v.logs.length;
        for (const l of v.logs) this.world.removeBody(l);
        v.logs = [];
        events('unload', { v: v.id, n, x: v.x, z: v.z, p: v.driver });
      }
      v.hitT -= 1 / 60;
    }
  }

  private updStatics(): void {
    const need = new Set<number>();
    const W = this.sim.w;
    for (const v of this.list)
      W.each(v.x, v.z, (i) => {
        if (i >= 0 && this.sim.treeT[i]) return;
        if (i >= 0 || (i > -100000 && NODE_R[W.nodes[-1 - i].k] > 0)) need.add(i);
      });
    // mais longe: segunda volta de células
    for (const [i, b] of this.statics)
      if (!need.has(i)) {
        this.world.removeBody(b);
        this.statics.delete(i);
      }
    for (const i of need) {
      if (this.statics.has(i)) continue;
      const b = new CANNON.Body({ mass: 0, collisionFilterGroup: GROUND, collisionFilterMask: BODY | LOGS });
      if (i >= 0) {
        const tr = W.trees[i];
        const r = treeR(tr);
        b.addShape(new CANNON.Cylinder(r, r, 4, 8));
        b.position.set(tr.x, W.height(tr.x, tr.z) + 2, tr.z);
      } else {
        const n = W.nodes[-1 - i];
        b.addShape(new CANNON.Sphere(NODE_R[n.k]));
        b.position.set(n.x, W.height(n.x, n.z) + 0.2, n.z);
      }
      this.world.addBody(b);
      this.statics.set(i, b);
    }
  }

  private sync(v: Veh): void {
    const p = v.body.position;
    const q = v.body.quaternion;
    v.x = p.x;
    v.y = p.y;
    v.z = p.z;
    v.q = [q.x, q.y, q.z, q.w];
  }

  /** lugar do assento i em coordenadas do mundo */
  seatPos(v: Veh, i: number): [number, number, number] {
    const st = v.st;
    const row = Math.floor(i / 2);
    const sx = v.d.seats === 1 ? 0 : i % 2 ? 0.4 : -0.4;
    const p = v.body.pointToWorldFrame(new CANNON.Vec3(sx, st.h / 2 + 0.2, st.l / 2 - 1.0 - row * 0.8));
    return [p.x, p.y, p.z];
  }
  yaw(v: Veh): number {
    const f = v.body.quaternion.vmult(new CANNON.Vec3(0, 0, 1));
    return Math.atan2(f.x, f.z);
  }

  lights(): LightSrc[] {
    const out: LightSrc[] = [];
    for (const v of this.list) {
      if (!v.st.lightR) continue;
      const y = this.yaw(v);
      const k = v.st.lightR * 0.6;
      out.push({ x: v.x + Math.sin(y) * k, z: v.z + Math.cos(y) * k, r: v.st.lightR });
    }
    return out;
  }

  /** Sombrinhas atropeladas (desenho animado: viram brilhinhos) */
  bump(events: (k: string, o: Record<string, unknown>) => void): void {
    for (const v of this.list) {
      if (Math.abs(v.speed) < 4) continue;
      for (const c of this.sim.creatures) {
        const d = Math.hypot(c.x - v.x, c.z - v.z);
        if (d < v.st.l / 2 + CDEFS[c.k].size * 0.5) {
          c.hp -= c.k === CK.King ? 0.5 : 3;
          const k = 8 / (d || 1);
          c.vx += (c.x - v.x) * k;
          c.vz += (c.z - v.z) * k;
          c.lit = 0.4;
          if (v.hitT <= 0) {
            v.hitT = 0.4;
            events('bonk', { x: c.x, z: c.z });
          }
        }
      }
    }
  }

  /** empurra um jogador a pé para fora dos veículos */
  collide(x: number, z: number, r: number): [number, number] {
    for (const v of this.list) {
      const y = this.yaw(v);
      const ca = Math.cos(y);
      const sa = Math.sin(y);
      const dx = x - v.x;
      const dz = z - v.z;
      // coordenadas locais (lx = lado, lz = frente)
      const lx = dx * ca - dz * sa;
      const lz = dx * sa + dz * ca;
      const hx = v.st.w / 2 + r;
      const zMax = v.st.l / 2 + r;
      const zMin = -v.st.lt + v.st.l / 2 - r;
      if (Math.abs(lx) < hx && lz < zMax && lz > zMin) {
        const pushX = hx - Math.abs(lx);
        const pushZ = Math.min(zMax - lz, lz - zMin);
        let nlx = lx;
        let nlz = lz;
        if (pushX < pushZ) nlx = Math.sign(lx || 1) * hx;
        else nlz = zMax - lz < lz - zMin ? zMax : zMin;
        x = v.x + nlx * ca + nlz * sa;
        z = v.z - nlx * sa + nlz * ca;
      }
    }
    return [x, z];
  }

  /** jogador entra (motorista se livre, senão passageiro) */
  enter(p: Player, v: Veh): boolean {
    if (!v.driver) v.driver = p.id;
    else if (v.riders.length < v.d.seats - 1) v.riders.push(p.id);
    else return false;
    p.seat = v.id;
    p.lightOn = false;
    this.ver++;
    return true;
  }
  exit(p: Player): void {
    const v = this.get(p.seat);
    p.seat = -1;
    if (!v) return;
    if (v.driver === p.id) {
      v.driver = v.riders.shift() ?? '';
      v.thr = 0;
      v.steer = 0;
    } else v.riders = v.riders.filter((r) => r !== p.id);
    const y = this.yaw(v);
    [p.x, p.z] = [v.x - Math.cos(y) * (v.st.w / 2 + 0.9), v.z + Math.sin(y) * (v.st.w / 2 + 0.9)];
    this.ver++;
  }
}

export function cargoLen(d: VDesign, st: VStats): number {
  return d.cargo === 0 ? 0 : Math.min(st.l - 1.2 - (d.seats > 2 ? 0.8 : 0), d.cargo === 1 ? 1.3 : 2.4);
}

/* ------------------------------ projetos salvos ------------------------------ */
const VKEY = 'noites-vehicles';
export function loadDesigns(): VDesign[] {
  try {
    const a = JSON.parse(localStorage.getItem(VKEY) ?? '[]');
    return Array.isArray(a) ? (a.map(validDesign).filter(Boolean) as VDesign[]).slice(0, 12) : [];
  } catch {
    return [];
  }
}
export function saveDesigns(a: VDesign[]): void {
  try {
    localStorage.setItem(VKEY, JSON.stringify(a.slice(0, 12)));
  } catch {
    /* */
  }
}
