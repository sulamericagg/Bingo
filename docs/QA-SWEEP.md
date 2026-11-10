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
