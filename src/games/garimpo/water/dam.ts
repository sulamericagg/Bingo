/* ============================================================
 *  GARIMPO BRUTO — barragem (represa) na encosta da montanha, gerada da semente.
 *  Bacia elíptica escavada na encosta, cercada por um aterro de terra (crista plana de 3 m,
 *  talude externo 1:1,6) — é terreno comum: escavadeira/trator/dinamite abrem uma brecha.
 *  Vertedouro: entalhe raso no meio da crista, revestido de cascalho, que desce num riacho
 *  com fundo sempre descendo até o lago (a enchente segue esse vale). Também garante uma
 *  borda em volta do lago para a água não vazar pelo terreno gerado.
 *  Chamado no fim de generate() (gen.ts); altera h e h0 juntos (é o terreno "gerado").
 * ============================================================ */
import { CELL, MAT_DIRT, MAT_MUD, MAT_ROAD, MAT_SAND, N, SIZE, V, type Terrain } from '../terrain';
import { roadDist, type MapInfo, type P2 } from '../gen';

export interface DamInfo {
  x: number;
  z: number;
  /** eixo "para fora" (descendo a encosta) e lateral */
  ux: number;
  uz: number;
  /** semi-eixos da bacia (m): ao longo de u, ao longo da lateral */
  A: number;
  B: number;
  /** fundo, crista e soleira do vertedouro (m) */
  floor: number;
  crest: number;
  spill: number;
  /** soleira do vertedouro e pé do talude (início do riacho) */
  sx: number;
  sz: number;
  creek: P2[];
  /** chão natural (antes do aterro) numa janela [i0..i1]×[j0..j1] de vértices — piso da erosão */
  i0: number;
  j0: number;
  i1: number;
  j1: number;
  nat: Float32Array;
}

const sst = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function carveDam(T: Terrain, m: MapInfo): DamInfo {
  const h = T.h;
  const mt = m.mountain;
  const hAt = (x: number, z: number) => T.heightAt(x, z);
  // direção: do centro da montanha para o lago, girando para longe da mina até achar lugar livre
  const aLake = Math.atan2(m.lake.z - mt.z, m.lake.x - mt.x);
  const aMine = Math.atan2(m.mine.z - mt.z, m.mine.x - mt.x);
  const away = Math.sin(aLake - aMine) >= 0 ? 1 : -1;
  const dist = mt.r * 0.56;
  let ang = aLake;
  for (let k = 0; k < 14; k++) {
    const a = aLake + away * k * 0.18;
    const x = mt.x + Math.cos(a) * dist;
    const z = mt.z + Math.sin(a) * dist;
    const ok = Math.hypot(x - m.mine.x, z - m.mine.z) > 40 && roadDist(m.road, x, z) > 28 && Math.min(x, z, SIZE - x, SIZE - z) > 30 && Math.hypot(x - m.camp.x, z - m.camp.z) > 50;
    ang = a;
    if (ok) break;
  }
  const ux = Math.cos(ang);
  const uz = Math.sin(ang);
  const vx = -uz;
  const vz = ux;
  const cx = mt.x + ux * dist;
  const cz = mt.z + uz * dist;
  const A = 9;
  const B = 16;
  const floor = hAt(cx, cz) - 2.2;
  const crest = floor + 5.6;
  const spill = crest - 0.75;
  const spillW = 2.6;
  const R = 34;
  const i0 = Math.max(0, Math.floor((cx - R) / CELL));
  const i1 = Math.min(N, Math.ceil((cx + R) / CELL));
  const j0 = Math.max(0, Math.floor((cz - R) / CELL));
  const j1 = Math.min(N, Math.ceil((cz + R) / CELL));
  const W = i1 - i0 + 1;
  const nat = new Float32Array(W * (j1 - j0 + 1));
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const k = j * V + i;
      nat[(j - j0) * W + i - i0] = h[k];
      const px = i * CELL - cx;
      const pz = j * CELL - cz;
      const lu = px * ux + pz * uz;
      const lv = px * vx + pz * vz;
      const r = Math.hypot(px, pz);
      const e = Math.hypot(lu / A, lv / B);
      // distância (m) aproximada até a elipse ao longo do raio
      const s = e > 1e-4 ? r * (1 - 1 / e) : -A;
      if (s > 26) continue;
      const n0 = h[k];
      // perfil: bacia (e²) → face interna → crista (s 1..4) → talude externo
      const bowl = floor + 2.0 * Math.min(1, e * e);
      let tgt: number;
      if (s < -3) tgt = bowl;
      else if (s < 1) tgt = bowl + (crest - bowl) * sst(-3, 1, s);
      else if (s <= 4) tgt = crest;
      else tgt = crest - (s - 4) / 1.6;
      // vertedouro: entalhe no meio da crista do lado de fora (lv≈0, lu>0)
      const spl = lu > 0 ? (1 - sst(spillW * 0.5, spillW * 0.5 + 1.6, Math.abs(lv))) : 0;
      if (spl > 0 && s > -1.5) {
        const cut = s < 4 ? crest - spill : (crest - spill) * (1 - sst(4, 6, s)) + 0.35 * sst(4, 6, s);
        tgt -= cut * spl;
      }
      let y: number;
      if (s < 1) y = tgt; // dentro: corta e aterra
      else y = Math.max(tgt, Math.min(n0, crest + (s - 1) * 0.9)); // fora: aterro; morro acima é cortado em rampa
      if (s >= 1 && spl > 0.01 && s < 12) y = Math.min(y, Math.max(tgt, n0 - 0.35 * spl));
      h[k] = y;
      if (Math.abs(y - n0) > 0.02 || s < 6) {
        T.mat[k] = s < -1 ? MAT_MUD : spl > 0.4 && s > -1 ? MAT_ROAD : s >= 1 && s <= 4 ? MAT_ROAD : MAT_DIRT;
        if (s < 0) T.wet[k] = Math.max(T.wet[k], 0.6);
      }
    }
  // riacho: do vertedouro até o lago, fundo sempre descendo (nunca corta a crista nem a bacia)
  const creek: P2[] = [];
  const keep = (x: number, z: number) => {
    const px = x - cx;
    const pz = z - cz;
    const e = Math.hypot((px * ux + pz * uz) / A, (px * vx + pz * vz) / B);
    return e > 1e-4 && Math.hypot(px, pz) * (1 - 1 / e) < 4.6;
  };
  const sx = cx + ux * (A + 4.6);
  const sz = cz + uz * (A + 4.6);
  {
    const lx = m.lake.x;
    const lz = m.lake.z;
    // segue para fora 14 m e depois mira o lago (com uma curva suave)
    const p1 = { x: sx + ux * 16, z: sz + uz * 16 };
    const mid = { x: (p1.x + lx) / 2 + vx * 8, z: (p1.z + lz) / 2 + vz * 8 };
    const pts: P2[] = [{ x: sx, z: sz }, p1, mid, { x: lx, z: lz }];
    // 1º passo: pontos e fundo a partir do chão ANTES de cavar (senão cada corte aprofunda o próximo)
    let bed = spill - 0.12;
    const beds: number[] = [];
    const hws: number[] = [];
    outer: for (let s = 0; s < pts.length - 1; s++) {
      const a = pts[s];
      const b = pts[s + 1];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      const n = Math.ceil(L / 1);
      for (let q = 0; q < n; q++) {
        const x = a.x + ((b.x - a.x) * q) / n;
        const z = a.z + ((b.z - a.z) * q) / n;
        if (Math.hypot(x - lx, z - lz) < m.lake.r + 1) break outer;
        const ground = hAt(x, z);
        bed = Math.min(bed - 0.004, ground - (creek.length < 10 ? 0.3 : 0.7));
        creek.push({ x, z });
        beds.push(bed);
        hws.push(creek.length < 10 ? 1.4 : 1.8);
      }
    }
    // 2º passo: cava
    creek.forEach((p, q) => {
      if (roadDist(m.road, p.x, p.z) < 7 || roadDist(m.gateRoad, p.x, p.z) < 7) return;
      carveCreek(T, p.x, p.z, beds[q], hws[q], keep);
    });
  }
  // borda do lago: o terreno em volta fica pelo menos um pouco acima do nível
  {
    const L = m.lake;
    const R2 = L.r + 6;
    for (let j = Math.max(0, Math.floor((L.z - R2) / CELL)); j <= Math.min(N, Math.ceil((L.z + R2) / CELL)); j++)
      for (let i = Math.max(0, Math.floor((L.x - R2) / CELL)); i <= Math.min(N, Math.ceil((L.x + R2) / CELL)); i++) {
        const d = Math.hypot(i * CELL - L.x, j * CELL - L.z);
        if (d < L.r + 2 || d > R2) continue;
        const k = j * V + i;
        const want = L.level + 0.3 * sst(L.r + 2, L.r + 4, d);
        // deixa o riacho entrar (sem dique na boca)
        let nearCreek = false;
        for (let q = Math.max(0, creek.length - 30); q < creek.length; q++)
          if (Math.hypot(creek[q].x - i * CELL, creek[q].z - j * CELL) < 3) {
            nearCreek = true;
            break;
          }
        if (!nearCreek && h[k] < want) {
          h[k] = want;
          T.mat[k] = MAT_SAND;
        }
      }
  }
  // árvores fora da bacia, do aterro e do riacho
  m.trees = m.trees.filter((t) => {
    const px = t.x - cx;
    const pz = t.z - cz;
    const e = Math.hypot((px * ux + pz * uz) / (A + 9), (px * vx + pz * vz) / (B + 8));
    if (e < 1) return false;
    for (let q = 0; q < creek.length; q += 2) if (Math.hypot(creek[q].x - t.x, creek[q].z - t.z) < 3.2) return false;
    return true;
  });
  // terreno "gerado" passa a ser este
  T.h0.set(h);
  // baixadas (poças de chuva) refeitas na janela da represa
  return { x: cx, z: cz, ux, uz, A, B, floor, crest, spill, sx, sz, creek, i0, j0, i1, j1, nat };
}

/** menor altura do terreno num anel em volta do lago (r+1 .. r+12) */
export function lakeRim(hAt: (x: number, z: number) => number, L: { x: number; z: number; r: number }): number {
  let mn = 1e9;
  for (let rr = L.r + 1; rr <= L.r + 12; rr += 1.5)
    for (let a = 0; a < 64; a++) {
      const x = Math.max(1, Math.min(SIZE - 1, L.x + Math.cos((a / 64) * Math.PI * 2) * rr));
      const z = Math.max(1, Math.min(SIZE - 1, L.z + Math.sin((a / 64) * Math.PI * 2) * rr));
      mn = Math.min(mn, hAt(x, z));
    }
  return mn;
}

function carveCreek(T: Terrain, x: number, z: number, bed: number, hw: number, keep: (x: number, z: number) => boolean): void {
  const R = hw + 6;
  const i0 = Math.max(0, Math.floor((x - R) / CELL));
  const i1 = Math.min(N, Math.ceil((x + R) / CELL));
  const j0 = Math.max(0, Math.floor((z - R) / CELL));
  const j1 = Math.min(N, Math.ceil((z + R) / CELL));
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(i * CELL - x, j * CELL - z);
      if (d > R || keep(i * CELL, j * CELL)) continue;
      const k = j * V + i;
      const y = bed + Math.max(0, d - hw) * 0.42 + (d < hw ? (d / hw) * (d / hw) * 0.15 : 0.15);
      if (y < T.h[k]) {
        T.h[k] = y;
        if (d < hw + 0.6) {
          T.mat[k] = MAT_SAND;
          T.wet[k] = Math.max(T.wet[k], 0.5);
        } else if (T.mat[k] !== MAT_ROAD) T.mat[k] = MAT_DIRT;
      }
    }
}
