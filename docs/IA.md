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
