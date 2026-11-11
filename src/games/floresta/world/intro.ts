/* ============================================================
 *  MUNDO BLOOP — abertura de mundo novo (cena de verdade, ~8 s, pulável):
 *   1. lá do alto, a naveta do Bloop entra na atmosfera pegando fogo
 *      (bola de plasma + rastro de fogo e fumaça), levando tiros de
 *      laser que soltam faíscas;
 *   2. desce rasante, a câmera acompanha;
 *   3. bate no chão: clarão, bola de fogo, onda de choque, destroços
 *      voando (quicam e assentam), cratera e coluna de fumaça;
 *   4. a escotilha estoura e o jogador sai dos destroços (a câmera sai
 *      de dentro da nave e vira os olhos do jogador ao lado dela).
 *  Os destroços ficam como marco (salvos em save.wreck, protegidos de
 *  cavar, com colisão e fumacinha), sem nenhum carrinho surgindo.
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../../../i18n';
import { audio } from '../../../core/audio';
import { tap } from '../../../core/haptics';
import { geoms as G, mat4, mergeParts } from '../fps/models';
import type { WorldGame } from './worldgame';
import type { SBox } from './collide';

/* ------------------------------ modelos ------------------------------ */

function shipGeo(burnt: boolean): THREE.BufferGeometry {
  const body = burnt ? '#5a3a8a' : '#8a5cff';
  const wing = burnt ? '#a8902a' : '#ffd34a';
  const fin = burnt ? '#8a3040' : '#ff4f6a';
  return mergeParts([
    { g: new THREE.SphereGeometry(1, 16, 10), c: body, m: mat4(0, 0, 0, 1.3, 1, 2.2), ao: 0.3 },
    { g: new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), c: burnt ? '#2a3440' : '#bfeaff', m: mat4(0, 0.55, 0.7, 0.75, 0.6, 0.85) },
    { g: G.box, c: wing, m: mat4(1.4, -0.1, -0.6, 1.6, 0.12, 0.9, 0, 0, -0.2) },
    { g: G.box, c: wing, m: burnt ? mat4(-1.1, -0.3, -0.4, 1.0, 0.12, 0.8, 0.4, 0.3, 0.9) : mat4(-1.4, -0.1, -0.6, 1.6, 0.12, 0.9, 0, 0, 0.2) },
    { g: G.box, c: fin, m: mat4(0, 0.9, -1.6, 0.14, 1, 0.8, -0.4, 0, 0) },
    { g: G.cyl, c: '#5a5668', m: mat4(0, 0, -2.2, 0.55, 0.5, 0.55, Math.PI / 2, 0, 0) },
    { g: new THREE.SphereGeometry(1, 8, 6), c: burnt ? '#3a3a40' : '#ffffff', m: mat4(0.5, 0.3, 1.95, 0.18, 0.18, 0.1) },
    { g: new THREE.SphereGeometry(1, 8, 6), c: burnt ? '#3a3a40' : '#ffffff', m: mat4(-0.5, 0.3, 1.95, 0.18, 0.18, 0.1) },
    // amassados / placas soltas (só nos destroços)
    ...(burnt
      ? [
          { g: G.box, c: '#3a2a4a', m: mat4(0.6, 0.7, -0.4, 0.7, 0.08, 0.9, 0.5, 0.2, 0.3) },
          { g: G.box, c: '#2a2030', m: mat4(-0.5, -0.4, 1.1, 0.8, 0.5, 0.6, 0.2, 0.6, 0) },
        ]
      : []),
  ]);
}
const shipMat = new THREE.MeshLambertMaterial({ vertexColors: true });

function shipModel(): THREE.Group {
  const g = new THREE.Group();
  // sem neblina: a nave é vista lá do alto, bem longe
  g.add(new THREE.Mesh(shipGeo(false), new THREE.MeshLambertMaterial({ vertexColors: true, fog: false })));
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.6, 10), new THREE.MeshBasicMaterial({ color: 0xffb02e, fog: false }));
  flame.rotation.x = -Math.PI / 2;
  flame.position.z = -3;
  flame.name = 'flame';
  g.add(flame);
  // escudo de plasma da entrada na atmosfera (na frente da nave)
  const pl = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff8a3a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  pl.scale.set(1.7, 1.5, 2.8);
  pl.position.z = 0.6;
  pl.name = 'plasma';
  g.add(pl);
  return g;
}

/** destroços que ficam no mundo */
export function wreckModel(): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.Mesh(shipGeo(true), shipMat);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  g.scale.setScalar(1.25);
  return g;
}

/* ------------------------------ fumaça/fogo (sprites macios) ------------------------------ */

let softTex: THREE.CanvasTexture | null = null;
function soft(): THREE.CanvasTexture {
  if (softTex) return softTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.45, 'rgba(255,255,255,.6)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 64, 64);
  softTex = new THREE.CanvasTexture(c);
  return softTex;
}

interface Puff {
  s: THREE.Sprite;
  t: number;
  life: number;
  vx: number;
  vy: number;
  vz: number;
  s0: number;
  s1: number;
  a0: number;
  fire: boolean;
}

/** nuvens de fumaça e labaredas (sprites com textura macia; fogo aditivo) */
export class Puffs {
  private list: Puff[] = [];
  private fireMat: THREE.SpriteMaterial;
  private smokeMat: THREE.SpriteMaterial;
  constructor(private scene: THREE.Scene) {
    this.fireMat = new THREE.SpriteMaterial({ map: soft(), color: 0xffa040, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
    this.smokeMat = new THREE.SpriteMaterial({ map: soft(), color: 0x6a6470, depthWrite: false, transparent: true });
  }
  add(fire: boolean, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, a0 = fire ? 0.9 : 0.55, col?: number): void {
    if (this.list.length > 260) {
      const o = this.list.shift()!;
      this.scene.remove(o.s);
      o.s.material.dispose();
    }
    const m = (fire ? this.fireMat : this.smokeMat).clone();
    if (col !== undefined) m.color.setHex(col);
    const s = new THREE.Sprite(m);
    s.position.set(x, y, z);
    s.scale.setScalar(s0);
    s.renderOrder = fire ? 6 : 5;
    this.scene.add(s);
    this.list.push({ s, t: 0, life, vx, vy, vz, s0, s1, a0, fire });
  }
  update(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) {
        this.scene.remove(p.s);
        p.s.material.dispose();
        this.list.splice(i, 1);
        continue;
      }
      p.s.position.x += p.vx * dt;
      p.s.position.y += p.vy * dt;
      p.s.position.z += p.vz * dt;
      p.vx *= 1 - dt * 0.8;
      p.vz *= 1 - dt * 0.8;
      if (!p.fire) p.vy += dt * 0.6;
      p.s.scale.setScalar(p.s0 + (p.s1 - p.s0) * Math.sqrt(k));
      p.s.material.opacity = p.a0 * (p.fire ? 1 - k : Math.min(1, k * 6) * (1 - k));
      if (p.fire) p.s.material.color.setRGB(1, 0.75 - k * 0.5, 0.3 - k * 0.3);
    }
  }
  get count(): number {
    return this.list.length;
  }
  dispose(): void {
    for (const p of this.list) {
      this.scene.remove(p.s);
      p.s.material.dispose();
    }
    this.list = [];
  }
}

/* ------------------------------ destroços como marco ------------------------------ */

/** põe os destroços salvos no mundo: modelo, colisão e fumacinha de vez em quando */
export class Wreck {
  g: THREE.Group;
  private box: SBox;
  private puffs: Puffs;
  private t = 0;
  constructor(
    private gm: WorldGame,
    readonly x: number,
    readonly y: number,
    readonly z: number,
    readonly yaw: number,
  ) {
    this.g = wreckModel();
    this.g.position.set(x, y, z);
    this.g.rotation.set(0.32, yaw, 0.42);
    gm.scene.add(this.g);
    const S = gm.world.solids;
    this.box = S.add(S.makeBox(x, z, y - 1.2, y + 1.6, 1.8, 2.8, yaw, 0));
    this.puffs = new Puffs(gm.scene);
    gm.world.grassDirtyAt(x, z, 4);
  }
  update(dt: number, px: number, pz: number): void {
    this.t -= dt;
    const near = (px - this.x) ** 2 + (pz - this.z) ** 2 < 90 * 90;
    if (near && this.t <= 0) {
      this.t = 0.45 + Math.random() * 0.4;
      this.puffs.add(false, this.x + (Math.random() - 0.5) * 1.2, this.y + 1.2, this.z + (Math.random() - 0.5) * 1.2, 0.2, 0.9, 0.1, 4.5, 0.8, 3.2, 0.35);
    }
    this.puffs.update(dt);
  }
  dispose(): void {
    this.gm.scene.remove(this.g);
    this.gm.world.solids.remove(this.box);
    this.puffs.dispose();
  }
}

/* ------------------------------ a cena ------------------------------ */

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

interface Bit {
  m: THREE.Mesh;
  v: THREE.Vector3;
  r: THREE.Vector3;
  rest: boolean;
}

export function playIntro(g: WorldGame): void {
  const W = g.world;
  const fx = -Math.sin(g.yaw);
  const fz = -Math.cos(g.yaw);
  const rx = -fz;
  const rz = fx;
  // ponto de impacto: à frente do início, em chão firme fora d'água
  let cx = g.px + fx * 16 + rx * 3;
  let cz = g.pz + fz * 16 + rz * 3;
  for (let k = 0; k < 10 && W.isWater(cx, cz); k++) {
    cx -= fx * 3;
    cz -= fz * 3;
  }
  const gy = W.floorAt(cx, 200, cz);
  // direção do voo: vem do alto, de trás-esquerda para frente-direita
  const dx = fx * 0.55 + rx * 0.84;
  const dz = fz * 0.55 + rz * 0.84;
  const start = new THREE.Vector3(cx - dx * 150, gy + 120, cz - dz * 150);
  const impact = new THREE.Vector3(cx, gy + 0.6, cz);
  const ship = shipModel();
  ship.scale.setScalar(1.6);
  g.scene.add(ship);
  const flame = ship.getObjectByName('flame') as THREE.Mesh;
  const plasma = ship.getObjectByName('plasma') as THREE.Mesh;
  const puffs = new Puffs(g.scene);
  // lasers que perseguem a nave (de cima, fora da tela)
  const lasers: { m: THREE.Mesh; t: number; from: THREE.Vector3; hit: boolean }[] = [];
  const laserMat = new THREE.MeshBasicMaterial({ color: 0x7affc4, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const laserGeo = new THREE.CylinderGeometry(0.12, 0.12, 6, 6);
  laserGeo.rotateX(Math.PI / 2);
  // explosão
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  ball.visible = false;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.18, 6, 40), new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  g.scene.add(ball, ring);
  const bits: Bit[] = [];
  const bitMats = ['#8a5cff', '#ffd34a', '#ff4f6a', '#5a5668', '#bfeaff'].map((c) => new THREE.MeshLambertMaterial({ color: c }));
  // tela: clarão, faixas de cinema, botão pular
  const hudEl = g.hud.el;
  hudEl.style.transition = 'opacity .4s';
  hudEl.style.opacity = '0';
  g.hud.setControls(false);
  const flash = document.createElement('div');
  flash.style.cssText = 'position:absolute;inset:0;background:#fff7d0;opacity:0;pointer-events:none;z-index:20;transition:opacity .5s';
  const bars = document.createElement('div');
  bars.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:19;box-shadow:inset 0 9vh 0 #000,inset 0 -9vh 0 #000;transition:box-shadow .6s';
  const skip = document.createElement('button');
  skip.className = 'fl-btn';
  skip.textContent = t('intro3d.skip2', 'Pular ⏭');
  skip.style.cssText = 'position:absolute;right:calc(max(env(safe-area-inset-right,0px),16px) + 4px);top:calc(9vh + 8px);z-index:21;min-height:34px;font-size:13px;padding:4px 12px;pointer-events:auto';
  g.root.append(bars, flash, skip);
  // posição final do jogador: saindo da escotilha, ao lado dos destroços
  const outX = cx - dx * 6.5 + rx * 1.5;
  const outZ = cz - dz * 6.5 + rz * 1.5;
  const camPos = new THREE.Vector3(g.px - fx * 2 + rx * 2.5, W.floorAt(g.px, 200, g.pz) + 2.2, g.pz - fz * 2 + rz * 2.5);
  const T_FALL = 4.2;
  let T = 0;
  let boomed = false;
  let done = false;
  let wyaw = Math.atan2(dx, dz);
  const pathAt = (k: number, out: THREE.Vector3) => {
    // horizontal reto; altura cai mais no começo (mergulho) e achata perto do chão (rasante)
    out.lerpVectors(start, impact, k);
    out.y = impact.y + (start.y - impact.y) * Math.pow(1 - k, 1.8);
    return out;
  };
  const boom = () => {
    if (boomed) return;
    boomed = true;
    // cratera, sem proteção ainda (o marco é registrado logo depois)
    W.vox.edit(cx, gy - 0.9, cz, 3.2, -1, 3, new Map());
    W.grassDirtyAt(cx, cz, 6);
    ship.visible = false;
    ball.visible = ring.visible = true;
    ball.position.set(cx, gy + 1, cz);
    ring.position.set(cx, gy + 0.3, cz);
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 3;
      puffs.add(true, cx, gy + 1, cz, Math.cos(a) * sp, 2 + Math.random() * 5, Math.sin(a) * sp, 0.7 + Math.random() * 0.6, 1.2, 4.5);
      puffs.add(false, cx + (Math.random() - 0.5) * 3, gy + 1, cz + (Math.random() - 0.5) * 3, Math.cos(a) * 1.5, 1 + Math.random() * 2, Math.sin(a) * 1.5, 3 + Math.random() * 2, 1.5, 6, 0.6);
    }
    // destroços (pedaços da nave) voando
    for (let i = 0; i < 18; i++) {
      const s = 0.18 + Math.random() * 0.35;
      const m = new THREE.Mesh(G.box, bitMats[i % bitMats.length]);
      m.scale.set(s, s * (0.4 + Math.random() * 0.6), s * (0.6 + Math.random()));
      m.position.set(cx, gy + 1, cz);
      m.castShadow = true;
      g.scene.add(m);
      const a = Math.random() * Math.PI * 2;
      const sp = 4 + Math.random() * 7;
      bits.push({ m, v: new THREE.Vector3(Math.cos(a) * sp, 5 + Math.random() * 8, Math.sin(a) * sp), r: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8), rest: false });
    }
    g.burst(70, cx, gy + 1, cz, '#ffb02e', 12);
    g.burst(40, cx, gy + 0.6, cz, '#8a6440', 8);
    g.shake = 1.1;
    flash.style.transition = 'none';
    flash.style.opacity = '0.95';
    requestAnimationFrame(() => {
      flash.style.transition = 'opacity 1.1s';
      flash.style.opacity = '0';
    });
    audio.crack();
    tap('heavy');
    // destroços que ficam: na cratera, meio enterrados, inclinados
    const wy = W.floorAt(cx, gy + 2, cz) + 0.9;
    wyaw = Math.atan2(dx, dz);
    g.save.wreck = [Math.round(cx * 10) / 10, Math.round(wy * 100) / 100, Math.round(cz * 10) / 10, Math.round(wyaw * 100) / 100];
    g.placeWreck();
  };
  const end_ = () => {
    if (done) return;
    done = true;
    boom();
    g.scene.remove(ship, ball, ring);
    for (const l of lasers) g.scene.remove(l.m);
    for (const b of bits) g.scene.remove(b.m);
    // as fumaças da explosão se dissolvem sozinhas (o marco tem a fumacinha dele)
    const fade = puffs;
    let left = 4;
    const tick = (dt: number) => {
      fade.update(dt);
      left -= dt;
      return left > 0;
    };
    g.afterCine.push(tick);
    flash.remove();
    bars.remove();
    skip.remove();
    hudEl.style.opacity = '1';
    g.hud.setControls(true);
    g.save.vehPlaced = true;
    g.fp.place(outX, outZ, W.floorAt(outX, gy + 6, outZ));
    g.fpc.reset();
    // olhando para longe dos destroços, com eles no canto do olho
    g.yaw = g.tYaw = Math.atan2(-(outX - cx), -(outZ - cz)) + 0.9;
    g.pitch = g.tPitch = -0.08;
    g.hud.toast(t('mundo.introA', 'Sua naveta caiu! Mas você está inteiro.'), 'gold');
    g.hud.goal(t('mundo.goal1', 'Pegue madeira e crie uma bancada (mochila)'));
  };
  skip.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    T = 99;
  });
  let shot = 0;
  g.cine = (dt: number): boolean => {
    T += dt;
    puffs.update(dt);
    if (T >= 99) {
      end_();
      return false;
    }
    if (T < T_FALL) {
      const k = T / T_FALL;
      const p = pathAt(k, ship.position);
      pathAt(Math.min(1, k + 0.01), _v);
      ship.lookAt(_v);
      ship.rotateZ(Math.sin(T * 5) * 0.25 + T * 0.4);
      flame.scale.setScalar(0.8 + Math.random() * 0.6);
      // plasma forte lá no alto, some ao descer
      const hot = Math.max(0, 1 - k * 1.6);
      plasma.visible = hot > 0.02;
      (plasma.material as THREE.MeshBasicMaterial).opacity = 0.6 * hot * (0.8 + Math.random() * 0.2);
      plasma.scale.set(1.7 * (1 + hot * 1.5), 1.5 * (1 + hot * 1.5), 2.8 * (1 + hot * 1.5));
      // rastro: fogo atrás, fumaça mais longa
      _w.subVectors(p, _v).normalize();
      const n = Math.random() < 0.5 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        puffs.add(true, p.x + _w.x * 2.4, p.y + _w.y * 2.4, p.z + _w.z * 2.4, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0.5, 1.4 + hot * 2, 0.4);
        puffs.add(false, p.x + _w.x * 3.5, p.y + _w.y * 3.5, p.z + _w.z * 3.5, (Math.random() - 0.5) * 1.5, 0.5, (Math.random() - 0.5) * 1.5, 3.2, 1.2, 4 + hot * 4, 0.5, hot > 0.3 ? 0x4a4450 : 0x7a7480);
      }
      // tiros de laser nos primeiros 2 s
      if (T < 2.2 && T > shot) {
        shot = T + 0.38 + Math.random() * 0.2;
        const m = new THREE.Mesh(laserGeo, laserMat);
        const from = new THREE.Vector3(p.x - dx * 60 + (Math.random() - 0.5) * 30, p.y + 50, p.z - dz * 60 + (Math.random() - 0.5) * 30);
        m.position.copy(from);
        g.scene.add(m);
        lasers.push({ m, t: 0, from, hit: false });
        audio.click();
      }
      for (const l of lasers) {
        if (l.hit) continue;
        l.t += dt / 0.35;
        l.m.position.lerpVectors(l.from, ship.position, Math.min(1, l.t));
        l.m.lookAt(ship.position);
        if (l.t >= 1) {
          l.hit = true;
          g.scene.remove(l.m);
          // faíscas no casco
          for (let i = 0; i < 6; i++) puffs.add(true, p.x, p.y, p.z, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, 0.35, 1.2, 0.2, 1, 0x9affd8);
          g.shake = Math.max(g.shake, 0.15);
        }
      }
      // câmera: perto do chão olhando para cima, seguindo a nave (um pouco à frente)
      g.camera.position.copy(camPos);
      g.camera.lookAt(p.x * 0.8 + impact.x * 0.2, p.y * 0.85 + impact.y * 0.15, p.z * 0.8 + impact.z * 0.2);
      const fov = 46 + k * 22;
      if (Math.abs(g.camera.fov - fov) > 0.2) {
        g.camera.fov = fov;
        g.camera.updateProjectionMatrix();
      }
      return true;
    }
    if (!boomed) boom();
    const e = T - T_FALL;
    // bola de fogo e onda de choque
    const kb = Math.min(1, e / 0.6);
    ball.scale.setScalar(1 + kb * 6);
    (ball.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - kb);
    ring.scale.setScalar(1 + Math.min(1, e / 0.8) * 14);
    (ring.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - Math.min(1, e / 0.8));
    // destroços: balística, quicam e param no chão
    for (const b of bits) {
      if (b.rest) continue;
      b.v.y -= 22 * dt;
      b.m.position.addScaledVector(b.v, dt);
      b.m.rotation.x += b.r.x * dt;
      b.m.rotation.y += b.r.y * dt;
      b.m.rotation.z += b.r.z * dt;
      const fl = W.floorAt(b.m.position.x, b.m.position.y + 1, b.m.position.z) + 0.08;
      if (b.m.position.y <= fl) {
        b.m.position.y = fl;
        if (b.v.y < -3) {
          b.v.y *= -0.3;
          b.v.x *= 0.5;
          b.v.z *= 0.5;
          b.r.multiplyScalar(0.5);
        } else b.rest = true;
      }
    }
    // coluna de fumaça e fogo na cratera
    if (Math.random() < 0.7) puffs.add(false, cx + (Math.random() - 0.5) * 2, gy + 1, cz + (Math.random() - 0.5) * 2, 0, 2.5, 0, 3.5, 1.5, 5, 0.55);
    if (e < 2 && Math.random() < 0.6) puffs.add(true, cx + (Math.random() - 0.5) * 1.5, gy + 0.8, cz + (Math.random() - 0.5) * 1.5, 0, 2, 0, 0.6, 1, 2.2);
    if (e < 1.8) {
      // câmera: se aproxima da cratera
      const k = e / 1.8;
      _v.set(cx - dx * 9 + rx * 4, gy + 3.2, cz - dz * 9 + rz * 4);
      g.camera.position.lerpVectors(camPos, _v, k * k * (3 - 2 * k));
      g.camera.lookAt(cx, gy + 1 - k * 0.3, cz);
      return true;
    }
    if (e < 3.3) {
      // escotilha estoura: a câmera sai de dentro dos destroços e vira os olhos do jogador ao lado
      const k = (e - 1.8) / 1.5;
      const s = k * k * (3 - 2 * k);
      _v.set(cx - dx * 9 + rx * 4, gy + 3.2, cz - dz * 9 + rz * 4);
      _w.set(cx, gy + 1.2, cz);
      if (k < 0.35) {
        g.camera.position.lerpVectors(_v, _w, s / 0.35 > 1 ? 1 : (k / 0.35) * (k / 0.35));
        g.camera.lookAt(cx - dx * 6, gy + 1, cz - dz * 6);
        if (k > 0.3 && !hatch) {
          hatch = true;
          audio.click();
          tap('light');
          for (let i = 0; i < 10; i++) puffs.add(false, cx - dx * 1.2, gy + 1.4, cz - dz * 1.2, -dx * 3 + (Math.random() - 0.5) * 2, 1 + Math.random(), -dz * 3 + (Math.random() - 0.5) * 2, 1.6, 0.8, 2.8, 0.5);
        }
      } else {
        const kk = (k - 0.35) / 0.65;
        const ss = kk * kk * (3 - 2 * kk);
        const ey = W.floorAt(outX, gy + 6, outZ) + 1.6;
        g.camera.position.set(_w.x + (outX - _w.x) * ss, _w.y + (ey - _w.y) * ss + Math.sin(kk * Math.PI) * 0.6, _w.z + (outZ - _w.z) * ss);
        g.camera.lookAt(outX - dx * 6, ey - 0.2, outZ - dz * 6);
      }
      if (g.camera.fov !== 70) {
        g.camera.fov = 70;
        g.camera.updateProjectionMatrix();
      }
      return true;
    }
    end_();
    return false;
  };
  let hatch = false;
}
