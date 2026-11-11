/* ============================================================
 *  BOTÃO DA MÃO (kit de interação 3D): HUD mínimo.
 *  UM botão grande cujo verbo muda com o que você mira/segura
 *  ("Abrir", "Pegar tomate", "Cortar", "Ligar o fogo", "Entregar")
 *  + um pequeno opcional + JOGAR (segurar carrega a força).
 *  O verbo é decidido por regras puras (resolveVerb) — fácil de testar
 *  e de reaproveitar em outro modo.
 * ============================================================ */
import { bindButton, type BoundButton } from '../../../ui/touch';
import { IX_ICON } from './icons';

export interface VerbDef {
  id: string;
  label: string;
  /** chave de IX_ICON ou SVG pronto */
  icon: string;
  /** segurar faz efeito contínuo (cortar, esfregar, apagar) */
  hold?: boolean;
  /** apagado: nada útil aqui (ainda aperta) */
  dim?: boolean;
}

/** regra: a primeira cujo `when` é verdadeiro decide o verbo */
export interface VerbRule<C> {
  when: (c: C) => boolean;
  verb: (c: C) => VerbDef;
}
export function resolveVerb<C>(ctx: C, rules: VerbRule<C>[], fallback: VerbDef): VerbDef {
  for (const r of rules) if (r.when(ctx)) return r.verb(ctx);
  return fallback;
}

const CSS = `
.ix-hb{position:absolute;right:calc(var(--edge-r,12px) + 12px);bottom:calc(var(--edge-b,12px) + 16px);display:flex;flex-direction:row-reverse;align-items:flex-end;gap:10px;z-index:4;pointer-events:none}
.ix-hb button{pointer-events:auto;border:0;font:700 14px/1 var(--font,'Fredoka',system-ui,sans-serif);color:#2a0b5c;display:flex;align-items:center;justify-content:center;gap:7px;box-shadow:0 3px 0 #2a0b5c55,0 0 0 3px #2a0b5c inset;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
.ix-hb svg{width:24px;height:24px;flex:none}
.ix-main{height:62px;min-width:118px;max-width:220px;padding:0 18px 0 8px;border-radius:31px;background:rgba(255,216,74,.92)}
.ix-main .ic{width:44px;height:44px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 2px #2a0b5c inset}
.ix-main .lb{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ix-main.dim{background:rgba(255,255,255,.55);opacity:.7}
.ix-main.glow{animation:ixGlow .6s infinite alternate;box-shadow:0 0 0 3px #2a0b5c inset,0 0 0 4px #3effa0,0 0 18px #3effa0}
@keyframes ixGlow{to{transform:scale(1.07)}}
.ix-main.pop{animation:ixPop .22s ease-out}
@keyframes ixPop{0%{transform:scale(.86)}60%{transform:scale(1.08)}100%{transform:none}}
.ix-alt{width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,.78);font-size:9px!important;flex-direction:column!important;gap:1px!important}
.ix-alt svg{width:20px;height:20px}
.ix-thr{width:58px;height:58px;border-radius:50%;background:rgba(255,155,190,.9);position:relative;font-size:10px!important;flex-direction:column!important;gap:1px!important;margin-bottom:46px}
.ix-thr svg{width:22px;height:22px}
.ix-thr i{position:absolute;inset:-5px;border-radius:50%;background:conic-gradient(#ff3e6a calc(var(--p,0)*1turn),transparent 0);-webkit-mask:radial-gradient(circle,transparent 31px,#000 32px);mask:radial-gradient(circle,transparent 31px,#000 32px);pointer-events:none}
.ix-hb .hid{display:none}
.ix-hb button.tc-pressed{transform:scale(.9)}
`;
let cssDone = false;

export class HandButtons {
  readonly box: HTMLDivElement;
  private main: HTMLButtonElement;
  private alt: HTMLButtonElement;
  private thr: HTMLButtonElement;
  private bm: BoundButton;
  private ba: BoundButton;
  private bt: BoundButton;
  private sigM = '';
  private sigA = '';
  private cur: VerbDef | null = null;
  private curAlt: VerbDef | null = null;
  private pct = -1;
  /** toque no botão principal (id do verbo atual) */
  onMain?: (id: string) => void;
  onAlt?: (id: string) => void;
  /** soltou o JOGAR */
  onThrowRelease?: () => void;
  constructor(layer: HTMLElement, throwLabel: string) {
    if (!cssDone) {
      cssDone = true;
      const s = document.createElement('style');
      s.textContent = CSS;
      document.head.appendChild(s);
    }
    this.box = document.createElement('div');
    this.box.className = 'ix-hb';
    this.box.dataset.touchIgnore = '';
    this.main = document.createElement('button');
    this.main.className = 'ix-main';
    this.main.innerHTML = '<span class="ic"></span><span class="lb"></span>';
    this.alt = document.createElement('button');
    this.alt.className = 'ix-alt hid';
    this.thr = document.createElement('button');
    this.thr.className = 'ix-thr hid';
    this.thr.innerHTML = `<i></i>${IX_ICON.throw}<span>${throwLabel}</span>`;
    this.box.append(this.main, this.alt, this.thr);
    layer.appendChild(this.box);
    this.bm = bindButton(this.main, { onPress: () => this.cur && this.onMain?.(this.cur.id) });
    this.ba = bindButton(this.alt, { onPress: () => this.curAlt && this.onAlt?.(this.curAlt.id) });
    this.bt = bindButton(this.thr, { onRelease: () => this.onThrowRelease?.() });
  }
  get mainHeld(): boolean {
    return this.bm.held;
  }
  get throwHeld(): boolean {
    return this.bt.held;
  }
  get verb(): VerbDef | null {
    return this.cur;
  }
  set(main: VerbDef, alt: VerbDef | null, canThrow: boolean): void {
    this.cur = main;
    this.curAlt = alt;
    const sm = main.id + '|' + main.label + '|' + main.icon + (main.dim ? 'd' : '');
    if (sm !== this.sigM) {
      const swap = this.sigM.split('|')[0] !== main.id;
      this.sigM = sm;
      (this.main.firstElementChild as HTMLElement).innerHTML = IX_ICON[main.icon] ?? main.icon;
      (this.main.lastElementChild as HTMLElement).textContent = main.label;
      this.main.classList.toggle('dim', !!main.dim);
      if (swap) {
        this.main.classList.remove('pop');
        void this.main.offsetWidth;
        this.main.classList.add('pop');
      }
    }
    const sa = alt ? alt.id + alt.label : '';
    if (sa !== this.sigA) {
      this.sigA = sa;
      this.alt.classList.toggle('hid', !alt);
      if (alt) this.alt.innerHTML = `${IX_ICON[alt.icon] ?? alt.icon}<span>${alt.label}</span>`;
    }
    if (this.thr.classList.contains('hid') === canThrow) {
      this.thr.classList.toggle('hid', !canThrow);
      if (!canThrow) this.bt.release();
    }
  }
  /** brilho "aperte aqui" (dica) */
  glow(on: boolean): void {
    if (this.main.classList.contains('glow') !== on) this.main.classList.toggle('glow', on);
  }
  /** anel de força do JOGAR 0..1 (<0 esconde) */
  charge(k: number): void {
    const p = k < 0 ? 0 : Math.round(k * 20) / 20;
    if (p === this.pct) return;
    this.pct = p;
    this.thr.style.setProperty('--p', String(p));
  }
  show(on: boolean): void {
    this.box.style.display = on ? '' : 'none';
    if (!on) {
      this.bm.release();
      this.bt.release();
    }
  }
  dispose(): void {
    this.bm.destroy();
    this.ba.destroy();
    this.bt.destroy();
    this.box.remove();
  }
}
