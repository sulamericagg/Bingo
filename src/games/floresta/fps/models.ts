/* ============================================================
 *  LENHADORES 3D — modelos low-poly com cores por vértice (uma malha
 *  por espécie → InstancedMesh), impostores 2D das árvores distantes,
 *  ferramentas em primeira pessoa, veículos e a mão 2D do Bloop.
 * ============================================================ */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { save as globalSave } from '../../../core/storage';
import { skinById } from '../../../game/skins';
import { SPECIES, type Species } from '../data';
import { drawTree } from '../draw2d';
import { natureBush, natureTree, natureWind, windTime, type TreeKind } from '../../../3d/nature';

export { windTime };

const TAU = Math.PI * 2;
export const INK = '#2a0b5c';

/* ------------------------------ fusão de peças ------------------------------ */

interface Part {
  g: THREE.BufferGeometry;
  c: string;
  m: THREE.Matrix4;
  /** luz "assada": escurece a parte de baixo (y local -1..1) — copas com volume */
  ao?: number;
  /** escurece os sulcos (atributo 'groove' 0..1 da geometria) — casca */
  groove?: number;
  /** variação de brilho por vértice (0..1), estável pela posição — folhagem/casca menos "chapada" */
  jit?: number;
}
const Q = new THREE.Quaternion();
const E = new THREE.Euler();
const P = new THREE.Vector3();
const S = new THREE.Vector3();
export function mat4(x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0): THREE.Matrix4 {
  return new THREE.Matrix4().compose(P.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), S.set(sx, sy, sz));
}

export function mergeParts(parts: Part[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  const nm = new THREE.Matrix3();
  const v = new THREE.Vector3();
  for (const p of parts) {
    const g = p.g.index ? p.g.toNonIndexed() : p.g;
    const pa = g.getAttribute('position');
    const na = g.getAttribute('normal');
    nm.getNormalMatrix(p.m);
    c.set(p.c);
    const ga = p.groove ? g.getAttribute('groove') : null;
    for (let i = 0; i < pa.count; i++) {
      let k = 1;
      if (p.ao) k *= 1 - p.ao + p.ao * Math.min(1, Math.max(0, (pa.getY(i) + 1) / 2));
      if (ga) k *= 1 - (p.groove ?? 0) * ga.getX(i);
      v.fromBufferAttribute(pa, i).applyMatrix4(p.m);
      if (p.jit) k *= 1 + (fract(Math.sin(v.x * 12.9898 + v.y * 78.233 + v.z * 37.719) * 43758.5453) - 0.5) * p.jit;
      pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(na, i).applyMatrix3(nm).normalize();
      nor.push(v.x, v.y, v.z);
      col.push(c.r * k, c.g * k, c.b * k);
    }
    if (g !== p.g) g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

const fract = (x: number): number => x - Math.floor(x);

/** pseudo-ruído 3D suave e determinístico (sem tabela) */
function n3(x: number, y: number, z: number): number {
  return (Math.sin(x * 1.7 + y * 3.1) * Math.sin(y * 2.3 + z * 1.3) * Math.sin(z * 2.9 + x * 0.7) + Math.sin(x * 4.1 - z * 3.3 + y) * 0.35) * 0.5 + 0.5;
}
/** tufo de folhagem: esfera deformada por ruído, normais suaves, base em -1..1 */
function clump(ws: number, hs: number, seed: number, amp = 0.18): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, ws, hs);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + (n3(x * 2.2 + seed, y * 2.2, z * 2.2 - seed) - 0.5) * 2 * amp - (y < -0.5 ? (-0.5 - y) * 0.35 : 0);
    p.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  return g;
}
/** tronco com raízes (base alargada), sulcos de casca e leve curva; altura 1 */
function trunkGeo(rs: number, hs: number, r0 = 0.2, r1 = 0.34, bend = 0.06): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r0, r1, 1, rs, hs, false);
  g.translate(0, 0.5, 0);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const gr = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const a = Math.atan2(z, x);
    const ridge = Math.pow(Math.abs(Math.sin(a * 3.5 + y * 2)), 0.7);
    const flare = 1 + Math.pow(Math.max(0, 0.18 - y) / 0.18, 2) * (0.45 + 0.25 * Math.max(0, Math.cos(a * 4)));
    const k = (0.9 + ridge * 0.12) * flare;
    gr[i] = 1 - ridge;
    p.setXYZ(i, x * k + Math.sin(y * 3) * bend, y, z * k);
  }
  g.setAttribute('groove', new THREE.BufferAttribute(gr, 1));
  g.computeVertexNormals();
  return g;
}
/** galho: cone fino curvado (base na origem, ao longo de +Y) */
function branchGeo(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.35, 1, 1, 5, 3, true);
  g.translate(0, 0.5, 0);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + p.getY(i) * p.getY(i) * 0.6);
  g.computeVertexNormals();
  return g;
}
/** camada de pinheiro: cone com saia recortada (pontas) e caimento */
function pineTier(rs: number): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(1, 1, rs, 2, false);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const a = Math.atan2(z, x);
    const rim = y < -0.45 ? 1 : 0;
    const k = 1 + rim * (Math.abs(Math.sin(a * rs * 0.5)) * 0.18 - 0.05);
    p.setXYZ(i, x * k, y - rim * Math.abs(Math.sin(a * rs * 0.5)) * 0.12, z * k);
  }
  g.computeVertexNormals();
  return g;
}

const base = {
  trunk: (() => {
    const g = new THREE.CylinderGeometry(0.2, 0.34, 1, 7);
    g.translate(0, 0.5, 0);
    return g;
  })(),
  ico: new THREE.IcosahedronGeometry(1, 0),
  ico1: new THREE.IcosahedronGeometry(1, 1),
  cone: new THREE.ConeGeometry(1, 1, 7),
  cap: new THREE.SphereGeometry(1, 10, 5, 0, TAU, 0, Math.PI / 2),
  oct: new THREE.OctahedronGeometry(1, 0),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 8),
  bark: trunkGeo(9, 5),
  barkLo: trunkGeo(6, 2),
  branch: branchGeo(),
  clumps: [clump(8, 6, 0.3), clump(8, 6, 2.1), clump(8, 6, 4.7)],
  clumpLo: clump(6, 4, 1.3, 0.12),
  pine: pineTier(12),
  pineLo: pineTier(7),
  frond: (() => {
    // folha de palmeira: lâmina arqueada com folíolos (zigue-zague)
    const g = new THREE.PlaneGeometry(1, 1, 1, 6);
    g.rotateX(-Math.PI / 2);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i) + 0.5;
      const w = Math.sin(z * Math.PI) * (0.6 + (Math.round(z * 6) % 2) * 0.4);
      p.setXYZ(i, p.getX(i) * w, -z * z * 0.8 + Math.abs(p.getX(i)) * 0.15, z);
    }
    g.computeVertexNormals();
    return g;
  })(),
};


/* ------------------------------ árvores (módulo de natureza + especiais) ------------------------------ */

const strSeed = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h;
};

export function crownColor(sp: Species, rare: number, two = false): string {
  if (rare === 1) return two ? '#e9a400' : '#ffd34a';
  if (rare === 2) return two ? '#4ab8f0' : '#9ff6ff';
  if (rare === 3) return two ? '#20c890' : '#7affc4';
  return two ? sp.leaf2 : sp.leaf;
}

/** árvore inteira numa geometria (origem na base do tronco) */
export function treeGeometry(sp: Species, rare: number, lod = 0, lite = false): THREE.BufferGeometry {
  const h = sp.h;
  const L1 = crownColor(sp, rare);
  const L2 = crownColor(sp, rare, true);
  const T = rare === 1 ? '#d8a040' : sp.trunk;
  const TD = shade(T, -0.25);
  const parts: Part[] = [];
  const add = (g: THREE.BufferGeometry, c: string, m: THREE.Matrix4, ao = 0, groove = 0) => parts.push({ g, c, m, ao, groove });
  const bark = lod || lite ? base.barkLo : base.bark;
  const cl = (i: number) => (lod || lite ? base.clumpLo : base.clumps[i % 3]);
  /** galho do tronco até a copa */
  const branch = (y: number, a: number, len: number, r: number, tilt = 0.9) =>
    add(base.branch, TD, new THREE.Matrix4().compose(P.set(0, y, 0), Q.setFromEuler(E.set(0, a, -tilt, 'YXZ')), S.set(r, len, r)));
  if (sp.shape === 'pine' || sp.shape === 'round' || sp.shape === 'blossom' || sp.shape === 'cloud' || sp.shape === 'palm') {
    // árvores estilizadas do módulo de natureza: copas de bolhas suaves (~300 tri)
    const kind: TreeKind = sp.shape === 'round' ? 'oak' : sp.shape === 'blossom' ? 'blossom' : sp.shape === 'cloud' ? 'cloud' : sp.shape === 'pine' ? 'pine' : 'palm';
    const lc = new THREE.Color(L1);
    return natureTree({
      kind,
      h,
      trunk: T,
      trunkDark: rare === 1 ? shade(T, -0.3) : sp.trunkDark,
      leaf: L1,
      leaf2: L2,
      seed: strSeed(sp.leaf + sp.h) + rare * 7,
      lod: lod ? 1 : 0,
      fruit: kind === 'oak' && !rare && lc.g > lc.r * 1.3 ? '#ff4a5a' : undefined,
      speck: kind === 'blossom' ? '#fff4fa' : kind === 'cloud' ? '#ffffff' : undefined,
    });
  }
  switch (sp.shape) {
    case 'mushroom':
      add(bark, '#fff4e6', mat4(0, 0, 0, 2.2, h * 0.65, 2.2), 0, 0.08);
      // saia (anel) no talo
      add(base.cyl, '#fff8ee', mat4(0, h * 0.42, 0, h * 0.12, 0.05, h * 0.12));
      add(base.cap, L1, mat4(0, h * 0.58, 0, h * 0.44, h * 0.34, h * 0.44), 0.35);
      // lamelas sob o chapéu
      add(base.cyl, shade(L2, 0.3), mat4(0, h * 0.58, 0, h * 0.42, 0.06, h * 0.42));
      for (let i = 0; i < (lod ? 3 : 7); i++) {
        const a = (i / 7) * TAU + 0.3;
        const r = h * (i % 2 ? 0.28 : 0.2);
        add(base.clumpLo, '#fff6f0', mat4(Math.cos(a) * r, h * (0.58 + 0.34 * Math.sqrt(1 - Math.pow(r / (h * 0.44), 2))) - 0.02, Math.sin(a) * r, h * 0.055, h * 0.022, h * 0.055));
      }
      add(base.clumpLo, '#fff6f0', mat4(0, h * 0.92, 0, h * 0.07, h * 0.025, h * 0.07));
      break;
    case 'crystal':
      add(bark, T, mat4(0, 0, 0, 1, h * 0.5, 1), 0, 0.3);
      for (let i = 0; i < (lod ? 3 : 7); i++) {
        const a = (i / 6) * TAU;
        const r = i === 0 ? 0 : h * 0.17;
        add(base.oct, i % 2 ? L2 : L1, mat4(Math.cos(a) * r, h * (i === 0 ? 0.78 : 0.6), Math.sin(a) * r, h * 0.1, h * (i === 0 ? 0.3 : 0.2), h * 0.1, Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3));
      }
      break;
    default: {
      add(bark, T, mat4(0, 0, 0, 1.1, h * 0.62, 1.1), 0, 0.35);
      // galhos de verdade saindo do tronco para dentro da copa
      const nb = lod ? 2 : 4;
      for (let i = 0; i < nb; i++) branch(h * (0.4 + (i % 2) * 0.1), (i / nb) * TAU + 0.5, h * 0.32, 0.09 + (i % 2) * 0.02, 0.8 + (i % 2) * 0.25);
      const cloud = sp.shape === 'cloud';
      const blobs = cloud ? 7 : lod ? 4 : lite ? 5 : 7;
      // miolo grande + tufos em volta (dois anéis), base escura e topo iluminado
      add(cl(0), L2, mat4(0, h * 0.72, 0, h * 0.26, h * 0.24, h * 0.26), 0.55);
      for (let i = 0; i < blobs; i++) {
        const a = (i / blobs) * TAU + (i % 2) * 0.3;
        const up = i % 2;
        const r = h * (up ? 0.14 : 0.21);
        const sz = h * (up ? 0.16 : 0.15) * (cloud ? 1.1 : 1);
        add(cl(i + 1), up ? L1 : i % 3 ? L1 : L2, mat4(Math.cos(a) * r, h * (up ? 0.86 : 0.66), Math.sin(a) * r, sz, sz * (cloud ? 0.7 : 0.85), sz, 0, a, 0), 0.5);
      }
      if (!lod) add(cl(2), L1, mat4(0, h * 0.95, 0, h * 0.13, h * 0.11, h * 0.13), 0.4);
      if (sp.shape === 'blossom' && !lod)
        for (let i = 0; i < 12; i++) {
          const a = i * 2.4;
          const yy = 0.62 + (i % 4) * 0.08;
          add(base.ico, i % 2 ? '#ffffff' : '#ffd0e6', mat4(Math.cos(a) * h * 0.3, h * yy, Math.sin(a) * h * 0.3, h * 0.035, h * 0.03, h * 0.035));
        }
      if (sp.shape === 'round' && !lod)
        for (let i = 0; i < 6; i++) {
          const a = i * 1.9 + 0.5;
          // maçãs com cabinho
          add(base.clumpLo, '#ff4a5a', mat4(Math.cos(a) * h * 0.31, h * (0.6 + (i % 2) * 0.1), Math.sin(a) * h * 0.31, 0.15, 0.14, 0.15), 0.35);
          add(base.cyl, '#5a3a1a', mat4(Math.cos(a) * h * 0.31, h * (0.6 + (i % 2) * 0.1) + 0.15, Math.sin(a) * h * 0.31, 0.015, 0.08, 0.015));
        }
    }
  }
  return mergeParts(parts);
}

export function stumpGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [];
  parts.push({ g: base.bark, c: '#ffffff', m: mat4(0, 0, 0, 1.2, 0.5, 1.2), groove: 0.35 });
  // topo: anéis de crescimento
  const rings = ['#ffe2b0', '#e8c28a', '#ffe2b0', '#e0b678', '#f5d6a0'];
  rings.forEach((c, i) => parts.push({ g: base.cyl, c, m: mat4(0, 0.5 + i * 0.002, 0, 0.3 - i * 0.055, 0.02, 0.3 - i * 0.055) }));
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7;
    parts.push({ g: base.branch, c: '#dddddd', m: new THREE.Matrix4().compose(P.set(Math.cos(a) * 0.25, 0.08, Math.sin(a) * 0.25), Q.setFromEuler(E.set(0, -a, -1.35, 'YXZ')), S.set(0.1, 0.35, 0.1)) });
  }
  return mergeParts(parts);
}

/** arbusto de bolhas suaves (cinza: a cor vem da instância) */
export function bushGeometry(): THREE.BufferGeometry {
  return natureBush(1);
}

/** tora: lateral com sulcos de casca (cor da casca via instanceColor) */
export function logSideGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.3, 0.3, 1.3, 14, 3, true);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const a = Math.atan2(z, x);
    const k = 0.93 + Math.pow(Math.abs(Math.sin(a * 4.5 + y * 1.5)), 0.6) * 0.09;
    p.setXYZ(i, x * k, y, z * k);
  }
  g.computeVertexNormals();
  // cor: sulcos mais escuros (multiplica a cor da instância)
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i), p.getZ(i)) / 0.3;
    const k = 0.62 + (r - 0.93) * 4.2;
    c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = Math.max(0.55, Math.min(1, k));
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.rotateZ(Math.PI / 2); // eixo ao longo de X
  return g;
}
/** pontas da tora: anéis de crescimento, cerne mais escuro, casca na borda */
export function logCapGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [];
  const rings: [number, number, string][] = [
    [0.3, 0.33, '#7a4a24'],
    [0.255, 0.3, '#f2d29a'],
    [0.235, 0.255, '#d9a868'],
    [0.18, 0.235, '#f5d8a4'],
    [0.165, 0.18, '#d9a868'],
    [0.1, 0.165, '#e8be82'],
    [0.088, 0.1, '#c8945a'],
  ];
  for (const s of [-1, 1]) {
    for (const [r0, r1, c] of rings) parts.push({ g: new THREE.RingGeometry(r0 * 0.94, r1 * 0.94, 14), c, m: mat4(s * 0.651, 0, 0, 1, 1, 1, 0, (s * Math.PI) / 2, 0) });
    parts.push({ g: new THREE.CircleGeometry(0.088 * 0.94, 10), c: '#b8804a', m: mat4(s * 0.651, 0, 0, 1, 1, 1, 0, (s * Math.PI) / 2, 0) });
  }
  return mergeParts(parts);
}

/* ------------------------------ impostores ------------------------------ */

/** textura com as árvores 2D (uma coluna por espécie) */
export function impostorAtlas(): THREE.CanvasTexture {
  const W = 128;
  const H = 192;
  const c = document.createElement('canvas');
  c.width = W * SPECIES.length;
  c.height = H;
  const x = c.getContext('2d')!;
  for (let i = 0; i < SPECIES.length; i++) {
    x.save();
    x.translate(W * i + W / 2, H - 4);
    const sp = SPECIES[i];
    drawTree(x, sp, 0, (H - 12) / (sp.h * 1.05));
    x.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** duas placas cruzadas com UV da coluna da espécie */
export function impostorGeometry(sp: number, h: number): THREE.BufferGeometry {
  const w = h * (128 / 192);
  const u0 = sp / SPECIES.length;
  const u1 = (sp + 1) / SPECIES.length;
  const pos: number[] = [];
  const uv: number[] = [];
  for (const a of [0, Math.PI / 2]) {
    const cx = Math.cos(a) * w * 0.5;
    const cz = Math.sin(a) * w * 0.5;
    pos.push(-cx, 0, -cz, cx, 0, cz, cx, h, cz, -cx, 0, -cz, cx, h, cz, -cx, h, -cz);
    uv.push(u0, 0, u1, 0, u1, 1, u0, 0, u1, 1, u0, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0); // luz por cima, sem lado escuro
  return g;
}

/* ------------------------------ ferramentas (primeira pessoa) ------------------------------ */

export function lambert(color: string, emissive = 0): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, emissive: emissive ? new THREE.Color(color).multiplyScalar(emissive) : 0x000000 });
}

/** material liso (sem facetas) para peças arredondadas das ferramentas */
function smooth(color: string, emissive = 0): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, emissive: emissive ? new THREE.Color(color).multiplyScalar(emissive) : 0x000000 });
}
const RBOX = new Map<string, THREE.BufferGeometry>();
function rbox(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
  const k = [w, h, d, r].join(',');
  let g = RBOX.get(k);
  if (!g) RBOX.set(k, (g = new RoundedBoxGeometry(w, h, d, 3, r)));
  return g;
}
/** cabo levemente curvo (S suave), mais grosso perto da cabeça */
function handleGeo(len: number, r: number): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push(new THREE.Vector3(Math.sin(t * Math.PI) * 0.018 - t * 0.01, -0.12 + t * len, 0));
  }
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, r, 8, false);
  return g;
}

/** cabo ao longo de +Y a partir da mão (origem na empunhadura) */
export function toolModel(kind: 'axe' | 'saw' | 'laser', level: number, color: string): { g: THREE.Group; tip: THREE.Object3D; spin: THREE.Object3D | null } {
  const g = new THREE.Group();
  const tip = new THREE.Object3D();
  let spin: THREE.Object3D | null = null;
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = g) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const ink = smooth(INK);
  if (kind === 'axe') {
    const wood = smooth(level >= 2 ? '#7a4e2c' : '#b0783e');
    mesh(handleGeo(0.72, 0.024), wood, 0, 0, 0);
    // pomo e empunhadura enrolada
    const knob = mesh(new THREE.SphereGeometry(0.036, 10, 8), ink, 0, -0.12, 0);
    knob.scale.set(1, 0.7, 1);
    for (let i = 0; i < 4; i++) mesh(new THREE.TorusGeometry(0.026, 0.008, 5, 12), smooth(level >= 3 ? '#ff4f6a' : '#3a3050'), -0.002, -0.06 + i * 0.03, 0).rotation.x = Math.PI / 2;
    // olho da cabeça (bloco arredondado) + cunha
    const metal = smooth('#8a8aa0');
    mesh(rbox(0.07, 0.12, 0.1, 0.02), metal, 0, 0.55, 0);
    mesh(rbox(0.06, 0.05, 0.06, 0.015), smooth('#6a6a80'), 0, 0.62, 0.05);
    const shp = new THREE.Shape();
    shp.moveTo(0, -0.045);
    shp.lineTo(0, 0.045);
    shp.quadraticCurveTo(0.09, 0.07, 0.16, 0.13);
    shp.quadraticCurveTo(0.12, 0, 0.16, -0.13);
    shp.quadraticCurveTo(0.09, -0.07, 0, -0.045);
    const bg = new THREE.ExtrudeGeometry(shp, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.006, bevelSegments: 2, curveSegments: 8 });
    bg.translate(0, 0, -0.006);
    bg.rotateY(Math.PI / 2);
    const blade = (sd: number) => {
      const b = mesh(bg, smooth(color, 0.08), 0, 0.55, -sd * 0.045);
      if (sd < 0) b.rotation.y = Math.PI;
      // fio brilhante (curvo)
      const e = mesh(new THREE.TorusGeometry(0.15, 0.006, 4, 10, 1.6), smooth('#ffffff', 0.6), 0, 0.55, -sd * 0.045);
      e.rotation.y = Math.PI / 2;
      e.rotation.z = -0.8;
      e.position.z = -sd * 0.04;
      if (sd < 0) e.rotation.y = -Math.PI / 2;
    };
    blade(1);
    if (level >= 3) blade(-1);
    if (level >= 3) mesh(new THREE.SphereGeometry(0.025, 8, 6), smooth('#ffd34a', 0.4), 0, 0.64, 0);
    tip.position.set(0, 0.55, -0.24);
  } else if (kind === 'saw') {
    // motosserra: corpo arredondado, alça de cima, protetor de mão, sabre com bisel, corrente correndo
    const body = smooth(color);
    mesh(rbox(0.16, 0.17, 0.3, 0.045), body, 0, 0.03, 0.02);
    mesh(rbox(0.165, 0.06, 0.12, 0.02), smooth('#2a2238'), 0, 0.12, 0.12);
    // tanque e partida
    mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12), smooth('#fff6d6'), 0.085, 0.04, 0.06).rotation.z = Math.PI / 2;
    // alça de cima (arco)
    const h1 = mesh(new THREE.TorusGeometry(0.09, 0.016, 6, 16, Math.PI), ink, 0, 0.13, 0.04);
    h1.rotation.y = Math.PI / 2;
    // protetor de mão
    const gd = mesh(new THREE.TorusGeometry(0.08, 0.012, 5, 14, Math.PI), smooth('#2a2238'), 0, 0.08, -0.12);
    gd.rotation.set(0, 0, 0);
    // sabre (estádio extrudado com bisel)
    const L = 0.5;
    const sh = new THREE.Shape();
    sh.moveTo(-0.035, 0);
    sh.lineTo(-0.035, L);
    sh.absarc(0, L, 0.035, Math.PI, 0, true);
    sh.lineTo(0.035, 0);
    sh.lineTo(-0.035, 0);
    const barG = new THREE.ExtrudeGeometry(sh, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 1, curveSegments: 8 });
    barG.translate(0, 0, -0.005);
    barG.rotateX(-Math.PI / 2);
    barG.rotateZ(Math.PI / 2);
    mesh(barG, smooth('#c9c9d6', 0.05), 0, 0.0, -0.1);
    // corrente: dentes em cima e embaixo (andam em z)
    const chain = new THREE.Group();
    const tooth = new THREE.BoxGeometry(0.02, 0.016, 0.03);
    const tm = smooth('#3a3a4a');
    for (let i = 0; i < 9; i++) {
      mesh(tooth, tm, 0, 0.042, -0.13 - i * 0.055, chain);
      mesh(tooth, tm, 0, -0.042, -0.13 - i * 0.055, chain);
    }
    g.add(chain);
    spin = chain;
    mesh(rbox(0.04, 0.07, 0.06, 0.012), smooth('#ffd34a', 0.3), 0.085, 0.02, 0.05);
    if (level >= 5) mesh(rbox(0.17, 0.04, 0.2, 0.015), smooth('#ffffff'), 0, 0.11, -0.02);
    tip.position.set(0, 0, -0.62);
  } else {
    // cortador a laser: corpo em cápsula, cano com anéis, ponta brilhante
    const body = mesh(new THREE.CapsuleGeometry(0.055, 0.16, 4, 12), smooth(color), 0, 0.05, 0);
    body.rotation.x = Math.PI / 2;
    mesh(rbox(0.1, 0.03, 0.18, 0.012), smooth('#ffffff'), 0, 0.11, -0.01);
    mesh(rbox(0.05, 0.13, 0.06, 0.018), ink, 0, -0.05, 0.07);
    const barrel = mesh(new THREE.CylinderGeometry(0.03, 0.036, 0.24, 14), smooth('#e8eaf8'), 0, 0.07, -0.25);
    barrel.rotation.x = Math.PI / 2;
    for (let i = 0; i < 3; i++) mesh(new THREE.TorusGeometry(0.036, 0.008, 5, 14), smooth(color, 0.3), 0, 0.07, -0.18 - i * 0.06);
    const glow = mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: level >= 7 ? '#e0b0ff' : '#b0ffff' }), 0, 0.07, -0.38);
    glow.scale.setScalar(0.04);
    spin = glow;
    tip.position.set(0, 0.07, -0.4);
  }
  g.add(tip);
  return { g, tip, spin };
}

/* ------------------------------ mão 2D (cores do Bloop) ------------------------------ */

export interface HandColors {
  light: string;
  dark: string;
  belly: string;
}
export function shade(hex: string, t: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (t > 0) {
    r += (255 - r) * t;
    g += (255 - g) * t;
    b += (255 - b) * t;
  } else {
    r *= 1 + t;
    g *= 1 + t;
    b *= 1 + t;
  }
  return '#' + ((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1);
}
export function myHandColors(): HandColors {
  const id = globalSave.skin;
  if (id === 'custom') {
    const c = globalSave.avatar?.colors;
    const p = c?.primary ?? '#c9a3a3';
    return { light: p, dark: shade(p, -0.3), belly: c?.secondary ?? shade(p, 0.4) };
  }
  const s = skinById(id);
  return { light: s.light, dark: s.dark, belly: s.belly };
}

/** punho fechado (segurando algo) com braço saindo de baixo */
export function handTexture(col: HandColors, open = false): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const c = cv.getContext('2d')!;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.strokeStyle = INK;
  c.lineWidth = 8;
  // (o antebraço é uma malha à parte: Forearm em src/3d/common/hand.ts)
  const cx = 128;
  const cy = 120;
  const g = c.createRadialGradient(cx - 18, cy - 26, 6, cx, cy, 80);
  g.addColorStop(0, shade(col.light, 0.35));
  g.addColorStop(0.6, col.light);
  g.addColorStop(1, col.dark);
  c.fillStyle = g;
  c.beginPath();
  c.ellipse(cx, cy, 60, 52, 0, 0, TAU);
  c.fill();
  c.stroke();
  // dedos (fechados por cima do cabo)
  const n = open ? 4 : 4;
  for (let i = 0; i < n; i++) {
    const fx = cx - 45 + i * 30;
    const fy = cy - (open ? 58 : 40) + Math.abs(i - 1.5) * 4;
    c.fillStyle = col.light;
    c.beginPath();
    c.ellipse(fx, fy, 17, open ? 26 : 19, 0, 0, TAU);
    c.fill();
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.4)';
    c.beginPath();
    c.ellipse(fx - 4, fy - 6, 6, 4, -0.4, 0, TAU);
    c.fill();
  }
  // polegar
  c.fillStyle = col.light;
  c.beginPath();
  c.ellipse(cx - 58, cy + 8, 20, 27, -0.6, 0, TAU);
  c.fill();
  c.stroke();
  c.fillStyle = col.belly;
  c.globalAlpha = 0.85;
  c.beginPath();
  c.ellipse(cx + 4, cy + 18, 28, 20, 0, 0, TAU);
  c.fill();
  c.globalAlpha = 1;
  c.fillStyle = 'rgba(255,255,255,0.45)';
  c.beginPath();
  c.ellipse(cx + 26, cy - 20, 15, 8, -0.5, 0, TAU);
  c.fill();
  // rim quente em cima, sombra fria embaixo (assenta no cenário)
  c.strokeStyle = 'rgba(255,248,230,0.5)';
  c.lineWidth = 5;
  c.beginPath();
  c.ellipse(cx, cy, 52, 44, 0, Math.PI * 1.1, Math.PI * 1.6);
  c.stroke();
  c.strokeStyle = 'rgba(30,10,60,0.2)';
  c.lineWidth = 9;
  c.beginPath();
  c.ellipse(cx, cy, 51, 43, 0, Math.PI * 0.1, Math.PI * 0.8);
  c.stroke();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------ pássaros e emotes ------------------------------ */

export function birdTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 64;
  const c = cv.getContext('2d')!;
  for (let f = 0; f < 2; f++) {
    c.save();
    c.translate(32 + f * 64, 34);
    c.lineWidth = 4;
    c.strokeStyle = INK;
    c.lineJoin = 'round';
    // asas
    c.fillStyle = '#5ab0ff';
    c.beginPath();
    if (f === 0) {
      c.moveTo(-4, -2);
      c.quadraticCurveTo(-18, -26, -28, -18);
      c.quadraticCurveTo(-16, -6, -4, 2);
      c.moveTo(4, -2);
      c.quadraticCurveTo(18, -26, 28, -18);
      c.quadraticCurveTo(16, -6, 4, 2);
    } else {
      c.moveTo(-4, 0);
      c.quadraticCurveTo(-18, 18, -28, 14);
      c.quadraticCurveTo(-16, 4, -4, -2);
      c.moveTo(4, 0);
      c.quadraticCurveTo(18, 18, 28, 14);
      c.quadraticCurveTo(16, 4, 4, -2);
    }
    c.fill();
    c.stroke();
    c.fillStyle = '#ffd34a';
    c.beginPath();
    c.ellipse(0, 0, 11, 9, 0, 0, TAU);
    c.fill();
    c.stroke();
    c.fillStyle = INK;
    c.beginPath();
    c.arc(3, -2, 2.2, 0, TAU);
    c.fill();
    c.fillStyle = '#ff8a3a';
    c.beginPath();
    c.moveTo(9, 0);
    c.lineTo(16, 2);
    c.lineTo(9, 4);
    c.fill();
    c.restore();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** textura redonda suave para partículas */
export function dotTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 32;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#fff';
  c.beginPath();
  c.moveTo(6, 4);
  c.lineTo(28, 8);
  c.lineTo(26, 28);
  c.lineTo(4, 24);
  c.closePath();
  c.fill();
  const t = new THREE.CanvasTexture(cv);
  return t;
}

/* ------------------------------ veículos ------------------------------ */

export interface VehModel {
  g: THREE.Group;
  /** caçamba: onde as toras aparecem (local) */
  bed: THREE.Object3D;
  /** posição do olho do motorista (local) */
  seat: THREE.Vector3;
  wheels: THREE.Object3D[];
  len: number;
  wid: number;
  bedTilt: THREE.Object3D | null;
}

/** frente do veículo = +X local */
export function vehicleModel(v: number): VehModel {
  const g = new THREE.Group();
  const wheels: THREE.Object3D[] = [];
  const box = (w: number, h: number, d: number, c: string, x: number, y: number, z: number, parent: THREE.Object3D = g, e = 0) => {
    const m = new THREE.Mesh(base.box, lambert(c, e));
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const wheel = (x: number, y: number, z: number, r: number, w = 0.25) => {
    const p = new THREE.Group();
    p.position.set(x, y, z);
    const m = new THREE.Mesh(base.cyl, lambert('#2a2238'));
    m.scale.set(r, w, r);
    m.rotation.x = Math.PI / 2;
    p.add(m);
    const hub = new THREE.Mesh(base.cyl, lambert('#ffd34a'));
    hub.scale.set(r * 0.45, w + 0.02, r * 0.45);
    hub.rotation.x = Math.PI / 2;
    p.add(hub);
    const spoke = new THREE.Mesh(base.box, lambert('#ffffff'));
    spoke.scale.set(r * 1.4, r * 0.18, w + 0.04);
    p.add(spoke);
    g.add(p);
    wheels.push(p);
  };
  const bed = new THREE.Object3D();
  let bedTilt: THREE.Object3D | null = null;
  const seat = new THREE.Vector3();
  let len = 3;
  let wid = 1.8;
  if (v === 1) {
    // carrinho de mão: caçamba na frente, uma roda; você empurra
    const tub = new THREE.Group();
    tub.position.set(0.9, 0.55, 0);
    g.add(tub);
    box(1.2, 0.12, 0.9, '#3ee07a', 0, -0.2, 0, tub);
    for (const s of [-1, 1]) box(1.2, 0.45, 0.08, '#2fc068', 0, 0, s * 0.45, tub);
    box(0.08, 0.45, 0.9, '#2fc068', 0.6, 0, 0, tub);
    box(0.08, 0.45, 0.9, '#2fc068', -0.6, 0, 0, tub);
    for (const s of [-1, 1]) box(1.4, 0.06, 0.06, '#a8743c', -0.4, 0.15, s * 0.32);
    wheel(1.5, 0.28, 0, 0.28, 0.14);
    for (const s of [-1, 1]) box(0.06, 0.4, 0.06, '#a8743c', 0.4, 0.15, s * 0.3);
    tub.add(bed);
    bed.position.set(0, -0.05, 0);
    seat.set(-1.0, 1.55, 0);
    len = 2.4;
    wid = 1.1;
  } else {
    const L = v === 4 ? 4.4 : v === 3 ? 3.6 : 3.2;
    const col = ['#ff9a2e', '#ffcf2e', '#ff4f6a'][v - 2];
    len = L;
    wid = 1.9;
    // chassi
    box(L, 0.35, 1.7, '#3a3050', 0, 0.55, 0);
    // cabine na frente
    box(1.1, 0.8, 1.7, col, L * 0.5 - 0.6, 1.1, 0);
    box(0.5, 0.25, 1.5, shade(col, 0.2), L * 0.5 - 0.3, 1.6, 0);
    for (const s of [-1, 1]) box(0.04, 0.32, 0.04, INK, L * 0.5 - 0.1, 1.86, s * 0.74);
    // cabine aberta: santantônio atrás do banco
    for (const s of [-1, 1]) box(0.1, 0.9, 0.1, '#ffffff', L * 0.5 - 1.1, 2.1, s * 0.8);
    box(0.1, 0.1, 1.7, '#ffffff', L * 0.5 - 1.1, 2.55, 0);
    // caçamba atrás (inclina para despejar)
    const tilt = new THREE.Group();
    tilt.position.set(-L * 0.5 + 0.05, 0.75, 0);
    g.add(tilt);
    const bw = L - 1.3;
    box(bw, 0.1, 1.7, col, bw / 2, 0, 0, tilt);
    for (const s of [-1, 1]) box(bw, 0.5, 0.08, shade(col, -0.15), bw / 2, 0.28, s * 0.85, tilt);
    box(0.08, 0.5, 1.7, shade(col, -0.15), 0.02, 0.28, 0, tilt);
    tilt.add(bed);
    bed.position.set(bw / 2, 0.1, 0);
    bedTilt = tilt;
    const wr = v === 3 ? 0.5 : 0.42;
    for (const dx of [-L * 0.32, L * 0.32]) for (const dz of [-0.92, 0.92]) wheel(dx, wr, dz, wr);
    if (v === 3) {
      // pá da carregadeira
      for (const s of [-1, 1]) box(0.9, 0.12, 0.12, '#5a5a6a', L * 0.5 + 0.3, 0.9, s * 0.6);
      box(0.15, 0.6, 1.9, '#ffcf2e', L * 0.5 + 0.8, 0.6, 0);
      box(0.6, 0.1, 1.9, '#ffcf2e', L * 0.5 + 0.55, 0.32, 0);
    }
    if (v === 4) {
      // locomotiva: chaminé
      const ch = new THREE.Mesh(base.cyl, lambert(INK));
      ch.scale.set(0.2, 0.8, 0.2);
      ch.position.set(L * 0.5 - 0.3, 2.2, 0);
      g.add(ch);
      box(0.5, 0.18, 0.5, '#ffd34a', L * 0.5 - 0.3, 2.6, 0);
    }
    // farol
    for (const s of [-1, 1]) box(0.06, 0.16, 0.24, '#fff6d6', L * 0.5 + 0.0, 0.85, s * 0.6, g, 0.6);
    seat.set(L * 0.5 - 0.95, 2.05, 0);
  }
  return { g, bed, seat, wheels, len, wid, bedTilt };
}

/** volante (visto pelo motorista) */
export function steeringWheel(): THREE.Group {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 6, 16), lambert('#2a2238'));
  g.add(ring);
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(base.box, lambert('#5a5a6a'));
    s.scale.set(0.17, 0.025, 0.02);
    s.position.set(Math.cos(i * 2.1 + 1.57) * 0.085, Math.sin(i * 2.1 + 1.57) * 0.085, 0);
    s.rotation.z = i * 2.1 + 1.57;
    g.add(s);
  }
  const hub = new THREE.Mesh(base.cyl, lambert('#ff4f6a'));
  hub.scale.set(0.05, 0.03, 0.05);
  hub.rotation.x = Math.PI / 2;
  g.add(hub);
  return g;
}

export const geoms = base;

/* ------------------------------ vento ------------------------------ */

/**
 * Balanço suave das copas: desloca os vértices proporcional a altura² (o tronco quase não mexe),
 * com fase pela posição da instância (cada árvore balança no seu ritmo) + tremidinha das folhas.
 * Barato: só vertex shader (módulo compartilhado src/3d/nature).
 */
export function addWind(mat: THREE.Material, amp = 0.0022): void {
  natureWind(mat, { amp, y0: 1, rustle: 0.035 });
}
