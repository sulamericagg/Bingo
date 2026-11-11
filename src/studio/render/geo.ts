/* ============================================================
 *  BLOOP STUDIO — geometrias das primitivas (cubo unitário) e dos traços.
 *  Cache por (tipo, detalhe): todas as peças iguais compartilham a mesma
 *  BufferGeometry (escala vai no Object3D).
 * ============================================================ */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PrimType, StrokePart } from '../format';

const cache = new Map<string, THREE.BufferGeometry>();

/** detalhe 0..3 (do nível de qualidade) → segmentos radiais */
export const segFor = (detail: number): number => [10, 14, 20, 28][Math.max(0, Math.min(3, detail))];

function flatPrism(tris: number[][], inside: THREE.Vector3): THREE.BufferGeometry {
  // tris: lista de triângulos [x,y,z, x,y,z, x,y,z] de um sólido convexo; a ordem é corrigida
  // para a normal apontar para fora (longe do ponto interno `inside`)
  const pos: number[] = [];
  const uv: number[] = [];
  for (const t of tris) {
    const a = new THREE.Vector3(t[0], t[1], t[2]);
    let b = new THREE.Vector3(t[3], t[4], t[5]);
    let c = new THREE.Vector3(t[6], t[7], t[8]);
    let n = b.clone().sub(a).cross(c.clone().sub(a));
    if (n.dot(a.clone().sub(inside)) < 0) {
      [b, c] = [c, b];
      n = n.negate();
    }
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    // uv planar simples pelo maior eixo da normal
    const ax = Math.abs(n.x) > Math.abs(n.y) ? (Math.abs(n.x) > Math.abs(n.z) ? 0 : 2) : Math.abs(n.y) > Math.abs(n.z) ? 1 : 2;
    for (const v of [a, b, c]) {
      if (ax === 0) uv.push(v.z + 0.5, v.y + 0.5);
      else if (ax === 1) uv.push(v.x + 0.5, v.z + 0.5);
      else uv.push(v.x + 0.5, v.y + 0.5);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function wedge(): THREE.BufferGeometry {
  const h = 0.5;
  // vértices: base (y=-h) 4 cantos, topo de trás (y=+h, z=+h) 2
  const A = [-h, -h, -h],
    B = [h, -h, -h],
    C = [h, -h, h],
    D = [-h, -h, h],
    E = [-h, h, h],
    F = [h, h, h];
  const T = (p: number[], q: number[], r: number[]) => [...p, ...q, ...r];
  return flatPrism([
    T(A, C, B), T(A, D, C), // base
    T(D, F, C), T(D, E, F), // trás (z+)
    T(A, B, F), T(A, F, E), // rampa
    T(A, E, D), // lado x-
    T(B, C, F), // lado x+
  ], new THREE.Vector3(0, -0.2, 0.2));
}

function extrudeX(shape: THREE.Shape, curveSeg: number): THREE.BufferGeometry {
  // forma no plano (u=z, v=y), extrudada 1 m ao longo de X
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments: curveSeg });
  g.translate(0, 0, -0.5);
  g.rotateY(-Math.PI / 2);
  return g;
}

function ramp(seg: number): THREE.BufferGeometry {
  // quarto de círculo côncavo: começa rente ao chão em z=-0.5 e sobe até y=+0.5 em z=+0.5
  const s = new THREE.Shape();
  s.moveTo(-0.5, -0.5);
  const n = Math.max(6, Math.round(seg / 2));
  for (let i = 1; i <= n; i++) {
    const a = (i / n) * (Math.PI / 2);
    s.lineTo(-0.5 + Math.sin(a), 0.5 - Math.cos(a));
  }
  s.lineTo(0.5, -0.5);
  s.lineTo(-0.5, -0.5);
  const g = extrudeX(s, n);
  return g;
}

function arch(seg: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.5, -0.5);
  s.lineTo(-0.5, 0.5);
  s.lineTo(0.5, 0.5);
  s.lineTo(0.5, -0.5);
  s.lineTo(0.3, -0.5);
  s.lineTo(0.3, 0);
  s.absarc(0, 0, 0.3, 0, Math.PI, false);
  s.lineTo(-0.3, -0.5);
  s.lineTo(-0.5, -0.5);
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: Math.round(seg / 2) });
  g.translate(0, 0, -0.5);
  return g;
}

function pipe(seg: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.absarc(0, 0, 0.5, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, 0.36, 0, Math.PI * 2, true);
  s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: seg });
  g.translate(0, 0, -0.5);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** Geometria unitária (cabe em 1×1×1) de uma primitiva — compartilhada, NÃO descarte. */
export function primGeometry(t: PrimType, detail = 2): THREE.BufferGeometry {
  const key = t + detail;
  let g = cache.get(key);
  if (g) return g;
  const seg = segFor(detail);
  switch (t) {
    case 'box':
      g = new THREE.BoxGeometry(1, 1, 1);
      break;
    case 'sphere':
      g = new THREE.SphereGeometry(0.5, seg, Math.max(6, Math.round(seg * 0.7)));
      break;
    case 'cylinder':
      g = new THREE.CylinderGeometry(0.5, 0.5, 1, seg);
      break;
    case 'cone':
      g = new THREE.CylinderGeometry(0, 0.5, 1, seg);
      break;
    case 'wedge':
      g = wedge();
      break;
    case 'torus':
      g = new THREE.TorusGeometry(0.375, 0.125, Math.max(6, Math.round(seg / 2)), seg);
      break;
    case 'capsule':
      g = new THREE.CapsuleGeometry(0.25, 0.5, Math.max(3, Math.round(seg / 4)), seg);
      g.scale(2, 1, 2);
      break;
    case 'ramp':
      g = ramp(seg);
      break;
    case 'arch':
      g = arch(seg);
      break;
    case 'pipe':
      g = pipe(seg);
      break;
  }
  g!.computeBoundingBox();
  g!.computeBoundingSphere();
  cache.set(key, g!);
  return g!;
}

/** Geometria do traço da Caneta 3D (nova a cada traço — descarte quando sair). */
export function strokeGeometry(p: Pick<StrokePart, 'pts' | 'w'>, detail = 2): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i + 2 < p.pts.length; i += 3) pts.push(new THREE.Vector3(p.pts[i], p.pts[i + 1], p.pts[i + 2]));
  if (pts.length < 2) pts.push(pts[0].clone().add(new THREE.Vector3(0.01, 0, 0)));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const radial = [5, 6, 8, 10][detail] ?? 8;
  const tub = new THREE.TubeGeometry(curve, Math.min(400, Math.max(4, pts.length * 3)), p.w, radial, false);
  const capSeg = radial + 2;
  const a = new THREE.SphereGeometry(p.w, capSeg, Math.max(4, capSeg >> 1));
  a.translate(pts[0].x, pts[0].y, pts[0].z);
  const b = new THREE.SphereGeometry(p.w, capSeg, Math.max(4, capSeg >> 1));
  const l = pts[pts.length - 1];
  b.translate(l.x, l.y, l.z);
  const g = mergeGeometries([tub, a, b]) ?? tub;
  if (g !== tub) tub.dispose();
  a.dispose();
  b.dispose();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** Libera o cache (ao sair do estúdio). */
export function disposeGeoCache(): void {
  for (const g of cache.values()) g.dispose();
  cache.clear();
}
