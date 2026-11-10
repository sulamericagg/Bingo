/* Meu Bichinho: quarto aconchegante; o Bloop acorda na caminha, se espreguiça e pula para a câmera soltando corações. */
import * as THREE from 'three';
import { PT } from '../../3d/common/particles';
import type { Kit, Shot } from '../kit';
import { Actor, extrude, heartShape, hopPos, landSq } from './util';

export function pet(k: Kit): Shot {
  k.sky('#ffd6e8', '#ffe8f2', '#ffd6e8');
  k.lights('#fff4fa', '#ffb8d6', '#fff2e0', [-4, 8, 6], 1.3, 1.8);
  const lamp = new THREE.PointLight('#ffd6a0', 14, 10, 1.6);
  lamp.position.set(3, 2.5, 0);
  k.scene.add(lamp);
  const room = k.build('pet-room', (b) => {
    b.sharp(14, 0.1, 10, 0, -0.1, 1, '#e8b483');
    for (let i = -6; i <= 6; i++) b.sharp(0.03, 0.005, 10, i + 0.5, 0, 1, '#c88a5a');
    b.sharp(14, 7, 0.2, 0, 0, -3.5, '#ffd6e8');
    b.sharp(0.2, 7, 10, -6, 0, 1, '#ffc2dc');
    // bolinhas na parede
    for (let i = 0; i < 26; i++) b.cyl(0.13, 0.13, 0.02, -6.5 + (i % 9) * 1.6 + (Math.floor(i / 9) % 2) * 0.8, 1.2 + Math.floor(i / 9) * 1.5, -3.38, '#ffffff', 10, Math.PI / 2);
    // janela
    b.box(2.6, 2.0, 0.12, 1.8, 2.4, -3.35, '#ffffff');
    b.sharp(2.2, 1.6, 0.05, 1.8, 2.6, -3.27, '#8fd3ff');
    b.sharp(0.08, 1.6, 0.06, 1.8, 2.6, -3.24, '#ffffff');
    b.sharp(2.2, 0.08, 0.06, 1.8, 3.36, -3.24, '#ffffff');
    // tapete redondo
    b.cyl(2.2, 2.2, 0.04, 0, 0, 0.6, '#ff9ec7', 28);
    b.cyl(1.6, 1.6, 0.05, 0, 0, 0.6, '#ffd36b', 28);
    // caminha (almofada + borda)
    b.cyl(1.0, 1.05, 0.25, -2.6, 0, -1.4, '#8a5cff', 20);
    b.torus(1.0, 0.28, -2.6, 0.32, -1.4, '#a888ff', Math.PI / 2, 22);
    // tigela
    b.lathe([[0, 0], [0.4, 0], [0.5, 0.25], [0.45, 0.25], [0.36, 0.06], [0, 0.06]], 2.8, 0, -0.6, '#5ef0ff', 16);
    b.sph(0.32, 2.8, 0.14, -0.6, '#ffb36b', 1, 0.4, 1, 10);
    // prateleira com plantinha e abajur
    b.box(1.2, 1.4, 0.8, 4.2, 0, -2.6, '#ffffff');
    b.rcyl(0.25, 0.4, 4.0, 1.4, -2.6, '#ff8a5c', 12);
    b.sph(0.35, 4.0, 2.0, -2.6, '#4ccf7a', 1, 1.1, 1, 8);
    b.lathe([[0.25, 0], [0.4, 0], [0.18, 0.8], [0.05, 0.8]], 4.5, 1.4, -2.5, '#ffe27a', 12);
  });
  k.mesh(room, k.std({ rough: 0.7 }));
  k.glow('#ffe8b0', 2.4, 0.6).position.set(4.5, 2.3, -2.3);
  k.glow('#e0f6ff', 5, 0.35).position.set(1.8, 2.6, -3.1);
  // luzinhas no varal
  const LN = 9;
  for (let i = 0; i < LN; i++) {
    const x = -5 + i * 1.2;
    const y = 4.7 - Math.sin((i / (LN - 1)) * Math.PI) * 0.5;
    k.glow(['#ffe27a', '#ff7ab8', '#7af0ff'][i % 3], 0.8, 0.9).position.set(x, y, -3.2);
  }
  // bola
  const ball = new THREE.Mesh(k.ownGeo(new THREE.SphereGeometry(0.32, 16, 12)), k.solid('#ff5fa2', { rough: 0.4 }));
  k.scene.add(ball);
  // corações
  const hg = extrude(k, heartShape(0.3), 0.14);
  const hm = k.solid('#ff5fa2', { emissive: '#ff2a7a', ei: 0.5, rough: 0.35 });
  const hearts = Array.from({ length: 7 }, (_, i) => {
    const m = new THREE.Mesh(hg, hm);
    m.visible = false;
    k.scene.add(m);
    return { m, a: (i / 7) * Math.PI * 2, d: 0.15 + (i % 3) * 0.12 };
  });
  const b = new Actor(k, 1.7, 'idle');
  const sleepy = k.bloop(1.7, 'happy');
  sleepy.visible = false;
  const bed: [number, number, number] = [-2.6, 0.22, -1.4];
  const mid: [number, number, number] = [-0.4, 0.04, 0.4];
  const front: [number, number, number] = [0.3, 0.04, 2.0];
  const o = [0, 0, 0, 0];
  const T1: [number, number] = [1.0, 1.55];
  const T2: [number, number] = [1.8, 2.4];
  let pop = false;
  const zs: { s: THREE.Sprite; t0: number }[] = [];
  const path = k.path([
    { t: 0, p: [-0.5, 2.4, 3.6], l: [-2.6, 0.8, -1.4], fov: 44 },
    { t: 1.4, p: [1.2, 2.2, 5.5], l: [-1.2, 1.0, -0.5] },
    { t: 2.6, p: [0.8, 1.6, 6.2], l: [0.3, 1.5, 1.6], fov: 48 },
    { t: 5.0, p: [0.9, 1.7, 6.6], l: [0.3, 1.6, 1.4], fov: 46 },
  ]);
  void zs;
  return {
    dur: 3.3,
    update(t) {
      let sq = 0;
      if (t < T1[0]) {
        // dormindo: respira, depois acorda e se estica
        const br = Math.sin(t * 4) * 0.05;
        const wake = Math.max(0, (t - 0.6) / 0.4);
        sq = t < 0.6 ? -0.12 + br : -0.12 + wake * 0.4 * Math.sin(wake * Math.PI);
        b.at(bed[0], bed[1], bed[2], sq);
        if (Math.random() < 0.08 && t < 0.6) k.fxAdd.emit(bed[0] + 0.4, 1.4, bed[2], 0.2, 0.6, 0, { tile: PT.Foam, color: '#c9a6ff', life: 0.8, size: 0.15, grow: 0.2 });
      } else if (t < T2[0]) {
        hopPos(t, T1[0], T1[1], bed, mid, 1.3, o);
        sq = o[3] < 1 ? 0.2 * Math.sin(o[3] * Math.PI) : landSq(t, T1[1], 0.35);
        b.at(o[0], o[1], o[2], sq, o[3] < 1 ? 0.04 : o[1]);
      } else {
        hopPos(t, T2[0], T2[1], mid, front, 1.8, o);
        sq = o[3] < 1 ? 0.25 * Math.sin(o[3] * Math.PI) : landSq(t, T2[1], 0.45);
        let y = o[1];
        if (t > T2[1] + 0.5) {
          const u = ((t - T2[1] - 0.5) % 0.5) / 0.5;
          y += 4 * u * (1 - u) * 0.35;
        }
        b.at(o[0], y, o[2], sq, 0.04);
      }
      // a bola rola pelo tapete
      const bx = 1.6 - Math.min(1, t / 3) * 2.2;
      ball.position.set(bx, 0.36, 0.3 + Math.sin(t) * 0.3);
      ball.rotation.z = -bx / 0.32;
      if (!pop && t >= T2[1]) {
        pop = true;
        hearts.forEach((h) => (h.m.visible = true));
        k.fxAdd.burst(front[0], 1.0, front[2], 40, 'spark', '#ffb8d6', 3.5);
        k.flash(0.2, '#ffe0f0');
      }
      if (pop) {
        const d = t - T2[1];
        hearts.forEach((h, i) => {
          const r = 0.4 + d * 1.6;
          h.m.position.set(front[0] + Math.cos(h.a) * r, 1.2 + d * (1.1 + h.d) + Math.sin(h.a) * r * 0.5, front[2] - 0.3);
          h.m.scale.setScalar(Math.min(1, d * 5) * (1 + 0.1 * Math.sin(t * 10 + i)) * Math.max(0, 1 - Math.max(0, d - 1.6)));
          h.m.rotation.set(0, Math.sin(t * 3 + i) * 0.6, Math.sin(t * 2 + i) * 0.2);
        });
      }
      k.follow(path, t);
    },
    sting(s) {
      s.tone(0.2, 260, 0.5, 'sine', 0.06, { slide: 0.8 });
      s.tone(0.7, 520, 0.35, 'sine', 0.1, { slide: 1.5 });
      s.tone(T1[0], 600, 0.2, 'triangle', 0.1, { slide: 1.4 });
      s.tone(T2[0], 700, 0.25, 'triangle', 0.1, { slide: 1.5 });
      s.chord(T2[1], [784, 988, 1175], 0.6, 'sine', 0.06);
      s.sparkle(T2[1] + 0.05, 1568);
    },
  };
}
