/* Progresso do "Pouso Forçado" (localStorage 'bw-voo'). */
import { CABINS, LIVERIES } from './data';

export interface VooSave {
  v: 1;
  best: number;
  stars: number;
  /** melhores estrelas por modo (normal/diário) */
  flights: number;
  landings: number;
  perfects: number;
  crashes: number;
  livery: string;
  cabin: string;
  bots: number;
  /** último papel escolhido (0..3) */
  role: number;
  mode: '' | '2d' | '3d';
  daily: { day: number; best: number; stars: number };
  seenIntro: boolean;
  tutDone: boolean;
}
const KEY = 'bw-voo';

export function freshSave(): VooSave {
  return { v: 1, best: 0, stars: 0, flights: 0, landings: 0, perfects: 0, crashes: 0, livery: 'classic', cabin: 'classic', bots: 3, role: 0, mode: '', daily: { day: 0, best: 0, stars: 0 }, seenIntro: false, tutDone: false };
}
export function loadSave(): VooSave {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw) as Partial<VooSave>;
      if (o && o.v === 1) return { ...freshSave(), ...o, daily: { ...freshSave().daily, ...(o.daily ?? {}) } };
    }
  } catch {
    /* */
  }
  return freshSave();
}
export function writeSave(s: VooSave): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* */
  }
}
export function dayIndex(d = new Date()): number {
  return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(2026, 0, 1)) / 86400000);
}
export const liveryOf = (s: VooSave) => LIVERIES.find((l) => l.id === s.livery && s.stars >= l.stars) ?? LIVERIES[0];
export const cabinOf = (s: VooSave) => CABINS.find((c) => c.id === s.cabin && s.perfects >= c.perfect) ?? CABINS[0];
