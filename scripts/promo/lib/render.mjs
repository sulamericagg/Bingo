// Renderização das artes (scripts/promo/promo.html) via Playwright.
import { readFileSync, writeFileSync } from 'node:fs';

export async function openPromo(browser, base) {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('  [promo.html]', e.message));
  await page.goto(`${base}/scripts/promo/promo.html`);
  await page.waitForFunction(() => document.title === 'ready' && !!window.__promo, null, { timeout: 30000 });
  return page;
}

export const fileToDataUrl = (f) => `data:image/${f.endsWith('.png') ? 'png' : 'jpeg'};base64,${readFileSync(f).toString('base64')}`;

/** Renderiza `spec` e devolve um Buffer (PNG ou JPEG). shots: { nome: caminho } */
export async function renderBuf(page, spec, shots = {}) {
  const s = { ...spec, shots: Object.fromEntries(Object.entries(shots).filter(([, v]) => v).map(([k, v]) => [k, fileToDataUrl(v)])) };
  const url = await page.evaluate((sp) => window.__promo.render(sp), s);
  return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
}

export async function renderTo(page, spec, file, shots) {
  writeFileSync(file, await renderBuf(page, spec, shots));
  return file;
}
