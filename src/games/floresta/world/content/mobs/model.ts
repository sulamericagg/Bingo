/* ============================================================
 *  BICHOS — modelo procedural low-poly a partir do BodyPlan.
 *  Uma malha por espécie (cor por vértice, sombreado chapado).
 *  Cada vértice leva `aPivot` (xyz = articulação, w = parte) e `aGlow`
 *  para a animação SEM esqueleto feita no vertex shader (render.ts):
 *    0 corpo · 1 cabeça · 2..5 pernas (FE, FD, TE, TD) · 6 cauda
 *    7/8 asas E/D · 9 orelhas/antenas (seguem a cabeça) · 10 pescoço
 *  Frente = +Z, chão = y 0.
 * ============================================================ */
import * as THREE from 'three';
import type { BodyPlan } from './types';

export const enum Part {
  Body = 0,
  Head = 1,
  LegFL = 2,
  LegFR = 3,
  LegBL = 4,
  LegBR = 5,
  Tail = 6,
  WingL = 7,
  WingR = 8,
  Ear = 9,
  Neck = 10,
}

export interface MobModel {
  geo: THREE.BufferGeometry;
  /** articulação do pescoço (xyz) e 1 se tiver pescoço */
  neck: THREE.Vector4;
  /** altura total e meia-largura (para impostor/seleção) */
  height: number;
  halfW: number;
  /** altura do assento/olhos (para câmera/montaria) */
  headY: number;
  headZ: number;
}

const _col = new THREE.Color();
const _v = new THREE.Vector3();
type ColorFn = (x: number, y: number, z: number) => string;

const PRIMS: Record<string, THREE.BufferGeometry> = {};
function prim(kind: 'ball' | 'ballLo' | 'cyl' | 'cone' | 'box' | 'disc' | 'torus' | 'half'): THREE.BufferGeometry {
  let g = PRIMS[kind];
  if (g) return g;
  switch (kind) {
    case 'ball':
      g = new THREE.IcosahedronGeometry(1, 1);
      break;
    case 'ballLo':
      g = new THREE.IcosahedronGeometry(1, 0);
      break;
    case 'cyl':
      g = new THREE.CylinderGeometry(1, 1, 1, 6, 1).translate(0, 0.5, 0);
      break;
    case 'cone':
      g = new THREE.ConeGeometry(1, 1, 6, 1).translate(0, 0.5, 0);
      break;
    case 'box':
      g = new THREE.BoxGeometry(1, 1, 1);
      break;
    case 'disc':
      g = new THREE.CylinderGeometry(1, 1, 0.2, 8, 1);
      break;
    case 'torus':
      g = new THREE.TorusGeometry(1, 0.3, 4, 8, Math.PI * 1.3);
      break;
    case 'half':
      g = new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
      break;
  }
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  PRIMS[kind] = g;
  return g;
}

interface PartRec {
  g: THREE.BufferGeometry;
  col: string | ColorFn;
  m: THREE.Matrix4;
  part: number;
  pivot: [number, number, number];
  glow: number;
}

const M = (x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0): THREE.Matrix4 =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));

/** cilindro/cone de a até b com raio r */
function between(a: THREE.Vector3, b: THREE.Vector3, r: number, r2 = r): THREE.Matrix4 {
  const d = _v.subVectors(b, a);
  const len = d.length() || 1e-3;
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  return new THREE.Matrix4().compose(a.clone(), q, new THREE.Vector3(Math.max(r, r2), len, Math.max(r, r2)));
}

function shade(hex: string, k: number): string {
  _col.set(hex);
  if (k >= 0) _col.lerp(new THREE.Color(1, 1, 1), k);
  else _col.multiplyScalar(1 + k);
  return '#' + _col.getHexString();
}

function merge(parts: PartRec[]): THREE.BufferGeometry {
  let n = 0;
  for (const p of parts) n += p.g.getAttribute('position').count;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const piv = new Float32Array(n * 4);
  const glw = new Float32Array(n);
  let o = 0;
  const v = new THREE.Vector3();
  const c = new THREE.Color();
  for (const p of parts) {
    const src = p.g.getAttribute('position') as THREE.BufferAttribute;
    const cnt = src.count;
    const fixed = typeof p.col === 'string' ? c.set(p.col).clone() : null;
    for (let i = 0; i < cnt; i += 3) {
      // cor por face (centroide em espaço local da primitiva)
      let fc = fixed;
      if (!fc) {
        const cx = (src.getX(i) + src.getX(i + 1) + src.getX(i + 2)) / 3;
        const cy = (src.getY(i) + src.getY(i + 1) + src.getY(i + 2)) / 3;
        const cz = (src.getZ(i) + src.getZ(i + 1) + src.getZ(i + 2)) / 3;
        fc = c.set((p.col as ColorFn)(cx, cy, cz));
      }
      for (let k = 0; k < 3; k++) {
        const j = i + k;
        v.set(src.getX(j), src.getY(j), src.getZ(j)).applyMatrix4(p.m);
        const q = o + j;
        pos[q * 3] = v.x;
        pos[q * 3 + 1] = v.y;
        pos[q * 3 + 2] = v.z;
        col[q * 3] = fc.r;
        col[q * 3 + 1] = fc.g;
        col[q * 3 + 2] = fc.b;
        piv[q * 4] = p.pivot[0];
        piv[q * 4 + 1] = p.pivot[1];
        piv[q * 4 + 2] = p.pivot[2];
        piv[q * 4 + 3] = p.part;
        glw[q] = p.glow;
      }
    }
    o += cnt;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aPivot', new THREE.BufferAttribute(piv, 4));
  g.setAttribute('aGlow', new THREE.BufferAttribute(glw, 1));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

const INK = '#2a1440';

/** gera a malha de um plano de corpo */
export function buildModel(p: BodyPlan, monster = false): MobModel {
  const parts: PartRec[] = [];
  const add = (g: THREE.BufferGeometry, col: string | ColorFn, m: THREE.Matrix4, part = 0, pivot: [number, number, number] = [0, 0, 0], glow = 0) =>
    parts.push({ g, col, m, part, pivot, glow });
  const [L, H, W] = p.body;
  const legs = p.legs ?? { n: 0 as const, len: 0, w: 0 };
  const legLen = legs.n ? legs.len : 0;
  const form = p.form;
  const floaty = form === 'ghost' || form === 'fish' || (form === 'bird' && !legs.n) || form === 'bug' && !legs.n;
  const by = p.bodyY ?? (floaty ? H * 0.6 : legLen + H * 0.42);
  const belly = p.belly;
  const pc = p.patCol ?? shade(p.col, -0.35);
  const ball = prim('ball');
  const lo = prim('ballLo');

  /* ---------------- corpo ---------------- */
  const bodyCol: ColorFn = (x, y, z) => {
    if (belly && y < -0.35 && z > -0.6) return belly;
    switch (p.pattern) {
      case 'stripes':
        return Math.sin(z * 9 + y * 2) > 0.35 ? pc : p.col;
      case 'spots':
        return Math.sin(x * 11) * Math.sin(y * 13) * Math.sin(z * 9) > 0.25 ? pc : p.col;
      case 'band':
        return Math.abs(z) < 0.28 ? pc : p.col;
      case 'patch':
        return y > 0.45 ? pc : p.col;
    }
    return p.col;
  };
  if (form === 'worm' || form === 'serpent') {
    const seg = form === 'serpent' ? 7 : 5;
    for (let i = 0; i < seg; i++) {
      const f = i / (seg - 1);
      const r = (1 - f * 0.55) * W * 0.5;
      add(ball, i % 2 && p.pattern ? pc : p.col, M(0, Math.max(r, by * (1 - f * 0.3)), L * 0.5 - f * L, r, r * (H / W), r * 1.15));
    }
  } else if (form === 'ghost') {
    add(ball, bodyCol, M(0, by + H * 0.15, 0, W * 0.5, H * 0.45, L * 0.5));
    // saia ondulada
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      add(prim('cone'), p.col, M(Math.sin(a) * W * 0.3, by - H * 0.05, Math.cos(a) * L * 0.3, W * 0.17, -H * 0.42, L * 0.17), Part.Tail, [0, by, 0]);
    }
    // bracinhos
    add(lo, p.col, M(W * 0.5, by, L * 0.1, W * 0.14, H * 0.1, W * 0.14), Part.WingR, [W * 0.4, by, 0]);
    add(lo, p.col, M(-W * 0.5, by, L * 0.1, W * 0.14, H * 0.1, W * 0.14), Part.WingL, [-W * 0.4, by, 0]);
  } else if (form === 'plant') {
    // vaso de raízes + caule
    add(ball, shade(p.col, -0.25), M(0, H * 0.18, 0, W * 0.5, H * 0.22, L * 0.5));
    add(prim('cyl'), p.col, M(0, H * 0.25, 0, W * 0.12, H * 0.6, W * 0.12));
    for (let i = 0; i < 2; i++) add(prim('ball'), shade(p.col, 0.15), M((i ? 1 : -1) * W * 0.32, H * 0.5, 0, W * 0.3, H * 0.05, W * 0.14, 0, 0, (i ? -1 : 1) * 0.4), i ? Part.WingR : Part.WingL, [(i ? 1 : -1) * W * 0.1, H * 0.5, 0]);
  } else {
    add(ball, bodyCol, M(0, by, 0, W * 0.5, H * 0.5, L * 0.5));
    if (belly && form !== 'fish') add(lo, belly, M(0, by - H * 0.12, L * 0.08, W * 0.4, H * 0.36, L * 0.4));
  }
  if (p.shell) {
    const sc = p.shell;
    add(prim('half'), (x, _y, z) => (Math.sin(x * 7) * Math.sin(z * 7) > 0.2 ? shade(sc, -0.25) : sc), M(0, by - H * 0.05, -L * 0.03, W * 0.6, H * 0.62, L * 0.58));
  }
  if (p.humps) for (let i = 0; i < p.humps; i++) add(ball, p.col, M(0, by + H * 0.42, (p.humps > 1 ? (i ? -0.18 : 0.18) : 0) * L, W * 0.26, H * 0.32, L * 0.16));
  if (p.dorsal) add(prim('cone'), p.dorsal, M(0, by + H * 0.3, -L * 0.05, W * 0.06, H * 0.55, L * 0.25, -0.5));
  if (p.spikes) {
    const n = Math.max(3, Math.round(L * 3));
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1);
      add(prim('cone'), p.spikes, M(0, by + H * 0.42 - Math.abs(f - 0.4) * H * 0.3, L * 0.35 - f * L * 0.8, W * 0.09, H * 0.32, W * 0.09, -0.25), 0, [0, 0, 0], monster || p.glow === p.spikes ? 0.6 : 0);
    }
  }
  if (p.bulb) {
    // botão de flor fechado no topo (hidra-lírio)
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      add(ball, i % 2 ? p.bulb : shade(p.bulb, 0.2), M(Math.cos(a) * W * 0.09, by + H * 0.75, Math.sin(a) * W * 0.09, W * 0.1, H * 0.6, W * 0.07, Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35), 0, [0, 0, 0], 0.15);
    }
  }
  if (p.mane) {
    for (let i = 0; i < 7; i++) {
      const a = -1.2 + (i / 6) * 2.4;
      add(lo, p.mane, M(Math.sin(a) * W * 0.42, by + H * 0.25 + Math.cos(a) * H * 0.18, L * 0.33, W * 0.2, W * 0.2, W * 0.2));
    }
  }
  if (p.glow && (form === 'blob' || form === 'ghost')) add(lo, p.glow, M(0, by - H * 0.05, L * 0.1, W * 0.25, H * 0.25, L * 0.25), 0, [0, 0, 0], 1);

  /* ---------------- pescoço + cabeça ---------------- */
  let headPivot: [number, number, number] = [0, by + H * 0.25, L * 0.4];
  let hx = 0;
  let hy = by + H * 0.35;
  let hz = L * 0.5;
  const neck = new THREE.Vector4(0, 0, 0, 0);
  const hr = p.head?.r ?? 0;
  if (p.neck) {
    const tilt = p.neck.tilt ?? 0.35;
    const base = new THREE.Vector3(0, by + H * 0.2, L * 0.38);
    const top = new THREE.Vector3(0, base.y + Math.cos(tilt) * p.neck.len, base.z + Math.sin(tilt) * p.neck.len);
    add(prim('cyl'), (_x, y) => (p.pattern === 'spots' && Math.sin(y * 14) > 0.3 ? pc : p.col), between(base, top, p.neck.w, p.neck.w), Part.Neck, [base.x, base.y, base.z]);
    neck.set(base.x, base.y, base.z, 1);
    headPivot = [top.x, top.y, top.z];
    hx = top.x;
    hy = top.y + hr * 0.3;
    hz = top.z + hr * 0.5;
  } else if (form === 'fish' || form === 'worm' || form === 'serpent' || form === 'blob' || form === 'ghost' || form === 'plant') {
    hy = form === 'worm' || form === 'serpent' ? Math.max(hr, by) : form === 'plant' ? H * 0.85 : by + H * 0.1;
    hz = form === 'fish' ? L * 0.35 : form === 'plant' ? 0 : form === 'blob' || form === 'ghost' ? L * 0.15 : L * 0.55;
    headPivot = [0, hy - hr * 0.5, hz - hr * 0.5];
    if (form === 'blob' || form === 'ghost') headPivot = [0, by, 0];
  } else if (form === 'bird' || form === 'biped' || form === 'bug') {
    hy = by + H * (form === 'bug' ? 0.1 : 0.45);
    hz = L * 0.42;
    headPivot = [0, by + H * 0.2, L * 0.3];
  }
  if (p.head) {
    const h = p.head;
    const hc = h.col ?? p.col;
    const HD = Part.Head;
    const hp = headPivot;
    if (form === 'fish' || form === 'blob' || form === 'ghost') {
      // cabeça = frente do corpo: só rosto
    } else add(ball, hc, M(hx, hy, hz, hr, hr * 0.92, hr), HD, hp);
    const fz = form === 'fish' || form === 'blob' || form === 'ghost' ? hz + Math.max(L * 0.3, hr * 0.6) : hz + hr * 0.8;
    const fy = form === 'blob' || form === 'ghost' ? by + H * 0.12 : hy;
    if (h.snout) add(ball, h.snoutCol ?? shade(hc, 0.25), M(hx, hy - hr * 0.25, hz + hr * 0.75, hr * 0.5, hr * 0.42, hr * h.snout * 0.6), HD, hp);
    if (h.snout) add(lo, INK, M(hx, hy - hr * 0.12, hz + hr * (0.75 + h.snout * 0.55), hr * 0.14, hr * 0.1, hr * 0.08), HD, hp);
    if (h.beak) add(prim('cone'), h.beak, M(hx, hy - hr * 0.15, hz + hr * 0.7, hr * 0.32, hr * 0.9, hr * 0.26, Math.PI / 2), HD, hp);
    // olhos grandes e fofos
    const es = hr * 0.27 * (h.eye ?? 1);
    const ex = form === 'fish' ? Math.max(W, hr) * 0.48 : hr * 0.45;
    const eyeCol = monster && p.glow ? p.glow : INK;
    for (const s of [-1, 1]) {
      const exx = hx + s * ex;
      const ez = form === 'fish' ? fz - L * 0.22 : fz - es * 0.6;
      add(ball, eyeCol, M(exx, fy + hr * 0.18, ez, es * 0.8, es, es * 0.6), HD, hp, monster && p.glow ? 0.9 : 0);
      add(lo, '#ffffff', M(exx + es * 0.25 * s, fy + hr * 0.18 + es * 0.4, ez + es * 0.45, es * 0.3, es * 0.3, es * 0.2), HD, hp, 0.5);
      if (h.blush) add(lo, '#ff8aa8', M(hx + s * hr * 0.62, fy - hr * 0.18, ez - es * 0.3, es * 0.6, es * 0.35, es * 0.25), HD, hp);
    }
    // orelhas
    const ec = h.earCol ?? hc;
    const EA = Part.Ear;
    if (h.ears) {
      for (const s of [-1, 1]) {
        switch (h.ears) {
          case 'round':
            add(lo, ec, M(hx + s * hr * 0.6, hy + hr * 0.7, hz - hr * 0.1, hr * 0.32, hr * 0.32, hr * 0.14), EA, hp);
            break;
          case 'tiny':
            add(lo, ec, M(hx + s * hr * 0.55, hy + hr * 0.7, hz - hr * 0.1, hr * 0.16, hr * 0.18, hr * 0.1), EA, hp);
            break;
          case 'long':
            add(ball, ec, M(hx + s * hr * 0.35, hy + hr * 1.35, hz - hr * 0.25, hr * 0.2, hr * 0.8, hr * 0.12, -0.15, 0, s * -0.15), EA, hp);
            break;
          case 'pointy':
            add(prim('cone'), ec, M(hx + s * hr * 0.5, hy + hr * 0.55, hz - hr * 0.1, hr * 0.28, hr * 0.7, hr * 0.15, 0, 0, s * -0.3), EA, hp);
            break;
          case 'big':
            add(ball, ec, M(hx + s * hr * 1.05, hy + hr * 0.75, hz - hr * 0.2, hr * 0.7, hr * 0.85, hr * 0.12, 0, s * 0.3, s * -0.55), EA, hp);
            add(ball, '#ffb8c8', M(hx + s * hr * 1.0, hy + hr * 0.72, hz - hr * 0.12, hr * 0.45, hr * 0.6, hr * 0.06, 0, s * 0.3, s * -0.55), EA, hp);
            break;
        }
      }
    }
    const hcH = h.hornCol ?? '#f4ead0';
    if (h.horns) {
      for (const s of [-1, 1]) {
        switch (h.horns) {
          case 'curl':
            add(prim('torus'), hcH, M(hx + s * hr * 0.6, hy + hr * 0.45, hz - hr * 0.2, hr * 0.42, hr * 0.42, hr * 0.42, 0, s * Math.PI / 2, 0.6), HD, hp);
            break;
          case 'spike':
            add(prim('cone'), hcH, M(hx + s * hr * 0.4, hy + hr * 0.7, hz - hr * 0.2, hr * 0.16, hr * 0.8, hr * 0.16, -0.5, 0, s * -0.3), HD, hp, monster ? 0.3 : 0);
            break;
          case 'stub':
            add(prim('cone'), hcH, M(hx + s * hr * 0.35, hy + hr * 0.8, hz, hr * 0.14, hr * 0.32, hr * 0.14), HD, hp);
            break;
          case 'antler': {
            const b = new THREE.Vector3(hx + s * hr * 0.35, hy + hr * 0.7, hz - hr * 0.1);
            const t1 = new THREE.Vector3(hx + s * hr * 1.0, hy + hr * 2.0, hz - hr * 0.4);
            add(prim('cyl'), hcH, between(b, t1, hr * 0.07), EA, hp, p.glow ? 0.8 : 0);
            add(prim('cyl'), hcH, between(b.clone().lerp(t1, 0.45), new THREE.Vector3(hx + s * hr * 0.4, hy + hr * 1.7, hz + hr * 0.3), hr * 0.06), EA, hp, p.glow ? 0.8 : 0);
            add(prim('cyl'), hcH, between(b.clone().lerp(t1, 0.75), new THREE.Vector3(hx + s * hr * 1.4, hy + hr * 1.75, hz - hr * 0.1), hr * 0.05), EA, hp, p.glow ? 0.8 : 0);
            break;
          }
          case 'uni':
            if (s > 0) add(prim('cone'), hcH, M(hx, hy + hr * 0.6, hz + hr * 0.4, hr * 0.15, hr * 1.0, hr * 0.15, 0.6), HD, hp, p.glow ? 0.7 : 0);
            break;
        }
      }
    }
    if (h.cap) {
      const cc = h.cap;
      add(prim('half'), (x, _y, z) => (Math.sin(x * 9) * Math.sin(z * 9) > 0.45 ? '#fff6e8' : cc), M(hx, hy + hr * 0.45, hz - hr * 0.05, hr * 1.35, hr * 0.85, hr * 1.35), EA, hp);
    }
    if (h.crest) for (let i = 0; i < 3; i++) add(prim('cone'), h.crest, M(hx, hy + hr * 0.75, hz + hr * 0.3 - i * hr * 0.35, hr * 0.14, hr * (0.55 - i * 0.12), hr * 0.14, -0.3 - i * 0.2), EA, hp);
    if (h.antennae) {
      for (const s of [-1, 1]) {
        const b = new THREE.Vector3(hx + s * hr * 0.3, hy + hr * 0.7, hz + hr * 0.1);
        const tp = new THREE.Vector3(hx + s * hr * 0.75, hy + hr * 1.7, hz + hr * 0.5);
        add(prim('cyl'), INK, between(b, tp, hr * 0.05), EA, hp);
        add(lo, h.antennae, M(tp.x, tp.y, tp.z, hr * 0.16, hr * 0.16, hr * 0.16), EA, hp, 0.9);
      }
    }
  }

  /* ---------------- pernas / braços ---------------- */
  if (legs.n) {
    const lc = legs.col ?? shade(p.col, -0.15);
    const hipY = Math.min(by, legLen + H * 0.1);
    const lr = legs.w * 0.5;
    const leg = (x: number, z: number, part: number, len = legLen, top = hipY) => {
      add(prim('cyl'), lc, M(x, top - len, z, lr, len, lr), part, [x, top, z]);
      add(lo, shade(lc, -0.3), M(x, top - len + lr * 0.4, z + lr * 0.3, lr * 1.25, lr * 0.7, lr * 1.5), part, [x, top, z]);
    };
    if (legs.n === 2) {
      leg(-W * 0.22, 0, Part.LegFL);
      leg(W * 0.22, 0, Part.LegFR);
    } else if (legs.n === 4) {
      leg(-W * 0.3, L * 0.28, Part.LegFL);
      leg(W * 0.3, L * 0.28, Part.LegFR);
      leg(-W * 0.3, -L * 0.28, Part.LegBL);
      leg(W * 0.3, -L * 0.28, Part.LegBR);
    } else {
      const per = legs.n / 2;
      for (let i = 0; i < per; i++) {
        const z = L * 0.35 - (i / (per - 1)) * L * 0.7;
        for (const s of [-1, 1]) {
          const part = 2 + ((i + (s > 0 ? 1 : 0)) % 2) + (i % 2 ? 2 : 0);
          const a = new THREE.Vector3(s * W * 0.35, by, z);
          const knee = new THREE.Vector3(s * (W * 0.5 + legLen * 0.6), by + legLen * 0.3, z);
          const foot = new THREE.Vector3(s * (W * 0.45 + legLen * 0.8), 0, z + (i - (per - 1) / 2) * 0.05);
          add(prim('cyl'), lc, between(a, knee, lr), part, [a.x, a.y, a.z]);
          add(prim('cyl'), lc, between(knee, foot, lr * 0.85), part, [a.x, a.y, a.z]);
        }
      }
    }
  }
  if (p.arms) {
    const a = p.arms;
    const ac = a.col ?? shade(p.col, -0.1);
    for (const s of [-1, 1]) {
      const part = s < 0 ? Part.LegBL : Part.LegBR;
      const sh = new THREE.Vector3(s * (W * 0.5 + a.w * 0.3), by + H * 0.3, 0);
      const hand = new THREE.Vector3(s * (W * 0.55 + a.w * 0.5), by + H * 0.3 - a.len, L * 0.08);
      add(prim('cyl'), ac, between(sh, hand, a.w * 0.5), part, [sh.x, sh.y, sh.z]);
      add(ball, shade(ac, -0.2), M(hand.x, hand.y, hand.z, a.w * 0.75, a.w * 0.75, a.w * 0.75), part, [sh.x, sh.y, sh.z]);
    }
  }
  if (p.claws) {
    for (const s of [-1, 1]) {
      const part = s < 0 ? Part.LegBL : Part.LegBR;
      const piv: [number, number, number] = [s * W * 0.4, by, L * 0.3];
      add(ball, p.claws, M(s * W * 0.62, by + H * 0.1, L * 0.62, W * 0.2, H * 0.22, L * 0.22), part, piv);
      add(prim('cone'), shade(p.claws, -0.2), M(s * W * 0.6, by + H * 0.15, L * 0.78, W * 0.1, L * 0.3, W * 0.08, Math.PI / 2 - 0.3), part, piv);
    }
  }
  if (p.shield) {
    const sc = p.shield;
    add(prim('disc'), (x, y) => (Math.abs(x) < 0.18 || Math.abs(y) < 0.05 ? shade(sc, 0.35) : sc), M(-W * 0.15, by + H * 0.05, L * 0.62, H * 0.6, W * 0.35, H * 0.6, Math.PI / 2), 0);
  }

  /* ---------------- cauda ---------------- */
  if (p.tail) {
    const t = p.tail;
    const tc = t.col ?? p.col;
    const tb: [number, number, number] = [0, by + H * 0.1, -L * 0.45];
    const T = Part.Tail;
    switch (t.kind) {
      case 'thin': {
        const a = new THREE.Vector3(...tb);
        const b = new THREE.Vector3(0, by + H * 0.1 - t.len * 0.25, -L * 0.45 - t.len);
        add(prim('cone'), tc, between(a, b, W * 0.08, W * 0.08), T, tb);
        add(lo, shade(tc, -0.2), M(b.x, b.y, b.z, W * 0.09, W * 0.09, W * 0.09), T, tb);
        break;
      }
      case 'fluffy':
        add(ball, tc, M(0, by + H * 0.3, -L * 0.45 - t.len * 0.4, t.len * 0.35, t.len * 0.5, t.len * 0.4, 0.6), T, tb);
        break;
      case 'puff':
        add(lo, tc, M(0, by + H * 0.15, -L * 0.5, t.len * 0.5, t.len * 0.5, t.len * 0.5), T, tb);
        break;
      case 'fin':
        add(prim('cone'), tc, M(0, by, -L * 0.42 - t.len * 0.5, W * 0.06, t.len * 1.1, H * 0.7, -Math.PI / 2), T, [0, by, -L * 0.42]);
        break;
      case 'flat':
        add(ball, tc, M(0, by - H * 0.2, -L * 0.45 - t.len * 0.45, W * 0.32, H * 0.08, t.len * 0.55), T, tb);
        break;
      case 'fan':
        for (let i = 0; i < 5; i++) add(ball, i % 2 ? tc : shade(tc, 0.3), M((i - 2) * t.len * 0.22, by + H * 0.35 + t.len * 0.4 - Math.abs(i - 2) * t.len * 0.1, -L * 0.45, t.len * 0.13, t.len * 0.5, t.len * 0.05, -0.3, 0, (i - 2) * -0.3), T, tb);
        break;
      case 'stinger': {
        let a = new THREE.Vector3(...tb);
        for (let i = 0; i < 4; i++) {
          const ang = 0.4 + i * 0.55;
          const b = a.clone().add(new THREE.Vector3(0, Math.sin(ang) * t.len * 0.3, -Math.cos(ang) * t.len * 0.3));
          add(lo, i === 3 ? (p.glow ?? INK) : tc, M(b.x, b.y, b.z, W * 0.14, W * 0.14, W * 0.14), T, tb, i === 3 && p.glow ? 0.8 : 0);
          a = b;
        }
        break;
      }
    }
  }

  /* ---------------- asas ---------------- */
  if (p.wings) {
    const w = p.wings;
    const wc = w.col ?? shade(p.col, -0.1);
    for (const s of [-1, 1]) {
      const part = s < 0 ? Part.WingL : Part.WingR;
      const root: [number, number, number] = [s * W * 0.38, by + H * 0.25, L * 0.05];
      const span = w.span * 0.5;
      switch (w.kind) {
        case 'feather':
          add(ball, wc, M(s * (W * 0.38 + span * 0.5), by + H * 0.25, -L * 0.05, span * 0.5, H * 0.08, L * 0.36, 0, s * 0.15, 0), part, root);
          add(ball, shade(wc, -0.25), M(s * (W * 0.38 + span * 0.85), by + H * 0.22, -L * 0.18, span * 0.25, H * 0.06, L * 0.22, 0, s * 0.3, 0), part, root);
          break;
        case 'bat': {
          // membrana achatada + 3 "dedos" em leque
          add(ball, wc, M(s * (W * 0.38 + span * 0.5), by + H * 0.42, -L * 0.18, span * 0.52, H * 0.03, L * 0.42, 0, 0, s * -0.12), part, root);
          const r0 = new THREE.Vector3(...root);
          for (let f = 0; f < 3; f++) {
            const tip = new THREE.Vector3(s * (W * 0.38 + span * (1 - f * 0.18)), by + H * (0.6 - f * 0.12), -L * (0.0 + f * 0.28));
            add(prim('cyl'), shade(wc, -0.35), between(r0, tip, Math.max(0.03, W * 0.03)), part, root);
          }
          break;
        }
        case 'bug':
          add(ball, wc, M(s * (W * 0.3 + span * 0.45), by + H * 0.45, -L * 0.05, span * 0.5, H * 0.03, L * 0.4, 0, s * -0.3, 0), part, root, 0.25);
          break;
        case 'stub':
          add(ball, wc, M(s * (W * 0.45 + span * 0.3), by + H * 0.1, 0, span * 0.35, H * 0.25, L * 0.3, 0, 0, s * -0.4), part, root);
          break;
      }
    }
  }
  if (p.glow && form !== 'blob' && form !== 'ghost' && form !== 'plant' && !p.head?.antennae && form !== 'bug') {
    // brilho no peito / lanterna
    add(lo, p.glow, M(0, by - H * 0.1, L * 0.3, W * 0.22, H * 0.22, L * 0.12), 0, [0, 0, 0], 1);
  }
  if (p.glow && form === 'bug') add(lo, p.glow, M(0, by, -L * 0.42, W * 0.32, H * 0.32, L * 0.25), 0, [0, 0, 0], 1);

  const geo = merge(parts);
  const bb = geo.boundingBox!;
  return {
    geo,
    neck,
    height: bb.max.y,
    halfW: Math.max(-bb.min.x, bb.max.x, -bb.min.z, bb.max.z),
    headY: hy,
    headZ: hz,
  };
}
