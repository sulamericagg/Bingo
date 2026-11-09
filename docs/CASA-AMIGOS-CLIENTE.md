# Casa, Planeta & Amigos — cliente

Tudo em `src/home/*` (+ página dev `scripts/dev/home.html`). Contrato: `src/home/api.ts` (não alterado).
O backend (`src/services/home.ts`) é carregado por `import.meta.glob`; se não existir ou falhar, usa-se a API local
`src/home/mock-api.ts` (amigos de mentirinha, casas aleatórias, festa com bots). Festa SEMPRE funciona (cai em bots se offline).

## Integração (lead)

```ts
import { registerHome } from './home/register';
registerHome(); // painel 'casa' (navOrder 35, ícone home) + entrada 'amigos' (sem navOrder)
```

| Função (`src/home/register.ts`) | Para quê |
|---|---|
| `registerHome()` | registra painéis `casa` e `amigos` |
| `openHome(opts?)` | `{ tab?: 'home'\|'friends'\|'build'\|'rooms', visit?: friendId, party?: hostId, room? }` |
| `openFriendsPanel()` | abre direto em Amigos |
| `openHandleEditor()` | editar o @ (botão no Perfil) |
| `closeHome()` | botão voltar do Android (true se consumiu) |
| `isHomeOpen()`, `myHouseThumb()` | estado; miniatura (dataURL) da casa |

Eventos emitidos: `home-closed`, `pet-care {action:'party'}` (+ `addStat('fun', 12)` no bichinho), XP do Passe da Casa:
`home-build {item}`, `home-paint {room}`, `home-clean {count:1}` (por sujeira), `party-host`, `party-join {hostId}`, `home-visit-help {kind}`.
Escuta `home-item-grant` (Passe da Casa) para atualizar o catálogo. Botão "Entrar em 3D" chama `open3D(opts)` de `src/home3d/index.ts` (glob; mostra "em breve" se não existir).

## Prova: mais de 1 trilhão de casas

Cada campo do design é um índice independente e cada opção muda o desenho. `countCombinations()` (catalog.ts) multiplica;
a página dev loga a conta (`?mock` → console `[casa] TOTAL=…`, e `window.__combos`).

Planeta (18 campos): formato 6 · tamanho 4 · terreno 10 · cor do chão 24 · água 5 · caminho 5 · céu 12 · anéis 6 · cor do anel 24 · luas 4 · nuvens 4 · vegetação 7 · 6 enfeites × 14
= **209.842.024.218.624.000** (2,1 × 10^17)

Fachada (22 campos): base 5 · andares 3 · parede 8 · cor 24 · acabamento 5 · telhado 8 · cor 24 · chaminé 5 · porta 8 · cor 24 · janela 6 · quantidade 4 · moldura 24 · varanda 4 · sacada 4 · torre/anexo 5 · jardim 6 · cerca 6 · cor da cerca 24 · placa 4 · correio 5 · luzes 5
= **10.567.230.160.896.000.000** (1,06 × 10^19)

Interior (5 cômodos: sala, cozinha, quarto, banheiro, salão de festa): por cômodo piso 12 estilos × 24 cores × papel de parede 12 × 24 = 82.944;
82.944^5 = **3.925.770.232.266.214.525.108.224** (3,9 × 10^24)

**TOTAL = 8.705.195.147.578.395.612.032.237.670.798.947.844.284.680.866.103.296.000.000.000 ≈ 8,70 × 10^60**
— sem contar os 126 móveis (42 tipos × 3 variantes) em posição livre, 24 cores cada, giro, espelho e camadas, nem a pintura livre e os itens do Passe.

## O que tem

- **@nome**: tela "Escolha seu @" na 1ª vez (checagem com debounce 380 ms, verde/vermelho, sugestões em chips, regras e dicas de segurança); editável em Amigos e via `openHandleEditor()`.
- **Amigos**: lista (online, foto = Bloop do amigo, miniatura do planeta, aviso "A casa do @x está uma bagunça! Ajude a limpar"), Visitar casa, Festa, pedidos (aceitar/recusar, badge), adicionar por @ exato.
- **Permissões**: visitas on/off, papel padrão e por amigo (Só visitar / Limpar / Decorar / Construir) → `design.access`. Na visita a UI só mostra as ferramentas do papel; mudanças de quem decora vão pela sessão da festa como evento local `{t:'design', by, room, items?, paint?}` (o servidor valida o papel).
- **Construtor** planeta + fachada: grupos, preços (grátis/moedas/gemas/vídeo/passe/evento), desfazer/refazer, Surpreenda-me (só peças liberadas), salvar (auto 1,5 s + botão; cache local + miniatura).
- **Interior**: 5 cômodos, pisos/papéis com cor, 126 móveis procedurais, arrastar com encaixe (5 u), alça de giro (15°), espelhar, cor, camadas, vários (multi-seleção), duplicar, apagar, modelos de cômodo (Aconchegante/Gamer/Festa/Jardim + kits do passe), quique ao soltar + poeira + som.
- **Pintura**: rolo/pincel/spray, 24 cores + acabamentos (lisa, degradê, listras, estrelas, glitter; + tintas do Passe), fita crepe (bordas lisas + bônus), % de cobertura com som subindo e vibração, brilho + fanfarra a 100%. Paredes dos cômodos e fachada (pintar fachada = revela a casa nova por máscara). Salvo em `design.paint[room] = { wall: "cor:acab" | "pass:<id>", strokes?: "cor:acab;<grade hex>" }`.
- **Festa**: bolo de 8 fatias (mastigar + farelos), comidas (bolo, torta, tomate, suco, balão de glacê) com arremesso estilingue (mira pontilhada), arco com altura, respingos em parede/chão/móveis, carinha de glacê nos personagens, móveis pequenos derrubados (`MessItem.moved`), música sintetizada, emotes (`openEmoteWheel`), sem chat.
- **Bagunça persistente**: `setMess` (dono, ou amigo limpando). Limpar com esponja/rodo/aspirador/saco/arrumar (arrastar o móvel de volta pro fantasma). Ferramenta certa limpa 3× mais rápido. Moedas por sujeira, bônus ao terminar, medalha "Amigo Ajudante" na casa dos amigos.
- **Bichinho**: o Bloop mora na sala/quarto (toque → abre a Casa do Bloop no cômodo certo); festa → `pet-care` + alegria; casa muito suja tira um pouquinho de alegria (1×/dia).
- **Desempenho**: casca do cômodo + móveis parados + sujeira em canvases de cache; planeta+casa em cache por design; partículas/projéteis em pools fixos; dpr e 30/60 fps pelo `core/quality`.

## Dev

`npx vite --port 4371` → `/scripts/dev/home.html?mock&coins=5000` (`&reset` limpa, `&variety` = 6 casas aleatórias). `window.__home` = debug.

Pendências: kits de festa e skins de ferramenta do Passe ainda não aparecem na festa/limpeza (só móveis, pisos/paredes, tintas, exterior e kits de cômodo).
