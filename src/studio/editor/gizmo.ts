/* ============================================================
 *  BLOOP STUDIO — manipuladores (mover / girar / escalar) do tamanho do dedo.
 *  Tamanho constante na tela; alças de toque invisíveis bem mais grossas que
 *  o desenho. Eixos do MUNDO (X vermelho, Y verde, Z azul).
 * ============================================================ */
import * as THREE from 'three';

export type GizmoMode = 'move' | 'rotate' | 'scale';
export type Handle = { kind: 'axis' | 'ring' | 'scale' | 'free' | 'uniform'; axis: 0 | 1 | 2 | -1 };

const AX = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
const COLORS = [0xff4f6a, 0x4fd67a, 0x3fa8ff];

export class Gizmo {
  readonly root = new THREE.Group();
  private groups: Record<GizmoMode, THREE.Group> = { move: new THREE.Group(), rotate: new THREE.Group(), scale: new THREE.Group() };
  private pick: THREE.Object3D[] = [];
  private mats: THREE.Material[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private hot: THREE.Mesh[] = [];
  mode: GizmoMode = 'move';

  constructor() {
    this.root.renderOrder = 999;
    const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, depthTest: false, colorWrite: false });
    this.mats.push(hitMat);
    const vis = (c: number) => {
      const m = new THREE.MeshBasicMaterial({ color: c, depthTest: false, depthWrite: false, transparent: true, opacity: 0.95 });
      this.mats.push(m);
      return m;
    };
    const G = <T extends THREE.BufferGeometry>(g: T): T => (this.geos.push(g), g);
    const shaft = G(new THREE.CylinderGeometry(0.035, 0.035, 0.8, 8).translate(0, 0.45, 0));
    const tip = G(new THREE.ConeGeometry(0.11, 0.26, 12).translate(0, 0.95, 0));
    const hitStick = G(new THREE.CylinderGeometry(0.3, 0.3, 1.15, 8).translate(0, 0.66, 0));
    const ring = G(new THREE.TorusGeometry(0.85, 0.03, 6, 48));
    const hitRing = G(new THREE.TorusGeometry(0.85, 0.22, 6, 32));
    const knob = G(new THREE.BoxGeometry(0.2, 0.2, 0.2).translate(0, 0.9, 0));
    const sShaft = G(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 6).translate(0, 0.4, 0));
    const hitKnob = G(new THREE.BoxGeometry(0.55, 0.55, 0.55).translate(0, 0.9, 0));
    const ball = G(new THREE.SphereGeometry(0.15, 16, 10));
    const hitBall = G(new THREE.SphereGeometry(0.36, 8, 6));
    const cube = G(new THREE.BoxGeometry(0.24, 0.24, 0.24));

    const orient = (o: THREE.Object3D, i: number) => {
      if (i === 0) o.rotation.z = -Math.PI / 2;
      else if (i === 2) o.rotation.x = Math.PI / 2;
    };
    for (let i = 0 as 0 | 1 | 2; i < 3; i = (i + 1) as 0 | 1 | 2) {
      // mover
      const a = new THREE.Group();
      const m1 = new THREE.Mesh(shaft, vis(COLORS[i]));
      const m2 = new THREE.Mesh(tip, vis(COLORS[i]));
      const h = new THREE.Mesh(hitStick, hitMat);
      h.userData.handle = { kind: 'axis', axis: i } as Handle;
      h.userData.vis = [m1, m2];
      a.add(m1, m2, h);
      orient(a, i);
      this.groups.move.add(a);
      // girar
      const r = new THREE.Group();
      const rv = new THREE.Mesh(ring, vis(COLORS[i]));
      const rh = new THREE.Mesh(hitRing, hitMat);
      rh.userData.handle = { kind: 'ring', axis: i } as Handle;
      rh.userData.vis = [rv];
      r.add(rv, rh);
      if (i === 0) r.rotation.y = Math.PI / 2;
      else if (i === 1) r.rotation.x = Math.PI / 2;
      this.groups.rotate.add(r);
      // escalar
      const s = new THREE.Group();
      const s1 = new THREE.Mesh(sShaft, vis(COLORS[i]));
      const s2 = new THREE.Mesh(knob, vis(COLORS[i]));
      const sh = new THREE.Mesh(hitKnob, hitMat);
      sh.userData.handle = { kind: 'scale', axis: i } as Handle;
      sh.userData.vis = [s1, s2];
      s.add(s1, s2, sh);
      orient(s, i);
      this.groups.scale.add(s);
    }
    const fb = new THREE.Mesh(ball, vis(0xffffff));
    const fh = new THREE.Mesh(hitBall, hitMat);
    fh.userData.handle = { kind: 'free', axis: -1 } as Handle;
    fh.userData.vis = [fb];
    this.groups.move.add(fb, fh);
    const uc = new THREE.Mesh(cube, vis(0xffd34a));
    const uh = new THREE.Mesh(hitBall, hitMat);
    uh.userData.handle = { kind: 'uniform', axis: -1 } as Handle;
    uh.userData.vis = [uc];
    this.groups.scale.add(uc, uh);
    for (const g of Object.values(this.groups)) this.root.add(g);
    this.root.traverse((o) => {
      o.renderOrder = 999;
      if (o.userData.handle) this.pick.push(o);
    });
    this.setMode('move');
    this.root.visible = false;
  }

  setMode(m: GizmoMode): void {
    this.mode = m;
    for (const k of Object.keys(this.groups) as GizmoMode[]) this.groups[k].visible = k === m;
  }

  /** tamanho constante na tela */
  fit(cam: THREE.PerspectiveCamera): void {
    const d = cam.position.distanceTo(this.root.position);
    const s = Math.max(0.05, d * Math.tan((cam.fov * Math.PI) / 360) * 0.36);
    this.root.scale.setScalar(s);
  }

  hit(ray: THREE.Raycaster): Handle | null {
    if (!this.root.visible) return null;
    const list = this.pick.filter((o) => {
      let p: THREE.Object3D | null = o;
      while (p) {
        if (!p.visible) return false;
        p = p.parent;
      }
      return true;
    });
    const hits = ray.intersectObjects(list, false);
    if (!hits.length) return null;
    // prefere eixos/anéis à bola central quando há empate
    hits.sort((a, b) => a.distance - b.distance);
    const h = hits[0].object.userData.handle as Handle;
    this.highlight(hits[0].object as THREE.Mesh);
    return h;
  }

  highlight(o: THREE.Mesh | null): void {
    for (const m of this.hot) (m.material as THREE.MeshBasicMaterial).opacity = 0.95;
    this.hot = [];
    if (!o) return;
    for (const v of (o.userData.vis as THREE.Mesh[]) ?? []) {
      (v.material as THREE.MeshBasicMaterial).opacity = 0.55;
      this.hot.push(v);
    }
  }

  static axis(i: number): THREE.Vector3 {
    return AX[i];
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}

/* --------------------------- matemática de arraste --------------------------- */

const _w = new THREE.Vector3();
/** parâmetro t do ponto da reta (P + t·A) mais perto do raio */
export function rayLineParam(ray: THREE.Ray, P: THREE.Vector3, A: THREE.Vector3): number {
  const d = ray.direction;
  _w.subVectors(ray.origin, P);
  const a = d.dot(d);
  const b = d.dot(A);
  const c = A.dot(A);
  const dd = d.dot(_w);
  const e = A.dot(_w);
  const den = a * c - b * b;
  if (Math.abs(den) < 1e-6) return 0;
  return (a * e - b * dd) / den;
}

/** ângulo (rad) do ponto onde o raio cruza o plano (P, normal A), medido em torno de A */
export function rayPlaneAngle(ray: THREE.Ray, P: THREE.Vector3, A: THREE.Vector3, ref: THREE.Vector3): number | null {
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(A, P);
  const hit = ray.intersectPlane(plane, new THREE.Vector3());
  if (!hit) return null;
  const v = hit.sub(P);
  const x = v.dot(ref);
  const y = v.dot(new THREE.Vector3().crossVectors(A, ref));
  return Math.atan2(y, x);
}
