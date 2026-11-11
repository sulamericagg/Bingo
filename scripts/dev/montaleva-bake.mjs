// Gera as 200 fases do Monta & Leva (pistas por sementes fixas + busca de veículo com a física real).
// Uso: node scripts/dev/montaleva-bake.mjs [capítulos 1..10 separados por vírgula]  → reescreve levels-data.ts e solutions-data.ts
//      (sem argumento: todos, em 4 processos)
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fork } from 'node:child_process';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dir = process.env.MLB_DIR || mkdtempSync(join(tmpdir(), 'mlb-'));
const out = join(dir, 'levelgen.mjs');
if (!process.env.MLB_DIR) await build({ entryPoints: [root + 'src/games/montaleva/levelgen.ts'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
const gen = await import(pathToFileURL(out).href);

if (process.env.MLB_WORKER) {
  const chs = process.env.MLB_WORKER.split(',').map(Number);
  const res = gen.bakeChapters(chs);
  writeFileSync(join(dir, `part-${process.env.MLB_WORKER}.json`), JSON.stringify(res));
  process.exit(0);
}

const groups = process.argv[2] ? [process.argv[2].split(',').map((c) => +c - 1)] : [[0, 9, 8], [1, 2, 7], [3, 4, 6], [5]];
const cache = join(root, 'scripts/dev/.montaleva-bake-cache.json');
let prev = existsSync(cache) ? JSON.parse(readFileSync(cache, 'utf8')) : [];
await Promise.all(
  groups.map(
    (g) =>
      new Promise((res, rej) => {
        const p = fork(fileURLToPath(import.meta.url), [], { env: { ...process.env, MLB_DIR: dir, MLB_WORKER: g.join(',') } });
        p.on('exit', (c) => (c ? rej(new Error('worker ' + g + ' saiu com ' + c)) : res()));
      }),
  ),
);
let entries = [];
for (const g of groups) entries.push(...JSON.parse(readFileSync(join(dir, `part-${g.join(',')}.json`), 'utf8')));
const fresh = new Set(entries.map((e) => e.n));
entries = [...prev.filter((e) => !fresh.has(e.n)), ...entries].sort((a, b) => a.n - b.n);
writeFileSync(cache, JSON.stringify(entries));
let bad = 0;
for (const e of entries) {
  if (!e.level) bad++;
  if (!e.level || process.env.VERBOSE) console.log(e.log);
}
console.log(`${entries.length} geradas, ${bad} falharam`);
if (!bad) {
  try {
    const { data, sols } = gen.assemble(entries);
    const lv = `/* GERADO por scripts/dev/montaleva-bake.mjs — não editar à mão. Número = fase clássica (levels.ts). */\nimport type { LevelDef } from './levels';\nexport const GEN_LEVELS: (number | Omit<LevelDef, 'n'>)[] = [\n${data.map((d) => '  ' + JSON.stringify(d)).join(',\n')},\n];\n`;
    const sl = `/* GERADO por scripts/dev/montaleva-bake.mjs — não editar à mão. Soluções das fases geradas (numeração final). */\nimport type { Solution } from './solutions';\nexport const GEN_SOLUTIONS: Record<number, Solution> = {\n${Object.entries(sols).map(([n, s]) => `  ${n}: ${JSON.stringify(s)}`).join(',\n')},\n};\n`;
    writeFileSync(root + 'src/games/montaleva/levels-data.ts', lv);
    writeFileSync(root + 'src/games/montaleva/solutions-data.ts', sl);
    console.log('levels-data.ts / solutions-data.ts escritos');
  } catch (e) {
    console.log('não montou:', e.message);
  }
}
if (!process.env.MLB_DIR) rmSync(dir, { recursive: true, force: true });
