/* ============================================================
 *  VEÍCULOS DO MUNDO — modelo 3D a partir do projeto.
 *  Tudo que é fixo vira UMA malha (cores por vértice, um material
 *  compartilhado). Rodas = 1 InstancedMesh por veículo. Só o que se mexe
 *  (hélices/rotor/broca, braço do guindaste) fica separado.
 * ============================================================ */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CELL } from './parts';
import { DECK_T, layout, type Layout, type VehicleDesign } from './design';

/** suspensão em repouso (m) — a física usa o mesmo valor */
export const SUSP = 0.28;
/** altura das paredes da caçamba (por fora da pegada: o miolo tem a pegada inteira) */
export const cargoWallH = (cap: number) => (cap > 4 ? 0.75 : 0.6);
/** estacas acima das paredes (a física usa parede + estaca) */
export const STAKE_H = 0.55;

let MAT: THREE.MeshLambertMaterial | null = null;
export function vehicleMaterial(): THREE.MeshLambertMaterial {
  return (MAT ??= new THREE.MeshLambertMaterial({ vertexColors: true }));
}

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

function mat(x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0): THREE.Matrix4 {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  return _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)).clone();
}
/** acumula primitivas coloridas e funde numa geometria */
class Acc {
  list: THREE.BufferGeometry[] = [];
  add(g: THREE.BufferGeometry, color: string, m: THREE.Matrix4, shade = 1): void {
    const h = (g.index ? g.toNonIndexed() : g.clone()) as THREE.BufferGeometry;
    h.deleteAttribute('uv');
    h.applyMatrix4(m);
    const n = h.attributes.position.count;
    const col = new Float32Array(n * 3);
    _c.set(color).multiplyScalar(shade);
    const nor = h.attributes.normal;
    for (let i = 0; i < n; i++) {
      // sombreado fake: faces de baixo mais escuras
      const k = 0.78 + 0.22 * Math.max(0, nor.getY(i) * 0.5 + 0.5);
      col[i * 3] = _c.r * k;
      col[i * 3 + 1] = _c.g * k;
      col[i * 3 + 2] = _c.b * k;
    }
    h.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.list.push(h);
  }
  box(color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, rx = 0, rz = 0): void {
    this.add(G.box, color, mat(x, y, z, sx, sy, sz, rx, ry, rz));
  }
  cyl(color: string, x: number, y: number, z: number, r: number, h: number, rx = 0, ry = 0, rz = 0, g = G.cyl): void {
    this.add(g, color, mat(x, y, z, r, h, r, rx, ry, rz));
  }
  merge(): THREE.BufferGeometry {
    if (!this.list.length) return new THREE.BufferGeometry();
    const g = mergeGeometries(this.list, false)!;
    for (const x of this.list) x.dispose();
    this.list = [];
    g.computeBoundingSphere();
    return g;
  }
}
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
  cylLo: new THREE.CylinderGeometry(1, 1, 1, 8),
  cone: new THREE.ConeGeometry(1, 1, 10),
  sph: new THREE.SphereGeometry(1, 10, 8),
  torus: new THREE.TorusGeometry(1, 0.18, 6, 14),
};

export interface Spinner {
  o: THREE.Object3D;
  axis: 'x' | 'y' | 'z';
  /** rad/s em potência máxima */
  rate: number;
  kind: 'rotor' | 'prop' | 'drill';
}
export interface CraneRig {
  /** gira em Y (base) */
  yaw: THREE.Group;
  /** inclinação da lança (rotation.x) */
  boom: THREE.Group;
  hook: THREE.Mesh;
  cable: THREE.Mesh;
  /** posição local da base */
  base: THREE.Vector3;
  reach: number;
}
export interface VehicleModel {
  root: THREE.Group;
  body: THREE.Mesh;
  wheels: THREE.InstancedMesh | null;
  /** índice da roda física → instância (−1 = escondida) */
  wheelInst: number[];
  spinners: Spinner[];
  crane: CraneRig | null;
  /** posições locais dos faróis */
  lamps: THREE.Vector3[];
  lay: Layout;
  dispose(): void;
}

function wheelGeometry(): THREE.BufferGeometry {
  const a = new Acc();
  a.cyl('#262a34', 0, 0, 0, 1, 0.62, 0, 0, Math.PI / 2);
  a.cyl('#c8ccd8', 0, 0, 0, 0.5, 0.66, 0, 0, Math.PI / 2, G.cylLo);
  // cravos (dá para ver girar)
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    a.box('#14161c', 0, Math.cos(ang) * 0.98, Math.sin(ang) * 0.98, 0.64, 0.12, 0.3, 0, ang);
  }
  return a.merge();
}
let WHEEL_GEO: THREE.BufferGeometry | null = null;

/** monta o modelo do projeto (rodas como instâncias; posição/rotação vêm da física ou de `poseWheelsRest`) */
export function buildVehicleModel(d: VehicleDesign, opts: { lite?: boolean } = {}): VehicleModel {
  const lay = layout(d);
  const a = new Acc();
  const paint = d.paint;
  const W = lay.hw * 2;
  const L = lay.hl * 2;
  const dark = '#2a2e38';
  // chassi: prancha + longarinas
  a.box(paint, 0, -DECK_T / 2, 0, W, DECK_T, L);
  a.box(dark, -lay.hw + 0.08, -DECK_T - 0.06, 0, 0.14, 0.14, L * 0.96);
  a.box(dark, lay.hw - 0.08, -DECK_T - 0.06, 0, 0.14, 0.14, L * 0.96);
  // para-choques
  a.box(dark, 0, -DECK_T / 2, -lay.hl - 0.05, W * 0.9, DECK_T * 0.8, 0.1);
  a.box(dark, 0, -DECK_T / 2, lay.hl + 0.05, W * 0.9, DECK_T * 0.8, 0.1);

  const spinners: Spinner[] = [];
  const spinGroups: THREE.Object3D[] = [];
  let crane: CraneRig | null = null;
  const lamps: THREE.Vector3[] = [];
  const wheelInst: number[] = [];
  let nWheelInst = 0;
  for (const w of lay.wheels) wheelInst.push(w.track < 0 ? nWheelInst++ : -1);

  for (const s of lay.spots) {
    const { def } = s;
    const c1 = def.color;
    const c2 = def.color2;
    const sw = s.hw * 2;
    const sl = s.hl * 2;
    switch (def.cat) {
      case 'engine': {
        if (def.fuel === 'none') {
          // pedal: pedivela + correntes
          a.box(c1, s.x, 0.12, s.z, 0.3, 0.24, 0.3);
          a.cyl(c2, s.x, 0.22, s.z, 0.14, 0.32, 0, 0, Math.PI / 2);
          a.box(dark, s.x - 0.18, 0.28, s.z - 0.06, 0.04, 0.12, 0.18);
          a.box(dark, s.x + 0.18, 0.16, s.z + 0.06, 0.04, 0.12, 0.18);
        } else {
          const h = def.fuel === 'bateria' ? 0.34 : 0.46;
          a.box(c1, s.x, h / 2, s.z, sw * 0.82, h, sl * 0.86);
          a.box(c2, s.x, h + 0.03, s.z, sw * 0.6, 0.06, sl * 0.6);
          if (def.fuel === 'carvao') {
            a.cyl('#3a3438', s.x + sw * 0.22, h + 0.35, s.z + sl * 0.25, 0.08, 0.7);
            a.cyl('#ff7a3a', s.x + sw * 0.22, h + 0.72, s.z + sl * 0.25, 0.1, 0.06);
          } else if (def.fuel === 'combustivel') {
            a.cyl('#c8ccd8', s.x + sw * 0.3, h * 0.6, s.z + sl * 0.4, 0.05, 0.5, Math.PI / 2);
            for (let i = 0; i < 3; i++) a.box('#8a92a0', s.x, h * 0.3 + i * 0.1, s.z - sl * 0.42, sw * 0.7, 0.04, 0.02);
          } else a.box('#7af0ff', s.x, h * 0.5, s.z - sl * 0.42, sw * 0.6, 0.06, 0.02);
        }
        break;
      }
      case 'seat': {
        const back = s.part.r === 2 ? -1 : 1;
        a.box(c1, s.x, 0.14, s.z, 0.38, 0.12, 0.36);
        a.box(c1, s.x, 0.4, s.z + back * 0.17, 0.38, 0.44, 0.08);
        a.box(c2, s.x, 0.04, s.z, 0.3, 0.08, 0.3);
        // volante
        a.add(G.torus, dark, mat(s.x, 0.52, s.z - back * 0.3, 0.13, 0.13, 0.13, -0.9 * back));
        a.cyl(dark, s.x, 0.32, s.z - back * 0.26, 0.025, 0.42, 0.5 * back);
        break;
      }
      case 'cargo': {
        const h = cargoWallH(def.cap!);
        a.box(c2, s.x, 0.02, s.z, sw, 0.04, sl);
        a.box(c1, s.x - s.hw - 0.03, h / 2, s.z, 0.06, h, sl + 0.12);
        a.box(c1, s.x + s.hw + 0.03, h / 2, s.z, 0.06, h, sl + 0.12);
        a.box(c1, s.x, h / 2, s.z - s.hl - 0.03, sw, h, 0.06);
        a.box(c1, s.x, h / 2, s.z + s.hl + 0.03, sw, h * 0.92, 0.06);
        for (let i = 1; i < 3; i++) a.box(c2, s.x - s.hw - 0.065, (h * i) / 3, s.z, 0.02, 0.05, sl + 0.12);
        // estacas (caminhão de tora) + corrente no topo
        const ns = Math.max(2, Math.round(sl / 0.7) + 1);
        for (const side of [-1, 1]) {
          for (let i = 0; i < ns; i++) a.box(c2, s.x + side * (s.hw + 0.03), (h + STAKE_H) / 2, s.z - s.hl + (sl * i) / (ns - 1), 0.07, h + STAKE_H, 0.07);
          a.box('#3a3f48', s.x + side * (s.hw + 0.03), h + STAKE_H - 0.03, s.z, 0.03, 0.03, sl);
        }
        break;
      }
      case 'box':
        a.box(c1, s.x, 0.2, s.z, sw * 0.86, 0.4, sl * 0.86);
        a.box(c2, s.x, 0.41, s.z, sw * 0.9, 0.04, sl * 0.9);
        break;
      case 'tank':
        a.cyl(c1, s.x, 0.18, s.z, 0.17, sl * 0.8, Math.PI / 2);
        a.cyl(c2, s.x, 0.36, s.z, 0.05, 0.06);
        break;
      case 'hitch': {
        const dz = s.part.z === 0 ? -1 : 1;
        a.box(c1, s.x, -0.05, s.z + dz * 0.2, 0.12, 0.1, 0.5);
        a.add(G.sph, c2, mat(s.x, 0.02, s.z + dz * (s.hl + 0.22), 0.09, 0.09, 0.09));
        break;
      }
      case 'drill': {
        const g = new THREE.Group();
        g.position.set(s.x, 0.05, -lay.hl - 0.2);
        const da = new Acc();
        da.add(G.cone, c1, mat(0, 0, -0.45, 0.28, 0.9, 0.28, -Math.PI / 2));
        for (let i = 0; i < 3; i++) da.add(G.torus, c2, mat(0, 0, -0.2 - i * 0.22, 0.24 - i * 0.06, 0.24 - i * 0.06, 0.24 - i * 0.06));
        g.add(new THREE.Mesh(da.merge(), vehicleMaterial()));
        a.box(dark, s.x, 0.05, -lay.hl - 0.05, 0.36, 0.36, 0.3);
        spinners.push({ o: g, axis: 'z', rate: 18, kind: 'drill' });
        spinGroups.push(g);
        break;
      }
      case 'blade':
        a.box(c1, s.x, -0.2, -lay.hl - 0.42, sw + 0.3, 0.6, 0.08, 0, -0.25);
        a.box(c2, s.x - sw * 0.3, -0.05, -lay.hl - 0.2, 0.08, 0.08, 0.5, 0, 0.3);
        a.box(c2, s.x + sw * 0.3, -0.05, -lay.hl - 0.2, 0.08, 0.08, 0.5, 0, 0.3);
        break;
      case 'plow':
        a.box(c1, s.x, -0.02, lay.hl + 0.25, sw, 0.1, 0.3);
        for (let i = 0; i < 4; i++) a.box(c2, s.x - sw / 2 + (i + 0.5) * (sw / 4), -0.25, lay.hl + 0.3, 0.06, 0.45, 0.12, 0, 0.3);
        break;
      case 'float':
        a.cyl(c1, s.x, -DECK_T - 0.12, s.z, 0.26, sl * 0.95, Math.PI / 2, 0, 0, G.cylLo);
        a.add(G.sph, c1, mat(s.x, -DECK_T - 0.12, s.z - sl * 0.47, 0.26, 0.26, 0.4));
        a.box(c2, s.x, -DECK_T - 0.12, s.z, 0.54, 0.1, 0.12);
        break;
      case 'propeller': {
        const back = s.part.z !== 0;
        const g = new THREE.Group();
        g.position.set(s.x, 0.35, back ? lay.hl + 0.2 : -lay.hl - 0.2);
        const pa = new Acc();
        pa.add(G.sph, c2, mat(0, 0, 0, 0.1, 0.1, 0.14));
        for (let i = 0; i < 3; i++) pa.box(c1, 0, 0, 0, 0.1, 0.62, 0.03, 0, 0, (i / 3) * Math.PI);
        const pm = new THREE.Mesh(pa.merge(), vehicleMaterial());
        g.add(pm);
        a.box(dark, s.x, 0.18, back ? lay.hl + 0.08 : -lay.hl - 0.08, 0.1, 0.36, 0.16);
        spinners.push({ o: g, axis: 'z', rate: 30, kind: 'prop' });
        spinGroups.push(g);
        break;
      }
      case 'rotor': {
        a.cyl(dark, s.x, 0.6, s.z, 0.07, 1.2);
        const g = new THREE.Group();
        g.position.set(s.x, 1.25, s.z);
        const ra = new Acc();
        ra.cyl(c2, 0, 0, 0, 0.14, 0.12);
        const R = Math.max(2.6, lay.hl * 1.4);
        ra.box(c1, 0, 0.04, 0, R * 2, 0.03, 0.22);
        ra.box(c1, 0, 0.04, 0, 0.22, 0.03, R * 2);
        g.add(new THREE.Mesh(ra.merge(), vehicleMaterial()));
        spinners.push({ o: g, axis: 'y', rate: 22, kind: 'rotor' });
        spinGroups.push(g);
        break;
      }
      case 'wing': {
        const side = s.x < 0 ? -1 : 1;
        const span = 2.6;
        a.box(c1, s.x + side * (span / 2 + 0.1), 0.42, s.z, span, 0.06, sl * 0.9, 0, 0, side * -0.06);
        a.box(c2, s.x + side * (span - 0.05), 0.42, s.z, 0.2, 0.08, sl * 0.9);
        a.cyl(dark, s.x + side * 0.5, 0.22, s.z, 0.03, 0.5, 0, 0, side * 0.6);
        break;
      }
      case 'light':
        a.box(c2, s.x, 0.14, s.z - s.hl + 0.1, 0.28, 0.2, 0.14);
        a.box(c1, s.x, 0.14, s.z - s.hl + 0.02, 0.22, 0.14, 0.04);
        lamps.push(new THREE.Vector3(s.x, 0.14, s.z - s.hl));
        break;
      case 'armor': {
        const side = s.x < 0 ? -1 : 1;
        a.box(c1, s.x + side * (s.hw - 0.03), 0.18, s.z, 0.06, 0.42, sl * 0.95);
        a.box(c2, s.x + side * (s.hw - 0.0), 0.18, s.z, 0.03, 0.08, sl * 0.95);
        break;
      }
      case 'crane': {
        a.cyl(dark, s.x, 0.08, s.z, 0.24, 0.16);
        const yaw = new THREE.Group();
        yaw.position.set(s.x, 0.16, s.z);
        const col = new Acc();
        col.box(c1, 0, 0.35, 0, 0.26, 0.7, 0.26);
        yaw.add(new THREE.Mesh(col.merge(), vehicleMaterial()));
        const boom = new THREE.Group();
        boom.position.set(0, 0.7, 0);
        const ba = new Acc();
        const reach = def.reach ?? 4;
        ba.box(c1, 0, 0, -reach / 2, 0.16, 0.18, reach);
        ba.box(c2, 0, 0.12, -reach / 2, 0.04, 0.04, reach * 0.9);
        boom.add(new THREE.Mesh(ba.merge(), vehicleMaterial()));
        yaw.add(boom);
        const ha = new Acc();
        ha.box(c2, 0, 0, 0, 0.18, 0.2, 0.18);
        ha.add(G.torus, dark, mat(0, -0.18, 0, 0.1, 0.1, 0.1, 0, Math.PI / 2));
        const hook = new THREE.Mesh(ha.merge(), vehicleMaterial());
        const cable = new THREE.Mesh(G.cylLo, new THREE.MeshBasicMaterial({ color: 0x222222 }));
        cable.scale.set(0.02, 1, 0.02);
        crane = { yaw, boom, hook, cable, base: new THREE.Vector3(s.x, 0.16, s.z), reach };
        spinGroups.push(yaw);
        break;
      }
      case 'track': {
        const side = s.x < 0 ? -1 : 1;
        const x = side * (lay.hw + 0.18);
        const r = def.radius!;
        const y = -DECK_T - SUSP * 0.7;
        a.box(c1, x, y, s.z, 0.34, r * 2, sl);
        a.cyl(c1, x, y, s.z - s.hl, r, 0.34, 0, 0, Math.PI / 2);
        a.cyl(c1, x, y, s.z + s.hl, r, 0.34, 0, 0, Math.PI / 2);
        for (let i = 0; i < 4; i++) a.cyl(c2, x + side * 0.18, y, s.z - s.hl + (i + 0.5) * (sl / 4), r * 0.55, 0.04, 0, 0, Math.PI / 2, G.cylLo);
        for (let i = 0; i < Math.round(sl / 0.2); i++) a.box('#14161c', x, y + r + 0.01, s.z - s.hl + (i + 0.5) * 0.2, 0.36, 0.04, 0.08);
        break;
      }
      case 'wheel':
        // eixo/manga
        a.box(dark, s.x * 0.5, -DECK_T - 0.04, s.z, Math.abs(s.x) + 0.1, 0.06, 0.06);
        break;
    }
  }

  const root = new THREE.Group();
  root.name = 'vehicle';
  const body = new THREE.Mesh(a.merge(), vehicleMaterial());
  body.castShadow = !opts.lite;
  root.add(body);
  for (const g of spinGroups) root.add(g);
  if (crane) {
    const cr = crane as CraneRig;
    root.add(cr.hook, cr.cable);
  }
  let wheels: THREE.InstancedMesh | null = null;
  if (nWheelInst) {
    WHEEL_GEO ??= wheelGeometry();
    wheels = new THREE.InstancedMesh(WHEEL_GEO, vehicleMaterial(), nWheelInst);
    wheels.frustumCulled = false;
    root.add(wheels);
  }
  const model: VehicleModel = {
    root,
    body,
    wheels,
    wheelInst,
    spinners,
    crane,
    lamps,
    lay,
    dispose() {
      body.geometry.dispose();
      for (const g of spinGroups) g.traverse((o) => o instanceof THREE.Mesh && o.geometry !== G.cylLo && o.geometry.dispose());
      if (crane) crane.hook.geometry.dispose();
      wheels?.dispose();
      root.removeFromParent();
    },
  };
  poseWheelsRest(model);
  return model;
}

const _wm = new THREE.Matrix4();
const _wq = new THREE.Quaternion();
const _wp = new THREE.Vector3();
const _ws = new THREE.Vector3();
/** rodas na posição de repouso (garagem / estacionado sem física) */
export function poseWheelsRest(m: VehicleModel, spin = 0): void {
  if (!m.wheels) return;
  m.lay.wheels.forEach((w, i) => {
    const k = m.wheelInst[i];
    if (k < 0) return;
    _wq.setFromEuler(_e.set(spin, 0, 0));
    _wm.compose(_wp.set(w.x, w.y - SUSP * 0.7, w.z), _wq, _ws.setScalar(w.radius));
    m.wheels!.setMatrixAt(k, _wm);
  });
  m.wheels.instanceMatrix.needsUpdate = true;
}
/** roda i numa pose local (vinda da física) */
export function poseWheel(m: VehicleModel, i: number, pos: THREE.Vector3, q: THREE.Quaternion): void {
  const k = m.wheelInst[i];
  if (k < 0 || !m.wheels) return;
  _wm.compose(pos, q, _ws.setScalar(m.lay.wheels[i].radius));
  m.wheels.setMatrixAt(k, _wm);
}

/** altura (m) do ponto mais baixo das rodas abaixo do deck — para pousar o veículo no chão */
export function restHeight(lay: Layout): number {
  let h = DECK_T + 0.3;
  for (const w of lay.wheels) h = Math.max(h, -w.y + SUSP * 0.7 + w.radius);
  if (lay.floats.length) h = Math.max(h, DECK_T + 0.4);
  return h;
}
export { CELL };
