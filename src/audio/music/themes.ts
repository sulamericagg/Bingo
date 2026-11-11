/* ============================================================
 *  BLOOP AUDIO — temas musicais por jogo (todos originais, gerados).
 *  Cada jogo tem andamento, tônica, modo, instrumentação e humor próprios;
 *  as camadas mudam com o estado: calm (explorar) / tension (perigo, tempo
 *  acabando) / victory (vitória, recorde). Nenhuma melodia de terceiros:
 *  as frases saem da semente de cada tema (composeMelody).
 * ============================================================ */
import { MODES, type Theme } from './player';

const T: Theme[] = [
  {
    // Hub: bolhas felizes — marimba + kalimba, baixo redondo, palminhas leves
    id: 'hub',
    db: -0.2,
    name: 'Hub — Bolhas',
    bpm: 112,
    root: 65, // Fá maior
    mode: MODES.major,
    prog: [0, 4, 5, 3],
    seed: 101,
    parts: [
      { role: 'pad', inst: 'padGlass', vol: 0.8, st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'bass', inst: 'roundBass', vol: 0.9, pat: 'x.....x.x...o...', st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'lead', inst: 'marimba', vol: 1, oct: 1, dens: 0.55, st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'arp', inst: 'kalimba', vol: 0.6, oct: 1, pat: '..x...x...x...x.', order: [2, 1, 0, 1], st: { calm: 0.8, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'shaker', vol: 0.8, pat: '..x...x...x...x.', st: { calm: 0.7, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'kick', vol: 0.7, pat: 'x.......x.......', st: { calm: 0.6, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'snap', vol: 0.7, pat: '....x.......x...', st: { calm: 0.8, tension: 1, victory: 1 } },
      { role: 'bell', inst: 'bell', vol: 0.5, oct: 2, len: 4, st: { victory: 1 } },
    ],
  },
  {
    // Orbit: espaço — pad de vidro, sub grave, arpejo de sininho; tensão acelera o arpejo
    id: 'orbit',
    db: -0.8,
    name: 'Orbit — Synth espacial',
    bpm: 100,
    root: 57, // Lá dórico
    mode: MODES.dorian,
    prog: [0, 0, 5, 3],
    sev: true,
    seed: 202,
    parts: [
      { role: 'pad', inst: 'padGlass', vol: 1, len: 32, st: { calm: 1, tension: 0.8, victory: 1 } },
      { role: 'bass', inst: 'subBass', vol: 0.9, pat: 'x.......x.....x.', st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'arp', inst: 'musicbox', vol: 0.55, oct: 1, pat: 'x.x.x.x.x.x.x.x.', order: [0, 1, 2, 3, 2, 1], st: { calm: 1, tension: 0.4, victory: 1 } },
      { role: 'arp', inst: 'chip', vol: 0.5, oct: 1, pat: 'xxxxxxxxxxxxxxxx', order: [0, 2, 1, 3], len: 1, st: { tension: 1 } },
      { role: 'lead', inst: 'bell', vol: 0.8, oct: 1, dens: 0.3, st: { calm: 0.8, tension: 0.6, victory: 1 } },
      { role: 'perc', inst: 'kick', vol: 0.7, pat: 'x.......x.......', st: { calm: 0.5, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'hat', vol: 0.8, pat: '..x...x...x...x.', st: { calm: 0.5, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'clap', vol: 0.6, pat: '....x.......x...', st: { tension: 1 } },
    ],
  },
  {
    // Tubo: arcade fliperama — chip, baixo chip, bateria reta
    id: 'tubo',
    db: 0.1,
    name: 'Tubo — Fliperama',
    bpm: 128,
    root: 64, // Mi mixolídio
    mode: MODES.mixo,
    prog: [0, 6, 3, 0],
    seed: 303,
    parts: [
      { role: 'bass', inst: 'chipBass', vol: 0.7, pat: 'x.x.x.x.x.x.o.x.', st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'lead', inst: 'chip', vol: 0.9, oct: 1, dens: 0.6, st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'arp', inst: 'pluck', vol: 0.6, oct: 0, pat: 'x.xx.xx.x.xx.xx.', st: { calm: 0.6, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'kick', vol: 0.8, pat: 'x...x...x...x...', st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'snare', vol: 0.5, pat: '....x.......x...', st: { calm: 0.8, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'hat', vol: 0.7, pat: 'x.x.x.x.x.x.x.x.', st: { calm: 0.6, tension: 1, victory: 1 } },
    ],
  },
  {
    // Rally: rock de estrada animado — sintetizador "metal", baixo palhetado, bateria cheia
    id: 'rally',
    db: -0.4,
    name: 'Rally — Pé na estrada',
    bpm: 144,
    root: 62, // Ré mixolídio
    mode: MODES.mixo,
    prog: [0, 6, 3, 0, 0, 6, 4, 4],
    seed: 404,
    parts: [
      { role: 'bass', inst: 'pluckBass', vol: 0.85, pat: 'x.x.x.x.x.x.x.x.', st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'chord', inst: 'brass', vol: 0.5, pat: 'X.....x...x.....', len: 3, st: { calm: 0.7, tension: 1, victory: 1 } },
      { role: 'lead', inst: 'synth', vol: 0.75, oct: 1, dens: 0.5, st: { calm: 0.8, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'kick', vol: 0.85, pat: 'x...x...x...x...', st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'snare', vol: 0.6, pat: '....x.......x..x', st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'hat', vol: 0.8, pat: 'xxxxxxxxxxxxxxxx', st: { calm: 0.5, tension: 1, victory: 0.8 } },
      { role: 'perc', inst: 'cowbell', vol: 0.4, pat: 'x.......x.......', st: { victory: 1 } },
    ],
  },
  {
    // Tycoon: bossa de escritório — piano elétrico, swing, aro + chimbal
    id: 'tycoon',
    db: 1.9,
    name: 'Tycoon — Bossa do negócio',
    bpm: 104,
    root: 58, // Si♭ maior
    mode: MODES.major,
    prog: [1, 4, 0, 5],
    sev: true,
    swing: 0.18,
    seed: 505,
    parts: [
      { role: 'chord', inst: 'epiano', vol: 0.7, pat: 'x..x..x...x..x..', len: 2, st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'bass', inst: 'roundBass', vol: 0.9, pat: 'x..o..x.x..o..x.', st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'lead', inst: 'vibes', vol: 0.8, oct: 1, dens: 0.4, st: { calm: 0.8, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'rim', vol: 0.6, pat: '..x..x....x..x..', st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'brush', vol: 0.7, pat: 'x.x.x.x.x.x.x.x.', st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'kick', vol: 0.5, pat: 'x......x........', st: { tension: 1, victory: 1 } },
    ],
  },
  {
    // Cozinha: bistrô agitado — acordeão, pizzicato, contrabaixo, bloquinho de madeira
    id: 'cozinha',
    db: 6.5,
    name: 'Cozinha — Bistrô agitado',
    bpm: 132,
    root: 67, // Sol maior
    mode: MODES.major,
    prog: [0, 3, 4, 0, 0, 5, 1, 4],
    waltz: true,
    seed: 606,
    parts: [
      { role: 'bass', inst: 'roundBass', vol: 0.9, pat: 'x...........', st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'chord', inst: 'pluck', vol: 0.45, pat: '....x...x...', len: 2, st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'lead', inst: 'accordion', vol: 0.9, oct: 0, dens: 0.55, st: { calm: 0.9, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'wood', vol: 0.5, pat: '....x...x...', st: { calm: 0.7, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'shaker', vol: 0.5, pat: 'x.x.x.x.x.x.', st: { tension: 1, victory: 0.7 } },
      { role: 'perc', inst: 'tri', vol: 0.5, pat: 'x...........', st: { victory: 1 } },
    ],
  },
  {
    // Noites: floresta à noite — pad escuro, kalimba distante, flauta rara; tensão = tambor grave pulsando
    id: 'noites',
    db: -0.6,
    name: 'Noites — Fogueira e estrelas',
    bpm: 72,
    root: 62, // Ré dórico
    mode: MODES.dorian,
    prog: [0, 0, 6, 3],
    seed: 707,
    phrase: 8,
    parts: [
      { role: 'drone', inst: 'padDark', vol: 1, len: 32, st: { calm: 1, tension: 1, victory: 0.6 } },
      { role: 'pad', inst: 'choir', vol: 0.5, len: 32, st: { calm: 0.6, tension: 0.3, victory: 1 } },
      { role: 'arp', inst: 'kalimba', vol: 0.5, oct: 0, pat: 'x.....x.....x...', order: [0, 2, 1], st: { calm: 1, tension: 0.6, victory: 1 } },
      { role: 'lead', inst: 'flute', vol: 0.7, oct: 1, dens: 0.25, st: { calm: 0.8, victory: 1 } },
      { role: 'bass', inst: 'subBass', vol: 0.7, pat: 'x.......x.......', st: { tension: 1 } },
      { role: 'perc', inst: 'lowTom', vol: 0.6, pat: 'x.....x.........', st: { tension: 1 } },
      { role: 'arp', inst: 'strings', vol: 0.35, oct: 0, pat: 'x...x...x...x...', order: [0, 1], len: 3, st: { tension: 1 } },
      { role: 'bell', inst: 'musicbox', vol: 0.5, oct: 2, len: 2, st: { victory: 1 } },
    ],
  },
  {
    // Floresta/Mundo: mundo de blocos — caixinha de música, lídio sonhador, sem bateria no calmo
    id: 'floresta',
    db: 0.4,
    name: 'Mundo — Blocos sonhadores',
    bpm: 92,
    root: 63, // Mi♭ lídio
    mode: MODES.lydian,
    prog: [0, 1, 0, 4],
    seed: 808,
    parts: [
      { role: 'pad', inst: 'padWarm', vol: 0.9, len: 32, st: { calm: 1, tension: 0.7, victory: 1 } },
      { role: 'lead', inst: 'musicbox', vol: 0.9, oct: 1, dens: 0.4, st: { calm: 1, tension: 0.6, victory: 1 } },
      { role: 'arp', inst: 'marimba', vol: 0.5, oct: 0, pat: 'x...x...x...x...', order: [0, 1, 2, 1], st: { calm: 0.8, tension: 1, victory: 1 } },
      { role: 'bass', inst: 'roundBass', vol: 0.7, pat: 'x.......o.......', st: { calm: 0.8, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'shaker', vol: 0.5, pat: '..x...x...x...x.', st: { tension: 1, victory: 1 } },
      { role: 'perc', inst: 'tom', vol: 0.5, pat: 'x.....x...x.....', st: { tension: 1 } },
      { role: 'perc', inst: 'kick', vol: 0.5, pat: 'x.......x.......', st: { victory: 1 } },
    ],
  },
  {
    // Garimpo: sertão — viola caipira, sanfona, zabumba e triângulo
    id: 'garimpo',
    db: 2.2,
    name: 'Garimpo — Viola do sertão',
    bpm: 98,
    root: 57, // Lá mixolídio
    mode: MODES.mixo,
    prog: [0, 0, 6, 0, 3, 3, 4, 0],
    seed: 909,
    parts: [
      { role: 'arp', inst: 'viola', vol: 0.9, oct: 0, pat: 'x.xxx.xxx.xxx.xx', order: [0, 2, 1, 2], st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'bass', inst: 'roundBass', vol: 0.85, pat: 'x.......o.......', st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'lead', inst: 'accordion', vol: 0.7, oct: 1, dens: 0.4, st: { calm: 0.7, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'zabumba', vol: 0.7, pat: 'x.....x...x.....', st: { calm: 0.6, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'tri', vol: 0.5, pat: 'x.x.x.x.x.x.x.x.', st: { tension: 1, victory: 1 } },
    ],
  },
  {
    // Desastre: aventura de resgate heroica (sem medo) — cordas, metais, tambores
    id: 'disaster',
    db: -1.2,
    name: 'Desastre — Resgate heroico',
    bpm: 108,
    root: 60, // Dó menor harmônico
    mode: MODES.harm,
    prog: [0, 5, 3, 4],
    seed: 1010,
    parts: [
      { role: 'pad', inst: 'strings', vol: 0.9, st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'bass', inst: 'pluckBass', vol: 0.8, pat: 'x...x...x...x...', st: { calm: 0.8, tension: 0.4, victory: 1 } },
      { role: 'bass', inst: 'pluckBass', vol: 0.8, pat: 'x.x.x.x.x.x.x.x.', st: { tension: 1 } },
      { role: 'lead', inst: 'brass', vol: 0.7, oct: 1, dens: 0.35, st: { calm: 0.6, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'tom', vol: 0.6, pat: 'x..x..x...x.x...', st: { calm: 0.5, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'snare', vol: 0.4, pat: '....x.......x.xx', st: { tension: 1 } },
      { role: 'perc', inst: 'kick', vol: 0.6, pat: 'x.......x.......', st: { tension: 1, victory: 1 } },
      { role: 'bell', inst: 'bell', vol: 0.4, oct: 1, len: 2, st: { victory: 1 } },
    ],
  },
  {
    // Voo: lounge de aeroporto — piano elétrico, pad, baixo redondo, vassourinha
    id: 'voo',
    db: 1.0,
    name: 'Voo — Lounge nas nuvens',
    bpm: 88,
    root: 65, // Fá lídio
    mode: MODES.lydian,
    prog: [0, 1, 5, 4],
    sev: true,
    swing: 0.12,
    seed: 1111,
    parts: [
      { role: 'pad', inst: 'padGlass', vol: 0.8, st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'chord', inst: 'epiano', vol: 0.6, pat: 'x.......x..x....', len: 4, st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'bass', inst: 'roundBass', vol: 0.8, pat: 'x.....o...x.....', st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'lead', inst: 'whistle', vol: 0.55, oct: 1, dens: 0.3, st: { calm: 0.6, tension: 0.4, victory: 1 } },
      { role: 'perc', inst: 'brush', vol: 0.7, pat: '..x...x...x...x.', st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'rim', vol: 0.4, pat: '....x.......x...', st: { tension: 1 } },
    ],
  },
  {
    // Cava & Fala: oficina de engenhocas — marimba saltitante, baixo palhetado, palmas
    id: 'cavafala',
    db: 0.6,
    name: 'Cava & Fala — Engenhocas',
    bpm: 116,
    root: 67, // Sol mixolídio
    mode: MODES.mixo,
    prog: [0, 3, 6, 3],
    seed: 1212,
    parts: [
      { role: 'bass', inst: 'pluckBass', vol: 0.8, pat: 'x..x..x.x..x..x.', st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'lead', inst: 'marimba', vol: 1, oct: 1, dens: 0.6, st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'chord', inst: 'organ', vol: 0.4, pat: '....x.......x...', len: 2, st: { calm: 0.6, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'wood', vol: 0.6, pat: 'x..x..x...x..x..', st: { calm: 0.8, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'clap', vol: 0.5, pat: '....x.......x...', st: { tension: 1, victory: 1 } },
      { role: 'perc', inst: 'kick', vol: 0.6, pat: 'x.......x.......', st: { calm: 0.6, tension: 1, victory: 1 } },
    ],
  },
  {
    // Pintou Ganhou: pop colorido — pluck brilhante, sinos, batida pop
    id: 'cor',
    db: -0.2,
    name: 'Pintou Ganhou — Pop de cores',
    bpm: 122,
    root: 70, // Si♭ maior (oitava de cima)
    mode: MODES.major,
    prog: [0, 5, 3, 4],
    seed: 1313,
    parts: [
      { role: 'arp', inst: 'pluck', vol: 0.6, oct: -1, pat: 'x.xx.xx.x.xx.xx.', order: [0, 1, 2, 1], st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'bass', inst: 'subBass', vol: 0.8, pat: 'x.....x...x.....', st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'lead', inst: 'ocarina', vol: 0.8, oct: 0, dens: 0.45, st: { calm: 0.8, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'kick', vol: 0.7, pat: 'x...x...x...x...', st: { calm: 0.7, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'clap', vol: 0.5, pat: '....x.......x...', st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'shaker', vol: 0.5, pat: 'x.x.x.x.x.x.x.x.', st: { tension: 1, victory: 1 } },
      { role: 'bell', inst: 'bell', vol: 0.4, oct: 1, len: 2, st: { victory: 1 } },
    ],
  },
  {
    // Desenha e Vira: ateliê sonhador — caixinha de música, harpa, pad
    id: 'desenho',
    db: 1.2,
    name: 'Desenha e Vira — Ateliê',
    bpm: 96,
    root: 68, // Lá♭ maior
    mode: MODES.major,
    prog: [0, 3, 1, 4],
    waltz: true,
    seed: 1414,
    parts: [
      { role: 'pad', inst: 'padWarm', vol: 0.7, st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'arp', inst: 'harp', vol: 0.8, oct: -1, pat: 'x...x...x...', order: [0, 1, 2], st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'lead', inst: 'musicbox', vol: 0.9, oct: 0, dens: 0.45, st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'shaker', vol: 0.4, pat: '....x...x...', st: { tension: 1, victory: 1 } },
      { role: 'bell', inst: 'bell', vol: 0.4, oct: 1, len: 2, st: { victory: 1 } },
    ],
  },
  {
    // Bloop no Lugar: quebra-cabeça calmo — kalimba e piano elétrico, sem bateria
    id: 'lugar',
    db: 0.6,
    name: 'Bloop no Lugar — Pensando',
    bpm: 84,
    root: 64, // Mi maior
    mode: MODES.major,
    prog: [0, 5, 3, 4],
    sev: true,
    seed: 1515,
    parts: [
      { role: 'chord', inst: 'epiano', vol: 0.5, pat: 'x.......x.......', len: 6, st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'lead', inst: 'kalimba', vol: 1, oct: 1, dens: 0.35, st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'bass', inst: 'roundBass', vol: 0.7, pat: 'x.......x.......', st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'shaker', vol: 0.4, pat: '..x...x...x...x.', st: { tension: 1, victory: 1 } },
      { role: 'bell', inst: 'vibes', vol: 0.5, oct: 1, len: 2, st: { victory: 1 } },
    ],
  },
  {
    // Caça: expedição — flauta, violão, congas
    id: 'caca',
    db: 2.0,
    name: 'Caça — Expedição',
    bpm: 110,
    root: 62, // Ré dórico
    mode: MODES.dorian,
    prog: [0, 3, 0, 6],
    seed: 1616,
    parts: [
      { role: 'arp', inst: 'guitar', vol: 0.8, oct: 0, pat: 'x..x..x.x..x..x.', order: [0, 2, 1, 2], st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'bass', inst: 'roundBass', vol: 0.8, pat: 'x.......x.....o.', st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'lead', inst: 'flute', vol: 0.8, oct: 1, dens: 0.4, st: { calm: 0.8, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'conga', vol: 0.6, pat: 'x..x..x...x.x...', st: { calm: 0.7, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'bongo', vol: 0.5, pat: '..x...x...x...xx', st: { tension: 1, victory: 1 } },
    ],
  },
  {
    // Estúdio: criativo — piano elétrico, pluck, batida leve
    id: 'studio',
    db: 2.1,
    name: 'Estúdio — Criando',
    bpm: 100,
    root: 60, // Dó maior
    mode: MODES.major,
    prog: [0, 4, 5, 3],
    sev: true,
    seed: 1717,
    parts: [
      { role: 'chord', inst: 'epiano', vol: 0.6, pat: 'x.....x.....x...', len: 4, st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'bass', inst: 'subBass', vol: 0.8, pat: 'x.....x...x.....', st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'arp', inst: 'pluck', vol: 0.5, oct: 1, pat: '..x...x...x...x.', st: { calm: 0.7, tension: 1, victory: 1 } },
      { role: 'lead', inst: 'vibes', vol: 0.6, oct: 1, dens: 0.3, st: { calm: 0.6, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'kick', vol: 0.6, pat: 'x.......x.......', st: { calm: 0.7, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'snap', vol: 0.6, pat: '....x.......x...', st: { calm: 0.7, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'hat', vol: 0.5, pat: '..x...x...x...x.', st: { tension: 1, victory: 1 } },
    ],
  },
  {
    // TV/Cinema (menu): vinheta de TV leve — vibrafone e baixo
    id: 'tv',
    db: 4.3,
    name: 'TV — Vinheta leve',
    bpm: 108,
    root: 67,
    mode: MODES.major,
    prog: [0, 5, 1, 4],
    sev: true,
    swing: 0.15,
    seed: 1818,
    parts: [
      { role: 'chord', inst: 'vibes', vol: 0.5, pat: 'x.....x.........', len: 4, st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'bass', inst: 'roundBass', vol: 0.7, pat: 'x...o...x...o...', st: { calm: 1, tension: 1, victory: 1 } },
      { role: 'lead', inst: 'whistle', vol: 0.5, oct: 1, dens: 0.35, st: { calm: 0.7, tension: 1, victory: 1 } },
      { role: 'perc', inst: 'brush', vol: 0.6, pat: 'x.x.x.x.x.x.x.x.', st: { calm: 1, tension: 1, victory: 1 } },
    ],
  },
];

export const THEMES: Record<string, Theme> = Object.fromEntries(T.map((t) => [t.id, t]));
export const themeIds = () => T.map((t) => t.id);
