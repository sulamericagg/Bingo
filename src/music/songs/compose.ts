/* ============================================================
 *  COMPOSITOR procedural do Bloop Banda.
 *  Estrutura (intro/verso/pré/refrão/ponte/solo/break/final),
 *  progressões por estilo, melodia com motivo (pergunta/resposta),
 *  bateria por estilo com viradas, baixo seguindo acordes, guitarras
 *  (riffs, levadas, SOLOS pentatônicos/modais com bends), teclados.
 *  Tudo determinístico a partir da semente do id da música.
 * ============================================================ */
import { MODES, STYLES, isMinor, type ModeId, type StyleDef, type StyleId } from './styles';
import type { DEv, DrumPiece, PEv, Timbre } from './synth';

export interface MegaTune {
  /** modulação (semitons) no(s) refrão(ões) final(is) */
  keyUp: number;
  soloBars: number;
  flavor: 'shred' | 'melodic' | 'blues' | 'neo';
  doubleKick?: boolean;
  progV?: number[];
  progC?: number[];
  /** semente fixa do gancho do refrão (afinado à mão) */
  hook?: number;
  intro?: 'riff' | 'build';
  drive?: number;
}

export interface SongSpec {
  id: string;
  seed: number;
  style: StyleId;
  bpm: number;
  key: number; // classe de altura da tônica 0..11
  mode: ModeId;
  easy?: boolean;
  mega?: MegaTune;
}

export type SecKind = 'count' | 'intro' | 'verse' | 'pre' | 'chorus' | 'bridge' | 'solo' | 'break' | 'outro';
export interface Section {
  kind: SecKind;
  bar: number;
  bars: number;
  /** transposição (modulação) em semitons */
  tr: number;
}

export interface Arrangement {
  bpm: number;
  bars: number;
  beats: number;
  /** swing (fração de batida) aplicado na reprodução e nos charts */
  swing: number;
  sections: Section[];
  timbre: Timbre;
  drums: DEv[];
  perc: DEv[];
  bass: PEv[];
  guitar: PEv[];
  keys: PEv[];
  vocals: PEv[];
  /** camadas extras (sem chart): harmonia de voz, pad de reforço */
  extra: { tr: 'keys' | 'vocals'; e: PEv }[];
}

/* ---------------------------- util ---------------------------- */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
type R = () => number;
const pick = <T>(r: R, a: readonly T[]): T => a[Math.floor(r() * a.length) % a.length];
function wpick<T>(r: R, opts: [T, number][]): T {
  let s = 0;
  for (const o of opts) s += o[1];
  let x = r() * s;
  for (const o of opts) if ((x -= o[1]) <= 0) return o[0];
  return opts[opts.length - 1][0];
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const mod = (a: number, n: number) => ((a % n) + n) % n;

/* ---------------------------- estrutura ---------------------------- */
export function planSections(spec: SongSpec): Section[] {
  const spb = 60 / spec.bpm;
  const secs = (list: [SecKind, number, number?][]): Section[] => {
    let bar = 0;
    return list.map(([kind, bars, tr]) => {
      const s = { kind, bar, bars, tr: tr ?? 0 };
      bar += bars;
      return s;
    });
  };
  const dur = (l: [SecKind, number, number?][]) => l.reduce((a, s) => a + s[1], 0) * 4 * spb;
  if (spec.mega) {
    const m = spec.mega;
    const up = m.keyUp;
    let l: [SecKind, number, number?][] = [
      ['count', 1], ['intro', 8], ['verse', 8], ['pre', 4], ['chorus', 8], ['verse', 8], ['pre', 4], ['chorus', 8],
      ['bridge', 8], ['solo', m.soloBars], ['break', 4], ['chorus', 8, up], ['chorus', 8, up], ['outro', 4, up],
    ];
    const trims: (() => void)[] = [
      () => (l = l.filter((_s, i) => !(i === 5 || i === 6))), // 2º verso + pré
      () => (l = l.filter((s) => s[0] !== 'bridge')),
      () => (l = l.map((s) => (s[0] === 'intro' ? ['intro', 4] : s))),
      () => (l = l.map((s) => (s[0] === 'solo' ? ['solo', Math.min(8, s[1])] : s))),
    ];
    trims.push(
      () => (l = l.filter((s) => s[0] !== 'break')),
      () => {
        const i = l.findIndex((s) => s[0] === 'chorus' && s[2]);
        if (i >= 0) l.splice(i, 1);
      },
    );
    for (const tf of trims) if (dur(l) > 172) tf();
    // andamentos muito rápidos: estende (duelo de solo, 3º verso, refrão extra)
    const grow: (() => void)[] = [
      () => (l = l.map((s) => (s[0] === 'solo' ? ['solo', 16] : s))),
      () => l.splice(l.findIndex((s) => s[0] === 'bridge'), 0, ['verse', 8], ['pre', 4]),
      () => l.splice(l.length - 1, 0, ['chorus', 8, up]),
    ];
    for (const g of grow) if (dur(l) < 140) g();
    return secs(l);
  }
  if (spec.easy) return secs([['count', 1], ['intro', 4], ['verse', 8], ['chorus', 8], ['verse', 8], ['chorus', 8], ['outro', 4]]);
  let l: [SecKind, number, number?][] = [
    ['count', 1], ['intro', 4], ['verse', 8], ['chorus', 8], ['verse', 8], ['chorus', 8], ['solo', 8], ['chorus', 8], ['outro', 4],
  ];
  if (dur(l) > 150) l = l.filter((_s, i) => i !== 4);
  if (dur(l) > 150) l = l.map((s) => (s[0] === 'solo' ? ['bridge', 4] : s));
  if (dur(l) < 95) {
    l = [
      ['count', 1], ['intro', 4], ['verse', 8], ['pre', 4], ['chorus', 8], ['verse', 8], ['pre', 4], ['chorus', 8], ['solo', 8],
      ['bridge', 4], ['chorus', 8], ['chorus', 8], ['outro', 4],
    ];
  }
  return secs(l);
}

/* ---------------------------- harmonia ---------------------------- */
interface Chord {
  deg: number;
  pcs: number[]; // classes de altura (tríade ou tétrade)
  root: number;
}
class Key {
  constructor(
    readonly tonic: number,
    readonly mode: number[],
  ) {}
  pc(deg: number): number {
    return mod(this.tonic + this.mode[mod(deg, 7)], 12);
  }
  /** grau → MIDI relativo a uma base (tônica em `base`) */
  midi(deg: number, base: number): number {
    return base + 12 * Math.floor(deg / 7) + this.mode[mod(deg, 7)];
  }
  chord(deg: number, seventh: boolean): Chord {
    const pcs = [this.pc(deg), this.pc(deg + 2), this.pc(deg + 4)];
    if (seventh) pcs.push(this.pc(deg + 6));
    return { deg: mod(deg, 7), pcs, root: pcs[0] };
  }
}
/** MIDI da classe pc dentro de [lo, lo+12) */
const inRange = (pc: number, lo: number) => lo + mod(pc - lo, 12);

/** voicing próximo do anterior (condução de vozes) */
function voice(ch: Chord, center: number, n = 3): number[] {
  const pcs = ch.pcs.slice(0, n);
  let best: number[] = [];
  let bestD = 1e9;
  for (let inv = 0; inv < pcs.length; inv++) {
    const order = pcs.slice(inv).concat(pcs.slice(0, inv));
    const out: number[] = [];
    let prev = inRange(order[0], center - 7);
    out.push(prev);
    for (let i = 1; i < order.length; i++) {
      prev = prev + mod(order[i] - prev, 12) || prev + 12;
      out.push(prev);
    }
    const avg = out.reduce((a, b) => a + b, 0) / out.length;
    const d = Math.abs(avg - center);
    if (d < bestD) {
      bestD = d;
      best = out;
    }
  }
  return best;
}

/* ============================================================ */
interface Ctx {
  spec: SongSpec;
  st: StyleDef;
  key: Key;
  r: R;
  a: Arrangement;
  chordsOf: Map<Section, Chord[]>;
  melCache: Map<string, PEv[]>;
  riff: PEv[] | null;
  stabMask: string;
  minor: boolean;
}

export function compose(spec: SongSpec): Arrangement {
  const st = STYLES[spec.style];
  const r = rng(spec.seed);
  const sections = planSections(spec);
  const bars = sections.reduce((a, s) => a + s.bars, 0);
  const timbre: Timbre = { ...st.timbre };
  if (spec.mega?.drive !== undefined) timbre.drive = spec.mega.drive;
  const a: Arrangement = { bpm: spec.bpm, swing: 0, bars, beats: bars * 4, sections, timbre, drums: [], perc: [], bass: [], guitar: [], keys: [], vocals: [], extra: [] };
  const key = new Key(spec.key, MODES[spec.mode]);
  const c: Ctx = {
    spec, st, key, r, a, chordsOf: new Map(), melCache: new Map(), riff: null,
    stabMask: pick(r, ['x.xx.x.xx.x.x.xx', 'x..x.xx.x.x.x.x.', 'x.x.x.xx.x.xx.x.', 'xx.x.x.xx.x.x.x.']),
    minor: isMinor(spec.mode),
  };
  const seventh = !!st.sevenths;
  const pv = spec.mega?.progV ?? pick(r, st.progV);
  const pcProg = spec.mega?.progC ?? pick(r, st.progC);
  const pb = pick(r, st.progB);
  const preP = [pb[0], pb[1], pb[2] ?? 4, 4];
  for (const s of sections) {
    const prog = s.kind === 'chorus' || s.kind === 'outro' || s.kind === 'solo' ? pcProg : s.kind === 'bridge' ? pb : s.kind === 'pre' ? preP : s.kind === 'break' ? [pv[0], pv[0], pv[1], pv[1]] : pv;
    const chs: Chord[] = [];
    for (let i = 0; i < s.bars; i++) chs.push(key.chord(prog[i % prog.length], seventh));
    if (s.kind === 'outro') chs[s.bars - 1] = key.chord(0, seventh);
    c.chordsOf.set(s, chs);
  }

  sections.forEach((s, si) => {
    const next = sections[si + 1];
    if (s.kind === 'count') {
      for (let i = 0; i < 4; i++) a.drums.push({ b: s.bar * 4 + i, p: 'st', v: i === 0 ? 0.9 : 0.7 });
      return;
    }
    drums(c, s, next);
    bass(c, s);
    if (s.kind === 'solo') solo(c, s);
    else guitar(c, s);
    keys(c, s);
    vocals(c, s);
  });

  // final: acorde segurado + prato
  const end = bars * 4;
  a.drums.push({ b: end, p: 'c', v: 1 }, { b: end, p: 'k', v: 1 });
  const last = sections[sections.length - 1];
  const fin = key.chord(0, seventh);
  a.bass.push({ b: end, d: 3, m: [inRange(fin.root + last.tr, 28)], v: 0.9 });
  a.keys.push({ b: end, d: 3, m: voice(fin, 64 + last.tr), v: 0.8 });
  const gfin = st.timbre.guitar === 'dist' ? powerChord(fin.root + last.tr) : voice(fin, 60 + last.tr);
  a.guitar.push({ b: end, d: 3, m: gfin, v: 0.9 });
  a.beats = end + 4;

  a.swing = st.swing;
  for (const list of [a.drums, a.perc, a.bass, a.guitar, a.keys, a.vocals]) (list as { b: number }[]).sort((x, y) => x.b - y.b);
  return a;
}

const powerChord = (pc: number) => {
  const r = inRange(pc, 40);
  return [r, r + 7, r + 12];
};

/* ============================ BATERIA ============================ */
function line(str: string, step: number): string {
  return str.length ? str[step % str.length] : '.';
}

function drums(c: Ctx, s: Section, next: Section | undefined): void {
  const { st, a, spec } = c;
  const mega = !!spec.mega;
  const push = (b: number, p: DrumPiece, v: number) => a.drums.push({ b, p, v });
  const pushP = (b: number, p: DrumPiece, v: number) => a.perc.push({ b, p, v });
  for (let i = 0; i < s.bars; i++) {
    const b0 = (s.bar + i) * 4;
    const lastBar = i === s.bars - 1;
    const fillLen = !lastBar || !next || next.kind === 'count' ? 0 : mega && (next.kind === 'chorus' || next.kind === 'solo') ? (next.tr !== s.tr || s.kind === 'solo' ? 16 : 8) : spec.easy ? 4 : 4 + (c.r() < 0.4 ? 4 : 0);
    let pat = s.kind === 'chorus' || s.kind === 'solo' || s.kind === 'outro' ? st.drumC : st.drumV;
    let half = false;
    if (s.kind === 'bridge' || s.kind === 'break') half = true;
    if (s.kind === 'intro' && (spec.mega?.intro === 'build' || spec.easy) && i < s.bars / 2) pat = { k: 'x.......x.......', s: '', h: 'x...x...x...x...' };
    if (s.kind === 'outro' && lastBar) {
      push(b0, 'c', 1);
      push(b0, 'k', 1);
      for (let j = 0; j < 8; j++) push(b0 + 2 + j * 0.25, j % 2 ? 't2' : 's', 0.5 + j * 0.06);
      continue;
    }
    if (i === 0 && s.kind !== 'intro' && s.kind !== 'verse') push(b0, 'c', 0.95);
    if (i === 0 && s.kind === 'verse') push(b0, 'c', 0.7);
    if (i % 4 === 0 && i > 0 && (s.kind === 'chorus' || s.kind === 'solo')) push(b0, 'c', 0.75);
    for (let k = 0; k < 16; k++) {
      if (fillLen && k >= 16 - fillLen) break;
      const b = b0 + k / 4;
      let kc = line(pat.k, k);
      let sc = line(pat.s, k);
      let hc = line(pat.h, k);
      if (half) {
        kc = k === 0 || (k === 10 && c.r() < 0.5) ? 'x' : '.';
        sc = k === 8 ? 'x' : '.';
        hc = s.kind === 'break' ? (k % 4 === 0 ? 'x' : '.') : k % 2 === 0 ? 'x' : '.';
        if (s.kind === 'break' && spec.mega?.doubleKick && k % 2 === 1) kc = 'x';
      }
      if (spec.mega?.doubleKick && s.kind === 'chorus' && k % 2 === 1) kc = 'x';
      if (spec.easy && k % 2 === 1) {
        kc = '.';
        hc = '.';
      }
      if (kc === 'x') push(b, 'k', k % 4 === 0 ? 1 : 0.85);
      if (sc === 'x') push(b, 's', k % 8 === 4 ? 0.95 : 0.85);
      else if (sc === 'c') push(b, 'cl', 0.9);
      else if (sc === 'r') push(b, 'rim', 0.85);
      else if (sc === 'g') push(b, 'g', 0.6);
      if (hc === 'x') push(b, 'h', k % 4 === 0 ? 0.9 : k % 2 === 0 ? 0.7 : 0.5);
      else if (hc === 'o') push(b, 'ho', 0.75);
      else if (hc === 'r') push(b, 'r', k % 4 === 0 ? 0.9 : 0.7);
      // pré-refrão: caixa em colcheias crescendo no último compasso
      if (s.kind === 'pre' && lastBar && k % 2 === 0 && sc !== 'x') push(b, 's', 0.45 + k * 0.03);
    }
    if (fillLen) fill(c, b0 + (16 - fillLen) / 4, fillLen);
    // percussão brasileira etc.
    if (st.perc && s.kind !== 'break' && !(s.kind === 'intro' && i < 2)) {
      for (let k = 0; k < 16; k++) {
        const b = b0 + k / 4;
        const P = st.perc;
        const su = line(P.su ?? '', k);
        if (su === 'X') pushP(b, 'su', 1);
        else if (su === 'o') pushP(b, 'su', 0.5);
        if (line(P.tb ?? '', k) === 'x' && s.kind !== 'verse') pushP(b, 'tb', k % 4 === 0 ? 0.9 : 0.65);
        const ag = line(P.ag ?? '', k);
        if (ag === '1') pushP(b, 'ag1', 0.8);
        else if (ag === '2') pushP(b, 'ag2', 0.8);
        const sh = line(P.sh ?? '', k);
        if (sh === 'x') pushP(b, 'sh', 0.9);
        else if (sh === 'o') pushP(b, 'sh', 0.5);
        if (line(P.cb ?? '', k) === 'x') pushP(b, 'cb', 0.8);
        const tr = line(P.tri ?? '', k);
        if (tr === 'x') pushP(b, 'tri', 0.9);
        else if (tr === 'o') pushP(b, 'trio', 0.8);
      }
    }
  }
}

/** virada: semicolcheias descendo pelos tons, com acentos */
function fill(c: Ctx, b: number, steps: number): void {
  const big = steps >= 8;
  const toms: DrumPiece[] = ['s', 't1', 't2', 't3'];
  const kind = Math.floor(c.r() * 3);
  for (let k = 0; k < steps; k++) {
    const pr = k / steps;
    let p: DrumPiece;
    if (kind === 0) p = toms[Math.min(3, Math.floor(pr * 4))];
    else if (kind === 1) p = k % 2 === 0 ? 's' : toms[1 + Math.floor(pr * 3)];
    else p = pr < 0.5 ? 's' : toms[1 + Math.floor((pr - 0.5) * 6)];
    if (c.spec.easy && k % 2 === 1) continue;
    if (!big && k % 4 === 3 && c.r() < 0.3) continue;
    c.a.drums.push({ b: b + k / 4, p, v: 0.6 + 0.4 * pr });
    if (k % 4 === 0) c.a.drums.push({ b: b + k / 4, p: 'k', v: 0.8 });
  }
}

/* ============================ BAIXO ============================ */
type BN = 'R' | 'O' | '5' | '5-' | '3' | 'A';
const BASS: Record<string, [number, number, BN][]> = {
  root8: [[0, 2, 'R'], [2, 2, 'R'], [4, 2, 'R'], [6, 2, 'R'], [8, 2, 'R'], [10, 2, 'R'], [12, 2, 'R'], [14, 2, 'A']],
  root16: Array.from({ length: 16 }, (_, k) => [k, 1, k === 15 ? 'A' : 'R'] as [number, number, BN]),
  pop: [[0, 3, 'R'], [3, 3, 'R'], [6, 2, 'O'], [8, 3, 'R'], [11, 3, '5'], [14, 2, 'A']],
  sub: [[0, 6, 'R'], [6, 4, 'R'], [10, 6, '5']],
  baiao: [[0, 3, 'R'], [3, 1, 'R'], [4, 4, '5'], [8, 3, 'R'], [11, 1, 'R'], [12, 4, '5-']],
  samba: [[0, 2, 'R'], [3, 1, 'R'], [4, 4, '5-'], [8, 2, 'R'], [11, 1, '3'], [12, 3, '5-'], [15, 1, 'A']],
  reggae: [[0, 3, 'R'], [4, 2, 'R'], [6, 2, '5'], [8, 4, 'O'], [13, 1, '5'], [14, 2, 'A']],
  offbeat: [[2, 2, 'R'], [6, 2, 'R'], [10, 2, 'R'], [14, 2, 'R']],
  octave: [[0, 2, 'R'], [2, 2, 'O'], [4, 2, 'R'], [6, 2, 'O'], [8, 2, 'R'], [10, 2, 'O'], [12, 2, 'R'], [14, 2, 'O']],
  chip: [[0, 2, 'R'], [2, 2, 'O'], [4, 2, '5'], [6, 2, 'O'], [8, 2, 'R'], [10, 2, 'O'], [12, 2, '5'], [14, 2, 'A']],
  lofi: [[0, 6, 'R'], [7, 1, '5'], [8, 5, 'R'], [14, 2, 'A']],
  axe: [[0, 3, 'R'], [3, 1, 'R'], [6, 2, '5'], [8, 3, 'R'], [11, 1, 'R'], [12, 2, '5'], [14, 2, 'O']],
  whole: [[0, 8, 'R'], [8, 8, '5-']],
  intro: [[0, 8, 'R'], [8, 6, 'R'], [14, 2, 'A']],
  easy: [[0, 4, 'R'], [4, 4, 'R'], [8, 4, '5'], [12, 4, 'R']],
};

function bass(c: Ctx, s: Section): void {
  const { st, a, spec } = c;
  const chs = c.chordsOf.get(s)!;
  const lo = st.timbre.bass === 'chip' ? 40 : 28;
  for (let i = 0; i < s.bars; i++) {
    const ch = chs[i];
    const nx = chs[i + 1] ?? ch;
    let pat = BASS[st.bass];
    if (s.kind === 'break' || (s.kind === 'intro' && i < s.bars / 2) || s.kind === 'bridge') pat = BASS.intro;
    if (spec.easy) pat = BASS.easy;
    if (st.bass === 'root16' && s.kind === 'verse') pat = BASS.root8;
    if (s.kind === 'outro' && i === s.bars - 1) pat = [[0, 14, 'R']];
    const root = inRange(ch.root + s.tr, lo);
    const nroot = inRange(nx.root + s.tr, lo);
    for (const [k, len, n] of pat) {
      let m = root;
      if (n === 'O') m = root + 12;
      else if (n === '5') m = root + 7;
      else if (n === '5-') m = root - 5;
      else if (n === '3') m = inRange(ch.pcs[1] + s.tr, root);
      else if (n === 'A') m = nroot !== root ? (c.r() < 0.5 ? nroot - 1 : nroot + 2) : root + (c.r() < 0.5 ? 7 : 12);
      if (m < lo - 4) m += 12;
      a.bass.push({ b: (s.bar + i) * 4 + k / 4, d: len / 4, m: [m], v: k % 4 === 0 ? 0.95 : 0.8 });
    }
  }
}

/* ============================ GUITARRA ============================ */
function makeRiff(c: Ctx): PEv[] {
  // riff de 1 compasso na pentatônica grave + acorde de força (composto pela semente)
  const r = c.r;
  const pent = c.minor || c.spec.style === 'metal' ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
  const metal = c.spec.style === 'metal';
  const base = inRange(c.key.tonic, 40);
  const out: PEv[] = [];
  let k = 0;
  const lens = metal ? [1, 1, 2, 1, 1, 2, 2, 1, 1, 2, 2] : [2, 2, 1, 1, 2, 2, 2, 4];
  let li = Math.floor(r() * 3);
  while (k < 16) {
    const len = Math.min(16 - k, lens[li++ % lens.length]);
    let m: number[];
    if (k === 0 || (k === 8 && r() < 0.5)) m = [base, base + 7, base + 12];
    else if (metal && r() < 0.35) m = [base];
    else {
      const idx = Math.floor(r() * 6);
      const p = base + 12 * Math.floor(idx / 5) + pent[idx % 5] + (metal && r() < 0.2 ? 1 - pent[idx % 5] : 0);
      m = [p];
    }
    out.push({ b: k / 4, d: len / 4, m, v: k % 4 === 0 ? 0.95 : 0.8, pm: metal && m.length === 1 && len === 1 });
    k += len;
  }
  return out;
}

function guitar(c: Ctx, s: Section): void {
  const { st, a, r } = c;
  const chs = c.chordsOf.get(s)!;
  const easy = c.spec.easy;
  const add = (bar: number, k: number, len: number, m: number[], v: number, extra?: Partial<PEv>) =>
    a.guitar.push({ b: (s.bar + bar) * 4 + k / 4, d: len / 4, m, v, ...extra });
  const riffy = st.gtr === 'power' || st.gtr === 'chug' || st.gtr === 'punk';
  if ((s.kind === 'intro' || (s.kind === 'break' && st.gtr === 'chug')) && riffy) {
    c.riff ??= makeRiff(c);
    for (let i = 0; i < s.bars; i++) {
      const tr = s.tr + (i % 4 === 3 ? (c.minor ? -2 : 5) : 0);
      for (const e of c.riff) a.guitar.push({ ...e, b: (s.bar + i) * 4 + e.b, m: e.m.map((m) => m + tr) });
    }
    return;
  }
  for (let i = 0; i < s.bars; i++) {
    const ch = chs[i];
    const pw = powerChord(ch.root + s.tr);
    const tri = voice(ch, 60 + s.tr, 3);
    const hi = voice(ch, 67 + s.tr, 3);
    const strong = s.kind === 'chorus' || s.kind === 'outro';
    if (s.kind === 'bridge' || (s.kind === 'intro' && !riffy) || easy) {
      const m = riffy ? pw : tri;
      if (easy && strong) [0, 8].forEach((k) => add(i, k, 8, m, 0.85));
      else add(i, 0, 16, m, 0.8);
      continue;
    }
    switch (st.gtr) {
      case 'power':
      case 'punk':
        if (s.kind === 'verse' && st.gtr === 'power') for (let k = 0; k < 16; k += 2) add(i, k, 2, pw, k % 4 === 0 ? 0.9 : 0.75, { pm: true });
        else if (strong && st.gtr === 'power') {
          for (const [k, l] of [[0, 6], [6, 2], [8, 6], [14, 2]]) add(i, k, l, pw, k === 0 ? 1 : 0.85);
        } else for (let k = 0; k < 16; k += 2) add(i, k, 2, pw, k % 4 === 0 ? 0.95 : 0.8, { pm: s.kind === 'verse' && k % 4 !== 0 });
        break;
      case 'chug':
        if (strong) {
          add(i, 0, 6, pw, 1);
          add(i, 6, 2, pw, 0.9);
          for (let k = 8; k < 16; k++) add(i, k, 1, [pw[0]], 0.85, { pm: true });
        } else {
          for (let k = 0; k < 16; k++) {
            if (k % 4 === 1) continue; // galope: x.xx
            add(i, k, 1, k === 0 ? pw : [pw[0]], k === 0 ? 1 : 0.8, { pm: k !== 0 });
          }
        }
        break;
      case 'strum':
        if (strong) for (let k = 0; k < 16; k += 2) add(i, k, 2, tri, k % 4 === 0 ? 0.9 : 0.65);
        else for (const [k, l] of [[0, 6], [6, 2], [8, 4], [12, 4]]) add(i, k, l, tri, 0.8);
        break;
      case 'arp': {
        const ar = [tri[0], tri[1], tri[2], tri[0] + 12, tri[2], tri[1], tri[0] + 12, tri[2]];
        if (strong) for (let k = 0; k < 16; k += 4) add(i, k, 4, tri, 0.8);
        for (let k = strong ? 2 : 0; k < 16; k += strong ? 4 : 2) add(i, k, 2, [ar[(k / 2) % 8]], 0.75);
        break;
      }
      case 'funk':
        for (let k = 0; k < 16; k++) {
          const hit = line(c.stabMask, k) === 'x' && (k % 2 === 0 || strong);
          if (hit) add(i, k, 1, hi, 0.85);
          else if (strong || k % 2 === 0) add(i, k, 1, hi, 0.6, { x: 1 });
        }
        break;
      case 'skank':
        for (const k of strong ? [4, 6, 12, 14] : [4, 12]) add(i, k, 1.5, hi, 0.85);
        break;
      case 'cavaco':
        for (let k = 0; k < 16; k++) if (line(c.stabMask, k) === 'x') add(i, k, 1, voice(ch, 69 + s.tr, 3), k % 4 === 0 ? 0.9 : 0.7);
        break;
      case 'synthArp': {
        const ar = [hi[0], hi[1], hi[2], hi[0] + 12];
        const step = strong ? 1 : 2;
        const ord = r() < 0.5 ? [0, 1, 2, 3, 2, 1] : [0, 2, 1, 3];
        for (let k = 0, j = 0; k < 16; k += step, j++) add(i, k, step, [ar[ord[j % ord.length]]], k % 4 === 0 ? 0.9 : 0.7);
        break;
      }
      case 'ostinato': {
        const lo = inRange(ch.root + s.tr, 48);
        const step = strong ? 1 : 2;
        for (let k = 0; k < 16; k += step) add(i, k, step, [k % 4 === 2 ? lo + 7 : lo + (k % 8 === 4 ? 12 : 0)], k % 4 === 0 ? 0.9 : 0.7);
        break;
      }
    }
  }
}

/* ============================ SOLO ============================ */
function solo(c: Ctx, s: Section): void {
  const { a, r, key, spec } = c;
  const chs = c.chordsOf.get(s)!;
  const flavor = spec.mega?.flavor ?? (spec.style === 'metal' ? 'shred' : spec.style === 'lofi' || spec.style === 'reggae' ? 'melodic' : pick(r, ['melodic', 'blues', 'melodic'] as const));
  const minor = c.minor;
  const pent = flavor === 'neo' ? key.mode : minor ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
  const N = pent.length;
  const base = inRange(key.tonic + s.tr, 57);
  const P = (i: number) => base + 12 * Math.floor(i / N) + pent[mod(i, N)];
  const hiIdx = N * 2 + 2;
  // acompanhamento: teclado segura acordes (já feito em keys) — aqui só o lead
  const units = Math.max(1, Math.floor(s.bars / 2));
  let idx = N; // começa no meio
  const push = (k: number, len: number, i: number, g?: number) => {
    const m = P(i);
    a.guitar.push({ b: s.bar * 4 + k / 4, d: len / 4, m: [m], v: 0.9, x: 2, g });
  };
  for (let u = 0; u < units; u++) {
    const prog = u / units;
    const last = u === units - 1;
    const top = Math.round(N + 1 + prog * (hiIdx - N - 1));
    let k = u * 32;
    const endK = u * 32 + (last ? 32 : 28);
    if (last) {
      // clímax: corrida até o topo + bend longo
      const runStart = Math.max(N, top - 8);
      for (let i = runStart, j = 0; i <= top && k < endK - 12; i++, j++, k += 1) push(k, 1, i);
      const g = pent[mod(top + 1, N)] - pent[mod(top, N)];
      push(k, endK - k, top, mod(g, 12) || 2);
      idx = top;
      continue;
    }
    while (k < endK - 2) {
      const chord = chs[Math.min(chs.length - 1, Math.floor((k - u * 32) / 16) + u * 2)];
      const lick = wpick(r, [
        ['bend', flavor === 'blues' ? 4 : 2],
        ['run', flavor === 'shred' || flavor === 'neo' ? 4 : 1.5],
        ['rep', flavor === 'shred' ? 2 : 1],
        ['call', flavor === 'melodic' ? 4 : 2],
        ['long', flavor === 'melodic' ? 2 : 1],
        ['sweep', flavor === 'neo' || flavor === 'shred' ? 2 : 0],
      ] as [string, number][]);
      const room = endK - k;
      if (lick === 'bend' && room >= 6) {
        push(k, 2, idx - 1);
        push(k + 2, 2, idx);
        const len = Math.min(room - 4, 4 + Math.floor(r() * 3) * 2);
        const g = mod(pent[mod(idx + 2, N)] - pent[mod(idx + 1, N)], 12) || 2;
        push(k + 4, len, idx + 1, g);
        idx = idx + 1;
        k += 4 + len;
      } else if (lick === 'run' && room >= 8) {
        const up = idx < top ? 1 : -1;
        const n = Math.min(room, 8);
        for (let j = 0; j < n; j++) push(k + j, 1, idx + up * j);
        idx += up * (n - 1);
        k += n;
      } else if (lick === 'rep' && room >= 6) {
        const cell = [idx + 1, idx, idx - 1];
        const n = Math.min(room, 6 + (r() < 0.5 ? 3 : 0));
        for (let j = 0; j < n; j++) push(k + j, 1, cell[j % 3]);
        k += n;
      } else if (lick === 'sweep' && room >= 8) {
        const tones = voice(chord, base + 12 + s.tr, 3);
        const sw = [tones[0] - 12, tones[1] - 12, tones[2] - 12, tones[0], tones[1], tones[2], tones[0] + 12, tones[2]];
        for (let j = 0; j < 8; j++) a.guitar.push({ b: s.bar * 4 + (k + j) / 4, d: 0.25, m: [sw[j]], v: 0.85, x: 2 });
        k += 8;
      } else if (lick === 'call' && room >= 8) {
        const ct = [0, 1, 0, -1];
        for (let j = 0; j < 4; j++) push(k + j * 2, 2, idx + ct[j]);
        k += 8;
      } else {
        const len = Math.min(room, 6 + Math.floor(r() * 2) * 2);
        // nota longa em nota do acorde
        let best = idx;
        for (const d of [0, 1, -1, 2, -2]) if (chord.pcs.includes(mod(P(idx + d) - s.tr, 12))) {
          best = idx + d;
          break;
        }
        push(k, len, best);
        idx = best;
        k += len;
      }
      idx = clamp(idx, N - 2, hiIdx);
      if (idx < top - 4 && r() < 0.5) idx += 2;
    }
  }
}

/* ============================ TECLADOS ============================ */
function keys(c: Ctx, s: Section): void {
  const { st, a, spec } = c;
  const chs = c.chordsOf.get(s)!;
  const tb = st.timbre.keys;
  const add = (bar: number, k: number, len: number, m: number[], v: number) => a.keys.push({ b: (s.bar + bar) * 4 + k / 4, d: len / 4, m, v });
  const strong = s.kind === 'chorus' || s.kind === 'outro' || s.kind === 'solo';
  for (let i = 0; i < s.bars; i++) {
    const ch = chs[i];
    const v = voice(ch, (tb === 'brass' ? 66 : 63) + s.tr, ch.pcs.length >= 4 ? 4 : 3);
    let pat = st.keys;
    if (s.kind === 'solo' || s.kind === 'break' || s.kind === 'bridge' || spec.easy) pat = 'pad';
    if (s.kind === 'intro' && st.keys === 'stabs') {
      // fanfarra de abertura
      for (const [k, l] of [[0, 2], [3, 1], [6, 2], [10, 6]]) add(i, k, l, v, 0.9);
      continue;
    }
    switch (pat) {
      case 'pad':
        if (spec.easy && !strong) add(i, 0, 16, v, 0.7);
        else if (spec.easy) [0, 8].forEach((k) => add(i, k, 8, v, 0.8));
        else add(i, 0, 16, v, strong ? 0.8 : 0.65);
        break;
      case 'organ':
        if (strong) [0, 8].forEach((k) => add(i, k, 8, v, 0.85));
        else add(i, 0, 16, v, 0.6);
        break;
      case 'comp':
        for (const [k, l] of strong ? [[0, 4], [3, 2], [6, 4], [10, 2], [12, 4]] : [[0, 6], [6, 2], [10, 6]]) add(i, k, l, v, 0.8);
        break;
      case 'stabs':
        for (const [k, l] of strong ? [[0, 2], [3, 2], [6, 4], [10, 2], [12, 2]] : [[14, 2]]) add(i, k, l, v, 0.9);
        if (!strong && i % 2 === 1) add(i, 6, 2, v, 0.8);
        break;
      case 'accordion':
        for (let k = strong ? 0 : 2; k < 16; k += strong ? 2 : 4) add(i, k, 2, v, k % 4 === 0 ? 0.85 : 0.7);
        break;
      case 'chipArp': {
        const ar = [v[0], v[1], v[2], v[0] + 12];
        for (let k = 0; k < 16; k += strong ? 1 : 2) add(i, k, strong ? 1 : 2, [ar[k % 4]], 0.75);
        break;
      }
      case 'bubble':
        for (const [k, l] of [[4, 1], [6, 1], [12, 1], [14, 1]]) add(i, k, l, v, k % 8 === 4 ? 0.85 : 0.6);
        break;
    }
    // mega: pad de reforço por baixo do refrão
    if (spec.mega && strong && tb !== 'pad' && tb !== 'strings') c.a.extra.push({ tr: 'keys', e: { b: (s.bar + i) * 4, d: 4, m: voice(ch, 57 + s.tr, 3), v: 0.35 } });
  }
}

/* ============================ VOZ (melodia) ============================ */
type Cell = number[]; // durações em 16 avos; negativo = pausa
const CELLS: [Cell, number, number][] = [
  // [células por tempo, peso denso, peso esparso]
  [[4], 1, 4],
  [[2, 2], 3, 3],
  [[3, 1], 2, 1],
  [[1, 1, 2], 2, 0.3],
  [[2, 1, 1], 2, 0.3],
  [[1, 1, 1, 1], 1, 0],
  [[-2, 2], 1, 1],
  [[-4], 0.5, 1.5],
];
function barRhythm(r: R, dens: number): [number, number][] {
  for (let tries = 0; tries < 8; tries++) {
    const out: [number, number][] = [];
    for (let beat = 0; beat < 4; beat++) {
      const cell = wpick(r, CELLS.map(([cl, dw, sw]) => [cl, dw * dens + sw * (1 - dens)] as [Cell, number]));
      let k = beat * 4;
      for (const d of cell) {
        if (d > 0) out.push([k, d]);
        k += Math.abs(d);
      }
    }
    if (out.length >= 3) return out;
  }
  return [[0, 4], [4, 4], [8, 8]];
}

function vocals(c: Ctx, s: Section): void {
  const { a, spec } = c;
  if (s.kind !== 'verse' && s.kind !== 'chorus' && s.kind !== 'pre' && s.kind !== 'bridge') return;
  const cacheKey = `${s.kind}:${s.bars}`;
  let mel = c.melCache.get(cacheKey);
  if (!mel) {
    const seed = s.kind === 'chorus' && spec.mega?.hook ? spec.mega.hook : spec.seed ^ hash(s.kind);
    mel = melody(c, s, rng(seed));
    c.melCache.set(cacheKey, mel);
  }
  for (const e of mel) {
    const ev = { ...e, b: e.b + s.bar * 4, m: e.m.map((m) => m + s.tr) };
    a.vocals.push(ev);
    // mega: harmonia (terça diatônica acima) nos refrões finais
    if (spec.mega && s.kind === 'chorus' && s.tr !== 0) a.extra.push({ tr: 'vocals', e: { ...ev, m: [harm3(c, e.m[0]) + s.tr], v: ev.v * 0.6 } });
  }
}

function harm3(c: Ctx, m: number): number {
  for (let up = 3; up <= 4; up++) if (c.key.mode.includes(mod(m + up - c.key.tonic, 12))) return m + up;
  return m + 3;
}

function melody(c: Ctx, s: Section, r: R): PEv[] {
  const { st, key, spec } = c;
  const chs = c.chordsOf.get(s)!;
  const kind = s.kind;
  let dens = st.mel + (kind === 'chorus' ? -0.1 : kind === 'pre' ? 0.1 : kind === 'bridge' ? -0.25 : 0);
  if (spec.easy) dens = Math.min(dens, 0.3);
  dens = clamp(dens, 0.1, 0.9);
  const center = st.voc + (kind === 'chorus' ? 3 : kind === 'bridge' ? 1 : 0);
  const base = inRange(key.tonic, center - 6); // tônica na região
  const lo = -2;
  const hi = spec.easy ? 6 : 9;
  const out: PEv[] = [];
  const isCT = (d: number, ch: Chord) => ch.pcs.slice(0, 3).includes(key.pc(d));
  const nearCT = (d: number, ch: Chord) => {
    for (const o of [0, -1, 1, -2, 2, 3]) if (isCT(d + o, ch)) return d + o;
    return d;
  };
  const vowSet = kind === 'chorus' ? [0, 1, 0, 3] : kind === 'verse' ? [2, 1, 2, 3] : [1, 1, 0, 0];
  // motivo: ritmo + contorno
  const rhA = barRhythm(r, dens);
  const rhB = r() < 0.5 ? rhA : barRhythm(r, dens);
  const contour = rhA.map(() => wpick(r, [[0, 1.2], [1, 2], [-1, 2], [2, 1], [-2, 1], [3, 0.4], [-3, 0.4]] as [number, number][]));
  let d = nearCT(2 + Math.floor(r() * 3), chs[0]);
  const phrases = Math.max(1, Math.floor(s.bars / 4));
  let firstPhrase: { bar: number; k: number; len: number; d: number }[] = [];
  for (let ph = 0; ph < phrases; ph++) {
    const notes: { bar: number; k: number; len: number; d: number }[] = [];
    const answer = ph % 2 === 1 || phrases === 1;
    if (ph % 2 === 1 && firstPhrase.length) {
      // repete as 3 primeiras barras da frase anterior (memorável), troca a cadência
      for (const n of firstPhrase) if (n.bar < 3) notes.push({ ...n, bar: n.bar });
      d = notes.length ? notes[notes.length - 1].d : d;
    } else {
      for (let bar = 0; bar < 3; bar++) {
        const ch = chs[(ph * 4 + bar) % chs.length];
        const rh = bar === 2 ? rhB : rhA;
        // compasso 2: sequência do motivo começando em nota do novo acorde
        if (bar === 1) d = nearCT(d + (kind === 'pre' ? 1 : kind === 'chorus' && r() < 0.5 ? 0 : 1), ch);
        if (bar === 2 && r() < 0.5) d = nearCT(d - 1, ch);
        rh.forEach(([k, len], j) => {
          const step = bar === 2 && kind !== 'pre' ? -contour[j % contour.length] : contour[j % contour.length];
          if (j > 0 || bar === 2) d += kind === 'pre' ? Math.abs(step) * 0.5 : step;
          d = Math.round(d);
          if (k % 8 === 0) d = nearCT(d, ch);
          if (d > hi) d -= 2;
          if (d < lo) d += 2;
          notes.push({ bar, k, len, d });
        });
      }
      firstPhrase = notes.slice();
    }
    // cadência (compasso 4): pergunta → 5º/2º grau; resposta → tônica
    const ch4 = chs[(ph * 4 + 3) % chs.length];
    const target = nearCT(answer ? (d > 4 ? 7 : 0) : d > 3 ? 4 : 1, ch4);
    const mid = Math.round((d + target) / 2);
    notes.push({ bar: 3, k: 0, len: 2, d: mid });
    notes.push({ bar: 3, k: 2, len: spec.easy ? 10 : 8 + (r() < 0.5 ? 2 : 0), d: target });
    d = target;
    for (const n of notes) {
      const bar = ph * 4 + n.bar;
      out.push({ b: bar * 4 + n.k / 4, d: n.len / 4, m: [key.midi(n.d, base)], v: n.k % 4 === 0 ? 0.9 : 0.75, vow: vowSet[bar % 4] });
    }
  }
  return out;
}
