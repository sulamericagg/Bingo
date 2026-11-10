/* ============================================================
 *  Vinhetas sonoras das intros — sintetizadas (WebAudio), pela saída de
 *  efeitos do jogo (respeita "Som"). Tempos em segundos da CENA; na versão
 *  curta os eventos anteriores ao início são ignorados.
 * ============================================================ */
import { audio } from '../core/audio';

export class Sting {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private rev: AudioNode | null = null;
  private t0 = 0;
  private noiseBuf: AudioBuffer | null = null;

  /** @param from tempo da cena no instante zero (versão curta começa no meio) */
  constructor(private from: number) {
    const o = audio.fxOut();
    if (!o) return;
    this.ctx = o.ctx;
    this.rev = o.rev;
    this.bus = o.ctx.createGain();
    this.bus.gain.value = 0.9;
    this.bus.connect(o.out);
    this.t0 = o.ctx.currentTime + 0.03;
  }
  get on(): boolean {
    return !!this.ctx;
  }
  private at(t: number): number {
    return this.t0 + (t - this.from);
  }
  private ok(t: number): boolean {
    return !!this.ctx && t >= this.from - 0.02;
  }
  tone(t: number, f: number, dur: number, type: OscillatorType, vol: number, o: { slide?: number; rev?: boolean; attack?: number; detune?: number } = {}): void {
    if (!this.ok(t)) return;
    const c = this.ctx!;
    const s = this.at(t);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, s);
    if (o.detune) osc.detune.value = o.detune;
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f * o.slide), s + dur);
    const a = o.attack ?? 0.006;
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(vol, s + a);
    g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
    osc.connect(g).connect(this.bus!);
    if (o.rev) g.connect(this.rev!);
    osc.start(s);
    osc.stop(s + dur + 0.03);
  }
  noise(t: number, dur: number, vol: number, freq: number, o: { q?: number; slide?: number; type?: BiquadFilterType; attack?: number; rev?: boolean } = {}): void {
    if (!this.ok(t)) return;
    const c = this.ctx!;
    const s = this.at(t);
    if (!this.noiseBuf) {
      this.noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.frequency.setValueAtTime(freq, s);
    if (o.slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * o.slide), s + dur);
    f.Q.value = o.q ?? 1;
    const g = c.createGain();
    const a = o.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(vol, s + a);
    g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
    src.connect(f).connect(g).connect(this.bus!);
    if (o.rev) g.connect(this.rev!);
    src.start(s, Math.random() * 0.8);
    src.stop(s + dur + 0.03);
  }

  /* ---- receitas ---- */
  whoosh(t: number, dur = 0.5, vol = 0.25, f = 600, slide = 4): void {
    this.noise(t, dur, vol, f, { q: 0.9, slide, attack: dur * 0.6 });
  }
  boom(t: number, vol = 0.6): void {
    this.tone(t, 90, 0.7, 'sine', vol, { slide: 0.35 });
    this.noise(t, 0.6, vol * 0.6, 300, { q: 0.5, slide: 0.3, type: 'lowpass' });
  }
  kick(t: number, vol = 0.5): void {
    this.tone(t, 140, 0.22, 'sine', vol, { slide: 0.3 });
  }
  snare(t: number, vol = 0.3): void {
    this.noise(t, 0.18, vol, 2200, { q: 0.7 });
    this.tone(t, 200, 0.09, 'triangle', vol * 0.4, { slide: 0.7 });
  }
  hat(t: number, vol = 0.08): void {
    this.noise(t, 0.05, vol, 8000, { type: 'highpass' });
  }
  sparkle(t: number, base = 1568, vol = 0.07): void {
    [1, 1.26, 1.5, 2].forEach((r, i) => this.tone(t + i * 0.045, base * r, 0.4, 'sine', vol, { rev: true }));
  }
  /** acorde (frequências) com ataque macio */
  chord(t: number, fs: number[], dur: number, type: OscillatorType, vol: number, rev = true): void {
    fs.forEach((f, i) => this.tone(t, f, dur, type, vol, { rev, attack: 0.02, detune: (i % 2 ? 6 : -6) }));
  }
  /** "tchan!" do título: acorde maior brilhante + brilho */
  titleHit(t: number, root = 523.25): void {
    this.chord(t, [root, root * 1.26, root * 1.5, root * 2], 1.1, 'triangle', 0.07);
    this.tone(t, root / 2, 0.8, 'sine', 0.18, { rev: true });
    this.sparkle(t + 0.05, root * 3);
  }
  /** power chord distorcido (guitarra sintetizada) */
  power(t: number, f: number, dur: number, vol = 0.12): void {
    if (!this.ok(t)) return;
    const c = this.ctx!;
    const s = this.at(t);
    const ws = c.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * 2 - 1;
      curve[i] = Math.tanh(x * 6);
    }
    ws.curve = curve;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3200, s);
    lp.frequency.exponentialRampToValueAtTime(900, s + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(vol, s + 0.01);
    g.gain.setValueAtTime(vol, s + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
    ws.connect(lp).connect(g).connect(this.bus!);
    g.connect(this.rev!);
    for (const [r, d] of [
      [1, -8],
      [1.5, 7],
      [2, 3],
      [1, 12],
    ]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f * r;
      o.detune.value = d;
      o.connect(ws);
      o.start(s);
      o.stop(s + dur + 0.05);
    }
  }
  /** corta o som (pular a intro) */
  stop(): void {
    if (!this.ctx || !this.bus) return;
    const t = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setValueAtTime(this.bus.gain.value, t);
    this.bus.gain.linearRampToValueAtTime(0, t + 0.12);
    const b = this.bus;
    setTimeout(() => b.disconnect(), 400);
    this.ctx = null;
  }
}
