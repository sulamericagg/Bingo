import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import './ui/styles.css';
import { installErrorBoundary, showFatal } from './services/errors';
installErrorBoundary(); // antes de tudo: erros vão para o buffer do relatório beta

import { App } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { audio } from './core/audio';
import { bus } from './core/events';
import { isNative } from './core/platform';
import { restorePortrait } from './core/orientation';
import { installFrameCap } from './core/framecap';
import { needsDeviceCheck } from './core/quality';
import { persistNow, save } from './core/storage';
import { Game } from './game/game';
import { initAds } from './services/ads';
import { initAdBreaks } from './services/adbreaks';
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
import { registerFloresta } from './games/floresta/register';
import { registerVoo } from './games/voo/register';
import { registerCozinha } from './games/cozinha/register';
import { registerCor } from './games/cor/register';
import { registerLugar } from './games/lugar/register';
import { registerCinema } from './cinema/register';
import { registerCaca } from './caca/register';
import { registerMontaLeva } from './games/montaleva/register';
import { registerNoites } from './games/noites/register';
import { registerCavaFala } from './games/cavafala/register';
import { registerJangada } from './games/jangada/register';
import { registerStudio } from './studio/register';
import { registerDesenho } from './games/desenho/register';
import { registerGarimpo } from './games/garimpo/register';
import { registerAnomalias } from './games/anomalias/register';
import { registerCreatures } from './creatures/register';
import { wireGlue } from './hub/glue';
import { openFriendLink, registerSocial } from './social/register';
import { openSquadLink, registerParty } from './party/register';
import { openVooLink } from './ui/links';
import { registerHome } from './home/register';
import { registerPass } from './pass/register';
import { registerMirror } from './mirror/register';
import { runOnboarding } from './ui/onboarding';
import { initBeta, openReportSheet } from './ui/beta';
import { initProfileSync, profile } from './services/profile';
import { setFeedbackProbes } from './services/feedback';
import { isHostActive, selectedGame } from './hub/hub';

/** Onde o jogador está agora (anexado aos relatórios beta). */
function whereNow(): string {
  if (isHostActive()) return 'game:' + (selectedGame()?.id ?? '?');
  const map: [string, string][] = [
    ['.ob-root', 'onboarding'],
    ['.mr-root', 'mirror'],
    ['.pet-scr.on', 'pet'],
    ['.h3', 'house3d'],
    ['.hm-scr.on', 'house'],
    ['#creator.on', 'creator'],
    ['.race-screen.on', 'race'],
    ['.pass-panel', 'pass'],
    ['.crc-overlay', 'collection'],
    ['.sc-overlay', 'social'],
    ['#over.on', 'orbit-result'],
    ['#hud.on', 'orbit'],
  ];
  for (const [sel, name] of map) if (document.querySelector(sel)) return name;
  const modal = document.querySelector('.modal-screen.on');
  if (modal) return 'menu:' + modal.id;
  return document.querySelector('#menu.on') ? 'hub' : 'unknown';
}

async function boot(): Promise<void> {
  // garante a fonte antes do primeiro texto no canvas
  try {
    await Promise.race([document.fonts.load('700 20px Fredoka'), new Promise((r) => setTimeout(r, 800))]);
  } catch {
    /* segue */
  }

  initLang(); // idioma salvo ou detectado do aparelho (1ª execução)
  applyI18n(document);
  installFrameCap(); // "Economia de bateria": 30 fps em todo o app
  // instalou / atualizou / trocou de aparelho: testa a GPU (~2-3 s, tela "Ajustando os gráficos…")
  // ANTES de montar o jogo — todos os QualityGovernor começam no nível medido
  if (needsDeviceCheck()) {
    try {
      const { showDeviceCheck } = await import('./ui/gfxcheck');
      await Promise.race([showDeviceCheck(), new Promise((r) => setTimeout(r, 7000))]);
    } catch (e) {
      console.warn('[gfxcheck]', e);
    }
    document.querySelector('.gfxc')?.remove();
  }
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
  registerFloresta();
  registerVoo();
  registerCozinha();
  registerCor();
  registerCaca();
  registerMontaLeva();
  registerNoites();
  registerCavaFala();
  registerJangada();
  registerStudio();
  registerLugar();
  registerDesenho();
  registerGarimpo();
  registerAnomalias();
  registerPet();
  registerMirror({ getTier: () => game.quality.tier });
  registerCreatures();
  wireGlue();
  registerSocial();
  registerHome();
  registerParty();
  registerCinema();
  if (import.meta.env.DEV && location.search.includes('hubdemo')) import('../scripts/dev/hub-demo').then((m) => m.registerHubDemo());
  if (location.search.includes('debug')) (window as any).__bloop = { game, ui, listGames, listPanels, launchGame, closeHost, save, bus };

  const onHide = () => {
    ui.pause();
    hubPause();
    audio.suspend();
    persistNow();
  };
  // versão web: pede para a tela não apagar (Wake Lock API), e renova ao voltar para a aba
  const wake = () => {
    const wl = (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<unknown> } }).wakeLock;
    if (wl && !document.hidden) wl.request('screen').catch(() => undefined);
  };
  if (!isNative) {
    wake();
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('pointerdown', wake, { once: true });
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? onHide() : audio.resume()));

  if (isNative) {
    StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    StatusBar.hide().catch(() => {});
    restorePortrait(); // manifest já é retrato; a casa 3D trava paisagem via plugin quando abre
    App.addListener('pause', onHide);
    App.addListener('resume', () => {
      audio.resume();
      bus.emit('app-resume');
      // de volta ao app: menu sempre em pé (só a casa 3D pede paisagem, e ela trava sozinha)
      if (!document.querySelector('.gh-game, .h3-canvas')) restorePortrait();
    });
    App.addListener('backButton', () => {
      if (!ui.back()) App.minimizeApp();
    });
    SplashScreen.hide().catch(() => {});
  } else if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  setFeedbackProbes(() => game.quality.tier, whereNow);

  await intro; // anúncios/consentimento só depois da abertura
  // presentes / códigos / desafios: em segundo plano, nunca bloqueia nem lança erro
  initOnline().catch(() => {});
  initProfileSync();
  // 1ª abertura: apelido + @ ANTES do hub; pop-ups/anúncios só depois
  try {
    await runOnboarding(() => game.refreshCosmetics());
  } catch (e) {
    console.error('[onboarding]', e);
    document.querySelector('.ob-root')?.remove();
  }
  // link/QR de amigo (?amigo=<@>) — abre Amigos com o @ preenchido
  // ?voo=<código> (QR da sala do Pouso Forçado) abre o jogo já entrando na sala
  openFriendLink(location.href) || openSquadLink(location.href) || openVooLink(location.href);
  if (isNative) App.addListener('appUrlOpen', (e) => void (openFriendLink(e.url) || openSquadLink(e.url) || openVooLink(e.url)));
  initAds();
  initAdBreaks();
  initBilling();
  registerPass();
  initBeta();
}

boot().catch((e) => {
  console.error('[boot]', e);
  showFatal(e, profile.beta ? () => openReportSheet({ category: 'crash' }) : undefined);
});
