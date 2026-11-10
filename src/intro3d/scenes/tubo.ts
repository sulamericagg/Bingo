/* Queda Giratória: torre girando com discos coloridos; o Bloop quica e mergulha pelas aberturas. */
import * as THREE from 'three';
import { PT } from '../../3d/common/particles';
import type { Kit, Shot } from '../kit';
import { Actor, landSq, solidMesh } from './util';

const COLS = ['#ff9ec7', '#ffd166', '#8fe3c8', '#9fc3ff', '#c9a6ff', '#ffb38a'];

export function tubo(k: Kit): Shot {
  k.sky('#ff7a8a', '#ffd59a', '#ff5e8a', 300, 1.3);
  k.fog('#ffc8a0', 18, 60);
  k.lights('#fff3e0', '#ff7a8a', '#fff8ec', [5, 12, 9], 1.0, 2.4);
  const tower = new THREE.Group();
  k.scene.add(tower);
  const GAP = 1.0; // rad
  const W = 1.5; // rad/s (giro)
  const STEP = 3.2;
  const LV = 7;
  const θb = 0; // ângulo do Bloop (de frente para +z)
  const R0 = 3.6;
  const RB = 2.25;
  // tempos: quica no nível 0 até 1.25, cai pelos níveis 1..4, pousa no 5
  const tFall = 1.25;
  const g = 26;
  const yOf = (i: number) => -i * STEP;
  const crossT = (i: number) => tFall + Math.sqrt((2 * (i * STEP)) / g);
  const LAND = 5;
  const tLand = crossT(LAND);
  // pólo
  solidMesh(k, k.ownGeo(new THREE.CylinderGeometry(0.75, 0.75, 60, 20)).translate(0, -22, 0), '#fff4e6', { rough: 0.4 }, tower);
  const safe = new THREE.Group();
  for (let i = 0; i < LV; i++) {
    const tc = i === 0 ? tFall : i >= LAND ? -1 : crossT(i);
    const gapC = tc < 0 ? θb + Math.PI : θb - W * tc; // centro da abertura (local)
    const segs = 8;
    const start = gapC + GAP / 2;
    const span = (Math.PI * 2 - GAP) / segs;
    const col = COLS[i % COLS.length];
    for (let s = 0; s < segs; s++) {
      const red = (s === 3 || (i % 2 === 1 && s === 6)) && i !== LAND;
      const geo = k.ownGeo(new THREE.CylinderGeometry(R0, R0, 0.42, 8, 1, false, start + s * span + 0.03, span - 0.06));
      const m = solidMesh(k, geo, red ? '#ff3355' : col, red ? { emissive: '#ff1a3a', ei: 0.45, rough: 0.35 } : { rough: 0.5 }, safe);
      m.position.y = yOf(i) - 0.21;
    }
  }
  tower.add(safe);
  const b = new Actor(k, 1.6, 'happy');
  b.shadow.visible = false;
  const splat = k.blob(1.2, 0.0);
  (splat.material as THREE.MeshBasicMaterial).color.set('#ff5fa2');
  splat.visible = false;
  let landed = false;
  const bounce = (t: number): [number, number] => {
    // dois quiques no nível 0 (0..tFall)
    const p = 0.62;
    const u = (t % p) / p;
    return [3.0 * 4 * u * (1 - u), u];
  };
  const camTarget = new THREE.Vector3();
  return {
    dur: 3.4,
    update(t, dt) {
      tower.rotation.y = W * t;
      let y: number;
      let sq = 0;
      if (t < tFall) {
        const [h, u] = bounce(t);
        y = yOf(0) + h;
        sq = u < 0.12 ? -0.3 * (1 - u / 0.12) : 0.18 * Math.sin(u * Math.PI);
        if (t > tFall - 0.25) y = yOf(0) + Math.max(0, h);
      } else if (t < tLand) {
        const d = t - tFall;
        y = yOf(0) - 0.5 * g * d * d;
        sq = Math.min(0.5, d * 1.2);
        for (let i = 0; i < 3; i++)
          k.fxAdd.emit(Math.sin(θb) * RB + (Math.random() - 0.5) * 1.6, y + 0.6 + Math.random() * 1.2, Math.cos(θb) * RB + (Math.random() - 0.5) * 0.6, 0, 9, 0, { tile: PT.Spark, color: '#ffffff', life: 0.18, size: 0.12 });
      } else {
        y = yOf(LAND);
        sq = landSq(t, tLand, 0.5);
        if (t > tLand + 0.7) {
          const u = ((t - tLand - 0.7) % 0.55) / 0.55;
          y += 4 * u * (1 - u) * 0.8;
        }
      }
      if (!landed && t >= tLand) {
        landed = true;
        const x = Math.sin(θb) * RB;
        const z = Math.cos(θb) * RB;
        k.fx.burst(x, yOf(LAND) + 0.2, z, 40, 'foam', '#ff8ad8', 4);
        k.fxAdd.burst(x, yOf(LAND) + 0.3, z, 40, 'spark', '#fff1b0', 5);
        k.shake(0.3);
        k.flash(0.3, '#fff0f5');
        splat.visible = true;
      }
      b.at(Math.sin(θb) * RB, y, Math.cos(θb) * RB, sq);
      if (splat.visible) {
        const e = Math.min(1, (t - tLand) * 6);
        splat.position.set(Math.sin(θb) * RB, yOf(LAND) + 0.03, Math.cos(θb) * RB);
        splat.scale.setScalar(0.3 + e);
        (splat.material as THREE.MeshBasicMaterial).opacity = 0.55 * e;
      }
      // câmera acompanha a queda (com atraso), girando em volta da torre
      const ty = Math.min(yOf(0), y);
      camTarget.y += (ty - camTarget.y) * Math.min(1, dt * (t < tFall ? 20 : 7));
      if (t === 0 || dt === 0) camTarget.y = ty;
      const ang = θb + 0.55 - t * 0.12;
      const rad = 10.5 - Math.min(2.0, t * 0.5);
      const up = t < tFall ? 4.5 : 3.2 + Math.max(0, 1.6 - (t - tFall) * 1.4);
      k.cam.position.set(Math.sin(ang) * rad + (Math.random() - 0.5) * k.shakeAmt, camTarget.y + up, Math.cos(ang) * rad);
      k.cam.lookAt(0.6, camTarget.y + 0.2 - (t > tLand ? 0.6 : 0), 0.4);
      k.setFov(52);
    },
    sting(s) {
      s.tone(0.0, 520, 0.12, 'sine', 0.12, { slide: 1.5 });
      s.tone(0.62, 520, 0.12, 'sine', 0.12, { slide: 1.5 });
      s.whoosh(tFall, tLand - tFall, 0.28, 300, 6);
      for (let i = 1; i < LAND; i++) s.tone(crossT(i), 600 + i * 120, 0.1, 'triangle', 0.08);
      s.boom(tLand, 0.4);
      s.sparkle(tLand + 0.05, 1568);
    },
  };
}
