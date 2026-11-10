/* ============================================================
 *  CASA 3D · ATIVIDADES — utilidades de lugar:
 *  - Rig: grupo que segue um móvel do catálogo (utensílios em cima dele)
 *  - Fixture: móvel extra deste módulo (lixeira, máquina, horta...) num
 *    canto livre do cômodo, com corpo estático simples
 * ============================================================ */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { G, type Engine, type ItemRec, type RoomRec } from '../engine';
import { DOOR_HALF, ROOM_D, ROOM_W, WALL_T } from './consts';

const UP = new THREE.Vector3(0, 1, 0);

/** grupo preso a um móvel (segue quando ele é movido) */
export class Rig {
  readonly root = new THREE.Group();
  bodies: { b: CANNON.Body; local: THREE.Vector3 }[] = [];
  constructor(
    readonly eng: Engine,
    readonly item: ItemRec,
  ) {
    eng.scene.add(this.root);
    this.follow();
  }
  get w(): number {
    return this.item.dims.w;
  }
  get h(): number {
    return this.item.dims.h;
  }
  get d(): number {
    return this.item.dims.d;
  }
  /** corpo cinemático (grupo STATIC) com várias formas, preso no ponto local */
  addBody(local: THREE.Vector3, shapes: [CANNON.Shape, CANNON.Vec3, CANNON.Quaternion?][]): CANNON.Body {
    const b = new CANNON.Body({ type: CANNON.Body.KINEMATIC, mass: 0, collisionFilterGroup: G.STATIC, collisionFilterMask: G.ITEM | G.FOOD | G.DEBRIS });
    for (const [s, o, q] of shapes) b.addShape(s, o, q);
    this.eng.world.addBody(b);
    this.bodies.push({ b, local });
    this.follow();
    return b;
  }
  get alive(): boolean {
    return this.eng.items.includes(this.item) && this.item.state !== 'broken';
  }
  follow(): void {
    const o = this.item.obj;
    this.root.position.copy(o.position);
    this.root.quaternion.copy(o.quaternion);
    this.root.visible = o.visible && this.item.state !== 'broken';
    this.root.updateMatrixWorld(true);
    for (const { b, local } of this.bodies) {
      const p = this.root.localToWorld(local.clone());
      b.position.set(p.x, p.y, p.z);
      b.quaternion.set(o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w);
      b.collisionResponse = this.root.visible;
    }
  }
  world(x: number, y: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
    return this.root.localToWorld(out.set(x, y, z));
  }
  local(p: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    return this.root.worldToLocal(out.copy(p));
  }
  dispose(): void {
    this.eng.scene.remove(this.root);
    for (const { b } of this.bodies) this.eng.world.removeBody(b);
    this.bodies = [];
  }
}

/** rodelinha de bordas (frigideira/panela/pote) como corpo composto */
export function ringShapes(r: number, h: number, n: number, base = true, t = 0.01): [CANNON.Shape, CANNON.Vec3, CANNON.Quaternion?][] {
  const out: [CANNON.Shape, CANNON.Vec3, CANNON.Quaternion?][] = [];
  if (base) out.push([new CANNON.Box(new CANNON.Vec3(r, 0.008, r)), new CANNON.Vec3(0, 0.008, 0)]);
  const half = Math.tan(Math.PI / n) * r + 0.004;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const q = new CANNON.Quaternion();
    q.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), -a);
    out.push([new CANNON.Box(new CANNON.Vec3(t, h / 2, half)), new CANNON.Vec3(Math.cos(a) * r, h / 2, Math.sin(a) * r), q]);
  }
  return out;
}

/** móvel extra fixo no chão (lixeira, máquina, cesto, horta) */
export class Fixture {
  readonly root = new THREE.Group();
  body: CANNON.Body | null = null;
  constructor(
    readonly eng: Engine,
    readonly room: RoomRec,
    pos: THREE.Vector3,
    yaw: number,
    readonly size: { w: number; d: number; h: number },
    solid = true,
  ) {
    this.root.position.copy(pos);
    this.root.quaternion.setFromAxisAngle(UP, yaw);
    eng.scene.add(this.root);
    this.root.updateMatrixWorld(true);
    if (solid) {
      const b = new CANNON.Body({ type: CANNON.Body.STATIC, mass: 0, collisionFilterGroup: G.STATIC, collisionFilterMask: G.ITEM | G.FOOD | G.DEBRIS | G.PLAYER | G.BOT });
      b.addShape(new CANNON.Box(new CANNON.Vec3(size.w / 2, size.h / 2, size.d / 2)), new CANNON.Vec3(0, size.h / 2, 0));
      b.position.set(pos.x, pos.y, pos.z);
      b.quaternion.set(this.root.quaternion.x, this.root.quaternion.y, this.root.quaternion.z, this.root.quaternion.w);
      eng.world.addBody(b);
      this.body = b;
    }
  }
  world(x: number, y: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
    return this.root.localToWorld(out.set(x, y, z));
  }
  local(p: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    return this.root.worldToLocal(out.copy(p));
  }
  dispose(): void {
    this.eng.scene.remove(this.root);
    if (this.body) this.eng.world.removeBody(this.body);
  }
}

/** caixas ocupadas por outros fixtures deste módulo (para não sobrepor) */
const taken: { x: number; z: number; r: number }[] = [];
export function resetTaken(): void {
  taken.length = 0;
}
/**
 * Canto livre encostado numa parede do cômodo (fora das portas, sem móvel em cima).
 * near: preferir perto deste ponto. Devolve posição no chão + giro (de frente para o meio).
 */
export function freeSpot(eng: Engine, room: RoomRec, w: number, d: number, near?: THREE.Vector3): { p: THREE.Vector3; yaw: number } | null {
  const cands: { l: THREE.Vector3; yaw: number }[] = [];
  const m = 0.06;
  for (let x = WALL_T + w / 2 + m; x <= ROOM_W - WALL_T - w / 2 - m; x += 0.2) {
    cands.push({ l: new THREE.Vector3(x, 0, WALL_T + d / 2 + m), yaw: 0 });
  }
  for (let z = WALL_T + w / 2 + 0.5; z <= ROOM_D - WALL_T - w / 2 - 0.4; z += 0.2) {
    cands.push({ l: new THREE.Vector3(WALL_T + d / 2 + m, 0, z), yaw: Math.PI / 2 });
    cands.push({ l: new THREE.Vector3(ROOM_W - WALL_T - d / 2 - m, 0, z), yaw: -Math.PI / 2 });
  }
  let best: { p: THREE.Vector3; yaw: number } | null = null;
  let bs = 1e9;
  const items = eng.items.filter((i) => i.room === room && !i.info.wall && !i.info.ceil && !i.info.flat);
  for (const c of cands) {
    // portas (meio das paredes leste/oeste e sul)
    if ((c.yaw !== 0 && Math.abs(c.l.z - ROOM_D / 2) < DOOR_HALF + w / 2 + 0.15) || false) continue;
    const p = room.group.localToWorld(c.l.clone());
    const rr = Math.max(w, d) / 2;
    let ok = true;
    for (const it of items) {
      const ir = Math.max(it.dims.w, it.dims.d) / 2;
      const dx = Math.abs(it.obj.position.x - p.x),
        dz = Math.abs(it.obj.position.z - p.z);
      if (dx < ir + rr * 0.9 + 0.05 && dz < ir + rr * 0.9 + 0.05) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    if (taken.some((t) => Math.hypot(t.x - p.x, t.z - p.z) < t.r + rr + 0.05)) continue;
    const score = near ? p.distanceTo(near) : Math.abs(c.l.x - ROOM_W / 2) * 0.1;
    if (score < bs) {
      bs = score;
      best = { p, yaw: c.yaw + room.rotY };
    }
  }
  if (best) taken.push({ x: best.p.x, z: best.p.z, r: Math.max(w, d) / 2 });
  return best;
}
