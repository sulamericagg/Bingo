/**
 * Botões de toque: disparam no pointerdown (sem atraso de 300 ms), apertam visualmente na hora,
 * suportam segurar (hold) e repetição, vibração leve, área ≥ 56 px e nunca rolam/dão zoom.
 */
import { tap } from '../../core/haptics';
import { ensureTouchCss } from './css';

export interface ButtonOptions {
  /** no toque (pointerdown) */
  onPress?: (e: PointerEvent) => void;
  /** ao soltar/cancelar */
  onRelease?: (e: PointerEvent | null) => void;
  /** chamado após `holdMs` segurando */
  onHold?: () => void;
  holdMs?: number;
  /** repete onPress a cada N ms enquanto segura (0 = não) */
  repeatMs?: number;
  /** 'light' padrão; false desliga */
  haptic?: 'light' | 'medium' | 'heavy' | false;
}

export interface BoundButton {
  readonly el: HTMLElement;
  /** está apertado agora */
  readonly held: boolean;
  release(): void;
  destroy(): void;
}

export function bindButton(el: HTMLElement, o: ButtonOptions): BoundButton {
  ensureTouchCss();
  el.classList.add('tc-btn');
  el.style.touchAction = 'none';
  let pid = -1;
  let holdT = 0;
  let repT = 0;
  const clear = () => {
    clearTimeout(holdT);
    clearInterval(repT);
  };
  const down = (e: PointerEvent) => {
    if (e.button > 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (pid >= 0) return;
    pid = e.pointerId;
    try {
      el.setPointerCapture(pid);
    } catch {
      /* já saiu */
    }
    el.classList.add('tc-pressed');
    // só enquanto apertado: botão descartado sem destroy() não deixa ouvinte global para trás (QA: vazamento)
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', blurUp);
    if (o.haptic !== false) tap(o.haptic || 'light');
    o.onPress?.(e);
    if (o.onHold) holdT = window.setTimeout(() => pid >= 0 && o.onHold!(), o.holdMs ?? 450);
    if (o.repeatMs) repT = window.setInterval(() => pid >= 0 && o.onPress?.(e), o.repeatMs);
  };
  const up = (e: PointerEvent | null) => {
    if (e && e.pointerId !== pid) return;
    if (pid < 0) return;
    pid = -1;
    clear();
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('blur', blurUp);
    el.classList.remove('tc-pressed');
    o.onRelease?.(e);
  };
  const onUp = (e: PointerEvent) => up(e);
  const onVis = () => document.hidden && up(null);
  const blurUp = () => up(null);
  const block = (e: Event) => e.preventDefault();
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('lostpointercapture', onUp);
  el.addEventListener('contextmenu', block);
  return {
    el,
    get held() {
      return pid >= 0;
    },
    release: () => up(null),
    destroy() {
      up(null);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('lostpointercapture', onUp);
      el.removeEventListener('contextmenu', block);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', blurUp);
    },
  };
}
