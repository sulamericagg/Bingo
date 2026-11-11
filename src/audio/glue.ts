/* ============================================================
 *  BLOOP AUDIO — cola com o app (UM lugar só):
 *  - jogo abriu (bus 'game-launch') → pacote de sons + tema musical + ambiente do jogo
 *  - voltou ao hub ('host-close' / 'hub-show') → pacote/tema do hub, ambiente desliga
 *  - fim de partida ('run-end') → camada de vitória por alguns compassos
 *  - destrava o áudio no 1º toque; sliders Volume/Música/Efeitos nos Ajustes
 * ============================================================ */
import { bus } from '../core/events';
import { engine } from './engine';
import { getPack, setActivePack, preloadPack } from './sound';
import { music } from './music';
import { ambience } from './ambience';
import { mountMixSliders } from './settings-ui';
import './packs';

let hostOpen = false;
let current = 'hub';

/** entra no "modo" de um jogo: sons, música e ambiente dele (jogo sem pacote: sons base, sem música do app) */
export function enterGame(id: string): void {
  current = id;
  const p = getPack(id);
  setActivePack(p ? id : 'base');
  music.play(p ? (p.theme === undefined ? 'hub' : p.theme) : null);
  if (p?.amb) void ambience.start(id);
  else ambience.stop();
}
export function enterHub(): void {
  current = 'hub';
  setActivePack('hub');
  music.play('hub');
  ambience.stop();
}
export const currentGame = () => current;

if (typeof window !== 'undefined') {
  bus.on('game-launch', (id: string) => enterGame(id));
  bus.on('host-open', () => (hostOpen = true));
  bus.on('host-close', () => {
    hostOpen = false;
    enterHub();
  });
  bus.on('hub-show', () => {
    if (!hostOpen && current !== 'hub') enterHub();
  });
  bus.on('run-end', (r: { won?: boolean }) => {
    if (r?.won === false) return;
    music.setState('victory', { bars: 4 });
  });
  setActivePack('hub');
  music.play('hub');
  engine.bindUnlock();
  engine.onReady(() => {
    void preloadPack('base').then(() => preloadPack(current));
  });
  const mount = () => mountMixSliders();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else queueMicrotask(mount);
  bus.on('lang', () => mountMixSliders(true));
}
