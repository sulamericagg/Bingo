# Passe Estelar — temporadas, regras e recompensas

> Gerado por `node scripts/gen-passe-doc.mjs` a partir de `src/pass/catalog.ts` (determinístico). Não edite à mão.

## Regras

- Um passe por mês, 60 temporadas (dez/2026 → nov/2031), definidas em `src/creatures/seasons.ts`. Tudo troca sozinho pela data: cores do HUD (`bus 'season-theme'`), arte, pop-up de lançamento (1x por temporada) e aviso de "últimos 3 dias".
- 50 níveis × 1000 XP. Premium custa **950 gemas**; pular nível: 150 gemas. O premium devolve **1.000 gemas** ao longo da trilha (dá para comprar o próximo).
- XP: toda partida de qualquer minigame (`bus 'run-end'`: 25 + 1.5/s até 90s, +60 vitória, +80/50/30 pódio), login diário (+300), 7 desafios semanais (1.500–3.000 XP, giram por semana ISO, iguais para todos) e 5 marcos da temporada (3.000–8.000 XP).
- Cartelas de 10 níveis. Premium nível 1 = bichinho comum (bem fofo); níveis 20/30/40 = médio/raro/épico; nível 50 = lendário, o "rei" da temporada. Toda cartela tem bichinho + itens variados.
- Trilha grátis: nível 1 para todos (olhos nas temporadas pares, música nas ímpares), dancinha grátis no nível 25, 20 gemas a cada 10 níveis, moedas e ingressos nos níveis pares.
- Recompensas do passe são exclusivas: nunca vendidas. Ao trocar de temporada o nível zera; os itens ficam. A aba Histórico mostra o que foi ganho e o que foi perdido.
- Quem tem o Premium da temporada não vê intersticial/banner até o fim dela. **Clube Bloop** (assinatura `clube_bloop`, plano `mensal`, R$ 19,90/mês): passe de todo mês incluso, zero anúncios, 300 gemas/mês + 15/dia, moldura exclusiva.
- Tempo sem anúncios: 3 vídeos premiados = 30 min sem intersticial/banner, acumula até 2h.
- Teste: `?debug&season=NN` força a temporada (0..59); `&daysleft=2` simula o fim; `&announce` / `&announce=end` força o pop-up.

## As 60 temporadas

| # | Mês | Tema | Paleta | Rei da temporada (nível 50) | Grátis nível 1 |
|---|---|---|---|---|---|
| 1 | dez/2026 | Natal Estelar | `#0b1a2e #ff4f6a #5ef0a0` | Bichinho Estrela-guia | Olhos: Olhos de Pinheiro |
| 2 | jan/2027 | Ano Novo Cósmico | `#120a2e #ffd84a #c7a6ff` | Bichinho Fogos | Música: Tema: Ano Novo Cósmico |
| 3 | fev/2027 | Carnaval Galáctico | `#1e0638 #ff5cc8 #ffe14f` | Bichinho Serpentina | Olhos: Olhos de Pandeiro |
| 4 | mar/2027 | Selva Encantada | `#03190f #6dff8a #ffb347` | Bichinho Cipó | Música: Tema: Selva Encantada |
| 5 | abr/2027 | Doces e Confeitos | `#2a0b2e #ff8fd2 #8ffff0` | Bichinho Pirulito | Olhos: Olhos de Algodão-doce |
| 6 | mai/2027 | Fundo do Mar | `#021a2e #4fd6ff #ff9a6b` | Bichinho Coral | Música: Tema: Fundo do Mar |
| 7 | jun/2027 | Festa Junina Espacial | `#2a0f05 #ffb000 #ff4f4f` | Bichinho Fogueira | Olhos: Olhos de Bandeirinha |
| 8 | jul/2027 | Robôs e Engrenagens | `#0e1420 #00e5ff #ffb000` | Bichinho Engrenagem | Música: Tema: Robôs e Engrenagens |
| 9 | ago/2027 | Dinossauros | `#13200a #a0e050 #ff7a3c` | Bichinho Fóssil | Olhos: Olhos de Vulcãozinho |
| 10 | set/2027 | Piratas das Estrelas | `#0a1426 #ffd166 #ef476f` | Bichinho Tesouro | Música: Tema: Piratas das Estrelas |
| 11 | out/2027 | Monstrinhos do Halloween | `#1a0826 #ff8c1a #9b5cff` | Bichinho Abóbora | Olhos: Olhos de Morceguinho |
| 12 | nov/2027 | Inverno Polar | `#06182a #bff3ff #7aa8ff` | Bichinho Floco de Neve | Música: Tema: Inverno Polar |
| 13 | dez/2027 | Reino dos Dragões | `#200a0a #ff5a1f #ffd84a` | Bichinho Escama | Olhos: Olhos de Ovo de Dragão |
| 14 | jan/2028 | Festival de Música | `#14052e #ff3cac #3cf0ff` | Bichinho Batida | Música: Tema: Festival de Música |
| 15 | fev/2028 | Esportes Radicais | `#04162a #3cff8c #ff6b3c` | Bichinho Skate | Olhos: Olhos de Prancha |
| 16 | mar/2028 | Mundo Pixel | `#0a0a1e #4fff7a #ff4fd8` | Bichinho Pixel | Música: Tema: Mundo Pixel |
| 17 | abr/2028 | Castelo Mágico | `#1a0a30 #c99bff #ffe08a` | Bichinho Varinha | Olhos: Olhos de Torre |
| 18 | mai/2028 | Safári Lunar | `#1e1608 #ffcf6b #7ad1ff` | Bichinho Cratera | Música: Tema: Safári Lunar |
| 19 | jun/2028 | Cidade Neon | `#08061a #ff2bd6 #2bffea` | Bichinho Letreiro | Olhos: Olhos de Arranha-céu |
| 20 | jul/2028 | Jardim das Fadas | `#0c1a12 #ffa6e0 #a6ffcf` | Bichinho Pétala | Música: Tema: Jardim das Fadas |
| 21 | ago/2028 | Agentes Secretos | `#0a0e14 #e0e0e0 #ff3b5c` | Bichinho Disfarce | Olhos: Olhos de Lupa |
| 22 | set/2028 | Vulcões e Lava | `#1e0505 #ff5a1f #ffe14f` | Bichinho Magma | Música: Tema: Vulcões e Lava |
| 23 | out/2028 | Circo das Galáxias | `#200814 #ff4f6a #4fc3ff` | Bichinho Picadeiro | Olhos: Olhos de Malabares |
| 24 | nov/2028 | Samurais do Cosmos | `#14060a #ff3b3b #f5e6c8` | Bichinho Leque | Música: Tema: Samurais do Cosmos |
| 25 | dez/2028 | Ilha Tropical | `#022024 #3cffd0 #ffcf2e` | Bichinho Coqueiro | Olhos: Olhos de Conchinha |
| 26 | jan/2029 | Laboratório Maluco | `#0a1a0a #9dff3c #c74fff` | Bichinho Tubo de Ensaio | Música: Tema: Laboratório Maluco |
| 27 | fev/2029 | Cavaleiros do Arco-íris | `#120a2e #ff5c5c #5cc8ff` | Bichinho Arco-íris | Olhos: Olhos de Escudo |
| 28 | mar/2029 | Faroeste Espacial | `#24140a #ffb347 #d9534f` | Bichinho Cacto | Música: Tema: Faroeste Espacial |
| 29 | abr/2029 | Mitologia Estelar | `#0e0a24 #ffd84a #7dfcff` | Bichinho Constelação | Olhos: Olhos de Oráculo |
| 30 | mai/2029 | Super-Heróis Bloop | `#0a0e2e #ff3b3b #3b8bff` | Bichinho Capa | Música: Tema: Super-Heróis Bloop |
| 31 | jun/2029 | Cozinha Intergaláctica | `#24100a #ffb000 #ff6b9d` | Bichinho Panqueca | Olhos: Olhos de Cupcake |
| 32 | jul/2029 | Cristais e Gemas | `#100a24 #b06bff #6dfcff` | Bichinho Ametista | Música: Tema: Cristais e Gemas |
| 33 | ago/2029 | Festa do Pijama | `#0e0a24 #ffa6c9 #a6c9ff` | Bichinho Travesseiro | Olhos: Olhos de Pantufa |
| 34 | set/2029 | Ninjas da Lua | `#08081a #8f9dd8 #ff3b5c` | Bichinho Faixa Ninja | Música: Tema: Ninjas da Lua |
| 35 | out/2029 | Planeta Gelatina | `#1e0a24 #ff6bd5 #6bff9e` | Bichinho Gelatina | Olhos: Olhos de Pudim |
| 36 | nov/2029 | Aventura Egípcia | `#241a08 #ffd84a #3cc8c8` | Bichinho Pirâmide | Música: Tema: Aventura Egípcia |
| 37 | dez/2029 | Viagem no Tempo | `#0a1424 #7dfcff #ffb347` | Bichinho Relógio | Olhos: Olhos de Ampulheta |
| 38 | jan/2030 | Brinquedoteca | `#1a0a24 #ff4f8b #4fc3ff` | Bichinho Pião | Música: Tema: Brinquedoteca |
| 39 | fev/2030 | Bosque Outonal | `#1e0f05 #ff8c3c #ffd84a` | Bichinho Folha Seca | Olhos: Olhos de Bolota |
| 40 | mar/2030 | Mergulho Abissal | `#020c1e #3cf0ff #b06bff` | Bichinho Lanterna-peixe | Música: Tema: Mergulho Abissal |
| 41 | abr/2030 | Copa das Estrelas | `#04200e #ffe14f #3cff6b` | Bichinho Bola | Olhos: Olhos de Taça |
| 42 | mai/2030 | Steampunk | `#1e1208 #d9a066 #5ef0ff` | Bichinho Engrenagem de Bronze | Música: Tema: Steampunk |
| 43 | jun/2030 | Festival das Lanternas | `#1e0808 #ff4f4f #ffd84a` | Bichinho Lanterna de Papel | Olhos: Olhos de Pipa |
| 44 | jul/2030 | Pinguins e Neve | `#06142a #ffffff #4fb5ff` | Bichinho Pinguim | Música: Tema: Pinguins e Neve |
| 45 | ago/2030 | Alienígenas Fofinhos | `#081e14 #7dff6b #d46bff` | Bichinho Disco Voador | Olhos: Olhos de Antena |
| 46 | set/2030 | Mundo dos Insetos | `#0e1a06 #c4ff3c #ff6b3c` | Bichinho Joaninha | Música: Tema: Mundo dos Insetos |
| 47 | out/2030 | Realeza Galáctica | `#14061e #ffd84a #ff4f8b` | Bichinho Cetro | Olhos: Olhos de Trono |
| 48 | nov/2030 | Monstros Marinhos | `#021a24 #3cffb0 #ff5c8a` | Bichinho Tentáculo | Música: Tema: Monstros Marinhos |
| 49 | dez/2030 | Corrida Turbo | `#0e0e14 #ff3b3b #ffd84a` | Bichinho Turbo | Olhos: Olhos de Bandeirada |
| 50 | jan/2031 | Nuvens e Céu | `#0a1a30 #ffffff #ffb6e6` | Bichinho Nuvem | Música: Tema: Nuvens e Céu |
| 51 | fev/2031 | Detetives Bloop | `#0e0a14 #ffcf6b #7d9dff` | Bichinho Lupa | Olhos: Olhos de Pegada |
| 52 | mar/2031 | Floresta de Cogumelos | `#14081e #ff5c8a #6bffd0` | Bichinho Cogumelo | Música: Tema: Floresta de Cogumelos |
| 53 | abr/2031 | Olimpíadas Espaciais | `#06142a #ffd84a #3cff8c` | Bichinho Medalha | Olhos: Olhos de Tocha |
| 54 | mai/2031 | Bruxinhos e Poções | `#120624 #9b5cff #6dff8a` | Bichinho Poção | Música: Tema: Bruxinhos e Poções |
| 55 | jun/2031 | Robôs Gigantes | `#0a0e1a #3b8bff #ff8c1a` | Bichinho Mecha | Olhos: Olhos de Propulsor |
| 56 | jul/2031 | Deserto das Miragens | `#24180a #ffb347 #ff6bd5` | Bichinho Duna | Música: Tema: Deserto das Miragens |
| 57 | ago/2031 | Aurora Boreal | `#020e1a #3cffb0 #b06bff` | Bichinho Aurora | Olhos: Olhos de Céu Polar |
| 58 | set/2031 | Parque de Diversões | `#1e0a1a #ff4f8b #ffe14f` | Bichinho Roda-gigante | Música: Tema: Parque de Diversões |
| 59 | out/2031 | Lendas do Universo | `#0a0624 #ffd84a #ff3cac` | Bichinho Galáxia | Olhos: Olhos de Supernova |
| 60 | nov/2031 | Aniversário de 5 Anos | `#14061e #ff5cc8 #5ef0ff` | Bichinho Bolo | Música: Tema: Aniversário de 5 Anos |

## Exemplo completo: temporada 1 (Natal Estelar)

| Nível | Premium | Raridade | Grátis |
|---|---|---|---|
| 1 | Bichinho: Bichinho Estrela-guia | common | Olhos: Olhos de Pinheiro |
| 2 | Gemas: 100 Gemas | rare | Moedas: 170 Moedas |
| 3 | Efeito (aura): Aura de Estrela-guia | rare | — |
| 4 | Dancinha: Dança do Estrela-guia | medio | Moedas: 190 Moedas |
| 5 | Música: Tema: Natal Estelar | epic | — |
| 6 | Gemas: 100 Gemas | rare | Ingressos: 1 Ingresso |
| 7 | Boca: Sorriso de Estrela-guia | rare | — |
| 8 | Ingressos: 1 Ingresso | medio | Moedas: 230 Moedas |
| 9 | Olhos: Olhos de Estrela-guia | rare | — |
| 10 | Moedas: 700 Moedas | common | Gemas: 20 Gemas |
| 11 | Dancinha: Giro de Sininho | rare | — |
| 12 | Gemas: 100 Gemas | rare | Ingressos: 1 Ingresso |
| 13 | Boca: Boca de Sininho | epic | — |
| 14 | Moedas: 800 Moedas | common | Moedas: 290 Moedas |
| 15 | Ingressos: 1 Ingresso | medio | — |
| 16 | Ingressos: 1 Ingresso | medio | Moedas: 310 Moedas |
| 17 | Moedas: 800 Moedas | common | — |
| 18 | Gemas: 100 Gemas | rare | Ingressos: 1 Ingresso |
| 19 | Olhos: Olhos de Sininho | epic | — |
| 20 | Bichinho: Bichinho Sininho | medio | Gemas: 20 Gemas |
| 21 | Moldura: Moldura Natal Estelar | epic | — |
| 22 | Ingressos: 2 Ingressos | medio | Moedas: 370 Moedas |
| 23 | Ingressos: 2 Ingressos | medio | — |
| 24 | Moedas: 1000 Moedas | common | Ingressos: 1 Ingresso |
| 25 | Dancinha: Aceno de Estrela-guia | rare | Dancinha: Festa de Pinheiro |
| 26 | Moedas: 1000 Moedas | common | Moedas: 410 Moedas |
| 27 | Efeito (aura): Aura de Rena | epic | — |
| 28 | Gemas: 100 Gemas | rare | Moedas: 430 Moedas |
| 29 | Gemas: 100 Gemas | rare | — |
| 30 | Bichinho: Bichinho Estrela-guia | rare | Gemas: 20 Gemas |
| 31 | Gemas: 100 Gemas | rare | — |
| 32 | Moedas: 1100 Moedas | common | Moedas: 470 Moedas |
| 33 | Moedas: 1200 Moedas | common | — |
| 34 | Ingressos: 2 Ingressos | medio | Moedas: 490 Moedas |
| 35 | Olhos: Olhos de Pinheiro | legendary | — |
| 36 | Dancinha: Festa de Sininho | epic | Ingressos: 1 Ingresso |
| 37 | Gemas: 100 Gemas | rare | — |
| 38 | Ingressos: 2 Ingressos | medio | Moedas: 530 Moedas |
| 39 | Boca: Sorriso de Pinheiro | legendary | — |
| 40 | Bichinho: Bichinho Sininho | epic | Gemas: 20 Gemas |
| 41 | Dancinha: Pulinho de Estrela-guia | legendary | — |
| 42 | Efeito (aura): Aura de Sininho | legendary | Ingressos: 1 Ingresso |
| 43 | Ingressos: 3 Ingressos | medio | — |
| 44 | Moedas: 1400 Moedas | common | Moedas: 590 Moedas |
| 45 | Moedas: 1400 Moedas | common | — |
| 46 | Música: Remix de Pinheiro | legendary | Moedas: 610 Moedas |
| 47 | Gemas: 100 Gemas | rare | — |
| 48 | Gemas: 100 Gemas | rare | Ingressos: 1 Ingresso |
| 49 | Faixa: Faixa Natal Estelar | legendary | — |
| 50 | Bichinho: Bichinho Estrela-guia | legendary | Gemas: 20 Gemas |

## Pontos de integração

- `registerPass()` (src/pass/register.ts): registra o painel `pass` (navOrder 1), liga XP/desafios/pop-ups. Também: `openPass(tab)`, `openClub()`, `mountAdFreeMeter(el)`, `mountSeasonBanner(el)`, `runXp(report)`.
- Bus emitido: `season-theme` {index,id,theme,palette}, `pass`, `pass-xp`, `pass-challenge`, `creature-grant` {id, passId, source:'pass'}, `club`, `ad-free`. Escutado: `run-end`, `pet-care` {action:'bath'|'feed'|'play'|...}, `pass-open`.
- Estatísticas esperadas no RunReport.stats: orbit `perfects`, `planets`; rally `distance` (m); tubo `rings`; tycoon usa `won`.
- Peças do criador (olhos/bocas/auras do passe): `src/pass/parts.ts`, incluídas em `ALL_PARTS` por `game/avatar.ts` (price `{event:'pass'}`; o criador só lista as já ganhas).
- Emotes `em_*`: `drawPassEmote(ctx,id,x,y,size,t)`; molduras/faixas: `frameCss(id)`/`bannerCss(id)` (src/pass/cosmetics.ts); músicas `mu_*`: `passTrack(id)`/`previewTrack(id)` (src/pass/music.ts).
