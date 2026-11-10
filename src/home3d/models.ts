/* ============================================================
 *  Móveis procedurais (formas arredondadas, cores chapadas da paleta).
 *  Cada móvel vira UMA geometria mesclada com cores por vértice
 *  (oclusão de ambiente "assada": a base fica mais escura) + partes
 *  que brilham + faces com arte (tela, quadro). Geometrias em cache por id+cor.
 * ============================================================ */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { dimsOf, KINDS, type Kind } from './adapter';
import { artTexture, shade } from './textures';

export interface ModelParts {
  solid: THREE.BufferGeometry | null;
  glow: THREE.BufferGeometry | null;
  faces: { w: number; h: number; x: number; y: number; z: number; ry: number; tex: THREE.Texture }[];
  w: number;
  d: number;
  h: number;
}

const tmpColor = new THREE.Color();
class PB {
  solid: THREE.BufferGeometry[] = [];
  glow: THREE.BufferGeometry[] = [];
  faces: ModelParts['faces'] = [];
  constructor(readonly seg: number) {}
  private push(g: THREE.BufferGeometry, x: number, y: number, z: number, col: string, o: { rx?: number; ry?: number; rz?: number; glow?: boolean; sx?: number; sy?: number; sz?: number }): void {
    if (o.sx || o.sy || o.sz) g.scale(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
    if (o.rx) g.rotateX(o.rx);
    if (o.rz) g.rotateZ(o.rz);
    if (o.ry) g.rotateY(o.ry);
    g.translate(x, y, z);
    let ng = g.index ? g.toNonIndexed() : g;
    if (ng !== g) g.dispose();
    ng.deleteAttribute('uv');
    const n = ng.getAttribute('position').count;
    const c = new Float32Array(n * 3);
    tmpColor.set(col).convertSRGBToLinear();
    for (let i = 0; i < n; i++) {
      c[i * 3] = tmpColor.r;
      c[i * 3 + 1] = tmpColor.g;
      c[i * 3 + 2] = tmpColor.b;
    }
    ng.setAttribute('color', new THREE.BufferAttribute(c, 3));
    (o.glow ? this.glow : this.solid).push(ng);
  }
  /** caixa arredondada; (x,y,z) = centro da BASE */
  box(w: number, h: number, d: number, x: number, y: number, z: number, col: string, o: { r?: number; rx?: number; ry?: number; rz?: number; glow?: boolean } = {}): this {
    const r = Math.min(o.r ?? 0.04, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
    const g = r > 0.005 && this.seg > 0 ? new RoundedBoxGeometry(w, h, d, this.seg, r) : new THREE.BoxGeometry(w, h, d);
    g.translate(0, h / 2, 0);
    this.push(g, x, y, z, col, o);
    return this;
  }
  cyl(rt: number, rb: number, h: number, x: number, y: number, z: number, col: string, o: { seg?: number; rx?: number; rz?: number; ry?: number; glow?: boolean } = {}): this {
    const g = new THREE.CylinderGeometry(rt, rb, h, o.seg ?? 12);
    g.translate(0, h / 2, 0);
    this.push(g, x, y, z, col, o);
    return this;
  }
  sph(r: number, x: number, y: number, z: number, col: string, o: { sx?: number; sy?: number; sz?: number; glow?: boolean; seg?: number } = {}): this {
    const s = o.seg ?? 10;
    const g = new THREE.SphereGeometry(r, s, Math.max(6, Math.round(s * 0.7)));
    this.push(g, x, y, z, col, o);
    return this;
  }
  /** sólido de revolução: perfil [raio, y][] */
  lathe(prof: [number, number][], x: number, y: number, z: number, col: string, o: { seg?: number; glow?: boolean; sx?: number; sz?: number } = {}): this {
    const g = new THREE.LatheGeometry(
      prof.map(([r, yy]) => new THREE.Vector2(r, yy)),
      o.seg ?? 16,
    );
    this.push(g, x, y, z, col, o);
    return this;
  }
  /** tubo por pontos (pés curvos, alças, caules) */
  tube(pts: [number, number, number][], r: number, col: string, seg = 10): this {
    const c = new THREE.CatmullRomCurve3(pts.map(([a, b2, c2]) => new THREE.Vector3(a, b2, c2)));
    this.push(new THREE.TubeGeometry(c, seg, r, 6, false), 0, 0, 0, col, {});
    return this;
  }
  /** tufo de folhas: esfera deformada (normais suaves) */
  leafy(r: number, x: number, y: number, z: number, col: string, seed: number, o: { sx?: number; sy?: number; sz?: number } = {}): this {
    const g = new THREE.SphereGeometry(r, 9, 7);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const a = p.getX(i) / r;
      const b2 = p.getY(i) / r;
      const c2 = p.getZ(i) / r;
      const k = 1 + 0.16 * Math.sin(a * 5 + seed) * Math.sin(b2 * 4 + seed * 2) * Math.sin(c2 * 5 - seed);
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
    }
    g.computeVertexNormals();
    this.push(g, x, y, z, col, o);
    return this;
  }
  face(w: number, h: number, x: number, y: number, z: number, tex: THREE.Texture, ry = 0): this {
    this.faces.push({ w, h, x, y, z, ry, tex });
    return this;
  }
}

/** escurece a base (AO barato) */
function bakeAO(g: THREE.BufferGeometry, h: number, floor: boolean): void {
  if (!floor) return;
  const p = g.getAttribute('position');
  const c = g.getAttribute('color');
  const k = Math.min(0.45, Math.max(0.12, h * 0.5));
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = Math.min(1, Math.max(0, y / k));
    const f = 0.6 + 0.4 * t * t * (3 - 2 * t);
    c.setXYZ(i, c.getX(i) * f, c.getY(i) * f, c.getZ(i) * f);
  }
}

const cache = new Map<string, ModelParts>();
export function disposeModels(): void {
  for (const m of cache.values()) {
    m.solid?.dispose();
    m.glow?.dispose();
  }
  cache.clear();
}

const WOOD = '#c89a6a',
  WOOD_D = '#8a5a3c',
  WHITE = '#fffaf0',
  METAL = '#d5d0e8',
  DARK = '#4a4466',
  INKC = '#2a1a4a';

export function buildModel(kind: Kind, v: number, col: string, seg: number, seed = 0): ModelParts {
  const key = kind + v + col + seg + (seed % 4);
  const hit = cache.get(key);
  if (hit) return hit;
  const { w, d, h } = dimsOf(kind, v);
  const b = new PB(seg);
  const dk = shade(col, -0.22),
    lt = shade(col, 0.3);
  const R = v === 1 ? 0.09 : v === 2 ? 0.015 : 0.045; // fofo / normal / moderno
  switch (kind) {
    case 'sofa':
    case 'armchair': {
      // estofado de verdade: base, almofadas de assento e encosto separadas (com vinco), braços roliços, pés torneados
      const lh = 0.12;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        if (v === 1) b.sph(0.06, sx * (w / 2 - 0.12), 0.05, sz * (d / 2 - 0.12), WOOD_D);
        else b.lathe([[0.035, 0], [0.025, 0.02], [0.03, lh * 0.7], [0.04, lh + 0.01], [0, lh + 0.01]], sx * (w / 2 - 0.12), 0, sz * (d / 2 - 0.12), v === 2 ? DARK : WOOD_D, { seg: 10 });
      }
      b.box(w - 0.04, 0.2, d - 0.04, 0, lh, 0, dk, { r: R });
      const arm = 0.2;
      const inner = w - arm * 2;
      const nc = kind === 'sofa' ? Math.max(2, Math.round(inner / 0.6)) : 1;
      const cw = inner / nc;
      for (let i = 0; i < nc; i++) {
        const cx = -inner / 2 + cw * (i + 0.5);
        // assento (almofada fofa, levemente abaulada)
        b.box(cw - 0.02, 0.15, d - 0.3, cx, lh + 0.18, 0.08, lt, { r: Math.max(R, 0.05) });
        // encosto inclinado
        b.box(cw - 0.03, h - lh - 0.42, 0.18, cx, lh + 0.32, -d / 2 + 0.24, shade(col, 0.12), { r: Math.max(R, 0.06), rx: -0.12 });
      }
      b.box(w, h - lh - 0.12, 0.2, 0, lh + 0.12, -d / 2 + 0.1, col, { r: R * 1.3 });
      for (const sx of [-1, 1]) {
        b.box(arm, 0.36, d - 0.02, sx * (w / 2 - arm / 2), lh + 0.12, 0, col, { r: Math.max(R * 1.3, 0.06) });
        // braço roliço por cima
        b.cyl(0.11, 0.11, d - 0.04, sx * (w / 2 - arm / 2), lh + 0.46, -d / 2 + 0.02, shade(col, 0.05), { rx: Math.PI / 2, seg: 14 });
      }
      if (kind === 'sofa') {
        b.box(0.36, 0.32, 0.12, -w / 4, lh + 0.36, -d / 2 + 0.36, shade(col, 0.5), { r: 0.08, rx: -0.25, rz: 0.12 });
        b.box(0.32, 0.3, 0.11, w / 4, lh + 0.36, -d / 2 + 0.36, '#ffd84a', { r: 0.08, rx: -0.25, rz: -0.1 });
      }
      break;
    }
    case 'bed':
    case 'bunk': {
      const layers = kind === 'bunk' ? [0.15, 1.05] : [0.15];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.08, kind === 'bunk' ? h : 0.5, 0.08, sx * (w / 2 - 0.04), 0, sz * (d / 2 - 0.04), WOOD_D, { r: 0.02 });
      for (const y of layers) {
        b.box(w, 0.14, d, 0, y, 0, WOOD, { r: 0.03 });
        b.box(w - 0.08, 0.18, d - 0.1, 0, y + 0.14, 0, WHITE, { r: 0.06 });
        b.box(w - 0.06, 0.12, d * 0.62, 0, y + 0.24, d * 0.18, col, { r: 0.05 });
        b.box(w * 0.6, 0.12, 0.3, 0, y + 0.32, -d / 2 + 0.25, shade(col, 0.6), { r: 0.06 });
      }
      b.box(w, kind === 'bunk' ? 0.4 : 0.9, 0.08, 0, kind === 'bunk' ? h - 0.4 : 0, -d / 2 + 0.04, col, { r: R });
      if (kind === 'bunk') for (let i = 0; i < 5; i++) b.box(0.32, 0.04, 0.04, w / 2 - 0.24, 0.3 + i * 0.25, d / 2 - 0.03, WOOD_D);
      break;
    }
    case 'table':
    case 'desk':
    case 'partytable': {
      b.box(w, 0.07, d, 0, h - 0.07, 0, kind === 'partytable' ? WHITE : col, { r: R * 0.6 });
      if (kind === 'partytable') b.box(w + 0.02, 0.18, d + 0.02, 0, h - 0.22, 0, col, { r: 0.02 });
      // pés torneados e cinta sob o tampo
      for (const sx of [-1, 1])
        for (const sz of [-1, 1])
          b.lathe([[0.022, 0], [0.028, 0.02], [0.03, (h - 0.07) * 0.55], [0.04, (h - 0.07) * 0.85], [0.036, h - 0.07], [0, h - 0.07]], sx * (w / 2 - 0.1), 0, sz * (d / 2 - 0.1), v === 2 ? DARK : WOOD_D, { seg: 10 });
      b.box(w - 0.16, 0.08, 0.025, 0, h - 0.15, d / 2 - 0.1, shade(col, -0.12), { r: 0.01 });
      b.box(w - 0.16, 0.08, 0.025, 0, h - 0.15, -d / 2 + 0.1, shade(col, -0.12), { r: 0.01 });
      if (kind === 'desk') b.box(0.4, h - 0.12, d - 0.08, w / 2 - 0.24, 0.02, 0, dk, { r: 0.03 }), b.box(0.06, 0.06, 0.02, w / 2 - 0.24, h - 0.3, d / 2 - 0.02, METAL);
      break;
    }
    case 'chair':
    case 'stool': {
      const sh = kind === 'stool' ? h - 0.06 : 0.46;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(0.025, 0.022, sh, sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.06), v === 2 ? DARK : WOOD_D, { seg: 8 });
      if (kind === 'stool') b.cyl(w / 2, w / 2, 0.07, 0, sh, 0, col, { seg: 16 });
      else {
        b.box(w, 0.06, d, 0, sh, 0, col, { r: 0.03 });
        // encosto: travessa curva no topo + ripas
        for (const sx of [-1, 1]) b.box(0.05, h - sh - 0.03, 0.05, sx * (w / 2 - 0.04), sh + 0.03, -d / 2 + 0.04, col, { r: 0.02 });
        b.box(w, 0.14, 0.06, 0, h - 0.16, -d / 2 + 0.04, col, { r: R });
        for (let i = -1; i <= 1; i++) b.box(0.035, h - sh - 0.2, 0.03, i * w * 0.2, sh + 0.05, -d / 2 + 0.04, shade(col, -0.08), { r: 0.012 });
        if (v === 1) b.sph(0.12, 0, h - 0.12, -d / 2 + 0.04, lt, { sz: 0.4 });
      }
      break;
    }
    case 'floorlamp':
    case 'tablelamp': {
      const big = kind === 'floorlamp';
      // base em torno, haste, cúpula de tecido com bainha
      b.lathe([[0, 0], [w * 0.46, 0], [w * 0.48, 0.02], [w * 0.4, 0.05], [w * 0.12, 0.08], [0.03, 0.1], [0, 0.1]], 0, 0, 0, DARK, { seg: 18 });
      b.cyl(0.018, 0.018, h * (big ? 0.78 : 0.45), 0, 0.08, 0, METAL, { seg: 8 });
      b.sph(w * 0.15, 0, h * (big ? 0.78 : 0.5), 0, '#fff3b0', { glow: true });
      b.lathe([[w * 0.5, 0], [w * 0.52, 0.015], [w * 0.29, h * 0.24], [w * 0.27, h * 0.235], [w * 0.48, 0.015]], 0, h * 0.72, 0, col, { seg: 20 });
      break;
    }
    case 'plant':
    case 'cactus': {
      // vaso de cerâmica com borda virada + terra
      const pr = w * 0.34;
      const ph = h * 0.32;
      b.lathe([[0, 0], [pr * 0.72, 0], [pr * 0.78, 0.02], [pr * 0.96, ph * 0.85], [pr * 1.06, ph * 0.87], [pr * 1.08, ph], [pr * 0.96, ph], [pr * 0.92, ph * 0.9], [0, ph * 0.9]], 0, 0, 0, kind === 'cactus' ? '#ff8a3d' : col, { seg: 18 });
      b.cyl(pr * 0.92, pr * 0.92, 0.02, 0, ph * 0.9, 0, '#5b3a29', { seg: 14 });
      if (kind === 'cactus') {
        b.sph(w * 0.24, 0, h * 0.6, 0, '#4fd67a', { sy: 1.8 });
        b.sph(w * 0.12, w * 0.24, h * 0.62, 0, '#4fd67a', { sy: 1.6 });
        b.sph(0.04, 0, h * 0.98, 0, '#ff7ad9');
      } else {
        const g = ['#4fd67a', '#2fb39a', '#b6f25a'];
        // caules + tufos de folhas irregulares
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * 6.283 + seed;
          b.tube([[0, h * 0.3, 0], [Math.cos(a) * w * 0.08, h * 0.45, Math.sin(a) * w * 0.08], [Math.cos(a) * w * 0.2, h * (0.55 + (i % 3) * 0.1), Math.sin(a) * w * 0.2]], 0.012, '#3e8a3a', 6);
        }
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * 6.283 + seed;
          b.leafy(w * 0.22, Math.cos(a) * w * 0.22, h * (0.5 + (i % 3) * 0.13), Math.sin(a) * w * 0.22, g[i % 3], i + seed, { sy: 1.15 });
        }
        b.leafy(w * 0.25, 0, h * 0.84, 0, '#4fd67a', 9 + seed);
      }
      break;
    }
    case 'poster':
    case 'painting':
    case 'mirror':
    case 'window':
    case 'clock': {
      const fr = kind === 'poster' ? 0.02 : 0.06;
      if (kind === 'clock') {
        b.cyl(w / 2, w / 2, d, 0, h / 2, 0, col, { rx: Math.PI / 2, seg: 24 });
        b.face(w * 0.84, w * 0.84, 0, h / 2, d / 2 + 0.005, artTexture('clock', seed, col));
      } else {
        b.box(w, h, d, 0, 0, 0, kind === 'poster' ? WHITE : col, { r: kind === 'poster' ? 0 : 0.02 });
        const tex = artTexture(kind, seed, kind === 'window' ? col : col);
        b.face(w - fr * 2, h - fr * 2, 0, h / 2, d / 2 + 0.004, tex);
        if (kind === 'window') b.box(w + 0.1, 0.05, 0.12, 0, -0.03, 0.04, col, { r: 0.015 });
      }
      break;
    }
    case 'shelf': {
      b.box(w, 0.05, d, 0, 0, 0, col, { r: 0.015 });
      for (const sx of [-1, 1]) b.box(0.04, 0.12, d * 0.8, sx * (w / 2 - 0.15), -0.12, -0.02, DARK);
      const bc = ['#ff5c7a', '#3fa0ff', '#ffc93d', '#4fd67a'];
      for (let i = 0; i < 5; i++) b.box(0.06, 0.18 + (i % 2) * 0.05, d * 0.7, -w / 2 + 0.15 + i * 0.08, 0.05, 0, bc[i % 4], { r: 0.01 });
      b.sph(0.08, w / 2 - 0.2, 0.13, 0, '#4fd67a');
      break;
    }
    case 'rug': {
      const g = v === 1 ? new THREE.CylinderGeometry(0.5, 0.5, 1, 28) : null;
      if (g) {
        g.dispose();
        b.cyl(w / 2, w / 2, 0.015, 0, 0, 0, col, { seg: 28 });
        b.cyl(w / 2 - 0.15, w / 2 - 0.15, 0.02, 0, 0, 0, lt, { seg: 28 });
      } else {
        b.box(w, 0.015, d, 0, 0, 0, col, { r: 0 });
        b.box(w - 0.24, 0.02, d - 0.24, 0, 0, 0, lt, { r: 0 });
        b.box(w - 0.5, 0.025, d - 0.5, 0, 0, 0, col, { r: 0 });
      }
      break;
    }
    case 'tv':
    case 'computer': {
      if (kind === 'tv') {
        b.box(w, 0.45, d, 0, 0, 0, WOOD, { r: R });
        b.box(w * 0.9, h - 0.55, 0.07, 0, 0.5, 0, DARK, { r: 0.03 });
        b.box(0.2, 0.06, 0.15, 0, 0.45, 0, DARK);
        b.face(w * 0.82, h - 0.65, 0, 0.5 + (h - 0.55) / 2, 0.04, artTexture('tv', seed, col));
        b.box(w * 0.9, 0.04, 0.072, 0, h - 0.07, 0, col, { r: 0.01 });
      } else {
        b.box(w * 0.5, 0.03, 0.2, 0, 0, 0.05, METAL);
        b.box(0.05, 0.12, 0.04, 0, 0.03, -0.05, METAL);
        b.box(w, h - 0.15, 0.05, 0, 0.15, -0.05, col, { r: 0.02 });
        b.face(w * 0.86, (h - 0.15) * 0.8, 0, 0.15 + (h - 0.15) / 2, -0.02, artTexture('computer', seed, col));
      }
      break;
    }
    case 'arcade': {
      b.box(w, h, d, 0, 0, 0, col, { r: R });
      b.box(w + 0.04, 0.2, d * 0.5, 0, h - 0.2, -d * 0.25, dk, { r: 0.03 });
      b.box(w * 0.8, 0.12, 0.3, 0, 0.92, d / 2 - 0.05, dk, { r: 0.03, rx: 0.3 });
      b.sph(0.04, -0.12, 1.06, d / 2 + 0.04, '#ff5c7a');
      b.sph(0.035, 0.08, 1.05, d / 2 + 0.04, '#ffc93d', { glow: true });
      b.sph(0.035, 0.18, 1.05, d / 2 + 0.04, '#46d9e6', { glow: true });
      b.face(w * 0.72, 0.5, 0, 1.32, d / 2 + 0.003, artTexture('arcade', seed, col));
      break;
    }
    case 'aquarium': {
      b.box(w, 0.5, d, 0, 0, 0, col, { r: R });
      b.box(w, h - 0.55, d, 0, 0.5, 0, '#8fd3ff', { r: 0.03 });
      b.box(w - 0.06, 0.06, d - 0.06, 0, 0.53, 0, '#ffe0a3');
      b.sph(0.06, -0.2, 0.8, 0.05, '#ff8a3d', { sx: 1.5, glow: true });
      b.sph(0.05, 0.25, 0.92, -0.05, '#ffc93d', { sx: 1.5, glow: true });
      b.sph(0.08, 0.35, 0.6, 0, '#4fd67a', { sy: 2 });
      b.box(w + 0.02, 0.05, d + 0.02, 0, h - 0.05, 0, dk, { r: 0.015 });
      break;
    }
    case 'bookcase':
    case 'wardrobe': {
      b.box(w, h, d, 0, 0, 0, col, { r: R });
      if (kind === 'bookcase') {
        const n = 4;
        const bc = ['#ff5c7a', '#3fa0ff', '#ffc93d', '#4fd67a', '#c46bff'];
        b.box(w - 0.1, h - 0.1, 0.02, 0, 0.05, d / 2 - 0.02, dk);
        for (let s = 0; s < n; s++) {
          const y = 0.08 + s * ((h - 0.12) / n);
          b.box(w - 0.08, 0.03, d * 0.9, 0, y, 0.02, lt);
          for (let i = 0; i < 6; i++) b.box(0.08, 0.22 + ((i * 7 + s) % 3) * 0.04, d * 0.6, -w / 2 + 0.12 + i * 0.13, y + 0.03, 0.06, bc[(i + s) % 5], { r: 0.01 });
        }
      } else {
        b.box(0.02, h - 0.15, 0.02, 0, 0.1, d / 2, dk);
        for (const sx of [-1, 1]) b.sph(0.035, sx * 0.08, h * 0.55, d / 2 + 0.02, METAL);
        b.box(w + 0.04, 0.08, d + 0.04, 0, h - 0.08, 0, lt, { r: 0.03 });
      }
      break;
    }
    case 'fridge': {
      b.box(w, h, d, 0, 0, 0, col, { r: R * 1.4 });
      b.box(w - 0.02, 0.02, 0.02, 0, h * 0.62, d / 2, dk);
      for (const y of [0.4, 0.8]) b.box(0.04, 0.3, 0.04, w / 2 - 0.1, h * y, d / 2 + 0.02, METAL, { r: 0.015 });
      b.sph(0.05, -0.15, h * 0.8, d / 2 + 0.01, '#ffc93d', { sz: 0.3 });
      b.sph(0.04, 0.05, h * 0.72, d / 2 + 0.01, '#ff5c7a', { sz: 0.3 });
      break;
    }
    case 'stove':
    case 'sink':
    case 'counter': {
      b.box(w, h - 0.05, d, 0, 0, 0, col, { r: R });
      b.box(w + 0.03, 0.06, d + 0.03, 0, h - 0.06, 0, kind === 'counter' ? WOOD : METAL, { r: 0.015 });
      if (kind === 'stove') {
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(0.1, 0.1, 0.02, sx * w * 0.22, h, sz * d * 0.2, DARK, { seg: 14 });
        b.box(w * 0.7, h * 0.45, 0.02, 0, 0.15, d / 2, '#262238', { r: 0.02 });
        b.box(w * 0.5, 0.03, 0.03, 0, h * 0.68, d / 2 + 0.02, METAL);
      } else if (kind === 'sink') {
        b.box(w * 0.5, 0.03, d * 0.55, 0, h - 0.035, 0, '#8fd3ff');
        b.cyl(0.02, 0.02, 0.25, 0, h, -d / 2 + 0.1, METAL, { seg: 6 });
        b.box(0.04, 0.03, 0.14, 0, h + 0.22, -d / 2 + 0.16, METAL);
      } else {
        for (const sx of [-1, 1]) b.sph(0.03, sx * w * 0.25, h * 0.6, d / 2 + 0.01, METAL);
      }
      break;
    }
    case 'bathtub': {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.sph(0.06, sx * (w / 2 - 0.15), 0.05, sz * (d / 2 - 0.12), METAL);
      b.box(w, h - 0.06, d, 0, 0.06, 0, WHITE, { r: 0.18 });
      b.box(w - 0.16, 0.04, d - 0.16, 0, h - 0.05, 0, '#8fd3ff', { r: 0.02 });
      for (let i = 0; i < 6; i++) b.sph(0.07, -w / 4 + i * 0.12, h - 0.01, (i % 2) * 0.1 - 0.05, '#ffffff');
      b.box(w * 0.92, 0.12, d * 0.92, 0, h - 0.12, 0, col, { r: 0.05 });
      b.sph(0.07, w / 4, h + 0.04, 0.05, '#ffc93d', { sx: 1.2 }); // patinho
      break;
    }
    case 'toilet': {
      b.cyl(0.13, 0.16, 0.38, 0, 0, 0.06, WHITE, { seg: 14 });
      b.cyl(0.21, 0.19, 0.06, 0, 0.38, 0.08, col, { seg: 16 });
      b.box(w, 0.4, 0.18, 0, 0.35, -d / 2 + 0.09, WHITE, { r: 0.06 });
      b.box(0.12, 0.04, 0.06, 0.1, 0.72, -d / 2 + 0.14, METAL);
      break;
    }
    case 'piano': {
      b.box(w, h, d * 0.55, 0, 0, -d * 0.22, col, { r: R });
      b.box(w, 0.08, d * 0.45, 0, 0.72, d * 0.25, col, { r: 0.02 });
      b.box(w - 0.1, 0.03, d * 0.3, 0, 0.8, d * 0.27, WHITE);
      for (let i = 0; i < 14; i++) if (i % 7 !== 2 && i % 7 !== 6) b.box(0.04, 0.03, d * 0.16, -w / 2 + 0.12 + i * ((w - 0.2) / 14), 0.82, d * 0.22, INKC);
      for (const sx of [-1, 1]) b.box(0.08, 0.72, 0.08, sx * (w / 2 - 0.06), 0, d * 0.42, dk, { r: 0.02 });
      break;
    }
    case 'guitar': {
      b.sph(0.18, 0, 0.25, 0, col, { sz: 0.4 });
      b.sph(0.14, 0, 0.5, 0, col, { sz: 0.4 });
      b.cyl(0.05, 0.05, 0.02, 0, 0.32, 0.07, INKC, { rx: Math.PI / 2 });
      b.box(0.06, 0.45, 0.04, 0, 0.55, 0.02, WOOD_D);
      b.box(0.1, 0.12, 0.04, 0, h - 0.12, 0.02, dk, { r: 0.02 });
      break;
    }
    case 'speaker': {
      b.box(w, h, d, 0, 0, 0, col, { r: R });
      b.cyl(w * 0.32, w * 0.32, 0.04, 0, h * 0.35, d / 2, DARK, { rx: Math.PI / 2, seg: 18 });
      b.cyl(w * 0.18, w * 0.18, 0.04, 0, h * 0.75, d / 2, DARK, { rx: Math.PI / 2, seg: 14 });
      b.sph(0.03, w * 0.35, h - 0.08, d / 2, '#4fd67a', { glow: true });
      break;
    }
    case 'discoball': {
      b.cyl(0.01, 0.01, 0.25, 0, h, 0, METAL, { seg: 4 });
      b.sph(w / 2, 0, h / 2, 0, '#e8e4ff', { seg: 8 });
      b.sph(w / 2 + 0.005, 0, h / 2, 0, col, { seg: 6, glow: true, sx: 0.2, sy: 0.2, sz: 0.2 });
      break;
    }
    case 'balloons': {
      const bc = [col, '#ffc93d', '#3fa0ff', '#ff7ad9'];
      for (let i = 0; i < 4; i++) {
        const a = i * 1.7;
        const x = Math.cos(a) * 0.15,
          z = Math.sin(a) * 0.12;
        b.cyl(0.004, 0.004, h - 0.25 - (i % 2) * 0.15, x * 0.3, 0.1, z * 0.3, '#ffffff', { seg: 3 });
        b.sph(0.17, x, h - 0.2 - (i % 2) * 0.15, z, bc[i], { sy: 1.2 });
      }
      b.box(0.14, 0.1, 0.14, 0, 0, 0, '#ff5c7a', { r: 0.03 });
      break;
    }
    case 'toybox': {
      b.box(w, h * 0.8, d, 0, 0, 0, col, { r: R });
      b.box(w + 0.04, h * 0.2, d + 0.04, 0, h * 0.8, 0, lt, { r: R });
      b.sph(0.1, 0, h * 0.5, d / 2, '#ffc93d', { sz: 0.25 });
      b.sph(0.12, -w * 0.3, h + 0.04, 0, '#ff5c7a');
      break;
    }
    case 'teddy': {
      b.sph(0.17, 0, 0.17, 0, col, { sy: 1.05 });
      b.sph(0.08, 0, 0.17, 0.12, lt, { sz: 0.6 });
      b.sph(0.13, 0, 0.42, 0, col);
      for (const sx of [-1, 1]) b.sph(0.05, sx * 0.1, 0.53, 0, col), b.sph(0.06, sx * 0.13, 0.06, 0.1, col), b.sph(0.05, sx * 0.17, 0.25, 0.04, col);
      b.sph(0.05, 0, 0.4, 0.11, lt, { sz: 0.7 });
      for (const sx of [-1, 1]) b.sph(0.018, sx * 0.05, 0.46, 0.12, INKC);
      break;
    }
    case 'beanbag': {
      b.sph(w / 2, 0, h * 0.42, 0, col, { sy: 0.85, seg: 14 });
      b.sph(w * 0.3, 0, h * 0.6, -d * 0.15, lt, { sy: 0.8 });
      break;
    }
    case 'fireplace': {
      b.box(w, h, d, 0, 0, 0, col, { r: 0.03 });
      b.box(w + 0.12, 0.08, d + 0.08, 0, h, 0, WOOD, { r: 0.02 });
      b.box(w * 0.55, h * 0.5, 0.04, 0, 0.1, d / 2 - 0.01, '#262238', { r: 0.1 });
      b.sph(0.14, 0, 0.25, d / 2 - 0.08, '#ff8a3d', { glow: true, sy: 1.4 });
      b.sph(0.08, 0.1, 0.22, d / 2 - 0.05, '#ffc93d', { glow: true, sy: 1.3 });
      break;
    }
    case 'garland': {
      const bc = ['#ff5c7a', '#ffc93d', '#3fa0ff', '#4fd67a', '#c46bff'];
      b.box(w, 0.01, 0.01, 0, h - 0.02, 0, '#ffffff', { r: 0 });
      for (let i = 0; i < 9; i++) {
        const x = -w / 2 + 0.12 + i * ((w - 0.24) / 8);
        const g = new THREE.ConeGeometry(0.1, 0.22, 3);
        g.rotateZ(Math.PI);
        g.dispose();
        b.cyl(0.11, 0.001, 0.24, x, h - 0.26, 0, bc[i % 5], { seg: 3 });
      }
      break;
    }
    default:
      b.box(w, h, d, 0, 0, 0, col, { r: 0.05 });
      b.box(w + 0.02, 0.08, 0.05, 0, h * 0.55, 0, shade(col, -0.3));
  }
  const floor = !KINDS[kind].wall && !KINDS[kind].ceil;
  const solid = b.solid.length ? mergeGeometries(b.solid, false) : null;
  for (const g of b.solid) g.dispose();
  if (solid) {
    bakeAO(solid, h, floor);
    solid.computeBoundingSphere();
  }
  const glow = b.glow.length ? mergeGeometries(b.glow, false) : null;
  for (const g of b.glow) g.dispose();
  const out: ModelParts = { solid, glow, faces: b.faces, w, d, h };
  cache.set(key, out);
  return out;
}

/* ---------------- bolo e comidas da festa ---------------- */
export type FoodKind = 'cake' | 'pie' | 'tomato' | 'juice' | 'cupcake';
export const FOOD_MESS: Record<FoodKind, 'cake' | 'pie' | 'tomato' | 'juice' | 'frosting'> = { cake: 'cake', pie: 'pie', tomato: 'tomato', juice: 'juice', cupcake: 'frosting' };
export function buildFood(kind: FoodKind, seg: number): ModelParts {
  const key = 'food:' + kind + seg;
  const hit = cache.get(key);
  if (hit) return hit;
  const b = new PB(seg);
  switch (kind) {
    case 'cake':
      b.box(0.14, 0.09, 0.12, 0, 0, 0, '#ffe0a3', { r: 0.02 });
      b.box(0.145, 0.025, 0.125, 0, 0.045, 0, '#ff7ad9', { r: 0.01 });
      b.box(0.145, 0.025, 0.125, 0, 0.085, 0, '#ffb3c7', { r: 0.012 });
      b.sph(0.022, 0.02, 0.12, 0, '#ff5c7a');
      break;
    case 'pie':
      b.cyl(0.12, 0.1, 0.05, 0, 0, 0, '#c89a6a', { seg: 14 });
      b.sph(0.11, 0, 0.04, 0, '#c46bff', { sy: 0.3, seg: 12 });
      b.sph(0.05, 0, 0.07, 0, '#ffffff', { sy: 0.6 });
      break;
    case 'tomato':
      b.sph(0.07, 0, 0.07, 0, '#ff5c4a', { sy: 0.85 });
      b.cyl(0.01, 0.01, 0.03, 0, 0.12, 0, '#4fd67a', { seg: 5 });
      break;
    case 'juice':
      b.cyl(0.045, 0.04, 0.13, 0, 0, 0, '#ff8a3d', { seg: 12 });
      b.cyl(0.05, 0.05, 0.02, 0, 0.13, 0, '#ffffff', { seg: 12 });
      b.cyl(0.006, 0.006, 0.1, 0.015, 0.12, 0, '#ff5c7a', { seg: 4, rz: 0.3 });
      break;
    case 'cupcake':
      b.cyl(0.055, 0.04, 0.06, 0, 0, 0, '#3fa0ff', { seg: 10 });
      b.sph(0.06, 0, 0.08, 0, '#ffb3c7', { sy: 0.8 });
      b.sph(0.018, 0, 0.13, 0, '#ff5c7a');
      break;
  }
  const solid = mergeGeometries(b.solid, false);
  for (const g of b.solid) g.dispose();
  solid.computeBoundingSphere();
  const out: ModelParts = { solid, glow: null, faces: [], w: 0.16, d: 0.14, h: 0.12 };
  cache.set(key, out);
  return out;
}

/** bolo inteiro com fatias restantes (0..8) — geometria nova por estado */
export function buildCake(slices: number, seg: number): ModelParts {
  const key = 'bigcake:' + slices + seg;
  const hit = cache.get(key);
  if (hit) return hit;
  const b = new PB(seg);
  b.cyl(0.32, 0.3, 0.03, 0, 0, 0, '#ffffff', { seg: 20 });
  const n = Math.max(0, Math.min(8, slices));
  if (n > 0) {
    const arc = (n / 8) * Math.PI * 2;
    const mk = (r: number, h: number, y: number, col: string) => {
      const g = new THREE.CylinderGeometry(r, r, h, 24, 1, false, 0, arc);
      g.translate(0, y + h / 2, 0);
      return { g, col };
    };
    const layers = [mk(0.25, 0.12, 0.03, '#ffe0a3'), mk(0.255, 0.03, 0.15, '#ff7ad9'), mk(0.2, 0.1, 0.18, '#ffe0a3'), mk(0.205, 0.03, 0.28, '#ffb3c7')];
    for (const l of layers) {
      // reaproveita o caminho de cor do PB
      (b as unknown as { push: (g: THREE.BufferGeometry, x: number, y: number, z: number, c: string, o: object) => void }).push(l.g, 0, 0, 0, l.col, {});
    }
    for (let i = 0; i < n; i++) {
      const a = ((i + 0.5) / 8) * Math.PI * 2;
      b.sph(0.03, Math.sin(a) * 0.15, 0.33, Math.cos(a) * 0.15, '#ff5c7a');
    }
    b.cyl(0.012, 0.012, 0.1, 0, 0.31, 0, '#3fa0ff', { seg: 6 });
    b.sph(0.02, 0, 0.43, 0, '#ffc93d', { glow: true, sy: 1.4 });
  }
  const solid = mergeGeometries(b.solid, false);
  for (const g of b.solid) g.dispose();
  const glow = b.glow.length ? mergeGeometries(b.glow, false) : null;
  for (const g of b.glow) g.dispose();
  const out: ModelParts = { solid, glow, faces: [], w: 0.64, d: 0.64, h: 0.45 };
  cache.set(key, out);
  return out;
}
