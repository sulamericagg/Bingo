# Mundo Aberto — motor e interfaces para módulos de conteúdo

Pasta: `src/games/floresta/world/`. Tudo em pt-BR; textos de UI via `t('chave', 'Português')`.

## Visão geral

| Arquivo | O quê |
|---|---|
| `gen.ts` | Gerador determinístico: altura natural `height(x,z)`, clima e pesos de 12 biomas (`weights`), acampamentos e trilhos. `CH = 32` m por pedaço, `WATER_Y = 0`. |
| `biomes.ts` | 12 biomas (bosque, nevado, tropical, cerejeiras, cogumelos, cristal, **savana** (6), pântano, deserto, outono, montanha, bambu) e espécies de árvore. |
| `chunk.ts` | Pedaço 32×32 m: heightfield (`h` atual, `base` natural), árvores, pedras, plantinhas, malha com LOD. `vol` = subsolo volumétrico (ou null). |
| `stream.ts` (`World`) | Carrega/descarrega pedaços em volta do jogador, instâncias de árvores, água por pedaço (só onde o terreno NATURAL fica abaixo de `WATER_Y`), consultas de altura/chão, `solids` (colisão). |
| `vox.ts`, `voxworld.ts` | Subsolo: campo de densidade 3D (1 m, seções 32×16×32, int8 ×10) com cavernas, ravinas, camadas, minérios por profundidade, lava (y ≤ −52), aquíferos; malha por *surface nets*; fila de remalha com orçamento ms/quadro; diffs esparsos no save. `BED_Y = −64` (rocha-mãe inquebrável), `TOP_Y = 128` (limite de construção). |
| `collide.ts` (`Solids`) | Caixas orientadas com faixa de altura em hash espacial de 8 m. Construções, máquinas e acampamentos registram caixas; veículos são caixas dinâmicas. `resolve()` empurra um cilindro; topo de caixa vira chão (degrau ≤ 0,55 m). |
| `phys.ts` (`Phys`) | cannon-es só para objetos soltos (toras etc.): heightfields dos pedaços perto, trimesh das seções escavadas perto de algo físico (1 por quadro), troncos como cilindros de um pool, veículos/jogador como corpos cinemáticos. |
| `items.ts` | Catálogo (`ITEMS`, `ITEM` por id) e receitas (`RECIPES`, `matchGrid`, `layout`, `cost`, `SMELT`). |
| `itemicons.ts` | `iconURL(id)` — ícone desenhado em canvas a partir de `ItemDef.ic`. |
| `engine.ts` | **Interface pública**: `MundoAPI`, `Entity`, `Placeable`, `MundoModule`, eventos. |
| `worldgame.ts` | O jogo (jogador, veículos, ferramentas, HUD) — implementa `MundoAPI`. Não importar de módulos de conteúdo. |

## Como um módulo de conteúdo entra

```ts
import { registerModule, type MundoAPI } from '../engine';
registerModule({
  name: 'mobs',
  install(api: MundoAPI) {
    api.registerItem({ id: 'chifre', name: () => t('mundo.i.chifre', 'Chifre'), cat: 'rec', stack: 99, ic: { s: 'spike', c: '#fff' } });
    api.registerRecipe({ out: 'chifre', n: 1, st: 'bancada', ing: [['pedra', 2]] });
    api.on('tick', (dt) => { /* spawn perto do jogador */ });
    api.on('chunkUnload', (c) => { /* some com o que estava lá */ });
  },
});
```
`registerModule` deve rodar antes de o mundo abrir (importe o módulo em `world/content/index.ts`, que o motor importa).

### Regras
- **Desempenho**: alvo 30+ fps em celular médio. Sem alocação no laço quente (reaproveite `Vector3`/arrays), `InstancedMesh` para coisas repetidas, LOD por distância, nada de `new THREE.*` por quadro. Leia `api.tier` (0–3) para cortar detalhe.
- **Terreno**: use `floorAt(x, y+1, z)` para pousar coisas (respeita cavernas/construções); `heightAt` é só o topo da superfície. `dens > 0` é sólido. Edite só com `editTerrain`.
- **Água**: `isWater(x,z)` / `waterLevel(x,z)` (−∞ fora d'água). Aquíferos/lava subterrâneos: `matAt(...) === M.Agua / M.Lava`.
- **Entidades**: `api.addEntity(e)`; o motor chama `update(dt, api)` todo quadro (devolva `false` para remover) e `dispose` ao remover/descarregar. Dano no jogador: `api.hurtPlayer(n, motivo)`. O jogador atinge entidades com `hostile` ou `hit` definidos (armas/ferramentas).
- **Save**: `api.on('save', out => out.meuModulo = {...})` e `api.on('load', d => ...)`. Mantenha pequeno (diffs, não o mundo inteiro). Entidades com `save()` são gravadas automaticamente pelo `kind` se o módulo registrar `api.on('load')` para recriá-las.
- **Rede (multiplayer)**: o anfitrião é a autoridade das entidades; só ele roda spawn/IA. Use `api.isHost` (quando existir) antes de spawnar.
- **Arte original**: nada de cubos/voxel copiados, nomes, bichos, itens, UI ou sons de outros jogos. Estilo Bloop World (contorno roxo `#2a0b5c`, cores vivas, formas fofas).
- **Classificação Livre**: dano cartunesco, sem sangue — bichos "viram fumacinha/estrelas".

## Materiais do subsolo (`M` em vox.ts)
`Topo 1, Terra 2, Argila 3, Areia 4, Pedra 5, Funda 6, RochaMae 7, Carvao 8, Cobre 9, Ferro 10, Prata 11, Ouro 12, Cristal 13, Gema 14, Neve 15, Agua 20, Lava 21`. `MATS[m].hard` = nível mínimo de picareta (1 madeira … 7 cristal), `MATS[m].drop` = id do item.

## Itens e receitas
- `ItemDef`: `id, name(), cat, stack, ic {s,c,c2}` + opcionais `tool, tier, dur, dmg, armor, food, fuel, place, fill, crop, veh`.
- `Recipe`: `out, n, st ('mao'|'bancada'|'bigorna'|'oficina'|'fornalha')` e `pat`+`key` (com forma, casa em qualquer posição e espelhado) ou `ing` (sem forma). Fornalha: `ing` de 1 item + `time` (s).
- Grade: 2×2 no inventário (`mao`), 3×3 na bancada/bigorna/oficina.

## Eventos (`api.on`)
`chunkLoad, chunkUnload, tick, dayChange, mined, boom, death, save, load` — assinaturas em `engine.ts`.

## Sobrevivência, saves e rede (estado atual)

- `survival.ts` (`Sandbox`) implementa a `MundoAPI`: inventário (`inv.ts`, 9 + 27 + 4 roupas), telas (`invui.ts`: arrastar/soltar, tocar-pegar/tocar-pôr, segurar = metade, toque duplo = mover rápido, grade 2×2/3×3, livro de receitas, fornalha, baú, catálogo criativo), construção com encaixe (`build.ts`), bichos (`mobs.ts`), trilhos/vagonete (`rails.ts`), dia/noite (12 min), vida/fome/fôlego, cama = casa.
- Blocos (`content/blocks`): itens sem peça própria que têm `blockForItem` viram blocos; quebrar usa `breakInfo` (tempo por ferramenta/nível) e `rollDrops`; colisão via `World.extraSolid/extraFloor`; save em `sb.blk` (RLE base64 por pedaço de bloco).
- Prioridade ao usar o item na mão: bicho na mira → bloco (colocar/quebrar) → peça/objeto (`place`) → kit de veículo → dinamite → estilingue/bumerangue → enchimento suave (`fill`) → enxada (canteiro) → árvore → cavar o terreno.
- Saves: `worlds.ts` — índice `bw-mundo-idx` + um save por mundo `bw-mundo-w:<id>` (opções de criação em `save.gen`, diffs do subsolo por seção em `chunks[k].v`, peças/baús/inventário em `save.sb`). O save antigo `bw-floresta-mundo` continua como "Mundo dos Lenhadores (clássico)".
- Rede (`net.ts` + `server/mundo.ts`): operações guardadas no DO e repetidas por quem entra — `{k:'e'}` terreno (x,y,z,r,f,h — idempotente, reaplicada quando o pedaço carrega), `{k:'b'}` bloco, `{k:'pa'|'pd'|'pu'}` peças/portas/baús. Estado do jogador ≤ 10/s; o anfitrião manda retratos dos bichos (5/s) e os convidados veem "fantasmas" (golpes viram `{t:'mg',k:'hitm'}`). Minijogos em `mini.ts` (mensagens `mg`).
- Bichos (`content/mobs`): no jogo solo o `Sandbox` cria o `MobManager` com um `MobHost` (chão com cavernas/blocos, água, bioma, hora, noites, armadura/luz, drops no inventário, covis escavados no subsolo). Golpes: `damage` no bicho na mira; estilingue/bumerangue: `shoot`; dinamite: `hitSphere`; botão verde: `interact` (domar/criar/ordenhar) e `mount`/`dismount` (montaria com `rideInput`/`seat`). Save em `sb.mobs`. Online continua com os bichos simples sincronizados pelo anfitrião (`mobs.ts`).
