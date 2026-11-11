/* ============================================================
 *  JANGADA BLOOP — trilha e efeitos 100% sintetizados (WebAudio).
 *  No mesmo AudioContext do app (src/core/audio.ts): a música geral é
 *  abaixada e entra a trilha própria. Respeita save.sound / save.music.
 *
 *  MÚSICA (original, sequenciador próprio):
 *   - "Maré Mansa" (dia, Fá maior, 96 bpm): cavaquinho/ukulele dedilhado,
 *     marimba e steel drum revezando a melodia, baixo de pegada, chocalho e bongô.
 *     Seções A/B de 8 compassos + "respiro" (sem melodia) a cada 3 voltas.
 *   - "Lua na Jangada" (noite, Ré dórico, 70 bpm): pad quentinho, kalimba em
 *     arpejo com eco, baixo redondo, melodia de caixinha de música esparsa.
 *   - "Tormenta" (tempestade/tubarão, Lá menor, 108 bpm): pulso grave, tambores,
 *     ostinato de marimba abafada — tenso mas nunca agressivo.
 *   - vinhetas: ilha à vista, receita feita, nível novo, novo dia, anoitecer,
 *     missão cumprida, tubarão chegando.
 *  AMBIENTE: ondas (2 camadas estéreo + batidas na madeira), vento, chuva,
 *   trovão, gaivotas (3D), crepitar da fogueira (3D).
 *  EFEITOS: tudo com variação de altura/tempo para não repetir igual.
 *  Sons do mundo em 3D (PannerNode) e abafados debaixo d'água.
 *  A música "abaixa" (ducking) nos sons importantes.
 * ============================================================ */
import { save } from '../../core/storage';
import { definePack, engine, sfx, type PlayOpts, type SoundDef } from '../../audio';
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

export type Song = 'day' | 'night' | 'storm' | 'mega' | 'kraken' | 'off';
type V3 = { x: number; y: number; z: number };

/* ------------------------------ composição ------------------------------ */
// acordes (voicing tipo ukulele) e baixos
const CH: Record<string, { v: number[]; b: number }> = {
  F: { v: [60, 65, 69, 72], b: 41 },
  Dm: { v: [62, 65, 69, 74], b: 38 },
  Bb: { v: [62, 65, 70, 74], b: 46 },
  C: { v: [60, 64, 67, 72], b: 36 },
  Am: { v: [60, 64, 69, 72], b: 45 },
  Gm: { v: [62, 67, 70, 74], b: 43 },
  C7: { v: [60, 64, 67, 70], b: 36 },
};
const DAY_A = ['F', 'Dm', 'Bb', 'C', 'F', 'Dm', 'Bb', 'C7'];
const DAY_B = ['Bb', 'C', 'Am', 'Dm', 'Gm', 'C', 'F', 'F'];
// melodias em colcheias (16 por frase de 2 compassos); -1 = pausa
const MEL_A = [
  [72, -1, 69, 72, 74, -1, 72, -1, 69, -1, 67, 69, 65, -1, -1, -1],
  [70, -1, 74, -1, 77, -1, 76, 74, 72, -1, 74, 72, 67, -1, -1, -1],
  [72, -1, 69, 72, 77, -1, 76, -1, 74, -1, 72, 69, 74, -1, 72, -1],
  [70, 69, 70, 74, 72, -1, 70, 69, 67, -1, 69, -1, 72, -1, -1, -1],
];
const MEL_B = [
  [77, -1, 77, 76, 74, -1, 72, -1, 76, -1, 76, 74, 72, -1, 67, -1],
  [76, -1, 72, -1, 69, 72, 76, -1, 77, -1, 74, -1, 69, -1, -1, -1],
  [74, -1, 70, 74, 79, -1, 77, 76, 76, -1, 74, -1, 72, -1, 76, -1],
  [77, -1, 72, -1, 69, -1, 72, 74, 77, -1, -1, -1, -1, -1, -1, -1],
];
// noite: acordes de 2 compassos (voicings abertos)
const NIGHT = [
  { v: [62, 65, 69, 72, 76], b: 38 }, // Dm9
  { v: [58, 62, 65, 69, 74], b: 46 }, // Bbmaj7
  { v: [57, 60, 64, 65, 72], b: 41 }, // Fmaj7
  { v: [55, 60, 62, 64, 67], b: 36 }, // Cadd9
];
const NIGHT_MEL = [
  [81, -1, -1, 79, 77, -1, -1, -1, 76, -1, 77, -1, 74, -1, -1, -1],
  [-1, -1, 74, -1, 77, -1, 81, -1, 79, -1, -1, -1, -1, -1, -1, -1],
  [76, -1, -1, 77, 79, -1, 76, -1, 72, -1, -1, -1, 74, -1, -1, -1],
  [-1, -1, 72, -1, 74, -1, 76, -1, 74, -1, -1, -1, -1, -1, -1, -1],
];
const STORM = [
  { v: [57, 60, 64], b: 33 }, // Am
  { v: [57, 60, 65], b: 29 }, // F
  { v: [55, 59, 62], b: 31 }, // G
  { v: [56, 59, 64], b: 28 }, // E
];
const BPM: Record<Exclude<Song, 'off'>, number> = { day: 96, night: 70, storm: 108, mega: 132, kraken: 100 };

/** sintetizador da Jangada: ao vivo (música + ambiente) ou offline (receitas do pacote 'jangada') */
class JSynth {
  private ctx: AudioContext | null = null;
  private offline = false;
  private t0 = 0;
  get out(): AudioNode {
    return this.world!;
  }
  get at0(): number {
    return this.t0;
  }
  private mus: GainNode | null = null;
  private songG: Record<string, GainNode> = {};
  private world: GainNode | null = null;
  private uw: BiquadFilterNode | null = null;
  private ui: GainNode | null = null;
  private revIn: GainNode | null = null;
  private delay: DelayNode | null = null;
  private noise: AudioBuffer | null = null;
  private waves: PeriodicWave[] = [];
  private timer = 0;
  private next = 0;
  private seq = 0;
  song: Song = 'off';
  private want: Song = 'day';
  // ambiente contínuo
  private amb: {
    waveG: GainNode[];
    waveF: BiquadFilterNode[];
    windG: GainNode;
    windF: BiquadFilterNode;
    rainG: GainNode;
    rainF: BiquadFilterNode;
    srcs: AudioBufferSourceNode[];
  } | null = null;
  private ambT = 0;
  /** 0..1 tempestade, 0..1 noite, embaixo d'água */
  storm = 0;
  night = 0;
  underwater = false;
  /** ondas mais fortes perto da beira (0..1) */
  private gullT = 8;
  private slapT = 1;
  private fires: { p: V3; lv: number; pan: PannerNode | null; g: GainNode | null; t: number }[] = [];
  private lastHit = new Map<string, number>();
  private dead = false;
  /** HRTF em aparelhos bons; 'equalpower' nos fracos */
  hq = true;

  /** instância offline: desenha um efeito em `out` a partir de t (cache do pacote) */
  static offline(c: BaseAudioContext, out: AudioNode, t: number): JSynth {
    const s = new JSynth();
    const ctx = c as AudioContext;
    s.ctx = ctx;
    s.offline = true;
    s.t0 = t;
    const g = ctx.createGain();
    g.connect(out);
    s.ui = s.world = g;
    s.revIn = ctx.createGain();
    s.revIn.gain.value = 0.18;
    s.revIn.connect(out);
    s.delay = ctx.createDelay(1);
    s.delay.delayTime.value = 0.28;
    const fb = ctx.createGain();
    fb.gain.value = 0.25;
    s.delay.connect(fb).connect(s.delay);
    fb.connect(out);
    s.buffers();
    return s;
  }
  start(): void {
    if (this.ctx) return;
    const ctx = engine.ensure();
    if (!ctx) return;
    engine.unlock();
    this.ctx = ctx;
    // barramentos do motor de áudio do app (volumes, ducking, reverb)
    this.mus = ctx.createGain();
    this.mus.connect(engine.musicIn);
    this.uw = ctx.createBiquadFilter();
    this.uw.type = 'lowpass';
    this.uw.frequency.value = 18000;
    this.uw.Q.value = 0.5;
    this.world = ctx.createGain();
    this.world.connect(this.uw).connect(engine.ambIn);
    this.ui = engine.uiIn as GainNode;
    this.revIn = ctx.createGain();
    this.revIn.connect(engine.musicRev);
    // eco das melodias
    this.delay = ctx.createDelay(1.5);
    this.delay.delayTime.value = (60 / 96) * 0.75;
    const fb = ctx.createGain();
    fb.gain.value = 0.3;
    const dl = ctx.createBiquadFilter();
    dl.type = 'lowpass';
    dl.frequency.value = 2600;
    const dw = ctx.createGain();
    dw.gain.value = 0.28;
    this.delay.connect(dl).connect(fb).connect(this.delay);
    dl.connect(dw).connect(this.mus);
    for (const k of ['day', 'night', 'storm', 'mega', 'kraken']) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.mus);
      this.songG[k] = g;
    }
    this.buffers();
    this.startAmbience();
    this.next = ctx.currentTime + 0.15;
    this.timer = window.setInterval(() => this.tick(), 50);
  }
  private buffers(): void {
    const ctx = this.ctx!;
    // ruído estéreo descorrelacionado (2 s)
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = this.noise.getChannelData(c);
      let b0 = 0,
        b1 = 0,
        b2 = 0;
      for (let i = 0; i < len; i++) {
        // ruído "rosa" barato (mais macio que o branco)
        const w = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
      }
    }
    // timbres (ondas periódicas)
    const pw = (re: number[]) => ctx.createPeriodicWave(new Float32Array([0, ...re.map(() => 0)]), new Float32Array([0, ...re]));
    this.waves = [
      pw([1, 0.55, 0.32, 0.22, 0.12, 0.08, 0.05]), // 0 ukulele
      pw([1, 0.75, 0.42, 0.32, 0.12, 0.1, 0.03]), // 1 steel drum
      pw([1, 0.2, 0.06]), // 2 baixo redondo
      pw([1, 0.5, 0.33, 0.25, 0.2, 0.16, 0.14, 0.12]), // 3 "corda" (pad)
    ];
  }

  stop(): void {
    this.dead = true;
    clearInterval(this.timer);
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.mus?.gain.setTargetAtTime(0, t, 0.15);
    this.world?.gain.setTargetAtTime(0, t, 0.1);
    const nodes = [this.mus, this.world, this.uw, this.revIn];
    if (this.motorN) {
      const mn = this.motorN;
      window.setTimeout(() => {
        try {
          mn.o.stop();
          mn.o2.stop();
        } catch {
          /* */
        }
      }, 700);
      this.motorN = null;
    }
    this.unmuffle();
    const srcs = this.amb?.srcs ?? [];
    window.setTimeout(() => {
      for (const x of srcs)
        try {
          x.stop();
        } catch {
          /* */
        }
      for (const n of nodes) n?.disconnect();
    }, 700);
    this.ctx = null;
  }

  /* =========================== música =========================== */
  setSong(s: Song): void {
    this.want = s;
  }
  private tick(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    this.ambience();
    this.ambienceV2();
    if (this.want !== this.song) this.switchSong();
    if (this.song === 'off') return;
    const spb = 60 / BPM[this.song] / 4; // semicolcheia
    if (this.next < ctx.currentTime - 0.4) this.next = ctx.currentTime + 0.05;
    while (this.next < ctx.currentTime + 0.3) {
      if (save.music) this.schedule(this.next, this.seq, spb);
      this.next += this.song === 'day' || this.song === 'night' ? spb * (this.seq % 2 ? 0.92 : 1.08) : spb; // leve balanço (swing)
      this.seq++;
    }
  }
  private switchSong(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    for (const k in this.songG) this.songG[k].gain.setTargetAtTime(k === this.want ? 1 : 0, t, k === this.want ? 0.6 : 0.9);
    const from = this.song;
    this.song = this.want;
    this.seq = 0;
    this.next = t + (from === 'off' ? 0.1 : 0.35);
    if (this.song !== 'off' && this.delay) this.delay.delayTime.setTargetAtTime((60 / BPM[this.song]) * 0.75, t, 0.1);
  }

  private schedule(t: number, step: number, spb: number): void {
    if (this.song === 'day') this.day(t, step, spb);
    else if (this.song === 'night') this.nightSong(t, step, spb);
    else if (this.song === 'storm') this.stormSong(t, step, spb);
    else if (this.song === 'mega') this.megaSong(t, step, spb);
    else if (this.song === 'kraken') this.krakenSong(t, step, spb);
  }

  private day(t: number, step: number, spb: number): void {
    const out = this.songG.day;
    const s = step % 16;
    const bar = Math.floor(step / 16);
    const sec = Math.floor(bar / 8) % 2; // 0 = A, 1 = B
    const loop = Math.floor(bar / 16);
    const bi = bar % 8;
    const ch = CH[(sec ? DAY_B : DAY_A)[bi]];
    const breath = loop % 3 === 2 && sec === 0;
    // ukulele: D . . . D . D U . . U . D . U .
    const strum: Record<number, number> = { 0: 1, 4: 1, 6: 1, 7: -1, 10: -1, 12: 1, 14: -1 };
    const dir = strum[s];
    if (dir) this.uke(out, t, ch.v, dir, dir > 0 ? (s === 0 ? 0.075 : 0.055) : 0.035);
    // baixo
    if (s === 0) this.bass(out, t, ch.b, spb * 5, 0.2);
    if (s === 6) this.bass(out, t, ch.b + 7, spb * 2, 0.12);
    if (s === 8) this.bass(out, t, ch.b + 12, spb * 3, 0.13);
    if (s === 14 && bi % 2 === 1) this.bass(out, t, ch.b + 10, spb * 2, 0.1);
    // percussão
    this.shaker(out, t, s % 4 === 2 ? 0.05 : s % 2 ? 0.018 : 0.03);
    if (s === 0 || (s === 8 && bi % 2 === 0)) this.kick(out, t, 0.18);
    if (s === 3 || s === 6 || (s === 14 && Math.random() < 0.7)) this.bongo(out, t, true, 0.12);
    if (s === 10 || s === 11) this.bongo(out, t, false, s === 10 ? 0.14 : 0.09);
    if (s === 12 && bi === 7) this.clave(out, t, 0.06);
    // melodia
    if (!breath && s % 2 === 0) {
      const ph = (sec ? MEL_B : MEL_A)[Math.floor(bi / 2)];
      const i = (bi % 2) * 8 + s / 2;
      const m = ph[i];
      if (m > 0) {
        let n = 1;
        while (i + n < 16 && ph[i + n] < 0) n++;
        const dur = Math.min(1.4, n * spb * 2 + 0.1);
        const steel = (sec + loop) % 2 === 1;
        if (steel) this.steel(out, t, m, dur, 0.1);
        else this.marimba(out, t, m, dur, 0.13);
        // harmonia (terça abaixo) na segunda volta da seção B
        if (sec === 1 && loop % 2 === 1 && s % 4 === 0) this.marimba(out, t, m - (ch.v.includes(m - 3) || ch.v.includes(m - 15) ? 3 : 4), dur, 0.05);
      }
    }
    // respiro: marimba arpejando baixinho
    if (breath && s % 4 === 2) this.marimba(out, t, ch.v[(s / 4 + bi) % 4] + 12, spb * 3, 0.05);
  }

  private nightSong(t: number, step: number, spb: number): void {
    const out = this.songG.night;
    const s = step % 16;
    const bar = Math.floor(step / 16);
    const c = NIGHT[Math.floor(bar / 2) % 4];
    if (s === 0 && bar % 2 === 0) this.pad(out, t, c.v.slice(0, 4), spb * 32, 0.035);
    if (s === 0) this.bass(out, t, c.b, spb * 12, 0.16, 500);
    // kalimba em arpejo com eco
    const arp = [0, 2, 1, 3, 2, 4, 3, 1];
    if (s % 2 === 0 && !(s === 14 && bar % 2)) this.kalimba(out, t, c.v[arp[(s / 2) % 8] % c.v.length] + 12, s === 0 ? 0.08 : 0.05);
    // caixinha de música (melodia) a cada 2 compassos, nas voltas ímpares
    if (s % 2 === 0 && Math.floor(bar / 8) % 2 === 1) {
      const ph = NIGHT_MEL[Math.floor(bar / 2) % 4];
      const i = (bar % 2) * 8 + s / 2;
      if (ph[i] > 0) this.bell(out, t, ph[i], 0.05);
    }
    if (s === 8 && bar % 2 === 1) this.clave(out, t, 0.025);
    if (s % 4 === 2) this.shaker(out, t, 0.008);
  }

  private stormSong(t: number, step: number, spb: number): void {
    const out = this.songG.storm;
    const s = step % 16;
    const bar = Math.floor(step / 16);
    const c = STORM[bar % 4];
    if (s === 0) this.pad(out, t, c.v, spb * 16, 0.03, 700);
    if (s % 2 === 0) this.bass(out, t, c.b + (s === 0 ? 0 : 12 * (s % 4 === 2 ? 1 : 0)), spb * 1.6, s === 0 ? 0.22 : 0.12, 380);
    if (s === 0 || s === 6 || s === 10) this.tom(out, t, s === 0 ? 70 : 95, s === 0 ? 0.3 : 0.18);
    if (s === 12 && bar % 2) this.tom(out, t, 120, 0.15);
    const ost = [0, 1, 2, 1];
    this.marimba(out, t, c.v[ost[s % 4]] + (s >= 8 ? 12 : 0), spb * 1.5, 0.035, true);
    this.shaker(out, t, s % 2 ? 0.012 : 0.025);
  }

  /* ----------------------------- instrumentos ----------------------------- */
  private env(g: GainNode, t: number, vol: number, a: number, d: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  private osc(type: OscillatorType | number, f: number, t: number, end: number, to: AudioNode, detune = 0): OscillatorNode {
    const o = this.ctx!.createOscillator();
    if (typeof type === 'number') o.setPeriodicWave(this.waves[type]);
    else o.type = type;
    o.frequency.value = f;
    o.detune.value = detune;
    o.connect(to);
    o.start(t);
    o.stop(end);
    return o;
  }
  /** batida de ukulele: cordas em sequência (para baixo = graves primeiro) */
  private uke(out: AudioNode, t: number, notes: number[], dir: number, vol: number): void {
    const ctx = this.ctx!;
    const ns = dir > 0 ? notes : [...notes].reverse().slice(0, 3);
    ns.forEach((m, i) => {
      const tt = t + i * rnd(0.011, 0.02);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(3800, tt);
      f.frequency.exponentialRampToValueAtTime(900, tt + 0.35);
      const g = ctx.createGain();
      this.env(g, tt, vol * rnd(0.85, 1.05), 0.004, 0.55);
      f.connect(g).connect(out);
      this.osc(0, mtof(m), tt, tt + 0.62, f, rnd(-6, 6));
    });
  }
  private marimba(out: AudioNode, t: number, m: number, dur: number, vol: number, muted = false): void {
    const ctx = this.ctx!;
    const f = mtof(m);
    const g = ctx.createGain();
    const d = muted ? 0.18 : Math.min(0.9, 0.35 + dur * 0.4);
    this.env(g, t, vol, 0.003, d);
    g.connect(out);
    if (!muted) g.connect(this.revIn!);
    this.osc('sine', f, t, t + d + 0.05, g);
    const g2 = ctx.createGain();
    this.env(g2, t, vol * 0.35, 0.002, 0.07);
    g2.connect(out);
    this.osc('sine', f * 4, t, t + 0.1, g2);
    if (!muted) {
      const g3 = ctx.createGain();
      this.env(g3, t, vol * 0.12, 0.001, 0.025);
      g3.connect(out);
      this.osc('sine', f * 9.8, t, t + 0.04, g3);
    }
  }
  private steel(out: AudioNode, t: number, m: number, dur: number, vol: number): void {
    const ctx = this.ctx!;
    const f = mtof(m);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(f * 7, t);
    lp.frequency.exponentialRampToValueAtTime(f * 2.2, t + 0.4);
    const g = ctx.createGain();
    const d = Math.min(1.2, 0.5 + dur * 0.5);
    this.env(g, t, vol, 0.006, d);
    lp.connect(g).connect(out);
    g.connect(this.delay!);
    g.connect(this.revIn!);
    this.osc(1, f, t, t + d + 0.05, lp);
    this.osc('sine', f * 2.005, t, t + d * 0.6, lp);
  }
  private kalimba(out: AudioNode, t: number, m: number, vol: number): void {
    const ctx = this.ctx!;
    const f = mtof(m);
    const g = ctx.createGain();
    this.env(g, t, vol, 0.003, 0.9);
    g.connect(out);
    g.connect(this.delay!);
    g.connect(this.revIn!);
    this.osc('sine', f, t, t + 1, g);
    const g2 = ctx.createGain();
    this.env(g2, t, vol * 0.25, 0.002, 0.12);
    g2.connect(g);
    this.osc('sine', f * 5.4, t, t + 0.15, g2);
  }
  private bell(out: AudioNode, t: number, m: number, vol: number): void {
    const ctx = this.ctx!;
    const f = mtof(m);
    for (const [k, v, d] of [
      [1, 1, 1.4],
      [2.76, 0.35, 0.6],
      [5.4, 0.15, 0.3],
    ] as const) {
      const g = ctx.createGain();
      this.env(g, t, vol * v, 0.002, d);
      g.connect(out);
      g.connect(this.revIn!);
      g.connect(this.delay!);
      this.osc('sine', f * k, t, t + d + 0.05, g);
    }
  }
  private bass(out: AudioNode, t: number, m: number, dur: number, vol: number, cut = 700): void {
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(cut * 1.6, t);
    lp.frequency.exponentialRampToValueAtTime(cut * 0.6, t + 0.2);
    const g = ctx.createGain();
    this.env(g, t, vol, 0.008, Math.max(0.15, dur));
    lp.connect(g).connect(out);
    this.osc(2, mtof(m), t, t + dur + 0.1, lp);
  }
  private pad(out: AudioNode, t: number, notes: number[], dur: number, vol: number, cut = 1100): void {
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cut;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(1.4, dur * 0.3));
    g.gain.setValueAtTime(vol, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.6);
    lp.connect(g).connect(out);
    g.connect(this.revIn!);
    for (const m of notes) {
      this.osc(3, mtof(m), t, t + dur + 0.7, lp, -7);
      this.osc(3, mtof(m), t, t + dur + 0.7, lp, 7);
    }
  }
  private noiseHit(out: AudioNode, t: number, vol: number, dur: number, type: BiquadFilterType, f0: number, f1 = f0, q = 1): void {
    const ctx = this.ctx!;
    if (!this.noise) return;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, vol, Math.min(0.01, dur * 0.2), dur);
    s.connect(f).connect(g).connect(out);
    s.start(t, Math.random() * 1.5, dur + 0.05);
  }
  private shaker(out: AudioNode, t: number, vol: number): void {
    this.noiseHit(out, t, vol * rnd(0.8, 1.15), 0.06, 'bandpass', 7200, 6800, 1.2);
  }
  private kick(out: AudioNode, t: number, vol: number): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    this.env(g, t, vol, 0.003, 0.22);
    g.connect(out);
    const o = this.osc('sine', 110, t, t + 0.26, g);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.18);
  }
  private bongo(out: AudioNode, t: number, hi: boolean, vol: number): void {
    const ctx = this.ctx!;
    const f0 = (hi ? 420 : 260) * rnd(0.97, 1.03);
    const g = ctx.createGain();
    this.env(g, t, vol, 0.002, hi ? 0.12 : 0.18);
    g.connect(out);
    const o = this.osc('sine', f0, t, t + 0.22, g);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.72, t + 0.1);
    this.noiseHit(out, t, vol * 0.25, 0.02, 'bandpass', 2400, 2400, 2);
  }
  private tom(out: AudioNode, t: number, f0: number, vol: number): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    this.env(g, t, vol, 0.004, 0.45);
    g.connect(out);
    g.connect(this.revIn!);
    const o = this.osc('sine', f0 * 1.6, t, t + 0.5, g);
    o.frequency.exponentialRampToValueAtTime(f0, t + 0.12);
    this.noiseHit(out, t, vol * 0.3, 0.08, 'lowpass', 900, 300);
  }
  private clave(out: AudioNode, t: number, vol: number): void {
    const ctx = this.ctx!;
    for (const f of [2500, 1720]) {
      const g = ctx.createGain();
      this.env(g, t, vol, 0.001, 0.06);
      g.connect(out);
      g.connect(this.revIn!);
      this.osc('sine', f * rnd(0.98, 1.02), t, t + 0.08, g);
    }
  }

  /* ------------------------------ ducking ------------------------------ */
  duck(amount = 0.55, hold = 0.6): void {
    if (this.offline || !this.ctx) return;
    engine.duck(amount, hold);
  }

  /* ============================== vinhetas ============================== */
  private now(): number {
    if (this.offline) return this.t0;
    return this.ctx ? this.ctx.currentTime + 0.02 : 0;
  }
  private get okFx(): boolean {
    return !!this.ctx && !this.dead && (this.offline || save.sound);
  }
  /** ilha à vista: marimba + steel subindo e brilho */
  jingleIsland(): void {
    if (!this.okFx) return;
    const t = this.now();
    this.duck(0.75, 2.2);
    const out = this.ui!;
    [72, 77, 81, 84].forEach((m, i) => this.marimba(out, t + i * 0.12, m, 0.5, 0.16));
    [77, 81, 84, 89].forEach((m, i) => this.steel(out, t + 0.5 + i * 0.08, m, 1.2, 0.08));
    this.bell(out, t + 0.9, 96, 0.05);
    this.shaker(out, t + 0.5, 0.06);
    this.shaker(out, t + 0.62, 0.04);
  }
  /** receita feita: sininho de 3 notas */
  chime(): void {
    if (!this.okFx) return;
    const t = this.now();
    this.duck(0.3, 0.4);
    const base = pick([84, 86, 88]);
    [0, 4, 7].forEach((d, i) => this.bell(this.ui!, t + i * 0.07, base + d, 0.07));
  }
  /** nível novo (fogueira, missão grande) */
  fanfare(): void {
    if (!this.okFx) return;
    const t = this.now();
    this.duck(0.8, 2);
    const out = this.ui!;
    [65, 69, 72].forEach((m, i) => this.steel(out, t + i * 0.1, m + 12, 0.4, 0.09));
    this.steel(out, t + 0.3, 89, 1.4, 0.1);
    this.pad(out, t + 0.3, [65, 69, 72, 77], 1.1, 0.05, 2200);
    this.bass(out, t + 0.3, 41, 1, 0.2);
    for (let i = 0; i < 6; i++) this.marimba(out, t + 0.3 + i * 0.05, 84 + [0, 4, 7, 12, 16, 19][i], 0.3, 0.05);
    this.kick(out, t + 0.3, 0.2);
  }
  /** missão cumprida: moedinhas + sino */
  mission(): void {
    if (!this.okFx) return;
    const t = this.now();
    this.duck(0.5, 1);
    [88, 91, 96].forEach((m, i) => this.bell(this.ui!, t + i * 0.09, m, 0.06));
    for (let i = 0; i < 4; i++) this.coinTick(t + 0.3 + i * 0.06, 1800 + i * 220);
  }
  private coinTick(t: number, f: number): void {
    const g = this.ctx!.createGain();
    this.env(g, t, 0.06, 0.002, 0.12);
    g.connect(this.ui!);
    this.osc('square', f, t, t + 0.14, this.lp(g, 4000));
  }
  private lp(to: AudioNode, f: number): BiquadFilterNode {
    const n = this.ctx!.createBiquadFilter();
    n.type = 'lowpass';
    n.frequency.value = f;
    n.connect(to);
    return n;
  }
  dawn(): void {
    if (!this.okFx) return;
    const t = this.now();
    this.duck(0.6, 1.5);
    [65, 69, 72, 77, 81].forEach((m, i) => this.marimba(this.ui!, t + i * 0.09, m, 0.6, 0.11));
    this.bell(this.ui!, t + 0.5, 89, 0.05);
  }
  dusk(): void {
    if (!this.okFx) return;
    const t = this.now();
    this.duck(0.5, 1.5);
    [81, 77, 74, 69].forEach((m, i) => this.kalimba(this.ui!, t + i * 0.16, m, 0.08));
  }
  /** tubarão chegando: tímpano grave + subida (não é susto, é aviso) */
  sharkWarn(): void {
    if (!this.okFx) return;
    const t = this.now();
    this.duck(0.6, 1.8);
    this.tom(this.ui!, t, 55, 0.35);
    this.tom(this.ui!, t + 0.45, 55, 0.3);
    this.tom(this.ui!, t + 0.7, 62, 0.32);
    this.noiseHit(this.ui!, t + 0.7, 0.05, 0.9, 'bandpass', 300, 2000, 2);
  }

  /* ============================== efeitos 3D ============================== */
  private listenerPos = { x: 0, y: 0, z: 0 };
  /** filtro na saída dos efeitos (sfx) do motor do app: abafa tudo debaixo d'água; desfeito ao sair */
  private muf: BiquadFilterNode | null = null;
  private mufOn = false;
  private muffle(on: boolean): void {
    const ctx = this.ctx;
    if (!ctx || this.offline) return;
    const eng = engine as unknown as { sfxGain?: GainNode; master?: GainNode };
    if (!eng.sfxGain || !eng.master) return;
    if (on && !this.muf) {
      try {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 18000;
        f.Q.value = 0.5;
        eng.sfxGain.disconnect(eng.master);
        eng.sfxGain.connect(f).connect(eng.master);
        this.muf = f;
      } catch {
        return;
      }
    }
    if (this.muf && on !== this.mufOn) {
      this.mufOn = on;
      this.muf.frequency.setTargetAtTime(on ? 900 : 18000, ctx.currentTime, 0.12);
    }
  }
  private unmuffle(): void {
    const eng = engine as unknown as { sfxGain?: GainNode; master?: GainNode };
    if (!this.muf || !eng.sfxGain || !eng.master) return;
    try {
      eng.sfxGain.disconnect(this.muf);
      this.muf.disconnect();
      eng.sfxGain.connect(eng.master);
    } catch {
      /* */
    }
    this.muf = null;
    this.mufOn = false;
  }
  /** posiciona o ouvinte (câmera) */
  listener(p: V3): void {
    this.listenerPos = { x: p.x, y: p.y, z: p.z };
  }
  /** saída posicional (null = som "na cabeça") */
  private at(p: V3 | null, ref = 3, max = 70): AudioNode | null {
    const ctx = this.ctx;
    if (!ctx || !this.world) return null;
    if (!p || this.offline) return this.world;
    const lp = this.listenerPos;
    if (Math.hypot(p.x - lp.x, p.y - lp.y, p.z - lp.z) > max) return null;
    const pn = ctx.createPanner();
    pn.panningModel = this.hq ? 'HRTF' : 'equalpower';
    pn.distanceModel = 'inverse';
    pn.refDistance = ref;
    pn.rolloffFactor = 1.1;
    pn.maxDistance = max;
    if (pn.positionX) {
      pn.positionX.value = p.x;
      pn.positionY.value = p.y;
      pn.positionZ.value = p.z;
    } else (pn as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(p.x, p.y, p.z);
    pn.connect(this.world);
    window.setTimeout(() => pn.disconnect(), 4000);
    return pn;
  }
  /** evita metralhar o mesmo som (ms) */
  private gate(k: string, ms: number): boolean {
    if (this.offline) return true;
    const n = performance.now();
    if (n - (this.lastHit.get(k) ?? 0) < ms) return false;
    this.lastHit.set(k, n);
    return true;
  }

  /** gancho saindo: vupt + corda desenrolando */
  throwHook(power: number): void {
    if (!this.okFx) return;
    const t = this.now();
    const out = this.world!;
    this.noiseHit(out, t, 0.12 + power * 0.1, 0.32, 'bandpass', 500, 2200 + power * 800, 1.6);
    const n = 6 + Math.round(power * 8);
    for (let i = 0; i < n; i++) this.click(out, t + 0.08 + i * (0.035 + i * 0.006), 0.025 * (1 - i / n), 2600);
  }
  private click(out: AudioNode, t: number, vol: number, f: number): void {
    this.noiseHit(out, t, vol, 0.012, 'bandpass', f * rnd(0.9, 1.1), f, 4);
  }
  /** respingo (tamanho 0..1) */
  splash(p: V3 | null, size = 0.5): void {
    if (!this.okFx || !this.gate('spl' + Math.round((p?.x ?? 0) / 2), 90)) return;
    const out = this.at(p, 3 + size * 4);
    if (!out) return;
    const t = this.now();
    this.noiseHit(out, t, 0.12 + size * 0.22, 0.18 + size * 0.45, 'lowpass', 2400 + size * 1500, 380, 0.7);
    this.noiseHit(out, t + 0.03, 0.05 + size * 0.06, 0.12 + size * 0.2, 'bandpass', 1300, 700, 1.2);
    const nd = 3 + Math.round(size * 5);
    for (let i = 0; i < nd; i++) {
      const tt = t + 0.06 + Math.random() * (0.25 + size * 0.3);
      const g = this.ctx!.createGain();
      this.env(g, tt, 0.03 * (0.6 + size), 0.002, 0.05);
      g.connect(out);
      const o = this.osc('sine', rnd(900, 2200), tt, tt + 0.07, g);
      o.frequency.exponentialRampToValueAtTime(rnd(1800, 3200), tt + 0.04);
    }
  }
  /** catraca do carretel (chamar a cada clique) */
  reel(speed: number): void {
    if (!this.okFx) return;
    const t = this.now();
    this.click(this.ui!, t, 0.03 + speed * 0.02, 3400);
    this.click(this.ui!, t + 0.004, 0.012, 1600);
  }
  /** pegou um item: "pop" com altura por tipo */
  pop(kind = 0): void {
    if (!this.okFx) return;
    const t = this.now();
    const f0 = [520, 620, 740, 420, 880][kind % 5] * rnd(0.93, 1.08);
    const g = this.ctx!.createGain();
    this.env(g, t, 0.13, 0.003, 0.13);
    g.connect(this.ui!);
    const o = this.osc('sine', f0, t, t + 0.16, g);
    o.frequency.exponentialRampToValueAtTime(f0 * 1.9, t + 0.07);
    this.noiseHit(this.ui!, t, 0.04, 0.03, 'highpass', 3000);
    // brilhinho
    const g2 = this.ctx!.createGain();
    this.env(g2, t + 0.06, 0.03, 0.002, 0.15);
    g2.connect(this.ui!);
    this.osc('sine', f0 * 3, t + 0.06, t + 0.22, g2);
  }
  /** martelada na madeira (construir/consertar) */
  hammer(p: V3 | null, n = 2): void {
    if (!this.okFx) return;
    const out = this.at(p, 4);
    if (!out) return;
    const t = this.now();
    for (let i = 0; i < n; i++) {
      const tt = t + i * rnd(0.16, 0.21);
      const k = rnd(0.85, 1.18);
      this.noiseHit(out, tt, 0.22, 0.07, 'bandpass', 900 * k, 650 * k, 3);
      const g = this.ctx!.createGain();
      this.env(g, tt, 0.22, 0.002, 0.12);
      g.connect(out);
      const o = this.osc('triangle', 210 * k, tt, tt + 0.15, g);
      o.frequency.exponentialRampToValueAtTime(130 * k, tt + 0.1);
      // "tóc" agudo do prego
      this.noiseHit(out, tt, 0.05, 0.02, 'bandpass', 3200 * k, 3200 * k, 6);
    }
  }
  /** peça colocada: tum de madeira + rangido */
  place(p: V3 | null): void {
    if (!this.okFx) return;
    const out = this.at(p, 4);
    if (!out) return;
    const t = this.now();
    const k = rnd(0.9, 1.1);
    const g = this.ctx!.createGain();
    this.env(g, t, 0.28, 0.004, 0.3);
    g.connect(out);
    const o = this.osc('sine', 140 * k, t, t + 0.35, g);
    o.frequency.exponentialRampToValueAtTime(70 * k, t + 0.25);
    this.noiseHit(out, t, 0.12, 0.15, 'lowpass', 1200, 300);
    this.creak(out, t + 0.12, 0.035);
  }
  creak(out: AudioNode, t: number, vol: number): void {
    const g = this.ctx!.createGain();
    this.env(g, t, vol, 0.04, 0.35);
    const bp = this.ctx!.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = rnd(600, 900);
    bp.Q.value = 6;
    bp.connect(g).connect(out);
    const o = this.osc('sawtooth', rnd(70, 110), t, t + 0.42, bp);
    o.frequency.linearRampToValueAtTime(rnd(90, 140), t + 0.35);
  }
  /** rangido da jangada (ambiente) */
  raftCreak(p: V3): void {
    if (!this.okFx || !this.gate('creak', 2500)) return;
    const out = this.at(p, 4);
    if (out) this.creak(out, this.now(), 0.02 + this.storm * 0.03);
  }
  /** peça quebrou */
  crack(p: V3 | null): void {
    if (!this.okFx) return;
    const out = this.at(p, 5);
    if (!out) return;
    const t = this.now();
    this.duck(0.4, 0.6);
    for (let i = 0; i < 5; i++) this.noiseHit(out, t + i * rnd(0.02, 0.05), 0.2, 0.06, 'bandpass', rnd(900, 2400), 600, 2);
    this.noiseHit(out, t, 0.2, 0.5, 'lowpass', 800, 120);
    this.splash(p, 0.7);
  }
  /** passo (madeira / ilha / água) */
  step(surface: 'wood' | 'sand' | 'water', vol = 1): void {
    if (!this.okFx) return;
    const t = this.now();
    const out = this.world!;
    if (surface === 'wood') {
      const k = rnd(0.85, 1.15);
      this.noiseHit(out, t, 0.06 * vol, 0.06, 'bandpass', 500 * k, 300 * k, 2);
      const g = this.ctx!.createGain();
      this.env(g, t, 0.07 * vol, 0.003, 0.08);
      g.connect(out);
      this.osc('sine', 120 * k, t, t + 0.1, g);
    } else if (surface === 'sand') this.noiseHit(out, t, 0.05 * vol, 0.09, 'bandpass', 2600, 1800, 1);
    else this.noiseHit(out, t, 0.07 * vol, 0.25, 'lowpass', 1400, 400, 0.8);
  }
  jump(): void {
    if (!this.okFx) return;
    this.noiseHit(this.world!, this.now(), 0.05, 0.12, 'bandpass', 700, 1400, 1);
  }
  land(hard: number): void {
    if (!this.okFx) return;
    const t = this.now();
    const g = this.ctx!.createGain();
    this.env(g, t, 0.1 + hard * 0.12, 0.003, 0.15);
    g.connect(this.world!);
    this.osc('sine', 100, t, t + 0.18, g);
    this.noiseHit(this.world!, t, 0.06 + hard * 0.05, 0.08, 'lowpass', 900, 300);
  }
  /** mergulho / entrar na água */
  plunge(): void {
    if (!this.okFx) return;
    this.splash(null, 0.9);
    this.bubbles(8);
  }
  bubbles(n = 4): void {
    if (!this.okFx) return;
    const t = this.now();
    for (let i = 0; i < n; i++) {
      const tt = t + Math.random() * 0.6;
      const g = this.ctx!.createGain();
      this.env(g, tt, 0.04, 0.003, 0.06);
      g.connect(this.ui!);
      const f = rnd(300, 900);
      const o = this.osc('sine', f, tt, tt + 0.08, g);
      o.frequency.exponentialRampToValueAtTime(f * 2.2, tt + 0.06);
    }
  }
  /** nadar (braçada) */
  stroke(): void {
    if (!this.okFx) return;
    this.noiseHit(this.world!, this.now(), 0.05, 0.3, 'bandpass', 900, 500, 0.9);
  }
  /** golpe no ar (lança / machado) */
  swing(): void {
    if (!this.okFx) return;
    this.noiseHit(this.ui!, this.now(), 0.08, 0.16, 'bandpass', 600, 1800, 1.4);
  }
  /** machado na árvore / pedra */
  chop(p: V3 | null, stone = false): void {
    if (!this.okFx) return;
    const out = this.at(p, 4);
    if (!out) return;
    const t = this.now();
    const k = rnd(0.9, 1.12);
    if (stone) {
      for (const f of [1900, 2700, 3900]) {
        const g = this.ctx!.createGain();
        this.env(g, t, 0.06, 0.001, 0.25);
        g.connect(out);
        this.osc('sine', f * k, t, t + 0.3, g);
      }
      this.noiseHit(out, t, 0.12, 0.05, 'highpass', 2000);
    } else {
      this.noiseHit(out, t, 0.2, 0.09, 'bandpass', 1100 * k, 800 * k, 3);
      const g = this.ctx!.createGain();
      this.env(g, t, 0.18, 0.002, 0.16);
      g.connect(out);
      this.osc('triangle', 330 * k, t, t + 0.2, g);
    }
  }
  /** árvore caindo */
  timber(p: V3 | null): void {
    if (!this.okFx) return;
    const out = this.at(p, 6);
    if (!out) return;
    const t = this.now();
    this.creak(out, t, 0.06);
    this.creak(out, t + 0.3, 0.05);
    this.noiseHit(out, t + 0.8, 0.3, 0.6, 'lowpass', 600, 80);
    this.noiseHit(out, t + 0.8, 0.12, 0.4, 'bandpass', 2400, 1200, 1);
  }
  /** comer: nhac nhac */
  eat(): void {
    if (!this.okFx) return;
    const t = this.now();
    for (let i = 0; i < 3; i++) {
      const tt = t + i * rnd(0.17, 0.22);
      this.noiseHit(this.ui!, tt, 0.1, 0.07, 'bandpass', rnd(700, 1200), 500, 1.6);
      for (let j = 0; j < 3; j++) this.noiseHit(this.ui!, tt + j * 0.015, 0.04, 0.012, 'bandpass', rnd(2000, 3500), 2000, 3);
    }
    const g = this.ctx!.createGain();
    this.env(g, t + 0.7, 0.06, 0.02, 0.2);
    g.connect(this.ui!);
    const o = this.osc('triangle', 300, t + 0.7, t + 0.95, g);
    o.frequency.linearRampToValueAtTime(420, t + 0.85);
  }
  /** beber: glub glub */
  drink(): void {
    if (!this.okFx) return;
    const t = this.now();
    for (let i = 0; i < 3; i++) {
      const tt = t + i * rnd(0.22, 0.28);
      const g = this.ctx!.createGain();
      this.env(g, tt, 0.11, 0.005, 0.1);
      g.connect(this.ui!);
      const f = rnd(380, 460);
      const o = this.osc('sine', f, tt, tt + 0.13, g);
      o.frequency.exponentialRampToValueAtTime(f * 0.55, tt + 0.1);
    }
    this.bubbles(3);
  }
  /** aaah (satisfeito) */
  ahh(): void {
    if (!this.okFx) return;
    const t = this.now() + 0.9;
    const g = this.ctx!.createGain();
    this.env(g, t, 0.05, 0.05, 0.4);
    const bp = this.ctx!.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 3;
    bp.connect(g).connect(this.ui!);
    const o = this.osc('sawtooth', 330, t, t + 0.5, bp);
    o.frequency.linearRampToValueAtTime(260, t + 0.45);
  }
  /** ferver / chiar (assando, purificador) */
  sizzle(p: V3 | null, vol = 1): void {
    if (!this.okFx || !this.gate('sz', 300)) return;
    const out = this.at(p, 2, 25);
    if (!out) return;
    const t = this.now();
    this.noiseHit(out, t, 0.03 * vol, 0.4, 'highpass', 5000, 4000, 0.7);
    for (let i = 0; i < 4; i++) this.click(out, t + Math.random() * 0.35, 0.025 * vol, rnd(3000, 6000));
  }
  boil(p: V3 | null): void {
    if (!this.okFx || !this.gate('boil', 400)) return;
    const out = this.at(p, 2, 25);
    if (!out) return;
    const t = this.now();
    for (let i = 0; i < 5; i++) {
      const tt = t + Math.random() * 0.4;
      const g = this.ctx!.createGain();
      this.env(g, tt, 0.04, 0.002, 0.04);
      g.connect(out);
      const f = rnd(500, 1100);
      const o = this.osc('sine', f, tt, tt + 0.06, g);
      o.frequency.exponentialRampToValueAtTime(f * 1.6, tt + 0.04);
    }
  }
  /** fogo pegando / alimentar a fogueira */
  whoosh(p: V3 | null): void {
    if (!this.okFx) return;
    const out = this.at(p, 3);
    if (!out) return;
    this.noiseHit(out, this.now(), 0.16, 0.6, 'lowpass', 400, 1600, 0.8);
  }
  /** pano da vela */
  flap(p: V3 | null): void {
    if (!this.okFx) return;
    const out = this.at(p, 4);
    if (!out) return;
    const t = this.now();
    for (let i = 0; i < 4; i++) this.noiseHit(out, t + i * rnd(0.07, 0.11), 0.14 * (1 - i * 0.2), 0.08, 'bandpass', rnd(500, 900), 300, 1);
  }
  /** corrente da âncora */
  chain(p: V3 | null, down: boolean): void {
    if (!this.okFx) return;
    const out = this.at(p, 4);
    if (!out) return;
    const t = this.now();
    for (let i = 0; i < 14; i++) {
      const tt = t + i * (0.05 + Math.random() * 0.02);
      for (const f of [2100, 3300]) {
        const g = this.ctx!.createGain();
        this.env(g, tt, 0.03, 0.001, 0.07);
        g.connect(out);
        this.osc('sine', f * rnd(0.9, 1.1), tt, tt + 0.08, g);
      }
    }
    if (down) this.splash(p, 0.7);
  }
  /** tubarão: barbatana cortando a água */
  fin(p: V3): void {
    if (!this.okFx || !this.gate('fin', 1300)) return;
    const out = this.at(p, 5, 50);
    if (!out) return;
    this.noiseHit(out, this.now(), 0.08, 0.9, 'bandpass', 700, 1400, 1.2);
  }
  /** mordida na madeira */
  bite(p: V3): void {
    if (!this.okFx) return;
    const out = this.at(p, 6);
    if (!out) return;
    const t = this.now();
    this.duck(0.5, 0.8);
    const g = this.ctx!.createGain();
    this.env(g, t, 0.35, 0.003, 0.25);
    g.connect(out);
    const o = this.osc('sine', 95, t, t + 0.3, g);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.2);
    for (let i = 0; i < 7; i++) this.noiseHit(out, t + 0.02 + i * rnd(0.018, 0.035), 0.16, 0.03, 'bandpass', rnd(1200, 2600), 900, 2.5);
    this.creak(out, t + 0.15, 0.06);
    this.splash(p, 0.6);
  }
  /** mordida em você (nadando) */
  chomp(): void {
    if (!this.okFx) return;
    const t = this.now();
    this.duck(0.6, 0.8);
    const g = this.ctx!.createGain();
    this.env(g, t, 0.4, 0.002, 0.18);
    g.connect(this.ui!);
    const o = this.osc('square', 140, t, t + 0.2, this.lp(g, 600));
    o.frequency.exponentialRampToValueAtTime(60, t + 0.15);
    this.noiseHit(this.ui!, t, 0.2, 0.1, 'bandpass', 1600, 900, 2);
  }
  /** tubarão levou uma lançada: "bonc" + "uuh!" bobo */
  sharkHurt(p: V3): void {
    if (!this.okFx) return;
    const out = this.at(p, 6) ?? this.world!;
    const t = this.now();
    const g = this.ctx!.createGain();
    this.env(g, t, 0.25, 0.002, 0.25);
    g.connect(out);
    const o = this.osc('triangle', 520, t, t + 0.3, g);
    o.frequency.exponentialRampToValueAtTime(260, t + 0.25);
    this.voice(out, t + 0.12, 260, 160, 0.5, 'oo', 0.09);
    this.splash(p, 0.8);
  }
  /** voz de formantes (bichinhos) */
  private voice(out: AudioNode, t: number, f0: number, f1: number, dur: number, vow: 'oo' | 'ee' | 'ah', vol: number): void {
    const ctx = this.ctx!;
    const F: Record<string, [number, number]> = { oo: [350, 800], ee: [400, 2300], ah: [800, 1200] };
    const g = ctx.createGain();
    this.env(g, t, vol, 0.03, dur);
    g.connect(out);
    const src = ctx.createGain();
    for (const fq of F[vow]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = fq;
      bp.Q.value = 5;
      src.connect(bp).connect(g);
    }
    const o = this.osc('sawtooth', f0, t, t + dur + 0.05, src);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const vib = ctx.createOscillator();
    vib.frequency.value = 6;
    const vg = ctx.createGain();
    vg.gain.value = f0 * 0.03;
    vib.connect(vg).connect(o.frequency);
    vib.start(t);
    vib.stop(t + dur + 0.05);
  }
  /** fantasma: "buuu" ondulado */
  boo(p: V3 | null): void {
    if (!this.okFx || !this.gate('boo', 1500)) return;
    const out = this.at(p, 5, 60) ?? this.world!;
    const t = this.now();
    this.voice(out, t, 300, 210, 1.1, 'oo', 0.12);
    const g = this.ctx!.createGain();
    this.env(g, t, 0.04, 0.2, 1);
    g.connect(this.revIn!);
    this.osc('sine', 600, t, t + 1.3, g);
  }
  /** fantasma rindo: "hi hi hi" */
  giggle(p: V3 | null): void {
    if (!this.okFx || !this.gate('gig', 1200)) return;
    const out = this.at(p, 5, 60) ?? this.world!;
    const t = this.now();
    for (let i = 0; i < 4; i++) {
      const f = 720 - i * 50 + rnd(-20, 20);
      this.voice(out, t + i * 0.13, f, f * 0.85, 0.1, 'ee', 0.1);
    }
  }
  /** fantasma espantado: "uiii!" subindo */
  ghostScared(p: V3 | null): void {
    if (!this.okFx) return;
    const out = this.at(p, 6, 70) ?? this.world!;
    const t = this.now();
    this.voice(out, t, 500, 1300, 0.6, 'ee', 0.13);
    this.bell(this.ui!, t + 0.1, 96, 0.04);
  }
  /** gaivota (3D, longe) */
  gull(p: V3): void {
    if (!this.okFx) return;
    const out = this.at(p, 12, 120);
    if (!out) return;
    const t = this.now();
    const n = 2 + Math.floor(Math.random() * 3);
    const base = rnd(1200, 1700);
    for (let i = 0; i < n; i++) {
      const tt = t + i * rnd(0.22, 0.3);
      const ctx = this.ctx!;
      const g = ctx.createGain();
      this.env(g, tt, 0.05, 0.02, 0.2);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2400;
      bp.Q.value = 1.4;
      bp.connect(g).connect(out);
      const o = this.osc('sawtooth', base, tt, tt + 0.26, bp);
      o.frequency.setValueAtTime(base, tt);
      o.frequency.linearRampToValueAtTime(base * 1.45, tt + 0.06);
      o.frequency.exponentialRampToValueAtTime(base * 0.8, tt + 0.22);
    }
  }
  thunder(dist: number): void {
    if (!this.okFx) return;
    const t = this.now() + dist * 0.003;
    this.duck(0.4, 2);
    this.noiseHit(this.world!, t, 0.25, 0.08, 'highpass', 1500);
    this.noiseHit(this.world!, t, 0.5, 2.8, 'lowpass', 380, 60, 0.6);
    this.noiseHit(this.world!, t + 0.4, 0.3, 2, 'lowpass', 240, 50, 0.6);
  }
  /** pescaria: isca mexendo / peixe fisgou */
  bobber(): void {
    if (!this.okFx) return;
    const t = this.now();
    for (let i = 0; i < 2; i++) {
      const g = this.ctx!.createGain();
      this.env(g, t + i * 0.14, 0.09, 0.004, 0.1);
      g.connect(this.ui!);
      const o = this.osc('sine', 500, t + i * 0.14, t + i * 0.14 + 0.12, g);
      o.frequency.exponentialRampToValueAtTime(260, t + i * 0.14 + 0.1);
    }
  }
  /** acertou o tempo da pesca */
  goodTap(): void {
    if (!this.okFx) return;
    const t = this.now();
    [88, 93].forEach((m, i) => this.bell(this.ui!, t + i * 0.06, m, 0.06));
  }
  /** errou: plim descendo suave */
  miss(): void {
    if (!this.okFx) return;
    const t = this.now();
    const g = this.ctx!.createGain();
    this.env(g, t, 0.08, 0.005, 0.3);
    g.connect(this.ui!);
    const o = this.osc('triangle', 520, t, t + 0.35, g);
    o.frequency.exponentialRampToValueAtTime(300, t + 0.3);
  }
  /** botões/abas */
  ui1(): void {
    if (!this.okFx) return;
    const t = this.now();
    const g = this.ctx!.createGain();
    this.env(g, t, 0.07, 0.002, 0.06);
    g.connect(this.ui!);
    this.osc('sine', rnd(900, 1000), t, t + 0.08, g);
  }
  /** não dá (falta material) */
  nope(): void {
    if (!this.okFx || !this.gate('nope', 250)) return;
    const t = this.now();
    for (let i = 0; i < 2; i++) {
      const g = this.ctx!.createGain();
      this.env(g, t + i * 0.1, 0.07, 0.004, 0.09);
      g.connect(this.ui!);
      this.osc('triangle', 300 - i * 60, t + i * 0.1, t + i * 0.1 + 0.11, g);
    }
  }
  /** levou dano */
  hurt(): void {
    if (!this.okFx || !this.gate('hurt', 400)) return;
    const t = this.now();
    this.voice(this.ui!, t, 420, 300, 0.22, 'ah', 0.07);
  }
  /** aviso suave de fome/sede */
  warn(): void {
    if (!this.okFx) return;
    const t = this.now();
    this.bell(this.ui!, t, 81, 0.04);
    this.bell(this.ui!, t + 0.18, 76, 0.035);
  }
  /** plantinha cresceu / colheu */
  sparkle(): void {
    if (!this.okFx) return;
    const t = this.now();
    for (let i = 0; i < 5; i++) this.bell(this.ui!, t + i * 0.05, 96 + [0, 3, 7, 10, 12][i], 0.025);
  }
  /** dormir: canção de ninar curtinha */
  lullaby(): void {
    if (!this.okFx) return;
    const t = this.now();
    this.duck(0.9, 3);
    [76, 79, 74, 76, 72].forEach((m, i) => this.kalimba(this.ui!, t + i * 0.35, m, 0.09));
  }

  /* ============================== ambiente ============================== */
  private startAmbience(): void {
    const ctx = this.ctx!;
    if (!this.noise) return;
    const mk = (ch: number) => {
      const s = ctx.createBufferSource();
      s.buffer = this.noise;
      s.loop = true;
      const split = ctx.createChannelSplitter(2);
      s.connect(split);
      const g = ctx.createGain();
      split.connect(g, ch);
      s.start(ctx.currentTime, Math.random() * 1.8);
      return { s, g };
    };
    const srcs: AudioBufferSourceNode[] = [];
    // ondas: 2 camadas (esquerda/direita) com filtro passa-baixa ondulando
    const waveG: GainNode[] = [];
    const waveF: BiquadFilterNode[] = [];
    for (let i = 0; i < 2; i++) {
      const { s, g } = mk(i);
      srcs.push(s);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 600;
      f.Q.value = 0.4;
      const og = ctx.createGain();
      og.gain.value = 0.0001;
      const pan = ctx.createStereoPanner();
      pan.pan.value = i ? 0.7 : -0.7;
      g.connect(f).connect(og).connect(pan).connect(this.world!);
      waveG.push(og);
      waveF.push(f);
    }
    // vento
    const w = mk(0);
    srcs.push(w.s);
    const windF = ctx.createBiquadFilter();
    windF.type = 'bandpass';
    windF.frequency.value = 700;
    windF.Q.value = 0.9;
    const windG = ctx.createGain();
    windG.gain.value = 0.0001;
    w.g.connect(windF).connect(windG).connect(this.world!);
    // chuva
    const r = mk(1);
    srcs.push(r.s);
    const rainF = ctx.createBiquadFilter();
    rainF.type = 'highpass';
    rainF.frequency.value = 2500;
    const rainG = ctx.createGain();
    rainG.gain.value = 0.0001;
    r.g.connect(rainF).connect(rainG).connect(this.world!);
    this.amb = { waveG, waveF, windG, windF, rainG, rainF, srcs };
  }
  /** a cada tique do sequenciador: ondas que vão e vêm, vento, chuva, batidas na madeira, gaivotas */
  private ambience(): void {
    const ctx = this.ctx;
    const a = this.amb;
    if (!ctx || !a) return;
    const t = ctx.currentTime;
    const dt = 0.05;
    this.ambT -= dt;
    const st = this.storm;
    if (this.ambT <= 0) {
      this.ambT = rnd(0.7, 1.9) * (1 - st * 0.4);
      a.waveG.forEach((g, i) => {
        const v = (0.05 + st * 0.12) * rnd(0.35, 1.1) * (this.underwater ? 0.5 : 1);
        g.gain.setTargetAtTime(v, t + i * rnd(0, 0.5), rnd(0.25, 0.6));
        a.waveF[i].frequency.setTargetAtTime(rnd(380, 900) * (1 + st * 0.8), t, 0.5);
      });
      a.windF.frequency.setTargetAtTime(rnd(450, 1100) * (1 + st * 0.5), t, 0.8);
      a.windG.gain.setTargetAtTime((0.008 + st * 0.06) * rnd(0.5, 1.2) * (this.underwater ? 0.2 : 1), t, 0.9);
      a.rainG.gain.setTargetAtTime(st > 0.35 ? (st - 0.3) * 0.09 * (this.underwater ? 0.2 : 1) : 0.0001, t, 1.2);
    }
    // embaixo d'água: tudo abafado (ambiente e também os efeitos do motor de áudio)
    this.uw?.frequency.setTargetAtTime(this.underwater ? 650 : 18000, t, 0.12);
    this.muffle(this.underwater);
    // água batendo na madeira
    this.slapT -= dt;
    if (this.slapT <= 0 && save.sound) {
      this.slapT = rnd(0.8, 2.6) * (1 - st * 0.5);
      const ang = Math.random() * Math.PI * 2;
      const L = this.listenerPos;
      const out = this.at({ x: L.x + Math.cos(ang) * 3, y: L.y - 1.5, z: L.z + Math.sin(ang) * 3 }, 2, 20);
      if (out) {
        const tt = t + 0.02;
        this.noiseHit(out, tt, (0.05 + st * 0.08) * rnd(0.6, 1.2), rnd(0.2, 0.4), 'bandpass', rnd(300, 700), 220, 1.3);
        if (Math.random() < 0.4) this.noiseHit(out, tt + 0.08, 0.03, 0.15, 'lowpass', 1800, 500);
      }
    }
    // gaivotas de dia
    this.gullT -= dt;
    if (this.gullT <= 0) {
      this.gullT = rnd(9, 22);
      if (this.night < 0.5 && st < 0.4 && !this.underwater) {
        const ang = Math.random() * Math.PI * 2;
        const L = this.listenerPos;
        this.gull({ x: L.x + Math.cos(ang) * 30, y: L.y + 14, z: L.z + Math.sin(ang) * 30 });
      }
    }
    // fogueiras: estalinhos 3D
    for (const f of this.fires) {
      f.t -= dt;
      if (f.t > 0 || !save.sound) continue;
      f.t = rnd(0.06, 0.32) / (0.6 + f.lv * 0.4);
      const out = this.at(f.p, 1.5, 22);
      if (!out) continue;
      const tt = t + Math.random() * 0.05;
      this.noiseHit(out, tt, rnd(0.03, 0.09) * (0.7 + f.lv * 0.2), rnd(0.008, 0.02), 'bandpass', rnd(1800, 5200), 1500, 2);
      if (Math.random() < 0.15) this.noiseHit(out, tt, 0.035, 0.35, 'lowpass', 300, 150);
    }
  }
  /* ============================== v2: chefes, QTE, barcos, donos ============================== */
  /** "MAR BRAVO" (Megalodonte, Ré menor, 132 bpm): baixo pulsando em semicolcheias, tambores, metais curtos e melodia heroica */
  private megaSong(t: number, step: number, spb: number): void {
    const out = this.songG.mega;
    const s = step % 16;
    const bar = Math.floor(step / 16);
    const prog = [38, 38, 34, 36, 38, 38, 41, 40];
    const root = prog[bar % 8];
    // ostinato
    const pat = [0, 0, 12, 0, 0, 12, 0, 7, 0, 0, 12, 0, 10, 0, 7, 0];
    this.bass(out, t, root + pat[s], spb * 0.9, s % 4 === 0 ? 0.2 : 0.13, 520);
    if (s === 0 || s === 8) this.kick(out, t, 0.28);
    if (s === 4 || s === 12) this.tom(out, t, 110, 0.22);
    if (s === 14 && bar % 2) this.tom(out, t, 140, 0.16);
    this.shaker(out, t, s % 2 ? 0.014 : 0.03);
    // metais (acorde curto)
    if (s === 0 || (s === 6 && bar % 2 === 1) || s === 10) this.brass(out, t, [root + 24, root + 27, root + 31], spb * 2.2, 0.05);
    // melodia (a cada 2 compassos, voltas pares)
    const MEL = [74, -1, 77, 76, 74, -1, 72, 74, 69, -1, -1, 72, 74, -1, -1, -1, 77, -1, 81, 79, 77, -1, 76, 77, 74, -1, -1, -1, -1, -1, -1, -1];
    if (Math.floor(bar / 4) % 2 === 1 && s % 2 === 0) {
      const m = MEL[(bar % 2) * 16 + s];
      if (m > 0) this.steel(out, t, m, spb * 3, 0.07);
    }
  }
  /** "ABISMO" (Polvo Gigante, Mi frígio, 100 bpm em 6/8): órgão misterioso, sinos, tímpanos */
  private krakenSong(t: number, step: number, spb: number): void {
    const out = this.songG.kraken;
    const s = step % 12;
    const bar = Math.floor(step / 12);
    const CH = [
      [40, 52, 55, 59],
      [41, 53, 57, 60],
      [40, 52, 55, 59],
      [38, 50, 53, 57],
    ];
    const c = CH[bar % 4];
    if (s === 0) {
      this.pad(out, t, c.slice(1).map((m) => m + 12), spb * 12, 0.03, 900);
      this.bass(out, t, c[0], spb * 5, 0.22, 380);
      this.tom(out, t, 60, 0.3);
    }
    if (s === 6) {
      this.bass(out, t, c[0] + 7, spb * 4, 0.14, 380);
      this.tom(out, t, 75, 0.18);
    }
    if (s % 2 === 0) this.kalimba(out, t, c[1 + ((s / 2) % 3)] + 24, 0.035);
    if (s === 9 && bar % 2) this.tom(out, t, 95, 0.14);
    const MEL = [76, -1, -1, 77, -1, 76, 74, -1, -1, 72, -1, -1];
    if (bar % 4 >= 2 && MEL[s] > 0) this.bell(out, t, MEL[s] - (bar % 4 === 3 ? 2 : 0), 0.05);
    this.shaker(out, t, s % 3 === 0 ? 0.02 : 0.008);
  }
  /** metal curto (saw filtrado) */
  private brass(out: AudioNode, t: number, notes: number[], dur: number, vol: number): void {
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(600, t);
    lp.frequency.exponentialRampToValueAtTime(2600, t + 0.05);
    lp.frequency.exponentialRampToValueAtTime(800, t + dur);
    const g = ctx.createGain();
    this.env(g, t, vol, 0.02, dur);
    lp.connect(g).connect(out);
    g.connect(this.revIn!);
    for (const m of notes) {
      this.osc('sawtooth', mtof(m), t, t + dur + 0.1, lp, -6);
      this.osc('sawtooth', mtof(m), t, t + dur + 0.1, lp, 6);
    }
  }
  qteShow(): void {
    if (!this.okFx) return;
    const t = this.now();
    this.bell(this.ui!, t, 88, 0.1);
    this.bell(this.ui!, t + 0.08, 95, 0.08);
    this.noiseHit(this.ui!, t, 0.05, 0.12, 'highpass', 5000, 8000);
  }
  qteOk(): void {
    if (!this.okFx) return;
    const t = this.now();
    this.duck(0.4, 0.5);
    [72, 76, 79, 84, 88].forEach((m, i) => this.marimba(this.ui!, t + i * 0.055, m, 0.4, 0.13));
    this.bell(this.ui!, t + 0.28, 96, 0.06);
  }
  qteFail(): void {
    if (!this.okFx) return;
    const t = this.now();
    const g = this.ctx!.createGain();
    this.env(g, t, 0.14, 0.01, 0.5);
    const lp = this.ctx!.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1800, t);
    lp.frequency.exponentialRampToValueAtTime(300, t + 0.5);
    lp.connect(g).connect(this.ui!);
    const o = this.osc('sawtooth', 380, t, t + 0.55, lp);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.5);
  }
  alert(): void {
    if (!this.okFx) return;
    const t = this.now();
    for (const [dt, f] of [
      [0, 880],
      [0.09, 1320],
    ]) {
      const g = this.ctx!.createGain();
      this.env(g, t + dt, 0.12, 0.004, 0.09);
      g.connect(this.ui!);
      this.osc('square', f, t + dt, t + dt + 0.12, g);
    }
  }
  bonk(p: V3 | null): void {
    if (!this.okFx) return;
    const out = this.at(p, 3);
    if (!out) return;
    const t = this.now();
    const g = this.ctx!.createGain();
    this.env(g, t, 0.28, 0.002, 0.18);
    g.connect(out);
    const o = this.osc('sine', 620, t, t + 0.22, g);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.16);
    this.noiseHit(out, t, 0.12, 0.04, 'bandpass', 1800, 900, 3);
    // estrelinhas
    [96, 100].forEach((m, i) => this.bell(out, t + 0.12 + i * 0.07, m, 0.03));
  }
  toss(): void {
    if (!this.okFx) return;
    const t = this.now();
    this.noiseHit(this.ui!, t, 0.08, 0.25, 'bandpass', 900, 2800, 1.5);
    const g = this.ctx!.createGain();
    this.env(g, t + 0.32, 0.12, 0.003, 0.1);
    g.connect(this.ui!);
    const o = this.osc('sine', 420, t + 0.32, t + 0.45, g);
    o.frequency.exponentialRampToValueAtTime(240, t + 0.42);
  }
  trade(): void {
    if (!this.okFx) return;
    const t = this.now();
    this.duck(0.4, 0.6);
    [84, 88, 91].forEach((m, i) => this.bell(this.ui!, t + i * 0.07, m, 0.07));
    for (let i = 0; i < 5; i++) this.noiseHit(this.ui!, t + 0.25 + i * 0.04, 0.05, 0.05, 'bandpass', rnd(5000, 8000), 6000, 4);
  }
  harpoon(): void {
    if (!this.okFx) return;
    const t = this.now();
    this.noiseHit(this.ui!, t, 0.16, 0.3, 'bandpass', 2400, 600, 1.4);
    const g = this.ctx!.createGain();
    this.env(g, t, 0.06, 0.003, 0.35);
    g.connect(this.ui!);
    const o = this.osc('triangle', 900, t, t + 0.4, g);
    o.frequency.exponentialRampToValueAtTime(300, t + 0.35);
  }
  boardBoat(): void {
    if (!this.okFx) return;
    const t = this.now();
    this.noiseHit(this.ui!, t, 0.2, 0.12, 'lowpass', 600, 200);
    this.noiseHit(this.ui!, t + 0.05, 0.08, 0.5, 'bandpass', 800, 300, 1.2);
    this.creak(this.ui!, t + 0.1, 0.05);
  }
  paddle(): void {
    if (!this.okFx) return;
    const t = this.now();
    this.noiseHit(this.ui!, t, 0.09, 0.45, 'bandpass', 900, 350, 1.4);
    for (let i = 0; i < 3; i++) {
      const g = this.ctx!.createGain();
      const tt = t + 0.35 + i * rnd(0.06, 0.12);
      this.env(g, tt, 0.03, 0.002, 0.05);
      g.connect(this.ui!);
      this.osc('sine', rnd(900, 1600), tt, tt + 0.07, g);
    }
  }
  faint(): void {
    if (!this.okFx) return;
    const t = this.now();
    this.duck(0.8, 1.6);
    [79, 76, 72, 67, 64].forEach((m, i) => this.bell(this.ui!, t + i * 0.16, m, 0.06));
    this.noiseHit(this.ui!, t, 0.06, 1.2, 'lowpass', 1200, 200);
  }
  chestOpen(r: number): void {
    if (!this.okFx) return;
    const t = this.now();
    this.duck(0.3 + r * 0.15, 0.6 + r * 0.3);
    this.creak(this.ui!, t, 0.08);
    const notes = [
      [76, 79],
      [74, 78, 81],
      [72, 76, 79, 84],
      [72, 76, 79, 84, 88, 91],
    ][Math.max(0, Math.min(3, r))];
    notes.forEach((m, i) => this.marimba(this.ui!, t + 0.18 + i * 0.07, m, 0.6, 0.13));
    if (r >= 2) this.bell(this.ui!, t + 0.18 + notes.length * 0.07, 96, 0.08);
    if (r >= 3) for (let i = 0; i < 8; i++) this.noiseHit(this.ui!, t + 0.4 + i * 0.05, 0.04, 0.08, 'highpass', 7000, 9000);
  }
  /** rugido de chefe (desenho animado, grave e borbulhante) */
  bossRoar(k: number): void {
    if (!this.okFx) return;
    const t = this.now();
    this.duck(0.7, 1.5);
    const ctx = this.ctx!;
    const g = ctx.createGain();
    this.env(g, t, 0.32, 0.12, 1.6);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(k ? 700 : 480, t);
    lp.frequency.exponentialRampToValueAtTime(180, t + 1.6);
    lp.Q.value = 4;
    lp.connect(g).connect(this.ui!);
    g.connect(this.revIn!);
    const o = this.osc('sawtooth', k ? 95 : 62, t, t + 1.8, lp);
    o.frequency.setValueAtTime(k ? 95 : 62, t);
    o.frequency.linearRampToValueAtTime(k ? 70 : 48, t + 1.6);
    const lfo = this.osc('sine', k ? 11 : 7, t, t + 1.8, o.frequency as unknown as AudioNode);
    void lfo;
    this.noiseHit(this.ui!, t, 0.12, 1.5, 'lowpass', 400, 120);
    if (k) for (let i = 0; i < 10; i++) this.bubble(this.ui!, t + 0.2 + i * rnd(0.05, 0.12));
  }
  private bubble(out: AudioNode, t: number): void {
    const g = this.ctx!.createGain();
    this.env(g, t, 0.06, 0.002, 0.06);
    g.connect(out);
    const f = rnd(300, 900);
    const o = this.osc('sine', f, t, t + 0.08, g);
    o.frequency.exponentialRampToValueAtTime(f * 2.2, t + 0.06);
  }
  megaWarn(p: V3 | null): void {
    if (!this.okFx) return;
    const out = this.at(p, 12, 140) ?? this.ui!;
    const t = this.now();
    this.duck(0.5, 1.2);
    for (let i = 0; i < 3; i++) {
      const g = this.ctx!.createGain();
      this.env(g, t + i * 0.32, 0.3, 0.01, 0.28);
      g.connect(out);
      const o = this.osc('sine', 70 + i * 8, t + i * 0.32, t + i * 0.32 + 0.32, g);
      o.frequency.exponentialRampToValueAtTime(48, t + i * 0.32 + 0.28);
    }
    this.noiseHit(out, t + 0.6, 0.08, 0.8, 'bandpass', 400, 2400, 2);
  }
  bossWhoosh(p: V3 | null): void {
    if (!this.okFx) return;
    const out = this.at(p, 10, 140) ?? this.ui!;
    const t = this.now();
    this.noiseHit(out, t, 0.25, 0.9, 'lowpass', 300, 1800, 2);
    this.noiseHit(out, t + 0.3, 0.12, 0.6, 'bandpass', 1500, 400, 1.2);
  }
  bossHit(weak: boolean): void {
    if (!this.okFx) return;
    const t = this.now();
    const g = this.ctx!.createGain();
    this.env(g, t, weak ? 0.3 : 0.22, 0.002, weak ? 0.4 : 0.2);
    g.connect(this.ui!);
    const o = this.osc('sine', weak ? 300 : 180, t, t + 0.45, g);
    o.frequency.exponentialRampToValueAtTime(weak ? 900 : 90, t + (weak ? 0.25 : 0.15));
    this.noiseHit(this.ui!, t, 0.15, 0.08, 'bandpass', 900, 500, 2);
    if (weak) [91, 95, 98].forEach((m, i) => this.bell(this.ui!, t + 0.1 + i * 0.05, m, 0.05));
  }
  /** vozes dos donos das ilhas */
  npc(f: string, k: string): void {
    if (!this.okFx) return;
    const t = this.now();
    const out = this.ui!;
    const ctx = this.ctx!;
    const syl = (tt: number, f0: number, f1: number, dur: number, type: OscillatorType, form: number, vol: number) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = form;
      bp.Q.value = 2.5;
      const g = ctx.createGain();
      this.env(g, tt, vol, 0.01, dur);
      bp.connect(g).connect(out);
      const o = this.osc(type, f0, tt, tt + dur + 0.05, bp);
      o.frequency.exponentialRampToValueAtTime(f1, tt + dur);
    };
    const mood = k === 'alert' ? 1.25 : k === 'dizzy' ? 0.8 : k === 'eat' ? 1 : 1.1;
    switch (f) {
      case 'crab':
        for (let i = 0; i < (k === 'hi' ? 4 : 3); i++) this.noiseHit(out, t + i * 0.09, 0.14, 0.03, 'bandpass', rnd(2500, 4200) * mood, 2000, 6);
        syl(t + 0.36, 700 * mood, 900 * mood, 0.12, 'square', 1400, 0.05);
        break;
      case 'monkey':
        syl(t, 380 * mood, 620 * mood, 0.18, 'sawtooth', 900, 0.12);
        syl(t + 0.2, 620 * mood, 300 * mood, 0.22, 'sawtooth', 1100, 0.12);
        if (k === 'alert') syl(t + 0.45, 500, 800, 0.12, 'sawtooth', 1300, 0.1);
        break;
      case 'penguin':
        syl(t, 330 * mood, 300 * mood, 0.16, 'sawtooth', 900, 0.12);
        syl(t + 0.2, 350 * mood, 420 * mood, 0.2, 'sawtooth', 1000, 0.12);
        break;
      case 'lizard':
        this.noiseHit(out, t, 0.12, 0.35, 'highpass', 3500, 5000);
        syl(t + 0.1, 160 * mood, 120 * mood, 0.3, 'sawtooth', 500, 0.1);
        break;
      default: {
        const g = ctx.createGain();
        this.env(g, t, 0.1, 0.1, 0.8);
        g.connect(out);
        g.connect(this.revIn!);
        const o = this.osc('sine', 500 * mood, t, t + 0.95, g);
        o.frequency.linearRampToValueAtTime(700 * mood, t + 0.4);
        o.frequency.linearRampToValueAtTime(420 * mood, t + 0.9);
      }
    }
    if (k === 'dizzy') [88, 84, 91].forEach((m, i) => this.bell(out, t + 0.3 + i * 0.1, m, 0.04));
    if (k === 'eat') for (let i = 0; i < 4; i++) this.noiseHit(out, t + 0.3 + i * 0.12, 0.06, 0.05, 'bandpass', 1200, 800, 2);
  }
  /* ------------------------------ v2: ambiente (bioma, caverna, motor) ------------------------------ */
  biome = '';
  cave = 0;
  motor = 0;
  private bioT = 3;
  private dripT = 2;
  private motorN: { o: OscillatorNode; o2: OscillatorNode; g: GainNode; f: BiquadFilterNode } | null = null;
  private ambienceV2(): void {
    const ctx = this.ctx;
    if (!ctx || this.offline) return;
    const t = ctx.currentTime;
    const dt = 0.05;
    // motor da lancha (contínuo)
    if (this.motor > 0.01 && !this.motorN && save.sound) {
      const g = ctx.createGain();
      g.gain.value = 0;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 600;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 50;
      const o2 = ctx.createOscillator();
      o2.type = 'square';
      o2.frequency.value = 25;
      o.connect(f);
      o2.connect(f);
      f.connect(g).connect(this.world!);
      o.start();
      o2.start();
      this.motorN = { o, o2, g, f };
    }
    if (this.motorN) {
      const m = this.motor;
      this.motorN.g.gain.setTargetAtTime(m > 0.01 && save.sound ? 0.05 + m * 0.07 : 0, t, 0.2);
      this.motorN.o.frequency.setTargetAtTime(48 + m * 70, t, 0.25);
      this.motorN.o2.frequency.setTargetAtTime(24 + m * 35, t, 0.25);
      this.motorN.f.frequency.setTargetAtTime(500 + m * 1400, t, 0.25);
    }
    if (!save.sound) return;
    // pingos na caverna (com eco)
    if (this.cave > 0.5) {
      this.dripT -= dt;
      if (this.dripT <= 0) {
        this.dripT = rnd(0.5, 1.6);
        const g = ctx.createGain();
        this.env(g, t, 0.05, 0.002, 0.12);
        g.connect(this.world!);
        g.connect(this.delay!);
        g.connect(this.revIn!);
        const f = rnd(1200, 2600);
        const o = this.osc('sine', f, t, t + 0.15, g);
        o.frequency.exponentialRampToValueAtTime(f * 1.6, t + 0.08);
      }
    }
    // bioma
    if (!this.biome || this.underwater) return;
    this.bioT -= dt;
    if (this.bioT > 0) return;
    const L = this.listenerPos;
    const ang = Math.random() * Math.PI * 2;
    const p = { x: L.x + Math.cos(ang) * 12, y: L.y + 3, z: L.z + Math.sin(ang) * 12 };
    const out = this.at(p, 6, 40);
    if (!out) return;
    const tt = t + 0.02;
    switch (this.biome) {
      case 'jungle': {
        this.bioT = rnd(0.8, 2.4);
        // pássaros tropicais (trinado) ou insetos
        if (Math.random() < 0.6) {
          const g = ctx.createGain();
          this.env(g, tt, 0.05, 0.01, 0.5);
          g.connect(out);
          const o = this.osc('sine', rnd(1800, 2800), tt, tt + 0.55, g);
          for (let i = 0; i < 5; i++) o.frequency.setValueAtTime(rnd(1600, 3200), tt + i * 0.09);
        } else for (let i = 0; i < 8; i++) this.noiseHit(out, tt + i * 0.05, 0.02, 0.03, 'bandpass', 6500, 6500, 8);
        break;
      }
      case 'mangrove': {
        this.bioT = rnd(0.9, 2.2);
        // sapinhos
        for (let i = 0; i < 2; i++) {
          const g = ctx.createGain();
          this.env(g, tt + i * 0.16, 0.06, 0.005, 0.1);
          g.connect(out);
          this.osc('square', rnd(110, 160), tt + i * 0.16, tt + i * 0.16 + 0.12, g);
        }
        break;
      }
      case 'snowy':
        this.bioT = rnd(1.5, 3.5);
        this.noiseHit(out, tt, 0.05, 1.6, 'bandpass', 500, 1400, 1.2);
        break;
      case 'volcanic':
        this.bioT = rnd(1.2, 3);
        this.noiseHit(out, tt, 0.12, 1.4, 'lowpass', 110, 60);
        for (let i = 0; i < 3; i++) this.bubble(out, tt + 0.3 + i * rnd(0.1, 0.2));
        break;
      case 'legend':
      case 'krakenIsle':
        this.bioT = rnd(1.5, 3.5);
        this.bell(out, tt, pick([84, 88, 91, 95]), 0.025);
        break;
      case 'rocky':
        this.bioT = rnd(2, 4);
        this.noiseHit(out, tt, 0.04, 0.2, 'bandpass', 1500, 800, 2);
        break;
      default:
        this.bioT = rnd(1.5, 3.5);
        // caranguejinhos na areia
        for (let i = 0; i < 3; i++) this.noiseHit(out, tt + i * 0.07, 0.03, 0.02, 'bandpass', 3800, 3000, 6);
    }
  }
  /** fogueiras acesas (posição + nível) — chamar quando mudam */
  setFires(list: { p: V3; lv: number }[]): void {
    this.fires = list.map((f, i) => ({ p: f.p, lv: f.lv, pan: null, g: null, t: i * 0.1 }));
  }
}

/* ============================== pacote 'jangada' ==============================
 * Cada efeito acima vira um som do pacote (renderizado offline em variantes,
 * normalizado e tocado pelo motor de áudio do app: sliders, ducking, 3D, limite de vozes). */
type Draw = (s: JSynth) => void;
const D = (draw: Draw, dur: number, o: Partial<SoundDef> = {}): SoundDef => ({ r: (v) => draw(JSynth.offline(v.c, v.out, v.t)), dur, ...o });
const P0 = { x: 0, y: 0, z: 0 };
const JINGLE: Partial<SoundDef> = { bus: 'ui', variants: 1, pitch: 0, gj: 0 };
definePack({
  id: 'jangada',
  name: 'Jangada',
  /** trilha própria (Maré Mansa / Lua na Jangada / Tormenta) */
  theme: null,
  sounds: {
    click: D((s) => s.ui1(), 0.12, { bus: 'ui', db: -2 }),
    throw: D((s) => s.throwHook(0.6), 0.9, { db: -2 }),
    splashS: D((s) => s.splash(null, 0.3), 0.8, { db: -3, max: 6 }),
    splashL: D((s) => s.splash(null, 0.85), 1.4, { max: 4 }),
    reel: D((s) => s.reel(1), 0.06, { bus: 'ui', db: -9, pitch: 60, max: 3 }),
    pop: D((s) => s.pop(0), 0.35, { bus: 'ui', db: 1, max: 6, cool: 0.05 }),
    hammer2: D((s) => s.hammer(null, 2), 0.6, { pitch: 60 }),
    hammer3: D((s) => s.hammer(null, 3), 0.8, { pitch: 60 }),
    place: D((s) => s.place(null), 0.8),
    creak: D((s) => s.creak(s.out, s.at0, 0.04), 0.6, { db: -8, cool: 2.5 }),
    crack: D((s) => s.crack(null), 1.4, { duck: 0.4 }),
    stepWood: D((s) => s.step('wood'), 0.16, { db: -9, pitch: 80, cool: 0.15 }),
    stepSand: D((s) => s.step('sand'), 0.16, { db: -10, pitch: 80, cool: 0.15 }),
    stepWater: D((s) => s.step('water'), 0.35, { db: -8, cool: 0.15 }),
    jump: D((s) => s.jump(), 0.2, { db: -6 }),
    land: D((s) => s.land(0.6), 0.25, { db: -4 }),
    plunge: D((s) => s.plunge(), 1.4),
    bubbles: D((s) => s.bubbles(4), 0.8, { bus: 'ui', db: -8 }),
    stroke: D((s) => s.stroke(), 0.35, { db: -8 }),
    swing: D((s) => s.swing(), 0.25, { bus: 'ui', db: -3 }),
    chop: D((s) => s.chop(null, false), 0.35, { pitch: 60 }),
    chopStone: D((s) => s.chop(null, true), 0.4, { pitch: 60 }),
    timber: D((s) => s.timber(null), 1.6, { variants: 2 }),
    eat: D((s) => s.eat(), 1.0, { bus: 'ui' }),
    drink: D((s) => s.drink(), 1.0, { bus: 'ui' }),
    ahh: D((s) => s.ahh(), 1.6, { bus: 'ui', db: -4 }),
    sizzle: D((s) => s.sizzle(null, 1.5), 0.5, { db: -6, cool: 0.3 }),
    boil: D((s) => s.boil(null), 0.5, { db: -6, cool: 0.4 }),
    whoosh: D((s) => s.whoosh(null), 0.7),
    flap: D((s) => s.flap(null), 0.6),
    chainDown: D((s) => s.chain(null, true), 1.6, { variants: 2 }),
    chainUp: D((s) => s.chain(null, false), 1.0, { variants: 2 }),
    fin: D((s) => s.fin(P0), 1.0, { db: -6, cool: 1.3 }),
    bite: D((s) => s.bite(P0), 1.3, { duck: 0.5 }),
    chomp: D((s) => s.chomp(), 0.3, { bus: 'ui', duck: 0.6 }),
    sharkHurt: D((s) => s.sharkHurt(P0), 1.0),
    boo: D((s) => s.boo(null), 1.5, { cool: 1.5, rev: 0.4 }),
    giggle: D((s) => s.giggle(null), 0.7, { cool: 1.2 }),
    ghostScared: D((s) => s.ghostScared(null), 1.0),
    gull: D((s) => s.gull(P0), 1.3, { db: -8, cool: 3 }),
    thunder: D((s) => s.thunder(0), 3.5, { variants: 2, duck: 0.4 }),
    bobber: D((s) => s.bobber(), 0.4, { bus: 'ui' }),
    goodTap: D((s) => s.goodTap(), 1.2, { ...JINGLE }),
    miss: D((s) => s.miss(), 0.4, { bus: 'ui' }),
    nope: D((s) => s.nope(), 0.3, { bus: 'ui', cool: 0.25 }),
    hurt: D((s) => s.hurt(), 0.35, { bus: 'ui', cool: 0.4 }),
    warn: D((s) => s.warn(), 1.5, { ...JINGLE }),
    sparkle: D((s) => s.sparkle(), 1.6, { ...JINGLE }),
    lullaby: D((s) => s.lullaby(), 3.2, { ...JINGLE, duck: 0.9 }),
    chime: D((s) => s.chime(), 1.6, { ...JINGLE, variants: 3, duck: 0.3 }),
    mission: D((s) => s.mission(), 2.0, { ...JINGLE, duck: 0.5 }),
    fanfare: D((s) => s.fanfare(), 2.4, { ...JINGLE, duck: 0.8 }),
    island: D((s) => s.jingleIsland(), 2.7, { ...JINGLE, duck: 0.75 }),
    dawn: D((s) => s.dawn(), 1.6, { ...JINGLE, duck: 0.6 }),
    dusk: D((s) => s.dusk(), 1.4, { ...JINGLE, duck: 0.5 }),
    sharkWarn: D((s) => s.sharkWarn(), 1.9, { ...JINGLE, duck: 0.6 }),
    // v2
    qteShow: D((s) => s.qteShow(), 1.0, { ...JINGLE }),
    qteOk: D((s) => s.qteOk(), 1.1, { ...JINGLE, duck: 0.4 }),
    qteFail: D((s) => s.qteFail(), 0.7, { ...JINGLE }),
    alert: D((s) => s.alert(), 0.3, { bus: 'ui', cool: 0.6 }),
    bonk: D((s) => s.bonk(null), 0.6, { pitch: 80, cool: 0.15 }),
    toss: D((s) => s.toss(), 0.6, { bus: 'ui' }),
    trade: D((s) => s.trade(), 0.9, { ...JINGLE }),
    harpoon: D((s) => s.harpoon(), 0.5, { bus: 'ui', cool: 0.2 }),
    boardBoat: D((s) => s.boardBoat(), 0.8),
    paddle: D((s) => s.paddle(), 0.8, { db: -4, cool: 0.4 }),
    faint: D((s) => s.faint(), 2.0, { ...JINGLE, duck: 0.8 }),
    chest0: D((s) => s.chestOpen(0), 1.0, { ...JINGLE }),
    chest1: D((s) => s.chestOpen(1), 1.1, { ...JINGLE }),
    chest2: D((s) => s.chestOpen(2), 1.4, { ...JINGLE }),
    chest3: D((s) => s.chestOpen(3), 1.8, { ...JINGLE, duck: 0.6 }),
    roarMega: D((s) => s.bossRoar(0), 2.2, { ...JINGLE, duck: 0.7 }),
    roarKraken: D((s) => s.bossRoar(1), 2.2, { ...JINGLE, duck: 0.7 }),
    megaWarn: D((s) => s.megaWarn(null), 1.8, { duck: 0.5, cool: 1 }),
    bossWhoosh: D((s) => s.bossWhoosh(null), 1.4, { cool: 0.5 }),
    bossHit: D((s) => s.bossHit(false), 0.6, { bus: 'ui', cool: 0.1 }),
    bossWeak: D((s) => s.bossHit(true), 0.8, { bus: 'ui', cool: 0.1 }),
    ...Object.fromEntries(
      ['crab', 'monkey', 'penguin', 'lizard', 'pirate'].flatMap((f) => ['hi', 'alert', 'eat', 'dizzy'].map((k) => [`npc_${f}_${k}`, D((s) => s.npc(f, k), 1.2, { cool: 0.8 })])),
    ),
  },
});

/** áudio do jogo: música e ambiente ao vivo (JSynth) + efeitos do pacote 'jangada' */
export class JAudio {
  private s = new JSynth();
  hq = true;
  start(): void {
    this.s.start();
  }
  stop(): void {
    this.s.stop();
  }
  setSong(x: Song): void {
    this.s.setSong(x);
  }
  set storm(v: number) {
    this.s.storm = v;
  }
  set night(v: number) {
    this.s.night = v;
  }
  set underwater(v: boolean) {
    this.s.underwater = v;
  }
  listener(p: V3, f: V3): void {
    engine.setListener(p.x, p.y, p.z, f.x, f.y, f.z);
    this.s.listener(p);
  }
  setFires(l: { p: V3; lv: number }[]): void {
    this.s.setFires(l);
  }
  private play(name: string, p: V3 | null = null, o: PlayOpts = {}): void {
    if (p) sfx.at('jangada.' + name, p.x, p.y, p.z, o);
    else sfx.play('jangada.' + name, o);
  }
  throwHook(power: number): void {
    this.play('throw', null, { rate: 0.85 + power * 0.3, db: -3 + power * 4 });
  }
  splash(p: V3 | null, size = 0.5): void {
    this.play(size > 0.55 ? 'splashL' : 'splashS', p, { db: (size - 0.5) * 6 });
  }
  reel(): void {
    this.play('reel');
  }
  pop(kind = 0): void {
    this.play('pop', null, { rate: [1, 1.19, 1.42, 0.81, 1.69][((kind % 5) + 5) % 5] });
  }
  hammer(p: V3 | null, n = 2): void {
    this.play(n >= 3 ? 'hammer3' : 'hammer2', p);
  }
  place(p: V3 | null): void {
    this.play('place', p);
  }
  raftCreak(p: V3): void {
    this.play('creak', p, { db: this.s.storm * 6 });
  }
  crack(p: V3 | null): void {
    this.play('crack', p);
  }
  step(surface: 'wood' | 'sand' | 'water', vol = 1): void {
    this.play(surface === 'wood' ? 'stepWood' : surface === 'sand' ? 'stepSand' : 'stepWater', null, { db: 20 * Math.log10(Math.max(0.2, vol)) });
  }
  jump(): void {
    this.play('jump');
  }
  land(hard: number): void {
    this.play('land', null, { db: -4 + hard * 6 });
  }
  plunge(): void {
    this.play('plunge');
  }
  bubbles(n = 4): void {
    this.play('bubbles', null, { db: n > 4 ? 2 : -3 });
  }
  stroke(): void {
    this.play('stroke');
  }
  swing(): void {
    this.play('swing');
  }
  chop(p: V3 | null, stone = false): void {
    this.play(stone ? 'chopStone' : 'chop', p);
  }
  timber(p: V3 | null): void {
    this.play('timber', p);
  }
  eat(): void {
    this.play('eat');
  }
  drink(): void {
    this.play('drink');
  }
  ahh(): void {
    this.play('ahh', null, { delay: 0.9 });
  }
  sizzle(p: V3 | null, vol = 1): void {
    this.play('sizzle', p, { db: 20 * Math.log10(Math.max(0.3, vol)) });
  }
  boil(p: V3 | null): void {
    this.play('boil', p);
  }
  whoosh(p: V3 | null): void {
    this.play('whoosh', p);
  }
  flap(p: V3 | null): void {
    this.play('flap', p);
  }
  chain(p: V3 | null, down: boolean): void {
    this.play(down ? 'chainDown' : 'chainUp', p);
  }
  fin(p: V3): void {
    this.play('fin', p);
  }
  bite(p: V3): void {
    this.play('bite', p);
  }
  chomp(): void {
    this.play('chomp');
  }
  sharkHurt(p: V3): void {
    this.play('sharkHurt', p);
  }
  boo(p: V3 | null): void {
    this.play('boo', p);
  }
  giggle(p: V3 | null): void {
    this.play('giggle', p);
  }
  ghostScared(p: V3 | null): void {
    this.play('ghostScared', p);
  }
  thunder(dist: number): void {
    this.play('thunder', null, { delay: Math.min(2.5, dist * 0.003), db: -dist * 0.004 });
  }
  bobber(): void {
    this.play('bobber');
  }
  goodTap(): void {
    this.play('goodTap');
  }
  miss(): void {
    this.play('miss');
  }
  ui1(): void {
    this.play('click');
  }
  nope(): void {
    this.play('nope');
  }
  hurt(): void {
    this.play('hurt');
  }
  warn(): void {
    this.play('warn');
  }
  sparkle(): void {
    this.play('sparkle');
  }
  lullaby(): void {
    this.play('lullaby');
  }
  chime(): void {
    this.play('chime');
  }
  mission(): void {
    this.play('mission');
  }
  fanfare(): void {
    this.play('fanfare');
  }
  jingleIsland(): void {
    this.play('island');
  }
  dawn(): void {
    this.play('dawn');
  }
  dusk(): void {
    this.play('dusk');
  }
  sharkWarn(): void {
    this.play('sharkWarn');
  }
  /* ---------- v2 ---------- */
  set biome(v: string) {
    this.s.biome = v;
  }
  set cave(v: number) {
    this.s.cave = v;
  }
  set motor(v: number) {
    this.s.motor = v;
  }
  qteShow(): void {
    this.play('qteShow');
  }
  qteOk(): void {
    this.play('qteOk');
  }
  qteFail(): void {
    this.play('qteFail');
  }
  alert(): void {
    this.play('alert');
  }
  bonk(p: V3 | null = null): void {
    this.play('bonk', p);
  }
  toss(): void {
    this.play('toss');
  }
  trade(): void {
    this.play('trade');
  }
  harpoon(): void {
    this.play('harpoon');
  }
  boardBoat(): void {
    this.play('boardBoat');
  }
  paddle(): void {
    this.play('paddle');
  }
  faint(): void {
    this.play('faint');
  }
  chestOpen(r: number): void {
    this.play('chest' + Math.max(0, Math.min(3, r)));
  }
  bossRoar(k: number): void {
    this.play(k ? 'roarKraken' : 'roarMega');
  }
  megaWarn(p: V3 | null): void {
    this.play('megaWarn', p);
  }
  bossWhoosh(p: V3 | null): void {
    this.play('bossWhoosh', p);
  }
  bossHit(weak: boolean): void {
    this.play(weak ? 'bossWeak' : 'bossHit');
  }
  npc(f: string, k: string, p: V3 | null): void {
    if (k === 'bonk') return this.bonk(p);
    this.play(`npc_${f}_${k}`, p);
  }
}
