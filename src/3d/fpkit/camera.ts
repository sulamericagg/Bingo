/* ============================================================
 *  FPKIT — FpCamera: olhar (yaw/pitch com limite), balanço de passo (vertical 2× a fase + rolagem),
 *  tremor, tranco (recoil), altura do olho (com suavização opcional em degraus) e camClamp:
 *  o olho nunca entra no móvel/parede (mesmo colisor do corpo).
 *  Fórmulas idênticas à câmera da Cozinha Maluca.
 * ============================================================ */
import type * as THREE from 'three';
import type { FpCollider } from './collide';
import { fpTuning, type FpTuning } from './tuning';

/** o que a câmera precisa do corpo (FpController serve direto) */
export interface FpBodyView {
  x: number;
  z: number;
  /** pés (0 em mundo plano) */
  y?: number;
  speedK: number;
  grounded?: boolean;
}

const OUT: [number, number] = [0, 0];

export class FpCamera {
  yaw = 0;
  pitch = 0;
  /** fase do balanço de passo (rad) */
  bob = 0;
  /** tremor 0..1 (decai sozinho) */
  shake = 0;
  /** tranco 0..1 (decai sozinho) */
  recoil = 0;
  /** extras do jogo somados no quadro (barco balançando, escorregão, flutuar no espaço...) */
  extraRoll = 0;
  extraPitch = 0;
  extraYaw = 0;
  extraY = 0;
  /** último giro aplicado (para mão/arma atrasarem e para a mira saber se está parada) */
  lookDX = 0;
  lookDY = 0;
  /** desligue para cutscenes/menus (não aplica balanço nem tremor) */
  fx = true;
  tune: FpTuning;
  private eyeY = NaN;
  constructor(tune: FpTuning | Readonly<FpTuning> = fpTuning()) {
    this.tune = { ...tune };
  }
  /** giro do quadro em rad (FpsControls.consumeLook): direita/baixo positivos */
  look(dx: number, dy: number): void {
    this.yaw -= dx;
    this.pitch = Math.max(this.tune.pitchMin, Math.min(this.tune.pitchMax, this.pitch - dy));
    this.lookDX = dx;
    this.lookDY = dy;
  }
  /** olha para um ponto a partir dos olhos em (x, eyeY, z) */
  lookAt(fromX: number, fromY: number, fromZ: number, x: number, y: number, z: number): void {
    const dx = x - fromX;
    const dz = z - fromZ;
    this.yaw = Math.atan2(-dx, -dz);
    this.pitch = Math.atan2(y - fromY, Math.hypot(dx, dz));
  }
  addShake(v: number): void {
    this.shake = Math.max(this.shake, v);
  }
  kick(v = 1): void {
    this.recoil = v;
  }
  reset(): void {
    this.bob = this.shake = this.recoil = 0;
    this.lookDX = this.lookDY = 0;
    this.eyeY = NaN;
  }
  /** frente horizontal (para o corpo andar para onde olha) */
  forward(out: { x: number; z: number }): { x: number; z: number } {
    out.x = -Math.sin(this.yaw);
    out.z = -Math.cos(this.yaw);
    return out;
  }
  /** posiciona/gira a câmera para o corpo neste quadro */
  apply(cam: THREE.Camera, dt: number, b: FpBodyView, collider?: FpCollider | null): void {
    const t = this.tune;
    const sk = this.fx ? b.speedK : 0;
    this.bob += dt * t.bobRate * sk;
    const bobY = Math.sin(this.bob * 2) * t.bobAmp * sk;
    let roll = Math.cos(this.bob) * t.rollAmp * sk;
    roll += this.extraRoll;
    let sx = 0;
    let sy = 0;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * t.shakeDecay);
      if (this.fx) {
        sx = (Math.random() - 0.5) * this.shake * t.shakeAmp;
        sy = (Math.random() - 0.5) * this.shake * t.shakeAmp;
      }
    }
    this.recoil = Math.max(0, this.recoil - dt * t.recoilDecay);
    sy -= Math.sin(this.recoil * Math.PI) * t.recoilAmp;
    cam.rotation.order = 'YXZ';
    cam.rotation.set(this.pitch + sy * 0.5 + this.extraPitch, this.yaw + sx * 0.5 + this.extraYaw, roll);
    // olho: pés (+ suavização em degraus) + altura
    const feet = b.y ?? 0;
    if (t.eyeSmooth > 0 && b.grounded !== false && this.eyeY === this.eyeY) this.eyeY += (feet - this.eyeY) * Math.min(1, dt * t.eyeSmooth);
    else this.eyeY = feet;
    let cx = b.x + sx;
    let cz = b.z;
    if (collider?.clampPoint) {
      collider.clampPoint(cx, cz, t.camMargin, b.x, b.z, OUT);
      cx = OUT[0];
      cz = OUT[1];
    }
    cam.position.set(cx, this.eyeY + t.eye + bobY + sy + this.extraY, cz);
    cam.updateMatrixWorld();
  }
}
