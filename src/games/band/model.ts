/* Tipos e constantes da Bloop Banda (sem DOM). */
import type { Difficulty, Instrument, Note, SongDef } from '../../music/api';
import { t } from '../../i18n';

export type { Difficulty, Instrument, Note, SongDef };

export const INSTRUMENTS: Instrument[] = ['drums', 'bass', 'guitar', 'keys', 'vocals'];
export const DIFFS: Difficulty[] = ['facil', 'medio', 'dificil', 'expert'];
export const LANES: Record<Difficulty, number> = { facil: 3, medio: 4, dificil: 5, expert: 5 };

export const instName = (i: Instrument): string =>
  i === 'drums' ? t('band.inst.drums', 'Bateria') : i === 'bass' ? t('band.inst.bass', 'Baixo') : i === 'guitar' ? t('band.inst.guitar', 'Guitarra') : i === 'keys' ? t('band.inst.keys', 'Teclado') : t('band.inst.vocals', 'Vocal');
export const diffName = (d: Difficulty): string =>
  d === 'facil' ? t('band.diff.facil', 'Fácil') : d === 'medio' ? t('band.diff.medio', 'Médio') : d === 'dificil' ? t('band.diff.dificil', 'Difícil') : t('band.diff.expert', 'Expert');

/** Janelas de acerto (segundos, para cada lado). */
export const WIN_PERFECT = 0.05;
export const WIN_GREAT = 0.095;
export const WIN_GOOD = 0.14;

/** Janelas por dificuldade: fácil perdoa bem o dedo, médio meio-termo, difícil/expert precisos. */
export const WINDOWS: Record<Difficulty, { perfect: number; great: number; good: number }> = {
  facil: { perfect: 0.085, great: 0.15, good: 0.22 },
  medio: { perfect: 0.065, great: 0.115, good: 0.17 },
  dificil: { perfect: 0.05, great: 0.09, good: 0.13 },
  expert: { perfect: 0.04, great: 0.075, good: 0.11 },
};

export const J_PERFECT = 0;
export const J_GREAT = 1;
export const J_GOOD = 2;
export const J_MISS = 3;
export const J_NONE = -1;
export const J_POINTS = [100, 70, 40, 0];

export interface RNote {
  t: number; // s
  end: number; // s (== t se curta)
  lane: number;
  /** índice da frase */
  ph: number;
  /** frase-estrela */
  star: boolean;
  j: number; // J_*
  /** segurando agora */
  hold: boolean;
  /** fim do sustain já pontuado até (s) */
  sus: number;
  /** pitch relativo (vocal) para desenhar a linha melódica */
  dt: number;
}

export interface Phrase {
  first: number;
  last: number;
  star: boolean;
  failed: boolean;
  perfect: boolean;
}

export const STYLE_NAMES: Record<string, string> = {
  'rock-arena': 'Rock',
  rock: 'Rock',
  metal: 'Metal',
  pop: 'Pop',
  funk: 'Funk',
  eletronica: 'Eletrônica',
  samba: 'Samba',
  forro: 'Forró',
  reggae: 'Reggae',
  jazz: 'Jazz',
  lofi: 'Lo-fi',
  punk: 'Punk',
  sertanejo: 'Sertanejo',
  criacao: 'Criação',
};
let extStyle: ((s: string) => string | null) | null = null;
let extTitle: ((s: SongDef) => string | null) | null = null;
export function setNameHelpers(style: (s: string) => string | null, title: (s: SongDef) => string | null): void {
  extStyle = style;
  extTitle = title;
}
export const styleName = (s: string): string => (STYLE_NAMES[s] ? t('band.style.' + s, STYLE_NAMES[s]) : extStyle?.(s) ?? t('band.style.' + s, s.charAt(0).toUpperCase() + s.slice(1)));

/** Converte a chart (batidas) em notas de jogo (segundos) + frases. */
export function buildNotes(chart: Note[], bpm: number, lanes: number): { notes: RNote[]; phrases: Phrase[] } {
  const spb = 60 / bpm;
  const sorted = chart.slice().sort((a, b) => a.b - b.b || a.lane - b.lane);
  const notes: RNote[] = [];
  for (const n of sorted) {
    const lane = Math.max(0, Math.min(lanes - 1, n.lane | 0));
    const tt = n.b * spb;
    const len = n.len && n.len >= 0.5 ? n.len * spb : 0;
    notes.push({ t: tt, end: tt + len, lane, ph: 0, star: false, j: J_NONE, hold: false, sus: tt, dt: lane / Math.max(1, lanes - 1) });
  }
  // frases: grupos de ~8 notas (acordes contam juntos); 1 a cada 3 frases é "estrela"
  const phrases: Phrase[] = [];
  let i = 0;
  let k = 0;
  while (i < notes.length) {
    let cnt = 0;
    let j = i;
    while (j < notes.length && cnt < 8) {
      const t0 = notes[j].t;
      while (j < notes.length && Math.abs(notes[j].t - t0) < 0.001) j++;
      cnt++;
    }
    const star = k % 3 === 1;
    for (let q = i; q < j; q++) {
      notes[q].ph = k;
      notes[q].star = star;
    }
    phrases.push({ first: i, last: j - 1, star, failed: false, perfect: true });
    i = j;
    k++;
  }
  return { notes, phrases };
}

/** Estrelas (0..5) pela precisão ponderada. */
export function starsFor(acc: number): number {
  return acc >= 0.95 ? 5 : acc >= 0.85 ? 4 : acc >= 0.7 ? 3 : acc >= 0.5 ? 2 : acc >= 0.25 ? 1 : 0;
}

export function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Chart de um instrumento/dificuldade. Se faltar, deriva de outra dificuldade
 * (remapeando lanes) ou de outro instrumento.
 */
export function chartFor(song: SongDef, inst: Instrument, diff: Difficulty): Note[] {
  const L = LANES[diff];
  const own = song.charts[inst];
  const exact = own?.[diff];
  if (exact && exact.length) return exact;
  const order: Difficulty[] = diff === 'facil' ? ['medio', 'dificil', 'expert'] : diff === 'medio' ? ['dificil', 'facil', 'expert'] : diff === 'dificil' ? ['expert', 'medio', 'facil'] : ['dificil', 'medio', 'facil'];
  const pick = (c?: Partial<Record<Difficulty, Note[]>>): { n: Note[]; d: Difficulty } | null => {
    if (!c) return null;
    for (const d of order) if (c[d]?.length) return { n: c[d]!, d };
    return null;
  };
  let src = pick(own);
  if (!src) for (const i of INSTRUMENTS) if (!src && i !== inst) src = pick(song.charts[i]);
  if (!src) return [];
  const sL = LANES[src.d];
  const gap = diff === 'facil' ? 0.95 : diff === 'medio' ? 0.45 : 0.2;
  const out: Note[] = [];
  let last = -9;
  for (const n of src.n) {
    if (n.b - last < gap && LANES[src.d] >= L && n.b !== last) continue;
    if (n.b === last && diff === 'facil') continue;
    const lane = sL === L ? n.lane : Math.round((n.lane / Math.max(1, sL - 1)) * (L - 1));
    out.push({ b: n.b, lane, len: n.len });
    last = n.b;
  }
  return out;
}

export function songTitle(s: SongDef): string {
  return s.tier === 'creator' ? s.title : extTitle?.(s) ?? t('song.' + s.id, s.title);
}
