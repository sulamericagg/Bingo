/* ============================================================
 *  MUNDO ABERTO — modelos: árvores dos novos biomas (cacto, acácia,
 *  salgueiro, bambu, pinheiro nevado), pedras e os 8 veículos.
 *  Tudo low-poly com cor por vértice (uma malha por espécie → instâncias).
 * ============================================================ */
import * as THREE from 'three';
import { geoms as base, lambert, mat4, mergeParts, shade, treeGeometry, INK } from '../fps/models';
import type { Species } from '../data';
import { WSPECIES } from './biomes';
import { natureTree, type TreeKind, type TreeSpec } from '../../../3d/nature';

type P = { g: THREE.BufferGeometry; c: string; m: THREE.Matrix4; ao?: number; groove?: number };

/** geometria da espécie do mundo aberto (lod 0 = perto, 1 = longe) */
export function wTreeGeometry(sp: number, lod: number, lite: boolean): THREE.BufferGeometry {
  const s = WSPECIES[sp];
  const h = s.h;
  const parts: P[] = [];
  const add = (g: THREE.BufferGeometry, c: string, m: THREE.Matrix4, ao = 0, groove = 0) => parts.push({ g, c, m, ao, groove });
  const nt = (kind: TreeKind, extra: Partial<TreeSpec> = {}) =>
    natureTree({ kind, h, trunk: s.trunk, trunkDark: s.trunkDark, leaf: s.leaf, leaf2: s.leaf2, seed: sp * 13 + 5, lod: lod ? 1 : 0, ...extra });
  if (sp === 12) return nt('birch');
  switch (s.shape) {
    case 'snowpine':
      return nt('snowpine');
    case 'acacia':
      return nt('acacia');
    case 'willow':
      return nt('willow');
    case 'cactus': {
      const cyl = base.cyl;
      add(cyl, s.trunk, mat4(0, h * 0.42, 0, 0.42, h * 0.84, 0.42));
      add(base.cap, s.trunk, mat4(0, h * 0.84, 0, 0.42, 0.35, 0.42));
      for (const sd of [-1, 1]) {
        const y0 = h * (sd > 0 ? 0.38 : 0.5);
        add(cyl, s.trunkDark, mat4(sd * 0.55, y0, 0, 0.26, 0.3, 0.26, 0, 0, Math.PI / 2));
        add(cyl, s.trunk, mat4(sd * 0.82, y0 + h * 0.14, 0, 0.27, h * 0.3, 0.27));
        add(base.cap, s.trunk, mat4(sd * 0.82, y0 + h * 0.29, 0, 0.27, 0.22, 0.27));
      }
      if (!lod) {
        add(base.ico, s.leaf, mat4(0, h * 0.84 + 0.36, 0, 0.18, 0.12, 0.18));
        add(base.ico, s.leaf2, mat4(0.82, h * 0.67 + 0.25, 0, 0.12, 0.08, 0.12));
      }
      break;
    }
    case 'bamboo':
      return nt('bamboo');
    default:
      return treeGeometry(s as unknown as Species, 0, lod, lite);
  }
  return mergeParts(parts);
}

export function rockGeometry(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 0.8 + Math.abs(Math.sin(x * 3.1 + z * 2.3) * Math.cos(y * 2.7)) * 0.35;
    p.setXYZ(i, x * k * 1.2, Math.max(-0.3, y * k * 0.7), z * k);
  }
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  const col: number[] = [];
  for (let i = 0; i < ng.getAttribute('position').count; i++) {
    const y = ng.getAttribute('position').getY(i);
    const k = 0.75 + Math.max(0, y) * 0.35;
    col.push(k, k, k);
  }
  ng.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return ng;
}

/** tora solta (eixo X), cor por instância */
export function looseLogGeometry(): THREE.BufferGeometry {
  const parts: P[] = [
    { g: base.cyl, c: '#ffffff', m: mat4(0, 0, 0, 0.26, 1.4, 0.26, 0, 0, Math.PI / 2) },
    { g: base.cyl, c: '#ffe8c0', m: mat4(0.71, 0, 0, 0.22, 0.03, 0.22, 0, 0, Math.PI / 2) },
    { g: base.cyl, c: '#ffe8c0', m: mat4(-0.71, 0, 0, 0.22, 0.03, 0.22, 0, 0, Math.PI / 2) },
  ];
  return mergeParts(parts);
}

/* ------------------------------ veículos ------------------------------ */

export const enum VK {
  Quad = 0,
  Tractor = 1,
  Truck = 2,
  Excavator = 3,
  Dozer = 4,
  Heli = 5,
  Boat = 6,
  Forklift = 7,
}

export interface WVehModel {
  g: THREE.Group;
  /** onde as toras carregadas aparecem (local) */
  bed: THREE.Object3D;
  seat: THREE.Vector3;
  wheels: THREE.Object3D[];
  /** braço/caçamba/rotor/garfo animados */
  arm: THREE.Object3D | null;
  rotor: THREE.Object3D | null;
  len: number;
  wid: number;
}

/** frente do veículo = +X local */
export function wVehicleModel(k: number, paint: string): WVehModel {
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
  const cyl = (r: number, h: number, c: string, x: number, y: number, z: number, rx = 0, rz = 0, parent: THREE.Object3D = g) => {
    const m = new THREE.Mesh(base.cyl, lambert(c));
    m.scale.set(r, h, r);
    m.position.set(x, y, z);
    m.rotation.set(rx, 0, rz);
    parent.add(m);
    return m;
  };
  const wheel = (x: number, y: number, z: number, r: number, w = 0.3, parent: THREE.Object3D = g) => {
    const p = new THREE.Group();
    p.position.set(x, y, z);
    cyl(r, w, '#2a2238', 0, 0, 0, Math.PI / 2, 0, p);
    cyl(r * 0.45, w + 0.02, '#ffd34a', 0, 0, 0, Math.PI / 2, 0, p);
    box(r * 1.4, r * 0.16, w + 0.04, '#ffffff', 0, 0, 0, p);
    parent.add(p);
    wheels.push(p);
  };
  const track = (x: number, z: number, L: number) => {
    box(L, 0.55, 0.5, '#2a2238', x, 0.3, z);
    for (let i = 0; i < 4; i++) wheel(x - L / 2 + 0.35 + (i * (L - 0.7)) / 3, 0.3, z, 0.22, 0.52);
  };
  const bed = new THREE.Object3D();
  const seat = new THREE.Vector3(0, 1.6, 0);
  let arm: THREE.Object3D | null = null;
  let rotor: THREE.Object3D | null = null;
  let len = 3;
  let wid = 1.8;
  const dark = shade(paint, -0.25);
  switch (k) {
    case VK.Quad: {
      box(1.7, 0.35, 0.9, paint, 0, 0.6, 0);
      box(0.6, 0.2, 0.7, INK, -0.1, 0.85, 0);
      box(0.5, 0.25, 1.0, dark, 0.65, 0.8, 0);
      box(0.08, 0.5, 0.08, '#5a5a6a', 0.45, 1.05, 0);
      box(0.08, 0.08, 0.8, INK, 0.45, 1.3, 0);
      for (const dx of [-0.6, 0.6]) for (const dz of [-0.6, 0.6]) wheel(dx, 0.36, dz, 0.36, 0.32);
      // bagageiro
      box(0.6, 0.06, 0.9, '#5a5a6a', -0.7, 0.9, 0);
      bed.position.set(-0.7, 0.95, 0);
      seat.set(-0.15, 1.65, 0);
      len = 2;
      wid = 1.4;
      break;
    }
    case VK.Tractor: {
      box(1.6, 0.6, 0.9, paint, 0.5, 1.0, 0);
      box(0.9, 1.0, 1.1, paint, -0.4, 1.5, 0);
      box(0.85, 0.08, 1.2, '#ffffff', -0.4, 2.05, 0);
      box(0.06, 0.6, 1.0, '#bfe8ff', 0.06, 1.65, 0);
      cyl(0.07, 0.6, INK, 0.9, 1.55, 0.25);
      wheel(-0.5, 0.7, 0.75, 0.7, 0.4);
      wheel(-0.5, 0.7, -0.75, 0.7, 0.4);
      wheel(1.0, 0.42, 0.6, 0.42, 0.3);
      wheel(1.0, 0.42, -0.6, 0.42, 0.3);
      // reboque
      box(0.6, 0.08, 0.08, '#5a5a6a', -1.2, 0.6, 0);
      box(2.6, 0.12, 1.6, '#c88a4a', -2.8, 0.85, 0);
      for (const s of [-1, 1]) box(2.6, 0.4, 0.08, '#a86a3a', -2.8, 1.1, s * 0.8);
      box(0.08, 0.4, 1.6, '#a86a3a', -4.1, 1.1, 0);
      wheel(-2.8, 0.45, 0.9, 0.45, 0.25);
      wheel(-2.8, 0.45, -0.9, 0.45, 0.25);
      bed.position.set(-2.8, 0.95, 0);
      seat.set(-0.45, 2.3, 0);
      len = 3.2;
      wid = 1.8;
      break;
    }
    case VK.Truck: {
      box(1.4, 1.3, 2.0, paint, 2.0, 1.45, 0);
      box(0.06, 0.6, 1.8, '#bfe8ff', 2.71, 1.75, 0);
      box(5.2, 0.35, 1.6, '#3a3050', -0.3, 0.75, 0);
      // fueiros (estacas) da carroceria
      for (const x of [-2.6, -1.2, 0.3]) for (const s of [-1, 1]) box(0.12, 1.2, 0.12, '#5a5a6a', x, 1.4, s * 0.85);
      box(0.15, 1.6, 1.8, '#5a5a6a', 1.15, 1.6, 0);
      // grua
      const crane = new THREE.Group();
      crane.position.set(0.9, 1.5, 0);
      g.add(crane);
      box(0.12, 1.6, 0.12, '#ffcf2e', 0, 0.8, 0, crane);
      box(1.8, 0.12, 0.12, '#ffcf2e', -0.9, 1.6, 0, crane);
      arm = crane;
      for (const x of [2.0, -1.0, -2.2]) for (const s of [-1, 1]) wheel(x, 0.5, s * 0.92, 0.5, 0.35);
      bed.position.set(-1.2, 1.0, 0);
      seat.set(1.9, 2.55, 0);
      len = 5.6;
      wid = 2.1;
      break;
    }
    case VK.Excavator: {
      track(0, 0.8, 2.6);
      track(0, -0.8, 2.6);
      const top = new THREE.Group();
      top.position.set(0, 0.7, 0);
      g.add(top);
      box(2.0, 0.7, 1.7, paint, -0.2, 0.4, 0, top);
      box(0.9, 0.9, 0.9, paint, 0.3, 1.2, 0.35, top);
      box(0.05, 0.6, 0.8, '#bfe8ff', 0.76, 1.25, 0.35, top);
      box(0.6, 0.5, 1.6, '#5a5a6a', -1.1, 0.5, 0, top);
      const boom = new THREE.Group();
      boom.position.set(0.7, 0.9, -0.35);
      top.add(boom);
      box(2.2, 0.25, 0.25, '#ffcf2e', 1.1, 0.4, 0, boom).rotation.z = 0.35;
      const stick = new THREE.Group();
      stick.position.set(2.1, 0.8, 0);
      boom.add(stick);
      box(0.22, 1.6, 0.22, '#ffcf2e', 0, -0.8, 0, stick);
      box(0.6, 0.45, 0.8, '#5a5a6a', 0.2, -1.65, 0, stick);
      arm = boom;
      bed.position.set(-0.6, 1.5, 0);
      seat.set(0.25, 2.55, 0.35);
      len = 3;
      wid = 2.2;
      break;
    }
    case VK.Dozer: {
      track(0, 0.85, 2.6);
      track(0, -0.85, 2.6);
      box(2.2, 0.8, 1.4, paint, -0.1, 1.0, 0);
      box(0.9, 0.9, 1.1, paint, -0.5, 1.85, 0);
      box(0.05, 0.6, 1.0, '#bfe8ff', -0.04, 1.9, 0);
      cyl(0.08, 0.7, INK, 0.6, 1.7, 0.4);
      const blade = new THREE.Group();
      blade.position.set(1.6, 0.6, 0);
      g.add(blade);
      box(0.25, 1.0, 2.4, '#ffcf2e', 0.2, 0, 0, blade);
      box(0.4, 0.1, 2.4, '#8a8a9a', 0.3, -0.5, 0, blade);
      for (const s of [-1, 1]) box(0.9, 0.15, 0.15, '#5a5a6a', -0.3, 0.1, s * 0.7, blade);
      arm = blade;
      bed.position.set(-1.0, 1.5, 0);
      seat.set(-0.55, 2.65, 0);
      len = 3.4;
      wid = 2.4;
      break;
    }
    case VK.Heli: {
      const body = new THREE.Mesh(base.ico1, lambert(paint));
      body.scale.set(1.5, 0.95, 0.95);
      body.position.set(0.3, 1.3, 0);
      g.add(body);
      const glass = new THREE.Mesh(base.ico1, lambert('#bfe8ff', 0.2));
      glass.scale.set(0.8, 0.7, 0.8);
      glass.position.set(0.95, 1.45, 0);
      g.add(glass);
      box(2.6, 0.25, 0.25, paint, -1.8, 1.45, 0);
      box(0.15, 0.8, 0.5, dark, -3.0, 1.75, 0);
      for (const s of [-1, 1]) {
        box(2.2, 0.08, 0.08, '#5a5a6a', 0.3, 0.12, s * 0.75);
        box(0.08, 0.5, 0.08, '#5a5a6a', 0.8, 0.4, s * 0.7);
        box(0.08, 0.5, 0.08, '#5a5a6a', -0.3, 0.4, s * 0.7);
      }
      cyl(0.08, 0.4, INK, 0.3, 2.35, 0);
      rotor = new THREE.Group();
      rotor.position.set(0.3, 2.55, 0);
      g.add(rotor);
      box(6.4, 0.05, 0.3, '#2a2238', 0, 0, 0, rotor);
      box(0.3, 0.05, 6.4, '#2a2238', 0, 0, 0, rotor);
      // gancho com rede de carga
      cyl(0.03, 1.0, '#5a5a6a', 0.3, -0.2, 0);
      bed.position.set(0.3, -0.7, 0);
      seat.set(0.7, 1.8, 0);
      len = 4;
      wid = 2;
      break;
    }
    case VK.Boat: {
      box(3.6, 0.5, 1.6, paint, 0, 0.35, 0);
      const bow = new THREE.Mesh(base.cone, lambert(paint));
      bow.scale.set(0.8, 1.2, 0.5);
      bow.rotation.z = -Math.PI / 2;
      bow.position.set(2.3, 0.35, 0);
      g.add(bow);
      box(3.4, 0.08, 1.4, '#c88a4a', 0, 0.62, 0);
      box(0.4, 0.6, 0.3, '#5a5a6a', -1.9, 0.6, 0);
      box(0.5, 0.5, 1.2, '#ffffff', 0.6, 0.95, 0);
      bed.position.set(-0.8, 0.7, 0);
      seat.set(0.0, 1.55, 0);
      len = 4.2;
      wid = 1.8;
      break;
    }
    default: {
      // empilhadeira
      box(1.6, 0.6, 1.1, paint, -0.2, 0.75, 0);
      box(0.6, 0.6, 1.1, '#5a5a6a', -0.9, 0.85, 0);
      for (const s of [-1, 1]) box(0.08, 1.3, 0.08, '#2a2238', -0.4 + 0.9 * (s > 0 ? 1 : 0), 1.7, 0.5);
      for (const s of [-1, 1]) box(0.08, 1.3, 0.08, '#2a2238', -0.4 + 0.9 * (s > 0 ? 1 : 0), 1.7, -0.5);
      box(1.0, 0.08, 1.1, '#2a2238', 0.05, 2.35, 0);
      for (const s of [-1, 1]) box(0.1, 2.0, 0.1, '#5a5a6a', 0.75, 1.3, s * 0.35);
      const fork = new THREE.Group();
      fork.position.set(0.85, 0.3, 0);
      g.add(fork);
      for (const s of [-1, 1]) box(1.1, 0.06, 0.15, '#8a8a9a', 0.55, 0, s * 0.3, fork);
      box(0.06, 0.6, 0.9, '#8a8a9a', 0.0, 0.3, 0, fork);
      arm = fork;
      wheel(0.45, 0.35, 0.6, 0.35, 0.25);
      wheel(0.45, 0.35, -0.6, 0.35, 0.25);
      wheel(-0.8, 0.3, 0.55, 0.3, 0.22);
      wheel(-0.8, 0.3, -0.55, 0.3, 0.22);
      fork.add(bed);
      bed.position.set(0.6, 0.1, 0);
      seat.set(-0.25, 2.0, 0);
      len = 2.6;
      wid = 1.3;
    }
  }
  if (!bed.parent) g.add(bed);
  return { g, bed, seat, wheels, arm, rotor, len, wid };
}

/** bichinho ajudante (bolinha com orelhas), cor por instância de material */
export function petModel(color: string): { g: THREE.Group; body: THREE.Object3D; tool: THREE.Object3D } {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const b = new THREE.Mesh(base.ico1, lambert(color));
  b.scale.set(0.42, 0.38, 0.42);
  b.position.y = 0.42;
  b.castShadow = true;
  body.add(b);
  const belly = new THREE.Mesh(base.ico1, lambert('#fff6d6'));
  belly.scale.set(0.25, 0.24, 0.2);
  belly.position.set(0.24, 0.36, 0);
  body.add(belly);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(base.ico, lambert('#ffffff'));
    e.scale.set(0.09, 0.11, 0.09);
    e.position.set(0.33, 0.56, s * 0.14);
    body.add(e);
    const p = new THREE.Mesh(base.ico, lambert(INK));
    p.scale.set(0.05, 0.06, 0.05);
    p.position.set(0.4, 0.56, s * 0.14);
    body.add(p);
    const ear = new THREE.Mesh(base.cone, lambert(shade(color, -0.15)));
    ear.scale.set(0.1, 0.25, 0.1);
    ear.position.set(0.05, 0.85, s * 0.2);
    ear.rotation.x = s * 0.35;
    body.add(ear);
    const foot = new THREE.Mesh(base.ico, lambert(shade(color, -0.3)));
    foot.scale.set(0.12, 0.07, 0.1);
    foot.position.set(0.12, 0.06, s * 0.18);
    body.add(foot);
  }
  const tool = new THREE.Group();
  tool.position.set(0.15, 0.45, -0.38);
  const stick = new THREE.Mesh(base.box, lambert('#a8743c'));
  stick.scale.set(0.06, 0.6, 0.06);
  stick.position.y = 0.3;
  tool.add(stick);
  const head = new THREE.Mesh(base.box, lambert('#e0e8f4'));
  head.scale.set(0.22, 0.14, 0.05);
  head.position.set(0.1, 0.55, 0);
  tool.add(head);
  body.add(tool);
  return { g, body, tool };
}

/** pá (primeira pessoa), cabo ao longo de +Y: cabo roliço, empunhadura em D, lâmina de espada com bisel */
export function shovelModel(): THREE.Group {
  const g = new THREE.Group();
  const wood = lambert('#b07a40');
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.95, 10), wood);
  stick.position.y = 0.36;
  g.add(stick);
  // empunhadura em D
  const d = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.016, 6, 14, Math.PI), lambert(INK));
  d.position.y = -0.12;
  d.rotation.z = Math.PI;
  g.add(d);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.15, 8), lambert(INK));
  bar.rotation.z = Math.PI / 2;
  bar.position.y = -0.19;
  g.add(bar);
  // colar metálico
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.05, 0.12, 10), lambert('#8a8aa0'));
  col.position.y = 0.86;
  g.add(col);
  // lâmina (forma de espada, ponta arredondada) extrudada com bisel
  const sh = new THREE.Shape();
  sh.moveTo(-0.12, 0);
  sh.lineTo(0.12, 0);
  sh.quadraticCurveTo(0.14, 0.2, 0.08, 0.3);
  sh.quadraticCurveTo(0, 0.38, -0.08, 0.3);
  sh.quadraticCurveTo(-0.14, 0.2, -0.12, 0);
  const bg = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 8 });
  // leve concavidade
  const p = bg.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + p.getX(i) * p.getX(i) * 1.6);
  bg.computeVertexNormals();
  const blade = new THREE.Mesh(bg, lambert('#c8d2e4', 0.06));
  blade.position.y = 0.9;
  g.add(blade);
  return g;
}

/** dinamite (primeira pessoa e no chão) */
export function tntModel(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(base.cyl, lambert('#ff4f6a'));
    c.scale.set(0.07, 0.4, 0.07);
    c.position.set((i - 1) * 0.13, 0.2, 0);
    g.add(c);
  }
  const band = new THREE.Mesh(base.box, lambert('#2a2238'));
  band.scale.set(0.42, 0.06, 0.16);
  band.position.y = 0.2;
  g.add(band);
  const fuse = new THREE.Mesh(base.cyl, lambert('#fff6d6', 0.5));
  fuse.scale.set(0.015, 0.2, 0.015);
  fuse.position.set(0, 0.48, 0);
  g.add(fuse);
  return g;
}
