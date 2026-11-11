# Natureza 3D compartilhada (`src/3d/nature/`)

Módulo único de vegetação, chão e efeitos de árvore usado pelo **Mundo Aberto** (Lenhadores),
**Lenhadores 3D**, **Noites** — e pronto para outros jogos (ex.: **Garimpo**). Tudo é procedural
(nenhum arquivo de asset), gerado uma vez e em cache. `import { ... } from '../../3d/nature'`.

## Orçamento por nível (`natureQ(tier)`)

| Tier | Grama de lâminas | Chão | Tufos de folha | Sombras de contato |
|---|---|---|---|---|
| 0 Mínimo | não | 1 amostra de textura (camada mais forte) | não | sim |
| 1 Baixo | 4/m², 15 m, 1 tri/lâmina | 2 camadas misturadas | não | sim |
| 2 Médio | 9/m², 22 m, 3 tri/lâmina | 2 camadas + manchas grandes | sim | sim |
| 3 Alto | 14/m², 30 m | idem (+ sombras reais do jogo) | sim | sim (mais leves) |

Chame `GrassField.setQuality(natureQ(t).grass)` quando o `QualityGovernor` mudar de nível.

## Texturas de chão (`textures.ts`)

10 camadas de 256 px, repetem sem emenda, mipmap, sRGB:

`grass` · `dryGrass` · `forestFloor` · `snow` · `dirt` · `redDirt` (terra vermelha amazônica) · `mud` · `gravel` · `stone` · `sand`

```ts
import { natureTexture, natureTextureArray, terrainMaterial, TL, NL, splatAttributes, setSplat, lerpSplat, natureAnisotropy } from '../../3d/nature';

// 1) textura comum num material qualquer (ex.: chão de uma mina, pilha de cascalho)
const mat = new THREE.MeshLambertMaterial({ map: natureTexture('gravel') });
mat.map!.repeat.set(4, 4);

// 2) terreno misturado por vértice (o que o mundo aberto usa)
const terrain = terrainMaterial({ tier });          // MeshLambertMaterial
const SP = splatAttributes(geometry, vertexCount);   // cria aSplat0..2 (Uint8 ×4)
const w = new Float32Array(NL);
for (let v = 0; v < vertexCount; v++) {
  w.fill(0);
  w[TL.grass] = 1;                                   // cobertura do bioma
  lerpSplat(w, TL.redDirt, cavaAqui(v));             // escavação → terra vermelha
  lerpSplat(w, TL.stone, inclinacao(v));             // encosta → pedra
  setSplat(SP, v, w);                                // normaliza e grava
}
// a cor por vértice continua obrigatória (tom do bioma / sombreamento assado)
natureAnisotropy(renderer);                          // filtro 4× (chão nítido em ângulo rasante)
```

Como o shader mistura: por pixel ele pega as **2 camadas de maior peso** (Mínimo: só 1), projeta a
textura no mundo pela normal dominante (topo = XZ, paredes = XY/ZY) e faz
`cor = mix(corDoVértice × textura/média, textura, OWN[camada])` — a cor do vértice manda no tom
(grama roxa no bioma de cogumelos, branca no cristal) e a textura dá a estrutura. Malhas sem pesos
(cavernas): `terrainMaterial({ tier, noSplat: true, topLayer: 'grass' })` — topo pela normal, paredes de pedra/terra.

## Vegetação

- `natureTree({ kind, h, trunk, leaf, leaf2, lod })` — `oak | broad | blossom | cloud | pine | snowpine | birch | acacia | palm | willow | twisty | bamboo`; ~190–360 tri perto, 48–144 longe (`lod: 1`). Copas de bolhas com normais "da copa inteira" e oclusão na cor.
- `natureLeafCards(treeGeo, 5)` + `leafCardMat()` — tufos de folhas em billboard na borda da copa (Médio/Alto), mesma matriz de instância da árvore.
- `natureBush`, `natureBerryBush`, `natureFlowers`, `natureFern`, `natureRock`, `natureTuft` — decoração instanciada; partes cinza recebem a cor da instância (`natureMat({ tintGray: true })`).
- `natureMat({ amp, y0, rustle, wrap, tintGray })` / `natureWind(mat, …)` — vento no vertex shader (`windTime.value = tempo` por quadro) e luz envolvente.
- `GrassField(scene, { height, cell }, natureQ(tier).grass)` — grama de lâminas em canteiros de 16 m (uma malha cada), `update(camX, camY, camZ, pushX, pushZ, pushR)` por quadro, `invalidate(x0,z0,x1,z1)` quando o chão muda.
- `BlobShadows`, `SkyDome`, `groundDetail` — sombras de contato, céu em degradê, detalhe extra.

## Corte de árvore (`fx.ts`)

- `hitTreeShake(x, z)` a cada golpe — a copa daquela árvore chacoalha (uniform no shader do vento; nada muda nas instâncias). `natureTick(dt)` por quadro.
- `LeafBurst(scene)` — chuva de folhas instanciada (uma chamada de desenho, sem alocar por quadro): `emit(n, x, y, z, raio, cor, velocidade)`, `update(dt)`, `ground = (x, z) => altura`.
- Sequência usada no mundo aberto (`worldgame.ts` `startFall/stepFalls`): lascas + estalo → o toco aparece já → range (0,4 s) → queda acelerando em volta do corte, para longe do jogador → quique da copa + chuva de folhas + poeira → assenta → copa se desfaz em folhas e o tronco vira toras que saltam e rolam (viram itens). Lenhadores 3D usa física (cannon) + as mesmas folhas; Noites usa a mesma curva com quique.

## Lições do Minecraft aplicadas

- **Malhas por pedaço**: chão em pedaços de 32 m com 3 níveis de detalhe e saia; grama em canteiros mesclados (milhares de lâminas = 1 chamada); árvores/deco em `InstancedMesh` por espécie.
- **Um atlas, poucos materiais**: todo o chão é um `DataArrayTexture` + 1 material; folhas num atlas 2×2.
- **Folhagem barata com alphaTest** (sem ordenar transparência): tufos de folha e folhas voando.
- **AO por vértice**: oclusão assada na cor (vales/buracos do relevo, miolo/embaixo das copas, base dos troncos).
- **Neblina escondendo o LOD**: a troca perto/longe das árvores e o fim da grama ficam dentro da neblina; a grama some encolhendo as lâminas, sem "pop".
- **Texturas com mipmap + anisotropia 4×**: sem cintilar nem borrar ao longe.

Dev: `scripts/dev/nature.html` (abre qualquer jogo direto com `?g=world|fl3d|noites&tier=…`), `scripts/dev/shoot-nature.mjs` (screenshots/FPS), `scripts/dev/shoot-fell.mjs` (quadros de uma queda).
