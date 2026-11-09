# Bloop Orbit — Textos da Play Store e produtos no app

Criado por **TEAM Ross**. Tudo em português do Brasil.

## Ficha da loja (Play Console → Presença na loja → Ficha principal)

**Nome do app** (até 30 caracteres)

```
Bloop Orbit: Pulo Espacial
```

**Descrição curta** (até 80 caracteres)

```
Um toque para pular de planeta em planeta! Jogo espacial da TEAM Ross.
```

**Descrição completa** (até 4000 caracteres)

```
Bloop Orbit é um jogo de um toque só: pule de planeta em planeta, pegue moedas, faça pousos PERFEITOS e não se perca no espaço! Criado por TEAM Ross.

COMO JOGAR
Toque para pular. Mire no próximo planeta e acerte o tempo: quanto mais perto do centro, mais pontos. Cuidado com os asteroides que giram em volta dos planetas — pule antes que eles cheguem em você! Um pouso PERFEITO destrói os asteroides do planeta.

POR QUE VOCÊ VAI GOSTAR
- Partidas rápidas, perfeitas para qualquer hora
- 5 galáxias que mudam o cenário, com planetas de gelo, lava, gás tóxico e muito mais
- A velocidade aumenta: até onde você chega?
- Dezenas de personagens e rastros para colecionar, do comum ao MÍTICO
- Melhorias permanentes: Ímã, Escudo e Valor da moeda
- Turbos para começar com tudo: Escudo, Ímã e Largada Turbo
- Presente diário, missões do dia e caixa de correio com presentes de eventos
- Códigos de desafio com itens exclusivos que só os melhores têm
- Música e efeitos que acompanham o ritmo da partida
- Leve, roda liso até em celular simples (tem modo economia)

Desafie seus amigos e mostre quem manda no espaço!

Um jogo da TEAM Ross. Feito com carinho no Brasil.

O jogo é gratuito e contém anúncios e compras opcionais no app.
```

**Categoria:** Jogos → Casual · **Tags sugeridas:** casual, arcade, um toque, espaço, offline.

**Classificação:** Livre (sem violência). Declarar: contém anúncios; compras no app.

**Desenvolvedor / nome exibido:** TEAM Ross

## Produtos no app (Play Console → Monetizar → Produtos → Produtos no app)

Os IDs precisam ser **exatamente** estes (os mesmos de `PRODUCTS` em `src/config.ts`).
"Consumível" = o jogo consome a compra e o jogador pode comprar de novo. "Não consumível" = item permanente (volta ao reinstalar com "Restaurar compras").
O app mostra o preço real cadastrado na Play Store; a coluna "Preço sugerido" é só referência (e o valor exibido se a loja não responder).

| ID do produto | Nome na loja | Tipo | Preço sugerido | O que entrega |
|---|---|---|---|---|
| `starter_pack` | Pacote Inicial | Não consumível | R$ 9,90 | Sem anúncios + 300 gemas + 3.000 moedas + skin lendária Galáxia |
| `remove_ads` | Sem Anúncios | Não consumível | R$ 14,90 | Remove banners e intersticiais para sempre (vídeos premiados continuam opcionais) |
| `gems_small` | 100 Gemas | Consumível | R$ 4,90 | 100 gemas |
| `gems_medium` | 550 Gemas | Consumível | R$ 19,90 | 550 gemas |
| `gems_large` | 1.200 Gemas | Consumível | R$ 39,90 | 1.200 gemas |
| `gems_mega` | 3.000 Gemas | Consumível | R$ 89,90 | 3.000 gemas |
| `skin_phoenix` | Skin Fênix (mítica) | Não consumível | R$ 12,90 | Skin mítica Fênix |
| `skin_lava_golem` | Skin Golem de Lava (mítica) | Não consumível | R$ 12,90 | Skin mítica Golem de Lava |
| `trail_neon` | Rastro Fita Neon (mítico) | Não consumível | R$ 7,90 | Rastro mítico Fita Neon |
| `coin_doubler` | Dobrador de Moedas | Não consumível | R$ 14,90 | 2x moedas em todas as partidas, para sempre |
| `boost_bundle` | Kit Turbo | Consumível | R$ 6,90 | 5 Escudos + 5 Ímãs + 5 Largadas Turbo |
| `vip_pack` | Pacote VIP | Não consumível | R$ 39,90 | Sem anúncios + Dobrador de Moedas + 1.000 gemas + skin lendária Rei Dourado |
| `mega_bundle` | Mega Pacote | Consumível | R$ 59,90 | 2.500 gemas + 25.000 moedas + 10 de cada turbo |
| `flash_gems` | Oferta Relâmpago | Consumível | R$ 9,90 | 650 gemas + bônus do dia (moedas ou turbos; gira todo dia, ver `FLASH_BONUSES`) |

Descrição sugerida para cada produto na Play Console: copie a coluna "O que entrega" e termine com "— Bloop Orbit, da TEAM Ross."

### Observações

- Todos são do tipo **produto no app** (não assinatura).
- A Oferta Relâmpago tem preço fixo; o jogo mostra um contador até a meia-noite e um bônus que muda por dia. Pode ser comprada uma vez por dia (a UI esconde o botão depois da compra).
- Depois de uma compra o jogo não mostra intersticial por 15 minutos; quem tem "Sem Anúncios" (ou Pacote Inicial / VIP) nunca vê intersticial nem banner.
- Skins de **evento** (Sombra, Campeão) não são vendidas: saem só por código de desafio ou presente do painel admin (veja `docs/PAINEL-ADMIN.md`).

## Texto de compartilhar (no jogo)

"Fiz N pontos no Bloop Orbit! Duvido você passar! (Criado por TEAM Ross)" + link da Play Store.
