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
import { DISASTERS, scenarioName, scenarios, mulberry, type DisasterId, type Scenario } from './scenarios';
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

/** modo de dificuldade (escolhido na tela 2D/3D; docs/DISASTER-DESIGN.md §3) */
export type DzMode = 'facil' | 'normal' | 'dificil';
export const MODE_KEY = 'bo-disaster-diff';
export function loadMode(): DzMode {
  try {
    const m = localStorage.getItem(MODE_KEY);
    if (m === 'facil' || m === 'dificil') return m;
  } catch {
    /* */
  }
  return 'normal';
}
export const MODE_MUL: Record<DzMode, number> = { facil: 0.72, normal: 1, dificil: 1.3 };
/** intensidade: modo × (estrelas + sequência) — a mesma régua no 2D e no 3D */
export function intensityOf(mode: DzMode, stars: number, streak: number, training: boolean): number {
  return MODE_MUL[mode] * (0.85 + 0.1 * (stars - 1) + 0.035 * Math.min(12, Math.max(0, streak))) * (training ? 0.8 : 1);
}
/** desastres de fluido (combo = 1 fluido + 1 golpe) */
export const isFluidD = (d: DisasterId): boolean => d === 'tsunami' || d === 'enchente' || d === 'acido' || d === 'avalanche' || d === 'vulcao';

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
}

export interface Strike {
  on: boolean;
  kind: 'bomb' | 'meteor' | 'bolt' | 'rock' | 'drop' | 'ball' | 'gust';
  /** bola de neve / destroço da rajada: velocidade horizontal depois do aviso */
  vx: number;
  /** já está andando (depois do aviso) */
  live: boolean;
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
  private comboAt = -1;
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
    const list = scenarios();
    const pr = partyRoomFor('disaster');
    // grupo jogando junto: todos no mesmo cenário (a sala do grupo escolhe; muda a cada rodada igual para todos)
    const pIdx = pr ? (parseInt(partyCode(pr, 4, '0123456789'), 10) + this.sessionRounds) % 100 : -1;
    // cópia: o combo dinâmico muda a lista de desastres desta rodada sem mexer no cenário salvo
    const base = list[pIdx >= 0 ? pIdx : (this.progress.next - 1) % 100];
    this.sc = { ...base, disasters: [...base.disasters] };
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
        const pool = (FIT[this.sc.map.id] || []).filter((d) => d !== d1 && isFluidD(d) !== isFluidD(d1));
        if (pool.length) this.sc.disasters.push(pool[Math.floor(cr() * pool.length)]);
      }
    }
    this.safe = null;
    this.safeT = 0;
    this.world = new World(this.sc, this.maxBodies());
    this.rng = mulberry(this.sc.seed + this.sessionRounds * 13);
    this.night = this.sc.mod === 'noite' || this.sc.disasters.includes('raios');
    this.wind = this.sc.mod === 'vento' ? (this.rng() < 0.5 ? -1 : 1) * 90 : 0;
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
    this.draw.onRound();
    this.setPhase('intro', 2.6);
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
        this.setPhase('prepare', (this.finale ? (15 + this.sc.difficulty * 0.8) / Math.sqrt(this.I) : 15) + (this.training ? 8 : 0));
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
          this.say(DISASTERS[this.sc.disasters[0]].name() + '! ' + DISASTERS[this.sc.disasters[0]].hint());
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
    this.hud.toast(say);
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
    if (d === 'avalanche') return (70 + 35 * I) * (0.75 + 0.35 * k) * duo;
    return (95 + 45 * I) * (0.7 + 0.3 * k) * duo;
  }
  /** nível final previsto do fluido (para a IA e para a seta do treino) */
  fluidPeak(d: DisasterId): number {
    const I = this.I;
    const duo = this.sc.disasters.length > 1 ? 0.85 : 1;
    switch (d) {
      case 'tsunami':
      case 'avalanche':
        return this.waveH(d, this.waveCount(d) - 1) * (d === 'tsunami' ? 0.5 : 0.55) + 40;
      case 'enchente':
        return (105 + 75 * I) * duo;
      case 'acido':
        return (115 + 70 * I) * duo;
      case 'vulcao':
        return (50 + 30 * I) * duo;
      case 'raios':
        return 30 + 12 * I;
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
    f.crest = d === 'avalanche' ? 60 + 15 * this.I : 70 + 22 * this.I;
    f.speed = (d === 'avalanche' ? 175 + 35 * this.I : 225 + 45 * this.I) * (this.training ? 0.8 : 1);
    this.wave.warned = false;
    // destroços na frente da onda (troncos/caixas que já estavam soltos ganham um empurrão)
    if (d === 'tsunami') this.shake = Math.max(this.shake, 0.3);
  }

  private beginDisaster(d: DisasterId): void {
    this.active.add(d);
    const I = this.I;
    const duo = this.sc.disasters.length > 1 ? 0.85 : 1;
    const dur = this.phaseDur || this.disasterDur();
    const fl = (f: Partial<Fluid> & { kind: Fluid['kind'] }): Fluid => ({ level: 0, target: 100, rate: 3, front: -300, dir: 0, speed: 0, crest: 0, push: 0, base: 0, ...f });
    switch (d) {
      case 'tsunami':
      case 'avalanche': {
        const snow = d === 'avalanche';
        this.fluid = fl({ kind: snow ? 'snow' : 'water', dir: snow ? -1 : 1, push: snow ? -420 : 520 });
        this.wave.n = this.waveCount(d);
        this.wave.k = 0;
        this.wave.next = (dur - 4) / this.wave.n;
        this.ensureSim();
        this.startWave(d);
        if (snow) this.strikeTimer = 2.5;
        break;
      }
      case 'enchente':
        this.fluid = fl({ kind: 'water', target: ((105 + 75 * I) * duo) / 3, rate: 6 + 3 * I });
        this.stage.k = 0;
        this.stage.next = dur / 3;
        break;
      case 'acido':
        this.fluid = fl({ kind: 'goo', target: ((115 + 70 * I) * duo) / 3, rate: 5 + 3 * I });
        this.stage.k = 0;
        this.stage.next = dur / 3;
        this.strikeTimer = 2;
        break;
      case 'vulcao':
        // a lava DESCE da direita (frente lenta) e sobe em pulsos; bombas miradas deixam fogo
        this.fluid = fl({ kind: 'lava', dir: -1, front: this.world.W + 60, speed: 20 + 14 * I, target: ((50 + 30 * I) * duo) / 3, rate: 4, crest: 8, push: -160 });
        this.stage.k = 0;
        this.stage.next = dur / 3;
        this.strikeTimer = 2.4;
        break;
      case 'tornado': {
        const tw = this.tornado.on ? this.tornado2 : this.tornado;
        tw.on = true;
        const side = tw === this.tornado ? this.nextSide() : -this.nextSide();
        tw.x = side < 0 ? -120 : this.world.W + 120;
        tw.vx = -side * (60 + 30 * I);
        tw.r = 58 + 10 * I;
        tw.tgt = -1;
        tw.tgtT = 2;
        this.ripCD = this.world.houses.map(() => 0);
        break;
      }
      case 'terremoto':
        this.quake = 0.01;
        this.pulse.k = 0;
        this.pulse.t = 0;
        this.pulse.on = true;
        this.strikeTimer = 1.5;
        this.collapse(0.2 + 0.1 * I);
        break;
      case 'meteoros':
      case 'raios':
        this.strikeTimer = 1.5;
        break;
      case 'sumidouro':
        this.strikeTimer = 1;
        break;
      case 'areia':
        this.gust.next = 1.2;
        this.strikeTimer = 2;
        break;
      default:
        break;
    }
    this.ensureSim();
  }

  /** derruba parte das construções (terremoto): paredes e torres tombam */
  private collapse(frac: number): void {
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
      this.roundCoins = coins;
      this.sessionCoins += coins;
      addCoins(coins);
      audio.cash();
      success();
    } else {
      this.streak = 0;
      // perdeu, mas ganha pelo tempo que aguentou durante o desastre (nunca sai de mãos vazias)
      const held = Math.max(0, Math.min(60, (me.outT || 0)));
      const c = 8 + Math.round(held * 0.6);
      this.roundCoins = c;
      this.sessionCoins += c;
      addCoins(c);
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
    const dt = rdt * this.timeScale * (this.sc.mod === 'rapido' && this.phase === 'disaster' ? 1.2 : 1);
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
        this.movePlayer(p, dt);
        this.checkHazards(p, dt);
      }
    }
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
      this.presence.send({ x: Math.round(m.ghost ? m.gx : m.x), y: Math.round(m.ghost ? m.gy : m.y), g: m.ghost ? 1 : 0, f: m.face, sv: this.partySv, rd: this.partyRounds });
    }
  }

  /* ------------------------------ desastres ------------------------------ */

  /** y da superfície do fluido em x (9999 = seco/sem fluido) — dinâmica, com ondas e respingos */
  surfaceAt(x: number): number {
    return this.fluid && this.sim ? this.sim.surf(x) : 9999;
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
      const sim = this.sim;
      if (sim) {
        const prevFront = sim.front;
        sim.rain = f.kind === 'water' && f.dir === 0 && (this.active.has('enchente') || this.night) ? 0.5 : 0;
        sim.step(dt, f);
        if (f.dir !== 0 && f.crest > 10) this.frontFx(f, prevFront, dt);
      }
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
      this.strikeTimer -= dt * (this.sc.disasters.length > 1 ? 0.8 : 1) * (this.training ? 0.65 : 1);
      if (this.strikeTimer <= 0) {
        if (this.active.has('meteoros')) {
          this.spawnStrike('meteor', 1.6, 44);
          this.strikeTimer = Math.max(0.45, 1.15 - df * 0.12) * (0.7 + this.rng() * 0.6);
        } else if (this.active.has('raios')) {
          this.spawnStrike('bolt', 1.4, 20);
          this.strikeTimer = Math.max(0.4, 0.95 - df * 0.09) * (0.7 + this.rng() * 0.6);
        } else if (this.active.has('vulcao')) {
          this.spawnStrike('bomb', 2.1, 26);
          this.strikeTimer = Math.max(0.95, 2.3 - df * 0.18) * (0.7 + this.rng() * 0.6);
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
            // casas aguentam o tornado (é o abrigo que a dica ensina); o resto voa
            if (!b.awake && (b.kind === 'wall' || b.kind === 'slab')) continue;
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
    if (alive.length && this.rng() < (kind === 'bomb' ? 0.3 : 0.5)) {
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
      s.sy = -340;
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
    if (this.surfaceAt(s.x) < s.ty - 2) this.splash(s.x, s.r, 520);
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
      const max = p.bot && !p.self ? RUN * (0.7 + p.bot.skill * 0.3) : RUN;
      if (p.vx > max) p.vx = max;
      if (p.vx < -max) p.vx = -max;
      p.face = dir;
    } else {
      const fr = p.onGround ? 14 : 3;
      p.vx -= p.vx * Math.min(1, fr * dt);
    }
    if (this.wind && this.phase === 'disaster') p.vx += this.wind * dt * (p.onGround ? 0.6 : 1.4);
    if (this.tornado.on) {
      const d = this.tornado.x - p.x;
      // puxa só quem está ao ar livre (dentro de casa ninguém é arrastado para fora sem querer)
      if (Math.abs(d) < 240 && !w.insideHouse(p.x, p.y)) p.vx += Math.sign(d) * 120 * dt;
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
    if ((pressed || (p.jbuf > 0 && p.coyote > 0)) && !frozen) {
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
    if (!p.climbing) p.vy += GRAV * dt * (p.vy < 0 && !held ? 1.55 : p.vy > 0 ? 1.12 : 1);
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

  private checkHazards(p: Player, dt: number): void {
    if (!p.alive || p.safe) return;
    if (this.phase === 'end') return;
    const w = this.world;
    // fluido parado ainda rasinho (< 12): só "molha o pé" — dá tempo de subir depois do alerta
    if (this.fluid && (this.fluid.dir !== 0 || this.fluid.level > 12)) {
      const s = this.surfaceAt(p.x);
      if (p.y > s + 3) {
        this.splash(p.x, 22, Math.max(260, p.vy));
        this.knockOut(p, this.fluid.dir);
        return;
      }
    }
    // algo caindo em cima: só o que é pesado e rápido derruba; caixas e pedacinhos dão um "tum" e empurram
    if (p.bonk > 0) p.bonk -= dt;
    const roofed = this.tornado.on && w.insideHouse(p.x, p.y);
    for (const b of w.bodies) {
      if (roofed) break; // dentro de casa inteira: o teto segura o que cai
      if (!b.alive || !b.awake || b.vy < 170) continue;
      if (p.x + 7 < b.x || p.x - 7 > b.x + b.w) continue;
      const top = p.y - 22;
      if (b.y + b.h > top && b.y + b.h < p.y - 4) {
        if (b.heavy && b.vy > 260 && b.w * b.h > 500) {
          this.knockOut(p, 0);
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
    const tn = this.tornado;
    if (tn.on && Math.abs(p.x - tn.x) < tn.r * 0.5 && !w.insideHouse(p.x, p.y)) this.knockOut(p, Math.sign(tn.vx));
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
    p.outT = this.phase === 'disaster' || this.phase === 'impact' ? this.phaseT + (this.dIndex > 0 ? this.disasterDur() : 0) : 0;
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
    if (b.think <= 0) {
      b.think = 0.35 + (1 - b.skill) * 0.5 + this.rng() * 0.2;
      this.plan(p, known);
    }
    // fugir de marcadores
    let flee = 0;
    const high = !!this.fluid && p.y < -20; // no alto com fluido subindo: só um passinho
    for (const s of this.strikes) {
      if (!s.on || s.flash > 0) continue;
      const d = p.x - s.x;
      if (Math.abs(d) < s.r + (high ? 12 : 26) && this.rng() < b.skill + 0.25) flee = d >= 0 ? 1 : -1;
    }
    let tx = b.gx;
    if (flee) tx = p.x + flee * (high ? 36 : 80);
    if (this.tornado.on && !known) tx = b.gx;
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
    // lê a superfície de verdade (ondas/respingos): água encostando no pé = pulinho para cima
    if (this.fluid && p.onGround && !jump) {
      const s = this.surfaceAt(p.x);
      if (s < 5000 && s - p.y < 16 && this.rng() < 0.3 + b.skill) jump = true;
    }
    b.hop -= dt;
    if (jump && b.hop <= 0) {
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

  /** x aleatório em espaço aberto (nada em cima: não cai coisa na cabeça) */
  private openX(): number {
    const w = this.world;
    for (let i = 0; i < 8; i++) {
      const x = 40 + this.rng() * (w.W - 80);
      if (w.topAt(x) >= GROUND_Y - 2 && !this.strikes.some((s) => s.on && Math.abs(s.x - x) < s.r + 30)) return x;
    }
    return 40 + this.rng() * (w.W - 80);
  }

  private plan(p: Player, known: DisasterId | null): void {
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
    if (known === 'tornado' && w.insideHouse(p.x, p.y) && (p.self || this.rng() < 0.6 + b.skill * 0.4)) {
      // já está abrigado: fica quietinho
      b.gx = p.x;
      b.gy = p.y;
      return;
    }
    if (known === 'tornado' && this.rng() < 0.5 + b.skill * 0.5) {
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
    if (known === 'terremoto' || known === 'meteoros' || known === 'raios') {
      // espaço aberto, longe dos outros
      // espaço aberto de verdade: sem telhado/torre em cima e longe das sombras marcadas
      const covered = w.topAt(b.gx) < GROUND_Y - 2;
      if (covered || Math.abs(b.gx - p.x) < 10 || this.rng() < 0.15) b.gx = b.skill > 0.5 ? this.openX() : 40 + this.rng() * (w.W - 80);
      b.gy = GROUND_Y;
      return;
    }
    // ir para o alto: melhor superfície alcançável a partir daqui
    const reach = 108;
    // fluido que vai subir: prefere superfícies acima do nível final esperado
    const df0 = this.sc.difficulty;
    const fluidTop = known === 'vulcao' ? GROUND_Y - (52 + df0 * 16) : known === 'enchente' ? GROUND_Y - (110 + df0 * 22) : known === 'acido' ? GROUND_Y - (130 + df0 * 22) : known === 'tsunami' ? GROUND_Y - (88 + df0 * 18 + 60) : known === 'avalanche' ? GROUND_Y - (76 + df0 * 16 + 50) : 0;
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
    return `#${this.sc.n} · ${scenarioName(this.sc)}`;
  }
  disasterName(d: DisasterId): string {
    return DISASTERS[d].name();
  }
  bodyFalling(b: Body): boolean {
    return b.awake && b.vy > 120;
  }
}
