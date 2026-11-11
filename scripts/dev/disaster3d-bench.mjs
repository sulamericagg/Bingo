// Banco de sobrevivência do 3D: rodadas inteiras sem desenhar; você parado + bots (habilidade 0,6 = criança média).
// Uso: NODE_PATH=$(npm root -g) node scripts/dev/disaster3d-bench.mjs [--port 5287] [--rounds 3] [--mod /src/games/disaster/d3/game3d.ts]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const arg = (k, d) => {
  const i = process.argv.indexOf('--' + k);
  return i > 0 ? process.argv[i + 1] : d;
};
const PORT = Number(arg('port', 5287));
const ROUNDS = Number(arg('rounds', 3));
const MOD = arg('mod', '/src/games/disaster/d3/game3d.ts');
const ONLY = arg('only', '');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
await ctx.addInitScript(() => {
  localStorage.setItem('bo-disaster3d', JSON.stringify({ next: 1, best: 0, played: 99 }));
  localStorage.setItem('bo-quality-detect', JSON.stringify({ v: 'x', tier: 0, score: 0, cap: 3 }));
});
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(`http://localhost:${PORT}/scripts/dev/disaster.html?showcase=1`);
await p.waitForFunction(() => document.title === 'ready');
const res = await p.evaluate(
  async ({ ROUNDS, MOD, ONLY }) => {
    const S = await import('/src/games/disaster/scenarios.ts');
    const M = await import(MOD);
    const C = M.Disaster3D;
    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;inset:0';
    document.body.appendChild(root);
    const g = new C(root, () => {});
    g.paused = true;
    const L = S.scenarios();
    const all = ['tsunami', 'vulcao', 'terremoto', 'tornado', 'meteoros', 'enchente', 'avalanche', 'raios', 'acido', 'sumidouro', 'areia'];
    const out = {};
    for (const d of ONLY ? ONLY.split(',') : all) {
      let a = 0, n = 0, still = 0, sn = 0;
      for (const mi of [0, 1, 2, 5])
        for (let k = 0; k < ROUNDS; k++) {
          L[0] = { n: 1, seed: 2000 + mi * 131 + k * 977 + d.length * 17, map: S.MAPS[mi], disasters: [d], mod: 'none', difficulty: 1 };
          g.progress.next = 1;
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
      out[d] = { still: Math.round((100 * still) / sn), avg: Math.round((100 * a) / n) };
    }
    return out;
  },
  { ROUNDS, MOD, ONLY },
);
console.log('3D', MOD.split('/').pop(), 'rounds/map=' + ROUNDS);
for (const [d, r] of Object.entries(res)) console.log(d.padEnd(12), 'parado', String(r.still).padStart(4) + '%', ' bot-médio', String(r.avg).padStart(4) + '%');
await browser.close();
