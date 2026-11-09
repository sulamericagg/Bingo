/* ============================================================
 *  Construtor de geometria estática MESCLADA com cor por vértice.
 *  Um cenário inteiro (bancadas, paredes, fogões...) vira 1–2 malhas:
 *  poucas chamadas de desenho mesmo em celular fraco.
 * ============================================================ */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const TC = new THREE.Color();

export class GeoBuilder {
  private list: THREE.BufferGeometry[] = [];
  /** escurece a base das peças (oclusão "assada") */
  ao = true;
  private push(g: THREE.BufferGeometry, col: string, x: number, y: number, z: number, rx: number, ry: number, rz: number): this {
    if (rx) g.rotateX(rx);
    if (rz) g.rotateZ(rz);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    const ng = g.index ? g.toNonIndexed() : g;
    if (ng !== g) g.dispose();
    ng.deleteAttribute('uv');
    const pos = ng.getAttribute('position');
    const n = pos.count;
    const c = new Float32Array(n * 3);
    TC.set(col).convertSRGBToLinear();
    for (let i = 0; i < n; i++) {
      const k = this.ao ? 0.72 + 0.28 * Math.min(1, Math.max(0, pos.getY(i) / 0.35)) : 1;
      c[i * 3] = TC.r * k;
      c[i * 3 + 1] = TC.g * k;
      c[i * 3 + 2] = TC.b * k;
    }
    ng.setAttribute('color', new THREE.BufferAttribute(c, 3));
    this.list.push(ng);
    return this;
  }
  /** caixa com (x,y,z) = centro da BASE */
  box(w: number, h: number, d: number, x: number, y: number, z: number, col: string, ry = 0, rx = 0, rz = 0): this {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, h / 2, 0);
    return this.push(g, col, x, y, z, rx, ry, rz);
  }
  cyl(rt: number, rb: number, h: number, x: number, y: number, z: number, col: string, seg = 12, rx = 0, rz = 0): this {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg);
    g.translate(0, h / 2, 0);
    return this.push(g, col, x, y, z, rx, 0, rz);
  }
  sph(r: number, x: number, y: number, z: number, col: string, sx = 1, sy = 1, sz = 1, seg = 10): this {
    const g = new THREE.SphereGeometry(r, seg, Math.max(5, Math.round(seg * 0.7)));
    g.scale(sx, sy, sz);
    return this.push(g, col, x, y, z, 0, 0, 0);
  }
  torus(r: number, tube: number, x: number, y: number, z: number, col: string, rx = Math.PI / 2): this {
    const g = new THREE.TorusGeometry(r, tube, 6, 18);
    return this.push(g, col, x, y, z, rx, 0, 0);
  }
  get empty(): boolean {
    return !this.list.length;
  }
  /** mescla tudo (e libera as peças) */
  build(): THREE.BufferGeometry {
    const g = this.list.length ? mergeGeometries(this.list, false)! : new THREE.BufferGeometry();
    for (const p of this.list) p.dispose();
    this.list = [];
    g.computeBoundingSphere();
    return g;
  }
}
