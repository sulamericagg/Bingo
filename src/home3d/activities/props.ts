/* ============================================================
 *  CASA 3D · ATIVIDADES — objetos soltos com física (cannon-es):
 *  ingredientes, pedaços, pratos, copos, extintor, roupa, balões...
 *  - limite de corpos pelo nível de qualidade (some o mais velho/menos
 *    importante primeiro, com "puf")
 *  - corpos dormem; nada sai da casa (volta para perto do jogador)
 *  - impactos fortes viram sujeira de verdade (MessItem) com limite
 * ============================================================ */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { G, HOUSE, type Engine } from '../engine';
import { WALL_H } from '../adapter';
import { sfx } from '../sfx';
import { ING, type Bit, type Method } from './data';
import { ingGeo, madeGeo, pieceGeo, plateGeo, bowlGeo, cupGeo, smudgeGeo, extGeo, bagGeo, clothGeo, balloonGeo, bannerGeo, lightsGeo, bulbsGeo } from './models';

export type PropKind = 'ing' | 'made' | 'plate' | 'bowl' | 'cup' | 'ext' | 'bag' | 'cloth' | 'balloon' | 'deco';
export interface Dish {
  name: string;
  recipe: string | null;
  stars: number;
  bits: Bit[];
}
export interface Prop {
  uid: number;
  kind: PropKind;
  ing: string;
  made?: string;
  cut: number;
  cook: number;
  m: Method[];
  garden?: boolean;
  obj: THREE.Group;
  mesh: THREE.Mesh;
  body: CANNON.Body | null;
  r: number;
  born: number;
  /** nunca some sozinho (extintor, louça) */
  keep: boolean;
  held: boolean;
  /** escondido dentro de algo (panela, forno, lixeira...) */
  hidden: boolean;
  /** pratos/tigelas/copos */
  dish?: Dish | null;
  dirty: number;
  smudge?: THREE.Mesh;
  liquid?: THREE.Mesh;
  contents?: Bit[];
  /** no escorredor (posição fixa) */
  racked?: boolean;
  cloth?: { type: number; col: string; clean: boolean };
  deco?: 'banner' | 'lights';
  /** última posição boa (fora da casa → volta) */
  lastHit: number;
  tint?: THREE.Material & { color: THREE.Color };
}
export interface Impact {
  p: Prop;
  v: number;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  /** bateu em parede/chão/móvel fixo */
  hard: boolean;
}

const V = new THREE.Vector3();
const RAW = new THREE.Color(1, 1, 1);
const COOKED = new THREE.Color(1.0, 0.72, 0.42);
const BURNT = new THREE.Color(0.2, 0.15, 0.13);
let UID = 1;

export class Props {
  list: Prop[] = [];
  impacts: Impact[] = [];
  private shared: THREE.Material;
  private glass: THREE.Material;
  private glow: THREE.Material;
  private mats: THREE.Material[] = [];
  readonly bodyMat = new CANNON.Material('act');
  private buoy = () => this.preStep();
  private splatT = 0;
  /** sujeiras criadas por este módulo (para o limite) */
  splats = 0;

  constructor(readonly eng: Engine) {
    this.shared = this.newMat();
    this.glass = new THREE.MeshLambertMaterial({ color: '#e8f6ff', transparent: true, opacity: 0.45, depthWrite: false });
    this.glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    this.mats.push(this.shared, this.glass, this.glow);
    eng.world.addContactMaterial(new CANNON.ContactMaterial(this.bodyMat, eng.bodyMat, { friction: 0.55, restitution: 0.22 }));
    eng.world.addContactMaterial(new CANNON.ContactMaterial(this.bodyMat, this.bodyMat, { friction: 0.6, restitution: 0.15 }));
    eng.world.addEventListener('preStep', this.buoy);
  }
  newMat(color?: string): THREE.Material & { color: THREE.Color } {
    const m = this.eng.q.standard
      ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 })
      : new THREE.MeshLambertMaterial({ vertexColors: true });
    if (color) m.color.set(color);
    this.mats.push(m);
    return m;
  }
  get glassMat(): THREE.Material {
    return this.glass;
  }
  get glowMat(): THREE.Material {
    return this.glow;
  }
  /** limite de objetos soltos pelo nível de qualidade */
  get cap(): number {
    return [22, 32, 46, 60][this.eng.q.tier] ?? 40;
  }

  spawn(kind: PropKind, o: { ing?: string; made?: string; cut?: number; cook?: number; m?: Method[]; garden?: boolean; col?: string; cloth?: number; keep?: boolean; deco?: 'banner' | 'lights' }, pos: THREE.Vector3, vel?: THREE.Vector3): Prop {
    let geo: THREE.BufferGeometry;
    let r = 0.05;
    let shape: CANNON.Shape;
    let mass = 0.3;
    const ing = o.ing ?? '';
    let offY = 0;
    switch (kind) {
      case 'ing':
        geo = (o.cut ?? 0) > 0 ? pieceGeo(ing, o.cut!) : ingGeo(ing);
        r = (ING.get(ing)?.r ?? 0.05) * ((o.cut ?? 0) >= 2 ? 0.4 : (o.cut ?? 0) === 1 ? 0.75 : 1);
        shape = new CANNON.Sphere(r);
        mass = 0.15 + r * 3;
        break;
      case 'made':
        geo = madeGeo(o.made!);
        r = o.made === 'popcorn' ? 0.03 : o.made === 'friedegg' ? 0.05 : o.made === 'pancake' ? 0.06 : 0.1;
        shape = o.made === 'popcorn' ? new CANNON.Sphere(r) : new CANNON.Cylinder(r, r, r * 0.9, 10);
        mass = o.made === 'popcorn' ? 0.02 : 0.5;
        break;
      case 'plate':
      case 'bowl':
      case 'cup':
        geo = kind === 'plate' ? plateGeo() : kind === 'bowl' ? bowlGeo() : cupGeo();
        r = kind === 'plate' ? 0.14 : kind === 'bowl' ? 0.09 : 0.045;
        {
          const h = kind === 'plate' ? 0.025 : kind === 'bowl' ? 0.07 : 0.13;
          shape = new CANNON.Cylinder(r, r * 0.8, h, 12);
          offY = -h / 2;
        }
        mass = 0.4;
        break;
      case 'ext':
        geo = extGeo();
        r = 0.06;
        shape = new CANNON.Cylinder(0.05, 0.05, 0.3, 8);
        mass = 1.2;
        break;
      case 'bag':
        geo = bagGeo();
        r = 0.13;
        shape = new CANNON.Sphere(0.13);
        mass = 0.8;
        break;
      case 'cloth':
        geo = clothGeo(o.cloth ?? 0, o.col ?? '#3fa0ff');
        r = o.cloth === 0 ? 0.06 : 0.12;
        shape = new CANNON.Box(new CANNON.Vec3(o.cloth === 0 ? 0.04 : 0.13, o.cloth === 2 ? 0.05 : 0.02, o.cloth === 0 ? 0.1 : 0.14));
        mass = 0.2;
        break;
      case 'balloon':
        geo = balloonGeo(o.col ?? '#ff5c7a');
        r = 0.17;
        shape = new CANNON.Sphere(0.17);
        mass = 0.05;
        offY = 0;
        break;
      case 'deco':
      default:
        geo = o.deco === 'lights' ? lightsGeo() : bannerGeo();
        r = 0.2;
        shape = new CANNON.Box(new CANNON.Vec3(0.4, 0.08, 0.04));
        mass = 0.3;
        break;
    }
    const mat = kind === 'cup' ? this.glass : this.shared;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = offY;
    mesh.castShadow = this.eng.q.shadows && kind !== 'deco';
    const obj = new THREE.Group();
    obj.add(mesh);
    if (kind === 'deco' && o.deco === 'lights') obj.add(new THREE.Mesh(bulbsGeo(), this.glow));
    obj.position.copy(pos);
    this.eng.scene.add(obj);
    const body = new CANNON.Body({
      mass,
      shape,
      material: this.bodyMat,
      collisionFilterGroup: G.FOOD,
      collisionFilterMask: G.STATIC | G.ITEM | G.FOOD | G.DEBRIS,
      linearDamping: kind === 'balloon' ? 0.6 : 0.08,
      angularDamping: kind === 'balloon' ? 0.6 : 0.25,
      allowSleep: true,
      sleepSpeedLimit: 0.12,
      sleepTimeLimit: 0.5,
    });
    body.position.set(pos.x, pos.y, pos.z);
    if (vel) body.velocity.set(vel.x, vel.y, vel.z);
    this.eng.world.addBody(body);
    const p: Prop = {
      uid: UID++,
      kind,
      ing,
      made: o.made,
      cut: o.cut ?? 0,
      cook: o.cook ?? 0,
      m: [...(o.m ?? [])],
      garden: o.garden,
      obj,
      mesh,
      body,
      r,
      born: this.eng.time,
      keep: !!o.keep || kind === 'plate' || kind === 'bowl' || kind === 'cup' || kind === 'ext',
      held: false,
      hidden: false,
      dirty: 0,
      lastHit: 0,
    };
    if (kind === 'cloth') p.cloth = { type: o.cloth ?? 0, col: o.col ?? '#3fa0ff', clean: o.cloth === 2 };
    if (kind === 'deco') p.deco = o.deco;
    if (kind === 'cup' || kind === 'bowl') {
      const lg = kind === 'cup' ? new THREE.CylinderGeometry(0.042, 0.036, 0.1, 12) : new THREE.CylinderGeometry(0.082, 0.06, 0.03, 14);
      const lm = this.newMat();
      (lm as THREE.MeshLambertMaterial).vertexColors = false;
      const liq = new THREE.Mesh(lg, lm);
      liq.position.y = kind === 'cup' ? offY + 0.065 : offY + 0.045;
      liq.visible = false;
      obj.add(liq);
      p.liquid = liq;
    }
    (body as unknown as { prop: Prop }).prop = p;
    body.addEventListener('collide', (e: { body: CANNON.Body; contact: CANNON.ContactEquation }) => this.onCollide(p, e));
    mesh.userData.prop = p;
    this.list.push(p);
    if (p.cook) this.tint(p);
    this.enforceCap();
    return p;
  }
  private onCollide(p: Prop, e: { body: CANNON.Body; contact: CANNON.ContactEquation }): void {
    const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
    if (v < 3.2 || p.held || this.eng.time - p.lastHit < 0.25) return;
    p.lastHit = this.eng.time;
    const c = e.contact;
    const isI = c.bi === p.body;
    const other = isI ? c.bj : c.bi;
    const base = isI ? c.bj : c.bi;
    const r = isI ? c.rj : c.ri;
    const point = new THREE.Vector3(base.position.x + r.x, base.position.y + r.y, base.position.z + r.z);
    // normal apontando para fora da superfície atingida (para o objeto)
    const n = new THREE.Vector3(c.ni.x, c.ni.y, c.ni.z);
    if (!isI) n.negate();
    n.negate();
    const hard = other.type === CANNON.Body.STATIC;
    if (this.impacts.length < 12) this.impacts.push({ p, v, point, normal: n, hard });
  }
  /** cria sujeira no ponto (com limite de taxa e de quantidade) */
  splat(kind: Parameters<Engine['splatAt']>[0], p: THREE.Vector3, n: THREE.Vector3, r = 22): boolean {
    if (this.splatT > 0) return false;
    const mine = this.eng.decals.length;
    if (mine > 60) return false;
    // normal "achatada" no eixo dominante (parede ou chão)
    const nn = Math.abs(n.y) > 0.5 ? new THREE.Vector3(0, Math.sign(n.y) || 1, 0) : Math.abs(n.x) > Math.abs(n.z) ? new THREE.Vector3(Math.sign(n.x), 0, 0) : new THREE.Vector3(0, 0, Math.sign(n.z));
    if (nn.y < 0) return false;
    this.splatT = 0.35;
    this.eng.splatAt(kind, p.clone().setY(Math.max(0, p.y)), nn, r);
    this.splats++;
    return true;
  }
  remove(p: Prop, poof = false): void {
    if (poof) this.eng.burst(p.obj.position.x, p.obj.position.y, p.obj.position.z, 6, 'poof', '#ffffff', 0.6);
    this.eng.scene.remove(p.obj);
    if (p.body) this.eng.world.removeBody(p.body);
    p.body = null;
    if (p.tint) (p.tint.dispose(), this.mats.splice(this.mats.indexOf(p.tint), 1));
    if (p.liquid) ((p.liquid.material as THREE.Material).dispose(), p.liquid.geometry.dispose());
    const i = this.list.indexOf(p);
    if (i >= 0) this.list.splice(i, 1);
  }
  /** esconde dentro de um recipiente (sem corpo) */
  hide(p: Prop): void {
    p.hidden = true;
    p.obj.visible = false;
    if (p.body) this.eng.world.removeBody(p.body);
  }
  unhide(p: Prop, pos: THREE.Vector3, vel?: THREE.Vector3): void {
    p.hidden = false;
    p.obj.visible = true;
    p.obj.position.copy(pos);
    if (p.body) {
      p.body.position.set(pos.x, pos.y, pos.z);
      p.body.velocity.set(vel?.x ?? 0, vel?.y ?? 0, vel?.z ?? 0);
      if (!this.eng.world.bodies.includes(p.body)) this.eng.world.addBody(p.body);
      p.body.wakeUp();
    }
  }
  /** cor do cozimento: cru (branco) → dourado → carvão */
  tint(p: Prop): void {
    if (!p.tint) {
      p.tint = this.newMat();
      p.mesh.material = p.tint;
    }
    const c = p.tint.color;
    if (p.cook <= 1) c.copy(RAW).lerp(COOKED, Math.max(0, p.cook));
    else c.copy(COOKED).lerp(BURNT, Math.min(1, (p.cook - 1) / 0.8));
  }
  setDirty(p: Prop, d: number): void {
    p.dirty = d;
    if (d > 0 && !p.smudge) {
      p.smudge = new THREE.Mesh(smudgeGeo(), this.shared);
      p.smudge.position.y = p.kind === 'plate' ? 0.0 : p.kind === 'bowl' ? -0.015 : 0.02;
      if (p.kind === 'cup') p.smudge.scale.setScalar(0.5);
      p.obj.add(p.smudge);
    }
    if (p.smudge) {
      p.smudge.visible = d > 0.02;
      p.smudge.scale.setScalar((p.kind === 'cup' ? 0.5 : 1) * (0.4 + d * 0.6));
    }
  }
  /** pega na mão: corpo vira cinemático e sem colisão */
  grab(p: Prop): void {
    p.held = true;
    p.racked = false;
    if (p.hidden) this.unhide(p, p.obj.position);
    if (p.body) {
      p.body.type = CANNON.Body.KINEMATIC;
      p.body.collisionResponse = false;
      p.body.velocity.setZero();
      p.body.angularVelocity.setZero();
    }
  }
  release(p: Prop, vel: THREE.Vector3, spin = 0): void {
    p.held = false;
    p.obj.scale.setScalar(1);
    p.racked = false;
    if (!p.body) return;
    p.body.type = CANNON.Body.DYNAMIC;
    p.body.collisionResponse = true;
    p.body.position.set(p.obj.position.x, p.obj.position.y, p.obj.position.z);
    p.body.quaternion.set(p.obj.quaternion.x, p.obj.quaternion.y, p.obj.quaternion.z, p.obj.quaternion.w);
    p.body.velocity.set(vel.x, vel.y, vel.z);
    p.body.angularVelocity.set((Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin);
    p.body.wakeUp();
  }
  /** coloca parado num lugar (cinemático) — escorredor, pilha */
  pin(p: Prop, pos: THREE.Vector3, q?: THREE.Quaternion): void {
    p.obj.position.copy(pos);
    if (q) p.obj.quaternion.copy(q);
    else p.obj.quaternion.identity();
    if (p.body) {
      p.body.type = CANNON.Body.KINEMATIC;
      p.body.collisionResponse = true;
      p.body.velocity.setZero();
      p.body.angularVelocity.setZero();
      p.body.position.set(pos.x, pos.y, pos.z);
      p.body.quaternion.set(p.obj.quaternion.x, p.obj.quaternion.y, p.obj.quaternion.z, p.obj.quaternion.w);
    }
  }
  bit(p: Prop): Bit {
    return { ing: p.ing, cut: p.cut, cook: p.cook, m: [...p.m], made: p.made, garden: p.garden };
  }
  isFood(p: Prop): boolean {
    return p.kind === 'ing' || p.kind === 'made';
  }
  private preStep(): void {
    for (const p of this.list) {
      if (p.kind !== 'balloon' || !p.body || p.held || p.hidden) continue;
      // flutua até o teto e balança
      p.body.applyForce(new CANNON.Vec3(Math.sin(p.uid + this.eng.time) * 0.02, p.body.mass * 14 * 1.25, 0));
    }
  }
  private enforceCap(): void {
    const free = this.list.filter((p) => !p.hidden);
    let over = free.length - this.cap;
    if (over <= 0) return;
    const victims = free
      .filter((p) => !p.keep && !p.held && !p.dish)
      .sort((a, b) => score(a) - score(b) || a.born - b.born);
    for (const v of victims) {
      if (over-- <= 0) break;
      this.remove(v, true);
    }
  }
  update(dt: number): void {
    this.splatT -= dt;
    let awake = 0;
    for (const p of this.list) {
      const b = p.body;
      if (!b || p.hidden || p.held || p.racked) continue;
      if (b.type === CANNON.Body.KINEMATIC) continue;
      if (b.sleepState !== CANNON.Body.SLEEPING) {
        awake++;
        if (b.position.y < -0.5 || b.position.y > WALL_H + 1 || b.position.x < HOUSE.minX - 0.5 || b.position.x > HOUSE.maxX + 0.5 || b.position.z < HOUSE.minZ - 0.5 || b.position.z > HOUSE.maxZ + 0.5) {
          // escapou: volta caindo do teto do cômodo mais próximo
          const r = this.eng.nearestRoom(V.set(b.position.x, 0, b.position.z));
          b.position.set(r.center.x, 1.6, r.center.z);
          b.velocity.setZero();
        }
        p.obj.position.set(b.position.x, b.position.y, b.position.z);
        p.obj.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      }
    }
    // celular fraco: adormece os mais lentos
    const max = this.eng.q.maxBodies + 8;
    if (awake > max) {
      const list = this.list.filter((p) => p.body && !p.held && !p.hidden && p.body.type === CANNON.Body.DYNAMIC && p.body.sleepState !== CANNON.Body.SLEEPING && p.kind !== 'balloon');
      list.sort((a, b) => a.body!.velocity.lengthSquared() - b.body!.velocity.lengthSquared());
      for (let i = 0; i < awake - max && i < list.length; i++) list[i].body!.sleep();
    }
    // pipoca e farelos velhos somem sozinhos
    for (const p of [...this.list]) if (p.made === 'popcorn' && !p.held && !p.hidden && this.eng.time - p.born > 90) this.remove(p, true);
  }
  /** reproduz o "plof" de cair */
  thud(v: number): void {
    if (v > 6) sfx.splat();
    else sfx.thud();
  }
  dispose(): void {
    this.eng.world.removeEventListener('preStep', this.buoy);
    for (const p of [...this.list]) this.remove(p);
    for (const m of this.mats) m.dispose();
  }
}
/** quanto menor, mais "descartável" */
function score(p: Prop): number {
  if (p.made === 'popcorn') return 0;
  if (p.kind === 'ing' && p.cut >= 2) return 1;
  if (p.kind === 'ing' && p.cut === 1) return 2;
  if (p.kind === 'balloon') return 3;
  if (p.kind === 'ing') return 4;
  return 5;
}
