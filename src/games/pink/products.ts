/* ============================================================
 *  BLOOP PINK — produtos 3D.
 *  ProductField: todos os produtos parados (prateleiras, balcão) em InstancedMesh
 *  por (forma × peça) — poucas chamadas de desenho mesmo com centenas de itens.
 *  productMesh(): um produto solto (física, mão, abertura), com materiais por cor.
 * ============================================================ */
import * as THREE from 'three';
import type { Product, Shape } from './catalog';
import type { Kit } from './mats';
import { productPartsMerged, type PartKind } from './shapes';

const SHAPES: Shape[] = ['splash', 'perfume', 'lipstick', 'gloss', 'compact', 'mascara', 'polish', 'tube', 'dropper', 'jar', 'pump', 'tub', 'pills', 'pouch', 'brush', 'giftbox'];
const GEO = new Map<Shape, Map<PartKind, THREE.BufferGeometry>>();
/** geometrias das formas (compartilhadas por todo o jogo; nunca liberadas — são pequenas) */
export function shapeGeo(s: Shape): Map<PartKind, THREE.BufferGeometry> {
  let g = GEO.get(s);
  if (!g) {
    g = productPartsMerged(s);
    GEO.set(s, g);
  }
  return g;
}

function partMat(kit: Kit, kind: PartKind): THREE.Material {
  switch (kind) {
    case 'body':
      return kit.plain('prod-body', '#ffffff', 0.32, 0, { envK: 0.9 });
    case 'cap':
      return kit.plain('prod-cap', '#ffffff', 0.25, 0.15, { envK: 1 });
    case 'glass':
      return kit.glass('prod-glass', '#ffffff', 0.32);
    case 'label':
      return kit.labelMat();
    case 'metal':
      return kit.plain('prod-metal', '#e6dcd4', 0.18, 1, { envK: 1.3 });
  }
}

export interface PlacedItem {
  p: Product;
  m: THREE.Matrix4;
}

const _c = new THREE.Color();
export class ProductField {
  readonly group = new THREE.Group();
  private meshes = new Map<string, { mesh: THREE.InstancedMesh; kind: PartKind; cap: number }>();
  private counts = new Map<string, number>();
  constructor(
    private kit: Kit,
    private shadows = false,
  ) {
    this.group.name = 'products';
  }
  private get(s: Shape, kind: PartKind, need: number): THREE.InstancedMesh {
    const key = s + ':' + kind;
    let e = this.meshes.get(key);
    if (!e || e.cap < need) {
      const cap = Math.max(64, Math.ceil(need * 1.5));
      if (e) {
        this.group.remove(e.mesh);
        e.mesh.dispose();
      }
      const geo = shapeGeo(s).get(kind)!;
      const mesh = new THREE.InstancedMesh(geo, partMat(this.kit, kind), cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (kind === 'body' || kind === 'cap') mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      mesh.castShadow = this.shadows && kind !== 'glass';
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      mesh.count = 0;
      if (kind === 'glass') mesh.renderOrder = 2;
      this.group.add(mesh);
      e = { mesh, kind, cap };
      this.meshes.set(key, e);
    }
    return e.mesh;
  }
  /** reconstrói tudo (chame quando algo mudou; barato até ~2000 itens) */
  rebuild(items: PlacedItem[]): void {
    // conta por forma
    const per = new Map<Shape, PlacedItem[]>();
    for (const it of items) {
      let l = per.get(it.p.shape);
      if (!l) per.set(it.p.shape, (l = []));
      l.push(it);
    }
    for (const e of this.meshes.values()) e.mesh.count = 0;
    for (const [s, list] of per) {
      for (const [kind] of shapeGeo(s)) {
        const mesh = this.get(s, kind, list.length);
        for (let i = 0; i < list.length; i++) {
          const it = list[i];
          mesh.setMatrixAt(i, it.m);
          if (mesh.instanceColor) mesh.setColorAt(i, _c.set(kind === 'cap' ? it.p.cap : it.p.color));
        }
        mesh.count = list.length;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
    for (const e of this.meshes.values()) e.mesh.visible = e.mesh.count > 0;
    this.counts.clear();
  }
  dispose(): void {
    for (const e of this.meshes.values()) e.mesh.dispose();
    this.meshes.clear();
    this.group.removeFromParent();
  }
}

/** um produto solto (com materiais próprios por cor; cache no kit) */
export function productMesh(kit: Kit, p: Product): THREE.Group {
  const g = new THREE.Group();
  for (const [kind, geo] of shapeGeo(p.shape)) {
    let mat: THREE.Material;
    if (kind === 'body') mat = kit.plain('pb-' + p.color, p.color, 0.32, 0, { envK: 0.9 });
    else if (kind === 'cap') mat = kit.plain('pc-' + p.cap, p.cap, 0.25, 0.15, { envK: 1 });
    else mat = partMat(kit, kind);
    const m = new THREE.Mesh(geo, mat);
    if (kind === 'glass') m.renderOrder = 2;
    m.castShadow = kind !== 'glass';
    g.add(m);
  }
  return g;
}

export { SHAPES };
