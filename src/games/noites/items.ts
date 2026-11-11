/* ============================================================
 *  NOITES — inventário em espaços (barra + mochila + sacos).
 *  Puro (sem DOM/three). Ferramentas SÃO itens: o que está na
 *  mão é o espaço selecionado da barra.
 * ============================================================ */
import { BAG_BASE, HOT, ITEM, RES, type Res } from './data';

export interface Stack {
  id: string;
  n: number;
}
export type Slots = (Stack | null)[];

/** quanto cabe em um espaço */
const STACK_RES: Record<Res, number> = { wood: 4, twig: 10, stone: 8, scrap: 10, fiber: 15, spark: 25, berry: 15, mush: 10, apple: 10, carrot: 8, pumpkin: 3, coal: 10, fuel: 5, battery: 5, sap: 6, seed: 12 };
export function stackMax(id: string): number {
  const r = STACK_RES[id as Res];
  if (r) return r;
  const d = ITEM[id];
  if (!d) return 1;
  if (d.axe || d.lamp || d.bonk || d.wear) return 1;
  return 5;
}
export const isRes = (id: string): id is Res => (RES as string[]).includes(id);

/** tipo do que está na mão (para ação, vista e animação) */
export type HeldKind = 'none' | 'axe' | 'lamp' | 'bonk' | 'place' | 'flare' | 'food' | 'res';
export function heldKind(id: string | undefined): HeldKind {
  if (!id) return 'none';
  const d = ITEM[id];
  if (!d) return isRes(id) ? 'res' : 'none';
  if (d.axe) return 'axe';
  if (d.lamp) return 'lamp';
  if (d.bonk) return 'bonk';
  if (d.place) return 'place';
  if (d.throwLight) return 'flare';
  if (d.food) return 'food';
  return 'none';
}

/** espaços totais (barra + mochila base + saco) */
export function capSlots(back: string | undefined, bot = false): number {
  if (bot) return HOT;
  return HOT + BAG_BASE + (back ? ITEM[back]?.wear?.slots ?? 0 : 0);
}
export function fitSlots(sl: Slots, n: number): Slots {
  while (sl.length < n) sl.push(null);
  return sl;
}

export function countOf(sl: Slots, id: string): number {
  let n = 0;
  for (const s of sl) if (s && s.id === id) n += s.n;
  return n;
}
/** cabe quanto de `id` (até `cap` espaços) */
export function roomFor(sl: Slots, id: string, cap: number): number {
  const m = stackMax(id);
  let r = 0;
  for (let i = 0; i < cap; i++) {
    const s = sl[i];
    if (!s) r += m;
    else if (s.id === id) r += Math.max(0, m - s.n);
  }
  return r;
}
/** põe `n` de `id`: completa pilhas, depois espaços vazios (barra primeiro). Devolve o que sobrou. */
export function addTo(sl: Slots, id: string, n: number, cap: number, prefer = -1): number {
  const m = stackMax(id);
  fitSlots(sl, cap);
  if (prefer >= 0 && prefer < cap) {
    const s = sl[prefer];
    if (s && s.id === id && s.n < m) {
      const k = Math.min(n, m - s.n);
      s.n += k;
      n -= k;
    }
  }
  for (let i = 0; i < cap && n > 0; i++) {
    const s = sl[i];
    if (s && s.id === id && s.n < m) {
      const k = Math.min(n, m - s.n);
      s.n += k;
      n -= k;
    }
  }
  for (let i = 0; i < cap && n > 0; i++) {
    if (sl[i]) continue;
    const k = Math.min(n, m);
    sl[i] = { id, n: k };
    n -= k;
  }
  return n;
}
/** tira até `n` de `id` (mochila primeiro, mão por último). Devolve quanto tirou. */
export function takeFrom(sl: Slots, id: string, n: number): number {
  let got = 0;
  for (let i = sl.length - 1; i >= 0 && got < n; i--) {
    const s = sl[i];
    if (!s || s.id !== id) continue;
    const k = Math.min(n - got, s.n);
    s.n -= k;
    got += k;
    if (s.n <= 0) sl[i] = null;
  }
  return got;
}
export function usedSlots(sl: Slots): number {
  let n = 0;
  for (const s of sl) if (s) n++;
  return n;
}
/** melhor machado entre os espaços (força) */
export function bestAxe(sl: Slots): { i: number; pow: number; cd: number } {
  let b = { i: -1, pow: 0.5, cd: 0.6 };
  sl.forEach((s, i) => {
    const d = s && ITEM[s.id];
    if (d?.axe && d.axe > b.pow) b = { i, pow: d.axe, cd: d.cd ?? 0.5 };
  });
  return b;
}
/** compacta para rede/salvamento: [id, n] ou 0 */
export function packSlots(sl: Slots): (0 | [string, number])[] {
  return sl.map((s) => (s ? [s.id, s.n] : 0));
}
export function unpackSlots(a: unknown): Slots {
  if (!Array.isArray(a)) return [];
  return a.map((r) => (Array.isArray(r) && typeof r[0] === 'string' && (ITEM[r[0]] || isRes(r[0])) && r[1] > 0 ? { id: r[0], n: Math.min(99, Math.floor(+r[1])) } : null));
}
