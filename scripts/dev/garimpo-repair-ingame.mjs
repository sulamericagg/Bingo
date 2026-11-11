// Garimpo — consertos dentro do jogo: quebra, botão, escolha (difícil), minijogo, loja, emergência do freio
//   PORT=4481 NODE_PATH=$(npm root -g) node scripts/dev/garimpo-repair-ingame.mjs <outDir> [all|break|shop|brake|road]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] ?? 'shots-repair';
const only = process.argv[3] ?? 'all';
const port = process.env.PORT ?? 4481;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()));
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const shot = async (n) => {
  await page.screenshot({ path: `${out}/${n}.png` });
  console.log('shot', n);
};
const tapSel = async (sel) => {
  const b = await page.locator(sel).first().boundingBox();
  if (!b) return console.log('no', sel);
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
};
await page.goto(`http://127.0.0.1:${port}/scripts/dev/garimpo.html?debug`);
await page.waitForSelector('[data-new="0"]');
await page.click('[data-new="0"]');
await page.click(`[data-d="2"]`);
await page.click('[data-start]');
await page.waitForFunction(() => window.__garimpo?.repairs, null, { timeout: 60000 });
await wait(1500);
await page.addStyleTag({ content: '.gbw-ban,.gbw-cine{display:none!important}' });
await ev(() => setInterval(() => window.__garimpo?.water?.fx?.endCine?.(), 300));
// fecha avisos do RP se houver
await ev(() => document.querySelectorAll('.rp-ev,.rp-scr').forEach((e) => e.remove()));
await ev(() => {
  const g = window.__garimpo;
  g.debug.money(60000);
  g.repairs.debug.grace();
  g.rp && (g.rp.evT = 1e9);
});
const all = only === 'all';
if (all || only === 'break' || only === 'shop') {
  const kind = await ev(() => {
    const g = window.__garimpo;
    const m = g.debug.give('pickup');
    g.debug.enter(m);
    return m.kind;
  });
  await wait(1500);
  await ev(() => window.__garimpo.repairs.debug.brk('tyre'));
  await wait(1200);
  await shot('game-1-flat-hud');
  // botão consertar → difícil sem peça: escolha
  await tapSel('.gbr-fix');
  await wait(600);
  await shot('game-2-choose');
  await tapSel('.gbr-opt[data-o="buy"]');
  await wait(1800);
  await shot('game-3-minigame');
  await tapSel('.gbr-x');
  await wait(800);
  await shot('game-4-back');
  // outras quebras: luz no painel
  await ev(() => {
    const g = window.__garimpo;
    g.repairs.fix(g.cur, true);
    g.repairs.st.cd = 0;
    g.repairs.debug.brk('electric');
  });
  await wait(900);
  await shot('game-5-electric-hud');
  await ev(() => window.__garimpo.openShop());
  await wait(600);
  await ev(() => {
    const s = document.querySelector('.gb-shopgrid');
    const r = document.querySelector('.gbr-sub');
    if (s && r) r.scrollIntoView({ block: 'start' });
  });
  await wait(300);
  await shot('game-6-shop-parts');
  await ev(() => document.querySelector('.gbr-sub')?.parentElement?.parentElement?.scrollBy?.(0, 140));
  await wait(200);
  await shot('game-7-shop-parts2');
  await ev(() => document.querySelector('[data-x]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await wait(400);
  console.log('kind', kind);
}
if (all || only === 'brake') {
  // caminhão carregado embalado; o freio falha
  await ev(() => {
    const g = window.__garimpo;
    if (g.cur !== g.worker) g.debug.exit();
    const m = g.debug.give('truck');
    m.cargo.vol = 8;
    g.debug.enter(m);
    g.repairs.st.inv.pad = 1;
    const v = m.veh;
    const T = g.w.T;
    // procura uma descida suave na estrada do mapa (sem água)
    let best = [96, 96, 0, -1];
    const pts = [...g.w.map.road, ...g.w.map.gateRoad];
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = pts[i];
      const q = pts[i + 1];
      for (const [A, B] of [[p, q], [q, p]]) {
        const a = Math.atan2(B.x - A.x, B.z - A.z);
        const L = Math.hypot(B.x - A.x, B.z - A.z);
        for (let k = 0; k < L - 10; k += 4) {
          const x = A.x + Math.sin(a) * k;
          const z = A.z + Math.cos(a) * k;
          const x2 = x + Math.sin(a) * 40;
          const z2 = z + Math.cos(a) * 40;
          if (x2 < 20 || z2 < 20 || x2 > 172 || z2 > 172) continue;
          const d = T.heightAt(x, z) - T.heightAt(x2, z2);
          if (g.w.waterY(x2, z2) > T.heightAt(x2, z2) - 0.3) continue;
          if (d > best[3] && d < 7) best = [x, z, a, d];
        }
      }
    }
    window.__slope = best;
    v.place(best[0], best[1], best[2], T);
  });
  console.log('slope', JSON.stringify(await ev(() => window.__slope)));
  await wait(1200);
  await ev(() => {
    const g = window.__garimpo;
    const v = g.cur.veh;
    const y = v.yaw();
    v.vel.set(Math.sin(y) * 11, 0, Math.cos(y) * 11);
    v.gear = 5;
    g.repairs.debug.brake();
  });
  await wait(1300);
  await shot('brake-1-fail');
  await wait(600);
  await tapSel('.gbr-ebtn.down');
  await wait(500);
  await tapSel('.gbr-ebtn.down');
  await wait(300);
  await tapSel('.gbr-ebtn.jake');
  await wait(400);
  await shot('brake-2-downshift');
  await wait(900);
  await shot('brake-3-bed');
  await page.waitForFunction(() => !window.__garimpo.repairs.emg.active, null, { timeout: 20000 }).catch(() => console.log('still active'));
  await wait(400);
  await shot('brake-4-stopped');
  await ev(() => {
    const g = window.__garimpo;
    const b = g.repairs.debug.bed();
    if (!b) return;
    const T = g.w.T;
    const s = Math.sin(b.yaw);
    const c = Math.cos(b.yaw);
    const mx = b.x + s * b.len * 0.5;
    const mz = b.z + c * b.len * 0.5;
    const cx = mx + c * 22 - s * 14;
    const cz = mz - s * 22 - c * 14;
    g.camOverride = [cx, T.heightAt(mx, mz) + 14, cz, mx, T.heightAt(mx, mz), mz];
  });
  await wait(500);
  await shot('brake-4b-bed-view');
  await ev(() => (window.__garimpo.camOverride = null));
  await wait(2200);
  await shot('brake-5-fixgame');
  await tapSel('.gbr-x');
  await wait(500);
}
if (all || only === 'road') {
  const info = await ev(() => {
    const g = window.__garimpo;
    if (g.cur !== g.worker) g.debug.exit();
    g.sv.expert = true;
    const hw0 = g.rp.debug.haul(0, 0, 3000, 0, true, true);
    const r = hw0.road.ramps.find((x) => x.s > 600) ?? hw0.road.ramps[0];
    return r ? { s: r.s, side: r.side, n: hw0.road.ramps.length, L: hw0.road.L } : { n: 0, L: hw0.road.L };
  });
  console.log('ramps', JSON.stringify(info));
  if (info.n) {
    // vista da rampa (parado ao lado, câmera alta)
    for (const [ds, nm] of [[-60, 'road-0a-ramp-entry'], [60, 'road-0b-ramp-side']]) {
      await ev(([r, ds]) => {
        const hw = window.__garimpo.rp.debug.hw();
        hw.rig.placeAt(r.s + ds, -1.9);
        hw.camSide = ds > 0;
        hw.camSideSign = -r.side;
      }, [info, ds]);
      await wait(1500);
      await shot(nm);
    }
    await ev(() => (window.__garimpo.rp.debug.hw().camSide = false));
    await ev((r) => {
      const g = window.__garimpo;
      const hw = g.rp.debug.hw();
      hw.rig.placeAt(Math.max(30, r.s - 140), -1.9);
      hw.rig.v = 22;
    }, info);
    await wait(1500);
    await shot('road-1-before');
    await ev(() => {
      const g = window.__garimpo;
      g.repairs.brakeFailure(g.rp.debug.hw().rig);
    });
    await wait(800);
    await shot('road-2-fail');
    await wait(600);
    await shot('road-2b-rolling');
    // espera chegar perto da rampa e "esterça" para a faixa de cascalho (teste: desloca de lado)
    await page.waitForFunction((r) => window.__garimpo.rp.debug.hw().rig.s > r.s - 20, info, { timeout: 30000 }).catch(() => console.log('not near ramp'));
    for (let k = 0; k < 14; k++) {
      await ev((r) => {
        const hw = window.__garimpo.rp.debug.hw();
        const rig = hw.rig;
        const want = r.side * (5.6 + 4.2);
        const d = (want - rig.lat) * 0.25;
        const P = [0, 0, 0, 0, 0];
        hw.road.sample(rig.s, P);
        const lx = Math.cos(P[3]);
        const lz = -Math.sin(P[3]);
        rig.tr.x += lx * d;
        rig.tr.z += lz * d;
        for (const u of rig.tl) {
          u.x += lx * d;
          u.z += lz * d;
        }
      }, info);
      await wait(60);
    }
    await wait(900);
    await shot('road-3-ramp');
    await page.waitForFunction(() => !window.__garimpo.repairs.emg.active, null, { timeout: 30000 }).catch(() => console.log('road still active'));
    await shot('road-4-stopped');
    await ev(() => {
      const hw = window.__garimpo.rp.debug.hw();
      hw.camSide = true;
      hw.camSideSign = 1;
    });
    await wait(800);
    await shot('road-4b-ramp-side');
    await wait(2200);
    await shot('road-5-fixgame');
    console.log('rig', JSON.stringify(await ev(() => { const r = window.__garimpo.rp.debug.hw().rig; return { s: r.s, lat: r.lat, v: r.v }; })));
  }
}
await browser.close();
