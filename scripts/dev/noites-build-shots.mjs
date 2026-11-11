// Noites — construção: fotos do modo construir (paleta, fantasma, fila, ligações, portão, perímetro, noite, desmontar).
//   PORT=4492 node scripts/dev/noites-build-shots.mjs [outDir] [only]
import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
let pw;
try {
  pw = req('playwright');
} catch {
  pw = req(process.env.PW ?? '/opt/node22/lib/node_modules/playwright');
}
const { chromium } = pw;
const out = process.argv[2] ?? 'shots-build';
const only = process.argv[3] ?? 'all';
const port = process.env.PORT ?? 4492;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()));
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: p[2] ?? i + 1, radiusX: 6, radiusY: 6 })) });
const wait = (ms) => page.waitForTimeout(ms);
const tap = async (x, y) => {
  await touch('touchStart', [[x, y]]);
  await wait(70);
  await touch('touchEnd', []);
  await wait(120);
};
const shot = async (name) => {
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
};
const ev = (fn, arg) => page.evaluate(fn, arg);
const want = (k) => only === 'all' || only.split(',').includes(k);

await page.addInitScript(() => {
  try {
    localStorage.setItem('noites-save', JSON.stringify({ best: 3, hat: 'leaf', bots: 1, runs: 5, tut: { chop: true, feed: true, craft: true } }));
    localStorage.setItem('bloop-voice', '0');
  } catch {}
});
await page.goto(`http://127.0.0.1:${port}/scripts/dev/noites.html?debug`, { waitUntil: 'load' });
await wait(1500);
await page.click('[data-m="solo"]');
await wait(2500);
// recursos, bancada nível 2, dia claro parado no meio
await ev(() => {
  const g = window.__noites;
  const s = g.sim;
  s.stash = { wood: 240, stone: 120, fiber: 40, scrap: 30, berry: 6 };
  s.bench = 2;
  s.clock = 40;
  s.fire.fuel = 90;
  const me = g.me;
  me.x = 0;
  me.z = -5;
  me.yaw = Math.PI;
  g.view.camYaw = Math.PI;
  g.view.camPitch = 0.5;
  for (const p of s.players) if (p.bot) (p.x = 3), (p.z = 2), (p.cmd = 'stay');
  // relógio congelado (fotos com a luz certa)
  window.__clk = 40;
  setInterval(() => {
    if (window.__clk != null) s.clock = window.__clk;
  }, 30);
});
await wait(800);

const place = (o) => ev((o) => window.__noites.sim.build.act(window.__noites.me, o), o);
const C = 1.5;
const setMe = (x, z, yaw, pitch = 0.5) =>
  ev(
    ([x, z, yaw, pitch]) => {
      const g = window.__noites;
      g.me.x = x;
      g.me.z = z;
      g.me.yaw = yaw;
      g.view.camYaw = yaw;
      g.view.camPitch = pitch;
    },
    [x, z, yaw, pitch],
  );
const ghostXY = () =>
  ev(() => {
    const g = window.__noites;
    const b = g.build;
    const [x, z] = b.aim;
    const p = g.view.project(x, 0.5, z);
    return [p.x, p.y];
  });

if (want('menu')) {
  await setMe(0, -6.5, Math.PI, 0.5);
  const tb = await page.$('.nb-toggle');
  const bb = await tb.boundingBox();
  await tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await wait(500);
  await shot('01-menu');
  // escolhe a cerca
  const c = await page.$('.nb-card[data-id="fence"]');
  const cb = await c.boundingBox();
  await tap(cb.x + cb.width / 2, cb.y + cb.height / 2);
  await wait(700);
  await shot('02-ghost-valid');
  // inválido: mira na fogueira
  await setMe(0, -6.5, 0, 0.8);
  await wait(600);
  await shot('03-ghost-invalid');
}
if (want('drag')) {
  await ev(() => window.__noites.build.enterPlacement('fence'));
  await setMe(-9, -10.5, Math.PI / 2, 0.85);
  await wait(500);
  const [gx, gy] = await ghostXY();
  await touch('touchStart', [[gx, gy]]);
  await wait(80);
  for (let i = 1; i <= 16; i++) {
    await touch('touchMove', [[gx + i * 14, gy + i * 0.5]]);
    await wait(30);
  }
  await wait(300);
  await shot('04-drag-line');
  await touch('touchEnd', []);
  await wait(900);
  await shot('05-line-placed');
}

const cells = (k, list, r = 0) => place({ a: 'build', o: 'p', k, c: list.flatMap(([cx, cz]) => [cx * 15, cz * 15]), r, f: 0 });
const row = (x0, x1, z) => Array.from({ length: x1 - x0 + 1 }, (_, i) => [x0 + i, z]);
const col = (x, z0, z1) => Array.from({ length: z1 - z0 + 1 }, (_, i) => [x, z0 + i]);
const cam = (x, z, yaw, pitch, dist) =>
  ev(
    ([x, z, yaw, pitch, dist]) => {
      const g = window.__noites;
      g.me.x = x;
      g.me.z = z;
      g.me.yaw = yaw;
      g.view.camYaw = yaw;
      g.view.camPitch = pitch;
      g.view.camDist = dist;
    },
    [x, z, yaw, pitch, dist],
  );
/** põe o jogador de modo que a mira do modo construção caia em (x,z) */
const aimAt = async (x, z, yaw = 0) => {
  await ev((yaw) => {
    const g = window.__noites;
    g.view.camYaw = yaw;
    g.me.yaw = yaw;
  }, yaw);
  await wait(700);
  await ev(
    ([x, z]) => {
      const g = window.__noites;
      const [ax, az] = g.build.rawAim;
      g.me.x = x - (ax - g.me.x);
      g.me.z = z - (az - g.me.z);
    },
    [x, z],
  );
  await wait(700);
  console.log('aim', JSON.stringify(await ev(() => { const g = window.__noites; const B = g.sim.build; const [x, z] = g.build.aim; const p = B.pieceAt(x, z); return [g.build.aim, g.me.x, g.me.z, p && [p.k, p.x, p.z]]; })));
};
/** age como o jogador estando perto (o host valida alcance) */
const at = async (x, z, f) => {
  await ev(([x, z]) => ((window.__noites.me.x = x), (window.__noites.me.z = z)), [x, z]);
  await f();
};

if (want('connect')) {
  await ev(() => window.__noites.build.close());
  // fila z=4 de x=2..8; canto em (2,4), T em (5,4), cruz em (7,4)
  await at(7, 5, async () => {
    await cells(0, row(2, 8, 4));
    await cells(0, col(2, 5, 6));
    await cells(0, col(5, 5, 6));
    await cells(0, [...col(7, 2, 3), ...col(7, 5, 6)]);
  });
  await cam(7.8, 2.2, 0, 0.72, 6.2);
  await wait(1200);
  await shot('06-connect-fence');
  // reforçada e muro: mesmas formas
  await at(-7, 5, async () => {
    await cells(1, row(-8, -2, 4));
    await cells(1, col(-8, 5, 6));
    await cells(1, col(-5, 5, 6));
    await cells(2, row(-8, -2, 7));
    await cells(2, col(-3, 5, 6));
    await cells(2, col(-3, 8, 9));
  });
  await cam(-7.5, 3.2, 0, 0.72, 7);
  await wait(1200);
  await shot('07-connect-rfence-wall');
  await cam(-6, 8.5, Math.PI * 0.8, 0.32, 4.2);
  await wait(900);
  await shot('07b-closeup-wall');
  await cam(5, 3.5, -0.25, 0.32, 4.2);
  await wait(900);
  await shot('06b-closeup-fence');
}
if (want('gate')) {
  // portão no meio de uma cerca (x = -7..-1, z = -6), ajudante longe → fechado
  await at(-6, -7, async () => {
    await cells(0, [...row(-6, -4, -6), ...row(-2, 0, -6)]);
    await cells(3, [[-3, -6]]);
  });
  await ev(() => {
    for (const p of window.__noites.sim.players) if (p.bot) (p.x = -4.5), (p.z = -4), (p.cmd = 'stay');
  });
  await cam(-4.5, -12.5, 0, 0.42, 5.2);
  await wait(1200);
  await shot('08-gate-closed');
  await ev(() => {
    for (const p of window.__noites.sim.players) if (p.bot) (p.x = -4.5), (p.z = -8.2);
  });
  await wait(1000);
  await shot('09-gate-open');
}
if (want('rotate')) {
  await cam(3, -9, Math.PI, 0.8, 8.4);
  await ev(() => window.__noites.build.enterPlacement('bench'));
  await wait(500);
  await shot('10-rotate-a');
  await ev(() => window.__noites.build.rotate());
  await wait(500);
  await shot('11-rotate-b');
  await ev(() => window.__noites.build.enterPlacement('fence'));
  await ev(() => window.__noites.build.rotate());
  await wait(500);
  await shot('12-rotate-fence');
  await ev(() => window.__noites.build.close());
}
if (want('perimeter')) {
  await ev(() => window.__noites.build.close());
  await ev(() => {
    const B = window.__noites.sim.build;
    for (const p of [...B.pieces]) B.remove(p);
  });
  const R = 7; // células: quadrado de -7..7 (21 m)
  await at(0, -9, async () => {
    await cells(0, row(-R + 1, -2, -R));
    await cells(0, row(2, R - 1, -R));
    await cells(3, [[-1, -R]]);
    await cells(3, [[1, -R]]);
    await cells(2, [[0, -R]]);
  });
  await at(0, 9, async () => {
    await cells(1, row(-R + 1, R - 1, R));
  });
  await at(-9, 0, async () => {
    await cells(2, col(-R, -R + 1, R - 1));
  });
  await at(9, 0, async () => {
    await cells(0, col(R, -R + 1, -1));
    await cells(3, [[R, 0]]);
    await cells(0, col(R, 1, R - 1));
  });
  for (const [x, z] of [
    [-R, -R],
    [R, -R],
    [-R, R],
    [R, R],
  ])
    await at(x * 1.5, z * 1.5 + 2, () => cells(4, [[x, z]]));
  await at(3, -6, () => cells(5, row(-3, 3, -R - 2)));
  await at(4, 4, async () => {
    await place({ a: 'build', o: 'p', k: 6, c: [45, 75, -45, 75, 75, -45], r: 0, f: 1 });
    await place({ a: 'build', o: 'p', k: 8, c: [-75, 45], r: 2, f: 0 });
    await place({ a: 'build', o: 'p', k: 9, c: [-60, -60], r: 0, f: 0 });
    await place({ a: 'build', o: 'p', k: 7, c: [60, 60], r: 0, f: 0 });
  });
  await ev(() => {
    const g = window.__noites;
    console.log('pieces', g.sim.build.pieces.length, JSON.stringify(g.sim.stash));
  });
  await cam(-4, -8, 0.55, 0.78, 21);
  await wait(1500);
  await shot('13-perimeter');
  await cam(-2, -15, 0.35, 0.38, 8);
  await wait(1200);
  await shot('14-perimeter-front');
}
if (want('night')) {
  await ev(() => {
    const g = window.__noites;
    const s = g.sim;
    s.phase = 'night';
    window.__clk = 30;
    s.night = 3;
    s.fire.fuel = 6;
    window.__noites.build.close();
    for (const p of [...s.players]) if (p.bot) s.removePlayer(p.id);
    // sem tochas do lado norte (a luz afasta as Sombrinhas da cerca)
    const B = s.build;
    for (const p of [...B.pieces]) if ((p.k === 6 || p.k === 7) && p.z > 0) B.remove(p);
    // Sombrinhas fora da cerca, indo para a fogueira
    for (let i = 0; i < 9; i++) s.spawn(i % 3 === 2 ? 2 : 0, -7 + i * 1.4, 16 + (i % 2) * 2);
  });
  await cam(-1.5, 6.2, 0, 0.42, 6);
  await wait(11000);
  await shot('15-night-attack');
  await wait(8000);
  await shot('16-night-damage');
  await ev(() => {
    // dano visível de perto (rachaduras): força vidas baixas em alguns trechos
    const B = window.__noites.sim.build;
    for (const p of B.pieces) if (p.z > 10 && p.x > -6 && p.x < 2) (p.hp = Math.min(p.hp, p.x < -2 ? 5 : 11)), B.hpVer++;
  });
  await cam(-2.5, 8.2, 0.3, 0.3, 3.6);
  await wait(1200);
  await shot('16b-cracks');
}
if (want('demolish')) {
  await ev(() => {
    const s = window.__noites.sim;
    s.phase = 'day';
    window.__clk = 40;
    s.creatures = [];
  });
  await cam(3, 4, 0, 0.6, 6.8);
  await ev(() => window.__noites.build.tool('del'));
  await aimAt(3, 10.5);
  await wait(500);
  await shot('17-demolish-aim');
  await ev(() => window.__noites.build.place());
  await wait(250);
  await shot('18-demolish-dust');
  await ev(() => window.__noites.build.tool('fix'));
  await ev(() => {
    const B = window.__noites.sim.build;
    for (const p of B.pieces) if (p.z > 10 && p.x < 0 && p.x > -6) (p.hp = 3), B.hpVer++;
  });
  await aimAt(-3, 10.5);
  await wait(700);
  await shot('19-repair-aim');
  await ev(() => window.__noites.build.tool('up'));
  await aimAt(10.5, 6, -Math.PI / 2);
  await wait(700);
  await shot('20-upgrade-aim');
}
await browser.close();
