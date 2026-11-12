/* ============================================================
 *  BLOOP PINK — sons e música próprios (sintetizados, docs/AUDIO.md).
 *  Pacote 'pink' (mesmo id do jogo no hub: o glue liga tema + ambiente sozinho).
 * ============================================================ */
import { definePack, lib, THEMES } from '../../audio';
import { MODES } from '../../audio/music/player';

const { S, both, later, knock, noise, bell, tone, pop, arp, fanfare, softFail, thud, coinChime, metalClick, murmurBed, glass, mtof, whoosh, thump, rocks, grains, splash, humBed, clang, swish } = lib;

// música da loja: pop dançante fofinho (Lá maior, 116 bpm) — calma = loja vazia, tensão = fila, vitória = fim do dia
if (!THEMES.pink)
  THEMES.pink = {
    id: 'pink',
    name: 'Bloop Pink — Pop da loja',
    db: 2,
    bpm: 116,
    root: 69,
    mode: MODES.major,
    prog: [0, 5, 3, 4],
    seed: 2026,
    swing: 0.08,
    parts: [
      { role: 'chord', inst: 'epiano', vol: 0.65, pat: 'x...x.x...x.x...', len: 2, st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'bass', inst: 'pluckBass', vol: 0.85, pat: 'x..x..x.x..x..x.', st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'lead', inst: 'vibes', vol: 0.7, oct: 1, dens: 0.4, st: { calm: 0.9, victory: 1 } },
      { role: 'arp', inst: 'pluck', vol: 0.55, pat: 'x.x.x.x.x.x.x.x.', order: [0, 1, 2, 1], st: { tension: 1, victory: 1 } },
      { role: 'perc', inst: 'kick', vol: 0.55, pat: 'x...x...x...x...', st: { calm: 0.7, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'clap', vol: 0.45, pat: '....x.......x...', st: { calm: 0.8, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'shaker', vol: 0.45, pat: '..x...x...x...x.', st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'bell', inst: 'musicbox', vol: 0.4, oct: 2, len: 2, st: { victory: 1 } },
    ],
  };
if (!THEMES.pinkFactory)
  THEMES.pinkFactory = {
    id: 'pinkFactory',
    name: 'Bloop Pink — Fábrica (funk de esteira)',
    db: 2,
    bpm: 122,
    root: 62,
    mode: MODES.dorian,
    prog: [0, 3, 4, 3],
    seed: 777,
    parts: [
      { role: 'bass', inst: 'roundBass', vol: 0.9, pat: 'x..x.x..x..x.x..', st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'chord', inst: 'organ', vol: 0.45, pat: '..x...x...x...x.', len: 1, st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'lead', inst: 'synth', vol: 0.55, oct: 1, dens: 0.35, st: { tension: 1, victory: 1 } },
      { role: 'perc', inst: 'kick', vol: 0.6, pat: 'x.....x...x.....', st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'snare', vol: 0.45, pat: '....x.......x...', st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'hat', vol: 0.4, pat: 'x.x.x.x.x.x.x.x.', st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'cowbell', vol: 0.3, pat: '......x.......x.', st: { tension: 1 } },
    ],
  };

const sounds = {
  click: S((v) => pop(v, { f: 900, vol: 0.3, up: 1.6, dur: 0.05 }), 0.08, { bus: 'ui' }),
  tap: S((v) => knock(v, { fs: [2200, 3400], dur: 0.04, vol: 0.25, q: 18 }), 0.06, { bus: 'ui' }),
  // caixa registradora: tecla + gaveta + sino
  cash: S((v) => {
    knock(v, { fs: [1500, 2600], dur: 0.04, vol: 0.25, q: 12 });
    noise(v, { kind: 'pink', dur: 0.16, vol: 0.22, f: 900, q: 0.8, delay: 0.05 });
    thud(170, 0.08, 0.3)({ ...v, t: v.t + 0.12 });
    bell(v, { f: 2637, dur: 0.8, vol: 0.24, ratio: 1.41, index: 0.4, delay: 0.14 });
    coinChime(91, 0.16)({ ...v, t: v.t + 0.22 });
  }, 1.1, { rev: 0.2, pitch: 10 }),
  coin: S((v) => {
    metalClick(3000, 0.18)(v);
    bell(v, { f: mtof(88), dur: 0.3, vol: 0.18, ratio: 2, index: 0.4, delay: 0.03 });
  }, 0.4, { pitch: 20, max: 6 }),
  beep: S((v) => tone(v, { f: 2350, dur: 0.09, vol: 0.18, type: 'square', lp: 4200 }), 0.12, { pitch: 0, max: 3 }),
  card: S((v) => {
    tone(v, { f: 1800, dur: 0.07, vol: 0.15, type: 'square', lp: 3500 });
    tone(v, { f: 1800, dur: 0.07, vol: 0.15, type: 'square', lp: 3500, delay: 0.12 });
    tone(v, { f: 2400, dur: 0.22, vol: 0.16, type: 'square', lp: 3500, delay: 0.26 });
  }, 0.6, { pitch: 0 }),
  // papelão: rasgar fita + abrir abas
  boxOpen: S((v) => {
    noise(v, { kind: 'white', dur: 0.32, vol: 0.28, f: 2600, f2: 1400, q: 0.8, a: 0.02 });
    knock(v, { fs: [300, 700], dur: 0.09, vol: 0.35, q: 3, kind: 'pink', delay: 0.3 });
    knock(v, { fs: [280, 640], dur: 0.09, vol: 0.3, q: 3, kind: 'pink', delay: 0.42 });
  }, 0.6),
  tape: S((v) => {
    noise(v, { kind: 'white', dur: 0.55, vol: 0.22, f: 3200, f2: 1800, q: 1.4, a: 0.03, hold: 0.7 });
    tone(v, { f: 900, f2: 700, dur: 0.5, vol: 0.05, type: 'sawtooth', lp: 2500, vib: [30, 20] });
    knock(v, { fs: [500, 1200], dur: 0.05, vol: 0.25, q: 4, delay: 0.55 });
  }, 0.75),
  fold: S((v) => {
    knock(v, { fs: [260, 600], dur: 0.08, vol: 0.32, q: 3, kind: 'pink' });
    whoosh(v, { dur: 0.18, vol: 0.12, f: 600, f2: 1600, delay: 0.02 });
  }, 0.3),
  glassBreak: S(both(glass(0.38), (v) => {
    for (let i = 0; i < 7; i++) bell(v, { f: 2600 + v.r() * 3800, dur: 0.15 + v.r() * 0.2, vol: 0.09, ratio: 1.51, index: 1.2, delay: 0.02 + v.r() * 0.18 });
    noise(v, { kind: 'pink', dur: 0.25, vol: 0.2, f: 900, delay: 0.05 });
  }), 0.8, { duck: 0.3 }),
  splat: S((v) => {
    noise(v, { kind: 'pink', dur: 0.22, vol: 0.4, f: 700, f2: 220, q: 0.9 });
    pop(v, { f: 180, vol: 0.2, up: 0.5, dur: 0.1 });
  }, 0.3),
  mop: S((v) => {
    noise(v, { kind: 'pink', dur: 0.32, vol: 0.28, f: 1200, f2: 700, q: 0.7, a: 0.05 });
    tone(v, { f: 1900, f2: 2400, dur: 0.08, vol: 0.05, type: 'sine', delay: 0.18 });
  }, 0.4, { max: 2 }),
  sparkle: S((v) => arp(v, [88, 92, 95, 100], { step: 0.05, dur: 0.3, vol: 0.12, fm: true }), 0.6, { rev: 0.3 }),
  place: S((v) => {
    knock(v, { fs: [900, 1900], dur: 0.04, vol: 0.28, q: 9 });
    pop(v, { f: 620, vol: 0.12, up: 1.4, dur: 0.05, delay: 0.01 });
  }, 0.1, { pitch: 80, max: 4 }),
  pick: S((v) => pop(v, { f: 520, vol: 0.25, up: 1.8, dur: 0.07 }), 0.1),
  drop: S(both(thud(140, 0.14, 0.45), (v) => knock(v, { fs: [400, 900], dur: 0.06, vol: 0.2, q: 4, kind: 'pink' })), 0.22),
  trip: S((v) => {
    whoosh(v, { dur: 0.25, vol: 0.25, f: 500, f2: 1800 });
    thump(v, { f: 120, dur: 0.3, vol: 0.5, delay: 0.25 });
    tone(v, { f: 600, f2: 250, dur: 0.3, vol: 0.12, type: 'triangle', delay: 0.02 });
  }, 0.7),
  door: S((v) => {
    noise(v, { kind: 'pink', dur: 0.45, vol: 0.12, f: 500, f2: 900, q: 0.6, a: 0.1 });
    bell(v, { f: 1568, dur: 0.6, vol: 0.14, ratio: 2, index: 0.3, delay: 0.05 });
    bell(v, { f: 1245, dur: 0.8, vol: 0.14, ratio: 2, index: 0.3, delay: 0.3 });
  }, 1.1, { max: 2, cool: 0.6 }),
  spray: S((v) => noise(v, { kind: 'white', dur: 0.3, vol: 0.2, f: 5200, q: 0.6, a: 0.01 }), 0.35),
  truck: S((v) => {
    tone(v, { f: 52, dur: 2.6, vol: 0.2, type: 'sawtooth', lp: 300, a: 0.3, vib: [6, 4] });
    noise(v, { kind: 'brown', dur: 2.6, vol: 0.25, ft: 'lowpass', f: 260, a: 0.3, hold: 0.8 });
  }, 2.8, { max: 1 }),
  backup: S((v) => {
    for (let i = 0; i < 4; i++) tone(v, { f: 1050, dur: 0.28, vol: 0.12, type: 'square', lp: 2200, delay: i * 0.55 });
  }, 2.4, { max: 1 }),
  shutter: S((v) => {
    for (let i = 0; i < 14; i++) knock(v, { fs: [700, 1500], dur: 0.04, vol: 0.12, q: 6, delay: i * 0.08 });
    noise(v, { kind: 'pink', dur: 1.2, vol: 0.12, f: 400, a: 0.1 });
  }, 1.4, { max: 1 }),
  ding: S((v) => bell(v, { f: 2093, dur: 0.9, vol: 0.25, ratio: 1.41, index: 0.5 }), 1, { rev: 0.2 }),
  levelup: S(both(fanfare([69, 73, 76, 81], 0.09, 0.2, 'triangle', [81, 85, 88]), later(0.45, (v) => arp(v, [93, 97, 100, 105], { step: 0.05, dur: 0.3, vol: 0.1, fm: true }))), 1.6, { variants: 1, duck: 0.6, rev: 0.3 }),
  goal: S(fanfare([76, 81, 85], 0.08, 0.18, 'triangle', [88]), 0.9, { variants: 1, duck: 0.4 }),
  wrong: S(softFail(64, 'triangle', 0.25), 0.7, { variants: 1 }),
  stamp: S((v) => {
    thump(v, { f: 95, dur: 0.25, vol: 0.7 });
    knock(v, { fs: [300, 800], dur: 0.06, vol: 0.3, q: 3 });
  }, 0.4),
  combo: S((v) => arp(v, [81, 85, 88], { step: 0.04, dur: 0.18, vol: 0.14, type: 'square', lp: 3000 }), 0.35, { pitch: 0 }),
  // marreta na parede / parede caindo
  smash: S(both(thud(80, 0.22, 0.75), rocks(6, 0.3, 0.2)), 0.45, { max: 2 }),
  crumble: S((v) => {
    thump(v, { f: 60, dur: 0.9, vol: 0.8 });
    noise(v, { kind: 'brown', dur: 1.6, vol: 0.5, ft: 'lowpass', f: 700, a: 0.02 });
    grains(v, { n: 40, span: 1.4, dur: 0.06, vol: 0.3, f: [300, 1600], q: 2, kind: 'pink', decay: 1 });
  }, 2, { max: 1 }),
  // dinheiro: moeda batendo no balcão, nota (papel), gaveta do caixa
  coinDrop: S((v) => {
    knock(v, { fs: [3100 + v.r() * 400, 5200, 7600], dur: 0.12, vol: 0.18, q: 40 });
    knock(v, { fs: [2900, 4800], dur: 0.08, vol: 0.1, q: 30, delay: 0.07 });
  }, 0.2, { max: 4 }),
  note: S((v) => noise(v, { kind: 'white', dur: 0.12, vol: 0.12, f: 3800, f2: 2400, q: 0.8, a: 0.005 }), 0.15, { max: 3 }),
  drawer: S((v) => {
    noise(v, { kind: 'pink', dur: 0.2, vol: 0.18, f: 900, q: 0.8 });
    knock(v, { fs: [500, 1300], dur: 0.06, vol: 0.3, q: 6, delay: 0.17 });
    bell(v, { f: 2637, dur: 0.6, vol: 0.12, ratio: 1.41, index: 0.4, delay: 0.2 });
  }, 0.8),
  // segurança e assalto
  whistle: S((v) => tone(v, { f: 2600, f2: 2900, dur: 0.5, vol: 0.12, type: 'sine', vib: [28, 60] }), 0.6, { max: 1, cool: 0.5 }),
  opa: S((v) => {
    tone(v, { f: 330, f2: 520, dur: 0.12, vol: 0.2, type: 'triangle' });
    tone(v, { f: 520, f2: 300, dur: 0.18, vol: 0.2, type: 'triangle', delay: 0.13 });
  }, 0.4),
  alarm: S((v) => {
    for (let i = 0; i < 4; i++) tone(v, { f: 880, f2: 1320, dur: 0.3, vol: 0.12, type: 'triangle', delay: i * 0.32 });
  }, 1.4, { max: 1 }),
  // casa: chuveiro (loop), ronco, escova
  shower: S((v) => splash(0.4)(v), 0.5, { max: 2 }),
  snore: S((v) => {
    noise(v, { kind: 'brown', dur: 0.9, vol: 0.25, ft: 'lowpass', f: 300, a: 0.4 });
    tone(v, { f: 90, f2: 70, dur: 0.9, vol: 0.12, type: 'sawtooth', lp: 400, a: 0.4 });
  }, 1, { max: 1 }),
  brush: S((v) => noise(v, { kind: 'pink', dur: 0.18, vol: 0.12, f: 2400, q: 1.2, a: 0.04 }), 0.2, { max: 3 }),
  // energia
  powerDown: S((v) => {
    tone(v, { f: 240, f2: 40, dur: 0.9, vol: 0.25, type: 'sawtooth', lp: 900 });
    knock(v, { fs: [300, 700], dur: 0.06, vol: 0.3, q: 3 });
  }, 1, { max: 1 }),
  powerUp: S((v) => {
    tone(v, { f: 50, f2: 220, dur: 0.7, vol: 0.2, type: 'sawtooth', lp: 900 });
    clang(1200, 0.12, 0.4)(v);
  }, 0.9, { max: 1 }),
  swoosh: S(swish(500, 2000, 0.2, 0.25), 0.25),
  fridgeHum: S(humBed(120, 0.12), 6, { loop: true, bus: 'amb', db: -14 }),
  chatter: S(murmurBed(0.22, 8), 8, { loop: true, stereo: true, bus: 'amb', db: -12 }),
  hum: S((v) => {
    tone(v, { f: 120, dur: 6.2, vol: 0.04, type: 'sine', a: 0.5 });
    noise(v, { kind: 'pink', dur: 6.2, vol: 0.05, f: 2000, q: 0.5, a: 0.5, hold: 0.95 });
  }, 6, { loop: true, bus: 'amb', db: -18 }),
  bag: S((v) => noise(v, { kind: 'white', dur: 0.25, vol: 0.15, f: 3500, q: 0.4, a: 0.02 }), 0.3),
  conveyor: S((v) => {
    for (let i = 0; i < 12; i++) knock(v, { fs: [180, 420], dur: 0.05, vol: 0.06, q: 4, delay: i * 0.25 });
    tone(v, { f: 90, dur: 3, vol: 0.05, type: 'sawtooth', lp: 220 });
  }, 3, { loop: true, bus: 'amb', db: -14 }),
};
definePack({
  id: 'pink',
  name: 'Bloop Pink (loja)',
  theme: 'pink',
  sounds,
  amb: { layers: [{ id: 'hum' }] },
});
