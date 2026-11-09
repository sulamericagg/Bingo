/* ============================================================
 *  ABERTURA — "TEAM Ross apresenta" → dobra espacial → BLOOP ORBIT
 *  Canvas próprio por cima de tudo; o jogo é montado por trás.
 *  100% procedural (sem imagens), som sintetizado num grafo WebAudio próprio.
 *  ~4,5 s na primeira vez, ~1,5 s depois; um toque pula.
 * ============================================================ */
import './intro.css';
import { SplashScreen } from '@capacitor/splash-screen';
import { isNative } from '../core/platform';
import { detectInitialTier, type Tier } from '../core/quality';
import { save } from '../core/storage';
import { skinById } from '../game/skins';
import { drawPlayer, glow } from '../game/sprites';
import { gameFont } from '../i18n/font';

const SEEN_KEY = 'bo-intro-seen';
const TAU = Math.PI * 2;
const SPLASH_BG = '#0b0620';

/* ----------------------------- linha do tempo ----------------------------- */

interface Timeline {
  /** partículas convergindo (conv0 < 0 = sem partículas) */
  conv0: number;
  conv1: number;
  reveal0: number;
  reveal1: number;
  flash: number;
  shine0: number;
  shine1: number;
  /** "apresenta" (< 0 = não mostra) */
  sub0: number;
  logoOut0: number;
  logoOut1: number;
  warp0: number;
  warp1: number;
  title0: number;
  fly0: number;
  fly1: number;
  out0: number;
  out1: number;
}

const FULL: Timeline = {
  conv0: 0.1,
  conv1: 1.5,
  reveal0: 1.28,
  reveal1: 1.7,
  flash: 1.42,
  shine0: 1.72,
  shine1: 2.5,
  sub0: 1.95,
  logoOut0: 2.85,
  logoOut1: 3.2,
  warp0: 2.8,
  warp1: 3.5,
  title0: 3.22,
  fly0: 3.3,
  fly1: 4.0,
  out0: 4.12,
  out1: 4.58,
};

const SHORT: Timeline = {
  conv0: -1,
  conv1: -1,
  reveal0: 0.02,
  reveal1: 0.3,
  flash: 0.08,
  shine0: 0.18,
  shine1: 0.62,
  sub0: -1,
  logoOut0: 0.62,
  logoOut1: 0.85,
  warp0: 0.58,
  warp1: 1.0,
  title0: 0.8,
  fly0: 0.8,
  fly1: 1.25,
  out0: 1.2,
  out1: 1.55,
};

/* ----------------------------- utilidades ----------------------------- */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const smooth = (t: number, a: number, b: number) => {
  const k = span(t, a, b);
  return k * k * (3 - 2 * k);
};
const easeOut3 = (k: number) => 1 - Math.pow(1 - k, 3);
const easeInOut3 = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const easeOutBack = (k: number) => {
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
};

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return [c, c.getContext('2d')!];
}

/** texto com espaçamento manual (letterSpacing do canvas não existe em WebViews antigas) */
function trackedWidth(x: CanvasRenderingContext2D, s: string, track: number): number {
  let w = 0;
  for (const ch of s) w += x.measureText(ch).width + track;
  return w - track;
}
function fillTracked(x: CanvasRenderingContext2D, s: string, x0: number, y: number, track: number, stroke = false): void {
  let px = x0;
  for (const ch of s) {
    if (stroke) x.strokeText(ch, px, y);
    else x.fillText(ch, px, y);
    px += x.measureText(ch).width + track;
  }
}

/* ============================================================
 *  MARCA TEAM Ross — planeta com anel + monograma "TR" em ligadura
 *  (a barra do T vira o topo do R; os dois dividem a haste)
 * ============================================================ */

const RING_TILT = -0.36;
const RING_RX = 1.62;
const RING_RY = 0.44;

function monogramPath(x: CanvasRenderingContext2D, m: number): void {
  // T e R dividem a barra de cima: haste do T à esquerda, R completo à direita
  const o = 0.12 * m; // centraliza o conjunto
  const top = -0.4 * m;
  const ts = -0.3 * m + o; // haste do T
  const rs = -0.02 * m + o; // haste do R
  const bx = 0.1 * m + o; // início do bojo
  x.beginPath();
  x.moveTo(-0.66 * m + o, top);
  x.lineTo(bx, top);
  x.arc(bx, -0.14 * m, 0.26 * m, -Math.PI / 2, Math.PI / 2);
  x.lineTo(rs, 0.12 * m);
  x.moveTo(ts, top);
  x.lineTo(ts, 0.5 * m);
  x.moveTo(rs, top);
  x.lineTo(rs, 0.5 * m);
  x.moveTo(0.08 * m + o, 0.12 * m);
  x.lineTo(0.4 * m + o, 0.5 * m);
}

function drawRingArc(x: CanvasRenderingContext2D, m: number, front: boolean): void {
  x.save();
  x.rotate(RING_TILT);
  const g = x.createLinearGradient(-RING_RX * m, 0, RING_RX * m, 0);
  g.addColorStop(0, '#5ef0ff');
  g.addColorStop(0.5, '#b98bff');
  g.addColorStop(1, '#ff5cc8');
  const a0 = front ? 0 : Math.PI;
  const a1 = front ? Math.PI : TAU;
  // halo do anel
  x.strokeStyle = g;
  x.globalAlpha = 0.28;
  x.lineWidth = 0.2 * m;
  x.lineCap = 'round';
  x.beginPath();
  x.ellipse(0, 0, RING_RX * m, RING_RY * m, 0, a0, a1);
  x.stroke();
  x.globalAlpha = 1;
  x.lineWidth = 0.075 * m;
  x.beginPath();
  x.ellipse(0, 0, RING_RX * m, RING_RY * m, 0, a0, a1);
  x.stroke();
  // fio de luz interno
  x.strokeStyle = 'rgba(255,255,255,0.75)';
  x.lineWidth = 0.022 * m;
  x.beginPath();
  x.ellipse(0, 0, RING_RX * m, RING_RY * m, 0, a0 + 0.25, a1 - 0.25);
  x.stroke();
  x.restore();
}

function drawMark(x: CanvasRenderingContext2D, m: number): void {
  // atmosfera
  const atm = x.createRadialGradient(0, 0, m * 0.8, 0, 0, m * 1.75);
  atm.addColorStop(0, 'rgba(160,100,255,0.55)');
  atm.addColorStop(0.45, 'rgba(255,92,200,0.16)');
  atm.addColorStop(1, 'rgba(255,92,200,0)');
  x.fillStyle = atm;
  x.fillRect(-m * 1.8, -m * 1.8, m * 3.6, m * 3.6);

  drawRingArc(x, m, false);

  // disco do planeta
  const g = x.createRadialGradient(-m * 0.38, -m * 0.45, m * 0.05, 0, 0, m * 1.02);
  g.addColorStop(0, '#c3a2ff');
  g.addColorStop(0.35, '#7b45f0');
  g.addColorStop(0.75, '#3d128f');
  g.addColorStop(1, '#1c0650');
  x.fillStyle = g;
  x.beginPath();
  x.arc(0, 0, m, 0, TAU);
  x.fill();
  x.save();
  x.clip();
  // faixas suaves (gigante gasoso)
  x.globalAlpha = 0.13;
  x.fillStyle = '#ff8fe0';
  for (const [y, h] of [
    [-0.62, 0.1],
    [0.18, 0.08],
    [0.55, 0.14],
  ]) {
    x.beginPath();
    x.ellipse(0, y * m, m * 1.2, h * m, -0.12, 0, TAU);
    x.fill();
  }
  x.globalAlpha = 1;
  // sombra do terminador
  const sh = x.createRadialGradient(-m * 0.5, -m * 0.55, m * 0.6, -m * 0.2, -m * 0.25, m * 1.55);
  sh.addColorStop(0, 'rgba(10,0,30,0)');
  sh.addColorStop(1, 'rgba(10,0,30,0.6)');
  x.fillStyle = sh;
  x.fillRect(-m, -m, m * 2, m * 2);
  // contraluz ciano
  x.strokeStyle = 'rgba(94,240,255,0.3)';
  x.lineWidth = m * 0.05;
  x.beginPath();
  x.arc(0, 0, m * 0.98, 0.15, 1.5);
  x.stroke();
  x.restore();
  // borda de luz superior
  x.strokeStyle = 'rgba(255,255,255,0.35)';
  x.lineWidth = m * 0.025;
  x.beginPath();
  x.arc(0, 0, m * 0.985, Math.PI * 1.05, Math.PI * 1.6);
  x.stroke();

  // monograma: sombra de profundidade + traço principal
  x.lineCap = 'round';
  x.lineJoin = 'round';
  x.save();
  x.translate(m * 0.025, m * 0.07);
  x.strokeStyle = 'rgba(28,4,70,0.75)';
  x.lineWidth = m * 0.18;
  monogramPath(x, m);
  x.stroke();
  x.restore();
  const mg = x.createLinearGradient(0, -m * 0.5, 0, m * 0.55);
  mg.addColorStop(0, '#ffffff');
  mg.addColorStop(0.6, '#ffe6fa');
  mg.addColorStop(1, '#ffb8ea');
  x.save();
  x.shadowColor = 'rgba(255,170,240,0.85)';
  x.shadowBlur = m * 0.22;
  x.strokeStyle = mg;
  x.lineWidth = m * 0.165;
  monogramPath(x, m);
  x.stroke();
  x.restore();

  drawRingArc(x, m, true);
}

interface LogoArt {
  c: HTMLCanvasElement;
  /** tamanho em px CSS */
  w: number;
  h: number;
  /** centro da marca dentro do logo (px CSS) */
  mx: number;
  my: number;
  m: number;
}

function buildLogo(bw: number, dpr: number): LogoArt {
  const bh = bw * 0.98;
  const [c, x] = canvas(bw * dpr, bh * dpr);
  x.scale(dpr, dpr);
  const m = bw * 0.2;
  const mx = bw / 2;
  const my = bh * 0.37;
  x.save();
  x.translate(mx, my);
  drawMark(x, m);
  x.restore();

  // wordmark: "TEAM" ciano espaçado + "Ross" rosado
  const fs = bw * 0.155;
  x.font = gameFont(700, fs);
  x.textBaseline = 'alphabetic';
  x.textAlign = 'left';
  const t1 = 'TEAM';
  const t2 = 'Ross';
  const tr1 = fs * 0.1;
  const tr2 = fs * 0.02;
  const gap = fs * 0.3;
  const w1 = trackedWidth(x, t1, tr1);
  const w2 = trackedWidth(x, t2, tr2);
  const x0 = (bw - (w1 + gap + w2)) / 2;
  const y0 = bh * 0.87;
  // sombra sólida (mesma linguagem do logo do jogo)
  x.fillStyle = '#2a0b5c';
  fillTracked(x, t1, x0, y0 + fs * 0.07, tr1);
  fillTracked(x, t2, x0 + w1 + gap, y0 + fs * 0.07, tr2);
  x.save();
  x.shadowColor = 'rgba(160,110,255,0.7)';
  x.shadowBlur = fs * 0.35;
  const g1 = x.createLinearGradient(0, y0 - fs * 0.75, 0, y0);
  g1.addColorStop(0.1, '#ffffff');
  g1.addColorStop(0.6, '#c9f9ff');
  g1.addColorStop(1, '#5ee6ff');
  x.fillStyle = g1;
  fillTracked(x, t1, x0, y0, tr1);
  const g2 = x.createLinearGradient(0, y0 - fs * 0.75, 0, y0);
  g2.addColorStop(0.1, '#ffffff');
  g2.addColorStop(0.6, '#ffd0f3');
  g2.addColorStop(1, '#ff6fcf');
  x.fillStyle = g2;
  fillTracked(x, t2, x0 + w1 + gap, y0, tr2);
  x.restore();
  return { c, w: bw, h: bh, mx, my, m };
}

function buildSubtitle(fs: number, dpr: number): [HTMLCanvasElement, number, number] {
  const [, mx] = canvas(1, 1);
  mx.font = gameFont(600, fs);
  const tr = fs * 0.55;
  const s = 'apresenta';
  const w = trackedWidth(mx, s, tr) + fs;
  const h = fs * 2;
  const [c, x] = canvas(w * dpr, h * dpr);
  x.scale(dpr, dpr);
  x.font = mx.font;
  x.textBaseline = 'middle';
  // linhas finas dos lados ("— apresenta —" sem usar travessão em texto)
  x.fillStyle = 'rgba(214,196,255,0.85)';
  fillTracked(x, s, fs * 0.5, h / 2, tr);
  return [c, w, h];
}

/* ------------------------------ título do jogo ------------------------------ */

function buildTitleWord(word: string, fs: number, dpr: number, grad: [string, string, string], shadow: string, glowC: string): [HTMLCanvasElement, number, number] {
  const [, mx] = canvas(1, 1);
  mx.font = gameFont(700, fs);
  const track = 2;
  const tw = trackedWidth(mx, word, track);
  const pad = fs * 0.35;
  const w = tw + pad * 2;
  const h = fs * 1.25 + pad;
  const [c, x] = canvas(w * dpr, h * dpr);
  x.scale(dpr, dpr);
  x.font = mx.font;
  x.textBaseline = 'alphabetic';
  const by = pad * 0.5 + fs * 0.92;
  // brilho (drop-shadow 0 0 22px)
  x.save();
  x.shadowColor = glowC;
  x.shadowBlur = 22;
  x.fillStyle = shadow;
  fillTracked(x, word, pad, by + 5, track);
  x.restore();
  // sombra sólida (drop-shadow 0 5px 0)
  x.fillStyle = shadow;
  fillTracked(x, word, pad, by + 5, track);
  const g = x.createLinearGradient(0, by - fs * 0.78, 0, by + fs * 0.08);
  g.addColorStop(0.1, grad[0]);
  g.addColorStop(0.55, grad[1]);
  g.addColorStop(1, grad[2]);
  x.fillStyle = g;
  fillTracked(x, word, pad, by, track);
  return [c, w, h];
}

/* ============================================================
 *  SOM — grafo WebAudio próprio, fechado ao final
 * ============================================================ */

class IntroSfx {
  ctx: AudioContext | null = null;
  private out!: GainNode;
  private rev!: ConvolverNode;
  private noise!: AudioBuffer;
  private dead = false;

  constructor() {
    if (!save.sound) return;
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      const ctx: AudioContext = new AC({ latencyHint: 'interactive' });
      this.ctx = ctx;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 3;
      this.out = ctx.createGain();
      this.out.gain.value = 0.62;
      this.out.connect(comp).connect(ctx.destination);
      this.rev = ctx.createConvolver();
      const len = Math.floor(ctx.sampleRate * 2.4);
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      }
      this.rev.buffer = ir;
      const wet = ctx.createGain();
      wet.gain.value = 0.5;
      this.rev.connect(wet).connect(this.out);
      const nl = Math.floor(ctx.sampleRate * 2);
      this.noise = ctx.createBuffer(1, nl, ctx.sampleRate);
      const nd = this.noise.getChannelData(0);
      for (let i = 0; i < nl; i++) nd[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  /** só toca se o contexto estiver rodando (WebView/autoplay); senão fica em silêncio */
  private ok(): AudioContext | null {
    const c = this.ctx;
    return c && !this.dead && c.state === 'running' ? c : null;
  }

  resume(): void {
    this.ctx?.resume().catch(() => {});
  }

  /** whoosh: ruído filtrado com varredura de frequência e pan */
  whoosh(dur: number, f0: number, f1: number, vol: number, pan0 = -0.6, pan1 = 0.6): void {
    const c = this.ok();
    if (!c) return;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.82);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.18);
    let node: AudioNode = g;
    if (c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.setValueAtTime(pan0, t);
      p.pan.linearRampToValueAtTime(pan1, t + dur);
      g.connect(p);
      node = p;
    }
    src.connect(bp).connect(g);
    node.connect(this.out);
    node.connect(this.rev);
    src.start(t);
    src.stop(t + dur + 0.25);
  }

  /** acorde quente (Fmaj9) + sino brilhante + baque grave */
  sting(vol = 1): void {
    const c = this.ok();
    if (!c) return;
    const t = c.currentTime;
    // baque
    const o = c.createOscillator();
    const og = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.45);
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.55 * vol, t + 0.012);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(og).connect(this.out);
    o.start(t);
    o.stop(t + 0.65);
    // pad: dente-de-serra em passa-baixa que fecha devagar
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.8;
    lp.frequency.setValueAtTime(3200, t);
    lp.frequency.exponentialRampToValueAtTime(700, t + 2.2);
    const pg = c.createGain();
    pg.gain.setValueAtTime(0.0001, t);
    pg.gain.exponentialRampToValueAtTime(0.16 * vol, t + 0.04);
    pg.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
    lp.connect(pg);
    pg.connect(this.out);
    pg.connect(this.rev);
    const notes = [87.31, 130.81, 220.0, 261.63, 329.63, 392.0, 523.25];
    notes.forEach((f, i) => {
      for (const det of [-6, 6]) {
        const n = c.createOscillator();
        n.type = i < 2 ? 'triangle' : 'sawtooth';
        n.frequency.value = f;
        n.detune.value = det;
        const ng = c.createGain();
        ng.gain.value = i < 2 ? 0.9 : 0.35;
        n.connect(ng).connect(lp);
        n.start(t + i * 0.012);
        n.stop(t + 2.9);
      }
    });
    // sino
    for (const [f, d, v] of [
      [1046.5, 1.6, 0.09],
      [1568, 1.2, 0.06],
      [2093, 0.8, 0.04],
    ] as const) {
      const b = c.createOscillator();
      b.type = 'sine';
      b.frequency.value = f;
      const bg = c.createGain();
      bg.gain.setValueAtTime(0.0001, t + 0.03);
      bg.gain.exponentialRampToValueAtTime(v * vol, t + 0.045);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + d);
      b.connect(bg);
      bg.connect(this.out);
      bg.connect(this.rev);
      b.start(t + 0.03);
      b.stop(t + d + 0.05);
    }
  }

  /** "blup" fofo do personagem */
  chirp(): void {
    const c = this.ok();
    if (!c) return;
    const t = c.currentTime;
    for (const [d, f0, f1] of [
      [0, 520, 1040],
      [0.11, 700, 1400],
    ] as const) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f0, t + d);
      o.frequency.exponentialRampToValueAtTime(f1, t + d + 0.09);
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.16, t + d + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.16);
      o.connect(g);
      g.connect(this.out);
      g.connect(this.rev);
      o.start(t + d);
      o.stop(t + d + 0.2);
    }
  }

  /** abaixa tudo e fecha o contexto depois da cauda do reverb */
  close(fast: boolean): void {
    const c = this.ctx;
    if (!c || this.dead) return;
    this.dead = true;
    try {
      this.out.gain.setTargetAtTime(0, c.currentTime, fast ? 0.08 : 0.6);
    } catch {
      /* ignora */
    }
    setTimeout(() => c.close().catch(() => {}), fast ? 600 : 2600);
  }
}

/* ============================================================
 *  playIntro
 * ============================================================ */

const QUALITY = {
  particles: [150, 280, 480, 720],
  stars: [60, 110, 170, 240],
  dpr: [1, 1.5, 2, 2.5],
} as const;

function hasSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}
function markSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* ignora */
  }
}

let running: Promise<void> | null = null;

/**
 * Toca a abertura do estúdio. Não bloqueia: o jogo pode ser criado enquanto ela roda.
 * Resolve quando a camada termina de sumir (ou imediatamente se algo falhar).
 * `?nointro` na URL pula; `?intro=full` força a versão longa.
 */
export function playIntro(opts: { short?: boolean } = {}): Promise<void> {
  if (running) return running;
  const q = typeof location !== 'undefined' ? location.search : '';
  if (/[?&]nointro\b/.test(q)) {
    hideSplash();
    return Promise.resolve();
  }
  let short = opts.short ?? hasSeen();
  if (/[?&]intro=full\b/.test(q)) short = false;
  if (/[?&]intro=short\b/.test(q)) short = true;
  try {
    if (!opts.short && matchMedia('(prefers-reduced-motion: reduce)').matches) short = true;
  } catch {
    /* ignora */
  }
  markSeen();
  running = new Promise<void>((resolve) => {
    try {
      run(short ? SHORT : FULL, short, resolve);
    } catch (e) {
      console.warn('[intro]', e);
      document.querySelector('.bo-intro')?.remove();
      hideSplash();
      resolve();
    }
  }).finally(() => {
    running = null;
  });
  return running;
}

let splashHidden = false;
function hideSplash(): void {
  if (splashHidden || !isNative) return;
  splashHidden = true;
  SplashScreen.hide({ fadeOutDuration: 180 }).catch(() => {});
}

function run(T: Timeline, short: boolean, resolve: () => void): void {
  let tier: Tier = 2;
  try {
    tier = detectInitialTier();
  } catch {
    /* segue no médio */
  }

  const layer = document.createElement('div');
  layer.className = 'bo-intro';
  layer.setAttribute('aria-hidden', 'true');
  const cv = document.createElement('canvas');
  layer.appendChild(cv);
  document.body.appendChild(layer);

  const x = cv.getContext('2d', { alpha: false })!;

  let W = window.innerWidth;
  let H = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, QUALITY.dpr[tier]);
  const fit = () => {
    W = window.innerWidth;
    H = window.innerHeight;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
  };
  fit();

  /* ---------- arte ---------- */
  const logo = buildLogo(Math.min(W * 0.8, 340), dpr);
  const LX = () => W / 2 - logo.w / 2;
  const LY = () => H * 0.43 - logo.h / 2;
  const [subC, subW, subH] = buildSubtitle(Math.max(11, logo.w * 0.045), dpr);
  const [shine, sx] = canvas(logo.c.width, logo.c.height);

  // título: tenta casar com o logo do menu (corte invisível no fade)
  const tfs = Math.min(W * 0.19, 96);
  const bloopW = buildTitleWord('BLOOP', tfs, dpr, ['#ffffff', '#ffc2f0', '#ff5cc8'], '#5a1a8f', 'rgba(255,92,200,0.55)');
  const orbitW = buildTitleWord('ORBIT', tfs, dpr, ['#ffffff', '#b6f7ff', '#5ef0ff'], '#1a3d8f', 'rgba(94,240,255,0.55)');
  const titleTop = (): number => {
    const h1 = document.querySelector<HTMLElement>('#menu .logo h1');
    const r = h1?.getBoundingClientRect();
    if (r && r.height > 10 && r.top > 0 && r.top < H * 0.6) return r.top;
    return H * 0.06 + 40;
  };
  let tTop = -1;

  // sprites de brilho
  const gW = glow('#ffffff', 32);
  const gC = glow('#7df3ff', 32);
  const gP = glow('#ff8fd8', 32);
  const gV = glow('#b48cff', 32);
  const gY = glow('#ffe27a', 32);
  const gBig = glow('#c9a6ff', 128);
  const sprites = [gW, gC, gP, gV];

  /* ---------- partículas da logo ---------- */
  const NP = T.conv0 >= 0 ? QUALITY.particles[tier] : 0;
  const P = {
    tx: new Float32Array(NP),
    ty: new Float32Array(NP),
    ox: new Float32Array(NP),
    oy: new Float32Array(NP),
    del: new Float32Array(NP),
    dur: new Float32Array(NP),
    sw: new Float32Array(NP),
    sz: new Float32Array(NP),
    col: new Uint8Array(NP),
  };
  if (NP) {
    const lw = logo.c.width;
    const lh = logo.c.height;
    const data = logo.c.getContext('2d')!.getImageData(0, 0, lw, lh).data;
    const stride = Math.max(2, Math.round(2 * dpr));
    const cand: number[] = [];
    for (let py = 0; py < lh; py += stride)
      for (let px = 0; px < lw; px += stride) {
        const i = (py * lw + px) * 4;
        if (data[i + 3] > 170 && data[i] + data[i + 1] + data[i + 2] > 240) cand.push(i);
      }
    for (let k = 0; k < NP && cand.length; k++) {
      const pick = Math.floor(Math.random() * cand.length);
      const i = cand[pick];
      cand[pick] = cand[cand.length - 1];
      cand.pop();
      const px = (i / 4) % lw;
      const py = Math.floor(i / 4 / lw);
      P.tx[k] = px / dpr;
      P.ty[k] = py / dpr;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      P.col[k] = r > 235 && g > 235 && b > 235 ? 0 : g > r && b > 200 ? 1 : r > b ? 2 : 3;
      const a = Math.random() * TAU;
      const dist = Math.hypot(W, H) * (0.22 + Math.random() * 0.6);
      P.ox[k] = Math.cos(a) * dist;
      P.oy[k] = Math.sin(a) * dist;
      // quem está mais perto do centro chega por último (o desenho "se fecha")
      P.del[k] = Math.random() * 0.4;
      P.dur[k] = 0.85 + Math.random() * 0.3;
      P.sw[k] = (Math.random() < 0.5 ? -1 : 1) * (1.4 + Math.random() * 1.6);
      P.sz[k] = 4 + Math.random() * 6;
    }
  }

  /* ---------- campo de estrelas (deriva → dobra) ---------- */
  const NS = QUALITY.stars[tier];
  const S = {
    x: new Float32Array(NS),
    y: new Float32Array(NS),
    z: new Float32Array(NS),
    c: new Uint8Array(NS),
  };
  const respawn = (i: number, z: number) => {
    const a = Math.random() * TAU;
    const r = 0.05 + Math.random() * 1.1;
    S.x[i] = Math.cos(a) * r;
    S.y[i] = Math.sin(a) * r;
    S.z[i] = z;
    S.c[i] = Math.random() < 0.6 ? 0 : Math.random() < 0.5 ? 1 : 2;
  };
  for (let i = 0; i < NS; i++) respawn(i, 0.15 + Math.random() * 0.85);
  const STAR_COL = ['#ffffff', '#9ff4ff', '#ffb3ec'];

  /* ---------- herói ---------- */
  const skin = skinById('bloop');
  const trail: number[] = []; // x,y,...
  const sparks: { x: number; y: number; vx: number; vy: number; life: number; s: number; c: number }[] = [];

  /* ---------- som ---------- */
  const sfx = new IntroSfx();
  const cues: [number, () => void][] = [];
  if (T.conv0 >= 0) cues.push([T.conv0 + 0.05, () => sfx.whoosh(1.3, 260, 2600, 0.45)]);
  cues.push([T.flash - (short ? 0.02 : 0), () => sfx.sting(short ? 0.7 : 1)]);
  cues.push([T.warp0 + 0.05, () => sfx.whoosh(short ? 0.45 : 0.7, 500, 5200, 0.38, 0.4, -0.4)]);
  cues.push([T.fly0 + (T.fly1 - T.fly0) * 0.72, () => sfx.chirp()]);
  let cueIdx = 0;

  /* ---------- controle ---------- */
  let start = -1;
  let last = 0;
  let t = 0;
  let outStarted = false;
  let done = false;
  let raf = 0;
  let firstFrame = true;

  const finish = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', fit);
    layer.removeEventListener('pointerdown', skip);
    window.removeEventListener('keydown', onKey);
    sfx.close(false);
    layer.remove();
    hideSplash();
    resolve();
  };
  const beginOut = (fast: boolean) => {
    if (outStarted) return;
    outStarted = true;
    const dur = fast ? 0.32 : T.out1 - T.out0;
    layer.style.transitionDuration = dur + 's';
    layer.classList.add('out');
    if (fast) sfx.close(true);
    setTimeout(finish, dur * 1000 + 60);
  };
  const skip = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    sfx.resume();
    if (t > 0.15) beginOut(true);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') beginOut(true);
  };
  layer.addEventListener('pointerdown', skip);
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', fit);
  // rede de segurança: rAF parado (aba oculta) não pode prender o jogador
  setTimeout(finish, (T.out1 + 3) * 1000);

  /* ---------- quadro ---------- */
  const frame = (now: number) => {
    if (done) return;
    raf = requestAnimationFrame(frame);
    if (start < 0) {
      start = now;
      last = now;
    }
    // engasgo (GC, montagem do jogo): "congela" o tempo em vez de pular a animação
    const gap = now - last;
    if (gap > 70) start += gap - 33;
    last = now;
    t = (now - start) / 1000;

    while (cueIdx < cues.length && t >= cues[cueIdx][0]) cues[cueIdx++][1]();
    if (!outStarted && t >= T.out0) beginOut(false);

    draw(t, Math.min(gap, 50) / 1000);

    if (firstFrame) {
      firstFrame = false;
      hideSplash();
    }
  };

  // fundos pré-renderizados em 1/4 da resolução (degradês esticados = custo mínimo por frame)
  let bgA: HTMLCanvasElement | null = null;
  let bgB: HTMLCanvasElement | null = null;
  let bgW = 0;
  let bgH = 0;

  const draw = (t: number, dt: number) => {
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.globalCompositeOperation = 'source-over';
    x.globalAlpha = 1;
    const cx = W / 2;
    const cy = H * 0.43;
    if (!bgA || bgW !== W || bgH !== H) {
      bgW = W;
      bgH = H;
      const q = 4;
      const [a, ax] = canvas(W / q, H / q);
      const ga = ax.createRadialGradient(cx / q, cy / q, 0, cx / q, cy / q, (Math.max(W, H) * 0.75) / q);
      ga.addColorStop(0, '#170a33');
      ga.addColorStop(0.55, '#08041a');
      ga.addColorStop(1, '#030209');
      ax.fillStyle = ga;
      ax.fillRect(0, 0, a.width, a.height);
      const [b, bx] = canvas(8, H / q);
      const gb = bx.createLinearGradient(0, 0, 0, b.height);
      gb.addColorStop(0, '#0a0520');
      gb.addColorStop(1, '#2c0f58');
      bx.fillStyle = gb;
      bx.fillRect(0, 0, b.width, b.height);
      bgA = a;
      bgB = b;
    }

    /* fundo: rastro (persistência) durante a convergência */
    const conv = NP > 0 && t < T.reveal1 + 0.1;
    const kB = smooth(t, T.warp0 + 0.25, T.warp1);
    x.globalAlpha = conv && t > T.conv0 + 0.25 ? 0.42 : 1;
    if (kB < 1) x.drawImage(bgA!, 0, 0, W, H);
    if (kB > 0) {
      x.globalAlpha = kB;
      x.drawImage(bgB!, 0, 0, W, H);
    }
    x.globalAlpha = 1;
    // sai da cor do splash nativo
    const kSplash = 1 - smooth(t, 0, short ? 0.12 : 0.35);
    if (kSplash > 0) {
      x.globalAlpha = kSplash;
      x.fillStyle = SPLASH_BG;
      x.fillRect(0, 0, W, H);
      x.globalAlpha = 1;
    }

    /* estrelas: deriva lenta → dobra espacial → desacelera no título */
    const warpK = smooth(t, T.warp0, T.warp0 + (T.warp1 - T.warp0) * 0.55) * (1 - smooth(t, T.warp1 - 0.15, T.warp1 + 0.35));
    const speed = 0.035 + warpK * (short ? 3.2 : 2.6);
    const starA = smooth(t, 0.1, short ? 0.3 : 0.9);
    const f = Math.max(W, H) * 0.42;
    const wcx = cx;
    const wcy = cy;
    x.globalCompositeOperation = 'lighter';
    x.lineCap = 'round';
    for (let i = 0; i < NS; i++) {
      const z0 = S.z[i];
      let z1 = z0 - speed * dt;
      if (z1 <= 0.03) {
        respawn(i, 1);
        continue;
      }
      S.z[i] = z1;
      const px = wcx + (S.x[i] / z1) * f;
      const py = wcy + (S.y[i] / z1) * f;
      if (px < -50 || px > W + 50 || py < -50 || py > H + 50) {
        respawn(i, 0.9 + Math.random() * 0.1);
        continue;
      }
      const b = clamp01((1 - z1) * 1.3) * starA;
      if (b <= 0.02) continue;
      const tailZ = Math.min(1.2, z1 + speed * 0.05 + 0.002);
      const qx = wcx + (S.x[i] / tailZ) * f;
      const qy = wcy + (S.y[i] / tailZ) * f;
      const len = Math.hypot(px - qx, py - qy);
      x.globalAlpha = b;
      x.strokeStyle = STAR_COL[S.c[i]];
      if (len > 2) {
        x.lineWidth = 0.6 + (1 - z1) * 1.6;
        x.beginPath();
        x.moveTo(qx, qy);
        x.lineTo(px, py);
        x.stroke();
      } else {
        const r = 0.5 + (1 - z1) * 1.4;
        x.fillStyle = STAR_COL[S.c[i]];
        x.fillRect(px - r / 2, py - r / 2, r, r);
      }
    }
    x.globalAlpha = 1;
    // clarão central da dobra
    if (warpK > 0.01) {
      const R = Math.max(W, H) * (0.35 + warpK * 0.4);
      x.globalAlpha = warpK * 0.5;
      x.drawImage(gBig, wcx - R, wcy - R, R * 2, R * 2);
      x.globalAlpha = 1;
    }

    /* logo */
    const lx = LX();
    const ly = LY();
    const logoIn = smooth(t, T.reveal0, T.reveal1);
    const logoOut = smooth(t, T.logoOut0, T.logoOut1);
    const logoA = logoIn * (1 - logoOut);
    const push = 1 + 0.035 * span(t, T.reveal0, T.logoOut0); // "push-in" de câmera
    const logoScale = (0.94 + 0.06 * easeOut3(span(t, T.reveal0, T.reveal1))) * push * (1 + 0.45 * logoOut * logoOut);
    const mcx = lx + logo.mx;
    const mcy = ly + logo.my;

    // partículas convergindo
    if (NP && t < T.reveal1 + 0.35) {
      const fadeP = 1 - smooth(t, T.reveal0 + 0.1, T.reveal1 + 0.3);
      for (let i = 0; i < NP; i++) {
        const u = span(t, T.conv0 + P.del[i], T.conv0 + P.del[i] + P.dur[i]);
        if (u <= 0) continue;
        const e = easeInOut3(u);
        const k = 1 - e;
        const ang = P.sw[i] * k * k;
        const c = Math.cos(ang);
        const s = Math.sin(ang);
        const ox = P.ox[i] * k;
        const oy = P.oy[i] * k;
        const px = lx + P.tx[i] + ox * c - oy * s;
        const py = ly + P.ty[i] + ox * s + oy * c;
        const a = Math.min(1, u * 3 + 0.15) * fadeP;
        if (a <= 0.01) continue;
        const sz = P.sz[i] * (0.55 + k * 1.4);
        x.globalAlpha = a;
        x.drawImage(sprites[P.col[i]], px - sz / 2, py - sz / 2, sz, sz);
      }
      x.globalAlpha = 1;
    }

    // clarão + onda de choque quando a marca "acende"
    const fl = t - T.flash;
    if (fl > -0.05 && fl < 0.9 && logoA > 0) {
      const k = clamp01(fl / 0.9);
      const R = logo.m * (2.4 + 2.2 * easeOut3(k));
      x.globalAlpha = (1 - k) * (short ? 0.55 : 0.85);
      x.drawImage(gBig, mcx - R, mcy - R, R * 2, R * 2);
      const rr = logo.m * (1 + easeOut3(k) * 5);
      x.globalAlpha = (1 - k) * 0.6;
      x.strokeStyle = '#d9c4ff';
      x.lineWidth = 2.5 * (1 - k) + 0.5;
      x.beginPath();
      x.ellipse(mcx, mcy, rr, rr * 0.92, 0, 0, TAU);
      x.stroke();
      x.globalAlpha = 1;
    }
    x.globalCompositeOperation = 'source-over';

    if (logoA > 0.002) {
      x.save();
      x.translate(mcx, mcy);
      x.scale(logoScale, logoScale);
      x.translate(-logo.mx, -logo.my);
      x.globalAlpha = logoA;
      x.drawImage(logo.c, 0, 0, logo.w, logo.h);

      // brilho que varre a logo
      const sk = span(t, T.shine0, T.shine1);
      if (sk > 0 && sk < 1) {
        sx.globalCompositeOperation = 'source-over';
        sx.clearRect(0, 0, shine.width, shine.height);
        sx.drawImage(logo.c, 0, 0);
        sx.globalCompositeOperation = 'source-atop';
        const bw = shine.width;
        const p = -0.35 * bw + easeInOut3(sk) * 1.7 * bw;
        const g = sx.createLinearGradient(p - bw * 0.22, 0, p + bw * 0.22, shine.height * 0.35);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.5, 'rgba(255,255,255,0.95)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        sx.fillStyle = g;
        sx.fillRect(0, 0, bw, shine.height);
        x.globalCompositeOperation = 'lighter';
        x.globalAlpha = logoA * 0.85;
        x.drawImage(shine, 0, 0, logo.w, logo.h);
        x.globalCompositeOperation = 'source-over';
      }

      // estrelinha em órbita no anel
      const oa = t * 2.1 + 0.6;
      const ex = Math.cos(oa) * RING_RX * logo.m;
      const ey = Math.sin(oa) * RING_RY * logo.m;
      const ct = Math.cos(RING_TILT);
      const st = Math.sin(RING_TILT);
      const ox = logo.mx + ex * ct - ey * st;
      const oy = logo.my + ex * st + ey * ct;
      const front = Math.sin(oa) > 0;
      const ss = logo.m * (front ? 0.5 : 0.32);
      x.globalCompositeOperation = 'lighter';
      x.globalAlpha = logoA * (front ? 1 : 0.4) * smooth(t, T.reveal1 - 0.1, T.reveal1 + 0.3);
      x.drawImage(gY, ox - ss, oy - ss, ss * 2, ss * 2);
      x.drawImage(gW, ox - ss * 0.35, oy - ss * 0.35, ss * 0.7, ss * 0.7);
      x.globalCompositeOperation = 'source-over';
      x.restore();
      x.globalAlpha = 1;
    }

    // "apresenta"
    if (T.sub0 >= 0) {
      const sa = smooth(t, T.sub0, T.sub0 + 0.5) * (1 - smooth(t, T.logoOut0 - 0.1, T.logoOut0 + 0.15));
      if (sa > 0.01) {
        const rise = (1 - easeOut3(span(t, T.sub0, T.sub0 + 0.6))) * 8;
        x.globalAlpha = sa;
        x.drawImage(subC, W / 2 - subW / 2, ly + logo.h + 6 + rise, subW, subH);
        // filetes laterais
        const lw = Math.min(W * 0.12, 46) * easeOut3(span(t, T.sub0 + 0.1, T.sub0 + 0.7));
        const yy = ly + logo.h + 6 + subH / 2 + rise;
        x.fillStyle = 'rgba(214,196,255,0.5)';
        x.fillRect(W / 2 - subW / 2 - lw - 4, yy - 0.5, lw, 1);
        x.fillRect(W / 2 + subW / 2 + 4, yy - 0.5, lw, 1);
        x.globalAlpha = 1;
      }
    }

    /* título BLOOP ORBIT */
    if (t >= T.title0 - 0.01) {
      if (tTop < 0) tTop = titleTop();
      const lineH = tfs * 0.88;
      const words: [HTMLCanvasElement, number, number][] = [bloopW, orbitW];
      words.forEach(([c, w, h], i) => {
        const k = span(t, T.title0 + i * 0.09, T.title0 + i * 0.09 + (short ? 0.32 : 0.5));
        if (k <= 0) return;
        const s = 0.55 + 0.45 * easeOutBack(k);
        const bob = Math.sin((t - T.title0) * 2.1 + i * Math.PI) * 3 * smooth(t, T.title0 + 0.4, T.title0 + 1);
        const wy = tTop + i * lineH + lineH / 2 + bob;
        x.save();
        x.translate(W / 2, wy);
        x.scale(s, s);
        x.globalAlpha = Math.min(1, k * 2.5);
        x.drawImage(c, -w / 2, -h / 2 + tfs * 0.06, w, h);
        x.restore();
      });
      x.globalAlpha = 1;
    }

    /* Bloop voando com rastro */
    const fk = span(t, T.fly0, T.fly1);
    if (fk > 0) {
      if (tTop < 0) tTop = titleTop();
      const endX = W * 0.5;
      const endY = Math.min(H * 0.62, tTop + tfs * 1.76 + H * 0.13);
      const p0x = -W * 0.2;
      const p0y = H * 0.95;
      const c1x = W * 0.15;
      const c1y = H * 0.12;
      const c2x = W * 1.15;
      const c2y = H * 0.28;
      const bez = (k: number): [number, number] => {
        const m = 1 - k;
        return [
          m * m * m * p0x + 3 * m * m * k * c1x + 3 * m * k * k * c2x + k * k * k * endX,
          m * m * m * p0y + 3 * m * m * k * c1y + 3 * m * k * k * c2y + k * k * k * endY,
        ];
      };
      const e = 1 - Math.pow(1 - fk, 2.2);
      const [hx, hy0] = bez(e);
      const [nx, ny] = bez(Math.min(1, e + 0.02));
      const landed = smooth(t, T.fly1 - 0.1, T.fly1 + 0.3);
      const hy = hy0 + Math.sin((t - T.fly1) * 3) * 4 * landed;
      const dir = Math.atan2(ny - hy0, nx - hx) + Math.PI / 2;
      const rot = dir * (1 - landed) + Math.sin(t * 2) * 0.08 * landed;
      const R = Math.min(W * 0.075, 34);

      // rastro
      if (fk < 1) {
        trail.push(hx, hy);
        if (Math.random() < 0.9)
          sparks.push({ x: hx + (Math.random() - 0.5) * R, y: hy + (Math.random() - 0.5) * R, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40, life: 1, s: 4 + Math.random() * 6, c: Math.random() < 0.5 ? 0 : 1 });
      } else if (trail.length) trail.splice(0, Math.min(trail.length, 6));
      if (trail.length > 64) trail.splice(0, trail.length - 64);
      x.globalCompositeOperation = 'lighter';
      const n = trail.length / 2;
      for (let i = 0; i < n; i++) {
        const k = (i + 1) / n;
        const s = R * (0.3 + 1.5 * k);
        x.globalAlpha = k * 0.55;
        x.drawImage(i % 2 ? gP : gY, trail[i * 2] - s, trail[i * 2 + 1] - s, s * 2, s * 2);
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.life -= dt * 1.6;
        if (p.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        x.globalAlpha = p.life;
        const s = p.s * p.life;
        x.drawImage(p.c ? gW : gY, p.x - s, p.y - s, s * 2, s * 2);
      }
      x.globalAlpha = 0.6;
      x.drawImage(glow(skin.light, 64), hx - R * 2.7, hy - R * 2.7, R * 5.4, R * 5.4);
      x.globalAlpha = 1;
      x.globalCompositeOperation = 'source-over';

      const sq = 1 + Math.sin(span(t, T.fly1 - 0.05, T.fly1 + 0.35) * Math.PI) * 0.12;
      x.save();
      x.translate(hx, hy);
      x.rotate(rot);
      drawPlayer(x, skin, R, {
        t,
        blink: t > T.fly1 + 0.45 && t < T.fly1 + 0.55 ? 1 : 0,
        lookX: landed * 0.15,
        lookY: -0.3 - 0.3 * (1 - landed),
        sx: 1 / sq,
        sy: sq,
        mood: landed > 0.5 ? 'happy' : 'fly',
        lx: -0.6,
        ly: -0.8,
      });
      x.restore();
    }
  };

  raf = requestAnimationFrame(frame);
}
