/* Sons sintetizados da Casa (mesmo AudioContext/bus do core; respeita save.sound / save.music). */
import { audio } from '../core/audio';
import { save } from '../core/storage';
import { tap } from '../core/haptics';

interface AI {
  ctx: AudioContext | null;
  sfxBus: AudioNode;
  musicBus?: AudioNode;
}
const A = audio as unknown as AI;
let nb: AudioBuffer | null = null;
const ctx = (): AudioContext | null => (A.ctx && save.sound && A.sfxBus ? A.ctx : null);

function tone(f: number, d: number, type: OscillatorType, v: number, slide = 1, delay = 0, bus?: AudioNode): void {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + d);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(bus ?? A.sfxBus);
  o.start(t);
  o.stop(t + d + 0.03);
}
function noise(d: number, v: number, f: number, q = 1, slide = 1): void {
  const c = ctx();
  if (!c) return;
  if (!nb || nb.sampleRate !== c.sampleRate) {
    nb = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const a = nb.getChannelData(0);
    for (let i = 0; i < a.length; i++) a[i] = Math.random() * 2 - 1;
  }
  const t = c.currentTime;
  const s = c.createBufferSource();
  s.buffer = nb;
  const fl = c.createBiquadFilter();
  fl.type = 'bandpass';
  fl.frequency.setValueAtTime(f, t);
  if (slide !== 1) fl.frequency.exponentialRampToValueAtTime(Math.max(40, f * slide), t + d);
  fl.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  s.connect(fl).connect(g).connect(A.sfxBus);
  s.start(t, Math.random() * 0.5, d + 0.05);
}

let lastPaint = 0;
export const hsfx = {
  click: () => tone(700, 0.06, 'triangle', 0.08, 1.4),
  place: () => {
    tone(260, 0.12, 'sine', 0.16, 0.6);
    noise(0.12, 0.08, 500, 0.8);
    tap('light');
  },
  pick: () => tone(520, 0.08, 'triangle', 0.1, 1.6),
  whoosh: () => noise(0.25, 0.1, 900, 0.7, 2.5),
  splat: () => {
    noise(0.16, 0.25, 420, 0.9, 0.5);
    tone(140, 0.12, 'sine', 0.14, 0.5);
    tap('medium');
  },
  chomp: () => {
    noise(0.07, 0.22, 700, 1.2, 0.6);
    tone(190, 0.06, 'triangle', 0.1, 0.7);
  },
  scrub: () => noise(0.09, 0.1, 1800 + Math.random() * 900, 1.4, 0.7),
  sparkle: () => {
    tone(1200, 0.12, 'sine', 0.08, 1.3);
    tone(1600, 0.16, 'sine', 0.07, 1.25, 0.08);
    tone(2100, 0.2, 'sine', 0.06, 1.2, 0.16);
  },
  coin: () => {
    tone(990, 0.08, 'square', 0.05);
    tone(1480, 0.14, 'square', 0.05, 1, 0.07);
  },
  /** pincelada: chiado suave com tom subindo conforme a cobertura */
  paint: (cov: number) => {
    const now = performance.now();
    if (now - lastPaint < 70) return;
    lastPaint = now;
    noise(0.08, 0.06, 900 + cov * 1600, 0.8);
    tone(300 + cov * 500, 0.06, 'sine', 0.03);
    if (Math.random() < 0.3) tap('light');
  },
  done: () => {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.1, 1, i * 0.08));
    tap('heavy');
  },
  error: () => tone(220, 0.18, 'square', 0.05, 0.7),
};

/* ---------------- música da festa (arpejo bem leve) ---------------- */
let mt = 0;
let step = 0;
const SONG = [0, 4, 7, 12, 7, 4, 2, 5, 9, 14, 9, 5, 0, 4, 7, 11];
export function partyMusic(on: boolean): void {
  clearInterval(mt);
  mt = 0;
  if (!on) return;
  mt = window.setInterval(() => {
    const c = A.ctx;
    if (!c || !save.music) return;
    const n = SONG[step % SONG.length];
    const base = step % 32 < 16 ? 262 : 220;
    tone(base * Math.pow(2, n / 12), 0.18, 'triangle', 0.035, 1, 0, A.musicBus ?? A.sfxBus);
    if (step % 4 === 0) tone(base / 2, 0.25, 'sine', 0.06, 0.9, 0, A.musicBus ?? A.sfxBus);
    if (step % 2 === 1) noise(0.04, 0.03, 6000, 2);
    step++;
  }, 190);
}
