/* ============================================================
 *  MONTA & LEVA — gerador de fases (SÓ DESENVOLVIMENTO; o jogo não importa este arquivo).
 *  scripts/dev/montaleva-bake.mjs roda este módulo em Node: para cada vaga do plano monta uma pista
 *  (sementes fixas → sempre o mesmo resultado), procura um veículo que resolve a fase com a física real,
 *  e grava fase + solução em levels-data.ts / solutions-data.ts. As peças oferecidas na fase saem
 *  da solução encontrada (mais algumas sobras), então toda fase tem saída por construção.
 * ============================================================ */
import { canPlace, partCost } from './design';
import { CLASSIC, type CargoDef, type CargoType, type LevelDef } from './levels';
import { PARTS, type PartId, type Placed } from './parts';
import { Sim, applyCmd, driveCmd, type DriveStep } from './sim';
import { CLASSIC_SOLUTIONS, validate, type Solution } from './solutions';
import { resolveTrack, type Seg, type Track } from './track';
import { U } from './parts';

/* ------------------------------ sorteio determinístico ------------------------------ */
function rngOf(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type R = () => number;
const pick = <T>(r: R, a: readonly T[]): T => a[Math.floor(r() * a.length) % a.length];
const rnd = (r: R, a: number, b: number) => a + (b - a) * r();
const q = (v: number, s = 0.05) => Number((Math.round(v / s) * s).toFixed(2));
function shuffle<T>(r: R, a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ------------------------------ veículos candidatos ------------------------------ */
type WheelT = 'wheelS' | 'wheelL' | 'wheelG';
export interface CarSpec {
  len: number;
  wheel: WheelT;
  layout: 'ends' | 'three' | 'rows';
  spring: boolean;
  walls: 0 | 1 | 2;
  weight: number;
  basket: boolean;
  thr: number;
  balloons: number;
  wired: boolean;
  /** botão de ré (fases espelhadas com fios) */
  rev: boolean;
}

interface Built {
  parts: Placed[];
  cargo: CargoDef[];
  grid: [number, number];
}

/** monta o veículo e posiciona a carga em cima; null se a combinação não cabe */
export function buildCar(c: CarSpec, cargo: CargoType[]): Built | null {
  const x0 = 1;
  const y0 = 1;
  const len = c.len;
  const P: Placed[] = [];
  const at = (i: number) => x0 + i;
  const wheelIdx = c.layout === 'ends' ? [0, len - 1] : c.layout === 'three' ? [0, Math.floor((len - 1) / 2), len - 1] : len >= 6 ? [0, 2, len - 3, len - 1] : null;
  if (!wheelIdx) return null;
  const rowT: PartId[] = [];
  for (let i = 0; i < len; i++) rowT.push('block');
  if (c.spring) {
    if (c.layout !== 'ends') return null;
    rowT[0] = rowT[len - 1] = 'spring';
  }
  // motores: cobrir todas as rodas (alcance 2), de preferência fora das molas
  const motors: number[] = [];
  const uncovered = new Set(wheelIdx);
  while (uncovered.size) {
    let best = -1;
    let bc = 0;
    for (let i = 0; i < len; i++) {
      if (rowT[i] !== 'block') continue;
      let n = 0;
      for (const w of uncovered) if (Math.abs(w - i) <= 2) n++;
      if (n > bc || (n === bc && n > 0 && Math.abs(i - (len - 1) / 2) < Math.abs(best - (len - 1) / 2))) {
        bc = n;
        best = i;
      }
    }
    if (best < 0 || bc === 0) return null;
    rowT[best] = 'motor';
    motors.push(best);
    for (const w of [...uncovered]) if (Math.abs(w - best) <= 2) uncovered.delete(w);
  }
  // pesos no meio
  for (let k = 0; k < c.weight; k++) {
    const mid = Math.floor((len - 1) / 2);
    const cand = [mid, mid + 1, mid - 1, mid + 2, mid - 2].filter((i) => i > 0 && i < len - 1 && rowT[i] === 'block');
    if (!cand.length) return null;
    rowT[cand[0]] = 'weight';
  }
  for (let i = 0; i < len; i++) P.push({ t: rowT[i], x: at(i), y: y0, r: 0 });
  const occ = new Set<number>();
  const K = (x: number, y: number) => x * 100 + y;
  for (let i = 0; i < len; i++) occ.add(K(at(i), y0));
  // paredes
  for (let h = 1; h <= c.walls; h++) {
    P.push({ t: 'block', x: at(0), y: y0 + h, r: 0 });
    P.push({ t: 'block', x: at(len - 1), y: y0 + h, r: 0 });
    occ.add(K(at(0), y0 + h));
    occ.add(K(at(len - 1), y0 + h));
  }
  // caçamba
  let bx = -1;
  if (c.basket) {
    if (c.walls) return null;
    bx = at(Math.floor((len - 3) / 2));
    P.push({ t: 'basket', x: bx, y: y0 + 1, r: 0 });
    for (let k = 0; k < 3; k++) occ.add(K(bx + k, y0 + 1));
  }
  // carga
  const cg: CargoDef[] = [];
  const blocked = new Set<number>(occ);
  const wheelCols = wheelIdx.map(at);
  const rr = (PARTS[c.wheel].radius ?? 0.4) / U + 0.01;
  const cellOk = (x: number, y: number) => {
    if (blocked.has(K(x, y))) return false;
    for (const wc of wheelCols) {
      const cx = wc + 0.5;
      const cy = y0 + 0.5;
      const nx = Math.max(x + 0.04, Math.min(cx, x + 0.96));
      const ny = Math.max(y + 0.04, Math.min(cy, y + 0.96));
      if (Math.hypot(nx - cx, ny - cy) < rr) return false;
    }
    if (bx >= 0 && y === y0 + 2 && (x === bx || x === bx + 2)) return false;
    return true;
  };
  const baseY = c.basket ? y0 + 2 : y0 + 1;
  const lo = c.walls ? at(1) : at(0);
  const hi = c.walls ? at(len - 2) : at(len - 1);
  // posições centrais primeiro
  const center = (lo + hi) / 2;
  const cols: number[] = [];
  for (let x = lo; x <= hi; x++) cols.push(x);
  cols.sort((a, b) => Math.abs(a - center) - Math.abs(b - center) || a - b);
  for (const t of cargo) {
    const w = t === 'big' || t === 'drops' ? 2 : 1;
    const h = t === 'big' || t === 'drops' || t === 'bot' ? 2 : 1;
    let placed = false;
    for (const x of cols) {
      let ok = true;
      for (let i = 0; i < w && ok; i++) for (let j = 0; j < h && ok; j++) if (!cellOk(x + i, baseY + j) || x + i > hi) ok = false;
      if (!ok) continue;
      // precisa de apoio: célula logo abaixo ocupada (ou caçamba)
      cg.push({ t, x, y: baseY });
      for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) blocked.add(K(x + i, baseY + j));
      placed = true;
      break;
    }
    if (!placed) return null;
  }
  // montagens: rodas
  for (const i of wheelIdx) P.push({ t: c.wheel, x: at(i), y: y0, r: 0 });
  const mounted = new Set(wheelIdx);
  // propulsores (para cima) e balões em células do chassi sem roda
  const free = [...Array(len).keys()].filter((i) => !mounted.has(i));
  const spread = (n: number): number[] | null => {
    const f = free.filter((i) => !mounted.has(i));
    if (f.length < n) return null;
    if (n === 1) return [f[Math.floor(f.length / 2)]];
    const out: number[] = [];
    for (let k = 0; k < n; k++) out.push(f[Math.round((k * (f.length - 1)) / (n - 1))]);
    return [...new Set(out)].length === n ? out : null;
  };
  const thrIdx = c.thr ? spread(c.thr) : [];
  if (!thrIdx) return null;
  for (const i of thrIdx) {
    P.push({ t: 'thruster', x: at(i), y: y0, r: 1 });
    mounted.add(i);
  }
  const balIdx = c.balloons ? spread(c.balloons) : [];
  if (!balIdx) return null;
  for (const i of balIdx) {
    P.push({ t: 'balloon', x: at(i), y: y0, r: 0 });
    mounted.add(i);
  }
  // botões (fases com fios): em cima, nas pontas (ou no lugar da parede)
  if (c.wired) {
    const spots: [number, number][] = [];
    for (const xi of [at(0), at(len - 1), at(1), at(len - 2)]) {
      const wallIdx = P.findIndex((p) => p.t === 'block' && p.x === xi && p.y === y0 + 1);
      if (wallIdx >= 0) spots.push([xi, -wallIdx - 1]);
      else if (!blocked.has(K(xi, y0 + 1)) && !(bx >= 0 && xi >= bx && xi <= bx + 2)) spots.push([xi, 0]);
    }
    const need = (c.rev ? 2 : 1) + (c.thr ? 1 : 0);
    if (spots.length < need) return null;
    const mcells = motors.map((i) => [at(i), y0] as [number, number]);
    const put = (k: number, t: PartId, w: [number, number][]) => {
      const [xi, wi] = spots[k];
      if (wi < 0) P[-wi - 1] = { t, x: xi, y: y0 + 1, r: 0, w };
      else {
        P.push({ t, x: xi, y: y0 + 1, r: 0, w });
        blocked.add(K(xi, y0 + 1));
      }
    };
    let k = 0;
    put(k++, 'btn', mcells);
    if (c.rev) put(k++, 'btnR', mcells.map((m) => [...m] as [number, number]));
    if (c.thr) put(k++, 'btn', thrIdx.map((i) => [at(i), y0] as [number, number]));
  }
  let maxX = 0;
  let maxY = 0;
  for (const p of P) {
    maxX = Math.max(maxX, p.x + (p.t === 'basket' ? 3 : 1));
    maxY = Math.max(maxY, p.y + (p.t === 'basket' ? 2 : 1));
  }
  for (const c2 of cg) {
    const w = c2.t === 'big' || c2.t === 'drops' ? 2 : 1;
    const h = c2.t === 'big' || c2.t === 'drops' || c2.t === 'bot' ? 2 : 1;
    maxX = Math.max(maxX, c2.x + w);
    maxY = Math.max(maxY, c2.y + h);
  }
  const W = Math.max(8, maxX + 1 + (c.wheel === 'wheelL' ? 1 : 0));
  const H = Math.max(5, maxY + 1);
  return { parts: sortParts(P), cargo: cg, grid: [W, H] };
}

function sortParts(P: Placed[]): Placed[] {
  return [...P].sort((a, b) => (PARTS[a.t].layer === 'struct' ? 0 : 1) - (PARTS[b.t].layer === 'struct' ? 0 : 1));
}

/* ------------------------------ roteiros de direção ------------------------------ */
function drives(tr: Track, wired: boolean, opts: { jump: boolean; wait: boolean }): DriveStep[][] {
  const F = tr.dir > 0 ? 'F' : 'R';
  const stop = wired ? '' : 'B';
  const out: DriveStep[][] = [];
  const zoneStops: DriveStep[][] = [[], [[0.3, stop, 'z']], [[-0.6, stop, 'z']]];
  // balsas: para em cima e espera atravessar
  const ferries = tr.objs.filter((o) => o.k === 'ferry') as { x0: number; x1: number; w: number }[];
  const prog = (x: number) => x * tr.dir;
  const jumps: number[][] = [];
  if (opts.jump) {
    // bordas dos buracos (início de cada linha depois da primeira)
    const edges: [number, number][] = [];
    for (let i = 0; i < tr.lines.length - 1; i++) {
      const a = tr.lines[i];
      const b = tr.lines[i + 1];
      const ea = tr.dir > 0 ? a[a.length - 2].x : a[a.length - 2].x;
      const eb = b[1].x;
      edges.push([prog(ea), prog(eb)]);
    }
    for (const lead of [0.9, 0.5, 1.4, 0.2])
      jumps.push(edges.flatMap(([s, e]) => [s - lead, e + 0.3]));
  }
  const waits = opts.wait ? [0, 0.8, 1.6, 2.4, 3.2] : [0];
  for (const w of waits)
    for (const zs of zoneStops) {
      const base: DriveStep[] = w ? [[0, stop || 'B'], [w, F]] : [[0, F]];
      if (ferries.length) {
        for (const pre of [0.2, -0.4]) {
          const d: DriveStep[] = [...base];
          for (const f of ferries) {
            const a = prog(f.x0);
            const b = prog(f.x1);
            const s0 = Math.min(a, b);
            const s1 = Math.max(a, b);
            d.push([s0 + pre, stop || 'B', 'x'], [s1 - 0.2, F, 'x']);
          }
          out.push([...d, ...zs]);
        }
        continue;
      }
      if (jumps.length) {
        for (const j of jumps) {
          const d: DriveStep[] = [...base];
          for (let i = 0; i < j.length; i += 2) d.push([j[i], F + 'J', 'x'], [j[i + 1], F, 'x']);
          out.push([...d, ...zs]);
        }
        continue;
      }
      out.push([...base, ...zs]);
    }
  return out;
}

/* ------------------------------ pistas ------------------------------ */
interface Recipe {
  segs: Seg[];
  cargo: CargoType[];
  /** precisa pular (buracos largos / água) */
  jump?: boolean;
  /** obstáculos com tempo (porteira, pêndulo) */
  wait?: boolean;
  /** veículos preferidos (vêm primeiro na busca) */
  prefer?: Partial<CarSpec>[];
  /** teto: altura máxima aproximada */
  mirror?: boolean;
  wet?: boolean;
  /** limites */
  budget?: boolean;
  tight?: boolean;
  /** peças extras de enfeite que a fase oferece */
  decoy?: PartId[];
  need?: number;
}

type Feat = (r: R, d: number) => Seg[];
const F: Record<string, Feat> = {
  rampUp: (r, d) => [['r', q(rnd(r, 2.5, 4)), q(rnd(r, 0.4, 0.6 + d * 0.9))]],
  rampDown: (r, d) => [['r', q(rnd(r, 2, 3.5)), -q(rnd(r, 0.4, 0.5 + d * 0.9))]],
  hill: (r, d) => {
    const h = q(rnd(r, 0.5, 0.7 + d * 0.9));
    return [['r', q(rnd(r, 2.5, 3.5)), h], ['f', q(rnd(r, 1, 2.5))], ['r', q(rnd(r, 2.5, 3.5)), -h]];
  },
  bumps: (r, d) => {
    const n = 1 + Math.floor(rnd(r, 0, 2 + d * 2));
    const out: Seg[] = [];
    for (let i = 0; i < n; i++) {
      out.push(['b', q(rnd(r, 2.2, 3.5)), q(rnd(r, 0.2, 0.3 + d * 0.3))]);
      if (i < n - 1) out.push(['f', q(rnd(r, 0.4, 1.5))]);
    }
    return out;
  },
  steps: (r, d) => {
    const n = 1 + Math.floor(rnd(r, 0, 2 + d));
    const out: Seg[] = [];
    const up = r() < 0.6;
    for (let i = 0; i < n; i++) {
      out.push(['s', (up ? 1 : -1) * q(rnd(r, 0.15, 0.22 + d * 0.18))]);
      out.push(['f', q(rnd(r, 1.6, 3))]);
    }
    return out;
  },
  wall: (r, d) => [['s', q(rnd(r, 0.3, 0.42 + d * 0.15))], ['f', q(rnd(r, 2, 3))]],
  drop: (r, d) => [['s', -q(rnd(r, 0.6, 0.8 + d * 1.0))], ['f', q(rnd(r, 2, 3))]],
  gapS: (r, d) => [['g', q(rnd(r, 0.6, 0.8 + d * 0.5)), 0]],
  gapJ: (r, d) => [['g', q(rnd(r, 2.2, 2.8 + d * 0.9)), 0]],
  waterJ: (r, d) => [['water', q(rnd(r, 2.0, 2.6 + d * 0.9)), 0]],
  waterS: (r, d) => [['water', q(rnd(r, 0.6, 0.8 + d * 0.4)), 0]],
  seesaw: (r) => [['seesaw', q(rnd(r, 7.5, 9))]],
  lift: (r, d) => [['lift', q(rnd(r, 4.6, 5.4)), q(rnd(r, 1.0, 1.4 + d * 0.8))]],
  liftDown: (r, d) => [['lift', q(rnd(r, 4.6, 5.4)), -q(rnd(r, 0.8, 1 + d * 0.6))]],
  ferry: (r, d) => [['ferry', q(rnd(r, 5.5, 6.5 + d * 2.5))]],
  bridge: (r, d) => [['bridge', q(rnd(r, 4, 5 + d * 2))]],
  gate: (r) => [['gate', q(rnd(r, 2.8, 3.5))]],
  pend: (r) => [['pend', q(rnd(r, 4.5, 5.5))]],
  boxes: (r, d) => [['boxes', q(rnd(r, 3, 4.5)), 1 + Math.floor(rnd(r, 0, 1 + d * 2))]],
  ceil: (r, d) => [['ceil', q(rnd(r, 3, 4 + d * 3)), q(rnd(r, 1.65, 1.95 - d * 0.15))]],
  ceilLow: (r, d) => [['ceil', q(rnd(r, 3, 4 + d * 3)), q(rnd(r, 1.3, 1.5 - d * 0.08))]],
};

function trackOf(r: R, feats: string[], d: number): Seg[] {
  const segs: Seg[] = [['f', q(rnd(r, 2, 3.5))]];
  feats.forEach((f, i) => {
    segs.push(...F[f](r, d));
    if (i < feats.length - 1) segs.push(['f', q(rnd(r, 1.2, 2.8))]);
  });
  segs.push(['f', q(rnd(r, 2, 3.2))], ['zone', 4]);
  return segs;
}

/* ------------------------------ plano dos capítulos ------------------------------ */
type Slot = number | { ch: number; i: number; k: number; tut?: 4 };

/** 10 capítulos × 20: as 30 clássicas intercaladas nos capítulos 1, 2 e 4 */
export function plan(): Slot[] {
  const out: Slot[] = [];
  let k = 0;
  const g = (ch: number, i: number, tut?: 4): Slot => ({ ch, i, k: k++, tut });
  // cap. 1: clássicas 1–10 nas posições ímpares (1, 2, 3 seguidas: tutoriais)
  const c1: Slot[] = [1, 2, 3, g(0, 0), 4, g(0, 1), 5, g(0, 2), 6, g(0, 3), 7, g(0, 4), 8, g(0, 5), 9, g(0, 6), 10, g(0, 7), g(0, 8), g(0, 9)];
  const c2: Slot[] = [];
  for (let i = 0; i < 10; i++) c2.push(11 + i, g(1, i));
  const c3: Slot[] = [];
  for (let i = 0; i < 20; i++) c3.push(g(2, i, i === 0 ? 4 : undefined));
  const c4: Slot[] = [];
  for (let i = 0; i < 10; i++) c4.push(21 + i, g(3, i));
  out.push(...c1, ...c2, ...c3, ...c4);
  for (let ch = 4; ch < 10; ch++) for (let i = 0; i < 20; i++) out.push(g(ch, i));
  return out;
}

/** receita (pista + carga + dicas) de cada vaga gerada */
function recipe(ch: number, i: number, k: number): Recipe {
  const r = rngOf(9001 + k * 7919);
  const n = ch === 0 || ch === 1 || ch === 3 ? 10 : 20;
  const d = Math.min(1, (i / Math.max(1, n - 1)) * 0.75 + ch * 0.04);
  const crateish = (): CargoType[] => [pick(r, ['crate', 'crate', 'big', 'glass'] as CargoType[])];
  switch (ch) {
    case 0: {
      const L: [string[], CargoType[]][] = [
        [['rampUp'], ['crate']],
        [['bumps'], ['bot']],
        [['steps'], ['crate']],
        [['hill'], ['ball']],
        [['bumps', 'rampDown'], ['big']],
        [['rampUp', 'drop'], ['bot']],
        [['gapS'], ['crate']],
        [['seesaw'], ['bot']],
        [['steps', 'bumps'], ['crate', 'crate']],
        [['hill', 'gapS'], ['bot']],
      ];
      const [f, cg] = L[i];
      return { segs: trackOf(r, f, d * 0.6), cargo: cg, decoy: ['block'] };
    }
    case 1: {
      const L: [string[], CargoType[], Partial<Recipe>?][] = [
        [['bumps', 'gapS'], ['glass']],
        [['bridge'], ['bot']],
        [['rampUp', 'rampUp'], ['crate']],
        [['lift'], ['bot']],
        [['gate', 'bumps'], ['crate'], { wait: true }],
        [['boxes'], ['big']],
        [['steps', 'hill'], ['ball']],
        [['pend'], ['bot'], { wait: true }],
        [['seesaw', 'gapS'], ['glass']],
        [['wall', 'bumps'], ['crate', 'bot']],
      ];
      const [f, cg, x] = L[i];
      return { segs: trackOf(r, f, d), cargo: cg, decoy: ['block', 'wheelS'], ...x };
    }
    case 2: {
      // botões e fios: tudo com fios
      const L: [string[], CargoType[], Partial<Recipe>?][] = [
        [['rampUp'], ['crate']],
        [['bumps'], ['crate']],
        [['steps'], ['bot']],
        [['hill'], ['crate']],
        [['seesaw'], ['bot']],
        [['gapS', 'bumps'], ['crate']],
        [['rampUp', 'drop'], ['ball']],
        [['lift'], ['crate']],
        [['bridge'], ['bot']],
        [['wall'], ['crate']],
        [['bumps', 'steps'], ['glass']],
        [['boxes', 'hill'], ['bot']],
        [['gate'], ['crate'], { wait: true }],
        [['seesaw', 'rampDown'], ['big']],
        [['steps', 'gapS'], ['bot']],
        [['bumps'], ['crate'], { mirror: true }],
        [['hill', 'bridge'], ['crate', 'bot']],
        [['rampUp'], ['bot'], { mirror: true }],
        [['pend', 'bumps'], ['glass'], { wait: true }],
        [['lift', 'drop', 'bumps'], ['bot']],
      ];
      const [f, cg, x] = L[i];
      return { segs: trackOf(r, f, d * 0.8), cargo: cg, decoy: ['block'], ...x };
    }
    case 3: {
      const L: [string[], CargoType[], Partial<Recipe>?][] = [
        [['hill'], ['crate', 'crate']],
        [['gapJ'], ['crate'], { jump: true }],
        [['drop', 'drop'], ['glass'], { prefer: [{ balloons: 2 }] }],
        [['gapJ', 'bumps'], ['bot'], { jump: true }],
        [['waterJ'], ['crate'], { jump: true, wet: true }],
        [['lift', 'gapS'], ['bot']],
        [['bumps', 'gapJ'], ['ball'], { jump: true }],
        [['drop', 'bumps', 'drop'], ['bot'], { prefer: [{ balloons: 2 }] }],
        [['seesaw', 'gapJ'], ['crate'], { jump: true }],
        [['rampUp', 'waterJ'], ['bot'], { jump: true, wet: true }],
      ];
      const [f, cg, x] = L[i];
      return { segs: trackOf(r, f, d), cargo: cg, decoy: ['block', 'thruster'], ...x };
    }
    case 4: {
      const pool: [string[], Partial<Recipe>?][] = [
        [['lift']],
        [['ferry']],
        [['seesaw', 'lift']],
        [['wall', 'wall']],
        [['liftDown', 'bumps']],
        [['steps', 'seesaw']],
        [['ferry', 'rampUp']],
        [['lift', 'wall']],
        [['hill', 'ferry']],
        [['seesaw', 'seesaw']],
      ];
      const [f, x] = pool[i % pool.length];
      return { segs: trackOf(r, i >= 10 ? [...f, pick(r, ['bumps', 'steps', 'rampDown', 'hill'])] : f, d), cargo: i % 3 === 1 ? ['bot'] : i % 3 === 2 ? crateish() : ['crate'], decoy: ['block', 'wheelL'], ...x };
    }
    case 5: {
      const pool: [string[], Partial<Recipe>?][] = [
        [['ceil']],
        [['ceilLow']],
        [['ceil', 'bumps']],
        [['gate', 'ceil'], { wait: true }],
        [['ceilLow', 'steps']],
        [['pend', 'ceil'], { wait: true }],
        [['ceil', 'gapS']],
        [['rampUp', 'ceilLow']],
        [['ceil', 'seesaw']],
        [['bumps', 'ceilLow', 'drop']],
      ];
      const [f, x] = pool[i % pool.length];
      return { segs: trackOf(r, i >= 10 ? [pick(r, ['bumps', 'steps', 'hill']), ...f] : f, d), cargo: i % 2 ? ['bot'] : [pick(r, ['crate', 'glass', 'ball'] as CargoType[])], decoy: ['wheelL', 'block'], ...x };
    }
    case 6: {
      const pool: [string[], Partial<Recipe>?][] = [
        [['waterS']],
        [['ferry']],
        [['bridge']],
        [['waterJ'], { jump: true }],
        [['ferry', 'bumps']],
        [['waterS', 'waterS']],
        [['bridge', 'waterS']],
        [['rampUp', 'waterJ'], { jump: true }],
        [['ferry', 'bridge']],
        [['waterJ', 'bumps'], { jump: true }],
      ];
      const [f, x] = pool[i % pool.length];
      return { segs: trackOf(r, i >= 10 ? [...f, pick(r, ['bumps', 'steps', 'seesaw'])] : f, d), cargo: i % 3 === 0 ? ['bot'] : i % 3 === 1 ? ['crate'] : crateish(), wet: true, decoy: ['block', 'balloon'], ...x };
    }
    case 7: {
      const pool: [string[], Partial<Recipe>?][] = [
        [['bumps']],
        [['rampUp']],
        [['steps']],
        [['seesaw']],
        [['hill']],
        [['bridge']],
        [['lift']],
        [['gapS', 'bumps']],
        [['ceil']],
        [['boxes']],
      ];
      const [f, x] = pool[i % pool.length];
      const feats = i >= 10 ? [...f, pick(r, ['bumps', 'steps', 'rampDown', 'hill', 'gapS'])] : f;
      return { segs: trackOf(r, feats, d), cargo: i % 2 ? ['bot'] : crateish(), mirror: true, decoy: ['block', 'btn'], ...x };
    }
    case 8: {
      const cargos: CargoType[][] = [['glass'], ['ball'], ['drops'], ['crate', 'crate'], ['glass', 'bot'], ['ball', 'crate'], ['glass', 'glass'], ['bot', 'crate']];
      const feats = [pick(r, ['bumps', 'steps', 'hill', 'rampUp']), pick(r, ['seesaw', 'gapS', 'bridge', 'rampDown', 'lift', 'bumps'])];
      if (i >= 12) feats.push(pick(r, ['drop', 'boxes', 'wall', 'ferry']));
      const cg = cargos[i % cargos.length];
      return { segs: trackOf(r, feats, d * 0.85), cargo: cg, budget: i % 2 === 1, need: cg[0] === 'drops' ? 6 : undefined, decoy: ['spring', 'block'] };
    }
    default: {
      const all = ['bumps', 'steps', 'hill', 'rampUp', 'seesaw', 'gapS', 'bridge', 'lift', 'gate', 'pend', 'ceil', 'ferry', 'waterS', 'boxes', 'wall', 'drop'];
      const feats = shuffle(r, [...all]).slice(0, 3 + (i >= 10 ? 1 : 0));
      const wait = feats.includes('gate') || feats.includes('pend');
      const cg: CargoType[] = i % 4 === 0 ? ['bot', 'crate'] : i % 4 === 1 ? ['glass'] : i % 4 === 2 ? ['bot'] : ['ball', 'crate'];
      return { segs: trackOf(r, feats, d), cargo: cg, wait, mirror: i % 5 === 3, wet: i % 3 === 0, budget: i % 2 === 0, tight: i % 2 === 1, decoy: ['block'] };
    }
  }
}

/* ------------------------------ busca ------------------------------ */
const WIRED_FROM_CH = 2;

/** peças que o jogador já conheceu antes desta vaga (as soluções geradas só usam essas) */
function allowedParts(ch: number, i: number, mirror: boolean): Set<PartId> {
  const a = new Set<PartId>(['block', 'motor', 'wheelS', 'beam', 'tri']);
  if (ch > 0 || i >= 2) a.add('wheelL');
  if (ch > 0 || i >= 3) a.add('basket');
  if (ch > 0 || i >= 8) a.add('spring');
  if (ch > 1 || (ch === 1 && i >= 1)) a.add('wheelG');
  if (ch > 1 || (ch === 1 && i >= 6)) a.add('weight');
  if (ch >= WIRED_FROM_CH) a.add('btn');
  if (ch >= 7 || mirror) a.add('btnR');
  if (ch > 3 || (ch === 3 && i >= 1)) a.add('thruster');
  if (ch > 3 || (ch === 3 && i >= 2)) a.add('balloon');
  return a;
}

function carCandidates(r: R, rc: Recipe, wired: boolean): CarSpec[] {
  const base: CarSpec = { len: 5, wheel: 'wheelS', layout: 'ends', spring: false, walls: 0, weight: 0, basket: false, thr: 0, balloons: 0, wired, rev: false };
  const needWalls = rc.cargo.some((c) => c === 'bot' || c === 'ball' || c === 'drops');
  const multi = rc.cargo.length > 1;
  const list: Partial<CarSpec>[] = [
    { len: 5 },
    { len: 5, wheel: 'wheelL' },
    { len: 6, wheel: 'wheelL', spring: true },
    { len: 6, wheel: 'wheelG', weight: 1 },
    { len: 7, wheel: 'wheelL', layout: 'three' },
    { len: 7, wheel: 'wheelS', layout: 'rows' },
    { len: 6, wheel: 'wheelL', spring: true, weight: 1 },
    { len: 8, wheel: 'wheelL', spring: true },
    { len: 6, wheel: 'wheelG', layout: 'rows', weight: 1 },
    { len: 6, wheel: 'wheelS', spring: true },
    { len: 7, wheel: 'wheelG', spring: true, weight: 2 },
    { len: 8, wheel: 'wheelG', layout: 'rows', weight: 2 },
    { len: 4, wheel: 'wheelS' },
    { len: 5, wheel: 'wheelG' },
    { len: 9, wheel: 'wheelL', layout: 'three', weight: 1 },
  ];
  shuffle(r, list);
  const out: CarSpec[] = [];
  const add = (o: Partial<CarSpec>) => {
    const c: CarSpec = { ...base, ...o };
    if (multi && c.len < 6) c.len += 2;
    if (rc.cargo.includes('big') && c.len < 6) c.len = 6;
    if (rc.cargo.includes('drops')) c.walls = 2;
    else if (needWalls && !c.basket) c.walls = 1;
    if (rc.jump) c.thr = 2;
    if (rc.mirror && wired) c.rev = true;
    if (!out.some((x) => JSON.stringify(x) === JSON.stringify(c))) out.push(c);
  };
  for (const p of rc.prefer ?? []) add(p);
  for (const o of list) add(o);
  // variantes: sem paredes para caixas, com caçamba para bola
  if (rc.cargo.length === 1 && rc.cargo[0] === 'ball') for (const o of list.slice(0, 4)) add({ ...o, basket: true, walls: 0 });
  if (!needWalls) for (const o of list.slice(0, 6)) add({ ...o, walls: 1 });
  for (const o of list.slice(0, 6)) add({ ...o, balloons: 2 });
  return out;
}

export interface GenOut {
  level: Omit<LevelDef, 'n'>;
  sol: Solution;
  tries: number;
  time: number;
}

/** a solução tem que passar no cenário nominal e com perturbações mínimas (outros motores JS arredondam diferente) */
const JITS = [0, 2e-6, -3e-6, 7e-6, -1.3e-5, 3e-5, -4.5e-5, 8e-5, 3e-6, -4e-6, 1e-5, -2e-5, 5e-5, 1.1e-6, -6e-6, 1.7e-5, -3.3e-5, 6e-5, -9e-5, 1.2e-4];
function robustRun(L: LevelDef, sol: Solution): { ok: boolean; time: number; flipped: boolean } {
  let first: { ok: boolean; time: number; flipped: boolean } | null = null;
  for (const j of JITS) {
    const r = quickRun(L, sol, 45, j);
    if (!r.ok) return r;
    first ??= r;
  }
  return first!;
}

function quickRun(L: LevelDef, sol: Solution, maxT = 45, jit = 0): { ok: boolean; time: number; flipped: boolean } {
  const r = quickRun0(L, sol, maxT, jit);
  return r;
}
function quickRun0(L: LevelDef, sol: Solution, maxT: number, jit: number): { ok: boolean; time: number; flipped: boolean } {
  const sim = new Sim(L, sol.parts, undefined, jit);
  let best = -1e9;
  let bestT = 0;
  while (!sim.result && sim.time < maxT) {
    applyCmd(sim, driveCmd(sol.drive, sim));
    sim.step();
    const p = sim.focus().x * sim.track.dir;
    if (p > best + 0.25) {
      best = p;
      bestT = sim.time;
    }
    if (sim.time - bestT > 7) break; // parado: desiste
  }
  // vidro: exige folga de 25% no limite de quebra (senão a solução fica na corda bamba)
  return { ok: !!sim.result && sim.result.win && sim.glassPeak < 0.75, time: sim.time, flipped: sim.flipped };
}

function genOne(slot: Exclude<Slot, number>): GenOut | null {
  const { ch, i, k } = slot;
  const wired = ch >= WIRED_FROM_CH && !(ch === 3 && false);
  let tries = 0;
  for (let attempt = 0; attempt < 6; attempt++) {
    const rc = recipe(ch, i, k + attempt * 1000);
    if (slot.tut) rc.prefer = [{ len: 5 }, { len: 5, wheel: 'wheelL' }];
    if (attempt >= 3) {
      // simplifica: tira o último obstáculo
      rc.segs = rc.segs.filter((s, j) => j < 2 || s[0] === 'f' || s[0] === 'zone' || j % 2 === 0);
    }
    const r = rngOf(31 + k * 131 + attempt);
    const allow = allowedParts(ch, i, !!rc.mirror);
    for (const car of carCandidates(r, rc, wired)) {
      const b = buildCar(car, rc.cargo);
      if (!b) continue;
      if (b.parts.some((p) => !allow.has(p.t))) continue;
      const tr = resolveTrack(rc.segs, b.grid[0] * U + 1.5, !!rc.mirror, !!rc.wet);
      for (const drive of drives(tr, wired, { jump: !!rc.jump, wait: !!rc.wait })) {
        tries++;
        const counts: Partial<Record<PartId, number>> = {};
        for (const p of b.parts) counts[p.t] = (counts[p.t] ?? 0) + 1;
        const L: LevelDef = { n: 0, grid: b.grid, parts: counts, cargo: b.cargo, track: rc.segs, goals: { time: 99, parts: 99 }, wired, mirror: rc.mirror, wet: rc.wet, need: rc.need };
        const sol: Solution = { parts: b.parts, drive: drive.length === 1 && drive[0][1] === 'F' && !drive[0][2] ? undefined : drive };
        if (validate(L, sol.parts)) continue;
        const res = robustRun(L, sol);
        if (!res.ok) continue;
        // fase final: peças = solução + sobras
        const parts = { ...counts };
        const tight = !!rc.tight;
        if (!tight) {
          parts.block = (parts.block ?? 0) + 1 + (k % 3);
          for (const dcy of rc.decoy ?? []) if (dcy !== 'block' && allow.has(dcy)) parts[dcy] = (parts[dcy] ?? 0) + 1;
          if (wired && !parts.btnR && ch >= 7) parts.btnR = 1;
        }
        const cost = partCost(b.parts);
        const level: Omit<LevelDef, 'n'> = {
          grid: b.grid,
          parts,
          cargo: b.cargo,
          track: rc.segs,
          goals: { time: Math.ceil(res.time * 1.25 + 1), parts: b.parts.length },
        };
        if (rc.budget) level.budget = Math.ceil((cost * 1.12) / 5) * 5;
        if (rc.need) level.need = rc.need;
        if (wired) level.wired = true;
        if (rc.mirror) level.mirror = true;
        if (rc.wet) level.wet = true;
        if (slot.tut) {
          level.tut = 4;
          level.pre = b.parts.filter((p) => p.t !== 'btn' && p.t !== 'btnR');
        }
        // confirma com as peças finais (sobras não podem quebrar a validação)
        const LF: LevelDef = { ...level, n: 0 };
        if (validate(LF, sol.parts)) continue;
        return { level, sol, tries, time: res.time };
      }
    }
  }
  return null;
}

export interface BakeEntry {
  n: number;
  level: Omit<LevelDef, 'n'> | null;
  sol: Solution | null;
  log: string;
}

/** gera as vagas dos capítulos pedidos (0..9); as clássicas não entram */
export function bakeChapters(chs: number[]): BakeEntry[] {
  const out: BakeEntry[] = [];
  plan().forEach((s, idx) => {
    const n = idx + 1;
    if (typeof s === 'number' || !chs.includes(s.ch)) return;
    const t0 = Date.now();
    const g = genOne(s);
    if (!g) {
      out.push({ n, level: null, sol: null, log: `FAIL ${n} (cap ${s.ch + 1} #${s.i})` });
      return;
    }
    out.push({ n, level: g.level, sol: g.sol, log: `ok ${n} cap${s.ch + 1} tries=${g.tries} t=${g.time.toFixed(1)} ${Date.now() - t0}ms parts=${g.sol.parts.length} ${g.level.cargo.map((c) => c.t).join('+')}` });
  });
  return out;
}

/** junta tudo na ordem do plano e marca as peças novas (intro) */
export function assemble(entries: BakeEntry[]): { data: (number | Omit<LevelDef, 'n'>)[]; sols: Record<number, Solution> } {
  const byN = new Map(entries.map((e) => [e.n, e]));
  const seen = new Set<PartId>();
  const data: (number | Omit<LevelDef, 'n'>)[] = [];
  const sols: Record<number, Solution> = {};
  plan().forEach((s, idx) => {
    const n = idx + 1;
    if (typeof s === 'number') {
      for (const p of Object.keys(CLASSIC[s - 1].parts) as PartId[]) seen.add(p);
      data.push(s);
      return;
    }
    const e = byN.get(n);
    if (!e || !e.level || !e.sol) throw new Error('fase ' + n + ' sem solução');
    const intro = (Object.keys(e.level.parts) as PartId[]).filter((p) => !seen.has(p));
    for (const p of intro) seen.add(p);
    data.push(intro.length ? { ...e.level, intro } : e.level);
    sols[n] = e.sol;
  });
  void CLASSIC_SOLUTIONS;
  return { data, sols };
}

export { canPlace };
