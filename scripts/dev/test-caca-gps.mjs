/**
 * Caça Bloop — GPS com ruído no jogo de verdade (Chromium + geolocalização simulada a 1 Hz) e modo controle.
 *   (wrangler dev + vite como em shoot-caca-map.mjs)
 *   node scripts/dev/test-caca-gps.mjs [http://127.0.0.1:5207] [pasta]
 * Gera <pasta>/gps-inapp.json e gps-inapp-plot.png (cru × bonequinho) e confere o modo controle.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire('/opt/node-tools/node_modules/')('playwright');
const [base = 'http://127.0.0.1:5207', out = 'shots-caca'] = process.argv.slice(2);
let seed = 777;
const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const lat0 = -23.5838, lon0 = -46.6539, R = 6371008.8, D = Math.PI / 180;
const toLL = (x, y) => [lat0 + y / (R * D), lon0 + x / (R * D * Math.cos(lat0 * D))];
const toXY = (la, lo) => [(lo - lon0) * D * R * Math.cos(lat0 * D), (la - lat0) * D * R];
const fails = [];
const ok = (c, m) => (console.log((c ? '  ok  ' : '  FAIL ') + m), c || fails.push(m));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'pt-BR', geolocation: { latitude: lat0, longitude: lon0, accuracy: 10 }, permissions: ['geolocation'] });
await ctx.addInitScript(() => {
  localStorage.setItem('bo-quality', '1');
  const s = JSON.parse(localStorage.getItem('bw-caca') || '{}');
  Object.assign(s, { safetyOk: true, locMode: 'gps', starter: true, walkMode: 'real', nightTip: 99999 });
  localStorage.setItem('bw-caca', JSON.stringify(s));
});
const p = await ctx.newPage();
p.on('pageerror', (e) => fails.push('pageerror ' + e.message));
const waitFor = async (fn, ms = 30000) => {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if (await p.evaluate(fn).catch(() => false)) return true;
    await p.waitForTimeout(200);
  }
  return false;
};
await p.goto(`${base}/?debug&nointro&skipob`);
await waitFor(() => !!window.__bloop);
await p.evaluate(() => window.__bloop.launchGame(window.__bloop.listGames().find((g) => g.id === 'caca')));
ok(await waitFor(() => window.__caca && window.__caca.fix()), 'primeira posição');
// trajeto: parado 40 s → leste 70 s → parado 20 s (ruído correlacionado + saltos + leituras ruins)
const legs = [[0, 0, 40], [1.3, 0, 70], [0, 0, 20]];
let x = 0, y = 0, ex = 0, ey = 0;
const raw = [], truth = [], av = [];
for (const [vx, vy, dur] of legs)
  for (let s = 0; s < dur; s++) {
    x += vx; y += vy;
    ex = ex * 0.8 + gauss() * 4.5; ey = ey * 0.8 + gauss() * 4.5;
    let acc = 8 + rnd() * 10, nx = x + ex + gauss() * 3, ny = y + ey + gauss() * 3;
    const u = rnd();
    if (u < 0.04) { nx += (rnd() - 0.5) * 140; ny += (rnd() - 0.5) * 140; acc = 15 + rnd() * 10; }
    else if (u < 0.09) { nx += gauss() * 35; ny += gauss() * 35; acc = 45 + rnd() * 40; }
    const [la, lo] = toLL(nx, ny);
    await ctx.setGeolocation({ latitude: la, longitude: lo, accuracy: acc });
    raw.push([nx, ny, vx || vy ? 1 : 0]);
    truth.push([x, y]);
    for (let k = 0; k < 4; k++) {
      await p.waitForTimeout(250);
      const a = await p.evaluate(() => window.__caca.gps().av);
      if (a) av.push([...toXY(a[0], a[1]), vx || vy ? 1 : 0]);
    }
  }
const stats = await p.evaluate(() => window.__caca.gps().stats);
const pathLen = (pts, moving) => { let L = 0; for (let i = 1; i < pts.length; i++) if (pts[i][2] === moving && pts[i - 1][2] === moving) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };
const maxStep = (pts) => { let m = 0; for (let i = 1; i < pts.length; i++) m = Math.max(m, Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return m; };
const res = { filter: stats, rawStillPath_m: Math.round(pathLen(raw, 0)), avatarStillPath_m: Math.round(pathLen(av, 0)), rawMaxStep_m: Math.round(maxStep(raw)), avatarMaxStepPer250ms_m: +maxStep(av).toFixed(1), avatarEnd: av.at(-1)?.map((v) => +v.toFixed(1)), truthEnd: truth.at(-1) };
console.log(res);
ok(res.avatarStillPath_m < res.rawStillPath_m / 5, 'parado: bonequinho anda < 1/5 do GPS cru');
ok(res.avatarMaxStepPer250ms_m < 3, 'sem saltos (passo máx. < 3 m a cada 250 ms)');
ok(Math.hypot(res.avatarEnd[0] - 91, res.avatarEnd[1]) < 25, 'chegou perto do fim real (91 m a leste)');
fs.writeFileSync(`${out}/gps-inapp.json`, JSON.stringify({ res, raw, truth, av }));
// gráfico
const all = [...raw, ...truth];
const minx = Math.min(...all.map((q) => q[0])), maxx = Math.max(...all.map((q) => q[0])), miny = Math.min(...all.map((q) => q[1])), maxy = Math.max(...all.map((q) => q[1]));
const W = 900, H = 560, pad = 40, sc = Math.min((W / 2 - pad * 1.5) / (maxx - minx), (H - 2 * pad - 40) / (maxy - miny));
const P = (q, ox) => `${(ox + (q[0] - minx) * sc).toFixed(1)},${(H - pad - 20 - (q[1] - miny) * sc).toFixed(1)}`;
const panel = (ox, pts, col, title) => `<text x="${ox}" y="28" font-family="sans-serif" font-size="18" font-weight="700">${title}</text>
<polyline points="${truth.map((q) => P(q, ox)).join(' ')}" fill="none" stroke="#bbb" stroke-width="8" stroke-linecap="round"/>
<polyline points="${pts.map((q) => P(q, ox)).join(' ')}" fill="none" stroke="${col}" stroke-width="1.6"/>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#fff"/>${panel(pad, raw, '#e0457b', 'Antes: GPS cru (1 Hz)')}${panel(W / 2 + pad / 2, av, '#2a7fd4', 'Depois: bonequinho no jogo')}
<text x="${pad}" y="${H - 12}" font-family="sans-serif" font-size="13" fill="#444">cinza = caminho real · parado: cru andou ${res.rawStillPath_m} m, bonequinho ${res.avatarStillPath_m} m · maior salto cru ${res.rawMaxStep_m} m · filtro: ${stats.poorAcc} ruins + ${stats.jumps} saltos descartados</text></svg>`;
const pg2 = await ctx.newPage();
await pg2.setContent(svg);
await pg2.setViewportSize({ width: W, height: H });
await pg2.screenshot({ path: `${out}/gps-inapp-plot.png` });
const sv2 = fs.readFileSync(`${out}/gps-filter-plot.svg`, 'utf8').replace(/^<svg /, '<svg style="display:block" ');
await pg2.setViewportSize({ width: 900, height: 640 });
await pg2.setContent(sv2);
await pg2.screenshot({ path: `${out}/gps-filter-plot.png` });
await pg2.close();

console.log('modo controle');
await p.evaluate(() => window.__caca.walkMode('controle'));
await waitFor(() => window.__caca.fix() && !document.querySelector('.cc-ov'), 10000);
const f0 = await p.evaluate(() => window.__caca.fix());
const b0 = await p.evaluate(() => window.__caca.joyBudget());
await p.evaluate(() => window.__caca.joy(0, -1, 5));
await p.waitForTimeout(5400);
const f1 = await p.evaluate(() => window.__caca.fix());
const b1 = await p.evaluate(() => window.__caca.joyBudget());
const dm = Math.hypot(...(() => { const a = toXY(f0.lat, f0.lon), b = toXY(f1.lat, f1.lon); return [a[0] - b[0], a[1] - b[1]]; })());
console.log('   andou', dm.toFixed(1), 'm em 5 s; passos virtuais', b0.left, '→', b1.left);
ok(dm > 5 && dm < 7.6, 'joystick: velocidade de caminhada (≤ 1,4 m/s)');
ok(b0.left - b1.left > 5, 'gasta passos virtuais');
const tgt = toLL(...(() => { const a = toXY(f1.lat, f1.lon); return [a[0] + 25, a[1]]; })());
await p.evaluate(([a, b]) => window.__caca.walkTo(a, b), tgt);
await p.waitForTimeout(24000);
const f2 = await p.evaluate(() => window.__caca.fix());
const e2 = Math.hypot(...(() => { const a = toXY(f2.lat, f2.lon), b = toXY(...tgt); return [a[0] - b[0], a[1] - b[1]]; })());
ok(e2 < 3, `passeio chegou no destino (${e2.toFixed(1)} m)`);
// limite de 1,5 km
await p.evaluate(() => {
  const s = window.__caca.save;
  s.joyPos = null;
});
await browser.close();
console.log(fails.length ? 'FALHAS: ' + fails.join('; ') : 'tudo certo');
process.exit(fails.length ? 1 : 0);
