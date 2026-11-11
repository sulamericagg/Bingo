/* ============================================================
 *  NOITES · CONSTRUÇÃO — interface de toque (DOM).
 *  Botão grande de construir → paleta de peças (ícones grandes,
 *  custo em fichas) → modo construção com ✓ (toque = uma peça;
 *  segurar e virar/andar = fila), girar, sair, peça atual, grade/livre.
 * ============================================================ */
import './build.css';
import { t } from '../../../i18n';
import { bindButton, type BoundButton } from '../../../ui/touch';
import { resName, type Res } from '../data';
import { speak } from '../speak';
import { bic } from './icons';
import { GROUPS, PIECE, costText, type Cost, type PK } from './pieces';

export type Tool = 'del' | 'fix' | 'up';
export interface BuildUICb {
  toggle(): void;
  pick(id: PK | Tool): void;
  confirmDown(): void;
  confirmUp(): void;
  rotate(): void;
  exit(): void;
  free(): void;
  palette(on: boolean): void;
}
export interface CardInfo {
  /** pode pagar */
  ok: boolean;
  /** travado pela bancada */
  lock: number;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
export function chips(c: Cost, have?: (r: Res) => number, mul = 1): string {
  return costText(c, mul)
    .map(([r, n]) => `<span class="nb-chip ${have && have(r) < n ? 'no' : ''}">${bic(r, 16)}${n}</span>`)
    .join('');
}
export const TOOL_ICON: Record<Tool, string> = { del: 'demolish', fix: 'repair', up: 'upgrade' };
export function toolName(k: Tool): string {
  return k === 'del' ? t('nbuild.t.del', 'Desmontar') : k === 'fix' ? t('nbuild.t.fix', 'Consertar') : t('nbuild.t.up', 'Melhorar');
}
export function toolSay(k: Tool): string {
  return k === 'del' ? t('nbuild.s.del', 'Desmontar: toque na peça. Volta metade do material.') : k === 'fix' ? t('nbuild.s.fix', 'Consertar: toque na peça quebrada. Gasta um pouco de lenha.') : t('nbuild.s.up', 'Melhorar: madeira vira cerca reforçada, e depois muro de pedra!');
}

export class BuildUI {
  root: HTMLDivElement;
  private q = <T extends HTMLElement>(s: string) => this.root.querySelector(s) as T;
  private bound: BoundButton[] = [];
  private pal: HTMLDivElement | null = null;
  private last: Record<string, string> = {};

  constructor(
    private wrap: HTMLElement,
    private cb: BuildUICb,
  ) {
    const el = document.createElement('div');
    el.className = 'nb-ui';
    el.innerHTML = `
      <button class="nc-btn round gold nb-toggle" data-b="toggle" data-say="${esc(t('nbuild.say.build', 'Construir'))}">${bic('build', 40)}</button>
      <div class="nb-bar">
        <div class="nb-info" data-v="info"></div>
        <div class="nb-col">
          <button class="nc-btn round nb-free" data-b="free" hidden data-say="${esc(t('nbuild.say.free', 'Grade ou livre'))}"><span data-v="free">${bic('grid', 30)}</span></button>
          <button class="nc-btn round nb-cur" data-b="cur" data-say="${esc(t('nbuild.say.pieces', 'Escolher peça'))}"><span data-v="cur"></span></button>
        </div>
        <div class="nb-row">
          <button class="nc-btn round red" data-b="exit" data-say="${esc(t('nbuild.say.exit', 'Parar de construir'))}">${bic('close', 34)}</button>
          <button class="nc-btn round dark" data-b="rot" data-say="${esc(t('noites.say.rotate', 'Girar'))}">${bic('rotate', 34)}</button>
          <button class="nc-btn round green nb-ok" data-b="ok"><span data-v="okI">${bic('check', 50, '#0a3a1a')}</span><b data-v="okN"></b></button>
        </div>
      </div>`;
    wrap.appendChild(el);
    this.root = el;
    const btn = (sel: string, o: { press?: () => void; release?: () => void; haptic?: 'light' | 'medium' | 'heavy' | false }) => {
      const b = this.q(sel);
      this.bound.push(
        bindButton(b, {
          onPress: () => {
            const s = b.dataset.say;
            if (s) speak(s, { cool: 6000 });
            o.press?.();
          },
          onRelease: o.release ? () => o.release!() : undefined,
          haptic: o.haptic,
        }),
      );
    };
    btn('[data-b="toggle"]', { press: () => cb.toggle(), haptic: 'medium' });
    btn('[data-b="exit"]', { press: () => cb.exit() });
    btn('[data-b="rot"]', { press: () => cb.rotate() });
    btn('[data-b="cur"]', { press: () => cb.palette(true) });
    btn('[data-b="free"]', { press: () => cb.free() });
    btn('[data-b="ok"]', { press: () => cb.confirmDown(), release: () => cb.confirmUp(), haptic: false });
  }

  private set(k: string, v: string, f: () => void): void {
    if (this.last[k] === v) return;
    this.last[k] = v;
    f();
  }
  /** botão de construir visível (fora de veículo/bancada) */
  showToggle(on: boolean): void {
    this.set('tog', String(on), () => (this.q('[data-b="toggle"]').hidden = !on));
  }
  setActive(on: boolean): void {
    this.set('act', String(on), () => {
      this.root.classList.toggle('on', on);
      this.wrap.classList.toggle('nb-on', on);
    });
  }
  /** peça/ferramenta atual no botão */
  setCurrent(icon: string, col: string, rotOk: boolean, freeOk: boolean, free: boolean, mode: string): void {
    this.set('cur', icon + col + rotOk + freeOk + free + mode, () => {
      this.q('[data-v="cur"]').innerHTML = bic(icon, 38, col);
      this.q('[data-b="rot"]').classList.toggle('dim', !rotOk);
      this.q('[data-b="free"]').hidden = !freeOk;
      this.q('[data-v="free"]').innerHTML = bic(free ? 'free' : 'grid', 30);
      const ok = this.q('[data-b="ok"]');
      ok.classList.toggle('red', mode === 'del');
      ok.classList.toggle('gold', mode === 'fix' || mode === 'up');
      ok.classList.toggle('green', mode === 'place');
      this.q('[data-v="okI"]').innerHTML = mode === 'place' ? bic('check', 50, '#0a3a1a') : bic(mode === 'del' ? 'demolish' : mode === 'fix' ? 'repair' : 'upgrade', 52);
    });
  }
  /** texto/fichas acima do ✓ e contador no ✓ */
  setInfo(html: string, bad: boolean, n: string): void {
    this.set('info', html + bad, () => {
      const el = this.q('[data-v="info"]');
      el.innerHTML = html;
      el.classList.toggle('bad', bad);
      el.hidden = !html;
    });
    this.set('n', n, () => (this.q('[data-v="okN"]').textContent = n));
  }
  pressOk(on: boolean): void {
    this.q('[data-b="ok"]').classList.toggle('hold', on);
  }

  /* ------------------------------ paleta ------------------------------ */
  get paletteOpen(): boolean {
    return !!this.pal;
  }
  openPalette(info: (id: PK) => CardInfo, have: (r: Res) => number, sel: string): void {
    this.closePalette();
    const p = document.createElement('div');
    p.className = 'nb-pal';
    const card = (id: PK) => {
      const d = PIECE[id];
      const ci = info(id);
      return `<button class="nb-card ${ci.ok ? 'ok' : ''} ${sel === id ? 'sel' : ''}" data-id="${id}" data-say="${esc(d.say())}">
        ${ci.lock ? `<i class="lock">${bic('lock', 18)}<small>${ci.lock}</small></i>` : ''}
        ${bic(d.icon, 40, d.icon === 'torch' || d.icon === 'fire' || d.icon === 'chest' || d.icon === 'bed' || d.icon === 'bench' ? d.col : '')}
        <span class="nm">${esc(d.n())}</span><span class="cost">${chips(d.cost, have)}</span></button>`;
    };
    const tool = (k: Tool) => `<button class="nb-card tool ${sel === k ? 'sel' : ''}" data-id="${k}" data-say="${esc(toolSay(k))}">${bic(TOOL_ICON[k], 40)}<span class="nm">${esc(toolName(k))}</span></button>`;
    p.innerHTML = `<div class="nb-pbox">
      <button class="nc-btn round red nb-pclose" data-id="close" data-say="${esc(t('noites.say.back', 'Voltar'))}">${bic('close', 26)}</button>
      ${GROUPS.map((g) => `<div class="nb-grp"><span class="gt" title="${esc(g.n())}">${bic(g.k === 'def' ? 'shield' : 'tent', 26)}</span><div class="nb-cards">${g.ids.map(card).join('')}</div></div>`).join('')}
      <div class="nb-grp"><span class="gt" title="${esc(t('nbuild.g.tools', 'Ferramentas'))}">${bic('hammer', 26)}</span><div class="nb-cards">${(['fix', 'up', 'del'] as Tool[]).map(tool).join('')}</div></div>
    </div>`;
    this.wrap.appendChild(p);
    this.pal = p;
    p.addEventListener('pointerdown', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-id]');
      e.stopPropagation();
      if (!b) {
        if (e.target === p) this.cb.palette(false);
        return;
      }
      const s = b.dataset.say;
      if (s) speak(s, { cool: 800, urgent: true });
      if (b.dataset.id === 'close') this.cb.palette(false);
      else this.cb.pick(b.dataset.id as PK | Tool);
    });
  }
  closePalette(): void {
    this.pal?.remove();
    this.pal = null;
  }

  destroy(): void {
    this.bound.forEach((b) => b.destroy());
    this.closePalette();
    this.wrap.classList.remove('nb-on');
    this.root.remove();
  }
}

/** nome curto de recurso (texto de apoio) */
export const rname = (r: Res) => resName(r);
