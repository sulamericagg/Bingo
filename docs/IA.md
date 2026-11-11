# IA no Bloop World — História Mágica (Bloop Cinema)

A criança fala ou escreve uma ideia ("um robô que perdeu o sorvete na praia") e recebe um filme pronto
do Bloop Cinema (cenas, planos, elenco, expressões, poses, câmera, balões, música e efeitos).

## Como funciona

```
app (src/cinema/magic.ts)
  ├─ fala → texto: src/cinema/speech.ts (Android: plugin SpeechRecognition; web: SpeechRecognition; senão digita)
  ├─ POST /api/ai/story { idea, lang, pid, ent }  ──►  Worker server/ai.ts ──► Anthropic Messages API (claude-haiku-5-5)
  │       ◄── { story: StorySpec }                       saída estruturada (json_schema com os ids permitidos)
  ├─ sem chave / sem rede / limite / erro  ──► gerador OFFLINE src/cinema/storygen.ts (sempre funciona)
  └─ StorySpec ─► src/cinema/storybuild.ts ─► projeto do Cinema (docs/CINEMA-FORMATO.md) ─► toca sozinho
```

O roteiro (`StorySpec`, `shared/story.ts`) é compacto e só aceita ids conhecidos (cenários, expressões,
poses, efeitos, sons, câmeras, personagens prontos, músicas grátis). `validateStory()` roda **no servidor e
no app**; ids desconhecidos caem num padrão e textos passam pelo filtro do chat (`shared/moderation.ts`).

## Segredo `ANTHROPIC_API_KEY`

Defina no Worker (nunca no app nem no repositório):

```bash
npx wrangler secret put ANTHROPIC_API_KEY
# ou: painel da Cloudflare → Workers → (worker) → Settings → Variables and Secrets → Add → Secret
```

Sem o segredo a rota responde `503 { error: "no_key" }` e o app usa o gerador offline — o recurso continua
funcionando (só sem a criatividade da IA). Para testar localmente: `.dev.vars` com `ANTHROPIC_API_KEY=...`
(arquivo fora do git).

## Segurança (público 13+, mas pensado para crianças)

- **Entrada**: filtro do chat (`maskLongText`) — contatos/links ou palavrões ⇒ `422 unsafe` (não chama a IA).
  A ideia vai entre aspas como *dado*, nunca como instrução.
- **Prompt de sistema**: histórias gentis e engraçadas, sem violência além de pastelão, sem romance além de
  amizade, sem marcas/personagens reais, sem dados pessoais/links. Ideia inadequada ⇒ a IA marca `safe: false`.
- **Saída**: `stop_reason: "refusal"` ⇒ `unsafe`; JSON validado com `validateStory` + filtro estrito (qualquer
  palavrão/contato ⇒ rejeita o roteiro inteiro). O app valida de novo e passa os textos pelo filtro.
- Nada de voz ou imagem vai para o servidor: só o texto da ideia (a voz vira texto no reconhecedor do aparelho).

## Custo e limites

- Modelo `claude-haiku-5-5` (o mais barato), `effort: low`, roteiro pequeno (≤ 3 cenas × 6 falas).
- **Direito de uso no app** (`src/cinema/magic.ts`): assistir 1 vídeo premiado (`src/services/ads.ts`) = 1 história
  com IA; Cinema Pro (Clube Bloop ou Passe premium) = 10 por dia. Sempre há a "Mágica rápida" offline grátis.
- **Limite no servidor** (KV, por dia): 8/jogador (anúncio) ou 15 (Pro) e 40/IP. Passou ⇒ `429`, o app cai no offline.
  O servidor não consegue provar que o anúncio foi visto: o limite por jogador/IP é a defesa de custo.

## Reconhecimento de voz no Android

`src/cinema/speech.ts` chama o plugin nativo `SpeechRecognition` por `registerPlugin` (sem import do pacote),
então o build web funciona sem ele. Para ligar no APK:

```bash
npm i @capacitor-community/speech-recognition && npx cap sync android
```

(e a permissão `RECORD_AUDIO`, que o app já pede para gravar falas). Se o plugin não estiver instalado o botão
de microfone some e a criança digita. Se o Cava & Fala já tiver trazido um plugin de fala, use o mesmo.

**Já instalado** (junto com a conversa do bichinho): `@capacitor-community/speech-recognition` e
`@capacitor-community/text-to-speech` estão no `package.json` e no `android/` (cap sync).

---

## Conversar com o bichinho (Casa do Bloop)

O jogador conversa com o bichinho na Casa do Bloop (botão **Conversar**): segura o microfone e fala, ou digita.
O bichinho entende e responde com uma frase curta, numa voz escolhida, e anima (emoção + ação).

### Fluxo

```
fala → [aparelho] reconhecimento de voz → TEXTO → POST /api/ai/pet → Claude Haiku → { reply, emotion, action }
                                               ↘ (sem rede / sem chave / erro / limite) → bot local no aparelho
resposta → balão + TTS do aparelho (voz escolhida) + boca/pulinhos/dança
```

| Parte | Arquivo |
|---|---|
| Fala → texto (Android nativo `@capacitor-community/speech-recognition`, pt-BR, parciais; web `SpeechRecognition`; fallback teclado) | `src/pet/talk/stt.ts` |
| Cérebro: servidor + limite diário + fallback | `src/pet/talk/brain.ts` |
| Bot local (offline, ~280 frases pt-BR + variações; en/es curto) | `src/pet/talk/bot.ts` |
| Texto → voz: 14 vozes (tom/velocidade), Android `@capacitor-community/text-to-speech`, web `speechSynthesis` + efeitos WebAudio | `src/pet/talk/tts.ts` |
| Interface (botão, barra, balões, transcrição, seletor de vozes, oferta de vídeo) | `src/pet/talk/ui.ts`, `src/pet/pet.css` |
| Animações (boca no ritmo da fala, emoção/ação) | `src/pet/screen.ts` (`talkReact`, `talkSnapshot`) |
| Servidor (handler) | `server/ai-pet.ts` (rota em `PUBLIC` de `server/index.ts`) |
| Teste do servidor (fetch falso, sem chave real) | `npm run test:ai` (`scripts/test-ai-pet.mjs`) |

### Servidor — `POST /api/ai/pet`

Corpo: `{ pid, lang, text, pet: { name, food, clean, fun, energy, level, sleeping }, history: [{ role: 'user'|'pet', text }] }`
(o app manda os últimos 8 turnos; **nada é guardado no servidor**).

Resposta: `{ reply, emotion, action?, source: 'ai'|'safety', blocked? }`
- `emotion` ∈ happy, love, excited, calm, sleepy, hungry, sad, surprised, silly, shy
- `action` ∈ dance, jump, sleep, laugh, eat (opcional)
- Erros: `503 no_key` (sem chave / chave inválida), `503 busy`, `502 upstream`, `429 rate` → o app usa o bot local.

Modelo `claude-haiku-5-5` via SDK oficial `@anthropic-ai/sdk` (effort `low`, resposta em JSON pedida no prompt).
O prompt de sistema traz personalidade, idioma do jogador, estado (fome/energia/alegria/limpeza) e regras de segurança:
1–2 frases, nada de temas adultos/assustadores, nunca pedir dados pessoais, sugerir um adulto de confiança se a criança
parecer triste ou em perigo, não se dizer humano.

Segurança extra (código, não só prompt): `shared/moderation.ts` na **entrada** (dados pessoais / palavrões → resposta
pronta e gentil, sem chamar a IA), no histórico e na **saída** (resposta trocada por uma segura).

Limites no servidor (KV `DATA`, chaves `aipet:*` com TTL): 8/min por jogador, 160/dia por jogador, 400/dia por IP
(`AI_LIMITS` em `server/ai-pet.ts`).

### Limites do app e monetização

- Grátis: **20 respostas de IA por dia**; acabou → modal "Assistir vídeo +20" (`showRewarded` de `src/services/ads.ts`).
- Pro (`clubActive()` ou `passPremiumActive()`): ilimitado e todas as 14 vozes. Grátis: 3 vozes (Fofinho, Bebê, Esquilo).
- O bot local é sempre grátis e ilimitado (continua respondendo depois do limite).
- Contador fica no aparelho (`localStorage` `bo.petTalk`); o servidor tem seu próprio teto diário.

### Privacidade

A voz vira texto **no aparelho/sistema** (o app não grava nem envia áudio). Só o texto vai ao servidor; nada é
armazenado. Texto explicando isso aparece na primeira vez que o jogador abre "Conversar" e está em
`public/privacy.html`.

### Configurar a chave (ANTHROPIC_API_KEY — a mesma da História Mágica)

Sem a chave tudo funciona no modo offline (bot local). Para ligar a IA:

1. Crie uma chave em console.anthropic.com (de preferência num workspace só para o jogo, com limite de gasto).
2. GitHub → repositório → Settings → Secrets and variables → Actions → **New repository secret**:
   `ANTHROPIC_API_KEY`.
3. O workflow `.github/workflows/deploy-server.yml` grava o segredo no Worker a cada deploy
   (`wrangler secret put ANTHROPIC_API_KEY`), igual ao `ADMIN_PASSWORD`.
   Manualmente: `npx wrangler secret put ANTHROPIC_API_KEY`.
4. Local: `npx wrangler dev --local --var ANTHROPIC_API_KEY:sk-ant-...` (não commitar a chave).

### Testes

- `npm run test:ai` — handler com `fetch` falso (sem rede, sem chave real): sem chave, resposta normal com
  emoção/ação, listas filtradas, dados pessoais/palavrões bloqueados sem chamar a IA, moderação da saída, erro da API,
  limite por minuto.
- Playwright (Pixel 7): 6 turnos offline (fala simulada com `window.__bloopFakeStt = 'texto'` + teclado), resposta do
  servidor simulada (`page.route('**/api/ai/pet')`), seletor de vozes, limite diário → oferta de vídeo.
  Com `?debug`, `window.__bloopTalk` expõe `{ send, history, open, prefs }`.

## Cava & Fala — OBJETO FALADO ("fale qualquer coisa e ela aparece")

Pedido do dono: o jogo constrói QUALQUER coisa que a criança fala, não só receitas prontas. Como no jogo de
referência, o caminho principal **não usa IA**: um gerador determinístico no aparelho entende a frase e monta o
objeto com **blocos** tirados do material cavado.

### Fluxo
1. `world.ts → heardText`: pedido curto e certeiro ("ponte", "trampolim de ouro", "canhão de espuma duplo") continua
   no catálogo fixo de engenhocas (`gadgets.ts`, balanceado para a arena). Qualquer frase descritiva vai para o
   **Maker** (`src/games/cavafala/maker.ts`).
2. `shared/cavaspec.ts → kidSafeRequest`: arma → "lançador de espuma", faca → "colher gigante de brinquedo", bomba →
   "bomba de confete", sangue → "suco de morango", fogo → "faíscas de confete", marcas/personagens → genérico
   ("pikachu" → "ratinho elétrico amarelo"). Palavrão/sexual/ódio/dado pessoal → bloqueado: vira "patinho de
   borracha gigante" e o pedido (só texto) vai para Moderação → Denúncias (`report:…`, motivo `cava-ia:*`).
3. `shared/cavagen` (gerador): ~300 conceitos (bichos, aves, mar, insetos, fantasia, veículos, construções, móveis,
   comida, natureza, robôs, brinquedos) com ~1.700 palavras pt-BR/en/es, plural/diminutivo/aumentativo e erro de
   digitação; adjetivos (tamanho, forma, cor, material, velocidade, quantidade, humor), verbos (voa, nada, pula, joga
   bolhas, sopra, cava, gruda, cresce, brilha, segue, dá pra montar, sons) e composição "X de Y" (tema ou CASCO:
   "barco de banana"), "X com Y" (acessórios: rodas, asas, hélice, molas, balões, luzes...), "X que Z", "X e Y",
   "X no Y". Mesma frase + mesma variante = mesmo objeto em todos os aparelhos.
4. `voxel.ts`: o objeto (peças primitivas) vira blocos; o custo é pelos blocos (`voxelCost`). Faltou um pouco? Faz
   menor (75%/55%). Peças com junta (roda/asa/hélice/mola) viram grupos animados.
5. `creation.ts` + `cbody.ts`: monta com os blocos voando das costas do Bloop, física de corpo composto (de pé,
   contatos tirados dos blocos de baixo) e os comportamentos da lista branca.
6. Só quando sobra palavra desconhecida (ex.: "ornitorrinco") o app chama `POST /api/cava/make` em segundo plano;
   a resposta troca o objeto ("pop") e fica guardada (frase e palavra aprendida) para funcionar OFFLINE depois.

### Servidor — `POST /api/cava/make` (`server/cava-ai.ts`)
`{ text, lang, seed, pid?, ent: 'free'|'club' }` → `{ spec, plan, learn?, source }`.
- Frase que o catálogo entende → `source:'lib'` (sem IA). Cache no KV `cava:obj:<chave>` por 30 dias.
- A IA NÃO desenha livremente: devolve um **plano** com ids do catálogo (base, tema, acessórios, 3 cores da
  paleta, tamanho, comportamentos da lista branca) + até 8 peças extras. O servidor monta com o mesmo gerador e
  revalida tudo (`validateSpec`: ≤ 24 peças, números finitos e limitados, ≤ 10 m e ≤ 140 m³, cores da paleta,
  comportamentos da lista, nome/descrição pelo filtro do chat).
- Modelos: `claude-haiku-5-5` (SDK oficial, saída estruturada `json_schema`, esforço baixo, prompt de sistema em
  cache) se houver `ANTHROPIC_API_KEY`; senão Workers AI `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (JSON mode)
  pelo binding `AI`; senão `503 no_ai` (o app fica com o objeto do aparelho).
- Limites (só pedidos que chegam à IA): 20/min por jogador, 40/dia grátis, 150/dia Clube, 300/dia por IP.
- Custo estimado: prompt ≈ 3–4 mil tokens (cacheado) + ≈ 300 de saída → frações de centavo por pedido no Haiku;
  no Workers AI, poucos "neurons" por pedido. Como o catálogo resolve a maioria e há cache, só palavras novas pagam.
- Teste local sem rede: `--var CAVA_AI_MOCK:fixtures` (respostas fixas em `server/cava-ai-fixtures.ts`).
  `wrangler dev --remote` (Workers AI de verdade) precisa de login da Cloudflare — não testado aqui.

### Online
`'build'` com `id:'@obj'` leva o objeto compacto (`packSpec`, ~1–2 KB). O servidor (CavaRoom) revalida e
reempacota antes de repassar; quem recebe valida de novo (na arena com os limites da arena). Mesmo `uid` = troca
(Refazer / IA melhorou).

### Arena × vila
Arena: lado ≤ 4,5 m, força ≤ 0,6, vida de 30 s, 2 por Bloop, custo com teto menor. Vila: até 10 por jogador;
ponte/barco/guindaste contam para a ponte quebrada, bomba d'água/fonte/poço para a praça alagada, escadas/rampas
para subir.

### Testes
`node scripts/test-cava-make.mjs` — validador (JSON malicioso/gigante), pedido seguro, gerador (200 frases
aleatórias válidas e determinísticas, cobertura em 300 frases), montador (20 objetos, 10 s de física sem NaN) e
endpoint (catálogo, cache, fixtures, Claude falso, Workers AI falso, 422, 429).
