/* ============================================================
 *  BLOOP PINK — crescer do pequeno: garagem → salão enorme → comprar o prédio.
 *  Cada etapa é um retângulo de salão (x0..x1, zB..0) + estoque opcional (zB..-16).
 *  Comprar a sala do lado NÃO abre na hora: aparece a marreta e o jogador quebra a
 *  parede (rachaduras, pedaços, poeira) — depois sobra entulho para levar ao lixo.
 *  Aluguel sobe com o tamanho; comprar o prédio (caríssimo) acaba com o aluguel e
 *  deixa as próximas salas de graça (só quebrar a parede).
 * ============================================================ */
import { t } from '../../i18n';

export interface Seg {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}
export interface Stage {
  x0: number;
  x1: number;
  /** fundo do salão de vendas */
  zB: number;
  /** tem estoque nos fundos (zB..-16) com porta de enrolar para o beco */
  stock: boolean;
  price: number;
  lvl: number;
  /** aluguel base por dia */
  rent: number;
  /** parede que se quebra para chegar nesta etapa */
  wall: Seg | null;
  /** quantas marretadas */
  hits: number;
  icon: string;
  name: string;
}
export const Z_BACK = -16;
export const STAGES: Stage[] = [
  { x0: -2.5, x1: 2.5, zB: -6, stock: false, price: 0, lvl: 1, rent: 20, wall: null, hits: 0, icon: 'house', get name() { return t('pink.st0', 'Garagem'); } },
  { x0: -2.5, x1: 2.5, zB: -12, stock: false, price: 1400, lvl: 3, rent: 40, wall: { x0: -2.5, z0: -6, x1: 2.5, z1: -6 }, hits: 8, icon: 'expand', get name() { return t('pink.st1', 'Sala dos fundos'); } },
  { x0: -5, x1: 2.5, zB: -12, stock: false, price: 3200, lvl: 5, rent: 65, wall: { x0: -2.5, z0: -12, x1: -2.5, z1: 0 }, hits: 10, icon: 'expand', get name() { return t('pink.st2', 'Sala da esquerda'); } },
  { x0: -5, x1: 5, zB: -12, stock: false, price: 5200, lvl: 7, rent: 90, wall: { x0: 2.5, z0: -12, x1: 2.5, z1: 0 }, hits: 12, icon: 'expand', get name() { return t('pink.st3', 'Sala da direita'); } },
  { x0: -5, x1: 5, zB: -12, stock: true, price: 7500, lvl: 9, rent: 120, wall: { x0: 2.3, z0: -12, x1: 4.3, z1: -12 }, hits: 12, icon: 'pallet', get name() { return t('pink.st4', 'Estoque com doca'); } },
  { x0: -5, x1: 9, zB: -12, stock: true, price: 14000, lvl: 12, rent: 170, wall: { x0: 5, z0: -16, x1: 5, z1: 0 }, hits: 14, icon: 'expand', get name() { return t('pink.exp.1', 'Ampliação lateral'); } },
  { x0: -9, x1: 9, zB: -12, stock: true, price: 28000, lvl: 20, rent: 240, wall: { x0: -5, z0: -16, x1: -5, z1: 0 }, hits: 16, icon: 'expand', get name() { return t('pink.st6', 'Salão gigante'); } },
];
/** comprar o prédio inteiro: meta de longo prazo */
export const BUILDING_PRICE = 250000;
export const BUILDING_LVL = 15;

export interface GrowState {
  /** etapa comprada */
  sz: number;
  /** etapa aberta (paredes quebradas) */
  op: number;
  /** marretadas na parede atual */
  hits: number;
  /** prédio próprio */
  own: boolean;
}
export const stageOf = (r: GrowState): Stage => STAGES[Math.max(0, Math.min(STAGES.length - 1, r.op))];
export const ownedStage = (r: GrowState): Stage => STAGES[Math.max(0, Math.min(STAGES.length - 1, r.sz))];
/** parede para quebrar (comprou a próxima sala e ainda não abriu) */
export const pendingWall = (r: GrowState): Stage | null => (r.sz > r.op ? STAGES[r.op + 1] : null);
export const nextStage = (r: GrowState): Stage | null => (r.sz === r.op ? (STAGES[r.sz + 1] ?? null) : null);
export const stagePrice = (r: GrowState, st: Stage) => (r.own ? 0 : st.price);
export function rentOf(r: GrowState, lvl: number): number {
  if (r.own) return 0;
  return ownedStage(r).rent + lvl * 3;
}
/** área do salão (m²) */
export function salesArea(r: GrowState): number {
  const s = stageOf(r);
  return (s.x1 - s.x0) * -s.zB;
}
/** saves antigos: exp 0/1/2 = loja com estoque já reformada (etapa 4/5/6) */
export function migrateGrow(r: Partial<GrowState> & { exp?: number }): void {
  if (typeof r.sz !== 'number') {
    const e = Math.max(0, Math.min(2, r.exp ?? 0));
    r.sz = 4 + e;
    r.op = 4 + e;
    r.hits = 0;
    r.own = false;
  }
  r.op ??= r.sz;
  r.hits ??= 0;
  r.own ??= false;
}
