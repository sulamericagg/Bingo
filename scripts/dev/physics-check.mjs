// Regressão de física (Desastres + Queda Giratória + Bloop Orbit).
// Roda os jogos num Chromium headless com TEMPO VIRTUAL (rAF/performance.now controlados)
// a 30, 60 e 120 fps (+ engasgos de GC), e uma rodada real com CPU 4x mais lenta (CDP).
// Uso: NODE_PATH=$(npm root -g) node scripts/dev/physics-check.mjs [--quick]
// Sai com código 1 se alguma invariante falhar.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const PORT = Number(process.env.PORT) || 5199;
const BASE = `http://localhost:${PORT}`;
const VERSION = JSON.parse(readFileSync(root + 'package.json', 'utf8')).version;
const QUICK = process.argv.includes('--quick');

/* ---------------- servidor vite ---------------- */
const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
const killVite = () => {
  try {
    process.kill(-vite.pid);
  } catch {
    /* */
  }
};
process.on('exit', () => killVite());
process.on('uncaughtException', (e) => {
  console.error(e);
  killVite();
  process.exit(2);
});
await new Promise((res, rej) => {
  const to = setTimeout(() => rej(new Error('vite não subiu')), 30000);
  vite.stdout.on('data', (d) => {
    if (String(d).includes('Local')) {
      clearTimeout(to);
      res();
    }
  });
});

/* ---------------- tempo virtual ---------------- */
// rAF só avança quando o teste chama __vt.step(ms). performance.now() segue o relógio virtual.
const VT = (ver) => {
  const tier = Number((location.search.match(/[?&]tier=(\d)/) || [])[1] ?? 2);
  try {
    localStorage.setItem('bo-quality-detect', JSON.stringify({ v: ver, tier, score: 0, cap: 3 }));
    localStorage.setItem('bo-quality', 'auto');
  } catch {
    /* */
  }
  if (!/[?&]vt=1/.test(location.search)) return;
  const vt = { now: 1000, cbs: [], id: 0 };
  window.__vt = vt;
  performance.now = () => vt.now;
  window.requestAnimationFrame = (cb) => {
    vt.cbs.push(cb);
    return ++vt.id;
  };
  window.cancelAnimationFrame = () => {};
  vt.step = (ms) => {
    vt.now += ms;
    const cbs = vt.cbs;
    vt.cbs = [];
    for (const c of cbs) c(vt.now);
  };
};

const browser = await chromium.launch();
const results = [];
let failed = 0;
const check = (name, ok, info) => {
  results.push({ name, ok, info });
  if (!ok) failed++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${info ? '  ' + info : ''}`);
};

async function page(url, { throttle = 0 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(VT, VERSION);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  if (throttle) {
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  }
  await p.goto(BASE + url);
  await p.waitForFunction(() => document.title === 'ready' || window.__tuboGame || (window.__bloop && window.__bloop.game), null, { timeout: 30000, polling: 100 });
  return { p, ctx };
}

/* ================================================================
 *  DESASTRES
 * ================================================================ */

// pulo parado em chão aberto: altura do ápice
async function dzJump(fps, mode) {
  const { p, ctx } = await page('/scripts/dev/disaster.html?s=1&vt=1');
  const r = await p.evaluate(
    ({ fps, mode }) => {
      const g = window.dz;
      const vt = window.__vt;
      const ms = 1000 / fps;
      for (let i = 0; i < 90; i++) vt.step(16.67);
      g.phaseDur = 1e9; // congela na fase atual
      g.phase = 'prepare';
      g.players = [g.me];
      const w = g.world;
      w.bodies.length = 0;
      w.ladders.length = 0;
      w.pickups.length = 0;
      w.houses.length = 0;
      w.trees.length = 0;
      w.solids = w.solids.filter((s) => s.kind === 'ground');
      const me = g.me;
      me.x = w.W / 2;
      me.y = 0;
      me.vx = me.vy = 0;
      me.onGround = true;
      for (let i = 0; i < 30; i++) vt.step(ms);
      let minY = 0;
      let landed = -1;
      g.keys.j = true;
      let t = 0;
      const hitch = mode === 'hitch';
      for (let i = 0; i < 400; i++) {
        const d = hitch && i === 8 ? 180 : ms;
        vt.step(d);
        t += d;
        if (mode === 'tap' && t >= 50) g.keys.j = false;
        if (!Number.isFinite(me.y)) return { nan: true };
        if (me.y < minY) minY = me.y;
        if (i > 3 && me.onGround) {
          landed = t;
          break;
        }
      }
      g.keys.j = false;
      return { apex: -minY, airMs: landed, endY: me.y };
    },
    { fps, mode },
  );
  await ctx.close();
  return r;
}

// rodada inteira com bots: invariantes por frame
async function dzSoak(scenario, fps, { hitches = false, throttle = 0, seconds = 40, tier = 2 } = {}) {
  const { p, ctx } = await page(`/scripts/dev/disaster.html?s=${scenario}&auto=1&tier=${tier}${throttle ? '' : '&vt=1'}`, { throttle });
  const r = await p.evaluate(
    async ({ fps, hitches, seconds, real }) => {
      const g = window.dz;
      const vt = window.__vt;
      const st = { frames: 0, nan: 0, inSolid: 0, inSolidMax: 0, bodyInGround: 0, deepOverlap: 0, maxBodySpeed: 0, bodyVibe: 0, awakeEnd: -1, phases: new Set() };
      const solidPen = (x, y) => {
        let worst = 0;
        for (const s of g.world.solids) {
          if (s.oneWay) continue;
          if (x + 6 <= s.x || x - 6 >= s.x + s.w) continue;
          const pen = Math.min(y - s.y, s.y + s.h - (y - 24));
          if (pen > worst) worst = pen;
        }
        return worst;
      };
      const probe = () => {
        st.frames++;
        st.phases.add(g.phase);
        const w = g.world;
        for (const pl of g.players) {
          if (![pl.x, pl.y, pl.vx, pl.vy].every(Number.isFinite)) st.nan++;
          if (!pl.alive || pl.ghost || pl.climbing) continue;
          const pen = solidPen(pl.x, pl.y);
          if (pen > 3) {
            st.inSolid++;
            st.inSolidMax = Math.max(st.inSolidMax, pen);
          }
        }
        const bs = w.bodies;
        for (let i = 0; i < bs.length; i++) {
          const b = bs[i];
          if (!b.alive) continue;
          if (![b.x, b.y, b.vx, b.vy].every(Number.isFinite)) st.nan++;
          const sp = Math.hypot(b.vx, b.vy);
          if (sp > st.maxBodySpeed) st.maxBodySpeed = sp;
          if (b.tip || b.kind === 'ladder') continue;
          for (const s of w.solids) {
            if (s.oneWay || s.kind !== 'ground') continue;
            if (b.x + b.w <= s.x + 2 || b.x >= s.x + s.w - 2) continue;
            if (b.y + b.h > s.y + 6 && b.y < s.y + s.h) st.bodyInGround++;
          }
          for (let j = i + 1; j < bs.length; j++) {
            const o = bs[j];
            if (!o.alive || o.tip || o.kind === 'ladder') continue;
            const ox = Math.min(b.x + b.w, o.x + o.w) - Math.max(b.x, o.x);
            const oy = Math.min(b.y + b.h, o.y + o.h) - Math.max(b.y, o.y);
            if (ox > 6 && oy > 6) st.deepOverlap++;
          }
        }
      };
      const total = seconds * 1000;
      if (real) {
        // tempo real (CPU estrangulada): amostra a cada frame de verdade
        const t0 = performance.now();
        await new Promise((res) => {
          const f = () => {
            probe();
            if (performance.now() - t0 < total) requestAnimationFrame(f);
            else res();
          };
          requestAnimationFrame(f);
        });
      } else {
        const ms = 1000 / fps;
        let t = 0;
        let k = 0;
        while (t < total) {
          const d = hitches && ++k % 97 === 0 ? 120 + (k % 3) * 60 : ms;
          vt.step(d);
          t += d;
          probe();
        }
      }
      // calmaria: desliga os desastres e vê se tudo dorme
      g.active.clear();
      g.quake = 0;
      g.wind = 0;
      g.tornado.on = false;
      g.fluid = null;
      for (const s of g.strikes) s.on = false;
      g.phase = 'end';
      g.phaseDur = 1e9;
      const calm = 6000;
      if (real) await new Promise((r) => setTimeout(r, calm));
      else for (let t = 0; t < calm; t += 1000 / fps) vt.step(1000 / fps);
      let awake = 0;
      for (const b of g.world.bodies) if (b.alive && b.awake) awake++;
      st.awakeEnd = awake;
      st.phases = [...st.phases].join(',');
      st.roundT = g.roundT;
      st.alive = g.players.filter((p) => p.alive).length + '/' + g.players.length;
      return st;
    },
    { fps, hitches, seconds, real: !!throttle },
  );
  await ctx.close();
  return r;
}

/* ================================================================
 *  QUEDA GIRATÓRIA
 * ================================================================ */
async function tuboRun(fps, { hitches = false, seconds = 30 } = {}) {
  const { p, ctx } = await page('/scripts/dev/tubo.html?play&vt=1');
  const r = await p.evaluate(
    ({ fps, hitches, seconds }) => {
      const g = window.__tuboGame;
      const vt = window.__vt;
      const hit = window.__tuboHit;
      const ms = 1000 / fps;
      for (let i = 0; i < 10; i++) vt.step(ms);
      const st = { frames: 0, nan: 0, hopApex: [], landErr: 0, sink: 0, droppedTaps: 0, taps: 0, rings: 0, deaths: 0, passWrong: 0, fallMs: [] };
      const R = g.geo.R;
      const tap = () => {
        st.taps++;
        const before = g.mode;
        g.onTap();
        if (before === 'hop' && g.mode === 'hop' && !g.queued) st.droppedTaps++;
      };
      // começa
      g.onTap();
      let t = 0;
      let k = 0;
      let curApex = 0;
      let lastHopT = 0;
      let lastMode = g.mode;
      let fallStart = -1;
      let tapAfterBounce = 0;
      while (t < seconds * 1000) {
        const d = hitches && ++k % 61 === 0 ? 150 : ms;
        vt.step(d);
        t += d;
        st.frames++;
        if (![g.footY, g.camY, g.vy, g.sq].every(Number.isFinite)) st.nan++;
        const surf = g.surfaceY(g.ringI);
        if (g.mode === 'hop') {
          const off = surf - g.footY;
          if (off < -0.5) st.sink++;
          // quique completo (encostou no anel de novo sem mergulhar): guarda o ápice
          if (lastMode === 'hop' && g.hopT < lastHopT && curApex > 0) {
            st.hopApex.push(curApex / R);
            curApex = 0;
          }
          if (lastMode !== 'hop') curApex = 0;
          if (off > curApex) curApex = off;
          lastHopT = g.hopT;
        }
        if (lastMode === 'fall' && g.mode !== 'fall') {
          // pousou: pé exatamente na superfície
          st.landErr = Math.max(st.landErr, Math.abs(g.footY - g.surfaceY(g.ringI)) * (g.mode === 'hop' ? 1 : 0));
          if (fallStart >= 0) st.fallMs.push(t - fallStart);
        }
        if (lastMode !== 'fall' && g.mode === 'fall') fallStart = t;
        if (g.mode === 'hop' && lastMode === 'smash') tapAfterBounce = 1; // quicou: tenta mergulhar logo de novo (teste de toque engolido)
        lastMode = g.mode;
        if (g.mode === 'dead') {
          st.deaths++;
          g.mode = 'hop';
          g.revived = false;
          g.flash = 0;
          g.invuln = 1.5;
          g.hud.ov.classList.remove('on');
        }
        if (g.mode === 'hop') {
          const r = g.ringByIdx(g.ringI);
          if (tapAfterBounce) {
            tapAfterBounce = 0;
            const before = g.ringI;
            tap();
            // um toque logo depois do quique tem que gerar mergulho (agora ou assim que a tontura passar)
            if (g.mode === 'hop' && !g.queued) st.droppedTaps += 0; // contado em tap()
            void before;
          } else if (r && hit(r, g.geo).hit === 1 /* Gap */) tap();
          else if (r && Math.random() < 0.02) tap();
        }
      }
      st.rings = g.depth;
      // só quiques normais (o quique de tontura é 1,4× mais alto de propósito)
      const a = st.hopApex.filter((x) => x < 1.8);
      st.hopN = a.length;
      st.hopApexMean = a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
      st.hopApexMin = Math.min(...a);
      st.hopApexMax = Math.max(...a);
      st.fallMean = st.fallMs.length ? st.fallMs.reduce((s, x) => s + x, 0) / st.fallMs.length : 0;
      delete st.hopApex;
      delete st.fallMs;
      return st;
    },
    { fps, hitches, seconds },
  );
  await ctx.close();
  return r;
}

/* ================================================================
 *  BLOOP ORBIT: voo + captura (túnel por planeta pequeno em fps baixo)
 * ================================================================ */
async function orbitFly(fps, speed = 1) {
  const { p, ctx } = await page('/?debug&vt=1');
  const r = await p.evaluate(
    ({ fps, speed }) => {
      const g = window.__bloop.game;
      g.speed = speed;
      const out = [];
      // planeta pequeno a 300px, mira de raspão: deve capturar em qualquer fps
      for (const off of [0, 20, 30, 36, 40, 50, 60, 75, 90]) {
        const pl = { x: 300, y: 0, r: 22, destroyed: false, visited: false, asteroids: [], well: false, n: 50, rot: 0, spin: 0, pulse: 0 };
        let landed = false;
        let path = 0;
        g.planets = [pl];
        g.origin = null;
        g.pState = 'fly';
        g.state = 'menu';
        g.rocketLeft = 0;
        g.flyT = 1;
        g.px = 0;
        g.py = off;
        g.vx = 760 * g.jumpFactor();
        g.vy = 0;
        g.land = () => {
          landed = true;
          g.pState = 'x';
        };
        const dt = 1 / fps;
        for (let i = 0; i < fps * 2 && !landed; i++) {
          g.updatePlayer(dt);
          path++;
        }
        delete g.land;
        out.push({ off, landed, ex: Math.round(g.px), ey: Math.round(g.py) });
      }
      return out;
    },
    { fps, speed },
  );
  await ctx.close();
  return r;
}

/* ================================================================ */
const fpsList = [30, 60, 120];
console.log('\n== Desastres: altura do pulo ==');
const apex = {};
for (const fps of fpsList) {
  apex[fps] = await dzJump(fps, 'hold');
  console.log(`  ${fps} fps: ápice ${apex[fps].apex?.toFixed(1)} px, no ar ${apex[fps].airMs?.toFixed(0)} ms`);
}
const hitchJ = await dzJump(60, 'hitch');
console.log(`  60 fps + engasgo de 180 ms: ápice ${hitchJ.apex?.toFixed(1)} px`);
const tapJ = { 30: await dzJump(30, 'tap'), 60: await dzJump(60, 'tap'), 120: await dzJump(120, 'tap') };
console.log(`  pulinho (solta logo): 30=${tapJ[30].apex.toFixed(1)} 60=${tapJ[60].apex.toFixed(1)} 120=${tapJ[120].apex.toFixed(1)}`);
const ref = apex[60].apex;
for (const fps of [30, 120]) check(`dz pulo ${fps}fps ±5% de 60fps`, Math.abs(apex[fps].apex - ref) / ref <= 0.05, `${apex[fps].apex.toFixed(1)} vs ${ref.toFixed(1)}`);
check('dz pulo com engasgo ±5%', Math.abs(hitchJ.apex - ref) / ref <= 0.05, `${hitchJ.apex.toFixed(1)}`);
for (const fps of [30, 120]) check(`dz pulinho ${fps}fps ±8%`, Math.abs(tapJ[fps].apex - tapJ[60].apex) / tapJ[60].apex <= 0.08, `${tapJ[fps].apex.toFixed(1)} vs ${tapJ[60].apex.toFixed(1)}`);

console.log('\n== Desastres: rodadas com bots ==');
const scen = QUICK ? [1, 4] : [1, 2, 3, 4, 5, 6, 8, 12];
for (const s of scen) {
  for (const [label, opt] of [
    ['60fps', { fps: 60 }],
    ['30fps', { fps: 30 }],
    ['120fps', { fps: 120 }],
    ['60fps+engasgos', { fps: 60, hitches: true }],
    ['60Hz nível Mínimo (cap 30)', { fps: 60, tier: 0 }],
  ]) {
    if (QUICK && label === '120fps') continue;
    const secs = QUICK ? 55 : 75;
    const r = await dzSoak(s, opt.fps, { hitches: opt.hitches, tier: opt.tier, seconds: secs });
    const line = `s${s} ${label}: frames=${r.frames} nan=${r.nan} noSólido=${r.inSolid}(máx ${r.inSolidMax.toFixed(1)}px) corpoNoChão=${r.bodyInGround} sobreposição=${r.deepOverlap} vMáx=${r.maxBodySpeed.toFixed(0)} acordadosNoFim=${r.awakeEnd} vivos=${r.alive} relógio=${r.roundT.toFixed(1)}s`;
    check(`dz s${s} ${label}`, r.nan === 0 && r.inSolid <= 2 && r.maxBodySpeed < 2500 && r.awakeEnd <= 2 && r.bodyInGround < r.frames * 0.01 && r.roundT > secs * 0.9, line);
  }
}
if (!QUICK) {
  const r = await dzSoak(4, 0, { throttle: 4, seconds: 25 });
  check('dz s4 CPU 4x (tempo real)', r.nan === 0 && r.inSolid <= 2 && r.maxBodySpeed < 2500 && r.awakeEnd <= 2, `frames=${r.frames} nan=${r.nan} noSólido=${r.inSolid} vMáx=${r.maxBodySpeed.toFixed(0)} acordadosNoFim=${r.awakeEnd} sobreposição=${r.deepOverlap}`);
}

console.log('\n== Queda Giratória ==');
const tb = {};
for (const fps of fpsList) {
  tb[fps] = await tuboRun(fps, { seconds: QUICK ? 20 : 35 });
  const r = tb[fps];
  console.log(`  ${fps} fps: anéis=${r.rings} quiqueÁpice=${r.hopApexMean.toFixed(3)}R [${r.hopApexMin.toFixed(3)}..${r.hopApexMax.toFixed(3)}] queda=${r.fallMean.toFixed(0)}ms erroPouso=${r.landErr.toFixed(2)} afundou=${r.sink} toquesPerdidos=${r.droppedTaps}/${r.taps} nan=${r.nan}`);
}
const th = await tuboRun(60, { hitches: true, seconds: QUICK ? 20 : 35 });
console.log(`  60 fps + engasgos: quiqueÁpice=${th.hopApexMean.toFixed(3)}R queda=${th.fallMean.toFixed(0)}ms erroPouso=${th.landErr.toFixed(2)} toquesPerdidos=${th.droppedTaps}`);
for (const fps of fpsList) {
  const r = tb[fps];
  check(`tubo ${fps}fps sem NaN/afundar/pouso no ar`, r.nan === 0 && r.sink === 0 && r.landErr < 0.5, '');
  check(`tubo ${fps}fps ápice do quique ±5%`, Math.abs(r.hopApexMax - tb[60].hopApexMax) / tb[60].hopApexMax <= 0.05 && r.hopApexMin / r.hopApexMax > 0.95, `${r.hopApexMin.toFixed(3)}..${r.hopApexMax.toFixed(3)}R`);
  check(`tubo ${fps}fps tempo de queda ±5%`, Math.abs(r.fallMean - tb[60].fallMean) / tb[60].fallMean <= 0.05, `${r.fallMean.toFixed(0)} vs ${tb[60].fallMean.toFixed(0)} ms`);
  check(`tubo ${fps}fps nenhum toque engolido`, r.droppedTaps === 0, `${r.droppedTaps}/${r.taps}`);
}

console.log('\n== Bloop Orbit: captura em voo ==');
for (const speed of [1, 2.1]) {
  const r60 = await orbitFly(60, speed);
  for (const fps of [20, 30, 60, 120]) {
    const r = fps === 60 ? r60 : await orbitFly(fps, speed);
    const s = r.map((x) => `${x.off}:${x.landed ? 'P' : 'x(' + x.ex + ',' + x.ey + ')'}`).join(' ');
    console.log(`  vel ${speed} ${fps} fps: ${s}`);
    if (fps !== 60) check(`orbit vel ${speed} ${fps}fps captura igual a 60fps`, r.every((x, i) => x.landed === r60[i].landed), '');
  }
}

await browser.close();
killVite();
console.log(`\n${results.length - failed}/${results.length} checagens ok`);
process.exit(failed ? 1 : 0);
