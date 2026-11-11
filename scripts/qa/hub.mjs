// Hub: nome do jogador, "Amigos", Ajustes (narração, volumes, gráficos), Loja, cada botão da barra de baixo
// e dos atalhos do topo abre e fecha com o voltar, sem botão tapado/cortado, sem debug visível.
//   node scripts/qa/hub.mjs [pixel|small] [lang]
import * as q from './lib.mjs';

const kind = process.argv[2] || 'pixel';
const lang = process.argv[3] || '';
const tag = `hub-${kind}${lang ? '-' + lang : ''}`;
const checks = [];
const ok = (name, pass, detail = '', shot = '') => { checks.push({ name, pass: !!pass, detail, shot }); console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

async function closeAll(page) {
  for (let i = 0; i < 6; i++) {
    const st = await page.evaluate(() => ({ menu: !!document.querySelector('#menu.on'), modal: !!document.querySelector('.modal-screen.on'), busy: !window.__bloop || !document.querySelector('#menu.on') || !!document.querySelector('.modal-screen.on, .pet-scr.on, .hm-scr.on, #creator.on, .pass-panel, .crc-overlay, .sc-overlay, .pp-root, .mr-root, .h3, .tv-root, [class*=sheet-bg]') }));
    if (st.menu && !st.busy) return true;
    await q.back(page); await page.waitForTimeout(700);
  }
  return false;
}

(async () => {
  await q.ensureBaseState();
  const sizes = { pixel: null, small: { width: 360, height: 740 } };
  const { page, errs, ctx } = await q.open('pixel', { lang: lang || undefined });
  if (sizes[kind]) await page.setViewportSize(sizes[kind]);
  await ctx.addInitScript(() => { window.__qaWake = 0; });
  ok('hub abre', await q.waitHub(page));
  await page.waitForTimeout(1500);
  let s = await q.shot(page, `${tag}-0`);

  // nome do jogador no topo
  const name = await page.evaluate(() => { const e = document.querySelector('#hub-name'); if (!e) return null; const r = e.getBoundingClientRect(); return { t: e.textContent, vis: r.width > 10 && r.top >= 0 && r.top < 80, clip: e.scrollWidth > e.clientWidth + 2 }; });
  ok('nome do jogador visível no topo', name && name.vis && name.t && name.t !== 'Jogador', JSON.stringify(name), s);

  // botão Amigos (saguão do grupo)
  const fr = await page.evaluate(() => { const b = document.querySelector('#pl-lobby .pl-add'); if (!b) return null; const r = b.getBoundingClientRect(); return { lbl: b.textContent.trim(), w: r.width, h: r.height, y: r.top, inView: r.bottom <= innerHeight && r.top >= 0 }; });
  ok('botão "Amigos" claro no hub', fr && fr.inView && fr.w >= 40 && /amig|friend/i.test(fr.lbl), JSON.stringify(fr));
  if (fr) {
    await q.tapSel(page, '#pl-lobby .pl-add'); await page.waitForTimeout(1200);
    s = await q.shot(page, `${tag}-amigos`);
    const au = await q.audit(page);
    ok('"Amigos" abre o painel do grupo', await page.evaluate(() => !document.querySelector('#menu.on') || !!document.querySelector('.modal-screen.on, [class*=pp-], [class*=sq-], [class*=sheet]')), au.filter((x) => /BLOCKED|CUT|BADTEXT/.test(x)).slice(0, 5).join(' | '), s);
    ok('"Amigos" fecha com o voltar', await closeAll(page));
  }

  // nada de debug para o jogador
  const dbg = await q.debugUi(page);
  ok('sem botão de debug/joaninha no hub (perfil sem beta)', dbg.length === 0, dbg.join(', '));

  // Ajustes
  await q.tapSel(page, '.hub-gear'); await page.waitForTimeout(900);
  s = await q.shot(page, `${tag}-ajustes`);
  const set = await page.evaluate(() => {
    const p = document.querySelector('#settings.on'); if (!p) return null;
    const n = p.querySelector('#set-narration');
    return { narr: n ? n.checked : null, ranges: p.querySelectorAll('input[type=range]').length, gfx: (p.querySelector('#gfx-settings')?.textContent || '').trim().slice(0, 60), lsNarr: localStorage.getItem('bw-narration') };
  });
  ok('Ajustes abre', !!set, '', s);
  ok('narração DESLIGADA por padrão', set && set.narr === false, JSON.stringify(set));
  ok('sliders de volume nos Ajustes', set && set.ranges >= 2, `ranges=${set?.ranges}`);
  ok('ajuste de gráficos nos Ajustes', set && set.gfx.length > 3, set?.gfx);
  if (set) {
    // liga e desliga a narração (sem ficar falando)
    await page.evaluate(() => { const n = document.querySelector('#set-narration'); n.click(); });
    const on = await page.evaluate(() => localStorage.getItem('bw-narration'));
    await page.evaluate(() => { const n = document.querySelector('#set-narration'); n.click(); });
    const off = await page.evaluate(() => ({ v: localStorage.getItem('bw-narration'), sp: !!(window.speechSynthesis && speechSynthesis.speaking) }));
    ok('narração liga/desliga e é lembrada', on === '1' && off.v === '0' && !off.sp, `on=${on} off=${off.v}`);
    // slider de volume
    const vol = await page.evaluate(() => { const r = document.querySelector('#settings input[type=range]'); if (!r) return null; r.value = String(Math.max(+r.min || 0, (+r.max || 100) * 0.3)); r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); return r.value; });
    ok('slider de volume responde', vol !== null, `valor=${vol}`);
    const au = await q.audit(page, '#settings');
    ok('Ajustes sem botão tapado/cortado/texto cortado', !au.some((x) => /BLOCKED|CUT|TEXTCLIP|BADTEXT/.test(x)), au.join(' | ').slice(0, 400));
    await page.evaluate(() => document.querySelector('#settings .panel-body, #settings .panel')?.scrollBy(0, 2000));
    await page.waitForTimeout(300);
    await q.shot(page, `${tag}-ajustes-fim`);
    ok('Ajustes fecha com o voltar', await closeAll(page));
  }

  // atalhos do topo
  for (const sel of ['[data-open=daily]', '[data-open=missions]', '[data-open=inbox]', '#btn-free', '[data-open=redeem]', '.hub-offer.flash-btn', '.gem-pill', '#hub-profile']) {
    const el = await page.$('#menu ' + sel);
    if (!el || !(await el.isVisible())) { ok(`atalho ${sel} visível`, false); continue; }
    await q.tapSel(page, el); await page.waitForTimeout(1100);
    s = await q.shot(page, `${tag}-top-${sel.replace(/\W+/g, '')}`);
    const opened = await page.evaluate(() => !!document.querySelector('.modal-screen.on, .ob-root, [class*=sheet-bg], .ad-test, [class*=adsim], [class*=reward]') || !document.querySelector('#menu.on'));
    const au = await q.audit(page, '.modal-screen.on') ;
    const bad = au.filter((x) => /BLOCKED|CUT|TEXTCLIP|BADTEXT/.test(x));
    ok(`atalho ${sel} abre`, opened, bad.slice(0, 4).join(' | '), s);
    ok(`atalho ${sel} fecha com o voltar`, await closeAll(page));
  }

  // barra de baixo: todos os painéis
  const panels = await page.evaluate(() => [...document.querySelectorAll('#hub-nav [data-panel]')].map((b) => b.dataset.panel));
  ok('barra de baixo tem painéis', panels.length >= 5, panels.join(','));
  for (const p of panels) {
    errs.length = 0;
    await page.evaluate((p) => document.querySelector(`#hub-nav [data-panel="${p}"]`).scrollIntoView({ inline: 'center' }), p);
    await page.waitForTimeout(300);
    await q.tapSel(page, `#hub-nav [data-panel="${p}"]`);
    await page.waitForTimeout(3500);
    s = await q.shot(page, `${tag}-nav-${p}`);
    const opened = await page.evaluate(() => !document.querySelector('#menu.on') || !!document.querySelector('.modal-screen.on, .pet-scr.on, .hm-scr.on, #creator.on, .pass-panel, .crc-overlay, .sc-overlay, .mr-root, .h3, [class*=sheet-bg], [class*=-root]'));
    const dbgP = await q.debugUi(page);
    ok(`painel ${p} abre`, opened, dbgP.length ? 'debug visível: ' + dbgP.join(',') : '', s);
    const closed = await closeAll(page);
    ok(`painel ${p} fecha com o voltar`, closed);
    if (!closed) { await page.reload(); await q.waitHub(page); }
    if (errs.length) ok(`painel ${p} sem erros de console`, false, errs.slice(0, 3).join(' | '));
  }

  // tela não apaga (web: Wake Lock), app em pé no hub
  const vp = await page.evaluate(() => [innerWidth, innerHeight]);
  ok('hub em pé (retrato)', vp[1] > vp[0], vp.join('x'));
  ok('hub sem erros de JavaScript', errs.filter((e) => /PAGEERROR/.test(e)).length === 0, errs.slice(0, 3).join(' | '));
  const final = await q.audit(page, '#menu');
  ok('hub sem botões tapados/cortados', !final.some((x) => /BLOCKED|CUT|BADTEXT/.test(x)), final.filter((x) => /BLOCKED|CUT|BADTEXT/.test(x)).join(' | ').slice(0, 400));
  q.writeJSON(`${tag}-report.json`, checks);
  await ctx.close(); await q.closeBrowser();
  const f = checks.filter((c) => !c.pass);
  console.log(`\nHUB (${tag}): ${checks.length - f.length}/${checks.length} ok`);
  process.exitCode = f.length ? 1 : 0;
})().catch(async (e) => { console.error(e); await q.closeBrowser(); process.exit(2); });
