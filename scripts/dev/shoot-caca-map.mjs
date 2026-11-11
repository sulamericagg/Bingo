/**
 * Fotos do mapa real do Caça Bloop (OSM via proxy do Worker) — 390×844, dsf 1.
 *   npx wrangler dev --local --port 8787 &
 *   BLOOP_API=http://127.0.0.1:8787 npx vite --port 5207 &
 *   node scripts/dev/shoot-caca-map.mjs [http://127.0.0.1:5207] [pasta] [job...]
 * job: nome@lat,lon[@cmd;cmd...]  cmds: zoom:N rot:G wait:MS joy:x,y,s mode:real|controle stop arena hour:H
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire('/opt/node-tools/node_modules/')('playwright');
const [base = 'http://127.0.0.1:5207', out = 'shots-caca', ...jobs] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const waitFor = async (p, fn, ms = 30000, arg) => {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if (await p.evaluate(fn, arg).catch(() => false)) return true;
    await p.waitForTimeout(200);
  }
  return false;
};
for (const job of jobs) {
  const [name, ll, cmds = ''] = job.split('@');
  const [lat, lon] = ll.split(',').map(Number);
  const deny = cmds.includes('deny');
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true,
    geolocation: { latitude: lat, longitude: lon, accuracy: 8 }, permissions: deny ? [] : ['geolocation'],
    locale: 'pt-BR', timezoneId: 'America/Sao_Paulo',
  });
  const tier = /tier:(\d)/.exec(cmds)?.[1] ?? '2';
  await ctx.addInitScript((tier) => {
    localStorage.setItem('bo-quality', tier);
    addEventListener('DOMContentLoaded', () => {
      const st = document.createElement('style');
      st.textContent = '.ads-dbg{display:none!important}';
      document.head.appendChild(st);
    });
  }, tier);
  const hour = /hour:(\d+)/.exec(cmds)?.[1];
  const walk = /mode:(\w+)/.exec(cmds)?.[1] ?? 'real';
  await ctx.addInitScript(([walk, hour]) => {
    const s = JSON.parse(localStorage.getItem('bw-caca') || '{}');
    Object.assign(s, { safetyOk: true, locMode: 'gps', starter: true, walkMode: walk, nightTip: hour ? 0 : 99999, anchor: null, joyPos: null });
    localStorage.setItem('bw-caca', JSON.stringify(s));
    if (hour) {
      const H = Number(hour);
      const RD = Date;
      const off = (() => { const d = new RD(); const want = new RD(d); want.setHours(H, 20, 0, 0); return want.getTime() - d.getTime(); })();
      // eslint-disable-next-line no-global-assign
      Date = class extends RD { constructor(...a) { super(...(a.length ? a : [RD.now() + off])); } static now() { return RD.now() + off; } };
    }
  }, [walk, hour]);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.error('PAGEERROR', e.message));
  p.on('console', (m) => m.type() === 'error' && console.error('CONSOLE', m.text().slice(0, 200)));
  await p.goto(`${base}/?debug&nointro&skipob`);
  await waitFor(p, () => !!window.__bloop);
  await p.evaluate(() => {
    document.querySelectorAll('.modal-screen.on').forEach((e) => e.classList.remove('on'));
    window.__bloop.launchGame(window.__bloop.listGames().find((g) => g.id === 'caca'));
  });
  await waitFor(p, () => !!window.__caca);
  if (deny) await waitFor(p, () => !!document.querySelector('.cc-deny'), 20000);
  else {
    const ok = await waitFor(p, () => window.__caca.mapReady() && window.__caca.fix(), 40000);
    if (!ok) console.error('map not ready', name);
  }
  await p.waitForTimeout(1500);
  for (const c of cmds.split(';').filter(Boolean)) {
    const [op, arg = ''] = c.split(':');
    if (op === 'zoom') await p.evaluate((z) => window.__caca.cam(Number(z)), arg);
    else if (op === 'rot') await p.evaluate((r) => window.__caca.cam(undefined, Number(r)), arg);
    else if (op === 'wait') await p.waitForTimeout(Number(arg));
    else if (op === 'joy') {
      const [x, y, s] = arg.split(',').map(Number);
      await p.evaluate(([x, y, s]) => window.__caca.joy(x, y, s), [x, y, s]);
      await p.waitForTimeout(s * 1000 + 300);
    } else if (op === 'stick') {
      // dedo no joystick (mostra o controle na foto)
      const [dx, dy] = arg.split(',').map(Number);
      const z = await p.locator('.cc-joyzone').boundingBox();
      const x0 = z.x + z.width * 0.4, y0 = z.y + z.height * 0.6;
      await p.mouse.move(x0, y0);
      await p.mouse.down();
      await p.mouse.move(x0 + dx, y0 + dy, { steps: 4 });
      await p.waitForTimeout(1600);
      await p.screenshot({ path: `${out}/${name}.png` });
      await p.mouse.up();
    } else if (op === 'stop' || op === 'arena') {
      const id = await p.evaluate((ar) => {
        const l = window.__caca.stops().filter((s) => s.arena === (ar === 'arena')).sort((a, b) => a.dist - b.dist);
        return l[0]?.id;
      }, op);
      if (id) await p.evaluate((id) => window.__caca.openStop(id), id);
      await p.waitForTimeout(500);
    } else if (op === 'denyjoy') {
      await p.locator('.cc-deny .cc-btn').first().click();
      await p.waitForTimeout(2500);
    } else if (op === 'fps') {
      const r = await p.evaluate(async () => {
        let n = 0;
        const t0 = performance.now();
        await new Promise((res) => { const f = () => (++n, performance.now() - t0 < 3000 ? requestAnimationFrame(f) : res()); requestAnimationFrame(f); });
        return n / 3;
      });
      console.log('FPS', name, r.toFixed(1));
    } else if (op === 'close') {
      await p.locator('.cc-tipcard .cc-btn.sec').first().click();
      await p.waitForTimeout(400);
    } else if (op === 'walkbtn') {
      await p.locator('.cc-walk').click();
      await p.waitForTimeout(500);
    } else if (op === 'stats') {
      const r = await p.evaluate(() => {
        const l = window.__caca.spawnsFull();
        const by = (k) => l.reduce((o, s) => ((o[s[k]] = (o[s[k]] || 0) + 1), o), {});
        return { n: l.length, biome: by('biome'), element: by('element'), nests: [...new Set(l.filter((s) => s.nest).map((s) => s.nest + ' ' + s.nestFam.shape + '-' + s.nestFam.element))] };
      });
      console.log('STATS', name, JSON.stringify(r));
    } else if (op === 'info') {
      console.log(name, JSON.stringify(await p.evaluate(() => ({ cam: window.__caca.cam(), stops: window.__caca.stops().slice(0, 6), spawns: window.__caca.spawnsFull(), gps: window.__caca.gps() }))).slice(0, 3000));
    }
  }
  if (!cmds.includes('stick')) await p.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
  await ctx.close();
}
await browser.close();
