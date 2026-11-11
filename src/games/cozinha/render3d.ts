/* ============================================================
 *  COZINHA MALUCA — 3D EM PRIMEIRA PESSOA (chunk sob demanda).
 *  Você é o chef: mão 2D na tela (mesma da casa 3D), joystick + olhar,
 *  ingredientes de verdade que você PEGA, CARREGA, SOLTA e JOGA (cannon-es).
 *  Mesma Sim do 2D: a simulação é dona de pedidos/estações/tempos; esta
 *  camada é dona dos objetos físicos soltos e traduz "o tomate caiu na
 *  panela" em ações da Sim (placeInto / pick / act).
 *  Caos: fogo que espalha, pratos que quebram, barco que balança, gravidade
 *  baixa no espaço, buracos no food truck, chão molhado, colegas que pegam
 *  no ar (ou não).
 * ============================================================ */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { QualityGovernor, detectInitialTier, loadMode, type QualitySettings, type Tier } from '../../core/quality';
import { t } from '../../i18n';
import { gameFont } from '../../i18n/font';
import { drawEmoteBubble } from '../../social/emotes';
import { Hand, handColors } from '../../3d/common/hand';
import { Particles, PT } from '../../3d/common/particles';
import { q3For, type Q3 } from '../../3d/common/quality';
import { sfx } from '../../3d/common/sfx';
import { roomEnv } from '../../3d/common/pbr';
import { ensureCss, el } from '../../home3d/ui';
import { notify } from '../../ui/notify';
import { FpsControls } from '../../ui/touch';
import {
  AimPicker, Beacon, HandButtons, Hesitation, HoverHighlight, Rescuer, SnapGlows, TicketPrinter, disposeStickers, feedback, resolveVerb, wallScreen,
  type AimTarget, type Control, type RescueState, type VerbDef, type VerbRule,
} from '../../3d/common/interact';
import { ING_INDEX, INGS, RECIPES, compIng, ingName } from './data';
import { blitIng, charSprite, drawPetIcon } from './art';
import { buildKitchen, H, HATCH_TOP, restY, T, WALL_H, type KitchenBuild } from './fps-kitchen';
import { GK, Items3D } from './fps-items';
import { FRIDGE_H, KitchenProps, type StProps } from './fps-props';
import { drawScreen, drawTicket } from './fps-tickets';
import { Render2D } from './render2d';
import { COOKERS, FX, IK, type FxEv, type Item, type Player, type Sim, type Station } from './sim';
import type { Renderer } from './game';

/**
 * Aquecimento: um quadro com o culling desligado sobe TODAS as geometrias e texturas para a
 * GPU e compila os shaders durante o carregamento — senão isso acontece aos poucos, na
 * primeira vez que cada coisa entra na tela (engasgos ao andar/olhar em volta).
 */
function warmUp(r: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.Camera): void {
  const off: THREE.Object3D[] = [];
  const hid: THREE.Object3D[] = [];
  scene.traverse((o) => {
    if (o.frustumCulled) {
      o.frustumCulled = false;
      off.push(o);
    }
    // escondidos agora (anel de mira, fogo, efeitos) também: senão compilam no meio do jogo
    if (!o.visible) {
      o.visible = true;
      hid.push(o);
    }
  });
  try {
    r.compile(scene, cam);
    r.render(scene, cam);
  } finally {
    for (const o of off) o.frustumCulled = true;
    for (const o of hid) o.visible = false;
  }
}
/** ponte online (só existe com amigos conectados) */
export interface FpsNet {
  notePick(target: number): void;
  noteThrow(st: number, x: number, y: number): void;
}

/** alvo da mira: estação, controle físico (botão/porta/torneira) ou item solto */
type Tg = { k: 0; st: Station } | { k: 1; c: Control; st: Station } | { k: 2; l: Loose };

interface Loose extends RescueState {
  it: Item;
  /** alvo de mira deste item */
  tg: AimTarget<Tg>;
  body: CANNON.Body;
  /** id de quem jogou (0 = caiu sozinho) */
  by: number;
  /** estação já tentada (evita tentar de novo enquanto quica) */
  tried: number;
  /** bots que já tentaram pegar (bitmask por índice) */
  botTry: number;
  age: number;
  still: number;
  /** voo local do cliente online (não está na Sim) */
  local: boolean;
  /** velocidade do último quadro (para impacto) */
  hard: number;
}

const EYE = 1.45;
const RAD = 0.3;
const REACH = 2.5;
const SKINS_CUST = ['bloop', 'mint', 'sunny', 'chef', 'bee', 'ocean', 'kitty', 'capy', 'pirate', 'astro'];
const qs = new URLSearchParams(location.search);

const V = new THREE.Vector3();
const V2 = new THREE.Vector3();
const FWD = new THREE.Vector3();
const MB = new THREE.Matrix4();
const QB = new THREE.Quaternion();
const SB = new THREE.Vector3(1, 1, 1);
const RAY = new THREE.Ray();
const BOX = new THREE.Box3();
const HIT = new THREE.Vector3();
const TV = new THREE.Vector3();
const AIMP = new THREE.Vector3();

const CSS = `
.czf-layer{position:absolute;inset:0;touch-action:none}
.czf-float{position:absolute;left:0;top:0;font-weight:700;font-size:22px;color:#ffe14a;-webkit-text-stroke:4px #2a0b5c;paint-order:stroke fill;pointer-events:none;white-space:nowrap;will-change:transform,opacity}
.czf-float small{display:block;font-size:14px;color:#fff;-webkit-text-stroke:3px #2a0b5c;text-align:center}
.czf-hint{position:absolute;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 12px);transform:translateX(-50%);font-size:13px;font-weight:600;padding:4px 12px;border-radius:12px;background:#2a0b5caa;pointer-events:none;white-space:nowrap;transition:opacity .4s}
@media (orientation:portrait){.czf-hint{bottom:auto;top:calc(env(safe-area-inset-top,0px) + 140px)}}
.czf-layer .h3-toast{top:calc(env(safe-area-inset-top,0px) + 112px);font-size:14px;padding:5px 12px;border-radius:12px;box-shadow:0 0 0 3px #2a0b5c inset,0 3px 0 #2a0b5c55}
`;
let cssEl: HTMLStyleElement | null = null;

export async function createRender3D(host: HTMLElement, cv: HTMLCanvasElement, sim: Sim, decor: number): Promise<Renderer> {
  const r = new KitchenFps(host, cv);
  r.setSim(sim, decor);
  return r;
}

class KitchenFps implements Renderer {
  me: Player | null = null;
  /** o renderizador cuida da entrada do jogador local (false depois de cair para o 2D) */
  fps = true;
  net: FpsNet | null = null;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(72, 1, 0.04, 60);
  private gov: QualityGovernor;
  private q: Q3;
  private sim!: Sim;
  private kit: KitchenBuild | null = null;
  private items!: Items3D;
  private parts: Particles;
  private flames: Particles;
  private world = new CANNON.World({ gravity: new CANNON.Vec3(0, -14, 0), allowSleep: true });
  private staticMat = new CANNON.Material('static');
  private itemMat = new CANNON.Material('item');
  private loose = new Map<Item, Loose>();
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private fireLight: THREE.PointLight | null = null;
  private layer: HTMLDivElement;
  private input: FpsControls;
  /** HUD mínimo: UM botão da mão (verbo contextual) + JOGAR */
  private hb: HandButtons;
  /** avisos: pílula pequena compartilhada (src/ui/notify) */
  private toast = { show: (txt: string, ms = 1400) => void notify(txt, { ms: Math.max(1400, ms) }) };
  private ret: HTMLDivElement;
  private hint: HTMLDivElement;
  private hand: Hand | null = null;
  private w = 1;
  private h = 1;
  private lost = false;
  private fallback: Render2D | null = null;
  /* jogador */
  private px = 0;
  private pz = 0;
  private vx = 0;
  private vz = 0;
  private yaw = 0;
  private pitch = -0.32;
  private bob = 0;
  private speedK = 0;
  private lastLook: [number, number] = [0, 0];
  private slip = 0;
  private shake = 0;
  /** tranco de câmera (picar) 0..1 */
  private recoil = 0;
  /* mira */
  private tgSt = -1;
  private tgLoose: Loose | null = null;
  /** controle físico mirado (botão do fogo, porta, torneira...) */
  private tgCtl: Control | null = null;
  private picker = new AimPicker<Tg>();
  private aimSkip = 0;
  private hover: HoverHighlight;
  private snaps: SnapGlows;
  private beacon: Beacon;
  private hes = new Hesitation(3.5, 7);
  private landRing: THREE.Mesh;
  /* peças físicas e interface no mundo */
  private props: KitchenProps | null = null;
  private screen: ReturnType<typeof wallScreen> | null = null;
  private printer: TicketPrinter | null = null;
  private screenT = 0;
  private screenSig = '';
  private seenOrder = 0;
  private rescuer: Rescuer | null = null;
  /** texto do passo do treino (vai na nota adesiva da tela e no balão do alvo) */
  private tipTxt = '';
  /** lugares que aceitam o que está na mão (recalculado 6×/s): índice da estação e tipo */
  private snapSt: number[] = [];
  private snapK: number[] = [];
  private snapT = 0;
  private snapFor: Item | null = null;
  /** comemoração/reação do cliente na janela */
  private cheer = { t: 0, ok: true, skin: 'bloop', x: 0 };
  /** tampa do lixo aberta por mais (s), por estação */
  private lidT = new Float32Array(0);
  /** torneira aberta sem louça (s) — fecha sozinha */
  private dryT = new Float32Array(0);
  /* botões */
  /** verbo contextual atual (id) */
  private ctxAct = '';
  /** toque curto em CORTAR/ESFREGAR conta como um golpe (s) */
  private actPulse = 0;
  private charge = -1;
  private throwHeld = false;
  private keyThrow = false;
  private keyAct = false;
  private actOn = false;
  private verbDef: VerbDef = FALLBACK;
  private pendingThrow = 0;
  /* visuais */
  private spr: THREE.Sprite[] = [];
  private sprUsed = 0;
  private sprMats = new Map<string, THREE.SpriteMaterial>();
  private floats: { el: HTMLDivElement; x: number; y: number; z: number; life: number }[] = [];
  private floatHead = 0;
  private puddle: { x: number; z: number; r: number; t: number } | null = null;
  private puddleMesh: THREE.Mesh;
  private chaosT = 8;
  private puddleT = 30;
  private sprayT = 0;
  private stepT = 0;
  private lastTips = 0;
  private time = 0;
  private hintT = 9;
  /** guia (treino/dica): estação a destacar — só aparece se o jogador hesitar */
  guide: { st: number; strong: boolean } | null = null;
  private onKey = (e: KeyboardEvent) => this.key(e, true);
  private onKeyUp = (e: KeyboardEvent) => this.key(e, false);
  private ctxLost = (e: Event) => {
    e.preventDefault();
    this.goto2D();
  };

  constructor(
    private host: HTMLElement,
    private cv: HTMLCanvasElement,
  ) {
    ensureCss();
    if (!cssEl) {
      cssEl = document.createElement('style');
      cssEl.textContent = CSS;
      document.head.appendChild(cssEl);
    }
    this.gov = new QualityGovernor({ initial: detectInitialTier(), mode: loadMode(), emit: false, persist: false, onChange: (tr) => this.applyTier(tr), onResScale: () => this.renderer.setPixelRatio(this.q.pr * this.gov.resScale) });
    this.q = q3For(this.gov.tier);
    this.renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: this.q.tier >= 2, powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(this.q.pr);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.q.standard ? 0.92 : 1.12;
    this.renderer.shadowMap.enabled = this.q.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    cv.addEventListener('webglcontextlost', this.ctxLost, false);
    // pedidos e dicas ficam NO MUNDO (tela sobre o passa-pratos, comanda impressa): sem painel por cima
    // camada de controles (fica ABAIXO do HUD do jogo, que é criado depois)
    this.layer = el('div', 'czf-layer');
    cv.after(this.layer);
    this.input = new FpsControls(this.layer, { joystick: { zoneTop: 0.25 } });
    this.hb = new HandButtons(this.layer, t('cozinha.fps.throwIt', 'Jogar'));
    this.hb.onMain = (id) => this.tap(id);
    this.hb.onAlt = (id) => this.tap(id);
    this.ret = el('div', 'h3-ret');
    this.hint = el('div', 'czf-hint');
    this.hint.textContent = t('cozinha.fps.hint3', 'Arraste à direita para olhar · o botão amarelo faz o que você mira');
    this.layer.append(this.ret, this.hint);

    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);

    this.hemi = new THREE.HemisphereLight('#fff4e6', '#d9c2a8', this.q.standard ? 1.05 : 1.7);
    this.sun = new THREE.DirectionalLight('#ffe8c8', this.q.standard ? 1.9 : 1.4);
    if (this.q.standard) {
      // reflexos: ambiente procedural (sem download) — inox e louça brilham de verdade
      this.scene.environment = roomEnv(this.renderer);
      this.scene.environmentIntensity = 0.55;
    }
    if (this.q.shadows) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(1024, 1024);
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.02;
      this.sun.shadow.radius = 3;
    }
    this.scene.add(this.hemi, this.sun, this.sun.target, this.camera);
    this.parts = new Particles(Math.round(260 + 200 * this.q.particles));
    this.parts.budget = this.q.particles;
    this.flames = new Particles(Math.round(80 + 100 * this.q.particles), true);
    this.flames.budget = this.q.particles;
    this.scene.add(this.parts.obj, this.flames.obj);
    // afordâncias: contorno + rótulo no alvo, discos onde dá para soltar, dica por hesitação
    this.hover = new HoverHighlight(this.scene, this.layer);
    this.snaps = new SnapGlows(this.scene, 28);
    this.beacon = new Beacon(this.scene, this.layer);
    this.picker.reach = REACH;
    const lg = new THREE.RingGeometry(0.18, 0.26, 20);
    lg.rotateX(-Math.PI / 2);
    this.landRing = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ color: '#ff5c7a', transparent: true, opacity: 0.85, depthWrite: false }));
    this.landRing.visible = false;
    this.scene.add(this.landRing);
    const pg = new THREE.CircleGeometry(1, 24);
    pg.rotateX(-Math.PI / 2);
    this.puddleMesh = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: '#7ad0ff', transparent: true, opacity: 0.55, depthWrite: false }));
    this.puddleMesh.visible = false;
    this.scene.add(this.puddleMesh);
    // física
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    (this.world.solver as CANNON.GSSolver).iterations = 6;
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.itemMat, this.staticMat, { friction: 0.35, restitution: 0.38 }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.itemMat, this.itemMat, { friction: 0.3, restitution: 0.3 }));
    for (let i = 0; i < 6; i++) {
      const f = el('div', 'czf-float') as HTMLDivElement;
      f.style.opacity = '0';
      this.layer.appendChild(f);
      this.floats.push({ el: f, x: 0, y: 0, z: 0, life: 0 });
    }
  }

  private applyTier(tr: Tier): void {
    this.q = q3For(tr);
    this.renderer.setPixelRatio(this.q.pr * this.gov.resScale);
    this.parts.budget = this.flames.budget = this.q.particles;
    this.resizeGL();
  }

  /* ======================= montagem ======================= */
  setSim(sim: Sim, decor: number): void {
    if (this.sim === sim) return;
    this.sim = sim;
    sim.physFloor = true;
    this.kit = buildKitchen(sim, decor, this.q.standard, this.world, this.staticMat);
    this.scene.add(this.kit.group);
    this.buildInteract();
    this.scene.background = new THREE.Color(this.kit.bg);
    this.scene.fog = new THREE.Fog(this.kit.bg, 14, 34);
    this.items = new Items3D(this.q.standard, sim);
    this.scene.add(this.items.group);
    const W = sim.cols * T;
    const DZ = sim.rows * T;
    this.sun.position.set(W * 0.3, 10, DZ + 4);
    this.sun.target.position.set(W / 2, 0, DZ / 2);
    if (this.q.shadows) {
      const sc = this.sun.shadow.camera;
      const ext = Math.max(W, DZ) * 0.75 + 1;
      sc.left = sc.bottom = -ext;
      sc.right = sc.top = ext;
      sc.near = 1;
      sc.far = 30;
      sc.updateProjectionMatrix();
    }
    // luz quente de preenchimento (lâmpadas pendentes)
    const fill = new THREE.PointLight('#ffd9a0', this.q.standard ? 3 : 2, Math.max(W, DZ) * 1.2, 1.6);
    fill.position.set(W / 2, WALL_H - 0.6, DZ / 2);
    this.scene.add(fill);
    if (this.q.pointLight) {
      this.fireLight = new THREE.PointLight('#ff7a2e', 0, 6, 1.4);
      this.scene.add(this.fireLight);
    }
    if (sim.theme === 'space') this.world.gravity.set(0, -2.6, 0);
    this.lastTips = sim.tips;
    // sprites (colegas, clientes, barras) nascem durante o jogo: um temporário compila o shader agora
    const tmpSpr = new THREE.Sprite(this.smat(this.barKeys[0], () => drawBar(0)));
    this.scene.add(tmpSpr);
    warmUp(this.renderer, this.scene, this.camera);
    this.scene.remove(tmpSpr);
    if (qs.has('czdebug') || import.meta.env.DEV) this.debugApi();
  }
  /** peças físicas, alvos de mira, tela de pedidos, impressora de comandas, resgate */
  private buildInteract(): void {
    const sim = this.sim;
    const props = new KitchenProps(sim, this.q.standard, this.world, this.staticMat);
    this.props = props;
    this.scene.add(props.group);
    this.lidT = new Float32Array(sim.st.length);
    this.dryT = new Float32Array(sim.st.length);
    const pk = this.picker;
    for (const st of sim.st) {
      if (!st.fx && !st.fy) continue;
      const b = new THREE.Box3();
      const top = st.k === 'crate' ? FRIDGE_H : st.k === 'oven' ? 0.7 : st.k === 'blender' ? 0.6 : st.k === 'trash' ? 0.62 : 0.4;
      b.min.set(st.x * T + 0.02, 0, st.y * T + 0.02);
      b.max.set((st.x + 1) * T - 0.02, H + top, (st.y + 1) * T - 0.02);
      pk.add({ k: 0, st }, b, 0);
      const p = props.by[st.i];
      // controles pequenos ganham do móvel atrás deles; a tampa do lixo e a porta só animam
      if (p) for (const c of [p.heat, p.faucet, p.bell]) if (c) pk.add({ k: 1, c, st }, c.box, -0.3);
      if (p?.heat) {
        const c = p.heat;
        c.on = st.heat;
        c.onChange = (on) => {
          st.heat = on;
          const x = (st.x + 0.5) * T;
          const z = (st.y + 0.5) * T;
          if (on) {
            feedback(st.k === 'blender' ? 'press' : 'knobOn');
            if (st.k === 'pot' || st.k === 'pan') this.parts.burst(x, H + 0.08, z, 8, 'spark', '#7ac8ff', 0.8);
            this.hes.poke();
          } else feedback(st.k === 'blender' ? 'press' : 'knobOff');
        };
      }
      if (p?.faucet)
        p.faucet.onChange = (on) => {
          feedback('lever');
          if (on) feedback('splash', false);
        };
      if (p?.bell)
        p.bell.onChange = () => {
          feedback('ding');
          this.cheer.t = Math.max(this.cheer.t, 0.6);
        };
      if (p?.door)
        p.door.onChange = (on) => {
          feedback(on ? 'doorOpen' : 'doorClose');
          if (on && p.cold) this.parts.burst((st.x + 0.5 + st.fx * 0.4) * T, H + 0.5, (st.y + 0.5 + st.fy * 0.4) * T, 6, 'steam', '#e8f6ff', 0.5);
        };
    }
    // tela de pedidos sobre o 1º passa-pratos + impressora de comandas ao lado
    const win = sim.st.find((s) => s.k === 'window' || s.k === 'belt');
    if (win) {
      const wx = (win.x + 0.5) * T;
      const sw = Math.min(2.6, sim.cols * T - 0.6);
      const scr = wallScreen(sw, sw * 0.27, 1024);
      scr.group.position.set(Math.max(sw / 2 + 0.2, Math.min(sim.cols * T - sw / 2 - 0.2, wx)), HATCH_TOP + 0.48, 0.035);
      this.scene.add(scr.group);
      this.screen = scr;
      const pr = new TicketPrinter(0.2, 0.3);
      const left = win.x >= 1 ? -1 : 1;
      pr.group.position.set(wx + left * (T / 2 + 0.2), 1.62, 0);
      this.scene.add(pr.group);
      pr.onPrint = () => feedback('print');
      pr.refreshBox();
      this.printer = pr;
    }
    // nada se perde: saiu da cozinha ou ficou parado onde a mão não alcança → volta
    this.rescuer = new Rescuer({
      min: [-0.6, -1, -0.5],
      max: [sim.cols * T + 0.6, WALL_H + 1, sim.rows * T + 0.6],
      wait: 2,
      reachable: (x, y, z) => {
        if (z < 0.05) return false; // passou pela janela para o salão
        if (y > 1.75) return false; // em cima do exaustor/prateleira
        const tx = Math.floor(x / T);
        const ty = Math.floor(z / T);
        if (tx < 0 || ty < 0 || tx >= sim.cols || ty >= sim.rows) return false;
        const si = sim.stAt[ty * sim.cols + tx];
        if (si < 0) return true;
        const st = sim.st[si];
        // bancada de canto (sem frente) ou atrás/dentro da geladeira
        return !!(st.fx || st.fy) && st.k !== 'crate';
      },
    });
  }

  /** depuração / screenshots (window.__czfps) */
  private debugApi(): void {
    const self = this;
    const sim = this.sim;
    const goto = (tx: number, ty: number) => {
      self.px = tx * T;
      self.pz = ty * T;
      self.vx = self.vz = 0;
    };
    const lookAt = (x: number, y: number, z: number) => {
      const dx = x - self.px;
      const dz = z - self.pz;
      self.yaw = Math.atan2(-dx, -dz);
      self.pitch = Math.atan2(y - EYE, Math.hypot(dx, dz));
    };
    const lookSt = (st: Station, up = 0) => lookAt((st.x + 0.5) * T, H + up, (st.y + 0.5) * T);
    (window as unknown as { __czfps?: unknown }).__czfps = {
      r: self,
      sim,
      give(id: string) {
        const me = self.me!;
        if (id === 'plate') me.hold = sim.newItem(IK.Plate, 0);
        else if (id === 'ext') me.hold = sim.newItem(IK.Ext, 0);
        else if (id === 'dirty') {
          me.hold = sim.newItem(IK.Dirty, 0);
          me.hold.n = 3;
        } else me.hold = sim.newItem(IK.Ing, ING_INDEX[id] * 16);
        return me.hold;
      },
      st(k: string, n = 0) {
        return sim.st.filter((x) => x.k === k && (x.fx || x.fy))[n] ?? null;
      },
      goto,
      lookAt,
      lookSt,
      /** fica na frente da estação e olha para ela */
      front(st: Station, back = 1) {
        goto(st.x + 0.5 + st.fx * back, st.y + 0.5 + st.fy * back);
        lookSt(st, 0.1);
      },
      pick: () => self.doPick(),
      throwNow: (p: number) => self.doThrow(p),
      charge(c: number) {
        self.charge = c;
        self.keyThrow = c >= 0;
        self.throwHeld = c >= 0;
      },
      act(on: boolean) {
        self.keyAct = on;
      },
      loose: () => [...self.loose.values()].map((l) => ({ k: l.it.k, x: l.body.position.x, y: l.body.position.y, z: l.body.position.z })),
      spawn(id: string, x: number, y: number, z: number, vx = 0, vy = 0, vz = 0) {
        const it = id === 'plate' ? sim.newItem(IK.Plate, 0) : sim.newItem(IK.Ing, ING_INDEX[id] * 16);
        const l = self.addLoose(it, x, y, z, false, 0);
        l.body.velocity.set(vx, vy, vz);
        sim.dropAt(it, x / T, z / T);
        return it;
      },
      puddle: () => self.makePuddle(),
      chaosNow: () => (self.chaosT = 0),
      lose: () => self.goto2D(),
      pos: () => ({ x: self.px, z: self.pz, yaw: self.yaw, pitch: self.pitch }),
      setPitch: (v: number) => (self.pitch = v),
      setYaw: (v: number) => (self.yaw = v),
    };
  }
  private spawnFromMe(): void {
    const me = this.me;
    if (!me) return;
    this.px = me.x * T;
    this.pz = me.y * T;
    // olha para o centro da cozinha / passa-pratos
    const cx = (this.sim.cols / 2) * T;
    const cz = (this.sim.rows / 2) * T - 0.5;
    this.yaw = Math.atan2(-(cx - this.px), -(cz - this.pz));
    if (!this.hand) {
      this.hand = new Hand(this.camera, handColors(me.skin));
    }
    if (!qs.has('czauto')) me.remote = true; // a Sim não move o chef em 1ª pessoa: quem move é o 3D
  }

  resize(w: number, h: number, dpr: number, topPad: number, botPad: number): void {
    this.w = w;
    this.h = h;
    this.fallback?.resize(w, h, dpr, topPad, botPad);
    this.resizeGL();
  }
  private resizeGL(): void {
    if (this.lost) return;
    this.renderer.setSize(this.w, this.h, false);
    this.cv.style.width = this.w + 'px';
    this.cv.style.height = this.h + 'px';
    this.camera.aspect = this.w / Math.max(1, this.h);
    // retrato: campo de visão maior para ver as bancadas
    this.camera.fov = this.h > this.w ? 88 : 72;
    this.camera.updateProjectionMatrix();
  }

  /* ======================= entrada ======================= */
  private key(e: KeyboardEvent, down: boolean): void {
    if (!this.fps) return;
    if (e.code === 'KeyE' || e.code === 'KeyK') {
      if (down && !e.repeat) this.tap(this.ctxAct || 'pick');
    } else if (e.code === 'Space' || e.code === 'KeyR') this.keyThrow = down;
    else if (e.code === 'KeyF' || e.code === 'KeyJ') this.keyAct = down;
  }
  /** toque no botão da mão (id = verbo atual) */
  private tap(id: string): void {
    const sim = this.sim;
    const st = this.tgSt >= 0 ? sim.st[this.tgSt] : null;
    switch (id) {
      case 'open': {
        const d = st ? this.props?.by[st.i]?.door : null;
        if (d) {
          d.set(true);
          this.hand?.play('grab');
          this.hes.poke();
        }
        break;
      }
      case 'ctl':
        if (this.tgCtl) {
          this.tgCtl.press();
          this.hand?.play('grab');
        }
        break;
      case 'chop':
      case 'scrub':
        // toque curto = um golpe (segurar = contínuo)
        this.actPulse = 0.3;
        break;
      case 'spray':
        break;
      default:
        this.doPick();
    }
  }
  /** mãos do jogador local (no cliente online, ignora o que já foi jogado e o host ainda não soube) */
  private held(): Item | null {
    const me = this.me;
    if (!me || this.pendingThrow > 0) return null;
    return me.hold;
  }

  /** chamado pelo jogo ANTES de sim.step: move o chef, mira e aplica ações */
  preStep(dt: number): void {
    const me = this.me;
    if (!me || !this.fps) return;
    if (!this.hand) this.spawnFromMe();
    const sim = this.sim;
    const client = !!sim.o.client;
    if (this.pendingThrow > 0) {
      this.pendingThrow -= dt;
      if (!me.hold) this.pendingThrow = 0;
    }
    const auto = qs.has('czauto');
    // olhar
    // olhar (já suavizado pelos controles compartilhados)
    const [lx, ly] = this.input.consumeLook(dt);
    this.yaw -= lx;
    this.pitch = Math.max(-1.3, Math.min(1.1, this.pitch - ly));
    this.lastLook[0] = lx;
    this.lastLook[1] = ly;
    if (auto) {
      // autoplay: a câmera segue o bot que joga por mim
      this.px += (me.x * T - this.px) * Math.min(1, dt * 10);
      this.pz += (me.y * T - this.pz) * Math.min(1, dt * 10);
      const ty = Math.atan2(-me.fx, -me.fy);
      let d = ty - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 4);
      this.speedK = Math.min(1, Math.hypot(me.vx, me.vy) / 3);
    } else {
      // andar
      const [mx, my] = this.input.dir();
      const fx = -Math.sin(this.yaw);
      const fz = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw);
      const rz = -Math.sin(this.yaw);
      const sp = 3.3 * (1 + sim.ups.shoes * 0.08) * (me.hold?.k === IK.Ext ? 0.85 : 1);
      const tvx = (fx * my + rx * mx) * sp;
      const tvz = (fz * my + rz * mx) * sp;
      let k = mx || my ? 10 : 14;
      if (sim.theme === 'space') k = 2.6;
      if (this.slip > 0) k = 0.9;
      this.vx += (tvx - this.vx) * Math.min(1, dt * k);
      this.vz += (tvz - this.vz) * Math.min(1, dt * k);
      // chão molhado: escorrega!
      if (this.puddle && Math.hypot(this.px - this.puddle.x, this.pz - this.puddle.z) < this.puddle.r) {
        if (this.slip <= 0 && Math.hypot(this.vx, this.vz) > 1.2) {
          this.slip = 1.6;
          this.vx *= 1.7;
          this.vz *= 1.7;
          this.toast.show(t('cozinha.fps.slip', 'Escorregou!'), 900);
          sfx.boing();
        }
      }
      if (this.slip > 0) {
        this.slip -= dt;
        this.yaw += dt * 2.2 * Math.max(0, this.slip);
      }
      this.moveGrid(this.vx * dt, this.vz * dt);
      this.speedK = Math.min(1, Math.hypot(this.vx, this.vz) / sp);
      me.x = this.px / T;
      me.y = this.pz / T;
      me.vx = this.vx / T;
      me.vy = this.vz / T;
      if (this.speedK > 0.1) me.walk += dt * this.speedK * 6;
      me.in.mx = me.in.my = 0;
      me.in.pick = false;
    }
    if (!auto) {
      me.fx = -Math.sin(this.yaw);
      me.fy = -Math.cos(this.yaw);
    }
    this.placeCamera(dt);
    this.aim();
    if (auto) return;
    me.force = this.tgSt;
    sim.manualHeat = !client && !this.net;
    // botão da mão: verbo contextual (regras puras, ver VERB_RULES)
    const h = this.held();
    const st = this.tgSt >= 0 ? sim.st[this.tgSt] : null;
    const vc = VC;
    vc.sim = sim;
    vc.h = h;
    vc.st = st;
    vc.ctl = this.tgCtl;
    vc.loose = this.tgLoose;
    vc.p = st ? this.props?.by[st.i] ?? null : null;
    vc.acc = h && st ? sim.wouldAccept(st.i, h) : 0;
    const verb = resolveVerb(vc, VERB_RULES, FALLBACK);
    this.ctxAct = verb.id;
    this.verbDef = verb;
    if (this.actPulse > 0) this.actPulse -= dt;
    const holdVerb = verb.id === 'chop' || verb.id === 'scrub' || verb.id === 'spray';
    this.actOn = holdVerb && (this.hb.mainHeld || this.keyAct || this.actPulse > 0);
    if (!holdVerb) this.actPulse = 0;
    me.in.act = this.actOn;
    // fridge aberta enquanto você mexe nela
    if (vc.p?.door?.on) vc.p.door.touch();
    // jogar: segurar carrega a força, soltar lança
    const th = (this.hb.throwHeld || this.keyThrow) && !!h;
    if (th) this.charge = Math.min(1, Math.max(0, this.charge) + dt / 0.9);
    else if (this.throwHeld && this.charge >= 0) {
      this.doThrow(this.charge);
      this.charge = -1;
    } else this.charge = -1;
    this.throwHeld = th;
    // extintor
    if (this.actOn && verb.id === 'spray') this.spray(dt);
    // chute nos itens do chão ao andar (caos)
    const sp2 = this.vx * this.vx + this.vz * this.vz;
    if (sp2 > 1)
      for (const l of this.loose.values()) {
        const b = l.body;
        if (b.position.y > 0.45) continue;
        const dx = b.position.x - this.px;
        const dz = b.position.z - this.pz;
        if (dx * dx + dz * dz < 0.2) {
          b.wakeUp();
          b.velocity.set(this.vx * 1.3 + dx, 1.6, this.vz * 1.3 + dz);
          b.angularVelocity.set(Math.random() * 8, Math.random() * 8, Math.random() * 8);
        }
      }
  }

  /** a câmera nunca entra em bancada/geladeira: empurra para fora das células bloqueadas com folga */
  private camClamp(x: number, z: number): [number, number] {
    const s = this.sim;
    const M = 0.34; // folga (m) — maior que o meio do plano near com FOV largo
    const gx = Math.floor(x / T);
    const gz = Math.floor(z / T);
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 1; ox++) {
        const cx = gx + ox;
        const cy = gz + oy;
        if (s.isFloor(cx + 0.5, cy + 0.5)) continue;
        // ponto mais próximo da caixa da célula
        const nx = Math.max(cx * T, Math.min(x, (cx + 1) * T));
        const nz = Math.max(cy * T, Math.min(z, (cy + 1) * T));
        const dx = x - nx;
        const dz = z - nz;
        const d = Math.hypot(dx, dz);
        if (d >= M) continue;
        if (d < 1e-4) {
          // dentro da célula: volta para o centro do chão onde o jogador está
          const fx = (Math.floor(this.px / T) + 0.5) * T;
          const fz = (Math.floor(this.pz / T) + 0.5) * T;
          return [fx, fz];
        }
        x = nx + (dx / d) * M;
        z = nz + (dz / d) * M;
      }
    return [x, z];
  }
  private moveGrid(dx: number, dz: number): void {
    const s = this.sim;
    const r = RAD / T;
    const free = (x: number, y: number) => s.isFloor(x - r, y - r) && s.isFloor(x + r, y - r) && s.isFloor(x - r, y + r) && s.isFloor(x + r, y + r);
    const nx = (this.px + dx) / T;
    if (free(nx, this.pz / T)) this.px += dx;
    else this.vx *= this.sim.theme === 'space' ? -0.4 : 0;
    const nz = (this.pz + dz) / T;
    if (free(this.px / T, nz)) this.pz += dz;
    else this.vz *= this.sim.theme === 'space' ? -0.4 : 0;
    // empurrão suave dos colegas
    for (const p of s.players) {
      if (p === this.me) continue;
      const ox = this.px - p.x * T;
      const oz = this.pz - p.y * T;
      const d = Math.hypot(ox, oz);
      if (d > 0.01 && d < 0.55) {
        const push = (0.55 - d) * 0.5;
        const ax = this.px + (ox / d) * push;
        const az = this.pz + (oz / d) * push;
        if (free(ax / T, this.pz / T)) this.px = ax;
        if (free(this.px / T, az / T)) this.pz = az;
      }
    }
  }

  private placeCamera(dt: number): void {
    const cam = this.camera;
    this.bob += dt * 9 * this.speedK;
    const bobY = Math.sin(this.bob * 2) * 0.025 * this.speedK;
    let roll = Math.cos(this.bob) * 0.008 * this.speedK;
    const th = this.sim.theme;
    if (th === 'boat') roll += Math.sin(this.time * 0.9) * 0.045;
    if (this.slip > 0) roll += Math.sin(this.time * 14) * 0.05 * this.slip;
    let sx = 0;
    let sy = 0;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.6);
      sx = (Math.random() - 0.5) * this.shake * 0.12;
      sy = (Math.random() - 0.5) * this.shake * 0.12;
    }
    const space = th === 'space' ? Math.sin(this.time * 1.3) * 0.04 : 0;
    this.recoil = Math.max(0, this.recoil - dt * 7);
    sy -= Math.sin(this.recoil * Math.PI) * 0.012;
    cam.rotation.order = 'YXZ';
    cam.rotation.set(this.pitch + sy * 0.5 + (th === 'boat' ? Math.sin(this.time * 0.7) * 0.015 : 0), this.yaw + sx * 0.5, roll);
    const [cx, cz] = this.camClamp(this.px + sx, this.pz);
    cam.position.set(cx, EYE + bobY + sy + space, cz);
    cam.updateMatrixWorld();
  }

  /* ======================= mira ======================= */
  private aim(): void {
    const cam = this.camera;
    RAY.origin.copy(cam.position);
    cam.getWorldDirection(RAY.direction);
    FWD.copy(RAY.direction);
    // mira mais barata: com a câmera parada, só refaz a cada 3 quadros
    const still = Math.abs(this.lastLook[0]) + Math.abs(this.lastLook[1]) < 1e-4 && this.speedK < 0.05;
    if (still && this.aimSkip-- > 0) return;
    this.aimSkip = 2;
    for (const l of this.loose.values()) {
      const p = l.body.position;
      l.tg.enabled = !l.local;
      AimPicker.sphere(l.tg, p.x, p.y, p.z, 0.13);
    }
    const tg = this.picker.pick(RAY);
    const d = tg?.data;
    this.tgLoose = d?.k === 2 ? d.l : null;
    this.tgCtl = d?.k === 1 ? d.c : null;
    this.tgSt = d && d.k !== 2 ? d.st.i : -1;
  }

  /* ======================= pegar / soltar / jogar ======================= */
  private doPick(): void {
    const me = this.me;
    if (!me || !this.fps) return;
    const sim = this.sim;
    const h = this.held();
    if (sim.o.client) {
      if (this.tgSt >= 0 || (!h && this.tgLoose)) {
        this.net?.notePick(this.tgSt);
        this.hand?.play('grab');
        sfx.pick();
      } else if (h) this.launch(h, 0.6, 0.4, true);
      return;
    }
    if (!h) {
      if (this.tgLoose) {
        const l = this.tgLoose;
        this.removeLoose(l);
        sim.takeFloor(l.it);
        me.hold = l.it;
        this.hand?.play('grab');
        sfx.pick();
        return;
      }
      if (this.tgSt >= 0) {
        me.force = this.tgSt;
        sim.pick(me);
        if (me.hold) {
          this.hand?.play('grab');
          sfx.pick();
        } else sfx.thud();
      }
      return;
    }
    if (this.tgSt >= 0) {
      me.force = this.tgSt;
      sim.pick(me);
      if (me.hold !== h) {
        this.hand?.play('grab');
        sfx.drop();
      } else if (me.hold.parts.length) this.hand?.play('grab');
      else {
        sfx.thud();
        this.toast.show(t('cozinha.fps.nope', 'Não cabe aí!'), 900);
      }
      return;
    }
    // solta na frente (com física)
    me.hold = null;
    this.launch(h, 0.6, 0.4, false);
    sfx.drop();
  }
  private doThrow(power: number): void {
    const h = this.held();
    if (!h || !this.me) return;
    if (!this.sim.o.client) this.me.hold = null;
    this.throwVel(power, TV);
    const l = this.spawnHeld(h, !!this.sim.o.client, this.me.id);
    l.body.velocity.set(TV.x, TV.y, TV.z);
    this.hand?.play('throw');
    sfx.whoosh();
    if (power > 0.7) this.shake = Math.max(this.shake, 0.2);
  }
  /** ponto de saída do arremesso (na mão) */
  private handPoint(out: THREE.Vector3): THREE.Vector3 {
    return out.set(0.12, -0.14, -0.4).applyMatrix4(this.camera.matrixWorld);
  }
  /**
   * Velocidade do arremesso. Mira assistida (diversão > precisão): se a mira aponta para uma
   * estação ou um colega (até ~9 m), calcula a parábola que cai lá; a força deixa o arco mais reto.
   */
  private throwVel(power: number, out: THREE.Vector3): boolean {
    const cam = this.camera;
    cam.getWorldDirection(FWD);
    const S0 = this.handPoint(V2);
    RAY.origin.copy(cam.position);
    RAY.direction.copy(FWD);
    let best = 9;
    let found = false;
    const s = this.sim;
    for (const st of s.st) {
      if (!st.fx && !st.fy) continue;
      BOX.min.set(st.x * T, 0, st.y * T);
      BOX.max.set((st.x + 1) * T, H + 0.5, (st.y + 1) * T);
      if (RAY.intersectBox(BOX, HIT)) {
        const d = HIT.distanceTo(RAY.origin);
        if (d < best) {
          best = d;
          found = true;
          AIMP.set((st.x + 0.5) * T, restY(st) + 0.12, (st.y + 0.5) * T);
        }
      }
    }
    for (const p of s.players) {
      if (p === this.me) continue;
      V.set(p.x * T, 0.85, p.y * T);
      const along = (V.x - RAY.origin.x) * FWD.x + (V.y - RAY.origin.y) * FWD.y + (V.z - RAY.origin.z) * FWD.z;
      if (along > 0.5 && along < best && RAY.distanceSqToPoint(V) < 0.3) {
        best = along;
        found = true;
        AIMP.copy(V);
      }
    }
    const g = this.world.gravity;
    if (found && power < 0.97) {
      const dist = AIMP.distanceTo(S0);
      const tf = Math.max(0.28, Math.min(1.15, dist / (3.2 + power * 6)));
      out.set((AIMP.x - S0.x) / tf - 0.5 * g.x * tf, (AIMP.y - S0.y) / tf - 0.5 * g.y * tf, (AIMP.z - S0.z) / tf - 0.5 * g.z * tf);
      return true;
    }
    const sp = 3 + power * 8;
    out.set(FWD.x * sp + this.vx, FWD.y * sp + 1 + power * 1.6, FWD.z * sp + this.vz);
    return false;
  }
  /** solta o que está na mão com corpo físico (velocidade definida por quem chama) */
  private spawnHeld(it: Item, local: boolean, by: number): Loose {
    const S0 = this.handPoint(V);
    const l = this.addLoose(it, S0.x, Math.max(S0.y, 0.2), S0.z, local, by);
    l.body.angularVelocity.set((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9);
    if (local) this.pendingThrow = 2.5;
    else this.sim.dropAt(it, S0.x / T, S0.z / T);
    return l;
  }
  private launch(it: Item, speed: number, up: number, local: boolean, by = 0): void {
    this.camera.getWorldDirection(FWD);
    const l = this.spawnHeld(it, local, by);
    l.body.velocity.set(FWD.x * speed + this.vx, FWD.y * speed + up, FWD.z * speed + this.vz);
  }
  private addLoose(it: Item, x: number, y: number, z: number, local: boolean, by: number): Loose {
    const old = this.loose.get(it);
    if (old) this.removeLoose(old);
    const plate = it.k === IK.Plate || it.k === IK.Dirty;
    const shape = plate ? new CANNON.Box(new CANNON.Vec3(0.16, 0.03 + (it.k === IK.Dirty ? Math.min(5, it.n) * 0.015 : 0), 0.16)) : it.k === IK.Ext ? new CANNON.Box(new CANNON.Vec3(0.07, 0.16, 0.07)) : new CANNON.Sphere(0.085);
    const body = new CANNON.Body({ mass: plate ? 0.6 : 0.35, shape, material: this.itemMat, linearDamping: this.sim.theme === 'space' ? 0.02 : 0.08, angularDamping: 0.3 });
    body.position.set(x, y, z);
    body.allowSleep = true;
    body.sleepSpeedLimit = 0.15;
    body.sleepTimeLimit = 0.6;
    const l: Loose = { it, body, by, tried: -1, botTry: 0, age: 0, still: 0, local, hard: 0, stuck: 0, tg: null as unknown as AimTarget<Tg> };
    l.tg = this.picker.add({ k: 2, l }, undefined, -0.05);
    body.addEventListener('collide', (e: { contact: CANNON.ContactEquation }) => {
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (v > l.hard) l.hard = v;
    });
    this.world.addBody(body);
    this.loose.set(it, l);
    return l;
  }
  private removeLoose(l: Loose): void {
    this.world.removeBody(l.body);
    this.loose.delete(l.it);
    this.picker.remove(l.tg);
    if (this.tgLoose === l) this.tgLoose = null;
  }

  /* ======================= extintor ======================= */
  private spray(dt: number): void {
    const cam = this.camera;
    cam.getWorldDirection(FWD);
    V.set(0.1, -0.2, -0.55).applyMatrix4(cam.matrixWorld);
    this.sprayT -= dt;
    for (let i = 0; i < 3; i++) {
      const s = 4 + Math.random() * 2;
      this.parts.emit(V.x, V.y, V.z, FWD.x * s + (Math.random() - 0.5) * 1.2, FWD.y * s + (Math.random() - 0.5) * 1 + 0.4, FWD.z * s + (Math.random() - 0.5) * 1.2, { tile: PT.Foam, color: '#ffffff', life: 0.7, size: 0.1, grow: 0.45, grav: 2, drag: 1.5 });
    }
    if (this.sprayT <= 0) {
      this.sprayT = 0.16;
      sfx.spray();
    }
    // o jato empurra o que estiver solto na frente
    for (const l of this.loose.values()) {
      const b = l.body;
      V2.set(b.position.x - cam.position.x, b.position.y - cam.position.y, b.position.z - cam.position.z);
      const d = V2.length();
      if (d < 3 && V2.dot(FWD) / (d || 1) > 0.85) {
        b.wakeUp();
        b.velocity.x += FWD.x * dt * 9;
        b.velocity.z += FWD.z * dt * 9;
        b.velocity.y += dt * 3;
      }
    }
    this.hand && (this.hand.scrub = Math.max(this.hand.scrub, 0.25));
  }

  /* ======================= caos ======================= */
  private chaos(dt: number): void {
    const sim = this.sim;
    const host = !sim.o.client;
    const th = sim.theme;
    if (th === 'boat') {
      // gravidade inclina com o balanço: tudo que está solto escorrega
      const sway = Math.sin(this.time * 0.9);
      this.world.gravity.set(sway * 4.2, -14, Math.sin(this.time * 0.7) * 1.8);
      if (Math.abs(sway) > 0.4) for (const l of this.loose.values()) if (l.body.sleepState === CANNON.Body.SLEEPING) l.body.wakeUp();
    }
    this.chaosT -= dt;
    if (this.chaosT <= 0) {
      if (th === 'truck') {
        this.chaosT = 5 + Math.random() * 4;
        this.shake = 1;
        sfx.bump();
        this.toast.show(t('cozinha.fps.bump', 'Buraco na estrada!'), 1000);
        for (const l of this.loose.values()) {
          l.body.wakeUp();
          l.body.velocity.set((Math.random() - 0.5) * 2, 3 + Math.random() * 2, (Math.random() - 0.5) * 2);
        }
        for (const st of sim.st) if (st.item || st.n) st.bump = 1;
        if (host && Math.random() < 0.6) this.popOff(0, 0);
      } else if (th === 'boat') {
        this.chaosT = 7 + Math.random() * 5;
        const sway = Math.sin(this.time * 0.9);
        this.shake = 0.5;
        this.toast.show(t('cozinha.fps.wave', 'Onda! Segura a comida!'), 1100);
        if (host) this.popOff(Math.sign(sway || 1) * 2.5, 0);
      } else if (th === 'space') {
        this.chaosT = 9 + Math.random() * 6;
        // pulso de gravidade zero: tudo flutua
        for (const l of this.loose.values()) {
          l.body.wakeUp();
          l.body.velocity.y += 1.6 + Math.random();
        }
        if (host && Math.random() < 0.5) this.popOff(0, 0, 2.2);
      } else this.chaosT = 1e9;
    }
    // chão molhado (qualquer tema, a partir do dia 2)
    if (this.puddle) {
      this.puddle.t -= dt;
      const a = Math.min(1, this.puddle.t, (16 - this.puddle.t) * 2);
      (this.puddleMesh.material as THREE.MeshBasicMaterial).opacity = 0.55 * Math.max(0, a);
      if (this.puddle.t <= 0) {
        this.puddle = null;
        this.puddleMesh.visible = false;
      }
    } else if (sim.day >= 2 || qs.has('czpuddle')) {
      this.puddleT -= dt;
      if (this.puddleT <= 0) {
        this.puddleT = 35 + Math.random() * 25;
        this.makePuddle();
      }
    }
  }
  private makePuddle(): void {
    const s = this.sim;
    for (let k = 0; k < 20; k++) {
      const x = 1 + Math.floor(Math.random() * (s.cols - 2));
      const y = 1 + Math.floor(Math.random() * (s.rows - 2));
      if (!s.isFloor(x + 0.5, y + 0.5)) continue;
      this.puddle = { x: (x + 0.5) * T, z: (y + 0.5) * T, r: 0.75, t: 16 };
      this.puddleMesh.position.set(this.puddle.x, 0.012, this.puddle.z);
      this.puddleMesh.scale.set(0.75, 1, 0.55);
      this.puddleMesh.visible = true;
      this.toast.show(t('cozinha.fps.puddle', 'Chão molhado! Cuidado!'), 1300);
      this.parts.burst(this.puddle.x, 0.1, this.puddle.z, 14, 'foam', '#9fe8ff', 1.2);
      return;
    }
  }
  /** um item de bancada cai (barco balançou, caminhão pulou) */
  private popOff(vx: number, vz: number, vy = 1.2): void {
    const s = this.sim;
    const c: Station[] = [];
    for (const st of s.st) if (st.item && (st.k === 'counter' || st.k === 'board') && st.item.k !== IK.Ext && !(st.busy > 0)) c.push(st);
    if (!c.length) return;
    const st = c[Math.floor(Math.random() * c.length)];
    const it = st.item!;
    st.item = null;
    st.prog = 0;
    st.claim = 0;
    const l = this.addLoose(it, (st.x + 0.5) * T, H + 0.15, (st.y + 0.5) * T, false, 0);
    l.tried = st.i;
    l.body.velocity.set(vx + st.fx * 1.6, vy, vz + st.fy * 1.6);
    s.dropAt(it, st.x + 0.5, st.y + 0.5);
    this.float(t('cozinha.fps.oops', 'Opa!'), '', l.body.position.x, H + 0.6, l.body.position.z, '#ffffff');
  }

  /* ======================= itens soltos ======================= */
  private stepLoose(dt: number): void {
    const s = this.sim;
    const host = !s.o.client;
    // a Sim é a autoridade de quem está no chão: cria corpos novos / apaga sumidos
    for (const it of s.floor) {
      if (this.loose.has(it)) continue;
      const l = this.addLoose(it, it.x * T, Math.max(0.25, it.z * 0.5 + 0.25), it.y * T, false, 0);
      l.body.velocity.set((Math.random() - 0.5) * 1.5, 1.8, (Math.random() - 0.5) * 1.5);
    }
    // limite de corpos acordados pelo nível de qualidade
    let awake = 0;
    for (const l of this.loose.values()) if (l.body.sleepState !== CANNON.Body.SLEEPING) awake++;
    if (awake > this.q.maxBodies + 2)
      for (const l of this.loose.values())
        if (awake > this.q.maxBodies && l.age > 1.5 && l.body.velocity.lengthSquared() < 0.5 && l.body.sleepState !== CANNON.Body.SLEEPING) {
          l.body.sleep();
          awake--;
        }
    this.world.step(1 / 60, Math.min(0.05, dt), 3);
    for (const l of [...this.loose.values()]) {
      const it = l.it;
      const b = l.body;
      l.age += dt;
      if (!l.local && !s.floor.includes(it)) {
        // alguém (bot/host) pegou
        this.removeLoose(l);
        continue;
      }
      const p = b.position;
      const sp2 = b.velocity.lengthSquared();
      if (l.local) {
        if (p.y < -1 || p.y > WALL_H + 2 || p.x < -1 || p.z < -1 || p.x > s.cols * T + 1 || p.z > s.rows * T + 1) {
          this.removeLoose(l);
          continue;
        }
      } else if (host && this.rescuer && this.rescuer.check(l, p.x, p.y, p.z, sp2, dt) !== 'ok') {
        // nada se perde: volta (com "puf") para perto de você
        this.rescue(l);
        continue;
      }
      if (!l.local && host) {
        it.x = p.x / T;
        it.y = p.z / T;
        it.z = Math.max(0, p.y - 0.1);
      } else if (!l.local) {
        // cliente: segue a posição do host
        b.position.x += (it.x * T - b.position.x) * Math.min(1, dt * 6);
        b.position.z += (it.y * T - b.position.z) * Math.min(1, dt * 6);
      }
      // prato quebra com impacto forte
      if (l.hard > 6.2 && (it.k === IK.Plate || it.k === IK.Dirty) && l.age > 0.05) {
        this.shatter(l);
        continue;
      }
      if (l.hard > 6 && it.k === IK.Ing) {
        this.parts.burst(p.x, p.y, p.z, 6, 'chunk', INGS[compIng(it.c)].c[0], 1.4);
        sfx.splat();
      }
      l.hard = 0;
      // ímã de mira: arremesso que passa perto de uma estação "cai dentro" (diversão > precisão)
      if (l.by && b.velocity.y < 0.5 && p.y > H && p.y < H + 1.4) this.magnet(l);
      // entrou numa estação?
      const tx = Math.floor(p.x / T);
      const ty = Math.floor(p.z / T);
      if (tx >= 0 && ty >= 0 && tx < s.cols && ty < s.rows) {
        const si = s.stAt[ty * s.cols + tx];
        const st = si >= 0 ? s.st[si] : null;
        if (st && (st.fx || st.fy) && si !== l.tried && p.y > H - 0.1 && p.y < restY(st) + 0.55) {
          if (l.local) {
            this.net?.noteThrow(si, p.x / T, p.z / T);
            this.removeLoose(l);
            continue;
          }
          if (host) {
            const by = l.by ? s.players.find((q) => q.id === l.by) ?? null : null;
            const r = s.placeInto(si, it, by);
            if (r === 1) {
              this.removeLoose(l);
              s.takeFloor(it);
              this.landFx(st, l);
              continue;
            }
            if (r === 2) this.parts.burst(p.x, p.y + 0.1, p.z, 6, 'spark', '#ffe27a', 1);
            l.tried = si;
          }
        }
      }
      // bots pegam no ar (às vezes!)
      if (host && l.by && sp2 > 2 && p.y > 0.35 && p.y < 1.7) {
        let bi = 0;
        for (const q of s.players) {
          if (!q.bot) continue;
          bi++;
          if (q.hold || l.botTry & (1 << bi)) continue;
          const dx = q.x * T - p.x;
          const dz = q.y * T - p.z;
          if (dx * dx + dz * dz > 0.42) continue;
          l.botTry |= 1 << bi;
          if (Math.random() < 0.65) {
            s.takeFloor(it);
            this.removeLoose(l);
            q.hold = it;
            q.emote = 'joinha';
            q.emoteT = 1.6;
            q.happy = 1;
            sfx.catch();
            this.float(t('cozinha.fps.caught', 'Pegou!'), '', p.x, p.y + 0.6, p.z, '#7dffd8');
          } else {
            // quica na cabeça do colega
            b.velocity.x *= -0.4;
            b.velocity.z *= -0.4;
            b.velocity.y = 2.5;
            q.emote = 'uau';
            q.emoteT = 1.4;
            sfx.boing();
            this.float(t('cozinha.fps.bonk', 'Boing!'), '', p.x, p.y + 0.6, p.z, '#ff9ad5');
          }
          break;
        }
        if (!this.loose.has(it)) continue;
      }
      // voo local do cliente terminou no chão
      if (l.local) {
        l.still = sp2 < 0.05 ? l.still + dt : 0;
        if (l.still > 0.25 || l.age > 4) {
          this.net?.noteThrow(-1, p.x / T, p.z / T);
          this.removeLoose(l);
        }
      }
    }
  }
  /** item fora de alcance volta para o chão à sua frente */
  private rescue(l: Loose): void {
    const b = l.body;
    const p = b.position;
    this.parts.burst(p.x, p.y, p.z, 8, 'poof', '#ffffff', 0.9);
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    let x = this.px + fx * 0.7;
    let z = this.pz + fz * 0.7;
    if (!this.sim.isFloor(x / T, z / T)) {
      x = this.px;
      z = this.pz;
    }
    b.position.set(x, 1.3, z);
    b.velocity.set(0, 0.5, 0);
    b.angularVelocity.set(2, 3, 1);
    b.wakeUp();
    l.stuck = 0;
    l.tried = -1;
    this.parts.burst(x, 1.3, z, 10, 'spark', '#7dffd8', 1);
    feedback('rescue');
    this.float(t('cozinha.fps.back', 'Voltou!'), '', x, 1.7, z, '#7dffd8');
  }
  private magnet(l: Loose): void {
    const b = l.body;
    const tx = Math.floor(b.position.x / T);
    const ty = Math.floor(b.position.z / T);
    let best: Station | null = null;
    let bd = 0.62 * 0.62;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const st = this.stationAt(tx + dx + 0.5, ty + dy + 0.5);
        if (!st || (!st.fx && !st.fy) || st.i === l.tried || st.k === 'counter' || st.k === 'crate' || st.k === 'dirty') continue;
        const ex = (st.x + 0.5) * T - b.position.x;
        const ez = (st.y + 0.5) * T - b.position.z;
        const d = ex * ex + ez * ez;
        if (d < bd) {
          bd = d;
          best = st;
        }
      }
    if (!best) return;
    const k = 0.25;
    b.velocity.x += ((best.x + 0.5) * T - b.position.x) * k * 9 * (1 / 60) * 6;
    b.velocity.z += ((best.y + 0.5) * T - b.position.z) * k * 9 * (1 / 60) * 6;
    b.velocity.x *= 0.9;
    b.velocity.z *= 0.9;
  }
  /** efeitos de "acertou na estação" */
  private landFx(st: Station, l: Loose): void {
    const x = (st.x + 0.5) * T;
    const z = (st.y + 0.5) * T;
    const y = restY(st) + 0.1;
    const far = l.by && Math.hypot(x - this.px, z - this.pz) > 1.6;
    if (st.k === 'pot') {
      this.parts.burst(x, y + 0.15, z, 14, 'foam', '#bfefff', 1.6);
      sfx.bubble();
    } else if (st.k === 'pan') {
      this.parts.burst(x, y, z, 10, 'spark', '#ffd84a', 1.4);
      sfx.sizzle();
    } else if (st.k === 'trash') {
      this.parts.burst(x, y + 0.5, z, 8, 'poof', '#9fe08a', 1);
    } else this.parts.burst(x, y, z, 6, 'poof', '#ffffff', 0.8);
    if (far) {
      sfx.swish();
      this.float(t('cozinha.fps.swish', 'Cesta!'), '', x, y + 0.6, z, '#7dffd8');
    }
  }
  private shatter(l: Loose): void {
    const p = l.body.position;
    const it = l.it;
    this.removeLoose(l);
    if (!this.sim.o.client) this.sim.breakPlate(it);
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * 6.283;
      const sp = 1.5 + Math.random() * 2.5;
      this.parts.emit(p.x, p.y + 0.05, p.z, Math.cos(a) * sp, 1.5 + Math.random() * 2.5, Math.sin(a) * sp, { tile: PT.Chunk, color: i % 3 ? '#fffaf0' : '#9fd0ff', life: 0.9 + Math.random() * 0.4, size: 0.07 + Math.random() * 0.05, grav: 11 });
    }
    this.parts.burst(p.x, p.y, p.z, 6, 'poof', '#ffffff', 1);
    sfx.crash();
    this.shake = Math.max(this.shake, 0.35);
    this.float(t('cozinha.fps.crash', 'Craaash!'), '', p.x, p.y + 0.5, p.z, '#ff9ad5');
  }

  /* ======================= efeitos da Sim ======================= */
  onFx(e: FxEv): void {
    if (this.fallback) return this.fallback.onFx(e);
    const x = e.x * T;
    const z = e.y * T;
    const st = this.stationAt(e.x, e.y);
    const y = st ? restY(st) + 0.1 : H + 0.1;
    switch (e.t) {
      case FX.Chop: {
        const c = st?.item ? INGS[compIng(st.item.c)].c : ['#7be36b', '#7be36b', '#7be36b'];
        for (let i = 0; i < 3; i++) this.parts.emit(x, y + 0.05, z, (Math.random() - 0.5) * 2, 1.5 + Math.random() * 1.5, (Math.random() - 0.5) * 2, { tile: PT.Chunk, color: c[i % 3], life: 0.6, size: 0.05, grav: 10 });
        if (Math.hypot(x - this.px, z - this.pz) < 4) sfx.chop();
        break;
      }
      case FX.Sizzle:
        if (e.v) this.parts.burst(x, y + 0.2, z, 2, 'steam', '#ffffff', 0.5);
        else this.parts.burst(x, y + 0.05, z, 2, 'spark', '#fff3c4', 0.6);
        break;
      case FX.Done:
        this.parts.burst(x, y + 0.2, z, 10, 'spark', '#ffd84a', 1.5);
        break;
      case FX.Burn:
        this.parts.burst(x, y + 0.2, z, 8, 'poof', '#4a4458', 0.7);
        break;
      case FX.Fire:
        this.parts.burst(x, y + 0.2, z, 16, 'poof', '#ff7a2e', 1.6);
        this.shake = Math.max(this.shake, 0.6);
        sfx.fire();
        this.float(t('cozinha.fps.fire', 'FOGO!'), '', x, y + 0.9, z, '#ff7a2e');
        break;
      case FX.Ext:
        if (e.v) {
          this.parts.burst(x, y + 0.2, z, 12, 'poof', '#ffffff', 1.2);
          this.float(t('cozinha.fps.out', 'Apagou!'), '', x, y + 0.7, z, '#bff7ff');
        }
        break;
      case FX.Serve: {
        const tip = Math.max(0, this.sim.tips - this.lastTips);
        this.lastTips = this.sim.tips;
        for (let i = 0; i < 18; i++) this.parts.emit(x, y + 0.3, z, (Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3, { tile: i % 2 ? PT.Spark : PT.Chunk, color: i % 3 ? '#ffd84a' : '#ff5cc8', life: 1, size: 0.07, grav: 5 });
        this.float('+' + e.v, tip ? t('cozinha.fps.tip', '+{n} de gorjeta!', { n: tip }) : '', x, y + 0.7, z, '#ffe14a');
        // o cliente na janela comemora
        this.cheer = { t: 1.8, ok: true, skin: this.cheer.skin, x };
        feedback('serve');
        this.hes.poke();
        break;
      }
      case FX.Order:
        // a impressora cospe a comanda nova (som + papel saindo)
        this.printer?.print((c, w, h) => drawTicket(c, w, h, e.v, ++this.seenOrder));
        this.screenSig = '';
        break;
      case FX.Pick:
        if (st?.k === 'crate') {
          // alguém pegou na geladeira: a porta abre (ajudantes também)
          const d = this.props?.by[st.i]?.door;
          if (d) {
            if (!d.on) d.set(true);
            d.touch();
          }
        }
        if (st) this.hes.poke();
        break;
      case FX.Place:
        if (st) {
          feedback(e.v ? 'combine' : 'place', false);
          this.parts.burst(x, y + 0.05, z, e.v ? 8 : 4, e.v ? 'spark' : 'poof', e.v ? '#7dffd8' : '#ffffff', 0.7);
          this.hes.poke();
        }
        break;
      case FX.Wrong:
        this.float('?!', t('cozinha.fps.wrong', 'Não pediram isso!'), x, y + 0.6, z, '#ff4f6a');
        this.cheer = { t: 1.4, ok: false, skin: this.cheer.skin, x };
        feedback('wrong');
        this.shake = Math.max(this.shake, 0.25);
        break;
      case FX.Drop:
        if (st?.k === 'trash') this.lidT[st.i] = 0.9;
        this.parts.burst(x, 0.15, z, 4, 'poof', '#ffffff', 0.6);
        break;
      case FX.Wash:
        this.parts.burst(x, y + 0.1, z, 4, 'foam', '#e0feff', 0.8);
        break;
      case FX.Expire:
        this.toast.show(t('cozinha.fps.left', 'Um cliente cansou de esperar!'), 1200);
        break;
      case FX.Bump:
        break;
    }
  }
  private stationAt(x: number, y: number): Station | null {
    const s = this.sim;
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= s.cols || ty >= s.rows) return null;
    const i = s.stAt[ty * s.cols + tx];
    return i >= 0 ? s.st[i] : null;
  }
  private float(txt: string, sub: string, x: number, y: number, z: number, color: string): void {
    const f = this.floats[this.floatHead];
    this.floatHead = (this.floatHead + 1) % this.floats.length;
    f.el.innerHTML = '';
    f.el.textContent = txt;
    if (sub) {
      const s = document.createElement('small');
      s.textContent = sub;
      f.el.appendChild(s);
    }
    f.el.style.color = color;
    f.x = x;
    f.y = y;
    f.z = z;
    f.life = 1.5;
  }

  /* ======================= sprites (colegas, clientes, barras) ======================= */
  private sprite(): THREE.Sprite {
    let s = this.spr[this.sprUsed];
    if (!s) {
      s = new THREE.Sprite();
      this.scene.add(s);
      this.spr.push(s);
    }
    this.sprUsed++;
    s.visible = true;
    s.center.set(0.5, 0.5);
    return s;
  }
  private smat(key: string, mk: () => HTMLCanvasElement): THREE.SpriteMaterial {
    let m = this.sprMats.get(key);
    if (!m) {
      const tx = new THREE.CanvasTexture(mk());
      tx.colorSpace = THREE.SRGBColorSpace;
      m = new THREE.SpriteMaterial({ map: tx, transparent: true, alphaTest: 0.08, fog: true });
      this.sprMats.set(key, m);
    }
    return m;
  }

  /* ======================= desenho ======================= */
  draw(time: number, dt: number, q: QualitySettings): void {
    void q;
    if (this.fallback) return this.fallback.draw(time, dt, q);
    if (this.lost) return;
    const t0 = performance.now();
    const s = this.sim;
    const me = this.me;
    this.time += dt;
    if (!this.hand && me) this.spawnFromMe();
    // pausado/contagem: câmera continua posicionada
    if (dt === 0 || !me) this.placeCamera(0);
    this.chaos(dt);
    if (dt > 0) this.stepLoose(dt);
    const dim = s.outage ? 0.35 : 1;
    this.hemi.intensity = (this.q.standard ? 1.8 : 1.55) * dim;
    this.sun.intensity = (this.q.standard ? 1.6 : 1.3) * dim;
    this.sprUsed = 0;
    const I = this.items;
    I.begin();
    let fireN = 0;
    let fx = 0;
    let fz = 0;
    QB.identity();
    // ---------------- estações ----------------
    for (const st of s.st) {
      if (!st.fx && !st.fy) continue;
      const cx = (st.x + 0.5) * T;
      const cz = (st.y + 0.5) * T;
      const hop = st.bump > 0 ? Math.sin(st.bump * Math.PI) * 0.08 : 0;
      if (st.k === 'plates' || st.k === 'dirty') {
        const n = Math.min(8, st.n);
        MB.compose(V.set(cx, H + 0.03 + hop, cz), QB, SB);
        for (let i = 0; i < n; i++) {
          if (st.k === 'plates') I.cleanPlate(MB, i * 0.03, 1);
          else I.dirtyPlate(MB, i * 0.032, 1, i);
        }
      } else if (st.k === 'sink' && st.n > 0) {
        MB.compose(V.set(cx, H - 0.12, cz), QB, SB);
        for (let i = 0; i < Math.min(4, st.n); i++) I.dirtyPlate(MB, i * 0.03, 0.9, i);
        if (st.prog > 0) this.bar(cx, H + 0.75, cz, st.prog);
      } else if (st.k === 'crate') {
        // estoque dentro da geladeira/armário: 2 prateleiras de 3 (só quando a porta abre)
        const door = this.props?.by[st.i]?.door;
        if (door && (door.on || door.door.rotation.y !== 0)) {
          for (let i = 0; i < 6; i++) {
            const lx = -0.24 + (i % 3) * 0.24;
            const ly = i < 3 ? restY(st) : H + 0.46;
            const lz = -0.12 + (i % 2) * 0.08;
            MB.compose(V.set(cx + lx * st.fy + lz * st.fx, ly + hop, cz + lz * st.fy - lx * st.fx), QB.setFromAxisAngle(V2.set(0, 1, 0), i * 1.7), SB);
            I.ing(MB, st.ing * 16, false, 1.1, i);
          }
          QB.identity();
        }
      }
      const it = st.item;
      if (it) {
        let y = restY(st) + hop;
        if (st.k === 'board' && st.busy > 0) y += Math.abs(Math.sin(time * 22)) * 0.04;
        let ox = 0;
        if (st.k === 'belt') ox = st.prog * 0.8 - 0.4;
        const cooking = COOKERS[st.k] && it.k === IK.Ing && s.nextProc(it) === COOKERS[st.k] && !s.outage && (st.heat || !s.manualHeat);
        if (st.k === 'blender' && cooking) QB.setFromAxisAngle(V2.set(0, 1, 0), time * 18);
        MB.compose(V.set(cx + ox * (st.fy ? 1 : 0), y, cz + ox * (st.fx ? 1 : 0)), QB, SB);
        I.item(MB, it, st.k === 'pot' ? 0.9 : st.k === 'blender' ? 0.8 : 1);
        QB.identity();
        // barra de progresso / aviso de queimando
        const proc = COOKERS[st.k];
        const prog = it.k === IK.Ing ? it.prog : 0;
        const warn = proc && proc !== 'blend' && it.k === IK.Ing && !it.burnt && it.over > 1.5 && s.nextProc(it) !== proc && ((time * 6) | 0) % 2 === 0;
        if ((prog > 0 && prog < 1) || warn) this.bar(cx, restY(st) + 0.62, cz, prog, warn);
        if (cooking && (st.heat || !s.manualHeat)) {
          // vapor/chiado
          if (st.k === 'pot' && Math.random() < dt * 5) this.parts.burst(cx, H + 0.45, cz, 1, 'steam', '#ffffff', 0.4);
          if (st.k === 'pot' && Math.random() < dt * 2) sfx.bubble();
          if (st.k === 'pan' && Math.random() < dt * 6) this.parts.burst(cx, H + 0.15, cz, 1, 'spark', '#fff3c4', 0.8);
          if (st.k === 'oven' && Math.random() < dt * 2) this.parts.burst(cx, H + 0.75, cz, 1, 'steam', '#ffe8d0', 0.3);
        }
        if (it.burnt && st.fire <= 0 && Math.random() < dt * 3) this.parts.burst(cx, y + 0.2, cz, 1, 'poof', '#4a4458', 0.3);
      }
      if (this.stationProps(st, it, cx, cz, time, dt)) {
        // boca do fogão acesa (chama azul) — com ou sem panela cheia
        MB.compose(V.set(cx, H + 0.05, cz), QB, SB);
        for (let k = 0; k < 6; k++) {
          const a = k * 1.047 + time * 0.5;
          I.flame(MB, Math.cos(a) * 0.18, 0, Math.sin(a) * 0.18, 0.035, 0.05 + Math.sin(time * 20 + k) * 0.015, '#4fa8ff');
        }
      }
      if (st.k === 'board' && it && it.k === IK.Ing && it.prog > 0 && it.prog < 1 && !(it.prog > 0 && st.busy > 0)) this.bar(cx, restY(st) + 0.5, cz, it.prog);
      // fogo!
      if (st.fire > 0) {
        fireN++;
        fx = cx;
        fz = cz;
        MB.compose(V.set(cx, H + 0.02, cz), QB, SB);
        const k = 0.6 + st.fire * 0.6;
        for (let i = 0; i < 5; i++) {
          const a = i * 1.26 + st.i;
          const r = i ? 0.3 : 0;
          const fl = (0.7 + Math.sin(time * 17 + i * 2.1 + st.i) * 0.3) * k;
          I.flame(MB, Math.cos(a) * r, 0, Math.sin(a) * r, 0.16 * k, 0.55 * fl + 0.15, i % 2 ? '#ff5a2e' : '#ff8a2e');
          I.flame(MB, Math.cos(a) * r, 0.02, Math.sin(a) * r, 0.09 * k, 0.4 * fl, '#ffd84a');
        }
        if (Math.random() < dt * 14) this.flames.burst(cx + (Math.random() - 0.5) * 0.6, H + 0.2, cz + (Math.random() - 0.5) * 0.6, 1, 'flame', Math.random() < 0.5 ? '#ff7a2e' : '#ffcf2e', 1);
        if (Math.random() < dt * 4) this.parts.burst(cx, H + 0.9, cz, 1, 'poof', '#5a5068', 0.4);
      }
    }
    if (this.fireLight) {
      this.fireLight.intensity = fireN ? 4 + Math.sin(time * 23) * 1.2 : 0;
      this.fireLight.position.set(fx, H + 0.9, fz);
    }
    // ---------------- itens soltos ----------------
    for (const l of this.loose.values()) {
      const b = l.body;
      MB.compose(V.set(b.position.x, b.position.y - (l.it.k === IK.Plate || l.it.k === IK.Dirty ? 0.03 : l.it.k === IK.Ext ? 0.16 : 0.085), b.position.z), QB.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w), SB);
      I.item(MB, l.it, 1);
    }
    QB.identity();
    // ---------------- colegas (billboards 2D) ----------------
    let bi = 0;
    for (const p of s.players) {
      if (p === me && !qs.has('czshowme')) continue;
      const sp = this.sprite();
      const happy = p.happy > 0;
      sp.material = this.smat('pl' + p.skin + p.role + (happy ? 1 : 0), () => charSprite(p.skin, p.role, 128, happy));
      const moving = Math.hypot(p.vx, p.vy) > 0.3;
      const hop = moving ? Math.abs(Math.sin(p.walk * 3)) * 0.12 : 0;
      const sq = moving ? 1 + Math.sin(p.walk * 6) * 0.05 : 1 + Math.sin(time * 2 + bi) * 0.02;
      sp.center.set(0.5, 0.02);
      sp.position.set(p.x * T, hop, p.y * T);
      sp.scale.set(1.05 / sq, 1.32 * sq, 1);
      if (p.hold) {
        // item na frente do colega, na altura das mãos
        V.set(this.px - p.x * T, 0, this.pz - p.y * T).normalize();
        MB.compose(V2.set(p.x * T + V.x * 0.32, 0.62 + hop, p.y * T + V.z * 0.32), QB, SB);
        I.item(MB, p.hold, 0.9);
        if (p.hold.k === IK.Ext && p.acting > 0 && Math.random() < 0.7) this.parts.emit(p.x * T + p.fx * 0.4, 0.8, p.y * T + p.fy * 0.4, p.fx * 3, 0.3, p.fy * 3, { tile: PT.Foam, life: 0.6, size: 0.09, grow: 0.4, drag: 1.5 });
      }
      if (p.emote && p.emoteT > 0) {
        const e = this.sprite();
        const code = p.emote;
        e.material = this.smat('em' + code, () => {
          const c = document.createElement('canvas');
          c.width = 160;
          c.height = 120;
          const x = c.getContext('2d')!;
          drawEmoteBubble(x, code, 80, 112, 1.1, 1);
          return c;
        });
        e.center.set(0.5, 0);
        e.position.set(p.x * T, 1.35 + hop, p.y * T);
        e.scale.set(0.8, 0.6, 1);
      }
      if (p.bot && p.pet && !(p.emote && p.emoteT > 0)) {
        const e = this.sprite();
        const kind = p.pet;
        e.material = this.smat('pet' + kind, () => {
          const c = document.createElement('canvas');
          c.width = 96;
          c.height = 112;
          drawPetIcon(c.getContext('2d')!, kind, 48, 46, 40, 0);
          return c;
        });
        e.center.set(0.5, 0);
        e.position.set(p.x * T, 1.38 + hop + Math.sin(time * 4 + bi) * 0.03, p.y * T);
        e.scale.set(0.34, 0.4, 1);
      }
      if (p.acting > 0 && p.bot && !p.hold) {
        const st = p.target >= 0 ? s.st[p.target] : null;
        if (st?.k === 'sink' && Math.random() < dt * 8) this.parts.burst((st.x + 0.5) * T, H, (st.y + 0.5) * T, 1, 'foam', '#e0feff', 0.6);
      }
      bi++;
    }
    // ---------------- clientes no salão (o 1º da fila espera NA JANELA) ----------------
    const win = this.screen ? s.st.find((x) => x.k === 'window') : undefined;
    let first = true;
    for (const o of s.orders) {
      const c = this.sprite();
      const skin = SKINS_CUST[o.id % SKINS_CUST.length];
      const happy = o.t / o.max > 0.5;
      c.material = this.smat('cu' + skin + (happy ? 1 : 0), () => charSprite(skin, 'server', 128, happy));
      let sx = (((o.seat % s.seats) + 0.5) / s.seats) * s.cols * T;
      c.center.set(0.5, 0.02);
      const atWin = first && !!win && this.cheer.t <= 0;
      if (atWin) {
        sx = (win.x + 0.5) * T;
        this.cheer.skin = skin;
        c.position.set(sx, Math.abs(Math.sin(time * 3 + o.id)) * 0.04, -0.7 - (1 - o.a) * 2);
        c.scale.set(1.05, 1.3, 1);
      } else {
        c.position.set(sx, Math.abs(Math.sin(time * 3 + o.id)) * 0.04, -3.1 - (1 - o.a) * 2);
        c.scale.set(1, 1.25, 1);
      }
      first = false;
      if (atWin) continue;
      const bub = this.sprite();
      const rr = RECIPES[o.r];
      bub.material = this.smat('ord' + o.r, () => {
        const cv = document.createElement('canvas');
        cv.width = cv.height = 64;
        const x = cv.getContext('2d')!;
        x.beginPath();
        x.arc(32, 32, 30, 0, Math.PI * 2);
        x.fillStyle = '#ffffff';
        x.fill();
        x.lineWidth = 3;
        x.strokeStyle = '#2a0b5c';
        x.stroke();
        blitIng(x, rr.parts[rr.parts.length - 1], false, 32, 32, 44);
        return cv;
      });
      bub.position.set(sx + 0.4, 1.6 + Math.sin(time * 2 + o.id) * 0.05, -3.1);
      bub.scale.setScalar(0.5);
    }
    // comemoração (ou "?!") do cliente na janela
    if (this.cheer.t > 0 && win) {
      this.cheer.t -= dt;
      const ok = this.cheer.ok;
      const c = this.sprite();
      const skin = this.cheer.skin;
      c.material = this.smat('cu' + skin + (ok ? 1 : 0), () => charSprite(skin, 'server', 128, ok));
      c.center.set(0.5, 0.02);
      const hop = ok ? Math.abs(Math.sin(this.cheer.t * 9)) * 0.25 : 0;
      const wob = ok ? 0 : Math.sin(this.cheer.t * 30) * 0.06;
      c.position.set((win.x + 0.5) * T + wob, hop, -0.7);
      c.scale.set(1.05, 1.3, 1);
      const e = this.sprite();
      const code = ok ? 'coracao' : 'uau';
      e.material = this.smat('em' + code, () => {
        const cv = document.createElement('canvas');
        cv.width = 160;
        cv.height = 120;
        drawEmoteBubble(cv.getContext('2d')!, code, 80, 112, 1.1, 1);
        return cv;
      });
      e.center.set(0.5, 0);
      e.position.set((win.x + 0.5) * T, 1.45 + hop, -0.7);
      e.scale.set(0.8, 0.6, 1);
    }
    const h = this.held();
    // ---------------- mão ----------------
    if (this.hand) {
      const hd = this.hand;
      const ctx = this.ctxAct;
      let pose: Parameters<Hand['setPose']>[0] = h ? 'grab' : 'open';
      if (ctx === 'chop') pose = 'knife';
      else if (this.actOn && ctx === 'scrub') pose = 'sponge';
      hd.setPose(pose, '#ff5c7a');
      const k = Math.min(1, dt * 12);
      hd.chop += ((this.actOn && ctx === 'chop' ? 1 : 0) - hd.chop) * k;
      hd.scrub += ((this.actOn && (ctx === 'scrub' || ctx === 'spray') ? (ctx === 'spray' ? 0.25 : 1) : 0) - hd.scrub) * k;
      hd.stir += (0 - hd.stir) * k;
      hd.charge += (Math.max(0, this.charge) - hd.charge) * Math.min(1, dt * 20);
      hd.visible = this.fps && !qs.has('czauto');
      hd.update(dt, this.speedK, this.lastLook[0], this.lastLook[1]);
      // tranco sutil de câmera no impacto da faca
      if (hd.impact > 0.95 && this.fps) this.recoil = 1;
      if (this.speedK > 0.3 && dt > 0) {
        this.stepT -= dt * this.speedK;
        if (this.stepT <= 0) {
          this.stepT = 0.36;
          sfx.step();
        }
      }
    }
    // ---------------- item na mão + arco de mira ----------------
    if (h && this.fps) {
      const cam = this.camera;
      const plate = h.k === IK.Plate || h.k === IK.Dirty;
      const ext = h.k === IK.Ext;
      const ch = Math.max(0, this.charge);
      let sc = ext ? 0.62 : plate ? 0.62 : 0.55;
      if (this.hand && this.hand.visible) {
        // o item fica ENTRE OS DEDOS e acompanha a mão (antecipação, arremesso, squash & stretch)
        const hd = this.hand;
        hd.grip(V);
        const k = hd.k;
        if (ext) V.add(V2.set(-0.01, -0.2, -0.03).multiplyScalar(k));
        else if (plate) V.add(V2.set(-0.03, -0.035, -0.06).multiplyScalar(k));
        else V.add(V2.set(-0.004, -0.045, -0.035).multiplyScalar(k));
        sc *= k;
        SB.set(hd.squashX, hd.squashY, hd.squashX);
      } else {
        V.set(ext ? 0.2 : plate ? 0.08 : 0.13, (ext ? -0.42 : plate ? -0.25 : -0.16) - ch * 0.04, (ext ? -0.55 : plate ? -0.55 : -0.5) + ch * 0.07);
      }
      QB.setFromAxisAngle(V2.set(0, 1, 0), ext ? Math.PI / 2 : 0.3);
      MB.compose(V, QB, SB);
      MB.premultiply(cam.matrixWorld);
      I.item(MB, h, sc);
      QB.identity();
      SB.set(1, 1, 1);
    }
    if (this.charge >= 0 && h) this.arc(Math.max(0.05, this.charge));
    else this.landRing.visible = false;
    I.end();
    // ---------------- peças físicas, tela de pedidos, comanda ----------------
    this.props?.update(dt, time);
    this.printer?.update(dt, time);
    this.screenFrame(dt, time);
    // ---------------- mira / destaque ----------------
    this.highlight(time, dt);
    this.uiFrame(dt);
    // esconde sprites que sobraram
    for (let i = this.sprUsed; i < this.spr.length; i++) this.spr[i].visible = false;
    this.parts.update(dt, this.camera.fov, this.renderer.domElement.height);
    this.flames.update(dt, this.camera.fov, this.renderer.domElement.height);
    this.renderer.render(this.scene, this.camera);
    this.gov.sample(dt * 1000, performance.now() - t0);
  }

  /** peças físicas da estação (botões, torneira, tampa): sincroniza com a Sim, dicas, água. true = acende a boca do fogão */
  private stationProps(st: Station, it: Item | null, cx: number, cz: number, time: number, dt: number): boolean {
    const p = this.props?.by[st.i];
    const s = this.sim;
    if (!p) return false;
    const stove = st.k === 'pot' || st.k === 'pan';
    if (p.heat) {
      const c = p.heat;
      if (c.on !== st.heat) c.set(st.heat, true); // ajudante ligou / liquidificador desligou sozinho
      const waiting = s.manualHeat && !st.heat && st.fire <= 0 && !!it && it.k === IK.Ing && s.nextProc(it) === COOKERS[st.k];
      c.hint += ((waiting ? 1 : 0) - c.hint) * Math.min(1, dt * 6);
      if (st.k === 'blender' && st.heat && it) {
        // liquidificador batendo: treme e respinga
        if (Math.random() < dt * 8) this.parts.burst(cx, H + 0.5, cz, 1, 'foam', INGS[compIng(it.c)].c[0], 0.5);
      }
    }
    if (p.faucet) {
      const f = p.faucet;
      f.hint += ((st.n > 0 && !f.on ? 1 : 0) - f.hint) * Math.min(1, dt * 6);
      if (f.on) {
        // água caindo da bica + lava sozinho enquanto houver louça
        const sx = cx - st.fx * 0.18;
        const sz = cz - st.fy * 0.18;
        if (Math.random() < dt * 30) this.parts.emit(sx, H + 0.24, sz, (Math.random() - 0.5) * 0.2, -1.5, (Math.random() - 0.5) * 0.2, { tile: PT.Foam, color: '#9fe0ff', life: 0.35, size: 0.04, grav: 6 });
        if (st.n > 0 && !s.o.client && dt > 0) {
          s.washAt(st.i, dt * 0.8, this.me);
          this.dryT[st.i] = 0;
        } else if ((this.dryT[st.i] += dt) > 2.5) f.set(false);
        if (Math.random() < dt * 3) sfx.scrub();
      }
    }
    if (p.lid) {
      if (this.lidT[st.i] > 0) this.lidT[st.i] -= dt;
      let open = this.lidT[st.i] > 0 || (this.tgSt === st.i && !!this.held());
      if (!open)
        for (const l of this.loose.values()) {
          const b = l.body.position;
          if (Math.abs(b.x - cx) < 0.7 && Math.abs(b.z - cz) < 0.7 && b.y > H && b.y < H + 1.6) {
            open = true;
            break;
          }
        }
      if (open !== p.lid.on) p.lid.set(open, true);
    }
    void time;
    if (!stove || st.fire > 0) return false;
    if (s.manualHeat) return st.heat;
    return !!it && it.k === IK.Ing && s.nextProc(it) === COOKERS[st.k] && !s.outage;
  }

  private barKeys: string[] = Array.from({ length: 11 }, (_, i) => 'bar' + i);
  private bar(x: number, y: number, z: number, k: number, warn = false): void {
    const b = this.sprite();
    const q = Math.max(0, Math.min(10, Math.round(k * 10)));
    b.material = warn ? this.smat('warn', drawWarn) : this.smat(this.barKeys[q], () => drawBar(q / 10));
    b.position.set(x, y, z);
    b.scale.set(warn ? 0.3 : 0.4, warn ? 0.3 : 0.4, 1);
  }
  /** arco do arremesso: bolinhas + anel onde vai cair */
  private arc(power: number): void {
    const assisted = this.throwVel(power, TV);
    this.handPoint(V);
    let vx = TV.x;
    let vy = TV.y;
    let vz = TV.z;
    const g = this.world.gravity;
    let x = V.x;
    let y = V.y;
    let z = V.z;
    const step = 0.045;
    this.landRing.visible = false;
    for (let i = 0; i < 40; i++) {
      vx += g.x * step;
      vy += g.y * step;
      vz += g.z * step;
      x += vx * step;
      y += vy * step;
      z += vz * step;
      const tx = Math.floor(x / T);
      const ty = Math.floor(z / T);
      const st = this.stationAt(tx + 0.5, ty + 0.5);
      const floorY = st && (st.fx || st.fy) ? restY(st) : 0;
      if (y <= floorY || (st && !st.fx && !st.fy && y < H + 0.6)) {
        this.landRing.visible = true;
        this.landRing.position.set(x, Math.max(floorY, 0) + 0.02, z);
        (this.landRing.material as THREE.MeshBasicMaterial).color.set(assisted || (st && (st.fx || st.fy)) ? '#7dff9a' : '#ff5c7a');
        break;
      }
      if (i % 2 === 0) {
        MB.makeTranslation(x, y, z);
        this.items.put(GK.Sph, MB, 0, 0, 0, 0.03, 0.03, 0.03, i % 4 ? '#ffffff' : '#ff5c7a');
      }
    }
  }
  /** caixa de mira de uma estação (contorno/dica) */
  private stBox(si: number): THREE.Box3 | null {
    for (const tg of this.picker.list) if (tg.data.k === 0 && tg.data.st.i === si) return tg.box;
    return null;
  }
  /** onde a dica deve apontar: o botão do fogo / torneira se é isso que falta, senão a estação */
  private guideBox(st: Station): THREE.Box3 | null {
    const p = this.props?.by[st.i];
    const it = st.item;
    if (p?.heat && this.sim.manualHeat && !st.heat && it && it.k === IK.Ing && this.sim.nextProc(it) === COOKERS[st.k]) return p.heat.box;
    if (p?.faucet && st.n > 0 && !p.faucet.on && !this.held()) return p.faucet.box;
    return this.stBox(st.i);
  }
  private highlight(time: number, dt: number): void {
    const s = this.sim;
    const h = this.held();
    const on = this.fps && !qs.has('czauto');
    // ---- alvo: contorno + rótulo minúsculo preso ao objeto ----
    const cur = on ? this.picker.current : null;
    if (cur) {
      let label = '';
      let warn = false;
      const d = cur.data;
      if (d.k === 1) label = d.c.label();
      else if (d.k === 2) label = itemName(d.l.it);
      else {
        const st = d.st;
        label = stName(s, st);
        warn = st.fire > 0 || (!!h && h.k !== IK.Ext && s.wouldAccept(st.i, h) === 0);
        const p = this.props?.by[st.i];
        const it = st.item;
        if (!h && p?.heat && s.manualHeat && !st.heat && it && it.k === IK.Ing && s.nextProc(it) === COOKERS[st.k]) label += ' · ' + (st.k === 'blender' ? t('cozinha.fps.pressBtn', 'aperte o botão') : t('cozinha.fps.turnKnob', 'gire o botão'));
        else if (p?.faucet && st.n > 0 && !p.faucet.on) label += ' · ' + t('cozinha.fps.openTap', 'abra a torneira');
      }
      this.hover.show(cur.box, label, warn);
    } else this.hover.hide();
    this.hover.frame(this.camera, this.w, this.h, time);
    this.ret.classList.toggle('hot', !!cur);
    // ---- discos verdes: onde dá para soltar o que você segura ----
    this.snaps.begin();
    if (on && h && h.k !== IK.Ext) {
      this.snapT -= dt;
      if (this.snapT <= 0 || this.snapFor !== h) {
        this.snapT = 0.16;
        this.snapFor = h;
        this.snapSt.length = 0;
        this.snapK.length = 0;
        for (const st of s.st) {
          if (!st.fx && !st.fy) continue;
          const a = s.wouldAccept(st.i, h);
          if (!a) continue;
          // bancadas livres e lixo aceitam quase tudo: só brilham quando fazem sentido
          if (a === 1 && st.k === 'counter') continue;
          if (a === 1 && st.k === 'trash' && !(h.k === IK.Ing && h.burnt) && !(h.k === IK.Plate && h.parts.length && !s.orders.some((o) => h.parts.every((x) => RECIPES[o.r].parts.includes(x))))) continue;
          if (a === 1 && st.k === 'crate') continue;
          this.snapSt.push(st.i);
          this.snapK.push(a);
        }
      }
      for (let i = 0; i < this.snapSt.length; i++) {
        const st = s.st[this.snapSt[i]];
        this.snaps.add((st.x + 0.5) * T, restY(st), (st.y + 0.5) * T, st.k === 'window' ? 0.4 : 0.3, this.snapK[i] === 2);
      }
    } else this.snapFor = null;
    this.snaps.end(time);
    // ---- dica de "vá ali": só se o jogador hesitar ----
    const g = this.guide;
    const gst = g && g.st >= 0 ? s.st[g.st] : null;
    const key = gst ? gst.i + ':' + this.tipTxt + (h ? h.id : '') : '';
    const lvl = this.hes.update(on ? key : '', dt);
    let level: 0 | 1 | 2 = 0;
    if (gst) level = g!.strong ? lvl : lvl >= 1 ? 1 : 0;
    const gb = gst && level ? this.guideBox(gst) : null;
    this.beacon.set(gb, gb ? level : 0, this.tipTxt);
    this.beacon.frame(this.camera, this.w, this.h, time, !!gst && gst.i === this.tgSt);
    this.hb.glow(level >= 1 && !!gst && (this.tgSt === gst.i || (!!this.tgCtl && gb === this.tgCtl.box)));
  }

  /** tela de pedidos: redesenha só quando muda (e 4×/s para a barra de paciência) */
  private screenFrame(dt: number, time: number): void {
    const scr = this.screen;
    if (this.tipId && this.screenT <= dt) this.tipTxt = this.tip3d();
    if (!scr) return;
    const s = this.sim;
    this.screenT -= dt;
    const h = this.held();
    let sig = this.tipTxt + '|' + (h && h.k === IK.Plate ? h.parts.join(',') : '');
    for (const o of s.orders) sig += o.id + (o.a < 1 ? 'a' + o.a.toFixed(1) : '');
    if (sig === this.screenSig && this.screenT > 0) return;
    this.screenSig = sig;
    this.screenT = 0.25;
    scr.panel.draw((c, w, hh) => drawScreen(c, w, hh, s, h && h.k === IK.Plate ? h.parts : null, this.tipTxt, time));
    if (!s.orders.length) this.printer?.clear();
  }
  /** texto do passo do treino: vai para a nota adesiva da tela e para o balão da dica */
  tip(id: string, txt: string): void {
    this.tipId = id;
    this.tipRaw = txt;
    this.tipTxt = this.tip3d();
  }
  private tipId = '';
  private tipRaw = '';
  /** alguns passos do treino ganham texto do 3D (geladeira, botão do fogo, torneira) */
  private tip3d(): string {
    const id = this.tipId.replace(/^f/, '');
    const g = this.guide;
    const st = g && g.st >= 0 ? this.sim.st[g.st] : null;
    if (id === 'crate' && st?.k === 'crate') {
      const cold = this.props?.by[st.i]?.cold;
      const x = ingName(INGS[st.ing].id);
      return cold ? t('cozinha.fps.tutFridge', 'Abra a geladeira e pegue: {x}', { x }) : t('cozinha.fps.tutPantry', 'Abra o armário e pegue: {x}', { x });
    }
    if (id === 'chop') return t('cozinha.fps.tutChop', 'Toque em CORTAR várias vezes!');
    if (id === 'wash') return t('cozinha.fps.tutWash', 'Abra a torneira da pia');
    if (id === 'wait' && st && this.sim.manualHeat && !st.heat) return st.k === 'blender' ? t('cozinha.fps.tutBlend', 'Aperte o botão do liquidificador') : t('cozinha.fps.tutKnob', 'Gire o botão para ligar o fogo');
    return this.tipRaw;
  }

  /* ======================= HUD ======================= */
  private uiFrame(dt: number): void {
    const me = this.me;
    if (!me) return;
    const h = this.held();
    const v = this.verbDef;
    if (this.fps) {
      if (!v.label) v.label = t('cozinha.fps.pick', 'Pegar');
      const alt = v.id === 'chop' ? ALT_PICK() : null;
      this.hb.set(v, alt, !!h && v.id !== 'spray');
      this.hb.charge(h && this.charge >= 0 ? this.charge : -1);
    }
    // textos flutuantes no mundo
    for (const f of this.floats) {
      if (f.life <= 0) continue;
      f.life -= dt;
      f.y += dt * 0.5;
      V.set(f.x, f.y, f.z).project(this.camera);
      const vis = V.z < 1 && f.life > 0;
      f.el.style.opacity = vis ? String(Math.min(1, f.life * 2)) : '0';
      if (vis) f.el.style.transform = `translate(${((V.x + 1) / 2) * this.w}px,${((1 - V.y) / 2) * this.h}px) translate(-50%,-50%) scale(${1 + Math.max(0, f.life - 1.2) * 1.5})`;
    }
    if (this.hintT > 0) {
      this.hintT -= dt;
      if (this.hintT <= 0) this.hint.style.opacity = '0';
    }
  }

  /* ======================= WebGL perdido → 2D ======================= */
  private goto2D(): void {
    if (this.fallback) return;
    this.lost = true;
    this.fps = false;
    const c2 = document.createElement('canvas');
    c2.className = 'cz-cv';
    this.cv.after(c2);
    this.cv.style.display = 'none';
    this.layer.style.display = 'none';
    this.input.show(false);
    const f = new Render2D(c2);
    f.me = this.me;
    f.setSim(this.sim, 0);
    f.resize(this.w, this.h, Math.min(2, window.devicePixelRatio || 1), 52, this.h > this.w ? 150 : 8);
    this.fallback = f;
    if (this.me) {
      this.me.remote = false;
      if (this.me.hold && this.pendingThrow > 0) this.pendingThrow = 0;
    }
    // o que estava voando cai onde está
    for (const l of [...this.loose.values()]) if (l.local) this.removeLoose(l);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
    this.cv.removeEventListener('webglcontextlost', this.ctxLost);
    this.input.dispose();
    this.hb.dispose();
    this.hover.dispose();
    this.snaps.dispose();
    this.beacon.dispose();
    this.props?.dispose();
    this.screen?.dispose();
    this.printer?.dispose();
    disposeStickers();
    this.layer.remove();
    this.fallback?.destroy();
    this.hand?.dispose();
    this.items?.dispose();
    this.kit?.dispose();
    this.parts.dispose();
    this.flames.dispose();
    for (const m of [this.landRing, this.puddleMesh]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    for (const m of this.sprMats.values()) {
      m.map?.dispose();
      m.dispose();
    }
    for (const b of [...this.world.bodies]) this.world.removeBody(b);
    this.loose.clear();
    if (this.sim) {
      this.sim.physFloor = false;
      this.sim.manualHeat = false;
    }
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
    if (!this.lost) this.renderer.forceContextLoss();
    void this.host;
  }
}

/* ======================= verbo do botão da mão ======================= */
interface VCtx {
  sim: Sim;
  h: Item | null;
  st: Station | null;
  ctl: Control | null;
  loose: Loose | null;
  p: StProps | null;
  /** sim.wouldAccept(estação, mão) */
  acc: 0 | 1 | 2 | 3;
}
const VC: VCtx = { sim: null as unknown as Sim, h: null, st: null, ctl: null, loose: null, p: null, acc: 0 };
const FALLBACK: VerbDef = { id: 'pick', label: '', icon: 'grab', dim: true };
const V_: VerbDef[] = [];
/** objeto de verbo reaproveitado (sem alocação por quadro) */
function vd(slot: number, id: string, label: string, icon: string, hold = false, dim = false): VerbDef {
  let v = V_[slot];
  if (!v) v = V_[slot] = { id, label, icon };
  v.id = id;
  v.label = label;
  v.icon = icon;
  v.hold = hold;
  v.dim = dim;
  return v;
}
const ctlIcon = (st: Station): string => (st.k === 'sink' ? 'water' : st.k === 'window' || st.k === 'belt' ? 'bell' : st.k === 'blender' ? 'power' : 'fire');
/** primeira regra verdadeira decide: o que você segura > controle mirado > o que está na estação */
const VERB_RULES: VerbRule<VCtx>[] = [
  { when: (c) => c.h?.k === IK.Ext, verb: () => vd(0, 'spray', t('cozinha.spray', 'Apagar'), 'spray', true) },
  { when: (c) => !!c.ctl && !!c.st, verb: (c) => vd(0, 'ctl', c.ctl!.verb(c.ctl!.on), ctlIcon(c.st!)) },
  { when: (c) => !!c.h && !!c.st && c.acc === 3, verb: () => vd(0, 'serve', t('cozinha.fps.serveIt', 'Entregar'), 'serve') },
  { when: (c) => !!c.h && !!c.st && c.acc === 2, verb: (c) => vd(0, 'pick', putLabel(c.sim, c.st!, c.h!), 'plus') },
  { when: (c) => !!c.h && !!c.st && c.acc === 1, verb: (c) => vd(0, 'pick', putLabel(c.sim, c.st!, c.h!), 'put') },
  { when: (c) => !!c.h && !!c.st, verb: () => vd(0, 'nope', t('cozinha.fps.nope2', 'Não cabe aqui'), 'x', false, true) },
  { when: (c) => !!c.h, verb: () => vd(0, 'pick', t('cozinha.fps.dropIt', 'Soltar'), 'drop') },
  { when: (c) => !!c.st && c.st.fire > 0, verb: () => vd(0, 'pick', t('cozinha.fps.onFire', 'Pegando fogo!'), 'fire', false, true) },
  { when: (c) => !!c.p?.door && !c.p.door.on && !c.loose, verb: () => vd(0, 'open', t('cozinha.fps.open', 'Abrir'), 'door') },
  { when: (c) => !c.loose && c.st?.k === 'board' && !!c.st.item && c.sim.nextProc(c.st.item) === 'chop', verb: () => vd(0, 'chop', t('cozinha.fps.chopIt', 'Cortar'), 'knife', true) },
  { when: (c) => !c.loose && c.st?.k === 'sink' && c.st.n > 0, verb: () => vd(0, 'scrub', t('cozinha.fps.scrub', 'Esfregar'), 'scrub', true) },
  { when: (c) => !!c.loose, verb: (c) => vd(0, 'pick', t('cozinha.fps.pickX', 'Pegar {x}', { x: itemName(c.loose!.it).toLowerCase() }), 'grab') },
  { when: (c) => !!c.st, verb: (c) => vd(0, 'pick', pickLabel(c.st!), 'grab', false, !canTakeFrom(c.st!)) },
];
let altPick: VerbDef | null = null;
const ALT_PICK = (): VerbDef => (altPick ??= { id: 'pick', label: t('cozinha.fps.pick', 'Pegar'), icon: 'grab' });
function canTakeFrom(st: Station): boolean {
  return !!st.item || st.k === 'crate' || ((st.k === 'plates' || st.k === 'dirty') && st.n > 0);
}

/** "Pegar tomate", "Pegar prato"... (o que o botão faz ao olhar para a estação) */
function pickLabel(st: Station): string {
  if (st.fire > 0) return t('cozinha.fps.pick', 'Pegar');
  if (st.item) return t('cozinha.fps.pickX', 'Pegar {x}', { x: itemName(st.item).toLowerCase() });
  if (st.k === 'crate') return t('cozinha.fps.pickX', 'Pegar {x}', { x: ingName(INGS[st.ing].id).toLowerCase() });
  if (st.k === 'plates' && st.n > 0) return t('cozinha.fps.pickPlate', 'Pegar prato');
  if (st.k === 'dirty' && st.n > 0) return t('cozinha.fps.pickDirty', 'Pegar pratos sujos');
  return t('cozinha.fps.pick', 'Pegar');
}
/** "Colocar na panela", "Jogar no lixo"... */
function putLabel(s: Sim, st: Station, h: Item): string {
  void s;
  if (st.item && st.item.k === IK.Plate && h.k === IK.Ing) return t('cozinha.fps.putPlate', 'Colocar no prato');
  if (st.item && h.k === IK.Plate && st.item.k === IK.Ing) return t('cozinha.fps.scoop', 'Pôr no prato');
  switch (st.k) {
    case 'board':
      return t('cozinha.fps.putBoard', 'Colocar na tábua');
    case 'pot':
      return t('cozinha.fps.putPot', 'Colocar na panela');
    case 'pan':
      return t('cozinha.fps.putPan', 'Colocar na frigideira');
    case 'oven':
      return t('cozinha.fps.putOven', 'Colocar no forno');
    case 'blender':
      return t('cozinha.fps.putBlender', 'Colocar no liquidificador');
    case 'trash':
      return t('cozinha.fps.putTrash', 'Jogar no lixo');
    case 'sink':
      return t('cozinha.fps.putSink', 'Colocar na pia');
    case 'window':
    case 'belt':
      return t('cozinha.fps.serveIt', 'Entregar');
    default:
      return t('cozinha.fps.putCounter', 'Colocar na bancada');
  }
}
function itemName(it: Item): string {
  if (it.k === IK.Plate) return it.parts.length ? t('cozinha.fps.plateFull', 'Prato montado') : t('cozinha.fps.plate', 'Prato limpo');
  if (it.k === IK.Dirty) return t('cozinha.fps.dirty', 'Pratos sujos');
  if (it.k === IK.Ext) return t('cozinha.fps.ext', 'Extintor');
  return ingName(INGS[compIng(it.c)].id) + (it.burnt ? ' · ' + t('cozinha.fps.burnt', 'queimado') : '');
}
function stName(s: Sim, st: Station): string {
  if (st.fire > 0) return t('cozinha.fps.onFire', 'Pegando fogo!');
  switch (st.k) {
    case 'crate':
      return t('cozinha.fps.crate', 'Caixa de {x}', { x: ingName(INGS[st.ing].id) });
    case 'board':
      return t('cozinha.fps.board', 'Tábua de picar');
    case 'pot':
      return t('cozinha.fps.pot', 'Panela');
    case 'pan':
      return t('cozinha.fps.pan', 'Frigideira');
    case 'oven':
      return t('cozinha.fps.oven', 'Forno');
    case 'blender':
      return t('cozinha.fps.blender', 'Liquidificador');
    case 'plates':
      return t('cozinha.fps.plates', 'Pratos limpos ({n})', { n: st.n });
    case 'dirty':
      return t('cozinha.fps.dirtyPile', 'Pratos sujos ({n})', { n: st.n });
    case 'sink':
      return t('cozinha.fps.sink', 'Pia');
    case 'trash':
      return t('cozinha.fps.trash', 'Lixo');
    case 'window':
    case 'belt':
      return t('cozinha.fps.window', 'Entrega');
    default:
      return st.item ? itemName(st.item) : t('cozinha.fps.counter', 'Bancada');
  }
  void s;
}

function drawBar(k: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  x.fillStyle = '#2a0b5c';
  x.beginPath();
  x.roundRect(2, 24, 60, 16, 8);
  x.fill();
  x.fillStyle = '#3ee07a';
  x.beginPath();
  x.roundRect(5, 27, Math.max(4, 54 * k), 10, 5);
  x.fill();
  return c;
}
function drawWarn(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  x.beginPath();
  x.arc(32, 32, 26, 0, Math.PI * 2);
  x.fillStyle = '#ff4f6a';
  x.fill();
  x.lineWidth = 4;
  x.strokeStyle = '#2a0b5c';
  x.stroke();
  x.fillStyle = '#fff';
  x.font = gameFont(700, 36);
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('!', 32, 34);
  return c;
}
