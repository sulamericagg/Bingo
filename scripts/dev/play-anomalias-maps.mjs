// Joga uma noite inteira no jogo REAL (núcleo + mapa) com screenshots e medição de desempenho.
//   PORT=5491 node scripts/dev/play-anomalias-maps.mjs <outDir> <mapa> [spot ...]     (requer vite rodando)
//   spot = sala onde medir FPS/chamadas (CPU 4× mais lenta). Padrão: todas as salas do mapa.
import { createRequire } from 'node:module';
const { chromium } = createRequire('/opt/node-tools/node_modules/')('playwright');
const [out = 'shots-maps', map = 'creche', ...spots] = process.argv.slice(2);
const port = process.env.PORT ?? 5491;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
page.on('console', (m) => m.type() === 'error' && console.error('CONSOLE', m.text().slice(0, 300)));
const W = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const shot = async (n) => {
  await page.screenshot({ path: `${out}/game-${map}-${n}.png` });
  console.log('ok', n);
};
const tap = async (sel) => {
  const b = await page.$(sel);
  if (!b) return console.log('sem', sel);
  const r = await b.boundingBox();
  await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2);
};
await page.goto(`http://localhost:${port}/scripts/dev/anomalias.html?debug`);
await W(800);
await ev(() => localStorage.removeItem('bw-anomalias'));
await page.reload();
await W(2000);
await ev((m) => window.__ano.play(m, 1), map);
await page.waitForFunction(() => window.__ano?.shift, null, { timeout: 60000 });
await W(2500);
await shot('01-caderno');
await ev(() => window.__ano.shift.hud.closePanel());
await W(1500);
await shot('02-memorizar');
await tap('[data-k="go"]');
await W(1500);
await shot('03-turno');
const info = await ev(() => {
  const s = window.__ano.shift;
  return { tasks: s.tasks.tasks.map((t) => [t.def.id, t.def.kind, t.want]), rooms: s.o.build.rooms.map((r) => r.id), slots: s.o.build.slots.length };
});
console.log(JSON.stringify(info));
// monitor
await tap('[data-k="mon"]');
await W(1500);
await shot('04-monitor');
await ev(() => window.__ano.shift.hud.closePanel());
await W(400);
// anomalias: força 4, mira e fotografa
const aim = (id, dist = 2.4) =>
  ev(
    ([id, dist]) => {
      const s = window.__ano.shift;
      const si = s.slotsInfo.find((x) => x.slot.id === id);
      const a = si.anchor0;
      const r = s.o.build.rooms.find((r) => r.id === si.slot.room);
      let dx = (r.min.x + r.max.x) / 2 - a.x,
        dz = (r.min.z + r.max.z) / 2 - a.z;
      const l = Math.hypot(dx, dz) || 1;
      const m = 0.45;
      const px = Math.min(r.max.x - m, Math.max(r.min.x + m, a.x + (dx / l) * dist));
      const pz = Math.min(r.max.z - m, Math.max(r.min.z + m, a.z + (dz / l) * dist));
      s.debugLook(px, pz, a.x, a.y, a.z);
    },
    [id, dist],
  );
const list =
  map === 'creche'
    ? [['bebe2', 'face', 0], ['poltrona', 'creature', 0], ['npc_tatame1', 'face', 1], ['geladeira', 'door', 0]]
    : [['alce', 'rotate', 0], ['fogo', 'light', 0], ['cabana2_armario', 'creature', 0], ['npc_sofa', 'face', 2]];
let i = 5;
for (const [id, kind, v] of list) {
  await aim(id, kind === 'creature' ? 2.8 : 2.2);
  await W(800);
  const ok = await ev(([id, k, v]) => !!window.__ano.shift.debugSpawn(id, k, v), [id, kind, v]);
  await W(900);
  await shot(`${String(i++).padStart(2, '0')}-anomalia-${id}`);
  await tap('[data-k="cam"]');
  await W(600);
  await tap('[data-k="shut"]');
  await W(500);
  await shot(`${String(i++).padStart(2, '0')}-foto-${id}`);
  await W(1200);
  await tap('[data-k="lower"]');
  await W(300);
  console.log('anomalia', id, ok, JSON.stringify(await ev(() => window.__ano.shift.statsNow)));
}
// uma tarefa com item (fonte → destino) ou toque
const t = await ev(() => {
  const s = window.__ano.shift;
  const tk = s.tasks.tasks.find((x) => !x.done) ?? null;
  return tk && { id: tk.def.id, at: tk.def.at, want: tk.want };
});
if (t) {
  if (t.want) {
    const src = await ev((w) => {
      const s = window.__ano.shift;
      const d = s.tasks.sources.find((x) => x.gives.includes(w));
      const o = d.object.getWorldPosition(d.object.position.clone());
      s.debugLook(d.at.x, d.at.z, o.x, o.y, o.z);
      return d.id;
    }, t.want);
    await W(900);
    await tap('[data-k="use"]');
    await W(700);
    await shot(`${String(i++).padStart(2, '0')}-fonte-${src}`);
    await tap(`.ano-opt[data-o="${t.want}"]`);
    await W(600);
  }
  await ev((id) => {
    const s = window.__ano.shift;
    const d = s.tasks.tasks.find((x) => x.def.id === id).def;
    const o = d.object.getWorldPosition(d.object.position.clone());
    s.debugLook(d.at.x, d.at.z, o.x, o.y, o.z);
  }, t.id);
  await W(900);
  await shot(`${String(i++).padStart(2, '0')}-tarefa-${t.id}`);
  await tap('[data-k="use"]');
  await W(3200);
  await shot(`${String(i++).padStart(2, '0')}-tarefa-feita`);
  console.log('tarefa', t.id, JSON.stringify(await ev(() => window.__ano.shift.tasks.tasks.map((x) => [x.def.id, x.done]))));
}
// desempenho por sala (CPU 4×)
const cdp = await ctx.newCDPSession(page);
const rooms = spots.length ? spots : info.rooms;
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
for (const r of rooms) {
  const res = await ev(async (rid) => {
    const s = window.__ano.shift;
    const R = s.o.build.rooms.find((x) => x.id === rid);
    const v = s.o.build.root.userData.views?.[rid]?.[0];
    const [x, z, yaw] = v ?? [(R.min.x + R.max.x) / 2, R.max.z - 0.6, 0];
    s.debugLook(x, z, x - Math.sin(yaw) * 5, 1.2, z - Math.cos(yaw) * 5);
    await new Promise((res) => setTimeout(res, 3500));
    const i = s.world.renderer.info.render;
    return { fps: +s.fps.toFixed(1), calls: i.calls, tris: i.triangles };
  }, r);
  console.log('perf', r, JSON.stringify(res));
}
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
await shot(`${String(i++).padStart(2, '0')}-perf-ultima-sala`);
// amanhecer
await ev(() => {
  const s = window.__ano.shift;
  s.debugTime(s.cfg.shiftSec - 1.5);
});
await page.waitForFunction(() => ['dawn', 'over', 'caught'].includes(window.__ano.shift?.state), null, { timeout: 30000 }).catch(() => {});
await W(1200);
await shot(`${String(i++).padStart(2, '0')}-amanhecer`);
await W(3000);
await shot(`${String(i++).padStart(2, '0')}-fim`);
console.log('estado', await ev(() => window.__ano.shift?.state));
await browser.close();
