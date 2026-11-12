/* ============================================================
 *  JANGADA BLOOP — o mundo: oceano, jangada, restos boiando, gancho,
 *  construção, sobrevivência, dia/noite, clima, ilhas, Mordelão,
 *  Capitão Bu, pesca, mergulho e o online (anfitrião manda no mundo).
 *
 *  Referencial: a jangada fica parada na origem; o mar (deslocamento
 *  das ondas), os restos e as ilhas passam por ela. Andar = mesma
 *  sensação da Cozinha (aceleração 10/s, freada 14/s, 3,3 m/s, balanço
 *  da cabeça 9 rad/s · 0,025 m, rolagem 0,008, deslizar nas paredes
 *  eixo a eixo), com pulo e gravidade de sobrevivência.
 * ============================================================ */
import * as THREE from 'three';
import { QualityGovernor, type Tier } from '../../core/quality';
import { tap } from '../../core/haptics';
import { t } from '../../i18n';
import { notify } from '../../ui/notify';
import { FpsControls } from '../../ui/touch';
import { Particles } from '../../3d/common/particles';
import { FpCamera, FpController, fpTuning } from '../../3d/fpkit';
import { PaperChar, mySpec, specOf, type PaperTool } from '../../3d/paper';
import { JAudio } from './audio';
import { Ghost, Shark } from './creatures';
import { BIOMES, FACTIONS, RING, TRADES, chestLoot, rarityName, worldMap, zoneAt, type BiomeDef, type IsleSpec } from './biomes';
import { Boat, type BoatSave } from './boats';
import { Kraken, Megalodon, type Boss, type BossCtx, type HitSphere } from './boss';
import { mapHtml, mapLegend, type Marker } from './mapui';
import { Owners, type Npc } from './owners';
import type { QteReq } from './qte';
import { chestModel, deathChestModel, harpoonGeo, isleFarGeo, spear3Geo } from './models2';
import {
  COOK,
  DAILY,
  DAY_LEN,
  DEBRIS,
  DEBRIS_W,
  DIFFS,
  FIRE_MAX,
  FIRE_UP,
  FOOD,
  FUEL,
  BOATS,
  FUEL_SEC,
  HOT_MAX,
  HOT_ORDER,
  ITEM,
  WEAPON,
  bagCount,
  isHarpoon,
  type BoatK,
  MISSIONS,
  NIGHT0,
  PIECE,
  bagAdd,
  bagHas,
  debrisLoot,
  isNight,
  itemName,
  type Bag,
  type DK,
  type Diff,
  type Food,
  type ItemId,
  type Mission,
  type PK,
  type Recipe,
} from './data';
import { Hud, type HotItem, type MisView } from './hud';
import { iconImage } from './icons';
import { Island, axeNode, nodeLoot, solidNode, underwaterNode, type INode } from './island';
import { CELL, DECK, FLOOR_H, MAT, debrisGeo, iconTexture, initMats, linkGeo, pieceGeo, floorGeo, foundationGeo, stairsGeo, toolGeo } from './models';
import type { JNet, NetEvent } from './net';
import { Ocean, SEABED_U, Sky, Underwater, skyAt, waveH, type SkyCols } from './ocean';
import { Seabed } from './seabed';
import { Raft, RaftView, bagMove, cellOf, pieceBag, type RPiece } from './raft';
import type { JgStats, JgWorld } from './save';

const EYE = 1.5;
const SPEED = 3.3;
const ACCEL = 10;
const DECEL = 14;
const GRAV = 18;
const JUMP_V = 5.6;
const RAD = 0.3;
const SWIM_SPEED = 2.3;
const REACH = 6.5;
const USE_R = 3.2;
const CURRENT = 0.9;
const SAIL = 1.7;
const TAU = Math.PI * 2;

interface Debris {
  id: number;
  k: DK;
  x: number;
  z: number;
  vx: number;
  vz: number;
  r: number;
  rv: number;
  ph: number;
  mesh: THREE.Mesh;
  hooked: boolean;
}
interface Remote {
  id: string;
  name: string;
  paper: PaperChar;
  label: HTMLDivElement;
  x: number;
  y: number;
  z: number;
  yaw: number;
  tx: number;
  ty: number;
  tz: number;
  tyaw: number;
  held: string;
  sw: boolean;
  act: number;
  seen: number;
  speed: number;
}
type Aim =
  | { k: 'piece'; p: RPiece }
  | { k: 'node'; n: INode; i: Island }
  | { k: 'shark'; s: Shark }
  | { k: 'ghost' }
  | { k: 'boat'; b: Boat }
  | { k: 'dchest'; c: DChest }
  | { k: 'npc'; n: Npc; o: Owners }
  | { k: 'boss'; b: Boss; h: HitSphere }
  | null;
/** baú boiando: itens de quem desmaiou (kind 0) ou tesouro do chefe (kind 1) */
interface DChest {
  id: number;
  kind: number;
  x: number;
  z: number;
  bag: Bag;
  coins: number;
  root: THREE.Group;
  beam: THREE.Mesh | null;
  ph: number;
}
interface Harpoon {
  p: THREE.Vector3;
  v: THREE.Vector3;
  life: number;
  dmg: number;
  mesh: THREE.Mesh;
  hit: boolean;
}
interface IsleSt {
  /** nós mortos */
  d: number[];
  /** descoberta */
  k?: 1;
  /** pedido do dono feito */
  q?: 1;
}

export interface WorldInit {
  root: HTMLElement;
  tier: Tier;
  diff: Diff;
  cam: number;
  data: JgWorld | null;
  net: JNet | null;
  myName: string;
  onPause(): void;
  onCam(mode: number): void;
  onCoins(n: number): void;
  onDawn(day: number): void;
  onSave(): void;
}

let debId = 1;

export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly cam: THREE.PerspectiveCamera;
  readonly hud: Hud;
  readonly au = new JAudio();
  private gov: QualityGovernor;
  private tier: Tier;
  private ctl: FpsControls;
  private touch: HTMLDivElement;
  private ocean: Ocean;
  private sky: Sky;
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private fx: Particles;
  private sc: SkyCols = skyAt(0.2, 0);
  raft: Raft;
  private rv: RaftView;
  private raftG = new THREE.Group();
  private ghostMesh: THREE.Mesh | null = null;
  private ghostKey = '';
  shark = new Shark();
  /** tubarões-tigre do mar aberto (meio/longe) */
  sharks2 = [new Shark(1), new Shark(1)];
  ghost = new Ghost();
  /** ilha carregada mais perto de mim (atualizada a cada quadro) */
  isl: Island | null = null;
  /** mapa do mar (fixo pela semente) */
  map: IsleSpec[] = [];
  isles = new Map<number, Island>();
  owners = new Map<number, Owners>();
  isleSt: Record<number, IsleSt> = {};
  private far = new Map<number, THREE.Mesh>();
  private streamT = 0;
  boats: Boat[] = [];
  myBoat: Boat | null = null;
  private boatSeq = 1;
  dch: DChest[] = [];
  private dchSeq = 1;
  bosses: Boss[] = [];
  bossDone: Record<string, number> = {};
  harpoons: Harpoon[] = [];
  private harpGeo = new Map<string, THREE.BufferGeometry>();
  target = -1;
  wind = 0.6;
  sneak = false;
  private caveK = 0;
  private uw: Underwater;
  private introCam = 0;
  private biomeNear: BiomeDef | null = null;
  private wxT = 0;
  debris: Debris[] = [];
  private debGeo = new Map<DK, THREE.BufferGeometry>();
  private remotes = new Map<string, Remote>();
  private paper: PaperChar;
  private hand = new THREE.Group();
  private handObj: THREE.Object3D | null = null;
  private handKey = '';
  private handMat: THREE.MeshLambertMaterial;
  private hookHead: THREE.Mesh;
  private line: THREE.Line;
  private bobber: THREE.Mesh;
  private rain: THREE.LineSegments | null = null;
  private birds: { g: THREE.Group; a: number; r: number; h: number; s: number; w: THREE.Mesh[] }[] = [];
  private lanternLight: THREE.PointLight | null = null;
  private resizeObs: ResizeObserver;
  private raf = 0;
  private last = 0;
  dead = false;
  paused = false;
  time = 0;
  /* ---------- estado do mundo (anfitrião manda) ---------- */
  diff: Diff;
  day = 1;
  tod = 0.12;
  storm = 0;
  private stormOn = false;
  private stormT = 200;
  off: [number, number] = [0, 0];
  hdg: [number, number] = [-0.6, -0.8];
  drift: [number, number] = [0, 0];
  flow: [number, number] = [0, 0];
  anchored = false;
  sailOn = false;
  private debT = 0;
  private nextIsl = 150;
  private ghostNight = -1;
  private lightning = 0;
  private seed: number;
  /* ---------- eu ---------- */
  me = { x: 0.75, y: DECK, z: 0.75, vx: 0, vy: 0, vz: 0, yaw: Math.PI * 0.75, pitch: -0.15, grounded: true, swim: false, speedK: 0, bob: 0, air: 1, hp: 100, food: 90, water: 90, onIsl: false, stepPh: 0, fallV: 0, invT: 0 };
  inv: Bag = { hook: 1, hammer: 1, wood: 4, plastic: 4, leaf: 4 };
  private sel: ItemId = 'hook';
  camMode = 0;
  private bed: [number, number] | null = null;
  stats: JgStats = { hooked: 0, sharks: 0, ghosts: 0, islands: 0, cooked: 0, fish: 0 };
  mis = 0;
  misN = 0;
  daily: [number, number][] = [];
  dailyDay = 0;
  coinsDay = 0;
  /* ---------- entrada ---------- */
  private jumpQ = false;
  private jumpHeld = false;
  private diveHeld = false;
  private keys = new Set<string>();
  private aim: Aim = null;
  private buildSel: PK | 'trash' | null = null;
  private buildRo = 0;
  private ghostOk = false;
  private ghostCell: [number, number, number] | null = null;
  private ghostHit: [number, number] = [0, 0];
  private trashT: RPiece | null = null;
  private swingT = 0;
  private actCd = 0;
  /* ---------- gancho e pesca ---------- */
  hook = { st: 'idle' as 'idle' | 'charge' | 'fly' | 'water', p: new THREE.Vector3(), v: new THREE.Vector3(), charge: 0, caught: [] as Debris[], reel: false, tick: 0 };
  fish = { st: 'idle' as 'idle' | 'cast' | 'wait' | 'bite' | 'game', p: new THREE.Vector3(), v: new THREE.Vector3(), t: 0, needle: 0, nv: 1, zone: [0.4, 0.6] as [number, number], big: false };
  /* ---------- online ---------- */
  readonly net: JNet | null;
  private netT = 0;
  private snapT = 0;
  private raftSentVer = '';
  private raftT = 0;
  private dpT = 0;
  private offs: (() => void)[] = [];
  /** espera o mundo do anfitrião (convidado) */
  private waitingInit = false;
  private o: WorldInit;
  private hudT = 0;
  private lastNight = false;
  private warnT = 0;
  private saveT = 30;
  private creakT = 3;

  constructor(o: WorldInit) {
    this.o = o;
    this.net = o.net;
    this.diff = o.diff;
    this.camMode = o.cam % 3;
    initMats();
    // ?jgtier=N (testes/medição): nível fixo, sem o automático mexer
    const fixed = /[?&]jgtier=\d/.test(location.search);
    this.gov = new QualityGovernor({ initial: o.tier, ...(fixed ? { mode: o.tier } : {}), emit: false, persist: false, onChange: (tr) => this.applyQ(tr) });
    this.tier = this.gov.tier;
    const r = new THREE.WebGLRenderer({ antialias: this.tier >= 2, powerPreference: 'high-performance' });
    r.setPixelRatio(this.pr());
    r.domElement.className = 'jg-gl';
    r.shadowMap.enabled = this.tier >= 3;
    o.root.appendChild(r.domElement);
    this.renderer = r;
    this.touch = document.createElement('div');
    this.touch.className = 'jg-touch';
    o.root.appendChild(this.touch);
    this.cam = new THREE.PerspectiveCamera(72, 1, 0.1, 1400);
    this.scene.add(this.cam);
    this.scene.fog = new THREE.FogExp2('#bfe8ff', 0.006);
    this.hemi = new THREE.HemisphereLight('#e0f4ff', '#2a6a8a', 1.2);
    this.sun = new THREE.DirectionalLight('#fff4e0', 1.5);
    if (this.tier >= 3) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(1024, 1024);
      const s = this.sun.shadow.camera;
      s.left = s.bottom = -14;
      s.right = s.top = 14;
      s.near = 1;
      s.far = 80;
    }
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.sky = new Sky(this.tier);
    this.scene.add(this.sky.group);
    this.ocean = new Ocean(this.tier, this.sky.cloudTex);
    this.scene.add(this.ocean.mesh);
    this.uw = new Underwater(this.tier);
    this.scene.add(this.uw.group);
    // fundo do mar (areia, pedras, algas): debaixo d'água nada de "vazio" embaixo das ilhas
    this.seabed = new Seabed(this.tier, () => this.map.map((q) => ({ x: q.x, z: q.z, r: q.r * 1.25 + 40 })));
    this.scene.add(this.seabed.mesh);
    this.fx = new Particles(this.tier <= 0 ? 220 : 420);
    this.fx.floorY = -50;
    this.fx.budget = [0.4, 0.65, 0.9, 1][this.tier];
    this.scene.add(this.fx.obj);
    // mundo: salvo ou novo
    const d = o.data;
    this.seed = d?.seed ?? Math.floor(Math.random() * 1e6);
    this.raft = d ? Raft.from(d.raft) : Raft.starter();
    this.buildMap();
    if (d) this.load(d);
    this.rv = new RaftView(this.raft, this.tier >= 2 ? 4 : this.tier === 1 ? 2 : 1);
    this.raftG.add(this.rv.group);
    this.scene.add(this.raftG);
    this.rv.sync(true);
    this.scene.add(this.shark.root, this.ghost.root, this.ghost.ship);
    for (const s of this.sharks2) this.scene.add(s.root);
    // eu (3ª pessoa): Bloop de papel
    this.paper = new PaperChar(mySpec(), { radius: 0.42, cell: 128, shadow: true });
    this.scene.add(this.paper.root);
    // mão (1ª pessoa)
    this.handMat = (MAT.vc as THREE.MeshLambertMaterial).clone();
    // viewmodel: vai na fila dos transparentes (depois do mar) e limpa o depth antes de desenhar →
    // sempre por cima da água/ilha/jangada, mas com profundidade própria (o gancho não se atravessa)
    this.handMat.transparent = true;
    this.handMat.depthTest = true;
    this.handMat.depthWrite = true;
    this.cam.add(this.hand);
    this.hookHead = new THREE.Mesh(toolGeo('hook')!, MAT.vc);
    this.hookHead.scale.setScalar(0.9);
    this.hookHead.visible = false;
    this.scene.add(this.hookHead);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
    this.line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: '#fff3c8' }));
    this.line.frustumCulled = false;
    this.line.visible = false;
    this.scene.add(this.line);
    this.bobber = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshLambertMaterial({ color: '#ff4f6a', emissive: '#401010' }));
    this.bobber.visible = false;
    this.scene.add(this.bobber);
    this.makeBirds();
    if (this.tier >= 1) {
      this.lanternLight = new THREE.PointLight('#ffe8a0', 0, 12, 1.4);
      this.scene.add(this.lanternLight);
    }
    // HUD + controles
    this.hud = new Hud(o.root, {
      pause: () => o.onPause(),
      cam: () => this.cycleCam(),
      craft: () => this.openCraft(),
      select: (i) => this.selectSlot(i),
      action: (dn) => this.onAction(dn),
      use: () => this.onUse(),
      jump: (dn) => {
        this.jumpHeld = dn;
        if (dn) this.jumpQ = true;
      },
      dive: (dn) => (this.diveHeld = dn),
      rotate: () => {
        this.buildRo = (this.buildRo + 1) % 4;
        this.au.ui1();
      },
      cancel: () => {
        this.buildSel = null;
        this.au.ui1();
      },
      pick: (k) => {
        this.buildSel = this.buildSel === k ? null : k;
        this.au.ui1();
        if (k !== 'trash' && this.buildSel) notify(PIECE[k].say(), { icon: 'sparkle', ms: 2200, key: 'jgsay' });
      },
      map: () => this.openMap(),
      sneak: () => {
        this.sneak = !this.sneak;
        this.au.ui1();
      },
    });
    this.hud.qte.onInput = () => tap('light');
    this.ctl = new FpsControls(this.touch, { joystick: { zoneWidth: 0.42, zoneTop: 0.2 }, look: { mouse: true } });
    window.addEventListener('keydown', this.kd);
    window.addEventListener('keyup', this.ku);
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(o.root);
    this.resize();
    this.au.hq = this.tier >= 2;
    this.au.start();
    if (!this.hasDailyOrMain()) this.rollDaily();
    // online
    if (this.net) this.bindNet();
    if (this.net && !this.net.isHost) {
      this.waitingInit = true;
      this.net.send({ t: 'hello' });
    }
    if (!d && this.isHost) this.spawnStartDebris();
    this.updateHot();
  }

  /* ============================== salvar/carregar ============================== */
  private load(d: JgWorld): void {
    this.day = d.day;
    this.tod = d.tod;
    this.inv = { ...d.inv };
    this.me.hp = d.hp;
    this.me.food = d.food;
    this.me.water = d.water;
    this.mis = d.mis;
    this.misN = d.misN;
    this.daily = d.daily ?? [];
    this.dailyDay = d.dailyDay ?? 0;
    this.off = d.off ?? [0, 0];
    this.hdg = d.hdg ?? this.hdg;
    this.nextIsl = d.nextIsl ?? 150;
    this.stats = { ...this.stats, ...(d.stats ?? {}) };
    this.bed = d.bed;
    this.shark.timer = d.sharkT ?? 60;
    this.stormT = d.stormT ?? 200;
    this.ghostNight = d.ghostDone ?? -1;
    this.coinsDay = d.coinsDay ?? 0;
    if (d.pos) [this.me.x, this.me.y, this.me.z] = d.pos;
    // v1 → v2: a ilha que passava era temporária; quem estava fora da jangada volta para ela
    if (d.v !== 2) {
      if (this.raft.groundAt(this.me.x, this.me.z, 5) === null) [this.me.x, this.me.y, this.me.z] = [0.75, DECK, 0.75];
    }
    for (const [k, v] of Object.entries(d.isles ?? {})) this.isleSt[+k] = { d: [...(v.d ?? [])], k: v.k ?? this.isleSt[+k]?.k, q: v.q };
    for (const b of d.boats ?? []) this.addBoat(b);
    for (const c of d.dch ?? []) this.addDChest(c[0], c[1], c[2], c[3], c[4], c[5]);
    this.bossDone = { ...(d.boss ?? {}) };
    this.target = d.target ?? -1;
    this.wind = d.wind ?? this.wind;
    this.quests = new Set(d.quests ?? []);
    for (const p of this.raft.pieces) {
      if (p.k === 'anchor' && p.d?.on) this.anchored = true;
      if (p.k === 'sail' && p.d?.on) this.sailOn = true;
    }
  }
  toSave(): JgWorld {
    return {
      v: 2,
      seed: this.seed,
      day: this.day,
      tod: this.tod,
      raft: this.raft.serialize(),
      inv: { ...this.inv },
      hp: Math.round(this.me.hp),
      food: Math.round(this.me.food),
      water: Math.round(this.me.water),
      mis: this.mis,
      misN: this.misN,
      daily: this.daily,
      dailyDay: this.dailyDay,
      off: [Math.round(this.off[0] * 10) / 10, Math.round(this.off[1] * 10) / 10],
      hdg: this.hdg,
      isl: null,
      nextIsl: this.nextIsl,
      stats: this.stats,
      pos: this.me.swim || this.myBoat ? [0.75, DECK, 0.75] : [this.me.x, this.me.y, this.me.z],
      bed: this.bed,
      sharkT: Math.max(20, this.shark.active ? 40 : this.shark.timer),
      stormT: this.stormT,
      ghostDone: this.ghostNight,
      coinsDay: this.coinsDay,
      isles: this.isleSt,
      boats: this.boats.map((b) => b.save()),
      dch: this.dch.map((c) => [c.id, c.kind, r1(c.x), r1(c.z), c.bag, c.coins]),
      boss: this.bossDone,
      target: this.target,
      wind: r2(this.wind),
      quests: [...this.quests],
    };
  }
  quests = new Set<string>();

  /* ============================== qualidade/tela ============================== */
  private pr(): number {
    return Math.min(window.devicePixelRatio || 1, [0.6, 0.8, 1, 1.5][this.tier]);
  }
  private applyQ(tier: Tier): void {
    this.tier = tier;
    this.renderer.setPixelRatio(this.pr());
    this.fx.budget = [0.4, 0.65, 0.9, 1][tier];
    this.resize();
  }
  private resize(): void {
    const w = this.o.root.clientWidth || window.innerWidth;
    const h = this.o.root.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.cam.aspect = w / Math.max(1, h);
    this.cam.updateProjectionMatrix();
  }

  /* ============================== laço ============================== */
  start(): void {
    this.last = performance.now();
    const loop = () => {
      if (this.dead) return;
      this.raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      const t0 = performance.now();
      this.step(dt);
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
  setPaused(p: boolean): void {
    this.paused = p;
    this.ctl.show(!p);
    if (p) {
      this.diveHeld = false;
      this.jumpHeld = false;
    }
  }

  private step(dt0: number): void {
    // câmera lenta durante o QTE (só jogando sozinho)
    const dt = this.hud.qte.active && !this.net ? dt0 * 0.4 : dt0;
    const online = !!this.net;
    if (this.paused && !online) {
      this.au.setSong(this.isNightNow() ? 'night' : 'day');
      return;
    }
    this.time += dt;
    const host = this.isHost;
    if (host) this.simWorld(dt);
    else this.followWorld(dt);
    if (!this.paused && !this.waitingInit) this.controlMe(dt);
    this.updateHook(dt);
    this.updateFish(dt);
    this.survival(dt);
    this.updateAim();
    // lanterna acesa mirando o Capitão Bu: ele não aguenta a luz
    if (this.sel === 'lantern' && this.lanternOn && this.ghost.active && this.aim?.k === 'ghost') {
      this.ghost.lit += dt;
      if (this.ghost.lit > 1.1) {
        this.ghost.lit = 0;
        this.act({ o: 'ghost' });
      }
    }
    this.updateRemotes(dt);
    this.shark.view(dt);
    this.stepV2(dt);
    this.ghost.view(dt, (x, z) => this.waterAt(x, z));
    this.updateDebrisView(dt);
    this.rv.sync();
    this.rv.animate(this.time, this.sc.night, this.tier);
    this.fx.update(dt, this.cam.fov, this.renderer.domElement.height);
    this.updateAudio(dt);
    this.hud.update(dt);
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.1;
      this.updateHud();
    }
    if (this.net) this.netTick(dt);
    this.saveT -= dt;
    if (this.saveT <= 0 && host) {
      this.saveT = 30;
      this.o.onSave();
    }
  }
  get isHost(): boolean {
    return !this.net || this.net.isHost;
  }
  isNightNow(): boolean {
    return isNight(this.tod);
  }
  waterAt(x: number, z: number): number {
    return waveH(x, z, this.time, this.amp, this.off[0], this.off[1]);
  }
  get amp(): number {
    return 1 + this.storm * 1.7;
  }
  /** balanço da jangada (altura) */
  private bobY = 0;
  private tiltX = 0;
  private tiltZ = 0;

  /* ============================== mundo (anfitrião) ============================== */
  private simWorld(dt: number): void {
    const D = DIFFS[this.diff];
    // hora
    const prevTod = this.tod;
    this.tod += dt / DAY_LEN;
    if (this.tod >= 1) {
      this.tod -= 1;
      this.day++;
      this.dawn();
    }
    if (prevTod < NIGHT0 && this.tod >= NIGHT0) this.sendFx('dusk');
    // clima (no mar aberto as tempestades vêm mais vezes)
    this.stormT -= dt * (this.farOut() >= 2 ? 2.2 : 1);
    if (this.stormT <= 0) {
      if (this.stormOn) {
        this.stormOn = false;
        this.stormT = 120 + Math.random() * 200;
      } else if (Math.random() < D.storm && this.day >= 2) {
        this.stormOn = true;
        this.stormT = 55 + Math.random() * 35;
        notify(t('jangada.storm', 'Tempestade chegando! Segure firme!'), { icon: 'warning', kind: 'bad', key: 'jgstorm' });
      } else this.stormT = 150 + Math.random() * 150;
    }
    this.storm += ((this.stormOn ? 1 : 0) - this.storm) * Math.min(1, dt * 0.12);
    // a jangada é a casa: fica no meio do mapa. Vela aberta = o vento traz mais coisas boiando;
    // âncora baixada = balança menos (e a correnteza fica mais mansa)
    this.anchored = this.raft.pieces.some((p) => p.k === 'anchor' && p.d?.on);
    this.sailOn = this.raft.pieces.some((p) => p.k === 'sail' && p.d?.on);
    const cur = CURRENT * (this.sailOn ? 1 + Math.min(3, this.raft.count('sail')) * 0.35 * SAIL * 0.5 : 1) * (this.anchored ? 0.7 : 1);
    this.drift = [0, 0];
    this.flow = [-this.hdg[0] * cur, -this.hdg[1] * cur];
    // vento gira devagar (veleiro)
    this.wind += dt * 0.004 * Math.sin(this.time * 0.01 + 1);
    this.moveWorld(dt);
    // restos boiando
    this.debT -= dt;
    const max = this.tier <= 0 ? 24 : 36;
    if (this.debT <= 0) {
      this.debT = 0.9 + Math.random() * 0.8 - Math.min(0.5, Math.hypot(...this.flow) * 0.15);
      if (this.debris.length < max) this.spawnDebris();
    }
    const fl = Math.hypot(this.flow[0], this.flow[1]) || 1;
    const [cx, cz] = this.raft.center();
    const gone: number[] = [];
    for (const d of this.debris) {
      if (d.hooked) continue;
      // longe rio abaixo: some
      const rx = d.x - cx;
      const rz = d.z - cz;
      if ((rx * this.flow[0] + rz * this.flow[1]) / fl > 70 || Math.hypot(rx, rz) > 110) gone.push(d.id);
    }
    // redes pegam o que passa
    for (const p of this.raft.pieces) {
      if (p.k !== 'net') continue;
      const nx = p.x * CELL;
      const nz = p.z * CELL;
      const bag = pieceBag(p);
      if (Object.values(bag).reduce((a, v) => a + (v ?? 0), 0) >= 10) continue;
      for (const d of this.debris) {
        if (d.hooked || gone.includes(d.id)) continue;
        if (Math.abs(d.x - nx) < CELL * 0.75 && Math.abs(d.z - nz) < CELL * 0.75) {
          bagAdd(bag, debrisLoot(d.k, Math.random));
          gone.push(d.id);
          this.raft.ver++;
          this.sendFx('splash', nx, 0, nz, 0.3);
        }
      }
    }
    if (gone.length) this.removeDebris(gone, true);
    // peças com estado
    this.simPieces(dt);
    void fl;
    // tubarão (Mordelão: mora em volta da jangada)
    const swimHome = () => this.swimmers().filter((s) => Math.hypot(s[1] - cx, s[3] - cz) < 70);
    this.shark.sim(dt, {
      cx,
      cz,
      edges: () => this.edges(),
      swimmers: swimHome,
      bite: (id, x, z) => this.sharkBite(id, x, z),
      biteMe: (who) => this.sharkBiteMe(who, this.shark),
      waterH: (x, z) => this.waterAt(x, z),
      warn: () => this.sendFx('warn'),
      fin: (x, z) => this.sendFx('fin', x, 0, z),
      wait: D.shark,
      enabled: this.day >= D.sharkDay,
      cd: [2.2, 1.6, 1.15][this.diff],
    });
    this.simSea(dt);
    // fantasma (uma visita por noite, a partir da 1ª noite)
    if (this.isNightNow() && this.ghostNight !== this.day && !this.ghost.active && this.tod > NIGHT0 + 0.06) {
      this.ghostNight = this.day;
      this.ghost.arrive(cx, cz);
    }
    this.ghost.sim(dt, {
      cx,
      cz,
      deckY: DECK + this.bobY,
      target: () => this.ghostTarget(),
      steal: (id, kind) => this.ghostSteal(id, kind),
      light: (x, z) => this.lightAt(x, z),
      giggle: (x, y, z) => this.sendFx('giggle', x, y, z),
      boo: (x, y, z) => this.sendFx('boo', x, y, z),
    });
    if (this.ghost.active && !this.isNightNow() && this.ghost.st !== 'scared' && this.ghost.st !== 'escape') {
      this.ghost.st = 'escape';
      this.ghost.timer = 6;
    }
  }
  /** convidado: mexe o mundo com a última deriva conhecida */
  private followWorld(dt: number): void {
    this.tod = (this.tod + dt / DAY_LEN) % 1;
    this.moveWorld(dt);
  }
  private moveWorld(dt: number): void {
    for (const d of this.debris) {
      if (d.hooked) continue;
      d.x += d.vx * dt;
      d.z += d.vz * dt;
    }
  }
  private dawn(): void {
    this.sendFx('dawn', this.day);
    this.o.onDawn(this.day);
  }
  /** chamado pelo jogo (host e convidado) no amanhecer */
  onNewDay(day: number): void {
    this.hud.banner('sun', t('jangada.day', 'Dia {n}', { n: day }), t('jangada.newDay', 'Bom dia, marinheiro!'), 3);
    this.au.dawn();
    // sobreviveu à noite
    this.prog('night', 1);
    if (this.dailyDay !== day) this.rollDaily();
  }

  /* ------------------------------ restos ------------------------------ */
  private spawnStartDebris(): void {
    for (let i = 0; i < 14; i++) this.spawnDebris(true);
  }
  private spawnDebris(near = false): void {
    const f = this.flow;
    const fl = Math.hypot(f[0], f[1]) || 1;
    const ux = f[0] / fl || -this.hdg[0];
    const uz = f[1] / fl || -this.hdg[1];
    const [cx, cz] = this.raft.center();
    const back = near ? -40 + Math.random() * 55 : -48 - Math.random() * 14;
    const side = (Math.random() - 0.5) * (near ? 34 : 46);
    let x = cx + ux * back - uz * side;
    const z = cz + uz * back + ux * side;
    // não nasce em cima da jangada
    const b = this.raft.bounds();
    if (x > b[0] - 2 && x < b[2] + 2 && z > b[1] - 2 && z < b[3] + 2) x += 6 * Math.sign(side || 1);
    for (const s of this.map) if (Math.hypot(x - s.x, z - s.z) < s.r + 6) return;
    let w = Math.random() * Object.values(DEBRIS_W).reduce((a, v) => a + v, 0);
    let k: DK = 'plank';
    for (const dk of DEBRIS) {
      w -= DEBRIS_W[dk];
      if (w <= 0) {
        k = dk;
        break;
      }
    }
    const sp = 0.85 + Math.random() * 0.3;
    const d = this.addDebris(debId++, k, x, z, (f[0] || ux) * sp, (f[1] || uz) * sp);
    if (this.net) this.net.send({ t: 'dAdd', l: [[d.id, DEBRIS.indexOf(k), r1(d.x), r1(d.z), r2(d.vx), r2(d.vz)]] });
  }
  private addDebris(id: number, k: DK, x: number, z: number, vx: number, vz: number): Debris {
    let g = this.debGeo.get(k);
    if (!g) {
      g = debrisGeo(k);
      this.debGeo.set(k, g);
    }
    const mesh = new THREE.Mesh(g, MAT.vc);
    this.scene.add(mesh);
    const d: Debris = { id, k, x, z, vx, vz, r: Math.random() * TAU, rv: (Math.random() - 0.5) * 0.4, ph: Math.random() * TAU, mesh, hooked: false };
    this.debris.push(d);
    return d;
  }
  private removeDebris(ids: number[], broadcast: boolean): void {
    for (const id of ids) {
      const i = this.debris.findIndex((d) => d.id === id);
      if (i < 0) continue;
      const d = this.debris[i];
      if (d.hooked && !broadcast) continue;
      this.scene.remove(d.mesh);
      this.debris.splice(i, 1);
    }
    if (broadcast && this.net) this.net.send({ t: 'dDel', ids });
  }
  private updateDebrisView(dt: number): void {
    for (const d of this.debris) {
      d.r += d.rv * dt;
      const y = this.waterAt(d.x, d.z);
      d.mesh.position.set(d.x, y + (d.k === 'barrel' ? -0.05 : 0.02) + Math.sin(this.time * 1.7 + d.ph) * 0.02, d.z);
      d.mesh.rotation.set(Math.sin(this.time * 1.1 + d.ph) * 0.12, d.r, Math.cos(this.time * 0.9 + d.ph) * 0.1);
    }
  }

  /* ------------------------------ ilhas ------------------------------ */
  /* ============================== v2: mapa, ilhas, barcos, chefes ============================== */
  /** cria o mapa fixo (ilhas, silhuetas distantes, chefes) */
  private buildMap(): void {
    this.map = worldMap(this.seed);
    for (const s of this.map) {
      // as ilhas de perto já aparecem no mapa (dá para vê-las da jangada)
      if (BIOMES[s.biome].tier === 1) (this.isleSt[s.id] ??= { d: [] }).k = 1;
      const B = BIOMES[s.biome];
      const m = new THREE.Mesh(isleFarGeo(s.r, 2.5, s.biome, B.grass, B.sand), MAT.vc);
      m.position.set(s.x, -0.2, s.z);
      this.scene.add(m);
      this.far.set(s.id, m);
      if (s.biome === 'megaIsle' || s.biome === 'krakenIsle') {
        const d = Math.hypot(s.x, s.z);
        const k = (d - s.r - 34) / d;
        const boss = s.biome === 'megaIsle' ? new Megalodon(s.x * k, s.z * k, this.diff) : new Kraken(s.x * k, s.z * k, this.diff);
        this.scene.add(boss.root);
        if (boss instanceof Kraken) this.scene.add(boss.shadowMesh);
        this.bosses.push(boss);
      }
    }
  }
  private loadIsle(s: IsleSpec): Island {
    const isl = new Island(s, this.tier);
    for (const id of this.isleSt[s.id]?.d ?? []) {
      const n = isl.nodes.find((q) => q.id === id);
      if (n && n.alive) {
        isl.kill(n);
        if (n.k === 'chest' && n.lid) n.lid.rotation.x = -1.9;
      }
    }
    this.scene.add(isl.group);
    this.isles.set(s.id, isl);
    if (isl.def.owner !== 'none') this.owners.set(s.id, new Owners(isl));
    const f = this.far.get(s.id);
    if (f) f.visible = false;
    return isl;
  }
  private dropIsle(id: number): void {
    const isl = this.isles.get(id);
    if (!isl) return;
    this.owners.get(id)?.dispose();
    this.owners.delete(id);
    this.scene.remove(isl.group);
    isl.dispose();
    this.isles.delete(id);
    const f = this.far.get(id);
    if (f) f.visible = true;
  }
  /** ilha carregada (o anfitrião carrega sob demanda quando um convidado mexe nela) */
  private ensureIsle(id: number): Island | null {
    const l = this.isles.get(id);
    if (l) return l;
    const s = this.map.find((q) => q.id === id);
    return s ? this.loadIsle(s) : null;
  }
  private plist(): { id: string; x: number; y: number; z: number; boat: boolean; swim: boolean }[] {
    const myId = this.net?.me.id ?? 'me';
    const out = [{ id: myId, x: this.me.x, y: this.me.y, z: this.me.z, boat: !!this.myBoat, swim: this.me.swim }];
    for (const r of this.remotes.values()) out.push({ id: r.id, x: r.x, y: r.y, z: r.z, boat: this.boats.some((b) => b.drv === r.id), swim: r.sw });
    return out;
  }
  /** maior zona de perigo onde há alguém no mar aberto (1 perto · 2 meio · 3 longe) */
  private farOut(): number {
    let z = 1;
    for (const p of this.plist()) if (p.boat || p.swim) z = Math.max(z, zoneAt(p.x, p.z));
    return z;
  }
  private updateIsles(dt: number): void {
    this.streamT -= dt;
    if (this.streamT <= 0) {
      this.streamT = 0.5;
      const ps = this.isHost ? this.plist() : this.plist().slice(0, 1);
      for (const s of this.map) {
        let d = 1e9;
        for (const p of ps) d = Math.min(d, Math.hypot(p.x - s.x, p.z - s.z));
        const loaded = this.isles.has(s.id);
        if (!loaded && d < 230) this.loadIsle(s);
        else if (loaded && d > 300) this.dropIsle(s.id);
        // detalhe (árvores, baús, donos) só perto: longe fica só o chão
        const il = this.isles.get(s.id);
        if (il) il.detail(Math.hypot((this.photo ? this.photo[0] : this.me.x) - s.x, (this.photo ? this.photo[2] : this.me.z) - s.z) < s.r + (this.tier >= 2 ? 150 : 110));
        // descobriu (chegou perto)
        const dm = Math.hypot(this.me.x - s.x, this.me.z - s.z);
        if (dm < 175 && !this.isleSt[s.id]?.k) this.discover(s);
      }
    }
    // ilha mais perto de mim
    let best: Island | null = null;
    let bd = 1e9;
    for (const isl of this.isles.values()) {
      const d = Math.hypot(isl.x - this.me.x, isl.z - this.me.z) - isl.outer;
      if (d < 40 && d < bd) {
        bd = d;
        best = isl;
      }
    }
    this.isl = best;
    this.biomeNear = best?.def ?? null;
  }
  private discover(s: IsleSpec): void {
    (this.isleSt[s.id] ??= { d: [] }).k = 1;
    const B = BIOMES[s.biome];
    this.au.jingleIsland();
    this.hud.banner(B.icon, t('jangada.isleFound', 'Ilha descoberta!'), `${B.n()} · ${t('jangada.danger', 'Perigo {n}', { n: Math.min(4, B.tier) })}`, 3);
    this.prog('disc', this.knownCount());
  }
  knownCount(): number {
    return Object.values(this.isleSt).filter((v) => v.k).length;
  }
  private visited = new Set<number>();
  private caveSeen = new Set<number>();
  /** pisou numa ilha */
  private landedOn(isl: Island): void {
    if (!this.visited.has(isl.id)) {
      this.visited.add(isl.id);
      this.stats.islands++;
      this.prog('island', 1);
      this.prog('tier', isl.def.tier);
      const f = isl.def.owner;
      const sub = f === 'none' ? t('jangada.islandSub', 'Use o machado nas árvores e pedras') : FACTIONS[f].friendly ? t('jangada.ownerFriend', '{n}: amigos! Fale com o chefe para trocar.', { n: FACTIONS[f].n() }) : t('jangada.ownerFoe', '{n} guardam o tesouro. Cuidado!', { n: FACTIONS[f].n() });
      this.hud.banner(isl.def.icon, isl.def.n(), sub, 3.2);
    }
    if (isl.inCave(this.me.x, this.me.z) && !this.caveSeen.has(isl.id)) {
      this.caveSeen.add(isl.id);
      this.prog('cave', 1);
      if (!(this.sel === 'lantern' && this.lanternOn)) notify(t('jangada.caveDark', 'Que escuro! Use a lanterna.'), { icon: 'warning', key: 'jgcave' });
    }
  }

  /* ------------------------------ v2: cada quadro ------------------------------ */
  private harpCd = 0;
  private stepV2(dt: number): void {
    this.updateIsles(dt);
    if (this.harpCd > 0) this.harpCd -= dt;
    if (this.introCam > 0) this.introCam -= dt;
    const water = (x: number, z: number) => this.waterAt(x, z);
    // donos das ilhas (simulação local)
    for (const [id, o] of this.owners) {
      const isl = this.isles.get(id)!;
      if (Math.hypot(isl.x - this.me.x, isl.z - this.me.z) > isl.r + 45 || !isl.detailOn) continue;
      o.update(dt, {
        px: this.me.x,
        py: this.me.y,
        pz: this.me.z,
        sneak: this.sneak,
        swim: this.me.swim || !!this.myBoat,
        light: this.sel === 'lantern' && this.lanternOn,
        night: this.sc.night,
        bonk: (dmg, fx, fz) => this.hurt(dmg, true, fx, fz, 'bonk'),
        seen: () => {
          this.au.alert();
          notify(t('jangada.spotted', 'Te viram! Fuja, distraia com comida ou lute.'), { icon: 'warning', kind: 'bad', key: 'jgseen', ms: 1800 });
        },
        voice: (n, k) => this.au.npc(n.f, k, { x: n.x + isl.x, y: n.y + 1, z: n.z + isl.z }),
      });
      isl.animate(this.time);
    }
    // barcos
    for (const b of this.boats) {
      if (b !== this.myBoat) b.follow(dt);
      b.view(dt, this.time, water, b === this.myBoat && Math.abs(b.v) > 0.3);
    }
    // baús boiando
    for (const c of this.dch) {
      const isl = this.isl;
      const ground = isl ? isl.heightAt(c.x, c.z) : -99;
      const w = water(c.x, c.z);
      const y = ground > w - 0.25 ? ground : w - 0.12 + Math.sin(this.time * 1.8 + c.ph) * 0.05;
      c.root.position.set(c.x, y, c.z);
      c.root.rotation.set(Math.sin(this.time * 1.2 + c.ph) * 0.1, this.time * 0.2 + c.ph, Math.cos(this.time * 1.1 + c.ph) * 0.08);
      if (c.beam) {
        c.beam.rotation.set(-c.root.rotation.x, 0, -c.root.rotation.z);
        (c.beam.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(this.time * 3 + c.ph) * 0.15;
      }
    }
    // arpões
    this.updateHarpoons(dt);
    for (const s of this.sharks2) s.view(dt);
    for (const b of this.bosses) b.view(dt, this.time, water);
  }

  /* ------------------------------ v2: mar aberto (anfitrião) ------------------------------ */
  private simSea(dt: number): void {
    const ps = this.plist();
    const [cx, cz] = this.raft.center();
    // tubarões-tigre: um por jogador no mar aberto (meio/longe)
    const out = ps.filter((p) => (p.boat || p.swim) && Math.hypot(p.x - cx, p.z - cz) > 150 && zoneAt(p.x, p.z) >= 2);
    this.sharks2.forEach((s, i) => {
      const p = out[i];
      if (!p && s.active && s.st !== 'flee') {
        s.st = 'flee';
        s.timer = 5;
      }
      const z = p ? zoneAt(p.x, p.z) : 2;
      s.sim(dt, {
        cx: p ? p.x : s.x,
        cz: p ? p.z : s.z,
        edges: () => [],
        swimmers: () => this.swimmers(true).filter((q) => p && Math.hypot(q[1] - p.x, q[3] - p.z) < 45),
        bite: () => {},
        biteMe: (who) => this.sharkBiteMe(who, s),
        waterH: (x, zz) => this.waterAt(x, zz),
        warn: () => this.sendFx('warn2'),
        fin: (x, zz) => this.sendFx('fin', x, 0, zz),
        wait: z >= 3 ? [12, 25] : [25, 45],
        enabled: !!p,
        cd: [2.4, 1.8, 1.3][this.diff],
      });
    });
    // chefes
    this.bosses.forEach((b, idx) => {
      if (b.st === 'gone') return;
      const near = ps.filter((p) => Math.hypot(p.x - b.cx, p.z - b.cz) < 75);
      if (b.st === 'off') {
        if (near.length && !this.bossDone[b.kind]) {
          b.target = near[0].id;
          b.wake();
          this.sendFx('bossIntro', b.cx, 0, b.cz, b.kind === 'mega' ? 0 : 1);
        }
        return;
      }
      if (b.fighting && !ps.some((p) => Math.hypot(p.x - b.x, p.z - b.z) < 170)) {
        // todo mundo fugiu: o chefe volta a dormir (vida cheia)
        b.st = 'off';
        b.hp = b.max;
        b.root.visible = false;
        return;
      }
      b.sim(dt, this.bossCtx(b, idx));
    });
  }
  private bossCtx(b: Boss, idx: number): BossCtx {
    const myId = this.net?.me.id ?? 'me';
    return {
      targets: () => this.plist().filter((p) => Math.hypot(p.x - b.x, p.z - b.z) < 95),
      water: (x, z) => this.waterAt(x, z),
      qte: (target, req, id) => {
        if (target === myId) this.startQte(req, id, idx);
        else this.net?.send({ t: 'qte', b: idx, id, k: req.kind, d: req.dir ?? '', du: r2(req.dur), n: req.n ?? 0 }, target);
      },
      hurt: (target, dmg, fx, fz, boatDmg) => {
        const boat = this.boats.find((q) => q.drv === target);
        if (boat) this.boatHit(boat, boatDmg, fx, fz);
        const d = boat ? dmg * 0.5 : dmg;
        if (target === myId) this.hurt(d, true, fx, fz);
        else this.net?.send({ t: 'hurt', d, fx: r1(fx), fz: r1(fz) }, target);
      },
      fx: (k, x, y, z) => this.sendFx(k, x, y, z, 0, b.target),
      diff: this.diff,
    };
  }
  private startQte(req: QteReq, id: number, bossIdx: number): void {
    this.au.qteShow();
    this.hud.qte.start(req, (ok) => {
      if (ok) this.au.qteOk();
      else this.au.qteFail();
      this.act({ o: 'qte', b: bossIdx, id, ok: ok ? 1 : 0 });
    });
  }
  private bossDefeated(b: Boss): void {
    this.bossDone[b.kind] = this.day;
    const s = this.map.find((q) => q.biome === (b.kind === 'mega' ? 'megaIsle' : 'krakenIsle'));
    const L = chestLoot(3, s?.biome ?? 'legend', Math.random);
    bagAdd(L.bag, b.kind === 'mega' ? { tooth: 1, gold: 2 } : { ink: 2, pearl: 3 });
    const w = this.waterAt(b.x, b.z);
    void w;
    this.spawnDChest(1, b.x + 3, b.z, L.bag, 150);
    this.sendFx('bossDown', b.x, 0, b.z, b.kind === 'mega' ? 0 : 1);
  }

  /* ------------------------------ v2: baús boiando ------------------------------ */
  private addDChest(id: number, kind: number, x: number, z: number, bag: Bag, coins: number): DChest {
    let root: THREE.Group;
    let beam: THREE.Mesh | null = null;
    if (kind === 0) {
      const m = deathChestModel();
      root = m.root;
      beam = m.beam;
    } else {
      const m = chestModel(3);
      root = new THREE.Group();
      root.add(m.root);
      m.root.scale.setScalar(1.3);
      const dm = deathChestModel();
      beam = dm.beam;
      (beam.material as THREE.MeshBasicMaterial).color.set('#ffcf2e');
      root.add(beam);
    }
    this.scene.add(root);
    const c: DChest = { id, kind, x, z, bag, coins, root, beam, ph: Math.random() * 6 };
    this.dch.push(c);
    this.dchSeq = Math.max(this.dchSeq, id + 1);
    return c;
  }
  private spawnDChest(kind: number, x: number, z: number, bag: Bag, coins: number): void {
    this.addDChest(this.dchSeq++, kind, x, z, bag, coins);
    this.sendDch();
  }
  private removeDChest(id: number): void {
    const i = this.dch.findIndex((c) => c.id === id);
    if (i < 0) return;
    const c = this.dch[i];
    this.scene.remove(c.root);
    this.dch.splice(i, 1);
    if (this.target === -100 - id) this.target = -1;
  }
  private sendDch(): void {
    if (this.net && this.isHost) this.net.send({ t: 'dch', l: this.dch.map((c) => [c.id, c.kind, r1(c.x), r1(c.z)]) });
  }

  /* ------------------------------ v2: barcos ------------------------------ */
  private addBoat(s: BoatSave): Boat {
    const b = new Boat(s.id, s.k, s.x, s.z, s.yaw, s.hp, s.fuel);
    this.scene.add(b.m.root);
    this.boats.push(b);
    this.boatSeq = Math.max(this.boatSeq, s.id + 1);
    return b;
  }
  /** lugar livre na água ao lado da jangada */
  private dockSpot(): [number, number, number] {
    const b = this.raft.bounds();
    const cx = (b[0] + b[2]) / 2;
    const cz = (b[1] + b[3]) / 2;
    const cand: [number, number, number][] = [];
    for (let i = 0; i < 4; i++) {
      cand.push([b[2] + 2.6, cz + i * 3.2 - 1.6, 0]);
      cand.push([b[0] - 2.6, cz + i * 3.2 - 1.6, Math.PI]);
      cand.push([cx + i * 3.2 - 1.6, b[3] + 2.6, Math.PI / 2]);
    }
    return cand.find((c) => !this.boats.some((q) => Math.hypot(q.x - c[0], q.z - c[1]) < 2.8)) ?? cand[0];
  }
  private boatBlocked(x: number, z: number): boolean {
    for (const isl of this.isles.values()) if (Math.hypot(isl.x - x, isl.z - z) < isl.outer && isl.heightAt(x, z) > -0.45) return true;
    const b = this.raft.bounds();
    if (x > b[0] - 1.1 && x < b[2] + 1.1 && z > b[1] - 1.1 && z < b[3] + 1.1) return true;
    return false;
  }
  private buildBoat(k: BoatK): boolean {
    const D = BOATS[k];
    if ((D.fire ?? 0) > this.raft.fireLv() || !bagHas(this.inv, D.cost)) {
      this.au.nope();
      return false;
    }
    bagAdd(this.inv, D.cost, -1);
    this.act({ o: 'boat', k });
    this.au.fanfare();
    this.hud.banner(D.icon, D.n(), t('jangada.boatReady', 'Está na água do lado da jangada! Toque em ENTRAR.'), 3);
    this.prog('boat', k + 1);
    this.updateHot();
    this.hud.closePanel();
    this.setPaused(false);
    return true;
  }
  private lastBoatYaw = 0;
  private paddleT = 0;
  private useBoat(b: Boat): void {
    if (b.flip) {
      this.act({ o: 'boatFix', id: b.id, flip: 1 });
      this.au.splash(null, 0.8);
      return;
    }
    if (b.def.fuel && b.fuel < FUEL_SEC * 2 && (this.inv.fuel ?? 0) > 0) {
      const n = Math.min(this.inv.fuel ?? 0, 3);
      bagAdd(this.inv, { fuel: n }, -1);
      this.act({ o: 'refuel', id: b.id, n });
      this.au.drink();
      notify(t('jangada.refueled', 'Tanque cheio!'), { icon: 'check', key: 'jgfuel', ms: 1400 });
      this.updateHot();
      return;
    }
    const myId = this.net?.me.id ?? 'me';
    if (b.drv && b.drv !== myId) return this.au.nope();
    this.myBoat = b;
    b.drv = myId;
    this.act({ o: 'board', id: b.id });
    const m = this.me;
    m.yaw = b.yaw + Math.PI;
    m.pitch = -0.1;
    this.lastBoatYaw = b.yaw;
    m.swim = false;
    this.dropHook();
    this.endFish(false);
    this.au.boardBoat();
    if (!this.boatTip) {
      this.boatTip = true;
      notify(t('jangada.boatTip', 'Joystick: frente acelera, lados viram. Pular = sair do barco. Toque na bússola para o mapa!'), { icon: 'sparkle', ms: 5000 });
    }
  }
  private boatTip = false;
  private driveBoat(dt: number, mx: number, my: number): void {
    const b = this.myBoat!;
    const m = this.me;
    const r = b.drive(dt, my, mx, this.wind, this.storm, (x, z) => this.boatBlocked(x, z));
    void r;
    b.view(0, this.time, (x, z) => this.waterAt(x, z), Math.abs(b.v) > 0.3);
    const [sx, sy, sz] = b.seat();
    m.x = sx;
    m.z = sz;
    m.y = sy;
    m.vx = m.vy = m.vz = 0;
    m.swim = false;
    m.grounded = true;
    m.onIsl = false;
    m.speedK = 0;
    m.yaw += b.yaw - this.lastBoatYaw;
    this.lastBoatYaw = b.yaw;
    if (b.k === 0 && Math.abs(my) > 0.15) {
      this.paddleT -= dt;
      if (this.paddleT <= 0) {
        this.paddleT = 0.75;
        this.au.paddle();
      }
    }
    if (Math.abs(b.v) > 3 && Math.random() < dt * Math.abs(b.v) * this.fx.budget) {
      const s = Math.random() < 0.5 ? 1 : -1;
      this.fx.emit(b.x + Math.sin(b.yaw) * 1.8 + Math.cos(b.yaw) * 0.5 * s, b.y - 0.1, b.z + Math.cos(b.yaw) * 1.8 - Math.sin(b.yaw) * 0.5 * s, Math.cos(b.yaw) * s * 1.2, 1.4, -Math.sin(b.yaw) * s * 1.2, { life: 0.6, size: 0.08, grow: 0.15, grav: 6 });
    }
    if (b.flip) {
      this.leaveBoat(false);
      return;
    }
    if (this.jumpQ) {
      this.jumpQ = false;
      this.leaveBoat(false);
    }
  }
  /** sai do barco: no convés/areia se der, senão na água do lado */
  private leaveBoat(dead: boolean): void {
    const b = this.myBoat;
    if (!b) return;
    this.myBoat = null;
    b.drv = '';
    b.v = 0;
    this.act({ o: 'board', id: b.id, off: 1 });
    if (dead) return;
    const m = this.me;
    const w = (x: number, z: number) => this.waterAt(x, z);
    const tries: [number, number][] = [];
    for (const d of [1.8, 2.6, 3.4])
      for (const a of [Math.PI / 2, -Math.PI / 2, 0, Math.PI]) tries.push([b.x + Math.sin(b.yaw + a) * d, b.z + Math.cos(b.yaw + a) * d]);
    for (const [x, z] of tries) {
      const g = this.groundAt(x, z, 6);
      if (g !== null && g > w(x, z) - 0.2 && !this.collides(x, z, g)) {
        m.x = x;
        m.z = z;
        m.y = g + 0.05;
        m.swim = false;
        m.grounded = false;
        m.vy = 1.5;
        this.au.jump();
        return;
      }
    }
    m.x = tries[0][0];
    m.z = tries[0][1];
    m.y = w(m.x, m.z) - 1.2;
    m.swim = true;
    m.grounded = false;
    this.au.plunge();
    this.fx.burst(m.x, w(m.x, m.z) + 0.1, m.z, 12, 'foam', '#ffffff', 2);
  }
  /** casco levou pancada (anfitrião) */
  private boatHit(b: Boat, dmg: number, fx: number, fz: number): void {
    b.hp = Math.max(0, b.hp - dmg);
    this.sendFx('boatHit', b.x, 0, b.z, 0, b.drv);
    if (b.hp <= 0 && !b.flip) {
      b.flip = 1;
      this.sendFx('boatSink', b.x, 0, b.z, 0, b.drv);
    }
    void fx;
    void fz;
  }
  private fixBoat(b: Boat): void {
    if (b.hp >= b.maxHp && !b.flip) return;
    if (!bagHas(this.inv, { wood: 2 })) {
      this.au.nope();
      notify(t('jangada.needFix', 'Precisa de tábua (e plástico) para consertar'), { icon: 'warning', key: 'jgfix' });
      return;
    }
    bagAdd(this.inv, { wood: 2 }, -1);
    this.act({ o: 'boatFix', id: b.id });
    this.au.hammer({ x: b.x, y: b.y, z: b.z }, 3);
    this.swingT = 0.35;
    this.actCd = 0.5;
    this.updateHot();
  }

  /* ------------------------------ v2: armas ------------------------------ */
  private throwHarpoon(id: ItemId): void {
    if (this.harpCd > 0) return;
    this.harpCd = 0.85;
    const key = id;
    let g = this.harpGeo.get(key);
    if (!g) {
      g = harpoonGeo(id === 'harpoon2');
      this.harpGeo.set(key, g);
    }
    const mesh = new THREE.Mesh(g, MAT.vc);
    const p = this.handWorld();
    p.y += 0.25;
    const v = this.lookDir().multiplyScalar(this.me.swim && this.cam.position.y < this.waterAt(p.x, p.z) ? 16 : 34);
    v.y += 1.2;
    this.scene.add(mesh);
    this.harpoons.push({ p, v, life: 2.2, dmg: WEAPON[id] ?? 3, mesh, hit: false });
    this.au.harpoon();
    this.swingT = 0.35;
    tap('light');
  }
  private updateHarpoons(dt: number): void {
    const up = new THREE.Vector3(0, 1, 0);
    for (const h of this.harpoons) {
      h.life -= dt;
      const w = this.waterAt(h.p.x, h.p.z);
      const inWater = h.p.y < w;
      h.v.y -= 9.8 * dt * (inWater ? 0.2 : 0.55);
      if (inWater) h.v.multiplyScalar(1 - Math.min(0.9, dt * 2.2));
      const prevY = h.p.y;
      h.p.addScaledVector(h.v, dt);
      if (prevY >= w && h.p.y < w) {
        this.au.splash({ x: h.p.x, y: w, z: h.p.z }, 0.3);
        this.fx.burst(h.p.x, w + 0.05, h.p.z, 8, 'foam', '#ffffff', 1.4);
      }
      h.mesh.position.copy(h.p);
      h.mesh.quaternion.setFromUnitVectors(up, h.v.clone().normalize());
      if (h.hit) continue;
      // acertos
      for (const s of [this.shark, ...this.sharks2]) {
        if (!s.active) continue;
        if (Math.hypot(s.x - h.p.x, s.y + 0.3 - h.p.y, s.z - h.p.z) < 1.4 * (s.variant ? 1.35 : 1)) {
          this.hitShark(s, h.dmg);
          h.hit = true;
        }
      }
      if (this.isl) {
        const ow = this.owners.get(this.isl.id);
        for (const n of ow?.npcs ?? []) {
          if (Math.hypot(n.x + this.isl.x - h.p.x, n.y + 0.8 - h.p.y, n.z + this.isl.z - h.p.z) < 0.9) {
            this.hitNpc(n, ow!, h.dmg);
            h.hit = true;
          }
        }
      }
      for (const b of this.bosses) {
        if (!b.fighting || Math.hypot(b.x - h.p.x, b.z - h.p.z) > 25) continue;
        let best: HitSphere | null = null;
        for (const s of b.hitSpheres()) if (Math.hypot(s.x - h.p.x, s.y - h.p.y, s.z - h.p.z) < s.r && (!best || s.w > best.w)) best = s;
        if (best) {
          this.hitBoss(b, best, h.dmg);
          h.hit = true;
          break;
        }
      }
      if (h.hit) h.life = Math.min(h.life, 0.25);
    }
    this.harpoons = this.harpoons.filter((h) => {
      if (h.life > 0) return true;
      this.scene.remove(h.mesh);
      return false;
    });
  }
  private hitShark(s: Shark, dmg: number): void {
    const idx = [this.shark, ...this.sharks2].indexOf(s);
    this.act({ o: 'shark', s: idx, dmg });
    this.au.sharkHurt({ x: s.x, y: s.y, z: s.z });
    this.fx.burst(s.x, s.y + 0.5, s.z, 10, 'foam', '#ffffff', 2);
    this.fx.burst(s.x, s.y + 0.8, s.z, 6, 'spark', '#ffe45c', 1.6);
    tap('medium');
  }
  private hitNpc(n: Npc, o: Owners, dmg: number): void {
    const isl = this.isl!;
    if (o.friendly) {
      this.au.nope();
      notify(t('jangada.friends', 'Eles são amigos! Toque em TROCAR.'), { icon: 'heart', key: 'jgfriend', ms: 1600 });
      return;
    }
    const down = o.strike(n, Math.max(1, dmg), this.me.x, this.me.z);
    const p = { x: n.x + isl.x, y: n.y + 1, z: n.z + isl.z };
    this.fx.burst(p.x, p.y, p.z, 8, 'spark', '#ffe45c', 1.6);
    this.au.bonk(p);
    tap('medium');
    if (down) {
      this.au.npc(n.f, 'dizzy', p);
      notify(t('jangada.npcDizzy', 'Ficou tonto! Corra pegar o tesouro.'), { icon: 'star', kind: 'good', key: 'jgdizzy', ms: 1800 });
    }
  }
  private hitBoss(b: Boss, h: HitSphere, dmg: number): void {
    const idx = this.bosses.indexOf(b);
    const d = dmg * h.w;
    this.act({ o: 'boss', b: idx, part: h.part, dmg: r1(d) });
    this.fx.burst(h.x, h.y, h.z, h.w > 1 ? 16 : 8, 'spark', h.w > 1 ? '#ffe45c' : '#ffffff', h.w > 1 ? 3 : 1.8);
    this.au.bossHit(h.w > 1);
    if (h.w > 1) this.hud.banner('star', t('jangada.weakHit', 'No ponto fraco!'), '', 0.9);
    tap(h.w > 1 ? 'heavy' : 'medium');
  }
  private throwBait(id: ItemId, o: Owners): void {
    const isl = this.isl;
    if (!isl) return;
    const d = this.lookDir();
    const x = this.me.x + d.x * 6;
    const z = this.me.z + d.z * 6;
    if (isl.heightAt(x, z) < 0) return this.au.nope();
    bagAdd(this.inv, { [id]: 1 }, -1);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshLambertMaterial({ color: ITEM[id].col }));
    const n = o.bait(x, z, mesh);
    this.au.toss();
    this.swingT = 0.35;
    this.actCd = 0.6;
    if (n) notify(t('jangada.baited', 'Eles foram comer! Corra!'), { icon: 'star', kind: 'good', key: 'jgbait', ms: 1800 });
    this.updateHot();
  }

  /* ------------------------------ v2: donos amigos ------------------------------ */
  private openTrade(o: Owners): void {
    const f = o.faction;
    const list = TRADES[f] ?? [];
    if (!list.length) return;
    this.setPaused(!this.net);
    this.ctl.show(false);
    this.au.npc(f, 'hi', null);
    this.hud.openTrade({
      title: FACTIONS[f as 'crab'].boss(),
      icon: FACTIONS[f as 'crab'].icon,
      hi: f === 'crab' ? t('jangada.hiCrab', 'Clic-clac! Bem-vindo ao meu reino. Vamos trocar?') : t('jangada.hiPenguin', 'Quá-quá! Peixe fresquinho? Eu troco por coisas boas!'),
      trades: list,
      done: (i) => !!list[i].quest && this.quests.has(`${f}:${i}`),
      have: () => this.inv,
      trade: (i) => {
        const tr = list[i];
        if (tr.quest && this.quests.has(`${f}:${i}`)) return false;
        if (!bagHas(this.inv, tr.give)) {
          this.au.nope();
          return false;
        }
        bagAdd(this.inv, tr.give, -1);
        if (Object.keys(tr.get).length) this.addItems(tr.get);
        if (tr.coins) this.coins(tr.coins);
        this.au.trade();
        this.prog('trade', 1);
        if (tr.quest) {
          this.quests.add(`${f}:${i}`);
          for (const s of this.map) if ((tr.quest === 'mid' ? BIOMES[s.biome].tier === 2 : BIOMES[s.biome].tier >= 3) && !this.isleSt[s.id]?.k) (this.isleSt[s.id] ??= { d: [] }).k = 1;
          this.prog('disc', this.knownCount());
          notify(t('jangada.mapMore', 'Novas ilhas no mapa!'), { icon: 'star', kind: 'good' });
        }
        this.updateHot();
        return true;
      },
      close: () => {
        this.hud.closePanel();
        this.setPaused(false);
      },
    });
  }

  /* ------------------------------ v2: mapa e bússola ------------------------------ */
  openMap(): void {
    if (this.hud.overlay) return;
    this.au.ui1();
    this.setPaused(!this.net);
    this.ctl.show(false);
    const known = new Set(Object.entries(this.isleSt).filter(([, v]) => v.k).map(([k]) => +k));
    this.hud.openMap({
      html: (size) =>
        mapHtml(
          {
            isles: this.map,
            known,
            px: this.me.x,
            pz: this.me.z,
            yaw: this.me.yaw,
            boats: this.boats.filter((b) => b !== this.myBoat).map((b) => [b.x, b.z]),
            chests: this.dch.map((c) => [c.x, c.z]),
            target: this.target,
          },
          size,
        ),
      legend: mapLegend(),
      pick: (id) => {
        this.target = this.target === id ? -1 : id;
        this.au.ui1();
      },
      close: () => {
        this.hud.closePanel();
        this.setPaused(false);
      },
    });
  }
  private updateCompass(): void {
    const m = this.me;
    const [cx, cz] = this.raft.center();
    const marks: Marker[] = [];
    if (Math.hypot(m.x - cx, m.z - cz) > 12) marks.push({ x: cx, z: cz, icon: 'found', main: this.target === -1 && Math.hypot(m.x - cx, m.z - cz) > 60 });
    for (const c of this.dch) marks.push({ x: c.x, z: c.z, icon: 'beacon', main: this.target === -100 - c.id });
    const known = this.map.filter((s) => this.isleSt[s.id]?.k && Math.hypot(s.x - m.x, s.z - m.z) > s.r + 15);
    known.sort((a, b) => Math.hypot(a.x - m.x, a.z - m.z) - Math.hypot(b.x - m.x, b.z - m.z));
    for (const s of known.slice(0, 4)) if (s.id !== this.target) marks.push({ x: s.x, z: s.z, icon: BIOMES[s.biome].icon });
    const tg = this.map.find((s) => s.id === this.target);
    if (tg) marks.push({ x: tg.x, z: tg.z, icon: BIOMES[tg.biome].icon, main: true });
    if (this.myBoat?.def.wind) marks.push({ x: m.x + Math.sin(this.wind) * 100, z: m.z + Math.cos(this.wind) * 100, icon: 'wind' });
    this.hud.compass.update(m.x, m.z, m.yaw, marks);
  }

  /* ------------------------------ v2: câmera dos chefes, clima ------------------------------ */
  private bossCamera(): void {
    const b = this.bosses.find((q) => q.st === 'intro' && Math.hypot(q.x - this.me.x, q.z - this.me.z) < 90);
    const on = !!b && this.introCam > 0;
    this.hud.letterbox(on);
    if (!on || !b) return;
    const f = b.focus(new THREE.Vector3());
    const cam = this.cam;
    // recua um pouco e olha para o chefe
    const back = new THREE.Vector3(cam.position.x - f.x, 0, cam.position.z - f.z).normalize();
    cam.position.addScaledVector(back, 2.5);
    cam.position.y = Math.max(cam.position.y + 1.2, this.waterAt(cam.position.x, cam.position.z) + 1.5);
    cam.lookAt(f);
    cam.updateMatrixWorld();
  }
  private updateWeather(dt: number): void {
    const B = this.biomeNear;
    const isl = this.isl;
    if (!B || !isl || this.caveK > 0.5) return;
    const near = Math.hypot(isl.x - this.cam.position.x, isl.z - this.cam.position.z) < isl.r + 50;
    if (!near) return;
    this.wxT += dt * (this.tier >= 2 ? 40 : 18) * this.fx.budget;
    const c = this.cam.position;
    while (this.wxT >= 1) {
      this.wxT -= 1;
      const x = c.x + (Math.random() - 0.5) * 22;
      const z = c.z + (Math.random() - 0.5) * 22;
      if (B.snow) this.fx.emit(x, c.y + 6 + Math.random() * 4, z, (Math.random() - 0.5) * 0.4, -1.1, (Math.random() - 0.5) * 0.4, { color: '#ffffff', life: 6, size: 0.06, grav: 0, drag: 0 });
      else if (B.ash) this.fx.emit(x, c.y - 1 + Math.random() * 3, z, (Math.random() - 0.5) * 0.3, 0.6 + Math.random() * 0.5, (Math.random() - 0.5) * 0.3, { color: Math.random() < 0.3 ? '#ff8a3a' : '#5a5050', life: 3.5, size: 0.05, grav: 0 });
      else if (B.id === 'legend' || B.id === 'krakenIsle') this.fx.emit(x, c.y - 1 + Math.random() * 3, z, 0, 0.25, 0, { tile: 1, color: Math.random() < 0.5 ? '#c89aff' : '#7af0ff', life: 3, size: 0.05, grav: 0 });
      else if (B.id === 'jungle' && this.sc.night > 0.3) this.fx.emit(x, c.y - 1 + Math.random() * 2, z, (Math.random() - 0.5) * 0.3, 0.1, (Math.random() - 0.5) * 0.3, { tile: 1, color: '#e8ff6a', life: 2.5, size: 0.05, grav: 0 });
      else break;
    }
  }

  /* ------------------------------ v2: ações do anfitrião ------------------------------ */
  private applyV2(o: string, op: Record<string, unknown>, from: string, me: boolean, give: (b: Bag) => void): boolean {
    switch (o) {
      case 'dchest': {
        const b = op.b && typeof op.b === 'object' ? (op.b as Bag) : {};
        const bag: Bag = {};
        for (const [k, n] of Object.entries(b)) if (ITEM[k as ItemId] && Number(n) > 0) bag[k as ItemId] = Math.min(999, Number(n) | 0);
        this.spawnDChest(0, Number(op.x) || 0, Number(op.z) || 0, bag, 0);
        return true;
      }
      case 'dget': {
        const c = this.dch.find((q) => q.id === Number(op.id));
        if (!c) return true;
        give(c.bag);
        if (c.coins) this.sendFx('coin', 0, 0, 0, c.coins, from);
        this.sendFx('rescued', c.x, 0, c.z, c.kind, from);
        this.removeDChest(c.id);
        this.sendDch();
        return true;
      }
      case 'boat': {
        const k = (Number(op.k) | 0) as BoatK;
        if (!BOATS[k]) return true;
        const [x, z, yaw] = this.dockSpot();
        this.addBoat({ id: this.boatSeq++, k, x, z, yaw, hp: BOATS[k].hp, fuel: BOATS[k].fuel ? FUEL_SEC : 0 });
        this.sendBoats();
        return true;
      }
      case 'board': {
        const b = this.boats.find((q) => q.id === Number(op.id));
        if (!b) return true;
        if (op.off) {
          if (b.drv === from) b.drv = '';
        } else if (!b.drv || b.drv === from) b.drv = from;
        this.sendBoats();
        return true;
      }
      case 'boatHome': {
        const b = this.boats.find((q) => q.id === Number(op.id));
        if (!b) return true;
        const [x, z, yaw] = this.dockSpot();
        b.x = b.tx = x;
        b.z = b.tz = z;
        b.yaw = b.tyaw = yaw;
        b.drv = '';
        b.flip = 0;
        b.hp = Math.max(b.hp, b.maxHp * 0.5);
        this.sendBoats();
        return true;
      }
      case 'boatFix': {
        const b = this.boats.find((q) => q.id === Number(op.id));
        if (!b) return true;
        if (op.flip) {
          b.flip = 0;
          b.hp = Math.max(b.hp, b.maxHp * 0.4);
        } else b.hp = Math.min(b.maxHp, b.hp + 30);
        this.sendBoats();
        return true;
      }
      case 'refuel': {
        const b = this.boats.find((q) => q.id === Number(op.id));
        if (b) b.fuel = Math.min(FUEL_SEC * 3, b.fuel + Math.max(0, Number(op.n) | 0) * FUEL_SEC);
        this.sendBoats();
        return true;
      }
      case 'boss': {
        const b = this.bosses[Number(op.b) | 0];
        if (!b || !b.fighting) return true;
        const dmg = Math.min(40, Math.max(0, Number(op.dmg) || 0));
        const down = b instanceof Kraken ? b.hitPart(Number(op.part) | 0, dmg) : b.hit(dmg);
        if (!me) this.sendFx('bossHurt', b.x, 0, b.z, dmg);
        if (down) this.bossDefeated(b);
        return true;
      }
      case 'qte': {
        const b = this.bosses[Number(op.b) | 0];
        b?.qteResult(Number(op.id), !!op.ok);
        return true;
      }
    }
    return false;
  }
  private sendBoats(): void {
    if (this.net && this.isHost) this.net.send({ t: 'bts', l: this.boatList() });
  }
  private boatList(): unknown[] {
    return this.boats.map((b) => [b.id, b.k, r1(b.x), r1(b.z), r2(b.yaw), Math.round(b.hp), Math.round(b.fuel), b.drv, b.flip]);
  }
  /** convidado: aplica a lista de barcos do anfitrião */
  private applyBoats(l: unknown): void {
    if (!Array.isArray(l)) return;
    const seen = new Set<number>();
    const myId = this.net?.me.id ?? 'me';
    for (const a of l as [number, BoatK, number, number, number, number, number, string, number][]) {
      seen.add(a[0]);
      let b = this.boats.find((q) => q.id === a[0]);
      if (!b) b = this.addBoat({ id: a[0], k: a[1], x: a[2], z: a[3], yaw: a[4], hp: a[5], fuel: a[6] });
      b.hp = a[5];
      b.flip = a[8] | 0;
      if (b !== this.myBoat) {
        b.tx = a[2];
        b.tz = a[3];
        b.tyaw = a[4];
        b.fuel = a[6];
        b.drv = a[7] ?? '';
        if (b.drv === myId) b.drv = '';
      }
    }
    for (const b of [...this.boats])
      if (!seen.has(b.id)) {
        if (b === this.myBoat) this.leaveBoat(false);
        b.dispose();
        this.boats.splice(this.boats.indexOf(b), 1);
      }
  }

  /* ------------------------------ v2: efeitos ------------------------------ */
  private playFxV2(k: string, x: number, y: number, z: number, v: number, mine: boolean | string): void {
    const p = { x, y, z };
    const near = Math.hypot(x - this.me.x, z - this.me.z) < 90;
    switch (k) {
      case 'chest': {
        const r = Math.floor(v / 1000) as 0 | 1 | 2 | 3;
        this.fx.burst(x, y + 0.8, z, 10 + r * 8, 'spark', ['#ffe8a0', '#7fd0ff', '#d89aff', '#ffcf2e'][r], 2 + r * 0.6);
        if (mine) {
          this.coins(v % 1000);
          this.prog('chest', 1);
          this.hud.banner(r ? 'chestR' : 'chest', t('jangada.chestOpen', 'Baú {r}!', { r: rarityName(r) }), `+${v % 1000}`, 1.8);
        }
        break;
      }
      case 'coin':
        if (mine) this.coins(v);
        break;
      case 'rescued':
        this.fx.burst(x, this.waterAt(x, z) + 0.5, z, 14, 'spark', '#ffd34a', 2);
        if (mine) {
          this.au.fanfare();
          this.hud.banner(v ? 'star' : 'beacon', v ? t('jangada.treasureGot', 'Tesouro lendário!') : t('jangada.rescuedOk', 'Coisas recuperadas!'), '', 2);
        }
        break;
      case 'warn2':
        if (near) {
          this.au.sharkWarn();
          this.hud.banner('shark', t('jangada.shark2Coming', 'Tubarão-tigre!'), t('jangada.shark2Tip', 'No mar aberto eles são mais fortes'), 2.2);
        }
        break;
      case 'bossIntro':
        if (near) {
          this.introCam = 3.4;
          this.au.bossRoar(v);
          this.hud.banner(v ? 'kraken' : 'mega', v ? t('jangada.boss.kraken', 'POLVO GIGANTE') : t('jangada.boss.mega', 'MEGALODONTE'), t('jangada.bossTip', 'Use o arpão nos pontos que brilham!'), 3.4);
        }
        break;
      case 'megaWarn':
        if (near) this.au.megaWarn(p);
        break;
      case 'megaCharge':
      case 'krakenRaise':
      case 'krakenGrab':
        if (near) this.au.bossWhoosh(p);
        break;
      case 'megaRoar':
      case 'megaTail':
        if (near) this.au.bossRoar(0);
        break;
      case 'megaBite':
        if (near) {
          this.au.bite(p);
          this.camShake = 1;
        }
        break;
      case 'megaSplash':
      case 'krakenSlam':
        if (near) {
          this.au.splash(p, 1);
          this.fx.burst(x, this.waterAt(x, z) + 0.2, z, 40, 'foam', '#ffffff', 5);
          this.camShake = Math.max(this.camShake, 0.7);
        }
        break;
      case 'bubbles':
        if (near) {
          this.au.bubbles(8);
          for (let i = 0; i < 24; i++) this.fx.emit(x + (Math.random() - 0.5) * 6, this.waterAt(x, z), z + (Math.random() - 0.5) * 6, 0, 0.6, 0, { life: 0.8, size: 0.1, grow: 0.15 });
        }
        break;
      case 'dodge':
        if (mine) this.au.qteOk();
        break;
      case 'krakenInk':
        if (near) this.au.splash(p, 0.7);
        break;
      case 'inked':
        if (mine) this.hud.ink(4);
        break;
      case 'bossHurt':
        if (near) this.au.bossHit(false);
        break;
      case 'bossDown':
        if (near) {
          this.au.fanfare();
          this.hud.banner('star', t('jangada.bossDown', 'Chefe derrotado!'), t('jangada.bossLoot', 'Pegue o tesouro lendário boiando!'), 4);
          this.prog('boss', 1);
          this.bossDone[v ? 'kraken' : 'mega'] = this.day;
        }
        break;
      case 'boatHit':
        if (mine) {
          this.camShake = 0.8;
          this.au.crack(null);
          this.hud.flash();
        } else if (near) this.au.crack(p);
        break;
      case 'boatSink':
        if (mine) notify(t('jangada.boatFlip', 'O barco virou! Toque em USAR nele para desvirar.'), { icon: 'warning', kind: 'bad' });
        break;
    }
  }

  /* ------------------------------ peças ------------------------------ */
  private pieceT = 0;
  private simPieces(dt: number): void {
    this.pieceT -= dt;
    let dirty = false;
    const tick = this.pieceT <= 0;
    if (tick) this.pieceT = 0.25;
    const fires: { p: { x: number; y: number; z: number }; lv: number }[] = [];
    for (const p of this.raft.pieces) {
      const d = p.d;
      if (!d) continue;
      if (p.k === 'fire') {
        const lv = d.lv ?? 1;
        if ((d.fuel ?? 0) > 0) {
          d.fuel = Math.max(0, (d.fuel ?? 0) - dt * (0.6 + lv * 0.4));
          fires.push({ p: { x: p.x * CELL, y: DECK + p.lv * FLOOR_H + this.bobY, z: p.z * CELL }, lv });
          if (d.cook?.length) {
            for (const c of d.cook) c[1] -= dt * (0.8 + lv * 0.35);
            const ready = d.cook.filter((c) => c[1] <= 0);
            if (ready.length) {
              d.cook = d.cook.filter((c) => c[1] > 0);
              (d.done ??= []).push(...ready.map((c) => COOK[c[0]] ?? c[0]));
              this.sendFx('ding', p.x * CELL, DECK, p.z * CELL);
              dirty = true;
            }
            if (tick && Math.random() < 0.5) this.sendFx('sizzle', p.x * CELL, DECK + 0.6, p.z * CELL);
          }
          if (tick && Math.random() < 0.5 * this.fx.budget) this.fx.burst(p.x * CELL, DECK + p.lv * FLOOR_H + this.bobY + 0.5, p.z * CELL, 1, 'spark', '#ffb050', 0.6);
          if (d.fuel === 0) dirty = true;
        }
      } else if (p.k === 'purifier') {
        if ((d.fuel ?? 0) > 0 && (d.w ?? 0) < 3) {
          d.fuel = Math.max(0, (d.fuel ?? 0) - dt);
          d.wt = (d.wt ?? 0) + dt;
          if (d.wt >= 14) {
            d.wt = 0;
            d.w = (d.w ?? 0) + 1;
            dirty = true;
            this.sendFx('ding', p.x * CELL, DECK, p.z * CELL);
          }
          if (tick && Math.random() < 0.4) {
            this.sendFx('boil', p.x * CELL, DECK + 0.8, p.z * CELL);
            this.fx.burst(p.x * CELL, DECK + p.lv * FLOOR_H + this.bobY + 0.9, p.z * CELL, 1, 'steam', '#ffffff', 0.4);
          }
        }
      } else if (p.k === 'planter') {
        if ((d.g ?? -1) >= 0 && (d.g ?? 0) < 1) {
          d.g = Math.min(1, (d.g ?? 0) + dt / (150 - this.storm * 60));
          if (d.g >= 1) {
            dirty = true;
            this.sendFx('grown', p.x * CELL, DECK, p.z * CELL);
          }
        }
      }
    }
    if (dirty) this.raft.ver++;
    if (tick) this.au.setFires(fires);
  }
  /** pisos da beirada para o tubarão */
  private edges(): [number, number, number, number, number][] {
    const out: [number, number, number, number, number][] = [];
    for (const p of this.raft.edgeTiles()) {
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        if (this.raft.surfAt(p.x + dx, p.z + dz, 0)) continue;
        out.push([p.id, p.x * CELL, p.z * CELL, dx, dz]);
        break;
      }
    }
    return out;
  }
  private swimmers(boats = false): [string, number, number, number][] {
    const out: [string, number, number, number][] = [];
    const myId = this.net?.me.id ?? 'me';
    if (this.me.swim) out.push([myId, this.me.x, this.me.y, this.me.z]);
    for (const r of this.remotes.values()) if (r.sw) out.push([r.id, r.x, r.y, r.z]);
    if (boats) for (const b of this.boats) if (b.drv && !b.flip) out.push([b.drv, b.x, b.y - 0.6, b.z]);
    return out;
  }
  private sharkBite(id: number, x: number, z: number): void {
    const D = DIFFS[this.diff];
    const broke = this.raft.damage(id, D.bite);
    this.sendFx(broke ? 'crack' : 'bite', x, DECK, z);
    if (broke) {
      notify(t('jangada.broke', 'O Mordelão quebrou um piso!'), { icon: 'warning', kind: 'bad', key: 'jgbroke' });
      // quem estava em cima cai na água: a física cuida
    } else if (Math.random() < 0.4) notify(t('jangada.biting', 'O Mordelão está mordendo a jangada! Use a lança!'), { icon: 'warning', kind: 'bad', key: 'jgbite' });
  }
  /** mordida em quem nada (~5% da vida por mordida; tubarão-tigre um pouco mais). Em barco: bate no casco. */
  private sharkBiteMe(who: string, s: Shark): void {
    const myId = this.net?.me.id ?? 'me';
    const dmg = [4, 5, 6][this.diff] * (s.variant ? 1.4 : 1);
    const boat = this.boats.find((b) => b.drv === who);
    if (boat) {
      this.boatHit(boat, s.variant ? 12 : 8, s.x, s.z);
      return;
    }
    if (who === myId) this.hurt(dmg, true, s.x, s.z);
    else this.net?.send({ t: 'hurt', d: dmg, fx: r1(s.x), fz: r1(s.z) }, who);
  }
  private ghostTarget(): [number, number, number, 'chest' | 'fire'] | null {
    const chests = this.raft.pieces.filter((p) => p.k === 'chest' && Object.keys(p.d?.bag ?? {}).length);
    if (chests.length) {
      const c = chests[Math.floor(Math.random() * chests.length)];
      return [c.id, c.x * CELL, c.z * CELL, 'chest'];
    }
    const f = this.raft.pieces.find((p) => p.k === 'fire' && (p.d?.fuel ?? 0) > 0);
    if (f) return [f.id, f.x * CELL, f.z * CELL, 'fire'];
    return null;
  }
  private stolen: Bag = {};
  private ghostSteal(id: number, kind: 'chest' | 'fire'): boolean {
    const p = this.raft.get(id);
    if (!p) return false;
    if (kind === 'fire') {
      p.d!.fuel = 0;
      this.raft.ver++;
      this.sendFx('poof', p.x * CELL, DECK + 0.5, p.z * CELL);
      notify(t('jangada.ghostFire', 'O Capitão Bu apagou a fogueira!'), { icon: 'warning', kind: 'bad', key: 'jgghost' });
      return false;
    }
    const bag = pieceBag(p);
    const ids = Object.keys(bag) as ItemId[];
    this.stolen = {};
    for (let i = 0; i < DIFFS[this.diff].steal && ids.length; i++) {
      const it = ids.splice(Math.floor(Math.random() * ids.length), 1)[0];
      const n = Math.ceil((bag[it] ?? 0) / 2);
      bagMove(bag, this.stolen, it, n);
    }
    this.raft.ver++;
    notify(t('jangada.ghostStole', 'O Capitão Bu pegou coisas do baú! Espante ele!'), { icon: 'warning', kind: 'bad', key: 'jgghost' });
    return true;
  }
  /** luz perto (lampião aceso / lanterna) */
  private lightAt(x: number, z: number): number {
    let l = 0;
    for (const p of this.raft.pieces) if (p.k === 'lamp' && p.d?.on !== false && Math.hypot(p.x * CELL - x, p.z * CELL - z) < 4) l = 1;
    return l;
  }

  /* ============================== eu ============================== */
  private kd = (e: KeyboardEvent) => {
    if (this.hud.overlay) return;
    this.keys.add(e.code);
    if (e.code === 'Space') {
      this.jumpHeld = true;
      this.jumpQ = true;
    }
    if (e.code === 'KeyE') this.onUse();
    if (e.code === 'KeyF' || e.code === 'Enter') this.onAction(true);
    if (e.code === 'KeyC') this.cycleCam();
    if (e.code === 'KeyR') this.buildRo = (this.buildRo + 1) % 4;
    if (e.code === 'Tab') {
      e.preventDefault();
      this.openCraft();
    }
    if (e.code === 'ShiftLeft') this.diveHeld = true;
    if (/^Digit[1-9]$/.test(e.code)) this.selectSlot(+e.code.slice(5) - 1);
  };
  private ku = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    if (e.code === 'Space') this.jumpHeld = false;
    if (e.code === 'KeyF' || e.code === 'Enter') this.onAction(false);
    if (e.code === 'ShiftLeft') this.diveHeld = false;
  };

  /** chão sob (x, z) com pés em y: jangada (com balanço) ou ilha; null = água */
  private groundAt(x: number, z: number, y: number): number | null {
    const g = this.raft.groundAt(x, z, y - this.bobY);
    let best = g === null ? null : g + this.bobY;
    if (this.isl) {
      const h = this.isl.heightAt(x, z);
      if (h > -1.05 && h <= y + 0.6 && (best === null || h > best)) best = h;
    }
    return best;
  }
  private collidesAt(x: number, z: number, y: number): boolean {
    return this.collides(x, z, y);
  }
  private collides(x: number, z: number, y: number): boolean {
    const by = this.bobY;
    for (const b of this.raft.boxes()) {
      if (y + 1.6 < b.y0 + by || y + 0.25 > b.y1 + by) continue;
      if (x + RAD > b.x0 && x - RAD < b.x1 && z + RAD > b.z0 && z - RAD < b.z1) return true;
    }
    // nadando: a jangada é um bloco
    if (this.me.swim && y < DECK + by - 0.2) {
      const cx = cellOf(x);
      const cz = cellOf(z);
      for (let ox = -1; ox <= 1; ox++)
        for (let oz = -1; oz <= 1; oz++) {
          if (!this.raft.isFound(cx + ox, cz + oz)) continue;
          const bx = (cx + ox) * CELL;
          const bz = (cz + oz) * CELL;
          if (Math.abs(x - bx) < CELL / 2 + RAD * 0.8 && Math.abs(z - bz) < CELL / 2 + RAD * 0.8) return true;
        }
    }
    const isl = this.isl;
    if (isl && Math.hypot(x - isl.x, z - isl.z) < isl.r + 6) {
      for (const n of isl.nodes) {
        if (!solidNode(n.k) || (!n.alive && n.k !== 'chest')) continue;
        const r = n.k === 'palm' ? 0.25 : n.k === 'tree' ? 0.4 : n.k === 'chest' ? 0.45 : 0.7;
        if (Math.hypot(x - (n.x + isl.x), z - (n.z + isl.z)) < r + RAD) return true;
      }
      if (isl.blocks(x, z, RAD)) return true;
    }
    return false;
  }
  private controlMe(dt: number): void {
    const m = this.me;
    // olhar e andar: kit de 1ª pessoa compartilhado (mesmo "feel" da Cozinha)
    const [lx, ly] = this.ctl.consumeLook(dt);
    const fpc = this.fpc;
    fpc.yaw = m.yaw;
    fpc.pitch = m.pitch;
    fpc.look(lx, ly);
    m.yaw = fpc.yaw;
    m.pitch = fpc.pitch;
    let [mx, my] = this.ctl.dir();
    if (this.hud.overlay || this.hud.qte.active) mx = my = 0;
    if (this.keys.size) {
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) my = 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) my = -1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx = -1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx = 1;
    }
    if (this.myBoat) {
      this.driveBoat(dt, mx, my);
      return;
    }
    const starving = (m.food <= 0 || m.water <= 0) && DIFFS[this.diff].starve === 0;
    const sneaking = this.sneak && !m.swim;
    const sp = (m.swim ? SWIM_SPEED : SPEED) * (starving ? 0.6 : 1) * (this.fish.st !== 'idle' ? 0.5 : 1) * (sneaking ? 0.5 : 1);
    const fp = this.fp;
    fp.tune.speed = sp;
    fp.x = m.x;
    fp.z = m.z;
    fp.vx = m.vx;
    fp.vz = m.vz;
    let k = mx || my ? ACCEL : DECEL;
    if (!m.grounded && !m.swim) k *= 0.35;
    if (m.swim) k *= 0.45;
    fp.accelOverride = m.grounded && !m.swim ? null : k;
    fp.steer(dt, mx, my, m.yaw);
    fp.move(dt);
    m.x = fp.x;
    m.z = fp.z;
    m.vx = fp.vx;
    m.vz = fp.vz;
    m.speedK = Math.min(1, Math.hypot(m.vx, m.vz) / SPEED);
    const water = this.waterAt(m.x, m.z);
    if (!m.swim) {
      const g = this.groundAt(m.x, m.z, m.y);
      if (this.jumpQ && m.grounded) {
        m.vy = JUMP_V;
        m.grounded = false;
        this.au.jump();
      }
      this.jumpQ = false;
      if (!m.grounded || g === null || m.y > g + 0.05) {
        m.vy -= GRAV * dt;
        m.y += m.vy * dt;
        const ceil = this.raft.ceilAt(m.x, m.z, m.y - this.bobY) + this.bobY;
        if (m.y + 1.75 > ceil && m.vy > 0) {
          m.y = ceil - 1.75;
          m.vy = 0;
        }
        m.grounded = false;
        if (g !== null && m.y <= g) {
          m.y = g;
          if (m.vy < -6) this.au.land(Math.min(1, -m.vy / 14));
          m.vy = 0;
          m.grounded = true;
        }
      } else {
        // segue o chão (degrau/rampa/balanço)
        m.y += (g - m.y) * Math.min(1, dt * 18);
        m.vy = 0;
        m.grounded = true;
      }
      m.onIsl = !!this.isl && g !== null && Math.abs(g - this.isl.heightAt(m.x, m.z)) < 0.05 && this.raft.groundAt(m.x, m.z, m.y - this.bobY) === null;
      if (m.onIsl && this.isl) this.landedOn(this.isl);
      // caiu na água
      if (g === null && m.y < water - 0.6) {
        m.swim = true;
        m.grounded = false;
        m.vy *= 0.3;
        this.au.plunge();
        this.fx.burst(m.x, water + 0.1, m.z, 14, 'foam', '#ffffff', 2.2);
      }
      // passos
      if (m.grounded && m.speedK > 0.2) {
        const ph = Math.floor(m.bob / Math.PI);
        if (ph !== m.stepPh) {
          m.stepPh = ph;
          this.au.step(m.onIsl ? 'sand' : this.raft.groundAt(m.x, m.z, m.y - this.bobY) !== null ? 'wood' : 'water', m.speedK);
        }
      }
    } else {
      // nadando
      const float = water - 1.2;
      const floor = this.isl ? Math.max(this.isl.heightAt(m.x, m.z), -16) : -16;
      this.sneak = false;
      if (this.diveHeld) m.vy += (-2.6 - m.vy) * Math.min(1, dt * 4);
      else if (this.jumpHeld && m.y < float - 0.3) m.vy += (2.8 - m.vy) * Math.min(1, dt * 4);
      else m.vy += ((float - m.y) * 2.2 - m.vy) * Math.min(1, dt * 3);
      m.y += m.vy * dt;
      if (m.y < floor + 0.1) {
        m.y = floor + 0.1;
        m.vy = Math.max(0, m.vy);
      }
      // sair da água: pé no chão da ilha ou subir na jangada
      const g = this.groundAt(m.x, m.z, m.y + 1.2);
      if (this.isl && g !== null && g > water - 0.95 && this.isl.heightAt(m.x, m.z) > water - 0.95) {
        m.swim = false;
        m.y = g;
        m.grounded = true;
      } else if (this.jumpQ || (this.jumpHeld && m.y > float - 0.35)) {
        this.jumpQ = false;
        const c = this.climbSpot();
        if (c) {
          m.swim = false;
          m.x = c[0];
          m.z = c[1];
          m.y = DECK + this.bobY + 0.05;
          m.vy = 2;
          m.grounded = false;
          this.au.splash(null, 0.4);
          this.fx.burst(m.x, water, m.z, 10, 'foam', '#ffffff', 1.5);
        }
      }
      this.jumpQ = false;
      // braçadas no ritmo do nado (não aleatórias): mais rápido = braçadas mais curtas
      if (m.speedK > 0.18) {
        this.strokePh += dt * (0.75 + m.speedK * 0.65);
        if (this.strokePh >= 1) {
          this.strokePh -= 1;
          this.au.stroke(m.speedK, this.auUnder);
        }
      } else this.strokePh = Math.min(this.strokePh, 0.7);
      if (Math.random() < dt * m.speedK * 3 * this.fx.budget && m.y > float - 0.4) this.fx.emit(m.x + (Math.random() - 0.5) * 0.6, water, m.z + (Math.random() - 0.5) * 0.6, 0, 0.3, 0, { life: 0.6, size: 0.07, grow: 0.1 });
    }
    m.bob = this.fpc.bob;
    if (m.invT > 0) m.invT -= dt;
    // fim do mapa: a correnteza devolve (crianças não se perdem)
    const far = Math.hypot(m.x, m.z);
    if (far > RING.far[1] + 140) {
      m.x -= (m.x / far) * dt * 3;
      m.z -= (m.z / far) * dt * 3;
    }
  }
  /** ponto do convés mais perto para subir (nadando na beirada) */
  private climbSpot(): [number, number] | null {
    const m = this.me;
    const cx = cellOf(m.x);
    const cz = cellOf(m.z);
    let best: [number, number] | null = null;
    let bd = 1.4;
    for (let ox = -1; ox <= 1; ox++)
      for (let oz = -1; oz <= 1; oz++) {
        const x = cx + ox;
        const z = cz + oz;
        if (!this.raft.isFound(x, z)) continue;
        // ponto do piso mais perto
        const px = Math.max(x * CELL - CELL / 2 + 0.35, Math.min(m.x, x * CELL + CELL / 2 - 0.35));
        const pz = Math.max(z * CELL - CELL / 2 + 0.35, Math.min(m.z, z * CELL + CELL / 2 - 0.35));
        const d = Math.hypot(px - m.x, pz - m.z);
        if (d < bd && !this.collides(px, pz, DECK + this.bobY + 0.05)) {
          bd = d;
          best = [px, pz];
        }
      }
    return best;
  }
  private respawn(): void {
    const m = this.me;
    const b = this.bed && this.raft.pieces.some((p) => p.k === 'bed' && p.x * CELL === this.bed![0] && p.z * CELL === this.bed![1]) ? this.bed : null;
    const [cx, cz] = b ?? this.raft.center();
    const c = this.raft.isFound(cellOf(cx), cellOf(cz)) ? [cx, cz] : (() => {
      const f = this.raft.pieces.find((p) => p.k === 'found')!;
      return [f.x * CELL, f.z * CELL];
    })();
    m.x = c[0] + 0.01;
    m.z = c[1] + 0.01;
    m.y = DECK + this.bobY + 0.3;
    m.vx = m.vy = m.vz = 0;
    m.swim = false;
    m.air = 1;
  }

  /* ------------------------------ sobrevivência ------------------------------ */
  private survival(dt: number): void {
    if (this.paused || this.waitingInit) return;
    const m = this.me;
    const D = DIFFS[this.diff];
    const sleepy = this.sleeping ? 0.3 : 1;
    m.food = Math.max(0, m.food - D.hunger * dt * sleepy);
    m.water = Math.max(0, m.water - D.thirst * dt * sleepy * (this.isNightNow() ? 0.8 : 1));
    if ((m.food <= 0 || m.water <= 0) && D.starve > 0) this.hurt(D.starve * dt, false);
    if (m.food > 55 && m.water > 55 && m.hp < 100) m.hp = Math.min(100, m.hp + dt * 0.5);
    // ar
    const eyeY = this.cam.position.y;
    const under = m.swim && eyeY < this.waterAt(this.cam.position.x, this.cam.position.z) - 0.05;
    if (under) {
      m.air = Math.max(0, m.air - dt / 28);
      if (m.air <= 0) this.hurt(9 * dt, false);
      if (Math.random() < dt * 0.45) this.au.bubbles(2);
    } else m.air = Math.min(1, m.air + dt / 2.5);
    this.warnT -= dt;
    if (this.warnT <= 0 && (m.food < 18 || m.water < 18)) {
      this.warnT = 20;
      this.au.warn();
      notify(m.water < m.food ? t('jangada.thirsty', 'Com sede! Beba água doce.') : t('jangada.hungry', 'Com fome! Coma alguma coisa.'), { icon: 'warning', key: 'jgwarn' });
    }
    if (m.hp <= 0) this.faint();
  }
  private hurt(n: number, big: boolean, fromX?: number, fromZ?: number, sound: 'chomp' | 'bonk' | 'none' = 'chomp'): void {
    const m = this.me;
    if (big && m.invT > 0) return;
    if (this.dying) return;
    m.hp = Math.max(0, m.hp - n);
    if (big) {
      m.invT = 0.6;
      this.hud.flash();
      if (sound === 'chomp') this.au.chomp();
      else if (sound === 'bonk') this.au.bonk();
      this.au.hurt();
      tap('heavy');
      this.camShake = 0.8;
      // empurrão para longe de quem bateu
      if (fromX !== undefined && fromZ !== undefined && !this.myBoat) {
        const dx = m.x - fromX;
        const dz = m.z - fromZ;
        const d = Math.hypot(dx, dz) || 1;
        const k = m.swim ? 3.2 : 4.5;
        m.vx += (dx / d) * k;
        m.vz += (dz / d) * k;
        if (!m.swim && m.grounded) {
          m.vy = 3;
          m.grounded = false;
        }
      }
    }
  }
  private dying = false;
  /** fase da braçada (0..1) e "debaixo d'água" do som (com histerese) */
  private strokePh = 0;
  private seabed: Seabed;
  private auUnder = false;
  private camShake = 0;
  private uwCol = new THREE.Color();
  /** cor da neblina já em sRGB (o shader do mar escreve a cor direto, sem conversão) */
  private uwFogS = new THREE.Color();
  private photo: [number, number, number, number, number, number] | null = null;
  private handHidden = false;
  /** kit de 1ª pessoa: corpo (aceleração/frenagem da Cozinha, deslizar nas paredes) e câmera (balanço, tremor) */
  private fp = new FpController(fpTuning('cozinha', { radius: RAD }), { isFree: (x, z) => !this.collides(x, z, this.me.y) });
  private fpc = new FpCamera(fpTuning('cozinha', { eye: EYE, pitchMin: -1.35, pitchMax: 1.3 }));
  /** desmaiou: tudo o que carregava vai para um baú boiando no lugar; acorda na cama/jangada */
  private faint(): void {
    if (this.dying) return;
    this.dying = true;
    const m = this.me;
    this.hud.fade(true);
    this.au.faint();
    this.hud.qte.cancel();
    const x = m.x;
    const z = m.z;
    const bag: Bag = { ...this.inv };
    const had = bagCount(bag) > 0;
    if (had) this.act({ o: 'dchest', x: r1(x), z: r1(z), b: bag });
    this.inv = {};
    this.dropHook();
    this.endFish(false);
    if (this.myBoat) {
      // o barco volta sozinho para a jangada
      const b = this.myBoat;
      this.leaveBoat(true);
      this.act({ o: 'boatHome', id: b.id });
    }
    setTimeout(() => {
      m.hp = 100;
      m.food = Math.max(m.food, 55);
      m.water = Math.max(m.water, 55);
      m.invT = 2;
      this.respawn();
      this.updateHot();
      this.dying = false;
      this.hud.fade(false);
      this.hud.banner('beacon', t('jangada.died', 'Você desmaiou!'), had ? t('jangada.diedSub', 'Suas coisas estão num baú boiando: siga a luz amarela') : t('jangada.diedSub2', 'Acordou na jangada. Coma e beba!'), 4);
      if (had) {
        const c = this.dch.filter((q) => q.kind === 0).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0];
        if (c) this.target = -100 - c.id;
      }
    }, 1100);
  }
  private sleeping = false;
  private sleep(): void {
    if (this.sleeping) return;
    this.sleeping = true;
    this.hud.fade(true);
    this.au.lullaby();
    setTimeout(() => {
      if (this.isHost && !this.net) {
        if (this.tod > 0.5) {
          this.day++;
          this.tod = 0.01;
          this.dawn();
        }
      }
      this.me.hp = Math.min(100, this.me.hp + 25);
      this.sleeping = false;
      this.hud.fade(false);
      if (this.net) notify(t('jangada.slept', 'Que soninho bom! (online a noite continua)'), { icon: 'bed' });
    }, 2200);
  }

  /* ============================== mira e ações ============================== */
  private eyePos(): THREE.Vector3 {
    return new THREE.Vector3(this.me.x, this.me.y + EYE, this.me.z);
  }
  private lookDir(): THREE.Vector3 {
    const m = this.me;
    return new THREE.Vector3(-Math.sin(m.yaw) * Math.cos(m.pitch), Math.sin(m.pitch), -Math.cos(m.yaw) * Math.cos(m.pitch));
  }
  private updateAim(): void {
    const held = this.sel;
    const o = this.eyePos();
    const d = this.lookDir();
    this.aim = null;
    this.trashT = null;
    // peças (esferas aproximadas)
    let best = USE_R + 0.6;
    for (const p of this.raft.pieces) {
      if (p.k === 'found' || p.k === 'floor') continue;
      const c = new THREE.Vector3(p.x * CELL, DECK + p.lv * FLOOR_H + this.bobY + (p.k === 'sail' ? 1.2 : p.k === 'net' ? -0.1 : 0.5), p.z * CELL);
      const to = c.clone().sub(o);
      const along = to.dot(d);
      if (along < 0 || along > best) continue;
      const perp = to.clone().addScaledVector(d, -along).length();
      if (perp < (p.k === 'wall' || p.k === 'sail' ? 0.8 : 0.6)) {
        best = along;
        this.aim = { k: 'piece', p };
      }
    }
    // piso (para consertar/desmontar): raio no plano do convés
    if (!this.aim && (held === 'hammer' || this.buildSel === 'trash')) {
      const y = DECK + this.bobY;
      if (d.y < -0.05) {
        const k = (y - o.y) / d.y;
        if (k > 0 && k < REACH) {
          const hx = o.x + d.x * k;
          const hz = o.z + d.z * k;
          const f = this.raft.surfAt(cellOf(hx), cellOf(hz), 0);
          if (f) this.aim = { k: 'piece', p: f };
        }
      }
    }
    // ilha
    if (this.isl) {
      const pt = o.clone().addScaledVector(d, 1.6);
      const n = this.isl.nearest(pt.x, pt.z, pt.y, 2.4, null);
      if (n && (!this.aim || this.aim.k !== 'piece')) this.aim = { k: 'node', n, i: this.isl };
      const ow = this.owners.get(this.isl.id);
      const np = ow?.aim(o, d, ow.friendly ? 4 : held === 'lantern' ? 9 : isHarpoon(held) ? 14 : 4);
      if (np && ow) this.aim = { k: 'npc', n: np, o: ow };
    }
    // barcos e baús boiando
    for (const b of this.boats) {
      if (b === this.myBoat || (b.drv && b.drv !== (this.net?.me.id ?? 'me'))) continue;
      const to = new THREE.Vector3(b.x, b.y + 0.3, b.z).sub(o);
      const dist = to.length();
      if (dist < 4.2 && to.normalize().dot(d) > 0.6) this.aim = { k: 'boat', b };
    }
    for (const c of this.dch) {
      const to = new THREE.Vector3(c.x, this.waterAt(c.x, c.z) + 0.3, c.z).sub(o);
      const dist = to.length();
      if (dist < 3.6 && to.normalize().dot(d) > 0.55) this.aim = { k: 'dchest', c };
    }
    // bichos (lança/machado/lanterna)
    for (const s of [this.shark, ...this.sharks2]) {
      if (!s.active) continue;
      const sp = new THREE.Vector3(s.x, s.y + 0.3, s.z);
      const to = sp.sub(o);
      const dist = to.length();
      if (dist < (isHarpoon(held) ? 16 : 4.2) && to.normalize().dot(d) > (isHarpoon(held) ? 0.93 : 0.7)) this.aim = { k: 'shark', s };
    }
    // chefes: esferas de acerto ao longo do corpo
    for (const b of this.bosses) {
      if (!b.fighting) continue;
      const reach = isHarpoon(held) ? 40 : 5.5;
      let bestT = reach;
      for (const h of b.hitSpheres()) {
        const to = new THREE.Vector3(h.x, h.y, h.z).sub(o);
        const along = to.dot(d);
        if (along < 0 || along > bestT + h.r) continue;
        const perp = to.addScaledVector(d, -along).length();
        if (perp < h.r * (isHarpoon(held) ? 1.1 : 1.5) && (!this.aim || this.aim.k !== 'boss' || h.w > this.aim.h.w)) {
          bestT = along;
          this.aim = { k: 'boss', b, h };
        }
      }
    }
    if (this.ghost.active && this.ghost.st !== 'scared') {
      const gp = new THREE.Vector3(this.ghost.x, this.ghost.y + 0.5, this.ghost.z);
      const to = gp.sub(o);
      const dist = to.length();
      if (dist < (held === 'lantern' ? 8 : 3.5) && to.normalize().dot(d) > (held === 'lantern' ? 0.82 : 0.75)) this.aim = { k: 'ghost' };
    }
    this.updateBuildGhost(o, d);
  }

  /** pré-visualização da peça (fantasma verde/vermelho) */
  private updateBuildGhost(o: THREE.Vector3, d: THREE.Vector3): void {
    const k = this.sel === 'hammer' ? this.buildSel : null;
    this.ghostOk = false;
    this.ghostCell = null;
    if (!k || k === 'trash') {
      if (this.ghostMesh) this.ghostMesh.visible = false;
      if (k === 'trash' && this.aim?.k === 'piece') this.trashT = this.aim.p;
      return;
    }
    const def = PIECE[k];
    const fl = this.raft.fireLv();
    const tryLv = (lv: number, y: number): [number, number, number] | null => {
      if (d.y > -0.02) return null;
      const t0 = (y + this.bobY - o.y) / d.y;
      if (t0 <= 0 || t0 > REACH + 2) return null;
      const hx = o.x + d.x * t0;
      const hz = o.z + d.z * t0;
      if (Math.hypot(hx - this.me.x, hz - this.me.z) > REACH) return null;
      this.ghostHit = [hx, hz];
      return [cellOf(hx), cellOf(hz), lv];
    };
    let cell: [number, number, number] | null = null;
    if (def.slot === 'found' || def.slot === 'water') cell = tryLv(0, 0.05);
    else if (def.slot === 'surf') cell = tryLv(1, DECK + FLOOR_H - 0.3) ?? tryLv(1, DECK);
    else {
      const up = this.me.y - this.bobY > DECK + 1.2;
      const c1 = up && def.up ? tryLv(1, DECK + FLOOR_H) : null;
      cell = c1 && this.raft.surfAt(c1[0], c1[1], 1) ? c1 : tryLv(0, DECK);
    }
    if (!cell) {
      if (this.ghostMesh) this.ghostMesh.visible = false;
      return;
    }
    if (def.slot === 'surf') cell[2] = 1;
    // perdoa a mira: se a célula não serve, pega a vizinha válida mais perto do ponto mirado
    if (this.raft.canPlace(k, cell[0], cell[1], cell[2], fl)) {
      const hit = this.ghostHit;
      let best: [number, number, number] | null = null;
      let bd = 1.25 * CELL;
      for (let ox = -1; ox <= 1; ox++)
        for (let oz = -1; oz <= 1; oz++) {
          const cx = cell[0] + ox;
          const cz = cell[1] + oz;
          if (this.raft.canPlace(k, cx, cz, cell[2], fl)) continue;
          const dd = Math.hypot(cx * CELL - hit[0], cz * CELL - hit[1]);
          if (dd < bd && Math.hypot(cx * CELL - this.me.x, cz * CELL - this.me.z) <= REACH) {
            bd = dd;
            best = [cx, cz, cell[2]];
          }
        }
      if (best) cell = best;
    }
    const why = this.raft.canPlace(k, cell[0], cell[1], cell[2], fl);
    this.ghostOk = why === '' && bagHas(this.inv, def.cost);
    this.ghostCell = cell;
    // malha
    let mask = 0;
    if (def.link) {
      const bits: [number, number, number][] = [
        [1, 0, -1],
        [2, 1, 0],
        [4, 0, 1],
        [8, -1, 0],
      ];
      for (const [b, dx, dz] of bits) {
        const n = this.raft.objAt(cell[0] + dx, cell[1] + dz, cell[2]);
        if (n && (n.k === 'rail' || n.k === 'wall')) mask |= b;
      }
    }
    const key = `${k}|${mask}`;
    if (key !== this.ghostKey || !this.ghostMesh) {
      this.ghostKey = key;
      if (this.ghostMesh) {
        this.raftG.remove(this.ghostMesh);
        this.ghostMesh.geometry.dispose();
      }
      const geo = k === 'found' ? foundationGeo(1) : k === 'net' ? foundationGeo(2) : k === 'floor' ? floorGeo() : k === 'stairs' ? stairsGeo() : def.link ? linkGeo(k as 'rail' | 'wall', mask) : pieceGeo(k, 1);
      this.ghostMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#5aff8a', transparent: true, opacity: 0.45, depthWrite: false }));
      this.ghostMesh.renderOrder = 3;
      this.raftG.add(this.ghostMesh);
    }
    const g = this.ghostMesh;
    g.visible = true;
    g.position.set(cell[0] * CELL, (def.slot === 'surf' ? 0 : cell[2] * FLOOR_H) + (k === 'net' ? -DECK + 0.05 : 0) + Math.sin(this.time * 5) * 0.02, cell[1] * CELL);
    g.rotation.y = def.link ? 0 : (-this.buildRo * Math.PI) / 2;
    (g.material as THREE.MeshBasicMaterial).color.set(this.ghostOk ? '#5aff8a' : '#ff5a6a');
  }

  private selectSlot(i: number): void {
    const list = this.hotList();
    const it = list[i];
    if (!it) return;
    if (it.id === this.sel && ITEM[it.id].kind === 'food') {
      // tocar de novo na comida = comer
      this.consume(it.id as Food);
      return;
    }
    this.setHeld(it.id);
    this.au.ui1();
  }
  setHeld(id: ItemId): void {
    if (this.sel === id) return;
    if (this.sel === 'hook' || this.sel === 'hook2') this.dropHook();
    if (this.sel === 'rod') this.endFish(false);
    this.sel = id;
    if (id !== 'hammer') this.buildSel = null;
    else if (!this.buildSel) this.buildSel = 'found';
    this.updateHot();
  }
  private hotList(): HotItem[] {
    return HOT_ORDER.filter((id) => (this.inv[id] ?? 0) > 0)
      .slice(0, HOT_MAX)
      .map((id) => ({ id, n: this.inv[id] ?? 0 }));
  }
  private updateHot(): void {
    const list = this.hotList();
    if (!list.some((i) => i.id === this.sel)) this.sel = list[0]?.id ?? 'hook';
    this.hud.setHot(
      list,
      list.findIndex((i) => i.id === this.sel),
    );
  }
  private hookTool(): ItemId | null {
    return this.sel === 'hook' || this.sel === 'hook2' ? this.sel : null;
  }

  onAction(down: boolean): void {
    if (this.paused || this.hud.overlay) return;
    const id = this.sel;
    if (this.hookTool()) {
      const h = this.hook;
      if (down) {
        if (h.st === 'idle') {
          h.st = 'charge';
          h.charge = 0;
        } else h.reel = true;
      } else {
        if (h.st === 'charge') this.throwHook();
        h.reel = false;
      }
      return;
    }
    if (!down) return;
    if (this.actCd > 0) return;
    // comida na mão mirando um guarda: joga de isca (distrai)
    if (ITEM[id]?.kind === 'food' && this.aim?.k === 'npc' && !this.aim.o.friendly) return this.throwBait(id, this.aim.o);
    if (id === 'hammer' && this.aim?.k === 'boat') return this.fixBoat(this.aim.b);
    switch (id) {
      case 'hammer':
        return this.hammerAct();
      case 'spear':
      case 'spear2':
      case 'spear3':
      case 'axe':
        return this.swing(id);
      case 'harpoon':
      case 'harpoon2':
        return this.throwHarpoon(id);
      case 'rod':
        return this.rodAct();
      case 'lantern':
        this.lanternOn = !this.lanternOn;
        this.au.ui1();
        return;
      default:
        if (ITEM[id]?.kind === 'food') this.consume(id as Food);
    }
  }
  lanternOn = true;

  private consume(id: Food): void {
    if ((this.inv[id] ?? 0) <= 0) return;
    const [f, w, h] = FOOD[id];
    const m = this.me;
    if (m.food >= 99 && m.water >= 99 && f >= 0) {
      notify(t('jangada.full', 'Barriga cheia!'), { icon: 'heart', key: 'jgfull', ms: 1200 });
      return;
    }
    bagAdd(this.inv, { [id]: 1 }, -1);
    m.food = Math.max(0, Math.min(100, m.food + f));
    m.water = Math.max(0, Math.min(100, m.water + w));
    m.hp = Math.min(100, m.hp + h);
    if (id === 'water' || id === 'coco') {
      this.au.drink();
      if (id === 'water') this.prog('drink', 1);
    } else this.au.eat();
    if (f >= 25) this.au.ahh();
    this.prog('eat', 1);
    this.swingT = 0.4;
    this.actCd = 0.6;
    this.updateHot();
  }

  /* ------------------------------ gancho ------------------------------ */
  private handWorld(): THREE.Vector3 {
    const m = this.me;
    const rx = Math.cos(m.yaw);
    const rz = -Math.sin(m.yaw);
    return new THREE.Vector3(m.x + rx * 0.3 - Math.sin(m.yaw) * 0.3, m.y + 1.15, m.z + rz * 0.3 - Math.cos(m.yaw) * 0.3);
  }
  private throwHook(): void {
    const h = this.hook;
    const p = Math.max(0.15, h.charge);
    const d = this.lookDir();
    const pow = this.sel === 'hook2' ? 1.3 : 1;
    h.p.copy(this.handWorld());
    const up = Math.max(0.15, d.y + 0.35);
    h.v.set(d.x, 0, d.z).normalize().multiplyScalar((5 + p * 11) * pow);
    h.v.y = (2.5 + p * 4) * up * 1.6;
    h.st = 'fly';
    h.caught = [];
    this.au.throwHook(p);
    this.swingT = 0.35;
    tap('light');
  }
  private dropHook(): void {
    const h = this.hook;
    for (const d of h.caught) d.hooked = false;
    h.caught = [];
    h.st = 'idle';
    h.reel = false;
  }
  private updateHook(dt: number): void {
    const h = this.hook;
    if (this.actCd > 0) this.actCd -= dt;
    if (this.swingT > 0) this.swingT -= dt;
    const tool = this.hookTool();
    if (!tool && h.st !== 'idle') this.dropHook();
    if (h.st === 'charge') {
      h.charge = Math.min(1, h.charge + dt / 0.9);
      this.hud.setCharge(h.charge);
    } else this.hud.setCharge(null);
    this.hookHead.visible = h.st === 'fly' || h.st === 'water';
    this.line.visible = this.hookHead.visible;
    if (h.st === 'fly') {
      h.v.y -= 14 * dt;
      h.p.addScaledVector(h.v, dt);
      const hand = this.handWorld();
      const maxL = this.sel === 'hook2' ? 32 : 24;
      if (Math.hypot(h.p.x - hand.x, h.p.z - hand.z) > maxL) {
        h.v.x = h.v.z = 0;
      }
      const w = this.waterAt(h.p.x, h.p.z);
      const g = this.raft.groundAt(h.p.x, h.p.z, h.p.y - this.bobY);
      if (g !== null && h.p.y < g + this.bobY && h.v.y < 0) {
        // caiu na jangada: volta
        this.dropHook();
        this.au.place(null);
      } else if (h.p.y <= w) {
        h.p.y = w;
        h.st = 'water';
        this.au.splash({ x: h.p.x, y: w, z: h.p.z }, 0.35);
        this.fx.burst(h.p.x, w + 0.05, h.p.z, 10, 'foam', '#ffffff', 1.6);
      }
    } else if (h.st === 'water') {
      h.p.y = this.waterAt(h.p.x, h.p.z) + 0.05;
      h.p.x += this.flow[0] * dt * 0.7;
      h.p.z += this.flow[1] * dt * 0.7;
      const hand = this.handWorld();
      const dx = hand.x - h.p.x;
      const dz = hand.z - h.p.z;
      const dist = Math.hypot(dx, dz);
      if (h.reel) {
        const sp = (this.sel === 'hook2' ? 10 : 7) * dt;
        h.p.x += (dx / dist) * Math.min(sp, dist);
        h.p.z += (dz / dist) * Math.min(sp, dist);
        h.tick -= dt;
        if (h.tick <= 0) {
          h.tick = 0.055;
          this.au.reel();
        }
        if (Math.random() < dt * 8 * this.fx.budget) this.fx.emit(h.p.x, h.p.y, h.p.z, (Math.random() - 0.5) * 0.4, 0.4, (Math.random() - 0.5) * 0.4, { life: 0.5, size: 0.06, grow: 0.1 });
      }
      // pega o que estiver perto
      for (const d of this.debris) {
        if (d.hooked || h.caught.length >= 4) continue;
        if (Math.hypot(d.x - h.p.x, d.z - h.p.z) < 1.0) {
          d.hooked = true;
          h.caught.push(d);
          this.act({ o: 'grab', id: d.id });
          this.au.splash({ x: d.x, y: h.p.y, z: d.z }, 0.25);
          tap('light');
        }
      }
      // o gancho também puxa baús boiando
      for (const c of this.dch)
        if (Math.hypot(c.x - h.p.x, c.z - h.p.z) < 1.3) {
          this.act({ o: 'dget', id: c.id });
          this.au.splash({ x: c.x, y: h.p.y, z: c.z }, 0.4);
          this.dropHook();
          return;
        }
      h.caught.forEach((d, i) => {
        d.x = h.p.x + Math.cos(i * 2.1) * 0.25;
        d.z = h.p.z + Math.sin(i * 2.1) * 0.25;
      });
      if (dist < 1.9 || (dist < 3 && this.groundAt(h.p.x, h.p.z, 5) !== null)) this.collectHook();
      if (dist > 45) this.dropHook();
    }
    // linha
    if (this.line.visible) {
      const a = this.handWorld();
      const pos = this.line.geometry.getAttribute('position') as THREE.BufferAttribute;
      const n = pos.count;
      const sag = h.st === 'water' && !h.reel ? 0.6 : 0.15;
      for (let i = 0; i < n; i++) {
        const k = i / (n - 1);
        pos.setXYZ(i, a.x + (h.p.x - a.x) * k, a.y + (h.p.y - a.y) * k - Math.sin(k * Math.PI) * sag * Math.min(3, a.distanceTo(h.p) * 0.12), a.z + (h.p.z - a.z) * k);
      }
      pos.needsUpdate = true;
      this.hookHead.position.copy(h.p);
      this.hookHead.rotation.set(0, this.time * 2, Math.PI);
    }
  }
  private collectHook(): void {
    const h = this.hook;
    let i = 0;
    for (const d of h.caught) {
      const loot = this.ghostLoot.get(d.id) ?? debrisLoot(d.k, Math.random);
      this.ghostLoot.delete(d.id);
      this.addItems(loot, true, i++);
      this.scene.remove(d.mesh);
      const j = this.debris.indexOf(d);
      if (j >= 0) this.debris.splice(j, 1);
      this.stats.hooked++;
      this.prog('hook', 1);
    }
    h.caught = [];
    h.st = 'idle';
    h.reel = false;
  }
  /** ganhou itens (pop + toast curto) */
  addItems(b: Bag, popSound = true, delayIdx = 0): void {
    bagAdd(this.inv, b);
    const keys = Object.keys(b) as ItemId[];
    for (const id of keys) {
      if (id === 'shell') this.coins(2 * (b[id] ?? 0));
      if (popSound && keys.length <= 4) setTimeout(() => this.au.pop(['wood', 'plastic', 'leaf', 'scrap', 'rope'].indexOf(id) + 1), delayIdx * 110);
      if (keys.length <= 4) notify(`+${b[id]} ${itemName(id)}`, { icon: 'gift', ms: 1400, key: 'jg+' + id });
    }
    // muitas coisas de uma vez (baú): um aviso só
    if (keys.length > 4) {
      if (popSound) this.au.pop(4);
      notify(t('jangada.gotMany', '+{n} coisas', { n: bagCount(b) }), { icon: 'gift', ms: 1800, key: 'jg+many' });
    }
    this.updateHot();
  }
  private coins(n: number): void {
    this.coinsDay += n;
    this.o.onCoins(n);
  }

  /* ------------------------------ martelo ------------------------------ */
  private hammerAct(): void {
    const a = this.aim;
    // consertar o que está estragado
    if (a?.k === 'piece' && this.buildSel !== 'trash') {
      const p = a.p;
      const max = PIECE[p.k].hp;
      if (p.hp < max * 0.98 && Math.hypot(p.x * CELL - this.me.x, p.z * CELL - this.me.z) < USE_R + 1) {
        const cost: Bag = p.k === 'found' ? { wood: 1, plastic: 1 } : { wood: 1 };
        if (!bagHas(this.inv, cost)) {
          this.au.nope();
          notify(t('jangada.needFix', 'Precisa de tábua (e plástico) para consertar'), { icon: 'warning', key: 'jgfix' });
          return;
        }
        bagAdd(this.inv, cost, -1);
        this.act({ o: 'fix', id: p.id });
        this.au.hammer({ x: p.x * CELL, y: DECK, z: p.z * CELL }, 3);
        this.swingT = 0.35;
        this.actCd = 0.5;
        this.fx.burst(p.x * CELL, DECK + this.bobY + 0.3, p.z * CELL, 8, 'spark', '#fff1a0', 1);
        this.updateHot();
        return;
      }
    }
    const k = this.buildSel;
    if (k === 'trash') {
      const p = this.trashT;
      if (!p) return this.au.nope();
      if (p.k === 'found' && (this.raft.tiles <= 1 || this.raft.objAt(p.x, p.z, 0) || this.raft.surfAt(p.x, p.z, 1))) {
        this.au.nope();
        return;
      }
      // devolve metade (o baú volta inteiro, com tudo o que tinha dentro: dá para montar de novo em outro lugar)
      const back: Bag = {};
      const keep = p.k === 'chest' ? 1 : 0.5;
      for (const [id, n] of Object.entries(PIECE[p.k].cost)) back[id as ItemId] = Math.ceil((n ?? 0) * keep);
      if (p.d?.bag) bagAdd(back, p.d.bag);
      this.addItems(back, true);
      this.act({ o: 'trash', id: p.id });
      this.au.hammer({ x: p.x * CELL, y: DECK, z: p.z * CELL }, 2);
      this.swingT = 0.35;
      this.actCd = 0.4;
      return;
    }
    if (!k) {
      this.buildSel = 'found';
      return;
    }
    const c = this.ghostCell;
    const def = PIECE[k];
    if (!c) {
      this.au.nope();
      return;
    }
    const why = this.raft.canPlace(k, c[0], c[1], c[2], this.raft.fireLv());
    if (why) {
      this.au.nope();
      const msg: Record<string, string> = {
        edge: t('jangada.why.edge', 'Pisos só na beirada da jangada'),
        occ: t('jangada.why.occ', 'Já tem coisa aqui'),
        nofloor: t('jangada.why.floor', 'Precisa de piso embaixo'),
        support: t('jangada.why.support', 'Ponha um pilar ou parede embaixo'),
        tier: t('jangada.why.tier', 'Precisa de fogueira maior'),
        low: t('jangada.why.low', 'Não cabe embaixo do andar de cima'),
        max: t('jangada.why.max', 'Longe demais'),
      };
      notify(msg[why] ?? '', { icon: 'warning', key: 'jgwhy', ms: 1600 });
      return;
    }
    if (!bagHas(this.inv, def.cost)) {
      this.au.nope();
      notify(t('jangada.needMat', 'Falta material! Pesque mais com o gancho.'), { icon: 'warning', key: 'jgneed', ms: 1600 });
      return;
    }
    bagAdd(this.inv, def.cost, -1);
    this.act({ o: 'build', k: PIECE[k].idx, x: c[0], z: c[1], lv: c[2], ro: this.buildRo });
    this.au.hammer({ x: c[0] * CELL, y: DECK, z: c[1] * CELL }, 2);
    setTimeout(() => this.au.place({ x: c[0] * CELL, y: DECK, z: c[1] * CELL }), 380);
    this.swingT = 0.35;
    this.actCd = 0.35;
    this.fx.burst(c[0] * CELL, DECK + this.bobY + c[2] * FLOOR_H + 0.1, c[1] * CELL, 10, 'poof', '#fff6dc', 1.2);
    tap('medium');
    if (k === 'found') this.prog('found', 1);
    this.prog('build', 1, k);
    this.updateHot();
  }

  /* ------------------------------ lança / machado ------------------------------ */
  private swing(id: ItemId): void {
    this.swingT = 0.4;
    this.actCd = id === 'axe' ? 0.55 : 0.5;
    this.au.swing();
    const a = this.aim;
    const dmg = WEAPON[id] ?? 0.5;
    if (a?.k === 'shark') {
      this.hitShark(a.s, dmg);
      return;
    }
    if (a?.k === 'ghost') {
      this.act({ o: 'ghost' });
      return;
    }
    if (a?.k === 'npc') {
      this.hitNpc(a.n, a.o, dmg);
      return;
    }
    if (a?.k === 'boss' && id !== 'axe') {
      this.hitBoss(a.b, a.h, dmg);
      return;
    }
    if (a?.k === 'node' && id === 'axe') {
      const n = a.n;
      if (axeNode(n.k)) {
        const isl = a.i;
        const stone = n.k === 'rock' || n.k === 'ore';
        this.au.chop({ x: n.x + isl.x, y: n.y + 1, z: n.z + isl.z }, stone);
        this.fx.burst(n.x + isl.x, n.y + 1, n.z + isl.z, 8, 'chunk', stone ? isl.def.rock : '#c08850', 1.5);
        isl.hit(n);
        this.act({ o: 'node', i: isl.id, id: n.id });
        return;
      }
    }
  }

  /* ------------------------------ pesca ------------------------------ */
  private rodAct(): void {
    const f = this.fish;
    if (f.st === 'idle') {
      const d = this.lookDir();
      f.p.copy(this.handWorld());
      f.v.set(d.x, 0, d.z).normalize().multiplyScalar(7);
      f.v.y = 4;
      f.st = 'cast';
      this.au.throwHook(0.4);
      this.swingT = 0.35;
    } else if (f.st === 'wait' || f.st === 'cast') this.endFish(false);
    else if (f.st === 'bite') {
      f.st = 'game';
      f.t = 4;
      f.needle = 0;
      f.nv = 1;
      const w = 0.22 - (f.big ? 0.06 : 0);
      const c = 0.2 + Math.random() * 0.6;
      f.zone = [Math.max(0, c - w / 2), Math.min(1, c + w / 2)];
      this.au.goodTap();
    } else if (f.st === 'game') {
      const ok = f.needle >= f.zone[0] - 0.02 && f.needle <= f.zone[1] + 0.02;
      this.endFish(ok);
    }
  }
  private endFish(caught: boolean): void {
    const f = this.fish;
    if (f.st === 'idle') return;
    if (caught) {
      const id: ItemId = f.big ? 'bigfish' : 'fish';
      this.addItems({ [id]: 1 });
      this.au.splash(null, 0.6);
      this.au.fanfare();
      this.hud.banner(id, t('jangada.gotFish', 'Pegou um peixe!'), '', 1.8);
      this.stats.fish++;
      this.prog('catch', 1);
    } else if (f.st === 'game' || f.st === 'bite') {
      this.au.miss();
      notify(t('jangada.fishGone', 'O peixe escapou!'), { icon: 'warning', key: 'jgfish', ms: 1400 });
    }
    f.st = 'idle';
    this.bobber.visible = false;
    this.hud.setFish(null);
  }
  private updateFish(dt: number): void {
    const f = this.fish;
    if (f.st === 'idle') return;
    if (this.sel !== 'rod') return this.endFish(false);
    this.bobber.visible = true;
    const w = this.waterAt(f.p.x, f.p.z);
    if (f.st === 'cast') {
      f.v.y -= 12 * dt;
      f.p.addScaledVector(f.v, dt);
      if (f.p.y <= w) {
        if (this.groundAt(f.p.x, f.p.z, f.p.y + 1) !== null) return this.endFish(false);
        f.st = 'wait';
        f.t = 2.5 + Math.random() * 5;
        this.au.splash({ x: f.p.x, y: w, z: f.p.z }, 0.2);
      }
    } else {
      f.p.y = w + (f.st === 'bite' ? -0.12 + Math.sin(this.time * 30) * 0.05 : Math.sin(this.time * 3) * 0.02);
      f.t -= dt;
      if (f.st === 'wait') {
        if (Math.random() < dt * 0.4) this.au.bobber();
        if (f.t <= 0) {
          f.st = 'bite';
          f.t = 1.4;
          f.big = Math.random() < 0.28;
          this.au.bobber();
          this.au.splash({ x: f.p.x, y: w, z: f.p.z }, 0.3);
          tap('medium');
        }
        this.hud.setFish({ txt: t('jangada.fishWait', 'Esperando o peixe…') });
      } else if (f.st === 'bite') {
        this.hud.setFish({ txt: t('jangada.fishNow', 'AGORA! Toque!') });
        if (f.t <= 0) {
          this.endFish(false);
          return;
        }
      } else if (f.st === 'game') {
        f.needle += f.nv * dt * (f.big ? 1.25 : 0.9);
        if (f.needle > 1) {
          f.needle = 1;
          f.nv = -1;
        }
        if (f.needle < 0) {
          f.needle = 0;
          f.nv = 1;
        }
        this.hud.setFish({ txt: t('jangada.fishTap', 'Toque no verde!'), zone: f.zone, needle: f.needle });
        if (f.t <= 0) return this.endFish(false);
      }
    }
    this.bobber.position.copy(f.p);
    // linha da vara
    const a = this.handWorld();
    a.y += 0.6;
    const pos = this.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    this.line.visible = true;
    for (let i = 0; i < pos.count; i++) {
      const k = i / (pos.count - 1);
      pos.setXYZ(i, a.x + (f.p.x - a.x) * k, a.y + (f.p.y - a.y) * k - Math.sin(k * Math.PI) * 0.4, a.z + (f.p.z - a.z) * k);
    }
    pos.needsUpdate = true;
  }

  /* ------------------------------ usar (mão) ------------------------------ */
  /** o que o botão USAR faria agora: [ícone, rótulo] ou null */
  private useWhat(): [string, string] | null {
    const a = this.aim;
    if (!a) return null;
    if (a.k === 'node') {
      const n = a.n;
      if (n.k === 'bush') return [a.i.def.fruit, t('jangada.u.pick', 'Colher')];
      if (n.k === 'chest') return [n.r ? 'chestR' : 'chest', t('jangada.u.open', 'Abrir')];
      if (underwaterNode(n.k)) return [n.k === 'pearl' ? 'pearl' : n.k, t('jangada.u.grab', 'Pegar')];
      return this.sel === 'axe' ? null : ['axe', t('jangada.u.needAxe', 'Machado!')];
    }
    if (a.k === 'boat') {
      const b = a.b;
      if (b.flip) return ['up', t('jangada.u.flip', 'Desvirar')];
      if (b.def.fuel && b.fuel < FUEL_SEC * 2 && (this.inv.fuel ?? 0) > 0) return ['fuel', t('jangada.u.refuel', 'Abastecer')];
      return [b.def.icon, t('jangada.u.board', 'Entrar')];
    }
    if (a.k === 'dchest') return ['beacon', t('jangada.u.take', 'Pegar')];
    if (a.k === 'npc') return a.o.friendly && a.n.chief ? ['hand', t('jangada.u.trade', 'Trocar')] : null;
    if (a.k !== 'piece') return null;
    const p = a.p;
    const d = p.d ?? {};
    if (Math.hypot(p.x * CELL - this.me.x, p.z * CELL - this.me.z) > USE_R + 0.6) return null;
    switch (p.k) {
      case 'fire': {
        if (d.done?.length) return [d.done[0], t('jangada.u.take', 'Pegar')];
        const raw = (Object.keys(COOK) as ItemId[]).find((r) => (this.inv[r] ?? 0) > 0);
        if (raw && (d.fuel ?? 0) > 0 && (d.cook?.length ?? 0) < (d.lv ?? 1)) return [raw, t('jangada.u.cook', 'Assar')];
        const fuel = (Object.keys(FUEL) as ItemId[]).find((r) => (this.inv[r] ?? 0) > 0);
        if (fuel && (d.fuel ?? 0) < 200) return [fuel, t('jangada.u.fuel', 'Lenha')];
        return null;
      }
      case 'purifier': {
        if ((d.w ?? 0) > 0) return ['water', t('jangada.u.water', 'Água')];
        const fuel = (Object.keys(FUEL) as ItemId[]).find((r) => (this.inv[r] ?? 0) > 0);
        if (fuel && (d.fuel ?? 0) < 120) return [fuel, t('jangada.u.fuel', 'Lenha')];
        return null;
      }
      case 'planter':
        if ((d.g ?? -1) >= 1) return ['potato', t('jangada.u.harvest', 'Colher')];
        if ((d.g ?? -1) < 0 && (this.inv.seed ?? 0) > 0) return ['seed', t('jangada.u.plant', 'Plantar')];
        return null;
      case 'chest':
        return ['chest', t('jangada.u.open', 'Abrir')];
      case 'bed':
        return ['sleep', t('jangada.u.sleep', 'Dormir')];
      case 'sail':
        return ['sail', d.on ? t('jangada.u.close', 'Fechar') : t('jangada.u.sail', 'Abrir')];
      case 'anchor':
        return ['anchor', d.on ? t('jangada.u.up', 'Subir') : t('jangada.u.drop', 'Baixar')];
      case 'lamp':
        return ['lamp', d.on === false ? t('jangada.u.on', 'Acender') : t('jangada.u.off', 'Apagar')];
      case 'net':
        return Object.keys(d.bag ?? {}).length ? ['net', t('jangada.u.take', 'Pegar')] : null;
    }
    return null;
  }
  onUse(): void {
    if (this.paused || this.hud.overlay) return;
    const a = this.aim;
    const w = this.useWhat();
    if (!a || !w) return;
    if (a.k === 'node') {
      if (a.n.k === 'bush' || a.n.k === 'chest' || underwaterNode(a.n.k)) {
        if (a.n.k === 'chest' && a.n.guarded && a.i.def.owner !== 'none') {
          // abrir o baú guardado com guarda olhando = bonk
          const ow = this.owners.get(a.i.id);
          if (ow?.danger) {
            this.au.nope();
            notify(t('jangada.guarded', 'Os guardas estão de olho! Distraia, esgueire ou derrote.'), { icon: 'warning', key: 'jgguard' });
            return;
          }
        }
        if (a.n.k === 'chest') this.au.chestOpen(a.n.r ?? 0);
        this.act({ o: 'node', i: a.i.id, id: a.n.id });
      } else this.au.nope();
      return;
    }
    if (a.k === 'boat') return this.useBoat(a.b);
    if (a.k === 'dchest') {
      this.act({ o: 'dget', id: a.c.id });
      return;
    }
    if (a.k === 'npc') {
      if (a.o.friendly && a.n.chief) this.openTrade(a.o);
      return;
    }
    if (a.k !== 'piece') return;
    const p = a.p;
    const d = p.d ?? {};
    const pos = { x: p.x * CELL, y: DECK + p.lv * FLOOR_H, z: p.z * CELL };
    switch (p.k) {
      case 'fire': {
        if (d.done?.length) {
          this.act({ o: 'use', id: p.id, a: 'take' });
          return;
        }
        const raw = (Object.keys(COOK) as ItemId[]).find((r) => (this.inv[r] ?? 0) > 0);
        if (raw && (d.fuel ?? 0) > 0 && (d.cook?.length ?? 0) < (d.lv ?? 1)) {
          bagAdd(this.inv, { [raw]: 1 }, -1);
          this.act({ o: 'use', id: p.id, a: 'cook', it: raw });
          this.au.sizzle(pos, 1.5);
          this.updateHot();
          return;
        }
        const fuel = (Object.keys(FUEL) as ItemId[]).find((r) => (this.inv[r] ?? 0) > 0);
        if (fuel) {
          bagAdd(this.inv, { [fuel]: 1 }, -1);
          this.act({ o: 'use', id: p.id, a: 'fuel', it: fuel });
          this.au.whoosh(pos);
          this.fx.burst(pos.x, pos.y + this.bobY + 0.4, pos.z, 10, 'flame', '#ffb040', 1);
          this.updateHot();
        }
        return;
      }
      case 'purifier': {
        if ((d.w ?? 0) > 0) {
          this.act({ o: 'use', id: p.id, a: 'water' });
          return;
        }
        const fuel = (Object.keys(FUEL) as ItemId[]).find((r) => (this.inv[r] ?? 0) > 0);
        if (fuel) {
          bagAdd(this.inv, { [fuel]: 1 }, -1);
          this.act({ o: 'use', id: p.id, a: 'fuel', it: fuel });
          this.au.whoosh(pos);
          this.updateHot();
        }
        return;
      }
      case 'planter':
        if ((d.g ?? -1) >= 1) this.act({ o: 'use', id: p.id, a: 'harvest' });
        else if ((this.inv.seed ?? 0) > 0) {
          bagAdd(this.inv, { seed: 1 }, -1);
          this.act({ o: 'use', id: p.id, a: 'plant' });
          this.au.sparkle();
          this.updateHot();
        }
        return;
      case 'chest':
        return this.openChest(p);
      case 'bed':
        this.bed = [p.x * CELL, p.z * CELL];
        if (this.isNightNow()) this.sleep();
        else notify(t('jangada.bedSet', 'Cama marcada! Você acorda aqui. Durma à noite.'), { icon: 'bed', key: 'jgbed' });
        return;
      case 'sail':
        this.act({ o: 'use', id: p.id, a: 'sail', yaw: Math.round(this.me.yaw * 100) / 100 });
        this.au.flap(pos);
        if (!d.on) notify(t('jangada.sailOn2', 'Vela aberta: chegam mais coisas boiando!'), { icon: 'sparkle', key: 'jgsail' });
        return;
      case 'anchor':
        this.act({ o: 'use', id: p.id, a: 'anchor' });
        this.au.chain(pos, !d.on);
        return;
      case 'lamp':
        this.act({ o: 'use', id: p.id, a: 'lamp' });
        this.au.ui1();
        return;
      case 'net':
        this.act({ o: 'use', id: p.id, a: 'net' });
        return;
    }
  }

  /* ------------------------------ baú ------------------------------ */
  private openChest(p: RPiece): void {
    this.setPaused(!this.net);
    this.ctl.show(false);
    const pos = { x: p.x * CELL, y: DECK + this.bobY + 0.5, z: p.z * CELL };
    this.rv.openChest = p.id;
    this.au.raftCreak(pos);
    let redraw: () => void = () => {};
    const close = () => {
      this.hud.closePanel();
      this.setPaused(false);
      this.chestRedraw = null;
      this.rv.openChest = -1;
      this.au.raftCreak(pos);
    };
    // o último gancho fica com você (sem ele não dá para pescar nada)
    const lastHook = (id: ItemId) => (id === 'hook' || id === 'hook2') && (this.inv.hook ?? 0) + (this.inv.hook2 ?? 0) <= 1;
    redraw = this.hud.openChest({
      mine: () => this.inv,
      chest: () => this.raft.get(p.id)?.d?.bag ?? {},
      move: (id, toChest, one) => {
        if (toChest && lastHook(id)) {
          this.au.nope();
          notify(t('jangada.keepHook', 'Fique com um gancho na mão!'), { icon: 'warning', key: 'jgkeep' });
          return;
        }
        const have = toChest ? (this.inv[id] ?? 0) : (this.raft.get(p.id)?.d?.bag?.[id] ?? 0);
        const n = one ? Math.min(1, have) : have;
        if (n <= 0) return;
        if (toChest) bagAdd(this.inv, { [id]: n }, -1);
        this.act({ o: 'chest', id: p.id, it: id, n, put: toChest });
        this.au.pop(2);
        this.updateHot();
      },
      all: (toChest) => {
        const src = toChest ? this.inv : (this.raft.get(p.id)?.d?.bag ?? {});
        for (const [k, n] of Object.entries(src)) {
          const id = k as ItemId;
          // "Guardar tudo" não leva as ferramentas (continuam na mão)
          if (!n || (toChest && ITEM[id].kind === 'tool')) continue;
          if (toChest) bagAdd(this.inv, { [id]: n }, -1);
          this.act({ o: 'chest', id: p.id, it: id, n, put: toChest });
        }
        this.au.pop(3);
        this.updateHot();
      },
      close,
    });
    this.chestRedraw = redraw;
  }
  private chestRedraw: (() => void) | null = null;

  /* ------------------------------ oficina ------------------------------ */
  openCraft(): void {
    if (this.hud.overlay) return;
    this.au.ui1();
    this.setPaused(!this.net);
    this.ctl.show(false);
    this.hud.openCraft({
      have: () => this.inv,
      fireLv: () => this.raft.fireLv(),
      hasFire: () => this.raft.count('fire') > 0,
      craft: (r: Recipe) => this.craft(r),
      boat: (k) => this.buildBoat(k),
      build: (k) => {
        this.hud.closePanel();
        this.setPaused(false);
        if ((this.inv.hammer ?? 0) <= 0) {
          notify(t('jangada.needHammer', 'Faça um martelo primeiro!'), { icon: 'warning' });
          return;
        }
        this.setHeld('hammer');
        this.buildSel = k;
        this.updateHot();
      },
      upFire: () => this.upgradeFire(),
      close: () => {
        this.hud.closePanel();
        this.setPaused(false);
      },
    });
  }
  private craft(r: Recipe): boolean {
    if ((r.fire ?? 0) > this.raft.fireLv() || !bagHas(this.inv, r.cost)) {
      this.au.nope();
      return false;
    }
    bagAdd(this.inv, r.cost, -1);
    this.inv[r.out] = (this.inv[r.out] ?? 0) + r.n;
    this.au.chime();
    this.au.hammer(null, 1);
    tap('light');
    this.prog('craft', r.n, r.out);
    if (ITEM[r.out].kind === 'tool') this.setHeld(r.out);
    this.updateHot();
    notify(t('jangada.made', 'Feito: {n}!', { n: itemName(r.out) }), { icon: 'check', kind: 'good', ms: 1400, key: 'jgmade' });
    return true;
  }
  private upgradeFire(): boolean {
    const f = this.raft.pieces.filter((p) => p.k === 'fire').sort((a, b) => (a.d?.lv ?? 1) - (b.d?.lv ?? 1))[0];
    if (!f) return false;
    const lv = (f.d?.lv ?? 1) + 1;
    const cost = FIRE_UP[lv];
    if (!cost || lv > FIRE_MAX || !bagHas(this.inv, cost)) {
      this.au.nope();
      return false;
    }
    bagAdd(this.inv, cost, -1);
    this.act({ o: 'use', id: f.id, a: 'up' });
    this.au.fanfare();
    this.hud.banner('fire', t('jangada.fireLv', 'Nível da Fogueira {n}/{m}', { n: lv, m: FIRE_MAX }), t('jangada.fireUp', 'Novas receitas!'), 2.4);
    this.prog('fireLv', lv);
    this.updateHot();
    return true;
  }

  /* ============================== ações (anfitrião aplica) ============================== */
  /** pede ao anfitrião (ou aplica direto quando sou o anfitrião) */
  private act(op: Record<string, unknown>): void {
    if (this.isHost) this.apply(op, this.net?.me.id ?? 'me');
    else this.net!.send({ t: 'act', ...op });
  }
  /** aplica uma ação (só o anfitrião) */
  private apply(op: Record<string, unknown>, from: string): void {
    const me = from === (this.net?.me.id ?? 'me');
    const give = (b: Bag) => {
      if (!Object.keys(b).length) return;
      if (me) this.addItems(b);
      else this.net?.send({ t: 'give', b }, from);
    };
    const o = String(op.o);
    if (o === 'grab') {
      const id = Number(op.id);
      if (me) {
        if (this.net) this.net.send({ t: 'dDel', ids: [id] });
      } else this.removeDebris([id], true);
      return;
    }
    if (o === 'build') {
      const def = PIECE[Object.keys(PIECE).find((k) => PIECE[k as PK].idx === Number(op.k)) as PK];
      if (!def) return;
      const x = Number(op.x) | 0;
      const z = Number(op.z) | 0;
      const lv = Number(op.lv) ? 1 : 0;
      if (this.raft.canPlace(def.id, x, z, lv, this.raft.fireLv())) return give(def.cost);
      this.raft.place(def.id, x, z, lv, Number(op.ro) | 0);
      if (!me) this.sendFx('place', x * CELL, DECK + lv * FLOOR_H, z * CELL);
      return;
    }
    if (o === 'fix') {
      this.raft.repair(Number(op.id));
      if (!me) this.sendFx('hammer', 0, 0, 0);
      return;
    }
    if (o === 'trash') {
      this.raft.remove(Number(op.id));
      return;
    }
    if (o === 'shark') {
      const sh = [this.shark, ...this.sharks2][Number(op.s) | 0] ?? this.shark;
      const fled = sh.hit(Number(op.dmg) || 1);
      if (!me) this.sendFx('sharkHurt', sh.x, sh.y, sh.z);
      if (fled) {
        this.sendFx('sharkFlee', 0, 0, 0, 0, from);
      }
      return;
    }
    if (o === 'ghost') {
      const had = this.ghost.scare(this.me.x, this.me.z);
      if (this.ghost.st === 'scared') {
        this.sendFx('scared', this.ghost.x, this.ghost.y, this.ghost.z, 0, from);
        if (had && Object.keys(this.stolen).length) {
          // o saco cai na água: vira um barril para pescar de volta
          const [cx, cz] = this.raft.center();
          const d = this.addDebris(debId++, 'barrel', this.ghost.x + (this.ghost.x - cx) * 0.2, this.ghost.z + (this.ghost.z - cz) * 0.2, this.flow[0] * 0.3, this.flow[1] * 0.3);
          this.ghostLoot.set(d.id, this.stolen);
          this.stolen = {};
          if (this.net) this.net.send({ t: 'dAdd', l: [[d.id, DEBRIS.indexOf('barrel'), r1(d.x), r1(d.z), r2(d.vx), r2(d.vz)]] });
        }
      }
      return;
    }
    if (o === 'node') {
      const isl = this.ensureIsle(Number(op.i));
      const n = isl?.nodes.find((q) => q.id === Number(op.id));
      if (!isl || !n || !n.alive) return;
      n.hp -= 1;
      if (n.hp > 0) {
        if (!me) this.net?.send({ t: 'fx', k: 'nodehit', i: isl.id, id: n.id });
        return;
      }
      isl.kill(n);
      (this.isleSt[isl.id] ??= { d: [] }).d.push(n.id);
      if (n.k === 'palm' || n.k === 'tree') this.sendFx('timber', n.x + isl.x, n.y, n.z + isl.z);
      if (this.net) this.net.send({ t: 'node', i: isl.id, id: n.id });
      const L = nodeLoot(n, isl.biome, Math.random);
      give(L.bag);
      if (n.k === 'chest') this.sendFx('chest', n.x + isl.x, n.y, n.z + isl.z, (n.r ?? 0) * 1000 + L.coins, from);
      if (underwaterNode(n.k)) this.sendFx('divegrab', 0, 0, 0, 0, from);
      return;
    }
    if (this.applyV2(o, op, from, me, give)) return;
    const p = this.raft.get(Number(op.id));
    if (!p) return;
    const d = (p.d ??= {});
    if (o === 'chest') {
      const bag = pieceBag(p);
      const it = String(op.it) as ItemId;
      const n = Math.max(0, Number(op.n) | 0);
      if (!ITEM[it]) return;
      if (op.put) bagAdd(bag, { [it]: n });
      else {
        const m = Math.min(n, bag[it] ?? 0);
        if (m > 0) {
          bagAdd(bag, { [it]: m }, -1);
          give({ [it]: m });
        }
      }
      this.raft.ver++;
      this.chestRedraw?.();
      return;
    }
    if (o !== 'use') return;
    const a = String(op.a);
    const pos = { x: p.x * CELL, y: DECK, z: p.z * CELL };
    switch (a) {
      case 'fuel': {
        const it = String(op.it) as ItemId;
        d.fuel = (d.fuel ?? 0) + (FUEL[it] ?? 20);
        if (!me) this.sendFx('whoosh', pos.x, pos.y, pos.z);
        break;
      }
      case 'cook': {
        const it = String(op.it) as ItemId;
        if (!COOK[it]) break;
        (d.cook ??= []).push([it, 12]);
        break;
      }
      case 'take':
        if (d.done?.length) {
          const b: Bag = {};
          for (const it of d.done) bagAdd(b, { [it]: 1 });
          d.done = [];
          give(b);
          this.sendFx('cooked', 0, 0, 0, Object.values(b).reduce((x, v) => x + (v ?? 0), 0), from);
        }
        break;
      case 'water':
        if ((d.w ?? 0) > 0) {
          give({ water: d.w ?? 0 });
          d.w = 0;
        }
        break;
      case 'plant':
        d.g = 0;
        break;
      case 'harvest':
        if ((d.g ?? -1) >= 1) {
          d.g = -1;
          give({ potato: 2 + (Math.random() < 0.5 ? 1 : 0), ...(Math.random() < 0.6 ? { seed: 1 } : {}) });
          this.sendFx('harvest', 0, 0, 0, 0, from);
        }
        break;
      case 'sail':
        d.on = !d.on;
        d.yaw = Number(op.yaw) || 0;
        if (!me) this.sendFx('flap', pos.x, pos.y, pos.z);
        break;
      case 'anchor':
        d.on = !d.on;
        if (!me) this.sendFx('chain', pos.x, pos.y, pos.z, d.on ? 1 : 0);
        break;
      case 'lamp':
        d.on = d.on === false;
        break;
      case 'net':
        give(d.bag ?? {});
        d.bag = {};
        break;
      case 'up': {
        const lv = (d.lv ?? 1) + 1;
        if (lv <= FIRE_MAX) d.lv = lv;
        break;
      }
    }
    this.raft.ver++;
  }
  private ghostLoot = new Map<number, Bag>();

  /** sons/efeitos: toca aqui e manda para os outros (anfitrião) */
  private sendFx(k: string, x = 0, y = 0, z = 0, v = 0, by = ''): void {
    this.playFx(k, x, y, z, v, by);
    if (this.net && this.isHost) this.net.send({ t: 'fx', k, x: r1(x), y: r1(y), z: r1(z), v, by });
  }
  private playFx(k: string, x: number, y: number, z: number, v: number, by: string): void {
    const p = { x, y: y + this.bobY, z };
    const mine = by && by === (this.net?.me.id ?? 'me');
    switch (k) {
      case 'bite':
        this.au.bite(p);
        this.fx.burst(x, p.y, z, 8, 'chunk', '#c08850', 2);
        this.fx.burst(x, p.y - 0.3, z, 10, 'foam', '#ffffff', 2);
        this.camShake = Math.max(this.camShake, this.me.swim ? 0 : 0.35);
        break;
      case 'crack':
        this.au.crack(p);
        this.fx.burst(x, p.y, z, 18, 'chunk', '#c08850', 3);
        this.camShake = 0.6;
        break;
      case 'warn':
        this.au.sharkWarn();
        this.hud.banner('shark', t('jangada.sharkComing', 'O Mordelão está vindo!'), t('jangada.sharkTip', 'Pegue a lança e defenda a jangada'), 2.4);
        break;
      case 'fin':
        this.au.fin(p);
        break;
      case 'sharkHurt':
        this.au.sharkHurt(p);
        break;
      case 'sharkFlee':
        this.au.mission();
        notify(t('jangada.sharkGone', 'O Mordelão fugiu emburrado!'), { icon: 'star', kind: 'good', key: 'jgshark' });
        if (mine) {
          this.stats.sharks++;
          this.prog('shark', 1);
        }
        break;
      case 'boo':
        this.au.boo(p);
        notify(t('jangada.ghostHere', 'Buuu! O Capitão Bu chegou!'), { icon: 'warning', key: 'jgboo' });
        break;
      case 'giggle':
        this.au.giggle(p);
        break;
      case 'scared':
        this.au.ghostScared(p);
        this.fx.burst(x, p.y, z, 14, 'spark', '#bfffe8', 2);
        notify(t('jangada.ghostGone', 'Capitão Bu fugiu: uiii!'), { icon: 'star', kind: 'good', key: 'jgboo' });
        if (mine) {
          this.stats.ghosts++;
          this.prog('ghost', 1);
        }
        break;
      case 'poof':
        this.fx.burst(x, p.y, z, 10, 'poof', '#8a8a9a', 1);
        break;
      case 'dawn':
        if (!this.isHost) this.day = v;
        this.onNewDay(v || this.day);
        break;
      case 'dusk':
        this.au.dusk();
        this.hud.banner('moon', t('jangada.night', 'Anoiteceu'), t('jangada.nightTip', 'Fique perto da luz…'), 2.2);
        break;
      case 'isl':
        this.au.jingleIsland();
        this.hud.banner('island', t('jangada.islandSeen', 'Ilha à vista!'), t('jangada.islandTip', 'Baixe a âncora quando chegar perto'), 3);
        break;
      case 'splash':
        this.au.splash(p, v || 0.4);
        break;
      case 'ding':
        this.au.pop(4);
        break;
      case 'sizzle':
        this.au.sizzle(p);
        break;
      case 'boil':
        this.au.boil(p);
        break;
      case 'grown':
        this.au.sparkle();
        break;
      case 'whoosh':
        this.au.whoosh(p);
        break;
      case 'flap':
        this.au.flap(p);
        break;
      case 'chain':
        this.au.chain(p, !!v);
        break;
      case 'place':
        this.au.place(p);
        break;
      case 'hammer':
        this.au.hammer(p, 2);
        break;
      case 'timber':
        this.au.timber(p);
        break;
      case 'thunder':
        this.lightning = 1;
        this.au.thunder(v);
        break;
      case 'cooked':
        if (mine) {
          this.stats.cooked += v;
          this.prog('cook', v);
        }
        break;
      case 'harvest':
        this.au.sparkle();
        if (mine) this.prog('harvest', 1);
        break;
      case 'divegrab':
        if (mine) this.prog('dive', 1);
        break;
      default:
        this.playFxV2(k, x, y, z, v, mine);
    }
  }

  /* ============================== missões ============================== */
  private hasDailyOrMain(): boolean {
    return this.mis < MISSIONS.length || this.daily.length > 0;
  }
  private rollDaily(): void {
    this.dailyDay = this.day;
    const pool = DAILY.map((_, i) => i).sort(() => Math.random() - 0.5);
    this.daily = pool.slice(0, 3).map((i) => [i, 0]);
  }
  /** progresso de missão (principal + do dia) */
  prog(k: string, n: number, a?: string): void {
    const tryM = (m: Mission, cur: number): number => {
      if (m.k !== k) return cur;
      if (m.a && m.a !== a) return cur;
      if (k === 'fireLv' || k === 'boat' || k === 'tier' || k === 'disc') return Math.max(cur, n);
      return cur + n;
    };
    if (this.mis < MISSIONS.length) {
      const m = MISSIONS[this.mis];
      let cur = tryM(m, this.misN);
      if (m.k === 'tiles') cur = this.raft.tiles;
      if (m.k === 'up') cur = this.raft.count('floor');
      if (m.k === 'fireLv') cur = Math.max(cur, this.raft.fireLv());
      if (m.k === 'disc') cur = Math.max(cur, this.knownCount());
      if (m.k === 'boat') cur = Math.max(cur, ...this.boats.map((b) => b.k + 1), 0);
      this.misN = Math.min(m.n, cur);
      if (this.misN >= m.n) this.completeMission(m);
    }
    if (this.mis >= MISSIONS.length || this.day >= 2) {
      for (const dl of this.daily) {
        const m = DAILY[dl[0]];
        if (dl[1] >= m.n) continue;
        dl[1] = Math.min(m.n, tryM(m, dl[1]));
        if (dl[1] >= m.n) {
          this.coins(m.coins);
          this.au.mission();
          notify(t('jangada.dailyDone', 'Missão do dia: +{c} moedas!', { c: m.coins }), { icon: 'coin', kind: 'good' });
        }
      }
    }
  }
  private completeMission(m: Mission): void {
    this.coins(m.coins);
    this.au.mission();
    this.hud.banner('star', t('jangada.misDone', 'Missão cumprida!'), `${m.txt()} · +${m.coins}`, 2.4);
    this.mis++;
    this.misN = 0;
    // a próxima já pode estar feita (ex.: jangada grande)
    if (this.mis < MISSIONS.length) setTimeout(() => this.prog('_', 0), 2600);
  }
  private misViews(): MisView[] {
    const out: MisView[] = [];
    if (this.mis < MISSIONS.length) {
      const m = MISSIONS[this.mis];
      out.push({ icon: m.icon, txt: m.txt(), n: m.k === 'tiles' ? Math.min(m.n, this.raft.tiles) : this.misN, of: m.n });
    }
    if (this.mis >= MISSIONS.length || this.day >= 2)
      for (const [i, n] of this.daily) {
        const m = DAILY[i];
        out.push({ icon: m.icon, txt: m.txt(), n, of: m.n, daily: true });
      }
    return out;
  }

  /* ============================== câmera ============================== */
  cycleCam(): void {
    this.camMode = (this.camMode + 1) % 3;
    this.au.ui1();
    this.o.onCam(this.camMode);
    notify([t('jangada.cam0', '1ª pessoa'), t('jangada.cam1', '3ª pessoa (atrás)'), t('jangada.cam2', '3ª pessoa (de frente)')][this.camMode], { icon: 'camera', ms: 1100, key: 'jgcam' });
  }
  private camLbl(): string {
    return ['1ª', '3ª', '3ª ↺'][this.camMode];
  }
  private placeCamera(dt: number): void {
    const m = this.me;
    const cam = this.cam;
    const fpc = this.fpc;
    const onRaft = !m.swim && !m.onIsl;
    let roll = 0;
    if (onRaft) roll += this.tiltZ * 0.6;
    if (m.swim) roll += Math.sin(this.time * 1.4) * 0.03;
    if (this.camShake > 0) {
      fpc.addShake(this.camShake);
      this.camShake = 0;
    }
    fpc.yaw = m.yaw;
    fpc.pitch = m.pitch;
    fpc.extraRoll = roll;
    fpc.extraPitch = onRaft ? this.tiltX * 0.4 : 0;
    // o kit cuida do balanço (cabeça/rolagem), tremor e tranco
    fpc.apply(cam, dt, { x: m.x, z: m.z, y: m.y, speedK: m.speedK * (m.swim ? 0.3 : 1), grounded: m.grounded || m.swim });
    if (this.camMode === 0) {
      /* pronto */
    } else {
      const back = this.camMode === 1;
      const dist = back ? 3.4 : 2.7;
      const pitch = back ? Math.max(-1.2, Math.min(0.9, m.pitch)) : Math.max(-0.6, Math.min(0.5, -m.pitch * 0.6));
      const yaw = back ? m.yaw : m.yaw + Math.PI;
      const dir = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      const tgt = new THREE.Vector3(m.x, m.y + 1.2, m.z);
      // encolhe se bater em parede
      let dd = dist;
      for (let s = 0.4; s <= dist; s += 0.2) {
        const p = tgt.clone().addScaledVector(dir, -s);
        if (this.camHit(p)) {
          dd = Math.max(0.6, s - 0.3);
          break;
        }
      }
      const p = tgt.clone().addScaledVector(dir, -dd);
      p.y = Math.max(p.y, this.waterAt(p.x, p.z) + 0.25);
      cam.position.copy(p);
      cam.position.y += 0.35;
      cam.lookAt(tgt.x, tgt.y + 0.2, tgt.z);
      cam.rotation.z += roll * 0.5;

    }
    cam.updateMatrixWorld();
  }
  private camHit(p: THREE.Vector3): boolean {
    const by = this.bobY;
    for (const b of this.raft.boxes()) if (p.x > b.x0 - 0.15 && p.x < b.x1 + 0.15 && p.z > b.z0 - 0.15 && p.z < b.z1 + 0.15 && p.y > b.y0 + by && p.y < b.y1 + by) return true;
    const c = this.raft.surfAt(cellOf(p.x), cellOf(p.z), 1);
    if (c && Math.abs(p.y - (DECK + FLOOR_H + by)) < 0.25) return true;
    return false;
  }

  /* ============================== render ============================== */
  private render(): void {
    const dt = 1 / 60;
    // jangada balança
    const [cx, cz] = this.raft.center();
    const b = this.raft.bounds();
    const w0 = this.waterAt(cx, cz);
    const wx = this.waterAt(b[2], cz) - this.waterAt(b[0], cz);
    const wz = this.waterAt(cx, b[3]) - this.waterAt(cx, b[1]);
    const size = Math.max(1, Math.sqrt(this.raft.tiles));
    const damp = (this.anchored ? 0.35 : 0.55) / Math.sqrt(size);
    this.bobY += (w0 * damp - this.bobY) * 0.15;
    this.tiltZ += (-(wx / Math.max(2, b[2] - b[0])) * 0.5 - this.tiltZ) * 0.1;
    this.tiltX += ((wz / Math.max(2, b[3] - b[1])) * 0.5 - this.tiltX) * 0.1;
    this.raftG.position.y = this.bobY;
    this.raftG.rotation.set(this.tiltX * 0.5, 0, this.tiltZ * 0.5);
    this.placeCamera(dt);
    this.bossCamera();
    if (this.photo) {
      // modo foto (testes): câmera livre
      const [x, y, z, lx, ly, lz] = this.photo;
      this.cam.position.set(x, y, z);
      this.cam.lookAt(lx, ly, lz);
      this.cam.updateMatrixWorld();
    }
    // céu/luz
    this.sc = skyAt(this.tod, this.storm, this.sc);
    const c = this.sc;
    const flash = this.lightning;
    if (this.lightning > 0) this.lightning = Math.max(0, this.lightning - 0.08);
    // caverna: escuro (só a lanterna e os cristais iluminam)
    const inCave = !!this.isl?.inCave(this.cam.position.x, this.cam.position.z) && !this.me.swim;
    this.caveK += ((inCave ? 1 : 0) - this.caveK) * 0.08;
    const dark = 1 - this.caveK * 0.95;
    this.hemi.color.copy(c.amb);
    this.hemi.groundColor.set(c.night > 0.5 ? '#0a1a3a' : '#2a6a8a');
    this.hemi.intensity = (c.ambI + flash * 2) * dark;
    const ld = c.night > 0.5 ? c.moon : c.dir;
    this.sun.position.set(ld.x * 40 + this.me.x, Math.max(4, ld.y * 40), ld.z * 40 + this.me.z);
    this.sun.target.position.set(this.me.x, 0, this.me.z);
    this.sun.color.copy(c.sun);
    this.sun.intensity = (c.night > 0.5 ? 0.35 : c.sunI) * (1 - this.caveK * 0.99);
    const wCam = this.waterAt(this.cam.position.x, this.cam.position.z);
    const under = this.cam.position.y < wCam;
    const fog = this.scene.fog as THREE.FogExp2;
    const uwFog = this.uwCol.copy(c.shallow).lerp(c.deep, 0.55).multiplyScalar(0.62 + c.sunI * 0.12);
    if (under) {
      // mais escuro quanto mais fundo
      const depth = Math.max(0, wCam - this.cam.position.y);
      fog.color.copy(uwFog).multiplyScalar(Math.max(0.35, 1 - depth * 0.04));
      fog.density = 0.055 + depth * 0.002;
    } else if (this.caveK > 0.02) {
      fog.color.copy(c.fog).lerp(this.uwCol.set('#0a0a14'), this.caveK);
      fog.density = 0.0045 + this.caveK * 0.06;
    } else {
      fog.color.copy(c.fog);
      fog.density = 0.0036 + this.storm * 0.011 + c.night * 0.002;
    }
    this.renderer.setClearColor(fog.color);
    // debaixo d'água: o lado de baixo da superfície usa a MESMA cor/densidade da neblina (sem faixa clara no horizonte)
    this.ocean.update(this.cam, this.time, this.amp, this.off[0], this.off[1], c, fog.density, this.storm, under ? this.uwFogS.copy(fog.color).convertLinearToSRGB() : uwFog);
    const ou = this.ocean.mat.uniforms;
    ou.uRaft.value.set(b[0], b[1], b[2], b[3]);
    this.ocean.setIsles([...this.isles.values()].sort((p, q) => Math.hypot(p.x - this.cam.position.x, p.z - this.cam.position.z) - Math.hypot(q.x - this.cam.position.x, q.z - this.cam.position.z)).map((i) => i.shapeU()));
    const wake: [number, number, number, number][] = [];
    for (const bt of this.boats) wake.push(...bt.wake.slice(0, 3));
    for (const bs of this.bosses) if (bs.fighting && bs.kind === 'mega' && bs.y > this.waterAt(bs.x, bs.z) - 2) wake.push([bs.x, bs.z, 4, 0.9]);
    this.ocean.setWake(wake.slice(0, 8));
    this.seabed.update(this.cam.position.x, this.cam.position.z);
    SEABED_U.uCTime.value = this.time;
    SEABED_U.uCSun.value = (c.night > 0.5 ? 0.15 : c.sunI * 0.7) * (1 - this.storm * 0.6);
    SEABED_U.uCDeep.value.copy(uwFog);
    this.sky.update(this.cam, this.time, dt, c, this.storm);
    this.sky.group.visible = !under;
    this.uw.update(this.cam, under, this.time, dt, ld, (c.night > 0.5 ? 0.2 : c.sunI * 0.6) * (1 - this.storm * 0.6), wCam);
    this.hud.underwater(under);
    // som abafado com histerese: nadando na superfície a câmera cruza a onda o tempo todo (não fica liga/desliga)
    const dUw = wCam - this.cam.position.y;
    if (this.auUnder ? dUw < -0.06 : dUw > 0.18) this.auUnder = !this.auUnder;
    this.au.underwater = this.auUnder;
    // eu em 3ª pessoa
    const m = this.me;
    this.paper.root.visible = this.camMode !== 0;
    if (this.camMode !== 0) {
      this.paper.root.position.set(m.x, m.y, m.z);
      const tool: Partial<Record<ItemId, PaperTool>> = { hammer: 'hammer', axe: 'axe', lantern: 'lamp' };
      this.paper.setTool(tool[this.sel] ?? null);
      this.paper.update(dt, this.cam, { yaw: m.yaw + Math.PI, speed: m.speedK * SPEED, act: this.swingT > 0 ? 1 - this.swingT / 0.4 : -1, hurt: m.invT > 0.5 });
    }
    this.updateHand(dt);
    this.updateRain(dt);
    this.updateBirds(dt);
    this.updateWeather(dt);
    // lanterna
    if (this.lanternLight) {
      const on = this.sel === 'lantern' && this.lanternOn;
      this.lanternLight.intensity = on ? 1.4 + c.night * 1.6 + this.caveK * 2.2 : 0;
      this.lanternLight.position.set(m.x - Math.sin(m.yaw) * 0.8, m.y + 1.4, m.z - Math.cos(m.yaw) * 0.8);

    }
    this.renderer.render(this.scene, this.cam);
    this.updateLabels();
  }
  private updateHand(dt: number): void {
    const id = this.sel;
    const show = this.camMode === 0 && !this.handHidden;
    this.hand.visible = show;
    if (!show) return;
    const key = id;
    if (key !== this.handKey) {
      this.handKey = key;
      if (this.handObj) this.hand.remove(this.handObj);
      const g = handGeo(id);
      if (g) {
        const msh = new THREE.Mesh(g, this.handMat);
        msh.renderOrder = 100;
        msh.frustumCulled = false;
        msh.onBeforeRender = (r) => {
          r.state.buffers.depth.setMask(true);
          r.clearDepth();
        };
        this.handObj = msh;
      } else {
        const mat = new THREE.MeshBasicMaterial({ map: iconTexture(iconImage(id), id), transparent: true, depthTest: false, depthWrite: false });
        const msh = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), mat);
        msh.renderOrder = 100;
        msh.frustumCulled = false;
        this.handObj = msh;
      }
      this.hand.add(this.handObj);
    }
    const o = this.handObj!;
    const m = this.me;
    const bob = Math.sin(m.bob) * 0.012 * m.speedK;
    const bob2 = Math.abs(Math.cos(m.bob)) * 0.01 * m.speedK;
    const isTool = !!handGeo(id);
    const sw = this.swingT > 0 ? Math.sin((1 - this.swingT / 0.4) * Math.PI) : 0;
    const ch = this.hook.st === 'charge' ? this.hook.charge : 0;
    if (isTool) {
      o.position.set(0.24 + bob, -0.27 + bob2 - sw * 0.05 - ch * 0.04, -0.42 + ch * 0.1 - (id.startsWith('spear') || id.startsWith('harpoon') ? sw * 0.35 : 0));
      const spear = id.startsWith('spear') || id.startsWith('harpoon');
      o.rotation.set(-0.5 - (spear ? 0.9 : 0) - (spear ? 0 : sw * 1.2) + ch * 0.6, 0.2, -0.2 + (id === 'rod' ? 0.3 : 0));
      o.scale.setScalar(id === 'rod' ? 0.6 : spear ? 0.55 : 0.75);
      if ((id === 'hook' || id === 'hook2') && (this.hook.st === 'fly' || this.hook.st === 'water')) o.scale.setScalar(0.0001);
    } else {
      o.position.set(0.22 + bob, -0.2 + bob2 + sw * 0.12, -0.45 + sw * 0.15);
      o.rotation.set(0, 0, 0);
      o.scale.setScalar(1);
    }
    void dt;
  }
  private updateRain(dt: number): void {
    const on = this.storm > 0.35 && this.tier >= 1;
    if (!on) {
      if (this.rain) this.rain.visible = false;
      return;
    }
    if (!this.rain) {
      const n = this.tier >= 2 ? 360 : 180;
      const g = new THREE.BufferGeometry();
      const a = new Float32Array(n * 6);
      for (let i = 0; i < n; i++) {
        const x = (Math.random() - 0.5) * 30;
        const y = Math.random() * 16;
        const z = (Math.random() - 0.5) * 30;
        a.set([x, y, z, x + 0.08, y - 0.6, z], i * 6);
      }
      g.setAttribute('position', new THREE.BufferAttribute(a, 3));
      this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.45 }));
      this.rain.frustumCulled = false;
      this.scene.add(this.rain);
    }
    this.rain.visible = true;
    const pos = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const fall = dt * 16;
    for (let i = 0; i < arr.length; i += 6) {
      arr[i + 1] -= fall;
      arr[i + 4] -= fall;
      if (arr[i + 1] < -2) {
        arr[i + 1] += 18;
        arr[i + 4] += 18;
      }
    }
    pos.needsUpdate = true;
    this.rain.position.set(this.cam.position.x, this.cam.position.y - 6, this.cam.position.z);
    (this.rain.material as THREE.LineBasicMaterial).opacity = (this.storm - 0.35) * 0.8;
    // raios
    if (this.isHost && this.storm > 0.6 && Math.random() < dt * 0.08) this.sendFx('thunder', 0, 0, 0, 200 + Math.random() * 600);
  }
  private makeBirds(): void {
    const mat = new THREE.MeshLambertMaterial({ color: '#ffffff', side: THREE.DoubleSide });
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4).scale(1, 0.8, 1.8), mat);
      g.add(body);
      const w: THREE.Mesh[] = [];
      for (const s of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.18).translate(0.3 * s, 0, 0), mat);
        wing.rotation.x = -Math.PI / 2;
        g.add(wing);
        w.push(wing);
      }
      this.scene.add(g);
      this.birds.push({ g, a: Math.random() * TAU, r: 14 + Math.random() * 14, h: 14 + Math.random() * 8, s: 0.12 + Math.random() * 0.08, w });
    }
  }
  private updateBirds(dt: number): void {
    const show = this.sc.night < 0.4 && this.storm < 0.5;
    for (const b of this.birds) {
      b.g.visible = show;
      if (!show) continue;
      b.a += b.s * dt;
      b.g.position.set(Math.cos(b.a) * b.r, b.h + Math.sin(b.a * 3) * 1.5, Math.sin(b.a) * b.r);
      b.g.rotation.y = -b.a;
      const f = Math.sin(this.time * 9 + b.r) * 0.5;
      b.w[0].rotation.y = f;
      b.w[1].rotation.y = -f;
    }
  }

  /* ============================== HUD ============================== */
  private updateHud(): void {
    const m = this.me;
    this.hud.setDay(this.day, this.isNightNow(), this.storm > 0.4, this.camLbl());
    const bt = this.myBoat;
    this.hud.setBars(m.hp, m.food, m.water, m.swim && m.air < 0.999 ? m.air * 100 : null, bt ? (bt.def.fuel ? ['fuel', (bt.fuel / (FUEL_SEC * 3)) * 100, '#ff9a3a'] : ['fix', (bt.hp / bt.maxHp) * 100, '#a8e86a']) : null);
    this.hud.setWater(m.swim);
    this.hud.vignette(m.hp);
    const ow = this.isl ? this.owners.get(this.isl.id) : null;
    this.hud.setSneak(!m.swim && !bt && !!ow && !ow.friendly && ow.npcs.length > 0 && m.onIsl, this.sneak);
    this.updateCompass();
    const boss = this.bosses.find((q) => q.fighting && Math.hypot(q.x - m.x, q.z - m.z) < 120);
    this.hud.setBoss(boss ? (boss.kind === 'mega' ? t('jangada.boss.mega', 'MEGALODONTE') : t('jangada.boss.kraken', 'POLVO GIGANTE')) : null, boss ? boss.hp / boss.max : 0);
    this.hud.setMissions(this.misViews());
    // ação
    const id = this.sel;
    const h = this.hook;
    let act: [string, string, boolean] = [id, '', false];
    if (this.hookTool()) act = [id, h.st === 'idle' ? t('jangada.a.throw', 'Segure') : h.st === 'charge' ? t('jangada.a.release', 'Solte!') : t('jangada.a.reel', 'Puxar'), false];
    else if (id === 'hammer') {
      const a = this.aim;
      if (a?.k === 'piece' && this.buildSel !== 'trash' && a.p.hp < PIECE[a.p.k].hp * 0.98) act = ['fix', t('jangada.a.fix', 'Consertar'), false];
      else if (this.buildSel === 'trash') act = ['trash', t('jangada.trash', 'Desmontar'), !this.trashT];
      else act = ['build', t('jangada.a.build', 'Construir'), !this.ghostOk];
    } else if (id === 'rod') act = ['rod', this.fish.st === 'idle' ? t('jangada.a.cast', 'Lançar') : this.fish.st === 'game' || this.fish.st === 'bite' ? t('jangada.a.tap', 'Puxa!') : t('jangada.a.reelIn', 'Recolher'), false];
    else if (id === 'lantern') act = ['lantern', this.lanternOn ? t('jangada.u.off', 'Apagar') : t('jangada.u.on', 'Acender'), false];
    else if (ITEM[id]?.kind === 'food') act = [id === 'water' ? 'drop' : 'eat', id === 'water' || id === 'coco' ? t('jangada.a.drink', 'Beber') : t('jangada.a.eat', 'Comer'), false];
    else if (id === 'axe') act = ['axe', this.aim?.k === 'node' && (this.aim.n.k === 'palm' || this.aim.n.k === 'rock') ? t('jangada.a.chop', 'Cortar') : '', false];
    else if (id.startsWith('spear')) act = [id, this.aim?.k === 'shark' || this.aim?.k === 'ghost' || this.aim?.k === 'npc' || this.aim?.k === 'boss' ? t('jangada.a.poke', 'Cutucar!') : '', false];
    else if (isHarpoon(id)) act = [id, t('jangada.a.harpoon', 'Arremessar'), this.harpCd > 0];
    if (ITEM[id]?.kind === 'food' && this.aim?.k === 'npc' && !this.aim.o.friendly) act = [id, t('jangada.a.bait', 'Jogar isca'), false];
    if (id === 'hammer' && this.aim?.k === 'boat') act = ['fix', t('jangada.a.fix', 'Consertar'), false];
    this.hud.setAction(act[0], act[1], act[2]);
    const u = this.useWhat();
    this.hud.setUse(u ? u[0] : null, u ? u[1] : '');
    // dica na mira
    const a = this.aim;
    if (a?.k === 'piece' && a.p.k !== 'found') {
      const def = PIECE[a.p.k];
      const d = a.p.d;
      let txt = def.n();
      if (a.p.k === 'fire') txt += ` ${d?.lv ?? 1}/${FIRE_MAX}` + ((d?.fuel ?? 0) > 0 ? '' : ' · ' + t('jangada.out', 'apagada'));
      if (a.p.k === 'purifier') txt += (d?.w ? ` · ${d.w}` : '') + ((d?.fuel ?? 0) > 0 ? ' · ' + t('jangada.boiling', 'fervendo') : '');
      if (a.p.k === 'planter' && (d?.g ?? -1) >= 0) txt += ` · ${Math.round((d?.g ?? 0) * 100)}%`;
      this.hud.setHint(a.p.k, txt, a.p.hp < def.hp * 0.98 ? a.p.hp / def.hp : -1);
    } else if (a?.k === 'piece' && a.p.hp < PIECE.found.hp * 0.98) this.hud.setHint('found', PIECE.found.n(), a.p.hp / PIECE.found.hp);
    else if (a?.k === 'node') {
      const n = a.n;
      if (n.k === 'chest') this.hud.setHint(n.r ? 'chestR' : 'chest', `${t('jangada.p.chest', 'Baú')} · ${rarityName(n.r ?? 0)}${n.alive ? '' : ' ✓'}`);
      else this.hud.setHint(n.k === 'palm' ? 'leaf' : n.k === 'tree' ? (n.tk === 'jungle' || n.tk === 'mangrove' ? 'hardwood' : 'wood') : n.k === 'rock' ? 'stone' : n.k === 'ore' ? (a.i.def.ore ?? 'stone') : n.k === 'bush' ? a.i.def.fruit : n.k, '');
    } else if (a?.k === 'shark') this.hud.setHint('shark', a.s.variant ? t('jangada.shark2', 'Tubarão-tigre') : t('jangada.shark', 'Mordelão'));
    else if (a?.k === 'boat') this.hud.setHint(a.b.def.icon, a.b.def.n(), a.b.hp / a.b.maxHp);
    else if (a?.k === 'dchest') this.hud.setHint('beacon', a.c.kind ? t('jangada.treasure', 'Tesouro do chefe') : t('jangada.rescue', 'Baú de resgate'));
    else if (a?.k === 'npc') this.hud.setHint(FACTIONS[a.o.faction as 'crab'].icon, a.n.chief ? FACTIONS[a.o.faction as 'crab'].boss() : a.o.name);
    else if (a?.k === 'boss') this.hud.setHint(a.h.w > 1 ? 'star' : a.b.kind, a.h.w > 1 ? t('jangada.weak', 'Ponto fraco!') : '');
    else if (a?.k === 'ghost') this.hud.setHint('ghost', t('jangada.ghost', 'Capitão Bu'));
    else this.hud.setHint(null);
    // paleta
    const building = id === 'hammer';
    this.hud.setPalette(building, this.buildSel, this.inv, this.raft.fireLv());
    this.hud.setBuildUi(building && !!this.buildSel, !!this.buildSel && this.buildSel !== 'trash' && !!PIECE[this.buildSel].rot);
    if (!building && this.ghostMesh) this.ghostMesh.visible = false;
  }

  /* ============================== áudio ============================== */
  private updateAudio(dt: number): void {
    const night = this.isNightNow();
    const danger = this.shark.danger || this.sharks2.some((s) => s.danger) || this.storm > 0.55 || (this.isl ? !!this.owners.get(this.isl.id)?.danger : false);
    const boss = this.bosses.find((q) => q.fighting && Math.hypot(q.x - this.me.x, q.z - this.me.z) < 130);
    this.au.setSong(boss ? (boss.kind === 'mega' ? 'mega' : 'kraken') : danger ? 'storm' : night ? 'night' : 'day');
    this.au.biome = this.biomeNear && Math.hypot(this.isl!.x - this.me.x, this.isl!.z - this.me.z) < this.isl!.r + 25 ? this.biomeNear.id : '';
    this.au.cave = this.caveK;
    this.au.motor = this.myBoat && this.myBoat.def.fuel ? Math.abs(this.myBoat.v) / this.myBoat.def.speed + (this.myBoat.fuel > 0 ? 0.15 : 0) : 0;
    this.au.storm = this.storm;
    this.au.night = this.sc.night;
    const cam = this.cam;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    this.au.listener(cam.position, fwd);
    if (night !== this.lastNight) this.lastNight = night;
    this.creakT -= dt;
    if (this.creakT <= 0) {
      this.creakT = 3 + Math.random() * 6 - this.storm * 2;
      const [cx, cz] = this.raft.center();
      this.au.raftCreak({ x: cx, y: DECK, z: cz });
    }
  }

  /* ============================== online ============================== */
  private bindNet(): void {
    const net = this.net!;
    this.offs.push(net.onEvent((from, e) => this.onNet(from, e)));
    this.offs.push(
      net.onRoster((why, id) => {
        if (why === 'leave') this.dropRemote(id);
        if (why === 'join' && this.isHost) this.sendInit(id);
        if (why === 'host' && net.isHost) {
          this.waitingInit = false;
          notify(t('jangada.nowHost', 'Agora você cuida do mundo (anfitrião)!'), { icon: 'star' });
        }
      }),
    );
  }
  private sendInit(to: string): void {
    const net = this.net!;
    net.send(
      {
        t: 'init',
        raft: this.raft.serialize(),
        tod: this.tod,
        day: this.day,
        diff: this.diff,
        off: this.off,
        dr: this.drift,
        fl: this.flow,
        deb: this.debris.filter((d) => !d.hooked).map((d) => [d.id, DEBRIS.indexOf(d.k), r1(d.x), r1(d.z), r2(d.vx), r2(d.vz)]),
        seed: this.seed,
        il: Object.fromEntries(Object.entries(this.isleSt).map(([k, v]) => [k, v.d])),
        bt: this.boatList(),
        dc: this.dch.map((c) => [c.id, c.kind, r1(c.x), r1(c.z)]),
        bd: this.bossDone,
        st: r2(this.storm),
      },
      to,
    );
  }
  private onNet(from: string, e: NetEvent): void {
    const net = this.net!;
    const fromHost = from === net.hostId;
    switch (e.t) {
      case 'p':
        this.remoteState(from, e);
        break;
      case 'hello':
        if (this.isHost) this.sendInit(from);
        break;
      case 'act':
        if (this.isHost) this.apply(e, from);
        break;
      case 'give':
        if (fromHost && e.b && typeof e.b === 'object') this.addItems(e.b as Bag);
        break;
      case 'hurt':
        if (fromHost) this.hurt(Number(e.d) || 10, true, e.fx === undefined ? undefined : Number(e.fx), e.fz === undefined ? undefined : Number(e.fz));
        break;
      case 'qte':
        if (fromHost) this.startQte({ kind: String(e.k) as QteReq['kind'], dir: (String(e.d) || undefined) as QteReq['dir'], dur: Number(e.du) || 1.2, n: Number(e.n) || undefined }, Number(e.id), Number(e.b) | 0);
        break;
      case 'bts':
        if (fromHost && !this.isHost) this.applyBoats(e.l);
        break;
      case 'dch':
        if (fromHost && !this.isHost) this.applyDch(e.l);
        break;
      case 'init':
        if (!fromHost) break;
        this.waitingInit = false;
        this.raft.load(e.raft);
        this.tod = Number(e.tod) || 0.1;
        this.day = Number(e.day) || 1;
        this.diff = ((Number(e.diff) | 0) % 3) as Diff;
        this.off = (e.off as [number, number]) ?? [0, 0];
        this.drift = (e.dr as [number, number]) ?? [0, 0];
        this.flow = (e.fl as [number, number]) ?? [0, 0];
        this.storm = Number(e.st) || 0;
        for (const d of [...this.debris]) this.scene.remove(d.mesh);
        this.debris = [];
        for (const l of (e.deb as number[][]) ?? []) this.addDebris(l[0], DEBRIS[l[1]] ?? 'plank', l[2], l[3], l[4], l[5]);
        if (Number(e.seed) && Number(e.seed) !== this.seed) this.reseed(Number(e.seed));
        for (const [k, v] of Object.entries((e.il as Record<string, number[]>) ?? {})) {
          const st = (this.isleSt[+k] ??= { d: [] });
          st.d = [...v];
          const isl = this.isles.get(+k);
          if (isl) for (const id of v) this.killNode(isl, id);
        }
        this.applyBoats(e.bt);
        this.applyDch(e.dc);
        this.bossDone = { ...((e.bd as Record<string, number>) ?? {}) };
        this.respawn();
        this.rv.sync(true);
        break;
      case 's':
        if (!fromHost || this.isHost) break;
        this.applySnap(e);
        break;
      case 'raft':
        if (fromHost && !this.isHost) {
          this.raft.load(e.r);
          this.chestRedraw?.();
        }
        break;
      case 'dAdd':
        if (!this.isHost || !fromHost) for (const l of (e.l as number[][]) ?? []) if (!this.debris.some((d) => d.id === l[0])) this.addDebris(l[0], DEBRIS[l[1]] ?? 'plank', l[2], l[3], l[4], l[5]);
        break;
      case 'dDel':
        if (this.isHost && !fromHost) {
          // um convidado pescou: tira e avisa todo mundo
          this.removeDebris((e.ids as number[]) ?? [], true);
        } else this.removeDebris((e.ids as number[]) ?? [], false);
        break;
      case 'dp':
        if (fromHost && !this.isHost)
          for (const l of (e.l as number[][]) ?? []) {
            const d = this.debris.find((q) => q.id === l[0]);
            if (d && !d.hooked) {
              d.x += (l[1] - d.x) * 0.5;
              d.z += (l[2] - d.z) * 0.5;
            }
          }
        break;
      case 'node':
        if (fromHost && !this.isHost) {
          const st = (this.isleSt[Number(e.i)] ??= { d: [] });
          if (!st.d.includes(Number(e.id))) st.d.push(Number(e.id));
          const isl = this.isles.get(Number(e.i));
          if (isl) this.killNode(isl, Number(e.id));
        }
        break;
      case 'fx':
        if (!fromHost || this.isHost) break;
        if (e.k === 'nodehit') {
          const isl = this.isles.get(Number(e.i));
          const n = isl?.nodes.find((q) => q.id === Number(e.id));
          if (n) isl!.hit(n);
          break;
        }
        this.playFx(String(e.k), Number(e.x) || 0, Number(e.y) || 0, Number(e.z) || 0, Number(e.v) || 0, String(e.by ?? ''));
        break;
    }
  }
  private killNode(isl: Island, id: number): void {
    const n = isl.nodes.find((q) => q.id === id);
    if (n && n.alive) isl.kill(n);
  }
  private applyDch(l: unknown): void {
    if (!Array.isArray(l)) return;
    const seen = new Set<number>();
    for (const a of l as number[][]) {
      seen.add(a[0]);
      if (!this.dch.some((c) => c.id === a[0])) this.addDChest(a[0], a[1], a[2], a[3], {}, 0);
    }
    for (const c of [...this.dch]) if (!seen.has(c.id)) this.removeDChest(c.id);
  }
  /** convidado: o mapa é o do anfitrião */
  private reseed(seed: number): void {
    for (const id of [...this.isles.keys()]) this.dropIsle(id);
    for (const m of this.far.values()) this.scene.remove(m);
    this.far.clear();
    for (const b of this.bosses) this.scene.remove(b.root);
    this.bosses = [];
    this.seed = seed;
    this.buildMap();
  }
  private applySnap(e: NetEvent): void {
    const prevDay = this.day;
    this.tod = Number(e.tod);
    this.day = Number(e.day) || this.day;
    this.storm = Number(e.st) || 0;
    this.drift = (e.dr as [number, number]) ?? this.drift;
    this.flow = (e.fl as [number, number]) ?? this.flow;
    const off = e.off as [number, number];
    if (off) {
      this.off[0] += (off[0] - this.off[0]) * 0.3;
      this.off[1] += (off[1] - this.off[1]) * 0.3;
    }
    if (Array.isArray(e.sh)) this.shark.setPose(e.sh as number[]);
    if (Array.isArray(e.gh)) this.ghost.setPose(e.gh as number[]);
    if (Array.isArray(e.s2)) (e.s2 as number[][]).forEach((p, i) => this.sharks2[i]?.setPose(p));
    if (Array.isArray(e.bs))
      for (const p of e.bs as number[][]) {
        const b = this.bosses[p[0]];
        if (b) b.setPose(p.slice(1));
      }
    if (typeof e.wd === 'number') this.wind = e.wd;
    this.applyBoats(e.bt);
    if (prevDay !== this.day && this.dailyDay !== this.day) this.rollDaily();
  }
  private netTick(dt: number): void {
    const net = this.net!;
    this.netT -= dt;
    if (this.netT <= 0) {
      this.netT = 0.1;
      const m = this.me;
      const bt = this.myBoat;
      net.send({ t: 'p', x: r2(m.x), y: r2(m.y), z: r2(m.z), yaw: r2(m.yaw), h: this.sel, sw: m.swim ? 1 : 0, a: this.swingT > 0 ? 1 : 0, sp: r2(m.speedK), ...(bt ? { bt: [bt.id, r1(bt.x), r1(bt.z), r2(bt.yaw), r1(bt.v), Math.round(bt.fuel)] } : {}) });
    }
    if (!this.isHost) return;
    this.snapT -= dt;
    if (this.snapT <= 0) {
      this.snapT = 0.2;
      const bs = this.bosses.map((b, i) => (b.st !== 'off' && b.st !== 'gone' ? [i, ...b.pose()] : null)).filter((x) => x);
      net.send({ t: 's', tod: Math.round(this.tod * 10000) / 10000, day: this.day, st: r2(this.storm), dr: [r2(this.drift[0]), r2(this.drift[1])], fl: [r2(this.flow[0]), r2(this.flow[1])], off: [r2(this.off[0]), r2(this.off[1])], sh: this.shark.pose(), gh: this.ghost.pose(), s2: this.sharks2.map((s) => s.pose()), bs, wd: r2(this.wind), bt: this.boatList() });
    }
    this.raftT -= dt;
    const key = `${this.raft.ver}|${this.raft.hpVer}`;
    if (this.raftT <= 0 && key !== this.raftSentVer) {
      this.raftT = 0.5;
      this.raftSentVer = key;
      net.send({ t: 'raft', r: this.raft.serialize() });
    }
    this.dpT -= dt;
    if (this.dpT <= 0) {
      this.dpT = 1.5;
      net.send({ t: 'dp', l: this.debris.filter((d) => !d.hooked).map((d) => [d.id, r1(d.x), r1(d.z)]) });
    }
  }
  private remoteState(id: string, e: NetEvent): void {
    let r = this.remotes.get(id);
    if (!r) {
      const peer = this.net!.peers.find((p) => p.id === id);
      const paper = new PaperChar(specOf(peer?.skin ?? 'bloop'), { radius: 0.42, cell: 96, shadow: true });
      this.scene.add(paper.root);
      const label = document.createElement('div');
      label.className = 'jg-name';
      label.textContent = peer?.name ?? 'Bloop';
      this.hud.el.appendChild(label);
      r = { id, name: peer?.name ?? 'Bloop', paper, label, x: Number(e.x), y: Number(e.y), z: Number(e.z), yaw: Number(e.yaw), tx: 0, ty: 0, tz: 0, tyaw: 0, held: '', sw: false, act: 0, seen: 0, speed: 0 };
      this.remotes.set(id, r);
    }
    r.tx = Number(e.x) || 0;
    r.ty = Number(e.y) || 0;
    r.tz = Number(e.z) || 0;
    r.tyaw = Number(e.yaw) || 0;
    r.held = String(e.h ?? '');
    r.sw = !!e.sw;
    r.act = Number(e.a) || 0;
    r.speed = Number(e.sp) || 0;
    r.seen = this.time;
    // barco que ele dirige (pose do motorista)
    const bt = e.bt as number[] | undefined;
    if (Array.isArray(bt)) {
      const b = this.boats.find((q) => q.id === bt[0]);
      if (b && b !== this.myBoat) {
        b.tx = bt[1];
        b.tz = bt[2];
        b.tyaw = bt[3];
        b.v = bt[4];
        b.fuel = bt[5];
        if (this.isHost) b.drv = id;
      }
    }
  }
  private updateRemotes(dt: number): void {
    for (const r of this.remotes.values()) {
      const k = Math.min(1, dt * 10);
      r.x += (r.tx - r.x) * k;
      r.y += (r.ty - r.y) * k;
      r.z += (r.tz - r.z) * k;
      r.yaw += Math.atan2(Math.sin(r.tyaw - r.yaw), Math.cos(r.tyaw - r.yaw)) * k;
      r.paper.root.position.set(r.x, r.y, r.z);
      const tool: Record<string, PaperTool> = { hammer: 'hammer', axe: 'axe', lantern: 'lamp' };
      r.paper.setTool(tool[r.held] ?? null);
      r.paper.update(dt, this.cam, { yaw: r.yaw + Math.PI, speed: r.speed * SPEED, act: r.act ? 0.5 : -1 });
    }
  }
  private updateLabels(): void {
    if (!this.remotes.size) return;
    const w = this.renderer.domElement.clientWidth;
    const h = this.renderer.domElement.clientHeight;
    const v = new THREE.Vector3();
    for (const r of this.remotes.values()) {
      v.set(r.x, r.y + 1.25, r.z).project(this.cam);
      const vis = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      r.label.style.display = vis ? 'block' : 'none';
      if (vis) r.label.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%,-100%)`;
      r.label.style.left = r.label.style.top = '0';
    }
  }
  dropRemote(id: string): void {
    const r = this.remotes.get(id);
    if (!r) return;
    this.scene.remove(r.paper.root);
    r.label.remove();
    this.remotes.delete(id);
  }
  /** jogadores agora (para o resultado) */
  get players(): number {
    return 1 + this.remotes.size;
  }

  /* ============================== testes ============================== */
  debug() {
    return {
      give: (b: Bag) => this.addItems(b, false),
      tp: (x: number, y: number, z: number) => {
        this.me.x = x;
        this.me.y = y;
        this.me.z = z;
        this.me.vx = this.me.vy = this.me.vz = 0;
        this.me.swim = false;
      },
      look: (yaw: number, pitch: number) => {
        this.me.yaw = yaw;
        this.me.pitch = pitch;
      },
      setTod: (v: number) => (this.tod = v),
      /** avança o tempo do jogo sem desenhar (testes) */
      ff: (sec: number) => {
        for (let t = 0; t < sec; t += 0.05) this.step(0.05);
      },
      setStorm: (on: boolean) => {
        this.stormOn = on;
        this.storm = on ? 1 : 0;
        this.stormT = 120;
      },
      shark: () => {
        this.shark.timer = 0;
        this.shark.st = 'away';
        this.day = Math.max(this.day, 2);
      },
      sharkBite: () => {
        const e = this.edges()[0];
        if (!e) return;
        this.shark.target = e;
        this.shark.st = 'bite';
        this.shark.x = e[1] + e[3] * 2.1;
        this.shark.z = e[2] + e[4] * 2.1;
        this.shark.yaw = Math.atan2(-e[3], -e[4]);
        this.shark.timer = 30;
        return e;
      },
      ghost: () => {
        const [cx, cz] = this.raft.center();
        this.tod = NIGHT0 + 0.08;
        this.ghostNight = this.day;
        this.ghost.arrive(cx, cz);
      },
      /** teleporta para a ilha (id ou bioma): 'shore' praia · 'center' · 'cave' porta da caverna · 'guard' perto do baú guardado · 'chief' perto do chefe */
      isle: (which: number | string = 'tropical', where = 'shore') => {
        const sp = typeof which === 'number' ? this.map.find((q) => q.id === which) : this.map.find((q) => q.biome === which);
        if (!sp) return null;
        const isl = this.ensureIsle(sp.id)!;
        let lx = 0;
        let lz = 0;
        const out = Math.atan2(-sp.z, -sp.x);
        if (where === 'shore') {
          lx = Math.cos(out) * isl.r * 0.82;
          lz = Math.sin(out) * isl.r * 0.82;
        } else if (where === 'cave' && isl.cave) {
          lx = isl.cave.x + Math.cos(isl.cave.door) * (isl.cave.R + 3);
          lz = isl.cave.z + Math.sin(isl.cave.door) * (isl.cave.R + 3);
        } else if (where === 'guard' && isl.guard) {
          const a = Math.atan2(isl.guard.z, isl.guard.x);
          lx = isl.guard.x + Math.cos(a) * 9;
          lz = isl.guard.z + Math.sin(a) * 9;
        } else if (where === 'chief' && isl.ownerSpots[0]) {
          lx = isl.ownerSpots[0][0] + 2.5;
          lz = isl.ownerSpots[0][1] + 1;
        }
        let tries = 0;
        while (this.collidesAt(isl.x + lx, isl.z + lz, isl.hLocal(lx, lz)) && tries++ < 20) {
          lx += 0.7;
          lz += 0.4;
        }
        if (this.myBoat) this.leaveBoat(true);
        this.me.x = isl.x + lx;
        this.me.z = isl.z + lz;
        this.me.y = isl.hLocal(lx, lz) + 0.1;
        this.me.vx = this.me.vy = this.me.vz = 0;
        this.me.swim = false;
        this.me.grounded = false;
        this.streamT = 0;
        this.updateIsles(0);
        return { id: sp.id, biome: sp.biome, x: isl.x, z: isl.z, r: isl.r, cave: isl.cave, guard: isl.guard && [isl.guard.x + isl.x, isl.guard.y, isl.guard.z + isl.z], spots: isl.ownerSpots.map(([x, z]) => [x + isl.x, z + isl.z]) };
      },
      map: () => this.map.map((s) => ({ id: s.id, biome: s.biome, x: s.x, z: s.z, r: s.r, d: Math.round(Math.hypot(s.x, s.z)), known: !!this.isleSt[s.id]?.k })),
      discoverAll: () => {
        for (const s of this.map) (this.isleSt[s.id] ??= { d: [] }).k = 1;
      },
      openMap: () => this.openMap(),
      setTarget: (id: number) => (this.target = id),
      boat: (k: BoatK = 0) => {
        this.act({ o: 'boat', k });
        return this.boats.length;
      },
      boats: () => this.boats.map((b) => ({ id: b.id, k: b.k, x: +b.x.toFixed(1), z: +b.z.toFixed(1), yaw: +b.yaw.toFixed(2), hp: b.hp, fuel: Math.round(b.fuel), drv: b.drv, v: +b.v.toFixed(2), flip: b.flip })),
      board: (i = 0) => {
        const b = this.boats[i];
        if (b) this.useBoat(b);
        return !!this.myBoat;
      },
      leave: () => this.leaveBoat(false),
      /** coloca o barco que eu dirijo em (x, z) virado para yaw */
      boatTo: (x: number, z: number, yaw = 0) => {
        const b = this.myBoat ?? this.boats[0];
        if (!b) return;
        b.x = b.tx = x;
        b.z = b.tz = z;
        b.yaw = b.tyaw = yaw;
        this.lastBoatYaw = yaw;
        this.me.yaw = yaw + Math.PI;
        this.streamT = 0;
      },
      /** dirige o barco por N segundos (acelerador, volante) */
      drive: (sec: number, thr = 1, steer = 0) => {
        const b = this.myBoat;
        if (!b) return null;
        for (let t = 0; t < sec; t += 0.05) {
          b.drive(0.05, thr, steer, this.wind, this.storm, (x, z) => this.boatBlocked(x, z));
          this.step(0.05);
        }
        return { x: +b.x.toFixed(1), z: +b.z.toFixed(1), v: +b.v.toFixed(1), fuel: Math.round(b.fuel) };
      },
      die: () => {
        this.me.hp = 0;
        this.faint();
      },
      dchests: () => this.dch.map((c) => ({ id: c.id, kind: c.kind, x: c.x, z: c.z, n: bagCount(c.bag) })),
      /** chefe: libera a luta de novo (kind 'mega' | 'kraken') */
      boss: (kind: 'mega' | 'kraken') => {
        const b = this.bosses.find((q) => q.kind === kind);
        if (!b) return null;
        delete this.bossDone[kind];
        if (b.st === 'gone') b.st = 'off';
        return { cx: b.cx, cz: b.cz, st: b.st, hp: b.hp };
      },
      bossState: () => this.bosses.map((b) => ({ kind: b.kind, st: b.st, hp: b.hp, max: b.max, x: +b.x.toFixed(1), y: +b.y.toFixed(1), z: +b.z.toFixed(1), t: +b.t.toFixed(2) })),
      bossSet: (kind: string, st: string, t = 2) => {
        const b = this.bosses.find((q) => q.kind === kind);
        if (b) {
          b.st = st;
          b.t = t;
        }
      },
      bossHit: (kind: string, dmg: number) => {
        const b = this.bosses.find((q) => q.kind === kind);
        if (!b) return;
        const h = b.hitSpheres().sort((p, q) => q.w - p.w)[0];
        if (h) this.hitBoss(b, h, dmg);
        return b.hp;
      },
      qte: () => (this.hud.qte.active ? 'on' : 'off'),
      qteSolve: (ok: boolean) => this.hud.qte.debugSolve(ok),
      owners: () => {
        const o = this.isl ? this.owners.get(this.isl.id) : null;
        return o ? { f: o.faction, friendly: o.friendly, npcs: o.npcs.map((n) => ({ st: n.st, x: +(n.x + this.isl!.x).toFixed(1), y: +n.y.toFixed(1), z: +(n.z + this.isl!.z).toFixed(1), chief: n.chief })) } : null;
      },
      trade: () => {
        const o = this.isl ? this.owners.get(this.isl.id) : null;
        if (o) this.openTrade(o);
      },
      sneak: (on: boolean) => (this.sneak = on),
      biteMe: () => this.sharkBiteMe(this.net?.me.id ?? 'me', this.shark),
      wind: (w: number) => (this.wind = w),
      harpoon: () => this.throwHarpoon(this.sel),
      /** modo foto: câmera em (x,y,z) olhando (lx,ly,lz); sem args desliga */
      photo: (...a: number[]) => {
        this.photo = a.length === 6 ? (a as [number, number, number, number, number, number]) : null;
        this.streamT = 0;
        this.updateIsles(0);
      },
      hud: (on: boolean) => {
        this.hud.show(on);
        this.ctl.show(on);
        this.hand.visible = on;
        this.handHidden = !on;
      },
      placeTestRaft: () => {
        const tryP = (k: PK, x: number, z: number, lv = 0, ro = 0) => {
          if (!this.raft.canPlace(k, x, z, lv, 3)) this.raft.place(k, x, z, lv, ro);
        };
        for (let x = -1; x <= 3; x++) for (let z = -1; z <= 3; z++) tryP('found', x, z);
        for (let x = -1; x <= 3; x++) for (let z = -1; z <= 3; z++) tryP('found', x, z);
        return this.raft.tiles;
      },
      build: (k: PK, x: number, z: number, lv = 0, ro = 0) => {
        const w = this.raft.canPlace(k, x, z, lv, 3);
        if (!w) this.raft.place(k, x, z, lv, ro);
        return w;
      },
      raftInfo: () => ({ tiles: this.raft.tiles, pieces: this.raft.pieces.map((p) => [p.k, p.x, p.z, p.lv, Math.round(p.hp), p.d]) }),
      state: () => ({
        me: { ...this.me },
        inv: { ...this.inv },
        sel: this.sel,
        build: this.buildSel,
        ghostOk: this.ghostOk,
        ghostCell: this.ghostCell,
        aim: this.aim ? (this.aim.k === 'piece' ? 'piece:' + this.aim.p.k : this.aim.k === 'node' ? 'node:' + this.aim.n.k : this.aim.k) : null,
        hook: { st: this.hook.st, caught: this.hook.caught.length, p: this.hook.p.toArray().map((v) => +v.toFixed(2)) },
        fish: this.fish.st,
        day: this.day,
        tod: +this.tod.toFixed(3),
        storm: +this.storm.toFixed(2),
        debris: this.debris.length,
        nearDebris: this.debris
          .map((d) => ({ id: d.id, k: d.k, x: +d.x.toFixed(1), z: +d.z.toFixed(1), d: +Math.hypot(d.x - this.me.x, d.z - this.me.z).toFixed(1) }))
          .sort((a, b) => a.d - b.d)
          .slice(0, 5),
        shark: { st: this.shark.st, hp: this.shark.hp, x: +this.shark.x.toFixed(1), z: +this.shark.z.toFixed(1), timer: +this.shark.timer.toFixed(1), cd: +this.shark.cdT.toFixed(2) },
        sharks2: this.sharks2.map((q) => ({ st: q.st, x: +q.x.toFixed(1), z: +q.z.toFixed(1) })),
        ghost: { st: this.ghost.st, x: +this.ghost.x.toFixed(1), z: +this.ghost.z.toFixed(1) },
        isl: this.isl ? { id: this.isl.id, biome: this.isl.biome, x: +this.isl.x.toFixed(1), z: +this.isl.z.toFixed(1), r: +this.isl.r.toFixed(1), alive: this.isl.nodes.filter((n) => n.alive).map((n) => [n.id, n.k, +(n.x + this.isl!.x).toFixed(1), +n.y.toFixed(1), +(n.z + this.isl!.z).toFixed(1), n.r ?? -1]) } : null,
        boat: this.myBoat ? this.myBoat.id : null,
        cave: +this.caveK.toFixed(2),
        known: this.knownCount(),
        loaded: [...this.isles.keys()],
        mis: this.mis,
        misN: this.misN,
        daily: this.daily,
        stats: this.stats,
        coinsDay: this.coinsDay,
        cam: this.camMode,
        drift: this.drift,
        anchored: this.anchored,
        tier: this.tier,
        host: this.isHost,
        remotes: [...this.remotes.values()].map((r) => ({ id: r.id, x: +r.x.toFixed(1), z: +r.z.toFixed(1) })),
        overlay: !!this.hud.overlay,
      }),
      aimAt: (x: number, y: number, z: number) => {
        const o = this.eyePos();
        const dx = x - o.x;
        const dz = z - o.z;
        this.me.yaw = Math.atan2(-dx, -dz);
        this.me.pitch = Math.atan2(y - o.y, Math.hypot(dx, dz));
      },
      act: (op: Record<string, unknown>) => this.act(op),
      use: () => this.onUse(),
      action: (down: boolean) => this.onAction(down),
      select: (id: ItemId) => this.setHeld(id),
      pick: (k: PK | 'trash') => (this.buildSel = k),
      rotate: (r: number) => (this.buildRo = r),
      fishBite: () => {
        if (this.fish.st === 'wait') this.fish.t = 0;
      },
      fishNeedle: () => {
        const f = this.fish;
        f.needle = (f.zone[0] + f.zone[1]) / 2;
        f.nv = 0;
      },
      setVitals: (hp: number, food: number, water: number) => {
        this.me.hp = hp;
        this.me.food = food;
        this.me.water = water;
      },
      swimTo: (x: number, z: number, depth = 1.2) => {
        if (this.myBoat) this.leaveBoat(true);
        this.me.x = x;
        this.me.z = z;
        this.me.y = this.waterAt(x, z) - depth;
        this.me.swim = true;
        this.streamT = 0;
      },
      camMode: (m: number) => (this.camMode = m),
      quality: (tr: Tier) => this.applyQ(tr),
    };
  }

  dispose(): void {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.au.stop();
    for (const f of this.offs) f();
    this.resizeObs.disconnect();
    window.removeEventListener('keydown', this.kd);
    window.removeEventListener('keyup', this.ku);
    this.ctl.dispose();
    this.hud.dispose();
    this.rv.dispose();
    this.ocean.dispose();
    this.sky.dispose();
    this.fx.dispose();
    for (const id of [...this.isles.keys()]) this.dropIsle(id);
    for (const b of this.boats) b.dispose();
    this.uw.dispose();
    this.seabed.dispose();
    for (const r of this.remotes.values()) r.label.remove();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.touch.remove();
  }
}
const handCache = new Map<string, THREE.BufferGeometry | null>();
/** ferramenta na mão (1ª pessoa) */
function handGeo(id: ItemId): THREE.BufferGeometry | null {
  if (!handCache.has(id)) handCache.set(id, id === 'spear3' ? spear3Geo() : id === 'harpoon' || id === 'harpoon2' ? harpoonGeo(id === 'harpoon2') : toolGeo(id));
  return handCache.get(id)!;
}
function r1(v: number): number {
  return Math.round(v * 10) / 10;
}
function r2(v: number): number {
  return Math.round(v * 100) / 100;
}
// referências usadas só em tipos/expressões condicionais
