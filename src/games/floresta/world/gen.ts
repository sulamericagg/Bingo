/* ============================================================
 *  MUNDO ABERTO — gerador determinístico (semente + coordenadas).
 *  Altura = continentes + morros + cordilheiras + rios/lagos,
 *  achatada nos trilhos do trem e nos acampamentos.
 *  Clima (temperatura, umidade, magia) → pesos dos biomas (transição suave).
 * ============================================================ */
import { fbm, hash2, ridged, smoothstep } from './noise';
import { NB, WBIOMES, WSPECIES } from './biomes';

export const CH = 32; // tamanho do pedaço (m)
export const RES = 32; // células por lado (1 m)
export const VN = RES + 1; // vértices por lado
export const WATER_Y = 0;
/** trilhos: linhas z = k·RAIL_Z (correm ao longo de X) */
export const RAIL_Z = 384;
/** acampamentos: x = j·CAMP_X sobre cada trilho, deslocados para o lado */
export const CAMP_X = 224;
export const CAMP_OFF = 14;
/** células de exploração do mapa (m) */
export const CELL = 64;

const B_BOSQUE = 0;
const B_PANTANO = 7;
const B_DESERTO = 8;
const B_SAVANA = 6;
const B_NEVADO = 1;
const B_CRISTAL = 5;
const B_MONTANHA = 10;

export interface Camp {
  j: number;
  k: number;
  x: number;
  z: number;
  /** trilho */
  rz: number;
  seed: number;
}

export class WorldGen {
  private w = new Float32Array(NB);
  constructor(readonly seed: number) {}

  /** clima em (x,z): T, H, M em 0..1 */
  climate(x: number, z: number, out: Float32Array): void {
    const s = this.seed;
    const T = (fbm(x / 620, z / 620, s + 10, 3) - 0.5) * 2.6 + 0.5;
    const H = (fbm(x / 540 + 31, z / 540 - 17, s + 11, 3) - 0.5) * 2.6 + 0.5;
    const m = fbm(x / 430 - 9, z / 430 + 5, s + 12, 3);
    out[0] = T < 0 ? 0 : T > 1 ? 1 : T;
    out[1] = H < 0 ? 0 : H > 1 ? 1 : H;
    out[2] = smoothstep(0.56, 0.66, m);
  }

  private cl = new Float32Array(3);
  /** pesos normalizados dos biomas em (x,z) (out tem NB posições); devolve o dominante */
  weights(x: number, z: number, out: Float32Array = this.w): number {
    const c = this.cl;
    this.climate(x, z, c);
    let sum = 0;
    let best = 0;
    let bw = -1;
    const r = Math.hypot(x, z);
    const spawn = smoothstep(190, 70, r);
    for (let i = 0; i < NB; i++) {
      const b = WBIOMES[i];
      const dT = c[0] - b.T;
      const dH = c[1] - b.H;
      const dM = (c[2] - b.M) * 1.4;
      let w = Math.exp(-(dT * dT + dH * dH + dM * dM) / 0.012);
      if (i === B_BOSQUE) w += spawn * 4;
      else w *= 1 - spawn;
      out[i] = w;
      sum += w;
      if (w > bw) {
        bw = w;
        best = i;
      }
    }
    const k = sum > 0 ? 1 / sum : 0;
    for (let i = 0; i < NB; i++) out[i] *= k;
    if (sum <= 0) out[0] = 1;
    return best;
  }

  /** altura do trilho k ao longo de x (suave, sempre acima da água) */
  railH(x: number, k: number): number {
    const h = 6 + (fbm(x / 520, k * 7.31, this.seed + 20, 2) - 0.5) * 26;
    return h < 2.6 ? 2.6 : h > 18 ? 18 : h;
  }
  nearestRail(z: number): number {
    return Math.round(z / RAIL_Z);
  }

  /** acampamento na célula (j,k), se existir */
  camp(j: number, k: number): Camp | null {
    const ok = (j === 0 && k === 0) || hash2(j, k, this.seed + 30) < 0.72;
    if (!ok) return null;
    const x = j * CAMP_X + (j === 0 && k === 0 ? 0 : (hash2(j, k, this.seed + 31) - 0.5) * 60);
    const side = hash2(j, k, this.seed + 32) < 0.5 ? -1 : 1;
    return { j, k, x, z: k * RAIL_Z + side * CAMP_OFF, rz: k * RAIL_Z, seed: (hash2(j, k, this.seed + 33) * 1e9) | 0 };
  }

  /** acampamento mais perto de (x,z) (procura nas células vizinhas) */
  nearestCamp(x: number, z: number, maxR = 1e9): Camp | null {
    const k0 = Math.round(z / RAIL_Z);
    const j0 = Math.round(x / CAMP_X);
    let best: Camp | null = null;
    let bd = maxR * maxR;
    for (let k = k0 - 1; k <= k0 + 1; k++)
      for (let j = j0 - 2; j <= j0 + 2; j++) {
        const c = this.camp(j, k);
        if (!c) continue;
        const d = (c.x - x) ** 2 + (c.z - z) ** 2;
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
    return best;
  }

  /** altura natural do terreno (sem escavações) */
  height(x: number, z: number): number {
    const s = this.seed;
    const w = this.w;
    this.weights(x, z, w);
    const c = fbm(x / 760, z / 760, s + 1, 3);
    const hills = (fbm(x / 130, z / 130, s + 2, 4) - 0.5) * 16;
    const mnt = ridged(x / 330, z / 330, s + 3, 4);
    const mask = Math.min(1, smoothstep(0.5, 0.7, c) + w[B_MONTANHA] * 0.9) * (1 - w[B_PANTANO]) * (1 - w[B_DESERTO] * 0.6);
    let h = (c - 0.4) * 36 + hills + mnt * mnt * 78 * mask + w[B_NEVADO] * 6 + w[B_CRISTAL] * 4 + w[B_MONTANHA] * (8 + mnt * 22);
    // rios: faixa estreita onde o ruído passa por 0.5
    const rv = fbm(x / 430 + 3.3, z / 430 - 1.7, s + 4, 3);
    const d = Math.abs(rv - 0.5);
    h = h + (Math.min(h, 1.2) - h) * smoothstep(0.075, 0.03, d);
    h = h + (Math.min(h, -2.6) - h) * smoothstep(0.03, 0.012, d);
    // biomas: pântano raso e alagado, deserto com dunas, savana plana
    h = h + (0.15 + hills * 0.06 - h) * w[B_PANTANO] * 0.9;
    h += w[B_DESERTO] * (Math.sin(x * 0.045 + Math.sin(z * 0.03) * 2) * 2.2 + 1.5);
    h = h + (h * 0.55 + 1.5 - h) * w[B_SAVANA];
    // início: platô suave em volta do acampamento base
    const r = Math.hypot(x, z - CAMP_OFF);
    h = h + (3 + hills * 0.12 - h) * smoothstep(110, 35, r);
    // trilho e acampamentos achatados
    const k = Math.round(z / RAIL_Z);
    const dz = Math.abs(z - k * RAIL_Z);
    if (dz < 40) {
      const rh = this.railH(x, k);
      h = h + (rh - h) * smoothstep(30, 5, dz);
      const j = Math.round(x / CAMP_X);
      for (let jj = j - 1; jj <= j + 1; jj++) {
        const cp = this.camp(jj, k);
        if (!cp) continue;
        const dc = Math.hypot(x - cp.x, z - cp.z);
        if (dc < 46) h = h + (this.railH(cp.x, k) - h) * smoothstep(44, 20, dc);
      }
    }
    return h;
  }

  /** pequeno ruído de cor do chão */
  tint(x: number, z: number): number {
    return hash2(Math.floor(x * 0.5), Math.floor(z * 0.5), this.seed + 40) * 0.5 + fbm(x / 9, z / 9, this.seed + 41, 2) * 0.5;
  }

  /** escolhe espécie no ponto (mistura nas transições) */
  pickSpecies(r: number, r2: number, w: Float32Array): { sp: number; b: number } {
    let acc = 0;
    let b = 0;
    for (let i = 0; i < NB; i++) {
      acc += w[i];
      if (r <= acc) {
        b = i;
        break;
      }
      b = i;
    }
    const list = WBIOMES[b].sp;
    let tot = 0;
    for (const [, wt] of list) tot += wt;
    let q = r2 * tot;
    for (const [sp, wt] of list) {
      q -= wt;
      if (q <= 0) return { sp, b };
    }
    return { sp: list[0][0], b };
  }
}

export const speciesCount = WSPECIES.length;
