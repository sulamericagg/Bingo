/* ANOMALIAS — progresso local (localStorage 'bw-anomalias', aditivo e tolerante). */
import { NIGHTS, type Diff } from './data';

export interface MapRec {
  /** maior noite concluída (0 = nenhuma) */
  done: number;
  /** estrelas por noite (índice 1..5) */
  stars: number[];
}
export interface AnoSave {
  v: 1;
  diff: Diff;
  maps: Record<string, MapRec>;
  runs: number;
  photos: number;
  caught: number;
  voice: boolean;
  /** já viu a explicação do caderno / câmera */
  tut: { photo?: boolean; notebook?: boolean; monitor?: boolean };
}
const KEY = 'bw-anomalias';
let cache: AnoSave | null = null;
const fresh = (): AnoSave => ({ v: 1, diff: 'facil', maps: {}, runs: 0, photos: 0, caught: 0, voice: true, tut: {} });

export function anoSave(): AnoSave {
  if (cache) return cache;
  const s = fresh();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw) as Partial<AnoSave>;
      Object.assign(s, o);
      if (!s.maps || typeof s.maps !== 'object') s.maps = {};
      if (!s.tut || typeof s.tut !== 'object') s.tut = {};
      if (s.diff !== 'facil' && s.diff !== 'normal' && s.diff !== 'dificil') s.diff = 'facil';
    }
  } catch {
    /* save corrompido: começa de novo */
  }
  cache = s;
  return s;
}
export function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(anoSave()));
  } catch {
    /* sem espaço */
  }
}
export function mapRec(id: string): MapRec {
  const s = anoSave();
  const r = (s.maps[id] ??= { done: 0, stars: [] });
  if (!Array.isArray(r.stars)) r.stars = [];
  return r;
}
export const nightUnlocked = (map: string, n: number): boolean => n <= 1 || mapRec(map).done >= n - 1;
export function recordNight(map: string, n: number, stars: number): void {
  const r = mapRec(map);
  r.done = Math.max(r.done, Math.min(NIGHTS, n));
  r.stars[n] = Math.max(r.stars[n] ?? 0, stars);
  persist();
}
export function totalNights(): number {
  let n = 0;
  for (const k in anoSave().maps) n += mapRec(k).done;
  return n;
}
export function totalStars(map: string): number {
  return mapRec(map).stars.reduce((a, b) => a + (b ?? 0), 0);
}
/** mapa i (ordem do menu) libera com 2·i noites concluídas no total */
export const mapUnlocked = (index: number): boolean => index === 0 || totalNights() >= index * 2;
