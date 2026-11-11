# QA — lista técnica de bugs (chefe de qualidade, branch `wip/qa2`)

Base: `claude/viral-game-apk-web-echogw` com todos os merges até 11/11/2026 (Mundo, Garimpo, TV, Jangada, Desastre).
Suíte: `npm run qa` (scripts/qa/, Playwright, Chromium com GPU por software). Capturas e JSON em `shots-qa/` (fora do git).

Gravidade: **Alta** = trava/perde progresso/não dá para jogar · **Média** = tela confusa ou controle tapado · **Baixa** = acabamento.

## 1. Corrigidos nesta branch

| # | Grav. | Onde | Bug | Correção (arquivos) | Evidência |
|---|---|---|---|---|---|
| 1 | Média | Hub, todos os jogos 3D | O botão redondo "girar tela" (`.gh-rot`) ficava fixo no meio do topo em TODO jogo 3D, mesmo já deitado — em cima do botão de câmera / nome do bioma. O dono pediu "nenhum botão de girar poluindo". | Só aparece quando o 3D ficou em pé (giro falhou ou o jogador escolheu em pé). `src/hub/hub.ts` (`ensureRotBtn`) | antes `g-cozinha-2-play.png` (1ª rodada), depois `hud-*-844x390.png` |
| 2 | Média | Hub × intro 3D | Menus de jogo com z-index alto (Anomalias z 50) apareciam **por cima** da intro 3D (z 6): as duas telas misturadas (bloop da intro, "…ular" do "Toque para pular" atrás dos botões). | `.gh-game { z-index:0; isolation:isolate }` — `src/hub/hub.css` | `deep-anomalias-0.png` |
| 3 | Média | Pouso Forçado | Voltar (Android) na pasta de missão **saía do jogo direto**, sem perguntar. | Pasta de missão não registra voltar próprio → aparece o "Sair do jogo?" do hub. `src/games/voo/game.ts` | `deep-voo-brief-back.png` |
| 4 | Média | Noites | 740×360: o 1º espaço da barra de itens ficava embaixo do analógico (o `.tc-btn` global força 56 px e ganhava da regra do jogo). | Espaços 46 px com seletor mais forte e barra deslocada para a direita em ≤ 900 px. `src/games/noites/noites.css` | `hud-noites-740x360.png` (hud2.log ✓) |
| 5 | Média | Garimpo | 1ª pessoa empurrando: a caçamba vermelha enchia ~60 % do centro. | Olhos 0,4 m atrás e 0,22 m acima com o carrinho, olhar inicial −0,24 rad (antes −0,42); câmera "de frente" mais na diagonal e mais alta. `src/games/garimpo/game.ts` | `deep-garimpo-fp.png`, `hud-garimpo-844x390.png` |
| 6 | Baixa | Garimpo | Relógio do topo ficava em cima da carga "0.0 g" depois de girar (posição só era recalculada quando a hora mudava); mochila/medidores encostavam no botão de pausa. | Chave do relógio inclui o tamanho da tela; `.rp-meters` 8 px mais baixo. `src/games/garimpo/rp/hud.ts`, `rp/rp.css` | `hud-garimpo-740x360.png` |
| 7 | Baixa | Cava & Fala | Título "Jogar com amigos" passava por baixo do X. | `max-width` no título. `src/games/cavafala/lobby.ts` | `deep-cavafala-1.png` (1ª rodada) |
| 8 | Baixa | Cinema | "Envergonhado", "Apaixonado" cortados nas células de expressão. | Quebra de palavra/hífen. `src/cinema/cinema.css` | `g-cinema-2-play.png` |
| 9 | Média | Cinema (Criar história deitado) | Faixa fixa "Fazer o filme!" tapava o 1º cartão de fala. | Deitado e baixo: botão grande vira coluna à direita. `src/cinema/cinema.css` | `deep-cinema-beats-land.png` |
| 10 | Média | Mundo | Lista "Meus Mundos" ainda oferecia "Mundo dos Lenhadores (clássico)" (HUD antigo) dentro do Mundo. | Opção `classic` (desligada no Mundo; o Lenhadores tem carta própria). `src/games/floresta/world/worlds.ts`; `paperOn('mundo')` em `world/net.ts` + chave `mundo` em `src/3d/paper/settings.ts` | `deep-mundo-lista.png` |
| 11 | Média | Jangada | Água funda 100 % opaca: do tubarão só aparecia a barbatana. | Perto da jangada (< 14–40 m) a água funda fica no máx. 78 % opaca. `src/games/jangada/ocean.ts` | `hud-jangada-844x390.png` |
| 12 | Média | Grupo (hub) | Com grupo, a coluna Votação / Pronto? / 0/2 / chat (~130 px) num saguão de 78 px subia **por cima do botão JOGAR** (e no teste online o JOGAR do líder na Cozinha não abriu). | Grade 2×2 que cabe no saguão. `src/party/party.css` | `online-B-grupo.png`; online 28/28 depois |
| 14 | **Alta** | Garimpo (abertura nova) | Sair do jogo **durante a abertura do vovô** deixava o laço da cena rodando num renderizador já liberado: erro `Cannot read properties of null (reading 'trim')` a cada quadro em TODOS os jogos abertos depois (achado pelo `deep.mjs`). | `leave()` encerra a abertura (`skipIntro`) antes de liberar o renderizador. `src/games/garimpo/game.ts` | `deep3.log` |
| 15 | Baixa | Garimpo (abertura nova) | Avisos do jogo (toasts) passavam por cima do chip de objetivo do acampamento no 1º minuto; 1ª picape só saía com ~23–26 min. | Avisos começam abaixo do chip (`setNotifyTop(114)`); Pickup 4x4 de 900 → 750. `src/games/garimpo/game.ts` | `hud-garimpo-740x360.png` |
| 16 | Baixa | Mundo → Servidores | Em pé, o botão "Criar servidor" saía da tela e a busca ficava espremida. | Topo quebra linha em ≤ 520 px. `src/games/floresta/world/srvapi.ts` | `g-mundo-2-play.png` |
| 17 | Média | Pouso Forçado (hangar) | Com o navegador sob pressão de memória/GPU o `getContext('2d')` dos cartões de papel voltava `null`: 23 erros `clearRect of null` seguidos. | Desenho dos cartões pula quando não há contexto. `src/games/voo/hangar.ts` | `games-run4.log` → `games-run5.log` 4/4 |
| 18 | Média | Cinema → "Minha história" deitado | A barra Cena/Assistir/Dublar/Música/Enviar (~100 px) deixava só ~80 px para o cartão da cena em 844×390. | Botões numa linha e mais baixos quando deitado. `src/cinema/cinema.css` | `deep-cinema-beats-land.png` |
| 13 | — | Servidor (teste) | `npm run test:server` com 2 falhas: o teste esperava `id` no `/api/player/by-handle`, que de propósito não devolve mais o id. | Teste confere o dono pelo `handle/mine`. `scripts/test-server.mjs` (278 ok, 0 falhas) | — |

Desfeito a pedido do coordenador: mudanças do QA em `src/games/disaster` (dica única, texto do 3D) — o Desastre passou para o agente `wip/dis3` (ver §2).

## 2. Abertos — para os outros agentes / dono

| # | Grav. | Área (dono) | Bug / pendência | Como reproduzir | Pista |
|---|---|---|---|---|---|
| A1 | Média | Desastre (`wip/dis3`) | Avisos repetidos empilham contador (×14, ×26) e a mesma dica aparece 2× (toast no topo + pílula de objetivo). | Jogar 1 rodada de Enchente/Tsunami e ficar na água. | `src/games/disaster/hud.ts` `toast()` chama `notify` com a mesma chave a cada evento; `d3/game3d.ts:1162` faz `notify` + `objective` com o mesmo texto. Sugestão do QA: limitar 1 vez a cada 6 s e só a pílula. |
| A2 | Baixa | Desastre (`wip/dis3`) | No 3D a dica da lava/avalanche diz "da direita", mas no 3D elas sobem em ondas. | Vulcão/Avalanche no 3D. | `scenarios.ts` `dz.h2.vulcao/avalanche` — criar texto próprio do 3D. |
| A3 | Baixa | Desastre (`wip/dis3`) | Mapas 3D lisos (chão verde liso, casas cinza); 3ª pessoa por padrão (o dono pede 1ª pessoa + botão de câmera). | Abrir 3D. | Usar `src/3d/nature` e `CamView`. |
| A4 | Média | Garimpo (`wip/gintro`) | Ao começar, o garimpeiro nasce **embaixo do telhado vermelho** do acampamento: em 3ª pessoa e "de frente" a câmera fica dentro do telhado (tela quase toda vermelha). | Novo jogo → câmera 3ª → `deep-garimpo-tp.png`, `deep-garimpo-front.png`. | Colisão da câmera com telhados ou nascer fora do galpão. |
| A5 | Baixa | Bloop no Lugar | Voltar na partida abre a pausa; voltar de novo fecha a pausa — o "Sair do jogo?" do hub nunca aparece; para sair é Pausa → Mapa de fases → voltar. | Jogar fase 1, apertar voltar várias vezes. | `src/games/lugar/game.ts` `playBack()`. Pode ser intencional; sugiro "Sair" dentro da pausa. |
| A6 | Baixa | Pouso Forçado | No hangar o voltar sai do jogo sem "Sair do jogo?". | Abrir e apertar voltar. | `game.ts` `lobby()` → `h.back()`. Aceitável (é menu). |
| A7 | Baixa | Geral | Ouvintes de evento crescem ~8 por jogo aberto/fechado (246 → 297 em 15 aberturas); heap, canvas e WebGL estáveis. | `node scripts/qa/leaks.mjs 10`. | Algum `addEventListener` global sem remoção em jogos 3D; não afeta memória de forma visível. |
| A9 | Baixa | Garimpo | Relato do agente da abertura: pá da 1ª pessoa grande demais logo depois de construir algo. Não reproduzi no robô. | Construir no acampamento e voltar a andar. | `heldTick()`/`fpEnter()` em `game.ts` (câmera do acampamento → 1ª pessoa). |
| A10 | Baixa | Pouso Forçado, Anomalias, Desenha e Vira | O verificador automático de HUD não conseguiu entrar na partida destes 3 (0 controles medidos); conferido só pela foto (`deep-voo-740.png` sem sobreposição). | `node scripts/qa/hud.mjs voo,anomalias,desenho` | Ensinar o caminho de toques em `ROUTES` (`scripts/qa/hud.mjs`). |
| A11 | Média | Desempenho | Com CPU 4× mais lenta e gráficos no Mínimo, as **telas de entrada** mais pesadas: Desastre (escolha 2D/3D) 1 fps com um quadro de 4,9 s (em obra, `wip/dis3`), Bloop Studio 7 fps, Pouso Forçado (hangar 2D) 9 fps, Desenha e Vira 13 fps, Cozinha 25, Jangada 28. Todo o resto 57–60. | `npm run qa -- perf` → `shots-qa/perf-report.json` | Hangar do voo redesenha o palco em canvas 2D inteiro a cada quadro; Studio/Desenho: cena 3D do editor sem limite de FPS no menu. |
| A8 | Info | Desempenho | A máquina de teste estava com carga 8–22 (4 núcleos, outros agentes compilando e rodando navegadores) e GPU por software: os FPS medidos são o pior caso e servem só para comparar jogos entre si. | `npm run qa -- perf` | Ver relatório. |
