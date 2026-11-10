/* ============================================================
 *  LENHADORES DO BOSQUE — 3D em PRIMEIRA PESSOA (three.js + cannon-es).
 *  Carregado sob demanda (chunk separado). A simulação (sim.ts) é a
 *  mesma do 2D: economia, árvores, ajudantes, serraria, online.
 *  Aqui: mão com a ferramenta, mira, golpes com tremida e lascas,
 *  "MADEIRAAA!" com queda física, toras que rolam morro abaixo, pegar,
 *  jogar e chutar toras, veículo dirigível com caçamba, funil, esteira.
 * ============================================================ */
import * as THREE from 'three';
import { Forearm } from '../../3d/common/hand';
import * as CANNON from 'cannon-es';
import { t } from '../../i18n';
import { gameFont } from '../../i18n/font';
import { audio } from '../../core/audio';
import { tap } from '../../core/haptics';
import { drawPlayer, type PlayerPose } from '../../game/character';
import { SKINS } from '../../game/skins';
import { save as globalSave } from '../../core/storage';
import type { QualitySettings, Tier } from '../../core/quality';
import { BIOMES, BUILDS, INTAKE_X, RARES, SPECIES, TOOLS, VEHICLES, WORLD_Z, gateX, short } from './data';
import { PALLET_X, PLANER_X, SAW_X, SELL_X, TS, type Ev, type Sim, type Tree } from './sim';
import { flIcon } from './icons';
import type { View } from './game';
import { WORLD_X1, buildGroundBody, buildGroundMeshes, groundH } from './fps/terrain';
import {
  INK, birdTexture, bushGeometry, dotTexture, geoms, handTexture, impostorAtlas, impostorGeometry, lambert, logCapGeometry, logSideGeometry,
  myHandColors, steeringWheel, stumpGeometry, toolModel, treeGeometry, vehicleModel, type VehModel,
} from './fps/models';

const TAU = Math.PI * 2;
const VIEW_R = 62;
const MAXP = 900;
const MAX_LOG_INST = 170;
const HAND_CAP = 2;
const EYE = 1.55;
const REACH = 3.1;
const G_GROUND = 1;
const G_LOG = 2;
const G_TREE = 4;
const G_PLAYER = 8;
const G_VEH = 16;
const G_STATIC = 32;

interface Q {
  pr: number;
  shadows: boolean;
  bodies: number;
  particles: number;
  deco: number;
  aa: boolean;
  /** modelos mais leves (copas com menos polígonos) */
  lite: boolean;
}
function qFor(tier: Tier): Q {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  return [
    { pr: Math.min(dpr, 0.6), shadows: false, bodies: 8, particles: 0.35, deco: 0.4, aa: false, lite: true },
    { pr: Math.min(dpr, 0.8), shadows: false, bodies: 14, particles: 0.6, deco: 0.65, aa: false, lite: true },
    { pr: Math.min(dpr, 1.0), shadows: false, bodies: 24, particles: 0.85, deco: 0.85, aa: true, lite: false },
    { pr: Math.min(dpr, 1.5), shadows: true, bodies: 40, particles: 1, deco: 1, aa: true, lite: false },
  ][tier];
}

const _w = new THREE.Vector3();
const _vInv = new THREE.Matrix4();
export async function createView3D(root: HTMLElement, sim: Sim, tier: Tier): Promise<View> {
  return new View3D(root, sim, tier);
}

const FOG: [number, number][] = [
  [26, 78],
  [22, 66],
  [16, 56],
  [24, 74],
  [12, 50],
  [30, 86],
  [14, 58],
];
/** raio do tronco perto do chão */
const trunkR = (sp: number): number => {
  const s = SPECIES[sp].shape;
  return s === 'mushroom' ? 0.72 : s === 'palm' ? 0.3 : s === 'pine' || s === 'crystal' ? 0.33 : 0.38;
};

interface TreeVis {
  gy: number;
  rotY: number;
  creak: number;
  body: CANNON.Body | null;
  mesh: THREE.Mesh | null;
  fallT: number;
  hitGround: boolean;
  /** direção do entalhe (unitária, para fora do tronco) */
  nx: number;
  nz: number;
  pop: number;
}
interface Held {
  val: number;
  sp: number;
  rare: number;
}
interface Fly {
  on: boolean;
  t: number;
  dur: number;
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  sp: number;
  rare: number;
  val: number;
  /** 0: vai para a caçamba, 1: vai para o funil */
  to: number;
}
interface Bird {
  s: THREE.Sprite;
  life: number;
  vx: number;
  vy: number;
  vz: number;
}
interface AgentVis {
  g: THREE.Group;
  spr: THREE.Sprite | null;
  tool: THREE.Object3D | null;
  carry: THREE.Object3D | null;
  emo: THREE.Sprite | null;
  emoCode: string;
  bonk: number;
  rot: THREE.Object3D[];
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const AXIS = new THREE.Vector3();

class View3D implements View {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  cam: THREE.PerspectiveCamera;
  vmScene = new THREE.Scene();
  vmCam: THREE.PerspectiveCamera;
  world: CANNON.World;
  q: Q;
  private yaw = Math.PI / 2;
  private pitch = -0.12;
  private camY = EYE;
  private shake = 0;
  private roll = 0;
  private rollV = 0;
  private time = 0;
  private bob = 0;
  private lookDX = 0;
  private lookDY = 0;
  private offs: (() => void)[] = [];
  private mats: THREE.Material[] = [];
  private texs: THREE.Texture[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private logMat: CANNON.Material;
  private groundMat: CANNON.Material;
  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private sky!: THREE.Mesh;
  private skyU = { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, bot: { value: new THREE.Color() } };
  private skyT = [new THREE.Color(), new THREE.Color(), new THREE.Color()];
  private stars!: THREE.Points;
  private sunSpr!: THREE.Sprite;
  private clouds: THREE.Sprite[] = [];
  private biome = -1;
  private fogT: [number, number] = [26, 78];
  // árvores
  private tv: TreeVis[] = [];
  private treeGeo = new Map<number, THREE.BufferGeometry>();
  private treeInst = new Map<number, THREE.InstancedMesh>();
  private treeMat: THREE.MeshLambertMaterial;
  private glowMat: THREE.MeshLambertMaterial;
  private stumps!: THREE.InstancedMesh;
  private notches!: THREE.InstancedMesh;
  private fallPool: THREE.Mesh[] = [];
  private bushes: THREE.InstancedMesh[] = [];
  private bushOf: Int32Array = new Int32Array(0);
  private bushLoc: Int32Array = new Int32Array(0);
  private bushPos: Float32Array = new Float32Array(0);
  private bushSq: Float32Array = new Float32Array(0);
  private bushDirty = new Set<number>();
  // toras
  private logSide!: THREE.InstancedMesh;
  private logCap!: THREE.InstancedMesh;
  private logN = 0;
  private bodies: (CANNON.Body | null)[] = [];
  private lq: Float32Array;
  private lqSet: Uint8Array;
  private bodyCount = 0;
  private sphere = new CANNON.Sphere(0.3);
  private marker!: THREE.Mesh;
  // jogador
  private pBody: CANNON.Body;
  private held: Held[] = [];
  private aimTree = -1;
  private aimLog = -1;
  private aimPt = new THREE.Vector3();
  private aimDist = 3;
  private prevSwing = 0;
  private hitStop = 0;
  private bonkCD = 0;
  // veículo
  private veh: VehModel | null = null;
  private vehLvl = 0;
  private vx = INTAKE_X + 7;
  private vz = 3.6;
  private vh = Math.PI / 2;
  private vSpeed = 0;
  private vSteer = 0;
  private vBounce = 0;
  private vBounceV = 0;
  private vBody: CANNON.Body | null = null;
  private driving = false;
  private headYaw = 0;
  private load: Held[] = [];
  private dumpT = 0;
  private bedTilt = 0;
  private joyX = 0;
  private joyY = 0;
  private flies: Fly[] = [];
  // primeira pessoa
  private vmRoot = new THREE.Group();
  private portrait = false;
  private vmTool = new THREE.Group();
  private vmToolMesh: THREE.Group | null = null;
  private vmTip: THREE.Object3D | null = null;
  private vmSpin: THREE.Object3D | null = null;
  private toolLvl = -1;
  private handR!: THREE.Mesh;
  private handL!: THREE.Mesh;
  private armR!: Forearm;
  private armL!: Forearm;
  private heldGroup = new THREE.Group();
  private heldLogs: THREE.Group[] = [];
  private wheel!: THREE.Group;
  private beam!: THREE.Mesh;
  private grabAnim = 0;
  private throwAnim = 0;
  private kickAnim = 0;
  private lagX = 0;
  private lagY = 0;
  // serraria
  private blade!: THREE.Group;
  private beltTex!: THREE.CanvasTexture;
  private planks!: THREE.InstancedMesh;
  private stack!: THREE.InstancedMesh;
  private drum!: THREE.Mesh;
  private gates: THREE.Group[] = [];
  private gateBuilt: boolean[] = [];
  private gateBody: CANNON.Body;
  private gateAt = -1;
  /** caixas (XZ) que o jogador não atravessa: x0,z0,x1,z1 */
  private solids: number[] = [];
  // agentes
  private agentVis = new Map<object, AgentVis>();
  private heroTexs = new Map<string, THREE.Texture>();
  private emoTexs = new Map<string, THREE.Texture>();
  private seen = new Set<object>();
  private birds: Bird[] = [];
  private birdMats: THREE.SpriteMaterial[] = [];
  // partículas
  private pPos: Float32Array;
  private pCol: Float32Array;
  private pVel: Float32Array;
  private pLife: Float32Array;
  private pGrav: Float32Array;
  private pGeo: THREE.BufferGeometry;
  private pNext = 0;
  private ambT = 0;
  // interface
  private ui: HTMLDivElement;
  private ret!: HTMLDivElement;
  private tgt!: HTMLDivElement;
  private tgtBar!: HTMLElement;
  private tgtName!: HTMLElement;
  private btnGrab!: HTMLButtonElement;
  private btnThrow!: HTMLButtonElement;
  private btnDrive!: HTMLButtonElement;
  private timber!: HTMLDivElement;
  private timberT = 0;
  private uiSig = '';
  private drag = { id: -1, x: 0, y: 0 };

  constructor(
    private root: HTMLElement,
    private sim: Sim,
    tier: Tier,
  ) {
    this.q = qFor(tier);
    sim.fps = true;
    sim.groundY = groundH;
    this.renderer = new THREE.WebGLRenderer({ antialias: this.q.aa, powerPreference: 'high-performance', stencil: false });
    if (!this.renderer.getContext()) throw new Error('webgl');
    this.renderer.setPixelRatio(this.q.pr);
    this.renderer.shadowMap.enabled = this.q.shadows;
    this.renderer.autoClear = false;
    this.renderer.info.autoReset = false;
    this.renderer.domElement.className = 'fl-canvas';
    root.appendChild(this.renderer.domElement);
    this.cam = new THREE.PerspectiveCamera(70, 1, 0.08, 100);
    this.vmCam = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    this.scene.fog = new THREE.Fog(0xbfe8ff, 26, 78);
    this.treeMat = this.track(new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.glowMat = this.track(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x3a3a70 }));

    // física
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -20, 0) });
    this.world.allowSleep = true;
    this.world.broadphase = new CANNON.NaiveBroadphase();
    (this.world.solver as CANNON.GSSolver).iterations = 6;
    this.groundMat = new CANNON.Material('ground');
    this.logMat = new CANNON.Material('log');
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.groundMat, this.logMat, { friction: 0.45, restitution: 0.25 }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.logMat, this.logMat, { friction: 0.3, restitution: 0.3 }));
    const ground = buildGroundBody(this.groundMat);
    ground.collisionFilterGroup = G_GROUND;
    this.world.addBody(ground);
    this.gateBody = new CANNON.Body({ mass: 0, material: this.groundMat, collisionFilterGroup: G_STATIC });
    this.gateBody.addShape(new CANNON.Box(new CANNON.Vec3(0.5, 12, 16)));
    this.world.addBody(this.gateBody);
    this.pBody = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, collisionFilterGroup: G_PLAYER, collisionFilterMask: G_LOG });
    this.pBody.addShape(new CANNON.Sphere(0.42));
    this.pBody.allowSleep = false;
    this.world.addBody(this.pBody);

    // partículas
    this.pPos = new Float32Array(MAXP * 3);
    this.pCol = new Float32Array(MAXP * 3);
    this.pVel = new Float32Array(MAXP * 3);
    this.pLife = new Float32Array(MAXP);
    this.pGrav = new Float32Array(MAXP);
    for (let i = 0; i < MAXP; i++) this.pPos[i * 3 + 1] = -500;
    this.pGeo = this.trackG(new THREE.BufferGeometry());
    this.pGeo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    this.pGeo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    const dot = this.trackT(dotTexture());
    const pts = new THREE.Points(this.pGeo, this.track(new THREE.PointsMaterial({ size: 0.13, vertexColors: true, map: dot, alphaTest: 0.5, sizeAttenuation: true })));
    pts.frustumCulled = false;
    this.scene.add(pts);

    this.lq = new Float32Array(sim.logs.length * 4);
    this.lqSet = new Uint8Array(sim.logs.length);
    for (let i = 0; i < sim.logs.length; i++) this.bodies.push(null);

    this.buildSky();
    this.buildLights();
    buildGroundMeshes(this.scene, this.track(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
    this.buildTrees();
    this.buildDeco();
    this.buildLogs();
    this.buildBase();
    this.buildGates();
    this.buildViewModel();
    this.buildBirds();
    this.ui = this.buildUI();
    this.bindInput();
    // começa olhando para o bosque, ao lado da serraria
    sim.me.x = INTAKE_X + 5;
    sim.me.z = -2.5;
    this.camY = groundH(sim.me.x, sim.me.z) + EYE;
    this.resize();
  }

  /* ------------------------------ recursos ------------------------------ */

  private track<T extends THREE.Material>(m: T): T {
    this.mats.push(m);
    return m;
  }
  private trackT<T extends THREE.Texture>(t: T): T {
    this.texs.push(t);
    return t;
  }
  private trackG<T extends THREE.BufferGeometry>(g: T): T {
    this.geos.push(g);
    return g;
  }
  private box(w: number, h: number, d: number, color: string, x: number, y: number, z: number, parent: THREE.Object3D = this.scene, e = 0): THREE.Mesh {
    const m = new THREE.Mesh(geoms.box, this.track(lambert(color, e)));
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    m.castShadow = this.q.shadows;
    m.receiveShadow = this.q.shadows;
    parent.add(m);
    return m;
  }
  private label(text: string, color = '#fff', scale = 1): THREE.Sprite {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const x = c.getContext('2d')!;
    x.font = gameFont(800, 64);
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.lineWidth = 14;
    x.lineJoin = 'round';
    x.strokeStyle = INK;
    x.strokeText(text, 256, 68, 490);
    x.fillStyle = color;
    x.fillText(text, 256, 68, 490);
    const tex = this.trackT(new THREE.CanvasTexture(c));
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(this.track(new THREE.SpriteMaterial({ map: tex, depthWrite: false, fog: false })));
    s.scale.set(4 * scale, 1 * scale, 1);
    return s;
  }

  /* ------------------------------ céu e luz ------------------------------ */

  private buildSky(): void {
    const mat = this.track(
      new THREE.ShaderMaterial({
        uniforms: this.skyU,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: 'varying float vy; void main(){ vy = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader:
          'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying float vy; void main(){ vec3 c = vy > 0.0 ? mix(mid, top, pow(clamp(vy*1.6,0.0,1.0),0.8)) : mix(mid, bot, clamp(-vy*4.0,0.0,1.0)); gl_FragColor = vec4(c,1.0); }',
      }),
    );
    this.sky = new THREE.Mesh(this.trackG(new THREE.SphereGeometry(90, 16, 10)), mat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
    // estrelas (bioma noturno)
    const sp: number[] = [];
    for (let i = 0; i < 260; i++) {
      const a = Math.random() * TAU;
      const e = 0.15 + Math.random() * 1.3;
      sp.push(Math.cos(a) * Math.cos(e) * 85, Math.sin(e) * 85, Math.sin(a) * Math.cos(e) * 85);
    }
    const sg = this.trackG(new THREE.BufferGeometry());
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, this.track(new THREE.PointsMaterial({ color: 0xfff6d6, size: 1.6, sizeAttenuation: false, fog: false })));
    this.stars.frustumCulled = false;
    this.stars.visible = false;
    this.scene.add(this.stars);
    // sol/lua
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d')!;
    const g = x.createRadialGradient(64, 64, 20, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,240,1)');
    g.addColorStop(0.45, 'rgba(255,250,210,1)');
    g.addColorStop(0.5, 'rgba(255,240,180,0.5)');
    g.addColorStop(1, 'rgba(255,240,180,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    const st = this.trackT(new THREE.CanvasTexture(c));
    this.sunSpr = new THREE.Sprite(this.track(new THREE.SpriteMaterial({ map: st, fog: false, depthWrite: false, transparent: true })));
    this.sunSpr.scale.setScalar(22);
    this.scene.add(this.sunSpr);
    // nuvens fofinhas
    const cc = document.createElement('canvas');
    cc.width = 256;
    cc.height = 128;
    const cx = cc.getContext('2d')!;
    cx.fillStyle = '#ffffff';
    for (const [px, py, r] of [
      [70, 80, 40],
      [120, 60, 52],
      [175, 78, 40],
      [100, 90, 34],
      [150, 92, 34],
    ]) {
      cx.beginPath();
      cx.arc(px, py, r, 0, TAU);
      cx.fill();
    }
    cx.fillStyle = 'rgba(200,215,240,0.6)';
    cx.fillRect(40, 100, 180, 4);
    const ct = this.trackT(new THREE.CanvasTexture(cc));
    const cm = this.track(new THREE.SpriteMaterial({ map: ct, fog: false, depthWrite: false, transparent: true, opacity: 0.92 }));
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Sprite(cm);
      s.scale.set(26 + (i % 3) * 8, 13 + (i % 3) * 4, 1);
      s.userData.ox = (i * 37) % 160;
      s.userData.oz = ((i * 53) % 140) - 70;
      s.userData.h = 32 + (i % 4) * 5;
      this.scene.add(s);
      this.clouds.push(s);
    }
  }

  private buildLights(): void {
    this.hemi = new THREE.HemisphereLight(0xeaf6ff, 0x5a7a3a, 1.5);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2d0, 1.7);
    this.sun.position.set(-10, 20, 8);
    if (this.q.shadows) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(1024, 1024);
      const c = this.sun.shadow.camera;
      c.left = c.bottom = -22;
      c.right = c.top = 22;
      c.near = 1;
      c.far = 80;
    }
    this.scene.add(this.sun, this.sun.target);
    // viewmodel: luz própria
    this.vmScene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a6a, 1.6));
    const d = new THREE.DirectionalLight(0xffffff, 1.4);
    d.position.set(-1, 2, 1.5);
    this.vmScene.add(d);
    this.vmScene.add(this.vmCam);
  }

  /* ------------------------------ árvores ------------------------------ */

  private geoFor(sp: number, rare: number): THREE.BufferGeometry {
    const k = sp * 4 + rare;
    let g = this.treeGeo.get(k);
    if (!g) {
      g = this.trackG(treeGeometry(SPECIES[sp], rare, 0, this.q.lite));
      this.treeGeo.set(k, g);
    }
    return g;
  }
  private instFor(sp: number, rare: number): THREE.InstancedMesh {
    const k = sp * 4 + rare;
    let m = this.treeInst.get(k);
    if (!m) {
      let cap = 0;
      for (const tr of this.sim.trees) if (tr.sp === sp) cap++;
      const glow = sp === 4 || sp === 5 || rare >= 2;
      m = new THREE.InstancedMesh(this.geoFor(sp, rare), glow ? this.glowMat : this.treeMat, Math.max(1, cap));
      m.count = 0;
      m.castShadow = this.q.shadows;
      m.frustumCulled = false;
      this.scene.add(m);
      this.treeInst.set(k, m);
    }
    return m;
  }

  private buildTrees(): void {
    for (const tr of this.sim.trees) {
      const a = (tr.id * 1.7) % TAU;
      this.tv.push({ gy: groundH(tr.x, tr.z), rotY: a, creak: 0, body: null, mesh: null, fallT: 0, hitGround: false, nx: -1, nz: 0, pop: 0 });
    }
    for (let sp = 0; sp < SPECIES.length; sp++) this.instFor(sp, 0);
    const n = this.sim.trees.length;
    this.stumps = new THREE.InstancedMesh(this.trackG(stumpGeometry()), this.treeMat, n);
    this.stumps.frustumCulled = false;
    this.scene.add(this.stumps);
    const ng = this.trackG(new THREE.OctahedronGeometry(1, 0));
    this.notches = new THREE.InstancedMesh(ng, this.track(lambert('#ffe2b0', 0.15)), 24);
    this.notches.frustumCulled = false;
    this.scene.add(this.notches);
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(this.geoFor(0, 0), this.treeMat);
      m.visible = false;
      m.castShadow = this.q.shadows;
      this.scene.add(m);
      this.fallPool.push(m);
    }
  }

  /** arbustos (amassáveis), árvores de fundo em 3D e impostores 2D bem longe */
  private buildDeco(): void {
    const r = mulberry32(777);
    const bush: number[] = [];
    for (let x = -30; x < WORLD_X1; x += 2.2 / this.q.deco) {
      for (const side of [-1, 1]) {
        if (r() < 0.55) {
          const z = side * (4.8 + r() * 5);
          if (x > -2 && x < 36 && Math.abs(z) < 7) continue;
          bush.push(x + r() * 1.5, z, 0.6 + r() * 0.7);
        }
      }
      if (x > 40 && r() < 0.18) bush.push(x + 0.7, (r() - 0.5) * 9, 0.5 + r() * 0.4);
    }
    const nb = bush.length / 3;
    this.bushPos = new Float32Array(bush);
    this.bushSq = new Float32Array(nb);
    // pedaços de ~60 m (frustum culling)
    this.bushOf = new Int32Array(nb);
    this.bushLoc = new Int32Array(nb);
    const bg = this.trackG(bushGeometry());
    let start = 0;
    while (start < nb) {
      const x0 = this.bushPos[start * 3];
      let end = start;
      while (end < nb && this.bushPos[end * 3] < x0 + 60) end++;
      const im = new THREE.InstancedMesh(bg, this.treeMat, end - start);
      for (let i = start; i < end; i++) {
        this.bushOf[i] = this.bushes.length;
        this.bushLoc[i] = i - start;
      }
      this.bushes.push(im);
      this.scene.add(im);
      start = end;
    }
    for (let i = 0; i < nb; i++) {
      this.setBush(i);
      const x = this.bushPos[i * 3];
      const B = BIOMES[x < gateX(0) ? 0 : Math.min(BIOMES.length - 1, Math.floor((x - gateX(0)) / (gateX(1) - gateX(0))))];
      _c.set(B.id === 'nuvens' ? '#ffffff' : B.id === 'cristal' ? '#a8d8ff' : B.id === 'cogumelos' ? '#8a6ad8' : B.id === 'cerejeiras' ? '#ffb3d1' : '#5cbf4a');
      _c.offsetHSL((r() - 0.5) * 0.04, 0, (r() - 0.5) * 0.1);
      this.bushes[this.bushOf[i]].setColorAt(this.bushLoc[i], _c);
    }
    for (const im of this.bushes) im.computeBoundingSphere();

    // árvores de fundo (3D simplificado) e impostores
    const atlas = this.trackT(impostorAtlas());
    const impMat = this.track(new THREE.MeshLambertMaterial({ map: atlas, alphaTest: 0.5, side: THREE.DoubleSide }));
    const segs = [-40, ...BIOMES.map((_, b) => gateX(b)), WORLD_X1];
    for (let k = 0; k < segs.length - 1; k++) {
      // um pedaço por bioma: o frustum culling corta o que está longe
      const near: number[][] = SPECIES.map(() => []);
      const far: number[][] = SPECIES.map(() => []);
      const sp = BIOMES[Math.max(0, k - 1)].species;
      const alt = k <= 1 ? 1 : sp;
      for (let x = segs[k]; x < segs[k + 1]; x += 3.4 / this.q.deco) {
        for (const side of [-1, 1]) {
          const z = side * (10 + r() * 12);
          near[r() < 0.75 ? sp : alt].push(x + r() * 2, z, 0.8 + r() * 0.5, r() * TAU);
          for (let j = 0; j < 2; j++) {
            const zf = side * (24 + r() * 40);
            far[r() < 0.8 ? sp : alt].push(x + r() * 3, zf, 0.9 + r() * 0.7, 0);
          }
        }
      }
      this.decoChunk(near, far, impMat);
    }
  }

  private decoGeo = new Map<string, THREE.BufferGeometry>();
  private decoChunk(near: number[][], far: number[][], impMat: THREE.Material): void {
    for (let sp = 0; sp < SPECIES.length; sp++) {
      const list = near[sp];
      if (list.length) {
        let dg = this.decoGeo.get('n' + sp);
        if (!dg) this.decoGeo.set('n' + sp, (dg = this.trackG(treeGeometry(SPECIES[sp], 0, 1))));
        const im = new THREE.InstancedMesh(dg, sp === 4 || sp === 5 ? this.glowMat : this.treeMat, list.length / 4);
        for (let i = 0; i < list.length / 4; i++) {
          const x = list[i * 4];
          const z = list[i * 4 + 1];
          const s = list[i * 4 + 2];
          _m.compose(_v.set(x, groundH(x, z) - 0.1, z), _q.setFromAxisAngle(UP, list[i * 4 + 3]), _s.set(s, s, s));
          im.setMatrixAt(i, _m);
        }
        im.computeBoundingSphere();
        this.scene.add(im);
      }
      const fl = far[sp];
      if (fl.length) {
        const h = SPECIES[sp].h * 1.05;
        let dg = this.decoGeo.get('f' + sp);
        if (!dg) this.decoGeo.set('f' + sp, (dg = this.trackG(impostorGeometry(sp, h))));
        const im = new THREE.InstancedMesh(dg, impMat, fl.length / 4);
        for (let i = 0; i < fl.length / 4; i++) {
          const x = fl[i * 4];
          const z = fl[i * 4 + 1];
          const s = fl[i * 4 + 2];
          _m.compose(_v.set(x, groundH(x, z) - 0.2, z), _q.setFromAxisAngle(UP, (i * 0.7) % 1.5), _s.set(s, s, s));
          im.setMatrixAt(i, _m);
        }
        im.computeBoundingSphere();
        this.scene.add(im);
      }
    }
  }

  private setBush(i: number): void {
    const x = this.bushPos[i * 3];
    const z = this.bushPos[i * 3 + 1];
    const s = this.bushPos[i * 3 + 2];
    const q = this.bushSq[i];
    const wob = q > 0 ? Math.sin(q * 18) * 0.15 * q : 0;
    _m.compose(_v.set(x, groundH(x, z) - 0.05, z), _q.setFromAxisAngle(UP, x * 1.3), _s.set(s * (1 + q * 0.6 + wob), s * Math.max(0.25, 1 - q * 0.75 - wob), s * (1 + q * 0.6 + wob)));
    const im = this.bushes[this.bushOf[i]];
    im.setMatrixAt(this.bushLoc[i], _m);
    im.instanceMatrix.needsUpdate = true;
  }

  /* ------------------------------ toras ------------------------------ */

  private buildLogs(): void {
    this.logSide = new THREE.InstancedMesh(this.trackG(logSideGeometry()), this.track(new THREE.MeshLambertMaterial({ vertexColors: true })), MAX_LOG_INST);
    this.logCap = new THREE.InstancedMesh(this.trackG(logCapGeometry()), this.track(new THREE.MeshLambertMaterial({ vertexColors: true })), MAX_LOG_INST);
    for (const m of [this.logSide, this.logCap]) {
      m.frustumCulled = false;
      m.castShadow = this.q.shadows;
      m.count = 0;
      this.scene.add(m);
    }
    // marcador da tora sob a mira
    const mg = this.trackG(new THREE.ConeGeometry(0.16, 0.3, 4));
    mg.rotateX(Math.PI);
    this.marker = new THREE.Mesh(mg, this.track(new THREE.MeshBasicMaterial({ color: 0xffd34a, fog: false })));
    this.marker.visible = false;
    this.scene.add(this.marker);
  }

  private logColor(sp: number, rare: number, out: THREE.Color): THREE.Color {
    return out.set(rare ? RARES[rare].color : SPECIES[sp].trunk);
  }
  private capColor(sp: number, rare: number, out: THREE.Color): THREE.Color {
    return out.set(rare ? '#fff6c0' : sp === 5 ? '#d8f4ff' : sp === 4 ? '#fff0e0' : sp === 6 ? '#ffffff' : '#ffe2b0');
  }
  /** adiciona uma tora ao desenho deste quadro */
  private drawLog(m: THREE.Matrix4, sp: number, rare: number): void {
    if (this.logN >= MAX_LOG_INST) return;
    const i = this.logN++;
    this.logSide.setMatrixAt(i, m);
    this.logCap.setMatrixAt(i, m);
    this.logSide.setColorAt(i, this.logColor(sp, rare, _c));
    this.logCap.setColorAt(i, this.capColor(sp, rare, _c));
  }

  private makeLogBody(i: number): CANNON.Body {
    const l = this.sim.logs[i];
    const b = new CANNON.Body({ mass: 3, material: this.logMat, angularDamping: 0.25, linearDamping: 0.08, collisionFilterGroup: G_LOG, collisionFilterMask: G_GROUND | G_LOG | G_TREE | G_PLAYER | G_VEH | G_STATIC });
    b.addShape(this.sphere, new CANNON.Vec3(-0.42, 0, 0));
    b.addShape(this.sphere, new CANNON.Vec3(0, 0, 0));
    b.addShape(this.sphere, new CANNON.Vec3(0.42, 0, 0));
    b.sleepSpeedLimit = 0.25;
    b.sleepTimeLimit = 0.8;
    const gy = groundH(l.x, l.z);
    b.position.set(l.x, Math.max(gy + 0.34, l.y), l.z);
    if (this.lqSet[i]) b.quaternion.set(this.lq[i * 4], this.lq[i * 4 + 1], this.lq[i * 4 + 2], this.lq[i * 4 + 3]);
    else b.quaternion.setFromEuler(0, -l.yaw, 0);
    b.velocity.set(l.vx, l.vy, l.vz);
    this.world.addBody(b);
    this.bodies[i] = b;
    (l as any).body = b;
    this.bodyCount++;
    return b;
  }
  private dropLogBody(i: number): void {
    const b = this.bodies[i];
    if (!b) return;
    const l = this.sim.logs[i];
    this.lq[i * 4] = b.quaternion.x;
    this.lq[i * 4 + 1] = b.quaternion.y;
    this.lq[i * 4 + 2] = b.quaternion.z;
    this.lq[i * 4 + 3] = b.quaternion.w;
    this.lqSet[i] = 1;
    l.x = b.position.x;
    l.y = b.position.y - 0.04;
    l.z = b.position.z;
    l.vx = l.vy = l.vz = 0;
    this.world.removeBody(b);
    this.bodies[i] = null;
    (l as any).body = null;
    this.bodyCount--;
  }

  /** cria tora solta no mundo (soltar/jogar) com velocidade */
  private spawnLog(h: Held, x: number, y: number, z: number, vx: number, vy: number, vz: number, yaw: number): number {
    const l = this.sim.spawnLog();
    if (!l) return -1;
    const i = this.sim.logs.indexOf(l);
    if (this.bodies[i]) this.dropLogBody(i);
    l.x = x;
    l.y = y;
    l.z = z;
    l.vx = vx;
    l.vy = vy;
    l.vz = vz;
    l.yaw = yaw;
    l.val = h.val;
    l.sp = h.sp;
    l.rare = h.rare as 0;
    l.ghost = 0;
    l.age = 0.4;
    this.lqSet[i] = 0;
    if (this.bodyCount >= this.q.bodies) this.evictBody();
    const b = this.makeLogBody(i);
    b.position.set(x, y, z);
    b.quaternion.setFromEuler(0, yaw, 0);
    b.angularVelocity.set(Math.random() * 4 - 2, Math.random() * 2, Math.random() * 4 - 2);
    return i;
  }
  private evictBody(): boolean {
    let best = -1;
    let bd = 0;
    const m = this.sim.me;
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      if (!b) continue;
      const d = Math.abs(b.position.x - m.x) + Math.abs(b.position.z - m.z) + (b.sleepState === CANNON.Body.SLEEPING ? 20 : 0);
      if (d > bd) {
        bd = d;
        best = i;
      }
    }
    if (best >= 0 && bd > 8) {
      this.dropLogBody(best);
      return true;
    }
    return false;
  }

  private syncLogs(dt: number): void {
    const sim = this.sim;
    const m = sim.me;
    const px = this.driving ? this.vx : m.x;
    const pz = this.driving ? this.vz : m.z;
    for (let i = 0; i < sim.logs.length; i++) {
      const l = sim.logs[i];
      let b = this.bodies[i];
      if (!l.on) {
        if (b) {
          this.dropLogBody(i);
          this.lqSet[i] = 0;
        }
        continue;
      }
      const dx = l.x - px;
      const dz = l.z - pz;
      const d2 = dx * dx + dz * dz;
      if (!b && !l.ghost && (l.age < 0.5 || d2 < 49)) {
        if (this.bodyCount < this.q.bodies || this.evictBody()) b = this.makeLogBody(i);
      }
      if (b) {
        // caiu por baixo do chão (raro): devolve para cima
        const gy = groundH(b.position.x, b.position.z);
        if (b.position.y < gy - 0.5) {
          b.position.y = gy + 0.5;
          b.velocity.y = 2;
        }
        l.x = b.position.x;
        l.y = b.position.y;
        l.z = b.position.z;
        if (Math.abs(l.z) > WORLD_Z + 1) l.z = Math.sign(l.z) * (WORLD_Z + 1);
        _q.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
        _m.compose(_v.set(b.position.x, b.position.y, b.position.z), _q, _s.set(1, 1, 1));
        if (b.sleepState === CANNON.Body.SLEEPING && d2 > 196) this.dropLogBody(i);
        else {
          this.logHits(i, b, dt);
          // rolando: poeirinha e folhas
          const sp2 = b.velocity.x * b.velocity.x + b.velocity.z * b.velocity.z;
          if (sp2 > 4 && b.position.y < gy + 0.5 && Math.random() < 0.35) {
            _c.set(Math.random() < 0.5 ? '#e6d2aa' : '#9ad86a');
            this.emitP(b.position.x, gy + 0.1, b.position.z, (Math.random() - 0.5) * 1.5, 1 + Math.random(), (Math.random() - 0.5) * 1.5, 0.6, 0.6);
          }
        }
      } else {
        if (this.lqSet[i]) _q.set(this.lq[i * 4], this.lq[i * 4 + 1], this.lq[i * 4 + 2], this.lq[i * 4 + 3]);
        else _q.setFromEuler(_e.set(0, -l.yaw, 0));
        _m.compose(_v.set(l.x, Math.max(l.y, groundH(l.x, l.z) + 0.28), l.z), _q, _s.set(1, 1, 1));
      }
      if (Math.abs(dx) < VIEW_R && (!l.ghost || l.age < 4)) this.drawLog(_m, l.sp, l.rare);
      // funil: entrou → vira fila da serraria
      const fx = l.x - INTAKE_X;
      if (fx * fx + l.z * l.z < 2.9 && l.y > 1.1 && l.y < 5 && !l.ghost) {
        sim.feed(l.val, l.sp | (l.rare << 4));
        l.on = false;
        this.burst(14, INTAKE_X, 2.8, 0, 3, '#ffd34a', 0.8, 3, 1);
        audio.coin(3);
      }
    }
  }

  /** toras rápidas: derrubam amigos (sem dano), batem no jogador, entram na caçamba */
  private logHits(i: number, b: CANNON.Body, _dt: number): void {
    const v2 = b.velocity.x * b.velocity.x + b.velocity.z * b.velocity.z + b.velocity.y * b.velocity.y;
    if (v2 < 9) return;
    const sim = this.sim;
    for (const a of sim.agents) {
      if (a.kind === 'drone') continue;
      const dx = a.x - b.position.x;
      const dz = a.z - b.position.z;
      if (dx * dx + dz * dz < 1.1) {
        const av = this.agentVis.get(a);
        if (av && av.bonk <= 0) {
          av.bonk = 1.3;
          a.wait = Math.max(a.wait, 1.3);
          this.burst(10, a.x, groundH(a.x, a.z) + 1.6, a.z, 3, '#ffd34a', 0.8, 3, 0.3);
          audio.hit();
        }
      }
    }
    for (const r of sim.remotes) {
      const dx = r.x - b.position.x;
      const dz = r.z - b.position.z;
      if (dx * dx + dz * dz < 1.1) {
        const av = this.agentVis.get(r);
        if (av && av.bonk <= 0) av.bonk = 1.3;
      }
    }
    // no jogador
    if (!this.driving && this.bonkCD <= 0 && v2 > 30) {
      const dx = sim.me.x - b.position.x;
      const dz = sim.me.z - b.position.z;
      if (dx * dx + dz * dz < 1.0 && b.position.y < groundH(sim.me.x, sim.me.z) + 1.6) {
        this.bonkCD = 1.2;
        this.shake = Math.max(this.shake, 0.5);
        this.rollV += 4;
        sim.me.x += b.velocity.x * 0.08;
        sim.me.z += b.velocity.z * 0.08;
        this.burst(12, sim.me.x, this.camY + 0.2, sim.me.z, 2, '#ffd34a', 0.8, 2, 0.2);
        this.popText(t('floresta.bonk', 'Pof!'), '#ffd34a');
        audio.hit();
        tap('medium');
      }
    }
    // caçamba parada
    if (this.veh && !this.driving && this.load.length < this.capVeh()) {
      this.vehLocal(b.position.x, b.position.y, b.position.z, _v3);
      const L = this.veh.len;
      if (_v3.x < L * 0.2 && _v3.x > -L * 0.55 && Math.abs(_v3.z) < 0.9 && _v3.y > 0.4 && _v3.y < 2.2) {
        const l = sim.logs[i];
        this.load.push({ val: l.val, sp: l.sp, rare: l.rare });
        sim.takeLog(l);
        this.vBounceV -= 1.5;
        audio.land();
      }
    }
  }

  /* ------------------------------ base: serraria, esteira, venda ------------------------------ */

  private buildBase(): void {
    const S = this.scene;
    // funil amarelo no alto + calha até a serra
    const fun = new THREE.Mesh(this.trackG(new THREE.CylinderGeometry(1.5, 0.45, 1.3, 10, 1, true)), this.track(new THREE.MeshLambertMaterial({ color: '#ffcf2e', side: THREE.DoubleSide, flatShading: true })));
    fun.position.set(INTAKE_X, 2.9, 0);
    S.add(fun);
    const rim = new THREE.Mesh(this.trackG(new THREE.TorusGeometry(1.5, 0.09, 6, 16)), this.track(lambert('#e98f00')));
    rim.rotation.x = Math.PI / 2;
    rim.position.set(INTAKE_X, 3.55, 0);
    S.add(rim);
    for (const [dx, dz] of [
      [-0.9, -0.9],
      [0.9, -0.9],
      [-0.9, 0.9],
      [0.9, 0.9],
    ])
      this.box(0.16, 2.4, 0.16, '#c21d3c', INTAKE_X + dx, 1.2, dz);
    const chute = this.box(SAW_X - INTAKE_X - 1, 0.25, 1, '#ff4f6a', (INTAKE_X + SAW_X) / 2 + 0.5, 1.9, 0);
    chute.rotation.z = -0.18;
    const sign = this.label(t('floresta.funnel', 'Funil'), '#ffe680', 0.9);
    sign.position.set(INTAKE_X, 4.5, 0);
    S.add(sign);
    // casa da serra
    this.box(3, 2.2, 2.6, '#a0683a', SAW_X + 0.4, 1.1, 0);
    const roof = new THREE.Mesh(this.trackG(new THREE.ConeGeometry(2.6, 1.4, 4)), this.track(lambert('#c21d3c')));
    roof.rotation.y = Math.PI / 4;
    roof.position.set(SAW_X + 0.4, 2.9, 0);
    S.add(roof);
    const ml = this.label(t('floresta.m.saw', 'Serraria'), '#fff', 1);
    ml.position.set(SAW_X + 0.4, 4.4, 0);
    S.add(ml);
    // lâmina girando (aparece pela janela da frente)
    this.blade = new THREE.Group();
    const disc = new THREE.Mesh(this.trackG(new THREE.CylinderGeometry(0.85, 0.85, 0.05, 18)), this.track(lambert('#dcd6f0', 0.1)));
    disc.rotation.x = Math.PI / 2;
    this.blade.add(disc);
    for (let i = 0; i < 12; i++) {
      const tth = this.box(0.16, 0.12, 0.06, '#8a8aa0', Math.cos((i / 12) * TAU) * 0.9, Math.sin((i / 12) * TAU) * 0.9, 0, this.blade);
      tth.rotation.z = (i / 12) * TAU;
    }
    this.blade.position.set(SAW_X - 1.2, 1.25, 0.9);
    S.add(this.blade);
    // esteira: lona listrada que corre + roletes
    const bc = document.createElement('canvas');
    bc.width = 64;
    bc.height = 16;
    const bx = bc.getContext('2d')!;
    bx.fillStyle = '#3a3050';
    bx.fillRect(0, 0, 64, 16);
    bx.fillStyle = '#5a4585';
    for (let i = 0; i < 4; i++) bx.fillRect(i * 16, 0, 7, 16);
    this.beltTex = this.trackT(new THREE.CanvasTexture(bc));
    this.beltTex.wrapS = THREE.RepeatWrapping;
    const len = SAW_X - 1.2 - PALLET_X;
    this.beltTex.repeat.set(len / 1.2, 1);
    const belt = new THREE.Mesh(geoms.box, this.track(new THREE.MeshLambertMaterial({ map: this.beltTex })));
    belt.scale.set(len, 0.12, 1.2);
    belt.position.set(PALLET_X + len / 2, 0.9, 0);
    S.add(belt);
    for (const s of [-1, 1]) this.box(len, 0.22, 0.12, '#ffcf2e', PALLET_X + len / 2, 0.95, s * 0.66);
    for (let x = PALLET_X + 0.8; x < SAW_X - 1.2; x += 1.8) for (const s of [-1, 1]) this.box(0.12, 0.85, 0.12, '#5a4585', x, 0.42, s * 0.55);
    // plaina (arco azul por cima da esteira)
    for (const s of [-1, 1]) this.box(0.9, 1.9, 0.25, '#2a9be0', PLANER_X, 0.95, s * 0.8);
    this.box(1.2, 0.5, 1.9, '#8a5cff', PLANER_X, 2.05, 0);
    this.drum = new THREE.Mesh(geoms.cyl, this.track(lambert('#dcd6f0')));
    this.drum.scale.set(0.22, 1.5, 0.22);
    this.drum.rotation.x = Math.PI / 2;
    this.drum.position.set(PLANER_X, 1.5, 0);
    S.add(this.drum);
    const pl = this.label(t('floresta.m.planer', 'Plaina'), '#fff', 0.7);
    pl.position.set(PLANER_X, 2.9, 0);
    S.add(pl);
    // tábuas na esteira e pilha no palete
    const pg = this.trackG(new THREE.BoxGeometry(1.1, 0.09, 0.5));
    this.planks = new THREE.InstancedMesh(pg, this.track(lambert('#ffffff')), 200);
    this.planks.count = 0;
    this.planks.frustumCulled = false;
    S.add(this.planks);
    this.box(2.2, 0.3, 1.6, '#8a5228', PALLET_X - 0.4, 0.15, 0);
    this.stack = new THREE.InstancedMesh(pg, this.track(lambert('#ffe2b0')), 80);
    this.stack.count = 0;
    this.stack.frustumCulled = false;
    S.add(this.stack);
    // barraca de venda
    const sx = SELL_X;
    const sz = 3;
    this.box(2.6, 1.1, 1.3, '#c98a4a', sx, 0.55, sz);
    this.box(2.8, 0.12, 1.5, '#ffe2b0', sx, 1.15, sz);
    for (const dx of [-1.25, 1.25]) for (const dz of [-0.6, 0.6]) this.box(0.1, 2.4, 0.1, '#ffffff', sx + dx, 1.2, sz + dz);
    for (let i = 0; i < 6; i++) this.box(0.5, 0.14, 1.9, i % 2 ? '#ffffff' : '#ff4f6a', sx - 1.25 + i * 0.5, 2.45, sz).rotation.x = 0.12;
    const sl = this.label(t('floresta.sell', 'Vender'), '#ffe680', 0.9);
    sl.position.set(sx, 3.2, sz);
    S.add(sl);
    // pilha de toras decorativa e placa de boas-vindas
    this.box(1.2, 0.08, 1.2, '#5a4585', 31, 0.04, 3.5);
    // colisões para o jogador (x0,z0,x1,z1) e para as toras
    this.solids.push(SAW_X - 1.1, -1.4, SAW_X + 1.9, 1.4, PALLET_X - 1.5, -0.9, SAW_X - 1.1, 0.9, sx - 1.4, sz - 0.75, sx + 1.4, sz + 0.75, INTAKE_X - 1.05, -1.05, INTAKE_X + 1.05, 1.05);
    for (let i = 0; i < this.solids.length; i += 4) {
      const [x0, z0, x1, z1] = [this.solids[i], this.solids[i + 1], this.solids[i + 2], this.solids[i + 3]];
      if (i === 12) continue; // funil: as toras precisam cair dentro
      const b = new CANNON.Body({ mass: 0, material: this.groundMat, collisionFilterGroup: G_STATIC });
      b.addShape(new CANNON.Box(new CANNON.Vec3((x1 - x0) / 2, 1.1, (z1 - z0) / 2)));
      b.position.set((x0 + x1) / 2, 1.1, (z0 + z1) / 2);
      this.world.addBody(b);
    }
  }

  private buildGates(): void {
    for (let b = 1; b < BIOMES.length; b++) {
      const g = new THREE.Group();
      g.position.set(gateX(b), groundH(gateX(b), 0), 0);
      this.scene.add(g);
      this.gates.push(g);
      this.gateBuilt.push(false);
      this.fillGate(b, g, this.sim.s.unlocked > b);
    }
  }

  private fillGate(b: number, g: THREE.Group, built: boolean): void {
    while (g.children.length) g.remove(g.children[0]);
    const kind = b - 1;
    this.gateBuilt[b - 1] = built;
    const wood = '#c98a4a';
    if (!built) {
      for (const z of [-WORLD_Z, -3.5, 0, 3.5, WORLD_Z]) this.box(0.3, 2.2, 0.3, '#7a4a20', 0, 1.1, z, g);
      for (const y of [0.7, 1.5]) this.box(0.12, 0.22, WORLD_Z * 2, '#ffcf2e', 0, y, 0, g);
      for (let z = -WORLD_Z + 1; z < WORLD_Z; z += 2) this.box(0.13, 0.22, 0.9, '#2a0b5c', 0, 1.5, z, g).rotation.x = 0.6;
      this.box(0.15, 1.6, 3.4, '#fff6d6', -0.25, 3.1, 0, g);
      const l = this.label(BUILDS[kind].name(), '#fff', 0.8);
      l.position.set(-0.5, 3.5, 0);
      g.add(l);
      const l2 = this.label(short(BUILDS[kind].planks) + ' + ' + short(BUILDS[kind].cost), '#ffe2b0', 0.65);
      l2.position.set(-0.5, 2.8, 0);
      g.add(l2);
      return;
    }
    if (kind === 0) {
      for (const z of [-WORLD_Z, -4.5, -1.8, 1.8, 4.5, WORLD_Z]) this.box(0.25, 1.6, 0.25, wood, 0, 0.8, z, g);
      for (const z of [-1, 1]) this.box(0.12, 0.18, WORLD_Z - 1.8, wood, 0, 1.2, z * (1.8 + (WORLD_Z - 1.8) / 2), g);
    } else if (kind === 1) {
      this.box(5, 0.3, 3.2, wood, 0, 0.25, 0, g);
      for (const z of [-1.6, 1.6]) this.box(5, 0.15, 0.15, wood, 0, 1.2, z, g);
    } else if (kind === 2) {
      this.box(3, 2.4, 3, wood, 0, 1.2, -5, g);
      const r = new THREE.Mesh(geoms.cone, this.track(lambert('#3a9a6a')));
      r.scale.set(2.6, 1.6, 2.6);
      r.position.set(0, 3.2, -5);
      g.add(r);
    } else if (kind === 3) {
      for (let i = 0; i < 5; i++) this.box(0.8, 0.4 * (i + 1), 3, wood, -2 + i * 0.8, 0.2 * (i + 1), 0, g);
    } else if (kind === 4) {
      for (const dx of [-0.8, 0.8]) for (const dz of [-0.8, 0.8]) this.box(0.2, 5, 0.2, wood, dx, 2.5, dz - 5, g);
      this.box(2, 0.2, 2, wood, 0, 5, -5, g);
    } else {
      const bal = new THREE.Mesh(geoms.ico, this.track(lambert('#ff9a2e')));
      bal.scale.setScalar(1.6);
      bal.position.set(0, 5, -5);
      g.add(bal);
      this.box(1.4, 0.8, 1.4, wood, 0, 2.4, -5, g);
    }
  }

  /* ------------------------------ primeira pessoa (mão + ferramenta) ------------------------------ */

  private buildViewModel(): void {
    const col = myHandColors();
    const ht = this.trackT(handTexture(col));
    const hm = this.track(new THREE.MeshBasicMaterial({ map: ht, transparent: true, alphaTest: 0.05, depthTest: false, toneMapped: false }));
    const hg = this.trackG(new THREE.PlaneGeometry(0.24, 0.24));
    this.handR = new THREE.Mesh(hg, hm);
    this.handR.renderOrder = 10;
    this.handL = new THREE.Mesh(hg, hm);
    this.handL.scale.x = -1;
    this.handL.renderOrder = 10;
    this.vmCam.add(this.vmRoot);
    this.vmRoot.add(this.vmTool, this.handR, this.handL, this.heldGroup);
    // antebraços completos saindo da borda da tela (nunca aparece o braço cortado)
    this.armR = new Forearm(col, 1, 9, 0.05);
    this.armL = new Forearm(col, -1, 9, 0.05);
    this.vmCam.add(this.armR.mesh, this.armL.mesh);
    // toras nas mãos
    const side = this.trackG(logSideGeometry());
    const cap = this.trackG(logCapGeometry());
    for (let i = 0; i < HAND_CAP; i++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(side, this.track(new THREE.MeshLambertMaterial({ color: '#9a6a3c', vertexColors: true }))));
      g.add(new THREE.Mesh(cap, this.track(new THREE.MeshLambertMaterial({ vertexColors: true }))));
      g.scale.setScalar(0.3);
      this.heldGroup.add(g);
      this.heldLogs.push(g);
    }
    // volante
    this.wheel = steeringWheel();
    this.wheel.visible = false;
    this.vmRoot.add(this.wheel);
    // raio do laser
    const bg = this.trackG(new THREE.CylinderGeometry(0.012, 0.02, 1, 6, 1, true));
    bg.translate(0, 0.5, 0);
    bg.rotateX(Math.PI / 2);
    this.beam = new THREE.Mesh(bg, this.track(new THREE.MeshBasicMaterial({ color: 0x9ffcff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })));
    this.beam.visible = false;
    this.vmRoot.add(this.beam);
    this.rebuildTool();
  }

  private rebuildTool(): void {
    const lvl = Math.min(TOOLS.length - 1, this.sim.s.tool);
    this.toolLvl = this.sim.s.tool;
    if (this.vmToolMesh) {
      this.vmTool.remove(this.vmToolMesh);
      this.vmToolMesh.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.material) (m.material as THREE.Material).dispose();
      });
    }
    const tl = TOOLS[lvl];
    const r = toolModel(tl.kind, lvl, tl.color);
    this.vmToolMesh = r.g;
    r.g.scale.setScalar(0.8);
    this.vmTip = r.tip;
    this.vmSpin = r.spin;
    this.vmTool.add(r.g);
    (this.beam.material as THREE.MeshBasicMaterial).color.set(lvl >= 7 ? '#e0b0ff' : '#9ffcff');
  }

  /** pose da ferramenta conforme a fase do golpe (sincronizada com a simulação) */
  private poseTool(dt: number, walk: number): void {
    const sim = this.sim;
    const m = sim.me;
    const kind = TOOLS[Math.min(TOOLS.length - 1, sim.s.tool)].kind;
    const holding = this.held.length > 0;
    const chopping = sim.input.chop && !this.driving && !holding;
    // atraso ao olhar + balanço ao andar
    this.lagX += (-this.lookDX * 0.6 - this.lagX) * Math.min(1, dt * 10);
    this.lagY += (this.lookDY * 0.6 - this.lagY) * Math.min(1, dt * 10);
    const lx = Math.max(-0.05, Math.min(0.05, this.lagX));
    const ly = Math.max(-0.04, Math.min(0.04, this.lagY));
    const bx = Math.sin(this.bob) * 0.014 * walk;
    const by = -Math.abs(Math.cos(this.bob)) * 0.018 * walk + Math.sin(this.time * 1.7) * 0.004;
    const T = this.vmTool;
    let px = 0.33;
    let py = -0.31;
    let pz = -0.75;
    let rx = -0.25;
    let ry = 0.1;
    let rz = 0.3;
    if (kind !== 'axe') {
      px = 0.3;
      rx = 0.14;
      rz = -0.1;
      ry = 0.42;
      py = -0.27;
      pz = -0.68;
    }
    if (chopping) {
      const ph = Math.max(0, Math.min(1, 1 - m.swingT * TOOLS[Math.min(TOOLS.length - 1, sim.s.tool)].rate));
      if (kind === 'axe') {
        // fase 0 = impacto; sobe até 0.7; desce acelerando até 1
        const imp = [0.1, -0.3, -0.85, -1.4, 0.15, 0.4];
        const up = [0.38, -0.17, -0.72, 0.5, 0.05, 0.15];
        let k: number;
        if (this.hitStop > 0) k = 0;
        else if (ph < 0.12) k = Math.sin((ph / 0.12) * Math.PI) * 0.08;
        else if (ph < 0.7) {
          const u = (ph - 0.12) / 0.58;
          k = u * u * (3 - 2 * u);
        } else {
          const u = (ph - 0.7) / 0.3;
          k = 1 - u * u * u;
        }
        px = imp[0] + (up[0] - imp[0]) * k;
        py = imp[1] + (up[1] - imp[1]) * k;
        pz = imp[2] + (up[2] - imp[2]) * k;
        rx = imp[3] + (up[3] - imp[3]) * k;
        ry = imp[4] + (up[4] - imp[4]) * k;
        rz = imp[5] + (up[5] - imp[5]) * k;
      } else {
        // serra/laser: empurra para a frente e treme
        const j = kind === 'saw' ? 0.012 : 0.004;
        px = 0.24 + (Math.random() - 0.5) * j;
        py = -0.25 + (Math.random() - 0.5) * j;
        pz = -0.72 - (this.aimTree >= 0 ? 0.08 : 0) - Math.sin(ph * Math.PI) * 0.02;
        rx = 0.1;
        rz = -0.05;
        ry = 0.3;
      }
    }
    // pegar/jogar/chutar
    if (this.grabAnim > 0) {
      const e = Math.sin((1 - this.grabAnim) * Math.PI);
      py -= e * 0.12;
      pz -= e * 0.06;
    }
    if (this.throwAnim > 0) {
      const k = 1 - this.throwAnim;
      py += Math.sin(k * Math.PI) * 0.1;
      pz -= Math.sin(k * Math.PI) * 0.15;
    }
    if (this.kickAnim > 0) {
      const e = Math.sin((1 - this.kickAnim) * Math.PI);
      py -= e * 0.25;
      px += e * 0.1;
    }
    T.visible = !holding && !this.driving;
    T.position.set(px + lx + bx, py + ly + by, pz);
    T.rotation.set(rx, ry, rz);
    // mão direita segura o cabo (fica virada para a câmera)
    this.handR.visible = !holding && !this.driving;
    if (this.handR.visible) {
      _v.set(0, kind === 'axe' ? 0 : 0.02, kind === 'axe' ? 0 : 0.06).applyEuler(T.rotation).add(T.position);
      this.handR.position.set(_v.x + 0.01, _v.y - 0.03, _v.z + 0.03);
      this.handR.rotation.set(0, 0, kind === 'axe' ? rz * 0.5 - 0.1 : 0.2);
      this.handR.scale.set(1, 1, 1);
    }
    if (this.vmSpin) {
      if (kind === 'saw') this.vmSpin.position.z = chopping ? ((this.time * 6) % 0.11) - 0.055 : 0;
      else this.vmSpin.scale.setScalar(0.04 * (chopping ? 1.6 + Math.sin(this.time * 40) * 0.5 : 1));
    }
    // laser: raio da ponta até o alvo
    this.beam.visible = chopping && kind === 'laser';
    if (this.beam.visible && this.vmTip) {
      this.vmTip.getWorldPosition(_v);
      this.vmRoot.worldToLocal(_v);
      const d = this.aimTree >= 0 ? Math.min(3, this.aimDist) : 3;
      _v2.set(0, 0, -d);
      this.beam.position.copy(_v);
      this.beam.lookAt(_v3.copy(_v2).applyMatrix4(this.vmCam.matrixWorld));
      this.vmRoot.worldToLocal(_v2.applyMatrix4(this.vmCam.matrixWorld));
      this.beam.scale.set(1 + Math.sin(this.time * 50) * 0.3, 1 + Math.sin(this.time * 50) * 0.3, _v.distanceTo(_v2));
    }
    // toras nas mãos
    this.heldGroup.visible = holding && !this.driving;
    this.handL.visible = false;
    if (holding && !this.driving) {
      let tx = 0;
      let ty = -0.33;
      let tz = -0.72;
      if (this.throwAnim > 0) {
        const k = 1 - this.throwAnim;
        ty += Math.sin(k * Math.PI) * 0.15 - k * 0.1;
        tz -= k * 0.4;
      }
      if (this.grabAnim > 0) ty -= Math.sin((1 - this.grabAnim) * Math.PI) * 0.15;
      // peso: as toras afundam a cada passo e balançam devagar (inércia)
      const nh = this.held.length;
      const wk = Math.min(1, nh / 3);
      ty -= 0.012 * wk + Math.abs(Math.sin(this.bob)) * 0.022 * walk * (0.5 + wk);
      this.heldGroup.position.set(tx + lx * 0.6 + bx * 0.7, ty + ly * 0.6 + by, tz);
      this.heldGroup.rotation.set(0.1 + Math.sin(this.time * 1.4) * 0.01, 0, Math.sin(this.time * 2) * 0.02 + Math.sin(this.bob) * 0.05 * walk);
      for (let i = 0; i < HAND_CAP; i++) {
        const g = this.heldLogs[i];
        const h = this.held[i];
        g.visible = !!h;
        if (!h) continue;
        g.position.set(0, i * 0.17, -i * 0.03);
        g.rotation.set(0, i * 0.12, 0);
        const side = g.children[0] as THREE.Mesh;
        const key = h.sp * 8 + h.rare;
        if (side.userData.k !== key) {
          side.userData.k = key;
          (side.material as THREE.MeshLambertMaterial).color.copy(this.logColor(h.sp, h.rare, _c));
        }
      }
      // as duas mãos nas pontas
      this.handR.visible = true;
      this.handL.visible = true;
      const hp = this.heldGroup.position;
      this.handR.position.set(hp.x + 0.2, hp.y - 0.02, hp.z + 0.06);
      this.handR.rotation.set(0, 0, 0.45);
      this.handL.position.set(hp.x - 0.2, hp.y - 0.02, hp.z + 0.06);
      this.handL.rotation.set(0, 0, -0.45);
    }
    // volante
    this.wheel.visible = this.driving && this.vehLvl >= 2;
    if (this.driving) {
      const w = this.wheel;
      w.position.set(this.portrait ? 0.19 : 0, this.portrait ? -0.5 : -0.44, -0.72);
      w.scale.setScalar(0.8);
      w.rotation.set(-0.9, 0, -this.vSteer * 1.6);
      this.handR.visible = this.handL.visible = true;
      if (this.vehLvl >= 2) {
        _v.set(0.16, 0, 0).applyEuler(w.rotation).add(w.position);
        this.handR.position.set(_v.x + 0.03, _v.y - 0.02, _v.z + 0.05);
        _v.set(-0.16, 0, 0).applyEuler(w.rotation).add(w.position);
        this.handL.position.set(_v.x - 0.03, _v.y - 0.02, _v.z + 0.05);
        this.handR.rotation.set(0, 0, 0.3 - this.vSteer * 1.6);
        this.handL.rotation.set(0, 0, -0.3 - this.vSteer * 1.6);
      } else {
        // carrinho de mão: as mãos nos cabos
        this.handR.position.set(0.3, -0.36 + by, -0.5);
        this.handL.position.set(-0.3, -0.36 + by, -0.5);
        this.handR.rotation.set(0, 0, 0.2);
        this.handL.rotation.set(0, 0, -0.2);
      }
    }
    this.updateArms();
  }

  /** antebraços: do pulso de cada mão até um cotovelo fora do quadro */
  private updateArms(): void {
    this.vmRoot.updateMatrixWorld(true);
    _vInv.copy(this.vmCam.matrixWorld).invert();
    for (const [h, a] of [[this.handR, this.armR], [this.handL, this.armL]] as const) {
      a.mesh.visible = h.visible;
      if (!h.visible) continue;
      _w.set(0, -0.034, 0).applyMatrix4(h.matrixWorld).applyMatrix4(_vInv);
      a.set(_w, this.vmCam, 0.72, 0);
    }
  }

  /* ------------------------------ pássaros ------------------------------ */

  private buildBirds(): void {
    const tex = this.trackT(birdTexture());
    for (let f = 0; f < 2; f++) {
      const tx = tex.clone();
      tx.needsUpdate = true;
      tx.repeat.set(0.5, 1);
      tx.offset.set(f * 0.5, 0);
      this.trackT(tx);
      this.birdMats.push(this.track(new THREE.SpriteMaterial({ map: tx, transparent: true, depthWrite: false })));
    }
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(this.birdMats[0]);
      s.scale.set(1.1, 0.55, 1);
      s.visible = false;
      this.scene.add(s);
      this.birds.push({ s, life: 0, vx: 0, vy: 0, vz: 0 });
    }
  }
  private scareBirds(x: number, y: number, z: number, n: number): void {
    for (const b of this.birds) {
      if (n <= 0) break;
      if (b.life > 0) continue;
      n--;
      const a = Math.random() * TAU;
      b.life = 4 + Math.random() * 2;
      b.s.position.set(x + Math.cos(a) * 1.5, y, z + Math.sin(a) * 1.5);
      b.vx = Math.cos(a) * (3 + Math.random() * 3);
      b.vz = Math.sin(a) * (3 + Math.random() * 3);
      b.vy = 2.5 + Math.random() * 2;
      b.s.visible = true;
    }
  }

  /* ------------------------------ interface ------------------------------ */

  private buildUI(): HTMLDivElement {
    const u = document.createElement('div');
    u.className = 'fl-fps';
    u.innerHTML = `<div class="fl-ret"><i></i></div>
      <div class="fl-tgt"><b></b><div class="bar"><i></i></div></div>
      <div class="fl-timber"></div>
      <div class="fl-acts">
        <button class="fl-act" data-act="drive"></button>
        <button class="fl-act" data-act="throw"></button>
        <button class="fl-act" data-act="grab"></button>
      </div>`;
    this.root.appendChild(u);
    this.ret = u.querySelector('.fl-ret')!;
    this.tgt = u.querySelector('.fl-tgt')!;
    this.tgtName = this.tgt.querySelector('b')!;
    this.tgtBar = this.tgt.querySelector('.bar i')!;
    this.timber = u.querySelector('.fl-timber')!;
    this.btnGrab = u.querySelector('[data-act="grab"]')!;
    this.btnThrow = u.querySelector('[data-act="throw"]')!;
    this.btnDrive = u.querySelector('[data-act="drive"]')!;
    u.addEventListener('pointerdown', (e) => {
      const b = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (!b) return;
      e.preventDefault();
      e.stopPropagation();
      this.act(b.dataset.act!);
    });
    return u;
  }

  private act(a: string): void {
    if (a === 'grab') this.doGrab();
    else if (a === 'throw') this.doThrow();
    else if (a === 'drive') this.doDrive();
  }

  private popText(text: string, color: string): void {
    const d = document.createElement('div');
    d.className = 'fl-pop';
    d.textContent = text;
    d.style.color = color;
    this.ui.appendChild(d);
    setTimeout(() => d.remove(), 1000);
  }

  private updateUI(): void {
    const sim = this.sim;
    const holding = this.held.length > 0;
    let grab = '';
    let thr = '';
    let drv = '';
    if (this.driving) {
      drv = 'out';
      if (this.load.length && this.nearFunnel(this.vx, this.vz, 7)) thr = 'dump';
    } else {
      if (this.aimLog >= 0 && this.held.length < HAND_CAP) grab = 'pick';
      else if (holding) grab = this.vehNear(3.4) ? 'load' : 'drop';
      if (holding) thr = 'throw';
      else if (this.kickable() >= 0) thr = 'kick';
      if (this.veh && this.vehNear(3.2)) drv = 'in';
    }
    const tr = sim.me.target >= 0 ? sim.trees[sim.me.target] : null;
    const sig = grab + '|' + thr + '|' + drv;
    if (sig !== this.uiSig) {
      this.uiSig = sig;
      const set = (b: HTMLButtonElement, k: string, icon: Parameters<typeof flIcon>[0], label: string) => {
        b.classList.toggle('hide', !k);
        if (k) b.innerHTML = flIcon(icon, 30) + `<span>${label}</span>`;
      };
      set(this.btnGrab, grab, grab === 'pick' ? 'grab' : 'drop', grab === 'pick' ? t('floresta.grab', 'Pegar') : grab === 'load' ? t('floresta.load', 'Carregar') : t('floresta.drop', 'Soltar'));
      set(this.btnThrow, thr, thr === 'kick' ? 'kick' : thr === 'dump' ? 'drop' : 'throw', thr === 'kick' ? t('floresta.kick', 'Chutar') : thr === 'dump' ? t('floresta.dump', 'Despejar') : t('floresta.throw', 'Jogar'));
      const vi = (['smile', 'barrow', 'truck', 'loader', 'train'] as const)[Math.min(4, this.vehLvl)];
      set(this.btnDrive, drv, drv === 'out' ? 'wheel' : vi, drv === 'out' ? t('floresta.getOut', 'Sair') : t('floresta.drive', 'Dirigir'));
    }
    // mira e alvo
    const hot = !!tr || this.aimLog >= 0;
    this.ret.classList.toggle('hot', hot);
    this.ret.classList.toggle('hide', this.driving);
    if (tr) {
      this.tgt.classList.add('on');
      const nm = (tr.rare ? RARES[tr.rare].name() + ' · ' : '') + SPECIES[tr.sp].name();
      if (this.tgtName.textContent !== nm) this.tgtName.textContent = nm;
      this.tgtBar.style.width = Math.max(0, Math.round((tr.hp / tr.maxHp) * 100)) + '%';
    } else this.tgt.classList.remove('on');
    if (this.timberT > 0) {
      this.timberT -= 1 / 60;
      if (this.timberT <= 0) this.timber.classList.remove('on');
    }
  }

  /* ------------------------------ ações ------------------------------ */

  private kickable(): number {
    const m = this.sim.me;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    let best = -1;
    let bd = 2.6;
    for (let i = 0; i < this.sim.logs.length; i++) {
      const l = this.sim.logs[i];
      if (!l.on || l.ghost) continue;
      const dx = l.x - m.x;
      const dz = l.z - m.z;
      const d = Math.hypot(dx, dz);
      if (d < bd && (dx * fx + dz * fz) / (d + 1e-3) > 0.3) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  private doGrab(): void {
    const sim = this.sim;
    if (this.driving) return;
    if (this.aimLog >= 0 && this.held.length < HAND_CAP) {
      const l = sim.logs[this.aimLog];
      if (!l.on) return;
      this.held.push({ val: l.val, sp: l.sp, rare: l.rare });
      sim.takeLog(l);
      this.grabAnim = 1;
      audio.coin(this.held.length);
      tap('light');
      if (sim.s.tutorial === 0) sim.s.tutorial = 1;
      return;
    }
    if (!this.held.length) return;
    const h = this.held.pop()!;
    this.grabAnim = 1;
    if (this.veh && this.vehNear(3.4) && this.load.length < this.capVeh()) {
      this.load.push(h);
      this.vehicleBedWorld(this.load.length - 1, _v);
      this.addFly(h, this.sim.me.x, this.camY - 0.4, this.sim.me.z, _v.x, _v.y, _v.z, 0, 0.3);
      return;
    }
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const x = sim.me.x + fx * 1.1;
    const z = sim.me.z + fz * 1.1;
    this.spawnLog(h, x, Math.max(this.camY - 0.6, groundH(x, z) + 0.5), z, fx, 0, fz, this.yaw);
  }

  private doThrow(): void {
    const sim = this.sim;
    if (this.driving) {
      if (this.load.length && this.nearFunnel(this.vx, this.vz, 7)) this.dumpT = 0.01;
      return;
    }
    const cp = Math.cos(this.pitch);
    const fx = Math.sin(this.yaw) * cp;
    const fz = Math.cos(this.yaw) * cp;
    const fy = Math.sin(this.pitch);
    if (this.held.length) {
      const h = this.held.pop()!;
      this.throwAnim = 1;
      const x = sim.me.x + fx * 0.9;
      const z = sim.me.z + fz * 0.9;
      const p = 11;
      const y = this.camY - 0.25 + fy * 0.5;
      // mira assistida: funil ou caçamba à frente recebem a tora num arco bonito
      let tx = 0;
      let ty = 0;
      let tz = 0;
      let assist = false;
      const hx = Math.sin(this.yaw);
      const hz = Math.cos(this.yaw);
      const tryT = (ax: number, ay: number, az: number, maxD: number) => {
        const dx = ax - x;
        const dz = az - z;
        const d = Math.hypot(dx, dz);
        if (assist || d > maxD || d < 0.3 || (dx * hx + dz * hz) / d < 0.82) return;
        assist = true;
        tx = ax;
        ty = ay;
        tz = az;
      };
      tryT(INTAKE_X, 3.3, 0, 11);
      if (this.veh && this.load.length < this.capVeh()) {
        this.vehicleBedWorld(0, _v);
        tryT(_v.x, _v.y + 0.3, _v.z, 9);
      }
      if (assist) {
        const d = Math.hypot(tx - x, tz - z);
        const tf = Math.max(0.45, Math.min(1, d / 8));
        this.spawnLog(h, x, y, z, (tx - x) / tf, (ty - y) / tf + 10 * tf, (tz - z) / tf, this.yaw + Math.PI / 2);
      } else this.spawnLog(h, x, y, z, fx * p + sim.me.vx * 0.5, fy * p + 4.5, fz * p + sim.me.vz * 0.5, this.yaw + Math.PI / 2);
      audio.jump();
      tap('light');
      return;
    }
    const k = this.kickable();
    if (k < 0) return;
    this.kickAnim = 1;
    let b = this.bodies[k];
    if (!b) {
      if (this.bodyCount >= this.q.bodies) this.evictBody();
      b = this.makeLogBody(k);
    }
    b.wakeUp();
    b.velocity.set(Math.sin(this.yaw) * 9, 4, Math.cos(this.yaw) * 9);
    b.angularVelocity.set(Math.cos(this.yaw) * 8, 0, -Math.sin(this.yaw) * 8);
    this.shake = Math.max(this.shake, 0.12);
    audio.land();
    tap('medium');
  }

  private doDrive(): void {
    const sim = this.sim;
    if (this.driving) {
      this.driving = false;
      sim.driving = false;
      // desce pela esquerda
      const lx = Math.sin(this.vh + Math.PI / 2);
      const lz = Math.cos(this.vh + Math.PI / 2);
      sim.me.x = this.vx + lx * (this.veh ? this.veh.wid / 2 + 0.8 : 1.5);
      sim.me.z = Math.max(-WORLD_Z, Math.min(WORLD_Z, this.vz + lz * (this.veh ? this.veh.wid / 2 + 0.8 : 1.5)));
      this.yaw = this.vh + this.headYaw;
      this.headYaw = 0;
      this.vSpeed = 0;
      audio.click();
      return;
    }
    if (!this.veh || !this.vehNear(3.2)) return;
    // as toras das mãos vão para a caçamba
    while (this.held.length && this.load.length < this.capVeh()) this.load.push(this.held.pop()!);
    for (const h of this.held.splice(0)) this.spawnLog(h, sim.me.x, this.camY - 0.5, sim.me.z, 0, 1, 0, this.yaw);
    this.driving = true;
    sim.driving = true;
    this.headYaw = 0;
    audio.click();
    tap('light');
  }

  private nearFunnel(x: number, z: number, r: number): boolean {
    const dx = x - INTAKE_X;
    return dx * dx + z * z < r * r;
  }

  /* ------------------------------ veículo ------------------------------ */

  private capVeh(): number {
    return VEHICLES[Math.min(VEHICLES.length - 1, this.vehLvl)].cap;
  }
  private vehNear(r: number): boolean {
    if (!this.veh) return false;
    this.vehLocal(this.sim.me.x, 0, this.sim.me.z, _v3);
    const L = this.veh.len / 2;
    const ex = Math.max(0, Math.abs(_v3.x) - L);
    const ez = Math.max(0, Math.abs(_v3.z) - this.veh.wid / 2);
    return ex * ex + ez * ez < r * r * 0.5;
  }
  /** mundo → local do veículo (x para a frente, z para a direita) */
  private vehLocal(x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    const dx = x - this.vx;
    const dz = z - this.vz;
    const fx = Math.sin(this.vh);
    const fz = Math.cos(this.vh);
    out.set(dx * fx + dz * fz, y - groundH(this.vx, this.vz), -dx * fz + dz * fx);
    return out;
  }
  private vehicleBedWorld(i: number, out: THREE.Vector3): THREE.Vector3 {
    if (!this.veh) return out.set(this.vx, 1, this.vz);
    const per = 3;
    const row = Math.floor(i / per) % 5;
    const col = i % per;
    out.set((col - 1) * 0.15, 0.32 + row * 0.5, (col - 1) * 0.55);
    this.veh.bed.updateMatrixWorld();
    return this.veh.bed.localToWorld(out);
  }

  private syncVehicle(dt: number): void {
    const lvl = this.sim.s.vehicle;
    if (lvl !== this.vehLvl || (lvl > 0 && !this.veh)) {
      if (this.veh) {
        this.scene.remove(this.veh.g);
        this.veh.g.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.material) (m.material as THREE.Material).dispose();
        });
        this.veh = null;
      }
      if (this.vBody) {
        this.world.removeBody(this.vBody);
        this.vBody = null;
      }
      this.vehLvl = lvl;
      if (this.load.length > this.capVeh()) this.load.length = this.capVeh();
      if (lvl > 0) {
        // comprou agora: o veículo aparece do seu lado
        if (this.time > 0.5 && !this.driving) {
          const m = this.sim.me;
          this.vx = Math.min(this.sim.limitX - 3, m.x + Math.sin(this.yaw) * 4);
          this.vz = Math.max(-WORLD_Z + 1, Math.min(WORLD_Z - 1, m.z + Math.cos(this.yaw) * 4));
          this.vh = this.yaw + Math.PI / 2;
          this.burst(30, this.vx, groundH(this.vx, this.vz) + 1, this.vz, 6, '#ffd34a', 1.2, 5);
        }
        this.veh = vehicleModel(lvl);
        this.scene.add(this.veh.g);
        this.vBody = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, collisionFilterGroup: G_VEH, collisionFilterMask: G_LOG });
        this.vBody.addShape(new CANNON.Box(new CANNON.Vec3(this.veh.len / 2, 0.55, this.veh.wid / 2)), new CANNON.Vec3(0, 0.75, 0));
        this.vBody.allowSleep = false;
        this.world.addBody(this.vBody);
        this.uiSig = '';
      } else if (this.driving) {
        this.driving = false;
        this.sim.driving = false;
        this.load.length = 0;
      }
    }
    const V = this.veh;
    if (!V || !this.vBody) return;
    const sim = this.sim;
    const spec = VEHICLES[Math.min(VEHICLES.length - 1, lvl)];
    const ox = this.vx;
    const oz = this.vz;
    if (this.driving) {
      const thr = -this.joyY;
      const st = this.joyX;
      const max = spec.speed * (lvl === 1 ? 0.9 : 1.1);
      const acc = thr * (thr * this.vSpeed < 0 ? 22 : 9);
      this.vSpeed += acc * dt;
      if (Math.abs(thr) < 0.05) this.vSpeed *= Math.pow(0.3, dt);
      // morro: ajuda a descer
      const fx = Math.sin(this.vh);
      const fz = Math.cos(this.vh);
      const slope = groundH(this.vx + fx, this.vz + fz) - groundH(this.vx - fx, this.vz - fz);
      this.vSpeed -= slope * 2.2 * dt;
      this.vSpeed = Math.max(-max * 0.5, Math.min(max, this.vSpeed));
      this.vSteer += (st * 0.6 - this.vSteer) * Math.min(1, dt * 6);
      this.vh -= this.vSteer * this.vSpeed * dt * (lvl === 1 ? 0.6 : 0.32);
      this.headYaw *= Math.pow(0.4, dt * Math.min(1, Math.abs(this.vSpeed) / 3));
    } else {
      this.vSpeed *= Math.pow(0.05, dt);
      this.vSteer *= 0.9;
    }
    this.vx += Math.sin(this.vh) * this.vSpeed * dt;
    this.vz += Math.cos(this.vh) * this.vSpeed * dt;
    // limites do corredor e portão
    const lim = sim.limitX - V.len / 2;
    if (this.vx > lim) {
      this.vx = lim;
      this.vSpeed *= -0.35;
      this.bump(0.25);
    }
    if (this.vx < -2) {
      this.vx = -2;
      this.vSpeed *= -0.35;
    }
    const zl = WORLD_Z + 0.6;
    if (Math.abs(this.vz) > zl) {
      this.vz = Math.sign(this.vz) * zl;
      this.vSpeed *= 0.7;
    }
    // troncos e base
    for (let i = 0; i < sim.trees.length; i++) {
      const tr = sim.trees[i];
      if (tr.state !== TS.Grown && tr.state !== TS.Sapling) continue;
      if (Math.abs(tr.x - this.vx) > 5) continue;
      const rr = trunkR(tr.sp) * (tr.state === TS.Sapling ? tr.grow : 1) + V.wid * 0.45;
      const dx = this.vx - tr.x;
      const dz = this.vz - tr.z;
      const d = Math.hypot(dx, dz);
      if (d < rr && d > 1e-3) {
        this.vx = tr.x + (dx / d) * rr;
        this.vz = tr.z + (dz / d) * rr;
        if (Math.abs(this.vSpeed) > 3) {
          tr.shake = 0.4;
          this.bump(Math.min(0.5, Math.abs(this.vSpeed) * 0.05));
          this.burst(8, tr.x, this.tv[i].gy + SPECIES[tr.sp].h * 0.7, tr.z, 3, SPECIES[tr.sp].leaf, 1.5, 1, 0.3);
        }
        this.vSpeed *= 0.5;
      }
    }
    this.pushOutSolids(V.wid * 0.5, true);
    if (this.driving) {
      sim.me.x = this.vx;
      sim.me.z = this.vz;
    }
    // apoio no chão: inclinação pelos 4 cantos + mola
    const fx = Math.sin(this.vh);
    const fz = Math.cos(this.vh);
    const L = V.len * 0.42;
    const W = V.wid * 0.45;
    const hf = groundH(this.vx + fx * L, this.vz + fz * L);
    const hb = groundH(this.vx - fx * L, this.vz - fz * L);
    const hr = groundH(this.vx - fz * W, this.vz + fx * W);
    const hl = groundH(this.vx + fz * W, this.vz - fx * W);
    const gy = (hf + hb + hr + hl) / 4;
    const pitch = Math.atan2(hf - hb, L * 2);
    const roll = Math.atan2(hl - hr, W * 2);
    const sp = Math.hypot(this.vx - ox, this.vz - oz) / Math.max(dt, 1e-3);
    this.vBounceV += (-this.vBounce * 120 - this.vBounceV * 9) * dt + (Math.random() - 0.5) * sp * 0.25 * (dt * 60) * 0.05;
    this.vBounce += this.vBounceV * dt;
    V.g.position.set(this.vx, gy + this.vBounce, this.vz);
    _e.set(roll, this.vh - Math.PI / 2, pitch, 'YXZ');
    _q.setFromEuler(_e.set(0, this.vh - Math.PI / 2, 0));
    _q2.setFromEuler(_e.set(roll, 0, pitch));
    V.g.quaternion.copy(_q).multiply(_q2);
    for (const w of V.wheels) w.rotation.z -= (this.vSpeed * dt) / 0.4;
    // caçamba: despejar no funil
    if (this.dumpT > 0) {
      this.dumpT += dt;
      this.bedTilt = Math.min(1, this.bedTilt + dt * 3);
      if (this.load.length && this.dumpT > 0.25) {
        this.dumpT = 0.18;
        const h = this.load.pop()!;
        this.vehicleBedWorld(this.load.length, _v);
        this.addFly(h, _v.x, _v.y, _v.z, INTAKE_X, 3.4, 0, 1, 0.55);
      }
      if (!this.load.length && this.dumpT > 0.2) this.dumpT = 0;
    } else this.bedTilt = Math.max(0, this.bedTilt - dt * 2);
    if (V.bedTilt) V.bedTilt.rotation.z = this.bedTilt * 0.6;
    // despeja sozinho se parar ao lado do funil
    if (this.driving && this.load.length && this.dumpT === 0 && Math.abs(this.vSpeed) < 0.6 && this.nearFunnel(this.vx, this.vz, 5.5)) this.dumpT = 0.01;
    // coleta: toras perto da caçamba entram (carregadeira pega de longe)
    if (this.driving && this.load.length < this.capVeh()) {
      const reach = spec.reach + V.len * 0.35;
      for (let i = 0; i < sim.logs.length; i++) {
        const l = sim.logs[i];
        if (!l.on || l.ghost || l.age < 0.6) continue;
        const dx = l.x - this.vx;
        const dz = l.z - this.vz;
        if (dx * dx + dz * dz < reach * reach) {
          const h = { val: l.val, sp: l.sp, rare: l.rare };
          this.load.push(h);
          this.vehicleBedWorld(this.load.length - 1, _v);
          this.addFly(h, l.x, l.y, l.z, _v.x, _v.y, _v.z, 0, 0.35);
          this.load.pop(); // entra quando o voo termina
          sim.takeLog(l);
          if (this.load.length + this.fliesTo(0) >= this.capVeh()) break;
        }
      }
    }
    // corpo cinemático (empurra toras: caos!)
    const b = this.vBody;
    const nx = this.vx;
    const ny = gy;
    const nz = this.vz;
    b.velocity.set((nx - b.position.x) / Math.max(dt, 1e-3), 0, (nz - b.position.z) / Math.max(dt, 1e-3));
    b.position.set(nx, ny, nz);
    b.quaternion.set(V.g.quaternion.x, V.g.quaternion.y, V.g.quaternion.z, V.g.quaternion.w);
    // toras na caçamba
    const show = Math.min(this.load.length, 15);
    for (let i = 0; i < show; i++) {
      this.vehicleBedWorld(i, _v);
      _q.copy(V.g.quaternion).multiply(_q2.setFromAxisAngle(UP, Math.PI / 2 + (i % 3) * 0.05));
      _m.compose(_v, _q, _s.set(1, 1, 0.9));
      const h = this.load[i];
      this.drawLog(_m, h.sp, h.rare);
    }
  }
  private fliesTo(to: number): number {
    let n = 0;
    for (const f of this.flies) if (f.on && f.to === to) n++;
    return n;
  }
  private bump(s: number): void {
    if (this.driving) this.shake = Math.max(this.shake, s);
    this.vBounceV -= s * 6;
  }

  private addFly(h: Held, ax: number, ay: number, az: number, bx: number, by: number, bz: number, to: number, dur: number): void {
    let f = this.flies.find((x) => !x.on);
    if (!f) {
      if (this.flies.length > 40) {
        if (to === 1) this.sim.feed(h.val, h.sp | (h.rare << 4));
        else this.load.push(h);
        return;
      }
      f = { on: false, t: 0, dur: 0, ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, sp: 0, rare: 0, val: 0, to: 0 };
      this.flies.push(f);
    }
    f.on = true;
    f.t = 0;
    f.dur = dur;
    f.ax = ax;
    f.ay = ay;
    f.az = az;
    f.bx = bx;
    f.by = by;
    f.bz = bz;
    f.sp = h.sp;
    f.rare = h.rare;
    f.val = h.val;
    f.to = to;
  }
  private stepFlies(dt: number): void {
    for (const f of this.flies) {
      if (!f.on) continue;
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      _v.set(f.ax + (f.bx - f.ax) * k, f.ay + (f.by - f.ay) * k + Math.sin(k * Math.PI) * 1.6, f.az + (f.bz - f.az) * k);
      _q.setFromEuler(_e.set(k * 6, k * 3, 0));
      _m.compose(_v, _q, _s.set(1, 1, 1));
      this.drawLog(_m, f.sp, f.rare);
      if (k >= 1) {
        f.on = false;
        if (f.to === 1) {
          this.sim.feed(f.val, f.sp | (f.rare << 4));
          this.burst(10, INTAKE_X, 3.2, 0, 3, '#ffd34a', 0.7, 3, 1);
          audio.coin(2);
        } else if (this.load.length < this.capVeh()) {
          this.load.push({ val: f.val, sp: f.sp, rare: f.rare });
          this.vBounceV -= 0.8;
        } else this.sim.feed(f.val, f.sp | (f.rare << 4));
      }
    }
  }

  /* ------------------------------ entrada ------------------------------ */

  private bindInput(): void {
    const el = this.renderer.domElement;
    const down = (e: PointerEvent) => {
      if (this.drag.id >= 0) return;
      this.drag.id = e.pointerId;
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== this.drag.id) return;
      const dx = (e.clientX - this.drag.x) * 0.0062;
      const dy = (e.clientY - this.drag.y) * 0.0055;
      this.lookDX += dx;
      this.lookDY += dy;
      if (this.driving) this.headYaw = Math.max(-2.2, Math.min(2.2, this.headYaw - dx));
      else this.yaw -= dx;
      this.pitch = Math.max(-1.25, Math.min(1.05, this.pitch - dy));
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId === this.drag.id) this.drag.id = -1;
    };
    const kd = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'g' || k === 'q') this.act('grab');
      else if (k === 'r') this.act('throw');
      else if (k === 'v' || k === 'enter') this.act('drive');
      else if (k === 'arrowleft' && !this.driving) this.yaw += 0.3;
      else if (k === 'arrowright' && !this.driving) this.yaw -= 0.3;
    };
    const ctx = (e: MouseEvent) => {
      e.preventDefault();
      this.act('throw');
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('contextmenu', ctx);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('keydown', kd);
    this.offs.push(() => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('contextmenu', ctx);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', kd);
    });
  }

  toWorld(jx: number, jy: number, out: { mx: number; mz: number }): void {
    this.joyX = Math.max(-1, Math.min(1, jx));
    this.joyY = Math.max(-1, Math.min(1, jy));
    if (this.driving) {
      out.mx = out.mz = 0;
      return;
    }
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    out.mx = fx * -jy + -fz * jx;
    out.mz = fz * -jy + fx * jx;
  }

  setQuality(q: QualitySettings): void {
    this.renderer.setPixelRatio(Math.min(this.q.pr, q.dprCap));
    this.q.particles = Math.min(1, q.particleBudget + 0.1);
  }

  resize(): void {
    const w = this.root.clientWidth || window.innerWidth;
    const h = this.root.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    const a = w / h;
    this.cam.aspect = a;
    this.cam.fov = a < 1 ? 78 : 66;
    this.cam.updateProjectionMatrix();
    this.vmCam.aspect = a;
    this.vmCam.fov = a < 1 ? 68 : 50;
    this.vmCam.updateProjectionMatrix();
    // retrato: a ferramenta vem para perto do centro
    this.vmRoot.position.set(a < 1 ? -0.19 : 0, a < 1 ? -0.02 : 0.1, 0);
    this.portrait = a < 1;
  }

  /* ------------------------------ partículas ------------------------------ */

  private emitP(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, grav: number): void {
    if (Math.random() > this.q.particles) return;
    const i = this.pNext;
    this.pNext = (this.pNext + 1) % MAXP;
    const k = i * 3;
    this.pPos[k] = x;
    this.pPos[k + 1] = y;
    this.pPos[k + 2] = z;
    this.pVel[k] = vx;
    this.pVel[k + 1] = vy;
    this.pVel[k + 2] = vz;
    this.pCol[k] = _c.r;
    this.pCol[k + 1] = _c.g;
    this.pCol[k + 2] = _c.b;
    this.pLife[i] = life;
    this.pGrav[i] = grav;
  }
  private burst(n: number, x: number, y: number, z: number, sp: number, color: string, life = 1, up = 4, grav = 1): void {
    _c.set(color);
    for (let i = 0; i < n; i++) this.emitP(x, y, z, (Math.random() - 0.5) * sp, Math.random() * up, (Math.random() - 0.5) * sp, life * (0.6 + Math.random() * 0.6), grav);
  }
  /** lascas voando na direção da câmera */
  private chips(x: number, y: number, z: number, sp: number, kind: number): void {
    const cx = this.cam.position.x - x;
    const cz = this.cam.position.z - z;
    const L = Math.hypot(cx, cz) || 1;
    const S = SPECIES[sp];
    for (let i = 0; i < 12; i++) {
      _c.set(i % 3 === 0 ? '#ffe2b0' : i % 3 === 1 ? S.trunk : S.trunkDark);
      const s = 2 + Math.random() * 3;
      this.emitP(x, y, z, (cx / L) * s + (Math.random() - 0.5) * 3, 1.5 + Math.random() * 3.5, (cz / L) * s + (Math.random() - 0.5) * 3, 0.7 + Math.random() * 0.5, 1);
    }
    if (kind === 1) this.burst(10, x, y, z, 3, '#fff3d0', 0.9, 1.5, 0.35);
    if (kind === 2) this.burst(10, x, y, z, 4, '#9ffcff', 0.5, 3, 0.2);
    _c.set(S.leaf);
    // folhinhas caindo da copa
    const tr = this.sim.trees[this.sim.me.target];
    if (tr) for (let i = 0; i < 3; i++) this.emitP(tr.x + (Math.random() - 0.5) * 3, y + S.h * 0.55, tr.z + (Math.random() - 0.5) * 3, 0, 0, 0, 3, 0.08);
  }
  private stepParticles(dt: number): void {
    const t = this.time;
    for (let i = 0; i < MAXP; i++) {
      if (this.pLife[i] <= 0) continue;
      this.pLife[i] -= dt;
      const k = i * 3;
      const g = this.pGrav[i];
      if (g < 0.5) {
        // folhas e brilhos: flutuam
        this.pVel[k] += Math.sin(t * 2.3 + i) * dt * 1.5;
        this.pVel[k + 2] += Math.cos(t * 1.9 + i * 1.3) * dt * 1.5;
        this.pVel[k] *= 0.98;
        this.pVel[k + 2] *= 0.98;
        this.pVel[k + 1] = this.pVel[k + 1] * 0.97 - 9 * g * dt;
      } else this.pVel[k + 1] -= 16 * g * dt;
      this.pPos[k] += this.pVel[k] * dt;
      this.pPos[k + 1] += this.pVel[k + 1] * dt;
      this.pPos[k + 2] += this.pVel[k + 2] * dt;
      const gy = groundH(this.pPos[k], this.pPos[k + 2]) + 0.04;
      if (this.pPos[k + 1] < gy) {
        this.pPos[k + 1] = gy;
        this.pVel[k] *= 0.4;
        this.pVel[k + 2] *= 0.4;
        this.pVel[k + 1] = 0;
      }
      if (this.pLife[i] <= 0) this.pPos[k + 1] = -500;
    }
    (this.pGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.pGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }
  /** ambiente por bioma: folhas, pétalas, vaga-lumes, brilhos */
  private ambient(dt: number): void {
    this.ambT -= dt;
    if (this.ambT > 0) return;
    this.ambT = 0.12;
    const b = BIOMES[Math.max(0, this.biome)].id;
    const x = this.cam.position.x + Math.sin(this.yaw) * 8 + (Math.random() - 0.5) * 22;
    const z = this.cam.position.z + Math.cos(this.yaw) * 8 + (Math.random() - 0.5) * 22;
    const y = groundH(x, z);
    if (b === 'cerejeiras') _c.set(Math.random() < 0.5 ? '#ffb3d1' : '#ffffff');
    else if (b === 'cogumelos') _c.set('#fff27a');
    else if (b === 'cristal') _c.set(Math.random() < 0.5 ? '#9ffcff' : '#ffffff');
    else if (b === 'nuvens') _c.set('#ffffff');
    else if (b === 'pinheiral') _c.set('#d8ecff');
    else _c.set(Math.random() < 0.5 ? '#8fd85a' : '#ffd34a');
    const glowy = b === 'cogumelos' || b === 'cristal';
    this.emitP(x, y + (glowy ? 0.6 + Math.random() * 3 : 5 + Math.random() * 4), z, 0, glowy ? 0.2 : 0, 0, glowy ? 3 : 5, glowy ? -0.005 : 0.05);
  }

  /* ------------------------------ eventos ------------------------------ */

  private onEvent(e: Ev): void {
    const sim = this.sim;
    switch (e.type) {
      case 'chip': {
        const tr = sim.trees[sim.me.target];
        const mine = tr && Math.abs(tr.x - e.x) < 0.01 && Math.abs(tr.z - e.z) < 0.01;
        if (mine) {
          const k = TOOLS[Math.min(TOOLS.length - 1, sim.s.tool)].kind;
          this.chips(this.aimPt.x, this.aimPt.y, this.aimPt.z, e.a, k === 'axe' ? 0 : k === 'saw' ? 1 : 2);
          this.shake = Math.max(this.shake, k === 'axe' ? 0.09 : 0.035);
          if (k === 'axe') this.hitStop = 0.06;
          const v = this.tv[tr.id];
          const dx = this.cam.position.x - tr.x;
          const dz = this.cam.position.z - tr.z;
          const L = Math.hypot(dx, dz) || 1;
          v.nx = dx / L;
          v.nz = dz / L;
        } else {
          const gy = groundH(e.x, e.z);
          _c.set(SPECIES[e.a].trunk);
          this.burst(6, e.x, gy + 1, e.z, 4, SPECIES[e.a].trunk, 0.7, 3);
          this.burst(3, e.x, gy + 1, e.z, 3, '#ffe2b0', 0.7, 3);
        }
        break;
      }
      case 'fell':
        this.startFall(sim.trees[e.a]);
        break;
      case 'land': {
        const gy = groundH(e.x, e.z);
        this.burst(14, e.x, gy + 0.3, e.z, 6, '#e6d2aa', 0.9, 2);
        break;
      }
      case 'saw':
        this.burst(18, SAW_X - 1.2, 1.4, 0.9, 4, '#ffe6b8', 1, 3);
        break;
      case 'plank':
        if (e.b === 1) this.burst(8, PLANER_X, 1.6, 0, 3, '#fff3d0', 0.8, 2);
        break;
      case 'sell':
      case 'buy':
        this.burst(30, sim.me.x + Math.sin(this.yaw) * 2, this.camY, sim.me.z + Math.cos(this.yaw) * 2, 6, '#ffd34a', 1.2, 6);
        break;
      case 'build':
        this.burst(50, e.x, groundH(e.x, 0) + 2, 0, 9, '#7affc4', 1.5, 7);
        this.burst(40, e.x, groundH(e.x, 0) + 2, 0, 9, '#ffd34a', 1.5, 7);
        break;
      case 'rare':
        this.burst(30, e.x, groundH(e.x, e.z) + e.y, e.z, 6, RARES[e.a].color, 1.5, 5);
        sim.toast?.(RARES[e.a].name() + '!');
        break;
      case 'plant': {
        const v = this.tv.find((_, i) => sim.trees[i].x === e.x && sim.trees[i].z === e.z);
        if (v) v.pop = 1;
        this.burst(12, e.x, groundH(e.x, e.z) + 0.5, e.z, 2, '#9cff8a', 1, 2.5, 0.3);
        break;
      }
      case 'grow':
        this.burst(14, e.x, groundH(e.x, e.z) + e.y, e.z, 4, '#9cff8a', 1.2, 3, 0.2);
        break;
      default:
        break;
    }
  }

  /* ------------------------------ queda ------------------------------ */

  private startFall(tr: Tree): void {
    const v = this.tv[tr.id];
    tr.ext = true;
    v.creak = 0.55;
    v.fallT = 0;
    v.hitGround = false;
    const d = Math.hypot(tr.x - this.sim.me.x, tr.z - this.sim.me.z);
    if (d < 16 || (tr.by === 0 && d < 30)) {
      this.timber.textContent = t('floresta.timber', 'MADEIRAAA!');
      this.timber.classList.remove('on');
      void this.timber.offsetWidth;
      this.timber.classList.add('on');
      this.timberT = 1.6;
    }
    this.scareBirds(tr.x, v.gy + SPECIES[tr.sp].h * 0.8, tr.z, 3 + Math.floor(Math.random() * 3));
  }

  private beginBody(i: number): void {
    const tr = this.sim.trees[i];
    const v = this.tv[i];
    const sp = SPECIES[tr.sp];
    const h = sp.h * 0.85;
    const mesh = this.fallPool.find((m) => !m.visible) ?? this.fallPool[0];
    mesh.geometry = this.geoFor(tr.sp, tr.rare);
    mesh.material = tr.sp === 4 || tr.sp === 5 || tr.rare >= 2 ? this.glowMat : this.treeMat;
    mesh.visible = true;
    mesh.scale.setScalar(0.85);
    v.mesh = mesh;
    const body = new CANNON.Body({ mass: 40, material: this.logMat, angularDamping: 0.25, linearDamping: 0.04, collisionFilterGroup: G_TREE, collisionFilterMask: G_GROUND | G_LOG | G_STATIC });
    body.addShape(new CANNON.Box(new CANNON.Vec3(0.35, h * 0.5, 0.35)));
    // copa: uma esfera no alto para quicar
    body.addShape(new CANNON.Sphere(Math.min(1.6, h * 0.18)), new CANNON.Vec3(0, h * 0.3, 0));
    const tilt = 0.2;
    AXIS.set(tr.fdz, 0, -tr.fdx).normalize();
    _q.setFromAxisAngle(AXIS, tilt);
    _v.set(0, h * 0.5, 0).applyQuaternion(_q);
    body.position.set(tr.x + _v.x, v.gy + _v.y + 0.05, tr.z + _v.z);
    body.quaternion.set(_q.x, _q.y, _q.z, _q.w);
    body.angularVelocity.set(AXIS.x * 1.3, 0, AXIS.z * 1.3);
    this.world.addBody(body);
    v.body = body;
  }

  private stepFalls(dt: number): void {
    const sim = this.sim;
    for (let i = 0; i < this.tv.length; i++) {
      const v = this.tv[i];
      if (v.creak > 0) {
        v.creak -= dt;
        if (v.creak <= 0) this.beginBody(i);
        continue;
      }
      const b = v.body;
      if (!b || !v.mesh) continue;
      const tr = sim.trees[i];
      const sp = SPECIES[tr.sp];
      const h = sp.h * 0.85;
      v.fallT += dt;
      _q.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      _v.set(0, -h / 2, 0).applyQuaternion(_q);
      v.mesh.position.set(b.position.x + _v.x, b.position.y + _v.y, b.position.z + _v.z);
      v.mesh.quaternion.copy(_q).multiply(_q2.setFromAxisAngle(UP, v.rotY));
      _v2.set(0, 1, 0).applyQuaternion(_q);
      if (!v.hitGround && _v2.y < 0.45) {
        v.hitGround = true;
        this.treeImpact(i, b.position.x + _v2.x * h * 0.3, b.position.z + _v2.z * h * 0.3, _v2.x, _v2.z);
      }
      const done = (v.hitGround && v.fallT > 1 && (b.angularVelocity.length() < 1.5 || v.fallT > 2.2)) || v.fallT > 3;
      if (done) {
        const L = Math.hypot(_v2.x, _v2.z) || 1;
        tr.fdx = _v2.x / L;
        tr.fdz = _v2.z / L;
        // base do tronco fica onde caiu: as toras nascem ao longo dele
        const ox = tr.x;
        const oz = tr.z;
        tr.x = v.mesh.position.x;
        tr.z = Math.max(-WORLD_Z, Math.min(WORLD_Z, v.mesh.position.z));
        this.world.removeBody(b);
        v.body = null;
        v.mesh.visible = false;
        v.mesh = null;
        tr.ext = false;
        const before = sim.logs.filter((l) => l.on).length;
        sim.landTree(tr);
        tr.x = ox;
        tr.z = oz;
        void before;
        // poeira e "pof" ao virar toras
        this.burst(20, tr.x + tr.fdx * h * 0.5, v.gy + 0.6, tr.z + tr.fdz * h * 0.5, 7, '#ffffff', 0.8, 3, 0.5);
        _c.set(sp.leaf);
        for (let k = 0; k < 18; k++) {
          const d = Math.random() * h;
          this.emitP(tr.x + tr.fdx * d, v.gy + 0.8, tr.z + tr.fdz * d, (Math.random() - 0.5) * 6, 2 + Math.random() * 4, (Math.random() - 0.5) * 6, 1.5, 0.3);
        }
      }
    }
  }

  /** a árvore bate no chão: tremida, folhas, arbustos amassados, chuva de folhas */
  private treeImpact(i: number, x: number, z: number, dx: number, dz: number): void {
    const tr = this.sim.trees[i];
    const sp = SPECIES[tr.sp];
    const d = Math.hypot(x - this.sim.me.x, z - this.sim.me.z);
    this.shake = Math.max(this.shake, Math.max(0, 0.6 - d * 0.025));
    if (d < 25) tap('heavy');
    audio.land(2);
    const gy = groundH(x, z);
    this.burst(26, x, gy + 0.5, z, 9, '#e6d2aa', 1, 3);
    _c.set(sp.leaf);
    for (let k = 0; k < 30; k++) this.emitP(x + (Math.random() - 0.5) * 4, gy + 1 + Math.random() * 2, z + (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 8, 2 + Math.random() * 6, (Math.random() - 0.5) * 8, 2.5, 0.12);
    _c.set(sp.leaf2);
    for (let k = 0; k < 16; k++) this.emitP(x + (Math.random() - 0.5) * 8, gy + 6 + Math.random() * 3, z + (Math.random() - 0.5) * 8, 0, 0, 0, 4, 0.06);
    // amassa arbustos ao longo do tronco
    const h = sp.h;
    const L = Math.hypot(dx, dz) || 1;
    const ux = dx / L;
    const uz = dz / L;
    const n = this.bushSq.length;
    for (let b = 0; b < n; b++) {
      const bx = this.bushPos[b * 3] - tr.x;
      const bz = this.bushPos[b * 3 + 1] - tr.z;
      if (Math.abs(bx) > h + 2) continue;
      const along = bx * ux + bz * uz;
      const perp = Math.abs(-bx * uz + bz * ux);
      if (along > 0 && along < h * 1.05 && perp < 1.6) {
        this.bushSq[b] = 1;
        this.bushDirty.add(b);
        _c.set('#7ad86a');
        this.burst(6, this.bushPos[b * 3], groundH(this.bushPos[b * 3], this.bushPos[b * 3 + 1]) + 0.5, this.bushPos[b * 3 + 1], 4, '#7ad86a', 0.8, 3);
      }
    }
    // amigos perto levam um susto (pulinho)
    for (const a of this.sim.agents) {
      const ax = a.x - tr.x;
      const az = a.z - tr.z;
      const along = ax * ux + az * uz;
      if (along > 0 && along < h && Math.abs(-ax * uz + az * ux) < 1.4) {
        const av = this.agentVis.get(a);
        if (av && av.bonk <= 0) {
          av.bonk = 1.3;
          a.wait = Math.max(a.wait, 1.2);
        }
      }
    }
  }

  /* ------------------------------ mira ------------------------------ */

  private aim(): void {
    const sim = this.sim;
    const C = this.cam.position;
    const cp = Math.cos(this.pitch);
    const dx = Math.sin(this.yaw) * cp;
    const dy = Math.sin(this.pitch);
    const dz = Math.cos(this.yaw) * cp;
    let best = -1;
    let bt = REACH;
    const a = dx * dx + dz * dz;
    for (let i = 0; i < sim.trees.length; i++) {
      const tr = sim.trees[i];
      if (tr.state !== TS.Grown || tr.biome >= sim.s.unlocked || this.tv[i].creak > 0) continue;
      const fx = C.x - tr.x;
      const fz = C.z - tr.z;
      if (fx * fx + fz * fz > 16) continue;
      const r = trunkR(tr.sp) + 0.12;
      const b = 2 * (fx * dx + fz * dz);
      const c = fx * fx + fz * fz - r * r;
      const disc = b * b - 4 * a * c;
      if (disc < 0 || a < 1e-4) continue;
      const tt = (-b - Math.sqrt(disc)) / (2 * a);
      if (tt < 0 || tt > bt) continue;
      const y = C.y + dy * tt;
      const gy = this.tv[i].gy;
      if (y < gy - 0.2 || y > gy + SPECIES[tr.sp].h * 0.6) continue;
      bt = tt;
      best = i;
      this.aimPt.set(C.x + dx * tt, y, C.z + dz * tt);
    }
    if (best < 0) {
      // ajuda: tronco bem à frente
      let bd = 2.6;
      const hx = Math.sin(this.yaw);
      const hz = Math.cos(this.yaw);
      for (let i = 0; i < sim.trees.length; i++) {
        const tr = sim.trees[i];
        if (tr.state !== TS.Grown || tr.biome >= sim.s.unlocked || this.tv[i].creak > 0) continue;
        const ox = tr.x - C.x;
        const oz = tr.z - C.z;
        const d = Math.hypot(ox, oz) - trunkR(tr.sp);
        if (d > bd) continue;
        if ((ox * hx + oz * hz) / (Math.hypot(ox, oz) + 1e-3) < 0.86) continue;
        bd = d;
        best = i;
        const L = Math.hypot(ox, oz) || 1;
        const r = trunkR(tr.sp);
        this.aimPt.set(tr.x - (ox / L) * r, Math.max(this.tv[i].gy + 0.5, Math.min(C.y - 0.3, this.tv[i].gy + 1.4)), tr.z - (oz / L) * r);
        bt = d;
      }
    }
    sim.aim = best;
    this.aimDist = bt;
    this.aimTree = best;
    // toras
    let bl = -1;
    let bdl = 3.4;
    if (!this.driving && this.held.length < HAND_CAP) {
      for (let i = 0; i < sim.logs.length; i++) {
        const l = sim.logs[i];
        if (!l.on || l.ghost || l.age < 0.3) continue;
        const wx = l.x - C.x;
        const wy = l.y - C.y;
        const wz = l.z - C.z;
        const tt = wx * dx + wy * dy + wz * dz;
        if (tt < 0 || tt > bdl) continue;
        const p2 = wx * wx + wy * wy + wz * wz - tt * tt;
        if (p2 < 0.5) {
          bdl = tt;
          bl = i;
        }
      }
      if (bl < 0) {
        let bd = 2.2;
        const hx = Math.sin(this.yaw);
        const hz = Math.cos(this.yaw);
        for (let i = 0; i < sim.logs.length; i++) {
          const l = sim.logs[i];
          if (!l.on || l.ghost || l.age < 0.3) continue;
          const ox = l.x - C.x;
          const oz = l.z - C.z;
          const d = Math.hypot(ox, oz);
          if (d < bd && (ox * hx + oz * hz) / (d + 1e-3) > 0.55) {
            bd = d;
            bl = i;
          }
        }
      }
    }
    this.aimLog = best >= 0 && bl >= 0 && bt < bdl - 0.3 ? -1 : bl;
    if (this.aimLog >= 0) {
      const l = sim.logs[this.aimLog];
      this.marker.visible = true;
      this.marker.position.set(l.x, l.y + 0.75 + Math.abs(Math.sin(this.time * 5)) * 0.2, l.z);
      this.marker.rotation.y = this.time * 3;
    } else this.marker.visible = false;
  }

  /* ------------------------------ colisões do jogador ------------------------------ */

  private pushOutSolids(r: number, veh: boolean): void {
    const S = this.solids;
    for (let i = 0; i < S.length; i += 4) {
      const x0 = S[i] - r;
      const z0 = S[i + 1] - r;
      const x1 = S[i + 2] + r;
      const z1 = S[i + 3] + r;
      const px = veh ? this.vx : this.sim.me.x;
      const pz = veh ? this.vz : this.sim.me.z;
      if (px <= x0 || px >= x1 || pz <= z0 || pz >= z1) continue;
      const dl = px - x0;
      const dr = x1 - px;
      const dn = pz - z0;
      const df = z1 - pz;
      const mn = Math.min(dl, dr, dn, df);
      let nx = px;
      let nz = pz;
      if (mn === dl) nx = x0;
      else if (mn === dr) nx = x1;
      else if (mn === dn) nz = z0;
      else nz = z1;
      if (veh) {
        this.vx = nx;
        this.vz = nz;
        if (Math.abs(this.vSpeed) > 3) this.bump(0.2);
        this.vSpeed *= 0.4;
      } else {
        this.sim.me.x = nx;
        this.sim.me.z = nz;
      }
    }
  }

  private collidePlayer(): void {
    const sim = this.sim;
    const m = sim.me;
    for (let i = 0; i < sim.trees.length; i++) {
      const tr = sim.trees[i];
      if (tr.state !== TS.Grown && !(tr.state === TS.Sapling && tr.grow > 0.5) && tr.state !== TS.Stump) continue;
      const dx = m.x - tr.x;
      if (dx > 2 || dx < -2) continue;
      const dz = m.z - tr.z;
      const r = (tr.state === TS.Stump ? 0.36 : trunkR(tr.sp)) + 0.32;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        m.x = tr.x + (dx / d) * r;
        m.z = tr.z + (dz / d) * r;
      }
    }
    this.pushOutSolids(0.35, false);
    // veículo parado
    if (this.veh && !this.driving) {
      this.vehLocal(m.x, 0, m.z, _v3);
      const L = this.veh.len / 2 + 0.35;
      const W = this.veh.wid / 2 + 0.35;
      if (Math.abs(_v3.x) < L && Math.abs(_v3.z) < W) {
        const fx = Math.sin(this.vh);
        const fz = Math.cos(this.vh);
        const ex = L - Math.abs(_v3.x);
        const ez = W - Math.abs(_v3.z);
        if (ex < ez) {
          const s = Math.sign(_v3.x) * ex;
          m.x += fx * s;
          m.z += fz * s;
        } else {
          const s = Math.sign(_v3.z) * ez;
          m.x += -fz * s;
          m.z += fx * s;
        }
      }
    }
    if (m.z < -WORLD_Z) m.z = -WORLD_Z;
    if (m.z > WORLD_Z) m.z = WORLD_Z;
  }

  /* ------------------------------ quadro ------------------------------ */

  frame(dt: number): void {
    this.time += dt;
    const sim = this.sim;
    if (this.toolLvl !== sim.s.tool) this.rebuildTool();
    sim.drain((e) => this.onEvent(e));
    if (!this.driving) this.collidePlayer();
    this.logN = 0;
    this.syncVehicle(dt);
    const m = sim.me;
    // jogador cinemático (empurra toras ao andar)
    const gyP = groundH(m.x, m.z);
    this.pBody.velocity.set(this.driving ? 0 : m.vx, 0, this.driving ? 0 : m.vz);
    this.pBody.position.set(m.x, this.driving ? -50 : gyP + 0.55, m.z);
    this.world.step(1 / 60, dt, 2);
    this.pBody.position.set(m.x, this.driving ? -50 : gyP + 0.55, m.z);
    this.stepFalls(dt);
    if (this.bonkCD > 0) this.bonkCD -= dt;
    if (this.hitStop > 0) this.hitStop -= dt;
    if (this.grabAnim > 0) this.grabAnim = Math.max(0, this.grabAnim - dt * 4);
    if (this.throwAnim > 0) this.throwAnim = Math.max(0, this.throwAnim - dt * 3.5);
    if (this.kickAnim > 0) this.kickAnim = Math.max(0, this.kickAnim - dt * 4);

    // céu por bioma
    const b = sim.biome;
    if (b !== this.biome) {
      this.biome = b;
      const B = BIOMES[b];
      this.skyT[0].set(B.sky[0]);
      this.skyT[1].set(B.sky[1]);
      this.skyT[2].set(B.mid);
      this.fogT = FOG[b];
      this.hemi.intensity = B.night ? 0.9 : 1.5;
      this.sun.intensity = B.night ? 0.45 : 1.7;
      this.hemi.color.set(B.night ? '#8a7aff' : '#eaf6ff');
      this.stars.visible = !!B.night;
    }
    const k = Math.min(1, dt * 1.5);
    this.skyU.top.value.lerp(this.skyT[0], k);
    this.skyU.mid.value.lerp(this.skyT[1], k);
    this.skyU.bot.value.lerp(this.skyT[2], k);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(this.skyU.mid.value);
    fog.near += (this.fogT[0] - fog.near) * k;
    fog.far += (this.fogT[1] - fog.far) * k;
    this.scene.background = this.skyU.mid.value;

    // câmera
    const px = m.x;
    const pz = m.z;
    let eyeY: number;
    let camYaw = this.yaw;
    const walk = this.driving ? 0 : Math.min(1, Math.hypot(m.vx, m.vz) / 6);
    if (this.driving && this.veh) {
      this.veh.g.updateMatrixWorld();
      _v.copy(this.veh.seat);
      this.veh.g.localToWorld(_v);
      eyeY = _v.y;
      this.cam.position.set(_v.x, _v.y, _v.z);
      camYaw = this.vh + this.headYaw;
      this.yaw = camYaw;
      this.camY = eyeY;
    } else {
      this.bob += dt * walk * 9;
      eyeY = gyP + EYE + Math.abs(Math.sin(this.bob)) * 0.06 * walk;
      this.camY += (eyeY - this.camY) * Math.min(1, dt * 14);
      this.cam.position.set(px, this.camY, pz);
    }
    if (this.shake > 0) {
      const s = this.shake * this.shake;
      this.cam.position.x += (Math.random() - 0.5) * s * 0.6;
      this.cam.position.y += (Math.random() - 0.5) * s * 0.6;
      this.cam.position.z += (Math.random() - 0.5) * s * 0.6;
      this.shake = Math.max(0, this.shake - dt * 1.6);
    }
    const cp = Math.cos(this.pitch);
    _v.set(this.cam.position.x + Math.sin(camYaw) * cp, this.cam.position.y + Math.sin(this.pitch), this.cam.position.z + Math.cos(camYaw) * cp);
    this.cam.lookAt(_v);
    this.rollV += (-this.roll * 40 - this.rollV * 5) * dt;
    this.roll += this.rollV * dt;
    if (Math.abs(this.roll) > 1e-3) this.cam.rotateZ(this.roll * 0.3);
    this.cam.updateMatrixWorld();
    // céu segue a câmera
    this.sky.position.copy(this.cam.position);
    this.stars.position.copy(this.cam.position);
    this.sunSpr.position.set(this.cam.position.x - 50, this.cam.position.y + 55, this.cam.position.z + 40);
    (this.sunSpr.material as THREE.SpriteMaterial).color.set(BIOMES[this.biome].night ? '#c8d0ff' : '#ffffff');
    this.sunSpr.scale.setScalar(BIOMES[this.biome].night ? 12 : 22);
    for (const c of this.clouds) {
      const ox = c.userData.ox as number;
      const span = 160;
      const cx = this.cam.position.x - 80 + ((((ox + this.time * 0.6 - this.cam.position.x * 0.2) % span) + span) % span);
      c.position.set(cx, c.userData.h * (BIOMES[this.biome].id === 'nuvens' ? 0.5 : 1), c.userData.oz);
    }
    this.sun.position.set(px - 12, gyP + 24, pz + 10);
    this.sun.target.position.set(px + 4, gyP, pz);

    // mira (antes de detectar golpe)
    this.aim();
    // golpe: a simulação acabou de bater?
    if (m.swing > this.prevSwing + 0.5 && m.target < 0 && sim.input.chop) this.shake = Math.max(this.shake, 0.02);
    this.prevSwing = m.swing;

    // árvores (instâncias)
    this.syncTrees(dt);
    this.syncLogs(dt);
    this.stepFlies(dt);
    this.syncMill(dt);
    // portões e parede invisível
    for (let i = 0; i < this.gates.length; i++) {
      const built = sim.s.unlocked > i + 1;
      if (built !== this.gateBuilt[i]) this.fillGate(i + 1, this.gates[i], built);
    }
    if (this.gateAt !== sim.limitX) {
      this.gateAt = sim.limitX;
      this.gateBody.position.set(sim.limitX + 1.2, 0, 0);
    }
    // chegou no funil com toras nas mãos: entrega sozinho
    if (!this.driving && this.held.length && this.nearFunnel(m.x, m.z, 2.3) && this.fliesTo(1) === 0) {
      const h = this.held.pop()!;
      this.addFly(h, m.x, this.camY - 0.3, m.z, INTAKE_X, 3.4, 0, 1, 0.4);
      this.throwAnim = 1;
    }
    // carga (para a barra de cima e o online)
    m.carry = this.held.length + this.load.length;
    // arbustos amassados voltam devagar
    if (this.bushDirty.size) {
      for (const bi of this.bushDirty) {
        this.bushSq[bi] = Math.max(0, this.bushSq[bi] - dt * 0.12);
        this.setBush(bi);
        if (this.bushSq[bi] <= 0) this.bushDirty.delete(bi);
      }
    }
    this.syncAgents(dt);
    this.stepBirds(dt);
    this.ambient(dt);
    this.stepParticles(dt);
    // instâncias de toras deste quadro
    this.logSide.count = this.logCap.count = this.logN;
    this.logSide.instanceMatrix.needsUpdate = this.logCap.instanceMatrix.needsUpdate = true;
    if (this.logSide.instanceColor) this.logSide.instanceColor.needsUpdate = true;
    if (this.logCap.instanceColor) this.logCap.instanceColor.needsUpdate = true;

    this.poseTool(dt, walk);
    this.lookDX = this.lookDY = 0;
    this.updateUI();

    this.renderer.info.reset();
    this.renderer.clear();
    this.renderer.render(this.scene, this.cam);
    this.renderer.clearDepth();
    this.renderer.render(this.vmScene, this.vmCam);
  }

  private syncTrees(dt: number): void {
    const sim = this.sim;
    const cx = this.cam.position.x;
    for (const im of this.treeInst.values()) im.count = 0;
    let ns = 0;
    let nn = 0;
    for (let i = 0; i < sim.trees.length; i++) {
      const tr = sim.trees[i];
      const v = this.tv[i];
      if (Math.abs(tr.x - cx) > VIEW_R) continue;
      const st = tr.state;
      if (st === TS.Stump || st === TS.Sapling || (st === TS.Falling && v.creak <= 0)) {
        _m.compose(_v.set(tr.x, v.gy - 0.02, tr.z), _q.setFromAxisAngle(UP, v.rotY), _s.set(1, 1, 1));
        this.stumps.setMatrixAt(ns, _m);
        _c.set(SPECIES[tr.sp].trunkDark);
        this.stumps.setColorAt(ns, _c);
        ns++;
      }
      if (st === TS.Falling && v.creak <= 0) continue;
      if (st !== TS.Grown && st !== TS.Sapling && st !== TS.Falling) continue;
      let s = 1;
      let tilt = 0;
      let tdx = tr.fdx;
      let tdz = tr.fdz;
      if (st === TS.Sapling) {
        // muda crescendo com mola (dá para ver crescer)
        if (v.pop > 0) v.pop = Math.max(0, v.pop - dt * 1.5);
        s = 0.08 + tr.grow * 0.92;
        s *= 1 + Math.sin(this.time * 6 + i) * 0.03 * (1 - tr.grow) + v.pop * Math.sin(v.pop * 20) * 0.3;
        tilt = Math.sin(this.time * 2 + i) * 0.05;
      } else if (st === TS.Falling) {
        // range: estala e balança antes de cair
        const k = 1 - v.creak / 0.55;
        tilt = k * 0.16 + Math.sin(this.time * 34) * 0.025 * (0.4 + k);
      } else {
        tilt = Math.sin(this.time * 1.3 + i * 0.7) * 0.012;
        tdx = 1;
        tdz = 0.3;
        if (tr.shake > 0) {
          tilt += Math.sin(tr.shake * 70) * tr.shake * 0.12;
          tdx = -v.nx;
          tdz = -v.nz;
        }
        // entalhe no lado de quem corta
        if (tr.hp < tr.maxHp && nn < 24) {
          const dmg = 1 - tr.hp / tr.maxHp;
          const r = trunkR(tr.sp) * (SPECIES[tr.sp].shape === 'mushroom' ? 0.95 : 0.84);
          const a = Math.atan2(v.nx, v.nz);
          _m.compose(
            _v.set(tr.x + v.nx * r * 0.97, v.gy + Math.min(1.1, 0.5 + SPECIES[tr.sp].h * 0.08), tr.z + v.nz * r * 0.97),
            _q.setFromAxisAngle(UP, a),
            _s.set(0.1 + dmg * 0.14, 0.02 + dmg * 0.06, 0.03 + dmg * 0.035),
          );
          this.notches.setMatrixAt(nn++, _m);
        }
      }
      const L = Math.hypot(tdx, tdz) || 1;
      AXIS.set(tdz / L, 0, -tdx / L);
      _q.setFromAxisAngle(AXIS, tilt).multiply(_q2.setFromAxisAngle(UP, v.rotY));
      _m.compose(_v.set(tr.x, v.gy - 0.05, tr.z), _q, _s.set(s, s, s));
      const im = this.instFor(tr.sp, tr.rare);
      if (im.count < im.instanceMatrix.count) im.setMatrixAt(im.count++, _m);
    }
    for (const im of this.treeInst.values()) im.instanceMatrix.needsUpdate = true;
    this.stumps.count = ns;
    this.stumps.instanceMatrix.needsUpdate = true;
    if (this.stumps.instanceColor) this.stumps.instanceColor.needsUpdate = true;
    this.notches.count = nn;
    this.notches.instanceMatrix.needsUpdate = true;
  }

  private syncMill(dt: number): void {
    const sim = this.sim;
    this.blade.rotation.z -= dt * (sim.sawing >= 0 ? 26 : 3);
    this.beltTex.offset.x += dt * 0.7 * (1 + sim.s.mach.belt * 0.3);
    this.drum.rotation.y += dt * 8;
    // tora sendo serrada desliza para a lâmina
    if (sim.sawing >= 0) {
      const p = 1 - Math.max(0, sim.sawT) / Math.max(0.2, 1.1 / (1 + sim.s.mach.saw * 0.35));
      _m.compose(_v.set(SAW_X + 1.6 - p * 2.4, 1.3, 0.9), _q.setFromAxisAngle(UP, 0), _s.set(1, 1, 1));
      this.drawLog(_m, sim.sawing & 15, 0);
      if (Math.random() < 0.6) this.burst(2, SAW_X - 1.2, 1.4, 0.9, 3, '#ffe6b8', 0.6, 2);
    }
    let n = 0;
    for (const it of sim.belt) {
      if (!it.on) continue;
      const c = Math.min(5, it.n);
      for (let j = 0; j < c && n < 200; j++) {
        _m.compose(_v.set(it.x, 1.02 + j * 0.095, 0), _q.setFromAxisAngle(UP, (j % 2) * 0.08 - 0.04), _s.set(1, 1, 1));
        this.planks.setMatrixAt(n, _m);
        this.planks.setColorAt(n, _c.set(it.planed ? '#ffe2b0' : SPECIES[it.sp].trunk));
        n++;
      }
    }
    this.planks.count = n;
    this.planks.instanceMatrix.needsUpdate = true;
    if (this.planks.instanceColor) this.planks.instanceColor.needsUpdate = true;
    const sc = Math.min(80, Math.ceil(Math.sqrt(sim.s.planks) * 2.2));
    if (this.stack.count !== sc) {
      for (let i = 0; i < sc; i++) {
        const layer = Math.floor(i / 4);
        const col = i % 4;
        const rot = layer % 2 ? Math.PI / 2 : 0;
        const ox = rot ? (col - 1.5) * 0.5 : 0;
        const oz = rot ? 0 : (col - 1.5) * 0.36;
        _m.compose(_v.set(PALLET_X - 0.4 + ox, 0.36 + layer * 0.095, oz), _q.setFromAxisAngle(UP, rot), _s.set(1, 1, rot ? 1 : 0.7));
        this.stack.setMatrixAt(i, _m);
      }
      this.stack.count = sc;
      this.stack.instanceMatrix.needsUpdate = true;
    }
  }

  /* ------------------------------ amigos, robôs e pássaros ------------------------------ */

  private heroTex(skinId: string): THREE.Texture {
    let tx = this.heroTexs.get(skinId);
    if (tx) return tx;
    const skin = skinId === 'me' ? (SKINS.find((s) => s.id === globalSave.skin) ?? SKINS[0]) : (SKINS.find((s) => s.id === skinId) ?? SKINS[0]);
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d')!;
    x.translate(64, 70);
    const pose: PlayerPose = { t: 0, blink: 0, lookX: 0, lookY: 0.1, sx: 1, sy: 1, mood: 'happy', lx: -0.5, ly: -0.7, still: true };
    try {
      drawPlayer(x, skin, 40, pose);
    } catch {
      x.fillStyle = skin.light;
      x.beginPath();
      x.arc(0, 0, 40, 0, TAU);
      x.fill();
    }
    tx = this.trackT(new THREE.CanvasTexture(c));
    tx.colorSpace = THREE.SRGBColorSpace;
    this.heroTexs.set(skinId, tx);
    return tx;
  }

  private emoTex(code: string): THREE.Texture {
    let tx = this.emoTexs.get(code);
    if (tx) return tx;
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const x = c.getContext('2d')!;
    x.fillStyle = '#fff';
    x.strokeStyle = INK;
    x.lineWidth = 5;
    x.beginPath();
    x.roundRect(8, 8, 80, 66, 20);
    x.moveTo(40, 74);
    x.lineTo(48, 90);
    x.lineTo(58, 74);
    x.fill();
    x.stroke();
    x.lineWidth = 4;
    if (code === 'coracao') {
      x.fillStyle = '#ff4f6a';
      x.beginPath();
      x.moveTo(48, 62);
      x.bezierCurveTo(16, 42, 26, 14, 48, 30);
      x.bezierCurveTo(70, 14, 80, 42, 48, 62);
      x.fill();
      x.stroke();
    } else if (code === 'uau' || code === 'joinha') {
      x.fillStyle = '#ffd34a';
      x.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? 11 : 25;
        x.lineTo(48 + Math.cos(a) * r, 42 + Math.sin(a) * r);
      }
      x.closePath();
      x.fill();
      x.stroke();
    } else {
      x.fillStyle = '#ffd34a';
      x.beginPath();
      x.arc(48, 41, 24, 0, TAU);
      x.fill();
      x.stroke();
      x.fillStyle = INK;
      x.beginPath();
      x.arc(40, 36, 3.5, 0, TAU);
      x.arc(56, 36, 3.5, 0, TAU);
      x.fill();
      x.beginPath();
      x.arc(48, 44, 11, 0.2, Math.PI - 0.2);
      x.stroke();
    }
    tx = this.trackT(new THREE.CanvasTexture(c));
    tx.colorSpace = THREE.SRGBColorSpace;
    this.emoTexs.set(code, tx);
    return tx;
  }

  private agentVisFor(key: object, kind: string, skin: string, name: string): AgentVis {
    let o = this.agentVis.get(key);
    if (o) return o;
    const g = new THREE.Group();
    let spr: THREE.Sprite | null = null;
    let tool: THREE.Object3D | null = null;
    const rot: THREE.Object3D[] = [];
    if (kind === 'friend' || kind === 'remote') {
      spr = new THREE.Sprite(this.track(new THREE.SpriteMaterial({ map: this.heroTex(skin) })));
      spr.scale.set(1.6, 1.6, 1);
      spr.position.y = 0.8;
      g.add(spr);
      const l = this.label(name, '#fff', 0.55);
      l.position.y = 1.95;
      g.add(l);
      const tg = new THREE.Group();
      const handle = this.box(0.07, 0.8, 0.07, '#a8743c', 0, 0.4, 0, tg);
      void handle;
      this.box(0.06, 0.26, 0.36, '#dcd6f0', 0, 0.75, 0.15, tg);
      tg.position.set(0.55, 0.45, 0.25);
      g.add(tg);
      tool = tg;
    } else if (kind === 'drone') {
      const body = new THREE.Mesh(geoms.ico, this.track(lambert('#2a9be0')));
      body.scale.set(0.6, 0.35, 0.6);
      g.add(body);
      for (const dx of [-0.7, 0.7]) rot.push(this.box(0.8, 0.05, 0.12, '#dcd6f0', dx, 0.35, 0, g));
    } else {
      const col = kind === 'planter' ? '#3ee07a' : '#dcd6f0';
      this.box(0.9, 0.9, 0.7, col, 0, 0.85, 0, g);
      this.box(0.6, 0.3, 0.05, INK, 0, 0.95, 0.36, g);
      this.box(0.12, 0.08, 0.06, '#7affc4', -0.14, 0.97, 0.39, g, 0.6);
      this.box(0.12, 0.08, 0.06, '#7affc4', 0.14, 0.97, 0.39, g, 0.6);
      this.box(0.18, 0.4, 0.18, '#5a4585', -0.25, 0.2, 0, g);
      this.box(0.18, 0.4, 0.18, '#5a4585', 0.25, 0.2, 0, g);
      if (kind === 'planter') {
        const l = new THREE.Mesh(geoms.ico, this.track(lambert('#5cd04a')));
        l.scale.set(0.3, 0.14, 0.22);
        l.position.y = 1.45;
        g.add(l);
      } else {
        const tg = new THREE.Group();
        this.box(0.07, 0.7, 0.07, '#a8743c', 0, 0.35, 0, tg);
        this.box(0.06, 0.22, 0.3, '#ffcf2e', 0, 0.65, 0.12, tg);
        tg.position.set(0.55, 0.7, 0);
        g.add(tg);
        tool = tg;
      }
    }
    const carry = new THREE.Group();
    const lg = new THREE.Mesh(this.trackG(logSideGeometry()), this.track(new THREE.MeshLambertMaterial({ color: '#9a6a3c', vertexColors: true })));
    lg.scale.setScalar(0.7);
    carry.add(lg);
    carry.position.y = kind === 'drone' ? -0.45 : 1.75;
    g.add(carry);
    this.scene.add(g);
    o = { g, spr, tool, carry, emo: null, emoCode: '', bonk: 0, rot };
    this.agentVis.set(key, o);
    return o;
  }

  private placeAgent(o: AgentVis, x: number, y: number, z: number, walk: number, chop: boolean, swing: number, carry: boolean, emote: string, emoteT: number, dt: number, face: number): void {
    const gy = groundH(x, z);
    const hop = Math.abs(Math.sin(walk * 3)) * 0.12;
    let by = gy + y + hop;
    if (o.bonk > 0) {
      o.bonk -= dt;
      const k = 1 - o.bonk / 1.3;
      by += Math.sin(Math.min(1, k * 1.6) * Math.PI) * 1.4;
      if (o.spr) o.spr.material.rotation = k < 0.6 ? k * 14 : 0;
      if (Math.random() < 0.3) this.burst(1, x, by + 1.8, z, 1, '#ffd34a', 0.5, 1, 0.1);
    } else if (o.spr && o.spr.material.rotation) o.spr.material.rotation = 0;
    o.g.position.set(x, by, z);
    // o grupo olha para a câmera (o sprite já olha sozinho)
    o.g.rotation.y = Math.atan2(this.cam.position.x - x, this.cam.position.z - z);
    if (o.tool) {
      o.tool.rotation.z = chop ? -0.3 - Math.sin(Math.max(0, swing) * Math.PI) * 1.4 : -0.25;
      o.tool.position.x = face >= 0 ? 0.55 : -0.55;
    }
    if (o.carry) o.carry.visible = carry;
    for (const r of o.rot) r.rotation.y += dt * 40;
    if (emoteT > 0 && emote) {
      if (!o.emo) {
        o.emo = new THREE.Sprite(this.track(new THREE.SpriteMaterial({ map: this.emoTex(emote), depthWrite: false })));
        o.emo.scale.setScalar(0.9);
        o.g.add(o.emo);
      }
      if (o.emoCode !== emote) {
        o.emoCode = emote;
        o.emo.material.map = this.emoTex(emote);
      }
      o.emo.visible = true;
      o.emo.position.y = 2.6 + Math.sin(this.time * 4) * 0.08;
    } else if (o.emo) o.emo.visible = false;
  }

  private syncAgents(dt: number): void {
    const sim = this.sim;
    this.seen.clear();
    const cx = this.cam.position.x;
    for (const a of sim.agents) {
      const o = this.agentVisFor(a, a.kind, a.skin, a.name);
      this.seen.add(a);
      o.g.visible = Math.abs(a.x - cx) < VIEW_R;
      if (!o.g.visible) continue;
      const fl = a.kind === 'drone' ? 1.2 + Math.sin(this.time * 4 + a.idx) * 0.1 : 0;
      this.placeAgent(o, a.x, a.y + fl, a.z, a.kind === 'drone' ? 0 : a.walk, a.state === 'chop', a.swing * a.rate, a.carry > 0, a.emote, a.emoteT, dt, a.face);
    }
    for (const r of sim.remotes) {
      const o = this.agentVisFor(r, 'remote', r.skin, r.name);
      this.seen.add(r);
      o.g.visible = Math.abs(r.x - cx) < VIEW_R;
      this.placeAgent(o, r.x, 0, r.z, r.walk, !!r.chop, r.swing, r.carry > 0, r.emote, r.emoteT, dt, r.face);
    }
    for (const [k, o] of this.agentVis) {
      if (this.seen.has(k)) continue;
      this.scene.remove(o.g);
      this.agentVis.delete(k);
    }
  }

  private stepBirds(dt: number): void {
    const flap = Math.floor(this.time * 10) % 2;
    for (const b of this.birds) {
      if (b.life <= 0) continue;
      b.life -= dt;
      b.vy += dt * 0.6;
      b.s.position.x += b.vx * dt;
      b.s.position.y += b.vy * dt;
      b.s.position.z += b.vz * dt;
      b.s.material = this.birdMats[flap];
      if (b.life <= 0) b.s.visible = false;
    }
  }

  destroy(): void {
    for (const f of this.offs) f();
    this.sim.groundY = null;
    this.ui.remove();
    this.renderer.domElement.remove();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && !this.geos.includes(m.geometry) && !Object.values(geoms).includes(m.geometry as never)) m.geometry.dispose();
      if ((m as THREE.InstancedMesh).isInstancedMesh) (m as THREE.InstancedMesh).dispose();
    });
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    for (const tx of this.texs) tx.dispose();
    this.armR?.dispose();
    this.armL?.dispose();
    this.renderer.dispose();
  }
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
