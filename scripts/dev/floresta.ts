// Página de desenvolvimento: abre o minigame direto (sem o hub).
// /scripts/dev/floresta.html?mode=2d|3d (pula a escolha) &auto=1 (IA corta por você)
// &rich=1 (muitas bolotas) &biome=N (abre N biomas e teleporta) &x=M (posição) &shop=tab &reset=1 &showcase=1
import { listGames } from '../../src/hub/registry';
import { registerFloresta } from '../../src/games/floresta/register';
import { freshSave, loadSave, writeSave } from '../../src/games/floresta/save';

const qs = new URLSearchParams(location.search);
const app = document.getElementById('app')!;
registerFloresta();
const def = listGames().find((g) => g.id === 'floresta')!;

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
  if (qs.get('reset')) writeSave(freshSave());
  const s = loadSave();
  if (qs.get('rich')) {
    s.bolotas = Math.max(s.bolotas, Number(qs.get('rich')) > 1 ? Number(qs.get('rich')) : 5e6);
    s.planks = Math.max(s.planks, 200);
    s.plankVal = s.plankVal || 4;
  }
  if (qs.get('biome')) s.unlocked = Math.max(s.unlocked, Number(qs.get('biome')) + 1);
  if (qs.get('tool')) s.tool = Number(qs.get('tool'));
  if (qs.get('veh')) s.vehicle = Number(qs.get('veh'));
  if (qs.get('help')) s.help = { bots: Number(qs.get('help')), drones: Number(qs.get('help')), planters: Number(qs.get('help')) };
  if (qs.get('tut')) s.tutorial = Number(qs.get('tut'));
  if (qs.get('mach')) s.mach = { saw: 3, planer: 3, belt: 3, nursery: 3 };
  writeSave(s);
  const { launch } = await import('../../src/games/floresta/game');
  const mode = (qs.get('mode') as '2d' | '3d' | null) ?? undefined;
  const g = (await launch(app, () => (location.href = location.pathname), { mode, auto: !!qs.get('auto') })) as any;
  (window as any).fl = g;
  if (qs.get('x')) g.sim.me.x = Number(qs.get('x'));
  else if (qs.get('biome')) g.sim.me.x = 34 + Number(qs.get('biome')) * 110 + 8;
  if (qs.get('shop')) g.hud.openShop(qs.get('shop'));
  if (qs.get('fell')) {
    // derruba a árvore mais próxima depois de N ms (para screenshots da queda)
    setTimeout(() => {
      const s = g.sim;
      let best: any = null;
      for (const tr of s.trees) if (tr.state === 0 && (!best || Math.abs(tr.x - s.me.x) < Math.abs(best.x - s.me.x))) best = tr;
      if (best) {
        s.me.target = best.id;
        s.hitTree(best, 1e6, s.me.x, s.me.z - 1.5, 0);
      }
    }, Number(qs.get('fell')));
  }
  if (qs.get('emote')) setTimeout(() => g.onEmote(qs.get('emote')), 300);
  document.title = 'ready';
}
