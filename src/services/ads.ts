import {
  AdMob,
  AdmobConsentStatus,
  BannerAdPluginEvents,
  BannerAdPosition,
  BannerAdSize,
  InterstitialAdPluginEvents,
  RewardAdPluginEvents,
} from '@capacitor-community/admob';
import { ADMOB, AD_FREE, AD_RULES, ADS_TEST_MODE, WEB_ADS } from '../config';
import { audio } from '../core/audio';
import { bus } from '../core/events';
import { icon } from '../ui/icons';
import { isNative } from '../core/platform';
import { persist, save } from '../core/storage';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
    adBreak?: (o: Record<string, unknown>) => void;
    adConfig?: (o: Record<string, unknown>) => void;
  }
}

let rewardedReady = false;
let interstitialReady = false;
/** banner nativo criado (pode estar escondido com hideBanner/resumeBanner) */
let bannerCreated = false;
/** banner visível agora */
let bannerShown = false;
let busy = false;
let webReady = false;
/** momento da última compra com dinheiro real (sessão atual) */
let lastPurchaseAt = 0;
/** pausa de intersticiais depois de uma compra */
const AFTER_PURCHASE_MS = 15 * 60 * 1000;

/** Chamado pelo billing: nada de intersticial logo depois de alguém pagar. */
export function notePurchase(): void {
  lastPurchaseAt = Date.now();
}

/* ---------------- tempo sem anúncios / isenções ---------------- */

/** Clube Bloop ativo (assinatura). Lido direto do save para não criar dependência circular. */
export const clubActive = (now = Date.now()): boolean => save.club.expires > now;

/** Checagens registradas pelos passes (Estelar, Casa): true = premium da temporada vigente → sem anúncios. */
const passPremiumChecks: (() => boolean)[] = [];
const passPremiumCheck = (): boolean => passPremiumChecks.some((f) => f());
/** Cada passe registra aqui como saber se o jogador tem o premium vigente. */
export function setPassPremiumCheck(fn: () => boolean): void {
  passPremiumChecks.push(fn);
}

/** ms restantes de tempo sem anúncios ganho com vídeos. */
export const adFreeLeftMs = (now = Date.now()): number => Math.max(0, save.adFree.until - now);

/**
 * true = não mostrar intersticial nem banner agora
 * (Sem Anúncios comprado, Clube ativo, Passe premium da temporada ou tempo sem anúncios).
 * Vídeos premiados continuam disponíveis (são opcionais).
 */
export function adsSuppressed(now = Date.now()): boolean {
  return save.noAds || clubActive(now) || adFreeLeftMs(now) > 0 || passPremiumCheck();
}

/** Progresso do medidor: vídeos já vistos para o próximo bloco. */
export function adFreeMeter(): { videos: number; need: number; leftMs: number; maxed: boolean } {
  const left = adFreeLeftMs();
  return { videos: save.adFree.videos, need: AD_FREE.videos, leftMs: left, maxed: left >= (AD_FREE.maxMinutes - AD_FREE.minutes) * 60000 + 1 };
}

/**
 * Assiste 1 vídeo premiado para o medidor "X vídeos = 30 min sem anúncios".
 * Retorna 'blocked' quando o bloco completou (ganhou tempo), 'progress' quando só avançou,
 * 'maxed' se já está no teto, 'fail' se o vídeo não foi assistido.
 */
export async function watchForAdFree(): Promise<'progress' | 'blocked' | 'maxed' | 'fail'> {
  if (adFreeMeter().maxed) return 'maxed';
  const ok = await showRewarded();
  if (!ok) return 'fail';
  save.adFree.videos++;
  let res: 'progress' | 'blocked' = 'progress';
  if (save.adFree.videos >= AD_FREE.videos) {
    save.adFree.videos = 0;
    const now = Date.now();
    const base = Math.max(now, save.adFree.until);
    save.adFree.until = Math.min(now + AD_FREE.maxMinutes * 60000, base + AD_FREE.minutes * 60000);
    res = 'blocked';
    hideBanner();
  }
  persist();
  bus.emit('ad-free');
  return res;
}

async function loadRewarded(): Promise<void> {
  if (!isNative) return;
  try {
    await AdMob.prepareRewardVideoAd({ adId: ADMOB.rewarded, isTesting: ADS_TEST_MODE });
    rewardedReady = true;
  } catch {
    rewardedReady = false;
    setTimeout(loadRewarded, 15000);
  }
}

async function loadInterstitial(): Promise<void> {
  if (!isNative || save.noAds || clubActive()) return;
  try {
    await AdMob.prepareInterstitial({ adId: ADMOB.interstitial, isTesting: ADS_TEST_MODE });
    interstitialReady = true;
  } catch {
    interstitialReady = false;
    setTimeout(loadInterstitial, 20000);
  }
}

function initWeb(): void {
  if (!WEB_ADS.adsenseClient) return;
  const s = document.createElement('script');
  s.async = true;
  s.crossOrigin = 'anonymous';
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${WEB_ADS.adsenseClient}`;
  s.dataset.adFrequencyHint = '60s';
  if (ADS_TEST_MODE) s.dataset.adbreakTest = 'on';
  document.head.appendChild(s);
  window.adsbygoogle = window.adsbygoogle || [];
  window.adBreak = window.adConfig = (o) => window.adsbygoogle!.push(o);
  window.adConfig({ preloadAdBreaks: 'on', sound: 'on', onReady: () => (webReady = true) });
}

export async function initAds(): Promise<void> {
  startBannerManager();
  if (!isNative) {
    initWeb();
    return;
  }
  try {
    await AdMob.initialize({ initializeForTesting: ADS_TEST_MODE });
    // Consentimento (GDPR/UMP) — obrigatório na Europa/Reino Unido.
    try {
      const info = await AdMob.requestConsentInfo();
      if (info.isConsentFormAvailable && info.status === AdmobConsentStatus.REQUIRED) await AdMob.showConsentForm();
    } catch {
      /* segue sem formulário */
    }
    // banner: altura real (dp = px CSS) → --ad-bottom; falhou → 0 (nunca deixa espaço vazio nem cobre botões)
    AdMob.addListener(BannerAdPluginEvents.SizeChanged, (info) => setAdBottom(bannerShown ? info?.height ?? 0 : 0));
    AdMob.addListener(BannerAdPluginEvents.Loaded, () => scheduleBanner());
    AdMob.addListener(BannerAdPluginEvents.FailedToLoad, () => {
      bannerShown = false;
      bannerFailAt = Date.now();
      setAdBottom(0);
    });
    AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
      rewardedReady = false;
      loadRewarded();
    });
    AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => {
      interstitialReady = false;
      loadInterstitial();
    });
    loadRewarded();
    loadInterstitial();
    nativeReady = true;
    scheduleBanner();
  } catch (e) {
    console.warn('AdMob init falhou', e);
  }
}

export async function showPrivacyOptions(): Promise<void> {
  if (isNative) await AdMob.showPrivacyOptionsForm().catch(() => {});
}

export function rewardedAvailable(): boolean {
  if (isNative) return true; // tenta carregar na hora se ainda não estiver pronto
  return webReady || ADS_TEST_MODE;
}

/** Vídeo premiado. Resolve true somente se o jogador assistiu até o fim. */
export async function showRewarded(): Promise<boolean> {
  if (busy) return false;
  busy = true;
  audio.suspend();
  bus.emit('ad-open');
  try {
    if (isNative) {
      if (!rewardedReady) await loadRewarded();
      if (!rewardedReady) return false;
      let rewarded = false;
      const h = await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => (rewarded = true));
      const done = new Promise<void>((res) => {
        const h2 = AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
          h2.then((x) => x.remove());
          res();
        });
        const h3 = AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => {
          h3.then((x) => x.remove());
          res();
        });
      });
      try {
        const item = await AdMob.showRewardVideoAd();
        if (item) rewarded = true;
      } catch {
        /* falhou ao exibir */
      }
      await Promise.race([done, new Promise((r) => setTimeout(r, 1500))]);
      h.remove();
      return rewarded;
    }
    if (WEB_ADS.adsenseClient && window.adBreak) {
      return await new Promise<boolean>((resolve) => {
        let ok = false;
        window.adBreak!({
          type: 'reward',
          name: 'reward',
          beforeReward: (show: () => void) => show(),
          adViewed: () => (ok = true),
          adDismissed: () => (ok = false),
          adBreakDone: () => resolve(ok),
        });
      });
    }
    if (ADS_TEST_MODE) return await fakeAd(true);
    return false;
  } finally {
    busy = false;
    audio.resume();
    bus.emit('ad-close');
  }
}

/** Intersticial com limite de frequência — nunca para quem comprou "Sem Anúncios". */
export async function maybeInterstitial(): Promise<void> {
  if (adsSuppressed() || busy) return;
  if (lastPurchaseAt && Date.now() - lastPurchaseAt < AFTER_PURCHASE_MS) return;
  save.runsSinceAd++;
  persist();
  const now = Date.now();
  if (save.runs <= AD_RULES.freeRunsBeforeFirstInterstitial) return;
  if (save.runsSinceAd < AD_RULES.interstitialEveryNRuns) return;
  if (now - save.lastInterstitial < AD_RULES.interstitialMinSeconds * 1000) return;
  busy = true;
  audio.suspend();
  bus.emit('ad-open');
  try {
    let shown = false;
    if (isNative && interstitialReady) {
      await AdMob.showInterstitial().then(() => (shown = true)).catch(() => {});
    } else if (!isNative && WEB_ADS.adsenseClient && window.adBreak) {
      await new Promise<void>((resolve) => window.adBreak!({ type: 'next', name: 'game-over', adBreakDone: () => resolve() }));
      shown = true;
    } else if (!isNative && ADS_TEST_MODE) {
      shown = await fakeAd(false);
    }
    if (shown) {
      save.runsSinceAd = 0;
      save.lastInterstitial = Date.now();
      persist();
    }
  } finally {
    busy = false;
    audio.resume();
    bus.emit('ad-close');
  }
}

/* ============================================================
 *  BANNER — gerenciador central de visibilidade
 *
 *  Regra: o banner aparece SÓ no hub (menu, painéis/menus por cima dele) e nas telas de
 *  resultado entre partidas. NUNCA durante o jogo, no bichinho, na casa (2D/3D), no criador,
 *  no game host (minigames em tela cheia), no onboarding ou com anúncio/celebração aberta.
 *  Também respeita adsSuppressed() (Sem Anúncios, Clube, Passe premium, tempo sem anúncios).
 *
 *  A altura real (evento SizeChanged do AdMob) vai para a variável CSS --ad-bottom no :root;
 *  --safe-bot (styles.css) = safe-area + --ad-bottom, então toda tela que respeita --safe-bot
 *  sobe o conteúdo acima do banner. Banner escondido → --ad-bottom: 0px.
 *
 *  Quem abre/fecha telas não precisa saber de nada: showBanner()/hideBanner() só pedem uma
 *  reavaliação, e um verificador leve (a cada 600 ms + eventos do bus) acompanha o DOM.
 *  Teste no navegador: ?fakebanner=60 desenha um banner falso de 60 px.
 * ============================================================ */

/** Telas onde o banner pode aparecer (pelo menos uma precisa estar ligada). */
const ALLOW_SEL = '#menu.on, #over.on';
/** Telas que escondem o banner (jogo, bichinho, casa, criador, minigame, onboarding, anúncio...). */
const BLOCK_SEL = [
  '#game-host.on',
  '.pet-scr.on',
  '.hm-scr.on',
  '.h3',
  '#creator.on',
  '.race-screen.on',
  '.sc-game-root',
  '.ob-root',
  '.celebrate',
  '.fake-ad',
].join(', ');

let nativeReady = false;
let bannerFailAt = 0;
let applying = false;
let timer = 0;
let fakeH = 0;
let fakeEl: HTMLElement | null = null;
let managerOn = false;
/** pedido externo para esconder já (ex.: anúncio em tela cheia, compra) */
let holdUntil = 0;

function fakeBannerHeight(): number {
  if (isNative) return 0;
  const m = /[?&]fakebanner(?:=(\d+))?/.exec(location.search);
  return m ? Math.max(20, Math.min(160, Number(m[1] ?? 60) || 60)) : 0;
}

/** Variável CSS usada por todas as telas para não ficarem embaixo do banner. */
function setAdBottom(px: number): void {
  const v = Math.max(0, Math.round(px));
  document.documentElement.style.setProperty('--ad-bottom', v + 'px');
  document.body?.classList.toggle('has-banner', v > 0);
}

/** O contexto atual permite banner? (sem olhar compras) */
export function bannerContextOk(): boolean {
  if (Date.now() < holdUntil || busy) return false;
  if (document.hidden) return false;
  const hud = document.getElementById('hud');
  const over = document.getElementById('over');
  if (hud?.classList.contains('on') && !over?.classList.contains('on')) return false; // jogando / pausa
  if (!document.querySelector(ALLOW_SEL)) return false;
  return !document.querySelector(BLOCK_SEL);
}

function bannerWanted(): boolean {
  return !adsSuppressed() && bannerContextOk();
}

async function applyBanner(): Promise<void> {
  if (applying) return;
  applying = true;
  try {
    const want = bannerWanted();
    if (fakeH) return applyFake(want);
    if (!isNative || !nativeReady) return;
    if (want && !bannerShown) {
      if (Date.now() - bannerFailAt < 30000) return; // falhou há pouco: não insiste
      bannerShown = true;
      if (bannerCreated) await AdMob.resumeBanner();
      else {
        await AdMob.showBanner({
          adId: ADMOB.banner,
          adSize: BannerAdSize.ADAPTIVE_BANNER,
          position: BannerAdPosition.BOTTOM_CENTER,
          margin: 0,
          isTesting: ADS_TEST_MODE,
        });
        bannerCreated = true;
      }
    } else if (!want && bannerShown) {
      bannerShown = false;
      setAdBottom(0); // já tira o espaço; o nativo some logo em seguida
      if (bannerCreated) await AdMob.hideBanner();
    }
  } catch {
    bannerShown = false;
    bannerFailAt = Date.now();
    setAdBottom(0);
  } finally {
    applying = false;
  }
}

function applyFake(want: boolean): void {
  if (want && !fakeEl) {
    fakeEl = document.createElement('div');
    fakeEl.className = 'fake-banner';
    fakeEl.style.cssText = `position:fixed;left:0;right:0;bottom:env(safe-area-inset-bottom,0px);height:${fakeH}px;z-index:2147483000;background:repeating-linear-gradient(45deg,#ffe066,#ffe066 12px,#ffd23f 12px,#ffd23f 24px);color:#3a2a00;font:700 14px/1 system-ui,sans-serif;display:flex;align-items:center;justify-content:center;pointer-events:none;border-top:2px solid #b38f00`;
    fakeEl.textContent = `AD BANNER (teste ${fakeH}px)`;
    document.body.appendChild(fakeEl);
    bannerShown = true;
    setAdBottom(fakeH);
  } else if (!want && fakeEl) {
    fakeEl.remove();
    fakeEl = null;
    bannerShown = false;
    setAdBottom(0);
  }
}

/** Reavalia o banner no próximo tick (depois que a tela terminou de trocar). */
export function scheduleBanner(): void {
  clearTimeout(timer);
  timer = window.setTimeout(() => void applyBanner(), 30);
}

function startBannerManager(): void {
  if (managerOn) return;
  managerOn = true;
  fakeH = fakeBannerHeight();
  setAdBottom(0);
  if (!isNative && !fakeH) return; // web sem banner: nada a gerenciar
  for (const ev of ['hub-show', 'host-open', 'host-close', 'race-exit', 'purchase', 'club', 'ad-free', 'panel-open', 'panel-close', 'pet-closed', 'onboarding-done'])
    bus.on(ev, scheduleBanner);
  bus.on('ad-open', () => {
    holdUntil = Date.now() + 500;
    void applyBanner();
  });
  bus.on('ad-close', scheduleBanner);
  document.addEventListener('visibilitychange', scheduleBanner);
  // verificador leve: pega qualquer tela que abre/fecha sem avisar
  window.setInterval(() => {
    if (bannerWanted() !== bannerShown) void applyBanner();
  }, 600);
  scheduleBanner();
}

/** Compatibilidade: telas chamam ao abrir o menu/resultado — só pede reavaliação. */
export async function showBanner(): Promise<void> {
  scheduleBanner();
}

/** Compatibilidade: telas chamam ao sair do menu — esconde no próximo tick se a regra mandar. */
export async function hideBanner(): Promise<void> {
  scheduleBanner();
}

/** Altura atual reservada para o banner (px CSS). */
export function adBottomPx(): number {
  return bannerShown ? parseInt(getComputedStyle(document.documentElement).getPropertyValue('--ad-bottom')) || 0 : 0;
}

export function onNoAdsPurchased(): void {
  hideBanner();
  interstitialReady = false;
}

/** Anúncio simulado só para testar o fluxo no navegador (modo teste). */
function fakeAd(reward: boolean): Promise<boolean> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'fake-ad';
    let left = reward ? 5 : 3;
    el.innerHTML = `<div class="fake-ad-box"><div class="fake-ad-art">${icon('video', { size: 56 })}</div><div class="fake-ad-tag">ANÚNCIO DE TESTE</div><div class="fake-ad-title">Seu anúncio aparece aqui</div><div class="fake-ad-sub">Configure o AdMob/AdSense em <b>src/config.ts</b></div><div class="fake-ad-count">${left}</div><button class="fake-ad-close">Fechar</button></div>`;
    document.body.appendChild(el);
    const count = el.querySelector('.fake-ad-count')!;
    const close = el.querySelector<HTMLButtonElement>('.fake-ad-close')!;
    const timer = setInterval(() => {
      left--;
      count.innerHTML = left > 0 ? String(left) : icon('check', { size: 52 });
      if (left <= 0) {
        clearInterval(timer);
        close.classList.add('ready');
      }
    }, 1000);
    close.onclick = () => {
      clearInterval(timer);
      el.remove();
      resolve(left <= 0);
    };
  });
}
