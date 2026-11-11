// Screenshots/medições dos mapas do Anomalias (Lanchonete, Posto 24h).
//   npx vite --port 4321  &&  node scripts/dev/shoot-anomap2.mjs <outDir> <map> <tier> [jobs...]
// jobs:  view:<nome>            → <map>-<nome>.png   (nome = sala, vista extra, spawn ou cam:<sala>:<i>)
//        pair:<slot>:<kind>:<v>:<vista>  → par antes/depois
//        fps:<vista>            → FPS (CPU 4× mais lenta) + chamadas de desenho
//        rooms | cams | fpsall  → todas as salas / câmeras / FPS de todas as salas
// Env: W=844 H=390 PORT=4321
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const [out = '.', map = 'fastfood', tier = '1', ...jobs] = process.argv.slice(2);
const W = Number(process.env.W ?? 844);
const H = Number(process.env.H ?? 390);
const port = process.env.PORT ?? 4321;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && console.error('CONSOLE', m.text().slice(0, 300)));
await page.goto(`http://localhost:${port}/scripts/dev/anomalias-map2.html?map=${map}&tier=${tier}&panel=0`);
await page.waitForFunction(() => document.title === 'ready', null, { timeout: 120000 });
await page.evaluate(() => (document.getElementById('toggle').style.display = 'none'));
const info = await page.evaluate(() => {
  const a = window.__am;
  return { ms: a.buildMs, rooms: a.build.rooms.map((r) => [r.id, r.cams.length]), slots: a.build.slots.length, counts: a.counts, views: Object.keys(a.build.root.userData.views ?? {}), tasks: a.build.interacts.map((i) => i.kind), npcs: a.build.npcSpots.length, cols: a.build.colliders.length };
});
console.log('INFO', JSON.stringify(info));
const shot = async (name, wait = 500) => {
  await page.waitForTimeout(wait);
  const f = `${out}/${map}-t${tier}-${name}.png`;
  await page.screenshot({ path: f });
  const i = await page.evaluate(() => {
    const r = window.__am.renderer.info.render;
    return [r.calls, r.triangles];
  });
  console.log('ok', f, 'calls', i[0], 'tris', i[1]);
};
const view = (v) => page.evaluate((vv) => window.__am.view(vv), v);
let cdp = null;
const fps = async (v) => {
  await view(v);
  if (!cdp) cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.waitForTimeout(1200);
  const r = await page.evaluate(async () => {
    const a = window.__am;
    const n0 = a.fps.n;
    const t0 = performance.now();
    await new Promise((res) => setTimeout(res, 4000));
    const i = a.renderer.info.render;
    return { fps: ((a.fps.n - n0) * 1000) / (performance.now() - t0), calls: i.calls, tris: i.triangles };
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  console.log('FPS', map, 't' + tier, v, r.fps.toFixed(1), 'calls', r.calls, 'tris', r.tris);
};
for (const j of jobs) {
  if (j === 'rooms') {
    for (const v of info.views) {
      await view(v);
      await shot(v);
    }
  } else if (j === 'cams') {
    for (const [r, n] of info.rooms)
      for (let i = 0; i < n; i++) {
        await view(`cam:${r}:${i}`);
        await shot(`cam-${r}-${i}`);
      }
  } else if (j === 'fpsall') {
    for (const v of info.views) await fps(v);
  } else if (j.startsWith('view:')) {
    const v = j.slice(5);
    await view(v);
    await shot(v.replace(/:/g, '-'));
  } else if (j.startsWith('fps:')) {
    await fps(j.slice(4));
  } else if (j.startsWith('pair:')) {
    const [, slot, kind, v, vw] = j.split(':');
    await view(vw);
    await page.evaluate(() => window.__am.clear());
    await shot(`pair-${slot}-${kind}${v}-a`);
    const ok = await page.evaluate(([s, k, vv]) => window.__am.apply(s, k, true, Number(vv)), [slot, kind, v]);
    if (!ok) console.error('slot?', slot);
    await shot(`pair-${slot}-${kind}${v}-b`, 700);
    await page.evaluate(() => window.__am.clear());
  } else if (j.startsWith('power0')) {
    await page.evaluate(() => window.__am.setPower(false));
  } else if (j.startsWith('power1')) {
    await page.evaluate(() => window.__am.setPower(true));
  }
}
await browser.close();
