/* ============================================================
 *  CHÃO ANDÁVEL do cômodo 2D (festa, bichinho, convidados).
 *  Mesmas coordenadas do render-room: sala 360×420, parede até WALL_Y;
 *  móvel de chão = (x,y) no centro-frente da base, ocupa [x±w/2] × [y-fundo, y].
 *  Grade fina + A* (8 direções, sem cortar quina) + "puxar o barbante".
 *  Nada de alocação por frame: a grade só é refeita quando os móveis mudam.
 * ============================================================ */
import { furnById } from './catalog';
import { RH, RW, WALL_Y } from './render-room';

/** faixa do chão onde os PÉS podem ficar (o corpo desenha para cima) */
export const FLOOR_TOP = WALL_Y + 22;
export const FLOOR_BOT = RH - 4;
export const EDGE = 16;
/** folga do "pé" (sombra ≈ 18×6) em volta dos móveis */
const PAD_X = 16;
const PAD_Y = 6;
const CELL = 8;
const COLS = Math.ceil(RW / CELL);
const ROWS = Math.ceil((RH - WALL_Y) / CELL);

export interface NavItem {
  id: string;
  x: number;
  y: number;
}
/** fundo do móvel no chão (proporcional à altura, 12..34) */
export function footDepth(h: number): number {
  return Math.max(12, Math.min(34, h * 0.42));
}

export class NavGrid {
  /** retângulos já inflados: x0,y0,x1,y1 */
  private r: number[] = [];
  /** retângulos sem folga (para escolher lugares "na frente de") */
  base: { id: string; kind: string; x: number; y: number; w: number; h: number; x0: number; y0: number; x1: number; y1: number }[] = [];
  private blk = new Uint8Array(COLS * ROWS);
  private sig = '';
  // A*
  private g = new Float32Array(COLS * ROWS);
  private f = new Float32Array(COLS * ROWS);
  private from = new Int32Array(COLS * ROWS);
  private st = new Uint8Array(COLS * ROWS); // 0 novo, 1 aberto, 2 fechado
  private open: number[] = [];

  /** refaz se os móveis mudaram (assinatura barata). true = refez */
  update(items: readonly NavItem[]): boolean {
    let sig = '';
    for (const it of items) sig += it.id + ',' + Math.round(it.x) + ',' + Math.round(it.y) + ';';
    if (sig === this.sig) return false;
    this.sig = sig;
    this.r.length = 0;
    this.base.length = 0;
    for (const it of items) {
      const d = furnById(it.id);
      if (!d || d.wall || d.flat) continue;
      const dep = footDepth(d.h);
      const x0 = it.x - d.w / 2,
        x1 = it.x + d.w / 2,
        y0 = it.y - dep,
        y1 = it.y;
      this.base.push({ id: it.id, kind: d.kind, x: it.x, y: it.y, w: d.w, h: d.h, x0, y0, x1, y1 });
      this.r.push(x0 - PAD_X, y0 - PAD_Y, x1 + PAD_X, y1 + PAD_Y);
    }
    for (let j = 0; j < ROWS; j++)
      for (let i = 0; i < COLS; i++) this.blk[j * COLS + i] = this.free(i * CELL + CELL / 2, WALL_Y + j * CELL + CELL / 2) ? 0 : 1;
    return true;
  }
  /** o pé pode ficar aqui? (paredes + móveis) */
  free(x: number, y: number): boolean {
    if (x < EDGE || x > RW - EDGE || y < FLOOR_TOP || y > FLOOR_BOT) return false;
    const r = this.r;
    for (let k = 0; k < r.length; k += 4) if (x > r[k] && x < r[k + 2] && y > r[k + 1] && y < r[k + 3]) return false;
    return true;
  }
  /** segmento inteiro livre (amostra a cada 3 u) */
  clear(ax: number, ay: number, bx: number, by: number): boolean {
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 3));
    for (let i = 0; i <= n; i++) if (!this.free(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n)) return false;
    return true;
  }
  /** ponto livre mais perto (espiral em anéis) */
  nearestFree(x: number, y: number): [number, number] {
    x = Math.max(EDGE, Math.min(RW - EDGE, x));
    y = Math.max(FLOOR_TOP, Math.min(FLOOR_BOT, y));
    if (this.free(x, y)) return [x, y];
    for (let rad = 4; rad < 260; rad += 4) {
      const n = Math.max(8, Math.round(rad * 0.8));
      let best: [number, number] | null = null;
      let bd = 1e9;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const px = x + Math.cos(a) * rad,
          py = y + Math.sin(a) * rad * 0.7;
        if (!this.free(px, py)) continue;
        const d = Math.abs(py - y) * 1.2 + Math.abs(px - x);
        if (d < bd) (bd = d), (best = [px, py]);
      }
      if (best) return best;
    }
    return [RW / 2, FLOOR_BOT - 10];
  }
  private cell(x: number, y: number): number {
    const i = Math.max(0, Math.min(COLS - 1, Math.floor(x / CELL)));
    const j = Math.max(0, Math.min(ROWS - 1, Math.floor((y - WALL_Y) / CELL)));
    return j * COLS + i;
  }
  /**
   * Caminho de (sx,sy) até (tx,ty), ambos livres. Escreve pontos [x,y,...] em `out`
   * (sem o ponto de partida). false = sem caminho (out vazio).
   */
  path(sx: number, sy: number, tx: number, ty: number, out: number[]): boolean {
    out.length = 0;
    if (this.clear(sx, sy, tx, ty)) {
      out.push(tx, ty);
      return true;
    }
    const s = this.cell(sx, sy);
    let goal = this.cell(tx, ty);
    if (this.blk[goal]) {
      // ponto livre mas célula marcada (borda): usa a célula livre mais perto e termina nela
      const gi0 = goal % COLS,
        gj0 = (goal / COLS) | 0;
      let best = -1;
      for (let rr = 1; rr <= 3 && best < 0; rr++)
        for (let dj = -rr; dj <= rr; dj++)
          for (let di = -rr; di <= rr; di++) {
            const ni = gi0 + di,
              nj = gj0 + dj;
            if (ni < 0 || nj < 0 || ni >= COLS || nj >= ROWS || this.blk[nj * COLS + ni]) continue;
            if (best < 0) best = nj * COLS + ni;
          }
      if (best < 0) return false;
      goal = best;
      tx = (goal % COLS) * CELL + CELL / 2;
      ty = WALL_Y + ((goal / COLS) | 0) * CELL + CELL / 2;
    }
    const { g, f, from, st, open } = this;
    st.fill(0);
    open.length = 0;
    g[s] = 0;
    f[s] = 0;
    from[s] = -1;
    st[s] = 1;
    open.push(s);
    const gi = goal % COLS,
      gj = (goal / COLS) | 0;
    let found = false;
    while (open.length) {
      // menor f (lista pequena: busca linear basta)
      let bi = 0;
      for (let k = 1; k < open.length; k++) if (f[open[k]] < f[open[bi]]) bi = k;
      const cur = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      if (cur === goal) {
        found = true;
        break;
      }
      st[cur] = 2;
      const ci = cur % COLS,
        cj = (cur / COLS) | 0;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = ci + di,
            nj = cj + dj;
          if (ni < 0 || nj < 0 || ni >= COLS || nj >= ROWS) continue;
          const n = nj * COLS + ni;
          if (this.blk[n] || st[n] === 2) continue;
          if (di && dj && (this.blk[cj * COLS + ni] || this.blk[nj * COLS + ci])) continue; // sem cortar quina
          const ng = g[cur] + (di && dj ? 1.414 : 1);
          if (st[n] === 1 && ng >= g[n]) continue;
          g[n] = ng;
          const hx = Math.abs(ni - gi),
            hy = Math.abs(nj - gj);
          f[n] = ng + Math.max(hx, hy) + 0.414 * Math.min(hx, hy);
          from[n] = cur;
          if (st[n] !== 1) (st[n] = 1), open.push(n);
        }
    }
    if (!found) return false;
    // reconstrói (do fim para o começo) e alisa com linha de visão
    const pts: number[] = [];
    for (let c = from[goal]; c >= 0 && c !== s; c = from[c]) pts.push((c % COLS) * CELL + CELL / 2, WALL_Y + ((c / COLS) | 0) * CELL + CELL / 2);
    pts.reverse(); // agora y,x invertidos aos pares → corrige
    for (let k = 0; k < pts.length; k += 2) {
      const a = pts[k];
      pts[k] = pts[k + 1];
      pts[k + 1] = a;
    }
    pts.push(tx, ty);
    let ax = sx,
      ay = sy,
      k = 0;
    while (k < pts.length) {
      // pula até o ponto mais distante ainda visível
      let far = k;
      for (let m = pts.length - 2; m > k; m -= 2)
        if (this.clear(ax, ay, pts[m], pts[m + 1])) {
          far = m;
          break;
        }
      out.push(pts[far], pts[far + 1]);
      ax = pts[far];
      ay = pts[far + 1];
      k = far + 2;
    }
    return true;
  }
  /** ponto livre aleatório (perto de cx,cy num raio, se dado) */
  randomSpot(rnd: () => number, cx?: number, cy?: number, rad = 70): [number, number] {
    for (let k = 0; k < 30; k++) {
      const x = cx === undefined ? EDGE + rnd() * (RW - 2 * EDGE) : cx + (rnd() - 0.5) * 2 * rad;
      const y = cy === undefined ? FLOOR_TOP + rnd() * (FLOOR_BOT - FLOOR_TOP) : cy + (rnd() - 0.5) * 1.2 * rad;
      if (this.free(x, y)) return [x, y];
    }
    return this.nearestFree(cx ?? RW / 2, cy ?? (FLOOR_TOP + FLOOR_BOT) / 2);
  }
  /** portas: laterais do cômodo, no meio do chão (para quem entra/sai de outro cômodo) */
  door(side: -1 | 1): [number, number] {
    return this.nearestFree(side < 0 ? EDGE : RW - EDGE, (FLOOR_TOP + FLOOR_BOT) / 2 + 20);
  }
}
