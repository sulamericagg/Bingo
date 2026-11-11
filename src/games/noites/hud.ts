/* ============================================================
 *  NOITES — HUD (DOM). Ícones grandes; cada botão FALA o nome
 *  ao ser tocado (sem repetir demais). Texto só de apoio.
 * ============================================================ */
import { t } from '../../i18n';
import { bindButton, type BoundButton } from '../../ui/touch';
import { BENCH_BABIES, CATS, HEARTS, ITEM, ITEMS, RES, catName, resName, type Cat, type ItemDef, type Res } from './data';
import { bagCount, type Player, type Sim } from './sim';
import { ic } from './icons';
import { speak } from './speak';

export interface HudCb {
  action(): void;
  light(): void;
  bonk(): void;
  slot(id: string): void;
  place(k: 'ok' | 'rot' | 'no'): void;
  craft(id: string): void;
  bot(c: 'follow' | 'stay' | 'wood' | 'guard'): void;
  exit(): void;
  voice(): void;
  craftOpen(on: boolean): void;
}

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** ícone de um item/recurso */
export function itemIcon(id: string, size = 32): string {
  const d = ITEM[id];
  if (d) return ic(d.icon, size, d.col);
  return ic(id, size);
}
export function itemName(id: string): string {
  return ITEM[id]?.n() ?? resName(id as Res);
}

export class Hud {
  el: HTMLDivElement;
  private q = <T extends HTMLElement>(s: string) => this.el.querySelector(s) as T;
  private bound: BoundButton[] = [];
  private last: Record<string, string> = {};
  private craftEl: HTMLDivElement | null = null;
  private cat: Cat = 'tool';
  private sel = '';
  useHeld = false;
  marker: HTMLDivElement;

  constructor(
    root: HTMLElement,
    private cb: HudCb,
  ) {
    const el = document.createElement('div');
    el.className = 'nc-hud';
    el.innerHTML = `
      <div class="nc-dark"></div><div class="nc-hurt"></div>
      <div class="nc-top">
        <button class="nc-btn round red" data-b="exit" data-say="${esc(t('noites.say.exit', 'Sair'))}">${ic('exit', 26)}</button>
        <div class="nc-stats">
          <div class="nc-hearts"></div>
          <div class="nc-meters">
            <div class="nc-meter" data-m="hunger">${ic('hunger', 20)}<div class="nc-bar"><i></i></div></div>
            <div class="nc-meter" data-m="warm">${ic('warm', 20)}<div class="nc-bar"><i style="background:#ff6a3a"></i></div></div>
            <div class="nc-bag">${ic('bag', 20)}<span data-v="bag">0</span></div>
          </div>
        </div>
        <div class="nc-mid">
          <div class="nc-phase"><span data-v="pIcon"></span><span data-v="pNum">1</span><div class="pbar"><i data-v="pBar"></i></div><span data-v="pSpecial"></span></div>
          <div class="nc-fire">${ic('fire', 20)}<div class="nc-bar"><i data-v="fire"></i></div></div>
          <div class="nc-obj nc-pe" data-v="obj"><i class="arr" data-v="arr">${ic('arrow', 22)}</i><i data-v="objI"></i><span data-v="objT"></span></div>
        </div>
        <div class="nc-right">
          <div class="nc-code" data-v="code" hidden></div>
          <button class="nc-btn round" data-b="bots" hidden data-say="${esc(t('noites.say.bots', 'Ajudantes'))}">${ic('people', 28)}</button>
          <button class="nc-btn round" data-b="voice" data-say="${esc(t('noites.say.voice', 'Voz'))}"><span data-v="voice">${ic('speaker', 26, '#2a0b5c')}</span></button>
        </div>
      </div>
      <div class="nc-bots">
        <button class="nc-btn" data-bot="follow" data-say="${esc(t('noites.bot.follow', 'Ajudantes: me sigam!'))}">${ic('follow', 40)}</button>
        <button class="nc-btn" data-bot="wood" data-say="${esc(t('noites.bot.wood', 'Ajudantes: cortem lenha!'))}">${ic('axe', 40)}</button>
        <button class="nc-btn" data-bot="guard" data-say="${esc(t('noites.bot.guard', 'Ajudantes: protejam a fogueira!'))}">${ic('guard', 40)}</button>
        <button class="nc-btn" data-bot="stay" data-say="${esc(t('noites.bot.stay', 'Ajudantes: fiquem aí!'))}">${ic('stay', 40)}</button>
      </div>
      <div class="nc-hot"></div>
      <div class="nc-place">
        <button class="nc-btn round red" data-p="no" data-say="${esc(t('noites.say.cancel', 'Cancelar'))}">${ic('close', 34)}</button>
        <button class="nc-btn round dark" data-p="rot" data-say="${esc(t('noites.say.rotate', 'Girar'))}">${ic('rotate', 34)}</button>
        <button class="nc-btn round green" data-p="ok" data-say="${esc(t('noites.say.placeHere', 'Colocar aqui'))}">${ic('check', 40, '#0a3a1a')}</button>
      </div>
      <div class="nc-act">
        <div class="nc-side">
          <button class="nc-btn round dark" data-b="bonk" hidden data-say="${esc(t('noites.say.bonk', 'Martelada!'))}">${ic('hammer', 36)}</button>
          <button class="nc-btn round dark" data-b="light" data-say="${esc(t('noites.say.light', 'Lanterna'))}">${ic('light', 38)}</button>
        </div>
        <button class="nc-btn nc-use gold" data-b="use"><span data-v="useI">${ic('hand', 50)}</span><b data-v="useT"></b></button>
      </div>`;
    root.appendChild(el);
    this.el = el;
    this.marker = document.createElement('div');
    this.marker.className = 'nc-mark';
    el.appendChild(this.marker);

    const sayOf = (b: HTMLElement) => b.dataset.say ?? '';
    const btn = (b: HTMLElement, f: () => void, o: { repeat?: number } = {}) => {
      this.bound.push(
        bindButton(b, {
          onPress: () => {
            const s = sayOf(b);
            if (s) speak(s, { cool: 5000 });
            f();
          },
          repeatMs: o.repeat,
        }),
      );
    };
    btn(this.q('[data-b="exit"]'), () => cb.exit());
    btn(this.q('[data-b="voice"]'), () => cb.voice());
    btn(this.q('[data-b="light"]'), () => cb.light());
    btn(this.q('[data-b="bonk"]'), () => cb.bonk(), { repeat: 420 });
    btn(this.q('[data-b="bots"]'), () => this.q('.nc-bots').classList.toggle('on'));
    const use = this.q('[data-b="use"]');
    this.bound.push(
      bindButton(use, {
        onPress: () => {
          this.useHeld = true;
          const s = use.dataset.say;
          if (s) speak(s, { cool: 6000 });
          cb.action();
        },
        onRelease: () => (this.useHeld = false),
        repeatMs: 380,
      }),
    );
    el.querySelectorAll<HTMLElement>('[data-bot]').forEach((b) => btn(b, () => cb.bot(b.dataset.bot as 'follow')));
    el.querySelectorAll<HTMLElement>('[data-p]').forEach((b) => btn(b, () => cb.place(b.dataset.p as 'ok')));
  }

  private set(key: string, v: string, f: () => void): void {
    if (this.last[key] === v) return;
    this.last[key] = v;
    f();
  }

  setStats(p: Player, s: Sim): void {
    this.set('hearts', String(p.hearts), () => {
      let h = '';
      for (let i = 0; i < HEARTS; i++) h += `<span class="${i < p.hearts ? '' : 'off'}">${ic('heart', 20)}</span>`;
      this.q('.nc-hearts').innerHTML = h;
    });
    const m = (k: string, v: number) =>
      this.set('m' + k, String(Math.round(v / 4)), () => {
        const e = this.q(`[data-m="${k}"]`);
        (e.querySelector('i') as HTMLElement).style.width = Math.round(v) + '%';
        e.classList.toggle('low', v < 25);
      });
    m('hunger', p.hunger);
    m('warm', p.warmth);
    this.set('bag', bagCount(p.bag) + '/' + s.cap(p), () => (this.q('[data-v="bag"]').textContent = bagCount(p.bag) + '/' + s.cap(p)));
    this.set('hurt', String(p.invT > 1.2), () => this.q('.nc-hurt').classList.toggle('on', p.invT > 1.2));
    this.set('bonk', String(p.bonk > 0), () => (this.q('[data-b="bonk"]').hidden = !(p.bonk > 0)));
    this.set('light', String(p.lightOn), () => this.q('[data-b="light"]').classList.toggle('on', p.lightOn));
  }
  setPhase(s: Sim, len: number, special: string): void {
    const night = s.phase === 'night';
    this.set('ph', String(night), () => {
      this.q('.nc-phase').classList.toggle('night', night);
      this.q('[data-v="pIcon"]').innerHTML = ic(night ? 'moon' : 'sun', 28);
      (this.q('.nc-dark') as HTMLElement).style.opacity = night ? '1' : '0';
    });
    this.set('pn', String(s.night), () => (this.q('[data-v="pNum"]').textContent = String(s.night)));
    this.set('pb', String(Math.round((s.clock / len) * 50)), () => ((this.q('[data-v="pBar"]') as HTMLElement).style.width = Math.round((s.clock / len) * 100) + '%'));
    this.set('sp', special, () => (this.q('[data-v="pSpecial"]').innerHTML = special ? ic(special, 24) : ''));
    const fl = s.fire.fuel / s.fire.max;
    this.set('fire', String(Math.round(fl * 40)), () => {
      (this.q('[data-v="fire"]') as HTMLElement).style.width = Math.round(fl * 100) + '%';
      this.q('.nc-fire').classList.toggle('low', fl < 0.22);
    });
  }
  setAction(icon: string, label: string, say: string, col = ''): void {
    this.set('act', icon + label + col, () => {
      const u = this.q('[data-b="use"]');
      this.q('[data-v="useI"]').innerHTML = ic(icon, 50, col);
      this.q('[data-v="useT"]').textContent = label;
      u.dataset.say = say;
      u.classList.toggle('pulse', icon !== 'hand');
      u.classList.toggle('gold', icon !== 'hand');
    });
  }
  setObjective(icon: string, text: string, angle: number | null): void {
    this.set('obj', icon + text, () => {
      this.q('[data-v="objI"]').innerHTML = ic(icon, 24);
      this.q('[data-v="objT"]').textContent = text;
      const o = this.q('[data-v="obj"]');
      o.dataset.say = text;
      o.onclick = () => speak(text, { cool: 1000, urgent: true });
    });
    const a = this.q('[data-v="arr"]');
    a.style.display = angle === null ? 'none' : '';
    if (angle !== null) a.style.transform = `rotate(${Math.round(angle)}deg)`;
  }
  /** marcador na tela (ícone em cima do alvo ou seta na borda) */
  setMarker(x: number, y: number, icon: string, edge: boolean, angle: number): void {
    this.marker.classList.add('on');
    this.marker.style.left = x + 'px';
    this.marker.style.top = y + 'px';
    const k = (edge ? 'e' : 'i') + icon;
    this.set('mk', k, () => (this.marker.innerHTML = edge ? `<div style="transform:rotate(${angle}deg)">${ic('arrow', 40)}</div>` : `<div style="animation:ncPulse 1s infinite">${ic(icon, 40)}</div>`));
    if (edge) (this.marker.firstElementChild as HTMLElement).style.transform = `rotate(${Math.round(angle)}deg)`;
  }
  hideMarker(): void {
    this.marker.classList.remove('on');
  }
  setHotbar(items: { id: string; n: number }[]): void {
    const key = items.map((i) => i.id + i.n).join(',');
    this.set('hot', key, () => {
      const h = this.q('.nc-hot');
      for (const b of this.bound.filter((x) => h.contains(x.el))) b.destroy();
      this.bound = this.bound.filter((x) => !h.contains(x.el));
      h.innerHTML = items.map((i) => `<button class="nc-btn nc-slot" data-slot="${i.id}" data-say="${esc(itemName(i.id))}">${itemIcon(i.id, 40)}<em>${i.n > 1 ? i.n : ''}</em></button>`).join('');
      h.querySelectorAll<HTMLElement>('[data-slot]').forEach((b) =>
        this.bound.push(
          bindButton(b, {
            onPress: () => {
              speak(b.dataset.say ?? '', { cool: 3000 });
              this.cb.slot(b.dataset.slot!);
            },
          }),
        ),
      );
    });
  }
  setPlacing(on: boolean): void {
    this.q('.nc-place').classList.toggle('on', on);
    this.q('.nc-hot').style.visibility = on ? 'hidden' : '';
  }
  setVoice(on: boolean): void {
    this.q('[data-v="voice"]').innerHTML = ic(on ? 'speaker' : 'mute', 26, '#2a0b5c');
  }
  showBotsBtn(on: boolean): void {
    this.q('[data-b="bots"]').hidden = !on;
  }
  setCode(code: string, n: number): void {
    const c = this.q('[data-v="code"]');
    c.hidden = !code;
    this.set('code', code + n, () => (c.innerHTML = `${ic('key', 20)}${code}<span style="letter-spacing:0">${ic('people', 18)}${n}</span>`));
  }

  /* ------------------------------ bancada ------------------------------ */
  get crafting(): boolean {
    return !!this.craftEl;
  }
  openCraft(s: Sim, me: Player): void {
    if (this.craftEl) return;
    const el = document.createElement('div');
    el.className = 'nc-panel';
    this.craftEl = el;
    this.el.parentElement!.appendChild(el);
    this.cb.craftOpen(true);
    speak(t('noites.say.bench', 'Bancada! Escolha o que fazer.'), { cool: 20000 });
    this.renderCraft(s, me);
  }
  closeCraft(): void {
    this.craftEl?.remove();
    this.craftEl = null;
    this.cb.craftOpen(false);
  }
  renderCraft(s: Sim, me: Player): void {
    const el = this.craftEl;
    if (!el) return;
    const sc = el.querySelector('.nc-grid')?.scrollTop ?? 0;
    const stash = RES.filter((r) => (s.stash[r] ?? 0) > 0)
      .map((r) => `<span class="nc-chip">${ic(r, 22)}${s.stash[r]}</span>`)
      .join('');
    const tabs = CATS.map((c) => `<button class="nc-btn ${c === this.cat ? 'gold' : ''}" data-cat="${c}" data-say="${esc(catName(c))}">${ic(CAT_ICON[c], 32)}</button>`).join('');
    const items = ITEMS.filter((d) => d.cat === this.cat);
    const cards = items.map((d) => this.card(d, s, me)).join('');
    const selD = ITEM[this.sel];
    const why = selD ? s.craftBlock(selD) ?? (selD.camp === 'bench' && s.benchLocked(selD.benchTo!) ? 'baby' : null) : 'none';
    el.innerHTML = `
      <div class="row">
        <button class="nc-btn round red" data-x="close" data-say="${esc(t('noites.say.close', 'Fechar'))}">${ic('close', 30)}</button>
        <span class="nc-chip" style="font-size:18px">${ic('bench', 30)}${s.bench}</span>
        <div class="nc-stash">${stash || ic('wood', 22) + ' 0'}</div>
      </div>
      <div class="row" style="flex:1;min-height:0;align-items:stretch">
        <div style="display:flex;flex-direction:column;gap:6px">${tabs.replace(/<\/button>/g, '</button>')}</div>
        <div class="nc-grid">${cards}</div>
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;width:110px">
          ${selD ? itemIcon(selD.id, 56) : ''}
          <button class="nc-btn nc-make ${why ? '' : 'green'}" data-x="make" ${selD ? '' : 'disabled'} data-say="${esc(t('noites.say.make', 'Fazer!'))}">${ic('craft', 46)}<span>${esc(t('noites.make', 'Fazer'))}</span></button>
        </div>
      </div>`;
    el.querySelector('.nc-grid')!.scrollTop = sc;
    const tabsEl = el.querySelectorAll<HTMLElement>('[data-cat]');
    tabsEl.forEach((b) =>
      b.addEventListener('click', () => {
        this.cat = b.dataset.cat as Cat;
        speak(b.dataset.say ?? '', { cool: 800, urgent: true });
        this.renderCraft(s, me);
      }),
    );
    el.querySelectorAll<HTMLElement>('[data-it]').forEach((b) =>
      b.addEventListener('click', () => {
        this.sel = b.dataset.it!;
        const d = ITEM[this.sel];
        const w = s.craftBlock(d) ?? (d.camp === 'bench' && s.benchLocked(d.benchTo!) ? 'baby' : null);
        speak(d.n() + (w ? '. ' + whyText(w, d, s) : ''), { cool: 300, urgent: true });
        this.renderCraft(s, me);
      }),
    );
    el.querySelector('[data-x="close"]')!.addEventListener('click', () => this.closeCraft());
    el.querySelector('[data-x="make"]')!.addEventListener('click', () => {
      if (!selD) return;
      if (why) {
        speak(whyText(why, selD, s), { cool: 300, urgent: true });
        return;
      }
      this.cb.craft(selD.id);
    });
  }
  private card(d: ItemDef, s: Sim, me: Player): string {
    const why = s.craftBlock(d);
    const have = (d.lamp && me.lampId === d.id) || (d.wear && me.wear[d.wear.slot] === d.id) || (d.axe && me.axe >= d.axe) || (d.bonk && me.bonk >= d.bonk) || why === 'have';
    const lockT = why === 'tier';
    const babyLock = d.camp === 'bench' && s.benchLocked(d.benchTo!);
    const cost = Object.entries(d.cost)
      .map(([k, n]) => `<span class="nc-chip ${(s.stash[k as Res] ?? 0) < (n ?? 0) ? 'no' : ''}">${ic(k, 18)}${n}</span>`)
      .join('');
    const lk = lockT ? `<span class="lk">${ic('lock', 18)}${ic('bench', 18)}${d.tier}</span>` : babyLock ? `<span class="lk">${ic('lock', 18)}${ic('baby', 18)}${BENCH_BABIES[d.benchTo!]}</span>` : d.pot && !s.hasPot() ? `<span class="lk">${ic('pot', 20)}</span>` : '';
    return `<div class="nc-card ${this.sel === d.id ? 'sel' : ''} ${lockT ? 'lock' : ''} ${!why && !babyLock ? 'ok' : ''}" data-it="${d.id}">${have ? `<span class="have">${ic('check', 20)}</span>` : ''}${lk}${itemIcon(d.id, 46)}<div class="nm">${esc(d.n())}</div><div class="cost">${cost}</div></div>`;
  }

  destroy(): void {
    for (const b of this.bound) b.destroy();
    this.craftEl?.remove();
    this.el.remove();
  }
}

const CAT_ICON: Record<Cat, string> = { tool: 'axe', light: 'lamp', build: 'fence', food: 'bowl', wear: 'scarf', camp: 'fire' };

export function whyText(w: string, d: ItemDef, s: Sim): string {
  switch (w) {
    case 'tier':
      return t('noites.why.tier', 'Precisa da bancada nível {n}.', { n: d.tier });
    case 'baby':
      return t('noites.why.baby', 'Resgate {n} bebês primeiro!', { n: BENCH_BABIES[d.benchTo ?? 0] - s.rescued });
    case 'pot':
      return t('noites.why.pot', 'Precisa da panela no acampamento.');
    case 'have':
      return t('noites.why.have', 'Você já tem isso!');
    case 'res': {
      const miss = Object.keys(d.cost).find((k) => (s.stash[k as Res] ?? 0) < (d.cost[k as Res] ?? 0));
      return t('noites.why.res', 'Falta {x}.', { x: miss ? resName(miss as Res) : '' });
    }
  }
  return '';
}
