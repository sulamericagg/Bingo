// Trilha sintetizada offline (livre de direitos): 4-on-the-floor + baixo + arpejo + pad, I–V–vi–IV.
// genMusic({ dur, bpm, hits, whooshes, outroAt, loop }) -> Buffer WAV (44.1 kHz, estéreo, 16 bits)
const SR = 44100;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296 * 2 - 1;
  };
}
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function genMusic({ dur, bpm = 124, hits = [], whooshes = [], outroAt = null, loop = false, seed = 3 }) {
  const N = Math.ceil(dur * SR);
  const tail = loop ? SR * 2 : 0;
  const L = new Float32Array(N + tail);
  const R = new Float32Array(N + tail);
  const noise = rng(seed);
  const beat = 60 / bpm;
  const bar = beat * 4;
  // I–V–vi–IV em Dó maior
  const chords = [
    [48, 55, 60, 64, 67],
    [43, 55, 59, 62, 67],
    [45, 57, 60, 64, 69],
    [41, 53, 57, 60, 65],
  ];
  const add = (buf, i, v) => {
    if (i >= 0 && i < buf.length) buf[i] += v;
  };
  const end = outroAt != null ? outroAt : dur;
  const energy = (t) => (loop ? 1 : t < 0.15 ? 0.6 : 1);

  // ---------------- bateria ----------------
  for (let b = 0; b * beat < end + (loop ? 0 : 0.01); b++) {
    const t0 = b * beat;
    if (t0 >= end) break;
    // bumbo
    const kl = Math.floor(0.32 * SR);
    let ph = 0;
    for (let i = 0; i < kl; i++) {
      const t = i / SR;
      const f = 45 + 110 * Math.exp(-t * 28);
      ph += (2 * Math.PI * f) / SR;
      const v = Math.sin(ph) * Math.exp(-t * 9) * 0.62 * energy(t0);
      add(L, Math.floor(t0 * SR) + i, v);
      add(R, Math.floor(t0 * SR) + i, v);
    }
    // palma nos tempos 2 e 4
    if (b % 2 === 1) {
      let lp = 0;
      for (let i = 0; i < 0.18 * SR; i++) {
        const t = i / SR;
        const n = noise();
        lp += (n - lp) * 0.35;
        const env = (Math.exp(-t * 30) + 0.6 * Math.exp(-Math.max(0, t - 0.012) * 40) * (t > 0.012 ? 1 : 0)) * 0.22;
        const v = (n - lp) * env;
        add(L, Math.floor(t0 * SR) + i, v * 1.1);
        add(R, Math.floor(t0 * SR) + i, v * 0.9);
      }
    }
    // chimbal no contratempo + 16avos leves
    for (const [off, amp] of [[0.5, 0.11], [0.25, 0.035], [0.75, 0.05]]) {
      const ts = t0 + off * beat;
      if (ts >= end) continue;
      let prev = 0;
      for (let i = 0; i < 0.05 * SR; i++) {
        const n = noise();
        const v = (n - prev) * Math.exp(-(i / SR) * 70) * amp;
        prev = n;
        add(L, Math.floor(ts * SR) + i, v * (off === 0.75 ? 0.6 : 1));
        add(R, Math.floor(ts * SR) + i, v * (off === 0.25 ? 0.6 : 1));
      }
    }
  }

  // ---------------- baixo (colcheias no contratempo) ----------------
  {
    let lp = 0;
    let ph = 0;
    for (let i = 0; i < Math.min(N, Math.floor(end * SR)); i++) {
      const t = i / SR;
      const ch = chords[Math.floor(t / bar) % 4];
      const e8 = (t % (beat / 2)) / (beat / 2);
      const off = Math.floor(t / (beat / 2)) % 2 === 1;
      const f = mtof(ch[0] - 12 + (off ? 0 : 12));
      ph = (ph + f / SR) % 1;
      const saw = ph * 2 - 1;
      const env = Math.exp(-e8 * 3.5) * (off ? 1 : 0.35);
      lp += (saw - lp) * 0.06;
      // sidechain do bumbo
      const sc = 1 - 0.6 * Math.exp(-(t % beat) * 12);
      const v = lp * env * 0.32 * sc;
      L[i] += v;
      R[i] += v;
    }
  }

  // ---------------- pad ----------------
  {
    const phs = new Float64Array(10);
    let lpL = 0;
    let lpR = 0;
    const padEnd = loop ? N : Math.min(N, Math.floor((outroAt != null ? dur : end) * SR));
    for (let i = 0; i < padEnd; i++) {
      const t = i / SR;
      const ch = outroAt != null && t > outroAt ? chords[0] : chords[Math.floor(t / bar) % 4];
      let sL = 0;
      let sR = 0;
      for (let k = 1; k < 5; k++) {
        const f = mtof(ch[k]);
        phs[k] = (phs[k] + (f * 1.003) / SR) % 1;
        phs[k + 5] = (phs[k + 5] + (f * 0.997) / SR) % 1;
        sL += phs[k] * 2 - 1;
        sR += phs[k + 5] * 2 - 1;
      }
      lpL += (sL - lpL) * 0.02;
      lpR += (sR - lpR) * 0.02;
      const sc = 1 - 0.5 * Math.exp(-(t % beat) * 8);
      let amp = 0.045 * sc;
      if (outroAt != null && t > outroAt) amp = 0.07 * Math.exp(-(t - outroAt) * 0.8);
      L[i] += lpL * amp;
      R[i] += lpR * amp;
    }
  }

  // ---------------- arpejo (16avos) com eco ping-pong ----------------
  {
    const step = beat / 4;
    const pattern = [1, 2, 3, 4, 3, 2, 4, 3];
    const arpEnd = outroAt != null ? Math.min(dur, outroAt + bar) : end;
    for (let s = 0; s * step < arpEnd; s++) {
      const t0 = s * step;
      if (!loop && t0 < 0.1) continue;
      const ch = chords[Math.floor(t0 / bar) % 4];
      const note = ch[pattern[s % 8]] + 12 + (s % 16 === 14 ? 12 : 0);
      const f = mtof(note);
      const fade = outroAt != null && t0 > outroAt ? Math.exp(-(t0 - outroAt) * 2) : 1;
      const len = Math.floor(0.22 * SR);
      for (let i = 0; i < len; i++) {
        const t = i / SR;
        const ph = (f * t) % 1;
        const sq = (ph < 0.5 ? 1 : -1) * 0.5 + (Math.abs(ph * 4 - 2) - 1) * 0.5;
        const v = sq * Math.exp(-t * 18) * 0.08 * fade;
        const idx = Math.floor(t0 * SR) + i;
        add(L, idx, v);
        add(R, idx, v);
        // ecos
        const d1 = Math.floor(beat * 0.75 * SR);
        add(L, idx + d1, v * 0.35);
        add(R, idx + d1 * 2, v * 0.2);
      }
    }
  }

  // ---------------- efeitos: impacto e whoosh ----------------
  for (const h of hits) {
    const t0 = Math.floor(h * SR);
    let ph = 0;
    let lp = 0;
    for (let i = 0; i < 1.2 * SR; i++) {
      const t = i / SR;
      ph += (2 * Math.PI * (38 + 60 * Math.exp(-t * 10))) / SR;
      const n = noise();
      lp += (n - lp) * 0.08;
      const v = Math.sin(ph) * Math.exp(-t * 3.2) * 0.75 + lp * Math.exp(-t * 6) * 0.5 + n * Math.exp(-t * 14) * 0.12;
      add(L, t0 + i, v);
      add(R, t0 + i, v);
    }
  }
  for (const w of whooshes) {
    const len = 0.32;
    const t0 = Math.floor((w - len) * SR);
    let lp = 0;
    for (let i = 0; i < len * SR + 0.08 * SR; i++) {
      const t = i / SR;
      const k = Math.min(1, t / len);
      const n = noise();
      lp += (n - lp) * (0.02 + 0.3 * k * k);
      const env = t < len ? k * k : Math.exp(-(t - len) * 40);
      const v = lp * env * 0.35;
      const pan = Math.sin(k * Math.PI);
      add(L, t0 + i, v * (1 - pan * 0.5));
      add(R, t0 + i, v * (0.5 + pan * 0.5));
    }
  }

  // loop: devolve a cauda para o início (emenda sem clique)
  if (loop) for (let i = 0; i < tail; i++) {
    L[i] += L[N + i];
    R[i] += R[N + i];
  }

  // fade final + normalização com saturação suave
  let peak = 0;
  for (let i = 0; i < N; i++) {
    if (!loop) {
      const t = i / SR;
      const f = Math.min(1, (dur - t) / 0.6, t / 0.01);
      L[i] *= f;
      R[i] *= f;
    }
    L[i] = Math.tanh(L[i] * 1.2);
    R[i] = Math.tanh(R[i] * 1.2);
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const g = 0.89 / (peak || 1);
  const out = Buffer.alloc(44 + N * 4);
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + N * 4, 4);
  out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(2, 22);
  out.writeUInt32LE(SR, 24);
  out.writeUInt32LE(SR * 4, 28);
  out.writeUInt16LE(4, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36);
  out.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) {
    out.writeInt16LE(Math.round(L[i] * g * 32767), 44 + i * 4);
    out.writeInt16LE(Math.round(R[i] * g * 32767), 46 + i * 4);
  }
  return out;
}
