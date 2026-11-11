/* ============================================================
 *  Página de depuração dos veículos — terreno de teste com rampa,
 *  lago e toras físicas. Implementa VehicleHost do jeito que o motor
 *  do mundo faria (heightfield, cavar, aplainar).
 * ============================================================ */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import type { VehicleHost } from '../vehicle';
import { LOG_MASS } from '../design';

export const SIZE = 160;
const ES = 1;
const N = SIZE / ES + 1;
export const RAMP_Z0 = -20;
export const RAMP_Z1 = -62;
export const RAMP_DEG = 14;
export const WATER_Y = -0.5;
const POND = { x0: 22, x1: 62, z0: -6, z1: 40 };
export const LOG_R = 0.27;
export const LOG_HALF = 0.62;

function baseH(x: number, z: number): number {
  let h = Math.sin(x * 0.21) * Math.cos(z * 0.17) * 0.12;
  const tan = Math.tan((RAMP_DEG * Math.PI) / 180);
  if (z < RAMP_Z0) h += (Math.min(RAMP_Z0 - z, RAMP_Z0 - RAMP_Z1)) * tan;
  if (z < RAMP_Z1 - 14) h -= (RAMP_Z1 - 14 - z) * 0.3;
  // lago
  const dx = Math.max(POND.x0 - x, 0, x - POND.x1);
  const dz = Math.max(POND.z0 - z, 0, z - POND.z1);
  const d = Math.hypot(dx, dz);
  if (d < 6) h -= 2.6 * (1 - d / 6) ** 0.7 * (d < 0.01 ? 1 : 1);
  return h;
}

export class Sandbox implements VehicleHost {
  readonly world: CANNON.World;
  readonly material = new CANNON.Material('chassis');
  readonly groundMat = new CANNON.Material('ground');
  readonly logMat = new CANNON.Material('log');
  readonly data: number[][] = [];
  readonly hf: CANNON.Heightfield;
  readonly ground: CANNON.Body;
  readonly mesh: THREE.Mesh;
  readonly water: THREE.Mesh;
  readonly logs: CANNON.Body[] = [];
  readonly logMesh: THREE.InstancedMesh;
  dug = 0;
  toasts: string[] = [];

  constructor(scene: THREE.Scene) {
    const w = new CANNON.World({ gravity: new CANNON.Vec3(0, -20, 0) });
    w.broadphase = new CANNON.SAPBroadphase(w);
    w.allowSleep = true;
    (w.solver as CANNON.GSSolver).iterations = 8;
    w.defaultContactMaterial.friction = 0.4;
    w.addContactMaterial(new CANNON.ContactMaterial(this.groundMat, this.logMat, { friction: 0.55, restitution: 0.1 }));
    w.addContactMaterial(new CANNON.ContactMaterial(this.material, this.logMat, { friction: 0.7, restitution: 0.05 }));
    w.addContactMaterial(new CANNON.ContactMaterial(this.material, this.groundMat, { friction: 0.3, restitution: 0.05 }));
    this.world = w;
    for (let i = 0; i < N; i++) {
      const row: number[] = [];
      for (let j = 0; j < N; j++) row.push(baseH(-SIZE / 2 + i * ES, SIZE / 2 - j * ES));
      this.data.push(row);
    }
    this.hf = new CANNON.Heightfield(this.data, { elementSize: ES });
    const g = new CANNON.Body({ mass: 0, material: this.groundMat, collisionFilterGroup: 1 });
    g.addShape(this.hf);
    g.position.set(-SIZE / 2, 0, SIZE / 2);
    g.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    w.addBody(g);
    this.ground = g;

    const geo = new THREE.PlaneGeometry(SIZE, SIZE, N - 1, N - 1);
    geo.rotateX(-Math.PI / 2);
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
    this.mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);
    this.refreshMesh();
    const wg = new THREE.PlaneGeometry(POND.x1 - POND.x0 + 12, POND.z1 - POND.z0 + 12);
    wg.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(wg, new THREE.MeshLambertMaterial({ color: 0x3a9adf, transparent: true, opacity: 0.75 }));
    this.water.position.set((POND.x0 + POND.x1) / 2, WATER_Y, (POND.z0 + POND.z1) / 2);
    scene.add(this.water);
    // linhas de 5 em 5 m na rampa (para ler a subida nas fotos)
    for (let z = RAMP_Z0; z >= RAMP_Z1; z -= 5) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(24, 0.04, 0.25), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      m.position.set(0, this.heightAt(0, z) + 0.03, z);
      scene.add(m);
    }
    const lg = new THREE.CylinderGeometry(LOG_R, LOG_R, LOG_HALF * 2, 10);
    lg.rotateZ(Math.PI / 2);
    this.logMesh = new THREE.InstancedMesh(lg, new THREE.MeshLambertMaterial({ color: 0x9a6a3c }), 64);
    this.logMesh.count = 0;
    this.logMesh.frustumCulled = false;
    this.logMesh.castShadow = true;
    scene.add(this.logMesh);
  }

  private refreshMesh(): void {
    const geo = this.mesh.geometry as THREE.BufferGeometry;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const col = geo.attributes.color as THREE.BufferAttribute;
    const c = new THREE.Color();
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k);
      const z = pos.getZ(k);
      const h = this.heightAt(x, z);
      pos.setY(k, h);
      const slope = Math.abs(this.heightAt(x, z - 1) - h);
      if (h < WATER_Y + 0.2 && x > POND.x0 - 7 && x < POND.x1 + 7 && z > POND.z0 - 7 && z < POND.z1 + 7) c.set('#d8c890');
      else if (slope > 0.2) c.set('#7aa04a');
      else c.set('#8ac85a');
      const n = Math.sin(x * 1.7) * Math.cos(z * 1.3) * 0.04;
      col.setXYZ(k, c.r + n, c.g + n, c.b + n);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    geo.computeVertexNormals();
  }

  /* ---------------- VehicleHost ---------------- */
  heightAt = (x: number, z: number): number => {
    const fi = (x + SIZE / 2) / ES;
    const fj = (SIZE / 2 - z) / ES;
    const i = Math.max(0, Math.min(N - 2, Math.floor(fi)));
    const j = Math.max(0, Math.min(N - 2, Math.floor(fj)));
    const u = Math.max(0, Math.min(1, fi - i));
    const v = Math.max(0, Math.min(1, fj - j));
    const d = this.data;
    return (d[i][j] * (1 - u) + d[i + 1][j] * u) * (1 - v) + (d[i][j + 1] * (1 - u) + d[i + 1][j + 1] * u) * v;
  };
  waterLevel = (x: number, z: number): number => (x > POND.x0 - 7 && x < POND.x1 + 7 && z > POND.z0 - 7 && z < POND.z1 + 7 ? WATER_Y : -Infinity);
  private edit(x: number, z: number, r: number, f: (h: number, k: number) => number): number {
    let moved = 0;
    const i0 = Math.max(0, Math.floor((x - r + SIZE / 2) / ES));
    const i1 = Math.min(N - 1, Math.ceil((x + r + SIZE / 2) / ES));
    const j0 = Math.max(0, Math.floor((SIZE / 2 - z - r) / ES));
    const j1 = Math.min(N - 1, Math.ceil((SIZE / 2 - z + r) / ES));
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const wx = -SIZE / 2 + i * ES;
        const wz = SIZE / 2 - j * ES;
        const d = Math.hypot(wx - x, wz - z);
        if (d > r) continue;
        const k = 1 - d / r;
        const h0 = this.data[i][j];
        const h1 = f(h0, k);
        moved += Math.abs(h1 - h0);
        this.data[i][j] = h1;
      }
    if (moved > 0) {
      this.hf.update();
      this.refreshMesh();
      for (const b of this.world.bodies) if (b.type === CANNON.Body.DYNAMIC) b.wakeUp();
    }
    return moved;
  }
  dig = (x: number, y: number, z: number, r: number): Map<string, number> | null => {
    const top = this.heightAt(x, z);
    if (y > top + 0.4) return null;
    const moved = this.edit(x, z, r + 0.6, (h, k) => Math.max(y - r * 0.5, h - 0.12 * k));
    this.dug += moved;
    return moved > 0.05 ? new Map([['terra', Math.max(1, Math.round(moved * 2))]]) : null;
  };
  flatten = (x: number, z: number, r: number, y: number): void => {
    this.edit(x, z, r, (h, k) => h + (y - h) * Math.min(1, k * 0.6 + 0.2));
  };
  say = (text: string): void => {
    if (text) this.toasts.push(text);
  };

  /* ---------------- toras ---------------- */
  addLog(x: number, y: number, z: number, yaw: number): CANNON.Body {
    const b = new CANNON.Body({ mass: LOG_MASS, material: this.logMat, linearDamping: 0.12, angularDamping: 0.35, allowSleep: true, sleepSpeedLimit: 0.25, sleepTimeLimit: 0.7 });
    const s = new CANNON.Sphere(LOG_R);
    b.addShape(s, new CANNON.Vec3(-LOG_HALF + LOG_R * 0.6, 0, 0));
    b.addShape(s, new CANNON.Vec3(0, 0, 0));
    b.addShape(s, new CANNON.Vec3(LOG_HALF - LOG_R * 0.6, 0, 0));
    b.position.set(x, y, z);
    b.quaternion.setFromEuler(0, yaw, 0);
    this.world.addBody(b);
    this.logs.push(b);
    return b;
  }
  clearLogs(): void {
    for (const b of this.logs) this.world.removeBody(b);
    this.logs.length = 0;
  }
  syncLogs(): void {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    this.logs.forEach((b, i) => {
      m.compose(p.set(b.position.x, b.position.y, b.position.z), q.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w), one);
      this.logMesh.setMatrixAt(i, m);
    });
    this.logMesh.count = this.logs.length;
    this.logMesh.instanceMatrix.needsUpdate = true;
  }
}
