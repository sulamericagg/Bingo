/* ============================================================
 *  FPKIT — colisão plugável. O controlador só conhece esta interface:
 *   - mundos em GRADE (cozinha, casa, labirintos): `isFree(x, z, r)` → desliza eixo a eixo;
 *   - mundos de caixas/malha: `sweep(...)` → o mundo resolve o movimento inteiro;
 *   - `clampPoint` (opcional): tira o OLHO de dentro dos sólidos (plano near nunca entra no móvel).
 *  Implementações prontas: GridCollider (células abertas/fechadas) e AabbCollider (lista de caixas).
 * ============================================================ */

export interface SweepResult {
  x: number;
  z: number;
  /** bateu no eixo X / Z (o controlador zera/rebate a velocidade naquele eixo) */
  hitX: boolean;
  hitZ: boolean;
}

export interface FpCollider {
  /** um círculo de raio r em (x, z) cabe aqui? (mundo em grade — o controlador desliza eixo a eixo) */
  isFree?(x: number, z: number, r: number): boolean;
  /** move um círculo de (fx,fz) a (tx,tz) e escreve onde parou em `out` (mundos de caixas/malha) */
  sweep?(fx: number, fz: number, tx: number, tz: number, r: number, out: SweepResult): void;
  /** empurra o ponto (olho) para fora dos sólidos com folga `margin`; (px,pz) = jogador (refúgio) */
  clampPoint?(x: number, z: number, margin: number, px: number, pz: number, out: [number, number]): void;
}

/**
 * Grade de células quadradas de lado `cell` (m). `isOpen(gx, gz)` recebe coordenadas de CÉLULA
 * fracionárias (ex.: sim.isFloor). Colisão = os 4 cantos do quadrado do corpo em células abertas
 * (exatamente o moveGrid da Cozinha).
 */
export class GridCollider implements FpCollider {
  constructor(
    public cell: number,
    public isOpen: (gx: number, gz: number) => boolean,
  ) {}
  isFree(x: number, z: number, r: number): boolean {
    const c = this.cell;
    const gx = x / c;
    const gz = z / c;
    const rr = r / c;
    const o = this.isOpen;
    return o(gx - rr, gz - rr) && o(gx + rr, gz - rr) && o(gx - rr, gz + rr) && o(gx + rr, gz + rr);
  }
  /** camClamp da Cozinha: empurra o ponto para fora das 3×3 células fechadas vizinhas */
  clampPoint(x: number, z: number, margin: number, px: number, pz: number, out: [number, number]): void {
    const T = this.cell;
    const gx = Math.floor(x / T);
    const gz = Math.floor(z / T);
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 1; ox++) {
        const cx = gx + ox;
        const cy = gz + oy;
        if (this.isOpen(cx + 0.5, cy + 0.5)) continue;
        const nx = Math.max(cx * T, Math.min(x, (cx + 1) * T));
        const nz = Math.max(cy * T, Math.min(z, (cy + 1) * T));
        const dx = x - nx;
        const dz = z - nz;
        const d = Math.hypot(dx, dz);
        if (d >= margin) continue;
        if (d < 1e-4) {
          // dentro da célula: volta para o centro do chão onde o jogador está
          out[0] = (Math.floor(px / T) + 0.5) * T;
          out[1] = (Math.floor(pz / T) + 0.5) * T;
          return;
        }
        x = nx + (dx / d) * margin;
        z = nz + (dz / d) * margin;
      }
    out[0] = x;
    out[1] = z;
  }
}

/** caixa alinhada (planta XZ; y0/y1 opcionais para ignorar o que está acima da cabeça/abaixo do pé) */
export interface FpBox {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  y0?: number;
  y1?: number;
}

/**
 * Lista de caixas (móveis, paredes, casas). Sweep em subpassos ≤ r/2 com deslize por eixo
 * (não atravessa parede fina em quadro lento). Linear no nº de caixas: até ~300 está ótimo;
 * acima, filtre por região (ex.: `boxes` = só as do cômodo atual).
 */
export class AabbCollider implements FpCollider {
  /** faixa vertical do corpo (pés..cabeça): caixas fora dela não colidem */
  y0 = -Infinity;
  y1 = Infinity;
  constructor(public boxes: FpBox[] = []) {}
  add(b: FpBox): FpBox {
    this.boxes.push(b);
    return b;
  }
  private live(b: FpBox): boolean {
    return (b.y1 === undefined || b.y1 > this.y0) && (b.y0 === undefined || b.y0 < this.y1);
  }
  isFree(x: number, z: number, r: number): boolean {
    const r2 = r * r;
    for (const b of this.boxes) {
      if (!this.live(b)) continue;
      const dx = x - Math.max(b.x0, Math.min(x, b.x1));
      const dz = z - Math.max(b.z0, Math.min(z, b.z1));
      if (dx * dx + dz * dz < r2) return false;
    }
    return true;
  }
  sweep(fx: number, fz: number, tx: number, tz: number, r: number, out: SweepResult): void {
    const n = Math.max(1, Math.ceil(Math.hypot(tx - fx, tz - fz) / Math.max(0.02, r * 0.5)));
    const sx = (tx - fx) / n;
    const sz = (tz - fz) / n;
    let x = fx,
      z = fz;
    out.hitX = out.hitZ = false;
    for (let i = 0; i < n; i++) {
      if (!out.hitX) {
        if (this.isFree(x + sx, z, r)) x += sx;
        else out.hitX = true;
      }
      if (!out.hitZ) {
        if (this.isFree(x, z + sz, r)) z += sz;
        else out.hitZ = true;
      }
    }
    out.x = x;
    out.z = z;
  }
  clampPoint(x: number, z: number, margin: number, px: number, pz: number, out: [number, number]): void {
    for (const b of this.boxes) {
      if (!this.live(b)) continue;
      const nx = Math.max(b.x0, Math.min(x, b.x1));
      const nz = Math.max(b.z0, Math.min(z, b.z1));
      const dx = x - nx;
      const dz = z - nz;
      const d = Math.hypot(dx, dz);
      if (d >= margin) continue;
      if (d < 1e-4) {
        // olho dentro da caixa: recua para o jogador (que sempre está fora)
        x = px;
        z = pz;
        continue;
      }
      x = nx + (dx / d) * margin;
      z = nz + (dz / d) * margin;
    }
    out[0] = x;
    out[1] = z;
  }
}

/** junta vários coliders (ex.: grade da casa + caixas dos móveis soltos) */
export function combineColliders(...cs: FpCollider[]): FpCollider {
  const free = cs.filter((c) => c.isFree);
  const clamp = cs.filter((c) => c.clampPoint);
  return {
    isFree: (x, z, r) => free.every((c) => c.isFree!(x, z, r)),
    clampPoint(x, z, m, px, pz, out) {
      out[0] = x;
      out[1] = z;
      for (const c of clamp) c.clampPoint!(out[0], out[1], m, px, pz, out);
    },
  };
}
