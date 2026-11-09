const KEY = 'bloop-orbit-save-v1';

export type MissionType = 'planets' | 'coins' | 'perfects' | 'score' | 'runs';

export interface Mission {
  type: MissionType;
  target: number;
  progress: number;
  reward: number;
  claimed: boolean;
}

export interface SaveData {
  coins: number;
  gems: number;
  best: number;
  runs: number;
  skin: string;
  trail: string;
  ownedSkins: string[];
  ownedTrails: string[];
  adProgress: Record<string, number>;
  noAds: boolean;
  starter: boolean;
  sound: boolean;
  music: boolean;
  haptics: boolean;
  lowFx: boolean;
  dailyDay: number;
  dailyStreak: number;
  missionsDay: number;
  missions: Mission[];
  totalPlanets: number;
  totalPerfects: number;
  lastInterstitial: number;
  runsSinceAd: number;
  firstSeen: number;
  /** Níveis permanentes (0..5) comprados na loja. */
  upgrades: { magnet: number; shield: number; coinValue: number };
  /** Consumíveis (quantidade). A UI decrementa ao usar; o jogo não. */
  boosts: { shield: number; magnet: number; headstart: number };
  /** Quantas vezes cada dica já foi mostrada (ex.: tips.asteroid). */
  tips: Record<string, number>;
  /** "Crie seu Bloop": peças equipadas por slot + cores (ver game/avatar.ts). */
  avatar: AvatarSave;
  /** Peças/paletas compradas do criador (as grátis não precisam estar aqui). */
  ownedParts: string[];
  /** Passe Estelar (src/pass/state.ts). */
  pass: PassSave;
  /** Itens exclusivos do passe que não são peças do criador: emotes, músicas, molduras, faixas, criaturas. */
  passItems: string[];
  /** Ingressos (campeonatos/eventos). */
  tickets: number;
  /** Clube Bloop (assinatura). expires = ms epoch; 0 = nunca assinou. */
  club: { expires: number; lastRenewGrant: number; lastDrip: number };
  /** Tempo sem anúncios ganho com vídeos premiados (ms epoch) + vídeos acumulados para o próximo bloco. */
  adFree: { until: number; videos: number };
}

export interface PassSeasonSave {
  xp: number;
  premium: boolean;
  /** níveis resgatados (trilha grátis / premium) */
  free: number[];
  prem: number[];
}

export interface PassSave {
  /** índice da temporada que os campos abaixo descrevem (-1 = nenhuma) */
  season: number;
  cur: PassSeasonSave;
  /** temporadas anteriores (para a tela de histórico) */
  history: Record<string, PassSeasonSave>;
  /** desafios semanais: semana ISO + progresso por desafio + resgatados */
  week: string;
  wprog: Record<string, number>;
  wdone: string[];
  /** marcos da temporada (progresso acumulado por chave) */
  mprog: Record<string, number>;
  mdone: string[];
  loginDay: number;
  /** pop-ups já vistos: 'sNN' (anúncio) e 'sNN-end' (últimos 3 dias) */
  seen: string[];
}

export interface AvatarSave {
  parts: Record<'body' | 'material' | 'pattern' | 'eyes' | 'mouth' | 'head' | 'face' | 'back' | 'aura', string>;
  colors: { primary: string; secondary: string };
}

/** Avatar inicial (de propósito tosco). Espelha STARTER_AVATAR em game/avatar.ts. */
const defaultAvatar = (): AvatarSave => ({
  parts: { body: 'b_blob', material: 'm_crayon', pattern: 'p_none', eyes: 'e_dots', mouth: 'mo_line', head: 'h_bag', face: 'f_bandaid', back: 'k_none', aura: 'a_none' },
  colors: { primary: '#c9a3a3', secondary: '#a8b08f' },
});

const defaults = (): SaveData => ({
  coins: 0,
  gems: 10,
  best: 0,
  runs: 0,
  skin: 'bloop',
  trail: 'spark',
  ownedSkins: ['bloop', 'custom'],
  ownedTrails: ['spark'],
  adProgress: {},
  noAds: false,
  starter: false,
  sound: true,
  music: true,
  haptics: true,
  lowFx: false,
  dailyDay: 0,
  dailyStreak: 0,
  missionsDay: 0,
  missions: [],
  totalPlanets: 0,
  totalPerfects: 0,
  lastInterstitial: 0,
  runsSinceAd: 0,
  firstSeen: Date.now(),
  upgrades: { magnet: 0, shield: 0, coinValue: 0 },
  boosts: { shield: 0, magnet: 0, headstart: 0 },
  tips: {},
  avatar: defaultAvatar(),
  ownedParts: [],
  pass: defaultPass(),
  passItems: [],
  tickets: 0,
  club: { expires: 0, lastRenewGrant: 0, lastDrip: 0 },
  adFree: { until: 0, videos: 0 },
});

export const emptyPassSeason = (): PassSeasonSave => ({ xp: 0, premium: false, free: [], prem: [] });
const defaultPass = (): PassSave => ({ season: -1, cur: emptyPassSeason(), history: {}, week: '', wprog: {}, wdone: [], mprog: {}, mdone: [], loginDay: 0, seen: [] });

function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = defaults();
      const o = JSON.parse(raw);
      const m = { ...d, ...o } as SaveData;
      // objetos aninhados: mescla para manter compatibilidade com saves antigos
      m.upgrades = { ...d.upgrades, ...(o && o.upgrades) };
      m.boosts = { ...d.boosts, ...(o && o.boosts) };
      m.tips = { ...(o && o.tips) };
      const da = defaultAvatar();
      const oa = (o && o.avatar) || {};
      m.avatar = { parts: { ...da.parts, ...oa.parts }, colors: { ...da.colors, ...oa.colors } };
      m.ownedParts = Array.isArray(o?.ownedParts) ? o.ownedParts : [];
      m.pass = { ...defaultPass(), ...(o && o.pass) };
      m.pass.cur = { ...emptyPassSeason(), ...m.pass.cur };
      m.passItems = Array.isArray(o?.passItems) ? o.passItems : [];
      m.club = { expires: 0, lastRenewGrant: 0, lastDrip: 0, ...(o && o.club) };
      m.adFree = { until: 0, videos: 0, ...(o && o.adFree) };
      if (!m.ownedSkins.includes('custom')) m.ownedSkins.push('custom');
      return m;
    }
  } catch {
    /* storage indisponível */
  }
  return defaults();
}

export const save: SaveData = load();

let pending = 0;
export function persist(): void {
  if (pending) return;
  pending = window.setTimeout(() => {
    pending = 0;
    try {
      localStorage.setItem(KEY, JSON.stringify(save));
    } catch {
      /* ignora */
    }
  }, 50);
}

export function persistNow(): void {
  if (pending) {
    clearTimeout(pending);
    pending = 0;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* ignora */
  }
}

/** Dia local como número (para diário e missões). */
export const dayNumber = (d = new Date()): number => Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
