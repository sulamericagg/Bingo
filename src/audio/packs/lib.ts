/* ============================================================
 *  BLOOP AUDIO — receitas reutilizáveis (blocos de som parametrizados).
 *  Os pacotes de cada jogo combinam estes blocos com afinações, timbres e
 *  texturas próprias. Tudo sintetizado; nada copiado de jogos/marcas.
 * ============================================================ */
import { arp, bell, grains, knock, mtof, noise, pop, thump, tone, whoosh, type V } from '../dsp';
import type { Recipe, SoundDef } from '../sound';

export const S = (r: Recipe, dur: number, o: Partial<SoundDef> = {}): SoundDef => ({ r, dur, ...o });
export const both =
  (...rs: Recipe[]): Recipe =>
  (v) => {
    for (const r of rs) r(v);
  };
export const later =
  (dt: number, r: Recipe): Recipe =>
  (v) =>
    r({ ...v, t: v.t + dt });

/* ----------------------------- interface ----------------------------- */
/** bolha (hub): pop redondo com brilho */
export const bubble =
  (f = 520, up = 2.4, vol = 0.5): Recipe =>
  (v) => {
    const k = 1 + (v.r() - 0.5) * 0.08;
    pop(v, { f: f * k, up, vol, dur: 0.08 });
    tone(v, { f: f * 2 * k, f2: f * 3 * k, dur: 0.05, vol: vol * 0.15, delay: 0.012 });
  };
/** tique de madeira/plástico */
export const tick =
  (f = 1200, vol = 0.3, type: OscillatorType = 'triangle'): Recipe =>
  (v) =>
    tone(v, { f, f2: f * 0.8, dur: 0.035, vol, type, lp: 3500 });
export const woodClick =
  (f = 900, vol = 0.5): Recipe =>
  (v) =>
    knock(v, { fs: [f, f * 2.3, f * 3.9], dur: 0.09, vol, q: 14 });
export const metalClick =
  (f = 2200, vol = 0.35): Recipe =>
  (v) => {
    knock(v, { fs: [f, f * 1.47, f * 2.09], dur: 0.12, vol, q: 30 });
    noise(v, { dur: 0.012, vol: vol * 0.3, f: 3500, q: 1 });
  };
/** sininho de moeda: 2 notas (nota → quinta) */
export const coinChime =
  (m = 84, vol = 0.35, fm = true): Recipe =>
  (v) => {
    if (fm) {
      bell(v, { f: mtof(m), dur: 0.12, vol: vol * 0.7, ratio: 2, index: 0.6 });
      bell(v, { f: mtof(m + 7), dur: 0.45, vol, ratio: 2, index: 0.7, delay: 0.06 });
    } else {
      tone(v, { f: mtof(m), dur: 0.08, vol: vol * 0.6, type: 'square', lp: 3000 });
      tone(v, { f: mtof(m + 7), dur: 0.3, vol, delay: 0.06 });
    }
  };
/** brilho (estrelinhas que sobem) */
export const sparkle =
  (base = 88, n = 5, vol = 0.18, step = 0.05): Recipe =>
  (v) => {
    const sc = [0, 4, 7, 12, 16, 19, 24];
    for (let i = 0; i < n; i++) bell(v, { f: mtof(base + sc[i % sc.length] + (v.r() < 0.3 ? 2 : 0)), dur: 0.35, vol: vol * (1 - i * 0.08), ratio: 3, index: 0.5, delay: i * step + v.r() * 0.01 });
  };
/** fanfarra curta */
export const fanfare =
  (notes: number[], step = 0.09, vol = 0.22, type: OscillatorType = 'triangle', tail?: number[]): Recipe =>
  (v) => {
    arp(v, notes, { step, dur: step * 2.2, vol, type, lp: 3200 });
    if (tail) for (const m of tail) tone(v, { f: mtof(m), dur: 0.9, vol: vol * 0.7, type: 'triangle', lp: 2600, delay: notes.length * step, a: 0.01 });
  };
/** "uóóón" suave e descendente (perdeu — nunca assusta) */
export const softFail =
  (m = 67, type: OscillatorType = 'triangle', vol = 0.3): Recipe =>
  (v) => {
    tone(v, { f: mtof(m), f2: mtof(m - 1), dur: 0.22, vol, type, lp: 2000 });
    tone(v, { f: mtof(m - 4), f2: mtof(m - 7), dur: 0.55, vol, type, lp: 1600, delay: 0.18, vib: [5, 18] });
  };

/* ----------------------------- ação ----------------------------- */
export const swish =
  (f = 700, f2 = 2400, dur = 0.22, vol = 0.4): Recipe =>
  (v) =>
    whoosh(v, { dur, vol, f, f2 });
export const boing =
  (f = 220, up = 2.2, vol = 0.4): Recipe =>
  (v) =>
    tone(v, { f, f2: f * up, dur: 0.28, vol, vib: [14, 40] });
export const thud =
  (f = 110, dur = 0.2, vol = 0.6): Recipe =>
  (v) =>
    thump(v, { f, dur, vol });
/** batida em madeira (machado, tronco) */
export const woodHit =
  (f = 260, vol = 0.6, dur = 0.22): Recipe =>
  (v) => {
    const k = 1 + (v.r() - 0.5) * 0.12;
    knock(v, { fs: [f * k, f * 2.7 * k, f * 4.1 * k], dur, vol, q: 9, kind: 'pink' });
    thump(v, { f: f * 0.45, dur: dur * 0.8, vol: vol * 0.5 });
  };
/** pancada metálica suave (panela, chapa) */
export const clang =
  (f = 520, vol = 0.35, dur = 0.6): Recipe =>
  (v) => {
    bell(v, { f, dur, vol, ratio: 1.41, index: 1.2 });
    bell(v, { f: f * 2.76, dur: dur * 0.5, vol: vol * 0.3, ratio: 1.2, index: 0.5 });
  };
/** pedra/cascalho (pedra quebrando) */
export const rocks =
  (n = 10, vol = 0.35, span = 0.25): Recipe =>
  (v) => {
    noise(v, { dur: 0.06, vol: vol * 0.8, f: 1400, q: 1.2 });
    grains(v, { n, span, dur: 0.04, vol, f: [700, 2600], q: 4, decay: 1.5 });
    thump(v, { f: 90, dur: 0.15, vol: vol * 0.6 });
  };
export const dirt =
  (vol = 0.5, span = 0.18): Recipe =>
  (v) => {
    noise(v, { kind: 'brown', dur: 0.16, vol, ft: 'lowpass', f: 600 });
    grains(v, { n: 8, span, dur: 0.05, vol: vol * 0.45, f: [300, 1100], q: 2, kind: 'pink', decay: 1 });
  };
export const sand =
  (vol = 0.4, span = 0.22): Recipe =>
  (v) => {
    noise(v, { dur: span, vol: vol * 0.5, f: 3200, q: 0.7, a: 0.03 });
    grains(v, { n: 16, span, dur: 0.02, vol: vol * 0.4, f: [2500, 5000], q: 2, decay: 1 });
  };
export const glass =
  (vol = 0.3): Recipe =>
  (v) => {
    for (let i = 0; i < 6; i++) bell(v, { f: 1800 + v.r() * 1800, dur: 0.25 + v.r() * 0.3, vol: vol * (0.5 + v.r() * 0.5), ratio: 1.41 + v.r() * 0.6, index: 0.3, delay: i * 0.025 + v.r() * 0.02 });
    noise(v, { dur: 0.08, vol: vol * 0.4, ft: 'bandpass', f: 3200, q: 0.8 });
  };
export const leaves =
  (vol = 0.35, span = 0.3): Recipe =>
  (v) =>
    grains(v, { n: 14, span, dur: 0.05, vol, f: [1800, 4200], q: 1.5, kind: 'pink' });
export const splash =
  (vol = 0.45): Recipe =>
  (v) => {
    noise(v, { kind: 'pink', dur: 0.4, vol, f: 1400, f2: 500, q: 0.6, a: 0.01 });
    for (let i = 0; i < 5; i++) pop(v, { f: 400 + v.r() * 700, vol: vol * 0.3, up: 2.5, delay: 0.05 + v.r() * 0.2 });
  };
export const poof =
  (vol = 0.45, notes = [76, 81, 86]): Recipe =>
  (v) => {
    noise(v, { kind: 'pink', dur: 0.4, vol, f: 900, f2: 240, q: 0.6, a: 0.01 });
    arp(v, notes, { step: 0.04, dur: 0.15, vol: vol * 0.25, delay: 0.05 });
  };
export const zap =
  (f = 400, f2 = 1600, vol = 0.3, type: OscillatorType = 'sawtooth'): Recipe =>
  (v) =>
    tone(v, { f, f2, dur: 0.18, vol, type, lp: 2600, q: 3 });
export const sizzle =
  (dur = 0.6, vol = 0.25): Recipe =>
  (v) => {
    // chiado de chapa: banda média-alta, sem "agudo de vidro"
    noise(v, { kind: 'pink', dur, vol: vol * 0.7, ft: 'bandpass', f: 3800, q: 0.8, a: 0.05, hold: 0.6 });
    grains(v, { n: Math.round(dur * 40), span: dur, dur: 0.012, vol, f: [2200, 4500], q: 2 });
  };
export const bubbles =
  (n = 6, span = 0.5, vol = 0.3, f: [number, number] = [300, 700]): Recipe =>
  (v) => {
    for (let i = 0; i < n; i++) pop(v, { f: f[0] + v.r() * (f[1] - f[0]), vol: vol * (0.5 + v.r() * 0.5), up: 1.8, dur: 0.06, delay: v.r() * span });
  };
/** sino de 2 tons (ding-dong) */
export const dingDong =
  (m1 = 76, m2 = 72, vol = 0.35): Recipe =>
  (v) => {
    bell(v, { f: mtof(m1), dur: 1.2, vol, ratio: 1, index: 0.25 });
    bell(v, { f: mtof(m2), dur: 1.5, vol, ratio: 1, index: 0.25, delay: 0.45 });
  };
export const ratchet =
  (n = 6, f = 2500, vol = 0.25, gap = 0.035): Recipe =>
  (v) => {
    for (let i = 0; i < n; i++) knock(v, { fs: [f, f * 1.6], dur: 0.03, vol, q: 10, delay: i * gap });
  };
/** rangido (porta de madeira) */
export const creak =
  (f = 18, f2 = 40, dur = 0.5, vol = 0.3): Recipe =>
  (v) => {
    let t = 0;
    let i = 0;
    while (t < dur) {
      const k = t / dur;
      const rate = f + (f2 - f) * k;
      knock(v, { fs: [600 + 300 * k, 1400 + 400 * k], dur: 0.04, vol: vol * (0.4 + 0.6 * Math.sin(Math.PI * k)), q: 12, delay: t, kind: 'pink' });
      t += 1 / rate;
      if (++i > 80) break;
    }
  };

/* ----------------------------- natureza (eventos) ----------------------------- */
export const birdChirp =
  (base = 3000, n = 3, vol = 0.12): Recipe =>
  (v) => {
    const b = base * (0.85 + v.r() * 0.3);
    for (let i = 0; i < n; i++) tone(v, { f: b * (1 + v.r() * 0.2), f2: b * (1.3 + v.r() * 0.4), dur: 0.06 + v.r() * 0.04, vol, delay: i * (0.09 + v.r() * 0.05), glide: 0.05 });
  };
export const owl =
  (vol = 0.3): Recipe =>
  (v) => {
    const f = 360 + v.r() * 40;
    tone(v, { f: f * 1.06, f2: f, dur: 0.35, vol, a: 0.06, vib: [4, 10] });
    tone(v, { f: f * 1.02, f2: f * 0.94, dur: 0.6, vol: vol * 0.9, a: 0.08, delay: 0.45, vib: [4, 10] });
    noise(v, { kind: 'pink', dur: 0.4, vol: vol * 0.05, f: f * 2, q: 2, a: 0.06 });
  };
export const frog =
  (vol = 0.25): Recipe =>
  (v) => {
    for (let i = 0; i < 2; i++) {
      const d = i * 0.22;
      for (let k = 0; k < 6; k++) tone(v, { f: 180 + v.r() * 20, f2: 160, dur: 0.025, vol, type: 'triangle', lp: 900, delay: d + k * 0.022 });
    }
  };
/** rosnado de bicho FOFO (grave, curto, sem susto) */
export const growl =
  (f = 85, vol = 0.3, dur = 0.7): Recipe =>
  (v) => {
    tone(v, { f, f2: f * 0.85, dur, vol, type: 'sawtooth', lp: 420, q: 4, a: 0.12, vib: [22, 60] });
    noise(v, { kind: 'brown', dur, vol: vol * 0.4, ft: 'lowpass', f: 300, a: 0.12 });
  };
export const twig =
  (vol = 0.35): Recipe =>
  (v) => {
    knock(v, { fs: [1800, 3100], dur: 0.04, vol, q: 6 });
    grains(v, { n: 4, span: 0.08, dur: 0.02, vol: vol * 0.5, f: [1500, 3500], q: 3 });
  };
export const drip =
  (vol = 0.3): Recipe =>
  (v) => {
    const f = 900 + v.r() * 900;
    tone(v, { f, f2: f * 2.2, dur: 0.06, vol, glide: 0.04 });
  };

/* ----------------------------- camas (loops) ----------------------------- */
/** vento: ruído rosa passa-faixa com rajadas lentas */
export const windBed =
  (center = 500, vol = 0.4, gust = 0.6, len = 12): Recipe =>
  (v) => {
    const { c, t } = v;
    const s = c.createBufferSource();
    s.buffer = (() => {
      const b = c.createBuffer(1, Math.floor(c.sampleRate * (len + 1)), c.sampleRate);
      const d = b.getChannelData(0);
      let b0 = 0,
        b1 = 0,
        b2 = 0;
      for (let i = 0; i < d.length; i++) {
        const w = v.r() * 2 - 1;
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
      }
      return b;
    })();
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 0.8;
    const g = c.createGain();
    g.gain.value = vol * (1 - gust * 0.5);
    f.frequency.value = center;
    for (let k = 0; k <= len; k += 1.5) {
      const amt = v.r();
      g.gain.linearRampToValueAtTime(vol * (1 - gust + gust * amt), t + k);
      f.frequency.linearRampToValueAtTime(center * (0.7 + amt * 0.8), t + k);
    }
    s.connect(f).connect(g).connect(v.out);
    s.start(t);
  };
/** grilos: trinados curtos em ~4.3 kHz, espalhados */
export const cricketsBed =
  (vol = 0.08, len = 8, density = 3): Recipe =>
  (v) => {
    const n = Math.round(len * density);
    for (let i = 0; i < n; i++) {
      const at = v.r() * len;
      const f = 4000 + v.r() * 700;
      for (let k = 0; k < 3; k++) tone(v, { f, dur: 0.03, vol: vol * (0.5 + v.r() * 0.5), delay: at + k * 0.045 });
    }
  };
/** fogueira: ronco grave + estalos */
export const fireBed =
  (vol = 0.3, len = 8): Recipe =>
  (v) => {
    noise(v, { kind: 'brown', dur: len + 1, vol: vol * 0.5, ft: 'lowpass', f: 350, a: 0.01, hold: 0.99 });
    grains(v, { n: Math.round(len * 9), span: len, dur: 0.012, vol: vol * 0.6, f: [1200, 4200], q: 2 });
    for (let i = 0; i < len * 1.2; i++) knock(v, { fs: [700 + v.r() * 900, 2100 + v.r() * 900], dur: 0.05, vol: vol * 0.6, q: 5, delay: v.r() * len });
  };
/** riacho/água correndo */
export const streamBed =
  (vol = 0.3, len = 8): Recipe =>
  (v) => {
    noise(v, { kind: 'pink', dur: len + 1, vol: vol * 0.35, ft: 'bandpass', f: 1200, q: 0.4, a: 0.01, hold: 0.99 });
    for (let i = 0; i < len * 14; i++) pop(v, { f: 500 + v.r() * 1300, vol: vol * 0.18 * (0.4 + v.r()), up: 1.6, dur: 0.04, delay: v.r() * len });
  };
/** zumbido grave (cabine, motor distante, salão) */
export const humBed =
  (f = 110, vol = 0.25, len = 6, nz = 0.5): Recipe =>
  (v) => {
    noise(v, { kind: 'brown', dur: len + 1, vol: vol * nz, ft: 'lowpass', f: f * 2.5, a: 0.01, hold: 0.99 });
    tone(v, { f, dur: len + 1, vol: vol * 0.25, a: 0.01, lp: f * 3 });
    tone(v, { f: f * 2, dur: len + 1, vol: vol * 0.08, a: 0.01 });
  };
/** burburinho (cozinha cheia, feira): murmúrio filtrado com ondulação */
export const murmurBed =
  (vol = 0.25, len = 8): Recipe =>
  (v) => {
    const { c, t } = v;
    const s = c.createBufferSource();
    const b = c.createBuffer(1, Math.floor(c.sampleRate * (len + 1)), c.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.05 * (v.r() * 2 - 1)) / 1.05;
      d[i] = last * 3;
    }
    s.buffer = b;
    const f1 = c.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.value = 450;
    f1.Q.value = 1.4;
    const g = c.createGain();
    g.gain.value = vol;
    for (let k = 0; k <= len; k += 0.25) g.gain.linearRampToValueAtTime(vol * (0.5 + v.r() * 0.6), t + k);
    s.connect(f1).connect(g).connect(v.out);
    s.start(t);
  };
/** pássaros ao longe (cama) */
export const birdsBed =
  (vol = 0.06, len = 10): Recipe =>
  (v) => {
    for (let i = 0; i < len * 0.9; i++) birdChirp(2600 + v.r() * 1800, 2 + Math.floor(v.r() * 3), vol)({ ...v, t: v.t + v.r() * (len - 0.5) });
  };

export { arp, bell, grains, knock, mtof, noise, pop, thump, tone, whoosh, type V };
