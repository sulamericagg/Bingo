# Beta testers — Bloop World

Este guia explica **duas coisas que trabalham juntas**:

1. **Teste fechado no Google Play** (quem recebe as versões beta e como).
2. **Programa Beta dentro do app** (como os testadores mandam bugs e onde você lê).

---

## 1. Teste fechado no Google Play (closed testing)

### Por que é obrigatório

Contas de desenvolvedor **pessoais** criadas depois de 13/11/2023 só podem publicar na
produção depois de rodar um **teste fechado com pelo menos 12 testadores que ficaram
inscritos (opt-in) por 14 dias seguidos**. Sem isso o botão "Solicitar acesso à produção"
não libera. (Contas de organização/empresa não têm essa exigência, mas o teste fechado
continua sendo a melhor forma de pegar bugs.)

Dicas para não perder os 14 dias:

- Chame **15–20 pessoas**, não 12: alguém sempre sai ou esquece de aceitar.
- O que conta é a pessoa **continuar inscrita** (opt-in) 14 dias; peça que deixem o app
  instalado e abram de vez em quando.
- Na hora de pedir produção, o Google pergunta como foi o teste (quantas pessoas, que
  feedback recebeu, o que mudou). Os relatórios do painel **Beta / Bugs** (seção 2) são
  ótimos para responder isso.

### Passo a passo no Play Console

1. **Play Console → seu app → Testar e lançar → Teste → Teste fechado** → *Criar faixa*
   (ou use a faixa "Alpha" que já vem criada).
2. **Testadores**: escolha um dos dois jeitos:
   - **Lista de e-mails**: *Criar lista de e-mails* → cole os e-mails (contas Google) dos
     testadores, um por linha ou separados por vírgula. Bom para poucas pessoas.
   - **Grupo do Google** (recomendado): crie um grupo em <https://groups.google.com>
     (ex.: `bloop-world-beta@googlegroups.com`), deixe "Quem pode participar" = *Qualquer
     pessoa pode pedir* ou convide os e-mails, e informe o endereço do grupo na faixa.
     Quem entrar no grupo vira testador automaticamente — ótimo para escalar.
3. **Feedback**: em "Endereço de e-mail ou URL de feedback" coloque um e-mail seu
   (aparece para os testadores na página do Play).
4. **Criar versão**: *Criar nova versão* → envie o **.aab** gerado por
   `npm run android:release` (fica em `android/app/build/outputs/bundle/release/`) →
   escreva as notas da versão (o que testar) → *Revisar* → *Iniciar lançamento na faixa*.
   A primeira revisão do Google pode levar de algumas horas a alguns dias.
5. **Países/regiões**: confira se a faixa está liberada para o Brasil (e outros países dos
   testadores).
6. **Link de inscrição (opt-in)**: na faixa, aba *Testadores*, copie o **"Link para
   participar na Web"** (`https://play.google.com/apps/testing/<pacote>`). Mande esse link
   para os testadores. Cada um precisa:
   1. estar logado no celular com o **mesmo e-mail** que está na lista/grupo;
   2. abrir o link e tocar em **"Tornar-se testador"**;
   3. tocar em "fazer o download no Google Play" e instalar (pode levar alguns minutos
      até a versão aparecer).
7. **Atualizações**: cada nova versão enviada na mesma faixa chega como atualização normal
   para quem já é testador.

### Feedback privado do Play ("private feedback")

Testadores de faixa fechada **não** deixam avaliação pública; eles enviam **feedback
privado** pela página do app no Play Store ("Enviar feedback particular ao
desenvolvedor"). Para ler:

- **Play Console → Qualidade → Avaliações e notas → Feedback do teste** (ou *Testing
  feedback*): lista os comentários privados por versão. Dá para responder por lá.
- **Qualidade → Android vitals → Falhas e ANRs**: travamentos reais dos aparelhos dos
  testadores (com stack trace). Filtre pela versão da faixa fechada.
- **Relatório de pré-lançamento** (*Testar e lançar → Relatório de pré-lançamento*): o
  Google roda o app em vários aparelhos de teste automaticamente; olhe as capturas para
  achar telas cortadas (por exemplo pelo banner de anúncio).

### Modelo de mensagem para convidar testadores

> Oi! Estou lançando o **Bloop World**, um jogo para crianças. Você me ajuda testando por
> 2 semanas? 1) Me passe o e-mail da sua conta Google do celular. 2) Quando eu avisar,
> abra este link no celular e toque em "Tornar-se testador": <link>. 3) Instale pelo Play
> e jogue um pouquinho de vez em quando. 4) No jogo, vá em **Ajustes → Programa Beta** e
> ligue. Aparece um inseto 🐞 na tela: toque nele sempre que algo estranho acontecer.
> Obrigado!

---

## 2. Programa Beta dentro do app

### Para o testador

- **Ajustes → Programa Beta** (interruptor). Ao ligar:
  - aparece o selo **BETA** no perfil;
  - aparece um botãozinho flutuante com um **inseto** em todas as telas (pode ser
    arrastado para qualquer canto; a posição fica salva);
  - opcional: **"Sacudir para reportar"** abre o relatório ao chacoalhar o celular;
  - se acontecer um erro inesperado, aparece **"Algo deu errado — enviar relatório?"**.
- O relatório tem: **categoria** (Física, Jogo travou, Visual, Som, Loja, Outro),
  **descrição** e, se quiser, **foto da tela do jogo** (reduzida, até ~200 KB).
- Junto vai automaticamente: versão do app, plataforma, aparelho (user agent, memória,
  núcleos, tamanho da tela), tela/jogo atual, nível de qualidade gráfica, idioma e os
  **últimos 30 erros** do console. Nada de nome real, e-mail ou localização.
- **Sem internet?** O relatório fica numa fila no aparelho (até 10) e é enviado sozinho
  quando a conexão volta.

### Para você (admin)

- Os relatórios chegam em `POST /api/feedback` no Worker (`server/feedback.ts`) e ficam
  no KV por **120 dias** (`fb:<data>:<id>`; a foto em `fbshot:...`).
- Proteções: limite de **10 relatórios por hora** por jogador (ou IP), corpo de no máximo
  ~320 KB, foto só JPEG/PNG/WebP em data URL até ~220 KB, texto até 1000 letras
  **moderado** (palavrões viram `###`; telefone, e-mail, links e @perfis viram
  `[removido]`), campos de contexto limpos e cortados.
- **Painel admin → 🐞 Beta / Bugs**:
  - filtrar por **Abertos / Resolvidos / Todos** e por **categoria**;
  - **Abrir** mostra o relato, a foto, aparelho, tela, versão e os últimos erros;
  - **✓ Resolver / Reabrir**, com nota interna (ex.: "corrigido na 1.1.2");
  - **⬇ Baixar JSON** (um relatório ou todos — o export completo não inclui as fotos);
  - **Apagar**.
- API (todas pedem o token do admin):
  `GET /api/admin/feedback?status=open|resolved|all&cat=physics|crash|visual|sound|shop|other`,
  `GET /api/admin/feedback/item?key=`, `GET /api/admin/feedback/export`,
  `POST /api/admin/feedback/resolve {key, resolved, note}`,
  `POST /api/admin/feedback/delete {key}`.

### Fluxo sugerido toda semana

1. Abra **Beta / Bugs → Abertos**, ordene mentalmente por categoria (Jogo travou primeiro).
2. Cruze com **Android vitals** (falhas/ANRs) e com o **feedback privado** do Play.
3. Corrija, suba uma nova versão na faixa fechada, marque os relatórios como **resolvidos**
   com a versão na nota.
4. Antes de pedir produção, baixe o JSON — serve de "prova" do teste para o Google.

### Testar localmente

- `npm run dev` e abra `http://localhost:5173/?nointro&fakebanner=60` → Ajustes → Programa
  Beta → toque no inseto. Sem servidor rodando, o relatório fica na fila (localStorage
  `bw-feedback-queue`).
- Com o Worker local: `npm run worker:dev` (o app servido pelo Worker usa a mesma origem)
  e o painel em `/admin`.
- `npm run test:server` cobre o envio, moderação, limites e as rotas do admin.
