# Áudio do Bloop World

> "O segredo é música e sons deliciosos — cada jogo com o SEU som."

Tudo é **sintetizado** (WebAudio), sem arquivos de áudio, nada copiado de outros jogos/marcas.
Código: `src/audio/` · audição: `scripts/dev/audio.html` · render/estatísticas: `scripts/dev/audio-render.mjs`.

---

## 1. Auditoria (antes desta mudança)

| Onde | O que existia | Problema |
|---|---|---|
| `src/core/audio.ts` | ~15 sons genéricos (click, coin, cash, hit, crack, jump, land, perfect, gem, unlock2, record, fail, tick, siren, nearMiss) + motor + **uma música generativa única** (Lá menor, 96 bpm) tocando em TODO lugar | Todos os jogos soavam iguais; a mesma música no hub, no Noites, na Cozinha, no Garimpo… |
| `src/3d/common/sfx.ts` | ~40 sons 3D genéricos (chop, thud, pop, sparkle…) | **Criava um 2º AudioContext** (fora dos barramentos, ignorava o slider/ducking); mesmo "chop" para machado e faca |
| `src/music/songs/*` | Catálogo/sintetizador da **Bloop Banda** (260 músicas, charts) | Específico do jogo de ritmo; mantido como está |
| `src/pass/music.ts`, `src/pass/ui.ts` | prévias das músicas do passe (AudioContext próprio) | ok (prévias curtas) |
| `src/home/sfx.ts`, `src/pet/sfx.ts`, `src/pet/voice.ts` | sons da Casa/Bichinho no barramento do core | ok (continuam funcionando via fachada) |
| `src/intro3d/sting.ts` | vinhetas das intros 3D (via `audio.fxOut()`) | ok |
| `src/cinema/audio.ts` | mixer próprio (música/voz/efeitos) do Cinema | ok, trilha própria |
| `src/mirror/voice-fx.ts`, `src/games/cavafala/voice.ts` | microfone (AudioContext próprio para análise) | ok |
| Ajustes | só interruptores **Som** e **Música** | sem volume |

### Por jogo (antes → identidade alvo → agora)

| Jogo | Antes | Identidade alvo | Agora |
|---|---|---|---|
| **Hub** | clique genérico, música genérica | pops de bolha, deslizar de cartas, moedas/gemas brilhando, fanfarra de presente | pacote `hub` + tema "Bolhas" (Fá maior, marimba/kalimba) + `swipe`/`open` ganchados |
| **Orbit** | sons do core (eram "os" sons do app) | synth espacial | pacote `orbit` + tema "Synth espacial" (Lá dórico, sub + sininho, arpejo 16 avos na tensão) |
| **Tubo** | core genérico | fliperama | pacote `tubo` (chip) + tema "Fliperama" (Mi mixolídio 128 bpm) |
| **Rally** | core genérico + motor | estrada | pacote `rally` (motor kart, buzina, contagem) + tema rock 144 bpm |
| **Tycoon** | core genérico | negócio | pacote `tycoon` (caixa registradora) + tema bossa com swing |
| **Cozinha** | core + 3D genéricos | chiado, faca, plim, burburinho | pacote `cozinha` (faca na tábua, chapa, campainha, timer, pratos macios) + valsa de bistrô (acordeão) + ambiente (burburinho, chiado, tilintar) |
| **Noites** | 3D genérico, quase nada | fogueira, grilos, corujas, vento; machado, toras; bichos fofos | pacote `noites` (machado em madeira, tora caindo, rangido, rosnado fofo) + tema "Fogueira e estrelas" (Ré dórico 72 bpm; noite = tambor grave + cordas) + ambiente dia/noite (passarinhos ↔ grilos/corujas/sapos, fogueira, vento) |
| **Mundo/Floresta** | `tick`/`crack` genéricos para tudo | cavar/quebrar por material, passos por chão, pássaros/vento/gotas | pacote `floresta` (dig/break/step × terra, pedra, madeira, areia, vidro/cristal, folhas, neve, metal) + tema lídio "Blocos sonhadores" + ambiente; **gancho**: cavar toca o material dominante |
| **Garimpo** | core genérico + alguns sons próprios (consertos, trovão, rádio) | diesel com RPM, hidráulico, terra, água, ouro, detector | pacote `garimpo` (motor diesel, pepita, detector, hidráulico, despejo de terra) + tema viola caipira/sanfona/zabumba + ambiente rio/pássaros |
| **Desastre** | core genérico (sirene estridente) | sirenes, tremor, vento, água — sem susto | pacote `disaster` ("ni-nó" macio, tremor grave, vento/água em loop) + tema resgate heroico (Dó menor harmônico) |
| **Voo** | core + 3D genéricos (sirene!) | sininhos de cabine, turbina, aviso de bordo | pacote `voo` (motor jato, `siren` vira **ding-dong de bordo**, cinto) + lounge lídio + zumbido de cabine |
| **Anomalias** | áudio próprio rico (zumbido, pisca-pisca, obturador, "nhac") | — | mantido; pacote só afina o clique e **desliga a música do app** |
| **Monta & Leva** | trilha e efeitos próprios | — | mantido; música do app desligada no jogo |
| **Cava & Fala** | só cliques | pá raspando, "poofs" de engenhoca | pacote `cavafala` + tema engenhocas (marimba/órgão) |
| **Cinema / TV** | mixer próprio (Cinema); TV é painel | vinhetas leves | pacote `cinema` (sem música do app) e `tv` (tema vinheta, para uso futuro) |
| **Desenha e Vira** | 3D genérico | ateliê | pacote `desenho` (lápis, "poof" mágico) + valsa caixinha de música/harpa |
| **Bloop no Lugar** | `lugar/sfx.ts` próprio | quebra-cabeça calmo | mantém os efeitos próprios; tema kalimba/piano elétrico sem bateria |
| **Pintou Ganhou** | core genérico | pop de cores | pacote `cor` + tema pop (ocarina, pluck) |
| **Caça** | core genérico | expedição | pacote `caca` (ping de radar) + tema violão/flauta/congas |
| **Estúdio** | 3D genérico | criativo | pacote `studio` + tema piano elétrico/pluck |
| **Banda** | músicas próprias (`music/songs`) | manter | mantido; música do app desligada |
| **Bichinho / Espelho** | sons próprios (painéis) | — | inalterados (usam o barramento do motor via fachada) |
| **Jangada** | (outro agente) | — | não mexido; API documentada abaixo |

---

## 2. Arquitetura

```
src/audio/
  engine.ts        AudioContext ÚNICO, barramentos, ajustes, ducking, ouvinte 3D, destravar/pausar
  dsp.ts           blocos de síntese (tone, noise, bell FM, knock ressonante, grains, envelopes, ruído em cache)
  sound.ts         pacotes, cache OfflineAudioContext + normalização de nível, limite de vozes, variação, 3D
  ambience.ts      camadas em loop + eventos aleatórios por pacote (dia/noite) e Motor (kart/diesel/hélice/jato/elétrico)
  music/inst.ts    ~30 instrumentos + 16 peças de percussão sintetizados (Karplus-Strong p/ viola/violão/harpa)
  music/player.ts  tema → Deck (agendador com antecipação), camadas por estado, melodia composta pela semente, vinhetas
  music/themes.ts  18 temas por jogo
  music/index.ts   music.play / setState / sting / pause / renderTheme (offline)
  packs/lib.ts     receitas parametrizadas (bolha, madeira, pedra, areia, vidro, fogo, grilos, vento, rio…)
  packs/*.ts       base + 22 pacotes de jogos
  glue.ts          UM lugar: game-launch / host-close / hub-show / run-end → pacote + tema + ambiente
  settings-ui.ts   sliders Volume / Música / Efeitos nos Ajustes
  hooks.ts         ajudantes dos ganchos "// AUDIO" dos jogos
  index.ts         API pública
```

**Fachadas (compatibilidade, nenhum jogo precisou mudar):**
`core/audio.ts` (`audio.click()`, `coin(n)`, `hit()`, `siren()`, `engineStart/Set/Stop`, `setIntensity`, `fxOut()`, internos
`ctx/sfxBus/musicBus/master/reverb`) e `3d/common/sfx.ts` (`sfx.chop()`, `thud()`, …) agora tocam o som do **pacote do
jogo aberto** (cai no `base` se o pacote não tiver o nome). Ex.: `sfx.chop()` = machado no Noites, faca na Cozinha.

**Barramentos:** `music → duck → master`, `sfx ← ui, amb(duck)`, `voice`; cada barramento com reverb próprio antes do
ganho (desligar a Música desliga o eco dela). `master → limitador (−10 dB, 8:1) → saída`.

**Ajustes:** `save.sound`/`save.music` (interruptores existentes) × mixer local (`localStorage['bw-audio-mix']`, por aparelho):
Volume / Música / Efeitos com curva quadrática. Sliders com ícone primeiro, rótulos reaproveitam chaves i18n existentes
(`cin.dub.volume`, `settings.music`, `settings.sound`) — nenhuma string nova.

**Ciclo de vida:** destrava no 1º toque/tecla (captura global); suspende com `visibilitychange` (o `main.ts` já cobre o
`pause`/`resume` do Capacitor via `audio.suspend/resume`); a música não "corre atrás" do tempo perdido ao voltar.

**CPU:** efeitos pré-renderizados em buffer (3 variantes por som) quando o pacote do jogo é ativado; tocar = 1
BufferSource. Música agendada 250 ms à frente num `setInterval(50ms)`; camadas desligadas não agendam notas. Máx. 28
vozes de efeito (rouba a mais antiga), máx. por som (padrão 4).

**Nível (gain staging):** cada som é normalizado no cache para um nível de referência (RMS da janela de 300 ms mais forte:
efeitos −20 dBFS, UI −25, voz −19, ambiente −26; `db` ajusta relativo) com teto de pico −1 dBFS. Temas calibrados para
~−18 LUFS crus (Noites −20, Lugar −19.5). Mixagem padrão do app (Volume 100, Música 80, Efeitos 100) medida em
**−15 a −18 LUFS integrado, pico ≤ −1 dBFS, zero clipping** (ver `audio-out/report.txt`).

---

## 3. API para jogos (inclui a Jangada)

```ts
import { sfx, music, ambience, definePack, Motor, lib } from '../../audio';

sfx.play('axe');                         // nome do pacote ativo (cai no 'base')
sfx.play('noites.owl', { pan: -0.6, db: -3, rate: 1.1 });
sfx.at('chop', x, y, z);                 // 3D (PannerNode) — atualize o ouvinte:
sfx.listener(cam.x, cam.y, cam.z, dir.x, dir.y, dir.z);
sfx.material('break', 'stone');          // dig | break | step × dirt|stone|wood|sand|glass|leaves|snow|metal
const h = await sfx.loop('disaster.windRoar'); h?.stop(1);
sfx.duck(0.5, 0.8);                      // abaixa a música (fala/aviso)

music.play('noites');                    // null = silêncio (jogo com trilha própria)
music.setState('tension');               // 'calm' | 'tension' | 'victory' — 1 chamada, transição suave
music.setState('victory', { bars: 4 });  // volta ao calm depois de 4 compassos
music.sting('win');                      // 'win' | 'lose' | 'levelup' | 'item' | 'start' no tom/timbre do tema
music.pause(); music.resume();

ambience.start('noites'); ambience.stop();
const m = new Motor({ kind: 'diesel', idle: 34, top: 78, vol: 0.1 }); m.set(acel, vel); m.stop();
```

**Pacote próprio** (ex.: Jangada) — basta registrar com o MESMO id do jogo no hub; o `glue.ts` liga pacote, tema e
ambiente sozinho quando o jogo abre:

```ts
import { definePack, lib } from '../../audio';
const { S, splash, woodHit, streamBed, windBed } = lib;
definePack({
  id: 'jangada', name: 'Jangada', theme: 'garimpo' /* ou um tema novo em music/themes.ts, ou null */,
  sounds: {
    paddle: S(splash(0.4), 0.5),
    plank: S(woodHit(260, 0.5), 0.3),
    click: S(lib.woodClick(1000, 0.4), 0.1, { bus: 'ui' }),       // sobrescreve audio.click() dentro do jogo
    sea: S(streamBed(0.3, 8), 8, { loop: true, stereo: true, bus: 'amb' }),
  },
  amb: { layers: [{ id: 'sea' }] },
});
```
Jogo **sem** pacote registrado: sons `base`, sem música do app (silêncio) — nada quebra.

Receita = `(v: V) => void` com `v.c` (contexto), `v.out`, `v.t`, `v.r()` (sorteio determinístico por variante). Use os
blocos de `dsp`/`lib`; ataques ≥ 2 ms, passa-baixa por padrão.

---

## 4. Ganchos `// AUDIO` nos jogos (para resolver merges)

| Arquivo | Linha | Mudança |
|---|---|---|
| `src/games/floresta/world/worldgame.ts` | imports | `+ import { digSound } from '../../../audio/hooks'; // AUDIO` |
| `src/games/floresta/world/worldgame.ts` | `carve()` (após `this.burst(machine ? 16 : 10, …)`) | `- audio.tick(1);` → `+ digSound(counts, machine); // AUDIO: som do material cavado …` |
| `src/hub/hub.ts` | imports | `+ import { play } from '../audio/sound'; // AUDIO` |
| `src/hub/hub.ts` | `go(i)` | `- audio.click();` → `+ play('hub.swipe'); // AUDIO: deslizar de carta …` |
| `src/hub/hub.ts` | clique de painel na barra inferior | `+ play('hub.open'); // AUDIO` (após `haptics.tap('light')`) |

Arquivos compartilhados reescritos (API idêntica): `src/core/audio.ts`, `src/3d/common/sfx.ts`.

---

## 5. Audição e verificação

- `npx vite --port 5371` → `http://localhost:5371/scripts/dev/audio.html`: um cartão por pacote com botão por som,
  "entrar no jogo" (pacote+tema+ambiente), tema por estado (calm/tension/victory), vinhetas, ambiente e motor com acelerador.
- `node scripts/dev/audio-render.mjs [themes|mixes|sounds|all]` → `audio-out/` (fora do git): `themes/<tema>.wav`
  (30 s: calm → tension → victory + vinheta), `mixes/<jogo>.wav` (20 s com música + ambiente + efeitos nos ganhos do
  app), `report.txt/json` (pico, RMS, LUFS aprox. BS.1770, clipping).

## 6. Pendências / ideias

- **TV Bloop** é painel (não dispara `game-launch`): feito — `music.pause()` ao abrir e `music.resume()` ao fechar (`src/cinema/tv.ts`).
- **Banda** e prévias do **Passe** usam AudioContext próprio: o slider de Volume não as afeta (respeitam os interruptores).
- Sons 3D posicionais: a API existe (`sfx.at` + `sfx.listener`), mas nenhum jogo atualiza o ouvinte ainda (Noites/Mundo/Garimpo seriam os primeiros).
- Mundo: passos por superfície (`sfx.material('step', …)`) e gotas de caverna (`floresta.drip` / `caveBed`) prontos, faltam ganchos no movimento/caverna.
- Garimpo: `hydraulic`, `dirtPour`, `gold`, `detectorStrong` prontos para ganchos nas máquinas/bateia.
- Noites: `axe`/`logDrop`/`growl` disponíveis por nome; hoje o jogo já soa certo via `chop`/`thunk`/`bump`.
