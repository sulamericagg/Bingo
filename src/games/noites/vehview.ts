/* ============================================================
 *  NOITES — vista dos veículos (a partir do espelho leve do Sim:
 *  funciona igual no host e nos convidados), toras na caçamba,
 *  toras soltas, faróis e fumacinha. Também o desenho 2D lateral
 *  usado na garagem.
 * ============================================================ */
import * as THREE from 'three';
import type { Particles } from '../../3d/common/particles';
import { G, PB, glowMat, vcMat } from './models';
import { cargoLen, stats, type VDesign } from './vehicles';
import type { Sim } from './sim';

const TAU = Math.PI * 2;
const shade = (hex: string, k: number) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();

interface VM {
  g: THREE.Group;
  wheels: THREE.Object3D[];
  steer: THREE.Object3D[];
  beam: THREE.Mesh | null;
  chimney: THREE.Vector3 | null;
  dk: string;
}

export function vehicleModel(d: VDesign): VM {
  const st = stats(d);
  const g = new THREE.Group();
  const b = new PB();
  const glow = new PB();
  const { w, h, l, wheelR: r } = st;
  const c = d.col;
  // chassi e para-choques
  b.add(G.box, c, 0, 0, 0, w, h, l).add(G.box, shade(c, 0.6), 0, -h / 2 + 0.04, 0, w + 0.04, 0.1, l + 0.04);
  b.add(G.box, '#3a3a48', 0, -0.05, l / 2 + 0.06, w * 0.9, h * 0.6, 0.12);
  // assentos (fileiras de 2)
  for (let i = 0; i < d.seats; i++) {
    const row = Math.floor(i / 2);
    const sx = d.seats === 1 ? 0 : i % 2 ? 0.4 : -0.4;
    const z = l / 2 - 1.0 - row * 0.8;
    b.add(G.box, '#2a2a3a', sx, h / 2 + 0.12, z, 0.5, 0.18, 0.5).add(G.box, '#2a2a3a', sx, h / 2 + 0.42, z - 0.24, 0.5, 0.5, 0.1);
  }
  // volante
  b.add(G.torus, '#2a2a30', d.seats === 1 ? 0 : -0.4, h / 2 + 0.55, l / 2 - 0.62, 0.32, 0.32, 0.6, -0.9);
  // arco de proteção
  const rz = l / 2 - 1.3 - (d.seats > 2 ? 0.8 : 0);
  for (const sx of [-1, 1]) b.add(G.cyl, '#dcd6f0', (sx * w) / 2 - sx * 0.06, h / 2 + 0.55, rz, 0.07, 1.1, 0.07);
  b.add(G.cyl, '#dcd6f0', 0, h / 2 + 1.1, rz, 0.07, w - 0.1, 0.07, 0, 0, Math.PI / 2);
  // motor na frente
  const ez = l / 2 - 0.35;
  let chimney: THREE.Vector3 | null = null;
  if (d.en === 'pedal') b.add(G.box, '#5a5a6a', 0, h / 2 + 0.06, ez, 0.3, 0.1, 0.3);
  else if (d.en === 'coal') {
    b.add(G.cyl12, '#2a2a30', 0, h / 2 + 0.3, ez, 0.6 + d.tier * 0.1, 0.6, 0.6 + d.tier * 0.1, Math.PI / 2).add(G.cyl, '#3a3a48', 0.2, h / 2 + 0.8, ez, 0.16, 0.8, 0.16);
    chimney = new THREE.Vector3(0.2, h / 2 + 1.25, ez);
  } else if (d.en === 'gas') {
    b.add(G.box, '#ff8a3a', 0, h / 2 + 0.2, ez, 0.7 + d.tier * 0.1, 0.4, 0.5).add(G.cyl, '#8a8aa0', w / 2 - 0.15, h / 2 + 0.1, -l / 2 + 0.2, 0.1, 0.4, 0.1, Math.PI / 2);
    chimney = new THREE.Vector3(w / 2 - 0.15, h / 2, -l / 2);
  } else {
    b.add(G.box, '#3a4250', 0, h / 2 + 0.18, ez, 0.8, 0.36, 0.5);
    glow.add(G.box, '#7aff8a', 0, h / 2 + 0.37, ez, 0.4, 0.04, 0.2);
  }
  // caçamba
  const wall = (cz: number, len: number, col: string) => {
    const hh = 0.32;
    b.add(G.box, col, w / 2 - 0.06, h / 2 + hh, cz, 0.12, hh * 2, len).add(G.box, col, -w / 2 + 0.06, h / 2 + hh, cz, 0.12, hh * 2, len);
    b.add(G.box, col, 0, h / 2 + hh, cz - len / 2, w, hh * 2, 0.12).add(G.box, col, 0, h / 2 + hh, cz + len / 2, w, hh * 2, 0.12);
  };
  const cl = cargoLen(d, st);
  if (d.cargo) wall(-l / 2 + cl / 2 + 0.05, cl, '#a8743c');
  if (d.trailer) {
    b.add(G.box, '#3a3a48', 0, -0.05, -l / 2 - 0.2, 0.15, 0.15, 0.6);
    b.add(G.box, shade(c, 0.85), 0, 0, -l / 2 - 1.6, w, h, 2.8);
    wall(-l / 2 - 1.6, 2.7, '#a8743c');
  }
  // faróis
  if (d.lights) for (const sx of [-1, 1]) glow.add(G.sph, '#fff6c0', sx * (w / 2 - 0.25), 0.05, l / 2 + 0.1, 0.22, 0.18, 0.08);
  if (d.lights === 2) {
    b.add(G.box, '#2a2a30', 0, h / 2 + 1.2, rz, w * 0.8, 0.12, 0.2);
    for (let i = 0; i < 4; i++) glow.add(G.sph, '#fff3a0', (i - 1.5) * (w * 0.2), h / 2 + 1.2, rz + 0.1, 0.18, 0.18, 0.1);
  }
  if (d.winch) b.add(G.cyl12, '#c8d0e0', 0, 0.05, l / 2 + 0.22, 0.24, 0.6, 0.24, 0, 0, Math.PI / 2).add(G.box, '#ffcf2e', 0, 0.05, l / 2 + 0.36, 0.1, 0.1, 0.1);
  g.add(new THREE.Mesh(b.geo(), vcMat()));
  if (!glow.empty) g.add(new THREE.Mesh(glow.geo(), glowMat('#fff6c0')));
  // rodas
  const wg = new PB().add(G.cyl12, '#2a2a30', 0, 0, 0, r * 2, 0.32, r * 2, 0, 0, Math.PI / 2).add(G.cyl, shade(c, 1.1), 0, 0, 0, r * 0.9, 0.34, r * 0.9, 0, 0, Math.PI / 2).add(G.box, '#dcd6f0', 0, 0, 0, 0.36, r * 1.1, 0.12);
  const wgeo = wg.geo();
  const wmat = vcMat();
  const wheels: THREE.Object3D[] = [];
  const steer: THREE.Object3D[] = [];
  const axles: [number, boolean][] = [
    [l / 2 - r - 0.1, true],
    [-l / 2 + r + 0.15, false],
  ];
  if (d.trailer) axles.push([-l / 2 - 2.4, false]);
  for (const [az, front] of axles)
    for (const sx of [-1, 1]) {
      const piv = new THREE.Group();
      piv.position.set(sx * (w / 2 + 0.12), -h / 2 - 0.22, az);
      const m = new THREE.Mesh(wgeo, wmat);
      piv.add(m);
      g.add(piv);
      wheels.push(m);
      if (front) steer.push(piv);
    }
  let beam: THREE.Mesh | null = null;
  if (d.lights) {
    const L = st.lightR * 1.4;
    beam = new THREE.Mesh(
      new THREE.ConeGeometry(L * 0.45, L, 16, 1, true).translate(0, -L / 2, 0).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#fff6c0', transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    beam.position.set(0, 0.1, l / 2 + 0.1);
    beam.rotation.set(0.12, Math.PI, 0);
    beam.rotateY(Math.PI);
    g.add(beam);
  }
  return { g, wheels, steer, beam, chimney, dk: '' };
}

export class VehView {
  private ms = new Map<number, VM>();
  private logs: THREE.InstancedMesh;
  private loose: THREE.InstancedMesh;
  private t = 0;
  private _m = new THREE.Matrix4();
  private _q = new THREE.Quaternion();
  private _p = new THREE.Vector3();
  private _s = new THREE.Vector3(1, 1, 1);

  constructor(
    private scene: THREE.Scene,
    private sim: Sim,
    private parts: Particles,
  ) {
    const lg = new PB().add(G.cyl12, '#8a5228', 0, 0, 0, 0.32, 1.05, 0.32).add(G.cyl12, '#f3d9a8', 0, 0.53, 0, 0.28, 0.01, 0.28).add(G.cyl12, '#f3d9a8', 0, -0.53, 0, 0.28, 0.01, 0.28);
    const geo = lg.geo();
    this.logs = new THREE.InstancedMesh(geo, vcMat(), 80);
    this.logs.count = 0;
    this.logs.frustumCulled = false;
    this.loose = new THREE.InstancedMesh(geo, vcMat(), 60);
    this.loose.count = 0;
    this.loose.frustumCulled = false;
    scene.add(this.logs, this.loose);
  }

  update(dt: number, dark: number): void {
    this.t += dt;
    const s = this.sim;
    const seen = new Set<number>();
    let li = 0;
    for (const v of s.vehView) {
      seen.add(v.id);
      const d = s.designs.get(v.dk);
      if (!d) continue;
      let m = this.ms.get(v.id);
      if (!m || m.dk !== v.dk) {
        if (m) this.scene.remove(m.g);
        m = vehicleModel(d);
        m.dk = v.dk;
        this.scene.add(m.g);
        this.ms.set(v.id, m);
        m.g.position.set(v.x, v.y, v.z);
      }
      // suaviza (instantâneos chegam ~12/s nos convidados)
      const k = Math.min(1, dt * 14);
      m.g.position.lerp(this._p.set(v.x, v.y, v.z), k);
      m.g.quaternion.slerp(this._q.set(v.q[0], v.q[1], v.q[2], v.q[3]), k);
      for (const w of m.wheels) w.rotation.x = v.spin;
      for (const p of m.steer) p.rotation.y = -v.steer * 0.5 * -1;
      if (m.beam) m.beam.visible = dark > 0.3;
      if (m.chimney && v.driver && Math.random() < 0.3) {
        const c = m.chimney.clone().applyMatrix4(m.g.matrixWorld);
        this.parts.emit(c.x, c.y, c.z, (Math.random() - 0.5) * 0.3, 0.8 + Math.random() * 0.5, (Math.random() - 0.5) * 0.3, { tile: 2, color: d.en === 'coal' ? '#6a6a7a' : '#c8c8d0', life: 1.2, size: 0.18, grow: 0.3 });
      }
      for (let i = 0; i + 6 < v.logs.length + 1 && li < 80; i += 7) {
        const L = v.logs;
        this.logs.setMatrixAt(li++, this._m.compose(this._p.set(L[i], L[i + 1], L[i + 2]), this._q.set(L[i + 3], L[i + 4], L[i + 5], L[i + 6]), this._s));
      }
    }
    this.logs.count = li;
    this.logs.instanceMatrix.needsUpdate = true;
    for (const [id, m] of this.ms)
      if (!seen.has(id)) {
        this.scene.remove(m.g);
        this.ms.delete(id);
      }
    let lo = 0;
    for (const l of s.looseView) {
      if (lo >= 60) break;
      this.loose.setMatrixAt(lo++, this._m.compose(this._p.set(l.x, s.w.height(l.x, l.z) + 0.16, l.z), this._q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2).premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), l.id)), this._s));
    }
    this.loose.count = lo;
    this.loose.instanceMatrix.needsUpdate = true;
  }
}

/* ------------------------------ desenho 2D (garagem) ------------------------------ */
export function drawVehicle2D(x: CanvasRenderingContext2D, d: VDesign, W: number, H: number): void {
  const st = stats(d);
  x.clearRect(0, 0, W, H);
  const sc = Math.min((W * 0.85) / (st.lt + 0.8), (H * 0.6) / 2.6);
  const gy = H * 0.86;
  const cx = W / 2 + ((st.lt - st.l) / 2) * sc;
  x.lineWidth = 3;
  x.strokeStyle = '#2a0b5c';
  x.lineJoin = 'round';
  const r = st.wheelR * sc;
  const by = gy - r - 0.25 * sc;
  const box = (x0: number, y0: number, w: number, h: number, col: string) => {
    x.fillStyle = col;
    x.beginPath();
    x.roundRect(x0, y0, w, h, Math.min(8, h / 3));
    x.fill();
    x.stroke();
  };
  // chão
  x.fillStyle = 'rgba(255,255,255,.15)';
  x.fillRect(0, gy, W, 3);
  // chassi (frente à direita)
  const L = st.l * sc;
  const hh = st.h * sc;
  const left = cx - L / 2;
  if (d.trailer) {
    box(left - 3.0 * sc, by - hh, 2.8 * sc, hh, shade(d.col, 0.85));
    box(left - 3.0 * sc, by - hh - 0.6 * sc, 2.8 * sc, 0.6 * sc, '#a8743c');
    x.fillStyle = '#3a3a48';
    x.fillRect(left - 0.3 * sc, by - hh / 2 - 3, 0.3 * sc, 6);
  }
  box(left, by - hh, L, hh, d.col);
  if (d.cargo) {
    const cl = cargoLen(d, st) * sc;
    box(left + 2, by - hh - 0.6 * sc, cl, 0.6 * sc, '#a8743c');
  }
  // motor
  const ex = left + L - 0.6 * sc;
  if (d.en === 'coal') {
    box(ex - 0.3 * sc, by - hh - 0.6 * sc, 0.7 * sc, 0.6 * sc, '#2a2a30');
    box(ex, by - hh - 1.3 * sc, 0.18 * sc, 0.7 * sc, '#3a3a48');
  } else if (d.en === 'gas') box(ex - 0.3 * sc, by - hh - 0.4 * sc, 0.7 * sc, 0.4 * sc, '#ff8a3a');
  else if (d.en === 'elec') {
    box(ex - 0.3 * sc, by - hh - 0.36 * sc, 0.7 * sc, 0.36 * sc, '#3a4250');
    x.fillStyle = '#7aff8a';
    x.fillRect(ex - 0.1 * sc, by - hh - 0.38 * sc, 0.3 * sc, 4);
  }
  // assentos + Bloops
  const rows = Math.ceil(d.seats / 2);
  for (let i = 0; i < rows; i++) {
    const sx = left + L - 1.0 * sc - i * 0.8 * sc;
    box(sx - 0.2 * sc, by - hh - 0.6 * sc, 0.12 * sc, 0.6 * sc, '#2a2a3a');
    x.fillStyle = i ? '#8ad8ff' : '#ff8fd8';
    x.beginPath();
    x.arc(sx + 0.15 * sc, by - hh - 0.4 * sc, 0.32 * sc, 0, TAU);
    x.fill();
    x.stroke();
  }
  // faróis / holofote / guincho
  if (d.lights) {
    x.fillStyle = '#fff6c0';
    x.beginPath();
    x.arc(left + L, by - hh / 2, 0.14 * sc, 0, TAU);
    x.fill();
    x.stroke();
    x.fillStyle = 'rgba(255,246,192,.25)';
    x.beginPath();
    x.moveTo(left + L, by - hh / 2);
    x.lineTo(W, by - hh / 2 - (d.lights === 2 ? 40 : 20));
    x.lineTo(W, by - hh / 2 + (d.lights === 2 ? 40 : 20));
    x.fill();
  }
  if (d.lights === 2) box(left + L - 1.4 * sc, by - hh - 1.3 * sc, 0.8 * sc, 0.16 * sc, '#fff3a0');
  if (d.winch) {
    x.fillStyle = '#c8d0e0';
    x.beginPath();
    x.arc(left + L + 0.2 * sc, by - hh * 0.3, 0.15 * sc, 0, TAU);
    x.fill();
    x.stroke();
  }
  // rodas
  const wx = [left + L - (st.wheelR + 0.1) * sc, left + (st.wheelR + 0.15) * sc];
  if (d.trailer) wx.push(left - 2.4 * sc + 0.0);
  for (const px of wx) {
    x.fillStyle = '#2a2a30';
    x.beginPath();
    x.arc(px, gy - r, r, 0, TAU);
    x.fill();
    x.stroke();
    x.fillStyle = d.wh === 2 ? '#ffcf2e' : '#c8d0e0';
    x.beginPath();
    x.arc(px, gy - r, r * 0.45, 0, TAU);
    x.fill();
  }
}
