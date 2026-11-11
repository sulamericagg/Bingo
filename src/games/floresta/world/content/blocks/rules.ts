/* ============================================================
 *  BLOCOS — regras de jogo: quebrar (ferramenta/nível/tempo) e drops.
 *  Puro. Níveis de ferramenta = `tier` dos itens do motor
 *  (1 madeira, 2 pedra, 3 cobre, 4 ferro, 5 prata, 6 ouro, 7 cristal; 0 = mão).
 * ============================================================ */
import { blockDef } from './registry';
import type { BlockTool } from './types';

export interface BreakInfo {
  /** pode quebrar com esta ferramenta? */
  can: boolean;
  /** solta drops? (ex.: minério com ferramenta fraca quebra mas não dá nada — aqui: não quebra) */
  drops: boolean;
  /** segundos até quebrar */
  seconds: number;
}

/**
 * tool: tipo da ferramenta na mão ('mao' se nenhuma), tier: nível dela.
 * A ferramenta certa acelera (×(1 + 0,6·nível)); a errada/mão demora 3×.
 */
export function breakInfo(num: number, tool: BlockTool | string, tier: number): BreakInfo {
  const d = blockDef(num);
  if (!num || d.tier >= 99) return { can: false, drops: false, seconds: Infinity };
  const right = d.tool === 'mao' || d.tool === tool;
  const lvl = right ? tier : 0;
  if (d.tier > 0 && (!right || tier < d.tier)) return { can: false, drops: false, seconds: Infinity };
  const base = d.hardness * (right ? 1 : 3);
  return { can: true, drops: true, seconds: Math.max(0.05, base / (1 + 0.6 * lvl)) };
}

/** sorteia os drops (rand: 0..1) → lista {id, n} */
export function rollDrops(num: number, rand: () => number = Math.random): { id: string; n: number }[] {
  const out: { id: string; n: number }[] = [];
  for (const dr of blockDef(num).drops) {
    if (dr.p !== undefined && rand() > dr.p) continue;
    const [a, b] = dr.n ?? [1, 1];
    const n = a + Math.floor(rand() * (b - a + 1));
    if (n > 0) out.push({ id: dr.id, n });
  }
  return out;
}
