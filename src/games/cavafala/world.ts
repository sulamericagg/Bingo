/* ============================================================
 *  CAVA & FALA — MOTOR DA PARTIDA (compartilhado pelos 2 modos).
 *  Renderer/cena/câmera, terreno, física, Bloops (você, ajudantes,
 *  rivais), engenhocas (estruturas, ferramentas, "armas" de espuma),
 *  projéteis, animação de construção, mão em 1ª pessoa, HUD e entrada.
 *  Os modos (restore.ts / arena.ts) só cuidam das regras.
 * ============================================================ */
import * as THREE from 'three';
import { audio } from '../../core/audio';
import { tap } from '../../core/haptics';
import { QualityGovernor, type Tier } from '../../core/quality';
import { sfx } from '../../3d/common/sfx';
import { handColors, Forearm } from '../../3d/common/hand';
import { t } from '../../i18n';
import { notify } from '../../ui/notify';
import { FpsControls } from '../../ui/touch';
import { BloopModel, disposeBloopCache, lam, type Hat } from './bloop';
import { M, MATS, emptyInv, matColor, matName, type Inv, type Theme } from './data';
import { Fx } from './fx';
import { GADGETS, gadgetById, buildModel, disposeGadgetCache, canPay, costOf, fullName, missing, modStats, noMods, pay, type Built, type GDef, type Mods } from './gadgets';
import { Hud, SVG } from './hud';
import { OBox, makeBody, rayBox, stepBody, type Body, type PhysWorld } from './phys';
import { norm, parseBest, type Parsed } from './parser';
import { Maker } from './maker';
import { disposeCreationCache } from './creation';
import { isCommand } from '../../../shared/cavagen';
import { cavaSave, discover, persist } from './save';
import type { Terrain } from './terrain';
import type { Town } from './town';
import { askMicPermission, listen, listenContinuous, openAppSettings, voiceKind, withTimeout, type ContSession, type VoiceFail, type VoiceSession } from './voice';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const TAU = Math.PI * 2;
export const EYE = 1.45;

/* ---------------------------- tipos ---------------------------- */
export interface Slot {
  g: GDef;
  mods: Mods;
  uses: number;
  thumb: string;
  /** lanterna ligada etc. */
  on: boolean;
}

export interface Actor {
  id: number;
  name: string;
  color: string;
  isPlayer: boolean;
  helper: boolean;
  body: Body;
  yaw: number;
  pitch: number;
  model: BloopModel | null;
  inv: Inv;
  slots: Slot[];
  sel: number;
  alive: boolean;
  pct: number;
  shieldT: number;
  shieldCd: number;
  trapT: number;
  slowT: number;
  mounted: boolean;
  stunT?: number;
  cart?: THREE.Object3D | null;
  fuel: number;
  hook: THREE.Vector3 | null;
  digCd: number;
  useCd: number;
  lastHit: Actor | null;
  /** entrada (bots preenchem; jogador vem dos controles) */
  move: THREE.Vector3;
  wantJump: boolean;
  held: THREE.Object3D | null;
  shieldMesh: THREE.Mesh | null;
  bubbleMesh: THREE.Mesh | null;
  heldKey: string;
  ai: unknown;
  teleCd: number;
  place: number;
  outT: number;
  /** online: id na rede (jogador = id do jogador; bot = 'b<n>') */
  nid?: string;
  /** online: boneco de outro aparelho (posição vem da rede, sem física aqui) */
  remote?: boolean;
  snaps?: Snap[];
  /** online: bandeiras do último retrato (1 escudo · 2 bolha · 4 montado) */
  netF?: number;
  /** online: engenhoca na mão (id) */
  netG?: string;
  /** online: quando falou por último (balão) */
  voiceAt?: number;
}

/** retrato de um Bloop de outro aparelho (interpolação) */
export interface Snap {
  t: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

/** online: o que o motor manda para a rede (net.ts / online.ts) */
export interface WorldNet {
  dig(x: number, y: number, z: number, r: number, p: number): void;
  build(a: Actor, g: GDef, mods: Mods, pos: THREE.Vector3, yaw: number, tp: THREE.Vector3 | null): void;
  fire(a: Actor, s: Slot, o: THREE.Vector3, d: THREE.Vector3): void;
  hit(target: Actor, dx: number, dy: number, dz: number, power: number, by: Actor): void;
  voice(a: Actor, text: string): void;
  /** objeto falado (forma compacta) — mesmo uid = troca (IA melhorou / Refazer) */
  obj?(a: Actor, uid: string, spec: unknown, pos: THREE.Vector3, yaw: number, text: string): void;
}
/** atraso da interpolação dos Bloops remotos (ms) */
const INTERP_MS = 140;

export interface Struct {
  g: GDef;
  mods: Mods;
  group: THREE.Group;
  built: Built;
  cols: { box: OBox; lx: number; ly: number; lz: number }[];
  pos: THREE.Vector3;
  yaw: number;
  power: number;
  scale: number;
  owner: Actor | null;
  pair: Struct | null;
  age: number;
  vel: THREE.Vector3;
  hover: number;
  light: THREE.PointLight | null;
  done: boolean;
  dead: boolean;
}

interface Proj {
  p: THREE.Vector3;
  v: THREE.Vector3;
  kind: string;
  power: number;
  owner: Actor;
  life: number;
  r: number;
  mesh: THREE.Object3D;
  bounces: number;
  homing: boolean;
  trap: boolean;
  slow: boolean;
  grav: number;
  confetti: boolean;
}

interface BuildAnim {
  group: THREE.Group;
  parts: { m: THREE.Object3D; to: THREE.Vector3; from: THREE.Vector3; s: number; delay: number; landed: boolean }[];
  t: number;
  dur: number;
  tool: boolean;
  actor: Actor;
  onDone: () => void;
}

interface Grow {
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
  yaw: number;
  mat: number;
  t: number;
  dur: number;
  twin: boolean;
  owner: Actor;
}

interface Bot2 {
  o: THREE.Group;
  p: THREE.Vector3;
  t: number;
  owner: Actor;
  target: THREE.Vector3;
}

interface Tornado {
  o: THREE.Group;
  p: THREE.Vector3;
  v: THREE.Vector3;
  t: number;
  owner: Actor;
  power: number;
}

export interface ModeCtl {
  update(dt: number): void;
  status(): string;
  onDig?(a: Actor, got: Inv, at: THREE.Vector3): void;
  onCreate?(a: Actor, g: GDef, mods: Mods, st: Struct | null): void;
  onUse?(a: Actor, s: Slot, at: THREE.Vector3 | null): void;
  onOut?(a: Actor): void;
  /** prédio/alvo que a mira está olhando (barra de progresso) */
  aimInfo?(hit: THREE.Vector3 | null): { name: string; v: number } | null;
  tutorialTarget?(): THREE.Vector3 | null;
  dispose?(): void;
}

export interface WorldOpts {
  arena: boolean;
  theme: Theme | null;
  tier: Tier;
  T: Terrain;
  town: Town | null;
  spawn: THREE.Vector3;
  waterY: number;
  bounds: PhysWorld['bounds'];
  onPause(): void;
}

/* ------------------------ pá básica (sempre no slot 1) ------------------------ */
export const PAZINHA: GDef = {
  id: 'pazinha',
  kind: 'tool',
  beh: 'shovel',
  main: '#c8d0e0',
  acc: '#8a5a3a',
  name: () => t('cavafala.g.pazinha', 'Pazinha'),
  desc: () => t('cavafala.gd.pazinha', 'Cava terra, areia e argila'),
  words: [],
  cost: {},
  parts: () => [
    { s: 'cyl', d: [0.022, 0.026, 0.34], p: [0, 0, -0.15], r: [Math.PI / 2, 0, 0], c: 'acc' },
    { s: 'box', d: [0.17, 0.025, 0.2], p: [0, -0.015, -0.41], r: [-0.12, 0, 0], c: 'main' },
    { s: 'box', d: [0.05, 0.04, 0.05], p: [0, 0, -0.31], c: 'metal' },
    { s: 'sph', d: [0.04, 1, 1, 1], p: [0, 0, 0.03], c: 'acc' },
  ],
};

const V1 = new THREE.Vector3();
const V2 = new THREE.Vector3();
const V3 = new THREE.Vector3();
const FWD = new THREE.Vector3();
const RIGHT = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const SRGB = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB[i] = Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
}

function wq(tier: Tier) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  return {
    pr: [Math.min(dpr, 0.65), Math.min(dpr, 0.85), Math.min(dpr, 1.1), Math.min(dpr, 1.5)][tier],
    shadows: tier >= 3,
    budget: [1, 2, 3, 4][tier],
    particles: [0.35, 0.6, 0.85, 1][tier],
    lights: [0, 0, 3, 5][tier],
    far: [70, 85, 110, 140][tier],
  };
}

/* ================================================================ */
export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly cam: THREE.PerspectiveCamera;
  private handScene = new THREE.Scene();
  private handRig = new THREE.Group();
  private hand = new THREE.Group();
  private mitt: THREE.Mesh;
  private arm: Forearm;
  readonly T: Terrain;
  readonly town: Town | null;
  readonly phys: PhysWorld;
  readonly fx: Fx;
  readonly hud: Hud;
  readonly ctl: FpsControls;
  readonly actors: Actor[] = [];
  readonly me: Actor;
  readonly structs: Struct[] = [];
  /** objetos falados (criação livre) */
  readonly objs: Maker;
  private projs: Proj[] = [];
  private builds: BuildAnim[] = [];
  private grows: Grow[] = [];
  private digbots: Bot2[] = [];
  private tornados: Tornado[] = [];
  mode: ModeCtl | null = null;
  /** online (null = offline) */
  net: WorldNet | null = null;
  /** chamado a cada passo da simulação (online: manda o retrato) */
  onStep: ((dt: number) => void) | null = null;
  private teleFar: THREE.Vector3 | null = null;
  private teleForce: THREE.Vector3 | null = null;
  readonly theme: Theme | null;
  readonly arena: boolean;
  time = 0;
  paused = false;
  /** quanto do dia já passou (0..1), modos usam */
  dayK = 0;
  private dead = false;
  private raf = 0;
  private last = 0;
  private gov: QualityGovernor;
  private q: ReturnType<typeof wq>;
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private skyCol = new THREE.Color();
  private digHeld = false;
  private useHeld = false;
  private useEdge = false;
  private jumpQ = false;
  private jumpHeld = false;
  private voice: VoiceSession | null = null;
  private voiceBusy = false;
  private thumbs = new Map<string, string>();
  private thumbRT: THREE.WebGLRenderTarget | null = null;
  private thumbScene: THREE.Scene | null = null;
  private digAnim = 0;
  private useAnim = 0;
  private bob = 0;
  private hookLine: THREE.Line;
  private flash: THREE.SpotLight | null = null;
  private nextId = 1;
  private onPause: () => void;
  private resizeObs: ResizeObserver;
  private lights = 0;
  private tipShown = new Set<string>();
  private aimHit: THREE.Vector3 | null = null;
  private keyH: (e: KeyboardEvent) => void;
  private keyU: (e: KeyboardEvent) => void;
  private stepT = 0;
  /** chamado quando a criação por voz/texto resolve (testes) */
  lastParsed: Parsed | null = null;
  lastCreated = '';
  created = 0;

  constructor(
    readonly root: HTMLElement,
    o: WorldOpts,
  ) {
    this.arena = o.arena;
    this.theme = o.theme;
    this.T = o.T;
    this.town = o.town;
    this.onPause = o.onPause;
    this.gov = new QualityGovernor({ initial: o.tier, emit: false, persist: false, onChange: (tr) => this.applyQ(tr) });
    this.q = wq(this.gov.tier);
    const r = new THREE.WebGLRenderer({ antialias: this.gov.tier >= 2, powerPreference: 'high-performance' });
    r.setPixelRatio(this.q.pr);
    r.shadowMap.enabled = this.q.shadows;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    root.appendChild(r.domElement);
    this.renderer = r;
    this.cam = new THREE.PerspectiveCamera(74, 1, 0.08, this.q.far + 60);
    this.scene.add(this.cam);
    // luzes
    this.hemi = new THREE.HemisphereLight('#ffffff', '#8a6a4a', 1.3);
    this.sun = new THREE.DirectionalLight('#fff3d6', 1.7);
    this.sun.position.set(28, 50, 18);
    if (this.q.shadows) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(1024, 1024);
      const sc = this.sun.shadow.camera;
      sc.left = sc.bottom = -36;
      sc.right = sc.top = 36;
      sc.near = 1;
      sc.far = 140;
    }
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.scene.add(this.T.group);
    if (this.town) {
      this.scene.add(this.town.group);
    }
    this.phys = { terrain: this.T, boxes: [], bounds: o.bounds, waterY: o.waterY, gravity: 19 };
    this.refreshBoxes();
    this.fx = new Fx(this.scene, () => this.T);
    this.fx.budget = this.q.particles;
    // mão (cena própria: nunca entra na parede)
    const hc = handColors();
    this.handScene.add(new THREE.HemisphereLight('#ffffff', '#8a6a8a', 1.6));
    const hl = new THREE.DirectionalLight('#ffffff', 1.4);
    hl.position.set(1, 2, 1);
    this.handScene.add(hl);
    this.handScene.add(this.handRig);
    this.handRig.add(this.hand);
    this.mitt = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), lam(hc.light));
    this.mitt.scale.set(1, 0.85, 1.15);
    this.hand.add(this.mitt);
    this.arm = new Forearm(hc, 1, 1);
    this.handRig.add(this.arm.mesh);
    // linha do gancho
    this.hookLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#ffd34a' }));
    this.hookLine.visible = false;
    this.hookLine.frustumCulled = false;
    this.scene.add(this.hookLine);
    // você
    this.me = this.addActor(t('cavafala.you', 'Você'), hc.light, o.spawn, true);
    this.me.slots.push(this.makeSlot(PAZINHA, noMods()));
    // HUD + entrada
    this.hud = new Hud(root, this.theme, {
      pause: () => this.onPause(),
      dig: (d) => (this.digHeld = d),
      use: (d) => {
        this.useHeld = d;
        if (d) this.useEdge = true;
      },
      jump: (d) => {
        this.jumpHeld = d;
        if (d) this.jumpQ = true;
      },
      mic: (d) => this.micBtn(d),
      type: () => this.openType(),
      book: () => this.openRing(),
      select: (i) => this.select(this.me, i),
    });
    this.ctl = new FpsControls(root, { joystick: { zoneWidth: 0.42, zoneTop: 0.22 }, look: { mouse: true } });
    this.keyH = (e) => this.onKey(e, true);
    this.keyU = (e) => this.onKey(e, false);
    window.addEventListener('keydown', this.keyH);
    window.addEventListener('keyup', this.keyU);
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(root);
    this.resize();
    this.updateHot();
    this.objs = new Maker(this);
  }

  /* ---------------------------- atores ---------------------------- */
  addActor(name: string, color: string, at: THREE.Vector3, isPlayer = false, hat: Hat = '', hatCol = '#ff4f6a'): Actor {
    const a: Actor = {
      id: this.nextId++,
      name,
      color,
      isPlayer,
      helper: false,
      body: makeBody(at.x, at.y, at.z),
      yaw: 0,
      pitch: 0,
      model: null,
      inv: emptyInv(),
      slots: [],
      sel: 0,
      alive: true,
      pct: 0,
      shieldT: 0,
      shieldCd: 0,
      trapT: 0,
      slowT: 0,
      mounted: false,
      fuel: 1,
      hook: null,
      digCd: 0,
      useCd: 0,
      lastHit: null,
      move: new THREE.Vector3(),
      wantJump: false,
      held: null,
      shieldMesh: null,
      bubbleMesh: null,
      heldKey: '',
      ai: null,
      teleCd: 0,
      place: 0,
      outT: 0,
    };
    if (!isPlayer) {
      a.model = new BloopModel(color, 1, hat, hatCol);
      a.model.root.position.copy(at);
      this.scene.add(a.model.root);
    }
    this.actors.push(a);
    return a;
  }
  removeActor(a: Actor): void {
    a.model?.dispose();
    a.shieldMesh?.parent?.remove(a.shieldMesh);
    a.bubbleMesh?.parent?.remove(a.bubbleMesh);
    const i = this.actors.indexOf(a);
    if (i >= 0) this.actors.splice(i, 1);
  }

  makeSlot(g: GDef, mods: Mods): Slot {
    return { g, mods, uses: g.uses ? g.uses * (mods.double ? 2 : 1) : 0, thumb: this.thumb(g, mods), on: false };
  }
  giveSlot(a: Actor, g: GDef, mods: Mods): void {
    const s = this.makeSlot(g, mods);
    if (a.slots.length >= 6) a.slots.splice(1, 1);
    a.slots.push(s);
    a.sel = a.slots.length - 1;
    if (a.isPlayer) this.updateHot();
  }
  select(a: Actor, i: number): void {
    if (i < 0 || i >= a.slots.length) return;
    if (a.mounted && a.slots[a.sel]?.g.beh === 'cart' && i !== a.sel) a.mounted = false;
    a.sel = i;
    if (a.isPlayer) {
      sfx.click();
      this.updateHot();
      const s = a.slots[i];
      notify(s.g.name() + ' · ' + s.g.desc(), { key: 'sel', ms: 1600 });
    }
  }
  updateHot(): void {
    this.hud.setHot(this.me.slots.map((s, i) => ({ thumb: s.thumb, name: fullName(s.g, s.mods), uses: s.uses, sel: i === this.me.sel })));
  }
  refreshBoxes(): void {
    const b: OBox[] = [];
    if (this.town) b.push(...this.town.colliders());
    for (const s of this.structs) for (const c of s.cols) b.push(c.box);
    if (this.objs) for (const o of this.objs.list) for (const c of o.cols) b.push(c.box);
    this.phys.boxes = b;
  }

  /* ---------------------------- miniaturas ---------------------------- */
  thumb(g: GDef, mods: Mods): string {
    const key = g.id + JSON.stringify(mods);
    const c = this.thumbs.get(key);
    if (c) return c;
    const b = buildModel(g, mods, g.kind !== 'struct');
    const url = this.renderThumb(b.group, g.kind === 'struct' ? 2.5 : 2.2);
    this.thumbs.set(key, url);
    return url;
  }
  /** miniatura (PNG data URL) de um objeto 3D qualquer */
  renderThumb(obj: THREE.Object3D, rotY: number, N = 96): string {
    if (!this.thumbRT || this.thumbRT.width !== N) {
      this.thumbRT?.dispose();
      this.thumbRT = new THREE.WebGLRenderTarget(N, N);
    }
    if (!this.thumbScene) {
      this.thumbScene = new THREE.Scene();
      this.thumbScene.add(new THREE.HemisphereLight('#ffffff', '#9a8ac8', 1.7));
      const d = new THREE.DirectionalLight('#ffffff', 1.6);
      d.position.set(2, 3, 2);
      this.thumbScene.add(d);
    }
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const ctr = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length() || 1;
    const holder = new THREE.Group();
    holder.add(obj);
    holder.position.copy(ctr).negate();
    const pivot = new THREE.Group();
    pivot.add(holder);
    pivot.rotation.set(0.45, rotY, 0);
    this.thumbScene.add(pivot);
    const cam = new THREE.PerspectiveCamera(32, 1, 0.01, 200);
    cam.position.set(0, 0, size * 1.75);
    const prevRT = this.renderer.getRenderTarget();
    const prevCol = this.renderer.getClearColor(new THREE.Color());
    const prevA = this.renderer.getClearAlpha();
    this.renderer.setRenderTarget(this.thumbRT);
    this.renderer.setClearColor('#000000', 0);
    this.renderer.clear();
    this.renderer.render(this.thumbScene, cam);
    const px = new Uint8Array(N * N * 4);
    this.renderer.readRenderTargetPixels(this.thumbRT, 0, 0, N, N, px);
    this.renderer.setRenderTarget(prevRT);
    this.renderer.setClearColor(prevCol, prevA);
    this.thumbScene.remove(pivot);
    const cv = document.createElement('canvas');
    cv.width = cv.height = N;
    const cx = cv.getContext('2d')!;
    const img = cx.createImageData(N, N);
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const s = ((N - 1 - y) * N + x) * 4,
          d = (y * N + x) * 4;
        const a = px[s + 3];
        // desfaz alfa pré-multiplicado e converte para sRGB
        const k = a ? 255 / a : 0;
        img.data[d] = SRGB[Math.min(255, Math.round(px[s] * k))];
        img.data[d + 1] = SRGB[Math.min(255, Math.round(px[s + 1] * k))];
        img.data[d + 2] = SRGB[Math.min(255, Math.round(px[s + 2] * k))];
        img.data[d + 3] = a;
      }
    cx.putImageData(img, 0, 0);
    return cv.toDataURL();
  }

  /* ---------------------------- qualidade ---------------------------- */
  private applyQ(tier: Tier): void {
    this.q = wq(tier);
    this.renderer.setPixelRatio(this.q.pr);
    this.fx.budget = this.q.particles;
    this.resize();
  }
  private resize(): void {
    const w = this.root.clientWidth || window.innerWidth;
    const h = this.root.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.cam.aspect = w / Math.max(1, h);
    this.cam.updateProjectionMatrix();
  }

  /* ---------------------------- loop ---------------------------- */
  start(): void {
    this.last = performance.now();
    const loop = () => {
      if (this.dead) return;
      this.raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      const t0 = performance.now();
      if (!this.paused || this.net) this.step(dt);
      this.render();
      this.gov.sample(dt * 1000, performance.now() - t0);
    };
    this.raf = requestAnimationFrame(loop);
  }
  /** avança N quadros na hora (testes) */
  tick(n: number, dt = 1 / 30): void {
    for (let i = 0; i < n; i++) this.step(dt);
    this.render();
  }

  private step(dt: number): void {
    this.time += dt;
    if (!this.paused) this.controlPlayer(dt);
    else this.me.move.set(0, 0, 0);
    this.mode?.update(dt);
    for (const a of this.actors) this.simActor(a, dt);
    this.updateStructs(dt);
    this.objs.update(dt);
    this.updateProjs(dt);
    this.updateBuilds(dt);
    this.updateGrows(dt);
    this.updateDigbots(dt);
    this.updateTornados(dt);
    const n = this.T.update(this.q.budget + (this.T.pending > 30 ? 2 : 0), this.cam.position);
    void n;
    if (this.town) {
      this.town.measure(this.T, 2);
      this.town.update(dt, this.time);
    }
    this.fx.update(dt, this.cam, this.renderer.domElement.height);
    this.updateHand(dt);
    this.updateHudLive();
    this.onStep?.(dt);
  }

  private render(): void {
    // câmera
    const a = this.me;
    const eye = a.mounted ? 1.15 : EYE;
    const sh = this.fx.shake;
    this.cam.position.set(a.body.p.x + (Math.random() - 0.5) * sh * 0.3, a.body.p.y + eye + (Math.random() - 0.5) * sh * 0.3, a.body.p.z + (Math.random() - 0.5) * sh * 0.3);
    this.cam.rotation.set(a.pitch, a.yaw, (Math.random() - 0.5) * sh * 0.05, 'YXZ');
    this.cam.updateMatrixWorld();
    this.handRig.position.copy(this.cam.position);
    this.handRig.quaternion.copy(this.cam.quaternion);
    this.handRig.updateMatrixWorld(true);
    this.sun.position.set(a.body.p.x + 28, 50, a.body.p.z + 18);
    this.sun.target.position.set(a.body.p.x, 0, a.body.p.z);
    this.renderer.autoClear = true;
    this.renderer.render(this.scene, this.cam);
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    this.renderer.render(this.handScene, this.cam);
  }

  /** céu/luz pelo tempo do dia (0 = manhã, 1 = noite) */
  setSky(top: string, bottom: string, light: number, fog: string): void {
    this.skyCol.set(top);
    this.scene.background = this.skyCol;
    const near = this.arena ? 40 : 34;
    this.scene.fog = this.scene.fog instanceof THREE.Fog ? this.scene.fog : new THREE.Fog(fog, near, this.q.far);
    (this.scene.fog as THREE.Fog).color.set(fog);
    (this.scene.fog as THREE.Fog).far = this.q.far;
    this.hemi.color.set(top).lerp(new THREE.Color('#ffffff'), 0.55);
    this.hemi.groundColor.set(bottom).lerp(new THREE.Color('#6a4a3a'), 0.5);
    this.hemi.intensity = 0.55 + 0.95 * light;
    this.sun.intensity = 0.25 + 1.5 * light;
  }

  /* ---------------------------- entrada ---------------------------- */
  private onKey(e: KeyboardEvent, down: boolean): void {
    if (this.hud.overlay) {
      if (down && e.code === 'Escape') {
        this.hud.closePanel();
        this.paused = false;
      }
      return;
    }
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    switch (e.code) {
      case 'Space':
        this.jumpHeld = down;
        if (down) this.jumpQ = true;
        e.preventDefault();
        break;
      case 'KeyF':
      case 'KeyE':
        this.useHeld = down;
        if (down && !e.repeat) this.useEdge = true;
        break;
      case 'KeyQ':
      case 'KeyC':
        this.digHeld = down;
        break;
      case 'KeyV':
        if (!e.repeat) this.micBtn(down);
        break;
      case 'KeyT':
      case 'Enter':
        if (down) {
          e.preventDefault();
          this.openType();
        }
        break;
      case 'KeyR':
        if (down) this.openRing();
        break;
      case 'Escape':
      case 'KeyP':
        if (down) this.onPause();
        break;
      default:
        if (down && /^Digit[1-6]$/.test(e.code)) this.select(this.me, +e.code.slice(5) - 1);
    }
  }

  private controlPlayer(dt: number): void {
    const a = this.me;
    if (!a.alive) return;
    const [dy, dp] = this.ctl.consumeLook(dt);
    a.yaw -= dy;
    a.pitch = Math.max(-1.45, Math.min(1.45, a.pitch - dp));
    const [mx, mz] = this.ctl.dir();
    FWD.set(-Math.sin(a.yaw), 0, -Math.cos(a.yaw));
    RIGHT.set(Math.cos(a.yaw), 0, -Math.sin(a.yaw));
    a.move.set(0, 0, 0).addScaledVector(RIGHT, mx).addScaledVector(FWD, mz);
    a.wantJump = this.jumpQ || (this.jumpHeld && a.body.onGround && a.body.groundBox?.tag === 'bounce');
    this.jumpQ = false;
    // mira
    const dir = this.aimDir(V1);
    const s = a.slots[a.sel];
    this.aimHit = null;
    const hit = this.T.raycast(this.cam.position.x, this.cam.position.y, this.cam.position.z, dir.x, dir.y, dir.z, 40);
    if (hit) this.aimHit = new THREE.Vector3(hit.x, hit.y, hit.z);
    const reach = this.digTool(a).reach;
    const isDig = !s || s.g.beh === 'shovel' || s.g.beh === 'drill';
    this.hud.setCross(hit && hit.dist < reach ? 'dig' : s && s.g.kind === 'weapon' ? 'aim' : hit ? 'far' : 'none');
    // cavar
    a.digCd -= dt;
    if (isDig && this.useEdge && !this.digHeld) {
      // sem engenhoca na mão: USAR abre as receitas
      this.useEdge = false;
      this.openRing();
    }
    if (this.digHeld && a.digCd <= 0) {
      this.digFrom(a, this.cam.position, dir);
      a.digCd = this.digTool(a).rate;
      this.digAnim = 1;
    }
    // usar
    if (s && !isDig) {
      const fire = this.useEdge || (this.useHeld && (s.g.kind === 'weapon' || ['balloon', 'jetpack', 'magnet', 'watering', 'umbrella'].includes(s.g.beh)));
      if (fire) this.useSlot(a, s, this.useEdge, dt, this.cam.position, dir);
    }
    this.useEdge = false;
    // lanterna segue a câmera
    if (this.flash) {
      this.flash.position.copy(this.cam.position);
      this.flash.target.position.copy(this.cam.position).addScaledVector(dir, 8);
    }
  }

  aimDir(out: THREE.Vector3): THREE.Vector3 {
    const a = this.me;
    return out.set(-Math.sin(a.yaw) * Math.cos(a.pitch), Math.sin(a.pitch), -Math.cos(a.yaw) * Math.cos(a.pitch)).normalize();
  }

  /* ---------------------------- simulação dos Bloops ---------------------------- */
  private simActor(a: Actor, dt: number): void {
    const b = a.body;
    if (!a.alive) {
      if (a.model) a.model.root.visible = false;
      return;
    }
    if (a.remote) {
      this.simPuppet(a, dt);
      return;
    }
    if (a === this.me && this.objs.riding) {
      this.objs.pinRider(a, a.move, a.pitch, this.jumpQ || this.jumpHeld);
      this.jumpQ = false;
      this.visuals(a, dt);
      return;
    }
    a.shieldT = Math.max(0, a.shieldT - dt);
    a.shieldCd = Math.max(0, a.shieldCd - dt);
    a.slowT = Math.max(0, a.slowT - dt);
    a.useCd = Math.max(0, a.useCd - dt);
    a.teleCd = Math.max(0, a.teleCd - dt);
    const sel = a.slots[a.sel];
    const st = sel ? modStats(sel.mods) : null;
    const mods = sel?.mods.modules ?? [];
    let speed = 5.4 * (a.slowT > 0 ? 0.5 : 1) * (mods.includes('rodas') ? 1.3 : 1);
    if (a.mounted) speed = 11 * (st?.speed ?? 1) * (mods.includes('foguete') ? 1.4 : 1);
    if (!a.isPlayer) speed *= (a.ai as { speedK?: number } | null)?.speedK ?? 0.9;
    // bolha: flutua presa
    if (a.trapT > 0) {
      a.trapT -= dt;
      b.v.set(b.v.x * 0.9, 1.4, b.v.z * 0.9);
      if (a.trapT <= 0) {
        this.fx.foam(b.p.x, b.p.y + 0.8, b.p.z, 16, '#bff4ff');
        sfx.pop();
      }
    } else if (a.hook) {
      V1.copy(a.hook).sub(b.p);
      V1.y -= 1;
      const d = V1.length();
      if (d < 1.4 || a.useCd <= 0) a.hook = null;
      else b.v.copy(V1.multiplyScalar(18 / d));
    } else {
      const ground = b.onGround;
      a.stunT = Math.max(0, (a.stunT ?? 0) - dt);
      if (a.stunT > 0 && !ground) a.move.set(0, 0, 0);
      const slide = b.groundBox?.tag === 'slide' || (sel && sel.mods.modules.includes('gelo') && ground && b.groundBox != null);
      const acc = ground ? (slide ? 3 : 32) : a.stunT > 0 ? 0 : 4;
      const tx = a.move.x * speed,
        tz = a.move.z * speed;
      const k = Math.min(1, acc * dt);
      b.v.x += (tx - b.v.x) * k * (ground || Math.abs(tx) + Math.abs(tz) > 0.1 ? 1 : 0.15);
      b.v.z += (tz - b.v.z) * k * (ground || Math.abs(tx) + Math.abs(tz) > 0.1 ? 1 : 0.15);
      if (slide && ground) {
        b.v.x += b.groundN.x * 14 * dt;
        b.v.z += b.groundN.z * 14 * dt;
      }
      // pulo
      if (a.wantJump && (ground || b.air < 0.12)) {
        let j = 7.4;
        if (sel?.g.beh === 'spring') j *= 1.65 * (st?.power ?? 1);
        if (mods.includes('mola')) j *= 1.3;
        if (a.mounted) j *= 0.8;
        b.v.y = j;
        b.onGround = false;
        b.air = 0.2;
        if (a.isPlayer) sfx.boing();
      }
      // planar (guarda-chuva / hélice)
      const glide = sel && (sel.g.beh === 'umbrella' || mods.includes('helice'));
      if (glide && !ground && b.v.y < -2.2) b.v.y += (-2.2 - b.v.y) * Math.min(1, 8 * dt);
    }
    a.wantJump = false;
    stepBody(this.phys, b, dt, a.trapT > 0 ? 0 : 1);
    // reações às engenhocas debaixo dos pés
    const gb = b.groundBox;
    if (gb && b.onGround) {
      if (gb.tag === 'bounce') {
        b.v.y = 15 * gb.power + (a.isPlayer && this.jumpHeld ? 3 : 0);
        b.onGround = false;
        sfx.boing();
        this.fx.foam(b.p.x, b.p.y, b.p.z, 6, '#bff4ff');
        if (a.isPlayer) tap('light');
      } else if (gb.tag === 'launch') {
        b.v.copy(gb.dir).multiplyScalar(19 * gb.power);
        b.onGround = false;
        sfx.whoosh();
        this.fx.dust(b.p.x, b.p.y, b.p.z, '#ffffff', 10);
        if (a.isPlayer) this.fx.addShake(0.2);
      } else if (gb.tag === 'tele' && a.teleCd <= 0) {
        const s = gb.owner as Struct;
        if (s.pair && !s.pair.dead) {
          a.teleCd = 1.2;
          b.p.copy(s.pair.pos).add(V1.set(0, 0.4, 0));
          this.fx.sparkle(b.p.x, b.p.y + 1, b.p.z, 24, '#c8a0ff');
          sfx.sparkle();
        }
      } else if (gb.tag === 'lift') {
        b.p.y += 0;
      }
    }
    if (b.hitV > 12 && a.isPlayer) {
      sfx.thud();
      this.fx.addShake(Math.min(0.3, b.hitV * 0.012));
    }
    // passos
    if (a.isPlayer && b.onGround && b.v.lengthSq() > 4) {
      this.stepT -= dt * Math.sqrt(b.v.x * b.v.x + b.v.z * b.v.z);
      if (this.stepT <= 0) {
        this.stepT = 2.1;
        sfx.step();
      }
    }
    // caiu no vazio / muito fundo
    if (b.p.y < this.T.oy - 6) this.mode?.onOut?.(a);
    this.visuals(a, dt);
    // jetpack recarrega no chão
    if (b.onGround) a.fuel = Math.min(1, a.fuel + dt * 0.6);
  }

  /** modelo, carrinho, escudo e bolha (todos os Bloops, inclusive os de outros aparelhos) */
  private visuals(a: Actor, dt: number): void {
    const b = a.body;
    const sel = a.slots[a.sel];
    // modelo
    if (a.model) {
      a.model.root.visible = true;
      a.model.root.position.copy(b.p);
      a.model.root.rotation.y = a.yaw;
      a.model.update(dt, Math.hypot(b.v.x, b.v.z), !b.onGround);
      if (a.remote) a.model.tagDist(this.cam.position.distanceTo(b.p));
      this.syncHeld(a);
    }
    // carrinho montado: modelo segue o Bloop e dá trombada
    if (a.mounted && sel?.g.kind === 'vehicle') {
      if (!a.cart) {
        a.cart = buildModel(sel.g, sel.mods).group;
        this.scene.add(a.cart);
      }
      a.cart.position.set(b.p.x, b.p.y - 0.05, b.p.z);
      a.cart.rotation.y = a.yaw;
      const spd = Math.hypot(b.v.x, b.v.z);
      if (spd > 6 && !a.remote)
        for (const o of this.actors) {
          if (o === a || !o.alive) continue;
          V1.copy(o.body.p).sub(b.p);
          if (V1.lengthSq() < 2.2 && V1.dot(b.v) > 0) {
            V1.setY(0).normalize();
            this.knock(o, V1.x, 0.4, V1.z, 0.9 * (spd / 11), a);
            b.v.multiplyScalar(0.5);
          }
        }
      if (sel.mods.modules.includes('foguete') && spd > 4 && Math.random() < 0.4) this.fx.dust(b.p.x - Math.sin(a.yaw) * -1.1, b.p.y + 0.5, b.p.z - Math.cos(a.yaw) * -1.1, '#ffb35a', 1);
    } else if (a.cart) {
      this.scene.remove(a.cart);
      a.cart = null;
    }
    // escudo / bolha
    if (a.shieldT > 0) {
      if (!a.shieldMesh) {
        a.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(1.05, 20, 14), new THREE.MeshLambertMaterial({ color: '#9af6ff', transparent: true, opacity: 0.3, emissive: new THREE.Color('#2a8aa0'), depthWrite: false }));
        this.scene.add(a.shieldMesh);
      }
      a.shieldMesh.visible = !a.isPlayer;
      a.shieldMesh.position.set(b.p.x, b.p.y + 0.75, b.p.z);
      a.shieldMesh.scale.setScalar(1 + Math.sin(this.time * 8) * 0.04);
    } else if (a.shieldMesh) a.shieldMesh.visible = false;
    if (a.trapT > 0) {
      if (!a.bubbleMesh) {
        a.bubbleMesh = new THREE.Mesh(new THREE.SphereGeometry(0.95, 18, 12), new THREE.MeshLambertMaterial({ color: '#bff4ff', transparent: true, opacity: 0.35, depthWrite: false }));
        this.scene.add(a.bubbleMesh);
      }
      a.bubbleMesh.visible = !a.isPlayer;
      a.bubbleMesh.position.set(b.p.x, b.p.y + 0.7, b.p.z);
    } else if (a.bubbleMesh) a.bubbleMesh.visible = false;
  }

  /* ---------------------------- Bloops de outros aparelhos (online) ---------------------------- */
  /** guarda um retrato vindo da rede */
  pushSnap(a: Actor, x: number, y: number, z: number, yaw: number, pitch: number, pct: number, f: number, g: string): void {
    const s = (a.snaps ??= []);
    const now = performance.now();
    if (!s.length) a.body.p.set(x, y, z);
    s.push({ t: now, x, y, z, yaw, pitch });
    if (s.length > 24) s.splice(0, s.length - 24);
    a.pct = pct;
    a.netF = f;
    if (g !== a.netG) {
      a.netG = g;
      this.puppetHeld(a, g);
    }
  }
  private puppetHeld(a: Actor, id: string): void {
    let i = a.slots.findIndex((s) => s.g.id === id);
    if (i < 0) {
      const g = id === PAZINHA.id ? PAZINHA : gadgetById(id);
      if (!g) return;
      a.slots.push({ g, mods: noMods(), uses: 0, thumb: '', on: false });
      if (a.slots.length > 8) a.slots.splice(0, 1);
      i = a.slots.length - 1;
    }
    a.sel = i;
  }
  private simPuppet(a: Actor, dt: number): void {
    const b = a.body;
    const s = a.snaps;
    if (s && s.length) {
      const rt = performance.now() - INTERP_MS;
      let k = s.length - 1;
      while (k > 0 && s[k - 1].t > rt) k--;
      const B = s[k];
      const A = k > 0 ? s[k - 1] : B;
      const px = b.p.x,
        py = b.p.y,
        pz = b.p.z;
      if (A === B || rt >= B.t) {
        // sem retrato novo: segura no último (sem extrapolar longe)
        b.p.set(B.x, B.y, B.z);
        a.yaw = B.yaw;
        a.pitch = B.pitch;
      } else {
        const u = Math.max(0, Math.min(1, (rt - A.t) / Math.max(1, B.t - A.t)));
        b.p.set(A.x + (B.x - A.x) * u, A.y + (B.y - A.y) * u, A.z + (B.z - A.z) * u);
        let dy = B.yaw - A.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        a.yaw = A.yaw + dy * u;
        a.pitch = A.pitch + (B.pitch - A.pitch) * u;
      }
      if (dt > 0) {
        b.v.set((b.p.x - px) / dt, (b.p.y - py) / dt, (b.p.z - pz) / dt);
        if (b.v.lengthSq() > 900) b.v.setLength(30);
      }
      // no chão? (para a animação)
      b.onGround = this.T.sample(b.p.x, b.p.y - 0.15, b.p.z) > 0 || Math.abs(b.v.y) < 0.6;
      if (s.length > 2 && s[0].t < rt - 1000) s.splice(0, 1);
    }
    const f = a.netF ?? 0;
    a.shieldT = f & 1 ? 1 : 0;
    a.trapT = f & 2 ? 1 : 0;
    a.mounted = !!(f & 4);
    this.visuals(a, dt);
  }
  /** cavada que veio da rede */
  netDig(x: number, y: number, z: number, r: number, p: number): void {
    const n = this.T.dig(x, y, z, r, null, p);
    if (n > 0 && this.isNear(x, y, z)) {
      const col = matColor(this.T.matAt(x, y - r, z) || M.Terra, this.theme ?? undefined);
      this.fx.chunks(x, y, z, 0, 1, 0, col, 3 + Math.min(5, Math.round(n / 6)), 4);
      this.fx.dust(x, y, z, col, 4);
    }
  }
  /** engenhoca que alguém (de outro aparelho) montou: mesmo lugar, sem pagar */
  netCreate(a: Actor, g: GDef, mods: Mods, x: number, y: number, z: number, yaw: number, tp: THREE.Vector3 | null): void {
    a.body.p.set(x, y, z);
    a.yaw = yaw;
    if (!a.voiceAt || performance.now() - a.voiceAt > 2500) a.model?.say(fullName(g, mods) + '!', 1800);
    this.teleForce = tp;
    if (g.kind === 'struct') this.placeStruct(a, g, mods);
    else this.buildTool(a, g, mods);
    this.teleForce = null;
  }
  /** espuma/martelo/tornado/robô de outro aparelho (o acerto é decidido por quem usou) */
  netFire(a: Actor, g: GDef, mods: Mods, o: THREE.Vector3, d: THREE.Vector3): void {
    let s = a.slots.find((x) => x.g.id === g.id && JSON.stringify(x.mods) === JSON.stringify(mods));
    if (!s) {
      s = { g, mods, uses: 0, thumb: '', on: false };
      a.slots.push(s);
      if (a.slots.length > 8) a.slots.splice(0, 1);
    }
    a.useCd = 0;
    this.useSlot(a, s, true, 1 / 30, o, d);
  }
  /** balão com o que alguém falou */
  netVoice(a: Actor, text: string): void {
    a.voiceAt = performance.now();
    a.model?.say('“' + text + '”', 2600);
  }
  actorByNid(nid: string): Actor | null {
    return this.actors.find((a) => a.nid === nid) ?? null;
  }

  /** engenhoca na mão dos Bloops (bots/ajudantes) */
  private syncHeld(a: Actor): void {
    const s = a.slots[a.sel];
    const key = s ? s.g.id + JSON.stringify(s.mods) : '';
    if (key === a.heldKey) return;
    a.heldKey = key;
    if (a.held) a.model!.hand.remove(a.held);
    a.held = null;
    if (!s) return;
    const b = buildModel(s.g, s.mods, true);
    b.group.scale.multiplyScalar(s.g.kind === 'vehicle' ? 0.35 : 0.8);
    b.group.rotation.x = 0;
    a.held = b.group;
    a.model!.hand.add(b.group);
  }

  /* ---------------------------- cavar ---------------------------- */
  digTool(a: Actor): { R: number; power: number; rate: number; reach: number } {
    const s = a.slots[a.sel];
    let base = { R: 1.15, power: 1, rate: 0.15, reach: 5.5 };
    let src = s && (s.g.beh === 'drill' || s.g.beh === 'shovel') ? s : null;
    if (!src) src = a.slots.find((x) => x.g.beh === 'drill') ?? null;
    if (src?.g.beh === 'drill') base = { R: 1.35, power: 1.7, rate: 0.1, reach: 6 };
    else if (src?.g.id === 'pa') base = { R: 1.9, power: 0.95, rate: 0.24, reach: 6.5 };
    if (src && src.g.id !== 'pazinha') {
      const st = modStats(src.mods);
      base.R *= Math.sqrt(st.scale);
      base.power *= st.power;
      base.rate /= st.speed;
    }
    return base;
  }

  /** cava a partir de um raio. Devolve unidades obtidas. */
  digFrom(a: Actor, o: THREE.Vector3, dir: THREE.Vector3, toolOverride?: { R: number; power: number; reach: number }): number {
    const tool = toolOverride ?? this.digTool(a);
    const hit = this.T.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, tool.reach);
    // prédios/engenhocas na frente?
    let boxD = Infinity;
    for (const bx of this.phys.boxes) {
      const d = rayBox(bx, o, dir, tool.reach);
      if (d >= 0 && d < boxD) boxD = d;
    }
    if (!hit && boxD === Infinity) return 0;
    let x: number, y: number, z: number, mat: number, nx: number, ny: number, nz: number;
    let R = tool.R;
    if (!hit || boxD < hit.dist - 0.1) {
      // escova a terra grudada no prédio
      x = o.x + dir.x * (boxD - 0.15);
      y = o.y + dir.y * (boxD - 0.15);
      z = o.z + dir.z * (boxD - 0.15);
      nx = -dir.x;
      ny = -dir.y;
      nz = -dir.z;
      mat = this.T.matAt(x, y, z);
      R *= 0.85;
    } else {
      x = hit.x + dir.x * R * 0.35;
      y = hit.y + dir.y * R * 0.35;
      z = hit.z + dir.z * R * 0.35;
      nx = hit.nx;
      ny = hit.ny;
      nz = hit.nz;
      mat = hit.mat;
    }
    const got: Inv = {};
    const n = this.T.dig(x, y, z, R, got, tool.power);
    if (n > 0 && this.net) this.net.dig(x, y, z, R, tool.power);
    const col = matColor(mat || M.Terra, this.theme ?? undefined);
    const ex = hit ? hit.x : x,
      ey = hit ? hit.y : y,
      ez = hit ? hit.z : z;
    if (n > 0) {
      let bestM = 0,
        bestV = 0;
      for (const [k, v] of Object.entries(got)) {
        a.inv[+k] = (a.inv[+k] ?? 0) + v!;
        if (v! > bestV) {
          bestV = v!;
          bestM = +k;
        }
      }
      if (this.isNear(ex, ey, ez)) {
        this.fx.chunks(ex, ey, ez, nx, ny, nz, col, 4 + Math.min(6, Math.round(n / 6)), 4.5);
        this.fx.dust(ex, ey, ez, col, 5);
        if (mat === M.Cristal || mat === M.Ouro) this.fx.sparkle(ex, ey, ez, 10, mat === M.Ouro ? '#ffe680' : '#bff4ff');
      }
      if (a.isPlayer) {
        if (mat === M.Pedra || mat === M.Cristal || mat === M.Ouro) sfx.chop();
        else sfx.scrub();
        if (Math.random() < 0.4) sfx.pop();
        this.fx.addShake(0.06);
        tap('light');
        if (bestM) {
          this.hud.gain(`+${Math.round(bestV)} ${matName(bestM, this.theme ?? undefined)}`, matColor(bestM, this.theme ?? undefined));
          this.hud.setInv(a.inv, bestM);
        }
        if (bestM === M.Ouro || bestM === M.Cristal) sfx.sparkle();
      }
      this.mode?.onDig?.(a, got, new THREE.Vector3(ex, ey, ez));
    } else if (a.isPlayer) {
      // dura demais (rocha-mãe ou pedra com pazinha fraca)
      this.fx.sparkle(ex, ey, ez, 6, '#ffffff');
      sfx.chop();
      if (!this.tipShown.has('hard')) {
        this.tipShown.add('hard');
        notify(t('cavafala.tip.hard', 'Muito duro! Crie uma "broca turbo" para furar pedra.'), { kind: 'warn' });
      }
    }
    return n;
  }
  /* ---------------------------- ajudantes das criações (creation.ts) ---------------------------- */
  backpackOf(a: Actor, out: THREE.Vector3): THREE.Vector3 {
    return this.backpack(a, out);
  }
  takeLight(): boolean {
    if (this.lights >= this.q.lights) return false;
    this.lights++;
    return true;
  }
  freeLight(): void {
    this.lights = Math.max(0, this.lights - 1);
  }
  /** cava um buraco (robô cavador, escavadeira) e dá o material ao dono */
  digAt(owner: Actor, x: number, y: number, z: number, r: number): void {
    const got: Inv = {};
    const n = this.T.dig(x, y, z, r, got, 1);
    if (n <= 0) return;
    this.net?.dig(x, y, z, r, 1);
    for (const [k, v] of Object.entries(got)) owner.inv[+k] = (owner.inv[+k] ?? 0) + v!;
    if (owner.isPlayer) this.hud.setInv(owner.inv);
    if (this.isNear(x, y, z)) {
      const col = matColor(this.T.matAt(x, y - r, z) || M.Terra, this.theme ?? undefined);
      this.fx.chunks(x, y, z, 0, 1, 0, col, 6, 4);
      this.fx.dust(x, y, z, col, 6);
    }
    this.mode?.onDig?.(owner, got, new THREE.Vector3(x, y, z));
  }
  /** projétil mole (bolha/espuma/confete/água/neve) que uma criação atira */
  shootSoft(owner: Actor, o: THREE.Vector3, d: THREE.Vector3, kind: string, power: number): void {
    const beh = kind === 'bubbles' ? 'bubble' : kind === 'confetti' ? 'confetti' : kind === 'snow' ? 'snow' : 'foam';
    const n = beh === 'confetti' ? 4 : 1;
    for (let i = 0; i < n; i++) {
      const dir = V2.copy(d);
      if (n > 1) dir.applyAxisAngle(UP, (i - (n - 1) / 2) * 0.15).normalize();
      const speed = beh === 'bubble' ? 10 : beh === 'confetti' ? 18 : 20;
      const r = beh === 'bubble' ? 0.38 : beh === 'confetti' ? 0.12 : 0.24;
      const col = kind === 'water' ? '#8fd3ff' : beh === 'bubble' ? '#bff4ff' : beh === 'snow' ? '#ffffff' : beh === 'confetti' ? ['#ff4f6a', '#ffd34a', '#5ab0ff', '#5ad6a0'][i % 4] : '#fff4e6';
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), beh === 'bubble' ? new THREE.MeshLambertMaterial({ color: col, transparent: true, opacity: 0.5, depthWrite: false }) : lam(col, 0.2));
      mesh.position.copy(o);
      this.scene.add(mesh);
      this.projs.push({ p: o.clone(), v: dir.clone().multiplyScalar(speed).add(V3.set(0, 1, 0)), kind: beh, power, owner, life: 2.6, r, mesh, bounces: 0, homing: false, trap: beh === 'bubble', slow: beh === 'snow', grav: beh === 'bubble' ? 1 : 4, confetti: beh === 'confetti' });
    }
    if (this.isNear(o.x, o.y, o.z)) (beh === 'bubble' ? sfx.bubble : kind === 'water' ? sfx.spray : sfx.throw)();
  }
  isNear(x: number, y: number, z: number): boolean {
    const c = this.cam.position;
    return (c.x - x) ** 2 + (c.y - y) ** 2 + (c.z - z) ** 2 < 900;
  }

  /* ---------------------------- voz / texto / círculo ---------------------------- */
  /* ---------- microfone LIGA/DESLIGA (contínuo) ---------- */
  private cont: ContSession | null = null;
  private contStarting = false;
  private lastSpeech = 0;
  private silenceT = 0;
  private visH = () => document.hidden && this.micOff(true);
  /** 'toggle' (padrão): toque liga/desliga · 'hold': segurar para falar */
  micMode(): 'toggle' | 'hold' {
    return cavaSave().micMode ?? 'toggle';
  }
  get micOn(): boolean {
    return !!this.cont || this.contStarting;
  }
  private micBtn(down: boolean): void {
    if (this.micMode() === 'hold') {
      void (down ? this.micDown() : this.micUp());
      return;
    }
    if (!down) return;
    if (this.micOn) this.micOff();
    else void this.micStart();
  }
  /** liga: ouve sem parar até desligar (o reconhecedor reinicia sozinho depois de cada frase) */
  async micStart(): Promise<void> {
    if (this.micOn || this.dead) return;
    audio.unlock();
    sfx.pick();
    if (voiceKind() === 'none') {
      this.noVoiceCard();
      return;
    }
    this.contStarting = true;
    this.hud.micState('starting');
    let why: VoiceFail | null = null;
    const s = await withTimeout(
      listenContinuous({
        onPartial: (txt) => {
          this.lastSpeech = performance.now();
          if (txt.trim()) this.hud.subtitle(txt, 'live');
        },
        onFinal: (alts) => this.contFinal(alts),
        onLevel: (lv) => this.hud.level(lv),
        onAskPerm: () => {
          this.hud.micState('off', true);
          this.permCard('ask');
        },
        onError: (w) => {
          why = w;
          if (w === 'perm' && this.cont) {
            this.micOff(true);
            this.permCard('denied');
          }
        },
      }),
      35000,
      null,
    );
    if ((this.hud.overlay as HTMLDivElement | null)?.dataset.perm === 'ask') this.closePanelGo();
    this.contStarting = false;
    if (!s || this.dead || this.paused) {
      s?.stop();
      this.hud.micState('off', true);
      if (this.dead || this.paused) return;
      if (why === 'perm') this.permCard('denied');
      else this.noVoiceCard(why === 'unavailable' ? 'none' : why ? 'err' : 'slow');
      return;
    }
    this.cont = s;
    this.lastSpeech = performance.now();
    this.hud.micState('on');
    document.addEventListener('visibilitychange', this.visH);
    // silêncio comprido: dica (a criança falou e nada apareceu → chegue mais perto)
    clearInterval(this.silenceT);
    this.silenceT = window.setInterval(() => {
      if (!this.cont) return;
      if (performance.now() - this.lastSpeech > 7000) {
        this.hud.subtitle(t('cavafala.mic.louder', 'Fala mais alto ou chega mais perto 🎤'), 'hint');
        this.lastSpeech = performance.now() - 3000; // repete a cada ~4 s, sem piscar
      }
    }, 500);
  }
  /** desliga (botão, pausa, app no fundo, sair) — sempre funciona */
  micOff(silent = false): void {
    clearInterval(this.silenceT);
    document.removeEventListener('visibilitychange', this.visH);
    const was = this.micOn;
    this.cont?.stop();
    this.cont = null;
    this.contStarting = false;
    if (was) {
      this.hud.micState('off', silent);
      if (!silent) sfx.drop();
    }
  }
  /** frase completa no modo contínuo: destaca o comando e monta; senão sugere (sem parar de ouvir) */
  private contFinal(alts: string[]): void {
    this.lastSpeech = performance.now();
    const heard = alts[0]?.trim() ?? '';
    if (!heard || this.dead) return;
    if (this.hud.overlay) return;
    const p = parseBest(alts);
    this.lastParsed = p;
    this.net?.voice(this.me, p.heard || heard);
    if (p.g && (p.sure || p.score >= 0.78)) {
      this.hud.subtitle(p.heard || heard, 'ok', fullName(p.g, p.mods));
      const ok = this.create(this.me, p.g, p.mods, 'voice');
      if (ok) {
        cavaSave().spoken++;
        persist();
      }
      return;
    }
    this.logMiss(p);
    const opts = [...(p.g ? [p.g] : []), ...p.suggest].filter((g, i, a) => a.indexOf(g) === i).slice(0, 3);
    this.hud.subtitle(
      p.heard || heard,
      'no',
      '',
      opts.map((g) => ({ label: g.name(), go: () => this.create(this.me, g, g === p.g ? p.mods : noMods(), 'radial') })),
    );
  }

  /** teste do microfone (pausa): barras do nível + o que ouviu, para ver se o aparelho escuta */
  micTest(onClose: () => void): void {
    this.micOff(true);
    const d = this.hud.panel(
      `<div class="cf-card cf-mt"><h2>${esc(t('cavafala.mt.title', 'Testar microfone'))}</h2>
        <p data-st>${esc(t('cavafala.mic.starting', 'Ligando o microfone…'))}</p>
        <div class="cf-mtbars">${'<i></i>'.repeat(20)}</div>
        <div class="cf-mtlog"><i>${esc(t('cavafala.mt.say', 'Fale alguma coisa, tipo “trampolim”…'))}</i></div>
        <div class="cf-row"><button class="cf-btn w" data-a="x">${esc(t('cavafala.close', 'Fechar'))}</button></div></div>`,
    );
    d.dataset.mictest = '1';
    const bars = [...d.querySelectorAll<HTMLElement>('.cf-mtbars i')];
    const hist = new Array(bars.length).fill(0);
    const log = d.querySelector('.cf-mtlog') as HTMLElement;
    const st = d.querySelector('[data-st]') as HTMLElement;
    let lines: string[] = [];
    let live = '';
    const draw = () => (log.innerHTML = [...lines.slice(-3).map((l) => `<div>${esc(l)}</div>`), live ? `<div><i>${esc(live)}…</i></div>` : ''].join('') || `<i>${esc(t('cavafala.mt.say', 'Fale alguma coisa, tipo “trampolim”…'))}</i>`);
    let sess: ContSession | null = null;
    let closed = false;
    const close = () => {
      closed = true;
      sess?.stop();
      this.hud.closePanel();
      onClose();
    };
    d.querySelector('[data-a=x]')!.addEventListener('click', close);
    void listenContinuous({
      onPartial: (s) => {
        live = s;
        draw();
      },
      onFinal: (alts) => {
        live = '';
        const p = parseBest(alts);
        lines.push(`“${alts[0]}”` + (p.g ? ` → ${fullName(p.g, p.mods)}` : ''));
        lines = lines.slice(-6);
        draw();
      },
      onLevel: (v) => {
        hist.push(v);
        hist.shift();
        bars.forEach((b, i) => (b.style.height = Math.round(4 + hist[i] * 62) + 'px'));
      },
      onError: (w) => {
        st.textContent = w === 'perm' ? t('cavafala.perm.deniedT', 'O microfone está desligado') : t('cavafala.voice.none', 'Voz indisponível aqui: digite o que quer criar.');
      },
    }).then((s) => {
      if (closed) return s?.stop();
      sess = s;
      if (s) st.textContent = t('cavafala.mic.on', 'Ouvindo… é só falar!');
    });
  }

  private micCancel = false;
  private lastPartial = '';
  private misses: string[] = [];
  private async micDown(): Promise<void> {
    if (this.voiceBusy || this.hud.overlay) return;
    audio.unlock();
    sfx.pick();
    if (voiceKind() === 'none') {
      this.noVoiceCard();
      return;
    }
    this.voiceBusy = true;
    this.micCancel = false;
    this.lastPartial = '';
    this.hud.listening(true);
    let why: VoiceFail | null = null;
    let slow = false;
    let askedPerm = false;
    // nunca fica infinito: sem resposta do reconhecedor em 8 s → cai para digitar/escolher
    let dog = window.setTimeout(() => (slow = true), 8000);
    const v = await Promise.race([
      listen({
        onPartial: (s) => {
          this.lastPartial = s;
          this.hud.listening(true, s);
        },
        onLevel: (lv) => this.hud.level(lv),
        onAskPerm: () => {
          askedPerm = true;
          clearTimeout(dog);
          dog = window.setTimeout(() => (slow = true), 32000);
          this.hud.listening(false);
          this.permCard('ask');
        },
        onError: (w) => (why = w),
      }),
      new Promise<null>((r) => {
        const chk = window.setInterval(() => {
          if (slow) {
            clearInterval(chk);
            r(null);
          }
        }, 200);
      }),
    ]);
    clearTimeout(dog);
    if ((this.hud.overlay as HTMLDivElement | null)?.dataset.perm === 'ask') this.closePanelGo();
    if (!v || slow || this.dead) {
      v?.cancel();
      this.hud.listening(false);
      this.voiceBusy = false;
      if (this.dead) return;
      if (why === 'perm') this.permCard('denied');
      else this.noVoiceCard(slow ? 'slow' : why === 'unavailable' ? 'none' : 'err');
      return;
    }
    if (this.micCancel && !askedPerm) {
      // soltou rápido (antes do reconhecedor abrir): segue normal com o que ouviu
      this.voice = v;
      void this.micUp();
      return;
    }
    if (this.micCancel) {
      // soltou o botão enquanto pedia a permissão: agora já pode falar
      v.cancel();
      this.hud.listening(false);
      this.voiceBusy = false;
      notify(t('cavafala.voice.ready', 'Microfone pronto! Segure FALAR e diga o que quer.'), { kind: 'good', icon: 'check' });
      return;
    }
    this.voice = v;
  }
  private async micUp(): Promise<void> {
    const v = this.voice;
    if (!v) {
      if (this.voiceBusy) this.micCancel = true;
      return;
    }
    this.voice = null;
    let alts = await withTimeout(v.finish(), 4000, [] as string[]);
    this.hud.listening(false);
    this.voiceBusy = false;
    sfx.drop();
    if (!alts.length && this.lastPartial) alts = [this.lastPartial];
    if (!alts.length) {
      this.hud.heard('', false);
      this.chooseCard(null);
      return;
    }
    this.heardText(alts, 'voice');
  }

  /** o que ouviu/leu → engenhoca (certeza), ou "você quis dizer?" com 3 opções (nunca "nada acontece") */
  private heardText(alts: string[], how: 'voice' | 'type'): boolean {
    const p = parseBest(alts);
    this.lastParsed = p;
    this.net?.voice(this.me, p.heard || alts[0]);
    const said = (p.heard || alts[0] || '').trim();
    // receita do catálogo só para pedidos curtos e certeiros; o resto vira OBJETO FALADO (qualquer coisa!)
    const recipe = !!p.g && (p.sure || how === 'type') && p.rest.length === 0 && isCommand(said);
    if (!recipe && said && norm(said).length >= 2) {
      this.hud.heard(said, true, '✨');
      const ok = this.objs.make(said, how);
      if (ok && how === 'voice') {
        cavaSave().spoken++;
        persist();
      }
      return ok;
    }
    if (p.g && (p.sure || how === 'type')) {
      this.hud.heard(p.heard, true, fullName(p.g, p.mods));
      const ok = this.create(this.me, p.g, p.mods, how);
      if (ok && how === 'voice') {
        cavaSave().spoken++;
        persist();
      }
      return ok;
    }
    this.hud.heard(p.heard, false);
    this.logMiss(p);
    this.chooseCard(p);
    return false;
  }
  /** guarda o que não entendeu (só texto) e manda em lote para o serviço de relatórios */
  private logMiss(p: Parsed): void {
    if (!p.heard.trim()) return;
    this.misses.push(`“${p.heard.slice(0, 60)}” → ${p.g ? '?' + p.g.id : '-'} [${p.suggest.map((g) => g.id).join(',')}]`);
    if (this.misses.length >= 5) this.flushMisses();
  }
  private flushMisses(): void {
    if (!this.misses.length) return;
    const txt = '[cavafala voz não entendida] ' + this.misses.join(' | ');
    this.misses = [];
    void import('../../services/feedback').then((f) => f.submitReport(f.buildReport('other', txt, false, ''))).catch(() => {});
  }

  private closePanelGo(): void {
    this.hud.closePanel();
    this.paused = false;
  }
  /** "Você quis dizer?": até 3 engenhocas grandes para tocar + falar de novo / digitar */
  chooseCard(p: Parsed | null): void {
    if (this.hud.overlay) return;
    const opts: { g: GDef; mods: Mods }[] = [];
    if (p?.g) opts.push({ g: p.g, mods: p.mods });
    for (const g of p?.suggest ?? []) if (opts.length < 3 && !opts.some((o) => o.g === g)) opts.push({ g, mods: noMods() });
    const found = cavaSave().found;
    for (const id of ['trampolim', 'ponte', 'escada', 'canhao', 'escudo']) {
      const g = GADGETS.find((x) => x.id === id);
      if (opts.length < 3 && g && found.includes(id) && (!this.arena || g.arena || g.kind === 'weapon') && !opts.some((o) => o.g === g)) opts.push({ g, mods: noMods() });
    }
    this.paused = true;
    this.digHeld = this.useHeld = false;
    const heard = p?.heard.trim() ?? '';
    const d = this.hud.panel(
      `<div class="cf-card cf-choose">
        <h2>${heard ? `${esc(t('cavafala.voice.heard', 'Ouvi:'))} <q>${esc(heard)}</q>` : esc(t('cavafala.voice.nothing2', 'Não ouvi direito...'))}</h2>
        <p>${esc(p?.g ? t('cavafala.voice.meant', 'Você quis dizer?') : t('cavafala.voice.pick', 'Toque no que você quer criar:'))}</p>
        <div class="cf-opts3">${opts
          .map((o, i) => `<button class="cf-opt" data-i="${i}"><img src="${this.thumb(o.g, o.mods)}" alt=""/><b>${esc(fullName(o.g, o.mods))}</b><span>${Hud.costChips(o.g, o.mods, this.me.inv, this.theme)}</span></button>`)
          .join('')}</div>
        <div class="cf-row"><button class="cf-btn p" data-a="mic">${SVG.mic}${esc(t('cavafala.voice.again', 'Falar de novo'))}</button><button class="cf-btn w" data-a="kb">${SVG.kb}${esc(t('cavafala.btn.type', 'Digitar'))}</button><button class="cf-btn w" data-a="x">${esc(t('cavafala.close', 'Fechar'))}</button></div>
      </div>`,
    );
    d.querySelectorAll<HTMLButtonElement>('.cf-opt').forEach((b) =>
      b.addEventListener('click', () => {
        const o = opts[+b.dataset.i!];
        this.closePanelGo();
        this.create(this.me, o.g, o.mods, 'radial');
      }),
    );
    d.querySelector('[data-a=mic]')!.addEventListener('click', () => {
      this.closePanelGo();
      notify(t('cavafala.voice.hold', 'Segure FALAR enquanto fala!'), { icon: 'hand-tap', key: 'hold' });
    });
    d.querySelector('[data-a=kb]')!.addEventListener('click', () => {
      this.closePanelGo();
      this.openType();
    });
    d.querySelector('[data-a=x]')!.addEventListener('click', () => this.closePanelGo());
  }
  /** microfone: pedindo permissão (ask) ou bloqueado (denied) */
  private permCard(mode: 'ask' | 'denied'): void {
    this.hud.closePanel();
    this.paused = true;
    const d = this.hud.panel(
      `<div class="cf-card cf-perm"><div class="cf-permic">${SVG.mic}</div>
        <h2>${esc(mode === 'ask' ? t('cavafala.perm.askT', 'Deixa o Bloop ouvir você?') : t('cavafala.perm.deniedT', 'O microfone está desligado'))}</h2>
        <p>${esc(mode === 'ask' ? t('cavafala.perm.ask', 'Toque em PERMITIR na janelinha. O som só é usado para entender o que você quer criar.') : t('cavafala.perm.denied', 'Sem o microfone, o Bloop não escuta. Libere nos ajustes do aparelho ou crie digitando.'))}</p>
        <div class="cf-row">${
          mode === 'denied'
            ? `<button class="cf-btn g" data-a="retry">${esc(t('cavafala.perm.retry', 'Permitir microfone'))}</button><button class="cf-btn" data-a="settings">${esc(t('cavafala.perm.settings', 'Abrir ajustes'))}</button>`
            : ''
        }<button class="cf-btn w" data-a="kb">${SVG.kb}${esc(t('cavafala.btn.type', 'Digitar'))}</button><button class="cf-btn w" data-a="ring">${SVG.book}${esc(t('cavafala.btn.recipes', 'Receitas'))}</button></div>
      </div>`,
    );
    d.dataset.perm = mode;
    d.querySelector('[data-a=retry]')?.addEventListener('click', async () => {
      const r = await askMicPermission();
      this.closePanelGo();
      if (r === 'granted') notify(t('cavafala.voice.ready', 'Microfone pronto! Segure FALAR e diga o que quer.'), { kind: 'good', icon: 'check' });
      else this.permCard('denied');
    });
    d.querySelector('[data-a=settings]')?.addEventListener('click', async () => {
      const ok = await openAppSettings();
      if (!ok) notify(t('cavafala.perm.howto', 'Ajustes → Apps → Bloop World → Permissões → Microfone'), { ms: 6000, icon: 'gear' });
    });
    d.querySelector('[data-a=kb]')!.addEventListener('click', () => {
      this.closePanelGo();
      this.openType();
    });
    d.querySelector('[data-a=ring]')!.addEventListener('click', () => {
      this.closePanelGo();
      this.openRing();
    });
  }
  /** sem voz agora (aparelho sem reconhecedor, demorou ou deu erro): digitar ou escolher */
  private noVoiceCard(why: 'none' | 'slow' | 'err' = 'none'): void {
    if (this.hud.overlay) return;
    this.paused = true;
    const msg =
      why === 'slow'
        ? t('cavafala.voice.slow', 'O reconhecimento de voz não respondeu. Crie digitando ou escolhendo:')
        : why === 'err'
          ? t('cavafala.voice.err', 'Não deu para ouvir. Tente de novo ou digite.')
          : t('cavafala.voice.none', 'Voz indisponível aqui: digite o que quer criar.');
    const d = this.hud.panel(
      `<div class="cf-card cf-perm"><div class="cf-permic off">${SVG.mic}</div><h2>${esc(msg)}</h2>
        <div class="cf-row"><button class="cf-btn g" data-a="kb">${SVG.kb}${esc(t('cavafala.btn.type', 'Digitar'))}</button><button class="cf-btn" data-a="ring">${SVG.book}${esc(t('cavafala.btn.recipes', 'Receitas'))}</button><button class="cf-btn w" data-a="x">${esc(t('cavafala.close', 'Fechar'))}</button></div></div>`,
    );
    d.querySelector('[data-a=kb]')!.addEventListener('click', () => {
      this.closePanelGo();
      this.openType();
    });
    d.querySelector('[data-a=ring]')!.addEventListener('click', () => {
      this.closePanelGo();
      this.openRing();
    });
    d.querySelector('[data-a=x]')!.addEventListener('click', () => this.closePanelGo());
  }

  /** cria pelo texto (painel de digitar e testes). Devolve true se começou a construir. */
  say(text: string): boolean {
    return this.heardText([text], 'type');
  }

  openType(): void {
    if (this.hud.overlay) return;
    this.paused = true;
    this.digHeld = this.useHeld = false;
    const found = cavaSave().found;
    const d = this.hud.panel(
      `<div class="cf-card" style="width:min(520px,92vw)">
        <h2>${t('cavafala.type.title', 'O que você quer criar?')}</h2>
        <div class="cf-input"><input type="text" maxlength="60" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="${t('cavafala.type.ph', 'ex.: ponte grande de pedra')}"/><button class="cf-btn g" data-a="go">${t('cavafala.type.go', 'Criar')}</button></div>
        <div class="cf-preview"></div>
        <div class="cf-sugs">${found
          .slice(0, 14)
          .map((id) => GADGETS.find((g) => g.id === id))
          .filter(Boolean)
          .map((g) => `<button class="cf-sug" data-w="${g!.name()}">${g!.name()}</button>`)
          .join('')}</div>
        <div class="cf-row"><button class="cf-btn o" data-a="gal">${esc(t('cavafala.obj.gallery', 'Minhas criações'))}</button><button class="cf-btn w" data-a="x">${t('cavafala.close', 'Fechar')}</button></div>
      </div>`,
    );
    d.querySelector('[data-a=gal]')!.addEventListener('click', () => this.objs.openGallery());
    const inp = d.querySelector('input')!;
    const prev = d.querySelector<HTMLDivElement>('.cf-preview')!;
    const upd = () => {
      const p = parseBest([inp.value]);
      if (!inp.value.trim()) prev.innerHTML = '';
      else if (p.g && p.rest.length === 0 && isCommand(inp.value)) prev.innerHTML = `<b>${fullName(p.g, p.mods)}</b> · ${Hud.costChips(p.g, p.mods, this.me.inv, this.theme)}`;
      else prev.innerHTML = `<b>✨ ${esc(t('cavafala.obj.willMake', 'Vou criar:'))}</b> ${esc(inp.value.trim().slice(0, 40))}`;
    };
    inp.addEventListener('input', upd);
    const close = () => {
      this.hud.closePanel();
      this.paused = false;
    };
    const go = () => {
      const v = inp.value.trim();
      if (!v) return;
      close();
      this.say(v);
    };
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') go();
      if (e.key === 'Escape') close();
    });
    d.querySelector('[data-a=go]')!.addEventListener('click', go);
    d.querySelector('[data-a=x]')!.addEventListener('click', close);
    d.querySelectorAll<HTMLButtonElement>('.cf-sug').forEach((b) =>
      b.addEventListener('click', () => {
        inp.value = b.dataset.w!;
        upd();
        inp.focus();
      }),
    );
    d.addEventListener('pointerdown', (e) => {
      if (e.target === d) close();
    });
    setTimeout(() => inp.focus(), 30);
  }

  openRing(page = 0): void {
    if (this.hud.overlay && page === 0) return;
    this.paused = true;
    this.digHeld = this.useHeld = false;
    const found = cavaSave()
      .found.map((id) => GADGETS.find((g) => g.id === id))
      .filter((g): g is GDef => !!g);
    const per = 10;
    const pages = Math.max(1, Math.ceil(found.length / per));
    page = page % pages;
    const list = found.slice(page * per, page * per + per);
    const n = list.length;
    const items = list
      .map((g, i) => {
        const a = (i / Math.max(1, n)) * TAU - Math.PI / 2;
        const ok = canPay(this.me.inv, costOf(g, noMods()));
        return `<button class="cf-ri${ok ? '' : ' no'}" data-id="${g.id}" style="left:${50 + Math.cos(a) * 38}%;top:${50 + Math.sin(a) * 38}%"><img src="${this.thumb(g, noMods())}" alt=""/><b>${g.name()}</b></button>`;
      })
      .join('');
    const d = this.hud.panel(`<div class="cf-ring">${items}<div class="cf-rc">${t('cavafala.ring.hint', 'Toque para ver')}</div></div>${pages > 1 ? `<button class="cf-btn w" data-a="more" style="position:absolute;right:16px;bottom:16px">${t('cavafala.ring.more', 'Mais')} ${page + 1}/${pages}</button>` : ''}<button class="cf-btn w" data-a="x" style="position:absolute;left:16px;bottom:16px">${t('cavafala.close', 'Fechar')}</button><button class="cf-btn w" data-a="kb" style="position:absolute;left:16px;top:calc(env(safe-area-inset-top,0px) + 12px)">${SVG.kb}${t('cavafala.btn.type', 'Digitar')}</button><button class="cf-btn o" data-a="gal" style="position:absolute;right:16px;top:calc(env(safe-area-inset-top,0px) + 12px)">${esc(t('cavafala.obj.gallery', 'Minhas criações'))}</button>`);
    d.querySelector('[data-a=gal]')!.addEventListener('click', () => this.objs.openGallery());
    const center = d.querySelector<HTMLDivElement>('.cf-rc')!;
    let picked: GDef | null = null;
    const close = () => {
      this.hud.closePanel();
      this.paused = false;
    };
    d.querySelectorAll<HTMLButtonElement>('.cf-ri').forEach((b) =>
      b.addEventListener('click', () => {
        const g = GADGETS.find((x) => x.id === b.dataset.id)!;
        if (picked === g) {
          close();
          this.create(this.me, g, noMods(), 'radial');
          return;
        }
        picked = g;
        sfx.click();
        d.querySelectorAll('.cf-ri').forEach((x) => x.classList.toggle('on', x === b));
        center.innerHTML = `<div><b>${g.name()}</b><br><small style="font-weight:600">${g.desc()}</small><br>${Hud.costChips(g, noMods(), this.me.inv, this.theme)}<br><small>${t('cavafala.ring.again', 'toque de novo = criar')}</small></div>`;
      }),
    );
    d.querySelector('[data-a=x]')!.addEventListener('click', close);
    d.querySelector('[data-a=more]')?.addEventListener('click', () => this.openRing(page + 1));
    d.querySelector('[data-a=kb]')!.addEventListener('click', () => {
      close();
      this.openType();
    });
    d.addEventListener('pointerdown', (e) => {
      if (e.target === d) close();
    });
  }

  /* ---------------------------- criar engenhocas ---------------------------- */
  /** paga e começa a montar. Devolve false se faltou material. */
  create(a: Actor, g: GDef, mods: Mods, how: 'voice' | 'type' | 'radial' | 'bot'): boolean {
    const cost = costOf(g, mods);
    if (!canPay(a.inv, cost)) {
      if (a.isPlayer) {
        const miss = missing(a.inv, cost);
        const txt = Object.entries(miss)
          .map(([k, v]) => `${v} ${matName(+k, this.theme ?? undefined)}`)
          .join(', ');
        notify(t('cavafala.need', '{g}: falta {m}. Cave mais!', { g: fullName(g, mods), m: txt }), { kind: 'warn', ms: 3600 });
        sfx.drop();
      }
      return false;
    }
    pay(a.inv, cost);
    if (a.isPlayer) {
      this.hud.setInv(a.inv);
      const isNew = discover(g.id);
      notify((how === 'voice' ? '🎤 ' : '') + t('cavafala.building', 'Montando: {g}', { g: fullName(g, mods) }) + (isNew ? ' · ' + t('cavafala.newRecipe', 'receita nova!') : ''), { kind: 'good', key: 'build' });
      this.lastCreated = g.id;
      this.created++;
    } else a.model?.say(fullName(g, mods) + '!', 1800);
    const at = a.body.p.clone();
    const yaw = a.yaw;
    this.teleFar = null;
    if (g.kind === 'struct') this.placeStruct(a, g, mods);
    else this.buildTool(a, g, mods);
    this.net?.build(a, g, mods, at, yaw, this.teleFar);
    return true;
  }

  /** ponto das costas (de onde as peças saem voando) */
  private backpack(a: Actor, out: THREE.Vector3): THREE.Vector3 {
    if (a.isPlayer) {
      out.set(0.35, -0.55, 0.1).applyQuaternion(this.cam.quaternion).add(this.cam.position);
    } else out.copy(a.body.p).add(V3.set(0, 1, 0));
    return out;
  }

  private placeStruct(a: Actor, g: GDef, mods: Mods): void {
    const st = modStats(mods);
    const yaw = a.yaw;
    const fwd = V1.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    const chain = g.beh === 'bridge' || g.beh === 'stairs' || g.beh === 'ramp' || g.beh === 'slide';
    for (let k = 0; k < st.count; k++) {
      const pos = a.body.p.clone();
      if (k > 0) {
        if (chain) {
          pos.addScaledVector(fwd, (g.beh === 'bridge' ? 6 : 4.1) * st.scale * k);
          if (g.beh === 'stairs') pos.y += 3.36 * st.scale * k;
          if (g.beh === 'ramp') pos.y += 2 * st.scale * k;
        } else pos.add(V2.set(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar((k % 2 ? 1 : -1) * 3.2 * st.scale));
      }
      if (g.terrain) {
        this.growTerrain(a, g, mods, pos, yaw);
        continue;
      }
      const snap = !chain && g.beh !== 'platform';
      if (snap) {
        const cx = pos.x + fwd.x * 2 * st.scale,
          cz = pos.z + fwd.z * 2 * st.scale;
        const gy = this.T.groundY(cx, cz, pos.y + 2.5, pos.y - 6);
        if (gy > -Infinity) pos.y = gy - 0.05;
      }
      this.spawnStruct(a, g, mods, pos, yaw, true);
    }
  }

  spawnStruct(a: Actor | null, g: GDef, mods: Mods, pos: THREE.Vector3, yaw: number, animate: boolean): Struct {
    const st = modStats(mods);
    const built = buildModel(g, mods);
    const group = built.group;
    group.position.copy(pos);
    group.rotation.y = yaw;
    this.scene.add(group);
    group.updateMatrixWorld(true);
    const s: Struct = { g, mods, group, built, cols: [], pos: pos.clone(), yaw, power: st.power, scale: st.scale, owner: a, pair: null, age: 0, vel: new THREE.Vector3(), hover: 0, light: null, done: !animate, dead: false };
    const sc = st.scale;
    const add = (lx: number, ly: number, lz: number, hx: number, hy: number, hz: number, pitch = 0, tag: OBox['tag'] = '', power = 1) => {
      const box = new OBox(0, 0, 0, hx * sc, hy * sc, hz * sc, yaw, pitch);
      box.tag = tag;
      box.power = power * st.power;
      box.owner = s;
      s.cols.push({ box, lx: lx * sc, ly: ly * sc, lz: lz * sc });
    };
    switch (g.beh) {
      case 'bridge':
        add(0, -0.02, -3, 1.1, 0.1, 3);
        break;
      case 'stairs':
        add(0, 1.72, -2.2, 0.8, 0.16, 2.75, 0.68);
        break;
      case 'ramp':
        add(0, 1.0, -2.1, 1.2, 0.11, 2.15, 0.5);
        break;
      case 'trampoline':
        add(0, 0.5, -1.6, 1.1, 0.08, 1.1, 0, 'bounce', 1);
        break;
      case 'catapult':
        add(0, 0.45, -2.2, 0.9, 0.2, 1.1);
        add(0, 2.05, -0.75, 0.55, 0.15, 0.55, 0, 'launch', 1);
        break;
      case 'fan':
        add(0, 0.8, -2, 0.35, 0.8, 0.35);
        break;
      case 'teleport':
        add(0, 0.1, -2, 1, 0.12, 1, 0, 'tele');
        break;
      case 'pump':
        add(0, 0.45, -2, 0.6, 0.45, 0.5);
        break;
      case 'slide':
        add(0, 1.4, -2.5, 0.7, 0.08, 2.5, -0.5, 'slide');
        break;
      case 'jelly':
        add(0, 0.6, -2.2, 1, 0.6, 1, 0, 'bounce', 0.78);
        break;
      case 'shelter':
        add(-1.4, 1, -2.5, 0.13, 1, 1.5);
        add(1.4, 1, -2.5, 0.13, 1, 1.5);
        add(0, 1, -3.9, 1.5, 1, 0.13);
        add(0, 2.2, -2.5, 1.7, 0.2, 1.8);
        break;
      case 'lamp':
        add(0, 1.5, -2, 0.15, 1.5, 0.15);
        break;
      case 'elevator':
        add(0, 0.15, -2.2, 1.1, 0.12, 1.1, 0, 'lift');
        break;
      case 'fence':
        add(0, 0.5, -2, 2.7, 0.5, 0.08);
        break;
      case 'decoy':
        add(0, 0.9, -2, 0.5, 0.9, 0.5);
        break;
      case 'platform':
        add(0, 2, -2.5, 1.5, 0.12, 1.5);
        break;
    }
    if (mods.modules.includes('mola')) for (const c of s.cols) if (!c.box.tag && c.box.pitch === 0) (c.box.tag = 'bounce'), (c.box.power = 0.75);
    if (mods.modules.includes('gelo')) for (const c of s.cols) if (!c.box.tag) c.box.tag = 'slide';
    if (g.beh === 'catapult') {
      const lc = s.cols[1].box;
      lc.dir.set(0, 1, -1.05).normalize().applyAxisAngle(UP, yaw);
    }
    this.placeCols(s);
    if (mods.modules.includes('rodas')) s.vel.set(-Math.sin(yaw), 0, -Math.cos(yaw)).multiplyScalar(2.6);
    if (mods.modules.includes('foguete')) s.vel.set(-Math.sin(yaw), 0.9, -Math.cos(yaw)).multiplyScalar(6);
    if (mods.modules.includes('helice')) s.hover = 0.01;
    if ((g.beh === 'lamp' || mods.modules.includes('luz')) && this.lights < this.q.lights) {
      s.light = new THREE.PointLight('#ffe6a0', 18, 14, 1.6);
      s.light.position.set(0, (g.beh === 'lamp' ? 3.2 : 2) * st.scale, -2 * st.scale);
      group.add(s.light);
      this.lights++;
    }
    if (g.beh === 'teleport' && a) {
      // par: o 2º portal vai onde você está mirando (ou 12 m à frente)
      let far: THREE.Vector3;
      if (this.teleForce) far = this.teleForce.clone();
      else {
        const dir = a.isPlayer ? this.aimDir(V2) : V2.set(-Math.sin(yaw), -0.3, -Math.cos(yaw)).normalize();
        const o = a.isPlayer ? this.cam.position : V3.copy(a.body.p).add(UP);
        const hit = this.T.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, 30);
        if (hit && hit.dist > 5) far = new THREE.Vector3(hit.x, hit.y, hit.z).add(new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(-2));
        else far = pos.clone().addScaledVector(new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), 14);
        const gy = this.T.groundY(far.x, far.z, far.y + 3, far.y - 8);
        if (gy > -Infinity) far.y = gy;
      }
      this.teleFar = far.clone();
      const twin = this.spawnStruct(null, g, mods, far, yaw + Math.PI, true);
      twin.owner = a;
      s.pair = twin;
      twin.pair = s;
    }
    this.structs.push(s);
    this.refreshBoxes();
    if (animate) this.animateBuild(a ?? this.me, group, built.parts, false, () => this.structDone(s));
    if (s.owner) this.mode?.onCreate?.(s.owner, g, mods, s);
    return s;
  }
  private placeCols(s: Struct): void {
    const cy = Math.cos(s.yaw),
      sy = Math.sin(s.yaw);
    for (const c of s.cols) {
      c.box.x = s.pos.x + c.lx * cy + c.lz * sy;
      c.box.y = s.pos.y + c.ly;
      c.box.z = s.pos.z - c.lx * sy + c.lz * cy;
      c.box.update();
    }
  }
  private structDone(s: Struct): void {
    s.done = true;
    const p = V1.copy(s.pos).add(V2.set(-Math.sin(s.yaw) * 2, 1, -Math.cos(s.yaw) * 2));
    this.fx.sparkle(p.x, p.y, p.z, 18);
    if (s.mods.modules.includes('confete')) this.fx.confetti(p.x, p.y, p.z, 40);
    if (this.isNear(p.x, p.y, p.z)) sfx.fix();
  }

  private growTerrain(a: Actor, g: GDef, mods: Mods, pos: THREE.Vector3, yaw: number): void {
    const st = modStats(mods);
    const sc = st.scale;
    const fwd = V1.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    const cx = pos.x + fwd.x * (g.beh === 'block' ? 2.2 : 2.6) * sc,
      cz = pos.z + fwd.z * (g.beh === 'block' ? 2.2 : 2.6) * sc;
    let gy = this.T.groundY(cx, cz, pos.y + 2, pos.y - 6);
    if (gy === -Infinity) gy = pos.y - 0.5;
    const mat = mods.mat || (g.beh === 'tower' ? M.Pedra : M.Terra);
    const dims = g.beh === 'wall' ? [3, 1.6, 0.6] : g.beh === 'tower' ? [1.25, 2.6, 1.25] : [1, 1, 1];
    const gr: Grow = { x: cx, y: gy - 0.4, z: cz, hx: dims[0] * sc, hy: dims[1] * sc + 0.2, hz: dims[2] * sc, yaw, mat, t: 0, dur: 0.9, twin: g.beh === 'tower', owner: a };
    this.grows.push(gr);
    if (this.isNear(cx, gy, cz)) {
      sfx.whoosh();
      this.fx.addShake(0.08);
    }
    this.mode?.onCreate?.(a, g, mods, null);
  }
  private updateGrows(dt: number): void {
    for (let i = this.grows.length - 1; i >= 0; i--) {
      const g = this.grows[i];
      g.t += dt;
      const k = Math.min(1, g.t / g.dur);
      const e = 1 - (1 - k) * (1 - k);
      const h = g.hy * e;
      this.T.add(g.x, g.y + h, g.z, { hx: g.hx, hy: h, hz: g.hz, yaw: g.yaw }, g.mat);
      if (g.twin) this.T.add(g.x, g.y + h, g.z, { hx: g.hx, hy: h, hz: g.hz, yaw: g.yaw + Math.PI / 4 }, g.mat);
      if (Math.random() < 0.6) {
        const col = matColor(g.mat, this.theme ?? undefined);
        this.fx.chunks(g.x + (Math.random() - 0.5) * g.hx * 2, g.y + h * 2, g.z + (Math.random() - 0.5) * g.hz * 2, 0, 1, 0, col, 1, 3);
        // material voando das costas
        const bp = this.backpack(g.owner, V2);
        this.fx.parts.emit(bp.x, bp.y, bp.z, (g.x - bp.x) * 1.6, (g.y + h - bp.y) * 1.6 + 3, (g.z - bp.z) * 1.6, { tile: 3, color: col, life: 0.6, size: 0.09, grav: 6 });
      }
      if (k >= 1) {
        this.grows.splice(i, 1);
        this.fx.dust(g.x, g.y + g.hy * 2, g.z, '#ffffff', 10);
        if (this.isNear(g.x, g.y, g.z)) sfx.thud();
      }
    }
  }

  private buildTool(a: Actor, g: GDef, mods: Mods): void {
    const built = buildModel(g, mods, true);
    const group = built.group;
    if (a.isPlayer) {
      const p = V1.set(0, -0.15, -1.25).applyQuaternion(this.cam.quaternion).add(this.cam.position);
      group.position.copy(p);
      group.quaternion.copy(this.cam.quaternion);
      group.rotateY(Math.PI * 0.85);
      group.scale.setScalar(g.kind === 'vehicle' ? 0.45 : 1.3);
    } else {
      group.position.copy(a.body.p).add(V1.set(0, 1.6, 0));
      group.scale.setScalar(g.kind === 'vehicle' ? 0.4 : 1);
    }
    this.scene.add(group);
    group.updateMatrixWorld(true);
    this.animateBuild(a, group, built.parts, true, () => {
      this.scene.remove(group);
      this.giveSlot(a, g, mods);
      if (a.isPlayer) {
        sfx.fix();
        this.fx.sparkle(group.position.x, group.position.y, group.position.z, 12);
        if (mods.modules.includes('confete')) this.fx.confetti(group.position.x, group.position.y, group.position.z, 30);
      }
      this.mode?.onCreate?.(a, g, mods, null);
    });
  }

  private animateBuild(a: Actor, group: THREE.Group, parts: THREE.Object3D[], tool: boolean, onDone: () => void): void {
    group.updateMatrixWorld(true);
    const bp = this.backpack(a, new THREE.Vector3());
    const local = group.worldToLocal(bp.clone());
    const list = parts.map((m, i) => {
      const to = m.position.clone();
      const s = m.scale.x;
      m.position.copy(local);
      m.scale.setScalar(0.001);
      return { m, to, from: local.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4)), s, delay: i * Math.min(0.07, 0.9 / parts.length), landed: false };
    });
    const dur = list.length ? list[list.length - 1].delay + 0.42 : 0.3;
    this.builds.push({ group, parts: list, t: 0, dur: dur + (tool ? 0.3 : 0.1), tool, actor: a, onDone });
  }
  private updateBuilds(dt: number): void {
    for (let i = this.builds.length - 1; i >= 0; i--) {
      const b = this.builds[i];
      b.t += dt;
      for (const p of b.parts) {
        const k = Math.max(0, Math.min(1, (b.t - p.delay) / 0.38));
        if (k <= 0) continue;
        const e = k < 1 ? 1 - Math.pow(1 - k, 3) : 1;
        p.m.position.lerpVectors(p.from, p.to, e);
        p.m.position.y += Math.sin(k * Math.PI) * 1.2 * (b.tool ? 0.3 : 1);
        const pop = k < 1 ? 0.3 + 0.7 * e + Math.sin(k * Math.PI) * 0.25 : 1;
        p.m.scale.setScalar(p.s * pop);
        p.m.rotation.z += k < 1 ? dt * 8 * (1 - k) : 0;
        if (k >= 1 && !p.landed) {
          p.landed = true;
          p.m.rotation.z = Math.round(p.m.rotation.z / TAU) * TAU + (p.m.rotation.z % TAU === 0 ? 0 : 0);
          if (b.actor.isPlayer || this.isNear(b.group.position.x, b.group.position.y, b.group.position.z)) sfx.click();
          if (b.actor.isPlayer) tap('light');
        }
      }
      if (b.tool && b.actor.isPlayer && b.t > b.dur - 0.3) {
        // voa para a mão
        const k = Math.min(1, (b.t - (b.dur - 0.3)) / 0.3);
        V1.set(0.3, -0.3, -0.5).applyQuaternion(this.cam.quaternion).add(this.cam.position);
        b.group.position.lerp(V1, k);
        b.group.scale.multiplyScalar(1 - k * 0.15);
      }
      if (b.t >= b.dur) {
        for (const p of b.parts) {
          p.m.position.copy(p.to);
          p.m.scale.setScalar(p.s);
        }
        this.builds.splice(i, 1);
        b.onDone();
      }
    }
  }

  /* ---------------------------- estruturas vivas ---------------------------- */
  private updateStructs(dt: number): void {
    let moved = false;
    for (const s of this.structs) {
      if (s.dead) continue;
      s.age += dt;
      for (const sp of s.built.spinners) sp.o.rotation[sp.ax] += dt * (s.g.beh === 'fan' ? 14 : 10);
      // rodas / foguete / hélice
      if (s.vel.lengthSq() > 0.001 && s.done) {
        s.pos.addScaledVector(s.vel, dt);
        if (s.mods.modules.includes('foguete')) {
          s.vel.y -= 9 * dt;
          if (s.age > 0.6 && this.T.sample(s.pos.x, s.pos.y - 0.1, s.pos.z) > 0) s.vel.set(0, 0, 0);
          if (Math.random() < 0.5) this.fx.dust(s.pos.x, s.pos.y + 0.5, s.pos.z, '#ffb35a', 2);
        } else {
          const gy = this.T.groundY(s.pos.x, s.pos.z, s.pos.y + 1.5, s.pos.y - 3);
          if (gy > -Infinity) s.pos.y += (gy - s.pos.y) * Math.min(1, dt * 6);
          if (s.age > 3.2) s.vel.set(0, 0, 0);
        }
        s.group.position.copy(s.pos);
        moved = true;
      }
      if (s.hover > 0) {
        s.hover = Math.min(2.5, s.hover + dt * 1.8);
        s.group.position.y = s.pos.y + s.hover + Math.sin(this.time * 2) * 0.15;
        for (const c of s.cols) c.box.y = s.pos.y + c.ly + s.hover + Math.sin(this.time * 2) * 0.15;
        for (const c of s.cols) c.box.update();
      }
      if (moved) this.placeCols(s);
      switch (s.g.beh) {
        case 'fan':
          if (s.done) this.wind(s, dt);
          break;
        case 'elevator': {
          const k = (Math.sin(s.age * 0.9 - Math.PI / 2) + 1) / 2;
          const h = 0.15 + k * 5.6 * s.scale;
          s.built.parts[0].position.y = h;
          const c = s.cols[0];
          c.ly = h;
          this.placeCols(s);
          break;
        }
        case 'teleport':
          if (Math.random() < 0.3) {
            const p = V1.set(-Math.sin(s.yaw) * 2 * s.scale, 0.3, -Math.cos(s.yaw) * 2 * s.scale).add(s.pos);
            this.fx.parts.emit(p.x + (Math.random() - 0.5) * 1.4, p.y, p.z + (Math.random() - 0.5) * 1.4, 0, 1.2, 0, { tile: 1, color: '#c8a0ff', life: 0.9, size: 0.06 });
          }
          break;
        case 'pump':
          if (Math.random() < 0.2) {
            const p = V1.set(-Math.sin(s.yaw) * 2, 2.2, -Math.cos(s.yaw) * 2).add(s.pos);
            this.fx.water(p.x, p.y, p.z, 0, 1, 0);
          }
          break;
        case 'decoy':
          break;
      }
      if (s.mods.modules.includes('ima') && s.done) this.magnetPull(s.pos, 8, 6 * dt, s.owner);
      if (s.mods.modules.includes('bolhas') && Math.random() < 0.15) this.fx.foam(s.pos.x, s.pos.y + 1.5, s.pos.z, 2, '#bff4ff');
    }
    if (moved) this.refreshBoxes();
  }
  private wind(s: Struct, dt: number): void {
    const dir = V2.set(-Math.sin(s.yaw), 0, -Math.cos(s.yaw));
    const o = V3.copy(s.pos).addScaledVector(dir, 2 * s.scale);
    const L = 11 * s.power * (s.mods.fast ? 1.3 : 1);
    for (const a of this.actors) {
      if (!a.alive) continue;
      V1.copy(a.body.p).sub(o);
      const along = V1.dot(dir);
      if (along < 0 || along > L) continue;
      const side = V1.addScaledVector(dir, -along).length();
      if (side > 2.2 * s.scale) continue;
      const f = 30 * s.power * (1 - along / L) * (a.shieldT > 0 ? 0.3 : 1);
      a.body.v.addScaledVector(dir, f * dt);
      a.body.v.y += f * 0.25 * dt;
    }
    if (Math.random() < 0.4) {
      const p = V1.copy(o).add(V3.set((Math.random() - 0.5) * 1.5, 1.6 * s.scale + (Math.random() - 0.5), (Math.random() - 0.5) * 1.5));
      this.fx.parts.emit(p.x, p.y, p.z, dir.x * 9, 0.2, dir.z * 9, { tile: 2, color: '#ffffff', life: 0.7, size: 0.1, grow: 0.4 });
    }
  }
  private magnetPull(at: THREE.Vector3, R: number, k: number, owner: Actor | null): void {
    for (const a of this.actors) {
      if (!a.alive || a === owner) continue;
      V1.copy(at).sub(a.body.p);
      const d = V1.length();
      if (d > R || d < 1.2) continue;
      a.body.v.addScaledVector(V1.normalize(), k * 3 * (a.shieldT > 0 ? 0.2 : 1));
    }
  }

  /* ---------------------------- usar engenhoca ---------------------------- */
  useSlot(a: Actor, s: Slot, edge: boolean, dt: number, o: THREE.Vector3, dir: THREE.Vector3): void {
    const st = modStats(s.mods);
    const b = a.body;
    const consume = () => {
      if (s.uses > 0) {
        s.uses--;
        if (s.uses <= 0) {
          const i = a.slots.indexOf(s);
          if (i > 0) a.slots.splice(i, 1);
          a.sel = Math.min(a.sel, a.slots.length - 1);
        }
        if (a.isPlayer) this.updateHot();
      }
    };
    switch (s.g.kind) {
      case 'weapon': {
        if (a.useCd > 0) return;
        const beh = s.g.beh;
        const cd = (beh === 'glove' || beh === 'hammer' ? 0.55 : beh === 'confetti' ? 0.6 : beh === 'tornado' ? 2.2 : beh === 'digbomb' ? 0.8 : beh === 'bubble' ? 0.7 : 0.38) / st.speed;
        a.useCd = cd;
        this.useAnim = 1;
        if (beh === 'glove' || beh === 'hammer') this.melee(a, s, o, dir);
        else if (beh === 'tornado') this.spawnTornado(a, s, o, dir);
        else this.shoot(a, s, o, dir);
        if (!a.remote) this.net?.fire(a, s, o, dir);
        if (s.g.beh === 'digbomb') consume();
        this.mode?.onUse?.(a, s, null);
        break;
      }
      case 'vehicle':
        if (!edge) return;
        a.mounted = !a.mounted;
        if (a.isPlayer) {
          sfx.boing();
          notify(a.mounted ? t('cavafala.cart.on', 'Vrum! Ande para acelerar. USAR desce.') : t('cavafala.cart.off', 'Você desceu do carrinho.'), { key: 'cart', ms: 1600 });
        }
        break;
      case 'tool':
        switch (s.g.beh) {
          case 'balloon':
            b.v.y += (4.2 * st.power - b.v.y) * Math.min(1, dt * 3);
            if (Math.random() < 0.05 && a.isPlayer) sfx.squeak();
            break;
          case 'jetpack':
            if (a.fuel > 0) {
              b.v.y += 32 * st.power * dt;
              if (b.v.y > 9) b.v.y = 9;
              a.fuel -= dt / (2.4 * st.scale);
              b.onGround = false;
              this.fx.parts.emit(b.p.x, b.p.y + 0.6, b.p.z, (Math.random() - 0.5) * 2, -6, (Math.random() - 0.5) * 2, { tile: 2, color: '#ffb35a', life: 0.4, size: 0.18, grow: 0.5 });
              if (a.isPlayer && Math.random() < 0.15) sfx.fire();
            } else if (edge && a.isPlayer) notify(t('cavafala.fuel', 'Sem combustível! Pouse para recarregar.'), { key: 'fuel', kind: 'warn' });
            break;
          case 'umbrella':
            if (b.v.y < -1.5) b.v.y = -1.5;
            break;
          case 'hook': {
            if (!edge) return;
            const hit = this.T.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, 28 * st.scale);
            if (hit) {
              a.hook = new THREE.Vector3(hit.x, hit.y, hit.z);
              a.useCd = 1.6;
              sfx.throw();
            } else if (a.isPlayer) notify(t('cavafala.hook.miss', 'Mire numa parede ou no chão!'), { key: 'hook' });
            break;
          }
          case 'shield':
            if (!edge || a.shieldCd > 0) return;
            a.shieldT = 4.5 * st.power;
            a.shieldCd = 8 / st.speed;
            sfx.bubble();
            sfx.sparkle();
            break;
          case 'magnet':
            this.magnetPull(b.p, 12 * st.scale, 9 * dt * st.power, a);
            if (Math.random() < 0.3) {
              const p = V1.copy(o).addScaledVector(dir, 3 + Math.random() * 6);
              this.fx.parts.emit(p.x, p.y, p.z, -dir.x * 8, -dir.y * 8, -dir.z * 8, { tile: 1, color: '#ff8a8a', life: 0.4, size: 0.06 });
            }
            break;
          case 'flashlight':
            if (!edge) return;
            s.on = !s.on;
            if (a.isPlayer) {
              if (s.on && !this.flash) {
                this.flash = new THREE.SpotLight('#fff6d0', 40, 30 * st.scale, 0.55, 0.5, 1.2);
                this.scene.add(this.flash, this.flash.target);
              }
              if (this.flash) this.flash.visible = s.on;
              sfx.click();
            }
            break;
          case 'watering': {
            const p = V1.copy(o).addScaledVector(dir, 0.8).add(V2.set(0, -0.3, 0));
            this.fx.water(p.x, p.y, p.z, dir.x, dir.y + 0.2, dir.z);
            if (Math.random() < 0.1) sfx.spray();
            this.mode?.onUse?.(a, s, V3.copy(o).addScaledVector(dir, 3));
            break;
          }
          case 'rocket':
            if (!edge) return;
            b.v.y = 21 * st.power;
            b.onGround = false;
            this.fx.dust(b.p.x, b.p.y, b.p.z, '#ffb35a', 20);
            this.fx.confetti(b.p.x, b.p.y + 0.5, b.p.z, 20);
            sfx.whoosh();
            this.fx.addShake(0.25);
            consume();
            break;
          case 'digbot': {
            if (!edge) return;
            const hit = this.T.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, 20);
            const at = hit ? new THREE.Vector3(hit.x, hit.y, hit.z) : V1.copy(b.p).addScaledVector(dir, 4).clone();
            this.spawnDigbot(a, s, at);
            if (!a.remote) this.net?.fire(a, s, o, dir);
            consume();
            break;
          }
          default:
            break;
        }
        if (edge) this.mode?.onUse?.(a, s, null);
        break;
    }
  }

  private shoot(a: Actor, s: Slot, o: THREE.Vector3, dir: THREE.Vector3): void {
    const st = modStats(s.mods);
    const mods = s.mods.modules;
    const beh = s.g.beh;
    const n = beh === 'confetti' ? 5 : st.count;
    for (let i = 0; i < n; i++) {
      const spread = beh === 'confetti' ? 0.16 : st.count > 1 ? 0.06 : 0;
      const d = V2.copy(dir);
      if (spread) d.applyAxisAngle(UP, (i - (n - 1) / 2) * spread).add(V3.set(0, (Math.random() - 0.5) * spread, 0)).normalize();
      const speed = (beh === 'bubble' ? 11 : beh === 'digbomb' ? 15 : beh === 'confetti' ? 20 : 24) * st.speed * (mods.includes('foguete') ? 1.6 : 1);
      const r = (beh === 'bubble' ? 0.4 : beh === 'confetti' ? 0.12 : 0.24) * Math.sqrt(st.scale);
      const col = beh === 'bubble' || mods.includes('bolhas') ? '#bff4ff' : beh === 'snow' ? '#ffffff' : beh === 'digbomb' ? '#5a5f78' : beh === 'confetti' ? ['#ff4f6a', '#ffd34a', '#5ab0ff', '#5ad6a0', '#b05aff'][i % 5] : s.mods.mat === M.Ouro ? '#ffe680' : '#fff4e6';
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), beh === 'bubble' || mods.includes('bolhas') ? new THREE.MeshLambertMaterial({ color: col, transparent: true, opacity: 0.5, depthWrite: false }) : lam(col, beh === 'confetti' ? 0.3 : 0.15));
      const start = V1.copy(o).addScaledVector(d, 0.8);
      if (a.isPlayer) start.add(V3.set(0.2, -0.15, 0).applyQuaternion(this.cam.quaternion));
      mesh.position.copy(start);
      this.scene.add(mesh);
      this.projs.push({
        p: start.clone(),
        v: d.clone().multiplyScalar(speed).add(V3.set(0, beh === 'digbomb' ? 3 : 1, 0)),
        kind: beh,
        power: st.power * (mods.includes('espuma') ? 1.2 : 1) * (beh === 'confetti' ? 0.35 : beh === 'bubble' ? 0.4 : beh === 'snow' ? 0.6 : 1),
        owner: a,
        life: 3,
        r,
        mesh,
        bounces: mods.includes('mola') ? 2 : 0,
        homing: mods.includes('ima'),
        trap: beh === 'bubble' || mods.includes('bolhas'),
        slow: beh === 'snow' || mods.includes('gelo'),
        grav: mods.includes('helice') ? 0 : beh === 'bubble' ? 1 : beh === 'digbomb' ? 14 : 4,
        confetti: beh === 'confetti' || mods.includes('confete'),
      });
    }
    if (a.isPlayer || this.isNear(o.x, o.y, o.z)) (beh === 'bubble' ? sfx.bubble : beh === 'digbomb' ? sfx.throw : sfx.throw)();
    if (a.isPlayer) {
      this.fx.addShake(0.05);
      tap('light');
    }
  }

  private melee(a: Actor, s: Slot, o: THREE.Vector3, dir: THREE.Vector3): void {
    const st = modStats(s.mods);
    const range = 3.2 * Math.sqrt(st.scale);
    let hitAny = false;
    for (const t2 of this.actors) {
      if (t2 === a || !t2.alive) continue;
      V1.copy(t2.body.p).add(V3.set(0, 0.8, 0)).sub(o);
      const d = V1.length();
      if (d > range) continue;
      if (V1.normalize().dot(dir) < 0.55) continue;
      const kd = V2.copy(dir).setY(0).normalize();
      this.knock(t2, kd.x, s.g.beh === 'hammer' ? 1.2 : 0.2, kd.z, (s.g.beh === 'hammer' ? 1.25 : 1.55) * st.power, a);
      hitAny = true;
    }
    const p = V1.copy(o).addScaledVector(dir, 1.6);
    this.fx.foam(p.x, p.y, p.z, hitAny ? 14 : 5, s.g.beh === 'hammer' ? '#ffe680' : '#ffd0d0');
    if (a.isPlayer || this.isNear(o.x, o.y, o.z)) (hitAny ? sfx.kick : sfx.swish)();
  }

  private spawnTornado(a: Actor, s: Slot, _o: THREE.Vector3, dir: THREE.Vector3): void {
    const st = modStats(s.mods);
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.4 + i * 0.35, 0.9, 14, 1, true), new THREE.MeshLambertMaterial({ color: '#e8f0ff', transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }));
      c.rotation.x = Math.PI;
      c.position.y = 0.45 + i * 0.8;
      g.add(c);
    }
    g.scale.setScalar(st.scale);
    const p = V1.copy(a.body.p).addScaledVector(V2.copy(dir).setY(0).normalize(), 2);
    g.position.copy(p);
    this.scene.add(g);
    this.tornados.push({ o: g, p: p.clone(), v: V2.copy(dir).setY(0).normalize().multiplyScalar(6 * st.speed).clone(), t: 4, owner: a, power: st.power });
    sfx.whoosh();
  }
  private updateTornados(dt: number): void {
    for (let i = this.tornados.length - 1; i >= 0; i--) {
      const tn = this.tornados[i];
      tn.t -= dt;
      tn.p.addScaledVector(tn.v, dt);
      const gy = this.T.groundY(tn.p.x, tn.p.z, tn.p.y + 2, tn.p.y - 8);
      if (gy > -Infinity) tn.p.y += (gy - tn.p.y) * Math.min(1, dt * 5);
      tn.o.position.copy(tn.p);
      tn.o.rotation.y += dt * 12;
      tn.o.children.forEach((c, k) => (c.rotation.y = this.time * (4 + k)));
      for (const a of this.actors) {
        if (a === tn.owner || !a.alive) continue;
        V1.copy(a.body.p).sub(tn.p);
        const d = Math.hypot(V1.x, V1.z);
        if (d > 2.6 || Math.abs(V1.y) > 4) continue;
        const k = (1 - d / 2.6) * 26 * tn.power * dt * (a.shieldT > 0 ? 0.25 : 1);
        a.body.v.x += (V1.x / (d || 1)) * k + -V1.z * 0.3 * k;
        a.body.v.z += (V1.z / (d || 1)) * k + V1.x * 0.3 * k;
        a.body.v.y = Math.max(a.body.v.y, 5 * tn.power);
        a.lastHit = tn.owner;
      }
      if (Math.random() < 0.5) this.fx.dust(tn.p.x, tn.p.y + 0.3, tn.p.z, '#e8f0ff', 2);
      if (tn.t <= 0 || tn.p.y < -10) {
        this.scene.remove(tn.o);
        tn.o.traverse((c) => {
          const m = c as THREE.Mesh;
          if (m.isMesh) {
            m.geometry.dispose();
            (m.material as THREE.Material).dispose();
          }
        });
        this.tornados.splice(i, 1);
      }
    }
  }

  private spawnDigbot(a: Actor, s: Slot, at: THREE.Vector3): void {
    const b = buildModel(s.g, s.mods, true);
    b.group.scale.setScalar(2.2);
    b.group.position.copy(at);
    this.scene.add(b.group);
    this.digbots.push({ o: b.group, p: at.clone(), t: 10 * modStats(s.mods).power, owner: a, target: at.clone() });
    sfx.fix();
  }
  private updateDigbots(dt: number): void {
    for (let i = this.digbots.length - 1; i >= 0; i--) {
      const d = this.digbots[i];
      d.t -= dt;
      d.o.rotation.y += dt * 3;
      d.o.position.y = d.p.y + Math.abs(Math.sin(this.time * 12)) * 0.15;
      if (Math.floor(d.t * 5) !== Math.floor((d.t + dt) * 5)) {
        const ang = this.time * 2.3;
        const p = V1.set(d.p.x + Math.cos(ang) * 1.2, d.p.y - 0.4, d.p.z + Math.sin(ang) * 1.2);
        const got: Inv = {};
        // robô de outro aparelho: só o dono cava (a cavada chega pela rede)
        const n = d.owner.remote ? 0 : this.T.dig(p.x, p.y, p.z, 1.1, got, 1.4);
        if (n > 0 && this.net) this.net.dig(p.x, p.y, p.z, 1.1, 1.4);
        if (n > 0) {
          for (const [k, v] of Object.entries(got)) d.owner.inv[+k] = (d.owner.inv[+k] ?? 0) + v!;
          const mm = this.T.matAt(p.x, p.y - 0.5, p.z);
          if (this.isNear(p.x, p.y, p.z)) this.fx.chunks(p.x, p.y, p.z, 0, 1, 0, matColor(mm || M.Terra, this.theme ?? undefined), 3, 4);
          if (d.owner.isPlayer) this.hud.setInv(d.owner.inv);
          this.mode?.onDig?.(d.owner, got, p.clone());
        }
        d.p.y -= 0.12;
      }
      if (d.t <= 0) {
        this.fx.sparkle(d.p.x, d.p.y + 0.5, d.p.z, 14);
        this.scene.remove(d.o);
        this.digbots.splice(i, 1);
      }
    }
  }

  /* ---------------------------- projéteis ---------------------------- */
  private updateProjs(dt: number): void {
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const p = this.projs[i];
      p.life -= dt;
      p.v.y -= p.grav * dt;
      if (p.homing) {
        const tg = this.nearestFoe(p.owner, p.p, 14);
        if (tg) {
          V1.copy(tg.body.p).add(V2.set(0, 0.8, 0)).sub(p.p).normalize().multiplyScalar(p.v.length());
          p.v.lerp(V1, Math.min(1, dt * 3));
        }
      }
      p.p.addScaledVector(p.v, dt);
      p.mesh.position.copy(p.p);
      if (p.kind === 'bubble') p.mesh.scale.setScalar(1 + Math.sin(this.time * 10 + i) * 0.08);
      let done = p.life <= 0 || p.p.y < -20;
      // atingiu um Bloop?
      for (const a of this.actors) {
        if (done || a === p.owner || !a.alive) continue;
        const dx = a.body.p.x - p.p.x,
          dy = a.body.p.y + 0.75 - p.p.y,
          dz = a.body.p.z - p.p.z;
        if (dx * dx + dy * dy + dz * dz < (p.r + 0.55) ** 2) {
          const v = V1.copy(p.v).setY(0).normalize();
          if (p.kind === 'digbomb') {
            this.impact(p);
          } else {
            this.knock(a, v.x, 0.3, v.z, p.power, p.owner);
            if (p.trap && a.shieldT <= 0) a.trapT = 1.8;
            if (p.slow) a.slowT = 2.5;
            this.fx.foam(p.p.x, p.p.y, p.p.z, 16, p.trap ? '#bff4ff' : '#ffffff');
            if (p.confetti) this.fx.confetti(p.p.x, p.p.y, p.p.z, 16);
            if (this.isNear(p.p.x, p.p.y, p.p.z)) sfx.splat();
          }
          done = true;
        }
      }
      if (!done && this.T.sample(p.p.x, p.p.y, p.p.z) > -p.r * 0.5) {
        if (p.bounces > 0) {
          p.bounces--;
          this.T.normal(p.p.x, p.p.y, p.p.z, V1);
          p.v.reflect(V1).multiplyScalar(0.75);
          p.p.addScaledVector(V1, 0.3);
          sfx.boing();
        } else {
          this.impact(p);
          done = true;
        }
      }
      if (!done)
        for (const bx of this.phys.boxes) {
          V1.copy(p.p);
          const ox = V1.x,
            oy = V1.y,
            oz = V1.z;
          V1.applyMatrix4(bx.mi);
          if (Math.abs(V1.x) < bx.hx + p.r && Math.abs(V1.y) < bx.hy + p.r && Math.abs(V1.z) < bx.hz + p.r) {
            p.p.set(ox, oy, oz);
            this.impact(p);
            done = true;
            break;
          }
        }
      if (done) {
        this.scene.remove(p.mesh);
        const m = p.mesh as THREE.Mesh;
        m.geometry.dispose();
        if ((m.material as THREE.Material).transparent) (m.material as THREE.Material).dispose();
        this.projs.splice(i, 1);
      }
    }
  }
  private impact(p: Proj): void {
    const x = p.p.x,
      y = p.p.y,
      z = p.p.z;
    const near = this.isNear(x, y, z);
    if (p.kind === 'digbomb') {
      const got: Inv = {};
      const R = 2.5 * Math.sqrt(p.power);
      const n = p.owner.remote ? 0 : this.T.dig(x, y, z, R, got, 1.3);
      if (n > 0 && this.net) this.net.dig(x, y, z, R, 1.3);
      for (const [k, v] of Object.entries(got)) p.owner.inv[+k] = (p.owner.inv[+k] ?? 0) + v!;
      if (p.owner.isPlayer) this.hud.setInv(p.owner.inv);
      const col = matColor(this.T.matAt(x, y - 1, z) || M.Terra, this.theme ?? undefined);
      if (near) {
        this.fx.chunks(x, y, z, 0, 1, 0, col, 16, 7);
        this.fx.dust(x, y, z, col, 16);
        this.fx.confetti(x, y + 0.5, z, 24);
        sfx.poof();
        sfx.bump();
        this.fx.addShake(0.35 * Math.max(0, 1 - this.cam.position.distanceTo(p.p) / 25));
      }
      for (const a of this.actors) {
        if (!a.alive) continue;
        V1.copy(a.body.p).sub(p.p);
        const d = V1.length();
        if (d < R + 1.5) {
          V1.setY(0).normalize();
          this.knock(a, V1.x, 0.6, V1.z, 1.1 * (1 - d / (R + 1.5)) + 0.3, p.owner);
        }
      }
      if (n > 0) this.mode?.onDig?.(p.owner, got, p.p.clone());
      return;
    }
    if (near) {
      this.fx.foam(x, y, z, p.kind === 'confetti' ? 4 : 14, p.trap ? '#bff4ff' : p.slow ? '#ffffff' : '#fff4e6');
      if (p.confetti) this.fx.confetti(x, y, z, 12);
      sfx.splat();
    }
    // empurrão em área (espuma)
    if (p.kind === 'foam')
      for (const a of this.actors) {
        if (!a.alive || a === p.owner) continue;
        V1.copy(a.body.p).sub(p.p);
        const d = V1.length();
        if (d < 1.8) {
          V1.setY(0).normalize();
          this.knock(a, V1.x, 0.3, V1.z, p.power * 0.5 * (1 - d / 1.8), p.owner);
        }
      }
  }

  nearestFoe(me: Actor, at: THREE.Vector3, R: number): Actor | null {
    let best: Actor | null = null;
    let bd = R * R;
    for (const a of this.actors) {
      if (a === me || !a.alive) continue;
      if (!this.arena && !a.helper && !a.isPlayer && me.isPlayer === false) continue;
      const d = a.body.p.distanceToSquared(at);
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    return best;
  }

  /** empurrão de desenho animado (sem dano: só a % de "splat" sobe e empurra mais) */
  knock(a: Actor, dx: number, dy: number, dz: number, power: number, by: Actor | null): void {
    if (!a.alive) return;
    if (this.net) {
      // online: quem usou a engenhoca decide o acerto
      if (by?.remote) return; // o dono manda o 'hit' (se acertou na tela dele)
      if (a.remote) {
        if (by) this.net.hit(a, dx, dy, dz, power, by);
        a.model?.splat();
        return;
      }
    }
    this.applyKnock(a, dx, dy, dz, power, by);
  }
  /** aplica o empurrão (local ou vindo da rede) */
  applyKnock(a: Actor, dx: number, dy: number, dz: number, power: number, by: Actor | null): void {
    if (!a.alive) return;
    if (a.shieldT > 0) {
      power *= 0.15;
      this.fx.foam(a.body.p.x, a.body.p.y + 0.8, a.body.p.z, 10, '#9af6ff');
      sfx.bubble();
    }
    if (this.arena) a.pct = Math.min(300, a.pct + 10 * power);
    const k = (4.5 + a.pct * 0.075) * power;
    a.body.v.x += dx * k;
    a.body.v.z += dz * k;
    a.body.v.y = Math.max(a.body.v.y, 0) + 2.5 + k * 0.4 + dy * k * 0.5;
    a.body.onGround = false;
    a.lastHit = by;
    a.stunT = 0.45 + a.pct * 0.004;
    a.mounted = false;
    a.hook = null;
    a.model?.splat();
    if (a.isPlayer) {
      this.fx.addShake(0.3);
      tap('medium');
      sfx.splat();
    }
  }

  /* ---------------------------- mão em 1ª pessoa ---------------------------- */
  private updateHand(dt: number): void {
    const a = this.me;
    const s = a.slots[a.sel];
    const key = s ? s.g.id + JSON.stringify(s.mods) : '';
    if (key !== a.heldKey) {
      a.heldKey = key;
      if (a.held) {
        this.hand.remove(a.held);
        a.held = null;
      }
      if (s) {
        const b = buildModel(s.g, s.mods, true);
        const g = b.group;
        const big = s.g.kind === 'vehicle';
        g.scale.multiplyScalar(big ? 0.07 : s.g.beh === 'balloon' || s.g.beh === 'umbrella' ? 0.4 : 0.42);
        if (s.g.beh === 'jetpack' || s.g.beh === 'spring') g.scale.multiplyScalar(0.8);
        a.held = g;
        this.hand.add(g);
        g.traverse((c) => {
          const m = c as THREE.Mesh;
          if (m.isMesh) m.castShadow = false;
        });
      }
    }
    const sp = Math.hypot(a.body.v.x, a.body.v.z);
    if (a.body.onGround) this.bob += dt * sp * 1.6;
    this.digAnim = Math.max(0, this.digAnim - dt * 6);
    this.useAnim = Math.max(0, this.useAnim - dt * 5);
    const dg = Math.sin(this.digAnim * Math.PI);
    const ug = this.useAnim;
    const bx = Math.sin(this.bob) * 0.012 * Math.min(1, sp / 5);
    const by = -Math.abs(Math.cos(this.bob)) * 0.014 * Math.min(1, sp / 5);
    this.hand.position.set(0.15 + bx, -0.2 + by - dg * 0.05 + (a.body.onGround ? 0 : 0.02), -0.42 - dg * 0.1 + ug * 0.06);
    this.hand.rotation.set(-0.15 - dg * 0.9 + ug * 0.35, 0.12, 0.05 + dg * 0.2);
    // pazinha vira para baixo ao cavar
    V1.copy(this.hand.position).add(V2.set(0.02, -0.04, 0.06));
    this.arm.set(V1, this.cam, 0.75, 0.3, 0.8);
    // escudo visível na tela
    if (a.held) a.held.position.set(0, 0.02, 0);
    this.hookLine.visible = !!a.hook;
    if (a.hook) {
      const pa = this.hookLine.geometry.getAttribute('position') as THREE.BufferAttribute;
      pa.setXYZ(0, a.body.p.x, a.body.p.y + 1.1, a.body.p.z);
      pa.setXYZ(1, a.hook.x, a.hook.y, a.hook.z);
      pa.needsUpdate = true;
    }
  }

  private hudT = 0;
  private updateHudLive(): void {
    this.hudT -= 1;
    if (this.hudT > 0) return;
    this.hudT = 6;
    this.hud.setInv(this.me.inv);
    this.hud.setStatus(this.mode?.status() ?? '');
    const s = this.me.slots[this.me.sel];
    const lab =
      !s || s.g.beh === 'shovel' || s.g.beh === 'drill'
        ? t('cavafala.btn.create', 'CRIAR')
        : s.g.kind === 'weapon'
          ? t('cavafala.btn.fire', 'JOGAR')
          : s.g.kind === 'vehicle'
            ? this.me.mounted
              ? t('cavafala.btn.off', 'DESCER')
              : t('cavafala.btn.ride', 'MONTAR')
            : t('cavafala.btn.use', 'USAR');
    const ready = !(s?.g.beh === 'shield' && this.me.shieldCd > 0) && !(s?.g.beh === 'jetpack' && this.me.fuel <= 0.05);
    this.hud.setUseLabel(lab, ready);
    const info = this.mode?.aimInfo?.(this.aimHit) ?? null;
    this.hud.setProgress(info?.name ?? null, info?.v ?? 0);
    const w = this.root.clientWidth,
      h = this.root.clientHeight;
    this.hud.pointAt(this.mode?.tutorialTarget?.() ?? null, this.cam, w, h);
  }

  /** dica única por sessão */
  tipOnce(id: string, text: string): void {
    if (this.tipShown.has(id)) return;
    this.tipShown.add(id);
    // dica aparece uma vez só (fica guardada): nada de muro de texto toda partida
    const sv = cavaSave() as { tips?: string[] };
    if ((sv.tips ??= []).includes(id)) return;
    sv.tips.push(id);
    persist();
    notify(text, { ms: 4200 });
  }

  /* ---------------------------- ciclo de vida ---------------------------- */
  setPaused(p: boolean): void {
    this.paused = p;
    this.digHeld = this.useHeld = this.jumpHeld = false;
    this.ctl.show(!p);
    if (p) {
      this.micOff(true);
      this.voice?.cancel();
      this.voice = null;
      this.voiceBusy = false;
      this.hud.listening(false);
    }
  }

  dispose(): void {
    this.dead = true;
    this.micOff(true);
    this.flushMisses();
    cancelAnimationFrame(this.raf);
    this.voice?.cancel();
    this.mode?.dispose?.();
    window.removeEventListener('keydown', this.keyH);
    window.removeEventListener('keyup', this.keyU);
    this.resizeObs.disconnect();
    this.ctl.dispose();
    this.objs.dispose();
    this.hud.dispose();
    for (const a of [...this.actors]) this.removeActor(a);
    this.fx.dispose();
    this.arm.dispose();
    this.T.dispose();
    this.town?.dispose();
    this.thumbRT?.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry && !(m as unknown as { isInstancedMesh?: boolean }).isInstancedMesh) m.geometry.dispose?.();
    });
    disposeGadgetCache();
    disposeCreationCache();
    disposeBloopCache();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}

export { MATS };
