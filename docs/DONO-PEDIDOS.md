# Pedidos do dono (checklist de qualidade)

Lista viva do que o dono pediu/reclamou ao testar no celular. O "chefe de qualidade" confere cada item
no jogo real e marca ✅ / ❌ com print. Regras gerais valem para TODOS os jogos.

## Regras gerais
- Criança não sabe ler: ícone + voz (narração é opcional, desligada por padrão) + mãozinha; nada de paredes de texto.
- HUD limpo, padrão Minecraft mobile nos jogos 3D: barra de itens no meio embaixo, barras acima dela, joystick à
  esquerda, pular à direita, nada sobreposto em 740×360 / 844×390 / 915×412; nada embaixo do banner de anúncio
  (`var(--safe-bot)`); objetivos aparecem 3–4 s e recolhem; sem botões de debug visíveis para o jogador.
- 3D: primeira pessoa por padrão, botão de câmera no topo (1ª → 3ª atrás → 3ª de frente); retícula no centro;
  andar igual à Cozinha (src/3d/fpkit); personagem do jogador = o Bloop 2D dele (src/3d/paper) na 3ª pessoa.
- Nada flutuando, nada atravessando, nenhum objeto coletado deixa colisão para trás; texturas sem buracos.
- Nunca recriar sistemas do zero quando já existe um compartilhado (fpkit, paper, nature, audio, party, build).
- Online: estando em grupo, todo jogo entra junto sozinho (líder com coroa, sem códigos); convite aparece na hora.
- 60 FPS alvo; tablets velhos têm que rodar (níveis de qualidade).
- Sons e música próprios por jogo (src/audio).
- Originalidade: gêneros e mecânicas sim; nomes, artes, músicas e marcas de terceiros não.

## Hub / geral
- Nome do jogador visível no topo; botão "Amigos" claro; presentes chegam sozinhos; voz desligável.
- Tela não apaga; rotação automática nos jogos 3D; nenhum cadeado/botão de girar poluindo a tela.

## Noites do Acampamento
- 1ª pessoa; árvore com entalhe progressivo, cai e solta toras/galhos no chão para pegar; carregar e jogar na
  fogueira; fogueira com timer e níveis (maior = consome mais), mais difícil; mochila em espaços, sacos, "Mochila
  cheia, o resto foi para o acampamento"; ferramentas são itens (machados melhores); ajudantes opcionais (padrão
  sozinho, escolher quantos); noite 1 sem bichos, ficando mais difícil; construção em grade com encaixe; estoque,
  carrinho; menu de criar rolando e legível; HUD dedicado limpo.

## Mundo (blocos)
- Jogo separado no hub; colocar/quebrar igual Minecraft (toque coloca, segurar quebra), bloco encaixa no terreno;
  mira; HUD padrão; sem tremedeira ao andar; grama/plantas somem ao quebrar o chão; picareta na mão bonita;
  caverna sem buracos de textura; estradas pintadas sem grama no meio; baús no chão; serraria não flutua;
  cena de abertura da nave caindo; sem carrinho aparecendo do nada; sem joystick duplicado ao entrar em veículo.
- Servidores estilo Minecraft: lista com fotos, um toque entra, PvP, minigames, servidores criados no Studio.

## Garimpo Bruto
- Personagem é o Bloop do jogador; carrinho de mão segue a inclinação, dá para largar/pegar; 1ª pessoa a pé;
  máquinas detalhadas; água/barragem; bateia; RP/estrada; consertos.

## Desastres
- Muito fácil → mais difícil (game designer); personagem do jogador; 1ª pessoa com câmera.

## Pouso Forçado
- Sem tremedeira, estol sem potência, câmera externa giratória, superfícies animadas, nuvens bonitas, HUD sem
  marcadores em cima dos controles, passageiros sentados, escala certa, serviço de comida.

## Cozinha
- Botão contextual (colocar/entregar) separado de largar e de apagar; sininho funciona sempre; pratos não bugam;
  itens soltos fáceis de pegar; fogão esquecido pega fogo; geladeira abre para fora; cliente visível na janela;
  salão com clientes.

## Anomalias & Cia
- 5 lugares (Hospital, Creche, Cabanas, Lanchonete, Posto 24h) + modos Recepção e Corredor; música do app
  desligada lá dentro; mapas não escuros demais.

## Cava & Fala
- Nascer em terra firme; microfone liga/desliga com legenda ao vivo; construir QUALQUER coisa falada em blocos
  (gerador no aparelho); online.

## Monta & Leva
- Caixa do tamanho certo; motor solto não anda; peças quebram; suspensão; 200 fases com solução.

## Caça Bloop
- Mapa real da cidade (OSM); GPS sem pulos; modo controle.

## Espelho
- Rosto acompanhando (boca/piscar); botão de microfone; permissões.

## Cinema / TV
- Modo fácil, dublagem, IA modera; TV cheia de filmes (~100) com música; criador de música; microfone no
  "escreva sua historinha".

## Jangada Bloop
- Novo; testar pesca e segundo andar (não testados).
