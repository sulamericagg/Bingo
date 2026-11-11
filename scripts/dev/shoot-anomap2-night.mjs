// Joga uma noite inteira no jogo de verdade (núcleo do Anomalias) num dos mapas 2.
//   npx vite --port 4321  &&  node scripts/dev/shoot-anomap2-night.mjs <outDir> fastfood|posto24h
// Passos: menu → noite 1 → caderno → memorizar → turno: monitor, 4 anomalias fotografadas,
// tarefas (escolha certa / segurar / levar item), Bocudo caçando, amanhecer. Mede FPS/chamadas.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const [out = 'shots-maps', map = 'fastfood'] = process.argv.slice(2);
const port = process.env.PORT ?? 4321;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
page.on('console', (m) => m.type() === 'error' && console.error('CONSOLE', m.text().slice(0, 300)));
const W = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const shot = async (n) => {
  await page.screenshot({ path: `${out}/night-${map}-${n}.png` });
  console.log('ok', n);
};
const tapSel = async (sel) => {
  const b = await page.$(sel);
  if (!b) throw new Error('sem ' + sel);
  const r = await b.boundingBox();
  await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2);
};
const log = (o) => console.log(JSON.stringify(o));

await page.goto(`http://localhost:${port}/scripts/dev/anomalias.html?debug`);
await W(800);
await ev(() => localStorage.removeItem('bw-anomalias'));
await page.reload();
await page.waitForFunction(() => window.__ano, null, { timeout: 30000 });
await W(1500);
await shot('00-menu');
await ev((m) => window.__ano.play(m, 1), map);
await page.waitForFunction(() => window.__ano.shift, null, { timeout: 60000 });
await W(2500);
await shot('01-notebook');
await ev(() => window.__ano.shift.hud.closePanel());
await W(1200);
await shot('02-memorize');
await ev(() => window.__ano.shift.beginShift());
await W(1500);
await shot('03-shift-start');
log({ tasks: await ev(() => window.__ano.shift.tasks.tasks.map((t) => [t.def.id, t.def.kind, t.want])) });

/** olha para o ponto da anomalia a ~dist m (vindo do centro da sala) */
const aim = (slotId, dist = 2.4, eye = null) =>
  ev(
    ([slotId, dist, eye]) => {
      const s = window.__ano.shift;
      const si = s.slotsInfo.find((x) => x.slot.id === slotId);
      const a = s.world.anchorOf ? s.world.anchorOf(si, si.anchor0.clone()) : si.anchor0;
      const r = s.o.build.rooms.find((r) => r.id === si.slot.room);
      let dx = (r.min.x + r.max.x) / 2 - a.x;
      let dz = (r.min.z + r.max.z) / 2 - a.z;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
      const m = 0.45;
      const px = Math.min(r.max.x - m, Math.max(r.min.x + m, a.x + dx * dist));
      const pz = Math.min(r.max.z - m, Math.max(r.min.z + m, a.z + dz * dist));
      if (eye) s.debugLook(eye[0], eye[1], a.x, a.y, a.z);
      else s.debugLook(px, pz, a.x, a.y, a.z);
    },
    [slotId, dist, eye],
  );
const PAIRS = {
  fastfood: [
    ['mascote', 'rotate', 0, 3.0],
    ['cliente_cabine', 'face', 0, 2.2],
    ['cardapio', 'picture', 0, 3.5],
    ['porta_camara', 'door', 0, 3.0],
  ],
  posto24h: [
    ['preco', 'picture', 0, 6.0],
    ['boneco', 'rotate', 0, 5.0],
    ['geladeira_luz', 'color', 0, 3.0],
    ['cliente_loja', 'face', 0, 2.2, [2.3, 9.4]],
  ],
}[map];
// monitor
await tapSel('[data-k="mon"]');
await W(1500);
await shot('04-monitor');
await ev(() => window.__ano.shift.hud.closePanel());
await W(400);
// anomalias: antes/depois + foto
for (const [id, kind, v, dist, eye] of PAIRS) {
  await aim(id, dist, eye);
  await W(900);
  await shot(`p-${id}-a`);
  const ok = await ev(([id, kind, v]) => !!window.__ano.shift.debugSpawn(id, kind, v), [id, kind, v]);
  if (!ok) console.log('falhou', id);
  await W(900);
  await shot(`p-${id}-b`);
  await tapSel('[data-k="cam"]');
  await W(700);
  await tapSel('[data-k="shut"]');
  await W(500);
  await shot(`p-${id}-foto`);
  await W(1200);
  await tapSel('[data-k="lower"]').catch(() => {});
  await W(300);
}
log({ stats: await ev(() => window.__ano.shift.statsNow), danger: await ev(() => window.__ano.shift.danger) });
// tarefas: faz todas (escolha → certo; segurar → completa; levar item → pega na fonte)
const tasks = await ev(() => window.__ano.shift.tasks.tasks.map((t) => ({ id: t.def.id, kind: t.def.kind, want: t.want, at: t.def.at })));
let i = 0;
for (const t of tasks) {
  await ev((t) => {
    const s = window.__ano.shift;
    const d = s.o.build.interacts.find((x) => x.id === t.id);
    const o = d.object.getWorldPosition(d.object.position.clone());
    s.debugLook(t.at.x, t.at.z, o.x, Math.max(0.6, o.y), o.z);
  }, t);
  await W(900);
  await shot(`t${i}-${t.kind}`);
  const a = await ev((id) => {
    const s = window.__ano.shift;
    const d = s.o.build.interacts.find((x) => x.id === id);
    const a = s.tasks.action(d);
    if (a.type === 'choose' && a.answer) s['finishTask'](d, true, a.answer);
    else if (a.type === 'none') {
      // precisa de item: pega na fonte e entrega
      const t = s.tasks.taskOf(d);
      s.tasks.carrying = t.want;
      s['finishTask'](d, true, t.want);
    } else s['finishTask'](d, true);
    return a;
  }, t.id);
  log({ task: t.id, kind: t.kind, action: a.type, options: a.options, answer: a.answer });
  await W(500);
  await shot(`t${i}-${t.kind}-feito`);
  i++;
}
log({ tasks: await ev(() => window.__ano.shift.tasks.tasks.map((x) => [x.def.id, x.done])) });
// desempenho em 4 pontos (sem throttle; SwiftShader)
const perf = await ev(async () => {
  const s = window.__ano.shift;
  const b = s.o.build;
  const out = {};
  for (const r of b.rooms.slice(0, 6)) {
    const cx = (r.min.x + r.max.x) / 2;
    const cz = (r.min.z + r.max.z) / 2;
    s.debugLook(r.min.x + 0.8, r.max.z - 0.8, cx, 1.0, cz);
    await new Promise((res) => setTimeout(res, 1500));
    const i = s.world.renderer.info.render;
    out[r.id] = { fps: +s.fps.toFixed(1), calls: i.calls, tris: i.triangles };
  }
  return out;
});
log({ perf });
// Bocudo caçando (usa nav + creatureSpawns do mapa)
await ev(() => window.__ano.shift.debugDanger(100));
await W(2500);
await shot('15-hunt');
log({ hunt: await ev(() => { const h = window.__ano.shift.hunt; return h && { x: h.pos.x, z: h.pos.z }; }) });
await ev(() => window.__ano.shift.debugDanger(0));
await W(400);
// amanhecer
await ev(() => {
  const s = window.__ano.shift;
  s.debugTime(s.cfg.shiftSec - 1.5);
});
await page.waitForFunction(() => ['dawn', 'caught', 'done'].includes(window.__ano.shift?.state), null, { timeout: 40000 }).catch(() => {});
await W(1500);
await shot('19-dawn');
await page.waitForSelector('[data-next]', { timeout: 30000 }).catch(() => {});
await W(900);
await shot('20-night-complete');
log({ state: await ev(() => window.__ano.shift?.state), save: await ev(() => localStorage.getItem('bw-anomalias')) });
await browser.close();
