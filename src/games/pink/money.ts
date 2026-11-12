/* ============================================================
 *  BLOOP PINK — dinheiro de verdade: gaveta do caixa (notas e moedas contadas),
 *  conta no banco (cartão/Pix caem direto), malote para depositar e kit de troco.
 *  Tudo em CENTAVOS inteiros (sem erro de vírgula).
 * ============================================================ */

/** notas e moedas da gaveta (centavos), da maior para a menor */
export const DENOMS = [10000, 5000, 2000, 1000, 500, 200, 100, 50, 25, 10];
export const isCoin = (c: number) => c <= 100;
export type Drawer = Record<string, number>;

export const cents = (v: number) => Math.round(v * 100);
export const reais = (c: number) => c / 100;

/** troco inicial (fundo de caixa) de uma loja nova */
export function startFloat(): Drawer {
  return { 1000: 2, 500: 4, 200: 5, 100: 5, 50: 6, 25: 6, 10: 8 };
}
export function drawerTotal(d: Drawer): number {
  let s = 0;
  for (const k of DENOMS) s += (d[k] ?? 0) * k;
  return s;
}
export function addTo(d: Drawer, c: number, n = 1): void {
  d[c] = (d[c] ?? 0) + n;
}
/** dá para montar `c` centavos com o que tem na gaveta? (devolve as peças ou null) */
export function makeChange(d: Drawer, c: number): number[] | null {
  if (c <= 0) return [];
  // DP limitado (c até ~200 reais = 20000 centavos em passos de 5)
  const step = 5;
  const n = Math.round(c / step);
  if (n > 8000) return greedy(d, c);
  const prev = new Int32Array(n + 1).fill(-2);
  const used = new Int32Array(n + 1);
  prev[0] = -1;
  for (const k of DENOMS) {
    const kk = k / step;
    const have = d[k] ?? 0;
    if (!have) continue;
    // cada denominação: até `have` vezes (de trás para frente, uma cópia por vez)
    for (let t = 0; t < have; t++) {
      let changed = false;
      for (let v = n; v >= kk; v--) {
        if (prev[v] === -2 && prev[v - kk] !== -2) {
          prev[v] = v - kk;
          used[v] = k;
          changed = true;
        }
      }
      if (!changed) break;
    }
  }
  if (prev[n] === -2) return null;
  const out: number[] = [];
  for (let v = n; v > 0; v = prev[v]) out.push(used[v]);
  return out.sort((a, b) => b - a);
}
function greedy(d: Drawer, c: number): number[] | null {
  const out: number[] = [];
  let r = c;
  for (const k of DENOMS) {
    let have = d[k] ?? 0;
    while (r >= k && have > 0) {
      r -= k;
      have--;
      out.push(k);
    }
  }
  return r === 0 ? out : null;
}
/** a nota com que o cliente paga (redonda, acima do total) — às vezes paga "trocado" certinho */
export function customerNote(total: number): number[] {
  const notes = [200, 500, 1000, 2000, 5000, 10000, 20000];
  if (Math.random() < 0.12) {
    // paga com notas menores que dão quase certinho
    const out: number[] = [];
    let r = total;
    for (const k of [10000, 5000, 2000, 1000, 500, 200, 100]) while (r >= k) (r -= k), out.push(k);
    if (r > 0) out.push(100);
    return out;
  }
  const n = notes.find((v) => v >= total && v - total < v * 0.92) ?? Math.ceil(total / 1000) * 1000;
  return [n === total ? n + 500 : n];
}
/** separa o malote: notas grandes vão para o banco, fica o fundo de troco (moedas e notas pequenas) */
export function takeBag(d: Drawer): number {
  let v = 0;
  for (const k of DENOMS) {
    if (k < 1000) continue;
    const keep = k === 1000 ? Math.min(2, d[k] ?? 0) : 0;
    const n = (d[k] ?? 0) - keep;
    if (n > 0) {
      v += n * k;
      d[k] = keep;
    }
  }
  return v;
}
/** kit de troco do banco: moedas e notas pequenas */
export const CHANGE_KIT: [number, number][] = [
  [500, 4],
  [200, 6],
  [100, 10],
  [50, 10],
  [25, 10],
  [10, 10],
];
export const CHANGE_KIT_VALUE = CHANGE_KIT.reduce((a, [k, n]) => a + k * n, 0);
/** risco de assalto/arrombamento (0..1 por evento) */
export function robberyRisk(tillCents: number, day: number, sec: number, guards: number, late: number): number {
  if (day < 4) return 0;
  const cash = Math.min(1, tillCents / 300000);
  let r = cash * 0.22 + late * 0.06;
  r *= Math.max(0, 1 - sec * 0.1);
  r *= Math.pow(0.35, guards);
  return Math.min(0.3, r);
}
/** níveis de segurança (câmeras, alarme, cofre, carro-forte) */
export const SECURITY = [
  { price: 0, lvl: 1 },
  { price: 600, lvl: 4 },
  { price: 1200, lvl: 6 },
  { price: 2200, lvl: 8 },
  { price: 3600, lvl: 10 },
  { price: 5500, lvl: 12 },
  { price: 8000, lvl: 15 },
  { price: 11000, lvl: 18 },
  { price: 15000, lvl: 22 },
  { price: 20000, lvl: 26 },
  { price: 28000, lvl: 30 },
];
