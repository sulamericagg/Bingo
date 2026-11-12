/* ============================================================
 *  BLOOP PINK — HUD (DOM). Padrão Minecraft mobile: topo (pausa, dinheiro, dia,
 *  nível, abrir/fechar loja, tablet, câmera), barra de itens no meio embaixo com
 *  medidores em cima, botões grandes à direita (USAR contextual, CORRER, SOLTAR),
 *  mira + dica, balões de fala dos clientes, faixas e números voando.
 * ============================================================ */
import { t } from '../../i18n';
import { bindButton, type BoundButton } from '../../ui/touch';
import { ic } from './icons';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface HudCb {
  pause(): void;
  tablet(): void;
  toggleOpen(): void;
  use(down: boolean): void;
  act2(): void;
  run(down: boolean): void;
  drop(): void;
  rotate(): void;
  cancel(): void;
  slot(i: number): void;
  goals(): void;
}
export interface HotSlot {
  icon: string;
  n?: number;
  label: string;
}

interface Bub {
  el: HTMLDivElement;
  until: number;
}

export class Hud {
  readonly el: HTMLDivElement;
  readonly top: HTMLDivElement;
  private q = <T extends HTMLElement>(s: string) => this.el.querySelector(s) as T;
  private binds: BoundButton[] = [];
  private keys: Record<string, string> = {};
  private bubs = new Map<string | number, Bub>();
  private bubLayer: HTMLDivElement;
  private goalT = 0;
  private bannerT = 0;
  overlay: HTMLDivElement | null = null;
  constructor(root: HTMLElement, cb: HudCb) {
    const d = document.createElement('div');
    d.className = 'pk-hud';
    d.innerHTML = `
      <div class="pk-bubbles"></div>
      <div class="pk-flash"></div>
      <div class="pk-top">
        <button class="pk-ib" data-a="pause" aria-label="${esc(t('pink.pause', 'Pausa'))}">${ic('pause', 24)}</button>
        <div class="pk-chip money pk-pe">${ic('coin', 24)}<span></span></div>
        <div class="pk-chip pk-day pk-pe"><span class="i"></span><span class="tx"></span></div>
        <div class="pk-chip pk-lvl pk-pe">${ic('star', 24)}<span></span><i><b></b></i></div>
        <div class="pk-sp"></div>
        <button class="pk-open closed" data-a="open"></button>
        <button class="pk-ib" data-a="tablet" aria-label="${esc(t('pink.tablet', 'Tablet'))}">${ic('tablet', 28)}</button>
      </div>
      <button class="pk-gbtn" data-a="goals" aria-label="${esc(t('pink.goals', 'Metas'))}">${ic('goal', 26)}</button>
      <div class="pk-goal pk-pe mini"></div>
      <div class="pk-combo" hidden>${ic('combo', 22)}<span></span></div>
      <div class="pk-ret"></div>
      <div class="pk-hint"></div>
      <div class="pk-banner"></div>
      <div class="pk-bot">
        <div class="pk-meters">
          <div class="pk-meter" data-m="beauty">${ic('sparkle', 16)}<i><b></b></i></div>
          <div class="pk-meter" data-m="clean">${ic('mop', 16)}<i><b></b></i></div>
          <div class="pk-meter" data-m="stock">${ic('shelf', 16)}<i><b></b></i></div>
        </div>
        <div class="pk-hot pk-pe"></div>
      </div>
      <button class="pk-btn pk-act2" data-a="act2" hidden></button>
      <button class="pk-btn pk-drop" data-a="drop" aria-label="${esc(t('pink.drop', 'Soltar'))}" hidden>${ic('drop', 30)}<small>${esc(t('pink.drop', 'Soltar'))}</small></button>
      <button class="pk-btn pk-run" data-a="run" aria-label="${esc(t('pink.run', 'Correr'))}">${ic('run', 32)}</button>
      <button class="pk-btn pk-use" data-a="use"></button>
      <button class="pk-btn pk-rot" data-a="rot" aria-label="${esc(t('pink.rotate', 'Girar'))}" hidden>${ic('rotate', 30)}</button>
      <button class="pk-btn pk-cancel" data-a="cancel" aria-label="${esc(t('pink.cancel', 'Cancelar'))}" hidden>${ic('close', 30)}</button>
      <div class="pk-fade"></div>`;
    root.appendChild(d);
    this.el = d;
    this.top = this.q('.pk-top');
    this.bubLayer = this.q('.pk-bubbles');
    const b = (sel: string, o: Parameters<typeof bindButton>[1]) => this.binds.push(bindButton(this.q(sel), o));
    b('[data-a=pause]', { onPress: () => cb.pause() });
    b('[data-a=tablet]', { onPress: () => cb.tablet() });
    b('[data-a=open]', { onPress: () => cb.toggleOpen() });
    b('[data-a=use]', { onPress: () => cb.use(true), onRelease: () => cb.use(false) });
    b('[data-a=act2]', { onPress: () => cb.act2() });
    b('[data-a=run]', { onPress: () => cb.run(true), onRelease: () => cb.run(false) });
    b('[data-a=drop]', { onPress: () => cb.drop() });
    b('[data-a=rot]', { onPress: () => cb.rotate() });
    b('[data-a=cancel]', { onPress: () => cb.cancel() });
    b('[data-a=goals]', { onPress: () => cb.goals() });
    this.q('.pk-hot').addEventListener('pointerdown', (e) => {
      const s = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
      if (!s) return;
      e.preventDefault();
      e.stopPropagation();
      cb.slot(+s.dataset.i!);
    });
  }
  private once(k: string, v: string, f: () => void): void {
    if (this.keys[k] === v) return;
    this.keys[k] = v;
    f();
  }
  money(txt: string, bump = false): void {
    this.once('money', txt, () => {
      const c = this.q('.pk-chip.money');
      (c.querySelector('span') as HTMLElement).textContent = txt;
      if (bump) {
        c.classList.remove('bump');
        void c.offsetWidth;
        c.classList.add('bump');
      }
    });
  }
  day(icon: string, txt: string, season: string): void {
    this.once('day', icon + txt + season, () => {
      const c = this.q('.pk-day');
      (c.querySelector('.i') as HTMLElement).innerHTML = ic(icon, 22);
      (c.querySelector('.tx') as HTMLElement).innerHTML = esc(txt) + (season ? `<span class="season">${esc(season)}</span>` : '');
    });
  }
  level(lv: number, k: number): void {
    this.once('lvl', lv + ':' + Math.round(k * 50), () => {
      const c = this.q('.pk-lvl');
      (c.querySelector('span') as HTMLElement).textContent = String(lv);
      (c.querySelector('b') as HTMLElement).style.width = Math.round(k * 100) + '%';
    });
  }
  open(on: boolean, pulse: boolean): void {
    this.once('open', on + ':' + pulse, () => {
      const b = this.q('[data-a=open]');
      b.classList.toggle('closed', !on);
      b.classList.toggle('pulse', pulse);
      b.innerHTML = `${ic(on ? 'open' : 'closed', 26)}<span>${esc(on ? t('pink.isOpen', 'Aberta') : t('pink.isClosed', 'Fechada'))}</span>`;
      b.setAttribute('aria-label', on ? t('pink.closeShop', 'Fechar loja') : t('pink.openShop', 'Abrir loja'));
    });
  }
  hint(icon: string, txt: string): void {
    this.once('hint', icon + txt, () => {
      this.q('.pk-hint').innerHTML = txt ? `${icon ? ic(icon, 18) : ''}${esc(txt)}` : '';
    });
    this.q('.pk-ret').classList.toggle('on', !!txt);
  }
  use(icon: string, label: string, on: boolean): void {
    this.once('use', icon + label + on, () => {
      const b = this.q('[data-a=use]');
      b.innerHTML = `${ic(icon || 'hand', 38)}<small>${esc(label)}</small>`;
      b.classList.toggle('off', !on);
      b.setAttribute('aria-label', label || t('pink.use', 'Usar'));
    });
  }
  act2(icon: string | null, label = ''): void {
    this.once('act2', (icon ?? '') + label, () => {
      const b = this.q('[data-a=act2]');
      b.hidden = !icon;
      if (icon) {
        b.innerHTML = `${ic(icon, 28)}<small>${esc(label)}</small>`;
        b.setAttribute('aria-label', label);
      }
    });
  }
  run(on: boolean): void {
    this.q('[data-a=run]').classList.toggle('on', on);
  }
  carrying(on: boolean): void {
    this.once('carry', String(on), () => (this.q('[data-a=drop]').hidden = !on));
  }
  build(on: boolean): void {
    this.once('build', String(on), () => {
      this.q('[data-a=rot]').hidden = !on;
      this.q('[data-a=cancel]').hidden = !on;
      this.q('[data-a=run]').hidden = on;
      if (on) this.q('[data-a=drop]').hidden = true;
      this.q('.pk-bot').style.visibility = on ? 'hidden' : '';
    });
  }
  meters(beauty: number, clean: number, stock: number): void {
    const set = (m: string, v: number) => {
      const b = this.q(`[data-m=${m}] b`);
      const k = Math.round(Math.max(0, Math.min(100, v)) / 5) * 5;
      this.once('m' + m, String(k), () => {
        b.style.width = k + '%';
        b.style.background = k < 35 ? '#ff5a6e' : k < 65 ? '#ffd34a' : '#5ee08a';
      });
    };
    set('beauty', beauty);
    set('clean', clean);
    set('stock', stock);
  }
  hot(slots: HotSlot[], sel: number): void {
    this.once('hot', JSON.stringify(slots) + sel, () => {
      this.q('.pk-hot').innerHTML = slots.map((s, i) => `<div class="pk-slot${i === sel ? ' sel' : ''}" data-i="${i}" role="button" aria-label="${esc(s.label)}">${ic(s.icon, 32)}${s.n !== undefined ? `<small>${s.n}</small>` : ''}</div>`).join('');
    });
  }
  goals(html: string, show: boolean): void {
    const g = this.q('.pk-goal');
    this.once('goalsHtml', html, () => (g.innerHTML = html));
    if (show) {
      g.classList.remove('mini');
      this.q('.pk-gbtn').style.visibility = 'hidden';
      clearTimeout(this.goalT);
      this.goalT = window.setTimeout(() => {
        g.classList.add('mini');
        this.q('.pk-gbtn').style.visibility = '';
      }, 4200);
    }
  }
  combo(n: number): void {
    const c = this.q('.pk-combo');
    c.hidden = n < 2;
    if (n >= 2) {
      (c.querySelector('span') as HTMLElement).textContent = '×' + n;
      c.classList.remove('bump');
      void c.offsetWidth;
      c.classList.add('bump');
    }
  }
  banner(icon: string, txt: string, ms = 2200): void {
    const b = this.q('.pk-banner');
    b.innerHTML = `${ic(icon, 40)}<span>${esc(txt)}</span>`;
    b.classList.add('on');
    clearTimeout(this.bannerT);
    this.bannerT = window.setTimeout(() => b.classList.remove('on'), ms);
  }
  flash(): void {
    const f = this.q('.pk-flash');
    f.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('on')));
  }
  fade(on: boolean): void {
    this.q('.pk-fade').classList.toggle('on', on);
  }
  /** número/ícone voando a partir de um ponto da tela */
  float(x: number, y: number, html: string, color?: string): void {
    const e = document.createElement('div');
    e.className = 'pk-float';
    e.style.left = x + 'px';
    e.style.top = y + 'px';
    if (color) e.style.color = color;
    e.innerHTML = html;
    this.bubLayer.appendChild(e);
    window.setTimeout(() => e.remove(), 1150);
  }
  /** balão de fala preso a uma posição de tela (atualize com moveBubble) */
  bubble(key: string | number, icon: string, txt: string, kind: '' | 'good' | 'bad' = '', ms = 3000): void {
    let b = this.bubs.get(key);
    if (!b) {
      const el = document.createElement('div');
      el.className = 'pk-bub';
      this.bubLayer.appendChild(el);
      b = { el, until: 0 };
      this.bubs.set(key, b);
    }
    b.el.className = 'pk-bub ' + kind;
    b.el.innerHTML = `${ic(icon, 22)}${txt ? `<span>${esc(txt)}</span>` : ''}`;
    b.until = performance.now() + ms;
  }
  hasBubble(key: string | number): boolean {
    return this.bubs.has(key);
  }
  moveBubble(key: string | number, x: number, y: number, vis: boolean): void {
    const b = this.bubs.get(key);
    if (!b) return;
    if (performance.now() > b.until) {
      b.el.remove();
      this.bubs.delete(key);
      return;
    }
    b.el.style.display = vis ? '' : 'none';
    b.el.style.left = Math.round(x) + 'px';
    b.el.style.top = Math.round(y) + 'px';
  }
  dropBubble(key: string | number): void {
    const b = this.bubs.get(key);
    if (b) {
      b.el.remove();
      this.bubs.delete(key);
    }
  }
  bubbleKeys(): (string | number)[] {
    return [...this.bubs.keys()];
  }
  /** painel por cima (pausa, resumo...) */
  panel(html: string): HTMLDivElement {
    this.closePanel();
    const o = document.createElement('div');
    o.className = 'pk-ov';
    o.innerHTML = `<div class="pk-card">${html}</div>`;
    this.el.appendChild(o);
    this.overlay = o;
    return o;
  }
  closePanel(): void {
    this.overlay?.remove();
    this.overlay = null;
  }
  show(on: boolean): void {
    this.el.style.visibility = on ? '' : 'hidden';
  }
  dispose(): void {
    for (const b of this.binds) b.destroy();
    this.el.remove();
  }
}
