import { audio } from '../core/audio';
import { bus } from '../core/events';
import * as haptics from '../core/haptics';
import { save } from '../core/storage';
import { angleDiff, chance, clamp, lerp, makeCanvas, mixHex, pick, rand, TAU } from './math';
import { Particles, PType } from './particles';
import { skinById, trailById, type Skin, type Trail } from './skins';
import {
  buildAsteroid,
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

/* ------------------------------------------------------------------ */
const W = 400; // largura do "mundo" jogável (unidades)
const PR = 15; // raio do personagem
const JUMP_SPEED = 760;
const FRAGILE_TIME = 2.4;
const BIOME_LEN = 20;
const LIGHT = { x: -0.55, y: -0.83 };

interface Biome {
  top: string;
  bot: string;
  neb: string[];
  kinds: PlanetKind[];
  name: string;
}

const BIOMES: Biome[] = [
  { name: 'Nebulosa Roxa', top: '#0a0520', bot: '#2c0f58', neb: ['#7a3cff', '#ff4fd8', '#3c8cff'], kinds: ['rocky', 'gas', 'candy', 'terra'] },
  { name: 'Mar Estelar', top: '#020a1c', bot: '#07395c', neb: ['#00c2ff', '#3cffd0', '#2b5cff'], kinds: ['ice', 'terra', 'gas', 'crystal'] },
  { name: 'Pôr do Sol Cósmico', top: '#16041a', bot: '#5c1638', neb: ['#ff7a3c', '#ff3c8c', '#ffcf4f'], kinds: ['lava', 'candy', 'gas', 'rocky'] },
  { name: 'Selva Tóxica', top: '#01120e', bot: '#0a4532', neb: ['#3cff8c', '#c4ff3c', '#00e0c0'], kinds: ['toxic', 'terra', 'crystal', 'gas'] },
  { name: 'Coração da Galáxia', top: '#0e0322', bot: '#43105e', neb: ['#d04fff', '#ff5ca8', '#6c5cff'], kinds: ['crystal', 'candy', 'rocky', 'ice'] },
];

interface Asteroid {
  ang: number;
  dist: number;
  speed: number;
  size: number;
  rot: number;
  vr: number;
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
}

interface Pickup {
  x: number;
  y: number;
  gem: boolean;
  taken: boolean;
  t: number;
  pull: number;
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

type GameState = 'menu' | 'play' | 'dying' | 'over';

export interface RunResult {
  score: number;
  best: number;
  newBest: boolean;
  coins: number;
  gems: number;
  perfects: number;
  planets: number;
  canRevive: boolean;
}

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
  private trailT = 0;
  private deadSpin = 0;
  private happyT = 0;

  // corrida
  score = 0;
  private coinsRun = 0;
  private gemsRun = 0;
  private perfectStreak = 0;
  private perfects = 0;
  private planetsRun = 0;
  private revived = false;
  private coinChain = 0;
  private coinChainT = 0;
  private dyingT = 0;
  private showGuide = true;

  // efeitos
  private trauma = 0;
  private flash = 0;
  private flashColor = '#ffffff';
  private hitStop = 0;
  private timeScale = 1;
  private time = 0;
  private bgPhase = 0;
  private shootT = 3;
  private shoot = { x: 0, y: 0, vx: 0, vy: 0, life: 0 };

  // sprites dependentes da escala
  private coinSpr!: HTMLCanvasElement;
  private gemSpr!: HTMLCanvasElement;
  private astSpr: HTMLCanvasElement[] = [];
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

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.dprCap = save.lowFx ? 1.25 : 2;
    this.fx.budget = save.lowFx ? 0.5 : 1;
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
    const S = this.S;
    this.coinSpr = buildCoin(9 * S);
    this.gemSpr = buildGem(11 * S);
    this.astSpr = [0, 1, 2].map((i) => buildAsteroid(10 * S, 100 + i));
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
  }

  private spriteOf(p: Planet): PlanetSprite {
    if (!p.sprite) p.sprite = buildPlanetSprite(p.kind, PLANET_PALETTES[p.kind][p.palIdx], p.r * this.S, p.seed, p.ringed);
    return p.sprite;
  }

  /* ============================== mundo ============================== */

  reset(state: GameState): void {
    this.planets = [];
    this.pickups = [];
    this.texts = [];
    this.fx.clear();
    this.nGen = 0;
    this.score = 0;
    this.coinsRun = 0;
    this.gemsRun = 0;
    this.perfects = 0;
    this.perfectStreak = 0;
    this.planetsRun = 0;
    this.revived = false;
    this.inv = 0;
    this.timeScale = 1;
    this.trauma = 0;
    this.flash = 0;
    this.showGuide = true;
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
    const d = clamp(n / 70, 0, 1);
    const biome = BIOMES[Math.floor(n / BIOME_LEN) % BIOMES.length];
    let r = n === 0 ? 52 : clamp(rand(38, 54) - n * 0.32, 24, 56) + rand(-4, 4);
    r = Math.round(r);
    let x = W / 2;
    let y = 0;
    if (prev) {
      const gap = Math.max(prev.r + r + 85, rand(175, 235) + Math.min(n * 0.7, 45));
      for (let tries = 0; tries < 20; tries++) {
        x = rand(r + 22, W - r - 22);
        const dx = Math.abs(x - prev.baseX);
        if (n < 3 ? dx < 70 : dx > 40 && dx < 250) break;
      }
      y = prev.y - gap;
    }
    const dir = chance(0.5) ? 1 : -1;
    const spin = n < 2 ? 1.15 * dir : dir * (1.25 + Math.min(n * 0.022, 1.5)) * rand(0.85, 1.15);
    const kind = n === 0 ? 'rocky' : pick(biome.kinds);
    const p: Planet = {
      n,
      x,
      y,
      baseX: x,
      r,
      rot: rand(0, TAU),
      spin,
      kind,
      palIdx: Math.floor(Math.random() * PLANET_PALETTES[kind].length),
      seed: Math.floor(Math.random() * 1e9),
      ringed: (kind === 'gas' || kind === 'rocky' || kind === 'ice') && chance(0.3),
      sprite: null,
      visited: false,
      fragile: n >= 12 && chance(0.16 + d * 0.12),
      crackT: 0,
      destroyed: false,
      driftAmp: 0,
      driftFreq: 0,
      driftPh: rand(0, TAU),
      asteroids: [],
      pulse: 0,
    };
    if (n >= 7 && chance(0.25 + d * 0.35)) {
      const count = 1 + (n > 25 && chance(0.5) ? 1 : 0) + (n > 45 && chance(0.4) ? 1 : 0);
      const spd = -Math.sign(spin) * rand(1.1, 1.9 + d);
      for (let i = 0; i < count; i++)
        p.asteroids.push({ ang: (i / count) * TAU + rand(0, 1), dist: r + PR + 2, speed: spd, size: 9, rot: 0, vr: rand(-3, 3) });
    }
    if (n >= 16 && chance(0.22 + d * 0.25)) {
      const amp = rand(28, 70);
      p.baseX = clamp(x, r + 15 + amp, W - r - 15 - amp);
      if (p.baseX > W - r - 15 - amp || p.baseX < r + 15 + amp) p.baseX = W / 2;
      p.driftAmp = Math.min(amp, W / 2 - r - 15);
      p.driftFreq = rand(0.6, 1.1 + d * 0.4);
      p.x = p.baseX;
    }
    if (prev) {
      // trilha de moedas no caminho ideal
      const count = n < 3 ? 3 : 3 + Math.floor(Math.random() * 3);
      const ax = prev.baseX;
      const ay = prev.y;
      const bx = p.baseX;
      const by = p.y;
      const dist = Math.hypot(bx - ax, by - ay);
      const t0 = (prev.r + 35) / dist;
      const t1 = 1 - (p.r + 35) / dist;
      const gemAt = n > 3 && chance(0.07) ? Math.floor(count / 2) : -1;
      for (let i = 0; i < count; i++) {
        const t = lerp(t0, t1, count === 1 ? 0.5 : i / (count - 1));
        this.pickups.push({ x: lerp(ax, bx, t), y: lerp(ay, by, t), gem: i === gemAt, taken: false, t: rand(0, 6), pull: 0 });
      }
    }
    return p;
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

  start(): void {
    if (this.state !== 'menu') this.reset('play');
    this.state = 'play';
    audio.setIntensity(0.2);
    bus.emit('state', 'play');
  }

  input(): void {
    if (this.state !== 'play' || this.paused) return;
    if (this.pState === 'orbit') this.jump();
  }

  private jump(): void {
    const p = this.planet!;
    const a = p.rot + this.local;
    this.vx = Math.cos(a) * JUMP_SPEED;
    this.vy = Math.sin(a) * JUMP_SPEED;
    this.pState = 'fly';
    this.origin = p;
    this.planet = null;
    this.flyT = 0;
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

  revive(): void {
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

  private update(real: number): void {
    this.time += real;
    if (this.hitStop > 0) {
      this.hitStop -= real;
      return;
    }
    this.timeScale = lerp(this.timeScale, 1, Math.min(1, real * (this.state === 'dying' ? 1.2 : 6)));
    const dt = real * this.timeScale;

    // cenário
    const targetPhase = this.score / BIOME_LEN;
    this.bgPhase = lerp(this.bgPhase, Math.floor(targetPhase) + clamp((targetPhase % 1 - 0.85) / 0.15, 0, 1), Math.min(1, real * 1.5));

    for (const p of this.planets) {
      p.rot += p.spin * dt;
      if (p.driftAmp) p.x = p.baseX + Math.sin(this.time * p.driftFreq + p.driftPh) * p.driftAmp;
      for (const a of p.asteroids) {
        a.ang += a.speed * dt;
        a.rot += a.vr * dt;
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
    }

    this.updatePlayer(dt);
    this.updateWorld(dt);
    this.updateCamera(dt);

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

  private updatePlayer(dt: number): void {
    if (this.inv > 0) this.inv -= dt;

    if (this.pState === 'orbit' && this.planet) {
      const p = this.planet;
      const a = p.rot + this.local;
      const dist = p.r + PR - 1 + p.pulse * 3;
      this.px = p.x + Math.cos(a) * dist;
      this.py = p.y + Math.sin(a) * dist;
      this.upAng = a;
      if (this.state === 'play') this.checkAsteroids();
      // poeirinha
      if (Math.random() < dt * 6 && this.state !== 'over')
        this.fx.spawn({ x: this.px - Math.cos(a) * PR, y: this.py - Math.sin(a) * PR, vx: rand(-20, 20), vy: rand(-20, 20), life: 0.6, size: 1.6, color: this.skin.light, drag: 2 });
      return;
    }

    if (this.pState === 'fly') {
      this.flyT += dt;
      // assistência gravitacional
      for (const p of this.planets) {
        if (p.destroyed || (p === this.origin && this.flyT < 0.25)) continue;
        const dx = p.x - this.px;
        const dy = p.y - this.py;
        const d2 = dx * dx + dy * dy;
        const field = p.r * 2.4 + 40;
        if (d2 > field * field) continue;
        const d = Math.sqrt(d2);
        const acc = Math.min(3200, (1.3e6 * (p.r / 40)) / d2);
        this.vx += (dx / d) * acc * dt;
        this.vy += (dy / d) * acc * dt;
      }
      // mantém a velocidade estável (sensação "arcade")
      const sp = Math.hypot(this.vx, this.vy);
      const target = JUMP_SPEED;
      const nsp = lerp(sp, target, Math.min(1, dt * 2));
      this.vx = (this.vx / sp) * nsp;
      this.vy = (this.vy / sp) * nsp;
      this.px += this.vx * dt;
      this.py += this.vy * dt;
      this.upAng = Math.atan2(this.vy, this.vx);
      this.emitTrail(dt);

      // pousar
      for (const p of this.planets) {
        if (p.destroyed || (p === this.origin && this.flyT < 0.25)) continue;
        const dx = this.px - p.x;
        const dy = this.py - p.y;
        const rr = p.r + PR + 2;
        if (dx * dx + dy * dy < rr * rr) {
          this.land(p);
          return;
        }
      }
      if (this.state === 'play') this.checkAsteroids();

      // pegar moedas
      for (const c of this.pickups) {
        if (c.taken) continue;
        const dx = c.x - this.px;
        const dy = c.y - this.py;
        const d2 = dx * dx + dy * dy;
        if (d2 < 44 * 44) c.pull = Math.min(1, c.pull + dt * 8);
        if (d2 < (PR + 12) * (PR + 12)) this.collect(c);
      }

      if (this.state === 'play') {
        const m = PR * 2;
        if (this.px < this.camX - m || this.px > this.camX + this.viewW + m || this.py > this.camY + this.viewH + m || this.flyT > 1.7) this.die('lost');
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

  private checkAsteroids(): void {
    if (this.inv > 0) return;
    for (const p of this.planets) {
      for (const a of p.asteroids) {
        const ax = p.x + Math.cos(a.ang) * a.dist;
        const ay = p.y + Math.sin(a.ang) * a.dist;
        const dx = ax - this.px;
        const dy = ay - this.py;
        const rr = a.size + PR - 4;
        if (dx * dx + dy * dy < rr * rr) {
          this.die('asteroid');
          return;
        }
      }
    }
  }

  private emitTrail(dt: number): void {
    this.trailT -= dt;
    if (this.trailT > 0) return;
    this.trailT = 0.014;
    const c = this.trail.colors;
    const col = c[Math.floor(Math.random() * c.length)];
    const back = Math.atan2(-this.vy, -this.vx);
    const bx = this.px + Math.cos(back) * PR * 0.6;
    const by = this.py + Math.sin(back) * PR * 0.6;
    const side = rand(-1, 1);
    const ox = Math.cos(back + Math.PI / 2) * side * 5;
    const oy = Math.sin(back + Math.PI / 2) * side * 5;
    switch (this.trail.id) {
      case 'spark':
        this.fx.spawn({ x: bx + ox, y: by + oy, vx: rand(-30, 30), vy: rand(-30, 30), life: 0.45, size: rand(3, 6), color: col, drag: 2 });
        break;
      case 'bubbles':
        if (Math.random() < 0.5) this.fx.spawn({ x: bx + ox * 2, y: by + oy * 2, vx: rand(-20, 20), vy: rand(-40, 0), life: 0.8, size: rand(3, 7), color: col, type: PType.Bubble, additive: false });
        break;
      case 'fire':
        this.fx.spawn({ x: bx + ox, y: by + oy, vx: rand(-40, 40), vy: rand(-80, -20), life: 0.4, size: rand(5, 9), color: col, drag: 3 });
        break;
      case 'stars':
        this.fx.spawn({ x: bx + ox * 2, y: by + oy * 2, vx: rand(-30, 30), vy: rand(-30, 30), life: 0.7, size: rand(3, 6), color: col, type: PType.Star, vr: rand(-6, 6), drag: 2 });
        break;
      case 'hearts':
        if (Math.random() < 0.6) this.fx.spawn({ x: bx + ox * 2, y: by + oy * 2, vx: rand(-20, 20), vy: rand(-50, -10), life: 0.8, size: rand(4, 7), color: col, type: PType.Heart, rot: 0, additive: false });
        break;
      case 'confetti':
        this.fx.spawn({ x: bx + ox * 2, y: by + oy * 2, vx: rand(-60, 60), vy: rand(-60, 60), life: 0.9, size: rand(3, 5), color: col, type: PType.Confetti, vr: rand(-10, 10), grav: 120, drag: 2, additive: false });
        break;
      case 'rainbow': {
        for (let i = 0; i < 3; i++) {
          const k = (i - 1) * 4;
          const cc = c[(Math.floor(this.time * 20) + i) % c.length];
          this.fx.spawn({ x: bx + Math.cos(back + Math.PI / 2) * k, y: by + Math.sin(back + Math.PI / 2) * k, life: 0.35, size: 4, color: cc, drag: 0 });
        }
        break;
      }
      case 'lightning':
        this.fx.spawn({ x: bx + ox, y: by + oy, vx: rand(-200, 200), vy: rand(-200, 200), life: 0.18, size: rand(2, 4), color: col, type: PType.Spark, drag: 1 });
        this.fx.spawn({ x: bx, y: by, life: 0.3, size: 5, color: '#7df9ff', drag: 0 });
        break;
    }
  }

  private land(p: Planet): void {
    const angToCenter = Math.atan2(p.y - this.py, p.x - this.px);
    const off = Math.abs(angleDiff(Math.atan2(this.vy, this.vx), angToCenter));
    const local = Math.atan2(this.py - p.y, this.px - p.x) - p.rot;
    this.attach(p, local);
    this.lastPlanet = p;
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
    if (!p.visited) {
      p.visited = true;
      this.planetsRun++;
      const perfect = off < 0.2;
      let gain = 1;
      if (perfect) {
        this.perfectStreak++;
        this.perfects++;
        const bonus = Math.min(this.perfectStreak, 3);
        gain += bonus;
        this.addText(p.x, p.y - p.r - 30, this.perfectStreak > 1 ? `PERFEITO x${this.perfectStreak}` : 'PERFEITO!', '#fff36b', 26 + Math.min(this.perfectStreak, 5) * 2);
        this.fx.burst(this.px, this.py, 18, ['#fff36b', '#ffffff', this.skin.light], 320, { type: PType.Star, size: 6, vr: 8 });
        this.flash = 0.25;
        this.flashColor = '#fff7c2';
        this.happyT = 0.8;
        audio.perfect(this.perfectStreak);
        haptics.tap('medium');
        bus.emit('perfect', this.perfectStreak);
      } else {
        this.perfectStreak = 0;
        audio.land(Math.min(this.planetsRun, 7));
        haptics.tap('light');
      }
      this.score += gain;
      this.addText(this.px, this.py - 26, `+${gain}`, '#ffffff', 22);
      this.trauma = Math.max(this.trauma, perfect ? 0.35 : 0.2);
      if (p.fragile) p.crackT = 0.0001;
      audio.setIntensity(clamp(this.score / 60, 0.2, 1));
      bus.emit('score', this.score);
      if (Math.floor((this.score - gain) / BIOME_LEN) !== Math.floor(this.score / BIOME_LEN)) {
        const b = BIOMES[Math.floor(this.score / BIOME_LEN) % BIOMES.length];
        bus.emit('biome', b.name);
        audio.unlock2();
      }
    } else {
      audio.land(0);
      this.trauma = Math.max(this.trauma, 0.12);
    }
  }

  private collect(c: Pickup): void {
    c.taken = true;
    if (c.gem) {
      this.gemsRun++;
      audio.gem();
      haptics.tap('medium');
      this.fx.burst(c.x, c.y, 20, ['#9ffcff', '#ffffff', '#b06bff'], 260, { type: PType.Star, size: 5 });
      this.addText(c.x, c.y - 18, '+1 💎', '#9ffcff', 22);
      bus.emit('run-gems', this.gemsRun);
    } else {
      this.coinsRun++;
      this.coinChain++;
      this.coinChainT = 0.6;
      audio.coin(this.coinChain);
      this.fx.burst(c.x, c.y, 8, ['#fff36b', '#ffd400', '#ffffff'], 180, { size: 3 });
      bus.emit('run-coins', this.coinsRun);
    }
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

  private die(_reason: string): void {
    if (this.state !== 'play') return;
    this.state = 'dying';
    this.pState = 'dead';
    this.planet = null;
    this.dyingT = 1.0;
    this.timeScale = 0.25;
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
    };
    bus.emit('gameover', res);
  }

  /** Chamado pela UI quando o jogador recusa o "continuar". */
  get runStats() {
    return { coins: this.coinsRun, gems: this.gemsRun, perfects: this.perfects, planets: this.planetsRun };
  }

  private updateWorld(dt: number): void {
    const top = this.camY - this.viewH * 0.6;
    while (this.planets[this.planets.length - 1].y > top) this.planets.push(this.makePlanet(this.planets[this.planets.length - 1]));
    const bottom = this.camY + this.viewH + 260;
    this.planets = this.planets.filter((p) => p.y - p.r < bottom || p === this.planet || p === this.lastPlanet);
    for (const c of this.pickups) {
      c.t += dt;
      if (c.pull > 0 && !c.taken) {
        c.x = lerp(c.x, this.px, c.pull * 0.35);
        c.y = lerp(c.y, this.py, c.pull * 0.35);
      }
    }
    if (this.pickups.length > 60 || this.pickups.some((c) => c.taken || c.y > bottom)) this.pickups = this.pickups.filter((c) => !c.taken && c.y < bottom);
  }

  private updateCamera(dt: number): void {
    let focus = this.py;
    if (this.pState === 'orbit' && this.planet) focus = this.planet.y;
    if (this.pState === 'fly') focus = Math.min(this.py, this.origin ? this.origin.y : this.py);
    if (this.pState === 'dead') return;
    const target = focus - this.viewH * 0.64;
    this.camY = lerp(this.camY, target, Math.min(1, dt * (this.pState === 'fly' ? 3.2 : 4.5)));
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

    /* ---- mundo ---- */
    const sh = this.trauma * this.trauma;
    const shx = sh * 14 * Math.sin(this.time * 63.1);
    const shy = sh * 14 * Math.cos(this.time * 71.7);
    const S = this.S;
    x.setTransform(S, 0, 0, S, (-this.camX + shx) * S, (-this.camY + shy) * S);

    const vt = this.camY - 120;
    const vb = this.camY + this.viewH + 120;

    // atmosferas (aditivo)
    x.globalCompositeOperation = 'lighter';
    for (const p of this.planets) {
      if (p.destroyed || p.y + p.r * 2 < vt || p.y - p.r * 2 > vb) continue;
      const sp = this.spriteOf(p);
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
      // asteroides
      for (let i = 0; i < p.asteroids.length; i++) {
        const a = p.asteroids[i];
        const ax = p.x + Math.cos(a.ang) * a.dist;
        const ay = p.y + Math.sin(a.ang) * a.dist;
        x.globalCompositeOperation = 'lighter';
        x.globalAlpha = 0.6;
        x.drawImage(glow('#ff3b5c', 32), ax - a.size * 2, ay - a.size * 2, a.size * 4, a.size * 4);
        x.globalAlpha = 1;
        x.globalCompositeOperation = 'source-over';
        const spr = this.astSpr[i % this.astSpr.length];
        x.save();
        x.translate(ax, ay);
        x.rotate(a.rot);
        const s = spr.width / S;
        x.drawImage(spr, -s / 2, -s / 2, s, s);
        x.restore();
      }
    }

    // moedas e gemas
    for (const c of this.pickups) {
      if (c.taken || c.y < vt || c.y > vb) continue;
      const bob = Math.sin(c.t * 3) * 3;
      if (c.gem) {
        x.globalCompositeOperation = 'lighter';
        x.drawImage(glow('#7df9ff', 32), c.x - 22, c.y - 22 + bob, 44, 44);
        x.globalCompositeOperation = 'source-over';
        const s = this.gemSpr.width / S;
        x.drawImage(this.gemSpr, c.x - s / 2, c.y - s / 2 + bob, s, s);
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
    if (this.flash > 0) {
      x.globalAlpha = this.flash * 0.5;
      x.fillStyle = this.flashColor;
      x.fillRect(0, 0, cw, ch);
      x.globalAlpha = 1;
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
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'source-over';

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
    if (this.inv > 0) {
      x.strokeStyle = `rgba(125,252,255,${0.4 + 0.3 * Math.sin(this.time * 10)})`;
      x.lineWidth = 2.5;
      x.beginPath();
      x.arc(this.px, this.py, PR * 1.7, 0, TAU);
      x.stroke();
    }
  }

  private nextTarget(): Planet | null {
    let best: Planet | null = null;
    for (const p of this.planets) if (!p.visited && !p.destroyed && (!best || p.y > best.y)) best = p;
    return best;
  }
}
