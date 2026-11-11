// Screenshots do "Sobreviva aos Desastres" a partir do CATÁLOGO (catalog.ts): cada desastre num momento
// tenso, 2D e 3D, + roleta "Próximo desastre: ?" e Desastrepédia. Paisagem 844×390, dpr 1.
// Uso: NODE_PATH=$(npm root -g) node scripts/dev/disaster-shots.mjs [--port 5291] [--out shots-dis3]
//        [--only tsunami@praia:16,pianos] [--no3d] [--no2d] [--ui] [--tier 2] [--fp]
// Cada item: chave[@mapa][:segundos]. Sem --only usa a lista PLAN abaixo.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const arg = (k, d) => {
  const i = process.argv.indexOf('--' + k);
  return i > 0 ? process.argv[i + 1] : d;
};
const PORT = Number(arg('port', 5291));
const OUT = arg('out', 'shots-dis3');
const ONLY = arg('only', '');
const TIER = Number(arg('tier', 2));
mkdirSync(OUT, { recursive: true });

const SAVE = {
  skin: 'custom',
  ownedSkins: ['bloop', 'custom'],
  avatar: { parts: { body: 'b_cat', material: 'm_plush', pattern: 'p_spots', eyes: 'e_big', mouth: 'mo_line', head: 'h_bag', face: 'f_bandaid', back: 'k_none', aura: 'a_none' }, colors: { primary: '#ff7ac8', secondary: '#7ad8ff' } },
};
const PLAN = [
  'tsunami@praia:15', 'geleia@doces:14', 'lama@montanha:12', 'enchente@cidade:28', 'chocolate@doces:26', 'bolhas@parque:24',
  'vulcao@ilha:20', 'chaolava@parque:18', 'acido@cidade:24', 'avalanche@polo:13', 'meteoros@estacao:18', 'granizo@fazenda:16',
  'doces@doces:16', 'melancias@fazenda:16', 'pianos@cidade:18', 'boliche@parque:14', 'bolaneve@polo:16', 'raios@floresta:16',
  'terremoto@cidade:15', 'tornado@fazenda:14', 'furacao@praia:16', 'sumidouro@deserto:16', 'gelo@polo:14', 'areia@deserto:6',
  'vento@porto:8', 'meteoro@vila:-6', 'gravidade@estacao:9', 'lua@estacao:14', 'buraco@cidade:14', 'abducao@fazenda:12',
  'laser@estacao:10', 'pisao@cidade:10', 'calor@deserto:14', 'incendio@floresta:20', 'nevasca@polo:16', 'geiser@ilha:12',
  'fantasma@floresta:14', 'abelhas@fazenda:12', 'c_tornado_raios@vila:20', 'tsunami_noite@porto:16',
];
const list = (ONLY ? ONLY.split(',') : PLAN).map((s) => {
  const m = /^([a-z_]+)(?:@([a-z]+))?(?::(-?[\d.]+))?$/.exec(s);
  return { key: m[1], map: m[2] || '', t: m[3] ? Number(m[3]) : 14 };
});

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
await ctx.addInitScript(
  ({ save, tier }) => {
    try {
      const k = 'bloop-orbit-save-v1';
      const o = JSON.parse(localStorage.getItem(k) || '{}');
      localStorage.setItem(k, JSON.stringify({ ...o, ...save }));
      localStorage.setItem('bo-quality-detect', JSON.stringify({ v: 'x', tier, score: 0, cap: 3 }));
      localStorage.setItem('bo-disaster', JSON.stringify({ next: 1, best: 0, survived: 0, played: 99 }));
      localStorage.setItem('bo-disaster3d', JSON.stringify({ next: 1, best: 0, played: 99 }));
      localStorage.setItem('bo-disaster-diff', 'normal');
      if (!localStorage.getItem('bo-dz-pedia')) localStorage.setItem('bo-dz-pedia', JSON.stringify({ seen: {}, deck: [], recent: [], rounds: 30 }));
    } catch {
      /* */
    }
  },
  { save: SAVE, tier: TIER },
);
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));

/* ---------- interface: roleta e Desastrepédia ---------- */
if (process.argv.includes('--ui')) {
  await p.goto(`http://localhost:${PORT}/scripts/dev/disaster.html?s=1`);
  await p.waitForFunction(() => document.title === 'ready', null, { timeout: 60000 });
  // alguns descobertos para a coleção
  await p.evaluate(async () => {
    const C = await import('/src/games/disaster/catalog.ts');
    const pd = C.loadPedia();
    for (const e of C.entries()) if (e.n % 3 !== 0 && e.n < 80) pd.seen[e.key] = [1 + (e.n % 4), e.n % 3];
    C.savePedia(pd);
    const g = window.dz;
    g.pause();
    const R = await import('/src/games/disaster/roulette.ts');
    R.showRoulette(g.root, C.entryByKey('c_tornado_raios'), { isNew: true, spin: 1.2, hold: 30 });
  });
  await p.waitForTimeout(700);
  await p.evaluate(() => window.dz.draw.frame());
  await p.screenshot({ path: `${OUT}/ui-roulette-spin.png` });
  await p.waitForTimeout(1300);
  await p.screenshot({ path: `${OUT}/ui-roulette-reveal.png` });
  await p.evaluate(async () => {
    document.querySelectorAll('.dzr').forEach((e) => e.remove());
    const R = await import('/src/games/disaster/roulette.ts');
    R.openPedia(window.dz.root);
  });
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/ui-pedia.png` });
  await p.evaluate(() => document.querySelector('.dzp .c:not(.off)')?.click());
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/ui-pedia-card.png` });
  await p.evaluate(() => document.querySelector('.dzp')?.remove());
  console.log('ui ok');
}

if (!process.argv.includes('--no2d')) {
  await p.goto(`http://localhost:${PORT}/scripts/dev/disaster.html?s=1`);
  await p.waitForFunction(() => document.title === 'ready', null, { timeout: 60000 });
  await p.waitForTimeout(600);
  for (const it of list) {
    const info = await p.evaluate(async (it) => {
      const C = await import('/src/games/disaster/catalog.ts');
      const g = window.dz;
      g.pause();
      const e = C.entryByKey(it.key);
      if (!e) return { err: 'no entry ' + it.key };
      g.forced = C.buildScenario(e, 4242 + it.key.length * 31, 2, it.map || undefined);
      g.progress.played = 99;
      g.autoMe = true;
      g.startRound();
      let guard = 0;
      const near = () => !g.fluid || !g.fluid.dir || it.key.startsWith('vulcao') || Math.abs(g.fluid.front - g.me.x) < 260 || g.phaseT > it.t + 14;
      const done = () => (it.t < 0 ? g.phase === 'prepare' && g.phaseT > -it.t : g.phase === 'disaster' && g.phaseT >= it.t && near());
      while (!done() && guard++ < 60 * 140) {
        g.me.shield = 9;
        g.update(1 / 60);
      }
      g.me.shield = 0;
      if (g.me.y > 30) {
        g.me.x = Math.max(40, g.me.x - 120);
        g.me.y = g.world.topAt(g.me.x);
        g.me.vy = 0;
      }
      for (let i = 0; i < 3; i++) g.update(1 / 60);
      g.draw.frame();
      return { phase: g.phase, t: g.phaseT.toFixed(1), alive: g.players.filter((q) => q.alive).length, map: g.sc.map.id };
    }, it);
    await p.waitForTimeout(250);
    await p.evaluate(() => window.dz.draw.frame());
    await p.screenshot({ path: `${OUT}/2d-${it.key}.png` });
    console.log('2d', it.key, JSON.stringify(info));
  }
}

if (!process.argv.includes('--no3d')) {
  await p.goto(`http://localhost:${PORT}/scripts/dev/disaster.html?d3=1`);
  await p.waitForFunction(() => document.title === 'ready', null, { timeout: 60000 });
  await p.waitForTimeout(800);
  const views = process.argv.includes('--fp') ? ['tp', 'fp'] : ['tp'];
  for (const it of list) {
    for (const view of views) {
      const info = await p.evaluate(
        async ({ it, view }) => {
          const C = await import('/src/games/disaster/catalog.ts');
          const g = window.dz3;
          g.paused = true;
          const e = C.entryByKey(it.key);
          if (!e) return { err: 'no entry' };
          g.forced = C.buildScenario(e, 4242 + it.key.length * 31, 2, it.map || undefined);
          g.progress.played = 99;
          g.cv.mode = view;
          g.startRound();
          const me = g.me;
          const ko = g.knockOut.bind(g);
          g.knockOut = (q) => {
            if (!q.self) ko(q);
          };
          let guard = 0;
          const tt = it.t < 0 ? 6 : Math.min(it.t, 18);
          while (!(g.phase === 'disaster' && g.phaseT >= tt) && guard++ < 60 * 120) {
            if (!me.alive) {
              me.alive = true;
              me.pos.set(0, g.topAt(0, -12), -12);
              me.mesh.visible = true;
            }
            me.air = 1;
            if (me.meter !== undefined) me.meter = 0;
            g.update(1 / 60);
          }
          const tgt = g.threatPos ? g.threatPos() : null;
          const tx = tgt ? tgt.x : me.pos.x + 5;
          const tz = tgt ? tgt.z : me.pos.z;
          const a = Math.atan2(tx - me.pos.x, tz - me.pos.z);
          g.yaw = view === 'fp' ? a + 1.9 : a;
          g.pitch = view === 'fp' ? 0.25 : 0.32;
          g.knockOut = ko;
          for (let i = 0; i < 4; i++) {
            me.alive = true;
            g.update(1 / 60);
          }
          g.render(1 / 60);
          return { phase: g.phase, t: g.phaseT.toFixed(1), alive: g.players.filter((q) => q.alive).length, map: g.sc.map.id };
        },
        { it, view },
      );
      await p.waitForTimeout(900);
      await p.evaluate(() => window.dz3.render(1 / 60));
      await p.screenshot({ path: `${OUT}/3d-${view}-${it.key}.png` });
      console.log('3d', view, it.key, JSON.stringify(info));
    }
  }
}
await browser.close();
