import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import './ui/styles.css';

import { App } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { audio } from './core/audio';
import { isNative } from './core/platform';
import { persistNow, save } from './core/storage';
import { Game } from './game/game';
import { initAds } from './services/ads';
import { initBilling } from './services/billing';
import { initOnline } from './services/online';
import { playIntro } from './ui/intro';
import { initRace } from './ui/race';
import { UI } from './ui/ui';
import { initCreator } from './ui/creator';
import { initLang, applyI18n } from './i18n/langs';
import { closeHost, hubPause, initHub, launchGame } from './hub/hub';
import { listGames, listPanels } from './hub/registry';
import { registerOrbit } from './hub/orbit-def';
import { registerCorePanels } from './hub/core-panels';
import { registerPet } from './pet/register';
import { petCoinBonus } from './pet/state';
import { registerTubo } from './games/tubo/register';
import { registerRally } from './games/rally/register';
import { registerTycoon } from './games/tycoon/register';
import { registerDisaster } from './games/disaster/register';
import { registerBand } from './games/band/register';
import { registerCreatures } from './creatures/register';
import { wireGlue } from './hub/glue';
import { registerSocial } from './social/register';
import { registerHome } from './home/register';
import { registerPass } from './pass/register';

async function boot(): Promise<void> {
  // garante a fonte antes do primeiro texto no canvas
  try {
    await Promise.race([document.fonts.load('700 20px Fredoka'), new Promise((r) => setTimeout(r, 800))]);
  } catch {
    /* segue */
  }

  initLang(); // idioma salvo ou detectado do aparelho (1ª execução)
  applyI18n(document);
  const intro = playIntro(); // abertura do estúdio: roda por cima enquanto o jogo monta
  const game = new Game(document.getElementById('game') as HTMLCanvasElement);
  const ui = new UI(game);
  initRace(game);
  initCreator(game);

  // ---------------- HUB Bloop World ----------------
  initHub({ getTier: () => game.quality.tier, setOrbitActive: (on) => game.setActive(on) });
  registerOrbit({ play: () => ui.playOrbit() });
  registerCorePanels(ui);
  // Minigames e painéis dos outros módulos (o líder liga depois do merge):
  registerTubo();
  // bônus de moedas do bichinho para minigames que leem window.petCoinBonus(coins) -> moedas extras
  (window as any).petCoinBonus = (coins: number) => Math.round(coins * petCoinBonus());
  registerRally();
  registerTycoon();
  registerDisaster();
  registerBand();
  registerPet();
  registerCreatures();
  wireGlue();
  registerSocial();
  registerHome();
  if (import.meta.env.DEV && location.search.includes('hubdemo')) import('../scripts/dev/hub-demo').then((m) => m.registerHubDemo());
  if (location.search.includes('debug')) (window as any).__bloop = { game, ui, listGames, listPanels, launchGame, closeHost, save };

  const onHide = () => {
    ui.pause();
    hubPause();
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

  await intro; // anúncios/consentimento só depois da abertura
  initAds();
  initBilling();
  registerPass();
  // presentes / códigos / desafios: em segundo plano, nunca bloqueia nem lança erro
  initOnline().catch(() => {});
}

boot();
