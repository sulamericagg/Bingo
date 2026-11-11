/* ============================================================
 *  FPKIT — FpAim: raio do centro da tela + "pula quando parado".
 *  Com a câmera parada (sem giro e speedK < 0.05) o pick caro só roda a cada (skipFrames+1) quadros.
 *  Combine com AimPicker (3d/common/interact/aim) ou com um Raycaster seu.
 * ============================================================ */
import * as THREE from 'three';

export class FpAim {
  /** quadros pulados com a câmera parada (2 → refaz a cada 3) */
  skipFrames = 2;
  private skip = 0;
  constructor(readonly ray: THREE.Ray = new THREE.Ray()) {}
  /**
   * Atualiza o raio a partir da câmera (sempre) e diz se o pick deve rodar neste quadro.
   * lookDX/lookDY: giro do quadro; speedK: 0..1 do corpo.
   */
  update(cam: THREE.Camera, lookDX: number, lookDY: number, speedK: number): boolean {
    this.ray.origin.copy(cam.position);
    cam.getWorldDirection(this.ray.direction);
    const still = Math.abs(lookDX) + Math.abs(lookDY) < 1e-4 && speedK < 0.05;
    if (still && this.skip-- > 0) return false;
    this.skip = this.skipFrames;
    return true;
  }
  /** força o próximo update() a refazer o pick (alvo novo apareceu, item pego...) */
  invalidate(): void {
    this.skip = 0;
  }
}
