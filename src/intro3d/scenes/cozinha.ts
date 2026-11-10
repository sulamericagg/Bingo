/* Cozinha Maluca: o Bloop chef vira a panqueca alto, labareda na frigideira, vapor e confusão de ingredientes. */
import * as THREE from 'three';
import { PT } from '../../3d/common/particles';
import type { Kit, Shot } from '../kit';
import { Actor, landSq } from './util';

export function cozinha(k: Kit): Shot {
  k.sky('#ffd6a0', '#ffb36b', '#ff5a7a', 300, 1.0);
  k.lights('#fff3e0', '#ff8a6a', '#fff2dc', [3, 9, 7], 1.2, 2.3);
  const lampL = new THREE.PointLight('#ffd27a', 18, 12, 1.5);
  lampL.position.set(0, 4.2, 0.5);
  k.scene.add(lampL);
  const room = k.build('cz-room', (b) => {
    // piso xadrez
    for (let i = -6; i < 6; i++) for (let j = -2; j < 5; j++) b.sharp(1, 0.05, 1, i + 0.5, -0.05, j + 0.5, (i + j) & 1 ? '#fff1dc' : '#ff9a8a');
    // parede de azulejos
    b.sharp(13, 7, 0.2, 0, 0, -2.2, '#fff6ea');
    for (let i = -6; i < 6; i++) for (let j = 0; j < 3; j++) b.sharp(0.92, 0.42, 0.04, i + 0.5, 1.6 + j * 0.5, -2.08, (i + j) & 1 ? '#7ad8c8' : '#bff0e6');
    // bancada + fogão
    b.box(9, 1.3, 1.6, 0, 0, -1.2, '#ff7a5a');
    b.box(9.2, 0.14, 1.8, 0, 1.3, -1.2, '#fff6ea');
    for (let i = 0; i < 4; i++) b.box(1.4, 0.9, 0.05, -3.2 + i * 2.1, 0.2, -0.38, '#ff9a7a');
    b.box(2.4, 0.12, 1.4, 0, 1.44, -1.2, '#3a3a4a');
    b.cyl(0.45, 0.45, 0.04, -0.6, 1.56, -1.2, '#5a5a6a', 16);
    b.cyl(0.45, 0.45, 0.04, 0.6, 1.56, -1.2, '#5a5a6a', 16);
    // panela grande com sopa
    b.lathe([[0, 0], [0.6, 0], [0.65, 0.05], [0.65, 0.75], [0.7, 0.8], [0.6, 0.8], [0.55, 0.1]], 0.6, 1.6, -1.25, '#ffcf2e', 18);
    b.cyl(0.56, 0.56, 0.05, 0.6, 2.25, -1.25, '#ff6a2a', 16);
    // prateleira com potes
    b.box(5, 0.12, 0.5, -2.4, 3.8, -1.9, '#c88a5a');
    for (let i = 0; i < 4; i++) b.rcyl(0.22, 0.5, -4 + i * 1.05, 3.92, -1.9, ['#ff7ab8', '#7ad8c8', '#ffd166', '#9fc3ff'][i], 12);
    // luminária pendente
    b.cyl(0.02, 0.02, 2, 0, 4.4, 0.5, '#3a3a4a', 4);
    b.lathe([[0.05, 0], [0.6, -0.1], [0.62, -0.05], [0.12, 0.25], [0.05, 0.3]], 0, 4.3, 0.5, '#ff5a7a', 16);
  });
  k.mesh(room, k.std({ rough: 0.5 }));
  k.glow('#fff0c0', 1.8, 0.8).position.set(0, 4.15, 0.5);
  // frigideira (move ao jogar)
  const pan = new THREE.Group();
  const panG = k.build('cz-pan', (b) => {
    b.lathe([[0, 0], [0.5, 0], [0.55, 0.04], [0.58, 0.14], [0.53, 0.14], [0.48, 0.04], [0, 0.04]], 0, 0, 0, '#2a2a3a', 18);
    b.box(0.9, 0.06, 0.12, 0.95, 0.07, 0, '#ff7a2e');
  }, 1);
  pan.add(new THREE.Mesh(panG, k.std({ rough: 0.4, metal: 0.4 })));
  pan.position.set(-0.6, 1.58, -1.15);
  k.scene.add(pan);
  // panqueca
  const cake = new THREE.Mesh(k.ownGeo(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 18)), k.solid('#f2b25a', { rough: 0.8 }));
  k.scene.add(cake);
  const butter = new THREE.Mesh(k.ownGeo(new THREE.BoxGeometry(0.18, 0.08, 0.18)), k.solid('#fff3a0'));
  cake.add(butter);
  butter.position.y = 0.08;
  // ingredientes voando no clímax
  const ING: { m: THREE.Mesh; v: THREE.Vector3; p: THREE.Vector3; r: THREE.Vector3 }[] = [];
  const ig = [
    [new THREE.SphereGeometry(0.2, 10, 8), '#ff4a3a'],
    [new THREE.CylinderGeometry(0.22, 0.22, 0.06, 14), '#ff6a4a'],
    [new THREE.SphereGeometry(0.16, 8, 6), '#7ad84a'],
    [new THREE.ConeGeometry(0.12, 0.5, 8), '#ff9a2e'],
    [new THREE.BoxGeometry(0.28, 0.28, 0.28), '#fff3a0'],
    [new THREE.TorusGeometry(0.18, 0.06, 6, 12), '#ffd166'],
  ] as const;
  for (let i = 0; i < 8; i++) {
    const [g, c] = ig[i % ig.length];
    const m = new THREE.Mesh(k.ownGeo(g), k.solid(c, { rough: 0.6 }));
    m.visible = false;
    k.scene.add(m);
    ING.push({ m, v: new THREE.Vector3(), p: new THREE.Vector3(), r: new THREE.Vector3(Math.random() * 6, Math.random() * 6, 0) });
  }
  // Bloop chef (sprite + chapéu 3D)
  const b = new Actor(k, 1.9, 'happy');
  const hatG = k.build('cz-hat', (h) => {
    h.cyl(0.36, 0.36, 0.3, 0, 0, 0, '#ffffff', 16);
    h.sph(0.3, -0.2, 0.42, 0, '#ffffff', 1, 0.9, 1, 10);
    h.sph(0.32, 0.18, 0.45, 0, '#ffffff', 1, 0.9, 1, 10);
    h.sph(0.3, 0, 0.6, 0, '#ffffff', 1, 0.9, 1, 10);
  }, 0);
  const hat = new THREE.Mesh(hatG, k.std({ rough: 0.8 }));
  k.scene.add(hat);
  const TF0 = 1.0;
  const TF1 = 2.25;
  let fl = false;
  let hit = false;
  const path = k.path([
    { t: 0, p: [3.5, 2.6, 6.5], l: [-0.4, 1.8, -1], fov: 46 },
    { t: 1.2, p: [1.5, 2.4, 4.2], l: [-0.6, 2.4, -1] },
    { t: 2.2, p: [-1.4, 2.2, 4.6], l: [-0.4, 3.0, -1] },
    { t: 3.2, p: [0.6, 2.6, 6.0], l: [-0.2, 2.7, -1], fov: 48 },
    { t: 5.0, p: [0.9, 2.7, 6.5], l: [-0.2, 2.8, -1], fov: 46 },
  ]);
  return {
    dur: 3.4,
    update(t) {
      // Bloop atrás da bancada, à direita
      const bx = 1.6;
      const hop = t > TF1 ? Math.max(0, Math.sin((t - TF1) * 9)) * 0.35 * Math.exp(-(t - TF1)) : 0;
      b.at(bx, 1.45 + hop, -0.7, landSq(t, TF1, 0.3) + Math.sin(t * 7) * 0.03, 1.45);
      hat.position.set(bx, b.spr.position.y + b.spr.scale.y * 0.28, -0.7);
      hat.rotation.z = Math.sin(t * 6) * 0.08;
      // frigideira dá um tranco antes do lançamento
      const kick = t > TF0 - 0.25 && t < TF0 + 0.15 ? Math.sin(((t - (TF0 - 0.25)) / 0.4) * Math.PI) : 0;
      pan.rotation.z = -kick * 0.35;
      pan.position.y = 1.58 + kick * 0.25;
      // panqueca: no ar entre TF0 e TF1, dá 2 voltas
      const px = -0.6;
      if (t < TF0) cake.position.set(px, 1.67 + pan.position.y - 1.58, -1.15), cake.rotation.set(0, 0, pan.rotation.z);
      else if (t < TF1) {
        const u = (t - TF0) / (TF1 - TF0);
        cake.position.set(px + Math.sin(u * Math.PI) * 0.2, 1.67 + 4 * u * (1 - u) * 2.6, -1.15);
        cake.rotation.set(0, u * 1.5, u * Math.PI * 4);
      } else cake.position.set(px, 1.67, -1.15), cake.rotation.set(0, 1.5, 0);
      // labareda quando a panqueca sobe
      if (t > TF0 && t < TF0 + 0.5) {
        for (let i = 0; i < 4; i++) k.fxAdd.burst(px + (Math.random() - 0.5) * 0.6, 1.75, -1.15, 1, 'flame', Math.random() < 0.5 ? '#ff7a2e' : '#ffd84a', 2.2);
        if (!fl) {
          fl = true;
          k.flash(0.22, '#ffb070');
          k.shake(0.08);
        }
      }
      // vapor da panela
      if (Math.random() < 0.7) k.fx.emit(0.6 + (Math.random() - 0.5) * 0.6, 2.35, -1.25, 0, 0.7, 0.1, { tile: PT.Smoke, color: '#ffffff', life: 1.6, size: 0.4, grow: 0.7 });
      if (!hit && t >= TF1) {
        hit = true;
        k.fx.burst(px, 1.75, -1.15, 16, 'foam', '#fff3a0', 2);
        k.fxAdd.burst(px, 1.8, -1.15, 40, 'spark', '#ffd84a', 4);
        k.shake(0.2);
        ING.forEach((g, i) => {
          g.m.visible = true;
          g.p.set(0.6, 2.3, -1.2);
          const a = (i / ING.length) * Math.PI - Math.PI * 0.9;
          g.v.set(Math.cos(a) * 2.6, 5 + Math.random() * 1.5, 1.4 + Math.random());
        });
      }
      if (hit) {
        const d = t - TF1;
        for (const g of ING) {
          g.m.position.set(g.p.x + g.v.x * d, g.p.y + g.v.y * d - 4.9 * d * d, g.p.z + g.v.z * d);
          g.m.rotation.set(g.r.x * d * 3, g.r.y * d * 3, 0);
        }
      }
      k.follow(path, t);
    },
    sting(s) {
      s.noise(0, 1.0, 0.05, 3000, { type: 'highpass', attack: 0.3 });
      s.tone(TF0, 300, 0.4, 'sine', 0.15, { slide: 2.5 });
      s.noise(TF0, 0.5, 0.2, 1200, { q: 0.6, slide: 0.4 });
      s.tone(TF1, 180, 0.15, 'square', 0.08, { slide: 0.5 });
      s.noise(TF1, 0.2, 0.18, 2500, { q: 1 });
      s.sparkle(TF1 + 0.1, 1318);
    },
  };
}
