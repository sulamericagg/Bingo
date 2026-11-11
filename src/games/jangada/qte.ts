/* ============================================================
 *  JANGADA BLOOP — QTE (eventos de reação) das lutas com chefes.
 *  Ícone GRANDE no meio da tela (crianças que ainda não leem):
 *   - 'tap'   toque quando o anel encostar no círculo;
 *   - 'mash'  toque rápido várias vezes (a barra enche);
 *   - 'swipe' arraste para o lado da seta (← → ↑);
 *   - 'hold'  segure até o anel encher.
 *  Teclado: Espaço/Enter (toque/segurar) e setas (arrastar).
 *  Tempo e quantidade escalam com a dificuldade.
 * ============================================================ */
import { t } from '../../i18n';
import { jIcon } from './icons';

export type QteKind = 'tap' | 'mash' | 'swipe' | 'hold';
export type QteDir = 'l' | 'r' | 'u';
export interface QteReq {
  kind: QteKind;
  dir?: QteDir;
  /** segundos para reagir */
  dur: number;
  /** toques (mash) */
  n?: number;
}
const ICON: Record<QteKind, string> = { tap: 'hand', mash: 'hand', swipe: 'swipe', hold: 'hold' };

export class Qte {
  private el: HTMLDivElement;
  private ring: HTMLDivElement;
  private bar: HTMLElement;
  private lbl: HTMLElement;
  private req: QteReq | null = null;
  private cb: ((ok: boolean) => void) | null = null;
  private t = 0;
  private count = 0;
  private holding = false;
  private holdT = 0;
  private down: { x: number; y: number } | null = null;
  private resultT = 0;
  onInput: (() => void) | null = null;
  constructor(root: HTMLElement) {
    const d = document.createElement('div');
    d.className = 'jg-qte';
    d.innerHTML = `<div class="q"><div class="ring"></div><div class="ic"></div><div class="bar"><i></i></div><div class="lbl"></div></div><div class="res"></div>`;
    root.appendChild(d);
    this.el = d;
    this.ring = d.querySelector('.ring')!;
    this.bar = d.querySelector('.bar i')!;
    this.lbl = d.querySelector('.lbl')!;
    d.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.down = { x: e.clientX, y: e.clientY };
      this.press(true);
    });
    d.addEventListener('pointermove', (e) => {
      if (!this.down || this.req?.kind !== 'swipe') return;
      const dx = e.clientX - this.down.x;
      const dy = e.clientY - this.down.y;
      if (Math.hypot(dx, dy) > 46) {
        this.swipe(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'l' : 'r') : dy < 0 ? 'u' : 'd');
        this.down = null;
      }
    });
    const up = (e: PointerEvent) => {
      e.stopPropagation();
      this.down = null;
      this.press(false);
    };
    d.addEventListener('pointerup', up);
    d.addEventListener('pointercancel', up);
    window.addEventListener('keydown', this.kd);
    window.addEventListener('keyup', this.ku);
  }
  get active(): boolean {
    return !!this.req;
  }
  start(req: QteReq, cb: (ok: boolean) => void): void {
    if (this.req) this.finish(false);
    this.req = req;
    this.cb = cb;
    this.t = 0;
    this.count = 0;
    this.holding = false;
    this.holdT = 0;
    const k = req.kind;
    const arrow = req.dir === 'l' ? '←' : req.dir === 'r' ? '→' : '↑';
    const txt =
      k === 'tap'
        ? t('jangada.qte.tap', 'TOQUE!')
        : k === 'mash'
          ? t('jangada.qte.mash', 'TOQUE RÁPIDO!')
          : k === 'hold'
            ? t('jangada.qte.hold', 'SEGURE!')
            : `${t('jangada.qte.swipe', 'ARRASTE')} ${arrow}`;
    this.el.querySelector('.ic')!.innerHTML = k === 'swipe' ? `<span class="arr d${req.dir ?? 'r'}">${arrow}</span>` : jIcon(ICON[k], 74);
    this.lbl.textContent = txt;
    this.el.className = `jg-qte on k-${k}`;
    this.el.querySelector('.res')!.textContent = '';
    this.bar.style.width = '0%';
    this.onInput?.();
  }
  private press(dn: boolean): void {
    const r = this.req;
    if (!r) return;
    if (r.kind === 'tap' && dn) {
      // vale depois que o anel começou a fechar (reação, não chute)
      if (this.t > r.dur * 0.18) this.finish(true);
    } else if (r.kind === 'mash' && dn) {
      this.count++;
      this.bar.style.width = `${Math.min(100, (this.count / (r.n ?? 8)) * 100)}%`;
      this.el.querySelector('.q')!.classList.remove('bump');
      void (this.el.querySelector('.q') as HTMLElement).offsetWidth;
      this.el.querySelector('.q')!.classList.add('bump');
      if (this.count >= (r.n ?? 8)) this.finish(true);
    } else if (r.kind === 'hold') this.holding = dn;
  }
  private swipe(dir: string): void {
    const r = this.req;
    if (!r || r.kind !== 'swipe') return;
    this.finish(dir === (r.dir ?? 'r'));
  }
  update(dt: number): void {
    if (this.resultT > 0) {
      this.resultT -= dt;
      if (this.resultT <= 0 && !this.req) this.el.className = 'jg-qte';
    }
    const r = this.req;
    if (!r) return;
    this.t += dt;
    const k = Math.min(1, this.t / r.dur);
    this.ring.style.transform = `scale(${2.2 - k * 1.25})`;
    this.ring.style.opacity = String(0.4 + k * 0.6);
    if (r.kind === 'hold') {
      if (this.holding) this.holdT += dt;
      else this.holdT = Math.max(0, this.holdT - dt * 2);
      const need = Math.min(1.1, r.dur * 0.55);
      this.bar.style.width = `${Math.min(100, (this.holdT / need) * 100)}%`;
      if (this.holdT >= need) return this.finish(true);
    }
    if (this.t >= r.dur) this.finish(false);
  }
  private finish(ok: boolean): void {
    const cb = this.cb;
    this.req = null;
    this.cb = null;
    this.el.className = `jg-qte res-${ok ? 'ok' : 'no'}`;
    this.el.querySelector('.res')!.innerHTML = ok ? `${jIcon('star', 64)}<b>${t('jangada.qte.ok', 'Boa!')}</b>` : `<b>${t('jangada.qte.no', 'Ops!')}</b>`;
    this.resultT = 0.8;
    cb?.(ok);
  }
  cancel(): void {
    if (!this.req) return;
    this.req = null;
    this.cb = null;
    this.el.className = 'jg-qte';
  }
  private kd = (e: KeyboardEvent) => {
    if (!this.req) return;
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) this.press(true);
    } else if (e.code === 'ArrowLeft') this.swipe('l');
    else if (e.code === 'ArrowRight') this.swipe('r');
    else if (e.code === 'ArrowUp') this.swipe('u');
  };
  private ku = (e: KeyboardEvent) => {
    if (e.code === 'Space' || e.code === 'Enter') this.press(false);
  };
  /** testes: resolve o QTE atual */
  debugSolve(ok: boolean): void {
    if (this.req) this.finish(ok);
  }
  dispose(): void {
    window.removeEventListener('keydown', this.kd);
    window.removeEventListener('keyup', this.ku);
    this.el.remove();
  }
}
