/* ============================================================
 *  ARRANJO (formato do Estúdio) → PARTITURA → CHARTS
 *  - Padrões de 16 passos (1 compasso) por instrumento.
 *  - Notas em graus da escala RELATIVOS ao acorde do compasso: nunca há nota errada.
 *  - Seções de 4 compassos (Verso/Refrão/Ponte) formam a música (máx. 2 min).
 *  - Código de compartilhamento compacto (BB1…).
 * ============================================================ */
import type { Difficulty, Instrument, Note, SongDef } from './model';
import { INSTRUMENTS, LANES, hash32, mulberry } from './model';

export const STEPS = 16;
export const ROWS = 8;
export const HOLD = 15;
export const MAX_SEC = 120;
/** bits da bateria */
export const DR_KICK = 1;
export const DR_SNARE = 2;
export const DR_HAT = 4;
export const DR_CLAP = 8;

export type PitchedKey = 'b' | 'g' | 'k' | 'v';
export const PART_KEY: Record<Exclude<Instrument, 'drums'>, PitchedKey> = { bass: 'b', guitar: 'g', keys: 'k', vocals: 'v' };

export interface Pattern {
  d: number[];
  b: number[];
  g: number[];
  k: number[];
  v: number[];
}

export interface Arrangement {
  v: 1;
  title: string;
  bpm: number;
  scale: number;
  root: number;
  prog: number;
  stage: number;
  pats: Pattern[];
  secs: number[];
}

export const SCALES: number[][] = [
  [0, 2, 4, 5, 7, 9, 11], // maior (alegre)
  [0, 2, 3, 5, 7, 8, 10], // menor (misteriosa)
  [0, 2, 4, 7, 9], // pentatônica maior
  [0, 3, 5, 7, 10], // pentatônica menor (blues)
];
/** progressões em graus (índices na escala de 7 notas; nas pentatônicas usa módulo) */
export const PROGS: number[][] = [
  [0, 4, 5, 3],
  [0, 3, 4, 3],
  [5, 3, 0, 4],
  [0, 5, 3, 4],
  [0, 5, 2, 6],
  [0, 0, 3, 4],
];
export const STAGE_IDS = ['garagem', 'arena', 'praia', 'espaco', 'junina', 'neon', 'floresta', 'castelo', 'vulcao', 'mar'];

export const emptyPattern = (): Pattern => ({ d: new Array(STEPS).fill(0), b: new Array(STEPS).fill(0), g: new Array(STEPS).fill(0), k: new Array(STEPS).fill(0), v: new Array(STEPS).fill(0) });

export function newArrangement(): Arrangement {
  const a: Pattern = emptyPattern();
  const b: Pattern = emptyPattern();
  for (let i = 0; i < 16; i++) {
    a.d[i] = (i % 8 === 0 ? DR_KICK : 0) | (i % 8 === 4 ? DR_SNARE : 0) | (i % 2 === 0 ? DR_HAT : 0);
    b.d[i] = (i % 4 === 0 ? DR_KICK : 0) | (i % 8 === 4 ? DR_SNARE | DR_CLAP : 0) | (i % 2 === 0 ? DR_HAT : 0);
  }
  a.b[0] = 1;
  a.b[6] = 1;
  a.b[8] = 5;
  a.b[12] = 1;
  b.b[0] = 1;
  b.b[4] = 1;
  b.b[8] = 5;
  b.b[12] = 3;
  return { v: 1, title: '', bpm: 110, scale: 0, root: 0, prog: 0, stage: 0, pats: [a, b, emptyPattern()], secs: [0, 1, 0, 1] };
}

export const maxSections = (bpm: number): number => Math.max(1, Math.floor((MAX_SEC * bpm) / 60 / 16));
export const arrDuration = (a: Arrangement): number => (a.secs.length * 16 * 60) / a.bpm;

/* ------------------------------ partitura ------------------------------ */

export interface SNote {
  b: number;
  len: number;
  p: number;
}
export interface Score {
  bpm: number;
  bars: number;
  parts: Record<Instrument, SNote[]>;
  /** acorde (3 midis) por compasso, para o "pad" de fundo */
  chords: number[][];
}

const BASE: Record<PitchedKey, number> = { b: 36, g: 52, k: 60, v: 64 };

export function degreeMidi(scale: number, root: number, base: number, deg: number): number {
  const sc = SCALES[scale] ?? SCALES[0];
  const n = sc.length;
  const o = Math.floor(deg / n);
  return base + root + sc[((deg % n) + n) % n] + 12 * o;
}

function chordRootDeg(a: Arrangement, bar: number): number {
  const sc = SCALES[a.scale] ?? SCALES[0];
  const deg = (PROGS[a.prog] ?? PROGS[0])[bar % 4];
  // nas pentatônicas, aproxima o grau da progressão (7 notas) para o índice da escala (5 notas)
  return sc.length === 7 ? deg : Math.round((deg * 5) / 7);
}

function partEmpty(a: Arrangement, k: PitchedKey): boolean {
  for (const p of a.pats) for (const v of p[k]) if (v) return false;
  return true;
}

/** padrões automáticos para partes vazias (a música nunca fica "oca") */
function autoCells(k: PitchedKey, patIdx: number, seed: number): number[] {
  const c = new Array(STEPS).fill(0);
  const r = mulberry(seed + patIdx * 97 + k.charCodeAt(0));
  if (k === 'b') {
    c[0] = 1;
    c[8] = 1;
    if (patIdx % 2) c[12] = 5;
  } else if (k === 'k') {
    c[4] = 3;
    c[5] = HOLD;
    c[12] = 5;
    c[13] = HOLD;
  } else if (k === 'g') {
    c[0] = 1;
    c[1] = HOLD;
    c[2] = HOLD;
    c[6] = 1;
    c[10] = 5;
  } else {
    let s = 0;
    while (s < 16) {
      c[s] = 1 + Math.floor(r() * 5);
      const l = r() < 0.4 ? 3 : 1;
      for (let q = 1; q <= l && s + q < 16; q++) c[s + q] = HOLD;
      s += r() < 0.5 ? 4 : 2;
    }
  }
  return c;
}

export function toScore(a: Arrangement): Score {
  const parts: Record<Instrument, SNote[]> = { drums: [], bass: [], guitar: [], keys: [], vocals: [] };
  const chords: number[][] = [];
  const seed = hash32(a.title || 'bloop');
  const autos: Record<PitchedKey, boolean> = { b: partEmpty(a, 'b'), g: partEmpty(a, 'g'), k: partEmpty(a, 'k'), v: partEmpty(a, 'v') };
  let bar = 0;
  for (const si of a.secs) {
    const pat = a.pats[si] ?? a.pats[0];
    for (let rep = 0; rep < 4; rep++, bar++) {
      const cr = chordRootDeg(a, bar);
      chords.push([degreeMidi(a.scale, a.root, 48, cr), degreeMidi(a.scale, a.root, 48, cr + 2), degreeMidi(a.scale, a.root, 48, cr + 4)]);
      const b0 = bar * 4;
      for (let s = 0; s < STEPS; s++) {
        const d = pat.d[s];
        if (d) for (let bit = 0; bit < 4; bit++) if (d & (1 << bit)) parts.drums.push({ b: b0 + s / 4, len: 0, p: bit });
      }
      for (const inst of ['bass', 'guitar', 'keys', 'vocals'] as const) {
        const k = PART_KEY[inst];
        const cells = autos[k] ? autoCells(k, si, seed) : pat[k];
        for (let s = 0; s < STEPS; s++) {
          const v = cells[s];
          if (!v || v === HOLD) continue;
          let l = 1;
          while (s + l < STEPS && cells[s + l] === HOLD) l++;
          const deg = (k === 'v' ? 0 : cr) + (v - 1);
          parts[inst].push({ b: b0 + s / 4, len: l / 4, p: degreeMidi(a.scale, a.root, BASE[k], deg) });
        }
      }
    }
  }
  return { bpm: a.bpm, bars: bar, parts, chords };
}

/* ------------------------------ charts ------------------------------ */

const DRUM_LANE: Record<Difficulty, number[]> = {
  facil: [0, 1, 2, 1], // kick, caixa, chimbal, palma
  medio: [0, 1, 2, 3],
  dificil: [0, 1, 3, 2],
  expert: [0, 1, 3, 2],
};

export function chartsFromScore(sc: Score): SongDef['charts'] {
  const out: SongDef['charts'] = {};
  for (const inst of INSTRUMENTS) {
    const part = sc.parts[inst];
    const per: Partial<Record<Difficulty, Note[]>> = {};
    for (const diff of ['facil', 'medio', 'dificil', 'expert'] as Difficulty[]) {
      const L = LANES[diff];
      const gap = diff === 'facil' ? 1 : diff === 'medio' ? 0.5 : diff === 'dificil' ? 0.25 : 0.24;
      const notes: Note[] = [];
      if (inst === 'drums') {
        let lastB = -9;
        const seen = new Set<string>();
        for (const n of part) {
          // fácil/médio: só tempos fortes do chimbal
          if (n.p === 2 && (diff === 'facil' || diff === 'medio') && (n.b * 2) % 1 !== 0) continue;
          if (n.p === 2 && diff === 'facil' && n.b % 1 !== 0) continue;
          let lane = DRUM_LANE[diff][n.p];
          if (diff === 'expert' && n.p === 3) lane = 4;
          const key = n.b + ':' + lane;
          if (seen.has(key)) continue;
          if (diff === 'facil' && n.b - lastB < gap && n.b !== lastB) continue;
          if (diff === 'facil' && n.b === lastB) continue;
          seen.add(key);
          notes.push({ b: n.b, lane });
          lastB = n.b;
        }
      } else {
        let lo = 999;
        let hi = -999;
        for (const n of part) {
          lo = Math.min(lo, n.p);
          hi = Math.max(hi, n.p);
        }
        const span = Math.max(1, hi - lo);
        let lastB = -9;
        let lastLane = -1;
        let lastP = -1;
        for (const n of part) {
          if (n.b - lastB < gap) continue;
          let lane = Math.round(((n.p - lo) / span) * (L - 1));
          // contorno melódico: se a nota mudou mas caiu na mesma lane, empurra 1 para o lado
          if (lastP >= 0 && n.p !== lastP && lane === lastLane && n.b - lastB < 1) lane = Math.max(0, Math.min(L - 1, lane + (n.p > lastP ? 1 : -1)));
          const len = n.len >= (diff === 'facil' ? 1 : 0.75) ? n.len : undefined;
          notes.push({ b: n.b, lane, len });
          lastB = n.b + (len && diff !== 'expert' ? Math.min(len, 1) * 0.5 : 0);
          lastLane = lane;
          lastP = n.p;
        }
      }
      per[diff] = notes;
    }
    out[inst] = per;
  }
  return out;
}

export function arrangementSong(a: Arrangement, id: string, tier: SongDef['tier'], band: string, style = 'criacao'): { song: SongDef; score: Score } {
  const score = toScore(a);
  const song: SongDef = {
    id,
    title: a.title || 'Minha música',
    band,
    style,
    bpm: a.bpm,
    bars: score.bars,
    durationSec: (score.bars * 4 * 60) / a.bpm,
    tier,
    stage: STAGE_IDS[a.stage] ?? 'garagem',
    charts: chartsFromScore(score),
  };
  return { song, score };
}

/* ------------------------------ código ------------------------------ */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** nibbles com RLE de zeros: 0,n → (n+1) zeros */
function packNibbles(src: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < src.length; ) {
    if (src[i] === 0) {
      let n = 1;
      while (i + n < src.length && src[i + n] === 0 && n < 16) n++;
      out.push(0, n - 1);
      i += n;
    } else out.push(src[i++] & 15);
  }
  return out;
}

export function encodeArrangement(a: Arrangement): string {
  const nib: number[] = [];
  for (const p of a.pats) for (const k of ['d', 'b', 'g', 'k', 'v'] as const) for (const v of p[k]) nib.push(v);
  const packed = packNibbles(nib);
  const bytes: number[] = [1, a.bpm & 255, ((a.scale & 3) << 6) | ((a.prog & 7) << 3) | (a.stage >> 1 & 7), ((a.stage & 1) << 7) | (a.root & 15), a.pats.length, a.secs.length];
  let sb = 0;
  a.secs.forEach((s, i) => {
    sb |= (s & 3) << ((i % 4) * 2);
    if (i % 4 === 3 || i === a.secs.length - 1) {
      bytes.push(sb);
      sb = 0;
    }
  });
  const title = new TextEncoder().encode(a.title.slice(0, 24));
  bytes.push(title.length, ...title);
  for (let i = 0; i < packed.length; i += 2) bytes.push((packed[i] << 4) | (packed[i + 1] ?? 0));
  // base64url
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '') + (i + 2 < bytes.length ? B64[n & 63] : '');
  }
  return 'BB1' + s;
}

export function decodeArrangement(code: string): Arrangement | null {
  try {
    code = code.trim().replace(/\s+/g, '');
    if (!code.startsWith('BB1')) return null;
    const s = code.slice(3);
    const bytes: number[] = [];
    for (let i = 0; i < s.length; i += 4) {
      const c = [0, 1, 2, 3].map((q) => (i + q < s.length ? B64.indexOf(s[i + q]) : -1));
      if (c[0] < 0 || c[1] < 0) return null;
      const n = (c[0] << 18) | (c[1] << 12) | (Math.max(0, c[2]) << 6) | Math.max(0, c[3]);
      bytes.push((n >> 16) & 255);
      if (c[2] >= 0) bytes.push((n >> 8) & 255);
      if (c[3] >= 0) bytes.push(n & 255);
    }
    let p = 0;
    if (bytes[p++] !== 1) return null;
    const bpm = bytes[p++];
    const b2 = bytes[p++];
    const b3 = bytes[p++];
    const np = bytes[p++];
    const ns = bytes[p++];
    if (np < 1 || np > 3 || ns < 1 || ns > 64 || bpm < 60 || bpm > 200) return null;
    const secs: number[] = [];
    for (let i = 0; i < ns; i += 4) {
      const sb = bytes[p++];
      for (let q = 0; q < 4 && i + q < ns; q++) secs.push(Math.min(np - 1, (sb >> (q * 2)) & 3));
    }
    const tl = bytes[p++];
    const title = new TextDecoder().decode(new Uint8Array(bytes.slice(p, p + tl)));
    p += tl;
    const packed: number[] = [];
    for (; p < bytes.length; p++) packed.push(bytes[p] >> 4, bytes[p] & 15);
    const need = np * 5 * STEPS;
    const nib: number[] = [];
    for (let i = 0; i < packed.length && nib.length < need; ) {
      if (packed[i] === 0) {
        for (let q = 0; q <= packed[i + 1] && nib.length < need; q++) nib.push(0);
        i += 2;
      } else nib.push(packed[i++]);
    }
    while (nib.length < need) nib.push(0);
    const pats: Pattern[] = [];
    let q = 0;
    for (let i = 0; i < np; i++) {
      const pt = emptyPattern();
      for (const k of ['d', 'b', 'g', 'k', 'v'] as const)
        for (let st = 0; st < STEPS; st++) {
          const v = nib[q++];
          pt[k][st] = k === 'd' ? v & 15 : v > ROWS && v !== HOLD ? 0 : v;
        }
      pats.push(pt);
    }
    while (pats.length < 3) pats.push(emptyPattern());
    const stage = (((b2 & 7) << 1) | (b3 >> 7)) % STAGE_IDS.length;
    return { v: 1, title: title.slice(0, 24), bpm, scale: (b2 >> 6) & 3, prog: Math.min(PROGS.length - 1, (b2 >> 3) & 7), stage, root: (b3 & 15) % 12, pats, secs: secs.slice(0, maxSections(bpm)) };
  } catch {
    return null;
  }
}

/* ------------------------------ músicas demo ------------------------------ */

function pat(d: string, b: string, g: string, k: string, v: string): Pattern {
  // strings de 16 chars: bateria em hex (bitmask); demais: '.'=pausa, '1'-'8'=grau, '-'=segura
  const cell = (c: string): number => (c === '.' ? 0 : c === '-' ? HOLD : parseInt(c, 16));
  return { d: [...d].map((c) => (c === '.' ? 0 : parseInt(c, 16))), b: [...b].map(cell), g: [...g].map(cell), k: [...k].map(cell), v: [...v].map(cell) };
}

/** Duas músicas originais embutidas (para testar sem o catálogo). */
export const DEMO_ARRS: { id: string; band: string; style: string; arr: Arrangement }[] = [
  {
    id: 'demo-pulo',
    band: 'Os Bloopinhos',
    style: 'pop',
    arr: {
      v: 1,
      title: 'Pulo do Bloop',
      bpm: 112,
      scale: 0,
      root: 2,
      prog: 0,
      stage: 0,
      pats: [
        pat('5.4.6.4.5.4.6.44', '1..1..5.1..1.3.', '1--.1--.5---3---', '..3-..3-..5-..3-', '1-3-5---3-2-1---'),
        pat('5.4.E.4.5.4.E.4E', '1.1.5.5.3.3.5.5.', '1-1-5-5-3-3-5-5-', '3---5---3---5---', '5-6-5-3-2---1---'),
        pat('1...2...1...2...', '1-------5-------', '1---------------', '1---3---5---3---', '3-------5-------'),
      ],
      secs: [2, 0, 0, 1, 0, 1, 1],
    },
  },
  {
    id: 'demo-neon',
    band: 'Nuvem Elétrica',
    style: 'eletronica',
    arr: {
      v: 1,
      title: 'Nuvem de Neon',
      bpm: 124,
      scale: 1,
      root: 9,
      prog: 4,
      stage: 5,
      pats: [
        pat('5.4.5.4.5.4.5.4.', '1.1.1.1.1.1.1.1.', '..5...5...5...5.', '1-3-5-3-1-3-5-3-', '5---4---3---2---'),
        pat('5.4.D.4.5.4.D.4D', '1.8.1.8.1.8.1.8.', '1-5-8-5-1-5-8-5-', '5-5-3-3-5-5-6-6-', '5-5-6---5-3-1---'),
        pat('1.......1.......', '1---------------', '................', '1-------3-------', '................'),
      ],
      secs: [2, 0, 0, 1, 1, 0, 1, 1],
    },
  },
];
