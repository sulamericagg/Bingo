/* ============================================================
 *  CASA DO BLOOP — sons sintetizados (usa o mesmo AudioContext e o
 *  barramento de efeitos do core/audio; respeita save.sound).
 * ============================================================ */
import { audio } from '../core/audio';
import { save } from '../core/storage';

interface AudioInternals {
  ctx: AudioContext | null;
  sfxBus: AudioNode;
}
const A = audio as unknown as AudioInternals;

let noiseBuf: AudioBuffer | null = null;

function ctx(): AudioContext | null {
  const c = A.ctx;
  if (!c || !save.sound || !A.sfxBus) return null;
  return c;
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slide = 1, delay = 0): void {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(A.sfxBus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol: number, freq: number, q = 1, slide = 1): void {
  const c = ctx();
  if (!c) return;
  if (!noiseBuf || noiseBuf.sampleRate !== c.sampleRate) {
    const len = c.sampleRate;
    noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(freq, t);
  if (slide !== 1) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(A.sfxBus);
  src.start(t, Math.random() * 0.5, dur + 0.05);
}

export const sfx = {
  scrub(): void {
    noise(0.09, 0.12, 1800 + Math.random() * 900, 1.4, 0.7);
  },
  squeak(): void {
    tone(1300 + Math.random() * 500, 0.07, 'sine', 0.06, 1.5);
  },
  water(): void {
    noise(0.25, 0.08, 3200, 0.6, 0.8);
  },
  pop(): void {
    tone(600 + Math.random() * 400, 0.06, 'sine', 0.1, 2.2);
  },
  chomp(): void {
    noise(0.07, 0.25, 700, 1.2, 0.6);
    tone(180, 0.06, 'triangle', 0.12, 0.7);
  },
  burp(): void {
    tone(110, 0.32, 'sawtooth', 0.09, 0.75);
    tone(140, 0.28, 'sine', 0.12, 0.7, 0.02);
  },
  giggle(): void {
    const b = 700 + Math.random() * 200;
    for (let i = 0; i < 4; i++) tone(b + (i % 2) * 180, 0.07, 'triangle', 0.08, 1.2, i * 0.075);
  },
  /** vozinha fofa ao cutucar ("ui!", "hihi", "oba") — sintetizada */
  chirp(): void {
    const k = Math.floor(Math.random() * 3);
    const b = 620 + Math.random() * 180;
    if (k === 0) {
      tone(b, 0.16, 'triangle', 0.13, 1.9);
    } else if (k === 1) {
      tone(b * 1.3, 0.09, 'sine', 0.12, 1.25);
      tone(b * 1.45, 0.11, 'sine', 0.12, 1.2, 0.11);
    } else {
      tone(b * 0.9, 0.1, 'triangle', 0.12, 1.4);
      tone(b * 1.2, 0.18, 'triangle', 0.12, 0.8, 0.1);
    }
  },
  boing(): void {
    tone(220, 0.28, 'sine', 0.22, 2.6);
  },
  yawn(): void {
    tone(420, 0.7, 'sine', 0.07, 0.55);
  },
  shine(): void {
    [1568, 1976, 2349, 3136].forEach((f, i) => tone(f, 0.35, 'sine', 0.07, 1, i * 0.06));
  },
  yum(): void {
    tone(520, 0.12, 'triangle', 0.12, 1.3);
    tone(780, 0.18, 'triangle', 0.1, 1.2, 0.1);
  },
  rumble(): void {
    tone(70, 0.45, 'sawtooth', 0.05, 0.8);
  },
  /* ---------- caretas e travessuras ---------- */
  /** "ptuí!" (cuspir) */
  spit(): void {
    noise(0.12, 0.3, 2400, 2, 0.5);
    tone(900, 0.1, 'square', 0.05, 0.4);
  },
  /** "eeeca" ondulado descendo */
  yuck(): void {
    const c = ctx();
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const lfo = c.createOscillator();
    const lg = c.createGain();
    const g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(420, t);
    o.frequency.exponentialRampToValueAtTime(170, t + 0.6);
    lfo.frequency.value = 14;
    lg.gain.value = 30;
    lfo.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
    o.connect(g).connect(A.sfxBus);
    o.start(t);
    lfo.start(t);
    o.stop(t + 0.7);
    lfo.stop(t + 0.7);
  },
  /** bafo de fogo (vuuush) */
  fire(): void {
    noise(0.7, 0.22, 500, 0.7, 3);
    tone(160, 0.5, 'sawtooth', 0.04, 2.2);
  },
  /** biquinho azedo: "iiiii" apertadinho */
  sour(): void {
    tone(1500, 0.45, 'sine', 0.07, 1.35);
    tone(1520, 0.45, 'triangle', 0.04, 1.3, 0.02);
  },
  /** "hmpf!" emburrado */
  hmph(): void {
    tone(260, 0.09, 'square', 0.06, 0.8);
    tone(200, 0.18, 'square', 0.05, 0.7, 0.1);
  },
  /** gargalhada longa */
  laugh(): void {
    const b = 640 + Math.random() * 120;
    for (let i = 0; i < 8; i++) tone(b + (i % 2) * 200 - i * 18, 0.08, 'triangle', 0.09, 1.15, i * 0.09);
  },
  /** travesseirada: "pufff" + estrelinhas */
  bonk(): void {
    noise(0.16, 0.3, 380, 0.8, 0.6);
    tone(130, 0.12, 'sine', 0.2, 0.6);
    [2093, 2637, 3136].forEach((f, i) => tone(f, 0.18, 'sine', 0.04, 1, 0.12 + i * 0.07));
  },
  /** borrifador: "psst psst" */
  spray(): void {
    noise(0.14, 0.18, 5200, 0.9, 0.8);
  },
  /** almofada de pum (pfrrrrt cartunesco) */
  whoopee(): void {
    const c = ctx();
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const lfo = c.createOscillator();
    const lg = c.createGain();
    const g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.8);
    lfo.type = 'square';
    lfo.frequency.setValueAtTime(28, t);
    lfo.frequency.linearRampToValueAtTime(18, t + 0.8);
    lg.gain.value = 25;
    lfo.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.04);
    g.gain.setValueAtTime(0.16, t + 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
    o.connect(g).connect(A.sfxBus);
    o.start(t);
    lfo.start(t);
    o.stop(t + 0.9);
    lfo.stop(t + 0.9);
  },
  /** caixinha de música da caixa-surpresa (sobe tensão) */
  crank(i: number): void {
    const notes = [523, 587, 659, 523, 659, 523, 659];
    tone(notes[i % notes.length], 0.12, 'triangle', 0.07, 1);
  },
  /** susto: "iiik!" subindo */
  eek(): void {
    tone(700, 0.28, 'square', 0.06, 2.4);
    tone(1000, 0.22, 'sine', 0.06, 1.8, 0.05);
  },
  /** cutucão rápido */
  poke(): void {
    tone(900 + Math.random() * 300, 0.05, 'sine', 0.08, 0.7);
  },
  /** peteleco no nariz */
  flick(): void {
    noise(0.04, 0.3, 3000, 3);
    tone(1400, 0.08, 'triangle', 0.08, 0.6);
  },
  /** gelatina esticando/soltando */
  jelly(): void {
    const b = 260 + Math.random() * 60;
    tone(b, 0.35, 'sine', 0.12, 1.8);
    tone(b * 1.5, 0.25, 'sine', 0.06, 0.6, 0.08);
  },
  /** escondendo debaixo da coberta */
  rustle(): void {
    noise(0.4, 0.12, 1200, 0.5, 0.6);
  },
  /** moedinhas caindo */
  jingle(): void {
    [1800, 2400, 2100, 2700].forEach((f, i) => tone(f, 0.12, 'sine', 0.06, 1, i * 0.06));
  },
  click(): void {
    audio.click();
  },
  coin(): void {
    audio.coin();
  },
  levelUp(): void {
    audio.unlock2();
  },
};
