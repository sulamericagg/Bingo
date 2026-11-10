/* Pouso Forçado: avião sobre um mar de nuvens no pôr do sol, luz de alarme piscando na cabine, mergulho e recuperação. */
import * as THREE from 'three';
import { PT } from '../../3d/common/particles';
import { setInst, type Kit, type Shot } from '../kit';

export function voo(k: Kit): Shot {
  k.sky('#6a3fb8', '#ffb36b', '#ff7a8a', 300, 0.8);
  k.fog('#ffc89a', 30, 110);
  k.lights('#ffe0c8', '#8a5cc8', '#ffd0a0', [-12, 6, 4], 1.0, 2.6);
  k.glow('#ffe0a0', 90, 0.7).position.set(-140, 8, -60);
  k.glow('#ff9a6a', 160, 0.35).position.set(-140, 0, -60);
  // mar de nuvens (instanciado, rola para trás)
  const CN = k.hi ? 70 : 40;
  const clouds = new THREE.InstancedMesh(k.ownGeo(new THREE.IcosahedronGeometry(1, 1)), k.solid('#fff0f0', { flat: true, rough: 1, emissive: '#ff9ab0', ei: 0.18 }), CN);
  k.scene.add(clouds);
  const cd = Array.from({ length: CN }, (_, i) => ({ x: ((i * 37) % 120) - 60, z: ((i * 53) % 70) - 45, y: -7 - (i % 5) * 0.8 + (i % 3 ? 0 : 5), s: 2.4 + (i % 4) * 1.1 }));
  // avião: tudo num grupo (fuselagem em torno do eixo x)
  const plane = new THREE.Group();
  const body = k.build('voo-plane', (b) => {
    b.lathe([[0, 0], [0.5, 0.4], [0.75, 1.4], [0.8, 3.6], [0.6, 5.4], [0.25, 6.6], [0.05, 6.8]], 0, 0, 0, '#ffffff', 16, 0, -Math.PI / 2);
    b.box(1.4, 0.12, 8.6, 3.0, -0.25, 0, '#ff5cae');
    b.box(0.9, 0.08, 3.2, 6.1, 0.1, 0, '#ff5cae');
    b.box(1.0, 1.5, 0.1, 6.2, 0.2, 0, '#ff5cae', 0, 0, 0.25);
    b.cyl(0.32, 0.36, 1.2, 2.6, -0.62, 2.2, '#d8d8e8', 12, 0, Math.PI / 2);
    b.cyl(0.32, 0.36, 1.2, 2.6, -0.62, -2.2, '#d8d8e8', 12, 0, Math.PI / 2);
    b.box(5.6, 0.1, 0.06, 3.4, 0.05, 0.79, '#ffd34a');
    b.box(5.6, 0.1, 0.06, 3.4, 0.05, -0.79, '#ffd34a');
  });
  plane.add(new THREE.Mesh(body, k.std({ rough: 0.35, metal: 0.15 })));
  // janelas da cabine (emissivas)
  const win = new THREE.Mesh(k.ownGeo(new THREE.SphereGeometry(0.62, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2.4)), k.solid('#8fd3ff', { emissive: '#5ab8ff', ei: 0.35, rough: 0.1, metal: 0.4 }));
  win.position.set(0.95, 0.25, 0);
  win.rotation.z = 0.7;
  plane.add(win);
  const pilot = k.bloop(1.0, 'fly', plane);
  pilot.position.set(1.05, 0.55, 0.55);
  const alarm = k.glow('#ff2a3a', 2.6, 0, plane);
  alarm.position.set(1.0, 0.95, 0);
  const alarmL = new THREE.PointLight('#ff2a3a', 0, 6, 1.4);
  alarmL.position.set(1.0, 1.0, 0.6);
  plane.add(alarmL);
  k.scene.add(plane);
  const engR = new THREE.Vector3(2.6, -0.62, 2.2);
  const W = new THREE.Vector3();
  const path = k.path([
    { t: 0, p: [-9, 2.5, 7], l: [2, 0, 0], fov: 48 },
    { t: 1.5, p: [-3, 1.2, 9.5], l: [2, -0.4, 0] },
    { t: 3.0, p: [-6.5, 1.6, 5.5], l: [1.5, 0.2, 0], fov: 50 },
    { t: 5.0, p: [-7.2, 2.0, 5.8], l: [1.6, 0.6, 0], fov: 46 },
  ]);
  let blink = -1;
  return {
    dur: 3.3,
    update(t, dt) {
      // voo: balanço, mergulho em 1.2–2.2, recuperação
      const dive = t > 1.2 && t < 2.6 ? Math.sin(((t - 1.2) / 1.4) * Math.PI) : 0;
      plane.position.set(0, Math.sin(t * 1.7) * 0.25 - dive * 1.4, 0);
      plane.rotation.set(Math.sin(t * 2.3) * 0.25 + dive * 0.35, 0, -dive * 0.28 + Math.sin(t * 1.3) * 0.05);
      // alarme pisca 3x/s
      const on = (t * 3) % 1 < 0.5 ? 1 : 0;
      (alarm.material as THREE.SpriteMaterial).opacity = on * 0.95;
      alarmL.intensity = on * 14;
      const bc = Math.floor(t * 3);
      if (on && bc !== blink && t > 0.6) {
        blink = bc;
        if (t < 2.7) k.flash(0.12, '#ff3050');
      }
      pilot.position.y = 0.55 + Math.abs(Math.sin(t * 9)) * 0.06;
      // nuvens passam (velocidade aumenta no mergulho)
      for (let i = 0; i < CN; i++) {
        const c = cd[i];
        const x = ((c.x - t * (14 + dive * 10)) % 120 + 180) % 120 - 60;
        setInst(clouds, i, -x, c.y, c.z, 0, i, 0, c.s, c.s * 0.55, c.s);
      }
      clouds.instanceMatrix.needsUpdate = true;
      // fumaça do motor e vento
      W.copy(engR).applyMatrix4(plane.matrixWorld);
      k.fx.emit(W.x + 0.6, W.y, W.z, 9, 0.2, 0, { tile: PT.Smoke, color: '#5a5060', life: 1.0, size: 0.5, grow: 1.6 });
      if (Math.random() < 0.5) k.fxAdd.emit(W.x + 0.4, W.y, W.z, 6, 0.4, 0, { tile: PT.Smoke, color: '#ff8a3a', life: 0.25, size: 0.45, grow: -1 });
      for (let i = 0; i < 2; i++) k.fxAdd.emit(-8, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 8, 30, 0, 0, { tile: PT.Spark, color: '#ffffff', life: 0.5, size: 0.06 });
      if (t > 2.4 && t - dt <= 2.4) {
        k.fxAdd.burst(1, 1, 0, 30, 'spark', '#ffd34a', 3);
        k.shake(0.15);
      }
      k.follow(path, t);
    },
    sting(s) {
      s.noise(0, 3.3, 0.06, 500, { q: 0.5, attack: 0.5, type: 'lowpass' });
      for (let i = 0; i < 8; i++) s.tone(0.6 + i / 3, i % 2 ? 660 : 880, 0.16, 'square', 0.035);
      s.whoosh(1.2, 1.2, 0.2, 400, 3);
      s.chord(2.4, [392, 494, 587], 0.8, 'triangle', 0.05);
    },
  };
}
