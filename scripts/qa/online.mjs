// Online de ponta a ponta: wrangler dev local (serve o dist/ + /api) + 2 jogadores (2 abas).
// Cadastro com @ → amizade → A cria grupo e convida B → pop-up de convite em B → ACEITAR →
// A (líder ♛) escolhe jogos e aperta JOGAR → B entra sozinho no mesmo jogo → pódio do duelo (Queda Giratória).
//   node scripts/qa/online.mjs [jogos]      (padrão: tubo,cozinha,noites,cavafala)
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as q from './lib.mjs';

const GAMES = (process.argv[2] || 'tubo,cozinha,noites,cavafala').split(',');
const checks = [];
const ok = (name, pass, detail = '', shot = '') => { checks.push({ name, pass: !!pass, detail, shot }); console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };
let child; let persist;

async function freePort() { return new Promise((res, rej) => { const s = createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); }); }
async function startWrangler() {
  const port = await freePort();
  persist = mkdtempSync(join(tmpdir(), 'qa-kv-'));
  child = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(port), '--ip', '127.0.0.1', '--persist-to', persist, '--show-interactive-dev-session=false', '--var', 'AI_STT_MOCK:device'], { cwd: q.ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, detached: true });
  let log = ''; child.stdout.on('data', (d) => (log += d)); child.stderr.on('data', (d) => (log += d));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 180; i++) { try { const r = await fetch(base + '/api/challenges'); if (r.ok) return base + '/'; } catch { /* espera */ } await q.sleep(500); }
  console.error(log.slice(-3000)); throw new Error('wrangler dev não iniciou');
}
function stopWrangler() { try { process.kill(-child.pid, 'SIGTERM'); } catch { /* ok */ } try { rmSync(persist, { recursive: true, force: true }); } catch { /* ok */ } }

async function onboard(url, nick, handle) {
  const p = await q.open('pixel', { fresh: true, url, rotate: { portrait: [412, 915], landscape: [844, 390] } });
  const { page } = p;
  for (let i = 0; i < 80 && !(await page.$('#ob-nick')); i++) { if (await page.$('.bo-intro')) await page.touchscreen.tap(20, 200).catch(() => {}); await page.waitForTimeout(500); }
  await page.fill('#ob-nick', nick);
  await page.fill('#ob-handle', handle);
  await page.waitForTimeout(2500); // checagem do @ no servidor
  await q.shot(page, `online-onboard-${nick}`);
  await page.click('#ob-go', { force: true });
  await page.waitForTimeout(2000);
  await q.waitHub(page);
  await page.evaluate(() => window.__bloop.bus.on('host-open', (id) => (window.__qaHost = id)));
  const ids = await page.evaluate(() => ({ id: JSON.parse(localStorage.getItem('bo-player') || '{}').id, prof: JSON.parse(localStorage.getItem('bw-profile-v1') || '{}') }));
  return { ...p, id: ids.id, handle: ids.prof.handle, hs: ids.prof.handleStatus };
}
const api = (page, path, body) => page.evaluate(async ({ path, body }) => { const r = await fetch('/api' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { s: r.status, d: await r.json().catch(() => null) }; }, { path, body });

async function waitFor(page, fn, ms, arg) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn, arg).catch(() => false)) return true; await page.waitForTimeout(500); } return false; }
async function exitGame(page) {
  await page.evaluate(() => window.__bloop.ui.back()); await page.waitForTimeout(500);
  const ex = await page.$('.gh-confirm.on [data-gh=exit]');
  if (ex) await q.tapSel(page, ex); else await page.evaluate(() => window.__bloop.closeHost());
  await page.waitForTimeout(1500);
}

(async () => {
  const url = process.env.QA_ONLINE_URL || (await startWrangler());
  console.log('servidor', url);
  const tag = Math.random().toString(36).slice(2, 6);
  const A = await onboard(url, 'Ana', 'ana_' + tag);
  const B = await onboard(url, 'Beto', 'beto_' + tag);
  ok('cadastro com @ (A e B)', A.id && B.id && A.handle && B.handle, `${A.handle}/${A.hs} ${B.handle}/${B.hs}`);
  let r = await api(A.page, '/friends/request', { id: A.id, handle: B.handle });
  r = await api(B.page, '/friends/respond', { id: B.id, from: A.id, accept: true });
  ok('amizade A↔B', r.s === 200, JSON.stringify(r).slice(0, 120));

  // A: Amigos → Criar grupo → Convidar B
  await q.tapSel(A.page, '#pl-lobby .pl-add'); await A.page.waitForTimeout(2500); // espera a folha terminar de subir
  const create = await A.page.evaluateHandle(() => [...document.querySelectorAll('button')].find((b) => /criar grupo/i.test(b.textContent) && b.getBoundingClientRect().width > 0) || null);
  if (await create.evaluate((x) => !!x)) { await q.tapSel(A.page, create.asElement()); await A.page.waitForTimeout(3000); }
  await q.shot(A.page, 'online-A-grupo');
  ok('A criou o grupo e é líder', await A.page.evaluate(() => !!document.querySelector('.pl-crown, .sq-members')));
  let invited = false;
  for (let i = 0; i < 10 && !invited; i++) {
    const inv = await A.page.evaluateHandle((h) => { const rows = [...document.querySelectorAll('button')].filter((b) => /^(convidar|chamar)$/i.test(b.textContent.trim()) && b.getBoundingClientRect().width > 0); return rows.find((b) => (b.closest('[class*=row], li, .sc-row, div')?.textContent || '').includes(h)) || rows[0] || null; }, B.handle);
    if (await inv.evaluate((x) => !!x)) { await q.tapSel(A.page, inv.asElement()); invited = true; } else await A.page.waitForTimeout(1500);
  }
  if (!invited) { r = await api(A.page, '/squad/invite', { id: A.id, squad: await A.page.evaluate(() => null), to: B.id }); }
  await q.shot(A.page, 'online-A-convidou');
  ok('A achou o B na lista e tocou Convidar', invited);
  const t0 = Date.now();
  const popped = await waitFor(B.page, () => !!document.querySelector('.ip-pop .ip-yes'), 60000);
  ok('pop-up de convite apareceu em B', popped, `${Math.round((Date.now() - t0) / 1000)} s`, await q.shot(B.page, 'online-B-convite'));
  if (popped) { await q.tapSel(B.page, '.ip-pop .ip-yes'); }
  const both = await waitFor(B.page, () => document.querySelectorAll('#pl-lobby .pl-slot:not(.pl-add)').length >= 2, 20000);
  await A.page.evaluate(() => window.__bloop.ui.back()); await A.page.waitForTimeout(800);
  ok('B entrou no grupo (2 Bloops no saguão)', both, '', await q.shot(B.page, 'online-B-grupo'));
  await q.shot(A.page, 'online-A-grupo2');
  ok('coroa do líder no saguão', await B.page.evaluate(() => !!document.querySelector('#pl-lobby .pl-crown')));

  for (const g of GAMES) {
    A.errs.length = 0; B.errs.length = 0;
    await A.page.evaluate((id) => { const i = [...document.querySelectorAll('#hub-track > .hub-card')].findIndex((c) => c.dataset.game === id); document.querySelectorAll('.hub-dot')[i]?.click(); }, g);
    await A.page.waitForTimeout(1200);
    const follow = await B.page.evaluate((id) => document.querySelector('#hub-track .hub-card.active')?.dataset.game === id, g);
    await q.tapSel(A.page, `#hub-track .hub-card.active[data-game="${g}"] .hub-play`);
    const inA = await waitFor(A.page, () => !!document.querySelector('#game-host.on'), 15000);
    const inB = await waitFor(B.page, () => !!document.querySelector('#game-host.on'), 30000);
    await A.page.waitForTimeout(9000);
    const sA = await q.shot(A.page, `online-${g}-A`); const sB = await q.shot(B.page, `online-${g}-B`);
    const gB = await B.page.evaluate(() => (document.querySelector('#game-host.on') ? window.__qaHost : null));
    ok(`[${g}] carrossel do B acompanha o líder`, follow);
    ok(`[${g}] líder entrou`, inA, '', sA);
    ok(`[${g}] B entrou sozinho no mesmo jogo`, inB && gB === g, `B=${gB}`, sB);
    if (g === 'tubo' && inA && inB) {
      // duelo: os dois jogam até cair; o pódio aparece para os dois
      const t1 = Date.now(); let podA = false, podB = false;
      while (Date.now() - t1 < 150000 && !(podA && podB)) {
        for (const P of [A, B]) { const [W, H] = await P.page.evaluate(() => [innerWidth, innerHeight]); await P.page.touchscreen.tap(W * Math.random(), H * (0.3 + 0.5 * Math.random())).catch(() => {}); }
        podA = await A.page.evaluate(() => !!document.querySelector('.dl-podium')); podB = await B.page.evaluate(() => !!document.querySelector('.dl-podium'));
        await A.page.waitForTimeout(700);
      }
      ok('[tubo] pódio do duelo aparece para os dois', podA && podB, `${Math.round((Date.now() - t1) / 1000)} s`, await q.shot(A.page, 'online-tubo-podio-A'));
      await q.shot(B.page, 'online-tubo-podio-B');
    }
    const eA = A.errs.filter((e) => /PAGEERROR/.test(e)), eB = B.errs.filter((e) => /PAGEERROR/.test(e));
    ok(`[${g}] sem erros JS`, !eA.length && !eB.length, [...eA, ...eB].slice(0, 2).join(' | ').slice(0, 300));
    await exitGame(A.page); await exitGame(B.page);
    await A.page.waitForTimeout(2500);
    ok(`[${g}] os dois voltaram ao hub`, await A.page.evaluate(() => !!document.querySelector('#menu.on')) && await B.page.evaluate(() => !!document.querySelector('#menu.on')));
  }
  q.writeJSON('online-report.json', checks);
  await A.ctx.close(); await B.ctx.close(); await q.closeBrowser();
  if (!process.env.QA_ONLINE_URL) stopWrangler();
  const f = checks.filter((c) => !c.pass);
  console.log(`\nONLINE: ${checks.length - f.length}/${checks.length} ok`);
  process.exitCode = f.length ? 1 : 0;
})().catch(async (e) => { console.error(e); await q.closeBrowser(); if (child) stopWrangler(); process.exit(2); });
