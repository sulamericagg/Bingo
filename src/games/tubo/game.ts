/**
 * QUEDA GIRATÓRIA (id 'tubo') — o Bloop quica num cano vertical cercado de anéis que giram.
 * Toque = mergulho. Abertura embaixo → atravessa (combo). Segmento comum → quica.
 * Vermelho → fim de jogo (a não ser com escudo ou Turbo).
 *
 * Carregado sob demanda pelo hub (register.ts → launch()).
 * Performance: sprites dos anéis em pool, partículas em arrays tipados, nada alocado por frame.
 */
import { celebrateRecord } from '../../ui/record';
import './tubo.css';
import { t, fmt } from '../../i18n';
import type { MiniGameHandle } from '../../hub/registry';
import { reportRun } from '../../hub/registry';
import { addCoins } from '../../core/economy';
import { audio } from '../../core/audio';
import { tap as haptic, success as hapticSuccess } from '../../core/haptics';
import { FpsLimiter, QualityGovernor, type QualitySettings } from '../../core/quality';
import { Bloom, drawGrade, drawLight, drawRim, drawSoftShadow } from '../../gfx/light';
import { save } from '../../core/storage';
import { showRewarded, rewardedAvailable } from '../../services/ads';
import { drawPlayer, type PlayerPose } from '../../game/character';
import { skinById, type Skin } from '../../game/skins';
import { icon } from '../../ui/icons';
import {
  FRONT,
  Hit,
  Seg,
  TAU,
  drawPipe,
  drawRingSides,
  drawRingTop,
  genRing,
  hitTest,
  makeGeo,
  makeZoneStyle,
  norm,
  renderRingSprite,
  segAt,
  spinRing,
  type Geo,
  type Ring,
  type ZoneStyle,
} from './rings';
import { RED, ZONES, ZONE_LEN, zoneAt } from './zones';
import { gameFont } from '../../i18n/font';
import { freshDuel, takeDuel, type DuelEntry } from '../../party/duel-link';
import type { DuelCtl } from '../../party/duel';

/** valor de cada moeda coletada no tubo */
const COIN_VALUE = 3;
/** prêmio de cada meta curta da partida */
const GOAL_COINS = 15;
const DEPTH_KEY = 'bo-tubo-depth';
const BEST_KEY = 'bo-tubo-best';
const COMBO_WIN = 2.2; // s entre pousar e mergulhar para manter o combo
const FIRE_AT = 3;
const FIRE_CHARGES = 4;
const HOP_T = 0.52;
const AHEAD = 6;
const BEHIND = 1;

type Mode = 'ready' | 'hop' | 'smash' | 'fall' | 'dead' | 'over' | 'paused';

/* ============================== partículas ============================== */

const PMAX = 320;
const enum PK {
  Chunk = 0,
  Spark = 1,
  Flame = 2,
  Coin = 3,
}

class Particles {
  n = 0;
  x = new Float32Array(PMAX);
  y = new Float32Array(PMAX);
  vx = new Float32Array(PMAX);
  vy = new Float32Array(PMAX);
  life = new Float32Array(PMAX);
  max = new Float32Array(PMAX);
  size = new Float32Array(PMAX);
  rot = new Float32Array(PMAX);
  vr = new Float32Array(PMAX);
  kind = new Uint8Array(PMAX);
  col: string[] = new Array(PMAX).fill('#fff');

  spawn(k: PK, x: number, y: number, vx: number, vy: number, life: number, size: number, col: string): void {
    if (this.n >= PMAX) return;
    const i = this.n++;
    this.kind[i] = k;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = life;
    this.max[i] = life;
    this.size[i] = size;
    this.rot[i] = Math.random() * TAU;
    this.vr[i] = (Math.random() - 0.5) * 12;
    this.col[i] = col;
  }

  private kill(i: number): void {
    const j = --this.n;
    if (i === j) return;
    this.kind[i] = this.kind[j];
    this.x[i] = this.x[j];
    this.y[i] = this.y[j];
    this.vx[i] = this.vx[j];
    this.vy[i] = this.vy[j];
    this.life[i] = this.life[j];
    this.max[i] = this.max[j];
    this.size[i] = this.size[j];
    this.rot[i] = this.rot[j];
    this.vr[i] = this.vr[j];
    this.col[i] = this.col[j];
  }

  update(dt: number, g: number, tx: number, ty: number): number {
    let arrived = 0;
    for (let i = this.n - 1; i >= 0; i--) {
      this.life[i] -= dt;
      const k = this.kind[i];
      if (k === PK.Coin) {
        // voa até o contador (coordenadas de mundo do alvo passadas a cada frame)
        const p = 1 - this.life[i] / this.max[i];
        const e = p * p;
        this.x[i] += (tx - this.x[i]) * Math.min(1, e * 0.5 + dt * 6);
        this.y[i] += (ty - this.y[i]) * Math.min(1, e * 0.5 + dt * 6);
        if (this.life[i] <= 0) arrived++;
      } else {
        this.vy[i] += (k === PK.Flame ? -g * 0.15 : g) * dt;
        this.x[i] += this.vx[i] * dt;
        this.y[i] += this.vy[i] * dt;
        this.rot[i] += this.vr[i] * dt;
      }
      if (this.life[i] <= 0) this.kill(i);
    }
    return arrived;
  }
}

interface Popup {
  txt: string;
  x: number;
  y: number;
  life: number;
  col: string;
  size: number;
}

/* ============================== jogo ============================== */

class TuboGame implements MiniGameHandle {
  private el: HTMLDivElement;
  private cv: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private W = 0;
  private H = 0;
  private dpr = 1;
  private geo!: Geo;
  private styles: ZoneStyle[] = [];
  private bgs: HTMLCanvasElement[] = [];
  private coinSpr!: HTMLCanvasElement;
  private glowSpr!: HTMLCanvasElement;
  private cloudSpr!: HTMLCanvasElement;
  private cx = 0;

  private q: QualitySettings;
  private quality: QualityGovernor;
  private bloom = new Bloom();
  private limiter = new FpsLimiter(60);
  private raf = 0;
  private last = 0;
  private dead = false;

  private rings: Ring[] = [];
  private pool: HTMLCanvasElement[] = [];
  private time = 0;
  private fx = new Particles();
  private pops: Popup[] = [];

  // personagem
  private skin: Skin = skinById(save.skin);
  private pose: PlayerPose = { t: 0, blink: 0, lookX: 0, lookY: 0.15, sx: 1, sy: 1, mood: 'idle', lx: -0.55, ly: -0.83 };
  private mode: Mode = 'ready';
  private prevMode: Mode = 'ready';
  private ringI = 0;
  private footY = 0;
  private hopT = 0;
  private offset = 0;
  private vy = 0;
  private sq = 0;
  private sqv = 0;
  private stun = 0;
  private pending: Hit = Hit.Bounce;
  private buffered = false;
  /** toque durante a tontura do quique / durante o mergulho: vira mergulho assim que puder */
  private queued = false;
  /** altura deste quique (fixada no começo do quique, nunca muda no meio do ar) */
  private hopAmp = 1;
  private landTime = 0;
  private deadT = 0;
  private camY = 0;
  private shake = 0;
  private flash = 0;
  private blink = 0;

  // partida
  private score = 0;
  private best = 0;
  private depth = 0;
  private combo = 0;
  private maxCombo = 0;
  private fire = 0; // cargas do Turbo
  private shield = false;
  private invuln = 0;
  private coinsRun = 0;
  private shatters = 0;
  private revived = false;
  private startedAt = 0;
  private credited = 0;
  private zoneShown = 0;

  // HUD
  private hud: {
    score: HTMLElement;
    depth: HTMLElement;
    coins: HTMLElement;
    combo: HTMLElement;
    hint: HTMLElement;
    zone: HTMLElement;
    shield: HTMLElement;
    ov: HTMLElement;
  };
  private shown = { score: -1, depth: -1, coins: -1, combo: -1, shield: false };
  private txt = {
    fire: t('tubo.fire', 'Turbo!'),
    shieldPop: t('tubo.shieldSaved', 'Escudo salvou!'),
    crack: t('tubo.crack', 'Rachou!'),
    shieldGet: t('tubo.shieldGet', 'Escudo!'),
  };
  private offs: (() => void)[] = [];

  // duelo online (src/party/duel.ts): mesmos anéis para todos; quem fizer mais pontos em 90 s vence
  private duel: DuelCtl | null = null;
  private duelRng: (() => number) | null = null;

  constructor(
    private root: HTMLElement,
    private exitFn: () => void,
  ) {
    if (import.meta.env.DEV) (window as unknown as { __tuboGame?: unknown; __tuboHit?: unknown }).__tuboGame = this;
    if (import.meta.env.DEV) (window as unknown as { __tuboHit?: unknown }).__tuboHit = hitTest;
    try {
      this.best = Math.max(0, parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0);
    } catch {
      this.best = 0;
    }
    this.quality = new QualityGovernor({ emit: false, onChange: (_t, s) => this.applyQuality(s) });
    this.q = this.quality.settings;
    this.limiter.cap = this.q.fpsCap;

    const el = document.createElement('div');
    el.className = 'tubo-root';
    el.innerHTML = `
      <canvas class="tubo-cv"></canvas>
      <div class="tubo-hud">
        <button class="tubo-btn-round" data-act="pause" aria-label="${t('tubo.pause', 'Pausar')}">${icon('pause', { size: 26 })}</button>
        <div class="tubo-score"><b>0</b><small></small></div>
        <div class="tubo-coins">${icon('coin', { size: 22 })}<span>0</span></div>
      </div>
      <div class="tubo-shield">${icon('shield', { size: 22 })}<span>${t('tubo.shieldOn', 'Escudo')}</span></div>
      <div class="tubo-combo"></div>
      <div class="tubo-goals"><span class="g-ring"></span><span class="g-combo"></span></div>
      <div class="tubo-zone"></div>
      <div class="tubo-hint">
        <div class="tubo-hint-hand">${icon('hand-tap', { size: 54 })}</div>
        <b>${t('tubo.hint.tap', 'Toque para mergulhar')}</b>
        <span>${t('tubo.hint.gap', 'Caia pela abertura quando ela passar embaixo de você')}</span>
        <span class="tubo-hint-red">${icon('warning', { size: 18 })}${t('tubo.hint.red', 'Não mergulhe no vermelho listrado!')}</span>
      </div>
      <button class="tubo-duelbtn" data-act="duel"><svg viewBox="0 0 32 24" width="30" height="22" aria-hidden="true"><circle cx="11" cy="8" r="5" fill="currentColor"/><path d="M1 23c0-6 4.5-9 10-9s10 3 10 9z" fill="currentColor"/><circle cx="23" cy="7" r="4" fill="currentColor" opacity=".75"/><path d="M19 13.5c1.2-.4 2.5-.5 4-.5 4.6 0 8 2.6 8 8h-8.5c-.3-3-1.6-5.7-3.5-7.5z" fill="currentColor" opacity=".75"/></svg><span>${t('duel.menu', 'Duelo online')}</span></button>
      <div class="tubo-ov"></div>`;
    root.appendChild(el);
    this.el = el;
    this.cv = el.querySelector('canvas')!;
    this.ctx = this.cv.getContext('2d', { alpha: false })!;
    const $ = (s: string) => el.querySelector(s) as HTMLElement;
    this.hud = {
      score: $('.tubo-score b'),
      depth: $('.tubo-score small'),
      coins: $('.tubo-coins span'),
      combo: $('.tubo-combo'),
      hint: $('.tubo-hint'),
      zone: $('.tubo-zone'),
      shield: $('.tubo-shield'),
      ov: $('.tubo-ov'),
    };

    // entrada
    const down = (e: PointerEvent) => {
      if (e.button > 0) return;
      e.preventDefault();
      this.onTap();
    };
    this.cv.addEventListener('pointerdown', down);
    const key = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowDown') {
        e.preventDefault();
        this.onTap();
      } else if (e.code === 'KeyP') this.togglePause(); // Escape = voltar do hub (mostra "Sair do jogo?")
    };
    window.addEventListener('keydown', key);
    el.addEventListener('click', this.onClick);
    const resize = () => this.resize();
    window.addEventListener('resize', resize);
    const vis = () => {
      if (document.hidden) this.pause();
    };
    document.addEventListener('visibilitychange', vis);
    this.offs.push(
      () => this.cv.removeEventListener('pointerdown', down),
      () => window.removeEventListener('keydown', key),
      () => el.removeEventListener('click', this.onClick),
      () => window.removeEventListener('resize', resize),
      () => document.removeEventListener('visibilitychange', vis),
    );

    this.resize();
    this.reset();
    this.raf = requestAnimationFrame(this.loop);
    const d = takeDuel('tubo');
    if (d) void this.onlineDuel(d);
  }

  /* ============================== duelo online ============================== */
  private async onlineDuel(entry: DuelEntry): Promise<void> {
    const D = await import('../../party/duel');
    if (this.dead) return;
    this.duel?.leave();
    this.hud.ov.classList.remove('on');
    this.hud.ov.innerHTML = '';
    this.duel = D.startDuel({
      game: 'tubo',
      root: this.root,
      title: t('tubo.name', 'Queda Giratória'),
      rank: 'score',
      limitSec: 90,
      entry,
      fmt: (n) => fmt(n),
      hud: 'bottom',
      start: (seed) => {
        let a = seed >>> 0 || 1;
        this.duelRng = () => {
          a = (a + 0x6d2b79f5) >>> 0;
          let x = a;
          x = Math.imul(x ^ (x >>> 15), x | 1);
          x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
          return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
        };
        this.reset();
        this.el.classList.add('is-duel');
      },
      stop: () => {
        // o tempo acabou: a queda para onde está
        if (this.mode !== 'over') {
          this.mode = 'over';
          this.finish();
        }
      },
      exit: () => {
        this.duel = null;
        this.duelRng = null;
        this.el.classList.remove('is-duel');
        this.reset();
      },
    });
  }

  /* ============================== setup ============================== */

  private applyQuality(s: QualitySettings): void {
    this.q = s;
    this.limiter.cap = s.fpsCap;
    this.resize();
  }

  private resize(): void {
    const r = this.el.getBoundingClientRect();
    this.W = Math.max(240, Math.round(r.width || window.innerWidth));
    this.H = Math.max(360, Math.round(r.height || window.innerHeight));
    this.dpr = Math.min(window.devicePixelRatio || 1, this.q.dprCap);
    this.cv.width = Math.round(this.W * this.dpr);
    this.cv.height = Math.round(this.H * this.dpr);
    this.cx = this.W / 2;
    const rOut = Math.min(this.W * 0.41, this.H * 0.2, 230);
    const old = this.geo;
    this.geo = makeGeo(rOut, this.dpr);
    this.styles = ZONES.map((_, i) => makeZoneStyle(this.ctx, i, this.geo));
    this.bgs = ZONES.map((z) => {
      const c = document.createElement('canvas');
      c.width = 4;
      c.height = 256;
      const x = c.getContext('2d')!;
      const g = x.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, z.bg[0]);
      g.addColorStop(0.5, z.bg[1]);
      g.addColorStop(1, z.bg[2]);
      x.fillStyle = g;
      x.fillRect(0, 0, 4, 256);
      return c;
    });
    this.coinSpr = makeCoinSprite(Math.ceil(this.geo.R * 0.62 * this.dpr));
    this.glowSpr = makeGlowSprite(64, '255,120,40');
    this.cloudSpr = makeCloudSprite(Math.round(120 * Math.min(this.dpr, 1.5)));
    // reescala o mundo se o tamanho mudou no meio da partida
    if (old && old.spacing !== this.geo.spacing) {
      const f = this.geo.spacing / old.spacing;
      for (const rg of this.rings) rg.y = rg.idx * this.geo.spacing;
      this.footY *= f;
      this.camY *= f;
      this.offset *= f;
    }
    for (const rg of this.rings) rg.dirty = true;
  }

  private reset(): void {
    for (const r of this.rings) this.release(r);
    this.rings.length = 0;
    this.time = 0;
    this.ringI = 0;
    this.ensureRings();
    this.footY = this.surfaceY(0);
    this.camY = this.footY - this.H * 0.36;
    this.mode = 'ready';
    this.hopT = 0;
    this.offset = 0;
    this.vy = 0;
    this.sq = 0;
    this.sqv = 0;
    this.stun = 0;
    this.buffered = false;
    this.queued = false;
    this.hopAmp = 1;
    this.score = 0;
    this.depth = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.fire = 0;
    this.shield = false;
    this.invuln = 0;
    this.coinsRun = 0;
    this.shatters = 0;
    this.setupGoals();
    this.revived = false;
    this.credited = 0;
    this.doubled = false;
    this.bonus = 0;
    this.newBest = false;
    this.zoneShown = 0;
    this.flash = 0;
    this.shake = 0;
    this.fx.n = 0;
    this.pops.length = 0;
    this.skin = skinById(save.skin);
    this.hud.hint.classList.add('on');
    this.el.classList.add('is-ready');
    this.hud.ov.innerHTML = '';
    this.hud.ov.classList.remove('on');
    this.el.classList.remove('is-over');
  }

  private surfaceY(i: number): number {
    return i * this.geo.spacing + this.geo.k * this.geo.rMid;
  }

  private ringByIdx(i: number): Ring | undefined {
    const r0 = this.rings[0];
    return r0 ? this.rings[i - r0.idx] : undefined;
  }

  private ensureRings(): void {
    // remove os de cima
    while (this.rings.length && this.rings[0].idx < this.ringI - BEHIND) this.release(this.rings.shift()!);
    let next = this.rings.length ? this.rings[this.rings.length - 1].idx + 1 : Math.max(0, this.ringI - BEHIND);
    while (next <= this.ringI + AHEAD) {
      // pressão suave pelo tempo: a cada ~9 s de partida, +1 anel "equivalente" de dificuldade (teto 30)
      const heat = this.startedAt && this.mode !== 'ready' ? Math.min(30, (performance.now() - this.startedAt) / 9000) : 0;
      // duelo: anéis da semente comum e dificuldade só pela profundidade (igual para todos)
      const r = this.duelRng ? genRing(next, this.geo, this.duelRng, zoneAt(next), Math.min(30, next / 10)) : genRing(next, this.geo, Math.random, zoneAt(next), heat);
      r.y = next * this.geo.spacing;
      spinRing(r, this.time);
      this.rings.push(r);
      next++;
    }
  }

  private release(r: Ring): void {
    if (r.sprite) {
      this.pool.push(r.sprite);
      r.sprite = null;
    }
  }

  private spriteFor(r: Ring): void {
    if (r.broken) return;
    if (!r.sprite) {
      r.sprite = this.pool.pop() ?? document.createElement('canvas');
      r.dirty = true;
    }
    if (r.dirty) renderRingSprite(r, this.geo, this.styles[r.zone], r.sprite);
  }

  /* ============================== entrada ============================== */

  private onTap(): void {
    audio.unlock();
    if (this.mode === 'ready') {
      this.mode = 'hop';
      this.startedAt = performance.now();
      this.hud.hint.classList.remove('on');
      this.el.classList.remove('is-ready');
    }
    if (this.mode === 'hop') {
      // antes: toque durante a tontura (0,22 s depois de quicar) era ignorado em silêncio
      if (this.stun > 0) this.queued = true;
      else this.smash();
    } else if (this.mode === 'smash') {
      this.queued = true;
    } else if (this.mode === 'fall') {
      // toque pouco antes de pousar vale como mergulho imediato
      const dist = this.surfaceY(this.ringI + 1) - this.footY;
      if (dist < this.geo.spacing * 0.45) this.buffered = true;
    }
  }

  private smash(): void {
    this.queued = false;
    const r = this.ringByIdx(this.ringI);
    if (!r) return;
    this.pending = hitTest(r, this.geo).hit;
    this.mode = 'smash';
    this.sq = -0.22;
    this.sqv = 0;
    audio.jump(this.combo);
  }

  private onClick = (e: Event): void => {
    const b = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!b) return;
    e.stopPropagation();
    const act = b.dataset.act;
    audio.click();
    if (act === 'pause') this.togglePause();
    else if (act === 'resume') this.resume();
    else if (act === 'quit') this.quit();
    else if (act === 'revive') this.tryRevive(b);
    else if (act === 'giveup') this.finish();
    else if (act === 'double') this.tryDouble(b);
    else if (act === 'again') this.reset();
    else if (act === 'duel') void this.onlineDuel(freshDuel('tubo'));
    else if (act === 'home') this.destroyAndExit();
  };

  /* ============================== regras ============================== */

  private resolve(): void {
    const r = this.ringByIdx(this.ringI);
    if (!r) return;
    const h = this.pending;
    if (h === Hit.Gap) return this.pass(r, false);
    if (h === Hit.Red) {
      if (this.fire > 0) {
        this.fire = 0;
        this.popup(this.txt.fire, '#fff3a0', 1.1);
        return this.pass(r, true);
      }
      if (this.shield || this.invuln > 0) {
        if (this.invuln <= 0) {
          this.shield = false;
          this.popup(this.txt.shieldPop, '#bfefff', 1.1);
        }
        return this.pass(r, true);
      }
      return this.die(r);
    }
    if (this.fire > 0) {
      this.fire--;
      return this.pass(r, true);
    }
    if (h === Hit.Crack) {
      const seg = segAt(r, norm(FRONT - r.rot));
      if (seg.type === Seg.Crack) {
        seg.type = Seg.Gap;
        r.dirty = true;
        this.burstArc(r, seg.a0, seg.a1, 10, this.styles[r.zone].zone.ring[1]);
        this.popup(this.txt.crack, '#ffffff', 0.9);
        audio.crack();
      }
      return this.bounce(0.08);
    }
    this.bounce(0.22);
  }

  private bounce(stun: number): void {
    this.mode = 'hop';
    this.hopT = 0;
    this.stun = stun;
    this.hopAmp = 1.4;
    this.sq = 0.32;
    this.sqv = 0;
    this.combo = 0;
    this.fire = 0;
    this.addShake(3);
    audio.land(0);
    haptic('light');
    const sy = this.surfaceY(this.ringI) - this.camY;
    const z = this.styles[this.ringByIdx(this.ringI)?.zone ?? 0].zone;
    const n = Math.round(6 * this.q.particleBudget);
    for (let i = 0; i < n; i++) this.fx.spawn(PK.Spark, this.cx + (Math.random() - 0.5) * this.geo.R * 2, sy + this.camY, (Math.random() - 0.5) * 160, -60 - Math.random() * 120, 0.4, 3 + Math.random() * 3, z.cloud);
  }

  private pass(r: Ring, forced: boolean): void {
    const since = this.time - this.landTime;
    this.combo = this.combo > 0 && since <= COMBO_WIN ? this.combo + 1 : 1;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    if (this.combo >= FIRE_AT && (this.combo - FIRE_AT) % 5 === 0 && this.fire === 0) {
      this.fire = FIRE_CHARGES;
      this.popup(this.txt.fire, '#fff3a0', 1.3);
      hapticSuccess();
    }
    this.checkGoals();
    const pts = Math.min(this.combo, 10);
    this.score += pts;
    this.duel?.progress(this.score, 0);
    if (r.idx + 1 > this.depth) this.coinsRun += 1; // cada anel novo também paga 1 moeda
    this.depth = Math.max(this.depth, r.idx + 1);
    this.popup('+' + pts, this.combo >= 3 ? '#fff3a0' : '#ffffff', this.combo >= 3 ? 1.15 : 0.95);
    this.shatter(r, forced);
    this.mode = 'fall';
    this.vy = this.geo.spacing * 2.2;
    this.sq = -0.18;
    audio.perfect(this.combo - 1);
    haptic(this.combo >= 3 ? 'medium' : 'light');
    this.addShake(forced ? 7 : 2 + Math.min(this.combo, 6));
    audio.setIntensity(Math.min(1, this.depth / 60));
  }

  private shatter(r: Ring, big: boolean): void {
    r.broken = true;
    this.release(r);
    this.shatters++;
    // itens restantes do anel vão para o jogador
    for (const it of r.items) if (!it.taken) this.collect(r, it);
    const n = Math.round((big ? 34 : 22) * this.q.particleBudget);
    const st = this.styles[r.zone];
    const { rOut, rIn, k } = this.geo;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const seg = segAt(r, norm(a - r.rot));
      if (seg.type === Seg.Gap) continue;
      const rr = rIn + Math.random() * (rOut - rIn);
      const c = Math.cos(a);
      const s = Math.sin(a);
      const sp = 140 + Math.random() * 260;
      const col = seg.type === Seg.Red ? (Math.random() < 0.5 ? RED.top : RED.stripe) : Math.random() < 0.5 ? st.zone.ring[0] : st.zone.ring[2];
      this.fx.spawn(PK.Chunk, this.cx + c * rr, r.y + s * rr * k, c * sp, s * sp * k - 120 - Math.random() * 160, 0.9 + Math.random() * 0.5, rOut * (0.05 + Math.random() * 0.06), col);
    }
    audio.crack();
  }

  private burstArc(r: Ring, a0: number, a1: number, n: number, col: string): void {
    const { rOut, rIn, k } = this.geo;
    n = Math.round(n * this.q.particleBudget);
    for (let i = 0; i < n; i++) {
      const a = a0 + Math.random() * (a1 - a0) + r.rot;
      const rr = rIn + Math.random() * (rOut - rIn);
      this.fx.spawn(PK.Chunk, this.cx + Math.cos(a) * rr, r.y + Math.sin(a) * rr * k, Math.cos(a) * 80, 40 + Math.random() * 120, 0.8, rOut * 0.05, col);
    }
  }

  private die(r: Ring): void {
    this.mode = 'dead';
    this.deadT = 0;
    r.flash = 1;
    this.flash = 1;
    this.sq = 0.45;
    this.combo = 0;
    this.fire = 0;
    this.addShake(14);
    audio.hit();
    haptic('heavy');
    const sy = this.surfaceY(this.ringI);
    const n = Math.round(16 * this.q.particleBudget);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      this.fx.spawn(PK.Spark, this.cx, sy - this.geo.R, Math.cos(a) * 260, Math.sin(a) * 200 - 80, 0.7, 4 + Math.random() * 4, i % 2 ? RED.top : '#ffffff');
    }
  }

  /* ---------------- metas curtas da partida ---------------- */
  private goalRing = 20;
  private goalCombo = 5;
  private goalRingOk = false;
  private goalComboOk = false;

  private setupGoals(): void {
    let bestDepth = 0;
    try {
      bestDepth = Number(localStorage.getItem(DEPTH_KEY) || 0) || 0;
    } catch {
      /* */
    }
    // meta um pouco acima do melhor anel já alcançado (sempre alcançável, de 5 em 5)
    this.goalRing = Math.max(10, Math.min(80, Math.ceil((bestDepth + 5) / 5) * 5));
    this.goalCombo = bestDepth < 12 ? 3 : bestDepth < 30 ? 5 : 8;
    this.goalRingOk = this.goalComboOk = false;
    this.renderGoals();
  }

  private renderGoals(): void {
    const g = this.el?.querySelector('.tubo-goals');
    if (!g) return;
    const a = g.querySelector('.g-ring') as HTMLElement;
    const b = g.querySelector('.g-combo') as HTMLElement;
    a.innerHTML = `${icon(this.goalRingOk ? 'check' : 'target', { size: 16 })}${t('tubo.goal.ring', 'Anel {n}', { n: this.goalRing })}`;
    b.innerHTML = `${icon(this.goalComboOk ? 'check' : 'fire', { size: 16 })}${t('tubo.goal.combo', 'Combo x{n}', { n: this.goalCombo })}`;
    a.classList.toggle('ok', this.goalRingOk);
    b.classList.toggle('ok', this.goalComboOk);
  }

  private checkGoals(): void {
    let done = false;
    if (!this.goalRingOk && this.depth + 1 >= this.goalRing) done = this.goalRingOk = true;
    if (!this.goalComboOk && this.combo >= this.goalCombo) done = this.goalComboOk = true;
    if (!done) return;
    this.coinsRun += GOAL_COINS;
    this.popup(t('tubo.goal.done', 'Meta cumprida! +{n}', { n: GOAL_COINS }), '#7dffb0', 1.2);
    audio.unlock2();
    haptic('medium');
    this.renderGoals();
  }

  private collect(r: Ring, it: { a: number; kind: 0 | 1; taken: boolean }): void {
    it.taken = true;
    const a = it.a + r.rot;
    const x = this.cx + Math.cos(a) * this.geo.rMid;
    const y = r.y + Math.sin(a) * this.geo.rMid * this.geo.k - this.geo.R * 0.4;
    if (it.kind === 1) {
      this.shield = true;
      this.popup(this.txt.shieldGet, '#bfefff', 1);
      audio.gem();
      return;
    }
    // economia equilibrada entre jogos (nov/2026): moeda do tubo vale 3 (antes 1 → ~12 moedas/min, o mais "pão-duro" do hub)
    this.coinsRun += COIN_VALUE;
    this.fx.spawn(PK.Coin, x, y, 0, 0, 0.55, 1, '#ffd23e');
    audio.coin(this.coinsRun);
  }

  private popup(txt: string, col: string, size: number): void {
    if (this.pops.length >= 10) this.pops.shift();
    this.pops.push({ txt, x: this.cx, y: this.footY - this.geo.R * 2.6, life: 1, col, size });
  }

  private addShake(m: number): void {
    if (this.q.shake) this.shake = Math.max(this.shake, m);
  }

  /* ============================== fim de jogo ============================== */

  private showRevive(): void {
    this.mode = 'over';
    const can = !this.revived && !this.duel && rewardedAvailable();
    if (!can) return this.finish();
    this.el.classList.add('is-over');
    const ov = this.hud.ov;
    ov.innerHTML = `
      <div class="tubo-card tubo-pop">
        <h2>${t('tubo.revive.title', 'Ops! Quase lá')}</h2>
        <p>${t('tubo.revive.text', 'Assista a um vídeo para continuar a queda de onde parou.')}</p>
        <div class="tubo-timer"><i></i></div>
        <button class="tubo-btn tubo-btn-main" data-act="revive">${icon('video', { size: 26 })}<span>${t('tubo.revive.btn', 'Continuar')}</span></button>
        <button class="tubo-btn tubo-btn-ghost" data-act="giveup">${t('tubo.revive.no', 'Agora não')}</button>
      </div>`;
    ov.classList.add('on');
    const bar = ov.querySelector('.tubo-timer i') as HTMLElement;
    bar.addEventListener('animationend', () => {
      if (this.mode === 'over' && ov.querySelector('[data-act="revive"]') && !ov.classList.contains('busy')) this.finish();
    });
  }

  private async tryRevive(b: HTMLElement): Promise<void> {
    if (this.revived) return;
    const ov = this.hud.ov;
    ov.classList.add('busy');
    (b as HTMLButtonElement).disabled = true;
    const ok = await showRewarded();
    ov.classList.remove('busy');
    if (this.dead) return;
    if (!ok) return this.finish();
    this.revived = true;
    ov.classList.remove('on');
    ov.innerHTML = '';
    this.el.classList.remove('is-over');
    // atravessa o anel em que morreu e ganha alguns segundos de proteção
    const r = this.ringByIdx(this.ringI);
    this.invuln = 2.5;
    this.flash = 0;
    if (r) {
      r.flash = 0;
      this.shatter(r, true);
    }
    this.mode = 'fall';
    this.vy = 0;
    this.landTime = this.time;
  }

  private finish(): void {
    if (this.credited) return this.showResults();
    this.mode = 'over';
    this.duel?.finish(this.score);
    const base = this.coinsRun;
    const hook = (window as unknown as { petCoinBonus?: (n: number) => number }).petCoinBonus;
    let bonus = 0;
    try {
      bonus = typeof hook === 'function' ? Math.max(0, Math.round(hook(base) || 0)) : 0;
    } catch {
      bonus = 0;
    }
    const total = base + bonus;
    if (total > 0) addCoins(total);
    this.credited = Math.max(1, total);
    try {
      if (this.depth > (Number(localStorage.getItem(DEPTH_KEY) || 0) || 0)) localStorage.setItem(DEPTH_KEY, String(this.depth));
    } catch {
      /* */
    }
    this.newBest = this.score > this.best;
    if (this.newBest && this.best > 0) celebrateRecord(t('record.pts', '{n} pontos', { n: fmt(this.score) }));
    if (this.newBest) {
      this.best = this.score;
      try {
        localStorage.setItem(BEST_KEY, String(this.best));
      } catch {
        /* */
      }
    }
    reportRun({
      game: 'tubo',
      score: this.score,
      coins: total,
      durationSec: Math.round((performance.now() - (this.startedAt || performance.now())) / 1000),
      stats: { rings: this.depth, maxCombo: this.maxCombo, shatters: this.shatters, coinsCollected: base },
    });
    this.bonus = bonus;
    this.showResults();
  }

  private newBest = false;
  private bonus = 0;
  private doubled = false;

  private showResults(): void {
    this.el.classList.add('is-over');
    const ov = this.hud.ov;
    const base = this.coinsRun;
    const canDouble = base > 0 && !this.doubled && rewardedAvailable();
    ov.innerHTML = `
      <div class="tubo-card tubo-pop">
        <h2>${t('tubo.over.title', 'Fim da queda!')}</h2>
        ${this.newBest && this.score > 0 ? `<div class="tubo-badge">${icon('crown', { size: 20 })}${t('tubo.over.newBest', 'Novo recorde!')}</div>` : ''}
        <div class="tubo-big">${fmt(this.score)}</div>
        <div class="tubo-sub">${t('tubo.over.best', 'Recorde: {n}', { n: fmt(this.best) })}</div>
        <div class="tubo-stats">
          <div><span>${t('tubo.over.rings', 'Anéis')}</span><b>${fmt(this.depth)}</b></div>
          <div><span>${t('tubo.over.combo', 'Maior combo')}</span><b>x${fmt(this.maxCombo)}</b></div>
          <div><span>${t('tubo.over.coins', 'Moedas')}</span><b class="tubo-coinval">${icon('coin', { size: 18 })}${fmt(base * (this.doubled ? 2 : 1) + this.bonus)}</b></div>
        </div>
        ${canDouble ? `<button class="tubo-btn tubo-btn-gold" data-act="double">${icon('video', { size: 24 })}<span>${t('tubo.over.double', 'Dobrar moedas')}</span></button>` : ''}
        ${this.duel ? '' : `<button class="tubo-btn tubo-btn-main" data-act="again">${icon('refresh', { size: 24 })}<span>${t('tubo.over.again', 'Jogar de novo')}</span></button>`}
        <button class="tubo-btn tubo-btn-ghost" data-act="home">${icon('home', { size: 22 })}<span>${t('tubo.over.home', 'Voltar')}</span></button>
      </div>`;
    ov.classList.add('on');
  }

  private async tryDouble(b: HTMLElement): Promise<void> {
    if (this.doubled) return;
    (b as HTMLButtonElement).disabled = true;
    const ok = await showRewarded();
    if (this.dead) return;
    if (ok) {
      this.doubled = true;
      addCoins(this.coinsRun);
      audio.cash();
      hapticSuccess();
    }
    this.showResults();
  }

  /* ============================== pausa / saída ============================== */

  /** partida começada (depois do 1º toque) e ainda não acabou — para o "Sair do jogo?" do hub */
  inMatch(): boolean {
    const m = this.mode === 'paused' ? this.prevMode : this.mode;
    return m === 'hop' || m === 'smash' || m === 'fall';
  }

  private togglePause(): void {
    if (this.mode === 'paused') this.resume();
    else this.pause(true);
  }

  /**
   * Pausa. Chamado pelo hub (voltar / app em segundo plano) sem cartão próprio: o hub já mostra
   * "Sair do jogo?" e os dois cartões ficavam um atrás do outro. O botão de pausa do HUD usa o cartão.
   */
  pause(card = false): void {
    if (this.mode === 'paused' && !card) {
      this.hud.ov.classList.remove('on');
      this.hud.ov.innerHTML = '';
      return;
    }
    if (this.mode !== 'hop' && this.mode !== 'smash' && this.mode !== 'fall' && this.mode !== 'ready') return;
    this.prevMode = this.mode;
    this.mode = 'paused';
    if (!card) return;
    const ov = this.hud.ov;
    ov.innerHTML = `
      <div class="tubo-card tubo-pop">
        <h2>${t('tubo.paused', 'Pausado')}</h2>
        <button class="tubo-btn tubo-btn-main" data-act="resume">${icon('play', { size: 24 })}<span>${t('tubo.resume', 'Continuar')}</span></button>
        <button class="tubo-btn tubo-btn-ghost" data-act="quit">${icon('home', { size: 22 })}<span>${t('tubo.quit', 'Sair')}</span></button>
      </div>`;
    ov.classList.add('on');
  }

  resume(): void {
    if (this.mode !== 'paused') return;
    this.mode = this.prevMode;
    this.hud.ov.classList.remove('on');
    this.hud.ov.innerHTML = '';
    this.last = 0;
  }

  private quit(): void {
    // sair no meio conta como partida encerrada (moedas coletadas não se perdem)
    if (this.prevMode !== 'ready' && !this.credited && (this.score > 0 || this.coinsRun > 0)) {
      this.mode = 'over';
      this.finish();
      return;
    }
    this.destroyAndExit();
  }

  private destroyAndExit(): void {
    this.destroy();
    this.exitFn();
  }

  destroy(): void {
    if (this.dead) return;
    this.duel?.leave();
    // saiu pelo "Sair do jogo?" do hub (voltar do Android) no meio da queda ou na tela de "Continuar":
    // as moedas coletadas não podem sumir (o "Sair" da pausa própria já fazia isso)
    const m = this.mode === 'paused' ? this.prevMode : this.mode;
    if (m !== 'ready' && !this.credited && (this.score > 0 || this.coinsRun > 0)) {
      try {
        this.finish();
      } catch (e) {
        console.warn('[tubo] crédito na saída', e);
      }
    }
    this.dead = true;
    cancelAnimationFrame(this.raf);
    for (const f of this.offs) f();
    this.offs.length = 0;
    this.rings.length = 0;
    this.pool.length = 0;
    this.el.remove();
    audio.setIntensity(0);
  }

  /* ============================== laço ============================== */

  private loop = (now: number): void => {
    if (this.dead) return;
    this.raf = requestAnimationFrame(this.loop);
    if (!this.limiter.shouldRender(now)) return;
    const frameMs = this.last ? now - this.last : 16.7;
    this.last = now;
    const dt = Math.min(0.05, frameMs / 1000);
    const t0 = performance.now();
    if (this.mode !== 'paused') this.update(dt);
    this.render();
    this.syncHud();
    if (!document.hidden && this.mode !== 'paused') this.quality.sample(frameMs, performance.now() - t0);
  };

  private update(dt: number): void {
    const g = this.geo;
    const deadSlow = this.mode === 'dead' ? 0.15 : 1;
    this.time += dt * deadSlow;
    this.pose.t += dt;
    for (const r of this.rings) {
      spinRing(r, this.time);
      if (r.flash > 0 && this.mode !== 'dead' && this.mode !== 'over') r.flash = Math.max(0, r.flash - dt * 2);
    }
    if (this.invuln > 0) this.invuln -= dt;
    if (this.stun > 0) this.stun -= dt;

    // mola do squash
    this.sqv += (-260 * this.sq - 16 * this.sqv) * dt;
    this.sq += this.sqv * dt;

    const hopH = g.R * 1.5;
    switch (this.mode) {
      case 'ready':
      case 'hop': {
        // toque guardado durante a tontura: mergulha assim que ela passa
        if (this.mode === 'hop' && this.queued && this.stun <= 0) {
          this.smash();
          this.offset = Math.max(0, this.offset - g.R * 55 * dt);
          this.footY = this.surfaceY(this.ringI) - this.offset;
          break;
        }
        const prev = this.hopT;
        this.hopT += dt;
        if (this.hopT >= HOP_T) {
          // encostou no anel: amassa no contato e o próximo quique tem altura normal
          this.hopT %= HOP_T;
          this.hopAmp = 1;
          this.sq = 0.2;
          this.sqv = 0;
        } else if (prev < HOP_T * 0.5 && this.hopT >= HOP_T * 0.5) this.sqv -= 1.2;
        const ph = this.hopT / HOP_T;
        // parábola de verdade (gravidade constante), em função do tempo: igual em 30/60/120 Hz.
        // A altura é fixa durante o quique — antes o fator 1,4 da tontura sumia no meio do ar
        // e o Bloop "despencava" de repente.
        this.offset = hopH * 4 * ph * (1 - ph) * this.hopAmp;
        this.footY = this.surfaceY(this.ringI) - this.offset;
        if (this.mode === 'hop' && this.combo > 0 && this.time - this.landTime > COMBO_WIN) {
          this.combo = 0;
          this.fire = 0;
        }
        this.collectNear();
        break;
      }
      case 'smash': {
        this.offset -= g.R * 55 * dt;
        if (this.offset <= 0) {
          this.offset = 0;
          this.footY = this.surfaceY(this.ringI);
          this.resolve();
        } else this.footY = this.surfaceY(this.ringI) - this.offset;
        break;
      }
      case 'fall': {
        // integração exata (aceleração constante): tempo de queda igual em qualquer fps
        const v0 = this.vy;
        this.vy += g.spacing * 18 * dt;
        this.footY += (v0 + this.vy) * 0.5 * dt;
        const target = this.surfaceY(this.ringI + 1);
        if (this.footY >= target) this.land();
        break;
      }
      case 'dead': {
        this.deadT += dt;
        if (this.deadT > 0.9) this.showRevive();
        break;
      }
      default:
        break;
    }

    // câmera (sem acompanhar o quique, só a queda)
    const anchor = this.mode === 'fall' ? this.footY : this.surfaceY(this.ringI);
    const ty = anchor - this.H * 0.36;
    this.camY += (ty - this.camY) * Math.min(1, dt * (this.mode === 'fall' ? 14 : 8));

    // efeitos
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 40);
    if (this.flash > 0 && this.mode !== 'dead') this.flash = Math.max(0, this.flash - dt * 2);
    const arrived = this.fx.update(dt, g.spacing * 6, this.cx + this.W * 0.38, this.camY + 34);
    if (arrived) this.hud.coins.parentElement!.classList.remove('bump'), void this.hud.coins.offsetWidth, this.hud.coins.parentElement!.classList.add('bump');
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.life -= dt * 1.1;
      p.y -= dt * g.R * 2.2;
      if (p.life <= 0) this.pops.splice(i, 1);
    }
    // Turbo: chamas atrás do personagem
    if (this.fire > 0 && (this.mode === 'fall' || this.mode === 'hop' || this.mode === 'smash')) {
      const n = this.q.particleBudget >= 0.8 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const c = Math.random();
        this.fx.spawn(PK.Flame, this.cx + (Math.random() - 0.5) * g.R * 1.4, this.footY - g.R * (1.2 + Math.random() * 0.8), (Math.random() - 0.5) * 50, -80 - Math.random() * 80, 0.4, g.R * (0.3 + Math.random() * 0.25), c < 0.33 ? '#fff3a0' : c < 0.66 ? '#ffb340' : '#ff6a3d');
      }
    }
    // olhos
    this.blink -= dt;
    if (this.blink < -3.4) this.blink = 0.12;

    // nova zona
    const z = Math.floor(this.ringI / ZONE_LEN);
    if (z > this.zoneShown) {
      this.zoneShown = z;
      const zone = ZONES[z % ZONES.length];
      this.hud.zone.innerHTML = `<small>${t('tubo.zone', 'Zona {n}', { n: z + 1 })}</small><b>${zone.name()}</b>`;
      this.hud.zone.classList.remove('on');
      void this.hud.zone.offsetWidth;
      this.hud.zone.classList.add('on');
    }
  }

  private land(): void {
    this.ringI++;
    this.ensureRings();
    this.footY = this.surfaceY(this.ringI);
    this.mode = 'hop';
    this.hopT = 0;
    this.hopAmp = 1;
    this.offset = 0;
    this.sq = 0.34;
    this.sqv = 0;
    this.landTime = this.time;
    audio.land(Math.min(this.combo, 7));
    const r = this.ringByIdx(this.ringI);
    const z = r ? this.styles[r.zone].zone : ZONES[0];
    const n = Math.round(8 * this.q.particleBudget);
    for (let i = 0; i < n; i++) {
      const s = i % 2 ? 1 : -1;
      this.fx.spawn(PK.Spark, this.cx + s * this.geo.R * 0.6, this.footY, s * (60 + Math.random() * 120), -40 - Math.random() * 80, 0.35, 2.5 + Math.random() * 3, z.cloud);
    }
    if (this.buffered || this.queued) {
      this.buffered = false;
      this.smash();
    }
  }

  private collectNear(): void {
    const r = this.ringByIdx(this.ringI);
    if (!r) return;
    for (const it of r.items) {
      if (it.taken) continue;
      let d = norm(it.a + r.rot - FRONT);
      if (d > Math.PI) d -= TAU;
      if (Math.abs(d) < 0.2) this.collect(r, it);
    }
  }

  /* ============================== HUD ============================== */

  private syncHud(): void {
    const h = this.hud;
    const s = this.shown;
    if (s.score !== this.score) {
      s.score = this.score;
      h.score.textContent = fmt(this.score);
    }
    if (s.depth !== this.depth) {
      s.depth = this.depth;
      h.depth.textContent = t('tubo.hud.depth', 'Anel {n}', { n: fmt(this.depth) });
    }
    if (s.coins !== this.coinsRun) {
      s.coins = this.coinsRun;
      h.coins.textContent = fmt(this.coinsRun);
    }
    const c = this.combo >= 2 ? this.combo : 0;
    if (s.combo !== c) {
      s.combo = c;
      if (c) {
        h.combo.textContent = t('tubo.hud.combo', 'Combo x{n}', { n: c });
        h.combo.classList.remove('on');
        void h.combo.offsetWidth;
        h.combo.classList.add('on');
        h.combo.classList.toggle('hot', c >= FIRE_AT);
      } else h.combo.classList.remove('on');
    }
    const sh = this.shield || this.invuln > 0;
    if (s.shield !== sh) {
      s.shield = sh;
      h.shield.classList.toggle('on', sh);
    }
  }

  /* ============================== render ============================== */

  private render(): void {
    const x = this.ctx;
    const g = this.geo;
    const { W, H } = this;
    x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'source-over';

    // fundo com transição entre zonas
    const zf = this.footY / g.spacing / ZONE_LEN;
    const zA = Math.max(0, Math.floor(zf));
    const frac = zf - zA;
    x.imageSmoothingEnabled = true;
    x.drawImage(this.bgs[zA % ZONES.length], 0, 0, W, H);
    const blend = Math.min(1, Math.max(0, (frac - 0.8) / 0.2));
    if (blend > 0) {
      x.globalAlpha = blend;
      x.drawImage(this.bgs[(zA + 1) % ZONES.length], 0, 0, W, H);
      x.globalAlpha = 1;
    }
    // nuvens doces (paralaxe)
    if (this.q.starLayers >= 2) {
      const cs = this.cloudSpr.width / Math.min(this.dpr, 1.5);
      const span = H + cs * 2;
      for (let i = 0; i < 6; i++) {
        const sc = 0.6 + ((i * 37) % 5) * 0.18;
        const px = ((i * 151 + this.time * (6 + i * 2)) % (W + cs * 2)) - cs;
        let py = (i * 233 - this.camY * (0.12 + i * 0.03)) % span;
        if (py < 0) py += span;
        x.globalAlpha = 0.35 + (i % 3) * 0.1;
        x.drawImage(this.cloudSpr, px, py - cs, cs * sc * 1.6, cs * sc);
      }
      x.globalAlpha = 1;
    }
    // luz que vem de cima (claraboia do tubo)
    if (this.q.dynLights) drawLight(x, '255,246,220', this.cx, -H * 0.05, W * 0.75, 0.5, 0.9);

    x.save();
    if (this.shake > 0) x.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    x.translate(this.cx, -this.camY);

    // anéis visíveis de baixo para cima (o mais alto fica por cima)
    const top = this.camY - g.rOut;
    const bot = this.camY + H + g.thick;
    let lastIdx = -1;
    for (let i = this.rings.length - 1; i >= 0; i--) {
      if (this.rings[i].y - g.rOut * g.k < bot) {
        lastIdx = i;
        break;
      }
    }
    if (lastIdx >= 0) {
      const deepest = this.rings[lastIdx];
      // cano abaixo do anel mais fundo visível
      const st = this.styles[deepest.zone];
      x.fillStyle = st.pipe;
      x.fillRect(-g.rIn, deepest.y, g.rIn * 2, bot - deepest.y + 10);
    }
    for (let i = lastIdx; i >= 0; i--) {
      const r = this.rings[i];
      if (r.y + g.rOut * g.k + g.thick < top) break;
      const st = this.styles[r.zone];
      const yTop = i > 0 ? this.rings[i - 1].y : top - 20;
      if (!r.broken) {
        this.spriteFor(r);
        x.save();
        x.translate(0, r.y);
        drawRingSides(x, r, g, st);
        drawRingTop(x, r, g);
        if (r.flash > 0) this.drawFlash(x, r);
        this.drawItems(x, r, false);
        drawPipe(x, g, st, yTop - r.y, 0, this.q.vignette || this.q.atmospheres);
        this.drawItems(x, r, true);
        if (i === this.ringI - (this.rings[0]?.idx ?? 0) && this.mode !== 'fall') this.drawShadow(x, r);
        x.restore();
      } else {
        x.save();
        x.translate(0, r.y);
        drawPipe(x, g, this.styles[zoneAt(this.ringI)], yTop - r.y, 0, false);
        x.restore();
      }
    }

    this.drawParticles(x, true);
    this.drawHero(x);
    this.drawParticles(x, false);
    x.restore();

    // névoa de profundidade: o fundo do tubo some na cor do céu da zona
    if (this.q.grade) {
      const z = ZONES[zA % ZONES.length];
      drawGrade(x, W, H, 'rgba(255,255,255,0)', z.bg[2], 0.3, 'source-over');
      if (this.q.bloom) drawGrade(x, W, H, 'rgba(255,240,215,0.9)', 'rgba(40,10,60,0.9)', 0.35);
    }
    // bloom no Turbo (só no Alto)
    if (this.q.bloom && this.fire > 0) {
      x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.bloom.apply(x, this.cv, W, H, 0.55);
    }

    // textos flutuantes
    if (this.pops.length) {
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      for (const p of this.pops) {
        const a = Math.min(1, p.life * 2);
        const s = p.size * (1 + (1 - Math.min(1, (1 - p.life) * 6)) * 0.4);
        x.globalAlpha = a;
        x.font = gameFont(700, Math.round(g.R * 1.25 * s));
        x.lineWidth = Math.max(3, g.R * 0.22);
        x.strokeStyle = 'rgba(120,30,70,0.55)';
        x.strokeText(p.txt, p.x, p.y - this.camY);
        x.fillStyle = p.col;
        x.fillText(p.txt, p.x, p.y - this.camY);
      }
      x.globalAlpha = 1;
    }
    if (this.flash > 0) {
      x.globalAlpha = this.flash * 0.35;
      x.fillStyle = RED.top;
      x.fillRect(0, 0, W, H);
      x.globalAlpha = 1;
    }
  }

  private drawFlash(x: CanvasRenderingContext2D, r: Ring): void {
    const g = this.geo;
    const seg = segAt(r, norm(FRONT - r.rot));
    if (seg.type !== Seg.Red) return;
    const pulse = 0.5 + 0.5 * Math.sin(this.pose.t * 18);
    x.save();
    x.globalAlpha = r.flash * (0.35 + pulse * 0.4);
    x.fillStyle = '#ffffff';
    x.beginPath();
    x.ellipse(0, 0, g.rOut, g.rOut * g.k, 0, seg.a0 + r.rot, seg.a1 + r.rot);
    x.ellipse(0, 0, g.rIn, g.rIn * g.k, 0, seg.a1 + r.rot, seg.a0 + r.rot, true);
    x.fill();
    x.restore();
  }

  private drawItems(x: CanvasRenderingContext2D, r: Ring, front: boolean): void {
    const g = this.geo;
    for (const it of r.items) {
      if (it.taken) continue;
      const a = it.a + r.rot;
      const s = Math.sin(a);
      if (s >= 0 !== front) continue;
      const px = Math.cos(a) * g.rMid;
      const py = s * g.rMid * g.k;
      const bob = Math.sin(this.pose.t * 4 + it.a * 3) * g.R * 0.12;
      if (it.kind === 0) {
        const cw = this.coinSpr.width / this.dpr;
        const spin = Math.abs(Math.cos(this.pose.t * 3 + it.a * 2));
        x.drawImage(this.coinSpr, px - (cw * (0.25 + spin * 0.75)) / 2, py - cw - g.R * 0.15 + bob, cw * (0.25 + spin * 0.75), cw);
      } else {
        const rr = g.R * 0.55;
        x.fillStyle = 'rgba(160,230,255,0.45)';
        x.strokeStyle = '#ffffff';
        x.lineWidth = 2;
        x.beginPath();
        x.arc(px, py - rr - g.R * 0.2 + bob, rr, 0, TAU);
        x.fill();
        x.stroke();
        x.fillStyle = '#ffffff';
        x.beginPath();
        x.arc(px - rr * 0.35, py - rr * 1.35 - g.R * 0.2 + bob, rr * 0.22, 0, TAU);
        x.fill();
      }
    }
  }

  private drawShadow(x: CanvasRenderingContext2D, r: Ring): void {
    const g = this.geo;
    const seg = segAt(r, norm(FRONT - r.rot));
    if (seg.type === Seg.Gap) return;
    const k = 1 - Math.min(0.6, this.offset / (g.R * 3));
    if (this.q.softShadows) drawSoftShadow(x, 0, g.rMid * g.k, g.R * 0.95 * k, g.R * 0.32 * k, 0.4 * (0.5 + k * 0.5), true);
    else {
      x.fillStyle = 'rgba(90,20,60,0.28)';
      x.beginPath();
      x.ellipse(0, g.rMid * g.k, g.R * 0.95 * k, g.R * 0.3 * k, 0, 0, TAU);
      x.fill();
    }
  }

  private drawHero(x: CanvasRenderingContext2D): void {
    const g = this.geo;
    const R = g.R;
    const p = this.pose;
    const sq = Math.max(-0.35, Math.min(0.5, this.sq));
    p.sx = 1 + sq;
    p.sy = 1 - sq;
    p.blink = this.blink > 0 ? 1 : 0;
    p.mood = this.mode === 'dead' || this.mode === 'over' ? 'dead' : this.mode === 'fall' ? 'fly' : this.combo >= 2 ? 'happy' : 'idle';
    p.lookY = this.mode === 'fall' || this.mode === 'smash' ? 0.6 : 0.2;
    p.lookX = Math.sin(this.pose.t * 0.9) * 0.2;
    const fy = this.footY;
    // brilho do Turbo / escudo
    if (this.fire > 0 && this.q.glows) {
      x.globalAlpha = 0.55 + Math.sin(this.pose.t * 14) * 0.1;
      const s = R * 4.2;
      x.drawImage(this.glowSpr, -s / 2, fy - R - s / 2, s, s);
      x.globalAlpha = 1;
    }
    x.save();
    x.translate(0, fy - R * 1.04 * p.sy);
    if (this.mode === 'dead' || this.mode === 'over') x.rotate(Math.sin(this.deadT * 30) * 0.08 * Math.max(0, 1 - this.deadT * 2));
    drawPlayer(x, this.skin, R, p);
    x.restore();
    // luz de recorte vinda de cima
    if (this.q.dynLights) drawRim(x, 0, fy - R * 1.04 * p.sy, R * 1.02, -Math.PI / 2 - 0.5, '255,244,214', 0.5);
    if (this.shield || this.invuln > 0) {
      const blinkOut = this.invuln > 0 && this.invuln < 0.8 && Math.sin(this.pose.t * 30) < 0;
      if (!blinkOut) {
        const rr = R * 1.55;
        x.globalAlpha = 0.22;
        x.fillStyle = '#bff3ff';
        x.beginPath();
        x.arc(0, fy - R, rr, 0, TAU);
        x.fill();
        x.globalAlpha = 0.9;
        x.strokeStyle = '#e8fbff';
        x.lineWidth = Math.max(2, R * 0.1);
        x.stroke();
        x.globalAlpha = 0.8;
        x.beginPath();
        x.arc(0, fy - R, rr * 0.8, Math.PI * 1.1, Math.PI * 1.45);
        x.stroke();
        x.globalAlpha = 1;
      }
    }
  }

  private drawParticles(x: CanvasRenderingContext2D, flames: boolean): void {
    const f = this.fx;
    const cx = this.cx;
    const add = this.q.glows;
    for (let i = 0; i < f.n; i++) {
      const k = f.kind[i];
      if ((k === PK.Flame) !== flames) continue;
      const life = f.life[i] / f.max[i];
      const px = f.x[i] - cx;
      const py = f.y[i];
      if (k === PK.Chunk) {
        const s = f.size[i];
        x.globalAlpha = Math.min(1, life * 3);
        x.fillStyle = f.col[i];
        x.save();
        x.translate(px, py);
        x.rotate(f.rot[i]);
        x.fillRect(-s / 2, -s * 0.3, s, s * 0.6);
        x.restore();
      } else if (k === PK.Coin) {
        const cw = this.coinSpr.width / this.dpr;
        x.globalAlpha = 1;
        x.drawImage(this.coinSpr, px - cw / 2, py - cw / 2, cw, cw);
      } else {
        x.globalAlpha = k === PK.Flame ? life * (add ? 0.9 : 0.7) : life;
        x.fillStyle = f.col[i];
        x.beginPath();
        x.arc(px, py, f.size[i] * (k === PK.Flame ? 0.4 + life * 0.6 : 1), 0, TAU);
        x.fill();
      }
    }
    x.globalAlpha = 1;
  }
}

/* ============================== sprites ============================== */

function makeCoinSprite(px: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = Math.max(8, px);
  const x = c.getContext('2d')!;
  const r = c.width / 2;
  const g = x.createLinearGradient(0, 0, 0, c.width);
  g.addColorStop(0, '#fff6b0');
  g.addColorStop(0.5, '#ffcf2e');
  g.addColorStop(1, '#e98f00');
  x.fillStyle = '#c56d00';
  x.beginPath();
  x.arc(r, r, r, 0, TAU);
  x.fill();
  x.fillStyle = g;
  x.beginPath();
  x.arc(r, r, r * 0.84, 0, TAU);
  x.fill();
  x.fillStyle = 'rgba(255,255,255,0.7)';
  x.beginPath();
  x.ellipse(r * 0.75, r * 0.65, r * 0.22, r * 0.34, -0.5, 0, TAU);
  x.fill();
  return c;
}

function makeGlowSprite(px: number, rgb: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
  g.addColorStop(0, `rgba(${rgb},0.9)`);
  g.addColorStop(0.4, `rgba(${rgb},0.35)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = g;
  x.fillRect(0, 0, px, px);
  return c;
}

function makeCloudSprite(px: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = px;
  c.height = Math.round(px * 0.62);
  const x = c.getContext('2d')!;
  x.fillStyle = '#ffffff';
  const h = c.height;
  const blobs: [number, number, number][] = [
    [0.22, 0.66, 0.2],
    [0.42, 0.45, 0.27],
    [0.64, 0.52, 0.23],
    [0.8, 0.7, 0.16],
    [0.5, 0.75, 0.22],
  ];
  for (const [bx, by, br] of blobs) {
    x.beginPath();
    x.arc(bx * px, by * h, br * px, 0, TAU);
    x.fill();
  }
  return c;
}

export async function launch(root: HTMLElement, exit: () => void): Promise<MiniGameHandle> {
  return new TuboGame(root, exit);
}
