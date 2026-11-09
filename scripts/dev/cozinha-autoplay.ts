/* Teste headless: um dia inteiro só com bots (node). Uso:
 *   npx esbuild scripts/dev/cozinha-autoplay.ts --bundle --platform=node --outfile=/tmp/x.mjs --format=esm && node /tmp/x.mjs [dia] [bots]
 */
import { Sim, mulberry } from '../../src/games/cozinha/sim';
import { Brain } from '../../src/games/cozinha/bots';
import { emptyUps, dayParams, RECIPES, type Role } from '../../src/games/cozinha/data';

const args = typeof process !== 'undefined' ? process.argv.slice(2) : [];
const days = (args[0] ?? '1,3,6,10,20,40').split(',').map(Number);
const nb = Number(args[1] ?? 4);
const roles: Role[] = ['cook', 'cook', 'chopper', 'washer', 'server'];
let fail = 0;
for (const day of days) {
  const ups = emptyUps();
  const packs = [0, 1, 2, 3, 4, 5, 6, 7].filter((p) => p <= Math.floor(day / 2));
  const sim = new Sim({ day, seed: 1234 + day, ups, packs, crew: nb });
  const brains: Brain[] = [];
  for (let i = 0; i < nb; i++) {
    const p = sim.addPlayer(i + 1, 'bot' + i, 'bloop', true, roles[i % roles.length]);
    brains.push(new Brain(sim, p, mulberry(99 + i)));
  }
  const dt = 1 / 30;
  let steps = 0;
  while (!sim.ended && steps < 100000) {
    for (const b of brains) b.update(dt);
    sim.step(dt);
    sim.drainFx(() => {});
    steps++;
    if (process.env.DBG && steps % 300 === 0) console.log(sim.time.toFixed(0), sim.orders.map((o) => RECIPES[o.r].id).join(','), '\n  ' + brains.map((b) => b.dbg()).join('\n  '), '\n  st:', sim.st.filter((s) => s.item || s.n).map((s) => `${s.k}(${s.x},${s.y})${s.item ? ':' + s.item.k + '/' + s.item.c + '[' + s.item.parts + ']' : ''}${s.n ? 'n' + s.n : ''}`).join(' '));
  }
  const p = dayParams(day, ups);
  console.log(
    `day ${day}: ${sim.cols}x${sim.rows} menu=[${sim.menu.map((r) => RECIPES[r].id).join(',')}] served=${sim.served} missed=${sim.missed} cash=${sim.cash} goal=${p.goal.join('/')} stars=${sim.stars()} burnt=${sim.burnt} fires=${sim.fires} floor=${sim.floor.length} theme=${sim.theme} ev=${sim.special}`,
  );
  if (sim.served === 0) fail++;
}
if (fail) {
  console.log('FAIL: some day served nothing');
  if (typeof process !== 'undefined') process.exitCode = 1;
}
