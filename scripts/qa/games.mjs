// Smoke de TODOS os jogos do hub: abrir pelo JOGAR → carregar → tocar/arrastar → capturas →
// voltar (pausa) → continuar → sair → hub. Mede erros, HUD (sobreposição/corte em 844×390 e 740×360),
// botões de debug, áudio que continua tocando e a rotação (3D deita, menu volta em pé).
//   node scripts/qa/games.mjs [id,id,...]
import * as q from './lib.mjs';

const only = process.argv[2] ? process.argv[2].split(',') : null;
const PORTRAIT = [412, 915];
const LAND = [844, 390];
const START = /^(voar|embarcar|jogar|começar|comecar|iniciar|play|start|bora|novo jogo|nova partida|continuar|sozinho|jogar sozinho|solo|acelerar|vamos|entrar|ok|pronto|3d|modo 3d|criar|tocar)\b/i;
const AVOID = /online|duelo|amigo|sair|voltar|menu|loja|comprar|código|codigo|anúncio|grupo|convidar|excluir|apagar/i;

async function startButtons(page, id, tag) {
  const tapped = [];
  for (let k = 0; k < 3; k++) {
    const b = await page.evaluateHandle(({ s, a }) => {
      const S = new RegExp(s, 'i'), A = new RegExp(a, 'i');
      const vis = (el) => { const r = el.getBoundingClientRect(); if (r.width < 20 || r.height < 16 || r.bottom > innerHeight || r.right > innerWidth) return false; let p = el; while (p) { const c = getComputedStyle(p); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity < 0.1) return false; p = p.parentElement; } return true; };
      const bs = [...document.querySelectorAll('#game-host .gh-root button, #game-host .gh-root [role=button]')].filter(vis).filter((x) => !x.closest('.gh-confirm'));
      const txt = (x) => (x.textContent || x.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ');
      const ok = bs.filter((x) => S.test(txt(x)) && !A.test(txt(x)));
      // telas de início padrão: o JOGAR grande vem antes dos cartões de escolha (2D/3D)
      return ok.find((x) => x.classList.contains('sm-play')) || ok[0] || null;
    }, { s: START.source, a: AVOID.source });
    if (!(await b.evaluate((x) => !!x))) break;
    const label = await b.evaluate((x) => (x.textContent || x.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 30));
    tapped.push(label);
    await q.tapSel(page, b.asElement());
    await page.waitForTimeout(2500);
    await q.shot(page, `g-${id}-${tag}-start${k}`);
  }
  return tapped;
}

async function play(page, cdp, W, H) {
  // toque no meio, joystick à esquerda, olhar com a direita, pular embaixo à direita
  await q.tapAt(page, W * 0.5, H * 0.5);
  await page.waitForTimeout(300);
  await q.hold(cdp, [W * 0.14, H * 0.76], [W * 0.14, H * 0.6], 1500);
  await q.drag(cdp, [W * 0.65, H * 0.45], [W * 0.8, H * 0.4], 10, 25, 3);
  await q.tapAt(page, W * 0.9, H * 0.8);
  await page.waitForTimeout(400);
  await q.drag(cdp, [W * 0.3, H * 0.5], [W * 0.7, H * 0.55], 12, 20, 4);
  await q.tapAt(page, W * 0.5, H * 0.45);
  await page.waitForTimeout(600);
}

async function hubState(page) {
  return page.evaluate(() => ({
    menu: !!document.querySelector('#menu.on'),
    host: !!document.querySelector('#game-host.on'),
    gameDom: document.querySelectorAll('#game-host .gh-root *').length,
    confirm: !!document.querySelector('.gh-confirm.on'),
    w: innerWidth, h: innerHeight,
    audio: window.__qaAudio ? window.__qaAudio() : null,
    speaking: !!(window.speechSynthesis && speechSynthesis.speaking),
    orphanFixed: [...document.body.children].filter((e) => !['menu', 'game-host', 'ui', 'game'].includes(e.id) && getComputedStyle(e).position === 'fixed' && e.getBoundingClientRect().width > 40 && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' && !/ads-dbg|toast|notify|nt-|bell|lobby|party|pp-|invite|race|sv-banner|banner/.test(e.className)).map((e) => (e.id || e.className).toString().slice(0, 40)),
  }));
}

(async () => {
  await q.ensureBaseState();
  const results = [];
  const { page, errs, cdp, ctx } = await q.open('pixel', { rotate: { portrait: PORTRAIT, landscape: LAND } });
  if (!(await q.waitHub(page))) throw new Error('hub não abriu');
  await page.evaluate(() => { const s = window.__bloop.save; s.coins = 50000; s.gems = 500; });
  const ids = await page.evaluate(() => window.__bloop.listGames().map((g) => g.id));
  const base = await q.resources(page, cdp);
  for (const id of ids) {
    if (only && !only.includes(id)) continue;
    const r = { id, errors: [], issues: [], notes: [], shots: [] };
    errs.length = 0;
    if (await page.$('#game-host.on')) await page.evaluate(() => window.__bloop.closeHost());
    const t0 = Date.now();
    try {
      // abre pelo hub: bolinha do carrossel até a carta do jogo, depois JOGAR de verdade
      const ok = await page.evaluate((id) => {
        const i = [...document.querySelectorAll('#hub-track > .hub-card')].findIndex((c) => c.dataset.game === id);
        const dots = document.querySelectorAll('.hub-dot');
        if (i >= 0 && dots[i]) { dots[i].click(); return true; }
        return false;
      }, id);
      // espera a carta parar no centro
      for (let k = 0; k < 20; k++) {
        const c = await page.evaluate((id) => { const el = document.querySelector(`#hub-track .hub-card.active[data-game="${id}"]`); if (!el) return null; const r = el.getBoundingClientRect(); return Math.abs(r.left + r.width / 2 - innerWidth / 2); }, id);
        if (c !== null && c < 4) break;
        await page.waitForTimeout(250);
      }
      await page.waitForTimeout(400);
      const play1 = await page.$(`#hub-track .hub-card.active[data-game="${id}"] .hub-play`);
      if (ok && play1 && await play1.isVisible()) await q.tapSel(page, play1);
      let launched = false;
      for (let k = 0; k < 12 && !launched; k++) { await page.waitForTimeout(250); launched = await page.evaluate((id) => (id === 'orbit' ? !document.querySelector('#menu.on') || !!document.querySelector('#hud.on, .i3-root, [data-intro]') : !!document.querySelector('#game-host.on')), id); }
      if (!launched) { r.issues.push('JOGAR na carta do hub não abriu o jogo (abrindo por launchGame)'); await page.evaluate((id) => void window.__bloop.launchGame(window.__bloop.listGames().find((g) => g.id === id)), id); }
      await page.waitForTimeout(800);
      if (id === 'orbit') {
        // Orbit é embutido (não usa o #game-host)
        await page.waitForTimeout(4000);
        r.shots.push(await q.shot(page, `g-orbit-play`));
        await play(page, cdp, ...(await page.evaluate(() => [innerWidth, innerHeight])));
        r.shots.push(await q.shot(page, `g-orbit-play2`));
        await q.back(page); await page.waitForTimeout(800);
        r.shots.push(await q.shot(page, `g-orbit-pause`));
        for (let k = 0; k < 4 && !(await page.$('#menu.on')); k++) {
          const quit = await page.$('.modal-screen.on #btn-home, .modal-screen.on #btn-quit, .modal-screen.on #btn-menu');
          if (quit && await quit.isVisible()) await q.tapSel(page, quit); else await q.back(page);
          await page.waitForTimeout(900);
        }
        const hs = await hubState(page);
        if (!hs.menu) r.issues.push('Orbit: não voltou ao hub');
        r.errors = errs.slice();
        results.push(r);
        console.log(`${r.issues.length + r.errors.length ? '✗' : '✓'} orbit issues=${r.issues.length} errors=${r.errors.length}`);
        for (const x of [...r.issues, ...r.errors]) console.log('    ! ' + x.slice(0, 220));
        continue;
      }
      // espera o carregamento
      let waited = 0;
      while (waited < 25000 && (await page.$('#game-host .gh-loading'))) { await page.waitForTimeout(250); waited += 250; }
      r.loadMs = Date.now() - t0;
      if (await page.$('#game-host .gh-loading')) r.issues.push('carregamento preso > 25 s');
      await page.waitForTimeout(3500);
      r.shots.push(await q.shot(page, `g-${id}-1-open`));
      r.started = await startButtons(page, id, 'a');
      let st = await hubState(page);
      r.orientation = st.w > st.h ? 'landscape' : 'portrait';
      r.has3d = await page.evaluate(() => !!document.querySelector('#game-host canvas[data-engine], #game-host canvas.three, #game-host canvas') && [...document.querySelectorAll('#game-host canvas')].some((c) => { try { return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } }));
      await play(page, cdp, st.w, st.h);
      r.started.push(...(await startButtons(page, id, 'b')));
      st = await hubState(page);
      r.orientation = st.w > st.h ? 'landscape' : 'portrait';
      await play(page, cdp, st.w, st.h);
      r.rotBtn = await page.evaluate(() => { const b = document.querySelector('.gh-rot'); return !!b && !b.hidden && b.getBoundingClientRect().width > 0; });
      r.shots.push(await q.shot(page, `g-${id}-2-play`));
      r.audit = await q.audit(page, '#game-host');
      r.debug = await q.debugUi(page);
      if (st.w > st.h) {
        // HUD no celular mais baixo (740×360)
        await page.setViewportSize({ width: 740, height: 360 }); await page.waitForTimeout(1200);
        r.shots.push(await q.shot(page, `g-${id}-3-740x360`));
        r.audit740 = await q.audit(page, '#game-host');
        await page.setViewportSize({ width: LAND[0], height: LAND[1] }); await page.waitForTimeout(600);
      }
      r.fps = await q.fps(page, 2000);
      // NaN / undefined no texto do jogo
      r.badText = await page.evaluate(() => { const t = document.querySelector('#game-host')?.innerText || ''; return (t.match(/[^\n]{0,20}(NaN|undefined|\[object Object\]|null pts)[^\n]{0,20}/g) || []).slice(0, 5); });
      // voltar = pausa + "Sair do jogo?"
      const b1 = await q.back(page); await page.waitForTimeout(700);
      st = await hubState(page);
      if (!b1) r.issues.push('voltar (Android) não foi tratado dentro do jogo — o app minimizaria');
      r.shots.push(await q.shot(page, `g-${id}-4-back`));
      if (!st.confirm) {
        // o jogo tem a própria pausa/menu no voltar (ex.: Bloop no Lugar): procura o "Sair"/"Menu" dela
        r.ownPause = await page.evaluate(() => [...document.querySelectorAll('#game-host .gh-root button')].filter((b) => b.getBoundingClientRect().width > 4).map((b) => (b.textContent || b.getAttribute('aria-label') || '').trim().slice(0, 18)).filter(Boolean).slice(0, 12));
        r.notes.push('voltar abriu a tela própria do jogo: ' + r.ownPause.join(' | '));
        for (let k = 0; k < 4 && !st.confirm && st.host; k++) {
          const ex = await page.evaluateHandle(() => [...document.querySelectorAll('#game-host .gh-root button')].find((b) => b.getBoundingClientRect().width > 4 && /^(sair|menu|início|inicio|voltar ao menu|sair do jogo|sair para o menu|mapa de fases|salvar e sair|exit)/i.test((b.textContent || b.getAttribute('aria-label') || '').trim())) || null);
          if (await ex.evaluate((x) => !!x)) { await q.tapSel(page, ex.asElement()); await page.waitForTimeout(1200); }
          else { await q.back(page); await page.waitForTimeout(900); }
          st = await hubState(page);
        }
        if (st.host && !st.confirm) r.issues.push('não deu para sair do jogo com voltar/Sair (preso no jogo)');
      }
      if (st.confirm) {
        const pa = await q.audit(page, '.gh-confirm');
        if (pa.some((x) => /BLOCKED|CUT/.test(x))) r.issues.push('Sair do jogo? com botão tapado/cortado: ' + pa.filter((x) => /BLOCKED|CUT/.test(x)).join(' | '));
        await q.back(page); await page.waitForTimeout(700); // continua
        st = await hubState(page);
        if (st.confirm) r.issues.push('voltar de novo não fechou o "Sair do jogo?"');
        for (let k = 0; k < 3 && !(await page.$('.gh-confirm.on')); k++) { await q.back(page); await page.waitForTimeout(700); }
        const exit = await page.$('.gh-confirm.on [data-gh=exit]');
        if (exit) await q.tapSel(page, exit); else r.issues.push('"Sair do jogo?" não voltou no 2º voltar');
      }
      await page.waitForTimeout(800);
      if (await page.$('#game-host.on')) { await page.evaluate(() => window.__bloop.closeHost()); r.notes.push('fechado à força (closeHost)'); }
      await page.waitForTimeout(1800);
      st = await hubState(page);
      r.after = st;
      if (!st.menu || st.host) r.issues.push('não voltou ao hub depois de Sair');
      if (st.w > st.h) r.issues.push('hub ficou deitado depois de sair do jogo');
      if (st.gameDom) r.issues.push('restos do jogo no DOM do host: ' + st.gameDom);
      if (st.speaking) r.issues.push('narração continua falando depois de sair');
      if (st.orphanFixed.length) r.issues.push('elementos fixos sobrando no hub: ' + st.orphanFixed.join(', '));
      r.shots.push(await q.shot(page, `g-${id}-5-hub`));
      const res = await q.resources(page, cdp);
      r.res = res;
      // alguns renderizadores compartilhados ficam em cache (Bloop de papel, mãos do fpkit): até 4 é cache; acima é vazamento
      if (res.glLive > 4) r.issues.push(`contextos WebGL vivos depois de sair: ${res.glLive} (base ${base.glLive})`);
      else if (res.glLive > base.glLive) r.notes.push(`WebGL em cache depois de sair: ${res.glLive}`);
      if (res.audios > base.audios) r.issues.push(`<audio>/<video> sobrando: ${res.audios}`);
    } catch (e) {
      r.issues.push('EXCEÇÃO no teste: ' + String(e.message || e).slice(0, 200));
      try { await page.evaluate(() => window.__bloop.closeHost()); await page.setViewportSize({ width: PORTRAIT[0], height: PORTRAIT[1] }); } catch { /* ok */ }
    }
    r.errors = errs.slice();
    r.totalMs = Date.now() - t0;
    results.push(r);
    const bad = r.issues.length + r.errors.length;
    console.log(`${bad ? '✗' : '✓'} ${id.padEnd(10)} load=${r.loadMs ?? '-'}ms ${r.orientation ?? ''} fps=${r.fps?.fps ?? '-'} start=[${(r.started || []).join('|')}] issues=${r.issues.length} errors=${r.errors.length}`);
    for (const x of r.issues) console.log('    ! ' + x);
    for (const x of r.errors.slice(0, 4)) console.log('    E ' + x.slice(0, 220));
  }
  q.writeJSON('games-report.json', results);
  await ctx.close();
  await q.closeBrowser();
  const fails = results.filter((r) => r.issues.length || r.errors.length);
  console.log(`\nJOGOS: ${results.length - fails.length}/${results.length} sem falhas`);
  process.exitCode = fails.length ? 1 : 0;
})().catch(async (e) => { console.error(e); await q.closeBrowser(); process.exit(2); });
