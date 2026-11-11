// Depois de mudar a física do Monta & Leva: acha novas soluções SÓ para as fases que deixaram de passar,
// sem mexer na fase (pista, peças, metas e numeração ficam iguais → o save continua valendo).
// Mantém o carro da solução e testa outros roteiros de direção (com as mesmas perturbações do gerador).
// Uso: node scripts/dev/montaleva-resolve.mjs [fases separadas por vírgula]   → reescreve as linhas em solutions-data.ts
//      Fases clássicas (levels.ts/solutions.ts) só são sugeridas no terminal (edite CLASSIC_SOLUTIONS à mão).
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'mlr-'));
const entry = join(dir, 'entry.ts');
writeFileSync(
  entry,
  `export { resolveLevel } from '${root}src/games/montaleva/levelgen';\nexport { LEVELS } from '${root}src/games/montaleva/levels';\nexport { SOLUTIONS, runSolution } from '${root}src/games/montaleva/solutions';\n`,
);
const out = join(dir, 'r.mjs');
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error', nodePaths: [root + 'node_modules'] });
const M = await import(pathToFileURL(out).href);
rmSync(dir, { recursive: true, force: true });

const only = process.argv[2] ? process.argv[2].split(',').map(Number) : null;
const file = root + 'src/games/montaleva/solutions-data.ts';
let src = readFileSync(file, 'utf8');
let fixed = 0;
let bad = 0;
for (const L of M.LEVELS) {
  if (only && !only.includes(L.n)) continue;
  const r = M.runSolution(L.n);
  if (r.ok && !only) continue;
  const sol = M.SOLUTIONS[L.n];
  const t0 = Date.now();
  const ns = M.resolveLevel(L, sol);
  if (!ns) {
    bad++;
    console.log(`FAIL fase ${L.n}${L.old ? ' (clássica ' + L.old + ')' : ''}: nenhum roteiro serve (${r.reason ?? r.valid})`);
    continue;
  }
  // confere no verificador de verdade (60 s, sem perturbação)
  M.SOLUTIONS[L.n] = ns;
  const chk = M.runSolution(L.n, ns);
  if (!chk.ok) {
    bad++;
    console.log(`FAIL fase ${L.n}: roteiro novo não passa no verificador (${chk.reason})`);
    continue;
  }
  fixed++;
  const json = JSON.stringify(ns);
  console.log(`ok fase ${L.n} t=${chk.time}s ${Date.now() - t0}ms drive=${JSON.stringify(ns.drive ?? null)}`);
  if (L.old) {
    console.log(`  → clássica ${L.old}: troque em CLASSIC_SOLUTIONS por ${json}`);
    continue;
  }
  const re = new RegExp(`^  ${L.n}: .*$`, 'm');
  if (!re.test(src)) throw new Error('linha da fase ' + L.n + ' não achada');
  src = src.replace(re, `  ${L.n}: ${json}` + (src.match(re)[0].endsWith(',') ? ',' : ''));
}
writeFileSync(file, src);
console.log(`${fixed} resolvidas, ${bad} sem solução`);
process.exit(bad ? 1 : 0);
