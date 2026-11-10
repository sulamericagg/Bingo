/* COZINHA MALUCA — progresso (localStorage 'bw-cozinha', aditivo e tolerante). */
import { emptyUps, type Role, type UpId } from './data';

export interface CzSave {
  v: 1;
  day: number;
  cash: number;
  ups: Record<UpId, number>;
  packs: number[];
  staff: Role[];
  mode: '2d' | '3d' | '';
  bestDay: number;
  bestCash: number;
  dishes: number;
  days: number;
  stars: Record<string, number>;
  code: string;
  /** campanha: estrelas por fase (1..60) */
  lvStars: Record<string, number>;
  /** campanha: melhor caixa por fase */
  lvBest: Record<string, number>;
  /** treino guiado já visto (ou pulado) */
  tutDone: boolean;
  /** dica de "toque no ajudante" já vista */
  petTut: boolean;
  /** jogar sozinho (sem ajudantes) */
  solo: boolean;
  /** desafio diário: chave do dia, melhor caixa e estrelas */
  daily: { key: string; best: number; stars: number; streak: number; last: string };
}
const KEY = 'bw-cozinha';
let cache: CzSave | null = null;

function fresh(): CzSave {
  return { v: 1, day: 1, cash: 0, ups: emptyUps(), packs: [0], staff: [], mode: '', bestDay: 0, bestCash: 0, dishes: 0, days: 0, stars: {}, code: '', lvStars: {}, lvBest: {}, tutDone: false, petTut: false, solo: false, daily: { key: '', best: 0, stars: 0, streak: 0, last: '' } };
}
export function czSave(): CzSave {
  if (cache) return cache;
  const s = fresh();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw) as Partial<CzSave>;
      Object.assign(s, o);
      s.ups = { ...emptyUps(), ...(o.ups ?? {}) };
      if (!Array.isArray(s.packs) || !s.packs.includes(0)) s.packs = [0, ...(Array.isArray(s.packs) ? s.packs : [])];
      if (!Array.isArray(s.staff)) s.staff = [];
      if (typeof s.stars !== 'object' || !s.stars) s.stars = {};
      if (typeof s.lvStars !== 'object' || !s.lvStars) s.lvStars = {};
      if (typeof s.lvBest !== 'object' || !s.lvBest) s.lvBest = {};
      if (typeof s.daily !== 'object' || !s.daily) s.daily = fresh().daily;
      // quem já jogava a versão antiga (dias) não precisa ver o treino de novo
      if (o.tutDone === undefined && (s.days ?? 0) > 2) s.tutDone = true;
    }
  } catch {
    /* save corrompido: começa de novo */
  }
  cache = s;
  return s;
}
export function persistCz(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(czSave()));
  } catch {
    /* sem espaço */
  }
}
