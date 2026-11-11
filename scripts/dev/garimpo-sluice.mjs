// Garimpo — beneficiamento: capturas jogando com toque (CDP). Requer: npx vite --port 5293 (ou PORT). Saída: shots-pan/
import { createRequire } from 'node:module';
const { chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright');
const OUT = '/home/user/wt-pan/shots-pan';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true });
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
await page.addInitScript(() => { let x = 777; Math.random = () => ((x = (x * 16807) % 2147483647) / 2147483647); });
await page.goto(`http://localhost:${process.env.PORT ?? 5293}/scripts/dev/garimpo.html?debug`);
await page.waitForSelector('[data-new="0"]');
await page.click('[data-new="0"]');
await page.click(`[data-d="1"]`);
await page.click('[data-start]');
await page.waitForFunction(() => window.__garimpo?.proc, null, { timeout: 60000 });
await page.waitForTimeout(1200);
const cdp = await page.context().newCDPSession(page);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
const ev = (fn, a) => page.evaluate(fn, a);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const sleep = (ms) => page.waitForTimeout(ms);
const press = (sel) => ev((sel) => { const e = document.querySelector(sel); e?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); e?.click(); return !!e; }, sel);
await page.addStyleTag({ content: '.gbw-cine{display:none!important}' });
// represa cheia transbordando → riacho correndo
const S = await ev(() => {
  const g = window.__garimpo;
  const W = g.water;
  const D = W.debug.dam();
  const c0 = D.creek[2];
  for (let i = 0; i < 1200; i++) { W.sim.add(c0.x, c0.z, 0.05); W.sim.step(1 / 30); }
  W.camFx = () => {};
  window.__src = setInterval(() => W.sim.add(c0.x, c0.z, 0.05 * 2), 66);
  W.render.rebuildAll();
  // ponto do riacho com mais correnteza
  let best = null, bq = 1e9;
  for (let i = 3; i < D.creek.length - 3; i++) {
    const c = D.creek[i];
    const k = W.sim.cellOf(c.x, c.z);
    const q = W.sim.d[k] * Math.hypot(W.sim.ux[k], W.sim.uz[k]);
    const f = W.sim.d[k] * (0.25 + Math.hypot(W.sim.ux[k], W.sim.uz[k])) * 4; if (i > 15 && Math.abs(f - 1) < bq) { bq = Math.abs(f - 1); best = i; }
  }
  const c = D.creek[best], up = D.creek[best - 1];
  const yaw = Math.atan2(up.x - c.x, up.z - c.z);
  g.proc.debug.sluice(c.x, c.z, yaw);
  g.debug.money(60000);
  // garimpeiro ao lado da cabeça
  const hx = c.x + Math.sin(yaw) * 1.6 + Math.cos(yaw) * 2.2, hz = c.z + Math.cos(yaw) * 1.6 - Math.sin(yaw) * 2.2;
  g.debug.tp(hx, hz, yaw - Math.PI / 2);
  return { x: c.x, z: c.z, yaw, q: bq, n: D.creek.length, best };
});
console.log('sluice at', S);
await sleep(800);
// despeja 3 carrinhos na moega
await ev(() => { const g = window.__garimpo; const s = g.proc.debug.sls()[0]; s.load += 0.36; s.gold += 18; });
const camAt = (x, z, yaw, d, h) => ev(([x, z, yaw, d, h]) => { const g = window.__garimpo; const y = g.w.T.heightAt(x, z); g.camOverride = [x - Math.cos(yaw) * d + Math.sin(yaw) * d * 0.5, y + h, z + Math.sin(yaw) * d + Math.cos(yaw) * d * 0.5, x, y + 0.6, z]; }, [x, z, yaw, d, h]);
await camAt(S.x, S.z, S.yaw, 4.8, 3.6);
await sleep(2500);
console.log('info', JSON.stringify(await ev(() => window.__garimpo.proc.debug.info().sl)));
await shot('20-sluice-stream');
// inclinação errada (muito)
for (let i = 0; i < 2; i++) { await press('.gbp-panel [data-p="up"]'); await sleep(300); }
await sleep(800);
await shot('21-sluice-gauge-steep');
for (let i = 0; i < 4; i++) { await press('.gbp-panel [data-p="dn"]'); await sleep(300); }
await sleep(1000);
await shot('21b-sluice-gauge-green');
await sleep(6000);
console.log('info2', JSON.stringify(await ev(() => window.__garimpo.proc.debug.info().sl)));
await ev(() => { const s = window.__garimpo.proc.debug.sls()[0]; s.mat = 1.1; });
await sleep(400);
await shot('22-sluice-ready-clean');
await ev(() => (window.__garimpo.camOverride = null));
await press('.gbp-bar [data-p="clean"]');
await sleep(700);
await shot('23-clean-mat');
await touch('touchStart', 420, 260);
for (let i = 0; i < 12; i++) { await touch('touchMove', 420, 260 - i * 14); await sleep(20); }
await shot('24-clean-lift');
await touch('touchEnd');
await sleep(500);
await touch('touchStart', 300, 200);
for (let i = 0; i < 160; i++) { await touch('touchMove', 300 + Math.sin(i * 0.5) * 140, 200); await sleep(16); if (i === 60) await shot('25-clean-rinse'); }
await touch('touchEnd');
await sleep(800);
await shot('26-clean-choice');
await press('[data-c="pan"]');
await sleep(800);
await shot('27-clean-pan-scoop');
const game = () => ev(() => window.__garimpo.proc.debug.game()?.info());
const [cx, cy, R] = await ev(() => window.__garimpo.proc.debug.game().layoutInfo());
await page.touchscreen.tap(cx, cy);
await sleep(1500);
await touch('touchStart', cx, cy - R * 0.3);
for (let i = 0; i < 12; i++) { await touch('touchMove', cx, cy - R * 0.3 + i * R * 0.06); await sleep(16); }
await touch('touchEnd');
await sleep(900);
for (let k = 0; k < 16; k++) {
  const s = await game();
  if (!s || s.ph > 5) break;
  if (s.ph === 3 || s.ph === 5) {
    const rr = s.ph === 5 ? R * 0.35 : R * 0.6, sp = s.ph === 5 ? 0.09 : 0.32;
    await touch('touchStart', cx + rr, cy);
    for (let i = 0; i < 100; i++) { if (i % 5 === 0 && (await game()).ph !== s.ph) break; await touch('touchMove', cx + Math.cos(i * sp) * rr, cy + Math.sin(i * sp) * rr); await sleep(16); }
    await touch('touchEnd');
  } else if (s.ph === 4) {
    await touch('touchStart', cx, cy + R * 0.2);
    for (let i = 0; i < 110; i++) { await touch('touchMove', cx + Math.min(1, i / 15) * 0.62 * R * 0.9, cy + R * 0.2); await sleep(16); if (k < 3 && i === 60) await shot('28-clean-pan-wash'); }
    await touch('touchEnd');
    await sleep(500);
  }
  await sleep(150);
}
await sleep(300);
await shot('29-clean-pan-reveal');
const au = await ev(() => window.__garimpo.proc.debug.game()?.where(4) ?? []);
if (au.length) { await touch('touchStart', au[0][0], au[0][1]); for (const p of au) { await touch('touchMove', p[0], p[1]); await sleep(16); } await touch('touchEnd'); }
await sleep(2500);
console.log('clean pan', JSON.stringify(await game()));
await shot('30-clean-pan-result');
await press('.gbp-ok');
await sleep(800);
// ---------------- lavadora com melhorias ----------------
await ev(() => {
  const g = window.__garimpo;
  g.proc.debug.upgradeAll();
  const m = g.w.map.plant;
  g.debug.tp(m.x + Math.sin(m.rot) * 13, m.z + Math.cos(m.rot) * 13, m.rot + Math.PI);
  g.sv.plantVol += 3;
  g.sv.plantGold += 160;
});
await sleep(1500);
const P = await ev(() => { const m = window.__garimpo.w.map.plant; return { x: m.x, z: m.z, rot: m.rot }; });
// vista de 3/4 pelo lado das melhorias (−x local)
const lp = (lx, lz) => [P.x + Math.cos(P.rot) * lx + Math.sin(P.rot) * lz, P.z - Math.sin(P.rot) * lx + Math.cos(P.rot) * lz];
const [ex, ez] = lp(-15, 15), [tx, tz] = lp(-3, -1.5);
await ev(([ex, ez, tx, tz]) => { const g = window.__garimpo; const y = g.w.T.heightAt(tx, tz); g.camOverride = [ex, y + 9, ez, tx, y + 1, tz]; }, [ex, ez, tx, tz]);
await sleep(2500);
await shot('31-plant-upgraded');
const [ex2, ez2] = lp(-1.5, -11), [tx2, tz2] = lp(-5.4, -5);
await ev(([ex, ez, tx, tz]) => { const g = window.__garimpo; const y = g.w.T.heightAt(tx, tz); g.camOverride = [ex, y + 3.2, ez, tx, y + 0.9, tz]; }, [ex2, ez2, tx2, tz2]);
await sleep(1200);
await shot('32-plant-shaker-goldroom');
await ev(() => (window.__garimpo.camOverride = null));
await sleep(3000);
await shot('33-plant-panel-recovery');
console.log('plant', JSON.stringify(await ev(() => ({ i: window.__garimpo.proc.debug.info(), stock: window.__garimpo.sv.stock, pv: window.__garimpo.sv.plantVol }))));
// rejeito
const T = await ev(() => window.__garimpo.proc.debug.info().tails);
console.log('tails', JSON.stringify(T));
const tl = T[T.length - 1];
if (tl) {
  await ev(([x, z]) => { const g = window.__garimpo; g.debug.tp(x + 5, z + 5, 0); const y = g.w.T.heightAt(x, z); g.camOverride = [x + 7, y + 5, z + 7, x + 1, y + 0.5, z]; }, [tl.x, tl.z]);
  await sleep(2500);
  await shot('34-tailings');
}
await ev(() => (window.__garimpo.camOverride = null));
await ev(() => window.__garimpo.openShop());
await sleep(600);
await page.evaluate(() => document.querySelector('.gb-shopgrid')?.lastElementChild?.scrollIntoView());
await sleep(300);
await shot('35-shop');
await browser.close();
