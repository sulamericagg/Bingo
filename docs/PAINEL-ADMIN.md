# 🪐 Painel Admin do Bloop Orbit (Cloudflare)

Com o painel você pode (tudo em português e feito para usar no **celular**):

- 👥 **Jogadores**: buscar por `@nome`, apelido ou começo do ID; ver criado em, último acesso, plataforma, moedas/gemas, Clube, compras, selos e banidos. Abrir o **perfil** (compras, presentes, códigos usados) e: dar moedas/gemas/itens/skins/**Passe premium**/**dias de Clube**, dar **selos** (Beta tester, Moderador, VIP, Tester interno, Criador), **banir/desbanir**, **resetar o @nome**, anotar.
- 💳 **Pagamentos**: quem está pagando — compras e assinaturas avisadas pelo app, totais por dia e por produto, CSV. ⚠️ *reportado pelo app (não verificado)* — ver §8.
- 📜 **Registro**: tudo o que foi feito no painel (quem, quando, o quê, IP).
- 🎁 **Dar presentes** (moedas, gemas, skins, rastros, power-ups, "sem anúncios") para jogadores escolhidos, para todos ou só para quem jogou nos últimos dias.
- 🔑 **Criar códigos**: personalizados (`BLOOP2026`), aleatórios ou **em lote** (ex.: 100 códigos `BLP-7KQ2-M9XA` de uso único, para baixar em CSV).
- 🎬 **Criar desafios**: "quem assistir o vídeo ganha o código". O código é criado sozinho e o painel já te dá o texto pronto para postar.
- 📦 **Salvar pacotes** ("Pack Iniciante", "Pack Lendário"…) e reutilizar.
- 📊 Ver quantos jogadores você tem, quantos estão ativos e quantos códigos foram usados.

Tudo roda em **um único Worker da Cloudflare** chamado `bloop-orbit`, que também publica a versão web do jogo.

---

## 1. Publicar (só na primeira vez)

1. Entre em **dash.cloudflare.com** → menu **Workers & Pages** → **Create** (Criar).
2. Escolha **Import a repository** (Importar repositório) e conecte o seu GitHub. Selecione o repositório do jogo.
3. Preencha:
   - **Project name:** `bloop-orbit`
   - **Build command:** `npm run build`
   - **Deploy command:** `npx wrangler deploy`
   - (Branch de produção: a branch principal do repositório.)
4. Clique em **Deploy** e espere terminar (2–3 minutos).

> O banco de dados (KV `DATA`) já está criado e ligado no arquivo `wrangler.jsonc`. Não precisa fazer nada.

## 2. Criar a senha do painel

1. Em **Workers & Pages**, abra **bloop-orbit** → **Settings** (Configurações) → **Variables and Secrets**.
2. Clique em **Add** → tipo **Secret** → Nome: `ADMIN_PASSWORD` → Valor: uma senha forte (12+ caracteres, só você sabe).
3. Salve (**Deploy**). Pronto.

> Para trocar a senha depois, é só editar esse segredo. Todo mundo que estava logado é desconectado.

## 3. Abrir o painel

- O endereço aparece no topo da página do Worker (botão **Visit**), algo como
  `https://bloop-orbit.SEU-USUARIO.workers.dev`
- Painel: **`https://bloop-orbit.SEU-USUARIO.workers.dev/admin`**
- O jogo web fica no mesmo endereço, sem o `/admin`.

Dica: no celular, abra o `/admin` e use "Adicionar à tela inicial".

Depois de 8 senhas erradas seguidas, o login fica bloqueado por 15 minutos.

## 4. Usar

### 🎁 Presentes (em vez de código)
- **Jogadores** → marque quem quiser (ou **Marcar todos do filtro**) → **Enviar presente**. Ou em **Presentes → Novo presente** → *Escolher jogadores da lista* (busca + filtros + caixinhas), *Todos os jogadores* ou *Todos do filtro* (ativos 24 h / 7 / 30 dias, assinantes, quem já comprou, beta testers, VIP…).
- Chega no **Correio** do jogo (abre ao iniciar o app, ao voltar para ele e ao abrir o Correio). Banidos não recebem.
- Cada presente mostra **📬 entregue** (apareceu no Correio) e **✅ pego**; **Destinatários** lista o status de cada um.
- Monte o pacote (moedas, gemas, skins, rastros, power-ups, sem anúncios), dê um título e uma mensagem.
- O jogador recebe na próxima vez que abrir o jogo com internet. Presentes têm validade (padrão 30 dias). "Todos os jogadores" vale para quem já estava cadastrado na hora do envio.
- Dá para **cancelar** um presente: quem ainda não pegou não recebe mais.

### 🔑 Códigos (gerador)
- **Personalizado** (`BLOOP2026`), **Aleatório** (`BLP-7KQ2-M9XA`) ou **Lote** (2 a 1.000 códigos únicos de uma vez → copiar/CSV).
- **Prêmio**: moedas, gemas, skins, rastros, power-ups, sem anúncios, **Passe Estelar premium** (de uma temporada) e **dias de Clube Bloop**.
- **Limites** (todos conferidos no servidor, um resgate por vez — não estoura nem com muita gente ao mesmo tempo):
  - **Usos no total**: um número ou **∞**.
  - **Usos por jogador**: 1, 2, 3, 5, 10 ou ilimitado.
  - **Só para estes jogadores**: lista de `@nomes` (ex.: `@ana @beto`). Vazio = todos.
  - **Começa em / Expira em** (data e hora).
  - **Só esta temporada** (ou só a próxima) do Passe: vale só entre o 1º e o último dia daquela temporada.
  - **⚡ Uso único**: só 1 pessoa no total, 1 vez.
- A lista mostra usos, jogadores distintos, regras e status (Ativo, Agendado, Esgotado, Expirado…); **Exportar CSV** inclui tudo.
- Pode **pausar**, **editar** ou **excluir** a qualquer momento (vale na hora). Lotes inteiros pelo filtro "Lote".
- Quem chutar muitos códigos errados (10 em 10 min por jogador, 60 por IP) recebe "Muitas tentativas".

### 🎬 Desafios
1. **Desafios → Novo desafio**: título, link do vídeo/post, descrição, prêmio e data de fim.
2. O código é criado automaticamente (ou digite um seu).
3. Copie o **texto pronto** e poste nas redes, ou mostre o código no fim do vídeo.
4. Acompanhe quantas pessoas resgataram. Desafios ativos também aparecem para o jogo (sem mostrar o código).

### 📦 Pacotes
Salve combinações de prêmio para reutilizar. Em qualquer formulário, use "Começar de um pacote salvo".

### 🛡️ Moderação (Loja de Criações + TV Bloop)
Tudo o que os jogadores publicam — criações do **Bloop Studio** e filmes enviados para a **TV Bloop** pelo Bloop Cinema —
entra numa **fila de revisão** e só aparece para os outros depois de **aprovado** (o autor vê "Em análise"). Detalhes: `docs/LOJA-TV.md`.
- **Para revisar** (padrão): itens novos + itens que receberam **3 denúncias** de pessoas diferentes (saem do ar sozinhos até você decidir).
- Cada cartão mostra as **3 miniaturas** (fotos tiradas pelo app), título/descrição, autor (@ ou apelido público), e o que o
  **filtro automático** achou nos textos de dentro (nomes de peças, falas, blocos "dizer", placas…). Filme com voz gravada vem marcado 🎙️.
- **🔎 Ver detalhes**: falas do filme com **player de áudio** de cada gravação; nomes das peças / descrição do jogo; lista de denúncias.
- **✓ Aprovar** (entra na loja / no canal na hora) · **✗ Recusar** (motivo obrigatório — o autor vê) · **🙈 Tirar do ar** (um aprovado) ·
  **🚫 Banir autor** (tudo dele sai do ar e ele não publica mais na Loja/TV; desfaz em "Autores banidos").
- A antiga página de moderação do chat agora se chama **Chat**.

### 👮 Moderadores (só o dono)
Crie logins para quem ajuda na moderação: **nome + senha (mín. 10)**. A senha fica guardada só como hash PBKDF2 no AdminHub.
O moderador entra na mesma tela de login, com o **nome** no campo "Seu nome" e a **senha dele**; o painel mostra só a página
**Moderação** e o servidor recusa (403) qualquer outra rota. Trocar a senha, desativar ou apagar o moderador derruba as sessões
abertas dele na hora. Tudo o que ele faz vai para o **Registro** como `mod:<nome>`.

## 5. Ligar o app Android ao servidor

Depois do primeiro deploy, **mande para o Claude o endereço do Worker** (ex.: `https://bloop-orbit.seu-usuario.workers.dev`).
Ele fica em `src/config.ts` → `ONLINE.nativeApiBase`. Depois é só gerar o APK/AAB de novo.
(A versão web publicada pelo próprio Worker já funciona sozinha.)

## 6. Limites do plano grátis da Cloudflare

O KV grátis permite **100.000 leituras** e **1.000 escritas por dia**. O servidor foi feito para economizar escritas
(presente para "todos" = 1 escrita; cada jogador grava no máximo a cada 30 min), mas cada **código de lote**, cada **resgate**
e cada jogador ativo contam. Se o jogo crescer (centenas de jogadores por dia), assine o **Workers Paid (US$ 5/mês)**: 1 milhão de escritas.

O KV é "eventualmente consistente": uma mudança pode levar até ~1 minuto para valer no mundo todo. Em casos raros,
um código muito disputado pode passar 1–2 usos do limite.

---

## Para desenvolvedores

```
wrangler.jsonc           ← Worker "bloop-orbit": assets ./dist + KV DATA
server/index.ts          ← roteador (/api/*, /admin, resto = jogo)
server/public.ts         ← API do jogo
server/admin-api.ts      ← API do painel (/api/admin/*)
server/auth.ts           ← login + token HMAC
server/store.ts          ← chaves do KV
server/admin.html        ← painel (HTML único)
shared/reward.ts         ← tipos RewardPack/Gift compartilhados com o jogo
shared/catalog.ts        ← skins/rastros (lidos de src/game/skins.ts)
src/services/online.ts   ← cliente usado pelo jogo
scripts/test-server.mjs  ← teste ponta a ponta (npm run test:server)
```

Comandos: `npm run worker:dev` (local, KV simulado; crie `.dev.vars` com `ADMIN_PASSWORD=...`),
`npm run test:server`, `npm run typecheck`, `npx wrangler deploy --dry-run`.

### Durable Object `AdminHub` (novo — migração `v5-admin`, SQLite, plano grátis)
Instância única `hub` (server/admin-hub.ts). Guarda o que precisa de contagem atômica ou consulta, sem gastar escritas do KV:
`codes` (definição + usos), `code_uses` (usos por jogador), `gift_claims` / `gift_seen` (pego / entregue),
`purchases` (compras reportadas, deduplicadas pelo hash do token), `audit` (registro, ~1 ano / 20 mil linhas),
`pgifts` (presentes **pessoais** no Correio — moedas de criador da Loja/TV; aparecem no `sync` junto com os do painel e são pegos
atomicamente no `claim`; ids começam com `pg`), `mods` (moderadores: nome, hash PBKDF2, ativo, `since` = sessões mais antigas não valem).

### Durable Objects `UgcHub` e `TvChannel` (migração `v7-loja-tv`)
Loja de Criações, fila de moderação e TV Bloop — veja `docs/LOJA-TV.md`.
Limites de taxa ficam em memória do DO (painel: 300 req/min por IP; compras: 20/h por jogador e 60/h por IP; chutes de código).
Códigos antigos (`code:` no KV) são **importados sozinhos** para o AdminHub na primeira consulta/resgate e apagados do KV.

### Chaves do KV

| Chave | Valor | Metadata (para listar sem ler) |
|---|---|---|
| `player:<id>` | jogador (stats, `claimed`, `redeemed`, `handle`, `flags`, `banned`, `clubUntil`, `passSeason`, `purchases`, `notes`) | nome, recorde, partidas, visto, plataforma, criado, @, selos, banido, Clube até, nº compras, moedas, gemas |
| `code:<CODIGO_NORMALIZADO>` | **legado** — migrado para o AdminHub | — |
| `challenge:<id>` | desafio | ativo, fim |
| `gifts` | lista de presentes ativos (`to: 'all'` ou lista de ids) | — |
| `presets` | pacotes salvos | — |
| `rl:login:<ip>` | tentativas de login (expira em 15 min) | — |

### API pública (usada pelo jogo; CORS liberado para `https://localhost` e `capacitor://localhost`)

```ts
type RewardPack = { coins?; gems?; skins?: string[]; trails?: string[]; noAds?: boolean;
                    boosts?: { shield?; magnet?; headstart? }; title?; message? };
type Gift = { id; title; message; reward: RewardPack; sentAt: number; expiresAt: number | null };
```

| Rota | Corpo | Resposta |
|---|---|---|
| `POST /api/player/register` | `{ id?, name?, platform, version }` | `{ id, name }` |
| `POST /api/player/sync` | `{ id, best, runs, coins, gems, name?, platform?, version? }` | `{ name, inbox: Gift[], flags: string[] }` |
| `POST /api/inbox/claim` | `{ id, giftIds: string[] }` | `{ rewards: RewardPack[], claimed: string[] }` |
| `POST /api/redeem` | `{ id, code }` | `{ ok: true, reward }` ou `{ ok: false, error: 'invalid'\|'expired'\|'used'\|'limit'\|'rate' }` |
| `POST /api/player/purchase` | `{ id, productId, purchaseToken, orderId?, type: 'inapp'\|'subs', source: 'buy'\|'restore', price?, expires? }` | `{ ok, status: 'new'\|'dup', verified: false }` (429 se abusar) |
| `GET /api/challenges` | — | `{ challenges: [{ id, title, description, link, startsAt, endsAt, reward }] }` |

### API admin (`Authorization: Bearer <token>`)

`POST /api/admin/login {password} → {token, expiresAt}` (72 h) ·
`GET /stats` · `GET /catalog` · `GET /players?q=&days=&sort=&page=&size=` · `GET /players/:id` ·
`GET|POST /gifts` (`{target:{type:'all'}|{type:'active',days}|{type:'players',ids}, title, message, reward, expiresDays}`) · `DELETE /gifts/:id` ·
`GET|POST /codes` (`{code? | prefix?, count?, reward, maxUses, startsAt?, expiresAt?, active, notes}`) · `GET|PATCH|DELETE /codes/:code` · `POST /codes/bulk {action, keys? | batch?}` ·
`GET|POST /challenges` · `PATCH|DELETE /challenges/:id` · `GET|POST /presets` · `DELETE /presets/:id`.

Novas (painel 2):
`GET /players?q=&filter=all|active1|active7|active30|subs|payers|beta|mod|vip|tester|creator|banned&sort=&page=&size=&ids=1` ·
`GET /players/:id` (perfil + compras + presentes + códigos) · `POST /players/:id/flags {flags}` · `POST /players/:id/notes {notes}` ·
`POST /players/:id/ban {reason}` · `POST /players/:id/unban` · `POST /players/:id/reset-handle` ·
`POST /gifts` aceita também `target: {type:'filter', filter, q?}` · `GET /gifts/:id` (destinatários: entregue/pego) ·
`POST /codes` aceita `maxUses (0=∞), perPlayer (0=∞, padrão 1), oneShot, allowHandles ("@a @b"), season ('current'|'next'|índice), startsAt, expiresAt` ·
`GET /purchases?from=&to=&q=&product=&page=&size=` (lista + por dia + por produto + estimativa) · `GET /audit?before=&q=` · `GET /seasons`.
Pacotes (`RewardPack`) ganharam `passSeason` (Passe premium daquela temporada, índice 0 = s00) e `clubDays`.
Login: `POST /api/admin/login { password, who? }` — `who` (seu nome) aparece no Registro. Resposta tem `role: 'owner'|'mod'`
(moderador: `who` = nome do moderador + a senha dele). `GET /me → { role, who }` (abre para moderadores).

Moderação (dono **e** moderadores): `GET /ugc/stats` · `GET /ugc/queue?status=review|pending|hidden|approved|rejected|all&type=criacao|filme` ·
`GET /ugc/item/:id` (item + denúncias + conteúdo: falas com áudio em data URL / nomes das peças) ·
`POST /ugc/item/:id/review { status: 'approved'|'rejected'|'hidden', reason }` · `POST /ugc/ban { pid, reason }` · `POST /ugc/unban { pid }` ·
`GET /ugc/bans` · `GET /ugc/tv` (filmes no canal + grade).
Moderadores (só dono): `GET /mods` · `POST /mods { name, password }` (cria ou troca a senha) · `POST /mods/:nome/active { active }` · `DELETE /mods/:nome`.

---

## 7. Ranking global e Corrida Orbital (multiplayer)

### Ranking (painel → **Ranking**)
- Mostra o placar **Geral** (melhor pontuação de cada jogador) e o da **Semana** (zera toda segunda-feira, 00:00 de Brasília).
- **Remover** tira o jogador do placar geral e da semana atual. Deixe marcado *Bloquear novos envios* para trapaceiros: o jogo dele não consegue mais enviar pontuações (dá para **desbloquear** depois).
- O servidor já rejeita pontuações impossíveis para o tempo de partida (mais de ~8 pontos por segundo).

### Corrida Orbital
- Botão **Corrida** no menu: 5 jogadores, 60 segundos, todos no **mesmo mundo** (mesma seed). Quem fizer mais pontos vence (empate: quem ficou mais tempo vivo).
- Espera até ~5 s por jogadores reais; as vagas restantes são completadas com **bots** com nomes e skins de jogadores normais.
- Prêmios: 1º 100 moedas + 5 gemas · 2º 60 · 3º 40 · 4º/5º 20 (mais as moedas coletadas na corrida).
- Sem internet (ou se o servidor estiver fora), a corrida acontece **offline** com 4 bots — o modo sempre funciona.

> **Primeiro deploy com a Corrida:** o `wrangler.jsonc` cria o Durable Object `RaceRoom` (migração `v1`, SQLite — funciona no plano grátis). Não precisa fazer nada no painel da Cloudflare: o `npx wrangler deploy` cria sozinho.

### Limites do plano grátis
- **KV:** cada placar é **uma** chave (`lb:all`, `lb:week:AAAA-Wnn`). Só gravamos quando a pontuação entra no top 200 ou bate o recorde do próprio jogador (o jogo também só envia quando é um novo recorde). Ainda assim conta nas **1.000 escritas/dia** — com muitos jogadores batendo recordes, considere o plano pago.
- **Durable Objects (grátis):** ~100 mil requisições/dia e 13.000 GB-s/dia de duração. Cada corrida mantém uma sala ativa por ~70 s (≈ 9 GB-s) → algo como **1.000+ corridas por dia** no plano grátis. Mensagens de WebSocket recebidas contam como requisições (20 mensagens = 1 requisição).

### Para desenvolvedores

```
server/leaderboard.ts    ← ranking (KV) + rotas admin do ranking
server/race.ts           ← Durable Object RaceRoom (lobby + salas) e GET /api/race/join
shared/race.ts           ← regras, protocolo e modelo dos bots (servidor + modo offline)
shared/leaderboard.ts    ← tipos, semana ISO, limite de plausibilidade
src/services/leaderboard.ts / multiplayer.ts  ← clientes
src/ui/race.ts + race.css                     ← telas (sala, HUD, resultado, ranking)
```

| Chave KV | Valor |
|---|---|
| `lb:all` | `{ entries: [{ id, name, score, skin, t }], updated }` (top 200) |
| `lb:week:<AAAA-Wnn>` | igual, expira em 21 dias |
| `lb:banned` | lista de ids bloqueados |

| Rota | Corpo / query | Resposta |
|---|---|---|
| `POST /api/score` | `{ id, name, score, skin, duration (ms) }` | `{ ok, rank: { all, week }, best: { all, week } }` · 422 se impossível · 403 se bloqueado |
| `GET /api/leaderboard` | `?scope=all\|week&me=<id>` | `{ scope, week, total, entries: [{ rank, name, score, skin, me? }] (top 100), me: { rank, score } \| null }` (sem ids) |
| `GET /api/race/join` | WebSocket | protocolo abaixo |
| `GET /api/admin/leaderboard` | `?scope=all\|week` | `{ entries (com ids), banned, week }` |
| `DELETE /api/admin/leaderboard/:id` | `?ban=1` | `{ removed }` |
| `POST /api/admin/leaderboard/unban/:id` | — | `{ ok }` |

**Protocolo da corrida (JSON por WebSocket):**
- cliente → `{type:'hello', id, name, skin, debug?}` (1ª mensagem) · `{type:'state', score, p, alive}` ~6×/s (p = índice do planeta atual) · `{type:'leave'}`
- servidor → `{type:'welcome', you, room}` · `{type:'lobby', players:[{slot,name,skin,bot?}], startsInMs}` · `{type:'start', seed, countdownMs, durationSec, players, you}` · `{type:'tick', t, s:[[slot, score, p, vivo 0/1, tempoVivo×10]]}` (5×/s) · `{type:'end', results:[{slot,name,skin,score,tAlive,place,coins,gems}]}` · `{type:'error', code:'full'|'started'|'no_hello'}`
- `bot: true` só é enviado para clientes com `debug` (abra o jogo com `?debug`).
- Sem mensagens por 6 s = desconectado (conta como queda). Se todos os humanos caírem, os bots são "adiantados" até os 60 s e o resultado sai na hora.

---

## 8. Pagamentos: verificação real no Google Play (próximo passo)

Hoje o app avisa o servidor depois de cada compra/restauração (`POST /api/player/purchase`, em `src/services/billing.ts`).
Isso mostra **quem está pagando**, mas é **"reportado pelo app (não verificado)"**: alguém poderia mandar uma compra falsa.
Os prêmios continuam sendo entregues pelo app (como antes); o servidor só registra. Para valores oficiais, use o **Play Console**.

Para o servidor **conferir cada compra direto com a Google** (Google Play Developer API), o dono precisa criar uma conta de serviço:

1. **Google Cloud Console** (console.cloud.google.com) → crie (ou escolha) um projeto → **APIs e serviços → Biblioteca** → ative **Google Play Android Developer API**.
2. **IAM e administrador → Contas de serviço → Criar conta de serviço** (ex.: `bloop-verificador`). Sem papéis no Cloud.
3. Na conta criada → **Chaves → Adicionar chave → JSON**. Guarde o arquivo (é secreto!).
4. **Play Console** → **Usuários e permissões → Convidar novos usuários** → e-mail da conta de serviço
   (`bloop-verificador@SEU-PROJETO.iam.gserviceaccount.com`) → permissões do app: **Ver informações financeiras** e **Gerenciar pedidos e assinaturas**.
   (Pode levar até 24 h para valer.)
5. Cloudflare → Workers & Pages → **bloop-orbit → Settings → Variables and Secrets → Add → Secret**:
   `GOOGLE_PLAY_SA_JSON` = conteúdo inteiro do JSON. (Não coloque no repositório.)
6. Avise o Claude: falta implementar no servidor a chamada `purchases.products.get` / `purchases.subscriptionsv2.get`
   (token OAuth assinado com a chave da conta de serviço) e marcar a coluna `verified` da tabela `purchases` — o painel já tem o campo.

## 9. Segurança do painel

- Todas as rotas `/api/admin/*` exigem o token do login (`requireAdmin`); o token expira em 72 h e trocar a senha derruba todas as sessões.
- Login: 8 senhas erradas → bloqueio de 15 min por IP. Painel: no máx. 300 requisições/min por IP.
- Papéis: **dono** (senha do painel) vê tudo; **moderador** (login próprio) só as rotas `/api/admin/ugc/*` e `/me` — as outras respondem 403.
- **Registro** (aba 📜): toda ação que muda algo (e todo login, certo ou errado) fica gravada com nome digitado no login, sessão, IP e um resumo (senhas nunca são gravadas).
