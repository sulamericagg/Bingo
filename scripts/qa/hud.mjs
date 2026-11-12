// HUD dos jogos 3D: em 740×360, 844×390 e 915×412 nenhum controle (pular, ação, mochila, câmera...) pode
// ficar em cima da barra de itens, das barras, do analógico ou de outro botão. Entra na partida de cada jogo
// pelo caminho de botões abaixo, mexe um pouco e mede as caixas (getBoundingClientRect) de tudo que é visível.
//   node scripts/qa/hud.mjs [id,id,...]
import * as q from './lib.mjs';

const SIZES = [[740, 360], [844, 390], [915, 412]];
// caminho de toques até a partida (regex do texto do botão, na ordem; os que não aparecem são pulados)
const ROUTES = {
  // telas de início padrão (src/ui/startmenu): cartões só escolhem; o JOGAR grande começa
  noites: ['^jogar'],
  mundo: ['novo mundo', '^jogar'],
  floresta: ['^3d', '^jogar'],
  garimpo: ['novo jogo', '^(começar|jogar|pular|ok)', '^(começar|jogar|pular|ok)'],
  cozinha: ['^3d', '^jogar', '^(jogar|começar)'],
  voo: ['^voar', 'embarcar|pular'],
  jangada: ['nova jangada|^continuar', '^(jogar|continuar)'],
  cavafala: ['restaurar a vila', '^jogar'],
  anomalias: ['turno da noite', '^jogar'],
  disaster: ['^3d', '^jogar'],
  desenho: [],
  studio: [],
};
const only = process.argv[2] ? process.argv[2].split(',') : null;

async function tapText(page, re) {
  const h = await page.evaluateHandle((re) => { const R = new RegExp(re, 'i'); return [...document.querySelectorAll('#game-host button, #game-host [role=button]')].find((b) => { const r = b.getBoundingClientRect(); return r.width > 4 && r.bottom <= innerHeight && R.test((b.textContent || b.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ')); }) || null; }, re);
  if (!(await h.evaluate((x) => !!x))) return false;
  await q.tapSel(page, h.asElement()); return true;
}

/** caixas de tudo que é controle ou HUD fixo; devolve pares que se sobrepõem */
function overlapsInPage() {
  const vis = (el) => { let p = el; while (p && p !== document.body) { const c = getComputedStyle(p); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity < 0.2) return false; p = p.parentElement; } return true; };
  const host = document.querySelector('#game-host .gh-root');
  if (!host) return { items: 0, pairs: [] };
  const sel = 'button, [role=button], .tc-joy.on .tc-ring, .tc-joy.idle .tc-ring, [class*=hot], [class*=slot], [class*=bar]:not([class*=scroll]), [class*=bag], [class*=meter], [class*=hearts], [class*=vitals]';
  let els = [...host.querySelectorAll(sel)].filter((e) => { const r = e.getBoundingClientRect(); return r.width >= 18 && r.height >= 18 && r.width < innerWidth * 0.8 && r.height < innerHeight * 0.6 && vis(e) && (getComputedStyle(e).pointerEvents !== 'none' || e.classList.contains('tc-ring') || !e.matches('button')); });
  // ignora telas/menus por cima (modais) — só HUD de jogo
  const over = (e) => { for (let p = e; p && p !== host; p = p.parentElement) if (p.matches('[class*=modal], [class*=sheet], [class*=menu]:not([class*=hud]), [class*=dialog], [class*=panel]:not([class*=hud])')) return true; return false; };
  els = els.filter((e) => !over(e));
  const name = (e) => (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : e.tagName) + (e.textContent ? ' "' + e.textContent.trim().replace(/\s+/g, ' ').slice(0, 14) + '"' : '');
  const pairs = [];
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
    const a = els[i], b = els[j];
    if (a.contains(b) || b.contains(a)) continue;
    // irmãos dentro da mesma barra (slots de um hotbar) não contam
    const ctrl = (e) => e.matches('button, [role=button], .tc-ring');
    if (!ctrl(a) && !ctrl(b)) continue;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (ix <= 4 || iy <= 4) continue;
    const area = ix * iy, small = Math.min(ra.width * ra.height, rb.width * rb.height);
    if (area < 120 && area < small * 0.08) continue;
    pairs.push(`${name(a)} × ${name(b)} (${Math.round(ix)}×${Math.round(iy)}px)`);
  }
  return { items: els.length, pairs: [...new Set(pairs)] };
}

(async () => {
  await q.ensureBaseState();
  const { page, cdp, ctx, errs } = await q.open('pixel', { rotate: { portrait: [412, 915], landscape: [844, 390] } });
  await q.waitHub(page);
  const ids = await page.evaluate(() => window.__bloop.listGames().map((g) => g.id));
  const res = [];
  for (const id of Object.keys(ROUTES)) {
    if (!ids.includes(id) || (only && !only.includes(id))) continue;
    if (await page.$('#game-host.on')) await page.evaluate(() => window.__bloop.closeHost());
    await page.setViewportSize({ width: 412, height: 915 }); await page.waitForTimeout(400);
    await page.evaluate((id) => void window.__bloop.launchGame(window.__bloop.listGames().find((g) => g.id === id)), id);
    let w = 0; while (w < 40000 && (await page.$('#game-host .gh-loading'))) { await page.waitForTimeout(250); w += 250; }
    await page.waitForTimeout(1500);
    for (let k = 0; k < 40 && (await page.$('.i3-root')); k++) { if (k === 4) await page.touchscreen.tap(30, 30).catch(() => {}); await page.waitForTimeout(400); } // intro 3D por cima
    await page.waitForTimeout(1500);
    for (const re of ROUTES[id]) { if (await tapText(page, re)) await page.waitForTimeout(3500); }
    await page.waitForTimeout(6000);
    const [W, H] = await page.evaluate(() => [innerWidth, innerHeight]);
    await q.hold(cdp, [W * 0.14, H * 0.76], [W * 0.14, H * 0.62], 1200); // mostra o analógico
    for (const [sw, sh] of SIZES) {
      await page.setViewportSize({ width: sw, height: sh }); await page.waitForTimeout(1300);
      const o = await page.evaluate(overlapsInPage);
      const shot = await q.shot(page, `hud-${id}-${sw}x${sh}`);
      res.push({ id, size: `${sw}x${sh}`, ...o, shot });
      console.log(`${o.pairs.length ? '✗' : '✓'} ${id.padEnd(10)} ${sw}x${sh} itens=${o.items}${o.pairs.length ? '\n    ' + o.pairs.slice(0, 8).join('\n    ') : ''}`);
    }
    if (errs.length) console.log('    E ' + errs.slice(0, 2).join(' | ').slice(0, 300));
    errs.length = 0;
  }
  q.writeJSON('hud-report.json', res);
  await ctx.close(); await q.closeBrowser();
  process.exitCode = res.some((r) => r.pairs.length) ? 1 : 0;
})().catch(async (e) => { console.error(e); await q.closeBrowser(); process.exit(2); });
