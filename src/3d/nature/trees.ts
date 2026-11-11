/* ============================================================
 *  NATUREZA — árvores estilizadas (≈ 150-320 triângulos cada):
 *  copas de bolhas suaves agrupadas (normais "de copa inteira",
 *  oclusão assada na cor), troncos afinando com raízes,
 *  pinheiros de camadas macias, bétula, acácia de copa chata,
 *  palmeira, chorão. Uma geometria por espécie → InstancedMesh.
 *  lod 1 = versão de longe (~60-130 tri).
 * ============================================================ */
import * as THREE from 'three';
import { Mesher, blob, branch, canopy, leafColor, trunk, type Canopy } from './mesher';
import { rng } from './noise';

export type TreeKind = 'oak' | 'broad' | 'blossom' | 'cloud' | 'pine' | 'snowpine' | 'birch' | 'acacia' | 'palm' | 'willow' | 'twisty' | 'bamboo';

export interface TreeSpec {
  kind: TreeKind;
  /** altura total aproximada (m) */
  h: number;
  trunk: string;
  trunkDark?: string;
  leaf: string;
  leaf2: string;
  seed?: number;
  lod?: 0 | 1;
  /** frutos/flores pequenas (cor) — só de perto */
  fruit?: string;
  /** salpicos claros na copa (flores) */
  speck?: string;
}

const TAU = Math.PI * 2;
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Color();

/** geometria da árvore (origem na base do tronco, +Y para cima) */
export function natureTree(s: TreeSpec): THREE.BufferGeometry {
  const m = new Mesher();
  const R = rng((s.seed ?? 1) * 7919 + Math.round(s.h * 100));
  const lod = s.lod ?? 0;
  switch (s.kind) {
    case 'pine':
    case 'snowpine':
      pine(m, s, R, lod, s.kind === 'snowpine');
      break;
    case 'birch':
      birch(m, s, R, lod);
      break;
    case 'acacia':
      acacia(m, s, R, lod);
      break;
    case 'palm':
      palm(m, s, R, lod);
      break;
    case 'willow':
      willow(m, s, R, lod);
      break;
    case 'bamboo':
      bamboo(m, s, R, lod);
      break;
    default:
      broadleaf(m, s, R, lod);
  }
  return m.build();
}

function leafCp(s: TreeSpec, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, soft = 0.88): Canopy {
  const dark = new THREE.Color(s.leaf2).multiplyScalar(0.5);
  const light = new THREE.Color(s.leaf).lerp(_c.set('#fff6c8'), 0.12);
  const cp = canopy(cx, cy, cz, rx, ry, rz, light, dark, soft);
  cp.cards = true;
  if (s.speck) {
    cp.speck = new THREE.Color(s.speck);
    cp.speckK = 0.16;
  }
  return cp;
}

/* ------------------------------ folhosas ------------------------------ */

function broadleaf(m: Mesher, s: TreeSpec, R: () => number, lod: number): void {
  const h = s.h;
  const twisty = s.kind === 'twisty';
  const cloud = s.kind === 'cloud';
  const bend = twisty ? 1.4 : 0.7;
  const tH = h * (cloud ? 0.62 : 0.58);
  const at = trunk(m, {
    h: tH,
    r0: h * 0.05,
    r1: h * 0.022,
    radial: lod ? 4 : 6,
    rings: lod ? 1 : twisty ? 4 : 2,
    bx: (R() - 0.5) * bend,
    bz: (R() - 0.5) * bend,
    col: s.trunk,
    dark: s.trunkDark,
    flare: 0.7,
  });
  const top = at(1, new THREE.Vector3());
  // copa: elipsoide principal + 2-3 bolhas ao redor (cachos)
  const cw = h * (cloud ? 0.36 : 0.3);
  const chh = h * (cloud ? 0.2 : 0.25);
  const cy = h * 0.72;
  const cp = leafCp(s, top.x, cy, top.z, cw * 1.15, chh * 1.25, cw * 1.15);
  const a0 = R() * TAU;
  // miolo + cachos ao redor, bem sobrepostos (lê como uma copa só, cheia de calombos)
  blob(m, cp, top.x, cy + chh * 0.15, top.z, cw * 0.92, chh * 0.95, cw * 0.9, lod ? 0 : 1, R() * 10, 0.1, 0.1, a0);
  const sides = twisty ? 2 : lod ? 2 : 3;
  for (let i = 0; i < sides; i++) {
    const a = a0 + (i / sides) * TAU + (R() - 0.5) * 0.7;
    const rr = cw * (0.5 + R() * 0.15);
    const bx = top.x + Math.cos(a) * rr;
    const bz = top.z + Math.sin(a) * rr;
    const by = cy - chh * (0.2 + R() * 0.25) + (i === sides - 1 ? chh * 0.45 : 0);
    const sz = cw * (0.6 + R() * 0.12);
    if (!lod && i < 2) branch(m, at(0.62 + R() * 0.2, _a), _b.set(bx * 0.7 + top.x * 0.3, by, bz * 0.7 + top.z * 0.3), h * 0.018, new THREE.Color(s.trunkDark ?? s.trunk));
    blob(m, cp, bx, by, bz, sz, sz * (cloud ? 0.62 : 0.8), sz, lod || (i === sides - 1 && sides > 2) ? 0 : 1, R() * 10, 0.1, -0.15 + i * 0.15, a);
  }
  if (!lod && s.fruit) {
    _c.set(s.fruit);
    for (let i = 0; i < 3; i++) {
      const a = a0 + i * 2.2 + 0.4;
      const x = top.x + Math.cos(a) * cw * 0.92;
      const z = top.z + Math.sin(a) * cw * 0.92;
      const y = cy - chh * 0.25 + (i % 2) * chh * 0.3;
      const fc = leafCp(s, x, y + 0.1, z, 0.2, 0.2, 0.2, 0.3);
      fc.light = _c.clone().multiplyScalar(1.1);
      fc.dark = _c.clone().multiplyScalar(0.55);
      fc.speck = undefined;
      fc.cards = false;
      fc.jit = 0.02;
      blob(m, fc, x, y, z, h * 0.022, h * 0.022, h * 0.022, 0, i, 0.05);
    }
  }
}

function birch(m: Mesher, s: TreeSpec, R: () => number, lod: number): void {
  const h = s.h;
  const at = trunk(m, { h: h * 0.82, r0: h * 0.032, r1: h * 0.014, radial: lod ? 4 : 6, rings: lod ? 1 : 6, bx: (R() - 0.5) * 0.5, bz: (R() - 0.5) * 0.5, col: s.trunk, dark: '#8a8478', flare: 0.4, birch: true });
  const top = at(1, new THREE.Vector3());
  const cw = h * 0.17;
  const cp = leafCp(s, top.x, h * 0.7, top.z, cw * 1.2, h * 0.3, cw * 1.2);
  const n = lod ? 2 : 3;
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1 || 1);
    const p = at(0.5 + f * 0.45, _a);
    const sz = cw * (1.05 - f * 0.35);
    const a = R() * TAU;
    blob(m, cp, p.x + Math.cos(a) * cw * 0.25, h * (0.5 + f * 0.36), p.z + Math.sin(a) * cw * 0.25, sz, sz * 1.15, sz, lod ? 0 : 1, R() * 10, 0.2, f * 0.3 - 0.1, a);
  }
}

function acacia(m: Mesher, s: TreeSpec, R: () => number, lod: number): void {
  const h = s.h;
  const lean = (R() - 0.5) * 1.2;
  const at = trunk(m, { h: h * 0.62, r0: h * 0.045, r1: h * 0.022, radial: lod ? 5 : 6, rings: lod ? 1 : 3, bx: lean, bz: (R() - 0.5) * 0.6, col: s.trunk, dark: s.trunkDark, flare: 0.5 });
  const top = at(1, new THREE.Vector3());
  const cy = h * 0.8;
  const cw = h * 0.42;
  const cp = leafCp(s, top.x, cy, top.z, cw, h * 0.12, cw, 0.9);
  cp.lift = 0.45;
  const dark = new THREE.Color(s.trunkDark ?? s.trunk);
  const n = lod ? 2 : 3;
  const a0 = R() * TAU;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU;
    const rr = cw * 0.45;
    const x = top.x + Math.cos(a) * rr;
    const z = top.z + Math.sin(a) * rr;
    if (!lod) branch(m, at(0.75, _a), _b.set(x * 0.8 + top.x * 0.2, cy - h * 0.04, z * 0.8 + top.z * 0.2), h * 0.022, dark);
    const sz = cw * (0.62 + R() * 0.1);
    blob(m, cp, x, cy + (R() - 0.5) * h * 0.04, z, sz, sz * 0.24, sz * 0.9, lod ? 0 : 1, R() * 10, 0.2, (R() - 0.5) * 0.4, a);
  }
  blob(m, cp, top.x, cy + h * 0.06, top.z, cw * 0.5, cw * 0.14, cw * 0.5, 0, R() * 10, 0.15, 0.35);
}

function willow(m: Mesher, s: TreeSpec, R: () => number, lod: number): void {
  const h = s.h;
  const at = trunk(m, { h: h * 0.6, r0: h * 0.06, r1: h * 0.03, radial: lod ? 5 : 7, rings: lod ? 1 : 3, bx: (R() - 0.5) * 0.6, bz: (R() - 0.5) * 0.6, col: s.trunk, dark: s.trunkDark, flare: 0.8 });
  const top = at(1, new THREE.Vector3());
  const cw = h * 0.3;
  const cy = h * 0.74;
  const cp = leafCp(s, top.x, h * 0.55, top.z, cw * 1.25, h * 0.38, cw * 1.25, 0.88);
  blob(m, cp, top.x, cy, top.z, cw, h * 0.18, cw, lod ? 0 : 1, R() * 10, 0.15, 0.15);
  // cortinas pendentes: fitas estreitas caindo em volta da copa (com frestas), frente e verso
  const n = lod ? 7 : 12;
  const r0 = cw * 0.9;
  const yTop = cy - h * 0.02;
  const tipC = new THREE.Color(s.leaf).lerp(_c.set('#fff2b0'), 0.15);
  const half = ((Math.PI * r0) / n) * 0.62;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + R() * 0.25;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const tx = -sa;
    const tz = ca;
    const len = h * (0.34 + R() * 0.16);
    const rm = r0 + h * 0.04;
    const rb = r0 + h * 0.07;
    const pts: number[][] = [
      [ca * r0 - tx * half, yTop, sa * r0 - tz * half, 0],
      [ca * r0 + tx * half, yTop, sa * r0 + tz * half, 0],
      [ca * rm - tx * half * 0.8, yTop - len * 0.55, sa * rm - tz * half * 0.8, 0.5],
      [ca * rm + tx * half * 0.8, yTop - len * 0.55, sa * rm + tz * half * 0.8, 0.5],
      [ca * rb, yTop - len, sa * rb, 1],
    ];
    for (const back of [0, 1]) {
      const base = m.nv;
      for (const [px, py, pz, t] of pts) {
        leafColor(cp, top.x + px, py, top.z + pz, 0.1, _c);
        _c.lerp(tipC, t * 0.6);
        m.vert(top.x + px, py, top.z + pz, back ? -ca : ca, 0.35, back ? -sa : sa, _c.r, _c.g, _c.b);
      }
      if (!back) {
        m.quad(base + 2, base, base + 1, base + 3);
        m.tri(base + 2, base + 3, base + 4);
      } else {
        m.quad(base + 2, base + 3, base + 1, base);
        m.tri(base + 2, base + 4, base + 3);
      }
    }
  }
}

/* ------------------------------ coníferas ------------------------------ */

/** mistura as normais dos vértices [from, to) com a normal "da copa inteira" (elipsoide cp) */
function softenRange(m: Mesher, from: number, to: number, cp: Canopy, k: number): void {
  const P = m.pos;
  const N = m.nor;
  for (let v = from; v < to; v++) {
    const o = v * 3;
    const ny0 = N[o + 1];
    if (ny0 < -0.9) continue; // fundo das camadas fica para baixo
    let qx = (P[o] - cp.cx) / cp.rx;
    let qy = (P[o + 1] - cp.cy) / cp.ry;
    let qz = (P[o + 2] - cp.cz) / cp.rz;
    const ql = Math.hypot(qx, qy, qz) || 1;
    qx /= ql;
    qy /= ql;
    qz /= ql;
    let nx = N[o] * (1 - k) + qx * k;
    let ny = ny0 * (1 - k) + qy * k + 0.15;
    let nz = N[o + 2] * (1 - k) + qz * k;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    N[o] = nx;
    N[o + 1] = ny;
    N[o + 2] = nz;
  }
}

/** camada macia de pinheiro: ápice, 2 anéis convexos, saia com lóbulos caídos, fundo côncavo */
function pineTier(m: Mesher, cp: Canopy, x: number, y: number, z: number, Rr: number, H: number, n: number, rot: number, snow: boolean, snowCol: THREE.Color, lo: boolean): void {
  const apex = m.nv;
  const col = (px: number, py: number, pz: number, k: number, white: number) => {
    leafColor(cp, px, py, pz, k, _c);
    if (white > 0) _c.lerp(snowCol, white);
    return _c;
  };
  let c = col(x, y + H, z, 0.35, snow ? 0.92 : 0);
  m.vert(x, y + H, z, 0, 1, 0, c.r, c.g, c.b);
  const lobes = Math.max(3, Math.round(n / 2));
  // anéis: [altura relativa, raio relativo, normal y, neve]
  const rings: [number, number, number, number][] = lo
    ? [[0.45, 0.58, 1.0, 0.7]]
    : [
        [0.66, 0.38, 1.3, 0.85],
        [0.33, 0.72, 0.85, 0.0],
      ];
  const first = m.nv;
  for (const [fy, fr, ny, sw] of rings)
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU + rot;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const r = Rr * fr;
      const py = y + H * fy;
      c = col(x + ca * r, py, z + sa * r, 0.15 - fy * 0.1, snow ? sw * (0.75 + 0.25 * Math.cos(a * 3 + rot)) : 0);
      m.vert(x + ca * r, py, z + sa * r, ca, ny, sa, c.r, c.g, c.b);
    }
  const rim = m.nv;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU + rot;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const lobe = 0.5 + 0.5 * Math.cos((i / n) * TAU * lobes);
    const r = Rr * (0.86 + lobe * 0.18);
    const py = y - H * (0.03 + lobe * 0.07);
    c = col(x + ca * r, py, z + sa * r, -0.08, 0);
    m.vert(x + ca * r, py, z + sa * r, ca, 0.45, sa, c.r, c.g, c.b);
  }
  const under = m.nv;
  c = col(x, y + H * 0.15, z, -0.6, 0);
  m.vert(x, y + H * 0.15, z, 0, -1, 0, c.r * 0.8, c.g * 0.8, c.b * 0.8);
  const row = n + 1;
  const last = first + (rings.length - 1) * row;
  for (let i = 0; i < n; i++) {
    m.tri(apex, first + i + 1, first + i);
    for (let r = 0; r + 1 < rings.length; r++) m.quad(first + (r + 1) * row + i, first + r * row + i, first + r * row + i + 1, first + (r + 1) * row + i + 1);
    m.quad(rim + i, last + i, last + i + 1, rim + i + 1);
    m.tri(under, rim + i, rim + i + 1);
  }
}

function pine(m: Mesher, s: TreeSpec, R: () => number, lod: number, snow: boolean): void {
  const h = s.h;
  const at = trunk(m, { h: h * 0.9, r0: h * 0.04, r1: h * 0.012, radial: lod ? 4 : 6, rings: lod ? 1 : 2, bx: (R() - 0.5) * 0.3, bz: (R() - 0.5) * 0.3, col: s.trunk, dark: s.trunkDark, flare: 0.6 });
  const cw = h * 0.3;
  const cp = leafCp(s, 0, h * 0.58, 0, cw, h * 0.42, cw, 0.35);
  cp.jit = 0.06;
  cp.cards = false;
  const v0 = m.nv;
  const white = new THREE.Color('#f4f8ff');
  const n = lod ? 3 : 4;
  const radial = lod ? 6 : 10;
  for (let i = 0; i < n; i++) {
    const f = i / n;
    const p = at(Math.min(1, 0.22 + f * 0.78), _a);
    const Rr = h * (0.32 - f * 0.21) * (0.94 + R() * 0.12);
    const H = h * (0.3 - f * 0.06);
    pineTier(m, cp, p.x, h * (0.2 + f * 0.6), p.z, Rr, H, radial, R() * TAU, snow, white, lod > 0);
  }
  // normais puxadas para o volume do pinheiro inteiro: camadas sem facetas, luz contínua
  softenRange(m, v0, m.nv, cp, 0.55);
}

/* ------------------------------ palmeira ------------------------------ */

/** folha de palmeira: lâmina em V arqueada, frente e verso */
function frond(m: Mesher, x: number, y: number, z: number, ang: number, len: number, w: number, droop: number, light: THREE.Color, dark: THREE.Color, segs: number): void {
  const dx = Math.cos(ang);
  const dz = Math.sin(ang);
  const px = -dz;
  const pz = dx;
  for (const back of [0, 1]) {
    const base = m.nv;
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      const cx = x + dx * len * t;
      const cz = z + dz * len * t;
      const cy = y + len * (0.35 * t - droop * t * t);
      const ww = Math.sin(Math.PI * Math.min(1, t * 1.08)) ** 0.7 * w * (k % 2 ? 1 : 0.8);
      _c.copy(dark).lerp(light, 0.35 + t * 0.6);
      const k2 = back ? 0.7 : 1;
      m.vert(cx, cy + w * 0.12, cz, 0, 1, 0, _c.r * k2, _c.g * k2, _c.b * k2);
      m.vert(cx + px * ww, cy - ww * 0.25, cz + pz * ww, px * 0.3, 1, pz * 0.3, _c.r * 0.92 * k2, _c.g * 0.92 * k2, _c.b * 0.92 * k2);
      m.vert(cx - px * ww, cy - ww * 0.25, cz - pz * ww, -px * 0.3, 1, -pz * 0.3, _c.r * 0.92 * k2, _c.g * 0.92 * k2, _c.b * 0.92 * k2);
    }
    for (let k = 0; k < segs; k++) {
      const a = base + k * 3;
      const b = a + 3;
      if (!back) {
        m.tri(a, a + 1, b + 1);
        m.tri(a, b + 1, b);
        m.tri(a, b, b + 2);
        m.tri(a, b + 2, a + 2);
      } else {
        m.tri(a, b + 1, a + 1);
        m.tri(a, b, b + 1);
        m.tri(a, b + 2, b);
        m.tri(a, a + 2, b + 2);
      }
    }
  }
}

function palm(m: Mesher, s: TreeSpec, R: () => number, lod: number): void {
  const h = s.h;
  const lean = 1.2 + R() * 0.8;
  const la = R() * TAU;
  const at = trunk(m, { h: h * 0.88, r0: h * 0.035, r1: h * 0.022, radial: lod ? 4 : 6, rings: lod ? 2 : 6, bx: Math.cos(la) * lean, bz: Math.sin(la) * lean, col: s.trunk, dark: s.trunkDark, flare: 0.5, bands: !lod, cap: true });
  const top = at(1, new THREE.Vector3());
  const light = new THREE.Color(s.leaf);
  const dark = new THREE.Color(s.leaf2).multiplyScalar(0.7);
  const n = lod ? 5 : 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + R() * 0.5;
    frond(m, top.x, top.y, top.z, a, h * (0.36 + R() * 0.08), h * 0.075, 0.9 + R() * 0.4, light, dark, lod ? 2 : 4);
  }
  if (!lod) {
    const cp = leafCp(s, top.x, top.y, top.z, 0.5, 0.5, 0.5, 0.3);
    cp.light = new THREE.Color('#8a5a2e');
    cp.dark = new THREE.Color('#4a2e14');
    cp.speck = undefined;
    cp.cards = false;
    for (let i = 0; i < 2; i++) {
      const a = i * 3.1 + 0.3;
      blob(m, cp, top.x + Math.cos(a) * h * 0.025, top.y - h * 0.03, top.z + Math.sin(a) * h * 0.025, h * 0.022, h * 0.025, h * 0.022, 0, i, 0.05);
    }
  }
}

/* ------------------------------ bambu ------------------------------ */

function bamboo(m: Mesher, s: TreeSpec, R: () => number, lod: number): void {
  const h = s.h;
  const n = lod ? 3 : 4;
  const light = new THREE.Color(s.leaf);
  const dark = new THREE.Color(s.leaf2).multiplyScalar(0.75);
  const top = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const a = i * 2.4;
    const r = i === 0 ? 0 : 0.35 + (i % 2) * 0.25;
    const hh = h * (0.72 + ((i * 37) % 10) / 36);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const at = trunk(m, { h: hh, r0: 0.12, r1: 0.09, radial: lod ? 4 : 5, rings: lod ? 2 : 3, bx: x * 0.6 + (R() - 0.5) * 0.4, bz: z * 0.6 + (R() - 0.5) * 0.4, col: s.trunk, dark: s.trunkDark, flare: 0.1, bands: !lod, y0: -0.2 });
    // a função do tronco começa na origem: desloca os vértices recém-criados para (x,z)
    const v1 = m.nv;
    const v0 = v1 - ((lod ? 4 : 5) + 1) * ((lod ? 2 : 3) + 1);
    for (let v = v0; v < v1; v++) {
      m.pos[v * 3] += x;
      m.pos[v * 3 + 2] += z;
    }
    at(1, top);
    const nl = lod ? 2 : 3;
    for (let k = 0; k < nl; k++) {
      const la = a + (k / nl) * TAU + R() * 0.6;
      const ty = top.y - (k % 2) * hh * 0.12;
      frond(m, top.x + x, ty, top.z + z, la, 0.9 + R() * 0.5, 0.16, 1.3, light, dark, 2);
    }
  }
}
