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
L.push(`- Quem tem o Premium da temporada não vê intersticial/banner até o fim dela. **Clube Bloop** (assinatura \`${CLUB.productId}\`, plano \`${CLUB.basePlan}\`, ${CLUB.fallbackPrice}): os 3 passes do mês inclusos (Estelar, Casa e Musical), zero anúncios, ${CLUB.gemsOnRenew} gemas/mês + ${CLUB.gemsDaily}/dia, moldura exclusiva.`);
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
// ---------------- Passe da Casa ----------------
const hc = await bundle('src/pass/home/catalog.ts', 'home.mjs');
const CAT = { furniture: 'Móvel', paint: 'Tinta', wallpaper: 'Papel de parede', floor: 'Piso', rug: 'Tapete', lamp: 'Luminária', wallart: 'Quadro/parede', planet: 'Enfeite de planeta', door: 'Porta', roof: 'Telhado', window: 'Janela', fence: 'Cerca', garden: 'Jardim', roomkit: 'Kit de cômodo', party: 'Festa', cleaning: 'Ferramenta de limpeza', showpiece: 'Peça-mestra' };
L.push('', '# Passe da Casa', '');
L.push(`Segundo passe mensal (mesmo calendário e temas). ${PASS.levels} níveis, trilha grátis + premium, tudo exclusivo (nunca vendido) para a casa e o planeta: móveis, tintas especiais (purpurina, degradê, estampa, animada), papéis de parede, pisos, tapetes, luminárias, quadros, enfeites de planeta, portas, telhados, janelas, cercas, jardins, kits de cômodo completos, kits de festa (bolo temático + torta melequenta com cor de respingo especial) e skins de ferramentas de limpeza.`, '');
L.push(`- Premium: **${PASS.homePriceGems} gemas** (pular nível: ${PASS.homeSkipGems}). Combo **"Passes do Mês"** (Estelar + Casa + Musical): **${PASS.bundlePriceGems} gemas** (economiza ${PASS.priceGems + PASS.homePriceGems + PASS.musicPriceGems - PASS.bundlePriceGems}; só aparece se nenhum premium do mês foi comprado). O **Clube Bloop inclui os três**. Premium da casa também tira os anúncios na temporada. Devolve 600 gemas ao longo da trilha.`);
L.push('- Cartelas de 10 com destaque no fim de cada uma: 10 = tinta animada · 20 = kit de cômodo completo (inclui os móveis da temporada) · 30 = monumento de planeta animado · 40 = kit de festa · **50 = peça-mestra** (sala completa / estátua animada / aquário gigante / fonte mágica / árvore gigante / carrossel). Premium nível 1 = móvel temático. Grátis: tinta no nível 1 para todos, jardim (15), ferramenta de limpeza (25), papel de parede (35), gemas a cada 10, moedas nos pares.');
L.push(`- XP da casa (eventos do bus, teto diário ${PASS.homeDailyCap} XP): ${Object.entries(PASS.homeXp).map(([k, v]) => `\`${k}\` +${v}`).join(', ')}; + ${Math.round(PASS.homeRunShare * 100)}% do XP de cada partida (\`run-end\`). 5 desafios semanais da casa (1.500–2.500 XP; giram por semana ISO).`);
L.push('- Payloads: `home-build {item?}`, `home-paint {room?}`, `home-clean {count?}` (conta por sujeira), `party-host {guests?}`, `party-join {hostId?}`, `home-visit-help {kind?}`. Emitidos pelo passe: `hpass`, `hpass-xp`, `home-item-grant {id, item}`.');
let total = 0;
for (let i = 0; i < 60; i++) for (const lv of hc.homePassSeason(i).levels) for (const r of [lv.prem, lv.free]) if (r && r.kind === 'home') total++;
L.push(`- **${total} itens exclusivos** em 5 anos, nenhum repetido (id, nome e desenho). Verificação: \`node scripts/check-home-pass.mjs\`.`, '');
L.push('### Integração com o construtor da casa (o que o lead precisa ligar)', '');
L.push('- `homePassItems()` (src/pass/home/register.ts) devolve tudo agrupado com `owned`: `furniture` (defs compatíveis com `FurnDef` do construtor: `id, kind, v, w, h, wall, flat, cost {kind:\'pass\'}, name()` + `hex` (cor da temporada) + `pass` (parâmetros do desenho especial)), `surfaces` (spec `"<base>:pass:<id>"` para `RoomDesign.floor/wall`), `exterior` (campo + opção base de `PLANET_FIELDS`/`EXTERIOR_FIELDS`), `paints` (`HomeDesign.paint[room].wall = "pass:<id>"`), `kits`, `party`, `tools`, `showpieces`.');
L.push('- Itens não ganhos aparecem TRANCADOS com o selo "Passe" (`cost {kind:\'pass\'}`), nunca à venda. Posse: `ownsHomePassItem(id)` / `save.homeItems`. Ao ganhar: bus `home-item-grant`.');
L.push('- Desenho: `drawHomeItem(ctx, item, S, t)` (ícone/prévia, com acabamento animado). No cômodo, o renderizador pode usar `furn.kind`/`v` com a cor `hex` e, se quiser o efeito especial, `drawHomeItem` ou `item.draw` (paleta, motivo, acabamento, anim).');
L.push('- Botão "Passe da Casa" no construtor: `openHomePass()` (src/pass/register.ts).', '');
L.push('| # | Tema | Peça-mestra (nível 50) | Kit de cômodo (nível 20) | Premium nível 1 |', '|---|---|---|---|---|');
for (const s of SEASONS) {
  const lv = hc.homePassSeason(s.index).levels;
  L.push(`| ${s.index + 1} | ${s.theme} | ${lv[49].prem.name} | ${lv[19].prem.name} | ${lv[0].prem.name} |`);
}
// ---------------- Passe Musical ----------------
const mp = await bundle('src/pass/music/index.ts', 'music.mjs');
const smd = await bundle('src/music/season-music-data.ts', 'smd.mjs');
L.push('', '# Passe Musical', '');
L.push(`Terceiro passe mensal (Bloop Banda). Conteúdo gerado em \`src/pass/music/index.ts\` (agente "canções"): músicas originais do tema (1 grátis + 2 premium + a MEGA no nível 50), auras animadas, danças, skins de instrumento, pistas de notas e variante de palco. Estado/tela: \`src/pass/mstate.ts\` + aba "Musical" na tela dos passes.`, '');
L.push(`- Premium: **${PASS.musicPriceGems} gemas** (pular nível: ${PASS.musicSkipGems}). Entra no combo "Passes do Mês" e no Clube Bloop.`);
L.push(`- XP: cada partida do Bloop Banda (\`run-end\` com \`game: 'band'\`) dá +${PASS.bandXp.base} (+${PASS.bandXp.win} se vencer) + ${Math.round(PASS.musicRunShare * 100)}% do XP de qualquer partida. 5 desafios semanais musicais (músicas tocadas, batalhas vencidas, \`stats.notes\`, \`stats.perfects\`, danças no menu, partidas).`);
L.push('- Save: `save.mpass` (progresso), `save.musicItems` (ids ganhos), `save.equip` {aura, dance}.');
L.push('- **Equipar:** auras e danças ganhas (ou do kit inicial grátis) têm botão "Equipar" na tela do passe. A aura aparece atrás do Bloop na vitrine do hub (`src/hub/orbit-def.ts`) e no Orbit (`src/game/game.ts`, fora dos aparelhos fracos); tocar no Bloop da vitrine faz a dança equipada (`showcase-tap` → `triggerDance()`, emite `dance-play`). Hooks: `drawEquippedAura`, `triggerDance`, `danceFrameNow`/`drawDanceFxNow` (`src/pass/equip.ts`).');
L.push('- **Bloop Banda:** `ownedMusicItems()` / `ownsMusicItem(id)` (exportados de `src/pass/register.ts`) — músicas (`sNN-k`, `sNN-mega`), skins (`instSkin(id)`, `highwaySkin(id)`), palcos (`stageVariant(id)`). Abrir direto: `openMusicPass()`.', '');
L.push('| # | Tema musical | MEGA (nível 50) | Banda |', '|---|---|---|---|');
for (let i = 0; i < 60; i++) {
  const tx = smd.seasonMusicText(i);
  L.push(`| ${i + 1} | ${tx.theme} | ${tx.megaTitle} | ${tx.megaBand} |`);
}
const errs = mp.verifyMusicPass();
L.push('', `Verificação do conteúdo musical (nada se repete em 5 anos): ${errs.length ? errs.length + ' problemas' : 'ok'}.`);
writeFileSync('docs/PASSE.md', L.join('\n') + '\n');
console.log('docs/PASSE.md ok', creatures ? '(com nomes reais das criaturas)' : '(nomes provisórios: catálogo de criaturas ainda ausente)');
