import { BOOST_PACKS, ECONOMY, productById, type ProductDef } from '../config';
import { audio } from '../core/audio';
import {
  BOOST_IDS,
  UPGRADE_FX,
  UPGRADE_IDS,
  addGems,
  addCoins,
  boostCount,
  buyBoostPack,
  claimDaily,
  claimMission,
  dailyAvailable,
  dailyIndex,
  ensureMissions,
  extra,
  hasCoinDoubler,
  itemsAffordable,
  missionsReady,
  runCoinBreakdown,
  trackMission,
  upgradeCost,
  upgradeLevel,
  useBoost,
  type BoostId,
  type RunCoins,
} from '../core/economy';
import { bus } from '../core/events';
import * as haptics from '../core/haptics';
import { isNative } from '../core/platform';
import { dayNumber, persist, save, type Mission } from '../core/storage';
import type { Game, Loadout, RunResult } from '../game/game';
import { renderSkinPreview } from '../game/preview';
import { skinById } from '../game/skins';
import { hideBanner, maybeInterstitial, showBanner, showPrivacyOptions, showRewarded } from '../services/ads';
import { priceOf, restore, type Granted } from '../services/billing';
import { shareScore } from '../services/share';
import { celebrate, celebrating } from './celebrate';
import { $, $$, COIN, GEM, clock, countUp, esc, fmt, msToMidnight } from './dom';
import { TIER_LABELS, type QualityMode } from '../core/quality';
import { hydrateIcons, icon, type IconName } from './icons';
import { closeCreator } from './creator';
import { OnlineUI, bindOnlineBadges } from './online-ui';
import { BOOST_INFO, Shop, productTitle, type ShopTab } from './shop';

const FREE_COINS = 40;
const FREE_LIMIT = 8;
const FREE_KEY = 'bo-free';
const LOADOUT_KEY = 'bo-loadout';
/** popup do Pacote Inicial a partir desta partida (no máx. 1x por dia) */
const STARTER_POPUP_RUNS = 3;

type Screen =
  | 'menu'
  | 'hud'
  | 'over'
  | 'revive'
  | 'pause'
  | 'shop'
  | 'daily'
  | 'missions'
  | 'settings'
  | 'inbox'
  | 'redeem'
  | 'credits'
  | 'boost'
  | 'starter';
const MODALS: Screen[] = ['shop', 'daily', 'missions', 'settings', 'inbox', 'redeem', 'credits', 'boost', 'starter'];

export class UI {
  private game: Game;
  private base: Screen = 'menu';
  /** pilha de modais (o último está visível) */
  private stack: Screen[] = [];
  private shop: Shop;
  private online: OnlineUI;
  private result: RunResult | null = null;
  private coins: RunCoins | null = null;
  private reviveTimer = 0;
  private doubled = false;
  private toastTimer = 0;
  private tipTimer = 0;
  private speedTimer = 0;
  private railTimer = 0;
  private boostSel: Record<BoostId, boolean> = readLoadout();
  /** escudo grátis por vídeo, armado para a próxima partida */
  private freeShield = false;
  private boostModal: BoostId = 'shield';

  constructor(game: Game) {
    this.game = game;
    this.shop = new Shop({
      game,
      toast: (m, i) => this.toast(m, i),
      open: (s) => this.show(s as Screen),
      flyReward: (r, from) => this.flyReward(r, from),
      freeCoins: () => this.freeCoins(),
      freeLeft: () => FREE_LIMIT - this.freeState().n,
      freeAmount: FREE_COINS,
    });
    this.online = new OnlineUI((m, i) => this.toast(m, i));
    hydrateIcons(document);
    this.bind();
    this.refreshWallet();
    this.refreshBadges();
    this.show('menu');
  }

  private get modal(): Screen | null {
    return this.stack.length ? this.stack[this.stack.length - 1] : null;
  }

  /* ============================== navegação ============================== */

  private show(s: Screen): void {
    if (MODALS.includes(s)) {
      if (this.modal === s) return this.renderModal(s);
      if (this.modal) $(`#${this.modal}`).classList.remove('on');
      this.stack = this.stack.filter((m) => m !== s);
      this.stack.push(s);
      $(`#${s}`).classList.add('on');
      this.renderModal(s);
      return;
    }
    for (const id of ['menu', 'hud', 'over', 'revive', 'pause']) $(`#${id}`).classList.remove('on');
    this.base = s;
    $(`#${s}`).classList.add('on');
    if (s === 'pause' || s === 'revive' || s === 'over') $('#hud').classList.add('on');
    if (s === 'menu' || s === 'over') showBanner();
    else hideBanner();
    clearInterval(this.railTimer);
    if (s === 'menu') {
      this.refreshBadges();
      this.renderLoadout();
      this.refreshStarterOffer();
      this.tickRail();
      this.railTimer = window.setInterval(() => this.tickRail(), 1000);
    }
  }

  private renderModal(s: Screen): void {
    if (s === 'shop') this.shop.render();
    if (s === 'daily') this.renderDaily();
    if (s === 'missions') this.renderMissions();
    if (s === 'settings') this.renderSettings();
    if (s === 'inbox') this.online.openInbox();
    if (s === 'redeem') this.online.openRedeem();
    if (s === 'boost') this.renderBoostModal();
    if (s === 'starter') this.renderStarter();
  }

  private closeModal(): void {
    const top = this.modal;
    if (!top) return;
    $(`#${top}`).classList.remove('on');
    this.stack.pop();
    if (top === 'shop') this.shop.stop();
    if (top === 'settings') this.online.saveName();
    const prev = this.modal;
    if (prev) {
      $(`#${prev}`).classList.add('on');
      this.renderModal(prev);
    }
    this.refreshBadges();
    if (this.base === 'menu') this.renderLoadout();
  }

  /** Botão voltar do Android. Retorna false se deve sair do app. */
  back(): boolean {
    if (celebrating()) return true;
    if (closeCreator(false)) return true;
    if (document.querySelector('#shop .item-sheet')) {
      this.shop.closeSheet();
      return true;
    }
    if (this.modal) {
      this.closeModal();
      return true;
    }
    if (this.base === 'hud' && this.game.state === 'play') {
      this.pause();
      return true;
    }
    if (this.base === 'pause') {
      this.resume();
      return true;
    }
    if (this.base === 'over') {
      this.goHome();
      return true;
    }
    return false;
  }

  pause(): void {
    if (this.base !== 'hud' || this.game.state !== 'play') return;
    this.game.paused = true;
    this.hideTip();
    this.show('pause');
  }

  private resume(): void {
    this.game.paused = false;
    this.show('hud');
  }

  /* ============================== bindings ============================== */

  private bind(): void {
    this.bindQuality();
    const canvas = this.game.canvas;
    const press = (e: Event) => {
      e.preventDefault();
      audio.unlock();
      if (this.base === 'hud') {
        if (!$('#tip-card').classList.contains('hidden')) this.hideTip();
        this.game.input();
      }
    };
    canvas.addEventListener('pointerdown', press, { passive: false });
    window.addEventListener('keydown', (e) => {
      const typing = (e.target as HTMLElement)?.tagName === 'INPUT';
      if (typing) {
        if (e.key === 'Enter' && (e.target as HTMLElement).id === 'code-input') this.online.redeem();
        if (e.key === 'Enter' && (e.target as HTMLElement).id === 'profile-name') (e.target as HTMLInputElement).blur();
        return;
      }
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        if (this.base === 'menu' && !this.modal) this.play();
        else if (!this.modal) press(e);
      }
      if (e.code === 'Escape') this.back();
    });

    document.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('button')) {
        audio.unlock();
        audio.click();
      }
      const open = t.closest<HTMLElement>('[data-open]');
      if (open) {
        if (open.dataset.tab) this.shop.tab = open.dataset.tab as ShopTab;
        this.show(open.dataset.open as Screen);
      }
      if (t.closest('[data-close]')) this.closeModal();
      if (t.classList.contains('modal-screen') && this.modal && t.id === this.modal) this.closeModal();
    });

    $('#btn-play').onclick = () => this.play();
    $('#btn-pause').onclick = () => this.pause();
    $('#btn-resume').onclick = () => this.resume();
    $('#btn-quit').onclick = () => {
      this.game.paused = false;
      this.goHome();
    };
    $('#btn-again').onclick = () => this.again();
    $('#btn-home').onclick = () => this.goHome();
    $('#btn-share').onclick = () => shareScore(this.result?.score ?? save.best);
    $('#btn-double').onclick = () => this.doubleCoins();
    $('#btn-revive-ad').onclick = () => this.reviveAd();
    $('#btn-revive-gem').onclick = () => this.reviveGem();
    $('#btn-revive-skip').onclick = () => this.showResults();
    $('#btn-daily').onclick = () => this.takeDaily(1);
    $('#btn-daily2').onclick = () => this.takeDaily(2);
    $('#btn-free').onclick = () => this.freeCoins();
    $('#btn-restore').onclick = async () => {
      const ok = await restore();
      this.toast(ok ? 'Compras restauradas' : isNative ? 'Nada para restaurar' : 'Disponível no app Android', ok ? 'check' : 'shield');
    };
    $('#btn-privacy-ads').onclick = () => showPrivacyOptions();
    $('#btn-claim-all').onclick = () => this.online.claimAll();
    $('#btn-redeem').onclick = () => this.online.redeem();
    $('#btn-starter-buy').onclick = () => {
      const def = productById('starter_pack');
      if (def) this.shop.buyProduct(def, $('#btn-starter-buy'));
    };
    $<HTMLInputElement>('#profile-name').onchange = () => this.online.saveName();
    $('#tip-card').onclick = () => this.hideTip();
    $('#revive-cost').textContent = String(ECONOMY.reviveGemCost);
    const ver = `v${__APP_VERSION__} · ${isNative ? 'Android' : 'Web'}`;
    $('#version').textContent = ver;
    $('#credits-version').textContent = ver;

    $$('#shop .tabs button').forEach((b) => {
      b.onclick = () => {
        this.shop.closeSheet();
        this.shop.tab = b.dataset.tab as ShopTab;
        this.shop.render();
      };
    });

    $$<HTMLInputElement>('[data-setting]').forEach((inp) => {
      inp.onchange = () => {
        const k = inp.dataset.setting as 'sound' | 'music' | 'haptics';
        save[k] = inp.checked;
        persist();
        audio.applySettings();
        if (k === 'haptics' && inp.checked) haptics.tap('medium');
      };
    });

    bus.on('wallet', () => this.refreshWallet());
    bus.on('boosts', () => this.base === 'menu' && this.renderLoadout());
    bus.on('score', (s: number) => {
      const el = $('#hud-score');
      el.textContent = String(s);
      el.classList.remove('pop');
      void el.offsetWidth;
      el.classList.add('pop');
    });
    bus.on('run-coins', (c: number) => ($('#hud-coins').textContent = String(c)));
    bus.on('jump', () => $('#tutorial').classList.add('hidden'));
    bus.on('biome', (name: string) => {
      const el = $('#banner-biome');
      el.innerHTML = `${icon('sparkle')} ${esc(name)} ${icon('sparkle')}`;
      el.classList.remove('show');
      void el.offsetWidth;
      el.classList.add('show');
    });
    bus.on('tip', (kind: string) => {
      // o jogo já conta save.tips.asteroid; aqui só mostramos
      if (kind === 'asteroid') this.showTip();
    });
    bus.on('speedup', (tier: number) => this.speedToast(tier));
    bus.on('gameover', (r: RunResult) => this.onGameOver(r));
    bus.on('purchase', (def: ProductDef, g?: Granted) => this.onPurchase(def, g));
    bus.on('prices', () => {
      if (this.modal === 'shop') this.shop.render();
      if (this.modal === 'starter') this.renderStarter();
    });
    bus.on('mission-done', (m: Mission) => this.toast(`Missão completa: ${missionText(m)}`, 'target'));
    bus.on('player', () => this.modal === 'settings' && this.online.renderProfile());
    bus.on('online', () => this.modal === 'settings' && this.online.renderProfile());
    bus.on('inventory', () => this.modal === 'shop' && this.shop.render());
    bindOnlineBadges((n) => this.setBadge('inbox', n));
  }

  /* ============================== turbos (pré-partida) ============================== */

  private renderLoadout(): void {
    const box = $('#loadout');
    const chips = BOOST_IDS.map((id) => {
      const n = boostCount(id);
      if (!n) this.boostSel[id] = false;
      const on = this.boostSel[id];
      const inf = BOOST_INFO[id];
      return `<button class="lo-chip ${on ? 'on' : ''} ${n ? '' : 'none'}" data-lo="${id}" aria-pressed="${on}" aria-label="${inf.name}">
        <span class="plate sm plate-${inf.plate}">${icon(inf.icon)}</span>
        <span class="lo-txt"><b>${inf.short}</b><small>${n ? (on ? 'Ativo' : `x${n}`) : 'Comprar'}</small></span>
        <em class="lo-mark">${on ? icon('check') : n ? '' : '+'}</em>
      </button>`;
    }).join('');
    const vid = this.freeShield
      ? `<button class="lo-chip lo-video armed" id="lo-video" aria-label="Escudo grátis pronto"><span class="plate sm plate-cyan">${icon('shield')}</span><span class="lo-txt"><b>Grátis</b><small>Pronto!</small></span><em class="lo-mark">${icon('check')}</em></button>`
      : `<button class="lo-chip lo-video" id="lo-video" aria-label="Assista um vídeo para um Escudo grátis"><span class="plate sm plate-green">${icon('video')}</span><span class="lo-txt"><b>Escudo</b><small>grátis</small></span></button>`;
    box.innerHTML = `<div class="lo-row">${chips}${vid}</div>`;
    $$<HTMLButtonElement>('[data-lo]', box).forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.lo as BoostId;
        if (!boostCount(id)) {
          this.boostModal = id;
          this.show('boost');
          return;
        }
        this.boostSel[id] = !this.boostSel[id];
        writeLoadout(this.boostSel);
        haptics.tap('light');
        this.renderLoadout();
      };
    });
    $('#lo-video', box).onclick = async () => {
      if (this.freeShield) return this.toast('Escudo grátis pronto para a próxima partida!', 'shield');
      const ok = await showRewarded();
      if (!ok) return this.toast('Vídeo indisponível agora', 'video');
      this.freeShield = true;
      audio.unlock2();
      haptics.success();
      this.toast('Escudo grátis na próxima partida!', 'shield');
      this.renderLoadout();
    };
  }

  /** Desconta os turbos escolhidos e monta o loadout da partida. */
  private takeLoadout(): { lo: Loadout; used: IconName[]; lucky: boolean } {
    const lo: Loadout = {};
    const used: IconName[] = [];
    for (const id of BOOST_IDS) {
      if (this.boostSel[id] && useBoost(id)) {
        lo[id] = true;
        used.push(BOOST_INFO[id].icon);
      }
      if (!boostCount(id)) this.boostSel[id] = false;
    }
    writeLoadout(this.boostSel);
    if (this.freeShield && !lo.shield) {
      lo.shield = true;
      used.push('shield');
    }
    this.freeShield = false;
    // melhoria Escudo: chance de começar protegido
    let lucky = false;
    if (!lo.shield && Math.random() * 100 < UPGRADE_FX.shieldStartPct(upgradeLevel('shield'))) {
      lo.shield = true;
      lucky = true;
      used.push('shield');
    }
    return { lo, used, lucky };
  }

  private renderBoostModal(): void {
    const id = this.boostModal;
    const inf = BOOST_INFO[id];
    const pk = {
      coins: { ...BOOST_PACK(id, 'coins') },
      gems: { ...BOOST_PACK(id, 'gems') },
    };
    $('#boost-title').innerHTML = `${icon(inf.icon)} ${inf.name.toUpperCase()}`;
    const bundle = productById('boost_bundle')!;
    $('#boost-body').innerHTML = `
      <div class="boost-hero"><div class="plate plate-${inf.plate}">${icon(inf.icon)}</div><div class="bh-count">Você tem <b>${boostCount(id)}</b></div></div>
      <p class="muted">${inf.desc}</p>
      <button class="btn btn-green" id="bb-coins" ${save.coins < pk.coins.price ? 'disabled' : ''}>+${pk.coins.n} ${inf.plural} · ${COIN} ${fmt(pk.coins.price)}</button>
      <button class="btn btn-gem" id="bb-gems" ${save.gems < pk.gems.price ? 'disabled' : ''}>+${pk.gems.n} ${inf.plural} · ${GEM} ${pk.gems.price}</button>
      <button class="btn btn-gold" id="bb-iap">${icon('rocket')} Kit Turbo (5 de cada) · ${esc(priceOf(bundle))}</button>
      <button class="link" data-open="shop" data-tab="upgrades">Ver todas as melhorias</button>`;
    const after = (n: number) => {
      if (!n) return;
      audio.cash();
      haptics.tap('medium');
      this.boostSel[id] = true;
      writeLoadout(this.boostSel);
      this.toast(`+${n} ${inf.plural}! Ativado para a próxima partida`, inf.icon);
      this.closeModal();
    };
    $('#bb-coins').onclick = () => after(buyBoostPack(id, 'coins'));
    $('#bb-gems').onclick = () => after(buyBoostPack(id, 'gems'));
    $('#bb-iap').onclick = () => this.shop.buyProduct(bundle, $('#bb-iap'));
  }

  /* ============================== jogo ============================== */

  private play(): void {
    audio.unlock();
    const { lo, used, lucky } = this.takeLoadout();
    this.show('hud');
    $('#hud-score').textContent = '0';
    $('#hud-coins').textContent = '0';
    $('#tutorial').classList.toggle('hidden', save.runs >= 2);
    this.hideTip();
    this.game.start(lo);
    this.hudBoosts(used, lucky);
  }

  private hudBoosts(used: IconName[], lucky: boolean): void {
    const el = $('#hud-boosts');
    el.classList.remove('show');
    if (!used.length) return;
    el.innerHTML = used.map((i) => `<span class="plate sm round plate-${i === 'shield' ? 'cyan' : i === 'magnet' ? 'pink' : 'gold'}">${icon(i)}</span>`).join('') + `<b>${lucky ? 'Escudo da sorte!' : 'Turbos ativos!'}</b>`;
    void el.offsetWidth;
    el.classList.add('show');
  }

  private async again(): Promise<void> {
    await maybeInterstitial();
    this.game.reset('play');
    this.play();
  }

  private async goHome(): Promise<void> {
    const fromRun = this.base === 'over';
    const starter = fromRun && this.starterDue();
    // nunca empilha anúncio + oferta na mesma volta ao menu
    if (fromRun && !starter) await maybeInterstitial();
    this.game.reset('menu');
    this.show('menu');
    if (starter) {
      extra.starterPopupDay = dayNumber();
      persist();
      setTimeout(() => this.base === 'menu' && !this.modal && this.show('starter'), 350);
    }
  }

  private onGameOver(r: RunResult): void {
    this.result = r;
    this.hideTip();
    if (r.canRevive) {
      this.show('revive');
      ($('#btn-revive-gem') as HTMLButtonElement).disabled = save.gems < ECONOMY.reviveGemCost;
      const ring = $('#revive-ring');
      const count = $('#revive-count');
      const total = 5000;
      const start = performance.now();
      cancelAnimationFrame(this.reviveTimer);
      const tick = () => {
        if (this.base !== 'revive') return;
        const left = Math.max(0, total - (performance.now() - start));
        ring.style.strokeDashoffset = String(276.5 * (1 - left / total));
        count.textContent = String(Math.ceil(left / 1000));
        if (left <= 0) this.showResults();
        else this.reviveTimer = requestAnimationFrame(tick);
      };
      tick();
    } else this.showResults();
  }

  private async reviveAd(): Promise<void> {
    cancelAnimationFrame(this.reviveTimer);
    const base = this.base;
    this.base = 'pause'; // congela o timer
    const ok = await showRewarded();
    this.base = base;
    if (ok) this.doRevive();
    else {
      this.toast('Vídeo indisponível agora', 'video');
      this.showResults();
    }
  }

  private reviveGem(): void {
    if (save.gems < ECONOMY.reviveGemCost) return;
    addGems(-ECONOMY.reviveGemCost);
    this.doRevive();
  }

  private doRevive(): void {
    cancelAnimationFrame(this.reviveTimer);
    this.show('hud');
    this.game.revive();
  }

  private showResults(): void {
    if (this.base === 'over') return;
    cancelAnimationFrame(this.reviveTimer);
    const r = this.result!;
    const stats = this.game.runStats;
    // creditar recompensa da corrida (melhoria já vem nas moedas do jogo; dobrador soma aqui)
    const rc = runCoinBreakdown(stats.coins);
    this.coins = rc;
    addCoins(rc.total);
    addGems(stats.gems);
    const newBest = this.game.score > save.best;
    if (newBest) save.best = this.game.score;
    save.runs++;
    save.totalPlanets += stats.planets;
    save.totalPerfects += stats.perfects;
    persist();
    trackMission('planets', stats.planets);
    trackMission('coins', stats.coins);
    trackMission('perfects', stats.perfects);
    trackMission('score', this.game.score, true);
    trackMission('runs', 1);

    this.doubled = false;
    $('#over-score').textContent = String(this.game.score);
    $('#over-best').textContent = String(save.best);
    $('#over-perfects').textContent = String(stats.perfects);
    $('#over-planets').textContent = String(stats.planets);
    $('#over-asteroids').textContent = String(stats.asteroids ?? 0);
    $('#over-gems').textContent = String(stats.gems);
    $('#over-newbest').classList.toggle('hidden', !newBest);
    $('#over-title').textContent = newBest ? 'INCRÍVEL!' : pickPhrase(this.game.score);
    // resumo das moedas com contagem animada
    const lvl = upgradeLevel('coinValue');
    $('#cs-up-row').classList.toggle('hidden', lvl === 0);
    $('#cs-dbl-row').classList.toggle('hidden', !hasCoinDoubler());
    $('#cs-upsell').classList.toggle('hidden', hasCoinDoubler() || rc.total < 5);
    $('#cs-up-row span:first-child').innerHTML = `${icon('arrow-up', { size: 18 })} Melhoria +${UPGRADE_FX.coinPct(lvl)}%`;
    const base = $('#cs-base');
    const up = $('#cs-up');
    const dbl = $('#cs-dbl');
    const tot = $('#over-coins');
    base.textContent = up.textContent = dbl.textContent = tot.textContent = '0';
    setTimeout(() => countUp(base, rc.base, 600), 250);
    setTimeout(() => countUp(up, rc.upgrade, 450, 0, '+'), 600);
    setTimeout(() => countUp(dbl, rc.doubler, 450, 0, '+'), 850);
    setTimeout(() => {
      countUp(tot, rc.total, 700);
      if (rc.total > 0) audio.cash();
    }, 1000);
    const dblBtn = $<HTMLButtonElement>('#btn-double');
    dblBtn.classList.toggle('hidden', rc.total < 3);
    dblBtn.disabled = false;
    dblBtn.innerHTML = `${icon('video')} Dobrar moedas +${fmt(rc.total)} ${icon('coin')}`;
    if (newBest) {
      audio.unlock2();
      haptics.success();
    }
    this.result = { ...r, newBest, best: save.best };
    this.show('over');
  }

  private async doubleCoins(): Promise<void> {
    if (this.doubled || !this.coins) return;
    const btn = $<HTMLButtonElement>('#btn-double');
    btn.disabled = true;
    const ok = await showRewarded();
    if (ok) {
      this.doubled = true;
      const c = this.coins.total;
      addCoins(c);
      this.flyReward({ coins: c }, btn);
      countUp($('#over-coins'), c * 2, 600, c);
      btn.innerHTML = `${icon('check')} Moedas dobradas!`;
      audio.cash();
    } else {
      btn.disabled = false;
      this.toast('Vídeo indisponível agora', 'video');
    }
  }

  /* ============================== HUD: dica e velocidade ============================== */

  private showTip(): void {
    const el = $('#tip-card');
    el.classList.remove('hidden', 'out');
    const bar = $('.tip-bar', el);
    bar.style.animation = 'none';
    void bar.offsetWidth;
    bar.style.animation = '';
    haptics.tap('medium');
    clearTimeout(this.tipTimer);
    this.tipTimer = window.setTimeout(() => this.hideTip(), 3600);
  }

  private hideTip(): void {
    clearTimeout(this.tipTimer);
    const el = $('#tip-card');
    if (el.classList.contains('hidden')) return;
    el.classList.add('out');
    this.tipTimer = window.setTimeout(() => el.classList.add('hidden'), 220);
  }

  private speedToast(tier: number): void {
    const el = $('#speed-toast');
    el.innerHTML = `${icon('bolt', { size: 20 })} Velocidade x${tier + 1}`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this.speedTimer);
    this.speedTimer = window.setTimeout(() => el.classList.remove('show'), 1800);
  }

  /* ============================== compras / ofertas ============================== */

  private onPurchase(def: ProductDef, g?: Granted): void {
    this.refreshStarterOffer();
    if (this.modal === 'starter') this.closeModal();
    if (this.modal === 'shop') this.shop.render();
    if (this.modal === 'boost') this.renderBoostModal();
    if (this.base === 'menu') this.renderLoadout();
    celebrate(
      g
        ? { coins: g.coins, gems: g.gems, skins: g.skins, trails: g.trails, boosts: g.boosts, noAds: g.noAds, coinDoubler: g.coinDoubler }
        : { gems: def.gems, coins: def.coins },
      { title: 'OBRIGADO!', subtitle: `${productTitle(def)} · compra concluída`, button: 'DEMAIS!' },
    );
  }

  private refreshStarterOffer(): void {
    $('#starter-offer').classList.toggle('hidden', save.starter || save.runs < 2);
  }

  private starterDue(): boolean {
    return !save.starter && save.runs >= STARTER_POPUP_RUNS && extra.starterPopupDay !== dayNumber();
  }

  private renderStarter(): void {
    const def = productById('starter_pack')!;
    $('#starter-gems').textContent = fmt(def.gems);
    $('#starter-coins').textContent = fmt(def.coins);
    $('#btn-starter-buy').innerHTML = `${icon('bag')} Pegar por ${esc(priceOf(def))}`;
    const cv = $<HTMLCanvasElement>('#starter-skin');
    const t0 = performance.now();
    const loop = (t: number) => {
      if (this.modal !== 'starter') return;
      renderSkinPreview(skinById(def.skin ?? 'galaxy'), 150, 0.4 + (t - t0) / 1000, { target: cv });
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private tickRail(): void {
    if (this.base !== 'menu') return;
    const t = $('#rail-timer');
    t.textContent = extra.flashDay === dayNumber() ? 'amanhã' : clock(msToMidnight());
  }

  /* ============================== economia ============================== */

  private freeState(): { day: number; n: number } {
    try {
      const s = JSON.parse(localStorage.getItem(FREE_KEY) || '{}');
      if (s.day === dayNumber()) return s;
    } catch {
      /* */
    }
    return { day: dayNumber(), n: 0 };
  }

  private async freeCoins(): Promise<void> {
    const st = this.freeState();
    if (st.n >= FREE_LIMIT) {
      this.toast('Volte amanhã para mais moedas grátis!', 'clock');
      return;
    }
    const ok = await showRewarded();
    if (!ok) {
      this.toast('Vídeo indisponível agora', 'video');
      return;
    }
    st.n++;
    try {
      localStorage.setItem(FREE_KEY, JSON.stringify(st));
    } catch {
      /* */
    }
    addCoins(FREE_COINS);
    audio.cash();
    this.flyReward({ coins: FREE_COINS }, $('#btn-free'));
    this.refreshBadges();
  }

  private takeDaily(mult: number): void {
    if (!dailyAvailable()) return;
    const go = async () => {
      if (mult > 1) {
        const ok = await showRewarded();
        if (!ok) {
          this.toast('Vídeo indisponível agora', 'video');
          return;
        }
      }
      const r = claimDaily(mult);
      audio.cash();
      haptics.success();
      this.flyReward({ coins: r.coins, gems: r.gems }, $('#btn-daily'));
      this.renderDaily();
      this.refreshBadges();
    };
    go();
  }

  private refreshWallet(): void {
    $$('[data-bind="coins"]').forEach((e) => {
      const v = fmt(save.coins);
      if (e.textContent !== v) {
        e.textContent = v;
        const pill = e.closest('.pill');
        pill?.classList.remove('bump');
        void (pill as HTMLElement)?.offsetWidth;
        pill?.classList.add('bump');
      }
    });
    $$('[data-bind="gems"]').forEach((e) => (e.textContent = fmt(save.gems)));
    $$('[data-bind="best"]').forEach((e) => (e.textContent = String(save.best)));
  }

  private setBadge(k: string, n: number | string): void {
    const el = document.querySelector<HTMLElement>(`[data-badge="${k}"]`);
    if (!el) return;
    el.classList.toggle('hidden', !n);
    el.textContent = String(n);
  }

  private refreshBadges(): void {
    this.setBadge('daily', dailyAvailable() ? '!' : 0);
    this.setBadge('missions', missionsReady());
    this.setBadge('shop', itemsAffordable());
    this.setBadge('free', this.freeState().n < FREE_LIMIT ? `+${FREE_COINS}` : 0);
    this.setBadge('upgrades', UPGRADE_IDS.filter((id) => {
      const c = upgradeCost(id);
      return c && save.coins >= c.coins;
    }).length);
    this.refreshWallet();
  }

  /* ============================== diário / missões / ajustes ============================== */

  private renderDaily(): void {
    const grid = $('#daily-grid');
    const idx = dailyIndex();
    const avail = dailyAvailable();
    grid.innerHTML = ECONOMY.dailyRewards
      .map((r, i) => {
        const done = avail ? i < idx : i < save.dailyStreak;
        const cls = done ? 'done' : avail && i === idx ? 'today' : '';
        return `<div class="day ${cls} ${i === 6 ? 'last' : ''}">
          <small>Dia ${i + 1}</small>
          <span class="day-art">${icon(dailyArt(r, i === 6), { size: i === 6 ? 52 : 38 })}</span>
          <span class="day-amt">${r.coins ? `<b><i class="coin"></i>${r.coins}</b>` : ''}${r.gems ? `<b><i class="gem"></i>${r.gems}</b>` : ''}</span>
          ${done ? `<span class="day-check">${icon('check')}</span>` : ''}
        </div>`;
      })
      .join('');
    $<HTMLButtonElement>('#btn-daily').disabled = !avail;
    $<HTMLButtonElement>('#btn-daily2').disabled = !avail;
    $('#btn-daily').innerHTML = avail ? 'Pegar' : `${icon('clock')} Volte amanhã`;
  }

  private renderMissions(): void {
    const list = $('#mission-list');
    const ms = ensureMissions();
    list.innerHTML = ms
      .map((m, i) => {
        const pct = Math.round((m.progress / m.target) * 100);
        const btn = m.claimed
          ? `<button class="price on">${icon('check', { size: 26 })}</button>`
          : m.progress >= m.target
            ? `<button class="price" data-claim="${i}"><i class="coin"></i>${m.reward}</button>`
            : `<button class="price cant"><i class="coin"></i>${m.reward}</button>`;
        return `<div class="mission ${m.claimed ? 'claimed' : ''}"><span class="m-ico plate round plate-violet">${icon(MISSION_ICON[m.type] ?? 'target')}</span><div class="m-info"><div class="m-title">${missionText(m)}</div>
          <div class="bar"><i style="width:${pct}%"></i></div><small class="muted">${m.progress}/${m.target}</small></div>${btn}</div>`;
      })
      .join('');
    $$('[data-claim]', list).forEach((b) => {
      b.onclick = () => {
        const got = claimMission(Number(b.dataset.claim));
        if (got) {
          audio.cash();
          haptics.success();
          this.flyReward({ coins: got }, b);
        }
        this.renderMissions();
      };
    });
  }

  private bindQuality(): void {
    const sel = $<HTMLSelectElement>('#sel-quality');
    sel.onchange = () => {
      const v = sel.value;
      this.game.setQuality(v === 'auto' ? 'auto' : (Number(v) as QualityMode));
      this.renderSettings();
    };
    bus.on('quality', () => this.renderSettings());
  }

  private renderSettings(): void {
    const sel = $<HTMLSelectElement>('#sel-quality');
    sel.value = String(this.game.quality.mode);
    sel.options[0].textContent = `Auto (${TIER_LABELS[this.game.quality.tier]})`;
    $$<HTMLInputElement>('[data-setting]').forEach((inp) => {
      inp.checked = !!save[inp.dataset.setting as 'sound'];
    });
    this.online.renderProfile();
  }

  /* ============================== feedback ============================== */

  toast(msg: string, ico?: IconName): void {
    const el = $('#toast');
    el.innerHTML = (ico ? icon(ico, { size: 24 }) : '') + `<span>${esc(msg)}</span>`;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.classList.remove('show'), 2400);
  }

  /** Recompensa voando: ícone + número (aceita texto puro por compatibilidade). */
  private flyReward(reward: { coins?: number; gems?: number } | string, from: HTMLElement): void {
    const r = from.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'reward-fly';
    if (typeof reward === 'string') el.textContent = reward;
    else {
      const part = (v: number | undefined, ico: IconName) => (v ? `<span class="rf-part">+${fmt(v)}${icon(ico, { size: 30 })}</span>` : '');
      el.innerHTML = part(reward.coins, 'coin') + part(reward.gems, 'gem');
    }
    el.style.left = `${r.left + r.width / 2}px`;
    el.style.top = `${r.top - 10}px`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }
}

/* ============================== helpers ============================== */

const BOOST_PACK = (id: BoostId, cur: 'coins' | 'gems') => BOOST_PACKS[id][cur];

function readLoadout(): Record<BoostId, boolean> {
  try {
    const o = JSON.parse(localStorage.getItem(LOADOUT_KEY) || '{}');
    return { shield: !!o.shield, magnet: !!o.magnet, headstart: !!o.headstart };
  } catch {
    return { shield: false, magnet: false, headstart: false };
  }
}

function writeLoadout(s: Record<BoostId, boolean>): void {
  try {
    localStorage.setItem(LOADOUT_KEY, JSON.stringify(s));
  } catch {
    /* */
  }
}

const MISSION_ICON: Record<Mission['type'], IconName> = {
  planets: 'planet',
  coins: 'coins',
  perfects: 'star',
  score: 'trophy',
  runs: 'rocket',
};

function dailyArt(r: { coins?: number; gems?: number }, last: boolean): IconName {
  if (last) return 'gem-chest';
  if (r.gems) return r.gems >= 10 ? 'gem-pile' : 'gem';
  return (r.coins ?? 0) >= 200 ? 'coins' : 'coin';
}

function missionText(m: Mission): string {
  switch (m.type) {
    case 'planets':
      return `Pouse em ${m.target} planetas`;
    case 'coins':
      return `Colete ${m.target} moedas`;
    case 'perfects':
      return `Faça ${m.target} pousos PERFEITOS`;
    case 'score':
      return `Faça ${m.target} pontos numa partida`;
    case 'runs':
      return `Jogue ${m.target} partidas`;
  }
}

function pickPhrase(score: number): string {
  if (score >= 50) return 'LENDÁRIO!';
  if (score >= 30) return 'MANDOU BEM!';
  if (score >= 15) return 'QUASE LÁ!';
  return 'FIM DE JOGO';
}
