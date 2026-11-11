/* ============================================================
 *  MODO RECEPÇÃO — você é o porteiro da noite. Visitantes (Bloops)
 *  chegam um por um no vidro. Compare com o CRACHÁ e a LISTA, use a
 *  lanterna, a lupa (olho mágico), pergunte quem é, e a luz UV (noite 3+).
 *  Decida: ABRIR / NEGAR / SEGURANÇA. Impostor que entra aparece no
 *  monitor da câmera de dentro e chama o Bocudo; hóspede barrado reclama.
 *  No fim: resumo com o que você deixou passar (aprender!).
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../../../../i18n';
import { tap } from '../../../../core/haptics';
import { FpsLimiter, settingsFor, type Tier } from '../../../../core/quality';
import { FpsControls, bindButton, type BoundButton } from '../../../../ui/touch';
import { AnoAudio } from '../../core/audio';
import { IC } from '../../core/icons';
import { Bocudo } from '../../core/models';
import { clamp, esc } from '../../core/util';
import { say } from '../../core/voice';
import { makeRenderer, snap, type ModeRun } from '../common';
import { MI, ModeUi, accSvg, dateSvg, stampSvg } from '../ui';
import { BEHAVE_OK, Visitor, disposeVisitorGeo, disposeVisitorTex, type Look } from '../visitor';
import { R_NIGHTS, STAMPS, rStars, toolsFor, planNight, type NightPlan, type RResult, type Tell, type VisitorPlan } from './data';
import { buildDesk, type Desk } from './desk';

export interface RecepcaoOpts {
  root: HTMLElement;
  night: number;
  seed: number;
  tier: Tier;
  tutorial: boolean;
  /** grava progresso / moedas / reportRun; devolve estrelas e moedas */
  finish(r: RResult): { stars: number; coins: number };
  onPause(): void;
  onMenu(): void;
  onPlay(night: number): void;
}

type Decision = 'open' | 'deny' | 'guard';
type State = 'intro' | 'walkin' | 'window' | 'leaving' | 'caught' | 'dawn' | 'over';

interface Rec {
  plan: VisitorPlan;
  decision: Decision;
  correct: boolean;
  snap: string;
  photo: string;
}

interface Walk {
  m: Visitor;
  pts: THREE.Vector3[];
  speed: number;
  done?: () => void;
}

export const TELL_ICON: Record<Tell, string> = {
  eyes: '👀',
  teeth: '🦷',
  smallTeeth: '🦷',
  color: '🎨',
  tint: '🎨',
  noAcc: '🎩',
  notList: '📋',
  shadow: '👤',
  spin: '🔄',
  still: '🗿',
  answer: '💬',
  blink: '😉',
  mirror: '🪞',
  uv: '🟣',
  stamp: '🔖',
  glitch: '📻',
  date: '📅',
  twice: '👥',
};
export function tellName(k: Tell): string {
  switch (k) {
    case 'eyes':
      return t('rec.tell.eyes', 'Olhos diferentes do crachá');
    case 'teeth':
      return t('rec.tell.teeth', 'Bocão cheio de dentes');
    case 'smallTeeth':
      return t('rec.tell.smallTeeth', 'Boca um pouco larga demais');
    case 'color':
      return t('rec.tell.color', 'Cor diferente da foto');
    case 'tint':
      return t('rec.tell.tint', 'Cor um pouquinho diferente');
    case 'noAcc':
      return t('rec.tell.noAcc', 'Faltava um acessório');
    case 'notList':
      return t('rec.tell.notList', 'Não estava na lista');
    case 'shadow':
      return t('rec.tell.shadow', 'Não tinha sombra');
    case 'spin':
      return t('rec.tell.spin', 'A cabeça girava demais');
    case 'still':
      return t('rec.tell.still', 'Parado demais, sem piscar');
    case 'answer':
      return t('rec.tell.answer', 'Disse outro nome');
    case 'blink':
      return t('rec.tell.blink', 'Os olhos piscavam fora do ritmo');
    case 'mirror':
      return t('rec.tell.mirror', 'O reflexo estava errado');
    case 'uv':
      return t('rec.tell.uv', 'Marcas escondidas na luz roxa');
    case 'stamp':
      return t('rec.tell.stamp', 'Carimbo errado no crachá');
    case 'glitch':
      return t('rec.tell.glitch', 'A voz chiava');
    case 'date':
      return t('rec.tell.date', 'Data errada no crachá');
    case 'twice':
      return t('rec.tell.twice', 'Já tinha entrado hoje');
  }
}

const _v = new THREE.Vector3();
const _q = new THREE.Vector3();

export class RecepcaoRun implements ModeRun {
  private r: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(62, 1, 0.05, 40);
  private desk: Desk;
  readonly ui: ModeUi;
  private ctl: FpsControls;
  private au = new AnoAudio();
  private limiter = new FpsLimiter(60);
  private ro: ResizeObserver;
  readonly plan: NightPlan;
  state: State = 'intro';
  private idx = -1;
  private cur: { p: VisitorPlan; m: Visitor; refl: Visitor | null; photo: string; snap: string; at: number } | null = null;
  private walks: Walk[] = [];
  private inside: Visitor[] = [];
  private guard: Visitor | null = null;
  private bocudo: Bocudo | null = null;
  readonly recs: Rec[] = [];
  danger = 0;
  complaints = 0;
  guards: number;
  private letIn = 0;
  private came = new Set<string>();
  private yaw = 0;
  private pitch = 0;
  private yawOff = 0;
  private light = false;
  private uv = false;
  private zoom = false;
  private fov = 62;
  private paused = false;
  private dead = false;
  private raf = 0;
  private last = 0;
  private t = 0;
  private sec = 0;
  private monT = 0;
  private monRT: THREE.WebGLRenderTarget;
  private monCanvas: HTMLCanvasElement | null = null;
  private monPx: Uint8Array;
  private flickT = 0;
  private stateT = 0;
  private btns: BoundButton[] = [];
  private bubble: HTMLDivElement | null = null;
  private bubbleT = 0;
  private photoCache = new Map<string, string>();
  private keyH: (e: KeyboardEvent) => void;
  private tutStep = 0;

  constructor(readonly o: RecepcaoOpts) {
    this.plan = planNight(o.night, o.seed);
    this.guards = this.plan.cfg.guards;
    this.r = makeRenderer(o.root, o.tier);
    this.limiter.cap = settingsFor(o.tier).fpsCap;
    this.desk = buildDesk();
    this.scene.add(this.desk.root);
    this.scene.background = new THREE.Color('#0a0c1c');
    this.scene.fog = new THREE.Fog('#0a0c1c', 9, 22);
    this.cam.rotation.order = 'YXZ';
    this.pitch = this.desk.cam.pitch;
    this.monRT = new THREE.WebGLRenderTarget(256, 192, { depthBuffer: true });
    this.monRT.texture.colorSpace = THREE.SRGBColorSpace;
    this.monPx = new Uint8Array(256 * 192 * 4);
    this.desk.monitorMat.map = this.monRT.texture;
    this.desk.monitorMat.needsUpdate = true;
    // luz do saguão mais fraca a partir da noite 2 (a lanterna ajuda)
    if (o.night >= 2) this.desk.vestLight.intensity = 4.5;
    this.ui = new ModeUi(o.root, 'rc-hud');
    this.buildHud();
    this.ctl = new FpsControls(o.root, { look: { mouse: true } });
    this.ctl.joy.setEnabled(false);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(o.root);
    this.resize();
    this.keyH = (e) => this.onKey(e);
    window.addEventListener('keydown', this.keyH);
    if (location.search.includes('debug')) (window as unknown as { __rec: RecepcaoRun }).__rec = this;
  }

  /* ============================== ciclo ============================== */
  start(): void {
    this.last = performance.now();
    const loop = () => {
      if (this.dead) return;
      this.raf = requestAnimationFrame(loop);
      const now = performance.now();
      if (!this.limiter.shouldRender(now)) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!this.paused) this.step(dt);
      this.render();
    };
    this.raf = requestAnimationFrame(loop);
    this.au.startHum();
    this.au.setHum(0.5);
    this.ui.toast(t('rec.tip.start', 'Compare cada visitante com o crachá e a lista!'), MI.card());
    say(t('rec.say.start', 'Você é o porteiro da noite. Compare cada visitante com o crachá!'), { urgent: true });
    setTimeout(() => !this.dead && this.nextVisitor(), 1600);
  }
  get inMatch(): boolean {
    return this.state !== 'over' && this.state !== 'caught';
  }
  get panelOpen(): boolean {
    return this.ui.panelOpen;
  }
  pause(): void {
    this.paused = true;
    this.au.setHum(0);
  }
  resume(): void {
    this.paused = false;
    this.last = performance.now();
    this.au.setHum(0.5);
  }
  /** avança N quadros (testes) */
  tick(n: number, dt = 1 / 30): void {
    for (let i = 0; i < n; i++) this.step(dt);
    this.render();
  }

  private resize(): void {
    const w = this.o.root.clientWidth || 1,
      h = this.o.root.clientHeight || 1;
    this.r.setSize(w, h, false);
    this.cam.aspect = w / h;
    this.cam.updateProjectionMatrix();
  }

  private step(dt: number): void {
    this.t += dt;
    this.stateT += dt;
    if (this.state !== 'over') this.sec += dt;
    this.desk.update(dt);
    // olhar (arrastar) — limitado, sentado na cadeira
    const lock = this.zoom || this.ui.panelOpen;
    const [lx, ly] = this.ctl.consumeLook(dt);
    if (!lock) {
      this.yaw = clamp(this.yaw - lx, -1.05, 1.05);
      this.pitch = clamp(this.pitch - ly, -0.75, 0.35);
    }
    if (this.ctl.key('KeyJ')) this.yaw = clamp(this.yaw + dt * 1.5, -1.05, 1.05);
    if (this.ctl.key('KeyL')) this.yaw = clamp(this.yaw - dt * 1.5, -1.05, 1.05);
    // caminhadas
    for (let i = this.walks.length - 1; i >= 0; i--) {
      const w = this.walks[i];
      const p = w.pts[0];
      const m = w.m.root.position;
      _v.set(p.x - m.x, 0, p.z - m.z);
      const d = _v.length();
      const st = w.speed * dt;
      w.m.walking = Math.min(1, w.m.walking + dt * 4);
      if (d > 1e-3) {
        const yaw = Math.atan2(-_v.x, -_v.z);
        let dy = yaw - w.m.root.rotation.y;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        w.m.root.rotation.y += dy * Math.min(1, dt * 8);
      }
      if (d <= st) {
        m.set(p.x, m.y, p.z);
        w.pts.shift();
        if (!w.pts.length) {
          this.walks.splice(i, 1);
          w.m.walking = 0;
          w.done?.();
        }
      } else m.addScaledVector(_v.normalize(), st);
    }
    for (const m of this.allVisitors()) {
      if (!this.walks.some((w) => w.m === m)) m.walking = Math.max(0, m.walking - dt * 4);
      m.update(dt);
    }
    this.syncMirror();
    // visitante no vidro: vira para a câmera
    if (this.cur && this.state === 'window') {
      const r = this.cur.m.root;
      let dy = Math.PI - r.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      r.rotation.y += dy * Math.min(1, dt * 5);
      if (!this.cur.p.beh.still) this.cur.m.lookYaw = Math.sin(this.t * 0.45) * 0.35 + (this.yaw + this.yawOff) * 0.25;
      if (!this.cur.snap && this.stateT > 0.6) this.cur.snap = this.snapVisitor(this.cur.m);
    }
    // porta lateral fechando sozinha / porta da rua
    this.desk.sideDoor.rotation.y *= 1 - Math.min(1, dt * 1.6);
    for (const [d, s] of [
      [this.desk.doorL, -1],
      [this.desk.doorR, 1],
    ] as [THREE.Object3D, number][])
      d.position.x += ((s * 0.75) / 2 - d.position.x) * Math.min(1, dt * 2);
    // pisca-pisca quando o perigo está alto
    if (this.danger >= 60 && this.state !== 'caught') {
      this.flickT -= dt;
      if (this.flickT <= 0) {
        this.flickT = 1.5 + Math.random() * 3;
        this.flicker();
      }
    }
    if (this.bocudo) this.bocudo.update(dt);
    if (this.state === 'caught') this.caughtStep(dt);
    if (this.state === 'dawn' && this.stateT > 2.6) this.finish(true);
    // balão
    if (this.bubble && this.cur) {
      this.bubbleT -= dt;
      this.cur.m.head.getWorldPosition(_q);
      _q.y += 0.55;
      _q.project(this.cam);
      this.bubble.style.left = `${((_q.x + 1) / 2) * 100}%`;
      this.bubble.style.top = `${((1 - _q.y) / 2) * 100}%`;
      if (this.bubbleT <= 0) this.closeBubble();
    }
    // câmera
    const targetYawOff = this.ui.panelOpen && this.panelKind === 'card' ? 0.32 : 0;
    this.yawOff += (targetYawOff - this.yawOff) * Math.min(1, dt * 6);
    const tf = this.zoom ? 27 : 62;
    this.fov += (tf - this.fov) * Math.min(1, dt * 7);
    if (Math.abs(this.cam.fov - this.fov) > 0.01) {
      this.cam.fov = this.fov;
      this.cam.updateProjectionMatrix();
    }
    const c = this.desk.cam;
    this.cam.position.set(c.x, c.y, c.z);
    if (this.zoom && this.cur) {
      this.cur.m.head.getWorldPosition(_q);
      _q.y += 0.02;
      const dir = _v.copy(_q).sub(this.cam.position);
      const zy = Math.atan2(-dir.x, -dir.z);
      const zp = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
      this.cam.rotation.set(zp, zy, 0);
    } else this.cam.rotation.set(this.pitch, this.yaw + this.yawOff, 0);
    this.cam.updateMatrixWorld();
    // lanterna segue o olhar
    this.cam.getWorldDirection(_v);
    this.desk.flash.target.position.copy(this.cam.position).addScaledVector(_v, 3);
    // monitor de dentro (~8 qps)
    this.monT -= dt;
    if (this.monT <= 0) {
      this.monT = 0.12;
      this.renderMonitor();
    }
    this.refreshHud();
    this.tutorialStep();
  }

  private render(): void {
    this.r.setRenderTarget(null);
    this.r.render(this.scene, this.cam);
  }

  private renderMonitor(): void {
    const prevFog = this.scene.fog;
    this.r.setRenderTarget(this.monRT);
    this.r.render(this.scene, this.desk.insideCam);
    if (this.monCanvas) {
      this.r.readRenderTargetPixels(this.monRT, 0, 0, 256, 192, this.monPx);
      const x = this.monCanvas.getContext('2d')!;
      const img = x.createImageData(256, 192);
      for (let y = 0; y < 192; y++) img.data.set(this.monPx.subarray((191 - y) * 1024, (192 - y) * 1024), y * 1024);
      x.putImageData(img, 0, 0);
    }
    this.r.setRenderTarget(null);
    this.scene.fog = prevFog;
  }

  private *allVisitorsGen(): Generator<Visitor> {
    if (this.cur) {
      yield this.cur.m;
      if (this.cur.refl) yield this.cur.refl;
    }
    for (const w of this.walks) if (!this.cur || (w.m !== this.cur.m && w.m !== this.cur.refl)) yield w.m;
    for (const m of this.inside) yield m;
    if (this.guard) yield this.guard;
  }
  private allVisitors(): Visitor[] {
    return Array.from(new Set(this.allVisitorsGen()));
  }

  /** reflexo no espelho da parede esquerda (espelhado e "dentro" do espelho) */
  private syncMirror(): void {
    const c = this.cur;
    if (!c || !c.refl) return;
    const p = c.m.root.position;
    const near = p.z < -1.2 && p.z > -3.4 && p.x < 1.8;
    c.refl.root.visible = near;
    // posição "de mentira" que aparece no espelho visto da mesa
    const rx = -3.05 - p.x * 0.2,
      rz = clamp(p.z - 0.95, -3.4, -2.3);
    c.refl.root.position.set(rx, 0, rz);
    c.refl.root.rotation.y = Math.atan2(-(this.desk.cam.x - rx), -(this.desk.cam.z - rz)) - (c.m.root.rotation.y - Math.PI) * 0.6;
    c.refl.walking = c.m.walking;
  }

  /* ============================== visitantes ============================== */
  private nextVisitor(): void {
    if (this.dead) return;
    if (this.danger >= 100) return this.startCaught();
    this.idx++;
    if (this.idx >= this.plan.visitors.length) {
      this.state = 'dawn';
      this.stateT = 0;
      const d = document.createElement('div');
      d.className = 'ano-dawn';
      this.o.root.appendChild(d);
      requestAnimationFrame(() => d.classList.add('on'));
      this.au.chime();
      say(t('rec.say.dawn', 'Amanheceu! O turno acabou.'), { urgent: true });
      return;
    }
    const p = this.plan.visitors[this.idx];
    const m = new Visitor(p.look, p.beh, this.desk.b.mats);
    m.root.position.copy(this.desk.outside);
    m.root.rotation.y = 0;
    this.scene.add(m.root);
    let refl: Visitor | null = null;
    if (!p.mirror.gone) {
      const rl: Look = { ...p.look, mouth: p.mirror.mouth || p.look.mouth };
      refl = new Visitor(rl, { ...p.beh, shadow: true, still: p.beh.still, headSpin: false, uvMark: false }, this.desk.b.mats);
      refl.root.scale.x = -1;
      this.scene.add(refl.root);
      refl.root.visible = false;
    }
    this.cur = { p, m, refl, photo: this.photoOf(p.card.look), snap: '', at: this.sec };
    this.state = 'walkin';
    this.stateT = 0;
    this.openStreetDoor();
    this.au.tone(660, 0.12, 'sine', 0.06);
    this.au.tone(523, 0.2, 'sine', 0.06, { delay: 0.14 });
    const s = this.desk.spot;
    this.walk(m, [this.desk.entry.clone(), new THREE.Vector3(s.x, 0, s.z - 0.5), s.clone()], 1.5, () => {
      this.state = 'window';
      this.stateT = 0;
      this.au.tone(1568, 0.25, 'triangle', 0.08);
      this.ui.el.classList.add('vis');
      this.updateCardThumb();
      this.babble(p.glitch && false);
    });
    this.closeBubble();
  }

  private walk(m: Visitor, pts: THREE.Vector3[], speed: number, done?: () => void): void {
    this.walks = this.walks.filter((w) => w.m !== m);
    this.walks.push({ m, pts, speed, done });
  }

  private openStreetDoor(): void {
    this.desk.doorL.position.x = -0.75 / 2 - 0.62;
    this.desk.doorR.position.x = 0.75 / 2 + 0.62;
    this.au.burst(0.4, 0.05, 1200, { q: 1 });
  }

  /** foto do crachá (aparência "verdadeira") */
  private photoOf(look: Look): string {
    const k = JSON.stringify(look);
    const c = this.photoCache.get(k);
    if (c) return c;
    const sc = new THREE.Scene();
    sc.background = new THREE.Color('#bfe6ff');
    sc.add(new THREE.HemisphereLight('#ffffff', '#8a7aa0', 2.4));
    const dl = new THREE.DirectionalLight('#ffffff', 1.4);
    dl.position.set(1, 2, 3);
    sc.add(dl);
    const m = new Visitor(look, BEHAVE_OK, this.desk.b.mats);
    m.root.rotation.y = Math.PI;
    m.hideShadow();
    m.update(0.01);
    sc.add(m.root);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 10);
    cam.position.set(0, 0.68, 2.3);
    cam.lookAt(0, 0.6, 0);
    const url = snap(this.r, sc, cam, 160, 160, 0.85);
    this.photoCache.set(k, url);
    return url;
  }
  /** foto do visitante como está agora (recap) */
  private snapVisitor(m: Visitor): string {
    const cam = new THREE.PerspectiveCamera(34, 1.3, 0.05, 20);
    m.head.getWorldPosition(_q);
    cam.position.set(0.25, 1.15, 0.25);
    cam.lookAt(_q.x, _q.y - 0.12, _q.z);
    return snap(this.r, this.scene, cam, 182, 140, 0.8);
  }

  /* ============================== decisão ============================== */
  decide(kind: Decision): void {
    const c = this.cur;
    if (!c || this.state !== 'window') return;
    if (kind === 'guard' && this.guards <= 0) {
      this.ui.toast(t('rec.noGuard', 'A segurança já foi chamada demais hoje!'), MI.shield(), true);
      this.au.bad();
      return;
    }
    tap('medium');
    this.setZoom(false);
    this.setUv(false);
    this.ui.close();
    this.closeBubble();
    this.ui.el.classList.remove('vis');
    const p = c.p;
    const correct = p.impostor ? kind !== 'open' : kind === 'open';
    if (!c.snap) c.snap = this.snapVisitor(c.m);
    this.recs.push({ plan: p, decision: kind, correct, snap: c.snap, photo: c.photo });
    if (p.card.icon) this.came.add(p.card.icon);
    this.state = 'leaving';
    this.stateT = 0;
    const done = () => {
      this.removeCur();
      setTimeout(() => !this.dead && this.nextVisitor(), 900);
    };
    if (kind === 'open') {
      this.desk.sideDoor.rotation.y = -1.3;
      this.desk.sideLamp.color.set('#3ee07a');
      setTimeout(() => this.desk.sideLamp.color.set('#ff3b5c'), 2600);
      this.au.tone(392, 0.25, 'square', 0.05);
      this.au.tone(523, 0.3, 'square', 0.05, { delay: 0.2 });
      const m = c.m;
      this.walk(m, [new THREE.Vector3(1.2, 0, -2.3), this.desk.sideDoorPos.clone(), this.desk.inside.clone()], 1.7, () => {
        this.moveInside(p, m);
        if (p.impostor) this.impostorInside();
        else {
          this.au.good();
        }
        done();
      });
      if (!p.impostor) this.ui.stamp(true, t('rec.welcome', 'Bem-vindo!'));
      if (c.refl) c.refl.root.visible = false;
      c.refl = null;
    } else if (kind === 'deny') {
      if (p.impostor) {
        this.ui.stamp(true, t('rec.caughtImp', 'Era um impostor!'));
        this.au.good();
        this.reveal(c.m);
        setTimeout(() => this.walk(c.m, [this.desk.entry.clone(), this.desk.outside.clone()], 2.6, done), 900);
      } else {
        this.complain();
        this.walk(c.m, [this.desk.entry.clone(), this.desk.outside.clone()], 1.2, done);
      }
      this.openStreetDoor();
    } else {
      this.guards--;
      this.au.alarm();
      const g = new Visitor({ color: '#4d7bff', eyes: 2, mouth: 0, hat: 'cap', hatColor: '#1d2a6b', glasses: true, scarf: null, bag: null }, BEHAVE_OK, this.desk.b.mats);
      g.root.position.copy(this.desk.inside);
      this.scene.add(g.root);
      this.guard = g;
      this.desk.sideDoor.rotation.y = -1.3;
      const s = this.desk.spot;
      this.walk(g, [this.desk.sideDoorPos.clone(), new THREE.Vector3(s.x + 0.75, 0, s.z - 0.2)], 2.4, () => {
        if (p.impostor) {
          this.ui.stamp(true, t('rec.guardOk', 'Segurança pegou o impostor!'));
          this.au.good();
          this.reveal(c.m);
        } else this.complain();
        this.openStreetDoor();
        setTimeout(() => {
          this.walk(c.m, [this.desk.entry.clone(), this.desk.outside.clone()], 2.2, done);
          this.walk(g, [new THREE.Vector3(0.6, 0, -4.2), this.desk.outside.clone()], 2.2, () => {
            g.root.removeFromParent();
            this.guard = null;
          });
        }, 700);
      });
    }
  }

  private complain(): void {
    this.complaints++;
    this.ui.stamp(false, t('rec.wasGuest', 'Era um hóspede de verdade!'));
    this.au.bad();
    this.ui.shake();
    this.showBubble(`<span class="big">😢</span>`, 2);
  }

  /** impostor barrado mostra quem é: treme, escurece, bocão */
  private reveal(m: Visitor): void {
    let k = 0;
    const iv = setInterval(() => {
      if (this.dead) return clearInterval(iv);
      k++;
      m.setColor(k % 2 ? '#2e1650' : m.look.color);
      m.root.position.x += k % 2 ? 0.04 : -0.04;
      if (k >= 8) {
        clearInterval(iv);
        m.setColor('#2e1650');
      }
    }, 90);
    this.au.squeal();
  }

  private moveInside(p: VisitorPlan, m: Visitor): void {
    // o modelo vai para o corredor de dentro (monitor)
    const spots = this.desk.insideSpots;
    const spot = p.impostor ? spots[0].clone().setX(spots[0].x + 0.25 * this.letIn).setZ(spots[0].z + 0.6) : spots[(this.inside.length % (spots.length - 1)) + 1];
    let mm = m;
    if (p.impostor) {
      mm = new Visitor({ ...p.look, mouth: 2 }, { ...p.beh, still: true, shadow: false, headSpin: false }, this.desk.b.mats);
      mm.setCreepy(this.desk.b.mats);
      mm.root.scale.setScalar(1.15);
      this.scene.add(mm.root);
      m.root.removeFromParent();
    }
    mm.root.position.copy(spot);
    mm.root.rotation.y = Math.atan2(-(this.desk.insideCam.position.x - spot.x), -(this.desk.insideCam.position.z - spot.z));
    this.inside.push(mm);
    if (this.cur && this.cur.m === m) this.cur.m = mm;
  }

  private impostorInside(): void {
    this.letIn++;
    this.danger = Math.min(100, this.danger + this.plan.cfg.danger);
    this.au.missed();
    this.flicker();
    this.ui.shake();
    this.ui.toast(t('rec.letIn', 'Ops! Era um impostor... olhe o monitor!'), IC.bocudo(), true);
    say(t('rec.say.letIn', 'Ops! Um impostor entrou!'), { urgent: true });
    this.q('[data-k="mon"]').classList.add('alert');
    if (this.danger >= 50 && !this.bocudo) this.bocudoInside();
  }

  private bocudoInside(): void {
    const b = new Bocudo();
    b.root.scale.setScalar(0.85);
    b.root.position.copy(this.desk.insideBocudo);
    b.root.rotation.y = Math.atan2(-(this.desk.insideCam.position.x - b.root.position.x), -(this.desk.insideCam.position.z - b.root.position.z));
    this.scene.add(b.root);
    this.bocudo = b;
    this.au.growl(-0.4);
  }

  private removeCur(): void {
    const c = this.cur;
    if (!c) return;
    if (!this.inside.includes(c.m)) c.m.root.removeFromParent();
    c.refl?.root.removeFromParent();
    this.cur = null;
  }

  private flicker(): void {
    const L = this.desk.vestLight;
    const base = L.intensity || (this.o.night >= 2 ? 4.5 : 9);
    L.intensity = 0.3;
    this.desk.vestBulb.color.set('#3a3a48');
    this.au.flicker();
    setTimeout(() => {
      if (this.dead || this.state === 'caught') return;
      L.intensity = base;
      this.desk.vestBulb.color.set('#fff1c8');
    }, 110 + Math.random() * 120);
  }

  /* ============================== pego ============================== */
  private startCaught(): void {
    this.state = 'caught';
    this.stateT = 0;
    this.setUv(false);
    this.setZoom(false);
    this.ui.close();
    this.desk.vestLight.intensity = 0;
    this.desk.vestBulb.color.set('#202028');
    this.desk.deskLight.intensity = 0.4;
    this.au.powerDown();
    if (!this.bocudo) this.bocudoInside();
    const b = this.bocudo!;
    b.root.position.set(0, -1.6, -1.05);
    b.root.rotation.y = Math.PI;
    b.root.scale.setScalar(1);
    this.yaw = 0;
    this.pitch = -0.05;
  }
  private caughtStep(dt: number): void {
    const b = this.bocudo;
    if (!b) return;
    const k = clamp(this.stateT / 1.4, 0, 1);
    b.root.position.y = -1.6 + (1 - (1 - k) * (1 - k)) * 1.2;
    b.open = 0.3 + clamp((this.stateT - 1.2) * 1.5, 0, 0.7);
    this.desk.flash.intensity = 14;
    this.desk.flash.color.set('#ff6f91');
    if (this.stateT > 1.6 && this.stateT - dt <= 1.6) {
      this.au.chomp();
      this.ui.shake();
      tap('heavy');
    }
    if (this.stateT > 2.4) this.finish(false);
  }

  /* ============================== fim ============================== */
  private finish(survived: boolean): void {
    if (this.state === 'over') return;
    this.state = 'over';
    this.o.root.querySelectorAll('.ano-dawn').forEach((e) => e.remove());
    const correct = this.recs.filter((r) => r.correct).length;
    const res: RResult = { night: this.o.night, survived, correct, total: this.recs.length, letIn: this.letIn, complaints: this.complaints, sec: Math.round(this.sec) };
    const { stars, coins } = this.o.finish(res);
    this.recap(res, stars, coins);
  }

  private recap(r: RResult, stars: number, coins: number): void {
    const tiles = this.recs
      .map((rc, i) => {
        const imp = rc.plan.impostor;
        const dIc = rc.decision === 'open' ? MI.door(true) : rc.decision === 'deny' ? MI.stop() : MI.shield();
        return `<button class="rc-tile ${rc.correct ? 'ok' : 'bad'}${imp ? ' imp' : ''}" data-i="${i}"><img src="${rc.snap}" alt=""><i class="d">${dIc}</i><i class="r">${rc.correct ? IC.check() : IC.cross()}</i>${
          imp ? `<span class="tl">${rc.plan.tells.map((x) => TELL_ICON[x]).join('')}</span>` : `<span class="tl ok">${esc(rc.plan.card.icon)}</span>`
        }</button>`;
      })
      .join('');
    const missed = this.recs.filter((x) => !x.correct).length;
    const head = r.survived
      ? r.night >= R_NIGHTS
        ? t('rec.allDone', 'Você foi o melhor porteiro de todas as noites!')
        : t('rec.nightDone', 'Noite {n} completa!', { n: r.night })
      : t('ano.caught', 'Você foi pego!');
    const p = this.ui.card(
      `<div class="rc-head"><div class="ano-h"><i>${r.survived ? IC.sun() : IC.bocudo()}</i>${esc(head)}</div>
<div class="stars">${[1, 2, 3].map((j) => `<i class="${j <= stars ? 'on' : ''}" style="animation-delay:${j * 0.15}s">${IC.star(j <= stars)}</i>`).join('')}</div></div>
<div class="stats"><span class="ano-stat"><i>${IC.check()}</i>${r.correct}/${r.total}</span><span class="ano-stat"><i>${IC.bocudo()}</i>${r.letIn}</span><span class="ano-stat"><i>${MI.angry()}</i>${r.complaints}</span><span class="ano-stat"><i>${coinIc()}</i>+${coins}</span></div>
<div class="rc-sub">${missed ? `<i>${MI.zoom()}</i>${esc(t('rec.recapTip', 'Toque numa foto para ver o que tinha de diferente'))}` : `<i>${IC.star()}</i>${esc(t('rec.perfect', 'Você acertou todos!'))}`}</div>
<div class="rc-grid">${tiles}</div>
<div class="btns">${r.survived && r.night < R_NIGHTS ? `<button class="ano-b2 go" data-next><i>${IC.play()}</i>${esc(t('ano.nextNight', 'Noite {n}', { n: r.night + 1 }))}</button>` : ''}<button class="ano-b2${r.survived ? '' : ' go'}" data-again><i>${r.survived ? IC.moon() : IC.play()}</i>${esc(r.survived ? t('ano.again', 'Repetir') : t('ano.retry', 'Tentar de novo'))}</button><button class="ano-b2" data-menu><i>${IC.book()}</i>${esc(t('ano.menu', 'Menu'))}</button></div>`,
      () => this.o.onMenu(),
      false,
      'rc-recap',
    );
    p.querySelector('[data-next]')?.addEventListener('click', () => this.o.onPlay(r.night + 1));
    p.querySelector('[data-again]')!.addEventListener('click', () => this.o.onPlay(r.night));
    p.querySelector('[data-menu]')!.addEventListener('click', () => this.o.onMenu());
    p.querySelectorAll<HTMLElement>('[data-i]').forEach((b) => b.addEventListener('click', () => this.recapDetail(p, Number(b.dataset.i))));
    const firstWrong = this.recs.findIndex((x) => !x.correct);
    if (firstWrong >= 0) setTimeout(() => !this.dead && p.isConnected && this.recapDetail(p, firstWrong), 900);
  }

  private recapDetail(p: HTMLElement, i: number): void {
    const rc = this.recs[i];
    if (!rc) return;
    p.querySelector('.rc-det')?.remove();
    const d = document.createElement('div');
    d.className = 'rc-det';
    const imp = rc.plan.impostor;
    const res = rc.correct ? t('rec.det.ok', 'Você acertou!') : imp ? t('rec.det.missImp', 'Você deixou um impostor entrar') : t('rec.det.missGuest', 'Era um hóspede de verdade');
    d.innerHTML = `<div class="ano-card"><button class="ano-x" data-y>${IC.close()}</button>
<div class="ano-h"><i>${rc.correct ? IC.check() : IC.cross()}</i>${esc(res)}</div>
<div class="cmp"><figure><img src="${rc.photo}" alt=""><figcaption><i>${MI.card()}</i></figcaption></figure><b>${imp ? '≠' : '='}</b><figure><img src="${rc.snap}" alt=""><figcaption><i>${IC.eye()}</i></figcaption></figure></div>
${imp ? `<div class="tells">${rc.plan.tells.map((x) => `<span><em>${TELL_ICON[x]}</em>${esc(tellName(x))}</span>`).join('')}</div>` : `<div class="tells"><span><em>${esc(rc.plan.card.icon)}</em>${esc(t('rec.det.real', 'Tudo igual ao crachá'))}</span></div>`}</div>`;
    d.addEventListener('click', () => d.remove());
    p.appendChild(d);
    const tl = rc.plan.tells[0];
    if (imp && tl) say(tellName(tl), { urgent: true, cool: 500 });
  }

  /* ============================== ferramentas ============================== */
  private panelKind: 'card' | 'mon' | null = null;

  private setLight(on: boolean): void {
    this.light = on;
    if (!this.uv) {
      this.desk.flash.color.set('#fff3d6');
      this.desk.flash.intensity = on ? 11 : 0;
    }
    this.au.click();
    this.q('[data-k="light"]').innerHTML = MI.light(on);
    this.q('[data-k="light"]').classList.toggle('on', on);
  }
  private setUv(on: boolean): void {
    if (this.uv === on) return;
    this.uv = on;
    const d = this.desk;
    if (on) {
      d.flash.color.set('#9a4dff');
      d.flash.intensity = 16;
      d.vestLight.color.set('#5b2bff');
      d.hemi.color.set('#5b2bff');
      d.hemi.intensity = 0.5;
      this.au.tone(120, 0.6, 'sawtooth', 0.03, { slide: 1.3 });
    } else {
      d.flash.color.set('#fff3d6');
      d.flash.intensity = this.light ? 11 : 0;
      d.vestLight.color.set('#ffe6b8');
      d.hemi.color.set('#8a96d0');
      d.hemi.intensity = 0.9;
    }
    for (const m of this.allVisitors()) m.setUv(on);
    this.o.root.classList.toggle('rc-uvon', on);
    const b = this.ui.el.querySelector('[data-k="uv"]');
    if (b) {
      b.innerHTML = MI.uv(on);
      b.classList.toggle('on', on);
    }
    const card = this.o.root.querySelector('.rc-idcard');
    card?.classList.toggle('uv', on);
  }
  private setZoom(on: boolean): void {
    if (on && (!this.cur || this.state !== 'window')) return;
    this.zoom = on;
    this.o.root.classList.toggle('rc-zoomon', on);
    this.q('[data-k="zoom"]').classList.toggle('on', on);
    if (on) this.ui.close();
  }

  private ask(): void {
    const c = this.cur;
    if (!c || this.state !== 'window') return;
    tap('light');
    say(t('rec.say.ask', 'Quem é você?'), { urgent: true, cool: 800 });
    this.showBubble(`<span class="q">❓</span><i class="mini">${MI.card()}</i>`, 1.2, 'me');
    setTimeout(() => {
      if (this.dead || this.cur !== c || this.state !== 'window') return;
      c.m.talk = 1;
      setTimeout(() => (c.m.talk = 0), 900);
      if (c.p.glitch) {
        const pool = ['🍓', '🌙', '⭐', '🐟', '❓', '▓', '🍄', '░'];
        this.showBubble(`<span class="big gl">${pool.map((e) => `<b>${e}</b>`).join('')}</span>`, 3.2, 'glitch');
        this.babble(true);
      } else {
        this.showBubble(`<span class="big">${esc(c.p.answer)}</span>`, 3.2);
        this.babble(false);
      }
    }, 1000);
  }

  private babble(glitch: boolean): void {
    const base = glitch ? 160 : 520 + Math.random() * 200;
    for (let i = 0; i < 5; i++) this.au.tone(base * (1 + (Math.random() - 0.5) * 0.4), 0.09, glitch ? 'sawtooth' : 'triangle', glitch ? 0.06 : 0.05, { delay: i * 0.11, slide: glitch ? 0.5 : 1.1 });
    if (glitch) this.au.burst(0.5, 0.08, 2400, { q: 0.5 });
  }

  private showBubble(html: string, sec: number, cls = ''): void {
    this.closeBubble();
    const b = document.createElement('div');
    b.className = 'rc-bubble ' + cls;
    b.innerHTML = html;
    this.ui.el.appendChild(b);
    this.bubble = b;
    this.bubbleT = sec;
  }
  private closeBubble(): void {
    this.bubble?.remove();
    this.bubble = null;
  }

  /** painel do crachá (esquerda) — a cena continua visível à direita */
  openCard(): void {
    const c = this.cur;
    if (!c || (this.state !== 'window' && this.state !== 'walkin')) return;
    tap('light');
    this.setZoom(false);
    const k = c.p.card;
    const st = STAMPS[k.stamp];
    const L = k.look;
    const acc = [L.hat !== 'none' ? accSvg(L.hat, L.hatColor) : '', L.glasses ? accSvg('glasses', '#1d1d2a') : '', L.scarf ? accSvg('scarf', L.scarf) : '', L.bag ? accSvg('bag', L.bag) : ''].filter(Boolean);
    this.panelKind = 'card';
    const p = this.ui.open(
      `<div class="rc-idcard${this.uv ? ' uv' : ''}"><button class="ano-x" data-x>${IC.close()}</button>
<div class="hd" style="--c:${st.color}"><i>${MI.card()}</i><span class="nm">${esc(k.icon)}</span></div>
<div class="bd"><div class="ph"><img src="${c.photo}" alt="">${k.uvMark ? `<span class="wm">${IC.star()}</span>` : ''}</div>
<div class="info"><div class="row"><span class="sw" style="background:${L.color}"></span><span class="eyes">${'👁'.repeat(L.eyes)}</span></div>
<div class="row acc">${acc.map((a) => `<i>${a}</i>`).join('') || '<i class="none">∅</i>'}</div>
<div class="row"><span class="dt">${dateSvg(k.date + 1)}</span><span class="stp">${stampSvg(st.shape, st.color, 40)}</span></div></div></div></div>`,
      () => (this.panelKind = null),
      'rc-cardpanel',
    );
    p.addEventListener('click', (e) => {
      if (e.target === p) this.ui.close();
    });
  }

  openMonitor(): void {
    tap('light');
    this.setZoom(false);
    this.panelKind = 'mon';
    this.q('[data-k="mon"]').classList.remove('alert');
    const p = this.ui.open(
      `<div class="rc-monbig"><button class="ano-x" data-x>${IC.close()}</button><canvas width="256" height="192"></canvas><div class="lbl"><b>REC</b>${esc(t('rec.insideCam', 'Câmera de dentro'))}</div></div>`,
      () => {
        this.monCanvas = null;
        this.panelKind = null;
      },
    );
    this.monCanvas = p.querySelector('canvas');
    this.renderMonitor();
  }

  /* ============================== HUD ============================== */
  private q = <T extends HTMLElement>(s: string) => this.ui.el.querySelector(s) as T;
  private lastHud = '';

  private buildHud(): void {
    const tools = toolsFor(this.o.night);
    const pl = this.plan;
    const st = STAMPS[pl.stamp];
    this.ui.el.innerHTML = `
<div class="ano-vig"></div>
<div class="rc-peep"></div>
<div class="rc-uvtint"></div>
<div class="ano-tl">
  <div class="ano-clock"><i>${IC.moon()}</i><b>00:00</b><em>${this.o.night}</em></div>
  <div class="ano-danger"><i>${IC.bocudo()}</i><div class="bar"><b></b></div></div>
  <div class="rc-chips"><span class="rc-chip cm"><i>${MI.angry()}</i><b>0</b></span><span class="rc-chip gd"><i>${MI.shield()}</i><b>${this.guards}</b></span></div>
</div>
<div class="rc-list"><i class="li">${MI.list()}</i><div class="gs">${pl.list.map((g) => `<span class="g" data-g="${esc(g.icon)}" style="--c:${g.look.color}">${esc(g.icon)}</span>`).join('')}</div><span class="today">${dateSvg(pl.date + 1, 26)}${stampSvg(st.shape, st.color, 26)}</span></div>
<div class="ano-tr"><button class="ano-btn" data-k="mon" aria-label="${esc(t('rec.insideCam', 'Câmera de dentro'))}">${MI.tv()}<span class="dot"></span></button><button class="ano-btn sm ano-pause" data-k="pause" aria-label="${esc(t('ano.pause', 'Pausa'))}">II</button></div>
<div class="rc-tools">
  <button class="ano-btn" data-k="light" aria-label="${esc(t('rec.tool.light', 'Lanterna'))}">${MI.light(false)}</button>
  <button class="ano-btn" data-k="zoom" aria-label="${esc(t('rec.tool.zoom', 'Olho mágico'))}">${MI.zoom()}</button>
  ${tools.includes('ask') ? `<button class="ano-btn" data-k="ask" aria-label="${esc(t('rec.tool.ask', 'Perguntar'))}">${MI.ask()}</button>` : ''}
  ${tools.includes('uv') ? `<button class="ano-btn" data-k="uv" aria-label="${esc(t('rec.tool.uv', 'Luz UV'))}">${MI.uv(false)}</button>` : ''}
</div>
<button class="rc-cardbtn" data-k="card" aria-label="${esc(t('rec.tool.card', 'Crachá'))}"><img alt=""><i>${MI.card()}</i></button>
<div class="rc-dec">
  <button class="rc-d open" data-k="open"><i>${MI.door(true)}</i><span>${esc(t('rec.open', 'ABRIR'))}</span></button>
  <button class="rc-d deny" data-k="deny"><i>${MI.stop()}</i><span>${esc(t('rec.deny', 'NEGAR'))}</span></button>
  <button class="rc-d guard" data-k="guard"><i>${MI.shield()}</i><span>${esc(t('rec.guard', 'SEGURANÇA'))}</span><em>${this.guards}</em></button>
</div>`;
    const bind = (k: string, f: () => void) => {
      const el = this.ui.el.querySelector<HTMLElement>(`[data-k="${k}"]`);
      if (el) this.btns.push(bindButton(el, { onPress: () => f() }));
    };
    bind('pause', () => this.o.onPause());
    bind('mon', () => this.openMonitor());
    bind('light', () => this.setLight(!this.light));
    bind('zoom', () => this.setZoom(!this.zoom));
    bind('ask', () => this.ask());
    bind('uv', () => this.setUv(!this.uv));
    bind('card', () => (this.ui.panelOpen && this.panelKind === 'card' ? this.ui.close() : this.openCard()));
    bind('open', () => this.decide('open'));
    bind('deny', () => this.decide('deny'));
    bind('guard', () => this.decide('guard'));
  }

  private updateCardThumb(): void {
    const img = this.q('.rc-cardbtn img') as unknown as HTMLImageElement;
    if (this.cur) img.src = this.cur.photo;
  }

  private refreshHud(): void {
    const n = this.plan.visitors.length;
    const done = Math.max(0, this.idx) + (this.state === 'dawn' || this.state === 'over' ? 1 : 0);
    const min = Math.min(360, (done / n) * 360);
    const clock = `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(Math.floor(min % 60)).padStart(2, '0')}`;
    const key = `${clock}|${Math.round(this.danger)}|${this.complaints}|${this.guards}|${[...this.came].join('')}|${this.state}`;
    if (key === this.lastHud) return;
    this.lastHud = key;
    this.q('.ano-clock b').textContent = clock;
    this.q('.ano-danger .bar b').style.width = `${Math.round(this.danger)}%`;
    this.q('.ano-danger').classList.toggle('hot', this.danger >= 60);
    this.q('.ano-vig').classList.toggle('red', this.danger >= 70);
    this.q('.rc-chip.cm b').textContent = String(this.complaints);
    this.q('.rc-chip.cm').classList.toggle('hot', this.complaints > 0);
    this.q('.rc-chip.gd b').textContent = String(this.guards);
    this.q('.rc-d.guard em').textContent = String(this.guards);
    this.q('.rc-d.guard').classList.toggle('no', this.guards <= 0);
    this.ui.el.querySelectorAll<HTMLElement>('.rc-list .g').forEach((g) => g.classList.toggle('came', this.came.has(g.dataset.g!)));
    this.ui.el.classList.toggle('decide', this.state === 'window');
  }

  /** dicas da 1ª noite (passo a passo, só uma vez) */
  private tutorialStep(): void {
    if (!this.o.tutorial || this.state !== 'window' || this.idx !== 0) return;
    if (this.tutStep === 0 && this.stateT > 0.5) {
      this.tutStep = 1;
      this.q('[data-k="card"]').classList.add('glow');
      this.ui.toast(t('rec.tut.card', 'Toque no crachá e compare com o visitante.'), MI.card());
      say(t('rec.tut.card', 'Toque no crachá e compare com o visitante.'), { urgent: true });
    } else if (this.tutStep === 1 && this.ui.panelOpen) {
      this.tutStep = 2;
      this.q('[data-k="card"]').classList.remove('glow');
    } else if (this.tutStep === 2 && !this.ui.panelOpen) {
      this.tutStep = 3;
      this.ui.el.querySelector('.rc-dec')!.classList.add('glow');
      this.ui.toast(t('rec.tut.decide', 'Igual? ABRIR. Diferente? NEGAR!'), MI.door(true));
      say(t('rec.tut.decide', 'Igual? ABRIR. Diferente? NEGAR!'), { urgent: true });
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (e.repeat || this.paused) return;
    const k = e.code;
    if (k === 'KeyC') this.ui.panelOpen ? this.ui.close() : this.openCard();
    else if (k === 'KeyF') this.setLight(!this.light);
    else if (k === 'KeyZ') this.setZoom(!this.zoom);
    else if (k === 'KeyQ') this.ask();
    else if (k === 'KeyU' && toolsFor(this.o.night).includes('uv')) this.setUv(!this.uv);
    else if (k === 'KeyM') this.openMonitor();
    else if (k === 'Digit1') this.decide('open');
    else if (k === 'Digit2') this.decide('deny');
    else if (k === 'Digit3') this.decide('guard');
  }

  /* ============================== debug ============================== */
  /** decide sabendo a resposta (testes): certo / errado */
  debugDecide(right: boolean, guard = false): void {
    const c = this.cur;
    if (!c) return;
    const imp = c.p.impostor;
    this.decide(right ? (imp ? (guard ? 'guard' : 'deny') : 'open') : imp ? 'open' : 'deny');
  }
  debugLook(yaw: number, pitch: number): void {
    this.yaw = yaw;
    this.pitch = pitch;
  }

  dispose(): void {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.keyH);
    this.ro.disconnect();
    for (const b of this.btns) b.destroy();
    this.ctl.dispose();
    this.ui.dispose();
    this.au.dispose();
    this.o.root.classList.remove('rc-uvon', 'rc-zoomon');
    this.o.root.querySelectorAll('.ano-dawn').forEach((e) => e.remove());
    this.monRT.dispose();
    this.desk.b.dispose();
    disposeVisitorGeo();
    disposeVisitorTex();
    this.r.dispose();
    this.r.forceContextLoss();
    this.r.domElement.remove();
  }
}

function coinIc(): string {
  return `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="#ffcf2e" stroke="#1d0b3a" stroke-width="4"/><circle cx="32" cy="32" r="16" fill="none" stroke="#e98f00" stroke-width="4"/></svg>`;
}
export { rStars };
