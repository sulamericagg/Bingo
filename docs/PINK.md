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
- 132 produtos inventados em `catalog.ts` (nome próprio fictício, nível, custo, preço de mercado,
  sazonalidade e curva de popularidade). Nomes de produto são nomes próprios (não traduzidos, como as
  músicas da Bloop Banda); categorias, telas e falas passam por `t()`.

## Modos (tela de início padrão, 3 espaços salvos por modo)

| modo | estado |
|---|---|
| **Minha Loja** (franquia) | completo — prioridade |
| **Fábrica** (centro de distribuição) | jogável: bilhetes → separar → montar caixa → carregar caminhão → despachar; frota; limpeza; esteira |
| **Mercadinho** | cartão "em breve" (mesmo motor: catálogo/tablet/carregar/limpeza/equipe) |

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
| `catalog.ts` | 132 produtos, categorias, estações, popularidade |
| `data.ts` | móveis, cores, pisos, placas, equipe, licenças, níveis, metas |
| `save.ts` | 3 espaços por modo em `localStorage['bw-pink']` |
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

## Falta / próximos passos

Ver o fim deste arquivo (atualizado a cada entrega).
