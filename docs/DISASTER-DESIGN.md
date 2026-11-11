# Sobreviva aos Desastres — design de dificuldade (nov/2026)

> Pedido do dono: "Está fácil demais ganhar o tsunami e os outros."
> Objetivo: cada desastre ameaça **todos** os lugares com o tempo, os lugares seguros são
> **temporários/parciais**, e a criança precisa **se mexer, ler o aviso e decidir** — sem virar
> injusto (todo golpe é avisado, todo desastre tem contra-jogada clara).

## 1. Diagnóstico (medido, não achismo)

Banco: `scripts/dev/disaster-bench.mjs` roda rodadas inteiras do 2D sem desenhar
(4 mapas × N sementes por desastre) e mede a sobrevivência por estratégia:

| coluna | o que é |
|---|---|
| parado | o seu Bloop sem nenhum comando |
| mais-alto | uma "estátua" parada no lugar alto mais óbvio do mapa (o mais alto: plataforma, copa, telhado ou torre) |
| lugar-alto | média de estátuas em **todos** os lugares altos |
| bot-esperto | IA com habilidade 1 (vai ao lugar seguro óbvio; fluidos: sobe na torre mais alta) |
| bot-médio | IA com habilidade 0,6 (aproximação da criança média) |

**Antes (normal, cenário ★1):**

| desastre | parado | mais-alto | lugar-alto | bot-esperto | bot-médio |
|---|---|---|---|---|---|
| tsunami | 50% | 81% | 37% | 13% | 70% |
| vulcão | 25% | 31% | 38% | 40% | 69% |
| terremoto | 38% | 44% | 34% | 67% | 81% |
| tornado | 0% | 0% | 1% | 96% | 70% |
| meteoros | 6% | 6% | 5% | 58% | 75% |
| enchente | 31% | **100%** | 59% | **100%** | **100%** |
| avalanche | 38% | **100%** | 38% | 35% | 77% |
| raios | 25% | 19% | 26% | 58% | 77% |
| ácido (gosma) | 19% | **100%** | 49% | **100%** | 94% |
| meteoro gigante | 0% | 0% | 0% | **96%** | **98%** |

**Antes (★4):** enchente "mais-alto" 100%, ácido 92%, avalanche 92%, tornado bot-esperto 100%,
meteoro gigante 86%.

Por que é fácil:
1. **Um lugar resolve a rodada.** Fluidos (enchente, gosma, avalanche, tsunami) têm um alvo fixo
   menor que a plataforma flutuante/torre mais alta. Achou o lugar → 100%, e nada muda depois.
2. **Uma onda só.** O tsunami passa uma vez; depois a água para. Quem estava alto já ganhou.
3. **Abrigo perfeito.** No tornado, dentro de casa = 96–100% — o tornado nunca destrói a casa.
4. **Golpes aleatórios e lentos.** Meteoros/raios/rochas caem em qualquer lugar com 1,4–2,1 s de
   aviso; o parado do terremoto sobrevive 38%.
5. **Sem escalada.** A intensidade não muda durante a rodada nem com a sequência de vitórias;
   o "Combo" é sequencial (um desastre depois do outro), nunca os dois juntos.
6. **O final (meteoro gigante) é só correr para a direita.**
7. Sem motivo para sair do lugar seguro (nada para pegar, ninguém para salvar).

## 2. Princípios (lições do gênero)

- **Todo lugar é ameaçado com o tempo**: o mais alto atrai raio, desaba, é corroído ou alagado na 3ª onda.
- **Segurança temporária**: plataformas soltas cedem se você fica em cima; casas perdem o teto; torres tombam.
- **Ondas/estágios com pausa**: tensão → alívio → tensão maior. A criança tem um momento para reagir.
- **Aviso claro e curto**: sirene + ícone grande + seta na borda + marcador no chão. Voz só com a
  narração ligada (Configurações; desligada por padrão). Tempo de aviso encolhe com a intensidade,
  nunca abaixo de ~0,8 s.
- **Mexer-se é obrigatório** e tem recompensa: moedas no meio do desastre, resgatar amigos.
- **Desastre duplo** em rodadas mais altas (os dois ao mesmo tempo, com cartão "Desastre duplo!").
- **Escala** por estrelas do cenário, pela sequência de vitórias e pelo modo (Fácil / Normal / Difícil).

## 3. Intensidade

`I = modo × (0,85 + 0,10·(★−1) + 0,035·min(12, sequência))`, modo = 0,72 / 1 / 1,3.
Durante a rodada há também o `calor` (0→1 ao longo do desastre) que acelera golpes.

- Aviso (telegraph): `tele = clamp(1,25 − 0,25·I, 0,75, 1,15)` multiplica todos os tempos de aviso.
- Fácil: avisos mais longos, menos golpes, fôlego maior; Difícil: o contrário.
- Modo escolhido na tela 2D/3D (lembrado); no grupo cada um joga no seu modo.

## 4. Mecânicas gerais novas

- **Nadar com fôlego** (água: tsunami, enchente, raios com chuva): cair na água não elimina mais;
  o Bloop boia e nada devagar, com uma barrinha de fôlego sobre a cabeça (~7 s no normal ★1).
  Correnteza e destroços tiram fôlego. Fora da água o fôlego volta. Lava, gosma e neve continuam
  eliminando ao encostar.
- **Plataformas que cedem**: plataformas soltas e copas de árvore tremem e caem se alguém fica em
  cima por ~2–4 s durante o desastre (e algumas caem sozinhas). Voltam na próxima rodada.
- **Buracos no chão** (terremoto e sumidouro): marcados com rachaduras piscando antes de abrir.
  Quem está no chão em cima cai. Corpos em cima afundam juntos.
- **Destroços voando**: corpo rápido (onda, tornado, tremor) que atinge o Bloop empurra; pesado
  e muito rápido elimina; nadando tira fôlego.
- **Fogo no chão**: meteoros e bombas de lava deixam fogo por alguns segundos.
- **Moedas no meio do desastre** (risco × recompensa): aparecem em lugares perigosos; ficam "na
  mão" e só valem inteiras se você sobreviver (perde metade se cair).
- **Resgate**: Bloop eliminado vira fantasma com uma **bolha de resgate** por ~10 s. Encoste na bolha
  de um bot para salvá-lo (+moedas "Ajudou!"). Online: um amigo vivo que fique perto do seu
  fantasma por ~1 s te traz de volta (uma vez por rodada); ele ganha o bônus de ajuda.
- **Pontos**: sobreviver (100 + 15/★), segundos aguentados, resgates (+40 cada), moedas pegas.
  O placar do grupo continua "rodadas sobrevividas" (pedido anterior) e também envia os pontos.

## 5. Desastre por desastre (2D; o 3D segue o mesmo espírito)

| desastre | ameaça nova | contra-jogada |
|---|---|---|
| **Tsunami** | 2–4 ondas (3 no normal ★1), cada uma mais alta (≈95 → 135 → 175 + crista); a água **fica** e sobe a cada onda; o mar recua antes de cada onda (aviso); destroços na frente da onda; casas tombam com a onda, torres cedem depois. | subir alto **e** trocar de lugar entre ondas; nadar até outro ponto alto com o fôlego; desviar dos destroços. |
| **Enchente** | sobe em 3 pulsos (pausa entre eles) até acima dos telhados de 1 andar; correnteza puxa quem nada; destroços boiando; chuva. | subir em etapas; usar a pausa para chegar ao próximo nível; nadar curto. |
| **Gosma verde** | sobe em pulsos; **gotas** de ácido caem (com marcador); o que fica mergulhado é corroído e tomba (torres incluídas). | trocar de torre antes que tombe; desviar das gotas. |
| **Vulcão** | lava escorre da direita (frente que avança) e sobe em pulsos; bombas miradas em jogadores deixam fogo; **cinzas** escurecem a tela aos poucos. | fugir da frente, subir, desviar das sombras das bombas. |
| **Terremoto** | 3 tremores (principal + 2 réplicas) com calmaria; cada tremor derruba parte das casas/torres; **rachaduras** abrem buracos no chão (aviso piscando); pedras miradas. | ficar no aberto mas **andar** para longe das rachaduras e das sombras. |
| **Tornado** | anda atrás dos jogadores, muda de direção; **arranca telhados** (a casa deixa de ser abrigo); destroços voando; sucção mais forte; 2º tornado em intensidade alta. | trocar de casa, manter distância, pular destroços. |
| **Chuva de meteoros** | mira onde você **vai estar**; aviso menor; deixa **fogo** e cratera; rajadas de 3 em linha no fim. | não parar de se mexer; mudar de direção. |
| **Raios** | 55% miram o jogador **mais alto**; a chuva alaga o chão (precisa nadar ou subir pouco). | ficar em lugar baixo mas seco; sair da coluna brilhante. |
| **Avalanche** | 2–3 avalanches da direita, cada uma mais alta, a neve fica; **bolas de neve** rolando no chão (aviso na borda). | subir entre ondas e pular as bolas. |
| **Meteoro gigante** (final) | percurso mais longo, bunker fecha mais cedo, meteoritos menores no caminho, plataformas que cedem. | correr sem parar, pular buracos. |
| **Sumidouro** (novo) | o chão afunda em círculos que crescem e se juntam; casas e torres em cima afundam. | ler as rachaduras e ir para o chão firme. |
| **Tempestade de areia** (novo) | rajadas alternando de lado (aviso: bandeira/seta); **destroços voando na horizontal** em alturas diferentes; visibilidade baixa. | abrigar-se em casa (que bloqueia) ou pular/abaixar dos destroços. |

## 6. Curva de dificuldade

- Rodada: cartão "Cenário N ★", depois o desastre. Primeiras 3 rodadas = **Treino** (seta verde, I×0,8).
- ★ do cenário (1–5) + sequência de vitórias sobem `I`.
- **Desastre duplo**: cenários "Combo" e, com sequência ≥ 4, chance crescente de um 2º desastre
  começar no meio do 1º (ao mesmo tempo). Cartão "Desastre duplo!".
- Metas (bot-médio ≈ criança média): **normal ★1 ≈ 50–65%**, ★4 ≈ 30–45%, sequência alta < 30%.
  Fácil ≈ +20 pontos; Difícil ≈ −20 pontos. Parado ≈ 0–10%. Ficar só no lugar mais alto ≤ 40%.

## 7. Aviso para crianças

- Sirene + cartão com ícone grande + contagem + seta na borda (já existia) e agora também para cada
  onda/tremor/rajada ("Onda 2!", "Tremor!", "Rajada!").
- Marcadores no chão (círculo vermelho, coluna amarela, rachadura piscando, sombra da bomba).
- Voz (`speak`, a mesma do Noites) **só com a narração ligada** (padrão desligado).
- 3D: seta na borda da tela para ameaças fora da vista (primeira pessoa).

## 8. Desempenho

- Tudo em arrays fixos (buracos ≤ 8, fogo ≤ 12, moedas ≤ 8, golpes 24); nada alocado por quadro.
- Partículas pelo `particleBudget` de `src/core/quality.ts`; cinzas: um gradiente por quadro
  (nível 0 usa cor chapada).

## 9. 3D

- Mesma intensidade/modo, tsunami com ondas que passam do morro e dos telhados, enchente em pulsos,
  nado com fôlego, tornado que arranca telhado, golpes mirados, sumidouro (crateras que viram buraco)
  e areia (rajadas + destroços).
- Câmera: **1ª pessoa por padrão**, botão no topo alterna 1ª → 3ª atrás → 3ª de frente (lembrado);
  o Bloop de papel só aparece em 3ª pessoa. Setas de ameaça fora da vista.
- Seu Bloop = seu avatar salvo (skin ou "Meu Bloop"). Bots nunca usam o "custom" de outra pessoa.

## 10. Resultado (depois)

Ver a seção "Medições" no fim deste arquivo (preenchida pelo banco após a implementação).
