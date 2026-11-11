/* ============================================================
 *  MUNDO ABERTO — sólidos para colisão do jogador/veículos/bichos.
 *  Caixas orientadas (yaw) com faixa de altura, num hash espacial de 8 m.
 *  Construções, acampamentos, baús e máquinas registram caixas aqui;
 *  os veículos entram como caixas dinâmicas (atualizadas a cada quadro).
 *  Sem alocação no laço quente: consultas escrevem em objetos de saída.
 * ============================================================ */

export interface SBox {
  x: number;
  z: number;
  /** base e topo (m) */
  y0: number;
  y1: number;
  hx: number;
  hz: number;
  /** cos/sen do yaw */
  c: number;
  s: number;
  /** marcador do dono (peça, veículo…) */
  tag: number;
  /** atravessável (porta aberta) */
  off?: boolean;
}

const CELL = 8;
const key = (ix: number, iz: number) => ((ix + 32768) << 16) | ((iz + 32768) & 0xffff);

export interface MoveOut {
  /** chão mais alto encontrado debaixo do pé (ou -Infinity) */
  ground: number;
  hit: boolean;
}

export class Solids {
  private grid = new Map<number, SBox[]>();
  /** caixas dinâmicas (veículos): testadas sempre */
  dyn: SBox[] = [];
  private seen = new Set<SBox>();

  makeBox(x: number, z: number, y0: number, y1: number, hx: number, hz: number, yaw: number, tag = 0): SBox {
    return { x, z, y0, y1, hx, hz, c: Math.cos(yaw), s: Math.sin(yaw), tag };
  }

  add(b: SBox): SBox {
    const r = Math.max(b.hx, b.hz) * 1.42;
    const x0 = Math.floor((b.x - r) / CELL);
    const x1 = Math.floor((b.x + r) / CELL);
    const z0 = Math.floor((b.z - r) / CELL);
    const z1 = Math.floor((b.z + r) / CELL);
    for (let iz = z0; iz <= z1; iz++)
      for (let ix = x0; ix <= x1; ix++) {
        const k = key(ix, iz);
        let a = this.grid.get(k);
        if (!a) this.grid.set(k, (a = []));
        a.push(b);
      }
    return b;
  }
  remove(b: SBox): void {
    const r = Math.max(b.hx, b.hz) * 1.42;
    const x0 = Math.floor((b.x - r) / CELL);
    const x1 = Math.floor((b.x + r) / CELL);
    const z0 = Math.floor((b.z - r) / CELL);
    const z1 = Math.floor((b.z + r) / CELL);
    for (let iz = z0; iz <= z1; iz++)
      for (let ix = x0; ix <= x1; ix++) {
        const k = key(ix, iz);
        const a = this.grid.get(k);
        if (!a) continue;
        const i = a.indexOf(b);
        if (i >= 0) a.splice(i, 1);
        if (!a.length) this.grid.delete(k);
      }
  }
  clear(): void {
    this.grid.clear();
    this.dyn.length = 0;
  }

  /** visita as caixas perto de (x,z) num raio r */
  each(x: number, z: number, r: number, f: (b: SBox) => void): void {
    const seen = this.seen;
    seen.clear();
    const x0 = Math.floor((x - r) / CELL);
    const x1 = Math.floor((x + r) / CELL);
    const z0 = Math.floor((z - r) / CELL);
    const z1 = Math.floor((z + r) / CELL);
    for (let iz = z0; iz <= z1; iz++)
      for (let ix = x0; ix <= x1; ix++) {
        const a = this.grid.get(key(ix, iz));
        if (!a) continue;
        for (let i = 0; i < a.length; i++) {
          const b = a[i];
          if (seen.has(b)) continue;
          seen.add(b);
          f(b);
        }
      }
    for (let i = 0; i < this.dyn.length; i++) f(this.dyn[i]);
  }

  /**
   * Empurra um cilindro (raio r, de feet a feet+h) para fora das caixas.
   * Caixas cujo topo está até `step` acima do pé viram chão (degrau / subir em cima).
   */
  resolve(p: { x: number; z: number }, feet: number, h: number, r: number, step: number, out: MoveOut, ignoreTag = -1): void {
    out.ground = -Infinity;
    out.hit = false;
    this.each(p.x, p.z, r + 4, (b) => {
      if (b.off || b.tag === ignoreTag) return;
      // coordenadas locais da caixa
      const dx = p.x - b.x;
      const dz = p.z - b.z;
      const lx = dx * b.c - dz * b.s;
      const lz = dx * b.s + dz * b.c;
      const qx = lx < -b.hx ? -b.hx : lx > b.hx ? b.hx : lx;
      const qz = lz < -b.hz ? -b.hz : lz > b.hz ? b.hz : lz;
      const ex = lx - qx;
      const ez = lz - qz;
      const d2 = ex * ex + ez * ez;
      if (d2 >= r * r) return;
      // em cima da caixa (ou dá para subir no degrau)
      if (b.y1 <= feet + step) {
        if (b.y1 > out.ground && d2 < r * r * 0.5) out.ground = b.y1;
        if (b.y1 <= feet + step) return;
      }
      if (b.y0 >= feet + h) return; // passa por baixo
      out.hit = true;
      let nx: number;
      let nz: number;
      let push: number;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        nx = ex / d;
        nz = ez / d;
        push = r - d;
      } else {
        // centro dentro da caixa: sai pelo lado mais perto
        const px = b.hx - Math.abs(lx);
        const pz = b.hz - Math.abs(lz);
        if (px < pz) {
          nx = lx < 0 ? -1 : 1;
          nz = 0;
          push = px + r;
        } else {
          nx = 0;
          nz = lz < 0 ? -1 : 1;
          push = pz + r;
        }
      }
      // volta para o mundo (rotação inversa)
      const wx = nx * b.c + nz * b.s;
      const wz = -nx * b.s + nz * b.c;
      p.x += wx * push;
      p.z += wz * push;
    });
  }

  /** teto mais baixo acima de y (cabeça batendo) */
  ceiling(x: number, z: number, y: number, r: number): number {
    let best = Infinity;
    this.each(x, z, r + 4, (b) => {
      if (b.off || b.y0 < y || b.y0 >= best) return;
      const dx = x - b.x;
      const dz = z - b.z;
      const lx = dx * b.c - dz * b.s;
      const lz = dx * b.s + dz * b.c;
      if (Math.abs(lx) < b.hx + r * 0.5 && Math.abs(lz) < b.hz + r * 0.5) best = b.y0;
    });
    return best;
  }

  /** chão (topo de caixa) sob o ponto até `y`, ou -Infinity */
  groundAt(x: number, z: number, y: number): number {
    let best = -Infinity;
    this.each(x, z, 4, (b) => {
      if (b.off || b.y1 > y + 0.01 || b.y1 <= best) return;
      const dx = x - b.x;
      const dz = z - b.z;
      const lx = dx * b.c - dz * b.s;
      const lz = dx * b.s + dz * b.c;
      if (Math.abs(lx) <= b.hx && Math.abs(lz) <= b.hz) best = b.y1;
    });
    return best;
  }

  /** raio contra caixas: distância até a primeira (ou Infinity) */
  ray(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number, hitOut?: { b: SBox | null }): number {
    let best = max;
    let hb: SBox | null = null;
    const mx = ox + dx * max * 0.5;
    const mz = oz + dz * max * 0.5;
    this.each(mx, mz, max * 0.5 + 2, (b) => {
      if (b.off) return;
      // raio em coordenadas locais (yaw) e fatia nas 3 dimensões
      const rx = ox - b.x;
      const rz = oz - b.z;
      const lx = rx * b.c - rz * b.s;
      const lz = rx * b.s + rz * b.c;
      const ldx = dx * b.c - dz * b.s;
      const ldz = dx * b.s + dz * b.c;
      let t0 = 0;
      let t1 = best;
      const slab = (o: number, d: number, lo: number, hi: number): boolean => {
        if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
        let a = (lo - o) / d;
        let c = (hi - o) / d;
        if (a > c) {
          const tmp = a;
          a = c;
          c = tmp;
        }
        if (a > t0) t0 = a;
        if (c < t1) t1 = c;
        return t0 <= t1;
      };
      if (!slab(lx, ldx, -b.hx, b.hx)) return;
      if (!slab(lz, ldz, -b.hz, b.hz)) return;
      if (!slab(oy, dy, b.y0, b.y1)) return;
      if (t0 < best) {
        best = t0;
        hb = b;
      }
    });
    if (hitOut) hitOut.b = hb;
    return best;
  }
}
