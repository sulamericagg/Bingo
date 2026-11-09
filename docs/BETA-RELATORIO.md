# Relatório do Beta Tester — Bloop World

Branch `wip/beta` · base `bf6d088` · 09/11/2026 · build de produção (`vite build` + `vite preview`)

Testei como uma criança exigente: instalação limpa → abertura → apelido → hub. Depois joguei cada jogo
várias vezes com toque, entrei e saí 5 vezes de cada um, abri todos os painéis, usei o voltar do Android
(Escape → `ui.back()`), pausei o app (`visibilitychange`), deixei sem internet (`/api/**` abortado),
troquei o idioma (en, ja, ru) e liguei o banner falso (`?fakebanner=60`).

**Aparelhos emulados (Playwright):** Pixel 7 (412×915, DPR 2,6), Galaxy S9+ (320×658, DPR 4,5),
aparelho fraco (360×640 com CPU 6× mais lenta) e telas de 30/60/120 Hz (rAF simulado).

As capturas estão em `scratchpad/beta/` desta sessão: hub antes/depois em 320 px, os jogos, os painéis,
os idiomas, o banner e o microfone.

## 1. Resumo

| Gravidade | Corrigidos | Pendentes |
|---|---|---|
| Crítico | 1 | 1 |
| Alto | 4 | 1 |
| Médio | 2 | 4 |
| Baixo | 0 | 9 |

O que passou sem achados:
- **Vazamentos:** entrei e saí 5 vezes de cada jogo e 2 vezes de cada um dos 10 painéis. O nº de loops rAF,
  `setInterval`, listeners, canvas e AudioContext em uso ficou estável. A Banda cria um AudioContext por
  partida, mas fecha ao sair.
- **Banner falso:** não cobre nenhum botão no hub, na Loja nem no Passe, e some em todos os jogos, no Bichinho e na Casa.
- **Velocidade da física:** o Rally percorreu 38 m a 30 Hz, 38 m a 60 Hz e 39 m a 120 Hz em 4 s. Nada fica mais rápido em telas de 120 Hz.
- **Aparelho fraco (CPU 6×, nível Mínimo):** hub 46 fps; Orbit e Tubo 35 (o teto é 30); Rally 57;
  Fábrica 39; Banda 44; Casa 57. Todos os jogos abrem em menos de 0,4 s.
- **Apelido offline:** "Bora jogar!" fecha em cerca de 0,4 s, com ou sem internet.

## 2. Problemas (do mais grave ao menos grave)

### Crítico

| # | Problema | Status | Como reproduzir |
|---|---|---|---|
| C1 | **O microfone do Bichinho ficava ligado no hub.** Se a criança tocava em "Falar" e fechava o Bichinho enquanto o pedido de permissão estava aberto, o microfone abria depois, com a tela já fechada. É um problema de privacidade de criança. No Android o diálogo de permissão pausa o app, então isso acontece com facilidade. | **Corrigido** `f9508a6` (antes: 1 faixa de áudio *live* depois de fechar; agora: 0) | Bichinho → Falar → Vamos! → voltar antes de responder à permissão → permitir |
| C2 | `ADS_TEST_MODE = true` e IDs de teste do AdMob | Pendente (dono / `src/config.ts`) | Já estava no relatório de QA. Trocar antes de publicar |

### Alto

| # | Problema | Status | Como reproduzir |
|---|---|---|---|
| A1 | **Queda Giratória:** o voltar do Android → "Sair para o menu" no meio da queda (ou na tela "Continuar?") **apagava as moedas coletadas** e não contava a partida (Passe, missões e bichinho não viam nada) | **Corrigido** `6829937` | Jogar, pegar moedas, voltar → Sair. Antes 0 moeda; agora +7 e 1 `run-end` |
| A2 | **Rally:** Pausa → "Garagem", Pausa → "Sair" ou voltar → Sair no meio da corrida apagavam as moedas e a distância | **Corrigido** `fd5bca4` | Acelerar 6 s, voltar → Sair. Agora +9 moedas e 64 m reportados |
| A3 | **Orbit:** "Sair para o menu" na pausa apagava as moedas e gemas da partida. O voltar do Android durante a contagem do "Continuar?" **minimizava o app** (`back()` retornava false) | **Corrigido** `50cada3`: a pausa encerra a partida e mostra o resultado; o voltar na contagem vai para o resultado | Orbit → pausa → Sair; ou morrer com pontos → voltar |
| A4 | **Telas de 320 px (Galaxy S9+ e Androids pequenos):** o nome do jogador ficava embaixo da pílula de moedas, o botão "Oferta" cobria o atalho "Código" (22×48 px sobrepostos) e 4 dos 10 itens da barra inferior ficavam escondidos sem nenhuma dica de que dava para rolar | **Corrigido** `37ac2ee`. Abaixo de 340 px aparece só o avatar, os atalhos encolhem, a oferta perde o ícone e a barra esmaece na borda enquanto houver itens à direita | Abrir o hub em 320×658 |
| A5 | **Passe em outros idiomas:** os nomes das recompensas são montados com palavras em português (`MOTIFS` em `src/pass/catalog.ts`, por exemplo "Bichinho Estrela-guia" em russo e japonês) | Pendente (Passe / i18n). São 52 temporadas × 4 palavras, sem chave `t()` | Idioma ru → Passe |

### Médio

| # | Problema | Status | Como reproduzir |
|---|---|---|---|
| M1 | 10 avisos fixos em português (Criar, Loja, Orbit: "Escudo grátis…", "Volte amanhã…", "Seu Bloop está pronto!", "Moedas insuficientes…", "Vídeo indisponível agora") e **15 textos novos da Casa offline/3D sem tradução** nos 11 idiomas (a correção da Casa trouxe essas chaves sem traduzir) | **Corrigido** `3e021e9`. `i18n:check` sem nenhuma chave de interface faltando | Idioma en → Casa sem internet |
| M2 | Folha "Reportar bug" aberta durante um jogo: o voltar do Android abria o "Sair do jogo?" **por trás** da folha, e a folha continuava aberta | **Corrigido** `2a8bc66` | Ajustes → Beta → jogo → botão do inseto → voltar |
| M3 | Em 320 px os chips de bônus do Orbit viram "Es… Co…" e "Ím… Co…" e ficam ilegíveis | Pendente (hub / Orbit) | Hub em 320 px |
| M4 | A barra inferior tem 10 itens e mostra só 5 ou 6. Campeonatos, Coleção e Ranking quase não são descobertos (a dica de rolagem ajuda, mas não resolve) | Pendente (design do hub) | Hub em qualquer celular |
| M5 | Nomes de bichinhos da Coleção (`creature.*`) não têm tradução em nenhum idioma | Pendente (Coleção / i18n). Confirmar se são nomes próprios | Idioma en → Coleção |
| M6 | O jogo continua rodando por trás da folha "Reportar bug" (no Tubo e no Rally dá para morrer enquanto a criança escreve) | Pendente (Beta). Sugestão: chamar `hubPause()` ao abrir a folha | Reportar bug no meio da queda |

### Baixo

| # | Problema | Área |
|---|---|---|
| B1 | Escape no **navegador** abre a pausa do próprio jogo (Tubo/Rally) e o "Sair do jogo?" ao mesmo tempo. No Android não acontece | Tubo / Rally |
| B2 | O selo "Online" aparece nas cartas do hub mesmo sem internet | Hub |
| B3 | Campeonatos offline mostra só "Sem conexão", sem o botão "Tentar de novo" que o Ranking tem | Social / Campeonatos |
| B4 | Casa: "Mais de 8,70 × 10⁶⁰ casas diferentes possíveis" é notação científica numa tela para crianças | Casa |
| B5 | Passe em russo: o título longo da temporada ("Звёздное Рождество") passa por cima do mascote | Passe |
| B6 | Fábrica: a tela inicial deixa a metade de cima vazia (fundo roxo sem arte) | Fábrica |
| B7 | Sem servidor, cada jogo tenta 1 WebSocket `/api/presence/<jogo>` e gera erro no console. Não fica tentando em loop | Presença (geral) |
| B8 | Rally em português: "Anti-capotar" quebra em 2 linhas na garagem | Rally |
| B9 | Desastres (fora do meu escopo): só testei abrir, tocar, pausar e sair 5×. Sem erros e sem vazamentos | Agente de fluidos |

## 3. Nota por jogo (testador exigente)

| Jogo | Nota | Comentário |
|---|---|---|
| Bloop Orbit | 7,5 | Gostoso e estável a 60 fps. Morrer cedo é frustrante para quem começa. Sair no meio agora paga as moedas. Os chips de bônus ficam ilegíveis em telas pequenas |
| Queda Giratória (Tubo) | 8 | O mais "pega e joga". A física ficou boa depois da correção. Perder moedas no voltar era o pior defeito (corrigido) |
| Rally Lunar | 7,5 | Pedais fáceis, física consistente de 30 a 120 Hz. A garagem é densa para crianças pequenas. Perder a corrida inteira ao ir para a garagem doía (corrigido) |
| Fábrica Estelar | 6,5 | Boa ideia, mas a tela inicial está vazia e o tabuleiro é pequeno no celular. Leva tempo para a criança entender o que fazer |
| Bloop Banda | 7 | Bonito e com bom ritmo. O menu tem muitas opções (Estúdio, Calibrar, Visual) para uma criança de 6 anos |
| Desastres | — | Fora do escopo (o agente de fluidos está mexendo) |
| Bichinho | 8 | Carismático. "Falar" é ótimo, e agora o microfone fecha sempre que a tela fecha |
| Casa 2D / 3D | 7 | Funciona offline e mostra avisos claros (agora traduzidos). O 3D é pesado em aparelhos fracos |
| Criar / Loja / Passe / Coleção | 7 | Visual caprichado. O Passe e a Coleção ainda aparecem meio em português em outros idiomas |
| Social / Chat / Campeonatos offline | 6,5 | Não travam, mas é tudo texto de "sem conexão". Faltam ações para fazer offline |

## 4. Top 10 recomendações

1. Trocar `ADS_TEST_MODE` e os IDs do AdMob antes de publicar (C2).
2. Tirar os nomes das recompensas do Passe do português fixo: gerar chaves `t()` por palavra ou usar nomes neutros (A5).
3. Reduzir a barra inferior para 5 itens e levar Campeonatos, Coleção e Ranking para um botão "Mais" (M4).
4. Pausar o jogo aberto ao abrir "Reportar bug" (M6).
5. Em telas de 360 px ou menos, mostrar os chips de bônus do Orbit só com ícone e contador (M3).
6. Regra para todo jogo novo, incluindo Cozinha e Floresta: `destroy()` precisa creditar as moedas da partida em andamento. Foi o bug mais repetido (Tubo, Rally e Orbit).
7. Esconder o selo "Online" quando não houver conexão (B2) e pôr "Tentar de novo" nos Campeonatos (B3).
8. Fábrica: preencher a metade de cima da tela inicial com a vitrine animada e um tutorial de 3 passos (B6).
9. Rodar `npm run i18n:check` no CI: as chaves novas da Casa chegaram sem tradução.
10. Testar num Android de entrada real com Escape/voltar em todos os jogos e com o pedido de permissão do microfone (C1 depende do diálogo do sistema).

## 5. Verificações

- `npx tsc --noEmit` OK · `npm run typecheck` OK · `npx vite build` OK · `npm run build` OK
- `npm run test:server`: **278 ok, 0 falhas**
- `node scripts/i18n/extract.mjs --check` OK
