import { ECONOMY } from '../config';
import { SKINS, TRAILS, type Price } from '../game/skins';
import { bus } from './events';
import { dayNumber, persist, save, type Mission, type MissionType } from './storage';

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
