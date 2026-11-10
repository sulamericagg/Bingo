/* ============================================================
 *  CASA 3D · ATIVIDADES — dados salvos (localStorage próprio, à parte
 *  do save principal): livro de receitas, limite diário de moedas,
 *  necessidades, horta, plantas regadas, cama, roupa.
 *  Tudo protegido por try/catch: sem storage o jogo funciona igual.
 * ============================================================ */
import { addCoins } from '../../core/economy';
import { dayNumber, persist, save } from '../../core/storage';

const KEY = 'bloop-casa-ativ-v1';
export interface Plot {
  seed: string | null;
  planted: number;
  watered: number;
}
export interface ActSave {
  book: Record<string, { stars: number; n: number }>;
  dishes: number;
  coinDay: number;
  coinToday: number;
  petDay: number;
  petToday: number;
  needs: { food: number; hyg: number; energy: number; fun: number; t: number };
  plots: Plot[];
  /** chave da planta (cômodo#índice) → dia em que foi regada */
  plants: Record<string, number>;
  /** dia em que a cama foi arrumada */
  bedDay: number;
  /** dia em que a roupa suja apareceu */
  clothesDay: number;
  funny: number;
}
const fresh = (): ActSave => ({
  book: {},
  dishes: 0,
  coinDay: 0,
  coinToday: 0,
  petDay: 0,
  petToday: 0,
  needs: { food: 70, hyg: 75, energy: 80, fun: 60, t: Date.now() },
  plots: [0, 1, 2].map(() => ({ seed: null, planted: 0, watered: 0 })),
  plants: {},
  bedDay: 0,
  clothesDay: 0,
  funny: 0,
});
function load(): ActSave {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = { ...fresh(), ...(JSON.parse(raw) as Partial<ActSave>) };
      if (!Array.isArray(s.plots) || s.plots.length !== 3) s.plots = fresh().plots;
      return s;
    }
  } catch {
    /* */
  }
  return fresh();
}
export const AS: ActSave = load();
let tm = 0;
export function saveAct(): void {
  clearTimeout(tm);
  tm = window.setTimeout(flushAct, 400);
}
export function flushAct(): void {
  clearTimeout(tm);
  try {
    localStorage.setItem(KEY, JSON.stringify(AS));
  } catch {
    /* */
  }
}
export const today = () => dayNumber();

/** moedas da casa com limite diário */
export const COIN_CAP = 80;
export function reward(n: number): number {
  const d = today();
  if (AS.coinDay !== d) (AS.coinDay = d), (AS.coinToday = 0);
  const give = Math.max(0, Math.min(n, COIN_CAP - AS.coinToday));
  if (give > 0) {
    AS.coinToday += give;
    addCoins(give);
    saveAct();
  }
  return give;
}
/** guarda comida na despensa do bichinho (até 3 por dia) */
export function giveToPet(food: string): boolean {
  const d = today();
  if (AS.petDay !== d) (AS.petDay = d), (AS.petToday = 0);
  if (AS.petToday >= 3) return false;
  AS.petToday++;
  try {
    save.pet.pantry[food] = (save.pet.pantry[food] ?? 0) + 1;
    persist();
  } catch {
    return false;
  }
  saveAct();
  return true;
}
/** desgaste das necessidades em tempo real (100 → 0 em ~2–3 h) */
export function decayNeeds(now = Date.now()): void {
  const n = AS.needs;
  const min = Math.max(0, Math.min(600, (now - n.t) / 60000));
  n.t = now;
  n.food = Math.max(0, n.food - min * 0.7);
  n.hyg = Math.max(0, n.hyg - min * 0.45);
  n.energy = Math.max(0, n.energy - min * 0.4);
  n.fun = Math.max(0, n.fun - min * 0.8);
}
export function bump(k: keyof Omit<ActSave['needs'], 't'>, v: number): void {
  AS.needs[k] = Math.max(0, Math.min(100, AS.needs[k] + v));
  saveAct();
}
