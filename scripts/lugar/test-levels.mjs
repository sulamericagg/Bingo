// Verifica as fases do Bloop no Lugar. Uso: node scripts/lugar/test-levels.mjs [quantas=300]
// Para cada fase: regiões conexas e completas, solução válida, busca exata acha EXATAMENTE uma solução
// (a mesma), e o solucionador lógico resolve sem chute. Mostra estatísticas por dificuldade.
import { build } from 'esbuild';

const out = await build({ entryPoints: ['src/games/lugar/levels.ts'], bundle: true, write: false, format: 'esm', platform: 'neutral' });
const M = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
const out2 = await build({ entryPoints: ['src/games/lugar/engine.ts'], bundle: true, write: false, format: 'esm', platform: 'neutral' });
const E = await import('data:text/javascript;base64,' + Buffer.from(out2.outputFiles[0].text).toString('base64'));

const COUNT = +process.argv[2] || 300;
const names = ['Fácil', 'Médio', 'Difícil', 'Expert', 'Mestre'];
const fails = [];
const byTier = names.map(() => ({ n: 0, sizes: {}, steps: 0, ms: 0, techs: {}, score: 0 }));
const bySize = {};

function check(p, label) {
  const { n, reg, sol } = p;
  // regiões: n regiões, todas conexas
  const ids = new Set(reg);
  if (ids.size !== n) return `${label}: ${ids.size} regiões (esperado ${n})`;
  for (const g of ids) {
    const cells = [...reg.keys()].filter((c) => reg[c] === g);
    const seen = new Set([cells[0]]);
    const st = [cells[0]];
    while (st.length) {
      const c = st.pop();
      const r = Math.floor(c / n), k = c % n;
      for (const [dr, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const rr = r + dr, kk = k + dk;
        if (rr < 0 || kk < 0 || rr >= n || kk >= n) continue;
        const d = rr * n + kk;
        if (reg[d] === g && !seen.has(d)) (seen.add(d), st.push(d));
      }
    }
    if (seen.size !== cells.length) return `${label}: região ${g} desconexa`;
  }
  // solução: 1 por linha/coluna/região, sem encostar
  if (new Set(sol).size !== n) return `${label}: colunas repetidas`;
  if (new Set(sol.map((k, r) => reg[r * n + k])).size !== n) return `${label}: regiões repetidas`;
  for (let r = 1; r < n; r++) if (Math.abs(sol[r] - sol[r - 1]) < 2) return `${label}: Bloops se encostam`;
  const all = E.solveExact(n, reg, 2);
  if (all.length !== 1) return `${label}: ${all.length} soluções`;
  if (all[0].some((k, r) => k !== sol[r])) return `${label}: solução diferente`;
  const rt = E.rate(n, reg);
  if (!rt.solved) return `${label}: lógica não resolve`;
  return null;
}

const t0 = Date.now();
// amostra espalhada pela trilha inteira (todos os tamanhos) + desafios do dia
const picks = [];
const nLevels = Math.min(COUNT - 20, M.LEVELS);
for (let i = 0; i < nLevels; i++) picks.push(['L', Math.floor((i * M.LEVELS) / nLevels)]);
for (let d = 0; d < COUNT - nLevels; d++) picks.push(['D', 20400 + d]);
for (const [kind, i] of picks) {
  const a = performance.now();
  const p = kind === 'L' ? M.levelPuzzle(i) : M.dailyPuzzle(i);
  const ms = performance.now() - a;
  const err = check(p, kind === 'L' ? `fase ${i + 1}` : `dia ${i}`);
  if (err) fails.push(err);
  const T = byTier[p.rating.tier];
  T.n++;
  T.sizes[p.n] = (T.sizes[p.n] ?? 0) + 1;
  T.steps += p.rating.steps;
  T.ms += ms;
  T.score += p.rating.score;
  for (const [k, v] of Object.entries(p.rating.counts)) T.techs[k] = (T.techs[k] ?? 0) + v;
  const S = (bySize[p.n] ??= { n: 0, ms: 0, tiers: [0, 0, 0, 0, 0] });
  S.n++;
  S.ms += ms;
  S.tiers[p.rating.tier]++;
}

console.log(`\n${picks.length} fases verificadas em ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
console.log('Por dificuldade (técnicas = passos usados no total):');
byTier.forEach((T, i) => {
  if (!T.n) return;
  const sizes = Object.entries(T.sizes).map(([k, v]) => `${k}×${k}:${v}`).join(' ');
  const techs = Object.entries(T.techs).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ');
  console.log(`  ${names[i].padEnd(8)} ${String(T.n).padStart(4)} fases · nota média ${(T.score / T.n).toFixed(0)} · ${(T.steps / T.n).toFixed(1)} passos · ${sizes}\n           técnicas: ${techs}`);
});
console.log('\nPor tamanho (fáceis/médias/difíceis/expert/mestre · tempo médio de geração):');
for (const [n, S] of Object.entries(bySize)) console.log(`  ${n}×${n}: ${String(S.n).padStart(3)} fases · ${S.tiers.join('/')} · ${(S.ms / S.n).toFixed(0)} ms`);
console.log(fails.length ? `\nFALHAS (${fails.length}):\n  ` + fails.join('\n  ') : '\nOK: todas com solução única e resolvíveis por lógica.');
process.exit(fails.length ? 1 : 0);
