/**
 * Entrada pronta para 1ª pessoa: joystick flutuante (andar) + arrastar para olhar + WASD/setas.
 * Mesma "cara" do antigo FpsInput da Casa 3D (dir / consumeLook / key / show / dispose), então
 * adotar é trocar a classe — veja docs/CONTROLES.md.
 */
import { Joystick, type JoystickOptions } from './joystick';
import { LookDrag, type LookOptions } from './look';

export interface FpsControlsOptions {
  joystick?: JoystickOptions;
  look?: LookOptions;
  /** teclado (WASD/setas). Padrão true */
  keyboard?: boolean;
}

export class FpsControls {
  readonly joy: Joystick;
  readonly look: LookDrag;
  private keys = new Set<string>();
  private on = true;
  constructor(
    readonly layer: HTMLElement,
    o: FpsControlsOptions = {},
  ) {
    this.joy = new Joystick(layer, { zoneWidth: 0.45, zoneTop: 0.3, ...o.joystick });
    this.look = new LookDrag(layer, o.look);
    if (o.keyboard !== false) {
      window.addEventListener('keydown', this.kd);
      window.addEventListener('keyup', this.ku);
      window.addEventListener('blur', this.clearKeys);
    }
  }
  private kd = (e: KeyboardEvent) => void this.keys.add(e.code);
  private ku = (e: KeyboardEvent) => void this.keys.delete(e.code);
  private clearKeys = () => this.keys.clear();
  get enabled(): boolean {
    return this.on;
  }
  set enabled(v: boolean) {
    this.show(v);
  }
  key(code: string): boolean {
    return this.keys.has(code);
  }
  /** [direita, FRENTE] em -1..1 (joystick suavizado ou WASD), módulo ≤ 1 */
  dir(): [number, number] {
    const s = this.joy.read();
    let x = s.x,
      y = -s.y;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) y = 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y = -1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x = -1;
    if (k.has('KeyD') || k.has('ArrowRight')) x = 1;
    const l = Math.hypot(x, y);
    if (l > 1) (x /= l), (y /= l);
    return [x, y];
  }
  /** [dYaw, dPitch] em radianos desde a última chamada (já suavizado, com sensibilidade e inverter-Y) */
  consumeLook(dt?: number): [number, number] {
    return this.look.consume(dt);
  }
  show(on: boolean): void {
    this.on = on;
    this.joy.setEnabled(on);
    this.look.setEnabled(on);
    if (!on) this.keys.clear();
  }
  dispose(): void {
    this.joy.destroy();
    this.look.destroy();
    window.removeEventListener('keydown', this.kd);
    window.removeEventListener('keyup', this.ku);
    window.removeEventListener('blur', this.clearKeys);
  }
}
