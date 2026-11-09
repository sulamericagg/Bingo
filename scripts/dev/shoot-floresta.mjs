// NODE_PATH=$(npm root -g) node scripts/dev/shoot-floresta.mjs <outDir> [name@query@WxH@waitMs@selector ...]  (requer: npx vite --port 4317)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] ?? '.';
const port = process.env.PORT ?? 4317;
const jobs = process.argv.slice(3);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
for (const j of jobs) {
  const [name, q, size = '412x915', wait = '1500', sel = ''] = j.split('@');
  const [w, h] = size.split('x').map(Number);
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('PAGEERROR', name, e.message));
  page.on('console', (m) => m.type() === 'error' && console.error('CONSOLE', name, m.text()));
  await page.goto(`http://localhost:${port}/scripts/dev/floresta.html?${q}`);
  if (sel) await page.waitForSelector(sel, { timeout: 30000 });
  else await page.waitForFunction(() => document.title === 'ready', null, { timeout: 30000 });
  await page.waitForTimeout(Number(wait));
  const file = `${out}/${name}.png`;
  await page.screenshot({ path: file });
  console.log('ok', file);
  await page.close();
}
await browser.close();
