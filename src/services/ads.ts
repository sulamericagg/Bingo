import {
  AdMob,
  AdmobConsentStatus,
  BannerAdPosition,
  BannerAdSize,
  InterstitialAdPluginEvents,
  RewardAdPluginEvents,
} from '@capacitor-community/admob';
import { ADMOB, AD_RULES, ADS_TEST_MODE, WEB_ADS } from '../config';
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
let bannerShown = false;
let busy = false;
let webReady = false;

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
  if (!isNative || save.noAds) return;
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
  if (save.noAds || busy) return;
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

export async function showBanner(): Promise<void> {
  if (!isNative || save.noAds || bannerShown) return;
  try {
    await AdMob.showBanner({
      adId: ADMOB.banner,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 0,
      isTesting: ADS_TEST_MODE,
    });
    bannerShown = true;
  } catch {
    /* sem banner */
  }
}

export async function hideBanner(): Promise<void> {
  if (!isNative || !bannerShown) return;
  bannerShown = false;
  await AdMob.removeBanner().catch(() => {});
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
