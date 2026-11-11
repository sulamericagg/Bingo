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

/**
 * TODO(dono): deixe `true` até criar o app e os 3 blocos no AdMob (passo a passo: docs/ANUNCIOS.md).
 * Com `true` o app SEMPRE pede anúncios de teste, mesmo que os IDs reais já estejam abaixo.
 */
export const ADS_TEST_MODE = true;

/** IDs de teste oficiais do Google (funcionam em qualquer app; nunca geram receita). */
const ADMOB_TEST = {
  appId: 'ca-app-pub-3940256099942544~3347511713',
  banner: 'ca-app-pub-3940256099942544/6300978111',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
};

/**
 * TODO(dono): cole aqui os IDs REAIS do AdMob (formato ca-app-pub-XXXXXXXXXXXXXXXX/NNNNNNNNNN)
 * e depois troque ADS_TEST_MODE para false. Vazio = usa o ID de teste correspondente.
 * O ID do APP (com "~") também vai em android/app/src/main/AndroidManifest.xml
 * (meta-data com.google.android.gms.ads.APPLICATION_ID) — é lá que o SDK o lê.
 */
export const ADMOB_REAL = {
  appId: '', // TODO(dono): ca-app-pub-XXXXXXXXXXXXXXXX~NNNNNNNNNN  (Apps → Configurações do app)
  banner: '', // TODO(dono): bloco "Banner" (adaptativo, rodapé dos menus/resultados)
  interstitial: '', // TODO(dono): bloco "Intersticial" (pausas entre partidas / volta ao hub)
  rewarded: '', // TODO(dono): bloco "Premiado" (Dobrar recompensa, +1 vida, dicas, tempo sem anúncios)
};

/** IDs efetivos usados por src/services/ads.ts (teste enquanto ADS_TEST_MODE ou campo vazio). */
export const ADMOB = {
  appId: (!ADS_TEST_MODE && ADMOB_REAL.appId) || ADMOB_TEST.appId,
  banner: (!ADS_TEST_MODE && ADMOB_REAL.banner) || ADMOB_TEST.banner,
  interstitial: (!ADS_TEST_MODE && ADMOB_REAL.interstitial) || ADMOB_TEST.interstitial,
  rewarded: (!ADS_TEST_MODE && ADMOB_REAL.rewarded) || ADMOB_TEST.rewarded,
};

/**
 * PAUSAS PARA INTERSTICIAL em TODOS os jogos (src/services/adbreaks.ts + maybeInterstitial).
 * Limites globais (valem para o Orbit e para os jogos do hub juntos). Podem ser ajustados
 * remotamente pelo servidor (campo `ads` de GET /api/challenges — docs/ANUNCIOS.md).
 */
export const AD_BREAKS = {
  /** intervalo mínimo entre dois intersticiais (qualquer jogo) */
  minGapSec: 120,
  /** depois de um vídeo premiado, sem intersticial por este tempo */
  afterRewardedSec: 90,
  /** nada de intersticial nos primeiros N segundos de cada sessão (abriu o app) */
  sessionWarmupSec: 120,
  /** jogador novo (primeira abertura do app há menos de N min): sem intersticial */
  newPlayerGraceMin: 10,
  /** teto por sessão e por hora corrida */
  maxPerSession: 8,
  maxPerHour: 6,
  /** partidas (de qualquer jogo) entre um intersticial e outro */
  runsBetween: 2,
  /** primeiras partidas de CADA jogo sem intersticial (tutorial / primeira impressão) */
  freeRunsPerGame: 2,
  /** primeiras partidas no total (save.runs + jogos do hub) sem intersticial */
  freeRunsTotal: 2,
  /** depois de uma compra com dinheiro real */
  afterPurchaseMin: 15,
  /** espera depois do 'run-end' (tela de resultado aparecer) antes de decidir */
  runEndDelayMs: 1300,
  /** sair do jogo para o hub conta como pausa se jogou pelo menos isso (ou terminou 1 partida) */
  exitMinPlaySec: 60,
  /** jogos em que o 'run-end' NÃO é uma pausa segura (rodadas emendadas/online): só na saída */
  exitOnlyGames: ['disaster'] as string[],
};

/** VÍDEOS PREMIADOS opcionais: tetos diários por tipo (offerRewarded) e o "Dobrar recompensa" central. */
export const AD_REWARDED = {
  /** teto diário por tipo (kind) de offerRewarded(); tipo sem entrada usa `default` */
  dailyCaps: { double: 6, life: 8, continue: 8, hint: 10, default: 10 } as Record<string, number>,
  /** "Dobrar recompensa" central: moedas extras = moedas da partida, entre min e max */
  doubleMinCoins: 15,
  doubleMaxCoins: 400,
  /** quanto tempo o cartão fica na tela (s) */
  doubleShowSec: 9,
  /** jogos que já têm o próprio botão de dobrar/vídeo na tela de resultado (o central não aparece) */
  ownDoubleGames: ['orbit', 'tubo', 'rally', 'cozinha', 'band', 'disaster', 'floresta', 'tycoon'] as string[],
};

/**
 * Estatísticas de anúncios (impressões/recompensas por jogo, por dia) — sempre locais (localStorage).
 * `endpoint` vazio = não envia. Quando existir um endpoint no servidor, ex.: '/ads/stats', o app
 * manda um POST resumido por dia (veja docs/ANUNCIOS.md).
 */
export const AD_STATS = {
  endpoint: '',
  keepDays: 14,
};

/** Versão web: Google H5 Games Ads (AdSense). Deixe vazio para desativar. */
export const WEB_ADS = {
  adsenseClient: '', // ex.: 'ca-pub-1234567890123456'
};

export type ProductKind = 'gems' | 'noads' | 'starter' | 'vip' | 'cosmetic' | 'doubler' | 'boosts' | 'bundle' | 'flash' | 'club';

export interface ProductDef {
  id: string;
  kind: ProductKind;
  /** consumível = pode comprar de novo (gemas, pacotes). Não consumível = item permanente. */
  consumable: boolean;
  gems: number;
  coins: number;
  fallbackPrice: string;
  badge?: 'popular' | 'best' | 'sale';
  /** % de bônus sobre o pacote base (só visual: "+20%") */
  bonusPct?: number;
  /** skin desbloqueada pela compra */
  skin?: string;
  /** rastro desbloqueado pela compra */
  trail?: string;
  /** remove anúncios (banner + intersticial) */
  noAds?: boolean;
  /** dobrador de moedas permanente (2x moedas das partidas) */
  coinDoubler?: boolean;
  /** consumíveis entregues */
  boosts?: { shield?: number; magnet?: number; headstart?: number };
  /** preço "de" riscado (só visual) */
  wasPrice?: string;
}

/**
 * Os IDs precisam ser IGUAIS aos cadastrados no Google Play Console (Produtos no app).
 * Tabela completa com tipos e preços sugeridos: docs/STORE.md.
 */
export const PRODUCTS: ProductDef[] = [
  { id: 'starter_pack', kind: 'starter', consumable: false, gems: 300, coins: 3000, fallbackPrice: 'R$ 9,90', skin: 'galaxy', noAds: true, badge: 'best' },
  { id: 'remove_ads', kind: 'noads', consumable: false, gems: 0, coins: 0, fallbackPrice: 'R$ 14,90', noAds: true },
  // Gemas (moeda premium). Pacotes maiores rendem MUITO mais por real (bônus progressivo).
  // IDs antigos mantidos (gems_small..gems_mega); preços/quantidades re-escalonados em nov/2026.
  { id: 'gems_small', kind: 'gems', consumable: true, gems: 100, coins: 0, fallbackPrice: 'R$ 4,90' },
  { id: 'gems_medium', kind: 'gems', consumable: true, gems: 220, coins: 0, fallbackPrice: 'R$ 9,90', bonusPct: 9 },
  { id: 'gems_large', kind: 'gems', consumable: true, gems: 600, coins: 0, fallbackPrice: 'R$ 24,90', badge: 'popular', bonusPct: 18 },
  { id: 'gems_mega', kind: 'gems', consumable: true, gems: 1300, coins: 0, fallbackPrice: 'R$ 49,90', bonusPct: 27 },
  { id: 'gems_ultra', kind: 'gems', consumable: true, gems: 2800, coins: 0, fallbackPrice: 'R$ 99,90', bonusPct: 37 },
  { id: 'gems_galaxy', kind: 'gems', consumable: true, gems: 6000, coins: 0, fallbackPrice: 'R$ 199,90', badge: 'best', bonusPct: 47 },
  // cosméticos míticos (permanentes)
  { id: 'skin_phoenix', kind: 'cosmetic', consumable: false, gems: 0, coins: 0, fallbackPrice: 'R$ 12,90', skin: 'phoenix' },
  { id: 'skin_lava_golem', kind: 'cosmetic', consumable: false, gems: 0, coins: 0, fallbackPrice: 'R$ 12,90', skin: 'lava' },
  { id: 'trail_neon', kind: 'cosmetic', consumable: false, gems: 0, coins: 0, fallbackPrice: 'R$ 7,90', trail: 'neon' },
  // vantagens
  { id: 'coin_doubler', kind: 'doubler', consumable: false, gems: 0, coins: 0, fallbackPrice: 'R$ 14,90', coinDoubler: true },
  { id: 'boost_bundle', kind: 'boosts', consumable: true, gems: 0, coins: 0, fallbackPrice: 'R$ 6,90', boosts: { shield: 5, magnet: 5, headstart: 5 } },
  // Pacotes especiais: ~1,4-1,7x o valor dos pacotes normais (vantagem clara, sem "absurdo" que desvaloriza as gemas).
  // vip: 600 gemas (~R$ 23) + sem anúncios (R$ 14,90) + dobrador (R$ 14,90) + skin (~R$ 12,90) ≈ R$ 66 → por R$ 39,90
  { id: 'vip_pack', kind: 'vip', consumable: false, gems: 600, coins: 0, fallbackPrice: 'R$ 39,90', noAds: true, coinDoubler: true, skin: 'king', badge: 'best', wasPrice: 'R$ 64,90' },
  // mega: 2000 gemas (~R$ 71 na taxa do pacote de R$ 99,90) + 10.000 moedas (~400 gemas) + 5 de cada turbo ≈ R$ 87 → por R$ 59,90
  { id: 'mega_bundle', kind: 'bundle', consumable: true, gems: 2000, coins: 10000, fallbackPrice: 'R$ 59,90', boosts: { shield: 5, magnet: 5, headstart: 5 }, badge: 'popular', wasPrice: 'R$ 89,90' },
  // oferta relâmpago diária (bônus do dia em FLASH_BONUSES)
  // relâmpago (1x/dia): 350 gemas por R$ 9,90 = 35 gemas/R$ (o melhor pacote normal dá 30/R$; o de R$ 9,90 dá 22/R$) + bônus do dia
  { id: 'flash_gems', kind: 'flash', consumable: true, gems: 350, coins: 0, fallbackPrice: 'R$ 9,90', badge: 'sale', wasPrice: 'R$ 14,90' },
];

/** Bônus da Oferta relâmpago — gira todo dia (índice = dia % length). */
export const FLASH_BONUSES: { coins?: number; boosts?: { shield?: number; magnet?: number; headstart?: number } }[] = [
  { coins: 2000 },
  { boosts: { shield: 3 } },
  { coins: 1500, boosts: { magnet: 3 } },
  { boosts: { headstart: 3 } },
  { coins: 3000 },
  { boosts: { shield: 2, magnet: 2, headstart: 2 } },
  { coins: 2500 },
];

/**
 * ASSINATURA "Clube Bloop" (Play Console → Monetizar → Produtos → Assinaturas).
 * Produto `clube_bloop`, plano base `mensal` (renovação automática mensal).
 * NÃO entra em PRODUCTS (que é só de produtos no app / INAPP).
 */
export const CLUB = {
  productId: 'clube_bloop',
  basePlan: 'mensal',
  fallbackPrice: 'R$ 19,90/mês',
  /** gemas entregues ao assinar e a cada renovação (1x por mês de assinatura) */
  gemsOnRenew: 300,
  /** gotejamento diário de gemas enquanto ativo (resgatar no Passe) */
  gemsDaily: 15,
  /** moldura exclusiva de perfil */
  frame: 'fr_club',
};

/** PASSE ESTELAR — um por mês (60 temporadas em src/creatures/seasons.ts). */
export const PASS = {
  levels: 50,
  /** XP por nível (constante: fácil de entender para crianças) */
  xpPerLevel: 1000,
  /** preço do passe premium em gemas */
  priceGems: 950,
  /** pular 1 nível */
  skipGems: 150,
  /** Passe da Casa (premium separado) e combo "Passes do Mês" (os dois, com desconto) */
  homePriceGems: 800,
  homeSkipGems: 120,
  /** combo "Passes do Mês": Estelar + Casa + Musical (950 + 800 + 800 = 2.550) */
  bundlePriceGems: 1950,
  /** Passe Musical */
  musicPriceGems: 800,
  musicSkipGems: 120,
  musicRunShare: 0.4,
  /** bônus por partida do Bloop Banda (game 'band'): base + vitória */
  bandXp: { base: 120, win: 80 },
  /** XP do Passe da Casa: parte do XP de partidas + atividades da casa (teto diário) */
  homeRunShare: 0.4,
  homeXp: { 'home-build': 40, 'home-paint': 30, 'home-clean': 25, 'party-host': 300, 'party-join': 150, 'home-visit-help': 120 } as Record<string, number>,
  homeDailyCap: 2500,
  /** XP do login diário */
  dailyLoginXp: 300,
  /** XP por partida: base + por segundo (teto) + bônus */
  runXp: { base: 25, perSec: 1.5, maxDur: 90, win: 60, podium: [0, 80, 50, 30] as number[], perfScore: 0 },
};

/** TEMPO SEM ANÚNCIOS: assista N vídeos premiados → M minutos sem intersticial/banner (acumula até o teto). */
export const AD_FREE = {
  videos: 3,
  minutes: 30,
  maxMinutes: 120,
};

export const productById = (id: string): ProductDef | undefined => PRODUCTS.find((p) => p.id === id);

/** Melhorias permanentes (níveis 0..5). Preço em moedas por nível; gemas = atalho. */
export const UPGRADES = {
  maxLevel: 5,
  coinCost: [400, 900, 1800, 3500, 6500],
  gemCost: [15, 30, 60, 110, 200],
};

/** Consumíveis vendidos na loja (pacotes). */
export const BOOST_PACKS = {
  shield: { coins: { n: 3, price: 450 }, gems: { n: 10, price: 35 } },
  magnet: { coins: { n: 3, price: 300 }, gems: { n: 10, price: 25 } },
  headstart: { coins: { n: 3, price: 600 }, gems: { n: 10, price: 45 } },
};

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
  nativeApiBase: 'https://bloop-orbit.dkrossoficial.workers.dev',
  /** Tempo máximo de cada requisição (ms). */
  timeoutMs: 8000,
};
