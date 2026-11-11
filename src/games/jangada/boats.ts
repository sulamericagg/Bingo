/* ============================================================
 *  JANGADA BLOOP — barcos para viajar até as ilhas (a jangada é a casa):
 *   - Canoa: remo, devagar e firme;
 *   - Veleiro: rápido com vento a favor (o vento gira devagar);
 *   - Lancha: muito rápida, gasta combustível (sem combustível só anda
 *     devagarinho, no "motor de reserva").
 *  Joystick: frente/trás acelera, lados viram. Pular = sair do barco.
 *  Tempestade balança mais; tubarões do mar aberto batem no casco.
 *  O motorista simula o próprio barco e manda a pose; o anfitrião guarda
 *  a lista (criar, casco, combustível, quem dirige).
 * ============================================================ */
import * as THREE from 'three';
import { BOATS, FUEL_SEC, type BoatK } from './data';
import { boatModel, type BoatModel } from './models2';

export interface BoatSave {
  id: number;
  k: BoatK;
  x: number;
  z: number;
  yaw: number;
  hp: number;
  fuel: number;
}
export class Boat {
  readonly m: BoatModel;
  v = 0;
  drv = '';
  /** virou (casco zerado): toque em USAR para desvirar */
  flip = 0;
  y = 0;
  pitch = 0;
  roll = 0;
  private wakeT = 0;
  wake: [number, number, number, number][] = [];
  tx: number;
  tz: number;
  tyaw: number;
  constructor(
    readonly id: number,
    readonly k: BoatK,
    public x: number,
    public z: number,
    public yaw: number,
    public hp: number,
    public fuel: number,
  ) {
    this.m = boatModel(k);
    this.tx = x;
    this.tz = z;
    this.tyaw = yaw;
  }
  get def() {
    return BOATS[this.k];
  }
  get maxHp() {
    return BOATS[this.k].hp;
  }
  /** banco do motorista (mundo) */
  seat(): [number, number, number] {
    const back = this.k === 0 ? -0.3 : this.k === 1 ? -0.9 : -1.1;
    return [this.x + Math.sin(this.yaw) * back, this.y + (this.k === 0 ? -0.05 : 0.05), this.z + Math.cos(this.yaw) * back];
  }
  /** motorista: física simples */
  drive(dt: number, thr: number, steer: number, wind: number, storm: number, blocked: (x: number, z: number) => boolean): { fuelUsed: boolean } {
    const D = this.def;
    let f = 1;
    if (D.wind) {
      const rel = Math.cos(angDiff(this.yaw, wind));
      f = 0.38 + 0.62 * Math.max(0, rel * 0.5 + 0.5);
    }
    let fuelUsed = false;
    if (D.fuel) {
      if (this.fuel > 0 && Math.abs(thr) > 0.05) {
        this.fuel = Math.max(0, this.fuel - dt * Math.abs(thr));
        fuelUsed = true;
      } else if (this.fuel <= 0) f = 0.28;
    }
    if (this.flip) thr = 0;
    const target = thr * D.speed * f * (thr < 0 ? 0.4 : 1) * (1 - storm * 0.25);
    this.v += (target - this.v) * Math.min(1, dt * (Math.abs(target) > Math.abs(this.v) ? 0.9 : 1.4));
    const turn = steer * (0.55 + Math.min(1, Math.abs(this.v) / 4) * 0.75) * (this.k === 0 ? 1.15 : 0.9);
    this.yaw -= turn * dt;
    const nx = this.x + Math.sin(this.yaw) * this.v * dt;
    const nz = this.z + Math.cos(this.yaw) * this.v * dt;
    if (blocked(nx, nz)) this.v *= -0.25;
    else {
      this.x = nx;
      this.z = nz;
    }
    this.tx = this.x;
    this.tz = this.z;
    this.tyaw = this.yaw;
    return { fuelUsed };
  }
  /** convidados: segue a pose recebida */
  follow(dt: number): void {
    const k = Math.min(1, dt * 8);
    this.x += (this.tx - this.x) * k;
    this.z += (this.tz - this.z) * k;
    this.yaw += angDiff(this.yaw, this.tyaw) * k;
  }
  view(dt: number, time: number, water: (x: number, z: number) => number, paddling: boolean): void {
    const fx = Math.sin(this.yaw) * 1.6;
    const fz = Math.cos(this.yaw) * 1.6;
    const wf = water(this.x + fx, this.z + fz);
    const wb = water(this.x - fx, this.z - fz);
    const wl = water(this.x + fz * 0.5, this.z - fx * 0.5);
    const wr = water(this.x - fz * 0.5, this.z + fx * 0.5);
    const wy = (wf + wb + wl + wr) / 4;
    const k = Math.min(1, dt * 6);
    this.y += (wy + (this.k === 0 ? 0.12 : 0.22) - this.y) * k;
    this.pitch += (Math.atan2(wb - wf, 3.2) - this.pitch - Math.min(0.12, Math.abs(this.v) * 0.012)) * k;
    this.roll += (Math.atan2(wl - wr, 1.6) * 0.8 - this.roll) * k;
    const r = this.m.root;
    r.position.set(this.x, this.y - (this.flip ? 0.35 : 0), this.z);
    r.rotation.set(this.pitch, this.yaw, this.roll + (this.flip ? Math.PI : 0), 'YXZ');
    if (this.m.sail) this.m.sail.scale.x = 1 + Math.sin(time * 2) * 0.05 + Math.min(0.5, Math.abs(this.v) * 0.05);
    if (this.m.prop) this.m.prop.rotation.z += dt * (this.fuel > 0 ? Math.abs(this.v) * 4 + 2 : 1) * (this.drv ? 1 : 0);
    if (this.m.paddle) {
      const s = paddling ? time * 3.4 : 0;
      this.m.paddle.rotation.set(Math.sin(s) * 0.7, 0, paddling ? 0.5 + Math.cos(s) * 0.25 : 0.2);
      this.m.paddle.position.x = Math.sin(s * 0.5) > 0 ? 0.55 : -0.55;
    }
    // esteira
    this.wakeT -= dt;
    if (this.wakeT <= 0) {
      this.wakeT = 0.35;
      const sp = Math.abs(this.v);
      if (sp > 0.6) this.wake.unshift([this.x - Math.sin(this.yaw) * 2.2, this.z - Math.cos(this.yaw) * 2.2, 1.6 + sp * 0.12, Math.min(1, sp / 6)]);
      for (const w of this.wake) {
        w[2] += 0.5;
        w[3] *= 0.8;
      }
      this.wake = this.wake.filter((w) => w[3] > 0.06).slice(0, 6);
    }
  }
  save(): BoatSave {
    return { id: this.id, k: this.k, x: Math.round(this.x * 10) / 10, z: Math.round(this.z * 10) / 10, yaw: Math.round(this.yaw * 100) / 100, hp: Math.round(this.hp), fuel: Math.round(this.fuel) };
  }
  dispose(): void {
    this.m.root.removeFromParent();
    this.m.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }
}
export const fuelSec = (n: number) => n * FUEL_SEC;
function angDiff(a: number, b: number): number {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}
