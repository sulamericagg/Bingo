// Página de desenvolvimento: abre o Mundo Bloop direto num mundo novo (sem o hub).
// /scripts/dev/mundo.html?mode=sobrevivencia|criativo|pacifico &seed= &biome=N &x= &z= &yaw= &tier=0..3
// &hub=1 (abre pelo jogo de verdade, com a lista de mundos) &showcase=1 (só a vitrine)
import { saveMode } from '../../src/core/quality';
import { listGames } from '../../src/hub/registry';
import { registerMundo } from '../../src/games/mundo/register';

const qs = new URLSearchParams(location.search);
const app = document.getElementById('app')!;
const W = window as any;
const num = (k: string, d: number) => (qs.has(k) ? Number(qs.get(k)) : d);
const tier = num('tier', 2) as 0 | 1 | 2 | 3;
saveMode(tier);
registerMundo();
const def = listGames().find((g) => g.id === 'mundo')!;

if (qs.get('showcase')) {
  const c = document.createElement('canvas');
  c.width = num('w', 412);
  c.height = num('h', 300);
  c.id = 'show';
  app.appendChild(c);
  const x = c.getContext('2d')!;
  const t0 = performance.now();
  const loop = () => {
    def.drawShowcase!(x, c.width, c.height, (performance.now() - t0) / 1000 + num('t', 0));
    requestAnimationFrame(loop);
  };
  loop();
} else if (qs.get('hub')) {
  W.handle = await def.launch(app, () => (location.href = location.pathname));
} else {
  const { createWorld } = await import('../../src/games/floresta/world/worldgame');
  const { freshWorld } = await import('../../src/games/floresta/world/wsave');
  const { WorldGen } = await import('../../src/games/floresta/world/gen');
  const sv = freshWorld(num('seed', 20261110));
  sv.solo = true;
  sv.pets = 0;
  sv.veh.owned = [];
  if (qs.get('intro') !== '1') sv.vehPlaced = true;
  let x = num('x', 0);
  let z = num('z', 30);
  if (qs.has('biome')) {
    const want = Number(qs.get('biome'));
    const gen = new WorldGen(sv.seed);
    const w = new Float32Array(16);
    let found = false;
    for (let r = 0; r < 4000 && !found; r += 48)
      for (let a = 0; a < 64 && !found; a++) {
        const px = Math.cos((a / 64) * Math.PI * 2) * r;
        const pz = Math.sin((a / 64) * Math.PI * 2) * r;
        const b = gen.weights(px, pz, w);
        if (b === want && w[b] > 0.85 && gen.height(px, pz) > 1.5) {
          x = px;
          z = pz;
          found = true;
        }
      }
  }
  sv.px = x;
  sv.pz = z;
  sv.yaw = num('yaw', 0);
  const mode = (qs.get('mode') ?? 'sobrevivencia') as 'sobrevivencia' | 'criativo' | 'pacifico';
  W.game = createWorld(app, { tier, exit: () => {}, mode, save: sv, onSave: () => {} });
}
setTimeout(() => (document.title = 'ready'), 300);
