/**
 * CONFIGURAÇÃO DE MONETIZAÇÃO
 * ---------------------------------------------------------------
 * Troque os IDs abaixo pelos seus quando criar as contas:
 *  - AdMob:      https://admob.google.com  (crie o app + 3 blocos de anúncio)
 *  - Play Console: Monetizar > Produtos > Produtos no app (use os mesmos IDs de produto)
 *  - AdSense (web): https://adsense.google.com  (H5 Games Ads)
 *
 * Enquanto ADS_TEST_MODE = true, aparecem anúncios de TESTE do Google
 * (nunca clique nos seus próprios anúncios reais — dá banimento).
 */

export const ADS_TEST_MODE = true;

export const ADMOB = {
  // ID do APP fica em android/app/src/main/AndroidManifest.xml (APPLICATION_ID)
  banner: 'ca-app-pub-3940256099942544/6300978111',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
};

/** Versão web: Google H5 Games Ads (AdSense). Deixe vazio para desativar. */
export const WEB_ADS = {
  adsenseClient: '', // ex.: 'ca-pub-1234567890123456'
};

/** Regras de anúncio intersticial (equilíbrio entre receita e retenção). */
export const AD_RULES = {
  interstitialEveryNRuns: 3,
  interstitialMinSeconds: 75,
  freeRunsBeforeFirstInterstitial: 2,
};

export type ProductKind = 'gems' | 'noads' | 'starter' | 'vip';

export interface ProductDef {
  id: string;
  kind: ProductKind;
  consumable: boolean;
  gems: number;
  coins: number;
  fallbackPrice: string;
  badge?: 'popular' | 'best';
  skin?: string;
}

/** Os IDs precisam ser IGUAIS aos cadastrados no Google Play Console. */
export const PRODUCTS: ProductDef[] = [
  { id: 'starter_pack', kind: 'starter', consumable: false, gems: 300, coins: 3000, fallbackPrice: 'R$ 9,90', skin: 'galaxy', badge: 'best' },
  { id: 'remove_ads', kind: 'noads', consumable: false, gems: 0, coins: 0, fallbackPrice: 'R$ 14,90' },
  { id: 'gems_small', kind: 'gems', consumable: true, gems: 100, coins: 0, fallbackPrice: 'R$ 4,90' },
  { id: 'gems_medium', kind: 'gems', consumable: true, gems: 550, coins: 0, fallbackPrice: 'R$ 19,90', badge: 'popular' },
  { id: 'gems_large', kind: 'gems', consumable: true, gems: 1200, coins: 0, fallbackPrice: 'R$ 39,90' },
  { id: 'gems_mega', kind: 'gems', consumable: true, gems: 3000, coins: 0, fallbackPrice: 'R$ 89,90' },
];

export const LINKS = {
  playStore: 'https://play.google.com/store/apps/details?id=com.sulamericagg.blooporbit',
  privacy: './privacy.html',
};

export const ECONOMY = {
  reviveGemCost: 15,
  gemsToCoinsRate: 25,
  dailyRewards: [
    { coins: 50 }, { coins: 100 }, { gems: 5 }, { coins: 200 }, { coins: 300 }, { gems: 15 }, { coins: 500, gems: 30 },
  ] as { coins?: number; gems?: number }[],
};

/**
 * SERVIDOR ONLINE (presentes, códigos e desafios) — Cloudflare Worker em server/.
 *  - apiBase: deixe '' para a versão web servida pelo próprio Worker (usa a mesma origem: /api/...).
 *  - nativeApiBase: usado no app Android (Capacitor). TROQUE pelo endereço real
 *    *.workers.dev que a Cloudflare mostra depois do primeiro deploy
 *    (Workers & Pages → bloop-orbit → "Visit"), ou pelo seu domínio próprio.
 *    Sem barra no final. Veja docs/PAINEL-ADMIN.md.
 */
export const ONLINE = {
  apiBase: '',
  nativeApiBase: 'https://bloop-orbit.sulamericaradioetv.workers.dev',
  /** Tempo máximo de cada requisição (ms). */
  timeoutMs: 8000,
};
