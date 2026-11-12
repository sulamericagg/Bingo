/* ============================================================
 *  BLOOP PINK — geometrias: caixas arredondadas, UV em metros (projeção por eixo),
 *  "Builder" que junta peças por material (poucas chamadas de desenho), e as
 *  peças de cada forma de produto (frascos em torno/lathe, tampas, rótulos).
 * ============================================================ */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Shape } from './catalog';
import { SHAPE_DIM } from './data';

/** caixa com cantos arredondados (seg baixo = barato) */
export function rbox(w: number, h: number, d: number, r = 0.01, seg = 2): THREE.BufferGeometry {
  const rr = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  if (rr <= 0.0005) return new THREE.BoxGeometry(w, h, d);
  return new RoundedBoxGeometry(w, h, d, seg, rr);
}

/** UV em metros por projeção no eixo dominante da normal (texturas contínuas entre peças) */
export function uvMeters(g: THREE.BufferGeometry, scale = 1, ox = 0, oy = 0, oz = 0): THREE.BufferGeometry {
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  let n = g.getAttribute('normal') as THREE.BufferAttribute | undefined;
  if (!n) {
    g.computeVertexNormals();
    n = g.getAttribute('normal') as THREE.BufferAttribute;
  }
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + ox;
    const y = p.getY(i) + oy;
    const z = p.getZ(i) + oz;
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    let u: number;
    let v: number;
    if (ay >= ax && ay >= az) {
      u = x;
      v = z;
    } else if (ax >= az) {
      u = z;
      v = y;
    } else {
      u = x;
      v = y;
    }
    uv[i * 2] = u * scale;
    uv[i * 2 + 1] = v * scale;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

/** junta peças por material → um Mesh por material */
export class Builder {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(g: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): this {
    const gg = g.index ? g.toNonIndexed() : g.clone();
    if (g !== gg) g.dispose();
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    gg.applyMatrix4(_m);
    // só posição/normal/uv (atributos iguais para mesclar)
    for (const k of Object.keys(gg.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') gg.deleteAttribute(k);
    if (!gg.getAttribute('normal')) gg.computeVertexNormals();
    const map = (mat as THREE.MeshStandardMaterial).map;
    // textura repetida (madeira, mármore, tecido): UV em metros, contínuo; arte (logo, tela): UV original
    if (!gg.getAttribute('uv') || (map && map.repeat.x !== 1)) uvMeters(gg);
    let l = this.parts.get(mat);
    if (!l) this.parts.set(mat, (l = []));
    l.push(gg);
    return this;
  }
  /** adiciona com UV em metros calculado DEPOIS de posicionar (texturas contínuas no mundo) */
  addW(g: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, ry = 0, ox = 0, oz = 0): this {
    const gg = g.index ? g.toNonIndexed() : g.clone();
    g.dispose();
    _e.set(0, ry, 0);
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(1, 1, 1));
    gg.applyMatrix4(_m);
    uvMeters(gg, 1, ox, 0, oz);
    for (const k of Object.keys(gg.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') gg.deleteAttribute(k);
    let l = this.parts.get(mat);
    if (!l) this.parts.set(mat, (l = []));
    l.push(gg);
    return this;
  }
  build(o: { shadow?: boolean; receive?: boolean } = {}): THREE.Group {
    const grp = new THREE.Group();
    for (const [mat, list] of this.parts) {
      const g = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (list.length > 1) for (const x of list) x.dispose();
      if (!g) continue;
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = !!o.shadow && !(mat as THREE.MeshStandardMaterial).transparent;
      mesh.receiveShadow = o.receive !== false;
      grp.add(mesh);
    }
    this.parts.clear();
    return grp;
  }
  get empty(): boolean {
    return this.parts.size === 0;
  }
}

/* ------------------------------ produtos ------------------------------ */
export type PartKind = 'body' | 'cap' | 'glass' | 'label' | 'metal';
export interface ProductPart {
  kind: PartKind;
  geo: THREE.BufferGeometry;
}

function lathe(pts: [number, number][], seg = 14): THREE.BufferGeometry {
  return new THREE.LatheGeometry(
    pts.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)),
    seg,
  );
}
function cyl(r: number, h: number, y: number, seg = 14, rTop = r): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, r, h, seg, 1);
  g.translate(0, y + h / 2, 0);
  return g;
}
function box(w: number, h: number, d: number, y: number, r = 0.004): THREE.BufferGeometry {
  const g = rbox(w, h, d, r, 2);
  g.translate(0, y + h / 2, 0);
  return g;
}
/** rótulo na frente (+z), largura w, altura h, centro em y, a z */
function label(w: number, h: number, y: number, z: number, curve = 0): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h, curve ? 6 : 1, 1);
  if (curve) {
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      p.setZ(i, -Math.pow(x / (w / 2), 2) * curve);
    }
    g.computeVertexNormals();
  }
  g.translate(0, y, z);
  return g;
}

/** peças da forma (base no y=0, frente para +z), no tamanho de SHAPE_DIM */
export function productParts(s: Shape): ProductPart[] {
  const [w, h, d] = SHAPE_DIM[s];
  const P = (kind: PartKind, geo: THREE.BufferGeometry): ProductPart => ({ kind, geo });
  switch (s) {
    case 'splash': {
      // frasco plástico oval, ombro arredondado, válvula spray
      const body = lathe([[0, 0], [w * 0.47, 0], [w * 0.5, 0.01], [w * 0.5, h * 0.72], [w * 0.38, h * 0.8], [w * 0.16, h * 0.84], [w * 0.15, h * 0.86], [0, h * 0.86]], 18);
      body.scale(1, 1, d / w);
      return [P('body', body), P('cap', cyl(w * 0.19, h * 0.14, h * 0.86, 12, w * 0.15)), P('label', label(w * 0.82, h * 0.42, h * 0.38, (d / 2) * 1.0 + 0.0015, 0.008))];
    }
    case 'perfume': {
      const gh = h * 0.68;
      return [
        P('glass', box(w, gh, d, 0, 0.012)),
        P('body', box(w * 0.82, gh * 0.78, d * 0.78, gh * 0.06, 0.008)),
        P('metal', cyl(w * 0.14, h * 0.06, gh, 10)),
        P('cap', box(w * 0.55, h * 0.26, d * 0.7, gh + h * 0.06, 0.012)),
        P('label', label(w * 0.5, gh * 0.28, gh * 0.45, d / 2 + 0.0012)),
      ];
    }
    case 'lipstick':
      return [P('cap', cyl(w * 0.5, h * 0.55, 0, 12)), P('metal', cyl(w * 0.42, h * 0.12, h * 0.55, 12)), P('body', lathe([[w * 0.34, h * 0.67], [w * 0.34, h * 0.88], [w * 0.2, h * 0.98], [0.0001, h]], 12))];
    case 'gloss':
      return [P('body', cyl(w * 0.45, h * 0.66, 0, 12)), P('cap', lathe([[w * 0.5, h * 0.66], [w * 0.5, h * 0.95], [w * 0.4, h], [0, h]], 12))];
    case 'compact':
      return [P('cap', lathe([[0, 0], [w * 0.48, 0], [w * 0.5, h * 0.3], [w * 0.5, h * 0.75], [w * 0.45, h], [0, h]], 20)), P('body', cyl(w * 0.36, 0.002, h * 0.999, 18))];
    case 'mascara':
      return [P('body', cyl(w * 0.5, h * 0.6, 0, 12)), P('metal', cyl(w * 0.5, h * 0.04, h * 0.6, 12)), P('cap', lathe([[w * 0.48, h * 0.64], [w * 0.48, h * 0.97], [w * 0.3, h], [0, h]], 12))];
    case 'polish': {
      const gh = h * 0.5;
      return [P('glass', lathe([[0, 0], [w * 0.47, 0], [w * 0.5, gh * 0.12], [w * 0.5, gh * 0.8], [w * 0.3, gh], [0, gh]], 14)), P('body', lathe([[0, gh * 0.06], [w * 0.4, gh * 0.06], [w * 0.42, gh * 0.75], [0, gh * 0.75]], 12)), P('cap', cyl(w * 0.24, h * 0.5, gh, 12))];
    }
    case 'tube': {
      // bisnaga em pé sobre a tampa: tampa embaixo, corpo achatando para cima
      const g = lathe([[w * 0.5, h * 0.14], [w * 0.5, h * 0.55], [w * 0.52, h * 0.9], [w * 0.52, h], [0, h]], 16);
      const p = g.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        const k = Math.min(1, Math.max(0, (y - h * 0.14) / (h * 0.86)));
        p.setZ(i, p.getZ(i) * (1 - k * 0.85) * (d / w));
        p.setX(i, p.getX(i) * (1 + k * 0.15));
      }
      g.computeVertexNormals();
      return [P('cap', cyl(w * 0.42, h * 0.14, 0, 12)), P('body', g), P('label', label(w * 0.8, h * 0.3, h * 0.45, d * 0.38, 0.006))];
    }
    case 'dropper': {
      const gh = h * 0.62;
      return [
        P('glass', lathe([[0, 0], [w * 0.48, 0], [w * 0.5, gh * 0.1], [w * 0.5, gh * 0.82], [w * 0.22, gh], [0, gh]], 16)),
        P('body', lathe([[0, gh * 0.05], [w * 0.42, gh * 0.05], [w * 0.43, gh * 0.7], [0, gh * 0.7]], 12)),
        P('cap', cyl(w * 0.24, h * 0.14, gh, 12)),
        P('metal', lathe([[w * 0.2, gh + h * 0.14], [w * 0.22, gh + h * 0.28], [w * 0.12, h * 0.98], [0, h]], 10)),
        P('label', label(w * 0.7, gh * 0.4, gh * 0.4, w * 0.5 + 0.0012, 0.01)),
      ];
    }
    case 'jar':
      return [P('body', lathe([[0, 0], [w * 0.44, 0], [w * 0.47, h * 0.08], [w * 0.47, h * 0.7], [w * 0.42, h * 0.72], [0, h * 0.72]], 20)), P('cap', lathe([[w * 0.49, h * 0.66], [w * 0.5, h * 0.96], [w * 0.46, h], [0, h]], 20)), P('label', label(w * 0.6, h * 0.36, h * 0.36, w * 0.47 + 0.0012, 0.012))];
    case 'pump': {
      const bh = h * 0.72;
      return [
        P('body', box(w, bh, d, 0, 0.02)),
        P('cap', cyl(w * 0.16, h * 0.12, bh, 12)),
        P('metal', cyl(w * 0.06, h * 0.1, bh + h * 0.12, 8)),
        P('cap', box(w * 0.42, h * 0.05, w * 0.14, bh + h * 0.2, 0.006)),
        P('label', label(w * 0.75, bh * 0.45, bh * 0.45, d / 2 + 0.0012)),
      ];
    }
    case 'tub':
      return [P('body', lathe([[0, 0], [w * 0.46, 0], [w * 0.48, h * 0.05], [w * 0.5, h * 0.85], [0, h * 0.85]], 22)), P('cap', lathe([[w * 0.51, h * 0.82], [w * 0.51, h * 0.97], [w * 0.48, h], [0, h]], 22)), P('label', label(w * 0.65, h * 0.45, h * 0.42, w * 0.49 + 0.0015, 0.025))];
    case 'pills':
      return [P('body', lathe([[0, 0], [w * 0.46, 0], [w * 0.5, h * 0.06], [w * 0.5, h * 0.72], [w * 0.4, h * 0.78], [0, h * 0.78]], 16)), P('cap', cyl(w * 0.42, h * 0.22, h * 0.78, 16)), P('label', label(w * 0.66, h * 0.4, h * 0.38, w * 0.5 + 0.0012, 0.012))];
    case 'pouch': {
      const g = rbox(w, h, d, Math.min(d * 0.45, 0.03), 3);
      g.translate(0, h / 2, 0);
      // barriga macia
      const p = g.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i) / h;
        p.setZ(i, p.getZ(i) * (0.75 + Math.sin(y * Math.PI) * 0.35));
      }
      g.computeVertexNormals();
      return [P('body', g), P('cap', box(w * 0.92, 0.008, d * 0.2, h - 0.004, 0.002)), P('metal', box(0.012, 0.03, 0.006, h - 0.03, 0.002).translate(w * 0.32, 0, d * 0.2))];
    }
    case 'brush':
      return [P('body', lathe([[w * 0.2, 0], [w * 0.32, h * 0.05], [w * 0.36, h * 0.5], [w * 0.3, h * 0.55], [0, h * 0.55]], 10)), P('metal', cyl(w * 0.36, h * 0.12, h * 0.55, 10, w * 0.42)), P('cap', lathe([[w * 0.42, h * 0.67], [w * 0.55, h * 0.8], [w * 0.5, h * 0.93], [w * 0.2, h], [0, h]], 10))];
    case 'giftbox':
      return [
        P('body', box(w, h * 0.82, d, 0, 0.006)),
        P('body', box(w * 1.03, h * 0.18, d * 1.03, h * 0.72, 0.006)),
        P('cap', box(w * 0.14, h * 0.92, d * 1.05, 0, 0.002)),
        P('cap', box(w * 1.05, h * 0.92, d * 0.14, 0, 0.002)),
        P('cap', new THREE.TorusGeometry(0.022, 0.009, 6, 10).rotateY(0.6).translate(-0.02, h * 0.92 + 0.012, 0)),
        P('cap', new THREE.TorusGeometry(0.022, 0.009, 6, 10).rotateY(-0.6).translate(0.02, h * 0.92 + 0.012, 0)),
        P('label', label(w * 0.32, h * 0.32, h * 0.42, d * 0.515 + 0.001).translate(w * 0.27, 0, 0)),
      ];
    /* ---------- mercadinho ---------- */
    case 'fruit': {
      const g = new THREE.SphereGeometry(w * 0.5, 14, 10);
      g.scale(1, (h / w) * 0.95, 1);
      g.translate(0, h * 0.5, 0);
      // covinha em cima
      const p = g.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        const r = Math.hypot(p.getX(i), p.getZ(i));
        if (y > h * 0.85 && r < w * 0.18) p.setY(i, y - (w * 0.18 - r) * 0.5);
      }
      g.computeVertexNormals();
      return [P('body', g), P('cap', cyl(0.004, 0.02, h * 0.88, 5)), P('cap', new THREE.SphereGeometry(0.012, 6, 4).scale(1.6, 0.4, 1).translate(0.012, h * 0.95, 0))];
    }
    case 'veg': {
      const body = lathe([[0, 0], [w * 0.2, h * 0.04], [w * 0.42, h * 0.3], [w * 0.5, h * 0.7], [w * 0.4, h * 0.82], [0, h * 0.84]], 12);
      return [P('body', body), P('cap', lathe([[w * 0.25, h * 0.8], [w * 0.4, h * 0.92], [w * 0.15, h], [0, h]], 8))];
    }
    case 'tray': {
      // bandeja de isopor + carne + filme plástico
      return [P('cap', box(w, h * 0.35, d, 0, 0.008)), P('body', box(w * 0.82, h * 0.45, d * 0.78, h * 0.3, 0.02)), P('glass', box(w * 0.98, h * 0.08, d * 0.98, h * 0.75, 0.01)), P('label', label(w * 0.3, d * 0.3, 0, 0).rotateX(-Math.PI / 2).translate(w * 0.25, h * 0.84, d * 0.1))];
    }
    case 'carton': {
      const g = new THREE.BufferGeometry();
      const bh = h * 0.8;
      const b0 = box(w, bh, d, 0, 0.003);
      // telhadinho da caixa de leite
      const roof = new THREE.CylinderGeometry(w * 0.5, w * 0.5, d, 3, 1);
      roof.rotateZ(Math.PI / 2).rotateY(Math.PI / 2).scale(1, 0.55, 1).translate(0, bh + h * 0.07, 0);
      void g;
      return [P('body', b0), P('body', roof), P('cap', cyl(w * 0.12, h * 0.05, bh + h * 0.08, 10)), P('label', label(w * 0.8, bh * 0.5, bh * 0.45, d / 2 + 0.0012))];
    }
    case 'bottle': {
      const body = lathe([[0, 0], [w * 0.46, 0], [w * 0.5, h * 0.05], [w * 0.5, h * 0.55], [w * 0.36, h * 0.7], [w * 0.17, h * 0.85], [w * 0.16, h * 0.9], [0, h * 0.9]], 16);
      return [P('body', body), P('cap', cyl(w * 0.18, h * 0.1, h * 0.9, 10)), P('label', label(w * 0.9, h * 0.25, h * 0.3, w * 0.5 + 0.0015, 0.02))];
    }
    case 'sack': {
      const g = rbox(w, h, d, Math.min(d * 0.45, 0.03), 3);
      g.translate(0, h / 2, 0);
      const p = g.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i) / h;
        p.setZ(i, p.getZ(i) * (0.8 + Math.sin(y * Math.PI) * 0.3));
      }
      g.computeVertexNormals();
      return [P('body', g), P('label', label(w * 0.7, h * 0.4, h * 0.5, d * 0.62 + 0.002)), P('cap', box(w * 0.9, h * 0.06, d * 0.5, h * 0.92, 0.004))];
    }
    case 'can':
      return [P('label', cyl(w * 0.5, h * 0.84, h * 0.08, 16)), P('metal', cyl(w * 0.47, h * 0.08, 0, 16)), P('metal', cyl(w * 0.47, h * 0.08, h * 0.92, 16)), P('body', cyl(w * 0.505, h * 0.3, h * 0.35, 16))];
    case 'loaf': {
      const g = rbox(w, h, d, Math.min(h * 0.45, 0.045), 4);
      g.translate(0, h / 2, 0);
      return [P('body', g), P('glass', box(w * 1.04, h * 1.04, d * 1.04, -0.002, 0.03)), P('cap', box(0.02, 0.02, d * 0.5, h * 0.5, 0.004).translate(w * 0.5, 0, 0))];
    }
  }
}

/** peças agrupadas por tipo (uma geometria por tipo) — para InstancedMesh */
export function productPartsMerged(s: Shape): Map<PartKind, THREE.BufferGeometry> {
  const by = new Map<PartKind, THREE.BufferGeometry[]>();
  for (const p of productParts(s)) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    if (g !== p.geo) p.geo.dispose();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.getAttribute('uv')) uvMeters(g);
    let l = by.get(p.kind);
    if (!l) by.set(p.kind, (l = []));
    l.push(g);
  }
  const out = new Map<PartKind, THREE.BufferGeometry>();
  for (const [k, l] of by) {
    const g = l.length === 1 ? l[0] : mergeGeometries(l, false)!;
    if (l.length > 1) l.forEach((x) => x.dispose());
    g.computeBoundingSphere();
    out.set(k, g);
  }
  return out;
}
