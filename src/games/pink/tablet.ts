/* ============================================================
 *  BLOOP PINK — o TABLET: "site" do portal do franqueado.
 *  Abas: Pedidos, Móveis, Reforma, Equipe, Preços, Relatórios, Licenças, Coleção, Upgrades.
 *  Às vezes "dá BO": carrega devagar, cai por um tempinho, ou o pedido vem errado.
 * ============================================================ */
import { fmt, t } from '../../i18n';
import { sfx } from '../../audio';
import { brandCanvas, BRAND_SITE } from './brand';
import { CAT, CATS, demand, money, PRODUCTS, PROD, seasonAt, SEASONS, unlocked, YEAR, type CatId, type Product } from './catalog';
import { EXPANSIONS, FIX_DOOR, FIX_WALLS, FIX_WINDOW, FLOORS, FURN, LIGHTS, PAINTS, SHOP_FURN, SIGNS, STAFF, TABLET_UP, type FurnKind, type StaffKind } from './data';
import { ic } from './icons';
import type { ShopSave } from './save';
import { thumbUrl } from './thumb';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface TabletHost {
  readonly s: ShopSave;
  price(p: Product): number;
  order(cart: Record<string, number>): boolean;
  buyFurniture(k: FurnKind): void;
  renov(action: 'walls' | 'window' | 'door' | 'paint' | 'floor' | 'sign' | 'light' | 'exp', v?: string | number): boolean;
  hire(k: StaffKind): boolean;
  fire(i: number): void;
  buyLicense(c: CatId): boolean;
  upgradeTablet(): boolean;
  setPrice(id: string, mult: number): void;
  setAuto(on: boolean): void;
  stockOf(id: string): number;
  furnCount(k: FurnKind): number;
  close(): void;
}

type Tab = 'shop' | 'furn' | 'renov' | 'staff' | 'prices' | 'stats' | 'lic' | 'album' | 'up';
const TABS: { id: Tab; icon: string; name: () => string }[] = [
  { id: 'shop', icon: 'cart', name: () => t('pink.t.shop', 'Pedidos') },
  { id: 'furn', icon: 'sofa', name: () => t('pink.t.furn', 'Móveis') },
  { id: 'renov', icon: 'paint', name: () => t('pink.t.renov', 'Reforma') },
  { id: 'staff', icon: 'people', name: () => t('pink.t.staff', 'Equipe') },
  { id: 'prices', icon: 'tag', name: () => t('pink.t.prices', 'Preços') },
  { id: 'stats', icon: 'chart', name: () => t('pink.t.stats', 'Relatórios') },
  { id: 'lic', icon: 'lock', name: () => t('pink.t.lic', 'Licenças') },
  { id: 'album', icon: 'album', name: () => t('pink.t.album', 'Coleção') },
  { id: 'up', icon: 'up', name: () => t('pink.t.up', 'Upgrades') },
];

/** estado global do "servidor" (BO dura mesmo fechando o tablet) */
let downUntil = 0;

export class Tablet {
  readonly el: HTMLDivElement;
  private tab: Tab = 'shop';
  private cat: CatId | 'all' = 'all';
  private cart: Record<string, number> = {};
  private main!: HTMLDivElement;
  private loadT = 0;
  private boT = 0;
  constructor(
    parent: HTMLElement,
    private h: TabletHost,
    first: Tab = 'shop',
  ) {
    const o = document.createElement('div');
    o.className = 'pk-ov';
    o.innerHTML = `<div class="pk-tab"><button class="pk-tclose" aria-label="${esc(t('pink.close', 'Fechar'))}">${ic('close', 26)}</button>
      <div class="pk-scr">
        <div class="pk-url"><button data-a="back" aria-label="${esc(t('pink.t.reload', 'Recarregar'))}">${ic('rotate', 20)}</button><div class="bar"><span class="lock">🔒</span><span>${esc(BRAND_SITE)}</span><span class="pth"></span></div></div>
        <div class="pk-site"><div class="pk-nav"></div><div class="pk-main"></div></div>
      </div></div>`;
    parent.appendChild(o);
    this.el = o;
    o.addEventListener('pointerdown', (e) => e.stopPropagation());
    o.querySelector('.pk-tclose')!.addEventListener('click', () => h.close());
    o.addEventListener('click', (e) => {
      if (e.target === o) h.close();
    });
    o.querySelector('[data-a=back]')!.addEventListener('click', () => this.go(this.tab, true));
    this.main = o.querySelector('.pk-main') as HTMLDivElement;
    this.nav();
    this.go(first, true);
  }
  private nav(): void {
    const n = this.el.querySelector('.pk-nav') as HTMLDivElement;
    const cartN = Object.values(this.cart).reduce((a, b) => a + b, 0);
    n.innerHTML = TABS.map((tb) => `<button data-t="${tb.id}" class="${tb.id === this.tab ? 'on' : ''}">${ic(tb.icon, 28)}<span>${esc(tb.name())}</span>${tb.id === 'shop' && cartN ? `<i>${cartN}</i>` : ''}</button>`).join('');
    n.querySelectorAll<HTMLElement>('[data-t]').forEach((b) =>
      b.addEventListener('click', () => {
        sfx.play('tap');
        this.go(b.dataset.t as Tab, true);
      }),
    );
  }
  /** troca de aba com "carregando" (e às vezes BO) */
  go(tab: Tab, load: boolean): void {
    this.tab = tab;
    this.nav();
    (this.el.querySelector('.pth') as HTMLElement).textContent = '/' + tab;
    clearTimeout(this.loadT);
    clearTimeout(this.boT);
    const up = TABLET_UP[this.h.s.tab] ?? TABLET_UP[0];
    if (Date.now() < downUntil) return this.down();
    if (load) {
      const r = Math.random();
      if (r < up.bo * 0.25 && this.h.s.day > 1) {
        downUntil = Date.now() + 20000 + Math.random() * 20000;
        return this.down();
      }
      const slow = r < up.bo;
      const dur = up.load * (slow ? 3 : 1) * 1000;
      if (dur > 120) {
        this.render();
        const ld = document.createElement('div');
        ld.className = 'pk-load';
        ld.innerHTML = `<div class="spin"></div><div>${esc(slow ? t('pink.t.slow', 'Carregando... a internet tá lenta!') : t('pink.t.loading', 'Carregando...'))}</div><div class="bar"><b></b></div>`;
        this.main.parentElement!.appendChild(ld);
        const b = ld.querySelector('b') as HTMLElement;
        const t0 = performance.now();
        const tick = () => {
          const k = (performance.now() - t0) / dur;
          b.style.width = Math.min(100, (slow ? Math.pow(k, 2.2) : k) * 100) + '%';
          if (k >= 1 || !ld.isConnected) ld.remove();
          else this.loadT = window.setTimeout(tick, 60);
        };
        tick();
        return;
      }
    }
    this.render();
  }
  private down(): void {
    this.main.parentElement!.querySelector('.pk-bo')?.remove();
    const d = document.createElement('div');
    d.className = 'pk-bo';
    d.innerHTML = `${ic('bug', 64)}<div class="big">${esc(t('pink.t.bo', 'DEU BO!'))}</div><div>${esc(t('pink.t.down', 'O servidor da franquia caiu. Tente de novo daqui a pouquinho!'))}</div><div>${ic('wifiOff', 40)}</div><button class="pk-b">${ic('rotate', 22)}${esc(t('pink.t.retry', 'Tentar de novo'))}</button>`;
    this.main.parentElement!.appendChild(d);
    sfx.play('wrong');
    d.querySelector('button')!.addEventListener('click', () => {
      sfx.play('tap');
      if (Date.now() >= downUntil) {
        d.remove();
        this.go(this.tab, false);
      } else d.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }], { duration: 250 });
    });
    const poll = () => {
      if (!d.isConnected) return;
      if (Date.now() >= downUntil) {
        d.remove();
        this.go(this.tab, false);
      } else this.boT = window.setTimeout(poll, 1000);
    };
    this.boT = window.setTimeout(poll, 1000);
  }
  refresh(): void {
    const st = this.main.scrollTop;
    this.render();
    this.main.scrollTop = st;
  }
  private hero(title: string): string {
    return `<div class="pk-hero"><span class="logo"></span><b style="font-size:16px">${esc(title)}</b><span class="bal">${ic('coin', 20)}${esc(money(this.h.s.money))}</span></div>`;
  }
  private mountLogo(): void {
    const l = this.main.querySelector('.logo');
    if (l) {
      const c = brandCanvas(240, 60);
      c.style.height = '30px';
      l.replaceWith(c);
    }
  }
  private render(): void {
    const s = this.h.s;
    const lv = s.lvl;
    let html = '';
    switch (this.tab) {
      case 'shop': {
        html += this.hero(t('pink.t.shopT', 'Pedir estoque'));
        html += `<div class="pk-filters"><button data-c="all" class="${this.cat === 'all' ? 'on' : ''}">${ic('star', 16)}${esc(t('pink.t.all', 'Tudo'))}</button>${CATS.map((c) => `<button data-c="${c.id}" class="${this.cat === c.id ? 'on' : ''}">${ic(c.icon, 16)}${esc(c.name)}</button>`).join('')}</div>`;
        const list = PRODUCTS.filter((p) => this.cat === 'all' || p.cat === this.cat).sort((a, b) => +unlocked(b, lv, s.lic) - +unlocked(a, lv, s.lic) || a.lvl - b.lvl);
        html += '<div class="pk-grid">';
        for (const p of list.slice(0, this.cat === 'all' ? 60 : 99)) {
          const ok = unlocked(p, lv, s.lic);
          const n = this.cart[p.id] ?? 0;
          const hot = demand(p, s.day) > 1.1;
          const stock = this.h.stockOf(p.id);
          html += `<div class="pk-it${ok ? '' : ' lock'}" data-lv="${ok ? '' : esc(CAT[p.cat].price && !s.lic.includes(p.cat) && lv >= CAT[p.cat].lvl ? '🔒' : '★' + p.lvl)}">
            ${hot ? `<span class="tg hot">${esc(t('pink.t.hot', 'Em alta'))}</span>` : stock ? `<span class="tg">${ic('box', 12)}${stock}</span>` : ''}
            <img src="${thumbUrl(p)}" width="72" height="60" alt=""><div class="nm">${esc(p.name)}</div>
            <div class="pr">${ic('box', 14)}${p.box}× · ${esc(money(p.cost * p.box))}</div>
            ${ok ? `<div class="qty"><button data-m="${p.id}" aria-label="-">−</button><span>${n}</span><button data-p="${p.id}" aria-label="+">+</button></div>` : ''}</div>`;
        }
        html += '</div>';
        const tot = Object.entries(this.cart).reduce((a, [id, n]) => a + PROD[id].cost * PROD[id].box * n, 0);
        const boxes = Object.values(this.cart).reduce((a, b) => a + b, 0);
        html += `<div class="pk-cartbar">${ic('cart', 26)}<span>${boxes} ${ic('box', 16)} · ${esc(money(tot))}</span><button class="pk-b g" data-a="order" ${boxes && tot <= s.money ? '' : 'disabled'}>${ic('truck', 24)}${esc(t('pink.t.order', 'Pedir'))}</button></div>`;
        break;
      }
      case 'furn': {
        html += this.hero(t('pink.t.furnT', 'Móveis e decoração'));
        html += '<div class="pk-grid">';
        for (const k of SHOP_FURN) {
          const f = FURN[k];
          const ok = lv >= f.lvl;
          html += `<div class="pk-it${ok ? '' : ' lock'}" data-lv="★${f.lvl}" data-f="${k}">${this.h.furnCount(k) ? `<span class="tg">${this.h.furnCount(k)}</span>` : ''}${ic(f.icon, 54)}<div class="nm">${esc(f.name)}</div><div class="pr">${ic('coin', 14)}${esc(money(f.price))}</div>
            ${f.beauty ? `<div style="font-size:11px;color:#b03a74">${ic('sparkle', 12)}+${f.beauty}</div>` : ''}</div>`;
        }
        html += '</div>';
        break;
      }
      case 'renov': {
        const r = s.renov;
        html += this.hero(t('pink.t.renovT', 'Reforma da loja'));
        const fix = (id: string, icon: string, name: string, price: number, done: boolean) =>
          `<div class="pk-line">${ic(icon, 30)}<span class="grow">${esc(name)}</span>${done ? ic('check', 26) : `<button class="pk-b g" data-r="${id}" ${s.money >= price ? '' : 'disabled'}>${ic('coin', 18)}${esc(money(price))}</button>`}</div>`;
        html += `<div class="pk-sec">${ic('wall', 22)}${esc(t('pink.t.fix', 'Consertos'))}</div>`;
        html += fix('walls', 'wall', t('pink.r.walls', 'Consertar paredes, teto e toldo'), FIX_WALLS, r.walls);
        html += fix('window', 'window', t('pink.r.window', 'Vitrines novas'), FIX_WINDOW, r.window);
        html += fix('door', 'door', t('pink.r.door', 'Porta de vidro automática'), FIX_DOOR, r.door);
        html += `<div class="pk-sec">${ic('paint', 22)}${esc(t('pink.t.paint', 'Cor das paredes'))} ${r.walls ? '' : `<small>(${esc(t('pink.r.needWalls', 'conserte as paredes antes'))})</small>`}</div>
          <div class="pk-sw">${PAINTS.map((p) => `<button data-paint="${p.id}" class="${r.paint === p.id && r.walls ? 'on' : ''}" style="background:${p.c}" aria-label="${esc(p.name)}" ${r.walls ? '' : 'disabled'}></button>`).join('')}</div>
          <div style="font-size:12px;font-weight:700;color:#7a5a6a">${ic('coin', 14)} ${esc(money(80))}</div>`;
        html += `<div class="pk-sec">${ic('floor', 22)}${esc(t('pink.t.floor', 'Piso'))}</div>`;
        for (const f of FLOORS.filter((x) => x.id !== 'broken')) html += this.opt('floor', f.id, 'floor', f.name, f.price, f.lvl, r.floor === f.id, f.beauty);
        html += `<div class="pk-sec">${ic('sign', 22)}${esc(t('pink.t.sign', 'Placa da fachada'))}</div>`;
        for (const f of SIGNS.filter((x) => x.id !== 'none')) html += this.opt('sign', f.id, 'sign', f.name, f.price, f.lvl, r.sign === f.id, f.beauty);
        html += `<div class="pk-sec">${ic('bulb', 22)}${esc(t('pink.t.light', 'Iluminação'))}</div>`;
        LIGHTS.forEach((l, i) => {
          if (i > 0) html += this.opt('light', String(i), 'bulb', l.name, l.price, l.lvl, r.light === i, l.beauty, r.light > i);
        });
        html += `<div class="pk-sec">${ic('expand', 22)}${esc(t('pink.t.exp', 'Ampliar a loja'))}</div>`;
        EXPANSIONS.forEach((e, i) => {
          html += this.opt('exp', String(i + 1), 'expand', e.name, e.price, e.lvl, r.exp >= i + 1, 0, false, r.exp < i);
        });
        break;
      }
      case 'staff': {
        html += this.hero(t('pink.t.staffT', 'Equipe'));
        html += `<div class="pk-sec">${ic('people', 22)}${esc(t('pink.t.team', 'Minha equipe'))} (${s.staff.length})</div>`;
        if (!s.staff.length) html += `<div class="pk-line"><span class="grow">${esc(t('pink.t.noStaff', 'Ninguém ainda — você faz tudo sozinho!'))}</span></div>`;
        s.staff.forEach((m, i) => {
          const d = STAFF[m.k];
          html += `<div class="pk-line">${ic(d.icon, 28)}<span class="grow"><b>${esc(m.name)}</b> · ${esc(d.name)}</span><span>${ic('coin', 14)}${esc(money(d.wage))}/${esc(t('pink.t.dayShort', 'dia'))}</span><button class="pk-b w" data-fire="${i}">${ic('close', 18)}</button></div>`;
        });
        html += `<div class="pk-sec">${ic('up', 22)}${esc(t('pink.t.hire', 'Contratar'))}</div><div class="pk-grid">`;
        for (const k of Object.keys(STAFF) as StaffKind[]) {
          const d = STAFF[k];
          const ok = lv >= d.lvl;
          html += `<div class="pk-it${ok ? '' : ' lock'}" data-lv="★${d.lvl}" data-hire="${k}">${ic(d.icon, 48)}<div class="nm">${esc(d.name)}</div><div class="pr">${ic('coin', 14)}${esc(money(d.hire))}</div><div style="font-size:11px">${esc(money(d.wage))}/${esc(t('pink.t.dayShort', 'dia'))}</div></div>`;
        }
        html += '</div>';
        break;
      }
      case 'prices': {
        html += this.hero(t('pink.t.pricesT', 'Preços'));
        html += `<div style="font-size:12px;font-weight:700;color:#7a5a6a;text-align:left">${ic('tag', 16)} ${esc(t('pink.t.priceHelp', 'Preço justo = mercado. Mais caro dá mais lucro, mas o cliente pode achar caro!'))}</div>`;
        const list = PRODUCTS.filter((p) => unlocked(p, lv, s.lic) && (this.h.stockOf(p.id) > 0 || s.sold[p.id]));
        if (!list.length) html += `<div class="pk-line"><span class="grow">${esc(t('pink.t.noProducts', 'Peça produtos primeiro!'))}</span></div>`;
        for (const p of list) {
          const m = s.prices[p.id] ?? 1;
          const pr = this.h.price(p);
          const col = m > 1.3 ? '#e8336f' : m > 1.12 ? '#ff8a3a' : m < 0.9 ? '#3a8ad8' : '#2fa35a';
          html += `<div class="pk-line"><img src="${thumbUrl(p)}" width="36" height="30" alt=""><span class="grow">${esc(p.name)}<br><small style="color:#7a5a6a">${esc(t('pink.t.market', 'Mercado'))} ${esc(money(p.mkt))}</small></span><input type="range" min="0.7" max="1.6" step="0.05" value="${m}" data-pr="${p.id}"><b style="min-width:70px;color:${col}" data-pv="${p.id}">${esc(money(pr))}</b></div>`;
        }
        break;
      }
      case 'stats': {
        html += this.hero(t('pink.t.statsT', 'Relatórios'));
        const last = s.hist.slice(-10);
        const rev = s.hist.reduce((a, b) => a + b.rev, 0);
        html += `<div class="pk-stats">
          <div class="pk-stat">${ic('coin', 30)}<span>${esc(t('pink.t.revenue', 'Faturamento'))}<b>${esc(money(rev))}</b></span></div>
          <div class="pk-stat">${ic('people', 30)}<span>${esc(t('pink.t.customers', 'Clientes'))}<b>${fmt(s.totalCust)}</b></span></div>
          <div class="pk-stat">${ic('heart', 30)}<span>${esc(t('pink.t.rep', 'Reputação'))}<b>${Math.round(s.rep)}%</b></span></div>
          <div class="pk-stat">${ic('combo', 30)}<span>${esc(t('pink.t.bestCombo', 'Melhor combo'))}<b>×${s.bestCombo}</b></span></div></div>`;
        html += `<div class="pk-sec">${ic('chart', 22)}${esc(t('pink.t.days', 'Últimos dias'))}</div><canvas class="pk-chart" width="600" height="150"></canvas>`;
        const best = Object.entries(s.sold).sort((a, b) => b[1] - a[1]).slice(0, 5);
        html += `<div class="pk-sec">${ic('star', 22)}${esc(t('pink.t.best', 'Mais vendidos'))}</div>`;
        if (!best.length) html += `<div class="pk-line"><span class="grow">—</span></div>`;
        best.forEach(([id, n], i) => {
          const p = PROD[id];
          if (p) html += `<div class="pk-line"><b>${i + 1}º</b><img src="${thumbUrl(p)}" width="36" height="30" alt=""><span class="grow">${esc(p.name)}</span><b>${n}</b></div>`;
        });
        // tendência: estação atual e próxima
        const cur = seasonAt(s.day);
        const d = ((s.day % YEAR) + YEAR) % YEAR;
        const next = [...SEASONS].sort((a, b) => ((a.from - d + YEAR) % YEAR) - ((b.from - d + YEAR) % YEAR)).find((x) => x !== cur);
        html += `<div class="pk-sec">${ic('sun', 22)}${esc(t('pink.t.trend', 'Tendências'))}</div>`;
        if (cur) html += `<div class="pk-line" style="background:${cur.color}22">${ic('sparkle', 24)}<span class="grow"><b>${esc(cur.name)}</b> — ${esc(t('pink.t.now', 'agora!'))} ${Object.keys(cur.boost).map((c) => ic(CAT[c as CatId].icon, 20)).join('')}${cur.all ? '×2' : ''}</span></div>`;
        if (next) html += `<div class="pk-line">${ic('clock', 24)}<span class="grow"><b>${esc(next.name)}</b> — ${esc(t('pink.t.inDays', 'em {n} dias', { n: (next.from - d + YEAR) % YEAR }))} ${Object.keys(next.boost).map((c) => ic(CAT[c as CatId].icon, 20)).join('')}</span></div>`;
        const trending = PRODUCTS.filter((p) => unlocked(p, lv, s.lic))
          .sort((a, b) => demand(b, s.day) - demand(a, s.day))
          .slice(0, 4);
        html += `<div class="pk-grid">${trending.map((p) => `<div class="pk-it"><span class="tg hot">${esc(t('pink.t.hot', 'Em alta'))}</span><img src="${thumbUrl(p)}" width="72" height="60" alt=""><div class="nm">${esc(p.name)}</div></div>`).join('')}</div>`;
        this.main.innerHTML = html;
        this.mountLogo();
        this.chart(last);
        this.bind();
        return;
      }
      case 'lic': {
        html += this.hero(t('pink.t.licT', 'Licenças de produtos'));
        html += '<div class="pk-grid">';
        for (const c of CATS) {
          const owned = c.price === 0 || s.lic.includes(c.id);
          const ok = lv >= c.lvl;
          html += `<div class="pk-it${ok ? '' : ' lock'}${owned ? ' owned' : ''}" data-lv="★${c.lvl}" ${!owned && ok ? `data-lic="${c.id}"` : ''}>${ic(c.icon, 50)}<div class="nm">${esc(c.name)}</div><div class="pr">${owned ? ic('check', 18) : `${ic('coin', 14)}${esc(money(c.price))}`}</div><div style="font-size:11px">${PRODUCTS.filter((p) => p.cat === c.id).length} ${ic('box', 12)}</div></div>`;
        }
        html += '</div>';
        break;
      }
      case 'album': {
        const have = PRODUCTS.filter((p) => s.sold[p.id]).length;
        html += this.hero(t('pink.t.albumT', 'Coleção: {n} de {m}', { n: have, m: PRODUCTS.length }));
        html += '<div class="pk-grid" style="grid-template-columns:repeat(auto-fill,minmax(78px,1fr))">';
        for (const p of PRODUCTS) {
          const got = !!s.sold[p.id];
          html += `<div class="pk-it" style="${got ? '' : 'filter:brightness(0) opacity(.18)'}"><img src="${thumbUrl(p)}" width="60" height="50" alt=""><div style="font-size:10px;line-height:1.1">${got ? esc(p.name) : '?'}</div></div>`;
        }
        html += '</div>';
        break;
      }
      case 'up': {
        html += this.hero(t('pink.t.upT', 'Upgrades'));
        const cur = TABLET_UP[s.tab];
        const nx = TABLET_UP[s.tab + 1];
        html += `<div class="pk-line">${ic('tablet', 34)}<span class="grow"><b>${esc(cur.name)}</b><br><small>${ic('speed', 14)} ${cur.load}s · ${ic('bug', 14)} ${Math.round(cur.bo * 100)}%</small></span>${nx ? `<button class="pk-b g" data-a="tab" ${s.money >= nx.price ? '' : 'disabled'}>${ic('up', 20)}${esc(nx.name)} · ${esc(money(nx.price))}</button>` : ic('check', 26)}</div>`;
        html += `<div class="pk-line">${ic('truck', 34)}<span class="grow"><b>${esc(t('pink.t.auto', 'Pedido automático'))}</b><br><small>${esc(t('pink.t.autoHelp', 'Repõe sozinho o que acabou, no fim do dia'))}</small></span>${lv >= 22 ? `<button class="pk-b ${s.auto ? 'g' : 'w'}" data-a="auto">${s.auto ? ic('check', 20) : ic('close', 20)}</button>` : `<b>★22</b>`}</div>`;
        if (s.coupons > 0) html += `<div class="pk-line">${ic('gift', 34)}<span class="grow"><b>${esc(t('pink.t.coupons', 'Cupons de desconto'))}</b></span><b>${esc(money(s.coupons))}</b></div>`;
        break;
      }
    }
    this.main.innerHTML = html;
    this.mountLogo();
    this.bind();
  }
  private opt(kind: 'floor' | 'sign' | 'light' | 'exp', v: string, icon: string, name: string, price: number, lvl: number, on: boolean, beauty: number, passed = false, blocked = false): string {
    const s = this.h.s;
    const lock = s.lvl < lvl;
    return `<div class="pk-line" style="${lock ? 'opacity:.55' : ''}">${ic(icon, 28)}<span class="grow">${esc(name)}${beauty ? ` <small style="color:#b03a74">${ic('sparkle', 12)}+${beauty}</small>` : ''}</span>${
      on || passed ? ic('check', 26) : lock ? `<b>★${lvl}</b>` : blocked ? ic('lock', 24) : `<button class="pk-b g" data-${kind}="${v}" ${s.money >= price ? '' : 'disabled'}>${ic('coin', 18)}${esc(money(price))}</button>`
    }</div>`;
  }
  private chart(days: ShopSave['hist']): void {
    const c = this.main.querySelector('canvas.pk-chart') as HTMLCanvasElement | null;
    if (!c) return;
    const x = c.getContext('2d')!;
    const W = c.width;
    const H = c.height;
    x.clearRect(0, 0, W, H);
    if (!days.length) {
      x.fillStyle = '#c9a0b4';
      x.font = 'bold 18px sans-serif';
      x.textAlign = 'center';
      x.fillText('—', W / 2, H / 2);
      return;
    }
    const max = Math.max(10, ...days.map((d) => d.rev));
    const bw = (W - 40) / days.length;
    days.forEach((d, i) => {
      const h1 = (d.rev / max) * (H - 30);
      const h2 = (Math.max(0, d.prof) / max) * (H - 30);
      x.fillStyle = '#ffc6de';
      x.beginPath();
      x.roundRect(20 + i * bw + 4, H - 18 - h1, bw - 8, h1, 6);
      x.fill();
      x.fillStyle = '#ff5fa2';
      x.beginPath();
      x.roundRect(20 + i * bw + 10, H - 18 - h2, bw - 20, h2, 4);
      x.fill();
      x.fillStyle = '#7a5a6a';
      x.font = 'bold 12px sans-serif';
      x.textAlign = 'center';
      x.fillText(String(d.d), 20 + i * bw + bw / 2, H - 4);
    });
  }
  private bind(): void {
    const m = this.main;
    const h = this.h;
    const on = <T extends HTMLElement>(sel: string, f: (e: T) => void) => m.querySelectorAll<T>(sel).forEach((e) => e.addEventListener('click', () => f(e)));
    on('[data-c]', (e) => {
      sfx.play('tap');
      this.cat = e.dataset.c as CatId | 'all';
      this.render();
    });
    on('[data-p]', (e) => {
      const id = e.dataset.p!;
      this.cart[id] = Math.min(20, (this.cart[id] ?? 0) + 1);
      sfx.play('tap');
      this.refresh();
      this.nav();
    });
    on('[data-m]', (e) => {
      const id = e.dataset.m!;
      this.cart[id] = Math.max(0, (this.cart[id] ?? 0) - 1);
      if (!this.cart[id]) delete this.cart[id];
      sfx.play('tap');
      this.refresh();
      this.nav();
    });
    on('[data-a=order]', () => {
      if (h.order(this.cart)) {
        this.cart = {};
        this.refresh();
        this.nav();
      }
    });
    on('[data-f]', (e) => {
      const k = e.dataset.f as FurnKind;
      if (h.s.lvl < FURN[k].lvl) return void sfx.play('wrong');
      if (h.s.money < FURN[k].price) return void sfx.play('wrong');
      h.buyFurniture(k);
    });
    on('[data-r]', (e) => h.renov(e.dataset.r as 'walls') && this.refresh());
    on('[data-paint]', (e) => h.renov('paint', e.dataset.paint!) && this.refresh());
    on('[data-floor]', (e) => h.renov('floor', e.dataset.floor!) && this.refresh());
    on('[data-sign]', (e) => h.renov('sign', e.dataset.sign!) && this.refresh());
    on('[data-light]', (e) => h.renov('light', +e.dataset.light!) && this.refresh());
    on('[data-exp]', (e) => h.renov('exp', +e.dataset.exp!) && this.refresh());
    on('[data-hire]', (e) => {
      const k = e.dataset.hire as StaffKind;
      if (h.s.lvl < STAFF[k].lvl) return void sfx.play('wrong');
      if (h.hire(k)) this.refresh();
    });
    on('[data-fire]', (e) => {
      h.fire(+e.dataset.fire!);
      this.refresh();
    });
    on('[data-lic]', (e) => h.buyLicense(e.dataset.lic as CatId) && this.refresh());
    on('[data-a=tab]', () => h.upgradeTablet() && this.refresh());
    on('[data-a=auto]', () => {
      h.setAuto(!h.s.auto);
      this.refresh();
    });
    m.querySelectorAll<HTMLInputElement>('[data-pr]').forEach((r) =>
      r.addEventListener('input', () => {
        const id = r.dataset.pr!;
        h.setPrice(id, +r.value);
        const pv = m.querySelector(`[data-pv="${id}"]`) as HTMLElement;
        if (pv) pv.textContent = money(h.price(PROD[id]));
      }),
    );
  }
  dispose(): void {
    clearTimeout(this.loadT);
    clearTimeout(this.boT);
    this.el.remove();
  }
}
export type { Tab as TabletTab };
