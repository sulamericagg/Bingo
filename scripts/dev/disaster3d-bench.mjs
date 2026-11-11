// Banco de sobrevivência do 3D sobre o catálogo: rodadas inteiras sem desenhar; você parado + 5 bots (habilidade 0,6).
// Uso: NODE_PATH=$(npm root -g) node scripts/dev/disaster3d-bench.mjs [chaves,separadas] [rodadas por mapa]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ONLY = process.argv[2] || '';
const ROUNDS = Number(process.argv[3] || 2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
await ctx.addInitScript(() => {
  localStorage.setItem('bo-disaster3d', JSON.stringify({ next: 1, best: 0, played: 99 }));
  localStorage.setItem('bo-quality', '0');
  localStorage.setItem('bo-dz-pedia', JSON.stringify({ seen: {}, deck: [], recent: [], rounds: 30 }));
});
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://localhost:5291/scripts/dev/disaster.html?showcase=1');
await p.waitForFunction(() => document.title === 'ready');
const res = await p.evaluate(async ({ ONLY, ROUNDS }) => {
  const C = await import('/src/games/disaster/catalog.ts');
  const M = await import('/src/games/disaster/d3/game3d.ts');
  const root = document.createElement('div');
  root.style.cssText = 'position:fixed;inset:0';
  document.body.appendChild(root);
  const g = new M.Disaster3D(root, () => {});
  g.paused = true;
  g.bench = true;
  const all = C.entries();
  const list = ONLY ? all.filter((e) => ONLY.split(',').includes(e.key)) : all.filter((e) => e.hz.length === 1 && !e.mods.length && e.hz[0] !== 'meteoro');
  const out = {};
  for (const e of list) {
    let a = 0, n = 0, still = 0, sn = 0;
    const why = {};
    const maps = (e.maps ?? C.HAZARDS[e.hz[0]].maps).slice(0, 2);
    for (const mapId of maps)
      for (let k = 0; k < ROUNDS; k++) {
        g.forced = C.buildScenario(e, 2000 + mapId.length * 131 + k * 977 + e.n * 17, 1, mapId);
        g.progress.played = 99;
        g.streak = 0;
        g.startRound();
        for (const pl of g.players) if (pl.bot) { pl.bot.skill = 0.6; pl.bot.lazy = 0.4; }
        let guard = 0;
        while (g.phase !== 'end' && guard++ < 60 * 160) g.update(1 / 60);
        for (const pl of g.players) {
          if (pl.self) { sn++; still += pl.alive ? 1 : 0; } else { n++; a += pl.alive ? 1 : 0; }
        }
      }
    out[e.key] = { still: Math.round((100 * still) / sn), avg: Math.round((100 * a) / n) };
  }
  return out;
}, { ONLY, ROUNDS });
for (const [d, r] of Object.entries(res)) console.log(d.padEnd(12), 'parado', String(r.still).padStart(4) + '%', ' bot-médio', String(r.avg).padStart(4) + '%' + (r.avg < 40 ? ' <' : r.avg > 70 ? ' >' : ''));
await browser.close();
