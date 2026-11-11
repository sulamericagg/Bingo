/* ============================================================
 *  NOITES · CONSTRUÇÃO — ADAPTADOR DE RECURSOS (arquivo único).
 *  Toda leitura/gasto/devolução de recursos da construção passa
 *  por aqui. Hoje: saco do jogador (p.bag) + estoque do acampamento
 *  (sim.stash). Quem migrar o inventário só precisa trocar ESTE
 *  arquivo (as funções recebem o Sim e o jogador).
 * ============================================================ */
import type { Res } from '../data';
import type { Player, Sim } from '../sim';
import type { Cost } from './pieces';

/** quanto o jogador tem de cada recurso para construir (saco + estoque do acampamento) */
export function have(s: Sim, p: Player | undefined, r: Res): number {
  return (p?.bag[r] ?? 0) + (s.stash[r] ?? 0);
}
/** dá para pagar? (`mul` = quantas vezes o custo) */
export function canAfford(s: Sim, p: Player | undefined, c: Cost, mul = 1): boolean {
  for (const k in c) if (have(s, p, k as Res) < (c[k as Res] ?? 0) * mul) return false;
  return true;
}
/** primeiro recurso que falta (para o ícone do motivo) */
export function missing(s: Sim, p: Player | undefined, c: Cost, mul = 1): Res | null {
  for (const k in c) if (have(s, p, k as Res) < (c[k as Res] ?? 0) * mul) return k as Res;
  return null;
}
/** quantas vezes dá para pagar o custo (fila arrastada) */
export function affordCount(s: Sim, p: Player | undefined, c: Cost): number {
  let n = Infinity;
  for (const k in c) {
    const need = c[k as Res] ?? 0;
    if (need > 0) n = Math.min(n, Math.floor(have(s, p, k as Res) / need));
  }
  return n === Infinity ? 999 : n;
}
/** paga (saco primeiro, depois o estoque). Só chame depois de canAfford. */
export function pay(s: Sim, p: Player, c: Cost): void {
  for (const k in c) {
    const r = k as Res;
    let n = c[r] ?? 0;
    const fromBag = Math.min(n, p.bag[r] ?? 0);
    if (fromBag) {
      p.bag[r] = (p.bag[r] ?? 0) - fromBag;
      if (!p.bag[r]) delete p.bag[r];
      n -= fromBag;
    }
    if (n > 0) s.stash[r] = Math.max(0, (s.stash[r] ?? 0) - n);
  }
}
/** devolve (desmontar): vai para o estoque do acampamento */
export function give(s: Sim, _p: Player | undefined, c: Cost): void {
  for (const k in c) {
    const n = c[k as Res] ?? 0;
    if (n > 0) s.stash[k as Res] = (s.stash[k as Res] ?? 0) + n;
  }
}
/** baú construído: esvazia o saco no estoque (mesma regra do depósito automático da fogueira) */
export function depositBag(s: Sim, p: Player): number {
  let n = 0;
  for (const k in p.bag) {
    const v = p.bag[k as Res] ?? 0;
    if (v > 0) {
      s.stash[k as Res] = (s.stash[k as Res] ?? 0) + v;
      n += v;
    }
  }
  p.bag = {};
  return n;
}
/** nível da bancada do acampamento (trava peças avançadas) */
export function benchLevel(s: Sim): number {
  return s.bench;
}
