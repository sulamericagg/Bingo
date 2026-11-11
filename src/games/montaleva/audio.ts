/* ============================================================
 *  MONTA & LEVA — áudio 100% sintetizado (WebAudio), no mesmo AudioContext do app.
 *  Respeita os ajustes globais (save.sound / save.music) e os do jogo (Música / Efeitos).
 *  Enquanto o jogo está aberto a música geral do app é abaixada e entra a trilha própria:
 *  um loop leve e original (Ré maior, ~104 bpm): teclado suave + pad, e na pista ganha baixo e bateria.
 * ============================================================ */
import { audio } from '../../core/audio';
import { save } from '../../core/storage';

interface Core {
  ctx: AudioContext | null;
  master: GainNode;
  sfxBus: GainNode;
  musicBus: GainNode;
}
const A = audio as unknown as Core;
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// progressão: Dmaj7 · Bm7 · Gmaj7 · A6sus
const CHORDS = [
  { root: 38, v: [62, 66, 69, 73] },
  { root: 35, v: [62, 66, 69, 71] },
  { root: 31, v: [62, 66, 67, 71] },
  { root: 33, v: [61, 64, 66, 69] },
];
// melodia (graus em semitons acima de D5=74; -1 = pausa), 2 frases de 16 colcheias
const MEL = [
  [0, -1, 4, -1, 7, -1, 9, 7, -1, 4, -1, 2, 4, -1, -1, -1],
  [2, -1, 4, -1, 9, -1, 7, -1, 4, 2, -1, 0, 2, -1, -1, -1],
  [-1, 7, -1, 9, 11, -1, 9, 7, -1, 4, 7, -1, 4, -1, 2, -1],
  [4, -1, 2, -1, 0, -1, -3, -1, 0, -1, 2, -1, -1, -1, -1, -1],
];

export class MLAudio {
  private ctx: AudioContext | null = null;
  private sfx: GainNode | null = null;
  private mus: GainNode | null = null;
  private delay: DelayNode | null = null;
  private timer = 0;
  private next = 0;
  private step = 0;
  private noiseBuf: AudioBuffer | null = null;
  mood: 'menu' | 'build' | 'drive' = 'menu';
  musicOn = true;
  sfxOn = true;
  // motor contínuo
  private eng: { o: OscillatorNode; o2: OscillatorNode; f: BiquadFilterNode; g: GainNode } | null = null;
  private jet: { s: AudioBufferSourceNode; f: BiquadFilterNode; g: GainNode } | null = null;
  private lastHit = 0;

  start(): void {
    if (this.ctx) return;
    if (!A.ctx) audio.unlock();
    const ctx = A.ctx;
    if (!ctx) return;
    this.ctx = ctx;
    this.sfx = ctx.createGain();
    this.sfx.connect(A.sfxBus);
    this.mus = ctx.createGain();
    this.mus.gain.value = 0;
    this.mus.connect(A.master);
    // eco suave da melodia
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = (60 / 104) * 0.75;
    const fb = ctx.createGain();
    fb.gain.value = 0.28;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.delay.connect(fb).connect(this.delay);
    this.delay.connect(wet).connect(this.mus);
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.apply();
    this.next = ctx.currentTime + 0.12;
    this.timer = window.setInterval(() => this.tick(), 50);
  }

  /** aplica volumes (ajustes do jogo + globais) e abaixa a música geral do app */
  apply(): void {
    const ctx = this.ctx;
    if (!ctx || !this.mus || !this.sfx) return;
    const t = ctx.currentTime;
    A.musicBus.gain.setTargetAtTime(0, t, 0.25);
    this.mus.gain.setTargetAtTime(save.music && this.musicOn ? 0.34 : 0, t, 0.3);
    this.sfx.gain.setTargetAtTime(this.sfxOn ? 1 : 0, t, 0.02);
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = 0;
    this.engine(0, 0);
    this.jetOn(false);
    if (this.mus && this.ctx) this.mus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    const mus = this.mus;
    const sfx = this.sfx;
    window.setTimeout(() => {
      mus?.disconnect();
      sfx?.disconnect();
    }, 600);
    this.ctx = null;
    this.mus = this.sfx = null;
    audio.applySettings();
  }

  /* ----------------------------- música ----------------------------- */
  private tick(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const spb = 60 / 104 / 2; // colcheia
    if (this.next < ctx.currentTime - 0.5) this.next = ctx.currentTime + 0.05;
    while (this.next < ctx.currentTime + 0.25) {
      this.schedule(this.next, this.step);
      this.next += spb;
      this.step++;
    }
  }

  private voice(t: number, f: number, dur: number, vol: number, type: OscillatorType, cut: number, toDelay = false, attack = 0.01): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const fl = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = f;
    fl.type = 'lowpass';
    fl.frequency.value = cut;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(fl).connect(g).connect(this.mus!);
    if (toDelay && this.delay) g.connect(this.delay);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private schedule(t: number, step: number): void {
    if (!this.mus || !save.music || !this.musicOn) return;
    const s = step % 16;
    const bar = Math.floor(step / 16);
    const ch = CHORDS[bar % 4];
    const drive = this.mood === 'drive';
    // pad (início do compasso)
    if (s === 0) for (const m of ch.v) this.voice(t, mtof(m - 12), 2.4, 0.022, 'triangle', 1200, false, 0.35);
    // teclado: acorde quebrado leve
    if (s % 4 === 2) this.voice(t, mtof(ch.v[(s >> 2) % 4]), 0.35, 0.03, 'sine', 2400);
    // melodia (menu e montagem: frases alternadas; pista: todas)
    const phrase = MEL[(bar + (drive ? 0 : 1)) % 4];
    const n = phrase[s];
    if (n >= 0 && (drive || bar % 2 === 0 || this.mood === 'menu')) this.voice(t, mtof(74 + n), 0.42, drive ? 0.05 : 0.04, 'triangle', 3200, true);
    // baixo
    if (drive ? s % 2 === 0 : s % 8 === 0) this.voice(t, mtof(ch.root + 12), drive ? 0.22 : 0.6, drive ? 0.09 : 0.07, 'sine', 500);
    if (drive) {
      // bumbo + chimbal
      if (s % 4 === 0) this.kick(t);
      if (s % 4 === 2) this.hat(t, 0.05);
      if (s === 12 || s === 4) this.hat(t, 0.03, 3500);
    }
  }

  private kick(t: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(this.mus!);
    o.start(t);
    o.stop(t + 0.2);
  }
  private hat(t: number, vol: number, f = 7000): void {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(hp).connect(g).connect(this.mus!);
    s.start(t, Math.random() * 0.5, 0.06);
  }

  /* ----------------------------- efeitos ----------------------------- */
  private tone(f: number, dur: number, type: OscillatorType, vol: number, slide = 1, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx || !this.sfxOn) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.03);
  }
  private noise(dur: number, vol: number, f: number, q = 1, type: BiquadFilterType = 'bandpass', delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx || !this.sfxOn || !this.noiseBuf) return;
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const fl = ctx.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = f;
    fl.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(this.sfx);
    s.start(t, Math.random() * 0.5, dur + 0.05);
  }

  pick(): void {
    this.tone(880, 0.05, 'sine', 0.08, 1.35);
  }
  snap(kind = 0): void {
    this.tone(520 + kind * 40, 0.05, 'triangle', 0.16, 0.7);
    this.noise(0.035, 0.12, 2600, 2);
    this.tone(1320, 0.04, 'sine', 0.05, 1, 0.04);
  }
  bad(): void {
    this.tone(150, 0.12, 'square', 0.05, 0.85);
  }
  remove(): void {
    this.tone(420, 0.12, 'triangle', 0.1, 0.45);
    this.noise(0.08, 0.06, 900, 1);
  }
  rotate(): void {
    this.noise(0.07, 0.07, 3000, 3);
    this.tone(700, 0.05, 'sine', 0.06, 1.25);
  }
  ui(): void {
    this.tone(660, 0.05, 'triangle', 0.08, 1.2);
  }
  go(): void {
    this.tone(392, 0.09, 'triangle', 0.1);
    this.tone(587, 0.12, 'triangle', 0.1, 1, 0.08);
  }
  hit(power: number): void {
    const now = performance.now();
    if (now - this.lastHit < 70) return;
    this.lastHit = now;
    const p = Math.min(1, power);
    this.tone(90 + Math.random() * 30, 0.12, 'sine', 0.05 + p * 0.18, 0.6);
    this.noise(0.09, 0.04 + p * 0.12, 500 + Math.random() * 400, 0.8, 'lowpass');
  }
  /** junta quebrando: estalo seco + rangido metálico curto */
  crack(): void {
    const now = performance.now();
    if (now - this.lastCrack < 60) return;
    this.lastCrack = now;
    this.noise(0.05, 0.3, 1800, 0.7);
    this.tone(260 + Math.random() * 60, 0.09, 'square', 0.07, 0.45);
    this.tone(1900 + Math.random() * 500, 0.16, 'triangle', 0.05, 0.6, 0.03);
    this.noise(0.18, 0.08, 4200, 4, 'bandpass', 0.05);
  }
  private lastCrack = 0;
  glass(): void {
    this.noise(0.25, 0.25, 5200, 1.5, 'highpass');
    for (let i = 0; i < 5; i++) this.tone(2400 + Math.random() * 2200, 0.18, 'sine', 0.05, 1, i * 0.03);
  }
  lost(): void {
    this.tone(523, 0.14, 'triangle', 0.12, 1);
    this.tone(415, 0.14, 'triangle', 0.12, 1, 0.13);
    this.tone(330, 0.3, 'triangle', 0.12, 0.8, 0.26);
  }
  win(): void {
    [0, 4, 7, 12, 16].forEach((n, i) => this.tone(mtof(74 + n), 0.3, 'triangle', 0.11, 1, i * 0.08));
    this.noise(0.4, 0.05, 8000, 1, 'highpass', 0.35);
  }
  star(i: number): void {
    this.tone(mtof(86 + [0, 4, 7][i % 3]), 0.35, 'sine', 0.12);
    this.tone(mtof(98 + [0, 4, 7][i % 3]), 0.25, 'sine', 0.04, 1, 0.02);
  }
  /** fio ligado: estalinho + "zip" subindo */
  wire(): void {
    this.tone(980, 0.04, 'triangle', 0.1, 0.8);
    this.tone(620, 0.16, 'sine', 0.07, 2.2, 0.03);
    this.noise(0.03, 0.08, 3800, 3, 'bandpass', 0.02);
  }
  /** botão da tela apertado / solto */
  press(down: boolean): void {
    if (down) {
      this.noise(0.03, 0.1, 1800, 2);
      this.tone(240, 0.06, 'triangle', 0.08, 0.7);
    } else this.tone(520, 0.04, 'sine', 0.04, 1.2);
  }
  /** vozinha do passageiro: 0 contente, 1 susto, 2 festa, 3 tombo */
  bot(kind: number): void {
    if (kind === 0) {
      this.tone(988, 0.07, 'sine', 0.06, 1.3);
      this.tone(1318, 0.08, 'sine', 0.05, 1.2, 0.07);
    } else if (kind === 1) {
      this.tone(1200, 0.18, 'square', 0.025, 1.6);
      this.tone(1500, 0.12, 'sine', 0.04, 0.7, 0.1);
    } else if (kind === 2) {
      [0, 4, 7, 12].forEach((n, i) => this.tone(mtof(84 + n), 0.09, 'sine', 0.06, 1.1, i * 0.06));
    } else {
      this.tone(700, 0.35, 'triangle', 0.06, 0.35);
    }
  }
  coin(): void {
    this.tone(1568, 0.06, 'square', 0.035);
    this.tone(2093, 0.12, 'square', 0.035, 1, 0.06);
  }

  /** motor contínuo: rot = rotação média das rodas (rad/s), thr 0..1 */
  engine(rot: number, thr: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx) return;
    const want = this.sfxOn && save.sound && (thr > 0 || rot > 1);
    if (!want) {
      if (this.eng) {
        const e = this.eng;
        this.eng = null;
        e.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.06);
        e.o.stop(ctx.currentTime + 0.4);
        e.o2.stop(ctx.currentTime + 0.4);
      }
      return;
    }
    if (!this.eng) {
      const o = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      o.type = 'sawtooth';
      o2.type = 'square';
      f.type = 'lowpass';
      f.frequency.value = 500;
      g.gain.value = 0.0001;
      o.connect(f);
      o2.connect(f);
      f.connect(g).connect(this.sfx);
      o.start();
      o2.start();
      this.eng = { o, o2, f, g };
    }
    const t = ctx.currentTime;
    const base = 46 + Math.min(40, rot) * 4.2;
    this.eng.o.frequency.setTargetAtTime(base, t, 0.05);
    this.eng.o2.frequency.setTargetAtTime(base * 0.502, t, 0.05);
    this.eng.f.frequency.setTargetAtTime(380 + thr * 700 + rot * 12, t, 0.06);
    this.eng.g.gain.setTargetAtTime(0.018 + thr * 0.035, t, 0.05);
  }

  jetOn(on: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx || !this.noiseBuf) return;
    if (on && !this.jet && this.sfxOn) {
      const s = ctx.createBufferSource();
      s.buffer = this.noiseBuf;
      s.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 900;
      f.Q.value = 0.7;
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      g.gain.setTargetAtTime(0.16, ctx.currentTime, 0.04);
      s.connect(f).connect(g).connect(this.sfx);
      s.start();
      this.jet = { s, f, g };
    } else if (!on && this.jet) {
      const j = this.jet;
      this.jet = null;
      j.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
      j.s.stop(ctx.currentTime + 0.3);
    }
  }

  suspend(): void {
    this.engine(0, 0);
    this.jetOn(false);
  }
}
