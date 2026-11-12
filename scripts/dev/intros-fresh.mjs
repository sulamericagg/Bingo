// Aberturas (docs/INTROS.md): jogo novo → abertura; continuar → nada; apagar + novo → abertura de novo.
//   node scripts/dev/intros-fresh.mjs [jangada,noites,garimpo,tycoon]   (vite preview em :5310 ou QA_URL)
import * as q from '../qa/lib.mjs';

const only = process.argv[2] ? process.argv[2].split(',') : ['jangada', 'noites', 'garimpo', 'tycoon'];
const SEL = '.cine-root, .i2-root, .gbi-root';
const results = [];
const wait = (p, ms) => p.waitForTimeout(ms);

async function until(page, fn, arg, ms = 15000, step = 250) {
  for (let t = 0; t < ms; t += step) {
    const v = await page.evaluate(fn, arg).catch(() => null);
    if (v) return v;
    await wait(page, step);
  }
  return null;
}
const count = (page) => page.evaluate(() => window.__introLog.length);
async function launch(page, id) {
  if (await page.$('#game-host.on')) await page.evaluate(() => window.__bloop.closeHost());
  await wait(page, 600);
  await page.evaluate((id) => window.__bloop.launchGame(window.__bloop.listGames().find((g) => g.id === id)), id);
  for (let k = 0; k < 40 && (await page.$('.i3-root')); k++) { if (k === 4) await page.touchscreen.tap(30, 30).catch(() => {}); await wait(page, 400); }
  await until(page, () => !!document.querySelector('#game-host .sm-root, #game-host .sm-page, #game-host .sm-play'), null, 30000);
  await wait(page, 800);
}
/** clica no último elemento visível que casa com o seletor */
const click = (page, sel) =>
  page.evaluate((sel) => {
    const els = [...document.querySelectorAll(sel)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(e).visibility !== 'hidden'; });
    const e = els[els.length - 1];
    if (!e) return false;
    e.click();
    return true;
  }, sel);
/** espera abrir uma abertura nova; pula; devolve true se abriu */
async function expectIntro(page, n0, skip) {
  const ok = await until(page, (n) => window.__introLog.length > n, n0, 15000);
  if (ok) {
    await wait(page, 1500);
    await page.evaluate(skip).catch(() => {});
    await until(page, (s) => !document.querySelector(s), SEL, 15000);
  }
  return !!ok;
}
async function noIntro(page, n0, ms = 7000) {
  await wait(page, ms);
  return (await count(page)) === n0;
}

(async () => {
  await q.ensureBaseState();
  const { page, errs, ctx } = await q.open('land844', { q: '&intro=1' });
  await ctx.addInitScript((sel) => {
    window.__introLog = [];
    new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.matches(sel)) window.__introLog.push(n.className); }).observe(document, { childList: true, subtree: true });
  }, SEL);
  await page.reload({ waitUntil: 'load' });
  if (!(await q.waitHub(page))) throw new Error('hub não abriu');
  // o dono já tinha visto as aberturas antes (é o caso que falhava)
  await page.evaluate(() => {
    for (const k of ['bloop-intro-jangada', 'bloop-intro-noites', 'bw-intro2.tycoon']) localStorage.setItem(k, '1');
    for (const k of Object.keys(localStorage)) if (/^bw-jangada|^noites-run|garimpo|^gb[-.]/i.test(k)) localStorage.removeItem(k);
    const s = window.__bloop.save; if (s.tycoon) s.tycoon.last = 0;
  });

  for (const id of only) {
    const r = { id, steps: {} };
    try {
      await launch(page, id);
      if (id === 'jangada') {
        const skip = () => window.__cine.skip();
        const newRaft = async () => {
          const n = await count(page);
          await click(page, '.sm-slot.sel');
          await wait(page, 800);
          await click(page, '.sm-play');
          const ok = await expectIntro(page, n, skip);
          await until(page, () => window.__jangada.world(), null, 30000);
          return ok;
        };
        r.steps.newSlot = await newRaft();
        await wait(page, 1500);
        await page.evaluate(() => { window.__jangada.save(); window.__jangada.menu(); });
        await wait(page, 1200);
        let n = await count(page);
        r.steps.slotHasWorld = await page.evaluate(() => !!document.querySelector('.sm-slot.sel:not(.empty)'));
        await click(page, '.sm-play'); // Continuar
        r.steps.continueNoIntro = await noIntro(page, n);
        r.steps.continueStarted = !!(await page.evaluate(() => !!window.__jangada.world()));
        await page.evaluate(() => window.__jangada.menu());
        await wait(page, 1200);
        await click(page, '.sm-slot.sel .sm-del');
        await wait(page, 500);
        await click(page, '.sm-yes');
        await wait(page, 800);
        r.steps.slotEmptyAfterDelete = await page.evaluate(() => !!document.querySelector('.sm-slot.sel.empty'));
        r.steps.deleteThenNew = await newRaft();
        await page.evaluate(() => window.__jangada.menu());
      } else if (id === 'noites') {
        const skip = () => window.__cine.skip();
        let n = await count(page);
        await click(page, '.sm-play'); // sem partida: JOGAR = partida nova
        r.steps.newGame = await expectIntro(page, n, skip);
        r.steps.started = !!(await until(page, () => !!window.__noites.sim, null, 30000));
        await wait(page, 2000);
        await page.evaluate(() => window.__noites.finish(true));
        await wait(page, 1500);
        r.steps.hasRun = await page.evaluate(() => !!localStorage.getItem('noites-run'));
        n = await count(page);
        await click(page, '.sm-play'); // Continuar
        r.steps.continueNoIntro = await noIntro(page, n);
        r.steps.continueStarted = !!(await page.evaluate(() => !!window.__noites.sim));
        await page.evaluate(() => window.__noites.finish(true));
        await wait(page, 1500);
        n = await count(page);
        await click(page, '.sm-card'); // "Nova partida" (descarta a salva)
        r.steps.discardThenNew = await expectIntro(page, n, skip);
        await until(page, () => !!window.__noites.sim, null, 30000);
        await page.evaluate(() => window.__noites.finish(true));
      } else if (id === 'garimpo') {
        const skip = () => window.__gbIntro?.finish();
        const newGame = async () => {
          const n = await count(page);
          await click(page, '.sm-slot.sel');
          await wait(page, 800);
          await click(page, '.sm-play');
          const ok = await expectIntro(page, n, skip);
          await until(page, () => !!window.__garimpo?.sv, null, 30000);
          return ok;
        };
        r.steps.newSlot = await newGame();
        await wait(page, 1500);
        await page.evaluate(() => { window.__garimpo.leave(); window.__garimpo.menu(); });
        await wait(page, 1200);
        let n = await count(page);
        await click(page, '.sm-play'); // Continuar
        r.steps.continueNoIntro = await noIntro(page, n, 9000);
        r.steps.continueStarted = !!(await page.evaluate(() => !!window.__garimpo.sv));
        await page.evaluate(() => { window.__garimpo.leave(); window.__garimpo.menu(); });
        await wait(page, 1200);
        await click(page, '.sm-slot.sel .sm-del');
        await wait(page, 500);
        await click(page, '.sm-yes');
        await wait(page, 800);
        r.steps.slotEmptyAfterDelete = await page.evaluate(() => !!document.querySelector('.sm-slot.sel.empty'));
        r.steps.deleteThenNew = await newGame();
        await page.evaluate(() => { window.__garimpo.leave(); window.__garimpo.menu(); });
      } else if (id === 'tycoon') {
        const skip = () => window.__intro2?.finish();
        let n = await count(page);
        await click(page, '.sm-card'); // Minha Fábrica (nova: last = 0)
        r.steps.newFactory = await expectIntro(page, n, skip);
        await wait(page, 2500);
        r.steps.inaugurated = await page.evaluate(() => window.__bloop.save.tycoon.last > 0);
        await page.evaluate(() => window.__bloop.closeHost());
        await launch(page, id);
        n = await count(page);
        await click(page, '.sm-card');
        r.steps.existingNoIntro = await noIntro(page, n, 5000);
      }
    } catch (e) {
      r.error = String(e).slice(0, 300);
    }
    r.errors = errs.splice(0).slice(0, 5);
    r.pass = !r.error && Object.values(r.steps).every((v) => v === true);
    results.push(r);
    console.log(JSON.stringify(r));
    await q.shot(page, `fresh-${id}`);
  }
  await ctx.close();
  await q.closeBrowser();
  console.log(results.every((r) => r.pass) ? 'ALL PASS' : 'SOME FAIL');
})();
