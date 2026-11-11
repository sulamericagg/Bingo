# Relatório do Chefe de Qualidade — Bloop World

Branch `wip/qa2` · 11/11/2026 · base: `claude/viral-game-apk-web-echogw` já com Mundo, Garimpo, TV, Jangada e Desastre juntados.

> **Em uma frase:** os 22 jogos abrem, jogam, pausam e fecham sem travar e sem erro; o online (grupo, convite,
> todo mundo entrando junto e duelo com pódio) funciona de ponta a ponta; corrigi 18 problemas. O que falta está
> na lista ❌ abaixo, com o nome de quem cuida. Algumas coisas só dá para confirmar no celular de verdade (📱).
>
> **Placar dos pedidos:** ✅ 38 · ❌ 5 · 📱 15 (precisa do celular). Os 5 ❌: Desastre em 3ª pessoa e avisos repetidos
> (agente do Desastre trabalhando), Garimpo nascendo embaixo do telhado, texto corrido na pasta do Pouso Forçado.

## 1. Como eu testei (sem precisar entender de programação)

Fiz um **robô de teste** que usa o jogo como uma criança usaria: toca no JOGAR, mexe o analógico, arrasta para olhar,
aperta o voltar do Android, sai e abre o próximo — e tira **foto da tela** em cada passo.

| O quê | Onde | Resultado |
|---|---|---|
| Todos os 22 jogos: abrir pelo JOGAR → jogar → voltar (pausa) → continuar → sair → hub | celular Pixel 7 em pé e deitado (844×390 e 740×360) | **22 de 22 sem falha** (fotos `g-<jogo>-*.png`) |
| Botões em cima de botões no HUD dos jogos 3D (pular, ação, mochila, barra de itens, analógico) | 740×360, 844×390, 915×412 | sem sobreposição depois das correções (fotos `hud-<jogo>-<tamanho>.png`) |
| Hub: nome, Amigos, Ajustes, Loja, todos os botões de cima e de baixo abrem e fecham com o voltar | 412×915 e 360×740, português e inglês | ver §3 (fotos `hub-*.png`) |
| Abrir e fechar jogos 15 vezes seguidas (memória) | — | memória, telas 3D e canvas **não crescem** |
| Online com 2 jogadores e servidor local | 2 celulares virtuais | grupo, convite na hora, entrar junto em Queda Giratória, Noites, Cava & Fala, pódio do duelo ✅ |
| Testes automáticos que já existiam | servidor, Cava & Fala, 200 fases do Monta & Leva, traduções, tipos e build | todos verdes |

Como rodar de novo: `npm run qa` (tudo) ou `npm run qa -- games` / `hud` / `hub` / `online` / `perf` / `deep`.
As fotos ficam na pasta `shots-qa/`.

## 2. Pedidos do dono (docs/DONO-PEDIDOS.md) — item por item

Legenda: ✅ conferido e certo · ❌ ainda errado ou faltando · 📱 o robô não consegue provar, precisa do celular de verdade.

### Regras gerais
| Pedido | | O que vi / foto |
|---|---|---|
| Narração desligada por padrão e dá para ligar | ✅ | começa desligada, liga/desliga e é lembrada (`hub-pixel-ajustes.png`) |
| Ícone + mãozinha, nada de parede de texto | ❌ | quase tudo ok, mas a "pasta de missão" do Pouso Forçado e as regras da TV ainda são texto corrido (`deep-voo-brief.png`) |
| HUD padrão Minecraft: barra no meio embaixo, analógico à esquerda, pular à direita, nada sobreposto em 740/844/915 | ✅ | Noites, Mundo, Garimpo, Jangada, Cava & Fala sem sobreposição (`hud-*.png`). Noites e Garimpo tinham sobreposição — **corrigido** |
| Nada embaixo do banner de anúncio | ✅ | os jogos encolhem acima do banner (regra do hub); nenhum botão tapado no teste |
| Objetivos aparecem e recolhem | ✅ | Noites/Mundo/Cozinha mostram e recolhem |
| Sem botões de debug para o jogador | ✅ | a joaninha só aparece com o Beta ligado; nenhum botão de debug no hub nem nos jogos |
| 3D em 1ª pessoa, botão de câmera no topo, retícula no centro | ❌ | Noites, Mundo, Cozinha, Garimpo, Jangada ✅; **Desastre 3D ainda começa em 3ª pessoa** (agente do Desastre) |
| Personagem do jogador = o Bloop 2D dele | ✅ | Noites, Garimpo, Mundo (online agora usa a chave certa `mundo`) |
| Nada flutuando/atravessando, texturas sem buraco | 📱 | não vi nada nas fotos; precisa olhar jogando de verdade |
| Online: em grupo todo jogo entra junto, líder com coroa, convite na hora | ✅ | convite chegou em **0 s**, coroa ♛, o amigo entrou sozinho nos 5 jogos testados (`online-*.png`) |
| 60 FPS / tablets velhos | 📱 | no robô (CPU lenta, sem placa de vídeo) os jogos 2D ficam a ~60 e os 3D a 12–35; ver §5 |
| Sons e música próprios, param ao sair | ✅ | ao sair de cada jogo volta a música do hub, nenhum som extra fica tocando |

### Hub / geral
| Pedido | | O que vi / foto |
|---|---|---|
| Nome do jogador visível no topo | ✅ | `hub-pixel-0.png` |
| Botão "Amigos" claro | ✅ | amarelo, 68 px, abre o Grupo (`hub-pixel-amigos.png`) |
| Presentes chegam sozinhos | ✅ | o hub resgata sozinho a cada 3 s quando está parado (código conferido; servidor testado no `test:server`) |
| Voz desligável | ✅ | Ajustes → "Ler em voz alta" |
| Tela não apaga | ✅ | Android: `FLAG_KEEP_SCREEN_ON`; web: Wake Lock |
| Rotação automática nos jogos 3D | ✅ | todo jogo 3D deitou sozinho e o hub voltou em pé ao sair (22/22) |
| Nenhum cadeado/botão de girar poluindo | ✅ | **corrigido**: o botão de girar ficava no topo de todo jogo 3D; agora só aparece se o celular não deitou |

### Noites do Acampamento
| Pedido | | |
|---|---|---|
| 1ª pessoa, HUD limpo, barra de itens | ✅ | `deep-noites-walk.png`, `hud-noites-740x360.png` (barra encostava no analógico — **corrigido**) |
| "Mochila cheia, o resto foi para o acampamento" | ✅ | texto existe no jogo (`noites.say.bagFull`) |
| Árvore com entalhe, toras, fogueira com níveis, construção em grade, ajudantes, noite 1 sem bichos | 📱 | o robô não joga uma noite inteira; precisa testar no celular |

### Mundo (blocos)
| Pedido | | |
|---|---|---|
| Jogo separado no hub | ✅ | carta própria "Mundo" |
| HUD padrão (barra, corações, comida, pular) | ✅ | `hud-mundo-844x390.png` |
| Sem o mundo antigo com HUD velho | ✅ | **corrigido**: tirei "Mundo dos Lenhadores (clássico)" da lista do Mundo |
| Servidores: lista, um toque entra | 📱 | sem internet aparece "Sem internet agora"; em pé o botão "Criar servidor" saía da tela — **corrigido**; entrar num servidor de verdade precisa de internet |
| Colocar/quebrar, picareta, caverna, estradas, nave caindo | 📱 | abertura com a nave aparece ("Sua naveta caiu!"); o resto precisa de jogo longo |

### Garimpo Bruto
| Pedido | | |
|---|---|---|
| Personagem é o Bloop do jogador; 1ª pessoa a pé | ✅ | |
| Abertura do vovô sem deixar erro ao sair no meio | ✅ | **corrigido** (erro repetia em todos os jogos depois) |
| Carrinho de mão não tapa a visão | ✅ | **corrigido**: antes a caçamba enchia o meio da tela; agora fica embaixo (`deep-garimpo-fp.png`) |
| 3ª pessoa / de frente mostram o Bloop | ❌ | no começo ele nasce **embaixo do telhado** do acampamento e a câmera fica dentro do telhado vermelho (`deep-garimpo-tp.png`) — agente da abertura do Garimpo |
| Máquinas, água, bateia, consertos | 📱 | |

### Desastres (outro agente trabalhando agora)
| Pedido | | |
|---|---|---|
| Fácil → difícil, personagem do jogador | 📱 | em obra |
| 1ª pessoa com câmera | ❌ | começa em 3ª pessoa |
| Avisos sem repetir | ❌ | dica repetida em 2 lugares e contador ×14 — passado para o agente do Desastre |

### Pouso Forçado
| Pedido | | |
|---|---|---|
| HUD sem marcadores em cima dos controles | ✅ | `deep-voo-fly.png`, `deep-voo-740.png` |
| Voltar não perde o voo sem perguntar | ✅ | **corrigido** na pasta de missão |
| Tremedeira, estol, câmera giratória, passageiros, comida | 📱 | |

### Cozinha
| Pedido | | |
|---|---|---|
| 1ª pessoa, botão contextual "Pegar" separado, cliente na janela | ✅ | `g-cozinha-3-740x360.png` |
| Sininho, fogão pegando fogo, geladeira, salão | 📱 | precisa jogar o dia inteiro |

### Anomalias & Cia
| Pedido | | |
|---|---|---|
| Modos Turno da noite, Recepção e Corredor | ✅ | `deep-anomalias-0.png` |
| Música do app desligada lá dentro | ✅ | o pacote de som do jogo desliga a música do hub |
| 5 lugares; mapas não escuros demais | 📱 | os lugares ficam dentro do "Turno da noite" |
| Menu misturado com a abertura 3D | ✅ | **corrigido** |

### Cava & Fala
| Pedido | | |
|---|---|---|
| Construir qualquer coisa falada | ✅ | `npm run test:cava` 22/22 |
| Online | ✅ | grupo entrou junto (`online-cavafala-B.png`) |
| Nascer em terra firme, microfone com legenda | 📱 | |

### Monta & Leva
| 200 fases com solução | ✅ | `montaleva-verify`: as 200 fases têm solução |
|---|---|---|
| Caixa, motor, peças quebram, suspensão | 📱 | |

### Caça Bloop · Espelho
| Mapa real, GPS, modo controle; rosto acompanhando, microfone | 📱 | abrem sem erro; precisam de GPS/câmera de verdade |
|---|---|---|

### Cinema / TV
| Pedido | | |
|---|---|---|
| TV cheia de filmes (~100) | ✅ | 100 filmes no catálogo (`deep-tv-catalogo.png`) |
| Contador de tempo longe da marca "Feito no Bloop World" | ✅ | contador no canto de cima, marca embaixo (`deep-tv.png`) |
| "Criar história" deitado sem botão por cima | ✅ | **corrigido** (`deep-cinema-beats-land.png`) e a barra da "Minha história" ficou mais baixa |
| Textos das expressões inteiros | ✅ | **corrigido** |
| Dublagem, IA modera, criador de música, microfone | 📱 | |

### Jangada Bloop
| Pedido | | |
|---|---|---|
| HUD | ✅ | `hud-jangada-*.png` |
| Tubarão aparece embaixo d'água | ✅ | **corrigido** (água funda não é mais 100 % opaca perto da jangada) — confirmar no celular 📱 |
| Pesca e segundo andar | 📱 | |

## 3. Hub (412×915, 360×740 e em inglês)
- **56 de 56** verificações certas em pé (Pixel 7): nome no topo, botão Amigos, Ajustes (narração, 4 controles de volume,
  gráficos), Diário, Missões, Correio, Grátis (anúncio de teste fecha com o voltar), Código, Oferta, Gemas, Perfil e os
  11 painéis da barra de baixo (Loja, Passe, Bichinho, Espelho, Casa, Criar, Social, Campeonatos, TV, Coleção, Ranking)
  — todos abrem e fecham com o voltar do Android, sem erro.
- 360×740 e inglês: o único "erro" era do próprio robô (cartas vizinhas do carrossel fora da tela); corrigi o robô.
- Com grupo, os botões Votação/Pronto/Chat subiam por cima do JOGAR — **corrigido** (`online-B-grupo.png`).

## 4. O que eu consertei (18 itens — detalhes em `docs/QA-BUGS.md`)
1. Botão de girar parado no topo de todo jogo 3D → só aparece se o celular não deitou.
2. Menu da Anomalias misturado com a abertura 3D.
3. Pouso Forçado: voltar na pasta de missão saía do jogo sem perguntar.
4. Noites: barra de itens embaixo do analógico em 740×360.
5. Garimpo: carrinho de mão tapando o meio da tela na 1ª pessoa; câmera "de frente" mostrando mais o Bloop.
6. Garimpo: relógio em cima da carga ao girar; mochila encostando no pausa; avisos em cima do objetivo; 1ª picape mais barata (750).
7. **Garimpo: sair durante a abertura do vovô deixava um erro repetindo em todos os jogos depois** (o mais grave que achei).
8. Cava & Fala: título embaixo do X.
9. Cinema: nomes das expressões cortados; "Fazer o filme!" e a barra da "Minha história" tapando o cartão quando deitado.
10. Mundo: tirada a opção do mundo antigo dos Lenhadores; topo dos Servidores em pé; Bloop 2D dos amigos online com a chave certa.
11. Jangada: dá para ver o tubarão embaixo d'água perto da jangada.
12. Grupo: Votação/Pronto/Chat por cima do JOGAR.
13. Pouso Forçado: 23 erros seguidos no hangar quando o celular está sem memória.
14. Teste do servidor desatualizado (2 falhas falsas) — agora 278/278.

## 5. Desempenho (CPU 4× mais lenta, gráficos no Mínimo, sem placa de vídeo)
A máquina de teste estava muito ocupada (outros 5 agentes compilando e testando), então os números são o **pior caso**
e servem para comparar os jogos entre si. Medido na tela de entrada de cada jogo:

| Jogo | FPS | |
|---|---|---|
| Desastre (escolha 2D/3D) | 1 (um quadro de 4,9 s) | ❌ em obra pelo agente do Desastre |
| Bloop Studio | 7 | ❌ |
| Pouso Forçado (hangar) | 9 | ❌ |
| Desenha e Vira | 13 | ❌ |
| Cozinha | 25 | 🔶 |
| Jangada | 28 | 🔶 |
| Todos os outros 15 + hub | 57–60 | ✅ |

Dentro da partida, sem CPU lenta: jogos 2D a ~60; 3D (Noites, Mundo, Garimpo, Cozinha) entre 12 e 35 aqui — no celular
com placa de vídeo de verdade deve ser bem mais. **Precisa medir num tablet velho de verdade** 📱.

## 6. Rodada final (o que o robô mostrou por último)
| Teste | Resultado |
|---|---|
| 22 jogos abrem → jogam → pausam → saem | 21/22 na rodada cheia; o que falhou (Pouso Forçado, erro no hangar) foi corrigido e passou (4/4 na repetição) |
| HUD sem sobreposição em 740/844/915 | ✅ em todos os jogos medidos (Pouso Forçado, Anomalias e Desenha: conferidos só por foto) |
| Hub | 56/56 |
| Online (2 jogadores + servidor local) | **28/28**: cadastro, amizade, grupo, convite na hora, líder com coroa, entrar junto em Queda Giratória, Cozinha, Noites, Garimpo e Cava & Fala, pódio do duelo para os dois |
| Memória (15 aberturas) | sem vazamento de memória, canvas ou 3D; ouvintes crescem um pouco (anotado) |
| `tsc` app e servidor, `vite build`, `i18n:check`, `test:server` (278), `test:cava` (22), Monta & Leva (200 fases) | todos verdes |

## 7. Precisa testar no celular de verdade (📱)
Rotação de verdade (o robô simula), vibração, microfone, câmera do Espelho, GPS da Caça, anúncios reais, notificações,
desempenho em tablet velho, Noites jogando uma noite inteira, Cozinha um dia inteiro, servidores do Mundo na internet,
dublagem e IA do Cinema.
