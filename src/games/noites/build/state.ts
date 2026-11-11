/* ============================================================
 *  NOITES · CONSTRUÇÃO — estado autoritativo (roda no host/solo;
 *  o convidado só espelha). Sem three/DOM.
 *   - peças na grade (CELL) ou livres (decoração);
 *   - ligações automáticas por máscara de vizinhos;
 *   - colisão AABB (jogadores e Sombrinhas), portão só para amigos;
 *   - Sombrinhas contornam (deslizam) e, presas, atacam;
 *   - rede compacta (lista completa só quando muda; vida em delta);
 *   - salvar/carregar.
 * ============================================================ */
import { BENCH_POS, CDEFS, CK } from '../data';
import type { Creature, LightSrc, Player, Sim } from '../sim';
import { NODE_R, treeR } from '../world';
import { BUILD_R, CELL, DIRS, E, LINE_MAX, N, PIECE, PIECES, REACH, S, W, byIdx, refundOf, repairOf, type PieceDef } from './pieces';
import { benchLevel, canAfford, give, missing, pay } from './res';

export interface BPiece {
  id: number;
  /** índice da peça (PIECES) */
  k: number;
  x: number;
  z: number;
  /** rotação em oitavos de volta (0..7); na grade só pares */
  ro: number;
  hp: number;
  /** 1 = livre (fora da grade) */
  f: number;
}

/** ação de rede/local: o = p(ôr) | d(esmontar) | f(consertar) | u(melhorar); c = [x*10, z*10, ...] */
export type BuildAction = { a: 'build'; o: 'p' | 'd' | 'f' | 'u'; k?: number; c: number[]; r?: number; f?: number };

export type Reason = '' | 'far' | 'fire' | 'edge' | 'occ' | 'block' | 'crowd' | 'tier' | 'res' | 'none' | 'full';

const KEY_OFF = 512;
export const cellOf = (v: number) => Math.round(v / CELL);
export const keyOf = (cx: number, cz: number) => (cx + KEY_OFF) * 1024 + (cz + KEY_OFF);
const q10 = (v: number) => Math.round(v * 10);

/** dano por segundo de cada Sombrinha numa construção */
const DPS: Record<number, number> = { [CK.Small]: 0.9, [CK.Hopper]: 0.7, [CK.Big]: 2.6, [CK.Mist]: 1.1, [CK.King]: 9 };

interface Contact {
  t: number;
  /** tempo sem encostar */
  off: number;
  /** lado do contorno (+1/−1) */
  side: number;
}

export class BuildState {
  pieces: BPiece[] = [];
  /** grade → peça */
  byCell = new Map<number, BPiece>();
  /** versão estrutural (pôr/tirar/trocar) */
  ver = 0;
  /** versão da vida (dano/conserto) */
  hpVer = 0;
  private nextId = 1;
  private boxes = new Map<number, number[]>();
  private boxVer = -1;
  private contact = new Map<number, Contact>();
  private hpDirty = new Set<number>();
  private hitT = new Map<number, number>();
  private net = new WeakMap<object, { ver: number }>();
  private chestT = 0;

  constructor(private sim: Sim) {}

  def(p: BPiece): PieceDef {
    return PIECES[p.k] ?? PIECES[0];
  }
  get(id: number): BPiece | undefined {
    return this.pieces.find((p) => p.id === id);
  }
  /** peça da célula (grade) */
  atCell(cx: number, cz: number): BPiece | undefined {
    return this.byCell.get(keyOf(cx, cz));
  }
  /** peça no ponto: célula da grade ou peça livre mais perto (≤ 0,9 m) */
  pieceAt(x: number, z: number): BPiece | undefined {
    const g = this.atCell(cellOf(x), cellOf(z));
    let best = g;
    let bd = g ? Math.hypot(g.x - x, g.z - z) * 0.6 : 0.9;
    for (const p of this.pieces) {
      if (!p.f) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) (bd = d), (best = p);
    }
    return best;
  }

  /* ------------------------------ ligações ------------------------------ */
  /** liga com o vizinho? (as duas peças "link", ambas na grade) */
  private links(p: BPiece | undefined): boolean {
    return !!p && !p.f && !!PIECES[p.k]?.link;
  }
  /** máscara N/L/S/O dos vizinhos ligáveis; `extra` = células fantasma (prévia da fila) */
  maskAt(cx: number, cz: number, extra?: Set<number>): number {
    let m = 0;
    for (const [bit, dx, dz] of DIRS) {
      const k = keyOf(cx + dx, cz + dz);
      if (this.links(this.byCell.get(k)) || extra?.has(k)) m |= bit;
    }
    return m;
  }
  mask(p: BPiece): number {
    if (p.f) return 0;
    return this.maskAt(cellOf(p.x), cellOf(p.z));
  }
  /** portão: 0 = folhas ao longo de z (cerca N–S), 1 = ao longo de x */
  static gateAxis(mask: number, ro: number): number {
    const ns = mask & (N | S);
    const ew = mask & (E | W);
    if (ns && !ew) return 0;
    if (ew && !ns) return 1;
    return Math.round(ro / 2) % 2;
  }

  /* ------------------------------ colisão ------------------------------ */
  private ensureBoxes(): void {
    if (this.boxVer === this.ver) return;
    this.boxVer = this.ver;
    this.boxes.clear();
    for (const p of this.pieces) this.boxes.set(p.id, this.boxesOf(p));
  }
  /** caixas [minx, minz, maxx, maxz, ...] em coordenadas do mundo */
  boxesOf(p: BPiece, mask = this.mask(p)): number[] {
    const d = this.def(p);
    const out: number[] = [];
    const H = CELL / 2;
    if (d.arms) {
      if (!mask) mask = Math.round(p.ro / 2) % 2 ? E | W : N | S;
      const a = d.arm ?? 0.1;
      const ps = d.post ?? 0.15;
      out.push(p.x - ps, p.z - ps, p.x + ps, p.z + ps);
      if (mask & N) out.push(p.x - a, p.z, p.x + a, p.z + H);
      if (mask & S) out.push(p.x - a, p.z - H, p.x + a, p.z);
      if (mask & E) out.push(p.x, p.z - a, p.x + H, p.z + a);
      if (mask & W) out.push(p.x - H, p.z - a, p.x, p.z + a);
      return out;
    }
    if (d.id === 'gate') {
      const ax = BuildState.gateAxis(mask, p.ro);
      if (ax === 0) out.push(p.x - d.hx, p.z - H, p.x + d.hx, p.z + H);
      else out.push(p.x - H, p.z - d.hx, p.x + H, p.z + d.hx);
      return out;
    }
    if (!d.hx) return out;
    let hx = d.hx;
    let hz = d.hz;
    if (p.ro % 2) hx = hz = Math.max(hx, hz) * 0.85;
    else if ((p.ro / 2) % 2) [hx, hz] = [hz, hx];
    out.push(p.x - hx, p.z - hz, p.x + hx, p.z + hz);
    return out;
  }
  /** percorre peças perto de (x,z) */
  private near(x: number, z: number, rad: number, f: (p: BPiece, d: PieceDef) => void): void {
    if (!this.pieces.length) return;
    const cx = cellOf(x);
    const cz = cellOf(z);
    const R = Math.ceil(rad / CELL) + 1;
    for (let a = -R; a <= R; a++)
      for (let b = -R; b <= R; b++) {
        const p = this.byCell.get(keyOf(cx + a, cz + b));
        if (p) f(p, this.def(p));
      }
    for (const p of this.pieces) if (p.f && Math.abs(p.x - x) < rad + 1 && Math.abs(p.z - z) < rad + 1) f(p, this.def(p));
  }
  /** empurra o círculo para fora de uma caixa; devolve a normal (ou null) */
  private static push(o: { x: number; z: number }, r: number, b: number[], i: number): [number, number] | null {
    const qx = Math.max(b[i], Math.min(o.x, b[i + 2]));
    const qz = Math.max(b[i + 1], Math.min(o.z, b[i + 3]));
    let dx = o.x - qx;
    let dz = o.z - qz;
    const d = Math.hypot(dx, dz);
    if (d >= r) return null;
    if (d > 1e-5) {
      dx /= d;
      dz /= d;
      o.x = qx + dx * r;
      o.z = qz + dz * r;
      return [dx, dz];
    }
    // centro dentro da caixa: sai pelo lado mais perto
    const l = o.x - b[i];
    const rr = b[i + 2] - o.x;
    const dn = o.z - b[i + 1];
    const up = b[i + 3] - o.z;
    const m = Math.min(l, rr, dn, up);
    if (m === l) (o.x = b[i] - r), (dx = -1), (dz = 0);
    else if (m === rr) (o.x = b[i + 2] + r), (dx = 1), (dz = 0);
    else if (m === dn) (o.z = b[i + 1] - r), (dx = 0), (dz = -1);
    else (o.z = b[i + 3] + r), (dx = 0), (dz = 1);
    return [dx, dz];
  }
  /** colisão dos jogadores/ajudantes (portão: atravessa — ele abre) */
  collide(x: number, z: number, r: number): [number, number] {
    if (!this.pieces.length) return [x, z];
    this.ensureBoxes();
    const o = { x, z };
    this.near(x, z, r + 1, (p, d) => {
      if (d.friendly) return;
      const b = this.boxes.get(p.id);
      if (b) for (let i = 0; i < b.length; i += 4) BuildState.push(o, r, b, i);
    });
    return [o.x, o.z];
  }

  /* ------------------------------ Sombrinhas ------------------------------ */
  /** chamado por Sombrinha a cada passo, depois de andar */
  creature(c: Creature, dt: number): void {
    if (!this.pieces.length) return;
    this.ensureBoxes();
    const D = CDEFS[c.k];
    const r = D.size * 0.42;
    const o = { x: c.x, z: c.z };
    let hit: BPiece | null = null;
    let nx = 0;
    let nz = 0;
    this.near(c.x, c.z, r + 1, (p, d) => {
      if (d.id === 'spikes') {
        if (Math.abs(p.x - c.x) < 0.75 + r * 0.5 && Math.abs(p.z - c.z) < 0.75 + r * 0.5) {
          c.hp -= dt * (c.k === CK.King ? 0.5 : 2.4);
          c.lit = 0.2;
          c.vx *= 0.6;
          c.vz *= 0.6;
          this.damage(p, dt * 0.35);
        }
        return;
      }
      const b = this.boxes.get(p.id);
      if (!b) return;
      for (let i = 0; i < b.length; i += 4) {
        const n = BuildState.push(o, r, b, i);
        if (n) {
          hit = p;
          nx += n[0];
          nz += n[1];
        }
      }
    });
    let st = this.contact.get(c.id);
    if (!hit) {
      if (st) {
        st.off += dt;
        if (st.off > 1.2) this.contact.delete(c.id);
      }
      return;
    }
    const h = hit as BPiece;
    c.x = o.x;
    c.z = o.z;
    if (!st) {
      // contorna para o lado que leva ao alvo (fogueira por padrão)
      const tx = -c.x;
      const tz = -c.z;
      const cr = nx * tz - nz * tx;
      st = { t: 0, off: 0, side: Math.abs(cr) > 0.15 ? Math.sign(cr) : c.id % 2 ? 1 : -1 };
      this.contact.set(c.id, st);
    }
    st.off = 0;
    st.t += dt;
    const nl = Math.hypot(nx, nz) || 1;
    // procura uma passagem andando junto da cerca; depois de um tempo, ataca
    const look = c.k === CK.King ? 0.6 : 2.2;
    if (st.t < look) {
      const sp = D.speed * 0.8 * dt;
      c.x += (-nz / nl) * st.side * sp;
      c.z += (nx / nl) * st.side * sp;
    } else {
      this.damage(h, dt * (DPS[c.k] ?? 1));
      const ht = this.hitT.get(h.id) ?? 0;
      if (this.sim.time - ht > 0.7) {
        this.hitT.set(h.id, this.sim.time);
        this.sim.ev('bhit', { x: h.x, z: h.z, n: h.id });
      }
    }
  }
  private damage(p: BPiece, n: number): void {
    p.hp -= n;
    this.hpDirty.add(p.id);
    if (p.hp <= 0) {
      this.remove(p);
      this.sim.ev('bbreak', { x: p.x, z: p.z, i: this.def(p).id });
    }
  }

  /* ------------------------------ passo ------------------------------ */
  step(dt: number): void {
    if (!this.pieces.length) return;
    this.chestT -= dt;
    const doChest = this.chestT <= 0;
    if (doChest) this.chestT = 0.5;
    for (const p of this.pieces) {
      const d = this.def(p);
      if (d.id === 'chest' && doChest) {
        // baú construído = mais uma porta para o baú do acampamento (mesma interface: Sim.nearStore + painel da mochila)
      } else if (d.id === 'campfire') {
        for (const pl of this.sim.players) if (pl.faint <= 0 && Math.hypot(pl.x - p.x, pl.z - p.z) < 3.2) pl.warmth = Math.min(100, pl.warmth + 6 * dt);
      }
    }
  }
  /** luzes (torre, tocha, fogueira extra) — espantam Sombrinhas */
  lights(out: LightSrc[]): void {
    for (const p of this.pieces) {
      const l = PIECES[p.k]?.light;
      if (l) out.push({ x: p.x, z: p.z, r: l });
    }
  }
  /** cama mais perto da fogueira (renascer) */
  bed(): { x: number; z: number } | null {
    let b: BPiece | null = null;
    for (const p of this.pieces) if (PIECES[p.k]?.id === 'bed' && (!b || Math.hypot(p.x, p.z) < Math.hypot(b.x, b.z))) b = p;
    return b;
  }
  /** bancada construída perto de (x,z)? */
  benchNear(x: number, z: number, d: number): BPiece | null {
    for (const p of this.pieces) if (PIECES[p.k]?.id === 'bench' && Math.hypot(p.x - x, p.z - z) < d) return p;
    return null;
  }

  /* ------------------------------ validação ------------------------------ */
  /** obstáculo fixo (árvore, pedra, baú do mapa, construções antigas, fogueira, bancada) */
  blocked(x: number, z: number, r: number): boolean {
    const s = this.sim;
    const w = s.w;
    let hit = false;
    w.each(x, z, (i) => {
      if (hit) return;
      let ox: number, oz: number, rr: number;
      if (i >= 0) {
        if (s.treeT[i]) return;
        const t = w.trees[i];
        [ox, oz, rr] = [t.x, t.z, treeR(t)];
      } else if (i > -100000) {
        const n = w.nodes[-1 - i];
        [ox, oz, rr] = [n.x, n.z, NODE_R[n.k]];
      } else {
        const c = w.chests[-100000 - i];
        [ox, oz, rr] = [c.x, c.z, 0.6];
      }
      if (rr > 0 && Math.hypot(ox - x, oz - z) < rr + r) hit = true;
    });
    if (hit) return true;
    for (const st of s.structs) {
      if (st.k === 'torch' || st.k === 'glowshroom') continue;
      if (Math.hypot(st.x - x, st.z - z) < r + 0.5) return true;
    }
    for (const v of s.vehView) if (Math.hypot(v.x - x, v.z - z) < r + 1.6) return true;
    return false;
  }
  /**
   * Pode pôr a peça `d` em (x,z)? '' = pode. `pend` = células já ocupadas pela própria fila.
   * Não verifica recursos (a fila soma o custo — veja affordCount).
   */
  check(d: PieceDef, x: number, z: number, _ro: number, free: boolean, p: Player | undefined, pend?: Set<number>): Reason {
    if (p && Math.hypot(x - p.x, z - p.z) > REACH + 3) return 'far';
    const dc = Math.hypot(x, z);
    if (dc < 2.3 || Math.hypot(x - BENCH_POS[0], z - BENCH_POS[1]) < 1.6) return 'fire';
    if (dc > BUILD_R) return 'edge';
    if ((d.bench ?? 0) > benchLevel(this.sim)) return 'tier';
    const solid = d.hx > 0 || d.arms || d.id === 'gate';
    const rad = free ? Math.max(d.hx, d.hz, 0.35) : 0.55;
    if (!free) {
      const k = keyOf(cellOf(x), cellOf(z));
      if (this.byCell.has(k) || pend?.has(k)) return 'occ';
      for (const q of this.pieces) if (q.f && Math.abs(q.x - x) < 0.95 && Math.abs(q.z - z) < 0.95) return 'occ';
    } else {
      for (const q of this.pieces) {
        const qd = this.def(q);
        const qr = q.f ? Math.max(qd.hx, qd.hz, 0.35) : 0.75;
        if (Math.hypot(q.x - x, q.z - z) < qr + rad - 0.1) return 'occ';
      }
    }
    if (this.blocked(x, z, solid ? rad : 0.3)) return 'block';
    if (solid) {
      if (!d.friendly) for (const pl of this.sim.players) if (pl.faint <= 0 && Math.hypot(pl.x - x, pl.z - z) < 0.4 + rad * 0.9) return 'crowd';
      for (const c of this.sim.creatures) if (Math.hypot(c.x - x, c.z - z) < CDEFS[c.k].size * 0.42 + rad * 0.9) return 'crowd';
    }
    return '';
  }

  /* ------------------------------ ações (host) ------------------------------ */
  act(p: Player, A: BuildAction): void {
    const c = Array.isArray(A.c) ? A.c.slice(0, LINE_MAX * 2) : [];
    const pts: [number, number][] = [];
    for (let i = 0; i + 1 < c.length; i += 2) {
      const x = (+c[i] || 0) / 10;
      const z = (+c[i + 1] || 0) / 10;
      if (Number.isFinite(x) && Number.isFinite(z)) pts.push([x, z]);
    }
    if (!pts.length) return;
    switch (A.o) {
      case 'p':
        return this.place(p, Number(A.k) | 0, pts, (Number(A.r) | 0) & 7, !!A.f);
      case 'd':
        return this.demolish(p, pts);
      case 'f':
        return this.repair(p, pts);
      case 'u':
        return this.upgrade(p, pts);
    }
  }
  place(p: Player, k: number, pts: [number, number][], ro: number, free: boolean): void {
    const d = byIdx(k);
    if (!d) return;
    if (!free || !d.decor) {
      free = false;
      ro &= 6;
    }
    const pend = new Set<number>();
    let n = 0;
    let first: [number, number] | null = null;
    let why: Reason = '';
    for (let [x, z] of pts) {
      if (!free) {
        x = cellOf(x) * CELL;
        z = cellOf(z) * CELL;
      }
      const r = this.check(d, x, z, ro, free, p, pend);
      if (r) {
        why ||= r;
        continue;
      }
      if (!canAfford(this.sim, p, d.cost)) {
        why = 'res';
        break;
      }
      pay(this.sim, p, d.cost);
      this.add(d, x, z, ro, free);
      if (!free) pend.add(keyOf(cellOf(x), cellOf(z)));
      first ??= [x, z];
      n++;
    }
    if (n && first) this.sim.ev('bplace', { x: first[0], z: first[1], p: p.id, i: d.id, n });
    if (why === 'res') this.sim.ev('need', { p: p.id, i: missing(this.sim, p, d.cost) ?? 'wood' });
    else if (!n && why) this.sim.ev('bno', { p: p.id, i: why });
  }
  add(d: PieceDef, x: number, z: number, ro: number, free: boolean, hp = d.hp): BPiece {
    const q: BPiece = { id: this.nextId++, k: d.idx, x, z, ro, hp, f: free ? 1 : 0 };
    this.pieces.push(q);
    if (!free) this.byCell.set(keyOf(cellOf(x), cellOf(z)), q);
    this.ver++;
    return q;
  }
  remove(q: BPiece): void {
    this.pieces = this.pieces.filter((o) => o !== q);
    if (!q.f) {
      const k = keyOf(cellOf(q.x), cellOf(q.z));
      if (this.byCell.get(k) === q) this.byCell.delete(k);
    }
    this.hpDirty.delete(q.id);
    this.ver++;
  }
  private targets(p: Player, pts: [number, number][]): BPiece[] {
    const out = new Set<BPiece>();
    for (const [x, z] of pts) {
      const q = this.pieceAt(x, z);
      if (q && Math.hypot(q.x - p.x, q.z - p.z) < REACH + 3) out.add(q);
    }
    return [...out];
  }
  demolish(p: Player, pts: [number, number][]): void {
    let n = 0;
    let last: BPiece | null = null;
    for (const q of this.targets(p, pts)) {
      const d = this.def(q);
      give(this.sim, p, refundOf(d, Math.max(0, q.hp) / d.hp));
      this.remove(q);
      last = q;
      n++;
    }
    if (last) this.sim.ev('bdel', { x: last.x, z: last.z, p: p.id, i: this.def(last).id, n });
  }
  repair(p: Player, pts: [number, number][]): void {
    let n = 0;
    let last: BPiece | null = null;
    let why: Reason = '';
    for (const q of this.targets(p, pts)) {
      const d = this.def(q);
      if (q.hp >= d.hp - 0.01) continue;
      const c = repairOf(d, q.hp);
      if (!canAfford(this.sim, p, c)) {
        why = 'res';
        this.sim.ev('need', { p: p.id, i: d.fix });
        break;
      }
      pay(this.sim, p, c);
      q.hp = d.hp;
      this.hpDirty.add(q.id);
      this.hpVer++;
      last = q;
      n++;
    }
    if (last) this.sim.ev('bfix', { x: last.x, z: last.z, p: p.id, i: this.def(last).id, n });
    else if (!why) this.sim.ev('bno', { p: p.id, i: 'none' });
  }
  upgrade(p: Player, pts: [number, number][]): void {
    let n = 0;
    let last: BPiece | null = null;
    for (const q of this.targets(p, pts)) {
      const d = this.def(q);
      const u = d.up ? PIECE[d.up] : null;
      if (!u) continue;
      if ((u.bench ?? 0) > benchLevel(this.sim)) {
        this.sim.ev('bno', { p: p.id, i: 'tier' });
        break;
      }
      if (!canAfford(this.sim, p, u.cost)) {
        this.sim.ev('need', { p: p.id, i: missing(this.sim, p, u.cost) ?? 'stone' });
        break;
      }
      pay(this.sim, p, u.cost);
      give(this.sim, p, refundOf(d, Math.max(0, q.hp) / d.hp));
      q.k = u.idx;
      q.hp = u.hp;
      this.ver++;
      last = q;
      n++;
    }
    if (last) this.sim.ev('bup', { x: last.x, z: last.z, p: p.id, i: this.def(last).id, n });
  }

  /* ------------------------------ rede ------------------------------ */
  private rows(): number[] {
    const o: number[] = [];
    for (const p of this.pieces) o.push(p.id, p.k, q10(p.x), q10(p.z), p.ro, Math.max(0, Math.ceil(p.hp)), p.f);
    return o;
  }
  /** campos para o instantâneo do host: `bd` = lista completa (quando muda/entrada), `bh` = vidas que mudaram */
  netOut(st: object, full: boolean): Record<string, unknown> {
    let m = this.net.get(st);
    if (!m) this.net.set(st, (m = { ver: -1 }));
    const o: Record<string, unknown> = {};
    if (full || m.ver !== this.ver) {
      m.ver = this.ver;
      o.bd = this.rows();
      this.hpDirty.clear();
    } else if (this.hpDirty.size) {
      const h: number[] = [];
      for (const id of this.hpDirty) {
        const p = this.get(id);
        if (p) h.push(id, Math.max(0, Math.ceil(p.hp)));
      }
      this.hpDirty.clear();
      if (h.length) o.bh = h;
    }
    return o;
  }
  /** convidado: aplica `bd`/`bh` */
  netIn(o: Record<string, unknown>): void {
    const bd = o.bd as number[] | undefined;
    if (Array.isArray(bd)) {
      const same = bd.length === this.pieces.length * 7 && this.pieces.every((p, i) => p.id === bd[i * 7] && p.k === bd[i * 7 + 1] && q10(p.x) === bd[i * 7 + 2] && q10(p.z) === bd[i * 7 + 3] && p.ro === bd[i * 7 + 4]);
      if (same) {
        this.pieces.forEach((p, i) => {
          if (p.hp !== bd[i * 7 + 5]) (p.hp = bd[i * 7 + 5]), this.hpVer++;
        });
      } else {
        this.pieces = [];
        this.byCell.clear();
        for (let i = 0; i + 6 < bd.length; i += 7) {
          const q: BPiece = { id: bd[i], k: bd[i + 1], x: bd[i + 2] / 10, z: bd[i + 3] / 10, ro: bd[i + 4] & 7, hp: bd[i + 5], f: bd[i + 6] ? 1 : 0 };
          if (!PIECES[q.k]) continue;
          this.pieces.push(q);
          if (!q.f) this.byCell.set(keyOf(cellOf(q.x), cellOf(q.z)), q);
        }
        this.ver++;
      }
    }
    const bh = o.bh as number[] | undefined;
    if (Array.isArray(bh)) {
      for (let i = 0; i + 1 < bh.length; i += 2) {
        const p = this.get(bh[i]);
        if (p) p.hp = bh[i + 1];
      }
      this.hpVer++;
    }
  }

  /* ------------------------------ salvar ------------------------------ */
  serialize(): { v: 1; p: number[] } {
    const o: number[] = [];
    for (const p of this.pieces) o.push(p.k, q10(p.x), q10(p.z), p.ro, Math.ceil(p.hp), p.f);
    return { v: 1, p: o };
  }
  load(o: unknown): void {
    this.pieces = [];
    this.byCell.clear();
    const a = (o as { p?: unknown })?.p;
    if (Array.isArray(a)) {
      for (let i = 0; i + 5 < a.length; i += 6) {
        const d = PIECES[a[i] | 0];
        if (!d) continue;
        const x = (+a[i + 1] || 0) / 10;
        const z = (+a[i + 2] || 0) / 10;
        const f = !!a[i + 5] && !!d.decor;
        if (!f && this.byCell.has(keyOf(cellOf(x), cellOf(z)))) continue;
        this.add(d, f ? x : cellOf(x) * CELL, f ? z : cellOf(z) * CELL, (a[i + 3] | 0) & 7, f, Math.min(d.hp, Math.max(1, +a[i + 4] || d.hp)));
      }
    }
    this.ver++;
  }
}
