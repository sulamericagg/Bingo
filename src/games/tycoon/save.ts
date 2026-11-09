/* ============================================================
 *  Campo ADITIVO no save: save.tycoon (com padrões).
 *  Não altera a interface SaveData: o load() de storage.ts já preserva
 *  campos desconhecidos ({...defaults, ...salvo}) e o persist() os grava.
 * ============================================================ */
import { persist, save } from '../../core/storage';
import { IDLE_CAP_H, idleRate, type IdleUpg } from './data';

export interface TycoonSave {
  /** níveis da fábrica ociosa */
  lv: Record<IdleUpg, number>;
  /** última coleta (ms); 0 = fábrica ainda não inaugurada */
  last: number;
  matches: number;
  wins: number;
  best: number;
  diff: number; // dificuldade escolhida (0..2)
}

const defaults = (): TycoonSave => ({ lv: { drill: 0, polish: 0, belt: 0 }, last: 0, matches: 0, wins: 0, best: 0, diff: 1 });

export function tycoonSave(): TycoonSave {
  const s = save as unknown as { tycoon?: Partial<TycoonSave> };
  const d = defaults();
  const o = s.tycoon;
  if (!o || typeof o !== 'object') {
    s.tycoon = d;
    return d;
  }
  if (!o.lv) o.lv = d.lv;
  else o.lv = { ...d.lv, ...o.lv };
  for (const k of ['last', 'matches', 'wins', 'best', 'diff'] as const) if (typeof o[k] !== 'number') o[k] = d[k];
  return o as TycoonSave;
}

export const persistTycoon = (): void => persist();

/** Moedas acumuladas na Minha Fábrica (respeita o teto de 8h). */
export function idlePending(now = Date.now()): number {
  const s = tycoonSave();
  if (!s.last) return 0;
  const h = Math.min(IDLE_CAP_H, Math.max(0, (now - s.last) / 3600000));
  return Math.floor(h * idleRate(s.lv));
}

/** 0..1 do teto de 8h */
export function idleFill(now = Date.now()): number {
  const s = tycoonSave();
  if (!s.last) return 0;
  return Math.min(1, Math.max(0, (now - s.last) / (IDLE_CAP_H * 3600000)));
}
