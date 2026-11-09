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
  /** Bichinhos colecionáveis obtidos (ids 'sNN-raridade', ver creatures/catalog.ts). */
  creatures: string[];
  /** Bichinhos ainda não vistos na Coleção (badge). */
  creaturesNew: string[];
  /** Companheiro equipado nos minigames ('' = nenhum). */
  companion: string;
  /** Bichinho usado como foto de perfil ('' = avatar padrão). */
  profileCreature: string;
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
  creatures: [],
  creaturesNew: [],
  companion: '',
  profileCreature: '',
});

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
      m.creatures = Array.isArray(o?.creatures) ? o.creatures : [];
      m.creaturesNew = Array.isArray(o?.creaturesNew) ? o.creaturesNew : [];
      if (typeof m.companion !== 'string') m.companion = '';
      if (typeof m.profileCreature !== 'string') m.profileCreature = '';
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
