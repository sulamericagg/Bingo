/**
 * Arrastar para olhar (1ª pessoa). Baseado em DELTA do dedo (não em posição), com:
 *  - acumulação por quadro + suavização sub-quadro (entrega irregular de eventos não vira tremida);
 *  - curva de aceleração (movimento lento = preciso, rápido = gira mais);
 *  - pequena inércia ao soltar; ignora o primeiro "pulo" do toque;
 *  - sensibilidade / inverter Y das preferências; giroscópio opcional;
 *  - multitoque seguro (convive com joystick e botões; um dedo por controle).
 */
import { ensureTouchCss } from './css';
import { Gyro } from './gyro';
import { controls, onControlsChange, SENS_MUL } from './settings';
import { surfaceOf, type TouchClaimer } from './surface';

export interface LookOptions {
  /** radianos por px CSS na sensibilidade "Média". Padrão 0.0055 */
  baseSens?: number;
  /** zona personalizada; padrão: qualquer lugar não pego por outro controle */
  zone?: (x: number, y: number, rect: DOMRect) => boolean;
  /** aceita mouse (arrastar com botão). Padrão true */
  mouse?: boolean;
  /** constante de suavização (s). Padrão 0.016 */
  smoothTau?: number;
  /** ganho extra máximo em movimentos rápidos (0 = sem aceleração). Padrão 0.6 */
  accel?: number;
  /** inércia ao soltar (s). 0 desliga. Padrão 0.09 */
  inertia?: number;
  /** usa giroscópio quando a preferência estiver ligada. Padrão true */
  gyro?: boolean;
  priority?: number;
}

export class LookDrag implements TouchClaimer {
  readonly priority: number;
  private o: Required<Omit<LookOptions, 'zone'>> & { zone?: LookOptions['zone'] };
  private pid = -1;
  private lx = 0;
  private ly = 0;
  private first = true;
  /** deltas ainda não entregues (px, já com curva) */
  private px = 0;
  private py = 0;
  /** velocidade filtrada (px/s) para a inércia */
  private vx = 0;
  private vy = 0;
  private lastMoveT = 0;
  /** inércia ativa (px/s) */
  private ix = 0;
  private iy = 0;
  private enabled = true;
  private lastConsume = 0;
  private gyro: Gyro | null = null;
  private unsub: () => void;
  constructor(
    readonly surface: HTMLElement,
    opts: LookOptions = {},
  ) {
    ensureTouchCss();
    this.o = { baseSens: 0.0055, mouse: true, smoothTau: 0.016, accel: 0.6, inertia: 0.09, gyro: true, priority: 0, ...opts };
    this.priority = this.o.priority;
    surfaceOf(surface).add(this);
    this.syncGyro();
    this.unsub = onControlsChange(() => this.syncGyro());
  }
  private syncGyro(): void {
    const want = this.o.gyro && controls.gyro && this.enabled;
    if (want && !this.gyro) this.gyro = new Gyro();
    else if (!want && this.gyro) {
      this.gyro.destroy();
      this.gyro = null;
    }
  }
  wants(e: PointerEvent, x: number, y: number, rect: DOMRect): boolean {
    if (!this.enabled || this.pid >= 0) return false;
    if (e.pointerType === 'mouse' && !this.o.mouse) return false;
    return this.o.zone ? this.o.zone(x, y, rect) : true;
  }
  down(e: PointerEvent, x: number, y: number): void {
    this.pid = e.pointerId;
    this.lx = x;
    this.ly = y;
    this.first = true;
    this.ix = this.iy = 0;
    this.vx = this.vy = 0;
    this.lastMoveT = e.timeStamp;
  }
  move(e: PointerEvent, x: number, y: number): void {
    if (e.pointerId !== this.pid) return;
    // eventos agrupados dão o caminho completo do dedo entre quadros
    const list = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    const pts = list.length ? list.map((c) => ({ x: x + (c.clientX - e.clientX), y: y + (c.clientY - e.clientY), t: c.timeStamp })) : [{ x, y, t: e.timeStamp }];
    for (const p of pts) {
      const dx = p.x - this.lx,
        dy = p.y - this.ly;
      this.lx = p.x;
      this.ly = p.y;
      if (this.first) {
        // 1º movimento costuma trazer o "touch slop" acumulado: descarta
        this.first = false;
        this.lastMoveT = p.t;
        continue;
      }
      const dtm = Math.max(0.004, (p.t - this.lastMoveT) / 1000);
      this.lastMoveT = p.t;
      const sp = Math.hypot(dx, dy) / dtm; // px/s
      // aceleração: até +accel a partir de ~300 px/s, cheio em ~1500 px/s
      const g = 1 + this.o.accel * Math.min(1, Math.max(0, (sp - 300) / 1200));
      this.px += dx * g;
      this.py += dy * g;
      const a = 1 - Math.exp(-dtm / 0.05);
      this.vx += ((dx * g) / dtm - this.vx) * a;
      this.vy += ((dy * g) / dtm - this.vy) * a;
    }
  }
  up(e: PointerEvent | null): void {
    if (this.pid < 0) return;
    this.pid = -1;
    // inércia só se o dedo ainda se movia ao soltar (e não foi cancelamento/fundo)
    const idle = e ? (e.timeStamp - this.lastMoveT) / 1000 : 1;
    if (e && e.type === 'pointerup' && this.o.inertia > 0 && idle < 0.05 && Math.hypot(this.vx, this.vy) > 250) {
      this.ix = this.vx;
      this.iy = this.vy;
    }
    this.vx = this.vy = 0;
  }
  /**
   * Chame uma vez por quadro (sem `dt`, mede sozinho): devolve [dYaw, dPitch] em radianos (dYaw + = girar para a direita,
   * dPitch + = olhar para BAIXO, já com inverter-Y aplicado).
   */
  consume(dt?: number): [number, number] {
    const now = performance.now();
    if (dt == null) dt = this.lastConsume ? (now - this.lastConsume) / 1000 : 1 / 60;
    this.lastConsume = now;
    dt = Math.min(0.1, Math.max(0, dt || 0));
    // inércia decai exponencialmente
    if (this.ix || this.iy) {
      this.px += this.ix * dt;
      this.py += this.iy * dt;
      const k = Math.exp(-dt / Math.max(0.001, this.o.inertia));
      this.ix *= k;
      this.iy *= k;
      if (Math.hypot(this.ix, this.iy) < 20) this.ix = this.iy = 0;
    }
    // entrega uma fração do acumulado (sub-quadro): total conservado, sem degraus
    const f = this.o.smoothTau > 0 ? 1 - Math.exp(-dt / this.o.smoothTau) : 1;
    const ox = this.px * f,
      oy = this.py * f;
    this.px -= ox;
    this.py -= oy;
    if (Math.abs(this.px) < 0.01) this.px = 0;
    if (Math.abs(this.py) < 0.01) this.py = 0;
    const s = this.o.baseSens * SENS_MUL[controls.sens];
    let yaw = ox * s,
      pitch = oy * s * (controls.invertY ? -1 : 1);
    if (this.gyro) {
      const [gy, gp] = this.gyro.consume(dt);
      yaw += gy;
      pitch += gp * (controls.invertY ? -1 : 1);
    }
    return [yaw, pitch];
  }
  get active(): boolean {
    return this.pid >= 0;
  }
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.reset();
    this.syncGyro();
  }
  reset(): void {
    this.pid = -1;
    this.px = this.py = this.ix = this.iy = this.vx = this.vy = 0;
  }
  destroy(): void {
    surfaceOf(this.surface).remove(this);
    this.unsub();
    this.gyro?.destroy();
  }
}

export function createLook(surface: HTMLElement, opts?: LookOptions): LookDrag {
  return new LookDrag(surface, opts);
}
