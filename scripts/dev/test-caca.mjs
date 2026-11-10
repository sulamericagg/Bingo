/**
 * Teste de fluxo do Caça Bloop (Chromium "Pixel 7", GPS simulado andando por um caminho).
 *   npx vite --port 5206 &
 *   node scripts/dev/test-caca.mjs [http://localhost:5206] [pasta-das-fotos]
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
const base = process.argv[2] || 'http://localhost:5206';
const out = process.argv[3] || '/tmp/caca-shots';
fs.mkdirSync(out, { recursive: true });
const b = await pw.chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const fails = [];
const ok = (cond, msg) => {
  console.log((cond ? '  ok  ' : '  FAIL ') + msg);
  if (!cond) fails.push(msg);
};
const shot = (p, name) => p.screenshot({ path: `${out}/${name}.png` });
const waitFor = async (p, fn, ms = 20000, arg) => {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if (await p.evaluate(fn, arg).catch(() => false)) return true;
    await p.waitForTimeout(150);
  }
  return false;
};
const START = { latitude: -23.5614, longitude: -46.6559, accuracy: 8 };
const dev = pw.devices['Pixel 7'];
const ctx = await b.newContext({ ...dev, geolocation: START, permissions: ['geolocation', 'camera'] });
const p = await ctx.newPage();
p.on('pageerror', (e) => fails.push('pageerror: ' + e));
p.on('console', (m) => m.type() === 'error' && console.log('   [console]', m.text().slice(0, 200)));

async function openGame() {
  await p.goto(`${base}/?debug&nointro&skipob`);
  await waitFor(p, () => !!window.__bloop);
  await p.evaluate(() => {
    document.querySelectorAll('.modal-screen.on').forEach((e) => e.classList.remove('on'));
    window.__bloop.launchGame(window.__bloop.listGames().find((g) => g.id === 'caca'));
  });
  await waitFor(p, () => !!document.querySelector('.cc-root'));
}
const tapText = async (txt) => {
  const el = p.locator('button', { hasText: txt }).first();
  await el.waitFor({ timeout: 10000 });
  const bb = await el.boundingBox();
  await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await p.waitForTimeout(250);
};

console.log('1) primeira abertura');
await openGame();
ok(await p.isVisible('text=Segurança em primeiro lugar'), 'tela de segurança na 1ª vez');
await shot(p, '01-seguranca');
await tapText('Entendi');
await shot(p, '02-modo');
await tapText('Usar localização');
await shot(p, '03-inicial');
await tapText('Este!');
ok(await waitFor(p, () => window.__caca && window.__caca.spawns().length > 0, 20000), 'aparições calculadas com GPS');
await p.waitForTimeout(1500);
await shot(p, '04-mapa');
const s1 = await p.evaluate(() => window.__caca.spawns().map((s) => s.id + '/' + s.seed));
console.log('   aparições:', s1.length);

console.log('2) determinismo (recarregar)');
await openGame();
ok(await waitFor(p, () => window.__caca && window.__caca.spawns().length > 0, 20000), 'mapa direto após recarregar');
const s2 = await p.evaluate(() => window.__caca.spawns().map((s) => s.id + '/' + s.seed));
ok(JSON.stringify(s1) === JSON.stringify(s2), 'mesma semente/janela → mesmas aparições após recarregar');

console.log('3) andar até um bichinho');
const target = await p.evaluate(() => window.__caca.spawns().sort((a, b) => a.dist - b.dist)[0]);
console.log('   alvo:', target.name, 'raridade', target.rarity, 'a', target.dist, 'm');
let pos = { ...START };
for (let i = 0; i < 80; i++) {
  const d = await p.evaluate(() => window.__caca.fix());
  const dLat = target.lat - pos.latitude;
  const dLon = target.lon - pos.longitude;
  const meters = Math.hypot(dLat * 111320, dLon * 111320 * Math.cos((pos.latitude * Math.PI) / 180));
  if (meters < 15) break;
  const step = Math.min(1, 6 / meters); // ~6 m por passo (~5 km/h)
  pos = { latitude: pos.latitude + dLat * step, longitude: pos.longitude + dLon * step, accuracy: 8 };
  await ctx.setGeolocation(pos);
  await p.waitForTimeout(450);
  if (i === 8) await shot(p, '05-andando');
  void d;
}
const now = await p.evaluate((id) => window.__caca.spawns().find((s) => s.id === id), target.id);
ok(now && now.dist <= 40, `chegou perto (${now?.dist} m)`);
await p.waitForTimeout(1200);
await shot(p, '06-perto');
const st = await p.evaluate((id) => window.__caca.spawns().find((s) => s.id === id).screen, target.id);
await p.mouse.click(st[0], st[1] - 14);
ok(await waitFor(p, () => window.__caca.state().enc === 'meet'), 'encontro aberto ao tocar');
await p.waitForTimeout(600);
await shot(p, '07-encontro');

console.log('4) batalha (debug: autoWin) e captura');
await p.evaluate(() => (window.__caca.autoWin = true));
await tapText('Batalhar');
ok(await waitFor(p, () => window.__caca.state().enc === 'round', 8000), 'round começou');
await p.waitForTimeout(700);
await shot(p, '08-minigame');
ok(await waitFor(p, () => !!document.querySelector('.cc-result'), 60000), 'batalha terminou');
await p.waitForTimeout(400);
const won = await p.isVisible('text=Capturado!');
ok(won, 'capturado');
await shot(p, '09-capturado');
const mons = await p.evaluate(() => window.__caca.state().mons);
ok(mons >= 2, 'bichinho entrou na coleção (' + mons + ')');
await tapText('Continuar');
const gone = await p.evaluate((id) => !window.__caca.spawns().some((s) => s.id === id), target.id);
ok(gone, 'aparição capturada some do mapa');

console.log('5) Bloopdex');
await tapText('Equipe');
await p.waitForTimeout(400);
await shot(p, '10-meus');
await tapText('Famílias');
await p.waitForTimeout(500);
await shot(p, '11-familias');
await p.locator('.cc-cell canvas').first().waitFor();
await p.evaluate(() => window.__caca.openDex('mine'));
await p.waitForTimeout(300);
const cell = await p.locator('.cc-cell').first().boundingBox();
await p.mouse.click(cell.x + cell.width / 2, cell.y + cell.height / 2);
await p.waitForTimeout(500);
await shot(p, '12-detalhe');
await p.evaluate(() => {
  document.querySelector('.cc-sheet-bg')?.remove();
  document.querySelector('.cc-sheet')?.remove();
  window.__caca.closeOverlay();
});

console.log('6) trava de veículo');
for (let i = 0; i < 4; i++) {
  pos = { latitude: pos.latitude + 0.0006, longitude: pos.longitude, accuracy: 8 }; // ~67 m por segundo
  await ctx.setGeolocation(pos);
  await p.waitForTimeout(1000);
}
ok(await waitFor(p, () => window.__caca.state().locked, 5000), 'acima de 25 km/h pausa as aparições');
await shot(p, '13-veiculo');

console.log('7) AR-lite (câmera falsa)');
await p.evaluate(() => {
  window.__caca.save.ar = true;
});
// para de correr; espera destravar não é necessário: abre o encontro direto de uma aparição próxima pelo debug
const ar = await p.evaluate(() => {
  const g = window.__caca;
  const s = g.spawns().sort((a, b) => a.dist - b.dist)[0];
  return s ? g.encounter(s.id) : false;
});
ok(ar, 'encontro AR aberto');
ok(await waitFor(p, () => { const v = document.querySelector('.cc-enc video'); return !!v && v.readyState >= 2; }, 10000), 'vídeo da câmera traseira (falsa) tocando');
await p.waitForTimeout(800);
await shot(p, '14-ar');

console.log(fails.length ? `\n${fails.length} FALHA(S)` : '\nTUDO OK');
await b.close();
process.exit(fails.length ? 1 : 0);
