// Garimpo — água: sequência de capturas (requer: npx vite --port 5291)
//   NODE_PATH=$(npm root -g) node scripts/dev/garimpo-water.mjs <outDir> [cenário] [dificuldade]
// cenários: all | look | breach | rain | dry | pump | perf
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] ?? 'shots-water';
const only = process.argv[3] ?? 'all';
const diff = Number(process.argv[4] ?? 2);
const port = process.env.PORT ?? 5291;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
page.on('console', (m) => (m.type() === 'error' || m.text().startsWith('[w]')) && console.log('CONSOLE', m.text()));
const seed = Number(process.env.SEED ?? 12345);
await page.addInitScript((sd) => {
  let x = sd;
  Math.random = () => ((x = (x * 16807) % 2147483647) / 2147483647);
}, seed);
await page.goto(`http://localhost:${port}/scripts/dev/garimpo.html?debug`);
await page.waitForSelector('[data-new="0"]');
await page.click('[data-new="0"]');
await page.click(`[data-d="${diff}"]`);
await page.click('[data-start]');
await page.waitForFunction(() => window.__garimpo?.water, null, { timeout: 60000 });
await page.waitForTimeout(1500);

const ev = (fn, arg) => page.evaluate(fn, arg);
/** n passos da simulação (e erosão a cada 6) + malha refeita */
const sim = (n) =>
  ev((n) => {
    const W = window.__garimpo.water;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      W.sim.step(1 / 30);
      if (i % 6 === 5) W.sim.erode(0.2, 1.5);
    }
    const ms = performance.now() - t0;
    W.render.rebuildAll();
    window.__garimpo.w.T.flush();
    return ms / n;
  }, n);
const cam = (p) => ev((p) => (window.__garimpo.camOverride = p), p);
const shot = async (name, bare = false) => {
  await trees(!bare);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${name}.png` });
  await trees(true);
  console.log('shot', name, JSON.stringify(await ev(() => window.__garimpo.water.debug.info())));
};
const D = await ev(() => {
  const d = window.__garimpo.water.debug.dam();
  const m = window.__garimpo.w.map;
  return { x: d.x, z: d.z, ux: d.ux, uz: d.uz, crest: d.crest, lake: m.lake, camp: m.camp, stock: m.stock, plant: m.plant, creek: d.creek };
});
console.log('dam', JSON.stringify(D));
// vistas
const vx = -D.uz;
const vz = D.ux;
const damView = () => cam([D.x + D.ux * 34 + vx * 18, D.crest + 16, D.z + D.uz * 34 + vz * 18, D.x, D.crest - 3, D.z]);
const valleyView = () => {
  const c = D.creek[Math.floor(D.creek.length * 0.45)];
  cam([c.x + vx * 22 - D.ux * 6, D.lake.level + 26, c.z + vz * 22 - D.uz * 6, c.x, D.lake.level + 4, c.z]);
};
const lakeView = () => cam([D.lake.x - D.ux * 26 + vx * 12, D.lake.level + 30, D.lake.z - D.uz * 26 + vz * 12, D.lake.x + D.ux * 4, D.lake.level, D.lake.z + D.uz * 4]);
const trees = (on) =>
  ev((on) => {
    const v = window.__garimpo.w.veg;
    for (const m of [...v.meshes, ...v.cards]) if (m) m.visible = on;
    const w = window.__garimpo.w;
    if (!on) {
      w.__sr = w.__sr || w.setRain;
      w.setRain = () => {};
    } else if (w.__sr) w.setRain = w.__sr;
    const f = w.scene.fog;
    f.far = on ? 165 : 900;
    f.near = on ? 75 : 800;
    const c = window.__garimpo.w.camera;
    if (!on) c.far = 500;
    c.updateProjectionMatrix();
  }, on);
const topView = () => cam([(D.x + D.lake.x) / 2 + 0.1, 120, (D.z + D.lake.z) / 2 + 0.1, (D.x + D.lake.x) / 2, 0, (D.z + D.lake.z) / 2]);

if (only === 'all' || only === 'look' || only === 'breach') {
  await sim(30);
  damView();
  await shot('01-reservoir-full');
  lakeView();
  await shot('01b-lake');
  topView();
  await shot('01c-top', true);
  const m = D.creek[D.creek.length - 1];
  cam([m.x - D.ux * 6 + vx * 14, D.lake.level + 12, m.z - D.uz * 6 + vz * 14, m.x + D.ux * 4, D.lake.level, m.z + D.uz * 4]);
  await shot('01d-mouth', true);
  cam([D.x - D.ux * 20 + vx * 14, D.crest + 10, D.z - D.uz * 20 + vz * 14, D.x, D.crest - 3, D.z]);
  await shot('01e-res-close', true);
}
if (only === 'all' || only === 'breach') {
  await ev(() => window.__garimpo.water.debug.breach(3));
  await sim(45);
  damView();
  await shot('02-breach-start');
  await sim(150);
  damView();
  await shot('03-breach-eroding');
  valleyView();
  await shot('04-flood-midway');
  await shot('04b-flood-midway-bare', true);
  await sim(400);
  valleyView();
  await shot('05-flood-valley', true);
  lakeView();
  await shot('06-flood-lake');
  topView();
  await shot('06b-top', true);
  await sim(2500);
  topView();
  await shot('07-settled-top', true);
  damView();
  await shot('07b-settled-dam');
}
if (only === 'rain') {
  await ev(() => window.__garimpo.water.debug.rain(true));
  await page.waitForTimeout(3000);
  // chuva acelerada: a parte lenta (1 Hz) chamada direto
  await ev(() => {
    const W = window.__garimpo.water;
    window.__garimpo.w.rainK = 1;
    for (let i = 0; i < 160; i++) {
      W.slow(1);
      for (let s = 0; s < 30; s++) W.sim.step(1 / 30);
      if (i % 2) W.sim.erode(0.4, 1.5);
    }
    W.render.rebuildAll();
  });
  damView();
  await shot('08-rain-overflow');
  await ev(() => {
    const W = window.__garimpo.water;
    for (let i = 0; i < 200; i++) {
      W.slow(1);
      for (let s = 0; s < 30; s++) W.sim.step(1 / 30);
      W.sim.erode(0.4, 1.5);
    }
    W.render.rebuildAll();
    window.__garimpo.w.T.flush();
  });
  damView();
  await shot('09-rain-overflow-eroded');
}
if (only === 'dry') {
  await ev(() => {
    const W = window.__garimpo.water;
    W.debug.drain(0.08);
    W.wx.dry = 5000;
    for (let i = 0; i < 300; i++) {
      W.slow(4);
      for (let s = 0; s < 6; s++) W.sim.step(1 / 30);
    }
    W.render.rebuildAll();
  });
  damView();
  await shot('10-dry-reservoir');
  lakeView();
  await shot('11-dry-lake');
}
if (only === 'pump') {
  await ev(() => {
    const g = window.__garimpo;
    const W = g.water;
    W.debug.drain(0.15);
    W.debug.give();
  });
  // garimpeiro na beira do lago: bomba + cano até a represa
  await ev((D) => {
    const g = window.__garimpo;
    const L = D.lake;
    const a = Math.atan2(D.z - L.z, D.x - L.x);
    g.debug.tp(L.x + Math.cos(a) * (L.r - 1), L.z + Math.sin(a) * (L.r - 1), Math.atan2(-Math.cos(a), -Math.sin(a)));
    const W = g.water;
    W.debug.act('pump');
    W.debug.act('pipe');
    g.debug.tp(D.x - D.ux * 1, D.z - D.uz * 1, 0);
    W.debug.act('end');
  }, D);
  await ev(() => {
    const W = window.__garimpo.water;
    for (let i = 0; i < 240; i++) {
      W.quarter(0.25);
      W.sim.step(1 / 30);
      W.sim.step(1 / 30);
    }
    W.render.rebuildAll();
  });
  lakeView();
  await shot('12-pump-lake');
  damView();
  await shot('13-pump-filling');
}
if (only === 'perf') {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.THROTTLE ?? 4) });
  // em jogo (quadros reais): parado
  await ev(() => Object.assign(window.__garimpo.water.prof, { sim: 0, render: 0 }));
  await page.waitForTimeout(8000);
  console.log('ingame settled', JSON.stringify(await ev(() => ({ ...window.__garimpo.water.prof, step: window.__garimpo.prof.step, active: window.__garimpo.water.sim.activeTiles }))));
  await ev(() => window.__garimpo.water.debug.breach(3));
  await page.waitForTimeout(15000);
  console.log('ingame flood', JSON.stringify(await ev(() => ({ ...window.__garimpo.water.prof, step: window.__garimpo.prof.step, active: window.__garimpo.water.sim.activeTiles, info: window.__garimpo.water.debug.info().res }))));
  // custo da simulação com enchente ativa e parada (CPU sem limite; ver --throttle)
  const settled = await sim(60);
  await ev(() => window.__garimpo.water.debug.breach(3));
  await sim(30);
  const r = [];
  for (let i = 0; i < 6; i++) r.push(await sim(60));
  console.log('ms/step settled', settled.toFixed(3), 'flood', r.map((x) => x.toFixed(3)).join(' '));
}
await browser.close();
