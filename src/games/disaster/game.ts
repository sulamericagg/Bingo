/* ============================================================
 *  SOBREVIVA AOS DESASTRES — laço principal, fases da rodada,
 *  jogadores (você + bots + visitantes online), desastres e HUD.
 *  Desenho em draw.ts; mundo/física em world.ts.
 * ============================================================ */
import { t } from '../../i18n';
import { save } from '../../core/storage';
import { addCoins } from '../../core/economy';
import { audio } from '../../core/audio';
import { tap, success } from '../../core/haptics';
import { QualityGovernor, type QualitySettings, type Tier } from '../../core/quality';
import { reportRun, type MiniGameHandle } from '../../hub/registry';
import type { PeerState, PresenceSession } from '../../services/presence-api';
import { drawPlayer, type PlayerPose } from '../../game/character';
import { SKINS, type Skin } from '../../game/skins';
import { DISASTERS, scenarioName, scenarios, mulberry, type DisasterId, type Scenario } from './scenarios';
import { GROUND_Y, World, type Body } from './world';
import { Drawer } from './draw';
import { Hud } from './hud';

/* ------------------------------ tipos ------------------------------ */

export interface Input {
  l: boolean;
  r: boolean;
  j: boolean;
  u: boolean;
}

export interface Bot {
  gx: number;
  gy: number;
  think: number;
  skill: number;
  hop: number;
  lazy: number;
}

export interface Player {
  id: string;
  name: string;
  self: boolean;
  bot: Bot | null;
  x: number;
  y: number; // pés
  vx: number;
  vy: number;
  onGround: boolean;
  stand: number; // índice do corpo onde está em pé (-1)
  face: number;
  jumps: number;
  maxJumps: number;
  climbing: boolean;
  jumpHeld: boolean;
  coyote: number;
  sq: number; // squash & stretch (-1..1)
  runT: number;
  alive: boolean;
  safe: boolean; // dentro do bunker
  ghost: boolean;
  gx: number;
  gy: number;
  ghostT: number;
  outOrder: number;
  sprite: HTMLCanvasElement | null;
  skin: Skin;
  color: string;
  input: Input;
}

export interface Strike {
  on: boolean;
  kind: 'bomb' | 'meteor' | 'bolt' | 'rock';
  x: number;
  ty: number;
  sx: number;
  sy: number;
  t: number;
  T: number;
  r: number;
  flash: number;
}

export interface Fluid {
  kind: 'water' | 'lava' | 'goo' | 'snow';
  level: number;
  target: number;
  rate: number;
  front: number;
  dir: number; // 0 = sobe por igual; 1 da esquerda; -1 da direita
  speed: number;
  crest: number;
  push: number;
}

export type Phase = 'intro' | 'prepare' | 'warn' | 'disaster' | 'impact' | 'end';

export const R = 13; // raio do Bloop em unidades do mundo
const GRAV = 1700;
const JUMP = 610;
const RUN = 205;
const BOT_NAMES = ['Pipoca', 'Jujuba', 'Tico', 'Nina', 'Biscoito', 'Lulu', 'Zeca', 'Mimi', 'Tuca', 'Fofura', 'Dudu', 'Bolacha', 'Pingo', 'Teca'];
const MAX_STRIKES = 24;
const LS_KEY = 'bo-disaster';

interface Progress {
  next: number;
  best: number;
  survived: number;
}

function loadProgress(): Progress {
  try {
    const p = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    return { next: p.next | 0 || 1, best: p.best | 0, survived: p.survived | 0 };
  } catch {
    return { next: 1, best: 0, survived: 0 };
  }
}
function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(p));
  } catch {
    /* */
  }
}

/* ------------------------------ jogo ------------------------------ */

export class DisasterGame implements MiniGameHandle {
  root: HTMLElement;
  exitCb: () => void;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  hud: Hud;
  draw: Drawer;
  gov: QualityGovernor;
  q: QualitySettings;
  tier: Tier;

  sc!: Scenario;
  world!: World;
  players: Player[] = [];
  me!: Player;
  peers: PeerState[] = [];
  presence: PresenceSession | null = null;

  phase: Phase = 'intro';
  phaseT = 0;
  phaseDur = 0;
  roundT = 0;
  time = 0;
  timeScale = 1;
  dIndex = 0; // desastre atual (combo)
  active = new Set<DisasterId>();
  fluid: Fluid | null = null;
  strikes: Strike[] = [];
  strikeTimer = 0;
  quake = 0;
  tornado = { on: false, x: 0, vx: 0, r: 62 };
  meteor = { t: -1, x: 0, ring: -1, flash: 0 };
  wind = 0;
  night = false;
  shake = 0;
  outCount = 0;
  rng = mulberry(1);

  // sessão
  progress = loadProgress();
  streak = 0;
  sessionCoins = 0;
  sessionRounds = 0;
  sessionSurvived = 0;
  roundCoins = 0;

  // câmera
  cam = { x: 0, y: -200, scale: 1, vw: 0, vh: 0, ps: 1 };
  dpr = 1;

  private raf = 0;
  private last = 0;
  private paused = false;
  private destroyed = false;
  private keys: Input = { l: false, r: false, j: false, u: false };
  private sendT = 0;
  private offs: (() => void)[] = [];
  fluidAt: (x: number) => number;

  constructor(root: HTMLElement, exit: () => void, opts: { scenario?: number } = {}) {
    this.root = root;
    this.exitCb = exit;
    root.classList.add('dz-root');
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'dz-canvas';
    root.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
    this.gov = new QualityGovernor({ persist: false, emit: false, onChange: (tier, s) => this.applyQuality(tier, s) });
    this.tier = this.gov.tier;
    this.q = this.gov.settings;
    for (let i = 0; i < MAX_STRIKES; i++) this.strikes.push({ on: false, kind: 'bomb', x: 0, ty: 0, sx: 0, sy: 0, t: 0, T: 1, r: 40, flash: 0 });
    this.fluidAt = (x: number) => this.surfaceAt(x);
    this.draw = new Drawer(this);
    this.hud = new Hud(this);
    this.bindInput();
    this.resize();
    const ro = () => this.resize();
    window.addEventListener('resize', ro);
    this.offs.push(() => window.removeEventListener('resize', ro));
    if (opts.scenario) this.progress.next = Math.max(1, Math.min(100, opts.scenario));
    this.startRound();
    this.joinOnline();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  /* ------------------------- qualidade/tamanho ------------------------- */

  maxBodies(): number {
    return [70, 110, 150, 190][this.tier];
  }

  private applyQuality(tier: Tier, s: QualitySettings): void {
    this.tier = tier;
    this.q = s;
    this.resize();
  }

  resize(): void {
    const w = this.root.clientWidth || window.innerWidth;
    const h = this.root.clientHeight || window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.q.dprCap);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    // retrato: ~690 unidades de altura; paisagem: ~900 de largura
    const scale = Math.max(h / 690, w / 900);
    this.cam.scale = scale;
    this.cam.vw = w / scale;
    this.cam.vh = h / scale;
    this.cam.ps = scale * this.dpr;
    this.draw.onResize();
    for (const p of this.players) p.sprite = null;
  }

  /* ------------------------------ entrada ------------------------------ */

  private bindInput(): void {
    const kd = (e: KeyboardEvent) => this.key(e, true);
    const ku = (e: KeyboardEvent) => this.key(e, false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    this.offs.push(() => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    });
  }

  private key(e: KeyboardEvent, down: boolean): void {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') this.keys.l = down;
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') this.keys.r = down;
    else if (k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W') {
      this.keys.j = down;
      this.keys.u = down;
    } else return;
    e.preventDefault();
  }

  /** botões na tela (hud.ts) */
  touch = { l: false, r: false, j: false };

  /* ------------------------------ online ------------------------------ */

  private async joinOnline(): Promise<void> {
    try {
      const mods = import.meta.glob('../../services/presence.ts');
      const load = Object.values(mods)[0];
      if (!load) return;
      const mod = (await load().catch(() => null)) as { joinPresence?: (id: string, o?: { botsIfAlone?: number; seed?: number }) => Promise<PresenceSession> } | null;
      if (!mod?.joinPresence || this.destroyed) return;
      const s = await mod.joinPresence('disaster', { botsIfAlone: 0 });
      if (this.destroyed) {
        s.leave();
        return;
      }
      this.presence = s;
      s.onPeers((peers) => {
        this.peers = peers.filter((p) => !p.bot).slice(0, 4);
      });
    } catch {
      /* sem online: só bots */
    }
  }

  /* ------------------------------ rodada ------------------------------ */

  startRound(): void {
    const list = scenarios();
    this.sc = list[(this.progress.next - 1) % 100];
    this.world = new World(this.sc, this.maxBodies());
    this.rng = mulberry(this.sc.seed + this.sessionRounds * 13);
    this.night = this.sc.mod === 'noite' || this.sc.disasters.includes('raios');
    this.wind = this.sc.mod === 'vento' ? (this.rng() < 0.5 ? -1 : 1) * 90 : 0;
    this.fluid = null;
    this.active.clear();
    this.dIndex = 0;
    this.quake = 0;
    this.tornado.on = false;
    this.meteor.t = -1;
    this.meteor.ring = -1;
    this.meteor.flash = 0;
    this.outCount = 0;
    this.roundCoins = 0;
    this.roundT = 0;
    this.timeScale = 1;
    for (const s of this.strikes) s.on = false;
    this.spawnPlayers();
    this.draw.onRound();
    this.setPhase('intro', 2.6);
    this.hud.roundCard();
  }

  private spawnPlayers(): void {
    const old = this.players;
    this.players = [];
    const meSkin = SKINS.find((s) => s.id === save.skin) ?? SKINS[0];
    const n = 8 - Math.min(3, this.peers.length);
    const W = this.world.W;
    const sx = this.world.spawnX;
    for (let i = 0; i < n; i++) {
      const self = i === 0;
      const prev = old[i];
      let skin = meSkin;
      let name = t('dz.you', 'Você');
      if (!self) {
        const pool = SKINS.filter((s) => s.id !== 'custom');
        skin = prev && !prev.self ? prev.skin : pool[Math.floor(Math.random() * pool.length)];
        name = prev && !prev.self ? prev.name : BOT_NAMES[(i * 3 + Math.floor(Math.random() * 5)) % BOT_NAMES.length];
      }
      const x = Math.max(40, Math.min(W - 40, sx + (i - n / 2) * 34 + (Math.random() - 0.5) * 20));
      const p: Player = {
        id: self ? 'me' : 'bot' + i,
        name,
        self,
        bot: self ? null : { gx: x, gy: 0, think: Math.random() * 0.5, skill: prev?.bot?.skill ?? 0.35 + Math.random() * 0.6, hop: 0, lazy: Math.random() },
        x,
        y: -260 - Math.random() * 120,
        vx: 0,
        vy: 0,
        onGround: false,
        stand: -1,
        face: 1,
        jumps: 0,
        maxJumps: 1,
        climbing: false,
        jumpHeld: false,
        coyote: 0,
        sq: 0,
        runT: 0,
        alive: true,
        safe: false,
        ghost: false,
        gx: 0,
        gy: 0,
        ghostT: 0,
        outOrder: 0,
        sprite: prev && prev.skin === skin ? prev.sprite : null,
        skin,
        color: skin.light,
        input: self ? this.keys : { l: false, r: false, j: false, u: false },
      };
      this.players.push(p);
    }
    this.me = this.players[0];
    this.cam.x = this.me.x;
    this.cam.y = -200;
  }

  setPhase(p: Phase, dur: number): void {
    this.phase = p;
    this.phaseT = 0;
    this.phaseDur = dur;
    this.hud.onPhase();
  }

  get finale(): boolean {
    return this.sc.disasters[0] === 'meteoro';
  }

  private disasterDur(): number {
    const base = this.sc.disasters.length > 1 ? 30 : 46;
    return base + this.sc.difficulty * 2;
  }

  private nextPhase(): void {
    switch (this.phase) {
      case 'intro':
        this.setPhase('prepare', this.finale ? 26 + this.sc.difficulty * 2 : 15);
        break;
      case 'prepare':
        if (this.finale) {
          this.startMeteor();
          this.setPhase('impact', 5.5);
        } else {
          this.setPhase('warn', 2.6);
          this.hud.disasterCard(this.sc.disasters[0]);
          audio.hit();
          tap('heavy');
        }
        break;
      case 'warn':
        this.beginDisaster(this.sc.disasters[this.dIndex]);
        this.setPhase('disaster', this.disasterDur());
        break;
      case 'disaster':
        if (this.dIndex + 1 < this.sc.disasters.length) {
          this.dIndex++;
          this.setPhase('warn', 2.6);
          this.hud.disasterCard(this.sc.disasters[this.dIndex]);
          audio.hit();
        } else this.endRound();
        break;
      case 'impact':
        this.endRound();
        break;
      case 'end':
        this.progress.next = (this.progress.next % 100) + 1;
        saveProgress(this.progress);
        this.startRound();
        break;
    }
  }

  private beginDisaster(d: DisasterId): void {
    this.active.add(d);
    const df = this.sc.difficulty;
    const fl = (f: Partial<Fluid> & { kind: Fluid['kind'] }): Fluid => ({ level: 0, target: 100, rate: 3, front: -300, dir: 0, speed: 0, crest: 0, push: 0, ...f });
    switch (d) {
      case 'tsunami':
        this.fluid = fl({ kind: 'water', target: 96 + df * 22, rate: 60, front: -260, dir: 1, speed: 250, crest: 90, push: 520 });
        break;
      case 'avalanche':
        this.fluid = fl({ kind: 'snow', target: 84 + df * 20, rate: 50, front: this.world.W + 260, dir: -1, speed: 190, crest: 70, push: -420 });
        break;
      case 'enchente':
        this.fluid = fl({ kind: 'water', target: 110 + df * 22, rate: (110 + df * 22) / 34 });
        break;
      case 'acido':
        this.fluid = fl({ kind: 'goo', target: 130 + df * 22, rate: (130 + df * 22) / 40 });
        break;
      case 'vulcao':
        this.fluid = fl({ kind: 'lava', target: 70 + df * 20, rate: (70 + df * 20) / 36 });
        this.strikeTimer = 2;
        break;
      case 'tornado':
        this.tornado.on = true;
        this.tornado.x = this.rng() < 0.5 ? -120 : this.world.W + 120;
        this.tornado.vx = (this.tornado.x < 0 ? 1 : -1) * (80 + df * 14);
        this.tornado.r = 58 + df * 3;
        break;
      case 'terremoto':
        this.quake = 0.01;
        this.strikeTimer = 3;
        break;
      case 'meteoros':
      case 'raios':
        this.strikeTimer = 1.5;
        break;
      default:
        break;
    }
  }

  private startMeteor(): void {
    this.meteor.t = 0;
    this.meteor.x = this.world.W * 0.42;
    if (this.world.bunker) this.world.bunker.closed = 0.001;
    this.hud.disasterCard('meteoro');
  }

  private endRound(): void {
    const me = this.me;
    const survived = me.alive;
    const alive = this.players.filter((p) => p.alive).length;
    this.sessionRounds++;
    this.progress.survived += survived ? 1 : 0;
    let place = 1;
    if (!survived) place = alive + 1 + (this.outCount - me.outOrder);
    if (survived) {
      this.streak++;
      this.sessionSurvived++;
      this.progress.best = Math.max(this.progress.best, this.streak);
      const coins = 20 + this.sc.difficulty * 6 + Math.min(10, this.streak - 1) * 5 + (this.finale ? 40 : 0);
      this.roundCoins = coins;
      this.sessionCoins += coins;
      addCoins(coins);
      audio.cash();
      success();
    } else {
      this.streak = 0;
      this.roundCoins = 3;
      this.sessionCoins += 3;
      addCoins(3);
    }
    saveProgress(this.progress);
    reportRun({
      game: 'disaster',
      score: this.sessionSurvived,
      coins: this.roundCoins,
      durationSec: Math.round(this.roundT),
      won: survived,
      place,
      stats: { scenario: this.sc.n, streak: this.streak, difficulty: this.sc.difficulty },
    });
    this.setPhase('end', 4.2);
    this.hud.resultCard(survived, this.roundCoins, alive);
  }

  /* ------------------------------ laço ------------------------------ */

  private loop = (now: number): void => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (this.paused) {
      this.last = now;
      return;
    }
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.05) dt = 0.05;
    if (this.q.fpsCap === 30 && dt < 1 / 40) return;
    const t0 = performance.now();
    this.update(dt);
    this.draw.frame();
    this.gov.sample(dt * 1000, performance.now() - t0);
  };

  private update(rdt: number): void {
    this.time += rdt;
    this.phaseT += rdt;
    // câmera lenta nos últimos instantes
    const slow = this.phase === 'disaster' && this.phaseDur - this.phaseT < 1.4 && this.dIndex === this.sc.disasters.length - 1;
    this.timeScale += ((slow ? 0.35 : 1) - this.timeScale) * Math.min(1, rdt * 6);
    const dt = rdt * this.timeScale * (this.sc.mod === 'rapido' && this.phase === 'disaster' ? 1.2 : 1);
    if (this.phase !== 'end' && this.phase !== 'intro') this.roundT += rdt;
    if (this.phaseT >= this.phaseDur) this.nextPhase();

    this.updateDisasters(dt);
    this.world.step(dt, this.fluid ? this.fluidAt : null, this.fluid?.dir ? this.fluid.push : 0, this.fluid?.front ?? 0);

    // entrada do jogador
    const mi = this.me.input;
    mi.l = this.keys.l || this.touch.l;
    mi.r = this.keys.r || this.touch.r;
    mi.j = this.keys.j || this.touch.j;
    mi.u = this.keys.u || this.touch.j;

    for (const p of this.players) {
      if (p.bot && p.alive) this.think(p, dt);
      if (p.ghost) this.ghostStep(p, dt);
      else if (p.alive) {
        this.movePlayer(p, dt);
        this.checkHazards(p);
      }
    }
    if (this.phase === 'disaster' || this.phase === 'impact') {
      const alive = this.players.some((p) => p.alive && !p.self) || this.me.alive;
      if (!alive && this.phaseDur - this.phaseT > 2.5) this.phaseT = this.phaseDur - 2.5;
    }
    this.updateCamera(rdt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - rdt * 2.2);
    this.draw.particles.step(dt);
    this.hud.tick();

    // online ~5 Hz
    this.sendT -= rdt;
    if (this.presence && this.sendT <= 0) {
      this.sendT = 0.2;
      const m = this.me;
      this.presence.send({ x: Math.round(m.ghost ? m.gx : m.x), y: Math.round(m.ghost ? m.gy : m.y), g: m.ghost ? 1 : 0, f: m.face });
    }
  }

  /* ------------------------------ desastres ------------------------------ */

  surfaceAt(x: number): number {
    const f = this.fluid;
    if (!f) return 9999;
    if (f.dir !== 0) {
      const d = (x - f.front) * f.dir; // >0: ainda não chegou
      if (d > 40) return 9999;
      const bump = d > -160 ? f.crest * Math.max(0, 1 - Math.abs(d + 50) / 110) : 0;
      const ramp = Math.min(1, (-d + 40) / 180);
      return GROUND_Y - f.level * ramp - bump - Math.sin(x * 0.035 + this.time * 2.4) * 4;
    }
    return GROUND_Y - f.level - Math.sin(x * 0.03 + this.time * 2) * 3 - Math.sin(x * 0.011 - this.time * 1.3) * 3;
  }

  private updateDisasters(dt: number): void {
    const w = this.world;
    const inDisaster = this.phase === 'disaster' || this.phase === 'warn' || this.phase === 'end';
    const f = this.fluid;
    if (f) {
      if (f.dir !== 0) {
        f.front += f.speed * f.dir * dt;
        if (f.level < f.target) f.level = Math.min(f.target, f.level + f.rate * dt);
        // depois que a onda atravessa, a crista some devagar
        if ((f.dir > 0 && f.front > w.W + 200) || (f.dir < 0 && f.front < -200)) f.crest = Math.max(0, f.crest - dt * 30);
      } else if (this.phase === 'disaster') f.level = Math.min(f.target, f.level + f.rate * dt);
    }
    if (this.phase === 'disaster') {
      const df = this.sc.difficulty;
      if (this.quake > 0) {
        this.quake = Math.min(1, this.quake + dt * 0.25);
        if (this.q.shake) this.shake = Math.max(this.shake, 0.35 + this.quake * 0.4);
        // sacode corpos aleatórios
        if (this.rng() < dt * (4 + df * 1.5) * this.quake) {
          const b = w.bodies[Math.floor(this.rng() * w.bodies.length)];
          if (b && b.alive) {
            w.push(b, (this.rng() - 0.5) * 260, -60 - this.rng() * 80);
            audio.crack();
          }
        }
      }
      this.strikeTimer -= dt;
      if (this.strikeTimer <= 0) {
        if (this.active.has('meteoros')) {
          this.spawnStrike('meteor', 1.6, 44);
          this.strikeTimer = Math.max(0.45, 1.15 - df * 0.12) * (0.7 + this.rng() * 0.6);
        } else if (this.active.has('raios')) {
          this.spawnStrike('bolt', 1.4, 20);
          this.strikeTimer = Math.max(0.4, 0.95 - df * 0.09) * (0.7 + this.rng() * 0.6);
        } else if (this.active.has('vulcao')) {
          this.spawnStrike('bomb', 1.7, 36);
          this.strikeTimer = Math.max(0.5, 1.4 - df * 0.14) * (0.7 + this.rng() * 0.6);
        } else if (this.active.has('terremoto')) {
          this.spawnStrike('rock', 1.3, 22);
          this.strikeTimer = Math.max(0.6, 1.6 - df * 0.15) * (0.7 + this.rng() * 0.6);
        } else this.strikeTimer = 99;
      }
      const tn = this.tornado;
      if (tn.on) {
        tn.x += tn.vx * dt;
        if ((tn.vx > 0 && tn.x > w.W + 140) || (tn.vx < 0 && tn.x < -140)) tn.vx = -tn.vx;
        if (this.q.shake) this.shake = Math.max(this.shake, 0.12);
        for (const b of w.bodies) {
          if (!b.alive) continue;
          const cx = b.x + b.w * 0.5;
          const d = cx - tn.x;
          if (Math.abs(d) < tn.r + b.w * 0.5) {
            if (!b.awake && b.kind !== 'crate' && this.rng() > dt * 3) continue;
            w.wake(b);
            b.vy -= (b.heavy ? 1700 : 2600) * dt;
            b.vx += (-d * 4 + tn.vx * 2) * dt + (b.y < -320 ? Math.sign(d || 1) * 900 * dt : 0);
            b.va += 3 * dt;
            if (b.vy < -380) b.vy = -380;
          }
        }
      }
    } else if (!inDisaster) this.quake = 0;
    if (this.phase !== 'disaster') {
      this.quake = Math.max(0, this.quake - dt * 0.6);
    }
    // golpes
    for (const s of this.strikes) {
      if (!s.on) continue;
      if (s.flash > 0) {
        s.flash -= dt;
        if (s.flash <= 0) s.on = false;
        continue;
      }
      s.t -= dt;
      if (s.t <= 0) this.impactStrike(s);
    }
    // meteoro gigante
    const m = this.meteor;
    if (m.t >= 0) {
      m.t += dt;
      if (w.bunker) w.bunker.closed = Math.min(1, w.bunker.closed + dt * 2);
      if (m.t < 1.7) {
        if (this.q.shake) this.shake = Math.max(this.shake, m.t * 0.4);
      } else if (m.ring < 0) {
        m.ring = 0;
        m.flash = 1;
        this.shake = 1.4;
        audio.hit();
        tap('heavy');
        this.draw.particles.burst(m.x, GROUND_Y - 20, 60, 'fire', 600);
      }
      if (m.ring >= 0) {
        const prev = m.ring;
        m.ring += dt * 900;
        m.flash = Math.max(0, m.flash - dt * 0.7);
        for (const b of w.bodies) {
          if (!b.alive) continue;
          const d = Math.abs(b.x + b.w * 0.5 - m.x);
          if (d >= prev && d < m.ring) w.push(b, Math.sign(b.x - m.x || 1) * (500 + this.rng() * 300), -500 - this.rng() * 400);
        }
        for (const p of this.players) {
          if (!p.alive || p.safe) continue;
          const d = Math.abs(p.x - m.x);
          if (d < m.ring) this.knockOut(p, Math.sign(p.x - m.x || 1));
        }
        if (this.q.shake) this.shake = Math.max(this.shake, 0.6 * m.flash + 0.2);
      }
    }
  }

  private spawnStrike(kind: Strike['kind'], T: number, r: number): void {
    const s = this.strikes.find((x) => !x.on);
    if (!s) return;
    const w = this.world;
    let x: number;
    const alive = this.players.filter((p) => p.alive);
    if (alive.length && this.rng() < 0.55) {
      const p = alive[Math.floor(this.rng() * alive.length)];
      x = p.x + (this.rng() - 0.5) * 90;
    } else x = 40 + this.rng() * (w.W - 80);
    x = Math.max(20, Math.min(w.W - 20, x));
    s.on = true;
    s.kind = kind;
    s.x = x;
    s.ty = w.topAt(x);
    s.T = s.t = T;
    s.r = r;
    s.flash = 0;
    if (kind === 'bomb') {
      s.sx = w.W * 0.86;
      s.sy = -620;
    } else {
      s.sx = x - 260;
      s.sy = s.ty - 700;
    }
  }

  private impactStrike(s: Strike): void {
    const w = this.world;
    s.ty = w.topAt(s.x);
    s.flash = s.kind === 'bolt' ? 0.22 : 0.3;
    for (const b of w.bodies) {
      if (!b.alive) continue;
      const dx = b.x + b.w * 0.5 - s.x;
      if (Math.abs(dx) < s.r + b.w * 0.5 + 10 && b.y < s.ty + 60) w.push(b, Math.sign(dx || 1) * 180, -260);
    }
    for (const p of this.players) {
      if (!p.alive) continue;
      const dx = Math.abs(p.x - s.x);
      if (s.kind === 'bolt') {
        if (dx < s.r && p.y <= s.ty + 4) this.knockOut(p, 0);
      } else if (dx < s.r && Math.abs(p.y - s.ty) < s.r + 10) this.knockOut(p, Math.sign(p.x - s.x));
    }
    const pk = s.kind === 'meteor' || s.kind === 'bomb' ? 'fire' : s.kind === 'bolt' ? 'spark' : 'dust';
    this.draw.particles.burst(s.x, s.ty - 6, s.kind === 'rock' ? 10 : 18, pk, 300);
    if (s.kind !== 'rock' && this.q.shake) this.shake = Math.max(this.shake, 0.4);
    if (Math.abs(s.x - this.me.x) < 400) {
      audio.crack();
      if (s.kind !== 'rock') tap('medium');
    }
  }

  /* ------------------------------ jogadores ------------------------------ */

  private movePlayer(p: Player, dt: number): void {
    const w = this.world;
    const inp = p.input;
    const frozen = this.phase === 'intro' && this.phaseT < 0.6;
    const dir = frozen ? 0 : (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
    const acc = p.onGround ? 2000 : 1200;
    if (dir) {
      p.vx += dir * acc * dt;
      if (p.vx > RUN) p.vx = RUN;
      if (p.vx < -RUN) p.vx = -RUN;
      p.face = dir;
    } else {
      const fr = p.onGround ? 14 : 3;
      p.vx -= p.vx * Math.min(1, fr * dt);
    }
    if (this.wind && this.phase === 'disaster') p.vx += this.wind * dt * (p.onGround ? 0.6 : 1.4);
    if (this.tornado.on) {
      const d = this.tornado.x - p.x;
      if (Math.abs(d) < 240) p.vx += Math.sign(d) * 160 * dt;
    }
    if (this.quake > 0 && p.onGround) p.vx += (this.rng() - 0.5) * 900 * this.quake * dt;

    // escada
    let onLadder = false;
    for (const l of w.ladders) {
      let lx = l.x;
      let top = l.top;
      if (l.body >= 0) {
        const b = w.bodies[l.body];
        if (!b.alive || b.awake || b.tip || b.h < b.w) continue;
        lx = b.x;
        top = b.y;
      }
      if (p.x > lx - 8 && p.x < lx + 24 && p.y > top + 2 && p.y <= l.bottom + 1) {
        onLadder = true;
        break;
      }
    }
    if (onLadder && inp.u && !frozen) {
      p.climbing = true;
      p.vy = -170;
    } else if (p.climbing && !onLadder) {
      p.climbing = false;
      if (inp.u) p.vy = -360; // pulinho no topo
    } else if (p.climbing && !inp.u) p.climbing = false;

    // pulo (com buffer de coyote)
    if (p.onGround) {
      p.coyote = 0.09;
      p.jumps = 0;
    } else p.coyote -= dt;
    const pressed = inp.j && !p.jumpHeld;
    p.jumpHeld = inp.j;
    if (pressed && !p.climbing && !frozen) {
      if (p.coyote > 0) {
        p.vy = -JUMP;
        p.coyote = 0;
        p.jumps = 1;
        p.sq = -0.35;
        if (p.self) audio.jump();
      } else if (p.jumps < p.maxJumps + 0 && p.maxJumps > 1) {
        p.vy = -JUMP * 0.9;
        p.jumps++;
        p.sq = -0.3;
        this.draw.particles.burst(p.x, p.y, 6, 'puff', 80);
        if (p.self) audio.jump(2);
      }
    }
    if (!p.climbing) p.vy += GRAV * dt * (p.vy < 0 && !inp.j ? 1.7 : 1);
    if (p.vy > 900) p.vy = 900;

    // carregado pelo corpo onde está em pé
    if (p.stand >= 0) {
      const b = w.bodies[p.stand];
      if (b && b.alive && b.awake) {
        p.x += b.vx * dt;
      }
    }
    const prevY = p.y;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const wasGround = p.onGround;
    p.onGround = false;
    p.stand = -1;

    // sólidos
    for (const s of w.solids) {
      if (p.x + 9 <= s.x || p.x - 9 >= s.x + s.w) continue;
      if (s.oneWay) {
        if (p.vy >= 0 && prevY <= s.y + 1 && p.y >= s.y) {
          p.y = s.y;
          this.landP(p, wasGround);
        }
        continue;
      }
      const top = p.y - 24;
      if (p.y <= s.y || top >= s.y + s.h) continue;
      if (prevY <= s.y + 1) {
        p.y = s.y;
        this.landP(p, wasGround);
      } else if (prevY - 24 >= s.y + s.h - 1) {
        p.y = s.y + s.h + 24;
        if (p.vy < 0) p.vy = 0;
      } else {
        // lateral
        p.x = p.x < s.x + s.w * 0.5 ? s.x - 9 : s.x + s.w + 9;
        p.vx = 0;
      }
    }
    // topos dos corpos
    for (let i = 0; i < w.bodies.length; i++) {
      const b = w.bodies[i];
      if (!b.alive || b.tip || b.kind === 'ladder') continue;
      if (p.x + 8 <= b.x || p.x - 8 >= b.x + b.w) continue;
      const by = b.y;
      const bPrev = by - b.vy * dt;
      if (p.vy >= b.vy - 1 && prevY <= bPrev + 2 && p.y >= by) {
        p.y = by;
        p.stand = i;
        if (b.vy > 0) p.vy = b.vy;
        this.landP(p, wasGround);
      }
    }
    if (p.climbing) {
      p.onGround = false;
    }
    if (p.x < 10) {
      p.x = 10;
      p.vx = 0;
    } else if (p.x > w.W - 10) {
      p.x = w.W - 10;
      p.vx = 0;
    }
    if (p.y > 300) p.y = 300;
    // animação
    p.sq += (0 - p.sq) * Math.min(1, dt * 10);
    if (!p.onGround) p.sq = Math.max(p.sq, -0.25) + (p.vy < 0 ? -0.01 : 0.004);
    if (p.onGround && Math.abs(p.vx) > 20) p.runT += dt * Math.abs(p.vx) * 0.06;
    // power-up
    for (const k of w.pickups) {
      if (!k.taken && Math.abs(p.x - k.x) < 18 && Math.abs(p.y - 12 - k.y) < 26) {
        k.taken = true;
        p.maxJumps = 2;
        this.draw.particles.burst(k.x, k.y, 14, 'spark', 160);
        if (p.self) {
          audio.coin(3);
          this.hud.toast(t('dz.double', 'Pulo duplo!'));
        }
      }
    }
    // bunker
    const bk = w.bunker;
    if (bk) {
      const inside = p.x > bk.doorX + 4 && p.x < bk.x + bk.w - 6 && p.y > -96;
      if (!bk.closed || bk.closed < 0.2) p.safe = inside;
      if (p.safe && bk.closed > 0) {
        if (p.x < bk.doorX + 16) p.x = bk.doorX + 16;
      } else if (bk.closed > 0.2 && p.x > bk.doorX - 10 && p.x < bk.doorX + 16 && p.y > -96) {
        p.x = bk.doorX - 10;
        p.vx = Math.min(0, p.vx);
      }
    }
  }

  private landP(p: Player, wasGround: boolean): void {
    if (!wasGround && p.vy > 260) {
      p.sq = Math.min(0.45, p.vy / 1400);
      if (p.self) audio.land();
      if (p.vy > 500) this.draw.particles.burst(p.x, p.y, 4, 'puff', 60);
    }
    if (p.vy > 0) p.vy = 0;
    p.onGround = true;
    p.climbing = false;
  }

  private checkHazards(p: Player): void {
    if (!p.alive || p.safe) return;
    if (this.phase === 'end') return;
    const w = this.world;
    if (this.fluid) {
      const s = this.surfaceAt(p.x);
      if (p.y > s + 3) {
        this.knockOut(p, this.fluid.dir);
        return;
      }
    }
    // algo caindo em cima
    for (const b of w.bodies) {
      if (!b.alive || !b.awake || b.vy < 170) continue;
      if (p.x + 7 < b.x || p.x - 7 > b.x + b.w) continue;
      const top = p.y - 22;
      if (b.y + b.h > top && b.y + b.h < p.y - 4) {
        this.knockOut(p, 0);
        return;
      }
    }
    // tornado
    const tn = this.tornado;
    if (tn.on && Math.abs(p.x - tn.x) < tn.r * 0.75 && !w.isSheltered(p.x, p.y)) this.knockOut(p, Math.sign(tn.vx));
  }

  knockOut(p: Player, dir: number): void {
    if (!p.alive) return;
    p.alive = false;
    p.ghost = true;
    p.gx = p.x;
    p.gy = p.y - 14;
    p.ghostT = 0;
    p.vx = dir * 60;
    p.vy = -80;
    this.outCount++;
    p.outOrder = this.outCount;
    this.draw.particles.burst(p.x, p.y - 12, 16, 'puff', 140);
    if (p.self) {
      audio.hit();
      tap('heavy');
      this.hud.toast(t('dz.ghost', 'Você virou fantasminha! Assista e voe por aí.'));
    }
  }

  private ghostStep(p: Player, dt: number): void {
    p.ghostT += dt;
    if (p.self && p.ghostT > 0.8) {
      const i = p.input;
      p.vx += ((i.r ? 1 : 0) - (i.l ? 1 : 0)) * 600 * dt;
      p.vy += (i.j ? -500 : 60) * dt;
    } else if (p.ghostT < 0.8) p.vy -= 60 * dt;
    else p.vy += Math.sin(this.time * 2 + p.outOrder) * 40 * dt;
    p.vx *= 1 - Math.min(1, dt * 1.5);
    p.vy *= 1 - Math.min(1, dt * 1.5);
    p.gx += p.vx * dt;
    p.gy += p.vy * dt;
    if (p.gy < -620) p.gy = -620;
    if (p.gy > 60) p.gy = 60;
    if (p.gx < 0) p.gx = 0;
    if (p.gx > this.world.W) p.gx = this.world.W;
    if (p.vx > 4) p.face = 1;
    else if (p.vx < -4) p.face = -1;
  }

  /* ------------------------------ bots ------------------------------ */

  private think(p: Player, dt: number): void {
    const b = p.bot!;
    const w = this.world;
    const inp = p.input;
    b.think -= dt;
    if (this.phase === 'intro') {
      inp.l = inp.r = inp.j = inp.u = false;
      return;
    }
    const known = this.phase === 'disaster' || this.phase === 'warn' ? this.sc.disasters[this.dIndex] : null;
    if (b.think <= 0) {
      b.think = 0.35 + (1 - b.skill) * 0.5 + this.rng() * 0.2;
      this.plan(p, known);
    }
    // fugir de marcadores
    let flee = 0;
    for (const s of this.strikes) {
      if (!s.on || s.flash > 0) continue;
      const d = p.x - s.x;
      if (Math.abs(d) < s.r + 26 && this.rng() < b.skill + 0.25) flee = d >= 0 ? 1 : -1;
    }
    let tx = b.gx;
    if (flee) tx = p.x + flee * 80;
    if (this.tornado.on && !known) tx = b.gx;
    const dx = tx - p.x;
    inp.l = dx < -6;
    inp.r = dx > 6;
    // subir
    const wantUp = b.gy < p.y - 14;
    inp.u = wantUp && p.climbing;
    let jump = false;
    if (wantUp) {
      // escada próxima?
      for (const l of w.ladders) {
        const lb = l.body >= 0 ? w.bodies[l.body] : null;
        const lx = lb ? lb.x : l.x;
        if (lb && (lb.awake || lb.tip || !lb.alive)) continue;
        if (Math.abs(p.x - (lx + 8)) < 14 && p.y > (lb ? lb.y : l.top)) {
          inp.u = true;
          inp.l = inp.r = false;
        }
      }
      if (!inp.u && p.onGround && Math.abs(dx) < 50) jump = true;
    }
    // obstáculo/buraco à frente (percurso)
    if (this.finale && p.onGround) {
      for (const pit of w.pits) {
        if (p.x > pit.x - 46 && p.x < pit.x - 18 && dx > 0 && this.rng() < 0.5 + b.skill * 0.5) jump = true;
      }
      for (const bd of w.bodies) {
        if (bd.alive && bd.y < p.y - 4 && bd.y > p.y - 70 && bd.x - p.x > 0 && bd.x - p.x < 36 && dx > 0) jump = true;
      }
    }
    b.hop -= dt;
    if (jump && b.hop <= 0) {
      inp.j = true;
      b.hop = 0.25 + (1 - b.skill) * 0.3;
    } else if (b.hop < 0.12) inp.j = false;
    if (this.finale && p.climbing) inp.u = true;
  }

  private plan(p: Player, known: DisasterId | null): void {
    const b = p.bot!;
    const w = this.world;
    if (this.finale) {
      const bk = w.bunker!;
      b.gx = bk.x + 60 + (p.outOrder % 3) * 30 + b.lazy * 80;
      // bots lentos ficam para trás às vezes
      if (b.skill < 0.5 && this.rng() < 0.15) b.gx = p.x;
      b.gy = p.y;
      return;
    }
    if (known === 'tornado' && this.rng() < 0.3 + b.skill * 0.7) {
      let best = -1;
      let bd = 1e9;
      for (let i = 0; i < w.houses.length; i++) {
        const h = w.houses[i];
        const d = Math.abs(h.x + h.w / 2 - p.x);
        if (d < bd && w.isSheltered(h.x + h.w / 2, -2)) {
          bd = d;
          best = i;
        }
      }
      if (best >= 0) {
        const h = w.houses[best];
        b.gx = h.x + h.w * (0.3 + b.lazy * 0.4);
        b.gy = 0;
        // descer do telhado: anda pra fora e cai
        if (p.y < -20 && Math.abs(p.x - b.gx) < 50) b.gx = h.x - 30;
        return;
      }
    }
    if (known === 'terremoto' || known === 'meteoros' || known === 'raios') {
      // espaço aberto, longe dos outros
      if (Math.abs(b.gx - p.x) < 10 || this.rng() < 0.2) b.gx = 40 + this.rng() * (w.W - 80);
      b.gy = p.y;
      return;
    }
    // ir para o alto: melhor superfície alcançável a partir daqui
    const reach = 108;
    let bestX = p.x;
    let bestY = p.y;
    let bestS = -1e9;
    const consider = (x0: number, x1: number, top: number) => {
      if (top < p.y - reach || top > p.y + 400) return;
      const cx = Math.max(x0 + 10, Math.min(x1 - 10, p.x));
      const s = -top * (0.6 + b.skill) - Math.abs(cx - p.x) * 0.35 + this.rng() * 40 * (1.3 - b.skill);
      if (s > bestS) {
        bestS = s;
        bestX = cx;
        bestY = top;
      }
    };
    for (const s of w.solids) if (s.oneWay) consider(s.x, s.x + s.w, s.y);
    for (const bd of w.bodies) if (bd.alive && !bd.awake && !bd.tip && bd.kind !== 'ladder') consider(bd.x, bd.x + bd.w, bd.y);
    for (const l of w.ladders) {
      const lb = l.body >= 0 ? w.bodies[l.body] : null;
      if (lb && (lb.awake || lb.tip || !lb.alive)) continue;
      const top = lb ? lb.y : l.top;
      if (p.y > top + 20 && p.y >= (lb ? lb.y + lb.h : l.bottom) - 30) {
        const s = -top * (0.6 + b.skill) - Math.abs(l.x - p.x) * 0.35 + 20;
        if (s > bestS) {
          bestS = s;
          bestX = (lb ? lb.x : l.x) + 8;
          bestY = top;
        }
      }
    }
    // bots "preguiçosos" às vezes ficam no chão
    if (b.lazy > 0.85 && this.phase === 'prepare') {
      bestX = p.x + (this.rng() - 0.5) * 60;
      bestY = p.y;
    }
    b.gx = bestX;
    b.gy = bestY;
  }

  /* ------------------------------ câmera ------------------------------ */

  private updateCamera(dt: number): void {
    const m = this.me;
    const c = this.cam;
    const fx = m.ghost ? m.gx : m.x;
    const fy = m.ghost ? m.gy : m.y;
    let tx = fx + m.vx * 0.25;
    let ty = fy - c.vh * 0.12;
    if (this.phase === 'impact' && this.meteor.t >= 0 && this.meteor.t < 1.8 && !m.safe) {
      tx = (tx + this.meteor.x) * 0.5;
    }
    const k = Math.min(1, dt * 5);
    c.x += (tx - c.x) * k;
    c.y += (ty - c.y) * k;
    const half = c.vw / 2;
    const W = this.world.W;
    if (W > c.vw) c.x = Math.max(half - 60, Math.min(W - half + 60, c.x));
    else c.x = W / 2;
    // chão perto da parte de baixo da tela
    const maxY = GROUND_Y + 150 - c.vh / 2;
    if (c.y > maxY) c.y = maxY;
    if (c.y < -700 + c.vh / 2) c.y = -700 + c.vh / 2;
  }

  /* ------------------------------ sprites ------------------------------ */

  private pose: PlayerPose = { t: 0, blink: 0, lookX: 0.35, lookY: 0, sx: 1, sy: 1, mood: 'idle', lx: -0.5, ly: -0.7, still: true };
  spriteFor(p: Player): HTMLCanvasElement {
    if (p.sprite) return p.sprite;
    const ps = this.cam.ps;
    const rr = R * ps;
    const size = Math.ceil(rr * 3.2);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d')!;
    x.translate(size / 2, size / 2);
    try {
      drawPlayer(x, p.skin, rr, this.pose);
    } catch {
      x.fillStyle = p.color;
      x.beginPath();
      x.arc(0, 0, rr, 0, Math.PI * 2);
      x.fill();
    }
    p.sprite = c;
    return c;
  }

  /* ------------------------------ handle ------------------------------ */

  pause(): void {
    this.paused = true;
  }
  resume(): void {
    this.paused = false;
    this.last = performance.now();
  }

  /** botão "sair" → resumo da sessão */
  requestExit(): void {
    this.paused = true;
    this.hud.summary();
  }

  finish(): void {
    this.destroy();
    this.exitCb();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    for (const f of this.offs) f();
    this.hud.destroy();
    try {
      this.presence?.leave();
    } catch {
      /* */
    }
    this.canvas.remove();
    this.root.classList.remove('dz-root');
  }

  /** usado pelo HUD */
  scenarioTitle(): string {
    return `#${this.sc.n} · ${scenarioName(this.sc)}`;
  }
  disasterName(d: DisasterId): string {
    return DISASTERS[d].name();
  }
  bodyFalling(b: Body): boolean {
    return b.awake && b.vy > 120;
  }
}
