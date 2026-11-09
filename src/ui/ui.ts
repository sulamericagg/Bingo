import { ECONOMY, LINKS, PRODUCTS, type ProductDef } from '../config';
import { audio } from '../core/audio';
import {
  addCoins,
  addGems,
  canAfford,
  claimDaily,
  claimMission,
  dailyAvailable,
  dailyIndex,
  ensureMissions,
  itemsAffordable,
  missionsReady,
  ownsSkin,
  ownsTrail,
  spend,
  trackMission,
  unlockSkin,
  unlockTrail,
} from '../core/economy';
import { bus } from '../core/events';
import * as haptics from '../core/haptics';
import { isNative } from '../core/platform';
import { dayNumber, persist, save, type Mission } from '../core/storage';
import type { Game, RunResult } from '../game/game';
import { makeCanvas } from '../game/math';
import { SKINS, TRAILS, type Price, type Skin, type Trail } from '../game/skins';
import { drawPlayer } from '../game/sprites';
import { hideBanner, maybeInterstitial, showBanner, showPrivacyOptions, showRewarded } from '../services/ads';
import { billingSupported, buy, priceOf, restore } from '../services/billing';
import { shareScore } from '../services/share';
import { hydrateIcons, icon, type IconName } from './icons';

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!;
const $$ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => Array.from(root.querySelectorAll<T>(sel));

const FREE_COINS = 40;
const FREE_LIMIT = 8;
const FREE_KEY = 'bo-free';

type Screen = 'menu' | 'hud' | 'over' | 'revive' | 'pause' | 'shop' | 'daily' | 'missions' | 'settings';
const MODALS: Screen[] = ['shop', 'daily', 'missions', 'settings'];

export class UI {
  private game: Game;
  private base: Screen = 'menu';
  private modal: Screen | null = null;
  private shopTab = 'skins';
  private result: RunResult | null = null;
  private reviveTimer = 0;
  private doubled = false;
  private toastTimer = 0;

  constructor(game: Game) {
    this.game = game;
    hydrateIcons(document);
    this.bind();
    this.refreshWallet();
    this.refreshBadges();
    this.show('menu');
  }

  /* ============================== navegação ============================== */

  private show(s: Screen): void {
    if (MODALS.includes(s)) {
      if (this.modal) $(`#${this.modal}`).classList.remove('on');
      this.modal = s;
      $(`#${s}`).classList.add('on');
      if (s === 'shop') this.renderShop();
      if (s === 'daily') this.renderDaily();
      if (s === 'missions') this.renderMissions();
      if (s === 'settings') this.renderSettings();
      return;
    }
    for (const id of ['menu', 'hud', 'over', 'revive', 'pause']) $(`#${id}`).classList.remove('on');
    this.base = s;
    $(`#${s}`).classList.add('on');
    if (s === 'pause' || s === 'revive' || s === 'over') $('#hud').classList.add('on');
    if (s === 'menu' || s === 'over') showBanner();
    else hideBanner();
    if (s === 'menu') {
      this.refreshBadges();
      $('#starter-offer').classList.toggle('hidden', save.starter || save.runs < 2);
    }
  }

  private closeModal(): void {
    if (!this.modal) return;
    $(`#${this.modal}`).classList.remove('on');
    this.modal = null;
    this.refreshBadges();
  }

  /** Botão voltar do Android. Retorna false se deve sair do app. */
  back(): boolean {
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
    this.show('pause');
  }

  private resume(): void {
    this.game.paused = false;
    this.show('hud');
  }

  /* ============================== bindings ============================== */

  private bind(): void {
    const canvas = this.game.canvas;
    const press = (e: Event) => {
      e.preventDefault();
      audio.unlock();
      if (this.base === 'hud') {
        this.game.input();
      }
    };
    canvas.addEventListener('pointerdown', press, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        if (this.base === 'menu' && !this.modal) this.play();
        else press(e);
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
        if (open.dataset.tab) this.shopTab = open.dataset.tab;
        this.show(open.dataset.open as Screen);
      }
      if (t.closest('[data-close]')) this.closeModal();
      if (t.classList.contains('modal-screen') && this.modal) this.closeModal();
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
    $('#revive-cost').textContent = String(ECONOMY.reviveGemCost);
    $('#version').textContent = `v${__APP_VERSION__} · ${isNative ? 'Android' : 'Web'}`;

    $$('.tabs button').forEach((b) => {
      b.onclick = () => {
        this.shopTab = b.dataset.tab!;
        this.renderShop();
      };
    });

    $$<HTMLInputElement>('[data-setting]').forEach((inp) => {
      inp.onchange = () => {
        const k = inp.dataset.setting as 'sound' | 'music' | 'haptics' | 'lowFx';
        save[k] = inp.checked;
        persist();
        audio.applySettings();
        if (k === 'lowFx') this.game.setLowFx(inp.checked);
        if (k === 'haptics' && inp.checked) haptics.tap('medium');
      };
    });

    bus.on('wallet', () => this.refreshWallet());
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
    bus.on('gameover', (r: RunResult) => this.onGameOver(r));
    bus.on('purchase', (def: ProductDef) => {
      audio.cash();
      haptics.success();
      if (def.kind === 'gems') this.toast(`+${def.gems} gemas!`, 'gem');
      else this.toast('Compra concluída! Obrigado!', 'party');
      if (this.modal === 'shop') this.renderShop();
      $('#starter-offer').classList.toggle('hidden', save.starter || save.runs < 2);
    });
    bus.on('prices', () => this.modal === 'shop' && this.renderShop());
    bus.on('mission-done', (m: Mission) => this.toast(`Missão completa: ${missionText(m)}`, 'target'));
  }

  /* ============================== jogo ============================== */

  private play(): void {
    audio.unlock();
    this.show('hud');
    $('#hud-score').textContent = '0';
    $('#hud-coins').textContent = '0';
    $('#tutorial').classList.toggle('hidden', save.runs >= 2);
    this.game.start();
  }

  private async again(): Promise<void> {
    await maybeInterstitial();
    this.game.reset('play');
    this.play();
  }

  private async goHome(): Promise<void> {
    if (this.base === 'over') await maybeInterstitial();
    this.game.reset('menu');
    this.show('menu');
  }

  private onGameOver(r: RunResult): void {
    this.result = r;
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
    cancelAnimationFrame(this.reviveTimer);
    const r = this.result!;
    const stats = this.game.runStats;
    // creditar recompensa da corrida
    addCoins(stats.coins);
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
    $('#over-coins').textContent = String(stats.coins);
    $('#over-perfects').textContent = String(stats.perfects);
    $('#over-planets').textContent = String(stats.planets);
    $('#over-newbest').classList.toggle('hidden', !newBest);
    $('#over-title').textContent = newBest ? 'INCRÍVEL!' : pickPhrase(this.game.score);
    const dbl = $<HTMLButtonElement>('#btn-double');
    dbl.classList.toggle('hidden', stats.coins < 3);
    dbl.disabled = false;
    dbl.innerHTML = `${icon('video')} Dobrar moedas +${stats.coins} ${icon('coin')}`;
    if (newBest) {
      audio.unlock2();
      haptics.success();
    }
    this.result = { ...r, newBest, best: save.best };
    this.show('over');
  }

  private async doubleCoins(): Promise<void> {
    if (this.doubled) return;
    const btn = $<HTMLButtonElement>('#btn-double');
    btn.disabled = true;
    const ok = await showRewarded();
    if (ok) {
      this.doubled = true;
      const c = this.game.runStats.coins;
      addCoins(c);
      this.flyReward({ coins: c }, btn);
      btn.innerHTML = `${icon('check')} Moedas dobradas!`;
      audio.cash();
    } else {
      btn.disabled = false;
      this.toast('Vídeo indisponível agora', 'video');
    }
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
    localStorage.setItem(FREE_KEY, JSON.stringify(st));
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
      if (e.textContent !== String(save.coins)) {
        e.textContent = String(save.coins);
        const pill = e.closest('.pill');
        pill?.classList.remove('bump');
        void (pill as HTMLElement)?.offsetWidth;
        pill?.classList.add('bump');
      }
    });
    $$('[data-bind="gems"]').forEach((e) => (e.textContent = String(save.gems)));
    $$('[data-bind="best"]').forEach((e) => (e.textContent = String(save.best)));
  }

  private refreshBadges(): void {
    const set = (k: string, n: number | string) => {
      const el = $(`[data-badge="${k}"]`);
      el.classList.toggle('hidden', !n);
      el.textContent = String(n);
    };
    set('daily', dailyAvailable() ? '!' : 0);
    set('missions', missionsReady());
    set('shop', itemsAffordable());
    set('free', this.freeState().n < FREE_LIMIT ? `+${FREE_COINS}` : 0);
    this.refreshWallet();
  }

  /* ============================== loja ============================== */

  private renderShop(): void {
    $$('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === this.shopTab));
    const body = $('#shop-body');
    body.innerHTML = '';
    if (this.shopTab === 'gems') return this.renderGems(body);
    const grid = document.createElement('div');
    grid.className = 'grid';
    const items: (Skin | Trail)[] = this.shopTab === 'skins' ? SKINS : TRAILS;
    for (const item of items) {
      const isSkin = this.shopTab === 'skins';
      const owned = isSkin ? ownsSkin(item.id) : ownsTrail(item.id);
      const equipped = isSkin ? save.skin === item.id : save.trail === item.id;
      const card = document.createElement('div');
      card.className = 'card' + (equipped ? ' equipped' : '');
      const cv = isSkin ? skinPreview(item as Skin) : trailPreview(item as Trail);
      card.appendChild(cv);
      if (isSkin) {
        const r = (item as Skin).rarity;
        const tag = document.createElement('span');
        tag.className = `rarity r-${r}`;
        tag.textContent = { common: 'comum', rare: 'raro', epic: 'épico', legendary: 'lendário', mythic: 'mítico' }[r];
        card.appendChild(tag);
      }
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = item.name;
      card.appendChild(name);
      const btn = document.createElement('button');
      btn.className = 'price';
      if (equipped) {
        btn.classList.add('on');
        btn.innerHTML = `${icon('check')} Equipado`;
      } else if (owned) {
        btn.classList.add('equip');
        btn.textContent = 'Equipar';
      } else {
        this.fillPrice(btn, item.price, item.id);
      }
      btn.onclick = () => this.onItem(item, isSkin);
      card.appendChild(btn);
      grid.appendChild(card);
    }
    body.appendChild(grid);
  }

  private fillPrice(btn: HTMLElement, p: Price, id: string): void {
    if (p.coins) {
      btn.innerHTML = `<i class="coin"></i>${p.coins}`;
      if (!canAfford(p)) btn.classList.add('cant');
    } else if (p.gems) {
      btn.innerHTML = `<i class="gem"></i>${p.gems}`;
      if (!canAfford(p)) btn.classList.add('cant');
    } else if (p.ads) {
      btn.classList.add('ad');
      btn.innerHTML = `${icon('video')} ${save.adProgress[id] ?? 0}/${p.ads}`;
    } else if (p.iap) {
      btn.classList.add('ad');
      btn.innerHTML = `${icon('gift')} Pacote`;
    }
  }

  private async onItem(item: Skin | Trail, isSkin: boolean): Promise<void> {
    const owned = isSkin ? ownsSkin(item.id) : ownsTrail(item.id);
    const unlock = () => {
      if (isSkin) unlockSkin(item.id);
      else unlockTrail(item.id);
      audio.unlock2();
      haptics.success();
      this.toast(`${item.name} desbloqueado!`, 'party');
    };
    if (!owned) {
      const p = item.price;
      if (p.iap) {
        this.shopTab = 'gems';
        this.renderShop();
        return;
      }
      if (p.ads) {
        const ok = await showRewarded();
        if (!ok) return this.toast('Vídeo indisponível agora', 'video');
        save.adProgress[item.id] = (save.adProgress[item.id] ?? 0) + 1;
        persist();
        if (save.adProgress[item.id] >= p.ads) unlock();
        else this.toast(`${save.adProgress[item.id]}/${p.ads} — continue assistindo!`, 'video');
      } else if (!spend(p)) {
        if (p.gems) {
          this.toast('Gemas insuficientes', 'gem');
          this.shopTab = 'gems';
          this.renderShop();
        } else this.toast('Moedas insuficientes — jogue mais ou pegue grátis', 'coin');
        return;
      } else unlock();
      if (!(isSkin ? ownsSkin(item.id) : ownsTrail(item.id))) return this.renderShop();
    }
    if (isSkin) save.skin = item.id;
    else save.trail = item.id;
    persist();
    this.game.refreshCosmetics();
    this.renderShop();
  }

  private renderGems(body: HTMLElement): void {
    const native = isNative && billingSupported();
    const add = (html: string) => body.insertAdjacentHTML('beforeend', html);
    for (const p of PRODUCTS) {
      if (p.kind === 'starter' && save.starter) continue;
      if (p.kind === 'noads' && save.noAds) continue;
      if (p.kind === 'gems' && p.id === 'gems_small') add('<div class="section-title">Gemas</div>');
      const title = p.kind === 'starter' ? 'Pacote Inicial' : p.kind === 'noads' ? 'Sem Anúncios' : `${p.gems} Gemas`;
      const desc =
        p.kind === 'starter'
          ? `Remove anúncios + ${p.gems} ${GEM} + ${p.coins} ${COIN} + skin lendária Galáxia`
          : p.kind === 'noads'
            ? 'Remove banners e intersticiais para sempre'
            : p.id === 'gems_mega'
              ? 'Melhor custo-benefício!'
              : 'Use para skins épicas e continuar';
      const badge = p.badge === 'best' ? 'MELHOR OFERTA' : p.badge === 'popular' ? 'POPULAR' : '';
      add(`<div class="product ${p.kind === 'starter' ? 'featured' : ''}">
        ${badge ? `<span class="p-badge">${badge}</span>` : ''}
        ${productArt(p.id)}
        <div class="p-info"><div class="p-title">${title}</div><div class="p-desc">${desc}</div></div>
        <button class="price" data-buy="${p.id}">${native ? priceOf(p) : 'No app'}</button>
      </div>`);
    }
    add('<div class="section-title">Trocar</div>');
    add(`<div class="product">
      ${productArt('convert')}
      <div class="p-info"><div class="p-title">10 ${GEM} → ${10 * ECONOMY.gemsToCoinsRate} ${COIN}</div><div class="p-desc">Converta gemas em moedas</div></div>
      <button class="price ${save.gems < 10 ? 'cant' : ''}" id="btn-convert"><i class="gem"></i>10</button>
    </div>`);
    add(`<div class="product">
      ${productArt('free')}
      <div class="p-info"><div class="p-title">+${FREE_COINS} moedas grátis</div><div class="p-desc">Assista a um vídeo curto (${FREE_LIMIT - this.freeState().n} restantes hoje)</div></div>
      <button class="price ad" id="btn-free2">Assistir</button>
    </div>`);
    if (!isNative) add(`<p class="muted">Compras disponíveis no app Android.<br/><a class="link" href="${LINKS.playStore}" target="_blank" rel="noopener">Baixar na Google Play</a></p>`);

    $$('[data-buy]', body).forEach((b) => {
      b.onclick = async () => {
        const def = PRODUCTS.find((p) => p.id === b.dataset.buy)!;
        if (!native) {
          window.open(LINKS.playStore, '_blank');
          return;
        }
        b.setAttribute('disabled', '');
        const r = await buy(def);
        b.removeAttribute('disabled');
        if (r === 'pending') this.toast('Pagamento pendente — você recebe assim que confirmar');
        else if (r === 'error') this.toast('Não foi possível concluir a compra');
        else if (r === 'unavailable') this.toast('Loja indisponível no momento');
        this.renderShop();
      };
    });
    $('#btn-convert', body).onclick = () => {
      if (save.gems < 10) return this.toast('Gemas insuficientes', 'gem');
      addGems(-10);
      addCoins(10 * ECONOMY.gemsToCoinsRate);
      audio.cash();
      this.renderShop();
    };
    $('#btn-free2', body).onclick = async () => {
      await this.freeCoins();
      this.renderShop();
    };
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

  private renderSettings(): void {
    $$<HTMLInputElement>('[data-setting]').forEach((inp) => {
      inp.checked = !!save[inp.dataset.setting as 'sound'];
    });
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
      const part = (v: number | undefined, ico: IconName) => (v ? `<span class="rf-part">+${v}${icon(ico, { size: 30 })}</span>` : '');
      el.innerHTML = part(reward.coins, 'coin') + part(reward.gems, 'gem');
    }
    el.style.left = `${r.left + r.width / 2}px`;
    el.style.top = `${r.top - 10}px`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }
}

/* ============================== helpers ============================== */

const COIN = '<i class="coin"></i>';
const GEM = '<i class="gem"></i>';

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
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

/** Composição ilustrada dos produtos da loja: placa brilhante + ícone principal + acento. */
const PRODUCT_ART: Record<string, { main: IconName; plate: string; accent?: IconName }> = {
  starter_pack: { main: 'chest', plate: 'gold', accent: 'star' },
  remove_ads: { main: 'no-ads', plate: 'violet', accent: 'shield' },
  gems_small: { main: 'gem', plate: 'violet' },
  gems_medium: { main: 'gem-pile', plate: 'violet', accent: 'sparkle' },
  gems_large: { main: 'gem-heap', plate: 'pink', accent: 'sparkle' },
  gems_mega: { main: 'gem-chest', plate: 'gold', accent: 'crown' },
  convert: { main: 'refresh', plate: 'violet', accent: 'coin' },
  free: { main: 'video', plate: 'green', accent: 'coin' },
};

function productArt(id: string): string {
  const a = PRODUCT_ART[id] ?? { main: 'gem' as IconName, plate: 'cyan' };
  return `<div class="p-ico plate plate-${a.plate}">${icon(a.main)}${a.accent ? `<span class="p-accent">${icon(a.accent)}</span>` : ''}</div>`;
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

function skinPreview(skin: Skin): HTMLCanvasElement {
  const d = Math.min(2, window.devicePixelRatio || 1);
  const [c, x] = makeCanvas(92 * d, 92 * d);
  x.scale(d, d);
  x.translate(46, 52);
  const g = x.createRadialGradient(0, 0, 0, 0, 0, 44);
  g.addColorStop(0, skin.light + '55');
  g.addColorStop(1, skin.light + '00');
  x.fillStyle = g;
  x.fillRect(-46, -52, 92, 92);
  drawPlayer(x, skin, 22, { t: 0.4, blink: 0, lookX: 0.2, lookY: 0.1, sx: 1, sy: 1, mood: 'idle', lx: -0.55, ly: -0.83 });
  return c;
}

function trailPreview(trail: Trail): HTMLCanvasElement {
  const d = Math.min(2, window.devicePixelRatio || 1);
  const [c, x] = makeCanvas(92 * d, 92 * d);
  x.scale(d, d);
  x.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 26; i++) {
    const t = i / 26;
    const px = 12 + t * 66;
    const py = 78 - t * 60 + Math.sin(t * 8) * 6;
    const r = 2 + t * 6;
    const col = trail.colors[i % trail.colors.length];
    const g = x.createRadialGradient(px, py, 0, px, py, r * 2);
    g.addColorStop(0, col);
    g.addColorStop(1, col + '00');
    x.fillStyle = g;
    x.globalAlpha = 0.3 + t * 0.7;
    x.beginPath();
    x.arc(px, py, r * 2, 0, Math.PI * 2);
    x.fill();
  }
  x.globalAlpha = 1;
  x.globalCompositeOperation = 'source-over';
  x.fillStyle = '#ff8fd8';
  x.beginPath();
  x.arc(80, 16, 9, 0, Math.PI * 2);
  x.fill();
  return c;
}
