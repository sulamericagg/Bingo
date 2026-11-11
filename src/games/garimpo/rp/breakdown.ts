/* ============================================================
 *  GARIMPO — ADAPTADOR DE QUEBRAS (eventos → minijogos de conserto).
 *  Os eventos ("pneu furado", "máquina quebrou"…) chamam triggerBreakdown() num lugar só.
 *  Se o módulo de consertos (repair/*) registrar o gancho com setBreakdownHook(), ele abre o
 *  minijogo; senão vale o comportamento simples do evento (tempo/dinheiro no cartão).
 *    setBreakdownHook((kind, target, done) => { repairs.open(kind, target, done); return true; })
 *  target: a Machine do garimpo ou o Rig da estrada (haul/rig.ts).
 * ============================================================ */
export type BreakKind = 'tire' | 'brakes' | 'electric' | 'part' | 'bushing';
export type BreakdownHook = (kind: BreakKind, target: unknown, done: (ok: boolean) => void) => boolean;

let hook: BreakdownHook | null = null;
export function setBreakdownHook(h: BreakdownHook | null): void {
  hook = h;
}
/** true = o módulo de consertos assumiu (abriu o minijogo) */
export function triggerBreakdown(kind: BreakKind, target: unknown, done: (ok: boolean) => void = () => {}): boolean {
  if (!hook) return false;
  try {
    return hook(kind, target, done);
  } catch (e) {
    console.warn('[garimpo] conserto', e);
    return false;
  }
}
