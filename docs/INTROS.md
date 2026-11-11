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

Cada abertura vive em `src/games/<jogo>/intro/cinematic.ts` e exporta:

```ts
export function playIntro(root: HTMLElement): Promise<void>   // toca (resolve ao acabar/pular)
```

**Para o menu ("Abertura" / rever)** — importe sob demanda e toque por cima do menu:

```ts
void import('./intro/cinematic').then((m) => m.playIntro(rootDoJogo));
```

**Jogo novo** (já ligado): `introGate('<id>', () => import('./intro/cinematic').then((m) => m.playIntro(root)))`
antes de montar a partida — só toca na primeira vez.

| jogo | id | arquivo | gancho (jogo novo) |
|---|---|---|---|
| Jangada Bloop | `jangada` | `src/games/jangada/intro/cinematic.ts` | `game.ts` → `start(fresh)` (nova jangada, sozinho) |
| Noites do Acampamento | `noites` | `src/games/noites/intro/cinematic.ts` | `game.ts` → botão Sozinho / nova partida |
| Cava & Fala | `cavafala` | `src/games/cavafala/intro/cinematic.ts` | `game.ts` → `startRestore` / `startArena` (sozinho) |
| Anomalias & Cia | `anomalias` | `src/games/anomalias/intro/cinematic.ts` | `core/game.ts` → `play()` (turno) |
| Monta & Leva | `montaleva` | `src/games/montaleva/intro/cinematic.ts` | `game.ts` → `openLevel()` (1ª fase) |
| Garimpo Bruto | `garimpo` | `src/games/garimpo/start/cinematic.ts` | (próprio, anterior à base) |

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

Regras de quando toca: só na 1ª vez; nunca com a abertura desligada nos ajustes (`bw-intro = '0'`) nem em
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
| Fábrica Estelar | `tycoon` | ~13 s | `src/games/tycoon/intro/film.ts` | `tycoonIntro` | `index.ts` → `playMatch()` / "Minha Fábrica" |
| Queda Giratória | `tubo` | ~12 s | `src/games/tubo/intro/film.ts` | `tuboIntro` | `game.ts` → 1º toque no estado `ready` (fora do duelo; o toque seguinte começa) |
| Bloop Banda | `band` | ~13 s | `src/games/band/intro/film.ts` | `bandIntro` | `game.ts` → `startSong()` sozinho (sem rede) |
| Bloop no Lugar | `lugar` | ~12 s | `src/games/lugar/intro/film.ts` | `lugarIntro` | `game.ts` → `begin()` (fora do duelo) |
| Pintou, Ganhou! | `cor` | ~13 s | `src/games/cor/intro/film.ts` | `corIntro` | `game.ts` → `begin()` (fora do duelo) |
| Desenha e Vira! | `desenho` | ~13 s | `src/games/desenho/intro/film.ts` | `desenhoIntro` | `game.ts` → `enterAtelier()` / `playLevel()` (fora do duelo) |

Textos: chaves `intro2.*` (pt-BR + 11 idiomas); os títulos e frases de efeito reaproveitam `<jogo>.name` e
`<jogo>.tagline`.
