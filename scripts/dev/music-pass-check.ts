// Verificação do Passe Musical: npx esbuild scripts/dev/music-pass-check.ts --bundle --platform=node --outfile=<tmp>.cjs && node <tmp>.cjs
import { allMusicPassSeasons, verifyMusicPass, STARTER } from '../../src/pass/music/index';
const errs = verifyMusicPass();
const all = allMusicPassSeasons();
const n = (f: (s: (typeof all)[0]) => number) => all.reduce((a, s) => a + f(s), 0);
console.log('temporadas', all.length, '| auras', n((s) => s.auras.length), '| danças', n((s) => s.dances.length), '| skins instrumento', n((s) => s.instSkins.length), '| pistas', n((s) => s.highways.length), '| palcos', all.length, '| níveis', n((s) => s.levels.length));
console.log('inicial grátis:', STARTER);
console.log('erros:', errs.length, errs.slice(0, 10));
console.log(all[13].dances.map((d) => d.name + ' ' + d.moves.map((m) => m.k + m.beats).join('-') + ' ' + d.fx));
console.log(all[13].auras.map((a) => a.name + ' ' + a.family));
