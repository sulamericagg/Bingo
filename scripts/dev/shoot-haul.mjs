// Screenshots do Garimpo (clima/dia-noite, necessidades, diesel, eventos, estrada).
//   PORT=5291 node scripts/dev/shoot-haul.mjs <outDir> [cena ...]    (requer vite rodando)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] ?? 'shots-haul';
const port = process.env.PORT ?? 4471;
const only = process.argv.slice(3);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
page.on('console', (m) => m.type() === 'error' && console.error('CONSOLE', m.text()));
const W = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
async function newGame(diff = 2) {
  await page.goto(`http://localhost:${port}/scripts/dev/garimpo.html?debug`);
  await W(800);
  await ev(() => localStorage.clear());
  await page.reload();
  await W(1200);
  await page.click('[data-new="0"]');
  await W(300);
  await page.click(`[data-d="${diff}"]`);
  await page.click('[data-start]');
  await W(4500);
  // fecha avisos
  await ev(() => { const g = window.__garimpo; g.sv.money = 60000; g.sv.stock = 2400; });
}
const shot = async (n) => {
  await page.screenshot({ path: `${out}/${n}.png` });
  console.log('ok', n);
};
/** câmera fixa olhando para (dx, dz) a partir do garimpeiro, um pouco para cima */
const look = (dx, dz, up = 0.18, h = 7) =>
  ev(([dx, dz, up, h]) => {
    const g = window.__garimpo;
    const p = g.worker.group.position;
    g.camOverride = [p.x - dx * 6, p.y + h, p.z - dz * 6, p.x + dx * 60, p.y + h + up * 60, p.z + dz * 60];
  }, [dx, dz, up, h]);
const free = () => ev(() => (window.__garimpo.camOverride = null));
const scenes = {
  async sunrise() {
    await ev(() => { const g = window.__garimpo; g.rp.debug.hour(6.3); g.rp.debug.sky('clear'); });
    await look(0.88, 0.47, 0.05);
    await W(1500);
    await shot('01-sunrise');
  },
  async noon() {
    await ev(() => { const g = window.__garimpo; g.rp.debug.hour(12); g.rp.debug.sky('clear'); });
    await look(-0.3, 0.95, 0.08);
    await W(1500);
    await shot('02-noon');
  },
  async sunset() {
    await ev(() => { const g = window.__garimpo; g.rp.debug.hour(17.8); g.rp.debug.sky('clear'); });
    await look(-0.88, 0.47, 0.1, 15);
    await W(1500);
    await shot('03-sunset');
    await free();
  },
  async night() {
    await ev(() => {
      const g = window.__garimpo;
      const m = g.debug.give('pickup');
      g.debug.enter(m);
      g.rp.debug.hour(22);
      g.rp.debug.sky('clear');
    });
    await W(600);
    await ev(() => { const g = window.__garimpo; g.hud.ctl; });
    await W(1500);
    await shot('04-night-headlights');
  },
  async storm() {
    await ev(() => { const g = window.__garimpo; g.rp.debug.hour(15); g.rp.debug.sky('storm'); g.rainOn = true; });
    await W(4000);
    await look(0.5, 0.86, 0.12, 8);
    await ev(() => window.__garimpo.rp.debug.bolt(3));
    await W(300);
    await shot('05-storm-lightning');
    await free();
  },
  async needs() {
    await ev(() => {
      const g = window.__garimpo;
      g.rp.debug.hour(13);
      g.rp.debug.sky('cloudy');
      const st = g.rp.debug.stall();
      g.debug.tp(st.x + 3.5, st.z + 3.5, Math.atan2(-1, -1));
      g.rp.debug.needs(16, 28, 9);
      g.rp.debug.item('saco', 2);
    });
    await W(2500);
    await shot('06-needs-hud');
  },
  async bag() {
    await ev(() => {
      const g = window.__garimpo;
      const r = g.rp;
      r.debug.item('marmita', 2);
      r.debug.item('jerry', 1);
      r.debug.item('lanterna', 1);
      r.debug.item('pepita', 14);
      r.debug.xp(300);
      r.openBag();
    });
    await W(1500);
    await shot('07-backpack-strength');
    await ev(() => document.querySelector('.rp-scr [data-x]').click());
    await W(300);
  },
  async fuel() {
    await ev(() => {
      const g = window.__garimpo;
      g.rp.debug.needs(80, 80, 80);
      g.rp.debug.hour(16.5);
      g.rp.debug.sky('clear');
      const m = g.debug.give('truck');
      g.debug.enter(m);
      const p = g.rp.debug.pump();
      const c = g.w.map.camp;
      const a = Math.atan2(p.x - c.x, p.z - c.z);
      g.debug.tp(p.x - Math.sin(a) * 6.5, p.z - Math.cos(a) * 6.5, a);
      g.rp.debug.fuel(12);
    });
    await W(2500);
    await shot('08-fuel-station');
    await ev(() => { const g = window.__garimpo; g.debug.exit(); });
    await W(300);
  },
  async events() {
    await ev(() => { const g = window.__garimpo; g.rp.debug.hour(10); g.rp.debug.sky('clear'); g.debug.tp(g.w.map.deposits[1].x, g.w.map.deposits[1].z, 0); });
    await W(800);
    await ev(() => { void window.__garimpo.rp.debug.event('animal', 'mine', 0); });
    await W(1200);
    await shot('09-event-animal');
    await ev(() => document.querySelector('.rp-ch').click());
    await W(900);
    await shot('10-event-result');
    await ev(() => document.querySelector('.rp-ok').click());
    await ev(() => { const g = window.__garimpo; g.rp.debug.hour(23); g.debug.tp(g.w.map.camp.x + 5, g.w.map.camp.z + 5, 0); });
    await W(800);
    await ev(() => { void window.__garimpo.rp.debug.event('thief', 'camp'); });
    await W(1200);
    await shot('11-event-thief');
    await ev(() => document.querySelector('.rp-ch').click());
    await W(400);
    await ev(() => document.querySelector('.rp-ok')?.click());
    await ev(() => { void window.__garimpo.rp.debug.event('werewolf', 'mine'); });
    await W(1400);
    await shot('12-event-spooky');
    await ev(() => document.querySelector('.rp-ch').click());
    await W(400);
    await ev(() => document.querySelector('.rp-ok')?.click());
  },
  async hitch() {
    await ev(() => {
      const g = window.__garimpo;
      g.rp.debug.hour(9);
      g.rp.debug.sky('clear');
      const hw = g.rp.debug.haul(3, 2, 2000, 0, false, true);
      const r = hw.rig;
      const u = r.tl[0];
      // cavalo 1,2 m à frente do pino, alinhado
      const kx = u.x + Math.sin(u.yaw) * u.len, kz = u.z + Math.cos(u.yaw) * u.len;
      r.tr.yaw = u.yaw + 0.04;
      r.tr.x = kx + Math.sin(u.yaw) * (1.2 - 0.35);
      r.tr.z = kz + Math.cos(u.yaw) * (1.2 - 0.35);
    });
    await W(2500);
    await shot('13-coupling-tritrem');
    await ev(() => {
      const hw = window.__garimpo.rp.debug.hw();
      const r = hw.rig;
      const u = r.tl[0];
      r.tr.x = u.x + Math.sin(u.yaw) * (u.len - 0.35);
      r.tr.z = u.z + Math.cos(u.yaw) * (u.len - 0.35);
      r.tr.yaw = u.yaw;
    });
    await W(1200);
    await ev(() => document.querySelector('.rp-act')?.click());
    await W(1500);
    await shot('14-coupled');
  },
  async curve() {
    await ev(() => {
      const g = window.__garimpo;
      g.rp.debug.hour(16);
      const rp = g.rp;
      rp.debug.haul(3, 3, 2800, 0, true, true);
      const road = rp.debug.hw().road;
      // curva mais fechada depois de 300 m
      let bs = 400, bk = 0;
      for (let s = 300; s < road.L - 400; s += 10) {
        const o = [0, 0, 0, 0, 0];
        road.sample(s, o);
        if (Math.abs(o[4]) > bk && !road.stopAt(s, 150)) { bk = Math.abs(o[4]); bs = s; }
      }
      window.__bs = bs;
      rp.endHaulForTest = null;
    });
    await ev(() => {
      const g = window.__garimpo;
      const hw = g.rp.debug.hw();
      hw.rig.placeAt(window.__bs - 70, -1.9);
      hw.rig.v = 14;
      hw.ctl.cruise = 14;
      hw.camSide = true;
    });
    await W(4500);
    await shot('15-quadritrem-curve');
    await ev(() => { const hw = window.__garimpo.rp.debug.hw(); hw.camSide = false; hw.camMode = 0; });
    await W(1200);
    await shot('16-quadritrem-chase');
  },
  async rest() {
    await ev(() => {
      const g = window.__garimpo;
      g.rp.debug.hour(19.1);
      const hw = g.rp.debug.hw();
      const st = hw.road.stops.find((s) => s.kind === 'rest') || hw.road.stops[0];
      hw.ctl.cruise = 0;
      hw.rig.placeAt(st.s - 5, -1.9);
      hw.rig.v = 0;
      hw.camSide = true;
      hw.camSideSign = -st.side;
      g.rp.debug.needs(60, 55, 30);
    });
    await W(3000);
    await shot('17-rest-stop');
    await ev(() => { window.__garimpo.rp.debug.hw().camSide = false; });
  },
  async deliver() {
    await ev(() => {
      const g = window.__garimpo;
      g.rp.debug.hour(11);
      const hw = g.rp.debug.hw();
      hw.camMode = 0;
      hw.rig.placeAt(hw.road.L - 20, -1.9);
      hw.rig.v = 0;
    });
    await W(2000);
    await shot('18-destination');
    await ev(() => window.__garimpo.rp.debug.deliver());
    await W(2200);
    await shot('19-delivery-result');
  },
  async freight() {
    await ev(() => {
      const g = window.__garimpo;
      g.rp.debug.hour(10);
      g.rp.st.haul.owned = 2;
      g.rp.st.haul.deliveries = 1;
      g.rp.st.haul.trip = null;
      const m = g.w.map;
      g.debug.tp(m.gate.x - 6, m.gate.z, 0);
    });
    await W(1500);
    await shot('20-gate-road-button');
    await ev(() => window.__garimpo.rp.debug.freight());
    await W(1200);
    await shot('21-freight-screen');
    await ev(() => document.querySelector('.rp-scr [data-x]')?.click());
  },
  async persist() {
    const before = await ev(() => {
      const g = window.__garimpo;
      g.rp.debug.hour(20.25);
      g.rp.debug.needs(33, 44, 55);
      g.rp.debug.item('lanterna', 1);
      g.rp.st.str.lvl = 4;
      g.persist();
      return JSON.stringify({ h: Math.round(g.rp.st.wx?.hour ?? -1), n: g.rp.st.needs.food, inv: g.rp.st.inv.lanterna, lvl: g.rp.st.str.lvl });
    });
    await page.reload();
    await W(1500);
    await page.click('[data-go="0"]');
    await W(4500);
    const after = await ev(() => {
      const g = window.__garimpo;
      return JSON.stringify({ h: Math.round(window.__garimpo.rp.st.wx?.hour ?? -1), n: Math.round(g.rp.st.needs.food), inv: g.rp.st.inv.lanterna, lvl: g.rp.st.str.lvl });
    });
    console.log('SAVE before', before, 'after', after);
  },
  async perf() {
    const r = await ev(async () => {
      const g = window.__garimpo;
      const info = () => g.r ? { calls: g.r.info.render.calls, tris: g.r.info.render.triangles } : null;
      g.rp.debug.hour(21);
      await new Promise((res) => setTimeout(res, 1500));
      const a = { ...info(), step: g.prof.step.toFixed(2), render: g.prof.render.toFixed(2) };
      g.rp.debug.haul(3, 3, 2800, 1200, true, true);
      await new Promise((res) => setTimeout(res, 2500));
      const b = info();
      return { garimpoNight: a, highwayQuadri: b };
    });
    console.log('PERF', JSON.stringify(r));
  },
};
await newGame(2);
for (const [k, f] of Object.entries(scenes)) if (!only.length || only.includes(k)) await f();
await browser.close();
