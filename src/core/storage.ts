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
  /** Bichinho virtual "Casa do Bloop" (src/pet). */
  pet: PetSave;
}

/** Estado do bichinho virtual (ver src/pet/state.ts). Status 0..100. */
export interface PetSave {
  food: number;
  clean: number;
  fun: number;
  energy: number;
  /** XP total de cuidado (o nível é derivado) */
  xp: number;
  /** maior nível já alcançado (desbloqueios cosméticos não se perdem) */
  bestLevel: number;
  /** último instante (ms) em que o desgaste foi calculado */
  last: number;
  /** comidas guardadas na despensa: id -> quantidade */
  pantry: Record<string, number>;
  /** decoração equipada */
  decor: { wall: string; floor: string; items: string[] };
  /** itens de decoração comprados */
  owned: string[];
  /** anúncios assistidos por item de decoração */
  adViews: Record<string, number>;
  /** já explicamos e pedimos permissão de notificação */
  notifAsked: boolean;
  notifOn: boolean;
  /** brilho do polimento até (ms) */
  shineUntil: number;
  /** limite diário de XP (anti-farm) */
  xpDay: number;
  xpToday: number;
}

export const defaultPet = (): PetSave => ({
  food: 80,
  clean: 70,
  fun: 75,
  energy: 90,
  xp: 0,
  bestLevel: 1,
  last: Date.now(),
  pantry: { cookie: 3, apple: 2 },
  decor: { wall: 'wp_dots', floor: 'fl_wood', items: [] },
  owned: ['wp_dots', 'fl_wood'],
  adViews: {},
  notifAsked: false,
  notifOn: false,
  shineUntil: 0,
  xpDay: 0,
  xpToday: 0,
});

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
  pet: defaultPet(),
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
      const dp = defaultPet();
      const op = (o && o.pet) || {};
      m.pet = { ...dp, ...op, pantry: { ...(op.pantry ?? dp.pantry) }, adViews: { ...op.adViews }, decor: { ...dp.decor, ...op.decor } };
      if (!Array.isArray(m.pet.owned)) m.pet.owned = dp.owned;
      if (!Array.isArray(m.pet.decor.items)) m.pet.decor.items = [];
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
