# Varredura de QA — botões, telas e animações

Branch `wip/qasweep` (base `claude/viral-game-apk-web-echogw` @ `56b796a`) · 10/11/2026

O dono reclamou que o jogo "tem muitos bugs, os botões estão todos bugados e as animações estão ruins".
Esta varredura testou cada tela com toque de verdade (Playwright), procurou os defeitos e corrigiu
os que estão fora das áreas de outros agentes. Os defeitos dessas áreas estão listados para os donos.

## 1. Como foi testado

| Item | Como |
|---|---|
| Aparelhos | `devices['Pixel 7']` (412x915) em retrato; 360x740; 915x412 deitado com `hasTouch` e `isMobile` |
| Realismo | CPU 4x mais lenta (`Emulation.setCPUThrottlingRate 4`), GPU por software (swiftshader) |
| Toques | `page.touchscreen.tap` e arrastos com `Input.dispatchTouchEvent` (CDP) |
| Servidor | `npx vite --port 5199` e, para os testes longos, `vite build` + `vite preview` (o servidor de dev recarregava a página sozinho) |
| Por tela | 1 toque = 1 ação; `document.elementFromPoint` no centro de cada botão visível (nada invisível por cima); botão fora da tela; texto vazando; erros no console e `pageerror`; voltar (`ui.back()` = botão do Android) e Escape; telas presas |
| Hub | todos os botões do topo, Diário, Missões, Correio, Grátis, Código, Oferta, Corrida, Ranking, Melhorias, itens do Orbit, as 9 abas da barra de baixo |
| Painéis | Loja (5 abas), Passe (4 abas), Criar (9 abas), Social (Chat, Amigos, Ajustes), Campeonatos, Coleção, Ranking, Ajustes (incluindo **Controles**: cada botão, cada chave, arrasto da posição do analógico) |
| Bichinho | Cozinha (comprar comida, arrastar comida até a boca), Banheiro (esfregar até o fim), Quarto (apagar e acender a luz), Sala (bola e cócegas), Decorar, voltar |
| Minijogos | abrir → jogar 20 a 30 s com toques, arrastos e botões do próprio jogo → voltar (pausa) → voltar (continua) → "Sair para o menu" → abrir de novo. Orbit: 2 partidas, "Jogar de novo" com toque duplo, pausa, sair |
| Casa 2D | 5 cômodos, Decorar, Pintar, Limpar, Festa, Construir (planeta e fachada, "Surpreenda-me"), Amigos, Permissões. Casa 3D: só abrir e fechar (outro agente está refazendo) |
| Toque duplo | Diário, Grátis, Corrida, Bichinho, Passe, JOGAR, "Fechar" do anúncio: nada acontece 2 vezes |
| Idiomas | alemão (palavras longas) em 360x740: hub, 6 modais, 6 painéis |
| Desempenho | quadros por segundo ao abrir e fechar cada painel (`requestAnimationFrame`) e perfil de CPU (CDP `Profiler`) |

Capturas: `/tmp/claude-0/-home-user/e54d9133-8537-568e-8e68-c111f8896d63/scratchpad/qasweep/`
(cerca de 300 arquivos: `pixel-*`, `small-*`, `land-*`, `lang-de-*`). Os scripts dos testes estão em
`/tmp/claude-0/-home-user/e54d9133-8537-568e-8e68-c111f8896d63/scratchpad/qa/` (`h.js` tem os auxiliares).

## 2. Resultado geral

- **Nenhum erro de JavaScript** (`pageerror`) e nenhuma promessa rejeitada sem tratamento em nenhuma tela.
- Em retrato, todos os botões testados respondem a **um** toque e abrem **uma** vez (sem telas em dobro).
- O voltar fecha todos os painéis com 1 toque. Ele falhava em 2 lugares (anúncio de teste e Corrida). Os dois foram corrigidos.
- Os problemas de verdade estavam em 3 grupos: **desempenho dos modais** (blur), **paisagem** (Bichinho,
  Casa, Criador, Rally, fim de jogo do Orbit e onboarding quebrados) e **cartões sobrepostos** (pausa do jogo atrás do "Sair do jogo?").
  No APK as telas 2D ficam travadas em retrato (`core/orientation.ts`), então os bugs de paisagem afetam
  a versão web e os tablets. Nada mudou no retrato.

## 3. Bugs encontrados

Gravidade: **Alta** = trava, perde progresso ou fecha o app · **Média** = tela quebrada ou confusa · **Baixa** = acabamento.

### 3.1 Corrigidos nesta branch

| # | Tela | Passos | Gravidade | Status |
|---|---|---|---|---|
| 1 | Hub → Grátis / vídeo de Escudo (anúncio de teste) | tocar "Grátis" e apertar voltar ou Escape | **Alta** | Antes, o voltar não fazia nada e o anúncio ficava por cima de tudo. No Android o voltar **minimizava o app**. Agora o voltar fecha o anúncio. **831a118** |
| 2 | Hub → Corrida (Orbit) | tocar "Corrida" e apertar o voltar do Android | **Alta** | Antes, `ui.back()` devolvia `false` (só o Escape do teclado funcionava) e o app **minimizava**. Agora o voltar faz o mesmo que o X/Cancelar. **55941f8** |
| 3 | Modais (Ajustes, Loja, Diário, Missões...), Ranking, Coleção, editar perfil | abrir qualquer modal com o hub ao fundo | **Alta** (desempenho) | O `backdrop-filter: blur` precisava borrar o hub animado a cada quadro. Com CPU 4x: **19 fps com o modal aberto e 62 fps sem o blur**. O fundo agora é escuro e sem blur, com um fade de 0,18 s na entrada. **afcb684** |
| 4 | Queda Giratória | jogando, apertar voltar ou Escape | Média | Aparecia o cartão "Pausado" do próprio jogo **atrás** do "Sair do jogo?" do hub, e o texto dos dois vazava um pelo outro. Agora o hub pausa sem o cartão próprio. O botão ⏸ do HUD continua usando o cartão do jogo. **1484284** |
| 5 | Bloop Banda | tocando uma música, apertar voltar | Média | Mesmo problema do #4: "Pausado / Recomeçar / Sair da música" aparecia atrás do "Sair do jogo?". **4dd8d7a** |
| 6 | Rally Lunar | correndo, apertar voltar ou Escape | Média | Mesmo problema do #4. **7f83c8b** |
| 7 | Rally Lunar deitado (915x412) | abrir o Rally | Média | "Recorde" e "Jogar sozinho" ficavam por cima do nome e da descrição do carro, e **"Acelerar!" saía da tela** (não dava para começar). A garagem agora tem 2 colunas: carro e botão de um lado, melhorias do outro. **0ae2bda** |
| 8 | Bichinho deitado | abrir o Bichinho em 915x412 | Média | A bandeja cobria o bichinho (só aparecia o topo da cabeça) e o botão "Falar" ficava em cima do preço da 1ª comida, então o toque em "comprar" abria o microfone. A bandeja foi para a direita. **13b0e1c** |
| 9 | Bichinho → Cozinha | ter uma comida sem estoque | Média | A classe global `.empty` (dos estados vazios das listas) dava 26 px de padding às comidas sem estoque. Elas ficavam mais baixas que as outras e a prateleira ficava 52 px mais alta, tapando o chão. O botão "Falar" vazava com rótulos traduzidos ("Sprechen"). **54b4ab0** |
| 10 | Bichinho, Casa, Criador | comprar sem moedas, salvar e similares | Média | Os avisos eram faixas ou cartões **grandes no meio da tela**, cada tela com o seu. Agora usam a pílula pequena do canto (`ui/notify`), como o resto do app. `notify()` aceita `iconHtml` para os ícones da Casa. **1055374** |
| 11 | Onboarding deitado | 1ª abertura em 915x412 | Média | O botão "Bora jogar!" ficava abaixo da tela e só aparecia rolando. Agora fica grudado no rodapé em telas baixas. **d1f792f** |
| 12 | Casa 2D deitada | Decorar, Pintar, Limpar ou Festa em 915x412 | Média | O painel (~290 px) era descontado da altura e o cômodo ficava com ~50 px, **sumindo**. O painel agora é uma coluna à esquerda e o cômodo aparece à direita. O aviso "Offline" foi para o canto, porque no meio ele cobria o botão "Fita". **20847b6** |
| 13 | Criador (outros idiomas) | idioma ≠ pt, item de evento | Média | O botão "Só em evento" e a frase longa "Exclusivo de evento — vença os desafios..." usavam a **mesma chave** `creator.eventOnly`. Em inglês, o botão mostrava a frase inteira. Foi criada a chave `creator.eventBtn` nos 11 idiomas, e o extrator não mostra mais conflitos. **5d7a615** |
| 14 | Ajustes → Controles | abrir Ajustes | Baixa | "Tamanho do joystick" ficava centralizado e quebrado em 2 linhas, desalinhado de "Analógico". A prévia da posição do analógico tinha ~330 px de altura, metade do painel. Os rótulos agora ficam à esquerda e a prévia tem no máximo ~200 px. **4b6fe43** |
| 15 | Casa → Decorar | olhar a fileira de móveis | Baixa | Os cartões tinham alturas diferentes quando o nome quebrava em 2 linhas, e a fileira ficava "dentada". **6d3b48e** |
| 16 | Passe | abrir o Passe | Baixa | O nome do prêmio máximo era cortado no meio ("Bichinho Estrela-gu"), porque um `text-overflow` num contêiner flex não gera reticências. **2b3dcb8** |
| 17 | Corrida → resultado | menos de 3 jogadores no pódio | Baixa | O lugar vazio do pódio também herdava o padding da classe `.empty`. **42f980a** |
| 18 | Criador deitado | abrir "Criar" em 915x412 | Média | A grade de peças ficava com ~10 px de altura e "Salvar e usar" saía da tela. Agora o palco fica à esquerda e as abas, as peças e o botão de salvar à direita. **bd41a24** |
| 19 | Orbit → Fim de jogo deitado | morrer em 915x412 | Média | "JOGAR DE NOVO" e "Menu" ficavam abaixo da dobra e o toque não os alcançava sem rolar. Agora o placar fica à esquerda e as moedas e os botões à direita. **662ab6a** |

### 3.2 Abertos, de outros donos (não mexi)

| # | Tela | Passos | Gravidade | Dono |
|---|---|---|---|---|
| A1 | Hub → carrossel | trocar de jogo com CPU 4x | Média (desempenho) | **agente de desempenho** (`hub.ts`/`hub.css`). Troca de carta a ~10–19 quadros/s. O hub parado fica em 40–50 fps. O perfil mostra a maior parte em "(program)", ou seja, composição e pintura dos canvas da vitrine e dos blobs do fundo |
| A2 | "Sair do jogo?" do hub | voltar dentro de qualquer jogo | Média | **agente de desempenho** (`hub.css` `.gh-panel`). O cartão é **translúcido** e o conteúdo do jogo aparece através dele (no Rally, "Motor 140" aparece atrás de "Sair para o menu"). Use um fundo opaco |
| A3 | "Sair do jogo?" do hub | voltar no **menu** de um jogo (garagem do Rally, menu da Fábrica e da Banda) | Baixa | **agente de desempenho** (`hub.ts`). Diz "O progresso desta partida pode ser perdido" sem partida em andamento. Sugestão: o jogo informar `inMatch` e, fora da partida, o voltar sair direto |
| A4 | Hub → carta do Orbit | 412x915 | Baixa | **agente de desempenho** (`hub.css` `.ox-btn`/`.lo-chip`). Rótulos cortados: "Esc… Com…", "Ímã Com…", "Ranki…", "Melh…" |
| A5 | Hub → barra de baixo | 360 e 412 de largura | Baixa | **agente de desempenho**. A barra rola na horizontal, mas nada indica que há "Campeonatos / Coleção / Ranking" à direita (falta um degradê na borda ou uma seta) |
| A6 | Hub → "Oferta" | 412x915 | Baixa | **agente de desempenho**. O texto do cronômetro estoura o botão (`scrollWidth` > `clientWidth`) |
| A7 | Lenhadores (3D, 1ª pessoa) | abrir em 3D e andar 20 s | Média | **agente da Floresta**. Não aparece nenhuma árvore à vista e a dica "Vá até uma árvore e segure Cortar!" não indica para onde ir (falta seta ou bússola) |
| A8 | Lenhadores | sair do jogo | Baixa | **agente da Floresta**. Fica um `<svg id="fl-icon-defs">` no `body` depois de fechar. Pode ser de propósito (cache de ícones) |
| A9 | Cozinha Maluca | abrir, jogar, pausar, sair, abrir de novo | — | **agente da Cozinha**. Teste rápido OK, sem erros |
| A10 | Casa 3D | abrir e fechar na Casa | — | **agente da Casa 3D**. Teste rápido: abre e fecha com o voltar e devolve a Casa 2D. Nada além disso foi testado |
| A11 | Voo / Cor | — | — | Não estão registrados nesta base (`listGames` não os lista), então não foram testados |

### 3.3 Abertos, sem dono (baixa prioridade, não corrigidos)

| # | Tela | Gravidade | Observação |
|---|---|---|---|
| B1 | Loja / Criador | Média (desempenho) | Com CPU 4x, abrir a Loja leva ~250 ms síncronos (render das ofertas e das prévias de skin) e gera um quadro de ~470 ms. O Criador gera um quadro de 370–500 ms. Sugestão: desenhar as prévias sob demanda (`IntersectionObserver`) ou espalhadas em vários quadros |
| B2 | Fábrica Estelar | Baixa | A câmera mostra a base do vizinho por baixo do HUD do topo, e a tabela de pontos cobre o cano amarelo da própria base |
| B3 | Ajustes | Baixa | "Resgatar código" quebra em 2 linhas com o ícone sozinho à esquerda (412 px) |
| B4 | Onboarding / hub | Baixa | Antes do onboarding, o hub mostra um apelido sorteado (ex.: "Trovão Brilhante"). Ao tocar "Depois", entra **outro** apelido sorteado (o placeholder do formulário) |
| B5 | Código morto | Baixa | `#toast` (`styles.css`, com `transition: all`) e `.cr-toast`/`.pet-toast`/`.hm-toast` não são mais usados. Dá para apagar |
| B6 | Ferramenta (dev) | — | Com `node_modules` em symlink, o `vite` dev não serve as fontes Fredoka (`server.fs.allow`). As capturas do dev usam a fonte reserva. O build não tem esse problema |

## 4. Animações

- Transições em propriedades de layout: só sobraram barras de progresso (`width .4s` no Bichinho, nas missões e na Casa), que são pequenas e baratas. Nenhuma tela anima `top/left/height/margin` em elementos grandes.
- `transition: all` aparece só em `#toast` e `.cr-toast`, que não são mais usados (B5).
- Os modais abriam com `popIn` (escala com leve "pulo"), mas o fundo aparecia de uma vez. Agora ele entra com um fade curto.
- O que deixava tudo "travado" era o **blur dos fundos** (#3). Depois da correção, abrir Ajustes ou Diário fica em 55–60 fps com CPU 4x.

## 5. Verificação

- `npx tsc --noEmit -p .`: OK.
- `npx vite build`: OK.
- `node scripts/i18n/extract.mjs --check`: 0 conflitos, 0 chaves obrigatórias faltando em qualquer idioma (a pasta `scripts/i18n` foi restaurada depois).
- Depois das correções, novo teste dos 5 jogos (Tubo, Rally, Fábrica, Desastres, Banda) no build: o voltar mostra **só** o "Sair do jogo?". "Continuar" e "Sair" funcionam e o jogo abre de novo.

## 6. Commits

```
831a118 Anúncio de teste: voltar/Escape fecha o anúncio
55941f8 Corrida Orbital: botão voltar do Android sai da sala/corrida
4b6fe43 Ajustes > Controles: rótulos alinhados e prévia do analógico menor
d1f792f Onboarding em paisagem: "Bora jogar!" grudado no rodapé
1484284 Queda Giratória: sem pausa própria atrás do "Sair do jogo?"
4dd8d7a Bloop Banda: idem
7f83c8b Rally Lunar: idem
6d3b48e Casa > Decorar: cartões de móveis com a mesma altura
1055374 Avisos do Bichinho, Casa e Criador viram pílulas no canto
2b3dcb8 Passe: nome do prêmio máximo com reticências
13b0e1c Bichinho deitado: bandeja à direita
0ae2bda Rally Lunar deitado: garagem em 2 colunas
afcb684 Desempenho: sem backdrop-filter nos fundos de modal
5d7a615 i18n: chave própria para o botão "Só em evento"
54b4ab0 Bichinho: comidas sem estoque alinhadas; "Falar" cresce com o rótulo
42f980a Corrida: pódio vazio sem padding herdado
20847b6 Casa 2D deitada: painel em coluna, cômodo visível
bd41a24 Criador deitado: palco à esquerda, peças à direita
662ab6a Orbit, fim de jogo deitado: botões visíveis
```

---

# Varredura de integração 3 — todos os jogos e painéis (pt-BR)

Branch `wip/qa3` (base `claude/viral-game-apk-web-echogw` @ `1df5556`, já com a Loja de Criações e a TV Bloop) · 11/11/2026

## 1. Como foi testado

| Item | Como |
|---|---|
| Aparelhos | `devices['Pixel 7']` em retrato (412x839) e 915x412 deitado com `hasTouch`/`isMobile`; locale `pt-BR` |
| Realismo | CPU 4x mais lenta (CDP `Emulation.setCPUThrottlingRate 4`), GPU por software |
| Servidor | `vite build` + `vite preview` (1ª rodada) e `wrangler dev --local` (Loja, TV, Moderação e o resto, com a API de verdade) |
| Jogos | os 17 do hub + Orbit, com variantes: Desastres 2D/3D, Lenhadores 2D/3D/Mundo Aberto, Pouso Forçado (voo + treino + hangar + Ajustes + "Voar com amigos"), Cozinha 2D/3D, Pintou Ganhou (treino + duelo), Cava & Fala (vila + arena). Por jogo: abrir → 35–40 s de toques/arrastos/botões do próprio jogo (macaco com preferência pelos botões de jogar) → voltar (pausa) → CONTINUAR → voltar → "Sair para o menu" → abrir de novo → sair |
| Painéis | Loja, Passe, Bichinho, Espelho (câmera falsa), Casa, Amigos, Criar (+ Maquiagem), Social, Campeonatos, Coleção, Ranking, TV Bloop, Ajustes, Grupo; 30–35 s de toques em cada um e depois só o voltar até o hub |
| Verificações | erros/`pageerror`; textos em inglês ou chaves cruas; `getBoundingClientRect` de tudo que é tocável (sobreposição > 25 %, embaixo do botão de girar do hub, faixa do `--safe-bot`, fora da tela, bloqueado por outro elemento); carregamento preso; trilha de orientação (`__bloopOrient`); anúncio de teste visível durante a partida; elementos sobrando no `body` depois de sair |
| Extras | intros 3D puladas com um toque (Tubo, Voo, Studio, Cozinha: somem em 0,7–1,6 s); Orbit pausar/continuar/morrer; Bichinho: 4 cômodos, conversa por voz (STT falso) e por texto, travessuras; Espelho com câmera falsa (desliga a câmera ao sair); Casa 3D + Festa; Loja do Studio (20 miniaturas), publicação → Moderação; Cinema → Exportar → Enviar para a TV → Moderação |

Capturas: `/tmp/claude-0/-home-user/e54d9133-8537-568e-8e68-c111f8896d63/scratchpad/qa3/` (`pixel-*`, `land-*` = jogos; `Ppixel-*`, `Pland-*` = painéis; `v-*` = verificação das correções). Scripts: `.../scratchpad/qa3s/` (`run.js` jogos, `panel.js` painéis, `extra.js`/`misc.js`/`verify.js` casos específicos).

## 2. Resultado geral

- **Nenhum `pageerror`** nem promessa rejeitada em nenhum jogo ou painel. Só avisos de bibliotecas (three `KHR_parallel_shader_compile`, MediaPipe `XNNPACK` no Espelho).
- **Nenhum texto em inglês** nas telas em pt-BR (o único alarme foi "Google Play" no aviso de assinatura, que está certo).
- **Anúncios:** nenhum intersticial apareceu no meio de uma partida. Os que apareceram foram pedidos pelo jogador (vídeo para continuar no Orbit/Tubo, "Liberar" na Casa, "Grátis" na Loja). O de saída é bloqueado no começo da sessão, como manda a política.
- **Orientação:** os jogos 2D ficaram em pé; os 3D pediram paisagem (`watch3d`) e, sem a API de travar a tela (web), mostraram "Gire o celular / Jogar em pé". O botão de girar do hub aparece só com 3D na tela.
- **Voltar:** todos os jogos mostram "Sair do jogo?" e voltam com CONTINUAR. Todos os painéis fecham com o voltar. Dois casos prendiam o jogo e foram corrigidos (#5 e #6).
- Abrir de novo funciona em todos (sem carregamento preso, sem elementos sobrando além do `#nt-root` dos avisos, que é global de propósito).

## 3. Bugs encontrados

### 3.1 Corrigidos nesta branch

| # | Tela | Passos | Gravidade | Status |
|---|---|---|---|---|
| 1 | Studio → Loja de Criações | abrir a Loja | **Alta** | `captureThumb` quebrava com "Converting circular structure to JSON" (o `clone()` do three copia o `userData` via JSON e `userData.owner` é circular nas peças `ref`). O laço das miniaturas parava no 1º erro e o resto dos cartões ficava azul vazio. Agora o `owner` sai antes do clone e volta depois; as 20 criações iniciais ganham foto. **bbde7fc** |
| 2 | Moderação (painel admin) | revisar um item com miniatura inválida | Média | O servidor aceitava qualquer base64 com cabeçalho `data:image/...` (inclusive o `thumbnail` da criação, sem checagem nenhuma) e a Moderação mostrava o ícone quebrado. Agora a miniatura precisa começar com a assinatura real (RIFF/WEBP, FFD8, PNG) e a Moderação troca uma imagem que não abre por "foto inválida". Com miniaturas de verdade (Studio e TV) tudo aparece; não consegui reproduzir a imagem quebrada sem dados forjados, então a causa mais provável é item de teste com base64 falso. **8db52a8** |
| 3 | Noites do Acampamento | abrir em 412 px | Média | Os 3 cartões (Sozinho, Criar sala, Entrar) somavam 424 px e saíam pelas bordas. **dd6b67b** |
| 4 | Lenhadores deitado | abrir em 915x412 | Média | O 3º modo (Mundo Aberto 3D) ficava abaixo da tela, sem rolagem; agora os 3 ficam lado a lado. **667c7ee** |
| 5 | Cozinha (e Casa/saguão) | abrir a roda de emotes e apertar voltar | **Alta** | O "Sair do jogo?" abria **por baixo** da roda, e os toques em "Sair"/"CONTINUAR" caíam na roda: o jogo ficava preso. A roda agora entra na pilha do voltar. **2ae5bf4** |
| 6 | Cinema | abrir Exportar (ou qualquer folha, TV, gravação com o rosto) e apertar voltar | **Alta** | Mesmo problema: a folha fica no `body` (z 9000) e o "Sair do jogo?" abria por trás. Agora o voltar fecha a folha de cima. **e5127a0** |
| 7 | Mundo Aberto em pé | "Jogar em pé" | Média | O botão de girar do hub cobria o nome do bioma; o grupo da esquerda do topo agora para antes do centro. **d349158** |
| 8 | Lenhadores 3D em pé | "Jogar em pé" | Média | Mesmo caso: o botão de girar cobria o contador de toras ("[⟳]0/2"). Só vale com o botão visível (`:has(.gh-rot)`), o 2D não muda. **9658012** |
| 9 | Lenhadores → Controles | engrenagem no jogo | Baixa | O painel era translúcido e "Cortar ali / Chamar ajudantes" apareciam através dele. **2f981e6** |
| 10 | Pouso Forçado → ordens do ajudante | tocar no retrato de um ajudante | Média | Os rótulos ("Segurar o manche", "Acalmar passageiros") tinham `max-width` maior que o botão e vazavam um por cima do outro. Agora quebram em 2 linhas. **06ebc67** |
| 11 | Studio em pé | "Jogar em pé" | Média | A barra do topo tem ~760 px: "Loja" e "Testar" ficavam fora da tela. Em pé a barra rola e esses 2 botões ficam só com o ícone. **b2117a7** |
| 12 | TV Bloop (painel) | abrir a TV no hub | Baixa | A TV não estava em `COVER_SEL`: a vitrine continuava animando por baixo e os pop-ups automáticos (`hubIdle`) podiam abrir por cima da TV. **3cb04c7** |
| 13 | Grupo | abrir "Jogar com amigos" | Baixa | "Escanear" encostava na sombra do "Criar grupo". **846017c** |

### 3.2 Abertos, de outros donos

| # | Tela | Passos | Gravidade | Dono / sugestão |
|---|---|---|---|---|
| C1 | Hub × jogos (voltar) | Pouso Forçado → Ajustes (folha) e voltar; também Cozinha, Lugar, Monta & Leva, Cava & Fala | Média | **hub** (`src/hub/hub.ts` `hubBack`). Esses jogos registram `pushBack` para as próprias telas (folha de Ajustes, mapa de fases...), mas o hub sempre responde antes com "Sair do jogo?", então esses handlers nunca rodam. Sugestão: guardar a profundidade da pilha (`core/back`) ao abrir o jogo e, em `hubBack`, chamar `popBack()` se a pilha cresceu desde então. Não mexi porque muda o voltar de vários jogos de uma vez |
| C2 | Cozinha 3D e Pouso Forçado em pé | 3D → "Jogar em pé" | Média | **Cozinha** (`games/cozinha/style.ts` `.cz-top`) e **Voo** (`games/voo/voo.css` `.voo-top`). O botão de girar do hub cobre o relógio ("1:0⟳") e a altitude ("2⟳m"). No Voo, os retratos dos ajudantes saem pela direita (`.voo-mate` até x=431 em 412). Noites, Cava & Fala e Lenhadores já liberam o centro |
| C3 | Studio em pé | "Jogar em pé" | Baixa | **Studio** (`studio.css`). Depois do #11, o botão de girar ainda fica por cima do nome da criação/Desfazer na barra que rola |
| C4 | Jogos 3D na web | abrir um jogo 3D em pé num navegador sem trava de tela | Baixa | **orientação** (`core/orientation.ts`). A pílula "Gire o celular / Girar agora / Jogar em pé" cobre o topo do jogo (Studio: voltar/salvar; Desenha e Vira: o título; Noites: o botão de sair) até o jogador escolher. No APK a trava funciona e a pílula não aparece |
| C5 | Criar → Maquiagem | macaco tocou em "Brilho PRO" → "Ver Clube Bloop" e depois só voltar | Baixa | **Criador/Maquiagem** (`src/makeup/studio.ts`, `src/ui/creator.ts`). Numa rodada deitada o voltar não fechou mais o Criador (8 voltar seguidos). Repeti o mesmo caminho à mão e fechou normalmente; fica para observar |
| C6 | Avisos (`ui/notify`) | ex.: "Moedas insuficientes" na Loja/Bichinho; "Desative Jogar sozinho" no Mundo Aberto | Baixa | **ui** (`#nt-root`, `--nt-top`). A pílula cobre por ~2 s as abas da Loja, o cabeçalho do Bichinho e o banner do Mundo Aberto. É passageira |
| C7 | Casa / Amigos → Festa | voltar várias vezes durante a festa | — | Não é bug: o voltar alterna "Encerrar a festa?" e Continuar (mesmo padrão do "Sair do jogo?"). Só "Encerrar" sai |

## 4. Verificação

- `npx tsc --noEmit -p .` e `-p server`: OK. `npx vite build`: OK.
- `node scripts/i18n/extract.mjs --check`: 0 conflitos, 0 chaves faltando nos 11 idiomas (pasta restaurada depois). Nenhuma chave nova.
- Reteste no build final: Noites em 412 px, Lenhadores deitado (3 modos), Studio em pé (barra rola, nada cortado), Loja do Studio (20/20 miniaturas, sem erro), Moderação (criação + filme com 3 fotos cada), Cinema (Exportar + voltar fecha a folha), roda de emotes (voltar fecha; fechar tocando fora não deixa entrada velha na pilha).

## 5. Commits

```
846017c Grupo: "Escanear" não encosta mais na sombra do "Criar grupo"
e5127a0 Cinema: voltar fecha a folha/TV/gravação aberta por cima
2ae5bf4 Voltar com a roda de emotes aberta fecha a roda
667c7ee Lenhadores deitado: os 3 modos lado a lado
3cb04c7 Hub: TV Bloop conta como tela por cima
b2117a7 Studio em pé: barra do topo rola em vez de jogar Loja/Testar para fora da tela
8db52a8 Loja/TV: miniatura só entra se for imagem de verdade; Moderação mostra "foto inválida"
bbde7fc Studio: miniatura de criação com peças de referência não quebra mais
06ebc67 Pouso Forçado: rótulos do menu de ordens quebram em 2 linhas
9658012 Lenhadores 3D: topo do HUD deixa o centro livre para o botão de girar
2f981e6 Lenhadores: painel Controles opaco
d349158 Mundo Aberto: topo do HUD deixa o centro livre para o botão de girar
dd6b67b Noites: cartões do menu cabem em 412 px
```
