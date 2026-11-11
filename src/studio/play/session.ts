/* ============================================================
 *  BLOOP STUDIO — MODO JOGAR.
 *  Monta a física (cannon-es, carregado sob demanda) a partir da criação:
 *   - peças paradas → corpos estáticos + malhas FUNDIDAS por material;
 *   - criações repetidas e paradas (ex.: 30 árvores) → InstancedMesh;
 *   - grupos que se mexem (dinâmicos, juntas, portas) → um corpo por grupo;
 *   - veículos (assento + rodas/propulsores) → RaycastVehicle / voo;
 *   - fichas de lógica (botão, zona, timer) → portas, luzes, sons, pontos…
 *  O Bloop anda (joystick + arrastar para olhar), pula, aperta e dirige.
 * ============================================================ */
import * as THREE from 'three';
import type * as CANNON from 'cannon-es';
import { t } from '../../i18n';
import { tap } from '../../core/haptics';
import { sfx } from '../../3d/common/sfx';
import { bigMoment, notify } from '../../ui/notify';
import { bindButton, createJoystick, createLook, type Joystick, type LookDrag, type BoundButton } from '../../ui/touch';
import { LIMITS, isVehicle, type Action, type Creation, type Joint, type LogicRule, type Part, type SoundId, type Vec3 } from '../format';
import { Batcher, buildPart, disposeTree, partMatrix, resolveRef, type Resolver } from '../render/build';
import { primGeometry } from '../render/geo';
import { materialFor } from '../render/mats';
import { CH, RES, type WorldView } from '../world/terrain';
import { BloopAvatar } from './avatar';
import { ScriptVM, walkBlocks, type VmHost } from './vm';
import { filterMessage } from '../../../shared/moderation';

type CannonNS = typeof CANNON;
type BodyU = CANNON.Body & { userData?: { pid?: number; cluster?: string } };
const D2R = Math.PI / 180;
const STIFF = 55;
const UP = new THREE.Vector3(0, 1, 0);

export interface PlayHost {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  /** camada do HUD (por cima do canvas) */
  layer: HTMLElement;
  world: WorldView;
  resolve: Resolver;
  detail: number;
  tier: number;
  standard: boolean;
  /** texto do botão de sair (ex.: "Editar") */
  exitLabel: string;
  onExit(): void;
  /** venceu o mapa (chegada ou ficha "vencer") */
  onWin?(timeSec: number, score: number): void;
}

interface Pose {
  p: THREE.Vector3;
  q: THREE.Quaternion;
  s: THREE.Vector3;
}

interface Cluster {
  key: string;
  parts: Part[];
  kind: 'dynamic' | 'kinematic';
  body: CANNON.Body;
  obj: THREE.Group;
  p0: THREE.Vector3;
  q0: THREE.Quaternion;
  anim?: { t: number; dur: number; fp: THREE.Vector3; fq: THREE.Quaternion; tp: THREE.Vector3; tq: THREE.Quaternion };
  open?: boolean;
}

interface WheelRT {
  idx: number;
  obj: THREE.Object3D;
  qRel: THREE.Quaternion;
  front: boolean;
}
interface Vehicle {
  inst: Inst;
  cl: Cluster;
  rv: CANNON.RaycastVehicle | null;
  wheels: WheelRT[];
  seatLocal: THREE.Vector3;
  thrusters: THREE.Vector3[];
  mass: number;
  size: number;
}

interface JointRT {
  j: Joint;
  con: CANNON.Constraint | null;
  hinge: CANNON.HingeConstraint | null;
  a: CANNON.Body;
  b: CANNON.Body;
  axisW: THREE.Vector3;
  qa0: THREE.Quaternion;
  qb0: THREE.Quaternion;
  motorOn: boolean;
  slider?: { cl: Cluster; s: number; dir: number };
}

interface Trig {
  part: Part;
  box: THREE.Box3;
  inst: Inst;
}

interface Inst {
  c: Creation;
  m: THREE.Matrix4;
  pose: Map<number, Pose>;
  clusterOf: Map<number, Cluster>;
  meshes: Map<number, THREE.Object3D>;
  joints: JointRT[];
  rules: LogicRule[];
  lit: Map<number, boolean>;
  inside: Set<number>;
  timers: { rule: LogicRule; next: number }[];
  /** blocos de lógica desta instância */
  vm?: ScriptVM;
  /** corpos estáticos por peça (para "destruir") */
  sbodies: Map<number, CANNON.Body>;
  /** peças vigiadas por eventos "ao tocar" / coletáveis */
  touchIn: Set<number>;
  gone: Set<number>;
}

const SND: Record<SoundId, () => void> = {
  ding: () => sfx.catch(),
  pop: () => sfx.pop(),
  boing: () => sfx.boing(),
  whoosh: () => sfx.whoosh(),
  fanfare: () => (sfx.fix(), sfx.sparkle()),
  boom: () => (sfx.crash(), sfx.bump()),
};

export class PlaySession {
  private world: CANNON.World;
  private root = new THREE.Group();
  private insts: Inst[] = [];
  private clusters: Cluster[] = [];
  private bodies: CANNON.Body[] = [];
  private batch = new Batcher();
  private instTemplates = new Map<string, { m: THREE.Matrix4[]; c: Creation }>();
  private vehicles: Vehicle[] = [];
  private driving: Vehicle | null = null;
  private avatar: BloopAvatar;
  private me: CANNON.Body;
  private meMat: CANNON.Material;
  private solid: CANNON.Material;
  private anchor: CANNON.Body;
  private grounded = false;
  private groundVel = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0.32;
  private faceYaw = 0;
  private spawn = new THREE.Vector3(0, 1, 6);
  private spawnYaw = 0;
  private checkpoint: THREE.Vector3 | null = null;
  private checkpoints: Trig[] = [];
  private goals: Trig[] = [];
  private hazards: Trig[] = [];
  private buttons: Trig[] = [];
  private collects: Trig[] = [];
  private touches: Trig[] = [];
  private lives = -1;
  private livesStart = -1;
  private team = 0;
  private lost = false;
  private zones: Trig[] = [];
  private lights: { pid: number; inst: Inst; light: THREE.PointLight }[] = [];
  private spawned: { body: CANNON.Body; obj: THREE.Object3D }[] = [];
  private hf = new Map<string, CANNON.Body>();
  private trees = new Map<string, CANNON.Body>();
  private treeT = 0;
  private hfKey = '';
  private score = 0;
  private time = 0;
  private won = false;
  private hasGoal = false;
  private joy: Joystick;
  private look: LookDrag;
  private hud: HTMLElement;
  private btns: BoundButton[] = [];
  private actBtn: HTMLButtonElement;
  private jumpWant = false;
  private act: (() => void) | null = null;
  private chip: HTMLElement;
  private pressCd = 0;
  private camPos = new THREE.Vector3();
  private disposed = false;

  constructor(
    private C: CannonNS,
    private h: PlayHost,
    private doc: Creation,
  ) {
    const w = new C.World({ gravity: new C.Vec3(0, -9.82, 0) });
    w.broadphase = new C.SAPBroadphase(w);
    w.allowSleep = true;
    (w.solver as CANNON.GSSolver).iterations = h.tier <= 1 ? 7 : 10;
    w.defaultContactMaterial.friction = 0.35;
    w.defaultContactMaterial.restitution = 0.05;
    this.world = w;
    this.meMat = new C.Material('me');
    this.solid = new C.Material('solid');
    w.addContactMaterial(new C.ContactMaterial(this.meMat, this.solid, { friction: 0, restitution: 0 }));
    w.addContactMaterial(new C.ContactMaterial(this.solid, this.solid, { friction: 0.4, restitution: 0.05 }));
    this.anchor = new C.Body({ mass: 0 });
    w.addBody(this.anchor);
    h.scene.add(this.root);

    this.groundBodies();
    // criação principal + importadas
    this.addInstance(doc, new THREE.Matrix4(), 0);
    this.flushStatic();
    this.findSpawn();

    // o Bloop
    this.avatar = new BloopAvatar(h.standard);
    this.root.add(this.avatar.root);
    this.me = new C.Body({ mass: 1, material: this.meMat, fixedRotation: true, linearDamping: 0.05, allowSleep: false });
    this.me.addShape(new C.Sphere(0.45));
    this.world.addBody(this.me);
    this.respawn(true);

    // HUD
    this.hud = document.createElement('div');
    this.hud.className = 'bs-play';
    this.hud.innerHTML = `
      <button class="bs-pbtn bs-exit" data-touch-ignore>${h.exitLabel}</button>
      <div class="bs-chip" hidden></div>
      <button class="bs-round bs-jump" aria-label="${t('studio.play.jump', 'Pular')}"><svg viewBox="0 0 24 24"><path d="M12 4l7 8h-4v7H9v-7H5z" fill="currentColor"/></svg></button>
      <button class="bs-round bs-actbtn" hidden></button>`;
    h.layer.appendChild(this.hud);
    this.chip = this.hud.querySelector('.bs-chip')!;
    this.actBtn = this.hud.querySelector('.bs-actbtn')!;
    (this.hud.querySelector('.bs-exit') as HTMLButtonElement).onclick = () => h.onExit();
    this.btns.push(bindButton(this.hud.querySelector('.bs-jump')!, { onPress: () => (this.jumpWant = true) }));
    this.btns.push(bindButton(this.actBtn, { onPress: () => this.act?.(), haptic: 'medium' }));
    this.joy = createJoystick(h.layer, { zoneWidth: 0.45, zoneTop: 0.22, mouse: true });
    this.look = createLook(h.layer);
    h.layer.addEventListener('pointerup', this.onTapCanvas);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
    this.fire('start');
    for (const inst of this.insts) inst.vm?.emit('start');
    this.updateChip();
    // testar um veículo (sem ponto de início): já começa sentado ao volante
    if (doc.kind === 'vehicle' && this.vehicles.length && !doc.parts.some((p) => p.role === 'spawn')) this.enter(this.vehicles[0]);
  }

  /** todo corpo do mundo usa o material "sólido" (o Bloop desliza sem grudar em nada) */
  private add(b: CANNON.Body): void {
    if (!b.material) b.material = this.solid;
    this.world.addBody(b);
  }

  /* ------------------------------ chão / mundo ------------------------------ */

  private groundBodies(): void {
    const C = this.C;
    const k = this.h.world.kind;
    if (k === 'flat') {
      const b = new C.Body({ mass: 0 });
      b.addShape(new C.Plane());
      b.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
      this.add(b);
    } else if (k === 'void') {
      const b = new C.Body({ mass: 0 });
      b.addShape(new C.Cylinder(7, 6, 0.8, 24));
      b.position.set(0, -0.4, 0);
      this.add(b);
    }
  }

  /** heightfields 3×3 + árvores em volta do foco (mundo infinito) */
  private streamGround(focus: THREE.Vector3, dt: number): void {
    if (this.h.world.kind !== 'infinite') return;
    const C = this.C;
    const fx = Math.floor(focus.x / CH);
    const fz = Math.floor(focus.z / CH);
    const key = fx + ',' + fz;
    if (key !== this.hfKey) {
      this.hfKey = key;
      const want = new Set<string>();
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const cx = fx + dx;
          const cz = fz + dz;
          const k = cx + ',' + cz;
          want.add(k);
          if (this.hf.has(k)) continue;
          const es = CH / RES;
          const x0 = cx * CH;
          const z0 = cz * CH;
          const data: number[][] = [];
          for (let i = 0; i <= RES; i++) {
            const row: number[] = [];
            for (let j = 0; j <= RES; j++) row.push(this.h.world.heightAt(x0 + i * es, z0 + CH - j * es));
            data.push(row);
          }
          const b = new C.Body({ mass: 0 });
          b.addShape(new C.Heightfield(data, { elementSize: es }));
          b.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
          b.position.set(x0, 0, z0 + CH);
          this.add(b);
          this.hf.set(k, b);
        }
      for (const [k, b] of this.hf)
        if (!want.has(k)) {
          this.world.removeBody(b);
          this.hf.delete(k);
        }
    }
    this.treeT -= dt;
    if (this.treeT <= 0) {
      this.treeT = 0.5;
      const near = this.h.world.treesNear(focus.x, focus.z, 40);
      const want = new Set<string>();
      for (const tr of near) {
        const k = tr.x.toFixed(1) + ',' + tr.z.toFixed(1);
        want.add(k);
        if (this.trees.has(k)) continue;
        const b = new C.Body({ mass: 0 });
        b.addShape(new C.Cylinder(tr.r, tr.r * 1.2, tr.h, 8));
        b.position.set(tr.x, tr.y + tr.h / 2, tr.z);
        this.add(b);
        this.trees.set(k, b);
      }
      for (const [k, b] of this.trees)
        if (!want.has(k)) {
          this.world.removeBody(b);
          this.trees.delete(k);
        }
    }
  }

  /* --------------------------------- montagem --------------------------------- */

  private addInstance(c: Creation, m: THREE.Matrix4, depth: number): Inst {
    const inst: Inst = { c, m, pose: new Map(), clusterOf: new Map(), meshes: new Map(), joints: [], rules: c.logic, lit: new Map(), inside: new Set(), timers: [], sbodies: new Map(), touchIn: new Set(), gone: new Set() };
    this.insts.push(inst);
    const pm = new THREE.Matrix4();
    for (const p of c.parts) {
      const wm = new THREE.Matrix4().multiplyMatrices(m, partMatrix(p, pm));
      const pose: Pose = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() };
      wm.decompose(pose.p, pose.q, pose.s);
      inst.pose.set(p.id, pose);
    }
    // importadas: cada uma vira uma instância própria (com lógica/juntas próprias)
    for (const p of c.parts) {
      if (p.t !== 'ref' || depth >= LIMITS.refDepth) continue;
      const rc = resolveRef(this.doc, p.ref, this.h.resolve);
      if (!rc) continue;
      const wm = new THREE.Matrix4().multiplyMatrices(m, partMatrix(p, pm));
      if (this.isPlainStatic(rc)) {
        // instanciamento: geometria do molde uma vez, N matrizes
        let tp = this.instTemplates.get(rc.id);
        if (!tp) this.instTemplates.set(rc.id, (tp = { m: [], c: rc }));
        tp.m.push(wm);
        const sub: Inst = { c: rc, m: wm, pose: new Map(), clusterOf: new Map(), meshes: new Map(), joints: [], rules: [], lit: new Map(), inside: new Set(), timers: [], sbodies: new Map(), touchIn: new Set(), gone: new Set() };
        for (const q of rc.parts) {
          const qm = new THREE.Matrix4().multiplyMatrices(wm, partMatrix(q, pm));
          const pose: Pose = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() };
          qm.decompose(pose.p, pose.q, pose.s);
          sub.pose.set(q.id, pose);
          if (q.t !== 'ref' && q.phys !== 'none' && !q.hide && q.role !== 'zone') this.staticBody(q, pose, sub);
        }
      } else this.addInstance(rc, wm, depth + 1);
    }
    if (isVehicle(c)) {
      this.buildVehicle(inst);
      return inst;
    }
    // quem se mexe?
    const moving = new Map<number, 'dynamic' | 'kinematic'>();
    const grp = (p: Part) => (p.g ? c.parts.filter((q) => q.g === p.g) : [p]);
    for (const p of c.parts) if (p.phys === 'dynamic') for (const q of grp(p)) moving.set(q.id, 'dynamic');
    for (const j of c.joints) {
      const a = c.parts.find((p) => p.id === j.a);
      if (a) for (const q of grp(a)) moving.set(q.id, j.k === 'slider' ? 'kinematic' : 'dynamic');
    }
    for (const r of c.logic)
      for (const a of r.do)
        if ((a.k === 'door' || a.k === 'move') && a.part != null) {
          const tp = c.parts.find((p) => p.id === a.part);
          if (tp) for (const q of grp(tp)) moving.set(q.id, 'kinematic');
        }
    // blocos: o que eles mexem vira cinemático (mover/girar/porta) ou dinâmico (força); cor/destruir = malha própria
    const scriptSpecial = new Set<number>();
    for (const sc of c.scripts ?? [])
      walkBlocks(sc.body, (b) => {
        const pid = 'part' in b ? (b.part ?? sc.on.part) : undefined;
        if (pid == null) return;
        const tp = c.parts.find((p) => p.id === pid);
        if (!tp) return;
        if (b.k === 'move' || b.k === 'rotate' || b.k === 'door') for (const q of grp(tp)) moving.set(q.id, 'kinematic');
        else if (b.k === 'force') {
          for (const q of grp(tp)) if (!moving.has(q.id)) moving.set(q.id, 'dynamic');
        } else if (b.k === 'color' || b.k === 'destroy' || b.k === 'light') scriptSpecial.add(pid);
      });
    // aglomerados
    const byKey = new Map<string, Part[]>();
    for (const p of c.parts) {
      if (p.t === 'ref' || !moving.has(p.id) || p.hide || p.role === 'zone') continue;
      const k = p.g ? 'g' + p.g : 'p' + p.id;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k)!.push(p);
    }
    for (const [k, parts] of byKey) {
      const kind = parts.some((p) => moving.get(p.id) === 'kinematic') ? 'kinematic' : 'dynamic';
      const cl = this.makeCluster(inst, k, parts, kind, null);
      for (const p of parts) inst.clusterOf.set(p.id, cl);
    }
    // parados
    for (const p of c.parts) {
      if (p.t === 'ref' || inst.clusterOf.has(p.id)) continue;
      const pose = inst.pose.get(p.id)!;
      if (p.role === 'zone') {
        this.zones.push({ part: p, box: this.boxOf(p, inst), inst });
        continue;
      }
      if (p.hide) continue;
      const special = p.role === 'light' || p.role === 'button' || p.role === 'collect' || scriptSpecial.has(p.id) || c.logic.some((r) => r.do.some((a) => a.k === 'light' && a.part === p.id));
      if (special) {
        const o = buildPart(p, c, this.h.resolve, { detail: this.h.detail, edit: false });
        o.position.copy(pose.p);
        o.quaternion.copy(pose.q);
        o.scale.copy(pose.s);
        this.root.add(o);
        inst.meshes.set(p.id, o);
        if (p.role === 'light') this.setLight(inst, p.id, true);
      } else {
        const o = buildPart(p, c, this.h.resolve, { detail: this.h.detail, edit: false });
        o.position.copy(pose.p);
        o.quaternion.copy(pose.q);
        o.scale.copy(pose.s);
        o.updateMatrixWorld(true);
        this.batch.addObject(o, new THREE.Matrix4());
        disposeTree(o);
      }
      if (p.phys !== 'none' && p.role !== 'collect') this.staticBody(p, pose, inst);
      const tr: Trig = { part: p, box: this.boxOf(p, inst), inst };
      if (p.role === 'checkpoint') this.checkpoints.push(tr);
      if (p.role === 'goal') this.goals.push(tr);
      if (p.role === 'hazard') this.hazards.push(tr);
      if (p.role === 'button') this.buttons.push(tr);
      if (p.role === 'collect') this.collects.push(tr);
    }
    if (this.goals.length) this.hasGoal = true;
    // juntas
    for (const j of c.joints) this.addJoint(inst, j);
    for (const r of c.logic) if (r.on.k === 'timer') inst.timers.push({ rule: r, next: r.on.sec ?? 3 });
    if (c.scripts?.length) {
      inst.vm = new ScriptVM(c.scripts, this.vmHost(inst), (c.seed ?? 7) + this.insts.length);
      for (const pid of inst.vm.watchedParts('touch')) {
        const q = c.parts.find((x) => x.id === pid);
        if (q) this.touches.push({ part: q, box: this.boxOf(q, inst), inst });
      }
    }
    return inst;
  }

  private isPlainStatic(c: Creation): boolean {
    return !c.joints.length && !c.logic.length && !isVehicle(c) && c.parts.every((p) => p.t !== 'ref' && p.phys !== 'dynamic' && !p.role && !p.hide);
  }

  private boxOf(p: Part, inst: Inst): THREE.Box3 {
    const pose = inst.pose.get(p.id)!;
    const geo = p.t === 'stroke' || p.t === 'ref' ? null : primGeometry(p.t, 0);
    const b = geo?.boundingBox?.clone() ?? new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5));
    return b.applyMatrix4(new THREE.Matrix4().compose(pose.p, pose.q, pose.s));
  }

  /** formas de colisão de uma peça, relativas ao corpo (pos/rot do corpo = bp/bq) */
  private addShapes(body: CANNON.Body, p: Part, pose: Pose, bp: THREE.Vector3, bq: THREE.Quaternion): void {
    const C = this.C;
    const iq = bq.clone().invert();
    const rp = pose.p.clone().sub(bp).applyQuaternion(iq);
    const rq = iq.clone().multiply(pose.q);
    const s = pose.s;
    const add = (shape: CANNON.Shape, lp = new THREE.Vector3(), lq = new THREE.Quaternion()) => {
      const off = lp.clone().multiply(s).applyQuaternion(rq).add(rp);
      const q = rq.clone().multiply(lq);
      body.addShape(shape, new C.Vec3(off.x, off.y, off.z), new C.Quaternion(q.x, q.y, q.z, q.w));
    };
    const ax = Math.abs(s.x);
    const ay = Math.abs(s.y);
    const az = Math.abs(s.z);
    const box = (hx: number, hy: number, hz: number) => new C.Box(new C.Vec3(Math.max(0.01, hx), Math.max(0.01, hy), Math.max(0.01, hz)));
    switch (p.t) {
      case 'box':
        add(box(ax / 2, ay / 2, az / 2));
        break;
      case 'sphere':
        add(new C.Sphere(Math.max(0.02, (ax + ay + az) / 6)));
        break;
      case 'cylinder':
      case 'capsule':
        add(new C.Cylinder(Math.max(ax, az) / 2, Math.max(ax, az) / 2, ay, 10));
        break;
      case 'cone':
        add(new C.Cylinder(Math.max(ax, az) * 0.05, Math.max(ax, az) / 2, ay, 10));
        break;
      case 'wedge':
      case 'ramp': {
        const hx = ax / 2,
          hy = ay / 2,
          hz = az / 2;
        const v = [
          [-hx, -hy, -hz],
          [hx, -hy, -hz],
          [hx, -hy, hz],
          [-hx, -hy, hz],
          [-hx, hy, hz],
          [hx, hy, hz],
        ].map(([x, y, z]) => new C.Vec3(x, y, z));
        const faces = [
          [0, 1, 2, 3],
          [3, 2, 5, 4],
          [0, 4, 5, 1],
          [0, 3, 4],
          [1, 5, 2],
        ];
        // escala já aplicada nos vértices: posição sem escala extra
        const q = rq.clone();
        body.addShape(new C.ConvexPolyhedron({ vertices: v, faces }), new C.Vec3(rp.x, rp.y, rp.z), new C.Quaternion(q.x, q.y, q.z, q.w));
        break;
      }
      case 'torus':
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          add(box(0.125 * (ax + ay) / 2, (0.375 * Math.PI * 2 * ((ax + ay) / 2)) / 20 + 0.02, 0.125 * az), new THREE.Vector3(Math.cos(a) * 0.375, Math.sin(a) * 0.375, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a));
        }
        break;
      case 'pipe':
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          add(box(0.07 * (ax + az) / 2, ay / 2, (0.43 * Math.PI * 2 * ((ax + az) / 2)) / 20 + 0.02), new THREE.Vector3(Math.cos(a) * 0.43, 0, Math.sin(a) * 0.43), new THREE.Quaternion().setFromAxisAngle(UP, -a));
        }
        break;
      case 'arch':
        add(box(0.1 * ax, 0.25 * ay, az / 2), new THREE.Vector3(-0.4, -0.25, 0));
        add(box(0.1 * ax, 0.25 * ay, az / 2), new THREE.Vector3(0.4, -0.25, 0));
        add(box(0.5 * ax, 0.1 * ay, az / 2), new THREE.Vector3(0, 0.4, 0));
        add(box(0.12 * ax, 0.12 * ay, az / 2), new THREE.Vector3(-0.36, 0.17, 0));
        add(box(0.12 * ax, 0.12 * ay, az / 2), new THREE.Vector3(0.36, 0.17, 0));
        break;
      case 'stroke': {
        const pts = p.pts;
        const n = Math.floor(pts.length / 3);
        const step = Math.max(1, Math.ceil(n / 24));
        const k = (ax + ay + az) / 3;
        for (let i = 0; i + step < n; i += step) {
          const a = new THREE.Vector3(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
          const j = Math.min(n - 1, i + step);
          const b = new THREE.Vector3(pts[j * 3], pts[j * 3 + 1], pts[j * 3 + 2]);
          const len = a.distanceTo(b);
          if (len < 1e-3) continue;
          const mid = a.clone().add(b).multiplyScalar(0.5);
          const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), b.clone().sub(a).normalize());
          const off = mid.clone().multiplyScalar(k).applyQuaternion(rq).add(rp);
          const qq = rq.clone().multiply(q);
          body.addShape(box(p.w * k, p.w * k, (len * k) / 2 + p.w * k * 0.5), new C.Vec3(off.x, off.y, off.z), new C.Quaternion(qq.x, qq.y, qq.z, qq.w));
        }
        break;
      }
    }
  }

  private staticBody(p: Part, pose: Pose, inst?: Inst): CANNON.Body {
    const b = new this.C.Body({ mass: 0 });
    b.position.set(pose.p.x, pose.p.y, pose.p.z);
    this.addShapes(b, p, pose, pose.p, new THREE.Quaternion());
    (b as BodyU).userData = { pid: p.id };
    inst?.sbodies.set(p.id, b);
    this.add(b);
    this.bodies.push(b);
    return b;
  }

  private makeCluster(inst: Inst, key: string, parts: Part[], kind: 'dynamic' | 'kinematic', frameQ: THREE.Quaternion | null, center?: THREE.Vector3): Cluster {
    const C = this.C;
    const ctr = center?.clone() ?? new THREE.Vector3();
    if (!center) {
      for (const p of parts) ctr.add(inst.pose.get(p.id)!.p);
      ctr.multiplyScalar(1 / parts.length);
    }
    const q = frameQ ?? new THREE.Quaternion();
    let vol = 0;
    for (const p of parts) {
      const s = inst.pose.get(p.id)!.s;
      vol += Math.abs(s.x * s.y * s.z) * (p.t === 'sphere' ? 0.52 : p.t === 'box' ? 1 : 0.6);
    }
    const mass = kind === 'kinematic' ? 0 : Math.max(0.5, Math.min(800, vol * 90));
    const body = new C.Body({ mass, type: kind === 'kinematic' ? C.Body.KINEMATIC : C.Body.DYNAMIC });
    body.position.set(ctr.x, ctr.y, ctr.z);
    body.quaternion.set(q.x, q.y, q.z, q.w);
    body.sleepSpeedLimit = 0.15;
    body.sleepTimeLimit = 0.8;
    body.angularDamping = 0.12;
    body.linearDamping = 0.04;
    const obj = new THREE.Group();
    obj.position.copy(ctr);
    obj.quaternion.copy(q);
    const iq = q.clone().invert();
    for (const p of parts) {
      const pose = inst.pose.get(p.id)!;
      if (p.phys !== 'none') this.addShapes(body, p, pose, ctr, q);
      const o = buildPart(p, inst.c, this.h.resolve, { detail: this.h.detail, edit: false });
      o.position.copy(pose.p).sub(ctr).applyQuaternion(iq);
      o.quaternion.copy(iq).multiply(pose.q);
      o.scale.copy(pose.s);
      obj.add(o);
      inst.meshes.set(p.id, o);
    }
    if (!body.shapes.length) body.addShape(new C.Sphere(0.05));
    (body as BodyU).userData = { cluster: key };
    this.add(body);
    this.root.add(obj);
    const cl: Cluster = { key, parts, kind, body, obj, p0: ctr.clone(), q0: q.clone() };
    this.clusters.push(cl);
    return cl;
  }

  private flushStatic(): void {
    for (const m of this.batch.build()) this.root.add(m);
    // modelos repetidos → InstancedMesh por material
    for (const tp of this.instTemplates.values()) {
      const b = new Batcher();
      for (const p of tp.c.parts) {
        if (p.hide || p.role === 'zone') continue;
        const o = buildPart(p, tp.c, this.h.resolve, { detail: this.h.detail, edit: false });
        o.updateMatrixWorld(true);
        b.addObject(o, new THREE.Matrix4());
        disposeTree(o);
      }
      for (const mesh of b.build()) {
        const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, tp.m.length);
        tp.m.forEach((m, i) => im.setMatrixAt(i, m));
        im.userData.ownGeo = true;
        im.castShadow = im.receiveShadow = true;
        im.computeBoundingSphere();
        this.root.add(im);
      }
    }
  }

  /* --------------------------------- veículos --------------------------------- */

  private buildVehicle(inst: Inst): void {
    const C = this.C;
    const c = inst.c;
    const seat = c.parts.find((p) => p.role === 'seat')!;
    const sp = inst.pose.get(seat.id)!;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(sp.q);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
    fwd.normalize();
    const yaw = Math.atan2(-fwd.x, -fwd.z);
    const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    const wheels = c.parts.filter((p) => p.role === 'wheel');
    const thr = c.parts.filter((p) => p.role === 'thruster');
    // peças "coladas" numa roda giram com ela (calotas)
    const attach = new Map<number, number>();
    for (const p of c.parts) {
      if (p.role === 'wheel' || p.phys !== 'none') continue;
      const pp = inst.pose.get(p.id)!.p;
      for (const w of wheels) {
        const wp = inst.pose.get(w.id)!;
        const r = Math.max(Math.abs(wp.s.x), Math.abs(wp.s.z)) / 2;
        if (pp.distanceTo(wp.p) < r * 0.7) attach.set(p.id, w.id);
      }
    }
    const chassis = c.parts.filter((p) => p.role !== 'wheel' && !attach.has(p.id) && p.t !== 'ref' && !p.hide && p.role !== 'zone');
    const ctr = new THREE.Vector3();
    for (const p of chassis) ctr.add(inst.pose.get(p.id)!.p);
    ctr.multiplyScalar(1 / Math.max(1, chassis.length));
    if (wheels.length) {
      let wy = 0;
      let wr = 0;
      for (const w of wheels) {
        const wp = inst.pose.get(w.id)!;
        wy += wp.p.y;
        wr += Math.max(Math.abs(wp.s.x), Math.abs(wp.s.z)) / 2;
      }
      // centro de massa quase no chão (truque de jogo arcade): acelerar/frear não empina nem capota
      ctr.y = Math.min(ctr.y, (wy - wr * 0.75) / wheels.length);
    }
    const cl = this.makeCluster(inst, 'veh', chassis, 'dynamic', q, ctr);
    for (const p of chassis) inst.clusterOf.set(p.id, cl);
    const body = cl.body;
    const box = new THREE.Box3();
    for (const p of c.parts) box.expandByPoint(inst.pose.get(p.id)!.p);
    const size = box.getSize(new THREE.Vector3()).length();
    const mass = Math.max(120, Math.min(900, chassis.length * 25 + size * 30));
    body.mass = mass;
    body.updateMassProperties();
    body.angularDamping = 0.45;
    body.allowSleep = false;
    const iq = q.clone().invert();
    const v: Vehicle = { inst, cl, rv: null, wheels: [], seatLocal: sp.p.clone().sub(ctr).applyQuaternion(iq), thrusters: [], mass, size };
    if (wheels.length) {
      const rv = new C.RaycastVehicle({ chassisBody: body, indexRightAxis: 0, indexUpAxis: 1, indexForwardAxis: 2 });
      let zc = 0;
      for (const w of wheels) zc += inst.pose.get(w.id)!.p.clone().sub(ctr).applyQuaternion(iq).z;
      zc /= wheels.length;
      for (const w of wheels) {
        const wp = inst.pose.get(w.id)!;
        const local = wp.p.clone().sub(ctr).applyQuaternion(iq);
        const r = Math.max(0.12, Math.max(Math.abs(wp.s.x), Math.abs(wp.s.z)) / 2);
        const rest = 0.3;
        const idx = rv.addWheel({
          radius: r,
          directionLocal: new C.Vec3(0, -1, 0),
          suspensionStiffness: STIFF,
          suspensionRestLength: rest,
          frictionSlip: 2.6,
          dampingRelaxation: 2.6,
          dampingCompression: 4.4,
          maxSuspensionForce: 1e6,
          rollInfluence: 0.02,
          axleLocal: new C.Vec3(-1, 0, 0),
          // compensa o quanto a mola afunda com o peso (g/rigidez): parado, a roda fica onde foi desenhada
          chassisConnectionPointLocal: new C.Vec3(local.x, local.y + rest - 9.82 / STIFF, local.z),
          maxSuspensionTravel: 0.35,
          customSlidingRotationalSpeed: -30,
          useCustomSlidingRotationalSpeed: true,
        });
        const obj = new THREE.Group();
        const qRel = iq.clone().multiply(wp.q);
        const m = buildPart(w, c, this.h.resolve, { detail: this.h.detail, edit: false });
        m.position.set(0, 0, 0);
        m.quaternion.copy(qRel);
        obj.add(m);
        for (const [pid, wid] of attach)
          if (wid === w.id) {
            const ap = c.parts.find((x) => x.id === pid)!;
            const pose = inst.pose.get(pid)!;
            const am = buildPart(ap, c, this.h.resolve, { detail: this.h.detail, edit: false });
            am.position.copy(pose.p.clone().sub(wp.p).applyQuaternion(iq));
            am.quaternion.copy(iq.clone().multiply(pose.q));
            obj.add(am);
          }
        this.root.add(obj);
        v.wheels.push({ idx, obj, qRel, front: local.z < zc - 0.05 });
      }
      if (!v.wheels.some((w) => w.front)) v.wheels.forEach((w) => (w.front = true));
      rv.addToWorld(this.world);
      v.rv = rv;
    }
    for (const tp of thr) {
      const pose = inst.pose.get(tp.id)!;
      // empurra para o lado oposto ao "topo" da peça (como um jato)
      v.thrusters.push(new THREE.Vector3(0, -1, 0).applyQuaternion(iq.clone().multiply(pose.q)).normalize());
    }
    if (!wheels.length) body.angularDamping = 0.85;
    this.vehicles.push(v);
  }

  private enter(v: Vehicle): void {
    this.driving = v;
    this.world.removeBody(this.me);
    v.cl.obj.add(this.avatar.root);
    this.avatar.root.position.copy(v.seatLocal).add(new THREE.Vector3(0, 0.45, 0));
    this.avatar.root.rotation.set(0, 0, 0);
    v.cl.body.wakeUp();
    sfx.pop();
    notify(t('studio.play.driveTip', 'Joystick: acelerar e virar · Sair no botão'), { icon: 'car', key: 'drive' });
  }
  private leave(): void {
    const v = this.driving;
    if (!v) return;
    this.driving = null;
    this.root.add(this.avatar.root);
    const b = v.cl.body;
    const side = new THREE.Vector3(1.6 + v.size * 0.15, 0.6, 0).applyQuaternion(new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w));
    this.me.position.set(b.position.x + side.x, b.position.y + side.y + 0.5, b.position.z + side.z);
    this.me.velocity.set(0, 0, 0);
    this.add(this.me);
    for (const w of v.wheels) {
      v.rv?.applyEngineForce(0, w.idx);
      v.rv?.setBrake(v.mass * 2, w.idx);
    }
  }

  private drive(v: Vehicle, dt: number, jx: number, jy: number): void {
    const b = v.cl.body;
    const q = new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const vel = new THREE.Vector3(b.velocity.x, b.velocity.y, b.velocity.z);
    const speed = vel.dot(fwd);
    if (v.rv) {
      const F = v.mass * 6;
      for (const w of v.wheels) {
        let force = 0;
        let brake = 0;
        const vmax = 17; // ~60 km/h: divertido e controlável no celular
        if (jy > 0.05) force = speed < -0.5 || speed > vmax ? 0 : jy * F;
        else if (jy < -0.05) force = speed > 0.8 || speed < -7 ? 0 : jy * F * 0.6;
        if ((jy < -0.05 && speed > 0.8) || (jy > 0.05 && speed < -0.5)) brake = v.mass * 0.5;
        else if (Math.abs(jy) < 0.05) brake = v.mass * 0.03;
        // frente do veículo = −Z local (com eixo das rodas −X, força positiva empurra para −Z)
        v.rv.applyEngineForce(force, w.idx);
        v.rv.setBrake(brake, w.idx);
        const steerMax = 0.5 / (1 + Math.abs(speed) * 0.04);
        v.rv.setSteeringValue(w.front ? -jx * steerMax : 0, w.idx);
      }
      // ajuda a não capotar: torque de endireitar suave
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      if (up.y < 0.97) {
        const tq = up.clone().cross(UP).multiplyScalar(v.mass * (up.y < 0.5 ? 14 : 5));
        b.applyTorque(new this.C.Vec3(tq.x, tq.y, tq.z));
      }
    }
    if (v.thrusters.length) {
      const g = 9.82 * v.mass;
      const pow = v.rv ? Math.max(0, jy) * 0.6 : 0.82 + jy * 0.9;
      for (const d of v.thrusters) {
        const f = d.clone().applyQuaternion(q).multiplyScalar((g * pow) / v.thrusters.length);
        b.applyForce(new this.C.Vec3(f.x, f.y, f.z));
      }
      if (!v.rv) {
        b.applyTorque(new this.C.Vec3(0, -jx * v.mass * 3, 0));
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
        const tq = up.clone().cross(UP).multiplyScalar(v.mass * 10);
        b.applyTorque(new this.C.Vec3(tq.x, tq.y, tq.z));
      }
    }
    void dt;
  }

  /* --------------------------------- juntas --------------------------------- */

  private bodyOfPart(inst: Inst, pid: number): CANNON.Body | null {
    const cl = inst.clusterOf.get(pid);
    if (cl) return cl.body;
    return this.bodies.find((b) => (b as BodyU).userData?.pid === pid) ?? null;
  }

  private addJoint(inst: Inst, j: Joint): void {
    const C = this.C;
    const a = inst.clusterOf.get(j.a);
    if (!a) return;
    const b = j.b ? this.bodyOfPart(inst, j.b) ?? this.anchor : this.anchor;
    const pw = new THREE.Vector3(...j.at).applyMatrix4(inst.m);
    const axW = new THREE.Vector3(...(j.axis ?? [0, 1, 0])).transformDirection(inst.m).normalize();
    const rt: JointRT = { j, con: null, hinge: null, a: a.body, b, axisW: axW, qa0: q3(a.body.quaternion), qb0: q3(b.quaternion), motorOn: j.motor ? j.motor.on !== false : false };
    if (j.k === 'slider') {
      rt.slider = { cl: a, s: 0, dir: Math.sign(j.motor?.speed ?? 1) || 1 };
    } else if (j.k === 'hinge') {
      const pA = a.body.pointToLocalFrame(new C.Vec3(pw.x, pw.y, pw.z));
      const pB = b.pointToLocalFrame(new C.Vec3(pw.x, pw.y, pw.z));
      const aA = a.body.vectorToLocalFrame(new C.Vec3(axW.x, axW.y, axW.z));
      const aB = b.vectorToLocalFrame(new C.Vec3(axW.x, axW.y, axW.z));
      const h = new C.HingeConstraint(a.body, b, { pivotA: pA, pivotB: pB, axisA: aA, axisB: aB, maxForce: 1e6 });
      this.world.addConstraint(h);
      rt.con = h;
      rt.hinge = h;
      if (j.motor) {
        h.setMotorSpeed(j.motor.speed);
        h.setMotorMaxForce(j.motor.force ?? 500);
        if (rt.motorOn) h.enableMotor();
      }
      a.body.allowSleep = !j.motor;
    } else {
      const l = new C.LockConstraint(a.body, b, { maxForce: 1e6 });
      this.world.addConstraint(l);
      rt.con = l;
    }
    inst.joints.push(rt);
  }

  private stepJoints(dt: number): void {
    for (const inst of this.insts)
      for (const rt of inst.joints) {
        const j = rt.j;
        if (rt.slider) {
          const sl = rt.slider;
          const lim = j.lim ?? [0, 2];
          const sp = Math.abs(j.motor?.speed ?? 0);
          if (!rt.motorOn || !sp) {
            sl.cl.body.velocity.set(0, 0, 0);
            continue;
          }
          sl.s += sl.dir * sp * dt;
          if (sl.s > lim[1]) (sl.s = lim[1]), (sl.dir = -1);
          if (sl.s < lim[0]) (sl.s = lim[0]), (sl.dir = 1);
          const p = sl.cl.p0.clone().addScaledVector(rt.axisW, sl.s);
          const b = sl.cl.body;
          b.velocity.set((p.x - b.position.x) / dt, (p.y - b.position.y) / dt, (p.z - b.position.z) / dt);
          continue;
        }
        if (rt.hinge && j.lim) {
          // limites da dobradiça (o cannon não tem): corta a velocidade além do limite e puxa de volta
          const qa = q3(rt.a.quaternion).multiply(rt.qa0.clone().invert());
          const qb = q3(rt.b.quaternion).multiply(rt.qb0.clone().invert());
          const rel = qb.clone().invert().multiply(qa);
          const ang = 2 * Math.atan2(rel.x * rt.axisW.x + rel.y * rt.axisW.y + rel.z * rt.axisW.z, rel.w) / D2R;
          const ax = rt.axisW.clone().applyQuaternion(qb);
          const wa = rt.a.angularVelocity;
          const wb = rt.b.angularVelocity;
          const w = (wa.x - wb.x) * ax.x + (wa.y - wb.y) * ax.y + (wa.z - wb.z) * ax.z;
          let fix = 0;
          if (ang > j.lim[1] && w > -0.5) fix = -w - (ang - j.lim[1]) * D2R * 8;
          else if (ang < j.lim[0] && w < 0.5) fix = -w + (j.lim[0] - ang) * D2R * 8;
          if (fix) {
            wa.x += ax.x * fix;
            wa.y += ax.y * fix;
            wa.z += ax.z * fix;
          }
        }
      }
  }

  /* --------------------------------- lógica --------------------------------- */

  private fire(kind: 'start'): void {
    for (const inst of this.insts) for (const r of inst.rules) if (r.on.k === kind) this.run(inst, r);
  }

  private run(inst: Inst, r: LogicRule): void {
    for (const a of r.do) this.doAction(inst, a);
  }

  private doAction(inst: Inst, a: Action): void {
    switch (a.k) {
      case 'door':
      case 'move': {
        const cl = a.part != null ? inst.clusterOf.get(a.part) : null;
        if (!cl) return;
        cl.open = !cl.open;
        const p = new THREE.Vector3(cl.body.position.x, cl.body.position.y, cl.body.position.z);
        const q = q3(cl.body.quaternion);
        let tp = cl.p0.clone();
        let tq = cl.q0.clone();
        if (cl.open) {
          if (a.k === 'move') tp = cl.p0.clone().add(new THREE.Vector3(...(a.d ?? [0, 2, 0])).transformDirection(inst.m).multiplyScalar(new THREE.Vector3(...(a.d ?? [0, 2, 0])).length()));
          else {
            // gira 90° em volta da borda esquerda da peça
            const part = inst.c.parts.find((x) => x.id === a.part)!;
            const pose = inst.pose.get(part.id)!;
            const edge = new THREE.Vector3(-0.5, 0, 0).multiply(pose.s).applyQuaternion(pose.q).add(pose.p);
            const rot = new THREE.Quaternion().setFromAxisAngle(UP, -Math.PI / 2);
            tp = cl.p0.clone().sub(edge).applyQuaternion(rot).add(edge);
            tq = rot.multiply(cl.q0.clone());
          }
        }
        cl.anim = { t: 0, dur: a.k === 'door' ? 0.6 : 0.9, fp: p, fq: q, tp, tq };
        cl.body.wakeUp();
        sfx.swish();
        return;
      }
      case 'light':
        if (a.part != null) this.setLight(inst, a.part, !inst.lit.get(a.part));
        return;
      case 'teleport': {
        const pose = a.part != null ? inst.pose.get(a.part) : null;
        if (!pose) return;
        if (this.driving) this.leave();
        this.me.position.set(pose.p.x, pose.p.y + Math.abs(pose.s.y) / 2 + 0.6, pose.p.z);
        this.me.velocity.set(0, 0, 0);
        sfx.poof();
        return;
      }
      case 'spawn':
        if (a.part != null) this.spawnCopy(inst, a.part);
        return;
      case 'sound':
        SND[a.snd ?? 'ding']();
        return;
      case 'score':
        this.score += a.n ?? 1;
        this.updateChip();
        notify(`${(a.n ?? 1) >= 0 ? '+' : ''}${a.n ?? 1}`, { icon: 'star', kind: 'good', key: 'score' + this.score });
        return;
      case 'motor': {
        const rt = inst.joints.find((x) => x.j.id === a.joint);
        if (!rt) return;
        rt.motorOn = !rt.motorOn;
        if (rt.hinge) {
          if (rt.motorOn) rt.hinge.enableMotor();
          else rt.hinge.disableMotor();
        }
        rt.a.wakeUp();
        return;
      }
      case 'win':
        this.win();
        return;
    }
  }

  private setLight(inst: Inst, pid: number, on: boolean): void {
    inst.lit.set(pid, on);
    const o = inst.meshes.get(pid);
    const part = inst.c.parts.find((p) => p.id === pid);
    if (!o || !part) return;
    const mat = inst.c.materials[part.m ?? 0] ?? inst.c.materials[0];
    o.traverse((x) => {
      const m = x as THREE.Mesh;
      if (m.isMesh) m.material = materialFor(on ? { c: mat.c, k: 'neon' } : mat, { lit: on });
    });
    let L = this.lights.find((l) => l.inst === inst && l.pid === pid);
    if (on && !L && this.h.tier >= 2 && this.lights.length < 6) {
      const light = new THREE.PointLight(new THREE.Color(mat.c).lerp(new THREE.Color('#ffffff'), 0.5), 6, 9, 1.6);
      o.getWorldPosition(light.position);
      this.root.add(light);
      L = { pid, inst, light };
      this.lights.push(L);
    }
    if (L) L.light.visible = on;
  }

  private spawnCopy(inst: Inst, pid: number): void {
    const part = inst.c.parts.find((p) => p.id === pid);
    const pose = inst.pose.get(pid);
    if (!part || !pose || part.t === 'ref') return;
    const C = this.C;
    const p = pose.p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.2, (Math.random() - 0.5) * 0.3));
    const body = new C.Body({ mass: Math.max(0.3, Math.abs(pose.s.x * pose.s.y * pose.s.z) * 60) });
    body.position.set(p.x, p.y, p.z);
    body.quaternion.set(pose.q.x, pose.q.y, pose.q.z, pose.q.w);
    this.addShapes(body, part, { ...pose, p }, p, pose.q);
    this.add(body);
    const o = buildPart({ ...part, hide: undefined }, inst.c, this.h.resolve, { detail: this.h.detail, edit: false });
    o.scale.copy(pose.s);
    o.visible = true;
    const holder = new THREE.Group();
    o.position.set(0, 0, 0);
    o.quaternion.identity();
    holder.add(o);
    this.root.add(holder);
    this.spawned.push({ body, obj: holder });
    if (this.spawned.length > 25) {
      const old = this.spawned.shift()!;
      this.world.removeBody(old.body);
      this.root.remove(old.obj);
      disposeTree(old.obj);
    }
    sfx.pop();
  }

  /** caiu / encostou num perigo: evento "ao morrer", vidas, volta ao checkpoint */
  private die(): void {
    this.respawn();
    for (const inst of this.insts) inst.vm?.emit('die');
    if (this.lives > 0) {
      this.lives--;
      this.updateChip();
      if (this.lives === 0) this.lose();
    }
  }

  private lose(): void {
    if (this.lost || this.won) return;
    this.lost = true;
    sfx.bump();
    bigMoment(t('studio.play.lose', 'Fim de jogo!'), { icon: 'warning', sub: t('studio.play.again', 'Tentando de novo…') });
    setTimeout(() => !this.disposed && this.restart(), 2200);
  }

  /** recomeça a partida (bloco "iniciar partida" ou depois de perder) */
  private restart(): void {
    this.lost = false;
    this.won = false;
    this.score = 0;
    this.time = 0;
    this.lives = this.livesStart;
    this.checkpoint = null;
    this.respawn(true);
    this.updateChip();
  }

  private vmHost(inst: Inst): VmHost {
    const S = this;
    const cl = (pid: number) => inst.clusterOf.get(pid);
    const D = Math.PI / 180;
    return {
      move(pid, d, tt) {
        const c = cl(pid);
        if (!c || c.kind !== 'kinematic') return;
        const p = new THREE.Vector3(c.body.position.x, c.body.position.y, c.body.position.z);
        const q = q3(c.body.quaternion);
        const off = new THREE.Vector3(...d).applyMatrix4(new THREE.Matrix4().extractRotation(inst.m));
        c.anim = { t: 0, dur: Math.max(1 / 60, tt), fp: p, fq: q, tp: p.clone().add(off), tq: q.clone() };
      },
      rotate(pid, r, tt) {
        const c = cl(pid);
        if (!c || c.kind !== 'kinematic') return;
        const p = new THREE.Vector3(c.body.position.x, c.body.position.y, c.body.position.z);
        const q = q3(c.body.quaternion);
        const rq = new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0] * D, r[1] * D, r[2] * D));
        c.anim = { t: 0, dur: Math.max(1 / 60, tt), fp: p, fq: q, tp: p.clone(), tq: rq.multiply(q) };
      },
      teleport: (pid) => S.doAction(inst, { k: 'teleport', part: pid }),
      spawn: (pid) => S.spawnCopy(inst, pid),
      destroy(pid) {
        if (inst.gone.has(pid)) return;
        inst.gone.add(pid);
        const c = cl(pid);
        if (c) {
          S.world.removeBody(c.body);
          c.obj.visible = false;
        }
        const m = inst.meshes.get(pid);
        if (m) m.visible = false;
        const b = inst.sbodies.get(pid);
        if (b) S.world.removeBody(b);
        sfx.poof();
      },
      sound: (snd) => SND[(snd as SoundId) in SND ? (snd as SoundId) : 'ding'](),
      say(text) {
        const f = filterMessage(text);
        if (f.ok) notify(f.text, { icon: 'megaphone', key: 'say' + text });
      },
      score(n) {
        S.score += n;
        S.updateChip();
      },
      color(pid, c) {
        const part = inst.c.parts.find((x) => x.id === pid);
        const m = inst.meshes.get(pid);
        if (!part || !m) return;
        const k = (inst.c.materials[part.m ?? 0] ?? inst.c.materials[0]).k;
        m.traverse((x) => {
          const mm = x as THREE.Mesh;
          if (mm.isMesh) mm.material = materialFor({ c, k });
        });
      },
      force(pid, d) {
        const c = cl(pid);
        if (!c || c.kind !== 'dynamic') return;
        const v = new THREE.Vector3(...d).multiplyScalar(c.body.mass);
        c.body.wakeUp();
        c.body.applyImpulse(new S.C.Vec3(v.x, v.y, v.z));
      },
      door: (pid) => S.doAction(inst, { k: 'door', part: pid }),
      light: (pid) => S.setLight(inst, pid, !inst.lit.get(pid)),
      motor: (j) => S.doAction(inst, { k: 'motor', joint: j }),
      checkpoint(pid) {
        const pose = pid != null ? inst.pose.get(pid) : null;
        if (pose) S.checkpoint = pose.p.clone().add(new THREE.Vector3(0, Math.abs(pose.s.y) / 2 + 0.6, 0));
        else S.checkpoint = new THREE.Vector3(S.me.position.x, S.me.position.y + 0.2, S.me.position.z);
        notify(t('studio.play.checkpoint', 'Checkpoint!'), { icon: 'check', kind: 'good', key: 'cp' });
      },
      team(tm) {
        S.team = tm;
      },
      lives(n) {
        S.lives = S.livesStart = Math.max(0, Math.round(n));
        S.updateChip();
      },
      match(on) {
        if (on === 'win') S.win();
        else if (on === 'lose') S.lose();
        else S.restart();
      },
      read(q) {
        return q === 'score' ? S.score : q === 'time' ? S.time : q === 'lives' ? S.lives : q === 'team' ? S.team : 1;
      },
    };
  }

  private win(): void {
    if (this.won) return;
    this.won = true;
    sfx.fix();
    sfx.sparkle();
    tap('heavy');
    bigMoment(t('studio.play.win', 'Chegou!'), { icon: 'trophy', sub: this.timeStr() });
    this.h.onWin?.(this.time, this.score);
    void this.lost;
  }

  private timeStr(): string {
    const s = Math.floor(this.time);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  private updateChip(): void {
    const parts: string[] = [];
    if (this.hasGoal || this.insts.some((i) => i.vm)) parts.push('⏱ ' + this.timeStr());
    if (this.score) parts.push('★ ' + this.score);
    if (this.lives >= 0) parts.push('♥ ' + this.lives);
    this.chip.hidden = !parts.length;
    this.chip.textContent = parts.join('   ');
  }

  /* --------------------------------- jogador --------------------------------- */

  private findSpawn(): void {
    for (const inst of this.insts) {
      const sp = inst.c.parts.find((p) => p.role === 'spawn');
      if (sp) {
        const pose = inst.pose.get(sp.id)!;
        this.spawn.set(pose.p.x, pose.p.y + Math.abs(pose.s.y) / 2 + 0.6, pose.p.z);
        this.spawnYaw = new THREE.Euler().setFromQuaternion(pose.q, 'YXZ').y;
        return;
      }
    }
    // sem ponto de início: na frente da criação
    const b = new THREE.Box3();
    for (const inst of this.insts) for (const p of inst.pose.values()) b.expandByPoint(p.p);
    if (b.isEmpty()) b.set(new THREE.Vector3(), new THREE.Vector3());
    const z = b.max.z + 3.5;
    const x = (b.min.x + b.max.x) / 2;
    const gh = this.h.world.heightAt(x, z);
    this.spawn.set(x, (Number.isFinite(gh) ? gh : 0) + 1.2, z);
    this.spawnYaw = 0;
  }

  private respawn(first = false): void {
    if (this.driving) this.leave();
    const p = this.checkpoint ?? this.spawn;
    this.me.position.set(p.x, p.y, p.z);
    this.me.velocity.set(0, 0, 0);
    if (first) {
      this.yaw = this.spawnYaw;
      this.faceYaw = this.spawnYaw;
    } else {
      sfx.poof();
      tap('medium');
    }
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.code === 'Space') this.jumpWant = true;
    if (e.code === 'KeyE') this.act?.();
    this.keys.add(e.code);
  };
  private onKeyUp = (e: KeyboardEvent) => void this.keys.delete(e.code);
  private keys = new Set<string>();

  /** toque direto num botão 3D */
  private onTapCanvas = (e: PointerEvent) => {
    if (!this.buttons.length) return;
    const r = this.h.canvas.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.h.camera);
    const objs = this.buttons.map((b) => b.inst.meshes.get(b.part.id)).filter((x): x is THREE.Object3D => !!x);
    const hit = ray.intersectObjects(objs, true)[0];
    if (!hit || hit.distance > 9) return;
    const btn = this.buttons.find((b) => {
      let o: THREE.Object3D | null = hit.object;
      const m = b.inst.meshes.get(b.part.id);
      while (o) {
        if (o === m) return true;
        o = o.parent;
      }
      return false;
    });
    if (btn) this.press(btn);
  };

  private press(b: Trig): void {
    if (this.pressCd > 0) return;
    this.pressCd = 0.35;
    const m = b.inst.meshes.get(b.part.id);
    if (m) {
      const s = m.scale.y;
      m.scale.y = s * 0.55;
      setTimeout(() => (m.scale.y = s), 180);
    }
    sfx.click();
    tap('light');
    for (const r of b.inst.rules) if (r.on.k === 'button' && r.on.part === b.part.id) this.run(b.inst, r);
    b.inst.vm?.emit('button', b.part.id);
  }

  /* --------------------------------- quadro --------------------------------- */

  update(dt: number): void {
    if (this.disposed) return;
    dt = Math.min(dt, 0.05);
    if (!this.won) this.time += dt;
    this.pressCd -= dt;
    const [lx, ly] = this.look.consume(dt);
    this.yaw -= lx;
    this.pitch = THREE.MathUtils.clamp(this.pitch + ly, -0.5, 1.2);
    const js = this.joy.read();
    let jx = js.x;
    let jy = -js.y;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) jy = 1;
    if (k.has('KeyS') || k.has('ArrowDown')) jy = -1;
    if (k.has('KeyA') || k.has('ArrowLeft')) jx = -1;
    if (k.has('KeyD') || k.has('ArrowRight')) jx = 1;

    // portas e trilhos (cinemáticos)
    for (const cl of this.clusters) {
      const a = cl.anim;
      if (!a) continue;
      a.t = Math.min(a.dur, a.t + dt);
      const u = a.t / a.dur;
      const e = u * u * (3 - 2 * u);
      const p = a.fp.clone().lerp(a.tp, e);
      const q = a.fq.clone().slerp(a.tq, e);
      const b = cl.body;
      b.velocity.set((p.x - b.position.x) / dt, (p.y - b.position.y) / dt, (p.z - b.position.z) / dt);
      b.position.set(p.x, p.y, p.z);
      b.quaternion.set(q.x, q.y, q.z, q.w);
      if (a.t >= a.dur) {
        cl.anim = undefined;
        b.velocity.set(0, 0, 0);
      }
    }
    this.stepJoints(dt);

    if (this.driving) this.drive(this.driving, dt, jx, jy);
    else this.walk(dt, jx, jy);

    this.world.step(1 / 60, dt, 4);
    this.detectGround();

    // sincroniza malhas
    for (const cl of this.clusters) {
      if (cl.kind === 'dynamic' && cl.body.sleepState === 2 && !cl.anim) continue;
      cl.obj.position.set(cl.body.position.x, cl.body.position.y, cl.body.position.z);
      cl.obj.quaternion.set(cl.body.quaternion.x, cl.body.quaternion.y, cl.body.quaternion.z, cl.body.quaternion.w);
    }
    for (const v of this.vehicles) {
      if (!v.rv) continue;
      for (const w of v.wheels) {
        v.rv.updateWheelTransform(w.idx);
        const tr = v.rv.wheelInfos[w.idx].worldTransform;
        w.obj.position.set(tr.position.x, tr.position.y, tr.position.z);
        w.obj.quaternion.set(tr.quaternion.x, tr.quaternion.y, tr.quaternion.z, tr.quaternion.w);
      }
    }
    for (const s of this.spawned) {
      s.obj.position.set(s.body.position.x, s.body.position.y, s.body.position.z);
      s.obj.quaternion.set(s.body.quaternion.x, s.body.quaternion.y, s.body.quaternion.z, s.body.quaternion.w);
    }

    const focus = this.focus();
    this.streamGround(focus, dt);
    this.h.world.update(focus);
    this.triggers(dt, focus);
    this.camera(dt, focus);
    if ((this.hasGoal || this.insts[0]?.vm) && !this.won) this.updateChip();
  }

  private focus(): THREE.Vector3 {
    if (this.driving) {
      const p = this.driving.cl.body.position;
      return new THREE.Vector3(p.x, p.y, p.z);
    }
    return new THREE.Vector3(this.me.position.x, this.me.position.y, this.me.position.z);
  }

  private walk(dt: number, jx: number, jy: number): void {
    const me = this.me;
    const f = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const r = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const want = f.multiplyScalar(jy).addScaledVector(r, jx);
    const mag = Math.min(1, want.length());
    const sp = 5.6;
    const tx = want.x * sp + this.groundVel.x;
    const tz = want.z * sp + this.groundVel.z;
    const acc = this.grounded ? 14 : 5;
    const k = 1 - Math.exp(-acc * dt);
    me.velocity.x += (tx - me.velocity.x) * k;
    me.velocity.z += (tz - me.velocity.z) * k;
    if (this.jumpWant) {
      if (this.grounded) {
        me.velocity.y = 6.1;
        this.grounded = false;
        sfx.boing();
      }
      this.jumpWant = false;
    }
    if (mag > 0.1) {
      const target = Math.atan2(-want.x, -want.z);
      let d = target - this.faceYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.faceYaw += d * (1 - Math.exp(-12 * dt));
    }
    this.avatar.root.position.set(me.position.x, me.position.y, me.position.z);
    this.avatar.root.rotation.y = this.faceYaw;
    const hs = Math.hypot(me.velocity.x - this.groundVel.x, me.velocity.z - this.groundVel.z);
    this.avatar.animate(dt, hs, !this.grounded, false);
    // caiu do mundo
    const gh = this.h.world.heightAt(me.position.x, me.position.z);
    if (me.position.y < (Number.isFinite(gh) ? gh - 25 : -25)) this.die();
  }

  private detectGround(): void {
    this.grounded = false;
    this.groundVel.set(0, 0, 0);
    if (this.driving) return;
    for (const c of this.world.contacts) {
      let ny = 0;
      let other: CANNON.Body | null = null;
      if (c.bi === this.me) {
        ny = -c.ni.y;
        other = c.bj;
      } else if (c.bj === this.me) {
        ny = c.ni.y;
        other = c.bi;
      } else continue;
      if (ny > 0.5) {
        this.grounded = true;
        if (other && other.type === this.C.Body.KINEMATIC) this.groundVel.set(other.velocity.x, 0, other.velocity.z);
      }
    }
  }

  private triggers(dt: number, focus: THREE.Vector3): void {
    const pos = focus;
    const near = (b: THREE.Box3, pad: number) => b.distanceToPoint(pos) < pad;
    if (!this.driving) {
      for (const h of this.hazards)
        if (near(h.box, 0.5) && !h.inst.gone.has(h.part.id)) {
          this.die();
          notify(t('studio.play.ouch', 'Ops! De volta ao checkpoint'), { icon: 'warning', kind: 'warn', key: 'ouch' });
          break;
        }
      for (const c of this.checkpoints) {
        if (!near(c.box, 0.6)) continue;
        const p = c.box.getCenter(new THREE.Vector3());
        p.y = c.box.max.y + 0.6;
        if (!this.checkpoint || this.checkpoint.distanceTo(p) > 0.5) {
          this.checkpoint = p;
          sfx.catch();
          notify(t('studio.play.checkpoint', 'Checkpoint!'), { icon: 'check', kind: 'good', key: 'cp' });
        }
      }
    }
    for (const g of this.goals) if (near(g.box, 0.6)) this.win();
    // coletáveis e "ao tocar"
    for (const c of this.collects) {
      if (c.inst.gone.has(c.part.id) || !near(c.box, 0.7)) continue;
      c.inst.gone.add(c.part.id);
      const m = c.inst.meshes.get(c.part.id);
      if (m) m.visible = false;
      sfx.pop();
      tap('light');
      for (const inst of this.insts) inst.vm?.emit('collect', c.part.id);
    }
    for (const tc of this.touches) {
      const on = !tc.inst.gone.has(tc.part.id) && near(tc.box, 0.65);
      const was = tc.inst.touchIn.has(tc.part.id);
      if (on && !was) {
        tc.inst.touchIn.add(tc.part.id);
        tc.inst.vm?.emit('touch', tc.part.id);
      } else if (!on && was) tc.inst.touchIn.delete(tc.part.id);
    }
    for (const inst of this.insts) inst.vm?.update(dt);
    // zonas (entrar)
    for (const z of this.zones) {
      const inside = z.box.containsPoint(pos);
      const was = z.inst.inside.has(z.part.id);
      if (inside && !was) {
        z.inst.inside.add(z.part.id);
        for (const r of z.inst.rules) if (r.on.k === 'zone' && r.on.part === z.part.id) this.run(z.inst, r);
        z.inst.vm?.emit('zone', z.part.id);
      } else if (!inside && was) z.inst.inside.delete(z.part.id);
    }
    // timers
    for (const inst of this.insts)
      for (const tm of inst.timers) {
        tm.next -= dt;
        if (tm.next <= 0) {
          tm.next += tm.rule.on.sec ?? 3;
          this.run(inst, tm.rule);
        }
      }
    // botão de ação contextual
    let act: (() => void) | null = null;
    let label = '';
    if (this.driving) {
      act = () => this.leave();
      label = t('studio.play.exitCar', 'Sair');
    } else {
      let best = 2.6;
      for (const v of this.vehicles) {
        const b = v.cl.body;
        const sp = v.seatLocal.clone().applyQuaternion(q3(b.quaternion)).add(new THREE.Vector3(b.position.x, b.position.y, b.position.z));
        const d = sp.distanceTo(pos);
        if (d < best + v.size * 0.15) {
          best = d;
          act = () => this.enter(v);
          label = t('studio.play.drive', 'Dirigir');
        }
      }
      for (const b of this.buttons)
        if (b.box.distanceToPoint(pos) < 1.8) {
          act = () => this.press(b);
          label = t('studio.play.press', 'Apertar');
        }
    }
    this.act = act;
    this.actBtn.hidden = !act;
    if (act && this.actBtn.textContent !== label) this.actBtn.textContent = label;
  }

  private camera(dt: number, focus: THREE.Vector3): void {
    const cam = this.h.camera;
    let dist = 4.6;
    let tgt = focus.clone().add(new THREE.Vector3(0, 0.9, 0));
    if (this.driving) {
      const v = this.driving;
      dist = 5 + v.size * 0.55;
      tgt = focus.clone().add(new THREE.Vector3(0, 1 + v.size * 0.08, 0));
      // atrás do veículo, com o olhar livre por cima
      const q = q3(v.cl.body.quaternion);
      const fw = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
      const vy = Math.atan2(-fw.x, -fw.z);
      const d = Math.atan2(Math.sin(vy - this.yaw), Math.cos(vy - this.yaw));
      if (v.cl.body.velocity.length() > 2) this.yaw += d * (1 - Math.exp(-2.5 * dt));
    }
    const cp = Math.cos(this.pitch);
    const want = new THREE.Vector3(tgt.x + Math.sin(this.yaw) * cp * dist, tgt.y + Math.sin(this.pitch) * dist, tgt.z + Math.cos(this.yaw) * cp * dist);
    const gh = this.h.world.heightAt(want.x, want.z);
    if (Number.isFinite(gh) && want.y < gh + 0.5) want.y = gh + 0.5;
    if (this.camPos.lengthSq() === 0) this.camPos.copy(want);
    this.camPos.lerp(want, 1 - Math.exp(-14 * dt));
    cam.position.copy(this.camPos);
    cam.lookAt(tgt);
  }

  dispose(): void {
    this.disposed = true;
    this.h.layer.removeEventListener('pointerup', this.onTapCanvas);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
    for (const b of this.btns) b.destroy();
    this.joy.destroy();
    this.look.destroy();
    this.hud.remove();
    this.avatar.dispose();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.userData.ownGeo) m.geometry.dispose();
      if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
    });
    this.h.scene.remove(this.root);
    for (const v of this.vehicles) v.rv?.removeFromWorld(this.world);
    while (this.world.bodies.length) this.world.removeBody(this.world.bodies[0]);
  }

  /** para testes automatizados (?debug) */
  debug(): Record<string, unknown> {
    const f = this.focus();
    return { vars: Object.fromEntries(this.insts[0]?.vm?.vars ?? []), lives: this.lives, gone: [...(this.insts[0]?.gone ?? [])], pos: [f.x, f.y, f.z], driving: !!this.driving, vehicles: this.vehicles.length, won: this.won, score: this.score, bodies: this.world.bodies.length, grounded: this.grounded, act: this.actBtn.hidden ? '' : this.actBtn.textContent };
  }
  /** testes: entra no veículo mais perto / aperta o botão mais perto / teletransporta */
  debugAct(): void {
    this.act?.();
  }
  debugTeleport(x: number, y: number, z: number): void {
    if (this.driving) this.leave();
    this.me.position.set(x, y, z);
    this.me.velocity.set(0, 0, 0);
  }
  /** testes: avança a simulação `sec` segundos em passos de 1/60 (sem esperar quadros) */
  debugAdvance(sec: number): void {
    for (let i = 0; i < Math.round(sec * 60); i++) this.update(1 / 60);
  }
  /** testes: força o joystick (x, y frente+) por alguns quadros */
  debugKeys(codes: string[]): void {
    this.keys = new Set(codes);
  }
}

function q3(q: CANNON.Quaternion): THREE.Quaternion {
  return new THREE.Quaternion(q.x, q.y, q.z, q.w);
}

export function vec(v: Vec3): THREE.Vector3 {
  return new THREE.Vector3(v[0], v[1], v[2]);
}
