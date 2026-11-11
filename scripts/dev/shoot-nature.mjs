// node scripts/dev/shoot-nature.mjs <outDir> [name@query@WxH@waitMs ...]   (requer: npx vite --port 4317)
// FPS=1: mede quadros por 6 s com CPU 4× mais lenta (Emulation.setCPUThrottlingRate) e imprime.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] ?? '.';
const port = process.env.PORT ?? 4317;
const fps = !!process.env.FPS;
const jobs = process.argv.slice(3);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
for (const j of jobs) {
  const [name, q, size = '800x400', wait = '2500'] = j.split('@');
  const [w, h] = size.split('x').map(Number);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR', name, e.message));
  page.on('console', (m) => m.type() === 'error' && console.error('CONSOLE', name, m.text()));
  await page.goto(`http://localhost:${port}/scripts/dev/nature.html?${q}`);
  await page.waitForFunction(() => document.title === 'ready', null, { timeout: 60000 });
  await page.waitForTimeout(Number(wait));
  if (fps) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.waitForTimeout(1500);
    const r = await page.evaluate(async () => {
      const W = window;
      const n0 = W.__fps.n;
      const t0 = performance.now();
      const info0 = W.game?.renderer?.info?.render;
      await new Promise((res) => setTimeout(res, 6000));
      const info = W.game?.renderer?.info?.render ?? W.game?.view?.renderer?.info?.render;
      return { fps: ((W.__fps.n - n0) * 1000) / (performance.now() - t0), calls: info?.calls, tris: info?.triangles, i0: !!info0 };
    });
    console.log('FPS', name, r.fps.toFixed(1), 'calls', r.calls, 'tris', r.tris);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  }
  const file = `${out}/${name}.png`;
  await page.screenshot({ path: file });
  console.log('ok', file);
  await ctx.close();
}
await browser.close();
