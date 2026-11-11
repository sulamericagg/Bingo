// Cenas específicas dos pedidos do dono (docs/DONO-PEDIDOS.md): abre o jogo, chega no ponto e tira print.
//   node scripts/qa/deep.mjs [cena,cena...]   cenas: garimpo, cinema, tv, cozinha, noites, anomalias, voo, mundo, desastre, jangada, cavafala
import * as q from './lib.mjs';

const only = process.argv[2] ? process.argv[2].split(',') : null;
const out = [];
const note = (scene, what, pass, shot = '', detail = '') => { out.push({ scene, what, pass, shot, detail }); console.log(`${pass === true ? '✓' : pass === false ? '✗' : '•'} [${scene}] ${what}${detail ? ' — ' + detail : ''}${shot ? ' (' + shot + ')' : ''}`); };

async function launch(page, id) {
  if (await page.$('#game-host.on')) await page.evaluate(() => window.__bloop.closeHost());
  await page.setViewportSize({ width: 412, height: 915 });
  await page.waitForTimeout(500);
  await page.evaluate((id) => void window.__bloop.launchGame(window.__bloop.listGames().find((g) => g.id === id)), id);
  let w = 0;
  while (w < 40000 && (await page.$('#game-host .gh-loading'))) { await page.waitForTimeout(250); w += 250; }
  await page.waitForTimeout(3000);
}
async function tapText(page, re, root = '#game-host') {
  const h = await page.evaluateHandle(({ re, root }) => { const R = new RegExp(re, 'i'); return [...document.querySelectorAll(root + ' button, ' + root + ' [role=button]')].find((b) => { const r = b.getBoundingClientRect(); return r.width > 4 && r.bottom <= innerHeight && R.test((b.textContent || b.getAttribute('aria-label') || '').trim()); }) || null; }, { re, root });
  if (!(await h.evaluate((x) => !!x))) return false;
  await q.tapSel(page, h.asElement()); return true;
}
const exit = (page) => page.evaluate(() => window.__bloop.closeHost());

const scenes = {
  async garimpo(page, cdp) {
    await launch(page, 'garimpo');
    for (let i = 0; i < 4; i++) { if (!(await tapText(page, '^(jogar|novo|começar|continuar|sozinho|garimpar|bora|ok|entrar)'))) break; await page.waitForTimeout(3000); }
    await page.waitForTimeout(4000);
    const [W, H] = await page.evaluate(() => [innerWidth, innerHeight]);
    const st = await page.evaluate(() => { const g = window.__garimpo; const c = g?.cur; return { view: g?.curView?.(), held: c?.held, worker: c?.constructor?.name }; });
    note('garimpo', 'estado a pé', null, '', JSON.stringify(st));
    await q.drag(cdp, [W * 0.6, H * 0.5], [W * 0.95, H * 0.5], 12, 25, 3); // vira para o campo aberto
    await q.hold(cdp, [W * 0.14, H * 0.76], [W * 0.14, H * 0.6], 4000);
    note('garimpo', '1ª pessoa empurrando o carrinho (caçamba no terço de baixo, caminho visível)', null, await q.shot(page, 'deep-garimpo-fp'));
    for (const v of ['tp', 'front']) {
      await q.tapSel(page, '.gb-cam'); await page.waitForTimeout(1800);
      note('garimpo', `câmera ${v}`, null, await q.shot(page, `deep-garimpo-${v}`));
    }
    await q.tapSel(page, '.gb-cam'); await page.waitForTimeout(800);
    // larga e pega o carrinho
    const bar = await page.$('.gb-barrow, [data-k=barrow], .gb-b.gb-bar');
    if (bar) { await q.tapSel(page, bar); await page.waitForTimeout(1500); note('garimpo', 'largou o carrinho', null, await q.shot(page, 'deep-garimpo-drop')); await q.tapSel(page, bar); await page.waitForTimeout(1500); }
    await page.setViewportSize({ width: 740, height: 360 }); await page.waitForTimeout(1200);
    note('garimpo', 'HUD 740×360', null, await q.shot(page, 'deep-garimpo-740'), (await q.audit(page, '#game-host')).filter((x) => /OVERLAP|CUT|BLOCKED/.test(x)).slice(0, 6).join(' | '));
    await exit(page);
  },
  async cinema(page) {
    await launch(page, 'cinema');
    note('cinema', 'abertura', null, await q.shot(page, 'deep-cinema-0'));
    await tapText(page, 'criar filme|criar história'); await page.waitForTimeout(2500);
    note('cinema', 'Criar história (em pé)', null, await q.shot(page, 'deep-cinema-story'));
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => { const c = [...document.querySelectorAll('.kid-card')]; c.slice(0, 2).forEach((x) => x.click()); });
      await page.waitForTimeout(600);
      if (!(await tapText(page, 'próximo'))) break; await page.waitForTimeout(1500);
    }
    note('cinema', 'Criar história: falas', null, await q.shot(page, 'deep-cinema-beats'));
    await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(1200);
    const cover = await page.evaluate(() => { const f = document.querySelector('.kid-foot .kid-big'); const c = document.querySelector('.kid-beat'); if (!f || !c) return null; const a = f.getBoundingClientRect(), b = c.getBoundingClientRect(); const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left), iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); return ix > 2 && iy > 2; });
    note('cinema', '"Fazer o filme!" não cobre o 1º cartão (deitado 844×390)', cover === false, await q.shot(page, 'deep-cinema-beats-land'), `cobre=${cover}`);
    await exit(page);
  },
  async tv(page) {
    await page.setViewportSize({ width: 412, height: 915 });
    await page.evaluate(() => document.querySelector('#hub-nav [data-panel="tv"]')?.click());
    await page.waitForTimeout(6000);
    note('tv', 'TV Bloop (em pé)', null, await q.shot(page, 'deep-tv'));
    const ov = await page.evaluate(() => { const o = document.querySelector('.tv-over'); const st = document.querySelector('.tv-stage'); if (!o || o.hidden || !st) return null; const a = o.getBoundingClientRect(), s = st.getBoundingClientRect(); return { right: s.right - a.right, bottom: s.bottom - a.bottom, top: a.top - s.top }; });
    note('tv', 'contador de tempo longe da marca "Feito no Bloop World" (canto de baixo à direita)', ov ? ov.bottom > 40 : null, '', JSON.stringify(ov));
    const n = await page.evaluate(() => document.querySelectorAll('.tv-cat-it').length);
    await tapText(page, 'catálogo|filmes|todos', '.tv-root'); await page.waitForTimeout(2500);
    const n2 = await page.evaluate(() => document.querySelectorAll('.tv-cat-it').length);
    note('tv', 'TV cheia de filmes (~100)', Math.max(n, n2) >= 80, await q.shot(page, 'deep-tv-catalogo'), `filmes no catálogo=${Math.max(n, n2)}`);
    await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(1500);
    note('tv', 'TV deitada', null, await q.shot(page, 'deep-tv-land'));
    for (let i = 0; i < 4; i++) { await q.back(page); await page.waitForTimeout(600); }
    await page.setViewportSize({ width: 412, height: 915 });
  },
  async cozinha(page, cdp) {
    await launch(page, 'cozinha');
    await page.waitForTimeout(4000);
    const btns = await page.evaluate(() => [...document.querySelectorAll('#game-host button')].filter((b) => b.getBoundingClientRect().width > 4).map((b) => (b.textContent || b.getAttribute('aria-label') || b.className).trim().slice(0, 20)));
    note('cozinha', 'botões na tela', null, await q.shot(page, 'deep-cozinha-0'), btns.join(' | '));
    await page.setViewportSize({ width: 740, height: 360 }); await page.waitForTimeout(1200);
    note('cozinha', 'HUD 740×360', null, await q.shot(page, 'deep-cozinha-740'), (await q.audit(page, '#game-host')).filter((x) => /OVERLAP|CUT|BLOCKED/.test(x)).slice(0, 6).join(' | '));
    await exit(page);
  },
  async noites(page, cdp) {
    await launch(page, 'noites');
    await tapText(page, '^sozinho'); await page.waitForTimeout(6000);
    note('noites', '1ª pessoa / HUD', null, await q.shot(page, 'deep-noites-0'));
    const [W, H] = await page.evaluate(() => [innerWidth, innerHeight]);
    await q.hold(cdp, [W * 0.14, H * 0.76], [W * 0.14, H * 0.55], 2500);
    note('noites', 'andando', null, await q.shot(page, 'deep-noites-walk'));
    await page.setViewportSize({ width: 740, height: 360 }); await page.waitForTimeout(1200);
    note('noites', 'HUD 740×360', null, await q.shot(page, 'deep-noites-740'), (await q.audit(page, '#game-host')).filter((x) => /OVERLAP|CUT|BLOCKED/.test(x)).slice(0, 6).join(' | '));
    await exit(page);
  },
  async anomalias(page) {
    await launch(page, 'anomalias');
    note('anomalias', 'menu (5 lugares + modos)', null, await q.shot(page, 'deep-anomalias-0'));
    const txt = await page.evaluate(() => document.querySelector('#game-host')?.innerText || '');
    const places = ['Hospital', 'Creche', 'Cabana', 'Lanchonete', 'Posto'].filter((p) => new RegExp(p, 'i').test(txt));
    const modes = ['Recepção', 'Corredor'].filter((p) => new RegExp(p, 'i').test(txt));
    note('anomalias', '5 lugares e modos Recepção/Corredor no menu', places.length === 5 && modes.length === 2, '', `lugares=${places.join(',')} modos=${modes.join(',')}`);
    const music = await page.evaluate(() => window.__qaAudio?.());
    note('anomalias', 'áudio', null, '', JSON.stringify(music));
    await exit(page);
  },
  async voo(page) {
    await launch(page, 'voo');
    await tapText(page, '^voar'); await page.waitForTimeout(3000);
    note('voo', 'pasta de missão', null, await q.shot(page, 'deep-voo-brief'));
    await q.back(page); await page.waitForTimeout(800);
    const conf = await page.evaluate(() => !!document.querySelector('.gh-confirm.on') && !!document.querySelector('#game-host.on'));
    note('voo', 'voltar na pasta de missão pergunta "Sair do jogo?" (não sai direto)', conf, await q.shot(page, 'deep-voo-brief-back'));
    await q.back(page); await page.waitForTimeout(600);
    await tapText(page, 'embarcar|pular'); await page.waitForTimeout(9000);
    note('voo', 'voo em andamento (HUD)', null, await q.shot(page, 'deep-voo-fly'));
    await page.setViewportSize({ width: 740, height: 360 }); await page.waitForTimeout(1500);
    note('voo', 'HUD 740×360', null, await q.shot(page, 'deep-voo-740'), (await q.audit(page, '#game-host')).filter((x) => /OVERLAP|CUT|BLOCKED/.test(x)).slice(0, 6).join(' | '));
    await exit(page);
  },
  async mundo(page, cdp) {
    await launch(page, 'floresta');
    note('mundo', 'menu do Lenhadores/Mundo', null, await q.shot(page, 'deep-mundo-0'));
    const has = await tapText(page, 'mundo');
    await page.waitForTimeout(2500);
    note('mundo', 'Meus Mundos', null, await q.shot(page, 'deep-mundo-lista'));
    await tapText(page, 'novo mundo'); await page.waitForTimeout(2500);
    await q.shot(page, 'deep-mundo-novo');
    await tapText(page, '^(criar|começar|jogar|ok|entrar)'); await page.waitForTimeout(15000);
    note('mundo', 'Mundo (blocos) abre', has, await q.shot(page, 'deep-mundo-1'));
    const [W, H] = await page.evaluate(() => [innerWidth, innerHeight]);
    await q.hold(cdp, [W * 0.14, H * 0.76], [W * 0.14, H * 0.55], 2000);
    note('mundo', 'andando / HUD', null, await q.shot(page, 'deep-mundo-2'));
    await page.setViewportSize({ width: 740, height: 360 }); await page.waitForTimeout(1200);
    note('mundo', 'HUD 740×360', null, await q.shot(page, 'deep-mundo-740'), (await q.audit(page, '#game-host')).filter((x) => /OVERLAP|CUT|BLOCKED/.test(x)).slice(0, 6).join(' | '));
    await exit(page);
  },
  async desastre(page, cdp) {
    await launch(page, 'disaster');
    await page.waitForTimeout(3000);
    note('desastre', 'início (câmera / personagem)', null, await q.shot(page, 'deep-desastre-0'));
    await exit(page);
  },
  async jangada(page) {
    await launch(page, 'jangada');
    note('jangada', 'menu', null, await q.shot(page, 'deep-jangada-0'));
    await tapText(page, 'nova jangada|^continuar'); await page.waitForTimeout(3000); await tapText(page, '^(tranquilo|normal|começar|jogar|zarpar)'); await page.waitForTimeout(8000);
    note('jangada', 'jogo', null, await q.shot(page, 'deep-jangada-1'));
    await exit(page);
  },
  async cavafala(page) {
    await launch(page, 'cavafala');
    note('cavafala', 'menu', null, await q.shot(page, 'deep-cavafala-0'));
    await tapText(page, 'restaurar a vila'); await page.waitForTimeout(12000);
    note('cavafala', 'nasce em terra firme', null, await q.shot(page, 'deep-cavafala-1'));
    await exit(page);
  },
};

(async () => {
  await q.ensureBaseState();
  const { page, cdp, ctx, errs } = await q.open('pixel', { rotate: { portrait: [412, 915], landscape: [844, 390] } });
  await q.waitHub(page);
  for (const [k, fn] of Object.entries(scenes)) {
    if (only && !only.includes(k)) continue;
    errs.length = 0;
    try { await fn(page, cdp); } catch (e) { note(k, 'EXCEÇÃO ' + String(e.message).slice(0, 160), false); try { await exit(page); } catch { /* ok */ } }
    if (errs.length) note(k, 'erros de console', false, '', errs.slice(0, 3).join(' | ').slice(0, 400));
  }
  q.writeJSON('deep-report.json', out);
  await ctx.close(); await q.closeBrowser();
})().catch(async (e) => { console.error(e); await q.closeBrowser(); process.exit(2); });
