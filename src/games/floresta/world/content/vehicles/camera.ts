/* ============================================================
 *  VEÍCULOS DO MUNDO — câmera de perseguição com colisão.
 *  Fica atrás e acima (distância pelo tamanho do veículo), suaviza,
 *  não entra no terreno nem atravessa árvores/paredes (raio no mundo
 *  físico, só corpos estáticos) e aceita giro temporário pelo dedo.
 * ============================================================ */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import type { Vehicle, VehicleHost } from './vehicle';

const _t = new THREE.Vector3();
const _d = new THREE.Vector3();
const _f = new THREE.Vector3();
const _ray = new CANNON.RaycastResult();
const _a = new CANNON.Vec3();
const _b = new CANNON.Vec3();

export class ChaseCam {
  /** giro extra pelo dedo (rad) e inclinação extra */
  orbit = 0;
  tilt = 0;
  private idle = 0;
  private yaw = 0;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private dist = 0;
  private first = true;
  /** máscara dos corpos que bloqueiam a câmera (chão + estáticos do motor) */
  mask = 1 | 4;

  constructor(private host: VehicleHost) {}

  reset(): void {
    this.first = true;
    this.orbit = 0;
    this.tilt = 0;
  }
  /** arraste do dedo: dYaw/dPitch em rad */
  drag(dYaw: number, dPitch: number): void {
    this.orbit += dYaw;
    this.tilt = Math.max(-0.3, Math.min(0.8, this.tilt + dPitch));
    this.idle = 0;
  }

  update(cam: THREE.PerspectiveCamera, v: Vehicle, dt: number): void {
    const L = v.lay;
    const air = v.stats.kind === 'heli' || v.stats.kind === 'plane';
    const baseD = 3.6 + L.hl * 1.7 + (air ? 2.5 : 0);
    const baseH = 1.6 + L.hl * 0.55 + (air ? 1 : 0);
    const b = v.body.position;
    _t.set(b.x, b.y + 0.9, b.z);
    // segue o rumo do veículo (de ré, não vira a câmera)
    const target = v.yaw;
    if (this.first) this.yaw = target;
    let dy = target - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * (1 - Math.exp(-dt * 3.2));
    this.idle += dt;
    if (this.idle > 1.6) {
      this.orbit *= Math.exp(-dt * 2);
      this.tilt *= Math.exp(-dt * 2);
    }
    const yaw = this.yaw + this.orbit;
    const speedPull = Math.min(1.5, Math.abs(v.speed) * 0.05);
    const D = baseD + speedPull;
    const H = baseH + this.tilt * D;
    _f.set(Math.sin(yaw), 0, Math.cos(yaw)); // atrás (frente = −Z)
    _d.set(_t.x + _f.x * D, _t.y + H, _t.z + _f.z * D);
    // colisão: terreno ao longo do segmento
    let k = 1;
    const hAt = this.host.heightAt;
    if (hAt) {
      for (let i = 1; i <= 6; i++) {
        const s = i / 6;
        const x = _t.x + (_d.x - _t.x) * s;
        const z = _t.z + (_d.z - _t.z) * s;
        const y = _t.y + (_d.y - _t.y) * s;
        if (hAt(x, z) + 0.45 > y) {
          k = Math.min(k, Math.max(0.25, s - 0.12));
          break;
        }
      }
    }
    // colisão: corpos estáticos (árvores, paredes)
    _a.set(_t.x, _t.y, _t.z);
    _b.set(_d.x, _d.y, _d.z);
    _ray.reset();
    this.host.world.raycastClosest(_a, _b, { collisionFilterMask: this.mask, skipBackfaces: true }, _ray);
    if (_ray.hasHit && _ray.body && _ray.body.type === CANNON.Body.STATIC) {
      const len = _a.distanceTo(_b);
      k = Math.min(k, Math.max(0.2, (_ray.distance - 0.35) / len));
    }
    // aproxima rápido, afasta devagar
    const want = k;
    this.dist = this.first ? want : want < this.dist ? want : this.dist + (want - this.dist) * (1 - Math.exp(-dt * 1.5));
    _d.set(_t.x + (_d.x - _t.x) * this.dist, _t.y + (_d.y - _t.y) * this.dist, _t.z + (_d.z - _t.z) * this.dist);
    if (hAt) _d.y = Math.max(_d.y, hAt(_d.x, _d.z) + 0.5);
    if (this.first) {
      this.pos.copy(_d);
      this.look.copy(_t);
      this.first = false;
    } else {
      this.pos.lerp(_d, 1 - Math.exp(-dt * 7));
      this.look.lerp(_t, 1 - Math.exp(-dt * 12));
    }
    cam.position.copy(this.pos);
    cam.lookAt(this.look);
  }
}
