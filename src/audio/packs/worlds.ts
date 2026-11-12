/* ============================================================
 *  PACOTES — jogos de mundo aberto / simulação:
 *  Noites, Mundo/Floresta, Garimpo, Desastre, Voo, Cozinha.
 * ============================================================ */
import { definePack } from '../sound';
import {
  S, bell, birdChirp, birdsBed, both, bubbles, clang, coinChime, creak, cricketsBed, dingDong, dirt, drip,
  fanfare, fireBed, frog, glass, grains, growl, humBed, knock, later, leaves, metalClick, mtof, murmurBed, noise, owl, pop,
  ratchet, rocks, sand, sizzle, softFail, sparkle, splash, streamBed, swish, thud, thump, tone, twig,
  windBed, woodClick, woodHit, type V,
} from './lib';

/* ================================ NOITES ================================ */
// fogueira, grilos, corujas, vento nas árvores; machado em madeira, toras caindo; bichos fofos.
definePack({
  id: 'noites',
  name: 'Noites (acampamento)',
  theme: 'noites',
  sounds: {
    click: S(woodClick(1100, 0.45), 0.1, { bus: 'ui', pitch: 30 }),
    chop: S(both(woodHit(240, 0.65, 0.25), (v) => grains(v, { n: 5, span: 0.1, dur: 0.03, vol: 0.2, f: [1500, 3000], q: 3, delay: 0.01 })), 0.35, { pitch: 60, max: 3 }),
    thunk: S(both(woodHit(150, 0.6, 0.3), thud(80, 0.25, 0.5)), 0.4, { pitch: 50 }),
    thud: S(both(thud(90, 0.25, 0.55), (v) => leaves(0.12, 0.2)(v)), 0.35),
    crash: S(both(woodHit(200, 0.5, 0.25), later(0.06, woodHit(310, 0.4, 0.2)), (v) => grains(v, { n: 10, span: 0.3, dur: 0.04, vol: 0.25, f: [800, 2600], q: 4 })), 0.5, { duck: 0.3 }),
    pop: S(both(woodClick(700, 0.4), later(0.05, woodClick(950, 0.3))), 0.18),
    fix: S((v) => {
      for (let i = 0; i < 3; i++) knock(v, { fs: [520, 1300, 2600], dur: 0.08, vol: 0.4, q: 16, delay: i * 0.12 });
    }, 0.45),
    door: S(creak(14, 34, 0.45, 0.35), 0.55),
    bump: S(both(thud(75, 0.22, 0.5), growl(110, 0.12, 0.25)), 0.35),
    sparkle: S((v) => {
      // vagalumes / feitiço gentil
      for (let i = 0; i < 4; i++) bell(v, { f: mtof(86 + [0, 3, 7, 10][i]), dur: 0.5, vol: 0.12, ratio: 3, index: 0.4, delay: i * 0.08 });
    }, 0.9, { rev: 0.4 }),
    catch: S((v) => {
      leaves(0.18, 0.12)(v);
      tone(v, { f: mtof(74), f2: mtof(79), dur: 0.12, vol: 0.25, type: 'triangle', lp: 2500 });
    }, 0.25),
    swish: S(swish(500, 1600, 0.2, 0.4), 0.25),
    whoosh: S(swish(300, 900, 0.4, 0.35), 0.45),
    boing: S((v) => tone(v, { f: 180, f2: 420, dur: 0.25, vol: 0.35, vib: [12, 30] }), 0.3),
    cash: S((v) => {
      woodClick(800, 0.3)(v);
      sparkle(84, 3, 0.15)({ ...v, t: v.t + 0.05 });
    }, 0.6),
    step: S((v) => {
      noise(v, { kind: 'brown', dur: 0.08, vol: 0.4, ft: 'lowpass', f: 500 });
      leaves(0.1, 0.06)(v);
    }, 0.12, { max: 3 }),
    /* ambiente e eventos */
    fireBed: S(fireBed(0.3, 8), 8, { loop: true, stereo: true, bus: 'amb', db: -2 }),
    crickets: S(cricketsBed(0.08, 8, 3), 8, { loop: true, stereo: true, bus: 'amb', db: -6 }),
    wind: S(windBed(420, 0.4, 0.7, 12), 12, { loop: true, stereo: true, bus: 'amb', db: -4 }),
    birds: S(birdsBed(0.06, 10), 10, { loop: true, stereo: true, bus: 'amb', db: -9 }),
    owl: S(owl(0.3), 1.2, { bus: 'amb', rev: 0.5, db: -6 }),
    frog: S(frog(0.25), 0.6, { bus: 'amb', db: -10 }),
    twig: S(twig(0.35), 0.15, { bus: 'amb', db: -8 }),
    growl: S(growl(85, 0.3, 0.7), 0.8, { db: -6, duck: 0.2 }),
    axe: S(both(woodHit(240, 0.65, 0.25), (v) => grains(v, { n: 5, span: 0.1, dur: 0.03, vol: 0.2, f: [1500, 3000], q: 3, delay: 0.01 })), 0.35, { pitch: 60 }),
    logDrop: S(both(woodHit(120, 0.6, 0.35), thud(60, 0.35, 0.6), later(0.14, woodHit(170, 0.3, 0.2))), 0.6, { duck: 0.2 }),
  },
  amb: {
    // dia (calm): passarinhos + vento; noite (tension/victory, setIntensity do jogo): grilos, corujas, sapos
    layers: [
      { id: 'fireBed', db: -5 },
      { id: 'wind', db: -2 },
      { id: 'birds', when: ['calm'] },
      { id: 'crickets', when: ['tension', 'victory'] },
    ],
    events: [
      { ids: ['owl'], every: [14, 30], pan: 0.8, when: ['tension', 'victory'] },
      { ids: ['frog', 'twig'], every: [7, 16], pan: 0.9, when: ['tension'] },
      { ids: ['twig'], every: [10, 22], pan: 0.9, when: ['calm'] },
    ],
  },
});

/* ============================ MUNDO / FLORESTA ============================ */
// mundo de blocos: quebrar por material, passos por chão, pássaros/vento, gotas em caverna.
const mats = {
  dirt: dirt(0.55, 0.15),
  stone: rocks(9, 0.4, 0.14),
  wood: woodHit(300, 0.55, 0.2),
  sand: sand(0.5, 0.2),
  glass: glass(0.3),
  leaves: leaves(0.45, 0.22),
  snow: both(sand(0.25, 0.12), (v) => noise(v, { kind: 'pink', dur: 0.15, vol: 0.3, ft: 'lowpass', f: 900 })),
  metal: metalClick(1500, 0.4),
};
const stepOf = (m: keyof typeof mats) => {
  switch (m) {
    case 'stone':
      return (v: V) => knock(v, { fs: [500, 1300], dur: 0.05, vol: 0.4, q: 4 });
    case 'wood':
      return woodClick(420, 0.4);
    case 'sand':
      return sand(0.3, 0.08);
    case 'leaves':
      return leaves(0.3, 0.08);
    case 'snow':
      return both(sand(0.2, 0.1), (v) => noise(v, { kind: 'brown', dur: 0.1, vol: 0.3, ft: 'lowpass', f: 600 }));
    case 'glass':
    case 'metal':
      return metalClick(1100, 0.25);
    default:
      return (v: V) => {
        noise(v, { kind: 'brown', dur: 0.09, vol: 0.5, ft: 'lowpass', f: 450 });
        grains(v, { n: 3, span: 0.05, dur: 0.02, vol: 0.15, f: [400, 900], q: 2 });
      };
  }
};
const MAT_SOUNDS: Record<string, ReturnType<typeof S>> = {};
for (const m of Object.keys(mats) as (keyof typeof mats)[]) {
  MAT_SOUNDS[`dig_${m}`] = S(mats[m], m === 'glass' ? 0.8 : 0.4, { max: 4, pitch: 70 });
  MAT_SOUNDS[`break_${m}`] = S(both(mats[m], later(0.04, mats[m]), (v) => thump(v, { f: 100, dur: 0.15, vol: 0.3 })), m === 'glass' ? 0.9 : 0.55, { max: 3, pitch: 60, db: 2 });
  MAT_SOUNDS[`step_${m}`] = S(stepOf(m), 0.15, { max: 3, pitch: 80, db: -8 });
}
definePack({
  id: 'floresta',
  name: 'Mundo / Floresta',
  theme: 'floresta',
  sounds: {
    ...MAT_SOUNDS,
    click: S(woodClick(1000, 0.4), 0.1, { bus: 'ui' }),
    tick: S(woodHit(330, 0.5, 0.16), 0.22, { pitch: 80, max: 4 }), // golpes em árvore/bloco
    crack: S(both(woodHit(180, 0.55, 0.3), later(0.05, (v) => grains(v, { n: 12, span: 0.35, dur: 0.04, vol: 0.25, f: [700, 2400], q: 5, decay: 1 })), later(0.25, leaves(0.3, 0.4))), 0.8, { duck: 0.25 }),
    coin: S((v) => {
      pop(v, { f: 600, vol: 0.35, up: 1.6 });
      bell(v, { f: mtof(84), dur: 0.35, vol: 0.2, ratio: 3, index: 0.4, delay: 0.04 });
    }, 0.45, { rev: 0.2, pitch: 15 }),
    hit: S(both(thud(100, 0.25, 0.5), leaves(0.2, 0.15)), 0.35),
    land: S((v) => {
      noise(v, { kind: 'brown', dur: 0.12, vol: 0.5, ft: 'lowpass', f: 500 });
      leaves(0.15, 0.08)(v);
    }, 0.2, { pitch: 30 }),
    jump: S(swish(400, 900, 0.18, 0.3), 0.2),
    cash: S(both(woodClick(900, 0.3), later(0.06, coinChime(86, 0.3))), 0.6),
    record: S(fanfare([75, 79, 82, 87], 0.1, 0.2, 'triangle', [87, 91, 94]), 1.5, { variants: 1, duck: 0.5, rev: 0.3 }),
    /* ambiente */
    birds: S(birdsBed(0.06, 10), 10, { loop: true, stereo: true, bus: 'amb', db: -8 }),
    wind: S(windBed(650, 0.35, 0.6, 12), 12, { loop: true, stereo: true, bus: 'amb', db: -6 }),
    chirp: S(birdChirp(3200, 3, 0.12), 0.5, { bus: 'amb', db: -8 }),
    drip: S(drip(0.3), 0.15, { bus: 'amb', rev: 0.8, db: -6 }),
    caveBed: S(humBed(70, 0.25, 8, 0.8), 8, { loop: true, stereo: true, bus: 'amb', db: -8 }),
  },
  amb: { layers: [{ id: 'birds' }, { id: 'wind' }], events: [{ ids: ['chirp'], every: [5, 12], pan: 0.9 }] },
});

/* ================================ GARIMPO ================================ */
// diesel com RPM, hidráulicos, terra caindo, água, ouro tilintando, bipe do detector.
definePack({
  id: 'garimpo',
  name: 'Garimpo',
  theme: 'garimpo',
  motor: { kind: 'diesel', idle: 34, top: 78, vol: 0.11 },
  sounds: {
    click: S(metalClick(1800, 0.3), 0.12, { bus: 'ui' }),
    coin: S((v) => {
      // pepita de ouro: tilintar metálico curto e quente
      bell(v, { f: mtof(83), dur: 0.18, vol: 0.28, ratio: 2.71, index: 0.9 });
      bell(v, { f: mtof(90), dur: 0.5, vol: 0.22, ratio: 2.71, index: 0.6, delay: 0.07 });
    }, 0.6, { rev: 0.15, pitch: 20, max: 5 }),
    cash: S((v) => {
      for (let i = 0; i < 6; i++) bell(v, { f: 1700 + v.r() * 1500, dur: 0.18, vol: 0.12, ratio: 2.71, index: 0.8, delay: i * 0.05 + v.r() * 0.02 });
      bell(v, { f: mtof(91), dur: 0.7, vol: 0.22, ratio: 2, index: 0.5, delay: 0.32 });
    }, 1.0, { rev: 0.2 }),
    tick: S((v) => tone(v, { f: 1180, dur: 0.07, vol: 0.25, type: 'triangle', lp: 2400 }), 0.1, { bus: 'ui', pitch: 0, cool: 0.04 }),
    siren: S((v) => {
      // buzina de canteiro (grave e curta, 3 toques)
      for (let i = 0; i < 3; i++) tone(v, { f: 330, dur: 0.45, vol: 0.18, type: 'sawtooth', lp: 900, delay: i * 0.7, a: 0.03 });
    }, 2.3, { variants: 1, max: 1, duck: 0.4 }),
    fail: S(softFail(64, 'triangle', 0.3), 0.8, { variants: 1 }),
    pick: S(both(metalClick(1300, 0.25), (v) => tone(v, { f: 500, f2: 700, dur: 0.08, vol: 0.2, type: 'triangle' })), 0.15),
    drop: S(both(thud(130, 0.15, 0.45), dirt(0.25, 0.1)), 0.25),
    thud: S(both(thud(95, 0.2, 0.5), dirt(0.3, 0.15)), 0.3),
    thunk: S(both(metalClick(700, 0.35), thud(120, 0.15, 0.4)), 0.25),
    crash: S(rocks(20, 0.35, 0.7), 0.85, { duck: 0.3 }),
    water: S(both(splash(0.25), bubbles(4, 0.3, 0.2, [400, 900])), 0.45),
    splash: S(splash(0.45), 0.5),
    sparkle: S(sparkle(89, 5, 0.14, 0.06), 0.7, { rev: 0.3 }),
    whoosh: S(swish(300, 900, 0.35, 0.3), 0.4),
    bump: S(both(metalClick(500, 0.3), thud(80, 0.22, 0.45)), 0.3),
    /* extras para ganchos do jogo */
    detector: S((v) => tone(v, { f: 1320, dur: 0.06, vol: 0.25, lp: 2600 }), 0.09, { pitch: 0, cool: 0.04, bus: 'ui' }),
    detectorStrong: S((v) => {
      tone(v, { f: 1760, dur: 0.05, vol: 0.25, lp: 3000 });
      tone(v, { f: 1760, dur: 0.05, vol: 0.25, lp: 3000, delay: 0.08 });
    }, 0.16, { pitch: 0, cool: 0.04, bus: 'ui' }),
    hydraulic: S((v) => {
      noise(v, { dur: 0.7, vol: 0.18, f: 2200, f2: 1400, q: 1.2, a: 0.08, hold: 0.7 });
      tone(v, { f: 140, f2: 210, dur: 0.7, vol: 0.12, type: 'sawtooth', lp: 500, a: 0.1 });
    }, 0.8),
    dirtPour: S(both(dirt(0.45, 0.7), (v) => grains(v, { n: 25, span: 0.8, dur: 0.05, vol: 0.2, f: [300, 1500], q: 2, kind: 'pink' })), 0.95),
    gold: S((v) => {
      bell(v, { f: mtof(88), dur: 0.5, vol: 0.25, ratio: 2.71, index: 0.7 });
      sparkle(93, 3, 0.1)({ ...v, t: v.t + 0.06 });
    }, 0.8, { rev: 0.3, duck: 0.2 }),
    river: S(streamBed(0.3, 8), 8, { loop: true, stereo: true, bus: 'amb', db: -6 }),
    birds: S(birdsBed(0.05, 10), 10, { loop: true, stereo: true, bus: 'amb', db: -10 }),
  },
  amb: { layers: [{ id: 'river', db: -4 }, { id: 'birds' }] },
});

/* ================================ DESASTRE ================================ */
// sirenes (amigáveis), tremor, vento forte, água correndo — tudo sem susto.
definePack({
  id: 'disaster',
  name: 'Desastre (resgate)',
  theme: 'disaster',
  sounds: {
    click: S((v) => {
      // clique de rádio
      noise(v, { dur: 0.03, vol: 0.2, f: 2000, q: 1 });
      tone(v, { f: 900, f2: 700, dur: 0.04, vol: 0.2, type: 'square', lp: 2000 });
    }, 0.08, { bus: 'ui' }),
    siren: S((v) => {
      // "ni-nó" de resgate, macio (triângulo filtrado, sem agudos estridentes)
      for (let i = 0; i < 4; i++) {
        tone(v, { f: 660, dur: 0.3, vol: 0.16, type: 'triangle', lp: 1500, delay: i * 0.6, a: 0.03 });
        tone(v, { f: 520, dur: 0.3, vol: 0.16, type: 'triangle', lp: 1500, delay: i * 0.6 + 0.3, a: 0.03 });
      }
    }, 2.5, { variants: 1, max: 1, pitch: 0, duck: 0.4 }),
    crack: S(both(rocks(14, 0.35, 0.4), (v) => noise(v, { kind: 'brown', dur: 0.5, vol: 0.3, ft: 'lowpass', f: 200 })), 0.6),
    hit: S((v) => {
      noise(v, { kind: 'brown', dur: 0.8, vol: 0.55, ft: 'lowpass', f: 160, a: 0.04 });
      thump(v, { f: 60, dur: 0.5, vol: 0.4 });
    }, 0.9, { duck: 0.4 }),
    jump: S(swish(500, 1300, 0.2, 0.35), 0.25),
    land: S(both(thud(110, 0.18, 0.45), dirt(0.2, 0.1)), 0.25),
    cash: S(fanfare([72, 77, 81, 84], 0.07, 0.18, 'triangle'), 0.7),
    coin: S(coinChime(81, 0.32), 0.55),
    unlock2: S(fanfare([67, 72, 76, 79, 84], 0.09, 0.2, 'sawtooth', [84, 88]), 1.4, { variants: 1, duck: 0.5, rev: 0.25 }),
    rumble: S((v) => {
      noise(v, { kind: 'brown', dur: 2.2, vol: 0.5, ft: 'lowpass', f: 140, a: 0.5, hold: 0.5 });
      grains(v, { n: 10, span: 2, dur: 0.05, vol: 0.12, f: [500, 1500], q: 3 });
    }, 2.4, { max: 1, duck: 0.3 }),
    windRoar: S(windBed(320, 0.5, 0.8, 8), 8, { loop: true, stereo: true, db: -4 }),
    waterRush: S((v) => {
      noise(v, { kind: 'pink', dur: 9, vol: 0.3, f: 700, q: 0.5, a: 0.01, hold: 0.99 });
      bubbles(60, 8, 0.2, [300, 900])(v);
    }, 8, { loop: true, stereo: true, db: -4 }),
    breeze: S(windBed(500, 0.35, 0.5, 12), 12, { loop: true, stereo: true, bus: 'amb', db: -12 }),
  },
  amb: { layers: [{ id: 'breeze' }] },
});

/* ================================== VOO ================================== */
// sininhos de cabine, turbinas, vento, "aviso de bordo".
definePack({
  id: 'voo',
  name: 'Voo (aeroporto e cabine)',
  theme: 'voo',
  motor: { kind: 'jet', idle: 90, top: 180, vol: 0.08 },
  sounds: {
    click: S((v) => tone(v, { f: mtof(84), dur: 0.08, vol: 0.25, lp: 3000 }), 0.1, { bus: 'ui', pitch: 10 }),
    siren: S(dingDong(81, 76, 0.32), 2.2, { variants: 1, max: 1, pitch: 0, duck: 0.6 }), // aviso de bordo (no lugar da sirene)
    tick: S((v) => tone(v, { f: mtof(88), dur: 0.05, vol: 0.18, type: 'triangle', lp: 3000 }), 0.08, { bus: 'ui', pitch: 0 }),
    chime: S((v) => bell(v, { f: mtof(81), dur: 1.4, vol: 0.32, ratio: 1, index: 0.25 }), 1.5, { variants: 1, pitch: 0, duck: 0.4 }),
    announce: S(both(dingDong(76, 81, 0.3), later(0.9, (v) => bell(v, { f: mtof(84), dur: 1.4, vol: 0.28, ratio: 1, index: 0.25 }))), 2.4, { variants: 1, pitch: 0, duck: 0.6 }),
    door: S(both(woodClick(300, 0.25), (v) => thump(v, { f: 140, dur: 0.12, vol: 0.3, delay: 0.05 })), 0.25), // bagageiro
    ding: S((v) => bell(v, { f: mtof(84), dur: 1.0, vol: 0.25, ratio: 1, index: 0.25 }), 1.1),
    sparkle: S(sparkle(86, 4, 0.13, 0.07), 0.7, { rev: 0.3 }),
    whoosh: S(swish(250, 800, 0.6, 0.35), 0.7),
    cash: S(both(metalClick(2600, 0.2), later(0.05, coinChime(84, 0.28))), 0.6),
    seatbelt: S((v) => bell(v, { f: mtof(88), dur: 0.9, vol: 0.25, ratio: 1, index: 0.2 }), 1, { variants: 1, pitch: 0 }),
    cabin: S(humBed(105, 0.3, 6, 0.6), 6, { loop: true, stereo: true, bus: 'amb', db: -8 }),
    wind: S(windBed(800, 0.35, 0.4, 10), 10, { loop: true, stereo: true, db: -8 }),
    /* emergência de fumaça */
    // tossidinha de desenho animado: dois "rã-rã" de ruído com um tom grave por baixo
    cough: S((v) => {
      for (const d of [0, 0.2]) {
        noise(v, { kind: 'pink', dur: 0.13, vol: 0.32, f: 900, f2: 500, q: 1.2, a: 0.006, delay: d });
        tone(v, { f: 210, f2: 150, dur: 0.11, vol: 0.12, type: 'triangle', lp: 900, delay: d });
      }
    }, 0.45, { pitch: 120, max: 2 }),
    // máscaras caindo: "plim" do painel + plástico batendo + chiado do oxigênio
    masks: S(both(
      (v) => bell(v, { f: mtof(86), dur: 0.5, vol: 0.2, ratio: 1, index: 0.2 }),
      (v) => { for (let i = 0; i < 6; i++) knock(v, { fs: [1400, 2600], dur: 0.04, vol: 0.18, q: 9, delay: 0.12 + i * 0.045 + v.r() * 0.02 }); },
      (v) => noise(v, { kind: 'pink', dur: 0.9, vol: 0.12, ft: 'bandpass', f: 4200, q: 0.9, a: 0.1, delay: 0.3 }),
    ), 1.3, { variants: 1, pitch: 0 }),
    // ventilação: ar sendo puxado para fora (sopro que sobe e some)
    vent: S(both(swish(180, 1200, 1.4, 0.4), (v) => tone(v, { f: 70, f2: 110, dur: 1.2, vol: 0.12, type: 'triangle', lp: 400, a: 0.2 })), 1.6, { variants: 1 }),
    // detector de fumaça fofinho: três bipes (não assusta)
    smokeAlarm: S((v) => {
      for (let i = 0; i < 3; i++) tone(v, { f: mtof(93), dur: 0.09, vol: 0.18, type: 'square', lp: 2800, delay: i * 0.16 });
    }, 0.6, { variants: 1, pitch: 0, duck: 0.3 }),
    // mala voando pela porta: "fiuuu" que vai embora + "uóón"
    bagLost: S(both(swish(1600, 300, 0.5, 0.35), later(0.35, softFail(67, 'triangle', 0.22))), 1.3, { variants: 1 }),
  },
  amb: { layers: [{ id: 'cabin' }] },
});

/* ================================ COZINHA ================================ */
// chiado na chapa, faca na tábua, plim da campainha, panelas, burburinho.
definePack({
  id: 'cozinha',
  name: 'Cozinha',
  theme: 'cozinha',
  sounds: {
    click: S((v) => knock(v, { fs: [2100, 3300], dur: 0.06, vol: 0.3, q: 25 }), 0.08, { bus: 'ui' }), // colherinha
    chop: S((v) => {
      knock(v, { fs: [900, 1700], dur: 0.06, vol: 0.45, q: 6, kind: 'pink' }); // faca na tábua
      noise(v, { dur: 0.03, vol: 0.12, f: 4000, q: 2 });
    }, 0.1, { pitch: 60, max: 4 }),
    sizzle: S(sizzle(0.6, 0.25), 0.7, { max: 2 }),
    bubble: S(bubbles(3, 0.25, 0.3, [250, 600]), 0.35),
    splat: S((v) => {
      noise(v, { kind: 'pink', dur: 0.2, vol: 0.45, f: 700, f2: 200, q: 0.9 });
      pop(v, { f: 200, vol: 0.2, up: 0.5, dur: 0.1 });
    }, 0.25),
    ding: S((v) => {
      // campainha do balcão
      bell(v, { f: 2350, dur: 1.0, vol: 0.3, ratio: 1.41, index: 0.5 });
    }, 1.1, { rev: 0.2, duck: 0.3 }),
    knob: S(ratchet(3, 2200, 0.2, 0.05), 0.2),
    ignite: S(both((v) => tone(v, { f: 2500, f2: 1500, dur: 0.02, vol: 0.08, type: 'square', lp: 3500 }), (v) => noise(v, { kind: 'pink', dur: 0.4, vol: 0.3, f: 420, f2: 900, q: 0.6, a: 0.04 })), 0.45),
    water: S((v) => noise(v, { kind: 'pink', dur: 0.5, vol: 0.25, f: 1800, q: 0.5, a: 0.05, hold: 0.6 }), 0.55),
    spray: S((v) => noise(v, { dur: 0.2, vol: 0.18, f: 2200, q: 0.6, a: 0.02 }), 0.25),
    door: S(both((v) => noise(v, { kind: 'pink', dur: 0.1, vol: 0.15, f: 600 }), later(0.05, thud(160, 0.12, 0.3))), 0.25), // geladeira/forno
    thunk: S(clang(330, 0.25, 0.4), 0.45), // panela no fogão
    crash: S((v) => {
      // pratos (macio, sem estilhaço agudo)
      for (let i = 0; i < 4; i++) bell(v, { f: 900 + v.r() * 900, dur: 0.3, vol: 0.14, ratio: 1.47, index: 0.8, delay: i * 0.05 });
      noise(v, { dur: 0.2, vol: 0.15, f: 2000, q: 0.7 });
    }, 0.6, { duck: 0.3 }),
    eat: S((v) => {
      for (const d of [0, 0.1, 0.2]) pop(v, { f: 260 + v.r() * 60, vol: 0.25, up: 0.6, dur: 0.06, delay: d });
    }, 0.35),
    catch: S((v) => {
      knock(v, { fs: [600, 1500], dur: 0.06, vol: 0.3, q: 8 });
      tone(v, { f: mtof(79), f2: mtof(84), dur: 0.1, vol: 0.18, type: 'triangle', delay: 0.02 });
    }, 0.18),
    pick: S((v) => tone(v, { f: 600, f2: 900, dur: 0.07, vol: 0.25, type: 'triangle' }), 0.1),
    drop: S(both(thud(160, 0.1, 0.35), (v) => knock(v, { fs: [700, 1500], dur: 0.05, vol: 0.2, q: 8 })), 0.15),
    coin: S((v) => bell(v, { f: mtof(86), dur: 0.5, vol: 0.28, ratio: 1.41, index: 0.5 }), 0.55, { pitch: 15 }),
    cash: S(both((v) => bell(v, { f: 2350, dur: 0.8, vol: 0.25, ratio: 1.41, index: 0.5 }), later(0.08, coinChime(88, 0.25))), 0.9),
    tick: S((v) => knock(v, { fs: [2600, 3900], dur: 0.03, vol: 0.25, q: 20 }), 0.05, { bus: 'ui', pitch: 5 }), // timer de cozinha
    siren: S((v) => {
      // timer tocando (trrrim suave)
      for (let i = 0; i < 16; i++) bell(v, { f: 2100, dur: 0.06, vol: 0.12, ratio: 1.41, index: 0.5, delay: i * 0.055 });
      for (let i = 0; i < 16; i++) bell(v, { f: 2100, dur: 0.06, vol: 0.12, ratio: 1.41, index: 0.5, delay: 1.2 + i * 0.055 });
    }, 2.2, { variants: 1, max: 1, duck: 0.4 }),
    fail: S(both(clang(260, 0.2, 0.5), softFail(64, 'triangle', 0.22)), 0.9, { variants: 1 }),
    hit: S(clang(220, 0.3, 0.6), 0.7),
    record: S(fanfare([79, 83, 86, 91], 0.09, 0.2, 'triangle', [91, 95, 98]), 1.4, { variants: 1, duck: 0.5, rev: 0.3 }),
    bustle: S(murmurBed(0.22, 8), 8, { loop: true, stereo: true, bus: 'amb', db: -10 }),
    hiss: S(sizzle(6, 0.12), 6, { loop: true, bus: 'amb', db: -14 }),
    clink: S((v) => bell(v, { f: 1300 + v.r() * 1300, dur: 0.25, vol: 0.12, ratio: 1.47, index: 0.6 }), 0.3, { bus: 'amb', db: -10 }),
  },
  amb: { layers: [{ id: 'bustle' }, { id: 'hiss' }], events: [{ ids: ['clink'], every: [3, 8], pan: 0.8 }] },
});

