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

## 5. Casa offline e 3D (v1.1.1)

Relato do dono no APK real (backend Cloudflare ainda não publicado, ou seja, app sem servidor):
"O da casa, como não tem conexão, não funciona" e "cliquei num quadrado na casa e ficou a tela azul infinito".

**Causas encontradas**

1. **Tela azul infinita (3D).** Ao tocar em "Entrar em 3D", o 3D colocava o fundo azul-escuro na tela e
   *esperava* `ScreenOrientation.lock('landscape')` antes de mostrar qualquer coisa. Se o plugin não respondesse
   (ou a WebView travasse a promessa), não aparecia nem aviso nem botão: só o azul, para sempre. Reproduzido no
   Playwright com `lock()` que nunca resolve: versão antiga = 20 s sem nenhum botão; versão nova = aviso com
   "Voltar" em 0,8 s. Além disso, o carregamento não tinha botão de voltar nem prazo, e o aviso "Vire o telefone"
   só saía girando o aparelho (com a rotação travada no celular, não saía nunca).
2. **Casa "não funciona" sem conexão.** A entrada da Casa esperava a rede (`getHome` → até 8 s por chamada,
   2 chamadas em série) e depois abria a tela obrigatória "Escolha seu @", que sem servidor não tem como ser
   concluída. Com o backend não publicado, a resposta do servidor não era JSON e o @ aparecia como
   "Esse formato não vale" (parecia erro do jogador). Amigos também forçava o @. Mudanças feitas antes do fim do
   carregamento eram sobrescritas pela casa que chegava depois.

**Correções**

- Casa **offline-first**: abre na hora com o cache do aparelho (`bw-home-cache-v1` / `bloop-home-v1`); a versão do
  servidor só entra em segundo plano, se for mais nova e a pessoa ainda não tiver mexido.
- **@ opcional**: sem trava na entrada nem em Amigos; ele só é pedido para recursos online (botão "Escolher @").
- Toda chamada da API tem prazo; depois de uma falha, 15 s sem novas esperas; resposta sem JSON = sem rede.
- Salvar é otimista (aparelho primeiro) e fica numa **fila de sincronização** (evento `online` e a cada 30 s).
- Chip **"Offline — suas mudanças ficam salvas no aparelho"** no topo.
- **Festa com robôs** na hora quando offline (antes esperava o WebSocket); Amigos offline mostra estado vazio
  amigável com "Festa com amigos-robô".
- Todo painel da Casa tem um **X** de fechar.
- 3D: aviso de girar aparece na hora com **Voltar** e, após 2 s, **"Continuar assim mesmo"** (3D jogável em
  **retrato**, HUD adaptado); carregamento com **Voltar** sempre visível e **prazo de 12 s** ("O 3D está
  demorando" + "Ficar no 2D"); falha de WebGL ao montar volta ao 2D com aviso; voltar do Android sempre sai do 3D.

**Testes (build de produção, `vite preview`, 412×915 retrato, todas as `/api/**` bloqueadas)**

| Cenário | Resultado |
|---|---|
| API abortada, WebGL ligado | PASSOU: Casa abre em ~0,16 s, construir/planeta/fachada/pintar/móveis/limpar/salvar local/festa com robôs (≤0,1 s)/amigos/permissões/@/3D em retrato/voltar |
| API lenta (8 s e falha), WebGL ligado | PASSOU (mesmo roteiro) |
| API abortada, WebGL desligado | PASSOU: 3D mostra "Sem 3D neste aparelho" + "Ficar no 2D" |
| API lenta, WebGL desligado | PASSOU |
| Lock de orientação que nunca responde | antes: preso; depois: aviso + Voltar em 0,8 s |
| WebGL some ao criar o motor | volta ao 2D com "O 3D não funcionou neste aparelho" |
| CPU 300× mais lenta no carregamento | aparece "O 3D está demorando" com "Ficar no 2D" |

O roteiro toca em todos os botões das barras do planeta e do cômodo e verifica que qualquer overlay em tela cheia
fecha em até 15 s. Sem erros de página em nenhum cenário.

**Ainda testar no aparelho real:** girar com a rotação travada (o app pede paisagem; se não girar, usar
"Continuar assim mesmo") e liberar peça por vídeo sem internet (o anúncio é de outro módulo).
