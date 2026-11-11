/* ============================================================
 *  Montador simples para as cenas dos modos (recepção, corredores):
 *  caixas/planos com material, colisores, texturas repetidas (clones
 *  de texturas do nightkit — o cache dele continua intacto), e
 *  descarte de tudo que foi criado aqui.
 * ============================================================ */
import * as THREE from 'three';
import type { Box } from '../core/world';
import { Mats } from './common';

export class Builder {
  readonly mats = new Mats();
  readonly cols: Box[] = [];
  private geos = new Map<string, THREE.BufferGeometry>();
  private texs: THREE.Texture[] = [];

  geo(k: string, f: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let g = this.geos.get(k);
    if (!g) this.geos.set(k, (g = f()));
    return g;
  }
  boxG(w: number, h: number, d: number): THREE.BufferGeometry {
    return this.geo(`b${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d));
  }
  planeG(w: number, h: number): THREE.BufferGeometry {
    return this.geo(`p${w}|${h}`, () => new THREE.PlaneGeometry(w, h));
  }
  /** caixa (centro x,y,z); `col` = colisor */
  box(p: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, col = false, ry = 0): THREE.Mesh {
    const o = new THREE.Mesh(this.boxG(w, h, d), m);
    o.position.set(x, y, z);
    o.rotation.y = ry;
    p.add(o);
    if (col) this.collide(o);
    return o;
  }
  plane(p: THREE.Object3D, w: number, h: number, x: number, y: number, z: number, m: THREE.Material, ry = 0, rx = 0): THREE.Mesh {
    const o = new THREE.Mesh(this.planeG(w, h), m);
    o.position.set(x, y, z);
    o.rotation.set(rx, ry, 0, 'YXZ');
    p.add(o);
    return o;
  }
  /** caixa de colisão a partir do objeto (mundo) */
  collide(o: THREE.Object3D): Box {
    o.updateWorldMatrix(true, true);
    const b = new THREE.Box3().setFromObject(o);
    const bx: Box = { min: { x: b.min.x, y: b.min.y, z: b.min.z }, max: { x: b.max.x, y: b.max.y, z: b.max.z } };
    this.cols.push(bx);
    return bx;
  }
  colBox(x0: number, z0: number, x1: number, z1: number, y0 = 0, y1 = 2.5): Box {
    const b: Box = { min: { x: Math.min(x0, x1), y: y0, z: Math.min(z0, z1) }, max: { x: Math.max(x0, x1), y: y1, z: Math.max(z0, z1) } };
    this.cols.push(b);
    return b;
  }
  /** cópia de textura com repetição própria */
  rep(t: THREE.Texture, rx: number, ry: number): THREE.Texture {
    const c = t.clone();
    c.wrapS = c.wrapT = THREE.RepeatWrapping;
    c.repeat.set(rx, ry);
    c.needsUpdate = true;
    this.texs.push(c);
    return c;
  }
  own(t: THREE.Texture): THREE.Texture {
    this.texs.push(t);
    return t;
  }
  dispose(): void {
    this.geos.forEach((g) => g.dispose());
    this.geos.clear();
    for (const t of this.texs) t.dispose();
    this.texs = [];
    this.mats.dispose();
  }
}
