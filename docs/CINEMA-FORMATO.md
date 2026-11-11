# Bloop Cinema — formato do projeto (`bloop-cinema`, versão 1)

O estúdio de filmes (`src/cinema/`) salva cada filme como **um JSON** no IndexedDB do aparelho
(banco `bloop-cinema`, store `projects`). As gravações de voz ficam no store `clips` (Blob de áudio +
envelope de volume), referenciadas por id. **Nada é enviado para servidor**: o vídeo exportado sai só
pelo menu de compartilhar do sistema (ou download na web), quando a pessoa escolhe.

Fonte da verdade dos tipos: `src/cinema/format.ts` (mantenha este documento em sincronia).
Leitura tolerante + migração: `parseProject(raw)` — corrige campos faltando, limita valores e devolve
`null` se não for um projeto do Bloop Cinema ou se for de uma versão **mais nova** que a do app.

## Unidades e coordenadas

| O quê | Unidade |
|---|---|
| tempo | segundos (float), **relativo ao início do plano** (shot) |
| palco 2D | 16 × 9 unidades; chão em `y = 7.3` (`FLOOR_Y`) |
| ator `x` | 0..16 da esquerda (pode sair um pouco: -1..17) |
| ator `z` | -3..3 (profundidade; + = mais perto da câmera — fica maior e mais baixo no 2D) |
| ator `y` | altura acima do chão (pulos, voar) |
| 3D | mesmo ator: `X = (x - 8) × 0.6 m`, `Z = z × 0.9 m`, `Y = y × 0.6 m` |

O mesmo projeto toca em 2D **ou** 3D (`mode`): as chaves dos atores servem para os dois.

## Estrutura

```jsonc
{
  "format": "bloop-cinema",        // obrigatório
  "v": 1,                          // versão do formato
  "id": "pj…", "title": "Meu filme 1",
  "created": 1762700000000, "updated": 1762700000000,   // ms
  "mode": "2d",                    // "2d" | "3d" (3D = Cinema Pro)
  "template": "bolo",              // opcional: história de origem (remix)
  "story": StorySpec,              // opcional: roteiro do "Criar história"/História Mágica (shared/story.ts);
                                   // permite "Editar história" no modo simples (refaz os planos a partir dele)
  "watermark": true,               // marca "Feito no Bloop World" (só Pro pode desligar)
  "mix": { "music": 0.7, "voice": 1, "sfx": 0.8 },      // 0..1
  "music": { "song": "free-02", "offset": 8, "vol": 0.6 } | null,
  "cast": [ CastMember ],          // até 8
  "scenes": [ Scene ]              // cena = cenário; cada cena tem planos
}
```

### CastMember
```jsonc
{
  "id": "c…", "name": "Pipoca",           // nome passa pelo filtro do chat
  "kind": "avatar" | "creature",
  "avatar": { "parts": {…9 slots…}, "colors": { "primary": "#ffd93b", "secondary": "#ff8f3b" } },
                                         // mesmo AvatarData do "Crie seu Bloop" (src/game/avatar.ts)
  "creature": "s03-rare",                // id da coleção de bichinhos (kind = creature)
  "voice": "normal" | "chipmunk" | "deep" | "robot" | "echo" | "giant",
  "size": 1,                             // 0.6..1.4
  "makeup": MakeupLook                   // opcional: Estúdio de Maquiagem (ver abaixo)
}
```

### MakeupLook (maquiagem / pintura facial — `src/makeup/format.ts`)
Lista de **traços** (não é imagem): redesenhada em qualquer resolução (2D, textura do rosto 3D de
256/384/512 px conforme a qualidade, miniaturas, foto).
```jsonc
{ "v": 1, "layers": [ { "id": "l…", "name": "Camada 1", "o": 100, "h": 1,   // o = opacidade 0..100, h = escondida
    "st": [ { "b": "blush",          // base|blush|shadow|lips|contour|highlight|glitter|stars|hearts|stripes|erase
              "c": "#ff7a9a", "s": 40, "a": 55,     // cor, tamanho (R/100), força 1..100
              "z": "cheeks",          // zona inteligente (máscara): lips|eyes|cheeks|forehead
              "m": 1,                 // simetria (espelha em x)
              "p": [-50,17, -44,20, …] } ] } ] }   // pontos inteiros, R/100, origem no CENTRO DO ROSTO
```
Espaço: unidades de R/100 do corpo, origem em `(0, fy·R)` (altura do rosto da forma), y para baixo,
área ±130. Limites: 8 camadas, 400 traços, 600 pontos/traço. Grátis: 2 camadas e pincéis básicos;
glitter, estrelas, corações, listras e camadas extras = Pro. O look do **jogador** fica em
`localStorage['bw-makeup-player']` (não vai para `save.avatar`/rede); looks salvos em `bw-makeup-looks`.

### Scene
```jsonc
{
  "id": "sc…", "name": "",
  "bg": "kitchen",                 // fundo 2D e cenário 3D (mesmo id) — ver BACKGROUNDS em data.ts
  "light": "day" | "dusk" | "night",
  "studio": { "name": "Minha arena", "json": { … } },   // opcional: Criação do Bloop Studio (3D)
  "shots": [ Shot ]
}
```
`studio.json` é a criação **embutida** (o projeto não depende de rede). Hoje o leitor
(`loadStudioSet` em `scene3d.ts`) aceita uma lista `objects`/`parts` de primitivas
(`shape|type`: box/sphere/cylinder/cone, `pos|p`, `rot|r` em graus, `scale|s`, `color|c`).
**TODO(studio):** quando `src/studio/format.ts` existir, trocar pelo parser oficial.

### Shot (plano)
```jsonc
{
  "id": "sh…",
  "dur": 4,                                        // 0.5..60 s
  "transition": { "kind": "cut|fade|dissolve|slide|zoom|iris", "dur": 0.5 },  // ENTRADA do plano
  "cam":    [ CamKey ],                            // ≥ 1
  "actors": [ { "cast": "c…", "keys": [ ActorKey ] } ],   // só quem aparece neste plano
  "lines":  [ Line ],
  "fx":     [ FxEvent ],
  "sfx":    [ SfxEvent ]
}
```
A transição acontece **dentro** dos primeiros `transition.dur` segundos do plano (o anterior aparece
congelado no fim). Duração total do filme = soma de `dur` de todos os planos.

### ActorKey (chave do ator)
```jsonc
{ "t": 1.2, "x": 6.5, "z": 0, "y": 0,
  "face": -1 | 0 | 1,              // esquerda / frente / direita (3D: vira ±60°)
  "pose": "stand",                 // ver POSES (data.ts) — 20 poses
  "expr": "happy",                 // ver EXPRESSIONS — 16 expressões
  "ease": "inout|linear|in|out|back|bounce|step" }   // como CHEGA nesta chave
```
- Posição interpola entre chaves com o `ease` da chave de destino.
- Pose e expressão valem a partir da chave; a pose **mistura** suavemente (0,35 s).
- Se o ator se move e a pose é `stand`, ele anda (`walk`) ou corre (`run`, > 3,2 un/s) sozinho
  e vira para o lado do movimento quando `face = 0`.

### CamKey (câmera)
```jsonc
{ "t": 0, "x": 8, "y": 4.5, "zoom": 1,          // 2D: centro do enquadramento + zoom (0.85..5)
  "focus": "c…",                                 // segue a cabeça do ator (2D e 3D)
  "p3": "wide|closeup|ots|orbit|dolly|low|high|side",   // 3D: tipo de câmera
  "focus2": "c…",                                // 3D por cima do ombro: ombro de quem
  "yaw": 0,                                      // 3D: giro extra (graus)
  "ease": "inout" }
```

### Line (fala / legenda / narração)
```jsonc
{ "id": "ln…", "t": 0.5, "dur": 2.4,
  "cast": "c…",                     // quem fala (boca mexe e o balão aponta); vazio = sem dono
  "text": "Olha!",                  // ≤ 140 letras, passa por maskLongText (shared/moderation.ts)
  "style": "speech|shout|think|whisper|subtitle|narration",
  "audio": "clip…" }                // opcional: voz gravada (store `clips`)
```
Campos opcionais da captura de rosto ("Gravar com o rosto"):
```jsonc
  "face": { "hz": 30, "n": 72, "q": "base64…", "only": "mouth" },   // FaceTake
  "cut": [0.3, 2.4]          // corte [início, fim] em segundos DA GRAVAÇÃO (voz e rosto juntos)
```
`FaceTake`: `n` quadros a `hz` (15/20/30 conforme a qualidade), cada quadro = 16 bytes na ordem
`FACE_CH` = `bl br bwl bwr bwi op A O E sm pk yaw pit rol lx ly` (piscar esq./dir., sobrancelha esq./dir.,
meio da sobrancelha, boca aberta, vogais A/O/E, sorriso, bico, cabeça virar/inclinar/deitar, olhar).
Byte 0..255 ↦ 0..1 (piscar, boca, vogais, sorriso, bico, `bwi`), −1..1 (`bwl bwr lx ly`) ou
−0,6..0,6 rad (cabeça). Tempo da gravação `s = (t − line.t) × velocidade da voz + cut[0]`; a leitura
interpola entre quadros. A captura sobrepõe **só o rosto** (olhos, sobrancelhas, boca, cabeça) durante
a fala; pose e posição seguem as chaves, e detalhes da expressão da chave (blush, lágrimas) continuam por
cima. `only: "mouth"` = usa só boca + cabeça e mantém os olhos da expressão manual. Nenhuma imagem da
câmera é guardada. Limite grátis: o mesmo tempo diário do Bloop Espelho (`src/mirror/quota.ts`, conta só
o tempo gravando); Pro sem limite.

Com `audio`, a boca segue o envelope de volume da gravação (50 Hz); sem, mexe "silabando" o texto.

### FxEvent / SfxEvent
```jsonc
{ "id": "fx…", "t": 1, "dur": 2, "kind": "shake|sparkles|rain|hearts|sweat|zoomlines|confetti|snow|flash|poof|anger|notes|stars",
  "cast": "c…",                     // efeitos presos a um ator (corações, suor, raiva, notas...)
  "intensity": 1 }
{ "id": "sf…", "t": 0.2, "sfx": "boing", "vol": 0.9 }   // efeitos sonoros sintetizados (data.ts SFX)
```

## Gravações (`clips`)
`{ id, pid (projeto), blob (webm/opus ou o que o aparelho gravar), dur, env: Float32Array }`.
Exportar o projeto em `.json` **não** leva as gravações (ficam só no aparelho); ao importar, as
falas perdem o `audio` e voltam a mexer a boca pelo texto.

## Limites (grátis × Pro)
| | Grátis | Cinema Pro (Clube Bloop ou qualquer Passe premium) |
|---|---|---|
| modo | 2D | 2D e 3D |
| duração | 60 s | 5 min |
| filmes salvos | 3 | ilimitado |
| marca d'água | sempre | opcional |
| extras | — | cenários, poses e efeitos marcados `pro` |

Projetos com itens Pro continuam abrindo e tocando sem Pro; só a **escolha** do item e a exportação
3D pedem o Pro (aviso amigável, sem produto novo de compra).
