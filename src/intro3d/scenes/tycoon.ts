/* Fábrica Estelar: esteira levando estrelas douradas, máquina que prensa e solta brilho, estrela gigante no topo. */
import * as THREE from 'three';
import { PT } from '../../3d/common/particles';
import { setInst, type Kit, type Shot } from '../kit';
import { Actor, extrude, landSq, solidMesh, starShape } from './util';

export function tycoon(k: Kit): Shot {
  k.sky('#06140e', '#1f6a3a', '#0a1a10', 300, 1.1);
  k.stars(k.hi ? 500 : 250, 200, 1.6, 5);
  k.fog('#123a26', 16, 70);
  k.lights('#c8ffd8', '#1d2a14', '#fff2c8', [6, 12, 8], 0.9, 2.2);
  const warm = new THREE.PointLight('#ffcf2e', 30, 18, 1.6);
  warm.position.set(2, 4, 2);
  k.scene.add(warm);
  // chão e fábrica (uma malha)
  const fac = k.build('ty-factory', (b) => {
    b.sharp(60, 0.2, 40, 0, -0.2, 0, '#1d4a2c');
    for (let i = -5; i <= 5; i++) b.sharp(0.05, 0.01, 40, i * 3, 0, 0, '#2a6a3e');
    // esteira
    b.box(14, 0.5, 1.6, 0, 0.6, 0, '#3a4a40');
    b.box(14, 0.08, 1.4, 0, 1.1, 0, '#22302a');
    for (let i = -6; i <= 6; i += 2) b.box(0.25, 0.6, 0.25, i, 0, 0.7, '#5a6a60'), b.box(0.25, 0.6, 0.25, i, 0, -0.7, '#5a6a60');
    // máquina-prensa
    b.box(2.6, 2.6, 2.6, -2, 0, -0.2, '#2fae6a');
    b.box(2.0, 0.5, 2.8, -2, 2.6, -0.2, '#ffcf2e');
    b.box(1.8, 0.9, 0.2, -2, 1.05, 1.15, '#123a26');
    b.cyl(0.35, 0.45, 2.6, -2.8, 3.1, -0.9, '#3ee07a', 12);
    b.torus(0.42, 0.08, -2.8, 5.6, -0.9, '#ffcf2e');
    // funil de entrada
    b.frustum(1.2, 1.2, 2.4, 2.4, 1.6, -6.5, 1.1, 0, '#3ee07a');
    // tanque e canos
    b.cyl(1.1, 1.1, 3.2, 3.5, 0, -3.2, '#2fae6a', 16);
    b.sph(1.1, 3.5, 3.2, -3.2, '#3ee07a', 1, 0.6, 1, 14);
    b.tube([[3.5, 2.6, -2.2], [3.5, 3.5, -1], [0.5, 3.5, -0.5], [-0.8, 2.9, -0.4]], 0.18, '#ffcf2e', 18, 8);
    // caixote final
    b.box(2, 1.0, 2, 8.2, 0, 0, '#c8862a');
    b.box(2.1, 0.12, 2.1, 8.2, 1.0, 0, '#e8a83a');
    // prédio ao fundo com chaminés
    b.box(18, 6, 4, 0, 0, -10, '#174a30');
    b.cyl(0.6, 0.8, 5, -5, 6, -10, '#2a6a3e', 10);
    b.cyl(0.6, 0.8, 4, 4, 6, -10, '#2a6a3e', 10);
    for (let i = 0; i < 6; i++) b.box(1.2, 1.2, 0.1, -7 + i * 2.8, 2.8, -7.95, '#ffe78a');
  });
  k.mesh(fac, k.std({ rough: 0.7 }));
  // estrelas na esteira (instanciadas, emissivas)
  const starG = extrude(k, starShape(0.42), 0.18);
  const NS = 7;
  const stars = new THREE.InstancedMesh(starG, k.solid('#ffcf2e', { emissive: '#ffb000', ei: 0.9, rough: 0.3, metal: 0.3 }), NS);
  k.scene.add(stars);
  const glows = Array.from({ length: NS }, () => k.glow('#ffd84a', 1.6, 0.5));
  // estrela-letreiro gigante
  const big = solidMesh(k, extrude(k, starShape(1.6), 0.5), '#ffe24a', { emissive: '#ffb000', ei: 1.3, rough: 0.25, metal: 0.4 });
  big.position.set(0, 9.5, -9);
  const bigGlow = k.glow('#ffd84a', 9, 0.6);
  bigGlow.position.set(0, 9.5, -9.4);
  const b = new Actor(k, 2.3, 'happy');
  const BX = 6.2;
  let pressed = -1;
  let big0 = false;
  const path = k.path([
    { t: 0, p: [-9, 1.8, 5.5], l: [-4, 1.6, 0], fov: 50 },
    { t: 1.4, p: [-1, 2.4, 6.5], l: [2, 1.8, 0] },
    { t: 2.4, p: [6, 3, 8], l: [4, 2.6, -1] },
    { t: 3.3, p: [4.5, 4.6, 10.5], l: [3, 4.4, -3], fov: 50 },
    { t: 5.2, p: [5, 4.9, 11.2], l: [3, 4.7, -3], fov: 47 },
  ]);
  const press = new THREE.Mesh(k.ownGeo(new THREE.BoxGeometry(1.4, 0.4, 1.2)), k.solid('#ffcf2e', { metal: 0.4, rough: 0.35 }));
  k.scene.add(press);
  return {
    dur: 3.5,
    update(t) {
      // prensa sobe/desce a cada 0.5 s
      const ph = (t * 2) % 1;
      press.position.set(-2, 1.3 + 0.9 * (ph < 0.25 ? 1 - ph / 0.25 : Math.min(1, (ph - 0.25) / 0.6)), 1.4);
      const pc = Math.floor(t * 2);
      if (pc !== pressed && ph >= 0.24) {
        pressed = pc;
        k.fxAdd.burst(-2, 1.3, 1.4, 14, 'spark', '#ffe78a', 2.5);
      }
      // estrelas: saem da prensa (x=-2) e correm até a ponta, caindo no caixote/no Bloop
      for (let i = 0; i < NS; i++) {
        const u = (t * 1.15 + i / NS * 3.5) % 3.5; // 0..3.5
        let x = -1.6 + u * 2.6;
        let y = 1.5;
        let s = Math.min(1, u * 4);
        if (x > BX - 0.6) {
          // salta para o Bloop e some com brilho
          const v = (x - (BX - 0.6)) / 2.6;
          x = BX - 0.6 + v * 1.5;
          y = 1.5 + 4 * v * (1 - v) * 1.8;
          s *= Math.max(0, 1 - v * 1.2);
        }
        setInst(stars, i, x, y, 0, 0, t * 2 + i, 0, s);
        glows[i].position.set(x, y, 0.2);
        glows[i].scale.setScalar(1.6 * s);
      }
      stars.instanceMatrix.needsUpdate = true;
      // Bloop pulando de alegria na ponta
      const hp = (t % 0.6) / 0.6;
      b.at(BX + 1.2, 1.12 + 4 * hp * (1 - hp) * 0.7 * (t > 2.6 ? 1.5 : 1), 0.4, landSq(hp * 0.6, 0, 0.35) + 0.15 * Math.sin(hp * Math.PI), 1.12);
      b.shadow.position.y = 1.15;
      // estrela gigante acende e solta brilhos no clímax
      big.rotation.y = Math.sin(t * 1.2) * 0.5;
      const lit = Math.min(1, Math.max(0, (t - 2.6) * 3));
      bigGlow.scale.setScalar(9 + lit * 6 + Math.sin(t * 6) * 0.4);
      (bigGlow.material as THREE.SpriteMaterial).opacity = 0.35 + lit * 0.5;
      if (!big0 && t > 2.75) {
        big0 = true;
        k.fxAdd.burst(0, 9.5, -8.6, 70, 'spark', '#ffe78a', 6);
        k.flash(0.35, '#fff6b0');
      }
      if (Math.random() < 0.5) k.fx.emit(-5 + (Math.random() - 0.5) * 0.5, 11, -10, 0.2, 1.2, 0, { tile: PT.Smoke, color: '#9fdcb0', life: 2.5, size: 1.2, grow: 1.2 });
      if (Math.random() < 0.5) k.fxAdd.emit(-2.8 + (Math.random() - 0.5) * 0.4, 5.8, -0.9, (Math.random() - 0.5) * 0.5, 1.5, 0, { tile: PT.Spark, color: '#3ee07a', life: 1, size: 0.25, grow: -0.2 });
      k.follow(path, t);
    },
    sting(s) {
      for (let i = 0; i < 7; i++) {
        s.noise(i * 0.5 + 0.12, 0.08, 0.12, 900, { q: 2 });
        s.tone(i * 0.5 + 0.12, 220, 0.1, 'square', 0.04, { slide: 0.6 });
      }
      for (let i = 0; i < 5; i++) s.tone(0.4 + i * 0.52, 1046 + i * 120, 0.2, 'sine', 0.06, { rev: true });
      s.chord(2.75, [392, 494, 587], 0.9, 'triangle', 0.06);
      s.sparkle(2.8, 1568);
    },
  };
}
