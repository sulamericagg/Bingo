/* Sons sintetizados dos modos 3D (casa, cozinha) — sem arquivos. Respeita save.sound. */
import { save } from '../../core/storage';

let ctx: AudioContext | null = null;
let bus: GainNode | null = null;
function ac(): AudioContext | null {
  if (!save.sound) return null;
  try {
    if (!ctx) {
      const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new C();
      bus = ctx.createGain();
      bus.gain.value = 0.5;
      bus.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}
function tone(f: number, dur: number, type: OscillatorType, vol: number, slide = 1, delay = 0): void {
  const c = ac();
  if (!c || !bus) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.02);
}
let noiseBuf: AudioBuffer | null = null;
function noise(dur: number, vol: number, freq: number, q = 1, slide = 1): void {
  const c = ac();
  if (!c || !bus) return;
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = c.currentTime;
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(freq, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(bus);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.02);
}

export const sfx = {
  pick: () => tone(520, 0.09, 'triangle', 0.18, 1.6),
  drop: () => tone(300, 0.12, 'sine', 0.2, 0.6),
  throw: () => noise(0.22, 0.25, 1400, 1.2, 0.4),
  splat: () => (noise(0.25, 0.5, 500, 0.8, 0.3), tone(160, 0.18, 'sine', 0.25, 0.5)),
  thud: () => tone(110, 0.15, 'sine', 0.3, 0.6),
  kick: () => (tone(180, 0.1, 'square', 0.12, 0.5), noise(0.1, 0.25, 300)),
  poof: () => (noise(0.45, 0.45, 900, 0.6, 0.2), [660, 880, 1100].forEach((f, i) => tone(f, 0.12, 'triangle', 0.08, 1.2, 0.05 + i * 0.04))),
  squeak: () => tone(1500 + Math.random() * 500, 0.07, 'sine', 0.08, 1.4),
  scrub: () => noise(0.12, 0.12, 2400, 2),
  vacuum: () => noise(0.18, 0.1, 700, 1.5, 1.8),
  clean: () => [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.18, 'triangle', 0.1, 1, i * 0.06)),
  fix: () => [523, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', 0.12, 1.1, i * 0.07)),
  eat: () => [0, 0.09, 0.18].forEach((d) => tone(240, 0.06, 'square', 0.08, 0.7, d)),
  paint: () => noise(0.09, 0.07, 900, 0.7),
  sparkle: () => [1568, 2093, 2637, 3136, 2637, 3136].forEach((f, i) => tone(f, 0.25, 'sine', 0.07, 1, i * 0.07)),
  click: () => tone(880, 0.05, 'triangle', 0.1, 1.4),
  step: () => tone(90 + Math.random() * 30, 0.05, 'sine', 0.06, 0.8),
  pop: () => (tone(900, 0.08, 'square', 0.12, 0.3), noise(0.08, 0.3, 2000)),
  /* cozinha */
  chop: () => (tone(700 + Math.random() * 200, 0.04, 'square', 0.07, 0.5), noise(0.05, 0.18, 3200, 2)),
  sizzle: () => noise(0.35, 0.08, 4200, 0.8, 1.2),
  bubble: () => tone(300 + Math.random() * 250, 0.07, 'sine', 0.07, 1.8),
  spray: () => noise(0.16, 0.16, 1800, 0.6, 1.3),
  crash: () => (noise(0.3, 0.45, 3000, 1.5, 0.5), [1800, 2400, 1500].forEach((f, i) => tone(f, 0.08, 'triangle', 0.08, 0.7, i * 0.05))),
  whoosh: () => noise(0.3, 0.2, 600, 0.9, 3),
  boing: () => tone(220, 0.25, 'sine', 0.2, 2.2),
  catch: () => (tone(660, 0.07, 'triangle', 0.15, 1.3), tone(990, 0.09, 'triangle', 0.12, 1.2, 0.06)),
  swish: () => [784, 988, 1175].forEach((f, i) => tone(f, 0.12, 'triangle', 0.1, 1.1, i * 0.05)),
  fire: () => noise(0.5, 0.18, 300, 0.5, 2),
  /** alarme de fumaça (dois bipes curtos, de desenho — não assusta) */
  alarm: () => (tone(1320, 0.12, 'triangle', 0.07, 1), tone(1046, 0.12, 'triangle', 0.07, 1, 0.18)),
  bump: () => (tone(70, 0.25, 'sine', 0.3, 0.6), noise(0.2, 0.25, 200)),
  /* kit de interação (src/3d/common/interact) */
  ding: () => (tone(1568, 0.5, 'sine', 0.16, 1), tone(2093, 0.4, 'sine', 0.08, 1, 0.01)),
  knob: () => (tone(1200, 0.025, 'square', 0.06, 0.6), tone(900, 0.025, 'square', 0.05, 0.6, 0.05)),
  ignite: () => (tone(2200, 0.03, 'square', 0.05, 0.5), noise(0.35, 0.22, 500, 0.7, 2.2)),
  door: () => noise(0.12, 0.12, 900, 1, 0.6),
  thunk: () => (tone(140, 0.12, 'sine', 0.25, 0.6), noise(0.06, 0.2, 400)),
  print: () => [0, 0.07, 0.14, 0.21, 0.28].forEach((d) => tone(380, 0.05, 'square', 0.04, 1.1, d)),
  splash: () => (noise(0.35, 0.3, 1200, 0.7, 0.5), tone(500, 0.1, 'sine', 0.08, 1.8)),
  water: () => noise(0.25, 0.07, 2600, 0.6, 1),
  press: () => (tone(300, 0.04, 'square', 0.08, 0.8), tone(1300, 0.03, 'triangle', 0.06, 1)),
  yay: () => [784, 988, 1319].forEach((f, i) => tone(f, 0.14, 'triangle', 0.11, 1.05, i * 0.07)),
};
export function disposeSfx(): void {
  try {
    void ctx?.close();
  } catch {
    /* */
  }
  ctx = null;
  bus = null;
  noiseBuf = null;
}
