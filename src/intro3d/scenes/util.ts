/* Peças comuns das cenas: o Bloop "ator" (billboard com squash e sombra), formas extrudadas. */
import * as THREE from 'three';
import type { PlayerPose } from '../../game/character';
import type { Kit } from '../kit';

/** Bloop: sprite com squash/stretch e sombra de contato */
export class Actor {
  readonly spr: THREE.Sprite;
  readonly shadow: THREE.Mesh;
  /** altura do corpo (diâmetro) em unidades */
  readonly body: number;
  constructor(
    k: Kit,
    readonly size = 1.6,
    mood: PlayerPose['mood'] = 'happy',
    parent: THREE.Object3D = k.scene,
  ) {
    this.spr = k.bloop(size, mood, parent);
    this.shadow = k.blob(size * 0.32, 0.4, parent);
    this.body = size * 0.68;
  }
  /**
   * Põe os "pés" em (x, y, z). sq > 0 estica (no ar), sq < 0 achata (pouso).
   * gy = altura do chão sob ele (sombra); padrão = y.
   */
  at(x: number, y: number, z: number, sq = 0, gy = y): void {
    const sy = 1 + sq;
    const sx = 1 - sq * 0.6;
    this.spr.scale.set(this.size * sx, this.size * sy, 1);
    this.spr.position.set(x, y + this.size * 0.34 * sy, z);
    const hgt = Math.max(0, y - gy);
    const k = 1 / (1 + hgt * 0.35);
    this.shadow.position.set(x, gy + 0.02, z);
    this.shadow.scale.setScalar(k);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.42 * k;
  }
  /** pés do sprite (y) */
  get y(): number {
    return this.spr.position.y - this.spr.scale.y * 0.34;
  }
}

/** pulo em parábola de a até b (t em [t0,t1]); devolve [x,y,z,progresso] */
export function hopPos(t: number, t0: number, t1: number, a: [number, number, number], b: [number, number, number], h: number, out: number[]): number[] {
  const u = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
  out[0] = a[0] + (b[0] - a[0]) * u;
  out[1] = a[1] + (b[1] - a[1]) * u + 4 * u * (1 - u) * h;
  out[2] = a[2] + (b[2] - a[2]) * u;
  out[3] = u;
  return out;
}

/** squash de pouso: achata logo após tLand e volta com mola */
export function landSq(t: number, tLand: number, amt = 0.35): number {
  const d = t - tLand;
  if (d < 0 || d > 0.6) return 0;
  return -amt * Math.exp(-d * 9) * Math.cos(d * 22);
}

export function starShape(r: number, inner = 0.45, n = 5): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 + Math.PI / 2;
    const rr = i % 2 ? r * inner : r;
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i) s.lineTo(x, y);
    else s.moveTo(x, y);
  }
  s.closePath();
  return s;
}
export function heartShape(r: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, -r);
  s.bezierCurveTo(r * 0.2, -r * 0.7, r * 1.1, -r * 0.2, r * 1.0, r * 0.35);
  s.bezierCurveTo(r * 0.95, r * 0.95, r * 0.25, r * 1.05, 0, r * 0.55);
  s.bezierCurveTo(-r * 0.25, r * 1.05, -r * 0.95, r * 0.95, -r * 1.0, r * 0.35);
  s.bezierCurveTo(-r * 1.1, -r * 0.2, -r * 0.2, -r * 0.7, 0, -r);
  return s;
}
/** forma extrudada e centrada (estrela, coração) com bisel */
export function extrude(k: Kit, sh: THREE.Shape, depth: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: depth * 0.35, bevelSize: depth * 0.3, bevelSegments: k.hi ? 2 : 1, curveSegments: k.hi ? 8 : 4 });
  g.center();
  return k.ownGeo(g);
}

/** malha de cor única */
export function solidMesh(k: Kit, g: THREE.BufferGeometry, color: string, o: Parameters<Kit['solid']>[1] = {}, parent: THREE.Object3D = k.scene): THREE.Mesh {
  return k.mesh(g, k.solid(color, o), parent);
}

/** terreno ondulado em grade (cor por altura), flat-shaded */
export function terrain(k: Kit, w: number, d: number, sx: number, sz: number, h: (x: number, z: number) => number, col: (y: number, x: number, z: number) => string): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, d, sx, sz);
  g.rotateX(-Math.PI / 2);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setY(i, h(p.getX(i), p.getZ(i)));
  const ng = g.toNonIndexed();
  g.dispose();
  const q = ng.getAttribute('position');
  const c = new Float32Array(q.count * 3);
  const C = new THREE.Color();
  for (let i = 0; i < q.count; i += 3) {
    const y = (q.getY(i) + q.getY(i + 1) + q.getY(i + 2)) / 3;
    const x = (q.getX(i) + q.getX(i + 1) + q.getX(i + 2)) / 3;
    const z = (q.getZ(i) + q.getZ(i + 1) + q.getZ(i + 2)) / 3;
    C.set(col(y, x, z)).convertSRGBToLinear();
    for (let j = 0; j < 3; j++) c.set([C.r, C.g, C.b], (i + j) * 3);
  }
  ng.setAttribute('color', new THREE.BufferAttribute(c, 3));
  ng.computeVertexNormals();
  return k.ownGeo(ng);
}
