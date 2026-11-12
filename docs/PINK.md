# Bloop Pink — franquia de beleza (loja + fábrica)

Jogo 3D novo do hub (`src/games/pink/`). Público: crianças/adolescentes, especialmente meninas.
Gênero: **simulador de loja** ("store manager sim": pedir estoque no computador, caixas chegam, abrir e
repor prateleiras, preços, caixa com troco, contratar equipe, expandir, licenças liberam linhas de produto,
nível/XP) + **simulador de centro de distribuição** (bilhetes de pedido, separar, montar caixa, carregar
caminhão, frota, automação). Pesquisa de mecânicas do gênero (só ideias, nada copiado): guias de
Supermarket Simulator (computador da loja desde o início; ordem boa de compras: capacidade de caixa →
fluxo do estoque → 1 licença → área; preço ~10 % acima do mercado; caixa é a 1ª contratação porque
prende o jogador no lugar no pico), e sims de armazém/encomendas (Parcel Simulator, Fulfillment Center,
Hyper Warehouse: tudo manual no começo → equipamentos → esteiras/automação como loop final; esteira
precisa ser fácil de usar).

## Marca (IP)

- Marca **original**: `BRAND_NAME = 'Bloop Pink'` e o logo (`drawBrandLogo`) ficam SÓ em
  `src/games/pink/brand.ts` — trocar o nome lá troca no jogo inteiro (placa, site, caixas, sacolas, abertura).
- Nada imita marca, logo, pessoa, embalagem ou nome de produto reais. Categorias são genéricas
  (perfume/body splash, maquiagem, unhas, skincare, cabelo, suplementos, acessórios, kits presente).
- 128 produtos inventados em `catalog.ts` (nome próprio fictício, nível, custo, preço de mercado,
  sazonalidade e curva de popularidade). Nomes de produto são nomes próprios (não traduzidos, como as
  músicas da Bloop Banda); categorias, telas e falas passam por `t()`.

## Modos (tela de início padrão, 3 espaços salvos por modo)

| modo | estado |
|---|---|
| **Minha Loja** (franquia) | completo — prioridade |
| **Fábrica** (centro de distribuição) | jogável: bilhetes → separar → montar caixa → carregar caminhão → despachar; frota; limpeza; esteira |
| **Mercadinho** | jogável (mesmo motor da loja, catálogo de mercado, frio e energia) — 3 espaços salvos |

Abertura (`intro/cinematic.ts`, `Cine`): toca **em todo save novo** (pulável): Bloop pulando na frente de
uma loja Bloop Pink linda, olha, balão "eu quero ter a minha!"; corte para casa: notebook, site da marca,
toca "Quero ser franqueado!", carimbo + confete, escurece; o jogo começa na frente da loja quebrada.

## Loop principal — Minha Loja

```
manhã ─► tablet: pedir estoque / móveis / reforma / equipe / preços
      ─► caminhão chega nos fundos → caixas com física no estoque
      ─► carregar caixa (1ª pessoa) → abrir na prateleira → repor (cada toque = 1 produto voando pro lugar)
      ─► ABRIR a loja (placa na porta) → clientes Bloop entram, olham, usam provadores, compram
      ─► caixa: passar itens (bip) → cartão (OK) ou dinheiro (montar o troco com notas/moedas)
      ─► sujeira acumula (pegadas, embalagens, vidro quebrado) → esfregão
      ─► fim do dia: resumo (vendas, lucro, XP, metas, nível) → contas (aluguel, salários) → próximo dia
```

Correr carregando caixa pode **tropeçar**: a caixa cai, produtos espalham com física, frascos de vidro
(perfume) quebram e deixam poça rosa + cacos (sujeira forte; cliente reclama "loja suja!").

### Pontuações (0..100) que dirigem os clientes

| pontuação | vem de | efeito |
|---|---|---|
| **Beleza** | paredes consertadas/pintadas, piso, luz, placa, decoração, provadores, vitrine | chance de entrar, fala "que loja linda!"/"que loja feia" |
| **Limpeza** | manchas no chão, cacos, caixas vazias largadas | humor, "loja suja!" |
| **Estoque** | itens procurados que estão na prateleira | "cadê o {produto}?" e venda perdida |
| **Preço** | preço ÷ preço de mercado (1,0 = justo; >1,3 caro) | "muito caro!", desiste; barato = vende rápido mas lucra pouco |
| **Reputação** | média móvel do humor dos clientes atendidos | nº de clientes por dia, encomendas maiores |

Provadores (tester de perfume, espelho de maquiagem, mesa de unhas) aumentam a conversão da categoria
(+25 %/+20 %/+20 %) e a beleza; o cliente vai até lá, borrifa/experimenta (partículas) e decide.

### Economia até o nível 100

- XP: cada venda dá XP = 1 + preço/10; metas diárias +XP; cliente feliz em sequência = **combo** (×1..×3).
- Curva: `xpNeed(n) = round(60 · n^1.55)` → nível 10 ≈ 1 h de jogo, 30 ≈ 6 h, 100 ≈ 60 h.
- Dinheiro inicial 1.800; aluguel 60/dia +8/nível; salários 40–120/dia; margem bruta típica 35–60 %.
- Mercado: preço de mercado = custo × (1,6..2,2) × sazonalidade; o jogador ajusta ±50 % no tablet.
- Sazonalidade: Dia das Mães (dias 20–27 de cada "ano" de 120 dias), Namorados (34–40), Verão (1–15 e
  105–120), Black Friday (88–92: tudo vende 2×, clientes pedem desconto), Natal (95–104: kits presente 3×).
  Cada produto tem `pop` (base 0,4–1,0) e `trend` (curva em sino com pico num dia do ano).

### Desbloqueios (licenças e marcos)

| nível | libera |
|---|---|
| 1 | Perfumaria básica (body splash), batom/gloss, esmaltes; prateleira simples, caixa manual |
| 2 | Pintura de paredes, placa de fachada; contratar **Faxineira** |
| 3 | Mesa expositora, tester de perfume; **Caixa** (funcionária) |
| 5 | Licença Skincare; espelho de maquiagem; piso de madeira |
| 7 | Licença Unhas Pro (kits); mesa de unhas; **Repositora** |
| 9 | Caixa melhor (scanner automático, 2× mais rápido) |
| 10 | **Expansão 1** (abre a parede lateral: +60 % de área) |
| 12 | Licença Cabelo; luminárias pendentes |
| 15 | Licença Perfumes Premium (frascos de vidro caros) |
| 18 | Licença Suplementos (colágeno, vitaminas, whey) |
| 20 | **Autoatendimento** (máquina; não precisa de caixa) |
| 22 | Pedido automático (repõe o que acabou no fim do dia) |
| 25 | **Expansão 2** (mezanino/vitrine) |
| 28 | Licença Acessórios; Licença Kits Presente |
| 30 | **Fábrica** — modo B ganha bônus de produção da loja (no mesmo save não; é outro modo) |
| 35+ | decoração de luxo, letreiro neon, robôs repositores (40), robô faxineiro (45), 2º caixa automático… |
| 50–100 | linhas premium sazonais, "loja-conceito" (paredes de mármore), ranking de franquia, prestígio |

A cada 2–5 minutos o jogador tem algo novo para comprar/melhorar (móvel, cor, funcionário, licença,
upgrade do tablet). Metas diárias (3 por dia), combos de clientes felizes, coleção de produtos vendidos
(álbum no tablet), carimbos de nível e confete são os ganchos principais.

### Tablet (site da franquia)

Abas: **Pedidos** (carrinho de estoque, entrega no caminhão), **Móveis**, **Reforma** (cor das paredes,
piso, placa da fachada, consertos), **Equipe**, **Preços**, **Relatórios** (mais vendidos, faturamento por
dia, tendência da estação), **Coleção**, **Upgrades** do tablet (carrega mais rápido, menos "BO", pedido
expresso). "Deu BO!": de vez em quando o site carrega devagar, cai por um minuto ("servidor fora do ar —
tente de novo") ou entrega o item errado (o jogador ganha um cupom ao reclamar).

### Equipe

| papel | o que faz | nível |
|---|---|---|
| Faxineira | anda até a mancha mais suja e limpa | 2 |
| Caixa | atende o caixa manual mais próximo | 3 |
| Repositora | leva caixas do estoque para as prateleiras vazias | 7 |
| Robô repositor / faxineiro | igual, sem salário, mais rápido | 40 / 45 |

## Fábrica (centro de distribuição)

```
bilhetinho chega (3–6 itens) ─► pegar itens nas estantes (cada toque = 1 item na cesta)
 ─► mesa de embalagem: MONTAR caixa (dobra) → COLOCAR itens → FITA → etiqueta
 ─► carregar a caixa pela rampa traseira do caminhão e soltar dentro (física, empilha)
 ─► caminhão cheio / rota pronta → DESPACHAR → volta depois de N s com o dinheiro
```
Chão sujo/molhado faz escorregar e derrubar o que carrega; frota (mais caminhões, maiores, mais rápidos);
esteira da mesa até a doca (nível 8), embaladora automática (15), robôs separadores (25) → totalmente
automático no nível 100 (o jogador só gerencia).

## Visual / desempenho

- Mundo realista: materiais PBR (`MeshStandardMaterial`) com texturas procedurais em canvas (`tex.ts`:
  porcelanato, madeira, gesso, concreto, tijolo, mármore, papelão, asfalto, calçada), mapa de ambiente
  `RoomEnvironment` (reflexo barato), bordas arredondadas (`RoundedBoxGeometry`, garrafas em torno/lathe),
  sombras de contato pintadas (AO "assado" nas texturas e planos de sombra), luz por níveis de qualidade.
- Personagens: Bloops de papel (`src/3d/paper`): o jogador na 3ª pessoa e clientes com cores aleatórias.
- 60 fps em tablet velho: produtos em `InstancedMesh` (um por forma), geometria estática mesclada,
  sombras só no nível Alto, DPR por nível (`detectInitialTier`).

## Controles / HUD

1ª pessoa por padrão; botão de câmera no topo (1ª → 3ª atrás → 3ª de frente, `CamView`); andar do fpkit
(preset cozinha, com corrida). HUD estilo Minecraft mobile: barra de itens no meio embaixo (mãos, esfregão,
caixa carregada), joystick à esquerda, botões à direita (USAR contextual, CORRER, SOLTAR), topo: pausa,
dinheiro, dia/relógio, nível, câmera, tablet. Nada embaixo de `var(--safe-bot)`.

## Arquivos

| arquivo | o quê |
|---|---|
| `register.ts` | registro no hub + vitrine 2D |
| `brand.ts` | NOME e LOGO da marca (um lugar só) |
| `catalog.ts` | 128 produtos, categorias, estações, popularidade |
| `data.ts` | móveis, cores, pisos, placas, equipe, licenças, níveis, metas |
| `save.ts` | 3 espaços por modo em `localStorage['bw-pink']` (nomes em `bw-slotnames`) |
| `tex.ts`, `mats.ts`, `shapes.ts` | texturas procedurais, materiais, geometrias (garrafas, caixas arredondadas) |
| `store3d.ts` | prédio, rua, fachada, estado quebrado → reformado |
| `furniture.ts` | móveis 3D e "vagas" de produto |
| `products.ts` | produtos instanciados nas prateleiras |
| `phys.ts` | física (cannon-es) de caixas e produtos soltos |
| `npc.ts` | clientes e equipe (andar em grade, falas) |
| `shop.ts` | modo Minha Loja |
| `factory.ts` | modo Fábrica |
| `tablet.ts`, `checkout.ts`, `hud.ts` | interfaces |
| `audio.ts` | pacote de sons + música da loja |
| `intro/cinematic.ts` | abertura |
| `coop.ts` | Minha Loja em grupo: jogadores remotos, clientes/equipe/caixas vistos pelo convidado, protocolo |
| `grow.ts` | etapas da loja (garagem → salão), preços, aluguel, comprar o prédio, migração de saves |
| `money.ts` | gaveta do caixa em centavos (notas/moedas contadas), troco (DP), malote, kit de troco, risco de assalto, níveis de segurança |
| `security.ts` | furto (ladrão), segurança (funcionário), assalto + minigames, arrombamento noturno |
| `office.ts` | escritório (tela de finanças + pedidos), financeiro (alertas), gestor de estoque |
| `testers.ts` | minigames dos provadores: perfume (famílias de cheiro) e unhas (pintar) |
| `home.ts` | apartamento do dono: escada, corredor, quarto, banho (minigame), louça, cama, lixo |
| `reviews.ts` | avaliações estilo perfil de empresa (semanal) + foto da fachada renderizada |
| `power.ts` | energia do Mercadinho: quedas de luz, no-break, gerador, carnes estragando |
| `boxgame.ts` | Fábrica: minigames de montar caixa (abas) e fechar com fita + etiqueta |

## Nomes dos saves

Cada um dos 3 espaços (por modo) pode ganhar um nome: lápis amarelo no espaço selecionado da tela de início
(ao lado da lixeira) → folha "Qual o nome?" com campo (até 18 letras, teclado do aparelho) e 8 sugestões com
ícone ("Minha Loja Linda", "Loja da Princesa"… / "Fábrica Turbo"…). Genérico em `src/ui/startmenu`
(`SmSlotsOpts.rename/key/nameIdeas`, `smSlotName()`), guardado em `localStorage['bw-slotnames']`
(`pink|shop|0`, `pink|factory|2`…); some quando o espaço é apagado ou vira save novo. Aparece no rótulo, no
"Apagar …?", no JOGAR da sala e na pausa. Vale para todo jogo com `p.slots(...)` (Jangada, Garimpo, Mundo…).

## Minha Loja em grupo (até 4 Bloops)

- Menu: **Com amigos** (`p.friends({ game: 'pink' })`) cria a sala e abre "Chamar amigos"; "Entrar com código /
  QR" é um link pequeno. Quem abre uma sala avisa os amigos (`reportPlaying`) → "Fulano está jogando — ENTRAR".
- **Grupo** (`registerPartyGame('pink', { mode: 'room' })`): o líder cria a sala com o código do grupo; os outros
  entram nela (tentam de novo até 25 s enquanto o líder abre).
- **Sala** (tela de início): "Na loja (n/4)", Bloops com cor, ♛ coroa no dono, "Vaga livre". O líder escolhe qual
  das **3 lojas dele** abrir (o save do líder manda) e toca **Abrir a loja**; os outros veem "Esperando Fulano
  abrir a loja…" e entram sozinhos. Quem chega com a loja já aberta entra direto. No jogo: chip roxo com o
  número de Bloops no topo e o nome (com ♛) em cima de cada amigo.
- Servidor: o mesmo relé da Jangada (`server/raft.ts`, DO `RaftRoom`), rota `/api/pink/room/<CÓDIGO>` com salas
  à parte (`idFromName('pink:room:<CÓDIGO>')`) — sem classe nova nem migração.
- **Anfitrião** (dono) simula tudo e manda: posição (10/s), `st` 5/s (dinheiro, XP, nível, dia, hora, fase,
  clientes e equipe), sujeira 1/s, `fu` móveis + estoque das vagas quando mudam (em pedaços de 10), `mt`
  reforma/licenças/equipe/preços/metas quando mudam, `bx` caixas soltas 2/s (só desenho no convidado).
- **Convidado**: anda pela loja (Bloop de papel + nome), vê clientes/equipe/caixas/estoque; o dinheiro é um só.
  Pode usar o **tablet** (pedidos, móveis, reforma, equipe, licenças, upgrade, preços, pedido automático),
  **colocar e mover móveis** (fantasma local → o dono coloca e paga), **esfregar** sujeira e **abrir/fechar** a loja.
  Moedas do app no fim de cada dia para todos. A pausa não para a loja em grupo.
- Dono → "Sala" na pausa: salva e volta para a sala (os amigos esperam lá); dono sai → os amigos voltam ao menu.

Falta no grupo: convidado ainda não **carrega caixas/repõe prateleiras**, não **atende o caixa** e não pega lixo
(caixas e clientes são só a vista do dono; precisaria de pedidos `pegar/soltar/repor/atender` com dono de cada
caixa); balões de fala dos clientes e o resumo completo do dia só aparecem para o dono; a **Fábrica** ainda é solo.

## Fase 3 (wip/pink3) — pedidos do dono (docs/PINK-DONO.md)

Princípio: **recompensa com peso** — tudo custa esforço (comprar a sala não abre: tem que quebrar a parede; o
dinheiro vivo tem que ir ao banco; a casa tem que ser cuidada). Tela limpa: só faixas curtas (2–3 s) e a dica da mira.

### Crescer do pequeno (`grow.ts`, `store3d.ts`)
| etapa | área | como abre | aluguel base |
|---|---|---|---|
| 0 Garagem | x −2,5..2,5 · z −6..0 (portão de enrolar inteiro na frente; caminhão encosta na rua e joga as caixas na calçada) | início | 20 |
| 1 Sala dos fundos | z até −12 | ★3 · B$ 1.400 · parede z=−6 (8 marretadas) | 40 |
| 2 Sala da esquerda | x até −5 (vitrines e porta de vidro aparecem na fachada) | ★5 · B$ 3.200 · parede x=−2,5 | 65 |
| 3 Sala da direita | x até 5 | ★7 · B$ 5.200 · parede x=2,5 | 90 |
| 4 Estoque com doca | estoque z −16..−12, caminhão passa a usar o beco | ★9 · B$ 7.500 · vão da divisória | 120 |
| 5 Ampliação lateral | x até 9 | ★12 · B$ 14.000 · parede x=5 | 170 |
| 6 Salão gigante | x −9..9 | ★20 · B$ 28.000 · parede x=−5 | 240 |

Aluguel/dia = base + 3×nível. **Comprar o prédio** (★15, B$ 250.000): aluguel zero e as próximas salas de graça
(só quebrar). Comprou a sala → marreta no 3º espaço da barra; cada golpe racha mais a parede (canvas de rachaduras,
lascas e poeira); na última a parede cai (estrondo, confete) e sobra **entulho** + sujeira para levar à lixeira
(a lixeira fica no canto livre do fundo até existir estoque). Onde havia parede ficam viga e coluna. Salas que não são
da loja aparecem na rua com porta de aço + "aluga-se". Saves antigos: `exp` 0/1/2 → etapa 4/5/6.

### Caixa e dinheiro (`money.ts`, `checkout.ts`)
- Gaveta de verdade em centavos: 100, 50, 20, 10, 5, 2 (notas) · 1, 0,50, 0,25, 0,10 (moedas), com contagem.
  Loja nova começa com um fundo de troco. Pagamento: dinheiro 42 %, cartão 36 %, Pix 22 %.
- Dinheiro: a nota do cliente entra na gaveta; você toca nas peças e elas **voam e empilham no balcão** (moedas em torre,
  notas em leque); `Entregar` quando bate. Se a gaveta não consegue formar o troco aparece **"Sem troco! Tem trocado?"**
  (metade das vezes o cliente paga certinho, senão passa no cartão/Pix). Cartão: maquininha "aproxime"; Pix: QR.
- **Cartão/Pix vão para a conta (banco); dinheiro vivo fica no caixa** (chip do dinheiro mostra conta | caixa).
- **Fechar o caixa** (mirar no caixa sem fila): notas ≥ 10 vão num **malote** (fica um fundo de troco) → atravessar a rua
  até o **Banco Bloop** (prédio com colunas em frente) → Depositar. No banco também **Pegar troco** (kit de moedas e notas
  pequenas que se guarda na gaveta tocando no caixa).
- **Plaquinha ABERTO/FECHADO** na porta (ou num pedestal na garagem): mirar e virar abre/fecha a loja (o botão do topo segue).
  Às 20h a loja pode **ficar aberta até as 23h** (menos clientes, mais risco).

### Segurança (`security.ts`)
- **Furto**: a partir do dia 2, ~9 % dos clientes (menos com câmeras) são ladrões (gorro, sorrisinho, olhar desconfiado):
  pegam o produto, olham para os lados, escondem e saem **reto pelo meio da loja até a porta**. O **segurança**
  (uniforme azul-marinho, quepe, óculos escuros) barra a 2 m ("Opa!") a não ser que esteja distraído assobiando (♪).
  O jogador barra mirando no ladrão (botão "Barrar"). Barrado = produto volta numa caixinha; escapou = prejuízo.
- **Assalto**: risco = dinheiro no caixa + loja aberta até tarde, reduzido por segurança (nível) e por seguranças;
  nunca nos 3 primeiros dias. O assaltante (máscara) vai ao caixa → minigame **alarme escondido** (aperte quando ele
  não olha, 3×) ou **borrifar perfume** (14 toques em 5 s). Perdeu = leva as notas do caixa. De noite, caixa cheio pode ser
  **arrombado**. Níveis 0–10 (tablet → Upgrades): câmeras visíveis no teto (1+, 3+), alarme automático (5+), carro-forte
  leva o dinheiro ao banco toda noite (8+).

### Equipe (`data.ts STAFF`, `office.ts`)
Contrata quantos quiser; todos chegam **pela calçada e entram pela porta**. Funções: faxineira, caixa, repositora,
**segurança**, **financeiro** (senta no escritório, a cada ~1 min dá um alerta curto: compre X, dinheiro demais no caixa,
loja suja, preço alto, prejuízo, instale câmeras), **gestor de estoque** (leva caixas largadas para os fundos e pede de
manhã o que está acabando), robôs.

### Áreas e decoração
Novos móveis: **escritório** (mesa + computador: tela de Finanças com conta, caixa, vendas, lucro 7 dias, aluguel,
salários, furtos, gráfico e dicas, botão Pedidos), **porta-pallet**, **cofre**, **sofá**, **quadro**; móveis de
escritório/estoque podem ir **no estoque** (fundos). Paredes (10 cores), pisos (5), móveis livres em grade de 25 cm.

### Provadores (`testers.ts`)
- Perfume: 4 frascos (os perfumes/body splash que a loja vende); borrifar na fitinha revela a família (florido, frutado,
  docinho, fresquinho). Cliente que pede ajuda ("Quero um cheiro… 🍎") → entregue a fitinha certa → ama e leva o produto.
  Sem ajuda, a cliente borrifa dois: "esse não…" e depois "que cheiro bom!".
- Unhas: mão com 5 unhas, 8 esmaltes; pintar da cor pedida → ela leva o esmalte mais parecido.

### Vida do dono (`home.ts`)
Prédio de apartamentos ao lado (portaria nº 42, x≈10,6). Entrar → corredor do 2º andar (portas dos vizinhos, lixeira do
prédio, escada) → apartamento: cama, banheiro com chuveiro, pia com louça, guarda-roupa, janela. O fim do dia agora tem
**Ir pra casa** (anda até a cama: **Dormir** encerra o dia) ou **Dormir já**; acorda no quarto, com louça do jantar, cama
desarrumada e lixinho do dia. **Banho** = minigame (esfregar até a espuma, segurar para enxaguar). Sem banho o cheirinho
cai durante o expediente; abaixo de 35 % os clientes perto reclamam **"Tá fedendo!"** (humor −10, avaliações citam).

### Avaliações (`reviews.ts`, tablet → Avaliações)
Perfil de empresa: foto = **fachada atual renderizada** (muda quando a frente muda), nome do save, nota média com
estrelas, distribuição 5→1, categoria/horário e lista com carinha (cores do cliente), nome, "há N dias" e comentário que
vem do que o cliente viveu (linda, ajudou no provador, barato, rápido / suja, cara, fila, cadê, fedendo, feia). ~35 % dos
clientes deixam nota; as pendentes são publicadas **uma vez por semana** (faixa "N novas avaliações! Nota 4,3").

### Mercadinho (`catalog.ts G_ROWS`, `power.ts`)
Modo liberado na tela de início com 3 espaços (lápis/nomes `pink|grocery|i`, ideias "Mercadinho da Vila"…). Mesmo motor
da loja com `useCatalog('grocery')` (troca PRODUCTS/CATS/PROD/CAT no lugar) e marca verde "Bloop Mercadinho".
44 produtos com nomes originais em 8 categorias (frutas, verduras, mercearia, bebidas, laticínios ★2, padaria ★4,
açougue ★5, limpeza ★8) e 8 formas novas (fruta, legume, bandeja de carne, caixa de leite, garrafa, saco, lata, pão).
Móveis: banca de hortifruti, geladeira de porta de vidro (frio 1), freezer horizontal e balcão do açougue (frio 2).
Laticínio só em móvel frio; carne só em freezer/açougue. **Energia**: a partir do dia 2, 35 %/dia de queda de luz
(1–2,7 h do jogo): apaga luzes e geladeiras; > 1 h sem frio → carnes e laticínios estragam (somem, viram saco de lixo +
poça, prejuízo). Upgrades: **no-break** (★4, segura 45 min) e **gerador** (★8, liga sozinho).

### Fábrica (`factory.ts`, `boxgame.ts`)
Galpão cresce para a esquerda em 3 etapas (x0 = −3 / −6,5 / −10; ★4 B$ 3.500, ★9 B$ 9.000) quebrando a parede com a
marreta; galpão pequeno = poucas estantes = poucos produtos nos pedidos. Estoque das estantes **acaba** (10 por produto,
os produtos somem das prateleiras) → painel do topo: "Fornecedor: completar estoque". Mesa de embalagem com minigames:
**montar** (tocar nas 4 abas) e **fita** (arrastar o dedo pela linha, depois colar a etiqueta); a embaladora automática
pula os minigames. Pedidos chegam "pelo site" (bloop.pink #n). Saves antigos: galpão inteiro.

### Grupo
Novos estados vão para o convidado no `mt` (reforma/etapas/marretadas, segurança) e no `st` (total do caixa `tl`,
assaltante como fantasma `r0`); o convidado pode dar marretadas (`act hit`) e comprar segurança (`act sec`).
Minigames (provadores com cliente, assalto), banco e casa são do dono (convidado anda e vê).

## Estado (entrega wip/pink)

Feito:
- **Minha Loja** completa: rua + prédio quebrado → reforma por partes (paredes/teto/toldo, vitrines, porta, 10 cores,
  5 pisos, 5 placas, 4 iluminações, 2 expansões), 19 móveis/decoração/provadores colocados em grade com fantasma
  verde/vermelho (girar, mover), tablet-site com 9 abas (pedidos, móveis, reforma, equipe, preços, relatórios com
  gráfico e tendência de estação, licenças, coleção, upgrades) e "deu BO" (lento, servidor fora do ar, produto
  errado → cupom), caminhão nos fundos com porta de enrolar e caixas com física, carregar/abrir/repor (cada toque um
  produto voando para a vaga, segurar repete), tirar produto, devolver soltos, lixeira de caixas, sacos de lixo do
  início, tropeçar correndo com caixa (produtos voam, vidro quebra → cacos + poça), sujeira por pegadas, esfregão,
  clientes Bloop (desejos por procura/estação, provadores, preço vs mercado, fila, paciência, falas com ícone),
  caixa manual (bip, cartão, troco com notas/moedas), caixa com leitor, autoatendimento, equipe (faxineira, caixa,
  repositora, robôs), dia 8h–20h, resumo do dia, aluguel/salários, metas diárias, combo, XP/níveis até 100,
  licenças, coleção, tutorial em 6 passos, moedas do app por dia, 3 saves.
- **Fábrica** jogável: bilhetes, cesta, mesa de embalagem (montar → colocar → fita), caixa pronta com física,
  rampa e baú do caminhão (sobe andando, empilha), despachar e receber, frota (3), esteira, 2ª doca, embaladora,
  robô separador, carregador automático; chão sujo faz escorregar e derrubar.
- Abertura de cinema em todo save novo (pulável; não toca em navegador automatizado sem `?intro=1`).
- Sons e música próprios (`audio.ts`), 11 idiomas, rota no QA de HUD, `?debug` → `window.__pink` / `__pinkF` /
  `__pinkGame` (inclui `sim(seg)` para testes em GPU por software).

Falta / próximos passos:
- Grupo: ver "Falta no grupo" acima (convidado repor/atender o caixa; Fábrica em grupo).
- Fábrica: sem resumo de dia/metas próprias; produtos das estantes são estoque infinito (sem pedido ao fornecedor);
  robôs não desviam de tudo; esteira é reta.
- Loja: expansões abrem a área mas a parte nova ainda usa a mesma iluminação; repositora não abre caixas fechadas
  visualmente (pega a caixa e repõe); clientes não carregam sacolinha visível.
- Medir FPS em tablet real (no Playwright com GPU por software fica ~6 fps; o nível de qualidade baixa DPR,
  antialias, sombras e luzes pontuais).
