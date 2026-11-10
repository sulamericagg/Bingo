# Controles de toque e avisos — módulos compartilhados

Feedback dos testadores: "o toque não é suave", "as mensagens são grandes demais no meio da tela",
"quero jogar sozinho, sem bots". Tudo abaixo existe para resolver isso **uma vez** e reaproveitar em
todos os jogos.

- `src/ui/touch/` — joystick flutuante, arrastar para olhar, botões, preferências, "Jogar sozinho"
- `src/ui/notify.ts` — avisos pequenos no topo (fila, sem duplicados, safe-area)

## 1. Joystick flutuante

```ts
import { createJoystick } from '../../ui/touch';

const joy = createJoystick(rootEl, { zoneTop: 0.2 }); // rootEl = container do jogo (tela cheia)
// a cada quadro:
const s = joy.read(); // { x, y, mag, active }  x: direita +, y: BAIXO + (use -s.y para "frente")
// ao sair:
joy.destroy();
```

- Aparece **onde o polegar toca** na zona (metade esquerda abaixo de `zoneTop`; no modo canhoto vai
  para a direita sozinho). Fora do toque mostra um anel apagado onde costuma ficar.
- Zona morta radial (`deadZone`, padrão 0.1), curva expo (`expo`), saída suavizada por **mola
  criticamente amortecida** (`smoothing` = ω, padrão 30 ≈ 0,13 s), raio pelo **tamanho físico** da tela
  × preferência "Tamanho do joystick"; se o dedo passa muito do anel, o anel acompanha.
- `read()` pode ser chamado várias vezes por quadro (avança a mola até "agora"); `raw()` dá o valor sem
  mola. `reset()` solta na hora; `setEnabled(false)` esconde e ignora toques.
- Zona própria: `zone: (x, y, rect) => boolean` (coordenadas relativas ao container).

## 2. Arrastar para olhar (1ª pessoa)

```ts
import { createLook } from '../../ui/touch';
const look = createLook(rootEl);              // pega qualquer dedo que o joystick não pegou
const [dYaw, dPitch] = look.consume(dt);      // radianos; dYaw + = virar à direita, dPitch + = olhar p/ baixo
yaw -= dYaw; pitch = clamp(pitch - dPitch, ...);
```

Baseado em delta (não em posição), com eventos agrupados (`getCoalescedEvents`), suavização
exponencial sub-quadro (o total é conservado — sem "atraso de lerp"), aceleração leve em movimentos
rápidos, inércia curta ao soltar, sensibilidade/inverter-Y das preferências e giroscópio opcional.

## 3. Pronto para 1ª pessoa: `FpsControls`

Mesma interface do antigo `FpsInput` da Casa 3D (`dir()`, `consumeLook()`, `key()`, `show()`,
`dispose()`, `enabled`). Adotar é **trocar a classe**:

```ts
// src/home3d/... (antes)
this.input = new FpsInput(layer);
// (depois)
import { FpsControls } from '../ui/touch';
this.input = new FpsControls(layer);          // dir() = [direita, frente]; consumeLook() = [dYaw, dPitch]
```

As convenções de sinal são as mesmas do `FpsInput` (`yaw -= lx; pitch -= ly`). O joystick próprio
(`.h3-joy`) pode ser apagado. Pastas ainda **não** migradas (outros agentes editando ao mesmo tempo):
`src/home3d`, `src/games/cozinha`, `src/games/floresta`, `src/games/voo`, `src/games/cor` — a troca acima
é tudo o que falta nelas.

## 4. Regras de multitoque (por que é seguro)

Todos os controles de um container passam por um único roteador (`surfaceOf(el)`):

- Cada dedo (`pointerId`) pertence a **no máximo um** controle (joystick tem prioridade sobre olhar), então
  andar + olhar ao mesmo tempo funciona.
- `setPointerCapture` no início: o dedo que arrasta **por cima de um botão nunca aciona o botão**.
- Toques que **começam** em `button, a, input, select, textarea, label, [data-touch-ignore], .tc-btn`
  não viram joystick/olhar. Marque painéis/modais com `data-touch-ignore`.
- `pointercancel`, `lostpointercapture`, `blur` e app indo para o fundo soltam tudo (nada de "dedo preso").

Botões de ação: `bindButton(el, { onPress, onRelease, onHold, repeatMs })` — dispara no `pointerdown`,
aperta visualmente na hora, área mínima 56 px.

## 5. Preferências (Ajustes → Controles)

`renderControlsSettings(host)` desenha a seção no painel de Ajustes global (já ligado em `src/ui/ui.ts`
no `#controls-settings`): sensibilidade da câmera (Baixa/Média/Alta), inverter vertical, tamanho do
joystick (P/M/G), modo canhoto, giroscópio e vibração. Ler: `controls.sens`, `controls.lefty`…;
ouvir mudanças: `onControlsChange(fn)`. Guardado em `localStorage['bw-controls']`.

## 6. "Jogar sozinho, sem bots"

```ts
import { isSolo, soloToggle } from '../../ui/touch';
menuEl.appendChild(soloToggle('meu-jogo', (on) => lobby.setSolo(on), t('x.solo.sub', 'sem bots')));
if (!isSolo('meu-jogo')) spawnBots();
```

Lembrado por jogo (`localStorage['bw-solo']`). Visitantes online **reais** continuam aparecendo.

## 7. Avisos (`src/ui/notify.ts`)

| Função | Uso |
| --- | --- |
| `notify(texto, { icon, kind, ms, key })` | pílula pequena no topo; máx. 2 visíveis, fila curta, repetidos viram "×2", some em ~2,2 s |
| `bigMoment(texto, { icon, sub, side, color })` | "momento grande" (rodada, recorde) — faixa curta no topo, ≤ 1,2 s |
| `tipChip(texto, { anchor, id })` | dica dispensável colada a um controle |
| `setNotifyTop(px)` / `resetNotifyTop()` | coloca os avisos logo abaixo do HUD do jogo |
| `clearNotify()` | limpa tudo ao sair do jogo |

**Regra:** nada de texto grande no centro durante o jogo. Contagens 3-2-1 e títulos de rodada vão para
o terço de cima, pequenos, e somem rápido.

## Onde já está aplicado

| Jogo | Mudança |
| --- | --- |
| Desastres (`src/games/disaster`) | joystick flutuante (andar/subir escada) no lugar das setas; pular do outro lado (troca no canhoto); cartões do meio → `bigMoment` + `notify`; "Jogar sozinho" no resumo |
| Rally (`src/games/rally`) | avisos via `notify`; textos flutuantes e "Ops!" menores e mais altos; "Jogar sozinho" na garagem (sem carros-fantasma); canhoto troca acelerar/frear |
| Fábrica Estelar (`src/games/tycoon`) | joystick de arrastar com raio físico, zona morta, mola, anel que acompanha e cancelamento seguro; 3-2-1 menor e no alto |
| Tubo (`src/games/tubo`) | combo e faixa de zona menores |
| Global (`src/ui/ui.ts`) | `UI.toast` usa `notify`; seção Controles no Ajustes |
