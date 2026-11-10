/* ============================================================
 *  MONTA & LEVA — simulação física (planck.js / Box2D). Sem DOM: roda no jogo e no verificador.
 *  Passo fixo de 1/60 s com 2 subpassos; velocidades limitadas; rodas com CCD (bullet).
 * ============================================================ */
import { Box, Chain, Circle, Polygon, RevoluteJoint, Vec2, WheelJoint, World, type Body, type Contact, type ContactImpulse, type Fixture, type Joint } from 'planck';
import { analyze, type Analysis } from './design';
import type { CargoDef, CargoType, LevelDef } from './levels';
import { PARTS, THRUST_FUEL, U, cellsOf, triVerts, type Placed } from './parts';
import { resolveTrack, type Track, type TrackObj } from './track';

export interface DriveInput {
  fwd: boolean;
  back: boolean;
  brake: boolean;
  /** propulsores */
  boost: boolean;
}

export interface Upgrades {
  /** 0..2 */
  motor: number;
  grip: number;
  spring: number;
  pad: number;
}

export const DT = 1 / 60;
const SUB = 2;
const V_TARGET = 5.2; // m/s na borda da roda
const MOTOR_TORQUE = 16; // N·m por motor
const BRAKE_TORQUE = 40;
const COAST_TORQUE = 0.25;
const THRUST = 42; // N
const LIFT = 12; // N por balão
const BALLOON_DRAG = 2.6;
const GLASS_BREAK = 3.2; // Δv (m/s) num único passo
const GROUND_LOST = 1.0; // s de carga encostada no chão fora da zona
const TIME_LIMIT = 120;

export type FixKind = 'veh' | 'cargo' | 'ground' | 'obj';
interface FixData {
  k: FixKind;
  ci?: number;
}

export interface SimWheel {
  idx: number;
  body: Body;
  joint: Joint;
  r: number;
  spring: boolean;
  grip: boolean;
  powered: number; // torque máx
  base: Body;
  /** posição de montagem (local do chassi) */
  lx: number;
  ly: number;
}
export interface SimMount {
  idx: number;
  body: Body;
  lx: number;
  ly: number;
  r: number;
  fuel: number;
  on: boolean;
}
export interface SimCargo {
  def: CargoDef;
  bodies: Body[];
  /** estado por peça física (as gotinhas são várias) */
  st: ('ok' | 'lost' | 'broken')[];
  ground: number[];
  zoneT: number[];
}
export interface SimObj {
  o: TrackObj;
  bodies: Body[];
  state: number;
  t: number;
}
export interface FxEvent {
  x: number;
  y: number;
  power: number;
  kind: 'hit' | 'glass' | 'cargo';
}

export type SimResult = null | { win: true } | { win: false; reason: 'lost' | 'broken' | 'time' };

export class Sim {
  world: World;
  track: Track;
  an: Analysis;
  groups: Body[] = [];
  pins: { idx: number; body: Body }[] = [];
  wheels: SimWheel[] = [];
  thrusters: SimMount[] = [];
  balloons: SimMount[] = [];
  cargo: SimCargo[] = [];
  objs: SimObj[] = [];
  main: Body | null = null;
  time = 0;
  flipped = false;
  result: SimResult = null;
  fx: FxEvent[] = [];
  input: DriveInput = { fwd: false, back: false, brake: false, boost: false };
  /** quanto o veículo subiu para não nascer dentro do chão */
  lift = 0;
  maxX = 0;
  private needCount: number;
  private totalPieces: number;
  private groundBody: Body;

  constructor(
    public level: LevelDef,
    public parts: Placed[],
    public up: Upgrades = { motor: 0, grip: 0, spring: 0, pad: 0 },
  ) {
    const w = new World({ gravity: new Vec2(0, -10) });
    this.world = w;
    this.track = resolveTrack(level.track, level.grid[0] * U + 1.5);
    this.an = analyze(parts);
    // chão
    const g = w.createBody();
    this.groundBody = g;
    for (const line of this.track.lines) {
      g.createFixture(new Chain(line.map((p) => new Vec2(p.x, p.y)), false), { friction: 0.9, userData: { k: 'ground' } as FixData });
    }
    const wl = this.track.wall;
    g.createFixture(new Box(0.25, (wl.y1 - wl.y0) / 2, new Vec2(wl.x + 0.25, (wl.y0 + wl.y1) / 2), 0), { friction: 0.05, userData: { k: 'ground' } as FixData });
    this.buildVehicle();
    this.buildCargo();
    this.liftToGround();
    this.buildObjs();
    let pieces = 0;
    for (const c of this.cargo) pieces += c.bodies.length;
    this.totalPieces = pieces;
    this.needCount = level.need ?? pieces;
    w.on('post-solve', (c: Contact, imp: ContactImpulse) => this.postSolve(c, imp));
  }

  /* ------------------------------ veículo ------------------------------ */
  private buildVehicle(): void {
    const w = this.world;
    const P = this.parts;
    const an = this.an;
    const veh = (extra: object = {}) => ({ filterGroupIndex: -1, userData: { k: 'veh' } as FixData, ...extra });
    for (const grp of an.groups) {
      const b = w.createBody({ type: 'dynamic', position: new Vec2(0, 0), angularDamping: 0.05 });
      for (const i of grp) {
        const p = P[i];
        const d = PARTS[p.t];
        const o = veh({ density: d.density, friction: d.friction, restitution: 0.05 });
        if (p.t === 'beam') {
          const h = r0(p) ? 0.6 : 3;
          const ww = r0(p) ? 3 : 0.6;
          const cx = p.x + (r0(p) ? 1.5 : 0.5);
          const cy = p.y + (r0(p) ? 0.5 : 1.5);
          b.createFixture(new Box((ww * U) / 2, (h * U) / 2, new Vec2(cx * U, cy * U), 0), o);
        } else if (p.t === 'tri') {
          b.createFixture(new Polygon(triVerts(p.r).map(([vx, vy]) => new Vec2((p.x + vx) * U, (p.y + vy) * U))), o);
        } else if (p.t === 'basket') {
          b.createFixture(new Box(1.5 * U, 0.33 * U, new Vec2((p.x + 1.5) * U, (p.y + 0.67) * U), 0), o);
          b.createFixture(new Box(0.11 * U, 0.5 * U, new Vec2((p.x + 0.11) * U, (p.y + 1.5) * U), 0), o);
          b.createFixture(new Box(0.11 * U, 0.5 * U, new Vec2((p.x + 2.89) * U, (p.y + 1.5) * U), 0), o);
        } else {
          b.createFixture(new Box(U / 2, U / 2, new Vec2((p.x + 0.5) * U, (p.y + 0.5) * U), 0), o);
        }
      }
      this.groups.push(b);
    }
    // dobradiças: pino próprio + articulação com cada grupo vizinho
    P.forEach((p, i) => {
      if (p.t !== 'hinge') return;
      const c = new Vec2((p.x + 0.5) * U, (p.y + 0.5) * U);
      const pin = w.createBody({ type: 'dynamic', position: c });
      pin.createFixture(new Circle(U * 0.42), veh({ density: PARTS.hinge.density * 1.27, friction: 0.6 }));
      this.pins.push({ idx: i, body: pin });
      for (const gi of an.hinges.get(i) ?? []) {
        w.createJoint(new RevoluteJoint({ collideConnected: false }, this.groups[gi], pin, c));
      }
    });
    // montagens
    P.forEach((p, i) => {
      const d = PARTS[p.t];
      if (d.layer !== 'mount') return;
      const bi = an.base.get(i);
      if (bi === undefined) return;
      const base = this.bodyOfPart(bi);
      if (!base) return;
      const lx = (p.x + 0.5) * U;
      const ly = (p.y + 0.5) * U;
      if (d.radius) {
        const r = d.radius;
        const wb = w.createBody({ type: 'dynamic', position: new Vec2(lx, ly), bullet: true, angularDamping: 0.1 });
        const grip = p.t === 'wheelG';
        wb.createFixture(new Circle(r), veh({ density: d.density, friction: d.friction * (1 + 0.15 * this.up.grip), restitution: 0.08 }));
        const spring = P[bi].t === 'spring';
        let torque = 0;
        for (const mi of an.power.get(i) ?? []) torque += (MOTOR_TORQUE * (1 + 0.25 * this.up.motor)) / Math.max(1, an.drives.get(mi)!.length);
        let j: Joint;
        if (spring) {
          j = new WheelJoint(
            { enableMotor: true, maxMotorTorque: COAST_TORQUE, motorSpeed: 0, frequencyHz: 4.2 + this.up.spring * 1.2, dampingRatio: 0.65 },
            base,
            wb,
            new Vec2(lx, ly),
            new Vec2(0, 1),
          );
        } else {
          j = new RevoluteJoint({ enableMotor: true, maxMotorTorque: COAST_TORQUE, motorSpeed: 0 }, base, wb, new Vec2(lx, ly));
        }
        w.createJoint(j);
        this.wheels.push({ idx: i, body: wb, joint: j, r, spring, grip, powered: torque, base, lx, ly });
      } else if (p.t === 'thruster') {
        base.createFixture(new Box(U * 0.32, U * 0.24, new Vec2(lx, ly), (p.r * Math.PI) / 2), veh({ density: d.density }));
        this.thrusters.push({ idx: i, body: base, lx, ly, r: p.r, fuel: THRUST_FUEL, on: false });
      } else if (p.t === 'balloon') {
        this.balloons.push({ idx: i, body: base, lx, ly, r: 0, fuel: 0, on: true });
      }
    });
    // corpo principal = o mais pesado
    let best = -1;
    for (const b of this.groups) {
      if (b.getMass() > best) {
        best = b.getMass();
        this.main = b;
      }
    }
  }

  /** corpo físico que carrega a peça estrutural i */
  bodyOfPart(i: number): Body | null {
    const g = this.an.group[i];
    if (g >= 0) return this.groups[g];
    const pin = this.pins.find((q) => q.idx === i);
    return pin ? pin.body : null;
  }

  /* ------------------------------ carga ------------------------------ */
  private buildCargo(): void {
    const w = this.world;
    this.level.cargo.forEach((c, ci) => {
      const ud = { k: 'cargo', ci } as FixData;
      const bodies: Body[] = [];
      const cx = (c.x + (c.t === 'big' || c.t === 'drops' ? 1 : 0.5)) * U;
      const cy = (c.y + (c.t === 'big' || c.t === 'drops' ? 1 : 0.5)) * U;
      const mk = (x: number, y: number) => {
        const b = w.createBody({ type: 'dynamic', position: new Vec2(x, y) });
        bodies.push(b);
        return b;
      };
      switch (c.t) {
        case 'crate':
          mk(cx, cy).createFixture(new Box(U * 0.46, U * 0.46), { density: 2.5, friction: 0.75, restitution: 0.05, userData: ud });
          break;
        case 'glass':
          mk(cx, cy).createFixture(new Box(U * 0.44, U * 0.44), { density: 2.2, friction: 0.5, restitution: 0.02, userData: ud });
          break;
        case 'big':
          mk(cx, cy).createFixture(new Box(U * 0.94, U * 0.94), { density: 2.2, friction: 0.75, restitution: 0.03, userData: ud });
          break;
        case 'ball': {
          const b = mk(cx, cy);
          b.createFixture(new Circle(U * 0.44), { density: 1.6, friction: 0.5, restitution: 0.3, userData: ud });
          b.setAngularDamping(0.15);
          break;
        }
        case 'drops': {
          const r = U * 0.2;
          for (let i = 0; i < 8; i++) {
            const b = mk(cx + ((i % 4) - 1.5) * r * 2.05, cy - U * 0.6 + Math.floor(i / 4) * r * 2.05);
            b.createFixture(new Circle(r), { density: 3, friction: 0.04, restitution: 0.05, userData: ud });
            b.setBullet(true);
          }
          break;
        }
      }
      this.cargo.push({ def: c, bodies, st: bodies.map(() => 'ok'), ground: bodies.map(() => 0), zoneT: bodies.map(() => 0) });
    });
  }

  /** sobe veículo + carga para o ponto mais baixo ficar logo acima do chão */
  private liftToGround(): void {
    let minY = Infinity;
    const scan = (b: Body) => {
      for (let f: Fixture | null = b.getFixtureList(); f; f = f.getNext()) {
        const aabb = f.getAABB(0);
        minY = Math.min(minY, aabb.lowerBound.y);
      }
    };
    for (const b of this.allVehicleBodies()) scan(b);
    if (!isFinite(minY)) minY = 0;
    const dy = 0.03 - minY;
    this.lift = dy;
    if (Math.abs(dy) < 1e-6) return;
    const move = (b: Body) => b.setPosition(new Vec2(b.getPosition().x, b.getPosition().y + dy));
    for (const b of this.allVehicleBodies()) move(b);
    for (const c of this.cargo) for (const b of c.bodies) move(b);
  }

  allVehicleBodies(): Body[] {
    return [...this.groups, ...this.pins.map((p) => p.body), ...this.wheels.map((w) => w.body)];
  }

  /* ------------------------------ objetos da pista ------------------------------ */
  private buildObjs(): void {
    const w = this.world;
    const ud = { k: 'obj' } as FixData;
    for (const o of this.track.objs) {
      const so: SimObj = { o, bodies: [], state: 0, t: 0 };
      switch (o.k) {
        case 'seesaw': {
          const g = this.groundBody;
          g.createFixture(new Polygon([new Vec2(o.x - 0.45, o.y), new Vec2(o.x + 0.45, o.y), new Vec2(o.x, o.y + 0.62)]), { friction: 0.9, userData: { k: 'ground' } });
          const ang = Math.asin(Math.min(0.95, 0.62 / (o.len / 2)));
          const pl = w.createBody({ type: 'dynamic', position: new Vec2(o.x, o.y + 0.62), angle: ang });
          pl.createFixture(new Box(o.len / 2, 0.09), { density: 1.5, friction: 0.95, userData: ud });
          // âncora própria: o chão continua colidindo com a tábua
          const anchor = w.createBody();
          w.createJoint(new RevoluteJoint({}, anchor, pl, new Vec2(o.x, o.y + 0.62)));
          so.bodies.push(pl);
          break;
        }
        case 'lift': {
          const b = w.createBody({ type: 'kinematic', position: new Vec2(o.x, o.y0 - 0.15) });
          b.createFixture(new Box(o.w / 2, 0.15), { friction: 0.95, userData: ud });
          so.bodies.push(b);
          break;
        }
        case 'bridge': {
          const n = Math.max(3, Math.round((o.x1 - o.x0) / 0.62));
          const pw = (o.x1 - o.x0) / n;
          let prev: Body = this.groundBody;
          for (let i = 0; i < n; i++) {
            const b = w.createBody({ type: 'dynamic', position: new Vec2(o.x0 + pw * (i + 0.5), o.y - 0.08) });
            b.createFixture(new Box(pw / 2 - 0.01, 0.08), { density: 1.2, friction: 0.95, userData: ud });
            w.createJoint(new RevoluteJoint({}, prev, b, new Vec2(o.x0 + pw * i, o.y - 0.08)));
            so.bodies.push(b);
            prev = b;
          }
          w.createJoint(new RevoluteJoint({}, prev, this.groundBody, new Vec2(o.x1, o.y - 0.08)));
          break;
        }
        case 'gate': {
          const b = w.createBody({ type: 'kinematic', position: new Vec2(o.x, o.y - 0.85) });
          b.createFixture(new Box(0.2, 0.8), { friction: 0.5, userData: ud });
          so.bodies.push(b);
          break;
        }
        case 'pend': {
          const a0 = 1.05;
          const b = w.createBody({ type: 'dynamic', position: new Vec2(o.x + Math.sin(a0) * o.len, o.y - Math.cos(a0) * o.len) });
          b.createFixture(new Circle(0.42), { density: 3.5, friction: 0.4, restitution: 0.2, userData: ud });
          b.setSleepingAllowed(false);
          w.createJoint(new RevoluteJoint({}, this.groundBody, b, new Vec2(o.x, o.y)));
          so.bodies.push(b);
          break;
        }
        case 'box': {
          const b = w.createBody({ type: 'dynamic', position: new Vec2(o.x, o.y) });
          b.createFixture(new Box(o.s / 2, o.s / 2), { density: 0.5, friction: 0.6, userData: ud });
          so.bodies.push(b);
          break;
        }
      }
      this.objs.push(so);
    }
  }

  /* ------------------------------ passo ------------------------------ */
  private postSolve(c: Contact, imp: ContactImpulse): void {
    const fa = c.getFixtureA();
    const fb = c.getFixtureB();
    let mx = 0;
    for (const v of imp.normalImpulses) mx = Math.max(mx, v);
    if (mx <= 0) return;
    const check = (f: Fixture, other: Fixture) => {
      const ud = f.getUserData() as FixData | null;
      const b = f.getBody();
      if (!b.isDynamic()) return;
      const dv = mx / Math.max(0.05, b.getMass());
      if (ud?.k === 'cargo' && ud.ci !== undefined) {
        const cg = this.cargo[ud.ci];
        if (cg.def.t === 'glass') {
          const lim = GLASS_BREAK * (1 + 0.2 * this.up.pad);
          if (dv > lim && cg.st[0] === 'ok' && this.time > 0.35) {
            cg.st[0] = 'broken';
            const p = b.getPosition();
            this.fx.push({ x: p.x, y: p.y, power: 1, kind: 'glass' });
          }
        }
        if (dv > 1.6 && this.fx.length < 24) {
          const p = b.getPosition();
          this.fx.push({ x: p.x, y: p.y, power: Math.min(1, dv / 6), kind: 'cargo' });
        }
      } else if (ud?.k === 'veh' && dv > 2.2 && (other.getUserData() as FixData | null)?.k !== 'veh' && this.fx.length < 24) {
        const wm = c.getWorldManifold(null);
        const p = wm && wm.points[0] ? wm.points[0] : b.getPosition();
        this.fx.push({ x: p.x, y: p.y, power: Math.min(1, dv / 8), kind: 'hit' });
      }
    };
    check(fa, fb);
    check(fb, fa);
  }

  step(): void {
    if (this.result) return;
    this.applyDrive();
    this.updateObjs(DT);
    const h = DT / SUB;
    for (let s = 0; s < SUB; s++) {
      this.applyForces();
      this.world.step(h, 8, 3);
    }
    this.clampAll();
    this.time += DT;
    this.updateRules();
  }

  private applyDrive(): void {
    const { fwd, back, brake } = this.input;
    for (const wh of this.wheels) {
      const j = wh.joint as RevoluteJoint | WheelJoint;
      if (brake) {
        j.setMotorSpeed(0);
        j.setMaxMotorTorque(BRAKE_TORQUE);
      } else if ((fwd || back) && wh.powered > 0) {
        j.setMotorSpeed(((fwd ? -1 : 0.75) * V_TARGET) / wh.r);
        j.setMaxMotorTorque(wh.powered);
      } else {
        j.setMotorSpeed(0);
        j.setMaxMotorTorque(COAST_TORQUE);
      }
      if (fwd || back || brake) wh.body.setAwake(true);
    }
    for (const th of this.thrusters) {
      th.on = this.input.boost && th.fuel > 0;
      if (th.on) th.fuel = Math.max(0, th.fuel - DT);
    }
  }

  private applyForces(): void {
    for (const th of this.thrusters) {
      if (!th.on) continue;
      const b = th.body;
      const a = b.getAngle() + (th.r * Math.PI) / 2;
      b.applyForce(new Vec2(Math.cos(a) * THRUST, Math.sin(a) * THRUST), b.getWorldPoint(new Vec2(th.lx, th.ly)), true);
    }
    for (const bl of this.balloons) {
      const b = bl.body;
      const wp = b.getWorldPoint(new Vec2(bl.lx, bl.ly));
      // empuxo + arrasto vertical (o balão freia quedas)
      const vy = b.getLinearVelocityFromWorldPoint(wp).y;
      b.applyForce(new Vec2(0, LIFT - vy * BALLOON_DRAG), wp, true);
    }
  }

  private clampAll(): void {
    for (let b: Body | null = this.world.getBodyList(); b; b = b.getNext()) {
      if (!b.isDynamic()) continue;
      const v = b.getLinearVelocity();
      const s = v.length();
      if (s > 28) b.setLinearVelocity(new Vec2(v.x * (28 / s), v.y * (28 / s)));
      const av = b.getAngularVelocity();
      if (Math.abs(av) > 60) b.setAngularVelocity(Math.sign(av) * 60);
    }
  }

  /** dinâmico encostando no corpo b? */
  private loaded(b: Body): boolean {
    for (let ce = b.getContactList(); ce; ce = ce.next ?? null) {
      if (ce.contact.isTouching() && ce.other && ce.other.isDynamic()) return true;
    }
    return false;
  }

  private updateObjs(dt: number): void {
    const vx = this.main ? this.main.getWorldCenter().x : 0;
    for (const so of this.objs) {
      const o = so.o;
      so.t += dt;
      if (o.k === 'lift') {
        const b = so.bodies[0];
        const over = vx > o.x - o.w / 2 + 0.3 && vx < o.x + o.w / 2 + 0.6;
        const load = this.loaded(b) && over;
        // state: tempo carregado (>0) / vazio (<0)
        if (load) so.state = Math.max(0, so.state) + dt;
        else so.state = Math.min(0, so.state) - dt;
        const cy = b.getPosition().y + 0.15;
        const target = so.state > 0.5 ? o.y1 : so.state < -1.2 ? o.y0 : cy;
        const d = target - cy;
        const v = Math.abs(d) < 0.01 ? 0 : Math.sign(d) * Math.min(1.3, Math.abs(d) / dt);
        b.setLinearVelocity(new Vec2(0, v));
      } else if (o.k === 'gate') {
        const b = so.bodies[0];
        // ciclo de 4,4 s: em cima 2 s, descendo, embaixo 1,6 s, subindo
        const T = 4.4;
        const ph = so.t % T;
        const up = o.y + 0.75; // centro quando aberto para cima (bloqueia)
        const dn = o.y - 0.85; // escondido no chão
        let target: number;
        if (ph < 2) target = up;
        else if (ph < 2.4) target = up + (dn - up) * ease((ph - 2) / 0.4);
        else if (ph < 4) target = dn;
        else target = dn + (up - dn) * ease((ph - 4) / 0.4);
        const cy = b.getPosition().y;
        b.setLinearVelocity(new Vec2(0, (target - cy) / dt));
      }
    }
  }

  private updateRules(): void {
    const z = this.track.zone;
    if (this.main) {
      const a = norm(this.main.getAngle());
      if (Math.abs(a) > 1.75) this.flipped = true;
      this.maxX = Math.max(this.maxX, this.main.getWorldCenter().x);
    }
    let delivered = 0;
    let lost = 0;
    let broken = false;
    for (const c of this.cargo) {
      c.bodies.forEach((b, k) => {
        if (c.st[k] === 'broken') {
          broken = true;
          return;
        }
        if (c.st[k] === 'lost') {
          lost++;
          return;
        }
        const p = b.getPosition();
        const inZone = p.x > z.x0 && p.x < z.x1 + 0.2 && p.y > z.y - 0.5 && p.y < z.y + 4;
        if (p.y < this.track.killY || p.x < -6) {
          c.st[k] = 'lost';
          lost++;
          return;
        }
        // encostada no chão fora da zona?
        let onGround = false;
        if (!inZone) {
          for (let ce = b.getContactList(); ce; ce = ce.next ?? null) {
            if (!ce.contact.isTouching()) continue;
            const fa = ce.contact.getFixtureA();
            const fb = ce.contact.getFixtureB();
            const of = fa.getBody() === b ? fb : fa;
            if ((of.getUserData() as FixData | null)?.k === 'ground') {
              onGround = true;
              break;
            }
          }
        }
        c.ground[k] = onGround ? c.ground[k] + DT : 0;
        if (c.ground[k] > GROUND_LOST) {
          c.st[k] = 'lost';
          lost++;
          this.fx.push({ x: p.x, y: p.y, power: 0.6, kind: 'cargo' });
          return;
        }
        const slow = b.getLinearVelocity().length() < 1.3;
        c.zoneT[k] = inZone && slow ? c.zoneT[k] + DT : 0;
        if (c.zoneT[k] > 0.5) delivered++;
      });
    }
    if (broken) this.result = { win: false, reason: 'broken' };
    else if (lost > this.totalPieces - this.needCount) this.result = { win: false, reason: 'lost' };
    else if (delivered >= this.needCount) this.result = { win: true };
    else if (this.time > TIME_LIMIT) this.result = { win: false, reason: 'time' };
  }

  /** contadores para o HUD */
  cargoStatus(): { total: number; need: number; lost: number; inZone: number } {
    let lost = 0;
    let inZone = 0;
    const z = this.track.zone;
    for (const c of this.cargo)
      c.bodies.forEach((b, k) => {
        if (c.st[k] !== 'ok') lost++;
        else {
          const p = b.getPosition();
          if (p.x > z.x0 && p.x < z.x1 + 0.2 && p.y > z.y - 0.5) inZone++;
        }
      });
    return { total: this.totalPieces, need: this.needCount, lost, inZone };
  }

  /** velocidade (m/s) do corpo principal, para câmera/som */
  speed(): number {
    return this.main ? this.main.getLinearVelocity().x : 0;
  }
  focus(): { x: number; y: number } {
    if (this.main) return this.main.getWorldCenter();
    return { x: 2, y: 1 };
  }

  destroy(): void {
    // planck não segura recursos externos; soltar referências basta
    this.groups = [];
    this.wheels = [];
    this.cargo = [];
    this.objs = [];
  }
}

function r0(p: Placed): boolean {
  return p.r % 2 === 0;
}
function ease(k: number): number {
  k = Math.max(0, Math.min(1, k));
  return k * k * (3 - 2 * k);
}
export function norm(a: number): number {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

/** centro de massa aproximado do projeto (em células), para o editor */
export function designCOM(parts: readonly Placed[]): { x: number; y: number; m: number } | null {
  let m = 0;
  let x = 0;
  let y = 0;
  for (const p of parts) {
    const d = PARTS[p.t];
    let mass: number;
    if (d.radius) mass = Math.PI * d.radius * d.radius * d.density;
    else if (p.t === 'beam') mass = 3 * 0.6 * U * U * d.density;
    else if (p.t === 'tri') mass = 0.5 * U * U * d.density;
    else if (p.t === 'balloon') mass = 0;
    else mass = cellsOf(p).length * U * U * d.density;
    const cells = cellsOf(p);
    let cx = 0;
    let cy = 0;
    for (const [a, b] of cells) {
      cx += a + 0.5;
      cy += b + 0.5;
    }
    cx /= cells.length;
    cy /= cells.length;
    x += cx * mass;
    y += cy * mass;
    m += mass;
  }
  if (m <= 0) return null;
  return { x: x / m, y: y / m, m };
}

export type { CargoType };
