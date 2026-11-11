// Desempenho: CPU 4× mais lenta, nível de gráficos Mínimo, FPS de cada jogo depois de abrir e mexer.
//   node scripts/qa/perf.mjs [id,id,...]
import * as q from './lib.mjs';

const only = process.argv[2] ? process.argv[2].split(',') : null;

(async () => {
  await q.ensureBaseState();
  const { page, cdp, ctx } = await q.open('pixel', { rotate: { portrait: [412, 915], landscape: [844, 390] } });
  await page.evaluate(() => localStorage.setItem('bo-quality', '0'));
  await page.reload();
  await q.waitHub(page);
  const ids = (await page.evaluate(() => window.__bloop.listGames().map((g) => g.id))).filter((id) => id !== 'orbit' && (!only || only.includes(id)));
  const out = [];
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  out.push({ id: 'hub', ...(await q.fps(page, 3000)) });
  console.log('hub', JSON.stringify(out[0]));
  for (const id of ids) {
    await page.evaluate((id) => void window.__bloop.launchGame(window.__bloop.listGames().find((g) => g.id === id)), id);
    let w = 0;
    while (w < 40000 && (await page.$('#game-host .gh-loading'))) { await page.waitForTimeout(250); w += 250; }
    await page.waitForTimeout(6000);
    const [W, H] = await page.evaluate(() => [innerWidth, innerHeight]);
    await q.tapAt(page, W / 2, H / 2);
    const holding = q.hold(cdp, [W * 0.14, H * 0.76], [W * 0.14, H * 0.6], 3000);
    const f = await q.fps(page, 3000);
    await holding;
    const f2 = await q.fps(page, 3000);
    const row = { id, fps: Math.min(f.fps, f2.fps), worstMs: Math.max(f.worstMs, f2.worstMs), w: W, h: H };
    out.push(row);
    console.log(id.padEnd(10), JSON.stringify(row));
    await q.shot(page, `perf-${id}`);
    await page.evaluate(() => window.__bloop.closeHost());
    await page.waitForTimeout(1500);
  }
  out.sort((a, b) => a.fps - b.fps);
  q.writeJSON('perf-report.json', out);
  console.log('\nPIORES:', out.slice(0, 6).map((r) => `${r.id} ${r.fps}fps`).join(', '));
  await ctx.close(); await q.closeBrowser();
})().catch(async (e) => { console.error(e); await q.closeBrowser(); process.exit(2); });
