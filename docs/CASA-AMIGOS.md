# Casa, Planeta & Amigos — servidor

Contrato do cliente: `src/home/api.ts` (implementado em `src/services/home.ts`, export `homeApi`).
Servidor: `server/handles.ts`, `server/friends.ts` (DO `FriendsHub`), `server/home.ts`,
`server/party.ts` (DO `PartyRoom`), `server/home-admin.ts`. Testes: `npm run test:server`.

## Durable Objects (wrangler.jsonc)

| Binding | Classe | Instâncias | Para quê |
|---|---|---|---|
| `FRIENDS` | `FriendsHub` | uma só (`hub`) | amizades, pedidos, bloqueios, "jogaram juntos", cartão (visto por último, @nome, bagunça) |
| `PARTY` | `PartyRoom` | uma por anfitrião (`idFromName(hostId)`) | festa/visita em tempo real, sujeira e design autoritativos durante a festa |

Migração nova: tag `v3-home` (`new_sqlite_classes: ["PartyRoom", "FriendsHub"]`). As tags antigas não mudaram.
Ambos usam SQLite (disponível no plano grátis).

## API

Todas as rotas aceitam CORS do app (agora com `PUT`). `id` = id do jogador (o mesmo de `bo-player`).

### @nomes
| Rota | Corpo/parâmetros | Resposta |
|---|---|---|
| `GET /api/handle/check?h=&id=` | `id` opcional (o próprio nome conta como livre) | `HandleCheck` |
| `POST /api/handle/claim` | `{ id, handle }` | `HandleCheck` + `handle`; cooldown → `{ok:false, reason:'invalid', until}` |
| `GET /api/handle/mine?id=` | | `{ handle, at }` ou `{ handle: null }` |
| `GET /api/player/by-handle?h=` | `@` e maiúsculas tanto faz | `FriendInfo` (sem online/lastSeen/bagunça) ou 404 |

Regras: 3–16 caracteres `[a-z0-9_.]`, começa com letra/número, sem `..`, guardado em minúsculas.
Recusados (`blocked`): reservados (admin, bloop, suporte, oficial, teamross…), 6+ dígitos (telefone),
pedaços de redes/contato (insta, whats, zapzap, tiktok, discord, gmail…), dados pessoais e palavrões
(mesmo filtro do chat, em várias formas: com `_`/`.` como espaço, grudado, sem números; lista extra do painel vale).
Troca: 1 vez a cada 30 dias. Nome tomado → até 4 sugestões livres (`nome123`, `nome_star`, `nome.joy`…).

KV: `handle:<min>` → id (ou `!banned`), `ph:<id>` → `{h, at}`.

**Janela de corrida do KV:** o KV não tem "gravar se não existir". O claim faz *checar → gravar → esperar 50 ms → reler*.
Dois pedidos do MESMO nome no mesmo instante em PoPs diferentes ainda podem passar os dois (o KV leva até ~60 s
para propagar). Quem ficar no índice `handle:` é o dono de verdade (by-handle e pedidos de amizade resolvem pelo
índice); o outro verá `taken` na próxima checagem. Risco aceito (nomes pouco disputados). Se virar problema,
mover o claim para o `FriendsHub` (DO = serializado).

### Amizades
| Rota | Corpo | Resposta |
|---|---|---|
| `GET /api/friends?id=` | | `{ friends: FriendInfo[], requests: FriendRequest[], blocked }` (marca você como online) |
| `POST /api/friends/request` | `{ id, handle }` ou `{ id, to }` | `{ result: 'sent'|'already'|'accepted'|'not_found'|'limit'|'not_met' }` |
| `POST /api/friends/respond` | `{ id, from, accept }` | `{ ok }` |
| `POST /api/friends/remove` | `{ id, friend }` | `{ ok }` |
| `POST /api/friends/block` | `{ id, target, on }` | `{ ok }` — bloquear desfaz amizade e apaga pedidos |

- Limites: 100 amigos (dos dois lados), 20 pedidos por dia, 50 pedidos pendentes guardados.
- Se a outra pessoa já tinha pedido você, o pedido vira aceite (`accepted`; o cliente mostra `already`).
- Bloqueado (de qualquer lado) → `not_found` (não revela o bloqueio).
- **Online:** visto nos últimos 3 min (`/api/player/sync`, `GET /api/friends`, entrada em presença/festa).
- `houseMess` = itens de sujeira ÷ 40 (máx. 1), atualizado quando a sujeira é gravada.

### Casas
| Rota | Corpo | Resposta |
|---|---|---|
| `GET /api/home/<ownerId>?id=<quem vê>` | dono ou amigos | `HomeState` (+`visitsOpen`), 403 `not_friend`/`closed`, 404 |
| `PUT /api/home/design` | `{ id, ownerId?, design?, visitsOpen? }` | `{ ok }`; 400 design inválido, 403 sem permissão, 413 >16 KB, 429 <3 s |
| `PUT /api/home/mess` | `{ id, ownerId, mess }` | `{ ok, count }`; 403 `not_friend`/`no_permission`/`not_in_party`, 400 >300 |

(`POST` também é aceito nas duas rotas de escrita.)

KV: `home:<id>` → `{design, visitsOpen, updatedAt}` (metadata `t`), `home:<id>:mess` → `{mess, updatedAt}`
(chave separada para a festa gravar sujeira sem reescrever o design).

Validação rasa do design: `v:1`, `planet`/`exterior` planos (≤64 chaves, valores string ≤64 ou número),
≤24 cômodos com `id/floor/wall/items[]` (≤300 itens com `id,x,y`), `access` e `paint` opcionais. JSON ≤16 KB.

### Permissões (`design.access`)
`access = { visits: 'friends'|'nobody', defaultRole, roles: { [amigoId]: papel } }`. Sem `access` (designs
antigos) = amigos visitam e limpam.

| Papel | Visitar | Limpar sujeira | Móveis, piso/parede, pintura | Estrutura (planeta, exterior, cômodos) | Mudar `access` |
|---|---|---|---|---|---|
| `view` | ✔ | ✘ | ✘ | ✘ | ✘ |
| `clean` (padrão) | ✔ | ✔ | ✘ | ✘ | ✘ |
| `decorate` | ✔ | ✔ | ✔ | ✘ (`structural_change`) | ✘ |
| `build` | ✔ | ✔ | ✔ | ✔ | ✘ (`access_owner_only`) |
| dono | ✔ | ✔ | ✔ | ✔ | ✔ |

Amigo salva o design dos outros com `PUT /api/home/design {id, ownerId, design}` (`homeApi.saveFriendDesign`).
Se o amigo mandar sem `access`, o do dono é mantido. `visits:'nobody'` fecha a casa para TODOS os amigos
(GET da casa, visita e festa — quem estiver dentro é tirado). `visitsOpen:false` só fecha as visitas com o dono offline.

### Sujeira (regras)
- dono: substitui a lista inteira;
- amigo (`clean`+): só **remove** itens;
- **adicionar** só durante uma festa ativa na casa e estando nela (senão 403 `not_in_party`);
- com festa ativa, o PUT vai para o `PartyRoom` (fonte da verdade), não direto ao KV.

### Festa — `GET /api/party/<hostId>` (WebSocket)
```
cliente → {type:'hello', id, name, handle?, skin, avatar?}
          {type:'s', s:{x, y, room, holding?, emote?}}        (≤8 Hz; o resto é ignorado)
          {type:'ev', e: PartyEvent}
servidor → {type:'welcome', you, host, hostHere, peers: PartyPeer[], mess: MessItem[]}
           {type:'join', p} {type:'leave', id} {type:'s', id, s} {type:'ev', e}
           {type:'reject', reason}   not_friend | closed | full | bad_id   (fecha o socket)
           {type:'denied', reason}   evento 'design' recusado (no_permission | structural_change | access_owner_only | bad_design)
```
- Entra: o dono, ou amigos (verificado no `FriendsHub`). Dono offline: amigos entram se a casa estiver aberta. Máx. 8.
- Eventos: `throw` (o `from` é sempre quem mandou), `splat` (vira sujeira, máx. 300), `clean` (papel `clean`+),
  `eat`, `cake` (0–64), `chat` (**só códigos** da lista `PARTY_CODES` em `server/party.ts` — sem texto livre),
  `design` (design inteiro; papel `decorate`/`build`; ≤1 a cada 0,5 s por pessoa). Rajada de 12 eventos, 8/s.
- Quem jogou junto na festa/presença/corrida fica registrado por 7 dias (pode pedir amizade pelo id).
- **Bots:** só no cliente (`botsIfAlone`), o servidor não simula.
- Gravação: a cada mudança, alarme de 5 s grava no armazenamento do DO; o KV só no fim da festa (último sai)
  ou no máx. a cada 60 s.

### Admin (`/api/admin/home/*`, token do painel) — painel → Moderação → "Casas & @nomes"
`GET /handle?h=`, `POST /handle/rename {id, handle}` (sem prazo), `POST /handle/ban {handle}` (ninguém usa mais;
o jogador fica sem nome e pode escolher outro na hora), `GET /home?id=` (JSON da casa, sujeira, quem está na festa),
`POST /home/clear-mess {id}`.

## Segurança infantil
- **Sem diretório:** não existe lista/busca de jogadores. Amizade só por **@nome exato** ou por **id de quem jogou
  junto** (presença, corrida, festa — registrado pelo servidor, o cliente não forja). Campeonatos ainda não contam.
- Desconhecidos (`by-handle`, pedidos) não veem online/visto por último/bagunça.
- @nomes passam pelo mesmo filtro do chat + regras contra telefone/redes sociais; o admin renomeia/bane.
- Festa sem texto livre: só códigos de atalho. Nomes de exibição passam por `safeName`.
- Bloqueio no servidor desfaz amizade, apaga pedidos e esconde a pessoa (`not_found`).
- **Limitação conhecida:** como no resto do jogo, o `id` do jogador funciona como credencial e é visível para quem
  joga junto (presença/festa) e para quem sabe o @nome. Alguém com o id pode agir como o jogador. Recomendação
  futura: chave secreta por aparelho emitida no primeiro registro.

## Uso do plano grátis (estimativa)
- **KV (1.000 escritas/dia):** claim de @nome = 3–4 escritas (raro, 1x/30 dias); design = 1 escrita
  (servidor recusa <3 s entre gravações; o cliente reenvia 1x); sujeira: 1 escrita por limpeza fora da festa,
  e a festa grava no máx. 1x/min + 1 no fim. Amizades **não** usam KV (ficam no DO).
- **KV leituras (100 mil/dia):** `GET /api/friends` lê `prof:<id>` de cada amigo (até 100) — o cliente reaproveita
  por 3 s e a aba Amigos sincroniza no máx. a cada 30 s.
- **DO (100 mil requisições/dia):** cada sync/presença/festa faz 1–2 chamadas ao `FriendsHub`; a festa conta
  mensagens WebSocket (com hibernação: sem gasto parado). Escritas SQLite do hub: online no máx. 1x/2 min por jogador.
- O `FriendsHub` é uma instância única: suficiente para milhares de jogadores ativos; se crescer, fatiar por id.

## Cliente (`src/services/home.ts`)
- Cache `bloop-home-v1`: @nome, minha casa (`getHome()` sem id funciona offline), design pendente (reenviado
  com rede), amigos/pedidos.
- Rede falhou → `'network'` / `false` / `null`, nunca lança.
- `addFriend('@nome' | 'nome' | id)`: id (com `-`) só vale para quem jogou junto; `not_met` vira `not_found`.
- Social: `social.friends` (perfil/aba Amigos) agora espelha os amigos do servidor. Na 1ª sincronização, cada
  amigo da lista local antiga recebe um pedido (só passa se jogaram juntos recentemente).
- Extras opcionais no contrato: `HandleCheck.until`, `HomeState.visitsOpen`, `PartySession.reason`,
  `PartyEvent {t:'design'}`, `HomeApi.saveFriendDesign`, `HomeApi.blockPlayer`; `setVisitsOpen(on)` exportado à parte.
