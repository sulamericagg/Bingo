// Renderiza ícone/splash/feature graphic com Playwright + Vite (sem arquivos de imagem no repo fonte).
import { createServer } from 'vite';
import { createRequire } from 'node:module';
// Requer Playwright: npm i -D playwright && npx playwright install chromium
const { chromium } = createRequire(import.meta.url)('playwright');
import { mkdirSync } from 'node:fs';

const jobs = [
  ['icon', 1024, 1024, 'assets/icon-only.png'],
  ['icon-fg', 1024, 1024, 'assets/icon-foreground.png'],
  ['icon-bg', 1024, 1024, 'assets/icon-background.png'],
  ['splash', 2732, 2732, 'assets/splash.png'],
  ['splash', 2732, 2732, 'assets/splash-dark.png'],
  ['icon', 512, 512, 'public/icon.png'],
  ['icon', 512, 512, 'store/icon-512.png'],
  ['feature', 1024, 500, 'store/feature-graphic.png'],
  ['feature', 1200, 630, 'public/og.png'],
];
mkdirSync('assets', { recursive: true });
mkdirSync('store', { recursive: true });
const server = await createServer({ server: { port: 5199 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
for (const [kind, w, h, out] of jobs) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(`http://localhost:5199/scripts/brand/brand.html?kind=${kind}&w=${w}&h=${h}`);
  await page.waitForFunction(() => document.title === 'ready', null, { timeout: 30000 });
  await page.locator('#c').screenshot({ path: out, omitBackground: kind === 'icon-fg' });
  await page.close();
  console.log('✓', out);
}
await browser.close();
await server.close();
