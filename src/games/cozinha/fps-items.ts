/* ============================================================
 *  COZINHA 3D — itens como modelinhos low-poly INSTANCIADOS.
 *  4 InstancedMesh (esfera, caixa, cilindro, cone) + 1 de brilho (chamas):
 *  todo ingrediente/prato/extintor é montado com 1–6 primitivas coloridas
 *  por instância. Zero alocação por quadro (matrizes/cores de rascunho).
 * ============================================================ */
import * as THREE from 'three';
import { shade } from '../../3d/common/tex';
import { INGS, RECIPES, compIng, type Shape } from './data';
import { Vis, visOf } from './art';
import { IK, type Item, type Sim } from './sim';

export const enum GK {
  Sph = 0,
  Box = 1,
  Cyl = 2,
  Cone = 3,
}
const M = new THREE.Matrix4();
const L = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();
const P = new THREE.Vector3();
const S = new THREE.Vector3();
const colCache = new Map<string, THREE.Color>();
export function col(hex: string): THREE.Color {
  let c = colCache.get(hex);
  if (!c) {
    c = new THREE.Color(hex);
    colCache.set(hex, c);
  }
  return c;
}
const BURNT = '#3a3046';
const PLATE = '#fffaf0';
const DIRTY = '#d9c8a6';

interface Pool {
  mesh: THREE.InstancedMesh;
  n: number;
}

export class Items3D {
  readonly group = new THREE.Group();
  private pools: Pool[] = [];
  private glow: Pool;
  private geos: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];
  constructor(standard: boolean, private sim: Sim) {
    const mat = standard ? new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0 }) : new THREE.MeshLambertMaterial();
    this.mats.push(mat);
    const g = [new THREE.SphereGeometry(1, 12, 8), new THREE.BoxGeometry(1, 1, 1), new THREE.CylinderGeometry(1, 1, 1, 14), new THREE.ConeGeometry(1, 1, 9)];
    g[1].translate(0, 0.5, 0);
    g[2].translate(0, 0.5, 0);
    g[3].translate(0, 0.5, 0);
    const caps = [520, 420, 380, 120];
    g.forEach((geo, i) => {
      this.geos.push(geo);
      const m = new THREE.InstancedMesh(geo, mat, caps[i]);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, col('#ffffff'));
      m.instanceColor!.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      this.group.add(m);
      this.pools.push({ mesh: m, n: 0 });
    });
    const gm = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.92, depthWrite: false });
    this.mats.push(gm);
    const gc = new THREE.InstancedMesh(g[3], gm, 90);
    gc.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    gc.setColorAt(0, col('#ffffff'));
    gc.frustumCulled = false;
    gc.count = 0;
    gc.renderOrder = 4;
    this.group.add(gc);
    this.glow = { mesh: gc, n: 0 };
  }
  begin(): void {
    for (const p of this.pools) p.n = 0;
    this.glow.n = 0;
  }
  end(): void {
    for (const p of [...this.pools, this.glow]) {
      p.mesh.count = p.n;
      p.mesh.instanceMatrix.needsUpdate = true;
      if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
    }
  }
  /** primitiva: base (mundo) × local(pos, giro, escala) */
  put(k: GK, base: THREE.Matrix4, x: number, y: number, z: number, sx: number, sy: number, sz: number, hex: string, rx = 0, ry = 0, rz = 0): void {
    const p = this.pools[k];
    if (p.n >= p.mesh.instanceMatrix.count) return;
    if (rx || ry || rz) Q.setFromEuler(E.set(rx, ry, rz));
    else Q.identity();
    L.compose(P.set(x, y, z), Q, S.set(sx, sy, sz));
    M.multiplyMatrices(base, L);
    p.mesh.setMatrixAt(p.n, M);
    p.mesh.setColorAt(p.n, col(hex));
    p.n++;
  }
  /** chama (cone sem luz) */
  flame(base: THREE.Matrix4, x: number, y: number, z: number, r: number, h: number, hex: string): void {
    const p = this.glow;
    if (p.n >= p.mesh.instanceMatrix.count) return;
    L.compose(P.set(x, y, z), Q.identity(), S.set(r, h, r));
    M.multiplyMatrices(base, L);
    p.mesh.setMatrixAt(p.n, M);
    p.mesh.setColorAt(p.n, col(hex));
    p.n++;
  }

  /* ------------------------------ ingredientes ------------------------------ */
  /** ingrediente com a base em (0,0,0) do `base`; s = escala */
  ing(base: THREE.Matrix4, c: number, burnt: boolean, s = 1, seed = 0): void {
    const g = INGS[compIng(c)];
    const vis = visOf(c, burnt);
    let [c0, c1, c2] = g.c;
    if (vis === Vis.Burnt) (c0 = BURNT), (c1 = '#241c30'), (c2 = '#4a4058');
    else if (vis === Vis.Cook) (c0 = shade(c0, g.shape === 'grain' ? 0.1 : -0.22)), (c1 = shade(c1, -0.2));
    if (vis === Vis.Chop) return this.chopped(base, c0, c2, s, seed);
    if (vis === Vis.Blend) {
      // vitamina: copinho com espuma colorida
      this.put(GK.Cyl, base, 0, 0, 0, 0.075 * s, 0.15 * s, 0.075 * s, '#e0feff');
      this.put(GK.Sph, base, 0, 0.15 * s, 0, 0.07 * s, 0.035 * s, 0.07 * s, shade(c0, 0.25));
      return;
    }
    this.shape(base, g.shape, c0, c1, c2, s, vis === Vis.Cook);
  }
  private chopped(base: THREE.Matrix4, c0: string, c2: string, s: number, seed: number): void {
    // pedacinhos espalhados (posições fixas por semente: sem tremer)
    const o = (seed * 0.37) % 1;
    for (let i = 0; i < 5; i++) {
      const a = i * 1.26 + o * 6;
      const r = i === 0 ? 0 : 0.055;
      this.put(GK.Box, base, Math.cos(a) * r * s, 0, Math.sin(a) * r * s, 0.05 * s, 0.04 * s, 0.05 * s, i === 4 ? c2 : c0, 0, a, 0);
    }
  }
  private shape(b: THREE.Matrix4, sh: Shape, c0: string, c1: string, c2: string, s: number, cooked: boolean): void {
    switch (sh) {
      case 'round':
        this.put(GK.Sph, b, 0, 0.085 * s, 0, 0.09 * s, 0.085 * s, 0.09 * s, c0);
        this.put(GK.Cyl, b, 0, 0.165 * s, 0, 0.012 * s, 0.035 * s, 0.012 * s, '#6a4a2a');
        this.put(GK.Sph, b, 0.03 * s, 0.17 * s, 0, 0.035 * s, 0.012 * s, 0.02 * s, c2, 0, 0, 0.4);
        break;
      case 'berry':
        this.put(GK.Sph, b, 0, 0.055 * s, 0, 0.06 * s, 0.065 * s, 0.06 * s, c0);
        this.put(GK.Cone, b, 0, 0.1 * s, 0, 0.04 * s, 0.03 * s, 0.04 * s, c2, Math.PI);
        break;
      case 'leaf':
        for (let i = 0; i < 4; i++) {
          const a = i * 1.57;
          this.put(GK.Sph, b, Math.cos(a) * 0.04 * s, 0.07 * s, Math.sin(a) * 0.04 * s, 0.075 * s, 0.06 * s, 0.075 * s, i % 2 ? c0 : c1);
        }
        this.put(GK.Sph, b, 0, 0.1 * s, 0, 0.06 * s, 0.05 * s, 0.06 * s, c2);
        break;
      case 'block':
        this.put(GK.Box, b, 0, 0, 0, 0.17 * s, 0.1 * s, 0.13 * s, c0);
        this.put(GK.Sph, b, 0.04 * s, 0.1 * s, 0.02 * s, 0.022 * s, 0.01 * s, 0.022 * s, c1);
        this.put(GK.Sph, b, -0.05 * s, 0.1 * s, -0.03 * s, 0.016 * s, 0.01 * s, 0.016 * s, c1);
        break;
      case 'long':
        this.put(GK.Cyl, b, -0.11 * s, 0.04 * s, 0, 0.04 * s, 0.2 * s, 0.04 * s, c0, 0, 0, -Math.PI / 2);
        this.put(GK.Sph, b, 0.09 * s, 0.04 * s, 0, 0.04 * s, 0.04 * s, 0.04 * s, c0);
        this.put(GK.Sph, b, -0.12 * s, 0.05 * s, 0, 0.03 * s, 0.02 * s, 0.045 * s, c2);
        break;
      case 'bun':
        this.put(GK.Cyl, b, 0, 0, 0, 0.1 * s, 0.04 * s, 0.1 * s, c1);
        this.put(GK.Sph, b, 0, 0.04 * s, 0, 0.1 * s, 0.07 * s, 0.1 * s, c0);
        this.put(GK.Sph, b, 0.03 * s, 0.1 * s, 0.02 * s, 0.012 * s, 0.006 * s, 0.008 * s, c2);
        this.put(GK.Sph, b, -0.03 * s, 0.1 * s, -0.01 * s, 0.012 * s, 0.006 * s, 0.008 * s, c2);
        break;
      case 'meat':
        this.put(GK.Sph, b, 0, 0.035 * s, 0, 0.11 * s, 0.04 * s, 0.085 * s, cooked ? shade(c0, -0.35) : c0);
        this.put(GK.Sph, b, 0.03 * s, 0.06 * s, 0.01 * s, 0.04 * s, 0.015 * s, 0.025 * s, c2);
        break;
      case 'fish':
        this.put(GK.Sph, b, 0, 0.05 * s, 0, 0.11 * s, 0.05 * s, 0.055 * s, c0);
        this.put(GK.Cone, b, -0.14 * s, 0.05 * s, 0, 0.045 * s, 0.07 * s, 0.02 * s, c1, 0, 0, Math.PI / 2);
        this.put(GK.Sph, b, 0.07 * s, 0.07 * s, 0.035 * s, 0.012 * s, 0.012 * s, 0.012 * s, '#2a0b5c');
        break;
      case 'grain':
        // saquinho aberto
        this.put(GK.Cyl, b, 0, 0, 0, 0.08 * s, 0.13 * s, 0.08 * s, cooked ? '#ffffff' : '#e8d3a8');
        this.put(GK.Sph, b, 0, 0.13 * s, 0, 0.075 * s, 0.035 * s, 0.075 * s, c0);
        this.put(GK.Cyl, b, 0, 0.09 * s, 0, 0.083 * s, 0.015 * s, 0.083 * s, c1);
        break;
      case 'egg':
        this.put(GK.Sph, b, 0, 0.07 * s, 0, 0.06 * s, 0.075 * s, 0.06 * s, cooked ? '#ffffff' : c0);
        if (cooked) this.put(GK.Sph, b, 0, 0.1 * s, 0, 0.035 * s, 0.025 * s, 0.035 * s, c2);
        break;
      case 'dough':
        this.put(GK.Sph, b, 0, 0.035 * s, 0, 0.11 * s, 0.045 * s, 0.11 * s, c0);
        this.put(GK.Sph, b, 0.03 * s, 0.07 * s, 0.03 * s, 0.02 * s, 0.01 * s, 0.02 * s, c2);
        this.put(GK.Sph, b, -0.04 * s, 0.07 * s, 0 * s, 0.02 * s, 0.01 * s, 0.02 * s, c2);
        break;
      case 'bottle':
        this.put(GK.Cyl, b, 0, 0, 0, 0.05 * s, 0.17 * s, 0.05 * s, c0);
        this.put(GK.Cyl, b, 0, 0.06 * s, 0, 0.052 * s, 0.05 * s, 0.052 * s, c2);
        this.put(GK.Cyl, b, 0, 0.17 * s, 0, 0.025 * s, 0.04 * s, 0.025 * s, c1);
        break;
      case 'drop':
        this.put(GK.Sph, b, 0, 0.04 * s, 0, 0.09 * s, 0.045 * s, 0.09 * s, c0);
        break;
      case 'sheet':
        this.put(GK.Box, b, 0, 0, 0, 0.2 * s, 0.02 * s, 0.16 * s, c0);
        this.put(GK.Box, b, 0, 0.02 * s, 0, 0.16 * s, 0.006 * s, 0.12 * s, c2);
        break;
      case 'nut':
        for (let i = 0; i < 5; i++) {
          const a = i * 1.3;
          const r = i ? 0.04 : 0;
          this.put(GK.Sph, b, Math.cos(a) * r * s, (i ? 0.025 : 0.05) * s, Math.sin(a) * r * s, 0.035 * s, 0.03 * s, 0.035 * s, i % 2 ? c1 : c0);
        }
        break;
    }
  }

  /* ------------------------------ item completo ------------------------------ */
  item(base: THREE.Matrix4, it: Item, s = 1): void {
    switch (it.k) {
      case IK.Ing:
        this.ing(base, it.c, it.burnt, s, it.id);
        break;
      case IK.Plate:
        this.plate(base, it.parts, s);
        break;
      case IK.Dirty:
        for (let i = 0; i < Math.min(5, Math.max(1, it.n)); i++) this.dirtyPlate(base, i * 0.032 * s, s, i);
        break;
      case IK.Ext:
        this.put(GK.Cyl, base, 0, 0, 0, 0.065 * s, 0.3 * s, 0.065 * s, '#ff3e5e');
        this.put(GK.Sph, base, 0, 0.3 * s, 0, 0.065 * s, 0.04 * s, 0.065 * s, '#ff3e5e');
        this.put(GK.Cyl, base, 0, 0.32 * s, 0, 0.02 * s, 0.06 * s, 0.02 * s, '#dcd6f0');
        this.put(GK.Box, base, 0.04 * s, 0.37 * s, 0, 0.12 * s, 0.025 * s, 0.03 * s, '#2a2238');
        this.put(GK.Cone, base, 0.11 * s, 0.355 * s, 0, 0.022 * s, 0.05 * s, 0.022 * s, '#2a2238', 0, 0, -Math.PI / 2);
        this.put(GK.Box, base, 0, 0.12 * s, 0.062 * s, 0.07 * s, 0.07 * s, 0.006 * s, '#ffffff');
        break;
    }
  }
  plate(base: THREE.Matrix4, parts: number[], s = 1): void {
    const m = parts.length ? this.sim.matchOrder(parts) : null;
    const dish = m ? RECIPES[m.r].dish : 'plate';
    if (dish === 'bowl') {
      this.put(GK.Cyl, base, 0, 0, 0, 0.12 * s, 0.09 * s, 0.12 * s, '#9fd0ff');
      this.put(GK.Cyl, base, 0, 0.088 * s, 0, 0.105 * s, 0.004 * s, 0.105 * s, '#fffaf0');
    } else if (dish === 'cup') {
      this.put(GK.Cyl, base, 0, 0, 0, 0.08 * s, 0.17 * s, 0.08 * s, '#e0feff');
      this.put(GK.Cyl, base, 0.08 * s, 0.05 * s, 0, 0.015 * s, 0.08 * s, 0.015 * s, '#e0feff');
    } else {
      this.put(GK.Cyl, base, 0, 0, 0, 0.17 * s, 0.025 * s, 0.17 * s, PLATE);
      this.put(GK.Cyl, base, 0, 0.02 * s, 0, 0.13 * s, 0.008 * s, 0.13 * s, '#efe6d6');
    }
    const n = parts.length;
    const y = dish === 'bowl' ? 0.05 : dish === 'cup' ? 0.1 : 0.025;
    for (let i = 0; i < n; i++) {
      const a = (i / Math.max(1, n)) * 6.283 + 0.5;
      const r = n === 1 ? 0 : dish === 'cup' ? 0.02 : 0.065;
      // sub-base para cada parte: desloca a matriz de rascunho
      L.compose(P.set(Math.cos(a) * r * s, y * s, Math.sin(a) * r * s), Q.identity(), S.set(1, 1, 1));
      PART.multiplyMatrices(base, L);
      this.ing(PART, parts[i], false, (dish === 'cup' ? 0.45 : 0.62) * s, i + 3);
    }
  }
  dirtyPlate(base: THREE.Matrix4, y: number, s: number, i: number): void {
    this.put(GK.Cyl, base, 0, y, 0, 0.16 * s, 0.025 * s, 0.16 * s, DIRTY);
    this.put(GK.Sph, base, (i % 2 ? 0.05 : -0.04) * s, y + 0.025 * s, 0.03 * s, 0.05 * s, 0.008 * s, 0.035 * s, '#8a6a3a');
    this.put(GK.Sph, base, -0.02 * s, y + 0.025 * s, -0.06 * s, 0.03 * s, 0.006 * s, 0.03 * s, '#a8c84a');
  }
  cleanPlate(base: THREE.Matrix4, y: number, s: number): void {
    this.put(GK.Cyl, base, 0, y, 0, 0.17 * s, 0.025 * s, 0.17 * s, PLATE);
  }
  dispose(): void {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    for (const p of [...this.pools, this.glow]) p.mesh.dispose();
    this.group.parent?.remove(this.group);
  }
}
const PART = new THREE.Matrix4();
