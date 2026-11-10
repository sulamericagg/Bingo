# Bloop Studio — formato das criações (v1)

Contrato compartilhado em **`src/studio/format.ts`** (sem dependências; roda no app, no Worker e no
servidor). Usado pelo Bloop Studio (editor/jogar/loja), pelo estúdio de machinima (`src/cinema`) e pelo
futuro servidor da Loja de Criações. **Mudanças só aditivas** (campos opcionais novos). Mudança
incompatível ⇒ subir `FORMAT_VERSION` e converter em `migrate()`.

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
  v: 1                     // versão do formato
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
(invisível ao jogar) · `light` lâmpada · `hazard` (encostou, volta ao checkpoint).

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

## Limites (`LIMITS`)

Teto do formato: 2000 peças, 64 juntas, 64 fichas, 32 materiais, 256 pontos por traço, 24 deps,
512 KB de JSON, posições ±2000 m, peças 0,02–200 m, 3 níveis de `ref`. O editor aplica limites
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

## Loja (servidor, futuro)

Interface do cliente em `src/studio/store-api.ts` (`StudioStoreApi`); o mock local está em
`src/studio/store-mock.ts`. O servidor deve: revalidar com `validate()`, recalcular `hashCreation()`,
filtrar nome com `shared/moderation.ts`, aplicar a regra de moedas `CREATOR_REWARD` (uso único por
jogador e criação, sem autouso, teto diário) e os relatórios/ocultar autor.
