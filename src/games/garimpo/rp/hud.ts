/* ============================================================
 *  GARIMPO — HUD da vida de garimpeiro: relógio + previsão, medidores em anel
 *  (fome, sede, sono, fôlego, combustível, peso) que só aparecem quando importam,
 *  botões de ação do lugar (comer, abastecer, dormir, estrada…), cartão de evento
 *  com ícone grande + voz, números que sobem (+35 🍲), bordas escuras/borradas
 *  quando falta algo, clarão do relâmpago e tela escura (dormir/desmaiar).
 *  Escreve no DOM só quando o valor muda.
 * ============================================================ */
import { t } from '../../../i18n';
import { sfx } from '../../../3d/common/sfx';
import { bindButton, type BoundButton } from '../../../ui/touch';
import { speak } from '../../voo/voice';
import { weather, type SkyKind } from '../weather';
import { RI, type RIcon } from './icons';
import { label, LOC_ICON, LOC_NAME, outText, render, scaleMoney, SKY_ICON, SKY_NAME, type Choice, type Concrete, type Fx } from './events';
import { ITEMS, type ItemId } from './state';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
export const hhmm = (h: number) => {
  const H = Math.floor(h) % 24;
  const M = Math.floor((h - Math.floor(h)) * 60 / 10) * 10;
  return `${String(H).padStart(2, '0')}:${String(M).padStart(2, '0')}`;
};

export interface Action {
  id: string;
  icon: RIcon;
  label: string;
  /** preço/nota pequena (ícone + texto) */
  sub?: [RIcon, string];
  cls?: string;
  run: () => void;
}
export interface Meters {
  food: number | null;
  water: number | null;
  energy: number | null;
  stam: number | null;
  fuel: number | null;
  /** peso: kg/cap (null = esconde) */
  kg: [number, number] | null;
}

export class RpHud {
  readonly el: HTMLDivElement;
  private clockEl: HTMLDivElement;
  private actEl: HTMLDivElement;
  private vig: HTMLDivElement;
  private flashEl: HTMLDivElement;
  private fadeEl: HTMLDivElement;
  private m: Record<string, HTMLDivElement> = {};
  private bag: HTMLButtonElement;
  private lastClock = '';
  private lastActs = '';
  private acts: Action[] = [];
  private btns: BoundButton[] = [];
  private actBtns: BoundButton[] = [];
  private lastM: Record<string, string> = {};
  cardOpen = false;

  constructor(
    private root: HTMLElement,
    onBag: () => void,
  ) {
    const el = document.createElement('div');
    el.className = 'rp-hud';
    el.innerHTML = `<div class="rp-clock" data-touch-ignore></div>
      <div class="rp-meters" data-touch-ignore><button class="rp-bag" data-touch-ignore>${RI.bag}</button>
        ${(['food', 'water', 'energy', 'stam', 'fuel', 'kg'] as const).map((k) => `<div class="rp-m" data-m="${k}" hidden>${RI[k === 'kg' ? 'weight' : k === 'stam' ? 'stamina' : k]}<b></b></div>`).join('')}</div>
      <div class="rp-acts" data-touch-ignore></div>`;
    root.appendChild(el);
    this.el = el;
    this.clockEl = el.querySelector('.rp-clock')!;
    this.actEl = el.querySelector('.rp-acts')!;
    this.bag = el.querySelector('.rp-bag')!;
    this.btns.push(bindButton(this.bag, { onPress: onBag }));
    el.querySelectorAll<HTMLDivElement>('[data-m]').forEach((d) => (this.m[d.dataset.m!] = d));
    this.vig = document.createElement('div');
    this.vig.className = 'rp-vig';
    this.flashEl = document.createElement('div');
    this.flashEl.className = 'rp-flash';
    this.fadeEl = document.createElement('div');
    this.fadeEl.className = 'rp-fade';
    root.append(this.vig, this.flashEl, this.fadeEl);
  }

  setVisible(on: boolean): void {
    this.el.hidden = !on;
  }

  /** relógio e previsão (agora → depois) */
  clock(): void {
    const w = weather;
    const night = w.isNight;
    const k = `${hhmm(w.hour)}|${w.sky}|${w.next}|${night}`;
    if (k === this.lastClock) return;
    this.lastClock = k;
    // fica logo à direita dos chips do topo (dinheiro/estoque/carga)
    const top = this.root.querySelector('.gb-top') as HTMLElement | null;
    const r = top && !top.closest('[hidden]') ? top.getBoundingClientRect() : null;
    const rr = this.root.getBoundingClientRect();
    if (r && r.width) {
      this.clockEl.style.left = Math.round(r.right - rr.left + 8) + 'px';
      this.clockEl.style.transform = 'none';
    } else {
      this.clockEl.style.left = '';
      this.clockEl.style.transform = '';
    }
    const now: SkyKind = w.sky;
    const ic = night && (now === 'clear' || now === 'cloudy') ? RI.moon : RI[SKY_ICON[now]];
    const nx = w.next;
    this.clockEl.innerHTML = `${ic}<span>${hhmm(w.hour)}</span><span class="rp-fc" title="${esc(SKY_NAME[now]())}"><i>›</i>${RI[SKY_ICON[nx]]}</span>`;
    this.clockEl.classList.toggle('night', night);
  }

  meters(v: Meters, bagOver: boolean): void {
    const set = (k: string, val: number | null, col: string, txt = '') => {
      const d = this.m[k];
      const key = val === null ? 'x' : `${Math.round(val * 40)}|${txt}`;
      if (this.lastM[k] === key) return;
      this.lastM[k] = key;
      d.hidden = val === null;
      if (val === null) return;
      d.style.setProperty('--v', Math.max(0, Math.min(1, val)).toFixed(3));
      d.style.setProperty('--c', val < 0.2 ? '#e8442e' : val < 0.45 ? '#ffb02e' : col);
      d.classList.toggle('low', val < 0.2);
      d.querySelector('b')!.textContent = txt;
    };
    set('food', v.food, '#3fbf5a');
    set('water', v.water, '#2f9be8');
    set('energy', v.energy, '#9a8cff');
    set('stam', v.stam, '#7ee05a');
    set('fuel', v.fuel, '#ffcf2e', v.fuel === null ? '' : Math.round(v.fuel * 100) + '%');
    set('kg', v.kg ? Math.min(1, v.kg[0] / v.kg[1]) : null, v.kg && v.kg[0] > v.kg[1] ? '#e8442e' : '#c8a070', v.kg ? `${Math.round(v.kg[0])}/${v.kg[1]}` : '');
    this.bag.classList.toggle('over', bagOver);
  }

  actions(list: Action[]): void {
    const k = list.map((a) => a.id + a.label + (a.sub?.[1] ?? '') + (a.cls ?? '')).join('|');
    this.acts = list;
    if (k === this.lastActs) return;
    this.lastActs = k;
    for (const b of this.actBtns) b.destroy();
    this.actBtns = [];
    this.actEl.innerHTML = list
      .map((a, i) => `<button class="rp-act ${a.cls ?? ''}" data-a="${i}" data-touch-ignore>${RI[a.icon]}<span>${esc(a.label)}${a.sub ? `<small>${RI[a.sub[0]]}${esc(a.sub[1])}</small>` : ''}</span></button>`)
      .join('');
    this.actEl.querySelectorAll<HTMLButtonElement>('[data-a]').forEach((b) => {
      this.actBtns.push(
        bindButton(b, {
          onPress: () => {
            sfx.click();
            this.acts[Number(b.dataset.a)]?.run();
          },
        }),
      );
    });
  }

  /** bordas escuras (0..1) e borradas quando crítico */
  vignette(k: number, blur: boolean): void {
    this.vig.style.opacity = k.toFixed(2);
    this.vig.classList.toggle('blur', blur);
  }
  flash(k: number): void {
    this.flashEl.style.opacity = (k * k * 0.5).toFixed(2);
  }
  /** tela escura com ícone e frase (dormir, desmaiar) */
  fade(on: boolean, icon: RIcon = 'sleep', text = ''): void {
    this.fadeEl.innerHTML = on ? `${RI[icon]}<span>${esc(text)}</span>` : '';
    this.fadeEl.classList.toggle('on', on);
  }

  /** números flutuando (+35 comida…) */
  pop(items: [RIcon, number, string?][]): void {
    if (!items.length) return;
    const d = document.createElement('div');
    d.className = 'rp-pop';
    d.innerHTML = items.map(([ic, n, s]) => `<span class="${n < 0 ? 'neg' : ''}">${RI[ic]}${n > 0 ? '+' : ''}${s ?? Math.round(n)}</span>`).join('');
    this.root.appendChild(d);
    window.setTimeout(() => d.remove(), 1700);
  }

  /* ---------------- cartão de evento ---------------- */
  /** mostra o evento; resolve com a escolha (índice). `can(ch)` diz se a escolha está disponível. */
  card(ev: Concrete, diff: number, can: (c: Choice) => boolean, voice: boolean): Promise<number> {
    return new Promise((res) => {
      this.cardOpen = true;
      const r = render(ev);
      const spooky = ev.tp.cat === 'spooky';
      const c = ev.ctx;
      const chs = ev.tp.ch(c, ev.v);
      const d = document.createElement('div');
      d.className = 'rp-ev' + (spooky ? ' spooky' : '');
      d.setAttribute('data-touch-ignore', '');
      const icon = ev.v?.icon ?? ev.tp.icon;
      const chip = (ic: RIcon, s: string) => `<span>${RI[ic]}${esc(s)}</span>`;
      d.innerHTML = `<div class="rp-card"><div class="rp-big">${RI[icon]}</div>
        <h3>${esc(r.title)}</h3><p>${esc(r.text)}</p>
        <div class="rp-chips">${chip(LOC_ICON[c.loc], LOC_NAME[c.loc]())}${chip(c.night ? 'moon' : 'sun', c.night ? t('gb.rp.night', 'Noite') : t('gb.rp.day', 'Dia'))}${c.night && c.sky === 'clear' ? chip('star', t('gb.wx.clearNight', 'Céu limpo')) : chip(SKY_ICON[c.sky], SKY_NAME[c.sky]())}</div>
        <div class="rp-chs">${chs
          .map((ch, i) => {
            const ok = can(ch);
            const subs: string[] = [];
            if (ch.cost) subs.push(`${RI.coin}${scaleMoney(-ch.cost, diff) * -1}`);
            if (ch.need) subs.push(`${RI[ITEMS[ch.need].icon]}1`);
            if (ch.p !== undefined && ch.p < 1) subs.push(`${RI.star}${Math.round(ch.p * 100)}%`);
            return `<button class="rp-ch" data-c="${i}" ${ok ? '' : 'disabled'}>${RI[ch.ic]}<span>${esc(label(ch.l))}${subs.length ? `<small>${subs.join(' ')}</small>` : ''}</span></button>`;
          })
          .join('')}</div></div>`;
      this.root.appendChild(d);
      if (voice) speak(`${r.title}. ${r.text}`, { urgent: true });
      if (spooky) sfx.whoosh();
      else sfx.ding();
      d.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-c]');
        if (!b || b.disabled) return;
        sfx.click();
        d.dataset.done = '1';
        res(Number(b.dataset.c));
        this.resCard = d;
      });
    });
  }
  private resCard: HTMLDivElement | null = null;
  /** mostra o resultado no mesmo cartão; fecha no "OK" (ou sozinho em 6 s) */
  result(fx: Fx, good: boolean, diff: number, voice: boolean): Promise<void> {
    return new Promise((res) => {
      const d = this.resCard;
      if (!d) return res();
      const card = d.querySelector('.rp-card')!;
      card.querySelector('.rp-chs')?.remove();
      const items: string[] = [];
      const add = (ic: RIcon, n: number | undefined, suf = '') => {
        if (!n) return;
        items.push(`<span class="${n < 0 ? 'neg' : ''}">${RI[ic]}${n > 0 ? '+' : ''}${Math.round(n)}${suf}</span>`);
      };
      if (fx.m) add('coin', scaleMoney(fx.m, diff));
      add('food', fx.food);
      add('water', fx.water);
      add('energy', fx.energy);
      add('stamina', fx.stam);
      add('fuel', fx.fuel, ' L');
      add('arm', fx.xp, ' XP');
      add('gold', fx.gold, ' g');
      if (fx.h) items.push(`<span>${RI.clock}+${fx.h >= 1 ? fx.h.toFixed(1) + ' h' : Math.round(fx.h * 60) + ' min'}</span>`);
      if (fx.dmg) items.push(`<span class="neg">${RI.wrench}-${Math.round(fx.dmg)}%</span>`);
      if (fx.it) items.push(`<span class="${fx.it[1] < 0 ? 'neg' : ''}">${RI[ITEMS[fx.it[0] as ItemId].icon]}${fx.it[1] > 0 ? '+' : ''}${fx.it[1]}${fx.it[0] === 'pepita' ? ' g' : ''}</span>`);
      if (fx.stockK) items.push(`<span class="${fx.stockK < 0 ? 'neg' : ''}">${RI.gold}${Math.round(fx.stockK * 100)}%</span>`);
      if (fx.cargoK) items.push(`<span class="neg">${RI.box}${Math.round(fx.cargoK * 100)}%</span>`);
      if (fx.price) items.push(`<span class="${fx.price < 0 ? 'neg' : ''}">${RI.coin}${fx.price > 0 ? '+' : ''}${Math.round(fx.price * 100)}%</span>`);
      if (fx.heart) items.push(`<span>${RI.heart}</span>`);
      if (fx.repair) items.push(`<span>${RI.wrench}${RI.check}</span>`);
      const say = fx.say ? outText(fx.say) : good ? outText('good') : outText('bad');
      const r = document.createElement('div');
      r.className = 'rp-res';
      r.innerHTML = `<p>${good ? '' : ''}${esc(say)}</p><div class="rp-fx">${items.join('')}</div><button class="rp-ok">${RI.check}${esc(t('gb.rp.ok', 'Beleza!'))}</button>`;
      card.appendChild(r);
      if (voice) speak(say, { urgent: true });
      if (good) sfx.yay();
      else sfx.thunk();
      let done = false;
      const close = () => {
        if (done) return;
        done = true;
        d.remove();
        this.resCard = null;
        this.cardOpen = false;
        res();
      };
      r.querySelector('.rp-ok')!.addEventListener('click', () => {
        sfx.click();
        close();
      });
      window.setTimeout(close, 7000);
    });
  }
  /** aviso de evento do time (sem escolha) — convidados */
  notice(ev: Concrete): void {
    const r = render(ev);
    const d = document.createElement('div');
    d.className = 'rp-ev';
    d.innerHTML = `<div class="rp-card"><div class="rp-big">${RI[ev.v?.icon ?? ev.tp.icon]}</div><h3>${esc(r.title)}</h3><p>${esc(r.text)}</p><div class="rp-res"><button class="rp-ok">${RI.check}${esc(t('gb.rp.ok', 'Beleza!'))}</button></div></div>`;
    this.root.appendChild(d);
    const close = () => d.remove();
    d.querySelector('.rp-ok')!.addEventListener('click', close);
    window.setTimeout(close, 5000);
  }

  destroy(): void {
    for (const b of this.btns) b.destroy();
    for (const b of this.actBtns) b.destroy();
    this.el.remove();
    this.vig.remove();
    this.flashEl.remove();
    this.fadeEl.remove();
    this.root.querySelectorAll('.rp-ev,.rp-pop,.rp-scr').forEach((e) => e.remove());
  }
}
