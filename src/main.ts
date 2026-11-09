import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import './ui/styles.css';

import { App } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { audio } from './core/audio';
import { isNative } from './core/platform';
import { persistNow } from './core/storage';
import { Game } from './game/game';
import { initAds } from './services/ads';
import { initBilling } from './services/billing';
import { UI } from './ui/ui';
import { initCreator } from './ui/creator';

async function boot(): Promise<void> {
  // garante a fonte antes do primeiro texto no canvas
  try {
    await Promise.race([document.fonts.load('700 20px Fredoka'), new Promise((r) => setTimeout(r, 800))]);
  } catch {
    /* segue */
  }

  const game = new Game(document.getElementById('game') as HTMLCanvasElement);
  const ui = new UI(game);
  initCreator(game);
  if (location.search.includes('debug')) (window as any).__bloop = { game, ui };

  const onHide = () => {
    ui.pause();
    audio.suspend();
    persistNow();
  };
  document.addEventListener('visibilitychange', () => (document.hidden ? onHide() : audio.resume()));

  if (isNative) {
    StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    StatusBar.hide().catch(() => {});
    App.addListener('pause', onHide);
    App.addListener('resume', () => audio.resume());
    App.addListener('backButton', () => {
      if (!ui.back()) App.minimizeApp();
    });
    SplashScreen.hide().catch(() => {});
  } else if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  initAds();
  initBilling();
}

boot();
