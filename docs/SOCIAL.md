# Social, Campeonatos e Presença online

Tudo do social vive em `src/social/*` (cliente), `src/services/presence.ts` e `server/{presence,chat,champ,social,moderation}.ts`.

## Integração (lead)

```ts
import { registerSocial } from './social/register';
registerSocial(); // painéis 'campeonatos' (navOrder 3) e 'social' (navOrder 4)
```

API pública:

| Função | Onde | Para quê |
|---|---|---|
| `registerSocial()` | `social/register.ts` | registra os painéis, +1 ficha diária, ouvinte de `run-end` |
| `openSocial(tab?)`, `openChampionshipsPanel()`, `openPlayerProfile(id?, {name, skin}?)` | `social/register.ts` | abrir telas (lazy-load) — use `openPlayerProfile` no ranking |
| `addFichas(n)`, `getFichas()` | `social/store.ts` (reexportado em register) | Fichas de Campeonato (missões/passe dão fichas) |
| `drawEmoteBubble(ctx, code, x, y, scale, t)` | `social/emotes.ts` | balão de emote sobre a cabeça; devolve `false` quando acabou (3 s) |
| `openEmoteWheel(onPick)` | `social/emotes.ts` | roda com 8 atalhos rápidos |
| `joinPresence(gameId, opts)` | `services/presence.ts` | implementa `JoinPresence` de `presence-api.ts` |
| `getChampionshipSeed(gameId)`, `setGameLauncher(fn)` | `social/champ-context.ts` | seed da rodada (opcional para os jogos); lançador do hub |
| `setProfileLevelProvider(fn)`, `setProfileCreature(id)` | `social/profile.ts` | nível (passe) e foto = bichinho |

Emotes: `joinha, vamos, uau, oi, gg, rindo, coracao, boa` (ícones desenhados em canvas, sem emoji).

## Presença (drop-in)

- `GET /api/presence/<gameId>` (WebSocket). Um DO `PresenceRoom` por jogo faz de **lobby** (`lobby:<gameId>`) e escolhe o **shard** (`<gameId>:<n>`, até 6 jogadores; teto duro 8).
- O shard só retransmite: `hello` → `welcome{peers}`, `join`, `leave`, `s` (estado, até 16 números, limitado a 8/s por cliente), `e` (emote). Hibernação de WebSocket ligada.
- **Bots**: com `botsIfAlone > 0`, se não houver outro humano por ~3 s (ou offline), o cliente cria bots LOCAIS (`id: 'bot-<i>'`, nome/skin determinísticos pela seed, `bot: true`, `s: {}`). **O jogo é quem move os bots** (IA própria a partir do id/seed); a presença só faz os bots mandarem emotes de vez em quando. Quando um humano entra, os bots saem.
- O array entregue a `onPeers` é reutilizado (sem alocação por mensagem); copie se precisar guardar.
- Offline: `online = false`, sessão vazia (ou só bots).

## Chat (kid-safe)

- `GET /api/chat/<sala>` (WebSocket), salas `global` e `game-<id>`. DO `ChatRoom` por sala, hibernação, histórico das últimas 40 mensagens.
- 80 letras; **1 msg / 2 s com rajada de 3**; filtro no servidor (`server/moderation.ts`):
  - normaliza: minúsculas, sem acentos, leetspeak (`4→a 3→e 0→o 1→i 5→s 7→t @→a $→s`), letras repetidas, letras separadas (`p u t a`, `f.u.c.k`);
  - lista pt/en/es (palavrões, insultos, termos sexuais, ofensas): palavra inteira vira `###`; disfarce (separado/grudado) → recusada;
  - **dados pessoais** → recusada com aviso: telefones (7+ dígitos), e-mails (inclusive "arroba … ponto com"), links/domínios, `@perfis`, endereços ("rua …", "moro na …"), whatsapp/zap/insta/telegram/tiktok/discord/…;
  - palavras extras: painel → Moderação (KV `chat:words`, vale em até 5 min).
- Atalhos rápidos (`{type:'quick', code}`) não passam por texto livre.
- Cliente: denunciar (KV `report:*`, 30 dias, máx. 10/h por jogador), silenciar/bloquear localmente, ver perfil.
- Admin (`/admin` → Moderação): denúncias, mensagens recentes por sala (apagar), banir (`chatban:<id>`, derruba conexões e apaga mensagens) / silenciar (`chatmute:<id>` com prazo), liberar, testar o filtro.

### Ajustes e idade (Google Play Famílias)

- Na primeira abertura do chat perguntamos a faixa de idade (neutra: "menos de 13" / "13 ou mais").
- **Menores de 13**: Modo seguro obrigatório — só atalhos rápidos (frases prontas), sem texto livre e sem ver texto livre dos outros.
- **13+**: chat de texto ligado por padrão; dá para ligar o Modo seguro ou desligar o chat em Social → Ajustes.
- Implicações para a política de Famílias: se o app for listado no programa *Designed for Families* / público-alvo incluir crianças, chat de texto livre entre usuários exige moderação e controles; a recomendação é **manter o texto livre só para 13+ (age screen neutro, como acima)** e declarar no Data safety / questionário de conteúdo que há interação entre usuários, moderada, com denúncia e bloqueio. Nenhum dado pessoal é pedido; o filtro bloqueia troca de contatos. Se a Google exigir, dá para forçar o Modo seguro para todos mudando o padrão em `src/social/store.ts` (`safeMode: true`).

## Perfil

- Cartão: foto (criatura via `src/creatures/render.ts` → `renderCreatureIcon(id, size)` se existir no build, senão personagem/skin/avatar), nome, nível, recordes por jogo (do `run-end`), insígnias (`champ`, `finalist`, `pioneer`, `friendly`, `collector`).
- `POST /api/profile` (no máx. 1 gravação no KV a cada 30 min por jogador), `GET /api/profile?id=`. Nome ofensivo vira "Bloop".
- Amigos: lista local (adicionar pelo perfil).

## Campeonatos

Economia kid-safe: inscrição com **Fichas de Campeonato** — moeda **não comprável** (1 por dia ao abrir o jogo, missões, passe; máx. 20, guardada em `localStorage['bloop-social-v1']`). Nunca dinheiro real, gemas ou moedas. Prêmio em **moedas bancadas pelo sistema** (base + X por inscrito): não há aposta nem "pote" vindo dos jogadores.

- Regulares a cada 3 h (UTC 0,3,6,…; inscrições abertas até o início), 3 rodadas: Classificatória 20 min, Semifinal 15 min, Final 15 min, jogos girando entre `orbit, tubo, rally, tycoon`. Sábado 15:00 UTC: **Copa de Fim de Semana** (2 fichas, prêmio maior).
- Especiais: painel → Campeonatos (nome, jogos por rodada, minutos por rodada, prêmio base/por inscrito, fichas, início). Admin cancela (fichas devolvidas) e pode pausar os regulares.
- Rodada: todos jogam o mesmo jogo com a **mesma seed**; até 5 tentativas, vale a melhor; pontuação com teto por jogo e por segundo jogado (sanidade).
- Regras: fecha inscrição com 0/1 inscrito → cancelado + fichas devolvidas; ninguém joga a 1ª rodada → cancelado + devolvido; só 1 joga → ele segue e leva **o prêmio inteiro**; 2+ → metade de cima avança (mín. 2) até a final; prêmio 50/30/20 (2 finalistas: 60/40).
- Fluxo do cliente: "Jogar rodada" define `currentChampionshipRound` (`champ-context.ts`) e abre o jogo (via `setGameLauncher` do hub ou `registry.launch` num contêiner próprio). Quando chega `run-end` com o mesmo `game`, a pontuação vai para `POST /api/champ/score` e o painel reabre na chave. Os jogos não precisam saber de campeonatos (podem usar `getChampionshipSeed`).
- Resgate: `POST /api/champ/claim` devolve moedas (prêmio) ou fichas (cancelado) uma única vez.
- Servidor: um único DO `Championship` (`hub`) guarda tudo e usa **um alarme** para o próximo evento; toda leitura também avança o estado.

## Plano grátis da Cloudflare (uso estimado)

| Recurso | Uso | Limite grátis |
|---|---|---|
| DO (SQLite) | 4 classes: `RaceRoom`, `PresenceRoom`, `ChatRoom`, `Championship` | DO SQLite disponível no plano grátis |
| Requisições DO | WebSocket com hibernação: mensagens recebidas contam 20:1. Presença a 5 Hz × 6 jogadores ≈ 1,5 req/s por sala ativa; chat é esporádico | 100 mil req/dia |
| Duração DO | hibernação no chat/presença; campeonato acorda só nos alarmes (≈ 3 a cada 3 h) e nas consultas | 13 mil GB-s/dia |
| Gravações DO storage | chat: 1 por mensagem (histórico); campeonato: 1 por inscrição/pontuação | 100 mil/dia |
| KV leituras | ban/mute: 2 por conexão e a cada 60 s por usuário ativo (cache no DO); palavras extras a cada 5 min | 100 mil/dia |
| KV gravações | perfil (≤ 1 a cada 30 min/jogador), denúncias, bans | **1.000/dia** — o ponto mais apertado; aumente o intervalo do perfil se crescer |

Presença é o maior consumidor: se o volume crescer, reduza o envio para 3 Hz nos jogos ou passe para o plano pago (US$ 5).

## Testes

`npm run test:server` (wrangler dev --local) cobre: presença (2 clientes se veem, estado/emote/saída, shard de 6), filtro (pt/en/es, leetspeak, repetidas, separadas, telefone/e-mail/URL/@/zap/insta/telegram/endereço, frases normais passam, palavra extra), chat via WebSocket (###, recusa com aviso, atalho, rate limit, denúncia, mute, ban/derrubar/reconectar, desbanir), perfil e campeonatos (1 inscrito cancela/devolve, ninguém joga cancela/devolve, jogador único leva tudo, 3 jogadores com eliminação e prêmios, sanidade, admin cria/cancela).

Página de desenvolvimento (não entra no build): `dev-social.html` + `src/social/dev-harness.ts` (registra jogos falsos e abre cada tela).
