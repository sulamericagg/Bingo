# Mundo — Servidores (navegador estilo Minecraft)

Pedido do dono: "lista com fotinho de cada servidor, toca e entra; PvP e minigames; jogador cria servidor
no Bloop Studio". Código: `src/games/floresta/world/{browser,srvapi,covers,net,mini,arena}.ts`,
`src/studio/play/online.ts`, `server/servers.ts`, `server/mundo.ts`.

## O que o jogador vê
- **Navegador** (`browser.ts`): cartões com foto (JPEG ≤ 30 KB enviado pelo anfitrião a cada ~90 s; sem foto →
  capa desenhada em `covers.ts`), selo do modo, `n/máx.` com bolinha online, fotinhos dos amigos que estão dentro.
  **Um toque = entra.** Abas: Em alta · Amigos · Minigames · PvP · Criados por jogadores · Meus mundos. Busca por
  nome/autor/código. "Criar servidor" (mundo online com modo/tipo/PvP/minijogo, ou mapa do Bloop Studio).
  "Entrar com código / QR" é só um link pequeno no rodapé (link `?mundo=<CÓDIGO>` / `bloopworld://mundo/<CÓDIGO>`).
- **Oficiais, sempre no ar** (`SLOTS` em `server/servers.ts`): Sobrevivência co-op, PvP Arena, Ilhas no Céu,
  Corrida de Obstáculos, Spleef de Blocos, Esconde-esconde, Construção. Cada vaga tem instâncias com código fixo
  `<PRE>X<nn>` (ex.: `PVPXAA`); `POST /api/servers/match` manda para a mais cheia que tem lugar e abre outra quando
  lotam (reserva de 12 s evita mandar todo mundo para a última vaga). Rodadas dos minijogos começam sozinhas
  (contagem no letreiro) e recomeçam (`mini.ts`).
- **PvP Arena**: disco no céu, golpe = empurrão (knockback calculado no alvo a partir da posição do atacante que o
  servidor conhece; ninguém empurra de > 7 m; 1 golpe a cada 250 ms). Sem dano nem sangue; quem cai volta na hora e
  quem empurrou por último ganha 1 ponto.
- **Servidores do Bloop Studio**: um mapa publicado na Loja vira servidor (navegador → Criar servidor → Do Bloop
  Studio, ou Studio → Minhas publicações → Criar servidor), com nome, 4/8/12 jogadores, regra (Livre/Juntos/
  Corrida/Coleta/Sobreviver/Empurra-empurra), PvP e "só amigos". **Só aparece para os outros depois que a
  moderação da Loja aprovar** (UgcHub); o WorldRoom recusa quem não é o dono enquanto não estiver aprovado, e
  "só amigos" recusa quem não é amigo do dono. Joga no motor do Studio (`studio/play/online.ts`): cada um simula o
  próprio Bloop e manda a posição; os outros aparecem com o nome em cima; com PvP, botão "Empurrar".
- **Mundos de jogador** (criados no navegador): aparecem para o dono e os amigos (aba Amigos/Meus mundos).
- **Grupo**: o líder entra num servidor → `sendFocus(jogo, {srv: código})` → quem está no navegador ou em outro
  servidor segue sozinho. Quem chega depois lê `cfg.srv` do estado do grupo.

## Servidor
Durable Object `ServerDir` (binding `SERVERS`, migração **`v13-servers`**, instância única `hub`).
Os `WorldRoom` contam quem está dentro (`beat`) a cada entrada/saída e a cada minuto (alarme).

| Rota | O quê |
|---|---|
| `GET /api/servers/list?id=` | cartões (oficiais somados por vaga, publicados aprovados/do dono, mundos de amigos) |
| `POST /api/servers/match {id, slot, avoid?}` | código da instância oficial |
| `GET /api/servers/thumb?code=&v=` | foto (image/jpeg) |
| `POST /api/servers/publish {id, item, name, max, pvp, friendsOnly, goal}` | mapa da Loja → servidor (`S` + 5 letras) |
| `POST /api/servers/unpublish {id, code}` | o dono tira o servidor |

WebSocket do mundo: `/api/mundo/room/<CÓDIGO>` (ver topo de `server/mundo.ts`; `{t:'thumb', d}` só do anfitrião,
1 a cada 20 s, ≤ 40 960 caracteres de data URL).

## Teste local
`npx vite build` (o wrangler serve `dist/`), `npx wrangler dev --local --port 8813 --var ADMIN_PASSWORD:…`,
`BLOOP_API=http://127.0.0.1:8813 npx vite --port 5613` (o proxy do vite também encaminha WebSocket).
Com `?debug`: `window.__srv` (cartões/tocar), `window.__forest.opts.net` (sessão), `window.__mini`, `window.__snet`.
