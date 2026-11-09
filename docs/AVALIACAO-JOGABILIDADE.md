# Avaliação de jogabilidade — Bloop World (nov/2026)

Feita pelo "chefe da jogabilidade". Os jogos foram jogados de verdade com Playwright, por dois bots:

- **Expert**: mira e decide quase perfeito.
- **Criança**: hesita ao acaso, toca cedo ou tarde, mira grosseira, às vezes "esquece" de fazer a coisa certa.

Sobreviva aos Desastres rodou os 100 cenários × 2 perfis simulados a 30 Hz. Os outros jogos rodaram em tempo real, de 70 a 90 s por perfil. As evidências (JSON e capturas) estão na pasta de rascunho `agent-feel/`.

> Aviso honesto: bot não é criança. Os números servem para **comparar antes e depois** e para achar o que é injusto. Eles não preveem a retenção real. Para isso, falta teste com 5 a 10 crianças de verdade, de 6 a 10 anos (ver recomendações).

## Notas por jogo (0–10)

| Jogo | Diversão | Clareza | Resposta ao toque | Apelo infantil | Ganchos de retorno |
|---|---|---|---|---|---|
| Bloop Orbit | 8 | 8 | 9 | 8 | 8 → 9 |
| Queda Giratória (Tubo) | 7 → 8 | 8 | 9 | 8 | 5 → 7 |
| Rally Lunar | 8 → 9 | 6 → 8 | 9 | 9 | 7 → 8 |
| Fábrica Estelar (Tycoon) | 6 | 6 | 8 | 7 | 7 |
| Sobreviva aos Desastres | 7 → 8 | 5 → 8 | 7 → 8 | 9 | 6 → 7 |
| Casa do Bloop (pet) | 7 | 7 | 8 | 9 | 8 |

### Bloop Orbit — o carro-chefe e o mais redondo
- **Bom**: um toque, regra clara e áudio de combo que sobe de tom. O começo já está indulgente: o bot criança morreu a primeira vez aos 37 s, com média de 26 s por corrida. O expert passou dos 80 s sem morrer.
- **Ruim**: a diferença entre criança (51 moedas/min) e expert (160/min) é grande. Isso é aceitável, porque recompensa a habilidade, mas o Orbit vira a "fazenda" de quem joga bem.
- **As crianças vão gostar?** Sim. É o jogo mais fácil de entender em 5 segundos.

### Queda Giratória (Tubo)
- **Bom**: o toque é em `pointerdown` e tem buffer ("toque pouco antes de pousar vale"). Tem dica com mãozinha na primeira tela e combo com fogo.
- **Ruim**: **nenhum dos dois bots morreu em 70 s**. Em 70 s a criança passou ~20 anéis. Isso é indulgente demais e lento, e não há tensão nos primeiros minutos. Além disso, era o jogo mais "pão-duro": ~10–14 moedas/min.
- **O que mudei**: cada moeda agora vale 3 e cada anel novo paga 1. Ficou em 50–73 moedas/min.
- **As crianças vão gostar?** No começo, sim. O risco é enjoarem rápido, por falta de desafio e de meta.

### Rally Lunar
- **Bom**: física divertida, cambalhotas e "tanque cheio!". O ritmo de moedas (61–105/min) já estava na média.
- **Ruim (antes)**: **não havia nenhuma explicação** de que a metade esquerda freia e a direita acelera. Os pedais desenhados ajudam, mas uma criança não sabe que precisa **segurar**. Também **não havia som de motor**. Medido: a criança capota em 83% das corridas, com média de 25 s.
- **O que mudei**:
  - ronco de motor sintetizado que segue o acelerador e a velocidade. Respeita a opção "Som" e para na pausa e no fim;
  - nas 3 primeiras corridas aparecem "Segure: frear / Segure: acelerar" com mãozinha pulsando. Somem ao acelerar;
  - o total de moedas conta de 0 até o valor, com "tic" que sobe de tom;
  - fanfarra de recorde;
  - alvo de toque maior nos botões de melhoria.
- **As crianças vão gostar?** Muito: carro, capotar e moedas. O tanto que capotam pode frustrar. Ver recomendação 3.

### Fábrica Estelar (Tycoon)
- **Bom**: o modo ocioso dá um motivo para voltar ("sua fábrica produziu enquanto você estava fora").
- **Ruim**: a partida de 4,5 min é longa para criança, e o prêmio era baixo (50–210 moedas, ~11–47/min). **Não instrumentei** o ritmo das compras a fundo, por falta de tempo.
- **O que mudei**: prêmio por colocação de 150/100/70/50 para 300/220/160/120, e bônus turbo de 60 para 80 (~27–85/min).
- **As crianças vão gostar?** As mais velhas, de 9 anos para cima, sim. As pequenas podem se perder na árvore de compras.

### Sobreviva aos Desastres — o que mais precisou de conserto
Medido antes:
- sobrevivência de 20–23% (expert) e 13–17% (criança);
- **tornado: 0% para todo mundo**: era impossível de verdade;
- vulcão: 0–18%;
- final do bunker: 60–80% (fácil demais);
- 40% das mortes vinham de "algo caiu em você", sem nenhum aviso;
- só 13–15 moedas/min.

Problemas de justiça encontrados:
1. O tornado **puxava quem estava dentro de casa** para fora. Uma criança parada era arrastada até a morte. Além disso, o tornado derrubava as próprias casas, que a dica manda usar.
2. No preparo, a dica era sempre "Suba em algum lugar!", **errada para o tornado** (a resposta certa é entrar em casa) e para terremoto e raios (a resposta certa é ficar no aberto).
3. Lava e água parada matavam no instante em que surgiam no chão, logo após o alerta de 2,6 s.
4. Qualquer caixinha caindo nocauteava.
5. Não havia buffer de pulo: só coyote time.

O que mudei:
- **sirene sintetizada** no alerta e no início do final do meteoro;
- dica do preparo **específica do desastre** ("Entre numa casa!", "Fique no aberto!", "Suba em algum lugar!") e a dica do desastre já aparece no preparo;
- buffer de pulo de 0,13 s;
- objetos leves dão um "tum" e empurram. Só peças pesadas e rápidas nocauteiam;
- tornado: dentro de uma casa você está seguro mesmo que ela tenha levado um tranco. O tornado não puxa nem esmaga quem está dentro, não derruba paredes e tem núcleo letal menor e mais lento;
- vulcão: lava mais baixa e mais lenta, e bombas mais espaçadas, com marcador visível por mais tempo;
- cenários duplos ~20% mais brandos;
- tsunami e avalanche um pouco mais baixos;
- lava ou água rasa (< 12) só "molha o pé", o que dá tempo de subir;
- final do bunker: preparo de 18+dificuldade s para 14+0,8×dificuldade s. Agora é preciso correr;
- "Novo recorde!" com fanfarra;
- etiquetas de nome não se sobrepõem;
- na vitrine, o Bloop não flutua mais: a casa dele é a firme;
- o HUD conta o tempo real (antes, a 30 fps, os cartões duravam o dobro);
- economia: quem sobrevive ganha 70 + 15×dificuldade + sequência, e quem perde ganha 8 + 0,6 por segundo que aguentou (antes ganhava 3).

Medido depois:
- sobrevivência de 33–36% (expert) e 22–31% (criança);
- tornado: 14–29%;
- final: 70% (expert) e 30–40% (criança);
- mortes "sem aviso": de 40% para 30%;
- ~51 moedas/min.

**As crianças vão gostar?** O tema é o mais "Roblox" do hub e tem enorme apelo. Morrer em 2 de cada 3 rodadas ainda é muito para uma criança de 6 anos. O fantasminha amortece a frustração, mas a IA dos bots é fraca (eles saem de casa, sobem no lugar errado) e isso esconde quão difícil o jogo é para um humano.

## Economia: moedas por minuto de jogo

Critério: kid = bot criança, exp = bot expert.

| Jogo | Antes (kid / exp) | Depois (kid / exp) |
|---|---|---|
| Orbit | 51 / 160 | sem mudança |
| Tubo | 10 / 14 | 50 / 73 |
| Rally | 61 / 105 | sem mudança |
| Desastres | 13 / 14 | 51 / 52 |
| Tycoon (partida) | ~11–47 | ~27–85 (estimado, não medido) |

Para jogadores médios ("criança"), todos os jogos ficaram entre ~50 e 61 moedas/min, dentro de ±25%. O expert do Orbit continua acima, e isso é intencional: é habilidade.

### Pacotes de gemas (ids mantidos)
Gemas por real dos pacotes normais: de 20/R$ a 30/R$.

| Pacote | Antes | Depois | Valor |
|---|---|---|---|
| `flash_gems` (R$ 9,90/dia) | 650 gemas (66/R$, 3x o pacote do mesmo preço: absurdo) | **350 gemas** + bônus do dia | 35/R$, melhor que o maior pacote (30/R$) |
| `vip_pack` (R$ 39,90) | 1.000 gemas + sem anúncios + dobrador + skin | **600 gemas** + o resto | ~1,65x |
| `mega_bundle` (R$ 59,90) | 2.500 gemas + 25.000 moedas + 10 de cada turbo | **2.000 + 10.000 + 5** | ~1,45x |

`docs/STORE.md` foi atualizado com os novos valores.

## Toque e resposta (auditoria)
- **Jogabilidade**: todo jogo age em `pointerdown` e usa `touch-action: none`: Tubo, Rally, Desastres, Tycoon e o arrastar comida do pet. Os menus usam `click` com `touch-action: manipulation` no body. Com a viewport `width=device-width` não existe o atraso de 300 ms.
- **Alvos menores que 44 px encontrados**:
  - hub: engrenagem de 38 px, pílula de gemas de 32 px, botões do card de 36 px e pontinhos de 9 px;
  - pet: botões de preço de 21 px;
  - Rally: melhorias de 28 px.

  Todos ganharam uma área de toque invisível (`::before`), sem mudar o visual.
- **Carrossel do hub**: de 0,55 s para 0,3 s.
- **Vibração**: os jogos já usam leve, média e forte. Vibração forte no nocaute e no alerta, média no "tum" dos Desastres.
- **Novos sons** em `core/audio.ts`: `siren`, `tick`, `nearMiss`, `record`, `fail` e o motor `engineStart/Set/Stop`. `nearMiss` e `fail` ficaram prontos, mas ainda não estão ligados nos jogos.

## Riscos que continuam
1. **Desastres ainda é difícil** para 6–8 anos: ~1 sobrevivência a cada 3–4 rodadas. A IA dos bots é fraca e confunde a leitura.
2. **Tubo sem tensão**: ninguém morre nos primeiros minutos. É indulgência demais e falta meta de curto prazo.
3. **Rally**: a criança capota em 83% das corridas (média de 25 s). O tutorial de pedais ajuda a entender, mas não ensina a "endireitar no ar".
4. **Tycoon**: não instrumentado. A partida de 4,5 min pode ser longa demais para os menores.
5. Os sons `nearMiss` e `fail` ainda não foram ligados aos jogos.

## As 5 principais recomendações
1. **Teste com crianças de verdade** (5–10 crianças, 15 min cada, gravando a tela): ver onde travam, o que não entendem e quando largam. Nenhum bot substitui isso.
2. **Desastres**: um "modo treino" nos 3 primeiros cenários (dificuldade 0, mais tempo de preparo e uma seta apontando o lugar seguro). Melhorar a IA dos bots para ficarem em casa no tornado e subirem certo nos fluidos.
3. **Rally**: uma ajuda automática de equilíbrio nas 3 primeiras corridas (o carro tende a pousar de rodas). Também uma dica de "solte o acelerador no ar" quando o carro inclinar demais.
4. **Tubo**: começar a apertar mais cedo (anéis vermelhos a partir de ~10 anéis), com uma meta de curto prazo por partida ("chegue ao anel 30") e recompensa visível.
5. **Ganchos de retorno comuns a todos os jogos**: uma missão diária por jogo, recorde pessoal sempre visível no card do hub e celebração de "Novo recorde!" padronizada. A fanfarra `audio.record()` já existe.


---

## Segunda rodada (versão final): recomendações 2–5 implementadas

### 2. Desastres: Treino + bots mais espertos
**Treino**: as 3 primeiras rodadas que o jogador vê. Elas trazem:
- +8 s de preparo;
- fluidos 20% mais baixos e mais lentos;
- ondas 25% mais lentas;
- golpes 35% mais espaçados e tornado 25% mais lento;
- seta verde pulando sobre o lugar seguro, presa na borda quando o lugar está fora da tela;
- "Treino ·" no título e dicas de incentivo ("Siga a seta verde…", "Tudo bem, é treino!").

**Bots**:
- no tornado, procuram uma casa pela área (não pela checagem rígida de abrigo) e ficam lá dentro;
- no terremoto, nos meteoros e nos raios, escolhem um ponto aberto de verdade (nada em cima) e longe das sombras marcadas;
- nos fluidos, preferem superfícies acima do nível final esperado.

| Medida (bots) | Antes | Depois |
|---|---|---|
| Cenários 1–13 sem treino (expert / criança) | 33% / 29% | — |
| Cenários 1–13 com treino (expert / criança) | — | **79% / 42%** |
| Sobrevivência geral, sem treino (expert / criança) | 33% / 31% | 32% / 29% |
| Bots no tornado | 6% | 19% |
| Moedas/min | ~51 | ~51 |

Nos fluidos e nos golpes, os bots oscilam dentro do ruído; a IA continua sendo o ponto fraco.

### 3. Rally: "rodinhas"
- **Nas primeiras corridas**: o carro tende a se endireitar sozinho no ar e em empinadas fortes. A ajuda vale 0,85 nas 3 primeiras corridas e some até a 5ª.
- **Melhoria permanente "Anti-capotar"** (`gyro`, por veículo): até +0,35 de ajuda, a 0,7x o preço das outras melhorias.

Bot criança antes e depois da ajuda:

| Medida | Antes | Depois |
|---|---|---|
| Corridas que terminam capotando | **100%** | **0%** |
| Duração média da corrida | 17 s | 62 s |
| Distância média | 148 m | 401 m |

O expert não piorou: 618 m → 883 m.

### 4. Tubo: tensão e metas curtas
- **Curva mais cedo**: vermelho a partir do anel 4, rotação sobe mais rápido e os segmentos vermelhos ficam mais largos.
- **Pressão pelo tempo**: +1 anel "equivalente" de dificuldade a cada ~9 s, com teto de 30.
- **Metas por partida** no HUD: "Anel N" (um pouco acima do seu melhor anel) e "Combo xN". Cada uma vale +15 moedas, com aviso, som e vibração.

Bot criança, com reação de 120–380 ms e toques impacientes:

| Medida | Antes | Depois |
|---|---|---|
| Mortes | ninguém morria em 70–150 s | partidas de ~36–60 s |
| Primeira partida | — | 43–100 s |
| Moedas/min | — | 46–59 |

Faixa alvo: 60–120 s. Ficou um pouco abaixo para o bot "impaciente".

### 5. Ganchos de retorno comuns
- **Recorde no card do hub** (`src/hub/bests.ts`): Orbit e Tubo em pontos, Rally em metros, Desastres pela melhor sequência e Fábrica pelas vitórias. Atualiza ao voltar de um jogo.
- **Comemoração padrão** (`src/ui/record.ts`, `celebrateRecord()`): faixa dourada, confete, fanfarra e vibração, sem bloquear o toque. Usada pelos 5 jogos.
- **Missão diária de cada jogo**:
  - tipos novos: `tubo_rings`, `rally_dist`, `dz_survive` e `ty_play`, que escutam o `run-end`;
  - as 3 missões do dia vêm de 3 jogos diferentes, uma fácil, uma média e uma difícil.

### Riscos que continuam
- A IA dos bots dos Desastres ainda é fraca nos fluidos e nos cenários duplos, que seguem perto de 0%.
- O Tubo pode ter ficado um pouco curto para crianças muito impacientes. Vale testar com crianças.
- A Fábrica continua sem instrumentação.
