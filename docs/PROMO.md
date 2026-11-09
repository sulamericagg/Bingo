# Material promocional do Bloop World (vídeos + imagens)

Pipeline automático que gera trailers editados e artes de loja/redes sociais **a partir do jogo real**
(mesmo código, mesmos sprites, personagens e rastros). Pode ser rodado de novo a qualquer momento —
por exemplo depois que novos recursos entrarem — e o material sai atualizado.

## Como rodar

```bash
NODE_PATH=$(npm root -g) node scripts/promo/make-all.mjs <pastaDeSaida>
# opções:
#   --only=videos | --only=images   gera só uma parte
#   --jobs=3                        capturas em paralelo (padrão 3)
#   --keep-tmp                      mantém <saida>/.tmp (clipes brutos, textos) para depuração
```

Requisitos: `node_modules` instalado (Vite), Playwright + Chromium (global ou local:
`npm i -g playwright && npx playwright install chromium`) e `ffmpeg` com `libx264` e `aac`.
Tempo típico: ~10–15 min com `--jobs=3` (4 núcleos). Não precisa de `vite build`: o script sobe um servidor Vite próprio
(porta 4341 ou a próxima livre), abre o app com `?debug&nointro` e controla tudo.

### Card de desafio (código promocional)

```bash
NODE_PATH=$(npm root -g) node scripts/promo/challenge-card.mjs \
  --code BLOOP2026 --reward "500 moedas + skin" --goal "Faça mais de 100 pontos" \
  --until "30/11" --out desafio.png
```

Opções extras: `--skin <id>` (personagem em destaque, padrão `campeao`), `--where "texto"` (onde
resgatar; padrão "Resgate dentro do jogo"), `--w/--h`.

## O que é gerado (Bloop World — hub com 6 jogos)

```
<saida>/videos/
  trailer-vertical-1080x1920.mp4     ~37 s  Reels/TikTok/Shorts (H.264 + AAC)
  youtube-horizontal-1920x1080.mp4   ~37 s  YouTube (vertical no centro + painéis laterais)
  playstore-promo-1920x1080.mp4      ~30 s  "vídeo promocional" da Play Store (subir no YouTube)
  short-loop-1080x1080.mp4            10 s  post de feed, loop sem emenda
  teasers/teaser-<jogo>-1080x1920.mp4 15 s  um por jogo: orbit, tubo, rally, tycoon, disaster, band
<saida>/images/store/
  phone/01..08-*-1080x1920.png        hub, Orbit, Banda, Desastres, Queda, bichinho, casa, passes
  tablet-7/*-1200x1920.png  (4)       capturas feitas na proporção do tablet
  tablet-10/*-1600x2560.png (4)
  feature-graphic-1024x500.png        logo Bloop World + vitrines dos jogos + personagens
  en/, es/                            feature graphic + 2 primeiros screenshots com títulos traduzidos
<saida>/images/social/   instagram-post-{1,2,3}, story-{1,2}, youtube-thumbnail, x-header
<saida>/images/challenge/desafio-exemplo-1080x1920.png
<saida>/images/brand/    teamross-1024(.png/-transparente), icon-bloopworld-{1024,512,foreground-1024}.png
```

O ícone `icon-bloopworld-*` é uma **opção** de ícone no estilo hub (Bloop sobre um mundinho com selos
dos jogos em órbita). `assets/icon-*.png` não é alterado — o líder decide se troca.

### Roteiro do trailer (125 BPM, cortes nas batidas)

1. "UM MUNDO DE JOGOS" sobre o carrossel do hub passando pelos 6 jogos.
2. "6 JOGOS": cortes rápidos Orbit → Queda Giratória → Rally Lunar → Fábrica Estelar → Desastres → Banda.
3. "SEU BICHINHO FALA COM VOCÊ", "MONTE SUA CASA E SEU PLANETA", "FESTA COM GUERRA DE COMIDA EM 3D",
   "TOQUE NA BANDA COM SEUS AMIGOS", "SOBREVIVA AOS DESASTRES", "300 CRIATURAS", "PASSES TODO MÊS".
4. Cartão final: logo Bloop World, "Um mundo de jogos", "Um jogo da TEAM Ross", pílula "Grátis na Google
   Play" (texto próprio — **não** usamos a arte oficial do selo do Google).

O vídeo da Play Store usa um corte próprio (~30 s: hub, 6 jogos com o nome de cada um, bichinho, casa 3D,
criaturas). Os teasers mostram ~12 s de jogo com uma chamada + cartão final do jogo ("Um dos 6 jogos do
Bloop World"). Música sintetizada pelo próprio script (`lib/music.mjs`) — 100% original.

## Como funciona

| Arquivo | Papel |
|---|---|
| `scripts/promo/make-all.mjs` | Orquestra tudo: lista de telas, roteiros, textos, imagens. |
| `scripts/promo/lib/scene.mjs` | Captura genérica de qualquer tela do app: relógio virtual, `Math.random` com semente, save injetado, rede bloqueada. |
| `scripts/promo/lib/recipes.mjs` | **Receitas** por tela (hub, tubo, rally, tycoon, disaster, band, pet, home, home3d, creatures, pass): como abrir e o "bot" de cada jogo. |
| `scripts/promo/lib/capture.mjs` | Bot do Bloop Orbit (pousos perfeitos, câmera lenta) — o Orbit é aberto pelo hub. |
| `scripts/promo/lib/edit.mjs` | Cortes/transições, textos, versão horizontal, loop. |
| `scripts/promo/lib/music.mjs` | Trilha + efeitos sintetizados (WAV). |
| `scripts/promo/l10n.mjs` | Títulos das artes da loja em pt/en/es. |
| `scripts/promo/promo.html` + `promo.ts` | Composição (canvas) com os módulos do jogo: textos, cartões, screenshots, ícone, posts. Usa as **vitrines** (`drawShowcase`) dos jogos do registro do hub. |
| `scripts/promo/teamross.ts` | Marca do estúdio. |
| `scripts/promo/challenge-card.mjs` | CLI do card de desafio (marca Bloop World). |

Detalhes:

- **Telas gravadas:** tudo roda no app real (`index.html?debug&nointro`; casa 3D em
  `scripts/dev/home3d.html?auto=party&skip`, Chromium com `--use-gl=swiftshader`). Jogos são abertos com
  `__bloop.launchGame(def)` e o handle do jogo fica em `window.__h`; painéis com `panel.open()`.
- **Bots:** Queda Giratória mergulha só quando há abertura embaixo; Rally acelera e solta quando o carro
  inclina; Desastres usa `autoMe`; Banda usa `autoplay` numa música grátis; Fábrica usa `?tymode=match`
  (acelerado 2x); Orbit usa o bot antigo.
- **Robustez:** cada tela é tentada 2x (Orbit 3x); se falhar, é pulada com aviso e os vídeos/imagens
  seguem sem ela. O resumo final lista os avisos.
- **Relógio virtual:** `performance.now` só anda quando o capturador manda. Laços de benchmark
  (`while (performance.now() - t0 < X)`, ex.: `core/quality.ts`) travariam a página; depois de 400 leituras
  sem passo o relógio "escorrega" 0,5 ms por leitura, o que só afeta esses laços.
- **Saves injetados:** jogador veterano (moedas, gemas), qualidade fixa no máximo (`bo-quality=3`),
  Desastres fora do modo treino; a Coleção recebe ~2/3 das criaturas.

## Ajustes comuns

- Trocar/ajustar uma tela: `RECIPES` em `lib/recipes.mjs`; duração das capturas em `CLIP_SEC` (make-all).
- Trocar textos dos vídeos: `trailerPlan`/`storePlan`/`GAME_HOOK` em `make-all.mjs`.
- Títulos dos screenshots e traduções: `l10n.mjs`.
- Layouts: funções `K.<tipo>` em `promo.ts` (`store`, `featureworld`, `gameend`, `icon`, `post`...).

## Limitações conhecidas

- Os vídeos não usam o áudio real do jogo (WebAudio não é capturável de forma confiável em headless);
  a trilha é sintetizada.
- Animações CSS do HUD (o "pop" do placar) rodam em tempo real e não no relógio virtual — imperceptível.
- A tela da corrida/criador (se existirem) é fotografada logo após clicar no botão; se a tela precisar de
  rede/servidor, a captura pode mostrar um estado de carregamento — confira a imagem.
- Os arquivos gerados não vão para o git (são grandes); rode o script para recriá-los.
