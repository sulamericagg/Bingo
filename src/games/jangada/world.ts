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
import { PaperChar, mySpec, specOf, type PaperTool } from '../../3d/paper';
import { JAudio } from './audio';
import { Ghost, Shark } from './creatures';
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
  HOT_ORDER,
  ITEM,
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
import { Island, nodeLoot, underwaterNode, type INode } from './island';
import { CELL, DECK, FLOOR_H, MAT, debrisGeo, iconTexture, initMats, linkGeo, pieceGeo, floorGeo, foundationGeo, stairsGeo, toolGeo } from './models';
import type { JNet, NetEvent } from './net';
import { Ocean, Sky, skyAt, waveH, type SkyCols } from './ocean';
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
type Aim = { k: 'piece'; p: RPiece } | { k: 'node'; n: INode } | { k: 'shark' } | { k: 'ghost' } | null;

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
  ghost = new Ghost();
  isl: Island | null = null;
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
    this.gov = new QualityGovernor({ initial: o.tier, emit: false, persist: false, onChange: (tr) => this.applyQ(tr) });
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
    this.cam = new THREE.PerspectiveCamera(72, 1, 0.07, 1400);
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
    this.ocean = new Ocean(this.tier);
    this.scene.add(this.ocean.mesh);
    this.fx = new Particles(this.tier <= 0 ? 220 : 420);
    this.fx.floorY = -50;
    this.fx.budget = [0.4, 0.65, 0.9, 1][this.tier];
    this.scene.add(this.fx.obj);
    // mundo: salvo ou novo
    const d = o.data;
    this.seed = d?.seed ?? Math.floor(Math.random() * 1e6);
    this.raft = d ? Raft.from(d.raft) : Raft.starter();
    if (d) this.load(d);
    this.rv = new RaftView(this.raft, this.tier >= 2 ? 4 : this.tier === 1 ? 2 : 1);
    this.raftG.add(this.rv.group);
    this.scene.add(this.raftG);
    this.rv.sync(true);
    this.scene.add(this.shark.root, this.ghost.root, this.ghost.ship);
    // eu (3ª pessoa): Bloop de papel
    this.paper = new PaperChar(mySpec(), { radius: 0.42, cell: 128, shadow: true });
    this.scene.add(this.paper.root);
    // mão (1ª pessoa)
    this.handMat = (MAT.vc as THREE.MeshLambertMaterial).clone();
    this.handMat.depthTest = false;
    this.handMat.depthWrite = false;
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
    });
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
    if (!d && !this.net) this.spawnStartDebris();
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
    if (d.isl) {
      this.isl = new Island(d.isl.seed, d.isl.x, d.isl.z, this.tier);
      for (const id of d.isl.dead) {
        const n = this.isl.nodes.find((q) => q.id === id);
        if (n) this.isl.kill(n);
      }
      this.scene.add(this.isl.group);
    }
    for (const p of this.raft.pieces) {
      if (p.k === 'anchor' && p.d?.on) this.anchored = true;
      if (p.k === 'sail' && p.d?.on) this.sailOn = true;
    }
  }
  toSave(): JgWorld {
    return {
      v: 1,
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
      isl: this.isl ? { seed: this.isl.seed, x: this.isl.x, z: this.isl.z, dead: this.isl.nodes.filter((n) => !n.alive).map((n) => n.id) } : null,
      nextIsl: this.nextIsl,
      stats: this.stats,
      pos: this.me.swim ? [0.75, DECK, 0.75] : [this.me.x, this.me.y, this.me.z],
      bed: this.bed,
      sharkT: Math.max(20, this.shark.active ? 40 : this.shark.timer),
      stormT: this.stormT,
      ghostDone: this.ghostNight,
      coinsDay: this.coinsDay,
    };
  }

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

  private step(dt: number): void {
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
    this.updateRemotes(dt);
    this.shark.view(dt);
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
    // clima
    this.stormT -= dt;
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
    // deriva (vela/âncora)
    this.anchored = this.raft.pieces.some((p) => p.k === 'anchor' && p.d?.on);
    const sail = this.raft.pieces.find((p) => p.k === 'sail' && p.d?.on);
    this.sailOn = !!sail;
    let dx = 0;
    let dz = 0;
    if (!this.anchored) {
      dx = this.hdg[0] * CURRENT;
      dz = this.hdg[1] * CURRENT;
      if (sail) {
        const y = sail.d!.yaw ?? 0;
        const n = Math.min(3, this.raft.count('sail'));
        dx += -Math.sin(y) * SAIL * (0.8 + n * 0.2);
        dz += -Math.cos(y) * SAIL * (0.8 + n * 0.2);
      }
    }
    this.drift = [dx, dz];
    this.flow = this.anchored ? [-this.hdg[0] * CURRENT, -this.hdg[1] * CURRENT] : [-dx, -dz];
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
    // ilhas
    this.nextIsl -= dt;
    if (!this.isl && this.nextIsl <= 0) this.spawnIsland();
    if (this.isl) {
      const [ix, iz] = [this.isl.x - cx, this.isl.z - cz];
      const ahead = (ix * this.flow[0] + iz * this.flow[1]) / fl;
      if (ahead > 90 || Math.hypot(ix, iz) > 260) this.dropIsland();
    }
    // tubarão
    this.shark.sim(dt, {
      cx,
      cz,
      edges: () => this.edges(),
      swimmers: () => this.swimmers(),
      bite: (id, x, z) => this.sharkBite(id, x, z),
      biteMe: (who) => this.sharkBiteMe(who),
      waterH: (x, z) => this.waterAt(x, z),
      warn: () => this.sendFx('warn'),
      fin: (x, z) => this.sendFx('fin', x, 0, z),
      wait: D.shark,
      enabled: this.day >= D.sharkDay,
    });
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
    const [dx, dz] = this.drift;
    this.off[0] += dx * dt;
    this.off[1] += dz * dt;
    if (this.isl) {
      this.isl.x -= dx * dt;
      this.isl.z -= dz * dt;
      this.isl.group.position.set(this.isl.x, 0, this.isl.z);
      // quem está na ilha vai junto
      if (this.me.onIsl && !this.me.swim) {
        this.me.x -= dx * dt;
        this.me.z -= dz * dt;
      }
    }
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
    if (this.isl && Math.hypot(x - this.isl.x, z - this.isl.z) < this.isl.r + 4) return;
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
  private spawnIsland(): void {
    const f = this.flow;
    const fl = Math.hypot(f[0], f[1]) || 1;
    const ux = f[0] / fl;
    const uz = f[1] / fl;
    const seed = Math.floor(Math.random() * 1e6);
    const side = (Math.random() < 0.5 ? -1 : 1) * 1;
    const isl = new Island(seed, 0, 0, this.tier);
    const lat = side * (isl.r * 1.15 + 9);
    const [cx, cz] = this.raft.center();
    isl.x = cx - ux * 115 - uz * lat;
    isl.z = cz - uz * 115 + ux * lat;
    isl.group.position.set(isl.x, 0, isl.z);
    this.isl = isl;
    this.scene.add(isl.group);
    this.nextIsl = 300 + Math.random() * 160;
    this.sendFx('isl');
    this.sendIsl();
  }
  private dropIsland(): void {
    if (!this.isl) return;
    this.scene.remove(this.isl.group);
    this.isl.dispose();
    this.isl = null;
    if (this.me.onIsl) this.me.onIsl = false;
    this.sendIsl();
  }
  private sendIsl(): void {
    if (!this.net || !this.isHost) return;
    const i = this.isl;
    this.net.send({ t: 'isl', i: i ? [i.seed, r1(i.x), r1(i.z), i.nodes.filter((n) => !n.alive).map((n) => n.id)] : 0 });
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
  private swimmers(): [string, number, number, number][] {
    const out: [string, number, number, number][] = [];
    const myId = this.net?.me.id ?? 'me';
    if (this.me.swim) out.push([myId, this.me.x, this.me.y, this.me.z]);
    for (const r of this.remotes.values()) if (r.sw) out.push([r.id, r.x, r.y, r.z]);
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
  private sharkBiteMe(who: string): void {
    const myId = this.net?.me.id ?? 'me';
    const dmg = DIFFS[this.diff].biteMe;
    if (who === myId) this.hurt(dmg, true);
    else this.net?.send({ t: 'hurt', d: dmg }, who);
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
    if (this.isl) {
      for (const n of this.isl.nodes) {
        if (!n.alive || (n.k !== 'palm' && n.k !== 'rock')) continue;
        const r = n.k === 'palm' ? 0.25 : 0.7;
        if (Math.hypot(x - (n.x + this.isl.x), z - (n.z + this.isl.z)) < r + RAD) return true;
      }
    }
    return false;
  }
  private controlMe(dt: number): void {
    const m = this.me;
    const [lx, ly] = this.ctl.consumeLook(dt);
    m.yaw -= lx;
    m.pitch = Math.max(-1.35, Math.min(1.3, m.pitch - ly));
    let [mx, my] = this.ctl.dir();
    if (this.hud.overlay) mx = my = 0;
    if (this.camMode === 2) {
      // de frente: o direcional continua relativo ao Bloop
    }
    const fx = -Math.sin(m.yaw);
    const fz = -Math.cos(m.yaw);
    const rx = Math.cos(m.yaw);
    const rz = -Math.sin(m.yaw);
    const starving = (m.food <= 0 || m.water <= 0) && DIFFS[this.diff].starve === 0;
    const sp = (m.swim ? SWIM_SPEED : SPEED) * (starving ? 0.6 : 1) * (this.fish.st !== 'idle' ? 0.5 : 1);
    const tvx = (fx * my + rx * mx) * sp;
    const tvz = (fz * my + rz * mx) * sp;
    let k = mx || my ? ACCEL : DECEL;
    if (!m.grounded && !m.swim) k *= 0.35;
    if (m.swim) k *= 0.45;
    m.vx += (tvx - m.vx) * Math.min(1, dt * k);
    m.vz += (tvz - m.vz) * Math.min(1, dt * k);
    // desliza eixo a eixo (como a Cozinha)
    const nx = m.x + m.vx * dt;
    if (!this.collides(nx, m.z, m.y)) m.x = nx;
    else m.vx = 0;
    const nz = m.z + m.vz * dt;
    if (!this.collides(m.x, nz, m.y)) m.z = nz;
    else m.vz = 0;
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
      if (m.onIsl && this.stats.islands >= 0 && !this.islVisited) {
        this.islVisited = true;
        this.stats.islands++;
        this.prog('island', 1);
        this.hud.banner('island', t('jangada.islandHi', 'Terra firme!'), t('jangada.islandSub', 'Use o machado nas árvores e pedras'), 2.6);
      }
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
      if (m.speedK > 0.3 && Math.random() < dt * 1.6) this.au.stroke();
      if (Math.random() < dt * m.speedK * 3 * this.fx.budget && m.y > float - 0.4) this.fx.emit(m.x + (Math.random() - 0.5) * 0.6, water, m.z + (Math.random() - 0.5) * 0.6, 0, 0.3, 0, { life: 0.6, size: 0.07, grow: 0.1 });
    }
    m.bob += dt * 9 * m.speedK;
    if (m.invT > 0) m.invT -= dt;
    // longe demais da jangada nadando: a correnteza devolve (crianças não se perdem)
    const [cx, cz] = this.raft.center();
    const far = Math.hypot(m.x - cx, m.z - cz);
    if (far > 70 && !m.onIsl) {
      m.x += ((cx - m.x) / far) * dt * 2;
      m.z += ((cz - m.z) / far) * dt * 2;
    }
  }
  private islVisited = false;
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
      if (Math.random() < dt * 1.2) this.au.bubbles(2);
    } else m.air = Math.min(1, m.air + dt / 2.5);
    this.warnT -= dt;
    if (this.warnT <= 0 && (m.food < 18 || m.water < 18)) {
      this.warnT = 20;
      this.au.warn();
      notify(m.water < m.food ? t('jangada.thirsty', 'Com sede! Beba água doce.') : t('jangada.hungry', 'Com fome! Coma alguma coisa.'), { icon: 'warning', key: 'jgwarn' });
    }
    if (m.hp <= 0) this.faint();
  }
  private hurt(n: number, big: boolean): void {
    const m = this.me;
    if (big && m.invT > 0) return;
    m.hp = Math.max(0, m.hp - n);
    if (big) {
      m.invT = 1;
      this.hud.flash();
      this.au.chomp();
      this.au.hurt();
      tap('heavy');
      this.camShake = 0.8;
    }
  }
  private camShake = 0;
  private faint(): void {
    const m = this.me;
    this.hud.fade(true);
    this.au.miss();
    const lost: Bag = {};
    if (DIFFS[this.diff].lose)
      for (const k in this.inv) {
        const id = k as ItemId;
        if (ITEM[id].kind === 'mat') {
          const n = Math.floor((this.inv[id] ?? 0) / 2);
          if (n) lost[id] = n;
        }
      }
    bagAdd(this.inv, lost, -1);
    m.hp = 60;
    m.food = Math.max(m.food, 40);
    m.water = Math.max(m.water, 40);
    this.respawn();
    this.updateHot();
    setTimeout(() => {
      this.hud.fade(false);
      notify(t('jangada.faint', 'Você desmaiou e acordou na jangada. Coma e beba!'), { icon: 'heart', ms: 3500 });
    }, 900);
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
      if (n && (!this.aim || this.aim.k !== 'piece')) this.aim = { k: 'node', n };
    }
    // bichos (lança/machado/lanterna)
    if (this.shark.active) {
      const sp = new THREE.Vector3(this.shark.x, this.shark.y + 0.3, this.shark.z);
      const to = sp.sub(o);
      const dist = to.length();
      if (dist < 4.2 && to.normalize().dot(d) > 0.7) this.aim = { k: 'shark' };
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
      .slice(0, 8)
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
    switch (id) {
      case 'hammer':
        return this.hammerAct();
      case 'spear':
      case 'spear2':
      case 'axe':
        return this.swing(id);
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
          this.au.reel(1);
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
    for (const k in b) {
      const id = k as ItemId;
      if (id === 'shell') this.coins(2 * (b[id] ?? 0));
      if (popSound) setTimeout(() => this.au.pop(['wood', 'plastic', 'leaf', 'scrap', 'rope'].indexOf(id) + 1), delayIdx * 110);
      notify(`+${b[id]} ${itemName(id)}`, { icon: 'gift', ms: 1400, key: 'jg+' + id });
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
      // devolve metade
      const back: Bag = {};
      for (const [id, n] of Object.entries(PIECE[p.k].cost)) back[id as ItemId] = Math.ceil((n ?? 0) / 2);
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
    if (a?.k === 'shark') {
      const dmg = id === 'spear2' ? 2 : id === 'spear' ? 1 : 0.5;
      this.act({ o: 'shark', dmg });
      this.au.sharkHurt({ x: this.shark.x, y: this.shark.y, z: this.shark.z });
      this.fx.burst(this.shark.x, this.shark.y + 0.5, this.shark.z, 10, 'foam', '#ffffff', 2);
      tap('medium');
      return;
    }
    if (a?.k === 'ghost') {
      this.act({ o: 'ghost' });
      return;
    }
    if (a?.k === 'node' && id === 'axe') {
      const n = a.n;
      if (n.k === 'palm' || n.k === 'rock') {
        const isl = this.isl!;
        this.au.chop({ x: n.x + isl.x, y: n.y + 1, z: n.z + isl.z }, n.k === 'rock');
        this.fx.burst(n.x + isl.x, n.y + 1, n.z + isl.z, 8, 'chunk', n.k === 'rock' ? '#a8a6b8' : '#c08850', 1.5);
        isl.hit(n);
        this.act({ o: 'node', id: n.id });
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
      if (n.k === 'bush') return ['berry', t('jangada.u.pick', 'Colher')];
      if (underwaterNode(n.k)) return [n.k, t('jangada.u.grab', 'Pegar')];
      return this.sel === 'axe' ? null : ['axe', t('jangada.u.needAxe', 'Machado!')];
    }
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
      if (a.n.k === 'bush' || underwaterNode(a.n.k)) this.act({ o: 'node', id: a.n.id });
      else this.au.nope();
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
        if (!d.on) notify(t('jangada.sailOn', 'Vela aberta: a jangada vai para onde você estava olhando!'), { icon: 'sparkle', key: 'jgsail' });
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
    let redraw: () => void = () => {};
    const close = () => {
      this.hud.closePanel();
      this.setPaused(false);
      this.chestRedraw = null;
    };
    redraw = this.hud.openChest({
      mine: () => this.inv,
      chest: () => this.raft.get(p.id)?.d?.bag ?? {},
      move: (id, toChest) => {
        const n = toChest ? (this.inv[id] ?? 0) : (this.raft.get(p.id)?.d?.bag?.[id] ?? 0);
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
          if (!n || ITEM[id].kind === 'tool') continue;
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
      const fled = this.shark.hit(Number(op.dmg) || 1);
      if (!me) this.sendFx('sharkHurt', this.shark.x, this.shark.y, this.shark.z);
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
      const isl = this.isl;
      const n = isl?.nodes.find((q) => q.id === Number(op.id));
      if (!isl || !n || !n.alive) return;
      n.hp -= 1;
      if (n.hp > 0) {
        if (!me) this.net?.send({ t: 'fx', k: 'nodehit', id: n.id });
        return;
      }
      isl.kill(n);
      if (n.k === 'palm') this.sendFx('timber', n.x + isl.x, n.y, n.z + isl.z);
      if (this.net) this.net.send({ t: 'node', id: n.id });
      give(nodeLoot(n.k, Math.random));
      if (underwaterNode(n.k)) this.sendFx('divegrab', 0, 0, 0, 0, from);
      return;
    }
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
      if (k === 'fireLv') return Math.max(cur, n);
      return cur + n;
    };
    if (this.mis < MISSIONS.length) {
      const m = MISSIONS[this.mis];
      let cur = tryM(m, this.misN);
      if (m.k === 'tiles') cur = this.raft.tiles;
      if (m.k === 'up') cur = this.raft.count('floor');
      if (m.k === 'fireLv') cur = Math.max(cur, this.raft.fireLv());
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
    const bobY = Math.sin(m.bob * 2) * 0.025 * m.speedK * (m.swim ? 0.3 : 1);
    let roll = Math.cos(m.bob) * 0.008 * m.speedK;
    const onRaft = !m.swim && !m.onIsl;
    if (onRaft) roll += this.tiltZ * 0.6;
    if (m.swim) roll += Math.sin(this.time * 1.4) * 0.03;
    let sx = 0;
    let sy = 0;
    if (this.camShake > 0) {
      this.camShake = Math.max(0, this.camShake - dt * 1.6);
      sx = (Math.random() - 0.5) * this.camShake * 0.12;
      sy = (Math.random() - 0.5) * this.camShake * 0.12;
    }
    cam.rotation.order = 'YXZ';
    const eye = new THREE.Vector3(m.x, m.y + EYE + bobY + sy, m.z);
    if (this.camMode === 0) {
      cam.position.copy(eye);
      cam.position.x += sx;
      cam.rotation.set(m.pitch + sy * 0.5 + (onRaft ? this.tiltX * 0.4 : 0), m.yaw + sx * 0.5, roll);
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
    const damp = 0.55 / Math.sqrt(size);
    this.bobY += (w0 * damp - this.bobY) * 0.15;
    this.tiltZ += (-(wx / Math.max(2, b[2] - b[0])) * 0.5 - this.tiltZ) * 0.1;
    this.tiltX += ((wz / Math.max(2, b[3] - b[1])) * 0.5 - this.tiltX) * 0.1;
    this.raftG.position.y = this.bobY;
    this.raftG.rotation.set(this.tiltX * 0.5, 0, this.tiltZ * 0.5);
    this.placeCamera(dt);
    // céu/luz
    this.sc = skyAt(this.tod, this.storm, this.sc);
    const c = this.sc;
    const flash = this.lightning;
    if (this.lightning > 0) this.lightning = Math.max(0, this.lightning - 0.08);
    this.hemi.color.copy(c.amb);
    this.hemi.groundColor.set(c.night > 0.5 ? '#0a1a3a' : '#2a6a8a');
    this.hemi.intensity = c.ambI + flash * 2;
    const ld = c.night > 0.5 ? c.moon : c.dir;
    this.sun.position.set(ld.x * 40 + this.me.x, Math.max(4, ld.y * 40), ld.z * 40 + this.me.z);
    this.sun.target.position.set(this.me.x, 0, this.me.z);
    this.sun.color.copy(c.sun);
    this.sun.intensity = c.night > 0.5 ? 0.35 : c.sunI;
    const under = this.cam.position.y < this.waterAt(this.cam.position.x, this.cam.position.z);
    const fog = this.scene.fog as THREE.FogExp2;
    if (under) {
      fog.color.copy(c.shallow).multiplyScalar(0.55);
      fog.density = 0.075;
    } else {
      fog.color.copy(c.fog);
      fog.density = 0.0045 + this.storm * 0.01 + c.night * 0.002;
    }
    this.renderer.setClearColor(fog.color);
    this.ocean.update(this.cam, this.time, this.amp, this.off[0], this.off[1], c, under ? 0.06 : fog.density * 0.9);
    const ou = this.ocean.mat.uniforms;
    ou.uRaft.value.set(b[0] + this.raftG.position.x, b[1], b[2], b[3]);
    if (this.isl) ou.uIsl.value.set(this.isl.x, this.isl.z, this.isl.r * 1.05, 1);
    else ou.uIsl.value.w = 0;
    this.sky.update(this.cam, this.time, dt, c, this.storm);
    this.hud.underwater(under);
    this.au.underwater = under;
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
    // lanterna
    if (this.lanternLight) {
      const on = this.sel === 'lantern' && this.lanternOn;
      this.lanternLight.intensity = on ? 1.4 + c.night * 1.6 : 0;
      this.lanternLight.position.set(m.x - Math.sin(m.yaw) * 0.8, m.y + 1.4, m.z - Math.cos(m.yaw) * 0.8);
      if (on && this.ghost.active && this.aim?.k === 'ghost') {
        this.ghost.lit += 1 / 60;
        if (this.ghost.lit > 1.1) {
          this.ghost.lit = 0;
          this.act({ o: 'ghost' });
        }
      }
    }
    this.renderer.render(this.scene, this.cam);
    this.updateLabels();
  }
  private updateHand(dt: number): void {
    const id = this.sel;
    const show = this.camMode === 0;
    this.hand.visible = show;
    if (!show) return;
    const key = id;
    if (key !== this.handKey) {
      this.handKey = key;
      if (this.handObj) this.hand.remove(this.handObj);
      const g = toolGeo(id);
      if (g) {
        const msh = new THREE.Mesh(g, this.handMat);
        msh.renderOrder = 100;
        this.handObj = msh;
      } else {
        const mat = new THREE.MeshBasicMaterial({ map: iconTexture(iconImage(id), id), transparent: true, depthTest: false, depthWrite: false });
        const msh = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), mat);
        msh.renderOrder = 100;
        this.handObj = msh;
      }
      this.hand.add(this.handObj);
    }
    const o = this.handObj!;
    const m = this.me;
    const bob = Math.sin(m.bob) * 0.012 * m.speedK;
    const bob2 = Math.abs(Math.cos(m.bob)) * 0.01 * m.speedK;
    const isTool = !!toolGeo(id);
    const sw = this.swingT > 0 ? Math.sin((1 - this.swingT / 0.4) * Math.PI) : 0;
    const ch = this.hook.st === 'charge' ? this.hook.charge : 0;
    if (isTool) {
      o.position.set(0.24 + bob, -0.27 + bob2 - sw * 0.05 - ch * 0.04, -0.42 + ch * 0.1 - (id.startsWith('spear') ? sw * 0.35 : 0));
      const spear = id.startsWith('spear');
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
    this.hud.setBars(m.hp, m.food, m.water, m.swim && m.air < 0.999 ? m.air * 100 : null);
    this.hud.setWater(m.swim);
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
    else if (id === 'axe') act = ['axe', this.aim?.k === 'node' ? t('jangada.a.chop', 'Cortar') : '', false];
    else if (id.startsWith('spear')) act = [id, this.aim?.k === 'shark' || this.aim?.k === 'ghost' ? t('jangada.a.poke', 'Cutucar!') : '', false];
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
    else if (a?.k === 'node') this.hud.setHint(a.n.k === 'palm' ? 'leaf' : a.n.k === 'rock' ? 'stone' : a.n.k === 'bush' ? 'berry' : a.n.k, '');
    else if (a?.k === 'shark') this.hud.setHint('shark', t('jangada.shark', 'Mordelão'));
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
    const danger = this.shark.danger || this.storm > 0.55;
    this.au.setSong(danger ? 'storm' : night ? 'night' : 'day');
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
        isl: this.isl ? [this.isl.seed, r1(this.isl.x), r1(this.isl.z), this.isl.nodes.filter((n) => !n.alive).map((n) => n.id)] : 0,
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
        if (fromHost) this.hurt(Number(e.d) || 10, true);
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
        this.setIsland(e.isl as number[] | 0);
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
      case 'isl':
        if (fromHost && !this.isHost) this.setIsland(e.i as number[] | 0);
        break;
      case 'node':
        if (fromHost && !this.isHost && this.isl) {
          const n = this.isl.nodes.find((q) => q.id === Number(e.id));
          if (n && n.alive) this.isl.kill(n);
        }
        break;
      case 'fx':
        if (!fromHost || this.isHost) break;
        if (e.k === 'nodehit') {
          const n = this.isl?.nodes.find((q) => q.id === Number(e.id));
          if (n) this.isl!.hit(n);
          break;
        }
        this.playFx(String(e.k), Number(e.x) || 0, Number(e.y) || 0, Number(e.z) || 0, Number(e.v) || 0, String(e.by ?? ''));
        break;
    }
  }
  private setIsland(i: number[] | 0): void {
    if (!i) {
      if (this.isl) {
        this.scene.remove(this.isl.group);
        this.isl.dispose();
        this.isl = null;
      }
      return;
    }
    const [seed, x, z, dead] = i as unknown as [number, number, number, number[]];
    if (!this.isl || this.isl.seed !== seed) {
      if (this.isl) this.scene.remove(this.isl.group);
      this.isl = new Island(seed, x, z, this.tier);
      this.scene.add(this.isl.group);
      this.islVisited = false;
    }
    for (const id of dead ?? []) {
      const n = this.isl.nodes.find((q) => q.id === id);
      if (n && n.alive) this.isl.kill(n);
    }
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
    const ip = e.ip as [number, number] | 0;
    if (ip && this.isl) {
      const dx = ip[0] - this.isl.x;
      const dz = ip[1] - this.isl.z;
      this.isl.x += dx * 0.3;
      this.isl.z += dz * 0.3;
      if (this.me.onIsl && !this.me.swim) {
        this.me.x += dx * 0.3;
        this.me.z += dz * 0.3;
      }
    }
    if (prevDay !== this.day && this.dailyDay !== this.day) this.rollDaily();
  }
  private netTick(dt: number): void {
    const net = this.net!;
    this.netT -= dt;
    if (this.netT <= 0) {
      this.netT = 0.1;
      const m = this.me;
      net.send({ t: 'p', x: r2(m.x), y: r2(m.y), z: r2(m.z), yaw: r2(m.yaw), h: this.sel, sw: m.swim ? 1 : 0, a: this.swingT > 0 ? 1 : 0, sp: r2(m.speedK) });
    }
    if (!this.isHost) return;
    this.snapT -= dt;
    if (this.snapT <= 0) {
      this.snapT = 0.2;
      net.send({ t: 's', tod: Math.round(this.tod * 10000) / 10000, day: this.day, st: r2(this.storm), dr: [r2(this.drift[0]), r2(this.drift[1])], fl: [r2(this.flow[0]), r2(this.flow[1])], off: [r2(this.off[0]), r2(this.off[1])], sh: this.shark.pose(), gh: this.ghost.pose(), ip: this.isl ? [r1(this.isl.x), r1(this.isl.z)] : 0 });
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
        this.shark.x = e[1] + e[3] * 1.35;
        this.shark.z = e[2] + e[4] * 1.35;
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
      island: (near = false) => {
        this.nextIsl = 0;
        if (this.isl) this.dropIsland();
        this.spawnIsland();
        if (near && this.isl) {
          const [cx, cz] = this.raft.center();
          const dx = this.isl.x - cx;
          const dz = this.isl.z - cz;
          const d = Math.hypot(dx, dz);
          const want = this.isl.r * 1.15 + 7;
          this.isl.x = cx + (dx / d) * want;
          this.isl.z = cz + (dz / d) * want;
          this.isl.group.position.set(this.isl.x, 0, this.isl.z);
        }
        return this.isl && { x: this.isl.x, z: this.isl.z, r: this.isl.r };
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
        shark: { st: this.shark.st, hp: this.shark.hp, x: +this.shark.x.toFixed(1), z: +this.shark.z.toFixed(1), timer: +this.shark.timer.toFixed(1) },
        ghost: { st: this.ghost.st, x: +this.ghost.x.toFixed(1), z: +this.ghost.z.toFixed(1) },
        isl: this.isl ? { x: +this.isl.x.toFixed(1), z: +this.isl.z.toFixed(1), r: +this.isl.r.toFixed(1), alive: this.isl.nodes.filter((n) => n.alive).map((n) => [n.id, n.k, +(n.x + this.isl!.x).toFixed(1), +n.y.toFixed(1), +(n.z + this.isl!.z).toFixed(1)]) } : null,
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
      swimTo: (x: number, z: number) => {
        this.me.x = x;
        this.me.z = z;
        this.me.y = this.waterAt(x, z) - 1.2;
        this.me.swim = true;
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
    this.isl?.dispose();
    for (const r of this.remotes.values()) r.label.remove();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.touch.remove();
  }
}
function r1(v: number): number {
  return Math.round(v * 10) / 10;
}
function r2(v: number): number {
  return Math.round(v * 100) / 100;
}
// referências usadas só em tipos/expressões condicionais
