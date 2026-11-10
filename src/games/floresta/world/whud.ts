/* ============================================================
 *  MUNDO ABERTO — HUD e controles de toque.
 *  - joystick flutuante: nasce onde o dedo toca (metade esquerda)
 *  - arrastar no resto da tela = olhar (o jogo suaviza)
 *  - botões de toque só disparam se o dedo começou E terminou neles,
 *    sem arrastar (nada de toque acidental ao olhar em volta)
 *  - avisos pequenos no topo
 * ============================================================ */
import { t } from '../../../i18n';
import { flIcon } from '../icons';
import { GEAR_SVG, joyRadius, onTouchCfg, openControls, shapeStick, touchCfg } from '../touchcfg';

const svg = (body: string, size = 30) => `<svg class="ico" viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true">${body}</svg>`;
const INK = '#2a0b5c';
export const WICONS = {
  shovel: svg(`<path d="M30 6l12 12-4 4-12-12z" fill="#a8743c" stroke="${INK}" stroke-width="3"/><path d="M26 16L12 30l-4 12 12-4 14-14z" fill="#c8d0e0" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`),
  tnt: svg(`<rect x="8" y="16" width="9" height="26" rx="3" fill="#ff4f6a" stroke="${INK}" stroke-width="3"/><rect x="19" y="16" width="9" height="26" rx="3" fill="#ff4f6a" stroke="${INK}" stroke-width="3"/><rect x="30" y="16" width="9" height="26" rx="3" fill="#ff4f6a" stroke="${INK}" stroke-width="3"/><path d="M24 16C24 10 30 8 34 5" fill="none" stroke="${INK}" stroke-width="3"/><circle cx="36" cy="4" r="3" fill="#ffd34a"/>`),
  up: svg(`<path d="M24 8L42 30H32V40H16V30H6z" fill="#7aff8a" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`),
  down: svg(`<path d="M24 40L42 18H32V8H16V18H6z" fill="#ffd34a" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`),
  paw: svg(`<ellipse cx="24" cy="31" rx="11" ry="9" fill="#ffb347" stroke="${INK}" stroke-width="3"/><circle cx="12" cy="18" r="5" fill="#ffb347" stroke="${INK}" stroke-width="3"/><circle cx="20" cy="11" r="5" fill="#ffb347" stroke="${INK}" stroke-width="3"/><circle cx="29" cy="11" r="5" fill="#ffb347" stroke="${INK}" stroke-width="3"/><circle cx="37" cy="18" r="5" fill="#ffb347" stroke="${INK}" stroke-width="3"/>`),
  solo: svg(`<circle cx="24" cy="15" r="8" fill="#8ad8ff" stroke="${INK}" stroke-width="3"/><path d="M10 42c0-9 6-15 14-15s14 6 14 15z" fill="#8ad8ff" stroke="${INK}" stroke-width="3"/>`),
  arrow: svg(`<path d="M24 4L38 40L24 32L10 40z" fill="#ffd34a" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`, 22),
  exitv: svg(`<path d="M20 8H8V40H20" fill="none" stroke="#fff" stroke-width="5"/><path d="M18 24H42M32 14L42 24L32 34" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/>`),
  stay: svg(`<rect x="10" y="10" width="28" height="28" rx="6" fill="#ff8aa0" stroke="${INK}" stroke-width="3"/>`),
};

export interface WControls {
  /** joystick: x direita, y para baixo (-1..1) */
  mx: number;
  my: number;
  /** pixels de olhar acumulados (o jogo consome) */
  lookDX: number;
  lookDY: number;
  use: boolean;
  up: boolean;
  down: boolean;
}

export type WAct = 'ctl' | 'exit' | 'tool' | 'veh' | 'sell' | 'pets' | 'cmdChop' | 'cmdFetch' | 'cmdFollow' | 'solo' | 'cam';

export class WorldHud {
  el: HTMLDivElement;
  ctl: WControls = { mx: 0, my: 0, lookDX: 0, lookDY: 0, use: false, up: false, down: false };
  private q = <T extends HTMLElement>(s: string) => this.el.querySelector(s) as T;
  private offs: (() => void)[] = [];
  private joy = { id: -1, x: 0, y: 0 };
  private look = { id: -1, x: 0, y: 0 };
  private joyEl: HTMLElement;
  private knob: HTMLElement;
  private toasts: HTMLElement;
  private last: Record<string, string> = {};
  private keys = new Set<string>();

  constructor(
    root: HTMLElement,
    private onAct: (a: WAct) => void,
  ) {
    const el = document.createElement('div');
    el.className = 'fw-hud';
    el.innerHTML = `
      <div class="fw-touch"></div>
      <div class="fw-joy"><i></i></div>
      <div class="fw-top">
        <button class="fl-btn round red" data-tap="exit" aria-label="${t('floresta.exit', 'Sair')}">${flIcon('close', 22)}</button>
        <div class="fl-pill">${flIcon('acorn', 22)}<span data-v="coins">0</span></div>
        <div class="fl-pill">${flIcon('log', 22)}<span data-v="carry">0</span></div>
        <div class="fl-pill fw-biome"><span data-v="biome"></span></div>
        <div class="fl-pill fw-nav"><i data-v="arrow">${WICONS.arrow}</i><span data-v="camp"></span></div>
        <div class="fw-right">
          <button class="fl-btn round" data-tap="ctl" aria-label="${t('floresta.ctl.title', 'Controles')}">${GEAR_SVG(22)}</button>
          <button class="fl-btn round" data-tap="pets" aria-label="${t('floresta.w.pets', 'Ajudantes')}">${WICONS.paw}</button>
        </div>
      </div>
      <div class="fw-toasts"></div>
      <div class="fw-cmd">
        <button class="fl-btn green" data-tap="cmdChop">${flIcon('axe', 22)}<span>${t('floresta.w.cmdChop', 'Cortar ali')}</span></button>
        <button class="fl-btn green" data-tap="cmdFetch">${flIcon('log', 22)}<span>${t('floresta.w.cmdFetch', 'Buscar toras')}</span></button>
        <button class="fl-btn" data-tap="cmdFollow"><span data-v="follow">${t('floresta.w.cmdStay', 'Ficar')}</span></button>
        <button class="fl-btn wood" data-tap="solo">${WICONS.solo}<span data-v="solo">${t('floresta.w.solo', 'Jogar sozinho (sem ajudantes)')}</span></button>
      </div>
      <div class="fw-btns">
        <button class="fl-btn gold fw-sell hide" data-tap="sell">${flIcon('sell', 24)}<span>${t('floresta.w.sell', 'Vender')}</span></button>
        <button class="fl-btn fw-veh hide" data-tap="veh"><span data-v="veh"></span></button>
        <button class="fl-btn round fw-tool" data-tap="tool" aria-label="${t('floresta.w.tool', 'Ferramenta')}"><span data-v="tool"></span></button>
        <button class="fl-btn round fw-up hide" data-hold="up">${WICONS.up}</button>
        <button class="fl-btn round fw-down hide" data-hold="down">${WICONS.down}</button>
        <button class="fw-use" data-hold="use"><span data-v="useI"></span><b data-v="use"></b></button>
      </div>`;
    root.appendChild(el);
    this.el = el;
    this.joyEl = this.q('.fw-joy');
    this.knob = this.joyEl.firstElementChild as HTMLElement;
    this.toasts = this.q('.fw-toasts');
    this.bindTouch();
    this.bindButtons();
    this.bindKeys();
  }

  private on<K extends keyof HTMLElementEventMap>(t: EventTarget, ev: K, f: (e: HTMLElementEventMap[K]) => void, opt?: AddEventListenerOptions): void {
    t.addEventListener(ev, f as EventListener, opt);
    this.offs.push(() => t.removeEventListener(ev, f as EventListener, opt));
  }

  private bindTouch(): void {
    const pad = this.q('.fw-touch');
    const cfg = () => {
      const c = touchCfg();
      this.joyEl.style.setProperty('--jr', joyRadius(c) + 'px');
      this.el.classList.toggle('lefty', c.lefty);
    };
    cfg();
    this.offs.push(onTouchCfg(cfg));
    let sx = 0;
    let sy = 0;
    this.on(pad, 'pointerdown', (e) => {
      e.preventDefault();
      const w = window.innerWidth;
      const c = touchCfg();
      const inJoy = c.lefty ? e.clientX > w * 0.55 : e.clientX < w * 0.45;
      if (inJoy && this.joy.id < 0) {
        this.joy.id = e.pointerId;
        this.joyEl.classList.add('on');
        if (c.floating) {
          this.joy.x = e.clientX;
          this.joy.y = e.clientY;
          this.joyEl.style.left = e.clientX + 'px';
          this.joyEl.style.top = e.clientY + 'px';
        } else {
          const r = this.joyEl.getBoundingClientRect();
          this.joy.x = r.left + r.width / 2;
          this.joy.y = r.top + r.height / 2;
        }
        this.knob.style.transform = 'translate(-50%,-50%)';
        sx = sy = 0;
      } else if (this.look.id < 0) {
        this.look.id = e.pointerId;
        this.look.x = e.clientX;
        this.look.y = e.clientY;
      }
      pad.setPointerCapture?.(e.pointerId);
    });
    this.on(pad, 'pointermove', (e) => {
      if (e.pointerId === this.joy.id) {
        const R = joyRadius();
        let dx = e.clientX - this.joy.x;
        let dy = e.clientY - this.joy.y;
        const d = Math.hypot(dx, dy);
        // passou do raio: a base vem junto (a direção nunca inverte)
        if (d > R && touchCfg().floating) {
          const k = (d - R) / d;
          this.joy.x += dx * k;
          this.joy.y += dy * k;
          this.joyEl.style.left = this.joy.x + 'px';
          this.joyEl.style.top = this.joy.y + 'px';
          dx = e.clientX - this.joy.x;
          dy = e.clientY - this.joy.y;
        }
        const dd = Math.hypot(dx, dy);
        const cl = Math.min(R, dd);
        const nx = dd > 0 ? dx / dd : 0;
        const ny = dd > 0 ? dy / dd : 0;
        this.knob.style.transform = `translate(calc(-50% + ${nx * cl}px), calc(-50% + ${ny * cl}px))`;
        const [ox, oy] = shapeStick(dx, dy, R);
        sx += (ox - sx) * 0.65;
        sy += (oy - sy) * 0.65;
        if (!ox && !oy) sx = sy = 0;
        this.ctl.mx = sx;
        this.ctl.my = sy;
      } else if (e.pointerId === this.look.id) {
        this.ctl.lookDX += e.clientX - this.look.x;
        this.ctl.lookDY += e.clientY - this.look.y;
        this.look.x = e.clientX;
        this.look.y = e.clientY;
      }
    });
    const up = (e: PointerEvent) => {
      if (e.pointerId === this.joy.id) {
        this.joy.id = -1;
        this.ctl.mx = this.ctl.my = 0;
        this.joyEl.classList.remove('on');
        this.joyEl.style.left = this.joyEl.style.top = '';
      } else if (e.pointerId === this.look.id) this.look.id = -1;
    };
    this.on(pad, 'pointerup', up);
    this.on(pad, 'pointercancel', up);
    this.on(pad, 'lostpointercapture', up);
    this.on(window, 'blur', () => {
      this.joy.id = this.look.id = -1;
      this.ctl.mx = this.ctl.my = 0;
      this.ctl.use = this.ctl.up = this.ctl.down = false;
      this.joyEl.classList.remove('on');
      this.keys.clear();
    });
  }

  private bindButtons(): void {
    for (const b of Array.from(this.el.querySelectorAll<HTMLElement>('[data-tap]'))) {
      let id = -1;
      let x0 = 0;
      let y0 = 0;
      let t0 = 0;
      let moved = false;
      this.on(b, 'pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        id = e.pointerId;
        x0 = e.clientX;
        y0 = e.clientY;
        t0 = performance.now();
        moved = false;
        b.setPointerCapture?.(e.pointerId);
        b.classList.add('on');
      });
      this.on(b, 'pointermove', (e) => {
        if (e.pointerId === id && Math.hypot(e.clientX - x0, e.clientY - y0) > 14) {
          moved = true;
          b.classList.remove('on');
        }
      });
      const end = (e: PointerEvent, ok: boolean) => {
        if (e.pointerId !== id) return;
        id = -1;
        b.classList.remove('on');
        if (!ok || moved || performance.now() - t0 > 900) return;
        const r = b.getBoundingClientRect();
        if (e.clientX < r.left - 6 || e.clientX > r.right + 6 || e.clientY < r.top - 6 || e.clientY > r.bottom + 6) return;
        if (b.dataset.tap === 'ctl') openControls(this.el);
        else this.onAct(b.dataset.tap as WAct);
      };
      this.on(b, 'pointerup', (e) => end(e, true));
      this.on(b, 'pointercancel', (e) => end(e, false));
      this.on(b, 'click', (e) => e.stopPropagation());
    }
    for (const b of Array.from(this.el.querySelectorAll<HTMLElement>('[data-hold]'))) {
      const k = b.dataset.hold as 'use' | 'up' | 'down';
      let id = -1;
      this.on(b, 'pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        id = e.pointerId;
        b.setPointerCapture?.(e.pointerId);
        this.ctl[k] = true;
        b.classList.add('on');
      });
      const up = (e: PointerEvent) => {
        if (e.pointerId !== id) return;
        id = -1;
        this.ctl[k] = false;
        b.classList.remove('on');
      };
      this.on(b, 'pointerup', up);
      this.on(b, 'pointercancel', up);
      this.on(b, 'lostpointercapture', up);
    }
  }

  private bindKeys(): void {
    const sync = () => {
      const k = this.keys;
      if (this.joy.id < 0) {
        this.ctl.mx = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0);
        this.ctl.my = (k.has('s') ? 1 : 0) - (k.has('w') ? 1 : 0);
      }
      this.ctl.use = k.has(' ');
      this.ctl.up = k.has('r');
      this.ctl.down = k.has('f');
    };
    this.on(window, 'keydown', (e) => {
      const k = e.key.toLowerCase();
      if (e.repeat) return;
      if (k === 'e') this.onAct('veh');
      else if (k === 'q') this.onAct('tool');
      else if (k === 'v') this.onAct('sell');
      else if (k === 'arrowleft') this.ctl.lookDX -= 60;
      else if (k === 'arrowright') this.ctl.lookDX += 60;
      else if (k === 'arrowup') this.ctl.lookDY -= 40;
      else if (k === 'arrowdown') this.ctl.lookDY += 40;
      this.keys.add(k);
      sync();
    });
    this.on(window, 'keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
      sync();
    });
  }

  /** só mexe no DOM quando muda */
  set(k: string, v: string, html = false): void {
    if (this.last[k] === v) return;
    this.last[k] = v;
    const e = this.q(`[data-v="${k}"]`);
    if (!e) return;
    if (html) e.innerHTML = v;
    else e.textContent = v;
  }
  show(sel: string, on: boolean): void {
    const k = 'show:' + sel;
    const v = on ? '1' : '0';
    if (this.last[k] === v) return;
    this.last[k] = v;
    this.q(sel)?.classList.toggle('hide', !on);
  }
  arrow(rad: number): void {
    const e = this.q('[data-v="arrow"]');
    if (e) e.style.transform = `rotate(${rad}rad)`;
  }
  cmdOpen(on?: boolean): boolean {
    const c = this.q('.fw-cmd');
    c.classList.toggle('show', on);
    return c.classList.contains('show');
  }

  toast(msg: string, kind = ''): void {
    const d = document.createElement('div');
    if (kind) d.className = kind;
    d.textContent = msg;
    this.toasts.appendChild(d);
    while (this.toasts.children.length > 2) this.toasts.firstElementChild!.remove();
    setTimeout(() => d.remove(), 2600);
  }

  destroy(): void {
    for (const f of this.offs) f();
    this.el.remove();
  }
}
