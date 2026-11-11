/* ============================================================
 *  NATUREZA — decoração instanciada: arbustos de bolhas macias,
 *  tufos de flores, samambaias, pedras arredondadas com musgo.
 *  Cores CINZA/BRANCO = recebem a cor da instância (ver tintGray);
 *  cores saturadas (caule, miolo, musgo) ficam como estão.
 * ============================================================ */
import * as THREE from 'three';
import { Mesher, blob, canopy, unitIco } from './mesher';
import { hash3, rng, vnoise3 } from './noise';

const TAU = Math.PI * 2;
const _c = new THREE.Color();

/** arbusto: 3 bolhas (cinza → a cor vem da instância), ~120 tri */
export function natureBush(seed = 1, lod = 0): THREE.BufferGeometry {
  const m = new Mesher();
  const R = rng(seed * 31 + 7);
  const cp = canopy(0, 0.45, 0, 0.9, 0.55, 0.8, '#ffffff', '#5a5a5a', 0.7);
  cp.lift = 0.35;
  cp.jit = 0.06;
  blob(m, cp, 0, 0.42, 0, 0.62, 0.5, 0.58, lod ? 0 : 1, R() * 9, 0.2, 0.1);
  blob(m, cp, 0.42, 0.3, 0.12, 0.42, 0.36, 0.4, 0, R() * 9, 0.18, -0.1, 1);
  blob(m, cp, -0.38, 0.28, -0.12, 0.4, 0.34, 0.42, 0, R() * 9, 0.18, 0, 2);
  return m.build();
}

/** arbusto com frutinhas (cor própria, não tingida) */
export function natureBerryBush(berry: string, seed = 3): THREE.BufferGeometry {
  const m = new Mesher();
  const R = rng(seed * 17 + 1);
  const cp = canopy(0, 0.5, 0, 0.95, 0.6, 0.85, '#58b048', '#1e4a1e', 0.7);
  cp.lift = 0.35;
  blob(m, cp, 0, 0.48, 0, 0.7, 0.55, 0.66, 1, R() * 9, 0.2, 0.1);
  blob(m, cp, 0.48, 0.34, 0.15, 0.46, 0.4, 0.44, 0, R() * 9, 0.18, -0.1, 1);
  blob(m, cp, -0.44, 0.32, -0.12, 0.44, 0.38, 0.46, 0, R() * 9, 0.18, 0, 2);
  const bc = canopy(0, 0.5, 0, 1, 1, 1, berry, new THREE.Color(berry).multiplyScalar(0.5), 0.2);
  bc.jit = 0.02;
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9 + R() * 0.3;
    const r = 0.6 + R() * 0.1;
    blob(m, bc, Math.cos(a) * r, 0.42 + (i % 3) * 0.16, Math.sin(a) * r * 0.9, 0.09, 0.09, 0.09, 0, i, 0.05);
  }
  return m.build();
}

/**
 * Tufo de 3 flores: caule verde, pétalas BRANCAS (tingidas pela instância), miolo amarelo.
 * ~70 tri. Origem no chão.
 */
export function natureFlowers(seed = 5): THREE.BufferGeometry {
  const m = new Mesher();
  const R = rng(seed);
  const stem = new THREE.Color('#3f8a2e');
  const heart = new THREE.Color('#ffd23a');
  for (let f = 0; f < 3; f++) {
    const a = f * 2.2 + R() * 0.6;
    const r = f ? 0.14 + R() * 0.08 : 0;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const hh = 0.26 + R() * 0.16;
    const tilt = (R() - 0.5) * 0.12;
    // caule: prisma de 3 lados
    const b0 = m.nv;
    for (let j = 0; j <= 1; j++)
      for (let i = 0; i <= 3; i++) {
        const t = (i / 3) * TAU;
        const rr = j ? 0.008 : 0.014;
        m.vert(x + Math.cos(t) * rr + tilt * j * hh, j * hh - 0.03, z + Math.sin(t) * rr, Math.cos(t), 0, Math.sin(t), stem.r * (0.7 + j * 0.3), stem.g * (0.7 + j * 0.3), stem.b * (0.7 + j * 0.3));
      }
    for (let i = 0; i < 3; i++) m.quad(b0 + i, b0 + 4 + i, b0 + 4 + i + 1, b0 + i + 1);
    // cabeça: estrela de 5 pétalas (frente e verso), miolo levantado
    const hx = x + tilt * hh;
    const hy = hh;
    const pr = 0.075 + R() * 0.03;
    const c0 = m.vert(hx, hy + 0.018, z, 0, 1, 0, heart.r, heart.g, heart.b);
    const rim = m.nv;
    const n = 10;
    const rot = R() * TAU;
    for (let i = 0; i < n; i++) {
      const t = (i / n) * TAU + rot;
      const rr = i % 2 ? pr * 0.35 : pr;
      m.vert(hx + Math.cos(t) * rr, hy + (i % 2 ? 0.004 : 0.014), z + Math.sin(t) * rr, 0, 1, 0, 1, 1, 1);
    }
    for (let i = 0; i < n; i++) m.tri(c0, rim + ((i + 1) % n), rim + i);
    const back = m.nv;
    for (let i = 0; i < n; i++) {
      const t = (i / n) * TAU + rot;
      const rr = i % 2 ? pr * 0.35 : pr;
      m.vert(hx + Math.cos(t) * rr, hy + (i % 2 ? 0.0 : 0.01), z + Math.sin(t) * rr, 0, -1, 0, stem.r, stem.g, stem.b);
    }
    const c1 = m.vert(hx, hy - 0.01, z, 0, -1, 0, stem.r, stem.g, stem.b);
    for (let i = 0; i < n; i++) m.tri(c1, back + i, back + ((i + 1) % n));
  }
  return m.build();
}

/** samambaia: 5 folhas arqueadas (cinza → cor da instância), 120 tri */
export function natureFern(seed = 9): THREE.BufferGeometry {
  const m = new Mesher();
  const R = rng(seed);
  const n = 5;
  for (let f = 0; f < n; f++) {
    const ang = (f / n) * TAU + R() * 0.4;
    const len = 0.55 + R() * 0.25;
    const dx = Math.cos(ang);
    const dz = Math.sin(ang);
    const px = -dz;
    const pz = dx;
    const segs = 3;
    for (const back of [0, 1]) {
      const base = m.nv;
      for (let k = 0; k <= segs; k++) {
        const t = k / segs;
        const cx = dx * len * t * 0.9;
        const cz = dz * len * t * 0.9;
        const cy = len * (0.95 * t - 0.85 * t * t) + 0.02;
        const w = Math.sin(Math.PI * Math.min(1, t * 1.1)) * 0.11 * (k % 2 ? 1 : 0.75);
        const sh = (0.55 + t * 0.5) * (back ? 0.75 : 1);
        m.vert(cx, cy + 0.015, cz, 0, 1, 0, sh, sh, sh);
        m.vert(cx + px * w, cy - w * 0.3, cz + pz * w, px * 0.3, 1, pz * 0.3, sh * 0.9, sh * 0.9, sh * 0.9);
        m.vert(cx - px * w, cy - w * 0.3, cz - pz * w, -px * 0.3, 1, -pz * 0.3, sh * 0.9, sh * 0.9, sh * 0.9);
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
  return m.build();
}

/**
 * Pedra arredondada (≈ 80 tri): corpo BRANCO (tingido pela instância), musgo verde no topo.
 * Raio ~1, base afundada em y < 0 (assenta em encostas).
 */
export function natureRock(seed = 2, moss = '#6a9a3a', mossK = 0.55): THREE.BufferGeometry {
  const mc = new THREE.Color(moss);
  const m = new Mesher();
  const u = unitIco(1);
  const R = rng(seed);
  const sx = 1 + R() * 0.3;
  const sz = 0.85 + R() * 0.3;
  const sy = 0.78 + R() * 0.2;
  const tmp: number[] = [];
  for (let k = 0; k < u.p.length; k += 3) {
    const ux = u.p[k];
    const uy = u.p[k + 1];
    const uz = u.p[k + 2];
    const n = vnoise3(ux * 1.5 + seed, uy * 1.5, uz * 1.5 - seed);
    const n2 = vnoise3(ux * 3.1 - seed, uy * 3.1 + 2, uz * 3.1);
    const flat = uy > 0.6 ? 1 - (uy - 0.6) * 0.45 : 1; // topo levemente achatado
    const r = (0.72 + n * 0.5 + n2 * 0.12) * flat;
    tmp.push(ux * r * sx, uy * r * sy - 0.12, uz * r * sz);
  }
  // normais: média das faces (suaves, mas com volume da deformação)
  const nrm = new Float32Array(tmp.length);
  for (let k = 0; k < u.i.length; k += 3) {
    const a = u.i[k] * 3;
    const b = u.i[k + 1] * 3;
    const c = u.i[k + 2] * 3;
    const e1x = tmp[b] - tmp[a];
    const e1y = tmp[b + 1] - tmp[a + 1];
    const e1z = tmp[b + 2] - tmp[a + 2];
    const e2x = tmp[c] - tmp[a];
    const e2y = tmp[c + 1] - tmp[a + 1];
    const e2z = tmp[c + 2] - tmp[a + 2];
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    for (const v of [a, b, c]) {
      nrm[v] += nx;
      nrm[v + 1] += ny;
      nrm[v + 2] += nz;
    }
  }
  for (let v = 0; v < tmp.length; v += 3) {
    const nx = nrm[v];
    const ny = nrm[v + 1];
    const nz = nrm[v + 2];
    const l = Math.hypot(nx, ny, nz) || 1;
    const up = ny / l;
    // musgo no topo; base mais escura (oclusão)
    const y = tmp[v + 1];
    const ao = 0.6 + 0.4 * Math.min(1, Math.max(0, (y + 0.15) / 0.6));
    const mk = mossK > 0 ? Math.min(1, Math.max(0, (up - 0.55) * 3.2)) * (0.6 + hash3(v, seed, 3) * 0.4) * mossK : 0;
    _c.setRGB(ao, ao, ao);
    if (mk > 0.08) _c.lerp(mc, Math.min(1, mk * 1.3)).multiplyScalar(ao);
    else {
      // cinza = recebe a cor da instância
      const j = 0.92 + hash3(v, seed, 5) * 0.08;
      _c.setRGB(ao * j, ao * j, ao * j);
    }
    m.vert(tmp[v], tmp[v + 1], tmp[v + 2], nx, ny, nz, _c.r, _c.g, _c.b);
  }
  for (let k = 0; k < u.i.length; k += 3) m.tri(u.i[k], u.i[k + 1], u.i[k + 2]);
  return m.build();
}
