# Grupo (party), amigos e avisos

## Amigos
- **Busca de @**: `GET /api/handles/search?q=&id=` → até 10 `{ handle, name, skin, avatar?, creature?, online, rel }`.
  Prefixo, pedaço do meio (`star` acha `ana_star`), sem separadores (`anastar`), acentos/maiúsculas
  normalizados e erro de digitação (1–2 letras). Nunca devolve o id. Esconde quem bloqueou/foi bloqueado,
  @ banidos e quem desligou "Aparecer na busca". Limite: 45 buscas/min por jogador, 150/min por IP (429).
- Índice: SQLite do Durable Object `FriendsHub` (tabelas `hidx`, `htok`, `pc`), mantido por `setHandle`
  (claim, admin rename/ban). Montado sozinho, em lotes, a partir dos cartões já existentes.
- O pedido de amizade é sempre pelo @ exato escolhido na lista/QR (`POST /api/friends/request {id, handle}`).
- Tempo real: `GET /api/friends/live?id=` (WebSocket, hibernação). O servidor manda `{t:'ping'}` quando chega
  pedido, aceite, convite ou um amigo entra; o app então lê `GET /api/friends` (que também traz `invites`).
  Sem a conexão, o app consulta a cada 40 s com a tela aberta.
- Convites: `POST /api/friends/invite { id, to, kind: 'party'|'house'|'game', game? }` (só amigos, 1 a cada 20 s).
- Preferências: `POST /api/friends/prefs { id, hidden?, invites?: 'friends'|'nobody' }`.
- Links: `https://<site>/?amigo=<@>` (QR do "Meu @") e `bloopworld://amigo/<@>` abrem Amigos com o @ preenchido.

## Grupo (até 4)
Servidor: `server/squad.ts`, Durable Object `SquadRoom` (binding `SQUAD`, migração `v4-squad`), uma instância por grupo.

| Rota | O quê |
|---|---|
| `POST /api/squad/create {id}` | cria (`{squad, code}`), quem cria é o líder |
| `POST /api/squad/invite {id, squad, to}` | convida amigo (respeita "aceitar convites de"); vira convite `kind:'squad'` |
| `GET /api/squad/<squad>` (WebSocket) | entra: membro, convidado ou com `code` (link/QR `?grupo=<squad>.<code>`) |

Mensagens do WebSocket estão no topo de `server/squad.ts` (pronto, chat com o filtro do chat global,
emotes, remover/tornar líder, `launch`). Quem fica 2 min desconectado sai do grupo; grupo vazio acaba.

App: `src/party/` — `squad.ts` (sessão), `lobby.ts` (os Bloops do grupo no hub, abaixo do carrossel),
`panel.ts` (membros, convidar, link/QR, chat, sair), `bell.ts` (central de avisos), `contract.ts`.

## Jogar junto — contrato para jogos (`src/party/contract.ts`)
**O grupo É a sala.** Quando o **líder** aperta JOGAR (o hub emite `bus 'game-launch'`), o grupo recebe `{ game, room }`;
cada membro vê "3‑2‑1 Entrando no jogo do líder" (pode tocar "Ficar aqui") e o app abre o mesmo jogo já conectado —
sem código, sem botão extra. Jogos com `join(room)` registrado são chamados direto (`pg.join(room)`).

| Modo | Jogos | Como entra |
|---|---|---|
| sala própria (`mode:'room'`) | voo, noites, garimpo, floresta (Mundo Aberto) | `partySeat(jogo)` → `{ host, leader, code() }`: o líder cria a sala com o código derivado do grupo; os outros entram nela (tentam de novo até o líder abrir). Garimpo: o líder escolhe o save, os outros esperam. |
| presença | disaster (mesmo cenário + placar "quem sobreviveu mais"), band, cozinha, rally (placar de distância), tycoon | `joinPresence(jogo)` já usa `?party=<room>` |
| duelo (`mode:'duel'`) | cor, lugar, tubo, montaleva, desenho | `registerDuelGame(jogo)` + `takeDuel(jogo)` → `startDuel({...})` (abaixo) |
| corrida | orbit → Corrida Orbital | `partyRoomFor('race')` |
| juntos (`mode:'together'`) | caca, studio, cinema | faixa com quem do grupo está no jogo + emotes (`src/party/together.ts`) |
| ainda solo | cavafala, anomalias (em obra — `PARTY_WIP`) | aviso "Esse jogo ainda é solo" |

```ts
import { partySeat, consumePartySeat, registerPartyGame } from '../../party/contract';
registerPartyGame('meu-jogo', { mode: 'room' });           // register.ts (leve)
const seat = partySeat('meu-jogo');                         // ao abrir o jogo
if (seat) { consumePartySeat('meu-jogo'); seat.host ? criarSala(seat.code()) : entrarComRetry(seat.code()); }
```

### No hub, ao vivo (`src/party/follow.ts`, mensagens `focus` / `votemode` / `vote` do SquadRoom)
- O líder tem coroa ♛ no saguão. Quando ele passa entre os jogos, o carrossel dos outros acompanha com o selo
  "♛ @líder escolhendo…" (e os ajustes enviados em `sendFocus(jogo, cfg)`).
- **Votação** (botão no saguão, só o líder liga): cada um escolhe na própria tela (a carta = o voto), fotinhos
  dos votos na carta; no JOGAR do líder vence o mais votado (empate → o do líder) — `setLaunchFilter` do hub.

### Duelo (`src/party/duel.ts`, servidor `server/duel.ts`, DO `DuelRoom`, migração `v9-duel`)
Mesma semente para todos, contagem 3‑2‑1, placar ao vivo (`LiveBar`, reutilizável), "esperando os outros",
pódio com Revanche. `rank: 'score' | 'time'`, limite de tempo (o servidor encerra por alarme).
WebSocket `/api/duel/<jogo>/<CÓDIGO>`. Fora do grupo: botão "Duelo online" no menu do jogo → sala com
"Chamar amigo" (principal) e código/QR (secundário); link `bloopworld://duelo/<jogo>/<CÓDIGO>` ou `?duelo=<jogo>/<CÓDIGO>`.

### Amigos primeiro, código só como alternativa (`src/party/friends-play.ts`, `src/party/join.ts`)
- Quem abre uma sala avisa os amigos: `reportPlaying(jogo, código)` → `POST /api/friends/playing {id, j}`
  (memória do FriendsHub, ~100 s). `GET /api/friends` traz `playing: "<jogo>.<CÓDIGO>"` → "Fulano está jogando — ENTRAR"
  (na carta do jogo no hub e nos menus online). `openJoin()` abre o jogo já entrando na sala.
- "Chamar amigos": lista com bolinha online e "Chamar" em um toque — convite `kind:'game'`, `game:"j-<jogo>-<código>"`.
- "Entrar com código / QR" fica como link pequeno.

### Convite na hora (`src/party/invite-pop.ts`)
O servidor manda `{t:'ping'}` pelo `/api/friends/live`; o app lê `/api/friends` e mostra um cartão grande com a foto
de quem chamou, ACEITAR / Recusar, som e vibração (dentro de um jogo: faixa compacta no topo). O convite também
fica no Correio (cartão em destaque com Aceitar, badge) e no sino; com o app em 2º plano, notificação local.

## Avisos
Toast pequeno (`ui/notify`) + badge no botão Social + sino com a lista (pedidos, convites, amigo online).
Com o app em 2º plano e a conexão ainda viva, convites/pedidos viram notificação local do Android
(`@capacitor/local-notifications`, só se a permissão já foi dada). **Futuro:** push de verdade (FCM) para
avisar com o app fechado — exige servidor de push e tokens por aparelho.

## Segurança (13+)
Pedido de amizade só pelo @ exato; convites só de amigos (ou de ninguém, nos ajustes); bloquear e denunciar
em busca, pedidos, amigos e grupo; chat do grupo com o mesmo filtro do chat global (menores de 13 / modo
seguro: só atalhos); a busca nunca mostra id, nome real ou localização.
