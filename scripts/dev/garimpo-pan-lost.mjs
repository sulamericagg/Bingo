// Garimpo — beneficiamento: capturas jogando com toque (CDP). Requer: npx vite --port 5293 (ou PORT). Saída: shots-pan/
import { createRequire } from 'node:module';
const { chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright');
const OUT = '/home/user/wt-pan/shots-pan';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true });
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
await page.addInitScript(() => { let x = 4242; Math.random = () => ((x = (x * 16807) % 2147483647) / 2147483647); });
await page.goto(`http://localhost:${process.env.PORT ?? 5293}/scripts/dev/garimpo.html?debug`);
await page.waitForSelector('[data-new="0"]');
await page.click('[data-new="0"]'); await page.click(`[data-d="2"]`); await page.click('[data-start]');
await page.waitForFunction(() => window.__garimpo?.proc, null, { timeout: 60000 });
await page.waitForTimeout(1200);
const cdp = await page.context().newCDPSession(page);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
const ev = (fn, a) => page.evaluate(fn, a);
const sleep = (ms) => page.waitForTimeout(ms);
await ev(() => { const g = window.__garimpo; g.proc.forceWater = true; g.worker.cargo.vol = 0.12; g.worker.cargo.gold = 5; });
await sleep(600);
await ev(() => window.__garimpo.proc.debug.pan());
await sleep(600);
await page.tap('.gbp-skip');
await sleep(400);
const [cx, cy, R] = await ev(() => window.__garimpo.proc.debug.game().layoutInfo());
await page.touchscreen.tap(cx, cy);
await sleep(1500);
// lavar sem girar, inclinando demais
const info = () => ev(() => window.__garimpo.proc.debug.game().info());
console.log(await info());
await touch('touchStart', cx + R * 0.6, cy);
for (let i = 0; i < 20; i++) { await touch('touchMove', cx + Math.cos(i * 0.3) * R * 0.6, cy + Math.sin(i * 0.3) * R * 0.6); await sleep(16); }
await touch('touchEnd');
await page.waitForFunction(() => window.__garimpo.proc.debug.game().info().ph === 4, null, { timeout: 15000 }).catch(() => {});
console.log(await info());
await touch('touchStart', cx - R * 0.5, cy + R * 0.2);
for (let i = 0; i < 70; i++) { await touch('touchMove', cx - R * 0.5 + Math.min(1, i / 8) * 1.3 * R * 0.9 * 1.05, cy + R * 0.2); await sleep(16); if (i === 30) await page.screenshot({ path: `${OUT}/17-pan-lost-gold.png` }); }
await touch('touchEnd');
console.log(await info());
await browser.close();
