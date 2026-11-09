// Gera docs/PASSE.md a partir do gerador do passe (determinístico).
// Uso: node scripts/gen-passe-doc.mjs
import { build } from 'esbuild';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'passe-doc-'));
const bundle = async (entry, name) => {
  const out = join(dir, name);
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error', define: { 'import.meta.glob': 'undefined' } });
  return import(pathToFileURL(out).href);
};
const cat = await bundle('src/pass/catalog.ts', 'cat.mjs');
const { SEASONS } = await bundle('src/creatures/seasons.ts', 'seasons.mjs');
const { PASS, CLUB, AD_FREE } = await bundle('src/config.ts', 'config.mjs');
let creatures = null;
if (existsSync('src/creatures/catalog.ts')) creatures = await bundle('src/creatures/catalog.ts', 'creatures.mjs').catch(() => null);

const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const KIND = { creature: 'Bichinho', eyes: 'Olhos', mouth: 'Boca', aura: 'Efeito (aura)', emote: 'Dancinha', music: 'Música', frame: 'Moldura', banner: 'Faixa', gems: 'Gemas', coins: 'Moedas', tickets: 'Ingressos' };
const L = [];
L.push('# Passe Estelar — temporadas, regras e recompensas', '');
L.push('> Gerado por `node scripts/gen-passe-doc.mjs` a partir de `src/pass/catalog.ts` (determinístico). Não edite à mão.', '');
L.push('## Regras', '');
L.push(`- Um passe por mês, 60 temporadas (dez/2026 → nov/2031), definidas em \`src/creatures/seasons.ts\`. Tudo troca sozinho pela data: cores do HUD (\`bus 'season-theme'\`), arte, pop-up de lançamento (1x por temporada) e aviso de "últimos 3 dias".`);
L.push(`- ${PASS.levels} níveis × ${PASS.xpPerLevel} XP. Premium custa **${PASS.priceGems} gemas**; pular nível: ${PASS.skipGems} gemas. O premium devolve **1.000 gemas** ao longo da trilha (dá para comprar o próximo).`);
L.push(`- XP: toda partida de qualquer minigame (\`bus 'run-end'\`: ${PASS.runXp.base} + ${PASS.runXp.perSec}/s até ${PASS.runXp.maxDur}s, +${PASS.runXp.win} vitória, +80/50/30 pódio), login diário (+${PASS.dailyLoginXp}), 7 desafios semanais (1.500–3.000 XP, giram por semana ISO, iguais para todos) e 5 marcos da temporada (3.000–8.000 XP).`);
L.push('- Cartelas de 10 níveis. Premium nível 1 = bichinho comum (bem fofo); níveis 20/30/40 = médio/raro/épico; nível 50 = lendário, o "rei" da temporada. Toda cartela tem bichinho + itens variados.');
L.push('- Trilha grátis: nível 1 para todos (olhos nas temporadas pares, música nas ímpares), dancinha grátis no nível 25, 20 gemas a cada 10 níveis, moedas e ingressos nos níveis pares.');
L.push('- Recompensas do passe são exclusivas: nunca vendidas. Ao trocar de temporada o nível zera; os itens ficam. A aba Histórico mostra o que foi ganho e o que foi perdido.');
L.push(`- Quem tem o Premium da temporada não vê intersticial/banner até o fim dela. **Clube Bloop** (assinatura \`${CLUB.productId}\`, plano \`${CLUB.basePlan}\`, ${CLUB.fallbackPrice}): passe de todo mês incluso, zero anúncios, ${CLUB.gemsOnRenew} gemas/mês + ${CLUB.gemsDaily}/dia, moldura exclusiva.`);
L.push(`- Tempo sem anúncios: ${AD_FREE.videos} vídeos premiados = ${AD_FREE.minutes} min sem intersticial/banner, acumula até ${AD_FREE.maxMinutes / 60}h.`);
L.push('- Teste: `?debug&season=NN` força a temporada (0..59); `&daysleft=2` simula o fim; `&announce` / `&announce=end` força o pop-up.', '');
L.push('## As 60 temporadas', '');
L.push('| # | Mês | Tema | Paleta | Rei da temporada (nível 50) | Grátis nível 1 |');
L.push('|---|---|---|---|---|---|');
for (const s of SEASONS) {
  const d = new Date(Date.parse(s.start) + 86400000);
  let king = cat.passSeason(s.index).levels[49].prem.name;
  if (creatures?.seasonCreatures) king = creatures.seasonCreatures(s.index).legendary.name;
  const f = cat.passSeason(s.index).levels[0].free;
  L.push(`| ${s.index + 1} | ${months[d.getUTCMonth()]}/${d.getUTCFullYear()} | ${s.theme} | \`${s.palette.join(' ')}\` | ${king} | ${KIND[f.kind]}: ${f.name} |`);
}
L.push('', '## Exemplo completo: temporada 1 (Natal Estelar)', '');
L.push('| Nível | Premium | Raridade | Grátis |', '|---|---|---|---|');
for (const lv of cat.passSeason(0).levels) L.push(`| ${lv.level} | ${KIND[lv.prem.kind]}: ${lv.prem.name} | ${lv.prem.rarity} | ${lv.free ? `${KIND[lv.free.kind]}: ${lv.free.name}` : '—'} |`);
L.push('', '## Pontos de integração', '');
L.push('- `registerPass()` (src/pass/register.ts): registra o painel `pass` (navOrder 1), liga XP/desafios/pop-ups. Também: `openPass(tab)`, `openClub()`, `mountAdFreeMeter(el)`, `mountSeasonBanner(el)`, `runXp(report)`.');
L.push("- Bus emitido: `season-theme` {index,id,theme,palette}, `pass`, `pass-xp`, `pass-challenge`, `creature-grant` {id, passId, source:'pass'}, `club`, `ad-free`. Escutado: `run-end`, `pet-care` {action:'bath'|'feed'|'play'|...}, `pass-open`.");
L.push('- Estatísticas esperadas no RunReport.stats: orbit `perfects`, `planets`; rally `distance` (m); tubo `rings`; tycoon usa `won`.');
L.push('- Peças do criador (olhos/bocas/auras do passe): `src/pass/parts.ts`, incluídas em `ALL_PARTS` por `game/avatar.ts` (price `{event:\'pass\'}`; o criador só lista as já ganhas).');
L.push('- Emotes `em_*`: `drawPassEmote(ctx,id,x,y,size,t)`; molduras/faixas: `frameCss(id)`/`bannerCss(id)` (src/pass/cosmetics.ts); músicas `mu_*`: `passTrack(id)`/`previewTrack(id)` (src/pass/music.ts).');
writeFileSync('docs/PASSE.md', L.join('\n') + '\n');
console.log('docs/PASSE.md ok', creatures ? '(com nomes reais das criaturas)' : '(nomes provisórios: catálogo de criaturas ainda ausente)');
