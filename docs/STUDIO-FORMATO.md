# Bloop Studio — formato das criações (v4)

Contrato compartilhado em **`src/studio/format.ts`** (sem dependências; roda no app, no Worker e no
servidor). Usado pelo Bloop Studio (editor/jogar/loja), pelo estúdio de machinima (`src/cinema`) e pelo
futuro servidor da Loja de Criações. **Mudanças só aditivas** (campos opcionais novos). Mudança
incompatível ⇒ subir `FORMAT_VERSION` e converter em `migrate()`.

**Versões:** v1 = peças, juntas, fichas. **v2** = + `scripts` (Blocos de lógica), + `game` (Jogo da
Comunidade), + papel `collect`. Toda criação v1 continua válida: `migrate()` só troca `v: 1 → 2`
(não há campo removido nem renomeado). Leitores antigos podem ignorar `scripts`/`game`.
**v3** = + `terrain` (relevo esculpido e água), + `gen` (mundo Infinito personalizado), + `mission`
(objetivos da partida), + papel `enemy`. `migrate()` troca `v: 1|2 → 3`; nada foi removido. Leitores
v2 que ignorarem os campos novos continuam mostrando as peças (o relevo some, o chão fica plano).
**v4** (Bloop Engine) = + `levels`, `vars`, `anims`, `npcs`, `cutscenes`, `story`, extensões de `game`,
novos eventos/blocos/leituras. `migrate()` troca `v: 1|2|3 → 4`; nada foi removido. Leitores v3 ignoram
os campos novos e jogam **só a fase 1** (a raiz). Detalhes em [§ v4](#v4--bloop-engine-jogos).

## Convenções

- Unidades: **metros** e **graus**. `+Y` é para cima. Rotação = Euler **XYZ** em graus.
- Toda primitiva cabe num cubo 1×1×1 centrado na origem; `s` (escala) = **tamanho em metros**.
  Rampas e cunhas: a face inclinada sobe de `−Z` (baixo) para `+Z` (alto).
- Cilindro, cone, cápsula, cano: eixo `Y`. Toro e arco: no plano `XY` (arco em pé, aberto embaixo).
- Veículos: a **frente é o −Z local do assento** (`role: 'seat'`). Rodas = peças `role: 'wheel'`
  (o eixo de giro é o `Y` local da peça, como um cilindro deitado).

## Estrutura

```ts
Creation {
  v: 4                     // versão do formato (1, 2 e 3 continuam válidos)
  id: string               // [A-Za-z0-9_-]{1,64}, estável; a loja usa o mesmo
  kind: 'object' | 'vehicle' | 'map'
  name: string             // ≤ 32
  author: string           // apelido exibido
  authorId?: string        // id/handle do autor (usado por "Ocultar autor")
  parts: Part[]
  joints: Joint[]
  logic: LogicRule[]       // "fichas"
  materials: Material[]    // { c: '#rrggbb', k: 'plastic'|'metal'|'glass'|'wood'|'neon'|'rubber' }
  thumbnail?: string       // data:image/webp|jpeg;base64 ≤ 40 KB
  worldKind?: 'infinite' | 'flat' | 'void'
  seed?: number            // semente do mundo infinito
  from?: string            // id da criação original (remix)
  deps?: Creation[]        // criações importadas embutidas (1 nível) — mapa abre offline
  scripts?: Script[]       // v2: Blocos de lógica
  game?: GameMeta          // v2: { title, desc ≤200, tags ≤5, maxPlayers 1..16 }
  terrain?: TerrainData    // v3: relevo + água (mundo Plano)
  gen?: WorldGenSettings   // v3: ajustes do mundo Infinito
  mission?: Mission        // v3: objetivos, vidas, tempo, textos de vitória/derrota
  created?, updated?: number
}
```

### Peças (`Part`)

Campos comuns: `id` (inteiro ≥ 1, único), `p` posição, `r?` rotação, `s?` escala, `m?` índice do
material (padrão 0), `g?` grupo, `layer?` (0..7), `phys?` (`'static'` padrão · `'dynamic'` · `'none'`),
`role?`, `name?`, `hide?` (escondida ao jogar — molde da ficha "criar").

| `t` | Extra | O que é |
| --- | --- | --- |
| `box` `sphere` `cylinder` `cone` `wedge` `torus` `capsule` `ramp` `arch` `pipe` | — | primitiva |
| `stroke` | `pts: number[]` (x,y,z achatados, relativos a `p`, 2..256 pontos), `w` raio | traço da **Caneta 3D** (tubo) |
| `ref` | `ref: string` (id da criação), `h?` hash | criação importada (biblioteca/loja). `s` multiplica |

Papéis (`role`): `seat` assento do motorista · `wheel` roda · `thruster` propulsor (veículo voador) ·
`spawn` ponto de início · `checkpoint` · `goal` bandeira de chegada · `button` · `zone` área-gatilho
(invisível ao jogar) · `light` lâmpada · `hazard` (encostou: "morre", perde vida, volta ao checkpoint) ·
`collect` (v2, coletável: some ao tocar e dispara o evento `collect`) · `enemy` (v3, inimigo: anda
sozinho em volta de onde foi posto e persegue o jogador por perto; encostar = perder vida; pular em
cima = derrotar).

Grupo (`g`): peças com o mesmo `g` são selecionadas juntas e, ao jogar, viram **um só corpo**.

### Juntas (`Joint`)

`{ id, k: 'hinge'|'slider'|'fixed', a, b (0 = mundo), at: pivô, axis?, lim?: [min,max], motor?: { speed, force?, on? } }`

- `hinge`: gira em torno de `axis` passando por `at`; `lim` em graus; motor em rad/s.
- `slider`: desliza ao longo de `axis`; `lim` em metros; motor em m/s (vai e volta entre os limites).
- `fixed`: cola `a` em `b`.

### Lógica — fichas (`LogicRule`)

`{ id, on: Trigger, do: Action[] (≤ 6) }`

- Gatilhos: `button` (part), `zone` (part — ao entrar), `timer` (`sec`), `start` (ao começar).
- Ações: `door` (gira 90° pela borda, alterna), `move` (desliza `d`, alterna), `light` (liga/desliga),
  `teleport` (leva o jogador até a peça), `spawn` (cria uma cópia física da peça), `sound` (`snd`:
  ding/pop/boing/whoosh/fanfare/boom), `score` (`n` pontos), `motor` (liga/desliga o motor da `joint`),
  `win` (vence o mapa).

### Blocos de lógica — `Script` (v2)

Programação em **blocos empilhados**, sem código do usuário (nada de `eval`). Interpretador
determinístico em `src/studio/play/vm.ts`: cada evento cria uma linha; orçamento de **600 passos por
quadro** (120 por linha, 48 linhas no máximo) — um "repetir" sem "esperar" nunca trava o jogo. O
sorteio usa semente (`seed` da criação), então a mesma partida sorteia igual.

```ts
Script { id, name?, on: ScriptEvent, body: Block[] }
ScriptEvent { k: 'start'|'touch'|'zone'|'every'|'collect'|'die'|'button'|'message', part?, sec?, msg? }
Expr = number | { v: 'nomeDaVariável' } | { q: 'score'|'time'|'lives'|'team'|'players' }
     | { op: '+'|'-'|'*'|'/'|'rand'|'min'|'max', a: Expr, b: Expr }
Cond { op: '<'|'>'|'='|'!='|'<='|'>=', a: Expr, b: Expr }
```

Blocos (`part` ausente = "esta peça", a que disparou o evento):

| Bloco | Campos | Faz |
| --- | --- | --- |
| `move` / `rotate` | `part?`, `d` (m) / `r` (graus), `t?` s | desliza / gira a peça (vira cinemática) |
| `force` | `part?`, `d` | empurrão (peça dinâmica; Δv = d) |
| `teleport` · `spawn` · `door` · `light` | `part` | leva o jogador · cria cópia física · abre/fecha · liga/desliga |
| `destroy` · `color` | `part?`, (`c`) | some com a peça · muda a cor |
| `motor` | `joint` | liga/desliga motor |
| `sound` · `say` | `snd` · `text` (≤60, `{score}` `{lives}` `{time}` `{variável}`) | som · texto pequeno no canto (filtrado) |
| `score` · `lives` | `n: Expr` | soma pontos · define vidas (0 vidas = perdeu) |
| `checkpoint` · `team` | `part?` · `team` 0/1/2 | salva checkpoint · entra no time |
| `match` | `on: 'start'|'win'|'lose'` | recomeça · vence · perde |
| `set` / `change` | `v`, `e: Expr` | variável = / += (≤ 32 variáveis, nome ≤ 16) |
| `if` | `c`, `then[]`, `else?[]` | condição |
| `repeat` | `n: Expr` (≤ 1000), `body[]` | repetir |
| `wait` | `sec: Expr` | espera |
| `send` | `msg` | dispara o evento `message` com esse nome |

Limites: 64 scripts, 1024 blocos no total, profundidade 8. `validate()` remove blocos inválidos
(peça/junta inexistente, tipo desconhecido) e limita números.

### Relevo — `TerrainData` (v3)

```ts
TerrainData {
  n: number        // vértices por lado, 9..129
  cell: number     // metros entre vértices, 0,25..8  ((n−1)·cell ≤ 512)
  h: string        // base64 de Int16 little-endian, n·n alturas em CENTÍMETROS
  m?: string       // base64 de Uint8, n·n índices de TERRAIN_MATS (ausente = tudo grama)
  wy?: number      // superfície da água nos vértices pintados de 'water' (padrão −0,3)
  water?: { x, z, w, d, y }[]   // ≤ 16 lagos retangulares: centro, tamanho, altura da superfície
}
TERRAIN_MATS = ['grass', 'sand', 'snow', 'rock', 'dirt', 'water']
```

A grade é centrada na origem; o índice é `j·n + i` com `x = i·cell − (n−1)·cell/2` e
`z = j·cell − (n−1)·cell/2`. Fora da grade o chão continua plano em y=0 e a borda da grade fica
sempre em 0 (sem degrau). Use `encodeHeights()`/`decodeHeights()` de `format.ts`. Só vale no mundo
Plano. A água boia: corpos dinâmicos e veículos recebem empuxo abaixo da superfície (`waterAt`).

### Mundo personalizado — `WorldGenSettings` (v3)

Todos opcionais (ausente = padrão; multiplicadores 1 = normal):
`preset` (`normal` · `flat` plano em camadas · `islands` · `flatIslands` só ilhas planas · `floating`
ilhas flutuantes), `height` 0..2, `rough` 0..2, `sea` −12..12 m, `biomeSize` 0,25..4,
`biomes` { campo, floresta, deserto, neve, pantano, montanhas, oceano, savana, outono, cogumelos,
tropical, ilhas: peso 0..3 (0 = desligado) }, `trees`/`caves`/`ores` 0..2 e, no `flat`,
`layers: { k: TerrainMat, n: metros }[]` (≤ 8, de baixo para cima; a de cima é o chão; `water`
por cima vira mar raso). A área de construção (raio ~34 m) é sempre plana em y=0. Mesmo
`seed` + mesmo `gen` ⇒ mesmo mundo em qualquer aparelho.

### Missão — `Mission` (v3)

```ts
Mission {
  objectives: Objective[]   // ≤ 8
  order?: 'seq'             // um de cada vez (padrão: qualquer ordem)
  lives?: number            // 0 = infinitas
  time?: number             // tempo limite em s (0 = sem)
  win?, lose?: string       // textos das telas de fim (≤ 60)
}
Objective { k: 'reach'|'collect'|'defeat'|'survive'|'drive', n?, sec?, part? }
```

`reach`: chegar à peça `part` (ou a qualquer `goal`) · `collect`: coletar `n` (padrão: todos) ·
`defeat`: derrotar `n` inimigos (padrão: todos) · `survive`: aguentar `sec` s · `drive`: chegar
pilotando um veículo. Com missão, encostar na chegada não vence sozinho: vence quando todos os
objetivos estão feitos; acabou o tempo ou as vidas ⇒ tela de derrota (Jogar de novo / Editar).

## Limites (`LIMITS`)

Teto do formato: 2000 peças, 64 juntas, 64 fichas, 32 materiais, 256 pontos por traço, 24 deps,
512 KB de JSON, posições ±2000 m, peças 0,02–200 m, 3 níveis de `ref`; relevo até 129×129
vértices e 512 m, 16 lagos, 8 objetivos. v4: 8 fases no total (peças somadas ≤ 2000), 12 cenas,
32 animações e 16 NPCs por fase, 1 MB de JSON para jogos (ver § v4). O editor aplica limites
**menores** por qualidade do aparelho e assinatura (ver `src/studio/pro.ts`).

## Funções

| Função | Uso |
| --- | --- |
| `validate(x)` | `{ ok, errors[], creation }` — nunca lança; remove peças/juntas/fichas inválidas e limita números. **Sempre** valide o que vem de fora. |
| `serialize(c)` | texto compacto URL-safe: `"B1." + base64url(deflate-raw(JSON))` (CompressionStream) ou `"B0." + base64url(JSON)` |
| `deserialize(s)` | inverso (aceita também JSON puro); devolve `validate()`; lança `Error('format')` se ilegível |
| `hashCreation(c)` | hash estável (cyrb53, 14 hex) do JSON canônico (chaves ordenadas, números arredondados, **sem** miniatura/datas/deps) |
| `emptyCreation(kind, name, author)` · `newId()` · `nextPartId(c)` | criar |
| `refIds(c)` · `findDep(c, id)` · `isVehicle(c)` · `partCount(c, resolve)` | utilidades |

Números são arredondados ao serializar (mm, 0,1°, traços em cm).

## v4 — Bloop Engine (jogos)

Plano completo: `docs/ENGINE-PLANO.md`. Tudo é **opcional e aditivo**; a raiz da `Creation` continua
um `kind: 'map'` e **é a fase 1** (id reservado `ROOT_LEVEL = 'main'`).

```ts
Creation {
  ...v3
  levels?: Level[]          // fases extras; TOTAL de fases ≤ 8 (raiz + 7)
  vars?: VarDef[]           // ≤ 32 variáveis declaradas
  anims?: PartAnim[]        // ≤ 32, da fase 1 (cada Level tem as suas)
  npcs?: Npc[]              // ≤ 16, da fase 1
  cutscenes?: Cutscene[]    // ≤ 12, do jogo todo
  story?: StoryFlow         // ordem da Historinha (≤ 24 passos)
}
GameMeta += {
  modes?: { solo?: boolean, story?: boolean /* exige story */,
            online?: { min 1..max, max 2..8, teams?: 0|2, pvp?, goal?: free|coop|race|collect|survive|tag|push } }
  intro?: cutsceneId        // cena de abertura (pulável)
  cover?: 0                 // capa = thumbs[0] da listagem
  hud?: { vars: string[] }  // ≤ 4 nomes de vars declaradas
  controls?: { action?: GameIconId, action2?: GameIconId, run?: boolean }
}
Level { id [A-Za-z0-9_-]{1,24} ≠ 'main', name ≤ 24, parts, joints, logic, materials? (ausente = os da raiz),
        scripts?, terrain?, worldKind?, seed?, gen?, mission?, anims?, npcs?,
        next?: levelId | 'main' | '' /* fim */ }      // next ausente = a seguinte da lista (a última → fim)
VarDef { name (regra das variáveis dos blocos, ≤ 16), init, scope: 'player'|'game', hud?: GameIconId, persist? }
PartAnim { id, name?, part? | g? (exatamente um, da mesma fase), loop: once|loop|pingpong, auto?,
           keys: { t 0..60 s, p?: deslocamento, r?: graus, s?: multiplicador, ease? }[] /* 1..16, ordenados */ }
Npc { id (único no JOGO), name ≤ 16, look: { skin?, creature?, avatar?: {parts, colors} }, at, yaw,
      path?: Vec3[] ≤ 8, speed? 0,2..8, talk?: DialogLine[], role?: friend|shop|enemy }
DialogLine { who?: npcId|'player' (ausente = narrador), text ≤ 80, choices?: { text ≤ 24, set?: {v, e}, go?: msg }[] ≤ 3 }  // ≤ 6 falas
Cutscene { id, name, dur 1..90 s, level?: fase onde acontece, skippable: true (forçado),
           cam: { t, p, look: Vec3 | {npc} | {part}, fov? 20..120, ease? }[] ≤ 24,
           actors: { who: 'player'|npcId|'part:<id>', keys: { t, p, yaw?, pose?, expr?, ease? }[] ≤ 24 }[] ≤ 6,
           subs: { t, end?, who?, text ≤ 80, style? }[] ≤ 24, sfx? ≤ 24, fx? ≤ 12, music?, title?: {text ≤ 40, at}, from? }
StoryFlow { steps: ({k:'cut', id} | {k:'level', id} | {k:'end', text?})[] }
```

`Ease`, `PoseId`, `ExprId`, `BubbleStyle`, `FxKind` são **cópias literais** dos tipos de `src/cinema/format.ts`
(este arquivo não importa nada); `src/studio/play/hooks.ts` confere a igualdade na compilação.
Ícones do jogo (`GAME_ICONS`) existem todos em `src/studio/ui/sicons.ts` (conferido em `scripts/test-format.mjs`).

**Eventos novos** (no fim de `SCRIPT_EVENTS`): `action {key: 'a'|'b'}`, `join`, `level` (a fase começou),
`cutend {id?}`, `var {v}`, `tag`, `defeat`, `timeup`, `talk {npc}` (NPC da mesma fase).
**Blocos novos** (no fim de `BLOCK_KINDS`; `BLOCK_KINDS_V3` = os 23 antigos): `level {to: id|'main'|'next'}`,
`cutscene {id}` (espera), `dialog {lines}` (espera), `anim {id, on: play|stop}`, `show/hide {part?}`,
`camera {cam: shake|focus|reset, part?}`, `npc {id, act: walk|stop|face, part?}`, `it {who: me|toucher|random}`,
`hud {text}`, `save`, `emote {pose}`. **Leituras novas** (`Expr.q`): `it`, `level`, `alive`.
Variáveis não declaradas continuam valendo, com escopo `player`.

**Validação estrita** (`validate()`): entradas inválidas são **removidas** (com um código em `errors`:
`level`, `levels-limit`, `level-next`, `anim`, `anim-part`, `anim-keys`, `anims-limit`, `npc`, `npcs-limit`,
`dialog`, `choice`, `who`, `cutscene`, `cutscenes-limit`, `cut-level`, `cut-cam`, `cut-actor`, `cut-sub`,
`story`, `story-step`, `var`, `game-intro`, `script-ref`, `block`); números são limitados; referências
(fase, cena, animação, NPC, peça, variável do HUD) precisam existir. As **peças somadas** de todas as fases
respeitam `LIMITS.parts` (2000). Jogos v4 (`hasEngine(c)`) podem ter até **1 MB** de JSON
(`LIMITS.gameBytes` = `UGC.maxGameBytes`); o resto continua com 512 KB. Dependências importadas
(`deps`) nunca carregam campos v4. Campos desconhecidos (v5+) são descartados.

**Hash:** `canonical()` inclui todos os campos v4 (e arredonda as peças das fases extras como as da raiz),
mas grava `v` acima de 3 como **3** — por isso uma criação v1–v3 tem **o mesmo `hashCreation`** antes e depois
da migração (congelado em `scripts/fixtures/format-v3.json`, conferido por `node scripts/test-format.mjs`).

**Funções v4:** `levelList(c)` (fase 1 + extras como `Level[]`), `nextLevel(c, id)`, `totalParts(c)`,
`hasEngine(c)`, `collectTexts(c)` (todo texto visível com onde aparece — o app filtra antes de enviar e o
servidor refiltra).

Contratos fora deste arquivo: `shared/engine.ts` (visibilidade, cards, envio, senhas, `ENGINE`),
`src/studio/play/hooks.ts` (ganchos do jogo: entrada, cenas, diálogo, animações, NPCs, variáveis, rede).

## Link de compartilhar

`src/studio/share.ts` — abre na **versão web** do jogo (sem APK):

- `<web>/#/studio/p/<id>` — criação ou jogo publicado na Loja (id da listagem);
- `<web>/#/studio/c/<código>` — criação pequena embutida: `código = serialize(c)` (`B1.` + deflate + base64url),
  até 6000 letras; maior que isso o app pede para publicar.

`<web>` = origem da página; no Android, `ONLINE.nativeApiBase` (o Worker serve a versão web). O
fragmento (`#`) não vai para o servidor. Ao abrir, `registerStudio()` espera o hub e abre o estúdio
jogando o mapa (ou "experimentando" o objeto/veículo).

## Loja (servidor, futuro)

Interface do cliente em `src/studio/store-api.ts` (`StudioStoreApi`); o mock local está em
`src/studio/store-mock.ts`. O servidor deve: revalidar com `validate()`, recalcular `hashCreation()`,
filtrar nome com `shared/moderation.ts`, aplicar a regra de moedas `CREATOR_REWARD` (uso único por
jogador e criação, sem autouso, teto diário) e os relatórios/ocultar autor.

Jogos da Comunidade: `submitForReview(creation, thumbnails[3])` → `ReviewTicket { id, status }`
(`pending` até o classificador de imagem das miniaturas + denúncias + fila do admin aprovarem;
o mock aprova na hora), `reviewStatus(id)`, `favorite(id, on)`, `submitScore(id, {score, timeSec})`,
`leaderboard(id)`; `browse({ section: 'games', tag, favorites })`.
