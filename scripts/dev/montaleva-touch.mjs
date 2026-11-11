// Completa as fases 1–5 do Monta & Leva só com toque (CDP touch), em paisagem (844x390) e retrato (390x844).
// Uso: npx vite --port 5217  &&  NODE_PATH=$(npm root -g) OUT=pasta/ node scripts/dev/montaleva-touch.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = process.env.OUT || '/tmp/montaleva-shots/';
import { mkdirSync } from 'node:fs';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fail = 0;
const b = await chromium.launch();
for (const [W, H, tag] of [[844, 390, 'land'], [390, 844, 'port']]) {
  const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('PAGEERR', e.message));
  const cdp = await ctx.newCDPSession(p);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  const tapAt = async (x, y) => { await touch('touchStart', x, y); await sleep(40); await touch('touchEnd'); await sleep(120); };
  const center = async (sel) => {
    const r = await p.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, sel);
    if (!r) throw new Error('sem elemento ' + sel);
    return r;
  };
  const tapSel = async (sel) => { const c = await center(sel); await tapAt(c.x, c.y); };
  const drag = async (a, z) => {
    await touch('touchStart', a.x, a.y);
    const n = 14;
    for (let i = 1; i <= n; i++) { await touch('touchMove', a.x + ((z.x - a.x) * i) / n, a.y + ((z.y - a.y) * i) / n); await sleep(16); }
    await sleep(60);
    await touch('touchEnd');
    await sleep(150);
  };
  const st = () => p.evaluate(() => __montaleva.state());
  await p.goto('http://localhost:5217/?debug&nointro');
  await p.waitForFunction(() => window.__bloop, null, { timeout: 60000 });
  await sleep(1500);
  await p.evaluate(() => document.querySelectorAll('.ob-root, .beta-sheet-bg').forEach((e) => e.remove()));
  await p.evaluate(() => __bloop.launchGame(__bloop.listGames().find((x) => x.id === 'montaleva')));
  await p.waitForFunction(() => window.__montaleva && document.querySelector('.ml-menu [data-a=play]'), null, { timeout: 30000 });
  // espera a transição de abertura do hub terminar
  await p.waitForFunction(() => !document.querySelector('.celebrate, .launch-fx, .hub-launch'), null, { timeout: 15000 }).catch(() => {});
  await sleep(3000);
  await p.screenshot({ path: `${OUT}${tag}-0-menu.png` });
  await tapSel('.ml-menu [data-a=play]');
  for (let n = 1; n <= 5; n++) {
    await p.waitForFunction((n) => { const s = __montaleva.state(); return s.screen === 'build' && s.level === n; }, n, { timeout: 10000 });
    await sleep(900);
    const sol = await p.evaluate(async (n) => (await __montaleva.solutions())[n].parts, n);
    const have = (await st()).parts;
    const key = (q) => `${q.t}@${q.x},${q.y},${q.r}`;
    const pre = new Set(have.map(key));
    const need = sol.filter((q) => !pre.has(key(q)));
    const isStruct = (t) => !['wheelS', 'wheelL', 'wheelG', 'motor', 'thruster', 'balloon', 'spring', 'hinge'].includes(t) || ['spring', 'hinge'].includes(t);
    need.sort((a, b) => (/wheel|motor|thruster|balloon/.test(a.t) ? 1 : 0) - (/wheel|motor|thruster|balloon/.test(b.t) ? 1 : 0));
    if (n === 1) await p.screenshot({ path: `${OUT}${tag}-L1-tutorial.png` });
    for (const q of need) {
      // rotação da bandeja: arma a peça e toca em Girar até bater
      let rot = await p.evaluate((t) => __montaleva.game.trayRot[t] ?? 0, q.t);
      if (rot !== q.r) {
        await tapSel(`.ml-slot[data-t=${q.t}]`);
        for (let k = 0; k < 4 && rot !== q.r; k++) { await tapSel('[data-a=rot]'); rot = await p.evaluate((t) => __montaleva.game.trayRot[t] ?? 0, q.t); }
        if ((await st()).armed) await tapSel(`.ml-slot[data-t=${q.t}]`);
      }
      const from = await center(`.ml-slot[data-t=${q.t}]`);
      const to = await p.evaluate((q) => __montaleva.cellToClient(q.x, q.y, q.t, q.r), q);
      const before = (await st()).parts.length;
      await drag(from, { x: to.x, y: to.y + 52 });
      const after = await st();
      const ok = after.parts.some((o) => key(o) === key(q));
      if (!ok) { console.log(`  ${tag} L${n}: falhou ao colocar ${key(q)} (antes ${before}, depois ${after.parts.length})`); fail++; }
    }
    await sleep(300);
    await p.screenshot({ path: `${OUT}${tag}-L${n}-build.png` });
    await tapSel('[data-a=test]');
    await p.waitForFunction(() => __montaleva.state().screen !== 'build', null, { timeout: 5000 });
    await sleep(500);
    const go = await center('[data-a=fwd]');
    await touch('touchStart', go.x, go.y);
    let shot = false;
    const t0 = Date.now();
    let s;
    while (Date.now() - t0 < 40000) {
      s = await st();
      if (s.result) break;
      if (!shot && s.simTime > 2) { await p.screenshot({ path: `${OUT}${tag}-L${n}-drive.png` }); shot = true; }
      await sleep(100);
    }
    await touch('touchEnd');
    console.log(`${tag} L${n}: ${s.result ? (s.result.win ? 'VENCEU' : 'perdeu: ' + s.result.reason) : 'sem resultado'} t=${s.simTime.toFixed(2)} peças=${s.parts.length}`);
    if (!s.result?.win) { fail++; break; }
    await sleep(1400);
    await p.screenshot({ path: `${OUT}${tag}-L${n}-win.png` });
    await tapSel('.ml-res [data-a=next]');
  }
  const fin = await st();
  console.log(tag, 'estrelas', fin.stars.slice(0, 5).join(','), 'engrenagens', fin.gears);
  await ctx.close();
}
await b.close();
console.log(fail ? `FALHAS: ${fail}` : 'OK: fases 1–5 completas por toque nas duas orientações');
process.exit(fail ? 1 : 0);
