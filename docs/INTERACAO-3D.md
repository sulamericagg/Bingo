# Interação 3D "trabalhe com as mãos" — kit `src/3d/common/interact/`

Kit compartilhado para os modos 3D em primeira pessoa (celular deitado, toque). Primeiro usuário:
**Cozinha Maluca 3D** (`src/games/cozinha/render3d.ts`, `fps-props.ts`, `fps-tickets.ts`).
Próximos: atividades da Casa 3D (`src/home3d/activities/`) e Pouso Forçado (`src/games/voo/`).

## Princípios (adaptados de simuladores de trabalho físicos — sem copiar nomes, arte ou textos)

1. **Interface no mundo (diegética).** Pedidos e instruções ficam em objetos: tela na parede ao lado do
   passa-pratos (na altura dos olhos), comanda que **sai da impressora** com som, nota adesiva amarela com
   o passo do treino, adesivo com o ícone do conteúdo na porta de cada geladeira/armário.
   HUD = joystick, arrastar para olhar, **UM** botão da mão (verbo contextual) e JOGAR.
2. **Tudo é objeto.** Usar = pôr A em B (ingrediente na panela, prato no balcão). Aparelhos têm controles
   físicos grandes que você toca no mundo: botão giratório do fogo (no tampo, gira e acende chama azul),
   botão do forno, botão do liquidificador (desliga sozinho), alavanca da torneira (lava sozinha e fecha
   quando a pia esvazia), porta da geladeira (abre, fecha sozinha), tampa do lixo (abre quando algo chega
   perto), sininho do balcão.
3. **Afordâncias claras.** Contorno pulsante + rótulo minúsculo no que a mão mira; discos verdes nos
   lugares que **aceitam** o que você segura; "+" quando vai combinar (ingrediente → prato); contorno
   vermelho + "Não cabe aqui" quando recusa. O controle que falta (fogo desligado, torneira fechada)
   brilha sozinho.
4. **Suco em toda ação.** Som + vibração por evento (`feedback('knobOn')`), partículas, quique (mola
   sub-amortecida dos controles), cliente na janela comemora (coração) ou estranha ("?!").
5. **Perdão.** Mira assistida (caixa inflada + histerese), ímã que puxa arremessos para o lugar certo,
   nada se perde: item que sai da cozinha ou para onde a mão não alcança volta com "puf" para a sua frente;
   geladeiras/pilhas de pratos são infinitas.
6. **Ensinar fazendo.** O primeiro pedido é o tutorial (a comanda mostra `[tomate] › [faca] → tigela`).
   A seta/contorno verde **só aparece se o jogador hesitar** (`Hesitation`: 3,5 s suave, 7 s forte); fora
   da tela vira seta na lateral com o balão do passo. O botão da mão só brilha quando apertar agora resolve.

## API

```ts
import { AimPicker, ControlKit, Knob, PushButton, Lever, HingedDoor, Lid, HoverHighlight, SnapGlows, Beacon,
  WorldTag, CanvasPanel, TicketPrinter, wallScreen, sticker, HandButtons, resolveVerb, Hesitation, Rescuer,
  solveThrow, magnet, Squash, feedback } from '../../3d/common/interact';
```

| Peça | Para quê |
|---|---|
| `AimPicker<T>` | `add(data, box, bias)` / `pick(ray)` → alvo. Caixas no mundo (AABB), assistência e histerese, sem alocação. Controles pequenos com `bias -0.3` ganham do móvel atrás. `AimPicker.sphere(t,x,y,z,r)` para itens soltos. |
| `ControlKit` + `Knob` / `PushButton(toggle?)` / `Lever` / `HingedDoor` / `Lid` | Controles físicos (`group`, `box`, `on`, `press()`, `set(on, silent)`, `onChange`, `hint` 0..1 = brilho de dica). `kit.update(dt,time)` anima. Local +Z = frente (para o jogador). |
| `HoverHighlight` | `show(box, label, warn)` / `hide()` / `frame(cam,w,h,time)`. |
| `SnapGlows` | `begin()`, `add(x,y,z,r,combine)`, `end(time)` — discos "pode soltar aqui" e "+". |
| `Beacon` | `set(box, level 0/1/2, texto)` + `frame()` — contorno verde, seta 3D, seta de borda, balão. |
| `wallScreen(w,h)`, `CanvasPanel`, `TicketPrinter`, `sticker()` | Interface diegética: telas, comandas (`print(draw)` anima o papel), adesivos com cache. |
| `HandButtons` + `resolveVerb(ctx, rules, fallback)` | HUD mínimo. Regras puras: a primeira `when(ctx)` verdadeira decide `{id,label,icon,hold,dim}`. `mainHeld`, `throwHeld`, `charge(k)`, `glow(on)`. |
| `Hesitation` | `update(chaveDoPasso, dt)` → 0/1/2; `poke()` quando o jogador faz algo útil. |
| `Rescuer` | `check(estado, x,y,z, vel², dt)` → `'ok' | 'out' | 'stuck'` com limites e `reachable()`. |
| `solveThrow`, `magnet`, `Squash` | Física amigável: parábola exata, ímã, amassar/esticar. |
| `feedback(kind)` | Som (`src/3d/common/sfx.ts`) + vibração por evento. |

Desempenho: nada aloca por quadro nos caminhos quentes; a mira só é refeita a cada 3 quadros com a câmera
parada; a tela de pedidos redesenha quando muda (máx. 4×/s); discos de encaixe recalculam 6×/s.

## Como a cozinha usa (referência)

- `fps-props.ts`: monta as peças por estação (`KitchenProps.by[st.i]`).
- `render3d.ts`: `buildInteract()` registra alvos (estação, controle, item solto), liga `onChange` à Sim
  (`station.heat`), tela + impressora; `VERB_RULES` decide o botão da mão; `highlight()` faz contorno,
  discos e dica por hesitação; `stationProps()` sincroniza controles ↔ Sim (ajudantes ligam o fogo sozinhos).
- Sim (`sim.ts`): `manualHeat` (só no 3D offline: fogão/forno/liquidificador só cozinham ligados),
  `wouldAccept(si, item)` (prévia sem efeitos: 0 recusa, 1 entra, 2 combina, 3 entrega), `washAt()`.
  O 2D e o online continuam com as regras de antes.

## Como adotar nas atividades da Casa 3D (`src/home3d/activities/`) — depois

1. Troque o alvo/mira próprio por `AimPicker` (estações = caixas; objetos soltos = `AimPicker.sphere`).
2. Registre controles: geladeira/armários → `HingedDoor` com `sticker()`; fogão → `Knob`; pia → `Lever`
   (torneira lava sozinha, como na cozinha); lixeira → `Lid`; máquina de lavar → `PushButton`.
3. Botões de ação da atividade → `HandButtons` com uma lista `VerbRule` por atividade (ex.: lavar louça:
   segurar prato sujo + mirar pia → "Colocar na pia"; mirar torneira → "Abrir a torneira").
4. Lista de tarefas → `wallScreen`/nota adesiva no mundo; dicas atuais → `Beacon` + `Hesitation`.
5. Objetos que caem atrás de móveis → `Rescuer`.

## Como adotar no Pouso Forçado (`src/games/voo/`) — depois

- Instrumentos e alavancas da cabine (trem de pouso, flaps, manete) → `Lever` / `Knob` / `PushButton` com
  `AimPicker` (bias negativo: são pequenos) e o verbo no `HandButtons` ("Baixar o trem").
- Checklist → `CanvasPanel` preso ao painel ou prancheta (`TicketPrinter` para "nova instrução da torre").
- Passo atual do minijogo → `Hesitation` + `Beacon` apontando o controle certo; `feedback('lever')` etc.
- Mantenha a lógica do minijogo como dona do estado (como a Sim da cozinha) e só espelhe em `control.set(on, true)`.
