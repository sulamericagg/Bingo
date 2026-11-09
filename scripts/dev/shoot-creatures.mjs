// NODE_PATH=$(npm root -g) node scripts/dev/shoot-creatures.mjs <outDir> [query...]  (requer: npx vite --port 4303)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] ?? '.';
const qs = process.argv.slice(3);
if (!qs.length) qs.push('sheet=0', 'sheet=1', 'sheet=2', 'sheet=3', 'sheet=4', 'legend=0', 'legend=1');
const browser = await chromium.launch();
for (const q of qs) {
  const page = await browser.newPage({ viewport: { width: 940, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('PAGEERROR', q, e.message));
  await page.goto(`http://localhost:4303/scripts/dev/creatures.html?${q}`);
  await page.waitForFunction(() => document.title === 'ready', null, { timeout: 30000 });
  await page.waitForTimeout(500);
  const file = `${out}/${q.replace(/[^a-z0-9]+/gi, '_')}.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log('ok', file);
  await page.close();
}
await browser.close();
