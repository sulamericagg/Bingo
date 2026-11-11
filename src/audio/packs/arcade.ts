/* ============================================================
 *  PACOTES — hub e jogos de partida rápida / criativos:
 *  Hub, Orbit, Tubo, Rally, Tycoon, Pintou Ganhou, Caça, Estúdio,
 *  Desenha e Vira, Bloop no Lugar, Cava & Fala, TV/Cinema, Banda,
 *  Anomalias e Monta & Leva (estes três têm áudio próprio; o pacote só
 *  afina os cliques e desliga a música do app).
 * ============================================================ */
import { definePack } from '../sound';
import {
  S, arp, bell, both, boing, bubble, coinChime, fanfare, knock, later, metalClick, mtof, noise, poof, pop, rocks,
  softFail, sparkle, swish, thud, thump, tone, whoosh, woodClick, zap,
} from './lib';

/* ================================== HUB ================================== */
// pops de bolha, deslizar de cartas, moedas/gemas brilhando, fanfarra de presente.
definePack({
  id: 'hub',
  name: 'Hub (menu)',
  theme: 'hub',
  sounds: {
    click: S(bubble(620, 2.2, 0.45), 0.12, { bus: 'ui', pitch: 40, max: 3 }),
    swipe: S((v) => {
      whoosh(v, { dur: 0.2, vol: 0.3, f: 900, f2: 2600 });
      pop(v, { f: 500, vol: 0.12, up: 1.5, delay: 0.12 });
    }, 0.3, { bus: 'ui', pitch: 60 }),
    coin: S((v) => {
      bell(v, { f: mtof(86), dur: 0.15, vol: 0.22, ratio: 2, index: 0.5 });
      bell(v, { f: mtof(93), dur: 0.5, vol: 0.25, ratio: 3, index: 0.5, delay: 0.06 });
    }, 0.6, { rev: 0.25, pitch: 15, max: 6 }),
    gem: S(sparkle(91, 5, 0.18, 0.04), 0.7, { rev: 0.35 }),
    cash: S((v) => {
      for (let i = 0; i < 6; i++) bell(v, { f: mtof(84 + [0, 4, 7, 12, 16, 19][i]), dur: 0.3, vol: 0.14, ratio: 2, index: 0.5, delay: i * 0.045 });
      bubble(700, 2, 0.2)({ ...v, t: v.t + 0.3 });
    }, 0.9, { rev: 0.3, pitch: 10 }),
    unlock2: S(both(fanfare([72, 76, 79, 84], 0.08, 0.2, 'triangle', [84, 88, 91]), later(0.3, sparkle(96, 5, 0.1, 0.05))), 1.6, { variants: 1, duck: 0.6, rev: 0.3 }), // presente
    gift: S(both((v) => noise(v, { kind: 'pink', dur: 0.35, vol: 0.3, f: 600, f2: 2400, q: 0.8, a: 0.2 }), later(0.3, fanfare([76, 79, 84, 88], 0.07, 0.2, 'triangle', [88, 91, 96])), later(0.5, sparkle(96, 6, 0.1, 0.05))), 2.0, { variants: 1, duck: 0.6, rev: 0.3 }),
    record: S(fanfare([72, 76, 79, 84], 0.09, 0.2, 'triangle', [84, 88, 91]), 1.4, { variants: 1, duck: 0.6, rev: 0.3 }),
    tick: S(bubble(1100, 1.4, 0.22), 0.06, { bus: 'ui', pitch: 5, cool: 0.03 }),
    open: S((v) => {
      pop(v, { f: 400, vol: 0.3, up: 2.8, dur: 0.12 });
      whoosh(v, { dur: 0.25, vol: 0.15, f: 800, f2: 2000 });
    }, 0.3, { bus: 'ui' }),
    close: S((v) => pop(v, { f: 900, vol: 0.3, up: 0.45, dur: 0.1 }), 0.15, { bus: 'ui' }),
  },
});

/* ================================= ORBIT ================================= */
definePack({
  id: 'orbit',
  name: 'Orbit (espaço)',
  theme: 'orbit',
  sounds: {
    jump: S((v) => {
      tone(v, { f: 260, f2: 900, dur: 0.2, vol: 0.3, type: 'sawtooth', lp: 1800, q: 4 });
      tone(v, { f: 520, f2: 1300, dur: 0.12, vol: 0.12 });
    }, 0.25),
    land: S((v) => {
      thump(v, { f: 110, dur: 0.15, vol: 0.35 });
      bell(v, { f: 523, dur: 0.45, vol: 0.2, ratio: 2, index: 0.6, delay: 0.01 });
    }, 0.55, { rev: 0.35, pitch: 8 }),
    perfect: S((v) => arp(v, [81, 84, 88, 93], { step: 0.04, dur: 0.5, vol: 0.16, fm: true }), 0.8, { rev: 0.45, pitch: 8 }),
    coin: S((v) => {
      tone(v, { f: mtof(88), dur: 0.06, vol: 0.12, type: 'square', lp: 3000 });
      bell(v, { f: mtof(95), dur: 0.35, vol: 0.22, ratio: 2, index: 0.5, delay: 0.05 });
    }, 0.5, { rev: 0.3, pitch: 10, max: 5 }),
    crack: S(both(rocks(7, 0.3, 0.12), (v) => tone(v, { f: 800, f2: 200, dur: 0.15, vol: 0.12, type: 'sawtooth', lp: 1500 })), 0.3),
    hit: S((v) => {
      noise(v, { kind: 'pink', dur: 0.6, vol: 0.45, f: 900, f2: 100, q: 0.7 });
      tone(v, { f: 300, f2: 60, dur: 0.6, vol: 0.25, type: 'sawtooth', lp: 1000 });
    }, 0.7, { duck: 0.4 }),
    nearMiss: S(both(swish(2000, 5000, 0.15, 0.2), (v) => tone(v, { f: 1600, f2: 2600, dur: 0.1, vol: 0.1 })), 0.2),
    fail: S((v) => tone(v, { f: 440, f2: 140, dur: 0.8, vol: 0.25, type: 'sawtooth', lp: 900, vib: [6, 30] }), 0.9, { variants: 1 }),
  },
});

/* ================================== TUBO ================================== */
definePack({
  id: 'tubo',
  name: 'Tubo (fliperama)',
  theme: 'tubo',
  sounds: {
    jump: S((v) => tone(v, { f: 330, f2: 990, dur: 0.12, vol: 0.18, type: 'square', lp: 2600 }), 0.15),
    land: S((v) => tone(v, { f: 660, f2: 330, dur: 0.08, vol: 0.15, type: 'square', lp: 2200 }), 0.1, { pitch: 10 }),
    coin: S((v) => {
      tone(v, { f: mtof(83), dur: 0.06, vol: 0.14, type: 'square', lp: 3200 });
      tone(v, { f: mtof(88), dur: 0.22, vol: 0.14, type: 'square', lp: 3200, delay: 0.06 });
    }, 0.32, { pitch: 5, max: 5 }),
    gem: S((v) => arp(v, [84, 88, 91, 96], { step: 0.04, dur: 0.1, vol: 0.12, type: 'square', lp: 3200 }), 0.3),
    perfect: S((v) => arp(v, [79, 83, 86, 91, 95], { step: 0.035, dur: 0.1, vol: 0.12, type: 'square', lp: 3200 }), 0.3),
    crack: S((v) => noise(v, { dur: 0.18, vol: 0.3, f: 1400, f2: 400, q: 1 }), 0.2),
    hit: S((v) => {
      noise(v, { dur: 0.4, vol: 0.35, f: 800, f2: 150, q: 0.8 });
      tone(v, { f: 220, f2: 55, dur: 0.4, vol: 0.15, type: 'square', lp: 900 });
    }, 0.45, { duck: 0.4 }),
    unlock2: S((v) => arp(v, [72, 76, 79, 84, 88, 91], { step: 0.06, dur: 0.14, vol: 0.13, type: 'square', lp: 3000 }), 0.6, { variants: 1 }),
    fail: S((v) => arp(v, [72, 68, 65, 60], { step: 0.12, dur: 0.16, vol: 0.13, type: 'square', lp: 2200 }), 0.7, { variants: 1 }),
  },
});

/* ================================== RALLY ================================== */
definePack({
  id: 'rally',
  name: 'Rally (corrida)',
  theme: 'rally',
  motor: { kind: 'kart', idle: 42, top: 140, vol: 0.085 },
  sounds: {
    click: S(metalClick(2400, 0.28), 0.1, { bus: 'ui' }),
    tick: S((v) => tone(v, { f: mtof(76), dur: 0.18, vol: 0.25, type: 'triangle', lp: 2400 }), 0.22, { bus: 'ui', pitch: 0 }), // contagem
    coin: S(coinChime(86, 0.3, false), 0.4, { pitch: 10, max: 5 }),
    crack: S((v) => noise(v, { kind: 'pink', dur: 0.35, vol: 0.3, f: 1600, f2: 900, q: 2, a: 0.02 }), 0.4), // derrapada curta
    hit: S((v) => {
      thump(v, { f: 90, dur: 0.3, vol: 0.5 });
      metalClick(800, 0.25)(v);
      noise(v, { kind: 'pink', dur: 0.3, vol: 0.25, f: 1200, f2: 400, q: 0.8 });
    }, 0.45, { duck: 0.35 }),
    land: S(both(thud(90, 0.18, 0.5), (v) => metalClick(600, 0.12)(v)), 0.25),
    gem: S(sparkle(88, 4, 0.18, 0.05), 0.6),
    perfect: S((v) => arp(v, [74, 78, 81, 86], { step: 0.05, dur: 0.2, vol: 0.18, type: 'sawtooth', lp: 2400 }), 0.5), // turbo
    unlock2: S(fanfare([74, 78, 81, 86], 0.09, 0.18, 'sawtooth', [86, 90, 93]), 1.4, { variants: 1, duck: 0.6 }),
    cash: S(both(metalClick(2600, 0.2), later(0.05, coinChime(86, 0.28, false))), 0.5),
    horn: S((v) => {
      tone(v, { f: 392, dur: 0.35, vol: 0.12, type: 'square', lp: 1600, a: 0.02 });
      tone(v, { f: 494, dur: 0.35, vol: 0.12, type: 'square', lp: 1600, a: 0.02 });
    }, 0.45, { pitch: 0 }),
  },
});

/* ================================= TYCOON ================================= */
definePack({
  id: 'tycoon',
  name: 'Tycoon (negócios)',
  theme: 'tycoon',
  sounds: {
    click: S((v) => knock(v, { fs: [1800, 2900], dur: 0.05, vol: 0.3, q: 14 }), 0.07, { bus: 'ui' }), // tecla de caixa
    cash: S((v) => {
      // caixa registradora: tecla + gaveta + sino
      knock(v, { fs: [1500, 2600], dur: 0.04, vol: 0.25, q: 12 });
      noise(v, { kind: 'pink', dur: 0.15, vol: 0.2, f: 900, q: 0.8, delay: 0.06 });
      bell(v, { f: 2637, dur: 0.7, vol: 0.22, ratio: 1.41, index: 0.4, delay: 0.12 });
    }, 0.9, { rev: 0.2, pitch: 15 }),
    coin: S((v) => {
      metalClick(3000, 0.18)(v);
      bell(v, { f: mtof(88), dur: 0.3, vol: 0.18, ratio: 2, index: 0.4, delay: 0.03 });
    }, 0.4, { pitch: 20, max: 6 }),
    perfect: S((v) => arp(v, [77, 81, 84, 89], { step: 0.06, dur: 0.4, vol: 0.18, type: 'sine' }), 0.7, { rev: 0.3 }),
    unlock2: S(both(fanfare([70, 74, 77, 82], 0.08, 0.18, 'triangle', [82, 86, 89]), later(0.4, (v) => bell(v, { f: 2637, dur: 0.6, vol: 0.18, ratio: 1.41, index: 0.4 }))), 1.4, { variants: 1, duck: 0.6 }),
  },
});

/* ============================= PINTOU GANHOU ============================= */
definePack({
  id: 'cor',
  name: 'Pintou Ganhou (cores)',
  theme: 'cor',
  sounds: {
    click: S(bubble(880, 1.8, 0.35), 0.1, { bus: 'ui' }),
    land: S((v) => {
      // pincelada/splash de tinta
      noise(v, { kind: 'pink', dur: 0.15, vol: 0.35, f: 900, f2: 400, q: 1 });
      pop(v, { f: 420, vol: 0.25, up: 1.6, delay: 0.02 });
    }, 0.2, { pitch: 80 }),
    jump: S((v) => pop(v, { f: 380, vol: 0.35, up: 2.6, dur: 0.12 }), 0.15),
    coin: S((v) => bell(v, { f: mtof(88), dur: 0.4, vol: 0.25, ratio: 3, index: 0.5 }), 0.45, { pitch: 15, max: 5 }),
    tick: S((v) => pop(v, { f: 1200, vol: 0.2, up: 1.3, dur: 0.04 }), 0.06, { bus: 'ui' }),
    perfect: S((v) => arp(v, [82, 86, 89, 94], { step: 0.05, dur: 0.35, vol: 0.16, fm: true }), 0.7, { rev: 0.3 }),
    fail: S(softFail(70, 'sine', 0.3), 0.8, { variants: 1 }),
    record: S(both(fanfare([70, 74, 77, 82], 0.09, 0.2, 'triangle', [82, 86, 89]), later(0.4, sparkle(94, 5, 0.1))), 1.6, { variants: 1, duck: 0.6, rev: 0.3 }),
    cash: S(both(bubble(700, 2, 0.25), later(0.05, coinChime(88, 0.25))), 0.6),
    unlock2: S(fanfare([70, 74, 77, 82, 86], 0.08, 0.18, 'triangle'), 0.9, { variants: 1, duck: 0.4 }),
  },
});

/* ================================== CAÇA ================================== */
definePack({
  id: 'caca',
  name: 'Caça (expedição)',
  theme: 'caca',
  sounds: {
    click: S(woodClick(1300, 0.35), 0.08, { bus: 'ui' }),
    tick: S((v) => {
      // ping de radar
      bell(v, { f: 1480, dur: 0.4, vol: 0.2, ratio: 1, index: 0.2 });
    }, 0.45, { pitch: 0, rev: 0.3 }),
    coin: S(both((v) => tone(v, { f: mtof(79), f2: mtof(86), dur: 0.1, vol: 0.18, type: 'triangle' }), later(0.06, (v) => bell(v, { f: mtof(91), dur: 0.35, vol: 0.2, ratio: 2, index: 0.4 }))), 0.45, { pitch: 10 }),
    perfect: S((v) => arp(v, [74, 77, 81, 86], { step: 0.06, dur: 0.3, vol: 0.18, type: 'triangle' }), 0.6, { rev: 0.25 }),
    hit: S(both(thud(110, 0.2, 0.45), (v) => noise(v, { kind: 'pink', dur: 0.2, vol: 0.2, f: 1200, f2: 500 })), 0.3),
    fail: S(softFail(62, 'triangle', 0.3), 0.8, { variants: 1 }),
    record: S(fanfare([62, 69, 74, 77, 81], 0.1, 0.2, 'triangle', [81, 86]), 1.5, { variants: 1, duck: 0.6, rev: 0.3 }),
  },
});

/* ================================= ESTÚDIO ================================= */
definePack({
  id: 'studio',
  name: 'Estúdio (criar jogos)',
  theme: 'studio',
  sounds: {
    click: S((v) => tone(v, { f: 1000, f2: 1300, dur: 0.04, vol: 0.2, type: 'triangle' }), 0.06, { bus: 'ui' }),
    pop: S(bubble(650, 2.4, 0.4), 0.12),
    catch: S((v) => arp(v, [76, 83], { step: 0.06, dur: 0.15, vol: 0.2, type: 'sine' }), 0.3),
    boing: S(boing(260, 2.0, 0.35), 0.3),
    whoosh: S(swish(700, 2200, 0.25, 0.3), 0.3),
    fix: S((v) => arp(v, [72, 76, 79], { step: 0.06, dur: 0.15, vol: 0.18, type: 'triangle' }), 0.35),
    sparkle: S(sparkle(88, 5, 0.13, 0.05), 0.7),
    crash: S(both(thud(80, 0.25, 0.45), (v) => noise(v, { kind: 'pink', dur: 0.4, vol: 0.3, f: 700, f2: 200 })), 0.45),
    bump: S(thud(90, 0.2, 0.45), 0.25),
  },
});

/* ============================ DESENHA E VIRA ============================ */
definePack({
  id: 'desenho',
  name: 'Desenha e Vira (ateliê)',
  theme: 'desenho',
  sounds: {
    click: S((v) => tone(v, { f: mtof(84), dur: 0.08, vol: 0.2, lp: 3000 }), 0.1, { bus: 'ui', pitch: 20 }),
    paint: S((v) => noise(v, { kind: 'pink', dur: 0.12, vol: 0.2, f: 1400, f2: 900, q: 1.2, a: 0.02 }), 0.15, { max: 3, pitch: 80 }), // lápis/pincel
    poof: S(both(poof(0.4, [79, 84, 88, 91]), later(0.15, sparkle(93, 4, 0.1))), 0.8, { rev: 0.3 }), // desenho vira de verdade
    sparkle: S(sparkle(89, 6, 0.13, 0.06), 0.8, { rev: 0.3 }),
    pop: S(bubble(760, 2, 0.35), 0.12),
    whoosh: S(swish(900, 2600, 0.25, 0.25), 0.3),
    swish: S((v) => arp(v, [80, 84, 87], { step: 0.05, dur: 0.15, vol: 0.18, fm: true }), 0.4),
    fix: S((v) => arp(v, [68, 72, 75, 80], { step: 0.06, dur: 0.3, vol: 0.16, fm: true }), 0.6),
    catch: S((v) => bell(v, { f: mtof(87), dur: 0.4, vol: 0.2, ratio: 3, index: 0.4 }), 0.45),
    yay: S(fanfare([68, 72, 75, 80], 0.08, 0.18, 'triangle', [80, 84]), 1.0, { variants: 1, duck: 0.4 }),
    splat: S((v) => {
      noise(v, { kind: 'pink', dur: 0.2, vol: 0.35, f: 800, f2: 300 });
      pop(v, { f: 300, vol: 0.2, up: 1.5, delay: 0.02 });
    }, 0.25),
  },
});

/* ============================ BLOOP NO LUGAR ============================ */
definePack({
  id: 'lugar',
  name: 'Bloop no Lugar (quebra-cabeça)',
  theme: 'lugar',
  sounds: {
    click: S((v) => bell(v, { f: mtof(88), dur: 0.15, vol: 0.18, ratio: 2, index: 0.3 }), 0.18, { bus: 'ui', pitch: 15 }),
  },
});

/* ============================== CAVA & FALA ============================== */
definePack({
  id: 'cavafala',
  name: 'Cava & Fala (engenhocas)',
  theme: 'cavafala',
  sounds: {
    click: S((v) => {
      tone(v, { f: 700, f2: 1100, dur: 0.05, vol: 0.2, type: 'square', lp: 2400 });
      pop(v, { f: 900, vol: 0.12, up: 1.4, delay: 0.03 });
    }, 0.1, { bus: 'ui' }),
    scrub: S((v) => {
      // pá raspando na terra
      noise(v, { kind: 'pink', dur: 0.22, vol: 0.35, f: 1200, f2: 700, q: 1.6, a: 0.03 });
      noise(v, { kind: 'brown', dur: 0.18, vol: 0.3, ft: 'lowpass', f: 500 });
    }, 0.28, { pitch: 80, max: 3 }),
    poof: S(both(poof(0.45, [74, 79, 83]), later(0.08, (v) => tone(v, { f: 300, f2: 1200, dur: 0.2, vol: 0.15, type: 'triangle' }))), 0.55),
    pop: S(both(bubble(500, 2.6, 0.35), later(0.05, (v) => tone(v, { f: 1500, dur: 0.04, vol: 0.08 }))), 0.15),
    boing: S(boing(200, 2.6, 0.35), 0.35),
    whoosh: S(swish(500, 2000, 0.3, 0.3), 0.35),
    thud: S(both(thud(100, 0.2, 0.5), (v) => noise(v, { kind: 'brown', dur: 0.12, vol: 0.3, ft: 'lowpass', f: 600 })), 0.3),
    sparkle: S(sparkle(86, 5, 0.13, 0.05), 0.7),
    splat: S((v) => {
      noise(v, { kind: 'pink', dur: 0.25, vol: 0.4, f: 600, f2: 200 });
      bubble(300, 1.6, 0.2)(v);
    }, 0.3), // espuma
    gadget: S(both(zap(300, 1200, 0.18, 'square'), later(0.15, bubble(800, 1.8, 0.25))), 0.4),
  },
});

/* ============================== TV / CINEMA ============================== */
definePack({
  id: 'tv',
  name: 'TV (vinhetas)',
  theme: 'tv',
  sounds: {
    click: S((v) => bell(v, { f: mtof(91), dur: 0.12, vol: 0.16, ratio: 1, index: 0.2 }), 0.15, { bus: 'ui', pitch: 10 }),
    unlock2: S(fanfare([67, 71, 74, 79], 0.08, 0.18, 'sine', [79, 83, 86]), 1.2, { variants: 1, duck: 0.6 }),
    jingle: S((v) => arp(v, [79, 83, 86, 91, 86], { step: 0.1, dur: 0.3, vol: 0.18, fm: true }), 1.0, { variants: 1, duck: 0.5 }),
  },
});
definePack({
  id: 'cinema',
  name: 'Cinema (tem trilha própria)',
  theme: null,
  sounds: {
    click: S((v) => bell(v, { f: mtof(91), dur: 0.12, vol: 0.16, ratio: 1, index: 0.2 }), 0.15, { bus: 'ui', pitch: 10 }),
    jingle: S((v) => arp(v, [72, 76, 79, 84], { step: 0.1, dur: 0.3, vol: 0.18, fm: true }), 1.0, { variants: 1 }),
    shutter: S((v) => {
      knock(v, { fs: [1800, 3200], dur: 0.03, vol: 0.3, q: 6 });
      noise(v, { dur: 0.06, vol: 0.15, f: 2500, q: 1, delay: 0.04 });
      knock(v, { fs: [1500, 2700], dur: 0.03, vol: 0.25, q: 6, delay: 0.09 });
    }, 0.16, { pitch: 20 }),
  },
});

/* ===================== jogos com áudio próprio (sem música do app) ===================== */
definePack({ id: 'band', name: 'Banda (músicas próprias)', theme: null, sounds: {} });
definePack({
  id: 'anomalias',
  name: 'Anomalias (sons próprios)',
  theme: null,
  sounds: {
    click: S((v) => tone(v, { f: 520, f2: 480, dur: 0.06, vol: 0.2, type: 'triangle', lp: 1600 }), 0.08, { bus: 'ui' }),
  },
});
definePack({
  id: 'montaleva',
  name: 'Monta & Leva (trilha própria)',
  theme: null,
  sounds: {
    click: S((v) => tone(v, { f: 1500, f2: 1400, dur: 0.025, vol: 0.2, type: 'triangle', lp: 4000 }), 0.05, { bus: 'ui' }),
  },
});

