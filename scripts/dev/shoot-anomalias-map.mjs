// node scripts/dev/shoot-anomalias-map.mjs <outDir> <map> [tier] job...   (requer: npx vite --port 5491)
// job = nome@comando  comandos (separados por ;):
//   room:<id>[:<view>]   cam:<id>:<i>   pose:x,y,z,yaw,pitch   slot:<id>:<kind>:<v>   off:<id>
//   state:<interactId>:<state>   power:0|1   wait:<ms>   shot   (shot tira a foto com o nome do job; "shot:sufixo")
// FPS=1 mede FPS/draw calls por 4 s com CPU 4× mais lenta em cada "shot".
import { createRequire } from 'node:module';
const { chromium } = createRequire('/opt/node-tools/node_modules/')('playwright');
const [out = '.', map = 'creche', tier = '1', ...jobs] = process.argv.slice(2);
const port = process.env.PORT ?? 5491;
const fps = !!process.env.FPS;
const W = Number(process.env.W ?? 844);
const H = Number(process.env.H ?? 390);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && console.error('CONSOLE', m.text().slice(0, 300)));
const t0 = Date.now();
await page.goto(`http://localhost:${port}/scripts/dev/anomalias-map.html?map=${map}&tier=${tier}&ui=0`);
await page.waitForFunction(() => document.title === 'ready' || document.title === 'error', null, { timeout: 120000 });
console.log('loaded', map, 'tier', tier, Date.now() - t0, 'ms', await page.title());
const cdp = fps ? await ctx.newCDPSession(page) : null;
for (const j of jobs) {
  const [name, cmds = 'shot'] = j.split('@');
  for (const c of cmds.split(';')) {
    const [op, ...a] = c.split(':');
    if (op === 'room') await page.evaluate(([id, v]) => window.__v.goRoom(id, Number(v ?? 0)), a);
    else if (op === 'cam') await page.evaluate(([id, i]) => window.__v.goCam(id, Number(i)), a);
    else if (op === 'pose') await page.evaluate((p) => window.__v.setPose(...p.split(',').map(Number)), a[0]);
    else if (op === 'aim') await page.evaluate(([id, d, sd]) => window.__v.aimSlot(id, Number(d ?? 2.6), Number(sd ?? 0)), a);
    else if (op === 'aimi') await page.evaluate(([id, d, sd]) => window.__v.aimInteract(id, Number(d ?? 2.2), Number(sd ?? 0)), a);
    else if (op === 'pair') {
      // pair:<slot>:<kind>:<v>[:dist[:side]] = mira, foto antes, liga, foto depois, desliga
      const [id, k, v, d, sd] = a;
      await page.evaluate(([id, d, sd]) => window.__v.aimSlot(id, Number(d ?? 2.6), Number(sd ?? 0)), [id, d, sd]);
      for (const on of [false, true]) {
        if (on) await page.evaluate(([id, k, v]) => window.__v.setSlot(id, k, Number(v ?? 0), true), [id, k, v]);
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${out}/${map}-${name}-${on ? 1 : 0}.png` });
      }
      await page.evaluate(([id]) => window.__v.setSlot(id, 'move', 0, false), [id]);
      console.log('pair', name);
    }
    else if (op === 'slot') await page.evaluate(([id, k, v]) => window.__v.setSlot(id, k, Number(v ?? 0), true), a);
    else if (op === 'off') await page.evaluate(([id]) => window.__v.setSlot(id, 'move', 0, false), a);
    else if (op === 'state') await page.evaluate(([id, s]) => window.__v.setState(id, s), a);
    else if (op === 'power') await page.evaluate((v) => window.__v.power(v === '1'), a[0]);
    else if (op === 'wait') await page.waitForTimeout(Number(a[0]));
    else if (op === 'shot') {
      await page.waitForTimeout(350);
      const file = `${out}/${map}-${name}${a[0] ? '-' + a[0] : ''}.png`;
      await page.screenshot({ path: file });
      let extra = '';
      if (cdp) {
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        await page.waitForTimeout(800);
        const r = await page.evaluate(async () => {
          const n0 = window.__fps.n;
          const t = performance.now();
          await new Promise((res) => setTimeout(res, 4000));
          return { fps: ((window.__fps.n - n0) * 1000) / (performance.now() - t), ...window.__v.info() };
        });
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        extra = ` fps ${r.fps.toFixed(1)} calls ${r.calls} tris ${r.tris}`;
      } else {
        const r = await page.evaluate(() => window.__v.info());
        extra = ` calls ${r.calls} tris ${r.tris}`;
      }
      console.log('shot', file + extra);
    }
  }
}
await browser.close();
