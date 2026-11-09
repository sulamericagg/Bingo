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
}

const defaults = (): SaveData => ({
  coins: 0,
  gems: 10,
  best: 0,
  runs: 0,
  skin: 'bloop',
  trail: 'spark',
  ownedSkins: ['bloop'],
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
