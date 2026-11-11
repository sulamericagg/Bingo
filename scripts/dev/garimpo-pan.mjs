// Garimpo — beneficiamento: capturas jogando com toque (CDP). Requer: npx vite --port 5293 (ou PORT). Saída: shots-pan/
// joga a peneira + bateia de ponta a ponta com toque (CDP) e tira fotos
import { createRequire } from 'node:module';
const { chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright');
const OUT = '/home/user/wt-pan/shots-pan';
const DIFF = Number(process.env.DIFF ?? 1);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true });
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()));
await page.addInitScript(() => { let x = 12345; Math.random = () => ((x = (x * 16807) % 2147483647) / 2147483647); });
await page.goto(`http://localhost:${process.env.PORT ?? 5293}/scripts/dev/garimpo.html?debug`);
await page.waitForSelector('[data-new="0"]');
await page.click('[data-new="0"]');
await page.click(`[data-d="${DIFF}"]`);
await page.click('[data-start]');
await page.waitForFunction(() => window.__garimpo?.proc, null, { timeout: 60000 });
await page.waitForTimeout(1500);
const cdp = await page.context().newCDPSession(page);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
const ev = (fn, a) => page.evaluate(fn, a);
const info = () => ev(() => window.__garimpo.proc.debug.game()?.info());
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const sleep = (ms) => page.waitForTimeout(ms);
// carrinho cheio na beira d'água (lago)
await ev(() => {
  const g = window.__garimpo;
  const L = g.w.map.lake;
  // anda até a beira do lago, olhando para a água
  let best = null;
  for (let a = 0; a < Math.PI * 2; a += 0.1) {
    for (let r = L.r + 8; r > L.r - 6; r -= 0.5) {
      const x = L.x + Math.cos(a) * r, z = L.z + Math.sin(a) * r;
      if (g.w.waterY(x, z) < g.w.T.heightAt(x, z) + 0.05) continue;
      const x2 = L.x + Math.cos(a) * (r + 2.5), z2 = L.z + Math.sin(a) * (r + 2.5);
      best = [x2, z2, Math.atan2(x - x2, z - z2)];
      break;
    }
    if (best) break;
  }
  g.debug.tp(best[0], best[1], best[2]);
  g.worker.cargo.vol = 0.12;
  g.worker.cargo.gold = 6.5; g.proc.forceNug = true;
});
await sleep(1500);
await shot('01-world-pan-button');
await page.tap('.gbp-bar [data-p="pan"]');
await sleep(700);
const L = await ev(() => window.__garimpo.proc.debug.game().layoutInfo());
const [cx, cy, R] = L;
console.log('layout', L, await info());
await shot('02-sieve-start');
// sacudir a peneira
await touch('touchStart', cx, cy + R * 0.3);
for (let i = 0; i < 70; i++) { await touch('touchMove', cx + Math.sin(i * 0.9) * R * 0.25, cy + R * 0.3 + Math.cos(i * 1.3) * 6); await sleep(16); if (i === 30) await shot('03-sieve-shaking'); }
await touch('touchEnd');
await sleep(600);
console.log('after shake', await info());
for (let k = 0; k < 4 && (await info()).sieve < 0.9; k++) {
  await touch('touchStart', cx, cy + R * 0.3);
  for (let i = 0; i < 50; i++) { await touch('touchMove', cx + Math.sin(i * 0.9) * R * 0.25, cy + R * 0.3); await sleep(16); }
  await touch('touchEnd');
  await sleep(300);
}
await sleep(800);
await shot('04-sieve-rocks-nugget');
// pepita primeiro (se tiver), depois pedras
let nug = await ev(() => window.__garimpo.proc.debug.game().where(5));
console.log('nugget', nug);
if (nug.length) { await page.touchscreen.tap(nug[0][0], nug[0][1]); await sleep(250); await shot('05-sieve-nugget-grab'); await sleep(900); }
for (let k = 0; k < 14; k++) {
  const r = await ev(() => window.__garimpo.proc.debug.game()?.where(0) ?? []);
  if (!r.length) break;
  await page.touchscreen.tap(r[0][0], r[0][1]);
  await sleep(180);
}
await sleep(1200);
console.log('after sieve', await info());
await shot('06-dip-ready');
// afundar (arrastar para baixo)
await touch('touchStart', cx, cy - R * 0.3);
for (let i = 0; i < 12; i++) { await touch('touchMove', cx, cy - R * 0.3 + i * R * 0.06); await sleep(16); }
await touch('touchEnd');
await sleep(400);
await shot('07-submerged-muddy');
await sleep(500);
const swirl = async (n, rr, sp, snap, stopPh) => {
  await touch('touchStart', cx + rr, cy);
  for (let i = 0; i < n; i++) {
    if (stopPh !== undefined && i % 5 === 0 && (await info()).ph !== stopPh) break; const a = i * sp; await touch('touchMove', cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); await sleep(16); if (snap && i === snap[0]) await shot(snap[1]); }
  await touch('touchEnd');
};
const wash = async (tilt, ms, snap) => {
  await touch('touchStart', cx, cy + R * 0.2);
  const n = Math.round(ms / 20);
  for (let i = 0; i < n; i++) { await touch('touchMove', cx + Math.min(1, i / 15) * tilt * R * 0.9, cy + R * 0.2); await sleep(16); if (snap && i === snap[0]) await shot(snap[1]); }
  await touch('touchEnd');
};
let cyc = 0;
for (let k = 0; k < 14; k++) {
  const s = await info();
  console.log('loop', k, JSON.stringify(s));
  if (s.ph === 3) await swirl(110, R * 0.6, 0.32, k === 0 ? [60, '08-swirl'] : null);
  else if (s.ph === 4) { await wash(0.62, 2400, cyc === 0 ? [70, '09-tilt-wash'] : null); cyc++; await sleep(500); }
  else break;
  await sleep(200);
}
console.log('before black', await info());
await shot('10-black-sand');
for (let k = 0; k < 8 && (await info()).ph === 5; k++) await swirl(90, R * 0.35, 0.09, k === 0 ? [30, '11-black-gentle'] : null, 5);
await sleep(250);
console.log('reveal', await info());
await shot('12-gold-reveal');
await sleep(1300);
await shot('13-gold-glints');
// chupa-ouro: passa o dedo sobre o ouro
for (let k = 0; k < 6; k++) {
  const au = await ev(() => window.__garimpo.proc.debug.game()?.where(4) ?? []);
  const ng = await ev(() => window.__garimpo.proc.debug.game()?.where(5) ?? []);
  if (ng.length) { await page.touchscreen.tap(ng[0][0], ng[0][1]); await sleep(200); }
  if (!au.length) break;
  await touch('touchStart', au[0][0], au[0][1]);
  for (const p of au) { await touch('touchMove', p[0], p[1]); await sleep(16); }
  await touch('touchEnd');
  if (k === 0) await shot('14-snuffer');
  await sleep(300);
}
await sleep(1600);
await shot('15-result');
console.log('end', await info());
await page.tap('.gbp-ok').catch(() => {});
await sleep(1500);
console.log('stock', await ev(() => ({ bag: window.__garimpo.rp?.st.inv, stock: window.__garimpo.sv.stock, cargo: window.__garimpo.worker.cargo.vol, proc: window.__garimpo.proc.debug.info() })));
await shot('16-back-world');
await browser.close();
