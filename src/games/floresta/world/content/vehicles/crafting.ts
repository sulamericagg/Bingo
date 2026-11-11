/* ============================================================
 *  VEÍCULOS DO MUNDO — fabricar peças e montar (consome inventário).
 *  O inventário é do motor; aqui só uma interface mínima.
 * ============================================================ */
import { VEH_RECIPES, PART, type Station, type VRecipe } from './parts';
import { analyze, bill, type VehicleDesign } from './design';

export interface VInventory {
  count(id: string): number;
  take(id: string, n: number): boolean;
  give(id: string, n: number): void;
}

/** estações que valem aqui (a oficina também faz o que a bancada faz) */
export function stationOk(need: Station, here: Station): boolean {
  if (need === here) return true;
  if (here === 'oficina') return need === 'bancada' || need === 'mao';
  if (here === 'bancada') return need === 'mao';
  return false;
}
export function recipeFor(out: string): VRecipe | undefined {
  return VEH_RECIPES.find((r) => r.out === out);
}
/** quantas vezes dá para fabricar agora */
export function craftable(r: VRecipe, inv: VInventory, here: Station): number {
  if (!stationOk(r.st, here)) return 0;
  let n = Infinity;
  for (const [id, k] of r.ing) n = Math.min(n, Math.floor(inv.count(id) / k));
  return n === Infinity ? 0 : n;
}
export function craft(r: VRecipe, inv: VInventory, here: Station, times = 1): number {
  const n = Math.min(times, craftable(r, inv, here));
  for (let i = 0; i < n; i++) {
    for (const [id, k] of r.ing) inv.take(id, k);
    inv.give(r.out, r.n);
  }
  return n;
}
/** peças que faltam para montar o projeto */
export function missingParts(d: VehicleDesign, inv: VInventory): Map<string, number> {
  const m = new Map<string, number>();
  for (const [id, n] of bill(d)) {
    const have = inv.count(id);
    if (have < n) m.set(id, n - have);
  }
  return m;
}
/** fabrica (na estação) tudo que falta, se houver material; devolve o que ainda falta */
export function craftMissing(d: VehicleDesign, inv: VInventory, here: Station): Map<string, number> {
  for (const [id, n] of missingParts(d, inv)) {
    const r = recipeFor(id);
    if (r) craft(r, inv, here, Math.ceil(n / r.n));
  }
  return missingParts(d, inv);
}
/** consome as peças do projeto (válido e completo). false = falta algo */
export function assemble(d: VehicleDesign, inv: VInventory): boolean {
  if (!analyze(d).ok || missingParts(d, inv).size) return false;
  for (const [id, n] of bill(d)) inv.take(id, n);
  return true;
}
/** desmonta: devolve as peças */
export function disassemble(d: VehicleDesign, inv: VInventory): void {
  for (const [id, n] of bill(d)) if (PART.has(id)) inv.give(id, n);
}
/** inventário simples em memória (testes, página de depuração) */
export class MemInventory implements VInventory {
  readonly m = new Map<string, number>();
  count(id: string): number {
    return this.m.get(id) ?? 0;
  }
  take(id: string, n: number): boolean {
    const h = this.count(id);
    if (h < n) return false;
    if (h === n) this.m.delete(id);
    else this.m.set(id, h - n);
    return true;
  }
  give(id: string, n: number): void {
    this.m.set(id, this.count(id) + n);
  }
}
