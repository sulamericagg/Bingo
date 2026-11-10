/* Rally Lunar: buggy do Bloop acelerando por colinas da lua, pulo numa crista, poeira. */
import * as THREE from 'three';
import { PT } from '../../3d/common/particles';
import type { Kit, Shot } from '../kit';
import { solidMesh, terrain } from './util';

export function rally(k: Kit): Shot {
  k.sky('#1d4f74', '#ffb27a', '#7a4a5a', 300, 0.9);
  k.stars(k.hi ? 300 : 150, 220, 1.6, 9);
  k.fog('#e8a07a', 30, 110);
  k.lights('#ffe6c8', '#5a3a5a', '#fff0d8', [-10, 14, 8], 1.0, 2.6);
  // planeta gigante no céu
  const pl = solidMesh(k, k.ownGeo(new THREE.SphereGeometry(26, 32, 20)), '#4fb7c8', { emissive: '#2fb7b0', ei: 0.25 });
  pl.position.set(30, 38, -150);
  (pl.material as THREE.MeshStandardMaterial).fog = false;
  k.glow('#9ff4ff', 90, 0.35).position.set(30, 38, -152);
  const ring = solidMesh(k, k.ownGeo(new THREE.TorusGeometry(40, 1.6, 3, 60)), '#ffd6a0', { emissive: '#ffb27a', ei: 0.4 });
  ring.position.copy(pl.position);
  ring.rotation.set(1.25, 0.3, 0.2);
  (ring.material as THREE.MeshStandardMaterial).fog = false;
  // terreno: estrada ao longo de x (z≈0), colinas e uma rampa em x≈4
  const road = (x: number) => Math.sin(x * 0.18) * 1.2 + Math.sin(x * 0.07 + 1) * 2 + Math.max(0, 1 - Math.abs(x - 3) / 3) * 1.6 - (x > 3 && x < 12 ? Math.sin(((x - 3) / 9) * Math.PI) * 1.8 : 0);
  const h = (x: number, z: number) => {
    const side = Math.max(0, Math.abs(z) - 2.2);
    return road(x) + side * side * 0.04 + Math.sin(x * 0.5 + z * 0.7) * 0.25 * Math.min(1, side) + Math.sin(z * 0.3 + x * 0.11) * 1.4 * Math.min(1, side / 6);
  };
  const crater = (x: number, z: number) => {
    const d = Math.hypot(x - 18, z + 9);
    return d < 4 ? -Math.cos((d / 4) * Math.PI * 0.5) * 1.2 : 0;
  };
  const geo = terrain(k, 140, 70, k.hi ? 110 : 70, k.hi ? 44 : 28, (x, z) => h(x, z) + crater(x, z), (y, _x, z) => (Math.abs(z) < 2.4 ? '#e6b98a' : y > 2.5 ? '#f2d2b0' : y > 0.5 ? '#d9a882' : '#b8866e'));
  k.mesh(geo, k.std({ flat: true, rough: 0.95 })).position.x = 10;
  // rochas
  const RN = k.hi ? 26 : 14;
  const rocks = new THREE.InstancedMesh(k.ownGeo(new THREE.DodecahedronGeometry(0.6, 0)), k.solid('#a07a6a', { flat: true }), RN);
  const M = new THREE.Matrix4();
  for (let i = 0; i < RN; i++) {
    const x = -20 + ((i * 7.3) % 60);
    const z = (i % 2 ? 1 : -1) * (4 + ((i * 3.1) % 12));
    const s = 0.5 + ((i * 13) % 10) / 8;
    M.compose(new THREE.Vector3(x, h(x - 10, z) + s * 0.2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(i, i * 2, 0)), new THREE.Vector3(s, s * 0.7, s));
    rocks.setMatrixAt(i, M);
  }
  k.scene.add(rocks);
  // buggy
  const car = new THREE.Group();
  const body = k.build('rally-buggy', (b) => {
    b.box(2.2, 0.45, 1.3, 0, 0.35, 0, '#ff8a3d');
    b.box(0.8, 0.3, 1.2, 0.85, 0.75, 0, '#ff6a2a');
    b.box(0.5, 0.25, 1.36, -0.95, 0.75, 0, '#2fb7b0');
    b.tube([[-0.5, 0.75, -0.55], [-0.35, 1.55, -0.5], [0.25, 1.6, -0.5], [0.45, 0.8, -0.55]], 0.06, '#fff2e0', 10, 6);
    b.tube([[-0.5, 0.75, 0.55], [-0.35, 1.55, 0.5], [0.25, 1.6, 0.5], [0.45, 0.8, 0.55]], 0.06, '#fff2e0', 10, 6);
    b.box(0.12, 0.12, 1.1, -0.05, 1.52, 0, '#fff2e0');
    b.sph(0.12, 1.12, 0.6, 0.42, '#fff8c0');
    b.sph(0.12, 1.12, 0.6, -0.42, '#fff8c0');
    b.box(0.3, 0.5, 0.06, -1.1, 0.75, 0.55, '#2fb7b0', 0, 0, -0.3);
    b.box(0.3, 0.5, 0.06, -1.1, 0.75, -0.55, '#2fb7b0', 0, 0, -0.3);
    b.box(0.5, 0.06, 1.3, -1.25, 1.0, 0, '#2fb7b0');
  });
  car.add(new THREE.Mesh(body, k.std({ rough: 0.45 })));
  const wheelG = k.build('rally-wheel', (b) => {
    b.cyl(0.42, 0.42, 0.34, 0, -0.17, 0, '#3a2a3a', 14, Math.PI / 2);
    b.cyl(0.2, 0.2, 0.36, 0, -0.18, 0, '#ffd166', 8, Math.PI / 2);
  }, 0);
  const wm = k.std({ flat: true });
  const wheels: THREE.Mesh[] = [];
  for (const [x, z] of [[0.75, 0.68], [0.75, -0.68], [-0.75, 0.68], [-0.75, -0.68]]) {
    const w = new THREE.Mesh(wheelG, wm);
    w.position.set(x, 0.42, z);
    car.add(w);
    wheels.push(w);
  }
  const bl = k.bloop(1.5, 'happy', car);
  bl.position.set(-0.15, 1.15, 0);
  const lamp = k.glow('#fff4c0', 1.4, 0.8, car);
  lamp.position.set(1.25, 0.6, 0);
  k.scene.add(car);
  const sh = k.blob(1.5, 0.45);
  sh.scale.set(1.4, 1, 1);
  // movimento: x(t), com voo entre T0 e T1
  const X = (t: number) => -14 + t * 7 + t * t * 0.9;
  const T0 = 1.55;
  const T1 = 2.35;
  const grd = (x: number) => h(x - 10, 0);
  const x0 = X(T0);
  const x1 = X(T1);
  const y0 = grd(x0);
  const y1 = grd(x1);
  const vy0 = 5.5;
  const gg = (2 * (y0 + vy0 * (T1 - T0) - y1)) / ((T1 - T0) * (T1 - T0));
  let landed = false;
  let spin = 0;
  const path = k.path([
    { t: 0, p: [-14, 2.2, 7.5], l: [-11, 1.6, 0], fov: 46 },
    { t: 1.3, p: [-2, 2.8, 8.5], l: [0, 2.2, 0] },
    { t: 2.0, p: [5, 1.2, 6.5], l: [4, 3.4, 0], fov: 52 },
    { t: 3.0, p: [17, 2.8, 7.5], l: [14.5, 1.8, 0] },
    { t: 5.0, p: [22, 3.5, 7.5], l: [19, 1.4, 0], fov: 46 },
  ]);
  return {
    dur: 3.3,
    update(t, dt) {
      const x = X(Math.min(t, 3.6));
      let y = grd(x);
      let pitch = Math.atan2(grd(x + 0.6) - grd(x - 0.6), 1.2);
      const air = t > T0 && t < T1;
      if (air) {
        const d = t - T0;
        y = y0 + vy0 * d - 0.5 * gg * d * d;
        pitch = 0.25 - d * 0.6;
      }
      const sp = (X(t + 0.01) - X(t)) / 0.01;
      car.position.set(x, y, 0);
      car.rotation.z = pitch;
      car.position.y += air ? 0 : Math.sin(t * 31) * 0.03;
      spin -= (sp / 0.42) * dt;
      for (const w of wheels) w.rotation.z = spin;
      sh.position.set(x, grd(x) + 0.05, 0);
      (sh.material as THREE.MeshBasicMaterial).opacity = air ? 0.25 : 0.45;
      bl.position.y = 1.15 + (air ? 0.25 : Math.abs(Math.sin(t * 16)) * 0.06);
      if (!air) {
        for (const zz of [0.7, -0.7])
          k.fx.emit(x - 0.9, grd(x) + 0.15, zz, -sp * 0.15 - Math.random(), 0.6 + Math.random() * 0.9, (Math.random() - 0.5) * 1.2, { tile: PT.Smoke, color: '#f0c8a0', life: 0.9, size: 0.45, grow: 1.1, drag: 1.5 });
      }
      if (!landed && t >= T1) {
        landed = true;
        k.fx.burst(x, grd(x) + 0.2, 0, 30, 'poof', '#f5d0aa', 3);
        k.fxAdd.burst(x, grd(x) + 0.3, 0, 20, 'spark', '#ffe0b0', 3);
        k.shake(0.35);
      }
      k.follow(path, t);
    },
    sting(s) {
      for (let i = 0; i < 6; i++) s.tone(i * 0.25, 90 + i * 14, 0.3, 'sawtooth', 0.05, { slide: 1.25 });
      s.whoosh(T0, T1 - T0, 0.25, 700, 3);
      s.boom(T1, 0.45);
      s.tone(T1 + 0.2, 160, 0.6, 'sawtooth', 0.05, { slide: 1.6 });
    },
  };
}
