/* ============================================================
 *  BLOOP STUDIO — Creation → objetos three.js.
 *  Editor: uma malha por peça (seleção por raio). Jogar: ver play/scene.ts
 *  (peças paradas fundidas por material + instâncias para criações repetidas).
 * ============================================================ */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LIMITS, findDep, type Creation, type Part } from '../format';
import { primGeometry, strokeGeometry } from './geo';
import { materialFor } from './mats';

export type Resolver = (id: string) => Creation | undefined;
const D2R = Math.PI / 180;

export function applyTransform(p: Part, o: THREE.Object3D): void {
  o.position.set(p.p[0], p.p[1], p.p[2]);
  const r = p.r ?? [0, 0, 0];
  o.rotation.set(r[0] * D2R, r[1] * D2R, r[2] * D2R, 'XYZ');
  const s = p.s ?? [1, 1, 1];
  o.scale.set(s[0], s[1], s[2]);
}

export function partMatrix(p: Part, out = new THREE.Matrix4()): THREE.Matrix4 {
  const r = p.r ?? [0, 0, 0];
  const s = p.s ?? [1, 1, 1];
  _e.set(r[0] * D2R, r[1] * D2R, r[2] * D2R, 'XYZ');
  _q.setFromEuler(_e);
  return out.compose(_v.set(p.p[0], p.p[1], p.p[2]), _q, _s.set(s[0], s[1], s[2]));
}
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

export function resolveRef(root: Creation, id: string, resolve: Resolver): Creation | undefined {
  return findDep(root, id) ?? resolve(id);
}

export interface BuildOpts {
  detail: number;
  /** modo editor: zonas/moldes visíveis como fantasma */
  edit: boolean;
}

/** Peça → Object3D já posicionado. userData.pid = id da peça. */
export function buildPart(p: Part, doc: Creation, resolve: Resolver, o: BuildOpts, depth = 0, root: Creation = doc): THREE.Object3D {
  let obj: THREE.Object3D;
  const mat = doc.materials[p.m ?? 0] ?? doc.materials[0];
  const ghost = p.role === 'zone' || (o.edit && p.hide);
  if (p.t === 'ref') {
    const g = new THREE.Group();
    const c = depth < LIMITS.refDepth ? resolveRef(root, p.ref, resolve) : undefined;
    if (c) {
      for (const q of c.parts) g.add(buildPart(q, c, resolve, o, depth + 1, root));
    } else {
      // importada que ainda não chegou: caixinha "?"
      const m = new THREE.Mesh(primGeometry('box', o.detail), materialFor({ c: '#b8a8e0', k: 'plastic' }, { ghost: true }));
      g.add(m);
    }
    g.userData.ref = p.ref;
    obj = g;
  } else if (p.t === 'stroke') {
    const m = new THREE.Mesh(strokeGeometry(p, o.detail), materialFor(mat, { ghost }));
    m.userData.ownGeo = true;
    obj = m;
  } else {
    obj = new THREE.Mesh(primGeometry(p.t, o.detail), materialFor(mat, { ghost }));
  }
  if (!o.edit && (p.role === 'zone' || p.hide)) obj.visible = false;
  applyTransform(p, obj);
  obj.userData.pid = p.id;
  obj.traverse((c) => {
    if (c !== obj) c.userData.owner = obj;
    const m = c as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = !ghost;
      m.receiveShadow = true;
    }
  });
  return obj;
}

/** Criação inteira num Group (cada filho = uma peça). */
export function buildCreation(c: Creation, resolve: Resolver, o: BuildOpts): THREE.Group {
  const g = new THREE.Group();
  for (const p of c.parts) g.add(buildPart(p, c, resolve, o));
  return g;
}

/** Libera geometrias próprias (traços) de uma árvore. Geometrias de primitivas são compartilhadas. */
export function disposeTree(o: THREE.Object3D): void {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh && m.userData.ownGeo) m.geometry.dispose();
  });
}

/* ------------------------- fusão (lotes estáticos) ------------------------- */

interface Bucket {
  mat: THREE.Material;
  geos: THREE.BufferGeometry[];
}

/** Junta malhas por material numa geometria por lote (as transformações viram vértices). */
export class Batcher {
  private buckets = new Map<THREE.Material, Bucket>();
  add(geo: THREE.BufferGeometry, mat: THREE.Material, world: THREE.Matrix4): void {
    let b = this.buckets.get(mat);
    if (!b) this.buckets.set(mat, (b = { mat, geos: [] }));
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()) as THREE.BufferGeometry;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.getAttribute('position').count * 2) | 0), 2));
    g.clearGroups();
    g.applyMatrix4(world);
    b.geos.push(g);
  }
  /** Adiciona todas as malhas de um objeto (com a matriz `rel` de raiz → mundo). */
  addObject(o: THREE.Object3D, rel: THREE.Matrix4): void {
    o.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4();
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh || !m.visible) return;
      inv.multiplyMatrices(rel, m.matrixWorld);
      this.add(m.geometry, m.material as THREE.Material, inv);
    });
  }
  get size(): number {
    return this.buckets.size;
  }
  build(): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const b of this.buckets.values()) {
      const g = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos);
      if (!g) continue;
      if (b.geos.length > 1) for (const x of b.geos) x.dispose();
      g.computeBoundingSphere();
      g.computeBoundingBox();
      const m = new THREE.Mesh(g, b.mat);
      m.userData.ownGeo = true;
      m.castShadow = m.receiveShadow = true;
      out.push(m);
    }
    this.buckets.clear();
    return out;
  }
}

/* -------------------------------- miniatura -------------------------------- */

/** Foto 3/4 da criação (data URL webp/jpeg ≤ 40 KB). */
export function captureThumb(r: THREE.WebGLRenderer, obj: THREE.Object3D, w = 192, h = 144): string {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#bfe6ff');
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7ab0, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(3, 5, 4);
  scene.add(sun);
  const clone = obj.clone(true);
  scene.add(clone);
  const box = new THREE.Box3().setFromObject(clone);
  if (box.isEmpty()) box.set(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
  const ctr = box.getCenter(new THREE.Vector3());
  const rad = Math.max(0.5, box.getSize(new THREE.Vector3()).length() / 2);
  const cam = new THREE.PerspectiveCamera(35, w / h, 0.05, rad * 20);
  const dist = rad / Math.sin((35 * D2R) / 2) * 0.95;
  cam.position.copy(ctr).add(new THREE.Vector3(0.75, 0.55, 1).normalize().multiplyScalar(dist));
  cam.lookAt(ctr);
  const rt = new THREE.WebGLRenderTarget(w, h, { colorSpace: THREE.SRGBColorSpace });
  const prev = r.getRenderTarget();
  r.setRenderTarget(rt);
  r.render(scene, cam);
  const px = new Uint8Array(w * h * 4);
  r.readRenderTargetPixels(rt, 0, 0, w, h, px);
  r.setRenderTarget(prev);
  rt.dispose();
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const x = cv.getContext('2d')!;
  const img = x.createImageData(w, h);
  for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  x.putImageData(img, 0, 0);
  let url = cv.toDataURL('image/webp', 0.78);
  if (!url.startsWith('data:image/webp')) url = cv.toDataURL('image/jpeg', 0.78);
  if (url.length > LIMITS.thumbBytes * 1.3) url = cv.toDataURL('image/jpeg', 0.5);
  return url;
}
