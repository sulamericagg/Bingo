# Mundo Aberto — Veículos fabricáveis

Sistema autocontido de veículos modulares para o sandbox do Bloop World
(`src/games/floresta/world/content/vehicles/`). Não importa nada do motor do mundo: o motor
implementa uma interface pequena (`VehicleHost`) e chama três funções por quadro.

```
peças (itens vp_*)  ──fabricar──▶  garagem (grade do chassi)  ──montar──▶  Vehicle (cannon-es)
   parts.ts            crafting.ts      garage.ts / design.ts                vehicle.ts + manager.ts
```

| Arquivo | O que tem |
|---|---|
| `parts.ts` | 30 peças (chassis P/M/G, 4 rodas por nível, esteira, motores pedal → lenha → combustível → elétrico, banco, caçambas, compartimento, tanque, engate, guindaste, broca, lâmina, arado, boia, pontão, hélice, rotor, asa, farol, blindagem), receitas, combustíveis, itens novos (`combustivel`, `bateria`, `kit_reparo`) |
| `design.ts` | Formato do projeto, encaixe na grade (camadas deck/under, regras de lugar, espelho, giro), validação, ficha técnica, layout físico, (de)serialização |
| `blueprints.ts` | 10 plantas: carrinho de mão → carroça → kart → picape → trator + reboque → caminhão-tora → escavadeira → barco → ultraleve → helicóptero |
| `crafting.ts` | `craft`, `craftMissing`, `assemble` sobre uma interface de inventário |
| `vehicle.ts` | Veículo em jogo: física, combustível, dano, carga, ferramentas, salvar |
| `manager.ts` | Criar/remover, limites por nível, estacionar (dormir), entrar/sair, salvar tudo |
| `camera.ts` | Câmera de perseguição com colisão (terreno + corpos estáticos) |
| `hud.ts` | Painel de direção (joystick, botões só com ícone, teclado) |
| `garage.ts` | Garagem tela cheia (Montar / Fabricar / Plantas / Meus) com prévia 3D |
| `models.ts` | Malha única por veículo, rodas instanciadas, giratórios, braço do guindaste |
| `index.ts` | Tudo que é público (importe só daqui) |
| `dev/` | Página de depuração `dev-veiculos.html` (terreno com rampa e lago, inventário trapaça) |

## 1. Itens e receitas no catálogo do motor

Cada peça é um item `vp_*`. As receitas são "sem padrão" (`{ out, n, st, ing }`), o mesmo formato
de `Recipe` em `world/items.ts`; estações usadas: `bancada` (nível 0) e `oficina` (o resto).

```ts
import { PARTS, VEH_RECIPES, EXTRA_ITEMS, vItemName } from './content/vehicles';
for (const p of PARTS) add({ id: p.id, name: p.name, cat: 'peca', stack: 8, ic: { s: SHAPE_OF[p.cat], c: p.color, c2: p.color2 } });
for (const x of EXTRA_ITEMS) add({ id: x.id, name: x.name, cat: 'peca', stack: 16, ic: { s: 'kit', c: x.color } });
for (const r of VEH_RECIPES) RECIPES.push({ out: r.out, n: r.n, st: r.st, ing: r.ing });
```

Materiais usados (ids do catálogo do mundo): `tabua graveto corda tecido pedra resina gosma barra_ferro
barra_cobre barra_prata engrenagem fio cristal cristal_lap vidro tocha carvao tora`.
Combustíveis (`FUEL_ITEMS`): motor a lenha aceita `carvao` (40), `tora` (14), `tabua` (5), `graveto` (2);
motor a combustível aceita `combustivel` (60); elétrico aceita `bateria` (80). Pedal não gasta nada.
Ícones prontos em SVG: `partIcon(id)` (peças, extras e materiais).

## 2. `VehicleHost` — o que o motor fornece

```ts
const host: VehicleHost = {
  world: phys.w,                          // CANNON.World (gravidade −20, allowSleep = true)
  material: phys.groundMat,               // atrito chassi × chão
  group: VEH_GROUP,                       // = G_LOG (2): já colide com chão/estáticos/toras do Phys
  waterLevel: (x, z) => world.isWater(x, z) ? world.waterLevel(x, z) : -Infinity,
  heightAt: (x, z) => world.heightAt(x, z),
  dig: (x, y, z, r) => { const m = new Map<number, number>(); vox.edit(x, y, z, r, 0, MAX_HARD, m); return matsToItems(m); },
  flatten: (x, z, r, y) => world.deform(x, z, r, 0, 0, y),
  till: (x, z, r) => farm.till(x, z, r),  // opcional
  findGrabbable: (x, y, z, r) => nearestLogBody(x, y, z, r), // opcional (padrão: corpo dinâmico mais perto)
  onItems: (v, items) => inventory.addAll(items),            // o que não coube no compartimento
  sound: (id, v) => audio.play(SFX[id]),
  say: (text) => notify(text),
};
```

Importante no motor:
- **Chão físico perto dos veículos:** `Phys.syncGround(chunks, pts)` só cria heightfield/trimesh em volta
  dos pontos passados — inclua `x, z` de cada veículo **acordado** (`!v.parked`) em `pts`.
- As rodas são raios (RaycastVehicle) e acertam qualquer corpo com `collisionResponse`; o chão do Phys tem
  `collisionFilterMask = G_LOG`, por isso o chassi usa o grupo `G_LOG`.
- **Toras:** qualquer corpo dinâmico dentro de uma caçamba vira carga (`v.cargo`, `v.cargoMass`).
  Não "congele" (b = null) toras que estão em `v.cargo` de algum veículo.

## 3. Laço por quadro

```ts
const mgr = new VehicleManager(host, scene, tier);   // tier 0..3 = qualidade
const chase = new ChaseCam(host);
let hud: DriveHud | null = null;

function frame(dt) {
  mgr.focus.set(player.x, 0, player.z);
  hud?.apply(dt, keys);        // joystick/teclado → v.input
  mgr.preStep(dt);             // forças, combustível, ferramentas, estacionar
  phys.step(dt);               // world.step
  mgr.postStep(dt);            // copia física → malhas
  if (mgr.driving) chase.update(camera, mgr.driving, dt);
  hud?.update(dt);
}
```

Entrar / sair:

```ts
const v = mgr.nearest(player.x, player.y, player.z);           // perto do banco (3,5 m)
if (v) { mgr.enter(v); hud = new DriveHud(root, v, {
  exit: () => { const p = mgr.exit(); hud!.destroy(); hud = null; player.teleport(p); },
  refuel: () => refuelFromInventory(v),                        // v.refuel(itemId, n) → usados
  repair: () => inv.take('kit_reparo', 1) && v.repair('kit_reparo'),
  hitch: () => (v.hitch ? v.unhitch() : mgr.trailerNear(v) && v.hitchTo(mgr.trailerNear(v)!)),
  canHitch: () => !!v.hitch || !!mgr.trailerNear(v),
  camDrag: (dy, dp) => chase.drag(dy, dp),
  horn: () => audio.play('horn'),
}); chase.reset(); }
```

## 4. Garagem

```ts
const g = openGarage(root, {
  inv,                       // { count, take, give } — o inventário do jogador
  station: 'oficina',        // ou 'bancada' (só peças nível 0)
  maxTier: progressTier,     // esconde peças/plantas acima do nível
  onBuild: (design) => mgr.spawn(design, x, z, yaw),   // peças já descontadas
  onClose: () => resumeGame(),
});
```

- Toque uma peça na bandeja e solte na grade; a sombra fica verde/vermelha. ⇋ espelha (padrão ligado),
  ⟳ gira, borracha tira; tocar numa peça colocada sem nada escolhido "pega de volta".
- Ficha ao vivo: massa (kg), potência, velocidade máx., subida máx., consumo por km (em itens),
  alcance, toras, vida/blindagem. Erros e avisos em linguagem simples.
- "Montar!" fabrica sozinho as peças que faltam (se houver material) e desconta do inventário.
- Projetos salvos: `localDesigns` (localStorage); troque por outro `DesignStore` se quiser no save do mundo.

## 5. Física e regras

- Força motriz = `potência × 70 / max(v, 1,5)` (curva de potência constante), rolagem `0,03·m·g`,
  arrasto `(0,3 + 0,25·largura)·v²`. O acelerador pede uma **velocidade** (cruzeiro): subir carregado
  exige mais força → mais combustível. Consumo = `burn × (F·v / 70 + 8% da potência)`.
- Massa = chassi + peças + piloto + **carga física** (toras na caçamba). Freio é fixo pelo veículo vazio
  (carregado para mais longe); a suspensão compensa a carga (sem bater no fim de curso).
- Esteiras: rodas escondidas + tração diferencial (gira parado). Barco: empuxo por ponto nas boias,
  arrasto lateral (quilha), leme. Helicóptero: sustentação com controle de razão de subida, fica de pé.
  Avião: sustentação ∝ v², manche pede razão de subida, curva inclinada.
- Dano por impacto (> 7 m/s), reduzido pela blindagem; vida 0 = quebrado (não liga). `kit_reparo` cura
  tudo, `barra_ferro` +25%.
- Ferramentas: broca (segure: chama `host.dig` à frente, guarda no compartimento), lâmina (liga/desliga:
  `host.flatten` na altura das rodas), arado (`host.till`), guindaste (modo guindaste: joystick move o braço,
  ▲▼ guincho, ✊ pega/solta com vínculo limitado pela capacidade), basculante (`v.dump()`), engate.
- Desvirar (botão aparece de cabeça para baixo e parado).

## 6. Desempenho

- 1 malha (cores por vértice, material compartilhado) + 1 InstancedMesh de rodas por veículo; só
  hélice/rotor/broca/guindaste ficam separados. Um único holofote (só o veículo dirigido, faróis ligados).
- Estacionar automático: sem piloto e parado 1,5 s → corpo dorme e o RaycastVehicle sai do `preStep`
  (custo ~0). Acorda com batida, ao entrar ou ao engatar.
- Limites por nível (`VEH_CAPS`): máx. veículos 6/10/16/24, acordados 2/3/5/8, distância de desenho
  60/90/130/180 m, de simulação 45/60/80/110 m.

## 7. Salvar

```ts
save.vehicles = mgr.save();   // { v: 1, list: [{ d: <projeto codificado>, x, y, z, q, fuel, hp, items }] }
mgr.load(save.vehicles);
```

## 8. Página de depuração

`npm run dev` → `/dev-veiculos.html`. Inventário trapaça (999 de cada material), botão Oficina,
plantas prontas, "+6 toras", rampa de 14°, lago. `window.__mveic` expõe a API de teste
(`craftPickupParts`, `assemblePickupByHand`, `build`, `loadLogs`, `runSlopeSync`, `spawnBp`, `simulate`…).

Resultado medido (picape montada peça a peça, alvo 6 m/s, rampa 14°, 53 m, +10 m de altura):

| | massa | tempo | vel. média | combustível |
|---|---|---|---|---|
| vazia | 30,5 (1525 kg) | 9,4 s | 5,7 m/s | 2,58 |
| 6 toras | 48,5 (2425 kg) | 11,2 s | 4,7 m/s | 4,40 (+70%) |

Freio de 8 m/s: 2,5 m vazia × 3,4 m carregada. 0→8 m/s: 0,8 s × 1,8 s.
