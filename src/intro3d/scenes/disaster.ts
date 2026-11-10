/* Sobreviva aos Desastres: ilha-vila sob tempestade, meteoros caindo e um tornado; o Bloop escapa pulando nos telhados. */
import * as THREE from 'three';
import { PT } from '../../3d/common/particles';
import type { Kit, Shot } from '../kit';
import { Actor, hopPos, landSq, solidMesh } from './util';

export function disaster(k: Kit): Shot {
  k.sky('#0d1830', '#3a5a9e', '#0d1830', 300, 1.0);
  k.fog('#2a3f70', 22, 80);
  k.lights('#9fb8ff', '#203050', '#ffd0a0', [-6, 10, 6], 1.0, 2.0);
  const fire = new THREE.PointLight('#ff8a1f', 0, 25, 1.5);
  k.scene.add(fire);
  // mar
  const sea = solidMesh(k, k.ownGeo(new THREE.CircleGeometry(120, 32)).rotateX(-Math.PI / 2), '#1e4a8a', { rough: 0.3, metal: 0.2 });
  sea.position.y = -0.6;
  // ilha + casas (uma malha)
  const HS: [number, number, number, string, string][] = [
    [-4, 0, 1.2, '#ffd6a0', '#ff6a4a'],
    [0, -1.5, 1.6, '#c8e0ff', '#3a8aff'],
    [4, 0.5, 1.3, '#ffe9b0', '#ff9a2e'],
    [-1.5, 3, 1.1, '#e0ffd8', '#2fae6a'],
    [6.5, -3, 1.0, '#ffd0e8', '#ff5fa2'],
  ];
  const isl = k.build('dz-island', (b) => {
    b.cyl(13, 14.5, 1.2, 0, -1.2, 0, '#c8a070', 28);
    b.cyl(12.6, 13, 0.25, 0, -0.2, 0, '#4fae5a', 28);
    for (const [x, z, s, w, r] of HS) {
      b.box(2 * s, 1.6 * s, 1.8 * s, x, 0, z, w);
      b.cyl(0, 1.55 * s, 1.1 * s, x, 1.6 * s, z, r, 4, 0, 0, Math.PI / 4);
      b.box(0.45 * s, 0.8 * s, 0.05, x, 0, z + 0.92 * s, '#7a4a2a');
      b.box(0.4 * s, 0.4 * s, 0.05, x + 0.55 * s, 0.85 * s, z + 0.92 * s, '#ffe78a');
    }
    for (let i = 0; i < 9; i++) {
      const a = i * 0.7 + 0.4;
      const r = 8 + (i % 3);
      b.cyl(0.15, 0.2, 0.8, Math.cos(a) * r, 0, Math.sin(a) * r, '#7a5030', 6);
      b.cyl(0, 0.8, 1.8, Math.cos(a) * r, 0.7, Math.sin(a) * r, '#2f8a4a', 7);
    }
  });
  k.mesh(isl, k.std({ flat: true }));
  // tornado: anéis empilhados girando
  const tor = new THREE.Group();
  const tm = k.basic('#c8d4f0', { opacity: 0.42, side: THREE.DoubleSide, depthWrite: false });
  const rings: THREE.Mesh[] = [];
  for (let i = 0; i < 12; i++) {
    const r = 0.5 + i * i * 0.04 + i * 0.18;
    const m = new THREE.Mesh(k.ownGeo(new THREE.CylinderGeometry(r * 1.1, r, 0.8, 14, 1, true)), tm);
    m.position.y = i * 0.75;
    tor.add(m);
    rings.push(m);
  }
  tor.position.set(-9, 0, -5);
  k.scene.add(tor);
  // meteoros
  const metG = k.ownGeo(new THREE.IcosahedronGeometry(0.6, 0));
  const metM = k.solid('#ff6a2a', { emissive: '#ff4a00', ei: 1.4, flat: true });
  const MET: { t0: number; t1: number; from: THREE.Vector3; to: THREE.Vector3; m: THREE.Mesh; g: THREE.Sprite; hit: boolean }[] = [
    [0.4, 1.3, [10, 14, -12], [2.5, 0, -3.5]],
    [1.2, 2.05, [-12, 16, -8], [-5.5, 0, 3.5]],
    [2.0, 2.8, [14, 18, 4], [7, 0, 2]],
  ].map(([t0, t1, f, to]) => {
    const m = new THREE.Mesh(metG, metM);
    k.scene.add(m);
    return { t0: t0 as number, t1: t1 as number, from: new THREE.Vector3(...(f as [number, number, number])), to: new THREE.Vector3(...(to as [number, number, number])), m, g: k.glow('#ff8a1f', 3, 0.9), hit: false };
  });
  const b = new Actor(k, 1.5, 'idle');
  const roof = (i: number): [number, number, number] => [HS[i][0], 2.7 * HS[i][2] - 0.3, HS[i][1]];
  const J: [number, number, number, number][] = [
    [0.9, 1.4, 0, 1],
    [1.75, 2.3, 1, 2],
  ];
  const o = [0, 0, 0, 0];
  const path = k.path([
    { t: 0, p: [-2, 9, 18], l: [0, 1, 0], fov: 48 },
    { t: 1.6, p: [-6, 5, 11], l: [0, 2, -1] },
    { t: 3.0, p: [1, 3.6, 9], l: [3.5, 3.4, 0] },
    { t: 5.2, p: [0, 3.8, 10], l: [3.6, 3.6, 0], fov: 46 },
  ]);
  const V = new THREE.Vector3();
  return {
    dur: 3.4,
    update(t, dt) {
      // Bloop: telhado 0 → 1 → 2
      let sq = 0;
      if (t < J[0][0]) {
        const r = roof(0);
        b.at(r[0], r[1], r[2], Math.sin(t * 14) * 0.04);
      } else {
        const j = t < J[1][0] ? J[0] : J[1];
        hopPos(t, j[0], j[1], roof(j[2]), roof(j[3]), 2.2, o);
        sq = o[3] < 1 ? 0.2 * Math.sin(o[3] * Math.PI) : landSq(t, j[1], 0.4);
        b.at(o[0], o[1], o[2], sq, o[3] < 1 ? 0 : o[1]);
      }
      // tornado
      tor.position.x = -9 + t * 1.6;
      tor.position.z = -5 + Math.sin(t * 0.9) * 1.5;
      rings.forEach((r, i) => {
        r.rotation.y = t * (5 - i * 0.2);
        r.position.x = Math.sin(t * 3 + i * 0.5) * 0.12 * i;
      });
      for (let i = 0; i < 2; i++) {
        const a = Math.random() * 6.28;
        const hh = Math.random() * 8;
        const rr = 0.6 + hh * 0.35;
        k.fx.emit(tor.position.x + Math.cos(a) * rr, hh, tor.position.z + Math.sin(a) * rr, -Math.sin(a) * 4, 0.8, Math.cos(a) * 4, { tile: i ? PT.Chunk : PT.Smoke, color: i ? '#8a6a4a' : '#b8c4e0', life: 0.8, size: i ? 0.12 : 0.9, grow: i ? 0 : 0.6 });
      }
      // meteoros
      let fl = 0;
      for (const m of MET) {
        const u = (t - m.t0) / (m.t1 - m.t0);
        const vis = u > 0 && u < 1;
        m.m.visible = m.g.visible = vis;
        if (vis) {
          V.lerpVectors(m.from, m.to, u * u * 0.4 + u * 0.6);
          m.m.position.copy(V);
          m.m.rotation.set(t * 5, t * 3, 0);
          m.g.position.copy(V);
          for (let i = 0; i < 3; i++) k.fxAdd.emit(V.x + (Math.random() - 0.5) * 0.4, V.y, V.z + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.5, 0.5, 0, { tile: PT.Smoke, color: Math.random() < 0.5 ? '#ff8a1f' : '#ffd04a', life: 0.45, size: 0.9, grow: -1.2 });
          k.fx.emit(V.x, V.y, V.z, 0, 0.4, 0, { tile: PT.Smoke, color: '#3a3a4a', life: 1.2, size: 0.6, grow: 1.4 });
        }
        if (!m.hit && u >= 1) {
          m.hit = true;
          k.fxAdd.burst(m.to.x, 0.4, m.to.z, 40, 'flame', '#ff8a1f', 3);
          k.fxAdd.burst(m.to.x, 0.4, m.to.z, 30, 'spark', '#ffd04a', 5);
          k.fx.burst(m.to.x, 0.3, m.to.z, 20, 'chunk', '#6a4a3a', 4);
          k.fx.burst(m.to.x, 0.3, m.to.z, 14, 'poof', '#5a5a6a', 2);
          k.shake(0.4);
          k.flash(0.3, '#ffb070');
          fire.position.set(m.to.x, 1.5, m.to.z);
        }
        if (m.hit) fl = Math.max(fl, 60 * Math.exp(-(t - m.t1) * 4));
        if (m.hit && Math.random() < 0.6) k.fxAdd.emit(m.to.x + (Math.random() - 0.5), 0.3, m.to.z + (Math.random() - 0.5), 0, 1.2, 0, { tile: PT.Smoke, color: '#ff7a2e', life: 0.6, size: 0.6, grow: -0.6 });
      }
      fire.intensity = fl;
      void dt;
      k.follow(path, t);
    },
    sting(s) {
      s.noise(0, 3.4, 0.12, 400, { q: 0.4, attack: 0.8, type: 'lowpass' });
      for (const [t0, t1] of [[0.4, 1.3], [1.2, 2.05], [2.0, 2.8]]) {
        s.noise(t0, t1 - t0, 0.18, 2000, { slide: 0.2, attack: (t1 - t0) * 0.8 });
        s.boom(t1, 0.5);
      }
      s.tone(0.9, 500, 0.15, 'sine', 0.1, { slide: 1.8 });
      s.tone(1.75, 560, 0.15, 'sine', 0.1, { slide: 1.8 });
    },
  };
}
