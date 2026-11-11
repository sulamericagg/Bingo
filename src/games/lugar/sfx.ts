/* BLOOP NO LUGAR — efeitos sintetizados (WebAudio no barramento de efeitos do app; respeita "Som"). */
import { audio } from '../../core/audio';

type Wave = OscillatorType;

function note(freq: number, dur: number, type: Wave, vol: number, o: { at?: number; slide?: number; rev?: number; attack?: number } = {}): void {
  const fx = audio.fxOut();
  if (!fx) return;
  const { ctx, out, rev } = fx;
  const t0 = ctx.currentTime + (o.at ?? 0);
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * o.slide), t0 + dur);
  const a = o.attack ?? 0.006;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(out);
  if (o.rev) {
    const w = ctx.createGain();
    w.gain.value = o.rev;
    g.connect(w).connect(rev);
  }
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur: number, vol: number, freq: number, at = 0): void {
  const fx = audio.fxOut();
  if (!fx) return;
  const { ctx, out } = fx;
  const t0 = ctx.currentTime + at;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = 1.4;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(out);
  src.start(t0);
}

const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5];

export const sfx = {
  /** X marcado (riscadinho de lápis) */
  mark(i = 0): void {
    noise(0.045, 0.22, 2600 + (i % 5) * 180);
  },
  unmark(): void {
    noise(0.04, 0.14, 1500);
  },
  /** Bloop entrou (plop + brilho que sobe com a quantidade já posta) */
  pop(k = 0): void {
    note(220, 0.16, 'sine', 0.32, { slide: 2.6 });
    note(PENTA[Math.min(PENTA.length - 1, k)], 0.22, 'triangle', 0.12, { at: 0.05, rev: 0.4 });
  },
  remove(): void {
    note(500, 0.12, 'sine', 0.18, { slide: 0.45 });
  },
  wrong(): void {
    note(240, 0.22, 'square', 0.07, { slide: 0.6 });
    note(180, 0.3, 'triangle', 0.18, { at: 0.08, slide: 0.7 });
  },
  /** região completa: arpejo de sininhos */
  region(k = 0): void {
    const base = [0, 2, 4].map((i) => PENTA[(i + k) % PENTA.length]);
    base.forEach((f, i) => note(f * 2, 0.35, 'sine', 0.07, { at: i * 0.06, rev: 0.6 }));
  },
  hint(): void {
    note(1046.5, 0.3, 'sine', 0.09, { rev: 0.7 });
    note(1568, 0.4, 'sine', 0.06, { at: 0.09, rev: 0.7 });
  },
  undo(): void {
    note(700, 0.07, 'triangle', 0.1, { slide: 0.7 });
  },
  heartBack(): void {
    [0, 2, 4, 7].forEach((i, k) => note(PENTA[i % 8], 0.25, 'triangle', 0.1, { at: k * 0.07, rev: 0.4 }));
  },
  win(): void {
    const mel = [0, 2, 4, 5, 7];
    mel.forEach((i, k) => note(PENTA[i], 0.28, 'triangle', 0.14, { at: k * 0.1, rev: 0.5 }));
    note(PENTA[7] * 2, 0.7, 'sine', 0.08, { at: 0.5, rev: 0.8 });
    [0, 4, 7].forEach((i) => note(PENTA[i] / 2, 0.8, 'sine', 0.06, { at: 0.5 }));
  },
  sad(): void {
    [4, 2, 0].forEach((i, k) => note(PENTA[i] / 2, 0.35, 'triangle', 0.12, { at: k * 0.18, slide: 0.94 }));
  },
  star(i: number): void {
    note(PENTA[3 + i * 2] ?? 1400, 0.3, 'sine', 0.12, { rev: 0.6 });
  },
};
