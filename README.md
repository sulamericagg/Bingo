# 🪐 Bloop Orbit

Jogo casual **one-tap** (um toque) feito para viralizar: pule de planeta em planeta, pegue moedas, faça pousos **PERFEITOS** e não caia no espaço!

- **Web** (PWA, roda no navegador e funciona offline) + **Android APK/AAB** para a Google Play — mesmo código.
- 2D caprichado e 100% procedural: planetas com textura girando, sombra, brilho especular, atmosfera e anéis; personagem com squash & stretch, piscar de olhos, olhar que segue o alvo; partículas, tremor de tela, câmera lenta, flash, 5 galáxias que mudam o cenário.
- Áudio sintetizado (efeitos + música generativa que acelera com a partida) → **APK leve, zero arquivos de som**.
- Otimizado: sprites pré-renderizados, pool fixo de partículas (zero lixo no GC), qualidade adaptativa automática se o FPS cair, “modo economia” para celular fraco. JS do jogo: ~33 KB gzip.

## 💰 Monetização

| Fonte | Onde |
|---|---|
| **Vídeo premiado (rewarded)** | Continuar após morrer · Dobrar moedas · Diário em dobro · Moedas grátis (8/dia) · Skins/rastros desbloqueados por vídeo |
| **Intersticial** | A cada 3 partidas, mínimo 75 s entre anúncios, nunca nas 2 primeiras (ajustável em `AD_RULES`) |
| **Banner** | Só no menu e na tela de fim (nunca durante o jogo) |
| **Compras (Google Play Billing)** | Pacote Inicial, Sem Anúncios, 4 pacotes de gemas |
| **Economia** | Moedas (jogando) + Gemas (premium) → 13 skins e 8 rastros, continuar com gemas, troca gema→moeda |
| **Retenção** | Presente diário de 7 dias, 3 missões diárias, recorde, botão “Desafiar” (compartilhar) |

Na web: anúncios via **Google H5 Games Ads (AdSense)**; compras redirecionam para o app na Play Store.

## ⚙️ O que você precisa trocar (tudo em um lugar)

1. **`src/config.ts`**
   - `ADMOB.banner / interstitial / rewarded` → IDs dos blocos de anúncio do seu AdMob.
   - `ADS_TEST_MODE = false` quando for publicar.
   - `WEB_ADS.adsenseClient` → seu `ca-pub-...` (opcional, para a versão web).
   - Preços de referência em `PRODUCTS` (o app mostra o preço real da Play Store automaticamente).
2. **`android/app/src/main/AndroidManifest.xml`** → `com.google.android.gms.ads.APPLICATION_ID` = ID do **app** no AdMob (`ca-app-pub-...~...`).
3. **Google Play Console → Monetizar → Produtos no app**: crie os produtos com estes IDs exatos:
   `starter_pack`, `remove_ads` (não consumíveis) · `gems_small`, `gems_medium`, `gems_large`, `gems_mega` (consumíveis).
4. **`capacitor.config.ts` / `android/app/build.gradle`** → `appId` se quiser outro nome de pacote (`com.sulamericagg.blooporbit`).
5. Política de privacidade: `public/privacy.html` (publique a versão web e use a URL `/privacy.html` na Play Console).

> ⚠️ Nunca clique nos seus próprios anúncios reais — o AdMob bane a conta. Teste sempre com `ADS_TEST_MODE = true`.

## 🛠️ Desenvolvimento

```bash
npm install
npm run dev          # jogar no navegador (http://localhost:5173)
npm run build        # versão web em dist/
```

## 📱 Android

Requisitos: JDK 21 + Android SDK (ou Android Studio).

```bash
npm run android:debug     # gera android/app/build/outputs/apk/debug/app-debug.apk
npx cap open android      # abrir no Android Studio
```

### Release assinado para a Play Store

```bash
keytool -genkey -v -keystore android/release.jks -alias bloop -keyalg RSA -keysize 2048 -validity 10000
```

Crie `android/keystore.properties` (já está no `.gitignore`):

```
storeFile=release.jks
storePassword=SUA_SENHA
keyAlias=bloop
keyPassword=SUA_SENHA
```

```bash
VERSION_CODE=2 VERSION_NAME=1.0.1 npm run android:release
# AAB para a Play Store: android/app/build/outputs/bundle/release/app-release.aab
```

**Guarde o `release.jks` e as senhas com segurança** — sem eles você não consegue atualizar o app.

### CI (GitHub Actions)

- `.github/workflows/android.yml` gera APK + AAB a cada push (baixe em *Actions → Artifacts*). Para assinar no CI, adicione os Secrets `KEYSTORE_BASE64` (`base64 -w0 release.jks`), `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`.
- `.github/workflows/web.yml` publica a versão web no **GitHub Pages** a cada push na `main` (ative em *Settings → Pages → Source: GitHub Actions*).

## 🎨 Artes

- `store/` — ícone 512, feature graphic 1024×500 e screenshots 1080×1920 prontos para a Play Store.
- Tudo é gerado pelo próprio código do jogo: `npm run assets` (requer Playwright) regenera ícones/splash.

## 🗂️ Estrutura

```
src/config.ts        ← IDs de anúncio, produtos e regras de monetização
src/game/            ← motor: física, mundo, sprites procedurais, partículas, skins
src/ui/              ← menus, loja, diário, missões (HTML/CSS)
src/services/        ← AdMob/AdSense, Google Play Billing, compartilhar
src/core/            ← save, economia, áudio sintetizado, vibração
android/             ← projeto nativo (Capacitor 8)
```
