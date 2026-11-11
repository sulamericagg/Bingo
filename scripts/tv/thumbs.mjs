#!/usr/bin/env node
/**
 * Miniaturas dos filmes do Estúdio Bloop (TV Bloop): public/tv/thumbs/<id>.webp (256×144).
 * Desenha cada filme com o próprio player do Cinema (scripts/dev/tvfilms.html?thumb=<id>) num Chromium headless.
 *
 *   npx vite --port 4477 &   node scripts/tv/thumbs.mjs http://localhost:4477 [--all]
 * Sem --all só gera as que faltam (rode com --all depois de mudar roteiros). Apaga miniaturas de filmes que não existem mais.
 */
import { createRequire } from 'module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let pw;
try {
  pw = require('playwright');
} catch {
  pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
}
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'public/tv/thumbs');
const base = process.argv[2] || 'http://localhost:4477';
const ALL = process.argv.includes('--all');
fs.mkdirSync(OUT, { recursive: true });
const { films } = JSON.parse(fs.readFileSync(path.join(ROOT, 'shared/tv-films.json'), 'utf8'));
const ids = new Set(films.map((f) => f.id));
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.webp') && !ids.has(f.slice(0, -5))) fs.rmSync(path.join(OUT, f));
const todo = films.filter((f) => ALL || !fs.existsSync(path.join(OUT, f.id + '.webp')));
if (!todo.length) {
  console.log('miniaturas em dia');
  process.exit(0);
}
const b = await pw.chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 400, height: 300 }, deviceScaleFactor: 1 });
let n = 0;
for (const f of todo) {
  await page.goto(`${base}/scripts/dev/tvfilms.html?thumb=${f.id}`);
  await page.waitForFunction(() => document.title === 'ready' && window.__thumb, null, { timeout: 60000 });
  const url = await page.evaluate(() => window.__thumb);
  fs.writeFileSync(path.join(OUT, f.id + '.webp'), Buffer.from(url.split(',')[1], 'base64'));
  n++;
}
await b.close();
const kb = fs.readdirSync(OUT).reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0) / 1024;
console.log(`${n} miniaturas → public/tv/thumbs (${kb.toFixed(0)} KB no total)`);
