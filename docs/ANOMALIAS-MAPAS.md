# Anomalias & Cia — mapas "Creche" e "Hotel de Cabanas"

Contrato: `src/games/anomalias/maps/types.ts` (v1.1). Os dois mapas usam o kit compartilhado
`src/games/anomalias/maps/nightkit/` e estão ligados em `maps/index.ts` (LOADERS).

## nightkit (base dos dois mapas)

| Arquivo | O que faz |
|---|---|
| `kit.ts` | `MapKit`: baldes de geometria por (zona × material) → poucas malhas mescladas por sala; `part()` (peças soltas = alvos de anomalia); `begin/end` (bloco local girado: cada cabana é montada em coordenadas locais); colisores, portais, salas, NPCs, tarefas, slots, halos/poças de luz, sombras de contato instanciadas; `finish()` monta o `MapBuild` |
| `bake.ts` | **Luz assada nos vértices** (`bakeA` = luzes principais, apagam com `setPower`; `bakeB` = luzes noturnas/lua). Lambert comum + 6 linhas de shader: custo por pixel zero, aceita a lanterna e a hemisférica do núcleo. Luzes presas à caixa da sala (sem vazar pela parede); lua direcional com exclusão dos interiores |
| `walls.ts` | Paredes de dois lados (papel/lambri/toras), rodapé, guarda-cadeira, moldura, batentes e guarnições; gera colisores e **portais** (vãos) |
| `tex.ts` | Texturas em canvas: papéis de parede infantis, EVA, tapetes, toras (+normal), telhas, pedra, desenhos de criança (normais e "estranhos"), quadros, telas de monitor, etiquetas de chave, pegadas, céu da janela |
| `props.ts` | Materiais padrão + porta com dobradiça, quadro, relógio, luminárias, planta, estante com livros, janela, cortina, tapete |
| `bloops.ts` | **Bebê Bloop** (mesmo desenho dos Bloops do Noites: corpo redondo, olhos grandes, bochechas; macacão com pezinho, chupeta, topete, laço/touca). Rosto = textura no corpo: `sleep / awake / angry` (olhos vermelhos acesos + bocão com presinhas) `/ grin / stare`. 2 chamadas por bebê. Também a criatura própria (só no visualizador) e a silhueta de hóspede |
| `fx.ts` | Handlers de anomalia reutilizáveis (mover, girar, esconder, mostrar, trocar, tingir, trocar textura, piscar, animar) — desligar volta exatamente ao estado original |

**Desempenho.** Corte por sala em dois níveis, automático (`scene.onBeforeRender`, vale também para as
câmeras de segurança; ou chame `build.cull(camera)`): (1) **portais** — só as zonas vistas por vãos dentro
do frustum (até 3 saltos; vãos longe demais são ignorados no exterior); (2) **detalhes** (peças soltas)
somem por distância conforme o tamanho e o nível. Medido no jogo real com CPU 4× mais lenta (SwiftShader,
844×390, nível 1): creche 21–78 chamadas por vista; cabanas 31–120 (pior: recepção olhando a trilha pelas
janelas). Tier 0: menos segmentos, sem tufos, árvores LOD 1; tier ≥2: normal maps, tecido com trama, mais
grama/samambaia, detalhes vistos de mais longe.

**Convenções.** NPC: `yaw` convertido para o contrato (frente = −Z). Tarefas: `states[0]` = estado de
"precisa fazer" (o núcleo manda `todo`), último = feito (`done`), `want:<item>` → `onWant`. O núcleo
desenha o Bocudo nas anomalias `creature`; o mapa só deixa um marcador vazio no lugar (o visualizador dev
liga o modelo próprio com `globalThis.__anoOwnCreature = true`). Slots também têm `sound` (id de som
sugerido: `musicbox`, `creak`, `tick`, `drip`, `wind`, `train`, `bell`, `cuckoo`, `crackle`, `washer`, `growl`, `boil`).

## Creche (`maps/creche/`)

Salas (8): Recepção, Sala dos Monitores, Refeitório, Trocador, Corredor, Berçário, Brinquedoteca, Pátio
(gramado com balanço, caixa de areia, cerca, poste, árvores, lua). 1–3 câmeras por sala.

**Tarefas:** `crib` ×5 (ninar: segurar 2,5 s; bebê acordado sentado → deitado dormindo), `bottle`
(fonte: aquecedor dá *leite* ou *suco*; destinos: bebê do cadeirão e bebê do tatame pedem um deles),
`toy` ×3 (brinquedos espalhados → no baú), `diaper` (fonte: prateleira de fraldas; troca no trocador:
nuvenzinha verde de desenho → brilhinhos), `nightlight` ×4 (luz de tomada + poça de luz).

**Anomalias: 62 slots** — face 14 · move 24 · missing 23 · color 16 · rotate 14 · extra 10 · picture 8 ·
door 8 · creature 8 · scale 7 · light 4 · sound 4 · swap 3. Destaques: bebês dos berços (rosto bravo com
presinhas e olhos acesos / sorrisão / olhar parado; fora do berço em pé no canto; sumiu; virado; grandão;
cor), bebê a mais (berço vazio / ao lado da poltrona / na prateleira), móbile girando ao contrário,
caixinha de música tocando sozinha (tampa abre, bailarina gira), poltrona balançando, abajur vermelho,
desenhos que mudam, piscina de bolinhas (todas vermelhas / Bocudo), torre de blocos, trenzinho andando,
cavalinho, geladeira aberta, monitores com o rosto da criatura, espelho, torneira pingando, portas,
carrinhos, mochilas, relógios, casacos, pegadas, balanço sozinho, NPCs do núcleo (bebês nos cadeirões,
tatame, mesinha, professora).

## Hotel de Cabanas (`maps/cabanas/`)

Casa principal (Recepção + Sala da Lareira, telhado de duas águas com forro de tábuas, vigas, lustre de
galhada, lareira de pedra com fogo animado e cabeça de alce), trilha com 8 lampiões, 5 cabanas (cama de
toras, criado-mudo, guarda-roupa, banheirinho com cortina, poltrona, varanda com cadeira de balanço e
placa de número + ícone/cor), lavanderia com varal, fogueira com bancos de tora, floresta de
`src/3d/nature` (pinheiros, árvores, bétulas, samambaias, tufos, pedras), céu estrelado e neblina.
Salas (9): Recepção, Sala da Lareira, Cabana 1–5, Lavanderia, Trilha (a menor caixa vence).

**Tarefas:** `checkin` (fonte: quadro de chaves; o balcão pede a chave com a etiqueta da cabana —
cor + ícone, a ficha no balcão mostra a etiqueta pedida), `cleanroom` ×5 (cama desarrumada + toalhas no
chão → arrumada; pede *toalha* da prateleira da lavanderia), `lantern` ×8 (segurar 1,5 s), `firewood`
(fonte: pilha de lenha; destinos: lareira fraca→cheia e fogueira apagada→acesa).

**Anomalias: 49 slots** — creature 13 · rotate 13 · move 10 · light 10 · door 9 · picture 9 · extra 7 ·
missing 6 · sound 5 · color 4 · face 4. Destaques: porta de cabana aberta, hóspede (silhueta) na janela,
janela de cabana acesa, número da placa errado / ícone trocado, quadro com olhos, alce virado / de olhos
vermelhos, fogo verde, guarda-roupa aberto com o Bocudo, alguém dormindo debaixo da colcha, cadeira de
balanço balançando, pegadas de garra na trilha, lampião roxo / caído, placa de direção virada, chaves
(sumiu / a mais / cor), sino tocando, cuco, malas, lustre piscando, vulto atrás do lençol do varal,
máquina de lavar chacoalhando, NPCs do núcleo (hóspedes no balcão, sofá, fogueira).

## Ferramentas

- `scripts/dev/anomalias-map.html?map=creche|cabanas&tier=0..3` — visualizador sem o núcleo: voo livre
  (WASD/QE, arrastar), salas e câmeras, liga cada slot/tipo/variante, estados das tarefas, energia,
  colisores/NPCs/tarefas (`&cols=1`), `window.__v` para automação.
- `scripts/dev/shoot-anomalias-map.mjs` — fotos no visualizador (`pair:<slot>:<tipo>:<v>` = antes/depois).
- `scripts/dev/play-anomalias-maps.mjs <out> <mapa>` — joga uma noite no jogo real (caderno, monitor,
  4 anomalias fotografadas, uma tarefa com item, desempenho por sala com CPU 4×, amanhecer).

Nomes de salas/cabanas são dados em pt-BR (como no hospital); o nome dos mapas no menu já tem chave i18n
(`ano.map.creche`, `ano.map.cabanas`).
