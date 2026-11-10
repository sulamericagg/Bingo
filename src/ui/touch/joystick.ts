/**
 * Joystick flutuante: aparece onde o polegar toca dentro da zona (esquerda por padrão; troca de lado
 * no modo canhoto). Zona morta radial, curva expo para controle fino, saída suavizada por mola
 * criticamente amortecida, raio que acompanha o tamanho físico da tela, volta ao centro suave.
 */
import { tap } from '../../core/haptics';
import { ensureTouchCss } from './css';
import { controls, JOY_MUL, onControlsChange } from './settings';
import { Spring2 } from './spring';
import { surfaceOf, type TouchClaimer } from './surface';

export interface JoystickOptions {
  /** lado "natural" do joystick; o modo canhoto inverte. Padrão 'left'. */
  side?: 'left' | 'right';
  /** fração da largura ocupada pela zona (0..1). Padrão 0.5 */
  zoneWidth?: number;
  /** fração superior da altura que NÃO conta como zona (topo do HUD). Padrão 0.25 */
  zoneTop?: number;
  /** zona personalizada (substitui side/zoneWidth/zoneTop) — coordenadas relativas à superfície */
  zone?: (x: number, y: number, rect: DOMRect) => boolean;
  /** zona morta (fração do raio). Padrão 0.1 */
  deadZone?: number;
  /** curva expo 0 (linear) … 1 (cúbica). Padrão 0.35 */
  expo?: number;
  /** ω da mola de saída (rad/s). Padrão 30 (≈0,13 s) */
  smoothing?: number;
  /** mostra um anel apagado na posição de descanso quando ninguém toca. Padrão true */
  hint?: boolean;
  /** também aceita mouse (desktop). Padrão false */
  mouse?: boolean;
  /** prioridade no roteador (joystick > olhar). Padrão 10 */
  priority?: number;
  /** vibração leve ao começar. Padrão true */
  haptic?: boolean;
}

export interface JoyState {
  /** -1..1, direita + */
  x: number;
  /** -1..1, para BAIXO + (tela). Use -y para "frente". */
  y: number;
  /** 0..1 */
  mag: number;
  /** dedo encostado */
  active: boolean;
}

/** raio máx. em px CSS: ~11 mm físicos, ajustado pelo tamanho da tela e pela preferência */
export function joyRadius(): number {
  const short = Math.min(window.innerWidth, window.innerHeight);
  // px CSS por mm ≈ 96/25.4 em telas de celular Android (densidade normalizada pelo WebView)
  const mm = 96 / 25.4;
  const base = Math.max(46, Math.min(84, Math.max(11 * mm, short * 0.12)));
  return base * JOY_MUL[controls.joySize];
}

export class Joystick implements TouchClaimer {
  readonly priority: number;
  readonly el: HTMLDivElement;
  private ring: HTMLDivElement;
  private knob: HTMLDivElement;
  private o: Required<Omit<JoystickOptions, 'zone'>> & { zone?: JoystickOptions['zone'] };
  private pid = -1;
  private ox = 0;
  private oy = 0;
  /** alvo cru já com zona morta/curva */
  private tx = 0;
  private ty = 0;
  /** posição visual do knob (px) */
  private kx = 0;
  private ky = 0;
  private out: Spring2;
  private vis = new Spring2(36);
  private last = 0;
  private raf = 0;
  private R = 60;
  private enabled = true;
  private unsub: () => void;
  constructor(
    readonly surface: HTMLElement,
    opts: JoystickOptions = {},
  ) {
    ensureTouchCss();
    this.o = { side: 'left', zoneWidth: 0.5, zoneTop: 0.25, deadZone: 0.1, expo: 0.35, smoothing: 30, hint: true, mouse: false, priority: 10, haptic: true, ...opts };
    this.priority = this.o.priority;
    this.out = new Spring2(this.o.smoothing);
    if (getComputedStyle(surface).position === 'static') surface.style.position = 'relative';
    this.el = document.createElement('div');
    this.el.className = 'tc-joy';
    this.el.innerHTML = '<div class="tc-ring"></div><div class="tc-knob"></div>';
    this.ring = this.el.firstElementChild as HTMLDivElement;
    this.knob = this.el.lastElementChild as HTMLDivElement;
    surface.appendChild(this.el);
    surfaceOf(surface).add(this);
    this.layout();
    this.unsub = onControlsChange(() => this.layout());
    window.addEventListener('resize', this.layout);
  }
  /** lado efetivo (considera canhoto) */
  get side(): 'left' | 'right' {
    return controls.lefty ? (this.o.side === 'left' ? 'right' : 'left') : this.o.side;
  }
  private layout = () => {
    this.R = joyRadius();
    const R = this.R,
      k = R * 0.46;
    Object.assign(this.ring.style, { width: R * 2 + 'px', height: R * 2 + 'px', left: -R + 'px', top: -R + 'px' });
    Object.assign(this.knob.style, { width: k * 2 + 'px', height: k * 2 + 'px', left: -k + 'px', top: -k + 'px' });
    if (this.pid < 0) this.placeHome();
  };
  private homeX = 0;
  private homeY = 0;
  /** posição de descanso (Ajustes → Controles → Posição), sempre bem dentro da tela */
  private calcHome(): void {
    const r = this.surface.getBoundingClientRect();
    const R = this.R,
      p = controls.joyPos;
    const fx = Math.max(R + 18, Math.min(r.width / 2 - R * 0.5, p.x * r.width));
    this.homeX = this.side === 'left' ? fx : r.width - fx;
    this.homeY = Math.max(r.height * 0.3 + R, Math.min(r.height - R - 18, p.y * r.height));
  }
  private placeHome(): void {
    this.calcHome();
    this.el.style.transform = `translate(${this.homeX}px,${this.homeY}px)`;
    this.el.classList.toggle('idle', (this.o.hint || controls.joyMode === 'fixed') && this.enabled);
  }
  wants(e: PointerEvent, x: number, y: number, rect: DOMRect): boolean {
    if (!this.enabled || this.pid >= 0) return false;
    if (e.pointerType === 'mouse' && !this.o.mouse) return false;
    if (this.o.zone) return this.o.zone(x, y, rect);
    if (y < rect.height * this.o.zoneTop) return false;
    const w = rect.width * this.o.zoneWidth;
    return this.side === 'left' ? x < w : x > rect.width - w;
  }
  down(e: PointerEvent, x: number, y: number): void {
    this.pid = e.pointerId;
    this.ox = x;
    this.oy = y;
    // Fixo: usa a base parada se o polegar caiu nela; caiu longe → base vem até o dedo
    // (nunca começa "puxando" para o lado errado).
    let fixed = false;
    if (controls.joyMode === 'fixed') {
      this.calcHome();
      if (Math.hypot(x - this.homeX, y - this.homeY) < this.R * 1.1) {
        this.ox = this.homeX;
        this.oy = this.homeY;
        fixed = true;
      }
    }
    this.tx = this.ty = 0;
    this.vis.reset();
    this.kx = this.ky = 0;
    this.el.style.transform = `translate(${this.ox}px,${this.oy}px)`;
    this.el.classList.add('on');
    this.el.classList.remove('idle');
    this.last = performance.now();
    if (this.o.haptic) tap('light');
    if (fixed) this.move(e, x, y);
    this.loop();
  }
  move(e: PointerEvent, x: number, y: number): void {
    if (e.pointerId !== this.pid) return;
    this.read(); // avança a mola até agora antes de trocar o alvo
    let dx = x - this.ox,
      dy = y - this.oy;
    const d = Math.hypot(dx, dy),
      R = this.R;
    // arrastou muito além do anel: o anel acompanha o dedo (não "trava" na borda)
    if (d > R * 1.5) {
      const f = (d - R * 1.5) / d;
      this.ox += dx * f;
      this.oy += dy * f;
      dx = x - this.ox;
      dy = y - this.oy;
      this.el.style.transform = `translate(${this.ox}px,${this.oy}px)`;
    }
    const dd = Math.hypot(dx, dy);
    const cl = dd > R ? R / dd : 1;
    this.kx = dx * cl;
    this.ky = dy * cl;
    // radial: zona morta e curva sobre a magnitude, direção preservada
    const n = Math.min(1, dd / R);
    const dz = this.o.deadZone;
    let m = n <= dz ? 0 : (n - dz) / (1 - dz);
    m = (1 - this.o.expo) * m + this.o.expo * m * m * m;
    this.tx = dd > 0 ? (dx / dd) * m : 0;
    this.ty = dd > 0 ? (dy / dd) * m : 0;
  }
  up(): void {
    this.read();
    this.pid = -1;
    this.tx = this.ty = 0;
    this.kx = this.ky = 0;
    this.el.classList.remove('on');
    this.loop();
  }
  private loop = () => {
    cancelAnimationFrame(this.raf);
    const tick = (ts: number) => {
      const dt = Math.min(0.05, (ts - (this.lastVis || ts)) / 1000);
      this.lastVis = ts;
      if (this.pid >= 0) this.vis.reset(this.kx, this.ky);
      else this.vis.step(0, 0, dt || 1 / 60);
      this.knob.style.transform = `translate(${this.vis.x.toFixed(1)}px,${this.vis.y.toFixed(1)}px)`;
      this.read();
      const settled = this.pid < 0 && Math.abs(this.vis.x) + Math.abs(this.vis.y) < 0.3 && Math.abs(this.out.x) + Math.abs(this.out.y) < 0.01;
      if (settled) {
        this.out.reset();
        this.vis.reset();
        this.knob.style.transform = '';
        this.lastVis = 0;
        this.placeHome();
        return;
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  };
  private lastVis = 0;
  /** saída suavizada (avança a mola até o instante atual — pode chamar quantas vezes quiser) */
  read(): JoyState {
    const now = performance.now();
    const dt = (now - this.last) / 1000;
    this.last = now;
    this.out.step(this.tx, this.ty, dt);
    const x = this.out.x,
      y = this.out.y;
    return { x, y, mag: Math.min(1, Math.hypot(x, y)), active: this.pid >= 0 };
  }
  /** saída crua (sem mola) — para quem já suaviza por conta própria */
  raw(): JoyState {
    return { x: this.tx, y: this.ty, mag: Math.min(1, Math.hypot(this.tx, this.ty)), active: this.pid >= 0 };
  }
  get active(): boolean {
    return this.pid >= 0;
  }
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.reset();
    this.el.style.display = on ? '' : 'none';
    if (on) this.placeHome();
  }
  /** solta o dedo e zera a saída na hora */
  reset(): void {
    this.pid = -1;
    this.tx = this.ty = this.kx = this.ky = 0;
    this.out.reset();
    this.vis.reset();
    this.knob.style.transform = '';
    this.el.classList.remove('on');
    this.placeHome();
  }
  destroy(): void {
    cancelAnimationFrame(this.raf);
    surfaceOf(this.surface).remove(this);
    this.unsub();
    window.removeEventListener('resize', this.layout);
    this.el.remove();
  }
}

export function createJoystick(surface: HTMLElement, opts?: JoystickOptions): Joystick {
  return new Joystick(surface, opts);
}
