/* ============================================================
 *  DESENHA E VIRA! — corpos cannon-es a partir das peças (build.ts).
 *  Prismas convexos → ConvexPolyhedron (faces CCW vistas de fora),
 *  caixas/esferas direto. Massa = volume × densidade (limitada).
 * ============================================================ */
import * as CANNON from 'cannon-es';
import type { PhysPart } from './build';

export function partsToBody(parts: PhysPart[], scale: number, mass: number, material?: CANNON.Material): CANNON.Body {
  const b = new CANNON.Body({ mass, material });
  addParts(b, parts, scale);
  b.linearDamping = 0.05;
  b.angularDamping = 0.12;
  b.allowSleep = true;
  b.sleepSpeedLimit = 0.12;
  b.sleepTimeLimit = 0.8;
  return b;
}

export function addParts(b: CANNON.Body, parts: PhysPart[], scale: number): void {
  for (const p of parts) {
    if (p.k === 'poly') {
      const n = p.pts.length;
      // vértices centrados na peça (o cannon espera a origem da forma dentro dela)
      let cx = 0,
        cy = 0;
      for (const [x, y] of p.pts) (cx += x / n), (cy += y / n);
      const cz = (p.z0 + p.z1) / 2;
      const verts: CANNON.Vec3[] = [];
      for (const [x, y] of p.pts) verts.push(new CANNON.Vec3((x - cx) * scale, (y - cy) * scale, (p.z0 - cz) * scale));
      for (const [x, y] of p.pts) verts.push(new CANNON.Vec3((x - cx) * scale, (y - cy) * scale, (p.z1 - cz) * scale));
      const faces: number[][] = [];
      // topo (z1) CCW visto de +z; base invertida
      faces.push(Array.from({ length: n }, (_, i) => n + i));
      faces.push(Array.from({ length: n }, (_, i) => n - 1 - i));
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        faces.push([i, j, n + j, n + i]);
      }
      try {
        b.addShape(new CANNON.ConvexPolyhedron({ vertices: verts, faces }), new CANNON.Vec3(cx * scale, cy * scale, cz * scale));
      } catch {
        /* peça degenerada: ignora */
      }
    } else if (p.k === 'box') {
      b.addShape(
        new CANNON.Box(new CANNON.Vec3(Math.max(0.004, p.h[0] * scale), Math.max(0.004, p.h[1] * scale), Math.max(0.004, p.h[2] * scale))),
        new CANNON.Vec3(p.p[0] * scale, p.p[1] * scale, p.p[2] * scale),
        new CANNON.Quaternion(p.q[0], p.q[1], p.q[2], p.q[3]),
      );
    } else {
      b.addShape(new CANNON.Sphere(p.r * scale), new CANNON.Vec3(p.p[0] * scale, p.p[1] * scale, p.p[2] * scale));
    }
  }
  if (!b.shapes.length) b.addShape(new CANNON.Sphere(0.05 * scale));
}

export function rebuildShapes(b: CANNON.Body, parts: PhysPart[], scale: number, mass: number): void {
  while (b.shapes.length) b.removeShape(b.shapes[b.shapes.length - 1]);
  addParts(b, parts, scale);
  b.mass = mass;
  b.updateMassProperties();
  b.aabbNeedsUpdate = true;
}

export function massFor(volume: number, density: number, scale: number, max = 40): number {
  return Math.max(0.15, Math.min(max, volume * scale ** 3 * density));
}
