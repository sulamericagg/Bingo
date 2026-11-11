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
Quando o **líder** abre um jogo (o hub emite `bus 'game-launch'`), o grupo recebe `{ game, room }` e cada
membro chama `partyLaunch(game, room)` e abre o mesmo jogo.

```ts
import { partyRoomFor, registerPartyGame } from '../../party/contract';

// 1) Jogo com presença (services/presence.ts): NADA a fazer — joinPresence(gameId) já conecta em
//    /api/presence/<gameId>?party=<room> (sala só do grupo). Lista: PRESENCE_GAMES em contract.ts.
// 2) Jogo com online próprio (ex.: Pouso Forçado):
registerPartyGame('pouso', {
  async join(room) { /* abrir o jogo e entrar na sala `room` */ },
});
//    e, ao conectar, usar a sala do grupo se houver:
const room = partyRoomFor('pouso'); // string | null (aceita 'pouso-xyz')
//    também dá para ouvir bus.on('party-launch', ({ game, room }) => ...)
```
- Corrida Orbital: automático (`/api/race/join?party=<room>` → todos na sala `room-party-<room>`).
- Festa na casa: botão "Festa na minha casa" (líder) → membros entram na festa da casa do líder (precisam ser amigos do líder).
- Jogo sem online: membros veem "Esse jogo ainda é solo".

## Avisos
Toast pequeno (`ui/notify`) + badge no botão Social + sino com a lista (pedidos, convites, amigo online).
Com o app em 2º plano e a conexão ainda viva, convites/pedidos viram notificação local do Android
(`@capacitor/local-notifications`, só se a permissão já foi dada). **Futuro:** push de verdade (FCM) para
avisar com o app fechado — exige servidor de push e tokens por aparelho.

## Segurança (13+)
Pedido de amizade só pelo @ exato; convites só de amigos (ou de ninguém, nos ajustes); bloquear e denunciar
em busca, pedidos, amigos e grupo; chat do grupo com o mesmo filtro do chat global (menores de 13 / modo
seguro: só atalhos); a busca nunca mostra id, nome real ou localização.
