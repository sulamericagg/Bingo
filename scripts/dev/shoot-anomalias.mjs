// Screenshots/teste do Anomalias & Cia (noite inteira com toque emulado).
//   PORT=5317 node scripts/dev/shoot-anomalias.mjs <outDir> [cena ...]   (requer vite rodando)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] ?? 'shots-ano';
const port = process.env.PORT ?? 5317;
const only = process.argv.slice(3);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: false });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => (errs.push(e.message), console.error('PAGEERROR', e.message)));
page.on('console', (m) => m.type() === 'error' && console.error('CONSOLE', m.text()));
const W = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const shot = async (n) => {
  await page.screenshot({ path: `${out}/${n}.png` });
  console.log('ok', n);
};
export { page, ev, W, shot, browser, errs, out, only };
