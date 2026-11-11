/**
 * Teste do Bloop Cinema — MODO FÁCIL + DUBLAGEM + moderação por IA antes da TV.
 * Chromium (Pixel 7, pt-BR) com microfone falso; a fala→texto do aparelho é simulada por window.__bloopFakeStt.
 *
 *   Só a interface (vite):        npx vite --port 4391 &   node scripts/dev/test-cinema-easy.mjs http://localhost:4391 /tmp/shots
 *   Ponta a ponta (com servidor): npx vite build && npx wrangler dev --local --port 8799 --var AI_STT_MOCK:device --var ADMIN_PASSWORD:senha-local --var UGC_MIN_AGE_H:0 &
 *                                 node scripts/dev/test-cinema-easy.mjs http://localhost:8799 /tmp/shots --submit
 * Com AI_STT_MOCK=device o servidor usa a transcrição do aparelho como se fosse a do Whisper (Workers AI não roda local).
 * Sai com código 1 se algum passo falhar.
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
const base = process.argv[2] || 'http://localhost:4391';
const out = process.argv[3] || '/tmp/cinema-easy';
const SUBMIT = process.argv.includes('--submit');
fs.mkdirSync(out, { recursive: true });
const fails = [];
const ok = (c, m) => {
  console.log((c ? '  ok  ' : '  FAIL ') + m);
  if (!c) fails.push(m);
};
const b = await pw.chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ ...pw.devices['Pixel 7'], locale: 'pt-BR', permissions: ['microphone'] });
const p = await ctx.newPage();
p.on('pageerror', (e) => fails.push('pageerror: ' + e.message));
p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && console.log('   [console]', m.text().slice(0, 200)));
const shot = (n) => p.screenshot({ path: `${out}/${n}.png` });
const waitFor = async (fn, ms = 20000, arg) => {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if (await p.evaluate(fn, arg).catch(() => false)) return true;
    await p.waitForTimeout(150);
  }
  return false;
};
const tap = async (sel) => {
  await p.waitForSelector(sel, { state: 'visible', timeout: 10000 });
  await p.waitForTimeout(500); // folhas ignoram o "clique fantasma" dos primeiros 450 ms
  await p.click(sel);
};
const board = () => p.evaluate(() => JSON.parse(JSON.stringify(window.__cinema.app.easy.p.board)));

await p.goto(`${base}/?debug&skipob`);
await waitFor(() => !!window.__bloop);
await p.waitForTimeout(800);
await p.evaluate(() => window.__bloop.launchGame(window.__bloop.listGames().find((g) => g.id === 'cinema')));

/* 1) primeiro uso: história de 2 cenas em menos de 1 minuto */
console.log('1º uso: modo fácil');
const t0 = Date.now();
ok(await waitFor(() => !!document.querySelector('.easy-starter')), 'escolha do começo abre sozinha no 1º uso');
await shot('01-comeco');
await tap('.easy-starter[data-v="picnic"]');
ok(await waitFor(() => document.querySelectorAll('.easy-card').length === 2), 'quadro com 2 cenas');
const secs = (Date.now() - t0) / 1000;
ok(secs < 60, `história de 2 cenas pronta em ${secs.toFixed(1)} s`);
ok(!(await p.isVisible('.cin-tl')), 'sem linha do tempo no modo fácil');
await p.waitForTimeout(400);
await shot('02-quadro');

// tocar no personagem → pose e rosto
const pos = await p.evaluate(() => {
  const app = window.__cinema.app.easy;
  const sc = app.p.board.scenes[0];
  const r = app.renderers.get(sc.id);
  const cv = document.querySelector(`.easy-card[data-sc="${sc.id}"] canvas`);
  const rc = cv.getBoundingClientRect();
  const s = r.lastScreens[1];
  return { x: rc.left + (s.x / cv.width) * rc.width, y: rc.top + ((s.y - s.ppu * 0.6) / cv.height) * rc.height };
});
await p.mouse.click(pos.x, pos.y);
ok(await waitFor(() => !!document.querySelector('.cin-sheet [data-a="pose"]')), 'tocar no personagem abre poses e rostos');
await p.waitForTimeout(600);
await p.click('.cin-sheet [data-a="expr"][data-v="laughing"]');
await p.click('.cin-sheet [data-a="pose"][data-v="dance"]');
await shot('03-pose-rosto');
await p.click('.cin-sheet [data-a="ok"]');
const b1 = await board();
ok(b1.scenes[0].chars[1].pose === 'dance' && b1.scenes[0].chars[1].expr === 'laughing', 'pose e rosto salvos no quadro');

// arrastar para o lado
const x0 = b1.scenes[0].chars[0].x;
const pos0 = await p.evaluate(() => {
  const app = window.__cinema.app.easy;
  const sc = app.p.board.scenes[0];
  const r = app.renderers.get(sc.id);
  const cv = document.querySelector(`.easy-card[data-sc="${sc.id}"] canvas`);
  const rc = cv.getBoundingClientRect();
  const s = r.lastScreens[0];
  return { x: rc.left + (s.x / cv.width) * rc.width, y: rc.top + ((s.y - s.ppu * 0.6) / cv.height) * rc.height };
});
await p.mouse.move(pos0.x, pos0.y);
await p.mouse.down();
for (let i = 1; i <= 6; i++) await p.mouse.move(pos0.x + i * 8, pos0.y);
await p.mouse.up();
ok((await board()).scenes[0].chars[0].x > x0 + 0.5, 'arrastar muda o lugar do personagem');

// fala: deixar a 2ª fala da cena 2 em branco (improviso)
await tap('.easy-card:nth-child(2) .easy-chip[data-e="line"]:nth-of-type(2)');
await p.waitForSelector('.cin-sheet textarea');
await p.waitForTimeout(600);
await shot('04-fala');
await p.fill('.cin-sheet textarea', '');
await p.click('.cin-sheet [data-a="ok"]');
ok((await board()).scenes[1].lines[1].text === '', 'fala vazia = improviso');

/* 2) Assistir */
console.log('Assistir');
await tap('.easy-big.watch');
ok(await waitFor(() => !!document.querySelector('.dub-root.watch')), 'player abre');
await p.waitForTimeout(2500);
await shot('05-assistir');
await tap('.dub-root.watch [data-w="x"]');

/* 3) Dublar 3 falas com o teleprompter */
console.log('Dublar');
await tap('.easy-big.dub');
ok(await waitFor(() => !!document.querySelector('.dub-root:not(.watch) .dub-line')), 'estúdio de dublagem abre');
await p.waitForTimeout(500);
await shot('06-dublar');
const say = ['Que dia lindo para um piquenique', 'Eu trouxe um bolo gigante', 'Ué cadê o bolo'];
for (let i = 0; i < 3; i++) {
  await p.evaluate((s) => (window.__bloopFakeStt = s), say[i]);
  await p.click(`.dub-line:nth-child(${i + 1}) [data-d="rec"]`);
  if (i === 0) {
    await waitFor(() => !document.querySelector('.dub-count').hidden, 8000);
    await shot('07-contagem');
    await waitFor(() => !document.querySelector('.dub-rec').hidden, 8000);
    await p.waitForTimeout(1200);
    await shot('08-teleprompter');
  }
  ok(await waitFor((n) => window.__cinema.app.easy.p.board.scenes.flatMap((s) => s.lines).filter((l) => l.audio).length >= n, 25000, i + 1), `fala ${i + 1} dublada`);
  await waitFor(() => !document.querySelector('.dub-root').classList.contains('busy'), 15000);
}
const b2 = await board();
const dubbed = b2.scenes.flatMap((s) => s.lines).filter((l) => l.audio);
ok(dubbed.every((l) => l.cut && l.cut[1] > l.cut[0]), 'gravação ligada à fala com corte');
const tx = await p.evaluate(async (id) => {
  const db = await new Promise((r) => { const q = indexedDB.open('bloop-cinema'); q.onsuccess = () => r(q.result); });
  return new Promise((r) => { const g = db.transaction('clips').objectStore('clips').get(id); g.onsuccess = () => r(g.result?.tx); });
}, dubbed[0].audio);
ok(tx === say[0], `transcrição do aparelho guardada com a voz ("${tx}")`);
await shot('09-dublado');
// prévia com as vozes
await p.click('[data-d="preview"]');
await p.waitForTimeout(2500);
await shot('10-previa');
await p.click('[data-d="cancel"]').catch(() => {});
await waitFor(() => !document.querySelector('.dub-root').classList.contains('busy'), 15000);
await p.click('.dub-root [data-d="x"]');
await p.waitForTimeout(500);
await shot('11-quadro-dublado');

/* 4) Enviar → moderação */
if (SUBMIT) {
  console.log('Enviar para a TV (IA)');
  const send = async (name) => {
    await tap('.easy-big.send');
    await p.waitForSelector('.cin-sheet [data-r="agree"]');
    await p.waitForTimeout(500);
    await p.check('.cin-sheet [data-r="agree"]');
    await p.click('.cin-sheet [data-a="go"]');
    await waitFor(() => !document.querySelector('.cin-sheet [data-a="go"]') || !!document.querySelector('.tv-ai'), 60000);
    await p.waitForTimeout(600);
    await shot(name);
  };
  // a) palavrão na voz da fala 2 → recusa automática com motivo
  await p.evaluate(() => (window.__bloopFakeStt = 'que porra de bolo'));
  await tap('.easy-big.dub');
  await p.waitForSelector('.dub-line');
  const before = (await board()).scenes[0].lines[1].audio;
  await p.click('.dub-line:nth-child(2) [data-d="rec"]');
  ok(await waitFor((a) => window.__cinema.app.easy.p.board.scenes[0].lines[1].audio !== a, 25000, before), 'fala 2 regravada (com palavrão)');
  await waitFor(() => !document.querySelector('.dub-root').classList.contains('busy'), 15000);
  ok(await p.isVisible('.dub-warn'), 'aviso local na hora: palavra que não pode na TV');
  await shot('12-aviso-local');
  await p.click('.dub-root [data-d="x"]');
  await send('13-recusa-ia');
  ok(await p.isVisible('.tv-ai'), 'servidor recusou automaticamente');
  const txt = await p.textContent('.tv-ai');
  ok(/fala 2/i.test(txt) && /palavra/.test(txt), 'motivo gentil aponta a fala 2');
  // b) regrava limpo pelo atalho → fila humana com "IA: ok"
  await p.evaluate(() => (window.__bloopFakeStt = 'Eu trouxe um bolo gigante'));
  const bad = (await board()).scenes[0].lines[1].audio;
  await p.click('.tv-ai [data-a="fix"]');
  ok(await waitFor((a) => window.__cinema.app.easy.p.board.scenes[0].lines[1].audio !== a, 30000, bad), '"Regravar a fala 2" abre a dublagem e regrava');
  await waitFor(() => !document.querySelector('.dub-root').classList.contains('busy'), 15000);
  await p.click('.dub-root [data-d="x"]');
  await send('14-enviado');
  ok(!(await p.isVisible('.tv-ai')), 'envio limpo aceito');
  // painel: fila com "IA: ok" e transcrições
  const adm = await ctx.newPage();
  const login = await adm.evaluate(async (b) => (await fetch(b + '/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'senha-local' }) })).status, base);
  console.log('   login admin:', login);
  await adm.goto(`${base}/admin#ugc`);
  await adm.waitForTimeout(1500);
  if (await adm.isVisible('input[type="password"]')) {
    await adm.fill('input[type="password"]', 'senha-local');
    await adm.keyboard.press('Enter');
  }
  await adm.waitForTimeout(2500);
  await adm.goto(`${base}/admin#ugc`);
  await adm.waitForTimeout(2500);
  await adm.screenshot({ path: `${out}/15-painel-fila.png`, fullPage: false });
  const body = await adm.textContent('body');
  ok(/IA: ok/.test(body), 'fila do moderador mostra "IA: ok"');
  if (await adm.isVisible('[data-ug="open"]')) {
    await adm.click('[data-ug="open"]');
    await adm.waitForTimeout(1500);
    await adm.screenshot({ path: `${out}/16-painel-detalhe.png` });
    ok(/ouvido pela IA/.test(await adm.textContent('body')), 'detalhe mostra o que a IA ouviu ao lado do áudio');
  }
  // recusado aparece em "Recusados" com o motivo
  const rej = await adm.evaluate(async (b) => (await (await fetch(b + '/api/admin/ugc/queue?status=rejected&type=filme')).json()).items, base).catch(() => []);
  console.log('   recusados:', (rej || []).map((x) => x.reason));
}

console.log(fails.length ? `\n${fails.length} FALHA(S)` : '\nTUDO OK');
await b.close();
process.exit(fails.length ? 1 : 0);
