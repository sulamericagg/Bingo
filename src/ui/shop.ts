/**
 * LOJA — abas Ofertas / Personagens / Rastros / Melhorias / Gemas.
 * Cosméticos com prévia (animada no detalhe), melhorias permanentes, turbos
 * consumíveis e produtos do Google Play Billing.
 */
import { BOOST_PACKS, ECONOMY, LINKS, PRODUCTS, UPGRADES, productById, type ProductDef } from '../config';
import { audio } from '../core/audio';
import {
  BOOST_IDS,
  UPGRADE_FX,
  UPGRADE_IDS,
  addCoins,
  addGems,
  boostCount,
  buyBoostPack,
  buyUpgrade,
  canAfford,
  extra,
  ownsSkin,
  ownsTrail,
  spend,
  unlockSkin,
  unlockTrail,
  upgradeCost,
  upgradeLevel,
  type BoostId,
  type UpgradeId,
} from '../core/economy';
import * as haptics from '../core/haptics';
import { isNative } from '../core/platform';
import { dayNumber, persist, save } from '../core/storage';
import type { Game } from '../game/game';
import { renderSkinPreview, renderTrailPreview } from '../game/preview';
import { RARITY_INFO, RARITY_ORDER, SKINS, TRAILS, cosmeticDesc, cosmeticName, isEventOnly, skinDesc, skinName, trailDesc, trailName, type Price, type Rarity, type Skin, type Trail } from '../game/skins';
import { t } from '../i18n';
import { showRewarded } from '../services/ads';
import { billingSupported, buy, flashBonus, ownsProduct, priceOf } from '../services/billing';
import { celebrate } from './celebrate';
import { $, $$, COIN, GEM, clock, esc, fmt, msToMidnight } from './dom';
import { icon, type IconName } from './icons';

export type ShopTab = 'offers' | 'skins' | 'trails' | 'upgrades' | 'gems';

export interface ShopHost {
  game: Game;
  toast(msg: string, ico?: IconName): void;
  open(screen: string, arg?: string): void;
  flyReward(r: { coins?: number; gems?: number }, from: HTMLElement): void;
  freeCoins(): Promise<void>;
  freeLeft(): number;
  freeAmount: number;
}

/* ---------------- textos ---------------- */

export const UPGRADE_INFO: Record<UpgradeId, { name: string; icon: IconName; plate: string; desc: string; effect: (lv: number) => string }> = {
  magnet: {
    get name() { return t('upg.magnet', 'Ímã'); },
    icon: 'magnet',
    plate: 'pink',
    get desc() { return t('upg.magnet.desc', 'Atrai moedas de mais longe.'); },
    effect: (lv) => t('upg.magnet.fx', 'raio +{n}%', { n: UPGRADE_FX.magnetPct(lv) }),
  },
  shield: {
    get name() { return t('upg.shield', 'Escudo'); },
    icon: 'shield',
    plate: 'cyan',
    get desc() { return t('upg.shield.desc', 'Chance de começar com escudo e mais tempo invencível após um impacto.'); },
    effect: (lv) => t('upg.shield.fx', '{n}% de chance', { n: UPGRADE_FX.shieldStartPct(lv) }),
  },
  coinValue: {
    get name() { return t('upg.coinValue', 'Valor da moeda'); },
    icon: 'coins',
    plate: 'gold',
    get desc() { return t('upg.coinValue.desc', 'Cada moeda coletada vale mais.'); },
    effect: (lv) => t('upg.coinValue.fx', 'moedas +{n}%', { n: UPGRADE_FX.coinPct(lv) }),
  },
};

export const BOOST_INFO: Record<BoostId, { name: string; short: string; plural: string; icon: IconName; plate: string; desc: string }> = {
  shield: {
    get name() { return t('boost.shield', 'Escudo'); },
    get short() { return t('boost.shield.short', 'Escudo'); },
    get plural() { return t('boost.shield.pl', 'Escudos'); },
    icon: 'shield',
    plate: 'cyan',
    get desc() { return t('boost.shield.desc', 'Começa a partida protegido: aguenta 1 batida.'); },
  },
  magnet: {
    get name() { return t('boost.magnet', 'Ímã'); },
    get short() { return t('boost.magnet.short', 'Ímã'); },
    get plural() { return t('boost.magnet.pl', 'Ímãs'); },
    icon: 'magnet',
    plate: 'pink',
    get desc() { return t('boost.magnet.desc', 'Puxa moedas de longe durante a partida toda.'); },
  },
  headstart: {
    get name() { return t('boost.headstart', 'Largada Turbo'); },
    get short() { return t('boost.headstart.short', 'Turbo'); },
    get plural() { return t('boost.headstart.pl', 'Largadas Turbo'); },
    icon: 'rocket',
    plate: 'gold',
    get desc() { return t('boost.headstart.desc', 'Decola de foguete pelos primeiros planetas.'); },
  },
};

/** Composição ilustrada dos produtos: placa brilhante + ícone principal + acento. */
const PRODUCT_ART: Record<string, { main: IconName; plate: string; accent?: IconName }> = {
  starter_pack: { main: 'chest', plate: 'gold', accent: 'star' },
  remove_ads: { main: 'no-ads', plate: 'violet', accent: 'shield' },
  gems_small: { main: 'gem', plate: 'violet' },
  gems_medium: { main: 'gem-pile', plate: 'violet', accent: 'sparkle' },
  gems_large: { main: 'gem-heap', plate: 'pink', accent: 'sparkle' },
  gems_mega: { main: 'gem-chest', plate: 'gold', accent: 'crown' },
  coin_doubler: { main: 'coins', plate: 'green', accent: 'arrow-up' },
  boost_bundle: { main: 'rocket', plate: 'cyan', accent: 'shield' },
  vip_pack: { main: 'crown', plate: 'gold', accent: 'gem' },
  mega_bundle: { main: 'gem-chest', plate: 'pink', accent: 'coins' },
  flash_gems: { main: 'gem-heap', plate: 'pink', accent: 'fire' },
  convert: { main: 'refresh', plate: 'violet', accent: 'coin' },
  free: { main: 'video', plate: 'green', accent: 'coin' },
};

export function productArt(id: string): string {
  const a = PRODUCT_ART[id] ?? { main: 'gem' as IconName, plate: 'cyan' };
  return `<div class="p-ico plate plate-${a.plate}">${icon(a.main)}${a.accent ? `<span class="p-accent">${icon(a.accent)}</span>` : ''}</div>`;
}

export function productTitle(p: ProductDef): string {
  switch (p.id) {
    case 'starter_pack':
      return t('prod.starter_pack', 'Pacote Inicial');
    case 'remove_ads':
      return t('prod.remove_ads', 'Sem Anúncios');
    case 'coin_doubler':
      return t('prod.coin_doubler', 'Dobrador de Moedas');
    case 'boost_bundle':
      return t('prod.boost_bundle', 'Kit Turbo');
    case 'vip_pack':
      return t('prod.vip_pack', 'Pacote VIP');
    case 'mega_bundle':
      return t('prod.mega_bundle', 'Mega Pacote');
    case 'flash_gems':
      return t('prod.gems', '{n} Gemas', { n: fmt(p.gems) });
  }
  if (p.skin && p.kind === 'cosmetic') {
    const s = SKINS.find((x) => x.id === p.skin);
    return s ? skinName(s) : p.id;
  }
  if (p.trail && p.kind === 'cosmetic') {
    const tl = TRAILS.find((x) => x.id === p.trail);
    return t('prod.trail', 'Rastro {name}', { name: tl ? trailName(tl) : p.id });
  }
  return t('prod.gems', '{n} Gemas', { n: fmt(p.gems) });
}

export function productDesc(p: ProductDef): string {
  switch (p.id) {
    case 'starter_pack':
      return t('prod.starter_pack.desc', 'Sem anúncios + {gems} {GEM} + {coins} {COIN} + skin lendária Galáxia', { gems: p.gems, coins: fmt(p.coins), GEM, COIN });
    case 'remove_ads':
      return t('prod.remove_ads.desc', 'Remove banners e intersticiais para sempre');
    case 'coin_doubler':
      return t('prod.coin_doubler.desc', 'Ganhe 2x moedas em todas as partidas, para sempre');
    case 'boost_bundle':
      return t('prod.boost_bundle.desc', '5 Escudos + 5 Ímãs + 5 Largadas Turbo');
    case 'vip_pack':
      return t('prod.vip_pack.desc', 'Sem anúncios + Dobrador 2x + {gems} {GEM} + skin Rei Dourado', { gems: fmt(p.gems), GEM });
    case 'mega_bundle':
      return t('prod.mega_bundle.desc', '{gems} {GEM} + {coins} {COIN} + 10 de cada turbo', { gems: fmt(p.gems), coins: fmt(p.coins), GEM, COIN });
    case 'gems_mega':
      return t('prod.gems_mega.desc', 'Melhor custo-benefício!');
  }
  if (p.kind === 'cosmetic') {
    const s = p.skin ? SKINS.find((x) => x.id === p.skin) : undefined;
    const tl = p.trail ? TRAILS.find((x) => x.id === p.trail) : undefined;
    return esc((s ? skinDesc(s) : tl ? trailDesc(tl) : undefined) ?? t('prod.mythic.desc', 'Item mítico exclusivo'));
  }
  return t('prod.gems.desc', 'Para skins épicas, melhorias e continuar');
}

const BADGE_TEXT: Record<string, string> = {
  get best() { return t('shop.badge.best', 'MELHOR OFERTA'); },
  get popular() { return t('shop.badge.popular', 'POPULAR'); },
  get sale() { return t('shop.badge.sale', 'PROMOÇÃO'); },
};

/* ============================== prévias (cache + sob demanda) ============================== */

/**
 * Desenhar ~45 personagens vetoriais a cada abertura da loja travava o toque por centenas de ms
 * em celular fraco. Agora: cada prévia é desenhada uma vez (cache) e só quando o card chega
 * perto da tela (IntersectionObserver); reabrir a loja/trocar de aba só reaproveita os bitmaps.
 */
const previewCache = new Map<string, HTMLCanvasElement>();
function cachedPreview(item: Skin | Trail, isSkin: boolean): HTMLCanvasElement {
  const k = (isSkin ? 's:' : 't:') + item.id;
  let c = previewCache.get(k);
  if (!c) {
    c = isSkin ? renderSkinPreview(item as Skin, 92) : renderTrailPreview(item as Trail, 92);
    previewCache.set(k, c);
  }
  if (!c.isConnected) return c;
  // já está na tela (não deveria): devolve uma cópia barata
  const cp = document.createElement('canvas');
  cp.width = c.width;
  cp.height = c.height;
  cp.style.cssText = c.style.cssText;
  cp.getContext('2d')?.drawImage(c, 0, 0);
  return cp;
}

let previewIO: IntersectionObserver | null = null;
const pending = new WeakMap<Element, () => void>();
function lazyPreview(item: Skin | Trail, isSkin: boolean): HTMLElement {
  const k = (isSkin ? 's:' : 't:') + item.id;
  const hit = previewCache.get(k);
  if ((hit && !hit.isConnected) || typeof IntersectionObserver === 'undefined') return cachedPreview(item, isSkin);
  const ph = document.createElement('canvas');
  ph.width = ph.height = 1;
  ph.style.width = ph.style.height = '92px';
  previewIO ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        previewIO!.unobserve(e.target);
        const fn = pending.get(e.target);
        pending.delete(e.target);
        fn?.();
      }
    },
    { rootMargin: '160px 0px' },
  );
  pending.set(ph, () => {
    if (ph.isConnected) ph.replaceWith(cachedPreview(item, isSkin));
  });
  previewIO.observe(ph);
  return ph;
}

/* ============================== loja ============================== */

export class Shop {
  tab: ShopTab = 'skins';
  private host: ShopHost;
  private tick = 0;
  private sheetRaf = 0;

  constructor(host: ShopHost) {
    this.host = host;
  }

  private get native(): boolean {
    return isNative && billingSupported();
  }

  /** Para timers ao fechar a loja. */
  stop(): void {
    clearInterval(this.tick);
    this.tick = 0;
    this.closeSheet();
  }

  render(): void {
    $$('#shop .tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === this.tab));
    document.querySelector('#shop .tabs .dot')?.classList.toggle('hidden', extra.flashDay === dayNumber());
    const body = $('#shop-body');
    const keep = body.dataset.tab === this.tab ? body.scrollTop : 0;
    body.dataset.tab = this.tab;
    previewIO?.disconnect(); // prévias pendentes da renderização anterior
    body.innerHTML = '';
    clearInterval(this.tick);
    this.tick = 0;
    if (this.tab === 'offers') this.renderOffers(body);
    else if (this.tab === 'gems') this.renderGems(body);
    else if (this.tab === 'upgrades') this.renderUpgrades(body);
    else this.renderCosmetics(body, this.tab === 'skins');
    body.scrollTop = keep;
  }

  /* ---------------- cosméticos ---------------- */

  private renderCosmetics(body: HTMLElement, isSkin: boolean): void {
    const items: (Skin | Trail)[] = isSkin ? SKINS : TRAILS;
    const owned = items.filter((i) => (isSkin ? ownsSkin(i.id) : ownsTrail(i.id))).length;
    body.insertAdjacentHTML('beforeend', `<p class="muted shop-count">${t('shop.unlockedCount', '{n}/{total} desbloqueados · toque para ver', { n: owned, total: items.length })}</p>`);
    for (const r of RARITY_ORDER) {
      const group = items.filter((i) => i.rarity === r);
      if (!group.length) continue;
      const info = RARITY_INFO[r];
      body.insertAdjacentHTML('beforeend', `<div class="section-title rarity-title" style="--rc:${info.color}"><span class="r-dot r-${r}"></span>${info.label}</div>`);
      const grid = document.createElement('div');
      grid.className = 'grid';
      for (const item of group) grid.appendChild(this.card(item, isSkin));
      body.appendChild(grid);
    }
  }

  private card(item: Skin | Trail, isSkin: boolean): HTMLElement {
    const owned = isSkin ? ownsSkin(item.id) : ownsTrail(item.id);
    const equipped = isSkin ? save.skin === item.id : save.trail === item.id;
    const ev = isEventOnly(item.price) && !owned;
    const card = document.createElement('div');
    card.className = `card rc-${item.rarity}` + (equipped ? ' equipped' : '') + (ev ? ' event' : '');
    card.style.setProperty('--rc', RARITY_INFO[item.rarity].color);
    card.appendChild(lazyPreview(item, isSkin));
    card.insertAdjacentHTML('beforeend', `<span class="rarity r-${item.rarity}">${RARITY_INFO[item.rarity].label}</span>`);
    if (ev) card.insertAdjacentHTML('beforeend', `<span class="event-tag">${icon('ticket')}Evento</span>`);
    card.insertAdjacentHTML('beforeend', `<div class="name">${esc(cosmeticName(item, isSkin))}</div>`);
    if (ev) card.insertAdjacentHTML('beforeend', `<div class="card-note">${t('shop.challengeOnly', 'Só com código de desafio')}</div>`);
    const btn = document.createElement('button');
    btn.className = 'price';
    this.fillAction(btn, item, isSkin);
    btn.onclick = (e) => {
      e.stopPropagation();
      this.onItem(item, isSkin, btn);
    };
    card.appendChild(btn);
    card.onclick = () => {
      if (ev) {
        // exclusivo de evento: vai direto para o resgate de código
        this.host.toast(t('shop.eventOnly', 'Exclusivo de evento: só com código de desafio'), 'ticket');
        this.host.open('redeem');
      } else this.openSheet(item, isSkin);
    };
    return card;
  }

  private fillAction(btn: HTMLButtonElement, item: Skin | Trail, isSkin: boolean): void {
    const owned = isSkin ? ownsSkin(item.id) : ownsTrail(item.id);
    const equipped = isSkin ? save.skin === item.id : save.trail === item.id;
    btn.className = 'price';
    if (equipped) {
      btn.classList.add('on');
      btn.innerHTML = `${icon('check')} ${t('shop.equipped', 'Equipado')}`;
    } else if (owned) {
      btn.classList.add('equip');
      btn.textContent = t('shop.equip', 'Equipar');
    } else this.fillPrice(btn, item.price, item.id);
  }

  private fillPrice(btn: HTMLElement, p: Price, id: string): void {
    if (p.event) {
      btn.classList.add('event');
      btn.innerHTML = `${icon('ticket')} ${t('shop.code', 'Código')}`;
    } else if (p.coins) {
      btn.innerHTML = `${COIN}${fmt(p.coins)}`;
      if (!canAfford(p)) btn.classList.add('cant');
    } else if (p.gems) {
      btn.innerHTML = `${GEM}${fmt(p.gems)}`;
      if (!canAfford(p)) btn.classList.add('cant');
    } else if (p.ads) {
      btn.classList.add('ad');
      btn.innerHTML = `${icon('video')} ${save.adProgress[id] ?? 0}/${p.ads}`;
    } else if (p.iap) {
      const def = productById(p.iap);
      btn.classList.add('iap');
      btn.innerHTML = def && def.kind === 'cosmetic' ? esc(priceOf(def)) : `${icon('gift')} ${t('shop.pack', 'Pacote')}`;
    }
  }

  private async onItem(item: Skin | Trail, isSkin: boolean, from: HTMLElement): Promise<void> {
    const owned = () => (isSkin ? ownsSkin(item.id) : ownsTrail(item.id));
    const unlock = async () => {
      if (isSkin) unlockSkin(item.id);
      else unlockTrail(item.id);
      equip();
      await celebrate(isSkin ? { skins: [item.id] } : { trails: [item.id] }, { title: t('shop.unlocked', 'DESBLOQUEADO!'), subtitle: t('shop.unlockedSub', 'Já equipado. Bora jogar!') });
    };
    const equip = () => {
      if (isSkin) save.skin = item.id;
      else save.trail = item.id;
      persist();
      this.host.game.refreshCosmetics();
      this.render();
      this.refreshSheet();
    };
    if (owned()) {
      equip();
      haptics.tap('light');
      return;
    }
    const p = item.price;
    if (p.event) {
      this.closeSheet();
      this.host.open('redeem');
      return;
    }
    if (p.iap) {
      const def = productById(p.iap);
      if (!def) return;
      if (def.kind !== 'cosmetic') {
        // vem dentro de um pacote (ex.: Galáxia no Pacote Inicial)
        this.closeSheet();
        this.tab = 'offers';
        this.render();
        this.host.toast(t('shop.comesIn', '{item} vem no {pack}', { item: cosmeticName(item, isSkin), pack: productTitle(def) }), 'gift');
        return;
      }
      await this.buyProduct(def, from);
      return;
    }
    if (p.ads) {
      const ok = await showRewarded();
      if (!ok) return this.host.toast(t('shop.noVideo', 'Vídeo indisponível agora'), 'video');
      save.adProgress[item.id] = (save.adProgress[item.id] ?? 0) + 1;
      persist();
      if (save.adProgress[item.id] >= p.ads) await unlock();
      else {
        this.host.toast(t('shop.keepWatching', '{n}/{total} — continue assistindo!', { n: save.adProgress[item.id], total: p.ads }), 'video');
        this.render();
        this.refreshSheet();
      }
      return;
    }
    if (!spend(p)) {
      if (p.gems) {
        this.host.toast(t('shop.noGems', 'Gemas insuficientes'), 'gem');
        this.closeSheet();
        this.tab = 'gems';
        this.render();
      } else this.host.toast(t('shop.noCoinsPlay', 'Moedas insuficientes — jogue mais ou pegue grátis'), 'coin');
      return;
    }
    await unlock();
  }

  /* ---------------- detalhe animado ---------------- */

  private sheet: { item: Skin | Trail; isSkin: boolean } | null = null;

  private openSheet(item: Skin | Trail, isSkin: boolean): void {
    this.closeSheet();
    this.sheet = { item, isSkin };
    const info = RARITY_INFO[item.rarity];
    const el = document.createElement('div');
    el.className = 'item-sheet';
    el.innerHTML = `<div class="sheet-card rc-${item.rarity}" style="--rc:${info.color}">
      <button class="icon-btn close sheet-x" aria-label="${t('common.close', 'Fechar')}">${icon('close')}</button>
      <div class="sheet-art"><canvas></canvas></div>
      <span class="rarity big r-${item.rarity}">${info.label}</span>
      <h3>${esc(cosmeticName(item, isSkin))}</h3>
      <p class="muted sheet-desc">${esc(cosmeticDesc(item, isSkin) ?? (isSkin ? t('shop.skinDesc', 'Visual exclusivo para o seu Bloop.') : t('shop.trailDesc', 'Deixe um rastro de estilo pelo espaço.')))}</p>
      ${isEventOnly(item.price) ? `<p class="sheet-event">${icon('ticket')} ${t('shop.eventOnly', 'Exclusivo de evento: só com código de desafio')}</p>` : ''}
      <button class="price big"></button>
    </div>`;
    $('#shop .panel').appendChild(el);
    el.onclick = (e) => {
      if (e.target === el) this.closeSheet();
    };
    $('.sheet-x', el).onclick = () => this.closeSheet();
    const btn = $<HTMLButtonElement>('.price', el);
    btn.onclick = () => this.onItem(item, isSkin, btn);
    this.refreshSheet();
    const cv = $<HTMLCanvasElement>('canvas', el);
    const t0 = performance.now();
    let lastTrail = 0;
    const loop = (now: number) => {
      if (!this.sheet) return;
      const t = (now - t0) / 1000;
      if (isSkin) renderSkinPreview(item as Skin, 168, 0.4 + t, { target: cv });
      else if (now - lastTrail > 90) {
        lastTrail = now;
        renderTrailPreview(item as Trail, 168, cv);
      }
      this.sheetRaf = requestAnimationFrame(loop);
    };
    this.sheetRaf = requestAnimationFrame(loop);
    requestAnimationFrame(() => el.classList.add('on'));
  }

  private refreshSheet(): void {
    const el = document.querySelector<HTMLElement>('#shop .item-sheet');
    if (!el || !this.sheet) return;
    const btn = $<HTMLButtonElement>('.price', el);
    this.fillAction(btn, this.sheet.item, this.sheet.isSkin);
    btn.classList.add('big');
  }

  closeSheet(): void {
    cancelAnimationFrame(this.sheetRaf);
    this.sheet = null;
    document.querySelectorAll('#shop .item-sheet').forEach((e) => e.remove());
  }

  /* ---------------- melhorias + turbos ---------------- */

  private renderUpgrades(body: HTMLElement): void {
    const add = (h: string) => body.insertAdjacentHTML('beforeend', h);
    add(`<div class="section-title">${t('shop.upgrades', 'Melhorias permanentes')}</div>`);
    for (const id of UPGRADE_IDS) {
      const inf = UPGRADE_INFO[id];
      const lv = upgradeLevel(id);
      const cost = upgradeCost(id);
      const pips = Array.from({ length: UPGRADES.maxLevel }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
      const next = cost
        ? `<span class="u-next">${icon('arrow-up')}<span>${lv ? `${esc(inf.effect(lv))} → ` : ''}<b>${esc(inf.effect(lv + 1))}</b></span></span>`
        : `<span class="u-next max">${icon('crown')}<span>${t('shop.max', 'Máximo:')} <b>${esc(inf.effect(lv))}</b></span></span>`;
      add(`<div class="upg">
        <div class="p-ico plate plate-${inf.plate}">${icon(inf.icon)}</div>
        <div class="u-info">
          <div class="u-title">${inf.name} <small>${t('shop.lvl', 'Nv {n}/{max}', { n: lv, max: UPGRADES.maxLevel })}</small></div>
          <div class="pips">${pips}</div>
          <div class="u-desc">${esc(inf.desc)}</div>
          ${next}
        </div>
        <div class="u-buy">${
          cost
            ? `<button class="price ${save.coins < cost.coins ? 'cant' : ''}" data-up="${id}" data-cur="coins">${COIN}${fmt(cost.coins)}</button>
               <button class="price gemskip ${save.gems < cost.gems ? 'cant' : ''}" data-up="${id}" data-cur="gems">${GEM}${cost.gems}</button>`
            : `<span class="u-maxed">${icon('check')}</span>`
        }</div>
      </div>`);
    }
    add(`<div class="section-title">${t('shop.boosts', 'Turbos')} <small>${t('shop.boostsHint', '(usados ao começar a partida)')}</small></div>`);
    for (const id of BOOST_IDS) {
      const inf = BOOST_INFO[id];
      const pk = BOOST_PACKS[id];
      add(`<div class="upg boost" id="boost-row-${id}">
        <div class="p-ico plate plate-${inf.plate}">${icon(inf.icon)}<em class="count">${boostCount(id)}</em></div>
        <div class="u-info">
          <div class="u-title">${inf.name}</div>
          <div class="u-desc">${inf.desc}</div>
        </div>
        <div class="u-buy">
          <button class="price ${save.coins < pk.coins.price ? 'cant' : ''}" data-boost="${id}" data-cur="coins"><small>+${pk.coins.n}</small>${COIN}${fmt(pk.coins.price)}</button>
          <button class="price gemskip ${save.gems < pk.gems.price ? 'cant' : ''}" data-boost="${id}" data-cur="gems"><small>+${pk.gems.n}</small>${GEM}${pk.gems.price}</button>
        </div>
      </div>`);
    }
    add(`<div class="section-title">${t('shop.powerUp', 'Turbine de vez')}</div>`);
    for (const pid of ['coin_doubler', 'boost_bundle']) {
      const def = productById(pid)!;
      if (ownsProduct(def)) continue;
      add(this.productRow(def));
    }
    if (extra.coinDoubler) add(`<p class="muted owned-note">${icon('check')} ${t('shop.doublerOn', 'Dobrador de Moedas ativo: 2x moedas em toda partida')}</p>`);

    $$<HTMLButtonElement>('[data-up]', body).forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.up as UpgradeId;
        const cur = b.dataset.cur as 'coins' | 'gems';
        if (!buyUpgrade(id, cur)) {
          this.host.toast(cur === 'gems' ? t('shop.noGems', 'Gemas insuficientes') : t('shop.noCoins', 'Moedas insuficientes'), cur === 'gems' ? 'gem' : 'coin');
          if (cur === 'gems') {
            this.tab = 'gems';
            this.render();
          }
          return;
        }
        audio.unlock2();
        haptics.success();
        this.host.toast(t('shop.upgraded', '{name} subiu para o nível {n}!', { name: UPGRADE_INFO[id].name, n: upgradeLevel(id) }), 'arrow-up');
        this.render();
      };
    });
    $$<HTMLButtonElement>('[data-boost]', body).forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.boost as BoostId;
        const cur = b.dataset.cur as 'coins' | 'gems';
        const n = buyBoostPack(id, cur);
        if (!n) {
          this.host.toast(cur === 'gems' ? t('shop.noGems', 'Gemas insuficientes') : t('shop.noCoins', 'Moedas insuficientes'), cur === 'gems' ? 'gem' : 'coin');
          return;
        }
        audio.cash();
        haptics.tap('medium');
        this.host.toast(`+${n} ${BOOST_INFO[id].plural}!`, BOOST_INFO[id].icon);
        this.render();
      };
    });
    this.bindBuy(body);
  }

  /* ---------------- ofertas ---------------- */

  private renderOffers(body: HTMLElement): void {
    const add = (h: string) => body.insertAdjacentHTML('beforeend', h);
    const flash = productById('flash_gems')!;
    const bought = extra.flashDay === dayNumber();
    const bonus = flashBonus();
    const bonusTxt = [
      bonus.coins ? `${fmt(bonus.coins)} ${COIN}` : '',
      ...(['shield', 'magnet', 'headstart'] as const).filter((k) => bonus.boosts?.[k]).map((k) => `${bonus.boosts![k]} ${BOOST_INFO[k][bonus.boosts![k] === 1 ? 'name' : 'plural']}`),
    ]
      .filter(Boolean)
      .join(' + ');
    add(`<div class="flash ${bought ? 'done' : ''}">
      <div class="flash-head"><span>${icon('fire')} ${t('shop.flash', 'OFERTA RELÂMPAGO')}</span><span class="flash-timer">${icon('clock')}<b data-countdown>${clock(msToMidnight())}</b></span></div>
      <div class="flash-body">
        ${productArt('flash_gems')}
        <div class="p-info">
          <div class="p-title">${fmt(flash.gems)} ${GEM} <span class="off">-50%</span></div>
          <div class="p-desc">${t('shop.todayBonus', 'Bônus de hoje:')} <b>${bonusTxt}</b></div>
        </div>
      </div>
      <div class="flash-buy">
        ${flash.wasPrice ? `<s>${flash.wasPrice}</s>` : ''}
        ${bought ? `<span class="flash-ok">${icon('check')} ${t('shop.boughtToday', 'Comprado hoje · volte amanhã')}</span>` : `<button class="price big" data-buy="flash_gems">${esc(priceOf(flash))}</button>`}
      </div>
    </div>`);

    const order = ['starter_pack', 'vip_pack', 'mega_bundle', 'boost_bundle', 'coin_doubler'];
    add(`<div class="section-title">${t('shop.packs', 'Pacotes')}</div>`);
    for (const pid of order) {
      const def = productById(pid)!;
      if (ownsProduct(def)) continue;
      add(this.productRow(def));
    }
    add(`<div class="section-title">${t('shop.mythics', 'Míticos exclusivos')}</div>`);
    for (const def of PRODUCTS.filter((p) => p.kind === 'cosmetic')) {
      if (ownsProduct(def)) continue;
      add(this.productRow(def, true));
    }
    $$('.product[data-preview]', body).forEach((row) => {
      const def = productById(row.dataset.preview!)!;
      const art = $('.p-ico', row);
      art.innerHTML = '';
      const s = def.skin ? SKINS.find((x) => x.id === def.skin) : undefined;
      const tl = def.trail ? TRAILS.find((x) => x.id === def.trail) : undefined;
      if (s) art.appendChild(renderSkinPreview(s, 64));
      else if (tl) art.appendChild(renderTrailPreview(tl, 64));
    });
    add(`<button class="code-cta" data-open="redeem">${icon('ticket', { size: 40 })}<span><b>${t('shop.haveCode', 'Tem um código?')}</b><small>${t('shop.haveCodeSub', 'Resgate prêmios de eventos e desafios')}</small></span>${icon('arrow-up', { class: 'cta-arrow' })}</button>`);
    if (!isNative) add(`<p class="muted">${t('shop.androidOnly', 'Compras disponíveis no app Android.')}<br/><a class="link" href="${LINKS.playStore}" target="_blank" rel="noopener">${t('shop.getOnPlay', 'Baixar na Google Play')}</a></p>`);

    this.bindBuy(body);
    const cd = $('[data-countdown]', body);
    this.tick = window.setInterval(() => {
      const left = msToMidnight();
      cd.textContent = clock(left);
      if (left < 1000) this.render();
    }, 1000);
  }

  private productRow(p: ProductDef, preview = false): string {
    const badge = p.badge ? BADGE_TEXT[p.badge] : '';
    const featured = p.kind === 'starter' || p.kind === 'vip';
    const r: Rarity | undefined = p.kind === 'cosmetic' ? (p.skin ? SKINS.find((s) => s.id === p.skin)?.rarity : TRAILS.find((x) => x.id === p.trail)?.rarity) : undefined;
    return `<div class="product ${featured ? 'featured' : ''} ${p.kind === 'vip' ? 'vip' : ''} ${r ? 'rc-' + r : ''}" ${preview ? `data-preview="${p.id}"` : ''}>
      ${badge ? `<span class="p-badge ${p.badge}">${badge}</span>` : ''}
      ${preview ? `<div class="p-ico cos-art"></div>` : productArt(p.id)}
      <div class="p-info">
        <div class="p-title">${esc(productTitle(p))}${r ? ` <span class="rarity inline r-${r}">${RARITY_INFO[r].label}</span>` : ''}</div>
        <div class="p-desc">${productDesc(p)}</div>
      </div>
      <div class="p-buy">${p.wasPrice ? `<s>${p.wasPrice}</s>` : ''}<button class="price" data-buy="${p.id}">${esc(priceOf(p))}</button></div>
    </div>`;
  }

  private bindBuy(body: HTMLElement): void {
    $$<HTMLButtonElement>('[data-buy]', body).forEach((b) => {
      b.onclick = () => {
        const def = productById(b.dataset.buy!);
        if (def) this.buyProduct(def, b);
      };
    });
  }

  /** Compra com dinheiro real (Google Play). A celebração vem pelo bus 'purchase'. */
  async buyProduct(def: ProductDef, btn?: HTMLElement): Promise<void> {
    if (!this.native) {
      this.host.toast(isNative ? t('shop.storeDown', 'Loja indisponível no momento') : t('shop.androidOnlyShort', 'Compras só no app Android'), 'bag');
      if (!isNative) window.open(LINKS.playStore, '_blank');
      return;
    }
    btn?.setAttribute('disabled', '');
    const r = await buy(def);
    btn?.removeAttribute('disabled');
    if (r === 'pending') this.host.toast(t('shop.pending', 'Pagamento pendente — você recebe assim que confirmar'), 'clock');
    else if (r === 'error') this.host.toast(t('shop.buyError', 'Não foi possível concluir a compra'), 'warning');
    else if (r === 'unavailable') this.host.toast(t('shop.storeDown', 'Loja indisponível no momento'), 'warning');
    this.render();
    this.refreshSheet();
  }

  /* ---------------- gemas ---------------- */

  private renderGems(body: HTMLElement): void {
    const add = (h: string) => body.insertAdjacentHTML('beforeend', h);
    add(`<div class="section-title">${t('shop.gems', 'Gemas')}</div>`);
    for (const p of PRODUCTS.filter((x) => x.kind === 'gems')) add(this.productRow(p));
    const noads = productById('remove_ads')!;
    if (!save.noAds) {
      add(`<div class="section-title">${t('shop.noAds', 'Sem anúncios')}</div>`);
      add(this.productRow(noads));
    }
    add(`<div class="section-title">${t('shop.exchange', 'Trocar')}</div>`);
    add(`<div class="product">
      ${productArt('convert')}
      <div class="p-info"><div class="p-title">10 ${GEM} → ${10 * ECONOMY.gemsToCoinsRate} ${COIN}</div><div class="p-desc">${t('shop.convert', 'Converta gemas em moedas')}</div></div>
      <button class="price ${save.gems < 10 ? 'cant' : ''}" id="btn-convert">${GEM}10</button>
    </div>`);
    add(`<div class="product">
      ${productArt('free')}
      <div class="p-info"><div class="p-title">${t('shop.freeCoins', '+{n} moedas grátis', { n: this.host.freeAmount })}</div><div class="p-desc">${t('shop.freeCoinsSub', 'Assista a um vídeo curto ({n} restantes hoje)', { n: this.host.freeLeft() })}</div></div>
      <button class="price ad" id="btn-free2">${t('shop.watch', 'Assistir')}</button>
    </div>`);
    if (!isNative) add(`<p class="muted">${t('shop.androidOnly', 'Compras disponíveis no app Android.')}<br/><a class="link" href="${LINKS.playStore}" target="_blank" rel="noopener">${t('shop.getOnPlay', 'Baixar na Google Play')}</a></p>`);
    this.bindBuy(body);
    $('#btn-convert', body).onclick = () => {
      if (save.gems < 10) return this.host.toast(t('shop.noGems', 'Gemas insuficientes'), 'gem');
      addGems(-10);
      addCoins(10 * ECONOMY.gemsToCoinsRate);
      audio.cash();
      this.host.flyReward({ coins: 10 * ECONOMY.gemsToCoinsRate }, $('#btn-convert', body));
      this.render();
    };
    $('#btn-free2', body).onclick = async () => {
      await this.host.freeCoins();
      this.render();
    };
  }
}
