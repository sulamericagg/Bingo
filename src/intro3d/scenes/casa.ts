/* Minha Casa: casinha numa ilha flutuante ao entardecer; câmera dá a volta, janelas acendem, o Bloop acena na porta. */
import * as THREE from 'three';
import { PT } from '../../3d/common/particles';
import { type Kit, type Shot, setInst } from '../kit';
import { Actor, hopPos, landSq } from './util';

export function casa(k: Kit): Shot {
  k.sky('#3a5cc8', '#ffc8a0', '#8fd3ff', 300, 1.0);
  k.stars(k.hi ? 200 : 100, 220, 1.4, 11);
  k.lights('#dfe8ff', '#7a6aa0', '#ffd8a8', [-8, 9, 6], 1.1, 2.4);
  k.glow('#ffd8a0', 70, 0.5).position.set(-60, 12, -120);
  const house = k.build('casa-house', (b) => {
    // ilha: topo de grama + base rochosa
    b.cyl(6, 6.2, 0.6, 0, -0.6, 0, '#6ad06a', 18);
    b.cyl(6.2, 0.6, 5, 0, -5.6, 0, '#9a7a62', 9);
    b.cyl(4.2, 1.0, 3, 1, -7.4, 0.5, '#86685a', 8);
    // casa
    b.box(4.0, 2.6, 3.2, 0, 0, -0.6, '#fff1dc');
    b.box(4.3, 0.25, 3.5, 0, 0, -0.6, '#d8b890');
    b.lathe([[2.7 * Math.SQRT2, 0], [0.05, 1.8]], 0, 2.55, -0.6, '#ff6a5a', 4, 0, 0, Math.PI / 4);
    b.box(0.6, 1.4, 0.6, 1.2, 3.0, -1.1, '#c8645a');
    b.box(0.95, 1.55, 0.1, 0, 0, 1.0, '#a8643a');
    b.sph(0.06, 0.3, 0.8, 1.08, '#ffd34a', 1, 1, 1, 6);
    // degraus e caminho
    b.box(1.4, 0.15, 0.6, 0, 0, 1.3, '#d8c8b0');
    for (let i = 0; i < 5; i++) b.cyl(0.4, 0.4, 0.05, 0.2 * Math.sin(i), 0, 2.1 + i * 0.75, '#e8d8c0', 10);
    // cerca
    for (let i = -5; i <= 5; i++) if (Math.abs(i) > 1) b.box(0.12, 0.7, 0.12, i * 0.5, 0, 4.6, '#ffffff');
    b.box(2.0, 0.08, 0.06, -1.75, 0.45, 4.6, '#ffffff');
    b.box(2.0, 0.08, 0.06, 1.75, 0.45, 4.6, '#ffffff');
    // canteiros
    for (let i = 0; i < 10; i++) b.sph(0.13, -2.3 + (i % 5) * 0.3, 0.12, 1.4 + Math.floor(i / 5) * 0.3, ['#ff7ab8', '#ffd34a'][i % 2], 1, 1, 1, 6);
    // árvores
    b.cyl(0.2, 0.25, 1.4, -4, 0, -1.5, '#8a5a32', 7);
    b.sph(1.1, -4, 2.0, -1.5, '#3aae58', 1, 1, 1, 7);
    b.sph(0.8, -3.6, 2.7, -1.2, '#4fc06a', 1, 1, 1, 7);
    b.cyl(0.18, 0.22, 1.0, 4, 0, 1.2, '#8a5a32', 7);
    b.sph(0.8, 4, 1.5, 1.2, '#4fc06a', 1, 1, 1, 7);
  });
  k.mesh(house, k.std({ flat: true, rough: 0.75 }));
  // janelas (emissivas, acendem)
  const winM = k.solid('#ffe8a0', { emissive: '#ffb84a', ei: 0 }) as THREE.MeshStandardMaterial;
  const wg = k.ownGeo(new THREE.BoxGeometry(0.75, 0.75, 0.06));
  const wins: THREE.Sprite[] = [];
  for (const [x, z, ry] of [[-1.25, 1.0, 0], [1.25, 1.0, 0], [2.02, -0.6, Math.PI / 2], [-2.02, -0.6, Math.PI / 2]] as [number, number, number][]) {
    const w = new THREE.Mesh(wg, winM);
    w.position.set(x, 1.5, z);
    w.rotation.y = ry;
    k.scene.add(w);
    const g = k.glow('#ffc870', 1.8, 0);
    g.position.set(x * 1.05, 1.5, z + (ry ? 0 : 0.2));
    wins.push(g);
  }
  // nuvens
  const CN = 8;
  const clouds = new THREE.InstancedMesh(k.ownGeo(new THREE.IcosahedronGeometry(1, 1)), k.solid('#ffffff', { flat: true, rough: 1, emissive: '#ffd8e8', ei: 0.25 }), CN * 3);
  k.scene.add(clouds);
  const cd = Array.from({ length: CN }, (_, i) => ({ a: (i / CN) * Math.PI * 2, r: 13 + (i % 3) * 4, y: -3 + (i % 4) * 2.2, s: 1 + (i % 3) * 0.4 }));
  const b = new Actor(k, 1.5, 'happy');
  const P0: [number, number, number] = [0.3, 0, 4.0];
  const P1: [number, number, number] = [0, 0.15, 1.6];
  const o = [0, 0, 0, 0];
  let lit = false;
  const path = k.path([
    { t: 0, p: [-14, 4, 6], l: [0, 0, 0], fov: 46 },
    { t: 1.6, p: [-5, 5, 12], l: [0, 0.8, 0] },
    { t: 3.0, p: [3.5, 3, 10], l: [0, 1.7, 0.5], fov: 48 },
    { t: 5.0, p: [4.2, 3.1, 10.6], l: [0, 1.8, 0.5], fov: 46 },
  ]);
  return {
    dur: 3.4,
    update(t) {
      // Bloop pula pelo caminho até a porta (3 pulinhos) e acena
      if (t < 1.0) b.at(P0[0], P0[1], P0[2], Math.sin(t * 8) * 0.04);
      else if (t < 2.4) {
        const n = Math.min(2, Math.floor((t - 1.0) / 0.47));
        const a: [number, number, number] = [P0[0] + (P1[0] - P0[0]) * (n / 3), 0, P0[2] + (P1[2] - P0[2]) * (n / 3)];
        const c: [number, number, number] = [P0[0] + (P1[0] - P0[0]) * ((n + 1) / 3), n === 2 ? P1[1] : 0, P0[2] + (P1[2] - P0[2]) * ((n + 1) / 3)];
        hopPos(t, 1.0 + n * 0.47, 1.0 + (n + 1) * 0.47 - 0.07, a, c, 0.7, o);
        b.at(o[0], o[1], o[2], o[3] < 1 ? 0.18 * Math.sin(o[3] * Math.PI) : landSq(t, 1.0 + (n + 1) * 0.47 - 0.07, 0.3), o[3] < 1 ? 0 : o[1]);
      } else {
        const u = ((t - 2.4) % 0.55) / 0.55;
        b.at(P1[0], P1[1] + 4 * u * (1 - u) * 0.4, P1[2], 0.12 * Math.sin(u * Math.PI), P1[1]);
      }
      // janelas acendem em sequência
      const L = Math.min(1, Math.max(0, (t - 2.2) * 2.5));
      winM.emissiveIntensity = L * 1.6;
      wins.forEach((w, i) => ((w.material as THREE.SpriteMaterial).opacity = Math.min(1, Math.max(0, (t - 2.2 - i * 0.08) * 3)) * 0.8));
      if (!lit && t > 2.25) {
        lit = true;
        k.fxAdd.burst(0, 2.0, 1.2, 40, 'spark', '#ffe8a0', 3.5);
      }
      // fumaça da chaminé
      if (Math.random() < 0.4) k.fx.emit(1.2 + (Math.random() - 0.5) * 0.2, 4.5, -1.1, 0.4, 0.8, 0, { tile: PT.Smoke, color: '#f0e8f0', life: 2.2, size: 0.5, grow: 0.8 });
      // vagalumes
      if (Math.random() < 0.3) k.fxAdd.emit((Math.random() - 0.5) * 10, Math.random() * 3, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 0.4, 0.3, 0, { tile: PT.Spark, color: '#fff6a0', life: 1.6, size: 0.12 });
      for (let i = 0; i < CN; i++) {
        const d = cd[i];
        const a = d.a + t * 0.05;
        const x = Math.cos(a) * d.r;
        const z = Math.sin(a) * d.r;
        for (let j = 0; j < 3; j++) setInst(clouds, i * 3 + j, x + (j - 1) * d.s * 1.1, d.y + (j === 1 ? 0.4 : 0), z, 0, a, 0, d.s * (j === 1 ? 1.25 : 0.9), d.s * 0.75, d.s);
      }
      clouds.instanceMatrix.needsUpdate = true;
      k.follow(path, t);
    },
    sting(s) {
      s.chord(0, [392, 494, 587], 1.6, 'sine', 0.04);
      for (let i = 0; i < 3; i++) s.tone(1.0 + i * 0.47, 600 + i * 100, 0.15, 'triangle', 0.08, { slide: 1.4 });
      s.sparkle(2.25, 1318);
      s.chord(2.25, [523, 659, 784], 1.2, 'triangle', 0.05);
    },
  };
}
