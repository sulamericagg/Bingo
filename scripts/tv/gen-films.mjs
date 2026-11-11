#!/usr/bin/env node
/**
 * Gera os filmes oficiais da TV Bloop (Estúdio Bloop) a partir dos roteiros em src/cinema/tvfilms/.
 *
 *   node scripts/tv/gen-films.mjs           → escreve shared/tv-films.json e mostra o resumo
 *   node scripts/tv/gen-films.mjs --check   → só confere (sai com 1 se o JSON estiver desatualizado ou houver problema)
 *
 * O JSON é usado pelo app (TV, catálogo, Remixar — carregado sob demanda) e pelo Worker (grade ao vivo e
 * /api/tv/film). Depois de mudar roteiros: rode este script e scripts/tv/thumbs.mjs (miniaturas).
 */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'shared/tv-films.json');
const CHECK = process.argv.includes('--check');
const tmp = path.join(os.tmpdir(), `tvfilms-${process.pid}.mjs`);
await build({ entryPoints: [path.join(ROOT, 'src/cinema/tvfilms/index.ts')], bundle: true, format: 'esm', platform: 'node', outfile: tmp, logLevel: 'error' });
const mod = await import(pathToFileURL(tmp).href);
fs.rmSync(tmp, { force: true });
const { films, problems } = mod.buildAll();
const json = JSON.stringify({ v: mod.versionOf(films), films });
const byGenre = {};
let d2 = 0;
let d3 = 0;
let total = 0;
for (const f of films) {
  byGenre[f.genre] = (byGenre[f.genre] ?? 0) + 1;
  f.mode === '3d' ? d3++ : d2++;
  total += f.dur;
}
console.log(`${films.length} filmes (${d2} 2D, ${d3} 3D) · ${(total / 60).toFixed(1)} min · ${(json.length / 1024).toFixed(0)} KB`);
console.log(Object.entries(byGenre).map(([g, n]) => `${g}: ${n}`).join(' · '));
for (const p of problems) console.log('  ! ' + p);
if (CHECK) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (cur !== json) {
    console.error('shared/tv-films.json desatualizado: rode node scripts/tv/gen-films.mjs');
    process.exit(1);
  }
  process.exit(problems.length ? 1 : 0);
}
fs.writeFileSync(OUT, json);
console.log('→ shared/tv-films.json');
if (problems.length) process.exit(1);
