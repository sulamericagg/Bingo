import { BOOST_PACKS, ECONOMY, UPGRADES } from '../config';
import { SKINS, TRAILS, type Price } from '../game/skins';
import { bus } from './events';
import { dayNumber, persist, save, type Mission, type MissionType, type SaveData } from './storage';

export function addCoins(n: number): void {
  save.coins = Math.max(0, save.coins + Math.round(n));
  persist();
  bus.emit('wallet');
}

export function addGems(n: number): void {
  save.gems = Math.max(0, save.gems + Math.round(n));
  persist();
  bus.emit('wallet');
}

export function canAfford(p: Price): boolean {
  if (p.coins) return save.coins >= p.coins;
  if (p.gems) return save.gems >= p.gems;
  return false;
}

export function spend(p: Price): boolean {
  if (!canAfford(p)) return false;
  if (p.coins) addCoins(-p.coins);
  if (p.gems) addGems(-p.gems);
  return true;
}

export function ownsSkin(id: string): boolean {
  return save.ownedSkins.includes(id);
}
export function ownsTrail(id: string): boolean {
  return save.ownedTrails.includes(id);
}

export function unlockSkin(id: string): void {
  if (!ownsSkin(id)) save.ownedSkins.push(id);
  persist();
  bus.emit('inventory');
}
export function unlockTrail(id: string): void {
  if (!ownsTrail(id)) save.ownedTrails.push(id);
  persist();
  bus.emit('inventory');
}

/* ---------------- Diário ---------------- */

export function dailyAvailable(): boolean {
  return save.dailyDay !== dayNumber();
}

/** Índice (0..6) do prêmio de hoje. */
export function dailyIndex(): number {
  const today = dayNumber();
  const continues = save.dailyDay === today - 1;
  const streak = continues ? save.dailyStreak : 0;
  return streak % 7;
}

export function claimDaily(mult = 1): { coins: number; gems: number } {
  const today = dayNumber();
  const idx = dailyIndex();
  const r = ECONOMY.dailyRewards[idx];
  const coins = (r.coins ?? 0) * mult;
  const gems = (r.gems ?? 0) * mult;
  save.dailyStreak = idx + 1;
  save.dailyDay = today;
  addCoins(coins);
  addGems(gems);
  return { coins, gems };
}

/* ---------------- Missões ---------------- */

const MISSION_POOL: { type: MissionType; targets: number[]; reward: number[] }[] = [
  { type: 'planets', targets: [25, 60, 120], reward: [60, 120, 220] },
  { type: 'coins', targets: [40, 100, 200], reward: [50, 110, 200] },
  { type: 'perfects', targets: [5, 15, 30], reward: [70, 140, 250] },
  { type: 'score', targets: [15, 30, 50], reward: [80, 160, 300] },
  { type: 'runs', targets: [3, 6, 10], reward: [40, 80, 140] },
];

export function ensureMissions(): Mission[] {
  const today = dayNumber();
  if (save.missionsDay !== today || save.missions.length !== 3) {
    const pool = [...MISSION_POOL].sort(() => Math.random() - 0.5).slice(0, 3);
    save.missions = pool.map((m, i) => ({ type: m.type, target: m.targets[i], progress: 0, reward: m.reward[i], claimed: false }));
    save.missionsDay = today;
    persist();
  }
  return save.missions;
}

export function trackMission(type: MissionType, value: number, absolute = false): void {
  let changed = false;
  for (const m of ensureMissions()) {
    if (m.type !== type || m.claimed) continue;
    const before = m.progress;
    m.progress = Math.min(m.target, absolute ? Math.max(m.progress, value) : m.progress + value);
    if (before < m.target && m.progress >= m.target) bus.emit('mission-done', m);
    changed = true;
  }
  if (changed) {
    persist();
    bus.emit('missions');
  }
}

export function claimMission(i: number): number {
  const m = save.missions[i];
  if (!m || m.claimed || m.progress < m.target) return 0;
  m.claimed = true;
  addCoins(m.reward);
  bus.emit('missions');
  return m.reward;
}

export function missionsReady(): number {
  return ensureMissions().filter((m) => !m.claimed && m.progress >= m.target).length;
}

export function itemsAffordable(): number {
  return [...SKINS.filter((s) => !ownsSkin(s.id)), ...TRAILS.filter((t) => !ownsTrail(t.id))].filter((i) => canAfford(i.price)).length;
}

/* ---------------- Vantagens permanentes (fora do SaveData base) ---------------- */

/**
 * Campos extras guardados no mesmo save (o load faz merge raso, então campos
 * desconhecidos sobrevivem ao JSON). Mantidos aqui para não mexer no formato base.
 */
interface SaveExtra {
  /** dobrador de moedas (compra coin_doubler ou vip_pack) */
  coinDoubler?: boolean;
  /** comprou o VIP */
  vip?: boolean;
  /** dia (dayNumber) da última compra da oferta relâmpago */
  flashDay?: number;
  /** dia em que o popup do Pacote Inicial apareceu */
  starterPopupDay?: number;
}
export const extra = save as SaveData & SaveExtra;

export const hasCoinDoubler = (): boolean => !!extra.coinDoubler;

/* ---------------- Melhorias ---------------- */

export type UpgradeId = 'magnet' | 'shield' | 'coinValue';
export const UPGRADE_IDS: UpgradeId[] = ['magnet', 'shield', 'coinValue'];

export const upgradeLevel = (id: UpgradeId): number => Math.max(0, Math.min(UPGRADES.maxLevel, save.upgrades?.[id] ?? 0));

/** Preço do próximo nível (null se já está no máximo). */
export function upgradeCost(id: UpgradeId): { coins: number; gems: number } | null {
  const lv = upgradeLevel(id);
  if (lv >= UPGRADES.maxLevel) return null;
  return { coins: UPGRADES.coinCost[lv], gems: UPGRADES.gemCost[lv] };
}

/** Compra o próximo nível com moedas ou gemas. */
export function buyUpgrade(id: UpgradeId, currency: 'coins' | 'gems'): boolean {
  const c = upgradeCost(id);
  if (!c) return false;
  if (!spend(currency === 'coins' ? { coins: c.coins } : { gems: c.gems })) return false;
  save.upgrades[id] = upgradeLevel(id) + 1;
  persist();
  bus.emit('upgrades');
  return true;
}

/** Efeitos (iguais aos usados no jogo — game.ts lê save.upgrades). */
export const UPGRADE_FX = {
  /** game.ts: raio de atração 44 + 12/nível */
  magnetPct: (lv: number) => Math.round(((lv * 12) / 44) * 100),
  /** UI: chance de começar a corrida com escudo */
  shieldStartPct: (lv: number) => lv * 10,
  /** game.ts: invencibilidade extra após o escudo quebrar */
  shieldInv: (lv: number) => lv * 0.25,
  /** game.ts: cada moeda vale 1 + 0,2/nível */
  coinPct: (lv: number) => lv * 20,
};

/* ---------------- Consumíveis ---------------- */

export type BoostId = 'shield' | 'magnet' | 'headstart';
export const BOOST_IDS: BoostId[] = ['shield', 'magnet', 'headstart'];

export const boostCount = (id: BoostId): number => Math.max(0, save.boosts?.[id] ?? 0);

export function addBoosts(b: Partial<Record<BoostId, number>>): void {
  for (const id of BOOST_IDS) save.boosts[id] = boostCount(id) + Math.max(0, Math.floor(b[id] ?? 0));
  persist();
  bus.emit('boosts');
}

export function useBoost(id: BoostId): boolean {
  if (boostCount(id) <= 0) return false;
  save.boosts[id] = boostCount(id) - 1;
  persist();
  bus.emit('boosts');
  return true;
}

export function buyBoostPack(id: BoostId, currency: 'coins' | 'gems'): number {
  const pack = BOOST_PACKS[id][currency];
  if (!spend(currency === 'coins' ? { coins: pack.price } : { gems: pack.price })) return 0;
  addBoosts({ [id]: pack.n });
  return pack.n;
}

/* ---------------- Moedas da corrida ---------------- */

export interface RunCoins {
  /** moedas coletadas sem a melhoria */
  base: number;
  /** extra da melhoria Valor da moeda (já vem embutido nas moedas do jogo) */
  upgrade: number;
  /** extra do dobrador */
  doubler: number;
  total: number;
}

/**
 * O jogo JÁ aplica a melhoria "Valor da moeda" a cada moeda coletada
 * (game.ts: 1 + 0,2/nível), então `runCoins` (runStats.coins) já inclui esse bônus.
 * Aqui só separamos para mostrar e somamos o dobrador.
 */
export function runCoinBreakdown(runCoins: number): RunCoins {
  const mult = 1 + UPGRADE_FX.coinPct(upgradeLevel('coinValue')) / 100;
  const base = Math.min(runCoins, Math.round(runCoins / mult));
  const upgrade = runCoins - base;
  const doubler = hasCoinDoubler() ? runCoins : 0;
  return { base, upgrade, doubler, total: runCoins + doubler };
}
