# Aberturas (intros) dos jogos

Cada jogo pode ter uma **abertura cinematográfica** curta (30–45 s), procedural, pulável, que
toca **na primeira partida nova** e pode ser **revista pelo menu** ("Abertura").
Referência de qualidade: Garimpo (`src/games/garimpo/start/cinematic.ts`).

## Base compartilhada: `src/3d/cine/`

| arquivo | o quê |
|---|---|
| `gate.ts` | **leve, sem three.js** — `introGate(id, load)`, `introWanted(id)`, `introSeen(id)`, `markIntroSeen(id)` |
| `cine.ts` + `cine.css` | classe `Cine`: barras de cinema, vinheta, legendas com ícones + narração, título com brilho, clarão, fade, botão **Pular**, voltar do aparelho = pular, tema musical, limpeza total |
| `ease.ts` | curvas (`ease`, `ease5`, `easeOut`, `easeBack`, `easeElastic`, `bump`, `seg`, `flicker`), `Track3` (trilha de câmera Catmull-Rom com tempo), `handheld()` |
| `index.ts` | reexporta tudo |

### Uso

```ts
import { Cine, registerTheme, seg, ease, Track3 } from '../../../3d/cine';

registerTheme({ id: 'meuJogoIntro', ... });          // tema próprio, sem mexer em themes.ts
const c = new Cine({
  id: 'meujogo', root, duration: 40, music: 'meuJogoIntro',
  vignette: 'rgba(20,10,40,.5)', grade: 'saturate(1.15)',
  subs: [{ t: 1, icons: [svg1, svg2], text: () => t('mj.i.s1', 'Era uma vez...') }],
  title: { at: 34, text: () => t('mj.name', 'Meu Jogo').toUpperCase(), tagline: () => '...', colors: [a, b, c, borda] },
});
const st = c.stage3d(tier, { fov: 50 });             // ou c.canvas2d() para jogos 2D
c.onFrame = (t, dt) => { /* anima por tempo absoluto t */ st.render(); };
c.onDispose = () => { /* libera o que não está na cena */ };
await c.play();                                       // resolve no fim, no Pular ou no voltar
```

- A cena (`st.scene`) é liberada sozinha (`disposeTree`: geometrias, materiais, texturas,
  uniforms) e o renderizador é destruído com `forceContextLoss()`.
- Narração: cada legenda é falada por `speak()` (respeita a configuração de narração/som).
- `?debug` expõe `window.__cine = { id, seek(t), skip(), time, playing }` para testes.
- `?intro=1` força tocar sempre; `?intro=0` nunca toca sozinha.
- Chave de i18n do botão: `cine.skip` ("Pular").

## Aberturas e pontos de entrada

Cada abertura vive em `src/games/<jogo>/intro/cinematic.ts` e exporta **uma função**:

```ts
export function playIntro(root: HTMLElement): Promise<void>   // toca por cima de root; resolve no fim, no Pular ou no voltar
```

### Botão "Abertura" (rever) no menu — para quem mexe nos menus

Importe sob demanda (fica fora do chunk do menu) e toque por cima do menu; quando a promessa
resolve, o menu continua lá, intacto (a abertura cobre tudo com `z-index: 90`, pega o voltar do
aparelho e libera o próprio renderizador):

```ts
void import('./intro/cinematic').then((m) => m.playIntro(ROOT));
```

| jogo | `ROOT` dentro de `launch()` / da classe do jogo | rótulo do botão (já traduzido) |
|---|---|---|
| Jangada Bloop (`src/games/jangada/game.ts`) | `el` (o `.jg-root`) | `introLabel()` de `src/3d/cine/gate.ts` ("Abertura", chave `cine.replay`) |
| Noites do Acampamento (`src/games/noites/game.ts`) | `this.wrap` | idem |
| Cava & Fala (`src/games/cavafala/game.ts`) | `el` (o `.cf-root`) | idem |
| Anomalias & Cia (`src/games/anomalias/core/game.ts`) | `this.wrap` (caminho: `'../intro/cinematic'`) | idem |
| Monta & Leva (`src/games/montaleva/game.ts`) | `this.el` (o `.ml-root`) | idem |

### Jogo novo (já ligado, sem mexer em código de menu)

`introGate(id, load)` de `src/3d/cine/gate.ts` (sem three.js): toca só na primeira vez, marca
`localStorage['bloop-intro-<id>'] = '1'` e nunca rejeita (se falhar, o jogo segue).

| jogo | id | gancho |
|---|---|---|
| Jangada Bloop | `jangada` | `game.ts` → `start(fresh, net)`: só `fresh && !net` (nova jangada, sozinho) |
| Noites do Acampamento | `noites` | `game.ts` → `startSolo()`: só sem partida salva (`!this.runSave`) |
| Cava & Fala | `cavafala` | `game.ts` → `startRestore()` / `startArena()`: só sozinho (`!init && !online`) |
| Anomalias & Cia | `anomalias` | `core/game.ts` → `play()` (modo Turno) |
| Monta & Leva | `montaleva` | `game.ts` → `openLevel()` (fora do duelo) |
| Garimpo Bruto | `garimpo` | (próprio, anterior à base: `src/games/garimpo/start/cinematic.ts`) |

### Roteiros (resumo)

- **Jangada (≈45 s)** — cargueiro de contêineres ao pôr do sol (mar/céu do jogo: `Ocean`/`Sky`/`skyAt`),
  o Bloop na proa; tempestade (ondas maiores, chuva, raios); o navio aderna e afunda de desenho
  animado (contêineres caem e boiam, a tripulação desce no bote acenando — todos a salvo), o Bloop
  pula num caixote; "Horas depois..."; amanhecer turquesa, jangadinha de 4 pisos, gaivota pousa,
  o gancho é lançado num barril; grua revela ilhas → título. Som: `JAudio` do jogo (dia/tempestade).
- **Noites (≈43 s)** — ônibus escolar amarelo cantando (notinhas), chegada ao entardecer, a monitora
  acende a fogueira ("Não deixe o fogo apagar!"), noite estrelada, olhinhos das Sombrinhas nas
  árvores, o Bloop ergue a lanterna (feixe) e elas se escondem; grua → título. Tema `noitesIntro`.
- **Cava & Fala (≈41 s)** — livro de histórias na mesa com a página viva (vila feliz → tempestade de
  areia → dunas com um cata-vento); mergulho na página; morro de blocos, o Bloop com pá e megafone
  cava (blocos pulam fora) e a casinha aparece; grita "TRAMPOLIM!" e a engenhoca do jogo se monta;
  pulos; moradores saem comemorando; grua → título. Tema `cavafalaIntro`.
- **Anomalias (≈41 s)** — noite de chuva, prédio com letreiro de neon piscando; crachá; o chefe entrega
  chaves e polaroide; corredor com luzes piscando e quadro que entorta; FLASH e a polaroide com a foto
  real da cena; a sombra do Bocudo passa na parede; lá fora o Bocudo espia do telhado → título.
  Tema `anomaliasIntro` (+ sons do `AnoAudio`).
- **Monta & Leva (≈38 s, 2D)** — papel azul de projeto (grade, carimbo, contornos e cotas), as peças
  voam e encaixam, passageiro e caixa caem no carrinho, cortina para o mundo branco, a física do
  próprio jogo (`Sim`) leva o carrinho por lombada, gangorra, rampas e ponte até a entrega;
  estrelas, o robô acena → título (o fim segue a chegada).

## Testes / capturas

- Página de dev: `scripts/dev/intros.html?play=<jogo>&debug` (só a abertura) e
  `?game=<jogo>&intro=1&debug` (o jogo de verdade, abertura no "jogo novo").
- `NODE_PATH=$(npm root -g) node scripts/dev/intros-shots.mjs --port <vite> --only jangada,noites [--flow]`:
  ~10 quadros por abertura (844×390, dpr 1) + folha de contato em `shots-intros1/`; `--flow` abre o
  jogo, toca a abertura, aperta **Pular** e confere que a partida começou e que nada ficou para trás.
