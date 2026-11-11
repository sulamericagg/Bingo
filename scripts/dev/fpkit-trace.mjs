// A/B do "feel" de 1ª pessoa da Cozinha: grava traço de câmera (posição/rotação) para uma entrada roteirizada
// e determinística (dt fixo, Math.random semeado, loop do jogo parado).
//   PORT=4620 node scripts/dev/fpkit-trace.mjs out.json [shot.png]      (requer vite rodando)
//   node scripts/dev/fpkit-trace.mjs --diff a.json b.json
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
if (args[0] === '--diff') {
  const a = JSON.parse(readFileSync(args[1], 'utf8'));
  const b = JSON.parse(readFileSync(args[2], 'utf8'));
  const keys = ['x', 'y', 'z', 'rx', 'ry', 'rz', 'px', 'pz'];
  const mx = Object.fromEntries(keys.map((k) => [k, 0]));
  let aimDiff = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    for (const k of keys) mx[k] = Math.max(mx[k], Math.abs(a[i][k] - b[i][k]));
    if (a[i].tg !== b[i].tg) aimDiff++;
  }
  console.log(JSON.stringify({ frames: [a.length, b.length], maxAbsDev: mx, aimMismatches: aimDiff }, null, 1));
  process.exit(0);
}
const { chromium } = createRequire(import.meta.url)('playwright');
const port = process.env.PORT ?? 4620;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
await page.goto(`http://localhost:${port}/scripts/dev/cozinha.html?czmode=3d&czbots=0&czdebug&czfast${process.env.Q ?? ""}`);
await page.waitForFunction(() => window.__czfps?.r?.me && window.__czfps.r.hand, null, { timeout: 60000 });
await page.waitForTimeout(1500);
if (args[1]) await page.screenshot({ path: args[1] });
const trace = await page.evaluate(() => {
  // para o loop do jogo
  window.requestAnimationFrame = () => 0;
  return new Promise((res) => setTimeout(res, 300));
}).then(() =>
  page.evaluate(() => {
    let s = 12345;
    Math.random = () => {
      s |= 0;
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const D = window.__czfps;
    const r = D.r;
    const sim = D.sim;
    // ponto de partida fixo: primeiro piso livre perto do centro
    let sx = 0, sy = 0;
    outer: for (let y = Math.floor(sim.rows / 2); y < sim.rows; y++)
      for (let x = Math.floor(sim.cols / 2); x < sim.cols; x++)
        if (sim.isFloor(x + 0.5, y + 0.5)) { sx = x + 0.5; sy = y + 0.5; break outer; }
    D.goto(sx, sy);
    D.setYaw(0);
    D.setPitch(-0.2);
    if (D.resetFeel) D.resetFeel();
    else { r.bob = 0; r.speedK = 0; r.shake = 0; r.recoil = 0; r.slip = 0; r.aimSkip = 0; }
    r.puddle = null;
    r.time = 0; // extras do tema (barco/espaço) dependem do relógio
    const cur = { dir: [0, 0], look: [0, 0] };
    r.input = { dir: () => cur.dir, consumeLook: () => cur.look, show() {}, dispose() {}, key: () => false };
    const fake = { x: -99, y: -99 };
    sim.players.push(fake);
    const out = [];
    const N = 900;
    for (let i = 0; i < N; i++) {
      const dt = i % 7 === 3 ? 1 / 30 : i % 11 === 5 ? 1 / 45 : 1 / 60;
      cur.look = [0, 0];
      cur.dir = [0, 0];
      if (i < 40) {} // parado
      else if (i < 160) cur.dir = [0, 1];
      else if (i < 260) { cur.dir = [0.3, 0.9]; cur.look = [0.02, 0.004]; }
      else if (i < 380) cur.dir = [-1, 0]; // desliza na parede
      else if (i < 470) { cur.dir = [0, -1]; cur.look = [-0.03, -0.006]; }
      else if (i < 540) cur.dir = [0, 0]; // desacelera
      else if (i < 660) { cur.dir = [0.5, 0.5]; cur.look = [0.015, 0]; }
      else if (i < 780) cur.dir = [1, 0];
      else cur.dir = [0, 1];
      if (i === 300) { if (D.shakeNow) D.shakeNow(1); else r.shake = 1; }
      if (i === 420) (D.recoilNow ? D.recoilNow() : (r.recoil = 1));
      if (i === 600) { const p = D.pos(); const T = 1.1; fake.x = (p.x + 0.3) / T; fake.y = (p.z + 0.1) / T; }
      if (i === 700) { fake.x = -99; fake.y = -99; }
      r.preStep(dt);
      const c = r.camera;
      const p = D.pos();
      out.push({ i, x: c.position.x, y: c.position.y, z: c.position.z, rx: c.rotation.x, ry: c.rotation.y, rz: c.rotation.z, px: p.x, pz: p.z, tg: r.tgSt });
    }
    sim.players.pop();
    return out;
  }),
);
writeFileSync(args[0] ?? 'trace.json', JSON.stringify(trace));
const moved = trace.reduce((m, f) => Math.max(m, Math.hypot(f.px - trace[0].px, f.pz - trace[0].pz)), 0);
console.log('frames', trace.length, 'maxDistFromStart', moved.toFixed(3), 'last', JSON.stringify(trace[trace.length - 1]));
await browser.close();
