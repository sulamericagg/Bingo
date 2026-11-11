// Teste/screenshots do Anomalias & Cia: uma noite inteira com toque emulado (paisagem 844×390).
//   PORT=5317 node scripts/dev/shoot-anomalias.mjs <outDir> [cena ...]    (requer vite rodando)
//   cenas: menu flow pairs task hunt dawn perf
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] ?? 'shots-ano';
const port = process.env.PORT ?? 5317;
const only = process.argv.slice(3);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
page.on('console', (m) => m.type() === 'error' && console.error('CONSOLE', m.text()));
const W = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const shot = async (n) => {
  await page.screenshot({ path: `${out}/${n}.png` });
  console.log('ok', n);
};
const tapSel = async (sel) => {
  const b = await page.$(sel);
  if (!b) throw new Error('sem ' + sel);
  const r = await b.boundingBox();
  await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2);
};
const log = (o) => console.log(JSON.stringify(o));

async function open(fresh = true) {
  await page.goto(`http://localhost:${port}/scripts/dev/anomalias.html?debug`);
  await W(800);
  if (fresh) {
    await ev(() => localStorage.removeItem('bw-anomalias'));
    await page.reload();
  }
  await W(2200);
}
async function startNight() {
  await tapSel('[data-play]');
  await page.waitForFunction(() => window.__ano?.shift, null, { timeout: 30000 });
  await W(1800);
}
/** olha para o ponto da anomalia a ~2,4 m (vindo do centro da sala) */
const aim = (slotId, dist = 2.4) =>
  ev(
    ([slotId, dist]) => {
      const s = window.__ano.shift;
      const si = s.slotsInfo.find((x) => x.slot.id === slotId);
      const a = si.anchor0;
      const r = s.o.build.rooms.find((r) => r.id === si.slot.room);
      const cx = (r.min.x + r.max.x) / 2,
        cz = (r.min.z + r.max.z) / 2;
      let dx = cx - a.x,
        dz = cz - a.z;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
      const m = 0.45;
      const px = Math.min(r.max.x - m, Math.max(r.min.x + m, a.x + dx * dist));
      const pz = Math.min(r.max.z - m, Math.max(r.min.z + m, a.z + dz * dist));
      s.debugLook(px, pz, a.x, a.y, a.z);
      return { px, pz, a: [a.x, a.y, a.z] };
    },
    [slotId, dist],
  );

const scenes = {
  async menu() {
    await open(true);
    await shot('00-menu');
  },
  async flow() {
    await open(true);
    await startNight();
    await shot('01-notebook-auto');
    await tapSel('.ano-pol[data-r="q1"]');
    await W(500);
    await shot('02-notebook-big');
    await ev(() => window.__ano.shift.hud.closePanel());
    await W(1200);
    await shot('03-memorize');
    await tapSel('[data-k="go"]');
    await W(1200);
    await shot('04-shift-start');
    // anomalia escondida (jogador na recepção, olhando para o outro lado)
    await ev(() => window.__ano.shift.debugLook(-17, 5.6, -17, 1.5, 7.4));
    const a = await ev(() => {
      const s = window.__ano.shift;
      const x = s.debugSpawn('q1_teddy', 'swap', 0);
      return x && { id: x.id, kind: x.kind };
    });
    log({ spawned: a });
    // monitor: vai até a câmera do Quarto 1
    await tapSel('[data-k="mon"]');
    await W(600);
    await tapSel('.ano-mon .tab[data-room="q1"]');
    await W(1200);
    await shot('05-monitor-q1');
    await tapSel('.ano-mon [data-ref]');
    await W(400);
    await shot('06-monitor-compare');
    await ev(() => window.__ano.shift.hud.closePanel());
    await W(300);
    // foto da anomalia
    await aim('q1_teddy', 2.2);
    await W(400);
    await tapSel('[data-k="cam"]');
    await W(700);
    await shot('07-viewfinder');
    await tapSel('[data-k="shut"]');
    await W(350);
    await shot('08-registered');
    await W(1500);
    log({ stats: await ev(() => window.__ano.shift.statsNow), danger: await ev(() => window.__ano.shift.danger) });
    // foto errada
    await ev(() => window.__ano.shift.debugLook(-10.5, -3.0, -13.5, 1.2, -3.0));
    await W(1300);
    await tapSel('[data-k="shut"]');
    await W(350);
    await shot('09-wrong-photo');
    await W(1200);
    await tapSel('[data-k="lower"]');
    // anomalia que escapa
    await ev(() => {
      const s = window.__ano.shift;
      s.debugLook(-17, 5.6, -17, 1.5, 7.4);
      const a = s.debugSpawn('pic_cor1', 'picture', 1);
      a.deadline = s.t + 0.5;
    });
    await W(1500);
    await shot('10-missed-danger');
    log({ stats: await ev(() => window.__ano.shift.statsNow), danger: await ev(() => window.__ano.shift.danger) });
  },
  async task() {
    // remédio: armário → escolher → levar ao paciente
    const want = await ev(() => {
      const s = window.__ano.shift;
      const t = s.tasks.tasks.find((x) => x.want) ?? null;
      return t && { id: t.def.id, want: t.want, at: t.def.at };
    });
    log({ medTask: want });
    if (!want) {
      // garante uma tarefa de remédio
      await ev(() => {
        const s = window.__ano.shift;
        const d = s.o.build.interacts.find((x) => x.kind === 'medicine');
        s.tasks.tasks.push({ def: d, want: d.wants[0], done: false });
      });
    }
    const w = await ev(() => {
      const s = window.__ano.shift;
      const t = s.tasks.tasks.find((x) => x.want && !x.done);
      return { id: t.def.id, want: t.want, at: t.def.at };
    });
    await ev(() => window.__ano.shift.debugLook(2.6, -6.15, 2.6, 1.0, -7.2));
    await W(900);
    await shot('11-pharmacy-use');
    await tapSel('[data-k="use"]');
    await W(600);
    await shot('12-choose-medicine');
    await tapSel(`.ano-opt[data-o="${w.want}"]`);
    await W(700);
    await ev(([x, z]) => {
      const s = window.__ano.shift;
      const d = s.tasks.tasks.find((t) => t.want && !t.done).def;
      const o = d.object.getWorldPosition(d.object.position.clone());
      s.debugLook(x, z, o.x, o.y, o.z);
    }, [w.at.x, w.at.z]);
    await W(900);
    await shot('13-deliver-medicine');
    await tapSel('[data-k="use"]');
    await W(400);
    await shot('14-task-done');
    log({ tasks: await ev(() => window.__ano.shift.tasks.tasks.map((t) => [t.def.id, t.done])) });
  },
  async pairs() {
    const list = [
      ['pic_rec', 'picture', 1],
      ['npc_p2', 'face', 1],
      ['q3_win', 'picture', 1],
      ['mirror', 'picture', 0],
      ['q2_cur', 'move', 0],
      ['lamp_cor', 'light', 1],
      ['q4_door', 'door', 0],
      ['npc_nurse2', 'face', 2],
      ['plant_rec', 'swap', 0],
      ['horse', 'color', 1],
      ['estoq_corner', 'creature', 0],
      ['wheel', 'move', 0],
    ];
    for (const [id, kind, v] of list) {
      await aim(id, id === 'lamp_cor' ? 3.5 : 2.4);
      await W(700);
      await shot(`p-${id}-a`);
      const ok = await ev(([id, kind, v]) => !!window.__ano.shift.debugSpawn(id, kind, v), [id, kind, v]);
      await W(900);
      await shot(`p-${id}-b`);
      if (!ok) console.log('falhou', id);
      // limpa
      await ev(() => {
        const s = window.__ano.shift;
        for (const a of [...s.dir.active]) {
          s.dir.resolve(a.id, s.t);
          s['applyAnomaly'](a, false);
        }
      });
    }
  },
  async hunt() {
    await ev(() => {
      const s = window.__ano.shift;
      s.debugLook(-1.0, 0, 10, 1.2, 0);
      s.debugDanger(100);
    });
    await W(400);
    await ev(() => {
      const s = window.__ano.shift;
      const h = s.hunt;
      h.pos.set(6, 0, 0);
      h.t = 3;
    });
    await W(500);
    await shot('15-hunt');
    await tapSel('[data-k="cam"]');
    await W(500);
    await tapSel('[data-k="shut"]');
    await W(300);
    await shot('16-flash-scares');
    await W(1500);
    await tapSel('[data-k="lower"]');
    log({ afterScare: await ev(() => ({ danger: window.__ano.shift.danger, hunt: !!window.__ano.shift.hunt })) });
    // agora ele pega
    await ev(() => {
      const s = window.__ano.shift;
      s.debugDanger(100);
    });
    await W(300);
    await ev(() => {
      const s = window.__ano.shift;
      s.hunt.pos.set(s.pos.x + 2.5, 0, s.pos.z);
      s.hunt.t = 3;
    });
    await page.waitForFunction(() => window.__ano.shift?.state === 'caught', null, { timeout: 20000 });
    await W(550);
    await shot('17-caught-lunge');
    await page.waitForSelector('.ano-caught.on', { timeout: 20000 });
    await W(700);
    await shot('18-caught-screen');
  },
  async dawn() {
    await tapSel('[data-again]');
    await page.waitForFunction(() => window.__ano?.shift?.state === 'memorize', null, { timeout: 30000 });
    await W(1500);
    await ev(() => window.__ano.shift.beginShift());
    await ev(() => {
      const s = window.__ano.shift;
      s.debugTime(s.cfg.shiftSec - 1.5);
    });
    await page.waitForFunction(() => window.__ano.shift?.state === 'dawn', null, { timeout: 30000 });
    await W(900);
    await shot('19-dawn');
    await page.waitForSelector('[data-next]', { timeout: 30000 });
    await W(900);
    await shot('20-night-complete');
    log({ save: await ev(() => localStorage.getItem('bw-anomalias')) });
  },
  async perf() {
    const r = await ev(async () => {
      const s = window.__ano.shift;
      const out = {};
      for (const [k, x, z, tx, tz] of [
        ['corridor', -13, 0, 10, 0],
        ['lobby', -15, 5, -18.5, -3],
        ['q1', -8.5, -2.4, -11.5, -6.4],
        ['espera', 10.5, 0.5, 10.5, 6.5],
      ]) {
        s.debugLook(x, z, tx, 1.0, tz);
        await new Promise((r) => setTimeout(r, 2500));
        const i = s.world.renderer.info.render;
        out[k] = { fps: +s.fps.toFixed(1), calls: i.calls, tris: i.triangles };
      }
      return out;
    });
    log({ perf: r });
  },
};

if (!only.length || only.includes('menu')) await scenes.menu();
await scenes.flow();
for (const k of ['task', 'pairs', 'hunt', 'dawn']) if (!only.length || only.includes(k)) await scenes[k]();
if (only.includes('perf')) await scenes.perf();
await browser.close();
