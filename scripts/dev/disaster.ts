// Página de desenvolvimento: abre o minigame direto (sem o hub).
// /scripts/dev/disaster.html?s=12 (cenário) &showcase=1 (só a vitrine)
// &auto=1 (o seu Bloop vira bot, para screenshots) &skip=prepare|disaster|impact&t=SEG (pula o tempo)
import { listGames } from '../../src/hub/registry';
import { registerDisaster } from '../../src/games/disaster/register';

const qs = new URLSearchParams(location.search);
const app = document.getElementById('app')!;
registerDisaster();
const def = listGames().find((g) => g.id === 'disaster')!;

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
  const { DisasterGame } = await import('../../src/games/disaster/game');
  const g = new DisasterGame(app, () => (location.href = location.pathname), { scenario: Number(qs.get('s')) || undefined });
  (window as any).dz = g;
  if (qs.get('auto')) (g as any).autoMe = true;
  document.title = 'ready';
}
