/* Bloop Espelho: camarim com espelho de lâmpadas; brilho varre o vidro e o Bloop faz caretas para o reflexo. */
import * as THREE from 'three';
import type { PlayerPose } from '../../game/character';
import type { Kit, Shot } from '../kit';
import { solidMesh } from './util';

export function espelho(k: Kit): Shot {
  k.sky('#2a1450', '#6a3fb8', '#1a0a30', 300, 1.2);
  k.lights('#ffe8ff', '#4a2a7a', '#fff0e0', [2, 6, 8], 1.0, 1.8);
  const warm = new THREE.PointLight('#ffd8a0', 16, 12, 1.4);
  warm.position.set(0, 2.5, 2.5);
  k.scene.add(warm);
  const room = k.build('esp-room', (b) => {
    b.sharp(16, 0.1, 10, 0, -0.1, 2, '#3a2060');
    b.sharp(16, 8, 0.2, 0, 0, -1.6, '#5a3490');
    // penteadeira
    b.box(5.2, 1.0, 1.4, 0, 0, 0.4, '#ff9ec7');
    b.box(5.4, 0.12, 1.6, 0, 1.0, 0.4, '#ffffff');
    b.rcyl(0.18, 0.4, -2, 1.12, 0.6, '#ffd166', 12);
    b.rcyl(0.14, 0.3, -1.6, 1.12, 0.8, '#5ef0ff', 12);
    b.sph(0.2, 2.0, 1.32, 0.7, '#ff5fa2', 1, 1, 1, 10);
    // moldura do espelho
    b.box(4.4, 0.25, 0.3, 0, 1.15, -1.2, '#ffd34a');
    b.box(4.4, 0.25, 0.3, 0, 4.55, -1.2, '#ffd34a');
    b.box(0.25, 3.6, 0.3, -2.1, 1.15, -1.2, '#ffd34a');
    b.box(0.25, 3.6, 0.3, 2.1, 1.15, -1.2, '#ffd34a');
  });
  k.mesh(room, k.std({ rough: 0.45, metal: 0.1 }));
  // lâmpadas em volta da moldura
  const bulbs: THREE.Sprite[] = [];
  const bulbG = k.ownGeo(new THREE.SphereGeometry(0.13, 10, 8));
  const bulbM = k.solid('#fff4d0', { emissive: '#ffe0a0', ei: 1.5 });
  const BP: [number, number][] = [];
  for (let i = 0; i < 5; i++) BP.push([-1.6 + i * 0.8, 4.68], [-1.6 + i * 0.8, 1.28]);
  for (let i = 0; i < 3; i++) BP.push([-2.22, 1.95 + i * 0.9], [2.22, 1.95 + i * 0.9]);
  for (const [x, y] of BP) {
    const m = new THREE.Mesh(bulbG, bulbM);
    m.position.set(x, y, -1.0);
    k.scene.add(m);
    const g = k.glow('#ffd890', 0.9, 0.7);
    g.position.set(x, y, -0.95);
    bulbs.push(g);
  }
  // reflexo: Bloop atrás do vidro (mundo espelhado em z = -1.2)
  const MOODS: PlayerPose['mood'][] = ['happy', 'idle', 'fly', 'happy'];
  const front = MOODS.map((m) => k.bloop(1.9, m));
  const back = MOODS.map((m) => k.bloop(1.9, m));
  back.forEach((s) => ((s.material as THREE.SpriteMaterial).color.set('#c8b8ff'), ((s.material as THREE.SpriteMaterial).opacity = 0.85), ((s.material as THREE.SpriteMaterial).transparent = true)));
  // vidro: plano levemente azulado na frente do reflexo + faixa de brilho
  const glass = solidMesh(k, k.ownGeo(new THREE.PlaneGeometry(4.0, 3.3)), '#9fb8ff', { opacity: 0.22, rough: 0.05, metal: 0.6 });
  glass.position.set(0, 2.85, -1.2);
  (glass.material as THREE.Material).depthWrite = false;
  const shine = k.beam('#ffffff', 0.7, 5, 0.0);
  shine.rotation.z = 0.5;
  // recorta a faixa de brilho dentro do vidro com um grupo simples (posição varre x)
  const path = k.path([
    { t: 0, p: [0, 3.2, 7.5], l: [0, 2.7, -1.2], fov: 44 },
    { t: 1.6, p: [-2.2, 2.6, 5.2], l: [0.3, 2.3, -1] },
    { t: 3.0, p: [1.6, 2.4, 5.0], l: [0, 2.4, -1], fov: 48 },
    { t: 5.0, p: [1.2, 2.6, 5.6], l: [0, 2.6, -1], fov: 46 },
  ]);
  const FACE = [0, 0.8, 1.5, 2.2]; // troca de careta
  let face = -1;
  return {
    dur: 3.2,
    update(t) {
      // qual careta (e um "pop" de escala na troca)
      let fi = 0;
      for (let i = 0; i < FACE.length; i++) if (t >= FACE[i]) fi = i;
      if (fi !== face) {
        face = fi;
        if (t > 0.1) k.fxAdd.burst(0, 2.3, 0.8, 12, 'spark', '#fff0ff', 2);
      }
      const since = t - FACE[fi];
      const pop = 1 + 0.25 * Math.exp(-since * 8) * Math.cos(since * 25);
      // poses exageradas: estica, achata, inclina
      const pose = [
        [1, 1, 0],
        [1.3, 0.75, 0],
        [0.8, 1.3, 0.25],
        [1.1, 1.1, -0.2],
      ][fi];
      const bob = Math.sin(t * 6) * 0.06;
      front.forEach((s, i) => {
        s.visible = i === fi;
        s.position.set(0, 2.2 + bob, 0.8);
        s.scale.set(1.9 * pose[0] * pop, 1.9 * pose[1] / pop, 1);
        (s.material as THREE.SpriteMaterial).rotation = pose[2] + Math.sin(t * 3) * 0.05;
      });
      // reflexo: a mesma careta, um instante atrasado (o espelho "imita")
      const lag = t - 0.12;
      let bi = 0;
      for (let i = 0; i < FACE.length; i++) if (lag >= FACE[i]) bi = i;
      back.forEach((s, i) => {
        s.visible = i === bi;
        s.position.set(0, 2.2 + Math.sin(lag * 6) * 0.06, -3.2);
        s.scale.set(-1.9 * pose[0], 1.9 * pose[1], 1);
        (s.material as THREE.SpriteMaterial).rotation = -pose[2];
      });
      // brilho varrendo o vidro (duas passadas)
      const sw = (t % 1.6) / 1.6;
      shine.position.set(-3 + sw * 6, 5.0, -1.15);
      shine.children.forEach((c) => (((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = Math.sin(sw * Math.PI) * 0.35));
      // lâmpadas piscando em onda; tudo acende forte no fim
      bulbs.forEach((g, i) => ((g.material as THREE.SpriteMaterial).opacity = 0.45 + 0.45 * Math.max(0, Math.sin(t * 8 - i * 0.7)) + (t > 2.6 ? 0.3 : 0)));
      if (t > 2.6 && Math.random() < 0.5) k.fxAdd.emit((Math.random() - 0.5) * 4, 1.3 + Math.random() * 3.3, -1.0, 0, 0.3, 0.4, { tile: 1, color: '#ffffff', life: 0.7, size: 0.18, grow: -0.2 });
      k.follow(path, t);
    },
    sting(s) {
      s.sparkle(0.05, 1046, 0.05);
      FACE.slice(1).forEach((f, i) => s.tone(f, [392, 523, 659][i], 0.18, 'square', 0.05, { slide: [1.5, 0.6, 2][i] }));
      s.noise(1.6, 0.6, 0.05, 6000, { type: 'highpass', attack: 0.3 });
      s.chord(2.6, [523, 659, 784], 0.9, 'triangle', 0.05);
      s.sparkle(2.65, 1568);
    },
  };
}
