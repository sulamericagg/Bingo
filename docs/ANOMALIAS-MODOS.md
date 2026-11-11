# Anomalias & Cia — modos Recepção e Corredor

Menu: 3 cartões (`Turno da noite` = modo original com mapas; `Recepção`; `Corredor`), cada um com
progresso próprio no save (`bw-anomalias` → `modes.recepcao` {done, stars[]}, `modes.corredor[tema]`
{best, wins, stars}, `modes.last`). Resultado → `reportRun` (pausa de anúncio igual às noites).
Código em `src/games/anomalias/modes/` (carregado sob demanda; `meta.ts` é o pedaço leve que o menu usa).

## Recepção (`modes/recepcao/`)
- `data.ts` (puro): 12 hóspedes (ícone-nome, cor, acessórios), 18 pistas de impostor liberadas por
  noite (1: olhos, dentes, cor, acessório, fora da lista · 2: sombra, cabeça girando, parado demais,
  resposta errada · 3: piscar fora de ritmo, espelho, UV, carimbo, voz com chiado · 4: data, já entrou,
  cor sutil · 5: bocão sutil, sem as óbvias). Noites 1–5: 6→10 visitantes, 2–4 impostores.
  Justiça: 1º visitante sempre normal, nunca 3 impostores seguidos, pistas só das ferramentas liberadas.
- `desk.ts`: cabine (vidro, mesa, monitor), saguão com porta para a rua (chuva), porta lateral, espelho
  (reflexo "de mentira" posicionado para ser visto da mesa) e o corredor de dentro (câmera do monitor).
- `recepcao.ts`: ferramentas crachá (painel à esquerda, a cena continua à direita), lista fixa no topo
  (✓ = já veio), lanterna, olho mágico (lupa), perguntar (balão com ícone; impostor com "voz" chiando),
  UV (noite 3+). ABRIR / NEGAR / SEGURANÇA (2 por noite). Impostor que entra: perigo + pisca-pisca +
  aparece no monitor (olhos acesos) + Bocudo; perigo 100 = pego. Hóspede barrado = reclamação.
  ★ sobreviveu, ★ nenhum impostor entrou, ★ nenhuma reclamação. Resumo com foto de cada visitante e
  comparação crachá × visitante + pista (abre sozinho no 1º erro).

## Corredor (`modes/corredor/`)
- `hall.ts`: corredor 16 m com passagens em "S" nas pontas. Seguir em frente: meio da passagem B →
  translação para o meio de A. Voltar: meio de A andando para trás → giro de 180° em torno do centro de A
  (a passagem é simétrica). A troca de anomalia acontece aí, fora de vista.
- `themes.ts`: hospital, hotel, escola, metrô (texturas em canvas + nightkit, 6 objetos próprios cada).
- `anomalies.ts`: 55 genéricas + 24 de tema = 79 (luzes, portas, cartazes, placas, teto baixo, piso,
  neblina, torto, o Bloop que anda com rosto/jeito errado, Bocudo espiando, vulto, balão, marcas de mão,
  pegadas, goteira, relógio, câmera que segue, ventilação com olhos...). Dificuldade 1–3 liberada por
  nível (0–2: só óbvias; 3–5: médias; 6+: todas); baralho sem repetição; 1ª volta sempre normal;
  no máximo 3 voltas iguais seguidas. Errou: cartão com a foto da anomalia (ou "estava normal").
- Nível 10: porta de saída com dia lá fora + festa. ★ saiu, ★ ≤2 erros, ★ 0 erros.

## Andar
Os modos e o turno da noite usam `src/3d/fpkit` (preset `indoor`). Turno: `LiveBoxCollider`
(`core/world.ts`) sobre a lista viva de caixas do mapa, filtro 0,15–1,7 m; velocidade 2,7 m/s (55% com
a câmera levantada). Corredor: `Walker` (`modes/common.ts`) = FpController + FpCamera + AabbCollider.

## Testes / debug (`?debug`)
`window.__ano.playRec(n, seed)`, `window.__ano.playCor(tema, seed)`; `window.__rec` (`debugDecide`,
`debugLook`, `plan`, `recs`), `window.__cor` (`debugGo('fwd'|'back')`, `debugFrame(id)`, `setLevel`,
`forceNext`, `anomalyIds`).
