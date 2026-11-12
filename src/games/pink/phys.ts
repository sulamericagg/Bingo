/* ============================================================
 *  BLOOP PINK — física leve (cannon-es) para objetos SOLTOS:
 *  caixas no chão/no caminhão, produtos que caíram, sacos de lixo, cacos.
 *  Estáticos = caixas (paredes, móveis, carroceria). Tudo dorme quando para.
 * ============================================================ */
import * as CANNON from 'cannon-es';
import * as THREE from 'three';

export type LooseKind = 'box' | 'item' | 'trash' | 'shard' | 'parcel';
export interface Loose {
  id: number;
  kind: LooseKind;
  body: CANNON.Body;
  mesh: THREE.Object3D;
  /** meia-extensão (m) */
  he: THREE.Vector3;
  /** dados do jogo (produto, quantidade...) */
  data: Record<string, unknown>;
  /** tempo de vida (cacos somem) */
  life?: number;
  /** maior impacto recente (m/s) */
  hit: number;
}

let NEXT = 1;
const _v = new THREE.Vector3();

export class Phys {
  readonly world: CANNON.World;
  readonly items: Loose[] = [];
  private statics: CANNON.Body[] = [];
  private matD: CANNON.Material;
  private matS: CANNON.Material;
  onHit: ((l: Loose, v: number) => void) | null = null;
  constructor() {
    const w = new CANNON.World({ gravity: new CANNON.Vec3(0, -12, 0), allowSleep: true });
    w.broadphase = new CANNON.SAPBroadphase(w);
    (w.solver as CANNON.GSSolver).iterations = 8;
    this.matD = new CANNON.Material('d');
    this.matS = new CANNON.Material('s');
    w.addContactMaterial(new CANNON.ContactMaterial(this.matD, this.matS, { friction: 0.45, restitution: 0.18 }));
    w.addContactMaterial(new CANNON.ContactMaterial(this.matD, this.matD, { friction: 0.5, restitution: 0.1 }));
    const ground = new CANNON.Body({ mass: 0, material: this.matS, shape: new CANNON.Plane() });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    w.addBody(ground);
    this.world = w;
  }
  /** caixa estática (paredes, móveis); devolve para remover depois */
  addStatic(x: number, y: number, z: number, hx: number, hy: number, hz: number, ry = 0): CANNON.Body {
    const b = new CANNON.Body({ mass: 0, material: this.matS, shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)) });
    b.position.set(x, y, z);
    if (ry) b.quaternion.setFromEuler(0, ry, 0);
    this.world.addBody(b);
    this.statics.push(b);
    return b;
  }
  removeStatic(b: CANNON.Body): void {
    this.world.removeBody(b);
    const i = this.statics.indexOf(b);
    if (i >= 0) this.statics.splice(i, 1);
  }
  /** objeto solto com caixa de colisão */
  add(kind: LooseKind, mesh: THREE.Object3D, he: THREE.Vector3, pos: THREE.Vector3, o: { mass?: number; vel?: THREE.Vector3; spin?: number; data?: Record<string, unknown>; ry?: number; life?: number } = {}): Loose {
    const b = new CANNON.Body({ mass: o.mass ?? 1, material: this.matD, shape: new CANNON.Box(new CANNON.Vec3(he.x, he.y, he.z)), linearDamping: 0.08, angularDamping: 0.25, allowSleep: true, sleepSpeedLimit: 0.12, sleepTimeLimit: 0.6 });
    b.position.set(pos.x, pos.y, pos.z);
    if (o.ry) b.quaternion.setFromEuler(0, o.ry, 0);
    if (o.vel) b.velocity.set(o.vel.x, o.vel.y, o.vel.z);
    if (o.spin) b.angularVelocity.set((Math.random() - 0.5) * o.spin, (Math.random() - 0.5) * o.spin, (Math.random() - 0.5) * o.spin);
    const l: Loose = { id: NEXT++, kind, body: b, mesh, he: he.clone(), data: o.data ?? {}, life: o.life, hit: 0 };
    b.addEventListener('collide', (e: { contact: CANNON.ContactEquation }) => {
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (v > l.hit) l.hit = v;
      if (v > 1.2) this.onHit?.(l, v);
    });
    this.world.addBody(b);
    this.items.push(l);
    this.sync(l);
    return l;
  }
  remove(l: Loose): void {
    this.world.removeBody(l.body);
    const i = this.items.indexOf(l);
    if (i >= 0) this.items.splice(i, 1);
  }
  private sync(l: Loose): void {
    const p = l.body.position;
    const q = l.body.quaternion;
    l.mesh.position.set(p.x, p.y, p.z);
    l.mesh.quaternion.set(q.x, q.y, q.z, q.w);
  }
  step(dt: number): void {
    this.world.step(1 / 60, Math.min(dt, 0.05), 3);
    for (let i = this.items.length - 1; i >= 0; i--) {
      const l = this.items[i];
      this.sync(l);
      l.hit *= 0.8;
      if (l.life !== undefined) {
        l.life -= dt;
        if (l.life <= 0) {
          this.remove(l);
          l.mesh.removeFromParent();
        }
      }
      // caiu do mundo
      if (l.body.position.y < -5) {
        l.body.position.set(0, 1, -14);
        l.body.velocity.setZero();
      }
    }
  }
  /** o mais perto do raio (centro da tela) dentro de `maxD` */
  pick(ray: THREE.Ray, maxD: number, filter?: (l: Loose) => boolean): Loose | null {
    let best: Loose | null = null;
    let bd = maxD;
    for (const l of this.items) {
      if (filter && !filter(l)) continue;
      _v.copy(l.mesh.position).sub(ray.origin);
      const along = _v.dot(ray.direction);
      if (along < 0 || along > bd) continue;
      const perp = Math.sqrt(Math.max(0, _v.lengthSq() - along * along));
      const r = Math.max(l.he.x, l.he.y, l.he.z) + 0.08;
      if (perp < r) {
        bd = along;
        best = l;
      }
    }
    return best;
  }
  dispose(): void {
    for (const l of [...this.items]) this.remove(l);
    for (const b of [...this.statics]) this.removeStatic(b);
  }
}
