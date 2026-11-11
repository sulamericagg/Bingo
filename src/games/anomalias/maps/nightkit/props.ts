/* ============================================================
 *  NIGHTKIT — materiais padrão + móveis/peças comuns aos dois mapas
 *  (porta com dobradiça, quadro, relógio, luminárias, planta, janela
 *  com céu, cortina, prateleira com livros, tapete).
 *  Convenção de chaves de material: paint, trim, wood, fabric, metal,
 *  glow (aceso sempre), glowMain (apaga com a energia), glass, ceil.
 * ============================================================ */
import * as THREE from 'three';
import { woodTex } from '../../../../3d/common/pbr';
import type { G, MapKit } from './kit';
import { quad } from './kit';
import { cloth, nightSky, plaster } from './tex';

const TAU = Math.PI * 2;

export function stdMats(k: MapKit, woodTint = '#ffffff'): void {
  const w = woodTex(256, 4);
  k.def('paint', {});
  k.def('trim', { map: plaster(), uv: 2 });
  k.def('wood', { map: w.map, normal: w.normal, uv: 0.9, color: woodTint });
  // tecido com trama só do nível Médio para cima (no Baixo vira pintura: 1 chamada a menos por sala)
  if (k.tier >= 2) k.def('fabric', { map: cloth(), uv: 4 });
  else k.alias('fabric', 'paint');
  // metal = mesmo material da pintura; teto = mesmo do acabamento (menos chamadas)
  k.alias('metal', 'paint');
  k.alias('ceil', 'trim');
  k.def('glow', { basic: true });
  k.def('glowMain', { basic: true, power: true });
  k.def('glass', { transparent: true, opacity: 0.22, depthWrite: false, color: '#cfe6ff' });
}

/* ------------------------------ porta com dobradiça ------------------------------ */
export interface Door {
  pivot: THREE.Group;
  leaf: THREE.Group;
  /** abre (ângulo em rad, + = para dentro do lado +z local) */
  set(a: number): void;
}
/**
 * Porta de almofadas. Dobradiça na origem; folha corre em +x (largura w).
 * ry gira o conjunto (a porta fechada fica no plano x local).
 */
export function door(k: MapKit, x: number, z: number, ry: number, w: number, h: number, col: string, opts: { glass?: boolean; knob?: string; kid?: string; y0?: number } = {}): Door {
  const pivot = new THREE.Group();
  k.place(pivot, x, opts.y0 ?? 0, z, ry);
  k.root.add(pivot);
  const t = 0.045;
  const leaf = k.part((g) => {
    const p = g('paint');
    const ww = w - 0.02;
    p.box(ww, h - 0.015, t, ww / 2 + 0.01, 0.008, 0, col);
    // almofadas (rebaixos com moldura saliente)
    const rows = opts.glass ? [[h * 0.52, h * 0.38]] : [[h * 0.08, h * 0.36], [h * 0.52, h * 0.38]];
    for (const [y, hh] of rows)
      for (const s of [-1, 1]) {
        p.box(ww * 0.7, 0.025, 0.012, ww / 2 + 0.01, y, s * (t / 2 + 0.004), shade(col, 0.08));
        p.box(ww * 0.7, 0.025, 0.012, ww / 2 + 0.01, y + hh - 0.025, s * (t / 2 + 0.004), shade(col, 0.08));
        p.box(0.025, hh, 0.012, ww * 0.15 + 0.0225, y, s * (t / 2 + 0.004), shade(col, 0.08));
        p.box(0.025, hh, 0.012, ww * 0.85 - 0.0025, y, s * (t / 2 + 0.004), shade(col, 0.08));
      }
    if (opts.glass) g('glass').box(ww * 0.66, h * 0.36, 0.01, ww / 2 + 0.01, h * 0.53, 0, '#ffffff');
    if (opts.kid) {
      // plaquinha de bichinho na porta (detalhe infantil)
      for (const s of [-1, 1]) p.rcyl(0.08, 0.012, ww / 2 + 0.01, h * 0.47, s * (t / 2 + 0.006), opts.kid, 16, 0.3, Math.PI / 2 * s);
    }
    // maçaneta dos dois lados
    const m = g('metal');
    for (const s of [-1, 1]) {
      m.rcyl(0.032, 0.012, ww - 0.07, h * 0.47, s * (t / 2), opts.knob ?? '#d8c27a', 12, 0.3, (s * Math.PI) / 2);
      m.sph(0.03, ww - 0.07, h * 0.47, s * (t / 2 + 0.045), opts.knob ?? '#d8c27a', 1, 1, 0.8, 10);
      m.cyl(0.009, 0.009, 0.04, ww - 0.07, h * 0.47, s * (t / 2 + 0.005), opts.knob ?? '#d8c27a', 6, Math.PI / 2);
    }
    // dobradiças
    for (const y of [0.2, h - 0.3]) m.box(0.02, 0.1, t + 0.01, 0.005, y, 0, '#8a8a8a');
  }, 0, 0, 0, 0, pivot);
  return {
    pivot,
    leaf,
    set(a) {
      leaf.rotation.y = -a;
    },
  };
}

/* ------------------------------ quadro / desenho ------------------------------ */
export interface Frame {
  g: THREE.Group;
  pic: THREE.Mesh;
  mat: THREE.MeshLambertMaterial;
}
/** quadro com moldura; (x,y,z) = centro; ry = virado para +z local */
export function frame(k: MapKit, tex: THREE.Texture, w: number, h: number, x: number, y: number, z: number, ry: number, frameCol = '#8a5a3a', depth = 0.035, tape = false): Frame {
  const g = k.part((gg) => {
    if (tape) {
      // papel colado com fita (desenho de criança)
      const p = gg('paint');
      p.sharp(0.09, 0.03, 0.004, -w / 2 + 0.02, h / 2 - 0.02, 0.002, '#f6f0c8', 0, 0, 0.5);
      p.sharp(0.09, 0.03, 0.004, w / 2 - 0.02, h / 2 - 0.02, 0.002, '#f6f0c8', 0, 0, -0.5);
      return;
    }
    const f = gg('wood');
    f.ao = false;
    gg('paint').ao = false;
    const b = 0.045;
    f.box(w + b * 2, b, depth, 0, -h / 2 - b, 0, frameCol);
    f.box(w + b * 2, b, depth, 0, h / 2, 0, frameCol);
    f.box(b, h, depth, -w / 2 - b / 2, -h / 2, 0, frameCol);
    f.box(b, h, depth, w / 2 + b / 2, -h / 2, 0, frameCol);
    gg('paint').sharp(w, h, 0.01, 0, -h / 2, -depth / 2 + 0.006, '#30261e');
  }, x, y, z, ry);
  const mat = k.tmat(tex) as THREE.MeshLambertMaterial;
  const pic = new THREE.Mesh(quad(w, h), mat);
  pic.position.z = tape ? 0.003 : 0.002;
  g.add(pic);
  return { g, pic, mat };
}

/* ------------------------------ relógio de parede ------------------------------ */
export interface Clock {
  g: THREE.Group;
  hands: THREE.Group;
}
export function wallClock(k: MapKit, x: number, y: number, z: number, ry: number, r = 0.18, rim = '#ff8fb1'): Clock {
  const g = k.part((gg) => {
    const p = gg('paint');
    p.ao = false;
    p.rcyl(r, 0.05, 0, 0, 0, rim, 28, 0.4, Math.PI / 2);
    p.cyl(r * 0.88, r * 0.88, 0.012, 0, 0, 0.044, '#fffaf0', 28, Math.PI / 2);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      p.box(i % 3 ? 0.008 : 0.016, 0.03, 0.006, Math.sin(a) * r * 0.74, Math.cos(a) * r * 0.74 - 0.015, 0.058, '#5a4a6a', 0, 0, -a);
    }
  }, x, y, z, ry);
  const hands = k.part((gg) => {
    const p = gg('paint');
    p.ao = false;
    p.box(0.012, r * 0.5, 0.006, 0, 0, 0, '#2a1a3a');
    p.box(0.008, r * 0.72, 0.006, 0, 0, 0.007, '#2a1a3a', 0, 0, -2.1);
    p.cyl(0.014, 0.014, 0.012, 0, 0, 0.005, '#e05a7a', 10, Math.PI / 2);
  }, 0, 0, 0.062, 0, g);
  hands.rotation.z = 0.9;
  return { g, hands };
}

/* ------------------------------ luminárias ------------------------------ */
/** pendente de teto (cúpula) — corpo no balde da zona, lâmpada no glowMain */
export function pendant(g: G, x: number, ceilY: number, z: number, col: string, drop = 0.5, r = 0.24): void {
  const p = g('paint');
  p.cyl(0.004, 0.004, drop, x, ceilY - drop, z, '#3a3a3a', 4);
  p.cyl(0.05, 0.05, 0.03, x, ceilY - 0.03, z, '#f4f4f4', 10);
  p.lathe([[r, 0], [r * 0.95, 0.04], [r * 0.6, 0.16], [r * 0.25, 0.2], [0.03, 0.21]], x, ceilY - drop - 0.18, z, col, 20);
  p.lathe([[0.03, 0.21], [r * 0.24, 0.195], [r * 0.58, 0.155], [r * 0.93, 0.04], [r * 0.98, 0.0]], x, ceilY - drop - 0.18, z, shade(col, 0.35), 20);
  g('glowMain').sph(0.07, x, ceilY - drop - 0.12, z, '#fff3d6', 1, 0.9, 1, 10);
}
/** plafon redondo de teto (luz embutida) */
export function ceilingDisc(g: G, x: number, ceilY: number, z: number, r = 0.26, rim = '#ffffff'): void {
  g('paint').cyl(r + 0.03, r + 0.03, 0.03, x, ceilY - 0.03, z, rim, 24);
  g('glowMain').cyl(r, r * 0.92, 0.035, x, ceilY - 0.055, z, '#fff6e0', 24);
}
/** abajur de mesa (base + cúpula); a lâmpada no glow (noturno, sempre aceso) */
export function tableLamp(g: G, x: number, y: number, z: number, base: string, shadeCol: string, s = 1, glowKey = 'glow'): void {
  const p = g('paint');
  p.lathe([[0.07 * s, 0], [0.08 * s, 0.02 * s], [0.05 * s, 0.1 * s], [0.07 * s, 0.17 * s], [0.02 * s, 0.24 * s], [0.012 * s, 0.32 * s]], x, y, z, base, 16);
  g('fabric').lathe([[0.15 * s, 0], [0.09 * s, 0.17 * s], [0.085 * s, 0.17 * s], [0.143 * s, 0.002]], x, y + 0.27 * s, z, shadeCol, 20);
  g(glowKey).sph(0.045 * s, x, y + 0.3 * s, z, '#fff0c8', 1, 1, 1, 8);
}

/* ------------------------------ planta ------------------------------ */
export function plant(g: G, x: number, z: number, pot: string, s = 1, y = 0): void {
  const p = g('paint');
  p.lathe([[0.13 * s, 0], [0.16 * s, 0.26 * s], [0.18 * s, 0.28 * s], [0.18 * s, 0.31 * s], [0.0, 0.31 * s]], x, y, z, pot, 18);
  p.cyl(0.155 * s, 0.155 * s, 0.01, x, y + 0.28 * s, z, '#4a3020', 14);
  // folhas em leque (elipsoides)
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + 0.3;
    const tilt = 0.5 + (i % 3) * 0.15;
    const L = (0.32 + (i % 2) * 0.1) * s;
    const leaf = new THREE.SphereGeometry(0.5, 8, 6);
    leaf.scale(0.14 * s, L, 0.035 * s);
    leaf.translate(0, L / 2, 0);
    leaf.rotateX(tilt);
    leaf.rotateY(a);
    p.geo(leaf, i % 2 ? '#3f9a4a' : '#5ab85a', x, y + 0.3 * s, z);
  }
}

/* ------------------------------ prateleira com livros ------------------------------ */
export function bookshelf(g: G, x: number, z: number, ry: number, w: number, h: number, d: number, col: string, levels = 4, books = true): void {
  const wd = g('wood');
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const P = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];
  const t = 0.03;
  // laterais, fundo, prateleiras
  for (const sx of [-1, 1]) {
    const [px, pz] = P((sx * (w - t)) / 2, 0);
    wd.box(t, h, d, px, 0, pz, col, ry);
  }
  {
    const [px, pz] = P(0, -d / 2 + 0.01);
    wd.box(w - t * 2, h, 0.02, px, 0, pz, shade(col, -0.15), ry);
  }
  for (let i = 0; i <= levels; i++) {
    const [px, pz] = P(0, 0);
    wd.box(w - t * 2, t, d, px, i === 0 ? 0.04 : (i / levels) * (h - t), pz, col, ry);
  }
  if (!books) return;
  const cols = ['#e05a5a', '#5a8ae0', '#e0c05a', '#5ab07a', '#a05ad0', '#f08a3a', '#3ab0b0'];
  const p = g('paint');
  let seed = Math.floor(x * 13 + z * 7) & 1023;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) % 1;
  for (let i = 0; i < levels; i++) {
    const y = i === 0 ? 0.07 : (i / levels) * (h - t) + t;
    const top = ((i + 1) / levels) * (h - t);
    let u = -w / 2 + t + 0.02;
    while (u < w / 2 - t - 0.08) {
      const bw = 0.03 + r() * 0.035;
      const bh = Math.min(top - y - 0.03, 0.17 + r() * 0.1);
      if (r() < 0.12) {
        u += 0.08;
        continue;
      }
      const lean = r() < 0.1 ? 0.25 : 0;
      const [px, pz] = P(u + bw / 2, 0.01);
      p.box(bw, bh, d * 0.75, px, y, pz, cols[Math.floor(r() * cols.length)], ry, 0, lean);
      u += bw + 0.004 + lean * 0.1;
    }
  }
}

/* ------------------------------ janela com céu ------------------------------ */
/**
 * Vidro + caixilho no vão de uma parede e (opcional) um "fundo" de céu noturno
 * a `back` m do lado de fora (para salas sem exterior modelado).
 * (x,z) = centro do vão no plano da parede; ry = 0 → parede ao longo de X, exterior em −z.
 */
export function windowPane(k: MapKit, zone: string, x: number, y: number, z: number, ry: number, w: number, h: number, frameCol = '#ffffff', back = 0, cross = true): void {
  const g = k.zone(zone);
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const p = g('trim');
  // caixilho central (cruz) + vidro
  const fw = 0.04;
  if (cross) {
    p.box(fw, h, 0.05, x, y, z, frameCol, ry);
    p.box(w, fw, 0.05, x, y + h / 2 - fw / 2, z, frameCol, ry);
  }
  g('glass').sharp(w, h, 0.008, x, y, z, '#ffffff', ry);
  if (back > 0) {
    const sky = k.tmat(nightSky(true, true), { basic: true });
    const bw = w * 2.2;
    const bh = h * 1.8;
    // fundo virado para dentro (+z local), `back` m do lado de fora (−z local)
    k.mesh(quad(bw, bh), sky, x - s * back, y + h / 2, z - c * back, ry);
  }
}

/** cortina franzida (cai do varão até yb) */
export function curtain(g: G, x0: number, x1: number, z: number, yTop: number, yb: number, col: string, axisZ = false): void {
  const p = g('fabric');
  const n = Math.max(3, Math.round(Math.abs(x1 - x0) / 0.09));
  const step = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const u = x0 + step * (i + 0.5);
    const off = (i % 2 ? 0.025 : -0.005) + 0.01;
    if (axisZ) p.cyl(0.05, 0.06, yTop - yb, z + off, yb, u, col, 6);
    else p.cyl(0.05, 0.06, yTop - yb, u, yb, z + off, col, 6);
  }
  const m = g('metal');
  if (axisZ) m.cyl(0.015, 0.015, Math.abs(x1 - x0) + 0.2, z + 0.03, yTop + 0.02, (x0 + x1) / 2, '#c8b07a', 6, Math.PI / 2);
  else m.cyl(0.015, 0.015, Math.abs(x1 - x0) + 0.2, (x0 + x1) / 2, yTop + 0.02, z + 0.03, '#c8b07a', 6, 0, Math.PI / 2);
}

/** tapete com textura (malha avulsa, UV 0..1) */
export function rug(k: MapKit, tex: THREE.Texture, x: number, z: number, w: number, d: number, round = false, ry = 0, y = 0.006): THREE.Mesh {
  const geo = round ? new THREE.CircleGeometry(0.5, 40) : new THREE.PlaneGeometry(1, 1, 4, 4);
  geo.rotateX(-Math.PI / 2);
  geo.scale(w, 1, d);
  const m = k.mesh(geo, k.tmat(tex), x, y, z, ry);
  m.renderOrder = 0;
  // borda levemente elevada (espessura) — anel escuro embaixo
  return m;
}

export function shade(hex: string, t: number): string {
  const c = new THREE.Color(hex);
  if (t > 0) c.lerp(new THREE.Color(1, 1, 1), t);
  else c.multiplyScalar(1 + t);
  return '#' + c.getHexString();
}
