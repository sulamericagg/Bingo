/* ============================================================
 *  JANGADA BLOOP — modelos da v2 (low-poly próprios, cor por vértice):
 *  árvores de cada bioma, minérios, baús por raridade, caverna,
 *  barcos (canoa, veleiro, lancha), donos das ilhas (caranguejo,
 *  macaco, pinguim, lagarto de fogo, pirata fantasma), baú boiando
 *  (morte), arpão e os chefes com esqueleto (SkinnedMesh):
 *  Megalodonte (coluna ondulando, mandíbula, nadadeiras) e Polvo
 *  Gigante (8 tentáculos com 10 ossos cada).
 * ============================================================ */
import * as THREE from 'three';
import { MAT, box, clean, cone, cyl, initMats, merge, paint, place, sph } from './models';
import { RARITY_COL, type Biome, type Faction, type Rarity, type TreeK } from './biomes';

const _c = new THREE.Color();
const jitCol = (col: string, j: number) => {
  _c.set(col);
  const k = 1 + (Math.random() - 0.5) * j;
  return [Math.min(1, _c.r * k), Math.min(1, _c.g * k), Math.min(1, _c.b * k)];
};

/* ------------------------------ árvores ------------------------------ */
export function treeGeo(k: TreeK, s = 1): THREE.BufferGeometry {
  const L: THREE.BufferGeometry[] = [];
  switch (k) {
    case 'jungle': {
      const h = 6.5 * s;
      for (let i = 0; i < 5; i++) L.push(cyl(0.32 - i * 0.04, 0.38 - i * 0.04, h / 5 + 0.05, i % 2 ? '#6a4a2a' : '#7a5632', Math.sin(i) * 0.1, (i + 0.5) * (h / 5), 0, 0, 0, 0, 7));
      // raízes
      for (let i = 0; i < 4; i++) L.push(box(0.16, 0.7, 0.9, '#6a4a2a', Math.cos(i * 1.6) * 0.4, 0.25, Math.sin(i * 1.6) * 0.4, 0.5, i * 1.6, 0));
      // copa larga em camadas
      L.push(sph(2.2 * s, '#2a9a40', 0, h + 0.4, 0, 1.3, 0.55, 1.2, 9));
      L.push(sph(1.6 * s, '#3ab04a', 1.2, h + 0.9, 0.6, 1.1, 0.6, 1, 8));
      L.push(sph(1.5 * s, '#249040', -1.1, h + 0.7, -0.7, 1.1, 0.6, 1, 8));
      L.push(sph(1.2 * s, '#46c056', 0.2, h + 1.5, -0.2, 1.1, 0.6, 1, 8));
      // cipós
      for (let i = 0; i < 5; i++) L.push(box(0.05, 2.2, 0.05, '#3a8a3a', Math.cos(i * 1.3) * 1.6, h - 0.9, Math.sin(i * 1.3) * 1.5));
      // cacho de bananas
      L.push(sph(0.25, '#ffe04a', 0.45, h - 0.6, 0.2, 0.8, 1.3, 0.8, 6));
      break;
    }
    case 'mangrove': {
      const h = 4 * s;
      // raízes em arco (aéreas)
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const g = new THREE.TorusGeometry(0.9, 0.08, 4, 8, Math.PI);
        L.push(clean(place(paint(g, '#5a3e2a', 0.15), Math.cos(a) * 0.55, 0.1, Math.sin(a) * 0.55, 0, -a, 0)));
      }
      L.push(cyl(0.18, 0.26, h, '#6a4a32', 0, 0.8 + h / 2, 0, 0, 0, 0, 7));
      L.push(sph(1.8 * s, '#3a8a4a', 0, h + 1.2, 0, 1.4, 0.6, 1.3, 9));
      L.push(sph(1.2 * s, '#4a9a52', 0.9, h + 1.6, 0.4, 1.1, 0.6, 1, 8));
      L.push(sph(0.14, '#ff6a4a', 0.8, h + 0.6, 0.7));
      L.push(sph(0.14, '#ffd04a', -0.7, h + 0.7, 0.4));
      break;
    }
    case 'pine': {
      const h = 5.2 * s;
      L.push(cyl(0.16, 0.24, h * 0.4, '#6a4a32', 0, h * 0.2, 0, 0, 0, 0, 6));
      for (let i = 0; i < 4; i++) {
        const y = h * 0.3 + i * h * 0.17;
        const r = (1.7 - i * 0.36) * s;
        L.push(cone(r, h * 0.3, i % 2 ? '#2a7a5a' : '#226a4e', 0, y + h * 0.15, 0, 0, i * 0.4, 0, 7));
        // neve por cima
        L.push(cone(r * 0.72, h * 0.12, '#f4faff', 0, y + h * 0.25, 0, 0, i * 0.4, 0, 7));
      }
      break;
    }
    case 'dead': {
      const h = 4.2 * s;
      L.push(cyl(0.14, 0.26, h, '#2a2228', 0, h / 2, 0, 0, 0, 0.06, 6));
      for (let i = 0; i < 5; i++) {
        const y = h * 0.45 + i * 0.45;
        const a = i * 2.1;
        L.push(cyl(0.04, 0.08, 1.3, '#3a2a2a', Math.cos(a) * 0.45, y + 0.3, Math.sin(a) * 0.45, Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9, 5));
      }
      // brasas
      L.push(sph(0.08, '#ff6a2a', 0.1, h * 0.7, 0.14));
      L.push(sph(0.06, '#ffaa3a', -0.12, h * 0.4, 0.12));
      break;
    }
    case 'crystal': {
      const h = 4.6 * s;
      L.push(cyl(0.14, 0.22, h, '#e8f4ff', 0, h / 2, 0, 0, 0, 0, 6));
      const cols = ['#7af0ff', '#c89aff', '#ff9ad8', '#9affc8'];
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const y = h * 0.55 + (i % 3) * 0.55;
        L.push(cone(0.28, 1.4, cols[i % 4], Math.cos(a) * 0.9, y + 0.4, Math.sin(a) * 0.9, Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8, 5));
      }
      L.push(cone(0.4, 1.8, '#ffffff', 0, h + 0.6, 0, 0, 0, 0, 5));
      L.push(sph(0.22, '#ffe86a', 0.5, h * 0.75, 0.3, 1, 1, 1, 6));
      break;
    }
    default:
      return merge([box(0.1, 0.1, 0.1, '#fff')]);
  }
  return merge(L);
}
/** arbusto com a fruta do bioma */
export function fruitBushGeo(fruit: string, leaf = '#3aa84e'): THREE.BufferGeometry {
  const L = [sph(0.5, leaf, 0, 0.38, 0, 1.2, 0.8, 1.1, 8), sph(0.38, '#4cc05a', 0.38, 0.32, 0.1, 1, 0.8, 1, 7)];
  for (let i = 0; i < 7; i++) {
    const a = i * 1.7;
    L.push(sph(0.085, fruit, Math.cos(a) * 0.48, 0.42 + (i % 3) * 0.09, Math.sin(a) * 0.42, 1, 1.15, 1, 6));
  }
  return merge(L);
}
/** pedra com veios do minério (brilham) */
export function oreGeo(col: string, rock: string): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.85, 0);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * 0.75);
  const L: THREE.BufferGeometry[] = [clean(paint(g, rock, 0.15))];
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05;
    L.push(cone(0.14, 0.42, col, Math.cos(a) * 0.55, 0.35 + (i % 2) * 0.25, Math.sin(a) * 0.55, Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9, 4));
  }
  return merge(L);
}
/** pedra grande do bioma (sem minério) */
export function boulderGeo(rock: string, s = 1): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.9 * s, 1);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const k = 0.85 + Math.sin(p.getX(i) * 3.1 + p.getZ(i) * 2.3) * 0.12;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * 0.7 * k, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return merge([clean(paint(g, rock, 0.18))]);
}
/** plantinha/flor decorativa */
export function plantGeo(col: string, flower: string): THREE.BufferGeometry {
  const L: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) L.push(box(0.06, 0.5, 0.02, col, Math.cos(i * 1.3) * 0.08, 0.25, Math.sin(i * 1.3) * 0.08, Math.cos(i) * 0.3, i, Math.sin(i) * 0.3));
  L.push(sph(0.08, flower, 0, 0.55, 0));
  return merge(L);
}

/* ------------------------------ baús por raridade ------------------------------ */
export function chestModel(r: Rarity): { root: THREE.Group; lid: THREE.Object3D; glow: THREE.Object3D | null } {
  initMats();
  const root = new THREE.Group();
  const wood = ['#a8682e', '#5a6a8a', '#5a2a8a', '#c8902a'][r];
  const band = ['#6a4a2a', '#5ab0ff', '#d88aff', '#fff0a0'][r];
  const body = merge([
    box(0.9, 0.5, 0.6, wood, 0, 0.25, 0),
    box(0.94, 0.08, 0.64, band, 0, 0.05, 0),
    box(0.08, 0.52, 0.64, band, -0.3, 0.26, 0),
    box(0.08, 0.52, 0.64, band, 0.3, 0.26, 0),
    box(0.16, 0.16, 0.06, '#ffd34a', 0, 0.42, 0.31),
    ...(r >= 2 ? [sph(0.07, r === 3 ? '#ff4f8a' : '#7af0ff', -0.3, 0.3, 0.33), sph(0.07, r === 3 ? '#4fd8ff' : '#ff9ad8', 0.3, 0.3, 0.33)] : []),
  ]);
  root.add(new THREE.Mesh(body, MAT.vc));
  const lid = new THREE.Group();
  const lg = clean(paint(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 10, 1, false, 0, Math.PI), wood, 0.08));
  lg.rotateZ(Math.PI / 2);
  lg.rotateX(-Math.PI / 2);
  lid.add(new THREE.Mesh(merge([lg, box(0.94, 0.06, 0.06, band, 0, 0.0, 0.3), box(0.08, 0.32, 0.62, band, -0.3, 0.12, 0), box(0.08, 0.32, 0.62, band, 0.3, 0.12, 0)]), MAT.vc));
  lid.position.set(0, 0.5, -0.3);
  lid.children[0].position.z = 0.3;
  root.add(lid);
  let glow: THREE.Object3D | null = null;
  if (r >= 1) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.75, 10, 8), new THREE.MeshBasicMaterial({ color: RARITY_COL[r], transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.y = 0.35;
    root.add(m);
    glow = m;
  }
  return { root, lid, glow };
}

/* ------------------------------ caverna ------------------------------ */
/** monte de pedra oco com entrada (a porta aponta para +x local) */
export function caveGeo(R: number, H: number, rock: string, rock2: string, gap: number): THREE.BufferGeometry {
  const seg = 28;
  const rings = 9;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const thick = 0.9;
  const vtx = (a: number, t: number, outer: boolean) => {
    // t: 0 base → 1 topo
    const rr = (R + (outer ? thick : 0)) * Math.cos(t * Math.PI * 0.5) * (1 + Math.sin(a * 3 + t * 4) * 0.06);
    const y = (H + (outer ? thick * 0.8 : 0)) * Math.sin(t * Math.PI * 0.5) - 0.6;
    pos.push(Math.cos(a) * rr, y, Math.sin(a) * rr);
    col.push(...jitCol(outer && t > 0.55 ? (Math.sin(a * 5 + t * 7) > 0.2 ? rock2 : rock) : outer ? rock : '#4a4652', 0.22));
  };
  const a0 = gap / 2;
  const a1 = Math.PI * 2 - gap / 2;
  for (const outer of [false, true]) {
    const base = pos.length / 3;
    for (let i = 0; i <= rings; i++) {
      const t = i / rings;
      // a porta só corta a parte de baixo
      const door = t < 0.55;
      for (let s = 0; s <= seg; s++) {
        const a = door ? a0 + (s / seg) * (a1 - a0) : (s / seg) * Math.PI * 2;
        vtx(a, t, outer);
      }
    }
    for (let i = 0; i < rings; i++)
      for (let s = 0; s < seg; s++) {
        const a = base + i * (seg + 1) + s;
        const b = a + seg + 1;
        if (outer) idx.push(a, a + 1, b, a + 1, b + 1, b);
        else idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const L: THREE.BufferGeometry[] = [clean(g)];
  // estalactites e cristais lá dentro
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * R * 0.6;
    L.push(cone(0.18, 0.9, rock, Math.cos(a) * r, H - 1.0 - Math.random() * 0.4, Math.sin(a) * r, Math.PI, 0, 0, 5));
  }
  return merge(L);
}
/** cristais que brilham dentro da caverna */
export function caveCrystalsGeo(R: number, col: string): THREE.BufferGeometry {
  const L: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 12; i++) {
    const a = 0.6 + (i / 12) * (Math.PI * 2 - 1.2);
    const r = R - 0.45;
    L.push(cone(0.12, 0.6 + Math.random() * 0.5, col, Math.cos(a) * r, -0.3 + Math.random() * 0.4, Math.sin(a) * r, Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5, 5));
  }
  return merge(L);
}

/* ------------------------------ silhueta de ilha distante ------------------------------ */
export function isleFarGeo(r: number, peak: number, biome: Biome, grass: string, sand: string): THREE.BufferGeometry {
  const L: THREE.BufferGeometry[] = [];
  L.push(clean(paint(new THREE.CylinderGeometry(r * 1.02, r * 1.1, 0.8, 14), sand, 0.06).translate(0, 0.1, 0)));
  L.push(clean(paint(new THREE.ConeGeometry(r * 0.85, peak * (biome === 'volcanic' ? 5 : 1.6), 12), grass, 0.1).translate(0, 0.5 + peak * (biome === 'volcanic' ? 2.5 : 0.8), 0)));
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7;
    L.push(cyl(0.18, 0.24, 5, '#8a6038', Math.cos(a) * r * 0.4, 3, Math.sin(a) * r * 0.4, 0, 0, 0, 5));
    L.push(sph(1.6, biome === 'snowy' ? '#f0f8ff' : '#3aa84e', Math.cos(a) * r * 0.4, 5.6, Math.sin(a) * r * 0.4, 1.3, 0.5, 1.3, 6));
  }
  return merge(L);
}
/** vulcão: cone com cratera e lava */
export function volcanoGeo(r: number, h: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r * 0.22, r, h, 14, 4, true);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const k = 1 + Math.sin(p.getX(i) * 1.7 + p.getZ(i) * 1.3) * 0.06;
    p.setXYZ(i, p.getX(i) * k, p.getY(i), p.getZ(i) * k);
  }
  g.computeVertexNormals();
  g.translate(0, h / 2, 0);
  const L = [clean(paint(g, '#3a3036', 0.2)), cyl(r * 0.2, r * 0.2, 0.2, '#ff6a2a', 0, h - 0.3, 0, 0, 0, 0, 12)];
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05;
    L.push(box(0.35, h * 0.55, 0.12, '#ff7a2a', Math.cos(a) * r * 0.5, h * 0.62, Math.sin(a) * r * 0.5, Math.sin(a) * 0.55, -a, -Math.cos(a) * 0.55));
  }
  return merge(L);
}

/* ------------------------------ barcos ------------------------------ */
/** casco: meia casca com pontas finas (frente +z) */
function hullGeo(len: number, w: number, d: number, out: string, inn: string, rim: string): THREE.BufferGeometry {
  const rings = 14;
  const seg = 10;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const prof = (t: number) => Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t))), 0.55);
  for (const inner of [false, true]) {
    const base = pos.length / 3;
    for (let i = 0; i <= rings; i++) {
      const t = i / rings;
      const z = (t - 0.5) * len;
      const k = prof(t) * (inner ? 0.88 : 1);
      const lift = Math.pow(Math.abs(t - 0.5) * 2, 3) * d * 0.6;
      for (let s = 0; s <= seg; s++) {
        const a = Math.PI + (s / seg) * Math.PI;
        const x = Math.cos(a) * (w / 2) * k;
        const y = Math.sin(a) * d * Math.max(0.15, k) * (inner ? 0.85 : 1) + lift + (inner ? 0.04 : 0);
        pos.push(x, y, z);
        col.push(...jitCol(inner ? inn : s === 0 || s === seg ? rim : out, 0.1));
      }
    }
    for (let i = 0; i < rings; i++)
      for (let s = 0; s < seg; s++) {
        const a = base + i * (seg + 1) + s;
        const b = a + seg + 1;
        if (!inner) idx.push(a, a + 1, b, a + 1, b + 1, b);
        else idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return clean(g);
}
export interface BoatModel {
  root: THREE.Group;
  sail: THREE.Object3D | null;
  prop: THREE.Object3D | null;
  paddle: THREE.Object3D | null;
}
export function boatModel(k: number): BoatModel {
  initMats();
  const root = new THREE.Group();
  let sail: THREE.Object3D | null = null;
  let prop: THREE.Object3D | null = null;
  let paddle: THREE.Object3D | null = null;
  if (k === 0) {
    root.add(new THREE.Mesh(merge([hullGeo(3.6, 1.0, 0.45, '#b8783a', '#d8a868', '#8a5a2a'), box(0.8, 0.06, 0.25, '#8a5a2a', 0, 0.02, 0.6), box(0.8, 0.06, 0.25, '#8a5a2a', 0, 0.02, -0.7)]), MAT.vc));
    const p = new THREE.Group();
    p.add(new THREE.Mesh(merge([cyl(0.03, 0.03, 1.6, '#c8935a', 0, 0, 0), box(0.18, 0.4, 0.03, '#a8703a', 0, -0.85, 0)]), MAT.vc));
    p.position.set(0.55, 0.45, 0);
    root.add(p);
    paddle = p;
  } else if (k === 1) {
    root.add(
      new THREE.Mesh(
        merge([
          hullGeo(5.2, 1.7, 0.7, '#f4f0e8', '#b8885a', '#3a6ad8'),
          box(1.2, 0.06, 1.8, '#c8935a', 0, 0.02, -0.4),
          cyl(0.06, 0.07, 4.2, '#a8d860', 0, 2.1, 0.5),
          cyl(0.04, 0.04, 2.2, '#a8d860', 0, 0.9, -0.5, Math.PI / 2, 0, 0),
          box(0.05, 0.6, 0.4, '#3a6ad8', 0, -0.35, -2.4),
        ]),
        MAT.vc,
      ),
    );
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.1, 0, 0, 4.0, 0, 0, 0.1, -2.1, 0, 0.1, 0, 0, 0.1, -2.1, 0, 4.0, 0], 3));
    sg.computeVertexNormals();
    const s = new THREE.Mesh(clean(paint(sg, '#fff6e0', 0)), MAT.cloth);
    s.position.set(0, 0.95, 0.45);
    root.add(s);
    sail = s;
  } else {
    root.add(
      new THREE.Mesh(
        merge([
          hullGeo(5.6, 2.1, 0.75, '#ff5c6a', '#f0f0f4', '#ffffff'),
          box(1.6, 0.5, 1.2, '#f4f4f8', 0, 0.25, 0.6),
          box(1.5, 0.5, 0.05, '#9ae0ff', 0, 0.7, 1.15, -0.4, 0, 0),
          box(1.3, 0.06, 1.4, '#c8c8d0', 0, 0.02, -1.1),
          box(0.45, 0.7, 0.5, '#3a3a4a', 0, 0.25, -2.9),
          box(0.3, 0.3, 0.3, '#ffd34a', 0, 0.7, -2.9),
        ]),
        MAT.vc,
      ),
    );
    const p = new THREE.Group();
    p.add(new THREE.Mesh(merge([box(0.5, 0.08, 0.06, '#c8d0e0', 0, 0, 0), box(0.06, 0.5, 0.06, '#c8d0e0', 0, 0, 0)]), MAT.vc));
    p.position.set(0, -0.35, -3.2);
    root.add(p);
    prop = p;
  }
  return { root, sail, prop, paddle };
}

/* ------------------------------ donos das ilhas ------------------------------ */
export interface NpcModel {
  root: THREE.Group;
  body: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  legs: THREE.Object3D[];
  head: THREE.Object3D | null;
  mats: THREE.Material[];
}
const grp = (g: THREE.BufferGeometry, x = 0, y = 0, z = 0, mat: THREE.Material = MAT.vc) => {
  const o = new THREE.Group();
  o.add(new THREE.Mesh(g, mat));
  o.position.set(x, y, z);
  return o;
};
export function npcModel(f: Faction, chief: boolean): NpcModel {
  initMats();
  const root = new THREE.Group();
  const mats: THREE.Material[] = [];
  let body: THREE.Object3D;
  let armL: THREE.Object3D;
  let armR: THREE.Object3D;
  const legs: THREE.Object3D[] = [];
  let head: THREE.Object3D | null = null;
  const eyes = (x: number, y: number, z: number, s = 0.08) => [sph(s, '#ffffff', x, y, z), sph(s, '#ffffff', -x, y, z), sph(s * 0.5, '#1a1440', x, y, z + s * 0.6), sph(s * 0.5, '#1a1440', -x, y, z + s * 0.6)];
  switch (f) {
    case 'crab': {
      const c = chief ? '#ff4a3a' : '#ff6a3a';
      body = grp(merge([sph(0.42, c, 0, 0.42, 0, 1.25, 0.6, 1, 10), sph(0.3, '#ffb08a', 0, 0.33, 0.06, 1.1, 0.4, 0.9, 8), cyl(0.025, 0.025, 0.28, c, 0.12, 0.68, 0.22), cyl(0.025, 0.025, 0.28, c, -0.12, 0.68, 0.22), ...eyes(0.12, 0.84, 0.24, 0.07), sph(0.04, '#ff8ab8', 0.25, 0.48, 0.32), sph(0.04, '#ff8ab8', -0.25, 0.48, 0.32)]));
      if (chief) (body.children[0] as THREE.Mesh).geometry = merge([(body.children[0] as THREE.Mesh).geometry, cyl(0.2, 0.22, 0.16, '#ffd34a', 0, 0.84, -0.05, 0, 0, 0, 8), cone(0.05, 0.14, '#ffd34a', 0.15, 0.98, -0.05), cone(0.05, 0.14, '#ffd34a', -0.15, 0.98, -0.05), cone(0.05, 0.16, '#ffd34a', 0, 0.99, 0.12), sph(0.04, '#4fd8ff', 0, 0.86, 0.15)]);
      const claw = (s: number) => grp(merge([cyl(0.05, 0.06, 0.4, c, 0, 0, 0.18, Math.PI / 2, 0, 0), sph(0.17, c, 0, 0.02, 0.42, 1, 0.8, 1.2), cone(0.08, 0.22, c, s * 0.04, 0.1, 0.58, -Math.PI / 2.4, 0, 0, 5)]), s * 0.45, 0.42, 0.2);
      armL = claw(1);
      armR = claw(-1);
      for (let i = 0; i < 6; i++) {
        const s = i < 3 ? 1 : -1;
        const z = ((i % 3) - 1) * 0.2;
        const l = grp(box(0.38, 0.05, 0.05, c, s * 0.18, 0, 0, 0, 0, -s * 0.6), s * 0.38, 0.35, z);
        legs.push(l);
      }
      root.scale.setScalar(chief ? 1.5 : 1.05);
      break;
    }
    case 'monkey': {
      body = grp(merge([sph(0.36, '#8a5a32', 0, 0.75, 0, 1, 1.15, 0.9, 9), sph(0.24, '#e8c8a0', 0, 0.72, 0.18, 1, 1.1, 0.6, 8)]));
      head = grp(merge([sph(0.3, '#8a5a32', 0, 0, 0, 1, 0.95, 0.95, 9), sph(0.2, '#e8c8a0', 0, -0.05, 0.18, 1.2, 0.85, 0.7, 8), sph(0.11, '#e8c8a0', 0.3, 0.04, 0), sph(0.11, '#e8c8a0', -0.3, 0.04, 0), ...eyes(0.09, 0.07, 0.24, 0.06), box(0.16, 0.03, 0.03, '#3a2210', 0.09, 0.17, 0.26, 0, 0, -0.3), box(0.16, 0.03, 0.03, '#3a2210', -0.09, 0.17, 0.26, 0, 0, 0.3), box(0.12, 0.03, 0.03, '#5a2a1a', 0, -0.13, 0.32)]), 0, 1.25, 0);
      root.add(head);
      armL = grp(merge([cyl(0.07, 0.06, 0.55, '#8a5a32', 0, -0.26, 0), sph(0.08, '#e8c8a0', 0, -0.55, 0)]), 0.36, 0.95, 0);
      armR = grp(merge([cyl(0.07, 0.06, 0.55, '#8a5a32', 0, -0.26, 0), sph(0.08, '#e8c8a0', 0, -0.55, 0), cyl(0.05, 0.07, 0.8, '#a8703a', 0, -0.55, 0.3, Math.PI / 2.2, 0, 0)]), -0.36, 0.95, 0);
      for (const s of [1, -1]) legs.push(grp(merge([cyl(0.08, 0.07, 0.45, '#7a4a2a', 0, -0.2, 0), box(0.14, 0.06, 0.2, '#e8c8a0', 0, -0.43, 0.04)]), s * 0.16, 0.45, 0));
      // rabo
      const tail = new THREE.Mesh(clean(paint(new THREE.TorusGeometry(0.28, 0.04, 5, 10, Math.PI * 1.4), '#8a5a32', 0.1)).translate(0, 0.28, 0).rotateY(Math.PI / 2), MAT.vc);
      tail.position.set(0, 0.55, -0.32);
      root.add(tail);
      root.scale.setScalar(chief ? 1.3 : 1.05);
      break;
    }
    case 'penguin': {
      body = grp(merge([sph(0.4, '#1a2030', 0, 0.62, 0, 1, 1.45, 0.95, 10), sph(0.32, '#ffffff', 0, 0.58, 0.12, 0.95, 1.3, 0.8, 9), ...eyes(0.11, 1.05, 0.28, 0.065), cone(0.09, 0.22, '#ffa83a', 0, 0.94, 0.38, Math.PI / 2, 0, 0, 6), sph(0.05, '#ff8ab8', 0.2, 0.9, 0.3), sph(0.05, '#ff8ab8', -0.2, 0.9, 0.3), ...(chief ? [cyl(0.2, 0.26, 0.2, '#ff4a5a', 0, 1.25, 0, 0, 0, 0, 10), sph(0.08, '#ffffff', 0, 1.4, 0)] : [])]));
      armL = grp(box(0.06, 0.45, 0.2, '#1a2030', 0, -0.2, 0), 0.38, 0.8, 0);
      armR = grp(box(0.06, 0.45, 0.2, '#1a2030', 0, -0.2, 0), -0.38, 0.8, 0);
      for (const s of [1, -1]) legs.push(grp(box(0.16, 0.05, 0.24, '#ffa83a', 0, 0, 0.06), s * 0.15, 0.04, 0));
      root.scale.setScalar(chief ? 1.25 : 0.95);
      break;
    }
    case 'lizard': {
      body = grp(merge([sph(0.32, '#3aa84a', 0, 0.45, 0, 0.9, 0.7, 1.6, 9), sph(0.22, '#ffd04a', 0, 0.36, 0.05, 0.8, 0.5, 1.4, 8), ...[0, 1, 2, 3].map((i) => cone(0.08, 0.26, i % 2 ? '#ffaa2a' : '#ff5a2a', 0, 0.72 - i * 0.02, 0.3 - i * 0.22, -0.2, 0, 0, 5)), cyl(0.12, 0.03, 1.0, '#3aa84a', 0, 0.4, -0.85, -Math.PI / 2.2, 0, 0, 6), cone(0.08, 0.22, '#ff5a2a', 0, 0.52, -1.32, -Math.PI / 2.2, 0, 0, 5)]));
      head = grp(merge([sph(0.22, '#3aa84a', 0, 0, 0.12, 0.95, 0.75, 1.3, 9), ...eyes(0.11, 0.1, 0.22, 0.065), box(0.2, 0.025, 0.025, '#1a3a1a', 0, -0.06, 0.38)]), 0, 0.55, 0.45);
      root.add(head);
      armL = grp(cyl(0.05, 0.05, 0.32, '#2a9a3a', 0, -0.14, 0), 0.27, 0.42, 0.28);
      armR = grp(cyl(0.05, 0.05, 0.32, '#2a9a3a', 0, -0.14, 0), -0.27, 0.42, 0.28);
      for (const s of [1, -1]) legs.push(grp(cyl(0.06, 0.05, 0.34, '#2a9a3a', 0, -0.15, 0), s * 0.28, 0.36, -0.3));
      root.scale.setScalar(chief ? 1.4 : 1.15);
      break;
    }
    default: {
      // pirata fantasma (luzinha verde, chapéu e lenço)
      const m = (MAT.ghost as THREE.MeshLambertMaterial).clone();
      m.emissive = new THREE.Color('#3a9a7a');
      mats.push(m);
      const g = new THREE.LatheGeometry(
        Array.from({ length: 10 }, (_, i) => {
          const t = i / 9;
          const r = t < 0.85 ? Math.sin(Math.min(1, t / 0.6) * Math.PI * 0.5) * 0.42 : 0.42 - (t - 0.85) * 0.4;
          return new THREE.Vector2(Math.max(0.001, r), 1.0 - t * 1.0);
        }).reverse(),
        12,
      );
      body = grp(clean(paint(g, '#d8fff0', 0)), 0, 0.25, 0, m);
      head = grp(merge([sph(0.08, '#1a2a3a', 0.13, 0.66, 0.34, 1, 1.3, 0.5), sph(0.08, '#1a2a3a', -0.13, 0.66, 0.34, 1, 1.3, 0.5), cyl(0.44, 0.44, 0.07, '#2a2a4a', 0, 0.96, 0, 0, 0, 0, 3), cyl(0.26, 0.32, 0.24, '#2a2a4a', 0, 1.08, 0, 0, 0, 0, 10), box(0.5, 0.08, 0.08, '#ff4a5a', 0, 0.82, 0.3), box(0.06, 0.06, 0.06, '#ffd34a', 0.3, 0.7, 0.28)]), 0, 0.25, 0);
      root.add(head);
      armL = grp(sph(0.1, '#d8fff0', 0, 0, 0), 0.42, 0.75, 0.05, m);
      armR = grp(merge([cyl(0.025, 0.025, 0.9, '#c8d0e0', 0, 0, 0.3, Math.PI / 2.4, 0, 0), box(0.12, 0.04, 0.12, '#ffd34a', 0, -0.1, -0.05)]), -0.42, 0.75, 0.05);
      root.scale.setScalar(chief ? 1.35 : 1.1);
    }
  }
  root.add(body, armL, armR, ...legs);
  return { root, body, armL, armR, legs, head, mats };
}
/** estrelinhas girando (tonto/derrotado) */
export function dizzyStars(): THREE.Group {
  const g = new THREE.Group();
  const geo = merge([cone(0.09, 0.05, '#ffd34a', 0, 0, 0, Math.PI / 2, 0, 0, 5), cone(0.09, 0.05, '#ffd34a', 0, 0, 0, -Math.PI / 2, 0, 0, 5)]);
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(geo, MAT.glow);
    const a = (i / 4) * Math.PI * 2;
    m.position.set(Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4);
    g.add(m);
  }
  return g;
}
/** placa "!" (alerta) ou "?" sobre a cabeça */
export function alertMark(): THREE.Mesh {
  return new THREE.Mesh(merge([box(0.1, 0.34, 0.1, '#ff3a3a', 0, 0.25, 0), box(0.1, 0.1, 0.1, '#ff3a3a', 0, 0, 0)]), MAT.glow);
}

/* ------------------------------ baú da morte (boiando) ------------------------------ */
let beamTex: THREE.CanvasTexture | null = null;
function beamTexture(): THREE.CanvasTexture {
  if (beamTex) return beamTex;
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 128;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 128, 0, 0);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 16, 128);
  beamTex = new THREE.CanvasTexture(c);
  return beamTex;
}
export function deathChestModel(): { root: THREE.Group; beam: THREE.Mesh } {
  initMats();
  const root = new THREE.Group();
  const c = chestModel(0);
  c.root.scale.setScalar(0.75);
  c.root.position.y = 0.22;
  root.add(c.root);
  // boia (salva-vidas) em volta
  const ring = new THREE.Mesh(merge([clean(paint(new THREE.TorusGeometry(0.58, 0.11, 6, 18), '#ff7a4a', 0.05)).rotateX(Math.PI / 2).translate(0, 0.12, 0), ...[0, 1, 2, 3].map((i) => box(0.1, 0.24, 0.26, '#ffffff', Math.cos(i * 1.57 + 0.78) * 0.58, 0.12, Math.sin(i * 1.57 + 0.78) * 0.58, 0, -i * 1.57 - 0.78, 0))]), MAT.vc);
  root.add(ring);
  // bandeirinha
  root.add(new THREE.Mesh(merge([cyl(0.02, 0.02, 1.1, '#ffffff', 0.3, 0.9, 0), box(0.04, 0.26, 0.4, '#ffd34a', 0.3, 1.3, 0.2)]), MAT.vc));
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 40, 8, 1, true).translate(0, 20, 0), new THREE.MeshBasicMaterial({ map: beamTexture(), color: '#ffc83a', transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  beam.renderOrder = 7;
  root.add(beam);
  return { root, beam };
}

/* ------------------------------ arpão ------------------------------ */
export function harpoonGeo(gold: boolean): THREE.BufferGeometry {
  return merge([cyl(0.025, 0.03, 1.3, gold ? '#c8902a' : '#a8d860', 0, 0, 0), cone(0.07, 0.26, gold ? '#fffbe8' : '#c8d0e0', 0, 0.76, 0, 0, 0, 0, 4), cone(0.05, 0.14, gold ? '#ffcf2e' : '#9aa8c8', 0.06, 0.6, 0, 0, 0, -2.6, 3), cone(0.05, 0.14, gold ? '#ffcf2e' : '#9aa8c8', -0.06, 0.6, 0, 0, 0, 2.6, 3), box(0.08, 0.08, 0.08, '#e8c27a', 0, -0.55, 0)]);
}
export function spear3Geo(): THREE.BufferGeometry {
  return merge([cyl(0.022, 0.027, 1.2, '#8a4a2a', 0, 0.2, 0), cone(0.07, 0.3, '#5a3a8a', 0, 0.95, 0, 0, 0, 0, 4), box(0.07, 0.07, 0.07, '#ff8ad8', 0, 0.76, 0, 0, 0.7, 0)]);
}

/* ------------------------------ esqueleto (SkinnedMesh) ------------------------------ */
interface TubeOpts {
  len: number;
  bones: number;
  rings: number;
  radial: number;
  /** raio em t (0 raiz → 1 ponta) */
  r: (t: number) => number;
  /** achatamento (x, y) da seção */
  sx?: number;
  sy?: number;
  /** cor por (t, ângulo) */
  col: (t: number, a: number) => string;
  /** eixo do tubo: 'z-' (cabeça→cauda) ou 'y' (para cima) */
  axis: 'z-' | 'y';
}
export function skinnedTube(o: TubeOpts, mat: THREE.Material): { mesh: THREE.SkinnedMesh; bones: THREE.Bone[] } {
  const pos: number[] = [];
  const col: number[] = [];
  const si: number[] = [];
  const sw: number[] = [];
  const idx: number[] = [];
  const B = o.bones;
  const seg = o.len / (B - 1);
  const at = (along: number, x: number, y: number) => (o.axis === 'y' ? [x, along, y] : [x, y, -along]);
  const skin = (along: number) => {
    const f = Math.min(B - 1.0001, Math.max(0, along / seg));
    const i0 = Math.floor(f);
    const w = f - i0;
    si.push(i0, i0 + 1, 0, 0);
    sw.push(1 - w, w, 0, 0);
  };
  for (let i = 0; i <= o.rings; i++) {
    const t = i / o.rings;
    const along = t * o.len;
    const r = Math.max(0.01, o.r(t));
    for (let s = 0; s <= o.radial; s++) {
      const a = (s / o.radial) * Math.PI * 2;
      pos.push(...at(along, Math.cos(a) * r * (o.sx ?? 1), Math.sin(a) * r * (o.sy ?? 1)));
      col.push(...jitCol(o.col(t, a), 0.05));
      skin(along);
    }
  }
  for (let i = 0; i < o.rings; i++)
    for (let s = 0; s < o.radial; s++) {
      const a = i * (o.radial + 1) + s;
      const b = a + o.radial + 1;
      if (o.axis === 'y') idx.push(a, a + 1, b, a + 1, b + 1, b);
      else idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  // tampas
  for (const end of [0, 1]) {
    const c = pos.length / 3;
    const along = end * o.len;
    pos.push(...at(along, 0, 0));
    col.push(...jitCol(o.col(end, 0), 0));
    skin(along);
    const ring = end * o.rings * (o.radial + 1);
    for (let s = 0; s < o.radial; s++) {
      if ((end === 0) === (o.axis === 'y')) idx.push(c, ring + s + 1, ring + s);
      else idx.push(c, ring + s, ring + s + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  const bones: THREE.Bone[] = [];
  for (let i = 0; i < B; i++) {
    const b = new THREE.Bone();
    if (i > 0) {
      const p = at(seg, 0, 0);
      b.position.set(p[0], p[1], p[2]);
      bones[i - 1].add(b);
    }
    bones.push(b);
  }
  const mesh = new THREE.SkinnedMesh(g, mat);
  mesh.add(bones[0]);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.frustumCulled = false;
  return { mesh, bones };
}

/* ------------------------------ Megalodonte ------------------------------ */
export interface MegaModel {
  root: THREE.Group;
  bones: THREE.Bone[];
  jaw: THREE.Object3D;
  gills: THREE.Mesh[];
  eye: THREE.Mesh;
  mat: THREE.MeshLambertMaterial;
}
export function megaModel(): MegaModel {
  initMats();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const L = 11;
  const prof = (t: number) => {
    // t: 0 focinho → 1 cauda
    if (t < 0.12) return 0.3 + Math.sin((t / 0.12) * Math.PI * 0.5) * 1.05;
    if (t < 0.45) return 1.35 + Math.sin(((t - 0.12) / 0.33) * Math.PI * 0.5) * 0.25;
    return 1.6 * Math.pow(1 - (t - 0.45) / 0.55, 1.25) + 0.12;
  };
  const { mesh, bones } = skinnedTube(
    {
      len: L,
      bones: 9,
      rings: 30,
      radial: 14,
      r: prof,
      sx: 0.82,
      sy: 0.95,
      axis: 'z-',
      col: (t, a) => {
        const s = Math.sin(a);
        if (s < -0.25) return '#eef0f4';
        if (s < 0.05) return t > 0.1 && t < 0.3 && Math.cos(a * 7) > 0.5 ? '#5a6878' : '#7a8898';
        return t < 0.08 ? '#5a6878' : '#4a5a6c';
      },
    },
    mat,
  );
  const root = new THREE.Group();
  root.add(mesh);
  // cabeça: mandíbula (osso 1), dentes de cima, olhos
  const head = new THREE.Group();
  head.position.set(0, 0, -1.6);
  bones[0].add(head);
  const jaw = new THREE.Group();
  const jg: THREE.BufferGeometry[] = [sph(1.0, '#e8ecf2', 0, 0, 0.55, 0.95, 0.32, 1.1, 10)];
  for (let i = 0; i < 9; i++) {
    const a = (i / 8 - 0.5) * 2.2;
    jg.push(cone(0.09, 0.32, '#ffffff', Math.sin(a) * 0.82, 0.22, 0.55 + Math.cos(a) * 0.95, 0, 0, 0, 4));
  }
  jaw.add(new THREE.Mesh(merge(jg), mat));
  jaw.position.set(0, -0.5, 0);
  head.add(jaw);
  const tg: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 8 - 0.5) * 2.2;
    tg.push(cone(0.09, 0.34, '#ffffff', Math.sin(a) * 0.9, -0.62, 0.5 + Math.cos(a) * 1.0, Math.PI, 0, 0, 4));
  }
  head.add(new THREE.Mesh(merge(tg), mat));
  const eyeG = merge([sph(0.2, '#ffffff', 0.92, 0.3, 0.55, 0.6, 1, 1), sph(0.2, '#ffffff', -0.92, 0.3, 0.55, 0.6, 1, 1), sph(0.12, '#141820', 1.02, 0.3, 0.6, 0.6, 1, 1), sph(0.12, '#141820', -1.02, 0.3, 0.6, 0.6, 1, 1), box(0.5, 0.08, 0.1, '#2a3440', 0.85, 0.58, 0.55, 0, 0.2, -0.3), box(0.5, 0.08, 0.1, '#2a3440', -0.85, 0.58, 0.55, 0, -0.2, 0.3)]);
  const eye = new THREE.Mesh(eyeG, mat);
  head.add(eye);
  // guelras (ponto fraco: brilham quando expostas)
  const gills: THREE.Mesh[] = [];
  const gm = new THREE.MeshBasicMaterial({ color: '#ff5a8a', transparent: true, opacity: 0.0, depthWrite: false });
  for (const s of [1, -1]) {
    const g = new THREE.Mesh(merge([0, 1, 2].map((i) => box(0.06, 0.8, 0.12, '#ffffff', s * 1.24, 0, -0.2 - i * 0.28, 0, 0, s * 0.1))), gm);
    bones[2].add(g);
    gills.push(g);
  }
  // nadadeiras
  const dorsal = new THREE.Mesh(merge([clean(paint(new THREE.ConeGeometry(0.75, 2.4, 4), '#4a5a6c', 0.05)).scale(0.25, 1, 1).rotateX(-0.45).translate(0, 2.2, 0)]), mat);
  bones[3].add(dorsal);
  for (const s of [1, -1]) {
    const pec = new THREE.Mesh(merge([box(2.2, 0.1, 0.9, '#4a5a6c', s * 1.6, -0.6, 0.1, 0, s * 0.35, -s * 0.45)]), mat);
    bones[2].add(pec);
  }
  const tail = new THREE.Mesh(merge([box(0.16, 3.4, 1.1, '#4a5a6c', 0, 0.9, -0.35, 0.55, 0, 0), box(0.16, 2.0, 0.9, '#4a5a6c', 0, -0.7, -0.3, -0.7, 0, 0)]), mat);
  bones[8].add(tail);
  return { root, bones, jaw, gills, eye, mat };
}

/* ------------------------------ Polvo Gigante ------------------------------ */
export interface KrakenModel {
  root: THREE.Group;
  head: THREE.Group;
  eyes: THREE.Mesh;
  tentacles: { mesh: THREE.SkinnedMesh; bones: THREE.Bone[]; base: THREE.Group; glow: THREE.Mesh }[];
  mat: THREE.MeshLambertMaterial;
}
export function krakenModel(): KrakenModel {
  initMats();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const root = new THREE.Group();
  const head = new THREE.Group();
  const hg: THREE.BufferGeometry[] = [sph(2.4, '#8a4ad8', 0, 2.6, -0.4, 1, 1.25, 1.05, 16), sph(2.0, '#a86ae8', 0, 1.0, 0.2, 1.15, 0.7, 1.05, 14)];
  for (let i = 0; i < 9; i++) {
    const a = i * 0.9;
    hg.push(sph(0.28 + (i % 3) * 0.08, '#c89aff', Math.cos(a) * 1.9, 3.0 + Math.sin(i * 1.7) * 1.0, Math.sin(a) * 1.4 - 0.6, 1, 1, 0.4, 7));
  }
  head.add(new THREE.Mesh(merge(hg), mat));
  const eyes = new THREE.Mesh(merge([sph(0.62, '#fffbe0', 0.95, 1.6, 1.55, 1, 1.1, 0.6, 12), sph(0.62, '#fffbe0', -0.95, 1.6, 1.55, 1, 1.1, 0.6, 12), sph(0.32, '#1a1030', 1.0, 1.55, 1.85, 1, 1.4, 0.5, 10), sph(0.32, '#1a1030', -1.0, 1.55, 1.85, 1, 1.4, 0.5, 10), sph(0.09, '#ffffff', 1.1, 1.75, 2.0), sph(0.09, '#ffffff', -0.9, 1.75, 2.0), box(1.0, 0.16, 0.2, '#4a1a8a', 0.95, 2.35, 1.6, 0, 0, -0.3), box(1.0, 0.16, 0.2, '#4a1a8a', -0.95, 2.35, 1.6, 0, 0, 0.3)]), mat);
  head.add(eyes);
  root.add(head);
  const tentacles: KrakenModel['tentacles'] = [];
  const gm = new THREE.MeshBasicMaterial({ color: '#ffe85a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  for (let i = 0; i < 8; i++) {
    const { mesh, bones } = skinnedTube(
      {
        len: 10,
        bones: 10,
        rings: 34,
        radial: 9,
        r: (t) => 0.62 * Math.pow(1 - t, 0.9) + 0.06,
        axis: 'y',
        col: (t, a) => (Math.cos(a) > 0.55 ? (Math.sin(t * 60) > 0.2 ? '#ffd8f0' : '#f0b0e0') : t > 0.85 ? '#b07ae8' : '#9a5ae0'),
      },
      mat,
    );
    const base = new THREE.Group();
    const a = (i / 8) * Math.PI * 2;
    base.position.set(Math.cos(a) * 3.4, -0.6, Math.sin(a) * 3.4);
    base.rotation.y = -a + Math.PI / 2;
    base.add(mesh);
    // ventosas brilhantes (ponto fraco depois do tapa)
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), gm.clone());
    bones[5].add(glow);
    root.add(base);
    tentacles.push({ mesh, bones, base, glow });
  }
  return { root, head, eyes, tentacles, mat };
}
