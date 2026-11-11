# Mundo Aberto — Blocos de material e construção

Pasta: `src/games/floresta/world/content/blocks/` (entrada única: `index.ts`).
Sistema autocontido e guiado por dados: catálogo de blocos ORIGINAIS, malha por pedaço
com suavização por material, atlas de texturas procedural, ícones de inventário em canvas.
Não depende de nada do motor; o motor só pluga o chão natural (opcional) e chama a API.

## O que tem

| Parte | Arquivo | Puro? |
|---|---|---|
| Tipos (`BlockDef`, `Render`, `Group`, `TerrainSampler`) | `types.ts` | sim |
| Catálogo (204 blocos, 184 ladrilhos) | `registry.ts` | sim |
| Armazenamento 16³ (Uint16 + meta), job de malha, gravidade, save RLE | `store.ts` | sim |
| Mesher (duros chanfrados + greedy, macios surface nets 2×, plantas, formas) | `mesher.ts`, `shapes.ts` | sim (roda no Worker) |
| Regras: quebrar (ferramenta/nível/tempo), drops | `rules.ts` | sim |
| Orçamentos por nível de qualidade | `quality.ts` | sim |
| Atlas procedural 512×512 (16×16 ladrilhos de 32 px) | `atlas.ts` | DOM |
| Materiais three (Lambert + atlas via `onBeforeCompile`) | `material.ts` | three |
| `BlockWorld` (cena, fila de malha, Worker, luzes, mira) | `world.ts`, `mesh.worker.ts` | three |
| Ícones de inventário | `icons.ts` | DOM |
| Demo / debug | `demo.ts`, `demoscene.ts`, `scripts/dev/blocos.html` | — |

"Puro" = sem DOM nem three → serve no Worker, no servidor (multijogador) e no benchmark em Node.

## API mínima (para o motor)

```ts
import { BlockWorld, blockNum, blockDef, blockForItem, breakInfo, rollDrops, blockIconURL } from './content/blocks';

// 1) criar (uma vez por mundo)
const bw = new BlockWorld({
  parent: scene,                        // onde penduram as malhas
  tier,                                 // 0..3 de src/core/quality.ts
  terrain: { height: (x, z) => gen.height(x, z) }, // chão natural: macios se fundem nele
  // terrain.density(x,y,z) (>0 sólido) se o pedaço já virou volume (cavernas) — tem prioridade
});

// 2) dados
bw.createBlockChunk(cx, cy, cz);        // opcional: setBlock cria sob demanda
bw.setBlock(x, y, z, 'tijolo', rot);    // id ou num; 0/'ar' tira; rot 0..3 (portas, escadas, baú…)
bw.getBlock(x, y, z);                   // num (0 = ar)  ·  bw.getBlockId(x,y,z) → 'tijolo'

// 3) todo quadro
bw.focus.copy(player.position);         // prioridade: pedaços perto primeiro
bw.remesh();                            // só os sujos, dentro do orçamento do nível (ms)
// a cada ~0,15 s: areia/cascalho/neve fofa caem
const quedas = bw.tickGravity();        // [{from,to,num}] para animar se quiser

// 4) fim
bw.dispose();
```

Outras chamadas úteis:

- `bw.pick(ox,oy,oz, dx,dy,dz, maxDist)` → `{x,y,z,num,nx,ny,nz,dist}` (DDA na grade). Colocar = célula + normal.
- `bw.lightsNear(x,y,z, raio, max)` → blocos que emitem luz (cor, nível 0..15) para um pool de `PointLight`
  (`bw.q.pointLights` diz quantas o nível aguenta; 0 no Mínimo — o brilho do próprio bloco continua).
- `bw.setTier(t)` → troca qualidade em tempo real (refaz materiais se precisar e remonta).
- `bw.unloadChunk(cx,cy,cz)` → `Uint8Array | null` (RLE para salvar) · `bw.loadChunk(cx,cy,cz,bytes)`.
- `bw.remeshAll()` → tudo de uma vez no main thread (tela de carregamento).
- `bw.busy`, `bw.stats` (`chunks`, `tris`, `draws`, `meshMs`, `lastFrameMs`).
- Sem three: `new BlockStore()` + `store.buildJob(chunk, opts, terrain)` + `meshChunk(job)` (servidor/testes).

### Regras de jogo

- `breakInfo(num, ferramenta, nível)` → `{can, drops, seconds}`. Ferramentas: `'pick' | 'axe' | 'shovel' | 'mao'`;
  níveis iguais ao `tier` dos itens do motor: 0 mão, 1 madeira, 2 pedra, 3 cobre, 4 ferro, 5 prata, 6 ouro, 7 cristal; 99 = inquebrável (rocha-mãe).
  Ferramenta certa acelera ×(1 + 0,6·nível); errada/mão demora 3×; abaixo do nível pedido não quebra.
- `rollDrops(num, rand?)` → `[{id, n}]`. "Cavou terra → ganhou terra": ids de item iguais aos do motor
  (`terra`, `pedra`, `areia`, `argila`, `neve`, `carvao`, `min_cobre`, `min_ferro`, `min_prata`, `min_ouro`, `cristal`, `gema`…).
  Grama solta `terra`; folhas soltam `folha` + chance de `muda_<árvore>`; capim solta `fibra`.
- `blockForItem(itemId)` → o bloco que o item coloca (ou `null`). `def.item` é o item do bloco, `def.stack` a pilha.
- Ids de item novos que o motor ainda não tem: os próprios ids dos blocos (`tabuas_pinheiro`, `la_coral`, `vidro_menta`…),
  `cascalho`, `enxofre`, `gema_<nome>` (solarita, lumelita, roselio, verdambar, noctita), `muda_<árvore>`, `cogumelo_luar`, `flor_sol`.

### Propriedades de cada bloco (`BlockDef`)

`id`, `num` (Uint16 nos pedaços — **só acrescente no fim**, nunca reordene), `name()` (t('blk.*')), `cat`,
`render` (Hard/Soft/Cross/Shape), `group` (Opaque/Cutout/Glass), `shape`, `tiles` (top/side/bottom/front),
`hardness` (s), `tool`, `tier`, `drops`, `item`, `stack`, `light` (0..15) + `lightColor`, `flammable` (s de fogo),
`gravity`, `solid` (colisão), `bevel`, `occludes`, `biomes` (dica para o gerador), `rotates`, `tint`.
`CAT_NAMES[cat]()` dá o nome da categoria para a UI.

### Ícones

`blockIconURL(id, 64)` (dataURL em cache para `<img>`), `blockIcon(id, size)` (canvas novo),
`drawBlockIcon(ctx, num, x, y, size)` (desenha direto). Duros = cubinho isométrico com quina viva;
macios = cubinho "fofo"; plantas = sprite com contorno; formas = as próprias caixas (tocha, porta, cerca…).

## Como desenha

- **Pedaço** = 16³ blocos (o pedaço do motor de 32 m = 2×2 colunas de pedaços de bloco; altura livre, `cy` pode ser negativo).
  Cada malha recebe o pedaço + 2 blocos de borda dos vizinhos (`PAD`), então as emendas entre pedaços saem iguais.
  `setBlock` suja o pedaço e os vizinhos cuja borda enxerga a célula.
- **1 draw call por grupo por pedaço**: opaco (duros + macios + formas opacas), recorte (folhas, plantas, trilhos, escada de mão),
  vidro (vidros, gelo, cristais; transparente sem escrever profundidade).
- **Duros** (pedra, tijolo, madeira, metal, vidro, cristal…): face só onde o vizinho não cobre; vizinho do mesmo
  bloco translúcido também some (vidro com vidro = sem emenda). Quinas **convexas** ganham chanfro (tiras a 45° e
  triângulos nos cantos), com largura variando ±30% por bloco (leve irregularidade sem rachaduras — o chanfro é só
  do próprio bloco). Faces sem chanfro viram quads gulosos (greedy) por fatia quando a AO é uniforme.
  AO por vértice (3 vizinhos), diagonal do quad virada conforme a AO; tom ±7% por bloco no shader.
- **Macios** (terra, grama, areia, neve, argila, lama, turfa, cinza, musgo…): ocupação (macios + duros opacos)
  nos centros dos blocos → interpolação trilinear em amostras 2× (0,5 m) → surface nets → relaxamento Taubin
  (alisa degraus sem encolher). Bloco macio sozinho vira um torrão redondo; morros de blocos viram encostas.
  Encostam em blocos duros sem emenda (a face do duro fica, a do macio para nela). O terreno natural entra no campo
  (`terrain.height`/`density`) → a base do morro "afunda" no chão do motor. A cor mistura topo/lado pela normal
  (grama em cima, terra no barranco). Opção `skirt` (desligada) desenha uma saia colorida sobre o chão.
- **Plantas**: dois planos cruzados com UV próprio, posição/tamanho variando por hash, luz "de cima" dos dois lados.
- **Formas**: caixas de `shapes.ts` (tocha, lanterna, poste, cerca/grade e vidraça que se ligam aos vizinhos,
  porta, degraus, meia-laje, tapete, trilho, escada de mão, cama, baú, bancada, fornalha, estalactite/estalagmite,
  cachos de cristal, cacto). Rotação = `meta & 3`.
- **Atlas**: gerado em ~100–200 ms na primeira vez (canvas, sem imagem externa), 1 MB na GPU, mipmaps.
  Projeção planar em coordenadas de mundo (1 ladrilho por bloco) com `textureGrad` (sem costura do mipmap);
  macios usam triplanar no Médio/Alto. Ladrilhos dos macios são "de detalhe" (cor/cor-base): a cor base vai no
  vértice e mistura suave entre materiais. Blocos que brilham somam emissão própria.
- **Worker**: `mesh.worker.ts` (module worker do Vite). O main thread só monta o volume (~0,2 ms) e sobe buffers.
  Sem Worker (WebView antigo/erro) cai sozinho para o main thread com orçamento por quadro.

## Orçamento por nível (`quality.ts`)

| Nível | Chanfro | Relaxa | Textura | ms/quadro | Luzes reais | Raio (pedaços) |
|---|---|---|---|---|---|---|
| 0 Mínimo | não | 2 | amostra reduzida (sem derivadas) | 2 | 0 | 3 |
| 1 Baixo | sim | 3 | completa | 3 | 2 | 4 |
| 2 Médio | sim | 4 | completa + triplanar nos macios | 4 | 4 | 5 |
| 3 Alto | sim | 5 | idem | 6 | 8 | 6 |

## Benchmark

`node scripts/dev/blocos-bench.mjs` (Node, esbuild): cenas da demo (casa + morro + caverna, 20 pedaços)
por nível. Referência (container de desenvolvimento, 1 núcleo): **~2–2,5 ms por pedaço** (mediana 1,7–2,2;
pior 5–7 ms), ~20 mil triângulos no total com chanfro (13 mil sem), 39 draw calls; montar o volume ~0,2 ms.
Bloco maciço de tijolo 16×8×16: ~1 ms / 932 triângulos. Pior caso patológico (xadrez 3D de pedra/terra, toda
célula exposta): 20–100 ms / 35–85 mil triângulos — por isso o Worker.

## Página de debug

`npx vite` → `/scripts/dev/blocos.html?cena=casa|caverna|icones|atlas&tier=0..3&giro=1&cam=x,y,z,ax,ay,az&worker=0`.
Arrastar gira; clique tira o bloco mirado; botão direito coloca o selecionado (`[` `]` trocam); `window.__blocos.world` no console.

## Integração sugerida com o motor (wt-mundo)

1. Criar o `BlockWorld` junto do `VoxWorld` com `terrain.height = gen.height` (ou `density` quando o pedaço já é volume).
2. Itens do inventário: para cada `BLOCKS` com `num > 0`, registrar item `def.item` (nome `def.name`, pilha `def.stack`,
   ícone `blockIconURL(def.id)`), se ainda não existir.
3. Cavar: `pick` → `breakInfo` (tempo/nível) → `setBlock(...,0)` → `rollDrops` no inventário.
   Se o raio não acertar bloco, segue o fluxo atual do subsolo (surface nets do motor).
4. Colocar: `blockForItem(item)` → `setBlock(célula+normal, def.num, rotação pela câmera)`.
5. Colisão: `def.solid` por célula (caixa 1×1×1; formas finas podem usar a caixa do `shapes.ts`).
6. Save/multijogador: `BlockStore.encode/decode` por pedaço; enviar `setBlock` como evento (x,y,z,num,meta).
