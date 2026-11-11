/* ============================================================
 *  MUNDO — abertura de mundo novo: a naveta do Bloop cai do céu
 *  soltando fumaça, bate no chão e explode (cartoon), abrindo uma
 *  cratera. O jogador sai inteiro ao lado, com o carrinho inicial
 *  e as ferramentas básicas. Toque na tela pula.
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../../../i18n';
import { audio } from '../../../core/audio';
import { tap } from '../../../core/haptics';
import { geoms as G, mat4, mergeParts } from '../fps/models';
import type { WorldGame } from './worldgame';

function shipModel(): THREE.Group {
  const g = new THREE.Group();
  const geo = mergeParts([
    { g: new THREE.SphereGeometry(1, 16, 10), c: '#8a5cff', m: mat4(0, 0, 0, 1.3, 1, 2.2), ao: 0.3 },
    { g: new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), c: '#bfeaff', m: mat4(0, 0.55, 0.7, 0.75, 0.6, 0.85) },
    { g: G.box, c: '#ffd34a', m: mat4(1.4, -0.1, -0.6, 1.6, 0.12, 0.9, 0, 0, -0.2) },
    { g: G.box, c: '#ffd34a', m: mat4(-1.4, -0.1, -0.6, 1.6, 0.12, 0.9, 0, 0, 0.2) },
    { g: G.box, c: '#ff4f6a', m: mat4(0, 0.9, -1.6, 0.14, 1, 0.8, -0.4, 0, 0) },
    { g: G.cyl, c: '#5a5668', m: mat4(0, 0, -2.2, 0.55, 0.5, 0.55, Math.PI / 2, 0, 0) },
    { g: new THREE.SphereGeometry(1, 8, 6), c: '#ffffff', m: mat4(0.5, 0.3, 1.95, 0.18, 0.18, 0.1) },
    { g: new THREE.SphereGeometry(1, 8, 6), c: '#ffffff', m: mat4(-0.5, 0.3, 1.95, 0.18, 0.18, 0.1) },
  ]);
  g.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.6, 8), new THREE.MeshBasicMaterial({ color: 0xffb02e }));
  flame.rotation.x = -Math.PI / 2;
  flame.position.z = -3;
  flame.name = 'flame';
  g.add(flame);
  return g;
}

export function playIntro(g: WorldGame): void {
  const W = g.world;
  const fx = -Math.sin(g.yaw);
  const fz = -Math.cos(g.yaw);
  const cx = g.px + fx * 14;
  const cz = g.pz + fz * 14;
  const gy = W.floorAt(cx, 200, cz);
  const start = new THREE.Vector3(cx - fz * 38 - fx * 14, gy + 48, cz + fx * 38 - fz * 14);
  const end = new THREE.Vector3(cx, gy + 0.8, cz);
  const ship = shipModel();
  ship.scale.setScalar(2);
  g.scene.add(ship);
  const flame = ship.getObjectByName('flame') as THREE.Mesh;
  const camPos = new THREE.Vector3(g.px - fx * 6 + fz * 8, W.floorAt(g.px, 200, g.pz) + 4.5, g.pz - fz * 6 - fx * 8);
  const hudEl = g.hud.el;
  hudEl.style.transition = 'opacity .4s';
  hudEl.style.opacity = '0';
  const flash = document.createElement('div');
  flash.style.cssText = 'position:absolute;inset:0;background:#fff7d0;opacity:0;pointer-events:none;z-index:20;transition:opacity .5s';
  const skip = document.createElement('div');
  skip.textContent = t('intro3d.skip', 'Toque para pular');
  skip.style.cssText = 'position:absolute;right:16px;bottom:14px;z-index:21;color:#fff;font-weight:800;font-size:13px;text-shadow:0 1px 0 #2a0b5c;pointer-events:auto;padding:8px 12px;background:rgba(20,8,48,.45);border-radius:12px';
  g.root.append(flash, skip);
  let T = 0;
  let boomed = false;
  let done = false;
  const end_ = () => {
    if (done) return;
    done = true;
    g.scene.remove(ship);
    flash.remove();
    skip.remove();
    hudEl.style.opacity = '1';
    // carrinho inicial ao lado da cratera
    const v = g.vehs[0];
    v.x = cx + fz * 6;
    v.z = cz - fx * 6;
    v.y = W.floorAt(v.x, gy + 6, v.z);
    v.yaw = g.yaw + Math.PI / 2;
    if (!g.save.veh.owned.includes(0)) g.save.veh.owned.push(0);
    g.save.vehPlaced = true;
    g.applyOwned();
    g.py = W.floorAt(g.px, g.py + 3, g.pz);
    g.vy = 0;
    g.hud.toast(t('mundo.introA', 'Sua naveta caiu! Mas você está inteiro.'), 'gold');
    setTimeout(() => g.hud.toast(t('mundo.introB', 'Pegue madeira, abra a mochila e crie uma bancada.')), 2600);
    setTimeout(() => g.hud.toast(t('mundo.introC', 'O carrinho ali do lado é seu!')), 5200);
  };
  skip.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (!boomed) boom();
    T = 99;
  });
  const boom = () => {
    boomed = true;
    W.vox.edit(cx, gy - 0.6, cz, 3.4, -1, 3, new Map());
    g.burst(60, cx, gy + 1, cz, '#ffb02e', 11);
    g.burst(40, cx, gy + 1.5, cz, '#ff4f6a', 9);
    g.burst(40, cx, gy + 1, cz, '#8a5cff', 8);
    g.burst(30, cx, gy + 0.5, cz, '#8a6440', 7);
    g.shake = 1;
    flash.style.transition = 'none';
    flash.style.opacity = '0.9';
    requestAnimationFrame(() => {
      flash.style.transition = 'opacity .9s';
      flash.style.opacity = '0';
    });
    audio.crack();
    tap('heavy');
    // destroços que ficam (enfeite)
    ship.position.set(cx + 1.2, gy - 0.6, cz);
    ship.rotation.set(0.5, 1.2, 0.9);
    ship.scale.setScalar(0.9);
    flame.visible = false;
  };
  g.cine = (dt: number): boolean => {
    T += dt;
    const fall = 4.2;
    if (T < fall) {
      const k = T / fall;
      const e = k * k;
      ship.position.lerpVectors(start, end, e);
      ship.position.y += Math.sin(k * Math.PI) * 6;
      ship.lookAt(end.x + (end.x - start.x), end.y + (end.y - start.y) * 0.6, end.z + (end.z - start.z));
      ship.rotateZ(T * 3);
      flame.scale.setScalar(0.8 + Math.random() * 0.6);
      if (Math.random() < 0.9) g.burst(2, ship.position.x, ship.position.y, ship.position.z, Math.random() < 0.5 ? '#5a5668' : '#ff8a3a', 1.5);
      g.camera.position.copy(camPos);
      g.camera.lookAt(ship.position);
      return true;
    }
    if (!boomed) boom();
    if (T < fall + 1.6) {
      // fumaça subindo da cratera; câmera olha
      if (Math.random() < 0.6) g.burst(1, cx + (Math.random() - 0.5) * 2, gy + 0.5, cz + (Math.random() - 0.5) * 2, '#8a8696', 1);
      g.camera.position.copy(camPos);
      g.camera.lookAt(cx, gy + 1, cz);
      return true;
    }
    if (T < fall + 2.6 && T < 50) {
      // volta para os olhos do jogador
      const k = (T - fall - 1.6) / 1;
      const eye = new THREE.Vector3(g.px, g.py + 1.6, g.pz);
      g.camera.position.lerpVectors(camPos, eye, k * k * (3 - 2 * k));
      g.camera.lookAt(cx, gy + 1, cz);
      return true;
    }
    end_();
    // olha para a cratera
    g.yaw = g.tYaw = Math.atan2(-(cx - g.px), -(cz - g.pz));
    return false;
  };
}
