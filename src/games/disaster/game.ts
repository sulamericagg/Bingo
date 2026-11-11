/* ============================================================
 *  SOBREVIVA AOS DESASTRES — laço principal, fases da rodada,
 *  jogadores (você + bots + visitantes online), desastres e HUD.
 *  Desenho em draw.ts; mundo/física em world.ts.
 * ============================================================ */
import { isSolo } from '../../ui/touch';
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
import { DISASTERS, mulberry, type DisasterId, type Scenario } from './scenarios';
import { buildScenario, drawNext, entries, entryByKey, HAZARDS, loadPedia, markSeen, partyPick, starsFor, type DzEntry, type Tune } from './catalog';
import { Extra2D } from './extra2d';
import { showRoulette } from './roulette';
import { GROUND_Y, World, type Body, type FluidField } from './world';
import { FluidSim } from './fluid';
import { Drawer } from './draw';
import { Hud } from './hud';
import { partyRoomFor, partyCode } from '../../party/contract';
import type { LiveBar } from '../../party/duel';
import { speak } from '../noites/speak';
import { FIT } from './scenarios';
import type { DzIcon } from './icons';
import { drawAvatar, type AvatarData } from '../../game/avatar';

import { intensityOf, isFluidD, loadMode, MODE_MUL, type DzMode } from './tuning';
export { intensityOf, isFluidD, loadMode, MODE_MUL, MODE_KEY, type DzMode } from './tuning';

/* ------------------------------ tipos ------------------------------ */

export interface Input {
  l: boolean;
  r: boolean;
  j: boolean;
  u: boolean;
  /** apertou pular desde o último passo (borda; consumida pela física) */
  tap?: boolean;
  /** joystick para cima: subir escada */
  climb?: boolean;
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
  /** buffer de pulo (s) */
  jbuf: number;
  /** pulo recém-iniciado conta como segurado (s) */
  jhold: number;
  /** recarga do "tum" de objeto leve caindo (s) */
  bonk: number;
  /** quanto tempo aguentou no desastre antes de cair (s) */
  outT?: number;
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
  /** fôlego nadando (0..1) */
  air: number;
  /** dentro d'água agora */
  swim: boolean;
  /** índice do sólido (plataforma/copa) onde está em pé (-1) */
  onSolid: number;
  /** já foi resgatado nesta rodada (só uma vez) */
  rescued: boolean;
  /** bolha de resgate: segundos restantes (0 = sem bolha) */
  bubble: number;
  bx: number;
  by: number;
  /** invencível depois do resgate (s) */
  shield: number;
  /** recarga de "pancada" de destroço lateral (s) */
  hit: number;
  /** tempo encostado no fogo (s) */
  burn: number;
  /** segundos parado (alvo preferido dos golpes) */
  idle: number;
  /** dev: o que eliminou */
  why?: string;
  /** medidor de calor/frio (0..1; 1 = eliminado) */
  meter: number;
}

export interface Strike {
  on: boolean;
  kind: 'bomb' | 'meteor' | 'bolt' | 'rock' | 'drop' | 'ball' | 'gust';
  /** bola de neve / destroço da rajada: velocidade horizontal depois do aviso */
  vx: number;
  /** já está andando (depois do aviso) */
  live: boolean;
  /** destroço leve (boiando): empurra/tira fôlego, não elimina */
  soft?: boolean;
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
  /** nível que fica no mapa todo (água das ondas anteriores) */
  base: number;
}

/** fogo no chão (meteoro/bomba) */
export interface Fire {
  on: boolean;
  x: number;
  r: number;
  y: number;
  t: number;
}
/** moeda no meio do desastre (risco × recompensa) */
export interface DCoin {
  on: boolean;
  x: number;
  y: number;
  t: number;
}
/** um tornado (até 2) */
export interface Twister {
  on: boolean;
  x: number;
  vx: number;
  r: number;
  /** alvo atual (índice de jogador) e quando trocar */
  tgt: number;
  tgtT: number;
}

export type Phase = 'intro' | 'prepare' | 'warn' | 'disaster' | 'impact' | 'end';

export const R = 13; // raio do Bloop em unidades do mundo
const GRAV = 1700;
const JUMP = 610;
const RUN = 205;
/** coyote time: ainda pula até 100 ms depois de sair da beirada */
const COYOTE = 0.1;
/** buffer: apertou até 120 ms antes de encostar no chão → pula ao encostar */
const JUMP_BUFFER = 0.12;
/** toque rápido conta como segurado por este tempo (altura mínima do pulo) */
const MIN_HOLD = 0.09;
const BOT_NAMES = ['Pipoca', 'Jujuba', 'Tico', 'Nina', 'Biscoito', 'Lulu', 'Zeca', 'Mimi', 'Tuca', 'Fofura', 'Dudu', 'Bolacha', 'Pingo', 'Teca'];
const MAX_STRIKES = 24;
/** maior subpasso de física (s) */
const STEP = 1 / 60;
/** maior intervalo simulado por quadro (s) — engasgos maiores viram câmera lenta */
const MAX_FRAME = 0.1;
/** máximo de subpassos por quadro */
const MAX_SUBSTEPS = 6;
const LS_KEY = 'bo-disaster';

interface Progress {
  next: number;
  best: number;
  survived: number;
  /** rodadas jogadas (as 3 primeiras são "Treino") */
  played: number;
}

function loadProgress(): Progress {
  try {
    const p = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    return { next: p.next | 0 || 1, best: p.best | 0, survived: p.survived | 0, played: p.played | 0 };
  } catch {
    return { next: 1, best: 0, survived: 0, played: 0 };
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
  /** grupo (docs/PARTY.md): mesmo cenário para todos e placar "quem sobreviveu mais rodadas" */
  private partyBar: LiveBar | null = null;
  private partySv = 0;
  private partyRounds = 0;
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
  tornado: Twister = { on: false, x: 0, vx: 0, r: 62, tgt: -1, tgtT: 0 };
  tornado2: Twister = { on: false, x: 0, vx: 0, r: 62, tgt: -1, tgtT: 0 };

  /* ---------- dificuldade (docs/DISASTER-DESIGN.md) ---------- */
  mode: DzMode = loadMode();
  /** intensidade desta rodada */
  I = 1;
  /** multiplicador dos tempos de aviso */
  tele = 1;
  /** 0→1 ao longo do desastre (acelera os golpes) */
  heat = 0;
  /** dev/banco: força a sequência usada na intensidade */
  benchStreak = -1;
  fires: Fire[] = [];
  coins: DCoin[] = [];
  private coinT = 0;
  /** moedas pegas no meio do desastre (valem inteiras só se sobreviver) */
  held = 0;
  rescues = 0;
  /** pontos da rodada / sessão */
  points = 0;
  sessionPoints = 0;
  /** ondas (tsunami/avalanche): total, atual, tempo até a próxima */
  wave = { n: 0, k: 0, next: 0, H: 0, recede: 0, warned: false };
  /** pulsos (enchente/gosma/lava/terremoto): alvo por estágio */
  stage = { k: 0, next: 0 };
  /** tremores do terremoto */
  pulse = { k: 0, t: 0, on: false };
  /** rajada (areia): direção, aviso e força */
  gust = { dir: 0, warn: 0, t: 0, next: 0, vis: 0 };
  /** segundo desastre do combo começa no meio do primeiro */
  comboAt = -1;
  /** aviso extra no meio do desastre (onda, tremor, rajada): ícone, contagem, de onde vem */
  alertT = 0;
  alertIcon: DzIcon = 'wave';
  alertFrom = 0;
  /** cinzas do vulcão / areia (0..1): escurece a tela */
  haze = 0;
  /** casas já destelhadas pelo tornado (índices) */
  ripped = new Set<number>();
  private ripCD: number[] = [];
  /** online: meu id aleatório (resgate) e de quem fui salvo */
  private rid = 1 + Math.floor(Math.random() * 1e6);
  private helpHb = 0;
  private helpHbT = 0;
  private helpSeen = new Set<number>();
  private reviveNear = 0;
  /** sprites dos amigos online (skin/avatar deles) */
  private peerSprites = new Map<string, { key: string; c: HTMLCanvasElement }>();
  meteor = { t: -1, x: 0, ring: -1, flash: 0 };
  wind = 0;
  night = false;
  shake = 0;
  outCount = 0;
  rng = mulberry(1);
  /** dev/screenshots: seu Bloop é controlado pela IA */
  autoMe = false;
  /** rodada de treino (3 primeiras): desastres mais lentos, mais tempo e seta para o lugar seguro */
  training = false;
  /** lugar seguro sugerido (seta verde no treino) */
  safe: { x: number; y: number } | null = null;
  private safeT = 0;
  /** a sequência desta rodada bateu o recorde */
  newBest = false;
  private nameOff = Math.floor(Math.random() * 14);

  /** desastre do catálogo desta rodada (Desastrepédia) */
  entry!: DzEntry;
  isNew = false;
  /** próximo cenário forçado (dev/banco/screenshots) */
  forced: Scenario | null = null;
  private rouletteClose: (() => void) | null = null;
  /** motores novos (extra2d.ts) */
  ex!: Extra2D;

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
  /** superfície simulada do fluido atual (colunas com equação de onda) */
  sim: FluidSim | null = null;
  /** fluido como a física dos corpos o enxerga (criado uma vez: nada alocado por quadro) */
  field: FluidField;
  private sprayAcc = 0;

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
    for (let i = 0; i < MAX_STRIKES; i++) this.strikes.push({ on: false, kind: 'bomb', vx: 0, live: false, x: 0, ty: 0, sx: 0, sy: 0, t: 0, T: 1, r: 40, flash: 0 });
    for (let i = 0; i < 12; i++) this.fires.push({ on: false, x: 0, r: 0, y: 0, t: 0 });
    for (let i = 0; i < 8; i++) this.coins.push({ on: false, x: 0, y: 0, t: 0 });
    const self = this;
    this.field = {
      surf: (x: number) => (self.sim ? self.sim.surf(x) : 9999),
      slope: (x: number) => (self.sim ? self.sim.slope(x) : 0),
      flow: (x: number) => (self.sim ? self.sim.flow(x) : 0),
      push: 0,
      buoy: 2.4,
      drag: 1.8,
      splash: (x: number, w: number, vy: number) => self.splash(x, w, vy),
    };
    this.draw = new Drawer(this);
    this.hud = new Hud(this);
    this.ex = new Extra2D(this);
    this.bindInput();
    this.resize();
    const ro = () => this.resize();
    window.addEventListener('resize', ro);
    this.offs.push(() => window.removeEventListener('resize', ro));
    if (opts.scenario) {
      const e = entries()[Math.max(1, Math.min(entries().length, opts.scenario)) - 1];
      this.forced = buildScenario(e, 1000 + e.n * 77, 2);
    }
    this.startRound();
    this.joinOnline();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
    this.beat = performance.now();
    const wd = window.setInterval(this.watchdog, 1000);
    this.offs.push(() => clearInterval(wd));
    if (/[?&]debug/.test(location.search)) (window as unknown as { __dz?: DisasterGame }).__dz = this;
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
    const scale = Math.max(h / 600, w / 820);
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
    const rel = () => this.releaseInput();
    const vis = () => {
      if (document.hidden) rel();
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', rel);
    document.addEventListener('visibilitychange', vis);
    this.offs.push(() => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('blur', rel);
      document.removeEventListener('visibilitychange', vis);
    });
  }

  private key(e: KeyboardEvent, down: boolean): void {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') this.keys.l = down;
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') this.keys.r = down;
    else if (k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W') {
      if (down && !e.repeat) this.jumpTap = true;
      this.keys.j = down;
      this.keys.u = down;
    } else return;
    e.preventDefault();
  }

  /** botões na tela (hud.ts) */
  touch = { l: false, r: false, j: false };
  /** pulo apertado desde o último passo (não se perde se o dedo soltar antes do quadro) */
  jumpTap = false;

  /** solta tudo (app foi para o fundo, janela perdeu o foco, toque cancelado) */
  releaseInput(): void {
    this.keys.l = this.keys.r = this.keys.j = this.keys.u = false;
    this.touch.l = this.touch.r = this.touch.j = false;
    this.jumpTap = false;
    for (const p of this.players) {
      p.jumpHeld = false;
      p.input.tap = false;
      p.input.climb = false;
    }
    this.hud?.releaseJump();
    this.hud?.joy.reset();
  }

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
      if (partyRoomFor('disaster')) {
        const D = await import('../../party/duel');
        if (this.destroyed) return;
        this.partyBar = new D.LiveBar(this.root, (v) => String(v), 'left');
      }
      s.onPeers((peers) => {
        this.peers = peers.filter((p) => !p.bot).slice(0, 4);
        this.syncPartyBar();
      });
      this.syncPartyBar();
    } catch {
      /* sem online: só bots */
    }
  }

  /** placar do grupo: rodadas sobrevividas de cada um (eu + quem está na sala do grupo) */
  private syncPartyBar(): void {
    const b = this.partyBar;
    if (!b) return;
    const rows = [{ id: 'me', name: '', v: this.partySv, rd: this.partyRounds, me: true }, ...this.peers.map((p) => ({ id: p.id, name: p.name, v: p.s.sv ?? 0, rd: p.s.rd ?? 0, me: false }))];
    const top = Math.max(1, ...rows.map((r) => r.v));
    b.set(rows.map((r) => ({ id: r.id, name: r.name, v: r.v, p: r.v / top, me: r.me })));
  }

  /* ------------------------------ rodada ------------------------------ */

  startRound(): void {
    const pr = partyRoomFor('disaster');
    // qual desastre: o catálogo tem 100+; cada um sai uma vez antes de repetir (catalog.ts drawNext).
    // Grupo: todos no mesmo (sequência da sala). Dev/banco: forced.
    let entry: DzEntry;
    let base: Scenario;
    const forcedNow = !!this.forced;
    if (this.forced) {
      base = this.forced;
      this.forced = null;
      entry = (base.key && entryByKey(base.key)) || entries()[0];
    } else {
      const code = pr ? parseInt(partyCode(pr, 4, '0123456789'), 10) : 0;
      entry = pr ? partyPick(code, this.sessionRounds) : drawNext();
      const rounds = loadPedia().rounds;
      base = buildScenario(entry, pr ? code * 97 + this.sessionRounds * 13 : (Math.random() * 1e6) | 0, starsFor(rounds, entry));
    }
    this.entry = entry;
    this.isNew = !loadPedia().seen[entry.key];
    // cópia: o combo dinâmico muda a lista de desastres desta rodada sem mexer no cenário salvo
    this.sc = { ...base, disasters: [...base.disasters] };
    if (!this.sc.tune) this.sc.tune = { rate: 1, size: 1, speed: 1, grav: 1, slip: 1, night: false, wind: false, rain: false, fog: false, mini: false, giant: false, turbo: false };
    this.training = this.progress.played < 3 || /[?&]train=1/.test(location.search);
    this.mode = loadMode();
    const streak = this.benchStreak >= 0 ? this.benchStreak : this.streak;
    this.I = intensityOf(this.mode, this.sc.difficulty, streak, this.training);
    this.tele = Math.max(0.75, Math.min(1.15, 1.25 - 0.25 * this.I));
    // desastre duplo dinâmico: com sequência alta, um 2º desastre (de outra família) entra no meio do 1º
    {
      const cr = mulberry(this.sc.seed * 3 + this.sessionRounds * 7 + streak);
      const d1 = this.sc.disasters[0];
      const chance = this.mode === 'facil' ? 0 : Math.min(0.6, 0.15 * (streak - 3) + (this.mode === 'dificil' ? 0.15 : 0));
      if (d1 !== 'meteoro' && this.sc.disasters.length === 1 && !this.training && cr() < chance) {
        const pool = (FIT[this.sc.map.id] || []).filter((d) => d !== d1 && isFluidD(d) !== isFluidD(d1) && !(isFluidD(d) && (d1 === 'calor' || d1 === 'nevasca' || d1 === 'incendio' || d1 === 'geiser')));
        if (pool.length) this.sc.disasters.push(pool[Math.floor(cr() * pool.length)]);
      }
    }
    this.safe = null;
    this.safeT = 0;
    this.world = new World(this.sc, this.maxBodies());
    this.rng = mulberry(this.sc.seed + this.sessionRounds * 13);
    const tn = this.sc.tune!;
    this.night = tn.night || this.sc.mod === 'noite' || this.sc.disasters.includes('raios');
    this.wind = tn.wind || this.sc.mod === 'vento' ? (this.rng() < 0.5 ? -1 : 1) * 90 : 0;
    this.fluid = null;
    this.sim = null;
    this.active.clear();
    this.dIndex = 0;
    this.quake = 0;
    this.tornado.on = false;
    this.tornado2.on = false;
    this.fires.forEach((f) => (f.on = false));
    this.coins.forEach((c) => (c.on = false));
    this.coinT = 2;
    this.held = 0;
    this.rescues = 0;
    this.points = 0;
    this.heat = 0;
    this.wave.n = 0;
    this.wave.k = 0;
    this.stage.k = 0;
    this.pulse.k = 0;
    this.pulse.on = false;
    this.gust.dir = 0;
    this.gust.warn = 0;
    this.gust.t = 0;
    this.gust.vis = 0;
    this.comboAt = -1;
    this.alertT = 0;
    this.haze = 0;
    this.ripped.clear();
    this.ripCD = [];
    this.reviveNear = 0;
    this.helpSeen.clear();
    this.timers = {};
    this.stageWarn = false;
    this.swimTold = false;
    this.soak = new Float32Array(0);
    this.meteor.t = -1;
    this.meteor.ring = -1;
    this.meteor.flash = 0;
    this.outCount = 0;
    this.tornadoSide = 0;
    this.roundCoins = 0;
    this.roundT = 0;
    this.timeScale = 1;
    for (const s of this.strikes) s.on = false;
    this.spawnPlayers();
    this.ex.reset();
    this.draw.onRound();
    // roleta "Próximo desastre: ?" (fora do banco de testes)
    const quiet = this.benchStreak >= 0 || this.autoMe || (forcedNow && /[?&]s=/.test(location.search));
    this.setPhase('intro', quiet ? 2.6 : 4.6);
    this.rouletteClose?.();
    this.rouletteClose = quiet ? null : showRoulette(this.root, entry, { isNew: this.isNew, tele: HAZARDS[entry.hz[0]].tele() });
    this.hud.roundCard();
  }

  private spawnPlayers(): void {
    const old = this.players;
    this.players = [];
    const meSkin = SKINS.find((s) => s.id === save.skin) ?? SKINS[0];
    // "Jogar sozinho": sem bots (visitantes online reais continuam aparecendo como fantasmas)
    const n = isSolo('disaster') ? 1 : 8 - Math.min(3, this.peers.length);
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
        name = prev && !prev.self ? prev.name : BOT_NAMES[(this.nameOff + i) % BOT_NAMES.length];
      }
      const x = Math.max(40, Math.min(W - 40, sx + (i - n / 2) * 34 + (Math.random() - 0.5) * 20));
      const p: Player = {
        id: self ? 'me' : 'bot' + i,
        name,
        self,
        bot: self && !this.autoMe ? null : { gx: x, gy: 0, think: Math.random() * 0.5, skill: prev?.bot?.skill ?? 0.35 + Math.random() * 0.6, hop: 0, lazy: Math.random() },
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
        jbuf: 0,
        jhold: 0,
        bonk: 0,
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
        air: 1,
        swim: false,
        onSolid: -1,
        rescued: false,
        bubble: 0,
        bx: 0,
        by: 0,
        shield: 0,
        hit: 0,
        burn: 0,
        idle: 0,
        meter: 0,
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

  /** lado de onde o tornado vem (sorteado uma vez por rodada, antes do alerta, para o aviso mostrar) */
  private tornadoSide = 0;
  nextSide(): number {
    if (!this.tornadoSide) this.tornadoSide = this.rng() < 0.5 ? -1 : 1;
    return this.tornadoSide;
  }

  /** de onde vem o desastre d: -1 esquerda, 1 direita, 2 de cima, 3 de baixo (para o aviso) */
  hazardFrom(d: DisasterId): number {
    switch (d) {
      case 'tsunami':
        return -1;
      case 'avalanche':
        return 1;
      case 'tornado':
        return this.nextSide();
      case 'vulcao':
        return 1;
      case 'areia':
        return this.gust.dir || 1;
      case 'enchente':
      case 'acido':
      case 'sumidouro':
        return 3;
      default:
        return 2;
    }
  }

  get finale(): boolean {
    return this.sc.disasters[0] === 'meteoro';
  }

  private disasterDur(): number {
    const base = this.sc.disasters.length > 1 ? 52 : 46;
    return base + this.sc.difficulty * 2;
  }

  private nextPhase(): void {
    switch (this.phase) {
      case 'intro':
        // final do meteoro: tempo curto o bastante para precisar correr (antes 18+df: quase todos chegavam andando)
        // final: tempo que exige correr sem parar (menos com intensidade alta)
        this.setPhase('prepare', (this.finale ? (11.5 + this.sc.difficulty * 1.4) / Math.sqrt(this.I) : 15) + (this.training ? 8 : 0));
        if (this.finale) audio.siren(3);
        break;
      case 'prepare':
        if (this.finale) {
          this.startMeteor();
          this.setPhase('impact', 7.5);
        } else {
          this.setPhase('warn', 2.6 * Math.max(0.85, this.tele));
          this.hud.disasterCard(this.sc.disasters[0]);
          audio.siren(2.5);
          tap('heavy');
          this.say(this.hzOf(this.sc.disasters[0]).name() + '! ' + this.hzOf(this.sc.disasters[0]).tele());
        }
        break;
      case 'warn':
        this.setPhase('disaster', this.disasterDur());
        this.beginDisaster(this.sc.disasters[this.dIndex]);
        // desastre duplo: o 2º começa no meio do 1º (os dois juntos)
        this.comboAt = this.sc.disasters.length > 1 ? this.phaseDur * 0.35 : -1;
        break;
      case 'disaster':
        this.endRound();
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

  /** frente do tsunami/avalanche: spray na crista e água subindo ao bater em casas e torres */
  private frontFx(f: Fluid, prevFront: number, dt: number): void {
    const sim = this.sim!;
    const pw = this.draw.particles;
    const water = f.kind === 'water';
    const lipX = f.front - f.dir * 8;
    const ly = sim.surf(f.front - f.dir * 46);
    if (ly < 5000) {
      this.sprayAcc += dt * (water ? 26 : 14) * this.q.particleBudget;
      while (this.sprayAcc >= 1) {
        this.sprayAcc -= 1;
        if (water) pw.spray(lipX, ly - 6 + Math.random() * 14, 1, 'spray', f.dir * (120 + Math.random() * 120), -60 - Math.random() * 160, 0.6);
        else pw.spray(lipX, ly + Math.random() * 20, 1, 'puff', f.dir * (60 + Math.random() * 90), -30 - Math.random() * 60, 0.8);
      }
    }
    // bateu num corpo de pé: a água sobe pela parede
    const a = Math.min(prevFront, f.front);
    const b = Math.max(prevFront, f.front);
    const bs = this.world.bodies;
    for (let i = 0; i < bs.length; i++) {
      const bd = bs[i];
      if (!bd.alive || bd.h < 30 || bd.y + bd.h < GROUND_Y - 4) continue;
      const face = f.dir > 0 ? bd.x : bd.x + bd.w;
      if (face < a || face >= b) continue;
      const y = sim.surf(face - f.dir * 4);
      if (y > 5000) continue;
      pw.spray(face - f.dir * 4, Math.max(y, bd.y), water ? 9 : 6, water ? 'spray' : 'puff', -f.dir * 60, -380, 0.35);
      sim.disturb(face - f.dir * 10, 16, -120);
      // a onda derruba: casas na 1ª onda às vezes, torres nas ondas maiores
      if (this.phase === 'disaster' && !bd.awake && !bd.tip && (bd.kind === 'wall' || bd.kind === 'block' || bd.kind === 'ladder')) {
        const pk = (bd.kind === 'block' ? 0.04 + 0.12 * this.wave.k : 0.06 + 0.14 * this.wave.k) * this.I * (water ? 1 : 0.6);
        if (this.rng() < pk) this.world.push(bd, f.dir * 200, -20);
      }
    }
    // quem a frente da onda pega embaixo: caldo (perde fôlego) e é arrastado
    if (this.phase === 'disaster')
      for (const p of this.players) {
        if (!p.alive || p.hit > 0 || p.shield > 0) continue;
        const u = (f.front - p.x) * f.dir;
        if (u < 0 || u > 50 || p.y < sim.surf(p.x) + 6) continue;
        p.hit = 1.2;
        p.air -= (water ? 0.45 : 0) * this.I;
        p.vx += f.dir * 360;
        p.vy = Math.min(p.vy, -120);
        if (p.self) tap('heavy');
      }
  }

  /** cria (ou reaproveita) a simulação do fluido atual */
  private ensureSim(): void {
    if (this.fluid && (!this.sim || this.sim.kind !== this.fluid.kind)) {
      this.sim = new FluidSim(this.fluid.kind, this.world, this.tier);
      const k = this.fluid.kind;
      this.field.buoy = k === 'water' ? 2.1 : k === 'lava' ? 2.7 : k === 'goo' ? 2.0 : 1.5;
      this.field.drag = k === 'water' ? 1.8 : k === 'lava' ? 3.2 : k === 'goo' ? 3.6 : 5;
    }
  }

  /** aviso no meio do desastre (onda, tremor, rajada): cartão com ícone + contagem + seta, sirene e voz */
  alert(icon: DzIcon, from: number, secs: number, say: string): void {
    this.alertIcon = icon;
    this.alertFrom = from;
    this.alertT = secs;
    audio.siren(Math.min(2, secs));
    tap('medium');
    this.hud.toast(say, 'dz-alert');
    this.say(say);
  }

  /** voz só com a narração ligada (Configurações; padrão desligado) — src/games/noites/speak.ts */
  say(text: string): void {
    if (this.destroyed || this.benchStreak >= 0) return;
    try {
      speak(text, { cool: 2500, urgent: true });
    } catch {
      /* sem voz */
    }
  }

  /** número de ondas do tsunami/avalanche nesta intensidade */
  private waveCount(d: DisasterId): number {
    const I = this.I;
    if (d === 'avalanche') return I >= 1.05 ? 3 : 2;
    return Math.max(2, Math.min(4, Math.round(1.5 + 1.2 * I)));
  }
  /** altura da onda k */
  private waveH(d: DisasterId, k: number): number {
    const I = this.I;
    const duo = this.sc.disasters.length > 1 ? 0.85 : 1;
    if (d === 'avalanche') return (60 + 30 * I) * (0.42 + 0.38 * k) * duo;
    return (95 + 45 * I) * (0.7 + 0.3 * k) * duo;
  }
  /** nível final previsto do fluido (para a IA e para a seta do treino) */
  fluidPeak(d: DisasterId): number {
    const I = this.I;
    const duo = this.sc.disasters.length > 1 ? 0.85 : 1;
    switch (d) {
      case 'tsunami':
      case 'avalanche':
        return this.waveH(d, this.waveCount(d) - 1) + (d === 'avalanche' ? 48 + 15 * I : 70 + 22 * I) * 0.8;
      case 'enchente':
        return (140 + 100 * I) * duo;
      case 'acido':
        return (36 + 36 * I) * duo;
      case 'vulcao':
        return (45 + 28 * I) * duo;
      case 'raios':
        return 14 + 14 * I;
      default:
        return 0;
    }
  }

  private startWave(d: DisasterId): void {
    const f = this.fluid;
    if (!f) return;
    const k = this.wave.k;
    const H = this.waveH(d, k);
    this.wave.H = H;
    f.front = f.dir > 0 ? -260 : this.world.W + 260;
    f.level = Math.max(f.base, 4);
    f.target = H;
    f.rate = 70;
    f.crest = d === 'avalanche' ? 48 + 15 * this.I : 70 + 22 * this.I;
    f.speed = (d === 'avalanche' ? 175 + 35 * this.I : 225 + 45 * this.I) * (this.training ? 0.8 : 1);
    this.wave.warned = false;
    // destroços na frente da onda (troncos/caixas que já estavam soltos ganham um empurrão)
    if (d === 'tsunami') this.shake = Math.max(this.shake, 0.3);
  }

  private beginDisaster(d: DisasterId): void {
    this.active.add(d);
    const I = this.I;
    const dur = this.phaseDur || this.disasterDur();
    // combo: um fluido do mesmo tipo continua do nível atual (a chuva dos raios vira a enchente)
    const keep = this.fluid && this.fluid.dir === 0 ? this.fluid.level : 0;
    const fl = (f: Partial<Fluid> & { kind: Fluid['kind'] }): Fluid => ({ level: this.fluid?.kind === f.kind ? keep : 0, target: 100, rate: 3, front: -300, dir: 0, speed: 0, crest: 0, push: 0, base: 0, ...f });
    switch (d) {
      case 'tsunami':
      case 'avalanche': {
        const snow = d === 'avalanche';
        this.fluid = fl({ kind: snow ? 'snow' : 'water', dir: snow ? -1 : 1, push: snow ? -420 : 520 });
        if (this.tn.mini && !snow) this.wave.n = 0;
        this.wave.n = this.waveCount(d) + (this.tn.mini && !snow ? 2 : 0) - (this.tn.giant ? 1 : 0);
        this.wave.k = 0;
        this.wave.next = (dur - 4) / this.wave.n;
        this.ensureSim();
        this.startWave(d);
        if (snow) this.timers.avalanche = 2.5;
        break;
      }
      case 'enchente':
        this.fluid = fl({ kind: 'water', target: this.fluidPeak('enchente') / 3, rate: 6 + 3 * I });
        this.stage.k = 0;
        this.stage.next = dur * 0.28;
        break;
      case 'acido':
        this.fluid = fl({ kind: 'goo', target: this.fluidPeak('acido') / 3, rate: 3 + 2 * I });
        this.stage.k = 0;
        this.stage.next = dur * 0.28;
        this.timers.acido = 2;
        break;
      case 'vulcao':
        // a lava DESCE da direita (frente lenta) e sobe em pulsos; bombas miradas deixam fogo.
        // "O chão é lava": sobe por igual desde já, sem bombas (pule de lugar alto em lugar alto)
        if (this.tn.lavaFloor) this.fluid = fl({ kind: 'lava', target: this.fluidPeak('vulcao') / 3, rate: 1.4 + 0.6 * I });
        else this.fluid = fl({ kind: 'lava', dir: -1, front: this.world.W + 60, speed: 18 + 12 * I, target: this.fluidPeak('vulcao') / 3, rate: 4, crest: 8, push: -160 });
        this.stage.k = 0;
        this.stage.next = dur * 0.28;
        this.timers.vulcao = 2.2;
        break;
      case 'tornado': {
        const tw = this.tornado.on ? this.tornado2 : this.tornado;
        tw.on = true;
        const side = tw === this.tornado ? this.nextSide() : -this.nextSide();
        tw.x = side < 0 ? -120 : this.world.W + 120;
        tw.vx = -side * (60 + 30 * I);
        tw.r = (58 + 10 * I) * this.tn.size;
        tw.tgt = -1;
        tw.tgtT = 2;
        this.ripCD = this.world.houses.map(() => 0);
        // mini-tornados: os dois já de cara (pequenos); furacão: vento constante + chuva que alaga
        if (this.tn.mini && tw === this.tornado) {
          const t2 = this.tornado2;
          t2.on = true;
          t2.x = side < 0 ? this.world.W + 120 : -120;
          t2.vx = side * (60 + 30 * I);
          t2.r = tw.r;
          t2.tgt = -1;
          t2.tgtT = 1;
        }
        if (this.tn.hurricane) {
          this.wind = (this.rng() < 0.5 ? -1 : 1) * (80 + 20 * I);
          if (!this.fluid) this.fluid = fl({ kind: 'water', target: 30 + 12 * I, rate: 0.9 + 0.4 * I });
        }
        break;
      }
      case 'terremoto':
        this.quake = 0.01;
        this.pulse.k = -1;
        this.pulse.t = 0;
        this.pulse.on = false;
        this.timers.terremoto = 1.2;
        break;
      case 'raios':
        this.timers.raios = 1.2;
        // a chuva alaga o chão aos poucos (se nenhum outro fluido estiver ativo)
        if (!this.fluid) this.fluid = fl({ kind: 'water', target: this.fluidPeak('raios'), rate: 0.5 + 0.5 * I });
        break;
      case 'sumidouro':
        this.timers.sumidouro = 0.8;
        break;
      case 'meteoros':
        this.timers.meteoros = 1.2;
        break;
      case 'areia':
        this.gust.next = 1.5;
        this.gust.dir = this.rng() < 0.5 ? -1 : 1;
        this.timers.areia = 99;
        break;
      default:
        this.ex.begin(d);
        break;
    }
    // modificador "chuva": a água sobe um pouco (se nada mais estiver alagando)
    if (this.tn.rain && !this.fluid) this.fluid = fl({ kind: 'water', target: 22 + 10 * I, rate: 0.6 + 0.4 * I });
    this.ensureSim();
  }

  /** ajustes do desastre desta rodada (catálogo) */
  get tn(): Tune {
    return this.sc.tune!;
  }

  /** por desastre: tempo até o próximo golpe (combos não dividem o mesmo relógio) */
  timers: Record<string, number> = {};
  /** tempo que cada corpo passou com a base mergulhada (corrosão/erosão: torres caem) */
  soak: Float32Array = new Float32Array(0);

  /** derruba parte das construções (terremoto): paredes e torres tombam */
  collapse(frac: number): void {
    const w = this.world;
    for (const h of w.houses) {
      if (this.rng() > frac) continue;
      const side = this.rng() < 0.5 ? -1 : 1;
      w.push(w.bodies[h.wallL], side * 120, -20);
      if (this.rng() < 0.6) w.push(w.bodies[h.wallR], side * 120, -20);
    }
    for (const b of w.bodies) {
      if (!b.alive || b.awake || b.kind !== 'block') continue;
      if (this.rng() < frac * 0.6) w.push(b, (this.rng() - 0.5) * 300, -60);
    }
    if (this.q.shake) this.shake = Math.max(this.shake, 0.8);
    audio.crack();
  }

  /** algo entrou na água (corpo, jogador, bomba): onda nas colunas + respingo e bolhas */
  splash(x: number, w: number, vy: number): void {
    const sim = this.sim;
    const f = this.fluid;
    if (!sim || !f) return;
    const sp = Math.min(700, Math.abs(vy));
    sim.disturb(x, Math.max(10, w), -Math.sign(vy) * sp * (f.kind === 'snow' ? 0.1 : f.kind === 'water' ? 0.45 : 0.28));
    if (sp < 90) return;
    const y = sim.surf(x);
    if (y > 5000) return;
    const n = Math.min(14, 3 + Math.round(sp / 60 + w / 14));
    const pk = f.kind === 'water' ? 'spray' : f.kind === 'lava' ? 'fire' : f.kind === 'goo' ? 'goo' : 'puff';
    const pw = this.draw.particles;
    const up = f.kind === 'lava' ? 0.55 : f.kind === 'goo' ? 0.6 : 1;
    pw.spray(x - w * 0.4, y - 2, n >> 1, pk, -70 - sp * 0.15, -(140 + sp * 0.5) * up, 0.5);
    pw.spray(x + w * 0.4, y - 2, n >> 1, pk, 70 + sp * 0.15, -(140 + sp * 0.5) * up, 0.5);
    if (f.kind !== 'snow') for (let i = 0; i < 4; i++) sim.bubble(x + (Math.random() - 0.5) * w, y + 8 + Math.random() * 20, 1.5 + Math.random() * 2.5);
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
    this.partyRounds++;
    if (survived) this.partySv++;
    this.syncPartyBar();
    this.progress.survived += survived ? 1 : 0;
    this.progress.played++;
    let place = 1;
    if (!survived) place = alive + 1 + (this.outCount - me.outOrder);
    if (survived) {
      this.streak++;
      this.sessionSurvived++;
      this.newBest = this.streak > 1 && this.streak > this.progress.best;
      this.progress.best = Math.max(this.progress.best, this.streak);
      // economia (nov/2026): rodadas de ~70 s pagavam ~15 moedas/min; agora ~40-50/min, perto dos outros jogos
      let coins = 70 + this.sc.difficulty * 15 + Math.min(10, this.streak - 1) * 6 + (this.finale ? 60 : 0);
      try {
        const bonus = (window as unknown as { petCoinBonus?: (c: number) => number }).petCoinBonus;
        if (typeof bonus === 'function') coins += Math.max(0, Math.round(bonus(coins) || 0));
      } catch {
        /* sem bichinho */
      }
      // moedas pegas no meio do desastre e amigos salvos (risco × recompensa)
      coins += this.held * 6 + this.rescues * 15;
      this.points += 100 + 15 * this.sc.difficulty + Math.round(this.phaseT * 2) + this.held * 10;
      this.roundCoins = coins;
      this.sessionCoins += coins;
      addCoins(coins);
      audio.cash();
      success();
    } else {
      this.streak = 0;
      // perdeu, mas ganha pelo tempo que aguentou durante o desastre (nunca sai de mãos vazias)
      const held = Math.max(0, Math.min(60, (me.outT || 0)));
      // caiu: as moedas que estavam "na mão" valem a metade
      const c = 8 + Math.round(held * 0.6) + Math.floor((this.held * 6) / 2) + this.rescues * 15;
      this.points += Math.round(held * 2);
      this.roundCoins = c;
      this.sessionCoins += c;
      addCoins(c);
    }
    this.sessionPoints += this.points;
    saveProgress(this.progress);
    if (this.entry && this.benchStreak < 0) markSeen(this.entry.key, survived);
    reportRun({
      game: 'disaster',
      score: this.sessionSurvived,
      coins: this.roundCoins,
      durationSec: Math.round(this.roundT),
      won: survived,
      place,
      stats: { scenario: this.sc.n, streak: this.streak, difficulty: this.sc.difficulty, points: this.points, rescues: this.rescues, mode: MODE_MUL[this.mode] },
    });
    this.setPhase('end', 4.2);
    this.hud.resultCard(survived, this.roundCoins, alive);
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
    // Tempo de jogo robusto a qualquer taxa de quadros (30–120 Hz) e a engasgos de GC:
    // - o tempo real é acumulado (antes, no nível "Mínimo" com tela de 60 Hz, TODO quadro era
    //   descartado e o jogo congelava/andava em câmera lenta);
    // - engasgo longo é cortado em 0,1 s (o jogo desacelera em vez de teletransportar);
    // - a física roda em subpassos fixos de no máximo 1/60 s (máx. 6), então 30 fps simula igual a 60/120.
    const frame = (now - this.last) / 1000;
    this.last = now;
    if (!(frame > 0)) return;
    this.acc += Math.min(frame, MAX_FRAME);
    const minFrame = this.q.fpsCap === 30 ? 1 / 30 - 0.004 : 0;
    if (this.acc < minFrame) return;
    const dt = Math.min(this.acc, MAX_FRAME);
    this.acc = 0;
    const t0 = performance.now();
    const n = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(dt / STEP - 1e-6)));
    // Uma exceção num quadro NÃO pode parar o jogo: registra, saneia o estado e segue.
    // Se o mesmo erro se repete sem parar, recomeça a rodada (melhor do que uma tela congelada).
    try {
      for (let i = 0; i < n; i++) this.update(dt / n);
      this.sanitize();
    } catch (e) {
      this.onLoopError('update', e);
    }
    try {
      this.draw.frame();
    } catch (e) {
      this.onLoopError('draw', e);
      try {
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.globalAlpha = 1;
        this.ctx.globalCompositeOperation = 'source-over';
      } catch {
        /* */
      }
    }
    this.gov.sample(dt * 1000, performance.now() - t0);
  };
  /** erros capturados no laço (debug/soak) */
  loopErrors = 0;
  private errBurst = 0;
  private errBurstT = 0;
  private lastErrMsg = '';
  /** último quadro do laço (vigia) */
  private beat = 0;

  private onLoopError(where: string, e: unknown): void {
    this.loopErrors++;
    const msg = where + ': ' + String((e as Error)?.message ?? e);
    if (msg !== this.lastErrMsg) {
      this.lastErrMsg = msg;
      console.warn('[disaster] erro no laço (recuperado)', where, e);
    }
    const now = performance.now();
    if (now - this.errBurstT > 3000) {
      this.errBurstT = now;
      this.errBurst = 0;
    }
    if (++this.errBurst >= 20) {
      this.errBurst = 0;
      this.errBurstT = now;
      try {
        this.releaseInput();
        this.startRound();
      } catch (e2) {
        console.warn('[disaster] não deu para recomeçar a rodada', e2);
      }
    }
  }

  /** NaN/Infinity em jogadores ou corpos: volta para um estado válido em vez de contaminar tudo */
  private sanitize(): void {
    const w = this.world;
    for (const p of this.players) {
      if (Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.vx) && Number.isFinite(p.vy) && Number.isFinite(p.gx) && Number.isFinite(p.gy)) continue;
      p.x = Number.isFinite(p.x) ? Math.max(20, Math.min(w.W - 20, p.x)) : w.spawnX;
      p.y = w.topAt(p.x);
      p.vx = p.vy = 0;
      p.gx = p.x;
      p.gy = p.y - 14;
      p.climbing = false;
    }
    for (const b of w.bodies) {
      if (!b.alive) continue;
      if (Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.vx) && Number.isFinite(b.vy) && Number.isFinite(b.ang)) continue;
      b.alive = false;
    }
    if (!Number.isFinite(this.cam.x) || !Number.isFinite(this.cam.y)) {
      this.cam.x = this.me.x || 0;
      this.cam.y = -200;
    }
    if (!Number.isFinite(this.timeScale) || this.timeScale <= 0) this.timeScale = 1;
    if (!Number.isFinite(this.shake)) this.shake = 0;
  }

  /** vigia: se o requestAnimationFrame parar (WebView que "esquece" o rAF ao voltar do fundo), religa */
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
  private acc = 0;

  private update(rdt: number): void {
    this.time += rdt;
    this.phaseT += rdt;
    // câmera lenta nos últimos instantes
    const slow = this.phase === 'disaster' && this.phaseDur - this.phaseT < 1.4 && this.dIndex === this.sc.disasters.length - 1;
    this.timeScale += ((slow ? 0.35 : 1) - this.timeScale) * Math.min(1, rdt * 6);
    const dt = rdt * this.timeScale * ((this.sc.tune?.turbo || this.sc.mod === 'rapido') && this.phase === 'disaster' ? 1.2 : 1);
    if (this.phase !== 'end' && this.phase !== 'intro') this.roundT += rdt;
    if (this.phaseT >= this.phaseDur) this.nextPhase();

    this.updateDisasters(dt);
    if (this.fluid && this.sim) this.field.push = this.fluid.dir ? this.fluid.push : 0;
    this.world.step(dt, this.fluid && this.sim ? this.field : null);

    // entrada do jogador
    const mi = this.me.input;
    // joystick flutuante (src/ui/touch): horizontal anda, para cima sobe escada
    const js = this.hud.joy.read();
    mi.l = this.keys.l || this.touch.l || js.x < -0.3;
    mi.r = this.keys.r || this.touch.r || js.x > 0.3;
    // toque rápido (apertou e soltou entre dois quadros) ainda conta como pulo
    if (this.jumpTap) mi.tap = true;
    this.jumpTap = false;
    mi.j = this.keys.j || this.touch.j;
    mi.u = this.keys.u || this.touch.j;
    mi.climb = js.active && js.y < -0.55;

    for (const p of this.players) {
      if (p.self && this.autoMe && !p.bot) p.bot = { gx: p.x, gy: 0, think: 0, skill: 0.95, hop: 0, lazy: 0.2 };
      if (p.bot && p.alive) this.think(p, dt);
      if (p.ghost) this.ghostStep(p, dt);
      else if (p.alive) {
        const py = p.y;
        this.movePlayer(p, dt);
        this.checkHazards(p, dt);
        this.ex.post(p, py, dt);
      }
    }
    this.rescueAndCoins(rdt);
    if (this.phase === 'disaster' || this.phase === 'impact') {
      const alive = this.players.some((p) => p.alive && !p.self) || this.me.alive;
      if (!alive && this.phaseDur - this.phaseT > 2.5) this.phaseT = this.phaseDur - 2.5;
    }
    if (this.training && this.me.alive && (this.phase === 'prepare' || this.phase === 'warn' || this.phase === 'disaster')) {
      this.safeT -= rdt;
      if (this.safeT <= 0) {
        this.safeT = 0.8;
        this.safe = this.safeSpot();
      }
    } else this.safe = null;
    this.updateCamera(rdt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - rdt * 2.2);
    this.draw.particles.step(dt);
    this.hud.tick(rdt);

    // online ~5 Hz
    this.sendT -= rdt;
    if (this.presence && this.sendT <= 0) {
      this.sendT = 0.2;
      const m = this.me;
      const bb = m.ghost && m.bubble > 0 && !m.rescued;
      this.presence.send({ x: Math.round(m.ghost ? m.gx : m.x), y: Math.round(m.ghost ? m.gy : m.y), g: m.ghost ? 1 : 0, f: m.face, sv: this.partySv, rd: this.partyRounds, pts: this.sessionPoints, rid: this.rid, hp: this.helpHb, bb: bb ? 1 : 0, bx: Math.round(m.bx), by: Math.round(m.by) });
    }
    if (this.helpHbT > 0) {
      this.helpHbT -= rdt;
      if (this.helpHbT <= 0) this.helpHb = 0;
    }
  }

  /** bolhas de resgate (você salva bots; amigos online salvam você), moedas do desastre e "ajudou!" online */
  private rescueAndCoins(dt: number): void {
    const me = this.me;
    for (const p of this.players) {
      if (p.bubble <= 0) continue;
      p.bubble -= dt;
      if (p.alive || p.self || !me.alive) continue;
      if (Math.abs(me.x - p.bx) < 26 && Math.abs(me.y - 14 - p.by) < 30) {
        this.revive(p, me);
        this.rescues++;
        this.points += 40;
        audio.coin(3);
        tap('medium');
        this.hud.toast(t('dz.saved', 'Você salvou {name}!', { name: p.name }), 'dz-saved');
      }
    }
    if (me.alive)
      for (const c of this.coins) {
        if (!c.on || Math.abs(me.x - c.x) > 20 || Math.abs(me.y - 12 - c.y) > 26) continue;
        c.on = false;
        this.held++;
        this.draw.particles.burst(c.x, c.y, 8, 'spark', 160);
        audio.coin(1);
      }
    // online: um amigo vivo perto do meu fantasma por ~1 s me traz de volta (uma vez por rodada)
    if (me.ghost && me.bubble > 0 && !me.rescued && this.peers.length) {
      let near: PeerState | null = null;
      for (const pr of this.peers) if (!pr.s.g && Math.abs((pr.s.x ?? -999) - me.bx) < 30 && Math.abs((pr.s.y ?? -999) - 14 - me.by) < 34) near = pr;
      this.reviveNear = near ? this.reviveNear + dt : Math.max(0, this.reviveNear - dt);
      if (near && this.reviveNear >= 1) {
        this.reviveNear = 0;
        this.revive(me, null);
        me.x = near.s.x ?? me.bx;
        me.y = near.s.y ?? me.by;
        this.helpHb = near.s.rid ?? 0;
        this.helpHbT = 3;
        this.hud.toast(t('dz.revived', '{name} te salvou!', { name: near.name }));
        audio.coin(3);
        success();
      }
    }
    // alguém disse que EU salvei (hp = meu id): bônus "Ajudou!" uma vez por amigo/rodada
    for (const pr of this.peers) {
      const rid = pr.s.rid ?? 0;
      if (pr.s.hp === this.rid && rid && !this.helpSeen.has(rid)) {
        this.helpSeen.add(rid);
        this.rescues++;
        this.points += 40;
        this.hud.toast(t('dz.helped', 'Ajudou! Você salvou {name}.', { name: pr.name }));
        audio.coin(3);
      }
    }
  }

  /** volta ao jogo (resgate): ao lado de quem salvou, com escudo curto */
  private revive(p: Player, by: Player | null): void {
    p.alive = true;
    p.ghost = false;
    p.rescued = true;
    p.bubble = 0;
    p.x = by ? by.x + (by.x > p.bx ? -14 : 14) : p.bx;
    p.y = by ? by.y : p.by + 16;
    p.vx = 0;
    p.vy = -120;
    p.shield = 2;
    p.air = 1;
    p.swim = false;
    p.burn = 0;
    p.onGround = false;
    this.draw.particles.burst(p.x, p.y - 12, 14, 'spark', 180);
  }

  /* ------------------------------ desastres ------------------------------ */

  /** y da superfície do fluido em x (9999 = seco/sem fluido) — dinâmica, com ondas e respingos */
  surfaceAt(x: number): number {
    return this.fluid && this.sim ? this.sim.surf(x) : 9999;
  }

  /** disaster fluido ativo agora (para pulsos e alertas) */
  private fluidD(): DisasterId | null {
    for (const d of this.active) if (isFluidD(d)) return d;
    return this.active.has('raios') && this.fluid ? 'raios' : null;
  }

  /** multiplicador de cadência dos golpes: intensidade × calor (acelera ao longo do desastre) */
  private pace(): number {
    return this.I * (1 + 0.55 * this.heat) * (this.training ? 0.7 : 1) * (this.sc.disasters.length > 1 ? 0.85 : 1);
  }

  private updateDisasters(dt: number): void {
    const w = this.world;
    const inDisaster = this.phase === 'disaster' || this.phase === 'warn' || this.phase === 'end';
    const dis = this.phase === 'disaster';
    const f = this.fluid;
    if (dis) this.heat = Math.min(1, this.phaseT / Math.max(1, this.phaseDur));
    if (this.alertT > 0) this.alertT = Math.max(0, this.alertT - dt);
    if (this.ripGrace > 0) this.ripGrace -= dt;
    // desastre duplo: o 2º começa no meio do 1º
    if (dis && this.comboAt >= 0 && this.phaseT >= this.comboAt) {
      this.comboAt = -1;
      this.dIndex = Math.min(1, this.sc.disasters.length - 1);
      const d2 = this.sc.disasters[this.dIndex];
      this.alert('combo', this.hazardFrom(d2), 2.2, t('dz.combo', 'Desastre duplo!') + ' ' + this.hzOf(d2).name() + '!');
      this.beginDisaster(d2);
      for (const p of this.players) if (p.bot) p.bot.think = 0;
    }
    if (f) {
      if (f.dir !== 0) {
        f.front += f.speed * f.dir * dt;
        const past = (f.dir > 0 && f.front > w.W + 200) || (f.dir < 0 && f.front < -200);
        if (f.level < f.target && (!past || this.wave.n === 0)) f.level = Math.min(f.target, f.level + f.rate * dt);
        if (past) {
          // depois que a onda atravessa, a crista some e a água recua até o que FICA no mapa
          f.crest = Math.max(0, f.crest - dt * 30);
          if (this.wave.n > 0) {
            const keep = this.wave.H * (this.wave.k + 1 >= this.wave.n ? 0.78 : 0.55);
            if (f.base < keep) f.base = Math.min(keep, f.base + dt * 30);
            if (f.level > f.base) f.level = Math.max(f.base, f.level - dt * 24);
          }
        }
      } else if (dis) f.level = Math.min(f.target, f.level + f.rate * dt);
      const sim = this.sim;
      if (sim) {
        const prevFront = sim.front;
        sim.rain = f.kind === 'water' && f.dir === 0 && (this.active.has('enchente') || this.night) ? 0.5 : 0;
        sim.step(dt, f);
        if (f.dir !== 0 && f.crest > 10) this.frontFx(f, prevFront, dt);
      }
    }
    if (dis) {
      const I = this.I;
      const k = this.pace();
      // ondas (tsunami/avalanche): a próxima é avisada (mar recua + sirene + seta) e vem maior
      if (this.wave.n > 0 && f && f.dir !== 0) {
        const d = this.active.has('tsunami') ? 'tsunami' : 'avalanche';
        this.wave.next -= dt;
        if (this.wave.k + 1 < this.wave.n) {
          if (!this.wave.warned && this.wave.next <= 2.8 * this.tele) {
            this.wave.warned = true;
            this.alert(d === 'tsunami' ? 'wave' : 'avalanche', f.dir > 0 ? -1 : 1, 2.8 * this.tele, t('dz.al.wave', 'Onda {n}!', { n: this.wave.k + 2 }));
          }
          if (this.wave.next <= 0) {
            this.wave.k++;
            this.wave.next = (this.phaseDur - 4) / this.wave.n;
            this.startWave(d);
          }
        }
      }
      // pulsos (enchente/gosma/lava/chuva): sobe, pausa, sobe mais
      const fd = this.fluidD();
      if (f && fd && f.dir === 0 && fd !== 'raios' && this.stage.k < 2) {
        this.stage.next -= dt;
        if (!this.stageWarn && this.stage.next <= 2.2 * this.tele) {
          this.stageWarn = true;
          this.alert(fd, 3, 2.2 * this.tele, t('dz.al.rise', 'Vai subir mais!'));
        }
        if (this.stage.next <= 0) {
          this.stage.k++;
          this.stage.next = this.phaseDur * 0.28;
          this.stageWarn = false;
          f.target += this.fluidPeak(fd) / 3;
          f.rate *= 1.2;
        }
      } else if (f && fd === 'vulcao' && this.stage.k < 2) {
        this.stage.next -= dt;
        if (this.stage.next <= 0) {
          this.stage.k++;
          this.stage.next = this.phaseDur * 0.28;
          f.target += this.fluidPeak('vulcao') / 3;
          this.alert('vulcao', 1, 1.6, t('dz.al.lava', 'Mais lava!'));
        }
      }
      // corrosão/erosão: o que fica com a base mergulhada racha e tomba (torres e casas incluídas)
      if (f && this.sim && f.kind !== 'snow' && !this.tn.lavaFloor) {
        if (this.soak.length !== w.bodies.length) this.soak = new Float32Array(w.bodies.length);
        const rate = (f.kind === 'lava' ? 1 / 8 : f.kind === 'goo' ? 1 / 16 : 1 / 7) * I;
        const minD = f.kind === 'water' ? 26 : 46;
        for (let i = 0; i < w.bodies.length; i++) {
          const b = w.bodies[i];
          if (!b.alive || b.awake || b.tip || this.soak[i] < 0) continue;
          if (b.kind !== 'block' && b.kind !== 'wall' && b.kind !== 'ladder') continue;
          if (b.y + b.h < GROUND_Y - 4) continue;
          const depth = GROUND_Y - this.surfaceAt(b.x + b.w * 0.5);
          if (depth < minD) continue;
          this.soak[i] += dt * rate * (depth > 90 ? 1.5 : 1);
          if (this.soak[i] >= 1) {
            this.soak[i] = -1;
            const dir = f.dir || (this.rng() < 0.5 ? -1 : 1);
            w.push(b, dir * 170, -30);
            this.draw.particles.burst(b.x + b.w / 2, b.y + b.h - 10, 8, f.kind === 'water' ? 'spray' : f.kind === 'lava' ? 'fire' : 'goo', 160);
            if (Math.abs(b.x - this.me.x) < 500) audio.crack();
          }
        }
      }
      // terremoto: tremor principal + réplicas, com calmaria; cada tremor derruba e racha o chão
      if (this.active.has('terremoto')) {
        const P = this.pulse;
        P.t += dt;
        const period = 15;
        const plen = 5 + 1.6 * I;
        const kk = Math.floor(P.t / period);
        const inP = kk < 3 && P.t - kk * period < plen;
        if (kk !== P.k && kk < 3) {
          P.k = kk;
          this.collapse((0.14 + 0.08 * I) * (kk === 0 ? 1 : 1.3));
          this.crack(2 + Math.round(I * 1.5) + kk);
        }
        if (!inP && kk < 2 && P.t - kk * period > period - 1.8 * this.tele && !P.on) {
          P.on = true;
          this.alert('terremoto', 3, 1.8 * this.tele, t('dz.al.quake', 'Tremor!'));
        } else if (inP) P.on = false;
        const qt = inP ? (kk === 0 ? 1 : 0.85) : 0.04;
        this.quake += (qt - this.quake) * Math.min(1, dt * 3);
        if (this.q.shake && inP) this.shake = Math.max(this.shake, 0.35 + this.quake * 0.4);
        if (inP && this.rng() < dt * (3 + 2 * I) * this.quake) {
          const b = w.bodies[Math.floor(this.rng() * w.bodies.length)];
          if (b && b.alive) {
            w.push(b, (this.rng() - 0.5) * 260, -60 - this.rng() * 80);
            audio.crack();
          }
        }
        if (inP) this.tick('terremoto', dt * k, () => this.spawnAimed('rock', 1.35 * this.tele, 26, 0.55), 1.0);
      }
      // sumidouro: o chão afunda em círculos que crescem e se juntam (sempre sobra chão firme)
      if (this.active.has('sumidouro')) {
        // gelo rachando: rachaduras que abrem e congelam de novo (mais vezes, menores)
        if (this.tn.ice) this.tick('sumidouro', dt * k * this.tn.rate, () => this.crack(1 + (this.rng() < 0.4 * I ? 1 : 0)), 2.1 - 0.6 * this.heat);
        else this.tick('sumidouro', dt * k * this.tn.rate, () => this.sink(), 4 - 1 * this.heat);
      }
      this.ex.update(dt, k);
      // tornado(s): persegue os jogadores, arranca telhados, arremessa destroços
      if (this.active.has('tornado')) {
        if (!this.tornado2.on && I >= 1.12 && this.phaseT > this.phaseDur * 0.4 && !this.training) {
          const tw = this.tornado2;
          const side = -this.nextSide();
          tw.on = true;
          tw.x = side < 0 ? -120 : w.W + 120;
          tw.vx = -side * 60;
          tw.r = this.tornado.r * 0.9;
          tw.tgt = -1;
          tw.tgtT = 0;
          this.alert('tornado', side, 2, t('dz.al.tornado2', 'Outro tornado!'));
        }
        this.twister(this.tornado, dt, k);
        this.twister(this.tornado2, dt, k);
      }
      if (this.active.has('meteoros')) {
        this.tick(
          'meteoros',
          dt * k * this.tn.rate,
          () => {
            const sk = this.tn.strike;
            const s = this.spawnAimed('meteor', (sk === 'hail' ? 1.25 : sk === 'piano' ? 1.7 : 1.45) * this.tele * (this.tn.grav < 1 ? 1.15 : 1), (38 + 4 * I) * this.tn.size, sk === 'hail' ? 0.35 : 0.45);
            // no fim: rajadas de 3 em linha
            if (s && this.heat > 0.6 && this.rng() < 0.35) for (const o of [-1, 1]) this.spawnStrike('meteor', s.T + 0.25, s.r, s.x + o * s.r * 1.7);
          },
          1.3 - 0.35 * this.heat,
        );
      }
      if (this.active.has('raios')) this.tick('raios', dt * k, () => this.spawnBolt(), 1.05 - 0.25 * this.heat);
      if (this.active.has('vulcao') && !this.tn.lavaFloor) {
        this.tick('vulcao', dt * k, () => this.spawnAimed('bomb', 1.6 * this.tele, 28, 0.5), 2.4 - 0.6 * this.heat);
        this.haze = Math.min(0.5, this.haze + dt * 0.012 * I);
      }
      if (this.active.has('acido')) this.tick('acido', dt * k, () => this.spawnAimed('drop', 1.2 * this.tele, 18, 0.5), 2.4 - 0.6 * this.heat);
      if (this.active.has('avalanche')) {
        this.tick('avalanche', dt * k, () => this.spawnBall(), 3.1 - 1.1 * this.heat);
        // blocos de gelo caindo da montanha (miram quem fica parado, inclusive lá no alto)
        this.tick('ice', dt * k, () => this.spawnAimed('rock', 1.5 * this.tele, 22, 0.7), 6 - 1.5 * this.heat);
      }
      // enchente: a tempestade solta raios no ponto mais alto de vez em quando
      if (this.active.has('enchente')) this.tick('stormbolt', dt * k, () => this.spawnBolt(true), 14 - 4 * this.heat);
      if (this.active.has('areia')) this.sandstorm(dt, k);
      // enchente: destroços boiando na correnteza (tiram fôlego de quem nada; derrubam quem está na beira)
      if (this.active.has('enchente') && f && f.level > 30)
        this.tick(
          'enchente',
          dt * k,
          () => {
            const dir = this.rng() < 0.5 ? -1 : 1;
            const s = this.spawnStrike('gust', 1.2 * this.tele, 14, dir > 0 ? -40 : w.W + 40);
            if (!s) return;
            s.vx = dir * (150 + 50 * I);
            s.ty = GROUND_Y - f.level - 4;
            s.soft = true;
          },
          3.6 - 1.2 * this.heat,
        );
      // moedas no meio do desastre (risco × recompensa)
      this.coinT -= dt;
      if (this.coinT <= 0) {
        this.coinT = 2.6 + this.rng() * 1.6;
        this.spawnCoin();
      }
    } else if (!inDisaster) this.quake = 0;
    if (this.phase !== 'disaster') this.quake = Math.max(0, this.quake - dt * 0.6);
    // final: meteoritos pequenos no caminho enquanto corre
    if (this.finale && this.phase === 'prepare' && !this.training && this.phaseT > 2.5) this.tick('meteoro', dt * this.I, () => this.spawnCourseRock(), 2.2);
    if (this.gust.vis > 0 && !(this.gust.t > 0)) this.gust.vis = Math.max(0, this.gust.vis - dt * 0.5);
    this.updatePlatforms(dt);
    this.updateHoles(dt);
    // fogo no chão
    for (const fi of this.fires) {
      if (!fi.on) continue;
      fi.t -= dt;
      if (fi.t <= 0) fi.on = false;
      else if (this.rng() < dt * 8 * this.q.particleBudget) this.draw.particles.spray(fi.x + (this.rng() - 0.5) * fi.r * 1.6, fi.y - 2, 1, 'fire', 0, -90, 0.4);
    }
    for (const c of this.coins) {
      if (!c.on) continue;
      c.t -= dt;
      if (c.t <= 0) c.on = false;
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
      if (s.kind === 'ball' || s.kind === 'gust') {
        if (s.t > 0) continue;
        s.live = true;
        s.x += s.vx * dt;
        if (s.kind === 'ball') {
          const sy = Math.min(GROUND_Y, this.surfaceAt(s.x));
          s.ty += (sy - s.r - s.ty) * Math.min(1, dt * 10);
          // bate numa casa/torre: se desfaz (bola de boliche gigante: derruba como pino e segue mais devagar)
          if (w.topAt(s.x + Math.sign(s.vx) * s.r) < s.ty - s.r * 1.2 && w.topAt(s.x) > s.ty - 40) {
            if (this.active.has('bolas') && Math.abs(s.vx) > 110) {
              const fx = s.x + Math.sign(s.vx) * s.r;
              for (const b of w.bodies) if (b.alive && fx > b.x - 4 && fx < b.x + b.w + 4 && b.y + b.h > s.ty - s.r) w.push(b, s.vx * (b.heavy ? 0.5 : 0.9), -120 - this.rng() * 160);
              s.vx *= 0.8;
              this.draw.particles.burst(fx, s.ty, 10, 'debris', 260);
              if (this.q.shake) this.shake = Math.max(this.shake, 0.35);
              if (Math.abs(fx - this.me.x) < 500) audio.crack();
            } else this.endMover(s);
          }
        } else if (this.blockedByHouse(s.x, s.ty)) this.endMover(s);
        if (s.x < -80 || s.x > w.W + 80) s.on = false;
        continue;
      }
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
        m.ring += dt * 460;
        m.flash = Math.max(0, m.flash - dt * 0.7);
        for (const b of w.bodies) {
          if (!b.alive) continue;
          const d = Math.abs(b.x + b.w * 0.5 - m.x);
          if (d >= prev && d < m.ring) w.push(b, Math.sign(b.x - m.x || 1) * (500 + this.rng() * 300), -500 - this.rng() * 400);
        }
        for (const p of this.players) {
          if (!p.alive || p.safe) continue;
          const d = Math.abs(p.x - m.x);
          if (d < m.ring) this.knockOut(p, Math.sign(p.x - m.x || 1), 'meteor');
        }
        if (this.q.shake) this.shake = Math.max(this.shake, 0.6 * m.flash + 0.2);
      }
    }
  }

  stageWarn = false;
  private swimTold = false;

  /** relógio de golpes por desastre: chama fn quando zera e recarrega com base·(0,7..1,3) */
  tick(d: string, dt: number, fn: () => void, base: number): void {
    const v = (this.timers[d] ?? 1) - dt;
    if (v > 0) {
      this.timers[d] = v;
      return;
    }
    fn();
    this.timers[d] = Math.max(0.28, base) * (0.7 + this.rng() * 0.6);
  }

  /** alvo dos golpes: sorteio com peso para quem está PARADO (ficar parado é o erro; mexer-se protege) */
  pickTarget(): Player | null {
    let tot = 0;
    for (const p of this.players) if (p.alive && !p.safe) tot += 1 + Math.min(5, p.idle * 0.8);
    if (!tot) return null;
    let r = this.rng() * tot;
    for (const p of this.players) {
      if (!p.alive || p.safe) continue;
      r -= 1 + Math.min(5, p.idle * 0.8);
      if (r <= 0) return p;
    }
    return null;
  }

  /** golpe mirado: com chance `aim` mira onde um jogador VAI estar (posição + velocidade) */
  spawnAimed(kind: Strike['kind'], T: number, r: number, aim: number): Strike | null {
    const w = this.world;
    let x = 40 + this.rng() * (w.W - 80);
    if (this.rng() < aim) {
      const p = this.pickTarget();
      if (p) x = p.x + p.vx * T * 0.75 + (this.rng() - 0.5) * r * 1.2;
    }
    return this.spawnStrike(kind, T, r, x);
  }

  /** raio: 55% no jogador mais ALTO (lugares altos atraem raio); o resto mirado */
  private spawnBolt(onlyHigh = false): void {
    let hi: Player | null = null;
    for (const p of this.players) if (p.alive && !p.safe && p.y < -40 && (!hi || p.y < hi.y)) hi = p;
    const T = 1.3 * this.tele;
    if (hi && (onlyHigh || this.rng() < 0.45)) this.spawnStrike('bolt', T, 22, hi.x + hi.vx * T * 0.5 + (this.rng() - 0.5) * 16);
    else if (!onlyHigh) this.spawnAimed('bolt', T, 22, 0.55);
  }

  /** bola de neve rolando pelo chão (vem da direita; pule por cima) */
  private spawnBall(): void {
    const s = this.spawnStrike('ball', 1.3 * this.tele, 17, this.world.W + 40);
    if (!s) return;
    s.vx = -(230 + 70 * this.I);
    s.ty = GROUND_Y - s.r;
  }

  /** pedras no percurso do meteoro gigante: caem à frente de quem corre */
  private spawnCourseRock(): void {
    const p = this.pickTarget();
    if (!p) return;
    this.spawnStrike('meteor', 1.6 * this.tele, 32, p.x + 170 + this.rng() * 150);
  }

  spawnStrike(kind: Strike['kind'], T: number, r: number, x?: number): Strike | null {
    const s = this.strikes.find((o) => !o.on);
    if (!s) return null;
    const w = this.world;
    if (x === undefined) x = 40 + this.rng() * (w.W - 80);
    if (kind !== 'ball' && kind !== 'gust') x = Math.max(20, Math.min(w.W - 20, x));
    s.on = true;
    s.kind = kind;
    s.x = x;
    s.ty = w.topAt(x);
    s.T = s.t = T;
    s.r = r;
    s.flash = 0;
    s.vx = 0;
    s.live = false;
    s.soft = false;
    if (kind === 'bomb') {
      s.sx = w.W * 0.86;
      s.sy = -340;
    } else if (kind === 'drop') {
      s.sx = x;
      s.sy = s.ty - 600;
    } else {
      s.sx = x - 260;
      s.sy = s.ty - 700;
    }
    return s;
  }

  endMover(s: Strike): void {
    s.flash = 0.25;
    this.draw.particles.burst(s.x, s.ty, 10, s.kind === 'ball' ? 'puff' : 'debris', 220);
    if (Math.abs(s.x - this.me.x) < 400) audio.crack();
  }

  /** destroço horizontal parado pela parede de uma casa inteira */
  blockedByHouse(x: number, y: number): boolean {
    const w = this.world;
    for (const h of w.houses) {
      if (h.ripped || y < h.top - 4 || y > GROUND_Y) continue;
      const a = w.bodies[h.wallL];
      const b = w.bodies[h.wallR];
      if (a.alive && !a.tip && x > a.x && x < a.x + a.w) return true;
      if (b.alive && !b.tip && x > b.x && x < b.x + b.w) return true;
    }
    return false;
  }

  private impactStrike(s: Strike): void {
    const w = this.world;
    s.ty = w.topAt(s.x);
    s.flash = s.kind === 'bolt' ? 0.22 : 0.3;
    if (s.kind !== 'drop')
      for (const b of w.bodies) {
        if (!b.alive || (s.kind === 'rock' && b.heavy)) continue;
        const dx = b.x + b.w * 0.5 - s.x;
        if (Math.abs(dx) < s.r + b.w * 0.5 + 10 && b.y < s.ty + 60) w.push(b, Math.sign(dx || 1) * (b.heavy ? 90 : 180), b.heavy ? -60 : -260);
      }
    for (const p of this.players) {
      if (!p.alive || p.shield > 0) continue;
      const dx = Math.abs(p.x - s.x);
      if (s.kind === 'bolt') {
        if (dx < s.r && p.y <= s.ty + 4) this.knockOut(p, 0, 'bolt');
        // raio na água: quem está nadando perto leva choque
        else if (p.swim && dx < 70 && this.active.has('raios') && this.surfaceAt(s.x) < s.ty - 2) this.knockOut(p, 0, 'shock');
      } else if (dx < s.r * 0.85 && Math.abs(p.y - s.ty) < s.r + 10 && !this.finale) this.knockOut(p, Math.sign(p.x - s.x), 'strike:' + s.kind);
      else if (dx < s.r * 0.85 && Math.abs(p.y - s.ty) < s.r + 10) {
        // final: meteorito pequeno derruba para trás (atrasa), não elimina
        p.vx = -260;
        p.vy = -300;
        p.sq = 0.4;
      }
      else if (dx < s.r * 1.7 && Math.abs(p.y - s.ty) < s.r + 20 && s.kind !== 'drop') {
        p.vx += Math.sign(p.x - s.x || 1) * 240;
        p.vy = Math.min(p.vy, -160);
      }
    }
    const wet = this.surfaceAt(s.x) < s.ty - 2;
    // respingo: na água forte; em gosma/lava/neve bem menor (não vira uma "onda" que engole quem está na beira)
    if (wet && s.kind !== 'drop') this.splash(s.x, s.r, this.fluid?.kind === 'water' ? 520 : 160);
    // meteoros e bombas deixam fogo no chão seco (granizo, doces, melancias, pianos e estrelas não)
    const sk = s.kind === 'meteor' ? this.tn.strike : undefined;
    if (sk === 'piano' && !wet && s.ty >= GROUND_Y - 4) this.world.addProp(s.x - 22, GROUND_Y - 30, 44, 30, 'crate', '#2c2c44', '#121222', 1);
    if (sk === 'melon') this.draw.particles.burst(s.x, s.ty - 6, 14, 'juice', 260);
    if (sk === 'candy') this.draw.particles.burst(s.x, s.ty - 6, 12, 'candy', 280);
    if (sk === 'hail') this.draw.particles.burst(s.x, s.ty - 4, 8, 'spark', 200);
    if (sk === 'star') this.draw.particles.burst(s.x, s.ty - 6, 14, 'spark', 300);
    if ((s.kind === 'meteor' && (!sk || sk === 'meteor')) || s.kind === 'bomb') if (!wet && !this.finale && s.ty >= GROUND_Y - 4) {
      const fi = this.fires.find((o) => !o.on) ?? this.fires[0];
      fi.on = true;
      fi.x = s.x;
      fi.y = s.ty;
      fi.r = s.r * 0.7;
      fi.t = 2 + 1.2 * this.I;
    }
    const pk = s.kind === 'meteor' || s.kind === 'bomb' ? 'fire' : s.kind === 'bolt' ? 'spark' : s.kind === 'drop' ? 'goo' : 'dust';
    this.draw.particles.burst(s.x, s.ty - 6, s.kind === 'rock' || s.kind === 'drop' ? 10 : 18, pk, 300);
    if (s.kind !== 'rock' && s.kind !== 'drop' && this.q.shake) this.shake = Math.max(this.shake, 0.4);
    if (Math.abs(s.x - this.me.x) < 400) {
      audio.crack();
      if (s.kind !== 'rock' && s.kind !== 'drop') tap('medium');
    }
  }

  /** um tornado: escolhe um jogador para perseguir, vira com inércia, arranca telhados e arremessa destroços */
  private twister(tw: Twister, dt: number, k: number): void {
    if (!tw.on) return;
    const w = this.world;
    const I = this.I;
    tw.tgtT -= dt;
    if (tw.tgtT <= 0 || tw.tgt < 0 || !this.players[tw.tgt]?.alive) {
      tw.tgtT = 3 + this.rng() * 3;
      const p = this.pickTarget();
      tw.tgt = p ? this.players.indexOf(p) : -1;
    }
    const tp = tw.tgt >= 0 ? this.players[tw.tgt] : null;
    const max = (40 + 24 * I) * (1 + 0.25 * this.heat) * (this.training ? 0.75 : 1);
    // às vezes vaga até um ponto qualquer (não fica colado em ninguém)
    if (tw.tgtT > 2.5 && this.rng() < dt * 0.4) tw.tgt = -1;
    const want = tp ? Math.sign(tp.x - tw.x) * max : Math.sign((tw.x < this.world.W / 2 ? 1 : -1) || 1) * max;
    tw.vx += Math.max(-1, Math.min(1, want - tw.vx)) * Math.min(Math.abs(want - tw.vx), 70 * dt);
    tw.x += tw.vx * dt;
    if (tw.x < 60) tw.vx = Math.abs(tw.vx);
    if (tw.x > w.W - 60) tw.vx = -Math.abs(tw.vx);
    if (this.q.shake) this.shake = Math.max(this.shake, 0.12);
    // telhados: passou por cima de uma casa por um tempo → arranca (a casa deixa de ser abrigo)
    for (let i = 0; i < w.houses.length; i++) {
      const h = w.houses[i];
      if (h.ripped) continue;
      if (Math.abs(h.x + h.w / 2 - tw.x) < h.w / 2 + tw.r * 0.3) {
        this.ripCD[i] = (this.ripCD[i] || 0) + dt * I;
        if (this.ripCD[i] > 2.2) this.ripRoof(i, tw.vx);
      }
    }
    for (const b of w.bodies) {
      if (!b.alive) continue;
      const cx = b.x + b.w * 0.5;
      const d = cx - tw.x;
      if (Math.abs(d) < tw.r + b.w * 0.5) {
        if (!b.awake && (b.kind === 'wall' || b.kind === 'slab' || b.kind === 'block' || b.kind === 'ladder')) continue;
        if (!b.awake && b.kind !== 'crate' && b.kind !== 'roof' && this.rng() > dt * 3) continue;
        w.wake(b);
        b.vy -= (b.heavy ? 1700 : 2600) * dt;
        b.vx += (-d * 4 + tw.vx * 2) * dt + (b.y < -320 ? Math.sign(d || 1) * 900 * dt : 0);
        b.va += 3 * dt;
        if (b.vy < -380) b.vy = -380;
      }
    }
    // destroços arremessados na direção de quem está perto (aviso: linha na altura)
    const key = 'tornado';
    if (tw === this.tornado2) return;
    this.tick(
      key,
      dt * k,
      () => {
        const p = this.pickTarget();
        if (!p || Math.abs(p.x - tw.x) > 460 || !p.onGround) return;
        const dir = Math.sign(p.x - tw.x) || 1;
        const s = this.spawnStrike('gust', 1.25 * this.tele, 13, tw.x + dir * tw.r * 0.6);
        if (!s) return;
        s.vx = dir * (250 + 60 * I);
        s.ty = p.y - 12 - (p.onGround ? 0 : 10);
      },
      5.5 - 1.5 * this.heat,
    );
  }

  private ripGrace = 0;
  private ripX0 = 0;
  private ripX1 = 0;

  /** o tornado arranca o telhado (laje + telhado voam): a casa deixa de ser abrigo */
  ripRoof(i: number, vx: number): void {
    const w = this.world;
    const h = w.houses[i];
    h.ripped = true;
    // quem estava dentro ganha um instante para correr (o tornado "quica" no telhado)
    this.ripGrace = 1.6;
    this.ripX0 = h.x - 10;
    this.ripX1 = h.x + h.w + 10;
    for (const tw of [this.tornado, this.tornado2]) if (tw.on && Math.abs(tw.x - (h.x + h.w / 2)) < h.w) {
      tw.vx = -tw.vx * 0.6;
      tw.tgtT = 0.8;
      tw.tgt = -1;
    }
    for (const b of w.bodies) {
      if (!b.alive || b.x + b.w < h.x - 8 || b.x > h.x + h.w + 8 || b.y + b.h > h.top + 4) continue;
      if (b.kind !== 'slab' && b.kind !== 'roof' && b.kind !== 'crate' && b.kind !== 'wall') continue;
      if (b.kind === 'wall' && b.y + b.h > GROUND_Y - 4) continue;
      w.wake(b);
      b.vy = -520 - this.rng() * 260;
      b.vx = Math.sign(vx || 1) * (120 + this.rng() * 200);
      b.va += (this.rng() - 0.5) * 6;
    }
    this.draw.particles.burst(h.x + h.w / 2, h.top - 10, 14, 'debris', 380);
    if (Math.abs(h.x - this.me.x) < 600) {
      audio.crack();
      tap('medium');
      if (this.me.alive && this.world.insideHouse(this.me.x, this.me.y) === false && Math.abs(this.me.x - h.x - h.w / 2) < h.w) this.hud.toast(t('dz.al.roof', 'O tornado arrancou o telhado! Corra!'));
    }
  }

  /** areia: rajadas alternando de lado (avisadas), empurram e trazem destroços na horizontal */
  private sandstorm(dt: number, k: number): void {
    const g = this.gust;
    const I = this.I;
    if (g.t > 0) {
      g.t -= dt;
      g.vis = Math.min(0.55, g.vis + dt * 0.6);
      this.tick(
        'areia',
        dt * k,
        () => {
          const w = this.world;
          const p = this.pickTarget();
          const hs = [GROUND_Y - 12, GROUND_Y - 52, GROUND_Y - 100];
          const y = p && this.rng() < 0.85 ? p.y - 12 : hs[Math.floor(this.rng() * 3)];
          // nasce a uns 520 do alvo (casas no caminho bloqueiam, mas não todas)
          const sx = p ? p.x - g.dir * 520 : g.dir > 0 ? -40 : w.W + 40;
          const s = this.spawnStrike('gust', 0.75 * this.tele, 13, Math.max(-40, Math.min(w.W + 40, sx)));
          if (!s) return;
          s.vx = g.dir * (360 + 80 * I);
          s.ty = y;
        },
        0.45 - 0.15 * this.heat,
      );
      if (g.t <= 0) {
        g.dir = -g.dir;
        g.next = Math.max(3, 7 - 1.4 * I) + this.rng() * 2;
        g.warn = 0;
      }
      return;
    }
    g.next -= dt;
    if (!g.warn && g.next <= 1.8 * this.tele) {
      g.warn = 1;
      this.alert('areia', g.dir > 0 ? -1 : 1, 1.8 * this.tele, t('dz.al.gust', 'Rajada!'));
    }
    if (g.next <= 0) {
      g.t = 3 + 1.2 * I;
      this.timers.areia = 0.2;
    }
  }

  /** rachaduras do terremoto: avisam piscando, abrem buracos no chão e fecham depois */
  private crack(n: number): void {
    for (let i = 0; i < n; i++) {
      const p = this.rng() < 0.75 ? this.pickTarget() : null;
      const x = p && p.y > -6 ? p.x + (this.rng() - 0.5) * 40 : 60 + this.rng() * (this.world.W - 120);
      this.hole(x, 60 + this.rng() * 40 * this.I, 1.7 * this.tele, 4.5 + 2 * this.I, 0);
    }
  }

  /** sumidouro: um buraco que cresce (nunca fecha); sempre sobra chão firme */
  private sink(): void {
    const w = this.world;
    let cov = 0;
    for (const h of w.holes) if (h.on) cov += h.w;
    if (cov > w.W * 0.42) return;
    // prefere quem está parado (pickTarget pesa o tempo parado)
    // no alto também: o buraco abre embaixo do prédio e ele afunda junto
    const p = this.pickTarget();
    const x = p ? p.x + (this.rng() - 0.5) * 30 : 60 + this.rng() * (w.W - 120);
    this.hole(x, 40, 2 * this.tele, 0, 3 + 3 * this.I);
  }

  hole(cx: number, wd: number, warn: number, life: number, grow: number): void {
    const w = this.world;
    const h = w.holes.find((o) => !o.on);
    if (!h) return;
    h.on = true;
    h.w = wd;
    h.x = Math.max(30, Math.min(w.W - 30 - wd, cx - wd / 2));
    h.warn = h.warnT = warn;
    h.open = 0;
    h.life = life;
    h.grow = grow;
  }

  private updateHoles(dt: number): void {
    const w = this.world;
    let cov = 0;
    for (const h of w.holes) if (h.on) cov += h.w;
    for (const h of w.holes) {
      if (!h.on) continue;
      if (h.warn > 0) {
        h.warn -= dt;
        if (this.rng() < dt * 6 * this.q.particleBudget) this.draw.particles.spray(h.x + this.rng() * h.w, GROUND_Y - 2, 1, 'dust', 0, -60, 0.5);
        if (h.warn <= 0) {
          this.draw.particles.burst(h.x + h.w / 2, GROUND_Y - 4, 14, 'dust', 260);
          if (this.q.shake) this.shake = Math.max(this.shake, 0.35);
          if (Math.abs(h.x - this.me.x) < 500) audio.crack();
          this.wakeOver(h.x, h.w);
        }
        continue;
      }
      h.open += dt;
      if (h.grow > 0 && cov < w.W * 0.5 && h.w < 190) {
        const g = h.grow * dt;
        h.x = Math.max(20, h.x - g / 2);
        h.w += g;
        if (((h.open * 4) | 0) !== (((h.open - dt) * 4) | 0)) this.wakeOver(h.x, h.w);
      }
      if (h.life > 0 && h.open > h.life) h.on = false;
    }
    // o que caiu no buraco some
    for (const b of w.bodies) if (b.alive && b.y > 40) b.alive = false;
  }

  /** acorda o que está apoiado no chão em cima de um buraco (cai junto) */
  private wakeOver(x: number, wd: number): void {
    const w = this.world;
    for (const b of w.bodies) {
      if (!b.alive || b.x + b.w * 0.5 < x || b.x + b.w * 0.5 > x + wd) continue;
      if (b.h > b.w * 1.5) w.push(b, (this.rng() < 0.5 ? -1 : 1) * 120, 0);
      else w.wake(b);
    }
  }

  /** plataformas e copas cedem: tremem (aviso) e caem se alguém fica muito tempo em cima; algumas sozinhas */
  private updatePlatforms(dt: number): void {
    const w = this.world;
    const on = this.phase === 'disaster' || (this.finale && this.phase === 'prepare' && this.phaseT > 3);
    for (let i = 0; i < w.solids.length; i++) {
      const s = w.solids[i];
      if (!s.oneWay) continue;
      if (s.gone) {
        s.fallY = (s.fallY ?? 0) + dt * 320;
        continue;
      }
      if (!on) continue;
      if (s.crumble && s.crumble > 0) {
        s.crumble -= dt;
        if (s.crumble <= 0) {
          s.gone = true;
          s.fallY = 0;
          this.draw.particles.burst(s.x + s.w / 2, s.y, 10, 'debris', 200);
          if (Math.abs(s.x - this.me.x) < 500) audio.crack();
        }
        continue;
      }
      let stood = false;
      for (const p of this.players) if (p.alive && p.onSolid === i) stood = true;
      if (stood) s.stood = (s.stood ?? 0) + dt;
      else if (s.stood) s.stood = Math.max(0, s.stood - dt * 0.5);
      // fluido que mata ao encostar: dá mais tempo em cima (cair = eliminado)
      const deadly = this.fluid && this.fluid.kind !== 'water' ? 2.5 : 1;
      const lim = ((s.kind === 'leaf' ? 4.5 : 5.5) * deadly) / Math.sqrt(this.I) + (this.training ? 3 : 0);
      if ((s.stood ?? 0) > lim || (!this.finale && this.rng() < dt * 0.012 * this.I * this.heat)) s.crumble = (this.finale ? 1.8 : 1.3) * this.tele;
    }
  }

  /** moeda num lugar arriscado: perto de um golpe marcado, no alto, ou no chão alagado */
  private spawnCoin(): void {
    const c = this.coins.find((o) => !o.on);
    if (!c) return;
    const w = this.world;
    let x = 60 + this.rng() * (w.W - 120);
    const r = this.rng();
    if (r < 0.45) {
      const s = this.strikes.find((o) => o.on && o.flash <= 0 && o.kind !== 'gust' && o.kind !== 'ball');
      if (s) x = s.x + (this.rng() - 0.5) * s.r;
    }
    let y = w.topAt(x) - 22;
    const sf = this.surfaceAt(x);
    if (sf < y + 22) y = Math.min(y, sf - 30);
    c.on = true;
    c.x = x;
    c.y = y;
    c.t = 7;
  }

  /* ------------------------------ jogadores ------------------------------ */

  private movePlayer(p: Player, dt: number): void {
    const w = this.world;
    const inp = p.input;
    const frozen = this.phase === 'intro' && this.phaseT < 0.6;
    const dir = frozen ? 0 : (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
    const acc = (p.onGround ? 2000 : 1200) * (p.onGround ? Math.max(0.35, this.ex.slipK()) : 1);
    if (dir) {
      p.vx += dir * acc * dt;
      const max = p.bot && !p.self ? RUN * (0.7 + p.bot.skill * 0.3) : RUN;
      if (p.vx > max) p.vx = max;
      if (p.vx < -max) p.vx = -max;
      p.face = dir;
    } else {
      const fr = p.onGround ? 14 * this.ex.slipK() : 3;
      p.vx -= p.vx * Math.min(1, fr * dt);
    }
    this.ex.force(p, dt);
    if (this.wind && this.phase === 'disaster') p.vx += this.wind * dt * (p.onGround ? 0.6 : 1.4);
    // tornados puxam quem está ao ar livre (casa com telhado protege); perto do funil, levanta
    if (this.tornado.on || this.tornado2.on) {
      const inside = w.insideHouse(p.x, p.y);
      for (const tw of [this.tornado, this.tornado2]) {
        if (!tw.on || inside) continue;
        const d = tw.x - p.x;
        const ad = Math.abs(d);
        if (ad < 320) p.vx += Math.sign(d) * (130 + 90 * this.I) * (1 - ad / 320) * dt * (p.onGround ? 1 : 1.5);
        if (ad < tw.r * 0.8) p.vy -= 1500 * dt;
      }
    }
    // rajada de areia: empurra para o lado (dentro de casa não)
    if (this.gust.t > 0 && this.phase === 'disaster' && !w.insideHouse(p.x, p.y)) p.vx += this.gust.dir * (380 + 160 * this.I) * dt * (p.onGround ? 0.6 : 1);
    // nadando: devagar, levado pela correnteza
    const wf = this.fluid && this.fluid.kind === 'water' && this.sim ? this.sim.surf(p.x) : 9999;
    const depth = p.y - wf;
    if (!p.swim && depth > 18 && !p.climbing) {
      p.swim = true;
      if (p.self && !this.swimTold) {
        this.swimTold = true;
        this.hud.toast(t('dz.swim', 'Nade! Pule para sair da água.'), 'dz-swim');
      }
    } else if (p.swim && (depth < 4 || p.climbing)) p.swim = false;
    if (p.swim) {
      const cap = RUN * (this.tn.fluid === 'choco' ? 0.42 : this.tn.fluid === 'jelly' ? 0.7 : 0.6);
      if (p.vx > cap) p.vx = cap;
      if (p.vx < -cap) p.vx = -cap;
      p.x += (this.sim ? this.sim.flow(p.x) : 0) * 0.45 * dt;
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
    // pulo: borda de toque (inp.tap) OU borda do nível (teclado/bots). Antes só a borda do nível
    // contava: se o "soltar" do dedo se perdia (multitoque/pausa), jumpHeld ficava preso em true e
    // o Bloop nunca mais pulava.
    const pressed = !frozen && (inp.tap || (inp.j && !p.jumpHeld));
    p.jumpHeld = inp.j;
    inp.tap = false;
    // escada: no chão, PULAR pula (antes virava "subir escada" a 170/s — parecia que o pulo falhava);
    // sobe com o joystick para cima, ou segurando pular quando já está no ar encostado na escada
    const wantClimb = onLadder && !frozen && (inp.climb || (inp.u && !p.onGround && !pressed) || (p.climbing && inp.u));
    if (wantClimb) {
      p.climbing = true;
      p.vy = -170;
    } else if (p.climbing && !onLadder) {
      p.climbing = false;
      if (inp.u || inp.climb) p.vy = -360; // pulinho no topo
    } else if (p.climbing) p.climbing = false;

    // coyote time (100 ms) e buffer de pulo (120 ms)
    if (p.onGround) {
      p.coyote = COYOTE;
      p.jumps = 0;
    } else p.coyote -= dt;
    if (pressed) p.jbuf = JUMP_BUFFER;
    else if (p.jbuf > 0) p.jbuf -= dt;
    if (p.jhold > 0) p.jhold -= dt;
    if (p.swim && pressed && depth < 30) {
      // pulo para fora d'água (alcança a beirada mais próxima)
      p.vy = -JUMP * 0.82;
      p.swim = false;
      p.jhold = MIN_HOLD;
      p.jbuf = 0;
      if (p.self) audio.jump();
    } else if ((pressed || (p.jbuf > 0 && p.coyote > 0)) && !frozen) {
      if (p.coyote > 0 || p.climbing) {
        p.vy = -JUMP;
        p.coyote = 0;
        p.jbuf = 0;
        p.jumps = 1;
        p.jhold = MIN_HOLD;
        p.climbing = false;
        p.onGround = false;
        p.sq = -0.35;
        if (this.draw.particles && p.self) this.draw.particles.burst(p.x, p.y, 3, 'puff', 50);
        if (p.self) audio.jump();
      } else if (pressed && p.jumps < p.maxJumps && p.maxJumps > 1) {
        p.vy = -JUMP * 0.9;
        p.jumps++;
        p.jbuf = 0;
        p.jhold = MIN_HOLD;
        p.sq = -0.3;
        this.draw.particles.burst(p.x, p.y, 6, 'puff', 80);
        if (p.self) audio.jump(2);
      }
    }
    // integração exata para aceleração constante (posição pela média da velocidade):
    // a altura do pulo não depende do tamanho do passo (30, 60 ou 120 Hz pulam igual).
    // Altura variável: soltar cedo corta o pulo, mas um toque rápido ainda dá um pulo útil (MIN_HOLD).
    const vy0 = p.vy;
    const held = inp.j || p.jhold > 0;
    if (p.swim) p.vy += (-(depth - 12) * 26 - p.vy * 3.2) * dt;
    else if (!p.climbing) {
      const gk = this.ex.gravK(p);
      p.vy += GRAV * gk * dt * (gk < 0 ? 1 : p.vy < 0 && !held ? 1.55 : p.vy > 0 ? 1.12 : 1);
    }
    if (p.vy > 900) p.vy = 900;

    // carregado pelo corpo onde está em pé
    if (p.stand >= 0) {
      const b = w.bodies[p.stand];
      if (b && b.alive && b.awake) {
        p.x += b.vx * dt;
      }
    }
    const prevY = p.y;
    const prevX = p.x;
    p.x += p.vx * dt;
    p.y += (vy0 + p.vy) * 0.5 * dt;
    const wasGround = p.onGround;
    p.onGround = false;
    p.stand = -1;
    p.onSolid = -1;

    // sólidos (plataforma que cedeu e chão sobre buraco aberto não seguram)
    for (let si = 0; si < w.solids.length; si++) {
      const s = w.solids[si];
      if (p.x + 9 <= s.x || p.x - 9 >= s.x + s.w) continue;
      if (s.gone) continue;
      if (s.kind === 'ground' && w.inHole(p.x, 6)) continue;
      if (s.oneWay) {
        if (p.vy >= 0 && prevY <= s.y + 1 && p.y >= s.y) {
          p.y = s.y;
          p.onSolid = si;
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
        // lateral: decide o lado pela posição ANTERIOR (o centro do sólido erra em blocos largos)
        p.x = prevX <= s.x + s.w * 0.5 ? s.x - 9 : s.x + s.w + 9;
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
    // chão com tolerância: andando sobre degraus/caixas que tremem (terremoto, corpos assentando),
    // o pé não "descola" por 1–2 px — senão o pulo falhava por estar tecnicamente no ar
    if (!p.onGround && !p.climbing && wasGround && p.vy >= 0) {
      let best = 9999;
      for (const ox of [-7, 0, 7]) {
        const sy = w.surfaceBelow(p.x + ox, p.y - 3);
        if (sy < best) best = sy;
      }
      if (best - p.y <= 7) {
        p.y = best;
        this.landP(p, true);
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
    // tempo parado (golpes miram mais em quem não se mexe)
    if (Math.abs(p.vx) < 30 && (p.onGround || p.swim)) p.idle += dt;
    else p.idle = Math.max(0, p.idle - dt * 2);
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

  /** segundos de fôlego nadando nesta intensidade */
  airTime(): number {
    return 6 / this.I + (this.training ? 4 : 0);
  }

  private checkHazards(p: Player, dt: number): void {
    if (!p.alive || p.safe) return;
    if (this.phase === 'end') return;
    const w = this.world;
    if (p.shield > 0) {
      p.shield -= dt;
      return;
    }
    if (p.hit > 0) p.hit -= dt;
    // água: nada com fôlego (não elimina na hora); lava, gosma e neve eliminam ao encostar
    if (p.swim) {
      p.air -= (dt / this.airTime()) * (this.sim && p.y - 26 > this.sim.surf(p.x) ? 2.2 : 1) * (this.tn.fluid === 'choco' ? 1.35 : this.tn.fluid === 'bubble' ? 0.6 : 1);
      if (p.air <= 0) {
        this.knockOut(p, 0, 'air');
        return;
      }
    } else if (p.air < 1 && (p.onGround || p.climbing)) p.air = Math.min(1, p.air + dt * 0.45);
    // fluido parado ainda rasinho (< 12): só "molha o pé" — dá tempo de subir depois do alerta
    if (this.fluid && this.fluid.kind !== 'water' && (this.fluid.dir !== 0 || this.fluid.level > 12)) {
      const s = this.surfaceAt(p.x);
      if (p.y > s + 3) {
        this.splash(p.x, 22, Math.max(260, p.vy));
        this.knockOut(p, this.fluid.dir, 'fluid');
        return;
      }
    }
    // caiu num buraco do chão
    if (p.y > 34 && w.inHole(p.x)) {
      this.knockOut(p, 0, 'hole');
      return;
    }
    // fogo no chão: encostar um instante elimina
    let burning = false;
    for (const fi of this.fires) if (fi.on && Math.abs(p.x - fi.x) < fi.r && Math.abs(p.y - fi.y) < 8) burning = true;
    if (burning) {
      p.burn += dt;
      if (p.burn > 0.45) {
        this.knockOut(p, 0, 'fire');
        return;
      }
    } else p.burn = 0;
    // bolas de neve e destroços voando na horizontal
    for (const s of this.strikes) {
      if (!s.on || !s.live || s.flash > 0) continue;
      if (s.kind === 'ball') {
        if (Math.abs(p.x - s.x) < s.r + 6 && p.y > s.ty - s.r + 6 && p.y < s.ty + s.r + 30) {
          this.knockOut(p, Math.sign(s.vx), 'ball');
          return;
        }
      } else if (s.kind === 'gust') {
        if (Math.abs(p.x - s.x) < s.r + 8 && Math.abs(p.y - 12 - s.ty) < s.r + 10) {
          this.endMover(s);
          if (p.swim) p.air -= 0.4;
          else if (s.soft) {
            p.vx = Math.sign(s.vx) * 320;
            p.vy = Math.min(p.vy, -220);
            p.sq = 0.4;
          } else {
            this.knockOut(p, Math.sign(s.vx), 'debris');
            return;
          }
        }
      }
    }
    // destroço rápido de lado (onda, tornado, tremor): empurra; pesado e muito rápido elimina; nadando tira fôlego
    if (p.hit <= 0)
      for (const b of w.bodies) {
        if (!b.alive || !b.awake || Math.abs(b.vx) < 220) continue;
        if (p.x + 9 < b.x || p.x - 9 > b.x + b.w || p.y < b.y || p.y - 24 > b.y + b.h) continue;
        p.hit = 0.6;
        if (b.heavy && Math.abs(b.vx) > 420 && b.w * b.h > 600 && !p.swim) {
          this.knockOut(p, Math.sign(b.vx), 'side');
          return;
        }
        p.vx = Math.sign(b.vx) * 320;
        p.vy = Math.min(p.vy, -200);
        if (p.swim) p.air -= 0.3;
        if (p.self) {
          audio.crack();
          tap('medium');
        }
        break;
      }
    // algo caindo em cima: só o que é pesado e rápido derruba; caixas e pedacinhos dão um "tum" e empurram
    if (p.bonk > 0) p.bonk -= dt;
    const roofed = (this.tornado.on || this.active.has('meteoros')) && w.insideHouse(p.x, p.y);
    for (const b of w.bodies) {
      if (roofed) break; // dentro de casa inteira: o teto segura o que cai
      if (!b.alive || !b.awake || b.vy < 170) continue;
      if (p.x + 7 < b.x || p.x - 7 > b.x + b.w) continue;
      const top = p.y - 22;
      if (b.y + b.h > top && b.y + b.h < p.y - 4) {
        if (b.heavy && b.vy > 380 && b.w * b.h > 900 && b.kind !== 'roof' && b.kind !== 'slab') {
          this.knockOut(p, 0, 'fall');
          return;
        }
        if (p.bonk <= 0) {
          p.bonk = 0.5;
          const side = p.x < b.x + b.w / 2 ? -1 : 1;
          p.vx = side * 260;
          p.vy = Math.min(p.vy, -140);
          p.sq = 0.4;
          b.vy *= -0.3;
          if (p.self) {
            audio.crack();
            tap('medium');
          }
        }
      }
    }
    // tornado
    if (this.ripGrace > 0 && p.x > this.ripX0 && p.x < this.ripX1) return;
    for (const tn of [this.tornado, this.tornado2]) if (tn.on && Math.abs(p.x - tn.x) < tn.r * 0.36 && !w.insideHouse(p.x, p.y)) this.knockOut(p, Math.sign(tn.vx), 'tornado');
  }

  knockOut(p: Player, dir: number, why = ''): void {
    if (!p.alive) return;
    p.why = why + (this.benchStreak === -2 ? ' y' + Math.round(p.y / 20) * 20 + ' lv' + Math.round(this.fluid?.level ?? 0) + ' s' + Math.round(this.surfaceAt(p.x)) + (p.swim ? ' swim' : '') + (p.onGround ? ' g' : '') : '');
    p.alive = false;
    p.ghost = true;
    p.gx = p.x;
    p.gy = p.y - 14;
    p.ghostT = 0;
    p.vx = dir * 60;
    p.vy = -80;
    this.outCount++;
    p.outOrder = this.outCount;
    p.outT = this.phase === 'disaster' || this.phase === 'impact' ? this.phaseT : 0;
    p.swim = false;
    // bolha de resgate (uma vez por rodada): um amigo vivo que encostar traz de volta
    if (!this.finale && !p.rescued && (this.phase === 'disaster' || this.phase === 'warn')) {
      p.bubble = 10;
      p.bx = Math.max(20, Math.min(this.world.W - 20, p.x));
      p.by = Math.min(p.y - 16, this.surfaceAt(p.x) - 18, GROUND_Y - 16);
    }
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
      if (i.j) p.vy -= 500 * dt;
      else p.vy += (p.y - 110 - p.gy) * 1.2 * dt;
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
      inp.l = inp.r = inp.j = inp.u = inp.climb = false;
      return;
    }
    // o desastre aparece no título do cenário: quem presta atenção já se prepara certo
    const known = this.phase === 'disaster' || this.phase === 'warn' || (this.phase === 'prepare' && (p.self || b.skill > 0.6)) ? this.sc.disasters[this.dIndex] : null;
    // o lugar onde está começou a ceder/rachar: replaneja já (bots atentos)
    if (p.onSolid >= 0 && (w.solids[p.onSolid].crumble ?? 0) > 0 && this.rng() < b.skill) b.think = Math.min(b.think, 0);
    if (b.think <= 0) {
      b.think = 0.35 + (1 - b.skill) * 0.5 + this.rng() * 0.2;
      this.plan(p, known);
    }
    const rx = this.phase === 'disaster' ? this.ex.react(p) : null;
    // fugir de marcadores
    let flee = 0;
    const high = !!this.fluid && p.y < -20; // no alto com fluido subindo: só um passinho
    for (const s of this.strikes) {
      if (!s.on || s.flash > 0) continue;
      const d = p.x - s.x;
      if (Math.abs(d) < s.r + (high ? 12 : 26) && this.rng() < b.skill + 0.25) flee = this.finale ? 1 : d >= 0 ? 1 : -1;
    }
    // buraco avisando/aberto ou fogo embaixo: sai de lado
    if (!flee && p.y > -6) {
      for (const h of w.holes) if (h.on && p.x > h.x - 30 && p.x < h.x + h.w + 30 && this.rng() < b.skill + 0.3) flee = p.x - h.x < h.w / 2 ? -1 : 1;
      for (const fi of this.fires) if (fi.on && Math.abs(p.x - fi.x) < fi.r + 16) flee = p.x < fi.x ? -1 : 1;
    }
    // tornado perto e sem abrigo: corre para longe
    for (const tw of [this.tornado, this.tornado2]) if (tw.on && Math.abs(tw.x - p.x) < 230 && !w.insideHouse(p.x, p.y) && this.rng() < b.skill + 0.2) flee = p.x < tw.x ? -1 : 1;
    if (rx?.flee) flee = rx.flee;
    let tx = b.gx;
    if (flee) tx = p.x + flee * (high ? 36 : 80);
    const dx = tx - p.x;
    inp.l = dx < -6;
    inp.r = dx > 6;
    // subir
    const wantUp = b.gy < p.y - 14;
    inp.u = wantUp && p.climbing;
    inp.climb = inp.u;
    let jump = false;
    if (wantUp) {
      // escada próxima?
      for (const l of w.ladders) {
        const lb = l.body >= 0 ? w.bodies[l.body] : null;
        const lx = lb ? lb.x : l.x;
        if (lb && (lb.awake || lb.tip || !lb.alive)) continue;
        if (Math.abs(p.x - (lx + 8)) < 14 && p.y > (lb ? lb.y : l.top)) {
          inp.u = inp.climb = true;
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
    // bola de neve / destroço vindo na minha direção na minha altura: pula
    for (const s of this.strikes) {
      if (!s.on || s.flash > 0 || (s.kind !== 'ball' && s.kind !== 'gust') || !p.onGround) continue;
      const ahead = (p.x - s.x) * Math.sign(s.vx || 1);
      const lead = s.live ? 50 + Math.abs(s.vx) * 0.18 : 0;
      if (ahead > 0 && ahead < lead && Math.abs(p.y - 12 - (s.kind === 'ball' ? s.ty : s.ty)) < 34 && this.rng() < 0.35 + b.skill * 0.6) jump = true;
    }
    if (rx?.jump && p.onGround) jump = true;
    if (rx?.noJump) {
      jump = false;
      inp.u = inp.climb = false;
    }
    // nadando: tenta sair pulando quando há algo alcançável
    if (p.swim && this.rng() < 0.2 + b.skill * 0.5) jump = true;
    // lê a superfície de verdade (ondas/respingos): água encostando no pé = pulinho para cima
    if (this.fluid && (this.fluid.kind === 'water' || this.fluid.kind === 'snow') && p.onGround && !jump) {
      const s = this.surfaceAt(p.x);
      if (s < 5000 && s - p.y < 16 && this.rng() < 0.3 + b.skill) jump = true;
    }
    b.hop -= dt;
    if (rx?.jump && p.onGround && b.hop > 0.08) b.hop = 0;
    if (rx?.jump && p.onGround && b.hop <= 0) {
      // pulo "de verdade" (alto, segurando) para passar por cima do laser/onda de choque
      inp.tap = true;
      inp.j = true;
      b.hop = 0.45;
    } else if (jump && b.hop <= 0) {
      inp.j = true;
      b.hop = 0.25 + (1 - b.skill) * 0.3;
    } else if (b.hop < 0.12) inp.j = false;
    if (this.finale && p.climbing) inp.u = inp.climb = true;
  }

  /** lugar seguro para o desastre deste cenário (usa o mesmo planejador dos bots, com habilidade máxima) */
  private safeSpot(): { x: number; y: number } | null {
    const me = this.me;
    if (this.finale) {
      const bk = this.world.bunker;
      return bk ? { x: bk.x + 70, y: -10 } : null;
    }
    const d = this.sc.disasters[this.dIndex];
    if (d === 'tornado') {
      let best: { x: number; y: number } | null = null;
      let bd = 1e9;
      for (const h of this.world.houses) {
        const cx = h.x + h.w / 2;
        if (!this.world.insideHouse(cx, -2)) continue;
        const dd = Math.abs(cx - me.x);
        if (dd < bd) {
          bd = dd;
          best = { x: cx, y: -4 };
        }
      }
      return best;
    }
    const tmp: Player = { ...me, bot: { gx: me.x, gy: me.y, think: 0, skill: 1, hop: 0, lazy: 0 } };
    this.plan(tmp, d);
    return { x: tmp.bot!.gx, y: tmp.bot!.gy };
  }

  /** a base desta coluna está corroída/rachando (vai tombar) */
  private shaky(x: number): boolean {
    const w = this.world;
    for (let i = 0; i < this.soak.length; i++) {
      const b = w.bodies[i];
      if (this.soak[i] > 0.45 && b.alive && x > b.x - 6 && x < b.x + b.w + 6) return true;
    }
    return false;
  }

  /** x aleatório em espaço aberto (nada em cima: não cai coisa na cabeça; longe de buracos e fogo) */
  openX(): number {
    const w = this.world;
    for (let i = 0; i < 10; i++) {
      const x = 40 + this.rng() * (w.W - 80);
      if (w.holes.some((h) => h.on && x > h.x - 40 && x < h.x + h.w + 40)) continue;
      if (this.fires.some((f) => f.on && Math.abs(f.x - x) < f.r + 30)) continue;
      if (w.topAt(x) >= GROUND_Y - 2 && !this.strikes.some((s) => s.on && Math.abs(s.x - x) < s.r + 30)) return x;
    }
    return 40 + this.rng() * (w.W - 80);
  }

  plan(p: Player, known: DisasterId | null): void {
    const b = p.bot!;
    const w = this.world;
    if (this.finale) {
      const bk = w.bunker!;
      b.gx = bk.x + 60 + (p.outOrder % 3) * 30 + b.lazy * 80;
      // bots distraídos demoram a sair e às vezes param
      if (this.phaseT < b.lazy * 3.5 || (b.skill < 0.55 && this.rng() < 0.12)) b.gx = p.x;
      b.gy = p.y;
      return;
    }
    if (known && this.ex.handles(known) && this.ex.plan(p, known)) return;
    const shelter = known === 'tornado' || known === 'areia';
    if (shelter && w.insideHouse(p.x, p.y) && (p.self || this.rng() < 0.6 + b.skill * 0.4)) {
      // já está abrigado: fica quietinho
      b.gx = p.x;
      b.gy = p.y;
      return;
    }
    if (shelter && this.rng() < 0.5 + b.skill * 0.5) {
      let best = -1;
      let bd = 1e9;
      for (let i = 0; i < w.houses.length; i++) {
        const h = w.houses[i];
        const d = Math.abs(h.x + h.w / 2 - p.x);
        if (d < bd && w.insideHouse(h.x + h.w / 2, -2)) {
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
    if (known === 'raios' && this.fluid && this.fluid.level > 14) {
      // raios com chão alagado: o lugar seco MAIS BAIXO (o alto atrai raio)
      let bx = p.x;
      let by = p.y;
      let bs = -1e9;
      const tryS = (x0: number, x1: number, top: number) => {
        const cx = Math.max(x0 + 10, Math.min(x1 - 10, p.x));
        if (top > this.surfaceAt(cx) - 10 || top < p.y - 108) return;
        const sc2 = top * 0.8 - Math.abs(cx - p.x) * 0.3 + this.rng() * 40 * (1.3 - b.skill);
        if (sc2 > bs) {
          bs = sc2;
          bx = cx;
          by = top;
        }
      };
      for (const so of w.solids) if (so.oneWay && !so.gone && !so.crumble) tryS(so.x, so.x + so.w, so.y);
      for (const bd of w.bodies) if (bd.alive && !bd.awake && !bd.tip && bd.kind !== 'ladder') tryS(bd.x, bd.x + bd.w, bd.y);
      b.gx = bx;
      b.gy = by;
      return;
    }
    if (known === 'terremoto' || known === 'meteoros' || known === 'raios' || known === 'sumidouro' || known === 'areia') {
      // espaço aberto, longe dos outros
      // espaço aberto de verdade: sem telhado/torre em cima e longe das sombras marcadas
      const covered = w.topAt(b.gx) < GROUND_Y - 2 || w.holes.some((h) => h.on && b.gx > h.x - 30 && b.gx < h.x + h.w + 30);
      // meteoros miram onde você VAI estar: o esperto muda de direção sempre
      const keepMoving = known === 'meteoros' && this.rng() < b.skill * 0.6;
      if (covered || keepMoving || Math.abs(b.gx - p.x) < 10 || this.rng() < 0.15) b.gx = b.skill > 0.5 ? this.openX() : 40 + this.rng() * (w.W - 80);
      b.gy = GROUND_Y;
      return;
    }
    // ir para o alto: melhor superfície alcançável a partir daqui
    const reach = 108;
    // fluido que vai subir: prefere superfícies acima do nível final esperado
    const fluidTop = known && isFluidD(known) ? GROUND_Y - this.fluidPeak(known) : 0;
    const front = this.fluid && this.fluid.kind === 'lava' ? this.fluid.front : 1e9;
    let bestX = p.x;
    let bestY = p.y;
    let bestS = -1e9;
    const consider = (x0: number, x1: number, top: number) => {
      if (top < p.y - reach || top > p.y + 400) return;
      const cx = Math.max(x0 + 10, Math.min(x1 - 10, p.x));
      // já está debaixo d'água (superfície dinâmica, com ondas)
      if (top > this.surfaceAt(cx) - 8) return;
      let s = -top * (0.6 + b.skill) - Math.abs(cx - p.x) * 0.35 + this.rng() * 40 * (1.3 - b.skill);
      if (fluidTop && top < fluidTop - 16) s += 60 * b.skill;
      // torre rachando por baixo / perto da lava que desce: evita
      if (this.shaky(cx)) s -= 160 * b.skill;
      if (cx > front - 260) s -= (cx - (front - 260)) * 0.6 * b.skill;
      if (s > bestS) {
        bestS = s;
        bestX = cx;
        bestY = top;
      }
    };
    for (const s of w.solids) if (s.oneWay && !s.gone && !((s.crumble ?? 0) > 0 && b.skill > 0.5)) consider(s.x, s.x + s.w, s.y);
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

  private ghostIdle = 0;
  private updateCamera(dt: number): void {
    const m = this.me;
    const c = this.cam;
    let fx = m.ghost ? m.gx : m.x;
    let fy = m.ghost ? m.gy : m.y;
    // assistir: fantasminha parado → a câmera segue um amigo online vivo (ou um bot) até você mexer
    if (m.ghost) {
      const i = m.input;
      this.ghostIdle = i.l || i.r || i.j ? 0 : this.ghostIdle + dt;
      if (this.ghostIdle > 1.5) {
        let best = 1e9;
        for (const pr of this.peers)
          if (!pr.s.g && Math.abs((pr.s.x ?? 1e9) - m.gx) < best) {
            best = Math.abs((pr.s.x ?? 0) - m.gx) - 1e6;
            fx = pr.s.x ?? fx;
            fy = pr.s.y ?? fy;
          }
        if (best > 0)
          for (const p of this.players)
            if (p.alive && Math.abs(p.x - m.gx) < best) {
              best = Math.abs(p.x - m.gx);
              fx = p.x;
              fy = p.y;
            }
      }
    } else this.ghostIdle = 0;
    let tx = fx + m.vx * 0.25;
    let ty = fy - c.vh * 0.08;
    const mt = this.meteor;
    if (mt.t >= 0) {
      // câmera de cinema: queda do meteoro, depois acompanha a onda de choque até você
      const d = tx - mt.x;
      if (mt.t < 2.4) {
        tx = mt.x;
        ty = GROUND_Y - c.vh * 0.3;
      } else if (mt.ring >= 0 && mt.ring < Math.abs(d)) tx = mt.x + Math.sign(d) * mt.ring;
    }
    const k = Math.min(1, dt * (mt.t >= 0 && mt.t < 2.4 ? 3 : 5));
    c.x += (tx - c.x) * k;
    c.y += (ty - c.y) * k;
    const half = c.vw / 2;
    const W = this.world.W;
    if (W > c.vw) c.x = Math.max(half - 60, Math.min(W - half + 60, c.x));
    else c.x = W / 2;
    // chão perto da parte de baixo da tela
    // chão perto da parte de baixo da tela (sem metade da tela de terra)
    const maxY = GROUND_Y + 92 - c.vh / 2;
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

  /** sprite de um amigo online: a skin dele, ou o "Meu Bloop" com o avatar que ele mandou */
  peerSprite(pr: PeerState): HTMLCanvasElement {
    const key = pr.skin + ':' + (pr.avatar ? JSON.stringify(pr.avatar).length : 0) + ':' + this.cam.ps;
    const c0 = this.peerSprites.get(pr.id);
    if (c0 && c0.key === key) return c0.c;
    const ps = this.cam.ps;
    const rr = R * ps;
    const size = Math.ceil(rr * 3.2);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d')!;
    x.translate(size / 2, size / 2);
    try {
      if (pr.skin === 'custom' && pr.avatar && typeof pr.avatar === 'object') drawAvatar(x, pr.avatar as AvatarData, rr, this.pose);
      else drawPlayer(x, SKINS.find((s) => s.id === pr.skin && s.id !== 'custom') ?? SKINS[0], rr, this.pose);
    } catch {
      x.fillStyle = '#9fd8ff';
      x.beginPath();
      x.arc(0, 0, rr, 0, Math.PI * 2);
      x.fill();
    }
    if (this.peerSprites.size > 8) this.peerSprites.clear();
    this.peerSprites.set(pr.id, { key, c });
    return c;
  }

  soakOf(i: number): number {
    return i < this.soak.length ? this.soak[i] : 0;
  }

  /* ------------------------------ handle ------------------------------ */

  pause(): void {
    this.paused = true;
    this.releaseInput();
  }
  resume(): void {
    // o hub pode chamar resume com o resumo da sessão aberto: o jogo continua pausado embaixo dele
    if (this.hud.modalOpen()) return;
    this.paused = false;
    this.last = performance.now();
    this.acc = 0;
    this.releaseInput();
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
    this.partyBar?.destroy();
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
    return `#${this.sc.n} · ${this.entry ? this.entry.name() : ''} · ${this.sc.map.name()}`;
  }
  /** perigo do catálogo que roda neste motor (nome/aviso/ícone certos: "Chuva de Pianos", não "Meteoros") */
  hzOf(d: DisasterId): { name: () => string; tele: () => string; icon: string } {
    const e = this.entry;
    if (e) for (const h of e.hz) if (HAZARDS[h].engine === d) return HAZARDS[h];
    const D = DISASTERS[d];
    return { name: D.name, tele: D.hint, icon: d };
  }
  disasterName(d: DisasterId): string {
    return this.hzOf(d).name();
  }
  bodyFalling(b: Body): boolean {
    return b.awake && b.vy > 120;
  }
}
