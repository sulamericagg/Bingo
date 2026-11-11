// Capturas das ABERTURAS (docs/INTROS.md): N quadros por abertura (paisagem 844×390, dpr 1) + folha de contato,
// e um teste "Pular → jogo começa limpo" pelo fluxo real do jogo.
// Uso: NODE_PATH=$(npm root -g) node scripts/dev/intros-shots.mjs --port 5377 --only jangada [--times 1,5,9] [--tier 2] [--skip]
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const arg = (k, d) => {
  const i = process.argv.indexOf('--' + k);
  return i > 0 ? process.argv[i + 1] : d;
};
const PORT = Number(arg('port', 5377));
const OUT = arg('out', 'shots-intros1');
const TIER = Number(arg('tier', 2));
const ONLY = arg('only', 'jangada').split(',');
const TIMES = arg('times', '');
const [VW, VH] = arg('size', '844x390').split('x').map(Number);
mkdirSync(OUT, { recursive: true });
const PLAN = {
  jangada: [2, 7, 11, 17.2, 21.9, 25.2, 27.5, 32.5, 35.5, 42],
  noites: [2, 7, 12, 17, 22, 27, 31, 37, 42],
  cavafala: [2, 7, 12, 17, 22, 27, 32, 38],
  anomalias: [2, 7, 12, 17, 22, 27, 32, 38],
  montaleva: [1.5, 5, 9, 13, 17, 21, 25, 30],
};
const SAVE = {
  skin: 'custom',
  ownedSkins: ['bloop', 'custom'],
  avatar: { parts: { body: 'b_round', material: 'm_soft', pattern: 'p_spots', eyes: 'e_big', mouth: 'mo_smile', head: 'h_cap', face: 'f_blush', back: 'k_none', aura: 'a_none' }, colors: { primary: '#ff7ac8', secondary: '#7ad8ff' } },
};
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1, hasTouch: true });
await ctx.addInitScript(
  ({ save, tier }) => {
    try {
      const k = 'bloop-orbit-save-v1';
      const o = JSON.parse(localStorage.getItem(k) || '{}');
      localStorage.setItem(k, JSON.stringify({ ...o, ...save }));
      localStorage.setItem('bo-quality-detect', JSON.stringify({ v: 'x', tier, score: 0, cap: 3 }));
      localStorage.setItem('bo-quality', String(tier));
    } catch {
      /* */
    }
  },
  { save: SAVE, tier: TIER },
);
const report = {};
for (const g of process.argv.includes('--noshots') ? [] : ONLY) {
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  p.on('console', (m) => m.type() === 'error' && !/Failed to load resource|WebSocket|net::|AudioContext/.test(m.text()) && errs.push('console ' + m.text()));
  await p.goto(`http://127.0.0.1:${PORT}/scripts/dev/intros.html?play=${g}&debug`);
  await p.waitForFunction(() => document.title === 'ready' && window.__cine, null, { timeout: 90000 });
  const times = TIMES ? TIMES.split(',').map(Number) : PLAN[g];
  const files = [];
  for (const [i, t] of times.entries()) {
    // chega um pouco antes e deixa rodar (estado contínuo: chuva, respingos...)
    await p.evaluate((t) => window.__cine.seek(Math.max(0, t - 0.6)), t);
    await p.waitForFunction((t) => window.__cine.time >= t || !window.__cine.playing, t, { timeout: 60000 });
    const f = `${OUT}/${g}-${String(i + 1).padStart(2, '0')}-${String(t).replace('.', '_')}s.png`;
    await p.screenshot({ path: f });
    files.push(f);
  }
  // pular: a abertura some e tudo é liberado
  await p.evaluate(() => window.__cine.skip());
  await p.waitForTimeout(900);
  const after = await p.evaluate(() => ({ done: !!window.__done, cine: document.querySelectorAll('.cine-root').length, canvases: document.querySelectorAll('canvas').length }));
  report[g] = { files, after, errs: errs.slice(0, 8) };
  // folha de contato
  const html = `<html><body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:4px">${files.map((f, i) => `<div style="position:relative"><img src="data:image/png;base64,${readFileSync(f).toString('base64')}" style="width:100%;display:block"><b style="position:absolute;left:6px;top:4px;color:#fff;font:700 16px sans-serif;text-shadow:0 1px 3px #000">${times[i]}s</b></div>`).join('')}</body></html>`;
  const sp = await ctx.newPage();
  await sp.setViewportSize({ width: 1500, height: Math.ceil(files.length / 3) * 236 + 8 });
  await sp.setContent(html);
  await sp.waitForTimeout(500);
  await sp.screenshot({ path: `${OUT}/${g}-contact.png`, fullPage: true });
  await sp.close();
  await p.close();
  console.log(g, JSON.stringify(report[g].after), report[g].errs.join(' | '));
}
/* ---------- fluxo real: menu do jogo → jogo novo → abertura → Pular → o jogo começa limpo ---------- */
const FLOW = {
  jangada: { sel: '[data-m=new]', ok: () => !!document.querySelector('.jg-gl') },
  noites: { sel: '[data-m=solo]', ok: () => !!document.querySelector('canvas') },
  cavafala: { sel: '[data-m=restore]', ok: () => !!document.querySelector('.cf-root canvas, canvas') },
  anomalias: { sel: '[data-intro-start]', ok: () => !!document.querySelector('canvas') },
  montaleva: { sel: '[data-a=play]', ok: () => !!document.querySelector('.ml-root') },
};
if (process.argv.includes('--flow'))
  for (const g of ONLY) {
    const f = FLOW[g];
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push('pageerror ' + e.message));
    p.on('console', (m) => m.type() === 'error' && !/Failed to load resource|WebSocket|net::|AudioContext/.test(m.text()) && errs.push('console ' + m.text()));
    await p.goto(`http://127.0.0.1:${PORT}/scripts/dev/intros.html?game=${g}&intro=1&debug`);
    await p.waitForFunction(() => document.title === 'ready', null, { timeout: 90000 });
    await p.waitForTimeout(1500);
    const sel = (await p.evaluate(() => window.__introSel)) || f.sel;
    await p.click(sel, { timeout: 20000 });
    await p.waitForFunction(() => window.__cine && window.__cine.playing, null, { timeout: 60000 });
    await p.waitForTimeout(2500);
    await p.screenshot({ path: `${OUT}/${g}-flow-1-intro.png` });
    const gl0 = await p.evaluate(() => document.querySelectorAll('canvas').length);
    await p.click('.cine-skip');
    await p.waitForTimeout(6000);
    await p.screenshot({ path: `${OUT}/${g}-flow-2-game.png` });
    const st = await p.evaluate((ok) => ({ cine: document.querySelectorAll('.cine-root').length, playing: window.__cine.playing, seen: localStorage.getItem('bloop-intro-' + location.search.match(/game=(\w+)/)[1]), canvases: document.querySelectorAll('canvas').length, game: eval(ok)() }), f.ok.toString());
    console.log('flow', g, JSON.stringify({ canvasesDuringIntro: gl0, ...st }), errs.slice(0, 6).join(' | '));
    await p.close();
  }
writeFileSync(`${OUT}/report-${ONLY.join('_')}.json`, JSON.stringify(report, null, 2));
await browser.close();
