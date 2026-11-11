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
