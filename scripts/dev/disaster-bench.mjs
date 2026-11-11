// Banco de sobrevivência do "Sobreviva aos Desastres" (2D) sobre o CATÁLOGO (catalog.ts): roda rodadas
// inteiras sem desenhar, com tempo simulado, e mede quantos sobrevivem por desastre e por estratégia:
//   parado      = o seu Bloop sem nenhum comando (fica onde nasceu)
//   bot-esperto = bots com habilidade máxima, sem preguiça
//   bot-médio   = bots com habilidade 0,6 (aproximação de uma criança média) — alvo: 40–70% no Normal
// Uso: NODE_PATH=$(npm root -g) node scripts/dev/disaster-bench.mjs [--port 5291] [--rounds 2] [--df 1]
//        [--set base|all|mods|combos] [--only tsunami,c_tornado_raios] [--mode normal] [--why] [--json out.json]
// Precisa de um vite rodando (npx vite --port 5291).
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const arg = (k, d) => {
  const i = process.argv.indexOf('--' + k);
  return i > 0 ? process.argv[i + 1] : d;
};
const PORT = Number(arg('port', 5291));
const ROUNDS = Number(arg('rounds', 2));
const DF = Number(arg('df', 1));
const ONLY = arg('only', '');
const SET = arg('set', 'base');
const MODE = arg('mode', 'normal');
const STREAK = Number(arg('streak', 0));
const JSON_OUT = arg('json', '');

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
await ctx.addInitScript((mode) => {
  try {
    localStorage.setItem('bo-quality-detect', JSON.stringify({ v: 'x', tier: 1, score: 0, cap: 3 }));
    localStorage.setItem('bo-disaster-diff', mode);
    localStorage.setItem('bo-disaster', JSON.stringify({ next: 1, best: 0, survived: 0, played: 99 }));
    localStorage.setItem('bo-dz-pedia', JSON.stringify({ seen: {}, deck: [], recent: [], rounds: 30 }));
  } catch {
    /* */
  }
}, MODE);
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(`http://localhost:${PORT}/scripts/dev/disaster.html?s=1`);
await p.waitForFunction(() => document.title === 'ready', null, { timeout: 60000 });

const res = await p.evaluate(
  async ({ ROUNDS, DF, ONLY, STREAK, SET }) => {
    const C = await import('/src/games/disaster/catalog.ts');
    const g = window.dz;
    g.pause();
    g.benchStreak = STREAK;
    const all = C.entries();
    let list = all;
    if (ONLY) list = all.filter((e) => ONLY.split(',').includes(e.key));
    else if (SET === 'base') list = all.filter((e) => e.hz.length === 1 && !e.mods.length);
    else if (SET === 'mods') list = all.filter((e) => e.hz.length === 1 && e.mods.length);
    else if (SET === 'combos') list = all.filter((e) => e.hz.length > 1);
    const out = {};
    const FLUIDS = ['tsunami', 'enchente', 'acido', 'vulcao', 'avalanche'];
    for (const e of list) {
      const maps = (e.maps ?? C.HAZARDS[e.hz[0]].maps).slice(0, 2);
      const st = { why: {}, rounds: 0, still: 0, stillN: 0, safe: 0, safeN: 0, avg: 0, avgN: 0, outT: [] };
      for (const mapId of maps) {
        for (let k = 0; k < ROUNDS; k++) {
          g.forced = C.buildScenario(e, 1000 + mapId.length * 131 + k * 977 + e.n * 17, DF, mapId);
          g.progress.played = 99;
          g.streak = STREAK;
          g.startRound();
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
            } else if (pl.tag === 'avg') {
              st.avgN++;
              st.avg += pl.alive ? 1 : 0;
              if (!pl.alive) {
                const w = (pl.why || '?').split(' ')[0];
                st.why[w] = (st.why[w] || 0) + 1;
              }
            }
            if (!pl.alive) st.outT.push(Math.round(pl.outT || 0));
          }
        }
      }
      void FLUIDS;
      out[e.key] = {
        n: e.n,
        name: e.name(),
        rounds: st.rounds,
        still: Math.round((100 * st.still) / Math.max(1, st.stillN)),
        safe: Math.round((100 * st.safe) / Math.max(1, st.safeN)),
        avg: Math.round((100 * st.avg) / Math.max(1, st.avgN)),
        medOut: st.outT.sort((a, b) => a - b)[st.outT.length >> 1] ?? null,
        why: st.why,
      };
    }
    return out;
  },
  { ROUNDS, DF, ONLY, STREAK, SET },
);
console.log(`df=${DF} mode=${MODE} streak=${STREAK} rounds/map=${ROUNDS} set=${ONLY || SET}`);
console.log('#   desastre                               rodadas parado esperto  médio  (s até cair)  motivo');
for (const [k, r] of Object.entries(res)) {
  const flag = r.avg < 40 ? ' <' : r.avg > 70 ? ' >' : '  ';
  const why = Object.entries(r.why).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([w, n]) => w + ':' + n).join(' ');
  console.log(`${String(r.n).padStart(3)} ${(k + ' ' + r.name).slice(0, 38).padEnd(38)} ${String(r.rounds).padStart(5)} ${String(r.still).padStart(5)}% ${String(r.safe).padStart(6)}% ${String(r.avg).padStart(5)}%${flag} ${String(r.medOut ?? '-').padStart(6)}   ${why}`);
}
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(res, null, 1));
await browser.close();
