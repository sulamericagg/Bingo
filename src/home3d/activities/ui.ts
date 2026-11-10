/* ============================================================
 *  CASA 3D · ATIVIDADES — interface discreta:
 *  - dica pequena no topo (não cobre o meio da tela)
 *  - cartão do prato (nome + estrelas + moedas)
 *  - barrinhas de necessidades + chips "Receitas" / "Festa"
 *  - fileira de escolha (geladeira, horta, enfeites)
 *  - livro de receitas, polaroide da selfie, tela escura (dormir/banho)
 * ============================================================ */
import { t } from '../../i18n';
import { el, esc } from '../ui';
import { AS } from './store';
import { ING, RECIPES, stars as starStr } from './data';

const CSS = `
.ha-hint{position:absolute;left:50%;top:calc(max(8px,env(safe-area-inset-top)) + 50px);transform:translateX(-50%) translateY(-6px);font:700 12.5px/1.25 system-ui,sans-serif;color:#fff;background:#2a0b5ccc;padding:5px 12px;border-radius:999px;pointer-events:none;opacity:0;transition:opacity .25s,transform .25s;white-space:nowrap;max-width:70vw;overflow:hidden;text-overflow:ellipsis;z-index:3}
.ha-hint.on{opacity:1;transform:translateX(-50%) translateY(0)}
.ha-hint.warn{background:#d8322ee6}
.ha-card{position:absolute;left:50%;top:calc(max(8px,env(safe-area-inset-top)) + 80px);transform:translateX(-50%) scale(.85);background:#fff;color:#2a0b5c;border-radius:14px;padding:6px 14px 7px;box-shadow:0 0 0 3px #2a0b5c inset,0 5px 0 #2a0b5c44;text-align:center;opacity:0;transition:all .22s;pointer-events:none;z-index:3;max-width:72vw}
.ha-card.on{opacity:1;transform:translateX(-50%) scale(1)}
.ha-card b{display:block;font:800 15px/1.2 system-ui,sans-serif}
.ha-card i{font-style:normal;color:#ffb300;font-size:15px;letter-spacing:1px}
.ha-card small{display:block;font:700 11px system-ui,sans-serif;color:#7a5ca8}
.ha-side{position:absolute;align-items:flex-start;left:max(10px,env(safe-area-inset-left));top:calc(max(8px,env(safe-area-inset-top)) + 52px);display:flex;flex-direction:column;gap:5px;pointer-events:none;z-index:2}
.ha-needs{display:flex;gap:4px;background:#2a0b5c99;border-radius:10px;padding:4px 6px}
.ha-need{width:24px;display:flex;flex-direction:column;align-items:center;gap:2px;font:800 9px system-ui,sans-serif;color:#fff}
.ha-need span{font-size:12px;line-height:1}
.ha-need u{display:block;width:22px;height:4px;border-radius:2px;background:#ffffff33;overflow:hidden}
.ha-need u s{display:block;height:100%;background:#4fd67a;transition:width .4s}
.ha-need.low u s{background:#ff5c7a}
.ha-chip{pointer-events:auto;border:0;border-radius:10px;background:#fff;color:#2a0b5c;font:800 11.5px system-ui,sans-serif;padding:5px 9px;box-shadow:0 3px 0 #2a0b5c55;text-align:left;cursor:pointer}
.ha-chip.hot{background:#ffd84a}
.ha-pick{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);display:flex;gap:6px;max-width:calc(100vw - 230px);overflow-x:auto;padding:6px 8px;background:#2a0b5cdd;border-radius:16px;z-index:4;scrollbar-width:none}
.ha-pick::-webkit-scrollbar{display:none}
.ha-pick button{flex:0 0 auto;border:0;border-radius:12px;background:#fff;color:#2a0b5c;font:800 11px system-ui,sans-serif;padding:5px 8px 5px 6px;display:flex;align-items:center;gap:5px;cursor:pointer}
.ha-pick button i{width:14px;height:14px;border-radius:50%;box-shadow:0 0 0 2px #2a0b5c33 inset;display:block}
.ha-pick button.x{background:#ff5c7a;color:#fff}
.ha-modal{position:absolute;inset:0;background:#1a0840aa;display:flex;align-items:center;justify-content:center;z-index:20}
.ha-book{background:#fff7ea;color:#2a0b5c;border-radius:18px;box-shadow:0 0 0 4px #2a0b5c inset;padding:12px 14px;width:min(640px,92vw);max-height:84vh;display:flex;flex-direction:column}
.ha-book h3{margin:0 0 6px;font:900 17px system-ui,sans-serif;display:flex;justify-content:space-between;align-items:center}
.ha-book h3 button{border:0;background:#2a0b5c;color:#fff;border-radius:10px;font:800 12px system-ui,sans-serif;padding:5px 10px}
.ha-grid{overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:6px}
.ha-rec{background:#fff;border-radius:10px;padding:5px 8px;box-shadow:0 0 0 2px #2a0b5c22 inset;font:700 11px system-ui,sans-serif}
.ha-rec b{display:block;font:800 12.5px system-ui,sans-serif}
.ha-rec i{font-style:normal;color:#ffb300}
.ha-rec.no{background:#efe6ff;color:#7a5ca8}
.ha-rec.no b{color:#5a3d8a}
.ha-polar{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-3deg) scale(.6);background:#fff;padding:8px 8px 26px;border-radius:4px;box-shadow:0 10px 30px #0008;opacity:0;transition:all .35s cubic-bezier(.3,1.6,.6,1);pointer-events:none;z-index:15;text-align:center;font:800 12px system-ui,sans-serif;color:#2a0b5c}
.ha-polar.on{opacity:1;transform:translate(-50%,-50%) rotate(-3deg) scale(1)}
.ha-polar img{display:block;width:min(46vw,300px);border-radius:2px}
.ha-fade{position:absolute;inset:0;background:#120630;opacity:0;transition:opacity .6s;pointer-events:none;z-index:14;display:flex;align-items:center;justify-content:center;color:#fff;font:900 22px system-ui,sans-serif}
.ha-fade.on{opacity:.92}
.ha-flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:16;transition:opacity .5s}
.ha-party{pointer-events:auto;background:#fff;color:#2a0b5c;border-radius:12px;padding:6px 8px;box-shadow:0 3px 0 #2a0b5c55;font:700 11px system-ui,sans-serif;display:flex;flex-direction:column;gap:3px;min-width:132px}
.ha-party b{font:900 12px system-ui,sans-serif}
.ha-party .ok{color:#2f9e44}
.ha-party .ok:before{content:'✔ '}
.ha-party .no:before{content:'○ ';color:#b6a6d8}
.ha-party .row{display:flex;gap:4px;flex-wrap:wrap;margin-top:2px}
.ha-party button{border:0;border-radius:8px;background:#efe6ff;color:#2a0b5c;font:800 10.5px system-ui,sans-serif;padding:4px 6px}
.ha-party button.go{background:#ff5c7a;color:#fff;width:100%;font-size:12px;padding:6px}
.ha-party button.go[disabled]{opacity:.45}
@media (max-height:420px){.ha-side{top:calc(max(6px,env(safe-area-inset-top)) + 46px)}.ha-hint{top:calc(max(6px,env(safe-area-inset-top)) + 46px)}}
`;
let cssEl: HTMLStyleElement | null = null;

export interface PickItem {
  id: string;
  label: string;
  color?: string;
}

export class ActUI {
  readonly hintEl: HTMLDivElement;
  readonly card: HTMLDivElement;
  readonly side: HTMLDivElement;
  readonly needs: HTMLDivElement;
  readonly chips: HTMLDivElement;
  readonly partyBox: HTMLDivElement;
  private pick: HTMLDivElement | null = null;
  private modal: HTMLDivElement | null = null;
  private hintT = 0;
  private hintPri = 0;
  private cardT = 0;
  private fadeEl: HTMLDivElement;
  private polar: HTMLDivElement;
  private flashEl: HTMLDivElement;
  onBook?: () => void;
  onParty?: () => void;

  constructor(readonly layer: HTMLElement) {
    if (!cssEl) {
      cssEl = document.createElement('style');
      cssEl.textContent = CSS;
      document.head.appendChild(cssEl);
    }
    this.hintEl = el('div', 'ha-hint');
    this.card = el('div', 'ha-card');
    this.side = el('div', 'ha-side');
    this.needs = el('div', 'ha-needs');
    this.chips = el('div', '');
    this.chips.style.cssText = 'display:flex;gap:5px';
    this.partyBox = el('div', 'ha-party');
    this.partyBox.style.display = 'none';
    const bookB = el('button', 'ha-chip', esc(t('act.ui.book', 'Receitas')));
    bookB.onclick = (e) => (e.stopPropagation(), this.onBook?.());
    const partyB = el('button', 'ha-chip', esc(t('act.ui.party', 'Festa')));
    partyB.onclick = (e) => (e.stopPropagation(), this.onParty?.());
    this.chips.append(bookB, partyB);
    this.side.append(this.needs, this.chips, this.partyBox);
    this.fadeEl = el('div', 'ha-fade');
    this.polar = el('div', 'ha-polar');
    this.flashEl = el('div', 'ha-flash');
    layer.append(this.hintEl, this.card, this.side, this.fadeEl, this.polar, this.flashEl);
    for (const k of ['food', 'hyg', 'energy', 'fun'] as const) {
      const n = el('div', 'ha-need', `<span>${({ food: '🍽', hyg: '🫧', energy: '⚡', fun: '★' } as Record<string, string>)[k]}</span><u><s></s></u>`);
      n.dataset.k = k;
      n.title = needName(k);
      this.needs.appendChild(n);
    }
  }
  /** dica pequena no topo. pri maior não é sobrescrita por menor enquanto aparece */
  hint(text: string, ms = 2200, pri = 0, warn = false): void {
    if (this.hintT > 0 && pri < this.hintPri) return;
    this.hintEl.textContent = text;
    this.hintEl.classList.add('on');
    this.hintEl.classList.toggle('warn', warn);
    this.hintT = ms / 1000;
    this.hintPri = pri;
  }
  showCard(title: string, nStars: number, sub: string, ms = 3200): void {
    this.card.innerHTML = `<b>${esc(title)}</b>${nStars ? `<i>${starStr(nStars)}</i>` : ''}${sub ? `<small>${esc(sub)}</small>` : ''}`;
    this.card.classList.add('on');
    this.cardT = ms / 1000;
  }
  update(dt: number): void {
    if (this.hintT > 0) {
      this.hintT -= dt;
      if (this.hintT <= 0) this.hintEl.classList.remove('on');
    }
    if (this.cardT > 0) {
      this.cardT -= dt;
      if (this.cardT <= 0) this.card.classList.remove('on');
    }
  }
  setNeeds(): void {
    for (const n of Array.from(this.needs.children) as HTMLElement[]) {
      const v = AS.needs[n.dataset.k as 'food'];
      (n.querySelector('s') as HTMLElement).style.width = Math.round(v) + '%';
      n.classList.toggle('low', v < 25);
    }
  }
  setVisible(on: boolean): void {
    this.side.style.display = on ? '' : 'none';
    if (!on) this.closePick();
  }
  /* ---------- fileira de escolha ---------- */
  openPick(items: PickItem[], onPick: (id: string) => void): void {
    this.closePick();
    const box = el('div', 'ha-pick');
    for (const it of items) {
      const b = el('button', '', `${it.color ? `<i style="background:${it.color}"></i>` : ''}${esc(it.label)}`);
      b.onpointerdown = (e) => e.stopPropagation();
      b.onclick = (e) => {
        e.stopPropagation();
        onPick(it.id);
      };
      box.appendChild(b);
    }
    const x = el('button', 'x', '✕');
    x.onpointerdown = (e) => e.stopPropagation();
    x.onclick = (e) => (e.stopPropagation(), this.closePick());
    box.appendChild(x);
    this.layer.appendChild(box);
    this.pick = box;
  }
  closePick(): void {
    this.pick?.remove();
    this.pick = null;
  }
  get picking(): boolean {
    return !!this.pick;
  }
  /* ---------- livro de receitas ---------- */
  openBook(): void {
    this.closeModal();
    const m = el('div', 'ha-modal');
    const found = RECIPES.filter((r) => AS.book[r.id]).length;
    const box = el('div', 'ha-book');
    const h = el('h3', '', `<span>${esc(t('act.book.title', 'Livro de receitas'))} · ${found}/${RECIPES.length}</span>`);
    const close = el('button', '', esc(t('act.book.close', 'Fechar')));
    close.onclick = () => this.closeModal();
    h.appendChild(close);
    const grid = el('div', 'ha-grid');
    for (const r of RECIPES) {
      const b = AS.book[r.id];
      const c = el('div', 'ha-rec' + (b ? '' : ' no'));
      c.innerHTML = b ? `<b>${esc(r.name())}</b><i>${starStr(b.stars)}</i> ×${b.n}<br>${esc(r.hint())}` : `<b>???</b>${esc(t('act.book.tip', 'Dica: {h}', { h: r.hint() }))}`;
      grid.appendChild(c);
    }
    const foot = el('div', '');
    foot.style.cssText = 'font:700 11px system-ui,sans-serif;color:#7a5ca8;margin-top:6px';
    foot.textContent = t('act.book.foot', 'Pratos servidos: {n} · Invenções malucas: {f}', { n: AS.dishes, f: AS.funny });
    box.append(h, grid, foot);
    m.appendChild(box);
    m.onpointerdown = (e) => {
      e.stopPropagation();
      if (e.target === m) this.closeModal();
    };
    this.layer.appendChild(m);
    this.modal = m;
  }
  closeModal(): void {
    this.modal?.remove();
    this.modal = null;
  }
  get modalOpen(): boolean {
    return !!this.modal;
  }
  /* ---------- efeitos de tela ---------- */
  fade(text: string, ms: number): Promise<void> {
    this.fadeEl.textContent = text;
    this.fadeEl.classList.add('on');
    return new Promise((r) =>
      setTimeout(() => {
        this.fadeEl.classList.remove('on');
        r();
      }, ms),
    );
  }
  flash(): void {
    this.flashEl.style.transition = 'none';
    this.flashEl.style.opacity = '1';
    requestAnimationFrame(() => {
      this.flashEl.style.transition = 'opacity .6s';
      this.flashEl.style.opacity = '0';
    });
  }
  photo(url: string, caption: string): void {
    this.polar.innerHTML = `<img alt="" src="${url}"><div style="margin-top:6px">${esc(caption)}</div>`;
    this.polar.classList.add('on');
    setTimeout(() => this.polar.classList.remove('on'), 2600);
  }
  dispose(): void {
    this.closePick();
    this.closeModal();
    for (const e of [this.hintEl, this.card, this.side, this.fadeEl, this.polar, this.flashEl]) e.remove();
    cssEl?.remove();
    cssEl = null;
  }
}
export function needName(k: string): string {
  return k === 'food' ? t('act.need.food', 'Fome') : k === 'hyg' ? t('act.need.hyg', 'Higiene') : k === 'energy' ? t('act.need.energy', 'Energia') : t('act.need.fun', 'Diversão');
}
export function ingColor(id: string): string {
  return ING.get(id)?.skin ?? '#ffffff';
}
