/* ============================================================
 *  ENCAIXE DE MÓVEIS (3D): grade no chão, encosta nas paredes, pegada REAL
 *  (com tolerância), portas livres e "empurrãozinho" automático para a casa
 *  livre mais próxima em vez de só recusar. Usado pelo modo Decorar (FPS)
 *  e pela Vista aérea. Tudo em coordenadas LOCAIS do cômodo (m).
 * ============================================================ */
import { dimsOf, fitInRoom, halfExt, IN_X0, IN_X1, KINDS, kindOf, quarterOf, ROOM_D, ROOM_W, WALL_H, WALL_T, type Kind } from './adapter';
import type { ItemRec, RoomRec } from './engine';

/** passo da grade (m) */
export const GRID = 0.25;
/** encolhe cada pegada um pouco: encostar não é bater */
const TOL = 0.035;
/** profundidade da área livre na frente de cada porta */
const DOOR_CLEAR = 0.55;

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}
export interface Solve {
  x: number;
  z: number;
  /** cabe (talvez depois de um empurrãozinho) */
  ok: boolean;
  /** foi empurrado para longe do ponto pedido */
  nudged: boolean;
}

const rectOf = (x: number, z: number, hx: number, hz: number, shrink = TOL): Rect => ({ x0: x - hx + shrink, z0: z - hz + shrink, x1: x + hx - shrink, z1: z + hz - shrink });
const hit = (a: Rect, b: Rect) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;

/** obstáculos do cômodo para um item (ignora o próprio item, tapetes, coisas de parede/teto) */
export function obstacles(room: RoomRec, items: ItemRec[], ignore: ItemRec | null, kind: Kind): Rect[] {
  const out: Rect[] = [];
  const info = KINDS[kind];
  if (info.flat || info.ceil) return out;
  for (const o of items) {
    if (o === ignore || o.room !== room || o.info.wall || o.info.flat || o.info.ceil) continue;
    const l = room.group.worldToLocal(o.homeP.clone());
    const { hx, hz } = halfExt(o.kind, o.v, quarterOf(o.data));
    out.push(rectOf(l.x, l.z, hx, hz));
  }
  for (const r of doorZones(room)) out.push(r);
  return out;
}
/** áreas na frente das portas (ninguém fica preso) */
export function doorZones(room: RoomRec): Rect[] {
  const out: Rect[] = [];
  for (const w of room.walls)
    for (const [a, b] of w.doors) {
      const c = (a + b) / 2,
        h = (b - a) / 2;
      const W = ROOM_W,
        D = ROOM_D;
      if (w.side === 'n') out.push({ x0: c - h, x1: c + h, z0: 0, z1: WALL_T + DOOR_CLEAR });
      else if (w.side === 's') out.push({ x0: W - c - h, x1: W - c + h, z0: D - WALL_T - DOOR_CLEAR, z1: D });
      else if (w.side === 'e') out.push({ x0: W - WALL_T - DOOR_CLEAR, x1: W, z0: c - h, z1: c + h });
      else out.push({ x0: 0, x1: WALL_T + DOOR_CLEAR, z0: D - c - h, z1: D - c + h });
    }
  return out;
}

/**
 * Melhor lugar para um móvel de chão perto de (x, z): encaixa na grade, encosta nas paredes e,
 * se bater em algo, procura a casa livre mais próxima (anéis da grade até ~2 m).
 */
export function solveFloor(room: RoomRec, items: ItemRec[], it: { id: string; r3?: number; flip?: boolean }, self: ItemRec | null, x: number, z: number): Solve {
  const { kind, v } = kindOf(it.id);
  const { hx, hz } = halfExt(kind, v, quarterOf(it));
  const obs = obstacles(room, items, self, kind);
  const sx = Math.round(x / GRID) * GRID,
    sz = Math.round(z / GRID) * GRID;
  const free = (px: number, pz: number) => {
    const r = rectOf(px, pz, hx, hz);
    for (const o of obs) if (hit(r, o)) return false;
    return true;
  };
  const want = fitInRoom(sx, sz, hx, hz);
  if (free(want.x, want.z)) return { x: want.x, z: want.z, ok: true, nudged: false };
  // anéis crescentes: pega o candidato mais perto do ponto pedido
  let best = null as { x: number; z: number } | null;
  let bd = 1e9;
  const seen = new Set<string>();
  for (let ring = 1; ring <= 8; ring++) {
    for (let i = -ring; i <= ring; i++)
      for (let j = -ring; j <= ring; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue;
        const c = fitInRoom(sx + i * GRID, sz + j * GRID, hx, hz);
        const key = c.x.toFixed(3) + ',' + c.z.toFixed(3);
        if (seen.has(key)) continue;
        seen.add(key);
        if (!free(c.x, c.z)) continue;
        const d = Math.hypot(c.x - x, c.z - z);
        if (d < bd) (bd = d), (best = c);
      }
    // achou neste anel: um anel a mais só para garantir o mais perto de verdade
    if (best && ring >= 2 && bd < (ring - 0.5) * GRID) break;
    if (best && ring >= 3) break;
  }
  if (best) return { x: best.x, z: best.z, ok: true, nudged: true };
  return { x: want.x, z: want.z, ok: false, nudged: false };
}

/** itens de parede: deslizam na parede do fundo (x) e em altura (y = base), sem sobrepor outros quadros */
export function solveWall(room: RoomRec, items: ItemRec[], it: { id: string }, self: ItemRec | null, x: number, y: number): Solve & { y: number } {
  const { kind, v } = kindOf(it.id);
  const dm = dimsOf(kind, v);
  const hx = dm.w / 2;
  const clampX = (px: number) => Math.max(IN_X0 + hx + 0.02, Math.min(IN_X1 - hx - 0.02, px));
  const yy = Math.max(0.6, Math.min(WALL_H - dm.h - 0.05, Math.round(y / 0.1) * 0.1));
  const others: Rect[] = [];
  for (const o of items) {
    if (o === self || o.room !== room || !o.info.wall) continue;
    const l = room.group.worldToLocal(o.homeP.clone());
    others.push({ x0: l.x - o.dims.w / 2, x1: l.x + o.dims.w / 2, z0: l.y, z1: l.y + o.dims.h });
  }
  const free = (px: number) => {
    const r = { x0: px - hx + 0.02, x1: px + hx - 0.02, z0: yy + 0.02, z1: yy + dm.h - 0.02 };
    return !others.some((o) => hit(r, o));
  };
  const sx = clampX(Math.round(x / 0.1) * 0.1);
  if (free(sx)) return { x: sx, y: yy, z: WALL_T + dm.d / 2 + 0.006, ok: true, nudged: false };
  for (let k = 1; k <= 30; k++)
    for (const s of [1, -1]) {
      const c = clampX(sx + s * k * 0.1);
      if (free(c)) return { x: c, y: yy, z: WALL_T + dm.d / 2 + 0.006, ok: true, nudged: true };
    }
  return { x: sx, y: yy, z: WALL_T + dm.d / 2 + 0.006, ok: false, nudged: false };
}
