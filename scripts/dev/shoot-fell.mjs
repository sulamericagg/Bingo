// node scripts/dev/shoot-fell.mjs <outDir> [tier] [world|fl3d] — sequência de quadros de uma árvore sendo derrubada
// (requer: npx vite --port 4317)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] ?? '.';
const tier = process.argv[3] ?? '2';
const mode = process.argv[4] ?? 'world';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
await page.goto(mode === 'fl3d' ? `http://localhost:4317/scripts/dev/nature.html?g=fl3d&tier=${tier}&x=58` : `http://localhost:4317/scripts/dev/nature.html?g=world&tier=${tier}&biome=0&hud=0&hand=0&up=1.8&pitch=-0.14`);
await page.waitForFunction(() => document.title === 'ready', null, { timeout: 60000 });
await page.waitForTimeout(4000);
if (mode === 'fl3d')
  await page.evaluate(() => {
    const s = window.game.sim;
    let best = null;
    for (const tr of s.trees) if (tr.state === 0 && tr.x > s.me.x + 4 && (!best || Math.abs(tr.x - s.me.x - 9) < Math.abs(best.x - s.me.x - 9))) best = tr;
    s.me.target = best.id;
    s.hitTree(best, 1e6, s.me.x, best.z + 1.5 * Math.sign(best.z || 1), 0);
    // olha para a árvore (um pouco à esquerda dela)
    const v = window.game.view;
    v.yaw = Math.atan2(best.x - s.me.x, best.z - s.me.z) - 0.35;
    v.pitch = -0.05;
  });
else await page.evaluate(() => {
  const g = window.game;
  const tr = g.world.treeNear(g.px, g.pz, 40);
  const p = g.world.treePos(tr, { set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } });
  // derruba (cai para longe do jogador) e leva a câmera para o lado, olhando para a árvore
  g.hitTree(tr, 1e6, false);
  const f = g.falls[g.falls.length - 1];
  // lado com a vista livre (sem tronco no meio)
  const mx = p.x + f.dx * 3;
  const mz = p.z + f.dz * 3;
  let sx = mx - f.dz * 12;
  let sz = mz + f.dx * 12;
  if (g.world.segmentHit(sx, sz, mx, mz, 0.6) < 0.9) {
    sx = mx + f.dz * 12;
    sz = mz - f.dx * 12;
  }
  g.px = sx;
  g.pz = sz;
  g.py = g.world.heightAt(sx, sz);
  g.tYaw = Math.atan2(-(mx - sx), -(mz - sz));
  window.__t0 = performance.now();
});
const times = [80, 450, 800, 1050, 1300, 1700, 2300, 3200];
let last = 0;
for (const [k, ms] of times.entries()) {
  await page.waitForTimeout(Math.max(0, ms - last));
  last = ms;
  await page.screenshot({ path: `${out}/queda-${k}-${ms}ms.png` });
}
console.log('ok', out);
await browser.close();
