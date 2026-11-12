/* ============================================================
 *  BLOOP PINK — navegação em grade (A*) e "andadores" (Bloops de papel que seguem
 *  caminhos, desviam uns dos outros e olham para onde vão). O cérebro (cliente,
 *  funcionária) fica no modo de jogo; aqui só o corpo.
 * ============================================================ */
import * as THREE from 'three';
import type { FpBox } from '../../3d/fpkit';
import { PaperChar, type PaperSpec } from '../../3d/paper';

export class Nav {
  readonly cell = 0.25;
  readonly x0: number;
  readonly z0: number;
  readonly nx: number;
  readonly nz: number;
  private block: Uint8Array;
  constructor(x0: number, z0: number, x1: number, z1: number) {
    this.x0 = x0;
    this.z0 = z0;
    this.nx = Math.ceil((x1 - x0) / this.cell);
    this.nz = Math.ceil((z1 - z0) / this.cell);
    this.block = new Uint8Array(this.nx * this.nz);
  }
  /** refaz a grade a partir das caixas (inflando pelo raio) */
  rebuild(boxes: FpBox[], r = 0.28): void {
    this.block.fill(0);
    const c = this.cell;
    for (const b of boxes) {
      const i0 = Math.max(0, Math.floor((b.x0 - r - this.x0) / c));
      const i1 = Math.min(this.nx - 1, Math.floor((b.x1 + r - this.x0) / c));
      const j0 = Math.max(0, Math.floor((b.z0 - r - this.z0) / c));
      const j1 = Math.min(this.nz - 1, Math.floor((b.z1 + r - this.z0) / c));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.block[j * this.nx + i] = 1;
    }
  }
  ci(x: number): number {
    return Math.floor((x - this.x0) / this.cell);
  }
  cj(z: number): number {
    return Math.floor((z - this.z0) / this.cell);
  }
  free(i: number, j: number): boolean {
    return i >= 0 && j >= 0 && i < this.nx && j < this.nz && !this.block[j * this.nx + i];
  }
  freeAt(x: number, z: number): boolean {
    return this.free(this.ci(x), this.cj(z));
  }
  /** célula livre mais perto (espiral) */
  nearestFree(x: number, z: number): [number, number] {
    const i = this.ci(x);
    const j = this.cj(z);
    if (this.free(i, j)) return [i, j];
    for (let r = 1; r < 14; r++)
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          if (this.free(i + di, j + dj)) return [i + di, j + dj];
        }
    return [i, j];
  }
  /** A* (8 vizinhos, sem cortar quina) → pontos no mundo, suavizados */
  path(ax: number, az: number, bx: number, bz: number): THREE.Vector2[] | null {
    const [si, sj] = this.nearestFree(ax, az);
    const [ti, tj] = this.nearestFree(bx, bz);
    const N = this.nx * this.nz;
    const g = new Float32Array(N).fill(1e9);
    const from = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap: number[] = [];
    const f = new Float32Array(N);
    const s = sj * this.nx + si;
    const goal = tj * this.nx + ti;
    const hh = (i: number, j: number) => {
      const dx = Math.abs(i - ti);
      const dy = Math.abs(j - tj);
      return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
    };
    g[s] = 0;
    f[s] = hh(si, sj);
    heap.push(s);
    const push = (n: number) => {
      heap.push(n);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (f[heap[p]] <= f[heap[k]]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]];
        k = p;
      }
    };
    const pop = (): number => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = k * 2 + 1;
          const r = l + 1;
          let m = k;
          if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l;
          if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          k = m;
        }
      }
      return top;
    };
    let iter = 0;
    let found = false;
    while (heap.length && iter++ < 12000) {
      const cur = pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (cur === goal) {
        found = true;
        break;
      }
      const ci = cur % this.nx;
      const cj = (cur / this.nx) | 0;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = ci + di;
          const nj = cj + dj;
          if (!this.free(ni, nj)) continue;
          if (di && dj && (!this.free(ci + di, cj) || !this.free(ci, cj + dj))) continue;
          const n = nj * this.nx + ni;
          if (closed[n]) continue;
          const ng = g[cur] + (di && dj ? 1.414 : 1);
          if (ng < g[n]) {
            g[n] = ng;
            from[n] = cur;
            f[n] = ng + hh(ni, nj);
            push(n);
          }
        }
    }
    if (!found) return null;
    const cells: number[] = [];
    for (let c = goal; c !== -1; c = from[c]) cells.push(c);
    cells.reverse();
    const pts = cells.map((c) => new THREE.Vector2(this.x0 + ((c % this.nx) + 0.5) * this.cell, this.z0 + (((c / this.nx) | 0) + 0.5) * this.cell));
    // suaviza: pula pontos com linha de visão
    const out: THREE.Vector2[] = [];
    let k = 0;
    while (k < pts.length) {
      out.push(pts[k]);
      let far = k + 1;
      for (let q = Math.min(pts.length - 1, k + 24); q > k + 1; q--)
        if (this.los(pts[k], pts[q])) {
          far = q;
          break;
        }
      k = far;
    }
    out.push(new THREE.Vector2(bx, bz));
    return out;
  }
  private los(a: THREE.Vector2, b: THREE.Vector2): boolean {
    const d = a.distanceTo(b);
    const n = Math.ceil(d / (this.cell * 0.5));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (!this.freeAt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false;
    }
    return true;
  }
}

/** corpo andante: Bloop de papel seguindo um caminho */
export class Walker {
  readonly char: PaperChar;
  x: number;
  z: number;
  yaw = 0;
  speed = 1.25;
  path: THREE.Vector2[] = [];
  vel = 0;
  happy = false;
  act = -1;
  /** parado esperando (s) */
  wait = 0;
  /** visual para o grupo ("cor1|cor2|chapéu", coop.ts lookSpec) */
  look = '';
  constructor(spec: PaperSpec, x: number, z: number, radius = 0.36) {
    this.char = new PaperChar(spec, { radius, cell: 96, shadow: true });
    this.x = x;
    this.z = z;
    this.char.root.position.set(x, 0, z);
  }
  go(nav: Nav, x: number, z: number): boolean {
    const p = nav.path(this.x, this.z, x, z);
    if (!p) {
      this.path = [new THREE.Vector2(x, z)];
      return false;
    }
    this.path = p;
    return true;
  }
  get arrived(): boolean {
    return this.path.length === 0;
  }
  face(x: number, z: number): void {
    this.yaw = Math.atan2(x - this.x, z - this.z);
  }
  update(dt: number, cam: THREE.Camera, others: Walker[]): void {
    let moving = false;
    if (this.path.length && this.wait <= 0) {
      const t = this.path[0];
      const dx = t.x - this.x;
      const dz = t.y - this.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.12) this.path.shift();
      else {
        const sp = Math.min(this.speed, d / Math.max(dt, 1e-3));
        let mx = (dx / d) * sp * dt;
        let mz = (dz / d) * sp * dt;
        // desvio suave de quem está muito perto à frente
        for (const o of others) {
          if (o === this) continue;
          const ox = this.x - o.x;
          const oz = this.z - o.z;
          const od = Math.hypot(ox, oz);
          if (od > 0.01 && od < 0.55) {
            mx += (ox / od) * (0.55 - od) * dt * 2;
            mz += (oz / od) * (0.55 - od) * dt * 2;
          }
        }
        this.x += mx;
        this.z += mz;
        const want = Math.atan2(dx, dz);
        let dy = want - this.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        this.yaw += dy * Math.min(1, dt * 10);
        moving = true;
      }
    }
    if (this.wait > 0) this.wait -= dt;
    this.vel += ((moving ? this.speed : 0) - this.vel) * Math.min(1, dt * 8);
    this.char.root.position.set(this.x, 0, this.z);
    this.char.update(dt, cam, { yaw: this.yaw, speed: this.vel, act: this.act, happy: this.happy });
  }
  dispose(): void {
    this.char.dispose();
  }
}
