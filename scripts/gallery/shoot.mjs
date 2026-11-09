// Screenshots da galeria: NODE_PATH=$(npm root -g) node scripts/gallery/shoot.mjs <outDir> [query...]
// Requer o dev server: npx vite --port 4302
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] ?? '.';
const queries = process.argv.slice(3);
if (!queries.length) queries.push('sec=skins', 'sec=small', 'sec=shop', 'sec=trails');
const browser = await chromium.launch();
for (const qs of queries) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('PAGEERROR', qs, e.message));
  page.on('console', (m) => m.type() === 'error' && console.error('CONSOLE', qs, m.text()));
  await page.goto(`http://localhost:4302/scripts/gallery/gallery.html?${qs}`);
  await page.waitForFunction(() => document.title === 'ready', null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  const file = `${out}/${qs.replace(/[^a-z0-9]+/gi, '_')}.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log('✓', file);
  await page.close();
}
await browser.close();
