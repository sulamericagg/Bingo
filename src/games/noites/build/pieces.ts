/* ============================================================
 *  NOITES · CONSTRUÇÃO — peças (dados puros, sem three/DOM).
 *  Grade de CELL m em volta da fogueira. Peças de "barreira"
 *  (cercas, muro, portão, torre) se ligam sozinhas aos vizinhos
 *  (máscara N/L/S/O → poste, ponta, reta, canto, T, cruz).
 * ============================================================ */
import { t } from '../../../i18n';
import type { Res } from '../data';

/** tamanho da célula da grade (m) */
export const CELL = 1.5;
/** raio de construção em volta da fogueira (m) */
export const BUILD_R = 30;
/** alcance do jogador (m) */
export const REACH = 11;
/** fila arrastada: máximo de células */
export const LINE_MAX = 16;
/** devolução ao desmontar */
export const REFUND = 0.5;

export type PK = 'fence' | 'rfence' | 'wall' | 'gate' | 'tower' | 'spikes' | 'torch' | 'campfire' | 'chest' | 'bed' | 'bench';
export type Cost = Partial<Record<Res, number>>;

export interface PieceDef {
  id: PK;
  /** índice estável (rede/salvamento) — NUNCA reordenar, só acrescentar */
  idx: number;
  cost: Cost;
  hp: number;
  /** desenha braços até os vizinhos ligáveis (cercas/muro) */
  arms?: boolean;
  /** vizinhos se ligam a ela (barreiras, portão, torre) */
  link?: boolean;
  /** colisão: meia-largura x / z (rot 0). 0 = atravessável */
  hx: number;
  hz: number;
  /** jogadores atravessam (portão abre para amigos) */
  friendly?: boolean;
  /** altura (barra de vida) */
  h: number;
  light?: number;
  lc?: string;
  /** próximo nível (melhorar) */
  up?: PK;
  /** recurso do conserto */
  fix: Res;
  /** nível mínimo da bancada do acampamento */
  bench?: number;
  /** pode ficar fora da grade (modo livre) */
  decor?: boolean;
  icon: string;
  col: string;
  /** espessura dos braços / poste (colisão das barreiras) */
  arm?: number;
  post?: number;
  n: () => string;
  say: () => string;
}

const P = (d: PieceDef) => d;
export const PIECES: PieceDef[] = [
  P({ id: 'fence', idx: 0, cost: { wood: 2 }, hp: 10, arms: true, link: true, hx: 0, hz: 0, arm: 0.09, post: 0.13, h: 1.25, up: 'rfence', fix: 'wood', icon: 'bfence', col: '#c08a52', n: () => t('nbuild.p.fence', 'Cerca de Madeira'), say: () => t('nbuild.s.fence', 'Cerca de madeira. Arraste para fazer uma fila!') }),
  P({ id: 'rfence', idx: 1, cost: { wood: 2, stone: 1 }, hp: 22, arms: true, link: true, hx: 0, hz: 0, arm: 0.15, post: 0.18, h: 1.6, up: 'wall', fix: 'wood', bench: 2, icon: 'brfence', col: '#8a5a2e', n: () => t('nbuild.p.rfence', 'Cerca Reforçada'), say: () => t('nbuild.s.rfence', 'Cerca reforçada: aguenta mais!') }),
  P({ id: 'wall', idx: 2, cost: { stone: 3 }, hp: 45, arms: true, link: true, hx: 0, hz: 0, arm: 0.3, post: 0.36, h: 1.75, fix: 'stone', bench: 2, icon: 'bwall', col: '#9aa0b4', n: () => t('nbuild.p.wall', 'Muro de Pedra'), say: () => t('nbuild.s.wall', 'Muro de pedra: o mais forte!') }),
  P({ id: 'gate', idx: 3, cost: { wood: 3 }, hp: 16, link: true, friendly: true, hx: 0.12, hz: 0.75, h: 1.6, fix: 'wood', icon: 'bgate', col: '#d8a060', n: () => t('nbuild.p.gate', 'Portão'), say: () => t('nbuild.s.gate', 'Portão: abre para os amigos e fica fechado para as Sombrinhas.') }),
  P({ id: 'tower', idx: 4, cost: { wood: 8, stone: 2 }, hp: 34, link: true, hx: 0.62, hz: 0.62, h: 4.2, light: 7.5, lc: '#ffe39a', fix: 'wood', bench: 2, icon: 'btower', col: '#ffd34a', n: () => t('nbuild.p.tower', 'Torre de Vigia'), say: () => t('nbuild.s.tower', 'Torre de vigia: ilumina longe!') }),
  P({ id: 'spikes', idx: 5, cost: { wood: 2, stone: 1 }, hp: 14, hx: 0, hz: 0, h: 0.6, fix: 'wood', icon: 'bspikes', col: '#e8c890', n: () => t('nbuild.p.spikes', 'Armadilha de Espinhos'), say: () => t('nbuild.s.spikes', 'Espinhos: as Sombrinhas que pisam levam dano.') }),
  P({ id: 'torch', idx: 6, cost: { wood: 1, fiber: 1 }, hp: 6, hx: 0.12, hz: 0.12, h: 1.7, light: 4.5, lc: '#ffa040', fix: 'wood', decor: true, icon: 'torch', col: '#ff9a2e', n: () => t('nbuild.p.torch', 'Tocha de Chão'), say: () => t('nbuild.s.torch', 'Tocha: luz que não apaga.') }),
  P({ id: 'campfire', idx: 7, cost: { wood: 4, stone: 3 }, hp: 14, hx: 0.5, hz: 0.5, h: 0.9, light: 6.5, lc: '#ff9a40', fix: 'stone', decor: true, icon: 'fire', col: '#ff7a2e', n: () => t('nbuild.p.campfire', 'Fogueira Extra'), say: () => t('nbuild.s.campfire', 'Fogueira extra: luz e calor!') }),
  P({ id: 'chest', idx: 8, cost: { wood: 5 }, hp: 12, hx: 0.48, hz: 0.32, h: 0.9, fix: 'wood', decor: true, icon: 'chest', col: '#c08a52', n: () => t('nbuild.p.chest', 'Baú'), say: () => t('nbuild.s.chest', 'Baú: chegue perto para guardar o que está no saco.') }),
  P({ id: 'bed', idx: 9, cost: { wood: 3, fiber: 3 }, hp: 10, hx: 0, hz: 0, h: 0.7, fix: 'wood', decor: true, icon: 'bed', col: '#8ad8ff', n: () => t('nbuild.p.bed', 'Cama'), say: () => t('nbuild.s.bed', 'Cama: quem desmaiar acorda aqui.') }),
  P({ id: 'bench', idx: 10, cost: { wood: 6, stone: 2, scrap: 2 }, hp: 16, hx: 0.7, hz: 0.42, h: 1.2, fix: 'wood', decor: true, icon: 'bench', col: '#c08a52', n: () => t('nbuild.p.bench', 'Bancada Extra'), say: () => t('nbuild.s.bench', 'Bancada extra: crie coisas aqui também.') }),
];
export const PIECE: Record<PK, PieceDef> = Object.fromEntries(PIECES.map((d) => [d.id, d])) as Record<PK, PieceDef>;
export const byIdx = (i: number): PieceDef | undefined => PIECES[i];

/** grupos da paleta */
export const GROUPS: { k: string; n: () => string; ids: PK[] }[] = [
  { k: 'def', n: () => t('nbuild.g.def', 'Defesa'), ids: ['fence', 'rfence', 'wall', 'gate', 'tower', 'spikes'] },
  { k: 'camp', n: () => t('nbuild.g.camp', 'Acampamento'), ids: ['torch', 'campfire', 'chest', 'bed', 'bench'] },
];

/* ------------------------------ ligações ------------------------------ */
/** bits da máscara de vizinhos: N = +z, L = +x, S = −z, O = −x */
export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;
export const DIRS: [number, number, number][] = [
  [N, 0, 1],
  [E, 1, 0],
  [S, 0, -1],
  [W, -1, 0],
];
export const enum Shape {
  Post = 0,
  End = 1,
  Straight = 2,
  Corner = 3,
  Tee = 4,
  Cross = 5,
}
export const SHAPES = 6;
/** máscara canônica de cada forma (rot 0) */
const CANON = [0, N, N | S, N | E, N | E | S, 15];
const rotl = (m: number, k: number) => ((m << k) | (m >> (4 - k))) & 15;
/** tabela: máscara → [forma, quartos de volta] */
export const SHAPE_OF: [Shape, number][] = (() => {
  const out: [Shape, number][] = [];
  for (let m = 0; m < 16; m++) {
    let hit: [Shape, number] = [Shape.Post, 0];
    for (let s = 0; s < SHAPES; s++) for (let k = 3; k >= 0; k--) if (rotl(CANON[s], k) === m) hit = [s as Shape, k];
    out.push(hit);
  }
  return out;
})();
export const SHAPE_NAMES = ['post', 'end', 'straight', 'corner', 'tee', 'cross'];

export function costText(c: Cost, mul = 1): [Res, number][] {
  return (Object.keys(c) as Res[]).map((r) => [r, Math.ceil((c[r] ?? 0) * mul)]);
}
export function addCost(a: Cost, b: Cost, mul = 1): Cost {
  const o: Cost = { ...a };
  for (const k in b) o[k as Res] = (o[k as Res] ?? 0) + (b[k as Res] ?? 0) * mul;
  return o;
}
/** devolução ao desmontar (arredonda para baixo, mínimo 1 do recurso principal) */
export function refundOf(d: PieceDef, hpFrac = 1): Cost {
  const o: Cost = {};
  const k = REFUND * (0.5 + 0.5 * hpFrac);
  for (const r in d.cost) {
    const n = Math.floor((d.cost[r as Res] ?? 0) * k);
    if (n > 0) o[r as Res] = n;
  }
  if (!Object.keys(o).length) o[d.fix] = 1;
  return o;
}
/** custo do conserto (recurso principal, proporcional ao dano, mínimo 1) */
export function repairOf(d: PieceDef, hp: number): Cost {
  const base = d.cost[d.fix] ?? 1;
  return { [d.fix]: Math.max(1, Math.ceil(base * (1 - hp / d.hp))) };
}

/** variante visual: [forma, rotação em y (rad)] — barreiras pela máscara; portão pelo eixo; demais pela rotação do jogador */
export function variantOf(d: PieceDef, mask: number, ro: number): [number, number] {
  if (d.arms) {
    // peça sozinha = um trecho reto na direção escolhida (girar muda)
    if (!(mask & 15)) mask = Math.round(ro / 2) % 2 ? E | W : N | S;
    const [sh, k] = SHAPE_OF[mask & 15];
    return [sh, (k * Math.PI) / 2];
  }
  if (d.id === 'gate') {
    const ns = mask & (N | S);
    const ew = mask & (E | W);
    const ax = ns && !ew ? 0 : ew && !ns ? 1 : Math.round(ro / 2) % 2;
    return [0, (ax * Math.PI) / 2];
  }
  return [0, (ro * Math.PI) / 4];
}
