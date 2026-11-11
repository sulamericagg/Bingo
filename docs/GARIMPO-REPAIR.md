# Garimpo Bruto — Consertos (quebras raras + minijogos de oficina)

Código em `src/games/garimpo/repair/`. Tudo em canvas 2D (2,5D) por cima do jogo, sem texto na
tela: ícones, voz curta (`speak`), mão-dica animada e gestos (girar, arrastar, bombear, tocar).

## API (para eventos, RP, estrada)

A instância fica em `g.repairs` (`Garimpo.repairs`, criada junto com a água; `null` fora da partida).

```ts
type BreakKind = 'tyre' | 'brake' | 'electric' | 'part' | 'bushing';

g.repairs.breakdown(machine, kind)          // quebra a máquina (anfitrião decide; no convidado vira pedido)
g.repairs.open(kind, target, onDone?, { free? }) // abre o minijogo agora
    // target: Machine do garimpo, Rig da estrada (haul/rig.ts) ou null (só jogar)
    // onDone(ok): ok=true terminou; false = fechou no X
    // free: não exige peça (o evento já cobrou / usou o kit)
g.repairs.brakeFailure(target)              // emergência do freio DIRIGINDO (Machine dirigida aqui ou Rig)
g.repairs.fix(machine)                      // conserta sem minijogo
g.repairs.broken(machine)                   // BreakKind | null
g.repairs.wear(machine)                     // desgaste 0..100
```

### Pelo adaptador do RP (já ligado)

`rp/breakdown.ts` → `setBreakdownHook` é registrado pelo construtor de `Repairs`. Eventos chamam
`triggerBreakdown(kind, target, done)` com `kind` do RP: `'tire' | 'brakes' | 'electric' | 'part' | 'bushing'`
(viram `tyre`/`brake`/…). Comportamento:

- `brakes` com o alvo andando (> 4 m/s) → emergência dirigindo (`brakeFailure`); parado → minijogo do freio.
- Machine: marca a quebra (se o tipo não existe na máquina, ex. pneu em esteira, vira `part`) e abre o
  minijogo com `free: true` (o cartão do evento já cobrou/gastou o kit).
- Rig (estrada): abre o minijogo com a arte de caminhão vermelho; `done(ok)` volta para o RP.
- Devolve `true` (assumiu). Sem o módulo de consertos, o evento mantém o efeito simples.

## Minijogos (repair/games/*)

| tipo | passos (ícones na barra) | dificuldade |
|---|---|---|
| `tyre` | macaco (bombear alavanca) → porcas (girar o dedo; pulam para a bandeja) → puxar a roda → rolar o estepe até o cubo (encaixa sozinho) → porcas de volta (toque + girar; ⭐ se for em estrela) → abrir a válvula | caminhão/carreta: roda maior, 8 porcas, rodado duplo |
| `electric` | abrir a portinhola → ligar fios moles (cor + símbolo; errado = faísca) → fechar → ligar a chave | 3/4/5/6 fios; embaralhado a partir do normal |
| `part` | 4 parafusos (girar) → tirar a tampa → peça quebrada para a sucata → girar a peça nova (botão) até bater com o molde e encaixar → tampa → parafusos (toque, parafusadeira) → testar | peça: mangueira (escavadeira), pino da esteira (trator), alternador (pickup), parafuso do rotor (helicóptero), cilindro da caçamba (caminhão); difícil começa a 90° |
| `bushing` | puxar 4 buchas velhas → prensa (bombear) → parafusos → empurrar o carro e soltar | 2 ou 3 bombadas por bucha |
| `brake` | mangueiras do freio (cor/símbolo) → sangrar (bombear o pedal até as bolhas sumirem) → completar o fluido até o MAX (segurar o frasco) → pisar no freio | 2–4 mangueiras, 3–6 bolhas |

Ao terminar: festa (confete, selo ✓, estrelas de bônus), +R$ 40 (+60 por ⭐).

## Frequência, desgaste e peças (`repair/model.ts`)

- Desgaste por máquina (0..100): distância × carga, pancada (giro do chassi), lama. Revisão zera.
- Quebras só com alguém (humano) dirigindo e andando, nunca nos primeiros 10 min nem antes do 1º ouro;
  pausa mínima entre quebras (fácil 25 min, normal ~17, difícil ~12, muito difícil 7).
- Taxa por hora dirigindo cresce com desgaste²: fácil 0,5→1; normal 0,9→2,2; difícil 1,2→3,5; muito difícil 1→7.
- Fácil/normal: peça grátis. Difícil/muito difícil: precisa da peça (loja → Oficina: pneu estepe, kit de buchas,
  peça hidráulica, chicote elétrico, pastilha de freio). Sem peça: **comprar e consertar**, **mecânico**
  (taxa + espera de 25 s, sem minijogo) ou **guincho** (taxa, leva para a garagem e conserta).
- Loja → "Revisão na garagem": preço pelo desgaste, zera o desgaste e conserta tudo.

Efeitos enquanto quebrada (no controle, antes de `m.update`): pneu → puxa para o lado e anda devagar (roda
achatada no 3D); elétrica → não acelera / helicóptero não sobe; peça → escavadeira não levanta o braço nem
cava, trator anda 25%, helicóptero não sobe, caçamba do caminhão não levanta, pickup fraca; buchas → chacoalha;
freio (depois da emergência) → não anda até consertar.

## Freio que falha (`repair/brake.ts`, `repair/highway.ts`)

Muito raro: caminhão (pickup bem menos) carregado, descendo, rápido. Na estrada: uma chance por rampa
de escape, ~300 m antes dela (`Road.ramps`).

- O pedal e o freio de mão não seguram. Luz + alarme + borda vermelha + voz.
- Simples (ou AUTO): botão grande **reduzir marcha** (número da marcha); difícil com câmbio manual: o câmbio H do
  painel vale. Botão **freio-motor/escape** em todos. Desaceleração: marcha 1..6 = 2,7/2,0/1,45/1,0/0,65/0,4 m/s²,
  escape +1,4, cascalho +6,5.
- Seta + distância até a rampa. Garimpo (sem estrada): aparece um leito de cascalho à frente (placa, balizas,
  pneus). Estrada: rampa de verdade nos `Road.ramps` — faixa de cascalho que sobe ao lado da pista
  (`Road.rampAt`/`ground`), placa 260 m antes e na entrada, balizas, pneus e areia no fim.
- Parou → minijogo do freio (na estrada sem peça; no garimpo difícil pede a pastilha).

## Rede

O anfitrião decide quebras e guarda desgaste/peças. Retrato `rr` (só quando muda, ou a cada 2 s):
`[k|roda<<3 por máquina..., peças×5]`. O convidado joga o minijogo no aparelho dele e manda a ação
`{t:'a', k:'repair', m, how?}` (how = `mech`/`tow`); compra peças pela ação `buy` normal (`r.<peça>`, `r.rev`).
Emergência de freio: só para quem dirige no aparelho do anfitrião (e na estrada, que é solo).

## Ganchos em arquivos existentes (procure `CONSERTOS`)

- `game.ts`: import; campo `repairs`; construtor (`new Repairs` depois da água); `ctl()` em volta do
  controle de cada máquina antes de `m.update`; `repairs.step` depois do `sync` (anfitrião);
  `repairs.stepGuest` depois de `mp.frame`; loja (`shopHtml`, `isItem`/`buy`); `persist` (`s.repair`); `teardown`.
- `save.ts`: campo `repair?: RepairSave`.
- `mp.ts`: `netReset` no join, ação `repair`, retrato `rr` (envio/recebimento).
- `haul/road.ts`: constantes da rampa, `rampAt()` e 2 linhas em `ground()`.
- `haul/level.ts`: import; cor de cascalho no chão; sem árvores na rampa; `hwRepair.chunk` no fim de `build`;
  `hwRepair.input` no fim de `stepInput`; `hwRepair.post` a cada subpasso do `rig.step`.

## Testes (Playwright, toque emulado)

```bash
npx vite --config <sua config> --port 4481
PORT=4481 NODE_PATH=$(npm root -g) node scripts/dev/garimpo-repair-shots.mjs shots-repair all   # cada minijogo do início ao fim
PORT=4481 NODE_PATH=$(npm root -g) node scripts/dev/garimpo-repair-ingame.mjs shots-repair all  # HUD, escolha, loja, freio, estrada
```
Página de desenvolvimento: `scripts/dev/garimpo-repair.html?g=tyre|electric|part|bushing|brake&heavy=1&lvl=0..3&art=hose|pin|alt|rotor|cyl`.
No jogo com `?debug`: `__garimpo.repairs.debug.grace()/brk(kind)/open(kind)/brake()`.
