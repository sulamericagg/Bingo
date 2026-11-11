/* ============================================================
 *  BLOCOS — formas (tocha, cerca, porta, escada…) como listas de caixas
 *  em coordenadas 0..1 da célula. Frente = +Z com rotação 0; a rotação
 *  (meta & 3) gira de 90° em 90° em torno do eixo Y.
 *  Puro (sem DOM/three).
 * ============================================================ */
import type { ShapeKind } from './types';

/** qual ladrilho a caixa usa: auto = top/side/bottom pela face; front = +Z usa o ladrilho de frente */
export const enum BoxTile {
  Auto = 0,
  Side = 1,
  Top = 2,
  Front = 3,
}
export interface Box {
  a: [number, number, number];
  b: [number, number, number];
  tile: BoxTile;
  /** escala da face de cima/baixo (estalactites, cristais); 1 = caixa reta */
  topK?: number;
  botK?: number;
}
const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tile = BoxTile.Auto, topK?: number, botK?: number): Box => ({ a: [x0, y0, z0], b: [x1, y1, z1], tile, topK, botK });

/** bits de conexão horizontal: 1 = +X, 2 = -X, 4 = +Z, 8 = -Z */
export const CON_PX = 1;
export const CON_NX = 2;
export const CON_PZ = 4;
export const CON_NZ = 8;

/** formas que se ligam aos vizinhos (cerca, vidraça) */
export function shapeConnects(k: ShapeKind | undefined): boolean {
  return k === 'fence' || k === 'pane';
}

/** caixas da forma (já sem rotação — gire com rotBox) */
export function shapeBoxes(k: ShapeKind, con: number): Box[] {
  switch (k) {
    case 'torch':
      return [bx(0.44, 0, 0.44, 0.56, 0.6, 0.56, BoxTile.Side), bx(0.4, 0.6, 0.4, 0.6, 0.8, 0.6, BoxTile.Top)];
    case 'lantern':
      return [bx(0.47, 0.72, 0.47, 0.53, 1, 0.53, BoxTile.Side), bx(0.27, 0.62, 0.27, 0.73, 0.72, 0.73, BoxTile.Side), bx(0.31, 0.16, 0.31, 0.69, 0.62, 0.69, BoxTile.Top), bx(0.34, 0.1, 0.34, 0.66, 0.16, 0.66, BoxTile.Side)];
    case 'post':
      return [bx(0.4, 0, 0.4, 0.6, 0.78, 0.6, BoxTile.Side), bx(0.28, 0.78, 0.28, 0.72, 1, 0.72, BoxTile.Top)];
    case 'cube':
      return [bx(0, 0, 0, 1, 1, 1)];
    case 'fence': {
      const o = [bx(0.375, 0, 0.375, 0.625, 1, 0.625)];
      for (const [y0, y1] of [
        [0.32, 0.47],
        [0.68, 0.83],
      ]) {
        if (con & CON_PX) o.push(bx(0.625, y0, 0.44, 1, y1, 0.56, BoxTile.Side));
        if (con & CON_NX) o.push(bx(0, y0, 0.44, 0.375, y1, 0.56, BoxTile.Side));
        if (con & CON_PZ) o.push(bx(0.44, y0, 0.625, 0.56, y1, 1, BoxTile.Side));
        if (con & CON_NZ) o.push(bx(0.44, y0, 0, 0.56, y1, 0.375, BoxTile.Side));
      }
      return o;
    }
    case 'pane': {
      const t0 = 0.46;
      const t1 = 0.54;
      if (!con) return [bx(0, 0, t0, 1, 1, t1, BoxTile.Side)];
      const o = [bx(t0, 0, t0, t1, 1, t1, BoxTile.Side)];
      if (con & CON_PX) o.push(bx(t1, 0, t0, 1, 1, t1, BoxTile.Side));
      if (con & CON_NX) o.push(bx(0, 0, t0, t0, 1, t1, BoxTile.Side));
      if (con & CON_PZ) o.push(bx(t0, 0, t1, t1, 1, 1, BoxTile.Side));
      if (con & CON_NZ) o.push(bx(t0, 0, 0, t1, 1, t0, BoxTile.Side));
      return o;
    }
    case 'door':
      return [bx(0, 0, 0.84, 1, 1, 1, BoxTile.Side)];
    case 'stairs':
      return [bx(0, 0, 0, 1, 0.5, 1), bx(0, 0.5, 0.5, 1, 1, 1)];
    case 'slab':
      return [bx(0, 0, 0, 1, 0.5, 1)];
    case 'carpet':
      return [bx(0, 0, 0, 1, 0.0625, 1)];
    case 'rail':
      return [bx(0, 0, 0, 1, 0.04, 1, BoxTile.Top)];
    case 'ladder':
      return [bx(0.02, 0, 0.9, 0.98, 1, 0.97, BoxTile.Side)];
    case 'bed':
      return [bx(0, 0.12, 0, 1, 0.5, 1), bx(0.04, 0, 0.04, 0.16, 0.12, 0.16, BoxTile.Side), bx(0.84, 0, 0.04, 0.96, 0.12, 0.16, BoxTile.Side), bx(0.04, 0, 0.84, 0.16, 0.12, 0.96, BoxTile.Side), bx(0.84, 0, 0.84, 0.96, 0.12, 0.96, BoxTile.Side), bx(0.12, 0.5, 0.66, 0.88, 0.64, 0.94, BoxTile.Side)];
    case 'chest':
      return [bx(0.06, 0, 0.06, 0.94, 0.84, 0.94), bx(0.44, 0.5, 0.94, 0.56, 0.68, 0.98, BoxTile.Front)];
    case 'bench':
      return [bx(0, 0.78, 0, 1, 1, 1), bx(0.06, 0, 0.06, 0.2, 0.78, 0.2, BoxTile.Side), bx(0.8, 0, 0.06, 0.94, 0.78, 0.2, BoxTile.Side), bx(0.06, 0, 0.8, 0.2, 0.78, 0.94, BoxTile.Side), bx(0.8, 0, 0.8, 0.94, 0.78, 0.94, BoxTile.Side), bx(0.1, 0.3, 0.1, 0.9, 0.38, 0.9, BoxTile.Side)];
    case 'spike_down':
      return [bx(0.2, 0.02, 0.2, 0.8, 1, 0.8, BoxTile.Side, 1, 0.06)];
    case 'spike_up':
      return [bx(0.2, 0, 0.2, 0.8, 0.98, 0.8, BoxTile.Side, 0.06, 1)];
    case 'cluster':
      return [bx(0.36, 0, 0.36, 0.64, 0.78, 0.64, BoxTile.Side, 0.15, 1), bx(0.12, 0, 0.18, 0.34, 0.46, 0.4, BoxTile.Side, 0.2, 1), bx(0.6, 0, 0.62, 0.86, 0.54, 0.88, BoxTile.Side, 0.2, 1), bx(0.62, 0, 0.12, 0.8, 0.34, 0.3, BoxTile.Side, 0.2, 1)];
    case 'cactus':
      return [bx(0.0625, 0, 0.0625, 0.9375, 1, 0.9375)];
  }
  return [bx(0, 0, 0, 1, 1, 1)];
}

/** gira um ponto (x,z) da célula r×90° em torno do centro */
export function rotXZ(x: number, z: number, r: number): [number, number] {
  switch (r & 3) {
    case 1:
      return [1 - z, x];
    case 2:
      return [1 - x, 1 - z];
    case 3:
      return [z, 1 - x];
  }
  return [x, z];
}
