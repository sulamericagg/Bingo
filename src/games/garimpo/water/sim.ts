/* ============================================================
 *  GARIMPO BRUTO — água como fluido (águas rasas, CPU, typed arrays).
 *
 *  Grade fixa WN×WN (128² · 1,5 m) sobre o campo de alturas (384² · 0,5 m). Cada célula guarda o
 *  chão médio (b, da média ponderada 4×4 dos vértices do terreno), a profundidade (d) e os fluxos
 *  nas arestas (qx: célula→direita, qz: célula→baixo, em m³/s). É o "modelo de tubos" com a área
 *  do tubo trocada pela profundidade na aresta (reconstrução hidrostática: hE = max(η) − max(b)),
 *  então água não passa por cima de parede mais alta que os dois lados, e lâmina fina anda devagar:
 *    q += dt·g·hE·(ηA − ηB);   atrito de Manning semi-implícito;   |u| ≤ 7 m/s
 *    K = min(1, d·A / (Σsaídas·dt))  → nunca fica negativo (conserva massa exatamente)
 *  Passo fixo (1/30 s, 1/20 no nível baixo de qualidade). Estável com folga: c·dt/dx ≈ 0,17 a 6 m.
 *
 *  Ladrilhos de 8×8 células dormem quando a água está parada (2 s sem mudar): processa só os
 *  acordados + 1 de margem (conjunto P). Aresta com um lado fora de P é parede (fluxo 0) — a margem
 *  acorda quando a água muda nela, então a onda anda 1 ladrilho (12 m) por passo, bem mais rápido
 *  que a física. Lago e represa parados custam ~0.
 *
 *  Erosão (5 Hz, só ladrilhos acordados): água rápida tira terreno (até o "piso" da célula — o chão
 *  natural embaixo da barragem, ou 0,8 m abaixo do terreno gerado), leva sedimento junto com o fluxo
 *  e deposita onde desacelera. Terra solta (montes) sai mais fácil e o ouro dela se perde.
 *
 *  Rede: ver netTake/netApply — só ladrilhos que mudaram, profundidade em cm (u16) e velocidade
 *  em dm/s (i8) quando a água corre.
 * ============================================================ */
import { CELL, N, SIZE, V, MAT_DIRT, MAT_GRASS, MAT_MUD, MAT_SAND, type Terrain } from '../terrain';

export const WN = 128;
export const WCS = SIZE / WN; // 1,5 m
export const WA = WCS * WCS;
export const TS = 8;
export const TN = WN / TS;
const G = 9.81;
const N2 = 0.035 * 0.035; // Manning
const UMAX = 7;
const SUB = 3; // vértices do terreno por célula
const WT = [0.5, 1, 1, 0.5];
const CALM_STEPS = 60;
const EPS = 1e-4;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export class WaterSim {
  readonly b = new Float32Array(WN * WN);
  readonly d = new Float32Array(WN * WN);
  readonly qx = new Float32Array(WN * WN);
  readonly qz = new Float32Array(WN * WN);
  readonly ux = new Float32Array(WN * WN);
  readonly uz = new Float32Array(WN * WN);
  /** sedimento em suspensão (m³) */
  readonly sed = new Float32Array(WN * WN);
  /** chão mínimo (erosão não passa daqui) e erodibilidade 0..~2 */
  readonly floor = new Float32Array(WN * WN);
  readonly erod = new Float32Array(WN * WN);
  private K = new Float32Array(WN * WN);
  private d0 = new Float32Array(WN * WN);
  /** ladrilhos: acordado, passos calmos, no conjunto P, mudou (render/rede), tem água */
  readonly awake = new Uint8Array(TN * TN);
  private calm = new Uint16Array(TN * TN);
  private inP = new Uint8Array(TN * TN);
  readonly chgR = new Uint8Array(TN * TN);
  private chgN = new Uint8Array(TN * TN);
  readonly wetT = new Uint8Array(TN * TN);
  /** célula mais rápida por ladrilho (respingos) */
  readonly hot = new Int32Array(TN * TN);
  readonly hotV = new Float32Array(TN * TN);
  private pList = new Int32Array(TN * TN);
  /** retângulo do terreno alterado (em células) — o chão b é refeito no próximo passo */
  private dirty = { c0: WN, r0: WN, c1: -1, r1: -1 };
  /** terreno editado pela própria erosão (bbox em vértices) */
  private eBox = { i0: V, j0: V, i1: -1, j1: -1 };
  private relaxQ: number[] = [];
  /** estatística (debug/medição) */
  stat = { steps: 0, cells: 0, ms: 0 };
  vol0 = 0;

  constructor(readonly T: Terrain) {
    for (let cj = 0; cj < WN; cj++) for (let ci = 0; ci < WN; ci++) this.floor[cj * WN + ci] = avg4(T.h0, ci, cj) - 0.8;
    this.erod.fill(1);
    this.syncGround(0, 0, WN - 1, WN - 1);
  }
  /** média ponderada (4×4 vértices) de um campo do terreno na célula */
  static avg(a: Float32Array, ci: number, cj: number): number {
    return avg4(a, ci, cj);
  }

  /* ------------------------- chão a partir do terreno ------------------------- */
  syncGround(c0: number, r0: number, c1: number, r1: number): void {
    const h = this.T.h;
    for (let cj = r0; cj <= r1; cj++)
      for (let ci = c0; ci <= c1; ci++) {
        const k = cj * WN + ci;
        const nb = avg4(h, ci, cj);
        if (Math.abs(nb - this.b[k]) > 1e-4) {
          this.b[k] = nb;
          this.wakeCell(ci, cj);
        }
        if (this.floor[k] > nb) this.floor[k] = nb;
      }
  }
  /** terreno mudou em [x0..x1]×[z0..z1] (m) */
  terrainEdited(x0: number, z0: number, x1: number, z1: number): void {
    const D = this.dirty;
    const c0 = clamp(Math.floor((x0 - CELL) / WCS), 0, WN - 1);
    const c1 = clamp(Math.floor((x1 + CELL) / WCS), 0, WN - 1);
    const r0 = clamp(Math.floor((z0 - CELL) / WCS), 0, WN - 1);
    const r1 = clamp(Math.floor((z1 + CELL) / WCS), 0, WN - 1);
    if (c0 < D.c0) D.c0 = c0;
    if (r0 < D.r0) D.r0 = r0;
    if (c1 > D.c1) D.c1 = c1;
    if (r1 > D.r1) D.r1 = r1;
  }
  private flushGround(): void {
    const D = this.dirty;
    if (D.c1 < 0) return;
    this.syncGround(D.c0, D.r0, D.c1, D.r1);
    D.c0 = D.r0 = WN;
    D.c1 = D.r1 = -1;
  }

  /* ------------------------- acordar ------------------------- */
  wakeCell(ci: number, cj: number): void {
    const t = (cj >> 3) * TN + (ci >> 3);
    this.awake[t] = 1;
    this.calm[t] = 0;
  }
  wakeAt(x: number, z: number): void {
    this.wakeCell(clamp(Math.floor(x / WCS), 0, WN - 1), clamp(Math.floor(z / WCS), 0, WN - 1));
  }
  wakeAll(): void {
    for (let t = 0; t < TN * TN; t++) if (this.wetT[t]) this.wakeTile(t);
  }
  wakeTile(t: number): void {
    this.awake[t] = 1;
    this.calm[t] = 0;
  }
  get activeTiles(): number {
    let n = 0;
    for (let t = 0; t < TN * TN; t++) n += this.awake[t];
    return n;
  }

  /* ------------------------- passo ------------------------- */
  step(dt: number): void {
    const t0 = performance.now();
    this.flushGround();
    // conjunto P = acordados dilatados de 1
    const inP = this.inP;
    inP.fill(0);
    let pN = 0;
    for (let tj = 0; tj < TN; tj++)
      for (let ti = 0; ti < TN; ti++) {
        if (!this.awake[tj * TN + ti]) continue;
        for (let b = Math.max(0, tj - 1); b <= Math.min(TN - 1, tj + 1); b++)
          for (let a = Math.max(0, ti - 1); a <= Math.min(TN - 1, ti + 1); a++) {
            const u = b * TN + a;
            if (!inP[u]) {
              inP[u] = 1;
              this.pList[pN++] = u;
            }
          }
      }
    if (!pN) {
      this.stat.ms = performance.now() - t0;
      return;
    }
    const B = this.b;
    const D = this.d;
    const QX = this.qx;
    const QZ = this.qz;
    const Kc = this.K;
    const gdt = G * dt;
    // 1) fluxos nas arestas
    for (let p = 0; p < pN; p++) {
      const t = this.pList[p];
      const ti = t % TN;
      const tj = (t / TN) | 0;
      const ci0 = ti * TS;
      const cj0 = tj * TS;
      const rP = ti < TN - 1 && inP[t + 1];
      const dP = tj < TN - 1 && inP[t + TN];
      const lP = ti > 0 && inP[t - 1];
      const uP = tj > 0 && inP[t - TN];
      for (let j = cj0; j < cj0 + TS; j++) {
        const row = j * WN;
        for (let i = ci0; i < ci0 + TS; i++) {
          const k = row + i;
          const bk = B[k];
          const ek = bk + D[k];
          // direita
          if (i < WN - 1 && (i < ci0 + TS - 1 || rP)) QX[k] = flux(QX[k], ek, bk, B[k + 1] + D[k + 1], B[k + 1], gdt, dt);
          else QX[k] = 0;
          // baixo
          if (j < WN - 1 && (j < cj0 + TS - 1 || dP)) QZ[k] = flux(QZ[k], ek, bk, B[k + WN] + D[k + WN], B[k + WN], gdt, dt);
          else QZ[k] = 0;
          if (i === ci0 && i > 0 && !lP) QX[k - 1] = 0;
          if (j === cj0 && j > 0 && !uP) QZ[k - WN] = 0;
        }
      }
    }
    // 2) limitador K (não sai mais do que tem)
    for (let p = 0; p < pN; p++) {
      const t = this.pList[p];
      const ci0 = (t % TN) * TS;
      const cj0 = ((t / TN) | 0) * TS;
      for (let j = cj0; j < cj0 + TS; j++)
        for (let i = ci0; i < ci0 + TS; i++) {
          const k = j * WN + i;
          let out = 0;
          const a = QX[k];
          const c = QZ[k];
          if (a > 0) out += a;
          if (c > 0) out += c;
          if (i > 0) {
            const l = QX[k - 1];
            if (l < 0) out -= l;
          }
          if (j > 0) {
            const u = QZ[k - WN];
            if (u < 0) out -= u;
          }
          const vol = D[k] * WA;
          Kc[k] = out * dt > vol ? (out > 0 ? vol / (out * dt) : 0) : 1;
        }
    }
    // 3) escala as arestas pelo K da célula de origem
    for (let p = 0; p < pN; p++) {
      const t = this.pList[p];
      const ci0 = (t % TN) * TS;
      const cj0 = ((t / TN) | 0) * TS;
      for (let j = cj0; j < cj0 + TS; j++)
        for (let i = ci0; i < ci0 + TS; i++) {
          const k = j * WN + i;
          const a = QX[k];
          if (a > 0) QX[k] = a * Kc[k];
          else if (a < 0) QX[k] = a * Kc[k + 1];
          const c = QZ[k];
          if (c > 0) QZ[k] = c * Kc[k];
          else if (c < 0) QZ[k] = c * Kc[k + WN];
        }
    }
    // 4) profundidade, velocidades, sono
    const kA = dt / WA;
    let cells = 0;
    for (let p = 0; p < pN; p++) {
      const t = this.pList[p];
      const ci0 = (t % TN) * TS;
      const cj0 = ((t / TN) | 0) * TS;
      let mdd = 0;
      let mv = 0;
      let hk = -1;
      let wet = 0;
      for (let j = cj0; j < cj0 + TS; j++)
        for (let i = ci0; i < ci0 + TS; i++) {
          const k = j * WN + i;
          const ql = i > 0 ? QX[k - 1] : 0;
          const qu = j > 0 ? QZ[k - WN] : 0;
          const od = D[k];
          let nd = od + kA * (ql - QX[k] + qu - QZ[k]);
          if (nd < 1e-7) nd = 0;
          D[k] = nd;
          const dd = nd - od;
          if (dd > mdd) mdd = dd;
          else if (-dd > mdd) mdd = -dd;
          if (nd > 0.002) {
            wet = 1;
            const inv = 0.5 / (WCS * (nd > 0.05 ? nd : 0.05));
            const vx = (ql + QX[k]) * inv;
            const vz = (qu + QZ[k]) * inv;
            this.ux[k] = vx;
            this.uz[k] = vz;
            const sp = vx * vx + vz * vz;
            if (sp > mv) {
              mv = sp;
              hk = k;
            }
          } else {
            this.ux[k] = 0;
            this.uz[k] = 0;
          }
        }
      cells += TS * TS;
      this.wetT[t] = wet;
      this.hot[t] = hk;
      this.hotV[t] = Math.sqrt(mv);
      if (mdd > 2e-5) {
        this.chgR[t] = 1;
        this.chgN[t] = 1;
      }
      if (mdd > 2e-4 || mv > 0.0025) {
        this.awake[t] = 1;
        this.calm[t] = 0;
      } else if (this.awake[t]) {
        if (++this.calm[t] > CALM_STEPS || !wet) this.sleep(t);
      }
    }
    this.stat.steps++;
    this.stat.cells = cells;
    this.stat.ms = performance.now() - t0;
  }
  private sleep(t: number): void {
    this.awake[t] = 0;
    this.calm[t] = 0;
    const ci0 = (t % TN) * TS;
    const cj0 = ((t / TN) | 0) * TS;
    for (let j = cj0; j < cj0 + TS; j++)
      for (let i = ci0; i < ci0 + TS; i++) {
        const k = j * WN + i;
        this.qx[k] = this.qz[k] = this.ux[k] = this.uz[k] = 0;
        if (i > 0 && i === ci0) this.qx[k - 1] = 0;
        if (j > 0 && j === cj0) this.qz[k - WN] = 0;
      }
  }

  /* ------------------------- erosão / sedimento ------------------------- */
  /** dtE ~ 0,2 s. thr: velocidade que começa a arrancar terra. Devolve m³ tirados. */
  erode(dtE: number, thr: number): number {
    const T = this.T;
    const D = this.d;
    const S = this.sed;
    let total = 0;
    for (let t = 0; t < TN * TN; t++) {
      if (!this.awake[t] || !this.wetT[t]) continue;
      const ci0 = (t % TN) * TS;
      const cj0 = ((t / TN) | 0) * TS;
      for (let j = cj0; j < cj0 + TS; j++)
        for (let i = ci0; i < ci0 + TS; i++) {
          const k = j * WN + i;
          const d = D[k];
          if (d < 0.01) {
            if (S[k] > 0) this.dropSed(k, S[k]);
            continue;
          }
          const vx = this.ux[k];
          const vz = this.uz[k];
          const sp = Math.sqrt(vx * vx + vz * vz);
          const loose = this.looseAt(i, j);
          const th = loose > 0.05 ? thr * 0.6 : thr;
          const e = this.erod[k] * (loose > 0.05 ? 2 : 1);
          if (sp > th && e > 0) {
            const room = this.b[k] - this.floor[k];
            if (room > 0.005) {
              const dz = Math.min((sp - th) * 0.022 * e * Math.min(1, d / 0.25) * dtE, 0.04, room);
              if (dz > 0.0005) {
                this.cut(i, j, dz);
                S[k] += dz * WA;
                total += dz * WA;
                if (dz > 0.008 && this.relaxQ.length < 24) this.relaxQ.push(k);
              }
            }
          } else if (S[k] > 0 && sp < th * 0.5) {
            // devagar: decanta
            this.dropSed(k, S[k] * Math.min(1, dtE * (sp < 0.3 ? 0.8 : 0.3)));
          }
          // carga máxima: 25% do volume de água
          const cap = d * WA * 0.25;
          if (S[k] > cap) this.dropSed(k, S[k] - cap);
        }
    }
    // sedimento anda com a água (fração que saiu de cada célula no último passo)
    this.advectSed(dtE);
    // margens desmoronam no canal (alarga a brecha)
    if (this.relaxQ.length) {
      for (const k of this.relaxQ) T.relax(((k % WN) + 0.5) * WCS, (((k / WN) | 0) + 0.5) * WCS, 2.2, 0.85);
      this.relaxQ.length = 0;
    }
    const E = this.eBox;
    if (E.i1 >= 0) {
      T.markRect(E.i0, E.j0, E.i1, E.j1);
      E.i0 = E.j0 = V;
      E.i1 = E.j1 = -1;
    }
    return total;
  }
  private looseAt(i: number, j: number): number {
    const k = (j * SUB + 1) * V + i * SUB + 1;
    return this.T.h[k] - this.T.h0[k];
  }
  /** abaixa (dz > 0) ou levanta (dz < 0) a célula no terreno (pesos 9 → volume dz·WA) */
  private cut(ci: number, cj: number, dz: number): void {
    const T = this.T;
    const h = T.h;
    const fl = this.floor[cj * WN + ci];
    const i0 = ci * SUB;
    const j0 = cj * SUB;
    for (let b = 0; b < 4; b++)
      for (let a = 0; a < 4; a++) {
        const i = i0 + a;
        const j = j0 + b;
        if (i > N || j > N) continue;
        const k = j * V + i;
        const w = WT[a] * WT[b];
        if (dz > 0) {
          const nh = Math.max(fl, h[k] - dz * w);
          h[k] = nh;
          if (T.mat[k] === MAT_GRASS || T.mat[k] === MAT_SAND) T.mat[k] = MAT_DIRT;
        } else {
          const add = -dz * w;
          const loose = Math.max(0, h[k] - T.h0[k]);
          // sedimento novo não tem ouro (o ouro lavado se perdeu)
          if (loose + add > 1e-5) T.pay[k] = (T.pay[k] * loose) / (loose + add);
          h[k] += add;
          if (T.mat[k] !== MAT_MUD && add > 0.01) T.mat[k] = MAT_MUD;
        }
      }
    const E = this.eBox;
    if (i0 < E.i0) E.i0 = i0;
    if (j0 < E.j0) E.j0 = j0;
    if (i0 + 3 > E.i1) E.i1 = i0 + 3;
    if (j0 + 3 > E.j1) E.j1 = j0 + 3;
  }
  private dropSed(k: number, v: number): void {
    if (v <= 0) return;
    this.sed[k] -= v;
    if (this.sed[k] < 1e-6) this.sed[k] = 0;
    this.cut(k % WN, (k / WN) | 0, -v / WA);
  }
  private advectSed(dtE: number): void {
    const S = this.sed;
    const D = this.d;
    const d0 = this.d0;
    for (let t = 0; t < TN * TN; t++) {
      if (!this.awake[t]) continue;
      const ci0 = (t % TN) * TS;
      const cj0 = ((t / TN) | 0) * TS;
      for (let j = cj0; j < cj0 + TS; j++)
        for (let i = ci0; i < ci0 + TS; i++) d0[j * WN + i] = S[j * WN + i];
    }
    // move a fração q·dtE / (d·A) para o vizinho de destino (aproximação de 1ª ordem)
    for (let t = 0; t < TN * TN; t++) {
      if (!this.awake[t]) continue;
      const ci0 = (t % TN) * TS;
      const cj0 = ((t / TN) | 0) * TS;
      for (let j = cj0; j < cj0 + TS; j++)
        for (let i = ci0; i < ci0 + TS; i++) {
          const k = j * WN + i;
          const s = d0[k];
          if (s <= 0) continue;
          const vol = Math.max(D[k] * WA, 0.05);
          const mv = (q: number, n: number) => {
            const f = Math.min(0.5, (Math.abs(q) * dtE) / vol);
            const m = s * f;
            S[k] -= m;
            S[n] += m;
          };
          const a = this.qx[k];
          if (a > 0 && i < WN - 1) mv(a, k + 1);
          const c = this.qz[k];
          if (c > 0 && j < WN - 1) mv(c, k + WN);
          if (i > 0 && this.qx[k - 1] < 0) mv(this.qx[k - 1], k - 1);
          if (j > 0 && this.qz[k - WN] < 0) mv(this.qz[k - WN], k - WN);
          if (S[k] < 0) S[k] = 0;
        }
    }
  }

  /* ------------------------- chuva, evaporação, infiltração (lento, ~1 Hz) ------------------------- */
  /** dh: m a somar em toda célula molhada (chuva − evaporação). Devolve o volume líquido trocado. */
  slow(dtS: number, dh: number, soak: number): number {
    const D = this.d;
    const B = this.b;
    let net = 0;
    for (let t = 0; t < TN * TN; t++) {
      if (!this.wetT[t]) continue;
      const ci0 = (t % TN) * TS;
      const cj0 = ((t / TN) | 0) * TS;
      let wet = 0;
      let wake = false;
      for (let j = cj0; j < cj0 + TS; j++)
        for (let i = ci0; i < ci0 + TS; i++) {
          const k = j * WN + i;
          const d = D[k];
          if (d <= 0) continue;
          let nd = d + dh;
          // lâmina fina longe de água funda: o chão bebe
          if (nd < 0.04) {
            let mx = 0;
            if (i > 0) mx = Math.max(mx, D[k - 1]);
            if (i < WN - 1) mx = Math.max(mx, D[k + 1]);
            if (j > 0) mx = Math.max(mx, D[k - WN]);
            if (j < WN - 1) mx = Math.max(mx, D[k + WN]);
            if (mx < 0.08) nd -= soak * dtS;
          }
          if (nd < 0.0015) nd = 0;
          net += (nd - d) * WA;
          D[k] = nd;
          if (nd > 0) wet = 1;
          if (dh > 0 && !wake) {
            const e = B[k] + nd;
            if ((i < WN - 1 && D[k + 1] < 0.002 && B[k + 1] < e - 0.003) || (i > 0 && D[k - 1] < 0.002 && B[k - 1] < e - 0.003) || (j < WN - 1 && D[k + WN] < 0.002 && B[k + WN] < e - 0.003) || (j > 0 && D[k - WN] < 0.002 && B[k - WN] < e - 0.003)) wake = true;
          }
        }
      this.wetT[t] = wet;
      this.chgR[t] = 1;
      this.chgN[t] = 1;
      if (wake) this.wakeTile(t);
    }
    return net;
  }

  /* ------------------------- fontes e consultas ------------------------- */
  cellOf(x: number, z: number): number {
    return clamp(Math.floor(z / WCS), 0, WN - 1) * WN + clamp(Math.floor(x / WCS), 0, WN - 1);
  }
  depthAt(x: number, z: number): number {
    return this.d[this.cellOf(x, z)];
  }
  /** nível da água (ou -1e9 se seco/raso demais) */
  surfaceAt(x: number, z: number, min = 0.04): number {
    const k = this.cellOf(x, z);
    return this.d[k] > min ? this.b[k] + this.d[k] : -1e9;
  }
  /** põe vol m³ em volta de (x,z) */
  add(x: number, z: number, vol: number): void {
    const k = this.cellOf(x, z);
    this.d[k] += vol / WA;
    const t = ((k / WN / TS) | 0) * TN + (((k % WN) / TS) | 0);
    this.wetT[t] = 1;
    this.wakeTile(t);
  }
  /** tira até vol m³ da água em volta de (x,z) (3×3 células). Devolve o que tirou. */
  take(x: number, z: number, vol: number): number {
    const c = this.cellOf(x, z);
    const ci = c % WN;
    const cj = (c / WN) | 0;
    let have = 0;
    for (let j = Math.max(0, cj - 1); j <= Math.min(WN - 1, cj + 1); j++) for (let i = Math.max(0, ci - 1); i <= Math.min(WN - 1, ci + 1); i++) have += this.d[j * WN + i];
    if (have <= 1e-6) return 0;
    const got = Math.min(vol, have * WA * 0.9);
    const f = got / (have * WA);
    for (let j = Math.max(0, cj - 1); j <= Math.min(WN - 1, cj + 1); j++)
      for (let i = Math.max(0, ci - 1); i <= Math.min(WN - 1, ci + 1); i++) {
        this.d[j * WN + i] *= 1 - f;
        this.wakeCell(i, j);
      }
    return got;
  }
  /** enche por inundação a partir de (x,z) até o nível `level`, raio máximo R (m) */
  fill(x: number, z: number, level: number, R: number): number {
    const s = this.cellOf(x, z);
    const seen = new Uint8Array(WN * WN);
    const st = [s];
    seen[s] = 1;
    let vol = 0;
    const cx = x / WCS;
    const cz = z / WCS;
    const r2 = (R / WCS) * (R / WCS);
    while (st.length) {
      const k = st.pop()!;
      if (this.b[k] >= level) continue;
      const i = k % WN;
      const j = (k / WN) | 0;
      if ((i + 0.5 - cx) ** 2 + (j + 0.5 - cz) ** 2 > r2) continue;
      const nd = level - this.b[k];
      if (nd > this.d[k]) {
        vol += (nd - this.d[k]) * WA;
        this.d[k] = nd;
      }
      this.wakeCell(i, j);
      this.wetT[(j >> 3) * TN + (i >> 3)] = 1;
      for (const n of [k - 1, k + 1, k - WN, k + WN]) {
        if (n < 0 || n >= WN * WN || seen[n]) continue;
        if ((n === k - 1 && i === 0) || (n === k + 1 && i === WN - 1)) continue;
        seen[n] = 1;
        st.push(n);
      }
    }
    return vol;
  }
  /** volume e nível médio da água num conjunto de células */
  poolStats(cells: Int32Array): { vol: number; level: number; wet: number } {
    let vol = 0;
    let lv = 0;
    let n = 0;
    for (let q = 0; q < cells.length; q++) {
      const k = cells[q];
      const d = this.d[k];
      if (d > 0.05) {
        vol += d * WA;
        lv += this.b[k] + d;
        n++;
      }
    }
    return { vol, level: n ? lv / n : -1e9, wet: n };
  }
  totalVolume(): number {
    let v = 0;
    for (let k = 0; k < WN * WN; k++) v += this.d[k];
    return v * WA;
  }
  totalSed(): number {
    let v = 0;
    for (let k = 0; k < WN * WN; k++) v += this.sed[k];
    return v;
  }

  /* ------------------------- save (profundidade em mm, RLE de zeros) ------------------------- */
  encode(): string {
    const out: number[] = [];
    let skip = 0;
    let k = 0;
    const n = WN * WN;
    while (k < n) {
      const q = Math.min(65535, Math.round(this.d[k] * 1000));
      if (q === 0) {
        skip++;
        k++;
        continue;
      }
      while (skip > 65535) {
        out.push(65535, 0);
        skip -= 65535;
      }
      const vals: number[] = [];
      while (k < n && vals.length < 65535) {
        const v = Math.min(65535, Math.round(this.d[k] * 1000));
        if (!v) break;
        vals.push(v);
        k++;
      }
      out.push(skip, vals.length, ...vals);
      skip = 0;
    }
    return u16b64(out);
  }
  decode(s: string): boolean {
    if (!s) return false;
    let a: Uint16Array;
    try {
      a = b64u16(s);
    } catch {
      return false;
    }
    this.d.fill(0);
    let p = 0;
    let k = 0;
    const n = WN * WN;
    while (p + 1 < a.length && k < n) {
      k += a[p++];
      const c = a[p++];
      for (let q = 0; q < c && k < n && p < a.length; q++, k++) this.d[k] = a[p++] / 1000;
    }
    for (let t = 0; t < TN * TN; t++) this.wetT[t] = 0;
    for (let k2 = 0; k2 < n; k2++)
      if (this.d[k2] > 0) {
        const t = (((k2 / WN) | 0) >> 3) * TN + ((k2 % WN) >> 3);
        this.wetT[t] = 1;
        this.chgR[t] = 1;
      }
    this.wakeAll();
    return true;
  }

  /* ------------------------- rede (anfitrião → convidados) -------------------------
   *  Formato (base64 de u16): por ladrilho mudado: [t | 0x8000 se tem velocidade], 64 × prof. em cm,
   *  e, com velocidade, 64 u16 com (ux, uz) em dm/s como dois i8. Só ladrilhos cuja profundidade
   *  quantizada mudou desde o último envio. Água parada = 0 bytes. */
  private netSent: Uint16Array | null = null;
  private netRot = 0;
  netStart(): void {
    this.netSent = new Uint16Array(WN * WN);
    this.netSent.fill(0xffff);
    this.chgN.fill(1);
  }
  netTake(): string {
    const sent = this.netSent;
    if (!sent) return '';
    const out: number[] = [];
    // no máx. 24 ladrilhos por retrato (o servidor descarta mensagens > 64 KB); o resto vai depois
    let sentN = 0;
    const start = this.netRot;
    for (let q = 0; q < TN * TN && sentN < 24; q++) {
      const t = (q + start) % (TN * TN);
      if (!this.chgN[t]) continue;
      this.chgN[t] = 0;
      const ci0 = (t % TN) * TS;
      const cj0 = ((t / TN) | 0) * TS;
      let diff = false;
      let moving = false;
      for (let j = cj0; j < cj0 + TS; j++)
        for (let i = ci0; i < ci0 + TS; i++) {
          const k = j * WN + i;
          const q = Math.min(65534, Math.round(this.d[k] * 100));
          if (q !== sent[k]) diff = true;
          if (Math.abs(this.ux[k]) + Math.abs(this.uz[k]) > 0.15) moving = true;
        }
      if (!diff && !moving) continue;
      sentN++;
      this.netRot = t + 1;
      out.push(t | (moving ? 0x8000 : 0));
      for (let j = cj0; j < cj0 + TS; j++)
        for (let i = ci0; i < ci0 + TS; i++) {
          const k = j * WN + i;
          const q = Math.min(65534, Math.round(this.d[k] * 100));
          sent[k] = q;
          out.push(q);
        }
      if (moving)
        for (let j = cj0; j < cj0 + TS; j++)
          for (let i = ci0; i < ci0 + TS; i++) {
            const k = j * WN + i;
            const a = clamp(Math.round(this.ux[k] * 10), -127, 127) & 0xff;
            const c = clamp(Math.round(this.uz[k] * 10), -127, 127) & 0xff;
            out.push(a | (c << 8));
          }
    }
    return out.length ? u16b64(out) : '';
  }
  /** convidado: aplica (não simula; só mostra) */
  netApply(s: string): void {
    let a: Uint16Array;
    try {
      a = b64u16(s);
    } catch {
      return;
    }
    let p = 0;
    const s8 = (v: number) => (v > 127 ? v - 256 : v) / 10;
    while (p < a.length) {
      const h = a[p++];
      const t = h & 0x7fff;
      if (t >= TN * TN) return;
      const ci0 = (t % TN) * TS;
      const cj0 = ((t / TN) | 0) * TS;
      let wet = 0;
      for (let j = cj0; j < cj0 + TS; j++)
        for (let i = ci0; i < ci0 + TS; i++) {
          const v = a[p++] ?? 0;
          this.d[j * WN + i] = v / 100;
          if (v) wet = 1;
        }
      const mv = !!(h & 0x8000);
      for (let j = cj0; j < cj0 + TS; j++)
        for (let i = ci0; i < ci0 + TS; i++) {
          const k = j * WN + i;
          if (mv) {
            const v = a[p++] ?? 0;
            this.ux[k] = s8(v & 0xff);
            this.uz[k] = s8(v >> 8);
          } else this.ux[k] = this.uz[k] = 0;
        }
      this.wetT[t] = wet;
      this.chgR[t] = 1;
      this.hotV[t] = 0;
    }
  }
}

function avg4(h: Float32Array, ci: number, cj: number): number {
  let s = 0;
  const i0 = ci * SUB;
  const j0 = cj * SUB;
  for (let b = 0; b < 4; b++) {
    const row = (j0 + b) * V + i0;
    s += (h[row] * 0.5 + h[row + 1] + h[row + 2] + h[row + 3] * 0.5) * WT[b];
  }
  return s / 9;
}

/** fluxo na aresta A→B (m³/s) com reconstrução hidrostática e atrito */
function flux(q: number, ea: number, ba: number, eb: number, bb: number, gdt: number, dt: number): number {
  const top = ea > eb ? ea : eb;
  const bot = ba > bb ? ba : bb;
  const he = top - bot;
  if (he <= EPS) return 0;
  q += gdt * he * (ea - eb);
  const u = q / (he * WCS);
  const au = u < 0 ? -u : u;
  const h125 = he * Math.sqrt(Math.sqrt(he));
  q /= 1 + (dt * G * N2 * au) / h125;
  const qm = UMAX * he * WCS;
  return q > qm ? qm : q < -qm ? -qm : q;
}

function u16b64(out: number[]): string {
  const u8 = new Uint8Array(new Uint16Array(out).buffer);
  let s = '';
  for (let k = 0; k < u8.length; k += 8192) s += String.fromCharCode(...u8.subarray(k, k + 8192));
  return btoa(s);
}
function b64u16(b64: string): Uint16Array {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length & ~1);
  for (let k = 0; k < u8.length; k++) u8[k] = bin.charCodeAt(k);
  return new Uint16Array(u8.buffer);
}
