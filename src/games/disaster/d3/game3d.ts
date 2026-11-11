/* ============================================================
 *  SOBREVIVA AOS DESASTRES — MODO 3D (three.js + cannon-es).
 *  Ilha low-poly com casas (abrigo + telhado com escada), morro em degraus com rampa, torres que
 *  desabam em blocos, caixas; mesmas regras de cenário do 2D (scenarios.ts): terremoto, enchente,
 *  tsunami, tornado, chuva de meteoros, vulcão, nevasca (avalanche) e tempestade de raios.
 *
 *  Física do Bloop: controlador próprio contra caixas (AABB) estáticas e as caixas atuais dos corpos
 *  do cannon — eixo por eixo, subpassos de 1/120 s, chão com tolerância, degrau automático, coyote,
 *  buffer de pulo, altura variável, escadas, rampas e plataformas de mão única. Os escombros são
 *  corpos do cannon (com orçamento por nível de qualidade).
 * ============================================================ */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { t } from '../../../i18n';
import { save } from '../../../core/storage';
import { addCoins } from '../../../core/economy';
import { audio } from '../../../core/audio';
import { tap, success } from '../../../core/haptics';
import { QualityGovernor, type QualitySettings, type Tier } from '../../../core/quality';
import { reportRun, type MiniGameHandle } from '../../../hub/registry';
import { SKINS } from '../../../game/skins';
import { bindButton, createJoystick, createLook, isSolo, type BoundButton, type Joystick, type LookDrag } from '../../../ui/touch';
import { bigMoment, clearNotify, notify, objective, resetNotifyTop, setNotifyTop } from '../../../ui/notify';
import { icon } from '../../../ui/icons';
import { DISASTERS, scenarioName, scenarios, mulberry, type DisasterId, type Scenario } from '../scenarios';
import { dzIcon } from '../icons';

/* ------------------------------ constantes ------------------------------ */

const ISLAND_R = 34;
const GRAV = 24;
const JUMP_V = 8.4; // ~1,45 m de pulo
const RUN = 5.6;
const CLIMB = 3.4;
const COYOTE = 0.1;
const JUMP_BUFFER = 0.12;
const MIN_HOLD = 0.09;
const PR = 0.34; // meia-largura do Bloop (colisão)
const PH = 1.1; // altura do Bloop (colisão)
const STEP = 1 / 120;
const MAX_FRAME = 0.1;
const MAX_SUB = 12;
const BODY_BUDGET = [26, 44, 70, 110];
const LS_KEY = 'bo-disaster3d';
const BOT_NAMES = ['Pipoca', 'Jujuba', 'Tico', 'Nina', 'Biscoito', 'Lulu', 'Zeca', 'Mimi', 'Tuca', 'Fofura'];

type Phase = 'intro' | 'prepare' | 'warn' | 'disaster' | 'end';
type FluidKind = 'water' | 'lava' | 'goo' | 'snow';

interface Box {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  /** só colide caindo por cima */
  oneWay?: boolean;
}
interface Ramp {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** altura em x0 e em x1 */
  h0: number;
  h1: number;
}
interface House {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  /** interior (abrigo do tornado) */
  inner: Box;
  ladder: Box;
  /** de que lado (x) fica a escada: -1 / 1 */
  side: number;
}
interface Ctl {
  mx: number;
  mz: number;
  /** apertou pular (borda) */
  tap: boolean;
  /** segurando pular */
  j: boolean;
}
interface Bot {
  tx: number;
  tz: number;
  /** alvo exige subir (telhado/morro) */
  high: boolean;
  house: number;
  think: number;
  lazy: number;
  skill: number;
  stuckT: number;
  stuck: number;
  sx: number;
  sz: number;
}
interface P3 {
  name: string;
  self: boolean;
  bot: Bot | null;
  pos: THREE.Vector3; // pés
  vel: THREE.Vector3;
  onGround: boolean;
  wasGround: boolean;
  coyote: number;
  jbuf: number;
  jhold: number;
  jumpHeld: boolean;
  climbing: boolean;
  alive: boolean;
  outT: number;
  sq: number;
  face: number;
  ctl: Ctl;
  mesh: THREE.Group;
  bodyMesh: THREE.Mesh;
  bonk: number;
}
interface Strike {
  on: boolean;
  kind: 'meteor' | 'bolt' | 'bomb';
  x: number;
  z: number;
  y: number;
  t: number;
  T: number;
  r: number;
  ring: THREE.Mesh;
  rock: THREE.Mesh;
  sx: number;
  sy: number;
  sz: number;
}
interface Dyn {
  body: CANNON.Body;
  mesh: THREE.Mesh;
  heavy: boolean;
}

interface Progress {
  next: number;
  best: number;
  played: number;
}
function loadProgress(): Progress {
  try {
    const p = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    return { next: p.next | 0 || 1, best: p.best | 0, played: p.played | 0 };
  } catch {
    return { next: 1, best: 0, played: 0 };
  }
}
function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(p));
  } catch {
    /* */
  }
}

const CSS = `
.d3-root{position:fixed;inset:0;overflow:hidden;background:#0e1a33;touch-action:none;user-select:none;-webkit-user-select:none;font-family:'Fredoka',system-ui,sans-serif;color:#fff}
.d3-root canvas.d3-cv{position:absolute;inset:0;display:block;width:100%;height:100%}
.d3-hud{position:absolute;inset:0;pointer-events:none}
.d3-top{position:absolute;left:0;right:0;top:0;padding:max(8px,env(safe-area-inset-top)) var(--edge-r,10px) 0 var(--edge-l,10px);display:flex;align-items:flex-start;gap:8px}
.d3-btn{pointer-events:auto;border:0;cursor:pointer;font:inherit;color:#fff;background:rgba(30,15,70,.72);border:2px solid rgba(255,255,255,.25);border-radius:14px;display:flex;align-items:center;justify-content:center;width:44px;height:44px;flex:none;touch-action:none}
.d3-mid{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0}
.d3-scn{background:rgba(30,15,70,.72);border-radius:12px;padding:3px 10px;font-size:12px;font-weight:600;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.d3-phase{display:flex;align-items:center;gap:6px;background:linear-gradient(180deg,#ffb03a,#ff6a2e);border:2px solid #2a0b5c;border-radius:14px;padding:2px 12px;font-weight:700;font-size:15px;box-shadow:0 3px 0 #2a0b5c}
.d3-phase.calm{background:linear-gradient(180deg,#5ac8ff,#3f7cff)}
.d3-phase .ico{width:22px;height:22px}
.d3-phase b{font-size:18px;min-width:1.6em;text-align:right}
.d3-right{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.d3-chip{background:rgba(30,15,70,.72);border-radius:12px;padding:3px 8px;font-weight:700;font-size:14px;display:flex;align-items:center;gap:4px}
.d3-jump{position:absolute;right:calc(var(--edge-r,14px) + 6px);bottom:calc(max(var(--edge-b,14px),var(--safe-bot,0px)) + 14px);width:86px;height:86px;border-radius:50%;background:rgba(30,15,70,.5);border:3px solid rgba(255,255,255,.45);display:flex;align-items:center;justify-content:center;pointer-events:auto;touch-action:none}
.d3-jump.tc-pressed{background:rgba(255,176,58,.6);transform:scale(.94)}
.d3-jump .ico{width:40px;height:40px}
.d3-root.lefty .d3-jump{right:auto;left:calc(var(--edge-l,14px) + 6px)}
.d3-warn{position:absolute;left:50%;top:calc(max(8px,env(safe-area-inset-top)) + 96px);transform:translate(-50%,-6px) scale(.9);display:flex;align-items:center;gap:10px;padding:5px 16px 5px 10px;border-radius:22px;background:rgba(160,20,40,.8);border:3px solid #2a0b5c;box-shadow:0 4px 0 #2a0b5c;opacity:0;transition:opacity .15s,transform .15s}
.d3-warn.on{opacity:1;transform:translate(-50%,0) scale(1)}
.d3-warn .di .ico{width:50px;height:50px}
.d3-warn b{font-size:42px;line-height:1;color:#ffe14d;-webkit-text-stroke:2px #2a0b5c;min-width:.7em;text-align:center}
.d3-warn .safe .ico{width:32px;height:32px}
.d3-dir{position:absolute;left:50%;top:50%;width:0;height:0;opacity:0;transition:opacity .15s}
.d3-dir.on{opacity:1}
.d3-dir .ar{position:absolute;left:-26px;top:-26px;filter:drop-shadow(0 3px 0 #2a0b5c) hue-rotate(-125deg) saturate(1.6)}
.d3-dir .ar .ico{width:52px;height:52px}
.d3-out{position:absolute;left:50%;bottom:calc(max(var(--edge-b,14px),var(--safe-bot,0px)) + 120px);transform:translateX(-50%);opacity:0;transition:opacity .2s}
.d3-out.on{opacity:.9}.d3-out .ico{width:54px;height:54px}
.d3-modal{position:absolute;inset:0;background:rgba(10,8,30,.6);display:flex;align-items:center;justify-content:center;pointer-events:auto}
.d3-panel{background:linear-gradient(180deg,#2c3f7a,#1a2350);border:3px solid #2a0b5c;border-radius:22px;box-shadow:0 6px 0 #2a0b5c;padding:16px;width:min(88vw,340px);text-align:center;display:flex;flex-direction:column;gap:8px}
.d3-big{font:inherit;font-weight:700;font-size:17px;border:3px solid #2a0b5c;border-radius:16px;padding:10px;cursor:pointer;color:#2a0b5c;background:linear-gradient(180deg,#ffe680,#ffb03a);box-shadow:0 4px 0 #2a0b5c;display:flex;align-items:center;justify-content:center;gap:6px}
.d3-big.alt{background:linear-gradient(180deg,#d8e4ff,#9fb3e8)}
@media (orientation:landscape) and (max-height:500px){.d3-jump{width:72px;height:72px}.d3-warn{top:calc(max(6px,env(safe-area-inset-top)) + 82px);padding:3px 12px 3px 8px}.d3-warn .di .ico{width:40px;height:40px}.d3-warn b{font-size:32px}}
`;
let cssDone = false;

/* ------------------------------ jogo ------------------------------ */

export class Disaster3D implements MiniGameHandle {
  root: HTMLElement;
  exitCb: () => void;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);
  private sun: THREE.DirectionalLight;
  private world = new CANNON.World({ gravity: new CANNON.Vec3(0, -GRAV, 0) });
  private gov: QualityGovernor;
  private q: QualitySettings;
  private tier: Tier;
  private level = new THREE.Group();
  private statics: Box[] = [];
  private ramps: Ramp[] = [];
  private houses: House[] = [];
  private dyn: Dyn[] = [];
  private dynBoxes: Box[] = [];
  private openSpots: { x: number; z: number }[] = [];
  private highSpots: { x: number; z: number; y: number; house: number }[] = [];
  players: P3[] = [];
  me!: P3;
  sc!: Scenario;
  phase: Phase = 'intro';
  phaseT = 0;
  phaseDur = 2;
  dIndex = 0;
  roundT = 0;
  time = 0;
  progress = loadProgress();
  streak = 0;
  sessionRounds = 0;
  sessionCoins = 0;
  private rng = mulberry(1);
  // desastres
  private active = new Set<DisasterId>();
  private fluid: { kind: FluidKind; level: number; target: number; rate: number; front: number; dir: number; speed: number } | null = null;
  private fluidMesh: THREE.Mesh;
  private fluidMat: THREE.MeshStandardMaterial;
  private sea: THREE.Mesh;
  private quake = 0;
  private wind = 0;
  private windDir = 1;
  private tornado = { on: false, x: 0, z: 0, vx: 0, vz: 0, r: 2.6, side: 0 };
  private tornadoMesh: THREE.Group;
  private strikes: Strike[] = [];
  private strikeTimer = 0;
  private craters: THREE.Mesh[] = [];
  private craterHead = 0;
  private puffs: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
  private puffHead = 0;
  private snow: THREE.Points | null = null;
  private bolt: THREE.Line;
  private boltT = 0;
  private shake = 0;
  private volcano: THREE.Mesh;
  // câmera
  private yaw = Math.PI;
  private pitch = 0.32;
  private fp = false;
  private camPos = new THREE.Vector3(0, 6, -10);
  // entrada
  private joy: Joystick;
  private look: LookDrag;
  private jumpBtn: BoundButton;
  private jumpTap = false;
  private jumpHeld = false;
  private keys = new Set<string>();
  // laço
  private raf = 0;
  private last = 0;
  private acc = 0;
  private beat = 0;
  private paused = false;
  private destroyed = false;
  loopErrors = 0;
  private errBurst = 0;
  private errBurstT = 0;
  private offs: (() => void)[] = [];
  // HUD
  private hud: HTMLElement;
  private phaseEl: HTMLElement;
  private phaseNum: HTMLElement;
  private aliveEl: HTMLElement;
  private warnEl: HTMLElement;
  private warnNum: HTMLElement;
  private dirEl: HTMLElement;
  private outEl: HTMLElement;
  private lastN = -1;
  private warnKey = '';
  private lastAlive = '';
  private tmpV = new THREE.Vector3();
  private sharedGeo = {
    box: new THREE.BoxGeometry(1, 1, 1),
    sphere: new THREE.SphereGeometry(1, 14, 10),
    puff: new THREE.IcosahedronGeometry(1, 0),
  };

  constructor(root: HTMLElement, exit: () => void) {
    this.root = root;
    this.exitCb = exit;
    if (!cssDone) {
      cssDone = true;
      const st = document.createElement('style');
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    root.classList.add('d3-root');
    this.gov = new QualityGovernor({ persist: false, emit: false, onChange: (tier, s) => this.applyQuality(tier, s) });
    this.tier = this.gov.tier;
    this.q = this.gov.settings;
    this.renderer = new THREE.WebGLRenderer({ antialias: this.tier >= 2, powerPreference: 'high-performance' });
    this.renderer.domElement.className = 'd3-cv';
    this.renderer.shadowMap.enabled = this.tier >= 2;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    root.appendChild(this.renderer.domElement);
    const lost = (e: Event) => e.preventDefault();
    this.renderer.domElement.addEventListener('webglcontextlost', lost);

    // luz e céu
    this.scene.add(new THREE.HemisphereLight(0xdff0ff, 0x6a5a40, 1.1));
    this.sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
    this.sun.position.set(20, 40, 14);
    this.sun.castShadow = this.tier >= 2;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -40;
    sc.right = sc.top = 40;
    sc.far = 120;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(this.level);

    // fluido / mar
    this.fluidMat = new THREE.MeshStandardMaterial({ color: 0x3aa0ff, transparent: true, opacity: 0.78, roughness: 0.3 });
    this.fluidMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.fluidMat);
    this.fluidMesh.visible = false;
    this.scene.add(this.fluidMesh);
    this.sea = new THREE.Mesh(new THREE.CircleGeometry(220, 40), new THREE.MeshStandardMaterial({ color: 0x2a86d6, roughness: 0.4 }));
    this.sea.rotation.x = -Math.PI / 2;
    this.sea.position.y = -0.6;
    this.scene.add(this.sea);
    // vulcão (visual)
    this.volcano = new THREE.Mesh(new THREE.ConeGeometry(9, 14, 9, 1, true), new THREE.MeshStandardMaterial({ color: 0x6b5a5a, flatShading: true, side: THREE.DoubleSide }));
    this.volcano.position.set(ISLAND_R + 10, 6.5, 0);
    this.scene.add(this.volcano);
    // tornado
    this.tornadoMesh = new THREE.Group();
    const tm = new THREE.MeshStandardMaterial({ color: 0x9aa3b8, transparent: true, opacity: 0.55, flatShading: true, side: THREE.DoubleSide, depthWrite: false });
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(1.2 + i * 0.9, 0.6 + i * 0.9, 3.4, 9, 1, true), tm);
      c.position.y = 1.7 + i * 3.2;
      this.tornadoMesh.add(c);
    }
    this.tornadoMesh.visible = false;
    this.scene.add(this.tornadoMesh);
    // raio
    this.bolt = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 9 }, () => new THREE.Vector3())), new THREE.LineBasicMaterial({ color: 0xfff6a0 }));
    this.bolt.visible = false;
    this.scene.add(this.bolt);
    // golpes (meteoros/raios/bombas): marcador no chão + pedra
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff3355, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });
    const rockMat = new THREE.MeshStandardMaterial({ color: 0xff7a2e, emissive: 0xff4a10, emissiveIntensity: 0.8, flatShading: true });
    for (let i = 0; i < 18; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 28), ringMat.clone());
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 0), rockMat);
      rock.visible = false;
      this.scene.add(ring, rock);
      this.strikes.push({ on: false, kind: 'meteor', x: 0, z: 0, y: 0, t: 0, T: 1, r: 2, ring, rock, sx: 0, sy: 0, sz: 0 });
    }
    const crMat = new THREE.MeshBasicMaterial({ color: 0x2a2018, transparent: true, opacity: 0.55, depthWrite: false });
    for (let i = 0; i < 20; i++) {
      const c = new THREE.Mesh(new THREE.CircleGeometry(1, 16), crMat);
      c.rotation.x = -Math.PI / 2;
      c.visible = false;
      this.scene.add(c);
      this.craters.push(c);
    }
    const pm = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, flatShading: true, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(this.sharedGeo.puff, pm);
      m.visible = false;
      this.scene.add(m);
      this.puffs.push({ m, v: new THREE.Vector3(), life: 0 });
    }

    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;
    (this.world.solver as CANNON.GSSolver).iterations = 8;
    this.world.defaultContactMaterial.friction = 0.5;
    this.world.defaultContactMaterial.restitution = 0.05;

    // HUD + controles compartilhados (src/ui/touch)
    this.hud = document.createElement('div');
    this.hud.className = 'd3-hud';
    this.hud.innerHTML = `
      <div class="d3-top">
        <button class="d3-btn home" aria-label="${t('dz.exit', 'Sair')}">${icon('home', { size: 26 })}</button>
        <div class="d3-mid"><div class="d3-scn"></div><div class="d3-phase"><span class="pi"></span><b></b></div></div>
        <div class="d3-right"><div class="d3-chip">${icon('user', { size: 18 })}<span class="al"></span></div><button class="d3-btn cam" aria-label="${t('dz3.view', 'Trocar câmera')}">${icon('camera', { size: 24 })}</button></div>
      </div>
      <div class="d3-warn" aria-hidden="true"><span class="di"></span><b></b><span class="safe"></span></div>
      <div class="d3-dir" aria-hidden="true"><div class="ar">${icon('arrow-up')}</div></div>
      <div class="d3-out" aria-hidden="true">${dzIcon('ghost', 54)}</div>
      <div class="d3-jump" data-touch-ignore>${icon('arrow-up')}</div>`;
    root.appendChild(this.hud);
    this.phaseEl = this.hud.querySelector('.d3-phase')!;
    this.phaseNum = this.hud.querySelector('.d3-phase b')!;
    this.aliveEl = this.hud.querySelector('.al')!;
    this.warnEl = this.hud.querySelector('.d3-warn')!;
    this.warnNum = this.hud.querySelector('.d3-warn b')!;
    this.dirEl = this.hud.querySelector('.d3-dir')!;
    this.outEl = this.hud.querySelector('.d3-out')!;
    this.joy = createJoystick(root, { zoneTop: 0.2, deadZone: 0.15, mouse: false });
    this.look = createLook(root, { mouse: true });
    const jb = this.hud.querySelector('.d3-jump') as HTMLElement;
    this.jumpBtn = bindButton(jb, {
      onPress: () => {
        audio.unlock();
        this.jumpTap = true;
        this.jumpHeld = true;
      },
      onRelease: () => {
        this.jumpHeld = false;
      },
    });
    const home = this.hud.querySelector('.home') as HTMLElement;
    home.addEventListener('click', () => {
      audio.click();
      this.summary();
    });
    this.hud.querySelector('.cam')!.addEventListener('click', () => {
      audio.click();
      this.fp = !this.fp;
    });
    const kd = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) this.jumpTap = true;
      this.keys.add(e.code);
    };
    const ku = (e: KeyboardEvent) => this.keys.delete(e.code);
    const rel = () => this.releaseInput();
    const vis = () => document.hidden && rel();
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', rel);
    document.addEventListener('visibilitychange', vis);
    const rs = () => this.resize();
    window.addEventListener('resize', rs);
    this.offs.push(() => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('blur', rel);
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('resize', rs);
      this.renderer.domElement.removeEventListener('webglcontextlost', lost);
    });
    requestAnimationFrame(() => {
      const top = this.hud.querySelector('.d3-top') as HTMLElement | null;
      if (top?.isConnected) setNotifyTop(top.getBoundingClientRect().bottom + 6);
    });
    this.resize();
    this.startRound();
    this.last = performance.now();
    this.beat = this.last;
    this.raf = requestAnimationFrame(this.loop);
    const wd = window.setInterval(this.watchdog, 1000);
    this.offs.push(() => clearInterval(wd));
    if (/[?&]debug/.test(location.search)) (window as unknown as { __dz3?: Disaster3D }).__dz3 = this;
  }

  /* ------------------------------ qualidade ------------------------------ */

  private applyQuality(tier: Tier, s: QualitySettings): void {
    this.tier = tier;
    this.q = s;
    this.renderer.shadowMap.enabled = tier >= 2;
    this.sun.castShadow = tier >= 2;
    this.resize();
  }

  private resize(): void {
    const w = this.root.clientWidth || window.innerWidth;
    const h = this.root.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.q.dprCap));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.fov = w < h ? 74 : 60;
    this.camera.updateProjectionMatrix();
  }

  private releaseInput(): void {
    this.keys.clear();
    this.jumpTap = false;
    this.jumpHeld = false;
    this.jumpBtn.release();
    this.joy.reset();
  }

  /* ------------------------------ cenário ------------------------------ */

  private clearLevel(): void {
    for (const d of this.dyn) this.world.removeBody(d.body);
    for (const b of [...this.world.bodies]) this.world.removeBody(b);
    this.dyn = [];
    this.level.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (m.geometry !== this.sharedGeo.box && m.geometry !== this.sharedGeo.sphere) m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
    this.level.clear();
    this.statics = [];
    this.ramps = [];
    this.houses = [];
    this.openSpots = [];
    this.highSpots = [];
  }

  /** peças estáticas a fundir num só desenho (1 draw call para casas, escadas, morro, troncos) */
  private batch: THREE.BufferGeometry[] = [];
  private batchBox(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: string | number, rotZ = 0): void {
    const g = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed();
    if (rotZ) g.rotateZ(rotZ);
    g.translate(cx, cy, cz);
    const col = new THREE.Color(color);
    const n = g.getAttribute('position').count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = col.r;
      arr[i * 3 + 1] = col.g;
      arr[i * 3 + 2] = col.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    g.deleteAttribute('uv');
    this.batch.push(g);
  }
  private flushBatch(): void {
    if (!this.batch.length) return;
    const merged = mergeGeometries(this.batch, false);
    for (const g of this.batch) g.dispose();
    this.batch = [];
    if (!merged) return;
    const m = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 }));
    m.castShadow = m.receiveShadow = true;
    this.level.add(m);
  }

  private mat(c: string | number, flat = true): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color: c, flatShading: flat, roughness: 0.85 });
  }

  /** caixa estática: visual + colisão do Bloop + corpo estático do cannon */
  private solid(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: string | number, oneWay = false, visible = true): void {
    this.statics.push({ x0, y0, z0, x1, y1, z1, oneWay });
    if (visible) this.batchBox((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, color);
    if (!oneWay) {
      const b = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2)) });
      b.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      this.world.addBody(b);
    }
  }

  private addDyn(x: number, y: number, z: number, hx: number, hy: number, hz: number, color: string | number, heavy: boolean): Dyn | null {
    if (this.dyn.length >= BODY_BUDGET[this.tier]) return null;
    const body = new CANNON.Body({ mass: heavy ? 6 * hx * hy * hz * 8 : 1.2, shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)) });
    body.position.set(x, y, z);
    body.allowSleep = true;
    body.sleepSpeedLimit = 0.3;
    body.sleepTimeLimit = 0.6;
    body.linearDamping = 0.05;
    body.angularDamping = 0.2;
    this.world.addBody(body);
    body.sleep();
    const mesh = new THREE.Mesh(this.sharedGeo.box, this.mat(color));
    mesh.scale.set(hx * 2, hy * 2, hz * 2);
    mesh.castShadow = this.tier >= 2;
    mesh.receiveShadow = true;
    this.level.add(mesh);
    const d = { body, mesh, heavy };
    this.dyn.push(d);
    return d;
  }

  private build(): void {
    this.clearLevel();
    const sc = this.sc;
    const m = sc.map;
    const r = mulberry(sc.seed * 7 + 3);
    this.scene.background = new THREE.Color(m.sky[1]);
    this.scene.fog = new THREE.Fog(new THREE.Color(m.sky[2]).getHex(), 50, 170);
    // chão da ilha (colisão: caixa grande; visual: cilindro)
    const ground = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND_R, ISLAND_R + 3, 3, 40), this.mat(m.groundTop));
    ground.position.y = -1.5;
    ground.receiveShadow = true;
    this.level.add(ground);
    this.statics.push({ x0: -ISLAND_R, y0: -6, z0: -ISLAND_R, x1: ISLAND_R, y1: 0, z1: ISLAND_R });
    const gp = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    gp.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(gp);
    // casas: anel ao redor do centro
    const nH = 5 + Math.min(2, Math.floor(sc.difficulty / 2));
    for (let i = 0; i < nH; i++) {
      const a = (i / nH) * Math.PI * 2 + r() * 0.3;
      const rad = 15 + r() * 8;
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      const w = 5 + Math.floor(r() * 2);
      const d = 5;
      const h = 3.2 + (r() < 0.3 ? 1 : 0);
      const wall = m.wall[Math.floor(r() * m.wall.length)];
      const roof = m.roof[Math.floor(r() * m.roof.length)];
      const x0 = x - w / 2;
      const x1 = x + w / 2;
      const z0 = z - d / 2;
      const z1 = z + d / 2;
      const th = 0.35;
      // paredes (porta larga no lado -z ... sempre virada para o centro? simples: porta no z0)
      this.solid(x0, 0, z1 - th, x1, h, z1, wall); // fundo
      this.solid(x0, 0, z0, x0 + th, h, z1, wall);
      this.solid(x1 - th, 0, z0, x1, h, z1, wall);
      const door = 1.8;
      this.solid(x0, 0, z0, x - door / 2, h, z0 + th, wall);
      this.solid(x + door / 2, 0, z0, x1, h, z0 + th, wall);
      this.solid(x - door / 2, 2.2, z0, x + door / 2, h, z0 + th, wall);
      // telhado plano com mureta (lugar alto seguro)
      this.solid(x0 - 0.2, h, z0 - 0.2, x1 + 0.2, h + 0.35, z1 + 0.2, roof);
      // escada do lado
      const side = r() < 0.5 ? -1 : 1;
      const lx = side < 0 ? x0 - 0.15 : x1 + 0.15;
      this.batchBox(lx, (h + 0.4) / 2, z - 0.5, 0.2, h + 0.4, 0.1, '#c98a4a');
      this.batchBox(lx, (h + 0.4) / 2, z + 0.5, 0.2, h + 0.4, 0.1, '#c98a4a');
      for (let k = 0; k < Math.floor(h / 0.5); k++) this.batchBox(lx + side * 0.06, 0.4 + k * 0.5, z, 0.14, 0.09, 1.0, '#8a5a2a');
      const ladder: Box = side < 0 ? { x0: x0 - 1.0, y0: -0.1, z0: z - 0.9, x1: x0 + 0.05, y1: h + 0.4, z1: z + 0.9 } : { x0: x1 - 0.05, y0: -0.1, z0: z - 0.9, x1: x1 + 1.0, y1: h + 0.4, z1: z + 0.9 };
      const inner: Box = { x0: x0 + th, y0: 0, z0: z0 + th, x1: x1 - th, y1: h, z1: z1 - th };
      this.houses.push({ x, z, w, d, h, inner, ladder, side });
      this.highSpots.push({ x, z, y: h + 0.35, house: this.houses.length - 1 });
      // caixas leves ao lado
      if (r() < 0.6) this.addDyn(x1 + 1.2, 0.45, z0 + 0.8, 0.45, 0.45, 0.45, '#c98a4a', false);
    }
    // morro em degraus + rampa (lugar alto sem escada)
    const hx = -4 + r() * 8;
    const hz = -4 + r() * 8;
    const steps = [0.9, 1.8, 2.7];
    steps.forEach((y, i) => {
      const s = 4.5 - i * 1.2;
      this.solid(hx - s, 0, hz - s, hx + s, y, hz + s, i === 2 ? m.groundTop : m.ground);
    });
    this.highSpots.push({ x: hx, z: hz, y: 2.7, house: -1 });
    // rampa até o 1º degrau (encosta)
    const ramp: Ramp = { x0: hx + 4.5, x1: hx + 8, z0: hz - 1.2, z1: hz + 1.2, h0: 0.9, h1: 0 };
    this.ramps.push(ramp);
    const len = Math.hypot(ramp.x1 - ramp.x0, ramp.h0);
    this.batchBox((ramp.x0 + ramp.x1) / 2, ramp.h0 / 2 - 0.1, hz, len, 0.2, 2.4, m.ground, -Math.atan2(ramp.h0, ramp.x1 - ramp.x0));
    // plataforma de mão única por cima do morro
    this.solid(hx - 1.5, 4.0, hz + 5.2, hx + 1.5, 4.2, hz + 6.4, '#b8864f', true);
    this.solid(hx - 0.2, 0, hz + 5.6, hx + 0.2, 4.0, hz + 6.0, '#8a5a2a', false, true);
    // torres de blocos (desabam no terremoto/tornado)
    const nT = 2 + Math.min(3, m.towers);
    for (let i = 0; i < nT; i++) {
      const a = r() * Math.PI * 2;
      const rad = 8 + r() * 22;
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      if (this.houses.some((h) => Math.abs(h.x - x) < 5 && Math.abs(h.z - z) < 5) || Math.hypot(x - hx, z - hz) < 7) continue;
      const col = m.wall[i % m.wall.length];
      for (let k = 0; k < 4; k++) this.addDyn(x, 0.6 + k * 1.2, z, 0.75, 0.6, 0.75, k % 2 ? col : '#d9dde8', true);
    }
    // árvores (tronco estático)
    for (let i = 0; i < Math.min(9, 2 + m.trees); i++) {
      const a = r() * Math.PI * 2;
      const rad = 6 + r() * 25;
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      if (this.houses.some((h) => Math.abs(h.x - x) < 4.5 && Math.abs(h.z - z) < 4.5) || Math.hypot(x - hx, z - hz) < 6) continue;
      this.solid(x - 0.25, 0, z - 0.25, x + 0.25, 2.2, z + 0.25, m.trunk);
      this.batchBox(x, 3, z, 2.2, 1.8, 2.2, m.leaf);
      this.batchBox(x, 3.9, z, 1.4, 0.8, 1.4, m.leaf);
    }
    // lugares abertos (longe de casas e torres)
    for (let i = 0; i < 40 && this.openSpots.length < 8; i++) {
      const a = r() * Math.PI * 2;
      const rad = 4 + r() * 24;
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      if (this.houses.some((h) => Math.abs(h.x - x) < 6 && Math.abs(h.z - z) < 6)) continue;
      if (this.dyn.some((d) => Math.hypot(d.body.position.x - x, d.body.position.z - z) < 6)) continue;
      if (Math.hypot(x - hx, z - hz) < 7) continue;
      this.openSpots.push({ x, z });
    }
    if (!this.openSpots.length) this.openSpots.push({ x: 0, z: -12 });
    this.flushBatch();
    this.volcano.visible = m.id === 'ilha' || sc.disasters.includes('vulcao');
  }

  /* ------------------------------ jogadores ------------------------------ */

  private makeBloop(color: string, self: boolean): { g: THREE.Group; body: THREE.Mesh } {
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.sharedGeo.sphere, new THREE.MeshStandardMaterial({ color, roughness: 0.5, transparent: true }));
    body.scale.set(0.5, 0.55, 0.5);
    body.position.y = 0.55;
    body.castShadow = true;
    g.add(body);
    const eyeM = new THREE.MeshBasicMaterial({ color: 0x1a1030 });
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(this.sharedGeo.sphere, eyeM);
      e.scale.set(0.07, 0.11, 0.05);
      e.position.set(s * 0.17, 0.08, 0.46);
      body.add(e);
    }
    if (self) {
      const mark = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 4), new THREE.MeshBasicMaterial({ color: 0xffe14d }));
      mark.rotation.x = Math.PI;
      mark.position.y = 1.55;
      g.add(mark);
    }
    this.scene.add(g);
    return { g, body };
  }

  private spawnPlayers(): void {
    for (const p of this.players) this.scene.remove(p.mesh);
    this.players = [];
    const n = isSolo('disaster') ? 1 : 6;
    const meSkin = SKINS.find((s) => s.id === save.skin) ?? SKINS[0];
    for (let i = 0; i < n; i++) {
      const self = i === 0;
      const skin = self ? meSkin : SKINS[(i * 5 + this.sessionRounds) % SKINS.length];
      const { g, body } = this.makeBloop(skin.light, self);
      const a = (i / n) * Math.PI * 2;
      const pos = new THREE.Vector3(Math.cos(a) * 3, 0, -10 + Math.sin(a) * 3);
      const p: P3 = {
        name: self ? t('dz.you', 'Você') : BOT_NAMES[(i + this.sessionRounds) % BOT_NAMES.length],
        self,
        bot: self ? null : { tx: pos.x, tz: pos.z, high: false, house: -1, think: Math.random(), lazy: Math.random(), skill: 0.4 + Math.random() * 0.55, stuckT: 0, stuck: 0, sx: 0, sz: 0 },
        pos,
        vel: new THREE.Vector3(),
        onGround: true,
        wasGround: true,
        coyote: 0,
        jbuf: 0,
        jhold: 0,
        jumpHeld: false,
        climbing: false,
        alive: true,
        outT: 0,
        sq: 0,
        face: 0,
        ctl: { mx: 0, mz: 0, tap: false, j: false },
        mesh: g,
        bodyMesh: body,
        bonk: 0,
      };
      this.players.push(p);
    }
    this.me = this.players[0];
    this.yaw = 0;
  }

  /* ------------------------------ rodada ------------------------------ */

  startRound(): void {
    const list = scenarios();
    this.sc = list[(this.progress.next - 1) % 100];
    this.rng = mulberry(this.sc.seed + this.sessionRounds * 13);
    this.active.clear();
    this.fluid = null;
    this.fluidMesh.visible = false;
    this.quake = 0;
    this.wind = 0;
    this.tornado.on = false;
    this.tornado.side = 0;
    this.tornadoMesh.visible = false;
    this.dIndex = 0;
    this.roundT = 0;
    for (const s of this.strikes) this.endStrike(s);
    for (const c of this.craters) c.visible = false;
    this.setSnow(false);
    this.build();
    this.spawnPlayers();
    (this.hud.querySelector('.d3-scn') as HTMLElement).textContent = `#${this.sc.n} · ${scenarioName(this.sc)}`;
    bigMoment(t('dz.round', 'Cenário {n}', { n: this.sc.n }), { sub: this.sc.map.name() + ' ' + '★'.repeat(this.sc.difficulty), ms: 1200 });
    this.setPhase('intro', 2);
  }

  private setPhase(p: Phase, dur: number): void {
    this.phase = p;
    this.phaseT = 0;
    this.phaseDur = dur;
    this.lastN = -1;
    this.phaseEl.classList.toggle('calm', p === 'intro' || p === 'prepare' || p === 'end');
    const d = this.sc.disasters[Math.min(this.dIndex, this.sc.disasters.length - 1)];
    (this.phaseEl.querySelector('.pi') as HTMLElement).innerHTML = p === 'end' ? icon('trophy', { size: 22 }) : p === 'intro' || p === 'prepare' ? icon('clock', { size: 22 }) : dzIcon(d, 22);
    if (p === 'prepare') {
      notify(DISASTERS[d].hint(), { kind: 'warn', key: 'dz-hint', ms: 3200 });
      objective(DISASTERS[d].hint(), { icon: 'warning' });
      for (const pl of this.players) if (pl.bot) this.plan(pl, d);
    } else if (p === 'end' || p === 'intro') objective(null);
  }

  private nextPhase(): void {
    switch (this.phase) {
      case 'intro':
        this.setPhase('prepare', 14 + (this.progress.played < 2 ? 6 : 0));
        break;
      case 'prepare':
        this.setPhase('warn', 3);
        this.warnStart();
        break;
      case 'warn':
        this.beginDisaster(this.sc.disasters[this.dIndex]);
        this.setPhase('disaster', (this.sc.disasters.length > 1 ? 26 : 40) + this.sc.difficulty * 2);
        break;
      case 'disaster':
        if (this.dIndex + 1 < this.sc.disasters.length) {
          this.dIndex++;
          this.endDisasters(false);
          for (const pl of this.players) if (pl.bot && pl.alive) this.plan(pl, this.sc.disasters[this.dIndex]);
          this.setPhase('warn', 3);
          this.warnStart();
        } else this.endRound();
        break;
      case 'end':
        this.progress.next = (this.progress.next % 100) + 1;
        saveProgress(this.progress);
        this.startRound();
        break;
    }
  }

  private warnStart(): void {
    const d = this.sc.disasters[this.dIndex];
    bigMoment(DISASTERS[d].name() + '!', { icon: 'warning', color: 'linear-gradient(90deg,#ff5a3c,#c8193c)', ms: 1200 });
    audio.siren(2.5);
    tap('heavy');
  }

  private endDisasters(all: boolean): void {
    // entre desastres de um cenário duplo: o fluido baixa, golpes param
    if (all || (this.fluid && this.fluid.dir === 0)) {
      if (this.fluid) this.fluid.target = all ? 0 : Math.min(this.fluid.level, 0.5);
    }
    this.quake = 0;
    this.tornado.on = false;
    this.tornadoMesh.visible = false;
    this.wind = 0;
    this.active.clear();
  }

  private endRound(): void {
    const me = this.me;
    const survived = me.alive;
    const alive = this.players.filter((p) => p.alive).length;
    this.sessionRounds++;
    this.progress.played++;
    let coins: number;
    if (survived) {
      this.streak++;
      if (this.streak > this.progress.best) this.progress.best = this.streak;
      coins = 70 + this.sc.difficulty * 15 + Math.min(10, this.streak - 1) * 6;
      audio.cash();
      success();
      bigMoment(t('dz.survived', 'Sobreviveu!'), { icon: 'trophy', sub: '+' + coins, ms: 1300 });
    } else {
      this.streak = 0;
      coins = 8 + Math.round(Math.min(60, me.outT) * 0.6);
      bigMoment(t('dz.lost', 'Quase!'), { color: 'linear-gradient(90deg,#5b6bb0,#2c3f7a)', ms: 1100 });
    }
    addCoins(coins);
    this.sessionCoins += coins;
    saveProgress(this.progress);
    reportRun({ game: 'disaster', score: this.streak, coins, durationSec: Math.round(this.roundT), won: survived, place: survived ? 1 : alive + 1, stats: { scenario: this.sc.n, streak: this.streak, difficulty: this.sc.difficulty, mode: 3 } });
    this.endDisasters(true);
    this.setPhase('end', 4);
  }

  /* ------------------------------ desastres ------------------------------ */

  hazardFrom(d: DisasterId): number {
    // ângulo (rad, no mundo) de onde o desastre vem; NaN = de cima/de todo lado
    if (d === 'tsunami') return Math.PI; // vem de -x
    if (d === 'avalanche') return NaN;
    if (d === 'vulcao') return 0; // vulcão em +x
    if (d === 'tornado') {
      if (!this.tornado.side) this.tornado.side = this.rng() < 0.5 ? -1 : 1;
      return this.tornado.side < 0 ? -Math.PI / 2 : Math.PI / 2;
    }
    return NaN;
  }

  private beginDisaster(d: DisasterId): void {
    this.active.add(d);
    const df = this.sc.difficulty;
    const duo = this.sc.disasters.length > 1 ? 0.85 : 1;
    const fl = (kind: FluidKind, target: number, rate: number, dir = 0, speed = 0) => {
      const level = this.fluid && this.fluid.kind === kind ? this.fluid.level : 0;
      this.fluid = { kind, level, target: target * duo, rate, front: dir ? -ISLAND_R - 8 : 0, dir, speed };
      const c = kind === 'water' ? 0x3aa0ff : kind === 'lava' ? 0xff6a1e : kind === 'goo' ? 0x7be04a : 0xf4f8ff;
      this.fluidMat.color.setHex(c);
      this.fluidMat.emissive.setHex(kind === 'lava' ? 0xff3a00 : 0x000000);
      this.fluidMat.emissiveIntensity = kind === 'lava' ? 0.6 : 0;
      this.fluidMat.opacity = kind === 'snow' || kind === 'lava' ? 1 : 0.78;
      this.fluidMesh.visible = true;
    };
    switch (d) {
      case 'enchente':
        fl('water', Math.min(2.5, 1.6 + df * 0.2), 0.08);
        break;
      case 'acido':
        fl('goo', Math.min(2.5, 1.5 + df * 0.2), 0.07);
        break;
      case 'tsunami':
        fl('water', Math.min(2.6, 1.9 + df * 0.15), 0.6, 1, 4.5 + df * 0.5);
        break;
      case 'vulcao':
        fl('lava', Math.min(1.6, 0.9 + df * 0.12), 0.05);
        this.strikeTimer = 2;
        break;
      case 'avalanche':
        fl('snow', Math.min(2.2, 1.3 + df * 0.18), 0.06);
        this.setSnow(true);
        this.windDir = this.rng() < 0.5 ? -1 : 1;
        break;
      case 'terremoto':
        this.quake = 0.05;
        this.strikeTimer = 2;
        break;
      case 'tornado': {
        const side = this.tornado.side || (this.rng() < 0.5 ? -1 : 1);
        this.tornado.on = true;
        this.tornado.x = (this.rng() - 0.5) * 20;
        this.tornado.z = side * (ISLAND_R + 6);
        this.tornado.vx = (this.rng() - 0.5) * 2;
        this.tornado.vz = -side * (2.6 + df * 0.35);
        this.tornado.r = 2.4 + df * 0.15;
        this.tornadoMesh.visible = true;
        break;
      }
      case 'meteoros':
      case 'meteoro':
      case 'raios':
        this.strikeTimer = 1.2;
        break;
    }
  }

  private setSnow(on: boolean): void {
    if (!on) {
      if (this.snow) this.snow.visible = false;
      return;
    }
    if (!this.snow) {
      const n = [200, 400, 700, 1000][this.tier];
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 60;
        pos[i * 3 + 1] = Math.random() * 20;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 60;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.snow = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.18 }));
      this.scene.add(this.snow);
    }
    this.snow.visible = true;
  }

  private spawnStrike(kind: Strike['kind']): void {
    const s = this.strikes.find((x) => !x.on);
    if (!s) return;
    const alive = this.players.filter((p) => p.alive);
    let x: number;
    let z: number;
    if (kind === 'bolt') {
      // raio prefere o lugar mais alto perto de alguém (lição: fique no chão, longe do alto)
      const hi = alive.filter((p) => p.pos.y > 1.5);
      const p = hi.length && this.rng() < 0.6 ? hi[Math.floor(this.rng() * hi.length)] : alive[Math.floor(this.rng() * Math.max(1, alive.length))];
      x = (p ? p.pos.x : 0) + (this.rng() - 0.5) * 6;
      z = (p ? p.pos.z : 0) + (this.rng() - 0.5) * 6;
    } else if (alive.length && this.rng() < 0.45) {
      const p = alive[Math.floor(this.rng() * alive.length)];
      x = p.pos.x + (this.rng() - 0.5) * 7;
      z = p.pos.z + (this.rng() - 0.5) * 7;
    } else {
      const a = this.rng() * Math.PI * 2;
      const r = Math.sqrt(this.rng()) * (ISLAND_R - 2);
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
    }
    const df = this.sc.difficulty;
    s.on = true;
    s.kind = kind;
    s.x = x;
    s.z = z;
    s.y = this.topAt(x, z);
    s.r = kind === 'bolt' ? 1.6 : 2 + df * 0.12;
    s.T = s.t = kind === 'bolt' ? 1.5 : 2.1 - Math.min(0.5, df * 0.08);
    if (kind === 'bomb') {
      s.sx = ISLAND_R + 10;
      s.sy = 14;
      s.sz = 0;
    } else {
      s.sx = x - 14;
      s.sy = 30;
      s.sz = z - 6;
    }
    const ringM = s.ring.material as THREE.MeshBasicMaterial;
    ringM.color.setHex(kind === 'bolt' ? 0xffe14d : 0xff3355);
    s.ring.visible = true;
    s.ring.scale.setScalar(s.r);
    s.ring.position.set(x, s.y + 0.06, z);
    s.rock.visible = kind !== 'bolt';
  }

  private endStrike(s: Strike): void {
    s.on = false;
    s.ring.visible = false;
    s.rock.visible = false;
  }

  private impact(s: Strike): void {
    this.endStrike(s);
    const p = new THREE.Vector3(s.x, s.y, s.z);
    if (s.kind === 'bolt') {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < 9; i++) pts.push(new THREE.Vector3(s.x + (i && i < 8 ? (Math.random() - 0.5) * 1.6 : 0), s.y + 30 - i * (30 / 8), s.z + (i && i < 8 ? (Math.random() - 0.5) * 1.6 : 0)));
      this.bolt.geometry.setFromPoints(pts);
      this.bolt.visible = true;
      this.boltT = 0.18;
      audio.crack();
    } else {
      const c = this.craters[this.craterHead++ % this.craters.length];
      c.visible = true;
      c.scale.setScalar(s.r * 0.8);
      c.position.set(s.x, s.y + 0.03, s.z);
      this.puff(p, 8, 5);
      audio.hit();
      this.shake = Math.max(this.shake, 0.35);
    }
    // escombros voam
    for (const d of this.dyn) {
      const b = d.body;
      const dx = b.position.x - s.x;
      const dz = b.position.z - s.z;
      const dist = Math.hypot(dx, dz);
      if (dist < s.r * 2.2) {
        b.wakeUp();
        const k = (1 - dist / (s.r * 2.2)) * (d.heavy ? 40 : 8);
        b.applyImpulse(new CANNON.Vec3((dx / (dist || 1)) * k, k * 1.2, (dz / (dist || 1)) * k));
      }
    }
    // hitbox generosa: só cai quem está bem dentro do círculo (70% do raio desenhado)
    for (const pl of this.players) {
      if (!pl.alive) continue;
      const d = Math.hypot(pl.pos.x - s.x, pl.pos.z - s.z);
      if (d < s.r * 0.7 && Math.abs(pl.pos.y - s.y) < 2.2 && !this.insideHouse(pl) ) this.knockOut(pl);
      else if (d < s.r * 1.6) {
        pl.vel.x += ((pl.pos.x - s.x) / (d || 1)) * 4;
        pl.vel.z += ((pl.pos.z - s.z) / (d || 1)) * 4;
      }
    }
  }

  private puff(at: THREE.Vector3, n: number, sp: number): void {
    n = Math.max(1, Math.round(n * this.q.particleBudget));
    for (let i = 0; i < n; i++) {
      const p = this.puffs[this.puffHead++ % this.puffs.length];
      p.m.visible = true;
      p.m.position.copy(at);
      p.m.scale.setScalar(0.25 + Math.random() * 0.25);
      p.v.set((Math.random() - 0.5) * sp, Math.random() * sp * 0.8, (Math.random() - 0.5) * sp);
      p.life = 0.6 + Math.random() * 0.4;
    }
  }

  private updateDisasters(dt: number): void {
    const df = this.sc.difficulty;
    const f = this.fluid;
    if (f) {
      if (f.dir) {
        f.front += f.speed * dt;
        if (f.front > ISLAND_R + 10) {
          // a onda passou: a água baixa devagar
          f.target = Math.max(0, f.target - dt * 0.15);
        }
      }
      const tgt = f.target;
      f.level += Math.max(-0.4 * dt, Math.min(f.rate * dt * (f.dir ? 6 : 1), tgt - f.level));
      if (!Number.isFinite(f.level)) f.level = 0;
      const lv = Math.max(0.02, f.level);
      if (f.dir) {
        const x0 = -ISLAND_R - 40;
        const w = Math.max(0.1, f.front - x0);
        this.fluidMesh.scale.set(w, lv + 0.6, ISLAND_R * 2 + 30);
        this.fluidMesh.position.set(x0 + w / 2, (lv - 0.6) / 2, 0);
        // empurra corpos atrás da frente
        for (const d of this.dyn) {
          const b = d.body;
          if (b.position.x < f.front && b.position.x > f.front - 6 && b.position.y < lv + 0.5) {
            b.wakeUp();
            b.applyForce(new CANNON.Vec3(b.mass * 14, b.mass * 4, 0));
          }
        }
      } else {
        this.fluidMesh.scale.set(ISLAND_R * 2 + 6, lv + 0.6, ISLAND_R * 2 + 6);
        this.fluidMesh.position.set(0, (lv - 0.6) / 2, 0);
      }
      if (f.level <= 0.01 && f.target <= 0) {
        this.fluid = null;
        this.fluidMesh.visible = false;
      }
    }
    if (this.active.has('terremoto')) {
      this.quake = Math.min(1, this.quake + dt * 0.12);
      this.shake = Math.max(this.shake, this.quake * 0.25);
      for (const d of this.dyn) {
        if (Math.random() < dt * (1.5 + df * 0.3)) {
          d.body.wakeUp();
          const k = this.quake * (d.heavy ? 18 : 3);
          d.body.applyImpulse(new CANNON.Vec3((Math.random() - 0.5) * k, Math.random() * k * 0.3, (Math.random() - 0.5) * k));
        }
      }
      // pedaços caem dos telhados
      this.strikeTimer -= dt;
      if (this.strikeTimer <= 0 && this.houses.length) {
        this.strikeTimer = 1.8 - Math.min(0.9, df * 0.15);
        const h = this.houses[Math.floor(this.rng() * this.houses.length)];
        const ex = h.x + (this.rng() - 0.5) * (h.w + 2);
        const ez = h.z + (this.rng() < 0.5 ? -1 : 1) * (h.d / 2 + 0.6);
        const d = this.addDyn(ex, h.h + 1.4, ez, 0.35, 0.18, 0.35, this.sc.map.roof[0], false);
        d?.body.wakeUp();
      }
    }
    if (this.active.has('meteoros') || this.active.has('meteoro') || this.active.has('raios') || this.active.has('vulcao')) {
      this.strikeTimer -= dt;
      if (this.strikeTimer <= 0) {
        const bolt = this.active.has('raios') && (!this.active.has('meteoros') || this.rng() < 0.5);
        this.strikeTimer = (bolt ? 1.2 : 1.5) - Math.min(0.6, df * 0.08) + this.rng() * 0.5;
        this.spawnStrike(bolt ? 'bolt' : this.active.has('vulcao') && !this.active.has('meteoros') ? 'bomb' : 'meteor');
      }
    }
    if (this.active.has('avalanche')) {
      // nevasca: rajadas de vento (avisadas pelo balanço da neve)
      this.wind = Math.sin(this.time * 0.7) > 0.3 ? this.windDir * (1.6 + df * 0.25) : 0;
    }
    const tn = this.tornado;
    if (tn.on) {
      // segue para o outro lado, desviando um pouco na direção dos jogadores
      const tgt = this.players.find((p) => p.alive && !p.self) ?? this.me;
      tn.vx += Math.sign(tgt.pos.x - tn.x) * dt * 0.4;
      tn.vx = Math.max(-2.5, Math.min(2.5, tn.vx));
      tn.x += tn.vx * dt;
      tn.z += tn.vz * dt;
      if (Math.abs(tn.z) > ISLAND_R + 12) {
        tn.vz = -tn.vz;
        tn.z = Math.sign(tn.z) * (ISLAND_R + 12);
      }
      this.tornadoMesh.position.set(tn.x, 0, tn.z);
      this.tornadoMesh.rotation.y += dt * 6;
      for (const d of this.dyn) {
        const b = d.body;
        const dx = tn.x - b.position.x;
        const dz = tn.z - b.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 10) {
          b.wakeUp();
          const k = b.mass * (1 - dist / 10) * (d.heavy ? 14 : 30);
          b.applyForce(new CANNON.Vec3((dx / (dist || 1)) * k - (dz / (dist || 1)) * k, k * (b.position.y < 8 ? 0.9 : -0.2), (dz / (dist || 1)) * k + (dx / (dist || 1)) * k));
        }
      }
    }
    // golpes
    for (const s of this.strikes) {
      if (!s.on) continue;
      s.t -= dt;
      const k = 1 - Math.max(0, s.t) / s.T;
      const m = s.ring.material as THREE.MeshBasicMaterial;
      m.opacity = 0.45 + 0.4 * Math.abs(Math.sin(this.time * 10));
      if (s.kind !== 'bolt') {
        const arc = s.kind === 'bomb' ? Math.sin(k * Math.PI) * 10 : 0;
        s.rock.position.set(s.sx + (s.x - s.sx) * k, s.sy + (s.y - s.sy) * k + arc, s.sz + (s.z - s.sz) * k);
        s.rock.rotation.x += dt * 5;
      }
      if (s.t <= 0) this.impact(s);
    }
    if (this.boltT > 0) {
      this.boltT -= dt;
      if (this.boltT <= 0) this.bolt.visible = false;
    }
  }

  /* ------------------------------ física do Bloop ------------------------------ */

  /** chão mais alto em (x,z) abaixo de fromY (estáticos, rampas, corpos) */
  topAt(x: number, z: number, fromY = 1e9): number {
    let best = Math.abs(x) < ISLAND_R && Math.abs(z) < ISLAND_R && Math.hypot(x, z) < ISLAND_R ? 0 : -6;
    const all = [this.statics, this.dynBoxes];
    for (const arr of all)
      for (const b of arr) {
        if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
        if (b.y1 <= fromY + 0.01 && b.y1 > best) best = b.y1;
      }
    for (const r of this.ramps) {
      if (x < Math.min(r.x0, r.x1) || x > Math.max(r.x0, r.x1) || z < r.z0 || z > r.z1) continue;
      const h = r.h0 + ((x - r.x0) / (r.x1 - r.x0)) * (r.h1 - r.h0);
      if (h <= fromY + 0.01 && h > best) best = h;
    }
    return best;
  }

  /** fração (0..1) do segmento até a primeira caixa estática (1 = livre) */
  private rayBoxes(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): number {
    let best = 1;
    for (const b of this.statics) {
      if (b.oneWay || b.y1 <= 0.01) continue;
      let t0 = 0;
      let t1 = best;
      const o = [ox, oy, oz];
      const d = [dx, dy, dz];
      const lo = [b.x0 - 0.15, b.y0, b.z0 - 0.15];
      const hi = [b.x1 + 0.15, b.y1 + 0.15, b.z1 + 0.15];
      let ok = true;
      for (let a = 0; a < 3 && ok; a++) {
        if (Math.abs(d[a]) < 1e-6) {
          if (o[a] < lo[a] || o[a] > hi[a]) ok = false;
          continue;
        }
        let ta = (lo[a] - o[a]) / d[a];
        let tb = (hi[a] - o[a]) / d[a];
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta);
        t1 = Math.min(t1, tb);
        if (t0 > t1) ok = false;
      }
      if (ok && t0 > 0 && t0 < best) best = t0;
    }
    return best;
  }

  private insideHouse(p: P3): boolean {
    for (const h of this.houses) {
      const b = h.inner;
      if (p.pos.x > b.x0 && p.pos.x < b.x1 && p.pos.z > b.z0 && p.pos.z < b.z1 && p.pos.y < b.y1 - 0.5) return true;
    }
    return false;
  }

  private onLadder(p: P3): House | null {
    for (const h of this.houses) {
      const b = h.ladder;
      if (p.pos.x > b.x0 && p.pos.x < b.x1 && p.pos.z > b.z0 && p.pos.z < b.z1 && p.pos.y < b.y1 && p.pos.y > b.y0) return h;
    }
    return null;
  }

  private overlap(p: THREE.Vector3, b: Box): boolean {
    return p.x + PR > b.x0 && p.x - PR < b.x1 && p.z + PR > b.z0 && p.z - PR < b.z1 && p.y + PH > b.y0 && p.y < b.y1;
  }

  private movePlayer(p: P3, dt: number): void {
    const c = p.ctl;
    const frozen = this.phase === 'intro' && this.phaseT < 0.5;
    // pulo: borda (toque) ou borda do nível; coyote e buffer
    const pressed = !frozen && (c.tap || (c.j && !p.jumpHeld));
    c.tap = false;
    p.jumpHeld = c.j;
    p.wasGround = p.onGround;
    if (p.onGround) p.coyote = COYOTE;
    else p.coyote -= dt;
    if (pressed) p.jbuf = JUMP_BUFFER;
    else if (p.jbuf > 0) p.jbuf -= dt;
    if (p.jhold > 0) p.jhold -= dt;
    // horizontal: aceleração alta no chão, controle bom no ar
    const mx = frozen ? 0 : c.mx;
    const mz = frozen ? 0 : c.mz;
    const slip = this.active.has('avalanche') ? 0.45 : 1;
    const acc = (p.onGround ? 40 : 22) * slip;
    const tx = mx * RUN;
    const tz = mz * RUN;
    const dvx = tx - p.vel.x;
    const dvz = tz - p.vel.z;
    const dl = Math.hypot(dvx, dvz);
    const mxv = acc * dt;
    if (dl > mxv) {
      p.vel.x += (dvx / dl) * mxv;
      p.vel.z += (dvz / dl) * mxv;
    } else {
      p.vel.x = tx;
      p.vel.z = tz;
    }
    if (Math.hypot(mx, mz) > 0.1) p.face = Math.atan2(mx, mz);
    if (this.wind) p.vel.x += this.wind * dt * (p.onGround ? 0.8 : 1.4);
    if (this.quake > 0 && p.onGround) {
      p.vel.x += (Math.random() - 0.5) * 30 * this.quake * dt;
      p.vel.z += (Math.random() - 0.5) * 30 * this.quake * dt;
    }
    const tn = this.tornado;
    if (tn.on && !this.insideHouse(p)) {
      const dx = tn.x - p.pos.x;
      const dz = tn.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 11) {
        const k = (1 - d / 11) * 9 * dt;
        p.vel.x += (dx / (d || 1)) * k;
        p.vel.z += (dz / (d || 1)) * k;
      }
    }
    // escada
    const lad = this.onLadder(p);
    const wantUp = c.j || Math.hypot(mx, mz) > 0.3;
    if (lad && !frozen && (p.climbing || (wantUp && !(pressed && p.onGround)))) {
      p.climbing = true;
      p.vel.y = wantUp ? CLIMB : 0;
      if (p.pos.y > lad.h - 0.2) {
        // topo: sobe no telhado
        p.climbing = false;
        p.vel.y = 4.5;
        p.vel.x = -lad.side * 2.8;
      }
    } else if (p.climbing) p.climbing = false;
    if ((pressed || (p.jbuf > 0 && p.coyote > 0)) && !frozen && (p.coyote > 0 || p.climbing)) {
      p.vel.y = JUMP_V;
      p.coyote = 0;
      p.jbuf = 0;
      p.jhold = MIN_HOLD;
      p.climbing = false;
      p.onGround = false;
      p.sq = -0.35;
      if (p.self) audio.jump();
    }
    if (!p.climbing) {
      const held = c.j || p.jhold > 0;
      p.vel.y -= GRAV * dt * (p.vel.y > 0 && !held ? 1.8 : p.vel.y < 0 ? 1.15 : 1);
    }
    if (p.vel.y < -22) p.vel.y = -22;
    // integra eixo por eixo contra as caixas
    const prevY = p.pos.y;
    p.pos.x += p.vel.x * dt;
    this.resolveH(p, 'x');
    p.pos.z += p.vel.z * dt;
    this.resolveH(p, 'z');
    p.pos.y += p.vel.y * dt;
    p.onGround = false;
    const lists = [this.statics, this.dynBoxes];
    for (const arr of lists)
      for (const b of arr) {
        if (!this.overlap(p.pos, b)) continue;
        if (b.oneWay) {
          if (p.vel.y <= 0 && prevY >= b.y1 - 0.06) {
            p.pos.y = b.y1;
            p.vel.y = 0;
            p.onGround = true;
          }
          continue;
        }
        if (p.vel.y <= 0 && prevY >= b.y1 - 0.25) {
          p.pos.y = b.y1;
          p.vel.y = 0;
          p.onGround = true;
        } else if (p.vel.y > 0 && prevY + PH <= b.y0 + 0.25) {
          p.pos.y = b.y0 - PH;
          p.vel.y = 0;
        }
      }
    // rampas e chão da ilha
    const ground = this.topAt(p.pos.x, p.pos.z, p.pos.y + 0.45);
    if (p.pos.y <= ground + 0.001 && p.vel.y <= 0) {
      p.pos.y = ground;
      p.vel.y = 0;
      p.onGround = true;
    } else if (!p.onGround && p.wasGround && p.vel.y <= 0 && p.pos.y - ground < 0.3) {
      // tolerância: descendo degrau/rampa o pé "gruda" (sem perder o pulo)
      p.pos.y = ground;
      p.vel.y = 0;
      p.onGround = true;
    }
    if (p.climbing) p.onGround = false;
    if (p.onGround && !p.wasGround && prevY - p.pos.y >= 0) {
      p.sq = 0.3;
      if (p.self) audio.land();
    }
    // atrito
    if (p.onGround && Math.hypot(mx, mz) < 0.1) {
      p.vel.x *= Math.max(0, 1 - 14 * dt * slip);
      p.vel.z *= Math.max(0, 1 - 14 * dt * slip);
    }
    // borda: caiu no mar
    if (p.pos.y < -3) this.knockOut(p);
    p.sq += (0 - p.sq) * Math.min(1, dt * 10);
  }

  /** separa no eixo; sobe degraus baixos automaticamente; empurra caixas leves */
  private resolveH(p: P3, ax: 'x' | 'z'): void {
    const lists = [this.statics, this.dynBoxes];
    for (let li = 0; li < 2; li++)
      for (let bi = 0; bi < lists[li].length; bi++) {
        const b = lists[li][bi];
        if (b.oneWay || !this.overlap(p.pos, b)) continue;
        // degrau baixo: sobe
        if (b.y1 - p.pos.y <= 0.4 && (p.onGround || p.wasGround) && !this.blockedAt(p.pos.x, b.y1, p.pos.z)) {
          p.pos.y = b.y1;
          continue;
        }
        if (ax === 'x') {
          p.pos.x = p.vel.x > 0 || p.pos.x < (b.x0 + b.x1) / 2 ? b.x0 - PR - 0.001 : b.x1 + PR + 0.001;
          if (li === 1) this.pushDyn(bi, p.vel.x, 0);
          p.vel.x = 0;
        } else {
          p.pos.z = p.vel.z > 0 || p.pos.z < (b.z0 + b.z1) / 2 ? b.z0 - PR - 0.001 : b.z1 + PR + 0.001;
          if (li === 1) this.pushDyn(bi, 0, p.vel.z);
          p.vel.z = 0;
        }
      }
  }

  private blockedAt(x: number, y: number, z: number): boolean {
    const v = this.tmpV.set(x, y + 0.02, z);
    for (const b of this.statics) if (!b.oneWay && this.overlap(v, b)) return true;
    return false;
  }

  private pushDyn(i: number, vx: number, vz: number): void {
    const d = this.dyn[this.dynIdx[i]];
    if (!d || d.heavy) return;
    d.body.wakeUp();
    d.body.applyImpulse(new CANNON.Vec3(vx * 0.15, 0, vz * 0.15));
  }
  private dynIdx: number[] = [];

  private refreshDynBoxes(): void {
    this.dynBoxes.length = 0;
    this.dynIdx.length = 0;
    for (let i = 0; i < this.dyn.length; i++) {
      const b = this.dyn[i].body;
      if (b.aabbNeedsUpdate) b.updateAABB();
      const a = b.aabb;
      // encolhe um pouco (caixa girada fica menor que a AABB)
      const s = b.sleepState === CANNON.Body.SLEEPING ? 0 : 0.08;
      this.dynBoxes.push({ x0: a.lowerBound.x + s, y0: a.lowerBound.y, z0: a.lowerBound.z + s, x1: a.upperBound.x - s, y1: a.upperBound.y, z1: a.upperBound.z - s });
      this.dynIdx.push(i);
    }
  }

  private checkHazards(p: P3, dt: number): void {
    if (!p.alive || this.phase === 'end' || this.phase === 'intro') return;
    const f = this.fluid;
    if (f && f.level > 0.25) {
      const covered = f.dir ? p.pos.x < f.front : true;
      // hitbox generosa: só cai com o fluido acima da metade do corpo
      if (covered && p.pos.y + 0.45 < f.level) {
        this.puff(p.pos, 6, 3);
        this.knockOut(p);
        return;
      }
    }
    if (p.bonk > 0) p.bonk -= dt;
    // escombro pesado e rápido caindo na cabeça
    for (const d of this.dyn) {
      const b = d.body;
      if (b.velocity.y > -5 || b.sleepState === CANNON.Body.SLEEPING) continue;
      const a = b.aabb;
      if (p.pos.x + PR * 0.7 < a.lowerBound.x || p.pos.x - PR * 0.7 > a.upperBound.x || p.pos.z + PR * 0.7 < a.lowerBound.z || p.pos.z - PR * 0.7 > a.upperBound.z) continue;
      if (a.lowerBound.y > p.pos.y + PH * 0.5 && a.lowerBound.y < p.pos.y + PH + 0.2) {
        if (d.heavy && b.velocity.y < -7) {
          this.knockOut(p);
          return;
        }
        if (p.bonk <= 0) {
          p.bonk = 0.5;
          p.vel.y = 3;
          p.vel.x += (Math.random() - 0.5) * 5;
          p.sq = 0.4;
          if (p.self) {
            audio.crack();
            tap('medium');
          }
        }
      }
    }
    const tn = this.tornado;
    if (tn.on && Math.hypot(p.pos.x - tn.x, p.pos.z - tn.z) < tn.r * 0.75 && !this.insideHouse(p)) this.knockOut(p);
  }

  private knockOut(p: P3): void {
    if (!p.alive) return;
    p.alive = false;
    p.outT = this.phase === 'disaster' ? this.phaseT : 0;
    p.vel.set(0, 2, 0);
    p.climbing = false;
    const m = p.bodyMesh.material as THREE.MeshStandardMaterial;
    m.opacity = 0.45;
    this.puff(p.pos, 10, 4);
    if (p.self) {
      audio.hit();
      tap('heavy');
      notify(t('dz.ghost', 'Você virou fantasminha! Assista e voe por aí.'), { key: 'dz-hint', ms: 2600 });
    }
  }

  private ghostStep(p: P3, dt: number): void {
    const c = p.ctl;
    p.vel.x += (c.mx * 7 - p.vel.x) * Math.min(1, dt * 3);
    p.vel.z += (c.mz * 7 - p.vel.z) * Math.min(1, dt * 3);
    p.vel.y += ((c.j ? 4 : p.pos.y < 3 ? 1.5 : -0.5) - p.vel.y) * Math.min(1, dt * 2);
    p.pos.addScaledVector(p.vel, dt);
    p.pos.y = Math.max(0.5, Math.min(18, p.pos.y));
    const r = Math.hypot(p.pos.x, p.pos.z);
    if (r > ISLAND_R + 8) p.pos.multiplyScalar((ISLAND_R + 8) / r);
    c.tap = false;
  }

  /* ------------------------------ bots ------------------------------ */

  private plan(p: P3, d: DisasterId): void {
    const b = p.bot!;
    const r = this.rng;
    const water = d === 'enchente' || d === 'acido' || d === 'tsunami' || d === 'vulcao' || d === 'avalanche';
    if (water && this.highSpots.length) {
      const s = this.highSpots[Math.floor(r() * this.highSpots.length)];
      b.tx = s.x + (r() - 0.5) * 2;
      b.tz = s.z + (r() - 0.5) * 2;
      b.high = true;
      b.house = s.house;
    } else if (d === 'tornado' && this.houses.length) {
      const i = Math.floor(r() * this.houses.length);
      const h = this.houses[i];
      b.tx = h.x + (r() - 0.5) * 1.5;
      b.tz = h.z + (r() - 0.5) * 1.2;
      b.high = false;
      b.house = -2 - i;
    } else {
      const s = this.openSpots[Math.floor(r() * this.openSpots.length)];
      b.tx = s.x;
      b.tz = s.z;
      b.high = false;
      b.house = -1;
    }
    b.think = b.lazy * 3 * (1 - b.skill);
  }

  private think(p: P3, dt: number): void {
    const b = p.bot!;
    const c = p.ctl;
    c.mx = c.mz = 0;
    c.j = false;
    if (this.phase === 'intro' || this.phase === 'end') return;
    b.think -= dt;
    if (b.think > 0) return;
    let tx = b.tx;
    let tz = b.tz;
    // telhado: primeiro a escada
    if (b.high && b.house >= 0) {
      const h = this.houses[b.house];
      if (p.pos.y < h.h - 0.1) {
        tx = (h.ladder.x0 + h.ladder.x1) / 2;
        tz = h.z;
        if (this.onLadder(p)) c.j = true;
      }
    } else if (b.house <= -2) {
      // abrigo: vai até a frente da porta (lado z0) e depois entra
      const h = this.houses[-2 - b.house];
      if (!this.insideHouse(p)) {
        const doorZ = h.z - h.d / 2 - 1.3;
        const inFront = p.pos.z < h.z - h.d / 2 + 0.2;
        if (!inFront || Math.abs(p.pos.x - h.x) > 0.45) {
          tx = h.x;
          tz = doorZ;
          // atrás/ao lado da casa: contorna pela lateral mais próxima
          if (!inFront && Math.abs(p.pos.x - h.x) < h.w / 2 + 0.8) {
            tx = h.x + (p.pos.x < h.x ? -1 : 1) * (h.w / 2 + 1.4);
            tz = p.pos.z;
          }
        }
      }
    }
    // preso numa parede: desvia de lado por um instante
    const moving = Math.hypot(p.vel.x, p.vel.z);
    if (b.stuck > 0) {
      b.stuck -= dt;
      tx = p.pos.x + b.sx;
      tz = p.pos.z + b.sz;
    } else if (moving < 0.4 && Math.hypot(tx - p.pos.x, tz - p.pos.z) > 1 && !p.climbing) {
      b.stuckT += dt;
      if (b.stuckT > 0.6) {
        b.stuckT = 0;
        b.stuck = 0.8;
        const a = Math.random() * Math.PI * 2;
        b.sx = Math.cos(a) * 3;
        b.sz = Math.sin(a) * 3;
        if (p.onGround) c.tap = true;
      }
    } else b.stuckT = 0;
    // foge de marcadores
    for (const s of this.strikes) {
      if (!s.on) continue;
      const dx = p.pos.x - s.x;
      const dz = p.pos.z - s.z;
      const d = Math.hypot(dx, dz);
      if (d < s.r + 1.2 && Math.random() < b.skill + 0.3) {
        tx = p.pos.x + (dx / (d || 1)) * 4;
        tz = p.pos.z + (dz / (d || 1)) * 4;
      }
    }
    // tornado perto: corre para longe (se não estiver abrigado)
    const tn = this.tornado;
    if (tn.on && !this.insideHouse(p)) {
      const dx = p.pos.x - tn.x;
      const dz = p.pos.z - tn.z;
      const d = Math.hypot(dx, dz);
      if (d < 9 && b.house > -2) {
        tx = p.pos.x + (dx / (d || 1)) * 6;
        tz = p.pos.z + (dz / (d || 1)) * 6;
      }
    }
    const dx = tx - p.pos.x;
    const dz = tz - p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.35) {
      const sp = Math.min(1, d / 1.5) * (0.75 + b.skill * 0.25);
      c.mx = (dx / d) * sp;
      c.mz = (dz / d) * sp;
    }
    // obstáculo à frente (degrau alto/caixa): pula
    if (p.onGround && d > 0.6) {
      const ax = p.pos.x + (dx / d) * 0.6;
      const az = p.pos.z + (dz / d) * 0.6;
      const top = this.topAt(ax, az, p.pos.y + 1.6);
      if (top - p.pos.y > 0.35 && top - p.pos.y < 1.4) c.tap = true;
    }
    // água chegando no pé: pulinho
    const f = this.fluid;
    if (f && p.onGround && f.level > p.pos.y - 0.1 && (!f.dir || p.pos.x < f.front + 2) && Math.random() < 0.3) c.tap = true;
  }

  /* ------------------------------ laço ------------------------------ */

  private loop = (now: number): void => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    this.beat = performance.now();
    if (this.paused) {
      this.last = now;
      this.acc = 0;
      return;
    }
    const frame = (now - this.last) / 1000;
    this.last = now;
    if (!(frame > 0)) return;
    this.acc += Math.min(frame, MAX_FRAME);
    const minFrame = this.q.fpsCap === 30 ? 1 / 30 - 0.004 : 0;
    if (this.acc < minFrame) return;
    const dt = Math.min(this.acc, MAX_FRAME);
    this.acc = 0;
    const t0 = performance.now();
    try {
      this.update(dt);
    } catch (e) {
      this.onErr('update', e);
    }
    try {
      this.render(dt);
    } catch (e) {
      this.onErr('render', e);
    }
    this.gov.sample(dt * 1000, performance.now() - t0);
  };

  private onErr(where: string, e: unknown): void {
    this.loopErrors++;
    if (this.loopErrors < 5) console.warn('[disaster3d] erro no laço (recuperado)', where, e);
    const now = performance.now();
    if (now - this.errBurstT > 3000) {
      this.errBurstT = now;
      this.errBurst = 0;
    }
    if (++this.errBurst >= 20) {
      this.errBurst = 0;
      try {
        this.startRound();
      } catch {
        /* */
      }
    }
  }

  private watchdog = (): void => {
    if (this.destroyed || document.hidden) return;
    const now = performance.now();
    if (now - this.beat > 1500) {
      cancelAnimationFrame(this.raf);
      this.last = now;
      this.acc = 0;
      this.beat = now;
      this.raf = requestAnimationFrame(this.loop);
    }
  };

  private update(dt: number): void {
    this.time += dt;
    this.phaseT += dt;
    if (this.phase !== 'intro' && this.phase !== 'end') this.roundT += dt;
    if (this.phaseT >= this.phaseDur) this.nextPhase();
    // entrada do jogador: joystick relativo à câmera
    const js = this.joy.read();
    let ix = js.x;
    let iy = -js.y;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) iy = 1;
    if (k.has('KeyS') || k.has('ArrowDown')) iy = -1;
    if (k.has('KeyA') || k.has('ArrowLeft')) ix = -1;
    if (k.has('KeyD') || k.has('ArrowRight')) ix = 1;
    const l = Math.hypot(ix, iy);
    if (l > 1) {
      ix /= l;
      iy /= l;
    }
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const mc = this.me.ctl;
    mc.mx = fx * iy - fz * ix;
    mc.mz = fz * iy + fx * ix;
    if (this.jumpTap) mc.tap = true;
    this.jumpTap = false;
    mc.j = this.jumpHeld || k.has('Space');
    const [dy, dp] = this.look.consume(dt);
    if (Number.isFinite(dy)) this.yaw -= dy;
    if (Number.isFinite(dp)) this.pitch = Math.max(-0.6, Math.min(1.1, this.pitch + dp));

    this.updateDisasters(dt);
    // física dos escombros (cannon: passo fixo com no máx. 3 subpassos)
    this.world.step(1 / 60, dt, 3);
    for (let i = this.dyn.length - 1; i >= 0; i--) {
      const d = this.dyn[i];
      const b = d.body;
      const bad = !Number.isFinite(b.position.x + b.position.y + b.position.z + b.velocity.x + b.velocity.y + b.velocity.z);
      if (bad || b.position.y < -12) {
        this.world.removeBody(b);
        this.level.remove(d.mesh);
        (d.mesh.material as THREE.Material).dispose();
        this.dyn.splice(i, 1);
        continue;
      }
      d.mesh.position.set(b.position.x, b.position.y, b.position.z);
      d.mesh.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    }
    this.refreshDynBoxes();
    // Bloops em subpassos de 1/120 s (sem atravessar lajes)
    const n = Math.min(MAX_SUB, Math.max(1, Math.ceil(dt / STEP - 1e-6)));
    const h = dt / n;
    for (const p of this.players) if (p.bot && p.alive) this.think(p, dt);
    for (let s = 0; s < n; s++) {
      for (const p of this.players) {
        if (p.alive) {
          this.movePlayer(p, h);
          this.checkHazards(p, h);
        } else this.ghostStep(p, h);
        if (!Number.isFinite(p.pos.x + p.pos.y + p.pos.z + p.vel.x + p.vel.y + p.vel.z)) {
          p.pos.set(0, this.topAt(0, -12), -12);
          p.vel.set(0, 0, 0);
        }
      }
    }
    if (this.phase === 'disaster' && !this.players.some((p) => p.alive) && this.phaseDur - this.phaseT > 2.5) this.phaseT = this.phaseDur - 2.5;
    // partículas
    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.v.y -= 6 * dt;
      p.m.position.addScaledVector(p.v, dt);
      p.m.scale.multiplyScalar(1 - dt * 0.8);
      if (p.life <= 0) p.m.visible = false;
    }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 1.5);
    this.hudTick();
  }

  private render(dt: number): void {
    // Bloops
    for (const p of this.players) {
      p.mesh.position.copy(p.pos);
      // vira suave para onde anda
      const da = ((p.face - p.mesh.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      p.mesh.rotation.y += da * Math.min(1, dt * 12);
      const s = p.sq;
      p.bodyMesh.scale.set(0.5 * (1 + s * 0.5), 0.55 * (1 - s * 0.5), 0.5 * (1 + s * 0.5));
      if (!p.alive) p.mesh.position.y += Math.sin(this.time * 3) * 0.15;
      p.mesh.visible = !(p.self && this.fp && p.alive);
    }
    // câmera: 3ª pessoa suave (padrão) ou 1ª pessoa
    const m = this.me;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const cam = this.camera;
    if (this.fp && m.alive) {
      cam.position.set(m.pos.x, m.pos.y + 0.9, m.pos.z);
      const cp = Math.cos(this.pitch - 0.3);
      cam.lookAt(m.pos.x + fx * cp, m.pos.y + 0.9 - Math.sin(this.pitch - 0.3), m.pos.z + fz * cp);
    } else {
      const dist = 7.5;
      const tx = m.pos.x - fx * dist * Math.cos(this.pitch);
      const ty = m.pos.y + 1.2 + Math.sin(this.pitch) * dist;
      const tz = m.pos.z - fz * dist * Math.cos(this.pitch);
      // não atravessa paredes: puxa a câmera para antes da primeira caixa entre ela e o Bloop
      const hx = m.pos.x;
      const hy = m.pos.y + 1;
      const hz = m.pos.z;
      const hit = this.rayBoxes(hx, hy, hz, tx - hx, Math.max(0.6, ty) - hy, tz - hz);
      const f = hit < 1 ? Math.max(0.15, hit - 0.08) : 1;
      const cx = hx + (tx - hx) * f;
      const cy = hy + (Math.max(0.6, ty) - hy) * f;
      const cz = hz + (tz - hz) * f;
      const k = Math.min(1, dt * (hit < 1 ? 20 : 8));
      this.camPos.x += (cx - this.camPos.x) * k;
      this.camPos.y += (cy - this.camPos.y) * k;
      this.camPos.z += (cz - this.camPos.z) * k;
      cam.position.copy(this.camPos);
      cam.lookAt(m.pos.x, m.pos.y + 1, m.pos.z);
    }
    if (this.shake > 0 && this.q.shake) {
      cam.position.x += (Math.random() - 0.5) * this.shake;
      cam.position.y += (Math.random() - 0.5) * this.shake;
    }
    this.sun.position.set(m.pos.x + 20, 40, m.pos.z + 14);
    this.sun.target.position.copy(m.pos);
    if (this.snow?.visible) {
      const a = this.snow.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = a.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] += this.wind * dt * 2;
        arr[i + 1] -= dt * 3;
        if (arr[i + 1] < 0) {
          arr[i + 1] = 20;
          arr[i] = m.pos.x + (Math.random() - 0.5) * 60;
          arr[i + 2] = m.pos.z + (Math.random() - 0.5) * 60;
        }
      }
      a.needsUpdate = true;
    }
    this.renderer.render(this.scene, cam);
  }

  /* ------------------------------ HUD ------------------------------ */

  private hudTick(): void {
    const n = Math.max(0, Math.ceil(this.phaseDur - this.phaseT));
    if (n !== this.lastN) {
      this.lastN = n;
      this.phaseNum.textContent = String(n);
      if (n <= 3 && n > 0 && (this.phase === 'prepare' || this.phase === 'disaster')) audio.click();
    }
    let a = 0;
    for (const p of this.players) if (p.alive) a++;
    const al = a + '/' + this.players.length;
    if (al !== this.lastAlive) {
      this.lastAlive = al;
      this.aliveEl.textContent = al;
    }
    this.outEl.classList.toggle('on', !this.me.alive && this.phase !== 'end');
    // alerta: ícone + contagem até começar + seta de onde vem (relativa à câmera)
    const left = this.phase === 'warn' ? this.phaseDur - this.phaseT : this.phase === 'prepare' ? this.phaseDur - this.phaseT + 3 : 99;
    const show = left <= 6 && left > 0;
    const d = this.sc.disasters[Math.min(this.dIndex, this.sc.disasters.length - 1)];
    const key = show ? d : '';
    if (key !== this.warnKey) {
      this.warnKey = key;
      this.warnEl.classList.toggle('on', show);
      if (show) {
        (this.warnEl.querySelector('.di') as HTMLElement).innerHTML = dzIcon(d, 50);
        const water = d === 'enchente' || d === 'acido' || d === 'tsunami' || d === 'vulcao' || d === 'avalanche';
        (this.warnEl.querySelector('.safe') as HTMLElement).innerHTML = d === 'tornado' ? dzIcon('house', 32) : water ? icon('arrow-up', { size: 32 }) : '';
      }
    }
    if (show) this.warnNum.textContent = String(Math.ceil(left));
    const from = show ? this.hazardFrom(d) : NaN;
    this.dirEl.classList.toggle('on', Number.isFinite(from));
    if (Number.isFinite(from)) {
      // ângulo da origem no mundo → na tela (para cima = frente da câmera); a seta aponta para dentro
      const wx = Math.cos(from);
      const wz = Math.sin(from);
      const fx = Math.sin(this.yaw);
      const fz = Math.cos(this.yaw);
      const fwd = wx * fx + wz * fz;
      const right = wx * -fz + wz * fx;
      const ang = Math.atan2(right, fwd);
      const R = Math.min(this.root.clientWidth, this.root.clientHeight) * 0.36;
      const ar = this.dirEl.firstElementChild as HTMLElement;
      ar.style.transform = `translate(${Math.sin(ang) * R}px,${-Math.cos(ang) * R}px) rotate(${ang + Math.PI}rad)`;
    }
  }

  private summary(): void {
    if (this.hud.querySelector('.d3-modal')) return;
    this.paused = true;
    this.releaseInput();
    const m = document.createElement('div');
    m.className = 'd3-modal';
    m.dataset.touchIgnore = '';
    m.innerHTML = `<div class="d3-panel">${icon('trophy', { size: 56 })}
      <div>${icon('fire', { size: 18 })} ${this.progress.best} · ${icon('coin', { size: 18 })} ${this.sessionCoins}</div>
      <button class="d3-big cont">${icon('play', { size: 20 })}${t('dz.sum.continue', 'Continuar jogando')}</button>
      <button class="d3-big alt out">${icon('home', { size: 20 })}${t('dz.sum.exit', 'Voltar ao menu')}</button></div>`;
    this.hud.appendChild(m);
    m.querySelector('.cont')!.addEventListener('click', () => {
      audio.click();
      m.remove();
      this.resume();
    });
    m.querySelector('.out')!.addEventListener('click', () => {
      audio.click();
      this.destroy();
      this.exitCb();
    });
  }

  /* ------------------------------ handle ------------------------------ */

  pause(): void {
    this.paused = true;
    this.releaseInput();
  }
  resume(): void {
    if (this.hud.querySelector('.d3-modal')) return;
    this.paused = false;
    this.last = performance.now();
    this.acc = 0;
    this.releaseInput();
  }
  inMatch(): boolean {
    return this.phase === 'disaster' || this.phase === 'warn';
  }
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    for (const f of this.offs) f();
    this.jumpBtn.destroy();
    this.joy.destroy();
    this.look.destroy();
    clearNotify();
    resetNotifyTop();
    objective(null);
    this.hud.remove();
    this.clearLevel();
    this.scene.traverse((o) => {
      const mm = o as THREE.Mesh;
      if (mm.isMesh) {
        mm.geometry?.dispose();
        const mt = mm.material as THREE.Material | THREE.Material[];
        if (Array.isArray(mt)) mt.forEach((x) => x.dispose());
        else mt?.dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.root.classList.remove('d3-root');
  }
}
