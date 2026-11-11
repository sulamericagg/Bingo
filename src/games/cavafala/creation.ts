/* ============================================================
 *  CAVA & FALA — CRIAÇÕES (objeto falado) no mundo.
 *  ObjSpec → blocos (voxel.ts) → InstancedMesh por material, com
 *  grupos articulados (rodas, asas, hélices, molas). Monta com os
 *  blocos voando das costas do Bloop e encaixando. Física de corpo
 *  composto (cbody.ts) e comportamentos da lista branca: rola, anda,
 *  voa, flutua, quica, pula, atira coisas moles, sopra, cava, gruda,
 *  cresce, brilha, segue, dá pra montar, faz som.
 * ============================================================ */
import * as THREE from 'three';
import { sfx } from '../../3d/common/sfx';
import type { ObjBehavior, ObjSpec, V3 } from '../../../shared/cavaspec';
import type { Fn } from '../../../shared/cavagen';
import { makeCBody, stepCBody, type CBody } from './cbody';
import type { Fx } from './fx';
import { OBox, type PhysWorld } from './phys';
import type { Terrain } from './terrain';
import { voxelize, type Cell, type Voxels } from './voxel';
import type { Actor, WorldNet } from './world';

/** o que a criação precisa do motor (World implementa) */
export interface CHost {
  readonly scene: THREE.Scene;
  readonly phys: PhysWorld;
  readonly fx: Fx;
  readonly T: Terrain;
  readonly actors: Actor[];
  readonly me: Actor;
  readonly time: number;
  readonly arena: boolean;
  readonly net: WorldNet | null;
  isNear(x: number, y: number, z: number): boolean;
  shootSoft(owner: Actor, o: THREE.Vector3, d: THREE.Vector3, kind: string, power: number): void;
  knock(a: Actor, dx: number, dy: number, dz: number, power: number, by: Actor | null): void;
  nearestFoe(me: Actor, at: THREE.Vector3, R: number): Actor | null;
  takeLight(): boolean;
  freeLight(): void;
  backpackOf(a: Actor, out: THREE.Vector3): THREE.Vector3;
  digAt(owner: Actor, x: number, y: number, z: number, r: number): void;
  refreshBoxes(): void;
}

const TAU = Math.PI * 2;
const D2R = Math.PI / 180;
const V1 = new THREE.Vector3();
const V2 = new THREE.Vector3();
const Q1 = new THREE.Quaternion();
const M1 = new THREE.Matrix4();
const S1 = new THREE.Vector3();
const COL = new THREE.Color();

/* ------------------------------ materiais compartilhados ------------------------------ */
let MATS: { solid: THREE.Material; glow: THREE.Material; clear: THREE.Material } | null = null;
function mats() {
  if (!MATS)
    MATS = {
      solid: new THREE.MeshLambertMaterial({ color: '#ffffff' }),
      glow: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
      clear: new THREE.MeshLambertMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false }),
    };
  return MATS;
}
const geoCache = new Map<number, THREE.BoxGeometry>();
function blockGeo(v: number): THREE.BoxGeometry {
  const k = Math.round(v * 1000);
  let g = geoCache.get(k);
  if (!g) {
    g = new THREE.BoxGeometry(v * 0.94, v * 0.94, v * 0.94);
    geoCache.set(k, g);
  }
  return g;
}
export function disposeCreationCache(): void {
  geoCache.forEach((g) => g.dispose());
  geoCache.clear();
  if (MATS) for (const m of Object.values(MATS)) m.dispose();
  MATS = null;
}
const hash3 = (x: number, y: number, z: number) => {
  let h = Math.imul(Math.round(x * 97) ^ 0x9e3779b1, 0x85ebca6b) ^ Math.imul(Math.round(y * 89), 0xc2b2ae35) ^ Math.imul(Math.round(z * 83), 0x27d4eb2f);
  h ^= h >>> 15;
  return ((h >>> 0) % 1000) / 1000;
};

interface BlockMesh {
  im: THREE.InstancedMesh;
  cells: Cell[];
  /** de onde cada bloco sai voando (local do grupo) */
  from: Float32Array;
  delay: Float32Array;
}
interface JointObj {
  o: THREE.Object3D;
  j: NonNullable<VGroupJ>;
  radius: number;
  ang: number;
}
type VGroupJ = Voxels['groups'][number]['joint'];

/** monta os blocos em grupos (sem física) — também usado na miniatura da galeria */
export function buildBlocks(vx: Voxels): { tilt: THREE.Group; meshes: BlockMesh[]; joints: JointObj[] } {
  const tilt = new THREE.Group();
  const meshes: BlockMesh[] = [];
  const joints: JointObj[] = [];
  const geo = blockGeo(vx.v);
  const M = mats();
  for (const g of vx.groups) {
    const holder = new THREE.Object3D();
    holder.position.set(g.pivot[0], g.pivot[1], g.pivot[2]);
    tilt.add(holder);
    if (g.joint) joints.push({ o: holder, j: g.joint, radius: Math.max(0.1, g.radius), ang: 0 });
    const by: Record<'solid' | 'glow' | 'clear', Cell[]> = { solid: [], glow: [], clear: [] };
    for (const c of g.cells) by[c.mat === 'glow' ? 'glow' : c.mat === 'glass' || c.mat === 'jelly' ? 'clear' : 'solid'].push(c);
    for (const k of ['solid', 'glow', 'clear'] as const) {
      const cells = by[k];
      if (!cells.length) continue;
      const im = new THREE.InstancedMesh(geo, M[k], cells.length);
      im.castShadow = k === 'solid';
      im.receiveShadow = k === 'solid';
      cells.forEach((c, i) => {
        M1.makeTranslation(c.x, c.y, c.z);
        im.setMatrixAt(i, M1);
        // tom de cada bloco varia um tiquinho (cara de "feito de blocos")
        const j = hash3(c.x + g.pivot[0], c.y + g.pivot[1], c.z + g.pivot[2]);
        const wood = c.mat === 'wood' ? (Math.floor((c.y + g.pivot[1]) / vx.v) % 2 ? -0.08 : 0.04) : 0;
        const metal = c.mat === 'metal' ? 0.08 : 0;
        COL.setHex(c.col).multiplyScalar(0.93 + j * 0.12 + wood + metal);
        im.setColorAt(i, COL);
      });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.frustumCulled = false;
      holder.add(im);
      meshes.push({ im, cells, from: new Float32Array(cells.length * 3), delay: new Float32Array(cells.length) });
    }
  }
  return { tilt, meshes, joints };
}

export interface CreationOpts {
  uid: string;
  spec: ObjSpec;
  owner: Actor | null;
  pos: THREE.Vector3;
  /** para onde a FRENTE (+z do objeto) aponta (yaw do mundo) */
  yaw: number;
  animate: boolean;
  fn?: Fn;
  /** frase que a criou (galeria/rede) */
  text: string;
  variant: number;
  /** montar a partir de onde? (backpack do dono; null = do próprio centro, "pop") */
  from?: THREE.Vector3 | null;
}

export class Creation {
  readonly uid: string;
  spec: ObjSpec;
  vx: Voxels;
  owner: Actor | null;
  readonly root = new THREE.Group();
  tilt!: THREE.Group;
  meshes: BlockMesh[] = [];
  joints: JointObj[] = [];
  body: CBody | null = null;
  cols: { box: OBox; lx: number; ly: number; lz: number; yaw: number }[] = [];
  fixed: boolean;
  fn?: Fn;
  text: string;
  variant: number;
  age = 0;
  assembling = 0;
  asmDur = 0;
  dead = false;
  /** 0..1 some ("poof") */
  vanish = 0;
  life: number;
  grow = 1;
  light: THREE.PointLight | null = null;
  rider: Actor | null = null;
  /** material gasto (blocos) */
  cost = 0;
  /** tempos dos comportamentos */
  private tShoot = 1;
  private tJump = 1.5;
  private tDig = 1;
  private tSound = 3;
  private tTurn = 2;
  private rnd: () => number;
  private wanderYaw = 0;
  private distWheel = 0;
  readonly beh: Map<string, ObjBehavior>;
  /** controle quando alguém monta (vem do jogador) */
  drive = new THREE.Vector3();
  driveUp = 0;

  constructor(
    private h: CHost,
    o: CreationOpts,
  ) {
    this.uid = o.uid;
    this.spec = o.spec;
    this.owner = o.owner;
    this.text = o.text;
    this.variant = o.variant;
    this.fn = o.fn;
    this.fixed = o.spec.body === 'static';
    this.beh = new Map(o.spec.behaviors.map((b) => [b.type, b]));
    this.life = h.arena ? 30 : Infinity;
    let s = 0;
    for (const ch of o.uid) s = (Math.imul(s, 31) + ch.charCodeAt(0)) | 0;
    let a = s >>> 0;
    this.rnd = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    this.vx = voxelize(o.spec);
    this.root.position.copy(o.pos);
    this.root.rotation.y = o.yaw;
    this.wanderYaw = o.yaw;
    h.scene.add(this.root);
    this.mount(o.animate, o.from ?? null);
    if (!this.fixed) {
      this.body = makeCBody(this.vx, o.pos, o.yaw);
      this.setupBody();
    }
    this.makeCols();
    if (this.beh.has('glows') && h.takeLight()) {
      this.light = new THREE.PointLight('#ffe6a0', 14, 12, 1.6);
      this.light.position.set(0, (this.vx.max[1] - this.vx.min[1]) * 0.7, 0);
      this.root.add(this.light);
    }
  }

  /** constrói/reconstrói os blocos (Refazer / IA melhorou) */
  private mount(animate: boolean, from: THREE.Vector3 | null): void {
    const b = buildBlocks(this.vx);
    this.tilt = b.tilt;
    this.meshes = b.meshes;
    this.joints = b.joints;
    this.root.add(this.tilt);
    this.root.updateMatrixWorld(true);
    if (!animate) return;
    // de onde os blocos vêm: costas do dono (ou o próprio centro: "pop")
    const src = from ? this.root.worldToLocal(from.clone()) : new THREE.Vector3(0, (this.vx.max[1] - this.vx.min[1]) * 0.5, 0);
    let lo = Infinity,
      hi = -Infinity;
    for (const m of this.meshes) for (const c of m.cells) (lo = Math.min(lo, c.ord)), (hi = Math.max(hi, c.ord));
    const n = this.vx.shown;
    const D = Math.min(1.5, 0.35 + n * 0.0005);
    for (const m of this.meshes) {
      const holder = m.im.parent!;
      m.cells.forEach((c, i) => {
        const j = hash3(c.x * 3.1, c.y * 1.7, c.z * 2.3);
        // ponto de saída no espaço do grupo
        V1.copy(src).sub(holder.position);
        m.from[i * 3] = V1.x + (j - 0.5) * 0.5;
        m.from[i * 3 + 1] = V1.y + (hash3(c.z, c.x, c.y) - 0.5) * 0.5;
        m.from[i * 3 + 2] = V1.z + (hash3(c.y, c.z, c.x) - 0.5) * 0.5;
        m.delay[i] = ((c.ord - lo) / Math.max(1e-3, hi - lo)) * D + j * 0.08;
      });
    }
    this.asmDur = D + 0.45;
    this.assembling = 0.0001;
    this.applyAssembly(0);
  }

  private applyAssembly(t: number): void {
    for (const m of this.meshes) {
      const { im, cells, from, delay } = m;
      for (let i = 0; i < cells.length; i++) {
        const k = Math.max(0, Math.min(1, (t - delay[i]) / 0.38));
        const c = cells[i];
        if (k <= 0) {
          M1.makeScale(0.001, 0.001, 0.001);
          im.setMatrixAt(i, M1);
          continue;
        }
        const e = 1 - Math.pow(1 - k, 3);
        V2.set(from[i * 3] + (c.x - from[i * 3]) * e, from[i * 3 + 1] + (c.y - from[i * 3 + 1]) * e + Math.sin(k * Math.PI) * 1.1, from[i * 3 + 2] + (c.z - from[i * 3 + 2]) * e);
        const s = k < 1 ? 0.35 + 0.65 * e + Math.sin(k * Math.PI) * 0.3 : 1;
        Q1.setFromAxisAngle(V1.set(0.3, 1, 0.2).normalize(), (1 - e) * 6);
        M1.compose(V2, Q1, S1.set(s, s, s));
        im.setMatrixAt(i, M1);
      }
      im.instanceMatrix.needsUpdate = true;
    }
  }

  /** troca o objeto (IA chegou / Refazer) mantendo posição; monta "pop" */
  replace(spec: ObjSpec, fn: Fn | undefined, variant: number, from: THREE.Vector3 | null): void {
    this.clearMeshes();
    this.spec = spec;
    this.fn = fn;
    this.variant = variant;
    this.fixed = spec.body === 'static';
    (this.beh as Map<string, ObjBehavior>).clear();
    for (const b of spec.behaviors) this.beh.set(b.type, b);
    this.vx = voxelize(spec);
    this.mount(true, from);
    const pos = this.body ? this.body.p.clone() : this.root.position.clone();
    const yaw = this.body ? this.body.yaw : this.root.rotation.y;
    if (this.fixed) this.body = null;
    else {
      this.body = makeCBody(this.vx, pos, yaw);
      this.setupBody();
    }
    this.removeCols();
    this.makeCols();
  }

  private setupBody(): void {
    const b = this.body!;
    b.buoy = this.beh.has('floats') || this.beh.has('flies');
    b.bounce = this.beh.has('bounces') ? 0.55 + (this.beh.get('bounces')!.power ?? 0.5) * 0.3 : 0;
  }

  /* ------------------------------ colisores (para os Bloops pisarem) ------------------------------ */
  private makeCols(): void {
    const parts = this.spec.parts
      .map((p, i) => ({ p, i, vol: p.size[0] * p.size[1] * p.size[2] }))
      .filter((x) => Math.max(...x.p.size) >= 0.35 && !x.p.joint)
      .sort((a, b) => b.vol - a.vol)
      .slice(0, this.fixed ? 22 : 6);
    const bounce = this.beh.has('bounces') || this.fn === 'trampoline';
    for (const { p } of parts) {
      let [sx, sy, sz] = p.size;
      let pitch = 0,
        yaw = 0;
      const r = p.rot.map((v) => ((v % 360) + 360) % 360);
      const q90 = (v: number) => Math.round(v / 90) % 2 === 1 && Math.abs(v % 90) < 8;
      if (q90(r[0])) [sy, sz] = [sz, sy];
      else if (Math.abs(((r[0] + 180) % 360) - 180) > 5) pitch = p.rot[0] * D2R;
      if (q90(r[2])) [sx, sy] = [sy, sx];
      if (q90(r[1])) [sx, sz] = [sz, sx];
      else if (Math.abs(((r[1] + 180) % 360) - 180) > 5 && Math.abs(r[1] - 180) > 5) yaw = p.rot[1] * D2R;
      let hy = sy / 2;
      if (p.shape === 'wedge') {
        // rampa: tábua inclinada no lugar da cunha (alta atrás)
        pitch = Math.atan2(sy, sz);
        sz = Math.hypot(sy, sz);
        hy = 0.12;
      }
      if (p.shape === 'sphere' || p.shape === 'cylinder' || p.shape === 'capsule') (sx *= 0.85), (sz *= 0.85);
      if (p.shape === 'torus' && !q90(r[0]) && !q90(r[2])) hy = Math.min(hy, 0.15);
      const box = new OBox(0, 0, 0, sx / 2, hy, sz / 2, 0, pitch);
      box.owner = this;
      if (bounce && p.pos[1] + sy / 2 > (this.vx.max[1] - this.vx.min[1]) * 0.4) (box.tag = 'bounce'), (box.power = 0.8);
      if (this.fn === 'slide' && pitch) box.tag = 'slide';
      this.cols.push({ box, lx: p.pos[0], ly: p.pos[1], lz: p.pos[2], yaw });
      this.body?.own.add(box);
    }
    this.placeCols();
    this.h.refreshBoxes();
  }
  private removeCols(): void {
    for (const c of this.cols) c.box.active = false;
    this.cols = [];
  }
  private placeCols(): void {
    const g = this.grow;
    const p = this.body ? this.body.p : this.root.position;
    const yaw = this.body ? this.body.yaw : this.root.rotation.y;
    const cy = Math.cos(yaw),
      sy = Math.sin(yaw);
    for (const c of this.cols) {
      const b = c.box;
      b.x = p.x + (c.lx * cy + c.lz * sy) * g;
      b.y = p.y + c.ly * g;
      b.z = p.z + (-c.lx * sy + c.lz * cy) * g;
      b.yaw = yaw + c.yaw;
      b.update();
    }
  }

  /* ------------------------------ simulação ------------------------------ */
  update(dt: number): void {
    const h = this.h;
    this.age += dt;
    // montagem
    if (this.assembling > 0) {
      this.assembling += dt;
      this.applyAssembly(this.assembling);
      if (this.assembling >= this.asmDur) {
        this.assembling = 0;
        this.applyAssembly(99);
        const p = this.root.position;
        h.fx.sparkle(p.x, p.y + (this.vx.max[1] - this.vx.min[1]) * 0.6, p.z, 22);
        if (h.isNear(p.x, p.y, p.z)) sfx.fix();
      }
    }
    if (this.vanish > 0) {
      this.vanish += dt * 3;
      this.root.scale.setScalar(Math.max(0.001, this.grow * (1 - this.vanish)));
      if (this.vanish >= 1) this.dead = true;
      return;
    }
    if (this.age > this.life) this.poof();
    const t = h.time;
    // juntas
    const b = this.body;
    const fwdSpeed = b ? b.v.x * Math.sin(b.yaw) + b.v.z * Math.cos(b.yaw) : 0;
    this.distWheel += fwdSpeed * dt;
    const moving = !!b && Math.hypot(b.v.x, b.v.z) > 0.3;
    for (const j of this.joints) {
      const J = j.j;
      const o = j.o;
      if (J.type === 'wheel') {
        o.rotation.set(0, 0, 0);
        o.rotation[J.axis] = this.distWheel / j.radius;
      } else if (J.type === 'spin') {
        const flying = this.beh.has('flies') && (!b || !b.onGround);
        j.ang += dt * J.speed * TAU * (flying || this.fixed || !this.beh.has('flies') ? 1 : 0.35);
        o.rotation[J.axis] = j.ang;
      } else if (J.type === 'hinge') {
        const k = J.axis === 'x' && !this.fixed && !this.beh.has('flies') ? (moving ? 1 : 0.15) : 1;
        o.rotation[J.axis] = Math.sin(t * J.speed * TAU * 0.5) * J.swing * D2R * k;
      } else if (J.type === 'spring') o.scale.y = 1 + Math.sin(t * J.speed * TAU) * Math.min(0.5, J.swing);
    }
    if (this.fixed || !b) {
      if (this.beh.has('shoots')) this.doShoot(dt);
      if (this.beh.has('pushes')) this.doWind(dt);
      if (this.beh.has('sound')) this.doSound(dt);
      this.doGrow(dt);
      return;
    }
    // comportamentos que mexem o corpo
    b.f.set(0, 0, 0);
    const flies = this.beh.get('flies');
    const fl = !!flies;
    b.grav = fl ? 0.05 : 1;
    let want = V1.set(0, 0, 0);
    let speed = 0;
    const walk = this.beh.get('walks') ?? this.beh.get('rolls') ?? this.beh.get('follows') ?? (fl ? flies : undefined) ?? (this.beh.has('floats') && b.inWater ? this.beh.get('floats') : undefined);
    if (walk) speed = (this.beh.has('rolls') ? 3 : 1.8) + (walk.power ?? 0.5) * (this.beh.has('rolls') ? 6 : 3.5);
    if (fl) speed = (flies!.kind === 'balloon' ? 2 : 4) + (flies!.power ?? 0.5) * 5;
    if (this.rider) {
      if (this.drive.lengthSq() > 0.01) want.copy(this.drive).multiplyScalar(Math.max(6, speed * 1.2));
    } else if (this.assembling === 0 && this.age > 0.4) {
      const own = this.owner;
      const follows = this.beh.has('follows');
      let target: THREE.Vector3 | null = null;
      if (h.arena && own && (this.spec.role === 'attack' || follows)) {
        const foe = h.nearestFoe(own, b.p, 22);
        if (foe) target = foe.body.p;
      }
      if (!target && follows && own && own.alive) {
        const d = own.body.p.distanceTo(b.p);
        if (d > 3.2) target = own.body.p;
      }
      if (target) {
        want.copy(target).sub(b.p).setY(0);
        if (want.lengthSq() > 0.01) want.normalize().multiplyScalar(speed);
      } else if (walk && !follows) {
        this.tTurn -= dt;
        if (this.tTurn <= 0 || b.hitV > 3) {
          this.tTurn = 2.5 + this.rnd() * 3.5;
          this.wanderYaw += (this.rnd() - 0.5) * 2.4 + (b.hitV > 3 ? Math.PI * 0.8 : 0);
        }
        want.set(Math.sin(this.wanderYaw), 0, Math.cos(this.wanderYaw)).multiplyScalar(speed * 0.7);
      }
    }
    const canDrive = b.onGround || fl || (b.inWater && b.buoy);
    if (canDrive && (walk || this.rider)) {
      const acc = this.rider ? 7 : 4;
      b.f.x += (want.x - b.v.x) * acc;
      b.f.z += (want.z - b.v.z) * acc;
      if (want.lengthSq() > 0.2) {
        const ty = Math.atan2(want.x, want.z);
        let d = ty - b.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        b.wy = d * 4;
      }
    }
    // voo: segura uma altura sobre o chão
    if (fl) {
      const gy = h.T.groundY(b.p.x, b.p.z, b.p.y + 2, b.p.y - 40);
      const base = gy > -Infinity ? gy : b.p.y - 3;
      const alt = this.rider ? b.p.y + this.driveUp * 3 : base + (h.arena ? 2.2 + (flies!.power ?? 0.5) * 1.5 : 2.5 + (flies!.power ?? 0.5) * 5);
      const tgt = this.rider ? alt : alt + Math.sin(t * 1.3 + this.age) * 0.35;
      b.f.y += (Math.max(tgt, base + 0.8) - b.p.y) * 3 - b.v.y * 2.2;
      if (this.rider && Math.abs(this.driveUp) < 0.1) b.f.y = -b.v.y * 2.5;
    }
    // pula sozinho / quica
    const jumps = this.beh.get('jumps');
    if (jumps && b.onGround && !this.rider) {
      this.tJump -= dt;
      if (this.tJump <= 0) {
        this.tJump = 1.3 + this.rnd() * 1.2;
        b.v.y = 5 + jumps.power * 5;
        if (h.isNear(b.p.x, b.p.y, b.p.z)) sfx.boing();
      }
    }
    const bo = this.beh.get('bounces');
    if (bo && b.onGround && b.v.y < 0.5 && !this.rider) {
      b.v.y = 3.5 + bo.power * 5;
      b.v.x += (this.rnd() - 0.5) * 1.5;
      b.v.z += (this.rnd() - 0.5) * 1.5;
      if (b.hitV > 2 && h.isNear(b.p.x, b.p.y, b.p.z)) sfx.boing();
    }
    // passo da física
    const before = V2.copy(b.p);
    const bx = before.x,
      by = before.y,
      bz = before.z;
    stepCBody(h.phys, b, dt);
    // leva junto quem está em cima (carrega)
    const dx = b.p.x - bx,
      dy = b.p.y - by,
      dz = b.p.z - bz;
    if (dx || dy || dz)
      for (const a of h.actors)
        if (!a.remote && a.body.groundBox && (a.body.groundBox.owner as unknown) === this && a !== this.rider) {
          a.body.p.x += dx;
          a.body.p.y += dy;
          a.body.p.z += dz;
        }
    // caiu do mundo
    if (b.p.y < h.T.oy - 8) this.poof();
    // desenho
    this.root.position.copy(b.p);
    this.root.rotation.y = b.yaw;
    const gn = b.gn;
    // inclina pela normal do chão (no corpo: só visual)
    const lx = gn.x * Math.cos(b.yaw) - gn.z * Math.sin(b.yaw);
    const lz = gn.x * Math.sin(b.yaw) + gn.z * Math.cos(b.yaw);
    const k = Math.min(1, dt * 6);
    this.tilt.rotation.x += (Math.atan2(lz, gn.y) * 0.8 - this.tilt.rotation.x) * k;
    this.tilt.rotation.z += (-Math.atan2(lx, gn.y) * 0.8 - this.tilt.rotation.z) * k;
    // bichinho anda "pulando" um tiquinho
    if (this.beh.has('walks') && moving && b.onGround) this.tilt.position.y = Math.abs(Math.sin(t * 9)) * 0.08;
    else this.tilt.position.y *= 0.8;
    this.placeCols();
    if (this.beh.has('shoots')) this.doShoot(dt);
    if (this.beh.has('pushes')) this.doWind(dt);
    if (this.beh.has('digs')) this.doDig(dt);
    if (this.beh.has('sticks')) this.doStick(dt);
    if (this.beh.has('sound')) this.doSound(dt);
    if (b.inWater && b.buoy && Math.random() < 0.08 && moving) h.fx.water(b.p.x, h.phys.waterY, b.p.z, 0, 0.3, 0);
    if (fl && flies!.kind === 'rocket' && Math.random() < 0.5) h.fx.dust(b.p.x, b.p.y, b.p.z, '#ffb35a', 2);
    this.doGrow(dt);
  }

  /** frente-alto do objeto (de onde saem as bolhas) */
  private muzzle(out: THREE.Vector3, dir: THREE.Vector3): void {
    const yaw = this.body ? this.body.yaw : this.root.rotation.y;
    const p = this.body ? this.body.p : this.root.position;
    // bocal = peça "prop" mais alta à frente, ou o topo da frente
    let mx = 0,
      my = (this.vx.max[1] - this.vx.min[1]) * 0.75,
      mz = this.vx.max[2];
    const noz = this.spec.parts.filter((q) => q.shape === 'cylinder' && Math.abs(q.rot[0] - 70) < 5);
    if (noz.length) [mx, my, mz] = [noz[0].pos[0], noz[0].pos[1] + noz[0].size[1] * 0.3, noz[0].pos[2] + noz[0].size[1] * 0.5];
    const g = this.grow;
    out.set(p.x + (mx * Math.cos(yaw) + mz * Math.sin(yaw)) * g, p.y + my * g, p.z + (-mx * Math.sin(yaw) + mz * Math.cos(yaw)) * g);
    dir.set(Math.sin(yaw), 0.12, Math.cos(yaw)).normalize();
  }
  private doShoot(dt: number): void {
    const s = this.beh.get('shoots')!;
    const h = this.h;
    const own = this.owner;
    if (!own || own.remote || this.assembling > 0) return;
    this.tShoot -= dt;
    if (this.tShoot > 0) return;
    this.tShoot = Math.max(h.arena ? 1.1 : 0.8, 2.4 - s.power * 1.6);
    const o = V1,
      d = V2;
    this.muzzle(o, d);
    if (h.arena) {
      const foe = h.nearestFoe(own, o, 20);
      if (!foe) return;
      d.copy(foe.body.p).add(new THREE.Vector3(0, 0.8, 0)).sub(o).normalize();
    } else if (o.distanceTo(h.me.body.p) > 30) return;
    if (this.rider) {
      // quem monta mira com a câmera (o jogo passa a direção em drive)
      if (this.drive.lengthSq() > 0.01) d.copy(this.drive).setY(0.1).normalize();
    }
    const kind = s.kind ?? 'bubbles';
    h.shootSoft(own, o.clone(), d.clone(), kind, (h.arena ? 0.55 : 0.8) * (0.5 + s.power * 0.6));
  }
  private doWind(dt: number): void {
    const s = this.beh.get('pushes')!;
    const h = this.h;
    const yaw = this.body ? this.body.yaw : this.root.rotation.y;
    const p = this.body ? this.body.p : this.root.position;
    const dir = V2.set(Math.sin(yaw), 0, Math.cos(yaw));
    const o = V1.copy(p).addScaledVector(dir, this.vx.max[2] * this.grow);
    const L = 9 * (0.6 + s.power * 0.8) * (h.arena ? 0.8 : 1);
    for (const a of h.actors) {
      if (!a.alive || a === this.owner || a.remote) continue;
      const rel = a.body.p.clone().sub(o);
      const along = rel.dot(dir);
      if (along < 0 || along > L) continue;
      if (rel.addScaledVector(dir, -along).length() > 2.2) continue;
      const f = 22 * (0.5 + s.power) * (1 - along / L) * (a.shieldT > 0 ? 0.3 : 1) * (h.arena ? 0.7 : 1);
      a.body.v.addScaledVector(dir, f * dt);
      a.body.v.y += f * 0.2 * dt;
    }
    if (Math.random() < 0.3) h.fx.parts.emit(o.x + (Math.random() - 0.5), o.y + 1 + (Math.random() - 0.5), o.z + (Math.random() - 0.5), dir.x * 8, 0.2, dir.z * 8, { tile: 2, color: '#ffffff', life: 0.6, size: 0.1, grow: 0.4 });
  }
  private doDig(dt: number): void {
    const b = this.body;
    const own = this.owner;
    if (!b || !own || own.remote) return;
    this.tDig -= dt;
    if (this.tDig > 0) return;
    this.tDig = 1.2;
    const s = this.beh.get('digs')!;
    const fx = b.p.x + Math.sin(b.yaw) * (this.vx.max[2] + 0.4),
      fz = b.p.z + Math.cos(b.yaw) * (this.vx.max[2] + 0.4);
    this.h.digAt(own, fx, b.p.y - 0.2, fz, 0.8 + s.power * 0.6);
  }
  private doStick(dt: number): void {
    const s = this.beh.get('sticks')!;
    const h = this.h;
    const p = this.body!.p;
    for (const a of h.actors) {
      if (!a.alive || a === this.owner || a.remote) continue;
      V1.copy(p).sub(a.body.p);
      const d = V1.length();
      if (d > 7 || d < 1.5) continue;
      a.body.v.addScaledVector(V1.normalize(), dt * (4 + s.power * 6) * (a.shieldT > 0 ? 0.2 : 1) * (h.arena ? 0.6 : 1));
    }
  }
  private doSound(dt: number): void {
    this.tSound -= dt;
    if (this.tSound > 0) return;
    this.tSound = 5 + this.rnd() * 4;
    const p = this.body ? this.body.p : this.root.position;
    if (!this.h.isNear(p.x, p.y, p.z) || p.distanceTo(this.h.me.body.p) > 14) return;
    const k = this.beh.get('sound')!.kind;
    const f: Record<string, () => void> = { honk: sfx.press, boing: sfx.boing, roar: sfx.bump, beep: sfx.knob, music: sfx.yay, splash: sfx.splash, moo: sfx.thud, meow: sfx.squeak, woof: sfx.kick, whoosh: sfx.whoosh, chirp: sfx.squeak, pop: sfx.pop };
    (f[k ?? 'pop'] ?? sfx.pop)();
  }
  private doGrow(dt: number): void {
    const g = this.beh.get('grows');
    if (!g || this.assembling > 0) return;
    const max = 1 + (this.h.arena ? 0.25 : 0.6) * (0.5 + g.power);
    if (this.grow < max) {
      this.grow = Math.min(max, this.grow + dt * 0.12);
      this.root.scale.setScalar(this.grow);
      this.placeCols();
    }
  }

  /** some com um "puf" */
  poof(): void {
    if (this.vanish > 0 || this.dead) return;
    this.vanish = 0.001;
    const p = this.body ? this.body.p : this.root.position;
    this.h.fx.dust(p.x, p.y + 1, p.z, '#ffffff', 16);
    if (this.h.isNear(p.x, p.y, p.z)) sfx.poof();
    if (this.rider) this.rider = null;
  }

  /** assento (mundo) */
  seatWorld(out: THREE.Vector3): THREE.Vector3 {
    const b = this.body;
    const p = b ? b.p : this.root.position;
    const yaw = b ? b.yaw : this.root.rotation.y;
    const s: V3 = this.spec.seat ?? [0, this.vx.max[1], 0];
    return out.set(p.x + (s[0] * Math.cos(yaw) + s[2] * Math.sin(yaw)) * this.grow, p.y + s[1] * this.grow, p.z + (-s[0] * Math.sin(yaw) + s[2] * Math.cos(yaw)) * this.grow);
  }
  get pos(): THREE.Vector3 {
    return this.body ? this.body.p : this.root.position;
  }
  get rideable(): boolean {
    return this.beh.has('ride') && !this.fixed;
  }

  private clearMeshes(): void {
    this.root.remove(this.tilt);
    for (const m of this.meshes) m.im.dispose();
    this.meshes = [];
    this.joints = [];
  }
  dispose(): void {
    this.clearMeshes();
    this.removeCols();
    if (this.light) {
      this.root.remove(this.light);
      this.light.dispose();
      this.h.freeLight();
    }
    this.h.scene.remove(this.root);
  }
}
