/* ============================================================
 *  BLOOP BANDA — sintetizador sem samples (WebAudio puro).
 *  Bateria, baixo, guitarra distorcida/limpa, teclados (FM/pad/órgão/
 *  sanfona/metais/chip), voz "ooh/aah" por formantes e percussão BR.
 *  Pensado para celular fraco: poucos osciladores por voz, curvas,
 *  ondas periódicas e buffers de ruído compartilhados, polifonia
 *  limitada por barramento com roubo de voz (a mais antiga).
 * ============================================================ */
import type { Instrument } from '../api';

export type DrumPiece =
  | 'k' | 's' | 'g' | 'cl' | 'rim' | 'h' | 'ho' | 'c' | 'r' | 't1' | 't2' | 't3' | 'st'
  | 'su' | 'tb' | 'ag1' | 'ag2' | 'sh' | 'cb' | 'tri' | 'trio';

/** evento de bateria/percussão (b em batidas) */
export interface DEv {
  b: number;
  p: DrumPiece;
  v: number;
}
/** evento com altura: m = notas MIDI (acorde se >1); d = duração em batidas */
export interface PEv {
  b: number;
  d: number;
  m: number[];
  v: number;
  /** bend/glide: semitons a subir durante a nota (solo) */
  g?: number;
  /** palm-mute (guitarra) */
  pm?: boolean;
  /** 1 = abafado/"tchk" (funk), 2 = nota de solo (lead) */
  x?: number;
  /** vogal (voz): 0 a, 1 o, 2 u, 3 e */
  vow?: number;
}

export interface Timbre {
  kit: 'rock' | '808' | 'chip' | 'acoustic' | 'orch' | 'lofi';
  bass: 'finger' | 'pick' | 'synth' | 'sub' | 'chip' | 'upright';
  guitar: 'dist' | 'clean' | 'synth' | 'nylon' | 'strings' | 'chip';
  keys: 'epiano' | 'pad' | 'organ' | 'brass' | 'accordion' | 'chip' | 'strings';
  vocals: 'vocal' | 'synth' | 'chip' | 'choir';
  /** 0..1 quanto de ganho na distorção */
  drive?: number;
  /** 0..1 envio de reverb geral */
  room?: number;
}

export type Bus = Instrument | 'perc';
const CAPS: Record<Bus, number> = { drums: 14, perc: 8, bass: 2, guitar: 5, keys: 6, vocals: 3 };
const LVL: Record<Bus, number> = { drums: 0.9, perc: 0.5, bass: 0.8, guitar: 0.55, keys: 0.42, vocals: 0.5 };

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface Voice {
  end: number;
  g: GainNode;
}

/* ---------- recursos compartilhados por AudioContext ---------- */
interface Shared {
  noise: AudioBuffer;
  dist: Float32Array<ArrayBuffer>;
  soft: Float32Array<ArrayBuffer>;
  ir: AudioBuffer;
  waves: Map<string, PeriodicWave>;
}
const SHARED = new WeakMap<BaseAudioContext, Shared>();

function shared(ctx: BaseAudioContext): Shared {
  let s = SHARED.get(ctx);
  if (s) return s;
  const sr = ctx.sampleRate;
  const noise = ctx.createBuffer(1, sr, sr);
  const nd = noise.getChannelData(0);
  let seed = 22222;
  for (let i = 0; i < nd.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    nd[i] = (seed / 4294967296) * 2 - 1;
  }
  const N = 2048;
  const dist = new Float32Array(N);
  const soft = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = (i / (N - 1)) * 2 - 1;
    // assimétrica: um pouco de harmônicos pares (válvula)
    dist[i] = Math.tanh(x * 3.2 + 0.12) - Math.tanh(0.12);
    soft[i] = Math.tanh(x * 1.4) / Math.tanh(1.4);
  }
  // resposta ao impulso curta (sala) — mono, 1.1 s
  const len = Math.floor(sr * 1.1);
  const ir = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const e = Math.pow(1 - i / len, 3.2);
      d[i] = ((seed / 4294967296) * 2 - 1) * e * (i < sr * 0.012 ? i / (sr * 0.012) : 1);
    }
  }
  s = { noise, dist, soft, ir, waves: new Map() };
  SHARED.set(ctx, s);
  return s;
}

function wave(ctx: BaseAudioContext, id: string, harm: number[]): PeriodicWave {
  const sh = shared(ctx);
  let w = sh.waves.get(id);
  if (!w) {
    const re = new Float32Array(harm.length + 1);
    const im = new Float32Array(harm.length + 1);
    harm.forEach((a, i) => (im[i + 1] = a));
    w = ctx.createPeriodicWave(re, im);
    sh.waves.set(id, w);
  }
  return w;
}
const pulse = (duty: number, n = 24) => Array.from({ length: n }, (_, i) => ((2 / ((i + 1) * Math.PI)) * Math.sin((i + 1) * Math.PI * duty)));
const ORGAN = [1, 0.8, 0.55, 0.35, 0, 0.25, 0, 0.18];
const ACCORDION = [1, 0.15, 0.5, 0.1, 0.35, 0.08, 0.2, 0.05, 0.12, 0.04, 0.07];
const GLOTTAL = Array.from({ length: 40 }, (_, i) => 1 / Math.pow(i + 1, 1.15));

/* ============================================================ */
export class Synth {
  readonly ctx: BaseAudioContext;
  private sh: Shared;
  private master: GainNode;
  private room: GainNode;
  private bus = {} as Record<Bus, GainNode>;
  private track = {} as Record<Bus, GainNode>;
  private gtrIn: GainNode;
  private voices = {} as Record<Bus, Voice[]>;
  readonly tb: Timbre;

  constructor(ctx: BaseAudioContext, out: AudioNode, tb: Timbre) {
    this.ctx = ctx;
    this.tb = tb;
    this.sh = shared(ctx);
    // master: soma → compressor "cola" → limitador → saída
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -16;
    glue.knee.value = 10;
    glue.ratio.value = 3.5;
    glue.attack.value = 0.006;
    glue.release.value = 0.18;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -4;
    lim.knee.value = 0;
    lim.ratio.value = 20;
    lim.attack.value = 0.001;
    lim.release.value = 0.08;
    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    const sum = ctx.createGain();
    sum.connect(glue);
    glue.connect(lim);
    lim.connect(this.master);
    this.master.connect(out);
    // reverb (envio)
    const conv = ctx.createConvolver();
    conv.buffer = this.sh.ir;
    const rlp = ctx.createBiquadFilter();
    rlp.type = 'lowpass';
    rlp.frequency.value = 5200;
    this.room = ctx.createGain();
    this.room.gain.value = 0.22 * (tb.room ?? 0.6);
    this.room.connect(conv);
    conv.connect(rlp);
    rlp.connect(sum);

    const busses: Bus[] = ['drums', 'perc', 'bass', 'guitar', 'keys', 'vocals'];
    for (const b of busses) {
      const tg = ctx.createGain();
      tg.gain.value = 1;
      tg.connect(sum);
      const g = ctx.createGain();
      g.gain.value = LVL[b];
      g.connect(tg);
      this.bus[b] = g;
      this.track[b] = tg;
      this.voices[b] = [];
      if (b !== 'bass' && b !== 'drums') {
        const send = ctx.createGain();
        send.gain.value = b === 'perc' ? 0.3 : b === 'vocals' ? 0.9 : 0.55;
        g.connect(send);
        send.connect(this.room);
      }
    }
    // caixa da bateria vai um pouco pro reverb
    const ds = ctx.createGain();
    ds.gain.value = 0.18;
    this.bus.drums.connect(ds);
    ds.connect(this.room);

    // guitarra: distorção + "caixa" (gabinete) compartilhadas
    this.gtrIn = ctx.createGain();
    if (tb.guitar === 'dist') {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 110;
      const pre = ctx.createGain();
      pre.gain.value = 3 + 6 * (tb.drive ?? 0.6);
      const ws = ctx.createWaveShaper();
      ws.curve = this.sh.dist;
      ws.oversample = '2x';
      const mid = ctx.createBiquadFilter();
      mid.type = 'peaking';
      mid.frequency.value = 900;
      mid.Q.value = 0.8;
      mid.gain.value = 4;
      const fizz = ctx.createBiquadFilter();
      fizz.type = 'peaking';
      fizz.frequency.value = 3000;
      fizz.Q.value = 1.2;
      fizz.gain.value = -5;
      const cab = ctx.createBiquadFilter();
      cab.type = 'lowpass';
      cab.frequency.value = 4600;
      cab.Q.value = 0.9;
      const cab2 = ctx.createBiquadFilter();
      cab2.type = 'lowpass';
      cab2.frequency.value = 6500;
      const post = ctx.createGain();
      post.gain.value = 0.32;
      this.gtrIn.connect(hp);
      hp.connect(pre);
      pre.connect(ws);
      ws.connect(mid);
      mid.connect(fizz);
      fizz.connect(cab);
      cab.connect(cab2);
      cab2.connect(post);
      post.connect(this.bus.guitar);
    } else this.gtrIn.connect(this.bus.guitar);
  }

  setTrackGain(b: Bus, g: number, at = this.ctx.currentTime): void {
    const p = this.track[b].gain;
    p.cancelScheduledValues(at);
    p.setTargetAtTime(Math.max(0, g), at, 0.03);
  }

  fadeOut(at: number, dur = 0.25): void {
    const p = this.master.gain;
    p.cancelScheduledValues(at);
    p.setValueAtTime(p.value, at);
    p.linearRampToValueAtTime(0, at + dur);
  }

  disconnect(): void {
    this.master.disconnect();
  }

  /* ---------------- gerência de vozes ---------------- */
  private voice(b: Bus, t: number, end: number, dest: AudioNode = this.bus[b]): GainNode {
    const list = this.voices[b];
    for (let i = list.length - 1; i >= 0; i--) if (list[i].end < t) list.splice(i, 1);
    if (list.length >= CAPS[b]) {
      const old = list.shift()!;
      old.g.gain.cancelScheduledValues(t);
      old.g.gain.setTargetAtTime(0, t, 0.008);
    }
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.connect(dest);
    list.push({ end, g });
    return g;
  }
  private osc(type: OscillatorType | PeriodicWave, f: number, t: number, end: number, dest: AudioNode, detune = 0): OscillatorNode {
    const o = this.ctx.createOscillator();
    if (typeof type === 'string') o.type = type as OscillatorType;
    else o.setPeriodicWave(type);
    o.frequency.setValueAtTime(f, t);
    if (detune) o.detune.value = detune;
    o.connect(dest);
    o.start(t);
    o.stop(end);
    return o;
  }
  private noise(t: number, dur: number, dest: AudioNode, off = 0): AudioBufferSourceNode {
    const n = this.ctx.createBufferSource();
    n.buffer = this.sh.noise;
    n.connect(dest);
    n.start(t, off % 0.9);
    n.stop(t + dur);
    return n;
  }
  private filt(type: BiquadFilterType, f: number, q = 0.7, dest?: AudioNode): BiquadFilterNode {
    const b = this.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    if (dest) b.connect(dest);
    return b;
  }
  private env(g: GainNode, t: number, peak: number, att: number, dec: number): void {
    const p = g.gain;
    p.setValueAtTime(0.0001, t);
    p.linearRampToValueAtTime(peak, t + att);
    p.exponentialRampToValueAtTime(0.0001, t + att + dec);
  }

  /* ============================ BATERIA ============================ */
  drum(p: DrumPiece, t: number, v: number): void {
    const kit = this.tb.kit;
    const perc = p === 'su' || p === 'tb' || p === 'ag1' || p === 'ag2' || p === 'sh' || p === 'cb' || p === 'tri' || p === 'trio';
    const b: Bus = perc ? 'perc' : 'drums';
    const chip = kit === 'chip';
    switch (p) {
      case 'k': {
        const long = kit === '808' ? 0.75 : kit === 'orch' ? 0.9 : 0.32;
        const g = this.voice(b, t, t + long + 0.05);
        if (chip) {
          this.osc('square', 140, t, t + 0.12, g).frequency.exponentialRampToValueAtTime(40, t + 0.1);
          this.env(g, t, v * 0.5, 0.001, 0.11);
          break;
        }
        const o = this.osc('sine', kit === '808' ? 120 : kit === 'orch' ? 90 : 165, t, t + long + 0.05, g);
        o.frequency.exponentialRampToValueAtTime(kit === '808' ? 44 : kit === 'orch' ? 52 : 50, t + (kit === '808' ? 0.09 : 0.06));
        this.env(g, t, v * 1.05, 0.002, long);
        if (kit !== 'orch') {
          const cg = this.voice(b, t, t + 0.03);
          const hp = this.filt('highpass', 2500, 0.7, cg);
          this.noise(t, 0.02, hp);
          this.env(cg, t, v * (kit === 'lofi' ? 0.08 : 0.25), 0.0008, 0.012);
        } else {
          // tímpano: corpo extra
          const g2 = this.voice(b, t, t + 1.2);
          this.osc('triangle', 98, t, t + 1.2, g2);
          this.env(g2, t, v * 0.3, 0.005, 1.1);
        }
        break;
      }
      case 's':
      case 'g':
      case 'cl': {
        const ghost = p === 'g';
        const vv = ghost ? v * 0.3 : v;
        if (p === 'cl' || (kit === '808' && !ghost)) {
          // palmas: 3 rajadas + cauda
          const g = this.voice(b, t, t + 0.3);
          const bp = this.filt('bandpass', 1300, 1.1, g);
          this.noise(t, 0.28, bp, t * 7);
          const pg = g.gain;
          pg.setValueAtTime(0.0001, t);
          for (let i = 0; i < 3; i++) {
            pg.linearRampToValueAtTime(vv * 0.9, t + i * 0.011 + 0.001);
            pg.exponentialRampToValueAtTime(vv * 0.15, t + i * 0.011 + 0.009);
          }
          pg.linearRampToValueAtTime(vv * 0.55, t + 0.036);
          pg.exponentialRampToValueAtTime(0.0001, t + 0.26);
          break;
        }
        const dec = chip ? 0.09 : kit === 'lofi' ? 0.12 : kit === 'orch' ? 0.35 : 0.19;
        const g = this.voice(b, t, t + dec + 0.05);
        const hp = this.filt(chip ? 'highpass' : 'highpass', chip ? 900 : 1100, 0.6, g);
        this.noise(t, dec + 0.04, hp, t * 13);
        this.env(g, t, vv * (kit === 'lofi' ? 0.45 : 0.7), 0.001, dec);
        const bg = this.voice(b, t, t + 0.12);
        const o = this.osc(chip ? 'square' : 'triangle', 200, t, t + 0.12, bg);
        o.frequency.exponentialRampToValueAtTime(150, t + 0.06);
        this.env(bg, t, vv * (chip ? 0.25 : 0.6), 0.001, 0.08);
        break;
      }
      case 'rim':
      case 'st': {
        const g = this.voice(b, t, t + 0.06);
        const bp = this.filt('bandpass', p === 'st' ? 2600 : 1700, 3, g);
        this.noise(t, 0.05, bp, t * 3);
        this.osc('sine', p === 'st' ? 1900 : 820, t, t + 0.05, g);
        this.env(g, t, v * 0.45, 0.0005, 0.035);
        break;
      }
      case 'h':
      case 'ho':
      case 'c':
      case 'r': {
        const dec = p === 'h' ? 0.045 : p === 'ho' ? 0.28 : p === 'r' ? 0.55 : 1.6;
        const g = this.voice(b, t, t + dec + 0.05);
        const hp = this.filt('highpass', p === 'c' ? 4200 : p === 'r' ? 5200 : 7200, 0.7, g);
        if (p === 'r') {
          const pg = this.ctx.createGain();
          pg.gain.value = 0.06;
          pg.connect(g);
          this.osc('sine', 3400, t, t + dec, pg);
        }
        this.noise(t, dec + 0.05, hp, t * 17);
        const amp = p === 'h' ? 0.32 : p === 'ho' ? 0.26 : p === 'r' ? 0.18 : 0.42;
        this.env(g, t, v * amp * (chip ? 0.6 : 1), 0.001, dec);
        break;
      }
      case 't1':
      case 't2':
      case 't3': {
        const f = p === 't1' ? 190 : p === 't2' ? 140 : 100;
        const g = this.voice(b, t, t + 0.45);
        const o = this.osc(chip ? 'square' : 'sine', f, t, t + 0.45, g);
        o.frequency.exponentialRampToValueAtTime(f * 0.62, t + 0.3);
        this.env(g, t, v * (chip ? 0.35 : 0.85), 0.002, kit === 'orch' ? 0.6 : 0.38);
        break;
      }
      case 'su': {
        const g = this.voice(b, t, t + 0.6);
        const o = this.osc('sine', 78, t, t + 0.6, g);
        o.frequency.exponentialRampToValueAtTime(56, t + 0.12);
        this.env(g, t, v * 1.1, 0.003, 0.5);
        break;
      }
      case 'tb': {
        const g = this.voice(b, t, t + 0.07);
        this.osc('triangle', 610, t, t + 0.07, g);
        const bp = this.filt('bandpass', 3200, 2, g);
        this.noise(t, 0.04, bp, t * 5);
        this.env(g, t, v * 0.42, 0.0005, 0.05);
        break;
      }
      case 'ag1':
      case 'ag2': {
        const f = p === 'ag1' ? 920 : 690;
        const g = this.voice(b, t, t + 0.2);
        this.osc('sine', f, t, t + 0.2, g);
        const g2 = this.ctx.createGain();
        g2.gain.value = 0.35;
        g2.connect(g);
        this.osc('sine', f * 2.76, t, t + 0.2, g2);
        this.env(g, t, v * 0.3, 0.001, 0.17);
        break;
      }
      case 'cb': {
        const g = this.voice(b, t, t + 0.25);
        const bp = this.filt('bandpass', 820, 2.5, g);
        this.osc('square', 545, t, t + 0.25, bp);
        this.osc('square', 815, t, t + 0.25, bp);
        this.env(g, t, v * 0.35, 0.001, 0.2);
        break;
      }
      case 'sh': {
        const g = this.voice(b, t, t + 0.08);
        const bp = this.filt('bandpass', 6000, 1.2, g);
        this.noise(t, 0.08, bp, t * 11);
        const pg = g.gain;
        pg.setValueAtTime(0.0001, t);
        pg.linearRampToValueAtTime(v * 0.22, t + 0.015);
        pg.exponentialRampToValueAtTime(0.0001, t + 0.07);
        break;
      }
      case 'tri':
      case 'trio': {
        const dec = p === 'trio' ? 0.5 : 0.06;
        const g = this.voice(b, t, t + dec + 0.02);
        this.osc('sine', 4180, t, t + dec + 0.02, g);
        this.osc('sine', 5620, t, t + dec + 0.02, g);
        this.env(g, t, v * 0.08, 0.0005, dec);
        break;
      }
    }
  }

  /* ============================ BAIXO ============================ */
  bass(e: PEv, t: number, spb: number): void {
    const tb = this.tb.bass;
    const dur = Math.max(0.06, e.d * spb * 0.92);
    const end = t + dur + 0.08;
    const g = this.voice('bass', t, end);
    const f = mtof(e.m[0]);
    if (tb === 'chip') {
      const lp = this.filt('lowpass', 2400, 0.5, g);
      this.osc(wave(this.ctx, 'p50', pulse(0.5)), f, t, end, lp);
      this.adsr(g, t, dur, e.v * 0.5, 0.003, 0.03);
      return;
    }
    if (tb === 'sub') {
      const o = this.osc('sine', f * 1.5, t, end, g);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
      const sg = this.ctx.createGain();
      sg.gain.value = 0.25;
      sg.connect(g);
      this.osc('triangle', f * 2, t, end, sg);
      this.adsr(g, t, dur, e.v * 0.95, 0.004, 0.06);
      return;
    }
    // sub + serra filtrada
    this.osc('sine', f, t, end, g);
    const lp = this.filt('lowpass', 500, tb === 'synth' ? 7 : 1.2);
    const sgn = this.ctx.createGain();
    sgn.gain.value = tb === 'synth' ? 0.55 : tb === 'upright' ? 0.25 : 0.45;
    lp.connect(sgn);
    sgn.connect(g);
    this.osc(tb === 'upright' ? 'triangle' : 'sawtooth', f, t, end, lp, tb === 'synth' ? 6 : 0);
    const base = tb === 'pick' ? 900 : tb === 'synth' ? 380 : tb === 'upright' ? 500 : 650;
    lp.frequency.setValueAtTime(base * 3.2, t);
    lp.frequency.exponentialRampToValueAtTime(base, t + (tb === 'pick' ? 0.08 : 0.16));
    this.adsr(g, t, dur, e.v * 0.75, tb === 'upright' ? 0.01 : 0.004, 0.05);
  }

  /** ataque, sustenta (leve queda), solta */
  private adsr(g: GainNode, t: number, dur: number, peak: number, att: number, rel: number, sus = 0.75): void {
    const p = g.gain;
    p.setValueAtTime(0.0001, t);
    p.linearRampToValueAtTime(peak, t + att);
    p.setTargetAtTime(peak * sus, t + att, Math.max(0.05, dur * 0.5));
    p.setTargetAtTime(0.0001, t + dur, rel / 3);
  }

  /* ============================ GUITARRA ============================ */
  guitar(e: PEv, t: number, spb: number): void {
    const tb = this.tb.guitar;
    const dur = Math.max(0.05, e.d * spb * 0.95);
    if (e.x === 1) {
      // "tchk" abafado (funk / skank)
      const g = this.voice('guitar', t, t + 0.06, this.gtrIn);
      const bp = this.filt('bandpass', tb === 'dist' ? 1200 : 2100, 1.5, g);
      this.noise(t, 0.05, bp, t * 19);
      this.env(g, t, e.v * (tb === 'dist' ? 0.4 : 0.35), 0.001, 0.035);
      return;
    }
    if (tb === 'dist') return this.distGtr(e, t, dur);
    const end = t + dur + 0.25;
    const g = this.voice('guitar', t, end, this.gtrIn);
    if (tb === 'synth' || tb === 'chip') {
      const lp = this.filt('lowpass', 900, tb === 'chip' ? 0.5 : 5, g);
      e.m.forEach((m, i) => {
        const o = this.osc(tb === 'chip' ? wave(this.ctx, 'p25', pulse(0.25)) : 'sawtooth', mtof(m), t + i * 0.004, end, lp, tb === 'synth' ? 5 : 0);
        if (e.g) o.frequency.linearRampToValueAtTime(mtof(m + e.g), t + Math.min(0.2, dur * 0.5));
      });
      lp.frequency.setValueAtTime(tb === 'chip' ? 5000 : 4200, t);
      lp.frequency.exponentialRampToValueAtTime(tb === 'chip' ? 3000 : 700, t + 0.18);
      const amp = (e.v * 0.55) / Math.sqrt(e.m.length);
      if (e.x === 2) this.adsr(g, t, dur, amp, 0.004, 0.08, 0.8);
      else this.env(g, t, amp, 0.003, Math.min(0.35, dur + 0.1));
      return;
    }
    if (tb === 'strings') {
      // pizzicato / ostinato de cordas
      const lp = this.filt('lowpass', 2600, 0.8, g);
      e.m.forEach((m) => {
        this.osc('sawtooth', mtof(m), t, end, lp, -6);
        this.osc('sawtooth', mtof(m), t, end, lp, 6);
      });
      const amp = (e.v * 0.3) / Math.sqrt(e.m.length);
      if (e.d >= 1) this.adsr(g, t, dur, amp, 0.05, 0.2);
      else this.env(g, t, amp, 0.004, 0.18);
      return;
    }
    // limpa / nylon: corda dedilhada (serra+triângulo, filtro que fecha)
    const lp = this.filt('lowpass', 3000, 1.1, g);
    const nylon = tb === 'nylon';
    e.m.forEach((m, i) => {
      const st = t + i * 0.009;
      const o = this.osc(nylon ? 'triangle' : 'sawtooth', mtof(m), st, end, lp);
      if (e.g) o.frequency.linearRampToValueAtTime(mtof(m + e.g), st + Math.min(0.2, dur * 0.5));
      if (!nylon) this.osc('triangle', mtof(m + 12), st, end, lp);
    });
    lp.frequency.setValueAtTime(nylon ? 2600 : 4200, t);
    lp.frequency.exponentialRampToValueAtTime(nylon ? 900 : 1300, t + 0.35);
    const amp = (e.v * (nylon ? 0.6 : 0.36)) / Math.sqrt(e.m.length);
    if (e.x === 2) this.adsr(g, t, dur, amp, 0.003, 0.1, 0.6);
    else {
      const p = g.gain;
      p.setValueAtTime(0.0001, t);
      p.linearRampToValueAtTime(amp, t + 0.003);
      p.setTargetAtTime(amp * 0.3, t + 0.004, 0.18);
      p.setTargetAtTime(0.0001, t + dur, 0.04);
    }
  }

  private distGtr(e: PEv, t: number, dur: number): void {
    const pm = !!e.pm;
    const len = pm ? Math.min(dur, 0.14) : dur;
    const end = t + len + 0.12;
    const g = this.voice('guitar', t, end, this.gtrIn);
    let dest: AudioNode = g;
    if (pm) dest = this.filt('lowpass', 520, 1.4, g);
    const lead = e.x === 2;
    const notes = e.m.slice(0, 3);
    notes.forEach((m, i) => {
      const f = mtof(m);
      const dets = i === 0 ? (lead ? [-4, 5] : [-7, 7]) : [i * 3];
      for (const d of dets) {
        const o = this.osc('sawtooth', f, t, end, dest, d);
        if (e.g) {
          const bt = t + Math.min(0.22, len * 0.45);
          o.frequency.setValueAtTime(f, t + 0.03);
          o.frequency.linearRampToValueAtTime(mtof(m + e.g), bt);
        }
        if (lead && len > 0.35) {
          // vibrato no fim das notas longas do solo
          const lfo = this.ctx.createOscillator();
          lfo.frequency.value = 5.8;
          const lg = this.ctx.createGain();
          lg.gain.setValueAtTime(0, t);
          lg.gain.linearRampToValueAtTime(0, t + 0.2);
          lg.gain.linearRampToValueAtTime(28, t + 0.45);
          lfo.connect(lg);
          lg.connect(o.detune);
          lfo.start(t);
          lfo.stop(end);
        }
      }
    });
    const amp = e.v * (lead ? 0.42 : 0.34);
    if (pm) this.env(g, t, amp * 1.15, 0.002, 0.13);
    else this.adsr(g, t, len, amp, 0.003, 0.08, 0.85);
  }

  /* ============================ TECLADOS ============================ */
  keys(e: PEv, t: number, spb: number): void {
    const tb = this.tb.keys;
    const dur = Math.max(0.06, e.d * spb * 0.95);
    const n = e.m.length;
    const amp = e.v / Math.sqrt(n);
    switch (tb) {
      case 'epiano': {
        const end = t + dur + 0.5;
        const g = this.voice('keys', t, end);
        for (const m of e.m) {
          const f = mtof(m);
          const car = this.osc('sine', f, t, end, g);
          const mg = this.ctx.createGain();
          mg.gain.setValueAtTime(f * 2.2, t);
          mg.gain.exponentialRampToValueAtTime(f * 0.25, t + 0.5);
          mg.connect(car.frequency);
          this.osc('sine', f, t, end, mg, 3);
        }
        const p = g.gain;
        p.setValueAtTime(0.0001, t);
        p.linearRampToValueAtTime(amp * 0.38, t + 0.004);
        p.setTargetAtTime(amp * 0.12, t + 0.01, 0.35);
        p.setTargetAtTime(0.0001, t + dur, 0.09);
        break;
      }
      case 'pad':
      case 'strings': {
        const att = tb === 'pad' ? 0.25 : 0.12;
        const end = t + dur + 0.6;
        const g = this.voice('keys', t, end);
        const lp = this.filt('lowpass', tb === 'pad' ? 1800 : 3200, 0.6, g);
        for (const m of e.m) {
          this.osc('sawtooth', mtof(m), t, end, lp, -9);
          this.osc('sawtooth', mtof(m), t, end, lp, 9);
        }
        this.adsr(g, t, dur, amp * 0.16, att, 0.5, 0.9);
        break;
      }
      case 'organ': {
        const end = t + dur + 0.08;
        const g = this.voice('keys', t, end);
        const w = wave(this.ctx, 'organ', ORGAN);
        for (const m of e.m) this.osc(w, mtof(m), t, end, g);
        this.adsr(g, t, dur, amp * 0.22, 0.008, 0.05, 0.95);
        break;
      }
      case 'accordion': {
        const end = t + dur + 0.08;
        const g = this.voice('keys', t, end);
        const bp = this.filt('lowpass', 3200, 0.7, g);
        const w = wave(this.ctx, 'acc', ACCORDION);
        for (const m of e.m) {
          this.osc(w, mtof(m), t, end, bp, -8);
          this.osc(w, mtof(m), t, end, bp, 8);
        }
        this.adsr(g, t, dur, amp * 0.2, 0.02, 0.06, 0.9);
        break;
      }
      case 'brass': {
        const end = t + dur + 0.12;
        const g = this.voice('keys', t, end);
        const lp = this.filt('lowpass', 500, 1.5, g);
        for (const m of e.m) {
          const o = this.osc('sawtooth', mtof(m) * 0.985, t, end, lp);
          o.frequency.linearRampToValueAtTime(mtof(m), t + 0.05);
        }
        lp.frequency.setValueAtTime(400, t);
        lp.frequency.linearRampToValueAtTime(3200, t + 0.06);
        lp.frequency.setTargetAtTime(1600, t + 0.07, 0.15);
        this.adsr(g, t, dur, amp * 0.32, 0.03, 0.08, 0.7);
        break;
      }
      case 'chip': {
        const end = t + dur + 0.04;
        const g = this.voice('keys', t, end);
        const w = wave(this.ctx, 'p125', pulse(0.125));
        e.m.forEach((m) => this.osc(w, mtof(m), t, end, g));
        this.adsr(g, t, dur, amp * 0.2, 0.002, 0.03, 0.7);
        break;
      }
    }
  }

  /* ============================ VOZ / LEAD ============================ */
  vocals(e: PEv, t: number, spb: number): void {
    const tb = this.tb.vocals;
    const dur = Math.max(0.08, e.d * spb * 0.96);
    const end = t + dur + 0.2;
    const g = this.voice('vocals', t, end);
    const f = mtof(e.m[0]);
    const vib = (o: OscillatorNode, depth: number) => {
      if (dur < 0.25) return;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 5.3;
      const lg = this.ctx.createGain();
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(0, t + 0.15);
      lg.gain.linearRampToValueAtTime(depth, t + 0.4);
      lfo.connect(lg);
      lg.connect(o.detune);
      lfo.start(t);
      lfo.stop(end);
    };
    if (tb === 'chip') {
      const o = this.osc(wave(this.ctx, 'p25', pulse(0.25)), f, t, end, g);
      vib(o, 30);
      this.adsr(g, t, dur, e.v * 0.22, 0.004, 0.04, 0.85);
      return;
    }
    if (tb === 'synth') {
      const lp = this.filt('lowpass', 2600, 2, g);
      const o = this.osc('sawtooth', f, t, end, lp, -5);
      const o2 = this.osc('square', f, t, end, lp, 5);
      vib(o, 25);
      vib(o2, 25);
      this.adsr(g, t, dur, e.v * 0.28, 0.01, 0.1, 0.85);
      return;
    }
    // voz por formantes: fonte "glotal" → 3 passa-faixas paralelos
    const FORM: [number, number, number][] = [
      [800, 1150, 2900], // aah
      [450, 800, 2830], // ooh (o)
      [330, 720, 2500], // uuh
      [420, 1750, 2600], // eeh
    ];
    const fm = FORM[e.vow ?? 0];
    const o = this.osc(wave(this.ctx, 'glot', GLOTTAL), f, t, end, g);
    // remove a ligação direta: a fonte passa só pelos formantes
    o.disconnect();
    o.detune.setValueAtTime(-35, t);
    o.detune.linearRampToValueAtTime(0, t + 0.07);
    vib(o, tb === 'choir' ? 15 : 32);
    const gains = [1, 0.55, 0.28];
    fm.forEach((ff, i) => {
      const bp = this.filt('bandpass', ff, ff / (i === 0 ? 90 : 120));
      const fg = this.ctx.createGain();
      fg.gain.value = gains[i] * (i === 0 ? 3.2 : 4.2);
      o.connect(bp);
      bp.connect(fg);
      fg.connect(g);
    });
    if (tb === 'choir') {
      const o2 = this.osc(wave(this.ctx, 'glot', GLOTTAL), f, t, end, g, 11);
      o2.disconnect();
      const bp = this.filt('bandpass', fm[0], 3, g);
      o2.connect(bp);
    }
    this.adsr(g, t, dur, e.v * (tb === 'choir' ? 0.3 : 0.36), 0.05, 0.12, 0.9);
  }

  /* ============================ ERROS ============================ */
  miss(inst: Instrument, t: number): void {
    const dest = this.room; // garantidamente audível (fora da trilha abafada)
    const g = this.ctx.createGain();
    g.gain.value = 0;
    const out = this.ctx.createGain();
    out.gain.value = 1.4;
    g.connect(out);
    // sai pelo somatório (através do reverb seco/molhado): conecta direto no master também
    out.connect(this.master);
    void dest;
    switch (inst) {
      case 'guitar': {
        const bp = this.filt('bandpass', 3200, 4, g);
        bp.frequency.setValueAtTime(3200, t);
        bp.frequency.exponentialRampToValueAtTime(350, t + 0.28);
        this.noise(t, 0.3, bp, t * 23);
        const o = this.osc('sawtooth', 160, t, t + 0.25, this.filt('lowpass', 900, 1, g));
        o.frequency.exponentialRampToValueAtTime(70, t + 0.24);
        this.env(g, t, 0.28, 0.005, 0.26);
        break;
      }
      case 'drums': {
        const bp = this.filt('bandpass', 700, 2, g);
        this.noise(t, 0.06, bp, t * 29);
        this.osc('sine', 310, t, t + 0.06, g);
        this.env(g, t, 0.35, 0.001, 0.05);
        break;
      }
      case 'bass': {
        const lp = this.filt('lowpass', 500, 4, g);
        const o = this.osc('sawtooth', 90, t, t + 0.25, lp);
        o.frequency.exponentialRampToValueAtTime(42, t + 0.22);
        this.env(g, t, 0.4, 0.004, 0.22);
        break;
      }
      case 'keys': {
        const lp = this.filt('lowpass', 1600, 1, g);
        for (const m of [60, 61, 66]) this.osc('square', mtof(m), t, t + 0.18, lp);
        this.env(g, t, 0.1, 0.002, 0.15);
        break;
      }
      case 'vocals': {
        const bp = this.filt('bandpass', 500, 3, g);
        const o = this.osc('sawtooth', 330, t, t + 0.3, bp);
        o.frequency.exponentialRampToValueAtTime(180, t + 0.28);
        this.env(g, t, 0.5, 0.01, 0.26);
        break;
      }
    }
  }

  play(track: Bus, e: PEv, t: number, spb: number): void {
    if (track === 'bass') this.bass(e, t, spb);
    else if (track === 'guitar') this.guitar(e, t, spb);
    else if (track === 'keys') this.keys(e, t, spb);
    else if (track === 'vocals') this.vocals(e, t, spb);
  }
}
