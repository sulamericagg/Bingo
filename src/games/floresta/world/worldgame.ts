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
import { lambert, toolModel } from '../fps/models';
import { CH, WATER_Y, type Camp } from './gen';
import { WBIOMES, WSPECIES, ORES } from './biomes';
import type { Chunk } from './chunk';
import { World, treeHp, type StreamQ, type TreeRef } from './stream';
import { VK, looseLogGeometry, petModel, shovelModel, tntModel, wVehicleModel, type WVehModel } from './wmodels';
import { loadWorld, writeWorld, type WorldSave } from './wsave';
import { WorldHud, WICONS, type WAct } from './whud';
import { flIcon } from '../icons';

const TAU = Math.PI * 2;
const EYE = 1.6;
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
}
interface Log {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  roll: number;
  sp: number;
  val: number;
  rest: boolean;
  /** reservada por um ajudante */
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
    { radius: 3, near: 40, deco: 0.8, lite: false, perFrame: 2, pr: Math.min(dpr, 1), shadows: false, fogMul: 1, particles: 0.85 },
    { radius: 4, near: 56, deco: 1, lite: false, perFrame: 2, pr: Math.min(dpr, 1.5), shadows: true, fogMul: 1, particles: 1 },
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
}

export class WorldGame {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private world: World;
  private save: WorldSave;
  private hud: WorldHud;
  private q: WQ;
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private water: THREE.Mesh;
  private waterMat: THREE.MeshLambertMaterial;
  private raf = 0;
  private last = 0;
  private paused = false;
  private destroyed = false;
  private offs: (() => void)[] = [];

  // jogador
  px = 0;
  py = 0;
  pz = 0;
  private vy = 0;
  yaw = 0;
  pitch = -0.1;
  private tYaw = 0;
  private tPitch = -0.1;
  private walkT = 0;
  private tool = 0;
  private swing = 0;
  private swingCd = 0;
  carry = 0;
  carryVal = 0;
  private ore = 0;
  private hand: THREE.Group;
  private tools: THREE.Object3D[] = [];
  driving = -1;
  private camYawOff = 0;
  private camIdle = 0;

  vehs: Veh[] = [];
  logs: Log[] = [];
  private logMesh: THREE.InstancedMesh;
  private cargoMesh: THREE.InstancedMesh;
  private falls: Fall[] = [];
  private tnts: Tnt[] = [];
  private tntCd = 0;
  pets: Pet[] = [];
  private petFollow = true;
  private chopHp = new Map<string, number>();
  private aimTree: TreeRef | null = null;
  private marker: THREE.Mesh;

  // partículas
  private pPos: Float32Array;
  private pCol: Float32Array;
  private pVel: Float32Array;
  private pLife: Float32Array;
  private pGeo: THREE.BufferGeometry;
  private pN = 0;

  private biome = -1;
  private biomeT = 0;
  private saveT = 0;
  private earned = 0;
  private trees = 0;
  private time = 0;
  private skyT = 0;

  constructor(
    private root: HTMLElement,
    private opts: WorldOpts,
  ) {
    this.save = loadWorld();
    this.q = wq(opts.tier);
    const r = new THREE.WebGLRenderer({ antialias: opts.tier >= 2, powerPreference: 'high-performance' });
    r.setPixelRatio(this.q.pr);
    r.setSize(root.clientWidth || window.innerWidth, root.clientHeight || window.innerHeight);
    r.shadowMap.enabled = this.q.shadows;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.domElement.className = 'fl-canvas';
    root.appendChild(r.domElement);
    this.renderer = r;
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 400);
    this.scene.add(this.camera);
    this.scene.fog = new THREE.Fog(0xcfeaf2, 30, 120);
    this.scene.background = new THREE.Color(0xcfeaf2);

    this.hemi = new THREE.HemisphereLight(0xdff4ff, 0x6a5a3a, 1.25);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2d8, 1.7);
    this.sun.castShadow = this.q.shadows;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -36;
    sc.right = sc.top = 36;
    sc.near = 1;
    sc.far = 140;
    this.sun.shadow.bias = -0.0015;
    this.scene.add(this.sun, this.sun.target);

    this.world = new World(this.scene, this.save, this.q);
    this.world.onCampLoad = (c, ch) => this.buildCamp(c, ch);

    this.waterMat = new THREE.MeshLambertMaterial({ color: 0x3ab0e0, transparent: true, opacity: 0.78 });
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.waterMat);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = WATER_Y - 0.05;
    this.scene.add(this.water);

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
    this.refreshPetsUi();
    this.resize();
    const ro = () => this.resize();
    window.addEventListener('resize', ro);
    this.offs.push(() => window.removeEventListener('resize', ro));
    if (location.search.includes('debug')) (window as any).__forest = this;
    this.hud.toast(t('floresta.w.hello', 'Mundo aberto! Explore, corte e cave.'));
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
    return g;
  }

  private spawnVehicles(): void {
    const sp = this.save.veh.pos;
    for (let k = 0; k < VDEFS.length; k++) {
      const m = wVehicleModel(k, VDEFS[k].paint);
      this.scene.add(m.g);
      const v: Veh = { k, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, speed: 0, vy: 0, m, cargo: 0, cargoVal: 0, useT: 0, armT: 0, boost: 0, airT: 0 };
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

  private findWater(x: number, z: number): [number, number] {
    const g = this.world.gen;
    for (let r = 20; r < 700; r += 12)
      for (let a = 0; a < TAU; a += 0.35) {
        const wx = x + Math.cos(a) * r;
        const wz = z + Math.sin(a) * r;
        if (g.height(wx, wz) < WATER_Y - 1.2) return [wx, wz];
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

  private nearVeh(): Veh | null {
    let best: Veh | null = null;
    let bd = 4.5 * 4.5;
    for (const v of this.vehs) {
      const d = (v.x - this.px) ** 2 + (v.z - this.pz) ** 2 + ((v.y - this.py) * 0.5) ** 2;
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    return best;
  }

  private toggleVehicle(): void {
    if (this.driving >= 0) {
      const v = this.vehs[this.driving];
      if (v.k === VK.Heli && v.y - Math.max(WATER_Y, this.world.heightAt(v.x, v.z)) > 2.5) {
        this.hud.toast(t('floresta.w.landFirst', 'Pouse antes de sair'));
        return;
      }
      this.driving = -1;
      // sai pelo lado esquerdo
      const lx = v.x - Math.sin(v.yaw) * (v.m.wid * 0.5 + 1.2);
      const lz = v.z - Math.cos(v.yaw) * (v.m.wid * 0.5 + 1.2);
      this.px = lx;
      this.pz = lz;
      this.py = this.world.heightAt(lx, lz);
      this.tYaw = this.yaw = v.yaw - Math.PI / 2;
      this.tPitch = this.pitch = -0.15;
      v.speed = 0;
      this.hand.visible = true;
      this.hud.toast(t('floresta.w.exitVeh', 'Saiu do veículo'));
      return;
    }
    const v = this.nearVeh();
    if (!v) return;
    this.driving = this.vehs.indexOf(v);
    this.hand.visible = false;
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

  private exit(): void {
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
    const c = this.hud.ctl;
    // olhar suavizado (alvo ← dedo; câmera persegue o alvo)
    const ldx = c.lookDX;
    const ldy = c.lookDY;
    c.lookDX = c.lookDY = 0;
    const sens = 0.0052 * (1 + Math.min(1.2, Math.abs(ldx) / 40) * 0.4);
    if (this.driving >= 0) {
      this.camYawOff = clamp(this.camYawOff - ldx * sens, -2.6, 2.6);
      this.tPitch = clamp(this.tPitch - ldy * 0.004, -0.9, 0.4);
      if (ldx || ldy) this.camIdle = 0;
      else this.camIdle += dt;
      if (this.camIdle > 1.6) this.camYawOff *= 1 - damp(2, dt);
    } else {
      this.tYaw -= ldx * sens;
      this.tPitch = clamp(this.tPitch - ldy * 0.0045, -1.3, 1.2);
    }
    const lk = damp(18, dt);
    this.yaw += (this.tYaw - this.yaw) * lk;
    this.pitch += (this.tPitch - this.pitch) * lk;

    if (this.driving >= 0) this.drive(dt);
    else this.walk(dt);
    for (const v of this.vehs) if (this.vehs.indexOf(v) !== this.driving) this.idleVeh(v, dt);

    this.world.update(this.cx(), this.cz(), dt);
    this.stepFalls(dt);
    this.stepLogs(dt);
    this.stepTnt(dt);
    this.stepPets(dt);
    this.stepParticles(dt);
    this.camera.updateMatrixWorld();
    this.updateSky(dt);
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
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    const g = this.world.heightAt(this.px, this.pz);
    const swim = g < WATER_Y - 1.1;
    const sp = (swim ? 3 : 6.2) * (this.carry > 0 ? 0.92 : 1);
    const mx = rx * c.mx + fx * -c.my;
    const mz = rz * c.mx + fz * -c.my;
    const len = Math.hypot(mx, mz);
    const p = { x: this.px + mx * sp * dt, z: this.pz + mz * sp * dt };
    // encosta muito íngreme: escorrega de volta
    const ng = this.world.heightAt(p.x, p.z);
    if (ng - g > 1.6 * sp * dt + 0.05 && !swim) {
      p.x = this.px + (p.x - this.px) * 0.25;
      p.z = this.pz + (p.z - this.pz) * 0.25;
    }
    this.world.pushOutTrees(p, 0.35);
    for (const v of this.vehs) {
      const dx = p.x - v.x;
      const dz = p.z - v.z;
      const r = v.m.len * 0.45;
      if (dx * dx + dz * dz < r * r && Math.abs(this.py - v.y) < 2.5) {
        const d = Math.hypot(dx, dz) || 1;
        p.x = v.x + (dx / d) * r;
        p.z = v.z + (dz / d) * r;
      }
    }
    this.px = p.x;
    this.pz = p.z;
    const gy = this.world.heightAt(this.px, this.pz);
    const floor = swim ? Math.max(gy, WATER_Y - 1.25) : gy;
    this.vy -= 22 * dt;
    this.py += this.vy * dt;
    if (this.py <= floor) {
      this.py = floor;
      this.vy = 0;
    }
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
    // apanha toras do chão
    for (let i = this.logs.length - 1; i >= 0 && this.carry < ON_FOOT_CAP; i--) {
      const l = this.logs[i];
      if (l.claim) continue;
      if ((l.x - this.px) ** 2 + (l.z - this.pz) ** 2 < 1.7 * 1.7 && Math.abs(l.y - this.py) < 2) {
        this.carry++;
        this.carryVal += l.val;
        this.logs.splice(i, 1);
        audio.coin(this.carry);
      }
    }
  }

  private useTool(dt: number): void {
    const c = this.hud.ctl;
    this.swingCd -= dt;
    this.tntCd -= dt;
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    this.aimTree = this.tool === 0 ? this.world.treeNear(this.px + fx * 0.6, this.pz + fz * 0.6, REACH, fx, fz, 0.55) : null;
    if (!c.use || this.swingCd > 0) return;
    if (this.tool === 0) {
      this.swingCd = 0.42;
      this.swing = 1;
      const tr = this.aimTree;
      if (tr) this.hitTree(tr, 2.6, false);
      else audio.click();
    } else if (this.tool === 1) {
      this.swingCd = 0.5;
      this.swing = 1;
      const x = this.px + fx * 2;
      const z = this.pz + fz * 2;
      this.dig(x, z, 1.5, -0.5, false);
    } else if (this.tntCd <= 0) {
      this.swingCd = 0.6;
      this.tntCd = 2.5;
      const x = this.px + fx * 2.2;
      const z = this.pz + fz * 2.2;
      const o = tntModel();
      o.scale.setScalar(1.6);
      const y = this.world.heightAt(x, z);
      o.position.set(x, y, z);
      this.scene.add(o);
      this.tnts.push({ o, x, y, z, t: 2.2 });
      this.hud.toast(t('floresta.w.tntRun', 'Dinamite acesa! Afaste-se!'), 'warn');
      tap('light');
    }
  }

  private dig(x: number, z: number, r: number, dy: number, machine: boolean): void {
    const y = this.world.heightAt(x, z);
    if (y < WATER_Y - 12) {
      this.hud.toast(t('floresta.w.tooDeep', 'Fundo demais!'));
      return;
    }
    const vol = this.world.deform(x, z, r, dy);
    if (vol <= 0.01) return;
    this.save.stats.holes++;
    const b = this.world.biomeAt(x, z);
    const col = WBIOMES[b].dirt;
    this.burst(machine ? 16 : 10, x, y + 0.2, z, col, 4.5);
    audio.tick(1);
    tap('light');
    // achados: minério do bioma (às vezes um meteorito)
    if (Math.random() < (machine ? 0.08 : 0.1)) {
      const oi = Math.random() < 0.04 ? ORES.length - 1 : WBIOMES[b].ore;
      const ore = ORES[oi];
      this.ore += ore.value;
      this.save.stats.ores++;
      this.burst(12, x, y + 0.5, z, ore.color, 3);
      this.hud.toast(t('floresta.w.found', 'Achou {o}! (+{v})', { o: ore.name(), v: ore.value }), 'gold');
      audio.coin(3);
    }
    // árvores no buraco tombam
    for (const tr of this.world.treesInRadius(x, z, r * 0.6)) this.startFall(tr, Math.random() - 0.5, Math.random() - 0.5, false);
  }

  hitTree(tr: TreeRef, dmg: number, pet: boolean): void {
    const k = this.world.treeKey(tr);
    const sp = this.world.treeSp(tr);
    const hp = this.chopHp.get(k) ?? treeHp(sp, this.world.treeRare(tr));
    const nh = hp - dmg;
    const p = this.world.treePos(tr, _v2);
    const s = WSPECIES[sp];
    this.burst(pet ? 3 : 7, p.x, p.y + 1.1, p.z, s.trunk, 3);
    if (!pet) {
      audio.tick(Math.floor(Math.random() * 3));
      tap('light');
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

  private startFall(tr: TreeRef, dx: number, dz: number, pet: boolean): void {
    const key = this.world.treeKey(tr);
    if (this.world.hidden.has(key)) return;
    const d = Math.hypot(dx, dz) || 1;
    const sp = this.world.treeSp(tr);
    const p = this.world.treePos(tr, _v2);
    const mesh = new THREE.Mesh(this.world.treeGeo(sp), this.world.treeMaterial);
    const sc = this.world.treeScale(tr);
    mesh.scale.setScalar(sc);
    mesh.position.set(p.x, p.y - 0.1, p.z);
    mesh.castShadow = this.q.shadows;
    this.scene.add(mesh);
    this.world.hidden.add(key);
    this.world.markTreesDirty();
    this.falls.push({ mesh, ref: tr, x: p.x, y: p.y, z: p.z, dx: dx / d, dz: dz / d, ang: 0, angV: 0.2, sp, rare: this.world.treeRare(tr), scale: sc, byPet: pet });
    audio.crack();
    if (!pet) tap('medium');
  }

  private stepFalls(dt: number): void {
    for (let i = this.falls.length - 1; i >= 0; i--) {
      const f = this.falls[i];
      f.angV += dt * (1.2 + f.ang * 3.5);
      f.ang += f.angV * dt;
      // eixo perpendicular à direção da queda
      _v.set(f.dz, 0, -f.dx);
      f.mesh.quaternion.setFromAxisAngle(_v, Math.min(f.ang, Math.PI / 2));
      if (f.ang < Math.PI / 2 - 0.05) continue;
      // bateu no chão: vira toras
      this.scene.remove(f.mesh);
      this.world.hidden.delete(this.world.treeKey(f.ref));
      this.petTrees.delete(this.world.treeKey(f.ref));
      this.world.fell(f.ref);
      const s = WSPECIES[f.sp];
      const n = s.logs * (f.rare ? 2 : 1);
      const len = s.h * f.scale;
      for (let k = 0; k < n; k++) {
        const t0 = 0.2 + (k / Math.max(1, n)) * 0.6;
        const x = f.x + f.dx * len * t0;
        const z = f.z + f.dz * len * t0;
        this.addLog(x, this.world.heightAt(x, z) + 0.6, z, (Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2, f.sp, s.value * (f.rare ? 3 : 1));
      }
      this.burst(18, f.x + f.dx * len * 0.6, f.y + 0.6, f.z + f.dz * len * 0.6, s.leaf, 5);
      this.trees++;
      this.save.stats.trees++;
      this.save.bookTrees[f.sp] = (this.save.bookTrees[f.sp] ?? 0) + 1;
      audio.crack();
      this.falls.splice(i, 1);
    }
  }

  private addLog(x: number, y: number, z: number, vx: number, vy: number, vz: number, sp: number, val: number): void {
    if (this.logs.length >= MAX_LOGS) {
      const i = this.logs.findIndex((l) => !l.claim);
      if (i >= 0) this.logs.splice(i, 1);
    }
    this.logs.push({ x, y, z, vx, vy, vz, yaw: Math.random() * TAU, roll: 0, sp, val, rest: false, claim: 0 });
  }

  private stepLogs(dt: number): void {
    const L = this.logs;
    let n = 0;
    for (let i = L.length - 1; i >= 0; i--) {
      const l = L[i];
      if (l.claim && l.claim < 100) continue; // carregada por ajudante (desenhada no ajudante)
      const g = this.world.heightAt(l.x, l.z);
      if (!l.rest) {
        l.vy -= 20 * dt;
        l.x += l.vx * dt;
        l.y += l.vy * dt;
        l.z += l.vz * dt;
        l.roll += l.vx * dt;
        if (l.y < g + 0.26) {
          l.y = g + 0.26;
          l.vy *= -0.25;
          l.vx *= 0.6;
          l.vz *= 0.6;
          if (Math.abs(l.vy) < 0.8 && Math.hypot(l.vx, l.vz) < 0.4) l.rest = true;
        }
      } else if (g + 0.26 < l.y - 0.05) {
        // o chão sumiu embaixo (buraco): volta a cair
        l.rest = false;
        l.vy = 0;
      } else l.y = g + 0.26;
      if (l.y < WATER_Y + 0.1 && g < WATER_Y - 0.1) {
        // boia e deriva devagar
        l.y = WATER_Y + 0.05 + Math.sin(this.time * 2 + i) * 0.04;
        l.rest = true;
        l.x += Math.sin(this.time * 0.3 + i) * 0.15 * dt;
      }
      // longe demais: some (o mundo está sendo descarregado)
      if ((l.x - this.cx()) ** 2 + (l.z - this.cz()) ** 2 > (this.q.radius + 1) ** 2 * CH * CH) {
        L.splice(i, 1);
        continue;
      }
    }
    for (const l of L) {
      if (n >= MAX_LOGS) break;
      if (l.claim && l.claim < 100) continue;
      _m.compose(_v.set(l.x, l.y, l.z), _q.setFromEuler(_e.set(l.roll, l.yaw, 0, 'YXZ')), _s.set(1, 1, 1));
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
    this.logMesh.count = n;
    this.logMesh.instanceMatrix.needsUpdate = true;
    if (this.logMesh.instanceColor) this.logMesh.instanceColor.needsUpdate = true;
  }

  private stepTnt(dt: number): void {
    for (let i = this.tnts.length - 1; i >= 0; i--) {
      const b = this.tnts[i];
      b.t -= dt;
      b.o.position.y = this.world.heightAt(b.x, b.z);
      if (Math.random() < 0.6) this.emit(b.x, b.o.position.y + 0.9, b.z, (Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2, 0.4, '#ffd34a');
      if (b.t > 0) continue;
      this.scene.remove(b.o);
      this.tnts.splice(i, 1);
      this.explode(b.x, b.z, 4.5, 2.6);
    }
  }

  /** cratera + árvores derrubadas + toras e jogador arremessados */
  explode(x: number, z: number, r: number, depth: number): void {
    const y = this.world.heightAt(x, z);
    this.world.deform(x, z, r, -depth, depth * 0.3);
    this.save.stats.craters++;
    this.burst(40, x, y + 0.5, z, WBIOMES[this.world.biomeAt(x, z)].dirt, 9);
    this.burst(20, x, y + 0.8, z, '#ffb02e', 7);
    for (const tr of this.world.treesInRadius(x, z, r * 1.5)) {
      const p = this.world.treePos(tr, _v2);
      this.startFall(tr, p.x - x, p.z - z, false);
    }
    for (const l of this.logs) {
      const d = Math.hypot(l.x - x, l.z - z);
      if (d < r * 2 && !l.claim) {
        l.rest = false;
        l.vy = 6 * (1 - d / (r * 2)) + 2;
        l.vx += ((l.x - x) / (d || 1)) * 5;
        l.vz += ((l.z - z) / (d || 1)) * 5;
      }
    }
    const pd = Math.hypot(this.cx() - x, this.cz() - z);
    if (this.driving < 0 && pd < r * 1.6) {
      this.vy = 7;
      this.shake = 0.6;
    } else if (pd < 40) this.shake = 0.35 * (1 - pd / 40);
    if (Math.random() < 0.35) {
      const ore = ORES[WBIOMES[this.world.biomeAt(x, z)].ore];
      this.ore += ore.value * 2;
      this.hud.toast(t('floresta.w.found', 'Achou {o}! (+{v})', { o: ore.name(), v: ore.value * 2 }), 'gold');
    } else this.hud.toast(t('floresta.w.boom', 'BUM! Cratera aberta'));
    audio.crack();
    tap('heavy');
  }
  private shake = 0;

  private poseHand(dt: number, walk: number): void {
    this.swing = Math.max(0, this.swing - dt * 3.2);
    for (let i = 0; i < 3; i++) this.tools[i].visible = i === this.tool;
    const s = this.swing;
    const arc = s > 0.6 ? (1 - s) / 0.4 : s / 0.6;
    const bob = Math.sin(this.walkT) * 0.02 * Math.min(1, walk);
    this.hand.position.set(0.32, -0.42 + bob - arc * 0.1, -0.62);
    if (this.tool === 0) this.hand.rotation.set(-0.2 - arc * 1.3, 0.25, 0.15 + arc * 0.3);
    else if (this.tool === 1) this.hand.rotation.set(-0.9 - arc * 0.8, 0.1, 0.2);
    else this.hand.rotation.set(-0.3 - arc * 0.6, 0, 0.1);
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
      const g = Math.max(WATER_Y, this.world.heightAt(v.x, v.z));
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
    const bx = v.x - Math.cos(cy) * dist * Math.cos(ph * 0.6);
    const bz = v.z + Math.sin(cy) * dist * Math.cos(ph * 0.6);
    let by = v.y + d.camH - ph * dist * 0.6;
    const gy = this.world.heightAt(bx, bz);
    if (by < gy + 1.2) by = gy + 1.2;
    const k = damp(8, dt);
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

  private groundMove(v: Veh, d: VDef, thr: number, steer: number, maxS: number, dt: number): void {
    const g0 = this.world.heightAt(v.x, v.z);
    const depth = WATER_Y - g0;
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
    const g1 = this.world.heightAt(nx, nz);
    const run = Math.abs(v.speed * dt) || 1e-4;
    const grade = (g1 - g0) / run;
    if (v.k === VK.Boat && WATER_Y - g1 < 0.3 && depth >= 0.3) {
      v.speed *= -0.3; // bateu na margem
    } else if (grade > (d.tracks ? 1.6 : 1.1) && v.y <= g0 + 0.2) {
      v.speed *= 0.4; // íngreme demais
    } else {
      v.x = nx;
      v.z = nz;
    }
    // troncos e pedras
    const p = { x: v.x, z: v.z };
    const ahead = { x: v.x + Math.cos(v.yaw) * v.m.len * 0.35, z: v.z - Math.sin(v.yaw) * v.m.len * 0.35 };
    if (v.k === VK.Dozer && Math.abs(v.speed) > 1) {
      for (const tr of this.world.treesInRadius(ahead.x, ahead.z, 1.8)) this.startFall(tr, Math.cos(v.yaw), -Math.sin(v.yaw), false);
    }
    if (this.world.pushOutTrees(ahead, v.m.wid * 0.45)) {
      v.x += ahead.x - (v.x + Math.cos(v.yaw) * v.m.len * 0.35);
      v.z += ahead.z - (v.z - Math.sin(v.yaw) * v.m.len * 0.35);
      if (Math.abs(v.speed) > 4) {
        this.shake = 0.15;
        tap('light');
      }
      v.speed *= v.k === VK.Dozer ? 0.7 : -0.2;
    }
    this.world.pushOutTrees(p, v.m.wid * 0.3);
    v.x = p.x;
    v.z = p.z;
    // gravidade e pouso
    const g = this.world.heightAt(v.x, v.z);
    const floor = v.k === VK.Boat ? Math.max(g, WATER_Y - 0.15) : g;
    if (v.y > floor + 0.05) {
      v.vy -= 20 * dt;
      v.y += v.vy * dt;
      v.airT += dt;
    }
    if (v.y <= floor + 0.05) {
      if (v.vy < -12) this.heavyLanding(v);
      // desce encostas sem "voar" (cola no chão se o degrau é pequeno)
      v.y = floor;
      v.vy = 0;
      v.airT = 0;
    } else if (v.y - floor < 0.6 && v.airT < 0.05) {
      v.y = floor;
      v.vy = 0;
    }
  }

  private heavyLanding(v: Veh): void {
    const r = 1.6 + Math.min(2.5, -v.vy / 10);
    this.world.deform(v.x, v.z, r, -Math.min(1.8, -v.vy / 14), 0.3);
    this.burst(24, v.x, v.y + 0.3, v.z, WBIOMES[this.world.biomeAt(v.x, v.z)].dirt, 6);
    this.save.stats.craters++;
    this.shake = 0.5;
    tap('heavy');
    audio.crack();
    this.hud.toast(t('floresta.w.thud', 'Pancada! O chão afundou'));
  }

  /** veículos sem motorista: assentam no chão (o terreno pode ter mudado) */
  private idleVeh(v: Veh, dt: number): void {
    v.speed *= 1 - damp(3, dt);
    const g = this.world.heightAt(v.x, v.z);
    const floor = v.k === VK.Boat ? Math.max(g, WATER_Y - 0.15) : g;
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
      const air = v.y > this.world.heightAt(v.x, v.z) + 0.3;
      if (!air && v.k !== VK.Boat) {
        const hf = this.world.heightAt(v.x + ca * hl, v.z - sa * hl);
        const hb = this.world.heightAt(v.x - ca * hl, v.z + sa * hl);
        const hL = this.world.heightAt(v.x - sa * hw, v.z - ca * hw);
        const hR = this.world.heightAt(v.x + sa * hw, v.z + ca * hw);
        const tp = Math.atan2(hf - hb, hl * 2);
        const tr = Math.atan2(hL - hR, hw * 2);
        const k = damp(10, dt);
        v.pitch += (tp - v.pitch) * k;
        v.roll += (tr - v.roll) * k;
      } else if (v.k === VK.Boat) {
        v.pitch = Math.sin(this.time * 1.7 + v.x) * 0.03 - v.speed * 0.006;
        v.roll = Math.sin(this.time * 1.3) * 0.03;
        if (v.y <= WATER_Y) v.y = WATER_Y - 0.15 + Math.sin(this.time * 2) * 0.05;
      }
    }
    v.m.g.position.set(v.x, v.y, v.z);
    v.m.g.rotation.set(v.roll, v.yaw, v.pitch, 'YXZ');
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
        this.dig(v.x + fx * 4, v.z + fz * 4, 2.2, -0.75, true);
        break;
      }
      case VK.Dozer: {
        v.useT = 0.3;
        v.armT = 1;
        const x = v.x + fx * 2.4;
        const z = v.z + fz * 2.4;
        this.world.deform(x, z, 2, -0.35, 0, v.y);
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
          if (l.claim || (l.x - v.x) ** 2 + (l.z - v.z) ** 2 > 9 * 9) continue;
          v.cargo++;
          v.cargoVal += l.val;
          this.logs.splice(i, 1);
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
        // larga as toras (do alto: elas caem e afundam o chão)
        const per = v.cargoVal / v.cargo;
        const bx = v.k === VK.Heli ? v.x : v.x - fx * 3;
        const bz = v.k === VK.Heli ? v.z : v.z - fz * 3;
        const h = v.k === VK.Heli ? v.y - 0.8 : v.y + 1;
        for (let i = 0; i < v.cargo; i++) this.addLog(bx + (Math.random() - 0.5) * 2, h + i * 0.2, bz + (Math.random() - 0.5) * 2, 0, 0, 0, 0, per);
        if (v.k === VK.Heli && v.y - this.world.heightAt(v.x, v.z) > 10) this.heavyDrop = { x: bx, z: bz, t: Math.sqrt((2 * (v.y - this.world.heightAt(bx, bz))) / 20), n: v.cargo };
        v.cargo = 0;
        v.cargoVal = 0;
        v.useT = 1.2;
        break;
      }
      case VK.Boat:
        v.useT = 1.5;
        audio.click();
        this.hud.toast(t('floresta.w.horn', 'Fom fom!'));
        break;
      case VK.Forklift:
        v.useT = 0.6;
        v.armT = 1;
        break;
    }
  }
  private heavyDrop: { x: number; z: number; t: number; n: number } | null = null;

  /** coleta automática de toras pelo veículo */
  private collect(v: Veh): void {
    const d = VDEFS[v.k];
    if (this.heavyDrop) {
      const h = this.heavyDrop;
      h.t -= 1 / 60;
      if (h.t <= 0) {
        this.heavyDrop = null;
        this.world.deform(h.x, h.z, 1.5 + h.n * 0.2, -Math.min(2, 0.5 + h.n * 0.25), 0.3);
        this.save.stats.craters++;
        this.burst(20, h.x, this.world.heightAt(h.x, h.z) + 0.3, h.z, '#8a6440', 6);
        this.hud.toast(t('floresta.w.thud', 'Pancada! O chão afundou'));
      }
    }
    if (!d.cap || v.cargo >= d.cap) return;
    if (v.k === VK.Heli && v.y - Math.max(WATER_Y, this.world.heightAt(v.x, v.z)) > 7) return;
    const r = d.reach + v.m.len * 0.3;
    for (let i = this.logs.length - 1; i >= 0 && v.cargo < d.cap; i--) {
      const l = this.logs[i];
      if (l.claim) continue;
      if ((l.x - v.x) ** 2 + (l.z - v.z) ** 2 < r * r && Math.abs(l.y - v.y) < (v.k === VK.Heli ? 8 : 3)) {
        v.cargo++;
        v.cargoVal += l.val;
        this.logs.splice(i, 1);
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
        this.cargoMesh.setColorAt(n, _c.set('#9a6a3c'));
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
          const a = (p.i - 1) * 0.8 + Math.PI;
          const back = leader ? leader.yaw : -this.yaw - Math.PI / 2;
          tx = lx + Math.cos(back + a) * (3 + p.i * 0.6);
          tz = lz - Math.sin(back + a) * (3 + p.i * 0.6);
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
            this.logs[best].claim = 100 + p.i;
            this.claimed[p.i] = this.logs[best];
            p.log = 1;
          }
          const l = this.claimed[p.i]!;
          tx = l.x;
          tz = l.z;
          speed = 5;
          if (Math.hypot(l.x - p.x, l.z - p.z) < 1) {
            l.claim = 1;
            p.carrying = l;
            this.logs.splice(this.logs.indexOf(l), 1);
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
            } else if (!leader && this.carry < ON_FOOT_CAP) {
              this.carry++;
              this.carryVal += l.val;
            } else {
              l.claim = 0;
              l.rest = false;
              l.x = p.x;
              l.z = p.z;
              l.y = p.y + 1;
              l.vx = l.vy = l.vz = 0;
              this.logs.push(l);
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
      p.y = Math.max(g, WATER_Y - 0.4);
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

  private emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, col: string): void {
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
  private burst(n: number, x: number, y: number, z: number, col: string, sp: number): void {
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
      const wb = WBIOMES[this.world.lastBest];
      this.waterMat.color.lerp(_c.set(wb.water), 0.2);
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
    const s = (this.q.radius * 2 + 3) * CH;
    this.water.position.set(cx, WATER_Y - 0.05, cz);
    this.water.scale.set(s, s, 1);
    this.sun.position.set(cx + 30, 60, cz + 18);
    this.sun.target.position.set(cx, 0, cz);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.5;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.5;
    }
  }

  private updateHud(_dt: number): void {
    const h = this.hud;
    const v = this.driving >= 0 ? this.vehs[this.driving] : null;
    h.set('coins', short(this.save.coins));
    if (v) {
      const cap = VDEFS[v.k].cap;
      h.set('carry', cap ? `${v.cargo}/${cap}` : '—');
    } else h.set('carry', `${this.carry}/${ON_FOOT_CAP}${this.ore ? ' +' + short(this.ore) : ''}`);
    const camp = this.world.gen.nearestCamp(this.cx(), this.cz());
    if (camp) {
      const dx = camp.x - this.cx();
      const dz = camp.z - this.cz();
      const d = Math.hypot(dx, dz);
      h.set('camp', d < 14 ? t('floresta.w.atMill', 'Serraria') : `${Math.round(d)} m`);
      // seta relativa à direção da câmera
      const camYaw = v ? v.yaw + this.camYawOff - Math.PI / 2 : this.yaw;
      const a = Math.atan2(dx, -dz) + camYaw;
      h.arrow(a);
    }
    const near = !v ? this.nearVeh() : null;
    h.show('.fw-veh', !!v || !!near);
    if (v) h.set('veh', `${WICONS.exitv}<span>${t('floresta.w.exit', 'Sair')}</span>`, true);
    else if (near) h.set('veh', `${flIcon('wheel', 24)}<span>${VDEFS[near.k].name()}</span>`, true);
    const canSell = !!this.campNear(16) && (this.carry > 0 || this.ore > 0 || (!!v && v.cargo > 0) || this.vehs.some((x) => x.cargo > 0 && !!this.world.gen.nearestCamp(x.x, x.z, 18)));
    h.show('.fw-sell', canSell);
    h.show('.fw-tool', !v);
    h.show('.fw-up', !!v && v.k === VK.Heli);
    h.show('.fw-down', !!v && v.k === VK.Heli);
    const useLbl = v ? VDEFS[v.k].use() : [t('floresta.chop', 'Cortar'), t('floresta.w.dig', 'Cavar'), t('floresta.w.place', 'Acender')][this.tool];
    h.set('use', useLbl);
    h.set('useI', v ? flIcon('wheel', 34) : this.toolIcon(), true);
    this.drawCargo();
  }

  /* ------------------------------ ciclo de vida ------------------------------ */

  persist(): void {
    const s = this.save;
    s.px = this.driving >= 0 ? this.vehs[this.driving].x - 3 : this.px;
    s.pz = this.driving >= 0 ? this.vehs[this.driving].z : this.pz;
    s.yaw = this.yaw;
    s.time += 0;
    s.veh.pos = this.vehs.map((v) => [Math.round(v.x * 10) / 10, Math.round(v.z * 10) / 10, Math.round(v.yaw * 100) / 100, v.cargo, Math.round(v.cargoVal)]);
    this.world.storeAll();
    writeWorld(s);
  }

  setTier(tier: Tier, _s?: QualitySettings): void {
    const nq = wq(tier);
    Object.assign(this.q, nq);
    this.renderer.setPixelRatio(nq.pr);
    this.resize();
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
    this.world.dispose();
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
    if (this.driving >= 0) this.vehs[this.driving].y = Math.max(this.py, this.vehs[this.driving].k === VK.Boat ? WATER_Y : -99);
    for (const p of this.pets) {
      p.x = x + p.i;
      p.z = z + 2;
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
