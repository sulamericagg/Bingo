# Aberturas (intros) dos jogos

Cada jogo pode ter uma **abertura cinematográfica** curta (30–45 s), procedural, pulável (**Pular**),
e pode ser **revista pelo menu** ("Abertura") onde houver o botão.
Referência de qualidade: Garimpo (`src/games/garimpo/start/cinematic.ts`).

## Regra: quando a abertura toca sozinha

1. **Jogos com jogo salvo** (espaços de save / "Novo jogo" / "Nova jangada" / "Novo mundo" /
   "Nova partida"): **toda vez que um jogo NOVO começa** — espaço vazio, ou depois de apagar o save e
   começar outro. **Continuar** um save **não** toca. (Pedido do dono: "toda vez que eu excluir e iniciar
   um novo, tem que rodar as cutscenes".)
2. **Jogos de fase/arcade** (sem save para continuar): só **na primeira vez** (+ "Abertura" no menu, onde houver).
3. **Online/grupo**: quem **entra** no mundo de outro não vê. Para manter simples e robusto, os jogos com
   save também **não** tocam quando o líder abre o mundo novo para o grupo (a sala já está esperando).
4. Nunca toca sozinha com `?intro=0`, com a abertura desligada nos ajustes do hub
   (`bw-intro = '0'`, "Animação de abertura dos jogos") nem em navegador automatizado
   (`navigator.webdriver`: Playwright/QA). `?intro=1` (ou `?intro2=1`) força.
   Tudo isso está num lugar só: `introAllowed()` em `src/3d/cine/gate.ts` (usado também por `_intro2/once.ts`).

API (uma para cada base, mesma regra):

```ts
// base 3D/leve (src/3d/cine/gate.ts)
await introGate(id, load);                    // 1ª vez (jogos de fase)
await introGate(id, load, { fresh: true });   // jogo NOVO de um jogo com save (toca sempre)
introWanted(id, { fresh: true });             // a pergunta, sem tocar

// base 2D (src/games/_intro2/once.ts)
await xxxIntro.once(root);                    // 1ª vez
await xxxIntro.fresh(root);                   // jogo novo de um jogo com save
```

Quem chama decide o que é "jogo novo" (o gancho fica no caminho de começar do zero, nunca no "Continuar").

> Por que a Jangada não tocava numa jangada nova: o gancho era `introGate('jangada', …)` (só a 1ª vez);
> a marca `bloop-intro-jangada = '1'` fica no aparelho para sempre (é gravada ao tocar e também ao fim de
> qualquer `Cine`, inclusive o "rever"), e apagar o save não a apaga. Agora o gancho usa `{ fresh: true }`.

| jogo | save | o que é "jogo novo" | gancho |
|---|---|---|---|
| Jangada Bloop | 3 espaços | espaço vazio → "Nova jangada" (também depois de apagar) | `jangada/game.ts` → `start(true)`: `introGate('jangada', …, { fresh: true })` (só sozinho) |
| Noites do Acampamento | 1 partida salva | JOGAR sem partida, ou "Nova partida" (descarta a salva) | `noites/game.ts` → `startSolo(intro = !runSave)`: `{ fresh: true }` |
| Garimpo Bruto | 3 espaços | espaço vazio → "Novo jogo" | próprio: `camp.st.intro` vive **no save** (save novo = abertura de novo); `garimpo/game.ts` → `start()` |
| Mundo Bloop (blocos) | mundos | "Novo mundo" | próprio: `save.vehPlaced` no save do mundo (`floresta/world/worldgame.ts` → `introPending`, fora do online) |
| Fábrica Estelar | Minha Fábrica | fábrica ainda não inaugurada (`tycoon.last = 0`) | `tycoon/index.ts`: `tycoonIntro.fresh(root)`; senão `.once` |
| Pouso Forçado (voo) | — | cada voo | próprio (cena de decolagem a cada voo, fora do online/rápido) |
| Cava & Fala, Anomalias, Monta & Leva, Cozinha, Desastres, Caça, Rally, Queda, Banda, Lugar, Cor, Desenho | — (fases/rodadas) | — | 1ª vez (`introGate(id, load)` / `.once`) |

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
- `?intro=1` força (passa por cima do navegador automatizado e do ajuste do hub); `?intro=0` nunca toca sozinha.
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

`introGate(id, load, opts?)` de `src/3d/cine/gate.ts` (sem three.js): sem opções toca só na primeira vez;
com `{ fresh: true }` toca a cada jogo novo (veja **Regra** acima). Marca
`localStorage['bloop-intro-<id>'] = '1'` e nunca rejeita (se falhar, o jogo segue).

| jogo | id | gancho |
|---|---|---|
| Jangada Bloop | `jangada` | `game.ts` → `start(fresh, net)`: `fresh && !net`, com `{ fresh: true }` (TODA jangada nova, sozinho) |
| Noites do Acampamento | `noites` | `game.ts` → `startSolo()`: sem partida salva, com `{ fresh: true }` (toda partida nova) |
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

- `node scripts/dev/intros-fresh.mjs [jangada,noites,garimpo,tycoon]` (com `vite preview` em :5310, ou `QA_URL`):
  prova a regra pelo menu de verdade — espaço novo → abertura; Continuar → nada; apagar + novo → abertura.

- Página de dev: `scripts/dev/intros.html?play=<jogo>&debug` (só a abertura) e
  `?game=<jogo>&intro=1&debug` (o jogo de verdade, abertura no "jogo novo").
- `NODE_PATH=$(npm root -g) node scripts/dev/intros-shots.mjs --port <vite> --only jangada,noites [--flow]`:
  ~10 quadros por abertura (844×390, dpr 1) + folha de contato em `shots-intros1/`; `--flow` abre o
  jogo, toca a abertura, aperta **Pular** e confere que a partida começou e que nada ficou para trás.


## Lote 2 (wip/intros2): Cozinha, Desastres, Caça Bloop + aberturas curtas

Estes jogos são 2D (ou têm menu 2D), então as aberturas são **2D em canvas**, com um palco próprio e
leve, sem three.js: `src/games/_intro2/` (foi feito antes de `src/3d/cine` existir; mesma linguagem do
Garimpo — barras de cinema, gradação, legendas com ícones + narração por `speak()`, título com brilho,
**Pular**, voltar/Esc = pular, tema do jogo + vinheta `title`, o Bloop do jogador desenhado com
`drawPlayer`, partículas pelo nível de qualidade).

| arquivo | o quê |
|---|---|
| `_intro2/once.ts` | **leve** — `defineIntro(id, load)` → `{ due(), once(root), play(root), reset() }`; marca vista em `bw-intro2.<id>` |
| `_intro2/stage.ts` | `playFilm(root, spec)`: o palco (canvas 2D, coordenadas em % do lado menor, responsivo em pé/deitado) |
| `_intro2/draw.ts` | pincéis: `bloop()` (Bloop do jogador ou amigos), nuvens, brilhos, raios, confete, `seg/ease/back/hop`, `dip()` |

Regras de quando toca: `.once` só na 1ª vez, `.fresh` a cada jogo novo de jogo com save (veja **Regra** no topo); nunca com a abertura desligada nos ajustes (`bw-intro = '0'`) nem em
navegador automatizado (Playwright), salvo `?intro=1` (ou `?intro2=1`); `?intro=0` nunca toca.
Com `?debug` (ou em Playwright) o palco fica em `window.__intro2` (`seek(t)`, `hold = true`, `finish()`).

**Para o menu ("Ver abertura")** — sempre toca, por cima do que estiver na tela:

```ts
import { cozinhaIntro } from './intro';          // dentro de src/games/cozinha/
void cozinhaIntro.play(rootDoJogo);              // Promise<void>: resolve ao acabar ou ao pular
```

| jogo | id | duração | filme | `import` (handle) | gancho (1ª partida) |
|---|---|---|---|---|---|
| Cozinha Maluca | `cozinha` | ~30 s | `src/games/cozinha/intro/film.ts` | `cozinhaIntro` de `src/games/cozinha/intro` | `game.ts` → `startDay()` (sozinho, fora do online) |
| Sobreviva aos Desastres | `disaster` | ~27 s | `src/games/disaster/intro/film.ts` | `disasterIntro` de `src/games/disaster/intro` | `launch.ts` → `start(mode)` depois da escolha 2D/3D (fora do grupo) |
| Caça Bloop | `caca` | ~29 s | `src/caca/intro/film.ts` | `cacaIntro` de `src/caca/intro` | `game.ts` → `flow()` (antes da tela de segurança) |
| Rally Lunar | `rally` | ~13 s | `src/games/rally/intro/film.ts` | `rallyIntro` | `game.ts` → garagem "Jogar" antes de `startRun()` |
| Fábrica Estelar | `tycoon` | ~13 s | `src/games/tycoon/intro/film.ts` | `tycoonIntro` | `index.ts` → "Minha Fábrica": `.fresh` se a fábrica é nova (`last = 0`), senão `.once` |
| Queda Giratória | `tubo` | ~12 s | `src/games/tubo/intro/film.ts` | `tuboIntro` | `game.ts` → 1º toque no estado `ready` (fora do duelo; o toque seguinte começa) |
| Bloop Banda | `band` | ~13 s | `src/games/band/intro/film.ts` | `bandIntro` | `game.ts` → `startSong()` sozinho (sem rede) |
| Bloop no Lugar | `lugar` | ~12 s | `src/games/lugar/intro/film.ts` | `lugarIntro` | `game.ts` → `begin()` (fora do duelo) |
| Pintou, Ganhou! | `cor` | ~13 s | `src/games/cor/intro/film.ts` | `corIntro` | `game.ts` → `begin()` (fora do duelo) |
| Desenha e Vira! | `desenho` | ~13 s | `src/games/desenho/intro/film.ts` | `desenhoIntro` | `game.ts` → `enterAtelier()` / `playLevel()` (fora do duelo) |

Textos: chaves `intro2.*` (pt-BR + 11 idiomas); os títulos e frases de efeito reaproveitam `<jogo>.name` e
`<jogo>.tagline`.
