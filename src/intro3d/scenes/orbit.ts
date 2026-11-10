/* Bloop Orbit: o Bloop pula de planeta em planeta no espaço roxo, rastro de faíscas. */
import * as THREE from 'three';
import { PT } from '../../3d/common/particles';
import { setInst, type Kit, type Shot } from '../kit';
import { Actor, hopPos, landSq, solidMesh } from './util';

export function orbit(k: Kit): Shot {
  k.sky('#0b0620', '#3a1590', '#0b0620', 300, 1.2);
  k.stars(k.hi ? 900 : 450, 220, k.hi ? 2.2 : 1.8);
  for (const [c, x, y, z, s] of [
    ['#ff4fb0', -40, 20, -90, 110],
    ['#5ef0ff', 60, -10, -110, 120],
    ['#8a5cff', 10, 40, -120, 140],
  ] as [string, number, number, number, number][]) {
    k.glow(c, s, 0.22).position.set(x, y, z);
  }
  k.lights('#c9b2ff', '#2a0c5a', '#fff2e0', [6, 10, 8], 0.9, 2.6);
  const rim = new THREE.DirectionalLight('#ff6fd0', 1.6);
  rim.position.set(-8, 3, -10);
  k.scene.add(rim);

  const planets: { m: THREE.Mesh; r: number; p: [number, number, number]; spin: number }[] = [];
  const P: [number, number, number, number, string, string][] = [
    [0, 0, 0, 2, '#ff6fb5', '#ff9ad8'],
    [7.5, 2.6, -3.5, 1.5, '#4fd8ff', '#9ff4ff'],
    [14, 0.4, -1.2, 2.5, '#ffcf2e', '#ffe78a'],
  ];
  P.forEach(([x, y, z, r, c, gc], i) => {
    const m = solidMesh(k, k.ownGeo(new THREE.IcosahedronGeometry(r, k.hi ? 2 : 1)), c, { flat: true, rough: 0.8 });
    m.position.set(x, y, z);
    k.glow(gc, r * 3.4, 0.45).position.set(x, y, z - 0.5);
    // crateras/manchas em volta (pequenas pedras)
    planets.push({ m, r, p: [x, y, z], spin: 0.3 + i * 0.15 });
    if (i === 1) {
      const ring = solidMesh(k, k.ownGeo(new THREE.TorusGeometry(r * 1.75, 0.09, 4, 40)), '#ffe0ff', { emissive: '#ff8ad8', ei: 0.5 });
      ring.position.set(x, y, z);
      ring.rotation.set(Math.PI / 2 - 0.35, 0.2, 0);
    }
  });
  // cinturão de asteroides
  const N = k.hi ? 46 : 24;
  const ast = new THREE.InstancedMesh(k.ownGeo(new THREE.DodecahedronGeometry(0.25, 0)), k.solid('#b79cff', { flat: true }), N);
  k.scene.add(ast);
  const aD = Array.from({ length: N }, (_, i) => ({ a: (i / N) * Math.PI * 2, r: 9 + Math.sin(i * 7.1) * 2.5, y: Math.sin(i * 3.3) * 1.6, s: 0.5 + ((i * 37) % 10) / 10 }));

  const b = new Actor(k, 1.7, 'happy');
  b.shadow.visible = false;
  const glowB = k.glow('#ffffff', 2.6, 0.25);
  const top = (i: number): [number, number, number] => [P[i][0], P[i][1] + P[i][3] - 0.05, P[i][2]];
  const o = [0, 0, 0, 0];
  const J1: [number, number] = [0.7, 1.7];
  const J2: [number, number] = [2.0, 3.05];
  let landed = 0;

  const path = k.path([
    { t: 0, p: [-3.5, 2.2, 7.5], l: [0, 2.2, 0], fov: 44 },
    { t: 1.5, p: [3, 4.5, 9], l: [6, 3.2, -2], fov: 50 },
    { t: 3.0, p: [11, 3.4, 9.5], l: [13.5, 2.4, -1] },
    { t: 4.8, p: [12.2, 4.4, 11.2], l: [13.6, 2.2, -1.2], fov: 46 },
  ]);
  return {
    dur: 3.3,
    update(t, dt) {
      for (const pl of planets) pl.m.rotation.y += pl.spin * dt;
      for (let i = 0; i < N; i++) {
        const d = aD[i];
        const a = d.a + t * 0.12;
        setInst(ast, i, 7 + Math.cos(a) * d.r * 1.3, d.y + 1, -3 + Math.sin(a) * d.r * 0.7, t * d.s, t * d.s * 0.7, 0, d.s);
      }
      ast.instanceMatrix.needsUpdate = true;
      let sq = 0;
      if (t < J1[0]) {
        const [x, y, z] = top(0);
        const pre = Math.max(0, (t - (J1[0] - 0.25)) / 0.25);
        b.at(x, y, z, -0.25 * Math.sin(pre * Math.PI * 0.5) + Math.sin(t * 9) * 0.03 * (1 - pre));
      } else if (t < J2[0]) {
        hopPos(t, J1[0], J1[1], top(0), top(1), 3.2, o);
        sq = o[3] < 1 ? 0.22 * Math.sin(o[3] * Math.PI) : landSq(t, J1[1], 0.4);
        if (o[3] >= 1 && t > J2[0] - 0.2) sq = -0.25 * ((t - (J2[0] - 0.2)) / 0.2);
        b.at(o[0], o[1], o[2], sq);
      } else {
        hopPos(t, J2[0], J2[1], top(1), top(2), 3.6, o);
        sq = o[3] < 1 ? 0.25 * Math.sin(o[3] * Math.PI) : landSq(t, J2[1], 0.45) + Math.sin((t - J2[1]) * 10) * 0.02;
        b.at(o[0], o[1], o[2], sq);
      }
      // pés no topo; gira a "vertical" do sprite não é necessária (billboard)
      glowB.position.copy(b.spr.position);
      const flying = (t > J1[0] && t < J1[1]) || (t > J2[0] && t < J2[1]);
      if (flying) {
        for (let i = 0; i < 2; i++)
          k.fxAdd.emit(b.spr.position.x + (Math.random() - 0.5) * 0.4, b.spr.position.y - 0.2 + (Math.random() - 0.5) * 0.4, b.spr.position.z, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, 0, { tile: PT.Spark, color: Math.random() < 0.5 ? '#ff8ad8' : '#5ef0ff', life: 0.6, size: 0.22, grow: -0.25 });
      }
      if (landed === 0 && t >= J1[1]) {
        landed = 1;
        const [x, y, z] = top(1);
        k.fxAdd.burst(x, y + 0.1, z, 26, 'spark', '#9ff4ff', 3);
        k.shake(0.12);
      }
      if (landed === 1 && t >= J2[1]) {
        landed = 2;
        const [x, y, z] = top(2);
        k.fxAdd.burst(x, y + 0.1, z, 60, 'spark', '#ffe78a', 5);
        k.fxAdd.burst(x, y + 0.1, z, 30, 'spark', '#ff8ad8', 4);
        k.shake(0.25);
        k.flash(0.35, '#ffe0ff');
      }
      k.follow(path, t);
    },
    sting(s) {
      s.whoosh(0.55, 0.5, 0.2, 500, 4);
      s.tone(J1[0], 330, 0.35, 'sine', 0.18, { slide: 2.2 });
      s.tone(J1[1], 660, 0.25, 'triangle', 0.12, { rev: true });
      s.tone(J2[0], 392, 0.4, 'sine', 0.18, { slide: 2.4 });
      s.boom(J2[1], 0.35);
      s.sparkle(J2[1] + 0.05, 1318);
    },
  };
}
