// Cozinha 1ª pessoa: cenas de teste + screenshots (paisagem 844×390, toque).
//   PORT=4620 node scripts/dev/shoot-cozinha-fp.mjs <outDir> [cena ...]     (requer vite rodando)
//   cenas: start window ext bell plates corn fire fridge skip dining walk
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] ?? 'shots-cz';
const only = process.argv.slice(3);
const port = process.env.PORT ?? 4620;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
page.on('console', (m) => m.type() === 'error' && console.error('CONSOLE', m.text()));
const W = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const shot = async (n) => {
  await page.screenshot({ path: `${out}/${n}.png` });
  console.log('shot', n);
};
const log = (...a) => console.log(...a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))));
async function open(q = '') {
  await page.goto(`http://localhost:${port}/scripts/dev/cozinha.html?czmode=3d&czbots=0&czdebug&czfast${q}`);
  await page.waitForFunction(() => window.__czfps?.r?.me && window.__czfps.r.hand, null, { timeout: 60000 });
  await W(1200);
}
const state = () =>
  ev(() => {
    const D = window.__czfps, r = D.r;
    return { verb: r.verbDef?.id + ':' + r.verbDef?.label, dim: !!r.verbDef?.dim, tgSt: r.tgSt, st: r.tgSt >= 0 ? D.sim.st[r.tgSt].k : '', ctl: r.tgCtl ? r.tgCtl.label() : '', loose: r.tgLoose ? r.tgLoose.it.k : null, hold: r.me.hold ? r.me.hold.k : null, alt: r.hb?.curAlt?.id ?? null };
  });
const frames = (n = 5) => ev((n) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const tapMain = () => ev(() => window.__czfps.r.tap(window.__czfps.r.verbDef.id));
const plates = () =>
  ev(() => {
    const D = window.__czfps, s = D.sim, r = D.r;
    const c = (k) => s.st.filter((x) => x.k === k).reduce((a, x) => a + x.n, 0);
    let onSt = 0;
    for (const x of s.st) if (x.item && (x.item.k === 1 || x.item.k === 3)) onSt += x.item.k === 3 ? x.item.n : 1;
    let loose = 0;
    for (const l of r.loose.values()) if (l.it.k === 1 || l.it.k === 3) loose += l.it.k === 3 ? l.it.n : 1;
    const h = r.me.hold;
    return { stack: c('plates'), dirty: c('dirty'), sink: c('sink'), onSt, loose, floor: s.floor.length, held: h ? (h.k === 3 ? 'dirty' + h.n : h.k === 1 ? 'plate' + h.parts.length : 'k' + h.k) : '', rq: s.returnQ.length, broken: s.broken, served: s.served };
  });
const goSt = async (k, n = 0, back = 1) => { await ev(([k, n, back]) => { const D = window.__czfps; D.front(D.st(k, n), back); }, [k, n, back]); await frames(6); };
const scenes = {
  async start() {
    await open();
    await shot('start');
  },
  async window() {
    await open();
    await W(4000);
    // espera o 1º cliente chegar no degrau da janela (no código antigo ele já está lá)
    await page.waitForFunction(() => { const r = window.__czfps.r; if (!r.crowd) return true; for (const w of r.crowd.values()) if (w.y > 0.4) return true; return false; }, null, { timeout: 30000 }).catch(() => console.log('no walker at window'));
    await ev(() => { const D = window.__czfps; const w = D.st('window'); D.front(w, 1.6); D.setPitch(-0.05); });
    await W(700);
    await shot('window');
    await ev(() => { const D = window.__czfps; const w = D.st('window'); D.front(w, 1.0); D.setPitch(0.05); });
    await W(700);
    await shot('window-close');
  },
  async ext() {
    await open();
    await ev(() => { const D = window.__czfps; D.give('ext'); D.front(D.st('counter'), 1); });
    await W(600);
    log('ext@counter', await state());
    await shot('ext-counter');
  },
  async plates() {
    await open();
    log('0', await plates());
    await goSt('plates'); await W(400); log('aim plates', await state()); await tapMain(); await frames(4); log('1 pick plate', await plates());
    await goSt('counter'); await W(400); log('aim counter', await state()); await tapMain(); await frames(4); log('2 place on counter', await plates());
    await ev(() => window.__czfps.give('tomate')); await W(300); log('aim w/ tomato', await state()); await tapMain(); await frames(4); log('3 tomato onto plate', await plates());
    await W(300); log('aim plate', await state()); await tapMain(); await frames(4); log('4 pick plate', await plates());
    await goSt('plates'); await W(400); log('aim stack w/ full plate', await state()); await tapMain(); await frames(4); log('5 tap stack (full)', await plates());
    await goSt('window'); await W(400); log('aim window', await state()); await tapMain(); await frames(6); log('6 serve', await plates());
    await goSt('plates'); await W(400); await tapMain(); await frames(4);
    await ev(() => { const D = window.__czfps; D.r.doThrow(0.3); }); await W(2500); log('7 thrown plate', await plates());
    await ev(() => { const D = window.__czfps; const l = [...D.r.loose.values()][0]; if (l) { const p = l.body.position; D.goto(p.x / 1.1, p.z / 1.1 + 0.6); D.lookAt(p.x, p.y, p.z); } }); await W(500); log('aim loose', await state()); await tapMain(); await frames(4); log('8 pick loose', await plates());
    await goSt('plates'); await W(400); log('aim stack w/ empty', await state()); await tapMain(); await frames(4); log('9 back to stack', await plates());
    for (let i = 0; i < 6; i++) { await goSt('plates'); await W(250); await tapMain(); await frames(4); await goSt('counter', i + 1); await W(300); await tapMain(); await frames(4); }
    log('10 six plates out', await plates());
    await W(6000); log('11 later', await plates());
    await goSt('dirty'); await W(400); log('aim dirty', await state()); await tapMain(); await frames(4); log('12 pick dirty', await plates());
    await goSt('sink'); await W(400); log('aim sink', await state()); await tapMain(); await frames(4); log('13 into sink', await plates());
    await shot('plates');
  },
  async fridge() {
    await open();
    await ev(() => { const D = window.__czfps; const c = D.st('crate'); D.front(c, 1.3); D.r.props.by[c.i].door.set(true); D.setPitch(-0.12); D.setYaw(D.pos().yaw + 0.35); });
    await W(1500);
    await shot('fridge-open');
  },
  async corn() {
    await open();
    await ev(() => { const D = window.__czfps; const c = D.st('counter', 1); D.front(c, 1); const x = (c.x + 0.5) * 1.1 + 0.12, z = (c.y + 0.5) * 1.1 + 0.1; D.spawn('milho', x, 1.15, z); });
    await W(1800);
    await ev(() => { const D = window.__czfps; const c = D.st('counter', 1); D.lookAt((c.x + 0.5) * 1.1 - 0.2, 0.92, (c.y + 0.5) * 1.1 - 0.2); });
    await frames(6);
    log('corn on counter', await state());
    await shot('corn-counter');
  },
  async drop() {
    await open();
    await ev(() => { const D = window.__czfps; D.give('tomate'); D.front(D.st('counter'), 1.5); D.setPitch(0.5); });
    await frames(6);
    log('holding tomato, aim nothing', await state());
    await shot('drop-nothing');
    await ev(() => { const D = window.__czfps; D.front(D.st('counter'), 1); });
    await frames(6);
    log('holding tomato, aim counter', await state());
    await shot('drop-counter');
    await ev(() => window.__czfps.r.tap('drop'));
    await frames(20);
    log('after Largar', await state(), await plates());
  },
  async fire() {
    await open();
    await ev(() => { const D = window.__czfps; const p = D.st('pan') || D.st('pot'); p.heat = true; p.dry = 60; D.front(p, 1.4); D.setPitch(-0.25); });
    await W(2500);
    await shot('fire-empty-stove');
    await ev(() => { const D = window.__czfps; D.give('ext'); });
    await frames(6);
    log('ext aimed at fire', await state());
    await ev(() => window.__czfps.act(true));
    await W(2500);
    await shot('fire-spray');
    await ev(() => window.__czfps.act(false));
    log('after spray', await ev(() => { const D = window.__czfps; return D.sim.st.filter((x) => x.fire > 0).length; }));
    await ev(() => { const D = window.__czfps; const c = D.st('counter'); D.front(c, 1); });
    await frames(6);
    log('ext aimed at counter', await state());
  },
  async pop() {
    await open();
    log('has pan', await ev(() => !!window.__czfps.st('pan')));
    // fumaça: fogão ligado vazio há um tempo (antes de pegar fogo)
    await ev(() => { const D = window.__czfps; const p = D.st('pan') || D.st('pot'); p.heat = true; p.dry = 17 * D.sim.fireMul; D.front(p, 1.4); D.setPitch(-0.25); });
    await W(1800);
    await shot('smoke-empty-stove');
    // frigideira esquecida com comida queimada: POC! (o carvão pula fora) e pega fogo
    await ev(() => { const D = window.__czfps; const p = D.st('pan') || D.st('pot'); p.heat = false; p.dry = 0; p.fire = 0; const it = D.sim.newItem(0, 0); it.burnt = true; it.over = 8 + 4 * D.sim.fireMul - 0.3; p.item = it; p.heat = true; D.front(p, 1.4); D.setPitch(-0.25); });
    await W(700);
    await shot('fire-pan-pop');
    await W(3000);
    log('loose after pop', await ev(() => window.__czfps.loose()));
    await shot('fire-pan-after');
  },
  async skip() {
    await open('&czlv=1');
    await W(2500);
    await shot('skip-tutorial');
  },
  async dining() {
    await open('&czday=6');
    await ev(() => { const D = window.__czfps; D.sim.time = D.sim.p.len * 0.6; D.r.ambientT = 0; });
    await page.waitForFunction(() => { const r = window.__czfps.r; for (const w of r.crowd.values()) if (w.y > 0.4) return true; return false; }, null, { timeout: 40000 }).catch(() => console.log('no walker at window'));
    await ev(() => { const D = window.__czfps; const w = D.st('window'); D.front(w, 1.0); D.setPitch(0.04); });
    await W(900);
    await shot('dining-window');
    // serve o 1º pedido: comemora na janela e vai sentar com a bandeja
    await ev(() => { const D = window.__czfps; const o = D.sim.orders[0]; if (!o) return; D.sim.orders.splice(0, 1); D.r.servedPending++; D.r.cheer = { t: 1.8, ok: true, skin: D.r.cheer.skin, x: 0 }; });
    await W(1000);
    await shot('dining-cheer');
    await W(2600);
    // câmera de depuração dentro do salão
    await ev(() => { const D = window.__czfps; D.goto(D.sim.cols / 2, -0.2); D.setYaw(0.25); D.setPitch(-0.3); });
    await W(700);
    await shot('dining-hall-tray');
  },
  async walk() {
    await open();
    await ev(() => { const D = window.__czfps; D.setPitch(-0.1); });
    await page.keyboard.down('KeyW');
    await W(700);
    log('walking', await ev(() => window.__czfps.pos()));
    await shot('walk-1');
    await W(500);
    log('cam', await ev(() => { const r = window.__czfps.r; const c = r.camera.position; return { cx: c.x, cy: c.y, cz: c.z, hand: r.hand.mesh.visible, hs: r.hand.mesh.scale.x, hp: r.hand.mesh.position.toArray(), fov: r.camera.fov, near: r.camera.near }; }));
    await shot('walk-2');
    await page.keyboard.up('KeyW');
    await page.keyboard.down('KeyD');
    await W(800);
    await shot('walk-strafe');
    await page.keyboard.up('KeyD');
    log('walked', await ev(() => window.__czfps.pos()));
  },
  async hall() {
    await open('&czday=6');
    await ev(() => { const D = window.__czfps; D.sim.time = D.sim.p.len * 0.6; D.r.ambientT = 0; });
    await W(12000);
    log('crowd', await ev(() => { const r = window.__czfps.r; return { orders: window.__czfps.sim.orders.length, crowd: r.crowd.size, diners: r.diners.map((d) => d.mode + '@' + d.x.toFixed(1) + ',' + d.z.toFixed(1)), seats: r.kit.dine.length }; }));
    await ev(() => { const D = window.__czfps; D.goto(D.sim.cols / 2, -0.2); D.setYaw(0); D.setPitch(-0.25); });
    await W(800);
    await shot('hall-debug');
  },
  async platethrow() {
    // prato com pedido ERRADO arremessado na janela: antes sumia (pratos acabavam); agora volta e fica pegável
    await open();
    await goSt('window', 0, 1.6);
    await ev(() => { const D = window.__czfps; const pl = D.give('plate'); pl.parts.push(0, 0, 0); });
    await frames(4);
    log('before throw', await plates());
    await ev(() => window.__czfps.r.doThrow(0.35));
    await W(3500);
    log('after throw', await plates(), 'served', await ev(() => window.__czfps.sim.served));
  },
  async bell() {
    await open();
    await ev(() => { const D = window.__czfps; const w = D.st('window'); const p = D.r.props.by[w.i].bell; D.front(w, 1); const b = p.box; const c = b.getCenter(new (D.r.camera.position.constructor)()); D.lookAt(c.x, c.y, c.z); window.__dings = 0; const f = p.onChange; p.onChange = (...a) => { window.__dings++; f?.(...a); }; });
    for (let i = 0; i < 4; i++) {
      await W(500);
      const s = await state();
      await ev(() => window.__czfps.r.tap(window.__czfps.r.verbDef.id));
      log('bell tap', i, s, 'dings', await ev(() => window.__dings));
    }
    await shot('bell');
    // toque real no botão da mão
    for (let i = 0; i < 4; i++) {
      await W(700);
      const b = await page.$('.ix-main');
      const bb = await b.boundingBox();
      await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
      await W(100);
      log('bell touch', i, await state(), 'dings', await ev(() => window.__dings));
    }
  },
};
for (const [n, f] of Object.entries(scenes)) if (!only.length || only.includes(n)) await f();
await browser.close();
