# FPKIT — o "andar" de 1ª pessoa compartilhado (`src/3d/fpkit/`)

O andar da **Cozinha Maluca** é a referência ("limpo, anda bonito"). Ele foi extraído para um kit
pequeno, sem dependência de jogo, e a Cozinha passou a usá-lo **com o mesmo feel bit a bit**
(A/B abaixo). Todo jogo novo de 1ª pessoa deve usar este kit em vez de reescrever câmera/colisão.

```ts
import { FpController, FpCamera, FpAim, HeldItem, GridCollider, AabbCollider, HeightGround, fpTuning } from '../../3d/fpkit';
```

## Peças

| peça | o que faz | depende de |
|---|---|---|
| `FpController` | direcional → velocidade com aceleração/frenagem exponencial (`v += (alvo−v)·min(1, dt·k)`, k = `accel` com direcional / `decel` sem), corrida, pulo, gravidade, colisão plugável, empurrão suave entre jogadores, `speedK` 0..1 | nada (só números) |
| `FpCamera` | yaw/pitch com limite, balanço de passo (fase += `bobRate`·speedK·dt; Y = sin(2·fase)·`bobAmp`·speedK; rolagem = cos(fase)·`rollAmp`·speedK), tremor, tranco, altura do olho (+ suavização em degraus), **camClamp** (olho nunca entra no móvel) | `THREE.Camera` |
| `FpAim` | raio do centro da tela; com a câmera parada (sem giro, speedK < 0.05) o pick caro só roda a cada 3 quadros | `THREE.Ray` |
| `HeldItem` | viewmodel de qualquer `Object3D` filho da câmera: atraso de mola ao olhar, respiração, passo em "oito", golpes `swing`/`thrust`/`raise` (mesmas constantes da `Hand`) | `Object3D` |
| `GridCollider` | mundo em grade: `isOpen(gx, gz)` em coordenadas de célula fracionárias; corpo = 4 cantos (o `moveGrid` da Cozinha) + `clampPoint` (o `camClamp` da Cozinha) | — |
| `AabbCollider` | lista de caixas `{x0,z0,x1,z1,y0?,y1?}`; sweep em subpassos ≤ r/2 com deslize por eixo; `y0/y1` do corpo ignoram o que está acima da cabeça | — |
| `HeightGround` | terreno por `heightAt(x,z)`: gruda no chão (desce até `stepDown`, sobe até `stepUp` sem "cair" — **sem tremor em rampa**), bloqueia subida > `maxSlope`, lombadas < `bumpTol` nunca bloqueiam | — |
| `combineColliders(a, b)` | grade + caixas soltas, etc. | — |

### Interface de colisão

```ts
interface FpCollider {
  isFree?(x, z, r): boolean;                       // grade: controlador desliza eixo a eixo
  sweep?(fx, fz, tx, tz, r, out: SweepResult): void; // caixas/malha: o mundo resolve (out.hitX/hitZ)
  clampPoint?(x, z, margin, px, pz, out): void;      // camClamp (px,pz = jogador, refúgio)
}
```
Se o jogo já tem uma função "empurra para fora" (`collide(x,z,r) → [x,z]`), embrulhe como `sweep`:
```ts
const col: FpCollider = { sweep(fx, fz, tx, tz, r, o) { [o.x, o.z] = sim.collide(tx, tz, r); o.hitX = Math.abs(o.x - tx) > 1e-4; o.hitZ = Math.abs(o.z - tz) > 1e-4; } };
```

### Presets (`fpTuning('cozinha' | 'survival' | 'indoor', ajustes?)`)

| | speed | accel/decel | sprint | gravidade/pulo | olho | bob amp/rate | rolagem | extra |
|---|---|---|---|---|---|---|---|---|
| **cozinha** (padrão) | 3.3 | 10 / 14 | — | — | 1.45 | 0.025 / 9 | 0.008 | camMargin 0.34, pitch −1.3..1.1 |
| **survival** | 3.0 | 6 / 8 (mais massa) | ×1.6 | 18 / 5.4, controle no ar 0.35 | 1.6 | 0.035 / 8 | 0.012 | raio 0.35, eyeSmooth 14, pitch ±1.45 |
| **indoor** | 2.4 | 12 / 16 | — | — | 1.5 | 0.018 / 8.5 | 0.005 | raio 0.28 |

`tune` é um objeto comum e mutável: mude por quadro (tênis mais rápidos, extintor pesado, tema "espaço" com `accel` baixo e `bounce` 0.4).

## Uso mínimo (loop)

```ts
const fp = new FpController(fpTuning('indoor'), new AabbCollider(boxes));
const cam = new FpCamera(fp.tune);
const aim = new FpAim();
const input = new FpsControls(layer);          // src/ui/touch

function frame(dt: number) {
  const [lx, ly] = input.consumeLook(dt);
  cam.look(lx, ly);
  const [mx, my] = input.dir();
  fp.update(dt, { x: mx, y: my, sprint: input.key('ShiftLeft'), jump: input.key('Space') }, cam.yaw);
  for (const o of others) fp.pushAway(o.x, o.z); // opcional
  cam.apply(camera, dt, fp, fp.collider);          // bob/roll/tremor/tranco/camClamp
  if (aim.update(camera, cam.lookDX, cam.lookDY, fp.speedK)) picker.pick(aim.ray);
  held?.update(dt, fp.speedK, cam.lookDX, cam.lookDY);
}
// eventos: cam.addShake(0.4) (explosão), cam.kick() (golpe/tiro), held.swing('swing')
```
Quando o jogo precisa mexer na velocidade entre "calcular" e "mover" (escorregão, vento), use as duas fases:
`fp.steer(dt, mx, my, yaw)` → ajustes em `fp.vx/vz` → `fp.move(dt)` (é o que a Cozinha faz).
Extras do jogo vão em `cam.extraRoll / extraPitch / extraYaw / extraY` (barco, espaço, tontura).

## Como a Cozinha usa (referência)

`src/games/cozinha/render3d.ts`: `fp = new FpController(FP_COZINHA)`, `fpc = new FpCamera(FP_COZINHA)`,
`grid = new GridCollider(T, (x, y) => sim.isFloor(x, y))`, `aimer = new FpAim(RAY)`.
`preStep`: `fpc.look` → `fp.tune.speed/bounce/accelOverride` (tênis, extintor, espaço, escorregão) →
`fp.steer` → poça/escorregão → `fp.move` → `fp.pushAway` para cada colega. `placeCamera`: extras de tema +
`fpc.apply(camera, dt, fp, grid)`. Os campos antigos (`px`, `vx`, `yaw`, `shake`...) viraram getters do kit.

### A/B (feel idêntico)
`scripts/dev/fpkit-trace.mjs` para o loop do jogo, semeia `Math.random`, fixa o relógio e roda 900 quadros
de entrada roteirizada (parado, frente, diagonal girando, deslizar na parede, ré, frenagem, colega empurrando,
tremor, tranco, dt variável 1/60–1/30). Antes × depois do refactor, temas padrão, `space` e `boat`:
**desvio máximo 0 em posição e rotação da câmera, posição do corpo e alvo da mira** (bit a bit).
```
PORT=4620 node scripts/dev/fpkit-trace.mjs out.json [shot.png]   # Q="&cztheme=space" para tema
node scripts/dev/fpkit-trace.mjs --diff a.json b.json
```

## Guia de migração (por jogo — cada dono adota no seu ramo)

Passos comuns: (1) troque os campos `x/z/vx/vz/yaw/pitch/bob/shake` por `FpController` + `FpCamera`
(getters como na Cozinha mantêm o resto do arquivo intacto); (2) embrulhe a colisão existente em um
`FpCollider`; (3) escolha um preset e ajuste só o que for identidade do jogo; (4) faça um A/B com um
script de traço como o da Cozinha se quiser preservar o feel antigo, ou aceite o feel da Cozinha
(objetivo do dono: todos andando igual de bem).

- **Noites** (`src/games/noites/game.ts` ~l.1021–1050): hoje anda com velocidade direta (sem aceleração) e
  `s.collide(x,z,r)` (sim + veículo + BUILD). Adapte `s.collide` como `sweep` (snippet acima), preset
  `survival` (ou `cozinha` com `sprintMul`), `cam.addShake` nos sustos/ataques. Para o camClamp, dê ao
  adaptador um `clampPoint` que chama `s.collide(x, z, margin)`.
- **Mundo / Floresta (mundo aberto voxel)** (`src/games/floresta/world/*`): chão = `HeightGround` com
  `heightAt` do voxworld (altura da coluna sólida), `stepUp` 0.55 (1/2 bloco), `maxSlope` ~0.9; troncos e
  peças construídas como `AabbCollider` (via `combineColliders`). O corpo cinemático do cannon (empurra toras)
  segue `fp.x/y/z` depois do `move`. Preset `survival` (corrida, pulo, gravidade, `eyeSmooth`).
- **Garimpo a pé** (`src/games/garimpo/terrain.ts` tem `heightAt`): `new HeightGround((x,z)=>terrain.heightAt(x,z), { stepUp: 0.3, maxSlope: 0.75 })`
  — resolve o tremor em encosta; máquinas como `AabbCollider`. Preset `survival` com `sprintMul` 1.3.
  `HeldItem` para pá/peneira/bateia (`swing('swing')` ao cavar).
- **Anomalias** (`src/games/anomalias/core/shift.ts`, `world.ts` `slide()` + `Box` do THREE): converta
  `world.colliders` para `FpBox` (`{x0:b.min.x, z0:b.min.z, x1:b.max.x, z1:b.max.z, y0:b.min.y, y1:b.max.y}`)
  num `AabbCollider` com `y0 = 0.15, y1 = 1.7` (o mesmo filtro de altura do `slide`), preset `indoor`.
  O bob atual (`moved*6.5`, 0.035) some em favor do do kit; `cam.addShake` nos sustos; `FpAim` para a mira
  de anomalias/portas. Lanterna = `HeldItem`.
- **Voo — cabine** (`src/games/voo/view3d.ts` ~l.825–848): a pé no corredor use `FpController` com
  `AabbCollider` dos assentos/corredor, preset `indoor` (`eye` 1.12 do jogo). Turbulência →
  `cam.extraRoll/extraPitch` + `cam.addShake`; sentado → `cam.fx = false` e só `cam.look` com limites
  (`tune.pitchMin/Max` −0.7..0.5).
- **Disaster 3D** (`src/games/disaster/d3/game3d.ts`): é câmera em 3ª pessoa no geral; se/quando tiver modo a
  pé em 1ª pessoa, `FpController` + `GridCollider`/`AabbCollider` do mapa, preset `survival`;
  terremoto = `cam.addShake` contínuo, explosão = `cam.kick`.
- **Casa 3D (home3d)** (`src/home3d/fps.ts`): o corpo é cannon (`body.position`) e o bob já copia a Cozinha
  (`dt*9*speed`, 0.022). Troque o cálculo de câmera por `FpCamera.apply(camera, dt, { x, z, y: body.y - RAD, speedK }, collider)`
  com `eye` 1.02 e preset `indoor`; para colisão, ou mantenha o cannon (passe `collider = null` e copie a
  posição do corpo) ou gere `AabbCollider` dos móveis (`placer.ts`) e solte o cannon do jogador.

## Regras

- Não copie fórmulas para o jogo: se precisar de algo novo (agachar, nadar, escada), adicione ao kit com
  padrão desligado e mantenha a Cozinha bit a bit (rode o A/B).
- Nada no kit aloca por quadro; `FpController` não toca DOM/THREE (pode rodar em bot/servidor).
