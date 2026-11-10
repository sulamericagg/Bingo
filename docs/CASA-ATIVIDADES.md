# Casa 3D — "vida em casa" (atividades com física)

Módulo: `src/home3d/activities/` (autocontido). Ganchos em arquivos existentes ficam
marcados com `[casa-ativ]` (só `index.ts` e `fps.ts` do `src/home3d`).

## Pesquisa rápida — o que jogos de casa / vida / sandbox de cozinha fazem

Olhamos os gêneros (simuladores de vida, simuladores de cozinha com física, jogos
"aconchegantes" de casa) e o que aparece em quase todos:

| Tema | O que os jogos costumam oferecer |
|---|---|
| **Necessidades** | barrinhas que descem com o tempo (fome, higiene, energia, diversão, social) e que você repõe comendo, tomando banho, dormindo, se divertindo. |
| **Cozinha** | geladeira/despensa, cortar na tábua, frigideira/panela/forno, liquidificador; receitas descobertas pelo jogador; nos de física, tudo pode ser jogado, derrubado, queimado e pegar fogo (e apagar com extintor). Modo "sandbox" sem instruções é o mais divertido. |
| **Tarefas da casa** | lavar louça, varrer/aspirar sujeira, tirar o lixo, lavar roupa, arrumar a cama, regar plantas. A graça é a bagunça acumular de forma visível e a limpeza ser satisfatória (espuma, brilho). |
| **Hobbies** | TV/videogame, música, horta (plantar → crescer em tempo real → colher), fotos/selfie no espelho. |
| **Festa** | decorar (balões, bandeirinhas, luzes), pôr a mesa, fazer bolo, ligar a música e chamar os amigos. |
| **Caos** | física exagerada: pilhas que caem, comida que espirra na parede, liquidificador sem tampa, panela que transborda — sempre cartunesco e sem "perder" o jogo. |

Fontes consultadas: páginas de loja / divulgação de simuladores de cozinha com
física e de simuladores de vida (sandbox de receitas, caos, necessidades, horta,
festa). Nada de nomes, personagens, arte ou interface de outros jogos foi copiado:
as mecânicas abaixo são originais do Bloop World.

## O que escolhemos implementar

### Cozinha livre (física)
- **Geladeira**: abre uma fileira de ingredientes; o escolhido aparece na mão como objeto
  com física: tomate, cenoura, batata, cebola, alface, pimentão, brócolis, cogumelo, milho,
  ovo, queijo, pão, carne, tofu, macarrão, arroz, banana, maçã, morango, laranja, leite,
  farinha, chocolate.
- **Tábua**: solte o ingrediente e segure **CORTAR** — ele se divide em fatias e depois em
  cubinhos (os pedaços pulam de verdade).
- **Fogão** (frigideira + panela + forno): ligar/desligar; o que cai na frigideira frita
  (cor crua → dourada → queimada, fumaça, chiado). Queimou demais → **fogo** cartunesco,
  apaga com o **extintor** (espuma). Panela vira sopa/cozido (borbulha, transborda se
  encher demais). Forno assa e junta massa: farinha+ovo+leite = bolo, massa+queijo+tomate = pizza.
  Milho na frigideira vira **pipoca** que pula para todo lado.
- **Liquidificador**: jogue frutas, bata → copo de suco/vitamina. Cheio demais = tampa voa
  e suco espirra nas paredes.
- **Prato**: o que estiver em cima vira um prato. O reconhecedor de receitas conhece 26
  receitas com regras tolerantes; qualquer outra coisa ganha um nome engraçado
  ("Gororoba de cenoura queimada").
- **Livro de receitas** que desbloqueia ao descobrir (com dica das que faltam),
  **estrelas** (1–5), **moedas** com limite diário, **comer** (fome) ou **guardar pro
  bichinho** (vai para a despensa do pet).

### Tarefas
- Louça suja depois de comer → jogue na **pia**, segure **LAVAR** (espuma), os pratos
  limpos vão para o **escorredor** empilhados.
- Comida no chão/parede vira sujeira de verdade (a mesma `MessItem` da casa) → ferramenta
  Limpar/aspirar que já existe.
- **Lixeira**: jogue restos; cheia → **TIRAR O LIXO** e levar pra fora.
- **Regar plantas** (com sede uma vez por dia; regar demais faz poça).
- **Arrumar a cama** (fica bagunçada depois de dormir / a cada dia).
- **Roupa**: meias e camisetas sujas aparecem no quarto → **máquina de lavar** (ela
  chacoalha e anda!) → roupa limpa → **guardar** no guarda-roupa.

### Preparar a festa
- **Balões** (flutuam até o teto, dá para jogar), **bandeirinhas** e **luzinhas**
  (penduradas na parede onde você mira), **pôr a mesa** (pratos limpos na mesa),
  **bolo** (do forno), **música** ligada (caixa de som/piano/TV).
- Lista de preparo no topo; **Começar festa** chama o fluxo de festa já existente
  (`src/home3d/party.ts`, amigos-robô / sessão).

### Extras
- **TV** com canais animados (mini tela), **banho** de banheira com bolhas, **selfie** no
  espelho (polaroide), **dormir** (energia), **horta** (plantar → cresce em tempo real →
  colher legumes frescos que valem estrela extra), **necessidades** (fome, higiene,
  energia, diversão) em barrinhas discretas.

### Caos sem quebrar o jogo
- Tudo é pegável/arremessável; comida espirra e vira sujeira (com limite por segundo);
  pilhas caem.
- Limite de corpos físicos por nível de qualidade (`src/core/quality.ts` → `q3For`),
  corpos dormem, migalhas/pedacinhos mais velhos somem primeiro, nada sai da casa.
- Dicas pequenas no topo; botão de ação contextual ("LAVAR", "CORTAR", "LIGAR FOGÃO").
