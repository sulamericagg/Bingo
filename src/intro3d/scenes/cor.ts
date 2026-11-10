/* Pintou, Ganhou!: roda de cores girando, o Bloop pula no centro e a tinta explode em anéis coloridos. */
import * as THREE from 'three';
import { PT } from '../../3d/common/particles';
import type { Kit, Shot } from '../kit';
import { Actor, hopPos, landSq } from './util';

const PAL = ['#ff3b5c', '#ff8a2e', '#ffd166', '#7ad84a', '#2fd3c0', '#3a8aff', '#8a5cff', '#ff5ecf'];

export function cor(k: Kit): Shot {
  k.sky('#3a1a7a', '#5b3aa8', '#2a1060', 300, 1.1);
  k.lights('#fff0ff', '#5b3aa8', '#ffffff', [3, 10, 8], 1.1, 2.2);
  const floor = k.build('cor-floor', (b) => {
    b.cyl(14, 14, 0.2, 0, -0.2, 0, '#fff4fa', 40);
    b.cyl(3.4, 3.6, 0.5, 0, 0, 0, '#2a1a4a', 32);
  });
  k.mesh(floor, k.std({ rough: 0.6 }));
  // roda de cores (fatias separadas para voarem no clímax)
  const wheel = new THREE.Group();
  wheel.position.y = 0.55;
  k.scene.add(wheel);
  const N = PAL.length;
  const wedges = PAL.map((c, i) => {
    const g = k.ownGeo(new THREE.CylinderGeometry(3.1, 3.1, 0.22, 6, 1, false, (i / N) * Math.PI * 2 + 0.02, (Math.PI * 2) / N - 0.04));
    const m = new THREE.Mesh(g, k.solid(c, { rough: 0.35, emissive: c, ei: 0.15 }));
    wheel.add(m);
    return { m, a: ((i + 0.5) / N) * Math.PI * 2 };
  });
  const hub = new THREE.Mesh(k.ownGeo(new THREE.CylinderGeometry(0.7, 0.7, 0.3, 20)), k.solid('#ffffff', { rough: 0.3 }));
  hub.position.y = 0.1;
  wheel.add(hub);
  // potes de tinta em volta
  const pots = k.build('cor-pots', (b) => {
    PAL.forEach((c, i) => {
      const a = (i / N) * Math.PI * 2;
      const x = Math.cos(a) * 5.2;
      const z = Math.sin(a) * 5.2;
      b.rcyl(0.45, 0.7, x, 0, z, '#ffffff', 14);
      b.cyl(0.4, 0.4, 0.05, x, 0.68, z, c, 14);
    });
  });
  k.mesh(pots, k.std({ rough: 0.4 }));
  // anéis de tinta que se expandem no chão
  const ringG = k.ownGeo(new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2));
  const rings = Array.from({ length: 6 }, (_, i) => {
    const m = new THREE.Mesh(ringG, k.basic(PAL[(i * 3) % N], { opacity: 0, depthWrite: false }));
    m.position.y = 0.02;
    k.scene.add(m);
    return m;
  });
  // gotas voando
  const blobG = k.ownGeo(new THREE.SphereGeometry(0.22, 10, 8));
  const blobs = Array.from({ length: 16 }, (_, i) => {
    const m = new THREE.Mesh(blobG, k.solid(PAL[i % N], { rough: 0.2 }));
    m.visible = false;
    k.scene.add(m);
    const a = (i / 16) * Math.PI * 2;
    return { m, v: new THREE.Vector3(Math.cos(a) * (4 + (i % 3)), 5 + (i % 4), Math.sin(a) * (4 + (i % 3))) };
  });
  const b = new Actor(k, 1.8, 'happy');
  const start: [number, number, number] = [0, 0, 5.6];
  const mid: [number, number, number] = [0, 0.77, 0];
  const J: [number, number] = [0.9, 1.75];
  const BURST = 1.75;
  let burst = false;
  const path = k.path([
    { t: 0, p: [0, 9, 9], l: [0, 0.5, 0], fov: 48 },
    { t: 1.5, p: [5.5, 4.5, 7], l: [0, 1, 0] },
    { t: 3.0, p: [2.5, 2.6, 8], l: [0, 1.6, 0], fov: 50 },
    { t: 5.0, p: [2.0, 2.8, 8.6], l: [0, 1.8, 0], fov: 46 },
  ]);
  const o = [0, 0, 0, 0];
  return {
    dur: 3.2,
    update(t) {
      wheel.rotation.y = t * (t < BURST ? 2.2 : 0.6);
      // Bloop: espera, pulo alto até o centro
      if (t < J[0]) b.at(start[0], start[1], start[2], Math.sin(t * 10) * 0.05 - (t > J[0] - 0.2 ? 0.25 : 0));
      else {
        hopPos(t, J[0], J[1], start, mid, 3.5, o);
        let y = o[1];
        if (t > J[1] + 0.5) {
          const u = ((t - J[1] - 0.5) % 0.5) / 0.5;
          y += 4 * u * (1 - u) * 0.5;
        }
        b.at(o[0], y, o[2], o[3] < 1 ? 0.25 * Math.sin(o[3] * Math.PI) : landSq(t, J[1], 0.5), o[3] < 1 ? 0 : mid[1]);
      }
      if (!burst && t >= BURST) {
        burst = true;
        PAL.forEach((c, i) => {
          const a = (i / N) * Math.PI * 2;
          for (let j = 0; j < 8; j++)
            k.fx.emit(Math.cos(a) * 1.5, 1, Math.sin(a) * 1.5, Math.cos(a) * (3 + Math.random() * 3), 3 + Math.random() * 4, Math.sin(a) * (3 + Math.random() * 3), { tile: j % 2 ? PT.Foam : PT.Chunk, color: c, life: 1.6, size: 0.2 + Math.random() * 0.15, grav: 7 });
        });
        k.fxAdd.burst(0, 1.4, 0, 50, 'spark', '#ffffff', 5);
        blobs.forEach((bl) => (bl.m.visible = true));
        k.flash(0.4, '#ffe6f6');
        k.shake(0.3);
      }
      if (burst) {
        const d = t - BURST;
        // fatias se abrem e voltam (mola)
        const e = 12 * d * Math.exp(-d * 4);
        wedges.forEach((w) => w.m.position.set(Math.sin(w.a) * e, e * 0.4, Math.cos(w.a) * e));
        rings.forEach((r, i) => {
          const u = d - i * 0.18;
          const on = u > 0;
          r.visible = on;
          if (on) {
            r.scale.setScalar(1 + u * 7);
            (r.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.85 - u * 0.55);
          }
        });
        blobs.forEach((bl) => {
          const yy = 1 + bl.v.y * d - 6 * d * d;
          bl.m.position.set(bl.v.x * d, Math.max(0.1, yy), bl.v.z * d);
          bl.m.scale.set(1, yy > 0.1 ? 1 : 0.2, 1).multiplyScalar(yy > 0.1 ? 1 : 2.2);
        });
      }
      k.follow(path, t);
    },
    sting(s) {
      for (let i = 0; i < 8; i++) s.tone(i * 0.11, 523 * Math.pow(2, i / 8), 0.12, 'triangle', 0.05);
      s.tone(J[0], 330, 0.5, 'sine', 0.16, { slide: 2.4 });
      s.noise(BURST, 0.5, 0.25, 900, { q: 0.6, slide: 0.4 });
      s.boom(BURST, 0.35);
      s.sparkle(BURST + 0.05, 1568);
    },
  };
}
