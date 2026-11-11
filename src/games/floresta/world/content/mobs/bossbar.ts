/* ============================================================
 *  BICHOS — barra de vida do chefe (DOM leve, topo da tela).
 * ============================================================ */
import { t } from '../../../../../i18n';
import type { BossCtl } from './boss';

export class BossBar {
  private el: HTMLDivElement;
  private nameEl: HTMLDivElement;
  private fill: HTMLDivElement;
  private ghost: HTMLDivElement;
  private info: HTMLDivElement;
  private shown = false;
  private lastFrac = 1;
  private lagFrac = 1;

  constructor(root: HTMLElement) {
    const el = document.createElement('div');
    el.className = 'bw-bossbar';
    el.style.cssText =
      'position:absolute;left:50%;top:max(10px,env(safe-area-inset-top));transform:translateX(-50%);width:min(560px,82vw);pointer-events:none;' +
      'font-family:var(--font,Fredoka,system-ui);color:#fff;text-align:center;text-shadow:0 2px 0 #2a0b5c;opacity:0;transition:opacity .4s;z-index:20';
    this.nameEl = document.createElement('div');
    this.nameEl.style.cssText = 'font-weight:700;font-size:clamp(14px,3.6vw,20px);margin-bottom:4px';
    const bar = document.createElement('div');
    bar.style.cssText = 'position:relative;height:14px;border-radius:9px;background:#2a0b5c;border:3px solid #fff;overflow:hidden;box-shadow:0 3px 0 #2a0b5c';
    this.ghost = document.createElement('div');
    this.ghost.style.cssText = 'position:absolute;inset:0;width:100%;background:#ffd34a';
    this.fill = document.createElement('div');
    this.fill.style.cssText = 'position:absolute;inset:0;width:100%;background:linear-gradient(#ff7a8a,#e2405a)';
    bar.append(this.ghost, this.fill);
    this.info = document.createElement('div');
    this.info.style.cssText = 'font-size:clamp(11px,2.8vw,14px);margin-top:3px;min-height:1.2em';
    el.append(this.nameEl, bar, this.info);
    root.appendChild(el);
    this.el = el;
  }

  update(b: BossCtl | null): void {
    const show = !!b;
    if (show !== this.shown) {
      this.shown = show;
      this.el.style.opacity = show ? '1' : '0';
    }
    if (!b) return;
    const f = b.hpFrac;
    if (this.nameEl.textContent !== b.name) this.nameEl.textContent = b.name;
    if (f !== this.lastFrac) {
      this.lastFrac = f;
      this.fill.style.width = (f * 100).toFixed(1) + '%';
    }
    this.lagFrac += (f - this.lagFrac) * 0.04;
    this.ghost.style.width = (this.lagFrac * 100).toFixed(1) + '%';
    const hint = b.hint;
    const txt = t('mob.ui.phase', 'Fase {n} de {m}', { n: b.phase, m: b.phases }) + (hint ? ' · ' + hint : '');
    if (this.info.textContent !== txt) this.info.textContent = txt;
  }

  dispose(): void {
    this.el.remove();
  }
}
