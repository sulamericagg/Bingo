// Screenshots do "Sobreviva aos Desastres": cada desastre num momento tenso, 2D e 3D (3ª pessoa com o
// SEU Bloop + 1ª pessoa com as setas de ameaça fora da vista). Paisagem 844×390, dpr 1.
// Uso: NODE_PATH=$(npm root -g) node scripts/dev/disaster-shots.mjs [--port 5287] [--out shots-dgame] [--only tsunami] [--no3d] [--no2d]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const arg = (k, d) => {
  const i = process.argv.indexOf('--' + k);
  return i > 0 ? process.argv[i + 1] : d;
};
const PORT = Number(arg('port', 5287));
const OUT = arg('out', 'shots-dgame');
const ONLY = arg('only', '');
mkdirSync(OUT, { recursive: true });

// o "Meu Bloop" do jogador (gato rosa com saco de papel): tem que aparecer como o personagem
const SAVE = {
  skin: 'custom',
  ownedSkins: ['bloop', 'custom'],
  avatar: { parts: { body: 'b_cat', material: 'm_plush', pattern: 'p_spots', eyes: 'e_big', mouth: 'mo_line', head: 'h_bag', face: 'f_bandaid', back: 'k_none', aura: 'a_none' }, colors: { primary: '#ff7ac8', secondary: '#7ad8ff' } },
};
// momento tenso de cada desastre (s depois que o desastre começou) e mapa
const PLAN = {
  tsunami: { t: 16.5, map: 1 },
  enchente: { t: 30, map: 0 },
  acido: { t: 26, map: 2 },
  vulcao: { t: 22, map: 4 },
  terremoto: { t: 15.5, map: 2 },
  tornado: { t: 14, map: 0 },
  meteoros: { t: 20, map: 6 },
  raios: { t: 18, map: 3 },
  avalanche: { t: 14, map: 5 },
  sumidouro: { t: 16, map: 2 },
  areia: { t: 4, map: 8 },
  meteoro: { t: -6, map: 0 },
};
const list = ONLY ? ONLY.split(',') : Object.keys(PLAN);

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
await ctx.addInitScript((save) => {
  try {
    const k = 'bloop-orbit-save-v1';
    const o = JSON.parse(localStorage.getItem(k) || '{}');
    localStorage.setItem(k, JSON.stringify({ ...o, ...save }));
    localStorage.setItem('bo-quality-detect', JSON.stringify({ v: 'x', tier: 2, score: 0, cap: 3 }));
    localStorage.setItem('bo-disaster', JSON.stringify({ next: 1, best: 0, survived: 0, played: 99 }));
    localStorage.setItem('bo-disaster3d', JSON.stringify({ next: 1, best: 0, played: 99 }));
    localStorage.setItem('bo-disaster-diff', 'normal');
  } catch {
    /* */
  }
}, SAVE);
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));

if (!process.argv.includes('--no2d')) {
  await p.goto(`http://localhost:${PORT}/scripts/dev/disaster.html?s=1`);
  await p.waitForFunction(() => document.title === 'ready', null, { timeout: 60000 });
  await p.waitForTimeout(600);
  for (const d of list) {
    const pl = PLAN[d];
    const info = await p.evaluate(
      async ({ d, pl }) => {
        const S = await import('/src/games/disaster/scenarios.ts');
        const g = window.dz;
        g.pause();
        const L = S.scenarios();
        L[0] = { n: 1, seed: 4242 + d.length * 31, map: S.MAPS[pl.map], disasters: [d], mod: 'none', difficulty: 2 };
        g.progress.next = 1;
        g.progress.played = 99;
        g.autoMe = true;
        g.startRound();
        // avança até o momento (seu Bloop protegido enquanto avança: só para a foto ter você vivo)
        let guard = 0;
        // ondas: espera a frente chegar perto de você (o momento tenso)
        const near = () => !g.fluid || !g.fluid.dir || d === 'vulcao' || Math.abs(g.fluid.front - g.me.x) < 260 || g.phaseT > pl.t + 14;
        const done = () => (pl.t < 0 ? g.phase === 'prepare' && g.phaseT > -pl.t : g.phase === 'disaster' && g.phaseT >= pl.t && near());
        while (!done() && guard++ < 60 * 140) {
          g.me.shield = 9;
          g.update(1 / 60);
        }
        g.me.shield = 0;
        // caiu num buraco enquanto protegido: volta para o chão firme ao lado (só para a foto)
        if (g.me.y > 30) {
          g.me.x = Math.max(40, g.me.x - 120);
          g.me.y = g.world.topAt(g.me.x);
          g.me.vy = 0;
        }
        for (let i = 0; i < 3; i++) g.update(1 / 60);
        g.draw.frame();
        return { phase: g.phase, t: g.phaseT.toFixed(1), alive: g.players.filter((q) => q.alive).length, me: [Math.round(g.me.x), Math.round(g.me.y)], swim: g.me.swim };
      },
      { d, pl },
    );
    await p.waitForTimeout(1500);
    await p.screenshot({ path: `${OUT}/2d-${d}.png` });
    console.log('2d', d, JSON.stringify(info));
  }
}

if (!process.argv.includes('--no3d')) {
  await p.goto(`http://localhost:${PORT}/scripts/dev/disaster.html?d3=1`);
  await p.waitForFunction(() => document.title === 'ready', null, { timeout: 60000 });
  await p.waitForTimeout(800);
  for (const d of list) {
    const pl = PLAN[d];
    for (const view of ['tp', 'fp']) {
      const info = await p.evaluate(
        async ({ d, pl, view }) => {
          const S = await import('/src/games/disaster/scenarios.ts');
          const g = window.dz3;
          g.paused = true;
          const L = S.scenarios();
          L[0] = { n: 1, seed: 4242 + d.length * 31, map: S.MAPS[pl.map], disasters: [d], mod: 'none', difficulty: 2 };
          g.progress.next = 1;
          g.progress.played = 99;
          g.cv.mode = view;
          g.startRound();
          const me = g.me;
          const ko = g.knockOut.bind(g);
          g.knockOut = (q) => {
            if (!q.self) ko(q);
          };
          // você: anda um pouco pela ilha (protegido enquanto avança para a foto)
          let guard = 0;
          const tt = pl.t < 0 ? 6 : Math.min(pl.t, 18);
          while (!(g.phase === 'disaster' && g.phaseT >= tt) && guard++ < 60 * 120) {
            if (!me.alive) {
              me.alive = true;
              me.pos.set(0, g.topAt(0, -12), -12);
              me.mesh.visible = true;
            }
            me.air = 1;
            g.update(1 / 60);
          }
          // olha: 3ª pessoa de frente para a ameaça; 1ª pessoa de lado para ela (setas na borda)
          let tx = 0;
          let tz = 0;
          const s = g.strikes.find((o) => o.on);
          if (g.tornado.on) {
            tx = g.tornado.x;
            tz = g.tornado.z;
          } else if (g.fluid && g.fluid.dir) {
            tx = g.fluid.front;
            tz = me.pos.z;
          } else if (s) {
            tx = s.x;
            tz = s.z;
          } else {
            tx = me.pos.x + 5;
            tz = me.pos.z;
          }
          const a = Math.atan2(tx - me.pos.x, tz - me.pos.z);
          g.yaw = view === 'fp' ? a + 1.9 : a;
          g.pitch = view === 'fp' ? 0.3 : 0.38;
          if (view === 'fp') {
            // ameaças garantidas fora da vista para mostrar as setas
            // ameaças garantidas fora da vista (atrás e ao lado) para mostrar as setas
            for (const [ang, kind] of [[g.yaw + Math.PI, d === 'raios' ? 'bolt' : 'meteor'], [g.yaw - 1.6, d === 'vulcao' ? 'bomb' : 'meteor']]) {
              g.spawnStrike(kind);
              const st = g.strikes.find((o) => o.on && !o.mark);
              if (st) st.mark = 1;
              if (!st) continue;
              st.x = me.pos.x + Math.sin(ang) * 6;
              st.z = me.pos.z + Math.cos(ang) * 6;
              st.y = g.topAt(st.x, st.z);
              st.t = st.T * 0.4;
              st.ring.position.set(st.x, st.y + 0.06, st.z);
            }
          }
          g.knockOut = ko;
          for (let i = 0; i < 4; i++) {
            me.alive = true;
            g.update(1 / 60);
          }
          g.render(1 / 60);
          g.edgeTick();
          return { phase: g.phase, t: g.phaseT.toFixed(1), mode: g.cv.mode, alive: g.players.filter((q) => q.alive).length, edges: [...document.querySelectorAll('.d3-edge.on')].length };
        },
        { d, pl, view },
      );
      await p.waitForTimeout(1500);
      await p.evaluate(() => window.dz3.render(1 / 60));
      await p.screenshot({ path: `${OUT}/3d-${view}-${d}.png` });
      console.log('3d', view, d, JSON.stringify(info));
    }
  }
}
await browser.close();
