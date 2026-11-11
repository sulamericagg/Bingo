/**
 * Teste de fluxo do Bloop no Lugar (Playwright, celular Pixel 7 + tablet 800×1280, toque).
 *   npx vite --port 5212 &
 *   node scripts/dev/test-lugar.mjs [http://localhost:5212] [pasta-das-fotos]
 * Resolve uma fase com toques e arrasto, perde um coração, usa dica, fica sem corações e vê a vitória.
 * Falha (exit 1) se algum passo não der certo.
 */
import { createRequire } from 'module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
let pw;
try {
  pw = require('playwright');
} catch {
  pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
}
const base = process.argv[2] || 'http://localhost:5212';
const out = process.argv[3] || '/tmp/lugar-shots';
fs.mkdirSync(out, { recursive: true });
const b = await pw.chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const fails = [];
const ok = (cond, msg) => {
  console.log((cond ? '  ok  ' : '  FAIL ') + msg);
  if (!cond) fails.push(msg);
};
const waitFor = async (p, fn, ms = 20000, arg) => {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if (await p.evaluate(fn, arg).catch(() => false)) return true;
    await p.waitForTimeout(150);
  }
  return false;
};

async function open(ctxOpts, lugarSave) {
  const ctx = await b.newContext({ ...ctxOpts, hasTouch: true, locale: 'pt-BR' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => fails.push('pageerror: ' + e));
  p.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource|adsbygoogle|net::/.test(m.text()) && console.log('   [console]', m.text().slice(0, 200)));
  await p.addInitScript((ls) => {
    if (sessionStorage.getItem('lg-init')) return;
    sessionStorage.setItem('lg-init', '1');
    localStorage.setItem('bw-intro', '0');
    localStorage.setItem('bo-lang', 'pt');
    localStorage.setItem('bw-profile-v1', JSON.stringify({ onboarded: true, nick: 'Teste', handle: '', handleStatus: 'none', beta: false, betaSince: 0 }));
    if (ls) localStorage.setItem('bw-lugar', JSON.stringify(ls));
  }, lugarSave ?? null);
  await p.goto(`${base}/?debug`);
  await waitFor(p, () => !!window.__bloop && window.__bloop.listGames().some((g) => g.id === 'lugar'));
  await p.evaluate(() => window.__bloop.launchGame(window.__bloop.listGames().find((g) => g.id === 'lugar')));
  ok(await waitFor(p, () => !!document.querySelector('.lg-home')), 'abre o jogo no hub');
  await p.waitForTimeout(500);
  return { p, ctx };
}
const shot = (p, name) => p.screenshot({ path: `${out}/${name}.png` });
const st = (p) =>
  p.evaluate(() => {
    const g = window.__lugar;
    return { n: g.pz?.n, sol: g.pz?.sol, cells: g.cells ? [...g.cells] : [], hearts: g.hearts, running: g.running, won: g.won, hintsUsed: g.hintsUsed, mistakes: g.mistakes };
  });
const cellPt = (p, c) => p.evaluate((c) => window.__lugar.board.cellPage(c), c);
async function tapCell(p, c) {
  const [x, y] = await cellPt(p, c);
  await p.touchscreen.tap(x, y);
  await p.waitForTimeout(60);
}
/** arrasto com eventos de ponteiro de toque (pointerType touch) */
async function drag(p, from, to) {
  const a = await cellPt(p, from);
  const z = await cellPt(p, to);
  await p.evaluate(
    ([a, z]) => {
      const cv = document.querySelector('.lg-canvas');
      const ev = (type, x, y) => cv.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: true, button: 0 }));
      ev('pointerdown', a[0], a[1]);
      for (let i = 1; i <= 12; i++) ev('pointermove', a[0] + ((z[0] - a[0]) * i) / 12, a[1] + ((z[1] - a[1]) * i) / 12);
      ev('pointerup', z[0], z[1]);
    },
    [a, z],
  );
  await p.waitForTimeout(100);
}
async function placeBloop(p, c) {
  // modo padrão: vazio → X → Bloop
  const s = await st(p);
  if (s.cells[c] === 0) await tapCell(p, c);
  await tapCell(p, c);
}

/* ---------------- 1) celular: tutorial, partida, erro, dica, vitória ---------------- */
console.log('celular (Pixel 7)');
{
  const { p, ctx } = await open({ ...pw.devices['Pixel 7'] });
  await p.waitForTimeout(3500);
  await shot(p, '01-inicio');
  await p.click('[data-a=play]');
  ok(await waitFor(p, () => !!document.querySelector('.lg-how')), 'tutorial aparece na 1ª fase');
  await p.waitForTimeout(1400);
  await shot(p, '02-como-jogar');
  await p.click('.lg-how [data-a=ok]');
  ok(await waitFor(p, () => !!document.querySelector('.lg-canvas') && !!window.__lugar?.pz), 'fase 1 começa');
  await p.waitForTimeout(400);
  let s = await st(p);
  const n = s.n;
  const solCells = s.sol.map((k, r) => r * n + k);
  // arrasto: risca a última linha inteira menos o Bloop dela
  const r = n - 1;
  const bloopK = s.sol[r];
  const runFrom = bloopK > 1 ? r * n : r * n + bloopK + 1;
  const runTo = bloopK > 1 ? r * n + bloopK - 1 : r * n + n - 1;
  await drag(p, runFrom, runTo);
  s = await st(p);
  const marked = s.cells.slice(runFrom, runTo + 1).filter((v) => v === 1).length;
  ok(marked === runTo - runFrom + 1, `arrasto risca ${runTo - runFrom + 1} casas (${marked})`);
  // erro: Bloop numa casa errada (segurar = Bloop direto)
  const wrong = [...Array(n * n).keys()].find((c) => !solCells.includes(c) && s.cells[c] === 0);
  const [wx, wy] = await cellPt(p, wrong);
  await p.evaluate(([x, y]) => {
    const cv = document.querySelector('.lg-canvas');
    cv.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: true, button: 0 }));
  }, [wx, wy]);
  await p.waitForTimeout(600);
  await p.evaluate(([x, y]) => {
    document.querySelector('.lg-canvas').dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: true, button: 0 }));
  }, [wx, wy]);
  await p.waitForTimeout(250);
  s = await st(p);
  ok(s.hearts === 2 && s.mistakes === 1, 'Bloop no lugar errado custa 1 coração');
  await shot(p, '03-perdeu-coracao');
  await p.waitForTimeout(800);
  // dica
  await p.click('[data-a=hint]');
  ok(await waitFor(p, () => !document.querySelector('.lg-hintcard').hidden), 'dica abre com explicação');
  const hintTxt = await p.textContent('.lg-hintcard p');
  console.log('   dica:', hintTxt);
  await p.waitForTimeout(400);
  await shot(p, '04-dica');
  await p.click('.lg-hintcard [data-a=apply]');
  s = await st(p);
  ok(s.hintsUsed === 1, 'dica contada');
  // põe os Bloops que faltam
  await p.waitForTimeout(300);
  for (let i = 0; i < n; i++) {
    s = await st(p);
    if (s.won) break;
    const c = solCells[i];
    if (s.cells[c] !== 3) await placeBloop(p, c);
    if (i === 2) {
      await p.waitForTimeout(250);
      await shot(p, '05-meio-da-fase');
    }
  }
  ok(await waitFor(p, () => window.__lugar.won), 'fase resolvida');
  await p.waitForTimeout(700);
  await shot(p, '06-festa');
  ok(await waitFor(p, () => !!document.querySelector('.lg-wincard')), 'tela de vitória');
  await p.waitForTimeout(1300);
  await shot(p, '07-vitoria');
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('bw-lugar')));
  ok(saved.unlocked === 1 && saved.stars[0] & 8, 'progresso salvo (fase 2 liberada)');
  // fase 2: fica sem corações
  await p.click('.lg-wincard [data-a=next]');
  ok(await waitFor(p, () => window.__lugar?.pz && window.__lugar.idx === 1 && window.__lugar.running), 'fase 2 começa');
  await p.waitForTimeout(300);
  for (let k = 0; k < 3; k++) {
    s = await st(p);
    const sc = s.sol.map((kk, rr) => rr * s.n + kk);
    const w = [...Array(s.n * s.n).keys()].find((c) => !sc.includes(c) && s.cells[c] === 0);
    await placeBloop(p, w);
    await p.waitForTimeout(250);
  }
  ok(await waitFor(p, () => !!document.querySelector('.lg-sadcard')), 'sem corações: tela do Bloop triste');
  await p.waitForTimeout(900);
  await shot(p, '08-sem-coracoes');
  ok(await p.isVisible('.lg-sadcard [data-a=ad]'), 'botão "Ganhar 3 corações"');
  await p.click('.lg-sadcard [data-a=restart]');
  s = await st(p);
  ok(s.hearts === 3 && s.running, 'recomeçar devolve 3 corações');
  await ctx.close();
}

/* ---------------- 2) tablet: mapa, padrões, desafio do dia, zen ---------------- */
console.log('tablet 800×1280');
{
  const stars = {};
  for (let i = 0; i < 26; i++) stars[i] = 8 | (i % 3 === 0 ? 7 : i % 3 === 1 ? 3 : 1);
  const { p, ctx } = await open({ viewport: { width: 800, height: 1280 }, deviceScaleFactor: 1.5 }, { v: 1, unlocked: 26, stars, times: {}, solved: 26, tutorial: true, patterns: true, autoX: true, input: 'cycle', zenSize: 10, prog: null, dailyDay: 0, dailyStreak: 0, dailyBestStreak: 0, dailyTime: 0, hintDay: 0, hintUsed: 0, hintBonus: 0, infinite: false, zenSolved: 0 });
  await shot(p, '10-tablet-inicio');
  await p.click('[data-a=map]');
  ok(await waitFor(p, () => !!document.querySelector('.lg-map')), 'mapa de fases');
  await p.waitForTimeout(400);
  await shot(p, '11-tablet-mapa');
  await p.click('.lg-node.cur', { force: true });
  ok(await waitFor(p, () => window.__lugar?.pz && window.__lugar.idx === 26), 'abre a fase atual pelo mapa');
  await p.waitForTimeout(300);
  // põe 3 Bloops certos (auto-X) e mostra os padrões
  let s = await st(p);
  for (let i = 0; i < 3; i++) await placeBloop(p, i * s.n + s.sol[i]);
  await p.waitForTimeout(900);
  await shot(p, '12-tablet-partida-padroes');
  await p.click('[data-a=hint]');
  await p.waitForTimeout(500);
  console.log('   dica:', await p.textContent('.lg-hintcard p'));
  await shot(p, '13-tablet-dica');
  await p.click('.lg-hintcard [data-a=ok]');
  await p.click('[data-a=settings]');
  await p.waitForTimeout(300);
  await shot(p, '14-tablet-ajustes');
  await p.click('.lg-sheet [data-a=done]');
  await p.click('[data-a=menu]');
  await p.click('.lg-sheet [data-a=out]');
  await waitFor(p, () => !!document.querySelector('.lg-map'));
  await p.click('[data-a=back]');
  await waitFor(p, () => !!document.querySelector('.lg-home'));
  await p.click('[data-a=daily]');
  ok(await waitFor(p, () => window.__lugar?.mode === 'daily' && window.__lugar.running), 'desafio do dia abre');
  await p.waitForTimeout(500);
  await shot(p, '15-tablet-desafio-do-dia');
  // resolve o desafio do dia
  s = await st(p);
  for (let i = 0; i < s.n; i++) await placeBloop(p, i * s.n + s.sol[i]);
  ok(await waitFor(p, () => !!document.querySelector('.lg-wincard')), 'desafio do dia resolvido');
  await p.waitForTimeout(1400);
  await shot(p, '16-tablet-vitoria-dia');
  const sv = await p.evaluate(() => JSON.parse(localStorage.getItem('bw-lugar')));
  ok(sv.dailyStreak === 1, 'sequência do desafio do dia = 1');
  await p.click('.lg-wincard [data-a=out]');
  await waitFor(p, () => !!document.querySelector('.lg-home'));
  await p.click('[data-a=zen]');
  await p.click('[data-a=go]');
  ok(await waitFor(p, () => window.__lugar?.mode === 'zen' && window.__lugar.running, 30000), 'zen abre (10×10)');
  s = await st(p);
  // no zen um Bloop errado não custa coração: só fica destacado
  const sc = s.sol.map((k, r) => r * s.n + k);
  await placeBloop(p, sc[0]);
  await placeBloop(p, sc[0] + 1 < s.n ? sc[0] + 1 : sc[0] - 1);
  s = await st(p);
  ok(s.cells.filter((v) => v === 3).length === 2, 'zen aceita Bloop em conflito (sem coração)');
  await p.waitForTimeout(600);
  await shot(p, '17-tablet-zen-conflito');
  await ctx.close();
}

await b.close();
console.log(fails.length ? `\n${fails.length} falha(s)` : '\ntudo certo');
process.exit(fails.length ? 1 : 0);
