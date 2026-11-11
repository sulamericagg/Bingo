/* ============================================================
 *  BLOOP NO LUGAR — motor do quebra-cabeça (puro, sem DOM).
 *
 *  Regras (família clássica de domínio público): grade N×N dividida em N regiões coloridas.
 *  Exatamente um Bloop por linha, por coluna e por região; dois Bloops nunca se encostam
 *  (nem na diagonal).
 *
 *  - generate(n, seed): gerador determinístico (mesma semente = mesma fase em todo aparelho).
 *    Sorteia uma solução válida, cresce N regiões a partir dela e "lapida" as regiões até a
 *    solução ser ÚNICA (busca exata), depois exige que o solucionador lógico resolva sem chute.
 *  - Logic + nextStep(): solucionador por técnicas humanas, em ordem de dificuldade; cada passo
 *    traz o porquê (unidades/casas em foco) para virar dica em português.
 *  - rate(): nota de dificuldade pelas técnicas exigidas.
 * ============================================================ */

export type Tech = 'basic' | 'single' | 'confine' | 'touch' | 'group2' | 'group3' | 'group4' | 'trial';
export const TECH_W: Record<Tech, number> = { basic: 0, single: 1, confine: 2, touch: 3, group2: 4, group3: 5, group4: 6, trial: 8 };
export const TECHS: Tech[] = ['basic', 'single', 'confine', 'touch', 'group2', 'group3', 'group4', 'trial'];

/** Unidades: 0..n-1 = linhas, n..2n-1 = colunas, 2n..3n-1 = regiões. */
export interface Step {
  tech: Tech;
  /** casa onde o Bloop vai (técnica 'single') */
  place?: number;
  /** casas que viram X */
  elim: number[];
  /** casas destacadas (o motivo) */
  focus: number[];
  /** unidade principal (single/confine/touch/trial) */
  unit?: number;
  /** grupo: as k unidades de origem e as k unidades de destino */
  from?: number[];
  to?: number[];
  /** casa testada (touch/trial) ou Bloop de origem (basic) */
  cell?: number;
}

export interface Rating {
  solved: boolean;
  /** técnica mais difícil exigida */
  max: Tech;
  /** nota contínua (maior = mais difícil) */
  score: number;
  /** 0 Fácil · 1 Médio · 2 Difícil · 3 Expert · 4 Mestre */
  tier: number;
  steps: number;
  counts: Partial<Record<Tech, number>>;
}

export interface Puzzle {
  n: number;
  seed: number;
  /** região de cada casa (r*n+c) */
  reg: Uint8Array;
  /** coluna do Bloop em cada linha */
  sol: number[];
  rating: Rating;
}

/* ------------------------------ aleatório ------------------------------ */
export function mulberry(a: number): () => number {
  a >>>= 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash32(...xs: number[]): number {
  let h = 0x811c9dc5;
  for (const x of xs) {
    h ^= x >>> 0;
    h = Math.imul(h, 0x01000193);
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
  }
  return h >>> 0;
}
function shuffle<T>(a: T[], rng: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const popcount = (x: number): number => {
  let c = 0;
  while (x) {
    x &= x - 1;
    c++;
  }
  return c;
};

/* ------------------------------ geometria (cache por n) ------------------------------ */
interface Geo {
  n: number;
  nn: number;
  /** vizinhos 8 */
  nb8: number[][];
  /** vizinhos 4 */
  nb4: number[][];
}
const geoCache = new Map<number, Geo>();
export function geo(n: number): Geo {
  let g = geoCache.get(n);
  if (g) return g;
  const nn = n * n;
  const nb8: number[][] = [];
  const nb4: number[][] = [];
  for (let c = 0; c < nn; c++) {
    const r = (c / n) | 0;
    const k = c % n;
    const a: number[] = [];
    const b: number[] = [];
    for (let dr = -1; dr <= 1; dr++)
      for (let dk = -1; dk <= 1; dk++) {
        if (!dr && !dk) continue;
        const rr = r + dr;
        const kk = k + dk;
        if (rr < 0 || kk < 0 || rr >= n || kk >= n) continue;
        a.push(rr * n + kk);
        if (!dr || !dk) b.push(rr * n + kk);
      }
    nb8.push(a);
    nb4.push(b);
  }
  g = { n, nn, nb8, nb4 };
  geoCache.set(n, g);
  return g;
}

/* ------------------------------ estado lógico ------------------------------ */
export const UNK = 0;
export const XX = 1;
export const QQ = 2;

export class Logic {
  readonly n: number;
  readonly reg: Uint8Array;
  readonly st: Uint8Array;
  /** casas de cada unidade */
  readonly units: number[][];
  /** contradição detectada (unidade sem lugar / Bloops se atacando) */
  bad = -1;
  constructor(n: number, reg: Uint8Array, st?: Uint8Array, units?: number[][]) {
    this.n = n;
    this.reg = reg;
    this.st = st ? st.slice() : new Uint8Array(n * n);
    if (units) this.units = units;
    else {
      const u: number[][] = [];
      for (let i = 0; i < 3 * n; i++) u.push([]);
      for (let c = 0; c < n * n; c++) {
        u[(c / n) | 0].push(c);
        u[n + (c % n)].push(c);
        u[2 * n + reg[c]].push(c);
      }
      this.units = u;
    }
  }
  clone(): Logic {
    const l = new Logic(this.n, this.reg, this.st, this.units);
    l.bad = this.bad;
    return l;
  }
  unitsOf(c: number): [number, number, number] {
    const n = this.n;
    return [(c / n) | 0, n + (c % n), 2 * n + this.reg[c]];
  }
  /** casas eliminadas por um Bloop em c (linha, coluna, região e vizinhos) */
  zone(c: number): number[] {
    const out = new Set<number>();
    for (const u of this.unitsOf(c)) for (const d of this.units[u]) if (d !== c) out.add(d);
    for (const d of geo(this.n).nb8[c]) out.add(d);
    return [...out];
  }
  inZone(c: number, d: number): boolean {
    if (c === d) return false;
    const n = this.n;
    const r1 = (c / n) | 0;
    const r2 = (d / n) | 0;
    const k1 = c % n;
    const k2 = d % n;
    if (r1 === r2 || k1 === k2 || this.reg[c] === this.reg[d]) return true;
    return Math.abs(r1 - r2) <= 1 && Math.abs(k1 - k2) <= 1;
  }
  queenIn(u: number): number {
    for (const c of this.units[u]) if (this.st[c] === QQ) return c;
    return -1;
  }
  /** candidatas da unidade (vazio se já tem Bloop) */
  cands(u: number): number[] {
    const out: number[] = [];
    for (const c of this.units[u]) {
      if (this.st[c] === QQ) return [];
      if (this.st[c] === UNK) out.push(c);
    }
    return out;
  }
  place(c: number): void {
    if (this.st[c] === XX) this.bad = c;
    this.st[c] = QQ;
    for (const d of this.zone(c)) {
      if (this.st[d] === QQ) this.bad = d;
      else this.st[d] = XX;
    }
  }
  queens(): number {
    let q = 0;
    for (let i = 0; i < this.st.length; i++) if (this.st[i] === QQ) q++;
    return q;
  }
  solved(): boolean {
    return this.bad < 0 && this.queens() === this.n;
  }
  /** -1 = ok; senão a unidade que ficou sem lugar */
  deadUnit(): number {
    for (let u = 0; u < this.units.length; u++) {
      let ok = false;
      for (const c of this.units[u])
        if (this.st[c] !== XX) {
          ok = true;
          break;
        }
      if (!ok) return u;
    }
    return -1;
  }
  apply(s: Step): void {
    if (s.place !== undefined) this.place(s.place);
    for (const c of s.elim) if (this.st[c] === UNK) this.st[c] = XX;
  }
}

/* ------------------------------ técnicas ------------------------------ */

/** Bloops já postos com casas da zona ainda livres (só aparece no tabuleiro do jogador) */
function findBasic(L: Logic): Step | null {
  for (let c = 0; c < L.st.length; c++) {
    if (L.st[c] !== QQ) continue;
    const elim = L.zone(c).filter((d) => L.st[d] === UNK);
    if (elim.length) return { tech: 'basic', elim, focus: [c], cell: c };
  }
  return null;
}

function findSingle(L: Logic): Step | null {
  const n = L.n;
  // regiões primeiro (é o que a pessoa enxerga primeiro), depois linhas e colunas
  for (const base of [2 * n, 0, n])
    for (let u = base; u < base + n; u++) {
      if (L.queenIn(u) >= 0) continue;
      const cs = L.cands(u);
      if (cs.length === 1) return { tech: 'single', place: cs[0], elim: [], focus: [...L.units[u]], unit: u };
    }
  return null;
}

/** máscara das unidades (do tipo `toBase`) que as candidatas de u tocam */
function spanMask(L: Logic, u: number, toBase: number): number {
  const n = L.n;
  let m = 0;
  for (const c of L.units[u]) {
    if (L.st[c] !== UNK) continue;
    const t = toBase === 0 ? (c / n) | 0 : toBase === n ? c % n : L.reg[c];
    m |= 1 << t;
  }
  return m;
}

/** k unidades do tipo A cujas candidatas cabem em exatamente k unidades do tipo B → o resto de B sai */
function findGroup(L: Logic, k: number, pairs: [number, number][]): Step | null {
  const n = L.n;
  for (const [aBase, bBase] of pairs) {
    const open: number[] = [];
    const masks: number[] = [];
    for (let i = 0; i < n; i++) {
      const u = aBase + i;
      if (L.queenIn(u) >= 0) continue;
      const m = spanMask(L, u, bBase);
      if (!m) continue;
      open.push(u);
      masks.push(m);
    }
    if (open.length <= k) continue;
    const pick: number[] = [];
    const rec = (start: number, acc: number): Step | null => {
      if (pick.length === k) {
        if (popcount(acc) !== k) return null;
        const elim: number[] = [];
        const focus: number[] = [];
        const to: number[] = [];
        const inA = new Set(pick.map((i) => open[i]));
        for (let b = 0; b < n; b++) {
          if (!(acc & (1 << b))) continue;
          to.push(bBase + b);
          for (const c of L.units[bBase + b]) {
            if (L.st[c] !== UNK) continue;
            const ua = aBase === 0 ? (c / n) | 0 : aBase === n ? n + (c % n) : 2 * n + L.reg[c];
            if (!inA.has(ua)) elim.push(c);
          }
        }
        if (!elim.length) return null;
        for (const u of inA) for (const c of L.units[u]) focus.push(c);
        return { tech: k === 1 ? 'confine' : k === 2 ? 'group2' : k === 3 ? 'group3' : 'group4', elim, focus, from: [...inA], to };
      }
      for (let i = start; i < open.length; i++) {
        const a2 = acc | masks[i];
        if (popcount(a2) > k) continue;
        pick.push(i);
        const s = rec(i + 1, a2);
        pick.pop();
        if (s) return s;
      }
      return null;
    };
    const s = rec(0, 0);
    if (s) return s;
  }
  return null;
}

function confinePairs(n: number): [number, number][] {
  return [
    [2 * n, 0],
    [2 * n, n],
    [0, 2 * n],
    [n, 2 * n],
  ];
}
function groupPairs(n: number): [number, number][] {
  return [...confinePairs(n), [0, n], [n, 0]];
}

/** casa c sai se um Bloop nela deixaria alguma unidade sem lugar */
function findTouch(L: Logic): Step | null {
  const n = L.n;
  const nU = 3 * n;
  const cand: number[][] = [];
  for (let u = 0; u < nU; u++) cand.push(L.queenIn(u) >= 0 ? [] : L.cands(u));
  // unidades pequenas primeiro: a explicação fica mais clara
  const order = [...Array(nU).keys()].filter((u) => cand[u].length > 0).sort((a, b) => cand[a].length - cand[b].length);
  for (const u of order) {
    const cs = cand[u];
    // casas que atacam TODAS as candidatas de u: interseção das zonas
    let common: Set<number> | null = null;
    for (const c of cs) {
      const z = new Set(L.zone(c).filter((d) => L.st[d] === UNK && !L.units[u].includes(d)));
      if (!common) common = z;
      else for (const d of common) if (!z.has(d)) common.delete(d);
      if (!common.size) break;
    }
    if (common && common.size) {
      const elim = [...common].sort((a, b) => a - b);
      return { tech: 'touch', elim, focus: cs, unit: u, cell: elim[0] };
    }
  }
  return null;
}

/** testa cada casa: se pôr um Bloop leva a contradição (com técnicas simples), ela sai */
function findTrial(L: Logic): Step | null {
  for (let c = 0; c < L.st.length; c++) {
    if (L.st[c] !== UNK) continue;
    const T = L.clone();
    T.place(c);
    let dead = T.bad >= 0 ? T.unitsOf(T.bad)[0] : T.deadUnit();
    for (let it = 0; dead < 0 && it < 60; it++) {
      const s = findSingle(T) ?? findGroup(T, 1, confinePairs(T.n)) ?? findTouch(T);
      if (!s) break;
      T.apply(s);
      dead = T.bad >= 0 ? T.unitsOf(T.bad)[0] : T.deadUnit();
    }
    if (dead >= 0) return { tech: 'trial', elim: [c], focus: [...L.units[dead]], unit: dead, cell: c };
  }
  return null;
}

/** próximo passo lógico (o mais fácil disponível) */
export function nextStep(L: Logic, maxTech: Tech = 'trial'): Step | null {
  const mw = TECH_W[maxTech];
  const n = L.n;
  const b = findBasic(L);
  if (b) return b;
  const s = findSingle(L);
  if (s) return s;
  if (mw < 2) return null;
  const c = findGroup(L, 1, confinePairs(n));
  if (c) return c;
  if (mw < 3) return null;
  const t = findTouch(L);
  if (t) return t;
  for (let k = 2; k <= 4; k++) {
    if (mw < TECH_W[k === 2 ? 'group2' : k === 3 ? 'group3' : 'group4']) return null;
    const g = findGroup(L, k, groupPairs(n));
    if (g) return g;
  }
  if (mw < 8) return null;
  return findTrial(L);
}

/** resolve só com lógica; nota de dificuldade */
export function rate(n: number, reg: Uint8Array, maxTech: Tech = 'trial'): Rating {
  const L = new Logic(n, reg);
  const counts: Partial<Record<Tech, number>> = {};
  let max: Tech = 'single';
  let steps = 0;
  let score = 0;
  while (!L.solved()) {
    if (L.bad >= 0 || L.deadUnit() >= 0) break;
    const s = nextStep(L, maxTech);
    if (!s) break;
    L.apply(s);
    steps++;
    counts[s.tech] = (counts[s.tech] ?? 0) + 1;
    if (TECH_W[s.tech] > TECH_W[max]) max = s.tech;
    const w = TECH_W[s.tech];
    score += w >= 3 ? w * w * 0.5 : w * 0.25;
  }
  const solved = L.solved();
  const mw = TECH_W[max];
  const tier = mw <= 2 ? 0 : mw === 3 ? ((counts.touch ?? 0) >= 4 ? 1 : 1) : mw === 4 ? 2 : mw <= 6 ? 3 : 4;
  score += mw * 10 + n * 1.5;
  return { solved, max, score: Math.round(score * 10) / 10, tier, steps, counts };
}

/* ------------------------------ busca exata ------------------------------ */

/** Até `limit` soluções (cada uma = coluna por linha). */
export function solveExact(n: number, reg: Uint8Array, limit = 2): number[][] {
  const out: number[][] = [];
  const cur: number[] = [];
  // poda: cada região ainda livre precisa ter casa nas linhas restantes
  const regRowsBelow: number[][] = []; // regRowsBelow[r][g] = 1 se a região g tem casa na linha >= r
  for (let r = n; r >= 0; r--) {
    const a = new Array(n).fill(0);
    if (r < n) {
      for (let g = 0; g < n; g++) a[g] = regRowsBelow[0]?.[g] ?? 0;
      for (let k = 0; k < n; k++) a[reg[r * n + k]] = 1;
    }
    regRowsBelow.unshift(a);
  }
  const rec = (r: number, cols: number, regs: number, prev: number): boolean => {
    if (r === n) {
      out.push(cur.slice());
      return out.length >= limit;
    }
    // podar: regiões não usadas que não existem mais abaixo
    const below = regRowsBelow[r];
    for (let g = 0; g < n; g++) if (!(regs & (1 << g)) && !below[g]) return false;
    for (let k = 0; k < n; k++) {
      if (cols & (1 << k)) continue;
      if (prev >= 0 && Math.abs(k - prev) < 2) continue;
      const g = reg[r * n + k];
      if (regs & (1 << g)) continue;
      cur[r] = k;
      if (rec(r + 1, cols | (1 << k), regs | (1 << g), k)) return true;
    }
    return false;
  };
  rec(0, 0, 0, -1);
  return out;
}

/* ------------------------------ gerador ------------------------------ */

function randomSolution(n: number, rng: () => number): number[] {
  const cur: number[] = [];
  const rec = (r: number, used: number): boolean => {
    if (r === n) return true;
    const order = shuffle([...Array(n).keys()], rng);
    for (const k of order) {
      if (used & (1 << k)) continue;
      if (r > 0 && Math.abs(k - cur[r - 1]) < 2) continue;
      cur[r] = k;
      if (rec(r + 1, used | (1 << k))) return true;
    }
    return false;
  };
  rec(0, 0);
  return cur;
}

function growRegions(n: number, sol: number[], rng: () => number, style: number): Uint8Array {
  const { nn, nb4 } = geo(n);
  const reg = new Uint8Array(nn).fill(255);
  const app: number[] = [];
  for (let r = 0; r < n; r++) {
    reg[r * n + sol[r]] = r;
    // apetite: variância maior = regiões de tamanhos bem diferentes (algumas minúsculas)
    const v = rng();
    app.push(style === 0 ? 0.15 + v * v * 3 : style === 1 ? 0.5 + v * 1.5 : 0.05 + Math.pow(v, 3) * 4);
  }
  let left = nn - n;
  const frontier = (g: number): number[] => {
    const f: number[] = [];
    for (let c = 0; c < nn; c++) if (reg[c] === g) for (const d of nb4[c]) if (reg[d] === 255) f.push(d);
    return f;
  };
  while (left > 0) {
    let tot = 0;
    for (let g = 0; g < n; g++) tot += app[g];
    let x = rng() * tot;
    let g = 0;
    for (; g < n - 1; g++) {
      x -= app[g];
      if (x <= 0) break;
    }
    const f = frontier(g);
    if (!f.length) {
      app[g] = 0;
      if (app.every((a) => a === 0)) {
        // sobrou casa isolada (não deve acontecer): agrega ao vizinho
        for (let c = 0; c < nn; c++) if (reg[c] === 255) for (const d of nb4[c]) if (reg[d] !== 255) reg[c] = reg[d];
        break;
      }
      continue;
    }
    // prefere casas que encostam mais na própria região (formas mais "gordinhas") no estilo 1
    let pick = f[Math.floor(rng() * f.length)];
    if (style === 1 && rng() < 0.6) {
      let best = -1;
      for (const c of f) {
        const s = nb4[c].filter((d) => reg[d] === g).length + rng();
        if (s > best) {
          best = s;
          pick = c;
        }
      }
    }
    reg[pick] = g;
    left--;
  }
  return reg;
}

function connectedWithout(n: number, reg: Uint8Array, g: number, skip: number): boolean {
  const { nn, nb4 } = geo(n);
  let start = -1;
  let size = 0;
  for (let c = 0; c < nn; c++)
    if (reg[c] === g && c !== skip) {
      size++;
      if (start < 0) start = c;
    }
  if (start < 0) return false;
  const seen = new Uint8Array(nn);
  const st = [start];
  seen[start] = 1;
  let cnt = 0;
  while (st.length) {
    const c = st.pop()!;
    cnt++;
    for (const d of nb4[c]) if (!seen[d] && d !== skip && reg[d] === g) (seen[d] = 1), st.push(d);
  }
  return cnt === size;
}

/** lapida as regiões até a solução `sol` ser a única */
function makeUnique(n: number, reg: Uint8Array, sol: number[], rng: () => number): boolean {
  const { nb4 } = geo(n);
  const solCells = new Set(sol.map((k, r) => r * n + k));
  for (let it = 0; it < 120; it++) {
    const sols = solveExact(n, reg, 3);
    const other = sols.find((s) => s.some((k, r) => k !== sol[r]));
    if (!other) return true;
    const cells = shuffle(
      other.map((k, r) => r * n + k).filter((c) => !solCells.has(c)),
      rng,
    );
    let moved = false;
    for (const c of cells) {
      const g = reg[c];
      const opts = shuffle(
        [...new Set(nb4[c].map((d) => reg[d]))].filter((h) => h !== g),
        rng,
      );
      if (!opts.length || !connectedWithout(n, reg, g, c)) continue;
      reg[c] = opts[0];
      moved = true;
      break;
    }
    if (!moved) return false;
  }
  return false;
}

export interface GenOptions {
  /** técnica mais difícil permitida (padrão: trial) */
  maxTech?: Tech;
}

/** Fase determinística para (n, seed). */
export function generate(n: number, seed: number, o: GenOptions = {}): Puzzle {
  const rng = mulberry(hash32(n, seed, 0x51ab));
  for (let attempt = 0; attempt < 400; attempt++) {
    const sol = randomSolution(n, rng);
    const style = Math.floor(rng() * 3);
    const reg = growRegions(n, sol, rng, style);
    if (!makeUnique(n, reg, sol, rng)) continue;
    const rating = rate(n, reg, o.maxTech ?? 'trial');
    if (!rating.solved) continue;
    // cores embaralhadas (a cor não entrega a linha da solução)
    const perm = shuffle([...Array(n).keys()], rng);
    const out = new Uint8Array(n * n);
    for (let c = 0; c < n * n; c++) out[c] = perm[reg[c]];
    return { n, seed, reg: out, sol, rating };
  }
  throw new Error(`lugar: sem fase para n=${n} seed=${seed}`);
}

/** Fase a partir de um texto compacto (regiões em base36) — usado em testes/compartilhar. */
export function encodeRegions(p: { n: number; reg: Uint8Array }): string {
  return [...p.reg].map((g) => g.toString(36)).join('');
}
