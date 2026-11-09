# Relatório de QA — Bloop World (caça final de bugs antes do lançamento)

Branch `wip/qa` · base `53a6e63` · 09/11/2026

## 1. O que foi testado

| Área | Como | Resultado |
|---|---|---|
| Tipos | `npx tsc --noEmit`, `npm run typecheck` (cliente + Worker) | OK, 0 erros |
| Build | `npx vite build` | OK. `index` 563 KB (189 KB gzip); three/cannon (`home3d`, 918 KB), músicas, casa, banda, desastre, coleção, campeonatos, chat e locales já carregam sob demanda |
| Servidor | `npm run test:server` (wrangler dev local + Miniflare) | **263 ok, 0 falhas** |
| Deploy | `npx wrangler deploy --dry-run` | OK (6 Durable Objects + KV + Assets) |
| E2E (Playwright, `vite preview`) | 360x640, 412x915, 768x1024, 915x412 | ver abaixo |
| Primeira abertura | localStorage vazio → intro → hub | sem pop-ups empilhados; nenhum erro de console além dos 404 esperados de `/api` (sem backend) |
| 6 jogos do hub | abrir → tocar → pausar/retomar (`visibilitychange`) → voltar (Escape → `ui.back()`) → sair | todos abrem e fecham; sem `pageerror`; timers e rAF estáveis depois de fechar |
| 10 painéis | Loja, Passe (3 abas), Bichinho, Criar, Casa, Amigos, Social, Campeonatos, Coleção, Ranking | abrem e fecham com o botão voltar (antes da correção, 5 deles não fechavam) |
| Loja na web | tocar em todos os `data-buy` (18) | nenhuma moeda ou gema entregue; aparece o aviso "Compras só no app Android" |
| Diário | 3 toques seguidos | entrega só 1 vez |
| Anúncio premiado (modo teste) | moedas grátis, dobrar moedas | credita 1 vez |
| Orbit | morrer → resultados → `run-end` | **1** `run-end` por partida (antes: nenhum) |
| Casa 3D | abrir e fechar 3x em 915x412 com swiftshader | sem erros; nº de canvas e heap estáveis (11 MB → 11 MB) |
| Pop-up da temporada | data forçada para 05/12 + jogo aberto | espera o jogador voltar ao hub; fecha no voltar |
| Saves | v1 original (só campos da 1ª versão), campos corrompidos, JSON quebrado, `null`, array | app abre em todos os casos; v1 migra e mantém moedas/gemas/recorde |
| Desempenho | 390x844, CPU 4x mais lenta, nível Mínimo | todos os jogos ≥ 49 fps (Orbit 59, Tubo 59, Rally 60, Fábrica 60, Desastre 60, Banda 49–60) |
| Android | `npx cap sync android` + `./gradlew assembleDebug` (JDK 21) | OK — `app-debug.apk` (15 MB) |

## 2. Bugs encontrados e corrigidos

| # | Gravidade | Bug | Commit |
|---|---|---|---|
| 1 | **Alta** | O botão voltar do Android **fechava o app** quando Passe, Coleção (e o detalhe), Social, Campeonatos ou Ranking estavam abertos. Agora existe uma pilha `pushBack`/`popBack` (`src/core/back.ts`) que `ui.back()` consulta primeiro. | c72799c |
| 2 | **Alta** | **Bloop Orbit nunca chamava `reportRun`**: partidas e corridas do jogo principal não davam XP do Passe, os desafios semanais do Orbit eram impossíveis, e bichinho, campeonatos e recordes do perfil ignoravam o Orbit. | e0a39ef |
| 3 | **Alta** | O "Sair do jogo?" (voltar dentro de um jogo) ficava **invisível atrás** do Tubo, do Rally e da Fábrica (z-index). Parecia que o voltar travava o jogo. | 118ad42 |
| 4 | **Alta** | O painel Ranking abria **atrás do hub** (só aparecia o "X") e não fechava no voltar. | a17225e |
| 5 | **Alta** | Saves: um único campo corrompido (ex.: `ownedSkins` que não é lista) gerava exceção, e **o save inteiro voltava ao zero**, sendo gravado por cima no próximo `persist`. Agora cada campo é validado pelo tipo; JSON ilegível ganha uma cópia `-corrupt`; em `QuotaExceeded` o app apaga os caches recriáveis e tenta gravar de novo. | 274893b |
| 6 | **Alta** | Casa 3D: as edições feitas no 3D não eram salvas nem redesenhadas no 2D. O voltar do Android fechava a casa 2D que estava por baixo do 3D. | e8356b2 |
| 7 | **Alta** (APK) | `screenOrientation="portrait"` no manifest impedia o 3D de girar para paisagem. Agora o manifest usa `fullUser`, `@capacitor/screen-orientation` trava retrato na abertura e paisagem no 3D. Faltava `POST_NOTIFICATIONS`. Criado o ícone `ic_stat_bloop`, configurado em `LocalNotifications`. O `cap sync` mostrou que `local-notifications` **nem estava no Gradle**, então os lembretes do bichinho falhavam no APK. | f1e91ea |
| 8 | Média (economia) | Fazenda de moedas na Casa: sujar a própria casa na guerra de comida, limpar e repetir; repintar; festas offline com robôs. Agora há um teto diário de 200 moedas para limpar, pintar e festa. | a3f566c |
| 9 | Média | O pop-up da temporada (z-index 80) podia abrir **por cima de um jogo** ou de um painel. Agora espera `hubIdle()` e fecha no voltar. | 549de31 |
| 10 | Média | Tubo: depois de "Dobrar moedas" uma vez, o botão sumia para sempre (as flags não zeravam ao jogar de novo). | 1860d2e |
| 11 | Média (perf) | O loop da vitrine do hub rodava a 60 Hz **durante todos os jogos** (2 loops de rAF ao mesmo tempo). Agora ele dorme quando o hub está escondido. | 8ea3297 |
| 12 | Baixa | `openSheet` com o mesmo id removia o painel sem rodar `onClose`, e os timers de 1 s e 15 s do Campeonato vazavam. | c72799c |
| 13 | Baixa (perf) | No nível Mínimo, os blobs animados gigantes do fundo do hub e o pulso do JOGAR agora ficam parados. | a7307fd |
| 14 | Baixa | Em paisagem baixa (web ou tablet deitado), o botão JOGAR ficava fora da carta. | 38d073d |
| — | Ferramenta | `?debug` expõe `__bloop.{listGames, listPanels, launchGame, closeHost, save, bus}` para os testes E2E. | 704763c, ad978f8 |

## 3. Problemas que continuam (por prioridade)

1. **Bloqueia o lançamento: `ADS_TEST_MODE = true`** e IDs de teste do AdMob em `src/config.ts` e no `AndroidManifest.xml` (`ca-app-pub-3940256099942544~…`). Trocar pelos IDs reais antes de publicar.
2. **Bundle principal com 563 KB** (meta de cerca de 520 KB). Os maiores itens que dá para carregar sob demanda são `src/pass/music/*` (cerca de 43 KB de código: auras e danças) e `src/music/season-music-data.ts`. Hoje eles entram no bundle principal por import estático em `src/pass/mstate.ts`, e o Vite avisa que o `import()` dinâmico não separa esse código. Para mover, `mstate` precisa receber `grantMusicReward`/`musicItemName`/`musicPassSeason` por import dinâmico.
3. **Textos sem tradução** (ex.: "Escolha seu @", "Anúncio de teste", "Ficar no 2D") — com o agente de localização.
4. O "Sair do jogo?" e a pausa própria do Tubo e do Rally aparecem juntos quando se aperta **Escape no navegador**. No Android, o voltar só mostra o "Sair do jogo?".
5. Com o anúncio de teste (fake-ad) aberto, o voltar fecha o painel que está por baixo, e não o anúncio. Só acontece no modo teste.
6. O teto da Casa é contado no aparelho (localStorage): quem limpa os dados do app zera o contador. A Casa não tem moedas validadas pelo servidor.
7. O hub ainda ocupa cerca de 40% da thread principal com CPU 4x mais lenta no swiftshader. O perfil mostra JS ocioso (90%) e o resto é composição e raster por software. Isso não representa um aparelho com GPU, mas vale medir num Android de entrada real.
8. Ao usar `npm install` para adicionar o plugin de orientação, o `node_modules` desta worktree **virou uma pasta real** (antes era symlink para `/home/user/Bingo/node_modules`). Nada foi para o git. Nas outras worktrees é preciso rodar `npm install` depois do merge, por causa do `@capacitor/screen-orientation`.

## 4. Recomendações de aparelho

- **Mínimo:** Android 8+ (WebView 90+), 2 GB de RAM. Os jogos 2D rodam no nível Mínimo a 30+ fps. A Casa 3D mostra o aviso "O 3D pode ficar lento" em aparelhos de nível 0.
- **Recomendado para a Casa 3D:** 4 GB de RAM e GPU da classe Adreno 610 / Mali-G52 ou melhor.
- **Testar no aparelho real antes de publicar:** rotação para paisagem no 3D e volta ao retrato, permissão de notificação no Android 13+, microfone do bichinho, voltar em cada painel, compra real com conta de teste do Play.

## Correções de física (v1.1.1)

Relato do dono após jogar o APK: "física cagada" no **Desastre** e no jogo que **pula**. Tudo abaixo foi reproduzido e medido com `scripts/dev/physics-check.mjs` (Chromium headless com tempo virtual a 30/60/120 fps, engasgos de GC simulados e CPU 4x mais lenta via CDP). Uso: `NODE_PATH=$(npm root -g) node scripts/dev/physics-check.mjs [--quick]`.

**Sobreviva aos Desastres**
- **Jogo congelava no nível Mínimo.** Com `fpsCap 30` numa tela de 60 Hz, o laço descartava *todos* os quadros (o tempo do quadro descartado era jogado fora). Agora o tempo é acumulado; a física roda em subpassos de no máx. 1/60 s e engasgos são cortados em 0,1 s. Relógio da rodada em 52 s de teste: antes 0,0 s, depois 52,4 s.
- **Altura do pulo dependia do fps** (99 / 104 / 107 px a 30 / 60 / 120 Hz). Gravidade agora integrada de forma exata: 109,4 px em todas as taxas, inclusive com engasgo de 180 ms.
- **Blocos enterrados no chão e pilhas tremendo sem dormir.** A colisão empurrava o bloco de BAIXO para dentro do chão e a média de velocidades "bombeava" a pilha. Agora quem está em cima sai da sobreposição e nenhuma velocidade é passada para baixo. Quadros com bloco dentro do chão (cenário 1, 60 fps): 1002 → 0. Blocos ainda acordados 6 s depois do fim: 13 → 0.
- **Parede tombando** colidia como caixa reta em pé (empurrava vizinhos para dentro do chão); agora a animação de tombar não colide. **Escada** segurava o chapéu da torre no ar depois que a torre caía. **Casas/torres/caixas** podiam nascer sobrepostas e "explodir" ao acordar. Sobreposições profundas: ~4900 → <20 quadros.
- Plataformas finas com colisão varrida e velocidade terminal de 720 px/s (nada atravessa laje de 12 px). Inclinação visual volta a zero quando o bloco apoia.
- **Controles:** toque rápido de pulo (entre dois quadros) não se perde; deslizar o dedo de uma seta para a outra troca de direção; teclas/botões soltam ao perder o foco ou ir para o fundo; andar + pular ao mesmo tempo (multitoque por `pointerId`).

**Queda Giratória**
- O quique de "tontura" (1,4× mais alto) perdia a altura extra **no meio do ar** quando a tontura acabava: o Bloop despencava ~0,6 raio num único quadro. A altura agora é fixada no começo de cada quique, numa parábola de verdade.
- Toques durante a tontura (0,22 s após quicar) ou durante o mergulho eram ignorados (23 de 39 toques no teste). Agora ficam guardados e viram mergulho assim que possível: 0 toques perdidos.
- Queda entre anéis com integração exata (233 ms em 30/60/120 Hz; pouso sempre exatamente na superfície).

**Bloop Orbit**
- Em velocidade alta e fps baixo (20 fps, engasgo), o Bloop **atravessava planetas pequenos** sem pousar (passo de 65 px). O voo agora roda em subpassos de 1/120 s: captura e trajetória iguais em 20/30/60/120 fps.

Pendências conhecidas: as caixas continuam colidindo como retângulos retos (a inclinação é só visual e zera quando o bloco apoia); o jogador ainda atravessa paredes de casa pelo lado (de propósito, para poder entrar nas casas).
