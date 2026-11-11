/* ============================================================
 *  BLOOP STUDIO — o EDITOR: peças na cena, seleção, ferramentas,
 *  manipuladores, encaixes (grade, ângulo, superfície), Caneta 3D,
 *  medir, copiar/colar, grupos, juntas e fichas — tudo via transações
 *  (desfazer/refazer).
 * ============================================================ */
import * as THREE from 'three';
import { LIMITS, nextPartId, type Creation, type Finish, type Joint, type JointKind, type LogicRule, type Part, type PartRole, type PhysMode, type PrimType, type StrokePart, type Vec3 } from '../format';
import { applyTransform, buildPart, disposeTree, type Resolver } from '../render/build';
import { materialFor, selectionMaterial } from '../render/mats';
import { History, type Command } from './history';
import { Gizmo, rayLineParam, rayPlaneAngle, type GizmoMode, type Handle } from './gizmo';
import { MakerCam } from './camera';

export type Tool = 'move' | 'rotate' | 'scale' | 'paint' | 'pen' | 'measure';
export type ChangeKind = 'sel' | 'doc' | 'tool' | 'hist' | 'measure' | 'world';

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export const DEFAULT_SIZE: Record<PrimType, Vec3> = {
  box: [1, 1, 1],
  sphere: [1, 1, 1],
  cylinder: [1, 1, 1],
  cone: [1, 1, 1],
  wedge: [1, 1, 1],
  torus: [1.2, 1.2, 0.3],
  capsule: [0.6, 1.2, 0.6],
  ramp: [2, 1, 2],
  arch: [2, 2, 0.5],
  pipe: [1, 1, 1],
};

export interface EditorHost {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  resolve: Resolver;
  detail: number;
  /** chão(s) para raios */
  ground(): THREE.Object3D[];
  groundHeight(x: number, z: number): number;
  /** limite de peças; devolve false se bloqueou (paywall/aviso) */
  canAdd(n: number): boolean;
  /** toque longo: abre o menu radial (x,y em px da tela) */
  radial(x: number, y: number): void;
  /** zona de toque reservada (joystick do voo) */
  reserved(x: number, y: number): boolean;
}

interface Drag {
  pid: number;
  h: Handle;
  tx: ReturnType<History['begin']>;
  start: Map<number, Part>;
  pivot: THREE.Vector3;
  t0: number;
  a0: number;
  sy: number;
  bottom: number;
  moved: boolean;
}

interface Ptr {
  id: number;
  x: number;
  y: number;
  sx: number;
  sy: number;
  t: number;
}

const clonePart = (p: Part): Part => JSON.parse(JSON.stringify(p)) as Part;

export class Editor {
  doc!: Creation;
  readonly group = new THREE.Group();
  readonly helpers = new THREE.Group();
  readonly views = new Map<number, THREE.Object3D>();
  sel = new Set<number>();
  tool: Tool = 'move';
  multi = false;
  grid = 0.5; // 0 = livre
  angle = 15; // 0 = livre
  surface = true;
  layersHidden = new Set<number>();
  penDepth = 4;
  penWidth = 0.06;
  paint: { c: string; k: Finish } = { c: '#ff5cc8', k: 'plastic' };
  readonly cam: MakerCam;
  readonly gizmo = new Gizmo();
  readonly hist: History;
  private listeners = new Set<(k: ChangeKind) => void>();
  private ray = new THREE.Raycaster();
  private ptrs = new Map<number, Ptr>();
  private drag: Drag | null = null;
  private longT = 0;
  private pinch: { d: number; cx: number; cy: number } | null = null;
  private pen: { pts: THREE.Vector3[]; plane: THREE.Plane; line: THREE.Line; tx: ReturnType<History['begin']> } | null = null;
  private outlines = new Map<number, THREE.Object3D>();
  private gridHelper: THREE.Mesh;
  private jointMarks = new THREE.Group();
  private badges = new THREE.Group();
  measure: { a: THREE.Vector3 | null; b: THREE.Vector3 | null; line: THREE.Line } ;
  private clip: { parts: Part[]; center: THREE.Vector3 } | null = null;
  private picker: ((id: number | null) => void) | null = null;
  private badgeTex = new Map<string, THREE.Texture>();
  enabled = true;

  constructor(private host: EditorHost) {
    this.cam = new MakerCam(host.camera);
    this.cam.floor = (x, z) => host.groundHeight(x, z);
    this.hist = new History((cmd, ids) => this.onHistory(cmd, ids));
    host.scene.add(this.group, this.helpers);
    this.helpers.add(this.gizmo.root, this.jointMarks, this.badges);
    this.gridHelper = makeGrid(60);
    this.helpers.add(this.gridHelper);
    const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const ml = new THREE.Line(lg, new THREE.LineDashedMaterial({ color: 0xffd34a, dashSize: 0.2, gapSize: 0.1, depthTest: false }));
    ml.renderOrder = 998;
    ml.visible = false;
    this.measure = { a: null, b: null, line: ml };
    this.helpers.add(ml);
    const cv = host.canvas;
    cv.addEventListener('pointerdown', this.onDown);
    cv.addEventListener('pointermove', this.onMove);
    cv.addEventListener('pointerup', this.onUp);
    cv.addEventListener('pointercancel', this.onCancel);
    cv.addEventListener('wheel', this.onWheel, { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  on(f: (k: ChangeKind) => void): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }
  private emit(k: ChangeKind): void {
    for (const f of this.listeners) f(k);
  }

  /* ------------------------------- documento ------------------------------- */

  load(doc: Creation): void {
    this.doc = doc;
    this.sel.clear();
    this.hist.clear();
    this.rebuildAll();
    this.emit('doc');
    this.emit('sel');
    this.emit('hist');
  }

  rebuildAll(): void {
    for (const v of this.views.values()) {
      this.group.remove(v);
      disposeTree(v);
    }
    this.views.clear();
    for (const p of this.doc.parts) this.syncPart(p.id);
    this.refreshDecor();
  }

  private shapeKey(p: Part): string {
    const m = this.doc.materials[p.m ?? 0];
    return `${p.t}|${m?.c}${m?.k}|${p.role ?? ''}|${p.hide ? 1 : 0}|${p.t === 'stroke' ? p.pts.length + ':' + p.w + ':' + p.pts[3] : ''}|${p.t === 'ref' ? p.ref : ''}`;
  }

  /** recria/atualiza a malha de uma peça (rápido quando só mudou a transformação) */
  syncPart(id: number): void {
    const p = this.doc.parts.find((q) => q.id === id);
    const old = this.views.get(id);
    if (!p) {
      if (old) {
        this.group.remove(old);
        disposeTree(old);
        this.views.delete(id);
      }
      this.sel.delete(id);
      return;
    }
    const key = this.shapeKey(p);
    if (old && old.userData.key === key) {
      applyTransform(p, old);
    } else {
      if (old) {
        this.group.remove(old);
        disposeTree(old);
      }
      const o = buildPart(p, this.doc, this.host.resolve, { detail: this.host.detail, edit: true });
      o.userData.key = key;
      this.views.set(id, o);
      this.group.add(o);
    }
    this.views.get(id)!.visible = !this.layersHidden.has(p.layer ?? 0);
  }

  part(id: number): Part | undefined {
    return this.doc.parts.find((p) => p.id === id);
  }
  selected(): Part[] {
    return this.doc.parts.filter((p) => this.sel.has(p.id));
  }

  /** executa uma mudança como UM passo de desfazer */
  change(label: string, fn: () => void): Command | null {
    const tx = this.hist.begin(this.doc);
    fn();
    return this.finish(tx, label);
  }
  private finish(tx: ReturnType<History['begin']>, label: string): Command | null {
    const cmd = this.hist.end(this.doc, tx, label);
    if (cmd) {
      for (const [id] of cmd.parts) this.syncPart(id);
      if (cmd.materials) this.rebuildAll();
      if (cmd.extra) this.emit('world');
      this.refreshDecor();
      this.emit('doc');
      this.emit('hist');
    }
    this.refreshSelection();
    return cmd;
  }
  private onHistory(cmd: Command, ids: number[]): void {
    if (cmd.materials) this.rebuildAll();
    else for (const id of ids) this.syncPart(id);
    if (cmd.extra) this.emit('world');
    for (const id of [...this.sel]) if (!this.part(id)) this.sel.delete(id);
    this.refreshDecor();
    this.refreshSelection();
    this.emit('doc');
    this.emit('hist');
  }
  undo(): string | null {
    return this.hist.undo(this.doc);
  }
  redo(): string | null {
    return this.hist.redo(this.doc);
  }

  /* -------------------------------- seleção -------------------------------- */

  select(ids: number[], add = false): void {
    if (!add) this.sel.clear();
    for (const id of ids) {
      const p = this.part(id);
      if (!p) continue;
      const grp = p.g ? this.doc.parts.filter((q) => q.g === p.g).map((q) => q.id) : [id];
      const all = grp.every((x) => this.sel.has(x));
      for (const x of grp) {
        if (add && all) this.sel.delete(x);
        else this.sel.add(x);
      }
    }
    this.refreshSelection();
    this.emit('sel');
  }
  clearSelection(): void {
    if (!this.sel.size) return;
    this.sel.clear();
    this.refreshSelection();
    this.emit('sel');
  }

  refreshSelection(): void {
    for (const [id, o] of this.outlines) {
      o.parent?.remove(o);
      if (o instanceof THREE.LineSegments) o.geometry.dispose();
      this.outlines.delete(id);
    }
    for (const id of this.sel) {
      const v = this.views.get(id);
      const p = this.part(id);
      if (!v || !p) continue;
      let o: THREE.Object3D;
      if (p.t !== 'ref' && p.t !== 'stroke' && (v as THREE.Mesh).isMesh) {
        const m = new THREE.Mesh((v as THREE.Mesh).geometry, selectionMaterial());
        const s = p.s ?? [1, 1, 1];
        const k = 0.05;
        m.scale.set(1 + (2 * k) / Math.abs(s[0]), 1 + (2 * k) / Math.abs(s[1]), 1 + (2 * k) / Math.abs(s[2]));
        m.renderOrder = -1;
        m.userData.outline = true;
        o = m;
        v.add(o);
      } else {
        const box = new THREE.Box3().setFromObject(v);
        const h = new THREE.Box3Helper(box, 0xffd34a);
        o = h;
        this.helpers.add(h);
      }
      this.outlines.set(id, o);
    }
    this.placeGizmo();
  }

  /** caixa (mundo) da seleção */
  selBox(): THREE.Box3 {
    const b = new THREE.Box3();
    for (const id of this.sel) {
      const v = this.views.get(id);
      if (v) expandBox(b, v);
    }
    return b;
  }

  private pivot(): THREE.Vector3 {
    if (this.sel.size === 1) {
      const p = this.part([...this.sel][0])!;
      return new THREE.Vector3(...p.p);
    }
    return this.selBox().getCenter(new THREE.Vector3());
  }

  placeGizmo(): void {
    const g = this.gizmo;
    const show = this.sel.size > 0 && (this.tool === 'move' || this.tool === 'rotate' || this.tool === 'scale') && this.enabled;
    g.root.visible = show;
    if (!show) return;
    g.setMode(this.tool as GizmoMode);
    g.root.position.copy(this.pivot());
  }

  setTool(t: Tool): void {
    this.tool = t;
    this.cancelPen();
    if (t !== 'measure') this.clearMeasure();
    this.placeGizmo();
    this.emit('tool');
  }

  /* ------------------------------ ações de peças ------------------------------ */

  /** ponto + normal do que está sob (x,y) da tela — peças e chão */
  surfaceAt(x: number, y: number, exclude?: Set<number>): { p: THREE.Vector3; n: THREE.Vector3; pid: number | null } | null {
    this.setRay(x, y);
    const objs: THREE.Object3D[] = [...this.host.ground()];
    for (const [id, v] of this.views) if (!exclude?.has(id) && v.visible) objs.push(v);
    const hits = this.ray.intersectObjects(objs, true);
    for (const h of hits) {
      const o = h.object;
      if (o.userData.ground || o.parent?.userData.ground) return { p: h.point, n: h.face ? h.face.normal.clone().transformDirection(o.matrixWorld) : new THREE.Vector3(0, 1, 0), pid: null };
      const pid = this.pidOf(o);
      if (pid == null || exclude?.has(pid)) continue;
      const p = this.part(pid);
      if (p?.role === 'zone') continue;
      return { p: h.point, n: h.face ? h.face.normal.clone().transformDirection(o.matrixWorld).normalize() : new THREE.Vector3(0, 1, 0), pid };
    }
    return null;
  }

  private pidOf(o: THREE.Object3D): number | null {
    let x: THREE.Object3D | null = o;
    while (x) {
      if (x.userData.pid != null && x.parent === this.group) return x.userData.pid as number;
      x = x.parent;
    }
    return null;
  }

  private snapV(v: number): number {
    return this.grid ? Math.round(v / this.grid) * this.grid : Math.round(v * 1000) / 1000;
  }

  /** adiciona primitiva no ponto que a câmera mira (centro da tela) */
  addPrim(t: PrimType, at?: { x: number; y: number }): number | null {
    if (!this.host.canAdd(1)) return null;
    const s = [...DEFAULT_SIZE[t]] as Vec3;
    const pos = this.placementPoint(at, s[1] / 2);
    let id = 0;
    this.change('add', () => {
      id = nextPartId(this.doc);
      const mi = this.materialIndex(this.paint);
      const p: Part = { id, t, p: pos, s };
      if (mi) p.m = mi;
      this.doc.parts.push(p);
    });
    this.select([id]);
    if (this.tool !== 'move' && this.tool !== 'rotate' && this.tool !== 'scale') this.setTool('move');
    return id;
  }

  /** importa outra criação (biblioteca/loja) como peça 'ref' */
  addRef(refId: string, size: THREE.Vector3, at?: { x: number; y: number }, count = 1): number | null {
    if (!this.host.canAdd(count)) return null;
    const pos = this.placementPoint(at, 0);
    let id = 0;
    this.change('add', () => {
      id = nextPartId(this.doc);
      this.doc.parts.push({ id, t: 'ref', ref: refId, p: pos });
    });
    void size;
    this.select([id]);
    return id;
  }

  private placementPoint(at: { x: number; y: number } | undefined, halfH: number): Vec3 {
    const r = this.host.canvas.getBoundingClientRect();
    const sx = at?.x ?? r.left + r.width / 2;
    const sy = at?.y ?? r.top + r.height * 0.55;
    const hit = this.surfaceAt(sx, sy);
    let v: THREE.Vector3;
    if (hit && hit.p.distanceTo(this.host.camera.position) < 80) {
      v = hit.p.clone();
      if (hit.n.y > 0.5) v.y += halfH;
      else v.addScaledVector(hit.n, 0.5);
    } else {
      v = this.host.camera.position.clone().addScaledVector(this.host.camera.getWorldDirection(new THREE.Vector3()), 6);
      v.y = Math.max(v.y, this.host.groundHeight(v.x, v.z) + halfH);
    }
    return [this.snapV(v.x), Math.round(v.y * 1000) / 1000, this.snapV(v.z)];
  }

  /** índice do material (cria se não existe; reaproveita o mais parecido se a lista encheu) */
  materialIndex(m: { c: string; k: Finish }): number {
    const ms = this.doc.materials;
    const i = ms.findIndex((x) => x.c === m.c && x.k === m.k);
    if (i >= 0) return i;
    if (ms.length < LIMITS.materials) {
      ms.push({ c: m.c, k: m.k });
      return ms.length - 1;
    }
    let best = 0;
    let bd = Infinity;
    const a = new THREE.Color(m.c);
    ms.forEach((x, j) => {
      const b = new THREE.Color(x.c);
      const d = (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2 + (x.k === m.k ? 0 : 0.2);
      if (d < bd) {
        bd = d;
        best = j;
      }
    });
    return best;
  }

  duplicate(): void {
    const src = this.selected();
    if (!src.length || !this.host.canAdd(src.length)) return;
    const ids: number[] = [];
    this.change('dup', () => {
      let next = nextPartId(this.doc);
      const gmap = new Map<number, number>();
      let gnext = this.nextGroup();
      const off = this.grid || 0.5;
      for (const p of src) {
        const q = clonePart(p);
        q.id = next++;
        q.p = [q.p[0] + off, q.p[1], q.p[2] + off];
        if (q.g) {
          if (!gmap.has(q.g)) gmap.set(q.g, gnext++);
          q.g = gmap.get(q.g);
        }
        this.doc.parts.push(q);
        ids.push(q.id);
      }
    });
    this.sel = new Set(ids);
    this.refreshSelection();
    this.emit('sel');
  }

  remove(): void {
    if (!this.sel.size) return;
    const ids = new Set(this.sel);
    this.change('del', () => {
      this.doc.parts = this.doc.parts.filter((p) => !ids.has(p.id));
      this.doc.joints = this.doc.joints.filter((j) => !ids.has(j.a) && !ids.has(j.b));
      this.doc.logic = this.cleanLogic(ids);
    });
    this.sel.clear();
    this.refreshSelection();
    this.emit('sel');
  }

  private cleanLogic(gone: Set<number>): LogicRule[] {
    const jids = new Set(this.doc.joints.map((j) => j.id));
    return this.doc.logic
      .filter((r) => r.on.part == null || !gone.has(r.on.part))
      .map((r) => ({ ...r, do: r.do.filter((a) => (a.part == null || !gone.has(a.part)) && (a.joint == null || jids.has(a.joint))) }))
      .filter((r) => r.do.length);
  }

  nextGroup(): number {
    let g = 0;
    for (const p of this.doc.parts) if (p.g && p.g > g) g = p.g;
    return g + 1;
  }

  group_(): void {
    if (this.sel.size < 2) return;
    this.change('group', () => {
      const g = this.nextGroup();
      for (const p of this.selected()) p.g = g;
    });
  }
  ungroup(): void {
    this.change('ungroup', () => {
      for (const p of this.selected()) delete p.g;
    });
  }
  isGrouped(): boolean {
    const s = this.selected();
    return s.length > 1 && s.every((p) => p.g && p.g === s[0].g);
  }

  copy(): number {
    const s = this.selected();
    if (!s.length) return 0;
    const box = this.selBox();
    this.clip = { parts: s.map(clonePart), center: box.getCenter(new THREE.Vector3()) };
    return s.length;
  }
  get hasClip(): boolean {
    return !!this.clip;
  }
  paste(): void {
    const c = this.clip;
    if (!c || !this.host.canAdd(c.parts.length)) return;
    const target = new THREE.Vector3(...this.placementPoint(undefined, 0));
    const box = new THREE.Box3();
    for (const p of c.parts) box.expandByPoint(new THREE.Vector3(...p.p));
    const dy = c.center.y - box.min.y;
    const off = target.clone().sub(c.center);
    off.y += dy * 0 + (box.min.y < c.center.y ? 0 : 0);
    const ids: number[] = [];
    this.change('paste', () => {
      let next = nextPartId(this.doc);
      const gmap = new Map<number, number>();
      let gnext = this.nextGroup();
      for (const p of c.parts) {
        const q = clonePart(p);
        q.id = next++;
        q.p = [this.snapV(q.p[0] + off.x), Math.max(q.p[1], q.p[1] + off.y), this.snapV(q.p[2] + off.z)];
        if (q.g) {
          if (!gmap.has(q.g)) gmap.set(q.g, gnext++);
          q.g = gmap.get(q.g);
        }
        // material: copia pelo valor
        q.m = this.materialIndex(this.doc.materials[p.m ?? 0] ?? this.doc.materials[0]) || undefined;
        if (!q.m) delete q.m;
        this.doc.parts.push(q);
        ids.push(q.id);
      }
    });
    this.sel = new Set(ids);
    this.refreshSelection();
    this.emit('sel');
  }

  setMaterial(ids: number[], m: { c: string; k: Finish }): void {
    this.change('paint', () => {
      const i = this.materialIndex(m);
      for (const id of ids) {
        const p = this.part(id);
        if (!p) continue;
        if (i) p.m = i;
        else delete p.m;
      }
    });
  }
  setPhys(mode: PhysMode): void {
    this.change('phys', () => {
      for (const p of this.selected()) {
        if (mode === 'static') delete p.phys;
        else p.phys = mode;
      }
    });
  }
  setRole(role: PartRole | null): void {
    this.change('role', () => {
      for (const p of this.selected()) {
        if (role) p.role = role;
        else delete p.role;
        // rodas: deixa o cilindro "em pé de lado" (eixo X) se ainda estiver com eixo Y
        if (role === 'wheel' && p.t === 'cylinder' && !(p.r && (p.r[0] || p.r[2]))) p.r = [0, p.r?.[1] ?? 0, 90];
      }
    });
  }
  setHidden(on: boolean): void {
    this.change('hide', () => {
      for (const p of this.selected()) {
        if (on) p.hide = true;
        else delete p.hide;
      }
    });
  }
  setLayer(ids: number[], layer: number): void {
    this.change('layer', () => {
      for (const id of ids) {
        const p = this.part(id);
        if (!p) continue;
        if (layer) p.layer = layer;
        else delete p.layer;
      }
    });
  }
  toggleLayerVisible(layer: number): void {
    if (this.layersHidden.has(layer)) this.layersHidden.delete(layer);
    else this.layersHidden.add(layer);
    for (const p of this.doc.parts) {
      const v = this.views.get(p.id);
      if (v) v.visible = !this.layersHidden.has(p.layer ?? 0);
    }
    for (const id of [...this.sel]) if (this.layersHidden.has(this.part(id)?.layer ?? 0)) this.sel.delete(id);
    this.refreshSelection();
    this.emit('sel');
  }
  rename(id: number, name: string): void {
    this.change('rename', () => {
      const p = this.part(id);
      if (!p) return;
      if (name) p.name = name.slice(0, LIMITS.nameLen);
      else delete p.name;
    });
  }

  /** passo de transformação exata (botões ±) */
  nudge(axis: 0 | 1 | 2, kind: 'p' | 'r' | 's', dir: number): void {
    this.change('nudge', () => {
      for (const p of this.selected()) {
        if (kind === 'p') {
          p.p[axis] = Math.round((p.p[axis] + dir * (this.grid || 0.1)) * 1000) / 1000;
        } else if (kind === 'r') {
          const r = p.r ?? [0, 0, 0];
          r[axis] = (((r[axis] + dir * (this.angle || 5) + 540) % 360) - 180) as number;
          p.r = r;
        } else {
          const s = p.s ?? [1, 1, 1];
          s[axis] = Math.max(LIMITS.minSize, Math.round((s[axis] + dir * (this.grid || 0.1)) * 1000) / 1000);
          p.s = s;
        }
      }
    });
  }

  /* --------------------------------- juntas --------------------------------- */

  addJoint(kind: JointKind, axis: 0 | 1 | 2, motor: boolean): Joint | null {
    const s = this.selected();
    if (!s.length) return null;
    const a = s[0];
    const b = s.find((p) => p.id !== a.id && (!a.g || p.g !== a.g));
    const ax: Vec3 = [axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0];
    let j: Joint | null = null;
    this.change('joint', () => {
      const id = this.doc.joints.reduce((m, x) => Math.max(m, x.id), 0) + 1;
      j = { id, k: kind, a: a.id, b: b?.id ?? 0, at: [...a.p] as Vec3, axis: ax };
      if (kind === 'slider') j.lim = [0, 3];
      if (motor && kind !== 'fixed') j.motor = { speed: kind === 'slider' ? 1 : 2, force: 500 };
      // a peça que gira precisa poder se mexer
      for (const p of this.doc.parts) if (p.id === a.id || (a.g && p.g === a.g)) if (!p.phys) p.phys = 'dynamic';
      this.doc.joints.push(j);
    });
    return j;
  }
  updateJoint(id: number, fn: (j: Joint) => void): void {
    this.change('joint', () => {
      const j = this.doc.joints.find((x) => x.id === id);
      if (j) fn(j);
    });
  }
  removeJoint(id: number): void {
    this.change('joint', () => {
      this.doc.joints = this.doc.joints.filter((j) => j.id !== id);
      this.doc.logic = this.cleanLogic(new Set());
    });
  }

  /* --------------------------------- fichas --------------------------------- */

  setLogic(rules: LogicRule[], label = 'logic'): void {
    this.change(label, () => {
      this.doc.logic = JSON.parse(JSON.stringify(rules)) as LogicRule[];
    });
  }

  /** modo "toque numa peça" (fichas/juntas): resolve com o id ou null se cancelar */
  pickPart(): Promise<number | null> {
    this.picker?.(null);
    return new Promise((res) => {
      this.picker = (id) => {
        this.picker = null;
        res(id);
      };
    });
  }
  cancelPick(): void {
    this.picker?.(null);
  }
  get picking(): boolean {
    return !!this.picker;
  }

  /* ------------------------------ decoração 3D ------------------------------ */

  refreshDecor(): void {
    // marcas das juntas
    for (const c of [...this.jointMarks.children]) {
      this.jointMarks.remove(c);
      (c as THREE.Mesh).geometry?.dispose();
    }
    for (const j of this.doc.joints) {
      const col = j.k === 'hinge' ? 0xff9a2e : j.k === 'slider' ? 0x3fa8ff : 0xb8a8e0;
      const ax = new THREE.Vector3(...(j.axis ?? [0, 1, 0])).normalize();
      const len = 1.4;
      const g = new THREE.CylinderGeometry(0.05, 0.05, len, 8);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: 0.85 }));
      m.position.set(...j.at);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ax);
      m.renderOrder = 997;
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), m.material);
      s.position.copy(m.position);
      s.renderOrder = 997;
      this.jointMarks.add(m, s);
    }
    // selos dos papéis
    for (const c of [...this.badges.children]) this.badges.remove(c);
    for (const p of this.doc.parts) {
      if (!p.role || p.role === 'zone') continue;
      const v = this.views.get(p.id);
      if (!v || !v.visible) continue;
      const box = new THREE.Box3().setFromObject(v);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.badge(p.role), depthTest: false, transparent: true }));
      sp.position.set((box.min.x + box.max.x) / 2, box.max.y + 0.35, (box.min.z + box.max.z) / 2);
      sp.scale.setScalar(0.45);
      sp.renderOrder = 996;
      this.badges.add(sp);
    }
  }

  private badge(role: PartRole): THREE.Texture {
    let t = this.badgeTex.get(role);
    if (t) return t;
    const S: Record<PartRole, [string, string]> = {
      seat: ['#ff5cc8', '▣'],
      wheel: ['#3a2a5a', '◎'],
      thruster: ['#ff9a2e', '▲'],
      spawn: ['#4fd67a', '★'],
      checkpoint: ['#ffd34a', '⚑'],
      goal: ['#4fd67a', '⚑'],
      button: ['#ff4f6a', '●'],
      zone: ['#8a5cff', '▢'],
      light: ['#ffd34a', '✦'],
      hazard: ['#ff5a2e', '!'],
      collect: ['#ffd34a', '◆'],
      enemy: ['#ff3a5a', '✖'],
    };
    const [bg, g] = S[role];
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d')!;
    x.fillStyle = '#2a0b5c';
    x.beginPath();
    x.arc(32, 32, 30, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = bg;
    x.beginPath();
    x.arc(32, 32, 25, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#fff';
    x.font = 'bold 30px system-ui, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(g, 32, 34);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    this.badgeTex.set(role, t);
    return t;
  }

  setGridVisible(on: boolean): void {
    this.gridHelper.visible = on;
  }
  /** grade de 0,5 m do tamanho da área de construção */
  setGridSize(size: number): void {
    this.helpers.remove(this.gridHelper);
    this.gridHelper.geometry.dispose();
    (this.gridHelper.material as THREE.Material).dispose();
    this.gridHelper = makeGrid(size);
    this.helpers.add(this.gridHelper);
  }

  /* ------------------------------ entrada (toque) ------------------------------ */

  private setRay(x: number, y: number): void {
    const r = this.host.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), this.host.camera);
  }

  private onDown = (e: PointerEvent) => {
    if (!this.enabled) return;
    if (e.pointerType === 'touch' && this.host.reserved(e.clientX, e.clientY)) return;
    this.host.canvas.setPointerCapture?.(e.pointerId);
    const p: Ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() };
    this.ptrs.set(e.pointerId, p);
    if (this.ptrs.size === 2) {
      // segundo dedo: cancela arraste/desenho e vira pinça
      this.abortDrag();
      this.cancelPen();
      clearTimeout(this.longT);
      const [a, b] = [...this.ptrs.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      return;
    }
    if (this.ptrs.size > 2) return;
    if (e.button === 2) return; // botão direito: só câmera
    // manipulador?
    if (this.gizmo.root.visible && !this.picker) {
      this.setRay(e.clientX, e.clientY);
      this.gizmo.fit(this.host.camera);
      this.gizmo.root.updateMatrixWorld(true);
      const h = this.gizmo.hit(this.ray);
      if (h) {
        this.startDrag(h, e);
        return;
      }
    }
    if (this.tool === 'pen' && !this.picker) {
      this.startPen(e.clientX, e.clientY);
      return;
    }
    clearTimeout(this.longT);
    this.longT = window.setTimeout(() => {
      const q = this.ptrs.get(e.pointerId);
      if (!q || Math.hypot(q.x - q.sx, q.y - q.sy) > 10 || this.ptrs.size !== 1) return;
      q.t = -1; // consumido
      const hit = this.surfaceAt(q.x, q.y);
      if (hit?.pid != null && !this.sel.has(hit.pid)) this.select([hit.pid], this.multi);
      this.host.radial(q.x, q.y);
    }, 480);
  };

  private onMove = (e: PointerEvent) => {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.pinch && this.ptrs.size === 2) {
      const [a, b] = [...this.ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      if (this.pinch.d > 10 && d > 10) this.cam.zoom(this.pinch.d / d);
      this.cam.pan(cx - this.pinch.cx, cy - this.pinch.cy);
      this.pinch = { d, cx, cy };
      return;
    }
    if (this.drag) {
      this.dragMove(e.clientX, e.clientY);
      return;
    }
    if (this.pen) {
      this.penMove(e.clientX, e.clientY);
      return;
    }
    if (Math.hypot(p.x - p.sx, p.y - p.sy) < 8 && e.pointerType !== 'mouse') return;
    if (Math.hypot(p.x - p.sx, p.y - p.sy) >= 8) clearTimeout(this.longT);
    if (e.pointerType === 'mouse' && e.buttons === 0) return;
    if (this.cam.mode === 'orbit') {
      if (e.buttons === 4 || (e.buttons === 1 && e.shiftKey)) this.cam.pan(dx, dy);
      else this.cam.orbit(dx, dy);
    } else this.cam.look(dx, dy);
  };

  private onUp = (e: PointerEvent) => {
    const p = this.ptrs.get(e.pointerId);
    this.ptrs.delete(e.pointerId);
    clearTimeout(this.longT);
    if (this.ptrs.size < 2) this.pinch = null;
    if (!p) return;
    if (this.drag) {
      this.endDrag();
      return;
    }
    if (this.pen) {
      this.endPen();
      return;
    }
    const moved = Math.hypot(p.x - p.sx, p.y - p.sy);
    if (p.t > 0 && moved < 10 && performance.now() - p.t < 450 && this.ptrs.size === 0 && e.button !== 2) this.tap(p.x, p.y);
  };
  private onCancel = (e: PointerEvent) => {
    this.ptrs.delete(e.pointerId);
    clearTimeout(this.longT);
    this.pinch = null;
    if (this.drag) this.endDrag();
    this.cancelPen();
  };
  private onWheel = (e: WheelEvent) => {
    if (!this.enabled) return;
    e.preventDefault();
    this.cam.zoom(Math.exp(e.deltaY * 0.0012));
  };

  private tap(x: number, y: number): void {
    const hit = this.surfaceAt(x, y);
    if (this.picker) {
      this.picker(hit?.pid ?? null);
      return;
    }
    switch (this.tool) {
      case 'paint':
        if (hit?.pid != null) {
          const p = this.part(hit.pid)!;
          const ids = p.g ? this.doc.parts.filter((q) => q.g === p.g).map((q) => q.id) : [p.id];
          this.setMaterial(ids, this.paint);
        }
        return;
      case 'measure':
        if (hit) this.measurePoint(hit.p);
        return;
      default:
        if (hit?.pid != null) {
          if (this.sel.has(hit.pid) && !this.multi && this.sel.size) {
            // tocar de novo na seleção abre o menu de contexto
            this.host.radial(x, y);
            return;
          }
          this.select([hit.pid], this.multi);
        } else if (!this.multi) this.clearSelection();
    }
  }

  /* ------------------------------- arrastar ------------------------------- */

  private startDrag(h: Handle, e: PointerEvent): void {
    const start = new Map<number, Part>();
    for (const p of this.selected()) start.set(p.id, clonePart(p));
    const pivot = this.pivot();
    const d: Drag = { pid: e.pointerId, h, tx: this.hist.begin(this.doc), start, pivot, t0: 0, a0: 0, sy: e.clientY, bottom: 0, moved: false };
    this.setRay(e.clientX, e.clientY);
    if (h.kind === 'axis' || h.kind === 'scale') d.t0 = rayLineParam(this.ray.ray, pivot, Gizmo.axis(h.axis));
    if (h.kind === 'ring') {
      const A = Gizmo.axis(h.axis);
      d.a0 = rayPlaneAngle(this.ray.ray, pivot, A, refFor(A)) ?? 0;
    }
    if (h.kind === 'free') d.bottom = pivot.y - this.selBox().min.y;
    this.drag = d;
  }

  private dragMove(x: number, y: number): void {
    const d = this.drag!;
    this.setRay(x, y);
    d.moved = true;
    const sel = [...d.start.values()];
    const set = (id: number, fn: (p: Part, s: Part) => void) => {
      const p = this.part(id);
      if (p) fn(p, d.start.get(id)!);
    };
    if (d.h.kind === 'axis') {
      const A = Gizmo.axis(d.h.axis);
      let delta = rayLineParam(this.ray.ray, d.pivot, A) - d.t0;
      if (this.grid) delta = Math.round(delta / this.grid) * this.grid;
      for (const s of sel) set(s.id, (p, s0) => (p.p = [...s0.p] as Vec3, (p.p[d.h.axis as 0] = Math.round((s0.p[d.h.axis as 0] + delta) * 1000) / 1000)));
    } else if (d.h.kind === 'free') {
      const ex = new Set(d.start.keys());
      const hit = this.surface ? this.surfaceAt(x, y, ex) : null;
      let target: THREE.Vector3 | null = null;
      if (hit) {
        target = hit.p.clone();
        if (hit.n.y > 0.5) target.y += d.bottom;
        else target.addScaledVector(hit.n, 0.5);
      } else {
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -d.pivot.y);
        target = this.ray.ray.intersectPlane(plane, new THREE.Vector3());
      }
      if (!target) return;
      target.x = this.snapV(target.x);
      target.z = this.snapV(target.z);
      const off = target.sub(d.pivot);
      for (const s of sel) set(s.id, (p, s0) => (p.p = [Math.round((s0.p[0] + off.x) * 1000) / 1000, Math.round((s0.p[1] + off.y) * 1000) / 1000, Math.round((s0.p[2] + off.z) * 1000) / 1000]));
    } else if (d.h.kind === 'ring') {
      const A = Gizmo.axis(d.h.axis);
      const a = rayPlaneAngle(this.ray.ray, d.pivot, A, refFor(A));
      if (a == null) return;
      let delta = a - d.a0;
      if (this.angle) delta = Math.round((delta * R2D) / this.angle) * this.angle * D2R;
      const q = new THREE.Quaternion().setFromAxisAngle(A, delta);
      for (const s of sel)
        set(s.id, (p, s0) => {
          const v = new THREE.Vector3(...s0.p).sub(d.pivot).applyQuaternion(q).add(d.pivot);
          p.p = [Math.round(v.x * 1000) / 1000, Math.round(v.y * 1000) / 1000, Math.round(v.z * 1000) / 1000];
          const r0 = s0.r ?? [0, 0, 0];
          const pq = new THREE.Quaternion().setFromEuler(new THREE.Euler(r0[0] * D2R, r0[1] * D2R, r0[2] * D2R, 'XYZ'));
          const e = new THREE.Euler().setFromQuaternion(q.clone().multiply(pq), 'XYZ');
          const r: Vec3 = [Math.round(e.x * R2D * 10) / 10, Math.round(e.y * R2D * 10) / 10, Math.round(e.z * R2D * 10) / 10];
          if (r[0] || r[1] || r[2]) p.r = r;
          else delete p.r;
        });
    } else if (d.h.kind === 'scale') {
      const A = Gizmo.axis(d.h.axis);
      const t = rayLineParam(this.ray.ray, d.pivot, A);
      const t0 = d.t0 || 1e-3;
      for (const s of sel)
        set(s.id, (p, s0) => {
          const s3 = [...(s0.s ?? [1, 1, 1])] as Vec3;
          // eixo local da peça mais alinhado com o eixo do mundo
          const r0 = s0.r ?? [0, 0, 0];
          const pq = new THREE.Quaternion().setFromEuler(new THREE.Euler(r0[0] * D2R, r0[1] * D2R, r0[2] * D2R, 'XYZ'));
          let li = 0;
          let best = -1;
          for (let i = 0; i < 3; i++) {
            const dd = Math.abs(Gizmo.axis(i).clone().applyQuaternion(pq).dot(A));
            if (dd > best) {
              best = dd;
              li = i;
            }
          }
          const size0 = Math.abs(s3[li]);
          // a alça fica a ~1 unidade do gizmo; arrastar 1 unidade = dobra/zera o tamanho
          const gs = this.gizmo.root.scale.x;
          let ns = size0 + ((t - t0) / Math.max(0.3, gs)) * Math.max(0.5, size0) * 0.9;
          if (this.grid) ns = Math.round(ns / (this.grid / 2)) * (this.grid / 2);
          s3[li] = Math.max(LIMITS.minSize, Math.min(LIMITS.maxSize, Math.round(ns * 1000) / 1000));
          p.s = s3;
          if (sel.length > 1) {
            const k = s3[li] / Math.max(1e-3, size0);
            const v = new THREE.Vector3(...s0.p).sub(d.pivot);
            const along = v.dot(A);
            v.addScaledVector(A, along * (k - 1)).add(d.pivot);
            p.p = [Math.round(v.x * 1000) / 1000, Math.round(v.y * 1000) / 1000, Math.round(v.z * 1000) / 1000];
          }
        });
    } else if (d.h.kind === 'uniform') {
      const k = Math.exp(-(y - d.sy) * 0.008);
      for (const s of sel)
        set(s.id, (p, s0) => {
          const s3 = (s0.s ?? [1, 1, 1]).map((v) => {
            let n = v * k;
            if (this.grid) n = Math.max(this.grid / 2, Math.round(n / (this.grid / 2)) * (this.grid / 2));
            return Math.max(LIMITS.minSize, Math.min(LIMITS.maxSize, Math.round(n * 1000) / 1000));
          }) as Vec3;
          p.s = s3;
          const v = new THREE.Vector3(...s0.p).sub(d.pivot).multiplyScalar(k).add(d.pivot);
          if (sel.length > 1) p.p = [Math.round(v.x * 1000) / 1000, Math.round(v.y * 1000) / 1000, Math.round(v.z * 1000) / 1000];
        });
    }
    for (const s of sel) this.syncPart(s.id);
    this.refreshSelection();
    this.emit('measure');
  }

  private endDrag(): void {
    const d = this.drag!;
    this.drag = null;
    this.gizmo.highlight(null);
    // juntas presas às peças movidas acompanham
    if (d.moved && d.h.kind !== 'scale' && d.h.kind !== 'uniform') {
      for (const j of this.doc.joints) {
        const s0 = d.start.get(j.a);
        const p = this.part(j.a);
        if (!s0 || !p) continue;
        j.at = [Math.round((j.at[0] + p.p[0] - s0.p[0]) * 1000) / 1000, Math.round((j.at[1] + p.p[1] - s0.p[1]) * 1000) / 1000, Math.round((j.at[2] + p.p[2] - s0.p[2]) * 1000) / 1000];
      }
    }
    this.finish(d.tx, d.h.kind === 'ring' ? 'rotate' : d.h.kind === 'scale' || d.h.kind === 'uniform' ? 'scale' : 'move');
  }
  private abortDrag(): void {
    if (!this.drag) return;
    this.endDrag();
  }

  /* ------------------------------- Caneta 3D ------------------------------- */

  private startPen(x: number, y: number): void {
    if (!this.host.canAdd(1)) return;
    const cam = this.host.camera;
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const center = cam.position.clone().addScaledVector(fwd, this.penDepth);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(fwd.clone().negate(), center);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LIMITS.strokePoints * 3 * 4), 3));
    g.setDrawRange(0, 0);
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: new THREE.Color(this.paint.c), depthTest: false }));
    line.renderOrder = 999;
    line.frustumCulled = false;
    this.helpers.add(line);
    this.pen = { pts: [], plane, line, tx: this.hist.begin(this.doc) };
    this.penMove(x, y);
  }
  private penMove(x: number, y: number): void {
    const pen = this.pen!;
    this.setRay(x, y);
    const v = this.ray.ray.intersectPlane(pen.plane, new THREE.Vector3());
    if (!v) return;
    const last = pen.pts[pen.pts.length - 1];
    if (last && last.distanceTo(v) < Math.max(0.03, this.penWidth * 0.8)) return;
    if (pen.pts.length >= LIMITS.strokePoints * 4) return;
    pen.pts.push(v);
    const a = pen.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    a.setXYZ(pen.pts.length - 1, v.x, v.y, v.z);
    a.needsUpdate = true;
    pen.line.geometry.setDrawRange(0, pen.pts.length);
  }
  private endPen(): void {
    const pen = this.pen!;
    this.pen = null;
    this.helpers.remove(pen.line);
    pen.line.geometry.dispose();
    (pen.line.material as THREE.Material).dispose();
    let pts = smoothPts(pen.pts);
    if (pts.length < 2) return;
    // reduz para o limite do formato
    if (pts.length > LIMITS.strokePoints) {
      const k = (pts.length - 1) / (LIMITS.strokePoints - 1);
      pts = Array.from({ length: LIMITS.strokePoints }, (_, i) => pts[Math.round(i * k)]);
    }
    const o = pts[0].clone();
    const rel: number[] = [];
    for (const p of pts) rel.push(Math.round((p.x - o.x) * 100) / 100, Math.round((p.y - o.y) * 100) / 100, Math.round((p.z - o.z) * 100) / 100);
    const id = nextPartId(this.doc);
    const mi = this.materialIndex(this.paint);
    const part: StrokePart = { id, t: 'stroke', p: [Math.round(o.x * 1000) / 1000, Math.round(o.y * 1000) / 1000, Math.round(o.z * 1000) / 1000], pts: rel, w: this.penWidth };
    if (mi) part.m = mi;
    this.doc.parts.push(part);
    this.finish(pen.tx, 'pen');
  }
  private cancelPen(): void {
    if (!this.pen) return;
    this.helpers.remove(this.pen.line);
    this.pen.line.geometry.dispose();
    this.pen = null;
  }

  /* --------------------------------- medir --------------------------------- */

  private measurePoint(p: THREE.Vector3): void {
    const m = this.measure;
    if (!m.a || m.b) {
      m.a = p.clone();
      m.b = null;
      m.line.visible = false;
    } else {
      m.b = p.clone();
      const g = m.line.geometry as THREE.BufferGeometry;
      g.setFromPoints([m.a, m.b]);
      m.line.computeLineDistances();
      m.line.visible = true;
    }
    this.emit('measure');
  }
  clearMeasure(): void {
    this.measure.a = this.measure.b = null;
    this.measure.line.visible = false;
    this.emit('measure');
  }

  /* --------------------------------- quadro --------------------------------- */

  update(dt: number): void {
    void dt;
    this.cam.update();
    if (this.gizmo.root.visible) this.gizmo.fit(this.host.camera);
  }

  frameAll(): void {
    const b = new THREE.Box3();
    for (const v of this.views.values()) b.expandByObject(v);
    if (b.isEmpty()) b.set(new THREE.Vector3(-2, 0, -2), new THREE.Vector3(2, 2, 2));
    this.cam.frame(b);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.group.visible = on;
    this.helpers.visible = on;
    if (!on) {
      this.abortDrag();
      this.cancelPen();
      this.ptrs.clear();
      this.pinch = null;
    }
    this.placeGizmo();
  }

  dispose(): void {
    const cv = this.host.canvas;
    cv.removeEventListener('pointerdown', this.onDown);
    cv.removeEventListener('pointermove', this.onMove);
    cv.removeEventListener('pointerup', this.onUp);
    cv.removeEventListener('pointercancel', this.onCancel);
    cv.removeEventListener('wheel', this.onWheel);
    clearTimeout(this.longT);
    for (const v of this.views.values()) disposeTree(v);
    this.gizmo.dispose();
    for (const t of this.badgeTex.values()) t.dispose();
    this.gridHelper.geometry.dispose();
    void materialFor;
  }
}

const _bb = new THREE.Box3();
/** caixa do objeto sem o contorno de seleção */
export function expandBox(b: THREE.Box3, o: THREE.Object3D): void {
  o.updateWorldMatrix(true, true);
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh || m.userData.outline) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    _bb.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld);
    b.union(_bb);
  });
}

function refFor(A: THREE.Vector3): THREE.Vector3 {
  return Math.abs(A.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
}

/** suaviza o traço (média móvel leve) mantendo as pontas */
function smoothPts(p: THREE.Vector3[]): THREE.Vector3[] {
  if (p.length < 4) return p;
  const out = [p[0]];
  for (let i = 1; i < p.length - 1; i++) out.push(p[i - 1].clone().add(p[i].clone().multiplyScalar(2)).add(p[i + 1]).multiplyScalar(0.25));
  out.push(p[p.length - 1]);
  return out;
}

/** grade do construtor: linhas de 0,5 m e 1 m desenhadas no shader (sem serrilhado/moiré
 *  ao longe: some onde as linhas ficariam mais finas que um pixel) e esmaece na borda */
function makeGrid(size: number): THREE.Mesh {
  const g = new THREE.PlaneGeometry(size, size);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uHalf: { value: size / 2 } },
    vertexShader: `varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uHalf; varying vec2 vP;
      float line(vec2 p, float step){ vec2 c = p / step; vec2 w = fwidth(c); vec2 gr = abs(fract(c - 0.5) - 0.5) / max(w, vec2(1e-4));
        float l = 1.0 - min(min(gr.x, gr.y), 1.0); float fade = 1.0 - smoothstep(0.25, 0.6, max(w.x, w.y)); return l * fade; }
      void main(){ float a = max(line(vP, 0.5) * 0.10, line(vP, 1.0) * 0.26); a = max(a, line(vP, 5.0) * 0.38);
        float r = length(vP) / uHalf; a *= 1.0 - smoothstep(0.7, 1.0, r); if (a < 0.004) discard; gl_FragColor = vec4(1.0, 1.0, 1.0, a); }`,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.position.y = 0.012;
  mesh.renderOrder = 1;
  mesh.raycast = () => undefined;
  return mesh;
}
