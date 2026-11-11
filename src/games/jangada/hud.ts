/* ============================================================
 *  JANGADA BLOOP — HUD (DOM): topo mínimo (pausa, dia, câmera),
 *  objetivos que se recolhem sozinhos, mira + dica, barras em cima
 *  da barra de atalhos, paleta de construção com "tenho/preciso",
 *  botões grandes à direita (ação, usar, pular, mergulhar), pesca,
 *  oficina (grade com abas), baú, faixas e efeitos de tela.
 *  Tudo por ícones (crianças que ainda não leem) + texto curto.
 * ============================================================ */
import { t } from '../../i18n';
import { bindButton, type BoundButton } from '../../ui/touch';
import { BUILD_ORDER, COOK_LIST, FIRE_MAX, FIRE_UP, ITEM, PIECE, RECIPES, bagHas, itemName, type Bag, type Cat, type ItemId, type PK, type Recipe } from './data';
import { jIcon } from './icons';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface HudCb {
  pause(): void;
  cam(): void;
  craft(): void;
  select(i: number): void;
  action(down: boolean): void;
  use(): void;
  jump(down: boolean): void;
  dive(down: boolean): void;
  rotate(): void;
  cancel(): void;
  pick(k: PK | 'trash'): void;
}
export interface HotItem {
  id: ItemId;
  n: number;
}
export interface MisView {
  icon: string;
  txt: string;
  n: number;
  of: number;
  daily?: boolean;
}

/** chips de custo: verde = tenho, vermelho = falta */
export function costChips(cost: Bag, have: Bag, size = 18): string {
  return Object.entries(cost)
    .map(([id, n]) => {
      const h = have[id as ItemId] ?? 0;
      const ok = h >= (n ?? 0);
      return `<span class="jg-chip ${ok ? 'ok' : 'no'}" title="${esc(itemName(id as ItemId))}">${jIcon(id, size)}${Math.min(h, 99)}/${n}</span>`;
    })
    .join('');
}

export class Hud {
  readonly el: HTMLDivElement;
  private q: <T extends HTMLElement>(s: string) => T;
  private hot: HTMLDivElement;
  private pal: HTMLDivElement;
  private cost: HTMLDivElement;
  private objEl: HTMLDivElement;
  private objT = 0;
  private binds: BoundButton[] = [];
  overlay: HTMLDivElement | null = null;
  private hotKey = '';
  private palKey = '';
  private misKey = '';
  private dayKey = '';
  private actKey = '';
  private useKey = '';
  private hintKey = '';
  private bannerT = 0;
  constructor(
    private root: HTMLElement,
    cb: HudCb,
  ) {
    const d = document.createElement('div');
    d.className = 'jg-hud';
    d.innerHTML = `
      <div class="jg-uw"></div>
      <div class="jg-flash"></div>
      <div class="jg-top">
        <button class="jg-ib" data-a="pause" aria-label="${esc(t('jangada.pause', 'Pausa'))}">${jIcon('pause', 26)}</button>
        <div class="jg-day jg-pe"></div>
        <button class="jg-ib jg-cam" data-a="cam" aria-label="${esc(t('jangada.cam', 'Câmera'))}">${jIcon('eye', 26)}<span></span></button>
      </div>
      <div class="jg-obj jg-pe mini"></div>
      <div class="jg-ret"></div>
      <svg class="jg-charge" viewBox="0 0 54 54"><circle cx="27" cy="27" r="23" fill="none" stroke="rgba(0,0,0,.3)" stroke-width="6"/><circle class="arc" cx="27" cy="27" r="23" fill="none" stroke="#ffd34a" stroke-width="6" stroke-linecap="round" stroke-dasharray="0 200" transform="rotate(-90 27 27)"/></svg>
      <div class="jg-hint"></div>
      <div class="jg-fishtxt"></div>
      <div class="jg-fish"><div class="z"></div><div class="n"></div></div>
      <div class="jg-banner"></div>
      <div class="jg-bot">
        <div class="jg-cost" style="display:none"></div>
        <div class="jg-pal jg-pe" style="display:none"></div>
        <div class="jg-bars"></div>
        <div class="jg-hot jg-pe"></div>
      </div>
      <button class="jg-btn jg-x" data-a="cancel" aria-label="${esc(t('jangada.cancel', 'Cancelar'))}">${jIcon('close', 22)}</button>
      <button class="jg-btn jg-rot" data-a="rot" aria-label="${esc(t('jangada.rotate', 'Girar'))}">${jIcon('rotate', 30)}</button>
      <button class="jg-btn jg-use" data-a="use"></button>
      <button class="jg-btn jg-act" data-a="act"></button>
      <button class="jg-btn jg-jump" data-a="jump" aria-label="${esc(t('jangada.jump', 'Pular'))}">${jIcon('jump', 34)}</button>
      <button class="jg-btn jg-dive" data-a="dive" aria-label="${esc(t('jangada.diveB', 'Mergulhar'))}">${jIcon('dive', 30)}</button>
      <div class="jg-fade"></div>`;
    root.appendChild(d);
    this.el = d;
    this.q = <T extends HTMLElement>(s: string) => d.querySelector(s) as T;
    this.hot = this.q('.jg-hot');
    this.pal = this.q('.jg-pal');
    this.cost = this.q('.jg-cost');
    this.objEl = this.q('.jg-obj');
    const b = (sel: string, o: Parameters<typeof bindButton>[1]) => this.binds.push(bindButton(this.q(sel), o));
    b('[data-a=pause]', { onPress: () => cb.pause() });
    b('[data-a=cam]', { onPress: () => cb.cam() });
    b('[data-a=act]', { onPress: () => cb.action(true), onRelease: () => cb.action(false) });
    b('[data-a=use]', { onPress: () => cb.use() });
    b('[data-a=jump]', { onPress: () => cb.jump(true), onRelease: () => cb.jump(false) });
    b('[data-a=dive]', { onPress: () => cb.dive(true), onRelease: () => cb.dive(false) });
    b('[data-a=rot]', { onPress: () => cb.rotate() });
    b('[data-a=cancel]', { onPress: () => cb.cancel() });
    this.hot.addEventListener('pointerdown', (e) => {
      const s = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
      if (!s) return;
      e.preventDefault();
      e.stopPropagation();
      if (s.dataset.i === 'craft') cb.craft();
      else cb.select(+s.dataset.i!);
    });
    this.pal.addEventListener('pointerdown', (e) => {
      const s = (e.target as HTMLElement).closest<HTMLElement>('[data-k]');
      if (!s) return;
      e.preventDefault();
      e.stopPropagation();
      cb.pick(s.dataset.k as PK | 'trash');
    });
    this.objEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.objEl.classList.toggle('mini');
      this.objT = this.objEl.classList.contains('mini') ? 0 : 7;
    });
    this.setBars(100, 100, 100, null);
  }

  show(on: boolean): void {
    this.el.style.display = on ? '' : 'none';
  }
  update(dt: number): void {
    if (this.objT > 0) {
      this.objT -= dt;
      if (this.objT <= 0) this.objEl.classList.add('mini');
    }
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.q('.jg-banner').classList.remove('on');
    }
  }

  setDay(day: number, night: boolean, storm: boolean, camLbl: string): void {
    const k = `${day}|${night}|${storm}|${camLbl}`;
    if (k === this.dayKey) return;
    this.dayKey = k;
    this.q('.jg-day').innerHTML = `${jIcon(storm ? 'storm' : night ? 'moon' : 'sun', 24)}${esc(t('jangada.day', 'Dia {n}', { n: day }))}`;
    this.q('.jg-cam span').textContent = camLbl;
  }
  setHot(items: HotItem[], sel: number): void {
    const k = items.map((i) => i.id + i.n).join(',') + '|' + sel;
    if (k === this.hotKey) return;
    this.hotKey = k;
    this.hot.innerHTML =
      items.map((it, i) => `<button class="jg-slot${i === sel ? ' on' : ''}" data-i="${i}" aria-label="${esc(itemName(it.id))}">${jIcon(it.id, 32)}${ITEM[it.id].kind === 'tool' ? '' : `<i>${it.n}</i>`}</button>`).join('') +
      `<button class="jg-slot craft" data-i="craft" aria-label="${esc(t('jangada.craft', 'Oficina'))}">${jIcon('craft', 30)}</button>`;
  }
  setBars(hp: number, food: number, water: number, air: number | null): void {
    const bar = (ic: string, v: number, col: string) => `<div class="jg-bar${v < 22 ? ' low' : ''}">${jIcon(ic, 17)}<div><i style="width:${Math.max(0, Math.min(100, v))}%;background:${col}"></i></div></div>`;
    this.q('.jg-bars').innerHTML = bar('heart', hp, '#ff5c6a') + bar('food', food, '#ffad3a') + bar('drop', water, '#3ac8ff') + (air !== null ? bar('air', air, '#d8f6ff') : '');
  }
  setMissions(list: MisView[]): void {
    const k = list.map((m) => m.txt + m.n + '/' + m.of).join('|');
    if (k === this.misKey) return;
    const first = !this.misKey;
    const done = this.misKey && list[0] && !this.misKey.startsWith(list[0].txt);
    this.misKey = k;
    const m0 = list[0];
    this.objEl.innerHTML =
      `<div class="mini">${m0 ? jIcon(m0.icon, 22) + `<span>${m0.n}/${m0.of}</span>` : jIcon('star', 20)}${jIcon('list', 18)}</div>` +
      `<div class="full"><div class="h">${jIcon('list', 14)}${esc(t('jangada.obj', 'Objetivos'))} · ${esc(t('jangada.objHide', 'toque para esconder'))}</div>` +
      list.map((m) => `<div class="r">${jIcon(m.icon, 24)}<b>${esc(m.txt)}${m.daily ? ' <small style="opacity:.6">★</small>' : ''}<div class="bar"><i style="width:${Math.round((m.n / m.of) * 100)}%"></i></div></b><em>${m.n}/${m.of}</em></div>`).join('') +
      `</div>`;
    if (first || done) {
      this.objEl.classList.remove('mini');
      this.objT = 7;
      if (done) {
        this.objEl.classList.remove('done');
        void this.objEl.offsetWidth;
        this.objEl.classList.add('done');
      }
    }
  }
  setAction(icon: string, label = '', off = false): void {
    const k = icon + label + off;
    if (k === this.actKey) return;
    this.actKey = k;
    const a = this.q('.jg-act');
    a.innerHTML = jIcon(icon, 44) + (label ? `<small>${esc(label)}</small>` : '');
    a.classList.toggle('off', off);
  }
  setUse(icon: string | null, label = ''): void {
    const k = (icon ?? '') + label;
    if (k === this.useKey) return;
    this.useKey = k;
    const u = this.q('.jg-use');
    u.style.display = icon ? 'grid' : 'none';
    if (icon) u.innerHTML = jIcon(icon, 36) + (label ? `<small>${esc(label)}</small>` : '');
  }
  setHint(icon: string | null, text = '', hp = -1): void {
    const k = (icon ?? '') + text + Math.round(hp * 20);
    if (k === this.hintKey) return;
    this.hintKey = k;
    const h = this.q('.jg-hint');
    this.q('.jg-ret').classList.toggle('on', !!icon);
    h.style.display = icon ? 'flex' : 'none';
    if (icon) h.innerHTML = jIcon(icon, 20) + esc(text) + (hp >= 0 ? `<span class="hp"><i style="width:${Math.round(hp * 100)}%"></i></span>` : '');
  }
  setCharge(v: number | null): void {
    const c = this.q('.jg-charge');
    c.style.display = v === null ? 'none' : 'block';
    if (v !== null) c.querySelector('.arc')!.setAttribute('stroke-dasharray', `${(v * 144.5).toFixed(1)} 200`);
  }
  setBuildUi(on: boolean, rot: boolean): void {
    this.q('.jg-rot').style.display = on && rot ? 'grid' : 'none';
    this.q('.jg-x').style.display = on ? 'grid' : 'none';
  }
  setWater(swim: boolean): void {
    this.q('.jg-dive').style.display = swim ? 'grid' : 'none';
  }
  /** paleta de construção */
  setPalette(show: boolean, sel: PK | 'trash' | null, have: Bag, fireLv: number): void {
    const k = show ? `${sel}|${fireLv}|${BUILD_ORDER.map((p) => (bagHas(have, PIECE[p].cost) ? 1 : 0)).join('')}|${JSON.stringify(sel && sel !== 'trash' ? PIECE[sel].cost : {})}|${sel && sel !== 'trash' ? Object.keys(PIECE[sel].cost).map((i) => have[i as ItemId] ?? 0) : ''}` : '';
    if (k === this.palKey) return;
    this.palKey = k;
    this.pal.style.display = show ? 'flex' : 'none';
    this.cost.style.display = show && sel ? 'flex' : 'none';
    if (!show) return;
    this.pal.innerHTML =
      BUILD_ORDER.map((p) => {
        const d = PIECE[p];
        const lock = (d.fire ?? 0) > fireLv;
        const ok = bagHas(have, d.cost);
        return `<button class="jg-pc${sel === p ? ' on' : ''}${ok ? '' : ' no'}${lock ? ' lock' : ''}" data-k="${p}" aria-label="${esc(d.n())}">${jIcon(p, 30)}</button>`;
      }).join('') + `<button class="jg-pc${sel === 'trash' ? ' on' : ''}" data-k="trash" aria-label="${esc(t('jangada.trash', 'Desmontar'))}">${jIcon('trash', 28)}</button>`;
    if (sel === 'trash') this.cost.innerHTML = `${jIcon('trash', 18)}<b>${esc(t('jangada.trash', 'Desmontar'))}</b>`;
    else if (sel) {
      const d = PIECE[sel];
      const lock = (d.fire ?? 0) > fireLv;
      this.cost.innerHTML = `${jIcon(sel, 20)}<b>${esc(d.n())}</b> ${costChips(d.cost, have)}${lock ? ` <span class="jg-tag">${jIcon('fire', 14)}${esc(t('jangada.needFire', 'Fogueira {n}', { n: d.fire ?? 1 }))}</span>` : ''}`;
    }
  }
  /* ------------------------------ pesca ------------------------------ */
  setFish(state: null | { txt: string; zone?: [number, number]; needle?: number }): void {
    const f = this.q('.jg-fish');
    const tx = this.q('.jg-fishtxt');
    if (!state) {
      f.style.display = 'none';
      tx.style.display = 'none';
      return;
    }
    tx.style.display = 'block';
    tx.textContent = state.txt;
    f.style.display = state.zone ? 'block' : 'none';
    if (state.zone) {
      const z = f.querySelector('.z') as HTMLElement;
      z.style.left = state.zone[0] * 100 + '%';
      z.style.width = (state.zone[1] - state.zone[0]) * 100 + '%';
      (f.querySelector('.n') as HTMLElement).style.left = (state.needle ?? 0) * 100 + '%';
    }
  }
  /* ------------------------------ efeitos ------------------------------ */
  flash(): void {
    const f = this.q('.jg-flash');
    f.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('on')));
  }
  underwater(on: boolean): void {
    this.q('.jg-uw').classList.toggle('on', on);
  }
  banner(icon: string, text: string, sub = '', sec = 2.6): void {
    const b = this.q('.jg-banner');
    b.innerHTML = `${jIcon(icon, 46)}<div>${esc(text)}${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
    b.classList.remove('on');
    void b.offsetWidth;
    b.classList.add('on');
    this.bannerT = sec;
  }
  fade(on: boolean): void {
    this.q('.jg-fade').classList.toggle('on', on);
  }

  /* ------------------------------ painéis ------------------------------ */
  panel(html: string, cls = ''): HTMLDivElement {
    this.closePanel();
    const ov = document.createElement('div');
    ov.className = 'jg-ov';
    ov.innerHTML = `<div class="jg-card ${cls}">${html}</div>`;
    ov.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.appendChild(ov);
    this.overlay = ov;
    return ov.firstElementChild as HTMLDivElement;
  }
  closePanel(): void {
    this.overlay?.remove();
    this.overlay = null;
  }

  /** oficina: abas, grade de receitas, detalhes com tenho/preciso */
  openCraft(o: { have: () => Bag; fireLv: () => number; craft: (r: Recipe) => boolean; build: (k: PK) => void; close: () => void; upFire: () => boolean; hasFire: () => boolean }): void {
    let cat: Cat = 'mat';
    let sel: string = 'rope';
    const card = this.panel('', 'jg-craft');
    const tabs: [Cat, string, string][] = [
      ['mat', 'rope', t('jangada.cat.mat', 'Materiais')],
      ['tool', 'axe', t('jangada.cat.tool', 'Ferramentas')],
      ['build', 'found', t('jangada.cat.build', 'Construir')],
      ['food', 'fishc', t('jangada.cat.food', 'Comida')],
    ];
    const draw = () => {
      const have = o.have();
      const fl = o.fireLv();
      const fireTxt = fl ? t('jangada.fireLv', 'Nível da Fogueira {n}/{m}', { n: fl, m: FIRE_MAX }) : t('jangada.noFire', 'Sem fogueira');
      let grid = '';
      let side = '';
      if (cat === 'mat' || cat === 'tool') {
        const list = RECIPES.filter((r) => r.cat === cat);
        if (!list.some((r) => r.id === sel)) sel = list[0].id;
        grid = list
          .map((r) => {
            const lock = (r.fire ?? 0) > fl;
            const can = !lock && bagHas(have, r.cost);
            const owned = ITEM[r.out].kind === 'tool' && (have[r.out] ?? 0) > 0;
            return `<button class="jg-rc${r.id === sel ? ' on' : ''}${can && !owned ? ' can' : ''}${lock ? ' lock' : ''}" data-r="${r.id}" aria-label="${esc(itemName(r.out))}">${jIcon(r.out, 40)}${owned ? `<i>✓</i>` : r.n > 1 ? `<i>×${r.n}</i>` : ''}</button>`;
          })
          .join('');
        const r = RECIPES.find((x) => x.id === sel)!;
        const lock = (r.fire ?? 0) > fl;
        const owned = ITEM[r.out].kind === 'tool' && (have[r.out] ?? 0) > 0;
        side = `${jIcon(r.out, 56)}<b>${esc(itemName(r.out))}</b>${(have[r.out] ?? 0) && ITEM[r.out].kind !== 'tool' ? `<small>${esc(t('jangada.have', 'Você tem {n}', { n: have[r.out] ?? 0 }))}</small>` : ''}
          <div class="jg-costs">${costChips(r.cost, have, 22)}</div>
          ${lock ? `<span class="jg-tag">${jIcon('fire', 14)}${esc(t('jangada.needFire', 'Fogueira {n}', { n: r.fire ?? 1 }))}</span>` : ''}
          <button class="jg-b g" data-craft ${lock || owned || !bagHas(have, r.cost) ? 'disabled' : ''}>${jIcon('craft', 22)}${esc(owned ? t('jangada.owned', 'Já tem') : t('jangada.make', 'Fazer'))}</button>`;
      } else if (cat === 'build') {
        if (!BUILD_ORDER.includes(sel as PK)) sel = 'found';
        grid = BUILD_ORDER.map((p) => {
          const d = PIECE[p];
          const lock = (d.fire ?? 0) > fl;
          return `<button class="jg-rc${p === sel ? ' on' : ''}${!lock && bagHas(have, d.cost) ? ' can' : ''}${lock ? ' lock' : ''}" data-r="${p}" aria-label="${esc(d.n())}">${jIcon(p, 40)}</button>`;
        }).join('');
        const d = PIECE[sel as PK];
        const lock = (d.fire ?? 0) > fl;
        side = `${jIcon(d.id, 56)}<b>${esc(d.n())}</b><small>${esc(d.say())}</small><div class="jg-costs">${costChips(d.cost, have, 22)}</div>
          ${lock ? `<span class="jg-tag">${jIcon('fire', 14)}${esc(t('jangada.needFire', 'Fogueira {n}', { n: d.fire ?? 1 }))}</span>` : ''}
          <button class="jg-b o" data-build ${lock ? 'disabled' : ''}>${jIcon('hammer', 22)}${esc(t('jangada.build', 'Construir'))}</button>`;
      } else {
        grid = COOK_LIST.map(([a, b, lv]) => `<button class="jg-rc${b === sel ? ' on' : ''}${(have[a] ?? 0) > 0 && lv <= fl ? ' can' : ''}${lv > fl ? ' lock' : ''}" data-r="${b}">${jIcon(b, 40)}</button>`).join('') + `<button class="jg-rc${sel === 'water' ? ' on' : ''}" data-r="water">${jIcon('water', 40)}</button>`;
        if (!COOK_LIST.some((c) => c[1] === sel) && sel !== 'water') sel = 'fishc';
        if (sel === 'water') side = `${jIcon('purifier', 56)}<b>${esc(itemName('water'))}</b><small>${esc(t('jangada.waterHow', 'Ponha lenha no purificador: ele ferve a água do mar e faz água doce.'))}</small><div class="jg-costs">${costChips({ wood: 1 }, have, 22)}</div>`;
        else {
          const c = COOK_LIST.find((x) => x[1] === sel)!;
          side = `${jIcon(c[1], 56)}<b>${esc(itemName(c[1]))}</b><small>${esc(t('jangada.cookHow', 'Leve para a fogueira acesa e toque em USAR.'))}</small><div class="jg-costs">${costChips({ [c[0]]: 1 }, have, 22)}</div>${c[2] > fl ? `<span class="jg-tag">${jIcon('fire', 14)}${esc(t('jangada.needFire', 'Fogueira {n}', { n: c[2] }))}</span>` : ''}`;
        }
      }
      const up = fl > 0 && fl < FIRE_MAX ? FIRE_UP[fl + 1] : null;
      card.innerHTML = `<button class="jg-close" data-x aria-label="${esc(t('jangada.close', 'Fechar'))}">${jIcon('close', 20)}</button>
        <div class="jg-tabs">${tabs.map(([k, ic, n]) => `<button class="jg-tab${k === cat ? ' on' : ''}" data-c="${k}">${jIcon(ic, 28)}<span>${esc(n)}</span></button>`).join('')}
        <span class="jg-fire" title="${esc(fireTxt)}">${jIcon('fire', 24)}${esc(fireTxt)}${up && o.hasFire() ? ` <button class="jg-b o" data-up style="min-height:30px;padding:4px 8px;font-size:12px" ${bagHas(have, up) ? '' : 'disabled'}>${jIcon('up', 16)}${costChips(up, have, 14)}</button>` : ''}</span></div>
        <div class="jg-body"><div class="jg-grid">${grid}</div><div class="jg-side">${side}</div></div>`;
    };
    card.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!b) return;
      if (b.dataset.x !== undefined) return o.close();
      if (b.dataset.c) {
        cat = b.dataset.c as Cat;
        sel = '';
      } else if (b.dataset.r) sel = b.dataset.r;
      else if (b.dataset.craft !== undefined) {
        const r = RECIPES.find((x) => x.id === sel);
        if (r) o.craft(r);
      } else if (b.dataset.build !== undefined) return o.build(sel as PK);
      else if (b.dataset.up !== undefined) o.upFire();
      draw();
    });
    // abas curtas em telas pequenas
    draw();
    if (this.root.clientWidth < 760) card.querySelectorAll('.jg-tab span').forEach((s) => ((s as HTMLElement).style.display = 'none'));
    const redraw = draw;
    (card as HTMLDivElement & { redraw?: () => void }).redraw = () => {
      redraw();
      if (this.root.clientWidth < 760) card.querySelectorAll('.jg-tab span').forEach((s) => ((s as HTMLElement).style.display = 'none'));
    };
  }

  /** baú: toque num item para mover (tudo de uma vez) */
  openChest(o: { mine: () => Bag; chest: () => Bag; move: (id: ItemId, toChest: boolean) => void; all: (toChest: boolean) => void; close: () => void }): () => void {
    const card = this.panel('', '');
    const grid = (b: Bag, side: 'm' | 'c') =>
      Object.entries(b)
        .filter(([id, n]) => (n ?? 0) > 0 && ITEM[id as ItemId] && ITEM[id as ItemId].kind !== 'tool')
        .map(([id, n]) => `<button class="jg-it" data-${side}="${id}" aria-label="${esc(itemName(id as ItemId))}">${jIcon(id, 32)}<i>${n}</i></button>`)
        .join('') || `<small style="opacity:.6;font-weight:600">${esc(t('jangada.empty', 'vazio'))}</small>`;
    const draw = () => {
      card.innerHTML = `<button class="jg-close" data-x>${jIcon('close', 20)}</button><h2>${jIcon('chest', 30)}${esc(t('jangada.p.chest', 'Baú'))}</h2>
        <div class="jg-chest"><div><h3>${jIcon('people', 20)}${esc(t('jangada.bag', 'Com você'))}<button class="jg-b w" data-all="c" style="margin-left:auto;min-height:32px;padding:4px 9px;font-size:13px">${esc(t('jangada.putAll', 'Guardar tudo'))} →</button></h3><div class="jg-inv">${grid(o.mine(), 'm')}</div></div>
        <div><h3>${jIcon('chest', 20)}${esc(t('jangada.inChest', 'No baú'))}<button class="jg-b w" data-all="m" style="margin-left:auto;min-height:32px;padding:4px 9px;font-size:13px">← ${esc(t('jangada.takeAll', 'Pegar tudo'))}</button></h3><div class="jg-inv">${grid(o.chest(), 'c')}</div></div></div>`;
    };
    card.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!b) return;
      if (b.dataset.x !== undefined) return o.close();
      if (b.dataset.m) o.move(b.dataset.m as ItemId, true);
      else if (b.dataset.c) o.move(b.dataset.c as ItemId, false);
      else if (b.dataset.all) o.all(b.dataset.all === 'c');
      draw();
    });
    draw();
    return draw;
  }

  dispose(): void {
    for (const b of this.binds) b.destroy();
    this.closePanel();
    this.el.remove();
  }
}
