# Cozinha Maluca (`cozinha`)

Cozinha cooperativa e caótica, para até 5 jogadores (amigos online + ajudantes robôs), que também é um **tycoon infinito**. Cada turno é um "dia". O caixa compra melhorias, receitas e ajudantes. A cozinha cresce e os dias ficam cada vez mais difíceis, sem fim.

Código: `src/games/cozinha/` (registro leve em `register.ts` → `registerCozinha()`; o jogo é um chunk sob demanda; o 3D (three + cannon-es) é outro chunk, `render3d.ts`).

## Como se joga
- Joystick (metade esquerda da tela), botão **Pegar/Soltar** (tocar) e botão grande de **Ação** (segurar: picar, lavar, apagar fogo). A mira automática escolhe a bancada mais próxima na direção do boneco.
- Pedidos chegam como tickets com tempo. Cada ticket mostra os ingredientes e, embaixo, o símbolo do preparo (faca, panela, frigideira, forno, liquidificador).
- Pegue o ingrediente na caixa, prepare (tábua, panela, frigideira, forno, liquidificador), monte no prato e entregue no balcão. Os pratos voltam sujos para lavar na pia.
- Comida passa do ponto e queima (aparece um "!" piscando). Se ficar mais tempo, pega fogo e o fogo se espalha. Use o extintor: segure Ação mirando o fogo. Tudo é cartunesco: não há dano, só bagunça.
- Prato errado volta (cai no chão na frente do balcão). Coisas podem cair no chão e ser pegas de novo.

## Conteúdo
- **44 receitas** em 8 livros (pacotes): Primeiro dia, Lanchonete, Brasileirinho (pão de queijo, tapioca, pastel, feijão com arroz, prato feito, aipim, milho), Pizzaria, Doceria (brigadeiro, bolos, açaí na tigela, salada de frutas), Bar de vitaminas, Rolinhos e Oriente, Sopas e Tacos. Cada receita é dado puro em `data.ts` (ingredientes com rota de preparo, estação, tempo e preço calculado).
- 38 ingredientes, alguns com duas rotas (ex.: morango picado ou batido).
- Temas de cozinha: restaurante, barco (balança e itens escorregam), estação espacial (pouco atrito), food truck (corredor estreito). Eventos: hora do rush, crítico VIP (paga em dobro, menos paciência), apagão (fogões param).
- Melhorias: fogões turbo, facas afiadas, cozinha maior (mais bancadas e estações), salão maior (mais mesas, pedidos e gorjeta), lava-louças, esteira, chuveirinho anti-fogo, tênis de corrida, decoração (5 paletas).
- Ajudantes (bots) com papéis: cozinheiro (faz o pedido inteiro), picador, lavador (também apaga fogo), garçom (tira comida do fogo e leva pratos prontos). O primeiro é grátis. Recebem salário por turno. São prestativos mas imperfeitos: reagem com atraso, andam um pouco mais devagar, às vezes derrubam algo ou se distraem.

## Online (até 5)
`net.ts` usa a presença (`joinPresence('cozinha-<código>')`). O humano com o menor número aleatório `h` é o host. O host simula tudo e manda, em ~5/s, um registro numérico com a configuração do dia, os pedidos, as estações, os bots e o que cada humano segura. Os clientes só movem o próprio boneco e mandam posição, contador de "pegar" e "ação". Se não houver humanos, os bots locais completam a equipe.

## Gráficos
- Tela de entrada com dois cartões: **2D** (Canvas, vista de cima 3/4, camada estática em cache, partículas em pool fixo) e **3D** (three.js: cozinha modelada, personagens em billboard do `drawPlayer` com chapéu de chef, itens como sprites, itens derrubados com física cannon-es, luz de fogo, sombras no nível Alto). A qualidade segue o mesmo esquema da casa 3D (`q3For`). Sem WebGL, o jogo avisa e abre em 2D.
- Fontes de canvas com `gameFont()`, ícones próprios em `icons.ts` (estilo de `src/ui/icons.ts`).

## Recompensas e save
- Moedas do app: `addCoins(max(3, caixa/8 + 5 por estrela))` e `reportRun({ game: 'cozinha', score, coins, won, stats: { dishes, days, stars, fires } })`. Vídeo recompensado dobra as moedas.
- Progresso em `localStorage['bw-cozinha']` (dia, caixa, melhorias, pacotes, ajudantes, recordes). O dia sempre avança, mesmo sem estrelas.

## Curva de dificuldade (sem melhorias)
Fonte: `dayParams()` em `data.ts`. Depois do dia 30 a pressão continua subindo devagar (fator `1/(1+0,02*(dia-30))` na paciência e no intervalo), as metas crescem e os preços também, então nunca acaba.

| Dia | Turno (s) | Pedido a cada (s) | Pedidos simultâneos | Paciência base (s) | Cardápio | Grade | Metas 1/2/3 estrelas | Preço x | Chance de evento |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 123 | 20.4 | 2 | 76 (+14/ingrediente) | 2 | 9x7 | 45 / 72 / 103 | 1.00 | 0% |
| 2 | 126 | 19.1 | 2 | 73 (+14/ingrediente) | 3 | 9x7 | 60 / 96 / 138 | 1.04 | 0% |
| 3 | 129 | 17.9 | 2 | 70 (+14/ingrediente) | 3 | 9x7 | 75 / 120 / 173 | 1.08 | 29% |
| 5 | 135 | 16.0 | 3 | 65 (+14/ingrediente) | 4 | 9x7 | 105 / 168 / 241 | 1.16 | 35% |
| 8 | 144 | 13.7 | 4 | 59 (+14/ingrediente) | 5 | 10x7 | 150 / 240 / 345 | 1.28 | 44% |
| 10 | 150 | 12.5 | 4 | 56 (+14/ingrediente) | 5 | 10x7 | 180 / 288 / 414 | 1.36 | 50% |
| 15 | 165 | 10.0 | 5 | 50 (+14/ingrediente) | 7 | 11x8 | 255 / 408 / 587 | 1.56 | 65% |
| 20 | 180 | 8.1 | 7 | 45 (+14/ingrediente) | 8 | 11x8 | 330 / 528 / 759 | 1.76 | 80% |
| 30 | 180 | 5.2 | 8 | 38 (+14/ingrediente) | 8 | 13x9 | 480 / 768 / 1104 | 2.16 | 85% |
| 40 | 180 | 4.5 | 8 | 27 (+14/ingrediente) | 8 | 14x10 | 756 / 1210 / 1739 | 2.56 | 85% |
| 60 | 180 | 4.5 | 8 | 21 (+14/ingrediente) | 8 | 16x11 | 1488 / 2381 / 3422 | 3.36 | 85% |
| 100 | 180 | 4.5 | 8 | 21 (+14/ingrediente) | 8 | 16x11 | 3672 / 5875 / 8446 | 4.96 | 85% |


Cada pedido ganha +14 s de paciência por ingrediente. A grade vira "em pé" (colunas e linhas trocadas) quando o celular está na vertical. O salão maior soma +1 pedido simultâneo por nível.

### Teste automático (só bots, 4 ajudantes, sem melhorias)
`npx esbuild scripts/dev/cozinha-autoplay.ts --bundle --platform=node --format=esm --outfile=/tmp/cz.mjs && node /tmp/cz.mjs 1,3,8,15,30,60 4`

```
day 1: 9x7 menu=[hamburguer,paoQueijo] served=9 missed=0 cash=245 goal=45/72/103 stars=3 burnt=0 fires=0 floor=0 theme=classic ev=none
day 3: 9x7 menu=[limonada,batataFrita,xBurguer] served=9 missed=0 cash=388 goal=75/120/173 stars=3 burnt=0 fires=0 floor=0 theme=classic ev=none
day 8: 10x7 menu=[pizzaCalabresa,pizzaQueijo,boloChocolate,brigadeiro,macarraoLegumes] served=9 missed=0 cash=443 goal=150/240/345 stars=3 burnt=0 fires=0 floor=0 theme=classic ev=outage
day 15: 11x8 menu=[taco,espetinho,frangoPimentao,arrozCamarao,sopaLegumes,sopaAbobora,omelete] served=8 missed=1 cash=522 goal=255/408/587 stars=2 burnt=0 fires=0 floor=0 theme=boat ev=critic
day 30: 13x9 menu=[sopaLegumes,taco,omelete,arrozCamarao,rolinhoPepino,sopaAbobora,espetinho,frangoPimentao] served=8 missed=8 cash=661 goal=480/768/1104 stars=1 burnt=0 fires=0 floor=0 theme=boat ev=outage
day 60: 16x11 menu=[omelete,sopaLegumes,taco,espetinho,rolinhoPepino,sopaAbobora,arrozCamarao,acaiBatido] served=4 missed=18 cash=494 goal=1488/2381/3422 stars=0 burnt=0 fires=0 floor=1 theme=boat ev=outage
```

## Depuração
`scripts/dev/cozinha.html?czmode=2d|3d&czday=N&czbots=0..5&czauto` (o jogador local também vira bot), `&czfire` (incêndio forçado), `&czev=rush|critic|outage`, `&cztheme=boat|space|truck`, `&czlen=40` (turno curto), `&czscreen=shop|lobby&czrich`.
