import { audio } from '../core/audio';
import { bus } from '../core/events';
import * as haptics from '../core/haptics';
import { persist, save } from '../core/storage';
import { angleDiff, clamp, lerp, makeCanvas, mixHex, rand, rng, TAU } from './math';
import { Particles, PType } from './particles';
import { emitTrail } from './trails';
import { skinById, trailById, type Skin, type Trail } from './skins';
import {
  buildCoin,
  buildGem,
  buildNebula,
  buildPlanetSprite,
  buildStarTile,
  drawPlayer,
  glow,
  PLANET_PALETTES,
  type PlanetKind,
  type PlanetSprite,
  type PlayerPose,
} from './sprites';
import {
  buildAngryFace,
  buildEdgeTint,
  buildMagnetPickup,
  buildMeteor,
  buildShieldBubble,
  buildShieldPickup,
  buildSpikyAsteroid,
  buildWarnMarker,
  buildWellDisc,
} from './sprites-fx';

/* ------------------------------------------------------------------ */
const W = 400; // largura do "mundo" jogável (unidades)
const PR = 15; // raio do personagem
const JUMP_SPEED = 760;
const FRAGILE_TIME = 2.4;
const BIOME_LEN = 20;
const LIGHT = { x: -0.55, y: -0.83 };

const WARN_TTI = 0.9; // s até o impacto para mostrar o alerta do asteroide
const LAND_SAFE_TTI = 1.0; // ao pousar, nenhum asteroide fica a menos disso
const TOX_PERIOD = 3.4; // ciclo de erupção dos planetas tóxicos
const TOX_WARN = 1.2;
const TOX_SAFE = 1.6; // tempo mínimo garantido ao pousar num tóxico
const ROCKET_SPEED = 950;
const HEADSTART_PLANETS = 10;
const SPEED_TIER_PTS = 15;
const MAGNET_RUN_BONUS = 95;
const MAGNET_PICKUP_TIME = 12;
const N_LINES = 26;
const N_WARP = 40;
const N_METEORS = 6;
const DASH: number[] = [5, 7];
const NO_DASH: number[] = [];

interface Biome {
  top: string;
  bot: string;
  neb: string[];
  kinds: PlanetKind[];
  name: string;
}

/**
 * Cada bioma tem um "sabor" mecânico (ver makePlanet):
 * 0 Nebulosa Roxa — introdução calma, asteroides lentos.
 * 1 Mar Estelar — planetas menores e mais rápidos, planetas de gelo escorregam.
 * 2 Pôr do Sol Cósmico — mais planetas frágeis, chuva de meteoros no fundo.
 * 3 Selva Tóxica — mais planetas à deriva, planetas tóxicos que expelem gás.
 * 4 Coração da Galáxia — tudo misturado + poços gravitacionais.
 * Depois do 5º bioma o ciclo recomeça com mais dificuldade.
 */
const BIOMES: Biome[] = [
  { name: 'Nebulosa Roxa', top: '#0a0520', bot: '#2c0f58', neb: ['#7a3cff', '#ff4fd8', '#3c8cff'], kinds: ['rocky', 'gas', 'candy', 'terra'] },
  { name: 'Mar Estelar', top: '#020a1c', bot: '#07395c', neb: ['#00c2ff', '#3cffd0', '#2b5cff'], kinds: ['ice', 'ice', 'terra', 'gas', 'crystal'] },
  { name: 'Pôr do Sol Cósmico', top: '#16041a', bot: '#5c1638', neb: ['#ff7a3c', '#ff3c8c', '#ffcf4f'], kinds: ['lava', 'lava', 'candy', 'gas', 'rocky'] },
  { name: 'Selva Tóxica', top: '#01120e', bot: '#0a4532', neb: ['#3cff8c', '#c4ff3c', '#00e0c0'], kinds: ['toxic', 'toxic', 'terra', 'crystal', 'gas'] },
  { name: 'Coração da Galáxia', top: '#0e0322', bot: '#43105e', neb: ['#d04fff', '#ff5ca8', '#6c5cff'], kinds: ['crystal', 'candy', 'rocky', 'ice', 'lava', 'toxic', 'gas', 'terra'] },
];
const LOOP_SUFFIX = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X'];

interface Asteroid {
  ang: number;
  dist: number;
  speed: number;
  size: number;
  rot: number;
  vr: number;
  /** tempo até atingir o jogador (s); Infinity se não está no planeta do jogador */
  tti: number;
  warned: boolean;
  /** empurrão angular pendente (aplicado suavemente) */
  kick: number;
}

interface Planet {
  n: number;
  x: number;
  y: number;
  baseX: number;
  r: number;
  rot: number;
  spin: number;
  kind: PlanetKind;
  palIdx: number;
  seed: number;
  ringed: boolean;
  sprite: PlanetSprite | null;
  visited: boolean;
  fragile: boolean;
  crackT: number;
  destroyed: boolean;
  driftAmp: number;
  driftFreq: number;
  driftPh: number;
  asteroids: Asteroid[];
  pulse: number;
  /** índice de bioma (sem módulo: cresce com os ciclos) */
  biome: number;
  toxic: boolean;
  toxT: number;
  well: boolean;
}

type PickupKind = 'coin' | 'gem' | 'shield' | 'magnet';

interface Pickup {
  x: number;
  y: number;
  kind: PickupKind;
  taken: boolean;
  t: number;
  pull: number;
  vx: number;
  vy: number;
  /** >0: voa solto e depois é puxado automaticamente para o jogador */
  home: number;
}

interface FText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  max: number;
  size: number;
}

interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  s: number;
}

type GameState = 'menu' | 'play' | 'dying' | 'over';

export interface Loadout {
  /** um acerto grátis (bolha) */
  shield?: boolean;
  /** raio de coleta de moedas maior durante toda a corrida */
  magnet?: boolean;
  /** começa voando de foguete por ~10 planetas, invulnerável */
  headstart?: boolean;
}

export interface RunResult {
  score: number;
  best: number;
  newBest: boolean;
  coins: number;
  gems: number;
  perfects: number;
  planets: number;
  canRevive: boolean;
  asteroids: number;
  maxSpeedTier: number;
  /** duração da corrida em segundos (tempo jogando, para o anti-trapaça do ranking) */
  duration: number;
}

/* ---------------- Corrida Orbital (multiplayer) ---------------- */

export interface RaceOpponent {
  slot: number;
  name: string;
  skin: string;
  /** cor da etiqueta de nome */
  color: string;
}

export interface RaceConfig {
  /** seed compartilhada: todos jogam no MESMO mundo */
  seed: number;
  durationSec: number;
  opponents: RaceOpponent[];
}

/** Progresso de um adversário: planeta (índice n no mundo da seed) e se ainda está vivo. */
export interface GhostUpdate {
  slot: number;
  p: number;
  alive: boolean;
}

/** Progresso do jogador local na corrida. */
export interface RaceProgress {
  score: number;
  /** planeta atual (índice n) */
  p: number;
  alive: boolean;
  /** s jogando desde a largada */
  t: number;
  coins: number;
  gems: number;
  perfects: number;
  planets: number;
}

interface Ghost {
  slot: number;
  name: string;
  skin: Skin;
  color: string;
  p: number;
  alive: boolean;
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  hop: number;
  ang: number;
  fade: number;
  vy: number;
  spin: number;
  placed: boolean;
}

const GHOST_HOP = 0.42;

export class Game {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private dprCap = 2;
  private cssW = 0;
  private cssH = 0;
  private scale = 1;
  private S = 1;
  private viewW = W;
  private viewH = 700;
  private camX = 0;
  private camY = 0;

  state: GameState = 'menu';
  paused = false;
  private planets: Planet[] = [];
  private pickups: Pickup[] = [];
  private texts: FText[] = [];
  private fx = new Particles(700);
  private nGen = 0;
  private astGen = 0;
  private lastPowerN = 0;

  // jogador
  private px = 0;
  private py = 0;
  private vx = 0;
  private vy = 0;
  private pState: 'orbit' | 'fly' | 'dead' = 'orbit';
  private planet: Planet | null = null;
  private lastPlanet: Planet | null = null;
  private origin: Planet | null = null;
  private local = 0;
  private flyT = 0;
  private upAng = -Math.PI / 2;
  private sx = 1;
  private sy = 1;
  private svx = 0;
  private svy = 0;
  private blink = 0;
  private blinkT = 2;
  private inv = 0;
  private deadSpin = 0;
  private happyT = 0;
  private slide = 0;
  private landGrace = 0;

  // power-ups
  private shield = false;
  private shieldPop = 0;
  private magnetRun = false;
  private magnetT = 0;
  private rocketLeft = 0;

  // corrida
  score = 0;
  private coinsRun = 0;
  private coinFrac = 0;
  private gemsRun = 0;
  private perfectStreak = 0;
  private perfects = 0;
  private planetsRun = 0;
  private asteroidsRun = 0;
  private revived = false;
  private coinChain = 0;
  private coinChainT = 0;
  private dyingT = 0;
  private showGuide = true;
  private tipRun = false;

  // dificuldade
  /** multiplicador global de velocidade (1.0 → ~1.6 em 100+ pontos, mais nos ciclos) */
  speed = 1;
  private speedTier = 0;
  private maxSpeedTier = 0;
  private biomeIdx = 0;

  // efeitos
  private trauma = 0;
  private flash = 0;
  private flashColor = '#ffffff';
  private hitStop = 0;
  private timeScale = 1;
  private slowT = 0;
  private time = 0;
  private bgPhase = 0;
  private shootT = 3;
  private shoot = { x: 0, y: 0, vx: 0, vy: 0, life: 0 };
  private warn = 0; // 0..1 nível de perigo atual (asteroide chegando)
  private speedFx = 0;
  private warpT = 0;
  private warpColor = '#ffffff';
  private lines = new Float32Array(N_LINES * 4);
  private warpSeed = new Float32Array(N_WARP * 2);
  private meteors: Meteor[] = [];
  private meteorT = 0;

  // sprites dependentes da escala
  private coinSpr!: HTMLCanvasElement;
  private gemSpr!: HTMLCanvasElement;
  private astSpr: HTMLCanvasElement[] = [];
  private astFace!: HTMLCanvasElement;
  private warnSpr!: HTMLCanvasElement;
  private shieldSpr!: HTMLCanvasElement;
  private shieldPickSpr!: HTMLCanvasElement;
  private magnetPickSpr!: HTMLCanvasElement;
  private wellSpr!: HTMLCanvasElement;
  private meteorSpr!: HTMLCanvasElement;
  private edgeRed!: HTMLCanvasElement;
  private starTiles: HTMLCanvasElement[] = [];
  private nebulas: HTMLCanvasElement[] = [];
  private farPlanets: PlanetSprite[] = [];
  private vignette!: HTMLCanvasElement;

  private skin: Skin = skinById(save.skin);
  private trail: Trail = trailById(save.trail);

  // perf
  private last = 0;
  private frameAvg = 16;
  private slowTime = 0;
  private raf = 0;

  // mundo com seed (determinístico) — partículas e enfeites continuam em Math.random
  private wr: () => number = Math.random;
  private worldSeed = 0;
  private runTime = 0;

  // corrida multiplayer
  private race: { cfg: RaceConfig; ghosts: Ghost[]; ended: boolean } | null = null;
  private ghostSpr = new Map<string, HTMLCanvasElement>();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.dprCap = save.lowFx ? 1.25 : 2;
    this.fx.budget = save.lowFx ? 0.5 : 1;
    for (let i = 0; i < N_LINES; i++) this.resetLine(i, true);
    for (let i = 0; i < N_WARP; i++) {
      this.warpSeed[i * 2] = Math.random() * TAU;
      this.warpSeed[i * 2 + 1] = Math.random();
    }
    for (let i = 0; i < N_METEORS; i++) this.meteors.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, s: 1 });
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.reset('menu');
    this.raf = requestAnimationFrame(this.loop);
  }

  /* ============================== setup ============================== */

  setLowFx(on: boolean): void {
    this.dprCap = on ? 1.25 : 2;
    this.fx.budget = on ? 0.5 : 1;
    this.resize();
  }

  refreshCosmetics(): void {
    this.skin = skinById(save.skin);
    this.trail = trailById(save.trail);
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);
    this.cssW = w;
    this.cssH = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.scale = Math.min(w / W, h / 640);
    this.S = this.scale * this.dpr;
    this.viewW = w / this.scale;
    this.viewH = h / this.scale;
    this.camX = (W - this.viewW) / 2;
    this.buildSprites();
  }

  private buildSprites(): void {
    this.ghostSpr.clear();
    const S = this.S;
    this.coinSpr = buildCoin(9 * S);
    this.gemSpr = buildGem(11 * S);
    this.astSpr = [0, 1, 2].map((i) => buildSpikyAsteroid(11.5 * S, 100 + i));
    this.astFace = buildAngryFace(10 * S);
    this.warnSpr = buildWarnMarker(9 * S);
    this.shieldSpr = buildShieldBubble(PR * 1.75 * S);
    this.shieldPickSpr = buildShieldPickup(13 * S);
    this.magnetPickSpr = buildMagnetPickup(13 * S);
    this.wellSpr = buildWellDisc(60 * S, 77);
    this.meteorSpr = buildMeteor(150 * this.dpr, 6 * this.dpr);
    for (const p of this.planets) p.sprite = null;
    const d = this.dpr;
    this.starTiles = [
      buildStarTile(256 * d, 90, 0.9 * d, 1),
      buildStarTile(256 * d, 40, 1.4 * d, 2),
      buildStarTile(256 * d, 14, 2.1 * d, 3),
    ];
    this.nebulas = BIOMES.map((b, i) => buildNebula(320, b.neb, 50 + i));
    this.farPlanets = BIOMES.map((b, i) => {
      const k = b.kinds[1];
      const pals = PLANET_PALETTES[k];
      return buildPlanetSprite(k, pals[0], 110 * d, 900 + i, i % 2 === 0);
    });
    const [v, vx] = makeCanvas(this.canvas.width, this.canvas.height);
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const g = vx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,10,0.55)');
    vx.fillStyle = g;
    vx.fillRect(0, 0, cw, ch);
    this.vignette = v;
    // meia resolução: é só um degradê, desenhado esticado
    this.edgeRed = buildEdgeTint(cw / 2, ch / 2, '#ff1f3d');
  }

  private spriteOf(p: Planet): PlanetSprite {
    if (!p.sprite) p.sprite = buildPlanetSprite(p.kind, PLANET_PALETTES[p.kind][p.palIdx], p.r * this.S, p.seed, p.ringed);
    return p.sprite;
  }

  /* ============================== mundo ============================== */

  private wRand(a: number, b: number): number {
    return a + this.wr() * (b - a);
  }

  private wChance(p: number): boolean {
    return this.wr() < p;
  }

  private wPick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.wr() * arr.length)];
  }

  /** Recomeça o mundo. Sem `seed`, sorteia uma nova (modo normal: cada partida é diferente). */
  reset(state: GameState, seed?: number): void {
    this.worldSeed = (seed ?? Math.random() * 4294967296) >>> 0;
    this.wr = rng(this.worldSeed);
    this.runTime = 0;
    this.planets = [];
    this.pickups = [];
    this.texts = [];
    this.fx.clear();
    this.nGen = 0;
    this.astGen = 0;
    this.lastPowerN = 0;
    this.score = 0;
    this.coinsRun = 0;
    this.coinFrac = 0;
    this.gemsRun = 0;
    this.perfects = 0;
    this.perfectStreak = 0;
    this.planetsRun = 0;
    this.asteroidsRun = 0;
    this.revived = false;
    this.inv = 0;
    this.timeScale = 1;
    this.slowT = 0;
    this.trauma = 0;
    this.flash = 0;
    this.showGuide = true;
    this.tipRun = false;
    this.shield = false;
    this.shieldPop = 0;
    this.magnetRun = false;
    this.magnetT = 0;
    this.rocketLeft = 0;
    this.slide = 0;
    this.landGrace = 0;
    this.speed = 1;
    this.speedTier = 0;
    this.maxSpeedTier = 0;
    this.biomeIdx = 0;
    this.warn = 0;
    this.speedFx = 0;
    this.warpT = 0;
    for (const m of this.meteors) m.life = 0;
    this.refreshCosmetics();
    const first = this.makePlanet(null);
    this.planets.push(first);
    for (let i = 0; i < 6; i++) this.planets.push(this.makePlanet(this.planets[this.planets.length - 1]));
    this.attach(first, -Math.PI / 2 - first.rot);
    first.visited = true;
    this.lastPlanet = first;
    this.camY = first.y - this.viewH * 0.66;
    this.state = state;
    this.bgPhase = 0;
    bus.emit('score', 0);
    bus.emit('run-coins', 0);
  }

  private makePlanet(prev: Planet | null): Planet {
    const n = this.nGen++;
    const bIdx = Math.floor(n / BIOME_LEN);
    const loop = Math.floor(bIdx / BIOMES.length);
    const flavor = bIdx % BIOMES.length;
    const biome = BIOMES[flavor];
    const d = Math.min(1.5, clamp(n / 70, 0, 1) + loop * 0.15);
    let r = n === 0 ? 52 : clamp(this.wRand(38, 54) - n * 0.32, 24, 56) + this.wRand(-4, 4);
    if (flavor === 1 && n > 0) r = Math.max(22, r * 0.84); // Mar Estelar: menores
    r = Math.round(r);
    let x = W / 2;
    let y = 0;
    if (prev) {
      const gap = Math.max(prev.r + r + 85, this.wRand(175, 235) + Math.min(n * 0.7, 45));
      for (let tries = 0; tries < 20; tries++) {
        x = this.wRand(r + 22, W - r - 22);
        const dx = Math.abs(x - prev.baseX);
        if (n < 3 ? dx < 70 : dx > 40 && dx < 250) break;
      }
      y = prev.y - gap;
    }
    const dir = this.wChance(0.5) ? 1 : -1;
    // o giro cresce pouco com n: a rampa principal vem do multiplicador global `speed`
    let spin = n < 2 ? 1.15 * dir : dir * (1.25 + Math.min(n * 0.014, 1.0) + loop * 0.1) * this.wRand(0.85, 1.15);
    if (flavor === 1 && n > 0) spin *= 1.15; // Mar Estelar: giram mais rápido
    const kind: PlanetKind = n === 0 ? 'rocky' : this.wPick(biome.kinds);
    const well = flavor === 4 && n > 0 && !!prev && !prev.well && this.wChance(0.3);
    const toxic = kind === 'toxic' && n >= 40 && !well;
    const fragChance = flavor === 0 && loop === 0 ? 0.1 : 0.16 + d * 0.12 + (flavor === 2 ? 0.15 : 0);
    const p: Planet = {
      n,
      x,
      y,
      baseX: x,
      r,
      rot: this.wRand(0, TAU),
      spin,
      kind,
      palIdx: Math.floor(this.wr() * PLANET_PALETTES[kind].length),
      seed: Math.floor(this.wr() * 1e9),
      ringed: (kind === 'gas' || kind === 'rocky' || kind === 'ice') && this.wChance(0.3),
      sprite: null,
      visited: false,
      fragile: n >= 12 && !well && !toxic && this.wChance(Math.min(0.6, fragChance)),
      crackT: 0,
      destroyed: false,
      driftAmp: 0,
      driftFreq: 0,
      driftPh: this.wRand(0, TAU),
      asteroids: [],
      pulse: 0,
      biome: bIdx,
      toxic,
      toxT: this.wRand(0, 1.2),
      well,
    };
    const astChance = flavor === 0 && loop === 0 ? 0.3 : Math.min(0.75, 0.25 + d * 0.35);
    // asteroides não se somam a planetas frágeis no primeiro ciclo (perigo demais de uma vez)
    if (n >= 7 && !well && (!p.fragile || loop > 0) && this.wChance(astChance)) this.addAsteroids(p, d, loop);
    const driftChance = 0.18 + d * 0.2 + (flavor === 3 ? 0.3 : flavor === 4 ? 0.12 : 0);
    if (n >= 20 && !well && this.wChance(Math.min(0.75, driftChance))) {
      const amp = this.wRand(28, 70);
      p.baseX = clamp(x, r + 15 + amp, W - r - 15 - amp);
      if (p.baseX > W - r - 15 - amp || p.baseX < r + 15 + amp) p.baseX = W / 2;
      p.driftAmp = Math.min(amp, W / 2 - r - 15);
      p.driftFreq = this.wRand(0.6, 1.1 + Math.min(d, 1) * 0.4);
      p.x = p.baseX + Math.sin(p.driftPh) * p.driftAmp;
    }
    if (prev) {
      // trilha de moedas no caminho ideal
      const count = n < 3 ? 3 : 3 + Math.floor(this.wr() * 3);
      const ax = prev.baseX;
      const ay = prev.y;
      const bx = p.baseX;
      const by = p.y;
      const dist = Math.hypot(bx - ax, by - ay);
      const t0 = (prev.r + 35) / dist;
      const t1 = 1 - (p.r + 35) / dist;
      const gemAt = n > 3 && this.wChance(0.07) ? Math.floor(count / 2) : -1;
      // power-up raro no meio do caminho
      const upChance = 0.05 + (this.race ? 0 : (save.upgrades?.shield ?? 0) * 0.008); // corrida: mundo igual para todos
      const powerAt = n >= 6 && n - this.lastPowerN >= 8 && gemAt < 0 && this.wChance(upChance) ? Math.floor(count / 2) : -1;
      if (powerAt >= 0) this.lastPowerN = n;
      for (let i = 0; i < count; i++) {
        const t = lerp(t0, t1, count === 1 ? 0.5 : i / (count - 1));
        const kind: PickupKind = i === gemAt ? 'gem' : i === powerAt ? (this.wChance(0.5) ? 'shield' : 'magnet') : 'coin';
        this.pickups.push({ x: lerp(ax, bx, t), y: lerp(ay, by, t), kind, taken: false, t: this.wRand(0, 6), pull: 0, vx: 0, vy: 0, home: 0 });
      }
    }
    return p;
  }

  /** Cria asteroides garantindo uma janela segura entre as passagens. */
  private addAsteroids(p: Planet, d: number, loop: number): void {
    const early = this.astGen < 2 && loop === 0;
    this.astGen++;
    let count = early ? 1 : 1 + (p.n > 25 && this.wChance(0.5) ? 1 : 0) + (p.n > 45 && this.wChance(0.4) ? 1 : 0);
    let as: number;
    if (early) {
      // primeiras aparições: lentos e num planeta calmo
      p.spin = Math.sign(p.spin) * Math.min(Math.abs(p.spin), 1.2);
      as = 0.4;
    } else as = this.wRand(0.6, 1.0 + Math.min(d, 1.4) * 0.7);
    const s = Math.abs(p.spin);
    // janela mínima (s) entre duas passagens de asteroide pelo jogador
    const minWin = lerp(1.9, 1.15, Math.min(1, d));
    while (count > 1 && (s + as) * count * minWin > TAU) count--;
    if ((s + as) * minWin > TAU) as = Math.max(0.25, TAU / minWin - s);
    const spd = -Math.sign(p.spin) * as;
    const off = this.wRand(0, TAU);
    for (let i = 0; i < count; i++)
      p.asteroids.push({ ang: off + (i / count) * TAU, dist: p.r + PR + 2, speed: spd, size: 9, rot: 0, vr: this.wRand(-3, 3), tti: Infinity, warned: false, kick: 0 });
  }

  private attach(p: Planet, local: number): void {
    this.planet = p;
    this.local = local;
    this.pState = 'orbit';
    const a = p.rot + local;
    this.px = p.x + Math.cos(a) * (p.r + PR - 1);
    this.py = p.y + Math.sin(a) * (p.r + PR - 1);
    this.upAng = a;
  }

  /* ============================== controle ============================== */

  /**
   * Inicia a corrida. `loadout` vem da UI (consumíveis já descontados por ela).
   */
  start(loadout?: Loadout): void {
    if (this.race) {
      this.race = null;
      this.reset('play');
    } else if (this.state !== 'menu') this.reset('play');
    this.state = 'play';
    audio.setIntensity(0.2);
    bus.emit('state', 'play');
    if (loadout?.shield) this.giveShield(false);
    if (loadout?.magnet) this.magnetRun = true;
    if (loadout?.headstart) {
      this.rocketLeft = HEADSTART_PLANETS;
      this.showGuide = false;
      this.addText(this.px, this.py - 40, 'DECOLAR!', '#ffcf4f', 30);
      this.launchRocket();
    }
  }

  input(): void {
    if (this.state !== 'play' || this.paused) return;
    if (this.pState === 'orbit' && this.rocketLeft <= 0) this.jump();
  }

  /** Fator de velocidade do salto: acompanha `speed` de forma mais suave para a captura continuar gostosa. */
  private jumpFactor(): number {
    return 1 + (this.speed - 1) * 0.65;
  }

  private jump(): void {
    const p = this.planet!;
    const a = p.rot + this.local;
    const js = JUMP_SPEED * this.jumpFactor();
    this.vx = Math.cos(a) * js;
    this.vy = Math.sin(a) * js;
    this.pState = 'fly';
    this.origin = p;
    this.planet = null;
    this.flyT = 0;
    this.slide = 0;
    this.sx = 0.72;
    this.sy = 1.38;
    this.svx = this.svy = 0;
    this.showGuide = false;
    p.pulse = 0.6;
    const cx = this.px - Math.cos(a) * PR;
    const cy = this.py - Math.sin(a) * PR;
    for (let i = 0; i < 10; i++) {
      const sp = a + Math.PI + rand(-1.2, 1.2);
      this.fx.spawn({ x: cx, y: cy, vx: Math.cos(sp) * rand(60, 180), vy: Math.sin(sp) * rand(60, 180), life: 0.45, size: rand(2, 4), color: this.skin.light, drag: 4 });
    }
    audio.jump(this.perfectStreak);
    haptics.tap('light');
    bus.emit('jump');
  }

  private launchRocket(): void {
    const from = this.planet ?? this.lastPlanet;
    this.origin = from;
    this.planet = null;
    this.pState = 'fly';
    this.flyT = 0;
    this.slide = 0;
    const t = this.nextTarget();
    const a = t ? Math.atan2(t.y - this.py, t.x - this.px) : -Math.PI / 2;
    this.vx = Math.cos(a) * ROCKET_SPEED;
    this.vy = Math.sin(a) * ROCKET_SPEED;
    this.sx = 0.8;
    this.sy = 1.3;
  }

  revive(): void {
    if (this.race) return;
    let p = this.lastPlanet ?? this.planets[0];
    if (p.destroyed) {
      p.destroyed = false;
      p.fragile = false;
      p.crackT = 0;
      p.sprite = null;
    }
    p.fragile = false;
    p.crackT = 0;
    p.asteroids = [];
    p.toxic = false;
    this.revived = true;
    this.attach(p, -Math.PI / 2 - p.rot);
    this.inv = 2.5;
    this.state = 'play';
    this.timeScale = 1;
    this.camY = p.y - this.viewH * 0.66;
    this.fx.burst(this.px, this.py, 30, ['#ffffff', this.skin.light, '#fff36b'], 300, { type: PType.Star, size: 6 });
    this.addText(this.px, this.py - 40, 'DE VOLTA!', '#7dfcff', 30);
    bus.emit('state', 'play');
  }

  /* ============================== corrida ============================== */

  /**
   * Prepara uma Corrida Orbital: mundo gerado pela `seed` compartilhada (igual para
   * todos) e adversários desenhados como "fantasmas". O jogador fica parado no
   * primeiro planeta até `raceGo()` (contagem 3-2-1). Sem power-ups e sem "continuar".
   */
  startRace(cfg: RaceConfig): void {
    this.race = { cfg, ghosts: [], ended: false };
    this.reset('menu', cfg.seed);
    this.showGuide = true;
    const first = this.planets[0];
    this.race.ghosts = cfg.opponents.map((o, i) => ({
      slot: o.slot,
      name: o.name,
      skin: skinById(o.skin),
      color: o.color,
      p: 0,
      alive: true,
      x: first.x,
      y: first.y,
      fromX: first.x,
      fromY: first.y,
      hop: 1,
      // espalhados ao redor do planeta (o jogador fica no topo)
      ang: -Math.PI / 2 + [1.15, -1.15, 2.3, -2.3, 3.14][i % 5],
      fade: 1,
      vy: 0,
      spin: 0,
      placed: false,
    }));
    bus.emit('state', 'race-ready');
  }

  /** Largada (fim da contagem). */
  raceGo(): void {
    if (!this.race || this.state !== 'menu') return;
    this.state = 'play';
    this.runTime = 0;
    audio.setIntensity(0.25);
    bus.emit('state', 'play');
  }

  /** Atualiza o progresso dos adversários (vindo do servidor ou dos bots locais). */
  setGhosts(list: GhostUpdate[]): void {
    if (!this.race) return;
    for (const u of list) {
      const g = this.race.ghosts.find((q) => q.slot === u.slot);
      if (!g) continue;
      if (u.p !== g.p && g.alive) {
        g.fromX = g.x;
        g.fromY = g.y;
        g.hop = u.p - g.p > 4 || u.p < g.p ? 1 : 0;
        g.p = u.p;
      }
      if (!u.alive && g.alive) {
        g.alive = false;
        g.vy = -220;
        g.spin = rand(-8, 8);
        if (g.y > this.camY - 40 && g.y < this.camY + this.viewH + 40) {
          this.fx.burst(g.x, g.y, 16, [g.skin.light, g.skin.dark, '#ffffff'], 260, { size: 4 });
        }
      }
    }
  }

  /** Tempo esgotado: congela o jogador (se ainda vivo). `ended` = resultado na tela (some com as setas). */
  raceStop(ended = false): void {
    if (!this.race) return;
    if (ended) this.race.ended = true;
    if (this.state === 'play') {
      this.state = 'over';
      audio.setIntensity(0);
    }
  }

  /** Sai do modo corrida e volta para o menu. */
  exitRace(): void {
    if (!this.race) return;
    this.race = null;
    this.reset('menu');
  }

  get inRace(): boolean {
    return !!this.race;
  }

  get raceProgress(): RaceProgress {
    const alive = this.state === 'play' || (this.state === 'over' && this.pState !== 'dead') || this.state === 'menu';
    return {
      score: this.score,
      p: (this.planet ?? this.lastPlanet)?.n ?? 0,
      alive: alive && this.pState !== 'dead',
      t: Math.round(this.runTime * 10) / 10,
      coins: this.coinsRun,
      gems: this.gemsRun,
      perfects: this.perfects,
      planets: this.planetsRun,
    };
  }

  /* ============================== loop ============================== */

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    const real = Math.min(0.05, (now - (this.last || now)) / 1000);
    this.last = now;
    this.trackPerf(real * 1000);
    if (!this.paused) this.update(real);
    this.render();
  };

  private trackPerf(ms: number): void {
    if (ms <= 0) return;
    this.frameAvg = lerp(this.frameAvg, ms, 0.05);
    if (this.frameAvg > 21 && this.dpr > 1) {
      this.slowTime += ms;
      if (this.slowTime > 2500) {
        this.slowTime = 0;
        this.dprCap = Math.max(1, this.dpr - 0.35);
        this.fx.budget = Math.max(0.4, this.fx.budget - 0.2);
        this.resize();
      }
    } else this.slowTime = Math.max(0, this.slowTime - ms);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }

  /** Alvo de velocidade para a pontuação atual: sobe logo no começo e satura em ~110 pontos (+ bônus por ciclo). */
  private speedTarget(): number {
    const t = clamp(this.score / 110, 0, 1);
    const loop = Math.floor(this.biomeIdx / BIOMES.length);
    return Math.min(2.1, 1 + 0.6 * (1 - Math.pow(1 - t, 1.6)) + loop * 0.12);
  }

  private update(real: number): void {
    this.time += real;
    if (this.hitStop > 0) {
      this.hitStop -= real;
      return;
    }
    if (this.slowT > 0) this.slowT -= real;
    const tsTarget = this.slowT > 0 ? 0.5 : 1;
    this.timeScale = lerp(this.timeScale, tsTarget, Math.min(1, real * (this.state === 'dying' ? 1.2 : 6)));
    const dt = real * this.timeScale;

    if (this.state === 'play') this.runTime += dt;

    // rampa de velocidade
    if (this.state === 'play') this.speed = lerp(this.speed, this.speedTarget(), Math.min(1, real * 0.8));
    const spd = this.speed;

    // cenário (bioma segue o planeta onde o jogador está)
    this.bgPhase = lerp(this.bgPhase, this.biomeIdx, Math.min(1, real * (this.warpT > 0 ? 3 : 1.5)));

    for (const p of this.planets) {
      p.rot += p.spin * spd * dt;
      if (p.driftAmp) {
        p.driftPh += p.driftFreq * spd * dt;
        p.x = p.baseX + Math.sin(p.driftPh) * p.driftAmp;
      }
      for (const a of p.asteroids) {
        a.ang += a.speed * spd * dt;
        a.rot += a.vr * dt;
        if (a.kick !== 0) {
          const step = a.kick * Math.min(1, dt * 12);
          a.ang += step;
          a.kick -= step;
          if (Math.abs(a.kick) < 1e-3) a.kick = 0;
        }
      }
      if (p.pulse > 0) p.pulse = Math.max(0, p.pulse - dt * 3);
      if (p.fragile && p.crackT > 0 && !p.destroyed) {
        const before = p.crackT;
        p.crackT += dt;
        if (Math.floor(before * 2.5) !== Math.floor(p.crackT * 2.5)) {
          audio.crack();
          this.trauma = Math.max(this.trauma, 0.15);
        }
        if (p.crackT >= FRAGILE_TIME) this.explodePlanet(p);
      }
      if (p.toxic && !p.destroyed) {
        p.toxT += dt;
        if (p.toxT >= TOX_PERIOD) {
          p.toxT -= TOX_PERIOD;
          this.eruptToxic(p);
        } else if (p.toxT > TOX_PERIOD - TOX_WARN && Math.random() < dt * 14 && this.onScreen(p)) {
          const a = rand(0, TAU);
          this.fx.spawn({ x: p.x + Math.cos(a) * p.r * 0.95, y: p.y + Math.sin(a) * p.r * 0.95, vx: Math.cos(a) * 30, vy: Math.sin(a) * 30 - 10, life: 0.7, size: rand(3, 6), color: '#7dff6b', type: PType.Bubble, additive: false });
        }
      }
    }

    this.updatePlayer(dt);
    this.updateWorld(dt);
    this.updateCamera(dt);
    if (this.race) this.updateGhosts(dt);

    // efeitos
    this.fx.update(dt);
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= real;
      t.y -= 40 * real;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    this.trauma = Math.max(0, this.trauma - real * 1.6);
    this.flash = Math.max(0, this.flash - real * 3);
    this.coinChainT -= dt;
    if (this.coinChainT <= 0) this.coinChain = 0;
    if (this.happyT > 0) this.happyT -= dt;
    if (this.magnetT > 0) this.magnetT -= dt;
    if (this.shieldPop > 0) this.shieldPop -= real * 2.5;
    if (this.speedFx > 0) this.speedFx -= real;
    if (this.warpT > 0) this.warpT -= real;
    this.updateBackFx(real);

    // piscar
    this.blinkT -= real;
    if (this.blinkT <= 0) {
      this.blink = 1;
      this.blinkT = rand(2, 4.5);
    }
    this.blink = Math.max(0, this.blink - real * 8);

    // mola de squash & stretch
    const k = 260;
    const damp = 14;
    this.svx += ((1 - this.sx) * k - this.svx * damp) * real;
    this.svy += ((1 - this.sy) * k - this.svy * damp) * real;
    this.sx += this.svx * real;
    this.sy += this.svy * real;

    // estrela cadente
    this.shootT -= real;
    if (this.shootT <= 0) {
      this.shootT = rand(4, 9);
      this.shoot = { x: rand(0, this.cssW), y: rand(0, this.cssH * 0.5), vx: rand(-700, -400), vy: rand(200, 350), life: 0.9 };
    }
    if (this.shoot.life > 0) {
      this.shoot.life -= real;
      this.shoot.x += this.shoot.vx * real;
      this.shoot.y += this.shoot.vy * real;
    }

    if (this.state === 'dying') {
      this.dyingT -= real;
      if (this.dyingT <= 0) this.finish();
    }
  }

  private onScreen(p: Planet): boolean {
    return p.y + p.r * 2 > this.camY - 60 && p.y - p.r * 2 < this.camY + this.viewH + 60;
  }

  /** Linhas de velocidade, meteoros (Pôr do Sol) — tudo em pools fixos. */
  private updateBackFx(real: number): void {
    const lineA = this.linesAlpha();
    if (lineA > 0.01) {
      const L = this.lines;
      for (let i = 0; i < N_LINES; i++) {
        L[i * 4 + 1] += L[i * 4 + 3] * this.speed * real;
        if (L[i * 4 + 1] - L[i * 4 + 2] > this.cssH) this.resetLine(i, false);
      }
    }
    // chuva de meteoros quando o fundo é do Pôr do Sol Cósmico
    const bi = Math.round(this.bgPhase) % BIOMES.length;
    const fall = bi === 2 ? 1 : 0;
    this.meteorT -= real;
    if (fall && this.meteorT <= 0) {
      this.meteorT = rand(0.18, 0.55);
      for (const m of this.meteors) {
        if (m.life > 0) continue;
        const sp = rand(380, 620);
        const ang = rand(1.95, 2.25); // descendo para a esquerda
        m.x = rand(this.cssW * 0.2, this.cssW * 1.2);
        m.y = rand(-60, this.cssH * 0.3);
        m.vx = Math.cos(ang) * sp;
        m.vy = Math.sin(ang) * sp;
        m.life = rand(0.9, 1.6);
        m.s = rand(0.6, 1.2);
        break;
      }
    }
    for (const m of this.meteors) {
      if (m.life <= 0) continue;
      m.life -= real;
      m.x += m.vx * real;
      m.y += m.vy * real;
    }
  }

  private resetLine(i: number, anywhere: boolean): void {
    const L = this.lines;
    L[i * 4] = Math.random() * (this.cssW || 400);
    L[i * 4 + 2] = rand(40, 140);
    L[i * 4 + 1] = anywhere ? Math.random() * (this.cssH || 800) : -rand(0, 200);
    L[i * 4 + 3] = rand(900, 1700);
  }

  private linesAlpha(): number {
    const base = this.state === 'play' ? clamp((this.speed - 1.22) * 1.2, 0, 0.35) : 0;
    return Math.max(base, Math.min(1, this.speedFx) * 0.9, this.rocketLeft > 0 ? 0.8 : 0, this.warpT > 0 ? 0.6 : 0);
  }

  private updatePlayer(dt: number): void {
    if (this.inv > 0) this.inv -= dt;
    if (this.landGrace > 0) this.landGrace -= dt;
    this.warn = 0;

    if (this.pState === 'orbit' && this.planet) {
      const p = this.planet;
      if (this.slide !== 0) {
        // gelo: escorrega um pouco depois de pousar
        this.local += this.slide * dt;
        this.slide -= this.slide * Math.min(1, dt * 2.6);
        if (Math.abs(this.slide) < 0.02) this.slide = 0;
        else if (Math.random() < dt * 30) {
          const a0 = p.rot + this.local;
          this.fx.spawn({ x: p.x + Math.cos(a0) * p.r, y: p.y + Math.sin(a0) * p.r, vx: rand(-40, 40), vy: rand(-40, 40), life: 0.4, size: rand(2, 3.5), color: '#c8f6ff', type: PType.Star, drag: 3 });
        }
      }
      const a = p.rot + this.local;
      const dist = p.r + PR - 1 + p.pulse * 3;
      this.px = p.x + Math.cos(a) * dist;
      this.py = p.y + Math.sin(a) * dist;
      this.upAng = a;
      this.updateWarnings(p, a);
      if (this.state === 'play') this.checkAsteroids();
      if (this.state === 'play') this.collectPickups(dt);
      // poeirinha
      if (Math.random() < dt * 6 && this.state !== 'over')
        this.fx.spawn({ x: this.px - Math.cos(a) * PR, y: this.py - Math.sin(a) * PR, vx: rand(-20, 20), vy: rand(-20, 20), life: 0.6, size: 1.6, color: this.skin.light, drag: 2 });
      return;
    }

    if (this.pState === 'fly') {
      this.flyT += dt;
      const rocket = this.rocketLeft > 0;
      if (rocket) {
        // foguete: segue direto (com correção) para o próximo planeta
        const t = this.nextTarget();
        if (t) {
          const dx = t.x - this.px;
          const dy = t.y - this.py;
          const l = Math.hypot(dx, dy) || 1;
          this.vx = (dx / l) * ROCKET_SPEED;
          this.vy = (dy / l) * ROCKET_SPEED;
        }
        const back = Math.atan2(-this.vy, -this.vx);
        for (let i = 0; i < 2; i++) {
          const sp = back + rand(-0.35, 0.35);
          this.fx.spawn({ x: this.px + Math.cos(back) * PR, y: this.py + Math.sin(back) * PR, vx: Math.cos(sp) * rand(120, 260), vy: Math.sin(sp) * rand(120, 260), life: 0.35, size: rand(4, 8), color: i ? '#ffcf4f' : '#ff6a2a', drag: 3 });
        }
      } else {
        const jf = this.jumpFactor();
        const g2 = jf * jf; // mantém a geometria das trajetórias ao acelerar
        // assistência gravitacional
        for (const p of this.planets) {
          if (p.destroyed || (p === this.origin && this.flyT < 0.25 / jf)) continue;
          const dx = p.x - this.px;
          const dy = p.y - this.py;
          const d2 = dx * dx + dy * dy;
          const field = p.well ? p.r * 3.4 + 70 : p.r * 2.4 + 40;
          if (d2 > field * field) continue;
          const d = Math.sqrt(d2);
          const acc = p.well ? Math.min(6400, (3.0e6 * (p.r / 40)) / d2) : Math.min(3200, (1.3e6 * (p.r / 40)) / d2);
          this.vx += (dx / d) * acc * g2 * dt;
          this.vy += (dy / d) * acc * g2 * dt;
        }
        // mantém a velocidade estável (sensação "arcade")
        const sp = Math.hypot(this.vx, this.vy) || 1;
        const target = JUMP_SPEED * jf;
        const nsp = lerp(sp, target, Math.min(1, dt * 2));
        this.vx = (this.vx / sp) * nsp;
        this.vy = (this.vy / sp) * nsp;
      }
      this.px += this.vx * dt;
      this.py += this.vy * dt;
      this.upAng = Math.atan2(this.vy, this.vx);
      emitTrail(this.fx, this.trail, this.px, this.py, this.vx, this.vy, this.time, PR);

      // pousar
      for (const p of this.planets) {
        if (p.destroyed || (p === this.origin && this.flyT < 0.25)) continue;
        if (rocket && p.visited) continue;
        const dx = this.px - p.x;
        const dy = this.py - p.y;
        const rr = p.r + PR + 2;
        if (dx * dx + dy * dy < rr * rr) {
          this.land(p);
          return;
        }
      }
      if (this.state === 'play') this.checkAsteroids();
      if (this.state === 'play') this.collectPickups(dt);

      if (this.state === 'play' && !rocket) {
        const m = PR * 2;
        if (this.px < this.camX - m || this.px > this.camX + this.viewW + m || this.py > this.camY + this.viewH + m || this.flyT > 1.7 / this.jumpFactor()) this.die('lost');
      }
      return;
    }

    if (this.pState === 'dead') {
      this.vy += 900 * dt;
      this.px += this.vx * dt;
      this.py += this.vy * dt;
      this.deadSpin += dt * 10;
    }
  }

  /** Tempo até o asteroide alcançar o ângulo `theta` do jogador no planeta `p`. */
  private timeToImpact(p: Planet, a: Asteroid, theta: number): number {
    const w = (a.speed - p.spin) * this.speed;
    const aw = Math.abs(w);
    if (aw < 1e-3) return 99;
    const rel = angleDiff(theta, a.ang);
    const gap = rel * w < 0 ? Math.abs(rel) : TAU - Math.abs(rel);
    const hit = (a.size + PR - 4) / a.dist;
    return Math.max(0, (gap - hit) / aw);
  }

  private updateWarnings(p: Planet, theta: number): void {
    for (const q of this.planets) {
      if (q === p) continue;
      for (const a of q.asteroids) a.tti = Infinity;
    }
    if (this.state !== 'play' || this.rocketLeft > 0) {
      for (const a of p.asteroids) a.tti = Infinity;
      return;
    }
    for (const a of p.asteroids) {
      a.tti = this.timeToImpact(p, a, theta);
      if (a.tti < WARN_TTI) {
        this.warn = Math.max(this.warn, 1 - a.tti / WARN_TTI);
        if (!a.warned) {
          a.warned = true;
          haptics.tap('light');
        }
      } else if (a.tti > WARN_TTI + 0.3) a.warned = false;
    }
  }

  private checkAsteroids(): void {
    if (this.landGrace > 0) return;
    if (this.inv > 0 && this.rocketLeft <= 0) return;
    for (const p of this.planets) {
      for (let i = p.asteroids.length - 1; i >= 0; i--) {
        const a = p.asteroids[i];
        const ax = p.x + Math.cos(a.ang) * a.dist;
        const ay = p.y + Math.sin(a.ang) * a.dist;
        const dx = ax - this.px;
        const dy = ay - this.py;
        const rr = a.size + PR - 4;
        if (dx * dx + dy * dy < rr * rr) {
          if (this.rocketLeft > 0) {
            this.destroyAsteroid(p, i, 2);
            continue;
          }
          if (this.shield) {
            this.breakShield();
            this.destroyAsteroid(p, i, 3);
            this.addText(ax, ay - 30, 'ASTEROIDE DESTRUÍDO!', '#ff9a6b', 22);
            continue;
          }
          this.die('asteroid');
          return;
        }
      }
    }
  }

  private land(p: Planet): void {
    const angToCenter = Math.atan2(p.y - this.py, p.x - this.px);
    const off = Math.abs(angleDiff(Math.atan2(this.vy, this.vx), angToCenter));
    const local = Math.atan2(this.py - p.y, this.px - p.x) - p.rot;
    const rocket = this.rocketLeft > 0;
    // componente tangencial (para o gelo escorregar)
    const la = p.rot + local;
    const vt = -this.vx * Math.sin(la) + this.vy * Math.cos(la);
    this.attach(p, local);
    this.lastPlanet = p;
    this.landGrace = 0.2;
    this.sx = 1.4;
    this.sy = 0.66;
    this.svx = this.svy = 0;
    p.pulse = 1;
    const pal = PLANET_PALETTES[p.kind][p.palIdx];
    this.fx.spawn({ x: p.x, y: p.y, life: 0.5, size: p.r, size2: 6, color: pal.atmo, type: PType.Ring });
    const a = p.rot + local;
    for (let i = 0; i < 12; i++) {
      const sp = a + rand(-1.3, 1.3);
      this.fx.spawn({ x: this.px - Math.cos(a) * PR, y: this.py - Math.sin(a) * PR, vx: Math.cos(sp) * rand(80, 220), vy: Math.sin(sp) * rand(80, 220), life: 0.5, size: rand(2, 4), color: pal.atmo, drag: 5 });
    }
    let perfect = false;
    if (!p.visited) {
      p.visited = true;
      this.planetsRun++;
      perfect = !rocket && off < 0.2;
      let gain = 1;
      if (perfect) {
        this.perfectStreak++;
        this.perfects++;
        const bonus = Math.min(this.perfectStreak, 3);
        gain += bonus;
        this.addText(p.x, p.y - p.r - 30, this.perfectStreak > 1 ? `PERFEITO x${this.perfectStreak}` : 'PERFEITO!', '#fff36b', 26 + Math.min(this.perfectStreak, 5) * 2);
        this.fx.burst(this.px, this.py, 18, ['#fff36b', '#ffffff', this.skin.light], 320, { type: PType.Star, size: 6, vr: 8 });
        this.fx.spawn({ x: p.x, y: p.y, life: 0.55, size: p.r + 4, size2: 9, color: '#fff36b', type: PType.Ring });
        this.flash = 0.25;
        this.flashColor = '#fff7c2';
        this.happyT = 0.8;
        audio.perfect(this.perfectStreak);
        haptics.tap('medium');
        bus.emit('perfect', this.perfectStreak);
      } else {
        if (!rocket) this.perfectStreak = 0;
        audio.land(Math.min(this.planetsRun, 7));
        haptics.tap('light');
      }
      this.score += gain;
      this.addText(this.px, this.py - 26, `+${gain}`, '#ffffff', 22);
      this.trauma = Math.max(this.trauma, rocket ? 0.1 : perfect ? 0.35 : 0.2);
      if (p.fragile && !rocket) p.crackT = 0.0001;
      audio.setIntensity(clamp(Math.max(this.score / 60, (this.speed - 1) / 0.6), 0.2, 1));
      bus.emit('score', this.score);
      this.checkSpeedTier();
      if (p.biome > this.biomeIdx) this.enterBiome(p.biome);
    } else {
      audio.land(0);
      this.trauma = Math.max(this.trauma, 0.12);
    }

    // onda de choque do PERFEITO: destrói os asteroides do planeta
    if (perfect && p.asteroids.length) this.shockwave(p);

    if (rocket) {
      this.rocketLeft--;
      if (this.rocketLeft > 0) {
        this.launchRocket();
        return;
      }
      this.inv = 1.3;
      this.addText(this.px, this.py - 44, 'VAI!', '#ffcf4f', 30);
      this.flash = 0.3;
      this.flashColor = '#ffe0a0';
    }

    // gelo escorregadio
    if (p.kind === 'ice' && !perfect) this.slide = clamp((vt / (p.r + PR)) * 0.35, -2.2, 2.2);

    // tóxico: sempre dá tempo de reagir ao pousar
    if (p.toxic && p.toxT > TOX_PERIOD - TOX_SAFE) p.toxT = TOX_PERIOD - TOX_SAFE;

    if (p.asteroids.length) {
      this.fairAsteroids(p);
      // primeira vez: ensina (até 3 vezes no total)
      if (!this.tipRun && this.state === 'play') {
        this.tipRun = true;
        const seen = save.tips.asteroid ?? 0;
        if (seen < 3) {
          save.tips.asteroid = seen + 1;
          persist();
          this.slowT = 1;
          bus.emit('tip', 'asteroid');
        }
      }
    }
  }

  /**
   * Justiça: ao pousar, o asteroide mais próximo é empurrado para trás (efeito do impacto)
   * de modo que o jogador sempre consiga mirar no próximo planeta antes de ser atingido.
   * Se nem o atraso máximo bastar, o grupo de asteroides deste planeta fica mais lento.
   */
  private fairAsteroids(p: Planet): void {
    const th = p.rot + this.local;
    const sp = this.speed;
    const spinAbs = Math.abs(p.spin) * sp;
    let tAlign = 0;
    const t = this.nextTarget();
    if (t && spinAbs > 1e-3) {
      const want = Math.atan2(t.y - p.y, t.x - p.x);
      let delta = angleDiff(th, want) * (Math.sign(p.spin) || 1);
      if (delta < -0.2) delta += TAU;
      tAlign = Math.max(0, delta) / spinAbs;
    }
    const need = Math.max(LAND_SAFE_TTI, tAlign + 0.65);
    let closest: Asteroid | null = null;
    let first = Infinity;
    for (const a of p.asteroids) {
      const tti = this.timeToImpact(p, a, th);
      if (tti < first) {
        first = tti;
        closest = a;
      }
    }
    if (!closest || first >= need) return;
    const hit = (closest.size + PR - 4) / closest.dist;
    const room = TAU / p.asteroids.length - 2 * hit;
    let w = Math.abs(closest.speed - p.spin) * sp;
    if (w < 1e-3) return;
    const sCur = hit + w * first; // distância angular atual até o impacto
    if (room / w < need) {
      const as = Math.max(0.12, room / need / sp - Math.abs(p.spin));
      for (const a of p.asteroids) a.speed = (Math.sign(a.speed) || 1) * as;
      w = Math.abs(closest.speed - p.spin) * sp;
    }
    const target = Math.min(need, room / w);
    const wS = (closest.speed - p.spin) * sp;
    // empurra sempre "para trás" (afastando do jogador), nunca através dele
    const kick = -Math.sign(wS) * Math.max(0, hit + w * target - sCur);
    for (const a of p.asteroids) {
      a.kick = kick;
      const ax = p.x + Math.cos(a.ang) * a.dist;
      const ay = p.y + Math.sin(a.ang) * a.dist;
      this.fx.burst(ax, ay, 6, ['#ff9a6b', '#ffffff'], 140, { size: 3 });
    }
  }

  private checkSpeedTier(): void {
    const tier = Math.floor(this.score / SPEED_TIER_PTS);
    if (tier <= this.speedTier) return;
    this.speedTier = tier;
    this.maxSpeedTier = Math.max(this.maxSpeedTier, tier);
    this.speedFx = 1.4;
    if (this.flash < 0.2) {
      this.flash = 0.22;
      this.flashColor = '#9ffcff';
    }
    for (let i = 0; i < N_LINES; i++) this.resetLine(i, true);
    bus.emit('speedup', tier);
  }

  private enterBiome(idx: number): void {
    this.biomeIdx = idx;
    const flavor = idx % BIOMES.length;
    const loop = Math.floor(idx / BIOMES.length);
    const b = BIOMES[flavor];
    this.warpT = 1.4;
    this.warpColor = b.neb[0];
    this.flash = 0.6;
    this.flashColor = b.neb[1];
    this.trauma = Math.max(this.trauma, 0.3);
    bus.emit('biome', b.name + (LOOP_SUFFIX[loop] ?? ` ${loop + 1}`));
    audio.unlock2();
  }

  private shockwave(p: Planet): void {
    this.fx.spawn({ x: p.x, y: p.y, life: 0.7, size: p.r + PR, size2: 14, color: '#ffffff', type: PType.Ring });
    this.fx.spawn({ x: p.x, y: p.y, life: 0.9, size: p.r + PR, size2: 8, color: '#ff9a6b', type: PType.Ring });
    for (let i = p.asteroids.length - 1; i >= 0; i--) this.destroyAsteroid(p, i, 3);
    this.addText(p.x, p.y - p.r - 60, 'ASTEROIDE DESTRUÍDO!', '#ff9a6b', 22);
    this.trauma = Math.max(this.trauma, 0.5);
    this.hitStop = 0.05;
  }

  private destroyAsteroid(p: Planet, i: number, coins: number): void {
    const a = p.asteroids[i];
    const ax = p.x + Math.cos(a.ang) * a.dist;
    const ay = p.y + Math.sin(a.ang) * a.dist;
    p.asteroids.splice(i, 1);
    this.asteroidsRun++;
    this.fx.burst(ax, ay, 14, ['#ff4f6a', '#a8203a', '#ff9a6b'], 300, { type: PType.Chunk, size: 4, vr: 8, drag: 2, additive: false, life: 0.8 });
    this.fx.burst(ax, ay, 14, ['#ffcf4f', '#ffffff', '#ff6a2a'], 260, { size: 6 });
    this.fx.spawn({ x: ax, y: ay, life: 0.4, size: 10, size2: 6, color: '#ffcf4f', type: PType.Ring });
    for (let k = 0; k < coins; k++) {
      const ang = Math.atan2(ay - p.y, ax - p.x) + rand(-0.9, 0.9);
      const sp = rand(140, 240);
      this.pickups.push({ x: ax, y: ay, kind: 'coin', taken: false, t: rand(0, 6), pull: 0, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, home: rand(0.3, 0.5) });
    }
    audio.crack();
    haptics.tap('medium');
    bus.emit('asteroid-destroyed', this.asteroidsRun);
  }

  private eruptToxic(p: Planet): void {
    if (!this.onScreen(p)) return;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU + rand(-0.1, 0.1);
      this.fx.spawn({ x: p.x + Math.cos(a) * p.r, y: p.y + Math.sin(a) * p.r, vx: Math.cos(a) * rand(120, 220), vy: Math.sin(a) * rand(120, 220), life: 0.7, size: rand(6, 10), color: i % 2 ? '#7dff6b' : '#c4ff3c', drag: 3 });
    }
    this.fx.spawn({ x: p.x, y: p.y, life: 0.6, size: p.r, size2: 10, color: '#7dff6b', type: PType.Ring });
    if (this.planet === p && this.pState === 'orbit' && this.state === 'play' && this.rocketLeft <= 0) {
      this.addText(this.px, this.py - 40, 'GÁS TÓXICO!', '#9dff6b', 24);
      this.trauma = Math.max(this.trauma, 0.35);
      this.jump();
    }
  }

  private collectPickups(dt: number): void {
    const up = save.upgrades;
    const pullR = 44 + (up?.magnet ?? 0) * 12 + (this.magnetRun || this.magnetT > 0 ? MAGNET_RUN_BONUS : 0);
    const grabR = PR + 12 + (up?.magnet ?? 0) * 2;
    for (const c of this.pickups) {
      if (c.taken) continue;
      const dx = c.x - this.px;
      const dy = c.y - this.py;
      const d2 = dx * dx + dy * dy;
      if (c.home <= 0 && d2 < pullR * pullR) c.pull = Math.min(1, c.pull + dt * 8);
      if (d2 < grabR * grabR) this.collect(c);
    }
  }

  private collect(c: Pickup): void {
    c.taken = true;
    if (c.kind === 'gem') {
      this.gemsRun++;
      audio.gem();
      haptics.tap('medium');
      this.fx.burst(c.x, c.y, 20, ['#9ffcff', '#ffffff', '#b06bff'], 260, { type: PType.Star, size: 5 });
      this.addText(c.x, c.y - 18, '+1 GEMA', '#9ffcff', 22);
      bus.emit('run-gems', this.gemsRun);
    } else if (c.kind === 'shield') {
      if (this.shield) {
        this.addCoins(5);
        this.addText(c.x, c.y - 18, '+5', '#fff36b', 22);
      } else this.giveShield(true);
      audio.gem();
      haptics.tap('medium');
      this.fx.burst(c.x, c.y, 18, ['#9ffcff', '#ffffff', '#4fe3ff'], 260, { type: PType.Star, size: 5 });
      bus.emit('powerup', 'shield');
    } else if (c.kind === 'magnet') {
      this.magnetT = MAGNET_PICKUP_TIME;
      audio.gem();
      haptics.tap('medium');
      this.fx.burst(c.x, c.y, 18, ['#ff5c8a', '#ffffff', '#e8eef6'], 260, { type: PType.Star, size: 5 });
      this.addText(c.x, c.y - 18, 'ÍMÃ!', '#ff8aa8', 24);
      bus.emit('powerup', 'magnet');
    } else {
      this.coinChain++;
      this.coinChainT = 0.6;
      this.addCoins((1 + (save.upgrades?.coinValue ?? 0) * 0.2));
      audio.coin(this.coinChain);
      this.fx.burst(c.x, c.y, 8, ['#fff36b', '#ffd400', '#ffffff'], 180, { size: 3 });
    }
  }

  /** Soma moedas (aceita fração por causa do upgrade de valor da moeda). */
  private addCoins(v: number): void {
    this.coinFrac += v;
    const add = Math.floor(this.coinFrac + 1e-6);
    if (add <= 0) return;
    this.coinFrac -= add;
    this.coinsRun += add;
    bus.emit('run-coins', this.coinsRun);
  }

  private giveShield(announce: boolean): void {
    this.shield = true;
    this.shieldPop = 1;
    if (announce) this.addText(this.px, this.py - 40, 'ESCUDO!', '#7dfcff', 26);
    bus.emit('shield', true);
  }

  private breakShield(): void {
    this.shield = false;
    this.shieldPop = 0;
    this.inv = 1 + (save.upgrades?.shield ?? 0) * 0.25;
    this.fx.burst(this.px, this.py, 24, ['#c8fbff', '#4fe3ff', '#ffffff'], 340, { type: PType.Confetti, size: 4, vr: 10, drag: 2.5, life: 0.7 });
    this.fx.spawn({ x: this.px, y: this.py, life: 0.5, size: PR * 1.75, size2: 6, color: '#9ffcff', type: PType.Ring });
    this.flash = 0.35;
    this.flashColor = '#9ffcff';
    this.trauma = Math.max(this.trauma, 0.45);
    this.hitStop = 0.06;
    audio.crack();
    haptics.tap('heavy');
    bus.emit('shield', false);
  }

  private explodePlanet(p: Planet): void {
    p.destroyed = true;
    const pal = PLANET_PALETTES[p.kind][p.palIdx];
    this.fx.burst(p.x, p.y, 40, [pal.a, pal.b, pal.c], 380, { type: PType.Chunk, size: 7, vr: 6, drag: 1.5, additive: false, life: 1 });
    this.fx.burst(p.x, p.y, 25, [pal.atmo, '#ffffff'], 300, { size: 8 });
    this.fx.spawn({ x: p.x, y: p.y, life: 0.6, size: p.r, size2: 10, color: '#ffffff', type: PType.Ring });
    this.trauma = 0.7;
    audio.hit();
    if (this.planet === p) {
      const a = p.rot + this.local;
      this.planet = null;
      this.vx = Math.cos(a) * 200;
      this.vy = Math.sin(a) * 200;
      this.die('collapse');
    }
  }

  private die(reason: string): void {
    if (this.state !== 'play') return;
    if (this.rocketLeft > 0) return;
    if (this.shield && this.saveByShield(reason)) return;
    this.state = 'dying';
    this.pState = 'dead';
    this.planet = null;
    this.dyingT = 1.0;
    this.timeScale = 0.25;
    this.slowT = 0;
    this.hitStop = 0.08;
    this.trauma = 0.8;
    this.flash = 0.5;
    this.flashColor = '#ff4f6a';
    if (Math.hypot(this.vx, this.vy) < 50) {
      this.vx = rand(-100, 100);
      this.vy = -250;
    } else {
      this.vx *= 0.3;
      this.vy = -260;
    }
    this.fx.burst(this.px, this.py, 30, ['#ffffff', this.skin.light, this.skin.dark, '#ff4f6a'], 380, { size: 6 });
    audio.hit();
    audio.setIntensity(0);
    haptics.tap('heavy');
    bus.emit('state', 'dying');
  }

  /** O escudo salva de qualquer morte uma vez. */
  private saveByShield(reason: string): boolean {
    if (reason === 'collapse') {
      // planeta explodiu: o escudo arremessa o jogador para fora
      const sp = Math.hypot(this.vx, this.vy) || 1;
      const js = JUMP_SPEED * this.jumpFactor();
      this.vx = (this.vx / sp) * js;
      this.vy = (this.vy / sp) * js;
      this.origin = this.lastPlanet;
      this.pState = 'fly';
      this.flyT = 0;
      this.breakShield();
      return true;
    }
    if (reason === 'lost') {
      // perdido no espaço: o escudo leva de volta ao último planeta seguro
      let p = this.lastPlanet;
      if (!p || p.destroyed) p = this.nextTarget();
      if (!p) return false;
      this.breakShield();
      this.attach(p, -Math.PI / 2 - p.rot);
      this.lastPlanet = p;
      this.landGrace = 0.3;
      this.fx.burst(this.px, this.py, 24, ['#ffffff', '#9ffcff', this.skin.light], 280, { type: PType.Star, size: 5 });
      this.addText(this.px, this.py - 40, 'SALVO!', '#7dfcff', 26);
      return true;
    }
    this.breakShield();
    return true;
  }

  private finish(): void {
    this.state = 'over';
    const res: RunResult = {
      score: this.score,
      best: Math.max(save.best, this.score),
      newBest: this.score > save.best && this.score > 0,
      coins: this.coinsRun,
      gems: this.gemsRun,
      perfects: this.perfects,
      planets: this.planetsRun,
      canRevive: !this.revived && this.score > 0,
      asteroids: this.asteroidsRun,
      maxSpeedTier: this.maxSpeedTier,
      duration: Math.round(this.runTime * 10) / 10,
    };
    if (this.race) {
      // corrida: sem "continuar"; a UI da corrida mostra a espera/resultado
      res.canRevive = false;
      bus.emit('race-dead', this.raceProgress);
      return;
    }
    bus.emit('gameover', res);
  }

  /** Chamado pela UI quando o jogador recusa o "continuar". */
  get runStats() {
    return {
      coins: this.coinsRun,
      gems: this.gemsRun,
      perfects: this.perfects,
      planets: this.planetsRun,
      asteroids: this.asteroidsRun,
      maxSpeedTier: this.maxSpeedTier,
    };
  }

  private updateWorld(dt: number): void {
    const top = Math.min(this.camY, this.py - this.viewH * 0.4) - this.viewH * 0.6;
    while (this.planets[this.planets.length - 1].y > top) this.planets.push(this.makePlanet(this.planets[this.planets.length - 1]));
    const bottom = this.camY + this.viewH + 260;
    this.planets = this.planets.filter((p) => p.y - p.r < bottom || p === this.planet || p === this.lastPlanet);
    for (const c of this.pickups) {
      c.t += dt;
      if (c.home > 0) {
        c.home -= dt;
        const dk = 1 / (1 + 4 * dt);
        c.vx *= dk;
        c.vy *= dk;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        if (c.home <= 0) c.pull = 1;
      } else if (c.pull > 0 && !c.taken) {
        c.x = lerp(c.x, this.px, c.pull * 0.35);
        c.y = lerp(c.y, this.py, c.pull * 0.35);
      }
    }
    if (this.pickups.length > 60 || this.pickups.some((c) => c.taken || c.y > bottom)) this.pickups = this.pickups.filter((c) => !c.taken && c.y < bottom);
  }

  private updateCamera(dt: number): void {
    let focus = this.py;
    if (this.pState === 'orbit' && this.planet) focus = this.planet.y;
    if (this.pState === 'fly') focus = this.rocketLeft > 0 ? this.py : Math.min(this.py, this.origin ? this.origin.y : this.py);
    if (this.pState === 'dead') return;
    const target = focus - this.viewH * 0.64;
    const rate = this.rocketLeft > 0 ? 8 : this.pState === 'fly' ? 3.2 : 4.5;
    this.camY = lerp(this.camY, target, Math.min(1, dt * rate));
  }

  private addText(x: number, y: number, text: string, color: string, size: number): void {
    const half = text.length * size * 0.32 + 8;
    const cx = clamp(x, this.camX + half, this.camX + this.viewW - half);
    this.texts.push({ x: cx, y, text, color, life: 1, max: 1, size });
  }

  /* ============================== render ============================== */

  private render(): void {
    const x = this.ctx;
    const d = this.dpr;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'source-over';

    /* ---- fundo ---- */
    const bi = Math.floor(this.bgPhase);
    const bf = this.bgPhase - bi;
    const b0 = BIOMES[bi % BIOMES.length];
    const b1 = BIOMES[(bi + 1) % BIOMES.length];
    const g = x.createLinearGradient(0, 0, 0, ch);
    g.addColorStop(0, mixHex(b0.top, b1.top, bf));
    g.addColorStop(1, mixHex(b0.bot, b1.bot, bf));
    x.fillStyle = g;
    x.fillRect(0, 0, cw, ch);

    const camPx = this.camY * this.scale * d;
    // nebulosa
    x.globalCompositeOperation = 'lighter';
    const nebSize = Math.max(cw, ch) * 1.1;
    for (const [neb, alpha] of [[this.nebulas[bi % BIOMES.length], 1 - bf], [this.nebulas[(bi + 1) % BIOMES.length], bf]] as const) {
      if (alpha <= 0.01) continue;
      x.globalAlpha = alpha;
      const oy = ((-camPx * 0.08) % (nebSize * 1.6) + nebSize * 1.6) % (nebSize * 1.6) - nebSize * 0.8;
      x.drawImage(neb, cw / 2 - nebSize * 0.6, oy - nebSize * 0.3, nebSize, nebSize);
      x.drawImage(neb, cw / 2 - nebSize * 0.3, oy - nebSize * 1.9, nebSize, nebSize);
    }
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'source-over';

    // planeta distante decorativo
    const far = this.farPlanets[bi % BIOMES.length];
    if (far) {
      const span = ch * 2.2;
      const fy = ((-camPx * 0.05) % span + span) % span - far.size;
      x.globalAlpha = 0.55 * (1 - bf);
      const fx = cw * 0.78;
      x.drawImage(far.atmo, fx - far.atmo.width / 2, fy - far.atmo.height / 2);
      if (far.ringBack) x.drawImage(far.ringBack, fx - far.ringBack.width / 2, fy - far.ringBack.height / 2);
      x.drawImage(far.surface, fx - far.size / 2, fy - far.size / 2);
      x.drawImage(far.light, fx - far.size / 2, fy - far.size / 2);
      if (far.ringFront) x.drawImage(far.ringFront, fx - far.ringFront.width / 2, fy - far.ringFront.height / 2);
      x.globalAlpha = 1;
    }

    // estrelas parallax
    const factors = [0.04, 0.1, 0.2];
    for (let i = 0; i < 3; i++) {
      const tile = this.starTiles[i];
      const ts = tile.width;
      const off = ((-camPx * factors[i]) % ts + ts) % ts;
      x.globalAlpha = i === 2 ? 0.75 + 0.25 * Math.sin(this.time * 2) : 1;
      for (let ty = off - ts; ty < ch; ty += ts) for (let tx = 0; tx < cw; tx += ts) x.drawImage(tile, tx, ty);
    }
    x.globalAlpha = 1;

    // estrela cadente
    if (this.shoot.life > 0) {
      const s = this.shoot;
      const tx = s.x * d;
      const ty = s.y * d;
      const lg = x.createLinearGradient(tx, ty, tx - s.vx * 0.15 * d, ty - s.vy * 0.15 * d);
      lg.addColorStop(0, `rgba(255,255,255,${Math.min(1, s.life * 2)})`);
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      x.strokeStyle = lg;
      x.lineWidth = 2 * d;
      x.beginPath();
      x.moveTo(tx, ty);
      x.lineTo(tx - s.vx * 0.15 * d, ty - s.vy * 0.15 * d);
      x.stroke();
    }

    this.drawBackFx(x, d, cw, ch);

    /* ---- mundo ---- */
    const sh = this.trauma * this.trauma;
    const shx = sh * 14 * Math.sin(this.time * 63.1);
    const shy = sh * 14 * Math.cos(this.time * 71.7);
    const S = this.S;
    x.setTransform(S, 0, 0, S, (-this.camX + shx) * S, (-this.camY + shy) * S);

    const vt = this.camY - 120;
    const vb = this.camY + this.viewH + 120;

    // atmosferas (aditivo) + discos dos poços gravitacionais
    x.globalCompositeOperation = 'lighter';
    for (const p of this.planets) {
      if (p.destroyed || p.y + p.r * 3.5 < vt || p.y - p.r * 3.5 > vb) continue;
      const sp = this.spriteOf(p);
      if (p.well) {
        const wr = p.r * 3.1;
        x.save();
        x.translate(p.x, p.y);
        x.rotate(-this.time * 1.6);
        x.globalAlpha = 0.85;
        x.drawImage(this.wellSpr, -wr, -wr, wr * 2, wr * 2);
        x.rotate(this.time * 2.7);
        x.globalAlpha = 0.45;
        x.drawImage(this.wellSpr, -wr * 0.7, -wr * 0.7, wr * 1.4, wr * 1.4);
        x.restore();
        x.globalAlpha = 1;
      }
      const ar = p.r * 1.55 * (1 + p.pulse * 0.08);
      x.drawImage(sp.atmo, p.x - ar, p.y - ar, ar * 2, ar * 2);
    }
    x.globalCompositeOperation = 'source-over';

    // guia de mira
    if (this.state !== 'over' && this.pState === 'orbit' && this.planet && (this.showGuide || this.state === 'menu' || save.runs < 3)) {
      const a = this.planet.rot + this.local;
      const len = this.showGuide && save.runs < 3 ? 170 : 90;
      for (let i = 1; i <= 8; i++) {
        const t = i / 8;
        x.globalAlpha = (1 - t) * 0.7;
        x.fillStyle = '#ffffff';
        x.beginPath();
        x.arc(this.px + Math.cos(a) * (PR + t * len), this.py + Math.sin(a) * (PR + t * len), 2.4 * (1 - t * 0.5), 0, TAU);
        x.fill();
      }
      x.globalAlpha = 1;
    }

    // planetas
    for (const p of this.planets) {
      if (p.destroyed || p.y + p.r * 2 < vt || p.y - p.r * 2 > vb) continue;
      const sp = this.spriteOf(p);
      const k = 1 + Math.sin(p.pulse * Math.PI) * 0.06;
      const r = p.r * k;
      let ox = 0;
      if (p.fragile && p.crackT > 0) ox = Math.sin(this.time * 70) * (p.crackT / FRAGILE_TIME) * 2.5;
      const cx = p.x + ox;
      if (sp.ringBack) {
        const rw = sp.ringBack.width / S;
        const rh = sp.ringBack.height / S;
        x.save();
        x.translate(cx, p.y);
        x.rotate(-0.35);
        x.drawImage(sp.ringBack, -rw / 2, -rh / 2, rw, rh);
        x.restore();
      }
      x.save();
      x.translate(cx, p.y);
      x.rotate(p.rot);
      x.drawImage(sp.surface, -r, -r, r * 2, r * 2);
      x.restore();
      x.drawImage(sp.light, cx - r, p.y - r, r * 2, r * 2);
      if (p.fragile) this.drawCracks(x, p, cx, r);
      if (sp.ringFront) {
        const rw = sp.ringFront.width / S;
        const rh = sp.ringFront.height / S;
        x.save();
        x.translate(cx, p.y);
        x.rotate(-0.35);
        x.drawImage(sp.ringFront, -rw / 2, -rh / 2, rw, rh);
        x.restore();
      }
      if (p.toxic) this.drawToxic(x, p);
      if (p.asteroids.length) this.drawAsteroids(x, p);
    }

    // moedas, gemas e power-ups
    for (const c of this.pickups) {
      if (c.taken || c.y < vt || c.y > vb) continue;
      const bob = Math.sin(c.t * 3) * 3;
      if (c.kind === 'gem') {
        x.globalCompositeOperation = 'lighter';
        x.drawImage(glow('#7df9ff', 32), c.x - 22, c.y - 22 + bob, 44, 44);
        x.globalCompositeOperation = 'source-over';
        const s = this.gemSpr.width / S;
        x.drawImage(this.gemSpr, c.x - s / 2, c.y - s / 2 + bob, s, s);
      } else if (c.kind === 'shield' || c.kind === 'magnet') {
        const spr = c.kind === 'shield' ? this.shieldPickSpr : this.magnetPickSpr;
        x.globalCompositeOperation = 'lighter';
        x.globalAlpha = 0.7 + 0.3 * Math.sin(c.t * 5);
        x.drawImage(glow(c.kind === 'shield' ? '#4fe3ff' : '#ff5c8a', 32), c.x - 30, c.y - 30 + bob, 60, 60);
        x.globalAlpha = 1;
        x.globalCompositeOperation = 'source-over';
        const s = (spr.width / S) * (1 + Math.sin(c.t * 4) * 0.06);
        x.drawImage(spr, c.x - s / 2, c.y - s / 2 + bob, s, s);
      } else {
        const w = Math.abs(Math.cos(c.t * 2.6));
        const s = this.coinSpr.width / S;
        x.globalCompositeOperation = 'lighter';
        x.globalAlpha = 0.5;
        x.drawImage(glow('#ffd400', 32), c.x - 14, c.y - 14 + bob, 28, 28);
        x.globalAlpha = 1;
        x.globalCompositeOperation = 'source-over';
        x.drawImage(this.coinSpr, c.x - (s * Math.max(0.12, w)) / 2, c.y - s / 2 + bob, s * Math.max(0.12, w), s);
      }
    }

    this.fx.draw(x);
    if (this.race) this.drawGhosts(x);
    this.drawHero(x);

    // textos flutuantes
    for (const t of this.texts) {
      const k = 1 - t.life / t.max;
      const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.55 : 1.15 - Math.min(0.15, (k - 0.15) * 0.6);
      x.save();
      x.translate(t.x, t.y);
      x.scale(pop, pop);
      x.globalAlpha = Math.min(1, t.life * 2.5);
      x.font = `700 ${t.size}px Fredoka, system-ui, sans-serif`;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.lineWidth = 5;
      x.strokeStyle = 'rgba(30,5,60,0.85)';
      x.lineJoin = 'round';
      x.strokeText(t.text, 0, 0);
      x.fillStyle = t.color;
      x.fillText(t.text, 0, 0);
      x.restore();
    }
    x.globalAlpha = 1;

    /* ---- pós ---- */
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.drawImage(this.vignette, 0, 0);
    if (this.race && !this.race.ended) this.drawGhostMarkers(x);
    if (this.warn > 0) {
      // bordas vermelhas pulsando quando um asteroide se aproxima
      x.globalAlpha = (0.2 + this.warn * 0.6) * (0.7 + 0.3 * Math.sin(this.time * 22));
      x.drawImage(this.edgeRed, 0, 0, cw, ch);
      x.globalAlpha = 1;
    }
    if (this.warpT > 0) this.drawWarp(x, cw, ch, d);
    if (this.flash > 0) {
      x.globalAlpha = this.flash * 0.5;
      x.fillStyle = this.flashColor;
      x.fillRect(0, 0, cw, ch);
      x.globalAlpha = 1;
    }
  }

  /** Linhas de velocidade e meteoros (espaço de tela). */
  private drawBackFx(x: CanvasRenderingContext2D, d: number, _cw: number, _ch: number): void {
    // meteoros (Pôr do Sol Cósmico)
    let anyMeteor = false;
    for (const m of this.meteors) {
      if (m.life <= 0) continue;
      if (!anyMeteor) {
        anyMeteor = true;
        x.globalCompositeOperation = 'lighter';
      }
      const L = this.meteorSpr.width * m.s;
      const T = this.meteorSpr.height * m.s;
      x.globalAlpha = Math.min(1, m.life * 2);
      x.save();
      x.translate(m.x * d, m.y * d);
      x.rotate(Math.atan2(m.vy, m.vx));
      x.drawImage(this.meteorSpr, -L, -T / 2, L, T);
      x.restore();
    }
    if (anyMeteor) {
      x.globalAlpha = 1;
      x.globalCompositeOperation = 'source-over';
    }

    // linhas de velocidade (descem: o mundo passa por nós)
    const la = this.linesAlpha();
    if (la > 0.01) {
      const L = this.lines;
      x.globalCompositeOperation = 'lighter';
      x.globalAlpha = la * 0.55;
      x.strokeStyle = this.rocketLeft > 0 ? '#ffcf8a' : '#bfefff';
      x.lineWidth = 1.6 * d;
      x.lineCap = 'round';
      x.beginPath();
      for (let i = 0; i < N_LINES; i++) {
        const lx = L[i * 4] * d;
        const ly = L[i * 4 + 1] * d;
        x.moveTo(lx, ly);
        x.lineTo(lx, ly - L[i * 4 + 2] * d * (0.6 + this.speed * 0.4));
      }
      x.stroke();
      x.globalAlpha = 1;
      x.globalCompositeOperation = 'source-over';
    }
  }

  /** Efeito de dobra espacial na troca de bioma. */
  private drawWarp(x: CanvasRenderingContext2D, cw: number, ch: number, d: number): void {
    const k = 1 - this.warpT / 1.4; // 0 → 1
    const a = Math.sin(Math.min(1, k) * Math.PI);
    const cx = cw / 2;
    const cy = ch * 0.45;
    const maxR = Math.hypot(cw, ch) * 0.6;
    x.globalCompositeOperation = 'lighter';
    x.globalAlpha = a * 0.8;
    x.strokeStyle = this.warpColor;
    x.lineWidth = 2.5 * d;
    x.lineCap = 'round';
    x.beginPath();
    for (let i = 0; i < N_WARP; i++) {
      const ang = this.warpSeed[i * 2];
      const f = (this.warpSeed[i * 2 + 1] + k * 1.8) % 1;
      const r0 = maxR * f * f;
      const r1 = r0 + maxR * (0.08 + f * 0.25);
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      x.moveTo(cx + c * r0, cy + s * r0);
      x.lineTo(cx + c * r1, cy + s * r1);
    }
    x.stroke();
    x.globalAlpha = a * 0.25;
    x.drawImage(glow(this.warpColor, 64), cx - maxR * 0.5, cy - maxR * 0.5, maxR, maxR);
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'source-over';
  }

  private drawToxic(x: CanvasRenderingContext2D, p: Planet): void {
    const f = p.toxT / TOX_PERIOD;
    const warnK = clamp((p.toxT - (TOX_PERIOD - TOX_WARN)) / TOX_WARN, 0, 1);
    const R = p.r + 7;
    x.lineCap = 'round';
    // contagem regressiva ao redor do planeta
    x.strokeStyle = warnK > 0 ? `rgba(160,255,90,${0.55 + 0.45 * Math.sin(this.time * 18)})` : 'rgba(125,255,107,0.35)';
    x.lineWidth = 3 + warnK * 2;
    x.beginPath();
    x.arc(p.x, p.y, R, -Math.PI / 2, -Math.PI / 2 + f * TAU);
    x.stroke();
    if (warnK > 0) {
      x.globalCompositeOperation = 'lighter';
      x.globalAlpha = warnK * 0.6;
      x.drawImage(glow('#7dff6b', 64), p.x - R * 1.6, p.y - R * 1.6, R * 3.2, R * 3.2);
      x.globalAlpha = 1;
      x.globalCompositeOperation = 'source-over';
    }
  }

  private drawAsteroids(x: CanvasRenderingContext2D, p: Planet): void {
    const S = this.S;
    const cur = this.planet === p && this.pState === 'orbit';
    // trilha da órbita dos asteroides (deixa claro por onde eles passam)
    x.setLineDash(DASH);
    x.lineDashOffset = -this.time * 20 * Math.sign(p.asteroids[0].speed);
    x.strokeStyle = cur ? 'rgba(255,80,100,0.45)' : 'rgba(255,80,100,0.25)';
    x.lineWidth = 1.5;
    x.beginPath();
    x.arc(p.x, p.y, p.asteroids[0].dist, 0, TAU);
    x.stroke();
    x.setLineDash(NO_DASH);

    // alerta: arco vermelho na superfície entre o asteroide e o jogador
    if (cur) {
      const th = p.rot + this.local;
      for (const a of p.asteroids) {
        if (a.tti >= WARN_TTI) continue;
        const k = 1 - a.tti / WARN_TTI;
        const w = (a.speed - p.spin) * this.speed;
        const rel = angleDiff(th, a.ang);
        const gap = rel * w < 0 ? Math.abs(rel) : TAU - Math.abs(rel);
        const sweep = Math.sign(w) * gap;
        const pulse = 0.5 + 0.5 * Math.sin(this.time * 24);
        x.lineCap = 'round';
        x.strokeStyle = `rgba(255,40,70,${(0.25 + 0.25 * pulse) * (0.4 + 0.6 * k)})`;
        x.lineWidth = 12;
        x.beginPath();
        x.arc(p.x, p.y, p.r + 3, a.ang, a.ang + sweep, sweep < 0);
        x.stroke();
        x.strokeStyle = `rgba(255,${Math.round(120 - 80 * k)},${Math.round(130 - 80 * k)},${0.6 + 0.4 * pulse})`;
        x.lineWidth = 4;
        x.stroke();
      }
    }

    for (let i = 0; i < p.asteroids.length; i++) {
      const a = p.asteroids[i];
      const ax = p.x + Math.cos(a.ang) * a.dist;
      const ay = p.y + Math.sin(a.ang) * a.dist;
      const danger = cur && a.tti < WARN_TTI;
      x.globalCompositeOperation = 'lighter';
      x.globalAlpha = danger ? 0.9 : 0.55 + 0.15 * Math.sin(this.time * 6 + i);
      x.drawImage(glow('#ff3b5c', 32), ax - a.size * 2.4, ay - a.size * 2.4, a.size * 4.8, a.size * 4.8);
      x.globalAlpha = 1;
      x.globalCompositeOperation = 'source-over';
      const spr = this.astSpr[i % this.astSpr.length];
      x.save();
      x.translate(ax, ay);
      x.rotate(a.rot);
      const s = spr.width / S;
      x.drawImage(spr, -s / 2, -s / 2, s, s);
      // rosto bravo: "em pé" em relação ao planeta
      x.rotate(a.ang + Math.PI / 2 - a.rot);
      const fs = this.astFace.width / S;
      x.drawImage(this.astFace, -fs / 2, -fs / 2, fs, fs);
      x.restore();
      if (danger) {
        // marcador "!" acima do asteroide
        const k = 1 - a.tti / WARN_TTI;
        const mx = p.x + Math.cos(a.ang) * (a.dist + 26);
        const my = p.y + Math.sin(a.ang) * (a.dist + 26);
        const ms = (this.warnSpr.width / S) * (0.9 + 0.25 * k + 0.12 * Math.sin(this.time * 24));
        x.drawImage(this.warnSpr, mx - ms / 2, my - ms / 2, ms, ms);
      }
    }
  }

  private drawCracks(x: CanvasRenderingContext2D, p: Planet, cx: number, r: number): void {
    const k = p.crackT > 0 ? p.crackT / FRAGILE_TIME : 0;
    x.save();
    x.translate(cx, p.y);
    x.rotate(p.rot);
    x.strokeStyle = k > 0 ? `rgba(255,${Math.round(220 - k * 180)},120,${0.5 + k * 0.5})` : 'rgba(30,10,40,0.55)';
    x.lineWidth = 2 + k * 2;
    x.lineCap = 'round';
    if (k > 0) {
      x.shadowColor = '#ff7a1a';
      x.shadowBlur = 10 * k * this.S;
    }
    const n = 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + p.seed;
      const len = r * (0.45 + 0.5 * Math.max(0.35, k));
      x.beginPath();
      x.moveTo(Math.cos(a) * r * 0.1, Math.sin(a) * r * 0.1);
      x.lineTo(Math.cos(a + 0.25) * len * 0.5, Math.sin(a + 0.25) * len * 0.5);
      x.lineTo(Math.cos(a - 0.1) * len, Math.sin(a - 0.1) * len);
      x.stroke();
    }
    x.restore();
  }

  private drawHero(x: CanvasRenderingContext2D): void {
    if (this.state === 'over' && this.pState === 'dead') return;
    const rot = this.pState === 'dead' ? this.deadSpin : this.upAng + Math.PI / 2;
    // brilho
    x.globalCompositeOperation = 'lighter';
    x.globalAlpha = 0.55;
    x.drawImage(glow(this.skin.light, 64), this.px - PR * 2.6, this.py - PR * 2.6, PR * 5.2, PR * 5.2);
    if (this.rocketLeft > 0) {
      x.globalAlpha = 0.8;
      x.drawImage(glow('#ff8a3c', 64), this.px - PR * 3.4, this.py - PR * 3.4, PR * 6.8, PR * 6.8);
    }
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'source-over';

    // ímã ativo: arcos girando no raio de coleta
    if ((this.magnetRun || this.magnetT > 0) && this.pState !== 'dead') {
      const blinkOut = this.magnetT > 0 && this.magnetT < 2 && !this.magnetRun ? 0.5 + 0.5 * Math.sin(this.time * 20) : 1;
      const mr = 44 + MAGNET_RUN_BONUS * 0.55;
      x.strokeStyle = `rgba(255,120,160,${0.35 * blinkOut})`;
      x.lineWidth = 2;
      x.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const a0 = this.time * 2.2 + (i / 3) * TAU;
        x.beginPath();
        x.arc(this.px, this.py, mr, a0, a0 + 0.9);
        x.stroke();
      }
    }

    // direção do olhar: próximo planeta
    let lookX = 0;
    let lookY = -1;
    const next = this.nextTarget();
    if (next && this.pState !== 'dead') {
      const dx = next.x - this.px;
      const dy = next.y - this.py;
      const cos = Math.cos(-rot);
      const sin = Math.sin(-rot);
      const lx = dx * cos - dy * sin;
      const ly = dx * sin + dy * cos;
      const l = Math.hypot(lx, ly) || 1;
      lookX = lx / l;
      lookY = ly / l;
    }
    const cos = Math.cos(-rot);
    const sin = Math.sin(-rot);
    const pose: PlayerPose = {
      t: this.time,
      blink: this.blink,
      lookX,
      lookY,
      sx: this.sx,
      sy: this.sy,
      mood: this.pState === 'dead' ? 'dead' : this.pState === 'fly' ? 'fly' : this.happyT > 0 ? 'happy' : 'idle',
      lx: LIGHT.x * cos - LIGHT.y * sin,
      ly: LIGHT.x * sin + LIGHT.y * cos,
    };
    x.save();
    x.translate(this.px, this.py);
    x.rotate(rot);
    if (this.inv > 0 && Math.floor(this.time * 12) % 2 === 0) x.globalAlpha = 0.6;
    drawPlayer(x, this.skin, PR, pose);
    x.restore();
    x.globalAlpha = 1;
    if (this.shield && this.pState !== 'dead') {
      const pop = this.shieldPop > 0 ? 1 + Math.sin(this.shieldPop * Math.PI) * 0.25 : 1;
      const s = (this.shieldSpr.width / this.S) * pop * (1 + 0.03 * Math.sin(this.time * 5));
      x.globalAlpha = 0.85 + 0.15 * Math.sin(this.time * 3);
      x.drawImage(this.shieldSpr, this.px - s / 2, this.py - s / 2, s, s);
      x.globalAlpha = 1;
    }
    if (this.inv > 0) {
      x.strokeStyle = `rgba(125,252,255,${0.4 + 0.3 * Math.sin(this.time * 10)})`;
      x.lineWidth = 2.5;
      x.beginPath();
      x.arc(this.px, this.py, PR * 1.7, 0, TAU);
      x.stroke();
    }
  }

  /* ============================== fantasmas ============================== */

  private ghostSprite(skin: Skin): HTMLCanvasElement {
    let c = this.ghostSpr.get(skin.id);
    if (c) return c;
    const R = PR * 0.92 * this.S;
    const [cv, cx] = makeCanvas(R * 3.2, R * 3.2);
    cx.translate(cv.width / 2, cv.height / 2);
    drawPlayer(cx, skin, R, { t: 0, blink: 0, lookX: 0, lookY: -1, sx: 1, sy: 1, mood: 'idle', lx: LIGHT.x, ly: LIGHT.y, still: true });
    this.ghostSpr.set(skin.id, cv);
    c = cv;
    return c;
  }

  private updateGhosts(dt: number): void {
    const race = this.race!;
    let minN = Infinity;
    let maxN = -Infinity;
    for (const p of this.planets) {
      if (p.n < minN) minN = p.n;
      if (p.n > maxN) maxN = p.n;
    }
    for (const g of race.ghosts) {
      if (!g.alive) {
        g.fade = Math.max(0, g.fade - dt * 0.9);
        g.vy += 700 * dt;
        g.y += g.vy * dt;
        continue;
      }
      const pl = this.planets.find((q) => q.n === g.p && !q.destroyed) ?? this.planets.find((q) => q.n === g.p);
      let tx: number;
      let ty: number;
      if (pl) {
        const a = pl.rot + g.ang;
        const dist = pl.r + PR * 0.92 - 1;
        tx = pl.x + Math.cos(a) * dist;
        ty = pl.y + Math.sin(a) * dist;
      } else if (g.p > maxN) {
        // à frente do que já foi gerado: "voando" acima da tela
        tx = W / 2 + Math.cos(g.ang) * 80;
        ty = this.camY - 120 - (g.p - maxN) * 40;
      } else {
        tx = W / 2;
        ty = this.camY + this.viewH + 160;
      }
      if (!g.placed) {
        g.x = g.fromX = tx;
        g.y = g.fromY = ty;
        g.placed = true;
      }
      if (g.hop < 1) {
        g.hop = Math.min(1, g.hop + dt / GHOST_HOP);
        const k = 1 - Math.pow(1 - g.hop, 2);
        g.x = lerp(g.fromX, tx, k);
        g.y = lerp(g.fromY, ty, k) - Math.sin(k * Math.PI) * 30;
      } else {
        g.x = tx;
        g.y = ty;
      }
    }
  }

  private drawGhosts(x: CanvasRenderingContext2D): void {
    const S = this.S;
    const vt = this.camY - 60;
    const vb = this.camY + this.viewH + 60;
    for (const g of this.race!.ghosts) {
      if (g.fade <= 0 || g.y < vt || g.y > vb) continue;
      const pl = g.alive && g.hop >= 1 ? this.planets.find((q) => q.n === g.p) : null;
      const rot = pl ? pl.rot + g.ang + Math.PI / 2 : g.alive ? Math.atan2(g.y - g.fromY, g.x - g.fromX) + Math.PI / 2 : this.time * g.spin;
      const spr = this.ghostSprite(g.skin);
      const s = spr.width / S;
      x.globalAlpha = 0.5 * g.fade;
      x.globalCompositeOperation = 'lighter';
      x.drawImage(glow(g.color, 32), g.x - PR * 2, g.y - PR * 2, PR * 4, PR * 4);
      x.globalCompositeOperation = 'source-over';
      x.globalAlpha = 0.62 * g.fade;
      x.save();
      x.translate(g.x, g.y);
      x.rotate(rot);
      if (g.hop < 1) x.scale(0.82, 1.2);
      x.drawImage(spr, -s / 2, -s / 2, s, s);
      x.restore();
      // etiqueta com o nome
      x.globalAlpha = 0.92 * g.fade;
      x.font = '600 11px Fredoka, system-ui, sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      const label = g.alive ? g.name : g.name + ' caiu';
      const tw = x.measureText(label).width + 12;
      const ly = g.y - PR - 16;
      x.fillStyle = 'rgba(12,4,32,0.72)';
      x.beginPath();
      x.roundRect(g.x - tw / 2, ly - 8, tw, 16, 8);
      x.fill();
      x.strokeStyle = g.color;
      x.lineWidth = 1.2;
      x.stroke();
      x.fillStyle = '#ffffff';
      x.fillText(label, g.x, ly + 0.5);
    }
    x.globalAlpha = 1;
  }

  /** Setas na borda da tela para adversários fora de vista (acima = à frente). */
  private drawGhostMarkers(x: CanvasRenderingContext2D): void {
    const sc = this.scale * this.dpr;
    const d = this.dpr;
    const ahead: Ghost[] = [];
    const behind: Ghost[] = [];
    for (const g of this.race!.ghosts) {
      if (!g.alive) continue;
      if (g.y < this.camY + 10) ahead.push(g);
      else if (g.y > this.camY + this.viewH - 10) behind.push(g);
    }
    const draw = (list: Ghost[], top: boolean) => {
      list.sort((a, b) => (top ? b.p - a.p : a.p - b.p));
      list.forEach((g, i) => {
        const sx = clamp((g.x - this.camX) * sc, 40 * d, this.canvas.width - 40 * d);
        const sy = top ? (226 + i * 24) * d : this.canvas.height - (92 + i * 24) * d;
        x.font = `600 ${11 * d}px Fredoka, system-ui, sans-serif`;
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        const label = `${top ? '▲' : '▼'} ${g.name}`;
        const tw = x.measureText(label).width + 14 * d;
        x.globalAlpha = 0.85;
        x.fillStyle = 'rgba(12,4,32,0.75)';
        x.beginPath();
        x.roundRect(sx - tw / 2, sy - 9 * d, tw, 18 * d, 9 * d);
        x.fill();
        x.strokeStyle = g.color;
        x.lineWidth = 1.5 * d;
        x.stroke();
        x.fillStyle = '#ffffff';
        x.fillText(label, sx, sy + 0.5 * d);
      });
    };
    draw(ahead, true);
    draw(behind, false);
    x.globalAlpha = 1;
  }

  private nextTarget(): Planet | null {
    let best: Planet | null = null;
    for (const p of this.planets) if (!p.visited && !p.destroyed && (!best || p.y > best.y)) best = p;
    return best;
  }
}
