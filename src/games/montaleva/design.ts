/* ============================================================
 *  MONTA & LEVA — projeto do veículo (grade, validação, grupos rígidos, desfazer/refazer).
 *  Sem DOM: usado pelo editor, pela física e pelo verificador de fases.
 * ============================================================ */
import { MOTOR_REACH, PARTS, cellsOf, footprint, fullSide, type PartId, type Placed } from './parts';
import type { CargoDef, LevelDef } from './levels';

const K = (x: number, y: number) => x * 1000 + y;
const DIRS: [number, number][] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

export function cargoCells(c: CargoDef): [number, number][] {
  const n = c.t === 'big' || c.t === 'drops' ? 2 : 1;
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out.push([c.x + i, c.y + j]);
  return out;
}

export type PlaceError = 'out' | 'busy' | 'cargo' | 'needBase' | 'mountBusy' | 'none' | 'budget' | 'hingeMount';

export interface Analysis {
  /** célula → índice da peça estrutural */
  struct: Map<number, number>;
  /** célula → índice da peça montada */
  mount: Map<number, number>;
  /** índice da peça → grupo rígido (peças struct não-dobradiça); -1 para as demais */
  group: number[];
  groups: number[][];
  /** pontos de conexão (meio da aresta compartilhada), em células */
  links: { x: number; y: number; vertical: boolean }[];
  /** dobradiça → grupos vizinhos */
  hinges: Map<number, number[]>;
  /** roda/propulsor/balão → peça base */
  base: Map<number, number>;
  /** roda → motores que a movem */
  power: Map<number, number[]>;
  /** motor → rodas que ele move */
  drives: Map<number, number[]>;
}

export function analyze(parts: readonly Placed[]): Analysis {
  const struct = new Map<number, number>();
  const mount = new Map<number, number>();
  parts.forEach((p, i) => {
    const L = PARTS[p.t].layer;
    for (const [x, y] of cellsOf(p)) (L === 'struct' ? struct : mount).set(K(x, y), i);
  });
  // union-find por peça
  const par = parts.map((_, i) => i);
  const find = (i: number): number => (par[i] === i ? i : (par[i] = find(par[i])));
  const links: Analysis['links'] = [];
  parts.forEach((p, i) => {
    if (PARTS[p.t].layer !== 'struct' || p.t === 'hinge') return;
    for (const [x, y] of cellsOf(p)) {
      for (let s = 0; s < 2; s++) {
        const [dx, dy] = DIRS[s];
        const j = struct.get(K(x + dx, y + dy));
        if (j === undefined || j === i) continue;
        const q = parts[j];
        if (q.t === 'hinge') continue;
        if (!fullSide(p, s) || !fullSide(q, s + 2)) continue;
        par[find(i)] = find(j);
        links.push({ x: x + 0.5 + dx * 0.5, y: y + 0.5 + dy * 0.5, vertical: s === 0 });
      }
    }
  });
  const group = parts.map(() => -1);
  const groups: number[][] = [];
  const gid = new Map<number, number>();
  parts.forEach((p, i) => {
    if (PARTS[p.t].layer !== 'struct' || p.t === 'hinge') return;
    const r = find(i);
    let g = gid.get(r);
    if (g === undefined) {
      g = groups.length;
      gid.set(r, g);
      groups.push([]);
    }
    group[i] = g;
    groups[g].push(i);
  });
  const hinges = new Map<number, number[]>();
  parts.forEach((p, i) => {
    if (p.t !== 'hinge') return;
    const gs: number[] = [];
    for (let s = 0; s < 4; s++) {
      const [dx, dy] = DIRS[s];
      const j = struct.get(K(p.x + dx, p.y + dy));
      if (j === undefined) continue;
      const q = parts[j];
      if (q.t === 'hinge' || !fullSide(q, (s + 2) % 4)) continue;
      if (!gs.includes(group[j])) gs.push(group[j]);
    }
    hinges.set(i, gs);
  });
  const base = new Map<number, number>();
  parts.forEach((p, i) => {
    if (PARTS[p.t].layer !== 'mount') return;
    const j = struct.get(K(p.x, p.y));
    if (j !== undefined) base.set(i, j);
  });
  const power = new Map<number, number[]>();
  const drives = new Map<number, number[]>();
  parts.forEach((m, mi) => {
    if (m.t !== 'motor') return;
    const list: number[] = [];
    parts.forEach((w, wi) => {
      if (!PARTS[w.t].radius) return;
      if (Math.max(Math.abs(w.x - m.x), Math.abs(w.y - m.y)) > MOTOR_REACH) return;
      list.push(wi);
      const pl = power.get(wi) ?? [];
      pl.push(mi);
      power.set(wi, pl);
    });
    drives.set(mi, list);
  });
  return { struct, mount, group, groups, links, hinges, base, power, drives };
}

export function partCost(parts: readonly Placed[]): number {
  return parts.reduce((s, p) => s + PARTS[p.t].cost, 0);
}

export function countOf(parts: readonly Placed[], t: PartId): number {
  let n = 0;
  for (const p of parts) if (p.t === t) n++;
  return n;
}

/** Pode colocar `p` no projeto (ignorando a peça `skip`, quando é um movimento)? */
export function canPlace(level: LevelDef, parts: readonly Placed[], p: Placed, skip = -1): PlaceError | null {
  const [W, H] = level.grid;
  const cells = cellsOf(p);
  for (const [x, y] of cells) if (x < 0 || y < 0 || x >= W || y >= H) return 'out';
  const blocked = new Set<number>();
  for (const c of level.cargo) for (const [x, y] of cargoCells(c)) blocked.add(K(x, y));
  for (const [x, y] of cells) if (blocked.has(K(x, y))) return 'cargo';
  if (p.t === 'basket') {
    // as bordas sobem meia casa acima das pontas
    if (blocked.has(K(p.x, p.y + 1)) || blocked.has(K(p.x + 2, p.y + 1))) return 'cargo';
  }
  const rad = PARTS[p.t].radius;
  if (rad) {
    // a roda não pode invadir a carga
    const rr = rad / 0.5 + 0.01;
    const cx = p.x + 0.5;
    const cy = p.y + 0.5;
    for (const cg of level.cargo)
      for (const [x, y] of cargoCells(cg)) {
        const nx = Math.max(x + 0.04, Math.min(cx, x + 0.96));
        const ny = Math.max(y + 0.04, Math.min(cy, y + 0.96));
        if (Math.hypot(nx - cx, ny - cy) < rr) return 'cargo';
      }
  }
  const others = parts.filter((_, i) => i !== skip);
  const a = analyze(others);
  if (PARTS[p.t].layer === 'struct') {
    for (const [x, y] of cells) if (a.struct.has(K(x, y))) return 'busy';
  } else {
    const j = a.struct.get(K(p.x, p.y));
    if (j === undefined) return 'needBase';
    if (others[j].t === 'hinge') return 'hingeMount';
    if (a.mount.has(K(p.x, p.y))) return 'mountBusy';
  }
  if (skip < 0) {
    const lim = level.parts[p.t] ?? 0;
    if (countOf(others, p.t) >= lim) return 'none';
    if (level.budget && partCost(others) + PARTS[p.t].cost > level.budget) return 'budget';
  }
  return null;
}

/** Células onde dá para encaixar o tipo `t` (para os pontinhos de encaixe). */
export function snapCells(level: LevelDef, parts: readonly Placed[], t: PartId, r: number, skip = -1): [number, number][] {
  const out: [number, number][] = [];
  const [W, H] = level.grid;
  const a = analyze(parts.filter((_, i) => i !== skip));
  const struct = PARTS[t].layer === 'struct';
  const hasAny = parts.some((q, i) => i !== skip && PARTS[q.t].layer === 'struct');
  for (let x = 0; x < W; x++)
    for (let y = 0; y < H; y++) {
      const p = { t, x, y, r };
      if (canPlace(level, parts, p, skip >= 0 ? skip : -2) !== null) continue;
      if (struct && hasAny) {
        // só destaca as que encostam na estrutura (encaixe magnético)
        const touch = cellsOf(p).some(([cx, cy]) => DIRS.some(([dx, dy]) => a.struct.has(K(cx + dx, cy + dy))));
        if (!touch) continue;
      }
      out.push([x, y]);
    }
  return out;
}

/** Remove a peça i e o que estava montado nela. Devolve a nova lista. */
export function removeAt(parts: readonly Placed[], i: number): Placed[] {
  const p = parts[i];
  const out = parts.filter((_, j) => j !== i);
  if (PARTS[p.t].layer !== 'struct') return out;
  const cells = new Set(cellsOf(p).map(([x, y]) => K(x, y)));
  return out.filter((q) => !(PARTS[q.t].layer === 'mount' && cells.has(K(q.x, q.y))));
}

/** Peça em uma célula (prefere a montada, que fica por cima). */
export function partAt(parts: readonly Placed[], x: number, y: number): number {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (PARTS[p.t].layer === 'mount' && p.x === x && p.y === y) return i;
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    if (cellsOf(parts[i]).some(([cx, cy]) => cx === x && cy === y) && PARTS[parts[i].t].layer === 'struct') return i;
  }
  return -1;
}

/** Histórico simples de projetos (desfazer/refazer). */
export class History {
  private past: string[] = [];
  private future: string[] = [];
  constructor(public parts: Placed[]) {}
  commit(next: Placed[]): void {
    this.past.push(JSON.stringify(this.parts));
    if (this.past.length > 80) this.past.shift();
    this.future = [];
    this.parts = next;
  }
  undo(): boolean {
    const s = this.past.pop();
    if (!s) return false;
    this.future.push(JSON.stringify(this.parts));
    this.parts = JSON.parse(s);
    return true;
  }
  redo(): boolean {
    const s = this.future.pop();
    if (!s) return false;
    this.past.push(JSON.stringify(this.parts));
    this.parts = JSON.parse(s);
    return true;
  }
  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }
}

/** normaliza a rotação para o número de rotações distintas da peça */
export function normRot(t: PartId, r: number): number {
  const n = PARTS[t].rots;
  return ((r % n) + n) % n;
}

export { footprint };
