/* ============================================================
 *  CHARTS: transforma o arranjo em pistas de notas jogáveis,
 *  por instrumento e dificuldade (fácil 3 pistas, médio 4,
 *  difícil/expert 5). Seleção por força métrica + intervalo mínimo,
 *  pista pelo contorno melódico, acordes → várias pistas (difícil+),
 *  notas longas para sustentações, correção de "jacks".
 * ============================================================ */
import type { Difficulty, Instrument, Note } from '../api';
import type { Arrangement } from './compose';
import type { DEv, DrumPiece, PEv } from './synth';

export interface DiffRule {
  lanes: number;
  grid: number; // em batidas
  gapSec: number; // intervalo mínimo entre notas (tempos distintos)
  jackSec: number; // intervalo mínimo na MESMA pista
  maxChord: number;
  holdBeats: number; // duração mínima para virar nota longa
}
export const RULES: Record<Difficulty, DiffRule> = {
  facil: { lanes: 3, grid: 1, gapSec: 0.42, jackSec: 0.55, maxChord: 1, holdBeats: 1.5 },
  medio: { lanes: 4, grid: 0.5, gapSec: 0.24, jackSec: 0.34, maxChord: 1, holdBeats: 1 },
  dificil: { lanes: 5, grid: 0.25, gapSec: 0.15, jackSec: 0.22, maxChord: 2, holdBeats: 1 },
  expert: { lanes: 5, grid: 0.25, gapSec: 0.1, jackSec: 0.15, maxChord: 3, holdBeats: 1 },
};
export const DIFFS: Difficulty[] = ['facil', 'medio', 'dificil', 'expert'];
export const INSTRUMENTS: Instrument[] = ['drums', 'bass', 'guitar', 'keys', 'vocals'];

interface Src {
  b: number;
  d: number;
  /** alturas (ordem crescente) ou pistas fixas (bateria) */
  p: number[];
  pri: number;
  drumLanes?: number[];
}

const strength = (b: number) => {
  const f = b - Math.floor(b);
  const bi = Math.round(b) % 4;
  if (f < 0.01) return bi === 0 ? 4 : bi === 2 ? 3.2 : 3;
  if (Math.abs(f - 0.5) < 0.01) return 2;
  return 1;
};
const onGrid = (b: number, g: number) => {
  const x = b / g;
  return Math.abs(x - Math.round(x)) < 0.01;
};

function drumLane(p: DrumPiece, L: number): number {
  if (L === 3) return p === 'k' ? 0 : p === 's' || p === 'cl' || p === 'rim' || p.startsWith('t') ? 1 : 2;
  if (L === 4) return p === 'k' ? 0 : p === 's' || p === 'cl' || p === 'rim' ? 1 : p === 'h' || p === 'ho' ? 2 : 3;
  return p === 'k' ? 0 : p === 's' || p === 'cl' || p === 'rim' ? 1 : p === 'h' || p === 'ho' || p === 'r' ? 2 : p === 't1' || p === 't2' ? 3 : 4;
}
const DRUM_PRI: Partial<Record<DrumPiece, number>> = { s: 1.2, cl: 1.2, k: 1, c: 1.1, t1: 0.9, t2: 0.9, t3: 0.9, rim: 0.8, h: 0.3, ho: 0.5, r: 0.4 };

function sources(a: Arrangement, inst: Instrument, L: number): Src[] {
  if (inst === 'drums') {
    const byB = new Map<number, DEv[]>();
    for (const e of a.drums) {
      if (e.p === 'st' || e.p === 'g') continue;
      const k = Math.round(e.b * 1000);
      const l = byB.get(k);
      if (l) l.push(e);
      else byB.set(k, [e]);
    }
    const out: Src[] = [];
    for (const [, evs] of byB) {
      evs.sort((x, y) => (DRUM_PRI[y.p] ?? 0) - (DRUM_PRI[x.p] ?? 0));
      const lanes = [...new Set(evs.map((e) => drumLane(e.p, L)))];
      out.push({ b: evs[0].b, d: 0, p: [], pri: strength(evs[0].b) + (DRUM_PRI[evs[0].p] ?? 0) + evs[0].v, drumLanes: lanes });
    }
    return out.sort((x, y) => x.b - y.b);
  }
  const list: PEv[] = a[inst];
  return list.map((e) => ({ b: e.b, d: e.d, p: [...e.m].sort((x, y) => x - y), pri: strength(e.b) + e.v + (e.d >= 1 ? 0.6 : 0) - (e.x === 1 ? 2.5 : 0) - (e.pm ? 0.3 : 0) }));
}

/** pista pelo contorno: janela local normalizada + "subiu → pista sobe" */
function contourLanes(src: Src[], L: number): number[] {
  const lanes: number[] = [];
  const W = 6;
  let prevLane = Math.floor(L / 2);
  let prevP = -1;
  for (let i = 0; i < src.length; i++) {
    const p = src[i].p[0];
    let lo = p;
    let hi = p;
    for (let j = Math.max(0, i - W); j <= Math.min(src.length - 1, i + W); j++) {
      lo = Math.min(lo, src[j].p[0]);
      hi = Math.max(hi, src[j].p[0]);
    }
    let lane = hi > lo ? Math.round(((p - lo) / (hi - lo)) * (L - 1)) : prevLane;
    if (prevP >= 0) {
      if (p > prevP && lane <= prevLane) lane = Math.min(L - 1, prevLane + 1);
      else if (p < prevP && lane >= prevLane) lane = Math.max(0, prevLane - 1);
      else if (p === prevP) lane = prevLane;
    }
    lanes.push(lane);
    prevLane = lane;
    prevP = p;
  }
  return lanes;
}

export function makeChart(a: Arrangement, inst: Instrument, diff: Difficulty): Note[] {
  const SW = (b: number) => Math.round(swingBeat(b, a.swing) * 1000) / 1000;
  const R = RULES[diff];
  const L = R.lanes;
  const spb = 60 / a.bpm;
  // grade efetiva: em andamentos rápidos, alarga para respeitar o intervalo mínimo
  let grid = R.grid;
  while (grid * spb < R.gapSec * 0.9 && grid < 1) grid *= 2;
  const gapB = R.gapSec / spb;
  const all = sources(a, inst, L);
  // seleção na grade ORIGINAL; todos os intervalos medidos no tempo real (com swing)
  const cand = all.filter((s) => onGrid(s.b, grid) && s.b >= 4).map((s) => ({ ...s, b: SW(s.b) }));
  if (!cand.length) return [];
  const isDrum = inst === 'drums';
  const cl = isDrum ? [] : contourLanes(cand, L);
  // seleção gulosa por prioridade
  const order = cand.map((_, i) => i).sort((x, y) => cand[y].pri - cand[x].pri || cand[x].b - cand[y].b);
  const taken: number[] = []; // tempos aceitos (ordenados)
  const ok = new Set<number>();
  const minPri = diff === 'facil' ? 2.6 : diff === 'medio' ? 2 : 0;
  for (const i of order) {
    const s = cand[i];
    if (s.pri < minPri) continue;
    // busca binária do vizinho
    let lo = 0;
    let hi = taken.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (taken[m] < s.b) lo = m + 1;
      else hi = m;
    }
    const near = (lo < taken.length && taken[lo] - s.b < gapB - 1e-6) || (lo > 0 && s.b - taken[lo - 1] < gapB - 1e-6);
    if (near) continue;
    taken.splice(lo, 0, s.b);
    ok.add(i);
  }
  const idx = [...ok].sort((x, y) => cand[x].b - cand[y].b);
  const notes: Note[] = [];
  const lastInLane = new Array<number>(L).fill(-1e9);
  const holdEnd = new Array<number>(L).fill(-1e9);
  for (let n = 0; n < idx.length; n++) {
    const i = idx[n];
    const s = cand[i];
    const nextB = n + 1 < idx.length ? cand[idx[n + 1]].b : s.b + 8;
    let lanes: number[];
    if (isDrum) {
      lanes = s.drumLanes!.slice(0, R.maxChord);
    } else {
      const chordN = Math.min(R.maxChord, s.p.length, s.pri >= 3 || diff === 'expert' ? 3 : 1);
      let base = cl[i];
      if (chordN > 1) {
        base = Math.min(base, L - chordN);
        const spread = chordN === 2 && base + 2 < L && s.p.length >= 3 ? 2 : 1;
        lanes = chordN === 2 ? [base, base + spread] : [base, base + 1, base + 2];
      } else lanes = [base];
    }
    // correção de jacks / notas sob nota longa
    const used = new Set<number>();
    lanes = lanes.map((ln) => {
      const bad = (l: number) => used.has(l) || (s.b - lastInLane[l]) * spb < R.jackSec || holdEnd[l] > s.b - 0.01;
      if (!bad(ln)) {
        used.add(ln);
        return ln;
      }
      for (const d of [1, -1, 2, -2, 3, -3, 4, -4]) {
        const l2 = ln + d;
        if (l2 >= 0 && l2 < L && !bad(l2)) {
          used.add(l2);
          return l2;
        }
      }
      return -1;
    });
    lanes = lanes.filter((l) => l >= 0);
    if (!lanes.length) continue;
    // nota longa
    let len = 0;
    if (!isDrum && s.d >= R.holdBeats) {
      const room = diff === 'facil' || diff === 'medio' ? nextB - s.b - 0.5 : s.d;
      len = Math.min(s.d - 0.25, room);
      if (len < R.holdBeats * 0.75) len = 0;
    }
    for (const l of lanes) {
      const note: Note = { b: s.b, lane: l };
      if (len > 0) {
        note.len = Math.round(len * 4) / 4;
        holdEnd[l] = s.b + note.len;
      }
      lastInLane[l] = s.b;
      notes.push(note);
    }
  }
  return notes;
}

/** aplica swing às batidas do chart (mesma função do player) */
export function swingBeat(b: number, sw: number): number {
  if (!sw) return b;
  const fr = b - Math.floor(b);
  const k = Math.round(fr * 4);
  if (Math.abs(fr * 4 - k) > 0.01) return b;
  if (k === 2) return b + sw;
  if (k === 1 || k === 3) return b + sw * 0.5;
  return b;
}

export interface ChartIssue {
  b: number;
  msg: string;
}
/** validação: pistas válidas, ordenação, intervalo mínimo, jacks, notas dentro de longas, acordes */
export function validateChart(notes: Note[], diff: Difficulty, bpm: number): ChartIssue[] {
  const R = RULES[diff];
  const spb = 60 / bpm;
  const out: ChartIssue[] = [];
  const last = new Array<number>(R.lanes).fill(-1e9);
  const holdEnd = new Array<number>(R.lanes).fill(-1e9);
  let prevB = -1e9;
  let chord = 0;
  for (const n of notes) {
    if (n.lane < 0 || n.lane >= R.lanes) out.push({ b: n.b, msg: `pista ${n.lane}` });
    if (n.b < prevB - 1e-6) out.push({ b: n.b, msg: 'fora de ordem' });
    if (Math.abs(n.b - prevB) < 1e-6) {
      if (++chord > R.maxChord) out.push({ b: n.b, msg: 'acorde grande demais' });
    } else {
      // tolerância: swing pode aproximar duas notas um pouco
      if ((n.b - prevB) * spb < R.gapSec * 0.75) out.push({ b: n.b, msg: `intervalo ${((n.b - prevB) * spb).toFixed(3)}s` });
      chord = 1;
    }
    if ((n.b - last[n.lane]) * spb < R.jackSec * 0.75 && n.b !== last[n.lane]) out.push({ b: n.b, msg: 'jack' });
    if (holdEnd[n.lane] > n.b + 1e-6) out.push({ b: n.b, msg: 'nota dentro de nota longa' });
    last[n.lane] = n.b;
    if (n.len) holdEnd[n.lane] = n.b + n.len;
    prevB = n.b;
  }
  return out;
}
