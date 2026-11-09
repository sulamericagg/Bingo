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
import { RARITY_INFO, RARITY_ORDER, SKINS, TRAILS, isEventOnly, type Price, type Rarity, type Skin, type Trail } from '../game/skins';
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
  magnet: { name: 'Ímã', icon: 'magnet', plate: 'pink', desc: 'Atrai moedas de mais longe.', effect: (lv) => `raio +${UPGRADE_FX.magnetPct(lv)}%` },
  shield: {
    name: 'Escudo',
    icon: 'shield',
    plate: 'cyan',
    desc: 'Chance de começar com escudo e mais tempo invencível após um impacto.',
    effect: (lv) => `${UPGRADE_FX.shieldStartPct(lv)}% de chance`,
  },
  coinValue: { name: 'Valor da moeda', icon: 'coins', plate: 'gold', desc: 'Cada moeda coletada vale mais.', effect: (lv) => `moedas +${UPGRADE_FX.coinPct(lv)}%` },
};

export const BOOST_INFO: Record<BoostId, { name: string; short: string; plural: string; icon: IconName; plate: string; desc: string }> = {
  shield: { name: 'Escudo', short: 'Escudo', plural: 'Escudos', icon: 'shield', plate: 'cyan', desc: 'Começa a partida protegido: aguenta 1 batida.' },
  magnet: { name: 'Ímã', short: 'Ímã', plural: 'Ímãs', icon: 'magnet', plate: 'pink', desc: 'Puxa moedas de longe durante a partida toda.' },
  headstart: { name: 'Largada Turbo', short: 'Turbo', plural: 'Largadas Turbo', icon: 'rocket', plate: 'gold', desc: 'Decola de foguete pelos primeiros planetas.' },
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
      return 'Pacote Inicial';
    case 'remove_ads':
      return 'Sem Anúncios';
    case 'coin_doubler':
      return 'Dobrador de Moedas';
    case 'boost_bundle':
      return 'Kit Turbo';
    case 'vip_pack':
      return 'Pacote VIP';
    case 'mega_bundle':
      return 'Mega Pacote';
    case 'flash_gems':
      return `${fmt(p.gems)} Gemas`;
  }
  if (p.skin && p.kind === 'cosmetic') return SKINS.find((s) => s.id === p.skin)?.name ?? p.id;
  if (p.trail && p.kind === 'cosmetic') return `Rastro ${TRAILS.find((t) => t.id === p.trail)?.name ?? p.id}`;
  return `${fmt(p.gems)} Gemas`;
}

export function productDesc(p: ProductDef): string {
  switch (p.id) {
    case 'starter_pack':
      return `Sem anúncios + ${p.gems} ${GEM} + ${fmt(p.coins)} ${COIN} + skin lendária Galáxia`;
    case 'remove_ads':
      return 'Remove banners e intersticiais para sempre';
    case 'coin_doubler':
      return 'Ganhe 2x moedas em todas as partidas, para sempre';
    case 'boost_bundle':
      return '5 Escudos + 5 Ímãs + 5 Largadas Turbo';
    case 'vip_pack':
      return `Sem anúncios + Dobrador 2x + ${fmt(p.gems)} ${GEM} + skin Rei Dourado`;
    case 'mega_bundle':
      return `${fmt(p.gems)} ${GEM} + ${fmt(p.coins)} ${COIN} + 10 de cada turbo`;
    case 'gems_mega':
      return 'Melhor custo-benefício!';
  }
  if (p.kind === 'cosmetic') {
    const s = p.skin ? SKINS.find((x) => x.id === p.skin) : undefined;
    const t = p.trail ? TRAILS.find((x) => x.id === p.trail) : undefined;
    return esc((s ?? t)?.desc ?? 'Item mítico exclusivo');
  }
  return 'Para skins épicas, melhorias e continuar';
}

const BADGE_TEXT: Record<string, string> = { best: 'MELHOR OFERTA', popular: 'POPULAR', sale: 'PROMOÇÃO' };

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
    body.insertAdjacentHTML('beforeend', `<p class="muted shop-count">${owned}/${items.length} desbloqueados · toque para ver</p>`);
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
    card.appendChild(isSkin ? renderSkinPreview(item as Skin, 92) : renderTrailPreview(item as Trail, 92));
    card.insertAdjacentHTML('beforeend', `<span class="rarity r-${item.rarity}">${RARITY_INFO[item.rarity].label}</span>`);
    if (ev) card.insertAdjacentHTML('beforeend', `<span class="event-tag">${icon('ticket')}Evento</span>`);
    card.insertAdjacentHTML('beforeend', `<div class="name">${esc(item.name)}</div>`);
    if (ev) card.insertAdjacentHTML('beforeend', `<div class="card-note">Só com código de desafio</div>`);
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
        this.host.toast('Exclusivo de evento: resgate com um código de desafio', 'ticket');
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
      btn.innerHTML = `${icon('check')} Equipado`;
    } else if (owned) {
      btn.classList.add('equip');
      btn.textContent = 'Equipar';
    } else this.fillPrice(btn, item.price, item.id);
  }

  private fillPrice(btn: HTMLElement, p: Price, id: string): void {
    if (p.event) {
      btn.classList.add('event');
      btn.innerHTML = `${icon('ticket')} Código`;
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
      btn.innerHTML = def && def.kind === 'cosmetic' ? esc(priceOf(def)) : `${icon('gift')} Pacote`;
    }
  }

  private async onItem(item: Skin | Trail, isSkin: boolean, from: HTMLElement): Promise<void> {
    const owned = () => (isSkin ? ownsSkin(item.id) : ownsTrail(item.id));
    const unlock = async () => {
      if (isSkin) unlockSkin(item.id);
      else unlockTrail(item.id);
      equip();
      await celebrate(isSkin ? { skins: [item.id] } : { trails: [item.id] }, { title: 'DESBLOQUEADO!', subtitle: 'Já equipado. Bora jogar!' });
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
        this.host.toast(`${item.name} vem no ${productTitle(def)}`, 'gift');
        return;
      }
      await this.buyProduct(def, from);
      return;
    }
    if (p.ads) {
      const ok = await showRewarded();
      if (!ok) return this.host.toast('Vídeo indisponível agora', 'video');
      save.adProgress[item.id] = (save.adProgress[item.id] ?? 0) + 1;
      persist();
      if (save.adProgress[item.id] >= p.ads) await unlock();
      else {
        this.host.toast(`${save.adProgress[item.id]}/${p.ads} — continue assistindo!`, 'video');
        this.render();
        this.refreshSheet();
      }
      return;
    }
    if (!spend(p)) {
      if (p.gems) {
        this.host.toast('Gemas insuficientes', 'gem');
        this.closeSheet();
        this.tab = 'gems';
        this.render();
      } else this.host.toast('Moedas insuficientes — jogue mais ou pegue grátis', 'coin');
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
      <button class="icon-btn close sheet-x" aria-label="Fechar">${icon('close')}</button>
      <div class="sheet-art"><canvas></canvas></div>
      <span class="rarity big r-${item.rarity}">${info.label}</span>
      <h3>${esc(item.name)}</h3>
      <p class="muted sheet-desc">${esc(item.desc ?? (isSkin ? 'Visual exclusivo para o seu Bloop.' : 'Deixe um rastro de estilo pelo espaço.'))}</p>
      ${isEventOnly(item.price) ? `<p class="sheet-event">${icon('ticket')} Exclusivo de evento: só com código de desafio</p>` : ''}
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
    add('<div class="section-title">Melhorias permanentes</div>');
    for (const id of UPGRADE_IDS) {
      const inf = UPGRADE_INFO[id];
      const lv = upgradeLevel(id);
      const cost = upgradeCost(id);
      const pips = Array.from({ length: UPGRADES.maxLevel }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
      const next = cost
        ? `<span class="u-next">${icon('arrow-up')}<span>${lv ? `${esc(inf.effect(lv))} → ` : ''}<b>${esc(inf.effect(lv + 1))}</b></span></span>`
        : `<span class="u-next max">${icon('crown')}<span>Máximo: <b>${esc(inf.effect(lv))}</b></span></span>`;
      add(`<div class="upg">
        <div class="p-ico plate plate-${inf.plate}">${icon(inf.icon)}</div>
        <div class="u-info">
          <div class="u-title">${inf.name} <small>Nv ${lv}/${UPGRADES.maxLevel}</small></div>
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
    add(`<div class="section-title">Turbos <small>(usados ao começar a partida)</small></div>`);
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
    add('<div class="section-title">Turbine de vez</div>');
    for (const pid of ['coin_doubler', 'boost_bundle']) {
      const def = productById(pid)!;
      if (ownsProduct(def)) continue;
      add(this.productRow(def));
    }
    if (extra.coinDoubler) add(`<p class="muted owned-note">${icon('check')} Dobrador de Moedas ativo: 2x moedas em toda partida</p>`);

    $$<HTMLButtonElement>('[data-up]', body).forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.up as UpgradeId;
        const cur = b.dataset.cur as 'coins' | 'gems';
        if (!buyUpgrade(id, cur)) {
          this.host.toast(cur === 'gems' ? 'Gemas insuficientes' : 'Moedas insuficientes', cur === 'gems' ? 'gem' : 'coin');
          if (cur === 'gems') {
            this.tab = 'gems';
            this.render();
          }
          return;
        }
        audio.unlock2();
        haptics.success();
        this.host.toast(`${UPGRADE_INFO[id].name} subiu para o nível ${upgradeLevel(id)}!`, 'arrow-up');
        this.render();
      };
    });
    $$<HTMLButtonElement>('[data-boost]', body).forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.boost as BoostId;
        const cur = b.dataset.cur as 'coins' | 'gems';
        const n = buyBoostPack(id, cur);
        if (!n) {
          this.host.toast(cur === 'gems' ? 'Gemas insuficientes' : 'Moedas insuficientes', cur === 'gems' ? 'gem' : 'coin');
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
      <div class="flash-head"><span>${icon('fire')} OFERTA RELÂMPAGO</span><span class="flash-timer">${icon('clock')}<b data-countdown>${clock(msToMidnight())}</b></span></div>
      <div class="flash-body">
        ${productArt('flash_gems')}
        <div class="p-info">
          <div class="p-title">${fmt(flash.gems)} ${GEM} <span class="off">-50%</span></div>
          <div class="p-desc">Bônus de hoje: <b>${bonusTxt}</b></div>
        </div>
      </div>
      <div class="flash-buy">
        ${flash.wasPrice ? `<s>${flash.wasPrice}</s>` : ''}
        ${bought ? `<span class="flash-ok">${icon('check')} Comprado hoje · volte amanhã</span>` : `<button class="price big" data-buy="flash_gems">${esc(priceOf(flash))}</button>`}
      </div>
    </div>`);

    const order = ['starter_pack', 'vip_pack', 'mega_bundle', 'boost_bundle', 'coin_doubler'];
    add('<div class="section-title">Pacotes</div>');
    for (const pid of order) {
      const def = productById(pid)!;
      if (ownsProduct(def)) continue;
      add(this.productRow(def));
    }
    add('<div class="section-title">Míticos exclusivos</div>');
    for (const def of PRODUCTS.filter((p) => p.kind === 'cosmetic')) {
      if (ownsProduct(def)) continue;
      add(this.productRow(def, true));
    }
    $$('.product[data-preview]', body).forEach((row) => {
      const def = productById(row.dataset.preview!)!;
      const art = $('.p-ico', row);
      art.innerHTML = '';
      const s = def.skin ? SKINS.find((x) => x.id === def.skin) : undefined;
      const t = def.trail ? TRAILS.find((x) => x.id === def.trail) : undefined;
      if (s) art.appendChild(renderSkinPreview(s, 64));
      else if (t) art.appendChild(renderTrailPreview(t, 64));
    });
    add(`<button class="code-cta" data-open="redeem">${icon('ticket', { size: 40 })}<span><b>Tem um código?</b><small>Resgate prêmios de eventos e desafios</small></span>${icon('arrow-up', { class: 'cta-arrow' })}</button>`);
    if (!isNative) add(`<p class="muted">Compras disponíveis no app Android.<br/><a class="link" href="${LINKS.playStore}" target="_blank" rel="noopener">Baixar na Google Play</a></p>`);

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
    const r: Rarity | undefined = p.kind === 'cosmetic' ? (p.skin ? SKINS.find((s) => s.id === p.skin)?.rarity : TRAILS.find((t) => t.id === p.trail)?.rarity) : undefined;
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
      this.host.toast(isNative ? 'Loja indisponível no momento' : 'Compras só no app Android', 'bag');
      if (!isNative) window.open(LINKS.playStore, '_blank');
      return;
    }
    btn?.setAttribute('disabled', '');
    const r = await buy(def);
    btn?.removeAttribute('disabled');
    if (r === 'pending') this.host.toast('Pagamento pendente — você recebe assim que confirmar', 'clock');
    else if (r === 'error') this.host.toast('Não foi possível concluir a compra', 'warning');
    else if (r === 'unavailable') this.host.toast('Loja indisponível no momento', 'warning');
    this.render();
    this.refreshSheet();
  }

  /* ---------------- gemas ---------------- */

  private renderGems(body: HTMLElement): void {
    const add = (h: string) => body.insertAdjacentHTML('beforeend', h);
    add('<div class="section-title">Gemas</div>');
    for (const p of PRODUCTS.filter((x) => x.kind === 'gems')) add(this.productRow(p));
    const noads = productById('remove_ads')!;
    if (!save.noAds) {
      add('<div class="section-title">Sem anúncios</div>');
      add(this.productRow(noads));
    }
    add('<div class="section-title">Trocar</div>');
    add(`<div class="product">
      ${productArt('convert')}
      <div class="p-info"><div class="p-title">10 ${GEM} → ${10 * ECONOMY.gemsToCoinsRate} ${COIN}</div><div class="p-desc">Converta gemas em moedas</div></div>
      <button class="price ${save.gems < 10 ? 'cant' : ''}" id="btn-convert">${GEM}10</button>
    </div>`);
    add(`<div class="product">
      ${productArt('free')}
      <div class="p-info"><div class="p-title">+${this.host.freeAmount} moedas grátis</div><div class="p-desc">Assista a um vídeo curto (${this.host.freeLeft()} restantes hoje)</div></div>
      <button class="price ad" id="btn-free2">Assistir</button>
    </div>`);
    if (!isNative) add(`<p class="muted">Compras disponíveis no app Android.<br/><a class="link" href="${LINKS.playStore}" target="_blank" rel="noopener">Baixar na Google Play</a></p>`);
    this.bindBuy(body);
    $('#btn-convert', body).onclick = () => {
      if (save.gems < 10) return this.host.toast('Gemas insuficientes', 'gem');
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
