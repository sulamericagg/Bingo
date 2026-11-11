# Mundo Aberto — Bichos (animais, monstros e chefes)

Sistema autocontido em `src/games/floresta/world/content/mobs/`. Não importa nada do motor do mundo:
o motor entrega um objeto `MobHost` (alturas, água, bioma, hora, jogador, dano, drops) e chama
`update(dt, camera)` todo quadro. Tudo é original do Bloop World (nomes, formas, mecânicas).

| Arquivo | O quê |
|---|---|
| `types.ts` | `MobDef`, `SpawnRule`, `BodyPlan`, `MobHost`, `PlayerMods`, `BUDGETS` (cotas por qualidade) |
| `animals.ts` / `monsters.ts` / `bosses.ts` | **dados**: 49 animais, 18 monstros (16 + 2 lacaios), 3 chefes (+ cabeças/botões da hidra) |
| `registry.ts` | `ALL_MOBS` (índice = espécie no desenho), `MOB_INDEX`, `mobDef(id)` |
| `model.ts` | modelo low-poly procedural a partir do `BodyPlan` (cor por vértice, pivôs para animação) |
| `render.ts` | 1 `InstancedMesh` por espécie + shader de animação sem esqueleto + atlas de impostores + sombras de bolha |
| `ai.ts` | cérebros: animais (passear/pastar/comer no alto/fugir em bando/manada/revoada/cardume/dormir/isca/namoro) e 13 mecânicas de monstro |
| `boss.ts` | covis (posição determinística) + lutas de chefe (fases, avisos no chão, lacaios) |
| `manager.ts` | `MobManager`: nascimento, sumiço, tique de IA por distância, movimento (A* + direção), combate, domar/criar/montar, projéteis, salvar |
| `fx.ts` | partículas (puf de brilhinhos, fogo, corações, poeira, estrelinhas), avisos no chão (círculo/cone/linha/anel), projéteis |
| `path.ts` | A* em grade 2 m num raio de 24 m sobre o mapa de alturas (buffers fixos, sem lixo) |
| `bossbar.ts` | barra de vida do chefe (DOM, `t()`) |
| `items.ts` | `MOB_ITEMS`: itens novos (couro, carne, peixe, leite, escamas, tesouros dos chefes…) para o catálogo do motor |
| `zoo.ts` + `/dev-zoo.html` | zoológico de depuração (só no `vite` dev) |

## Integração (motor do mundo)

```ts
import { MobManager, MOB_ITEMS, type MobHost } from './content/mobs';

const host: MobHost = {
  heightAt: (x, z) => world.heightAt(x, z),
  floorAt: (x, y, z) => world.floorAt(x, y, z),          // cavernas/construções
  waterLevel: (x, z) => world.waterLevel(x, z),
  biomeAt: (x, z) => WBIOMES[world.biomeAt(x, z)].id as BiomeId, // ids de biomes.ts
  dayTime: () => clock.day,                              // 0..1 (0,5 = meio-dia; noite < 0,23 ou > 0,77)
  nightCount: () => save.nights,
  player: () => ({ x: px, y: py, z: pz, yaw, grounded, alive: hp > 0, held: heldItemId }),
  hurtPlayer: (dmg, kind, fx, fz, knock) => { hp -= dmg; empurra(fx, fz, knock); },   // dmg JÁ reduzido
  effect: (e, s) => status.add(e, s),                    // 'slow' | 'sono' | 'gelo' | 'teia' | 'queimando'
  playerMods: () => ({ armor, fireRes, coldRes, poisonRes, light: temTocha, stealth }),
  drop: (id, n, x, y, z) => inventario.add(id, n),       // ou cria item no chão
  coins: (n) => addCoins(n),
  sound: (s, x, y, z) => sfx(s, x, y, z),
  shake: (a) => cam.shake(a),
  prepareArena: (lair) => world.flatten/carve(lair),     // 1× quando o covil chega a 160 m
  blocked: (x, z, y) => world.solids.blocked(x, z, y),
};
const mobs = new MobManager(host, scene, renderer, tier, hudRoot);
mobs.load(save.mobs);                    // amigos domados + chefes derrotados
// todo quadro, depois de mover o jogador:
mobs.update(dt, camera);
// salvar: save.mobs = mobs.save();     trocar qualidade: mobs.setTier(t)
```

Registre `MOB_ITEMS` no catálogo de itens (forma do ícone = `Shape` do mundo; `cook` = receita de fornalha).
Itens que já existem no mundo (pena, la, ovo, gosma, casca, po_sombra, espinho, cristal, gema, cogumelo…) são reaproveitados pelos ids.

### Combate e ferramentas do jogador

| Chamada | Uso |
|---|---|
| `hitArc(x, z, yaw, alcance, meiaAbertura, dano, kind?)` | espada/ferramenta corpo a corpo; devolve os bichos atingidos |
| `shoot(x, y, z, vx, vy, vz, dano, cor?, gravidade?)` | estilingue/bumerangue/arco (projétil do jogador, `kind: 'ranged'`) |
| `hitSphere(x, y, z, r, dano, kind = 'blast')` | TNT, poções de arremesso |
| `pick(ox, oy, oz, dx, dy, dz, max)` | bicho na mira (raio normalizado) |
| `damage(m, dano, { kind, fromX, fromZ, knock })` | dano direto → `{ dealt, blocked, killed }` |
| `kill(m, drops = true)` | derrota (puf de brilhinhos + drops + moedas) |

Tipos de dano: `melee | ranged | fire | blast | cold | poison`. O gerente reduz o dano que o jogador recebe com
`PlayerMods` (armadura até 85 %, resistências por tipo) **antes** de chamar `host.hurtPlayer`.

### Domar, criar, ordenhar, tosquiar, montar

`interact(m, itemNaMao)` → `{ action, consumed }` (o motor tira `consumed` itens da mão):

- comida de `def.tame.food` → `'taming'` (tentativa) ou `'tamed'` (vira amigo: segue o jogador, não some, entra no save);
- comida de `def.breed` num amigo adulto → `'love'`; dois apaixonados perto → filhote (cresce em ~10 min);
- `'balde'` em quem tem `milk` → `'milk'` (solta leite, recarga 2 min); `'tesoura'` em quem tem `shear` → `'shear'`;
- mão vazia num amigo com `ride` → `'mount'`. Depois: `rideInput(frente, giro, pulo)` todo quadro, `seat(v3)` dá a posição do assento,
  `dismount()`. Montarias: Zebrilha, Cervolume, Pernaltona (plana), Ursoneca, Bambolão, Camelão, Lanudão (escala), Prismalce,
  Capivolta e Musgotarta (nadam), Escalabode (escala), Planadora (plana), Golfibolha (nada), Fofuxo-de-Musgo.
- Bichos atraídos: se o jogador segura a comida certa, os animais por perto se aproximam (isca).
- Aves domadas botam ovos (`lays`).

### Eventos

`mobs.on('kill' | 'tame' | 'breed' | 'birth' | 'mount' | 'dismount' | 'hurtPlayer' | 'bossStart' | 'bossPhase' | 'bossDefeat' | 'toast', cb)`.
`'toast'` traz um texto já traduzido (ex.: "Zebrilha agora é seu amigo!") para o HUD.

## Nascimento (spawnRules) e cotas

Cada `MobDef.spawn` é uma lista de `SpawnRule { biomes, time?: 'day'|'night'|'any', group: [mín, máx], weight, depth?, minNight? }`.
A cada 0,5 s o gerente sorteia um ponto num anel em volta do jogador (`near·0,55 … far·0,75`), lê o bioma
(água rasa → `'rio'`, funda → `'oceano'`; jogador ≥ 5 m abaixo da superfície → `'caverna'` com a profundidade),
filtra as regras e sorteia por peso; o grupo nasce junto (manada/revoada/cardume com o mesmo `group`).
Monstros só nascem à noite ou no subsolo; ao amanhecer os da superfície fogem e somem num puf (sem drops).

| Qualidade (`Tier`) | animais | monstros | modelo 3D até | impostor até | some além | partículas | A*/quadro |
|---|---|---|---|---|---|---|---|
| 0 Mínimo | 22 | 8 | 26 m | 70 m | 92 m | 120 | 1 |
| 1 Baixo | 36 | 12 | 34 m | 95 m | 112 m | 220 | 2 |
| 2 Médio | 64 | 18 | 46 m | 125 m | 140 m | 400 | 3 |
| 3 Alto | 110 | 28 | 62 m | 165 m | 175 m | 640 | 4 |

Dificuldade dos monstros: `lvl = 1 + min(1,5; noites·0,06) + min(1,5; profundidade/40) (+0,1 à noite)`
→ vida × lvl e dano × √lvl.

## Desempenho

- **Instancing**: 1 draw call por espécie visível (modelo 3D), 1 para todos os impostores, 1 para as sombras, 3 para efeitos.
- **Animação sem esqueleto** no vertex shader: cada vértice guarda o pivô e a "parte" (corpo, cabeça, 4 pernas/braços,
  cauda, asas, orelhas, pescoço); por instância 3 `vec4` (ciclo do passo, andadura, sono, piscar, pescoço,
  bater de asas, nado, bote, fantasma, achatamento, olhar, semente). Sombreado chapado (`flatShading`), sem normais.
- **LOD**: impostores de um atlas 2048×1024 renderizado 1× no início (vista 3/4, espelhado conforme a direção),
  com escurecimento pela hora do dia. Bichos fora do frustum não entram.
- **IA com tique reduzido**: < 24 m todo quadro; < 60 m a cada 0,15 s; longe a cada 0,4 s (e o movimento também só no tique).
- **A\*** só quando o caminho direto trava (cota por quadro); separação entre vizinhos por grade espacial de 8 m.

Medições (zoológico `?mode=perf`, Chrome headless com SwiftShader — GPU por software, então o tempo de GPU não vale; os números de CPU sim):

| Cena | animais + monstros | 3D / impostores | draw calls (cena toda) | triângulos | `MobManager.update` |
|---|---|---|---|---|---|
| Alto, noite (`t=0.95`) | 100 + 20 | 60 / 60 | 51 | 82 k | ~1,0 ms (IA 0,06 + mover 0,21 + sincronizar 0,22) |
| Alto, dia (`t=0.45`) | 100 + 12* | 68 / 41 | 50 | 55 k (bichos) | ~0,45 ms |
| Baixo, dia | 100 + 12* | 1 / 108 | 4 | 36 k (cena) | ~0,36 ms |

\* de dia os monstros da superfície fogem e somem.

Início: 72 modelos (média ~750 triângulos) + atlas de impostores ≈ 90 ms (SwiftShader). Um A\* expande no máx. 900 nós (grade 21×21).

## Monstros (mecânicas)

| Monstro | Onde | Mecânica |
|---|---|---|
| Gosmito | bosque/pântano à noite, cavernas | **divide** em 2 menores ao ser derrotado (2 gerações) |
| Pulapulga | savana/deserto à noite | **pula** em arco no jogador (aviso: se encolhe) |
| Cuspilho | pântano/tropical | **cuspidor** à distância (gosma que deixa lento), mantém distância |
| Cavucão | deserto, cavernas | **cava** (imune enquanto embaixo), aviso em círculo sob o jogador, depois fica tonto |
| Zumbizim | pântano/tropical à noite | **enxame** que circula e dá rasantes |
| Casco-Guarda | cavernas, praias | **escudo**: frente bloqueia 90 % (exceto explosão) e gira devagar — flanqueie |
| Fantasmim | outono/cogumelos à noite | **fase**: fica intangível e passa para as costas do jogador |
| Pedrolho | montanhas/cavernas | finge ser pedra; **investida** em linha avisada; tonto ao bater |
| Espantalhão | outono (noite 1+) | **teleporta** para as costas do jogador |
| Nevasquinho | neve à noite | bolas de neve que **congelam** (`gelo`) |
| Fungo-Bufa | cogumelos | nuvem de esporos (`sono`) com aviso em círculo |
| Lanterninha | cavernas fundas | enxame que **foge da luz** (`PlayerMods.light`) |
| Cristalaranha | cavernas/cristal | **teia** à distância (`teia`) |
| Escorpinho | deserto à noite | ferrão venenoso (lento) |
| Espiadinha | noite 3+ | **só anda quando o jogador não está olhando** |
| Girinão | pântano (e lacaio da hidra) | enxame aquático |
| Brasinha / Pedrisco | lacaios da dragoa / do colosso | enxame de fogo / rastejador |

## Chefes e preparo

Covis: no máximo um por célula de 900 m (80 % das células, nunca a < 420 m da origem; fora d’água), tipo pelo bioma:
dragoa em montanhas/deserto/savana, colosso debaixo dos biomas frios/mágicos (`y = superfície − 34`, o motor escava a câmara
em `prepareArena`), hidra em pântano/tropical/bambuzal. `mobs.lairs` lista os covis conhecidos; `isDefeated(key)`;
`startBoss(lair)` força uma luta (testes/eventos). Se o jogador se afastar 70 m além do covil, a luta é reiniciada.
Dicas para a UI em `BOSS_PREP` (armadura recomendada, poções, ferramentas, dica traduzida).

- **Brasalume, a Dragoa-Lanterna** (900 PV): F1 no chão — sopro em cone com aviso de 1,25 s (fogo, `queimando`) e rabada em círculo;
  F2 (< 66 %) voa: 3 rasantes em linha avisada deixando poças de fogo, depois mergulha num TOMBO (aviso em círculo, onda de choque)
  e fica tonta 3,5 s (dano × 1,5). No ar, golpes corpo a corpo não pegam: precisa de estilingue/bumerangue/arco.
  F3 (< 33 %) furiosa: sopros mais rápidos, Brasinhas a cada 18 s e um tombo a cada 26 s. Resistência a fogo (×0,2).
  Tesouro: escamas de dragoa, Coração de Brasa, gemas, ouro e 50 % de Ovo de Dragoa.
- **Colosso Geodo** (1100 PV): casca × 0,3; explosivos × 0,9; depois do soco o núcleo fica exposto 2,6 s (× 1,6).
  Pedras arremessadas com aviso no ponto de queda; F2 (< 60 %) ondas de choque em anel (só acertam quem está no chão — pule);
  F3 (< 30 %) estalactites (3 círculos a cada 3,2 s) e Pedriscos.
- **Nenúfera, a Hidra-Lírio** (420 PV + 3 cabeças de 110): o bulbo só apanha quando as 3 cabeças-flor murcham (7 s);
  **a reviravolta**: cada cabeça murcha solta um Botão-Cura que, se não for colhido em 6 s, desabrocha, cura o bulbo
  e revive uma cabeça. Cabeças mordem (aviso em círculo) ou cospem sementes. F2 (< 50 %) mergulha (fica intangível),
  marca bolhas sob o jogador e emerge lá com dano + Girinões.

## Zoológico de depuração

`npm run dev` e abra `/dev-zoo.html?mode=…` (`grid`, `savana`, `night`, `dragon`, `golem`, `hydra`, `perf`; `&tier=0..3`,
`&anim=idle|walk|run|graze|sleep|attack|fly`, `&phase=1..3`, `&t=0..1`). Arraste para girar, roda para zoom, WASD move o
"jogador" (senão o piloto automático corre, desvia de avisos e atira). `window.__zoo` expõe o gerente para testes.
Os botões do zoológico são de depuração e não são traduzidos de propósito.

## Ideias para depois

Ovo de Dragoa → filhote de dragoa domável; selas/armaduras de montaria; bichos de estimação nomeados; sons por espécie;
variação de cor por bioma via `instanceColor`; impostores com 2 quadros de passo.
