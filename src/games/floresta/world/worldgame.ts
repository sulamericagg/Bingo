/* ============================================================
 *  LENHADORES — MUNDO ABERTO 3D (infinito, por pedaços).
 *  Andar/olhar em primeira pessoa; nos veículos, câmera de perseguição.
 *  Machado, pá e dinamite; 8 veículos com física arcade; ajudantes
 *  que só agem quando você manda (ou modo "jogar sozinho").
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../../../i18n';
import { audio } from '../../../core/audio';
import { tap } from '../../../core/haptics';
import { addCoins } from '../../../core/economy';
import { reportRun } from '../../../hub/registry';
import type { QualitySettings, Tier } from '../../../core/quality';
import { short } from '../data';
import { handTexture, lambert, myHandColors, toolModel, windTime } from '../fps/models';
import { LeafBurst, SkyDome, hitTreeShake, natureAnisotropy, natureTick } from '../../../3d/nature';
import { Forearm } from '../../../3d/common/hand';
import { CH, WATER_Y, type Camp } from './gen';
import { WBIOMES, WSPECIES } from './biomes';
import type { Chunk } from './chunk';
import { World, treeHp, type StreamQ, type TreeRef } from './stream';
import { VK, looseLogGeometry, petModel, shovelModel, tntModel, wVehicleModel, type WVehModel } from './wmodels';
import { loadWorld, writeWorld, type WorldSave } from './wsave';
import { WorldHud, WICONS, type WAct } from './whud';
import { flIcon } from '../icons';
import * as CANNON from 'cannon-es';
import { Phys, LOG_R } from './phys';
import type { SBox, MoveOut } from './collide';
import { M as VM, MATS, BED_Y } from './vox';
import { Sandbox } from './survival';
import type { GameMode } from './engine';
import { iconURL } from './itemicons';
import { ITEM } from './items';
import { playIntro } from './intro';
import { forestSolo, setForestSolo } from '../touchcfg';

const TAU = Math.PI * 2;
const EYE = 1.6;
/** altura do corte (o toco fica abaixo) e duração do "range" antes de tombar */
const CUT_H = 0.45;
const CREAK = 0.4;
const REACH = 2.9;
const MAX_LOGS = 260;
const ON_FOOT_CAP = 4;

interface VDef {
  name: () => string;
  speed: number;
  acc: number;
  turn: number;
  cap: number;
  reach: number;
  camD: number;
  camH: number;
  paint: string;
  /** esteiras: gira parado */
  tracks?: boolean;
  use: () => string;
}
export const VDEFS: VDef[] = [
  { name: () => t('floresta.wv.0', 'Quadriciclo'), speed: 17, acc: 14, turn: 2.2, cap: 4, reach: 2.2, camD: 6, camH: 2.6, paint: '#ff4f6a', use: () => t('floresta.wu.boost', 'Turbo') },
  { name: () => t('floresta.wv.1', 'Trator com Reboque'), speed: 10, acc: 7, turn: 1.6, cap: 16, reach: 3, camD: 9, camH: 3.6, paint: '#3ec05a', use: () => t('floresta.wu.unload', 'Descarregar') },
  { name: () => t('floresta.wv.2', 'Caminhão Toreiro'), speed: 14, acc: 6, turn: 1.1, cap: 30, reach: 3, camD: 11, camH: 4.2, paint: '#3a8aff', use: () => t('floresta.wu.crane', 'Grua') },
  { name: () => t('floresta.wv.3', 'Escavadeira'), speed: 5, acc: 5, turn: 1.3, cap: 0, reach: 0, camD: 9, camH: 4.4, paint: '#ffb02e', tracks: true, use: () => t('floresta.wu.dig', 'Cavar') },
  { name: () => t('floresta.wv.4', 'Trator de Esteira'), speed: 6, acc: 6, turn: 1.2, cap: 0, reach: 0, camD: 9, camH: 4, paint: '#ffcf2e', tracks: true, use: () => t('floresta.wu.level', 'Aplainar') },
  { name: () => t('floresta.wv.5', 'Helicóptero'), speed: 22, acc: 9, turn: 1.5, cap: 6, reach: 4, camD: 12, camH: 4, paint: '#8a5cff', use: () => t('floresta.wu.drop', 'Soltar carga') },
  { name: () => t('floresta.wv.6', 'Barco'), speed: 12, acc: 6, turn: 1.4, cap: 8, reach: 3, camD: 8, camH: 3, paint: '#ff8a3a', use: () => t('floresta.wu.horn', 'Buzina') },
  { name: () => t('floresta.wv.7', 'Empilhadeira'), speed: 8, acc: 8, turn: 2.2, cap: 10, reach: 2.6, camD: 7, camH: 3.4, paint: '#ffd34a', use: () => t('floresta.wu.lift', 'Erguer') },
];

interface Veh {
  k: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  speed: number;
  vy: number;
  m: WVehModel;
  cargo: number;
  cargoVal: number;
  useT: number;
  armT: number;
  boost: number;
  airT: number;
  box: SBox;
  kin: CANNON.Body;
}
interface Log {
  x: number;
  y: number;
  z: number;
  q: THREE.Quaternion;
  /** corpo físico (null = congelada longe, ou carregada) */
  b: CANNON.Body | null;
  sp: number;
  val: number;
  rest: boolean;
  /** reservada por um ajudante (100+i) / carregada (1) */
  claim: number;
}
interface Fall {
  mesh: THREE.Mesh;
  ref: TreeRef;
  x: number;
  y: number;
  z: number;
  dx: number;
  dz: number;
  ang: number;
  angV: number;
  sp: number;
  rare: number;
  scale: number;
  byPet: boolean;
  /** tempo desde o último estalo (fase de rachar, 0..CREAK) */
  t: number;
  /** já bateu no chão (quique) */
  hit: boolean;
  /** tempo depois do impacto (vira toras ao assentar) */
  settle: number;
  /** ângulo final (deitada no chão, com a inclinação do terreno) */
  angMax: number;
}
interface Tnt {
  o: THREE.Object3D;
  x: number;
  y: number;
  z: number;
  t: number;
}
type PetState = 'follow' | 'stay' | 'wait' | 'goChop' | 'chop' | 'goLog' | 'bring';
interface Pet {
  i: number;
  o: THREE.Group;
  body: THREE.Object3D;
  tool: THREE.Object3D;
  x: number;
  y: number;
  z: number;
  yaw: number;
  st: PetState;
  next: PetState;
  delay: number;
  tree: TreeRef | null;
  log: number;
  carrying: Log | null;
  chopT: number;
  walk: number;
  fetchLeft: number;
}

interface WQ extends StreamQ {
  pr: number;
  shadows: boolean;
  fogMul: number;
  particles: number;
}
function wq(tier: Tier): WQ {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  return [
    { radius: 2, near: 20, deco: 0, lite: true, perFrame: 1, pr: Math.min(dpr, 0.6), shadows: false, fogMul: 0.85, particles: 0.4 },
    { radius: 2, near: 30, deco: 0.4, lite: true, perFrame: 1, pr: Math.min(dpr, 0.75), shadows: false, fogMul: 0.95, particles: 0.6 },
    { radius: 3, near: 40, deco: 0.8, lite: false, perFrame: 1, pr: Math.min(dpr, 1), shadows: false, fogMul: 1, particles: 0.85 },
    { radius: 4, near: 56, deco: 1, lite: false, perFrame: 1, pr: Math.min(dpr, 1.5), shadows: true, fogMul: 1, particles: 1 },
  ][tier];
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const _fog = new THREE.Color();
const _top = new THREE.Color();
const _buoy = new CANNON.Vec3();
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const damp = (k: number, dt: number) => 1 - Math.exp(-k * dt);
const angDiff = (a: number, b: number) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

export interface WorldOpts {
  tier: Tier;
  exit: () => void;
  /** modo sandbox (sobrevivência/criação); sem isso, o modo clássico de lenhador */
  mode?: GameMode;
  /** save a usar (multi-mundos); sem isso, o save antigo único */
  save?: WorldSave;
  onSave?: (s: WorldSave) => void;
  /** sessão online */
  net?: import('./net').NetSession;
}

export class WorldGame {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  world: World;
  save: WorldSave;
  hud: WorldHud;
  q: WQ;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  /** céu em degradê (topo do bioma → horizonte = neblina) */
  private sky: SkyDome;
  /** folhas voando (corte de árvore) */
  private leaves: LeafBurst;
  private skyTop = new THREE.Color(0x6ab8f0);
  private raf = 0;
  private last = 0;
  private paused = false;
  private destroyed = false;
  private offs: (() => void)[] = [];

  // jogador
  px = 0;
  py = 0;
  pz = 0;
  vy = 0;
  yaw = 0;
  pitch = -0.1;
  tYaw = 0;
  tPitch = -0.1;
  private walkT = 0;
  tool = 0;
  swing = 0;
  swingCd = 0;
  carry = 0;
  carryVal = 0;
  private ore = 0;
  hand: THREE.Group;
  handMesh: THREE.Mesh;
  arm: Forearm;
  tools: THREE.Object3D[] = [];
  driving = -1;
  private camYawOff = 0;
  private camIdle = 0;
  private camBlocked = 0;

  vehs: Veh[] = [];
  logs: Log[] = [];
  /** toras só de desenho (caçamba de veículo simulado em outro aparelho) */
  ghostLogs: { x: number; y: number; z: number; q: THREE.Quaternion; sp: number }[] = [];
  private logMesh: THREE.InstancedMesh;
  private cargoMesh: THREE.InstancedMesh;
  private falls: Fall[] = [];
  tnts: Tnt[] = [];
  tntCd = 0;
  pets: Pet[] = [];
  private petFollow = true;
  private chopHp = new Map<string, number>();
  aimTree: TreeRef | null = null;
  private marker: THREE.Mesh;

  // partículas
  private pPos: Float32Array;
  private pCol: Float32Array;
  private pVel: Float32Array;
  private pLife: Float32Array;
  private pGeo: THREE.BufferGeometry;
  private pN = 0;

  phys: Phys;
  sb: Sandbox | null = null;
  introPending = false;
  /** cena de abertura rodando (trava controles) */
  cine: ((dt: number) => boolean) | null = null;
  held: Log | null = null;
  aimLog: Log | null = null;
  private pBody: CANNON.Body;
  private mv: MoveOut = { ground: -Infinity, hit: false };
  private _pp = { x: 0, z: 0 };
  onGround = true;
  private lantern: THREE.PointLight;
  under = 0;
  private biome = -1;
  private biomeT = 0;
  private saveT = 0;
  private earned = 0;
  private trees = 0;
  time = 0;
  private skyT = 0;

  constructor(
    readonly root: HTMLElement,
    readonly opts: WorldOpts,
  ) {
    this.save = opts.save ?? loadWorld();
    this.save.solo = forestSolo();
    this.q = wq(opts.tier);
    const r = new THREE.WebGLRenderer({ antialias: opts.tier >= 2, powerPreference: 'high-performance' });
    r.setPixelRatio(this.q.pr);
    r.setSize(root.clientWidth || window.innerWidth, root.clientHeight || window.innerHeight);
    r.shadowMap.enabled = this.q.shadows;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.domElement.className = 'fl-canvas';
    root.appendChild(r.domElement);
    this.renderer = r;
    natureAnisotropy(r);
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 400);
    this.scene.add(this.camera);
    this.scene.fog = new THREE.Fog(0xcfeaf2, 30, 120);
    this.scene.background = new THREE.Color(0xcfeaf2);

    // luz quente: céu azulado em cima, rebatida esverdeada/terra embaixo, sol dourado
    this.hemi = new THREE.HemisphereLight(0xdff4ff, 0x5e6a34, 1.25);
    this.scene.add(this.hemi);
    this.sky = new SkyDome();
    this.scene.add(this.sky.mesh);
    this.leaves = new LeafBurst(this.scene, 220);
    this.sun = new THREE.DirectionalLight(0xfff0d0, 1.75);
    this.sun.castShadow = this.q.shadows;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -36;
    sc.right = sc.top = 36;
    sc.near = 1;
    sc.far = 140;
    this.sun.shadow.bias = -0.0015;
    this.scene.add(this.sun, this.sun.target);

    this.world = new World(this.scene, this.save, this.q, opts.tier);
    this.leaves.ground = (x, z) => this.world.heightAt(x, z);
    this.world.onCampLoad = (c, ch) => this.buildCamp(c, ch);
    this.phys = new Phys();
    this.world.vox.phys = this.phys;
    this.world.vox.budgetMs = [2, 3, 4, 6][opts.tier];
    this.world.vox.natR = opts.tier <= 1 ? 1 : 2;
    this.world.onUnload = (c) => this.phys.forgetChunk(c);
    this.world.vox.onEditChunk = (c) => {
      this.phys.touchChunk(c);
      this.world.grassDirty(c);
    };
    this.pBody = this.phys.kinBox(1, 0.32, 0.85, 0.32);
    this.lantern = new THREE.PointLight(0xffd8a0, 0, 20, 1.6);
    this.camera.add(this.lantern);

    const lg = looseLogGeometry();
    const lm = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.logMesh = new THREE.InstancedMesh(lg, lm, MAX_LOGS);
    this.logMesh.count = 0;
    this.logMesh.frustumCulled = false;
    this.logMesh.setColorAt(0, _c.set('#fff'));
    this.scene.add(this.logMesh);
    this.cargoMesh = new THREE.InstancedMesh(lg, lm, 160);
    this.cargoMesh.count = 0;
    this.cargoMesh.frustumCulled = false;
    this.cargoMesh.setColorAt(0, _c.set('#fff'));
    this.scene.add(this.cargoMesh);

    const mk = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.08, 6, 20), new THREE.MeshBasicMaterial({ color: 0xffd34a, fog: false }));
    mk.rotation.x = -Math.PI / 2;
    mk.visible = false;
    this.marker = mk;
    this.scene.add(mk);

    // partículas
    const NP = 400;
    this.pPos = new Float32Array(NP * 3);
    this.pCol = new Float32Array(NP * 3);
    this.pVel = new Float32Array(NP * 3);
    this.pLife = new Float32Array(NP);
    this.pGeo = new THREE.BufferGeometry();
    this.pGeo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    this.pGeo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    const pts = new THREE.Points(this.pGeo, new THREE.PointsMaterial({ size: 0.22, vertexColors: true }));
    pts.frustumCulled = false;
    this.scene.add(pts);

    // mão + ferramentas
    this.hand = new THREE.Group();
    this.camera.add(this.hand);
    const axe = toolModel('axe', 1, '#e0e8f4').g;
    const sh = shovelModel();
    const tn = tntModel();
    for (const o of [axe, sh, tn]) {
      o.traverse((m) => {
        if ((m as THREE.Mesh).isMesh) {
          (m as THREE.Mesh).renderOrder = 10;
          const mm = (m as THREE.Mesh).material as THREE.MeshLambertMaterial;
          mm.depthTest = false;
          mm.fog = false;
        }
      });
      this.hand.add(o);
      this.tools.push(o);
    }
    tn.scale.setScalar(0.8);
    // mão do Bloop + antebraço que sai da borda (mesmo estilo do 3D clássico)
    const col = myHandColors();
    const hm = new THREE.MeshBasicMaterial({ map: handTexture(col), transparent: true, alphaTest: 0.05, depthTest: false, toneMapped: false, fog: false });
    this.handMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), hm);
    this.handMesh.renderOrder = 11;
    this.camera.add(this.handMesh);
    this.arm = new Forearm(col, 1, 9, 0.05);
    this.camera.add(this.arm.mesh);

    this.px = this.save.px;
    this.pz = this.save.pz;
    this.yaw = this.tYaw = this.save.yaw;
    // primeira carga síncrona em volta do jogador
    const pf = this.q.perFrame;
    this.q.perFrame = 25;
    this.world.update(this.px, this.pz, 0);
    this.q.perFrame = pf;
    this.py = this.world.heightAt(this.px, this.pz);
    this.spawnVehicles();
    this.spawnPets();

    this.hud = new WorldHud(root, (a) => this.act(a));
    this.hud.set('tool', this.toolIcon(), true);
    if (opts.mode) {
      this.sb = new Sandbox(this, root, opts.mode);
      const fresh = !this.sb.load(this.save.sb);
      this.applyOwned();
      if (fresh) {
        this.sb.starter();
        if (!this.save.vehPlaced && !opts.net) this.introPending = true;
      }
      if (opts.net) {
        opts.net.attach(this);
        // minijogos não ganham carrinho (atrapalha lotes/esconderijos)
        if (!this.save.vehPlaced && !opts.net.meta?.mini) {
          this.save.vehPlaced = true;
          this.save.veh.owned = [];
          this.sb.starterVehicle(this.px + 4, this.pz + 3, this.yaw);
          this.applyOwned();
        }
        this.hud.addNet(() => void import('./net').then((n) => n.inviteFriends(opts.net!, root)));
        void import('./mini').then((mm) => mm.startMini(this, opts.net!));
      }
      this.hud.el.classList.add('fw-sandbox');
      this.hud.onHotkey = (i) => this.sb?.select(i);
    }
    this.refreshPetsUi();
    this.resize();
    const ro = () => this.resize();
    window.addEventListener('resize', ro);
    this.offs.push(() => window.removeEventListener('resize', ro));
    if (location.search.includes('debug')) (window as any).__forest = this;
    if (this.introPending) {
      this.introPending = false;
      playIntro(this);
    } else this.hud.toast(this.sb ? t('mundo.hello', 'Bem-vindo de volta!') : t('floresta.w.hello', 'Mundo aberto! Explore, corte e cave.'));
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  /* ------------------------------ montagem ------------------------------ */

  private buildCamp(c: Camp, ch: Chunk): THREE.Object3D {
    const g = new THREE.Group();
    const y = ch.hAt(c.x - ch.x0, c.z - ch.z0);
    g.position.set(c.x, y, c.z);
    const box = (w: number, h: number, d: number, col: string, x: number, yy: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lambert(col));
      m.position.set(x, yy, z);
      m.castShadow = true;
      g.add(m);
      return m;
    };
    // cabana
    box(5, 3, 4, '#c88a4a', -4, 1.5, 0);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.2, 2, 4), lambert('#ff6a4a'));
    roof.position.set(-4, 4, 0);
    roof.rotation.y = Math.PI / 4;
    g.add(roof);
    box(1.1, 2, 0.1, '#6a3a1a', -4, 1, 2.02);
    // bancada da serraria com serra
    box(4, 1, 1.6, '#a86a3a', 3, 0.5, 0);
    const saw = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.05, 16), lambert('#d0d8e8'));
    saw.rotation.x = Math.PI / 2;
    saw.position.set(3, 1.1, 0);
    g.add(saw);
    // placa
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 96;
    const x = cv.getContext('2d')!;
    x.fillStyle = '#fff6d6';
    x.fillRect(0, 0, 256, 96);
    x.strokeStyle = '#2a0b5c';
    x.lineWidth = 8;
    x.strokeRect(4, 4, 248, 88);
    x.fillStyle = '#2a0b5c';
    x.font = 'bold 40px sans-serif';
    x.textAlign = 'center';
    x.fillText(t('floresta.w.mill', 'SERRARIA'), 128, 62);
    const tex = new THREE.CanvasTexture(cv);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.1), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    sign.position.set(3, 3.2, 0);
    g.add(sign);
    for (const s of [-1, 1]) box(0.15, 2.6, 0.15, '#6a3a1a', 3 + s * 1.3, 1.6, 0);
    // pilha de toras
    for (let i = 0; i < 5; i++) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.4, 8), lambert('#9a6a3c'));
      l.rotation.x = Math.PI / 2;
      l.position.set(7 + (i % 3) * 0.62 + (i >= 3 ? 0.31 : 0), 0.3 + (i >= 3 ? 0.52 : 0), 0);
      g.add(l);
    }
    // colisão: cabana, bancada, toras
    const S = this.world.solids;
    g.userData.boxes = [
      S.add(S.makeBox(c.x - 4, c.z, y - 1, y + 4.6, 2.55, 2.05, 0)),
      S.add(S.makeBox(c.x + 3, c.z, y - 1, y + 1.05, 2.05, 0.85, 0)),
      S.add(S.makeBox(c.x + 7.6, c.z, y - 1, y + 1.1, 1, 1.25, 0)),
      S.add(S.makeBox(c.x + 1.7, c.z, y - 1, y + 2.9, 0.12, 0.12, 0)),
      S.add(S.makeBox(c.x + 4.3, c.z, y - 1, y + 2.9, 0.12, 0.12, 0)),
    ];
    return g;
  }

  private spawnVehicles(): void {
    const sp = this.save.veh.pos;
    for (let k = 0; k < VDEFS.length; k++) {
      const m = wVehicleModel(k, VDEFS[k].paint);
      this.scene.add(m.g);
      const box = this.world.solids.makeBox(0, 0, 0, 2, m.len * 0.48, m.wid * 0.48, 0, 100 + k);
      this.world.solids.dyn.push(box);
      const kin = this.phys.kinBox(100 + k, m.len * 0.46, 0.55, m.wid * 0.46);
      const v: Veh = { k, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, speed: 0, vy: 0, m, cargo: 0, cargoVal: 0, useT: 0, armT: 0, boost: 0, airT: 0, box, kin };
      const p = sp[k];
      if (p && p.length >= 4) {
        v.x = p[0];
        v.z = p[1];
        v.yaw = p[2];
        v.cargo = p[3] | 0;
        v.cargoVal = p[4] ?? 0;
        v.y = this.world.heightAt(v.x, v.z);
      } else {
        // garagem ao lado do acampamento inicial
        v.x = -18 + k * 5.2;
        v.z = 46;
        v.yaw = Math.PI / 2;
        if (k === VK.Boat) {
          const w = this.findWater(this.px, this.pz);
          v.x = w[0];
          v.z = w[1];
        }
        v.y = this.world.heightAt(v.x, v.z);
      }
      if (k === VK.Boat) v.y = Math.max(v.y, WATER_Y - 0.15);
      this.vehs.push(v);
      this.placeVeh(v, 1);
    }
  }

  /** sobrevivência: só aparecem os veículos montados (o quadriciclo é o carrinho inicial) */
  applyOwned(): void {
    for (const v of this.vehs) {
      const on = !this.sb || this.save.veh.owned.includes(v.k);
      v.m.g.visible = on;
      v.box.off = !on;
      if (!on) this.phys.moveKin(v.kin, 0, -9999, 0, 0, 0, 0, 0);
    }
  }

  private findWater(x: number, z: number): [number, number] {
    const g = this.world.gen;
    for (let r = 20; r < 700; r += 12)
      for (let a = 0; a < TAU; a += 0.35) {
        const wx = x + Math.cos(a) * r;
        const wz = z + Math.sin(a) * r;
        if (g.height(wx, wz) < WATER_Y - 1.6) return [wx, wz];
      }
    return [x + 10, z + 20];
  }

  private spawnPets(): void {
    const cols = ['#ffb347', '#7ad0ff', '#ff8ad0'];
    for (let i = 0; i < 3; i++) {
      const m = petModel(cols[i]);
      m.tool.visible = false;
      this.scene.add(m.g);
      const p: Pet = { i, o: m.g, body: m.body, tool: m.tool, x: this.px - 2 + i * 2, y: 0, z: this.pz + 3, yaw: 0, st: 'follow', next: 'follow', delay: 0, tree: null, log: -1, carrying: null, chopT: 0, walk: 0, fetchLeft: 0 };
      p.y = this.world.heightAt(p.x, p.z);
      this.pets.push(p);
    }
    this.applySolo();
  }

  private applySolo(): void {
    const n = this.save.solo ? 0 : Math.max(0, Math.min(3, this.save.pets));
    for (const p of this.pets) {
      const on = p.i < n;
      p.o.visible = on;
      if (!on) this.resetPet(p);
    }
  }
  private activePets(): Pet[] {
    return this.pets.filter((p) => p.o.visible);
  }

  /* ------------------------------ ações ------------------------------ */

  private act(a: WAct): void {
    audio.click();
    if (a === 'exit') return this.exit();
    if (a === 'tool') {
      if (this.driving >= 0) return;
      this.tool = (this.tool + 1) % 3;
      this.hud.set('tool', this.toolIcon(), true);
      this.hud.toast([t('floresta.w.axe', 'Machado'), t('floresta.w.shovel', 'Pá: cave buracos'), t('floresta.w.tnt', 'Dinamite: crateras!')][this.tool]);
      return;
    }
    if (a === 'veh') return this.toggleVehicle();
    if (a === 'grab') return this.grab();
    if (a === 'inv') return this.sb?.openInv();
    if (a === 'sell') return this.sell();
    if (a === 'pets') {
      if (this.save.solo) {
        this.hud.cmdOpen(true);
        return;
      }
      this.hud.cmdOpen();
      return;
    }
    if (a === 'solo') {
      this.save.solo = !this.save.solo;
      setForestSolo(this.save.solo);
      this.applySolo();
      this.refreshPetsUi();
      this.hud.toast(this.save.solo ? t('floresta.w.soloOn', 'Jogando sozinho: ajudantes descansando') : t('floresta.w.soloOff', 'Ajudantes de volta!'));
      return;
    }
    if (this.save.solo) {
      this.hud.toast(t('floresta.w.soloHint', 'Desative "Jogar sozinho" para mandar nos ajudantes'));
      return;
    }
    if (a === 'cmdChop') this.cmdChop();
    else if (a === 'cmdFetch') this.cmdFetch();
    else if (a === 'cmdFollow') {
      this.petFollow = !this.petFollow;
      for (const p of this.activePets()) this.order(p, this.petFollow ? 'follow' : 'stay');
      this.refreshPetsUi();
      this.hud.toast(this.petFollow ? t('floresta.w.follow', 'Ajudantes seguindo você') : t('floresta.w.stay', 'Ajudantes esperando aqui'));
    }
    this.hud.cmdOpen(false);
  }

  private refreshPetsUi(): void {
    this.hud.set('follow', this.petFollow ? t('floresta.w.cmdStay', 'Ficar') : t('floresta.w.cmdFollow', 'Seguir'));
    this.hud.set('solo', this.save.solo ? t('floresta.w.soloBack', 'Chamar ajudantes') : t('floresta.w.solo', 'Jogar sozinho (sem ajudantes)'));
  }

  private toolIcon(): string {
    return [flIcon('axe', 30), WICONS.shovel, WICONS.tnt][this.tool];
  }

  private order(p: Pet, st: PetState): void {
    // ajudantes respondem com um pequeno atraso (ouvem, pensam, vão)
    p.next = st;
    p.st = 'wait';
    p.delay = 0.6 + p.i * 0.35 + Math.random() * 0.3;
  }
  private resetPet(p: Pet): void {
    if (p.carrying) {
      p.carrying.claim = 0;
      p.carrying = null;
    }
    if (p.tree) this.petTrees.delete(this.world.treeKey(p.tree));
    p.tree = null;
    p.st = 'follow';
  }
  private petTrees = new Set<string>();

  private cmdChop(): void {
    const pets = this.activePets();
    if (!pets.length) return;
    // árvore na mira; senão a mais perto de você
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const base = this.world.treeNear(this.px + fx * 8, this.pz + fz * 8, 16) ?? this.world.treeNear(this.px, this.pz, 25);
    if (!base) {
      this.hud.toast(t('floresta.w.noTree', 'Nenhuma árvore por perto'));
      return;
    }
    const bp = this.world.treePos(base, new THREE.Vector3());
    let n = 0;
    for (const p of pets) {
      this.resetPet(p);
      let tr: TreeRef | null = null;
      // cada ajudante pega uma árvore diferente perto da escolhida
      for (let r = 2; r <= 14 && !tr; r += 4) {
        const cand = this.world.treesInRadius(bp.x, bp.z, r);
        tr = cand.find((c) => !this.petTrees.has(this.world.treeKey(c)) && !this.world.hidden.has(this.world.treeKey(c))) ?? null;
      }
      if (!tr) continue;
      p.tree = tr;
      this.petTrees.add(this.world.treeKey(tr));
      this.order(p, 'goChop');
      n++;
    }
    this.marker.visible = true;
    this.marker.position.set(bp.x, bp.y + 0.15, bp.z);
    this.markerT = 2;
    this.hud.toast(n ? t('floresta.w.chopOrder', 'Ajudantes: "Vamos cortar!"') : t('floresta.w.busy', 'Ajudantes ocupados'));
  }
  private markerT = 0;

  private cmdFetch(): void {
    const pets = this.activePets();
    let any = false;
    for (const l of this.logs) if (l.claim === 0 && (l.x - this.px) ** 2 + (l.z - this.pz) ** 2 < 30 * 30) any = true;
    if (!any) {
      this.hud.toast(t('floresta.w.noLogs', 'Nenhuma tora solta por perto'));
      return;
    }
    for (const p of pets) {
      this.resetPet(p);
      p.fetchLeft = 4;
      this.order(p, 'goLog');
    }
    this.hud.toast(t('floresta.w.fetchOrder', 'Ajudantes: "Já trazemos!"'));
  }

  nearVeh(): Veh | null {
    let best: Veh | null = null;
    let bd = 4.5 * 4.5;
    for (const v of this.vehs) {
      if (!v.m.g.visible) continue;
      const d = (v.x - this.px) ** 2 + (v.z - this.pz) ** 2 + ((v.y - this.py) * 0.5) ** 2;
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    return best;
  }

  /** módulos (veículos fabricáveis): pontos físicos extras, passos antes/depois da física, toras em caçambas */
  physPts: ((pts: number[]) => void) | null = null;
  prePhys: ((dt: number) => void) | null = null;
  postPhys: ((dt: number) => void) | null = null;
  inCargo: ((b: CANNON.Body) => boolean) | null = null;
  /** veículo fabricável perto (o botão de veículo entra nele) */
  altVehicle: (() => boolean) | null = null;
  altNear: (() => string | null) | null = null;

  toggleVehicle(): void {
    if (this.driving < 0 && !this.nearVeh() && this.altVehicle?.()) return;
    if (this.driving >= 0) {
      const v = this.vehs[this.driving];
      if (v.k === VK.Heli && v.y - Math.max(this.world.waterLevel(v.x, v.z), this.world.heightAt(v.x, v.z)) > 2.5) {
        this.hud.toast(t('floresta.w.landFirst', 'Pouse antes de sair'));
        return;
      }
      this.driving = -1;
      // sai pelo lado esquerdo
      const lx = v.x - Math.sin(v.yaw) * (v.m.wid * 0.5 + 1.2);
      const lz = v.z - Math.cos(v.yaw) * (v.m.wid * 0.5 + 1.2);
      this.px = lx;
      this.pz = lz;
      this.py = this.world.floorAt(lx, v.y + 1.5, lz);
      this.vy = 0;
      this.tYaw = this.yaw = v.yaw - Math.PI / 2;
      this.tPitch = this.pitch = -0.15;
      v.speed = 0;
      this.hand.visible = this.handMesh.visible = this.arm.mesh.visible = true;
      this.hud.toast(t('floresta.w.exitVeh', 'Saiu do veículo'));
      return;
    }
    const v = this.nearVeh();
    if (!v) return;
    this.driving = this.vehs.indexOf(v);
    this.hand.visible = this.handMesh.visible = this.arm.mesh.visible = false;
    this.camYawOff = 0;
    // descarrega na caçamba o que estiver carregando
    if (this.carry && VDEFS[v.k].cap) {
      const n = Math.min(this.carry, VDEFS[v.k].cap - v.cargo);
      const per = this.carryVal / this.carry;
      v.cargo += n;
      v.cargoVal += per * n;
      this.carry -= n;
      this.carryVal -= per * n;
    }
    this.hud.toast(VDEFS[v.k].name());
    tap('light');
  }

  private campNear(r: number): Camp | null {
    return this.world.gen.nearestCamp(this.cx(), this.cz(), r);
  }
  private cx(): number {
    return this.driving >= 0 ? this.vehs[this.driving].x : this.px;
  }
  private cz(): number {
    return this.driving >= 0 ? this.vehs[this.driving].z : this.pz;
  }

  private sell(): void {
    if (!this.campNear(16)) return;
    if (this.held) {
      this.carry++;
      this.carryVal += this.held.val;
      this.removeLog(this.held);
    }
    let v = this.carryVal + this.ore;
    let n = this.carry;
    this.carry = 0;
    this.carryVal = 0;
    this.ore = 0;
    // veículos estacionados perto da serraria também descarregam
    for (const ve of this.vehs) {
      const c = this.world.gen.nearestCamp(ve.x, ve.z, 18);
      if (!c || !ve.cargo) continue;
      const bonus = ve.k === VK.Forklift ? 1.25 : 1;
      v += ve.cargoVal * bonus;
      n += ve.cargo;
      ve.cargo = 0;
      ve.cargoVal = 0;
    }
    if (v <= 0) {
      this.hud.toast(t('floresta.w.nothing', 'Nada para vender — traga toras!'));
      return;
    }
    v = Math.round(v);
    this.save.coins += v;
    this.earned += v;
    audio.cash();
    tap('medium');
    this.hud.toast(t('floresta.w.sold', '+{v} bolotas ({n} toras)', { v: short(v), n }), 'gold');
  }

  /** volta para o menu (rede caiu etc.) */
  goHome(): void {
    this.exit();
  }

  exit(): void {
    if (this.paused) return;
    this.paused = true;
    this.persist();
    const coins = this.earned > 0 || this.trees > 0 ? Math.min(300, Math.round(4 + Math.sqrt(this.earned) * 1.2 + this.trees * 0.8)) : 0;
    if (coins > 0) addCoins(coins);
    reportRun({ game: 'floresta', score: Math.round(this.earned), coins, durationSec: Math.round(this.time), stats: { trees: this.trees, planks: 0 } });
    this.opts.exit();
  }

  /* ------------------------------ laço ------------------------------ */

  private loop = (now: number): void => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    const el = now - this.last;
    this.last = now;
    if (this.paused) return;
    const dt = Math.min(0.05, el / 1000);
    const w0 = performance.now();
    this.step(dt);
    this.renderer.render(this.scene, this.camera);
    this.onSample?.(el, performance.now() - w0);
  };
  onSample: ((frameMs: number, workMs: number) => void) | null = null;

  step(dt: number): void {
    this.time += dt;
    windTime.value = this.time;
    natureTick(dt);
    const c = this.hud.ctl;
    // olhar suavizado (alvo ← dedo; câmera persegue o alvo)
    // o módulo compartilhado já suaviza (sub-quadro, sem atraso de lerp)
    const [ldx, ldy] = this.hud.poll(dt);
    void c;
    if (this.driving >= 0) {
      this.camYawOff = clamp(this.camYawOff - ldx, -2.6, 2.6);
      this.tPitch = clamp(this.tPitch - ldy * 0.8, -0.9, 0.4);
      if (ldx || ldy) this.camIdle = 0;
      else this.camIdle += dt;
      if (this.camIdle > 1.6) this.camYawOff *= 1 - damp(2, dt);
    } else {
      this.tYaw -= ldx;
      this.tPitch = clamp(this.tPitch - ldy, -1.3, 1.2);
    }
    this.yaw = this.tYaw;
    this.pitch = this.tPitch;

    if (this.cine) {
      if (!this.cine(dt)) this.cine = null;
    } else if (this.driving >= 0) this.drive(dt);
    else if (this.sb?.mm?.riding) this.poseHand(dt, 0);
    else if (this.sb?.vm.driving) this.sb.driveTick(dt);
    else if (this.sb?.carts.riding) {
      this.sb.carts.ride(this);
      this.poseHand(dt, 0);
    } else this.walk(dt);
    for (const v of this.vehs) if (this.vehs.indexOf(v) !== this.driving && v.m.g.visible) this.idleVeh(v, dt);

    // quem amassa a grama: o jogador a pé ou o veículo dirigido
    const pv = this.driving >= 0 ? this.vehs[this.driving] : null;
    this.world.push.x = pv ? pv.x : this.px;
    this.world.push.z = pv ? pv.z : this.pz;
    this.world.push.r = pv ? 2.6 : 0.75;
    this.world.update(this.cx(), this.cz(), dt);
    this.world.vox.update(this.cx(), this.driving >= 0 ? this.vehs[this.driving].y : this.py, this.cz(), dt);
    this.stepFalls(dt);
    this.leaves.update(dt);
    this.stepLogs(dt);
    this.stepTnt(dt);
    this.stepPets(dt);
    this.stepParticles(dt);
    this.camera.updateMatrixWorld();
    this.updateSky(dt);
    this.sb?.update(dt);
    this.updateDome();
    this.updateHud(dt);
    if (this.markerT > 0) {
      this.markerT -= dt;
      this.marker.rotation.z += dt * 2;
      if (this.markerT <= 0) this.marker.visible = false;
    }
    this.saveT += dt;
    if (this.saveT > 8) {
      this.saveT = 0;
      this.persist();
    }
  }

  /* ------------------------------ a pé ------------------------------ */

  private walk(dt: number): void {
    const c = this.hud.ctl;
    const W = this.world;
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    const wl = W.waterLevel(this.px, this.pz);
    const swim = this.py < wl - 1.0;
    const fl = W.vox.matAt(this.px, this.py + 0.7, this.pz);
    const inAq = fl === VM.Agua;
    const inLava = fl === VM.Lava;
    const sp = (swim || inAq ? 3 : 6.2) * (this.held ? 0.85 : 1) * (this.sb?.slowed ? 0.55 : 1);
    let mx = rx * c.mx + fx * -c.my;
    let mz = rz * c.mx + fz * -c.my;
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }
    // horizontal em passos curtos (não atravessa paredes finas)
    const total = sp * dt * Math.min(1, len);
    const n = Math.max(1, Math.ceil(total / 0.25));
    const p = this._pp;
    for (let k = 0; k < n; k++) {
      const dx = (mx * sp * dt) / n;
      const dz = (mz * sp * dt) / n;
      if (!dx && !dz) break;
      if (!this.blocked(this.px + dx, this.pz + dz, dx, dz)) {
        this.px += dx;
        this.pz += dz;
      } else if (!this.blocked(this.px + dx, this.pz, dx, 0)) this.px += dx;
      else if (!this.blocked(this.px, this.pz + dz, 0, dz)) this.pz += dz;
    }
    p.x = this.px;
    p.z = this.pz;
    W.pushOutTrees(p, 0.38, this.py);
    W.solids.resolve(p, this.py, 1.75, 0.38, 0.55, this.mv);
    // empurrões não podem enfiar o jogador na parede
    if (!this.blocked(p.x, p.z, 0, 0)) {
      this.px = p.x;
      this.pz = p.z;
    }
    // vertical
    const tf = Math.max(W.terrainFloor(this.px, this.py + 0.6, this.pz), W.extraFloor ? W.extraFloor(this.px, this.py + 0.6, this.pz) : -Infinity);
    const bf = this.mv.ground;
    let floor = tf > bf ? tf : bf;
    if (swim) floor = Math.max(floor, wl - 1.25);
    if (inAq || inLava) {
      this.vy += (c.up || c.jump ? 4 : -1.2 - this.vy) * dt * 3;
    } else this.vy -= 22 * dt;
    if (this.vy > 0 && (W.vox.dens(this.px, this.py + 1.85 + this.vy * dt, this.pz) > 0 || W.extraSolid?.(this.px, this.py + 1.85 + this.vy * dt, this.pz))) this.vy = 0;
    if (this.vy > 0 && W.solids.ceiling(this.px, this.pz, this.py + 1.0, 0.3) < this.py + 1.85) this.vy = 0;
    this.py += this.vy * dt;
    this.onGround = false;
    if (this.py <= floor) {
      // degrau: sobe suave (sem teleporte visível)
      const up = floor - this.py;
      this.py = up > 0.05 ? this.py + Math.min(up, Math.max(0.12, up * 0.5)) : floor;
      if (this.py > floor) this.py = floor;
      if (this.vy < 0) this.vy = 0;
      this.onGround = true;
    }
    if (this.py < BED_Y - 4) {
      // caiu do mundo (não deveria): volta para a superfície
      this.py = W.heightAt(this.px, this.pz) + 1;
      this.vy = 0;
    }
    if ((c.jump || (swim && c.up)) && (this.onGround || swim)) this.vy = swim ? 3.5 : 7.2;
    if (inLava) this.hurt?.(dt * 18, 'lava');
    this.walkT += len * dt * 9;
    const eye = this.py + EYE + Math.sin(this.walkT) * 0.05 * Math.min(1, len);
    this.camera.position.set(this.px, eye, this.pz);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    if (this.camera.fov !== 70) {
      this.camera.fov = 70;
      this.camera.updateProjectionMatrix();
    }
    this.useTool(dt);
    this.poseHand(dt, len);
    this.phys.moveKin(this.pBody, this.px, this.py + 0.9, this.pz, this.yaw, 0, 0, dt);
  }
  /** dano (sobrevivência liga isso) */
  hurt: ((n: number, why: string) => void) | null = null;
  /** dirigindo/montado: o corpo físico do jogador sai do caminho (não segura o veículo) */
  stowBody(): void {
    this.pBody.velocity.set(0, 0, 0);
    this.pBody.position.set(this.px, -9999, this.pz);
    this.pBody.aabbNeedsUpdate = true;
  }

  /** parede/terreno íngreme ou sólido na altura do corpo em (x,z)? */
  private blocked(x: number, z: number, dx: number, dz: number): boolean {
    const W = this.world;
    const d = Math.hypot(dx, dz);
    const ox = d > 0 ? (dx / d) * 0.32 : 0;
    const oz = d > 0 ? (dz / d) * 0.32 : 0;
    const y = this.py;
    for (const h of [0.62, 1.15, 1.7]) if (W.vox.dens(x + ox, y + h, z + oz) > 0 || W.extraSolid?.(x + ox, y + h, z + oz)) return true;
    // rampa íngreme demais (≈ 55°) num passo
    if (d > 0) {
      const f = W.terrainFloor(x + ox, y + 0.6, z + oz);
      if (f - y > 0.55 + d * 1.4 && f - y < 2) return true;
    }
    return false;
  }

  private useTool(dt: number): void {
    const c = this.hud.ctl;
    this.swingCd -= dt;
    this.tntCd -= dt;
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    this.aimTree = this.tool === 0 && !this.held ? this.world.treeNear(this.px + fx * 0.6, this.pz + fz * 0.6, REACH, fx, fz, 0.55) : null;
    this.aimLog = this.held ? null : this.findAimLog();
    if (this.sb) {
      // sobrevivência: a mira de árvore vale para qualquer item que não seja peça
      const it = ITEM.get(this.sb.held());
      this.aimTree = !this.held && !it?.place ? this.world.treeNear(this.px + fx * 0.6, this.pz + fz * 0.6, REACH, fx, fz, 0.55) : null;
      return;
    }
    if (!c.use || this.swingCd > 0 || this.held) return;
    if (this.tool === 0) {
      this.swingCd = 0.42;
      this.swing = 1;
      const tr = this.aimTree;
      if (tr) this.hitTree(tr, 2.6, false);
      else audio.click();
    } else if (this.tool === 1) {
      this.swingCd = 0.45;
      this.swing = 1;
      this.mineAim(1.25, 2, false);
    } else if (this.tntCd <= 0) {
      this.swingCd = 0.6;
      this.tntCd = 2.5;
      const hit = this.aimPoint(4);
      const x = hit ? hit[0] : this.px + fx * 2.2;
      const z = hit ? hit[2] : this.pz + fz * 2.2;
      const o = tntModel();
      o.scale.setScalar(1.6);
      const y = hit ? hit[1] : this.world.floorAt(x, this.py + 1, z);
      o.position.set(x, y, z);
      this.scene.add(o);
      this.tnts.push({ o, x, y, z, t: 2.2 });
      this.hud.toast(t('floresta.w.tntRun', 'Dinamite acesa! Afaste-se!'), 'warn');
      tap('light');
    }
  }

  /** ponto do terreno na mira (olho → frente), ou null */
  aimPoint(max: number): [number, number, number] | null {
    const cp = this.camera.position;
    this.camera.getWorldDirection(_v);
    const d = this.world.vox.ray(cp.x, cp.y, cp.z, _v.x, _v.y, _v.z, max);
    if (d < 0) return null;
    return [cp.x + _v.x * d, cp.y + _v.y * d, cp.z + _v.z * d];
  }

  /** cava onde se mira; devolve materiais retirados */
  mineAim(r: number, hard: number, machine: boolean): Map<number, number> | null {
    const hit = this.aimPoint(REACH + 1.6);
    if (!hit) {
      audio.click();
      return null;
    }
    this.camera.getWorldDirection(_v);
    // centro um pouco para dentro da parede
    return this.carve(hit[0] + _v.x * r * 0.45, hit[1] + _v.y * r * 0.45, hit[2] + _v.z * r * 0.45, r, hard, machine);
  }

  private _counts = new Map<number, number>();
  private _stat = { blocked: 0 };
  /** escava uma esfera no volume (pá, picareta, máquinas, explosões) */
  carve(x: number, y: number, z: number, r: number, hard: number, machine: boolean): Map<number, number> {
    const counts = this._counts;
    counts.clear();
    this._stat.blocked = 0;
    const W = this.world;
    const n = W.vox.edit(x, y, z, r, -1, hard, counts, this._stat);
    if (this._stat.blocked > 0 && n === 0) {
      this.hud.toast(t('mundo.tooHard', 'Duro demais! Precisa de uma picareta melhor'), 'warn');
      audio.click();
      return counts;
    }
    if (n <= 0) return counts;
    this.save.stats.holes++;
    let col = WBIOMES[W.biomeAt(x, z)].dirt;
    let best = 0;
    for (const [m, k] of counts) {
      const mi = MATS[m];
      if (mi && k > best) {
        best = k;
        col = '#' + new THREE.Color(mi.col[0], mi.col[1], mi.col[2]).getHexString();
      }
    }
    this.burst(machine ? 16 : 10, x, y, z, col, 4.5);
    audio.tick(1);
    tap('light');
    this.onMined?.(counts, x, y, z);
    // árvores sem chão tombam
    for (const tr of W.treesInRadius(x, z, r + 1)) {
      const tp = W.treePos(tr, _v2);
      const o = tr.i * 8;
      if (tr.c.trees[o + 1] - tp.y > 0.6) this.startFall(tr, Math.random() - 0.5, Math.random() - 0.5, false);
    }
    return counts;
  }
  /** sobrevivência: recebe o que foi minerado */
  onMined: ((counts: Map<number, number>, x: number, y: number, z: number) => void) | null = null;

  hitTree(tr: TreeRef, dmg: number, pet: boolean): void {
    const k = this.world.treeKey(tr);
    const sp = this.world.treeSp(tr);
    const hp = this.chopHp.get(k) ?? treeHp(sp, this.world.treeRare(tr));
    const nh = hp - dmg;
    const p = this.world.treePos(tr, _v2);
    const s = WSPECIES[sp];
    this.burst(pet ? 3 : 7, p.x, p.y + 1.1, p.z, s.trunk, 3);
    // a copa chacoalha e solta umas folhinhas
    hitTreeShake(p.x, p.z, pet ? 0.5 : 1);
    if (!pet) this.leaves.emit(4, p.x, p.y + s.h * this.world.treeScale(tr) * 0.7, p.z, s.h * 0.2, s.leaf, 1);
    if (!pet) {
      audio.tick(Math.floor(Math.random() * 3));
      tap('light');
      this.shake = Math.max(this.shake, 0.09);
      // lascas claras do miolo + casca
      this.burst(5, p.x, p.y + 1.1, p.z, '#ffe2b0', 3.5);
    }
    if (nh <= 0) {
      this.chopHp.delete(k);
      let dx = p.x - (pet ? p.x + 1 : this.px);
      let dz = p.z - (pet ? p.z : this.pz);
      const d = Math.hypot(dx, dz) || 1;
      dx /= d;
      dz /= d;
      this.startFall(tr, dx, dz, pet);
    } else this.chopHp.set(k, nh);
  }

  startFall(tr: TreeRef, dx: number, dz: number, pet: boolean): void {
    const key = this.world.treeKey(tr);
    if (this.world.hidden.has(key)) return;
    const d = Math.hypot(dx, dz) || 1;
    const sp = this.world.treeSp(tr);
    const p = this.world.treePos(tr, _v2);
    const sc = this.world.treeScale(tr);
    // a árvore cai inteira a partir do corte (o toco fica no chão desde já)
    const mesh = new THREE.Mesh(this.world.treeGeo(sp), this.world.treeMaterial);
    const cg = this.world.treeCards(sp);
    if (cg) mesh.add(new THREE.Mesh(cg, this.world.cardMaterial));
    mesh.scale.setScalar(sc);
    mesh.position.set(p.x, p.y + CUT_H * sc, p.z);
    mesh.castShadow = this.q.shadows;
    this.scene.add(mesh);
    this.world.hidden.add(key);
    this.world.fell(tr);
    this.world.markTreesDirty();
    // ângulo até deitar: 90° menos a subida do terreno à frente
    const len = WSPECIES[sp].h * sc;
    const fx = p.x + (dx / d) * len * 0.6;
    const fz = p.z + (dz / d) * len * 0.6;
    const rise = this.world.heightAt(fx, fz) + 0.5 - (p.y + CUT_H * sc);
    const angMax = Math.PI / 2 - Math.atan2(rise, len * 0.6) * 0.9;
    this.falls.push({ mesh, ref: tr, x: p.x, y: p.y, z: p.z, dx: dx / d, dz: dz / d, ang: 0, angV: 0, sp, rare: this.world.treeRare(tr), scale: sc, byPet: pet, t: 0, hit: false, settle: 0, angMax: Math.min(1.75, Math.max(1.1, angMax)) });
    // estalo: lascas no corte
    this.burst(14, p.x, p.y + CUT_H * sc, p.z, '#ffe2b0', 4.5);
    this.burst(8, p.x, p.y + CUT_H * sc, p.z, WSPECIES[sp].trunk, 3.5);
    hitTreeShake(p.x, p.z, 1.2);
    audio.crack();
    if (!pet) tap('medium');
  }

  stepFalls(dt: number): void {
    for (let i = this.falls.length - 1; i >= 0; i--) {
      const f = this.falls[i];
      const s = WSPECIES[f.sp];
      const len = s.h * f.scale;
      f.t += dt;
      if (f.t < CREAK) {
        // range: tomba um pouquinho e treme antes de ir
        const k = f.t / CREAK;
        f.ang = k * 0.12 + Math.sin(f.t * 38) * 0.02 * (1 - k);
      } else if (!f.hit) {
        // queda com aceleração crescente (ease-in): começa devagar, despenca no fim
        f.angV += dt * (0.9 + Math.sin(f.ang) * 5.5);
        f.ang += f.angV * dt;
        if (f.ang >= f.angMax) {
          f.ang = f.angMax;
          f.angV = -f.angV * 0.22; // quique da copa
          f.hit = true;
          const cx = f.x + f.dx * len * 0.68;
          const cz = f.z + f.dz * len * 0.68;
          const gy = this.world.heightAt(cx, cz);
          this.leaves.emit(this.q.particles >= 0.8 ? 70 : 36, cx, gy + 0.8, cz, len * 0.22, s.leaf, 3.2);
          this.leaves.emit(this.q.particles >= 0.8 ? 30 : 14, cx, gy + 1.2, cz, len * 0.25, s.leaf2, 2.2);
          this.burst(22, cx, gy + 0.4, cz, WBIOMES[this.world.biomeAt(cx, cz)].dirt, 6);
          const dd = Math.hypot(cx - this.px, cz - this.pz);
          this.shake = Math.max(this.shake, Math.max(0, 0.45 - dd * 0.02));
          audio.crack();
          if (dd < 25) tap('heavy');
        }
      } else {
        // quica e assenta
        f.angV += dt * 9;
        f.ang = Math.min(f.angMax, f.ang + f.angV * dt);
        if (f.ang >= f.angMax && f.angV > 0) f.angV = -f.angV * 0.3;
        f.settle += dt;
      }
      // eixo perpendicular à direção da queda (gira em volta do corte)
      _v.set(f.dz, 0, -f.dx);
      f.mesh.quaternion.setFromAxisAngle(_v, f.ang);
      // depois de assentar: a copa se desfaz em folhas e o tronco vira toras
      if (f.settle < 0.55) continue;
      if (f.settle < 0.8) {
        const k = 1 - (f.settle - 0.55) / 0.25;
        f.mesh.scale.setScalar(f.scale * Math.max(0.05, 0.4 + k * 0.6));
        continue;
      }
      this.scene.remove(f.mesh);
      this.world.hidden.delete(this.world.treeKey(f.ref));
      this.petTrees.delete(this.world.treeKey(f.ref));
      const n = s.logs * (f.rare ? 2 : 1);
      const base = f.y + CUT_H * f.scale;
      for (let k = 0; k < n; k++) {
        // toras ao longo do tronco deitado, pulando de leve e rolando
        const t0 = 0.12 + ((k + 0.5) / n) * 0.5;
        const x = f.x + f.dx * len * t0;
        const z = f.z + f.dz * len * t0;
        const y = Math.max(this.world.heightAt(x, z) + 0.45, base + Math.cos(f.angMax) * len * t0);
        this.addLog(x, y, z, f.dz * (Math.random() - 0.5) * 3, 2.5 + Math.random() * 1.5, -f.dx * (Math.random() - 0.5) * 3, f.sp, s.value * (f.rare ? 3 : 1), Math.atan2(-f.dz, f.dx));
      }
      const cx = f.x + f.dx * len * 0.68;
      const cz = f.z + f.dz * len * 0.68;
      this.leaves.emit(this.q.particles >= 0.8 ? 50 : 24, cx, this.world.heightAt(cx, cz) + 0.6, cz, len * 0.25, s.leaf, 2);
      this.burst(18, f.x + f.dx * len * 0.4, base + 0.3, f.z + f.dz * len * 0.4, '#ffe2b0', 5);
      this.trees++;
      this.save.stats.trees++;
      this.save.bookTrees[f.sp] = (this.save.bookTrees[f.sp] ?? 0) + 1;
      audio.crack();
      this.falls.splice(i, 1);
    }
  }

  addLog(x: number, y: number, z: number, vx: number, vy: number, vz: number, sp: number, val: number, yaw = Math.random() * TAU): Log {
    if (this.logs.length >= MAX_LOGS) {
      const o = this.logs.find((l) => !l.claim);
      if (o) this.removeLog(o);
    }
    const b = this.phys.logBody(x, y, z, yaw);
    b.velocity.set(vx, vy, vz);
    const l: Log = { x, y, z, q: new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w), b, sp, val, rest: false, claim: 0 };
    this.logs.push(l);
    return l;
  }

  private stepLogs(dt: number): void {
    const L = this.logs;
    const cx = this.cx();
    const cz = this.cz();
    const far2 = ((this.q.radius + 1) * CH) ** 2;
    const pts = this._pts;
    pts.length = 0;
    pts.push(cx, cz);
    this.holdLog(dt);
    for (let i = L.length - 1; i >= 0; i--) {
      const l = L[i];
      if (l.claim && l.claim !== 1) continue;
      const d2 = (l.x - cx) ** 2 + (l.z - cz) ** 2;
      if (d2 > far2) {
        this.removeLog(l);
        continue;
      }
      const b = l.b;
      if (!b) {
        // congelada: acorda quando o jogador chega perto
        if (d2 < 30 * 30) l.b = this.phys.logBody(l.x, l.y + 0.05, l.z, 0);
        if (l.b) l.b.quaternion.set(l.q.x, l.q.y, l.q.z, l.q.w);
        continue;
      }
      if (b.type === CANNON.Body.DYNAMIC) {
        // água natural: boia e deriva
        const wl = this.world.waterLevel(b.position.x, b.position.z);
        if (b.position.y < wl + 0.05) {
          const sub = Math.min(1, (wl + 0.05 - b.position.y) / (LOG_R * 2));
          b.applyForce(_buoy.set(0.15 * Math.sin(this.time * 0.3 + i), 3 * 20 * 1.6 * sub, 0));
          b.velocity.scale(1 - Math.min(1, dt * 1.6), b.velocity);
          b.wakeUp();
        }
        l.x = b.position.x;
        l.y = b.position.y;
        l.z = b.position.z;
        l.q.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
        l.rest = b.sleepState === CANNON.Body.SLEEPING;
        if (l.y < BED_Y - 8) {
          this.removeLog(l);
          continue;
        }
        if (!l.rest) pts.push(l.x, l.z);
        // longe e parada: congela (sem custo de física)
        if (l.rest && d2 > 40 * 40 && !this.inCargo?.(b)) {
          this.phys.removeBody(b);
          l.b = null;
        }
      }
    }
    this.physPts?.(pts);
    this.phys.syncGround(this.world.chunks, pts, this.time);
    this.phys.syncTrees(this.world.chunks, pts, this.world.hidden, dt);
    for (const v of this.vehs) this.bedLoad(v);
    this.prePhys?.(dt);
    this.phys.step(dt);
    this.postPhys?.(dt);
    let n = 0;
    for (const l of L) {
      if (n >= MAX_LOGS) break;
      if (l.claim && l.claim !== 1) continue;
      _m.compose(_v.set(l.x, l.y, l.z), l.q, _s.set(1, 1, 1));
      this.logMesh.setMatrixAt(n, _m);
      this.logMesh.setColorAt(n, _c.set(WSPECIES[l.sp].trunk));
      n++;
    }
    // toras carregadas pelos ajudantes
    for (const p of this.pets) {
      if (!p.carrying || n >= MAX_LOGS) continue;
      _m.compose(_v.set(p.x, p.y + 1.05, p.z), _q.setFromEuler(_e.set(0, p.yaw + Math.PI / 2, 0)), _s.set(0.7, 0.7, 0.7));
      this.logMesh.setMatrixAt(n, _m);
      this.logMesh.setColorAt(n, _c.set(WSPECIES[p.carrying.sp].trunk));
      n++;
    }
    for (const l of this.ghostLogs) {
      if (n >= MAX_LOGS) break;
      _m.compose(_v.set(l.x, l.y, l.z), l.q, _s.set(1, 1, 1));
      this.logMesh.setMatrixAt(n, _m);
      this.logMesh.setColorAt(n, _c.set(WSPECIES[l.sp]?.trunk ?? '#8a5a3a'));
      n++;
    }
    this.logMesh.count = n;
    this.logMesh.instanceMatrix.needsUpdate = true;
    if (this.logMesh.instanceColor) this.logMesh.instanceColor.needsUpdate = true;
  }
  private _pts: number[] = [];

  /** toras que pararam dentro da caçamba/reboque viram carga (e andam com o veículo) */
  private bedLoad(v: Veh): void {
    const cap = VDEFS[v.k].cap;
    if (!cap || v.cargo >= cap || v.k === VK.Heli || v.k === VK.Boat) return;
    v.m.bed.getWorldPosition(_v2);
    const ca = Math.cos(v.yaw);
    const sa = Math.sin(v.yaw);
    for (let i = this.logs.length - 1; i >= 0 && v.cargo < cap; i--) {
      const l = this.logs[i];
      if (l.claim || !l.b) continue;
      const dx = l.x - _v2.x;
      const dz = l.z - _v2.z;
      const lx = dx * ca - dz * sa;
      const lz = dx * sa + dz * ca;
      if (Math.abs(lx) > v.m.len * 0.3 || Math.abs(lz) > v.m.wid * 0.5 || l.y < _v2.y - 0.4 || l.y > _v2.y + 2.6) continue;
      if (l.b.velocity.lengthSquared() > 9) continue;
      v.cargo++;
      v.cargoVal += l.val;
      this.removeLog(l);
      audio.coin(v.cargo % 6);
      tap('light');
    }
  }

  /** larga a carga como toras físicas (atrás / embaixo) */
  private unloadVeh(v: Veh, bx: number, by: number, bz: number, vx: number, vz: number): void {
    if (!v.cargo) return;
    const per = v.cargoVal / v.cargo;
    for (let i = 0; i < v.cargo; i++) this.addLog(bx + (Math.random() - 0.5) * 1.6, by + i * 0.35, bz + (Math.random() - 0.5) * 1.6, vx, 0, vz, 0, per, v.yaw + Math.PI / 2);
    v.cargo = 0;
    v.cargoVal = 0;
  }

  private stepTnt(dt: number): void {
    for (let i = this.tnts.length - 1; i >= 0; i--) {
      const b = this.tnts[i];
      b.t -= dt;
      b.o.position.y = this.world.floorAt(b.x, b.y + 0.5, b.z);
      b.y = b.o.position.y;
      if (Math.random() < 0.6) this.emit(b.x, b.o.position.y + 0.9, b.z, (Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2, 0.4, '#ffd34a');
      if (b.t > 0) continue;
      this.scene.remove(b.o);
      this.tnts.splice(i, 1);
      this.explode(b.x, b.z, 3.6, 2.6, b.y);
    }
  }

  /** cratera + árvores derrubadas + toras e jogador arremessados */
  explode(x: number, z: number, r: number, depth: number, yy?: number): void {
    const y = yy ?? this.world.floorAt(x, this.py + 2, z);
    this.carve(x, y - depth * 0.3, z, r, 3, true);
    this.save.stats.craters++;
    this.burst(40, x, y + 0.5, z, WBIOMES[this.world.biomeAt(x, z)].dirt, 9);
    this.burst(20, x, y + 0.8, z, '#ffb02e', 7);
    for (const tr of this.world.treesInRadius(x, z, r * 1.5)) {
      const p = this.world.treePos(tr, _v2);
      if (Math.abs(p.y - y) < 6) this.startFall(tr, p.x - x, p.z - z, false);
    }
    for (const l of this.logs) {
      const d = Math.hypot(l.x - x, l.y - y, l.z - z);
      if (d < r * 2 && !l.claim && l.b) {
        const k = 1 - d / (r * 2);
        l.b.wakeUp();
        l.b.velocity.set(((l.x - x) / (d || 1)) * 9 * k, 6 * k + 3, ((l.z - z) / (d || 1)) * 9 * k);
      }
    }
    const pd = Math.hypot(this.cx() - x, this.cz() - z);
    if (this.driving < 0 && pd < r * 1.6) {
      this.vy = 7;
      this.shake = 0.6;
      this.hurt?.(Math.max(0, 6 - pd * 1.2), 'boom');
    } else if (pd < 40) this.shake = 0.35 * (1 - pd / 40);
    this.hud.toast(t('floresta.w.boom', 'BUM! Cratera aberta'));
    this.onBoom?.(x, y, z, r);
    audio.crack();
    tap('heavy');
  }
  onBoom: ((x: number, y: number, z: number, r: number) => void) | null = null;
  shake = 0;

  /* ------------------------------ toras (física) ------------------------------ */

  private findAimLog(): Log | null {
    const cp = this.camera.position;
    this.camera.getWorldDirection(_v);
    let best: Log | null = null;
    let bt = 3.2;
    for (const l of this.logs) {
      if (l.claim) continue;
      const ox = l.x - cp.x;
      const oy = l.y - cp.y;
      const oz = l.z - cp.z;
      const tt = ox * _v.x + oy * _v.y + oz * _v.z;
      if (tt < 0 || tt > bt) continue;
      const qx = ox - _v.x * tt;
      const qy = oy - _v.y * tt;
      const qz = oz - _v.z * tt;
      if (qx * qx + qy * qy + qz * qz < 0.55 * 0.55) {
        bt = tt;
        best = l;
      }
    }
    return best;
  }

  /** pega/solta a tora na mira (ou arremessa a que está na mão) */
  grab(): void {
    if (this.held) {
      const l = this.held;
      this.held = null;
      const b = l.b!;
      b.type = CANNON.Body.DYNAMIC;
      b.mass = 3;
      b.updateMassProperties();
      this.camera.getWorldDirection(_v);
      b.velocity.set(_v.x * 6.5, _v.y * 6.5 + 2.2, _v.z * 6.5);
      b.angularVelocity.set(0, (Math.random() - 0.5) * 2, 0);
      b.wakeUp();
      l.claim = 0;
      audio.click();
      return;
    }
    const l = this.aimLog;
    if (!l) return;
    if (!l.b) l.b = this.phys.logBody(l.x, l.y, l.z, 0);
    l.b.type = CANNON.Body.KINEMATIC;
    l.b.mass = 0;
    l.b.updateMassProperties();
    l.claim = 1;
    this.held = l;
    tap('light');
    audio.coin(1);
  }

  private holdLog(dt: number): void {
    const l = this.held;
    if (!l || !l.b) return;
    const cp = this.camera.position;
    this.camera.getWorldDirection(_v);
    const tx = cp.x + _v.x * 1.5;
    const ty = cp.y + _v.y * 1.5 - 0.45;
    const tz = cp.z + _v.z * 1.5;
    this.phys.moveKin(l.b, tx, ty, tz, this.yaw, 0, 0, dt);
    l.x = tx;
    l.y = ty;
    l.z = tz;
    l.q.set(l.b.quaternion.x, l.b.quaternion.y, l.b.quaternion.z, l.b.quaternion.w);
  }

  /** tira a tora do mundo (vira carga/estoque/venda) */
  removeLog(l: Log): void {
    const i = this.logs.indexOf(l);
    if (i >= 0) this.logs.splice(i, 1);
    if (l.b) this.phys.removeBody(l.b);
    l.b = null;
    if (this.held === l) this.held = null;
  }

  private poseHand(dt: number, walk: number): void {
    this.swing = Math.max(0, this.swing - dt * 3.2);
    for (let i = 0; i < 3; i++) this.tools[i].visible = i === this.tool;
    const s = this.swing;
    const arc = s > 0.6 ? (1 - s) / 0.4 : s / 0.6;
    const bob = Math.sin(this.walkT) * 0.02 * Math.min(1, walk);
    const ax = Math.min(1, this.camera.aspect / 1.6);
    this.hand.position.set(0.06 + 0.26 * ax, -0.42 + bob - arc * 0.1 - (1 - ax) * 0.08, -0.62);
    if (this.tool === 0) this.hand.rotation.set(-0.2 - arc * 1.3, 0.25, 0.15 + arc * 0.3);
    else if (this.tool === 1) this.hand.rotation.set(-0.9 - arc * 0.8, 0.1, 0.2);
    else this.hand.rotation.set(-0.3 - arc * 0.6, 0, 0.1);
    // mão na empunhadura (um pouco acima da origem do cabo) + antebraço até fora do quadro
    this.hand.updateMatrix();
    _v.set(0, this.tool === 1 ? 0.05 : 0.02, 0).applyMatrix4(this.hand.matrix);
    this.handMesh.position.copy(_v);
    this.handMesh.visible = this.arm.mesh.visible = this.hand.visible;
    _v.y -= 0.034;
    this.arm.set(_v, this.camera, 0.72, 0);
  }

  /* ------------------------------ veículos ------------------------------ */

  private drive(dt: number): void {
    const v = this.vehs[this.driving];
    const d = VDEFS[v.k];
    const c = this.hud.ctl;
    const thr = -c.my;
    const steer = c.mx;
    v.useT -= dt;
    v.boost = Math.max(0, v.boost - dt);
    const maxS = d.speed * (v.boost > 0 ? 1.6 : 1);
    if (v.k === VK.Heli) {
      const g = Math.max(this.world.waterLevel(v.x, v.z), this.vfloor(v, v.x, v.z));
      const lift = (c.up ? 1 : 0) - (c.down ? 1 : 0);
      v.vy += (lift * 7 - v.vy) * damp(3, dt);
      v.y += v.vy * dt;
      if (v.y > g + 60) v.y = g + 60;
      const air = v.y - g > 0.6;
      if (v.y < g) {
        v.y = g;
        v.vy = Math.max(0, v.vy);
      }
      const tgt = air ? thr * maxS : thr * 2;
      v.speed += (tgt - v.speed) * damp(1.6, dt);
      v.yaw -= steer * d.turn * dt;
      v.pitch += (-v.speed / maxS * 0.22 - v.pitch) * damp(3, dt);
      v.roll += (steer * 0.25 * Math.min(1, Math.abs(v.speed) / 5) - v.roll) * damp(3, dt);
      v.x += Math.cos(v.yaw) * v.speed * dt;
      v.z -= Math.sin(v.yaw) * v.speed * dt;
      if (v.m.rotor) v.m.rotor.rotation.y += dt * (12 + Math.abs(lift) * 6);
      if (!air) v.speed *= 1 - damp(4, dt);
    } else this.groundMove(v, d, thr, steer, maxS, dt);
    this.vehAction(v, dt);
    this.collect(v);
    this.placeVeh(v, dt);
    // câmera de perseguição
    const cy = v.yaw + this.camYawOff;
    const dist = d.camD * (v.k === VK.Heli ? 1 + Math.min(1, (v.y - this.world.heightAt(v.x, v.z)) / 30) * 0.4 : 1);
    const ph = this.pitch;
    let bx = v.x - Math.cos(cy) * dist * Math.cos(ph * 0.6);
    let bz = v.z + Math.sin(cy) * dist * Math.cos(ph * 0.6);
    let by = v.y + d.camH - ph * dist * 0.6;
    // nunca atrás de um tronco: aproxima a câmera até antes do primeiro obstáculo
    // (parte do lado de trás do veículo, para não "bater" nele mesmo)
    const sx = v.x - Math.cos(cy) * v.m.len * 0.3;
    const sz = v.z + Math.sin(cy) * v.m.len * 0.3;
    const air = v.k === VK.Heli && by - this.world.heightAt(bx, bz) > 9;
    const hit = air ? 1 : this.world.segmentHit(sx, sz, bx, bz, 0.5);
    if (hit < 1) {
      const k2 = Math.max(0.15, hit);
      bx = sx + (bx - sx) * k2;
      bz = sz + (bz - sz) * k2;
      by = v.y + d.camH * (0.75 + 0.25 * k2) + (1 - k2) * 1.2;
      this.camBlocked = 0.4;
    }
    const gy = this.world.heightAt(bx, bz);
    if (by < gy + 1.2) by = gy + 1.2;
    // ao entrar atrás de algo, a câmera corta rápido; ao sair, volta suave
    this.camBlocked = Math.max(0, this.camBlocked - dt);
    const k = damp(hit < 1 ? 25 : this.camBlocked > 0 ? 4 : 8, dt);
    this.camera.position.x += (bx - this.camera.position.x) * k;
    this.camera.position.y += (by - this.camera.position.y) * k;
    this.camera.position.z += (bz - this.camera.position.z) * k;
    if (this.camera.position.distanceToSquared(_v.set(bx, by, bz)) > 400) this.camera.position.set(bx, by, bz);
    this.camera.lookAt(v.x + Math.cos(v.yaw) * 2, v.y + 1.6, v.z - Math.sin(v.yaw) * 2);
    const fov = 70 + Math.min(12, Math.abs(v.speed) * 0.5);
    if (Math.abs(this.camera.fov - fov) > 0.3) {
      this.camera.fov += (fov - this.camera.fov) * damp(4, dt);
      this.camera.updateProjectionMatrix();
    }
    this.px = v.x;
    this.pz = v.z;
    this.py = v.y;
  }

  /** chão para o veículo (cavernas inclusive), sem contar a própria caixa */
  private vfloor(v: Veh, x: number, z: number): number {
    v.box.off = true;
    const f = this.world.floorAt(x, v.y + 1.1, z);
    v.box.off = false;
    return f;
  }

  private groundMove(v: Veh, d: VDef, thr: number, steer: number, maxS: number, dt: number): void {
    const W = this.world;
    const g0 = this.vfloor(v, v.x, v.z);
    const wl0 = W.waterLevel(v.x, v.z);
    const depth = wl0 - g0;
    let lim = maxS;
    if (v.k === VK.Boat) {
      if (depth < 0.45) lim = 1.5; // encalhado: só se arrasta
    } else if (depth > 0.9) lim = Math.min(lim, 2.5);
    const tgt = thr * lim * (thr < 0 ? 0.45 : 1);
    const acc = Math.sign(tgt - v.speed) === Math.sign(v.speed) || v.speed === 0 ? d.acc : d.acc * 2;
    v.speed += clamp(tgt - v.speed, -acc * dt, acc * dt);
    if (!thr) v.speed *= 1 - damp(1.5, dt);
    const turnK = d.tracks ? 1 : clamp(v.speed / 4, -1, 1);
    v.yaw -= steer * d.turn * dt * turnK;
    const nx = v.x + Math.cos(v.yaw) * v.speed * dt;
    const nz = v.z - Math.sin(v.yaw) * v.speed * dt;
    const g1 = this.vfloor(v, nx, nz);
    const run = Math.abs(v.speed * dt) || 1e-4;
    const grade = (g1 - g0) / run;
    // parede (sólido na altura do capô)
    const fx = Math.cos(v.yaw) * Math.sign(v.speed || 1) * v.m.len * 0.5;
    const fz = -Math.sin(v.yaw) * Math.sign(v.speed || 1) * v.m.len * 0.5;
    const wall = W.vox.dens(nx + fx, v.y + 1.1, nz + fz) > 0;
    if (v.k === VK.Boat && W.waterLevel(nx, nz) - g1 < 0.3 && depth >= 0.3) {
      v.speed *= -0.3; // bateu na margem
    } else if (wall || (grade > (d.tracks ? 1.6 : 1.1) && v.y <= g0 + 0.2)) {
      v.speed *= wall ? -0.2 : 0.4; // íngreme demais
    } else {
      v.x = nx;
      v.z = nz;
    }
    // troncos, pedras e construções
    const p = this._pp;
    const ax = v.x + Math.cos(v.yaw) * v.m.len * 0.35;
    const az = v.z - Math.sin(v.yaw) * v.m.len * 0.35;
    if (v.k === VK.Dozer && Math.abs(v.speed) > 1) {
      for (const tr of W.treesInRadius(ax, az, 1.8)) this.startFall(tr, Math.cos(v.yaw), -Math.sin(v.yaw), false);
    }
    p.x = ax;
    p.z = az;
    let hit = W.pushOutTrees(p, v.m.wid * 0.45, v.y);
    W.solids.resolve(p, v.y, 1.8, v.m.wid * 0.45, 0.5, this.mv, v.box.tag);
    hit = hit || this.mv.hit;
    if (hit) {
      v.x += p.x - ax;
      v.z += p.z - az;
      if (Math.abs(v.speed) > 4) {
        this.shake = 0.15;
        tap('light');
      }
      v.speed *= v.k === VK.Dozer && !this.mv.hit ? 0.7 : -0.2;
    }
    p.x = v.x;
    p.z = v.z;
    W.pushOutTrees(p, v.m.wid * 0.3, v.y);
    W.solids.resolve(p, v.y, 1.8, v.m.wid * 0.4, 0.5, this.mv, v.box.tag);
    v.x = p.x;
    v.z = p.z;
    // gravidade e pouso
    const g = this.vfloor(v, v.x, v.z);
    const floor = v.k === VK.Boat ? Math.max(g, W.waterLevel(v.x, v.z) - 0.15) : g;
    if (v.y > floor + 0.05) {
      v.vy -= 20 * dt;
      v.y += v.vy * dt;
      v.airT += dt;
    }
    if (v.y <= floor + 0.05) {
      if (v.vy < -12) this.heavyLanding(v);
      v.y = floor;
      v.vy = 0;
      v.airT = 0;
    } else if (v.y - floor < 0.6 && v.airT < 0.05) {
      v.y = floor;
      v.vy = 0;
    }
  }

  private heavyLanding(v: Veh): void {
    const r = 1.4 + Math.min(1.8, -v.vy / 14);
    this.carve(v.x, v.y - r * 0.6, v.z, r, 1, true);
    this.burst(24, v.x, v.y + 0.3, v.z, WBIOMES[this.world.biomeAt(v.x, v.z)].dirt, 6);
    this.save.stats.craters++;
    this.shake = 0.5;
    tap('heavy');
    audio.crack();
    this.hud.toast(t('floresta.w.thud', 'Pancada! O chão afundou'));
  }

  /** veículos sem motorista: assentam no chão (o terreno pode ter mudado) */
  private idleVeh(v: Veh, dt: number): void {
    // parado longe (pedaço do chão não carregado): nada muda, e a altura viria do gerador de
    // ruído (caro, 6 consultas por veículo por quadro)
    if (v.vy === 0 && Math.abs(v.speed) < 1e-3 && !this.world.chunkAt(v.x, v.z)) return;
    v.speed *= 1 - damp(3, dt);
    const g = this.vfloor(v, v.x, v.z);
    const floor = v.k === VK.Boat ? Math.max(g, this.world.waterLevel(v.x, v.z) - 0.15) : g;
    if (v.y > floor + 0.02) {
      v.vy -= 20 * dt;
      v.y += v.vy * dt;
      if (v.y <= floor) {
        if (v.vy < -12) this.heavyLanding(v);
        v.y = floor;
        v.vy = 0;
      }
    } else {
      v.y = floor;
      v.vy = 0;
    }
    if (v.m.rotor && v.y - g < 0.5) v.m.rotor.rotation.y += dt * 0.5;
    this.placeVeh(v, dt);
  }

  private placeVeh(v: Veh, dt: number): void {
    if (v.k !== VK.Heli) {
      const ca = Math.cos(v.yaw);
      const sa = Math.sin(v.yaw);
      const hl = v.m.len * 0.4;
      const hw = v.m.wid * 0.4;
      const air = v.y > this.vfloor(v, v.x, v.z) + 0.3;
      if (!air && v.k !== VK.Boat) {
        const hf = this.vfloor(v, v.x + ca * hl, v.z - sa * hl);
        const hb = this.vfloor(v, v.x - ca * hl, v.z + sa * hl);
        const hL = this.vfloor(v, v.x - sa * hw, v.z - ca * hw);
        const hR = this.vfloor(v, v.x + sa * hw, v.z + ca * hw);
        const tp = Math.atan2(hf - hb, hl * 2);
        const tr = Math.atan2(hL - hR, hw * 2);
        const k = damp(10, dt);
        v.pitch += (tp - v.pitch) * k;
        v.roll += (tr - v.roll) * k;
      } else if (v.k === VK.Boat) {
        v.pitch = Math.sin(this.time * 1.7 + v.x) * 0.03 - v.speed * 0.006;
        v.roll = Math.sin(this.time * 1.3) * 0.03;
        const wl = this.world.waterLevel(v.x, v.z);
        if (v.y <= wl) v.y = wl - 0.15 + Math.sin(this.time * 2) * 0.05;
      }
    }
    v.m.g.position.set(v.x, v.y, v.z);
    v.m.g.rotation.set(v.roll, v.yaw, v.pitch, 'YXZ');
    const bx = v.box;
    bx.x = v.x;
    bx.z = v.z;
    bx.y0 = v.y;
    bx.y1 = v.y + (v.k === VK.Heli ? 2.6 : 2);
    bx.c = Math.cos(v.yaw);
    bx.s = Math.sin(v.yaw);
    this.phys.moveKin(v.kin, v.x, v.y + 0.6, v.z, v.yaw, v.pitch, v.roll, dt);
    for (const w of v.m.wheels) w.rotation.z -= v.speed * dt * 2.2;
    // braço da escavadeira / lâmina / garfo / grua
    if (v.m.arm) {
      v.armT = Math.max(0, v.armT - dt * 1.8);
      const a = v.armT;
      if (v.k === VK.Excavator) v.m.arm.rotation.z = -0.3 - Math.sin(a * Math.PI) * 0.5;
      else if (v.k === VK.Dozer) v.m.arm.position.y = 0.6 - Math.sin(a * Math.PI) * 0.25;
      else if (v.k === VK.Forklift) v.m.arm.position.y = 0.3 + Math.min(1, v.cargo / 4) * 0.6 + Math.sin(a * Math.PI) * 0.8;
      else if (v.k === VK.Truck) v.m.arm.rotation.y = Math.sin(a * Math.PI * 2) * 1.2;
    }
  }

  private vehAction(v: Veh, _dt: number): void {
    if (!this.hud.ctl.use || v.useT > 0) return;
    const fx = Math.cos(v.yaw);
    const fz = -Math.sin(v.yaw);
    switch (v.k) {
      case VK.Quad:
        v.useT = 4;
        v.boost = 2;
        this.hud.toast(t('floresta.w.turbo', 'Turbo!'));
        break;
      case VK.Excavator: {
        v.useT = 0.45;
        v.armT = 1;
        const ex = v.x + fx * 4.2;
        const ez = v.z + fz * 4.2;
        this.carve(ex, this.world.floorAt(ex, v.y + 2, ez) - 0.4, ez, 1.9, 2, true);
        break;
      }
      case VK.Dozer: {
        v.useT = 0.3;
        v.armT = 1;
        const x = v.x + fx * 2.4;
        const z = v.z + fz * 2.4;
        // lâmina: raspa tudo acima do nível do trator
        this.carve(x, v.y + 1.6, z, 1.5, 1, true);
        this.burst(4, x, v.y + 0.3, z, WBIOMES[this.world.biomeAt(x, z)].dirt, 2);
        break;
      }
      case VK.Truck: {
        v.useT = 0.8;
        v.armT = 1;
        // a grua puxa toras num raio maior
        let n = 0;
        for (let i = this.logs.length - 1; i >= 0 && v.cargo < VDEFS[v.k].cap; i--) {
          const l = this.logs[i];
          if (l.claim || (l.x - v.x) ** 2 + (l.z - v.z) ** 2 > 9 * 9 || Math.abs(l.y - v.y) > 5) continue;
          v.cargo++;
          v.cargoVal += l.val;
          this.removeLog(l);
          n++;
        }
        this.hud.toast(n ? t('floresta.w.loaded', '+{n} toras na carga', { n }) : t('floresta.w.noLogs', 'Nenhuma tora solta por perto'));
        break;
      }
      case VK.Heli:
      case VK.Tractor: {
        v.useT = 0.6;
        if (!v.cargo) {
          this.hud.toast(t('floresta.w.empty', 'Carga vazia'));
          break;
        }
        // larga as toras como corpos físicos (do alto: caem com tudo)
        const bx = v.k === VK.Heli ? v.x : v.x - fx * (v.m.len * 0.6 + 1);
        const bz = v.k === VK.Heli ? v.z : v.z - fz * (v.m.len * 0.6 + 1);
        const h = v.k === VK.Heli ? v.y - 1.2 : v.y + 1.4;
        this.unloadVeh(v, bx, h, bz, v.k === VK.Heli ? 0 : -fx * 2, v.k === VK.Heli ? 0 : -fz * 2);
        v.useT = 1.2;
        break;
      }
      case VK.Boat:
        v.useT = 1.5;
        audio.click();
        this.hud.toast(t('floresta.w.horn', 'Fom fom!'));
        break;
      case VK.Forklift: {
        v.useT = 0.6;
        v.armT = 1;
        // garfo: pega toras logo à frente; se cheio, larga na frente
        let n = 0;
        const gx = v.x + fx * (v.m.len * 0.6 + 0.8);
        const gz = v.z + fz * (v.m.len * 0.6 + 0.8);
        for (let i = this.logs.length - 1; i >= 0 && v.cargo < VDEFS[v.k].cap; i--) {
          const l = this.logs[i];
          if (l.claim || (l.x - gx) ** 2 + (l.z - gz) ** 2 > 2.2 * 2.2 || Math.abs(l.y - v.y) > 2.5) continue;
          v.cargo++;
          v.cargoVal += l.val;
          this.removeLog(l);
          n++;
        }
        if (!n && v.cargo) this.unloadVeh(v, gx, v.y + 1.4, gz, fx, fz);
        break;
      }
    }
  }

  /** guincho do helicóptero: puxa toras logo abaixo quando voa baixo */
  private collect(v: Veh): void {
    const d = VDEFS[v.k];
    if (v.k !== VK.Heli || v.cargo >= d.cap) return;
    if (v.y - Math.max(this.world.waterLevel(v.x, v.z), this.vfloor(v, v.x, v.z)) > 7) return;
    for (let i = this.logs.length - 1; i >= 0 && v.cargo < d.cap; i--) {
      const l = this.logs[i];
      if (l.claim) continue;
      if ((l.x - v.x) ** 2 + (l.z - v.z) ** 2 < 3 * 3 && l.y < v.y) {
        v.cargo++;
        v.cargoVal += l.val;
        this.removeLog(l);
        audio.coin(v.cargo % 6);
      }
    }
  }

  private drawCargo(): void {
    let n = 0;
    for (const v of this.vehs) {
      if (!v.cargo) continue;
      v.m.bed.updateWorldMatrix(true, false);
      const show = Math.min(v.cargo, v.k === VK.Truck ? 18 : 12);
      for (let i = 0; i < show && n < 160; i++) {
        const row = i % 3;
        const lay = Math.floor(i / 3);
        _m.compose(_v.set(((lay % 2) - 0.5) * 0.3, 0.28 + lay * 0.45, (row - 1) * 0.5), _q.identity(), _s.set(1, 1, 1));
        _m.premultiply(v.m.bed.matrixWorld);
        this.cargoMesh.setMatrixAt(n, _m);
        this.cargoMesh.setColorAt(n, _c.setHex(0x9a6a3c));
        n++;
      }
    }
    this.cargoMesh.count = n;
    this.cargoMesh.instanceMatrix.needsUpdate = true;
    if (this.cargoMesh.instanceColor) this.cargoMesh.instanceColor.needsUpdate = true;
  }

  /* ------------------------------ ajudantes ------------------------------ */

  private stepPets(dt: number): void {
    const leader = this.driving >= 0 ? this.vehs[this.driving] : null;
    const lx = this.cx();
    const lz = this.cz();
    for (const p of this.pets) {
      if (!p.o.visible) continue;
      let tx = p.x;
      let tz = p.z;
      let speed = 0;
      switch (p.st) {
        case 'wait':
          p.delay -= dt;
          if (p.delay <= 0) p.st = p.next;
          break;
        case 'stay':
          break;
        case 'follow': {
          // atrás de você (ou do veículo), em leque
          const bx = leader ? -Math.cos(leader.yaw) : Math.sin(this.yaw);
          const bz = leader ? Math.sin(leader.yaw) : Math.cos(this.yaw);
          const back = leader ? leader.m.len * 0.6 + 2.5 : 2.6;
          tx = lx + bx * back + bz * (p.i - 1) * 1.6;
          tz = lz + bz * back - bx * (p.i - 1) * 1.6;
          const d = Math.hypot(tx - p.x, tz - p.z);
          if (d > 60) {
            p.x = tx;
            p.z = tz;
          }
          speed = d > 1.2 ? Math.min(8.5, 3 + d * 0.6) : 0;
          break;
        }
        case 'goChop': {
          const tr = p.tree;
          if (!tr || tr.c.tstate[tr.i] !== 0 || !this.world.chunks.has(tr.c.key())) {
            this.resetPet(p);
            break;
          }
          const tp = this.world.treePos(tr, _v2);
          const dx = p.x - tp.x;
          const dz = p.z - tp.z;
          const d = Math.hypot(dx, dz) || 1;
          tx = tp.x + (dx / d) * 1.1;
          tz = tp.z + (dz / d) * 1.1;
          speed = 4.5;
          if (d < 1.4) {
            p.st = 'chop';
            p.chopT = 0;
          }
          break;
        }
        case 'chop': {
          const tr = p.tree;
          if (!tr || tr.c.tstate[tr.i] !== 0 || this.world.hidden.has(this.world.treeKey(tr))) {
            this.resetPet(p);
            break;
          }
          const tp = this.world.treePos(tr, _v2);
          p.yaw = Math.atan2(-(tp.z - p.z), tp.x - p.x);
          p.chopT += dt;
          if (p.chopT > 0.7) {
            p.chopT = 0;
            this.hitTree(tr, 1.3, true);
          }
          break;
        }
        case 'goLog': {
          if (p.log < 0 || !this.logs.includes(this.claimed[p.i]!)) {
            let best = -1;
            let bd = 30 * 30;
            for (let i = 0; i < this.logs.length; i++) {
              const l = this.logs[i];
              if (l.claim || !l.rest) continue;
              const d = (l.x - p.x) ** 2 + (l.z - p.z) ** 2;
              if ((l.x - lx) ** 2 + (l.z - lz) ** 2 > 32 * 32) continue;
              if (d < bd) {
                bd = d;
                best = i;
              }
            }
            if (best < 0) {
              p.st = this.petFollow ? 'follow' : 'stay';
              break;
            }
            const lb = this.logs[best];
            lb.claim = 100 + p.i;
            if (lb.b) {
              this.phys.removeBody(lb.b);
              lb.b = null;
            }
            this.claimed[p.i] = this.logs[best];
            p.log = 1;
          }
          const l = this.claimed[p.i]!;
          tx = l.x;
          tz = l.z;
          speed = 5;
          if (Math.hypot(l.x - p.x, l.z - p.z) < 1) {
            l.claim = 0;
            p.carrying = l;
            this.removeLog(l);
            p.st = 'bring';
            p.log = -1;
          }
          break;
        }
        case 'bring': {
          tx = lx;
          tz = lz;
          speed = 5;
          const reach = leader ? leader.m.len * 0.6 + 1.5 : 1.8;
          if (Math.hypot(lx - p.x, lz - p.z) < reach && p.carrying) {
            const l = p.carrying;
            p.carrying = null;
            if (leader && VDEFS[leader.k].cap > leader.cargo) {
              leader.cargo++;
              leader.cargoVal += l.val;
            } else {
              // larga na sua frente (física)
              this.addLog(p.x + Math.sin(p.yaw) * 0.5, p.y + 1.2, p.z + Math.cos(p.yaw) * 0.5, 0, 0, 0, l.sp, l.val);
            }
            audio.coin(2);
            p.fetchLeft--;
            p.st = p.fetchLeft > 0 ? 'goLog' : this.petFollow ? 'follow' : 'stay';
          }
          break;
        }
      }
      if (speed > 0) {
        const dx = tx - p.x;
        const dz = tz - p.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.05) {
          const s = Math.min(d, speed * dt);
          const q = { x: p.x + (dx / d) * s, z: p.z + (dz / d) * s };
          this.world.pushOutTrees(q, 0.3);
          p.x = q.x;
          p.z = q.z;
          p.yaw += angDiff(p.yaw, Math.atan2(-dz, dx)) * damp(10, dt);
          p.walk += s * 4;
        }
      }
      const g = this.world.heightAt(p.x, p.z);
      p.y = Math.max(g, this.world.waterLevel(p.x, p.z) - 0.4);
      p.o.position.set(p.x, p.y, p.z);
      p.o.rotation.y = p.yaw;
      const hop = speed > 0 ? Math.abs(Math.sin(p.walk)) * 0.18 : 0;
      p.body.position.y = hop;
      p.tool.visible = p.st === 'chop' || p.st === 'goChop';
      p.tool.rotation.z = p.st === 'chop' ? -Math.sin(p.chopT / 0.7 * Math.PI) * 1.4 : 0;
      p.body.rotation.z = p.st === 'wait' ? Math.sin(this.time * 12) * 0.08 : 0;
    }
  }
  private claimed: (Log | null)[] = [null, null, null];

  /* ------------------------------ partículas ------------------------------ */

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, col: string): void {
    const N = this.pLife.length;
    const i = this.pN++ % N;
    this.pPos[i * 3] = x;
    this.pPos[i * 3 + 1] = y;
    this.pPos[i * 3 + 2] = z;
    this.pVel[i * 3] = vx;
    this.pVel[i * 3 + 1] = vy;
    this.pVel[i * 3 + 2] = vz;
    this.pLife[i] = life;
    _c.set(col);
    this.pCol[i * 3] = _c.r;
    this.pCol[i * 3 + 1] = _c.g;
    this.pCol[i * 3 + 2] = _c.b;
  }
  burst(n: number, x: number, y: number, z: number, col: string, sp: number): void {
    n = Math.ceil(n * this.q.particles);
    for (let i = 0; i < n; i++) this.emit(x, y, z, (Math.random() - 0.5) * sp, Math.random() * sp * 0.8 + 1, (Math.random() - 0.5) * sp, 0.6 + Math.random() * 0.6, col);
  }
  private stepParticles(dt: number): void {
    const P = this.pPos;
    const V = this.pVel;
    for (let i = 0; i < this.pLife.length; i++) {
      if (this.pLife[i] <= 0) continue;
      this.pLife[i] -= dt;
      if (this.pLife[i] <= 0) {
        P[i * 3 + 1] = -999;
        continue;
      }
      V[i * 3 + 1] -= 14 * dt;
      P[i * 3] += V[i * 3] * dt;
      P[i * 3 + 1] += V[i * 3 + 1] * dt;
      P[i * 3 + 2] += V[i * 3 + 2] * dt;
    }
    (this.pGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.pGeo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  /* ------------------------------ céu, HUD ------------------------------ */

  private updateSky(dt: number): void {
    this.skyT -= dt;
    const fogK = this.skyT <= 0 ? this.world.skyAt(this.cx(), this.cz(), _fog, _top) : 0;
    if (this.skyT <= 0) {
      this.skyT = 0.25;
      const bg = this.scene.background as THREE.Color;
      bg.lerp(_fog, 0.25);
      const f = this.scene.fog as THREE.Fog;
      f.color.copy(bg);
      const far = (this.q.radius + 0.5) * CH * this.q.fogMul * Math.min(1.15, fogK);
      f.far += (far - f.far) * 0.3;
      f.near = f.far * 0.35;
      this.camera.far = f.far + 20;
      this.camera.updateProjectionMatrix();
      this.hemi.color.lerp(_top, 0.1);
      this.skyTop.lerp(_top, 0.25);
      const wb = WBIOMES[this.world.lastBest];
      this.world.waterMat.color.lerp(_c.set(wb.water), 0.2);
      // bioma novo: aviso no topo
      if (this.world.lastBest !== this.biome) {
        this.biomeT += 0.25;
        if (this.biomeT > 1 || this.biome < 0) {
          const first = this.biome < 0;
          this.biome = this.world.lastBest;
          this.biomeT = 0;
          this.hud.set('biome', wb.name());
          if (!this.save.biomes.includes(this.biome)) this.save.biomes.push(this.biome);
          if (!first) this.hud.toast(wb.name(), 'biome');
        }
      } else this.biomeT = 0;
    }
    const cx = this.cx();
    const cz = this.cz();
    this.underground(dt);
    this.sun.position.set(cx + 30, 60, cz + 18);
    this.sun.target.position.set(cx, 0, cz);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.5;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.5;
    }
  }

  /** céu: horizonte = cor do fundo/neblina (já com noite/caverna); topo = céu do bioma escurecendo junto */
  private updateDome(): void {
    const bg = this.scene.background as THREE.Color;
    this.sky.horizon.copy(bg);
    const k = Math.min(1, Math.max(0, (1 - this.dayLight) * 1.25) + this.under);
    this.sky.top.copy(this.skyTop).lerp(bg, k);
    this.sky.sunDir.copy(this.sun.position).sub(this.sun.target.position).normalize();
    this.sky.sunCol.setRGB(1, 0.92, 0.75).multiplyScalar(this.dayLight * (1 - this.under));
    this.sky.follow(this.camera);
  }

  /** no subsolo: escurece, neblina fechada e lanterna */
  private underground(dt: number): void {
    const depth = this.driving >= 0 ? 0 : this.world.heightAt(this.px, this.pz) - this.py;
    // coberto por rocha (caverna/túnel) mesmo num poço aberto ao lado
    this.coverT -= dt;
    if (this.coverT <= 0) {
      this.coverT = 0.25;
      const V = this.world.vox;
      this.covered = this.driving < 0 && (V.dens(this.px, this.py + 5, this.pz) > 0 || V.dens(this.px, this.py + 11, this.pz) > 0);
    }
    const tgt = Math.max(clamp((depth - 3) / 7, 0, 1), this.covered ? 1 : 0);
    this.under += (tgt - this.under) * damp(2, dt);
    const u = this.under;
    // tocha na mão: luz quente mais forte (também à noite na superfície)
    const torch = this.sb?.held() === 'tocha' || this.sb?.held() === 'lampiao';
    const night = 1 - this.dayLight;
    this.lantern.intensity = u * 1.3 + (torch ? 1.1 * Math.max(u, night) : 0);
    this.lantern.color.setHex(torch ? 0xffb060 : 0xffd8a0);
    this.hemi.intensity = 1.25 * this.dayLight * (1 - u) + 0.62 * u;
    this.sun.intensity = 1.7 * (1 - u) * this.dayLight;
    if (u > 0.01) {
      const f = this.scene.fog as THREE.Fog;
      _c.set('#2a2244');
      f.color.lerp(_c, u);
      (this.scene.background as THREE.Color).lerp(_c, u);
      _top.set('#b8b0e0');
      this.hemi.color.lerp(_top, u * 0.5);
      f.far = f.far * (1 - u) + 72 * u;
      f.near = f.far * (0.35 + 0.3 * u);
    }
  }
  private coverT = 0;
  private covered = false;
  /** 0..1 (noite → dia), controlado pelo ciclo de dia */
  dayLight = 1;

  private hudT = 0;
  private arrowA = 1e9;
  private hudCamp: Camp | null = null;
  private updateHud(dt: number): void {
    this.drawCargo();
    // textos/botões do HUD a ~10 Hz (buscas de acampamento/veículo e DOM fora do quadro a quadro);
    // a seta segue a câmera todo quadro, mas só escreve no DOM quando gira de verdade
    this.hudT -= dt;
    const full = this.hudT <= 0;
    if (full) this.hudT = 0.1;
    const h = this.hud;
    const v = this.driving >= 0 ? this.vehs[this.driving] : null;
    if (full) this.hudCamp = this.world.gen.nearestCamp(this.cx(), this.cz());
    const camp = this.hudCamp;
    if (camp) {
      const camYaw = v ? v.yaw + this.camYawOff - Math.PI / 2 : this.yaw;
      const a = Math.atan2(camp.x - this.cx(), -(camp.z - this.cz())) + camYaw;
      if (Math.abs(a - this.arrowA) > 0.01) {
        this.arrowA = a;
        h.arrow(a);
      }
    }
    if (!full) return;
    h.set('coins', short(this.save.coins));
    if (v) {
      const cap = VDEFS[v.k].cap;
      h.set('carry', cap ? `${v.cargo}/${cap}` : '—');
    } else h.set('carry', `${this.carry}/${ON_FOOT_CAP}${this.ore ? ' +' + short(this.ore) : ''}`);
    if (camp) {
      const d = Math.hypot(camp.x - this.cx(), camp.z - this.cz());
      h.set('camp', d < 14 ? t('floresta.w.atMill', 'Serraria') : `${Math.round(d)} m`);
    }
    const near = !v ? this.nearVeh() : null;
    const alt = !v && !near ? this.altNear?.() ?? null : null;
    h.show('.fw-veh', !!v || !!near || !!alt);
    if (alt) h.set('veh', `${flIcon('wheel', 24)}<span>${alt}</span>`, true);
    if (v) h.set('veh', `${WICONS.exitv}<span>${t('floresta.w.exit', 'Sair')}</span>`, true);
    else if (near) h.set('veh', `${flIcon('wheel', 24)}<span>${VDEFS[near.k].name()}</span>`, true);
    const canSell = !!this.campNear(16) && (this.carry > 0 || this.ore > 0 || (!!v && v.cargo > 0) || this.vehs.some((x) => x.cargo > 0 && !!this.world.gen.nearestCamp(x.x, x.z, 18)));
    h.show('.fw-sell', canSell);
    h.show('.fw-tool', !v);
    h.show('.fw-jump', !v);
    h.show('.fw-grab', !v && (!!this.held || !!this.aimLog));
    h.set('grab', this.held ? t('mundo.throw', 'Jogar') : t('mundo.grab', 'Pegar'));
    h.show('.fw-up', !!v && v.k === VK.Heli);
    h.show('.fw-down', !!v && v.k === VK.Heli);
    if (this.sb && !v) {
      const hid = this.sb.held();
      const it = ITEM.get(hid);
      const lbl = !it ? (this.aimTree ? t('floresta.chop', 'Cortar') : t('mundo.hit', 'Bater')) : it.food ? t('mundo.eat', 'Comer') : it.place ? t('mundo.place', 'Colocar') : it.tool === 'pick' || it.tool === 'shovel' ? (this.aimTree ? t('floresta.chop', 'Cortar') : t('floresta.w.dig', 'Cavar')) : it.tool === 'axe' ? t('floresta.chop', 'Cortar') : it.fill !== undefined ? t('mundo.place', 'Colocar') : t('mundo.use', 'Usar');
      h.set('use', lbl);
      h.set('useI', it ? `<img src="${iconURL(hid)}" width="34" height="34" alt="">` : flIcon('axe', 34), true);
      h.show('.fw-tool', false);
      return;
    }
    const useLbl = v ? VDEFS[v.k].use() : [t('floresta.chop', 'Cortar'), t('floresta.w.dig', 'Cavar'), t('floresta.w.place', 'Acender')][this.tool];
    h.set('use', useLbl);
    h.set('useI', v ? flIcon('wheel', 34) : this.toolIcon(), true);
  }

  /* ------------------------------ ciclo de vida ------------------------------ */

  persist(): void {
    const s = this.save;
    s.px = this.driving >= 0 ? this.vehs[this.driving].x - 3 : this.px;
    s.pz = this.driving >= 0 ? this.vehs[this.driving].z : this.pz;
    s.yaw = this.yaw;
    s.time += 0;
    if (this.sb) s.sb = this.sb.toJSON();
    s.veh.pos = this.vehs.map((v) => [Math.round(v.x * 10) / 10, Math.round(v.z * 10) / 10, Math.round(v.yaw * 100) / 100, v.cargo, Math.round(v.cargoVal)]);
    this.world.storeAll();
    if (this.opts.onSave) this.opts.onSave(s);
    else writeWorld(s);
  }

  setTier(tier: Tier, _s?: QualitySettings): void {
    const nq = wq(tier);
    Object.assign(this.q, nq);
    this.world.setNatureTier(tier);
    this.renderer.setPixelRatio(nq.pr * this.resK);
    this.resize();
  }

  private resK = 1;
  /** resolução dinâmica (QualityGovernor.onResScale) */
  setResScale(k: number): void {
    this.resK = k;
    this.renderer.setPixelRatio(this.q.pr * k);
  }

  resize(): void {
    const w = this.root.clientWidth || window.innerWidth;
    const h = this.root.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  pause(): void {
    this.paused = true;
    this.persist();
  }
  resume(): void {
    this.paused = false;
    this.last = performance.now();
  }
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.persist();
    for (const f of this.offs) f();
    this.hud.destroy();
    this.sb?.dispose();
    this.world.dispose();
    this.sky.dispose();
    this.leaves.dispose();
    this.phys.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    if ((window as any).__forest === this) delete (window as any).__forest;
  }

  /* ------------------------------ depuração ------------------------------ */

  /** teleporta (testes): carrega os pedaços em volta na hora */
  teleport(x: number, z: number): void {
    if (this.driving >= 0) {
      const v = this.vehs[this.driving];
      v.x = x;
      v.z = z;
    }
    this.px = x;
    this.pz = z;
    const pf = this.q.perFrame;
    this.q.perFrame = 40;
    this.world.update(x, z, 0);
    this.q.perFrame = pf;
    this.py = this.world.heightAt(x, z);
    if (this.driving >= 0) this.vehs[this.driving].y = Math.max(this.py, this.vehs[this.driving].k === VK.Boat ? this.world.waterLevel(x, z) : -99);
    for (const p of this.pets) {
      p.x = x + Math.sin(this.yaw) * 3 + (p.i - 1) * 1.5;
      p.z = z + Math.cos(this.yaw) * 3;
    }
  }
  /** acha um ponto do bioma b perto de (x,z) */
  findBiome(b: number, x = this.px, z = this.pz): [number, number] | null {
    const w = new Float32Array(WBIOMES.length);
    for (let r = 0; r < 6000; r += 48)
      for (let a = 0; a < TAU; a += 24 / Math.max(24, r)) {
        const wx = x + Math.cos(a) * r;
        const wz = z + Math.sin(a) * r;
        this.world.gen.weights(wx, wz, w);
        if (w[b] > 0.8 && this.world.gen.height(wx, wz) > WATER_Y + 0.5) return [wx, wz];
      }
    return null;
  }
}

export function createWorld(root: HTMLElement, opts: WorldOpts): WorldGame {
  return new WorldGame(root, opts);
}

/** multiplayer: disponível quando o módulo de rede existir */
export function serversAvailable(): boolean {
  return true;
}
export async function openServers(root: HTMLElement, opts: WorldOpts): Promise<WorldGame | null> {
  const net = await import('./net');
  return net.openServers(root, opts);
}
