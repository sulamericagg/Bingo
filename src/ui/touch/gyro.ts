/**
 * Mira por giroscópio (opcional, desligada por padrão). Usa a velocidade de rotação (devicemotion),
 * corrigida pela orientação da tela, com filtro passa-baixa e zona morta para não "tremer".
 */
export class Gyro {
  private ry = 0; // rad/s filtrados
  private rp = 0;
  private acc = [0, 0];
  constructor(private gain = 1) {
    window.addEventListener('devicemotion', this.onMotion);
  }
  private onMotion = (e: DeviceMotionEvent) => {
    const r = e.rotationRate;
    if (!r) return;
    const D = Math.PI / 180;
    // rotationRate: alpha = eixo z, beta = eixo x, gamma = eixo y (graus/s)
    const bx = (r.beta ?? 0) * D,
      gy = (r.gamma ?? 0) * D;
    const ang = (screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0) as number;
    let yaw: number, pitch: number;
    if (ang === 90) (yaw = -bx), (pitch = -gy);
    else if (ang === 270 || ang === -90) (yaw = bx), (pitch = gy);
    else (yaw = -gy), (pitch = -bx);
    const dz = 0.03; // rad/s — ignora tremor da mão
    const f = (v: number) => (Math.abs(v) < dz ? 0 : v - Math.sign(v) * dz);
    this.ry += (f(yaw) - this.ry) * 0.35;
    this.rp += (f(pitch) - this.rp) * 0.35;
  };
  consume(dt: number): [number, number] {
    this.acc[0] = this.ry * dt * this.gain;
    this.acc[1] = this.rp * dt * this.gain;
    return [this.acc[0], this.acc[1]];
  }
  destroy(): void {
    window.removeEventListener('devicemotion', this.onMotion);
  }
}
