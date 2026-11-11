// Banco de sobrevivência do "Sobreviva aos Desastres" (2D): roda rodadas inteiras sem desenhar,
// com tempo simulado, e mede quantos sobrevivem por desastre e por estratégia:
//   parado  = o seu Bloop sem nenhum comando (fica onde nasceu)
//   óbvio   = bots com habilidade máxima, sem preguiça (vão direto ao "lugar seguro" óbvio)
//   médio   = bots com habilidade 0,6 (aproximação de uma criança média)
// Uso: NODE_PATH=$(npm root -g) node scripts/dev/disaster-bench.mjs [--port 5287] [--rounds 3] [--df 1] [--only tsunami,vulcao] [--mode normal]
// Precisa de um vite rodando (npx vite --port 5287). Saída: tabela + JSON.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const arg = (k, d) => {
  const i = process.argv.indexOf('--' + k);
  return i > 0 ? process.argv[i + 1] : d;
};
const PORT = Number(arg('port', 5287));
const ROUNDS = Number(arg('rounds', 3));
const DF = Number(arg('df', 1));
const ONLY = arg('only', '');
const MODE = arg('mode', 'normal');
const STREAK = Number(arg('streak', 0));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
await ctx.addInitScript((mode) => {
  try {
    localStorage.setItem('bo-quality-detect', JSON.stringify({ v: 'x', tier: 1, score: 0, cap: 3 }));
    localStorage.setItem('bo-disaster-diff', mode);
    localStorage.setItem('bo-disaster', JSON.stringify({ next: 1, best: 0, survived: 0, played: 99 }));
  } catch {
    /* */
  }
}, MODE);
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(`http://localhost:${PORT}/scripts/dev/disaster.html?s=1`);
await p.waitForFunction(() => document.title === 'ready', null, { timeout: 60000 });

const res = await p.evaluate(
  async ({ ROUNDS, DF, ONLY, STREAK }) => {
    const S = await import('/src/games/disaster/scenarios.ts');
    const g = window.dz;
    g.pause();
    const list = S.scenarios();
    const all = Object.keys(S.DISASTERS);
    const ds = ONLY ? ONLY.split(',') : all;
    const out = {};
    // estratégia "óbvia" para desastres de fluido: subir na torre mais alta (escada) e ficar lá
    const FLUIDS = ['tsunami', 'enchente', 'acido', 'vulcao', 'avalanche'];
    const orig = g.plan.bind(g);
    g.plan = (pl, known) => {
      orig(pl, known);
      if (pl.tag !== 'safe' || !known || !FLUIDS.includes(known) || g.finale) return;
      const w = g.world;
      let best = null;
      for (const l of w.ladders) {
        const lb = l.body >= 0 ? w.bodies[l.body] : null;
        if (lb && (!lb.alive || lb.awake || lb.tip)) continue;
        const top = lb ? lb.y : l.top;
        if (!best || top < best.top) best = { x: lb ? lb.x : l.x, top };
      }
      if (!best) return;
      const b = pl.bot;
      if (pl.y <= best.top + 6) {
        // já em cima: anda até o meio do chapéu da torre
        const cap = w.bodies.find((o) => o.alive && o.kind === 'cap' && Math.abs(o.x + o.w - (best.x - 2) - 8) < 20);
        b.gx = cap ? cap.x + cap.w / 2 : best.x - 20;
        b.gy = best.top;
      } else {
        b.gx = best.x + 8;
        b.gy = best.top;
      }
    };
    for (const d of ds) {
      // mesmos 4 mapas para todos (antes/depois comparáveis): vila, praia, cidade, montanha
      const maps = [0, 1, 2, 5].map((i) => S.MAPS[i]);
      const st = { rounds: 0, still: 0, stillN: 0, safe: 0, safeN: 0, spot: 0, spotN: 0, top: 0, topN: 0, avg: 0, avgN: 0, outT: [] };
      for (const map of maps) {
        for (let k = 0; k < ROUNDS; k++) {
          list[0] = { n: 1, seed: 1000 + map.id.length * 131 + k * 977 + d.length * 17, map, disasters: [d], mod: 'none', difficulty: DF };
          g.progress.next = 1;
          g.progress.played = 99;
          g.streak = STREAK;
          if ('benchRounds' in g) g.benchRounds = STREAK;
          g.startRound();
          // estratégias
          for (let i = 0; i < g.players.length; i++) {
            const pl = g.players[i];
            if (i === 0) {
              pl.bot = null;
              continue;
            }
            if (!pl.bot) continue;
            if (i <= 3) {
              pl.bot.skill = 1;
              pl.bot.lazy = 0;
              pl.tag = 'safe';
            } else {
              pl.bot.skill = 0.6;
              pl.bot.lazy = 0.4;
              pl.tag = 'avg';
            }
          }
          // estátuas nos lugares altos "óbvios" (plataformas, copas, telhados, torres): ficam paradas lá
          const w = g.world;
          const spots = [];
          for (const so of w.solids) if (so.oneWay) spots.push({ x: so.x + so.w / 2, y: so.y, k: so.kind });
          for (const bd of w.bodies) if (bd.kind === 'cap' || bd.kind === 'roof') spots.push({ x: bd.x + bd.w / 2, y: bd.y, k: bd.kind });
          if (!g.finale)
            for (const sp of spots) {
              const me = g.players[0];
              g.players.push({ ...me, id: 'spot', self: false, bot: null, x: sp.x, y: sp.y, vx: 0, vy: 0, tag: 'spot', alive: true, ghost: false, input: { l: false, r: false, j: false, u: false }, sprite: null });
            }
          let top = null;
          for (const pl of g.players) if (pl.tag === 'spot' && (!top || pl.y < top.y)) top = pl;
          if (top) top.top = true;
          let guard = 0;
          while (g.phase !== 'end' && guard++ < 60 * 200) g.update(1 / 60);
          st.rounds++;
          for (const pl of g.players) {
            if (pl.self) {
              st.stillN++;
              st.still += pl.alive ? 1 : 0;
            } else if (pl.tag === 'safe') {
              st.safeN++;
              st.safe += pl.alive ? 1 : 0;
            } else if (pl.tag === 'spot') {
              st.spotN++;
              st.spot += pl.alive ? 1 : 0;
              if (pl.top) {
                st.topN++;
                st.top += pl.alive ? 1 : 0;
              }
              continue;
            } else if (pl.tag === 'avg') {
              st.avgN++;
              st.avg += pl.alive ? 1 : 0;
            }
            if (!pl.alive) st.outT.push(Math.round(pl.outT || 0));
          }
        }
      }
      out[d] = {
        rounds: st.rounds,
        still: Math.round((100 * st.still) / Math.max(1, st.stillN)),
        safe: Math.round((100 * st.safe) / Math.max(1, st.safeN)),
        top: Math.round((100 * st.top) / Math.max(1, st.topN)),
        spot: Math.round((100 * st.spot) / Math.max(1, st.spotN)),
        avg: Math.round((100 * st.avg) / Math.max(1, st.avgN)),
        medOut: st.outT.sort((a, b) => a - b)[st.outT.length >> 1] ?? null,
      };
    }
    return out;
  },
  { ROUNDS, DF, ONLY, STREAK },
);
console.log(`df=${DF} mode=${MODE} streak=${STREAK} rounds/map=${ROUNDS}`);
console.log('desastre      rodadas  parado  mais-alto  lugar-alto  bot-esperto  bot-médio  (s até cair, mediana)');
for (const [d, r] of Object.entries(res)) console.log(`${d.padEnd(13)} ${String(r.rounds).padStart(6)} ${String(r.still).padStart(6)}% ${String(r.top).padStart(8)}% ${String(r.spot).padStart(9)}% ${String(r.safe).padStart(10)}% ${String(r.avg).padStart(9)}%   ${r.medOut ?? '-'}`);
console.log(JSON.stringify(res));
await browser.close();
