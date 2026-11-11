// Garimpo — consertos: joga cada minijogo com toque emulado e tira fotos em vários passos.
//   PORT=4481 NODE_PATH=$(npm root -g) node scripts/dev/garimpo-repair-shots.mjs <outDir> [jogo] [variante]
// jogos: all | tyre | tyre-truck | electric | part | bushing | brake
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] ?? 'shots-repair';
const only = process.argv[3] ?? 'all';
const port = process.env.PORT ?? 4481;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()));

const cdp = await ctx.newCDPSession(page);
const S = 390 / 390;
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: x * S, y: y * S, id: 1, radiusX: 6, radiusY: 6 }] });
const wait = (ms) => page.waitForTimeout(ms);
/** design → tela (o jogo usa altura 390 e largura = 844 aqui) */
const tap = async (x, y) => {
  await touch('touchStart', x, y);
  await wait(60);
  await touch('touchEnd', x, y);
  await wait(80);
};
const drag = async (x0, y0, x1, y1, steps = 14, hold = 0) => {
  await touch('touchStart', x0, y0);
  for (let i = 1; i <= steps; i++) {
    await touch('touchMove', x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps);
    await wait(16);
  }
  if (hold) await wait(hold);
  await touch('touchEnd', x1, y1);
  await wait(60);
};
/** gira o dedo em volta de (cx,cy): voltas (negativo = anti-horário) */
const twist = async (cx, cy, turns, r = 34, shotAt = -1, name = '') => {
  const n = Math.ceil(Math.abs(turns) * 22);
  const dir = Math.sign(turns);
  // como a criança: põe o dedo na porca e sai girando em volta
  await touch('touchStart', cx, cy);
  await wait(16);
  await touch('touchMove', cx + r * 0.5, cy);
  await wait(16);
  for (let i = 1; i <= n; i++) {
    const a = (dir * i * Math.PI * 2) / 22;
    await touch('touchMove', cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    await wait(14);
    if (i === shotAt) await shot(name);
  }
  await touch('touchEnd', cx + r, cy);
  await wait(80);
};
const shot = async (name) => {
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
};
const ev = (fn, arg) => page.evaluate(fn, arg);
const G = () => ev(() => window.__mg && { step: window.__mg.step, won: window.__mg.won, W: window.__mg.W });
const open = async (q) => {
  await page.goto(`http://127.0.0.1:${port}/scripts/dev/garimpo-repair.html?${q}`);
  await page.waitForFunction(() => window.__mg, null, { timeout: 30000 });
  if (process.env.DBG)
    await ev(() => {
      const g = window.__mg;
      const od = g.down.bind(g);
      g.down = (a, b) => {
        console.error('down', g.step, a.toFixed(1), b.toFixed(1));
        od(a, b);
      };
    });
  await wait(400);
};
const done = async (name) => {
  await page.waitForFunction(() => document.title.startsWith('done:'), null, { timeout: 8000 }).catch(() => {});
  console.log(name, 'result', await page.title(), JSON.stringify(await G()));
};

/* ------------------------------ pneu ------------------------------ */
async function tyre(heavy, tag) {
  await open(`g=tyre&heavy=${heavy ? 1 : 0}&lvl=1`);
  await wait(2400);
  await shot(`${tag}-0-start`);
  // 1) macaco: bombear até subir
  for (let i = 0; i < 8 && (await G()).step === 0; i++) {
    const p = await ev(() => {
      const g = window.__mg;
      const o = { x: 0, y: 0 };
      g.grip(o);
      return o;
    });
    await drag(p.x, p.y, p.x, p.y + 140, 8);
    await wait(120);
    if (i === 1) await shot(`${tag}-1-jack`);
  }
  await wait(500);
  // 2) porcas
  const nuts = await ev(() => {
    const g = window.__mg;
    const r = [];
    for (let i = 0; i < g.n; i++) {
      const o = { x: 0, y: 0 };
      g.constructor; // eslint
      const P = g.wp;
      const bc = P.R * 0.63 * 0.5;
      const t = (i * Math.PI * 2) / g.n - Math.PI / 2;
      r.push({ x: g.cx + Math.cos(t) * bc, y: g.hy + Math.sin(t) * bc });
      void o;
    }
    return r;
  });
  for (let i = 0; i < nuts.length; i++) {
    await twist(nuts[i].x, nuts[i].y, -1.35, 30, i === 0 ? 14 : -1, `${tag}-2-twist`);
    if (i === 0) await wait(250), await shot(`${tag}-3-nutfly`);
    await wait(150);
  }
  await wait(900);
  await shot(`${tag}-4-nutsoff`);
  // 3) puxar a roda
  const hub = await ev(() => ({ x: window.__mg.cx, y: window.__mg.hy, R: window.__mg.R }));
  await drag(hub.x, hub.y + 20, hub.x - 260, hub.y + 30, 18);
  await wait(200);
  await shot(`${tag}-5-pulled`);
  await wait(1200);
  // 4) estepe
  const sp = await ev(() => ({ x: window.__mg.spX, y: window.__mg.spY }));
  await shot(`${tag}-6-hub`);
  await touch('touchStart', sp.x, sp.y);
  for (let i = 1; i <= 20; i++) {
    await touch('touchMove', sp.x + ((hub.x - sp.x) * i) / 20, sp.y + ((hub.y - sp.y) * i) / 20);
    await wait(16);
    if (i === 12) await shot(`${tag}-7-spare-drag`);
  }
  await touch('touchEnd', hub.x, hub.y);
  await wait(900);
  await shot(`${tag}-8-spare-on`);
  // 5) apertar em estrela
  for (let k = 0; k < nuts.length; k++) {
    const nx = await ev(() => window.__mg.nextStar());
    const p = await ev((i) => {
      const g = window.__mg;
      const bc = g.R * 0.63 * 0.5;
      const t = g.spA + (i * Math.PI * 2) / g.n - Math.PI / 2;
      return { x: g.cx + Math.cos(t) * bc, y: g.hy + Math.sin(t) * bc };
    }, nx);
    await tap(p.x, p.y);
    if (process.env.DBG) console.log('tap', nx, JSON.stringify(p), JSON.stringify(await ev(() => ({ act: window.__mg.act, st: Array.from(window.__mg.st), spA: window.__mg.spA }))));
    await wait(500);
    if (k === 1) await shot(`${tag}-9-nut-loose`);
    await twist(p.x, p.y, 0.95, 30, k === 1 ? 10 : -1, `${tag}-10-tighten`);
    await wait(150);
    if (process.env.DBG) console.log('nut', nx, JSON.stringify(await ev(() => ({ st: Array.from(window.__mg.st), first: window.__mg.first, ok: window.__mg.starOk, tight: window.__mg.tight }))));
  }
  await wait(600);
  await shot(`${tag}-11-tight`);
  // 6) válvula
  const v = await ev(() => {
    const o = { x: 0, y: 0 };
    window.__mg.valve(o);
    return o;
  });
  await tap(v.x, v.y);
  await wait(700);
  await shot(`${tag}-12-lowering`);
  await wait(900);
  await shot(`${tag}-13-win`);
  await done(tag);
}

const all = only === 'all';
if (all || only === 'tyre') await tyre(false, 'tyre');
if (all || only === 'tyre-truck') await tyre(true, 'tyre-truck');
const mods = await import('./garimpo-repair-games.mjs').catch(() => null);
if (mods) await mods.run({ only, open, tap, drag, twist, shot, ev, G, wait, touch, done, page });
await browser.close();
