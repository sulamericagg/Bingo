# Loja de Criações + TV Bloop (conteúdo dos jogadores)

Dois lugares onde jogadores (13+) publicam coisas para os outros:

- **Loja de Criações** (Bloop Studio): objetos, veículos, mapas e Jogos da Comunidade. Outros curtem, favoritam,
  "Usam no meu mapa" e jogam.
- **TV Bloop** (Bloop Cinema): um canal **ao vivo** com os filmes aprovados. Todo mundo assiste ao mesmo filme, no mesmo
  segundo; o mais votado passa mais vezes.

Regra de ouro: **nada aparece para os outros sem aprovação humana** (painel → 🛡️ Moderação, `docs/PAINEL-ADMIN.md`).
Regras numéricas (limites, moedas, tetos): `shared/ugc.ts` (`UGC`, `TV`) — app e servidor usam o mesmo arquivo.

## Fluxo

```
Studio "Publicar" ─┐                                 ┌─ aprovado ─► Loja ("Em alta", "Novos", busca, categorias)
                   ├─► fila (pending) ─► Moderação ──┤
Cinema "Enviar     │    filtro de texto automático   ├─ recusado (motivo) ─► autor vê "Recusada: …"
 para a TV" ───────┘    + 3 miniaturas p/ revisão    └─ filme aprovado ─► TvChannel (grade ao vivo)
denúncias ≥ 3 pessoas ─► aprovado vira "hidden" (sai do ar) ─► volta para a fila
```

- **Filtro automático** (`shared/moderation.ts` + palavras extras do painel): título, descrição e etiquetas com palavrão ou
  dado pessoal são **recusados na hora** (erro `name`); textos de dentro da criação/filme (nomes de peças, blocos "dizer",
  textos da missão, falas, nomes do elenco) só são **marcados** para o moderador ver.
- **IA das vozes e balões (filmes)** — `server/voice-mod.ts`, antes da fila humana (veja a seção abaixo).
- **Miniaturas**: o app manda 3 fotos pequenas (JPEG/WebP ≤ 60 KB cada). Não há classificador de imagem: o moderador olha.
- **Vozes dos filmes**: vão junto (base64) e o moderador ouve no painel antes de aprovar.
- Reenviar (mesmo id) volta para `pending` e, no caso de filme, tira do canal até a nova revisão.

## IA das vozes (TV Bloop)

No `POST /api/tv/submit`, antes de entrar na fila:

1. **Transcrição**: cada voz passa pelo Whisper do **Workers AI** (`@cf/openai/whisper-large-v3-turbo`, base64; se falhar,
   `@cf/openai/whisper` com os bytes), dica de idioma = idioma do app. Sem o binding/erro: usa a transcrição que o aparelho
   fez durante a gravação (`clips[id].tx`) e marca "ouça antes de aprovar"; sem nenhuma: "sem transcrição".
2. **Filtro** (`shared/moderation.ts → scanText`) nas transcrições **e** nos balões: `bad` (palavrão/termo sexual, com
   disfarces) ou `pii` (telefone — também por extenso —, e-mail, link, @perfil, endereço, nome de escola, "meu zap"...) =
   **recusa automática**; `mild` (insulto que depende do contexto: "feio", "burro"...) = destaque para o humano.
3. **Claude (opcional)**: com `ANTHROPIC_API_KEY`, as transcrições e balões vão para `claude-haiku-5-5` com saída JSON
   estrita (`ok | review | reject` + itens: palavrões, bullying, sexual, dado pessoal...). `reject` recusa, `review`
   destaca; erro = segue só o filtro. `AI_LLM_CHECK=0` desliga.
4. **Resultado**: recusa → o item entra **já recusado** (revisor "IA (automático)", motivo gentil "Tem uma palavra que não
   pode na TV na fala 2. Regrave essa fala!"), **não gasta o limite diário**, e a resposta é
   `{ ok:false, error:'ai', ai: { why, lines:[{id,n,text}] } }` — o app mostra o motivo e o botão "Regravar a fala N"
   (abre a dublagem nela). Passou → fila humana com o selo **🤖 IA: ok** (ou "atenção" / "só aparelho"). Nada vai ao ar
   sem um humano.
5. **Painel**: selo da IA na fila; no detalhe, cada fala mostra balão, áudio e "o que a IA ouviu" com os trechos
   destacados. Relatório completo no KV `ugc:fm:<id>` (apagado junto com o filme).

**Para ligar na Cloudflare (dono):** o binding já está no `wrangler.jsonc` (`"ai": { "binding": "AI" }`) — basta o deploy.
Workers AI precisa estar disponível na conta (painel → AI → Workers AI; o plano grátis tem uma cota diária de "neurons",
o pago cobra por uso). Opcional: segredo `ANTHROPIC_API_KEY` (já usado pela História Mágica) para a checagem do Claude.

**Teste local:** o `wrangler dev --local` não roda Workers AI ("AI: not supported"). Use
`--var AI_STT_MOCK:device`: o servidor trata a transcrição do aparelho como se fosse a do Whisper (e o painel marca
"transcrição simulada"). No teste automatizado a fala→texto do aparelho é simulada com `window.__bloopFakeStt`:

```bash
npx vite build && npx wrangler dev --local --port 8799 --var AI_STT_MOCK:device --var ADMIN_PASSWORD:senha-local --var UGC_MIN_AGE_H:0
node scripts/dev/test-cinema-easy.mjs http://localhost:8799 /tmp/shots --submit
```

## Moedas de criador (sempre moedas do jogo, nunca dinheiro)

| Evento | Moedas | Conta quando |
|---|---|---|
| curtida (Loja) | `perLike` = 1 | 1ª curtida de cada pessoa, para sempre (descurtir/curtir de novo não rende) |
| "Usar no meu mapa" | `perUse` = 5 | 1× por pessoa por criação |
| "Jogar mapa" | `perPlay` = 2 | 1× por pessoa por dia |
| TV: a cada 10 "Gostei" | `coinsPerReward` = 20 | votos de contas diferentes e confiáveis |

Anti-abuso: autocurtida/autouso/voto no próprio filme ignorados · 1 por conta · **contas com menos de 72 h** contam o voto/curtida
mas **não geram moedas** (`UGC.reward.minAccountAgeH`; o teste local usa `UGC_MIN_AGE_H=0` no `.dev.vars`) · tetos diários
(Loja: 150/criação e 400/autor; TV: 200/autor) · limites de taxa por jogador e por IP · banidos não interagem.

Entrega: o acumulado vira um **presente pessoal no Correio** (`AdminHub.pgifts`) quando chega a `payoutMin` = 10 (TV: a cada
recompensa). Enquanto não for pego, novas moedas da mesma origem somam no mesmo presente. O `sync` do jogo devolve esses
presentes junto com os do painel; o `claim` pega de forma atômica (dois aparelhos não recebem em dobro).

## TV Bloop: sincronização

`TvChannel` (instância `main`) guarda a grade: sempre 4 filmes à frente, com `start` em ms do **relógio do servidor** e 4 s de
vinheta entre eles. Sorteio do próximo: peso `(1 + votos)^0.8`, ×2 se aprovado há menos de 3 dias, o último nunca repete
(se houver outro) e os 5 últimos valem 15%. Canal parado (ninguém pediu a grade por um tempo) recomeça 2 s depois do pedido.

O app (`src/cinema/tv.ts`) pede `GET /api/tv/now`, calcula a diferença de relógio (`now − meio da ida e volta`), baixa o filme
(`GET /api/tv/film`), decodifica as vozes e desenha com o `Renderer` do Cinema no instante `agora − start`. O áudio
(`Playback`) é reiniciado no ponto certo se escorregar mais de 0,35 s. Nenhum vídeo trafega. Navegadores que bloqueiam som
sem toque mostram "🔊 Tocar com som".

## Endpoints (Worker)

Identidade = id do jogador (o mesmo do ranking/Correio) no corpo (`id`) ou em `?pid=`. Ele **nunca** é exposto: o autor aparece
como `@nome` ou `u<hash>`.

| Rota | Corpo / query | Resposta |
|---|---|---|
| `POST /api/ugc/publish` | `{ id, creation, category, thumbs[≤3], dailyLimit }` (≤ ~700 KB) | `{ ok, listing }` (`review: 'pending'`) ou `{ ok:false, error: name\|invalid\|empty\|too-big\|daily-limit\|banned }` |
| `GET /api/ugc/browse` | `pid, sort=trending\|new\|top, section=games\|creations, tag, category, kind, text, fav=1, limit, cursor` | `{ items: StoreListing[], next? }` — só aprovados |
| `GET /api/ugc/get` | `id, pid` | `{ listing, creation }` (aprovado, ou o autor) |
| `GET /api/ugc/thumb` | `id, n` | imagem (cache 1 dia) |
| `POST /api/ugc/like` · `/fav` | `{ id, item, on }` | `{ likes, liked }` · `{ favorites }` |
| `POST /api/ugc/use` | `{ id, item, kind: place\|play }` | `{ counted, authorCoins }` |
| `POST /api/ugc/report` | `{ id, item, reason, note? }` (criações **e** filmes) | `{ ok }` |
| `GET /api/ugc/mine` | `pid, type=criacao\|filme` | `{ items (com review/reviewReason), today, earnings }` |
| `POST /api/ugc/unpublish` | `{ id, item }` | `{ ok }` |
| `GET /api/ugc/earnings` | `pid` | `{ pending, total }` |
| `POST /api/ugc/score` · `GET /api/ugc/board` | placar dos Jogos da Comunidade | `{ rank }` · `{ items }` |
| `GET /api/tv/now` | — | `TvNow { now, cur, next[], films }` |
| `GET /api/tv/film` | `f` | `{ id, title, author, payload: { project, clips } }` (cache 10 min) |
| `POST /api/tv/submit` | `{ id, title, project, clips: { <id>: { mime, b64, dur, tx? } }, thumbs[], lang }` (≤ 3 MB) | `{ ok, listing, ai }` ou `{ ok:false, error: name\|invalid\|empty\|too-long\|too-big\|daily-limit\|banned\|ai, ai? }` |
| `POST /api/tv/vote` | `{ id, film }` | `{ votes, voted }` (400 `self` no próprio) |
| `GET /api/tv/voted` | `pid, f` | `{ voted }` |

Rotas de moderação (`/api/admin/ugc/*`) e de moderadores: `docs/PAINEL-ADMIN.md`.

## Armazenamento

| Onde | O quê |
|---|---|
| KV `ugc:c:<id>` | JSON da criação (≤ 512 KB) — 1 escrita por publicação |
| KV `ugc:f:<id>` | filme `{ project, clips }` (≤ 3 MB; ids `tv_<id do projeto>`) |
| KV `ugc:fm:<id>` | relatório da IA (transcrições, trechos achados, veredito) — só o painel lê |
| DO `UgcHub` (`hub`) | `items` (metadados, estado, contadores, miniaturas), `likes`, `favs`, `uses`, `reports`, `pubs`, `earn`, `earn_day`, `scores`, `ubans` |
| DO `TvChannel` (`main`) | `films`, `votes`, `vday`, `sched` |
| DO `AdminHub` (`hub`) | `pgifts` (Correio pessoal), `mods` (moderadores) |

Migração: `v7-loja-tv` (`new_sqlite_classes: ["UgcHub", "TvChannel"]`). R2 não é usado (ainda): se os filmes crescerem,
trocar `ugc:f:` por um bucket R2 sem mudar a API.

## Cliente

- `src/studio/store-server.ts` — `ServerStore` (mesma interface `StudioStoreApi`); sem rede usa `store-mock.ts` por 30 s
  (criações da Equipe Bloop sempre vêm do app). "Minhas publicações" mostra **Em análise / Na loja / Recusada: motivo**.
- `src/cinema/tv.ts` — player da TV (botão no início do Cinema e "TV Bloop" na barra do hub), "Meus envios",
  `sendToTvSheet` (Exportar → **Enviar para a TV Bloop**, com as regras e "Li as regras").
- `src/cinema/tv-net.ts` — chamadas de rede e montagem do envio (vozes do IndexedDB → base64).

## Teste local

```bash
printf 'ADMIN_PASSWORD=senha-local\nUGC_MIN_AGE_H=0\n' > .dev.vars
npx vite build && npx wrangler dev --local     # jogo + API + /admin na mesma origem
```
Publicar no Studio → aprovar em /admin#ugc → outra aba (outro jogador) curte/usa → Correio da autora recebe as moedas.
Cinema → Exportar → Enviar para a TV → aprovar → abrir a TV em duas abas: mesmo filme, mesmo segundo.
