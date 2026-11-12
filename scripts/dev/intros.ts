// Página de desenvolvimento das ABERTURAS (docs/INTROS.md).
//   ?play=<jogo>&debug  → só a abertura (window.__cine: seek/skip)
//   ?game=<jogo>&debug  → o jogo de verdade (a abertura entra no "jogo novo" com ?intro=1)
import '../../src/ui/styles.css';
import { listGames } from '../../src/hub/registry';
import { registerJangada } from '../../src/games/jangada/register';
import { registerNoites } from '../../src/games/noites/register';
import { registerCavaFala } from '../../src/games/cavafala/register';
import { registerAnomalias } from '../../src/games/anomalias/register';
import { registerMontaLeva } from '../../src/games/montaleva/register';

const INTROS: Record<string, () => Promise<{ playIntro(root: HTMLElement): Promise<void> }>> = {
  jangada: () => import('../../src/games/jangada/intro/cinematic'),
  noites: () => import('../../src/games/noites/intro/cinematic'),
  cavafala: () => import('../../src/games/cavafala/intro/cinematic'),
  anomalias: () => import('../../src/games/anomalias/intro/cinematic'),
  montaleva: () => import('../../src/games/montaleva/intro/cinematic'),
};
const q = new URLSearchParams(location.search);
const app = document.getElementById('app')!;
const w = window as unknown as { __done?: boolean; __game?: unknown };
const play = q.get('play');
const game = q.get('game');
if (play && INTROS[play]) {
  void INTROS[play]().then(async (m) => {
    document.title = 'ready';
    await m.playIntro(app);
    w.__done = true;
    document.title = 'done';
  });
} else if (game) {
  registerJangada();
  registerNoites();
  registerCavaFala();
  registerAnomalias();
  registerMontaLeva();
  const def = listGames().find((g) => g.id === game)!;
  void def.launch(app, () => (document.title = 'exit')).then((h) => {
    w.__game = h;
    document.title = 'ready';
  });
}
