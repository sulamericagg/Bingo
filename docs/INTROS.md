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
