/* ============================================================
 *  PACOTE BASE — os sons "clássicos" (nomes de core/audio e de
 *  3d/common/sfx), refeitos com envelopes suaves. É o que toca quando
 *  o pacote do jogo ativo não define um nome. Também é a voz do app fora
 *  dos jogos quando nenhum pacote foi ativado.
 * ============================================================ */
import { definePack } from '../sound';
import {
  S, arp, bell, both, boing, bubble, bubbles, clang, coinChime, dirt, fanfare, knock, mtof, noise, poof, rocks,
  sizzle, softFail, sparkle, splash, swish, thud, thump, tick, tone, whoosh, woodClick,
} from './lib';

export const BASE = definePack({
  id: 'base',
  name: 'Base (comum)',
  theme: 'hub',
  sounds: {
    /* ---------- core/audio ---------- */
    click: S(bubble(700, 1.6, 0.4), 0.12, { bus: 'ui', pitch: 25, max: 3 }),
    jump: S((v) => {
      tone(v, { f: 300, f2: 720, dur: 0.18, vol: 0.4 });
      tone(v, { f: 600, f2: 1080, dur: 0.1, vol: 0.08, type: 'triangle' });
      whoosh(v, { dur: 0.12, vol: 0.12, f: 1600, f2: 900 });
    }, 0.3),
    land: S((v) => {
      thump(v, { f: 120, dur: 0.16, vol: 0.4 });
      tone(v, { f: 523, dur: 0.35, vol: 0.18, type: 'triangle', lp: 3000, delay: 0.01 });
    }, 0.5, { rev: 0.2, pitch: 10 }),
    perfect: S((v) => arp(v, [79, 83, 86, 91], { step: 0.045, dur: 0.4, vol: 0.18, fm: true }), 0.7, { rev: 0.3, pitch: 10 }),
    coin: S(coinChime(84, 0.35), 0.55, { rev: 0.2, pitch: 15, max: 5 }),
    gem: S(sparkle(88, 4, 0.2), 0.6, { rev: 0.3 }),
    crack: S(rocks(8, 0.35, 0.15), 0.35),
    hit: S((v) => {
      noise(v, { kind: 'pink', dur: 0.5, vol: 0.5, f: 600, f2: 120, q: 0.6 });
      tone(v, { f: 200, f2: 60, dur: 0.5, vol: 0.25, type: 'triangle', lp: 900 });
    }, 0.65, { duck: 0.35 }),
    unlock2: S(fanfare([72, 76, 79, 84, 88], 0.08, 0.2, 'triangle'), 1.0, { rev: 0.3, variants: 1, duck: 0.5, pitch: 0 }),
    cash: S((v) => {
      for (let i = 0; i < 5; i++) bell(v, { f: mtof(86 + i * 2), dur: 0.12, vol: 0.12, ratio: 2, index: 0.5, delay: i * 0.04 });
      bell(v, { f: mtof(96), dur: 0.6, vol: 0.22, ratio: 2, index: 0.6, delay: 0.22 });
    }, 0.9, { rev: 0.25, pitch: 10 }),
    siren: S((v) => {
      // alerta amigável: sobe e desce (sem agudo estridente)
      for (let i = 0; i < 3; i++) tone(v, { f: 620, f2: 860, glide: 0.4, dur: 0.8, vol: 0.18, type: 'triangle', lp: 1800, delay: i * 0.8, a: 0.05 });
    }, 2.5, { variants: 1, pitch: 0, max: 1, duck: 0.4 }),
    tick: S(tick(900, 0.25, 'square'), 0.06, { bus: 'ui', pitch: 5, cool: 0.03 }),
    nearMiss: S((v) => {
      tone(v, { f: 1400, f2: 2200, dur: 0.12, vol: 0.12 });
      whoosh(v, { dur: 0.14, vol: 0.18, f: 2500, f2: 4500 });
    }, 0.2),
    record: S(fanfare([72, 76, 79, 84], 0.09, 0.2, 'square', [84, 88, 91]), 1.4, { rev: 0.3, variants: 1, pitch: 0, duck: 0.6 }),
    fail: S(softFail(67), 0.8, { variants: 1, pitch: 0, duck: 0.4 }),

    /* ---------- 3d/common/sfx ---------- */
    pick: S((v) => tone(v, { f: 520, f2: 830, dur: 0.09, vol: 0.3, type: 'triangle' }), 0.12),
    drop: S((v) => tone(v, { f: 300, f2: 180, dur: 0.12, vol: 0.35 }), 0.15),
    throw: S(swish(1400, 600, 0.22, 0.35), 0.25),
    splat: S((v) => {
      noise(v, { kind: 'pink', dur: 0.25, vol: 0.5, f: 500, f2: 150, q: 0.8 });
      tone(v, { f: 160, f2: 80, dur: 0.18, vol: 0.3 });
    }, 0.3),
    thud: S(thud(110, 0.15, 0.5), 0.2),
    kick: S((v) => {
      tone(v, { f: 180, f2: 90, dur: 0.1, vol: 0.2, type: 'square', lp: 800 });
      noise(v, { dur: 0.1, vol: 0.3, f: 300 });
    }, 0.15),
    poof: S(poof(0.45), 0.5),
    squeak: S((v) => tone(v, { f: 1500 + v.r() * 400, f2: 2200, dur: 0.07, vol: 0.12 }), 0.1),
    scrub: S((v) => noise(v, { dur: 0.12, vol: 0.2, f: 2400, q: 2 }), 0.15),
    vacuum: S((v) => noise(v, { dur: 0.18, vol: 0.18, f: 700, f2: 1300, q: 1.5 }), 0.2),
    clean: S(sparkle(84, 4, 0.16, 0.06), 0.5),
    fix: S((v) => arp(v, [72, 79, 84], { step: 0.07, dur: 0.16, vol: 0.2 }), 0.4),
    eat: S((v) => {
      for (const d of [0, 0.09, 0.18]) tone(v, { f: 240, f2: 170, dur: 0.06, vol: 0.18, type: 'square', lp: 1200, delay: d });
    }, 0.3),
    paint: S((v) => noise(v, { kind: 'pink', dur: 0.1, vol: 0.15, f: 900, q: 0.7 }), 0.12),
    sparkle: S(sparkle(91, 6, 0.14, 0.07), 0.8, { rev: 0.25 }),
    step: S((v) => tone(v, { f: 90 + v.r() * 30, f2: 70, dur: 0.05, vol: 0.12 }), 0.07, { max: 3 }),
    pop: S(bubble(800, 0.4, 0.35), 0.1),
    chop: S((v) => {
      knock(v, { fs: [800, 1900], dur: 0.05, vol: 0.3, q: 8 });
      noise(v, { dur: 0.05, vol: 0.15, f: 3200, q: 2 });
    }, 0.08),
    sizzle: S(sizzle(0.35, 0.2), 0.4),
    bubble: S(bubbles(1, 0.01, 0.3), 0.1),
    spray: S((v) => noise(v, { dur: 0.16, vol: 0.2, f: 1800, f2: 2400, q: 0.6 }), 0.2),
    crash: S(both(rocks(8, 0.3, 0.2), (v) => arp(v, [90, 94, 88], { step: 0.05, dur: 0.08, vol: 0.06 })), 0.4, { duck: 0.3 }),
    whoosh: S(swish(600, 1800, 0.3, 0.3), 0.35),
    boing: S(boing(220, 2.2, 0.35), 0.32),
    catch: S((v) => {
      tone(v, { f: 660, f2: 860, dur: 0.07, vol: 0.25, type: 'triangle' });
      tone(v, { f: 990, f2: 1180, dur: 0.09, vol: 0.2, type: 'triangle', delay: 0.06 });
    }, 0.2),
    swish: S((v) => arp(v, [79, 83, 86], { step: 0.05, dur: 0.12, vol: 0.18 }), 0.3),
    fire: S((v) => noise(v, { kind: 'pink', dur: 0.5, vol: 0.25, f: 300, f2: 600, q: 0.5, a: 0.05 }), 0.55),
    bump: S((v) => {
      thump(v, { f: 70, dur: 0.25, vol: 0.45 });
    }, 0.3),
    ding: S((v) => {
      bell(v, { f: 1568, dur: 0.6, vol: 0.25, ratio: 1, index: 0.3 });
      bell(v, { f: 2093, dur: 0.4, vol: 0.1, ratio: 1, index: 0.3, delay: 0.01 });
    }, 0.7, { rev: 0.2 }),
    knob: S((v) => {
      tone(v, { f: 1200, f2: 800, dur: 0.025, vol: 0.12, type: 'square', lp: 2500 });
      tone(v, { f: 900, f2: 600, dur: 0.025, vol: 0.1, type: 'square', lp: 2500, delay: 0.05 });
    }, 0.1),
    ignite: S((v) => {
      tone(v, { f: 2200, f2: 1100, dur: 0.03, vol: 0.08, type: 'square', lp: 3000 });
      noise(v, { kind: 'pink', dur: 0.35, vol: 0.3, f: 500, f2: 1100, q: 0.7, a: 0.03 });
    }, 0.4),
    door: S((v) => {
      noise(v, { kind: 'pink', dur: 0.12, vol: 0.2, f: 900, f2: 500 });
      thump(v, { f: 120, dur: 0.12, vol: 0.25, delay: 0.08 });
    }, 0.25),
    thunk: S(both(thud(140, 0.12, 0.4), woodClick(400, 0.25)), 0.18),
    print: S((v) => {
      for (const d of [0, 0.07, 0.14, 0.21, 0.28]) tone(v, { f: 380, dur: 0.05, vol: 0.1, type: 'square', lp: 1500, delay: d });
    }, 0.35),
    splash: S(splash(0.45), 0.45),
    water: S((v) => noise(v, { dur: 0.25, vol: 0.15, f: 2600, q: 0.6, a: 0.04 }), 0.3),
    press: S((v) => {
      tone(v, { f: 300, f2: 240, dur: 0.04, vol: 0.15, type: 'square', lp: 1200 });
      tone(v, { f: 1300, dur: 0.03, vol: 0.1, type: 'triangle', delay: 0.01 });
    }, 0.06),
    yay: S((v) => arp(v, [79, 83, 88], { step: 0.07, dur: 0.14, vol: 0.2 }), 0.4),

    /* ---------- extras comuns ---------- */
    dirtPour: S(dirt(0.4, 0.5), 0.6),
    rockPour: S(rocks(18, 0.3, 0.6), 0.75),
    clang: S(clang(520, 0.3, 0.6), 0.7),
    bubbles: S(bubbles(6, 0.5, 0.3), 0.6),
  },
});
