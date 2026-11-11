# Bloop World no iPhone

O Bloop World agora tem um **app nativo de iPhone** de verdade, um arquivo `.ipa`. Não é um site
nem um atalho na tela inicial. Como não temos um Mac, o app é montado num **Mac na nuvem do GitHub**
(GitHub Actions, arquivo `.github/workflows/ios.yml`). Você não precisa de Mac.

A cada atualização do jogo, o GitHub monta sozinho:

| O que sai | Para que serve |
|---|---|
| `bloop-world-ios-simulator` | Teste automático de que o app compila. Você não usa este. |
| `bloop-world-ios-unsigned-ipa` | App **sem assinatura**, para instalar de graça com o Sideloadly ou o AltStore (Caminho 2). |
| `bloop-world-ios-signed-ipa` | App **assinado pela Apple**. Só aparece depois que você configurar o Caminho 1. |
| Envio ao **TestFlight** | Automático depois do Caminho 1. A atualização chega sozinha no seu iPhone. |

> ⚠️ **Nunca cole senhas, chaves ou arquivos de certificado no chat.** Coloque essas informações só
> nos **Secrets do GitHub**, como explicado abaixo. Ninguém consegue ler um Secret depois de salvo.

---

## Caminho 1 (RECOMENDADO): conta de desenvolvedor da Apple + TestFlight

**Custo:** US$ 99 por ano.
**Vantagens:** você instala pelo app oficial **TestFlight**, as atualizações chegam sozinhas, não
precisa de cabo nem de computador e o app não expira a cada 7 dias (cada versão dura 90 dias, e
sempre sai uma nova). É também o primeiro passo para publicar na App Store.

### Passo 1: Inscreva-se no Apple Developer Program
1. No iPhone, baixe o app **Apple Developer** na App Store.
2. Entre com o seu Apple ID, toque em **Conta → Inscrever-se** e escolha **Pessoa física**.
3. Pague os US$ 99. A aprovação leva de algumas horas a 2 dias, e você recebe um e-mail.

### Passo 2: Anote o seu Team ID
1. No computador, entre em <https://developer.apple.com/account>.
2. Abra **Membership details** (Detalhes da assinatura).
3. Copie o **Team ID**, um código de 10 letras e números, por exemplo `AB12CD34EF`.

### Passo 3: Registre o identificador do app (Bundle ID)
1. No mesmo site, abra **Certificates, IDs & Profiles → Identifiers** e clique em **+**.
2. Escolha **App IDs**, depois **App**, e clique em **Continue**.
3. Preencha:
   - **Description:** `Bloop World`
   - **Bundle ID:** marque **Explicit** e digite exatamente `com.sulamericagg.blooporbit`
4. Clique em **Continue** e depois em **Register**. Não precisa marcar mais nada.

### Passo 4: Registre o seu iPhone (só uma vez)
O modo automático de assinatura costuma exigir pelo menos um aparelho cadastrado.
1. Descubra o **UDID** do iPhone. Num PC com Windows, abra o app **Apple Devices** (ou o iTunes)
   com o iPhone ligado no cabo e clique no número de série até aparecer o UDID. Outra opção é
   abrir o site **udid.tech** no Safari do iPhone.
2. No site da Apple, abra **Devices**, clique em **+**, dê um nome (por exemplo, "Meu iPhone") e cole
   o UDID.

### Passo 5: Crie o app no App Store Connect
1. Entre em <https://appstoreconnect.apple.com>, abra **Apps** e clique em **+ → Novo app**.
2. Preencha:
   - **Plataformas:** iOS
   - **Nome:** `Bloop World` (se já estiver em uso, tente `Bloop World Jogo`)
   - **Idioma principal:** Português (Brasil)
   - **ID do pacote (Bundle ID):** escolha `com.sulamericagg.blooporbit`
   - **SKU:** `bloopworld`
   - **Acesso de usuário:** Acesso total
3. Clique em **Criar**. Você não precisa preencher fotos nem descrição para usar o TestFlight.

### Passo 6: Crie a chave da API (é ela que deixa o GitHub enviar o app)
1. No App Store Connect, abra **Usuários e Acesso → Integrações → App Store Connect API**.
2. Na aba **Chaves da equipe**, clique em **+** (ou **Gerar chave de API**).
3. Preencha:
   - **Nome:** `GitHub`
   - **Acesso:** **Admin**. Esse nível é necessário para o GitHub criar o certificado sozinho.
4. Clique em **Gerar** e anote:
   - o **ID da chave** (Key ID), por exemplo `2X9R4HXF34`;
   - o **ID do emissor** (Issuer ID), que fica no topo da página e parece `69a6de7e-...`.
5. Clique em **Baixar chave de API**. O arquivo se chama `AuthKey_XXXXXXXXXX.p8`.
   **A Apple só deixa baixar uma vez**, então guarde o arquivo num lugar seguro.

### Passo 7: Coloque as informações nos Secrets do GitHub
1. Abra o repositório no GitHub e vá em **Settings → Secrets and variables → Actions**.
2. Clique em **New repository secret** e crie um Secret para cada linha da tabela:

| Nome do Secret | O que colar |
|---|---|
| `IOS_TEAM_ID` | o Team ID do Passo 2 |
| `APP_STORE_CONNECT_API_KEY_ID` | o ID da chave do Passo 6 |
| `APP_STORE_CONNECT_API_ISSUER_ID` | o ID do emissor do Passo 6 |
| `APP_STORE_CONNECT_API_KEY_BASE64` | abra o arquivo `.p8` no Bloco de Notas e cole **todo** o texto, incluindo as linhas `-----BEGIN PRIVATE KEY-----` e `-----END PRIVATE KEY-----` |

Depois disso, me avise só que os Secrets estão salvos. **Não me mande os valores.**

### Passo 8: Monte o app
- O app é montado sozinho a cada atualização do jogo.
- Para montar na hora: no GitHub, abra **Actions → "iOS (simulador + IPA + TestFlight)" →
  Run workflow**.
- Leva de 20 a 40 minutos. Se der certo, o resumo da execução mostra "Enviado ao TestFlight".
  A Apple ainda processa o app por 10 a 30 minutos.

### Passo 9: Instale no iPhone pelo TestFlight
1. No App Store Connect, abra o app, vá em **TestFlight → Testes internos**, clique em **+** e crie
   um grupo (por exemplo, "Família"). Adicione você mesmo, usando o seu e-mail da Apple.
2. No iPhone, instale o app **TestFlight** pela App Store.
3. Abra o convite que chegou por e-mail, ou abra o TestFlight. O **Bloop World** vai aparecer lá.
   Toque em **Instalar**.
4. Nas próximas versões, o TestFlight avisa, e você pode ligar a atualização automática.

> A pergunta sobre "criptografia" já está respondida dentro do app. Ele usa só HTTPS comum.

### Se a assinatura automática não funcionar (Plano B)
Alguém com um Mac, ou que saiba usar o OpenSSL, pode criar um **certificado de distribuição**
(`.p12`) e um **perfil App Store** para `com.sulamericagg.blooporbit`. Depois, cadastre mais
estes Secrets:

| Nome do Secret | O que é |
|---|---|
| `IOS_CERT_P12_BASE64` | o arquivo `.p12` convertido para base64 |
| `IOS_CERT_PASSWORD` | a senha do `.p12` |
| `IOS_PROVISION_PROFILE_BASE64` | o arquivo `.mobileprovision` convertido para base64 |

Quando esses três Secrets e o `IOS_TEAM_ID` existem, o GitHub usa esse certificado no lugar do modo
automático. Se o perfil for **Ad Hoc** (com a lista de aparelhos), sai um `.ipa` Ad Hoc para instalar
direto nos iPhones cadastrados, sem passar pelo TestFlight.

---

## Caminho 2 (GRÁTIS): Sideloadly ou AltStore num PC com Windows

**Custo:** zero. Você usa um Apple ID comum.
**Limites:** o app **para de abrir depois de 7 dias** e precisa ser reinstalado. Além disso, só
cabem 3 apps instalados assim ao mesmo tempo, e você precisa de cabo e PC a cada reinstalação.

1. No PC, instale o **iTunes** e o **iCloud**. Baixe os dois do site da Apple, **não** da Microsoft
   Store.
2. Instale o **Sideloadly** pelo site oficial, <https://sideloadly.io>.
3. No GitHub, abra **Actions**, clique na última execução verde de "iOS" e baixe o item
   **bloop-world-ios-unsigned-ipa**. Descompacte e você terá `BloopWorld-...-unsigned.ipa`.
4. Ligue o iPhone no PC com o cabo e toque em **Confiar** no iPhone.
5. Abra o Sideloadly, arraste o `.ipa` para ele, digite o seu Apple ID e clique em **Start**.
   É mais seguro usar um Apple ID secundário. O Sideloadly assina o app com a sua conta.
6. No iPhone:
   - vá em **Ajustes → Geral → VPN e Gerenciamento de Dispositivos**, toque no seu e-mail e depois
     em **Confiar**;
   - no iOS 16 ou mais novo, ative **Ajustes → Privacidade e Segurança → Modo de Desenvolvedor** e
     reinicie o iPhone.
7. A cada 7 dias, repita o passo 5. O **AltStore** (<https://altstore.io>) faz isso pelo Wi-Fi
   automaticamente, desde que o AltServer fique aberto no PC.

---

## Caminho 3 (DEPOIS): publicar na App Store

Você usa a mesma conta do Caminho 1. Faltam:
- **fotos de tela** do iPhone (6,9" e 6,5"), um **ícone** (já existe), uma **descrição** e a
  **classificação etária**;
- o link da **Política de Privacidade** e o questionário **Privacidade do app**. Os anúncios do
  AdMob coletam o identificador de publicidade;
- os **IDs reais do AdMob para iOS**. No AdMob, crie um app **iOS** separado do Android, com 3 blocos.
  Coloque os IDs em `src/config.ts` (`ADMOB_REAL_IOS`). O ID do app, aquele com "~", vai também em
  `ios/App/App/Info.plist`, na chave `GADApplicationIdentifier`;
- as **compras dentro do app**: crie os mesmos produtos no App Store Connect, com os mesmos IDs do
  Google Play, e me peça para ligar as compras no iPhone. Hoje elas estão desligadas no iPhone;
- enviar o app para a revisão da Apple, que leva de 1 a 3 dias.

---

## O que é diferente no iPhone (nesta primeira versão)

- **Compras (gemas, Sem Anúncios, Clube):** desligadas no iPhone por enquanto. Se você tocar em comprar,
  aparece um aviso de loja indisponível. Para ligar, os produtos precisam existir no App Store Connect.
- **Anúncios:** só os de **teste** do Google, até você criar o app iOS no AdMob. O iPhone pergunta
  se o app pode "rastrear" você. É a tela padrão da Apple para anúncios.
- **Botão voltar:** o iPhone não tem botão voltar. Use os botões de voltar e fechar que aparecem
  na tela.
- **Som:** com a chave de silencioso do iPhone ligada, o som do jogo pode ficar mudo.
- **Voz (Cava & Fala, bichinho, dublagem):** usa o reconhecimento de voz da Apple. Na primeira vez,
  o iPhone pede permissão para o microfone e para o reconhecimento de fala.
- **Câmera (Bloop Espelho, QR Code), localização (Caça Bloop), lembretes:** o iPhone pede
  permissão na primeira vez. As mensagens dos pedidos estão em português.
- **Rotação:** os menus ficam sempre em pé, e as cenas 3D giram para deitado, como no Android.
- **Tela:** não apaga sozinha com o jogo aberto.
- Requer **iOS 15 ou mais novo**, só no iPhone.

## Para quem programa

- Projeto Xcode: `ios/App` (Capacitor 8, Swift Package Manager). Depois de `npm run build`,
  rode `npx cap sync ios`.
- Plugins nativos próprios: ficam em `ios/App/App/` e são registrados no `BloopViewController`.
  - `BloopOrientation`: o mesmo contrato do plugin Java do Android.
  - `SpeechRecognition`: uma versão própria, porque o `@capacitor-community/speech-recognition`
    7.x não tem suporte a SPM.
- Ícone e splash: `npm run assets:ios`, que gera a partir de `assets/`.
- Versão: `CFBundleShortVersionString` = `version` do `package.json`; `CFBundleVersion` = número
  da execução do workflow.
