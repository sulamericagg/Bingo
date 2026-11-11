/* ============================================================
 *  CAVA & FALA — OBJETO FALADO → BLOCOS.
 *  O objeto (peças primitivas, shared/cavaspec.ts) vira uma grade de
 *  blocos (voxels) no estilo do jogo: cada bloco é material cavado.
 *  Determinístico (mesma peça → mesmos blocos em todo aparelho).
 *  Peças com junta (roda, asa, hélice...) viram grupos à parte que
 *  o motor gira. Sem three.js aqui (testável no Node).
 * ============================================================ */
import { PALETTE, type ObjJoint, type ObjMat, type ObjSpec, type V3 } from '../../../shared/cavaspec';

export interface Cell {
  /** centro do bloco, relativo ao pivô do grupo */
  x: number;
  y: number;
  z: number;
  col: number;
  mat: ObjMat;
  /** a ordem de montagem (de baixo para cima) */
  ord: number;
}
export interface VGroup {
  joint: ObjJoint | null;
  pivot: V3;
  cells: Cell[];
  /** maior distância do pivô (raio da roda etc.) */
  radius: number;
}
export interface Voxels {
  v: number;
  groups: VGroup[];
  /** todos os blocos (inclusive escondidos por dentro) */
  count: number;
  /** blocos desenhados (casca) */
  shown: number;
  min: V3;
  max: V3;
  /** volume ocupado (m³) */
  vol: number;
  /** blocos por tipo de material (custo) */
  byKind: { soft: number; stone: number; crystal: number; gold: number };
}

const D2R = Math.PI / 180;
/** matriz 3x3 de rotação Euler XYZ (mesma ordem do three.js) */
function rotM(r: V3): number[] {
  const [a, b, c] = [r[0] * D2R, r[1] * D2R, r[2] * D2R];
  const ca = Math.cos(a),
    sa = Math.sin(a),
    cb = Math.cos(b),
    sb = Math.sin(b),
    cc = Math.cos(c),
    sc = Math.sin(c);
  // R = Rx * Ry * Rz (three.js 'XYZ')
  return [cb * cc, -cb * sc, sb, ca * sc + sa * sb * cc, ca * cc - sa * sb * sc, -sa * cb, sa * sc - ca * sb * cc, sa * cc + ca * sb * sc, ca * cb];
}

/** dentro da forma? (coordenadas locais normalizadas: -0.5..0.5 em cada eixo da caixa) */
function inside(shape: string, x: number, y: number, z: number, hs: V3): boolean {
  switch (shape) {
    case 'box':
      return Math.abs(x) <= 0.5 && Math.abs(y) <= 0.5 && Math.abs(z) <= 0.5;
    case 'sphere':
      return x * x + y * y + z * z <= 0.25;
    case 'cylinder':
      return x * x + z * z <= 0.25 && Math.abs(y) <= 0.5;
    case 'cone': {
      if (Math.abs(y) > 0.5) return false;
      const r = 0.5 * (0.5 - y);
      return x * x + z * z <= r * r;
    }
    case 'capsule': {
      // raio = menor meia-largura; segmento ao longo de y
      const rw = Math.min(hs[0], hs[2]);
      const half = Math.max(0, hs[1] - rw);
      const wx = x * hs[0] * 2,
        wy = y * hs[1] * 2,
        wz = z * hs[2] * 2;
      const cy = Math.max(-half, Math.min(half, wy));
      const dx = wx / (hs[0] / rw),
        dz = wz / (hs[2] / rw);
      return dx * dx + (wy - cy) * (wy - cy) + dz * dz <= rw * rw;
    }
    case 'torus': {
      // anel deitado (furo para cima): diâmetro externo = x/z, espessura = y
      const tube = Math.min(0.5, hs[1] / Math.max(1e-3, hs[0]));
      const R = 0.5 - tube / 2;
      const q = Math.sqrt(x * x + z * z) - R;
      const yy = y * (hs[1] / Math.max(1e-3, hs[0]));
      return q * q + yy * yy <= (tube / 2) * (tube / 2) && Math.abs(y) <= 0.5;
    }
    case 'wedge':
      // rampa: alta atrás (-z), zero na frente (+z)
      return Math.abs(x) <= 0.5 && Math.abs(z) <= 0.5 && y >= -0.5 && y <= -z;
  }
  return false;
}

const hex = (c: string) => parseInt(c.slice(1), 16);
const MAX_CELLS = 9000;

/** escolhe o tamanho do bloco pelo tamanho do objeto */
export function voxelSize(ext: number): number {
  return Math.max(0.1, Math.min(0.42, ext / 18));
}

export function voxelize(spec: ObjSpec, vForce?: number): Voxels {
  // caixa do objeto
  const lo: V3 = [Infinity, Infinity, Infinity],
    hi: V3 = [-Infinity, -Infinity, -Infinity];
  const mats = spec.parts.map((p) => rotM(p.rot));
  spec.parts.forEach((p, i) => {
    const m = mats[i];
    for (let k = 0; k < 8; k++) {
      const cx = ((k & 1 ? 1 : -1) * p.size[0]) / 2,
        cy = ((k & 2 ? 1 : -1) * p.size[1]) / 2,
        cz = ((k & 4 ? 1 : -1) * p.size[2]) / 2;
      const w = [m[0] * cx + m[1] * cy + m[2] * cz + p.pos[0], m[3] * cx + m[4] * cy + m[5] * cz + p.pos[1], m[6] * cx + m[7] * cy + m[8] * cz + p.pos[2]];
      for (let a = 0; a < 3; a++) (lo[a] = Math.min(lo[a], w[a])), (hi[a] = Math.max(hi[a], w[a]));
    }
  });
  const ext = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], 0.3);
  let v = vForce ?? voxelSize(ext);
  // muitos blocos? aumenta o bloco
  for (let tries = 0; tries < 6; tries++) {
    const est = spec.parts.reduce((n, p) => n + Math.max(1, (Math.max(p.size[0], v) * Math.max(p.size[1], v) * Math.max(p.size[2], v)) / v ** 3), 0);
    if (est <= MAX_CELLS * 1.6 || vForce) break;
    v *= 1.2;
  }
  // uma grade por grupo: 0 = fixo; junta = grupo próprio
  const groups: { joint: ObjJoint | null; pivot: V3; map: Map<string, { col: number; mat: ObjMat; i: number; j: number; k: number }> }[] = [{ joint: null, pivot: [0, 0, 0], map: new Map() }];
  spec.parts.forEach((p, pi) => {
    const m = mats[pi];
    let g = groups[0];
    if (p.joint) {
      g = { joint: p.joint, pivot: p.joint.pivot ?? [...p.pos], map: new Map() };
      groups.push(g);
    }
    // tamanho efetivo: no mínimo 1 bloco de espessura (peça fina não some)
    const es: V3 = [Math.max(p.size[0], v * 1.01), Math.max(p.size[1], v * 1.01), Math.max(p.size[2], v * 1.01)];
    const hs: V3 = [es[0] / 2, es[1] / 2, es[2] / 2];
    // caixa da peça no mundo do objeto
    const pl: V3 = [Infinity, Infinity, Infinity],
      ph: V3 = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < 8; k++) {
      const cx = (k & 1 ? 1 : -1) * hs[0],
        cy = (k & 2 ? 1 : -1) * hs[1],
        cz = (k & 4 ? 1 : -1) * hs[2];
      const w = [m[0] * cx + m[1] * cy + m[2] * cz + p.pos[0], m[3] * cx + m[4] * cy + m[5] * cz + p.pos[1], m[6] * cx + m[7] * cy + m[8] * cz + p.pos[2]];
      for (let a = 0; a < 3; a++) (pl[a] = Math.min(pl[a], w[a])), (ph[a] = Math.max(ph[a], w[a]));
    }
    const col = hex(PALETTE[p.color] ?? '#ffffff');
    const i0 = Math.floor(pl[0] / v),
      i1 = Math.ceil(ph[0] / v),
      j0 = Math.floor(pl[1] / v),
      j1 = Math.ceil(ph[1] / v),
      k0 = Math.floor(pl[2] / v),
      k1 = Math.ceil(ph[2] / v);
    let any = false;
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++)
        for (let k = k0; k <= k1; k++) {
          const wx = (i + 0.5) * v - p.pos[0],
            wy = (j + 0.5) * v - p.pos[1],
            wz = (k + 0.5) * v - p.pos[2];
          // mundo → local (transposta = inversa da rotação)
          const lx = m[0] * wx + m[3] * wy + m[6] * wz,
            ly = m[1] * wx + m[4] * wy + m[7] * wz,
            lz = m[2] * wx + m[5] * wy + m[8] * wz;
          if (!inside(p.shape, lx / es[0], ly / es[1], lz / es[2], hs)) continue;
          g.map.set(i + ',' + j + ',' + k, { col, mat: p.mat, i, j, k });
          any = true;
        }
    if (!any) {
      const i = Math.floor(p.pos[0] / v),
        j = Math.floor(p.pos[1] / v),
        k = Math.floor(p.pos[2] / v);
      g.map.set(i + ',' + j + ',' + k, { col, mat: p.mat, i, j, k });
    }
  });
  // saída: casca do grupo fixo (blocos escondidos não são desenhados, mas contam no custo)
  const out: VGroup[] = [];
  let count = 0,
    shown = 0;
  const byKind = { soft: 0, stone: 0, crystal: 0, gold: 0 };
  const omin: V3 = [Infinity, Infinity, Infinity],
    omax: V3 = [-Infinity, -Infinity, -Infinity];
  const gold = hex(PALETTE.gold);
  for (const g of groups) {
    const cells: Cell[] = [];
    let radius = 0;
    for (const c of g.map.values()) {
      count++;
      if (c.mat === 'metal' || c.mat === 'stone') byKind.stone++;
      else if (c.mat === 'glow' || c.mat === 'glass') byKind.crystal++;
      else if (c.col === gold) byKind.gold++;
      else byKind.soft++;
      const cx = (c.i + 0.5) * v,
        cy = (c.j + 0.5) * v,
        cz = (c.k + 0.5) * v;
      omin[0] = Math.min(omin[0], cx - v / 2);
      omin[1] = Math.min(omin[1], cy - v / 2);
      omin[2] = Math.min(omin[2], cz - v / 2);
      omax[0] = Math.max(omax[0], cx + v / 2);
      omax[1] = Math.max(omax[1], cy + v / 2);
      omax[2] = Math.max(omax[2], cz + v / 2);
      if (!g.joint) {
        const m = g.map;
        const n = (a: number, b: number, d: number) => m.has(c.i + a + ',' + (c.j + b) + ',' + (c.k + d));
        const opaque = c.mat !== 'glass' && c.mat !== 'jelly';
        if (opaque && n(1, 0, 0) && n(-1, 0, 0) && n(0, 1, 0) && n(0, -1, 0) && n(0, 0, 1) && n(0, 0, -1)) continue;
      }
      const x = cx - g.pivot[0],
        y = cy - g.pivot[1],
        z = cz - g.pivot[2];
      radius = Math.max(radius, Math.hypot(g.joint?.axis === 'x' ? 0 : x, g.joint?.axis === 'y' ? 0 : y, g.joint?.axis === 'z' ? 0 : z) + v / 2);
      cells.push({ x, y, z, col: c.col, mat: c.mat, ord: cy + Math.abs(cx) * 0.15 + Math.abs(cz) * 0.15 });
    }
    shown += cells.length;
    if (cells.length) out.push({ joint: g.joint, pivot: g.pivot, cells, radius });
  }
  return { v, groups: out, count, shown, min: omin, max: omax, vol: count * v ** 3, byKind };
}

/** custo em material (o tamanho manda): devolve unidades por tipo */
export function voxelCost(vx: Voxels, arena = false): { soft: number; stone: number; crystal: number; gold: number; total: number } {
  const per = vx.v ** 3;
  const all = vx.vol;
  // cresce menos que linear (objeto grande não fica impossível), com teto
  const base = Math.min(arena ? 70 : 170, Math.ceil(5 + 10 * Math.pow(all, 0.62)));
  const frac = (n: number) => (vx.count ? n / vx.count : 0);
  const stone = Math.min(40, Math.ceil(base * frac(vx.byKind.stone) * 0.45));
  const crystal = Math.min(14, Math.ceil(base * frac(vx.byKind.crystal) * 0.18));
  const gold = Math.min(10, Math.ceil(base * frac(vx.byKind.gold) * 0.15));
  const soft = Math.max(4, base - stone - crystal - gold);
  void per;
  return { soft, stone, crystal, gold, total: soft + stone + crystal + gold };
}
