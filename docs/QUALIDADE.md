# Qualidade gráfica automática

Módulo: `src/core/quality.ts` (sem dependências além de `core/events`).
Testes: `node scripts/test-quality.mjs` (governor e limitador de fps, streams simulados).

## Níveis

| Tier | Nome   | dprCap | partículas | nebulosa | planeta distante | estrelas | glows | atmosferas `lighter` | vinheta | tremor | fps | rastro |
|------|--------|--------|-----------|----------|------------------|----------|-------|----------------------|---------|--------|-----|--------|
| 0    | Mínimo | 1      | 0.3       | não      | não              | 1        | não   | não (versão barata)  | não     | não    | 30  | 0.35   |
| 1    | Baixo  | 1.25   | 0.5       | não      | sim              | 2        | sim   | não (versão barata)  | não     | sim    | 60  | 0.6    |
| 2    | Médio  | 1.6    | 0.8       | sim      | sim              | 3        | sim   | sim                  | sim     | sim    | 60  | 0.85   |
| 3    | Alto   | 2      | 1         | sim      | sim              | 3        | sim   | sim                  | sim     | sim    | 60  | 1      |

## Como funciona

1. **`detectInitialTier()`** (síncrona, ~220 ms só na 1ª execução de cada versão do app):
   teto pelo hardware (`navigator.deviceMemory`, `hardwareConcurrency`, Android Go / Android antigo,
   pixels físicos da tela) e um micro-benchmark de canvas fora da tela (degradês radiais + blits
   aditivos, com `getImageData` para forçar o flush). Resultado = `min(teto, benchmark)`, em cache em
   `localStorage['bo-quality-detect']` (refeito quando `__APP_VERSION__` muda). Se o governor
   aprendeu um nível estável, a próxima sessão começa nele (`learned`).
   A abertura (`playIntro`) já chama isso enquanto o splash nativo ainda está na tela, então o custo
   não aparece para o jogador.
2. **`QualityGovernor`**: chame `sample(frameMs, workMs)` a cada frame desenhado.
   - desce 1 nível se a média passar de 20 ms por 2 s, ou de 40 ms por 0,5 s (com fpsCap 30 os limites dobram);
   - sobe 1 nível só com folga por 10 s seguidos (frame < 12 ms em telas >60 Hz, ou CPU `workMs` < 8 ms),
     no máximo 1 passo a cada 20 s; se uma subida for desfeita em <15 s, o intervalo dobra (até 160 s): não fica oscilando;
   - ignora frames > 250 ms (pausa, troca de aba) e os 600 ms logo após cada troca (rebuild de sprites);
   - modo manual `'auto' | 0..3` persistido em `localStorage['bo-quality']`; `maxTier` limita o automático;
   - avisa por `onChange(tier, settings, motivo)` e `bus.emit('quality', tier, settings)`.
3. **`FpsLimiter`** (`shouldRender(now)`): 30 fps no nível Mínimo; em telas de 120 Hz também segura o
   cap de 60 (economiza bateria).

Teste no Chromium headless (renderização por software): sem throttling → detecta Médio (score ≈ 15);
`Emulation.setCPUThrottlingRate` 4 ou 6 → detecta Mínimo (score ≈ 2–3) e o governor fica no Mínimo.

## Integração no `src/game/game.ts`

**Atalho:** `git apply docs/quality-game.patch` (gerado contra o `game.ts` do commit `e24753f`).
Se o arquivo tiver mudado no merge, aplique à mão os blocos abaixo (os trechos "antes" são literais do arquivo atual).

### 1. Import e constante

```ts
import { FpsLimiter, migrateLowFx, QualityGovernor, type QualityMode, type QualitySettings } from '../core/quality';
```
Logo após `const DASH: number[] = [5, 7];`:
```ts
/** camadas de estrelas por starLayers (1 = só a do meio) */
const STAR_SETS: number[][] = [[1], [0, 1], [0, 1, 2]];
```

### 2. Campos (bloco `// perf`)

Substitua `frameAvg` e `slowTime` (o `trackPerf` antigo sai) por:
```ts
  // perf / qualidade gráfica
  private last = 0;
  private raf = 0;
  readonly quality: QualityGovernor;
  private q: QualitySettings;
  private limiter = new FpsLimiter(60);
```

### 3. Construtor

Troque
```ts
    this.dprCap = save.lowFx ? 1.25 : 2;
    this.fx.budget = save.lowFx ? 0.5 : 1;
```
por
```ts
    migrateLowFx(save.lowFx);
    this.quality = new QualityGovernor({ onChange: (_t, s) => this.applyQuality(s) });
    this.q = this.quality.settings;
    this.dprCap = this.q.dprCap;
    this.fx.budget = this.q.particleBudget;
    this.limiter.cap = this.q.fpsCap;
```

### 4. `setLowFx` → `setQuality` + `applyQuality`

```ts
  /** Ajustes > Gráficos: 'auto' ou nível fixo 0..3 (persistido em localStorage 'bo-quality'). */
  setQuality(mode: QualityMode): void {
    this.quality.setMode(mode);
  }

  /** compat: antigo toggle "Modo economia" */
  setLowFx(on: boolean): void {
    this.setQuality(on ? 1 : 'auto');
  }

  private applyQuality(s: QualitySettings): void {
    this.q = s;
    this.dprCap = s.dprCap;
    this.fx.budget = s.particleBudget;
    this.limiter.cap = s.fpsCap;
    this.limiter.reset();
    this.resize();
  }
```
`resize()` não muda: já usa `this.dprCap`.

### 5. Loop (substitui `loop` + `trackPerf`)

```ts
  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    // limite de fps (30 no nível Mínimo; em telas 120 Hz segura em 60)
    if (!this.limiter.shouldRender(now)) return;
    const frameMs = now - (this.last || now);
    const real = Math.min(0.05, frameMs / 1000);
    this.last = now;
    const t0 = performance.now();
    if (!this.paused) this.update(real);
    this.render();
    if (!document.hidden) this.quality.sample(frameMs, performance.now() - t0);
  };
```

### 6. Rastro (`update`, chamada de `emitTrail`)

```ts
      const fb = this.fx.budget;
      this.fx.budget = fb * this.q.trailDensity;
      emitTrail(this.fx, this.trail, this.px, this.py, this.vx, this.vy, this.time, PR);
      this.fx.budget = fb;
```

### 7. `render()`

| Bloco | Mudança |
|---|---|
| `// nebulosa` | `if (alpha <= 0.01 \|\| !this.q.nebula) continue;` |
| `// planeta distante decorativo` | `if (far && this.q.farPlanet) {` |
| `// estrelas parallax` | `for (const i of STAR_SETS[this.q.starLayers - 1]) {` no lugar de `for (let i = 0; i < 3; i++) {` |
| `/* ---- mundo ---- */` | `const sh = this.q.shake ? this.trauma * this.trauma : 0;` |
| `// atmosferas (aditivo)` | ver abaixo |
| gema / escudo / ímã / moeda | envolver cada `drawImage(glow(...))` (com seus `globalCompositeOperation`/`globalAlpha`) em `if (this.q.glows) { ... }` |
| `/* ---- pós ---- */` | `if (this.q.vignette) x.drawImage(this.vignette, 0, 0);` |
| `drawAsteroids` (glow vermelho) | `if (this.q.glows \|\| danger) { ... }` (o alerta de perigo continua sempre) |
| `drawHero` (brilho) | `if (this.q.glows) x.drawImage(glow(this.skin.light, 64), ...)`; o glow do foguete continua |

Atmosferas (versão barata = sem `lighter`, halo 1.3× em vez de 1.55×, alpha 0.55):
```ts
    const atmoK = this.q.atmospheres ? 1.55 : 1.3;
    const atmoA = this.q.atmospheres ? 1 : 0.55;
    x.globalCompositeOperation = this.q.atmospheres ? 'lighter' : 'source-over';
    for (const p of this.planets) {
      ...
      if (p.well) {
        ... (igual; remova o `x.globalAlpha = 1;` depois do `x.restore()`)
      }
      const ar = p.r * atmoK * (1 + p.pulse * 0.08);
      x.globalAlpha = atmoA;
      x.drawImage(sp.atmo, p.x - ar, p.y - ar, ar * 2, ar * 2);
    }
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'source-over';
```

## Ajustes (UI) — trocar "Modo economia" por um seletor

`index.html`, no lugar do `<label class="toggle">…Modo economia (celular fraco)…</label>`:
```html
<div class="toggle quality-row">
  <span><span class="plate round sm plate-gold" data-icon="bolt"></span>Gráficos</span>
  <select id="sel-quality" aria-label="Qualidade gráfica">
    <option value="auto">Auto</option>
    <option value="3">Alto</option>
    <option value="2">Médio</option>
    <option value="1">Baixo</option>
    <option value="0">Mínimo</option>
  </select>
</div>
```
(ou 5 botões-pílula em `.seg` se preferir sem `<select>` nativo; os valores são os mesmos).

`src/ui/ui.ts`:
```ts
import { TIER_LABELS, type QualityMode } from '../core/quality';

// no bind dos ajustes (junto do forEach de [data-setting]):
const sel = $<HTMLSelectElement>('#sel-quality');
sel.onchange = () => {
  const v = sel.value;
  this.game.setQuality(v === 'auto' ? 'auto' : (Number(v) as QualityMode));
  this.renderSettings();
};
bus.on('quality', () => this.renderSettings());

// em renderSettings():
const sel = $<HTMLSelectElement>('#sel-quality');
sel.value = String(this.game.quality.mode);
// mostra o nível atual no modo automático: "Auto (Médio)"
sel.options[0].textContent = `Auto (${TIER_LABELS[this.game.quality.tier]})`;
```
Remova `'lowFx'` do tipo da chave em `[data-setting]` e a linha `if (k === 'lowFx') this.game.setLowFx(...)`.
`save.lowFx` pode ficar no `SaveData` (só é lido uma vez, pela migração `migrateLowFx`).

CSS sugerido (`styles.css`):
```css
.quality-row select {
  font: 600 15px Fredoka, system-ui, sans-serif;
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.18);
  border-radius: 12px;
  padding: 6px 10px;
}
```

## Abertura (`src/ui/intro.ts`)

`playIntro(opts?: { short?: boolean }): Promise<void>` — já ligada em `main.ts` (3 linhas: import,
`const intro = playIntro()` antes de `new Game`, `await intro` antes de `initAds()`).
Usa `detectInitialTier()` para reduzir partículas/estrelas/DPR. `?nointro` pula; `?intro=full|short` força a versão.

## Teste do aparelho (instalou / atualizou)

`src/core/devicecheck.ts`, chamado no boot (`src/main.ts`) quando `needsDeviceCheck()` — 1ª abertura,
versão do app mudou (`__APP_VERSION__`) ou o perfil do aparelho mudou (`syncProfileKey()`) — e pelo
Ajustes ("Testar meu aparelho de novo"). Tela: `src/ui/gfxcheck.ts` ("Ajustando os gráficos pro seu aparelho…").

- Perfil (`src/core/device.ts`): GPU (WEBGL_debug_renderer_info), WebGL2, textura máx., float, instancing,
  núcleos, deviceMemory, tela × DPR; no Android o plugin nativo `BloopDevice` (modelo, fabricante, RAM total,
  isLowRamDevice, SDK, GLES, SoC). Tabela `classifyGpu()` → teto por família de GPU.
- Teste 2D: `canvasBenchmark(200)` (antes do 3D). Teste 3D (`src/core/gpubench.ts`): cena fora da tela
  540×960 com chão, grama de lâminas com vento (`GrassField`), árvores instanciadas, pedras soltas e sombras,
  em 3 cargas (orçamento de `natureQ(1..3)`); mediana do quadro com `readPixels` de 1 px; passa se
  ≤ 28 / 17 / 12,5 ms. Prazo duro ~2,4 s (+1,5 s de folga), contexto WebGL liberado no fim.
- Nível = `min(teto, nível 3D, nível 2D + 1)`; teto = `min(hardwareCap(), GPU, RAM/SDK)`. Gravado no cache
  com `method`, `gpuScore`, `dev`, `gpu`. Todo `QualityGovernor` começa no nível medido e usa o teto como
  `maxTier` padrão (o automático nunca passa dele; o modo manual pode).
- Se o app cair no meio do teste 3D, a marca `bo-bench-running` faz a próxima abertura pular o 3D (`method: 'safe'`).
- Economia de bateria (`setBatterySaver`): `settingsFor()` devolve `fpsCap: 30` em todo nível e
  `src/core/framecap.ts` limita o `requestAnimationFrame` do app inteiro a 30 fps (jogos que não leem fpsCap também).
