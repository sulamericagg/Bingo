// Screenshots do Garimpo (clima/dia-noite, necessidades, diesel, eventos, estrada).
//   PORT=5291 node scripts/dev/shoot-haul.mjs <outDir> [cena ...]    (requer vite rodando)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] ?? 'shots-haul';
const port = process.env.PORT ?? 4471;
const only = process.argv.slice(3);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
page.on('console', (m) => m.type() === 'error' && console.error('CONSOLE', m.text()));
const W = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
async function newGame(diff = 2) {
  await page.goto(`http://localhost:${port}/scripts/dev/garimpo.html?debug`);
  await W(800);
  await ev(() => localStorage.clear());
  await page.reload();
  await W(1200);
  await page.click('[data-new="0"]');
  await W(300);
  await page.click(`[data-d="${diff}"]`);
  await page.click('[data-start]');
  await W(4500);
  // fecha avisos
  await ev(() => { const g = window.__garimpo; g.sv.money = 60000; g.sv.stock = 2400; });
}
const shot = async (n) => {
  await page.screenshot({ path: `${out}/${n}.png` });
  console.log('ok', n);
};
/** câmera fixa olhando para (dx, dz) a partir do garimpeiro, um pouco para cima */
const look = (dx, dz, up = 0.18, h = 7) =>
  ev(([dx, dz, up, h]) => {
    const g = window.__garimpo;
    const p = g.worker.group.position;
    g.camOverride = [p.x - dx * 6, p.y + h, p.z - dz * 6, p.x + dx * 60, p.y + h + up * 60, p.z + dz * 60];
  }, [dx, dz, up, h]);
const free = () => ev(() => (window.__garimpo.camOverride = null));
const scenes = {
  async sunrise() {
    await ev(() => { const g = window.__garimpo; g.rp.debug.hour(6.3); g.rp.debug.sky('clear'); });
    await look(0.88, 0.47, 0.05);
    await W(1500);
    await shot('01-sunrise');
  },
  async noon() {
    await ev(() => { const g = window.__garimpo; g.rp.debug.hour(12); g.rp.debug.sky('clear'); });
    await look(-0.3, 0.95, 0.08);
    await W(1500);
    await shot('02-noon');
  },
  async sunset() {
    await ev(() => { const g = window.__garimpo; g.rp.debug.hour(17.8); g.rp.debug.sky('clear'); });
    await look(-0.88, 0.47, 0.1, 15);
    await W(1500);
    await shot('03-sunset');
    await free();
  },
  async night() {
    await ev(() => {
      const g = window.__garimpo;
      const m = g.debug.give('pickup');
      g.debug.enter(m);
      g.rp.debug.hour(22);
      g.rp.debug.sky('clear');
    });
    await W(600);
    await ev(() => { const g = window.__garimpo; g.hud.ctl; });
    await W(1500);
    await shot('04-night-headlights');
  },
  async storm() {
    await ev(() => { const g = window.__garimpo; g.rp.debug.hour(15); g.rp.debug.sky('storm'); g.rainOn = true; });
    await W(4000);
    await look(0.5, 0.86, 0.12, 8);
    await ev(() => window.__garimpo.rp.debug.bolt(3));
    await W(300);
    await shot('05-storm-lightning');
    await free();
  },
};
await newGame(2);
for (const [k, f] of Object.entries(scenes)) if (!only.length || only.includes(k)) await f();
await browser.close();
