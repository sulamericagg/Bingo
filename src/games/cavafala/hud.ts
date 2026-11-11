/* ============================================================
 *  CAVA & FALA — HUD (DOM): materiais, status, botões de toque,
 *  barra de engenhocas, mira, balão "ouvindo...", painel de digitar,
 *  círculo de receitas, ganhos flutuantes e seta do tutorial.
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../../i18n';
import { bindButton, type BoundButton } from '../../ui/touch';
import { MATS, matColor, matName, type Inv, type Theme } from './data';
import { costOf, type GDef, type Mods } from './gadgets';
import { injectCss } from './style';

export const SVG = {
  mic: '<svg viewBox="0 0 48 48"><rect x="17" y="6" width="14" height="24" rx="7" fill="#fff"/><path d="M11 22a13 13 0 0 0 26 0" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M24 35v7M17 42h14" stroke="#fff" stroke-width="4" stroke-linecap="round"/></svg>',
  dig: '<svg viewBox="0 0 48 48"><path d="M30 6l12 12-5 5-12-12z" fill="#ffd34a" stroke="#2a0b5c" stroke-width="2.5"/><path d="M27 15L12 30" stroke="#8a5a3a" stroke-width="5" stroke-linecap="round"/><path d="M6 30c4-2 9-1 12 2s4 8 2 12c-6 0-12-1-14-5s-2-7 0-9z" fill="#c8d0e0" stroke="#2a0b5c" stroke-width="2.5"/></svg>',
  use: '<svg viewBox="0 0 48 48"><path d="M24 4l5 12 13 1-10 8 4 13-12-7-12 7 4-13-10-8 13-1z" fill="#fff" stroke="#2a0b5c" stroke-width="2.5" stroke-linejoin="round"/></svg>',
  jump: '<svg viewBox="0 0 48 48"><path d="M24 8l14 16h-8v14H18V24h-8z" fill="#fff" stroke="#2a0b5c" stroke-width="2.5" stroke-linejoin="round"/></svg>',
  kb: '<svg viewBox="0 0 48 48"><rect x="4" y="12" width="40" height="26" rx="5" fill="#fff" stroke="#2a0b5c" stroke-width="2.5"/><g fill="#2a0b5c"><rect x="9" y="17" width="5" height="5" rx="1"/><rect x="17" y="17" width="5" height="5" rx="1"/><rect x="25" y="17" width="5" height="5" rx="1"/><rect x="33" y="17" width="5" height="5" rx="1"/><rect x="13" y="28" width="22" height="5" rx="1"/></g></svg>',
  book: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="17" fill="#fff" stroke="#2a0b5c" stroke-width="2.5"/><g fill="#ff8a3a"><circle cx="24" cy="12" r="4"/><circle cx="34" cy="20" r="4" fill="#5ab0ff"/><circle cx="31" cy="32" r="4" fill="#5ad6a0"/><circle cx="17" cy="32" r="4" fill="#b05aff"/><circle cx="14" cy="20" r="4" fill="#ff4f6a"/></g></svg>',
  pause: '<svg viewBox="0 0 48 48"><rect x="13" y="10" width="8" height="28" rx="3" fill="#fff"/><rect x="27" y="10" width="8" height="28" rx="3" fill="#fff"/></svg>',
  arrow: '<svg viewBox="0 0 48 48"><path d="M24 4l16 20H30v20H18V24H8z" fill="#ffd34a" stroke="#2a0b5c" stroke-width="3" stroke-linejoin="round"/></svg>',
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface HudHandlers {
  pause(): void;
  dig(down: boolean): void;
  use(down: boolean): void;
  jump(down: boolean): void;
  mic(down: boolean): void;
  type(): void;
  book(): void;
  select(i: number): void;
}

export interface HotSlot {
  thumb: string;
  name: string;
  uses: number;
  sel: boolean;
}

const V = new THREE.Vector3();

export class Hud {
  readonly el: HTMLDivElement;
  private mats: HTMLDivElement;
  private matEls = new Map<number, HTMLSpanElement>();
  private status: HTMLDivElement;
  private hot: HTMLDivElement;
  private cross: HTMLDivElement;
  private listenEl: HTMLDivElement;
  private gains: HTMLDivElement;
  private arrow: HTMLDivElement;
  private prog: HTMLDivElement;
  private btns: BoundButton[] = [];
  private lastInv = '';
  private lastHot = '';
  readonly micBtn: HTMLButtonElement;
  readonly digBtn: HTMLButtonElement;
  readonly useBtn: HTMLButtonElement;
  overlay: HTMLDivElement | null = null;
  constructor(
    root: HTMLElement,
    theme: Theme | null,
    private h: HudHandlers,
  ) {
    injectCss();
    const el = document.createElement('div');
    el.className = 'cf-hud';
    el.innerHTML = `
      <div class="cf-top">
        <button class="cf-ib cf-pause" aria-label="${esc(t('cavafala.pause', 'Pausa'))}">${SVG.pause}</button>
        <div class="cf-mats"></div>
      </div>
      <div class="cf-status"></div>
      <div class="cf-cross"><i></i></div>
      <div class="cf-prog"><b></b><span></span></div>
      <div class="cf-gains"></div>
      <div class="cf-arrow">${SVG.arrow}</div>
      <div class="cf-listen"><div class="cf-wave"><i></i><i></i><i></i><i></i><i></i></div><span></span></div>
      <div class="cf-hot"></div>
      <button class="cf-b cf-mic" data-k="mic">${SVG.mic}<small>${esc(t('cavafala.btn.talk', 'FALAR'))}</small></button>
      <button class="cf-b cf-dig" data-k="dig">${SVG.dig}<small>${esc(t('cavafala.btn.dig', 'CAVAR'))}</small></button>
      <button class="cf-b cf-use" data-k="use">${SVG.use}<small>${esc(t('cavafala.btn.use', 'USAR'))}</small></button>
      <button class="cf-b cf-jump" data-k="jump">${SVG.jump}</button>
      <button class="cf-b cf-sm cf-kb" data-k="kb" aria-label="${esc(t('cavafala.btn.type', 'Digitar'))}">${SVG.kb}</button>
      <button class="cf-b cf-sm cf-book" data-k="book" aria-label="${esc(t('cavafala.btn.recipes', 'Receitas'))}">${SVG.book}</button>`;
    root.appendChild(el);
    this.el = el;
    this.mats = el.querySelector('.cf-mats')!;
    for (const m of MATS) {
      const s = document.createElement('span');
      s.className = 'cf-mat';
      s.title = matName(m, theme ?? undefined);
      s.innerHTML = `<i style="--c:${matColor(m, theme ?? undefined)}"></i><b>0</b>`;
      this.mats.appendChild(s);
      this.matEls.set(m, s);
    }
    this.status = el.querySelector('.cf-status')!;
    this.hot = el.querySelector('.cf-hot')!;
    this.cross = el.querySelector('.cf-cross')!;
    this.listenEl = el.querySelector('.cf-listen')!;
    this.gains = el.querySelector('.cf-gains')!;
    this.arrow = el.querySelector('.cf-arrow')!;
    this.prog = el.querySelector('.cf-prog')!;
    this.micBtn = el.querySelector('.cf-mic')!;
    this.digBtn = el.querySelector('.cf-dig')!;
    this.useBtn = el.querySelector('.cf-use')!;
    const b = (sel: string, down: (d: boolean) => void, haptic: 'light' | 'medium' | false = 'light') =>
      this.btns.push(bindButton(el.querySelector(sel)!, { onPress: () => down(true), onRelease: () => down(false), haptic }));
    b('.cf-pause', (d) => d && h.pause());
    b('.cf-dig', (d) => h.dig(d), false);
    b('.cf-use', (d) => h.use(d));
    b('.cf-jump', (d) => h.jump(d));
    b('.cf-mic', (d) => h.mic(d), 'medium');
    b('.cf-kb', (d) => d && h.type());
    b('.cf-book', (d) => d && h.book());
  }

  setInv(inv: Inv, flash?: number): void {
    const key = MATS.map((m) => Math.floor(inv[m] ?? 0)).join(',');
    if (key === this.lastInv && !flash) return;
    this.lastInv = key;
    for (const m of MATS) {
      const s = this.matEls.get(m)!;
      const v = Math.floor(inv[m] ?? 0);
      s.querySelector('b')!.textContent = v > 999 ? Math.floor(v / 100) / 10 + 'k' : String(v);
      s.classList.toggle('z', v <= 0);
      if (flash === m) {
        s.classList.remove('pop');
        void s.offsetWidth;
        s.classList.add('pop');
      }
    }
  }
  setStatus(html: string): void {
    if (this.status.innerHTML !== html) this.status.innerHTML = html;
  }
  setHot(slots: HotSlot[]): void {
    const key = slots.map((s) => s.thumb.length + s.name + s.uses + s.sel).join('|');
    if (key === this.lastHot) return;
    this.lastHot = key;
    this.hot.innerHTML = slots
      .map(
        (s, i) =>
          `<button class="cf-slot${s.sel ? ' on' : ''}" data-i="${i}" aria-label="${esc(s.name)}"><img src="${s.thumb}" alt=""/>${s.uses > 0 ? `<em>${s.uses}</em>` : ''}<kbd>${i + 1}</kbd></button>`,
      )
      .join('');
    this.hot.querySelectorAll<HTMLButtonElement>('.cf-slot').forEach((b) =>
      bindButton(b, {
        onPress: () => this.h.select(+b.dataset.i!),
      }),
    );
  }
  setCross(state: 'none' | 'dig' | 'far' | 'aim'): void {
    this.cross.className = 'cf-cross ' + state;
  }
  setUseLabel(txt: string, on: boolean): void {
    const s = this.useBtn.querySelector('small')!;
    if (s.textContent !== txt) s.textContent = txt;
    this.useBtn.classList.toggle('off', !on);
  }
  /** barrinha de progresso do prédio mirado */
  setProgress(name: string | null, v = 0): void {
    if (!name) {
      this.prog.classList.remove('on');
      return;
    }
    this.prog.classList.add('on');
    (this.prog.querySelector('b') as HTMLElement).style.width = Math.round(v * 100) + '%';
    const sp = this.prog.querySelector('span')!;
    const txt = `${name} · ${Math.round(v * 100)}%`;
    if (sp.textContent !== txt) sp.textContent = txt;
  }
  gain(text: string, col: string): void {
    const d = document.createElement('div');
    d.className = 'cf-gain';
    d.style.setProperty('--c', col);
    d.textContent = text;
    this.gains.appendChild(d);
    while (this.gains.children.length > 4) this.gains.firstElementChild!.remove();
    setTimeout(() => d.remove(), 1100);
  }
  listening(on: boolean, text = ''): void {
    this.listenEl.classList.toggle('on', on);
    this.micBtn.classList.toggle('rec', on);
    const s = this.listenEl.querySelector('span')!;
    s.textContent = text || t('cavafala.listening', 'Ouvindo... diga o que você quer criar!');
  }
  /** seta do tutorial: aponta o alvo (no mundo) ou some */
  pointAt(target: THREE.Vector3 | null, cam: THREE.PerspectiveCamera, w: number, h: number): void {
    if (!target) {
      this.arrow.classList.remove('on');
      return;
    }
    this.arrow.classList.add('on');
    V.copy(target).project(cam);
    const behind = V.z > 1;
    let x = V.x,
      y = V.y;
    if (behind) {
      x = -x;
      y = -y;
    }
    const inside = !behind && Math.abs(x) < 0.85 && Math.abs(y) < 0.8;
    if (inside) {
      const px = ((x + 1) / 2) * w,
        py = ((1 - y) / 2) * h;
      this.arrow.style.transform = `translate(${px - 22}px, ${py - 70}px) rotate(180deg)`;
      this.arrow.classList.add('bob');
    } else {
      const a = Math.atan2(-y, x);
      const R = Math.min(w, h) * 0.36;
      const px = w / 2 + Math.cos(a) * R,
        py = h / 2 + Math.sin(a) * R;
      this.arrow.style.transform = `translate(${px - 22}px, ${py - 22}px) rotate(${a + Math.PI / 2}rad)`;
      this.arrow.classList.remove('bob');
    }
  }
  /** painel modal (digitar / receitas / pausa / fim) */
  panel(html: string, cls = ''): HTMLDivElement {
    this.closePanel();
    const d = document.createElement('div');
    d.className = 'cf-panel ' + cls;
    d.dataset.touchIgnore = '';
    d.innerHTML = html;
    this.el.appendChild(d);
    this.overlay = d;
    return d;
  }
  closePanel(): void {
    this.overlay?.remove();
    this.overlay = null;
  }
  /** chips de custo (verde = tem, vermelho = falta) */
  static costChips(g: GDef, mods: Mods, inv: Inv, th: Theme | null): string {
    const c = costOf(g, mods);
    return Object.entries(c)
      .map(([k, v]) => {
        const ok = (inv[+k] ?? 0) >= v;
        return `<span class="cf-cost${ok ? '' : ' no'}"><i style="--c:${matColor(+k, th ?? undefined)}"></i>${v} ${esc(matName(+k, th ?? undefined))}</span>`;
      })
      .join('');
  }
  show(on: boolean): void {
    this.el.classList.toggle('hidden', !on);
  }
  dispose(): void {
    this.btns.forEach((b) => b.destroy());
    this.el.remove();
  }
}
