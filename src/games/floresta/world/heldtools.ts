/* ============================================================
 *  MUNDO — o que a mão segura em 1ª pessoa (viewmodel):
 *  - ferramentas 3D próprias (picareta, machado, pá, espada, enxada,
 *    martelo) no estilo Bloop: peças arredondadas com contorno roxo-
 *    escuro (casca invertida), cor da cabeça = nível do material;
 *  - bloco na mão = cubinho com os ladrilhos do próprio atlas;
 *  - o resto (comida, tocha, kits…) = plaquinha com o ícone.
 *  Origem de todo modelo = empunhadura; o cabo sobe em +Y.
 *  Animação (atraso ao olhar, passo, golpe) = fpkit HeldItem.
 * ============================================================ */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { buildAtlas, TILE } from './content/blocks/atlas';
import { ATLAS_COLS } from './content/blocks/registry';
import type { BlockDef } from './content/blocks/types';

const INK = new THREE.Color('#2a0b5c');
const mats = new Map<string, THREE.MeshLambertMaterial>();
function mat(c: string): THREE.MeshLambertMaterial {
  let m = mats.get(c);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: c, fog: false });
    mats.set(c, m);
  }
  return m;
}
const inkMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide, fog: false });

const geos = new Map<string, THREE.BufferGeometry>();
function rb(w: number, h: number, d: number, r = Math.min(w, h, d) * 0.3): THREE.BufferGeometry {
  const k = [w, h, d, r].map((v) => v.toFixed(3)).join(',');
  let g = geos.get(k);
  if (!g) geos.set(k, (g = new RoundedBoxGeometry(w, h, d, 2, r)));
  return g;
}

/** peça com contorno (casca invertida um pouco maior, desenhada antes) */
function part(g: THREE.Group, geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number, rz = 0, ink = 0.012): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat(color));
  m.position.set(x, y, z);
  m.rotation.z = rz;
  m.renderOrder = 21;
  const o = new THREE.Mesh(geo, inkMat);
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const sx = bb.max.x - bb.min.x;
  const sy = bb.max.y - bb.min.y;
  const sz = bb.max.z - bb.min.z;
  o.scale.set(1 + (ink * 2) / sx, 1 + (ink * 2) / sy, 1 + (ink * 2) / sz);
  o.renderOrder = 20;
  m.add(o);
  g.add(m);
  return m;
}

/** forma achatada extrudada (lâminas) */
function blade(shape: THREE.Shape, depth: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: depth * 0.35, bevelSize: 0.008, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}

const WOOD = '#b0783e';
const WOOD2 = '#8a5a2c';

export type HeldToolKind = 'pick' | 'axe' | 'shovel' | 'sword' | 'hoe' | 'hammer';

/** ferramenta: c = cor do material da cabeça, c2 = sombra/fio */
export function toolViewModel(kind: HeldToolKind, c: string, c2: string): THREE.Group {
  const g = new THREE.Group();
  const handleLen = kind === 'sword' ? 0.15 : 0.56;
  // cabo (com faixa de empunhadura)
  part(g, rb(0.042, handleLen, 0.042, 0.018), kind === 'sword' ? '#5a3a7a' : WOOD, 0, handleLen / 2 - 0.08, 0);
  if (kind !== 'sword') part(g, rb(0.05, 0.1, 0.05, 0.02), WOOD2, 0, -0.03, 0);
  const top = handleLen - 0.08;
  if (kind === 'pick') {
    // cabeça em arco: 7 gomos arredondados, pontas na cor escura
    const n = 7;
    for (let i = 0; i < n; i++) {
      const u = (i / (n - 1)) * 2 - 1; // -1..1
      const x = u * 0.2;
      const y = top - 0.02 - u * u * 0.06;
      const s = 1 - Math.abs(u) * 0.35;
      part(g, rb(0.075, 0.07 * s, 0.06 * s, 0.022 * s), Math.abs(u) > 0.7 ? c2 : c, x, y, 0, -u * 0.5);
    }
    part(g, rb(0.07, 0.07, 0.07, 0.02), c2, 0, top - 0.02, 0);
  } else if (kind === 'axe') {
    part(g, rb(0.07, 0.11, 0.07, 0.022), c2, 0, top - 0.02, 0);
    const s = new THREE.Shape();
    s.moveTo(0, -0.05);
    s.lineTo(0, 0.05);
    s.quadraticCurveTo(0.08, 0.08, 0.16, 0.13);
    s.quadraticCurveTo(0.12, 0, 0.16, -0.13);
    s.quadraticCurveTo(0.08, -0.08, 0, -0.05);
    part(g, blade(s, 0.03), c, 0.03, top - 0.02, 0, 0, 0.01);
    // fio claro
    const e = new THREE.Shape();
    e.moveTo(0.135, 0.11);
    e.quadraticCurveTo(0.105, 0, 0.135, -0.11);
    e.lineTo(0.16, -0.13);
    e.quadraticCurveTo(0.12, 0, 0.16, 0.13);
    const em = new THREE.Mesh(blade(e, 0.034), mat('#ffffff'));
    em.position.set(0.03, top - 0.02, 0);
    em.renderOrder = 22;
    g.add(em);
  } else if (kind === 'shovel') {
    part(g, rb(0.06, 0.06, 0.06, 0.02), c2, 0, top + 0.01, 0);
    const s = new THREE.Shape();
    s.moveTo(-0.075, 0);
    s.lineTo(0.075, 0);
    s.lineTo(0.08, 0.15);
    s.quadraticCurveTo(0.06, 0.22, 0, 0.25);
    s.quadraticCurveTo(-0.06, 0.22, -0.08, 0.15);
    s.lineTo(-0.075, 0);
    part(g, blade(s, 0.022), c, 0, top + 0.03, 0, 0, 0.01);
  } else if (kind === 'sword') {
    // guarda + lâmina larga de espuma (brinquedo) + ponta
    part(g, rb(0.2, 0.05, 0.06, 0.02), c2, 0, top + 0.02, 0);
    const s = new THREE.Shape();
    s.moveTo(-0.045, 0);
    s.lineTo(0.045, 0);
    s.lineTo(0.045, 0.42);
    s.lineTo(0, 0.5);
    s.lineTo(-0.045, 0.42);
    s.lineTo(-0.045, 0);
    part(g, blade(s, 0.022), c, 0, top + 0.04, 0, 0, 0.01);
    const f = new THREE.Mesh(rb(0.012, 0.36, 0.03, 0.005), mat('#ffffff'));
    f.position.set(0, top + 0.25, 0);
    f.renderOrder = 22;
    g.add(f);
    part(g, rb(0.06, 0.05, 0.06, 0.022), c2, 0, -0.1, 0);
  } else if (kind === 'hoe') {
    part(g, rb(0.06, 0.06, 0.06, 0.02), c2, 0, top, 0);
    part(g, rb(0.16, 0.05, 0.05, 0.018), c, 0.08, top + 0.005, 0);
    part(g, rb(0.05, 0.09, 0.06, 0.018), c, 0.15, top - 0.04, 0);
  } else {
    // martelo
    part(g, rb(0.2, 0.09, 0.09, 0.025), c, 0, top, 0);
    part(g, rb(0.05, 0.11, 0.11, 0.02), c2, 0.11, top, 0);
  }
  return g;
}

/** cubinho do bloco com os ladrilhos do atlas (topo/lado) */
const tileTex = new Map<number, THREE.Texture>();
function tileTexture(idx: number): THREE.Texture {
  let t = tileTex.get(idx);
  if (t) return t;
  const atlas = buildAtlas();
  const c = document.createElement('canvas');
  c.width = c.height = TILE;
  const x = c.getContext('2d')!;
  x.drawImage(atlas.colorCanvas, (idx % ATLAS_COLS) * TILE, Math.floor(idx / ATLAS_COLS) * TILE, TILE, TILE, 0, 0, TILE, TILE);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  tileTex.set(idx, t);
  return t;
}
export function blockViewModel(d: BlockDef): THREE.Group {
  const g = new THREE.Group();
  const side = new THREE.MeshLambertMaterial({ map: tileTexture(d.tiles.side), fog: false });
  const top = new THREE.MeshLambertMaterial({ map: tileTexture(d.tiles.top), fog: false });
  const bot = new THREE.MeshLambertMaterial({ map: tileTexture(d.tiles.bottom), fog: false });
  const s = 0.2;
  const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), [side, side, top, bot, side, side]);
  m.renderOrder = 21;
  const o = new THREE.Mesh(new THREE.BoxGeometry(s + 0.016, s + 0.016, s + 0.016), inkMat);
  o.renderOrder = 20;
  m.add(o);
  // o cubo fica acima da mão (origem = empunhadura)
  m.position.set(0, 0.1, 0);
  m.rotation.set(0.15, 0.6, 0);
  g.add(m);
  return g;
}

/** triângulo invisível desenhado logo antes do viewmodel: limpa o depth (a ferramenta nunca entra na parede,
 *  mas as peças dela se cobrem direito entre si) */
export function depthClearer(): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, -0.2, 0.001, 0, -0.2, 0, 0.001, -0.2]), 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false }));
  m.renderOrder = 19;
  m.frustumCulled = false;
  m.onBeforeRender = (r) => r.clearDepth();
  return m;
}

/** plaquinha com o ícone (comida, tocha, kits…) */
export function iconViewModel(url: string): THREE.Group {
  const g = new THREE.Group();
  const tex = new THREE.TextureLoader().load(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.05, depthTest: false, fog: false, toneMapped: false, side: THREE.DoubleSide }));
  m.position.set(0, 0.1, 0);
  m.renderOrder = 21;
  g.add(m);
  return g;
}

/** some com tudo do modelo (texturas/materiais únicos) */
export function disposeViewModel(g: THREE.Object3D): void {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mm = m.material as THREE.Material | THREE.Material[];
    for (const x of Array.isArray(mm) ? mm : [mm]) {
      if (x === inkMat || [...mats.values()].includes(x as THREE.MeshLambertMaterial)) continue;
      const mp = (x as THREE.MeshBasicMaterial).map;
      if (mp && ![...tileTex.values()].includes(mp)) mp.dispose();
      x.dispose();
    }
  });
}
