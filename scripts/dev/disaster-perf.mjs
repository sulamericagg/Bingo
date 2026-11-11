// FPS do "Sobreviva aos Desastres" com a CPU 4× mais lenta (CDP Emulation.setCPUThrottlingRate), 2D e 3D,
// por nível de qualidade, no meio de desastres pesados. Chromium headless usa SwiftShader (GPU em software):
// o 3D aqui é um teto pessimista — num tablet com GPU de verdade o custo de desenho é bem menor.
// Uso: NODE_PATH=$(npm root -g) node scripts/dev/disaster-perf.mjs [--port 5291] [--secs 6] [--tiers 0,2] [--only tornado,vulcao]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const arg = (k, d) => {
  const i = process.argv.indexOf('--' + k);
  return i > 0 ? process.argv[i + 1] : d;
};
const PORT = Number(arg('port', 5291));
const SECS = Number(arg('secs', 6));
const TIERS = arg('tiers', '0,2').split(',').map(Number);
const LIST = arg('only', 'tornado@fazenda,tsunami@praia,incendio@floresta,c_vulcao_meteoros@ilha').split(',');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const out = [];
for (const mode of ['2d', '3d']) {
  for (const tier of TIERS) {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
    await ctx.addInitScript((tier) => {
      localStorage.setItem('bo-quality', String(tier));
      localStorage.setItem('bo-dz-pedia', JSON.stringify({ seen: {}, deck: [], recent: [], rounds: 30 }));
    }, tier);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('pageerror', e.message));
    const cdp = await ctx.newCDPSession(p);
    await p.goto(`http://localhost:${PORT}/scripts/dev/disaster.html?${mode === '3d' ? 'd3=1' : 's=1'}`);
    await p.waitForFunction(() => document.title === 'ready', null, { timeout: 60000 });
    for (const it of LIST) {
      const [key, map] = it.split('@');
      await p.evaluate(
        async ({ key, map, mode }) => {
          const C = await import('/src/games/disaster/catalog.ts');
          const g = mode === '3d' ? window.dz3 : window.dz;
          if (mode === '3d') g.paused = true;
          else g.pause();
          g.forced = C.buildScenario(C.entryByKey(key), 777, 2, map);
          if (mode === '2d') g.autoMe = true;
          g.startRound();
          let guard = 0;
          while (!(g.phase === 'disaster' && g.phaseT > 12) && guard++ < 60 * 90) {
            if (mode === '3d') g.me.alive = true;
            g.update(1 / 60);
          }
          if (mode === '3d') {
            g.paused = false;
            g.storm = 1;
          } else g.resume();
        },
        { key, map, mode },
      );
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const r = await p.evaluate(
        (secs) =>
          new Promise((res) => {
            const ts = [];
            const t0 = performance.now();
            const f = (t) => {
              ts.push(t);
              if (t - t0 < secs * 1000) requestAnimationFrame(f);
              else {
                const d = ts.slice(1).map((v, i) => v - ts[i]).sort((a, b) => a - b);
                res({ fps: Math.round((1000 * d.length) / (ts[ts.length - 1] - ts[0])), p50: Math.round(d[d.length >> 1]), p95: Math.round(d[Math.floor(d.length * 0.95)]) });
              }
            };
            requestAnimationFrame(f);
          }),
        SECS,
      );
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      const tierNow = await p.evaluate((mode) => (mode === '3d' ? window.dz3.tier : window.dz.tier), mode);
      out.push({ mode, tier, tierNow, key, ...r });
      console.log(mode, 'nível', tier, '→', tierNow, key.padEnd(20), `${r.fps} fps  p50 ${r.p50} ms  p95 ${r.p95} ms`);
    }
    await ctx.close();
  }
}
await browser.close();
