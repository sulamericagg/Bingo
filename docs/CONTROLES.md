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

- **Flutuante (padrão):** a base aparece **onde o polegar toca** na zona (metade esquerda abaixo de
  `zoneTop`; no modo canhoto vai para a direita sozinho), então a direção nunca "vira" por o dedo cair
  fora do centro. Fora do toque mostra um anel apagado na posição de descanso.
- **Fixo** (preferência): a base fica parada na posição escolhida; se o polegar cair longe dela (> 1,1 R),
  a base vem até o dedo em vez de começar puxando para o lado errado.
- Posição de descanso/fixa = preferência `joyPos` (fração da tela, medida a partir da borda do lado do
  joystick), sempre limitada a ficar **bem dentro da tela** e fora das margens `--edge-*`.
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
no `#controls-settings`), com opções grandes:

| Opção | Campo | Valores |
| --- | --- | --- |
| Analógico | `joyMode` | `'float'` (padrão) / `'fixed'` |
| Tamanho do joystick | `joySize` | `'S'` / `'M'` / `'G'` (`JOY_MUL`; raio em px: `joyRadius()`) |
| Posição do analógico | `joyPos` | `{x, y}` em fração da tela — prévia ao vivo: "Arraste o analógico para onde for confortável" |
| Sensibilidade da câmera | `lookSens` | multiplicador 0.4–2.5 (controle deslizante, padrão 1) |
| Modo canhoto | `lefty` | joystick à direita, ações à esquerda |
| Inverter vertical / Giroscópio | `invertY` / `gyro` | |
| Vibração | `save.haptics` | |
| Restaurar padrão | — | volta tudo |

API para os jogos (Floresta, Cozinha, Casa, Voo… podem ler mesmo sem usar o `Joystick`):

```ts
import { getControlPrefs, onControlPrefs, joyRadius } from '../../ui/touch';
const p = getControlPrefs();          // { joyMode, joySize, joyPos, lookSens, lefty, invertY, gyro }
const off = onControlPrefs((p) => relayout(p));   // chame off() ao sair
const yawPerPx = 0.0055 * p.lookSens;
```

Guardado em `localStorage['bw-controls']` (o formato antigo `sens: low|mid|high` é migrado sozinho).

## 6. Margens de borda (`--edge-*`) — barra de navegação do Android

No WebView do Capacitor `env(safe-area-inset-*)` costuma ser **0** mesmo com a barra de 3 botões do
Android por cima do jogo (direita em paisagem, embaixo em retrato) → botões colados na borda eram
apertados sem querer (recadinho disparado, jogo fechado). `src/ui/styles.css` define em `:root`:

| Var | Toque + paisagem | Toque + retrato | Mouse |
| --- | --- | --- | --- |
| `--edge-l` | max(inset, 44px) | max(inset, 12px) | 12px |
| `--edge-r` | max(inset, 48px) | max(inset, 12px) | 12px |
| `--edge-b` | max(inset, 14px) | max(inset, 44px) | 12px |
| `--edge-t` | max(inset, 8px) | max(inset, 8px) | 8px |

Regras: todo botão/HUD de jogo usa `left: var(--edge-l)` / `right: var(--edge-r)` /
`bottom: var(--edge-b)` (não `12px` fixo). Em JS (canvas, zonas de toque): `edges()` → `{t,l,r,b}` em px.
O joystick já respeita (descanso fora das margens; toque na faixa da barra não vira joystick).
Barras de recadinhos/emotes: **popover compacto** que abre num botão e fecha no próximo toque — nunca uma
coluna permanente na borda.

## 7. "Jogar sozinho, sem bots"

```ts
import { isSolo, soloToggle } from '../../ui/touch';
menuEl.appendChild(soloToggle('meu-jogo', (on) => lobby.setSolo(on), t('x.solo.sub', 'sem bots')));
if (!isSolo('meu-jogo')) spawnBots();
```

Lembrado por jogo (`localStorage['bw-solo']`). Visitantes online **reais** continuam aparecendo.

## 8. Avisos (`src/ui/notify.ts`)

| Função | Uso |
| --- | --- |
| `notify(texto, { icon, kind, ms, key })` | pílula pequena (12,5 px, semitransparente) no **cantinho superior esquerdo**, abaixo do HUD; máx. 2 visíveis, fila curta, repetidos viram "×2", some em ~3,2 s |
| `objective(texto \| null, { icon })` | chip minúsculo e persistente no canto superior direito com o objetivo atual |
| `setNotifyAlign('left' \| 'center')` | centraliza os avisos (jogo com HUD ocupando o canto esquerdo) |
| `bigMoment(texto, { icon, sub, side, color })` | "momento grande" (rodada, recorde) — faixa curta no topo, ≤ 1,2 s |
| `tipChip(texto, { anchor, id })` | dica dispensável colada a um controle |
| `setNotifyTop(px)` / `resetNotifyTop()` | coloca os avisos logo abaixo do HUD do jogo |
| `clearNotify()` | limpa tudo ao sair do jogo |

**Regra:** nada de caixa de dica no centro durante o jogo ("tinha que ser no cantinho"). Contagens 3-2-1 e títulos de rodada vão para
o terço de cima, pequenos, e somem rápido.

## Onde já está aplicado

| Jogo | Mudança |
| --- | --- |
| Desastres (`src/games/disaster`) | joystick flutuante (andar/subir escada) no lugar das setas; pular do outro lado (troca no canhoto); cartões do meio → `bigMoment` + `notify` + `objective`; `--edge-*`; "Jogar sozinho" no resumo |
| Rally (`src/games/rally`) | avisos via `notify`; textos flutuantes e "Ops!" menores e mais altos; "Jogar sozinho" na garagem (sem carros-fantasma); canhoto troca acelerar/frear; recadinhos em popover; `--edge-*` |
| Fábrica Estelar (`src/games/tycoon`) | joystick de arrastar com raio físico, zona morta, mola, anel que acompanha e cancelamento seguro; 3-2-1 menor e no alto; `--edge-*` |
| Tubo (`src/games/tubo`) | combo e faixa de zona menores; `--edge-*` |
| Global (`src/ui/ui.ts`) | `UI.toast` usa `notify`; seção Controles no Ajustes |
