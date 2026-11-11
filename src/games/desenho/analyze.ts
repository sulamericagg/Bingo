/* ============================================================
 *  DESENHA E VIRA! — análise do desenho 2D.
 *  bitmap → grade de tinta → regiões fechadas (inundação de fora para dentro)
 *  → silhueta (+ furos) → contornos (marching squares) → simplificação (RDP)
 *  → transformada de distância exata (Felzenszwalb) para inflar
 *  → palpites: material padrão, rodas (veículo), asas (voar).
 * ============================================================ */
import { PALETTE, strokeLen, type Drawing, type Material, type Stroke } from './strokes';

export interface Contour {
  /** pontos em unidades lógicas do papel (x, y para baixo) */
  pts: [number, number][];
  hole: boolean;
  /** índice do contorno externo (só para furos) */
  parent: number;
  area: number;
}

export interface Wheel {
  x: number;
  y: number;
  r: number;
  color: string;
  /** células da grade que pertencem à roda (para tirar do chassi) */
  cells: number[];
}

export interface Analysis {
  gw: number;
  gh: number;
  /** tamanho da célula (unidades lógicas) */
  cs: number;
  /** origem lógica da grade */
  ox: number;
  oy: number;
  ink: Float32Array;
  rgb: Uint8ClampedArray;
  solid: Uint8Array;
  /** distância (em células) até fora da silhueta */
  dist: Float32Array;
  maxDist: number;
  area: number;
  inkArea: number;
  enclosed: number;
  contours: Contour[];
  /** caixa da silhueta (lógica) */
  bx0: number;
  by0: number;
  bx1: number;
  by1: number;
  auto: Material;
  /** contorno simplificado tem poucos lados (cara de bloco) */
  blocky: boolean;
  wheels: Wheel[];
  wings: boolean;
  dominant: string;
  /** perfil do torno */
  lathe: { axis: number; pts: [number, number][]; stroke: Stroke } | null;
  /** traços abertos para o tubo */
  pens: Stroke[];
}

const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);

/* ----------------------------- transformada de distância ----------------------------- */
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -1e20;
  z[1] = 1e20;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = 1e20;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}
/** distância euclidiana exata até a célula "fora" mais próxima */
export function edt(inside: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e12;
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const g = new Float64Array(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = inside[y * w + x] ? INF : 0;
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) g[y * w + x] = d[y];
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = g[y * w + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) out[y * w + x] = Math.sqrt(d[x]);
  }
  return out;
}

/* ----------------------------- componentes / inundação ----------------------------- */
function flood(mask: (i: number) => boolean, w: number, h: number, seeds: number[], out: Int32Array, label: number): number {
  const st = seeds.slice();
  let n = 0;
  while (st.length) {
    const i = st.pop()!;
    if (out[i] !== 0 || !mask(i)) continue;
    out[i] = label;
    n++;
    const x = i % w;
    const y = (i / w) | 0;
    if (x > 0) st.push(i - 1);
    if (x < w - 1) st.push(i + 1);
    if (y > 0) st.push(i - w);
    if (y < h - 1) st.push(i + w);
  }
  return n;
}

/* ----------------------------- marching squares ----------------------------- */
/** contornos fechados do campo f (valores nos centros das células) no nível 0.5 */
export function marchingSquares(f: Float32Array, w: number, h: number): [number, number][][] {
  // segmentos ligando arestas; id da aresta: horizontal (i,j)->(i+1,j) = 2*(j*w+i), vertical (i,j)->(i,j+1) = 2*(j*w+i)+1
  const pos = new Map<number, [number, number]>();
  const nb = new Map<number, number[]>();
  const iso = 0.5;
  const P = (e: number): [number, number] => {
    let p = pos.get(e);
    if (p) return p;
    const c = e >> 1;
    const i = c % w;
    const j = (c / w) | 0;
    const a = f[c];
    if ((e & 1) === 0) {
      const b = f[c + 1];
      const tt = clamp((iso - a) / (b - a || 1e-6), 0, 1);
      p = [i + tt, j];
    } else {
      const b = f[c + w];
      const tt = clamp((iso - a) / (b - a || 1e-6), 0, 1);
      p = [i, j + tt];
    }
    pos.set(e, p);
    return p;
  };
  const link = (a: number, b: number) => {
    P(a);
    P(b);
    (nb.get(a) ?? (nb.set(a, []), nb.get(a)!)).push(b);
    (nb.get(b) ?? (nb.set(b, []), nb.get(b)!)).push(a);
  };
  for (let j = 0; j < h - 1; j++)
    for (let i = 0; i < w - 1; i++) {
      const c = j * w + i;
      const a = f[c] >= iso ? 1 : 0;
      const b = f[c + 1] >= iso ? 2 : 0;
      const cc = f[c + w + 1] >= iso ? 4 : 0;
      const d = f[c + w] >= iso ? 8 : 0;
      const k = a | b | cc | d;
      if (k === 0 || k === 15) continue;
      const eT = 2 * c; // topo (a-b)
      const eR = 2 * (c + 1) + 1; // direita (b-c)
      const eB = 2 * (c + w); // baixo (d-c)
      const eL = 2 * c + 1; // esquerda (a-d)
      switch (k) {
        case 1: case 14: link(eL, eT); break;
        case 2: case 13: link(eT, eR); break;
        case 3: case 12: link(eL, eR); break;
        case 4: case 11: link(eR, eB); break;
        case 6: case 9: link(eT, eB); break;
        case 7: case 8: link(eL, eB); break;
        case 5: case 10: {
          const mid = (f[c] + f[c + 1] + f[c + w] + f[c + w + 1]) / 4 >= iso;
          if ((k === 5) === mid) (link(eL, eB), link(eT, eR));
          else (link(eL, eT), link(eR, eB));
          break;
        }
      }
    }
  const seen = new Set<number>();
  const loops: [number, number][][] = [];
  for (const start of nb.keys()) {
    if (seen.has(start)) continue;
    const loop: [number, number][] = [];
    let prev = -1;
    let cur = start;
    for (let guard = 0; guard < 100000; guard++) {
      seen.add(cur);
      loop.push(pos.get(cur)!);
      const ns = nb.get(cur)!;
      const nx = ns[0] !== prev ? ns[0] : ns[1];
      if (nx === undefined || nx === start) break;
      if (seen.has(nx)) break;
      prev = cur;
      cur = nx;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

/* ----------------------------- simplificação ----------------------------- */
function rdp(pts: [number, number][], eps: number): [number, number][] {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const st: [number, number][] = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop()!;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const L = Math.hypot(bx - ax, by - ay) || 1e-9;
    let md = 0;
    let mi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L;
      if (d > md) (md = d), (mi = i);
    }
    if (md > eps && mi > 0) {
      keep[mi] = 1;
      st.push([a, mi], [mi, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}
/** RDP para polígono fechado (divide no ponto mais distante do primeiro) */
export function simplifyClosed(pts: [number, number][], eps: number): [number, number][] {
  if (pts.length < 5) return pts.slice();
  let far = 0;
  let fd = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2;
    if (d > fd) (fd = d), (far = i);
  }
  const a = rdp(pts.slice(0, far + 1), eps);
  const b = rdp(pts.slice(far).concat([pts[0]]), eps);
  const out = a.concat(b.slice(1, -1));
  return out.length >= 3 ? out : pts.slice(0, 3);
}
export function polyArea(p: [number, number][]): number {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += p[j][0] * p[i][1] - p[i][0] * p[j][1];
  return a / 2;
}
export function pointInPoly(x: number, y: number, p: [number, number][]): boolean {
  let ins = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i];
    const [xj, yj] = p[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
function chaikin(p: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
  }
  return out;
}

/** silhueta binária → campo suave (2× desfoque 1-2-1): contorno no nível 0,5 sem degraus */
export function smoothField(solid: Uint8Array, gw: number, gh: number): Float32Array {
  const n = gw * gh;
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = solid[i];
  const b = new Float32Array(n);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < gh; y++)
      for (let x = 1; x < gw - 1; x++) {
        const i = y * gw + x;
        b[i] = (a[i - 1] + 2 * a[i] + a[i + 1]) / 4;
      }
    for (let y = 1; y < gh - 1; y++)
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        a[i] = (b[i - gw] + 2 * b[i] + b[i + gw]) / 4;
      }
    for (let x = 0; x < gw; x++) (a[x] = 0), (a[(gh - 1) * gw + x] = 0);
    for (let y = 0; y < gh; y++) (a[y * gw] = 0), (a[y * gw + gw - 1] = 0);
  }
  return a;
}

/** contornos (externos e furos) da silhueta, em unidades lógicas */
export function computeContours(solid: Uint8Array, gw: number, gh: number, cs: number, ox: number, oy: number): Contour[] {
  const field = smoothField(solid, gw, gh);
  const loops = marchingSquares(field, gw, gh)
    .map((l) => simplifyClosed(l, 0.32))
    .filter((l) => Math.abs(polyArea(l)) > 1.2);
  // aninhamento: profundidade par = externo, ímpar = furo
  const contours: Contour[] = [];
  const areas = loops.map((l) => Math.abs(polyArea(l)));
  loops.forEach((l, i) => {
    let depth = 0;
    let parent = -1;
    let pa = 1e18;
    loops.forEach((m, j) => {
      if (i === j || areas[j] <= areas[i]) return;
      if (pointInPoly(l[0][0], l[0][1], m)) {
        depth++;
        if (areas[j] < pa) (pa = areas[j]), (parent = j);
      }
    });
    const pts = (loops[i].length > 6 ? chaikin(loops[i]) : loops[i]).map(([x, y]) => [ox + (x + 0.5) * cs, oy + (y + 0.5) * cs] as [number, number]);
    contours.push({ pts, hole: depth % 2 === 1, parent, area: areas[i] * cs * cs });
  });
  return contours;
}

/** mesma análise com outra silhueta (ex.: chassi sem as rodas) */
export function reshape(an: Analysis, solid: Uint8Array): Analysis {
  const dist = edt(solid, an.gw, an.gh);
  let maxDist = 0;
  let area = 0;
  for (let i = 0; i < solid.length; i++) {
    maxDist = Math.max(maxDist, dist[i]);
    area += solid[i];
  }
  return { ...an, solid, dist, maxDist, area, contours: computeContours(solid, an.gw, an.gh, an.cs, an.ox, an.oy) };
}

/* ----------------------------- análise principal ----------------------------- */
function nearestPal(r: number, g: number, b: number): number {
  let best = 0;
  let bd = 1e9;
  for (let i = 0; i < PALETTE.length; i++) {
    const n = parseInt(PALETTE[i].slice(1), 16);
    const d = (((n >> 16) & 255) - r) ** 2 + (((n >> 8) & 255) - g) ** 2 + ((n & 255) - b) ** 2;
    if (d < bd) (bd = d), (best = i);
  }
  return best;
}

/**
 * @param art bitmap do desenho (k px por unidade lógica)
 * @param N   células no lado maior da silhueta (resolução da malha)
 */
export function analyze(d: Drawing, art: HTMLCanvasElement, k: number, N = 56): Analysis | null {
  const pens = d.strokes.filter((s) => s.t === 'pen');
  if (!pens.length) return null;
  // 1) caixa do que tem tinta (pelos traços; o balde só pinta dentro deles)
  let x0 = 1e9,
    y0 = 1e9,
    x1 = -1e9,
    y1 = -1e9;
  for (const s of d.strokes) {
    if (s.t === 'erase') continue;
    const pad = s.t === 'pen' ? 34 : 0;
    const add = (x: number, y: number) => {
      x0 = Math.min(x0, x - pad);
      y0 = Math.min(y0, y - pad);
      x1 = Math.max(x1, x + pad);
      y1 = Math.max(y1, y + pad);
    };
    for (let i = 0; i < s.p.length; i += 3) {
      add(s.p[i], s.p[i + 1]);
      if (s.m) add(d.w - s.p[i], s.p[i + 1]);
    }
  }
  x0 = Math.max(0, x0);
  y0 = Math.max(0, y0);
  x1 = Math.min(d.w, x1);
  y1 = Math.min(d.h, y1);
  if (x1 - x0 < 4 || y1 - y0 < 4) return null;
  const cs = Math.max(x1 - x0, y1 - y0) / (N - 4);
  const ox = x0 - cs * 2;
  const oy = y0 - cs * 2;
  const gw = Math.ceil((x1 - x0) / cs) + 4;
  const gh = Math.ceil((y1 - y0) / cs) + 4;
  // 2) amostra o bitmap (redução em degraus para média de área)
  let src: HTMLCanvasElement = art;
  let sx = ox * k,
    sy = oy * k,
    sw = gw * cs * k,
    sh = gh * cs * k;
  while (sw / gw > 3) {
    const c = document.createElement('canvas');
    c.width = Math.max(gw, Math.ceil(sw / 2));
    c.height = Math.max(gh, Math.ceil(sh / 2));
    c.getContext('2d')!.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
    src = c;
    sx = 0;
    sy = 0;
    sw = c.width;
    sh = c.height;
  }
  const g = document.createElement('canvas');
  g.width = gw;
  g.height = gh;
  const gx = g.getContext('2d', { willReadFrequently: true })!;
  gx.drawImage(src, sx, sy, sw, sh, 0, 0, gw, gh);
  const px = gx.getImageData(0, 0, gw, gh).data;
  const n = gw * gh;
  const ink = new Float32Array(n);
  const rgb = new Uint8ClampedArray(n * 3);
  for (let i = 0; i < n; i++) {
    const a = px[i * 4 + 3] / 255;
    ink[i] = a;
    rgb[i * 3] = px[i * 4];
    rgb[i * 3 + 1] = px[i * 4 + 1];
    rgb[i * 3 + 2] = px[i * 4 + 2];
  }
  const inkB = (i: number) => ink[i] > 0.28;
  // 3) fora = o que se alcança da borda sem cruzar tinta
  const lab = new Int32Array(n);
  const border: number[] = [];
  for (let x = 0; x < gw; x++) border.push(x, (gh - 1) * gw + x);
  for (let y = 0; y < gh; y++) border.push(y * gw, y * gw + gw - 1);
  flood((i) => !inkB(i), gw, gh, border, lab, -1);
  const solid = new Uint8Array(n);
  for (let i = 0; i < n; i++) solid[i] = lab[i] === -1 ? 0 : 1;
  // 4) componentes; descarta migalhas
  const comp = new Int32Array(n);
  const sizes: number[] = [0];
  for (let i = 0; i < n; i++) if (solid[i] && !comp[i]) sizes.push(flood((j) => solid[j] === 1, gw, gh, [i], comp, sizes.length));
  const big = Math.max(...sizes);
  for (let i = 0; i < n; i++) if (solid[i] && sizes[comp[i]] < Math.max(3, big * 0.015)) solid[i] = 0;
  // 5) furos: em forma bem pintada (balde/borracha), buracos vazios fechados viram furos de verdade
  {
    const cInk = new Float64Array(sizes.length);
    for (let i = 0; i < n; i++) if (solid[i] && inkB(i)) cInk[comp[i]]++;
    const hl = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      if (!solid[i] || inkB(i) || hl[i]) continue;
      const c = comp[i];
      const cov = cInk[c] / sizes[c];
      const cells: number[] = [];
      const st = [i];
      while (st.length) {
        const j = st.pop()!;
        if (hl[j] || !solid[j] || inkB(j)) continue;
        hl[j] = 1;
        cells.push(j);
        const x = j % gw;
        if (x > 0) st.push(j - 1);
        if (x < gw - 1) st.push(j + 1);
        if (j >= gw) st.push(j - gw);
        if (j < n - gw) st.push(j + gw);
      }
      if (cov > 0.55 && cells.length > Math.max(4, sizes[c] * 0.025)) for (const j of cells) solid[j] = 0;
    }
  }
  let area = 0;
  let inkArea = 0;
  let bx0 = 1e9,
    by0 = 1e9,
    bx1 = -1e9,
    by1 = -1e9;
  for (let i = 0; i < n; i++) {
    if (!solid[i]) continue;
    area++;
    if (inkB(i)) inkArea++;
    const x = i % gw;
    const y = (i / gw) | 0;
    bx0 = Math.min(bx0, x);
    by0 = Math.min(by0, y);
    bx1 = Math.max(bx1, x + 1);
    by1 = Math.max(by1, y + 1);
  }
  if (area < 4) return null;
  // 6) distância e campo suave para contornos
  const dist = edt(solid, gw, gh);
  let maxDist = 0;
  for (let i = 0; i < n; i++) maxDist = Math.max(maxDist, dist[i]);
  const contours = computeContours(solid, gw, gh, cs, ox, oy);
  // 7) cor dominante
  const hist = new Array(PALETTE.length).fill(0);
  for (let i = 0; i < n; i++) if (solid[i] && ink[i] > 0.6) hist[nearestPal(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2])]++;
  const domI = hist.indexOf(Math.max(...hist));
  const dominant = PALETTE[domI];
  // 8) rodas: manchas redondas de outra cor perto da base
  const wheels = findWheels(gw, gh, cs, ox, oy, ink, rgb, solid, by0, by1, bx1 - bx0, domI);
  // 9) asas: silhueta simétrica com "braços" laterais largos
  const wings = detectWings(solid, gw, gh, bx0, bx1, by0, by1);
  // 10) material padrão
  const enclosed = (area - inkArea) / area;
  const outer = contours.filter((c) => !c.hole).sort((a, b) => b.area - a.area)[0];
  let blocky = false;
  if (outer) {
    const sim = simplifyClosed(outer.pts, cs * 1.4);
    blocky = sim.length <= 6;
  }
  const lathe = latheProfile(d, pens);
  const longest = pens.reduce((m, s) => Math.max(m, strokeLen(s)), 0);
  const totalLen = pens.reduce((m, s) => m + strokeLen(s), 0);
  const closedish = enclosed > 0.18 || (inkArea / area > 0.85 && area > 120 && maxDist > 3.2);
  let auto: Material;
  if (closedish) auto = blocky ? 'extrude' : 'inflate';
  else if (lathe && longest > totalLen * 0.5 && (lathe.fromSym || lathe.good)) auto = 'lathe';
  else auto = 'tube';
  return {
    gw, gh, cs, ox, oy, ink, rgb, solid, dist, maxDist, area, inkArea, enclosed, contours,
    bx0: ox + bx0 * cs, by0: oy + by0 * cs, bx1: ox + bx1 * cs, by1: oy + by1 * cs,
    auto, blocky, wheels, wings, dominant,
    lathe: lathe ? { axis: lathe.axis, pts: lathe.pts, stroke: lathe.stroke } : null,
    pens,
  };
}

function findWheels(gw: number, gh: number, cs: number, ox: number, oy: number, ink: Float32Array, rgb: Uint8ClampedArray, solid: Uint8Array, by0: number, by1: number, bw: number, dom: number): Wheel[] {
  const n = gw * gh;
  const pal = new Int8Array(n).fill(-1);
  for (let i = 0; i < n; i++) if (solid[i] && ink[i] > 0.45) pal[i] = nearestPal(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
  const lab = new Int32Array(n);
  const out: Wheel[] = [];
  let L = 0;
  for (let i = 0; i < n; i++) {
    if (pal[i] < 0 || lab[i] || pal[i] === dom) continue;
    const c = pal[i];
    L++;
    const cells: number[] = [];
    const st = [i];
    while (st.length) {
      const j = st.pop()!;
      if (lab[j] || pal[j] !== c) continue;
      lab[j] = L;
      cells.push(j);
      const x = j % gw;
      if (x > 0) st.push(j - 1);
      if (x < gw - 1) st.push(j + 1);
      if (j >= gw) st.push(j - gw);
      if (j < n - gw) st.push(j + gw);
    }
    if (cells.length < 6) continue;
    let x0 = 1e9,
      y0 = 1e9,
      x1 = -1e9,
      y1 = -1e9;
    for (const j of cells) {
      const x = j % gw;
      const y = (j / gw) | 0;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x + 1);
      y1 = Math.max(y1, y + 1);
    }
    const w = x1 - x0;
    const h = y1 - y0;
    if (w / h > 1.45 || h / w > 1.45) continue;
    const dia = (w + h) / 2;
    if (dia < bw * 0.08 || dia > bw * 0.55) continue;
    // área "cheia" (anel desenhado conta o miolo)
    let filled = 0;
    const r = dia / 2;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const inner: number[] = [];
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const j = y * gw + x;
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r && solid[j]) (filled++, inner.push(j));
      }
    const round = filled / (Math.PI * r * r);
    const ring = cells.length / (Math.PI * r * r);
    if (round < 0.72 || ring < 0.22) continue;
    if (cy < by0 + (by1 - by0) * 0.5) continue;
    out.push({ x: ox + cx * cs, y: oy + cy * cs, r: r * cs, color: PALETTE[c], cells: inner });
  }
  out.sort((a, b) => a.x - b.x);
  return out.length >= 2 ? out.slice(0, 4) : [];
}

function detectWings(solid: Uint8Array, gw: number, _gh: number, bx0: number, bx1: number, by0: number, by1: number): boolean {
  const cx = (bx0 + bx1) / 2;
  let inter = 0;
  let uni = 0;
  for (let y = by0; y < by1; y++)
    for (let x = bx0; x < bx1; x++) {
      const a = solid[y * gw + x];
      const mx = Math.round(2 * cx - x - 1);
      const b = mx >= 0 && mx < gw ? solid[y * gw + mx] : 0;
      if (a && b) inter++;
      if (a || b) uni++;
    }
  if (!uni || inter / uni < 0.8) return false;
  const widths: number[] = [];
  for (let y = by0; y < by1; y++) {
    let c = 0;
    for (let x = bx0; x < bx1; x++) c += solid[y * gw + x];
    widths.push(c);
  }
  const sorted = widths.filter((w) => w > 0).sort((a, b) => a - b);
  if (sorted.length < 6) return false;
  // corpo estreito (quartil de baixo) e "braços" bem mais largos no meio/alto
  const narrow = sorted[Math.floor(sorted.length * 0.25)];
  const mx = sorted[sorted.length - 1];
  const at = widths.indexOf(mx) / widths.length;
  return mx >= narrow * 2 && at > 0.1 && at < 0.8 && bx1 - bx0 > (by1 - by0) * 0.9;
}

/** perfil do torno: um traço aberto + eixo (simetria = centro do papel) */
function latheProfile(d: Drawing, pens: Stroke[]): { axis: number; pts: [number, number][]; stroke: Stroke; fromSym: boolean; good: boolean } | null {
  const s = pens.reduce((a, b) => (strokeLen(b) > strokeLen(a) ? b : a));
  const p = s.p;
  if (p.length < 9) return null;
  let x0 = 1e9,
    x1 = -1e9,
    y0 = 1e9,
    y1 = -1e9;
  for (let i = 0; i < p.length; i += 3) {
    x0 = Math.min(x0, p[i]);
    x1 = Math.max(x1, p[i]);
    y0 = Math.min(y0, p[i + 1]);
    y1 = Math.max(y1, p[i + 1]);
  }
  const span = y1 - y0;
  if (span < 20) return null;
  let axis: number;
  let fromSym = false;
  if (s.m) {
    axis = d.w / 2;
    fromSym = true;
  } else {
    const cxm = (x0 + x1) / 2;
    axis = cxm >= d.w / 2 || Math.abs(p[0] - x0) < Math.abs(p[0] - x1) ? x0 : x1;
    // perto do meio do papel? usa o meio
    if (Math.abs(axis - d.w / 2) < d.w * 0.06) axis = d.w / 2;
  }
  const side = (x1 + x0) / 2 >= axis ? 1 : -1;
  const pts: [number, number][] = [];
  let cross = 0;
  for (let i = 0; i < p.length; i += 3) {
    const r = (p[i] - axis) * side;
    if (r < -6) cross++;
    pts.push([Math.max(0, r), p[i + 1]]);
  }
  // começa ou termina no eixo e é mais alto que largo → cara de vaso/copo
  const r0 = pts[0][0];
  const rn = pts[pts.length - 1][0];
  const wmax = Math.max(...pts.map((q) => q[0]));
  // o ponto no eixo tem que ser a BASE (o fundo do vaso), não a boca
  const iAxis = r0 <= rn ? 0 : pts.length - 1;
  const atBottom = pts[iAxis][1] >= y1 - span * 0.2;
  const good = cross < pts.length * 0.1 && span > wmax * 0.7 && Math.min(r0, rn) < wmax * 0.3 && atBottom;
  return { axis, pts, stroke: s, fromSym, good };
}
