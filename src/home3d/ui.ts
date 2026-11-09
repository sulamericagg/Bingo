/* ============================================================
 *  Interface (DOM) do modo 3D: girar telefone, carregando, HUD,
 *  joystick + olhar, botões de ação grandes, paleta, avisos.
 *  Todo texto via t('home3d.*'); fonte via var(--font).
 * ============================================================ */
import { t } from '../i18n';

const CSS = `
.h3{position:fixed;inset:0;z-index:9000;background:#12082e;color:#fff;font-family:var(--font,'Fredoka',system-ui,sans-serif);user-select:none;-webkit-user-select:none;touch-action:none;overflow:hidden;-webkit-tap-highlight-color:transparent}
.h3 *{box-sizing:border-box}
.h3-canvas{position:absolute;inset:0;display:block}
.h3-layer{position:absolute;inset:0}
.h3-btn{font:inherit;font-weight:700;border:0;cursor:pointer;color:#2a0b5c;background:#fff;border-radius:999px;box-shadow:0 4px 0 #2a0b5c33,0 0 0 3px #2a0b5c inset;padding:8px 14px;display:inline-flex;align-items:center;gap:6px;font-size:14px;transition:transform .08s}
.h3-btn:active,.h3-btn.on{transform:scale(.93)}
.h3-btn svg{width:20px;height:20px;flex:none}
.h3-btn.sel{background:#ffd84a}
.h3-btn.lock{opacity:.5}
.h3-btn .lk{position:absolute;right:-4px;top:-4px;width:18px;height:18px;background:#2a0b5c;border-radius:50%;display:grid;place-items:center}
.h3-btn .lk svg{width:11px;height:11px}
.h3-top{position:absolute;left:0;right:0;top:0;display:flex;align-items:center;gap:8px;padding:max(8px,env(safe-area-inset-top)) max(10px,env(safe-area-inset-right)) 8px max(10px,env(safe-area-inset-left));pointer-events:none}
.h3-top>*{pointer-events:auto}
.h3-tools{margin-left:auto;display:flex;gap:6px}
.h3-tools .h3-btn{position:relative;padding:7px 11px;font-size:13px}
.h3-title{font-weight:700;font-size:15px;text-shadow:0 2px 0 #2a0b5c;padding:4px 10px;background:#2a0b5c88;border-radius:12px;white-space:nowrap}
.h3-ret{position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 2px #2a0b5c;pointer-events:none;transition:transform .12s,border-color .12s}
.h3-ret.hot{transform:scale(1.35);border-color:#ffd84a}
.h3-tgt{position:absolute;left:50%;top:calc(50% + 22px);transform:translateX(-50%);font-weight:700;font-size:14px;padding:3px 10px;border-radius:10px;background:#2a0b5caa;pointer-events:none;white-space:nowrap;opacity:0;transition:opacity .15s}
.h3-tgt.on{opacity:1}
.h3-joy{position:absolute;left:0;bottom:0;width:42%;height:70%}
.h3-joy .base{position:absolute;width:120px;height:120px;margin:-60px 0 0 -60px;border-radius:50%;background:#ffffff22;border:3px solid #ffffff66;display:none}
.h3-joy .knob{position:absolute;left:50%;top:50%;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;background:#fff;box-shadow:0 0 0 3px #2a0b5c inset,0 4px 0 #2a0b5c55}
.h3-joy .hint{position:absolute;left:max(24px,env(safe-area-inset-left));bottom:22px;width:96px;height:96px;border-radius:50%;border:3px dashed #ffffff55;opacity:.8}
.h3-acts{position:absolute;right:max(12px,env(safe-area-inset-right));bottom:14px;display:flex;flex-direction:column-reverse;align-items:flex-end;gap:10px;pointer-events:none}
.h3-act{pointer-events:auto;font:inherit;font-weight:700;border:0;border-radius:50%;width:76px;height:76px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:12px;color:#2a0b5c;background:#fff;box-shadow:0 5px 0 #2a0b5c55,0 0 0 4px #2a0b5c inset;cursor:pointer;transition:transform .08s;position:relative}
.h3-act svg{width:28px;height:28px}
.h3-act.big{width:92px;height:92px;font-size:13px;background:#ffd84a}
.h3-act.small{width:62px;height:62px;font-size:11px}
.h3-act.on{transform:scale(.9);background:#7dffd8}
.h3-act .ring{position:absolute;inset:-6px;border-radius:50%;border:5px solid transparent;border-top-color:#4fd67a;pointer-events:none;opacity:0}
.h3-act.on .ring{opacity:1;animation:h3spin .6s linear infinite}
@keyframes h3spin{to{transform:rotate(360deg)}}
.h3-row{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);display:flex;gap:6px;align-items:center;padding:6px 8px;background:#2a0b5ccc;border-radius:16px;max-width:calc(100% - 220px);overflow-x:auto;scrollbar-width:none}
.h3-sw{width:30px;height:30px;border-radius:50%;border:3px solid #fff;flex:none;cursor:pointer}
.h3-sw.sel{outline:3px solid #ffd84a;outline-offset:2px}
.h3-prog{position:absolute;left:50%;top:52px;transform:translateX(-50%);width:220px;height:16px;border-radius:9px;background:#2a0b5c;box-shadow:0 0 0 3px #fff;overflow:hidden;display:none}
.h3-prog i{display:block;height:100%;width:0;background:linear-gradient(90deg,#ff7ad9,#ffd84a);transition:width .15s}
.h3-prog b{position:absolute;inset:0;text-align:center;font-size:11px;line-height:16px}
.h3-toast{position:absolute;left:50%;top:22%;transform:translateX(-50%) scale(.8);font-weight:700;font-size:20px;padding:8px 18px;border-radius:16px;background:#fff;color:#2a0b5c;box-shadow:0 0 0 4px #2a0b5c inset,0 6px 0 #2a0b5c55;opacity:0;transition:all .2s;pointer-events:none;white-space:nowrap}
.h3-toast.on{opacity:1;transform:translateX(-50%) scale(1)}
.h3-tip{position:absolute;padding:6px 10px;border-radius:10px;background:#2a0b5c;color:#fff;font-size:12px;font-weight:600;pointer-events:none;white-space:nowrap;z-index:5;box-shadow:0 0 0 2px #fff}
.h3-full{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;text-align:center;padding:24px;background:radial-gradient(circle at 50% 40%,#5a3fb0,#2a1a63 55%,#12082e)}
.h3-full h2{margin:0;font-size:24px;text-shadow:0 3px 0 #2a0b5c}
.h3-full p{margin:0;opacity:.9;max-width:420px}
.h3-phone{width:70px;height:120px;border-radius:16px;border:6px solid #fff;position:relative;animation:h3rot 2.2s ease-in-out infinite;box-shadow:0 6px 0 #2a0b5c}
.h3-phone:after{content:'';position:absolute;left:50%;bottom:6px;width:16px;height:4px;margin-left:-8px;border-radius:2px;background:#fff}
.h3-phone i{position:absolute;inset:8px 6px 16px;border-radius:6px;background:linear-gradient(135deg,#ff7ad9,#ffd84a)}
@keyframes h3rot{0%,20%{transform:rotate(0)}45%,75%{transform:rotate(-90deg)}100%{transform:rotate(0)}}
.h3-bar{width:min(320px,70vw);height:22px;border-radius:12px;background:#2a0b5c;box-shadow:0 0 0 4px #fff;overflow:hidden;position:relative}
.h3-bar i{position:absolute;left:0;top:0;bottom:0;width:0;background:repeating-linear-gradient(-45deg,#ffd84a 0 14px,#ffb03d 14px 28px);transition:width .2s;animation:h3stripe .6s linear infinite;background-size:40px 40px}
@keyframes h3stripe{to{background-position:40px 0}}
.h3-load-house{width:120px;height:100px;position:relative}
.h3-load-house b{position:absolute;bottom:0;width:22px;border-radius:6px 6px 0 0;background:#fff;animation:h3bounce 1s ease-in-out infinite}
@keyframes h3bounce{0%,100%{transform:scaleY(.6)}50%{transform:scaleY(1)}}
.h3-step{font-size:13px;opacity:.85;min-height:18px}
.h3-cat{position:absolute;left:0;right:0;bottom:0;max-height:46%;background:#2a0b5cee;border-radius:18px 18px 0 0;padding:8px 10px 10px;display:flex;flex-direction:column;gap:6px;transform:translateY(100%);transition:transform .2s}
.h3-cat.on{transform:none}
.h3-cat .tabs,.h3-cat .grid{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}
.h3-cat .grid{flex-wrap:wrap;overflow-y:auto;max-height:150px}
.h3-chip{font:inherit;font-weight:700;font-size:12px;border:0;border-radius:12px;padding:7px 10px;background:#fff;color:#2a0b5c;cursor:pointer;display:flex;align-items:center;gap:6px;flex:none}
.h3-chip i{width:14px;height:14px;border-radius:4px;display:inline-block;box-shadow:0 0 0 2px #2a0b5c}
.h3-chip.sel{background:#ffd84a}
.h3-side{position:absolute;right:max(10px,env(safe-area-inset-right));top:56px;display:flex;flex-direction:column;gap:8px;align-items:flex-end}
.h3-left{position:absolute;left:max(10px,env(safe-area-inset-left));top:56px;display:flex;flex-direction:column;gap:6px}
.h3-emote{position:absolute;left:50%;top:30%;transform:translate(-50%,-50%);pointer-events:none}
`;
let cssEl: HTMLStyleElement | null = null;
export function ensureCss(): void {
  if (cssEl) return;
  cssEl = document.createElement('style');
  cssEl.textContent = CSS;
  document.head.appendChild(cssEl);
}
export function removeCss(): void {
  cssEl?.remove();
  cssEl = null;
}

/* ---------------- ícones (SVG simples, originais) ---------------- */
const P = (d: string, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
export const ICON: Record<string, string> = {
  exit: P('<path d="M15 5l-7 7 7 7"/>'),
  hand: P('<path d="M7 12V6.5a1.5 1.5 0 013 0V11m0-5.5v-1a1.5 1.5 0 013 0V11m0-5a1.5 1.5 0 013 0v6m0-3a1.5 1.5 0 013 0v5c0 4-3 6-6 6h-1c-3 0-4.5-1.5-6-4l-2-3.5a1.5 1.5 0 012.5-1.5L7 15"/>'),
  grab: P('<path d="M6 11c0-2 1-3 2.5-3S11 9 11 9V7c0-1 .8-2 2-2s2 1 2 2v2c0-1 .8-1.5 1.7-1.5S18.5 8 18.5 9v5c0 4-3 6-6.5 6S6 18 6 15z"/>'),
  throw: P('<path d="M5 19c3-8 8-12 14-14"/><path d="M13 5h6v6"/>'),
  kick: P('<path d="M6 4l3 8-3 6h5l2-4 5 1"/><circle cx="19" cy="18" r="2.5"/>'),
  break: P('<path d="M12 3l-2 6 4 2-3 7"/><path d="M5 8l3 2M19 9l-3 2M6 18l3-2M18 17l-3-2"/>'),
  clean: P('<rect x="4" y="9" width="16" height="9" rx="3"/><path d="M8 9V6h8v3"/><circle cx="18" cy="5" r="1.5"/><circle cx="21" cy="8" r="1"/>'),
  paint: P('<rect x="4" y="3" width="13" height="6" rx="2"/><path d="M17 6h3v5h-8v3"/><rect x="10" y="14" width="4" height="7" rx="1.5"/>'),
  build: P('<path d="M3 21h18M5 21V10l7-6 7 6v11"/><path d="M10 21v-6h4v6"/>'),
  fix: P('<path d="M4 12a8 8 0 0114-5l2-2v6h-6l2-2a5 5 0 10.9 5.5"/>'),
  eat: P('<path d="M4 14h16l-2 6H6z"/><path d="M8 14c0-4 2-7 4-7s4 3 4 7"/><path d="M12 7V4"/>'),
  drop: P('<path d="M12 4v12M6 11l6 6 6-6"/><path d="M5 21h14"/>'),
  emote: P('<circle cx="12" cy="12" r="9"/><path d="M8 14c1 2 2.5 3 4 3s3-1 4-3"/><path d="M9 9.5h.01M15 9.5h.01"/>'),
  rotate: P('<path d="M20 12a8 8 0 11-3-6.2"/><path d="M20 4v5h-5"/>'),
  trash: P('<path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13"/>'),
  color: P('<circle cx="12" cy="12" r="9"/><circle cx="8" cy="10" r="1.5"/><circle cx="12" cy="7.5" r="1.5"/><circle cx="16" cy="10" r="1.5"/><path d="M12 21c-2 0-2-3 0-4s3-2 3-4"/>'),
  plus: P('<path d="M12 5v14M5 12h14"/>'),
  check: P('<path d="M5 12l5 5 9-10"/>'),
  eye: P('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  lock: P('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>', 'stroke="#fff"'),
  floor: P('<path d="M3 17l9 4 9-4-9-4z"/><path d="M7.5 15l9 4M12 13l-4.5 6"/>'),
  wall: P('<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M3 14h18M9 4v5M15 9v5M9 14v6"/>'),
  party: P('<path d="M4 20l5-14 9 9z"/><path d="M14 4l1 2M19 6l-2 1M20 11h-2"/>'),
  cake: P('<rect x="4" y="11" width="16" height="9" rx="2"/><path d="M4 15c2 1 4 1 6 0s4-1 6 0 3 1 4 0"/><path d="M12 11V7"/><path d="M12 4.5v.01"/>'),
};

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}
export function button(label: string, icon: string, cls = 'h3-btn'): HTMLButtonElement {
  const b = el('button', cls, (ICON[icon] ?? '') + `<span>${esc(label)}</span>`);
  b.type = 'button';
  return b;
}
export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/* ---------------- girar o telefone ---------------- */
export function isLandscape(): boolean {
  return window.matchMedia('(orientation: landscape)').matches || window.innerWidth > window.innerHeight;
}
export async function askLandscape(root: HTMLElement, skip: boolean): Promise<boolean> {
  try {
    const so = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    if (so?.lock) await so.lock('landscape').catch(() => undefined);
  } catch {
    /* sem suporte */
  }
  if (skip || isLandscape()) return true;
  const box = el(
    'div',
    'h3-full',
    `<div class="h3-phone"><i></i></div><h2>${esc(t('home3d.rotate.title', 'Vire o telefone!'))}</h2><p>${esc(t('home3d.rotate.text', 'O modo 3D da casa fica melhor deitado. Gire o aparelho para começar.'))}</p>`,
  );
  const cancel = button(t('home3d.rotate.back', 'Voltar'), 'exit');
  box.appendChild(cancel);
  root.appendChild(box);
  return new Promise((res) => {
    const mq = window.matchMedia('(orientation: landscape)');
    const done = (ok: boolean) => {
      mq.removeEventListener('change', chk);
      window.removeEventListener('resize', chk);
      box.remove();
      res(ok);
    };
    const chk = () => {
      if (isLandscape()) done(true);
    };
    mq.addEventListener('change', chk);
    window.addEventListener('resize', chk);
    cancel.onclick = () => done(false);
  });
}
export function unlockOrientation(): void {
  try {
    const so = screen.orientation as ScreenOrientation & { unlock?: () => void; lock?: (o: string) => Promise<void> };
    if (so?.lock) void so.lock('portrait').catch(() => so.unlock?.());
    else so?.unlock?.();
  } catch {
    /* */
  }
}

/* ---------------- carregando ---------------- */
export class Loading {
  readonly box: HTMLDivElement;
  private bar: HTMLElement;
  private step: HTMLElement;
  constructor(root: HTMLElement) {
    const cols = ['#ff7ad9', '#ffd84a', '#46d9e6', '#4fd67a', '#8a5cff'];
    const bars = cols.map((c, i) => `<b style="left:${i * 24}px;height:${40 + i * 12}px;background:${c};animation-delay:${i * 0.12}s;transform-origin:bottom"></b>`).join('');
    this.box = el(
      'div',
      'h3-full',
      `<div class="h3-load-house">${bars}</div><h2>${esc(t('home3d.load.title', 'Montando sua casa em 3D'))}</h2><div class="h3-bar"><i></i></div><div class="h3-step"></div>`,
    );
    this.bar = this.box.querySelector('.h3-bar i')!;
    this.step = this.box.querySelector('.h3-step')!;
    root.appendChild(this.box);
  }
  set(p: number, label: string): void {
    this.bar.style.width = Math.round(Math.min(1, p) * 100) + '%';
    this.step.textContent = label;
  }
  remove(): void {
    this.box.remove();
  }
}

/* ---------------- aviso / fallback ---------------- */
export function fallback(root: HTMLElement, title: string, text: string, tryAnyway: boolean): Promise<'back' | 'try'> {
  const box = el('div', 'h3-full', `<h2>${esc(title)}</h2><p>${esc(text)}</p>`);
  const row = el('div', '', '');
  row.style.cssText = 'display:flex;gap:10px';
  const back = button(t('home3d.fallback.back', 'Ficar no 2D'), 'exit');
  row.appendChild(back);
  let tryB: HTMLButtonElement | null = null;
  if (tryAnyway) {
    tryB = button(t('home3d.fallback.try', 'Tentar mesmo assim'), 'check');
    tryB.classList.add('sel');
    row.appendChild(tryB);
  }
  box.appendChild(row);
  root.appendChild(box);
  return new Promise((res) => {
    back.onclick = () => (box.remove(), res('back'));
    if (tryB) tryB.onclick = () => (box.remove(), res('try'));
  });
}

/* ---------------- entrada FPS: joystick + olhar + teclado ---------------- */
export class FpsInput {
  moveX = 0;
  moveY = 0;
  lookDX = 0;
  lookDY = 0;
  enabled = true;
  private keys = new Set<string>();
  private joyId = -1;
  private lookId = -1;
  private jx = 0;
  private jy = 0;
  private lx = 0;
  private ly = 0;
  readonly joy: HTMLDivElement;
  private base: HTMLDivElement;
  private knob: HTMLDivElement;
  private hint: HTMLDivElement;
  constructor(
    private layer: HTMLElement,
    private sens = 0.0055,
  ) {
    this.joy = el('div', 'h3-joy', '<div class="hint"></div><div class="base"><div class="knob"></div></div>');
    this.base = this.joy.querySelector('.base')!;
    this.knob = this.joy.querySelector('.knob')!;
    this.hint = this.joy.querySelector('.hint')!;
    layer.appendChild(this.joy);
    layer.addEventListener('pointerdown', this.down);
    window.addEventListener('pointermove', this.move);
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.up);
    window.addEventListener('keydown', this.kd);
    window.addEventListener('keyup', this.ku);
  }
  private down = (e: PointerEvent) => {
    if (!this.enabled) return;
    const tgt = e.target as HTMLElement;
    if (tgt.closest('button,.h3-row,.h3-cat')) return;
    const r = this.layer.getBoundingClientRect();
    const x = e.clientX - r.left;
    if (x < r.width * 0.42 && e.clientY - r.top > r.height * 0.3 && this.joyId < 0 && e.pointerType !== 'mouse') {
      this.joyId = e.pointerId;
      this.jx = e.clientX;
      this.jy = e.clientY;
      this.base.style.display = 'block';
      this.base.style.left = x + 'px';
      this.base.style.top = e.clientY - r.top + 'px';
      this.hint.style.display = 'none';
    } else if (this.lookId < 0) {
      this.lookId = e.pointerId;
      this.lx = e.clientX;
      this.ly = e.clientY;
    }
  };
  private move = (e: PointerEvent) => {
    if (e.pointerId === this.joyId) {
      let dx = e.clientX - this.jx,
        dy = e.clientY - this.jy;
      const d = Math.hypot(dx, dy),
        R = 50;
      if (d > R) (dx *= R / d), (dy *= R / d);
      this.knob.style.transform = `translate(${dx}px,${dy}px)`;
      this.moveX = dx / R;
      this.moveY = -dy / R;
    } else if (e.pointerId === this.lookId) {
      this.lookDX += (e.clientX - this.lx) * this.sens;
      this.lookDY += (e.clientY - this.ly) * this.sens;
      this.lx = e.clientX;
      this.ly = e.clientY;
    }
  };
  private up = (e: PointerEvent) => {
    if (e.pointerId === this.joyId) {
      this.joyId = -1;
      this.moveX = this.moveY = 0;
      this.base.style.display = 'none';
      this.knob.style.transform = '';
    } else if (e.pointerId === this.lookId) this.lookId = -1;
  };
  private kd = (e: KeyboardEvent) => {
    this.keys.add(e.code);
  };
  private ku = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  key(code: string): boolean {
    return this.keys.has(code);
  }
  /** direção final (joystick ou WASD) */
  dir(): [number, number] {
    let x = this.moveX,
      y = this.moveY;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y = 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y = -1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x = -1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x = 1;
    const l = Math.hypot(x, y);
    if (l > 1) (x /= l), (y /= l);
    return [x, y];
  }
  consumeLook(): [number, number] {
    const r: [number, number] = [this.lookDX, this.lookDY];
    this.lookDX = this.lookDY = 0;
    return r;
  }
  show(on: boolean): void {
    this.joy.style.display = on ? '' : 'none';
    this.enabled = on;
    if (!on) {
      this.joyId = this.lookId = -1;
      this.moveX = this.moveY = 0;
    }
  }
  dispose(): void {
    this.layer.removeEventListener('pointerdown', this.down);
    window.removeEventListener('pointermove', this.move);
    window.removeEventListener('pointerup', this.up);
    window.removeEventListener('pointercancel', this.up);
    window.removeEventListener('keydown', this.kd);
    window.removeEventListener('keyup', this.ku);
  }
}

/* ---------------- botões de ação contextuais ---------------- */
export interface ActDef {
  id: string;
  label: string;
  icon: string;
  size?: 'big' | 'small';
  hold?: boolean;
}
export class Actions {
  readonly box: HTMLDivElement;
  private btns = new Map<string, HTMLButtonElement>();
  private sig = '';
  held = new Set<string>();
  onTap?: (id: string) => void;
  constructor(layer: HTMLElement) {
    this.box = el('div', 'h3-acts');
    layer.appendChild(this.box);
  }
  set(list: ActDef[]): void {
    const sig = list.map((a) => a.id + a.label).join('|');
    if (sig === this.sig) return;
    this.sig = sig;
    const keep = new Set(list.map((a) => a.id));
    for (const [id, b] of this.btns)
      if (!keep.has(id)) {
        b.remove();
        this.btns.delete(id);
        this.held.delete(id);
      }
    list.forEach((a) => {
      let b = this.btns.get(a.id);
      if (!b) {
        b = el('button', 'h3-act' + (a.size ? ' ' + a.size : ''), `<span class="ring"></span>${ICON[a.icon] ?? ''}<span class="lbl"></span>`);
        b.type = 'button';
        b.dataset.id = a.id;
        const id = a.id;
        b.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          e.preventDefault();
          b!.classList.add('on');
          this.held.add(id);
          if (!a.hold) this.onTap?.(id);
        });
        const rel = () => {
          b!.classList.remove('on');
          this.held.delete(id);
        };
        b.addEventListener('pointerup', rel);
        b.addEventListener('pointerleave', rel);
        b.addEventListener('pointercancel', rel);
        this.btns.set(a.id, b);
      }
      b.querySelector('.lbl')!.textContent = a.label;
      this.box.appendChild(b);
    });
  }
}

export class Toast {
  private el: HTMLDivElement;
  private tm = 0;
  constructor(layer: HTMLElement) {
    this.el = el('div', 'h3-toast');
    layer.appendChild(this.el);
  }
  show(text: string, ms = 1400): void {
    this.el.textContent = text;
    this.el.classList.add('on');
    clearTimeout(this.tm);
    this.tm = window.setTimeout(() => this.el.classList.remove('on'), ms);
  }
}

/** dica com cadeado sobre um botão bloqueado */
export function lockTip(layer: HTMLElement, anchor: HTMLElement, text: string): void {
  layer.querySelectorAll('.h3-tip').forEach((e) => e.remove());
  const tip = el('div', 'h3-tip');
  tip.textContent = text;
  layer.appendChild(tip);
  const a = anchor.getBoundingClientRect(),
    l = layer.getBoundingClientRect();
  tip.style.top = a.bottom - l.top + 8 + 'px';
  tip.style.right = Math.max(6, l.right - a.right) + 'px';
  setTimeout(() => tip.remove(), 1800);
}
