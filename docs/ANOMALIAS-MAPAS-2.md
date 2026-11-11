# Anomalias & Cia — mapas "Lanchonete" e "Posto 24h"

Dois mapas do jogo de turno da noite (`src/games/anomalias/`), feitos estritamente sobre o
contrato `src/games/anomalias/maps/types.ts` (MapDef / MapBuild / AnomalySlot / RoomDef /
InteractDef / npcSpots). Nenhuma lógica de jogo aqui: o núcleo sorteia anomalias, roda as
tarefas, põe/anima os NPCs, a foto, o monstro e o HUD.

| id | nome | ícone | módulo |
|---|---|---|---|
| `fastfood` | Lanchonete | 🍔 | `src/games/anomalias/maps/fastfood/index.ts` (export default) |
| `posto24h` | Posto 24h | ⛽ | `src/games/anomalias/maps/posto24h/index.ts` (export default) |

Marcas, cardápio, mascote e criaturas são **inventados** ("Bloop Lanches", "Burgo", "Bloop Gás",
"Bloop Saque", "Sombrito"). Nada de marca real.

## Arquivos

```
src/games/anomalias/maps/
  kit2/                 kit compartilhado pelos dois mapas
    ctx.ts              MapCtx: camadas mescladas por sala×material, luz assada, paredes com furos,
                        colisores, salas/câmeras, ajudantes de anomalia (A.*, addSlot, anim, buzz),
                        luz por sala (energia/anomalia), corte por sala, porta automática
    tex.ts              texturas em canvas (xadrez, lajota, pastilha, reboco, forro, carpete, asfalto,
                        concreto, emborrachado, madeira, inox, vidro, céu noturno) + ícones de comida
    chars.ts            Bloop cliente (malha única, 6 rostos) e o Sombrito (criaturinha de bocão)
    props.ts            materiais-padrão, luminárias, sombras de contato, halos, Bloop/Sombrito
                        posicionados, carros, postes, câmera de segurança, planta, lixeira
    food.ts             hambúrguer, batata, copo, bandeja, bisnaga, mascote Burgo
    slots.ts            fábricas de anomalia: cliente Bloop, luz da sala, criaturas, variações de cor, movimento
    outdoor.ts          céu + estrelas (pontos), árvores/capim do módulo src/3d/nature (vento), espalhar pontos
  fastfood/             index (salas, câmeras, vistas, NPCs) · shell (prédio) · furniture · outside · tasks · anomalies · art
  posto24h/             index · shell · outside · store · tasks · anomalies · art
scripts/dev/anomalias-map2.html/.ts   visualizador (ver abaixo)
scripts/dev/shoot-anomap2.mjs         screenshots / pares de anomalia / FPS (Playwright)
```

## Como o cenário é montado (desempenho)

* **Camadas mescladas**: cada sala tem uma malha por material (`vc`, `wall`, `checker`, `glow`…),
  montadas com o `GeoBuilder` (caixas com bisel, torno, tubos) e mescladas no `finish()`.
  Sombras de contato e vidros de todo o mapa ficam numa camada global (1 chamada cada).
* **Luz assada nos vértices**: luminárias são pontos de luz (cor, intensidade, alcance, "só para
  baixo") por sala — nada vaza pela parede porque cada face de parede pertence à sua sala. Em tempo
  real: Lambert + uma `AmbientLight` de intensidade π (= a cor assada exata). Pisos/paredes/forros
  são subdivididos (0,5–0,75 m) para as poças de luz. Uma lanterna do núcleo (luz real) soma por cima.
* **Instâncias**: produtos das gôndolas e garrafas das geladeiras (4 InstancedMesh, cor por instância
  já com a luz do ponto — `ctx.lightAt`), bolinhas da piscina, árvores e capim.
* **Nível (tier)**: tier 0 sem bisel, menos produtos/árvores/bolinhas, Bloops com menos segmentos;
  tier ≤ 1 troca madeira/inox por cor lisa (menos materiais); tier ≥ 2 mais árvores, capim, 2 fileiras
  de produtos, bisel em peças menores.
* **Corte por sala** (`visibleFrom`, opcional — ver contrato): cada sala lista as salas visíveis
  dela (`ctx.see`). Ex.: do banheiro da lanchonete não se desenha cozinha/escritório/câmara.

Medição (Playwright + SwiftShader, 844×390, tier 1, vista de 1ª pessoa de cada sala): **chamadas de
desenho 16–119 por vista** (meta < 120), 36k–110k triângulos. Ver "Desempenho" no relatório do PR.

## Convenções

* Metros, Y para cima. Os modelos do kit olham para **+Z** com rotação 0; os `npcSpots[].yaw` já saem no
  padrão do núcleo (personagem olha −Z com yaw 0: o índice soma π). `spawn.yaw` = rotation.y da câmera.
* `rooms` vêm em ordem de prioridade: interiores primeiro; a última sala externa ("Estacionamento",
  "Pátio") é uma caixa grande que **contém** o prédio — use a **primeira** sala da lista que contém o ponto.
* NPC `pose: 'sit'` traz `pos.y` = altura do assento.
* Renderer esperado: `outputColorSpace = SRGB`, **sem tone mapping** (as cores são assadas para isso;
  com ACES fica mais escuro — dá para compensar com `toneMappingExposure ≈ 1.3`).
* `object.userData.soundHint` (ex.: `'phone'`, `'tick'`, `'water'`) nas anomalias `sound`: sugestão do
  som que o núcleo pode tocar na posição do objeto (a anomalia em si é um tremor/animação visual).
* `object.userData.task` / `userData.slot` = id da tarefa/anomalia (útil no raycast da foto).
* `root.userData.views` = vistas de 1ª pessoa nomeadas (só para o visualizador/screenshots).

### Contrato v1.1 (núcleo) — o que os dois mapas usam

* `env` (neblina, céu/chão da luz hemisférica fraca `ambient 0.3` — a luz principal já está assada),
  `items` + `taskHandlers` (`kit2/tasks.ts` → `chooseHandler`: o cliente/carro pede um item e só o certo
  conclui): Lanchonete `register`/`drivethru` pedem lanche/batata/refri/shake/pepitas; Posto `pump` pede
  gasolina (verde)/etanol (amarelo)/diesel (preto) e `register` água/salgadinho/doce/pão/café.
* `gives`/`wants`: Posto — caixas do depósito (`stock`, fonte) → vão da gôndola (`restock`).
* `holdSec` (chapa, fritadeira, bebida, limpeza, pano, café, lixo), `icon` em toda tarefa e sala.
* `setState('todo' | 'done' | 'want:<item>')`: ao montar tudo fica "feito"; `todo` acende o visual da
  tarefa (refri no chão, lixo cheio, carnes cruas, vão na prateleira…).
* `nav` (grafo de caminhada do Bocudo: 28 nós na Lanchonete, 37 no Posto) e `creatureSpawns` (4 cada).
* `anchor` da foto: se o centro do objeto cai dentro de um colisor (porta no vão), o kit puxa o ponto
  para dentro da sala (`MapCtx.fixAnchors`).
* Céu: a cúpula segue a câmera que estiver desenhando e encolhe para caber no `far` dela (o núcleo usa
  `far = fogFar…+4`); estrelas são pontos de 1–2 px.

### Adições OPCIONAIS ao contrato (`types.ts`, além da v1.1)

```ts
atmosphere?: { background: string; fog?: { color: string; near: number; far: number } };
visibleFrom?(pos: Vec3): void;
```

* `atmosphere`: cor de fundo + neblina linear do mapa (o núcleo aplica em `scene.background/fog`).
  Lanchonete: fundo `#0b1026`, neblina 18–70 m; Posto: `#0a0f24`, 22–85 m.
* `visibleFrom(pos)`: o núcleo chama antes de renderizar cada vista (jogador **e** câmeras de
  segurança) com a posição da câmera. Esconde as salas que não se veem dali e alimenta as **portas
  automáticas** de vidro (entrada da lanchonete e da loja do posto abrem quando a câmera chega a
  ~2,3 m). O núcleo atual não chama `visibleFrom` (ele tem o próprio corte por sala); as portas
  automáticas funcionam mesmo assim, porque a cúpula do céu informa a câmera em `onBeforeRender`.

## Energia e luz

`setPower(false)`: interiores caem para ~16 % de luz, lado de fora ~55 %, letreiros/telas a 12 %.
Anomalia `light` por sala (`roomLightFn`): v0 pisca, v1 avermelhada, v2 quase apagada, v3 esverdeada.
Letreiros, cardápio, monitores e geladeiras têm luz própria (piscar / apagar / cor).

## Lanchonete (`fastfood`)

Planta (x → leste, z → sul; teto 3,2 m): câmara fria (x 8..12, z −12..−9) · banheiros (x −12..−6,
z −9..−2) · escritório (−6..0) · cozinha (0..12) · cantinho kids (x −12..−6,5, z −2..9) · salão
(−6,5..4) · balcão (4..10) · drive-thru (x 10..12, z −2..1,5; janela em x = 12) · estacionamento,
pista do drive, rua (z 21..27) e mato. Spawn: atrás do balcão `(7, 0, 0.4)` olhando para a fila.

Salas (câmeras): Cantinho Kids (2), Salão (2), Balcão (2), Drive-thru (1), Cozinha (2), Câmara Fria (1),
Banheiros (1), Escritório (1), Estacionamento (3).

Tarefas (`InteractDef.kind`): `register` ×2 (caixas; tela do cliente), `grill` (chapa; estados `raw`
`cooking` `done` `burnt` `empty`), `fryer` (`down`/`up`), `drink` (`idle`/`cup`/`pouring`), `assemble`
(ilha de montagem com 6 potes de ingrediente; `building`/`done`), `clean` (refri derramado no salão;
`dirty`/`clean`), `drivethru` (janela + carro com Bloop motorista; `car`/`empty`).

NPC spots: fila do caixa ×4, retirada, cabine, 3 mesas, kids ×2, porta, carro do drive, calçada.

Anomalias (51 pontos): clientes Bloop (rosto com bocão/ciclope/sem rosto/muitos olhos/espiral, cor,
sumiu, virado, tamanho, mudou de lugar), cliente/criatura que não estava lá, bisnagas com cores trocadas
/flutuando/caídas, batatas flutuando/gigantes, cadeira virada/de pernas pro ar, cadeira a mais, mascote
Burgo virado/de presas/mudou de lugar, cartazes trocados, relógio 3:33/sem ponteiros/números ao
contrário/tique-taque, luz do salão, porta de entrada aberta, lixeira com criatura espiando, planta
murcha, pelúcia que mudou de lugar, bolinhas de uma cor só/criatura na piscina, mural com presinhas,
brinquedo de mola pulando sozinho, cardápio com olho/preço 0,00/tudo batata ou piscando, caixa com rosto,
máquina de bebida servindo sozinha, cliente da fila em cima do balcão, bandeja com pato/tênis/pedra,
carnes azuis/torre de carnes, cesto da fritadeira flutuando, batatas da estufa flutuando, utensílio
balançando, porta da câmara fria aberta, Sombrito na câmara, luz da cozinha, balde, porta da cabine
fechada com pezinhos embaixo, espelho com olhos/"OI"/rachado, torneira aberta, secador ligado,
monitores com olhos/chiado, cadeira girando, foto do "destaque do mês", armário aberto com criatura,
cofre aberto, telefone tocando, janela do drive aberta/criatura lá fora, motorista sem rosto, letreiro
piscando/"25h", carro a mais, vulto no estacionamento/na porta/em cima da placa, cardápio do drive,
luzes de fora.

## Posto 24h (`posto24h`)

Planta: estrada (z −38..−24) · pátio de concreto (z −21..0) com a cobertura "Bloop Gás" (x −9..9,
z −17,5..−4,5) e 4 bombas em 2 ilhas · loja (x −10..4, z 2..16) · escritório (x 4..10, z 2..7) ·
depósito (x 4..10, z 7..16) · banheiro externo (x 12..16, z 4..9) · lava-jato (x −24..−14, z −10..4)
· placa de preços (−15, −21,5) · orelhão · boneco inflável · árvores escuras com neblina.
Spawn: atrás do balcão `(2.3, 0, 5)` olhando para a loja.

Salas (câmeras): Loja (3), Escritório (1), Depósito (1), Banheiro (1), Lava-Jato (1), Estrada (1), Pátio (3).

Tarefas: `pump` ×2 (carro com Bloop chega; 3 bicos — verde gasolina, amarelo etanol, preto diesel;
estados `car`/`fueling`/`empty`), `restock` (vão na gôndola + carrinho com caixa; `empty`/`full`),
`register` (caixa), `coffee` (`idle`/`cup`/`brewing`), `mop` (refri no corredor; `dirty`/`clean`),
`trash` (lixeira da calçada; `full`/`empty`).

NPC spots: fila do caixa ×2, corredores ×2, geladeira, café, mesinha do café, 2 bombas, calçada,
orelhão, fila do banheiro.

Anomalias (43+ pontos): carro que não estava lá (bomba, calibrador, acostamento), mangueira levantada/
no chão, tela da bomba "8888"/olhos/apagada, placa de preços com números trocados/"OLÁ"/0,00 ou piscando,
luzes da cobertura, lixeira com criatura, balde, cone (no teto da cobertura, azul, fileira), vulto
(estrada, poste, vitrine, teto da cobertura), orelhão tocando/cor/fone pendurado, boneco inflável murcho
/cor/sumiu/no meio da estrada, 4 trechos de prateleira (bagunçados, de cabeça pra baixo, cor errada,
faltando), luz das geladeiras (vermelha/verde/roxa, piscando), porta da geladeira aberta, café servindo
sozinho, caixa com rosto, cliente (rosto, cor, sumiu, virado, em cima da gôndola), cliente a mais (na
geladeira, ATRÁS do balcão, lá fora olhando a vitrine), caixa eletrônico (rosto, "insira um SORRISO",
chiado), freezer de sorvete com criatura/tampa aberta, cartaz do café, relógio, luz da loja, salsichas
azuis/flutuando, monitores, cadeira girando, cofre, caixas do depósito, porta dos fundos, criatura no
depósito, luz do depósito, espelho do banheiro, porta do banheiro, luz do banheiro, torneira, escovas
do lava-jato girando sozinhas/cor, criatura no lava-jato, luz da estrada, motorista sem rosto.

## Visualizador

```
npx vite --port 4321
http://localhost:4321/scripts/dev/anomalias-map2.html?map=fastfood&tier=1
```

`?map=fastfood|posto24h &tier=0..3 &view=<sala|vista|spawn|cam:<sala>:<i>> &panel=0 &power=0`.
WASD/setas andam, Q/E sobem/descem, Shift corre, arrastar olha, **O** órbita, **P** painel, **L** energia.
O painel lista salas (vista + câmeras) e cada anomalia (tipo + variação + ▶ liga/desliga + 👁 olhar).
`window.__am` expõe `view`, `cam`, `apply(slot, kind, on, v)`, `clear`, `setPower`, `renderer`, `fps`.

Screenshots: `node scripts/dev/shoot-anomap2.mjs shots-maps fastfood 1 rooms cams pair:mascote:rotate:0:v_mascote fps:salao`.

Noite inteira no jogo de verdade (menu → caderno → memorizar → monitor → 4 anomalias fotografadas →
tarefas → Bocudo → amanhecer): `node scripts/dev/shoot-anomap2-night.mjs shots-maps fastfood` (ou `posto24h`).

## Textos

Nomes de salas/mapas e os textos pintados nas texturas (cardápio, placas, preços) são dados pt-BR do
mapa (não passam pelo i18n). Se o jogo for traduzido, o caminho é: nomes de sala por id no locale do
núcleo e as texturas com texto recebendo as strings por parâmetro.
