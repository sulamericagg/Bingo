/* ============================================================
 *  ANOMALIAS — sons sintetizados (sem arquivos). Usa a saída de efeitos
 *  do app (respeita "Som"): zumbido de lâmpada, passos, obturador,
 *  sustos fofos, coração, alarme, mordida do Bocudo, sons de anomalia
 *  com pan estéreo (de que lado vem).
 * ============================================================ */
import { audio } from '../../../core/audio';

type Out = { ctx: AudioContext; out: AudioNode; rev: AudioNode };

export class AnoAudio {
  private o: Out | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private hum: { g: GainNode; nodes: AudioScheduledSourceNode[] } | null = null;
  private stat: { g: GainNode; src: AudioBufferSourceNode } | null = null;
  private hbT = 0;
  muted = false;

  private ok(): Out | null {
    if (this.muted) return null;
    if (!this.o) {
      audio.unlock();
      const o = audio.fxOut();
      if (!o) return null;
      this.o = o;
      this.master = o.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(o.out);
    }
    if (this.o.ctx.state === 'suspended') void this.o.ctx.resume().catch(() => undefined);
    return this.o;
  }
  private noise(): AudioBuffer | null {
    const o = this.ok();
    if (!o) return null;
    if (!this.noiseBuf) {
      const c = o.ctx;
      this.noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuf;
  }
  private dest(pan = 0, rev = 0): AudioNode | null {
    const o = this.ok();
    if (!o || !this.master) return null;
    let d: AudioNode = this.master;
    if (pan) {
      const p = o.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      p.connect(this.master);
      d = p;
    }
    if (rev > 0) {
      const g = o.ctx.createGain();
      g.gain.value = rev;
      g.connect(o.rev);
      const s = o.ctx.createGain();
      s.connect(d);
      s.connect(g);
      return s;
    }
    return d;
  }
  tone(f: number, dur: number, type: OscillatorType, vol: number, o: { slide?: number; delay?: number; pan?: number; rev?: number; attack?: number } = {}): void {
    const d = this.dest(o.pan, o.rev);
    if (!d || !this.o) return;
    const c = this.o.ctx;
    const t = c.currentTime + (o.delay ?? 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t);
    if (o.slide && o.slide !== 1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f * o.slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (o.attack ?? 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(d);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
  burst(dur: number, vol: number, freq: number, o: { q?: number; slide?: number; delay?: number; pan?: number; type?: BiquadFilterType; rev?: number } = {}): void {
    const buf = this.noise();
    const d = this.dest(o.pan, o.rev);
    if (!buf || !d || !this.o) return;
    const c = this.o.ctx;
    const t = c.currentTime + (o.delay ?? 0);
    const s = c.createBufferSource();
    s.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.frequency.setValueAtTime(freq, t);
    if (o.slide && o.slide !== 1) f.frequency.exponentialRampToValueAtTime(Math.max(30, freq * o.slide), t + dur);
    f.Q.value = o.q ?? 1;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(d);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  /* ------------------------------ ambiente ------------------------------ */
  /** zumbido de lâmpada fluorescente + ar-condicionado (contínuo) */
  startHum(): void {
    const o = this.ok();
    const buf = this.noise();
    if (!o || !buf || this.hum || !this.master) return;
    const c = o.ctx;
    const g = c.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(1, c.currentTime, 1.5);
    g.connect(this.master);
    const nodes: AudioScheduledSourceNode[] = [];
    for (const [f, v] of [
      [60, 0.02],
      [120, 0.012],
      [180, 0.004],
    ] as const) {
      const osc = c.createOscillator();
      osc.frequency.value = f;
      const og = c.createGain();
      og.gain.value = v;
      osc.connect(og).connect(g);
      osc.start();
      nodes.push(osc);
    }
    const s = c.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const ng = c.createGain();
    ng.gain.value = 0.035;
    s.connect(lp).connect(ng).connect(g);
    s.start();
    nodes.push(s);
    this.hum = { g, nodes };
  }
  setHum(v: number): void {
    if (this.hum && this.o) this.hum.g.gain.setTargetAtTime(v, this.o.ctx.currentTime, 0.3);
  }
  stopHum(): void {
    if (!this.hum) return;
    for (const n of this.hum.nodes)
      try {
        n.stop();
      } catch {
        /* */
      }
    this.hum.g.disconnect();
    this.hum = null;
  }
  /** chiado do monitor de câmeras */
  staticOn(on: boolean): void {
    const o = this.ok();
    if (on && !this.stat && o && this.master) {
      const buf = this.noise()!;
      const s = o.ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      const f = o.ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 2500;
      const g = o.ctx.createGain();
      g.gain.value = 0.025;
      s.connect(f).connect(g).connect(this.master);
      s.start();
      this.stat = { g, src: s };
    } else if (!on && this.stat) {
      try {
        this.stat.src.stop();
      } catch {
        /* */
      }
      this.stat.g.disconnect();
      this.stat = null;
    }
  }
  /** batida de coração (perigo alto); chame a cada quadro com 0..1 */
  heart(dt: number, k: number): void {
    if (k <= 0) return;
    this.hbT -= dt;
    if (this.hbT > 0) return;
    this.hbT = 1.1 - k * 0.55;
    const v = 0.08 + k * 0.18;
    this.tone(62, 0.16, 'sine', v, { slide: 0.7 });
    this.tone(55, 0.18, 'sine', v * 0.8, { slide: 0.7, delay: 0.2 });
  }

  /* ------------------------------ efeitos ------------------------------ */
  step(): void {
    this.burst(0.07, 0.07, 260 + Math.random() * 80, { q: 0.8 });
    this.tone(70 + Math.random() * 20, 0.06, 'sine', 0.05);
  }
  click(): void {
    this.tone(900, 0.05, 'triangle', 0.08, { slide: 1.3 });
  }
  raise(): void {
    this.tone(500, 0.08, 'triangle', 0.06, { slide: 1.5 });
  }
  shutter(): void {
    this.burst(0.05, 0.35, 3000, { q: 2 });
    this.tone(1800, 0.03, 'square', 0.06);
    this.burst(0.09, 0.25, 1800, { q: 1.5, delay: 0.06 });
    this.tone(2600, 0.2, 'sine', 0.05, { delay: 0.1, slide: 0.6 });
  }
  good(): void {
    [784, 988, 1319, 1568].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.12, { delay: 0.12 + i * 0.07 }));
    this.tone(2093, 0.5, 'sine', 0.06, { delay: 0.45 });
  }
  bad(): void {
    this.tone(220, 0.22, 'square', 0.06, { slide: 0.7 });
    this.tone(160, 0.3, 'square', 0.05, { slide: 0.7, delay: 0.12 });
  }
  pick(): void {
    this.tone(660, 0.08, 'triangle', 0.12, { slide: 1.4 });
    this.tone(990, 0.1, 'triangle', 0.1, { delay: 0.06 });
  }
  taskDone(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.11, { delay: i * 0.06 }));
  }
  /** anomalia escapou: acorde descendente esquisito */
  missed(): void {
    [440, 415, 370, 311].forEach((f, i) => this.tone(f, 0.5, 'sawtooth', 0.035, { delay: i * 0.12, rev: 0.6 }));
    this.tone(55, 1.2, 'sine', 0.15, { slide: 0.6 });
  }
  /** a criança "sente" algo mudar (sutil, só em fácil/normal) */
  whisper(pan = 0): void {
    this.burst(0.9, 0.05, 900, { q: 3, slide: 1.8, pan, rev: 0.8 });
  }
  flicker(): void {
    this.burst(0.06, 0.06, 5000, { q: 4 });
    this.tone(120, 0.08, 'square', 0.025);
  }
  powerDown(): void {
    this.tone(220, 1.2, 'sawtooth', 0.08, { slide: 0.25 });
    this.burst(0.4, 0.2, 400, { slide: 0.3 });
  }
  powerUp(): void {
    this.tone(80, 0.8, 'sawtooth', 0.06, { slide: 2.5 });
    this.burst(0.15, 0.1, 3000, { delay: 0.6 });
  }
  alarm(): void {
    for (let i = 0; i < 4; i++) {
      this.tone(740, 0.22, 'square', 0.06, { delay: i * 0.5 });
      this.tone(554, 0.22, 'square', 0.06, { delay: i * 0.5 + 0.25 });
    }
  }
  growl(pan = 0): void {
    this.tone(95, 0.7, 'sawtooth', 0.09, { slide: 0.7, pan, rev: 0.5 });
    this.burst(0.6, 0.12, 300, { q: 2, slide: 0.6, pan });
  }
  /** Bocudo fugindo do flash: "iiih!" fofo */
  squeal(): void {
    this.tone(900, 0.35, 'triangle', 0.1, { slide: 2.2 });
    this.tone(1300, 0.25, 'sine', 0.06, { slide: 1.8, delay: 0.1 });
  }
  /** NHAC! mordida de desenho animado */
  chomp(): void {
    this.burst(0.18, 0.5, 600, { q: 0.7, slide: 0.4 });
    this.tone(140, 0.25, 'square', 0.18, { slide: 0.4 });
    this.tone(1200, 0.05, 'square', 0.1, { delay: 0.02 });
    this.burst(0.3, 0.3, 200, { delay: 0.05, slide: 0.5 });
  }
  /** som de anomalia 'sound' (variante = tipo) com pan */
  eerie(variant: number, pan: number, vol: number): void {
    const v = Math.max(0.01, vol);
    if (variant % 4 === 0) {
      // caixinha de música desafinada
      [1047, 1175, 988, 1319, 880].forEach((f, i) => this.tone(f * (1 + (Math.random() - 0.5) * 0.03), 0.5, 'sine', 0.07 * v, { delay: i * 0.28, pan, rev: 0.5 }));
    } else if (variant % 4 === 1) {
      // toc toc toc
      for (let i = 0; i < 3; i++) this.burst(0.08, 0.35 * v, 500, { q: 1, delay: i * 0.22, pan });
    } else if (variant % 4 === 2) {
      // risadinha
      [880, 990, 880, 1046].forEach((f, i) => this.tone(f, 0.11, 'triangle', 0.08 * v, { delay: i * 0.12, pan, slide: 1.1 }));
    } else {
      // telefone tocando
      for (let i = 0; i < 2; i++) for (let k = 0; k < 6; k++) this.tone(k % 2 ? 1400 : 1700, 0.05, 'square', 0.04 * v, { delay: i * 0.6 + k * 0.05, pan });
    }
  }
  chime(): void {
    [1568, 1319, 1047, 784].forEach((f, i) => this.tone(f, 1.2, 'sine', 0.1, { delay: i * 0.45, rev: 0.6 }));
    [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.1, { delay: 2 + i * 0.09 }));
  }
  dispose(): void {
    this.stopHum();
    this.staticOn(false);
    this.master?.disconnect();
    this.master = null;
    this.o = null;
  }
}
