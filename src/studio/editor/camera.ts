/* ============================================================
 *  BLOOP STUDIO — câmera do construtor.
 *  'orbit': gira em volta de um alvo (1 dedo gira, 2 dedos aproxima/arrasta);
 *  'fly':   1ª pessoa voando (joystick anda, arrastar olha, botões sobe/desce).
 * ============================================================ */
import * as THREE from 'three';

export type CamMode = 'orbit' | 'fly';

export class MakerCam {
  mode: CamMode = 'orbit';
  target = new THREE.Vector3(0, 0.5, 0);
  yaw = 0.7;
  pitch = 0.5;
  dist = 9;
  pos = new THREE.Vector3(0, 3, 9);
  /** chão mínimo da câmera (altura do terreno embaixo) */
  floor: (x: number, z: number) => number = () => -Infinity;

  constructor(readonly cam: THREE.PerspectiveCamera) {}

  orbit(dx: number, dy: number): void {
    this.yaw -= dx * 0.008;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.006, -0.35, 1.45);
  }
  look(dx: number, dy: number): void {
    this.yaw -= dx * 0.005;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.005, -1.4, 1.4);
  }
  zoom(f: number): void {
    if (this.mode === 'orbit') this.dist = THREE.MathUtils.clamp(this.dist * f, 1.2, 160);
    else this.pos.addScaledVector(this.forward(), (1 - f) * 12);
  }
  /** arrastar com 2 dedos: move o alvo no plano da tela */
  pan(dx: number, dy: number): void {
    const k = (this.mode === 'orbit' ? this.dist : 8) * 0.0022;
    const right = new THREE.Vector3().setFromMatrixColumn(this.cam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.cam.matrixWorld, 1);
    const d = right.multiplyScalar(-dx * k).add(up.multiplyScalar(dy * k));
    if (this.mode === 'orbit') this.target.add(d);
    else this.pos.add(d);
  }
  forward(): THREE.Vector3 {
    return new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), -Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }
  /** voo: [direita, frente] do joystick + vertical (-1..1) */
  fly(dt: number, jx: number, jy: number, vy: number): void {
    const sp = 7 * dt;
    const f = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const r = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.pos.addScaledVector(f, jy * sp).addScaledVector(r, jx * sp);
    this.pos.y += vy * sp;
  }
  setMode(m: CamMode): void {
    if (m === this.mode) return;
    if (m === 'fly') {
      this.pos.copy(this.cam.position);
      // em 1ª pessoa o "pitch" é para onde olha (positivo = para baixo), igual ao orbit
    } else {
      this.target.copy(this.pos).addScaledVector(this.forward(), Math.min(this.dist, 10));
      this.dist = this.pos.distanceTo(this.target);
    }
    this.mode = m;
  }
  /** enquadra uma caixa */
  frame(box: THREE.Box3): void {
    if (box.isEmpty()) return;
    box.getCenter(this.target);
    const r = box.getSize(new THREE.Vector3()).length() / 2;
    this.dist = THREE.MathUtils.clamp(r * 2.6 + 2, 3, 120);
    if (this.mode === 'fly') {
      this.pos.copy(this.target).addScaledVector(this.forward(), -this.dist);
    }
  }
  update(): void {
    const c = this.cam;
    if (this.mode === 'orbit') {
      const cp = Math.cos(this.pitch);
      c.position.set(this.target.x + Math.sin(this.yaw) * cp * this.dist, this.target.y + Math.sin(this.pitch) * this.dist, this.target.z + Math.cos(this.yaw) * cp * this.dist);
      const fl = this.floor(c.position.x, c.position.z) + 0.4;
      if (c.position.y < fl) c.position.y = fl;
      c.lookAt(this.target);
    } else {
      const fl = this.floor(this.pos.x, this.pos.z) + 0.6;
      if (this.pos.y < fl) this.pos.y = fl;
      c.position.copy(this.pos);
      c.lookAt(this.pos.clone().add(this.forward()));
    }
  }
}
