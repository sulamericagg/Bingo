/* ============================================================
 *  BICHOS — A* barato numa grade em volta do bicho (sobre o mapa de
 *  alturas). Grade fixa (padrão 25×25 células de 2 m = raio 24 m),
 *  custo = distância + subida; células com água/ladeira demais são
 *  bloqueadas pelo `pass`. Buffers reaproveitados (zero lixo).
 * ============================================================ */

const MAXN = 41 * 41;
const gScore = new Float32Array(MAXN);
const fScore = new Float32Array(MAXN);
const came = new Int32Array(MAXN);
const hgt = new Float32Array(MAXN);
const state = new Uint8Array(MAXN); // 0 nunca visto, 1 aberto, 2 fechado, 3 bloqueado
const heap = new Int32Array(MAXN);
let heapN = 0;

function push(i: number): void {
  let k = heapN++;
  heap[k] = i;
  while (k > 0) {
    const p = (k - 1) >> 1;
    if (fScore[heap[p]] <= fScore[heap[k]]) break;
    const t = heap[p];
    heap[p] = heap[k];
    heap[k] = t;
    k = p;
  }
}
function pop(): number {
  const top = heap[0];
  heap[0] = heap[--heapN];
  let k = 0;
  for (;;) {
    const l = k * 2 + 1;
    const r = l + 1;
    let m = k;
    if (l < heapN && fScore[heap[l]] < fScore[heap[m]]) m = l;
    if (r < heapN && fScore[heap[r]] < fScore[heap[m]]) m = r;
    if (m === k) break;
    const t = heap[m];
    heap[m] = heap[k];
    heap[k] = t;
    k = m;
  }
  return top;
}

export interface PathQuery {
  /** altura do chão em (x,z) */
  height(x: number, z: number): number;
  /** a célula é andável? (água, construções) */
  pass(x: number, z: number, h: number): boolean;
  /** subida máxima entre células vizinhas (m) */
  maxStep: number;
}

/** estatística: nós expandidos no último caminho */
export let lastExpanded = 0;

/**
 * Caminho de (sx,sz) até (gx,gz). Devolve pontos [x0,z0,x1,z1,...] (sem o início)
 * ou null. Se o alvo estiver fora da grade, mira o ponto mais próximo da borda.
 */
export function findPath(sx: number, sz: number, gx: number, gz: number, q: PathQuery, radius = 24, cell = 2): number[] | null {
  const half = Math.min(20, Math.round(radius / cell));
  const N = half * 2 + 1;
  const ox = sx - half * cell;
  const oz = sz - half * cell;
  const clampI = (v: number) => (v < 0 ? 0 : v > N - 1 ? N - 1 : v);
  const gi = clampI(Math.round((gx - ox) / cell));
  const gj = clampI(Math.round((gz - oz) / cell));
  const goal = gj * N + gi;
  const start = half * N + half;
  state.fill(0, 0, N * N);
  heapN = 0;
  const h0 = q.height(sx, sz);
  hgt[start] = h0;
  state[start] = 1;
  gScore[start] = 0;
  fScore[start] = Math.hypot(gi - half, gj - half);
  came[start] = -1;
  push(start);
  let best = start;
  let bestH = fScore[start];
  let expanded = 0;
  while (heapN > 0 && expanded < 900) {
    const cur = pop();
    if (state[cur] === 2) continue;
    state[cur] = 2;
    expanded++;
    if (cur === goal) {
      best = cur;
      break;
    }
    const ci = cur % N;
    const cj = (cur / N) | 0;
    const ch = hgt[cur];
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di;
        const nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const n = nj * N + ni;
        const st = state[n];
        if (st >= 2) continue;
        const wx = ox + ni * cell;
        const wz = oz + nj * cell;
        if (st === 0) {
          const h = q.height(wx, wz);
          hgt[n] = h;
          if (!q.pass(wx, wz, h)) {
            state[n] = 3;
            continue;
          }
        }
        const dh = hgt[n] - ch;
        const diag = di && dj ? 1.4142 : 1;
        if (Math.abs(dh) > q.maxStep * diag) continue;
        const g = gScore[cur] + diag + Math.max(0, dh) * 0.6;
        if (st === 1 && g >= gScore[n]) continue;
        gScore[n] = g;
        const hh = Math.hypot(gi - ni, gj - nj);
        fScore[n] = g + hh;
        came[n] = cur;
        state[n] = 1;
        push(n);
        if (hh < bestH) {
          bestH = hh;
          best = n;
        }
      }
  }
  lastExpanded = expanded;
  if (best === start) return null;
  const pts: number[] = [];
  for (let c = best; c !== start && c >= 0; c = came[c]) pts.push(ox + (c % N) * cell, oz + ((c / N) | 0) * cell);
  // inverte em pares
  const out: number[] = [];
  for (let i = pts.length - 2; i >= 0; i -= 2) out.push(pts[i], pts[i + 1]);
  return out;
}
