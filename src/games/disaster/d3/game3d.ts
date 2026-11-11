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
import { SKINS, type Skin } from '../../../game/skins';
// PAPER: Bloops 2D de papel (src/3d/paper; chave PAPER_GAMES.disaster)
import { mySpec, PaperChar, paperOn, specOf } from '../../../3d/paper';
import { bindButton, createJoystick, createLook, isSolo, type BoundButton, type Joystick, type LookDrag } from '../../../ui/touch';
import { bigMoment, clearNotify, notify, objective, resetNotifyTop, setNotifyTop } from '../../../ui/notify';
import { icon } from '../../../ui/icons';
import { DISASTERS, scenarioName, scenarios, mulberry, type DisasterId, type Scenario } from '../scenarios';
import { dzIcon, type DzIcon } from '../icons';
import { CamView } from '../../../3d/camview';
import { FpCamera, FpController, fpTuning } from '../../../3d/fpkit';
import { intensityOf, loadMode, isFluidD, type DzMode } from '../tuning';
import { FIT } from '../scenarios';

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
  /** chão da ilha (some em cima de um buraco aberto) */
  ground?: boolean;
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
  /** telhado (malha própria + caixas de colisão): o tornado arranca */
  roof: THREE.Mesh | null;
  roofBoxes: Box[];
  ripped: boolean;
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
  /** nadando (água): fôlego 0..1 */
  swim: boolean;
  air: number;
  /** tempo parado (golpes miram mais em quem não se mexe) */
  idle: number;
  burn: number;
  hit: number;
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
  /** PAPER: personagem 2D (null = esfera 3D) */
  paper: PaperChar | null;
}
interface Strike {
  on: boolean;
  kind: 'meteor' | 'bolt' | 'bomb' | 'drop' | 'debris' | 'rock';
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
.d3-mid{flex:0 1 auto;display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-width:0;max-width:calc(50% - 82px)}
.d3-sp{flex:1}
.d3-scn{background:rgba(30,15,70,.72);border-radius:12px;padding:3px 10px;font-size:12px;font-weight:600;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.d3-phase{display:flex;align-items:center;gap:6px;background:linear-gradient(180deg,#ffb03a,#ff6a2e);border:2px solid #2a0b5c;border-radius:14px;padding:2px 12px;font-weight:700;font-size:15px;box-shadow:0 3px 0 #2a0b5c}
.d3-phase.calm{background:linear-gradient(180deg,#5ac8ff,#3f7cff)}
.d3-phase .ico{width:22px;height:22px}
.d3-phase b{font-size:18px;min-width:1.6em;text-align:right}
.d3-right{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.d3-chip[hidden]{display:none}
.d3-chip{background:rgba(30,15,70,.72);border-radius:12px;padding:3px 8px;font-weight:700;font-size:14px;display:flex;align-items:center;gap:4px}
.d3-jump{position:absolute;right:calc(var(--edge-r,14px) + 6px);bottom:calc(max(var(--edge-b,14px),var(--safe-bot,0px)) + 14px);width:86px;height:86px;border-radius:50%;background:rgba(30,15,70,.5);border:3px solid rgba(255,255,255,.45);display:flex;align-items:center;justify-content:center;pointer-events:auto;touch-action:none}
.d3-jump.tc-pressed{background:rgba(255,176,58,.6);transform:scale(.94)}
.d3-jump .ico{width:40px;height:40px}
.d3-root.lefty .d3-jump{right:auto;left:calc(var(--edge-l,14px) + 6px)}
.d3-warn{position:absolute;left:50%;top:calc(max(8px,env(safe-area-inset-top)) + 64px);transform:translate(-50%,-6px) scale(.9);display:flex;align-items:center;gap:10px;padding:5px 16px 5px 10px;border-radius:22px;background:rgba(160,20,40,.8);border:3px solid #2a0b5c;box-shadow:0 4px 0 #2a0b5c;opacity:0;transition:opacity .15s,transform .15s}
.d3-warn.on{opacity:1;transform:translate(-50%,0) scale(1)}
.d3-warn .di .ico{width:50px;height:50px}
.d3-warn b{font-size:42px;line-height:1;color:#ffe14d;-webkit-text-stroke:2px #2a0b5c;min-width:.7em;text-align:center}
.d3-warn .safe .ico{width:32px;height:32px}
.d3-dir{display:none;width:40px;height:40px;align-items:center;justify-content:center;border-radius:50%;background:rgba(255,255,255,.18)}
.d3-dir.on{display:flex}
.d3-dir .ar{display:flex;filter:hue-rotate(-125deg) saturate(1.6)}
.d3-dir .ar .ico{width:32px;height:32px}
.d3-out{position:absolute;left:50%;bottom:calc(max(var(--edge-b,14px),var(--safe-bot,0px)) + 120px);transform:translateX(-50%);opacity:0;transition:opacity .2s}
.d3-out.on{opacity:.9}.d3-out .ico{width:54px;height:54px}
.d3-cam{pointer-events:auto;width:44px;height:44px}
.d3-air{position:absolute;left:50%;top:58%;width:84px;height:12px;margin-left:-42px;border-radius:8px;background:rgba(30,15,60,.75);border:2px solid #2a0b5c;display:none;overflow:hidden}
.d3-air.on{display:block}.d3-air i{display:block;height:100%;background:#5ac8ff;border-radius:6px}
.d3-air.low i{background:#ff3355;animation:d3blink .3s steps(2) infinite}
@keyframes d3blink{50%{opacity:.4}}
.d3-edge{position:absolute;left:0;top:0;width:56px;height:56px;margin:-28px 0 0 -28px;display:none;pointer-events:none;filter:drop-shadow(0 3px 0 #2a0b5c)}
.d3-edge.on{display:block}
.d3-edge .ar{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
.d3-edge .ic{position:absolute;left:50%;top:50%;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;background:rgba(160,20,40,.85);border:3px solid #fff;display:flex;align-items:center;justify-content:center}
.d3-edge .ic .ico{width:30px;height:30px}


.d3-modal{position:absolute;inset:0;background:rgba(10,8,30,.6);display:flex;align-items:center;justify-content:center;pointer-events:auto}
.d3-panel{background:linear-gradient(180deg,#2c3f7a,#1a2350);border:3px solid #2a0b5c;border-radius:22px;box-shadow:0 6px 0 #2a0b5c;padding:16px;width:min(88vw,340px);text-align:center;display:flex;flex-direction:column;gap:8px}
.d3-big{font:inherit;font-weight:700;font-size:17px;border:3px solid #2a0b5c;border-radius:16px;padding:10px;cursor:pointer;color:#2a0b5c;background:linear-gradient(180deg,#ffe680,#ffb03a);box-shadow:0 4px 0 #2a0b5c;display:flex;align-items:center;justify-content:center;gap:6px}
.d3-big.alt{background:linear-gradient(180deg,#d8e4ff,#9fb3e8)}
@media (orientation:landscape) and (max-height:500px){.d3-jump{width:72px;height:72px}.d3-warn{top:calc(max(6px,env(safe-area-inset-top)) + 64px);padding:3px 12px 3px 8px}.d3-warn .di .ico{width:40px;height:40px}.d3-warn b{font-size:32px}}
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
  private fluid: { kind: FluidKind; level: number; target: number; rate: number; front: number; dir: number; speed: number; base: number } | null = null;
  private fluidMesh: THREE.Mesh;
  private fluidMat: THREE.MeshStandardMaterial;
  private baseMesh: THREE.Mesh;
  private sea: THREE.Mesh;
  private quake = 0;
  private wind = 0;
  private windDir = 1;
  private tornado = { on: false, x: 0, z: 0, vx: 0, vz: 0, r: 2.6, side: 0 };
  private tornadoMesh: THREE.Group;
  /** funil de partículas do tornado */
  private tnPts!: THREE.Points;
  private tnH!: Float32Array;
  private tnA!: Float32Array;
  private tnDebris: THREE.Mesh[] = [];
  /** superfície do fluido: malha com ondas e espuma (cores por vértice) */
  private fluidTop!: THREE.Mesh;
  private fluidSeg = 32;
  private fluidCol = new THREE.Color();
  private sea2!: THREE.Mesh;
  private hemi!: THREE.HemisphereLight;
  private sky!: THREE.Mesh;
  private storm = 0;
  private fogCalm = new THREE.Color();
  private fogStorm = new THREE.Color(0x4a5068);
  private strikes: Strike[] = [];
  private craters: THREE.Mesh[] = [];
  private craterHead = 0;
  private puffs: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
  private puffHead = 0;
  private snow: THREE.Points | null = null;
  private bolt: THREE.Line;
  private boltT = 0;
  private shake = 0;
  private volcano: THREE.Mesh;
  // câmera: 1ª pessoa por padrão; botão no topo alterna 1ª → 3ª atrás → 3ª de frente (src/3d/camview.ts)
  private yaw = Math.PI;
  private pitch = 0.32;
  private cv = new CamView('disaster3d', 'fp');
  private camPos = new THREE.Vector3(0, 6, -10);
  /** andar/olhar de 1ª pessoa do kit compartilhado (docs/FPKIT.md): aceleração/frenagem, balanço, tremor */
  private fpc = new FpController(fpTuning('survival', { speed: RUN, accel: 10, decel: 13, eye: 0.92, bobAmp: 0.03, shakeAmp: 0.25 }));
  private fpcam = new FpCamera(fpTuning('survival', { eye: 0.92, bobAmp: 0.03, shakeAmp: 0.25, eyeSmooth: 14 }));
  private get fp(): boolean {
    return this.cv.mode === 'fp';
  }
  // dificuldade (docs/DISASTER-DESIGN.md): mesma régua do 2D
  private mode: DzMode = loadMode();
  private I = 1;
  private tele = 1;
  private heat = 0;
  private training = false;
  /** ondas do tsunami/avalanche: total, atual, tempo até a próxima, o nível que fica */
  private wave = { n: 0, k: 0, next: 0, warned: false, base: 0 };
  /** pulsos (enchente/gosma/lava) e tremores (terremoto) */
  private stage = { k: 0, next: 0, warned: false };
  private pulse = { t: 0, k: -1, warned: false };
  /** desastre duplo: o 2º entra no meio do 1º */
  private comboAt = -1;
  private timers: Record<string, number> = {};
  /** telhados arrancados pelo tornado (índice da casa) */
  private ripCD: number[] = [];
  private tornado2 = { on: false, x: 0, z: 0, vx: 0, vz: 0, tgt: -1, tgtT: 0 };
  private tornado2Mesh: THREE.Group | null = null;
  /** sumidouro / rachaduras: buracos no chão (aviso piscando → buraco) */
  private holes: { on: boolean; x: number; z: number; r: number; warn: number; grow: number; life: number; mesh: THREE.Mesh }[] = [];
  /** areia: rajada (direção no mundo), aviso, duração */
  private gust = { a: 0, t: 0, next: 0, warned: false };
  /** fogo no chão (meteoros/bombas) */
  private fires: { on: boolean; x: number; z: number; r: number; t: number; mesh: THREE.Mesh }[] = [];
  /** moedas no meio do desastre (risco × recompensa) */
  private coins: { on: boolean; x: number; y: number; z: number; t: number; mesh: THREE.Mesh }[] = [];
  private held = 0;
  /** setas na borda da tela para ameaças fora da vista */
  private edge: HTMLElement[] = [];
  private edgeKey: string[] = [];
  private airEl!: HTMLElement;
  private airFill!: HTMLElement;
  private heldEl!: HTMLElement;
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
    this.hemi = new THREE.HemisphereLight(0xdff0ff, 0x6a5a40, 1.15);
    this.scene.add(this.hemi);
    // céu em degradê (cúpula com cor por vértice, fora da neblina)
    const skyG = new THREE.SphereGeometry(320, 16, 10);
    skyG.setAttribute('color', new THREE.BufferAttribute(new Float32Array(skyG.getAttribute('position').count * 3), 3));
    this.sky = new THREE.Mesh(skyG, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);
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
    this.baseMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.fluidMat);
    this.baseMesh.visible = false;
    this.scene.add(this.baseMesh);
    this.fluidSeg = [20, 28, 36, 44][this.tier];
    const ftG = new THREE.PlaneGeometry(1, 1, this.fluidSeg, this.fluidSeg);
    ftG.rotateX(-Math.PI / 2);
    ftG.setAttribute('color', new THREE.BufferAttribute(new Float32Array(ftG.getAttribute('position').count * 3), 3));
    this.fluidTop = new THREE.Mesh(ftG, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.9 }));
    this.fluidTop.visible = false;
    this.scene.add(this.fluidTop);
    this.sea = new THREE.Mesh(new THREE.CircleGeometry(320, 40), new THREE.MeshStandardMaterial({ color: 0x1f6fb8, roughness: 0.5 }));
    this.sea.rotation.x = -Math.PI / 2;
    this.sea.position.y = -0.9;
    this.scene.add(this.sea);
    // faixa de mar perto da ilha com ondas (malha baixa, facetada)
    const sg = new THREE.PlaneGeometry(130, 130, 26, 26);
    sg.rotateX(-Math.PI / 2);
    this.sea2 = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: 0x2a8ad8, flatShading: true, roughness: 0.3, transparent: true, opacity: 0.92 }));
    this.sea2.position.y = -0.55;
    this.scene.add(this.sea2);
    // vulcão (visual)
    this.volcano = new THREE.Mesh(new THREE.ConeGeometry(9, 14, 9, 1, true), new THREE.MeshStandardMaterial({ color: 0x6b5a5a, flatShading: true, side: THREE.DoubleSide }));
    this.volcano.position.set(ISLAND_R + 10, 6.5, 0);
    this.scene.add(this.volcano);
    // tornado
    this.tornadoMesh = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(6, 0.7, 17, 14, 1, true), new THREE.MeshBasicMaterial({ color: 0x8a90a8, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
    shell.position.y = 8.5;
    this.tornadoMesh.add(shell);
    const nP = [180, 300, 480, 700][this.tier];
    this.tnH = new Float32Array(nP);
    this.tnA = new Float32Array(nP);
    const tpos = new Float32Array(nP * 3);
    const tcol = new Float32Array(nP * 3);
    for (let i = 0; i < nP; i++) {
      this.tnH[i] = Math.random();
      this.tnA[i] = Math.random() * Math.PI * 2;
      const c = 0.45 + Math.random() * 0.35;
      tcol[i * 3] = c;
      tcol[i * 3 + 1] = c * 0.95;
      tcol[i * 3 + 2] = c * (Math.random() < 0.3 ? 0.7 : 1.05);
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(tpos, 3));
    tg.setAttribute('color', new THREE.BufferAttribute(tcol, 3));
    // partícula redonda e macia (textura gerada: nada de quadrados)
    const dot = document.createElement('canvas');
    dot.width = dot.height = 32;
    const dx = dot.getContext('2d')!;
    const grd = dx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.5, 'rgba(255,255,255,.6)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    dx.fillStyle = grd;
    dx.fillRect(0, 0, 32, 32);
    const dotTex = new THREE.CanvasTexture(dot);
    this.tnPts = new THREE.Points(tg, new THREE.PointsMaterial({ size: 0.9, map: dotTex, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false }));
    this.tnPts.frustumCulled = false;
    this.tornadoMesh.add(this.tnPts);
    const dm = new THREE.MeshStandardMaterial({ color: 0x8a5a33, flatShading: true });
    for (let i = 0; i < 10; i++) {
      const d = new THREE.Mesh(this.sharedGeo.box, dm);
      d.scale.set(0.2 + Math.random() * 0.4, 0.1 + Math.random() * 0.2, 0.2 + Math.random() * 0.5);
      d.userData = { h: Math.random(), a: Math.random() * Math.PI * 2, s: 1.5 + Math.random() * 2 };
      this.tornadoMesh.add(d);
      this.tnDebris.push(d);
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
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 0), rockMat.clone());
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
    // buracos (sumidouro/rachaduras), fogo no chão e moedas: pools fixos (nada alocado na rodada)
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: 0x140c1c, transparent: true, opacity: 1, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      m.renderOrder = 1;
      this.scene.add(m);
      this.holes.push({ on: false, x: 0, z: 0, r: 1, warn: 0, grow: 0, life: 0, mesh: m });
    }
    const fireMat = new THREE.MeshBasicMaterial({ color: 0xff8a1e, transparent: true, opacity: 0.85, depthWrite: false });
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 7, 1, true), fireMat);
      m.visible = false;
      this.scene.add(m);
      this.fires.push({ on: false, x: 0, z: 0, r: 1, t: 0, mesh: m });
    }
    const coinMat = new THREE.MeshStandardMaterial({ color: 0xffd34a, emissive: 0x8a5a00, emissiveIntensity: 0.6, metalness: 0.4, roughness: 0.3 });
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 16), coinMat);
      m.rotation.x = Math.PI / 2;
      m.visible = false;
      this.scene.add(m);
      this.coins.push({ on: false, x: 0, y: 0, z: 0, t: 0, mesh: m });
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
        <div class="d3-mid"><div class="d3-scn"></div><div class="d3-phase"><span class="pi"></span><b></b></div></div><div class="d3-sp"></div>
        <div class="d3-right"><div class="d3-chip">${icon('user', { size: 18 })}<span class="al"></span></div><div class="d3-chip hd" hidden>${icon('coin', { size: 16 })}<span></span></div></div>
      </div>
      <div class="d3-warn" aria-hidden="true"><span class="di"></span><b></b><span class="d3-dir"><span class="ar">${icon('arrow-up')}</span></span><span class="safe"></span></div>
      <div class="d3-out" aria-hidden="true">${dzIcon('ghost', 54)}</div>
      <div class="d3-air" aria-hidden="true"><i></i></div>
      ${'<div class="d3-edge" aria-hidden="true"><span class="ar"><svg viewBox="0 0 56 56" width="56" height="56"><path d="M28 0L44 18H12Z" fill="#ff3355" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></svg></span><span class="ic"></span></div>'.repeat(4)}
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
    // botão de câmera compartilhado (1ª → 3ª atrás → 3ª de frente), lembrado por jogo
    const camBtn = this.cv.mountButton(this.hud.querySelector('.d3-right') as HTMLElement, { cls: 'd3-cam', label: t('dz3.view', 'Trocar câmera'), onPress: () => audio.click() });
    this.hud.querySelector('.d3-right')!.insertBefore(camBtn, this.hud.querySelector('.d3-right')!.firstChild);
    this.edge = Array.from(this.hud.querySelectorAll('.d3-edge')) as HTMLElement[];
    this.edgeKey = this.edge.map(() => '');
    this.airEl = this.hud.querySelector('.d3-air') as HTMLElement;
    this.airFill = this.airEl.firstElementChild as HTMLElement;
    this.heldEl = this.hud.querySelector('.d3-chip.hd') as HTMLElement;
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
    g.deleteAttribute('normal');
    g.computeVertexNormals();
    this.batch.push(g);
  }
  /** qualquer geometria (cone, pedra...) no lote, com cor */
  private batchGeo(src: THREE.BufferGeometry, x: number, y: number, z: number, sx: number, sy: number, sz: number, rotY: number, color: string | number | THREE.Color): void {
    const g = (src.index ? src.toNonIndexed() : src.clone()) as THREE.BufferGeometry;
    g.scale(sx, sy, sz);
    if (rotY) g.rotateY(rotY);
    g.translate(x, y, z);
    const col = new THREE.Color(color);
    const n = g.getAttribute('position').count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = col.r;
      arr[i * 3 + 1] = col.g;
      arr[i * 3 + 2] = col.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    if (g.getAttribute('uv')) g.deleteAttribute('uv');
    if (g.getAttribute('normal')) g.deleteAttribute('normal');
    g.computeVertexNormals();
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
    this.fogCalm.set(m.sky[2]);
    this.scene.fog = new THREE.Fog(this.fogCalm.getHex(), 45, 170);
    {
      const top = new THREE.Color(m.sky[0]);
      const mid = new THREE.Color(m.sky[1]);
      const hor = new THREE.Color(m.sky[2]);
      const pos = this.sky.geometry.getAttribute('position');
      const col = this.sky.geometry.getAttribute('color') as THREE.BufferAttribute;
      const c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i) / 320;
        if (y > 0.35) c.copy(mid).lerp(top, Math.min(1, (y - 0.35) / 0.65));
        else c.copy(hor).lerp(mid, Math.max(0, y / 0.35));
        col.setXYZ(i, c.r, c.g, c.b);
      }
      col.needsUpdate = true;
    }
    // chão da ilha (colisão: caixa grande; visual: cilindro de areia + disco de grama)
    const sandCol = m.id === 'polo' ? '#e8f1ff' : m.id === 'estacao' ? '#7b86b0' : '#e9d29a';
    const ground = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND_R + 1.5, ISLAND_R + 4, 3, 40), this.mat(sandCol));
    const grass = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND_R - 1.5, ISLAND_R - 0.5, 0.2, 40), this.mat(m.groundTop));
    grass.position.y = -0.08;
    grass.receiveShadow = true;
    this.level.add(grass);
    ground.position.y = -1.5;
    ground.receiveShadow = true;
    this.level.add(ground);
    this.statics.push({ x0: -ISLAND_R, y0: -6, z0: -ISLAND_R, x1: ISLAND_R, y1: 0, z1: ISLAND_R, ground: true });
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
      // telhado plano com mureta (lugar alto, mas o tornado arranca): malha e caixas próprias
      const mainBatch = this.batch;
      this.batch = [];
      const st0 = this.statics.length;
      this.solid(x0 - 0.2, h, z0 - 0.2, x1 + 0.2, h + 0.35, z1 + 0.2, roof);
      // escada do lado
      const side = r() < 0.5 ? -1 : 1;
      // acabamento (só visual): base, janelas com moldura, batente da porta, mureta e chaminé
      const glass = '#5aa7e0';
      const frame = '#fff7ea';
      const trim = new THREE.Color(roof).offsetHSL(0, 0, -0.12).getStyle();
      this.batchBox(x, 0.09, z, w + 0.3, 0.18, d + 0.3, '#8d8a93');
      const win = (cx: number, cy: number, cz: number, alongX: boolean) => {
        this.batchBox(cx, cy, cz, alongX ? 1.0 : 0.07, 0.9, alongX ? 0.07 : 1.0, frame);
        this.batchBox(cx, cy, cz, alongX ? 0.78 : 0.09, 0.68, alongX ? 0.09 : 0.78, glass);
        this.batchBox(cx, cy, cz, alongX ? 0.08 : 0.1, 0.68, alongX ? 0.1 : 0.08, frame);
      };
      const wy = Math.min(1.7, h - 1.1);
      win(x - w / 4, wy, z1 + 0.02, true);
      win(x + w / 4, wy, z1 + 0.02, true);
      if (w >= 5) {
        win(x0 + 0.85, wy, z0 - 0.02, true);
        win(x1 - 0.85, wy, z0 - 0.02, true);
      }
      win(x0 - 0.02, wy, z + d * 0.28, false);
      win(x1 + 0.02, wy, z + d * 0.28, false);
      this.batchBox(x - door / 2 - 0.07, 1.15, z0 - 0.03, 0.14, 2.3, 0.1, trim);
      this.batchBox(x + door / 2 + 0.07, 1.15, z0 - 0.03, 0.14, 2.3, 0.1, trim);
      this.batchBox(x, 2.27, z0 - 0.03, door + 0.28, 0.14, 0.1, trim);
      this.batchBox(x, 0.02, z0 - 0.6, door + 0.4, 0.04, 1.0, '#b9a58a');
      const rt = h + 0.35;
      this.batchBox(x, rt + 0.12, z0 - 0.15, w + 0.4, 0.24, 0.12, trim);
      this.batchBox(x, rt + 0.12, z1 + 0.15, w + 0.4, 0.24, 0.12, trim);
      if (side > 0) this.batchBox(x0 - 0.15, rt + 0.12, z, 0.12, 0.24, d + 0.4, trim);
      else this.batchBox(x1 + 0.15, rt + 0.12, z, 0.12, 0.24, d + 0.4, trim);
      const chx = side < 0 ? x1 - 0.8 : x0 + 0.8;
      this.solid(chx - 0.3, rt, z1 - 1.1, chx + 0.3, rt + 1.0, z1 - 0.5, '#a0523d');
      const roofBoxes = this.statics.slice(st0);
      let roofMesh: THREE.Mesh | null = null;
      {
        const merged = this.batch.length ? mergeGeometries(this.batch, false) : null;
        for (const g of this.batch) g.dispose();
        if (merged) {
          roofMesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 }));
          roofMesh.castShadow = roofMesh.receiveShadow = true;
          this.level.add(roofMesh);
        }
      }
      this.batch = mainBatch;
      const lx = side < 0 ? x0 - 0.15 : x1 + 0.15;
      this.batchBox(lx, (h + 0.4) / 2, z - 0.5, 0.2, h + 0.4, 0.1, '#c98a4a');
      this.batchBox(lx, (h + 0.4) / 2, z + 0.5, 0.2, h + 0.4, 0.1, '#c98a4a');
      for (let k = 0; k < Math.floor(h / 0.5); k++) this.batchBox(lx + side * 0.06, 0.4 + k * 0.5, z, 0.14, 0.09, 1.0, '#8a5a2a');
      const ladder: Box = side < 0 ? { x0: x0 - 1.0, y0: -0.1, z0: z - 0.9, x1: x0 + 0.05, y1: h + 0.4, z1: z + 0.9 } : { x0: x1 - 0.05, y0: -0.1, z0: z - 0.9, x1: x1 + 1.0, y1: h + 0.4, z1: z + 0.9 };
      const inner: Box = { x0: x0 + th, y0: 0, z0: z0 + th, x1: x1 - th, y1: h, z1: z1 - th };
      this.houses.push({ x, z, w, d, h, inner, ladder, side, roof: roofMesh, roofBoxes, ripped: false });
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
    // detalhes do chão: tufos de grama, flores e pedrinhas (tudo no mesmo lote: 1 desenho)
    const tuft = new THREE.ConeGeometry(0.13, 0.4, 3);
    const rock = new THREE.IcosahedronGeometry(0.3, 0);
    const leaf = new THREE.Color(m.leaf);
    const nd = [40, 70, 110, 150][this.tier];
    for (let i = 0; i < nd; i++) {
      const a = r() * Math.PI * 2;
      const rad = Math.sqrt(r()) * (ISLAND_R - 2.5);
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      if (this.statics.some((b) => b.y1 > 0.01 && x > b.x0 - 0.3 && x < b.x1 + 0.3 && z > b.z0 - 0.3 && z < b.z1 + 0.3)) continue;
      const k = r();
      if (k < 0.62) {
        const c = leaf.clone().offsetHSL(0, 0, (r() - 0.5) * 0.15);
        for (let j = 0; j < 3; j++) this.batchGeo(tuft, x + (r() - 0.5) * 0.3, 0.18, z + (r() - 0.5) * 0.3, 1, 0.7 + r() * 0.6, 1, r() * 3, c);
      } else if (k < 0.85) {
        this.batchBox(x, 0.18, z, 0.04, 0.36, 0.04, '#3f8f3a');
        this.batchBox(x, 0.4, z, 0.2, 0.12, 0.2, m.roof[Math.floor(r() * m.roof.length)]);
      } else this.batchGeo(rock, x, 0.1, z, 1 + r(), 0.6 + r() * 0.5, 1 + r(), r() * 3, '#9a9aa5');
    }
    tuft.dispose();
    rock.dispose();
    this.flushBatch();
    this.volcano.visible = m.id === 'ilha' || sc.disasters.includes('vulcao');
  }

  /* ------------------------------ jogadores ------------------------------ */

  private makeBloop(skin: Skin, self: boolean): { g: THREE.Group; body: THREE.Mesh; paper: PaperChar | null } {
    const color = skin.light;
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
    // PAPER: billboard 2D no lugar da esfera (a esfera fica só para o código antigo, invisível)
    let paper: PaperChar | null = null;
    if (paperOn('disaster')) {
      paper = new PaperChar(self ? mySpec() : specOf(skin.id), { radius: 0.5, cell: self ? 128 : 80, shadow: true });
      body.visible = false;
      g.add(paper.root);
    }
    this.scene.add(g);
    return { g, body, paper };
  }

  private spawnPlayers(): void {
    for (const p of this.players) {
      this.scene.remove(p.mesh);
      p.paper?.dispose(); // PAPER
    }
    this.players = [];
    const n = isSolo('disaster') ? 1 : 6;
    const meSkin = SKINS.find((s) => s.id === save.skin) ?? SKINS[0];
    // largada: o lugar aberto mais longe de paredes (antes nascia colado no morro e a câmera via só parede)
    let sp = this.openSpots[0];
    let bestD = -1;
    for (const o of this.openSpots) {
      let d = 99;
      for (const b of this.statics) {
        if (b.y1 <= 0.01) continue;
        const dx = Math.max(b.x0 - o.x, 0, o.x - b.x1);
        const dz = Math.max(b.z0 - o.z, 0, o.z - b.z1);
        d = Math.min(d, Math.hypot(dx, dz));
      }
      if (d > bestD && Math.hypot(o.x, o.z) < ISLAND_R - 6) {
        bestD = d;
        sp = o;
      }
    }
    for (let i = 0; i < n; i++) {
      const self = i === 0;
      const skin = self ? meSkin : SKINS[(i * 5 + this.sessionRounds) % SKINS.length];
      const { g, body, paper } = this.makeBloop(skin, self);
      const a = (i / n) * Math.PI * 2;
      const pos = new THREE.Vector3(sp.x + Math.cos(a) * 2.2, 0, sp.z + Math.sin(a) * 2.2);
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
        paper,
        swim: false,
        air: 1,
        idle: 0,
        burn: 0,
        hit: 0,
      };
      this.players.push(p);
    }
    this.me = this.players[0];
    // de costas para a borda, olhando para o centro da ilha; câmera já no lugar (sem "voar" até lá)
    this.yaw = Math.atan2(-this.me.pos.x, -this.me.pos.z);
    this.camPos.set(this.me.pos.x - Math.sin(this.yaw) * 7, this.me.pos.y + 3.5, this.me.pos.z - Math.cos(this.yaw) * 7);
  }

  /* ------------------------------ rodada ------------------------------ */

  startRound(): void {
    const list = scenarios();
    const base = list[(this.progress.next - 1) % 100];
    // cópia: o desastre duplo dinâmico mexe na lista desta rodada sem mudar o cenário salvo
    this.sc = { ...base, disasters: [...base.disasters] };
    this.rng = mulberry(this.sc.seed + this.sessionRounds * 13);
    this.training = this.progress.played < 2 || /[?&]train=1/.test(location.search);
    this.mode = loadMode();
    this.I = intensityOf(this.mode, this.sc.difficulty, this.streak, this.training);
    this.tele = Math.max(0.75, Math.min(1.15, 1.25 - 0.25 * this.I));
    {
      const cr = mulberry(this.sc.seed * 3 + this.sessionRounds * 7 + this.streak);
      const d1 = this.sc.disasters[0];
      const chance = this.mode === 'facil' ? 0 : Math.min(0.6, 0.15 * (this.streak - 3) + (this.mode === 'dificil' ? 0.15 : 0));
      if (d1 !== 'meteoro' && this.sc.disasters.length === 1 && !this.training && cr() < chance) {
        const pool = (FIT[this.sc.map.id] || []).filter((d) => d !== d1 && isFluidD(d) !== isFluidD(d1));
        if (pool.length) this.sc.disasters.push(pool[Math.floor(cr() * pool.length)]);
      }
    }
    this.active.clear();
    this.fluid = null;
    this.fluidMesh.visible = false;
    this.baseMesh.visible = false;
    this.quake = 0;
    this.wind = 0;
    this.tornado.on = false;
    this.tornado.side = 0;
    this.tornadoMesh.visible = false;
    this.tornado2.on = false;
    if (this.tornado2Mesh) this.tornado2Mesh.visible = false;
    this.dIndex = 0;
    this.roundT = 0;
    this.heat = 0;
    this.comboAt = -1;
    this.timers = {};
    this.wave.n = 0;
    this.stage.k = 0;
    this.pulse.k = -1;
    this.gust.t = 0;
    this.held = 0;
    this.ripCD = [];
    for (const h of this.holes) {
      h.on = false;
      h.mesh.visible = false;
    }
    for (const f of this.fires) {
      f.on = false;
      f.mesh.visible = false;
    }
    for (const c of this.coins) {
      c.on = false;
      c.mesh.visible = false;
    }
    for (const s of this.strikes) this.endStrike(s);
    for (const c of this.craters) c.visible = false;
    this.setSnow(false);
    this.build();
    this.spawnPlayers();
    (this.hud.querySelector('.d3-scn') as HTMLElement).textContent = (this.training ? t('dz.train', 'Treino') + ' · ' : '') + `#${this.sc.n} · ${scenarioName(this.sc)}`;
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
        this.setPhase('prepare', 14 + (this.training ? 6 : 0));
        break;
      case 'prepare':
        this.setPhase('warn', 3 * Math.max(0.85, this.tele));
        this.warnStart();
        break;
      case 'warn':
        this.setPhase('disaster', (this.sc.disasters.length > 1 ? 50 : 44) + this.sc.difficulty * 2);
        this.beginDisaster(this.sc.disasters[this.dIndex]);
        // desastre duplo: o 2º começa no meio do 1º (os dois juntos)
        this.comboAt = this.sc.disasters.length > 1 ? this.phaseDur * 0.35 : -1;
        break;
      case 'disaster':
        this.endRound();
        break;
      case 'end':
        this.progress.next = (this.progress.next % 100) + 1;
        saveProgress(this.progress);
        this.startRound();
        break;
    }
  }

  private warnStart(): void {
    // o aviso visual é o cartão único (hudTick): ícone + contagem + seta
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
    this.tornado2.on = false;
    if (this.tornado2Mesh) this.tornado2Mesh.visible = false;
    this.wind = 0;
    this.gust.t = 0;
    this.wave.n = 0;
    if (this.fluid) this.fluid.base = 0;
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
      coins = 70 + this.sc.difficulty * 15 + Math.min(10, this.streak - 1) * 6 + this.held * 6;
      audio.cash();
      success();
      bigMoment(t('dz.survived', 'Sobreviveu!'), { icon: 'trophy', sub: '+' + coins, ms: 1300 });
    } else {
      this.streak = 0;
      coins = 8 + Math.round(Math.min(60, me.outT) * 0.6) + Math.floor((this.held * 6) / 2);
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
    const I = this.I;
    const duo = this.sc.disasters.length > 1 ? 0.85 : 1;
    const dur = this.phaseDur;
    const fl = (kind: FluidKind, target: number, rate: number, dir = 0, speed = 0) => {
      const level = this.fluid && this.fluid.kind === kind && !this.fluid.dir ? this.fluid.level : 0;
      const front = dir > 0 ? -ISLAND_R - 8 : dir < 0 ? ISLAND_R + 8 : 0;
      this.fluid = { kind, level, target: target * duo, rate, front, dir, speed, base: 0 };
      const c = kind === 'water' ? 0x3aa0ff : kind === 'lava' ? 0xff6a1e : kind === 'goo' ? 0x7be04a : 0xf4f8ff;
      this.fluidMat.color.setHex(c);
      this.fluidMat.emissive.setHex(kind === 'lava' ? 0xff3a00 : 0x000000);
      this.fluidMat.emissiveIntensity = kind === 'lava' ? 0.6 : 0;
      this.fluidMat.opacity = kind === 'snow' || kind === 'lava' ? 1 : 0.78;
      this.fluidMesh.visible = true;
    };
    switch (d) {
      case 'enchente':
        fl('water', this.peak3('enchente') / 3, 0.12 + 0.05 * I);
        this.stage.k = 0;
        this.stage.next = dur * 0.28;
        this.stage.warned = false;
        this.timers.stormbolt = 6;
        break;
      case 'acido':
        fl('goo', this.peak3('acido') / 3, 0.07 + 0.04 * I);
        this.stage.k = 0;
        this.stage.next = dur * 0.28;
        this.stage.warned = false;
        this.timers.acido = 2;
        break;
      case 'tsunami':
        // várias ondas, cada uma maior; a água que fica sobe a cada onda
        fl('water', 0, 0.9, 1, 7.5 + 2 * I);
        this.wave.n = Math.max(2, Math.min(4, Math.round(1.5 + 1.2 * I)));
        this.wave.k = 0;
        this.wave.next = (dur - 4) / this.wave.n;
        this.wave.warned = false;
        this.startWave();
        break;
      case 'vulcao':
        // a lava desce do vulcão (+x) numa frente lenta e sobe em pulsos; bombas miradas deixam fogo
        fl('lava', this.peak3('vulcao') / 3, 0.05, -1, 1.0 + 0.45 * I);
        this.stage.k = 0;
        this.stage.next = dur * 0.28;
        this.timers.vulcao = 2;
        break;
      case 'avalanche':
        fl('snow', this.peak3('avalanche') / 3, 0.08 + 0.04 * I);
        this.stage.k = 0;
        this.stage.next = dur * 0.28;
        this.stage.warned = false;
        this.setSnow(true);
        this.windDir = this.rng() < 0.5 ? -1 : 1;
        this.timers.avalanche = 2;
        break;
      case 'terremoto':
        this.quake = 0.05;
        this.pulse.t = 0;
        this.pulse.k = -1;
        this.pulse.warned = false;
        this.timers.terremoto = 1.5;
        break;
      case 'tornado': {
        const side = this.tornado.side || (this.rng() < 0.5 ? -1 : 1);
        this.tornado.on = true;
        this.tornado.x = (this.rng() - 0.5) * 20;
        this.tornado.z = side * (ISLAND_R + 6);
        this.tornado.vx = 0;
        this.tornado.vz = -side * 2;
        this.tornado.r = 2.4 + 0.25 * I;
        this.tornadoMesh.visible = true;
        this.ripCD = this.houses.map(() => 0);
        this.timers.tornado = 3;
        this.tgt1 = -1;
        this.tgt1T = 0;
        break;
      }
      case 'sumidouro':
        this.timers.sumidouro = 1;
        break;
      case 'areia':
        this.gust.a = this.rng() * Math.PI * 2;
        this.gust.next = 2;
        this.gust.t = 0;
        this.gust.warned = false;
        break;
      case 'meteoros':
      case 'meteoro':
      case 'raios':
        this.timers[d] = 1.2;
        if (d === 'raios' && !this.fluid) fl('water', 0.35 + 0.2 * I, 0.012);
        break;
    }
  }

  /** nível final de cada fluido no 3D (m) */
  private peak3(d: DisasterId): number {
    const I = this.I;
    if (d === 'enchente') return 1.8 + 1.2 * I;
    if (d === 'acido') return 1.0 + 0.6 * I;
    if (d === 'vulcao') return 0.9 + 0.5 * I;
    if (d === 'avalanche') return 1.2 + 0.8 * I;
    return 0;
  }

  private startWave(): void {
    const f = this.fluid;
    if (!f) return;
    const k = this.wave.k;
    f.front = -ISLAND_R - 10;
    f.level = Math.max(f.base, 0.05);
    f.target = (2.6 + 1.2 * this.I) * (0.75 + 0.3 * k) * (this.sc.disasters.length > 1 ? 0.85 : 1);
    this.wave.warned = false;
    this.shake = Math.max(this.shake, 0.3);
  }

  /** aviso no meio do desastre (onda, tremor, rajada, desastre duplo): faixa + sirene */
  private alert3(ic: DzIcon, msg: string): void {
    audio.siren(1.6);
    tap('medium');
    bigMoment(msg, { icon: 'warning', color: ic === 'combo' ? 'linear-gradient(90deg,#ff5a3c,#a01490)' : 'linear-gradient(90deg,#ff5a3c,#c8193c)', ms: 1100 });
  }

  /** relógio de golpes por chave: chama fn quando zera e recarrega com base·(0,7..1,3) */
  private tick(key: string, dt: number, fn: () => void, base: number): void {
    const v = (this.timers[key] ?? 1) - dt;
    if (v > 0) {
      this.timers[key] = v;
      return;
    }
    fn();
    this.timers[key] = Math.max(0.3, base) * (0.7 + this.rng() * 0.6);
  }

  /** alvo dos golpes: sorteio com peso para quem está parado */
  private pickTarget(): P3 | null {
    let tot = 0;
    for (const p of this.players) if (p.alive) tot += 1 + Math.min(5, p.idle * 0.8);
    let r = this.rng() * tot;
    for (const p of this.players) {
      if (!p.alive) continue;
      r -= 1 + Math.min(5, p.idle * 0.8);
      if (r <= 0) return p;
    }
    return null;
  }

  private tgt1 = -1;
  private tgt1T = 0;

  private holeAt(x: number, z: number, r: number, warn: number, life: number, grow: number): void {
    const h = this.holes.find((o) => !o.on);
    if (!h) return;
    const d = Math.hypot(x, z);
    if (d > ISLAND_R - 3) {
      x *= (ISLAND_R - 3) / d;
      z *= (ISLAND_R - 3) / d;
    }
    h.on = true;
    h.x = x;
    h.z = z;
    h.r = r;
    h.warn = warn;
    h.life = life;
    h.grow = grow;
    h.mesh.visible = true;
  }

  inHole(x: number, z: number, margin = 0): boolean {
    for (const h of this.holes) if (h.on && h.warn <= 0 && Math.hypot(x - h.x, z - h.z) < h.r - margin) return true;
    return false;
  }

  /** o tornado arranca o telhado: some a malha e a colisão, voam pedaços; a casa deixa de ser abrigo */
  private ripRoof(i: number): void {
    const h = this.houses[i];
    if (h.ripped) return;
    h.ripped = true;
    if (h.roof) h.roof.visible = false;
    for (const b of h.roofBoxes) {
      b.y0 = -60;
      b.y1 = -59;
    }
    const roofCol = this.sc.map.roof[0];
    for (let k = 0; k < 3; k++) {
      const d = this.addDyn(h.x + (this.rng() - 0.5) * h.w, h.h + 0.6, h.z + (this.rng() - 0.5) * h.d, 0.5 + this.rng() * 0.4, 0.12, 0.5 + this.rng() * 0.4, roofCol, false);
      if (d) {
        d.body.wakeUp();
        d.body.velocity.set((this.rng() - 0.5) * 6, 9 + this.rng() * 4, (this.rng() - 0.5) * 6);
      }
    }
    this.puff(new THREE.Vector3(h.x, h.h + 0.5, h.z), 10, 6);
    audio.crack();
    this.ripGrace = 1.6;
    this.ripHouse = i;
    if (this.insideHouseIdx(this.me) === i) notify(t('dz.al.roof', 'O tornado arrancou o telhado! Corra!'), { kind: 'warn', key: 'dz-hint', ms: 2400 });
  }
  private ripGrace = 0;
  private ripHouse = -1;

  private insideHouseIdx(p: P3): number {
    for (let i = 0; i < this.houses.length; i++) {
      const b = this.houses[i].inner;
      if (p.pos.x > b.x0 && p.pos.x < b.x1 && p.pos.z > b.z0 && p.pos.z < b.z1 && p.pos.y < b.y1 - 0.5) return i;
    }
    return -1;
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

  private spawnStrike(kind: Strike['kind'], onlyHigh = false): void {
    const s = this.strikes.find((x) => !x.on);
    if (!s) return;
    const I = this.I;
    let x: number;
    let z: number;
    let T = 1.5 * this.tele;
    let r = 2.3 + 0.3 * I;
    // mira onde o jogador VAI estar (posição + velocidade)
    const aimAt = (p: P3, lead: number) => {
      x = p.pos.x + p.vel.x * T * lead + (this.rng() - 0.5) * 1.6;
      z = p.pos.z + p.vel.z * T * lead + (this.rng() - 0.5) * 1.6;
    };
    const a0 = this.rng() * Math.PI * 2;
    const r0 = Math.sqrt(this.rng()) * (ISLAND_R - 2);
    x = Math.cos(a0) * r0;
    z = Math.sin(a0) * r0;
    if (kind === 'bolt') {
      // raio prefere o mais ALTO (lição: o alto atrai raio)
      T = 1.3 * this.tele;
      r = 2.1;
      let hi: P3 | null = null;
      for (const p of this.players) if (p.alive && p.pos.y > 1.2 && (!hi || p.pos.y > hi.pos.y)) hi = p;
      if (hi && (onlyHigh || this.rng() < 0.45)) aimAt(hi, 0.5);
      else if (onlyHigh) return;
      else if (this.rng() < 0.55) {
        const p = this.pickTarget();
        if (p) aimAt(p, 0.6);
      }
    } else if (kind === 'debris') {
      // destroço arremessado (tornado / rajada de areia) até quem está perto; pule ou abrigue-se
      T = 1.25 * this.tele;
      r = 2.0;
      const p = this.pickTarget();
      if (!p) return;
      aimAt(p, 0.6);
    } else {
      if (kind === 'drop') {
        T = 1.2 * this.tele;
        r = 0.9;
      } else if (kind === 'bomb') {
        T = 1.6 * this.tele;
        r = 1.8;
      } else if (kind === 'rock') {
        T = 1.4 * this.tele;
        r = 1.8;
      }
      const p = this.rng() < (kind === 'meteor' ? 0.45 : 0.55) ? this.pickTarget() : null;
      if (p) aimAt(p, 0.75);
    }
    s.on = true;
    s.kind = kind;
    s.x = x!;
    s.z = z!;
    s.y = this.topAt(s.x, s.z);
    s.r = r;
    s.T = s.t = T;
    if (kind === 'bomb') {
      s.sx = ISLAND_R + 10;
      s.sy = 14;
      s.sz = 0;
    } else if (kind === 'debris') {
      const tn = this.tornado.on ? this.tornado : null;
      const ga = this.gust.a;
      s.sx = tn ? tn.x : s.x - Math.cos(ga) * 22;
      s.sy = tn ? 3 : s.y + 1.2;
      s.sz = tn ? tn.z : s.z - Math.sin(ga) * 22;
    } else if (kind === 'drop') {
      s.sx = s.x;
      s.sy = 26;
      s.sz = s.z;
    } else {
      s.sx = s.x - 14;
      s.sy = 30;
      s.sz = s.z - 6;
    }
    const ringM = s.ring.material as THREE.MeshBasicMaterial;
    ringM.color.setHex(kind === 'bolt' ? 0xffe14d : kind === 'drop' ? 0x8af04a : kind === 'debris' ? 0xffb03a : 0xff3355);
    s.ring.visible = true;
    s.ring.scale.setScalar(s.r * 0.35);
    s.ring.position.set(s.x, s.y + 0.06, s.z);
    s.rock.visible = kind !== 'bolt';
    const rm = s.rock.material as THREE.MeshStandardMaterial;
    rm.color.setHex(kind === 'drop' ? 0x8af04a : kind === 'debris' || kind === 'rock' ? 0x8a6a4a : 0xff7a2e);
    rm.emissive.setHex(kind === 'meteor' || kind === 'bomb' ? 0xff4a10 : 0x000000);
    s.rock.scale.setScalar(kind === 'drop' ? 0.45 : kind === 'debris' ? 0.6 : 1);
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
      if (s.kind !== 'drop') {
        const c = this.craters[this.craterHead++ % this.craters.length];
        c.visible = true;
        c.scale.setScalar(s.r * 0.8);
        c.position.set(s.x, s.y + 0.03, s.z);
      }
      this.puff(p, s.kind === 'drop' ? 4 : 8, 5);
      if (Math.hypot(s.x - this.me.pos.x, s.z - this.me.pos.z) < 18) {
        audio.hit();
        this.shake = Math.max(this.shake, s.kind === 'drop' ? 0.1 : 0.35);
        this.fpcam.addShake(s.kind === 'drop' ? 0.15 : 0.5);
      }
      // meteoros e bombas deixam fogo no chão (seco) por alguns segundos
      if ((s.kind === 'meteor' || s.kind === 'bomb') && s.y < 0.3 && !(this.fluid && this.fluid.level > 0.1)) {
        const fi = this.fires.find((o) => !o.on) ?? this.fires[0];
        fi.on = true;
        fi.x = s.x;
        fi.z = s.z;
        fi.r = s.r * 0.6;
        fi.t = 2 + 1.2 * this.I;
        fi.mesh.visible = true;
      }
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
      // areia: a casa só protege se a porta não estiver virada para o vento (a porta fica no lado −z)
      const sheltered = this.insideHouse(pl) && !(s.kind === 'debris' && this.active.has('areia') && Math.sin(this.gust.a) > 0.2);
      if (d < s.r * 0.7 && Math.abs(pl.pos.y - s.y) < 2.2 && !sheltered) this.knockOut(pl);
      // raio na água: quem está nadando perto leva choque
      else if (s.kind === 'bolt' && pl.swim && d < 4) this.knockOut(pl);
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
    const I = this.I;
    const f = this.fluid;
    const dis = this.phase === 'disaster';
    if (dis) this.heat = Math.min(1, this.phaseT / Math.max(1, this.phaseDur));
    const k = I * (1 + 0.55 * this.heat) * (this.training ? 0.7 : 1) * (this.sc.disasters.length > 1 ? 0.85 : 1);
    if (this.ripGrace > 0) this.ripGrace -= dt;
    // desastre duplo: o 2º começa no meio do 1º (os dois juntos)
    if (dis && this.comboAt >= 0 && this.phaseT >= this.comboAt) {
      this.comboAt = -1;
      this.dIndex = Math.min(1, this.sc.disasters.length - 1);
      const d2 = this.sc.disasters[this.dIndex];
      this.alert3('combo', t('dz.combo', 'Desastre duplo!') + ' ' + DISASTERS[d2].name() + '!');
      this.beginDisaster(d2);
      for (const pl of this.players) if (pl.bot && pl.alive) this.plan(pl, d2);
    }
    if (f) {
      if (f.dir) {
        f.front += f.speed * f.dir * dt;
        const past = f.dir > 0 ? f.front > ISLAND_R + 10 : f.front < -ISLAND_R - 10;
        if (past && this.wave.n > 0) {
          // a onda passou: recua até o que FICA (sobe a cada onda)
          const keep = f.target * (this.wave.k + 1 >= this.wave.n ? 0.9 : 0.7);
          if (f.base < keep) f.base = Math.min(keep, f.base + dt * 0.4);
          f.level = Math.max(f.base, f.level - dt * 0.35);
        }
        if (!past || this.wave.n === 0) f.level += Math.max(-0.4 * dt, Math.min(f.rate * dt * 4, f.target - f.level));
      } else f.level += Math.max(-0.4 * dt, Math.min(f.rate * dt, f.target - f.level));
      if (!Number.isFinite(f.level)) f.level = 0;
      const lv = Math.max(0.02, f.level);
      // água que ficou das ondas anteriores: lâmina na ilha toda
      const bm = this.baseMesh;
      if (f.dir && f.base > 0.05) {
        bm.visible = true;
        bm.scale.set(ISLAND_R * 2 + 6, f.base + 0.45, ISLAND_R * 2 + 6);
        bm.position.set(0, (f.base - 0.6) / 2, 0);
      } else bm.visible = false;
      if (f.dir) {
        // região coberta: atrás da frente (tsunami vem de −x; lava vem de +x) + o nível que ficou no resto
        const x0 = f.dir > 0 ? -ISLAND_R - 40 : f.front;
        const x1 = f.dir > 0 ? f.front : ISLAND_R + 40;
        const w = Math.max(0.1, x1 - x0);
        this.fluidMesh.scale.set(w, lv + 0.45, ISLAND_R * 2 + 30);
        this.fluidMesh.position.set(x0 + w / 2, (lv - 0.15 - 0.6) / 2, 0);
        this.fluidTop.scale.set(w, 1, ISLAND_R * 2 + 30);
        this.fluidTop.position.set(x0 + w / 2, lv, 0);
        for (const d of this.dyn) {
          const b = d.body;
          const near = f.dir > 0 ? b.position.x < f.front && b.position.x > f.front - 6 : b.position.x > f.front && b.position.x < f.front + 6;
          if (near && b.position.y < lv + 0.5) {
            b.wakeUp();
            b.applyForce(new CANNON.Vec3(f.dir * b.mass * 14, b.mass * 4, 0));
          }
        }
        // caldo: a frente da onda pega quem está embaixo (perde fôlego e é arrastado)
        if (dis && f.kind === 'water')
          for (const p of this.players) {
            if (!p.alive || p.hit > 0) continue;
            const u = (f.front - p.pos.x) * f.dir;
            if (u < 0 || u > 1.6 || p.pos.y > lv - 0.2) continue;
            p.hit = 1.2;
            p.air -= 0.6 * I;
            p.vel.x += f.dir * 6;
            p.vel.y = Math.max(p.vel.y, 3);
            if (p.self) {
              tap('heavy');
              this.fpcam.addShake(0.6);
            }
          }
      } else {
        this.fluidMesh.scale.set(ISLAND_R * 2 + 6, lv + 0.45, ISLAND_R * 2 + 6);
        this.fluidMesh.position.set(0, (lv - 0.15 - 0.6) / 2, 0);
        this.fluidTop.scale.set(ISLAND_R * 2 + 6, 1, ISLAND_R * 2 + 6);
        this.fluidTop.position.set(0, lv, 0);
      }
      if (f.level <= 0.01 && f.target <= 0 && f.base <= 0 && !this.wave.n) {
        this.fluid = null;
        this.fluidMesh.visible = false;
        this.baseMesh.visible = false;
      }
    }
    if (dis) {
      // ondas do tsunami
      if (this.wave.n > 0 && f && f.dir > 0 && this.wave.k + 1 < this.wave.n) {
        this.wave.next -= dt;
        if (!this.wave.warned && this.wave.next <= 2.8 * this.tele) {
          this.wave.warned = true;
          this.alertK = 'wave';
          this.alertT = 2.8 * this.tele;
          this.alert3('wave', t('dz.al.wave', 'Onda {n}!', { n: this.wave.k + 2 }));
        }
        if (this.wave.next <= 0) {
          this.wave.k++;
          this.wave.next = (this.phaseDur - 4) / this.wave.n;
          this.startWave();
        }
      }
      // pulsos: sobe, pausa, sobe mais (com aviso)
      const fd = (['enchente', 'acido', 'vulcao', 'avalanche'] as DisasterId[]).find((d) => this.active.has(d));
      if (f && fd && this.stage.k < 2) {
        this.stage.next -= dt;
        if (!this.stage.warned && this.stage.next <= 2.2 * this.tele) {
          this.stage.warned = true;
          this.alertK = fd;
          this.alertT = 2.2 * this.tele;
          this.alert3(fd, fd === 'vulcao' ? t('dz.al.lava', 'Mais lava!') : t('dz.al.rise', 'Vai subir mais!'));
        }
        if (this.stage.next <= 0) {
          this.stage.k++;
          this.stage.next = this.phaseDur * 0.28;
          this.stage.warned = false;
          f.target += this.peak3(fd) / 3;
          f.rate *= 1.2;
        }
      }
      // terremoto: tremor + 2 réplicas; cada um derruba torres e abre rachaduras
      if (this.active.has('terremoto')) {
        const P = this.pulse;
        P.t += dt;
        const period = 15;
        const plen = 5 + 1.6 * I;
        const kk = Math.floor(P.t / period);
        const inP = kk < 3 && P.t - kk * period < plen;
        if (kk !== P.k && kk < 3) {
          P.k = kk;
          P.warned = false;
          for (const d of this.dyn) {
            if (!d.heavy || this.rng() > 0.35 + 0.15 * I) continue;
            d.body.wakeUp();
            d.body.applyImpulse(new CANNON.Vec3((this.rng() - 0.5) * 60, 4, (this.rng() - 0.5) * 60));
          }
          for (let i = 0; i < 1 + Math.round(1.4 * I) + kk; i++) {
            const p = this.rng() < 0.6 ? this.pickTarget() : null;
            const a = this.rng() * Math.PI * 2;
            const rr = Math.sqrt(this.rng()) * (ISLAND_R - 4);
            this.holeAt(p ? p.pos.x + (this.rng() - 0.5) * 2 : Math.cos(a) * rr, p ? p.pos.z + (this.rng() - 0.5) * 2 : Math.sin(a) * rr, 1.5 + this.rng() * 0.8 * I, 1.7 * this.tele, 4.5 + 2 * I, 0);
          }
        }
        if (!inP && kk < 2 && P.t - kk * period > period - 1.8 * this.tele && !P.warned) {
          P.warned = true;
          this.alertK = 'terremoto';
          this.alertT = 1.8 * this.tele;
          this.alert3('terremoto', t('dz.al.quake', 'Tremor!'));
        }
        const qt = inP ? (kk === 0 ? 1 : 0.85) : 0.05;
        this.quake += (qt - this.quake) * Math.min(1, dt * 3);
        this.shake = Math.max(this.shake, inP ? this.quake * 0.25 : 0);
        if (inP) {
          for (const d of this.dyn) {
            if (Math.random() < dt * (1.5 + I * 0.6)) {
              d.body.wakeUp();
              const kq = this.quake * (d.heavy ? 18 : 3);
              d.body.applyImpulse(new CANNON.Vec3((Math.random() - 0.5) * kq, Math.random() * kq * 0.3, (Math.random() - 0.5) * kq));
            }
          }
          // pedaços caem dos telhados, mirados em quem está perto das casas
          this.tick('terremoto', dt * k, () => this.spawnStrike('rock'), 0.5);
        }
      }
      if (this.active.has('sumidouro')) {
        this.tick(
          'sumidouro',
          dt * k,
          () => {
            let cov = 0;
            for (const h of this.holes) if (h.on) cov += h.r * h.r;
            if (cov > ISLAND_R * ISLAND_R * 0.3) return;
            const p = this.pickTarget();
            const a = this.rng() * Math.PI * 2;
            const rr = Math.sqrt(this.rng()) * (ISLAND_R - 5);
            this.holeAt(p ? p.pos.x : Math.cos(a) * rr, p ? p.pos.z : Math.sin(a) * rr, 1.1, 2.8 * this.tele, 0, 0.08 + 0.06 * I);
          },
          8 - 2 * this.heat,
        );
      }
      if (this.active.has('areia')) {
        const g = this.gust;
        if (g.t > 0) {
          g.t -= dt;
          this.tick('areia', dt * k, () => this.spawnStrike('debris'), 0.32 - 0.08 * this.heat);
          if (g.t <= 0) {
            g.a += Math.PI * (0.6 + this.rng() * 0.8);
            g.next = Math.max(3, 7 - 1.4 * I) + this.rng() * 2;
            g.warned = false;
          }
        } else {
          g.next -= dt;
          if (!g.warned && g.next <= 1.8 * this.tele) {
            g.warned = true;
            this.alertK = 'areia';
            this.alertT = 1.8 * this.tele;
            this.alert3('areia', t('dz.al.gust', 'Rajada!'));
          }
          if (g.next <= 0) {
            g.t = 3 + 1.2 * I;
            // a rajada forte arranca um telhado (abrigo também é temporário)
            if (this.rng() < 0.45 + 0.15 * I) {
              const ok = this.houses.map((h, i) => (h.ripped ? -1 : i)).filter((i) => i >= 0);
              if (ok.length) this.ripRoof(ok[Math.floor(this.rng() * ok.length)]);
            }
          }
        }
      }
      if (this.active.has('meteoros') || this.active.has('meteoro')) this.tick('meteoros', dt * k, () => this.spawnStrike('meteor'), 1.15 - 0.3 * this.heat);
      if (this.active.has('raios')) this.tick('raios', dt * k, () => this.spawnStrike('bolt'), 1.5 - 0.35 * this.heat);
      if (this.active.has('enchente')) this.tick('stormbolt', dt * k, () => this.spawnStrike('bolt', true), 9 - 2 * this.heat);
      if (this.active.has('vulcao')) this.tick('vulcao', dt * k, () => this.spawnStrike('bomb'), 3.6 - 0.9 * this.heat);
      if (this.active.has('acido')) this.tick('acido', dt * k, () => this.spawnStrike('drop'), 3.2 - 0.8 * this.heat);
      if (this.active.has('avalanche')) this.tick('avalanche', dt * k, () => this.spawnStrike('rock'), 4.6 - 1.2 * this.heat);
      if (this.active.has('avalanche')) this.wind = Math.sin(this.time * 0.7) > 0.3 ? this.windDir * (1.6 + 0.3 * I) : 0;
      // moedas no meio do desastre
      this.tick('coin', dt, () => this.spawnCoin(), 3.2);
    }
    // buracos
    for (const h of this.holes) {
      if (!h.on) continue;
      const m = h.mesh.material as THREE.MeshBasicMaterial;
      if (h.warn > 0) {
        h.warn -= dt;
        m.color.setHex(Math.sin(this.time * 22) > 0 ? 0xff3355 : 0x2a1a3a);
        m.opacity = 0.55;
        if (h.warn <= 0) {
          this.puff(this.tmpV.set(h.x, 0.2, h.z), 8, 4);
          audio.crack();
          this.shake = Math.max(this.shake, 0.3);
          // o que está em cima afunda junto
          for (const d of this.dyn) if (Math.hypot(d.body.position.x - h.x, d.body.position.z - h.z) < h.r + 0.6) d.body.wakeUp();
        }
      } else {
        m.color.setHex(0x140c1c);
        m.opacity = 1;
        if (h.grow > 0 && h.r < 3.5) h.r += h.grow * dt;
        h.life -= h.life > 0 ? dt : 0;
        if (h.life < 0) {
          h.on = false;
          h.mesh.visible = false;
        }
      }
      h.mesh.scale.setScalar(h.r);
      h.mesh.position.set(h.x, 0.04, h.z);
    }
    // fogo no chão
    for (const fi of this.fires) {
      if (!fi.on) continue;
      fi.t -= dt;
      if (fi.t <= 0) {
        fi.on = false;
        fi.mesh.visible = false;
        continue;
      }
      const fl2 = 0.6 + 0.4 * Math.sin(this.time * 17 + fi.x);
      fi.mesh.scale.set(fi.r, (0.5 + 0.4 * fl2) * Math.min(1, fi.t), fi.r);
      fi.mesh.position.set(fi.x, 0.25, fi.z);
    }
    for (const c of this.coins) {
      if (!c.on) continue;
      c.t -= dt;
      c.mesh.rotation.z += dt * 3;
      c.mesh.position.y = c.y + Math.sin(this.time * 3 + c.x) * 0.15;
      if (c.t <= 0) {
        c.on = false;
        c.mesh.visible = false;
      }
    }
    if (this.alertT > 0) this.alertT -= dt;
    // tornado(s)
    if (this.active.has('tornado') && dis && !this.tornado2.on && I >= 1.12 && this.phaseT > this.phaseDur * 0.4 && !this.training) {
      const t2 = this.tornado2;
      t2.on = true;
      t2.x = -this.tornado.x;
      t2.z = -Math.sign(this.tornado.z || 1) * (ISLAND_R + 6);
      t2.tgt = -1;
      t2.tgtT = 0;
      if (!this.tornado2Mesh) {
        this.tornado2Mesh = this.tornadoMesh.clone();
        this.scene.add(this.tornado2Mesh);
      }
      this.tornado2Mesh.visible = true;
      this.alert3('tornado', t('dz.al.tornado2', 'Outro tornado!'));
    }
    const tn = this.tornado;
    if (tn.on) {
      this.twister3(tn, dt, false);
      this.tornadoMesh.position.set(tn.x, 0, tn.z);
      if (dis) this.tick('tornado', dt * k, () => this.spawnStrike('debris'), 4.6 - 1.2 * this.heat);
    }
    if (this.tornado2.on && this.tornado2Mesh) {
      this.twister3(this.tornado2, dt, true);
      this.tornado2Mesh.position.set(this.tornado2.x, 0, this.tornado2.z);
    }
    // golpes
    for (const s of this.strikes) {
      if (!s.on) continue;
      s.t -= dt;
      const kk = 1 - Math.max(0, s.t) / s.T;
      const m = s.ring.material as THREE.MeshBasicMaterial;
      m.opacity = 0.45 + 0.4 * Math.abs(Math.sin(this.time * 10));
      // o anel cheio cresce até a hora do impacto (dá para ler quanto falta)
      s.ring.scale.setScalar(s.r * (0.35 + 0.65 * kk));
      if (s.kind !== 'bolt') {
        const arc = s.kind === 'bomb' ? Math.sin(kk * Math.PI) * 10 : s.kind === 'debris' ? Math.sin(kk * Math.PI) * 1.5 : 0;
        s.rock.position.set(s.sx + (s.x - s.sx) * kk, s.sy + (s.y - s.sy) * kk + arc, s.sz + (s.z - s.sz) * kk);
        s.rock.rotation.x += dt * 5;
      }
      if (s.t <= 0) this.impact(s);
    }
    if (this.boltT > 0) {
      this.boltT -= dt;
      if (this.boltT <= 0) this.bolt.visible = false;
    }
  }
  private alertK: DzIcon = 'wave';
  private alertT = 0;

  /** um tornado: persegue um jogador (com inércia), arranca telhados, puxa escombros */
  private twister3(tn: { x: number; z: number; vx: number; vz: number }, dt: number, second: boolean): void {
    const I = this.I;
    let tgt = second ? this.tornado2.tgt : this.tgt1;
    let tT = (second ? this.tornado2.tgtT : this.tgt1T) - dt;
    if (tT <= 0 || tgt < 0 || !this.players[tgt]?.alive) {
      tT = 3 + this.rng() * 3;
      const p = this.pickTarget();
      tgt = p ? this.players.indexOf(p) : -1;
    }
    if (second) {
      this.tornado2.tgt = tgt;
      this.tornado2.tgtT = tT;
    } else {
      this.tgt1 = tgt;
      this.tgt1T = tT;
    }
    const tp = tgt >= 0 ? this.players[tgt] : null;
    const max = (1.9 + 1.1 * I) * (1 + 0.25 * this.heat) * (this.training ? 0.75 : 1);
    const dx = (tp ? tp.pos.x : 0) - tn.x;
    const dz = (tp ? tp.pos.z : 0) - tn.z;
    const d = Math.hypot(dx, dz) || 1;
    tn.vx += ((dx / d) * max - tn.vx) * Math.min(1, dt * 0.9);
    tn.vz += ((dz / d) * max - tn.vz) * Math.min(1, dt * 0.9);
    tn.x += tn.vx * dt;
    tn.z += tn.vz * dt;
    const r = Math.hypot(tn.x, tn.z);
    if (r > ISLAND_R + 8) {
      tn.x *= (ISLAND_R + 8) / r;
      tn.z *= (ISLAND_R + 8) / r;
    }
    if (this.phase === 'disaster')
      for (let i = 0; i < this.houses.length; i++) {
        const h = this.houses[i];
        if (h.ripped || Math.abs(tn.x - h.x) > h.w / 2 + 1 || Math.abs(tn.z - h.z) > h.d / 2 + 1) continue;
        this.ripCD[i] = (this.ripCD[i] || 0) + dt * I;
        if (this.ripCD[i] > 2.2) this.ripRoof(i);
      }
    for (const dd of this.dyn) {
      const b = dd.body;
      const ex = tn.x - b.position.x;
      const ez = tn.z - b.position.z;
      const dist = Math.hypot(ex, ez);
      if (dist < 10) {
        b.wakeUp();
        const kf = b.mass * (1 - dist / 10) * (dd.heavy ? 14 : 30);
        b.applyForce(new CANNON.Vec3((ex / (dist || 1)) * kf - (ez / (dist || 1)) * kf, kf * (b.position.y < 8 ? 0.9 : -0.2), (ez / (dist || 1)) * kf + (ex / (dist || 1)) * kf));
      }
    }
  }

  private spawnCoin(): void {
    const c = this.coins.find((o) => !o.on);
    if (!c) return;
    let x: number;
    let z: number;
    const s = this.strikes.find((o) => o.on);
    if (s && this.rng() < 0.5) {
      x = s.x + (this.rng() - 0.5) * s.r;
      z = s.z + (this.rng() - 0.5) * s.r;
    } else if (this.highSpots.length && this.rng() < 0.5) {
      const h = this.highSpots[Math.floor(this.rng() * this.highSpots.length)];
      x = h.x + (this.rng() - 0.5) * 2;
      z = h.z + (this.rng() - 0.5) * 2;
    } else {
      const a = this.rng() * Math.PI * 2;
      const rr = Math.sqrt(this.rng()) * (ISLAND_R - 4);
      x = Math.cos(a) * rr;
      z = Math.sin(a) * rr;
    }
    c.on = true;
    c.x = x;
    c.z = z;
    c.y = Math.max(this.topAt(x, z), this.fluid ? this.fluid.level : 0) + 0.7;
    c.t = 7;
    c.mesh.visible = true;
    c.mesh.position.set(x, c.y, z);
  }

  /* ------------------------------ física do Bloop ------------------------------ */

  /** chão mais alto em (x,z) abaixo de fromY (estáticos, rampas, corpos) */
  topAt(x: number, z: number, fromY = 1e9): number {
    const hole = this.inHole(x, z);
    let best = !hole && Math.abs(x) < ISLAND_R && Math.abs(z) < ISLAND_R && Math.hypot(x, z) < ISLAND_R ? 0 : -6;
    const all = [this.statics, this.dynBoxes];
    for (const arr of all)
      for (const b of arr) {
        if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
        if (hole && b.ground) continue;
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
      const lo = [b.x0 - 0.35, b.y0, b.z0 - 0.35];
      const hi = [b.x1 + 0.35, b.y1 + 0.3, b.z1 + 0.35];
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
      if (h.ripped) continue;
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
    // água: nada devagar, boia, fôlego (src: docs/DISASTER-DESIGN.md §4)
    const f = this.fluid;
    const wl = f && f.kind === 'water' && (!f.dir || (f.dir > 0 ? p.pos.x < f.front : p.pos.x > f.front) || f.base > 0.05) ? (f.dir && (f.dir > 0 ? p.pos.x >= f.front : p.pos.x <= f.front) ? f.base : f.level) : -99;
    const depth = wl - p.pos.y;
    if (!p.swim && depth > 0.75 && !p.climbing) {
      p.swim = true;
      if (p.self) notify(t('dz.swim', 'Nade! Pule para sair da água.'), { key: 'dz-hint', ms: 2200 });
    } else if (p.swim && (depth < 0.15 || p.climbing)) p.swim = false;
    const runK = p.swim ? 0.55 : 1;
    if (p.self && !frozen) {
      // você: o andar do kit compartilhado (aceleração/frenagem exponencial da Cozinha) — docs/FPKIT.md
      const fpc = this.fpc;
      fpc.vx = p.vel.x;
      fpc.vz = p.vel.z;
      fpc.grounded = p.onGround || p.swim;
      fpc.tune.speed = RUN * runK;
      fpc.tune.accel = 10 * slip;
      fpc.tune.decel = 13 * slip;
      // mx/mz já estão no mundo: converte para o referencial do kit (frente = −sin(yaw'), −cos(yaw'))
      const ky = this.yaw + Math.PI;
      const fx = -Math.sin(ky);
      const fz = -Math.cos(ky);
      const rx = Math.cos(ky);
      const rz = -Math.sin(ky);
      fpc.steer(dt, mx * rx + mz * rz, mx * fx + mz * fz, ky);
      p.vel.x = fpc.vx;
      p.vel.z = fpc.vz;
      fpc.speedK = Math.min(1, Math.hypot(fpc.vx, fpc.vz) / RUN) * (p.onGround ? 1 : 0.3);
    } else {
      const acc = (p.onGround ? 40 : 22) * slip;
      const tx = mx * RUN * runK;
      const tz = mz * RUN * runK;
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
    }
    if (Math.hypot(p.vel.x, p.vel.z) < 0.6 && (p.onGround || p.swim)) p.idle += dt;
    else p.idle = Math.max(0, p.idle - dt * 2);
    // rajada de areia (fora de casa)
    if (this.gust.t > 0 && !this.insideHouse(p)) {
      p.vel.x += Math.cos(this.gust.a) * (3 + 1.5 * this.I) * dt * (p.onGround ? 1 : 1.5);
      p.vel.z += Math.sin(this.gust.a) * (3 + 1.5 * this.I) * dt * (p.onGround ? 1 : 1.5);
    }
    if (Math.hypot(mx, mz) > 0.1) p.face = Math.atan2(mx, mz);
    if (this.wind) p.vel.x += this.wind * dt * (p.onGround ? 0.8 : 1.4);
    if (this.quake > 0 && p.onGround) {
      p.vel.x += (Math.random() - 0.5) * 30 * this.quake * dt;
      p.vel.z += (Math.random() - 0.5) * 30 * this.quake * dt;
    }
    for (const tn of [this.tornado, this.tornado2]) {
      if (!tn.on || this.insideHouse(p)) continue;
      const dx = tn.x - p.pos.x;
      const dz = tn.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 12) {
        const k = (1 - d / 12) * (8 + 4 * this.I) * dt;
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
    if (p.swim && pressed && depth < 1.1) {
      // pulo para fora d'água
      p.vel.y = JUMP_V * 0.85;
      p.swim = false;
      p.jhold = MIN_HOLD;
      if (p.self) audio.jump();
    } else if ((pressed || (p.jbuf > 0 && p.coyote > 0)) && !frozen && (p.coyote > 0 || p.climbing)) {
      p.vel.y = JUMP_V;
      p.coyote = 0;
      p.jbuf = 0;
      p.jhold = MIN_HOLD;
      p.climbing = false;
      p.onGround = false;
      p.sq = -0.35;
      if (p.self) audio.jump();
    }
    if (p.swim) p.vel.y += (-(p.pos.y - (wl - 0.55)) * 14 - p.vel.y * 3) * dt;
    else if (!p.climbing) {
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
    const hole = this.inHole(p.pos.x, p.pos.z, 0.25);
    for (const arr of lists)
      for (const b of arr) {
        if (!this.overlap(p.pos, b)) continue;
        if (hole && b.ground) continue;
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
        if (b.oneWay || b.ground || !this.overlap(p.pos, b)) continue;
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
    if (p.hit > 0) p.hit -= dt;
    // nadando: fôlego acaba = eliminado
    if (p.swim) {
      p.air -= dt / (6 / this.I + (this.training ? 4 : 0));
      if (p.air <= 0) {
        this.knockOut(p);
        return;
      }
    } else if (p.air < 1 && (p.onGround || p.climbing)) p.air = Math.min(1, p.air + dt * 0.45);
    // caiu num buraco
    if (p.pos.y < -0.6 && this.inHole(p.pos.x, p.pos.z)) {
      this.knockOut(p);
      return;
    }
    // fogo no chão
    let burn = false;
    for (const fi of this.fires) if (fi.on && Math.hypot(p.pos.x - fi.x, p.pos.z - fi.z) < fi.r && p.pos.y < 0.4) burn = true;
    p.burn = burn ? p.burn + dt : 0;
    if (p.burn > 0.45) {
      this.knockOut(p);
      return;
    }
    // moedas
    if (p.self)
      for (const c of this.coins) {
        if (!c.on || Math.hypot(p.pos.x - c.x, p.pos.z - c.z) > 0.9 || Math.abs(p.pos.y + 0.5 - c.y) > 1.2) continue;
        c.on = false;
        c.mesh.visible = false;
        this.held++;
        audio.coin(1);
      }
    if (f && f.level > 0.25 && f.kind !== 'water') {
      const covered = f.dir ? (f.dir > 0 ? p.pos.x < f.front : p.pos.x > f.front) : true;
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
    if (this.ripGrace > 0 && this.insideHouseIdx(p) === this.ripHouse) return;
    const tn = this.tornado;
    if (tn.on && Math.hypot(p.pos.x - tn.x, p.pos.z - tn.z) < tn.r * 0.6 && !this.insideHouse(p)) this.knockOut(p);
    const t2 = this.tornado2;
    if (t2.on && Math.hypot(p.pos.x - t2.x, p.pos.z - t2.z) < tn.r * 0.6 && !this.insideHouse(p)) this.knockOut(p);
  }

  private knockOut(p: P3): void {
    if (!p.alive) return;
    p.alive = false;
    p.swim = false;
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
    const hs = this.highSpots.filter((s) => s.house < 0 || !this.houses[s.house].ripped);
    if (water && hs.length) {
      const s = hs[Math.floor(r() * hs.length)];
      b.tx = s.x + (r() - 0.5) * 2;
      b.tz = s.z + (r() - 0.5) * 2;
      b.high = true;
      b.house = s.house;
    } else if ((d === 'tornado' || d === 'areia') && this.houses.some((h) => !h.ripped)) {
      const ok = this.houses.map((h, i) => (h.ripped ? -1 : i)).filter((i) => i >= 0);
      const i = ok[Math.floor(r() * ok.length)];
      const h = this.houses[i];
      b.tx = h.x + (r() - 0.5) * 1.5;
      b.tz = h.z + (r() - 0.5) * 1.2;
      b.high = false;
      b.house = -2 - i;
    } else {
      // aberto e longe de buracos
      let s = this.openSpots[Math.floor(r() * this.openSpots.length)];
      for (let k = 0; k < 4 && this.holes.some((h) => h.on && Math.hypot(h.x - s.x, h.z - s.z) < h.r + 2.5); k++) s = this.openSpots[Math.floor(r() * this.openSpots.length)];
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
      // reage com atraso (menos habilidade = mais tarde)
      // e às vezes nem vê (decidido uma vez por golpe: criança distraída)
      const seen = Math.abs(Math.sin(s.x * 12.9898 + s.z * 78.233 + b.lazy * 37.7) * 43758.5453) % 1 < 0.75 + 0.2 * b.skill;
      if (seen && d < s.r + 1.2 && s.T - s.t > (1 - b.skill) * s.T * 0.85) {
        tx = p.pos.x + (dx / (d || 1)) * 4;
        tz = p.pos.z + (dz / (d || 1)) * 4;
      }
    }
    // buraco avisando/aberto ou fogo perto: sai de lado
    for (const h of this.holes) {
      if (!h.on) continue;
      const hx = p.pos.x - h.x;
      const hz = p.pos.z - h.z;
      const hd = Math.hypot(hx, hz);
      if (hd < h.r + 1.4 && Math.random() < b.skill + 0.3) {
        tx = p.pos.x + (hx / (hd || 1)) * 4;
        tz = p.pos.z + (hz / (hd || 1)) * 4;
      }
    }
    for (const fi of this.fires) {
      if (!fi.on) continue;
      const fd = Math.hypot(p.pos.x - fi.x, p.pos.z - fi.z);
      if (fd < fi.r + 1) {
        tx = p.pos.x + ((p.pos.x - fi.x) / (fd || 1)) * 3;
        tz = p.pos.z + ((p.pos.z - fi.z) / (fd || 1)) * 3;
      }
    }
    // a casa perdeu o telhado: replaneja
    if (b.house <= -2 && this.houses[-2 - b.house]?.ripped) this.plan(p, this.sc.disasters[this.dIndex]);
    if (this.tornado2.on && !this.insideHouse(p)) {
      const ex = p.pos.x - this.tornado2.x;
      const ez = p.pos.z - this.tornado2.z;
      const ed = Math.hypot(ex, ez);
      if (ed < 9) {
        tx = p.pos.x + (ex / (ed || 1)) * 6;
        tz = p.pos.z + (ez / (ed || 1)) * 6;
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
      // buraco no caminho: contorna (gira 90°)
      if (this.inHole(p.pos.x + c.mx * 1.4, p.pos.z + c.mz * 1.4, -0.7)) {
        const mx0 = c.mx;
        c.mx = -c.mz;
        c.mz = mx0;
      }
    }
    // obstáculo à frente (degrau alto/caixa): pula
    if (p.onGround && d > 0.6) {
      const ax = p.pos.x + (dx / d) * 0.6;
      const az = p.pos.z + (dz / d) * 0.6;
      const top = this.topAt(ax, az, p.pos.y + 1.6);
      if (top - p.pos.y > 0.35 && top - p.pos.y < 1.4) c.tap = true;
    }
    if (p.swim && Math.random() < 0.15 + b.skill * 0.3) c.tap = true;
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
      // em 1ª pessoa o seu Bloop de papel some (você é a câmera); em 3ª ele aparece
      p.mesh.visible = !(p.self && this.fp && p.alive);
      // PAPER
      if (p.paper && p.mesh.visible) p.paper.update(dt, this.camera, { yaw: p.mesh.rotation.y, speed: p.onGround ? Math.hypot(p.vel.x, p.vel.z) : 0, act: -1, hurt: !p.alive || p.sq > 0.5, happy: !p.onGround && p.alive });
    }
    // câmera: 1ª pessoa (padrão, com o balanço/tremor do kit) → 3ª atrás → 3ª de frente (botão no topo)
    const m = this.me;
    const cam = this.camera;
    const look = 0.35 - this.pitch;
    if (this.fp && m.alive) {
      const fc = this.fpcam;
      fc.yaw = this.yaw + Math.PI;
      fc.pitch = Math.max(-1.2, Math.min(1.2, look));
      fc.addShake(this.shake * 0.8);
      fc.apply(cam, dt, { x: m.pos.x, z: m.pos.z, y: m.pos.y, speedK: this.fpc.speedK, grounded: m.onGround });
    } else {
      // morto (fantasminha) em 1ª pessoa: vê de 3ª pessoa para assistir
      const mode = this.cv.mode;
      if (mode === 'fp') this.cv.mode = 'tp';
      this.cv.pose(
        {
          x: m.pos.x,
          y: m.pos.y,
          z: m.pos.z,
          yaw: this.yaw,
          pitch: look,
          eye: 1.0,
          dist: 7.5,
          smooth: 0.12,
          dt,
          block: (x0, y0, z0, x1, y1, z1) => this.rayBoxes(x0, y0, z0, x1 - x0, y1 - y0, z1 - z0),
        },
        cam,
      );
      this.cv.mode = mode;
      if (this.shake > 0 && this.q.shake) {
        cam.position.x += (Math.random() - 0.5) * this.shake;
        cam.position.y += (Math.random() - 0.5) * this.shake;
      }
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
    this.fx(dt);
    this.sky.position.copy(cam.position);
    this.renderer.render(this.scene, cam);
  }

  /** água com ondas e espuma, mar, funil do tornado e luz de tempestade (só visual) */
  private fx(dt: number): void {
    const t = this.time;
    const f = this.fluid;
    this.fluidTop.visible = !!f && this.fluidMesh.visible;
    if (f && this.fluidTop.visible) {
      const g = this.fluidTop.geometry;
      const pos = g.getAttribute('position') as THREE.BufferAttribute;
      const col = g.getAttribute('color') as THREE.BufferAttribute;
      const pa = pos.array as Float32Array;
      const ca = col.array as Float32Array;
      const sx = this.fluidTop.scale.x;
      const sz = this.fluidTop.scale.z;
      const cx = this.fluidTop.position.x;
      const cz = this.fluidTop.position.z;
      const kind = f.kind;
      const amp = kind === 'water' ? 0.14 : kind === 'goo' ? 0.09 : kind === 'lava' ? 0.07 : 0.03;
      const sp = kind === 'lava' || kind === 'goo' ? 0.45 : 1;
      const base = this.fluidCol.set(kind === 'water' ? 0x2f8fe8 : kind === 'goo' ? 0x74d64a : kind === 'lava' ? 0xff5a10 : 0xf2f6ff);
      const lvl = Math.max(0.05, f.level);
      for (let i = 0, n = pos.count; i < n; i++) {
        const wx = cx + pa[i * 3] * sx;
        const wz = cz + pa[i * 3 + 2] * sz;
        let y = amp * (Math.sin(0.55 * wx + 1.6 * t * sp) + 0.6 * Math.sin(0.8 * wz - 1.2 * t * sp + wx * 0.2) + 0.3 * Math.sin(1.7 * (wx + wz) + 2.3 * t * sp));
        let foam = kind === 'water' ? Math.max(0, (y / amp - 1.0) * 0.8) : 0;
        if (f.dir) {
          const df = f.front - wx;
          if (df >= 0 && df < 8) {
            const k = Math.exp(-df / 1.8);
            y += Math.min(1.2, lvl * 0.5 + 0.3) * k;
            foam += k * 1.2;
          }
        }
        pa[i * 3 + 1] = y;
        const r = base.r;
        let gg = base.g;
        let b = base.b;
        if (kind === 'lava') {
          const hot = 0.5 + 0.5 * Math.sin(wx * 0.7 + t * 1.3) * Math.sin(wz * 0.6 - t);
          gg += hot * 0.35;
          b += hot * 0.05;
        }
        foam = Math.min(1, foam);
        ca[i * 3] = r + (1 - r) * foam;
        ca[i * 3 + 1] = gg + (1 - gg) * foam;
        ca[i * 3 + 2] = b + (1 - b) * foam;
      }
      pos.needsUpdate = true;
      col.needsUpdate = true;
      const fm = this.fluidTop.material as THREE.MeshStandardMaterial;
      fm.emissive.setHex(kind === 'lava' ? 0xff3a00 : 0x000000);
      fm.emissiveIntensity = kind === 'lava' ? 0.7 : 0;
      fm.opacity = kind === 'water' ? 0.88 : 1;
    }
    // mar perto da ilha
    {
      const pos = this.sea2.geometry.getAttribute('position') as THREE.BufferAttribute;
      const pa = pos.array as Float32Array;
      for (let i = 0, n = pos.count; i < n; i++) {
        const x = pa[i * 3];
        const z = pa[i * 3 + 2];
        pa[i * 3 + 1] = 0.2 * Math.sin(0.25 * x + t * 0.9) + 0.14 * Math.sin(0.33 * z - t * 0.7 + x * 0.05);
      }
      pos.needsUpdate = true;
    }
    // tornado: partículas sobem girando num funil + escombros orbitando
    if (this.tornadoMesh.visible) {
      const pos = this.tnPts.geometry.getAttribute('position') as THREE.BufferAttribute;
      const pa = pos.array as Float32Array;
      for (let i = 0; i < this.tnH.length; i++) {
        let h = this.tnH[i] + dt * (0.16 + (i % 3) * 0.07);
        if (h > 1) h -= 1;
        this.tnH[i] = h;
        const a = (this.tnA[i] += dt * (7.5 - h * 4));
        const dust = i % 6 === 0;
        const rad = dust ? 1.8 + h * 3 : 0.45 + h * h * 5.6 + Math.sin(i * 1.7 + t * 3) * 0.25;
        pa[i * 3] = Math.cos(a) * rad;
        pa[i * 3 + 1] = dust ? h * 1.6 : h * 17;
        pa[i * 3 + 2] = Math.sin(a) * rad;
      }
      pos.needsUpdate = true;
      for (const d of this.tnDebris) {
        const u = d.userData as { h: number; a: number; s: number };
        u.a += dt * u.s * 2;
        u.h += dt * 0.06;
        if (u.h > 1) u.h -= 1;
        const rr = 1 + u.h * 4.5;
        d.position.set(Math.cos(u.a) * rr, 0.8 + u.h * 13, Math.sin(u.a) * rr);
        d.rotation.x += dt * 4;
        d.rotation.y += dt * 3;
      }
    }
    // luz de tempestade: escurece no alerta/desastre; nevasca fecha a neblina; raio clareia
    const target = this.phase === 'warn' || this.phase === 'disaster' ? 1 : 0;
    this.storm += (target - this.storm) * Math.min(1, dt * 0.8);
    const fog = this.scene.fog as THREE.Fog | null;
    if (fog) {
      fog.color.copy(this.fogCalm).lerp(this.fogStorm, this.storm * (this.active.has('avalanche') ? 0.25 : 0.55));
      const bl = this.active.has('avalanche') ? 1 : 0;
      fog.near = 45 - bl * 33;
      fog.far = 170 - bl * 105;
    }
    const flash = this.boltT > 0 ? 1.2 : 0;
    this.hemi.intensity = 1.15 - this.storm * 0.35 + flash;
    this.sun.intensity = 1.6 - this.storm * 0.75;
    (this.sky.material as THREE.MeshBasicMaterial).color.setScalar(1 - this.storm * 0.45 + flash * 0.3);
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
    const mid = this.phase === 'disaster' && this.alertT > 0;
    const left = mid ? this.alertT : this.phase === 'warn' ? this.phaseDur - this.phaseT : this.phase === 'prepare' ? this.phaseDur - this.phaseT + 3 : 99;
    const show = left <= 6 && left > 0;
    const d = this.sc.disasters[Math.min(this.dIndex, this.sc.disasters.length - 1)];
    const ic: DzIcon = mid ? this.alertK : d;
    const key = show ? ic : '';
    if (key !== this.warnKey) {
      this.warnKey = key;
      this.warnEl.classList.toggle('on', show);
      this.phaseEl.style.visibility = show ? 'hidden' : '';
      // o chip de objetivo (canto direito) cruzaria o cartão em retrato: sai durante o alerta
      if (show) objective(null);
      else if (this.phase === 'disaster') objective(DISASTERS[d].hint(), { icon: 'warning' });
      if (show) {
        (this.warnEl.querySelector('.di') as HTMLElement).innerHTML = dzIcon(ic, 50);
        const water = ic === 'enchente' || ic === 'acido' || ic === 'tsunami' || ic === 'vulcao' || ic === 'avalanche' || ic === 'wave';
        (this.warnEl.querySelector('.safe') as HTMLElement).innerHTML = ic === 'tornado' || ic === 'areia' ? dzIcon('house', 32) : water ? icon('arrow-up', { size: 32 }) : '';
      }
    }
    if (show) this.warnNum.textContent = String(Math.ceil(left));
    const from = show ? (mid ? (this.alertK === 'wave' ? Math.PI : this.alertK === 'areia' ? this.gust.a + Math.PI : NaN) : this.hazardFrom(d)) : NaN;
    this.dirEl.classList.toggle('on', Number.isFinite(from));
    if (Number.isFinite(from)) {
      // ângulo da origem no mundo → relativo à câmera
      const wx = Math.cos(from);
      const wz = Math.sin(from);
      const fx = Math.sin(this.yaw);
      const fz = Math.cos(this.yaw);
      const fwd = wx * fx + wz * fz;
      const right = wx * -fz + wz * fx;
      const ang = Math.atan2(right, fwd);
      // dentro do cartão: a seta aponta para o lado de onde o desastre vem (para cima = em frente)
      const ar = this.dirEl.firstElementChild as HTMLElement;
      ar.style.transform = `rotate(${ang}rad)`;
    }
    // fôlego (nadando) e moedas na mão
    const me = this.me;
    this.airEl.classList.toggle('on', me.alive && me.swim);
    if (me.swim) {
      this.airFill.style.width = Math.max(0, me.air * 100).toFixed(0) + '%';
      this.airEl.classList.toggle('low', me.air < 0.35);
    }
    if (this.heldEl.hidden !== this.held <= 0) this.heldEl.hidden = this.held <= 0;
    const hs = String(this.held);
    if (this.held > 0 && this.heldEl.lastElementChild!.textContent !== hs) this.heldEl.lastElementChild!.textContent = hs;
    this.edgeTick();
  }

  /** setas na borda da tela apontando para ameaças FORA da vista (1ª pessoa principalmente) */
  private edgeV = new THREE.Vector3();
  private edgeTick(): void {
    const els = this.edge;
    let n = 0;
    const me = this.me;
    const cam = this.camera;
    const W = this.root.clientWidth || window.innerWidth;
    const H = this.root.clientHeight || window.innerHeight;
    const add = (x: number, y: number, z: number, ic: DzIcon, urg: number) => {
      if (n >= els.length) return;
      const v = this.edgeV.set(x, y, z);
      // dentro da tela (e na frente): o marcador no chão já basta
      v.project(cam);
      const behind = v.z > 1;
      if (!behind && Math.abs(v.x) < 0.92 && Math.abs(v.y) < 0.9) return;
      // direção na tela (atrás = espelha)
      let sx = behind ? -v.x : v.x;
      let sy = behind ? -v.y : v.y;
      if (behind && Math.abs(sx) < 0.2 && Math.abs(sy) < 0.2) sy = -1;
      const a = Math.atan2(-sy, sx);
      const rx = W / 2 - 40;
      const ry = H / 2 - 46;
      const k = Math.min(rx / Math.max(1e-3, Math.abs(Math.cos(a)) * rx), ry / Math.max(1e-3, Math.abs(Math.sin(a)) * ry));
      const px = W / 2 + Math.cos(a) * rx * Math.min(1, k);
      const py = H / 2 + Math.sin(a) * ry * Math.min(1, k);
      const el = els[n];
      const key = ic + (urg > 0.66 ? '!' : '');
      if (this.edgeKey[n] !== key) {
        this.edgeKey[n] = key;
        (el.lastElementChild as HTMLElement).innerHTML = dzIcon(ic, 30);
      }
      el.classList.add('on');
      // pulsa mais rápido quanto mais perto do impacto (sem animação CSS: barato e confiável)
      const pulse = 1 + (0.08 + 0.12 * urg) * Math.sin(this.time * (8 + 10 * urg));
      el.style.transform = `translate(${px.toFixed(0)}px,${py.toFixed(0)}px) scale(${pulse.toFixed(3)})`;
      (el.firstElementChild as HTMLElement).style.transform = `rotate(${(a + Math.PI / 2).toFixed(3)}rad) translateY(-12px)`;
      el.style.opacity = String(0.8 + 0.2 * urg);
      n++;
    };
    if (me.alive && (this.phase === 'disaster' || this.phase === 'warn')) {
      // golpes mais perto do fim primeiro
      for (const s of this.strikes) {
        if (!s.on || Math.hypot(s.x - me.pos.x, s.z - me.pos.z) > 16) continue;
        const ic: DzIcon = s.kind === 'bolt' ? 'raios' : s.kind === 'bomb' ? 'vulcao' : s.kind === 'drop' ? 'acido' : s.kind === 'debris' ? (this.active.has('areia') ? 'areia' : 'tornado') : s.kind === 'rock' ? 'terremoto' : 'meteoros';
        add(s.x, s.y + 0.5, s.z, ic, 1 - s.t / s.T);
      }
      for (const tn of [this.tornado, this.tornado2]) if (tn.on && Math.hypot(tn.x - me.pos.x, tn.z - me.pos.z) < 22) add(tn.x, 2, tn.z, 'tornado', 0.9);
      const f = this.fluid;
      if (f && f.dir) {
        const ahead = (f.front - me.pos.x) * -f.dir;
        if (ahead > 0 && ahead < 26) add(f.front, 1, me.pos.z, f.kind === 'lava' ? 'vulcao' : 'wave', 1 - ahead / 26);
      }
      for (const h of this.holes) if (h.on && h.warn > 0 && Math.hypot(h.x - me.pos.x, h.z - me.pos.z) < 10) add(h.x, 0, h.z, this.active.has('sumidouro') ? 'sumidouro' : 'terremoto', 0.8);
      if (this.gust.t > 0 || (this.gust.warned && this.active.has('areia'))) add(me.pos.x - Math.cos(this.gust.a) * 20, 1, me.pos.z - Math.sin(this.gust.a) * 20, 'areia', 0.7);
    }
    for (let i = n; i < els.length; i++) els[i].classList.remove('on');
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
