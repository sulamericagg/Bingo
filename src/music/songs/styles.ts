/* ============================================================
 *  ESTILOS musicais (gêneros) do Bloop Banda — só "receitas" de
 *  estilo (andamento, modos, progressões genéricas de graus, padrões
 *  de bateria em passos de 16 avos, timbres). Nenhuma melodia/riff
 *  de música real: tudo é gerado proceduralmente em compose.ts.
 * ============================================================ */
import type { Timbre } from './synth';

export type StyleId =
  | 'rock-arena' | 'metal' | 'punk' | 'pop' | 'funk' | 'samba' | 'forro' | 'sertanejo' | 'eletronica'
  | 'kpop' | 'lofi' | 'reggae' | 'axe' | 'chiptune' | 'orquestral' | 'synthwave' | 'groove';

export type ModeId = 'ionian' | 'aeolian' | 'dorian' | 'mixolydian' | 'phrygian' | 'harmonic' | 'lydian';
export const MODES: Record<ModeId, number[]> = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};
export const isMinor = (m: ModeId) => m === 'aeolian' || m === 'dorian' || m === 'phrygian' || m === 'harmonic';

/** linha de 16 passos por peça; ver legenda em compose.ts (drumBar) */
export interface DrumPat {
  k: string;
  s: string;
  h: string;
}

export type BassPat = 'root8' | 'root16' | 'pop' | 'sub' | 'baiao' | 'samba' | 'reggae' | 'offbeat' | 'octave' | 'chip' | 'lofi' | 'axe' | 'whole';
export type GtrPat = 'power' | 'chug' | 'punk' | 'strum' | 'arp' | 'funk' | 'skank' | 'cavaco' | 'synthArp' | 'ostinato';
export type KeysPat = 'pad' | 'comp' | 'organ' | 'stabs' | 'accordion' | 'chipArp' | 'bubble';

export interface StyleDef {
  id: StyleId;
  name: string;
  bpm: [number, number];
  modes: ModeId[];
  /** progressões em graus (0 = tônica) — 1 acorde por compasso (ou 2 se half) */
  progV: number[][];
  progC: number[][];
  progB: number[][];
  half?: boolean;
  sevenths?: boolean;
  swing: number;
  timbre: Timbre;
  drumV: DrumPat;
  drumC: DrumPat;
  /** percussão extra fixa (verso/refrão) */
  perc?: Partial<Record<'su' | 'tb' | 'ag' | 'sh' | 'cb' | 'tri', string>>;
  bass: BassPat;
  gtr: GtrPat;
  keys: KeysPat;
  /** densidade melódica 0..1 e centro (MIDI) da voz */
  mel: number;
  voc: number;
  stage: string;
}

const H8 = 'x.x.x.x.x.x.x.x.';
const H16 = 'xxxxxxxxxxxxxxxx';
const BB = '....x.......x...';

export const STYLES: Record<StyleId, StyleDef> = {
  'rock-arena': {
    id: 'rock-arena', name: 'Rock de Arena', bpm: [112, 138], modes: ['mixolydian', 'ionian', 'aeolian'],
    progV: [[0, 6, 3, 0], [0, 3, 6, 3], [5, 3, 0, 4]], progC: [[3, 0, 4, 5], [0, 4, 5, 3], [3, 4, 0, 0]], progB: [[5, 3, 4, 4], [3, 3, 4, 4]],
    swing: 0, timbre: { kit: 'rock', bass: 'pick', guitar: 'dist', keys: 'organ', vocals: 'vocal', drive: 0.55 },
    drumV: { k: 'x.......x.x.....', s: BB, h: H8 }, drumC: { k: 'x.....x.x.x.....', s: BB, h: 'r.r.r.r.r.r.r.r.' },
    bass: 'root8', gtr: 'power', keys: 'organ', mel: 0.5, voc: 64, stage: 'arena',
  },
  metal: {
    id: 'metal', name: 'Metal Pesado', bpm: [140, 176], modes: ['aeolian', 'phrygian', 'harmonic'],
    progV: [[0, 0, 1, 0], [0, 5, 6, 0], [0, 0, 6, 5]], progC: [[5, 6, 0, 0], [5, 3, 6, 4], [0, 6, 5, 6]], progB: [[3, 4, 5, 6], [5, 5, 6, 6]],
    swing: 0, timbre: { kit: 'rock', bass: 'pick', guitar: 'dist', keys: 'strings', vocals: 'vocal', drive: 0.9 },
    drumV: { k: 'x.x.x.x.x.x.x.x.', s: BB, h: 'x...x...x...x...' }, drumC: { k: H16, s: BB, h: 'r...r...r...r...' },
    bass: 'root16', gtr: 'chug', keys: 'pad', mel: 0.45, voc: 62, stage: 'vulcao',
  },
  punk: {
    id: 'punk', name: 'Punk Rock', bpm: [158, 188], modes: ['ionian', 'mixolydian'],
    progV: [[0, 3, 4, 3], [0, 4, 3, 4], [0, 5, 3, 4]], progC: [[3, 4, 0, 5], [0, 3, 4, 4], [5, 3, 0, 4]], progB: [[3, 3, 4, 4]],
    swing: 0, timbre: { kit: 'rock', bass: 'pick', guitar: 'dist', keys: 'organ', vocals: 'vocal', drive: 0.75 },
    drumV: { k: 'x...x.x.x...x.x.', s: BB, h: H8 }, drumC: { k: 'x.x.x.x.x.x.x.x.', s: '..x...x...x...x.', h: 'r.r.r.r.r.r.r.r.' },
    bass: 'root8', gtr: 'punk', keys: 'organ', mel: 0.55, voc: 65, stage: 'garagem',
  },
  pop: {
    id: 'pop', name: 'Pop', bpm: [100, 124], modes: ['ionian', 'ionian', 'lydian'],
    progV: [[0, 4, 5, 3], [5, 3, 0, 4], [0, 5, 3, 4]], progC: [[3, 0, 4, 5], [0, 4, 5, 3], [5, 3, 0, 4]], progB: [[3, 4, 2, 5], [1, 4, 0, 5]],
    swing: 0, timbre: { kit: 'rock', bass: 'synth', guitar: 'clean', keys: 'epiano', vocals: 'vocal' },
    drumV: { k: 'x.....x.x.......', s: BB, h: H8 }, drumC: { k: 'x...x...x...x...', s: '....c.......c...', h: 'x.o.x.o.x.o.x.o.' },
    bass: 'pop', gtr: 'strum', keys: 'comp', mel: 0.6, voc: 66, stage: 'palco-pop',
  },
  funk: {
    id: 'funk', name: 'Batidão Funk', bpm: [126, 134], modes: ['aeolian', 'dorian'],
    progV: [[0, 0, 5, 5], [0, 3, 0, 3]], progC: [[0, 5, 3, 4], [5, 3, 0, 0]], progB: [[3, 3, 4, 4]],
    swing: 0, timbre: { kit: '808', bass: 'sub', guitar: 'synth', keys: 'brass', vocals: 'vocal' },
    drumV: { k: 'x..x..x...x..x..', s: '....c..c....c...', h: '..x...x...x...x.' }, drumC: { k: 'x..x..x.x..x..x.', s: '....c..c....c..c', h: 'x.xxx.xxx.xxx.xx' },
    perc: { cb: '...x......x.....' },
    bass: 'sub', gtr: 'synthArp', keys: 'stabs', mel: 0.62, voc: 64, stage: 'baile',
  },
  samba: {
    id: 'samba', name: 'Samba', bpm: [94, 104], modes: ['ionian', 'ionian', 'aeolian'],
    progV: [[0, 5, 1, 4], [0, 0, 1, 4], [0, 3, 1, 4]], progC: [[0, 5, 1, 4], [3, 4, 0, 5], [1, 4, 0, 0]], progB: [[3, 3, 2, 5], [1, 4, 0, 0]],
    sevenths: true, swing: 0.06, timbre: { kit: 'acoustic', bass: 'finger', guitar: 'clean', keys: 'brass', vocals: 'vocal' },
    drumV: { k: 'x.......x.......', s: '..r..r.r..r..r.r', h: '' }, drumC: { k: 'x.......x.......', s: '..x..x.x..x..x.x', h: '' },
    perc: { su: 'o...X...o...X...', tb: 'x.xx.x.xx.x.x.xx', ag: '1.2.1.1.2.1.2.2.', sh: 'xoxoxoxoxoxoxoxo' },
    bass: 'samba', gtr: 'cavaco', keys: 'stabs', mel: 0.62, voc: 65, stage: 'carnaval',
  },
  forro: {
    id: 'forro', name: 'Forró', bpm: [110, 132], modes: ['mixolydian', 'ionian'],
    progV: [[0, 0, 6, 0], [0, 4, 0, 4], [0, 3, 4, 0]], progC: [[3, 0, 4, 0], [0, 6, 3, 4], [3, 4, 0, 0]], progB: [[5, 1, 4, 4]],
    swing: 0.04, timbre: { kit: 'acoustic', bass: 'finger', guitar: 'nylon', keys: 'accordion', vocals: 'vocal' },
    drumV: { k: 'x..x....x..x....', s: '....r.......r...', h: '' }, drumC: { k: 'x..x..x.x..x..x.', s: '....x.......x...', h: '' },
    perc: { tri: 'x.xox.xox.xox.xo' },
    bass: 'baiao', gtr: 'arp', keys: 'accordion', mel: 0.55, voc: 65, stage: 'festa-junina',
  },
  sertanejo: {
    id: 'sertanejo', name: 'Sertanejo Pop', bpm: [86, 102], modes: ['ionian'],
    progV: [[0, 4, 5, 3], [0, 3, 0, 4]], progC: [[3, 4, 0, 5], [5, 3, 0, 4]], progB: [[3, 4, 2, 5]],
    swing: 0, timbre: { kit: 'acoustic', bass: 'finger', guitar: 'nylon', keys: 'accordion', vocals: 'vocal' },
    drumV: { k: 'x.....x.x.......', s: BB, h: H8 }, drumC: { k: 'x.....x.x.x.....', s: BB, h: 'x.o.x.o.x.o.x.o.' },
    bass: 'baiao', gtr: 'arp', keys: 'pad', mel: 0.5, voc: 64, stage: 'rodeio',
  },
  eletronica: {
    id: 'eletronica', name: 'Eletrônica', bpm: [122, 128], modes: ['aeolian', 'dorian'],
    progV: [[0, 5, 2, 6], [0, 3, 5, 4]], progC: [[5, 3, 0, 4], [0, 5, 3, 6]], progB: [[3, 3, 4, 4]],
    swing: 0, timbre: { kit: '808', bass: 'synth', guitar: 'synth', keys: 'pad', vocals: 'synth', room: 1 },
    drumV: { k: 'x...x...x...x...', s: BB, h: '..o...o...o...o.' }, drumC: { k: 'x...x...x...x...', s: '....c.......c...', h: 'xxoxxxoxxxoxxxox' },
    perc: { sh: 'x.x.x.x.x.x.x.x.' },
    bass: 'offbeat', gtr: 'synthArp', keys: 'pad', mel: 0.55, voc: 67, stage: 'neon',
  },
  kpop: {
    id: 'kpop', name: 'K-pop Brilhante', bpm: [116, 132], modes: ['aeolian', 'dorian', 'ionian'],
    progV: [[5, 3, 0, 4], [0, 5, 3, 4]], progC: [[3, 4, 2, 5], [5, 3, 0, 4]], progB: [[1, 4, 0, 5]],
    sevenths: true, swing: 0, timbre: { kit: '808', bass: 'sub', guitar: 'synth', keys: 'epiano', vocals: 'vocal' },
    drumV: { k: 'x.....x...x.....', s: '....c.......c...', h: H8 }, drumC: { k: 'x.....x.x.x...x.', s: '....c.......c...', h: H16 },
    bass: 'sub', gtr: 'synthArp', keys: 'comp', mel: 0.65, voc: 67, stage: 'palco-pop',
  },
  lofi: {
    id: 'lofi', name: 'Lo-fi Relax', bpm: [72, 86], modes: ['dorian', 'ionian'],
    progV: [[1, 4, 0, 5], [3, 2, 1, 4]], progC: [[3, 4, 2, 5], [1, 4, 0, 0]], progB: [[3, 3, 2, 5]],
    sevenths: true, swing: 0.16, timbre: { kit: 'lofi', bass: 'upright', guitar: 'clean', keys: 'epiano', vocals: 'vocal', room: 1 },
    drumV: { k: 'x......x..x.....', s: '....r.......r...', h: H8 }, drumC: { k: 'x......x..x..x..', s: BB, h: H8 },
    bass: 'lofi', gtr: 'arp', keys: 'comp', mel: 0.35, voc: 64, stage: 'estudio',
  },
  reggae: {
    id: 'reggae', name: 'Reggae', bpm: [72, 90], modes: ['ionian', 'mixolydian', 'dorian'],
    progV: [[0, 3, 0, 3], [0, 4, 3, 0]], progC: [[3, 4, 0, 0], [5, 3, 0, 4]], progB: [[1, 4, 1, 4]],
    swing: 0.1, timbre: { kit: 'acoustic', bass: 'finger', guitar: 'clean', keys: 'organ', vocals: 'vocal', room: 1 },
    drumV: { k: '........x.......', s: '........r.......', h: '..x...x...x...x.' }, drumC: { k: 'x.......x.......', s: '........x.......', h: 'x.x.x.x.x.x.x.x.' },
    perc: { sh: '..x...x...x...x.' },
    bass: 'reggae', gtr: 'skank', keys: 'bubble', mel: 0.45, voc: 64, stage: 'praia',
  },
  axe: {
    id: 'axe', name: 'Axé', bpm: [122, 140], modes: ['ionian', 'mixolydian'],
    progV: [[0, 4, 5, 3], [0, 3, 4, 3]], progC: [[3, 4, 0, 0], [0, 4, 3, 4]], progB: [[5, 3, 4, 4]],
    swing: 0, timbre: { kit: 'acoustic', bass: 'finger', guitar: 'clean', keys: 'brass', vocals: 'vocal' },
    drumV: { k: 'x.......x.x.....', s: '..x..x....x..x..', h: H8 }, drumC: { k: 'x..x..x.x..x..x.', s: '..x..x....x..x.x', h: H8 },
    perc: { su: 'X.......X.o.....', tb: 'x.xx.x.x.x.xx.x.', ag: '1..2..1.2..1..2.' },
    bass: 'axe', gtr: 'cavaco', keys: 'stabs', mel: 0.6, voc: 66, stage: 'carnaval',
  },
  chiptune: {
    id: 'chiptune', name: 'Chiptune 8-bit', bpm: [132, 160], modes: ['ionian', 'aeolian', 'dorian'],
    progV: [[0, 5, 3, 4], [0, 3, 4, 0]], progC: [[3, 4, 2, 5], [5, 3, 4, 0]], progB: [[5, 6, 0, 0]],
    swing: 0, timbre: { kit: 'chip', bass: 'chip', guitar: 'chip', keys: 'chip', vocals: 'chip', room: 0.3 },
    drumV: { k: 'x.....x.x.......', s: BB, h: H8 }, drumC: { k: 'x...x.x.x...x.x.', s: BB, h: H16 },
    bass: 'chip', gtr: 'synthArp', keys: 'chipArp', mel: 0.65, voc: 69, stage: 'pixel',
  },
  orquestral: {
    id: 'orquestral', name: 'Orquestral Épico', bpm: [88, 118], modes: ['aeolian', 'harmonic', 'ionian'],
    progV: [[0, 5, 3, 4], [0, 6, 5, 4]], progC: [[5, 3, 0, 4], [3, 4, 5, 5]], progB: [[3, 4, 2, 5]],
    swing: 0, timbre: { kit: 'orch', bass: 'synth', guitar: 'strings', keys: 'brass', vocals: 'choir', room: 1 },
    drumV: { k: 'x.......x.......', s: '............x...', h: '' }, drumC: { k: 'x.....x.x.......', s: BB, h: 'r.......r.......' },
    bass: 'whole', gtr: 'ostinato', keys: 'pad', mel: 0.4, voc: 66, stage: 'castelo',
  },
  synthwave: {
    id: 'synthwave', name: 'Synthwave', bpm: [96, 118], modes: ['aeolian', 'dorian'],
    progV: [[0, 5, 3, 6], [0, 3, 5, 6]], progC: [[5, 6, 0, 0], [3, 6, 0, 5]], progB: [[3, 4, 5, 6]],
    swing: 0, timbre: { kit: '808', bass: 'synth', guitar: 'dist', keys: 'pad', vocals: 'vocal', drive: 0.5, room: 1 },
    drumV: { k: 'x.......x.......', s: BB, h: H8 }, drumC: { k: 'x...x...x...x...', s: BB, h: H16 },
    bass: 'octave', gtr: 'power', keys: 'pad', mel: 0.5, voc: 65, stage: 'neon',
  },
  groove: {
    id: 'groove', name: 'Groove Disco', bpm: [110, 122], modes: ['dorian', 'mixolydian'],
    progV: [[0, 3, 0, 3], [0, 0, 3, 4]], progC: [[1, 4, 0, 5], [3, 4, 0, 0]], progB: [[5, 4, 3, 4]],
    sevenths: true, swing: 0.04, timbre: { kit: 'rock', bass: 'finger', guitar: 'clean', keys: 'brass', vocals: 'vocal' },
    drumV: { k: 'x...x...x...x...', s: BB, h: 'x.o.x.o.x.o.x.o.' }, drumC: { k: 'x...x...x...x...', s: '....x..g....x...', h: 'xxoxxxoxxxoxxxox' },
    perc: { sh: 'xoxoxoxoxoxoxoxo' },
    bass: 'octave', gtr: 'funk', keys: 'stabs', mel: 0.6, voc: 66, stage: 'discoteca',
  },
};

/** palcos que o jogo deve conhecer (id → nome pt-BR + cores sugeridas) */
export const STAGES: Record<string, { name: string; sky: [string, string]; light: string }> = {
  garagem: { name: 'Garagem', sky: ['#1b1410', '#3a2a1e'], light: '#ffb347' },
  arena: { name: 'Arena Gigante', sky: ['#0a0a24', '#2a1050'], light: '#ff3cac' },
  praia: { name: 'Palco na Praia', sky: ['#ff9a6b', '#3cc8ff'], light: '#ffe14f' },
  espaco: { name: 'Estação Espacial', sky: ['#02020e', '#1a0a3a'], light: '#7dfcff' },
  'festa-junina': { name: 'Arraiá', sky: ['#120a24', '#3a1a0a'], light: '#ffb000' },
  neon: { name: 'Cidade Neon', sky: ['#08061a', '#2a0a3a'], light: '#2bffea' },
  floresta: { name: 'Clareira da Floresta', sky: ['#03190f', '#0f3a20'], light: '#6dff8a' },
  castelo: { name: 'Salão do Castelo', sky: ['#1a0a30', '#3a1a50'], light: '#ffe08a' },
  vulcao: { name: 'Cratera do Vulcão', sky: ['#1e0505', '#5a1005'], light: '#ff5a1f' },
  'fundo-do-mar': { name: 'Fundo do Mar', sky: ['#021a2e', '#04406a'], light: '#4fd6ff' },
  carnaval: { name: 'Avenida do Carnaval', sky: ['#1e0638', '#4a0a5a'], light: '#ffe14f' },
  pixel: { name: 'Fase Pixel', sky: ['#0a0a1e', '#1a1a4a'], light: '#4fff7a' },
  rodeio: { name: 'Rodeio', sky: ['#24140a', '#5a3010'], light: '#ffcf6b' },
  estudio: { name: 'Estúdio Aconchegante', sky: ['#1a1424', '#2e2440'], light: '#ffa6c9' },
  'palco-pop': { name: 'Palco Pop', sky: ['#14052e', '#3a0a5a'], light: '#ff5cc8' },
  baile: { name: 'Baile da Quadra', sky: ['#0e0a14', '#2a0a2a'], light: '#ff2bd6' },
  discoteca: { name: 'Discoteca', sky: ['#14061e', '#3a0a3a'], light: '#ffd84a' },
  gelo: { name: 'Palco de Gelo', sky: ['#06182a', '#1a4a6a'], light: '#bff3ff' },
  deserto: { name: 'Palco das Dunas', sky: ['#24180a', '#6a4010'], light: '#ffb347' },
  nuvens: { name: 'Palco nas Nuvens', sky: ['#4a7ab0', '#ffb6e6'], light: '#ffffff' },
};
