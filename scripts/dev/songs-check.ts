// Verificação do catálogo/charts (node): npx esbuild scripts/dev/songs-check.ts --bundle --platform=node --outfile=<tmp>.cjs && node <tmp>.cjs
import { SONGS, validateChart, arrangement } from '../../src/music/songs';
import type { Difficulty, Instrument } from '../../src/music/api';

const D: Difficulty[] = ['facil', 'medio', 'dificil', 'expert'];
const I: Instrument[] = ['drums', 'bass', 'guitar', 'keys', 'vocals'];
const nps: Record<string, number[]> = {};
let issues = 0;
const t0 = Date.now();
const ids = new Set<string>();
const titles = new Set<string>();
let maxMs = 0;
for (const s of SONGS) {
  if (ids.has(s.id)) throw new Error('id repetido ' + s.id);
  ids.add(s.id);
  if (titles.has(s.title)) console.log('título repetido', s.title);
  titles.add(s.title);
  const t1 = Date.now();
  const ch = s.charts;
  maxMs = Math.max(maxMs, Date.now() - t1);
  for (const i of I)
    for (const d of D) {
      const n = ch[i]![d]!;
      const iss = validateChart(n, d, s.bpm);
      if (iss.length) {
        issues += iss.length;
        if (issues < 15) console.log(s.id, i, d, iss.slice(0, 3));
      }
      const times = new Set(n.map((x) => x.b)).size;
      (nps[`${i}/${d}`] ??= []).push(times / s.durationSec);
    }
}
const tiers = { free: 0, pass: 0, mega: 0 } as Record<string, number>;
for (const s of SONGS) tiers[s.tier]++;
console.log('músicas', SONGS.length, tiers, 'tempo total', Date.now() - t0, 'ms; pior', maxMs, 'ms');
console.log('problemas de chart:', issues);
const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
for (const d of D) console.log(d.padEnd(8), I.map((i) => `${i}:${avg(nps[`${i}/${d}`]).toFixed(2)}(max ${Math.max(...nps[`${i}/${d}`]).toFixed(2)})`).join('  '));
const dur = SONGS.map((s) => s.durationSec);
console.log('duração min/max', Math.min(...dur), Math.max(...dur), 'mega:', SONGS.filter((s) => s.tier === 'mega').map((s) => s.durationSec).sort((a, b) => a - b).join(','));
const a = arrangement('s13-mega');
console.log('s13-mega seções', a.sections.map((x) => `${x.kind}${x.bars}${x.tr ? '+' + x.tr : ''}`).join(' '));
for (const s of SONGS) if (s.durationSec > 165 || s.durationSec < 90 || (s.tier === 'mega' && s.durationSec < 140)) console.log('duração', s.id, s.style, s.bpm, s.durationSec, s.bars);
