/* ============================================================
 *  BLOOP AUDIO — instrumentos sintetizados da música procedural.
 *  Cada instrumento toca UMA nota: (ctx, saída, envio de reverb, t, Hz, dur, vel).
 *  Funcionam em AudioContext e OfflineAudioContext. Timbres suaves
 *  (passa-baixa, ataques arredondados) e níveis parecidos entre si.
 * ============================================================ */
import { mtof, noiseBuf, perc, rng, type Ctx } from '../dsp';

export type InstId =
  | 'padWarm' | 'padGlass' | 'padDark' | 'strings' | 'organ' | 'choir'
  | 'epiano' | 'pluck' | 'kalimba' | 'marimba' | 'musicbox' | 'bell' | 'harp' | 'guitar' | 'viola' | 'steel' | 'vibes'
  | 'flute' | 'chip' | 'synth' | 'brass' | 'accordion' | 'whistle' | 'ocarina' | 'clarinet'
  | 'subBass' | 'pluckBass' | 'roundBass' | 'tuba' | 'chipBass';
export type DrumId = 'kick' | 'snare' | 'hat' | 'shaker' | 'clap' | 'wood' | 'tom' | 'lowTom' | 'conga' | 'rim' | 'tri' | 'bongo' | 'brush' | 'snap' | 'zabumba' | 'cowbell';

export interface NoteOut {
  c: Ctx;
  out: AudioNode;
  rev: AudioNode;
  /** envio para o reverb 0..1 */
  wet: number;
}

function sendTo(o: NoteOut, src: AudioNode, wet = o.wet): void {
  src.connect(o.out);
  if (wet > 0) {
    const s = o.c.createGain();
    s.gain.value = wet;
    src.connect(s).connect(o.rev);
  }
}
function osc(c: Ctx, type: OscillatorType, f: number, t: number, end: number, detune = 0): OscillatorNode {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = f;
  if (detune) o.detune.value = detune;
  o.start(t);
  o.stop(end);
  return o;
}
function lp(c: Ctx, f: number, q = 0.6): BiquadFilterNode {
  const b = c.createBiquadFilter();
  b.type = 'lowpass';
  b.frequency.value = f;
  b.Q.value = q;
  return b;
}
/** envelope de nota sustentada (a, release) */
function sus(p: AudioParam, t: number, vol: number, a: number, dur: number, rel: number): void {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(vol, t + a);
  p.setValueAtTime(vol, t + Math.max(a, dur));
  p.setTargetAtTime(0, t + Math.max(a, dur), rel / 4);
}

/* ---------------- corda pinçada (Karplus-Strong em JS, cache por nota) ---------------- */
const KS = new WeakMap<Ctx, Map<string, { b: AudioBuffer; rate: number }>>();
function ksBuf(c: Ctx, f: number, bright: number, decay: number, sec: number): { b: AudioBuffer; rate: number } {
  let m = KS.get(c);
  if (!m) KS.set(c, (m = new Map()));
  const key = `${Math.round(f * 10)}:${bright}:${decay}:${sec.toFixed(1)}`;
  const have = m.get(key);
  if (have) return have;
  const sr = c.sampleRate;
  const len = Math.floor(sr * sec);
  const b = c.createBuffer(1, len, sr);
  const d = b.getChannelData(0);
  const N = Math.max(2, Math.round(sr / f - 0.5));
  const r = rng(Math.round(f * 100));
  let lpv = 0;
  for (let i = 0; i < N && i < len; i++) {
    lpv += (r() * 2 - 1 - lpv) * bright;
    d[i] = lpv;
  }
  for (let i = N; i < len; i++) d[i] = decay * 0.5 * (d[i - N] + d[i - N - 1 < 0 ? 0 : i - N - 1]);
  // tira DC e faz fade final
  let mean = 0;
  for (let i = 0; i < N; i++) mean += d[i];
  mean /= N;
  for (let i = 0; i < len; i++) d[i] -= mean * Math.pow(decay, i / N);
  const fo = Math.floor(sr * 0.05);
  for (let i = 0; i < fo; i++) d[len - 1 - i] *= i / fo;
  const out = { b, rate: f / (sr / (N + 0.5)) };
  m.set(key, out);
  return out;
}
function ks(o: NoteOut, t: number, f: number, dur: number, vel: number, bright: number, decay: number, cut: number): void {
  const { c } = o;
  const s = c.createBufferSource();
  const k = ksBuf(c, f, bright, decay, Math.min(2.5, Math.max(0.6, Math.round((dur + 0.8) * 2) / 2)));
  s.buffer = k.b;
  s.playbackRate.value = k.rate;
  const gg = c.createGain();
  gg.gain.setValueAtTime(vel * 0.9, t);
  gg.gain.setValueAtTime(vel * 0.9, t + dur);
  gg.gain.setTargetAtTime(0, t + dur, 0.12);
  const f1 = lp(c, cut);
  s.connect(f1).connect(gg);
  sendTo(o, gg);
  s.start(t);
  s.stop(t + dur + 0.7);
}

/* ---------------- instrumentos melódicos ---------------- */
export function playInst(id: InstId, o: NoteOut, t: number, f: number, dur: number, vel: number): void {
  const { c } = o;
  const end = t + dur + 1.6;
  switch (id) {
    case 'padWarm':
    case 'padDark':
    case 'strings': {
      const dark = id === 'padDark';
      const a = id === 'strings' ? 0.25 : 0.6;
      const gg = c.createGain();
      sus(gg.gain, t, vel * (id === 'strings' ? 0.07 : 0.06), a, dur, id === 'strings' ? 0.6 : 1.4);
      const fl = lp(c, dark ? 520 : id === 'strings' ? 2100 : 1300, 0.7);
      if (!dark) {
        fl.frequency.setValueAtTime(fl.frequency.value * 0.6, t);
        fl.frequency.linearRampToValueAtTime(fl.frequency.value, t + a + 0.3);
      }
      for (const dt of id === 'strings' ? [-9, 0, 8] : [-7, 7]) osc(c, 'sawtooth', f, t, end, dt).connect(fl);
      if (dark) osc(c, 'triangle', f / 2, t, end).connect(fl);
      fl.connect(gg);
      sendTo(o, gg, o.wet + 0.15);
      return;
    }
    case 'padGlass': {
      const gg = c.createGain();
      sus(gg.gain, t, vel * 0.06, 0.5, dur, 1.6);
      osc(c, 'sine', f, t, end, -4).connect(gg);
      const h = c.createGain();
      h.gain.value = 0.35;
      osc(c, 'triangle', f * 2, t, end, 5).connect(h).connect(gg);
      sendTo(o, gg, o.wet + 0.25);
      return;
    }
    case 'organ': {
      const gg = c.createGain();
      sus(gg.gain, t, vel * 0.06, 0.03, dur, 0.15);
      [1, 2, 3, 4].forEach((m, i) => {
        const h = c.createGain();
        h.gain.value = [1, 0.5, 0.25, 0.12][i];
        osc(c, 'sine', f * m, t, end).connect(h).connect(gg);
      });
      sendTo(o, gg);
      return;
    }
    case 'choir': {
      const gg = c.createGain();
      sus(gg.gain, t, vel * 0.1, 0.45, dur, 0.9);
      const src = c.createGain();
      for (const dt of [-10, 0, 9]) osc(c, 'sawtooth', f, t, end, dt).connect(src);
      for (const [ff, q, v] of [
        [650, 5, 1],
        [1080, 6, 0.6],
        [2600, 8, 0.15],
      ] as const) {
        const b = c.createBiquadFilter();
        b.type = 'bandpass';
        b.frequency.value = ff;
        b.Q.value = q;
        const bv = c.createGain();
        bv.gain.value = v;
        src.connect(b).connect(bv).connect(gg);
      }
      sendTo(o, gg, o.wet + 0.25);
      return;
    }
    case 'epiano': {
      // FM suave (dente + "tine")
      const gg = c.createGain();
      perc(gg.gain, t, vel * 0.16, 0.004, Math.min(2.2, dur + 0.9));
      const car = osc(c, 'sine', f, t, end);
      const mod = osc(c, 'sine', f, t, end);
      const mg = c.createGain();
      mg.gain.setValueAtTime(f * 1.2, t);
      mg.gain.setTargetAtTime(f * 0.15, t, 0.25);
      mod.connect(mg).connect(car.frequency);
      car.connect(gg);
      const tine = osc(c, 'sine', f * 7.02, t, t + 0.2);
      const tg = c.createGain();
      perc(tg.gain, t, vel * 0.012, 0.002, 0.15);
      tine.connect(tg).connect(gg);
      sendTo(o, gg);
      return;
    }
    case 'pluck': {
      const gg = c.createGain();
      perc(gg.gain, t, vel * 0.13, 0.003, Math.min(0.9, dur + 0.35));
      const fl = lp(c, 3000, 2);
      fl.frequency.setValueAtTime(Math.min(5000, f * 8), t);
      fl.frequency.setTargetAtTime(f * 1.5, t, 0.08);
      osc(c, 'sawtooth', f, t, t + 1.2).connect(fl);
      osc(c, 'triangle', f, t, t + 1.2, 6).connect(fl);
      fl.connect(gg);
      sendTo(o, gg);
      return;
    }
    case 'kalimba':
    case 'marimba':
    case 'musicbox':
    case 'vibes': {
      const gg = c.createGain();
      const len = id === 'marimba' ? 0.5 : id === 'kalimba' ? 0.9 : id === 'vibes' ? 1.8 : 1.4;
      perc(gg.gain, t, vel * 0.2, 0.002, len);
      osc(c, 'sine', f, t, t + len + 0.1).connect(gg);
      const ratio = id === 'marimba' ? 3.99 : id === 'kalimba' ? 5.4 : id === 'vibes' ? 4 : 3;
      const hv = c.createGain();
      perc(hv.gain, t, id === 'musicbox' ? 0.3 : 0.4, 0.001, id === 'vibes' ? 0.5 : 0.12);
      osc(c, 'sine', f * ratio, t, t + 0.6).connect(hv).connect(gg);
      if (id === 'vibes') {
        const trem = osc(c, 'sine', 5.5, t, t + len + 0.1);
        const tg = c.createGain();
        tg.gain.value = 0.25;
        const amp = c.createGain();
        amp.gain.value = 0.75;
        trem.connect(tg).connect(amp.gain);
        gg.disconnect();
        gg.connect(amp);
        sendTo(o, amp, o.wet + 0.1);
        return;
      }
      sendTo(o, gg, o.wet + (id === 'musicbox' ? 0.2 : 0));
      return;
    }
    case 'bell': {
      const gg = c.createGain();
      perc(gg.gain, t, vel * 0.12, 0.002, 2.2);
      const car = osc(c, 'sine', f, t, t + 2.4);
      const mod = osc(c, 'sine', f * 3.5, t, t + 2.4);
      const mg = c.createGain();
      mg.gain.setValueAtTime(f * 1.6, t);
      mg.gain.setTargetAtTime(f * 0.05, t, 0.3);
      mod.connect(mg).connect(car.frequency);
      car.connect(gg);
      sendTo(o, gg, o.wet + 0.2);
      return;
    }
    case 'harp':
      return ks(o, t, f, dur, vel * 0.55, 0.5, 0.996, 5000);
    case 'guitar':
      return ks(o, t, f, dur, vel * 0.55, 0.35, 0.993, 3200);
    case 'viola': {
      // viola caipira: cordas dobradas (oitava/afinação levemente diferentes)
      ks(o, t, f, dur, vel * 0.42, 0.45, 0.994, 4200);
      ks(o, t + 0.008, f * 2.004, dur, vel * 0.18, 0.5, 0.992, 5200);
      return;
    }
    case 'steel': {
      const gg = c.createGain();
      perc(gg.gain, t, vel * 0.14, 0.003, 0.9);
      const o1 = osc(c, 'sine', f * 1.01, t, t + 1);
      o1.frequency.setTargetAtTime(f, t, 0.02);
      o1.connect(gg);
      for (const [m, v] of [
        [2, 0.35],
        [3.02, 0.12],
      ]) {
        const h = c.createGain();
        h.gain.value = v;
        osc(c, 'sine', f * m, t, t + 0.5).connect(h).connect(gg);
      }
      sendTo(o, gg);
      return;
    }
    case 'flute':
    case 'whistle':
    case 'ocarina':
    case 'clarinet': {
      const gg = c.createGain();
      const a = id === 'whistle' ? 0.03 : 0.06;
      sus(gg.gain, t, vel * (id === 'clarinet' ? 0.08 : 0.11), a, dur * 0.95, 0.12);
      const main = osc(c, id === 'clarinet' ? 'square' : 'sine', f, t, end);
      const vib = osc(c, 'sine', id === 'whistle' ? 6 : 5, t, end);
      const vg = c.createGain();
      vg.gain.setValueAtTime(0, t);
      vg.gain.linearRampToValueAtTime(id === 'ocarina' ? 8 : 14, t + 0.25);
      vib.connect(vg).connect(main.detune);
      if (id === 'clarinet') main.connect(lp(c, f * 3, 0.7)).connect(gg);
      else main.connect(gg);
      if (id === 'ocarina' || id === 'flute') {
        const h = c.createGain();
        h.gain.value = 0.12;
        osc(c, 'sine', f * 2, t, end).connect(h).connect(gg);
      }
      if (id === 'flute') {
        // sopro
        const n = c.createBufferSource();
        n.buffer = noiseBuf(c, 'pink');
        const bp = c.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = f * 2;
        bp.Q.value = 2;
        const ng = c.createGain();
        sus(ng.gain, t, vel * 0.03, 0.05, dur * 0.9, 0.1);
        n.connect(bp).connect(ng).connect(gg);
        n.start(t, Math.random());
        n.stop(end);
      }
      sendTo(o, gg, o.wet + 0.1);
      return;
    }
    case 'chip': {
      const gg = c.createGain();
      sus(gg.gain, t, vel * 0.05, 0.005, dur * 0.85, 0.05);
      osc(c, 'square', f, t, end).connect(lp(c, 3200)).connect(gg);
      sendTo(o, gg, o.wet * 0.5);
      return;
    }
    case 'synth': {
      const gg = c.createGain();
      sus(gg.gain, t, vel * 0.06, 0.02, dur * 0.9, 0.15);
      const fl = lp(c, 2400, 1.5);
      fl.frequency.setValueAtTime(900, t);
      fl.frequency.linearRampToValueAtTime(2400, t + 0.08);
      const a = osc(c, 'sawtooth', f, t, end, -6);
      const b = osc(c, 'square', f, t, end, 6);
      const vib = osc(c, 'sine', 5.2, t, end);
      const vg = c.createGain();
      vg.gain.value = 9;
      vib.connect(vg);
      vg.connect(a.detune);
      vg.connect(b.detune);
      const bg = c.createGain();
      bg.gain.value = 0.5;
      a.connect(fl);
      b.connect(bg).connect(fl);
      fl.connect(gg);
      sendTo(o, gg);
      return;
    }
    case 'brass':
    case 'tuba': {
      const gg = c.createGain();
      sus(gg.gain, t, vel * (id === 'tuba' ? 0.13 : 0.07), id === 'tuba' ? 0.03 : 0.05, dur * 0.9, 0.12);
      const fl = lp(c, 600, 1.2);
      fl.frequency.setValueAtTime(id === 'tuba' ? 200 : 500, t);
      fl.frequency.linearRampToValueAtTime(id === 'tuba' ? 700 : Math.min(3000, f * 5), t + 0.07);
      fl.frequency.setTargetAtTime(id === 'tuba' ? 450 : Math.min(2200, f * 3.5), t + 0.08, 0.2);
      osc(c, 'sawtooth', f, t, end).connect(fl);
      osc(c, 'sawtooth', f, t, end, 7).connect(fl);
      fl.connect(gg);
      sendTo(o, gg, id === 'tuba' ? 0.02 : o.wet);
      return;
    }
    case 'accordion': {
      const gg = c.createGain();
      sus(gg.gain, t, vel * 0.05, 0.04, dur * 0.92, 0.08);
      const fl = c.createBiquadFilter();
      fl.type = 'bandpass';
      fl.frequency.value = Math.min(2200, f * 2.5);
      fl.Q.value = 0.6;
      osc(c, 'sawtooth', f, t, end, -8).connect(fl);
      osc(c, 'sawtooth', f, t, end, 9).connect(fl);
      osc(c, 'square', f * 0.5, t, end).connect(fl);
      fl.connect(gg);
      sendTo(o, gg);
      return;
    }
    case 'subBass':
    case 'roundBass':
    case 'chipBass': {
      const gg = c.createGain();
      sus(gg.gain, t, vel * (id === 'subBass' ? 0.26 : 0.2), 0.008, dur * 0.9, 0.06);
      const type: OscillatorType = id === 'subBass' ? 'sine' : id === 'chipBass' ? 'square' : 'triangle';
      const m = osc(c, type, f, t, end);
      if (id === 'chipBass') m.connect(lp(c, 900)).connect(gg);
      else m.connect(gg);
      if (id === 'subBass') {
        const h = c.createGain();
        h.gain.value = 0.15;
        osc(c, 'triangle', f * 2, t, end).connect(h).connect(gg);
      }
      sendTo(o, gg, 0);
      return;
    }
    case 'pluckBass': {
      const gg = c.createGain();
      perc(gg.gain, t, vel * 0.22, 0.004, Math.min(0.9, dur + 0.25));
      const fl = lp(c, 900, 3);
      fl.frequency.setValueAtTime(1400, t);
      fl.frequency.setTargetAtTime(260, t, 0.09);
      osc(c, 'sawtooth', f, t, t + 1.2).connect(fl);
      osc(c, 'sine', f, t, t + 1.2).connect(gg);
      fl.connect(gg);
      sendTo(o, gg, 0);
      return;
    }
  }
}

/* ---------------- bateria / percussão ---------------- */
export function playDrum(id: DrumId, o: NoteOut, t: number, vel: number): void {
  const { c } = o;
  const nz = (kind: 'white' | 'pink', ft: BiquadFilterType, f: number, q: number, vol: number, dur: number, a = 0.001, at = t) => {
    const s = c.createBufferSource();
    s.buffer = noiseBuf(c, kind);
    const fl = c.createBiquadFilter();
    fl.type = ft;
    fl.frequency.value = f;
    fl.Q.value = q;
    const gg = c.createGain();
    perc(gg.gain, at, vol * vel, a, dur);
    s.connect(fl).connect(gg);
    s.start(at, Math.random() * 1.5);
    s.stop(at + dur + 0.05);
    return gg;
  };
  const tn = (f: number, f2: number, dur: number, vol: number, type: OscillatorType = 'sine', glide = 0.06) => {
    const os = c.createOscillator();
    os.type = type;
    os.frequency.setValueAtTime(f, t);
    os.frequency.exponentialRampToValueAtTime(f2, t + glide);
    const gg = c.createGain();
    perc(gg.gain, t, vol * vel, 0.002, dur);
    os.connect(gg);
    os.start(t);
    os.stop(t + dur + 0.05);
    return gg;
  };
  const dry = (n: AudioNode) => n.connect(o.out);
  const wet = (n: AudioNode, w: number) => {
    n.connect(o.out);
    const s = c.createGain();
    s.gain.value = w;
    n.connect(s).connect(o.rev);
  };
  switch (id) {
    case 'kick':
      dry(tn(140, 48, 0.32, 0.55, 'sine', 0.09));
      dry(nz('white', 'lowpass', 1800, 0.5, 0.05, 0.015));
      return;
    case 'zabumba':
      dry(tn(110, 60, 0.38, 0.5, 'sine', 0.05));
      dry(nz('pink', 'lowpass', 400, 0.7, 0.2, 0.08));
      return;
    case 'snare':
      wet(nz('white', 'bandpass', 1900, 0.7, 0.22, 0.16), 0.12);
      dry(tn(210, 170, 0.09, 0.15, 'triangle'));
      return;
    case 'brush':
      wet(nz('pink', 'bandpass', 3000, 0.6, 0.08, 0.22, 0.03), 0.1);
      return;
    case 'clap':
      for (let i = 0; i < 3; i++) wet(nz('white', 'bandpass', 1300, 1.2, 0.18, i === 2 ? 0.16 : 0.025, 0.001, t + i * 0.011), 0.15);
      return;
    case 'snap':
      wet(nz('white', 'bandpass', 2400, 2.5, 0.15, 0.05), 0.2);
      return;
    case 'hat':
      dry(nz('white', 'bandpass', 8200, 1.2, 0.06, 0.045));
      return;
    case 'shaker':
      dry(nz('white', 'bandpass', 5200, 1.5, 0.07, 0.07, 0.018));
      return;
    case 'wood': {
      const a = tn(1250, 1200, 0.06, 0.16, 'sine', 0.01);
      wet(a, 0.15);
      return;
    }
    case 'rim':
      wet(tn(1700, 1650, 0.03, 0.12, 'triangle', 0.01), 0.1);
      dry(nz('white', 'bandpass', 3000, 3, 0.05, 0.02));
      return;
    case 'tom':
      wet(tn(190, 120, 0.3, 0.35, 'sine', 0.12), 0.12);
      return;
    case 'lowTom':
      wet(tn(110, 70, 0.45, 0.42, 'sine', 0.15), 0.1);
      return;
    case 'conga':
      wet(tn(260, 220, 0.18, 0.28, 'sine', 0.02), 0.1);
      return;
    case 'bongo':
      wet(tn(420, 380, 0.1, 0.22, 'sine', 0.015), 0.1);
      return;
    case 'tri': {
      const gg = c.createGain();
      perc(gg.gain, t, 0.04 * vel, 0.002, 0.9);
      for (const m of [1, 2.76, 5.4]) {
        const os = c.createOscillator();
        os.frequency.value = 2400 * m * 0.5;
        os.connect(gg);
        os.start(t);
        os.stop(t + 1);
      }
      wet(gg, 0.25);
      return;
    }
    case 'cowbell': {
      const gg = c.createGain();
      perc(gg.gain, t, 0.06 * vel, 0.002, 0.25);
      const fl = lp(c, 2500, 1);
      for (const f of [560, 845]) {
        const os = c.createOscillator();
        os.type = 'square';
        os.frequency.value = f;
        os.connect(fl);
        os.start(t);
        os.stop(t + 0.3);
      }
      fl.connect(gg);
      wet(gg, 0.1);
      return;
    }
  }
}

export const isDrum = (id: string): id is DrumId =>
  ['kick', 'snare', 'hat', 'shaker', 'clap', 'wood', 'tom', 'lowTom', 'conga', 'rim', 'tri', 'bongo', 'brush', 'snap', 'zabumba', 'cowbell'].includes(id);

export { mtof };
