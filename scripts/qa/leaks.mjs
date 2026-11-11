// Vazamentos: abre e fecha jogos 10+ vezes e compara contextos WebGL vivos, canvas, nós do DOM,
// ouvintes de evento, heap e contextos de áudio rodando com o início.
//   node scripts/qa/leaks.mjs [rodadas]
import * as q from './lib.mjs';

const ROUNDS = +(process.argv[2] || 10);
const CYCLE = (process.env.QA_LEAK_GAMES || 'cozinha,noites,floresta,disaster,voo,garimpo,cavafala,jangada,anomalias,desenho,montaleva,tubo,rally,band').split(',');

async function launchAndExit(page, id) {
  await page.evaluate((id) => void window.__bloop.launchGame(window.__bloop.listGames().find((g) => g.id === id)), id);
  let w = 0;
  while (w < 25000 && (await page.$('#game-host .gh-loading'))) { await page.waitForTimeout(250); w += 250; }
  await page.waitForTimeout(5000);
  await page.evaluate(() => window.__bloop.ui.back()); await page.waitForTimeout(500);
  const exit = await page.$('.gh-confirm.on [data-gh=exit]');
  if (exit) await q.tapSel(page, exit); else await page.evaluate(() => window.__bloop.closeHost());
  await page.waitForTimeout(2000);
}

(async () => {
  await q.ensureBaseState();
  const { page, errs, cdp, ctx } = await q.open('pixel', { rotate: { portrait: [412, 915], landscape: [844, 390] } });
  await cdp.send('Performance.enable');
  await q.waitHub(page);
  const series = [];
  const base = await q.resources(page, cdp);
  base.audio = await page.evaluate(() => window.__qaAudio?.());
  series.push({ round: 0, game: '-', ...base });
  console.log('base', JSON.stringify(base));
  for (let i = 1; i <= ROUNDS; i++) {
    const id = CYCLE[(i - 1) % CYCLE.length];
    await launchAndExit(page, id);
    const r = await q.resources(page, cdp);
    r.audio = await page.evaluate(() => window.__qaAudio?.());
    series.push({ round: i, game: id, ...r });
    console.log(i, id, JSON.stringify(r));
  }
  // mesmo jogo 5x seguidas (acúmulo no mesmo módulo)
  const same = process.env.QA_LEAK_SAME || 'cozinha';
  for (let i = 1; i <= 5; i++) {
    await launchAndExit(page, same);
    const r = await q.resources(page, cdp);
    r.audio = await page.evaluate(() => window.__qaAudio?.());
    series.push({ round: 'same' + i, game: same, ...r });
    console.log('same', i, same, JSON.stringify(r));
  }
  const last = series[series.length - 1];
  const verdict = {
    glLeak: last.glLive - base.glLive,
    canvasLeak: last.canvases - base.canvases,
    nodeGrowth: last.nodes - base.nodes,
    listenerGrowth: (last.listeners || 0) - (base.listeners || 0),
    heapGrowthMB: last.heapMB - base.heapMB,
    audioRunning: last.audio?.running,
    errors: errs.slice(0, 20),
  };
  q.writeJSON('leaks-report.json', { series, verdict });
  console.log('VEREDITO', JSON.stringify(verdict, null, 1));
  await ctx.close(); await q.closeBrowser();
  const bad = verdict.glLeak > 0 || verdict.canvasLeak > 2 || verdict.heapGrowthMB > 60 || verdict.listenerGrowth > 400;
  process.exitCode = bad ? 1 : 0;
})().catch(async (e) => { console.error(e); await q.closeBrowser(); process.exit(2); });
