import { save } from './storage';

/** Áudio 100% sintetizado (WebAudio): zero arquivos, APK leve. */
class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private reverb!: ConvolverNode;
  private musicTimer = 0;
  private step = 0;
  private nextTime = 0;
  private intensity = 0;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = save.music ? 0.32 : 0;
    this.musicBus.connect(this.master);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.reverb.connect(wet).connect(this.master);
    this.applySettings();
    this.startMusic();
  }

  private impulse(sec: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return buf;
  }

  applySettings(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfxBus.gain.setTargetAtTime(save.sound ? 1 : 0, t, 0.02);
    this.musicBus.gain.setTargetAtTime(save.music ? 0.32 : 0, t, 0.3);
  }

  suspend(): void {
    this.ctx?.suspend().catch(() => {});
  }
  resume(): void {
    this.ctx?.resume().catch(() => {});
  }

  setIntensity(v: number): void {
    this.intensity = v;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, opts: { slide?: number; delay?: number; rev?: boolean; attack?: number } = {}): void {
    const ctx = this.ctx;
    if (!ctx || !save.sound) return;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * opts.slide), t + dur);
    const a = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxBus);
    if (opts.rev) g.connect(this.reverb);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, freq: number, q = 1, slide = 1): void {
    const ctx = this.ctx;
    if (!ctx || !save.sound) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t);
  }

  jump(combo = 0): void {
    const base = 300 * Math.pow(1.03, Math.min(combo, 20));
    this.tone(base, 0.18, 'sine', 0.35, { slide: 2.4 });
    this.tone(base * 2, 0.1, 'triangle', 0.08, { slide: 1.8 });
    this.noise(0.12, 0.12, 2500, 0.8, 0.4);
  }

  land(combo = 0): void {
    this.tone(120, 0.16, 'sine', 0.5, { slide: 0.5 });
    const notes = [523, 587, 659, 784, 880, 1047, 1175, 1319];
    const n = notes[Math.min(combo, notes.length - 1)];
    this.tone(n, 0.35, 'triangle', 0.16, { rev: true, delay: 0.01 });
  }

  perfect(combo = 0): void {
    const r = Math.pow(1.06, Math.min(combo, 12));
    [784, 988, 1175, 1568].forEach((f, i) => this.tone(f * r, 0.4, 'sine', 0.13, { delay: i * 0.045, rev: true }));
  }

  coin(chain = 0): void {
    const f = 1200 * Math.pow(1.06, chain % 12);
    this.tone(f, 0.07, 'square', 0.06);
    this.tone(f * 1.5, 0.22, 'sine', 0.12, { delay: 0.06, rev: true });
  }

  gem(): void {
    [1319, 1568, 1976, 2637].forEach((f, i) => this.tone(f, 0.3, 'sine', 0.1, { delay: i * 0.05, rev: true }));
  }

  crack(): void {
    this.noise(0.15, 0.25, 900, 2, 0.5);
  }

  hit(): void {
    this.noise(0.6, 0.6, 600, 0.6, 0.15);
    this.tone(220, 0.6, 'sawtooth', 0.18, { slide: 0.25 });
  }

  click(): void {
    this.tone(880, 0.05, 'triangle', 0.12, { slide: 1.4 });
  }

  unlock2(): void {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.12, { delay: i * 0.08, rev: true }));
  }

  cash(): void {
    for (let i = 0; i < 6; i++) this.tone(1500 + i * 150, 0.12, 'square', 0.04, { delay: i * 0.04 });
    this.tone(2093, 0.6, 'sine', 0.12, { delay: 0.25, rev: true });
  }

  /** Sirene de alerta (sobe e desce): ~dur segundos. Avisa ANTES do perigo. */
  siren(dur = 2.4): void {
    const ctx = this.ctx;
    if (!ctx || !save.sound) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    o.type = 'triangle';
    o2.type = 'square';
    o.frequency.value = 820;
    o2.frequency.value = 820;
    lfo.type = 'sine';
    lfo.frequency.value = 1.6; // "uóóó-uóóó"
    depth.gain.value = 260;
    lfo.connect(depth);
    depth.connect(o.frequency);
    depth.connect(o2.frequency);
    f.type = 'lowpass';
    f.frequency.value = 2200;
    const g2 = ctx.createGain();
    g2.gain.value = 0.18;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11, t + 0.12);
    g.gain.setValueAtTime(0.11, t + Math.max(0.2, dur - 0.35));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f);
    o2.connect(g2).connect(f);
    f.connect(g).connect(this.sfxBus);
    for (const n of [o, o2, lfo]) {
      n.start(t);
      n.stop(t + dur + 0.05);
    }
  }

  /** "Tic" curtinho para contadores de recompensa (sobe de tom com i). */
  tick(i = 0): void {
    this.tone(900 * Math.pow(1.04, Math.min(i, 24)), 0.04, 'square', 0.035);
  }

  /** Quase! (passou raspando) — assobio rápido e brilhante. */
  nearMiss(): void {
    this.tone(1400, 0.12, 'sine', 0.08, { slide: 1.6 });
    this.noise(0.1, 0.06, 4000, 1.2, 1.5);
  }

  /** Novo recorde: fanfarra curta. */
  record(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, 'square', 0.05, { delay: i * 0.09 }));
    [1047, 1319, 1568].forEach((f) => this.tone(f, 0.9, 'triangle', 0.09, { delay: 0.38, rev: true }));
  }

  /** Perdeu: "uóóón" suave e descendente (não assusta criança). */
  fail(): void {
    this.tone(392, 0.22, 'triangle', 0.14, { slide: 0.9 });
    this.tone(330, 0.5, 'triangle', 0.14, { delay: 0.18, slide: 0.7 });
  }

  /* ----------- motor (Rally) ----------- */
  private eng: { o: OscillatorNode; o2: OscillatorNode; f: BiquadFilterNode; g: GainNode } | null = null;

  /** Liga o ronco do motor (idempotente). Segue o sfxBus, então respeita "Som". */
  engineStart(): void {
    const ctx = this.ctx;
    if (!ctx || this.eng) return;
    const o = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o2.type = 'square';
    o.frequency.value = 48;
    o2.frequency.value = 24.5;
    f.type = 'lowpass';
    f.frequency.value = 320;
    f.Q.value = 2;
    g.gain.value = 0.0001;
    const g2 = ctx.createGain();
    g2.gain.value = 0.5;
    o.connect(f);
    o2.connect(g2).connect(f);
    f.connect(g).connect(this.sfxBus);
    o.start();
    o2.start();
    this.eng = { o, o2, f, g };
  }

  /** throttle 0..1 (acelerador), speed 0..1 (velocidade relativa). */
  engineSet(throttle: number, speed: number): void {
    const e = this.eng;
    const ctx = this.ctx;
    if (!e || !ctx) return;
    const t = ctx.currentTime;
    const rpm = 0.25 + speed * 0.55 + throttle * 0.3;
    e.o.frequency.setTargetAtTime(42 + rpm * 95, t, 0.06);
    e.o2.frequency.setTargetAtTime(21 + rpm * 47.5 + 0.7, t, 0.06);
    e.f.frequency.setTargetAtTime(260 + rpm * 900 + throttle * 300, t, 0.05);
    e.g.gain.setTargetAtTime(save.sound ? 0.035 + throttle * 0.04 : 0.0001, t, 0.08);
  }

  engineStop(): void {
    const e = this.eng;
    const ctx = this.ctx;
    if (!e || !ctx) return;
    this.eng = null;
    const t = ctx.currentTime;
    e.g.gain.setTargetAtTime(0.0001, t, 0.05);
    e.o.stop(t + 0.3);
    e.o2.stop(t + 0.3);
  }

  /* ----------- música generativa ----------- */
  private startMusic(): void {
    if (!this.ctx) return;
    this.nextTime = this.ctx.currentTime + 0.1;
    const tick = () => {
      const ctx = this.ctx!;
      while (this.nextTime < ctx.currentTime + 0.25) {
        this.scheduleStep(this.nextTime);
        this.nextTime += 60 / 96 / 2;
        this.step++;
      }
    };
    this.musicTimer = window.setInterval(tick, 60);
  }

  private scheduleStep(t: number): void {
    const ctx = this.ctx!;
    if (!save.music || ctx.state !== 'running') return;
    const chords = [
      [57, 60, 64, 67],
      [53, 57, 60, 64],
      [55, 59, 62, 67],
      [52, 55, 59, 64],
    ];
    const bar = Math.floor(this.step / 16) % 4;
    const chord = chords[bar];
    const s = this.step % 16;
    const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
    const voice = (freq: number, dur: number, vol: number, type: OscillatorType, cutoff: number) => {
      const o = ctx.createOscillator();
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      f.type = 'lowpass';
      f.frequency.value = cutoff;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.08, dur / 3));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f).connect(g).connect(this.musicBus);
      g.connect(this.reverb);
      o.start(t);
      o.stop(t + dur + 0.05);
    };
    if (s === 0) chord.forEach((m) => voice(mtof(m), 2.6, 0.05, 'sawtooth', 900));
    if (s % 4 === 0) voice(mtof(chord[0] - 12), 0.5, 0.18, 'sine', 400);
    const arp = [0, 2, 1, 3, 2, 1, 3, 0];
    if (s % 2 === 0 || this.intensity > 0.5) {
      const m = chord[arp[(s >> (this.intensity > 0.5 ? 0 : 1)) % 8]] + 12;
      voice(mtof(m), 0.28, 0.045 + this.intensity * 0.03, 'triangle', 3200);
    }
    if (this.intensity > 0.25 && (s === 4 || s === 12)) {
      const len = Math.floor(ctx.sampleRate * 0.05);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 6000;
      const g = ctx.createGain();
      g.gain.value = 0.08;
      src.connect(hp).connect(g).connect(this.musicBus);
      src.start(t);
    }
  }

  dispose(): void {
    clearInterval(this.musicTimer);
  }
}

export const audio = new Sfx();
