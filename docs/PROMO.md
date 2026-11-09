# Material promocional (vídeos + imagens)

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
Tempo típico: 4–7 min. Não precisa de `vite build`: o script sobe um servidor Vite próprio
(porta 4341 ou a próxima livre), abre o jogo com `?debug` e controla tudo.

### Card de desafio (código promocional)

```bash
NODE_PATH=$(npm root -g) node scripts/promo/challenge-card.mjs \
  --code BLOOP2026 --reward "500 moedas + skin" --goal "Faça mais de 100 pontos" \
  --until "30/11" --out desafio.png
```

Opções extras: `--skin <id>` (personagem em destaque, padrão `campeao`), `--where "texto"` (onde
resgatar; padrão "Resgate dentro do jogo"), `--w/--h`.

## O que é gerado

```
<saida>/videos/
  trailer-vertical-1080x1920.mp4    ~28 s  Reels / TikTok / Shorts (H.264 + AAC)
  youtube-horizontal-1920x1080.mp4  ~28 s  YouTube / vídeo da Google Play
  short-loop-1080x1080.mp4           10 s  post de feed, loop sem emenda
<saida>/images/store/
  01..06-*.png (1080x1920)   screenshots da Play Store com título
  07-criador.png             só se existir #btn-creator no jogo
  08-corrida.png             só se existir #btn-race no jogo
  feature-graphic-1024x500.png
<saida>/images/social/
  instagram-post-{1,2,3}-1080x1080.png, story-{1,2}-1080x1920.png,
  youtube-thumbnail-1280x720.png, x-header-1500x500.png
<saida>/images/challenge/desafio-exemplo-1080x1920.png
<saida>/images/brand/teamross-1024.png (+ versão com fundo transparente)
```

### Roteiro do trailer (125 BPM, cortes nas batidas)

1. Gancho (0–2,4 s): "SÓ UM TOQUE." sobre ação.
2. "POUSO PERFEITO!" com câmera lenta automática no pouso.
3. "5 GALÁXIAS": 4 cortes rápidos, cada um na virada de bioma (warp), com o nome da galáxia.
4. "35+ PERSONAGENS": 4 cortes com skins diferentes (o número vem do catálogo `SKINS`).
5. "DESTRUA ASTEROIDES!", "CADA VEZ MAIS RÁPIDO!" (trecho acelerado 1,55x),
   "CORRIDA COM 5 JOGADORES" (só se `#btn-race` existir), "QUAL É O SEU RECORDE?".
6. Cartão final animado: logo, "Um jogo da TEAM Ross", selo "Grátis na Google Play"
   (texto próprio — **não** usamos a arte oficial do selo do Google).

Transições `xfade` (flash branco, zoom, whip/smooth, blur), zoom lento em cada corte, textos com
animação "pop". Música sintetizada pelo próprio script (`lib/music.mjs`: bumbo, palmas, chimbal,
baixo, pad e arpejo em I–V–vi–IV) com whooshes nos cortes e impactos nos destaques — 100% original,
sem direitos de terceiros.

## Como funciona

| Arquivo | Papel |
|---|---|
| `scripts/promo/make-all.mjs` | Orquestra tudo; lista de clipes, roteiro, textos e imagens. |
| `scripts/promo/lib/capture.mjs` | Abre o jogo, injeta o save, **relógio virtual** (rAF/`performance.now`), `Math.random` com semente e o **bot**. Cada quadro é um screenshot enviado ao ffmpeg. |
| `scripts/promo/lib/edit.mjs` | Cortes/transições, textos, versão horizontal (fundo desfocado + painéis), loop. |
| `scripts/promo/lib/music.mjs` | Trilha + efeitos sintetizados (WAV). |
| `scripts/promo/promo.html` + `promo.ts` | Página de composição (canvas) que importa os módulos do jogo: textos, cartões finais, screenshots da loja, posts, etc. |
| `scripts/promo/teamross.ts` | Marca do estúdio (monograma "TR" com órbita). Troque aqui quando houver logo oficial. |
| `scripts/promo/challenge-card.mjs` | CLI do card de desafio. |

Detalhes:

- **Determinismo:** o tempo do jogo só avança quando o capturador manda (30 qps, com sub-passos de
  16,7 ms), então a gravação é suave mesmo numa máquina lenta e o resultado se repete entre execuções.
- **Bot "humano":** mira no centro do próximo planeta (pousos perfeitos, coleta as moedas da trilha),
  espera um pouco em cada planeta e às vezes erra de propósito (pouso na borda). Durante a gravação o
  Bloop atropela asteroides em vez de morrer e planetas frágeis não explodem com ele em cima. Se ainda
  assim morrer, o clipe é regravado com outra semente.
- **Biomas:** cada clipe pode começar em qualquer planeta (`startN`; 20 planetas por bioma), por isso
  os cortes mostram o warp de entrada em cada galáxia sem jogar minutos.
- **Câmera lenta / aceleração:** feitas na captura (o relógio virtual anda mais devagar/rápido), não
  no ffmpeg — ficam 100% fluidas.
- **Limpeza da tela:** botão de pausa, tutorial, banners e toasts são escondidos; anúncios não carregam
  (toda rede externa é bloqueada); o save injetado desliga som/dicas e mostra um jogador veterano.
- **Recursos opcionais:** `#btn-race` e `#btn-creator` são detectados no DOM; textos e screenshots
  correspondentes só aparecem se existirem. Contagens (personagens, rastros, galáxias) são lidas do código.

## Ajustes comuns

- Trocar personagens/rastros dos clipes: lista `CLIPS`/`STILLS` em `make-all.mjs`.
- Trocar textos: chamadas `add(...)` (vídeo) e `store` (screenshots) em `make-all.mjs`.
- Layouts das artes: funções `K.<tipo>` em `promo.ts`.
- Pré-visualizar uma arte: `npx vite` e abrir `/scripts/promo/promo.html`, depois no console
  `__promo.render({kind:'post',variant:1,w:1080,h:1080})`.

## Limitações conhecidas

- Os vídeos não usam o áudio real do jogo (WebAudio não é capturável de forma confiável em headless);
  a trilha é sintetizada.
- Animações CSS do HUD (o "pop" do placar) rodam em tempo real e não no relógio virtual — imperceptível.
- A tela da corrida/criador (se existirem) é fotografada logo após clicar no botão; se a tela precisar de
  rede/servidor, a captura pode mostrar um estado de carregamento — confira a imagem.
- Os arquivos gerados não vão para o git (são grandes); rode o script para recriá-los.
