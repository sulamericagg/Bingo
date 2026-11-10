/* ============================================================
 *  DESENHA E VIRA! — 2D → 3D.
 *   INFLAR  (Balão): malha de marching squares na silhueta, altura por
 *                    transformada de distância (perfil circular + suavização),
 *                    frente e verso costurados na borda, desenho como textura.
 *   EXTRUDAR (Bloco): THREE.Shape dos contornos (com furos) → ExtrudeGeometry com chanfro.
 *   GIRAR   (Torno): um traço = perfil → casca (parede com espessura) no LatheGeometry;
 *                    os outros traços viram decoração pintada em volta.
 *   TUBO    (Arame): traços abertos → TubeGeometry numa curva 3D (espirais viram molas).
 *  Física: peças convexas (decomposição Hertel–Mehlhorn dos contornos) ou caixas
 *  (anéis do torno / gomos do arame), tudo num referencial centrado no centro de massa.
 * ============================================================ */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { computeContours, polyArea, reshape, simplifyClosed, smoothField, type Analysis, type Wheel } from './analyze';
import { PALETTE, SIZES, ptWidth, strokeLen, type Drawing, type Material, type Stroke } from './strokes';

/** papel → mundo: X = ox + x·s, Y = oy − y·s */
export interface Mapping {
  s: number;
  ox: number;
  oy: number;
}

type V3 = [number, number, number];
export type PhysPart = { k: 'poly'; pts: [number, number][]; z0: number; z1: number } | { k: 'box'; h: V3; p: V3; q: [number, number, number, number] } | { k: 'sphere'; r: number; p: V3 };

export interface WheelPart {
  r: number;
  w: number;
  /** posição local (centro de massa do chassi = origem) */
  x: number;
  y: number;
  /** meia-bitola: rodas em z = ±track */
  track: number;
  color: string;
  tex: THREE.Texture | null;
}

export interface Built {
  mat: Material;
  geo: THREE.BufferGeometry;
  material: THREE.Material;
  parts: PhysPart[];
  volume: number;
  /** posição no mundo do centro de massa (no mapeamento usado) */
  center: THREE.Vector3;
  size: THREE.Vector3;
  colors: string[];
  wheels: WheelPart[];
  tris: number;
  dispose(): void;
}

export interface BuildOpts {
  mat: Material;
  map: Mapping;
  /** 0..3 (qualidade) */
  tier: number;
  /** arame no plano (desafios 2,5D) */
  flat?: boolean;
  /** separa rodas (veículo) */
  vehicle?: boolean;
  /** força rodas padrão se não achar nenhuma */
  forceWheels?: boolean;
}

const TEX_SIZE = [256, 512, 512, 1024];
const LATHE_SEG = [14, 20, 28, 36];
const TUBE_RAD = [5, 6, 8, 10];
const MAX_PIECES = [5, 7, 9, 12];
const DENSITY: Record<Material, number> = { inflate: 140, extrude: 420, lathe: 480, tube: 650 };

function mix(a: string, b: string, t: number): string {
  const c = new THREE.Color(a).lerp(new THREE.Color(b), t);
  return '#' + c.getHexString();
}
function makeMat(tier: number, o: { map?: THREE.Texture | null; color?: string; rough?: number; metal?: number; vc?: boolean; side?: THREE.Side }): THREE.Material {
  const base = { map: o.map ?? null, color: o.color ?? '#ffffff', vertexColors: !!o.vc, side: o.side ?? THREE.FrontSide };
  if (tier >= 2) return new THREE.MeshStandardMaterial({ ...base, roughness: o.rough ?? 0.6, metalness: o.metal ?? 0 });
  return new THREE.MeshLambertMaterial(base);
}

/* ----------------------------- volume e centro ----------------------------- */
function volumeCentroid(g: THREE.BufferGeometry): { v: number; c: THREE.Vector3 } {
  const p = g.attributes.position as THREE.BufferAttribute;
  const idx = g.index;
  const n = idx ? idx.count : p.count;
  let V = 0;
  const C = new THREE.Vector3();
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  for (let i = 0; i < n; i += 3) {
    const i0 = idx ? idx.getX(i) : i;
    const i1 = idx ? idx.getX(i + 1) : i + 1;
    const i2 = idx ? idx.getX(i + 2) : i + 2;
    a.fromBufferAttribute(p, i0);
    b.fromBufferAttribute(p, i1);
    c.fromBufferAttribute(p, i2);
    const v = a.dot(b.clone().cross(c)) / 6;
    V += v;
    C.x += v * (a.x + b.x + c.x);
    C.y += v * (a.y + b.y + c.y);
    C.z += v * (a.z + b.z + c.z);
  }
  if (Math.abs(V) < 1e-9) {
    g.computeBoundingBox();
    return { v: 0, c: g.boundingBox!.getCenter(new THREE.Vector3()) };
  }
  C.multiplyScalar(1 / (4 * V));
  return { v: Math.abs(V), c: C };
}

/* ----------------------------- textura do desenho ----------------------------- */
function drawingTexture(an: Analysis, art: HTMLCanvasElement, k: number, tier: number, fill: string): { tex: THREE.CanvasTexture; u: (x: number) => number; v: (y: number) => number } {
  const pad = an.cs * 2;
  const x0 = an.bx0 - pad;
  const y0 = an.by0 - pad;
  const w = an.bx1 - an.bx0 + pad * 2;
  const h = an.by1 - an.by0 + pad * 2;
  const T = TEX_SIZE[tier] ?? 512;
  const sc = T / Math.max(w, h);
  const c = document.createElement('canvas');
  c.width = Math.max(8, Math.round(w * sc));
  c.height = Math.max(8, Math.round(h * sc));
  const x = c.getContext('2d')!;
  x.fillStyle = fill;
  x.fillRect(0, 0, c.width, c.height);
  // leve sombreado de "papel" para não ficar chapado
  const gr = x.createRadialGradient(c.width * 0.4, c.height * 0.35, 0, c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.75);
  gr.addColorStop(0, 'rgba(255,255,255,0.18)');
  gr.addColorStop(1, 'rgba(0,0,0,0.06)');
  x.fillStyle = gr;
  x.fillRect(0, 0, c.width, c.height);
  x.imageSmoothingQuality = 'high';
  x.drawImage(art, x0 * k, y0 * k, w * k, h * k, 0, 0, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = tier >= 2 ? 4 : 1;
  return { tex, u: (lx) => (lx - x0) / w, v: (ly) => 1 - (ly - y0) / h };
}

/* ----------------------------- INFLAR ----------------------------- */
function heightField(an: Analysis, thick: number): Float32Array {
  const { gw, gh, cs, solid, dist } = an;
  const n = gw * gh;
  const H = new Float32Array(n);
  const R = Math.max(0.5, an.maxDist - 0.5) * cs;
  for (let i = 0; i < n; i++) {
    if (!solid[i]) continue;
    const d = Math.max(0, dist[i] - 0.5) * cs + cs * 0.25;
    H[i] = Math.sqrt(Math.max(0, d * (2 * R - d))) * thick;
  }
  // suaviza o vinco do eixo medial (só no miolo; a borda continua redonda)
  const T = new Float32Array(n);
  for (let pass = 0; pass < 3; pass++) {
    T.set(H);
    for (let y = 1; y < gh - 1; y++)
      for (let x = 1; x < gw - 1; x++) {
        const i = y * gw + x;
        if (!solid[i] || dist[i] < 2.2) continue;
        let s = T[i] * 2;
        let c = 2;
        for (const j of [i - 1, i + 1, i - gw, i + gw, i - gw - 1, i - gw + 1, i + gw - 1, i + gw + 1])
          if (solid[j]) {
            s += T[j];
            c++;
          }
        H[i] = s / c;
      }
  }
  return H;
}

function inflateGeo(an: Analysis, map: Mapping, uv: { u: (x: number) => number; v: (y: number) => number }, H: Float32Array): THREE.BufferGeometry {
  const { gw, gh, cs, ox, oy, solid } = an;
  const n = gw * gh;
  const f = smoothField(solid, gw, gh);
  const pos: number[] = [];
  const uvs: number[] = [];
  const ind: number[] = [];
  const nf = new Int32Array(n).fill(-1);
  const nbk = new Int32Array(n).fill(-1);
  const ev = new Map<number, number>();
  const add = (lx: number, ly: number, z: number): number => {
    pos.push(map.ox + lx * map.s, map.oy - ly * map.s, z * map.s);
    uvs.push(uv.u(lx), uv.v(ly));
    return pos.length / 3 - 1;
  };
  const node = (c: number, back: boolean): number => {
    const arr = back ? nbk : nf;
    if (arr[c] >= 0) return arr[c];
    const lx = ox + ((c % gw) + 0.5) * cs;
    const ly = oy + (((c / gw) | 0) + 0.5) * cs;
    const h = Math.max(H[c], cs * 0.15);
    arr[c] = add(lx, ly, back ? -h : h);
    return arr[c];
  };
  const edge = (e: number): number => {
    const got = ev.get(e);
    if (got !== undefined) return got;
    const c = e >> 1;
    const a = f[c];
    const b = (e & 1) === 0 ? f[c + 1] : f[c + gw];
    const t = Math.max(0, Math.min(1, (0.5 - a) / (b - a || 1e-6)));
    const i = (c % gw) + ((e & 1) === 0 ? t : 0);
    const j = ((c / gw) | 0) + ((e & 1) === 1 ? t : 0);
    const id = add(ox + (i + 0.5) * cs, oy + (j + 0.5) * cs, 0);
    ev.set(e, id);
    return id;
  };
  type It = number; // >=0: nó (célula), <0: -(aresta+1)
  const emit = (poly: It[]) => {
    if (poly.length < 3) return;
    const fr = poly.map((p) => (p >= 0 ? node(p, false) : edge(-p - 1)));
    const bk = poly.map((p) => (p >= 0 ? node(p, true) : edge(-p - 1)));
    for (let t = 1; t < poly.length - 1; t++) {
      ind.push(fr[0], fr[t + 1], fr[t]);
      ind.push(bk[0], bk[t], bk[t + 1]);
    }
  };
  for (let j = 0; j < gh - 1; j++)
    for (let i = 0; i < gw - 1; i++) {
      const c0 = j * gw + i;
      const c1 = c0 + 1;
      const c2 = c0 + gw + 1;
      const c3 = c0 + gw;
      const a = f[c0] >= 0.5,
        b = f[c1] >= 0.5,
        c = f[c2] >= 0.5,
        d = f[c3] >= 0.5;
      const k = (a ? 1 : 0) | (b ? 2 : 0) | (c ? 4 : 0) | (d ? 8 : 0);
      if (k === 0) continue;
      const eT = -(2 * c0) - 1;
      const eR = -(2 * c1 + 1) - 1;
      const eB = -(2 * c3) - 1;
      const eL = -(2 * c0 + 1) - 1;
      if (k === 5 || k === 10) {
        const mid = (f[c0] + f[c1] + f[c2] + f[c3]) / 4 >= 0.5;
        if (!mid) {
          if (k === 5) (emit([c0, eT, eL]), emit([eR, c2, eB]));
          else (emit([eT, c1, eR]), emit([eB, c3, eL]));
          continue;
        }
      }
      const poly: It[] = [];
      if (a) poly.push(c0);
      if (a !== b) poly.push(eT);
      if (b) poly.push(c1);
      if (b !== c) poly.push(eR);
      if (c) poly.push(c2);
      if (c !== d) poly.push(eB);
      if (d) poly.push(c3);
      if (d !== a) poly.push(eL);
      emit(poly);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(ind);
  g.computeVertexNormals();
  return g;
}

/* ----------------------------- decomposição convexa ----------------------------- */
function cross(o: [number, number], a: [number, number], b: [number, number]): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}
function cleanPoly(p: [number, number][], eps: number): [number, number][] {
  let q = p.slice();
  for (let changed = true; changed && q.length > 3; ) {
    changed = false;
    for (let i = 0; i < q.length; i++) {
      const a = q[(i + q.length - 1) % q.length];
      const b = q[i];
      const c = q[(i + 1) % q.length];
      const L = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1e-9;
      if (Math.abs(cross(a, b, c)) / L < eps || Math.hypot(b[0] - a[0], b[1] - a[1]) < eps) {
        q.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  if (polyArea(q) < 0) q = q.reverse();
  return q;
}
function isConvex(p: [number, number][]): boolean {
  for (let i = 0; i < p.length; i++) if (cross(p[i], p[(i + 1) % p.length], p[(i + 2) % p.length]) < -1e-9) return false;
  return true;
}
/** polígono simples (CCW, mundo) → peças convexas (Hertel–Mehlhorn guloso) */
export function convexPieces(poly: [number, number][]): [number, number][][] {
  const P = poly.map((q) => new THREE.Vector2(q[0], q[1]));
  let tris: number[][];
  try {
    tris = THREE.ShapeUtils.triangulateShape(P, []).map((t) => t.slice());
  } catch {
    return [poly];
  }
  const area = (ix: number[]) => polyArea(ix.map((i) => poly[i]));
  let polys = tris.map((t) => (area(t) < 0 ? t.reverse() : t));
  for (let merged = true; merged; ) {
    merged = false;
    outer: for (let a = 0; a < polys.length; a++)
      for (let b = a + 1; b < polys.length; b++) {
        const A = polys[a];
        const B = polys[b];
        for (let i = 0; i < A.length; i++) {
          const u = A[i];
          const v = A[(i + 1) % A.length];
          const j = B.indexOf(v);
          if (j < 0 || B[(j + 1) % B.length] !== u) continue;
          // une: A de v até u, depois B de u (exclusivo) até v (exclusivo)
          const out: number[] = [];
          for (let s = 0; s < A.length; s++) out.push(A[(i + 1 + s) % A.length]);
          const ju = (j + 1) % B.length;
          for (let s = 1; s < B.length - 1; s++) out.push(B[(ju + s) % B.length]);
          if (isConvex(out.map((q) => poly[q]))) {
            polys[a] = out;
            polys.splice(b, 1);
            merged = true;
            break outer;
          }
        }
      }
  }
  return polys.map((ix) => ix.map((i) => poly[i]));
}

function planarParts(an: Analysis, map: Mapping, tier: number, half: (piece: [number, number][]) => [number, number]): PhysPart[] {
  const toW = (p: [number, number]): [number, number] => [map.ox + p[0] * map.s, map.oy - p[1] * map.s];
  const outers = an.contours.filter((c) => !c.hole);
  const pieces: { pts: [number, number][]; a: number }[] = [];
  for (const c of outers) {
    const simp = simplifyClosed(c.pts, an.cs * 1.1).map(toW);
    const cl = cleanPoly(simp, an.cs * map.s * 0.15);
    if (cl.length < 3 || Math.abs(polyArea(cl)) < 1e-6) continue;
    for (const pc of convexPieces(cl)) {
      const q = cleanPoly(pc, an.cs * map.s * 0.05);
      if (q.length >= 3) pieces.push({ pts: q, a: Math.abs(polyArea(q)) });
    }
  }
  pieces.sort((a, b) => b.a - a.a);
  return pieces.slice(0, MAX_PIECES[tier] ?? 8).map((p) => {
    const [z0, z1] = half(p.pts);
    return { k: 'poly' as const, pts: p.pts, z0, z1 };
  });
}

/* ----------------------------- TORNO ----------------------------- */
function smoothPath(p: [number, number][], passes: number): [number, number][] {
  let q = p;
  for (let k = 0; k < passes; k++) {
    const r: [number, number][] = [q[0]];
    for (let i = 1; i < q.length - 1; i++) r.push([(q[i - 1][0] + q[i][0] * 2 + q[i + 1][0]) / 4, (q[i - 1][1] + q[i][1] * 2 + q[i + 1][1]) / 4]);
    r.push(q[q.length - 1]);
    q = r;
  }
  return q;
}
function resample(p: [number, number][], n: number): [number, number][] {
  const L: number[] = [0];
  for (let i = 1; i < p.length; i++) L.push(L[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  const tot = L[L.length - 1] || 1;
  const out: [number, number][] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const t = (k / (n - 1)) * tot;
    while (j < L.length - 2 && L[j + 1] < t) j++;
    const s = (t - L[j]) / (L[j + 1] - L[j] || 1);
    out.push([p[j][0] + (p[j + 1][0] - p[j][0]) * s, p[j][1] + (p[j + 1][1] - p[j][1]) * s]);
  }
  return out;
}

function buildLathe(d: Drawing, an: Analysis, o: BuildOpts) {
  const lt = an.lathe!;
  const s = o.map.s;
  // perfil em metros: (r, y) com y para cima
  let prof = lt.pts.map(([r, y]) => [r * s, -y * s] as [number, number]);
  prof = smoothPath(prof, 2);
  const len = prof.reduce((m, q, i) => (i ? m + Math.hypot(q[0] - prof[i - 1][0], q[1] - prof[i - 1][1]) : 0), 0);
  prof = resample(prof, Math.max(8, Math.min(30, Math.round(len / (s * 12)))));
  if (prof[0][1] > prof[prof.length - 1][1]) prof.reverse();
  const maxR = Math.max(...prof.map((q) => q[0]), s * 10);
  if (prof[0][0] < maxR * 0.12) prof[0][0] = 0;
  if (prof[prof.length - 1][0] < maxR * 0.12) prof[prof.length - 1][0] = 0;
  const th = Math.max(s * 7, Math.min(maxR * 0.12, s * (SIZES[lt.stroke.s] + 4)));
  // parede: externo (baixo→cima), borda redonda, interno (cima→baixo)
  const nrm = (i: number): [number, number] => {
    const a = prof[Math.max(0, i - 1)];
    const b = prof[Math.min(prof.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const L = Math.hypot(dx, dy) || 1;
    return [-dy / L, dx / L];
  };
  const inner = prof.map((q, i) => {
    const [nx, ny] = nrm(i);
    return [Math.max(0, q[0] + nx * th), q[1] + ny * th] as [number, number];
  });
  const pts: THREE.Vector2[] = prof.map((q) => new THREE.Vector2(q[0], q[1]));
  const top = prof[prof.length - 1];
  const itop = inner[inner.length - 1];
  if (top[0] > 0 || itop[0] > 0) {
    const cx = (top[0] + itop[0]) / 2;
    const cy = (top[1] + itop[1]) / 2;
    const a0 = Math.atan2(top[1] - cy, top[0] - cx);
    for (let k = 1; k < 4; k++) {
      const a = a0 + (k / 4) * Math.PI;
      pts.push(new THREE.Vector2(Math.max(0, cx + Math.cos(a) * th * 0.5), cy + Math.sin(a) * th * 0.5));
    }
    for (let i = inner.length - 1; i >= 0; i--) pts.push(new THREE.Vector2(inner[i][0], inner[i][1]));
  }
  const seg = LATHE_SEG[o.tier] ?? 24;
  const g = new THREE.LatheGeometry(pts, seg);
  // v = altura (para pintar faixas/decoração na altura certa)
  const ymin = Math.min(...pts.map((p) => p.y));
  const ymax = Math.max(...pts.map((p) => p.y));
  const P = g.attributes.position as THREE.BufferAttribute;
  const UV = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < P.count; i++) UV.setY(i, (P.getY(i) - ymin) / (ymax - ymin || 1));
  // textura cerâmica: cor do traço + decoração dos outros traços projetada na frente
  const T = TEX_SIZE[Math.min(2, o.tier)] ?? 512;
  const cv = document.createElement('canvas');
  cv.width = T;
  cv.height = T / 2;
  const x = cv.getContext('2d')!;
  const sc = lt.stroke.c;
  const base = sc === 0 || sc === 11 ? '#f3e7d3' : PALETTE[sc];
  x.fillStyle = base;
  x.fillRect(0, 0, cv.width, cv.height);
  // brilho de esmalte em faixas
  for (let i = 0; i < 6; i++) {
    x.fillStyle = `rgba(255,255,255,${0.04 + (i % 2) * 0.03})`;
    x.fillRect(0, (i / 6) * cv.height, cv.width, cv.height / 12);
  }
  // borda colorida
  x.fillStyle = sc === 0 || sc === 11 ? PALETTE[sc === 0 ? 0 : 7] : mix(PALETTE[sc], '#000000', 0.25);
  x.fillRect(0, 0, cv.width, cv.height * 0.035);
  const radiusAt = (yw: number): number => {
    for (let i = 1; i < prof.length; i++)
      if ((prof[i - 1][1] - yw) * (prof[i][1] - yw) <= 0) {
        const t = (yw - prof[i - 1][1]) / (prof[i][1] - prof[i - 1][1] || 1);
        return Math.max(s * 6, prof[i - 1][0] + (prof[i][0] - prof[i - 1][0]) * t);
      }
    return maxR;
  };
  const decor = d.strokes.filter((q) => q.t === 'pen' && q !== lt.stroke);
  x.lineCap = 'round';
  x.lineJoin = 'round';
  for (const q of decor) {
    x.strokeStyle = x.fillStyle = PALETTE[q.c];
    const paths = q.m ? [q.p, q.p.map((v, i) => (i % 3 === 0 ? d.w - v : v))] : [q.p];
    for (const p of paths) {
      x.beginPath();
      let prevU = -1;
      for (let i = 0; i < p.length; i += 3) {
        const yw = -p[i + 1] * s;
        const R = radiusAt(yw);
        let u = ((p[i] - lt.axis) * s) / (2 * Math.PI * R);
        u = ((u % 1) + 1) % 1;
        const X = u * cv.width;
        const Y = (1 - (yw - ymin) / (ymax - ymin || 1)) * cv.height;
        x.lineWidth = Math.max(2, (ptWidth(q, p[i + 2]) * s * cv.height) / (ymax - ymin || 1));
        if (i === 0 || Math.abs(u - prevU) > 0.5) x.moveTo(X, Y);
        else x.lineTo(X, Y);
        prevU = u;
      }
      if (p.length === 3) {
        x.arc(((((p[0] - lt.axis) * s) / (2 * Math.PI * radiusAt(-p[1] * s)) + 1) % 1) * cv.width, (1 - (-p[1] * s - ymin) / (ymax - ymin || 1)) * cv.height, 3, 0, 7);
        x.fill();
      } else x.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  const material = makeMat(o.tier, { map: tex, rough: 0.28 });
  // física: anéis de caixas ao longo do perfil + fundo
  const K = o.tier <= 0 ? 6 : 8;
  const S = Math.max(2, Math.min(o.tier <= 0 ? 3 : 5, Math.round(len / (maxR * 0.9))));
  const coarse = resample(prof, S + 1);
  const parts: PhysPart[] = [];
  const m4 = new THREE.Matrix4();
  const q4 = new THREE.Quaternion();
  for (let i = 0; i < S; i++) {
    const [r0, y0] = coarse[i];
    const [r1, y1] = coarse[i + 1];
    const rm = (r0 + r1) / 2;
    const ym = (y0 + y1) / 2;
    const L = Math.hypot(r1 - r0, y1 - y0);
    if (L < 1e-4) continue;
    if (rm < th * 1.2) {
      parts.push({ k: 'box', h: [Math.max(th, rm + th / 2), Math.max(th / 2, L / 2), Math.max(th, rm + th / 2)], p: [0, ym, 0], q: [0, 0, 0, 1] });
      continue;
    }
    for (let kk = 0; kk < K; kk++) {
      const ph = (kk / K) * Math.PI * 2;
      const er = new THREE.Vector3(Math.sin(ph), 0, Math.cos(ph));
      const ey = new THREE.Vector3(0, 1, 0);
      const dv = er.clone().multiplyScalar((r1 - r0) / L).addScaledVector(ey, (y1 - y0) / L);
      const nv = er.clone().multiplyScalar(-(y1 - y0) / L).addScaledVector(ey, (r1 - r0) / L);
      const zv = dv.clone().cross(nv);
      m4.makeBasis(dv, nv, zv);
      q4.setFromRotationMatrix(m4);
      const c = er.clone().multiplyScalar(rm).addScaledVector(nv, th / 2);
      parts.push({ k: 'box', h: [L / 2 + th * 0.3, th / 2, Math.max(th, (rm * Math.PI) / K) * 1.05], p: [c.x, ym + nv.y * th * 0.5, c.z], q: [q4.x, q4.y, q4.z, q4.w] });
    }
  }
  // fundo maciço se o perfil começa no eixo
  if (prof[0][0] === 0 && coarse.length > 1) {
    const rb = Math.max(...prof.slice(0, 4).map((q) => q[0]));
    if (rb > th) parts.push({ k: 'box', h: [rb * 0.72, th / 2, rb * 0.72], p: [0, prof[0][1] + th / 2, 0], q: [0, 0, 0, 1] });
  }
  // posição: eixo no mundo
  const ax = o.map.ox + lt.axis * s;
  g.translate(ax, o.map.oy, 0);
  for (const p of parts) if (p.k === 'box') (p.p[0] += ax), (p.p[1] += o.map.oy);
  return { g, material, parts, tex, colors: [base, ...decor.map((q) => PALETTE[q.c])] };
}

/* ----------------------------- ARAME ----------------------------- */
function buildTube(d: Drawing, an: Analysis, o: BuildOpts) {
  const s = o.map.s;
  const geos: THREE.BufferGeometry[] = [];
  const parts: PhysPart[] = [];
  const colors: string[] = [];
  let vol = 0;
  const radSeg = TUBE_RAD[o.tier] ?? 8;
  const maxBoxes = o.tier <= 0 ? 16 : o.tier === 1 ? 24 : 36;
  const paths: { p: number[]; st: Stroke }[] = [];
  for (const st of an.pens) {
    paths.push({ p: st.p, st });
    if (st.m) paths.push({ p: st.p.map((v, i) => (i % 3 === 0 ? d.w - v : v)), st });
  }
  const totalLen = paths.reduce((m, q) => m + strokeLen(q.st), 0) || 1;
  for (const { p, st } of paths) {
    let pts: [number, number][] = [];
    for (let i = 0; i < p.length; i += 3) pts.push([p[i], p[i + 1]]);
    const L = strokeLen(st);
    let avgW = 0;
    for (let i = 2; i < p.length; i += 3) avgW += ptWidth(st, p[i]);
    avgW /= Math.max(1, p.length / 3);
    const r = Math.max(0.012, (avgW / 2) * s * 1.05);
    const col = PALETTE[st.c];
    colors.push(col);
    if (pts.length < 2 || L < 3) {
      // ponto: vira uma bolinha
      const sg = new THREE.SphereGeometry(r * 1.4, radSeg + 2, radSeg);
      sg.translate(o.map.ox + pts[0][0] * s, o.map.oy - pts[0][1] * s, 0);
      paintGeo(sg, col);
      geos.push(sg);
      parts.push({ k: 'sphere', r: r * 1.4, p: [o.map.ox + pts[0][0] * s, o.map.oy - pts[0][1] * s, 0] });
      vol += (4 / 3) * Math.PI * (r * 1.4) ** 3;
      continue;
    }
    pts = smoothPath(resample(pts, Math.max(4, Math.min(90, Math.round(L / 7)))), 2);
    // z: o quanto o traço "enrola" (espiral desenhada vira mola 3D)
    const zs: number[] = [0];
    if (!o.flat) {
      let turn = 0;
      const span = Math.max(an.bx1 - an.bx0, an.by1 - an.by0) * s;
      const pitch = Math.max(r * 3.2, span * 0.16);
      for (let i = 1; i < pts.length; i++) {
        if (i >= 2) {
          const a1 = Math.atan2(pts[i - 1][1] - pts[i - 2][1], pts[i - 1][0] - pts[i - 2][0]);
          const a2 = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
          let da = a2 - a1;
          while (da > Math.PI) da -= Math.PI * 2;
          while (da < -Math.PI) da += Math.PI * 2;
          turn += da;
        }
        zs.push((Math.abs(turn) / (Math.PI * 2)) * pitch);
      }
      const zm = (Math.max(...zs) + Math.min(...zs)) / 2;
      for (let i = 0; i < zs.length; i++) zs[i] -= zm;
    } else for (let i = 1; i < pts.length; i++) zs.push(0);
    const v3 = pts.map(([x, y], i) => new THREE.Vector3(o.map.ox + x * s, o.map.oy - y * s, zs[i]));
    const curve = new THREE.CatmullRomCurve3(v3, false, 'centripetal');
    const clen = curve.getLength();
    const tg = new THREE.TubeGeometry(curve, Math.max(8, Math.min(220, Math.round(clen / (r * 1.2)))), r, radSeg, false);
    paintGeo(tg, col);
    geos.push(tg);
    for (const e of [v3[0], v3[v3.length - 1]]) {
      const sg = new THREE.SphereGeometry(r, radSeg, Math.max(4, radSeg - 2));
      sg.translate(e.x, e.y, e.z);
      paintGeo(sg, col);
      geos.push(sg);
    }
    vol += Math.PI * r * r * clen;
    // física: gomos (caixas) ao longo da curva
    const nb = Math.max(1, Math.min(Math.round((maxBoxes * L) / totalLen), Math.round(clen / (r * 2.5))));
    const cp = curve.getSpacedPoints(nb);
    for (let i = 0; i < nb; i++) {
      const a = cp[i];
      const b = cp[i + 1];
      const dv = b.clone().sub(a);
      const l = dv.length();
      if (l < 1e-5) continue;
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dv.normalize());
      const m = a.clone().add(b).multiplyScalar(0.5);
      parts.push({ k: 'box', h: [l / 2 + r * 0.4, r, r], p: [m.x, m.y, m.z], q: [q.x, q.y, q.z, q.w] });
    }
  }
  if (!geos.length) return null;
  const g = mergeGeometries(geos.map((x) => (x.index ? x.toNonIndexed() : x)), false)!;
  geos.forEach((x) => x.dispose());
  const material = makeMat(o.tier, { vc: true, rough: 0.35, metal: 0.25 });
  return { g, material, parts, vol, colors };
}
function paintGeo(g: THREE.BufferGeometry, hex: string): void {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) (a[i * 3] = c.r), (a[i * 3 + 1] = c.g), (a[i * 3 + 2] = c.b);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  // remove atributos diferentes entre geometrias (merge exige o mesmo conjunto)
  if (g.attributes.uv) g.deleteAttribute('uv');
}

/* ----------------------------- rodas ----------------------------- */
function wheelTexture(art: HTMLCanvasElement | null, k: number, w: Wheel | null, col: string, tier: number): THREE.CanvasTexture {
  const S = tier >= 2 ? 256 : 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d')!;
  x.fillStyle = col;
  x.fillRect(0, 0, S, S);
  if (art && w) {
    x.save();
    x.beginPath();
    x.arc(S / 2, S / 2, S / 2, 0, 7);
    x.clip();
    x.fillStyle = mix(col, '#ffffff', 0.55);
    x.fillRect(0, 0, S, S);
    x.drawImage(art, (w.x - w.r) * k, (w.y - w.r) * k, w.r * 2 * k, w.r * 2 * k, 0, 0, S, S);
    x.restore();
  } else {
    x.fillStyle = '#2a1e3a';
    x.beginPath();
    x.arc(S / 2, S / 2, S / 2, 0, 7);
    x.fill();
    x.fillStyle = '#d9d4ea';
    x.beginPath();
    x.arc(S / 2, S / 2, S * 0.26, 0, 7);
    x.fill();
    x.fillStyle = '#8a5cff';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      x.beginPath();
      x.arc(S / 2 + Math.cos(a) * S * 0.14, S / 2 + Math.sin(a) * S * 0.14, S * 0.04, 0, 7);
      x.fill();
    }
  }
  // marcas para ver a roda girar
  x.strokeStyle = 'rgba(0,0,0,.35)';
  x.lineWidth = S * 0.03;
  x.beginPath();
  x.moveTo(S / 2, S * 0.1);
  x.lineTo(S / 2, S * 0.3);
  x.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ----------------------------- montagem ----------------------------- */
export function build(d: Drawing, art: HTMLCanvasElement, k: number, an0: Analysis, o: BuildOpts): Built | null {
  let mat = o.mat;
  let an = an0;
  const tier = o.tier;
  const s = o.map.s;
  // veículo: tira as rodas da silhueta
  let wheelSrc: (Wheel | null)[] = [];
  if (o.vehicle) {
    if (mat === 'lathe' || mat === 'tube') mat = an.blocky ? 'extrude' : 'inflate';
    if (an.wheels.length >= 2) {
      const sol = an.solid.slice();
      for (const w of an.wheels) for (const c of w.cells) sol[c] = 0;
      // e um anel de 1 célula em volta
      const cut = sol.slice();
      for (const w of an.wheels) {
        const r = w.r / an.cs + 1;
        const cx = (w.x - an.ox) / an.cs;
        const cy = (w.y - an.oy) / an.cs;
        for (let y = Math.floor(cy - r); y <= cy + r; y++)
          for (let x = Math.floor(cx - r); x <= cx + r; x++)
            if (x >= 0 && y >= 0 && x < an.gw && y < an.gh && (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) cut[y * an.gw + x] = 0;
      }
      let left = 0;
      for (let i = 0; i < cut.length; i++) left += cut[i];
      if (left > an.area * 0.25) an = reshape(an, cut);
      wheelSrc = an0.wheels;
    } else if (o.forceWheels) wheelSrc = [null, null];
  }
  let geo: THREE.BufferGeometry;
  let material: THREE.Material;
  let parts: PhysPart[];
  let colors: string[] = [an.dominant];
  const texs: THREE.Texture[] = [];
  let volume = 0;
  let halfT = 0.05;
  if (mat === 'lathe' && !an.lathe) mat = 'tube';
  if ((mat === 'inflate' || mat === 'extrude') && an.area < 6) mat = 'tube';
  if (mat === 'inflate' || mat === 'extrude') {
    const enclosedFill = an.enclosed > 0.12 ? mix(an.dominant, '#ffffff', an.dominant === PALETTE[11] ? 0 : 0.72) : an.dominant;
    const T = drawingTexture(an, art, k, tier, enclosedFill);
    texs.push(T.tex);
    if (mat === 'inflate') {
      const H = heightField(an, 0.62);
      geo = inflateGeo(an, o.map, T, H);
      material = makeMat(tier, { map: T.tex, rough: 0.42 });
      parts = planarParts(an, o.map, tier, (pc) => {
        let mh = 0;
        for (let y = 0; y < an.gh; y++)
          for (let x = 0; x < an.gw; x++) {
            const i = y * an.gw + x;
            if (!an.solid[i]) continue;
            const wx = o.map.ox + (an.ox + (x + 0.5) * an.cs) * s;
            const wy = o.map.oy - (an.oy + (y + 0.5) * an.cs) * s;
            let ins = true;
            for (let j = 0; j < pc.length && ins; j++) if (cross(pc[j], pc[(j + 1) % pc.length], [wx, wy]) < 0) ins = false;
            if (ins) mh = Math.max(mh, H[i]);
          }
        const h = Math.max(an.cs * 0.6, mh * 0.78) * s;
        halfT = Math.max(halfT, h);
        return [-h, h];
      });
    } else {
      const toW = (p: [number, number]) => new THREE.Vector2(o.map.ox + p[0] * s, o.map.oy - p[1] * s);
      const shapes: THREE.Shape[] = [];
      const outerIdx = an.contours.map((c, i) => (!c.hole ? i : -1)).filter((i) => i >= 0);
      for (const oi of outerIdx) {
        const sh = new THREE.Shape(an.contours[oi].pts.map(toW));
        for (const h of an.contours) if (h.hole && h.parent === oi) sh.holes.push(new THREE.Path(h.pts.map(toW)));
        shapes.push(sh);
      }
      const minSide = Math.min(an.bx1 - an.bx0, an.by1 - an.by0) * s;
      const depth = Math.max(0.05, Math.min(minSide * 0.45, Math.max(an.bx1 - an.bx0, an.by1 - an.by0) * s * 0.22));
      const bev = Math.min(depth * 0.18, minSide * 0.08, an.cs * s * 1.2);
      geo = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 0.7, bevelSegments: tier >= 2 ? 3 : 1, curveSegments: 1, steps: 1 });
      geo.translate(0, 0, -depth / 2);
      geo.clearGroups();
      const P = geo.attributes.position as THREE.BufferAttribute;
      const UV = geo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < P.count; i++) UV.setXY(i, T.u((P.getX(i) - o.map.ox) / s), T.v((o.map.oy - P.getY(i)) / s));
      material = makeMat(tier, { map: T.tex, rough: 0.68 });
      halfT = depth / 2 + bev;
      parts = planarParts(an, o.map, tier, () => [-halfT, halfT]);
    }
  } else if (mat === 'lathe') {
    const L = buildLathe(d, an, o);
    geo = L.g;
    material = L.material;
    parts = L.parts;
    texs.push(L.tex);
    colors = L.colors;
  } else {
    const T = buildTube(d, an, o);
    if (!T) return null;
    geo = T.g;
    material = T.material;
    parts = T.parts;
    volume = T.vol;
    colors = T.colors;
  }
  // centro de massa → origem local
  const vc = volumeCentroid(geo);
  if (!volume) volume = vc.v;
  const c = vc.c;
  geo.translate(-c.x, -c.y, -c.z);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  for (const p of parts) {
    if (p.k === 'poly') {
      p.pts = p.pts.map(([x, y]) => [x - c.x, y - c.y]);
      p.z0 -= c.z;
      p.z1 -= c.z;
    } else {
      p.p[0] -= c.x;
      p.p[1] -= c.y;
      p.p[2] -= c.z;
    }
  }
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const size = geo.boundingBox!.getSize(new THREE.Vector3());
  // rodas
  const wheels: WheelPart[] = [];
  if (wheelSrc.length) {
    const bb = geo.boundingBox!;
    wheelSrc.forEach((w, i) => {
      let wx: number, wy: number, r: number, col: string;
      if (w) {
        wx = o.map.ox + w.x * s - c.x;
        wy = o.map.oy - w.y * s - c.y;
        r = w.r * s;
        col = w.color;
      } else {
        r = Math.max(0.08, Math.min(size.x, size.y) * 0.3);
        wx = i === 0 ? bb.min.x + size.x * 0.2 : bb.max.x - size.x * 0.2;
        wy = bb.min.y + r * 0.3;
        col = '#2a1e3a';
      }
      const ww = Math.max(0.04, Math.min(r * 0.8, 0.22));
      wheels.push({ r, w: ww, x: wx, y: wy, track: halfT + ww / 2 + 0.01, color: col, tex: wheelTexture(w ? art : null, k, w, col, tier) });
    });
  }
  const mass = 0;
  void mass;
  const tris = (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
  return {
    mat,
    geo,
    material,
    parts,
    volume: Math.max(volume, 1e-4),
    center: c,
    size,
    colors: [...new Set(colors)].slice(0, 5),
    wheels,
    tris,
    dispose() {
      geo.dispose();
      material.dispose();
      texs.forEach((t) => t.dispose());
      wheels.forEach((w) => w.tex?.dispose());
    },
  };
}

export const densityOf = (m: Material): number => DENSITY[m];
export { computeContours };
