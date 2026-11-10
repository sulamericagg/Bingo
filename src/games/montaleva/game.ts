/* ============================================================
 *  MONTA & LEVA — jogo (chunk sob demanda).
 *  Fluxo: menu → fases → OFICINA DE MONTAGEM (arrastar peças na grade) → PISTA (física) →
 *         entrega (estrelas, engrenagens) | falha (volta na hora para a montagem, projeto preservado).
 *  Canvas 2D para o mundo; HUD em DOM (botões grandes, nítidos, acessíveis).
 * ============================================================ */
import { pushBack } from '../../core/back';
import { addCoins } from '../../core/economy';
import { success, tap } from '../../core/haptics';
import { lockOrientation } from '../../core/orientation';
import { QualityGovernor } from '../../core/quality';
import { reportRun, type MiniGameHandle } from '../../hub/registry';
import { fmt, t } from '../../i18n';
import { bindButton, type BoundButton } from '../../ui/touch';
import { clearNotify, notify, objective, resetNotifyTop, setNotifyTop } from '../../ui/notify';
import { MLAudio } from './audio';
import { History, analyze, canPlace, countOf, normRot, partAt, partCost, removeAt, snapCells, type PlaceError } from './design';
import { LEVELS, chapterName, chapterOf, type LevelDef } from './levels';
import { PARTS, PART_IDS, U, cellsOf, footprint, partDesc, partName, type PartId, type Placed } from './parts';
import {
  COL,
  INK,
  Particles,
  cargoPieces,
  colorOf,
  drawBackground,
  drawBalloon,
  drawCargo,
  drawLink,
  drawObj,
  drawStructCell,
  drawThruster,
  drawTrack,
  drawWheel,
  drawZone,
  partIcon,
  setPalette,
  structSilhouette,
  wx,
  wy,
  type View,
} from './render';
import { levelRec, mlSave, persistML, starsOf, unlockedUpTo } from './save';
import { DT, Sim, designCOM, norm } from './sim';
import { IC, injectMLCss } from './style';
import { resolveTrack, type Track } from './track';

type Screen = 'menu' | 'levels' | 'shop' | 'settings' | 'build' | 'test';

interface TutStep {
  t?: PartId;
  r?: number;
  cells?: [number, number][];
  need?: number;
  test?: boolean;
  msg: () => string;
}

const TUTORIAL: Record<number, TutStep[]> = {
  1: [
    { t: 'wheelS', cells: [[4, 1]], need: 2, msg: () => t('ml.tut.wheel', 'Arraste a roda até o bloco da ponta') },
    { t: 'motor', cells: [[2, 2]], need: 1, msg: () => t('ml.tut.motor', 'Agora o motor: ele gira as rodas perto dele') },
    { test: true, msg: () => t('ml.tut.test', 'Pronto! Toque em Testar') },
  ],
  2: [
    { t: 'block', cells: [[1, 1], [2, 1], [3, 1], [4, 1]], need: 4, msg: () => t('ml.tut.base', 'Monte a base: blocos lado a lado se encaixam') },
    { t: 'wheelS', cells: [[1, 1], [4, 1]], need: 2, msg: () => t('ml.tut.wheels', 'Uma roda em cada ponta') },
    { t: 'motor', cells: [[2, 2]], need: 1, msg: () => t('ml.tut.motor2', 'Motor perto das rodas') },
    { test: true, msg: () => t('ml.tut.test', 'Pronto! Toque em Testar') },
  ],
  3: [
    { t: 'beam', r: 1, cells: [[0, 1]], need: 1, msg: () => t('ml.tut.rotate', 'Toque em Girar para deixar a viga em pé') },
    { t: 'beam', r: 0, cells: [[1, 1]], need: 1, msg: () => t('ml.tut.beam', 'Outra viga, deitada, vira o piso') },
    { t: 'block', cells: [[4, 1], [4, 2]], need: 2, msg: () => t('ml.tut.wall', 'Paredes seguram a bola no lugar') },
    { t: 'wheelS', cells: [[0, 1], [4, 1]], need: 2, msg: () => t('ml.tut.wheels', 'Uma roda em cada ponta') },
    { t: 'motor', cells: [[3, 2]], need: 1, msg: () => t('ml.tut.motor2', 'Motor perto das rodas') },
    { test: true, msg: () => t('ml.tut.test', 'Pronto! Toque em Testar') },
  ],
};

const UPGRADES: { id: 'motor' | 'grip' | 'spring' | 'pad'; cost: [number, number]; name: () => string; desc: () => string; part: PartId }[] = [
  { id: 'motor', cost: [60, 150], name: () => t('ml.up.motor', 'Motor turbo'), desc: () => t('ml.up.motorD', '+25% de força por nível'), part: 'motor' },
  { id: 'grip', cost: [50, 130], name: () => t('ml.up.grip', 'Pneus macios'), desc: () => t('ml.up.gripD', '+15% de aderência por nível'), part: 'wheelS' },
  { id: 'spring', cost: [40, 110], name: () => t('ml.up.spring', 'Molas firmes'), desc: () => t('ml.up.springD', 'Suspensão mais firme e estável'), part: 'spring' },
  { id: 'pad', cost: [50, 130], name: () => t('ml.up.pad', 'Espuma protetora'), desc: () => t('ml.up.padD', 'O vidro aguenta pancadas mais fortes'), part: 'basket' },
];
const PALS: { id: string; cost: number; name: () => string; sw: string[] }[] = [
  { id: 'classic', cost: 0, name: () => t('ml.pal.classic', 'Clássica'), sw: ['#5b8def', '#8a6cf0', '#f2a541', '#ef5d60'] },
  { id: 'pastel', cost: 80, name: () => t('ml.pal.pastel', 'Pastel'), sw: ['#8fb3f5', '#b7a3f5', '#f7c98a', '#f59a9c'] },
  { id: 'citrus', cost: 100, name: () => t('ml.pal.citrus', 'Cítrica'), sw: ['#4cc38a', '#25a5b8', '#ffcf3d', '#ff6b3d'] },
  { id: 'graphite', cost: 120, name: () => t('ml.pal.graphite', 'Grafite'), sw: ['#4a5568', '#5f6b80', '#718096', '#e8505b'] },
];

const DEMO_TRACK = resolveTrack(
  [
    ['f', 3],
    ['b', 4, 0.5],
    ['f', 3],
    ['r', 3, 0.9],
    ['f', 3],
    ['r', 3, -0.9],
    ['f', 3],
    ['b', 3, 0.4],
    ['f', 4],
    ['zone', 4],
  ],
  6.5,
);
const DEMO_LEVEL: LevelDef = {
  n: 0,
  grid: [10, 6],
  parts: {},
  cargo: [{ t: 'crate', x: 3, y: 2 }],
  track: [
    ['f', 3],
    ['b', 4, 0.5],
    ['f', 3],
    ['r', 3, 0.9],
    ['f', 3],
    ['r', 3, -0.9],
    ['f', 3],
    ['b', 3, 0.4],
    ['f', 4],
    ['zone', 4],
  ],
  goals: { time: 0, parts: 0 },
};
const DEMO_CAR: Placed[] = [
  { t: 'spring', x: 1, y: 1, r: 0 },
  { t: 'block', x: 2, y: 1, r: 0 },
  { t: 'motor', x: 3, y: 1, r: 0 },
  { t: 'block', x: 4, y: 1, r: 0 },
  { t: 'spring', x: 5, y: 1, r: 0 },
  { t: 'tri', x: 6, y: 1, r: 0 },
  { t: 'block', x: 2, y: 2, r: 0 },
  { t: 'tri', x: 4, y: 2, r: 1 },
  { t: 'wheelL', x: 1, y: 1, r: 0 },
  { t: 'wheelL', x: 5, y: 1, r: 0 },
];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const sec = (s: number) => s.toFixed(1).replace('.', t('ml.decimal', ','));

export async function launch(root: HTMLElement, exit: () => void): Promise<MiniGameHandle> {
  injectMLCss();
  return new MontaLeva(root, exit);
}

interface Drag {
  kind: 'new' | 'move';
  t: PartId;
  r: number;
  from: number; // índice movido (move)
  orig?: Placed;
  sx: number;
  sy: number;
  px: number;
  py: number;
  moved: boolean;
  touch: boolean;
  /** âncora encaixada (válida) */
  snap: { x: number; y: number } | null;
  /** posição livre em células (centro da peça) */
  fx: number;
  fy: number;
  slot?: HTMLElement;
  pid: number;
  wasArmed?: boolean;
}

export class MontaLeva implements MiniGameHandle {
  private el: HTMLDivElement;
  private cv: HTMLCanvasElement;
  private cx: CanvasRenderingContext2D;
  private ui: HTMLDivElement;
  private sv = mlSave();
  private au = new MLAudio();
  private gov = new QualityGovernor({ emit: false, persist: false });
  private fx = new Particles();
  private dead = false;
  private paused = false;
  private raf = 0;
  private last = 0;
  private time = 0;
  private dpr = 1;
  private W = 0;
  private H = 0;
  private screen: Screen = 'menu';
  private offs: (() => void)[] = [];
  private screenOffs: (() => void)[] = [];
  private backPop: (() => void) | null = null;
  private view: View = { s: 40, ox: 0, oy: 0, w: 0, h: 0 };
  private cam = { x: 6, y: 1.5, s: 40 };
  private camT = { x: 6, y: 1.5, s: 40 };
  // fase
  private L: LevelDef | null = null;
  private track: Track | null = null;
  private hist: History = new History([]);
  private sel = -1;
  private armed: PartId | null = null;
  private trayRot: Partial<Record<PartId, number>> = {};
  private drag: Drag | null = null;
  private overview = false;
  private pan: { pid: number; sx: number; cx: number } | null = null;
  private placeFx: { x: number; y: number; t: number }[] = [];
  // pista
  private sim: Sim | null = null;
  private acc = 0;
  private ending = 0;
  private endKind: 'win' | 'fail' | null = null;
  private keys = new Set<string>();
  private btnHeld = { fwd: false, back: false, brake: false, boost: false };
  private shake = 0;
  private balloonVis = new Map<number, { x: number; y: number; vx: number; vy: number }>();
  private auto: { drive: [number, string, ('x' | 'z' | 't')?][] | undefined } | null = null;
  private runId = 0;
  // menu
  private demo: Sim | null = null;
  private demoT = 0;
  // HUD
  private hud: Record<string, HTMLElement> = {};
  private buttons: BoundButton[] = [];
  private lastHudT = -1;
  private tut: TutStep[] | null = null;
  private tutIdx = -1;

  constructor(
    root: HTMLElement,
    private exitFn: () => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'ml-root';
    this.cv = document.createElement('canvas');
    this.cv.className = 'ml-cv';
    this.cx = this.cv.getContext('2d', { alpha: false })!;
    this.ui = document.createElement('div');
    this.ui.className = 'ml-ui';
    this.el.append(this.cv, this.ui);
    root.appendChild(this.el);
    setPalette(this.sv.palette);
    void lockOrientation('any');
    this.au.musicOn = this.sv.music;
    this.au.sfxOn = this.sv.sfx;
    this.au.start();
    const onResize = () => this.resize();
    window.addEventListener('resize', onResize);
    this.offs.push(() => window.removeEventListener('resize', onResize));
    const kd = (e: KeyboardEvent) => this.onKey(e, true);
    const ku = (e: KeyboardEvent) => this.onKey(e, false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    this.offs.push(() => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    });
    this.cv.addEventListener('pointerdown', (e) => this.onDown(e));
    const mv = (e: PointerEvent) => this.onMove(e);
    const up = (e: PointerEvent) => this.onUp(e);
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    this.offs.push(() => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    });
    this.resize();
    this.menu();
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.frame(t));
    if (location.search.includes('debug')) (window as unknown as { __montaleva: unknown }).__montaleva = this.debugApi();
  }

  /* ================================ ciclo ================================ */
  destroy(): void {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.clearScreen();
    for (const f of this.offs) f();
    this.offs = [];
    this.backPop?.();
    this.au.stop();
    objective(null);
    clearNotify();
    resetNotifyTop();
    this.el.remove();
  }
  pause(): void {
    this.paused = true;
    this.au.suspend();
    this.btnHeld = { fwd: false, back: false, brake: false, boost: false };
  }
  resume(): void {
    this.paused = false;
    this.last = performance.now();
    this.au.apply();
  }

  private resize(): void {
    const r = this.el.getBoundingClientRect();
    this.W = Math.max(1, Math.round(r.width || window.innerWidth));
    this.H = Math.max(1, Math.round(r.height || window.innerHeight));
    this.dpr = Math.min(window.devicePixelRatio || 1, this.gov.settings.dprCap);
    this.cv.width = Math.round(this.W * this.dpr);
    this.cv.height = Math.round(this.H * this.dpr);
    this.view.w = this.W;
    this.view.h = this.H;
    if (this.screen === 'build') {
      this.layoutBuild();
      this.fitBuild(true);
    }
  }

  private get portrait(): boolean {
    return this.H > this.W;
  }

  private frame(now: number): void {
    if (this.dead) return;
    this.raf = requestAnimationFrame((t) => this.frame(t));
    const raw = (now - this.last) / 1000;
    this.last = now;
    if (this.paused) return;
    const t0 = performance.now();
    const dt = Math.min(0.05, Math.max(0, raw));
    this.time += dt;
    this.update(dt);
    this.draw();
    this.gov.sample(raw * 1000, performance.now() - t0);
    this.fx.budget = this.gov.settings.particleBudget;
    const cap = this.gov.settings.dprCap;
    if (Math.abs(Math.min(window.devicePixelRatio || 1, cap) - this.dpr) > 0.01) this.resize();
  }

  private update(dt: number): void {
    if (this.screen === 'test' && this.sim) this.updateTest(dt);
    else if (this.screen === 'menu') this.updateDemo(dt);
    this.fx.update(dt);
    // câmera suave
    const k = 1 - Math.exp(-dt * (this.screen === 'test' ? 5 : 7));
    this.cam.x += (this.camT.x - this.cam.x) * k;
    this.cam.y += (this.camT.y - this.cam.y) * k;
    this.cam.s += (this.camT.s - this.cam.s) * k;
    if (this.screen === 'build') this.updateTutorial();
    this.shake = Math.max(0, this.shake - dt * 3);
  }

  /* ================================ telas ================================ */
  private clearScreen(): void {
    for (const f of this.screenOffs) f();
    this.screenOffs = [];
    for (const b of this.buttons) b.destroy();
    this.buttons = [];
    this.ui.innerHTML = '';
    this.hud = {};
    this.drag = null;
    this.pan = null;
    objective(null);
  }
  private setBack(fn: (() => void) | null): void {
    this.backPop?.();
    this.backPop = fn ? pushBack(fn) : null;
  }
  private on(root: ParentNode, sel: string, fn: (b: HTMLElement) => void, sound = true): void {
    root.querySelectorAll<HTMLElement>(sel).forEach((b) =>
      b.addEventListener('click', () => {
        if (sound) this.au.ui();
        tap('light');
        fn(b);
      }),
    );
  }

  /* ---------------------------- menu ---------------------------- */
  private menu(): void {
    this.clearScreen();
    this.screen = 'menu';
    this.au.mood = 'menu';
    this.sim = null;
    this.L = null;
    this.track = DEMO_TRACK;
    this.demo = null;
    this.demoT = 0;
    const next = Math.min(LEVELS.length, unlockedUpTo());
    const stars = LEVELS.reduce((s, L) => s + starsOf(L.n), 0);
    const d = document.createElement('div');
    d.className = 'ml-menu';
    d.innerHTML = `
      <div class="ml-mcol ml-fade">
        <div class="ml-logo">${logoSvg()}<div><b>${t('ml.name', 'Monta & Leva')}</b><small>${t('ml.tagline', 'Monte o veículo. Entregue a carga.')}</small></div></div>
        <button class="ml-btn pri" data-a="play">${IC.play}${t('ml.play', 'Jogar')}<small>${t('ml.levelN', 'Fase {n}', { n: next })}</small></button>
        <button class="ml-btn" data-a="levels">${IC.map}${t('ml.levels', 'Fases')}<small>★ ${stars}/${LEVELS.length * 3}</small></button>
        <button class="ml-btn" data-a="shop">${IC.wrench}${t('ml.shop', 'Oficina')}<small>⚙ ${fmt(this.sv.gears)}</small></button>
        <button class="ml-btn" data-a="settings">${IC.sliders}${t('ml.settings', 'Configurações')}</button>
        <button class="ml-btn ghost" data-a="exit">${IC.exit}${t('ml.exit', 'Sair')}</button>
      </div>`;
    this.ui.appendChild(d);
    this.on(d, '[data-a=play]', () => this.openLevel(next));
    this.on(d, '[data-a=levels]', () => this.levels());
    this.on(d, '[data-a=shop]', () => this.shop());
    this.on(d, '[data-a=settings]', () => this.settings());
    this.on(d, '[data-a=exit]', () => this.exitFn());
    this.setBack(null);
  }

  private updateDemo(dt: number): void {
    if (!this.demo || this.demo.result || this.demo.time > 16) {
      this.demo = new Sim(DEMO_LEVEL, DEMO_CAR);
      this.demoT = 0;
      this.balloonVis.clear();
      const f = this.demo.focus();
      this.cam.x = this.camT.x = f.x + 2;
      this.cam.y = this.camT.y = f.y + 1;
    }
    this.demoT += dt;
    const sim = this.demo;
    sim.input.fwd = this.demoT > 0.6;
    const z = sim.track.zone;
    sim.input.brake = sim.focus().x > z.x0 + 0.5;
    if (sim.input.brake) sim.input.fwd = false;
    sim.step();
    sim.fx.length = 0;
    const f = sim.focus();
    const s = this.portrait ? this.W / 10 : this.H / 9.5;
    this.camT.s = s;
    this.camT.x = f.x + (this.portrait ? 0 : -(this.W * 0.18) / s) + 1.5;
    this.camT.y = f.y + (this.portrait ? -1.2 : 0.6);
  }

  /* ---------------------------- fases ---------------------------- */
  private levels(): void {
    this.clearScreen();
    this.screen = 'levels';
    this.au.mood = 'menu';
    const cur = Math.min(LEVELS.length, unlockedUpTo());
    const d = document.createElement('div');
    d.className = 'ml-page ml-fade';
    let html = `<div class="ml-head"><button class="ml-btn ic" data-a="back" aria-label="${t('ml.back', 'Voltar')}">${IC.back}</button><h2>${t('ml.levels', 'Fases')}</h2><span class="ml-chip">★ ${LEVELS.reduce((s, L) => s + starsOf(L.n), 0)}/${LEVELS.length * 3}</span></div><div class="ml-scroll"><div class="ml-chaps">`;
    for (let c = 0; c < 3; c++) {
      const ls = LEVELS.filter((L) => chapterOf(L.n) === c);
      const st = ls.reduce((s, L) => s + starsOf(L.n), 0);
      html += `<div class="ml-chap"><h3><span>${c + 1}. ${esc(chapterName(c))}</span><span>★ ${st}/${ls.length * 3}</span></h3><div class="ml-tiles">`;
      for (const L of ls) {
        const rec = this.sv.levels[L.n];
        const lock = L.n > cur;
        const s = starsOf(L.n);
        const cls = lock ? 'lock' : L.n === cur && !rec?.done ? 'cur' : rec?.done ? 'done' : '';
        html += `<button class="ml-tile ${cls}" data-n="${L.n}">${lock ? IC.lock : L.n}${lock ? '' : `<span class="ml-stars">${[0, 1, 2].map((i) => `<i class="${i < s ? 'on' : ''}"></i>`).join('')}</span>`}</button>`;
      }
      html += `</div></div>`;
    }
    html += `</div></div>`;
    d.innerHTML = html;
    this.ui.appendChild(d);
    this.on(d, '[data-a=back]', () => this.menu());
    this.on(d, '[data-n]', (b) => this.openLevel(+b.dataset.n!));
    this.setBack(() => this.menu());
  }

  /* ---------------------------- oficina ---------------------------- */
  private shop(): void {
    this.clearScreen();
    this.screen = 'shop';
    const d = document.createElement('div');
    d.className = 'ml-page ml-fade';
    const render = () => {
      const s = this.sv;
      let html = `<div class="ml-head"><button class="ml-btn ic" data-a="back" aria-label="${t('ml.back', 'Voltar')}">${IC.back}</button><h2>${t('ml.shop', 'Oficina')}</h2><span class="ml-chip" title="${t('ml.gears', 'Engrenagens')}">⚙ ${fmt(s.gears)}</span></div><div class="ml-scroll">`;
      html += `<div class="ml-sec">${t('ml.upgrades', 'Melhorias de peças')}</div><div class="ml-grid2">`;
      for (const u of UPGRADES) {
        const lv = s.up[u.id];
        const max = lv >= 2;
        const cost = max ? 0 : u.cost[lv];
        html += `<div class="ml-card"><div class="ml-ci" data-icon="${u.part}"></div><div class="ml-ct"><b>${esc(u.name())}</b><small>${esc(u.desc())}</small><div class="ml-lv">${[0, 1].map((i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div></div>
          <button class="ml-btn sm ${max ? 'off' : s.gears >= cost ? 'blue' : 'off'}" data-u="${u.id}">${max ? IC.check : `⚙ ${cost}`}</button></div>`;
      }
      html += `</div><div class="ml-sec">${t('ml.paint', 'Pintura')}</div><div class="ml-grid2">`;
      for (const p of PALS) {
        const own = s.palettes.includes(p.id);
        const curr = s.palette === p.id;
        html += `<div class="ml-card"><div class="ml-ci">${IC.palette}</div><div class="ml-ct"><b>${esc(p.name())}</b><div class="ml-sw" style="margin-top:6px">${p.sw.map((c) => `<i style="background:${c}"></i>`).join('')}</div></div>
          <button class="ml-btn sm ${curr ? 'on' : own ? '' : s.gears >= p.cost ? 'blue' : 'off'}" data-p="${p.id}">${curr ? IC.check : own ? t('ml.use', 'Usar') : `⚙ ${p.cost}`}</button></div>`;
      }
      html += `</div><p style="color:#7a8596;font-size:12.5px;margin:14px 4px">${t('ml.gearsHow', 'Ganhe engrenagens entregando cargas e completando metas.')}</p></div>`;
      d.innerHTML = html;
      d.querySelectorAll<HTMLElement>('[data-icon]').forEach((e) => e.appendChild(partIcon(e.dataset.icon as PartId, 0, 40, this.dpr)));
      this.on(d, '[data-a=back]', () => this.menu());
      this.on(d, '[data-u]', (b) => {
        const u = UPGRADES.find((x) => x.id === b.dataset.u)!;
        const lv = s.up[u.id];
        if (lv >= 2 || s.gears < u.cost[lv]) return;
        s.gears -= u.cost[lv];
        s.up[u.id] = lv + 1;
        persistML();
        this.au.coin();
        success();
        render();
      });
      this.on(d, '[data-p]', (b) => {
        const p = PALS.find((x) => x.id === b.dataset.p)!;
        if (!s.palettes.includes(p.id)) {
          if (s.gears < p.cost) return;
          s.gears -= p.cost;
          s.palettes.push(p.id);
          this.au.coin();
        }
        s.palette = p.id;
        setPalette(p.id);
        persistML();
        render();
      });
    };
    render();
    this.ui.appendChild(d);
    this.setBack(() => this.menu());
  }

  /* ---------------------------- ajustes ---------------------------- */
  private settings(): void {
    this.clearScreen();
    this.screen = 'settings';
    const d = document.createElement('div');
    d.className = 'ml-page ml-fade';
    const s = this.sv;
    const tog = (k: 'music' | 'sfx' | 'com', ic: string, label: string, sub: string) =>
      `<button class="ml-tog ${s[k] ? 'on' : ''}" data-k="${k}">${ic}<span>${label}<small>${sub}</small></span><i></i></button>`;
    d.innerHTML = `<div class="ml-head"><button class="ml-btn ic" data-a="back" aria-label="${t('ml.back', 'Voltar')}">${IC.back}</button><h2>${t('ml.settings', 'Configurações')}</h2></div>
      <div class="ml-scroll" style="max-width:520px;width:100%;margin:0 auto">
        ${tog('music', IC.music, t('ml.music', 'Música'), t('ml.musicD', 'Trilha leve da oficina e da pista'))}
        ${tog('sfx', IC.sound, t('ml.sfx', 'Efeitos sonoros'), t('ml.sfxD', 'Encaixes, motor, batidas'))}
        ${tog('com', IC.target, t('ml.com', 'Centro de massa'), t('ml.comD', 'Mostra o ponto de equilíbrio ao montar'))}
        <p style="color:#7a8596;font-size:12.5px;margin:6px 4px">${t('ml.globalAudio', 'O som também segue os ajustes gerais do app.')}</p>
      </div>`;
    this.ui.appendChild(d);
    this.on(d, '[data-a=back]', () => this.menu());
    this.on(d, '[data-k]', (b) => {
      const k = b.dataset.k as 'music' | 'sfx' | 'com';
      s[k] = !s[k];
      b.classList.toggle('on', s[k]);
      persistML();
      this.au.musicOn = s.music;
      this.au.sfxOn = s.sfx;
      this.au.apply();
    });
    this.setBack(() => this.menu());
  }

  /* ================================ montagem ================================ */
  openLevel(n: number): void {
    const L = LEVELS[n - 1];
    if (!L) return;
    this.L = L;
    this.track = resolveTrack(L.track, L.grid[0] * U + 1.5);
    const rec = this.sv.levels[n];
    const start = rec?.design ? rec.design.filter((p) => PARTS[p.t]) : L.pre ? L.pre.map((p) => ({ ...p })) : [];
    this.hist = new History(start);
    this.sel = -1;
    this.armed = null;
    this.trayRot = {};
    this.overview = false;
    this.tut = L.tut && !rec?.done ? TUTORIAL[L.tut] : null;
    this.tutIdx = -1;
    this.build(true);
  }

  private build(fresh = false): void {
    const L = this.L!;
    this.clearScreen();
    this.screen = 'build';
    this.au.mood = 'build';
    this.sim = null;
    this.endKind = null;
    this.au.engine(0, 0);
    this.au.jetOn(false);
    const ui = this.ui;
    const top = document.createElement('div');
    top.className = 'ml-top ml-fade';
    top.innerHTML = `
      <button class="ml-btn ic" data-a="back" aria-label="${t('ml.back', 'Voltar')}">${IC.back}</button>
      <div class="ml-title"><b>${t('ml.levelN', 'Fase {n}', { n: L.n })}</b><small>${esc(chapterName(chapterOf(L.n)))}</small></div>
      <div class="ml-goals" data-r="goals"></div>
      <div class="ml-sp"></div>
      <span class="ml-chip" data-r="budget" style="display:${L.budget ? '' : 'none'}"></span>
      <button class="ml-btn ic sm" data-a="view" aria-label="${t('ml.view', 'Ver pista')}" title="${t('ml.view', 'Ver pista')}">${IC.eye}</button>
      <button class="ml-btn ic sm" data-a="clear" aria-label="${t('ml.clear', 'Limpar tudo')}" title="${t('ml.clear', 'Limpar tudo')}">${IC.trash}</button>`;
    ui.appendChild(top);
    const tray = document.createElement('div');
    tray.className = 'ml-tray ml-fade';
    ui.appendChild(tray);
    const acts = document.createElement('div');
    acts.className = 'ml-acts ml-fade';
    acts.innerHTML = `
      <button class="ml-btn ic" data-a="rot" aria-label="${t('ml.rotate', 'Girar')}" title="${t('ml.rotate', 'Girar')}">${IC.rotate}</button>
      <button class="ml-btn ic" data-a="del" aria-label="${t('ml.delete', 'Apagar')}" title="${t('ml.delete', 'Apagar')}">${IC.trash}</button>
      <button class="ml-btn ic" data-a="undo" aria-label="${t('ml.undo', 'Desfazer')}" title="${t('ml.undo', 'Desfazer')}">${IC.undo}</button>
      <button class="ml-btn ic" data-a="redo" aria-label="${t('ml.redo', 'Refazer')}" title="${t('ml.redo', 'Refazer')}">${IC.redo}</button>
      <button class="ml-btn pri ml-test" data-a="test">${IC.play}${t('ml.test', 'Testar')}</button>`;
    ui.appendChild(acts);
    const info = document.createElement('div');
    info.className = 'ml-info hide';
    ui.appendChild(info);
    const warn = document.createElement('div');
    warn.className = 'ml-warn ml-pass';
    ui.appendChild(warn);
    this.hud = { top, tray, acts, info, warn, goals: top.querySelector('[data-r=goals]')!, budget: top.querySelector('[data-r=budget]')! };
    this.on(top, '[data-a=back]', () => this.levels());
    this.on(top, '[data-a=view]', (b) => {
      this.overview = !this.overview;
      b.classList.toggle('on', this.overview);
      this.fitBuild(false);
    });
    this.on(top, '[data-a=clear]', (b) => {
      if (!b.classList.contains('on')) {
        b.classList.add('on');
        notify(t('ml.clearConfirm', 'Toque de novo para limpar tudo'), { kind: 'warn', key: 'ml-clear' });
        window.setTimeout(() => b.classList.remove('on'), 2200);
        return;
      }
      b.classList.remove('on');
      this.commit([]);
      this.au.remove();
    });
    const act = (a: string, fn: () => void) => {
      const el = acts.querySelector<HTMLElement>(`[data-a=${a}]`)!;
      this.buttons.push(bindButton(el, { onPress: fn }));
    };
    act('rot', () => this.rotate());
    act('del', () => this.deleteSel());
    act('undo', () => {
      if (this.hist.undo()) {
        this.sel = -1;
        this.au.ui();
        this.afterChange();
      }
    });
    act('redo', () => {
      if (this.hist.redo()) {
        this.sel = -1;
        this.au.ui();
        this.afterChange();
      }
    });
    act('test', () => this.startTest());
    this.buildTray();
    this.layoutBuild();
    this.fitBuild(fresh);
    this.afterChange();
    this.setBack(() => this.levels());
  }

  /** mede a área livre (sem barra de cima, bandeja e botões) */
  private freeRect(): { x0: number; y0: number; x1: number; y1: number } {
    const top = this.hud.top?.getBoundingClientRect();
    const tray = this.hud.tray?.getBoundingClientRect();
    const acts = this.hud.acts?.getBoundingClientRect();
    const host = this.el.getBoundingClientRect();
    let y0 = top ? top.bottom - host.top + 6 : 60;
    let y1 = this.H - 8;
    let x1 = this.W - 8;
    const x0 = 8;
    if (this.portrait) {
      if (acts) y1 = acts.top - host.top - 8;
    } else {
      if (tray) y1 = tray.top - host.top - 6;
      if (acts) x1 = acts.left - host.left - 8;
    }
    if (y1 - y0 < 120) y0 = Math.max(0, y1 - 120);
    return { x0, y0, x1, y1 };
  }

  private layoutBuild(): void {
    const { tray, acts, info, warn } = this.hud;
    if (!tray || !acts) return;
    const host = this.el.getBoundingClientRect();
    if (!this.portrait) {
      const a = acts.getBoundingClientRect();
      tray.style.right = `${Math.max(8, host.right - a.left + 10)}px`;
    } else tray.style.right = '';
    const fr = this.freeRect();
    if (info) info.style.top = `${fr.y1 - 34}px`;
    if (warn) warn.style.top = `${fr.y0 + (this.tut ? 46 : 2)}px`;
    setNotifyTop(fr.y0 + 4);
  }

  private fitBuild(snap: boolean): void {
    const L = this.L;
    if (!L || !this.track) return;
    const fr = this.freeRect();
    const fw = Math.max(80, fr.x1 - fr.x0);
    const fh = Math.max(80, fr.y1 - fr.y0);
    if (this.overview) {
      const tr = this.track;
      const span = tr.endX + 5;
      const hgt = tr.maxY - Math.min(0, tr.minY) + 5;
      const s = Math.min(fw / span, fh / hgt);
      this.camT.s = s;
      this.camT.x = (tr.endX - 4) / 2 + (this.W / 2 - (fr.x0 + fr.x1) / 2) / s;
      this.camT.y = (tr.maxY + Math.min(0, tr.minY)) / 2 + 0.5 - (this.H / 2 - (fr.y0 + fr.y1) / 2) / s;
    } else {
      const gw = L.grid[0] * U;
      const gh = L.grid[1] * U;
      const s = clamp(Math.min(fw / (gw + 0.9), fh / (gh + 0.7)), 26, 150);
      this.camT.s = s;
      // centro da grade no centro da área livre
      this.camT.x = gw / 2 + (this.W / 2 - (fr.x0 + fr.x1) / 2) / s;
      this.camT.y = gh / 2 - 0.1 - (this.H / 2 - (fr.y0 + fr.y1) / 2) / s;
    }
    if (snap) Object.assign(this.cam, this.camT);
  }

  private buildTray(): void {
    const L = this.L!;
    const tray = this.hud.tray;
    tray.innerHTML = '';
    const used = this.hist.parts;
    for (const id of PART_IDS) {
      const lim = L.parts[id] ?? 0;
      if (lim <= 0) continue;
      const left = lim - countOf(used, id);
      const b = document.createElement('button');
      b.className = `ml-slot${left <= 0 ? ' empty' : ''}${this.armed === id ? ' armed' : ''}`;
      b.dataset.t = id;
      b.setAttribute('aria-label', partName(id));
      const r = this.trayRot[id] ?? 0;
      b.appendChild(partIcon(id, r, 42, this.dpr));
      b.insertAdjacentHTML('beforeend', `<em>${esc(partName(id))}</em><b>${left}</b>${L.intro?.includes(id) && !this.sv.levels[L.n]?.done ? '<span class="ml-new"></span>' : ''}${L.budget ? `<span class="ml-cost">$${PARTS[id].cost}</span>` : ''}`);
      b.addEventListener('pointerdown', (e) => this.trayDown(e, id, b));
      tray.appendChild(b);
    }
  }

  private refreshTray(): void {
    const L = this.L;
    if (!L || !this.hud.tray) return;
    this.hud.tray.querySelectorAll<HTMLElement>('.ml-slot').forEach((b) => {
      const id = b.dataset.t as PartId;
      const left = (L.parts[id] ?? 0) - countOf(this.hist.parts, id);
      b.querySelector('b')!.textContent = String(Math.max(0, left));
      b.classList.toggle('empty', left <= 0);
      b.classList.toggle('armed', this.armed === id);
    });
  }

  private commit(next: Placed[]): void {
    this.hist.commit(next);
    this.afterChange();
  }

  private afterChange(): void {
    const L = this.L;
    if (!L) return;
    const parts = this.hist.parts;
    if (this.sel >= parts.length) this.sel = -1;
    this.refreshTray();
    // metas
    const n = parts.length;
    const g = this.hud.goals;
    if (g)
      g.innerHTML = `<span class="ml-chip mute">${IC.clock}≤ ${L.goals.time} s</span><span class="ml-chip mute">${IC.tilt}${t('ml.goal.noflip', 'Sem tombar')}</span><span class="ml-chip ${n > L.goals.parts ? 'bad' : 'mute'}">${IC.blocks}${n}/${L.goals.parts}</span>`;
    if (this.hud.budget && L.budget) {
      const c = partCost(parts);
      this.hud.budget.innerHTML = `$ ${c}/${L.budget}`;
      this.hud.budget.className = `ml-chip ${c > L.budget ? 'bad' : ''}`;
    }
    // botões
    const acts = this.hud.acts;
    if (acts) {
      const selP = this.sel >= 0 ? parts[this.sel] : null;
      const canRot = selP ? PARTS[selP.t].rots > 1 : this.armed ? PARTS[this.armed].rots > 1 : false;
      acts.querySelector('[data-a=rot]')!.classList.toggle('off', !canRot);
      acts.querySelector('[data-a=del]')!.classList.toggle('off', !selP);
      acts.querySelector('[data-a=undo]')!.classList.toggle('off', !this.hist.canUndo);
      acts.querySelector('[data-a=redo]')!.classList.toggle('off', !this.hist.canRedo);
      acts.querySelector('[data-a=test]')!.classList.toggle('off', !parts.some((p) => PARTS[p.t].layer === 'struct'));
    }
    // avisos
    const an = analyze(parts);
    const w: string[] = [];
    const wheels = parts.filter((p) => PARTS[p.t].radius);
    if (parts.length && wheels.length && !parts.some((p) => p.t === 'motor')) w.push(t('ml.w.noMotor', 'Sem motor: as rodas não giram'));
    else if (wheels.length && parts.some((p) => p.t === 'motor') && ![...an.power.keys()].length) w.push(t('ml.w.far', 'Motor longe demais das rodas'));
    // peças soltas: grupos não ligados entre si (nem por dobradiça)
    if (an.groups.length > 1) {
      const par = an.groups.map((_, i) => i);
      const f = (i: number): number => (par[i] === i ? i : (par[i] = f(par[i])));
      for (const gs of an.hinges.values()) for (let k = 1; k < gs.length; k++) par[f(gs[k])] = f(gs[0]);
      const roots = new Set(an.groups.map((_, i) => f(i)));
      if (roots.size > 1) w.push(t('ml.w.loose', 'Há peças soltas'));
    }
    if (this.hud.warn) this.hud.warn.innerHTML = w.map((s) => `<span class="ml-chip">${IC.warn}${esc(s)}</span>`).join('');
    // salva o projeto da fase
    const rec = levelRec(L.n);
    rec.design = parts.map((p) => ({ ...p }));
    persistML();
  }

  private showInfo(id: PartId | null): void {
    const el = this.hud.info;
    if (!el) return;
    if (!id) {
      el.classList.add('hide');
      return;
    }
    el.innerHTML = `<b>${esc(partName(id))}</b><span>${esc(partDesc(id))}</span>`;
    el.classList.remove('hide');
  }

  private rotate(): void {
    const parts = this.hist.parts;
    if (this.sel >= 0) {
      const p = parts[this.sel];
      const n = PARTS[p.t].rots;
      if (n <= 1) return;
      const r = (p.r + 1) % n;
      // tenta no lugar e com pequenos ajustes
      const tries: [number, number][] = [[0, 0], [-1, 0], [0, -1], [-2, 0], [0, -2], [1, 0], [0, 1], [-1, -1]];
      for (const [dx, dy] of tries) {
        const q = { ...p, r, x: p.x + dx, y: p.y + dy };
        if (canPlace(this.L!, parts, q, this.sel) === null) {
          const next = parts.map((o, i) => (i === this.sel ? q : o));
          this.commit(next);
          this.au.rotate();
          return;
        }
      }
      this.au.bad();
      notify(t('ml.noRoom', 'Sem espaço para girar aqui'), { kind: 'warn', key: 'ml-room' });
    } else if (this.armed && PARTS[this.armed].rots > 1) {
      this.trayRot[this.armed] = normRot(this.armed, (this.trayRot[this.armed] ?? 0) + 1);
      this.au.rotate();
      this.buildTray();
      this.afterChange();
    }
  }

  private deleteSel(): void {
    if (this.sel < 0) return;
    const p = this.hist.parts[this.sel];
    this.commit(removeAt(this.hist.parts, this.sel));
    this.burst(p, '#9aa5b5');
    this.sel = -1;
    this.au.remove();
    this.afterChange();
  }

  /* ---------------------------- arrastar ---------------------------- */
  private toWorld(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.cv.getBoundingClientRect();
    const v = this.view;
    return { x: (clientX - r.left - v.ox) / v.s, y: (v.oy - (clientY - r.top)) / v.s };
  }
  /** centro da peça em células, a partir do ponteiro */
  private dragCenter(d: Drag, clientX: number, clientY: number): { x: number; y: number } {
    const off = d.touch ? 52 : 0;
    const w = this.toWorld(clientX, clientY - off);
    return { x: w.x / U, y: w.y / U };
  }

  private trayDown(e: PointerEvent, id: PartId, slot: HTMLElement): void {
    if (this.screen !== 'build' || e.button > 0) return;
    e.preventDefault();
    const L = this.L!;
    const left = (L.parts[id] ?? 0) - countOf(this.hist.parts, id);
    this.au.pick();
    tap('light');
    if (left <= 0) {
      this.armed = null;
      this.showInfo(id);
      this.refreshTray();
      return;
    }
    const wasArmed = this.armed === id && this.sel < 0;
    this.sel = -1;
    this.drag = {
      wasArmed,
      kind: 'new',
      t: id,
      r: this.trayRot[id] ?? 0,
      from: -1,
      sx: e.clientX,
      sy: e.clientY,
      px: e.clientX,
      py: e.clientY,
      moved: false,
      touch: e.pointerType === 'touch',
      snap: null,
      fx: 0,
      fy: 0,
      slot,
      pid: e.pointerId,
    };
    try {
      slot.releasePointerCapture(e.pointerId);
    } catch {
      /* */
    }
    this.showInfo(id);
  }

  private onDown(e: PointerEvent): void {
    if (this.screen !== 'build' || e.button > 0 || this.drag) return;
    e.preventDefault();
    const w = this.toWorld(e.clientX, e.clientY);
    if (this.overview) {
      this.pan = { pid: e.pointerId, sx: e.clientX, cx: this.camT.x };
      return;
    }
    const cx = Math.floor(w.x / U);
    const cy = Math.floor(w.y / U);
    const parts = this.hist.parts;
    let i = partAt(parts, cx, cy);
    // rodas grandes: toque fora da célula, mas dentro do círculo
    if (i < 0) {
      parts.forEach((p, k) => {
        const r = PARTS[p.t].radius;
        if (r && Math.hypot(w.x - (p.x + 0.5) * U, w.y - (p.y + 0.5) * U) < r) i = k;
      });
    }
    if (i >= 0) {
      const p = parts[i];
      this.drag = {
        kind: 'move',
        t: p.t,
        r: p.r,
        from: i,
        orig: { ...p },
        sx: e.clientX,
        sy: e.clientY,
        px: e.clientX,
        py: e.clientY,
        moved: false,
        touch: e.pointerType === 'touch',
        snap: { x: p.x, y: p.y },
        fx: 0,
        fy: 0,
        pid: e.pointerId,
      };
      return;
    }
    // toque para colocar a peça armada
    if (this.armed) {
      const id = this.armed;
      const r = this.trayRot[id] ?? 0;
      const fp = footprint(id, r);
      const fw = Math.max(...fp.map((c) => c[0])) + 1;
      const fh = Math.max(...fp.map((c) => c[1])) + 1;
      const s = this.findSnap(id, r, w.x / U - fw / 2 + 0.5, w.y / U - fh / 2 + 0.5, -1);
      if (s) {
        this.place({ t: id, x: s.x, y: s.y, r }, -1);
        return;
      }
      this.au.bad();
    }
    this.sel = -1;
    this.armed = null;
    this.showInfo(null);
    this.refreshTray();
    this.afterChange();
  }

  private findSnap(id: PartId, r: number, ax: number, ay: number, skip: number): { x: number; y: number } | null {
    const L = this.L!;
    const parts = this.hist.parts;
    const bx = Math.round(ax - 0.5);
    const by = Math.round(ay - 0.5);
    let best: { x: number; y: number } | null = null;
    let bd = 1e9;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const x = bx + dx;
        const y = by + dy;
        const q = { t: id, x, y, r };
        if (canPlace(L, parts, q, skip >= 0 ? skip : -1) !== null) continue;
        const d = Math.hypot(x + 0.5 - ax, y + 0.5 - ay);
        if (d < bd && d < 1.25) {
          bd = d;
          best = { x, y };
        }
      }
    return best;
  }

  private onMove(e: PointerEvent): void {
    if (this.pan && e.pointerId === this.pan.pid) {
      this.camT.x = this.pan.cx - (e.clientX - this.pan.sx) / this.cam.s;
      this.cam.x = this.camT.x;
      return;
    }
    const d = this.drag;
    if (!d || e.pointerId !== d.pid) return;
    d.px = e.clientX;
    d.py = e.clientY;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 8) {
      d.moved = true;
      if (d.kind === 'move') {
        this.sel = d.from;
        this.au.pick();
      }
    }
    if (!d.moved) return;
    const fp = footprint(d.t, d.r);
    const fw = Math.max(...fp.map((c) => c[0])) + 1;
    const fh = Math.max(...fp.map((c) => c[1])) + 1;
    const c = this.dragCenter(d, e.clientX, e.clientY);
    d.fx = c.x;
    d.fy = c.y;
    const prev = d.snap;
    d.snap = this.findSnap(d.t, d.r, c.x - fw / 2 + 0.5, c.y - fh / 2 + 0.5, d.kind === 'move' ? d.from : -1);
    if (d.snap && (!prev || prev.x !== d.snap.x || prev.y !== d.snap.y)) tap('light');
  }

  private onUp(e: PointerEvent): void {
    if (this.pan && e.pointerId === this.pan.pid) {
      this.pan = null;
      return;
    }
    const d = this.drag;
    if (!d || e.pointerId !== d.pid) return;
    this.drag = null;
    if (!d.moved) {
      if (d.kind === 'new') {
        // toque na bandeja: arma/desarma
        this.armed = d.wasArmed ? null : d.t;
        this.sel = -1;
        this.showInfo(this.armed);
        this.refreshTray();
        this.afterChange();
      } else {
        // toque numa peça: seleciona; segundo toque gira
        if (this.sel === d.from && PARTS[d.t].rots > 1) this.rotate();
        else {
          this.sel = d.from;
          this.armed = null;
          this.showInfo(d.t);
          this.au.pick();
          this.refreshTray();
          this.afterChange();
        }
      }
      return;
    }
    // soltou em cima da bandeja: apaga (mover) ou cancela (nova)
    const trayR = this.hud.tray?.getBoundingClientRect();
    const overTray = trayR && e.clientX >= trayR.left && e.clientX <= trayR.right && e.clientY >= trayR.top - 6 && e.clientY <= trayR.bottom;
    if (d.kind === 'move' && overTray) {
      const p = this.hist.parts[d.from];
      this.commit(removeAt(this.hist.parts, d.from));
      this.burst(p, '#9aa5b5');
      this.sel = -1;
      this.au.remove();
      this.afterChange();
      return;
    }
    if (d.snap) {
      this.place({ t: d.t, x: d.snap.x, y: d.snap.y, r: d.r }, d.kind === 'move' ? d.from : -1);
    } else {
      this.au.bad();
      if (d.kind === 'new') {
        const err = this.whyNot(d);
        if (err) notify(err, { kind: 'warn', key: 'ml-why' });
      }
    }
  }

  private whyNot(d: Drag): string | null {
    const L = this.L!;
    const fp = footprint(d.t, d.r);
    const fw = Math.max(...fp.map((c) => c[0])) + 1;
    const fh = Math.max(...fp.map((c) => c[1])) + 1;
    const q = { t: d.t, x: Math.round(d.fx - fw / 2), y: Math.round(d.fy - fh / 2), r: d.r };
    const e: PlaceError | null = canPlace(L, this.hist.parts, q);
    switch (e) {
      case 'needBase':
        return t('ml.e.base', 'Rodas e acessórios vão em cima de uma peça');
      case 'hingeMount':
        return t('ml.e.hinge', 'Nada pode ser montado na dobradiça');
      case 'cargo':
        return t('ml.e.cargo', 'Esse espaço é da carga');
      case 'budget':
        return t('ml.e.budget', 'Orçamento estourado');
      case 'none':
        return t('ml.e.none', 'Acabaram as peças desse tipo');
      default:
        return null;
    }
  }

  private place(p: Placed, from: number): void {
    const parts = this.hist.parts;
    const next = from >= 0 ? parts.map((o, i) => (i === from ? p : o)) : [...parts, p];
    // ao mover uma estrutura, leva junto o que estava montado nela
    if (from >= 0 && PARTS[p.t].layer === 'struct') {
      const o = parts[from];
      const dx = p.x - o.x;
      const dy = p.y - o.y;
      const cells = new Set(cellsOf(o).map(([a, b]) => a * 1000 + b));
      const moved: number[] = [];
      parts.forEach((q, i) => {
        if (PARTS[q.t].layer === 'mount' && cells.has(q.x * 1000 + q.y)) moved.push(i);
      });
      let ok = true;
      const cand = next.map((q, i) => (moved.includes(i) ? { ...q, x: q.x + dx, y: q.y + dy } : q));
      for (const i of moved) if (canPlace(this.L!, cand, cand[i], i) !== null) ok = false;
      this.commit(ok ? cand : next.filter((_, i) => !moved.includes(i)));
    } else this.commit(next);
    this.sel = from >= 0 ? from : this.hist.parts.length - 1;
    if (this.sel >= this.hist.parts.length) this.sel = -1;
    this.au.snap(PARTS[p.t].order);
    tap('medium');
    this.placeFx.push({ x: p.x, y: p.y, t: this.time });
    this.burst(p, colorOf(p.t)[0]);
    this.afterChange();
  }

  private burst(p: Placed, color: string): void {
    const cells = cellsOf(p);
    const cx = cells.reduce((s, c) => s + c[0] + 0.5, 0) / cells.length;
    const cy = cells.reduce((s, c) => s + c[1] + 0.5, 0) / cells.length;
    this.fx.emit(7, cx * U, cy * U, { speed: 1.6, color: [color, '#ffffff', INK], size: 0.08, life: 0.45, up: 0.6, grav: 4 });
  }

  /* ---------------------------- tutorial ---------------------------- */
  private updateTutorial(): void {
    if (!this.tut || this.screen !== 'build') return;
    const parts = this.hist.parts;
    let idx = -1;
    for (let i = 0; i < this.tut.length; i++) {
      const s = this.tut[i];
      if (s.test) {
        idx = i;
        break;
      }
      const have = parts.filter((p) => p.t === s.t && (s.r === undefined || p.r === s.r)).length;
      if (have < (s.need ?? 1)) {
        idx = i;
        break;
      }
    }
    if (idx !== this.tutIdx) {
      this.tutIdx = idx;
      this.ui.querySelectorAll('.ml-tip,.ml-hand').forEach((e) => e.remove());
      if (idx < 0) return;
      const s = this.tut[idx];
      const tip = document.createElement('div');
      tip.className = 'ml-tip';
      tip.textContent = s.msg();
      const fr = this.freeRect();
      tip.style.top = `${fr.y0 + 4}px`;
      this.ui.appendChild(tip);
      const hand = document.createElement('div');
      hand.className = 'ml-hand';
      hand.innerHTML = IC.hand;
      this.ui.appendChild(hand);
      this.hud.hand = hand;
      this.hud.tip = tip;
      if (this.hud.info) this.hud.info.classList.add('hide');
    }
    // anima a mãozinha
    const hand = this.hud.hand;
    if (!hand || idx < 0) return;
    const s = this.tut[idx];
    const host = this.el.getBoundingClientRect();
    let from: { x: number; y: number } | null = null;
    let to: { x: number; y: number } | null = null;
    if (s.test) {
      const b = this.hud.acts?.querySelector('[data-a=test]')?.getBoundingClientRect();
      if (b) to = { x: b.left - host.left + b.width / 2, y: b.top - host.top + b.height / 2 };
    } else {
      const slot = this.hud.tray?.querySelector<HTMLElement>(`[data-t=${s.t}]`)?.getBoundingClientRect();
      if (s.r !== undefined && (this.trayRot[s.t!] ?? 0) !== s.r) {
        const b = this.hud.acts?.querySelector('[data-a=rot]')?.getBoundingClientRect();
        if (this.armed !== s.t && slot) to = { x: slot.left - host.left + slot.width / 2, y: slot.top - host.top + slot.height / 2 };
        else if (b) to = { x: b.left - host.left + b.width / 2, y: b.top - host.top + b.height / 2 };
      } else {
        if (slot) from = { x: slot.left - host.left + slot.width / 2, y: slot.top - host.top + slot.height / 2 };
        const cell = (s.cells ?? []).find(([x, y]) => !this.hist.parts.some((p) => p.t === s.t && p.x === x && p.y === y)) ?? s.cells?.[0];
        if (cell) {
          const fp = footprint(s.t!, s.r ?? 0);
          const fw = Math.max(...fp.map((c) => c[0])) + 1;
          const fh = Math.max(...fp.map((c) => c[1])) + 1;
          to = { x: wx(this.view, (cell[0] + fw / 2) * U), y: wy(this.view, (cell[1] + fh / 2) * U) };
        }
      }
    }
    if (!to) {
      hand.style.opacity = '0';
      return;
    }
    hand.style.opacity = this.drag ? '0' : '1';
    let px = to.x;
    let py = to.y;
    if (from) {
      const k = (this.time % 1.8) / 1.8;
      const e = k < 0.15 ? 0 : k > 0.8 ? 1 : (k - 0.15) / 0.65;
      const ee = e * e * (3 - 2 * e);
      px = from.x + (to.x - from.x) * ee;
      py = from.y + (to.y - from.y) * ee;
      hand.style.opacity = this.drag ? '0' : String(k > 0.9 ? 1 - (k - 0.9) * 10 : 1);
    } else {
      py += Math.sin(this.time * 6) * 4;
    }
    hand.style.transform = `translate(${px}px,${py}px)`;
  }

  /* ================================ pista ================================ */
  startTest(): void {
    const L = this.L;
    if (!L) return;
    const parts = this.hist.parts;
    if (!parts.some((p) => PARTS[p.t].layer === 'struct')) return;
    if (L.budget && partCost(parts) > L.budget) {
      this.au.bad();
      notify(t('ml.e.budget', 'Orçamento estourado'), { kind: 'bad', key: 'ml-bud' });
      return;
    }
    this.clearScreen();
    this.screen = 'test';
    this.au.mood = 'drive';
    this.au.go();
    this.overview = false;
    this.sim = new Sim(L, parts.map((p) => ({ ...p })), { ...this.sv.up });
    this.acc = 0;
    this.ending = 0;
    this.endKind = null;
    this.runId++;
    this.btnHeld = { fwd: false, back: false, brake: false, boost: false };
    this.balloonVis.clear();
    this.sel = -1;
    this.drag = null;
    const ui = this.ui;
    const top = document.createElement('div');
    top.className = 'ml-top ml-fade';
    top.innerHTML = `
      <button class="ml-btn ic" data-a="edit" aria-label="${t('ml.toWorkshop', 'Voltar à montagem')}" title="${t('ml.toWorkshop', 'Voltar à montagem')}">${IC.wrench}</button>
      <button class="ml-btn ic" data-a="restart" aria-label="${t('ml.restart', 'Reiniciar')}" title="${t('ml.restart', 'Reiniciar')}">${IC.restart}</button>`;
    ui.appendChild(top);
    const hud = document.createElement('div');
    hud.className = 'ml-hud ml-fade';
    hud.innerHTML = `<span class="ml-chip ml-time">${IC.clock}<span data-r="time">0,0</span></span><span class="ml-chip"><span class="ml-pips" data-r="pips"></span></span>`;
    ui.appendChild(hud);
    const left = document.createElement('div');
    left.className = 'ml-drive l ml-fade';
    left.innerHTML = `<button class="ml-pad" data-a="back" aria-label="${t('ml.reverse', 'Ré')}">${IC.rev}</button><button class="ml-pad sm" data-a="brake" aria-label="${t('ml.brake', 'Freio')}">${IC.brake}</button>`;
    ui.appendChild(left);
    const right = document.createElement('div');
    right.className = 'ml-drive r ml-fade';
    const hasJet = this.sim.thrusters.length > 0;
    right.innerHTML = `${hasJet ? `<button class="ml-pad jet" data-a="boost" aria-label="${t('ml.boost', 'Propulsor')}" style="position:relative">${IC.jet}<span class="ml-fuel"><i data-r="fuel" style="width:100%"></i></span></button>` : ''}<button class="ml-pad go" data-a="fwd" aria-label="${t('ml.forward', 'Acelerar')}">${IC.fwd}</button>`;
    ui.appendChild(right);
    this.hud = { top, hud, left, right, time: hud.querySelector('[data-r=time]')!, pips: hud.querySelector('[data-r=pips]')! };
    const fuel = right.querySelector<HTMLElement>('[data-r=fuel]');
    if (fuel) this.hud.fuel = fuel;
    const pad = (sel: string, k: keyof MontaLeva['btnHeld']) => {
      const el = ui.querySelector<HTMLElement>(sel);
      if (!el) return;
      this.buttons.push(
        bindButton(el, {
          onPress: () => {
            this.btnHeld[k] = true;
            this.tutTestDone();
          },
          onRelease: () => (this.btnHeld[k] = false),
          haptic: k === 'fwd' ? 'light' : 'light',
        }),
      );
    };
    pad('[data-a=fwd]', 'fwd');
    pad('[data-a=back]', 'back');
    pad('[data-a=brake]', 'brake');
    pad('[data-a=boost]', 'boost');
    this.buttons.push(bindButton(top.querySelector<HTMLElement>('[data-a=edit]')!, { onPress: () => this.toBuild() }));
    this.buttons.push(bindButton(top.querySelector<HTMLElement>('[data-a=restart]')!, { onPress: () => this.startTest() }));
    const zoneTxt = t('ml.obj', 'Leve a carga até a bandeira verde');
    objective(zoneTxt, { icon: 'target' });
    setNotifyTop(top.getBoundingClientRect().bottom - this.el.getBoundingClientRect().top + 8);
    if (this.tut) {
      const tip = document.createElement('div');
      tip.className = 'ml-tip';
      tip.style.bottom = '120px';
      tip.textContent = t('ml.tut.drive', 'Segure o botão verde para acelerar');
      ui.appendChild(tip);
      this.hud.tip = tip;
    }
    this.updatePips();
    this.setBack(() => this.toBuild());
  }

  private tutTestDone(): void {
    if (this.hud.tip && this.screen === 'test') {
      this.hud.tip.remove();
      delete this.hud.tip;
    }
  }

  toBuild(): void {
    if (!this.L) return;
    this.au.engine(0, 0);
    this.au.jetOn(false);
    this.build(false);
  }

  private updatePips(): void {
    const sim = this.sim;
    const el = this.hud.pips;
    if (!sim || !el) return;
    const z = sim.track.zone;
    let html = '';
    for (const c of sim.cargo)
      c.bodies.forEach((b, k) => {
        const p = b.getPosition();
        const cls = c.st[k] !== 'ok' ? 'lost' : p.x > z.x0 && p.x < z.x1 + 0.2 ? 'in' : '';
        html += `<i class="${cls}"></i>`;
      });
    if (el.innerHTML !== html) el.innerHTML = html;
  }

  private updateTest(dt: number): void {
    const sim = this.sim!;
    // entradas
    if (this.auto) {
      const s = autoInput(this.auto.drive, sim.time, sim.focus().x, sim.track.zone.x0);
      sim.input.fwd = s.includes('F');
      sim.input.back = s.includes('R');
      sim.input.brake = s.includes('B');
      sim.input.boost = s.includes('J');
    } else {
      const k = this.keys;
      sim.input.fwd = this.btnHeld.fwd || k.has('ArrowRight') || k.has('KeyD');
      sim.input.back = this.btnHeld.back || k.has('ArrowLeft') || k.has('KeyA');
      sim.input.brake = this.btnHeld.brake || k.has('Space') || k.has('KeyS') || k.has('ArrowDown');
      sim.input.boost = this.btnHeld.boost || k.has('ArrowUp') || k.has('KeyW');
    }
    if (this.endKind) {
      // câmera lenta no fim
      this.ending += dt;
      this.acc += dt * 0.35;
    } else this.acc += dt;
    let n = 0;
    while (this.acc >= DT && n < 4) {
      sim.step();
      this.acc -= DT;
      n++;
      if (sim.result && !this.endKind) {
        this.onResult();
      }
    }
    if (n >= 4) this.acc = 0;
    // efeitos
    for (const e of sim.fx) {
      if (e.kind === 'glass') {
        this.au.glass();
        this.fx.emit(18, e.x, e.y, { speed: 3, color: ['#bfe6ff', '#ffffff', '#7cc4f0'], size: 0.12, life: 0.8, shape: 1 });
      } else if (e.kind === 'hit') {
        this.au.hit(e.power);
        this.fx.emit(3 + Math.round(e.power * 6), e.x, e.y, { speed: 1 + e.power * 2, color: ['#c9d1dc', '#9aa5b5'], size: 0.07, life: 0.4, up: 1 });
        if (e.power > 0.5) this.shake = Math.max(this.shake, e.power * 0.6);
      } else if (e.kind === 'cargo' && e.power > 0.3) {
        this.au.hit(e.power * 0.6);
        this.fx.emit(4, e.x, e.y, { speed: 1.2, color: ['#ffd08a', '#ffffff'], size: 0.06, life: 0.35 });
      }
    }
    sim.fx.length = 0;
    // poeira das rodas
    if (sim.input.fwd || sim.input.back) {
      for (const w of sim.wheels) {
        if (!w.powered || Math.random() > 0.25 * this.gov.settings.particleBudget) continue;
        const p = w.body.getPosition();
        const sp = Math.abs(w.body.getAngularVelocity() * w.r - w.body.getLinearVelocity().x);
        if (sp > 1.5)
          this.fx.emit(1, p.x - w.r * 0.6, p.y - w.r * 0.9, { speed: 0.6, color: '#cfd6e0', size: 0.1, life: 0.5, up: 0.8, grav: 1, shape: 2 });
      }
    }
    for (const th of sim.thrusters) {
      if (!th.on) continue;
      const b = th.body;
      const a = b.getAngle() + (th.r * Math.PI) / 2;
      const wp = b.getWorldPoint({ x: th.lx, y: th.ly });
      if (Math.random() < 0.7 * this.gov.settings.particleBudget + 0.2)
        this.fx.emit(1, wp.x - Math.cos(a) * 0.3, wp.y - Math.sin(a) * 0.3, { speed: 0.5, color: ['#ffd45c', '#ff7a59', '#cfd6e0'], size: 0.11, life: 0.35, up: 0, grav: -1, shape: 2 });
    }
    this.au.jetOn(sim.thrusters.some((th) => th.on));
    // som do motor
    let rot = 0;
    let pw = 0;
    for (const w of sim.wheels)
      if (w.powered) {
        rot += Math.abs(w.body.getAngularVelocity());
        pw++;
      }
    this.au.engine(pw ? rot / pw : 0, sim.input.fwd || sim.input.back ? 1 : 0);
    // câmera
    const f = sim.focus();
    const vx = sim.speed();
    const sT = this.portrait ? Math.min(this.W / 7.5, this.H / 12) : Math.min(this.H / 8.2, this.W / 15);
    this.camT.s = sT;
    const look = clamp(vx * 0.45, -2.5, 3.5) + (this.portrait ? 0.6 : 2);
    this.camT.x = f.x + look;
    this.camT.y = f.y + (this.portrait ? 1.8 : 0.9);
    // HUD
    const tt = Math.floor(sim.time * 10);
    if (tt !== this.lastHudT) {
      this.lastHudT = tt;
      if (this.hud.time) this.hud.time.textContent = sec(sim.time);
      this.updatePips();
      if (this.hud.fuel && sim.thrusters.length) {
        const fuel = sim.thrusters.reduce((s, th) => s + th.fuel, 0) / (sim.thrusters.length * 3.5);
        this.hud.fuel.style.width = `${Math.round(fuel * 100)}%`;
      }
    }
    if (this.endKind === 'fail' && this.ending > 0.95) this.failBack();
    if (this.endKind === 'win' && this.ending > 0.7 && !this.hud.res) this.showWin();
  }

  private onResult(): void {
    const sim = this.sim!;
    const r = sim.result!;
    this.endKind = r.win ? 'win' : 'fail';
    objective(null);
    this.ending = 0;
    this.au.engine(0, 0);
    this.au.jetOn(false);
    if (r.win) {
      this.au.win();
      success();
      const z = sim.track.zone;
      for (let i = 0; i < 4; i++)
        this.fx.emit(10, z.x0 + 0.5 + Math.random() * (z.x1 - z.x0 - 1), z.y + 1.5, { speed: 4, color: ['#2fbf8f', '#ffb547', '#5b8def', '#ef5d60', '#8a6cf0'], size: 0.14, life: 1.4, up: 3, grav: 6 });
    } else {
      this.au.lost();
      tap('heavy');
      this.shake = 0.8;
      const msg =
        r.reason === 'broken'
          ? t('ml.f.broken', 'O vidro quebrou!')
          : r.reason === 'time'
            ? t('ml.f.time', 'Tempo esgotado')
            : t('ml.f.lost', 'Carga perdida!');
      const fl = document.createElement('div');
      fl.className = 'ml-flash';
      this.ui.appendChild(fl);
      const d = document.createElement('div');
      d.className = 'ml-fail';
      d.innerHTML = `${r.reason === 'broken' ? IC.glass : IC.box}<span>${esc(msg)}</span>`;
      this.ui.appendChild(d);
      reportRun({ game: 'montaleva', score: 0, coins: 0, durationSec: Math.round(sim.time), won: false, stats: { level: this.L!.n } });
    }
  }

  /** falha: volta na hora para a montagem com o projeto intacto */
  private failBack(): void {
    if (this.auto) this.auto = null;
    this.toBuild();
    notify(t('ml.f.tip', 'Projeto guardado. Ajuste e teste de novo!'), { icon: 'refresh', key: 'ml-fail' });
  }

  private showWin(): void {
    const sim = this.sim!;
    const L = this.L!;
    const rec = levelRec(L.n);
    const first = !rec.done;
    const time = sim.time;
    const nParts = this.hist.parts.length;
    const got: [boolean, boolean, boolean] = [time <= L.goals.time, !sim.flipped, nParts <= L.goals.parts];
    const before = rec.goals.filter(Boolean).length;
    rec.done = true;
    rec.goals = [rec.goals[0] || got[0], rec.goals[1] || got[1], rec.goals[2] || got[2]];
    rec.best = rec.best ? Math.min(rec.best, time) : time;
    const after = rec.goals.filter(Boolean).length;
    const newStars = after - before;
    const gears = (first ? 12 : 3) + newStars * 6;
    this.sv.gears += gears;
    this.sv.deliveries++;
    persistML();
    const coins = (first ? 5 : 1) + newStars * 2;
    addCoins(coins);
    reportRun({
      game: 'montaleva',
      score: after * 100 + Math.max(0, Math.round((L.goals.time * 2 - time) * 10)),
      coins,
      durationSec: Math.round(time),
      won: true,
      stats: { level: L.n, stars: after, parts: nParts },
    });
    const ov = document.createElement('div');
    ov.className = 'ml-ov';
    const row = (ok: boolean, ic: string, label: string, val: string) =>
      `<div class="${ok ? 'ok' : ''}">${ic}<span>${label}</span><em>${val}</em>${ok ? IC.check : IC.x}</div>`;
    const hasNext = L.n < LEVELS.length;
    ov.innerHTML = `<div class="ml-res">
      <h2>${t('ml.win', 'Entregue!')}</h2>
      <div class="ml-big">${[0, 1, 2].map((i) => `<i data-s="${i}"></i>`).join('')}</div>
      <div class="ml-gl">
        ${row(got[0], IC.clock, t('ml.goal.time', 'Tempo ≤ {n} s', { n: L.goals.time }), sec(time) + ' s')}
        ${row(got[1], IC.tilt, t('ml.goal.noflip', 'Sem tombar'), '')}
        ${row(got[2], IC.blocks, t('ml.goal.parts', 'Até {n} peças', { n: L.goals.parts }), String(nParts))}
      </div>
      <div class="ml-rw"><span class="ml-chip">⚙ +${gears}</span><span class="ml-chip">+${coins} ${t('ml.coins', 'moedas')}</span></div>
      <div class="ml-row">
        <button class="ml-btn ic" data-a="edit" aria-label="${t('ml.toWorkshop', 'Voltar à montagem')}">${IC.wrench}</button>
        <button class="ml-btn ic" data-a="again" aria-label="${t('ml.again', 'De novo')}">${IC.restart}</button>
        ${hasNext ? `<button class="ml-btn pri" data-a="next">${t('ml.next', 'Próxima')}${IC.next}</button>` : `<button class="ml-btn pri" data-a="map">${IC.map}${t('ml.levels', 'Fases')}</button>`}
      </div></div>`;
    this.ui.appendChild(ov);
    this.hud.res = ov;
    ov.querySelectorAll<HTMLElement>('[data-s]').forEach((s, i) => {
      if (!got[i] && !rec.goals[i]) return;
      window.setTimeout(() => {
        if (this.dead) return;
        s.classList.add('on');
        if (!got[i]) s.style.opacity = '.45';
        this.au.star(i);
      }, 250 + i * 260);
    });
    this.on(ov, '[data-a=edit]', () => this.toBuild());
    this.on(ov, '[data-a=again]', () => this.startTest());
    this.on(ov, '[data-a=next]', () => this.openLevel(L.n + 1));
    this.on(ov, '[data-a=map]', () => this.levels());
    this.setBack(() => this.toBuild());
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (down) this.keys.add(e.code);
    else this.keys.delete(e.code);
    if (!down || e.repeat) return;
    if (this.screen === 'build') {
      if (e.code === 'Enter') this.startTest();
      else if (e.code === 'KeyR') this.rotate();
      else if (e.code === 'Delete' || e.code === 'Backspace') this.deleteSel();
      else if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) {
        if (this.hist.undo()) this.afterChange();
      } else if (e.code === 'KeyY' && (e.ctrlKey || e.metaKey)) {
        if (this.hist.redo()) this.afterChange();
      }
    } else if (this.screen === 'test') {
      if (e.code === 'Escape' || e.code === 'KeyE') this.toBuild();
      else if (e.code === 'KeyR' && !this.hud.res) this.startTest();
    }
  }

  /* ================================ desenho ================================ */
  private draw(): void {
    const x = this.cx;
    const v = this.view;
    v.s = this.cam.s;
    let sx = 0;
    let sy = 0;
    if (this.shake > 0 && this.gov.settings.shake) {
      sx = (Math.random() - 0.5) * this.shake * 6;
      sy = (Math.random() - 0.5) * this.shake * 6;
    }
    v.ox = this.W / 2 - this.cam.x * v.s + sx;
    v.oy = this.H / 2 + this.cam.y * v.s + sy;
    x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    drawBackground(x, v, this.time, this.screen !== 'build');
    if (this.screen === 'levels' || this.screen === 'shop' || this.screen === 'settings') return;
    const tr = this.screen === 'menu' ? DEMO_TRACK : this.track;
    if (!tr) return;
    const sim = this.screen === 'menu' ? this.demo : this.screen === 'test' ? this.sim : null;
    drawZone(x, v, tr, this.time, t('ml.zone', 'ENTREGA'), !!(sim && sim.result && sim.result.win));
    if (sim) this.drawObjs(sim);
    else this.drawStaticObjs(tr);
    drawTrack(x, v, tr);
    if (this.screen === 'build') this.drawBuild();
    else if (sim) {
      this.drawSimVehicle(sim);
      this.drawSimCargo(sim);
    }
    this.fx.draw(x, v);
  }

  private drawStaticObjs(tr: Track): void {
    // estado inicial dos objetos (montagem)
    for (const o of tr.objs) {
      const bodies: { x: number; y: number; a: number }[] = [];
      if (o.k === 'seesaw') bodies.push({ x: o.x, y: o.y + 0.62, a: Math.asin(Math.min(0.95, 0.62 / (o.len / 2))) });
      else if (o.k === 'lift') bodies.push({ x: o.x, y: o.y0 - 0.15, a: 0 });
      else if (o.k === 'bridge') {
        const n = Math.max(3, Math.round((o.x1 - o.x0) / 0.62));
        const pw = (o.x1 - o.x0) / n;
        for (let i = 0; i < n; i++) bodies.push({ x: o.x0 + pw * (i + 0.5), y: o.y - 0.08, a: 0 });
      } else if (o.k === 'gate') bodies.push({ x: o.x, y: o.y + 0.75, a: 0 });
      else if (o.k === 'pend') bodies.push({ x: o.x + Math.sin(1.05) * o.len, y: o.y - Math.cos(1.05) * o.len, a: 0 });
      else if (o.k === 'box') bodies.push({ x: o.x, y: o.y, a: 0 });
      drawObj(this.cx, this.view, { o, bodies }, this.time);
    }
  }

  private drawObjs(sim: Sim): void {
    for (const so of sim.objs) {
      drawObj(
        this.cx,
        this.view,
        {
          o: so.o,
          bodies: so.bodies.map((b) => {
            const p = b.getPosition();
            return { x: p.x, y: p.y, a: b.getAngle() };
          }),
        },
        this.time,
      );
    }
  }

  /** contexto em unidades de célula, origem no ponto (px,py) do mundo, girado `a` */
  private cellSpace(px: number, py: number, a: number): void {
    const x = this.cx;
    const v = this.view;
    x.translate(wx(v, px), wy(v, py));
    x.rotate(-a);
    x.scale(v.s * U, -v.s * U);
  }

  private drawBuild(): void {
    const L = this.L!;
    const x = this.cx;
    const v = this.view;
    const [GW, GH] = L.grid;
    const lw = 1.6 / (v.s * U);
    const parts = this.hist.parts;
    const d = this.drag;
    const hide = d && d.kind === 'move' && d.moved ? d.from : -1;
    // grade
    x.save();
    this.cellSpace(0, 0, 0);
    x.fillStyle = COL.gridBg;
    x.beginPath();
    x.roundRect(-0.08, -0.08, GW + 0.16, GH + 0.16, 0.25);
    x.fill();
    x.strokeStyle = 'rgba(91,141,239,0.35)';
    x.lineWidth = lw;
    x.setLineDash([0.18, 0.14]);
    x.stroke();
    x.setLineDash([]);
    x.fillStyle = COL.grid;
    for (let gx = 0; gx <= GW; gx++)
      for (let gy = 0; gy <= GH; gy++) {
        x.beginPath();
        x.arc(gx, gy, 0.045, 0, Math.PI * 2);
        x.fill();
      }
    // pontos de encaixe (arrastando ou peça armada)
    const showFor = d && d.moved ? { t: d.t, r: d.r, skip: d.kind === 'move' ? d.from : -1 } : this.armed ? { t: this.armed, r: this.trayRot[this.armed] ?? 0, skip: -1 } : null;
    if (showFor) {
      const cells = snapCells(L, parts, showFor.t, showFor.r, showFor.skip);
      const fp = footprint(showFor.t, showFor.r);
      const fw = Math.max(...fp.map((c) => c[0])) + 1;
      const fh = Math.max(...fp.map((c) => c[1])) + 1;
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 5);
      x.fillStyle = `rgba(59,111,224,${0.18 + pulse * 0.12})`;
      for (const [cx, cy] of cells) {
        x.beginPath();
        x.arc(cx + fw / 2, cy + fh / 2, 0.13, 0, Math.PI * 2);
        x.fill();
      }
    }
    // dica do tutorial: célula alvo
    if (this.tut && this.tutIdx >= 0) {
      const s = this.tut[this.tutIdx];
      if (s.t && s.cells) {
        const cell = s.cells.find(([cx, cy]) => !parts.some((p) => p.t === s.t && p.x === cx && p.y === cy));
        if (cell) {
          const fp = footprint(s.t, s.r ?? 0);
          x.strokeStyle = `rgba(59,111,224,${0.5 + 0.4 * Math.sin(this.time * 6)})`;
          x.lineWidth = lw * 2;
          x.setLineDash([0.15, 0.1]);
          for (const [dx, dy] of fp) {
            x.beginPath();
            x.roundRect(cell[0] + dx + 0.06, cell[1] + dy + 0.06, 0.88, 0.88, 0.14);
            x.stroke();
          }
          x.setLineDash([]);
        }
      }
    }
    x.restore();
    // carga (posição inicial)
    for (const c of L.cargo) for (const p of cargoPieces(c)) drawCargo(x, v, c.t, p.x, p.y, 0);
    // veículo
    x.save();
    this.cellSpace(0, 0, 0);
    this.drawDesign(parts, hide, lw, 1);
    // seleção
    if (this.sel >= 0 && this.sel !== hide && parts[this.sel]) {
      const p = parts[this.sel];
      x.strokeStyle = '#3b6fe0';
      x.lineWidth = lw * 2.2;
      const r = PARTS[p.t].radius;
      x.beginPath();
      if (r) x.arc(p.x + 0.5, p.y + 0.5, r / U + 0.12, 0, Math.PI * 2);
      else for (const [cx, cy] of cellsOf(p)) x.roundRect(cx - 0.06, cy - 0.06, 1.12, 1.12, 0.18);
      x.stroke();
    }
    // brilho de encaixe recente
    this.placeFx = this.placeFx.filter((f) => this.time - f.t < 0.35);
    for (const f of this.placeFx) {
      const k = (this.time - f.t) / 0.35;
      x.strokeStyle = `rgba(47,191,143,${1 - k})`;
      x.lineWidth = lw * 2;
      x.beginPath();
      x.roundRect(f.x - k * 0.3, f.y - k * 0.3, 1 + k * 0.6, 1 + k * 0.6, 0.2);
      x.stroke();
    }
    // centro de massa
    if (this.sv.com && parts.length) {
      const com = designCOM(parts);
      if (com) {
        x.save();
        x.translate(com.x, com.y);
        x.fillStyle = '#fff';
        x.strokeStyle = INK;
        x.lineWidth = lw;
        x.beginPath();
        x.arc(0, 0, 0.17, 0, Math.PI * 2);
        x.fill();
        x.stroke();
        x.fillStyle = INK;
        x.beginPath();
        x.moveTo(0, 0);
        x.arc(0, 0, 0.17, 0, Math.PI / 2);
        x.closePath();
        x.moveTo(0, 0);
        x.arc(0, 0, 0.17, Math.PI, Math.PI * 1.5);
        x.closePath();
        x.fill();
        x.restore();
      }
    }
    // peça sendo arrastada
    if (d && d.moved) {
      const fp = footprint(d.t, d.r);
      const fw = Math.max(...fp.map((c) => c[0])) + 1;
      const fh = Math.max(...fp.map((c) => c[1])) + 1;
      if (d.snap) {
        const p = { t: d.t, x: d.snap.x, y: d.snap.y, r: d.r };
        x.fillStyle = 'rgba(47,191,143,0.16)';
        x.strokeStyle = COL.ok;
        x.lineWidth = lw * 2;
        for (const [cx, cy] of cellsOf(p)) {
          x.beginPath();
          x.roundRect(cx - 0.04, cy - 0.04, 1.08, 1.08, 0.18);
          x.fill();
          x.stroke();
        }
        this.drawPart(p, lw, 0.92, 0);
      }
      // segue o dedo (fantasma)
      const gx = d.fx - fw / 2;
      const gy = d.fy - fh / 2;
      if (!d.snap || Math.hypot(gx - d.snap.x, gy - d.snap.y) > 0.25) {
        const p = { t: d.t, x: gx, y: gy, r: d.r };
        x.save();
        if (!d.snap) {
          x.fillStyle = 'rgba(239,93,96,0.14)';
          x.beginPath();
          for (const [cx, cy] of cellsOf(p)) x.roundRect(cx - 0.04, cy - 0.04, 1.08, 1.08, 0.18);
          x.fill();
        }
        this.drawPart(p, lw, d.snap ? 0.35 : 0.6, 0);
        x.restore();
      }
    }
    x.restore();
  }

  /** desenha o projeto (montagem), em unidades de célula */
  private drawDesign(parts: readonly Placed[], hide: number, lw: number, alpha: number): void {
    const x = this.cx;
    const an = analyze(parts);
    // sombra
    if (this.gov.settings.softShadows) {
      x.save();
      x.translate(0.07, -0.09);
      x.fillStyle = COL.shadow;
      x.beginPath();
      parts.forEach((p, i) => {
        if (i === hide || PARTS[p.t].layer !== 'struct') return;
        structSilhouette(x, p);
      });
      x.fill();
      x.restore();
    }
    parts.forEach((p, i) => {
      if (i !== hide && PARTS[p.t].layer === 'struct') drawStructCell(x, p, lw, alpha);
    });
    for (const l of an.links) drawLink(x, l.x, l.y, lw);
    // correias motor → rodas
    x.strokeStyle = 'rgba(239,93,96,0.55)';
    x.lineWidth = lw * 1.2;
    x.setLineDash([0.12, 0.1]);
    for (const [mi, ws] of an.drives) {
      if (mi === hide) continue;
      const m = parts[mi];
      for (const wi of ws) {
        if (wi === hide) continue;
        const w = parts[wi];
        x.beginPath();
        x.moveTo(m.x + 0.5, m.y + 0.5);
        x.lineTo(w.x + 0.5, w.y + 0.5);
        x.stroke();
      }
    }
    x.setLineDash([]);
    parts.forEach((p, i) => {
      if (i === hide || PARTS[p.t].layer !== 'mount') return;
      this.drawPart(p, lw, alpha, 0, an.power.has(i));
    });
  }

  private drawPart(p: Placed, lw: number, alpha: number, ang: number, powered = false): void {
    const x = this.cx;
    if (PARTS[p.t].layer === 'struct') drawStructCell(x, p, lw, alpha);
    else if (PARTS[p.t].radius) drawWheel(x, p.t, p.x + 0.5, p.y + 0.5, ang, lw, powered, alpha);
    else if (p.t === 'thruster') drawThruster(x, p.x + 0.5, p.y + 0.5, p.r, lw, 0, this.time, alpha);
    else if (p.t === 'balloon') drawBalloon(x, p.x + 0.5, p.y + 0.5, p.x + 0.5 + Math.sin(this.time * 1.5) * 0.08, p.y + 2.3, lw, alpha);
    x.globalAlpha = 1;
  }

  private drawSimVehicle(sim: Sim): void {
    const x = this.cx;
    const v = this.view;
    const lw = 1.6 / (v.s * U);
    const parts = sim.parts;
    const an = sim.an;
    // balões (atrás de tudo)
    for (const bl of sim.balloons) {
      const a = bl.body.getWorldPoint({ x: bl.lx, y: bl.ly });
      let vis = this.balloonVis.get(bl.idx);
      if (!vis) {
        vis = { x: a.x, y: a.y + 1.1, vx: 0, vy: 0 };
        this.balloonVis.set(bl.idx, vis);
      }
      const tx = a.x;
      const ty = a.y + 1.1;
      vis.vx += ((tx - vis.x) * 40 - vis.vx * 6) * (1 / 60);
      vis.vy += ((ty - vis.y) * 40 - vis.vy * 6) * (1 / 60);
      vis.x += vis.vx / 60;
      vis.y += vis.vy / 60;
      x.save();
      this.cellSpace(0, 0, 0);
      drawBalloon(x, a.x / U, a.y / U, vis.x / U, vis.y / U, lw);
      x.restore();
    }
    // grupos rígidos
    sim.groups.forEach((b, gi) => {
      const p = b.getPosition();
      x.save();
      this.cellSpace(p.x, p.y, b.getAngle());
      if (this.gov.settings.softShadows) {
        x.save();
        x.translate(0.07, -0.09);
        x.fillStyle = COL.shadow;
        x.beginPath();
        for (const i of an.groups[gi]) structSilhouette(x, parts[i]);
        x.fill();
        x.restore();
      }
      for (const i of an.groups[gi]) drawStructCell(x, parts[i], lw);
      for (const l of an.links) if (an.group[l.i] === gi) drawLink(x, l.x, l.y, lw);
      // propulsores deste grupo
      for (const th of sim.thrusters) {
        if (th.body !== b) continue;
        drawThruster(x, th.lx / U, th.ly / U, th.r, lw, th.on ? 1 : 0, this.time);
      }
      x.restore();
    });
    // pinos das dobradiças
    for (const pin of sim.pins) {
      const p = pin.body.getPosition();
      x.save();
      this.cellSpace(p.x, p.y, pin.body.getAngle());
      drawStructCell(x, { ...parts[pin.idx], x: -0.5, y: -0.5 }, lw);
      x.restore();
    }
    // rodas + suspensão
    for (const w of sim.wheels) {
      const p = w.body.getPosition();
      if (w.spring) {
        const a = w.base.getWorldPoint({ x: w.lx, y: w.ly + U * 0.45 });
        this.drawSpring(a.x, a.y, p.x, p.y, w.base.getAngle());
      }
      x.save();
      this.cellSpace(p.x, p.y, 0);
      drawWheel(x, parts[w.idx].t, 0, 0, w.body.getAngle(), lw, w.powered > 0);
      x.restore();
    }
  }

  private drawSpring(ax: number, ay: number, bx: number, by: number, ang: number): void {
    const x = this.cx;
    const v = this.view;
    const n = 6;
    const nx = -Math.cos(ang);
    const ny = -Math.sin(ang);
    const w = 0.09;
    x.strokeStyle = colorOf('spring')[1];
    x.lineWidth = Math.max(1.5, v.s * 0.035);
    x.beginPath();
    x.moveTo(wx(v, ax), wy(v, ay));
    for (let i = 1; i < n; i++) {
      const k = i / n;
      const s = i % 2 ? 1 : -1;
      x.lineTo(wx(v, ax + (bx - ax) * k + nx * w * s), wy(v, ay + (by - ay) * k + ny * w * s));
    }
    x.lineTo(wx(v, bx), wy(v, by));
    x.stroke();
  }

  private drawSimCargo(sim: Sim): void {
    for (const c of sim.cargo)
      c.bodies.forEach((b, k) => {
        const p = b.getPosition();
        drawCargo(this.cx, this.view, c.def.t, p.x, p.y, b.getAngle(), c.st[k] === 'broken', c.st[k] === 'lost');
      });
  }

  /* ================================ API de teste (só com ?debug) ================================ */
  private debugApi() {
    return {
      game: this,
      state: () => ({
        screen: this.screen,
        level: this.L?.n ?? 0,
        parts: this.hist.parts.map((p) => ({ ...p })),
        sel: this.sel,
        armed: this.armed,
        simTime: this.sim?.time ?? 0,
        result: this.sim?.result ?? null,
        flipped: this.sim?.flipped ?? false,
        focus: this.sim ? this.sim.focus() : null,
        gears: this.sv.gears,
        stars: LEVELS.map((L) => starsOf(L.n)),
      }),
      openLevel: (n: number) => this.openLevel(n),
      menu: () => this.menu(),
      levels: () => this.levels(),
      shop: () => this.shop(),
      settings: () => this.settings(),
      /** coloca uma peça pela API (mesmas regras do arrastar) */
      place: (tt: PartId, cx: number, cy: number, r = 0) => {
        const p = { t: tt, x: cx, y: cy, r: normRot(tt, r) };
        const e = canPlace(this.L!, this.hist.parts, p);
        if (e) return e;
        this.place(p, -1);
        return null;
      },
      setDesign: (parts: Placed[]) => {
        this.commit(parts.map((p) => ({ ...p })));
      },
      clear: () => this.commit([]),
      test: () => this.startTest(),
      toBuild: () => this.toBuild(),
      input: (o: Partial<MontaLeva['btnHeld']>) => Object.assign(this.btnHeld, o),
      auto: (drive?: [number, string, ('x' | 'z' | 't')?][]) => (this.auto = { drive }),
      manual: () => (this.auto = null),
      /** centro de uma célula da grade em coordenadas de tela (para arrastar com toque) */
      cellToClient: (cx: number, cy: number, tt?: PartId, r = 0) => {
        const fp = tt ? footprint(tt, r) : [[0, 0]];
        const fw = Math.max(...fp.map((c) => c[0])) + 1;
        const fh = Math.max(...fp.map((c) => c[1])) + 1;
        const rc = this.cv.getBoundingClientRect();
        // usa a câmera-alvo (a atual pode estar no meio da animação)
        const s = this.camT.s;
        const ox = this.W / 2 - this.camT.x * s;
        const oy = this.H / 2 + this.camT.y * s;
        return { x: rc.left + ox + (cx + fw / 2) * U * s, y: rc.top + oy - (cy + fh / 2) * U * s };
      },
      slotRect: (tt: PartId) => this.hud.tray?.querySelector<HTMLElement>(`[data-t=${tt}]`)?.getBoundingClientRect() ?? null,
      solutions: async () => (await import('./solutions')).SOLUTIONS,
      verifyAll: async () => (await import('./solutions')).verifyAll(),
      /** carrega a solução de referência e dirige sozinho na pista real */
      playSolution: async (n: number) => {
        const m = await import('./solutions');
        this.openLevel(n);
        this.commit(m.SOLUTIONS[n].parts.map((p) => ({ ...p })));
        this.auto = { drive: m.SOLUTIONS[n].drive };
        this.startTest();
      },
    };
  }
}

function autoInput(drive: [number, string, ('x' | 'z' | 't')?][] | undefined, time: number, x: number, zx: number): string {
  if (!drive || !drive.length) return 'F';
  let cur = 'F';
  for (const [v, s, k] of drive) if (k === 'x' ? x >= v : k === 'z' ? x >= zx + v : time >= v) cur = s;
  return cur;
}

function logoSvg(): string {
  return `<svg class="ml-mark" viewBox="0 0 48 48"><rect x="6" y="20" width="12" height="10" rx="2.5" fill="#5b8def" stroke="#2f5bb8" stroke-width="2"/><rect x="18" y="20" width="12" height="10" rx="2.5" fill="#ef5d60" stroke="#b8333a" stroke-width="2"/><path d="M30 30V20h4l8 10z" fill="#f2a541" stroke="#c47a17" stroke-width="2" stroke-linejoin="round"/><rect x="17" y="8" width="11" height="11" rx="2" fill="#ffb547" stroke="#26303d" stroke-width="2"/><circle cx="12" cy="33" r="6" fill="#2d3340" stroke="#141820" stroke-width="2"/><circle cx="12" cy="33" r="2.4" fill="#e9edf2"/><circle cx="36" cy="33" r="6" fill="#2d3340" stroke="#141820" stroke-width="2"/><circle cx="36" cy="33" r="2.4" fill="#e9edf2"/></svg>`;
}

export { norm };
