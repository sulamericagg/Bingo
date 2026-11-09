/* ============================================================
 *  SINTETIZADOR DE RESERVA — toca uma Score (arrange.ts) com WebAudio.
 *  Usado para as músicas demo e as criações do Estúdio (e enquanto o
 *  módulo src/music/songs não existir). Implementa o contrato SongPlayer.
 * ============================================================ */
import type { Instrument, SongPlayer } from '../../music/api';
import type { Score } from './arrange';

interface Ev {
  t: number;
  inst: number; // 0..4, 5 = pad
  p: number;
  d: number;
}

const INST_IDX: Record<Instrument, number> = { drums: 0, bass: 1, guitar: 2, keys: 3, vocals: 4 };
const ORDER: Instrument[] = ['drums', 'bass', 'guitar', 'keys', 'vocals'];
const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();
const shaperCache = new WeakMap<BaseAudioContext, Float32Array>();

function noise(ctx: BaseAudioContext): AudioBuffer {
  let b = noiseCache.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, b);
  }
  return b;
}
function curve(ctx: BaseAudioContext): Float32Array {
  let c = shaperCache.get(ctx);
  if (!c) {
    c = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * 2 - 1;
      c[i] = Math.tanh(x * 3);
    }
    shaperCache.set(ctx, c);
  }
  return c;
}
const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

export class ScorePlayer implements SongPlayer {
  private evs: Ev[] = [];
  private tracks: GainNode[] = [];
  private pad: GainNode;
  private t0 = 0;
  private ptr = 0;
  private timer = 0;
  private running = false;
  private ended = false;
  private endCbs: (() => void)[] = [];
  private dur: number;

  constructor(
    score: Score,
    private ctx: AudioContext,
    private out: AudioNode,
    durationSec?: number,
  ) {
    const spb = 60 / score.bpm;
    this.dur = durationSec ?? score.bars * 4 * spb;
    for (let i = 0; i < 5; i++) {
      const g = ctx.createGain();
      g.gain.value = [0.9, 0.75, 0.42, 0.42, 0.38][i];
      g.connect(out);
      this.tracks.push(g);
    }
    this.pad = ctx.createGain();
    this.pad.gain.value = 0.14;
    this.pad.connect(out);
    for (const inst of ORDER) for (const n of score.parts[inst]) this.evs.push({ t: n.b * spb, inst: INST_IDX[inst], p: n.p, d: Math.max(0.08, n.len * spb) });
    score.chords.forEach((c, bar) => {
      for (const m of c) this.evs.push({ t: bar * 4 * spb, inst: 5, p: m, d: 4 * spb });
    });
    this.evs.sort((a, b) => a.t - b.t);
  }

  start(atSec = 0): void {
    this.stop();
    this.running = true;
    this.ended = false;
    this.t0 = this.ctx.currentTime + 0.06 - atSec;
    this.ptr = 0;
    while (this.ptr < this.evs.length && this.evs[this.ptr].t < atSec) this.ptr++;
    for (let i = 0; i < 5; i++) this.tracks[i].gain.value = [0.9, 0.75, 0.42, 0.42, 0.38][i];
    this.tick();
    this.timer = window.setInterval(() => this.tick(), 25);
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = 0;
  }

  /** desliga e solta os nós (fim definitivo) */
  dispose(): void {
    this.stop();
    const now = this.ctx.currentTime;
    for (const g of [...this.tracks, this.pad]) {
      try {
        g.gain.setTargetAtTime(0, now, 0.03);
        setTimeout(() => g.disconnect(), 300);
      } catch {
        /* */
      }
    }
  }

  time(): number {
    return this.ctx.currentTime - this.t0;
  }

  setTrackGain(inst: Instrument, gain: number): void {
    const i = INST_IDX[inst];
    const base = [0.9, 0.75, 0.42, 0.42, 0.38][i];
    const g = this.tracks[i];
    g.gain.cancelScheduledValues(this.ctx.currentTime);
    g.gain.setTargetAtTime(base * gain, this.ctx.currentTime, gain < 1 ? 0.015 : 0.05);
  }

  miss(inst: Instrument): void {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = inst === 'drums' ? 'triangle' : 'square';
    const f = inst === 'bass' ? 70 : inst === 'drums' ? 120 : 160 + Math.random() * 60;
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.62, t + 0.18);
    o.detune.value = 40;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.25);
  }

  onEnd(cb: () => void): void {
    this.endCbs.push(cb);
  }

  private tick(): void {
    if (!this.running) return;
    const now = this.ctx.currentTime;
    const songT = now - this.t0;
    const horizon = songT + 0.14;
    while (this.ptr < this.evs.length && this.evs[this.ptr].t < horizon) {
      const e = this.evs[this.ptr++];
      const at = Math.max(now, this.t0 + e.t);
      try {
        this.voice(e, at);
      } catch {
        /* */
      }
    }
    if (!this.ended && songT > this.dur + 0.4) {
      this.ended = true;
      this.stop();
      for (const cb of this.endCbs) cb();
    }
  }

  private env(g: GainNode, t: number, a: number, peak: number, d: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private voice(e: Ev, t: number): void {
    const ctx = this.ctx;
    if (e.inst === 0) return this.drum(e.p, t);
    const dest = e.inst === 5 ? this.pad : this.tracks[e.inst];
    const g = ctx.createGain();
    const o = ctx.createOscillator();
    const f = mtof(e.p);
    let end = t + e.d;
    switch (e.inst) {
      case 1: {
        o.type = 'sawtooth';
        o.frequency.value = f;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(900, t);
        lp.frequency.exponentialRampToValueAtTime(260, t + 0.25);
        lp.Q.value = 5;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.9, t + 0.008);
        g.gain.setTargetAtTime(0.5, t + 0.05, 0.1);
        g.gain.setTargetAtTime(0.0001, end - 0.02, 0.04);
        o.connect(lp).connect(g);
        break;
      }
      case 2: {
        o.type = 'sawtooth';
        o.frequency.value = f;
        const o2 = ctx.createOscillator();
        o2.type = 'sawtooth';
        o2.frequency.value = f * 1.4983;
        o2.detune.value = 7;
        const sh = ctx.createWaveShaper();
        sh.curve = curve(ctx) as Float32Array<ArrayBuffer>;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 2600;
        const pre = ctx.createGain();
        pre.gain.value = 0.5;
        o.connect(pre);
        o2.connect(pre);
        pre.connect(sh).connect(lp).connect(g);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.7, t + 0.01);
        g.gain.setTargetAtTime(0.4, t + 0.06, 0.2);
        g.gain.setTargetAtTime(0.0001, end - 0.02, 0.05);
        o2.start(t);
        o2.stop(end + 0.3);
        break;
      }
      case 3: {
        o.type = 'triangle';
        o.frequency.value = f;
        const o2 = ctx.createOscillator();
        o2.type = 'sine';
        o2.frequency.value = f * 2;
        const g2 = ctx.createGain();
        g2.gain.value = 0.35;
        o2.connect(g2).connect(g);
        o.connect(g);
        this.env(g, t, 0.006, 0.9, Math.min(1.2, e.d + 0.25));
        end = t + Math.min(1.2, e.d + 0.25);
        o2.start(t);
        o2.stop(end + 0.05);
        break;
      }
      case 4: {
        o.type = 'triangle';
        o.frequency.setValueAtTime(f * 0.97, t);
        o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
        const lfo = ctx.createOscillator();
        const lg = ctx.createGain();
        lfo.frequency.value = 5.5;
        lg.gain.value = f * 0.012;
        lfo.connect(lg).connect(o.frequency);
        const bp = ctx.createBiquadFilter();
        bp.type = 'peaking';
        bp.frequency.value = 900;
        bp.gain.value = 8;
        o.connect(bp).connect(g);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.85, t + 0.04);
        g.gain.setTargetAtTime(0.0001, end - 0.03, 0.05);
        lfo.start(t);
        lfo.stop(end + 0.3);
        break;
      }
      default: {
        o.type = 'triangle';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.6, t + 0.15);
        g.gain.setTargetAtTime(0.0001, end - 0.2, 0.15);
      }
    }
    g.connect(dest);
    o.start(t);
    o.stop(end + 0.3);
  }

  private drum(v: number, t: number): void {
    const ctx = this.ctx;
    const dest = this.tracks[0];
    if (v === 0) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      this.env(g, t, 0.002, 1, 0.28);
      o.connect(g).connect(dest);
      o.start(t);
      o.stop(t + 0.32);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = noise(ctx);
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    if (v === 1) {
      f.type = 'bandpass';
      f.frequency.value = 1900;
      f.Q.value = 0.8;
      this.env(g, t, 0.002, 0.7, 0.16);
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(220, t);
      o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
      this.env(og, t, 0.002, 0.5, 0.09);
      o.connect(og).connect(dest);
      o.start(t);
      o.stop(t + 0.12);
    } else if (v === 2) {
      f.type = 'highpass';
      f.frequency.value = 7500;
      this.env(g, t, 0.001, 0.32, 0.045);
    } else {
      f.type = 'bandpass';
      f.frequency.value = 1300;
      f.Q.value = 1.4;
      g.gain.setValueAtTime(0.0001, t);
      for (let i = 0; i < 3; i++) {
        g.gain.exponentialRampToValueAtTime(0.6, t + i * 0.012 + 0.002);
        g.gain.exponentialRampToValueAtTime(0.08, t + i * 0.012 + 0.01);
      }
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    }
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 0.3);
    src.stop(t + 0.25);
  }
}
