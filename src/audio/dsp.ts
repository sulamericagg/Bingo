/* ============================================================
 *  BLOOP AUDIO — kit de síntese para receitas de som.
 *  Tudo funciona em qualquer BaseAudioContext (tempo real OU OfflineAudioContext),
 *  então a MESMA receita toca ao vivo e é pré-renderizada em buffer (cache).
 *  Envelopes sempre suaves (ataque ≥ 2 ms, cauda exponencial) e filtros
 *  passa-baixa por padrão: nada de agudos ásperos para ouvidos de criança.
 * ============================================================ */

export type Ctx = BaseAudioContext;

/** "voz" de uma receita: contexto, saída, instante inicial e sorteio determinístico */
export interface V {
  c: Ctx;
  out: AudioNode;
  t: number;
  /** 0..1 (semente fixa por variante → variações estáveis no cache) */
  r: () => number;
  /** parâmetro livre (ex.: intensidade, material) */
  p: number;
}

export function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
export const db = (d: number) => Math.pow(10, d / 20);

/* ----------------------------- ruído em cache ----------------------------- */
export type NoiseKind = 'white' | 'pink' | 'brown';
const NOISE = new WeakMap<Ctx, Partial<Record<NoiseKind, AudioBuffer>>>();
export function noiseBuf(c: Ctx, kind: NoiseKind = 'white'): AudioBuffer {
  let m = NOISE.get(c);
  if (!m) NOISE.set(c, (m = {}));
  const have = m[kind];
  if (have) return have;
  const len = Math.floor(c.sampleRate * 2);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    last = 0;
  const r = rng(kind === 'white' ? 11 : kind === 'pink' ? 23 : 37);
  for (let i = 0; i < len; i++) {
    const w = r() * 2 - 1;
    if (kind === 'white') d[i] = w;
    else if (kind === 'pink') {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22;
    } else {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
  }
  m[kind] = buf;
  return buf;
}

/* ----------------------------- envelopes ----------------------------- */
/** ataque linear curto + queda exponencial até ~0 em `dur` */
export function perc(p: AudioParam, t: number, peak: number, a: number, dur: number): void {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + Math.max(0.002, a));
  p.setTargetAtTime(0, t + Math.max(0.002, a), Math.max(0.005, (dur - a) / 4.5));
}
/** ataque, sustentação e soltura (para notas longas/pads) */
export function adsr(p: AudioParam, t: number, peak: number, a: number, d: number, s: number, hold: number, rel: number): void {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + Math.max(0.003, a));
  p.setTargetAtTime(peak * s, t + a, Math.max(0.005, d / 3));
  const end = t + Math.max(a + 0.01, hold);
  p.setTargetAtTime(0, end, Math.max(0.01, rel / 4));
}

/* ----------------------------- blocos ----------------------------- */
export interface ToneO {
  f: number;
  /** frequência final (glide exponencial) */
  f2?: number;
  /** tempo do glide (padrão = dur) */
  glide?: number;
  dur: number;
  vol: number;
  type?: OscillatorType | 'pulse25';
  a?: number;
  delay?: number;
  detune?: number;
  /** passa-baixa (Hz) — padrão: 7000 (tira o chiado de ondas ricas) */
  lp?: number;
  q?: number;
  /** vibrato (Hz, cents) */
  vib?: [number, number];
  /** saída alternativa */
  to?: AudioNode;
}

const PULSE = new WeakMap<Ctx, PeriodicWave>();
function pulse25(c: Ctx): PeriodicWave {
  let w = PULSE.get(c);
  if (w) return w;
  const n = 32;
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  for (let k = 1; k < n; k++) im[k] = ((2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.25)) * Math.pow(0.92, k);
  w = c.createPeriodicWave(re, im);
  PULSE.set(c, w);
  return w;
}

export function tone(v: V, o: ToneO): void {
  const { c } = v;
  const t = v.t + (o.delay ?? 0);
  const os = c.createOscillator();
  if (o.type === 'pulse25') os.setPeriodicWave(pulse25(c));
  else os.type = o.type ?? 'sine';
  os.frequency.setValueAtTime(o.f, t);
  if (o.f2) os.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + (o.glide ?? o.dur));
  if (o.detune) os.detune.value = o.detune;
  const g = c.createGain();
  perc(g.gain, t, o.vol, o.a ?? 0.004, o.dur);
  let head: AudioNode = os;
  const rich = o.type && o.type !== 'sine';
  if (o.lp || rich) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.lp ?? 7000;
    f.Q.value = o.q ?? 0.5;
    head.connect(f);
    head = f;
  }
  if (o.vib) {
    const l = c.createOscillator();
    const lg = c.createGain();
    l.frequency.value = o.vib[0];
    lg.gain.value = o.vib[1];
    l.connect(lg).connect(os.detune);
    l.start(t);
    l.stop(t + o.dur + 0.05);
  }
  head.connect(g).connect(o.to ?? v.out);
  os.start(t);
  os.stop(t + o.dur + 0.05);
}

export interface NoiseO {
  dur: number;
  vol: number;
  kind?: NoiseKind;
  /** filtro: tipo e frequência (com glide até f2) */
  ft?: BiquadFilterType;
  f?: number;
  f2?: number;
  q?: number;
  a?: number;
  delay?: number;
  /** "sustenta" o volume antes de cair (0..1 da duração) */
  hold?: number;
  to?: AudioNode;
}
export function noise(v: V, o: NoiseO): void {
  const { c } = v;
  const t = v.t + (o.delay ?? 0);
  const s = c.createBufferSource();
  s.buffer = noiseBuf(c, o.kind ?? 'white');
  const f = c.createBiquadFilter();
  f.type = o.ft ?? 'bandpass';
  f.frequency.setValueAtTime(o.f ?? 1000, t);
  if (o.f2) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.f2), t + o.dur);
  f.Q.value = o.q ?? 0.8;
  const g = c.createGain();
  const a = o.a ?? 0.003;
  if (o.hold) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.vol, t + a);
    g.gain.setValueAtTime(o.vol, t + o.dur * o.hold);
    g.gain.setTargetAtTime(0, t + o.dur * o.hold, (o.dur * (1 - o.hold)) / 4);
  } else perc(g.gain, t, o.vol, a, o.dur);
  s.connect(f).connect(g).connect(o.to ?? v.out);
  s.start(t, v.r() * 1.5);
  s.stop(t + o.dur + 0.05);
}

/** sino FM (portadora + moduladora com índice que decai) — "ding", vidro, sininhos */
export function bell(v: V, o: { f: number; dur: number; vol: number; ratio?: number; index?: number; delay?: number; to?: AudioNode }): void {
  const { c } = v;
  const t = v.t + (o.delay ?? 0);
  const car = c.createOscillator();
  const mod = c.createOscillator();
  const mg = c.createGain();
  car.frequency.value = o.f;
  mod.frequency.value = o.f * (o.ratio ?? 3.5);
  const idx = (o.index ?? 2) * o.f;
  mg.gain.setValueAtTime(idx, t);
  mg.gain.setTargetAtTime(idx * 0.05, t, o.dur / 6);
  mod.connect(mg).connect(car.frequency);
  const g = c.createGain();
  perc(g.gain, t, o.vol, 0.003, o.dur);
  car.connect(g).connect(o.to ?? v.out);
  car.start(t);
  mod.start(t);
  car.stop(t + o.dur + 0.05);
  mod.stop(t + o.dur + 0.05);
}

/** ressonador (batida em madeira/metal): ruído curtíssimo excitando passa-faixas afinados */
export function knock(v: V, o: { fs: number[]; dur: number; vol: number; q?: number; delay?: number; to?: AudioNode; kind?: NoiseKind }): void {
  const { c } = v;
  const t = v.t + (o.delay ?? 0);
  const s = c.createBufferSource();
  s.buffer = noiseBuf(c, o.kind ?? 'white');
  const eg = c.createGain();
  perc(eg.gain, t, 1, 0.001, 0.018);
  s.connect(eg);
  const g = c.createGain();
  perc(g.gain, t, o.vol, 0.002, o.dur);
  for (const f of o.fs) {
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f;
    bp.Q.value = o.q ?? 18;
    eg.connect(bp).connect(g);
  }
  g.connect(o.to ?? v.out);
  s.start(t, v.r());
  s.stop(t + o.dur + 0.05);
}

/** grãos curtos aleatórios (areia, cascalho, terra esfarelando, crepitar) */
export function grains(v: V, o: { n: number; span: number; dur: number; vol: number; f: [number, number]; q?: number; delay?: number; kind?: NoiseKind; to?: AudioNode; decay?: number }): void {
  for (let i = 0; i < o.n; i++) {
    const k = i / Math.max(1, o.n - 1);
    const at = (o.delay ?? 0) + Math.pow(v.r(), 1.3) * o.span;
    const f = o.f[0] + (o.f[1] - o.f[0]) * v.r();
    const vol = o.vol * (0.4 + v.r() * 0.6) * (o.decay ? Math.pow(1 - k * 0.7, o.decay) : 1);
    noise(v, { dur: o.dur * (0.6 + v.r() * 0.8), vol, f, q: o.q ?? 3, delay: at, kind: o.kind, to: o.to });
  }
}

/** acorde/arpejo de tons (fanfarras curtas) */
export function arp(v: V, notes: number[], o: { step: number; dur: number; vol: number; type?: OscillatorType; lp?: number; delay?: number; fm?: boolean }): void {
  notes.forEach((m, i) => {
    const f = mtof(m);
    if (o.fm) bell(v, { f, dur: o.dur, vol: o.vol, ratio: 2, index: 0.8, delay: (o.delay ?? 0) + i * o.step });
    else tone(v, { f, dur: o.dur, vol: o.vol, type: o.type ?? 'triangle', lp: o.lp ?? 4000, delay: (o.delay ?? 0) + i * o.step });
  });
}

/** sopro (whoosh): ruído rosa com passa-faixa que varre */
export function whoosh(v: V, o: { dur: number; vol: number; f: number; f2: number; q?: number; delay?: number }): void {
  noise(v, { kind: 'pink', dur: o.dur, vol: o.vol, f: o.f, f2: o.f2, q: o.q ?? 1.2, a: o.dur * 0.4, delay: o.delay });
}

/** baque grave (impacto suave, sem estouro) */
export function thump(v: V, o: { f: number; dur: number; vol: number; delay?: number; drop?: number }): void {
  tone(v, { f: o.f, f2: o.f * (o.drop ?? 0.45), dur: o.dur, vol: o.vol, delay: o.delay, a: 0.003 });
  noise(v, { kind: 'brown', dur: o.dur * 0.7, vol: o.vol * 0.6, ft: 'lowpass', f: o.f * 3, delay: o.delay });
}

/** "pop" de bolha: senoide com subida rápida */
export function pop(v: V, o: { f: number; vol: number; dur?: number; up?: number; delay?: number }): void {
  tone(v, { f: o.f, f2: o.f * (o.up ?? 2.2), glide: (o.dur ?? 0.07) * 0.7, dur: o.dur ?? 0.07, vol: o.vol, delay: o.delay, a: 0.002 });
}
