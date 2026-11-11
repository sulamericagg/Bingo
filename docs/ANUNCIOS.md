# Anúncios no Bloop World

Todos os jogos do hub têm anúncios **sem que cada jogo precise programar nada**. As regras ficam
num lugar só e valem para o Orbit e para os minigames juntos.

| Arquivo | O que faz |
|---|---|
| `src/config.ts` | IDs do AdMob (`ADMOB_REAL`), `ADS_TEST_MODE`, limites (`AD_BREAKS`, `AD_REWARDED`, `AD_STATS`) |
| `src/services/adpolicy.ts` | decide "pode agora?", tetos diários, estatísticas, log de depuração |
| `src/services/ads.ts` | AdMob/AdSense: `maybeInterstitial`, `showRewarded`, gerenciador do banner |
| `src/services/adbreaks.ts` | pausas automáticas (run-end / saída do jogo), "Dobrar recompensa", `offerRewarded` |

## 1. O que o dono precisa criar no AdMob (e onde colar)

Enquanto `ADS_TEST_MODE = true` o app só mostra anúncios **de teste** do Google (não gera receita).

1. Em <https://admob.google.com> → **Apps → Adicionar app** → Android → Bloop World
   (pacote `com.sulamericagg.blooporbit`). Copie o **ID do app** (`ca-app-pub-XXXXXXXXXXXXXXXX~NNNNNNNNNN`, com **til**).
2. No app criado, **Blocos de anúncios → Adicionar** e crie 3 blocos:

   | Bloco | Formato no AdMob | Onde aparece |
   |---|---|---|
   | `Bloop Banner` | **Banner** (adaptativo) | rodapé do hub, menus e telas de resultado (nunca jogando) |
   | `Bloop Intersticial` | **Intersticial** | pausas entre partidas e ao voltar para o hub |
   | `Bloop Premiado` | **Premiado** | Dobrar recompensa, +1 vida, dicas, tempo sem anúncios |

   Cada bloco tem um ID com **barra** (`ca-app-pub-XXXXXXXXXXXXXXXX/NNNNNNNNNN`).
3. Cole os IDs:
   - **`src/config.ts` → `ADMOB_REAL`**: `appId`, `banner`, `interstitial`, `rewarded`.
   - **`android/app/src/main/AndroidManifest.xml`** → `meta-data` `com.google.android.gms.ads.APPLICATION_ID`:
     troque o valor de teste `ca-app-pub-3940256099942544~3347511713` pelo **ID do app** (o mesmo `appId`).
4. Em `src/config.ts` troque `ADS_TEST_MODE = true` para **`false`** e gere o build.
5. Nunca clique nos seus próprios anúncios reais. Para testar no celular depois disso, cadastre o
   aparelho em AdMob → Configurações → **Dispositivos de teste**.

Campo vazio em `ADMOB_REAL` = o app continua usando o ID de teste daquele formato.
(Opcional, versão web: `WEB_ADS.adsenseClient` com o `ca-pub-...` do AdSense/H5 Games Ads.)

## 2. Intersticial — quando aparece

Pausas naturais, para **todos** os jogos do hub:

- **Depois do `reportRun()`** (evento `run-end`): espera ~1,3 s (a tela de resultado aparecer) e só mostra se
  o jogo não está numa partida (`inMatch() !== true`), o jogador não voltou a tocar no jogo e o "Sair do jogo?" está fechado.
  Jogos em `AD_BREAKS.exitOnlyGames` (rodadas emendadas/online, ex.: `disaster`) só têm a pausa da saída.
- **Ao sair do jogo para o hub**, se jogou pelo menos `exitMinPlaySec` ou terminou uma partida.
- O **Orbit** continua com as pausas dele (Jogar de novo / Menu), agora com os mesmos limites globais.

Limites globais (`AD_BREAKS`): intervalo mínimo de **120 s**, máx. **6/hora** e **8/sessão**, nada nos
primeiros **2 min** da sessão, nada nos primeiros **10 min** de um jogador novo, nada durante o
onboarding, nas **2 primeiras partidas de cada jogo** (tutorial) e de todo jogador, **15 min** depois de uma
compra e **90 s** depois de um vídeo premiado, e pelo menos **2 partidas** entre um e outro.
Isenções (não aparece intersticial nem banner): Sem Anúncios comprado, Clube Bloop, passe premium da
temporada, tempo sem anúncios ganho com vídeos.

## 3. Vídeos premiados

**Dobrar recompensa (automático):** depois do `run-end` de um jogo que reportou moedas, se *não* houve
intersticial nessa pausa, aparece no topo um cartão discreto "Dobrar recompensa +N moedas" por 9 s
(N = moedas da partida, entre 15 e 400). Teto: `AD_REWARDED.dailyCaps.double` (6/dia).
Jogos que já têm o próprio botão de dobrar no resultado ficam fora (`AD_REWARDED.ownDoubleGames`:
orbit, tubo, rally, cozinha, band, disaster, floresta, tycoon). Se o seu jogo ganhar um botão próprio, adicione o id lá.

**API para os jogos** (`src/services/adbreaks.ts`):

```ts
import { canOfferRewarded, offerRewarded } from '../../services/adbreaks';

// mostrar o botão só se ainda houver vídeo hoje
btnVida.hidden = !canOfferRewarded('life');
btnVida.onclick = () => offerRewarded('life', () => this.revive());     // +1 vida
btnCont.onclick = () => offerRewarded('continue', () => this.resume()); // continuar de onde parou
btnDica.onclick = () => offerRewarded('hint', () => this.giveHints(2));
```

- `onReward` só roda se o vídeo foi assistido até o fim; a promessa resolve `true` nesse caso.
- Sem vídeo / teto atingido: mostra um aviso curto (passe `{ quiet: true }` para não mostrar).
- Tetos diários por tipo em `AD_REWARDED.dailyCaps` (`life` 8, `continue` 8, `hint` 10, outros 10).
- Pause o seu jogo antes de chamar (o áudio já é pausado pelo serviço de anúncios).
- `showRewarded(kind)` continua existindo para quem já usa; `kind` só entra nas estatísticas.

## 4. Banner

- Hub e telas do Orbit: como antes (menu e resultado).
- Minigames: **só fora da partida** — menu/lobby/garagem (quando o jogo informa `inMatch() === false`) e a
  tela de resultado (depois do `run-end`, até o próximo toque). Jogos sem `inMatch()` só têm banner no resultado.
  **Implemente `inMatch()` no handle** para ganhar banner no menu do seu jogo.
- Nunca em cena 3D (canvas three.js visível/paisagem), com "Sair do jogo?", onboarding ou anúncio aberto.
- Altura real → `--ad-bottom`; `--safe-bot` já inclui o banner. No game host, `.gh-root` encolhe
  (`bottom: var(--ad-bottom)`), então os botões do jogo nunca ficam embaixo do banner.

## 5. Estatísticas

Contadores locais por dia e por jogo em `localStorage['bw-ads']` (`interstitial`, `banner`, `rewarded`,
`rw_<tipo>`, `rewarded_skip`, `offer_double`, `double_coins`). Leitura: `adStats()` de `src/services/ads.ts`.
Envio ao servidor: ainda não existe endpoint; quando existir, ponha o caminho em `AD_STATS.endpoint`
(ex.: `'/ads/stats'`) e o app faz `POST { id, days: { 'AAAA-MM-DD': { jogo: { contador: n } } } }`
uma vez por dia completo (para o painel admin).

## 6. Ajuste remoto (sem novo build)

`GET /api/challenges` devolve também `ads` quando a chave KV **`cfg:ads`** (namespace `DATA`) existe:

```bash
npx wrangler kv key put --binding=DATA cfg:ads '{"minGapSec":150,"maxPerHour":5,"rewardedDailyCaps":{"double":8}}'
```

Campos aceitos (sempre limitados a faixas seguras): `minGapSec`, `afterRewardedSec`, `sessionWarmupSec`,
`newPlayerGraceMin`, `maxPerSession`, `maxPerHour`, `runsBetween`, `freeRunsPerGame`, `freeRunsTotal`,
`afterPurchaseMin`, `exitMinPlaySec`, `exitOnlyGames`, `rewardedDailyCaps`, `doubleMinCoins`,
`doubleMaxCoins`, `enabled:false` (desliga intersticiais).

## 7. Testar no navegador

`/?debug&fakebanner=60` → no canto da tela aparece cada decisão ("INTERSTICIAL dispara (rally, run-end)",
"intersticial bloqueado: intervalo (43s)", "oferta Dobrar"...), banner falso amarelo e anúncio de teste em
tela cheia (rótulo INTERSTICIAL/PREMIADO). Acrescente `&adsfast` para encurtar os tempos
(intervalo 25 s, sem aquecimento). `window.__ads` mostra o estado/estatísticas.
