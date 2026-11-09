// Página de desenvolvimento da Bloop Banda (sem o hub).
// /scripts/dev/band.html?showcase=1 (vitrine) · &screen=select|lobby|custom|studio|calib
// &play=<songId>&inst=guitar&diff=medio (&auto=1 = autoplay perfeito) &seek=SEG
import { listGames } from '../../src/hub/registry';
import { registerBand } from '../../src/games/band/register';
import { installIconCss } from '../../src/ui/icons';

const qs = new URLSearchParams(location.search);
const app = document.getElementById('app')!;
installIconCss();
registerBand();
const def = listGames().find((g) => g.id === 'band')!;

if (qs.get('showcase')) {
  const c = document.createElement('canvas');
  c.width = 412;
  c.height = 300;
  c.id = 'show';
  app.appendChild(c);
  const x = c.getContext('2d')!;
  const t0 = performance.now();
  const loop = () => {
    def.drawShowcase!(x, c.width, c.height, (performance.now() - t0) / 1000 + Number(qs.get('t') || 0));
    requestAnimationFrame(loop);
  };
  loop();
  document.title = 'ready';
} else {
  const { BandGame } = await import('../../src/games/band/game');
  const g = new BandGame(app, () => (location.href = location.pathname));
  (window as any).bb = g;
  const scr = qs.get('screen');
  if (scr) (g.screens as any).show(scr);
  document.title = 'ready';
}
