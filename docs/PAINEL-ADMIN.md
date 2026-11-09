# 🪐 Painel Admin do Bloop Orbit (Cloudflare)

Com o painel você pode:

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

### 🎁 Presentes
- **Jogadores** → marque quem quiser → **Enviar presente**. Ou em **Presentes → Novo presente** escolha *Todos os jogadores* ou *Ativos nos últimos N dias*.
- Monte o pacote (moedas, gemas, skins, rastros, power-ups, sem anúncios), dê um título e uma mensagem.
- O jogador recebe na próxima vez que abrir o jogo com internet. Presentes têm validade (padrão 30 dias). "Todos os jogadores" vale para quem já estava cadastrado na hora do envio.
- Dá para **cancelar** um presente: quem ainda não pegou não recebe mais.

### 🔑 Códigos
- **Personalizado:** você escolhe o texto (ex.: `BLOOP2026`). Maiúsculas, espaços e hífens não importam para o jogador.
- **Aleatório:** o painel inventa um código (ex.: `BLP-7KQ2-M9XA`).
- **Lote:** gera de 2 a 1.000 códigos de uma vez (padrão: 1 uso cada) → copie ou baixe em CSV (abre no Excel/Planilhas).
- **Usos no total** = quantos jogadores diferentes podem usar (0 = sem limite). Cada jogador só usa o mesmo código **uma vez**.
- Datas de início/fim opcionais. Pode **pausar**, **editar** o prêmio ou **excluir** a qualquer momento. Lotes podem ser pausados/excluídos inteiros (filtro "Lote").

### 🎬 Desafios
1. **Desafios → Novo desafio**: título, link do vídeo/post, descrição, prêmio e data de fim.
2. O código é criado automaticamente (ou digite um seu).
3. Copie o **texto pronto** e poste nas redes, ou mostre o código no fim do vídeo.
4. Acompanhe quantas pessoas resgataram. Desafios ativos também aparecem para o jogo (sem mostrar o código).

### 📦 Pacotes
Salve combinações de prêmio para reutilizar. Em qualquer formulário, use "Começar de um pacote salvo".

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

### Chaves do KV

| Chave | Valor | Metadata (para listar sem ler) |
|---|---|---|
| `player:<id>` | jogador (stats, `claimed` = presentes resgatados, `redeemed` = códigos usados) | nome, recorde, partidas, visto, plataforma, criado |
| `code:<CODIGO_NORMALIZADO>` | código (prêmio, usos, limite, datas, últimos resgates) | exibição, usos, limite, ativo, datas, lote, resumo |
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
| `POST /api/player/sync` | `{ id, best, runs, coins, gems, name?, platform?, version? }` | `{ name, inbox: Gift[] }` |
| `POST /api/inbox/claim` | `{ id, giftIds: string[] }` | `{ rewards: RewardPack[], claimed: string[] }` |
| `POST /api/redeem` | `{ id, code }` | `{ ok: true, reward }` ou `{ ok: false, error: 'invalid'\|'expired'\|'used'\|'limit' }` |
| `GET /api/challenges` | — | `{ challenges: [{ id, title, description, link, startsAt, endsAt, reward }] }` |

### API admin (`Authorization: Bearer <token>`)

`POST /api/admin/login {password} → {token, expiresAt}` (72 h) ·
`GET /stats` · `GET /catalog` · `GET /players?q=&days=&sort=&page=&size=` · `GET /players/:id` ·
`GET|POST /gifts` (`{target:{type:'all'}|{type:'active',days}|{type:'players',ids}, title, message, reward, expiresDays}`) · `DELETE /gifts/:id` ·
`GET|POST /codes` (`{code? | prefix?, count?, reward, maxUses, startsAt?, expiresAt?, active, notes}`) · `GET|PATCH|DELETE /codes/:code` · `POST /codes/bulk {action, keys? | batch?}` ·
`GET|POST /challenges` · `PATCH|DELETE /challenges/:id` · `GET|POST /presets` · `DELETE /presets/:id`.
