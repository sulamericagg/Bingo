/* ============================================================
 *  VEÍCULOS DO MUNDO — gerente: cria/remove, limites por nível de
 *  qualidade, estacionamento (física dormindo), entrar/sair, salvar.
 * ============================================================ */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Vehicle, type VehicleHost, type VehicleState } from './vehicle';
import { analyze, decodeDesign, encodeDesign, type VehicleDesign } from './design';

export type VTier = 0 | 1 | 2 | 3;
/** limites por nível de qualidade (0 = celular fraco) */
export const VEH_CAPS: Record<VTier, { max: number; awake: number; view: number; sim: number }> = {
  0: { max: 6, awake: 2, view: 60, sim: 45 },
  1: { max: 10, awake: 3, view: 90, sim: 60 },
  2: { max: 16, awake: 5, view: 130, sim: 80 },
  3: { max: 24, awake: 8, view: 180, sim: 110 },
};

export interface SavedVehicles {
  v: 1;
  list: (Omit<VehicleState, 'design'> & { d: string })[];
}

export class VehicleManager {
  readonly list: Vehicle[] = [];
  driving: Vehicle | null = null;
  tier: VTier;
  /** ponto de referência (jogador/câmera) para limites */
  readonly focus = new THREE.Vector3();
  private host: VehicleHost;
  private scene: THREE.Object3D;
  private lampLight: THREE.SpotLight | null = null;
  /** rede: avisos de criar/remover (o motor online usa) */
  onSpawn: ((v: Vehicle) => void) | null = null;
  onRemove: ((v: Vehicle) => void) | null = null;

  constructor(host: VehicleHost, scene: THREE.Object3D, tier: VTier = 2) {
    this.host = host;
    this.scene = scene;
    this.tier = tier;
  }
  get caps() {
    return VEH_CAPS[this.tier];
  }

  /** cria um veículo apoiado no chão em (x, z). null = limite atingido ou projeto inválido */
  spawn(d: VehicleDesign, x: number, z: number, yaw = 0, state?: Partial<VehicleState>, y?: number): Vehicle | null {
    if (this.list.length >= this.caps.max) return null;
    const a = analyze(d);
    if (!a.ok) return null;
    const gy = y ?? (this.host.heightAt?.(x, z) ?? 0) + Vehicle.spawnHeight(d);
    const v = new Vehicle(this.host, d, { x: state?.x ?? x, y: state?.y ?? gy, z: state?.z ?? z }, yaw, state);
    this.list.push(v);
    this.scene.add(v.model.root);
    this.onSpawn?.(v);
    return v;
  }
  remove(v: Vehicle): void {
    const i = this.list.indexOf(v);
    if (i < 0) return;
    if (this.driving === v) this.exit();
    this.onRemove?.(v);
    for (const o of this.list) if (o.hitch?.other === v) o.unhitch();
    v.dispose();
    this.list.splice(i, 1);
  }
  clear(): void {
    for (const v of [...this.list]) this.remove(v);
  }

  /** veículo dirigível mais perto (com banco) */
  nearest(x: number, y: number, z: number, r = 3.5): Vehicle | null {
    let best: Vehicle | null = null;
    let bd = r * r;
    const p = new CANNON.Vec3(x, y, z);
    for (const v of this.list) {
      if (!v.lay.seat || v.netBusy) continue;
      const d = v.seatWorld().distanceSquared(p);
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    return best;
  }
  /** reboque livre perto do engate traseiro de v */
  trailerNear(v: Vehicle): Vehicle | null {
    if (!v.lay.hitchBack || v.hitch) return null;
    for (const o of this.list) if (o !== v && o.lay.hitchFront && !o.towedBy && o.body.position.distanceTo(v.body.position) < v.lay.hl + o.lay.hl + 3) return o;
    return null;
  }
  enter(v: Vehicle): void {
    if (this.driving) this.exit();
    this.driving = v;
    v.driver = true;
    v.unpark();
    this.host.sound?.('start', v);
  }
  /** sai do veículo; devolve onde pôr o jogador */
  exit(): { x: number; y: number; z: number } | null {
    const v = this.driving;
    if (!v) return null;
    v.driver = false;
    v.toolOn = false;
    v.craneMode = false;
    v.input.steer = v.input.throttle = v.input.up = 0;
    this.driving = null;
    this.host.sound?.('stop', v);
    const p = v.exitPoint();
    const gy = this.host.heightAt?.(p.x, p.z);
    return { x: p.x, y: gy !== undefined ? Math.max(gy, p.y - 1) : p.y, z: p.z };
  }

  /** antes de world.step */
  preStep(dt: number): void {
    const c = this.caps;
    const f = this.focus;
    // quem está acordado e longe dorme primeiro
    const awake = this.list.filter((v) => !v.parked && v !== this.driving && !v.towedBy && !v.remote);
    if (awake.length > c.awake - (this.driving ? 1 : 0)) {
      awake.sort((a, b) => dist2(b, f) - dist2(a, f));
      const extra = awake.length - Math.max(0, c.awake - (this.driving ? 1 : 0));
      for (let i = 0; i < extra; i++) if (!awake[i].grabbed && !awake[i].hitch) awake[i].park();
    }
    for (const v of this.list) {
      if (v !== this.driving && !v.parked && !v.remote && dist2(v, f) > c.sim * c.sim && !v.towedBy) v.park();
      v.preStep(dt);
    }
  }
  /** depois de world.step */
  postStep(dt: number): void {
    const c = this.caps;
    const f = this.focus;
    for (const v of this.list) {
      const vis = dist2(v, f) < c.view * c.view;
      v.model.root.visible = vis;
      if (vis && (!v.parked || v === this.driving || v.remote)) v.syncModel(dt);
    }
    this.updateLamp();
  }
  /** um único holofote, no veículo dirigido com faróis ligados */
  private updateLamp(): void {
    const v = this.driving;
    const on = !!v && v.lights && v.model.lamps.length > 0;
    if (!on) {
      if (this.lampLight) this.lampLight.visible = false;
      return;
    }
    if (!this.lampLight) {
      const l = new THREE.SpotLight(0xfff0c0, 40, 40, 0.55, 0.5, 1.2);
      l.castShadow = false;
      this.scene.add(l, l.target);
      this.lampLight = l;
    }
    const l = this.lampLight;
    l.visible = true;
    const m = v!.model;
    const p = m.lamps[0];
    const fp = new THREE.Vector3(0, p.y, p.z).applyMatrix4(m.root.matrixWorld);
    l.position.copy(fp);
    l.target.position.copy(new THREE.Vector3(0, p.y - 1.5, p.z - 10).applyMatrix4(m.root.matrixWorld));
    l.target.updateMatrixWorld();
  }

  save(): SavedVehicles {
    return { v: 1, list: this.list.map((v) => ({ ...v.save(), design: undefined, d: encodeDesign(v.design) })) as SavedVehicles['list'] };
  }
  load(s: SavedVehicles | null | undefined): void {
    if (!s || s.v !== 1 || !Array.isArray(s.list)) return;
    for (const e of s.list) {
      const d = decodeDesign(e.d);
      if (!d) continue;
      this.spawn(d, e.x, e.z, 0, e);
    }
  }
  dispose(): void {
    this.clear();
    this.lampLight?.removeFromParent();
    this.lampLight?.target.removeFromParent();
    this.lampLight?.dispose();
  }
}
const dist2 = (v: Vehicle, f: THREE.Vector3) => {
  const p = v.body.position;
  return (p.x - f.x) ** 2 + (p.z - f.z) ** 2;
};
