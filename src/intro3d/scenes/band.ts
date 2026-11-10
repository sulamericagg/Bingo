/* Bloop Banda: palco com fachos de luz varrendo, plateia pulando no ritmo, o Bloop com a guitarra e confete no acorde final. */
import * as THREE from 'three';
import { PT } from '../../3d/common/particles';
import { setInst, type Kit, type Shot } from '../kit';
import { Actor } from './util';

export function band(k: Kit): Shot {
  k.sky('#120a2e', '#3a1a7a', '#120a2e', 300, 1.2);
  k.fog('#1a0c40', 14, 50);
  k.lights('#8a6aff', '#1a0a3a', '#ffe0f0', [0, 10, 10], 0.7, 1.6);
  const BPM = 2.2; // batidas/s
  const stage = k.build('band-stage', (b) => {
    b.box(14, 1.1, 6, 0, 0, -1, '#2a1a4a');
    b.box(14.2, 0.12, 6.2, 0, 1.1, -1, '#4a2a7a');
    b.sharp(16, 9, 0.4, 0, 0, -4.2, '#160a30');
    // caixas de som
    for (const x of [-5.6, 5.6]) {
      b.box(1.8, 1.6, 1.4, x, 1.2, -1.6, '#1a1030');
      b.box(1.6, 1.4, 1.2, x, 2.8, -1.6, '#1a1030');
      b.cyl(0.55, 0.55, 0.1, x, 1.95, -0.9, '#3a2a5a', 16, Math.PI / 2);
      b.cyl(0.45, 0.45, 0.1, x, 3.5, -0.98, '#3a2a5a', 16, Math.PI / 2);
    }
    // bateria
    b.cyl(0.7, 0.7, 0.9, 0, 1.2, -2.6, '#ff5fa2', 16, Math.PI / 2);
    b.cyl(0.38, 0.38, 0.4, -1.1, 1.9, -2.3, '#ff5fa2', 14);
    b.cyl(0.42, 0.42, 0.5, 1.15, 1.2, -2.3, '#ff5fa2', 14);
    b.cyl(0.03, 0.03, 1.4, 1.7, 1.2, -2.7, '#c0c0d0', 6);
    b.cyl(0.55, 0.5, 0.04, 1.7, 2.6, -2.7, '#ffd23f', 16);
    // teclado
    b.box(1.8, 0.2, 0.6, -3.2, 2.1, -1.8, '#ffffff');
    b.box(0.1, 1.0, 0.1, -3.9, 1.1, -1.8, '#3a3a4a');
    b.box(0.1, 1.0, 0.1, -2.5, 1.1, -1.8, '#3a3a4a');
    // treliça
    b.box(15, 0.35, 0.35, 0, 8.2, -1.5, '#4a4a6a');
    b.box(0.35, 7.3, 0.35, -7.2, 1.1, -1.5, '#4a4a6a');
    b.box(0.35, 7.3, 0.35, 7.2, 1.1, -1.5, '#4a4a6a');
  });
  k.mesh(stage, k.std({ rough: 0.5 }));
  // painel de LED atrás (pontos)
  const LN = k.hi ? 18 * 9 : 12 * 6;
  const cols = k.hi ? 18 : 12;
  const rows = LN / cols;
  const lp = new Float32Array(LN * 3);
  const lc = new Float32Array(LN * 3);
  for (let i = 0; i < LN; i++) {
    lp[i * 3] = ((i % cols) / (cols - 1) - 0.5) * 13;
    lp[i * 3 + 1] = 2.2 + (Math.floor(i / cols) / (rows - 1)) * 5.4;
    lp[i * 3 + 2] = -3.9;
  }
  const lg = k.ownGeo(new THREE.BufferGeometry());
  lg.setAttribute('position', new THREE.BufferAttribute(lp, 3));
  const lca = new THREE.BufferAttribute(lc, 3);
  lg.setAttribute('color', lca);
  const leds = new THREE.Points(lg, k.own(new THREE.PointsMaterial({ size: k.hi ? 0.9 : 1.1, vertexColors: true, map: k.glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  k.scene.add(leds);
  // fachos de luz
  const BC = ['#ff5fa2', '#ffd23f', '#5ef0ff', '#ff5fa2', '#ffd23f'];
  const beams = BC.map((c, i) => {
    const g = k.beam(c, 1.6, 11, 0.32);
    g.position.set(-6 + i * 3, 8.1, -1.3);
    k.glow(c, 1.6, 0.9).position.set(-6 + i * 3, 8.0, -1.1);
    return g;
  });
  // plateia: cabeças coloridas
  const CN = k.hi ? 60 : 32;
  const crowd = new THREE.InstancedMesh(k.ownGeo(new THREE.SphereGeometry(0.45, 10, 8)), k.solid('#ffffff', { rough: 0.6 }), CN);
  const pal = ['#ff9ec7', '#9fc3ff', '#ffd166', '#8fe3c8', '#c9a6ff', '#ffb38a'];
  const C = new THREE.Color();
  const cd = Array.from({ length: CN }, (_, i) => {
    C.set(pal[i % pal.length]);
    crowd.setColorAt(i, C);
    const row = Math.floor(i / 12);
    return { x: ((i % 12) - 5.5) * 1.15 + (row % 2) * 0.5, z: 4 + row * 1.2, ph: (i * 0.37) % 1 };
  });
  k.scene.add(crowd);
  // Bloop + guitarra
  const b = new Actor(k, 2.0, 'happy');
  const gtr = k.build('band-gtr', (g) => {
    g.box(0.9, 0.7, 0.18, 0, -0.35, 0, '#ffd23f');
    g.box(0.75, 0.55, 0.2, 0.05, 0.25, 0, '#ffd23f');
    g.box(1.4, 0.12, 0.1, 0.95, 0.1, 0.05, '#7a4a2a');
    g.box(0.3, 0.2, 0.12, 1.75, 0.08, 0.05, '#ff5fa2');
    g.cyl(0.14, 0.14, 0.05, 0, 0.0, 0.1, '#2a1a4a', 12, Math.PI / 2);
  }, 1);
  const guitar = new THREE.Mesh(gtr, k.std({ rough: 0.35 }));
  k.scene.add(guitar);
  let hit = false;
  const path = k.path([
    { t: 0, p: [0, 1.6, 12.5], l: [0, 3, 0], fov: 50 },
    { t: 1.6, p: [-3.5, 2.8, 8.5], l: [0, 2.6, -1] },
    { t: 3.0, p: [1.5, 2.6, 7.0], l: [0, 2.9, -1] },
    { t: 5.0, p: [0.5, 2.9, 7.6], l: [0, 3.2, -1], fov: 48 },
  ]);
  return {
    dur: 3.4,
    update(t, dt) {
      const beat = t * BPM;
      const bp = beat % 1;
      const pulse = Math.exp(-bp * 5);
      // Bloop pula a cada batida (mais alto no clímax)
      const hgt = t > 2.6 ? 1.6 : 0.5;
      const y = 1.22 + 4 * bp * (1 - bp) * hgt;
      b.at(0, y, 0.4, bp < 0.1 ? -0.25 : 0.15 * Math.sin(bp * Math.PI), 1.22);
      guitar.position.set(-0.15, y + 0.55, 0.9);
      guitar.rotation.set(0, 0, 0.45 + Math.sin(beat * Math.PI) * 0.15);
      // fachos varrendo
      beams.forEach((g, i) => {
        g.rotation.z = Math.sin(t * 1.4 + i * 1.3) * 0.55;
        g.rotation.x = 0.25 + Math.sin(t * 1.1 + i) * 0.2;
      });
      // LEDs: onda colorida
      for (let i = 0; i < LN; i++) {
        const x = i % cols;
        const r = Math.floor(i / cols);
        const v = 0.5 + 0.5 * Math.sin(x * 0.5 - t * 4 + r * 0.6);
        C.setHSL((0.85 + x * 0.02 + t * 0.1) % 1, 0.9, 0.35 + v * 0.3 * (0.6 + pulse * 0.4));
        lc[i * 3] = C.r;
        lc[i * 3 + 1] = C.g;
        lc[i * 3 + 2] = C.b;
      }
      lca.needsUpdate = true;
      // plateia
      for (let i = 0; i < CN; i++) {
        const d = cd[i];
        const u = (beat + d.ph * 0.3) % 1;
        setInst(crowd, i, d.x, 0.3 + 4 * u * (1 - u) * 0.35, d.z, 0, 0, 0, 1, 1.15, 1);
      }
      crowd.instanceMatrix.needsUpdate = true;
      if (!hit && t > 2.75) {
        hit = true;
        for (const c of ['#ff5fa2', '#ffd23f', '#5ef0ff', '#ffffff'])
          for (let i = 0; i < 18; i++)
            k.fx.emit((Math.random() - 0.5) * 3, 7.5, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 6, -1 - Math.random() * 2, (Math.random() - 0.5) * 4 + 2, { tile: PT.Chunk, color: c, life: 2.4, size: 0.18, grav: 2.5, drag: 1.2 });
        k.fxAdd.burst(0, 2.4, 0.6, 50, 'spark', '#ffd23f', 5);
        k.flash(0.4, '#ffd6f0');
        k.shake(0.18);
      }
      if (bp < dt * BPM && t > 0.1) k.fxAdd.burst(0, 1.3, 0.6, 6, 'spark', '#ff8fd8', 2);
      k.follow(path, t);
    },
    sting(s) {
      for (let i = 0; i < 8; i++) {
        const tt = i / BPM;
        s.kick(tt, 0.4);
        if (i % 2) s.snare(tt, 0.2);
        s.hat(tt + 0.5 / BPM, 0.07);
      }
      s.power(0, 82.4, 0.42, 0.08);
      s.power(0.91, 98, 0.42, 0.08);
      s.power(1.82, 110, 0.42, 0.08);
      s.power(2.75, 82.4, 1.4, 0.11);
      s.noise(2.75, 1.2, 0.08, 6000, { type: 'highpass', rev: true });
    },
  };
}
