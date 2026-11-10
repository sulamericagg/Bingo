/**
 * Roteador de toques de uma superfície (container). Cada dedo (pointerId) pertence a no máximo
 * um controle (joystick, olhar...). Usa pointer capture, trata pointercancel/lostpointercapture,
 * e solta tudo quando o app vai para o fundo — nada de "dedo preso".
 */
export interface TouchClaimer {
  /** maior = escolhe primeiro */
  priority: number;
  /** quer este dedo? (x,y relativos à superfície) */
  wants(e: PointerEvent, x: number, y: number, rect: DOMRect): boolean;
  down(e: PointerEvent, x: number, y: number): void;
  move(e: PointerEvent, x: number, y: number): void;
  up(e: PointerEvent | null): void;
}

/** Elementos que nunca começam joystick/olhar (botões etc.). */
export const IGNORE_SEL = 'button,a,input,select,textarea,label,[data-touch-ignore],.tc-btn';

class Surface {
  private claimers: TouchClaimer[] = [];
  private owner = new Map<number, TouchClaimer>();
  constructor(readonly el: HTMLElement) {
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('lostpointercapture', this.onUp);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    window.addEventListener('blur', this.releaseAll);
    document.addEventListener('visibilitychange', this.onVis);
  }
  add(c: TouchClaimer): void {
    this.claimers.push(c);
    this.claimers.sort((a, b) => b.priority - a.priority);
  }
  remove(c: TouchClaimer): void {
    this.claimers = this.claimers.filter((x) => x !== c);
    for (const [id, o] of this.owner) if (o === c) this.owner.delete(id);
    if (!this.claimers.length) this.destroy();
  }
  private onDown = (e: PointerEvent) => {
    if (this.owner.has(e.pointerId)) return;
    const t = e.target as Element | null;
    if (t && t !== this.el && t.closest?.(IGNORE_SEL)) return;
    const r = this.el.getBoundingClientRect();
    const x = e.clientX - r.left,
      y = e.clientY - r.top;
    for (const c of this.claimers) {
      if (!c.wants(e, x, y, r)) continue;
      this.owner.set(e.pointerId, c);
      try {
        this.el.setPointerCapture(e.pointerId);
      } catch {
        /* ponteiro já saiu */
      }
      if (e.cancelable) e.preventDefault();
      c.down(e, x, y);
      return;
    }
  };
  private onMove = (e: PointerEvent) => {
    const c = this.owner.get(e.pointerId);
    if (!c) return;
    const r = this.el.getBoundingClientRect();
    c.move(e, e.clientX - r.left, e.clientY - r.top);
  };
  private onUp = (e: PointerEvent) => {
    const c = this.owner.get(e.pointerId);
    if (!c) return;
    this.owner.delete(e.pointerId);
    c.up(e);
  };
  releaseAll = () => {
    const owners = [...this.owner.values()];
    this.owner.clear();
    owners.forEach((c) => c.up(null));
  };
  private onVis = () => {
    if (document.hidden) this.releaseAll();
  };
  destroy(): void {
    this.releaseAll();
    const el = this.el;
    el.removeEventListener('pointerdown', this.onDown);
    el.removeEventListener('pointermove', this.onMove);
    el.removeEventListener('pointerup', this.onUp);
    el.removeEventListener('pointercancel', this.onUp);
    el.removeEventListener('lostpointercapture', this.onUp);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    window.removeEventListener('blur', this.releaseAll);
    document.removeEventListener('visibilitychange', this.onVis);
    surfaces.delete(el);
  }
}

const surfaces = new WeakMap<HTMLElement, Surface>();
export function surfaceOf(el: HTMLElement): Surface {
  let s = surfaces.get(el);
  if (!s) surfaces.set(el, (s = new Surface(el)));
  return s;
}
