// Verifica o Passe da Casa: 60 temporadas × 50 níveis, nada se repete em 5 anos.
// Uso: node scripts/check-home-pass.mjs
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const out = join(mkdtempSync(join(tmpdir(), 'hp-')), 'c.mjs');
await build({ entryPoints: ['src/pass/home/catalog.ts'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
const m = await import(pathToFileURL(out).href);
const ids = new Set(), names = new Set(), designs = new Set();
let problems = 0, items = 0;
for (let i = 0; i < 60; i++) {
  const s = m.homePassSeason(i);
  if (s.levels.length !== 50) { problems++; console.log('levels', i); }
  for (let p = 0; p < 5; p++) {
    const hl = s.levels[p * 10 + 9].prem;
    if (hl.kind !== 'home' || !['epic', 'legendary'].includes(hl.rarity)) { problems++; console.log('highlight', i, p); }
  }
  if (m.homeItem(s.levels[49].prem.id)?.cat !== 'showpiece') { problems++; console.log('showpiece', i); }
  if (m.homeItem(s.levels[0].prem.id)?.cat !== 'furniture') { problems++; console.log('L1', i); }
  if (!s.levels[0].free) { problems++; console.log('free L1', i); }
  for (const L of s.levels) for (const r of [L.prem, L.free]) {
    if (!r || r.kind !== 'home') continue;
    items++;
    const it = m.homeItem(r.id);
    if (ids.has(r.id)) { problems++; console.log('dup id', r.id); }
    if (names.has(r.name)) { problems++; console.log('dup name', r.name); }
    const d = [it.cat, it.furn?.kind, it.furn?.v, it.surface?.base, it.ext?.field, it.ext?.base, it.tool, it.show, it.draw.palette.join(), it.draw.motif, it.draw.finish].join('|');
    if (designs.has(d)) { problems++; console.log('dup design', r.id, d); }
    ids.add(r.id); names.add(r.name); designs.add(d);
  }
}
console.log(`${items} itens exclusivos, ${problems} problemas`);
process.exit(problems ? 1 : 0);
