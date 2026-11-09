/* Progresso persistente do "Lenhadores do Bosque" (localStorage 'bw-floresta'). */
import type { MachineId, HelperId } from './data';

export interface FlorestaSave {
  v: 1;
  bolotas: number;
  planks: number;
  /** valor médio guardado por tábua (bolotas) */
  plankVal: number;
  tool: number;
  vehicle: number;
  mach: Record<MachineId, number>;
  help: Record<HelperId, number>;
  /** quantos biomas abertos (1 = só o Bosque Inicial) */
  unlocked: number;
  seeds: number;
  /** bolotas ganhas desde a última renovação */
  earnedRun: number;
  totalEarned: number;
  trees: number;
  planksMade: number;
  rares: number;
  renewals: number;
  mode: '' | '2d' | '3d';
  cam: 'third' | 'first';
  tutorial: number;
}

const KEY = 'bw-floresta';

export function freshSave(): FlorestaSave {
  return {
    v: 1, bolotas: 0, planks: 0, plankVal: 0, tool: 0, vehicle: 0,
    mach: { saw: 0, planer: 0, belt: 0, nursery: 0 },
    help: { bots: 0, drones: 0, planters: 0 },
    unlocked: 1, seeds: 0, earnedRun: 0, totalEarned: 0, trees: 0, planksMade: 0, rares: 0, renewals: 0,
    mode: '', cam: 'third', tutorial: 0,
  };
}

export function loadSave(): FlorestaSave {
  const d = freshSave();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object') return d;
    const num = (v: unknown, def: number) => (typeof v === 'number' && Number.isFinite(v) ? v : def);
    for (const k of Object.keys(d) as (keyof FlorestaSave)[]) {
      const dv = d[k];
      if (typeof dv === 'number') (d as any)[k] = num(o[k], dv);
      else if (typeof dv === 'string' && typeof o[k] === 'string') (d as any)[k] = o[k];
    }
    for (const k of Object.keys(d.mach) as MachineId[]) d.mach[k] = num(o.mach?.[k], 0);
    for (const k of Object.keys(d.help) as HelperId[]) d.help[k] = num(o.help?.[k], 0);
    if (d.cam !== 'first') d.cam = 'third';
    if (d.mode !== '2d' && d.mode !== '3d') d.mode = '';
  } catch {
    /* save corrompido: começa do zero */
  }
  return d;
}

export function writeSave(s: FlorestaSave): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* sem armazenamento */
  }
}
