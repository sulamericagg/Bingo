/* ============================================================
 *  BLOOP PINK — motor comum dos modos (loja e fábrica):
 *  renderizador + cena + luz por qualidade, jogador de 1ª pessoa (fpkit) com câmera
 *  de 3 modos (CamView) e o Bloop de papel, mira, carregar/soltar/tropeçar com física,
 *  sujeira no chão (manchas, poças, cacos) e esfregão.
 * ============================================================ */
import * as THREE from 'three';
import { AabbCollider, FpAim, FpCamera, FpController, fpTuning, HeldItem, type FpBox } from '../../3d/fpkit';
import { CamView } from '../../3d/camview';
import { mySpec, PaperChar } from '../../3d/paper';
import { FpsControls } from '../../ui/touch';
import { sfx } from '../../audio';
import type { Tier } from '../../core/quality';
import { Kit } from './mats';
import { Phys, type Loose } from './phys';
import { setTexQuality } from './tex';
import { productMesh } from './products';
import { PROD, type Product } from './catalog';
import { boxSideCanvas } from './tex';
import { rbox } from './shapes';

export type DirtKind = 'dirt' | 'spill' | 'glass' | 'mud';
export interface DirtSpot {
  x: number;
  z: number;
  a: number;
  k: DirtKind;
  mesh: THREE.Mesh;
  r: number;
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _ray = new THREE.Raycaster();
const _c0 = new THREE.Vector2(0, 0);

export class Engine {
  readonly r: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly kit: Kit;
  readonly phys = new Phys();
  readonly cv: HTMLCanvasElement;
  readonly input: FpsControls;
  readonly fp: FpController;
  readonly fpc: FpCamera;
  readonly camv: CamView;
  readonly aim = new FpAim();
  readonly me: PaperChar;
  readonly col = new AabbCollider([]);
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly amb: THREE.AmbientLight;
  ray = new THREE.Ray();
  /** objeto carregado (caixa, saco, produto) */
  carry: Loose | null = null;
  private carryMesh: THREE.Object3D | null = null;
  private held: HeldItem | null = null;
  private heldPivot = new THREE.Group();
  running = false;
  paused = false;
  time = 0;
  dirt: DirtSpot[] = [];
  private dirtGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private raf = 0;
  private last = 0;
  private ro: ResizeObserver;
  /** tropeço em andamento (s) */
  tripT = 0;
  /** chamado quando tropeça carregando algo */
  onTrip: ((l: Loose, vx: number, vz: number) => void) | null = null;
  frame: (dt: number) => void = () => {};
  private boxMats = new Map<string, THREE.Material[]>();
  readonly tier: Tier;

  constructor(
    readonly root: HTMLElement,
    tier: Tier,
    game: string,
  ) {
    this.tier = tier;
    setTexQuality(tier);
    const cv = document.createElement('canvas');
    cv.className = 'pk-cv';
    root.appendChild(cv);
    this.cv = cv;
    const r = new THREE.WebGLRenderer({ canvas: cv, antialias: tier >= 2, powerPreference: 'high-performance', stencil: false });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, [0.7, 0.85, 1.1, 1.5][tier]));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.95;
    r.outputColorSpace = THREE.SRGBColorSpace;
    if (tier >= 3) {
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    this.r = r;
    this.kit = new Kit(tier);
    this.kit.makeEnv(r);
    this.camera = new THREE.PerspectiveCamera(68, 1, 0.05, 140);
    this.scene.add(this.camera);
    this.scene.background = new THREE.Color('#bfe3ff');
    this.scene.fog = new THREE.Fog('#d8ecff', 30, 110);
    this.hemi = new THREE.HemisphereLight('#fff4f8', '#d8c4c8', 0.5);
    this.amb = new THREE.AmbientLight('#ffffff', 0.08);
    this.sun = new THREE.DirectionalLight('#fff3e0', 1.6);
    this.sun.position.set(-8, 14, 12);
    this.sun.target.position.set(0, 0, -6);
    if (tier >= 3) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(1024, 1024);
      const s = this.sun.shadow.camera;
      s.left = -14;
      s.right = 14;
      s.top = 14;
      s.bottom = -14;
      s.near = 1;
      s.far = 50;
      this.sun.shadow.bias = -0.0005;
      this.sun.shadow.normalBias = 0.03;
    }
    this.scene.add(this.hemi, this.amb, this.sun, this.sun.target);
    // jogador
    this.fp = new FpController(fpTuning('cozinha', { sprintMul: 1.75, radius: 0.27 }), this.col);
    this.fpc = new FpCamera(fpTuning('cozinha', { eye: 1.5, pitchMin: -1.35, pitchMax: 1.1, camMargin: 0.25 }));
    this.camv = new CamView(game, 'fp');
    this.me = new PaperChar(mySpec(), { radius: 0.42, cell: 128, shadow: true });
    this.scene.add(this.me.root);
    this.me.setVisible(this.camv.mode !== 'fp');
    this.camv.onChange = (m) => {
      this.me.setVisible(m !== 'fp');
      this.camera.fov = m === 'fp' ? 68 : 60;
      this.camera.updateProjectionMatrix();
      this.reattachCarry();
    };
    this.camera.add(this.heldPivot);
    this.input = new FpsControls(root, { joystick: { zoneTop: 0.2, zoneWidth: 0.42 }, look: { mouse: true } });
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(root);
    this.resize();
  }

  resize(): void {
    const w = this.root.clientWidth || window.innerWidth;
    const h = this.root.clientHeight || window.innerHeight;
    this.r.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = (this.camv.mode === 'fp' ? 68 : 60) * (w / h < 1.2 ? 1.25 : 1);
    this.camera.updateProjectionMatrix();
  }

  setColliders(boxes: FpBox[]): void {
    this.col.boxes = boxes;
  }

  start(): void {
    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      if (this.paused) {
        this.r.render(this.scene, this.camera);
        return;
      }
      this.time += dt;
      try {
        this.frame(dt);
      } catch (e) {
        console.warn('[pink]', e);
      }
      this.r.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /* ------------------------------ jogador ------------------------------ */
  /** movimento + câmera; `lock` = parado (menus, caixa) */
  movePlayer(dt: number, lock: boolean, slip = 0): void {
    const [lx, ly] = this.input.consumeLook(dt);
    if (!lock) this.fpc.look(lx, ly);
    let [mx, my] = lock ? [0, 0] : this.input.dir();
    if (this.tripT > 0) {
      this.tripT -= dt;
      mx = my = 0;
    }
    const heavy = this.carry && this.carry.kind === 'box' ? 0.9 : 1;
    this.fp.tune.speed = 3.1 * heavy;
    this.fp.accelOverride = slip > 0 ? 2.5 : null;
    this.fp.steer(dt, mx, my, this.fpc.yaw, this.running && !lock);
    this.fp.move(dt);
    // câmera
    const fpMode = this.camv.mode === 'fp';
    if (fpMode) {
      this.fpc.extraRoll = this.tripT > 0 ? Math.sin(this.tripT * 12) * 0.12 : 0;
      this.fpc.extraPitch = this.tripT > 0 ? -0.35 * Math.min(1, this.tripT) : 0;
      this.fpc.apply(this.camera, dt, this.fp, this.col);
    } else {
      this.camv.pose({ x: this.fp.x, y: this.fp.y, z: this.fp.z, yaw: this.fpc.yaw + Math.PI, pitch: this.fpc.pitch, eye: 1.25, dist: 3.6, smooth: 0.08, dt, block: (x0, _y0, z0, x1, _y1, z1) => this.camBlock(x0, z0, x1, z1) }, this.camera);
    }
    this.me.root.position.set(this.fp.x, this.fp.y, this.fp.z);
    this.me.update(dt, this.camera, { yaw: this.fpc.yaw + Math.PI, speed: Math.hypot(this.fp.vx, this.fp.vz), act: -1, hurt: this.tripT > 0, lean: this.carry ? 0.1 : 0 });
    // mira do centro da tela
    this.camera.updateMatrixWorld();
    _ray.setFromCamera(_c0, this.camera);
    this.ray.copy(_ray.ray);
    if (!fpMode) {
      // 3ª pessoa: a mira sai do Bloop, não da câmera atrás dele
      const d = this.ray.direction;
      this.ray.origin.set(this.fp.x, this.fp.y + 1.35, this.fp.z);
      if (this.camv.mode === 'front') d.set(-Math.sin(this.fpc.yaw) * Math.cos(this.fpc.pitch), Math.sin(this.fpc.pitch), -Math.cos(this.fpc.yaw) * Math.cos(this.fpc.pitch));
    }
    this.updateCarry(dt);
  }
  private camBlock(x0: number, z0: number, x1: number, z1: number): number {
    let k = 1;
    const n = 12;
    for (let i = 1; i <= n; i++) {
      const tt = i / n;
      if (!this.col.isFree(x0 + (x1 - x0) * tt, z0 + (z1 - z0) * tt, 0.15)) {
        k = (i - 1) / n;
        break;
      }
    }
    return k;
  }
  /** ponto do chão sob a mira (y = 0), até `max` m */
  floorHit(max = 4): THREE.Vector3 | null {
    const d = this.ray.direction;
    const o = this.ray.origin;
    if (d.y > -0.05) return null;
    const tt = -o.y / d.y;
    if (tt > max) return null;
    return _v2.set(o.x + d.x * tt, 0, o.z + d.z * tt);
  }
  /** posição de tela (px) de um ponto do mundo; null = atrás da câmera */
  toScreen(x: number, y: number, z: number): [number, number] | null {
    _v.set(x, y, z).project(this.camera);
    if (_v.z > 1) return null;
    return [(_v.x * 0.5 + 0.5) * this.root.clientWidth, (-_v.y * 0.5 + 0.5) * this.root.clientHeight];
  }

  /* ------------------------------ caixas e objetos ------------------------------ */
  /** material das 6 faces da caixa de papelão (lateral com logo e faixa da cor do produto) */
  private boxMaterials(p: Product | null, open: boolean): THREE.Material[] {
    const key = (p?.id ?? '-') + (open ? 'o' : '');
    let m = this.boxMats.get(key);
    if (m) return m;
    const side = this.kit.canvasMat('box-' + (p?.color ?? 'plain'), boxSideCanvas(p?.color ?? '#c99a62'), { rough: 0.95 });
    const top = this.kit.surf('cardboard', 'cardboard', { rough: 1, envK: 0.2, uvMeters: false });
    m = [side, side, top, top, side, side];
    this.boxMats.set(key, m);
    return m;
  }
  /** malha de caixa de papelão (aberta: abas pra cima e produtos aparecendo) */
  boxMesh(p: Product | null, w = 0.5, h = 0.34, d = 0.38, open = false, n = 0): THREE.Group {
    const g = new THREE.Group();
    const mats = this.boxMaterials(p, false);
    if (!open) {
      const body: THREE.Mesh = new THREE.Mesh(rbox(w, h, d, 0.012, 1), mats);
      // RoundedBox tem grupos? usa material único se não tiver
      if (!(body.geometry as THREE.BufferGeometry).groups.length) body.material = mats[0];
      body.castShadow = true;
      g.add(body);
      // fita
      const tape = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.004, d + 0.004), this.kit.plain('tape', '#d8c8a0', 0.4, 0, { envK: 1 }));
      tape.position.y = h / 2 + 0.001;
      g.add(tape);
    } else {
      const card = mats[2];
      const t = 0.008;
      const add = (gw: number, gh: number, gd: number, x: number, y: number, z: number, rx = 0, rz = 0, mat: THREE.Material = mats[0]) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(gw, gh, gd), mat);
        m.position.set(x, y, z);
        m.rotation.set(rx, 0, rz);
        m.castShadow = true;
        g.add(m);
      };
      add(w, t, d, 0, -h / 2 + t / 2, 0, 0, 0, card);
      add(t, h, d, -w / 2, 0, 0);
      add(t, h, d, w / 2, 0, 0);
      add(w, h, t, 0, 0, -d / 2);
      add(w, h, t, 0, 0, d / 2);
      // abas abertas
      add(w, t, d * 0.48, 0, h / 2 + d * 0.2, d / 2 + d * 0.06, -1.15, 0, card);
      add(w, t, d * 0.48, 0, h / 2 + d * 0.2, -d / 2 - d * 0.06, 1.15, 0, card);
      add(w * 0.46, t, d, -w / 2 - w * 0.08, h / 2 + w * 0.17, 0, 0, 1.2, card);
      add(w * 0.46, t, d, w / 2 + w * 0.08, h / 2 + w * 0.17, 0, 0, -1.2, card);
      // produtos visíveis dentro
      if (p && n > 0) {
        const k = Math.min(n, 6);
        for (let i = 0; i < k; i++) {
          const pm = productMesh(this.kit, p);
          pm.position.set(-w * 0.3 + (i % 3) * w * 0.3, -h / 2 + 0.01, -d * 0.18 + Math.floor(i / 3) * d * 0.36);
          const s = Math.min(1.2, (h * 0.95) / Math.max(0.05, PRODS_H(p)));
          pm.scale.setScalar(Math.min(1, s));
          g.add(pm);
        }
      }
    }
    return g;
  }
  /** cria uma caixa solta com física */
  spawnBox(pid: string | null, n: number, x: number, y: number, z: number, o: { open?: boolean; vel?: THREE.Vector3; ry?: number; kind?: 'box' | 'parcel'; data?: Record<string, unknown> } = {}): Loose {
    const p = pid ? PROD[pid] : null;
    const mesh = this.boxMesh(p, 0.5, 0.34, 0.38, !!o.open, n);
    this.scene.add(mesh);
    return this.phys.add(o.kind ?? 'box', mesh, new THREE.Vector3(0.25, 0.17, 0.19), new THREE.Vector3(x, y, z), { mass: 2, vel: o.vel, ry: o.ry ?? (Math.random() - 0.5) * 0.6, data: { p: pid, n, open: !!o.open, ...(o.data ?? {}) } });
  }
  /** refaz a malha da caixa (abriu, mudou a quantidade) */
  refreshBox(l: Loose): void {
    const p = l.data.p ? PROD[l.data.p as string] : null;
    const mesh = this.boxMesh(p, 0.5, 0.34, 0.38, !!l.data.open, (l.data.n as number) ?? 0);
    const old = l.mesh;
    mesh.position.copy(old.position);
    mesh.quaternion.copy(old.quaternion);
    const par = old.parent;
    old.removeFromParent();
    disposeGroupGeo(old);
    l.mesh = mesh;
    if (par) par.add(mesh);
    if (this.carry === l) {
      this.carryMesh = mesh;
      this.reattachCarry();
    }
  }
  spawnTrash(x: number, z: number): Loose {
    const g = new THREE.Group();
    // saco plástico: corpo gordinho (torno) com rugas, gargalo torcido e duas "orelhas" do nó
    const prof: THREE.Vector2[] = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      const r = Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.29 * (1 - Math.max(0, t - 0.82) * 2.6) + 0.02;
      prof.push(new THREE.Vector2(Math.max(0.025, r), t * 0.56 - 0.26));
    }
    const geo = new THREE.LatheGeometry(prof, 20);
    const p = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i);
      const vy = p.getY(i);
      const vz = p.getZ(i);
      const a = Math.atan2(vz, vx);
      const k = 1 + Math.sin(a * 5 + vy * 9) * 0.05 + Math.sin(a * 11 - vy * 20) * 0.025;
      p.setXYZ(i, vx * k * 1.05, vy - (vy < -0.2 ? (vy + 0.2) * 0.4 : 0), vz * k * 0.92);
    }
    geo.computeVertexNormals();
    const mat = this.kit.plain('trashBag', '#30323a', 0.28, 0, { envK: 1.4 });
    const bag = new THREE.Mesh(geo, mat);
    bag.castShadow = true;
    bag.position.y = 0.02;
    const ear = new THREE.SphereGeometry(0.05, 8, 6);
    ear.scale(1.4, 0.6, 0.8);
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(ear, mat);
      e.position.set(s * 0.06, 0.33, 0);
      e.rotation.z = s * 0.6;
      g.add(e);
    }
    g.add(bag);
    this.scene.add(g);
    return this.phys.add('trash', g, new THREE.Vector3(0.27, 0.28, 0.24), new THREE.Vector3(x, 0.3, z), { mass: 1.5 });
  }
  /** entulho da parede quebrada (vai para a lixeira como lixo) */
  spawnRubble(x: number, z: number, vel?: THREE.Vector3): Loose {
    const g = new THREE.Group();
    const geo = new THREE.DodecahedronGeometry(0.2, 0);
    const p = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (1.1 + Math.sin(i * 1.7) * 0.25), p.getY(i) * 0.6, p.getZ(i) * (0.9 + Math.cos(i * 2.3) * 0.2));
    geo.computeVertexNormals();
    const brick = this.kit.plain('rubbleBrick', '#b0644a', 0.9);
    const mortar = this.kit.plain('rubbleMortar', '#d8d0c4', 1);
    const m1 = new THREE.Mesh(geo, brick);
    m1.castShadow = true;
    const m2 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.16), mortar);
    m2.position.set(0.08, 0.08, 0.02);
    m2.rotation.set(0.3, 0.6, 0.2);
    g.add(m1, m2);
    this.scene.add(g);
    return this.phys.add('trash', g, new THREE.Vector3(0.22, 0.13, 0.18), new THREE.Vector3(x, 0.4, z), { mass: 2, vel, spin: 4, data: { rubble: true } });
  }
  /** lascas/poeira (somem) */
  chips(x: number, y: number, z: number, color: string, n = 6): void {
    const m = this.kit.plain('chip' + color, color, 0.9);
    for (let i = 0; i < n; i++) {
      const g = new THREE.TetrahedronGeometry(0.025 + Math.random() * 0.035);
      const mesh = new THREE.Mesh(g, m);
      this.scene.add(mesh);
      this.phys.add('shard', mesh, new THREE.Vector3(0.02, 0.02, 0.02), new THREE.Vector3(x, y, z), { mass: 0.05, vel: new THREE.Vector3((Math.random() - 0.5) * 3, 0.5 + Math.random() * 2, (Math.random() - 0.5) * 3), spin: 20, life: 4 + Math.random() * 3 });
    }
  }
  spawnItem(pid: string, x: number, y: number, z: number, vel?: THREE.Vector3): Loose {
    const p = PROD[pid];
    const m = productMesh(this.kit, p);
    const holder = new THREE.Group();
    const h = PRODS_H(p);
    m.position.y = -h / 2;
    holder.add(m);
    this.scene.add(holder);
    const [w, , d] = dims(p);
    return this.phys.add('item', holder, new THREE.Vector3(Math.max(0.02, w / 2), Math.max(0.02, h / 2), Math.max(0.02, d / 2)), new THREE.Vector3(x, y, z), { mass: 0.3, vel, spin: 8, data: { p: pid, n: 1, open: true } });
  }
  /** cacos de vidro (somem) */
  shards(x: number, z: number, color: string): void {
    const m = this.kit.glass('shard', color, 0.6);
    for (let i = 0; i < 7; i++) {
      const g = new THREE.TetrahedronGeometry(0.02 + Math.random() * 0.025);
      const mesh = new THREE.Mesh(g, m);
      this.scene.add(mesh);
      this.phys.add('shard', mesh, new THREE.Vector3(0.015, 0.015, 0.015), new THREE.Vector3(x + (Math.random() - 0.5) * 0.2, 0.15, z + (Math.random() - 0.5) * 0.2), { mass: 0.05, vel: new THREE.Vector3((Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 3), spin: 20, life: 14 + Math.random() * 6 });
    }
  }

  /** pega um objeto solto (vai para a mão) */
  pickUp(l: Loose): void {
    if (this.carry) return;
    this.phys.remove(l);
    this.carry = l;
    this.carryMesh = l.mesh;
    this.reattachCarry();
    sfx.play('pick');
  }
  private reattachCarry(): void {
    const m = this.carryMesh;
    if (!m) return;
    m.removeFromParent();
    m.position.set(0, 0, 0);
    m.quaternion.identity();
    m.rotation.set(0, 0, 0);
    if (this.camv.mode === 'fp') {
      const box = this.carry?.kind === 'box' || this.carry?.kind === 'parcel';
      this.heldPivot.add(m);
      this.held = new HeldItem(m, { base: box ? [0.02, -0.5, -0.78] : this.carry?.kind === 'trash' ? [0.18, -0.45, -0.6] : [0.2, -0.24, -0.42], rot: box ? [0.12, 0.25, 0] : [0, 0.3, 0], lag: 0.7, bob: 1.2 });
    } else {
      this.held = null;
      this.scene.add(m);
    }
  }
  /* ferramenta na mão (marreta, borrifador...) quando as mãos estão livres */
  private tool: HeldItem | null = null;
  private toolObj: THREE.Object3D | null = null;
  setTool(o: THREE.Object3D | null): void {
    if (o === this.toolObj) return;
    this.toolObj?.removeFromParent();
    this.toolObj = o;
    this.tool = null;
    if (o) {
      this.heldPivot.add(o);
      this.tool = new HeldItem(o, { base: [0.26, -0.32, -0.5], rot: [0.2, -0.2, 0.1], lag: 0.8, bob: 1.1 });
    }
  }
  swingTool(): void {
    this.tool?.swing('swing', 0.34);
  }
  private updateCarry(dt: number): void {
    if (this.tool && this.toolObj) {
      this.toolObj.visible = !this.carryMesh && this.camv.mode === 'fp';
      this.tool.update(dt, this.fp.speedK, this.fpc.lookDX, this.fpc.lookDY);
    }
    const m = this.carryMesh;
    if (!m) return;
    if (this.held && this.camv.mode === 'fp') this.held.update(dt, this.fp.speedK, this.fpc.lookDX, this.fpc.lookDY);
    else {
      const yaw = this.fpc.yaw;
      m.position.set(this.fp.x - Math.sin(yaw) * 0.45, this.fp.y + 0.85 + Math.sin(this.time * 9) * 0.01 * this.fp.speedK, this.fp.z - Math.cos(yaw) * 0.45);
      m.rotation.set(0, yaw, 0);
    }
  }
  /** solta na frente (com velocidade) */
  dropCarry(vel?: THREE.Vector3, at?: THREE.Vector3): Loose | null {
    const l = this.carry;
    if (!l) return null;
    const m = this.carryMesh!;
    m.removeFromParent();
    this.scene.add(m);
    const yaw = this.fpc.yaw;
    const p = at ?? new THREE.Vector3(this.fp.x - Math.sin(yaw) * 0.7, 0.9, this.fp.z - Math.cos(yaw) * 0.7);
    // não larga dentro da parede
    if (!this.col.isFree(p.x, p.z, 0.2)) p.set(this.fp.x, 0.9, this.fp.z);
    l.body.position.set(p.x, p.y, p.z);
    l.body.quaternion.setFromEuler(0, yaw, 0);
    l.body.velocity.set(vel?.x ?? 0, vel?.y ?? 0, vel?.z ?? 0);
    l.body.angularVelocity.set(0, 0, 0);
    l.body.wakeUp();
    this.phys.world.addBody(l.body);
    this.phys.items.push(l);
    this.carry = null;
    this.carryMesh = null;
    this.held = null;
    sfx.play('drop');
    return l;
  }
  /** some com o que está na mão (colocou na prateleira, jogou no lixo) */
  consumeCarry(): void {
    const m = this.carryMesh;
    if (m) {
      m.removeFromParent();
      disposeGroupGeo(m);
    }
    this.carry = null;
    this.carryMesh = null;
    this.held = null;
  }
  removeLoose(l: Loose): void {
    this.phys.remove(l);
    l.mesh.removeFromParent();
    disposeGroupGeo(l.mesh);
  }
  /** tropeçou: cai, larga o que carrega para a frente */
  trip(): void {
    if (this.tripT > 0) return;
    this.tripT = 0.9;
    this.fpc.addShake(0.8);
    this.fpc.kick(1);
    sfx.play('trip');
    const l = this.carry;
    if (l) {
      const yaw = this.fpc.yaw;
      const vx = -Math.sin(yaw) * 3.2 + this.fp.vx * 0.4;
      const vz = -Math.cos(yaw) * 3.2 + this.fp.vz * 0.4;
      this.dropCarry(new THREE.Vector3(vx, 2.4, vz), new THREE.Vector3(this.fp.x - Math.sin(yaw) * 0.6, 1.0, this.fp.z - Math.cos(yaw) * 0.6));
      l.body.angularVelocity.set(-Math.cos(yaw) * 6, 0, Math.sin(yaw) * 6);
      this.onTrip?.(l, vx, vz);
    }
    this.fp.vx *= 0.2;
    this.fp.vz *= 0.2;
    this.running = false;
  }

  /* ------------------------------ sujeira ------------------------------ */
  addDirt(x: number, z: number, k: DirtKind, a = 0.4): DirtSpot {
    // junta com uma mancha perto do mesmo tipo
    for (const d of this.dirt)
      if (d.k === k && Math.hypot(d.x - x, d.z - z) < d.r * 0.6) {
        d.a = Math.min(1.5, d.a + a);
        this.styleDirt(d);
        return d;
      }
    const v = Math.floor(Math.random() * 4);
    const mesh = new THREE.Mesh(this.dirtGeo, this.kit.stainMat(k, v));
    const r = k === 'spill' ? 0.9 : k === 'glass' ? 0.7 : k === 'mud' ? 0.9 : 0.75 + Math.random() * 0.4;
    mesh.position.set(x, 0.008 + this.dirt.length * 0.0002, z);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    mesh.renderOrder = 1;
    this.scene.add(mesh);
    const d: DirtSpot = { x, z, a, k, mesh, r };
    this.dirt.push(d);
    this.styleDirt(d);
    return d;
  }
  private styleDirt(d: DirtSpot): void {
    const s = d.r * (0.7 + Math.min(1, d.a) * 0.5);
    d.mesh.scale.set(s, 1, s);
    // opacidade por mancha: a geometria é compartilhada, então usa a escala + material compartilhado; some ao limpar
    d.mesh.visible = d.a > 0.04;
  }
  /** limpa (esfregão) a mancha mais perto do ponto */
  cleanAt(x: number, z: number, amt: number): DirtSpot | null {
    let best: DirtSpot | null = null;
    let bd = 1e9;
    for (const d of this.dirt) {
      const dd = Math.hypot(d.x - x, d.z - z);
      if (dd < d.r * 0.8 + 0.35 && dd < bd) {
        bd = dd;
        best = d;
      }
    }
    if (!best) return null;
    best.a -= amt;
    if (best.a <= 0.04) {
      best.mesh.removeFromParent();
      this.dirt.splice(this.dirt.indexOf(best), 1);
    } else this.styleDirt(best);
    return best;
  }
  /** convidado do grupo: a sujeira é a do anfitrião ([x, z, a, tipo]) */
  syncDirt(rows: [number, number, number, number][]): void {
    const K: DirtKind[] = ['dirt', 'spill', 'glass', 'mud'];
    const used = new Set<DirtSpot>();
    for (const r of rows) {
      if (!Array.isArray(r) || r.length < 4) continue;
      const [x, z, a, ki] = r;
      if (!Number.isFinite(x + z + a)) continue;
      const k = K[ki] ?? 'dirt';
      let d = this.dirt.find((q) => !used.has(q) && q.k === k && Math.abs(q.x - x) < 0.05 && Math.abs(q.z - z) < 0.05);
      if (!d) {
        const v = Math.floor(Math.random() * 4);
        const mesh = new THREE.Mesh(this.dirtGeo, this.kit.stainMat(k, v));
        const rr = k === 'spill' ? 0.9 : k === 'glass' ? 0.7 : k === 'mud' ? 0.9 : 0.95;
        mesh.position.set(x, 0.008 + this.dirt.length * 0.0002, z);
        mesh.rotation.y = Math.random() * Math.PI * 2;
        mesh.renderOrder = 1;
        this.scene.add(mesh);
        d = { x, z, a, k, mesh, r: rr };
        this.dirt.push(d);
      }
      d.a = a;
      this.styleDirt(d);
      used.add(d);
    }
    for (const d of [...this.dirt])
      if (!used.has(d)) {
        d.mesh.removeFromParent();
        this.dirt.splice(this.dirt.indexOf(d), 1);
      }
  }
  dirtAt(x: number, z: number): DirtSpot | null {
    for (const d of this.dirt) if (Math.hypot(d.x - x, d.z - z) < d.r * 0.55) return d;
    return null;
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.input.dispose();
    this.phys.dispose();
    this.me.dispose();
    markShared();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && !SHARED.has(m.geometry)) m.geometry.dispose();
    });
    this.kit.dispose();
    this.r.dispose();
    this.r.forceContextLoss();
    this.cv.remove();
  }
}

import { SHAPE_DIM } from './data';
import { shapeGeo } from './products';
const SHARED = new Set<THREE.BufferGeometry>();
function PRODS_H(p: Product): number {
  return SHAPE_DIM[p.shape][1];
}
function dims(p: Product): [number, number, number] {
  return SHAPE_DIM[p.shape];
}
/** geometrias compartilhadas (formas de produto) não são liberadas */
export function markShared(): void {
  for (const s of Object.keys(SHAPE_DIM) as Product['shape'][]) for (const g of shapeGeo(s).values()) SHARED.add(g);
}
function disposeGroupGeo(o: THREE.Object3D): void {
  markShared();
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    if (m.geometry && !SHARED.has(m.geometry)) m.geometry.dispose();
  });
}
