/* ============================================================
 *  MUNDO — construção: peças com encaixe (piso, parede, mureta,
 *  telhado, porta, janela, escada, cerca, pilar) numa grade de 2 m
 *  que "gruda" nas peças vizinhas, e objetos livres (móveis, luzes,
 *  máquinas, baús, enfeites, canteiros) em passos de 0,5 m.
 *  Desenho: uma InstancedMesh por tipo; colisão: caixas em Solids;
 *  luz: pool pequeno de PointLights nas fontes mais perto.
 * ============================================================ */
import * as THREE from 'three';
import { geoms as G, mat4, mergeParts } from '../fps/models';
import { BUILD_MATS, ITEM, PIECE_KINDS, type Station } from './items';
import type { Solids, SBox } from './collide';
import { Furnace, Slots } from './inv';

export const GRID = 2;
export const LEVEL = 2.5;
const TAU = Math.PI * 2;

type Snap = 'cell' | 'edge' | 'corner' | 'free';
interface Box {
  /** centro local (x, z), meia-largura, base/topo locais */
  x: number;
  z: number;
  hx: number;
  hz: number;
  y0: number;
  y1: number;
}
export interface PDef {
  id: string;
  snap: Snap;
  geo: () => THREE.BufferGeometry;
  boxes: Box[];
  light?: number;
  station?: Station;
  chest?: number;
  furnace?: boolean;
  door?: boolean;
  bed?: boolean;
  plot?: boolean;
  rail?: number;
  cart?: boolean;
  /** pode pisar em cima (soma ao chão) */
  floor?: boolean;
}
export const PDEFS = new Map<string, PDef>();

type Pt = { g: THREE.BufferGeometry; c: string; m: THREE.Matrix4; ao?: number; jit?: number };
const B = (x: number, y: number, z: number, sx: number, sy: number, sz: number, c: string, ry = 0): Pt => ({ g: G.box, c, m: mat4(x, y, z, sx, sy, sz, 0, ry, 0), jit: 0.08 });
const C = (x: number, y: number, z: number, r: number, h: number, c: string, rx = 0, rz = 0): Pt => ({ g: G.cyl, c, m: mat4(x, y, z, r, h, r, rx, 0, rz) });
const S = (x: number, y: number, z: number, r: number, c: string, sy = 1): Pt => ({ g: G.ico, c, m: mat4(x, y, z, r, r * sy, r) });
const box = (hx: number, y0: number, y1: number, hz: number, x = 0, z = 0): Box => ({ x, z, hx, hz, y0, y1 });

function defPieces(): void {
  for (const M of BUILD_MATS) {
    const c = M.col;
    const d = M.col2;
    const mk = (k: string, snap: Snap, parts: () => Pt[], boxes: Box[], extra: Partial<PDef> = {}) =>
      PDEFS.set(`${k}_${M.key}`, { id: `${k}_${M.key}`, snap, geo: () => mergeParts(parts()), boxes, ...extra });
    const stripes = (w: number, h: number, y0: number, n: number): Pt[] => {
      const out: Pt[] = [];
      for (let i = 1; i < n; i++) out.push(B(0, y0 + (h / n) * i, 0, w, 0.04, 0.24, d));
      return out;
    };
    mk('piso', 'cell', () => [B(0, -0.1, 0, 2, 0.2, 2, c), ...[-0.5, 0, 0.5].map((x) => B(x, 0.001, 0, 0.03, 0.001, 2, d))], [box(1, -0.2, 0, 1)], { floor: true });
    mk('parede', 'edge', () => [B(0, LEVEL / 2, 0, 2, LEVEL, 0.2, c), ...stripes(2.01, LEVEL, 0, 5)], [box(1, 0, LEVEL, 0.1)]);
    mk('meia', 'edge', () => [B(0, 0.55, 0, 2, 1.1, 0.2, c), B(0, 1.12, 0, 2.06, 0.08, 0.28, d)], [box(1, 0, 1.1, 0.1)]);
    mk('telhado', 'cell', () => {
      const a = Math.atan2(1, 2);
      const L = Math.hypot(1, 2);
      return [
        { g: G.box, c, m: mat4(0, LEVEL + 0.5, -0.5, 2.1, 0.14, L * 0.5 + 0.05, a, 0, 0) },
        { g: G.box, c: d, m: mat4(0, LEVEL + 0.5, 0.5, 2.1, 0.14, L * 0.5 + 0.05, -a, 0, 0) },
        B(0, LEVEL + 1.02, 0, 2.15, 0.12, 0.16, d),
      ];
    }, [box(1, LEVEL - 0.05, LEVEL + 0.35, 1)], { floor: false });
    mk('porta', 'edge', () => [B(-0.5, LEVEL / 2, 0, 1, LEVEL, 0.12, c), B(-0.15, 1.1, 0.08, 0.08, 0.08, 0.08, '#ffd34a'), B(0.5, LEVEL / 2, 0, 1, LEVEL, 0.2, d)], [box(0.5, 0, LEVEL, 0.1, -0.5), box(0.5, 0, LEVEL, 0.1, 0.5)], { door: true });
    mk('janela', 'edge', () => [B(0, 0.45, 0, 2, 0.9, 0.2, c), B(0, LEVEL - 0.3, 0, 2, 0.6, 0.2, c), B(-0.85, 1.3, 0, 0.3, 0.8, 0.2, c), B(0.85, 1.3, 0, 0.3, 0.8, 0.2, c), B(0, 1.3, 0, 1.4, 0.8, 0.04, '#bfeaff'), B(0, 1.3, 0, 0.05, 0.8, 0.12, d)], [box(1, 0, LEVEL, 0.1)]);
    mk('escada', 'cell', () => {
      const p: Pt[] = [];
      for (let i = 0; i < 5; i++) p.push(B(0, (i + 0.5) * 0.5 - 0.25, -0.8 + i * 0.4, 1.9, (i + 1) * 0.5, 0.4, i % 2 ? c : d));
      return p;
    }, [0, 1, 2, 3, 4].map((i) => box(0.95, 0, (i + 1) * 0.5, 0.2, 0, -0.8 + i * 0.4)), { floor: true });
    mk('cerca', 'edge', () => [B(-0.9, 0.55, 0, 0.16, 1.1, 0.16, c), B(0, 0.55, 0, 0.16, 1.1, 0.16, c), B(0.9, 0.55, 0, 0.16, 1.1, 0.16, c), B(0, 0.35, 0, 2, 0.12, 0.08, d), B(0, 0.85, 0, 2, 0.12, 0.08, d)], [box(1, 0, 1.1, 0.1)]);
    mk('pilar', 'corner', () => [B(0, LEVEL / 2, 0, 0.3, LEVEL, 0.3, c), B(0, 0.1, 0, 0.42, 0.2, 0.42, d), B(0, LEVEL - 0.1, 0, 0.42, 0.2, 0.42, d)], [box(0.16, 0, LEVEL, 0.16)]);
  }
  PDEFS.set('parede_vidro', { id: 'parede_vidro', snap: 'edge', geo: () => mergeParts([B(0, LEVEL / 2, 0, 1.96, LEVEL - 0.1, 0.06, '#bfeaff'), B(0, 0.05, 0, 2, 0.1, 0.18, '#c8ccd8'), B(0, LEVEL - 0.05, 0, 2, 0.1, 0.18, '#c8ccd8'), B(0, LEVEL / 2, 0, 0.08, LEVEL, 0.14, '#c8ccd8')]), boxes: [box(1, 0, LEVEL, 0.08)] });

  const F = (id: string, parts: () => Pt[], boxes: Box[], extra: Partial<PDef> = {}) => PDEFS.set(id, { id, snap: 'free', geo: () => mergeParts(parts()), boxes, ...extra });
  const wood = '#d8a060';
  const dark = '#a8743c';
  // luzes
  F('tocha', () => [C(0, 0.45, 0, 0.05, 0.9, dark), S(0, 0.98, 0, 0.13, '#ffb02e', 1.4), S(0, 1.02, 0, 0.07, '#fff3a8', 1.4)], [], { light: 0xffb060 });
  F('lampiao', () => [C(0, 0.06, 0, 0.18, 0.12, '#3a3a4a'), C(0, 0.3, 0, 0.14, 0.36, '#fff3a8'), C(0, 0.52, 0, 0.18, 0.08, '#3a3a4a')], [box(0.18, 0, 0.6, 0.18)], { light: 0xffd080 });
  F('luz_cristal', () => [S(0, 0.35, 0, 0.3, '#7af0ff', 1.6), S(0, 0.35, 0, 0.16, '#ffffff', 1.6)], [box(0.25, 0, 0.8, 0.25)], { light: 0x8af0ff });
  F('luminaria', () => [C(0, 2.2, 0, 0.02, 0.6, '#3a3a4a'), C(0, 1.85, 0, 0.3, 0.25, '#ffd34a'), S(0, 1.72, 0, 0.12, '#fff6c0')], [], { light: 0xfff0c0 });
  // móveis
  F('cadeira', () => [B(0, 0.45, 0, 0.5, 0.08, 0.5, wood), B(0, 0.8, -0.22, 0.5, 0.6, 0.08, wood), ...[-0.2, 0.2].flatMap((x) => [B(x, 0.22, -0.2, 0.07, 0.45, 0.07, dark), B(x, 0.22, 0.2, 0.07, 0.45, 0.07, dark)])], [box(0.26, 0, 0.5, 0.26)], { floor: true });
  F('mesa', () => [B(0, 0.78, 0, 1.4, 0.1, 0.9, wood), ...[-0.6, 0.6].flatMap((x) => [B(x, 0.38, -0.36, 0.1, 0.76, 0.1, dark), B(x, 0.38, 0.36, 0.1, 0.76, 0.1, dark)])], [box(0.7, 0, 0.84, 0.45)], { floor: true });
  F('cama', () => [B(0, 0.3, 0, 1.1, 0.3, 2, dark), B(0, 0.5, 0.1, 1.04, 0.16, 1.7, '#ff8ac8'), B(0, 0.55, -0.75, 0.8, 0.14, 0.4, '#ffffff'), B(0, 0.7, -0.98, 1.1, 0.7, 0.1, dark)], [box(0.55, 0, 0.6, 1)], { bed: true, floor: true });
  F('estante', () => [B(0, 1, -0.05, 1.2, 2, 0.4, dark), ...[0.5, 1, 1.5].map((y) => B(0, y, 0.02, 1.1, 0.05, 0.36, wood)), ...[-0.4, -0.2, 0.1, 0.3].map((x, i) => B(x, 1.68 - (i % 2) * 0.5, 0.05, 0.12, 0.3, 0.25, ['#ff8a3a', '#5aa8ff', '#7aff8a', '#ff4f6a'][i]))], [box(0.6, 0, 2, 0.25)]);
  F('sofa', () => [B(0, 0.25, 0, 1.8, 0.4, 0.8, '#5a6ad8'), B(0, 0.6, -0.32, 1.8, 0.6, 0.18, '#7a8aff'), B(-0.85, 0.45, 0, 0.18, 0.5, 0.8, '#7a8aff'), B(0.85, 0.45, 0, 0.18, 0.5, 0.8, '#7a8aff')], [box(0.95, 0, 0.6, 0.42)], { floor: true });
  F('tapete', () => [B(0, 0.01, 0, 2, 0.02, 1.4, '#ff6a8a'), B(0, 0.015, 0, 1.4, 0.02, 0.8, '#ffd34a')], []);
  F('quadro', () => [B(0, 1.5, 0, 1, 0.8, 0.06, '#ffd34a'), B(0, 1.5, 0.02, 0.8, 0.6, 0.04, '#7ad0ff'), S(0.15, 1.45, 0.05, 0.12, '#ffd34a')], []);
  F('vaso', () => [C(0, 0.2, 0, 0.18, 0.4, '#d0603a'), S(0, 0.55, 0, 0.22, '#5cc24a'), S(0.08, 0.68, 0.05, 0.08, '#ff5a8a'), S(-0.1, 0.62, -0.05, 0.08, '#ffd34a')], [box(0.2, 0, 0.7, 0.2)]);
  F('relogio', () => [B(0, 0.9, 0, 0.5, 1.8, 0.35, dark), C(0, 1.45, 0.18, 0.18, 0.04, '#ffffff', Math.PI / 2), C(0, 0.8, 0.18, 0.08, 0.03, '#ffd34a', Math.PI / 2)], [box(0.25, 0, 1.8, 0.18)]);
  F('banquinho', () => [C(0, 0.45, 0, 0.22, 0.08, wood), ...[0, 1, 2].map((i) => B(Math.cos((i * TAU) / 3) * 0.13, 0.22, Math.sin((i * TAU) / 3) * 0.13, 0.06, 0.44, 0.06, dark))], [box(0.2, 0, 0.5, 0.2)], { floor: true });
  F('armario', () => [B(0, 1, 0, 1.2, 2, 0.6, dark), B(-0.3, 1, 0.31, 0.55, 1.8, 0.03, wood), B(0.3, 1, 0.31, 0.55, 1.8, 0.03, wood), B(-0.06, 1, 0.34, 0.05, 0.2, 0.04, '#ffd34a'), B(0.06, 1, 0.34, 0.05, 0.2, 0.04, '#ffd34a')], [box(0.6, 0, 2, 0.3)]);
  F('abajur', () => [C(0, 0.05, 0, 0.2, 0.1, dark), C(0, 0.75, 0, 0.03, 1.4, dark), { g: G.cone, c: '#ffd34a', m: mat4(0, 1.5, 0, 0.3, 0.35, 0.3) }], [box(0.15, 0, 1.6, 0.15)], { light: 0xfff0c0 });
  F('bandeira', () => [C(0, 1.4, 0, 0.04, 2.8, dark), B(0.45, 2.45, 0, 0.9, 0.6, 0.03, '#ff4f6a'), S(0.45, 2.45, 0.03, 0.12, '#ffd34a')], [box(0.08, 0, 2.8, 0.08)]);
  F('estatua', () => [B(0, 0.3, 0, 1, 0.6, 1, '#8a8696'), S(0, 1.25, 0, 0.6, '#c8c4d0', 1.05), S(-0.2, 1.4, 0.48, 0.09, '#2a0b5c'), S(0.2, 1.4, 0.48, 0.09, '#2a0b5c'), S(-0.5, 1.75, 0, 0.18, '#c8c4d0'), S(0.5, 1.75, 0, 0.18, '#c8c4d0')], [box(0.5, 0, 1.9, 0.5)]);
  F('almofada', () => [S(0, 0.15, 0, 0.32, '#ffb3d1', 0.5)], []);
  F('banco', () => [B(0, 0.45, 0, 1.6, 0.08, 0.5, '#3ec05a'), B(0, 0.8, -0.22, 1.6, 0.4, 0.06, '#3ec05a'), B(-0.7, 0.22, 0, 0.08, 0.45, 0.5, '#3a3a4a'), B(0.7, 0.22, 0, 0.08, 0.45, 0.5, '#3a3a4a')], [box(0.8, 0, 0.5, 0.26)], { floor: true });
  // estações e máquinas
  F('bancada', () => [B(0, 0.85, 0, 1.4, 0.16, 0.9, wood), ...[-0.6, 0.6].flatMap((x) => [B(x, 0.42, -0.36, 0.14, 0.84, 0.14, dark), B(x, 0.42, 0.36, 0.14, 0.84, 0.14, dark)]), B(-0.3, 0.98, 0.1, 0.1, 0.1, 0.5, '#c8ccd8'), B(0.35, 0.96, -0.2, 0.3, 0.06, 0.2, '#ff8a3a')], [box(0.7, 0, 0.93, 0.45)], { station: 'bancada', floor: true });
  F('fornalha', () => [B(0, 0.6, 0, 1.1, 1.2, 1, '#8a8696'), B(0, 0.45, 0.48, 0.6, 0.45, 0.08, '#2a1a1a'), S(0, 0.4, 0.5, 0.18, '#ff7a1a', 0.7), C(0.3, 1.5, -0.2, 0.15, 0.6, '#5a5668')], [box(0.55, 0, 1.2, 0.5)], { furnace: true, light: 0xff8a3a });
  F('bigorna', () => [B(0, 0.2, 0, 0.5, 0.4, 0.4, '#5a5668'), B(0, 0.55, 0, 0.35, 0.3, 0.25, '#5a5668'), B(0, 0.78, 0, 1, 0.18, 0.4, '#8a90a0'), { g: G.cone, c: '#8a90a0', m: mat4(0.6, 0.78, 0, 0.12, 0.3, 0.12, 0, 0, -Math.PI / 2) }], [box(0.55, 0, 0.87, 0.22)], { station: 'bigorna' });
  F('oficina', () => [B(0, 0.9, 0, 2, 0.12, 1, '#ffb02e'), B(0, 0.45, 0, 1.9, 0.9, 0.9, '#3a3a4a'), B(0, 1.6, -0.45, 2, 1.2, 0.1, '#5a5668'), C(-0.5, 1.6, -0.38, 0.22, 0.06, '#c8ccd8', Math.PI / 2), C(0.4, 1.4, -0.38, 0.15, 0.06, '#ffd34a', Math.PI / 2), B(0.6, 1.05, 0.1, 0.4, 0.2, 0.3, '#ff4f6a')], [box(1, 0, 1, 0.5)], { station: 'oficina', floor: true });
  F('bau', () => [B(0, 0.35, 0, 1, 0.7, 0.7, '#c8843c'), B(0, 0.78, 0, 1.04, 0.2, 0.74, '#a8642c'), B(0, 0.6, 0.36, 0.18, 0.22, 0.05, '#ffd34a')], [box(0.5, 0, 0.88, 0.35)], { chest: 27, floor: true });
  F('bau_grande', () => [B(0, 0.4, 0, 1.8, 0.8, 0.8, '#8a5aff'), B(0, 0.88, 0, 1.84, 0.2, 0.84, '#6a3ad8'), B(0, 0.65, 0.41, 0.24, 0.26, 0.05, '#ffd34a')], [box(0.9, 0, 0.98, 0.4)], { chest: 54, floor: true });
  F('fogueira', () => [...[0, 1, 2, 3, 4, 5].map((i) => S(Math.cos((i * TAU) / 6) * 0.45, 0.08, Math.sin((i * TAU) / 6) * 0.45, 0.14, '#8a8696')), C(0, 0.1, 0, 0.06, 0.8, dark, 0, 1.2), C(0, 0.1, 0, 0.06, 0.8, dark, 0, -1.2), { g: G.cone, c: '#ff7a1a', m: mat4(0, 0.4, 0, 0.25, 0.6, 0.25) }, { g: G.cone, c: '#ffd34a', m: mat4(0, 0.35, 0, 0.13, 0.4, 0.13) }], [], { furnace: true, light: 0xff8a3a });
  F('canteiro', () => [B(0, 0.1, 0, 1.9, 0.2, 1.9, '#6a4a2a'), ...[-0.6, 0, 0.6].map((x) => B(x, 0.21, 0, 0.3, 0.04, 1.8, '#5a3a20'))], [box(0.95, 0, 0.2, 0.95)], { plot: true, floor: true });
  const R = (id: string, parts: () => Pt[], kind: number) => PDEFS.set(id, { id, snap: 'cell', geo: () => mergeParts(parts()), boxes: [], rail: kind });
  R('trilho', () => [B(-0.42, 0.06, 0, 0.08, 0.1, 2, '#c8ccd8'), B(0.42, 0.06, 0, 0.08, 0.1, 2, '#c8ccd8'), ...[-0.75, -0.25, 0.25, 0.75].map((z) => B(0, 0.02, z, 1.2, 0.06, 0.22, dark))], 1);
  R('trilho_turbo', () => [B(-0.42, 0.06, 0, 0.08, 0.1, 2, '#ffd02e'), B(0.42, 0.06, 0, 0.08, 0.1, 2, '#ffd02e'), ...[-0.75, -0.25, 0.25, 0.75].map((z) => B(0, 0.02, z, 1.2, 0.06, 0.22, '#ff4f6a'))], 2);
  F('vagonete', () => [B(0, 0.45, 0, 1.1, 0.12, 1.5, '#5a5668'), B(-0.55, 0.75, 0, 0.1, 0.6, 1.5, '#8a8696'), B(0.55, 0.75, 0, 0.1, 0.6, 1.5, '#8a8696'), B(0, 0.75, -0.75, 1.2, 0.6, 0.1, '#8a8696'), B(0, 0.75, 0.75, 1.2, 0.6, 0.1, '#8a8696')], [], { cart: true });
  // enfeites
  const flower = (c: string) => () => [C(0, 0.2, 0, 0.02, 0.4, '#5cc24a'), ...[0, 1, 2, 3, 4].map((i) => S(Math.cos((i * TAU) / 5) * 0.08, 0.42, Math.sin((i * TAU) / 5) * 0.08, 0.07, c)), S(0, 0.43, 0, 0.05, '#ffd34a')];
  F('flor_rosa', flower('#ff6aa8'), []);
  F('flor_amarela', flower('#ffd34a'), []);
  F('flor_azul', flower('#5aa8ff'), []);
  const lant = (c: string) => () => [C(0, 0.9, 0, 0.03, 1.8, '#3a3a4a'), S(0, 1.9, 0, 0.25, c, 1.2), S(0, 1.9, 0, 0.12, '#ffffff')];
  F('lanterna_rosa', lant('#ff8ac8'), [box(0.08, 0, 2, 0.08)], { light: 0xff8ac8 });
  F('lanterna_azul', lant('#7ab0ff'), [box(0.08, 0, 2, 0.08)], { light: 0x7ab0ff });
  F('lanterna_verde', lant('#7aff8a'), [box(0.08, 0, 2, 0.08)], { light: 0x7aff8a });
  F('bandeirinhas', () => [C(-1, 1.2, 0, 0.04, 2.4, dark), C(1, 1.2, 0, 0.04, 2.4, dark), ...[0, 1, 2, 3, 4, 5].map((i) => ({ g: G.cone, c: ['#ff4f6a', '#ffd34a', '#5aa8ff'][i % 3], m: mat4(-0.85 + i * 0.34, 2.05 - Math.sin((i / 5) * Math.PI) * 0.15, 0, 0.1, 0.25, 0.03, Math.PI, 0, 0) }))], [box(1, 0, 2.4, 0.05)]);
  F('cata_vento', () => [C(0, 0.8, 0, 0.04, 1.6, dark), ...[0, 1, 2, 3].map((i) => B(0, 1.6, 0.05, 0.08, 0.6, 0.02, i % 2 ? '#5aa8ff' : '#ff4f6a', 0)).map((p, i) => ({ ...p, m: mat4(0, 1.6, 0.06, 0.1, 0.6, 0.02, 0, 0, (i * Math.PI) / 2 + 0.4) }))], [box(0.06, 0, 1.6, 0.06)]);
  F('balao', () => [C(0, 0.9, 0, 0.01, 1.8, '#ffffff'), S(0, 2.1, 0, 0.35, '#ff4f6a', 1.2)], []);
  F('fonte', () => [C(0, 0.25, 0, 1, 0.5, '#c8c4d0'), C(0, 0.47, 0, 0.85, 0.06, '#5ac8ff'), C(0, 0.8, 0, 0.15, 0.8, '#c8c4d0'), S(0, 1.25, 0, 0.25, '#5ac8ff', 0.6)], [box(1, 0, 0.5, 1)]);
  F('totem', () => [C(0, 0.6, 0, 0.35, 1.2, '#d8a060'), C(0, 1.6, 0, 0.32, 0.8, '#c8843c'), S(-0.12, 1.7, 0.3, 0.06, '#2a0b5c'), S(0.12, 1.7, 0.3, 0.06, '#2a0b5c'), B(0, 1.45, 0.3, 0.25, 0.06, 0.04, '#ff4f6a'), B(0, 2.1, 0, 1.1, 0.12, 0.25, '#ff4f6a')], [box(0.35, 0, 2.1, 0.35)]);
  F('planta', () => [C(0, 0.2, 0, 0.2, 0.4, '#d0603a'), S(0, 0.65, 0, 0.32, '#5cc24a', 1.3), S(0.15, 0.85, 0.1, 0.18, '#4fa83e')], [box(0.2, 0, 0.9, 0.2)]);
  F('abobora', () => [S(0, 0.3, 0, 0.36, '#ff8a2e', 0.8), C(0, 0.6, 0, 0.04, 0.15, '#5cc24a'), S(-0.12, 0.35, 0.3, 0.06, '#ffd34a'), S(0.12, 0.35, 0.3, 0.06, '#ffd34a')], [box(0.3, 0, 0.6, 0.3)], { light: 0xffb02e });
  F('sino', () => [C(-0.5, 0.8, 0, 0.05, 1.6, dark), C(0.5, 0.8, 0, 0.05, 1.6, dark), B(0, 1.6, 0, 1.1, 0.1, 0.1, dark), { g: G.cone, c: '#ffd02e', m: mat4(0, 1.3, 0, 0.25, 0.45, 0.25) }], [box(0.55, 0, 1.6, 0.1)]);
  F('muda', () => [C(0, 0.3, 0, 0.04, 0.6, dark), S(0, 0.7, 0, 0.25, '#6cc24a')], []);
  // cultivos (estágios 0..3 desenhados por escala)
  F('crop_trigo', () => [0, 1, 2, 3, 4, 5].map((i) => C(-0.6 + (i % 3) * 0.6, 0.35, -0.4 + Math.floor(i / 3) * 0.8, 0.05, 0.7, '#e8c45a')), []);
  F('crop_batata', () => [0, 1, 2, 3].map((i) => S(-0.5 + (i % 2), 0.25, -0.4 + Math.floor(i / 2) * 0.8, 0.25, '#5cc24a', 0.8)), []);
  F('crop_cenoura', () => [0, 1, 2, 3, 4, 5].map((i) => ({ g: G.cone, c: '#7ad04a', m: mat4(-0.6 + (i % 3) * 0.6, 0.25, -0.4 + Math.floor(i / 3) * 0.8, 0.12, 0.5, 0.12) })), []);
  F('crop_milho', () => [0, 1, 2, 3].flatMap((i) => [C(-0.5 + (i % 2), 0.7, -0.4 + Math.floor(i / 2) * 0.8, 0.06, 1.4, '#7ad04a'), S(-0.42 + (i % 2), 1.05, -0.4 + Math.floor(i / 2) * 0.8, 0.09, '#ffd34a', 2)]), []);
}
defPieces();
export const CROPS: Record<string, { piece: string; grow: number; drop: [string, number][] }> = {
  trigo: { piece: 'crop_trigo', grow: 150, drop: [['trigo', 3], ['semente', 2]] },
  batata: { piece: 'crop_batata', grow: 170, drop: [['batata', 3]] },
  cenoura: { piece: 'crop_cenoura', grow: 140, drop: [['cenoura', 3]] },
  milho: { piece: 'crop_milho', grow: 190, drop: [['milho', 3]] },
};

/* ------------------------------ peças no mundo ------------------------------ */

export interface Piece {
  uid: number;
  id: string;
  x: number;
  y: number;
  z: number;
  /** rotação em quartos de volta (0..3) */
  r: number;
  boxes: SBox[];
  open?: boolean;
  chest?: Slots;
  furnace?: Furnace;
  /** canteiro: cultivo e progresso (0..1) */
  crop?: string;
  grow?: number;
  /** muda: crescimento */
  age?: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

class Batch {
  mesh: THREE.InstancedMesh;
  list: Piece[] = [];
  dirty = true;
  constructor(
    readonly geo: THREE.BufferGeometry,
    private mat: THREE.Material,
    private scene: THREE.Scene,
  ) {
    this.mesh = this.make(16);
  }
  private make(n: number): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(this.geo, this.mat, n);
    m.count = 0;
    m.frustumCulled = false;
    m.castShadow = true;
    m.receiveShadow = true;
    this.scene.add(m);
    return m;
  }
  flush(scaleOf: (p: Piece) => number): void {
    if (!this.dirty) return;
    this.dirty = false;
    if (this.list.length > this.mesh.instanceMatrix.count) {
      this.scene.remove(this.mesh);
      this.mesh.dispose();
      this.mesh = this.make(Math.ceil(this.list.length * 1.5) + 8);
    }
    for (let i = 0; i < this.list.length; i++) {
      const p = this.list[i];
      const k = scaleOf(p);
      const yaw = (p.r * Math.PI) / 2 + (p.open ? -Math.PI / 2 : 0);
      _m.compose(_p.set(p.x, p.y, p.z), _q.setFromAxisAngle(UP, yaw), _s.set(k, k, k));
      if (p.open) {
        // porta aberta: gira em volta da dobradiça (x local = -1)
        const y0 = (p.r * Math.PI) / 2;
        const hx = p.x - Math.cos(y0);
        const hz = p.z + Math.sin(y0);
        _m.setPosition(hx + Math.cos(yaw), p.y, hz - Math.sin(yaw));
      }
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.count = this.list.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.dispose();
  }
}

export class Builds {
  pieces: Piece[] = [];
  private batches = new Map<string, Batch>();
  private mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  private lights: THREE.PointLight[] = [];
  private lightT = 0;
  private uid = 1;
  private glowPos = new Float32Array(256 * 3);
  private glowCol = new Float32Array(256 * 3);
  private glowGeo = new THREE.BufferGeometry();
  private glow: THREE.Points;
  /** espaço para módulos de conteúdo */
  onChange: ((op: 'add' | 'del' | 'upd', p: Piece) => void) | null = null;

  constructor(
    private scene: THREE.Scene,
    private solids: Solids,
    nLights: number,
  ) {
    // brilho das chamas/lâmpadas (pontos aditivos, sempre acesos)
    this.glowGeo.setAttribute('position', new THREE.BufferAttribute(this.glowPos, 3));
    this.glowGeo.setAttribute('color', new THREE.BufferAttribute(this.glowCol, 3));
    this.glowGeo.setDrawRange(0, 0);
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const x = cv.getContext('2d')!;
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.3, 'rgba(255,255,255,.6)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 64, 64);
    const glow = new THREE.Points(this.glowGeo, new THREE.PointsMaterial({ size: 0.9, map: new THREE.CanvasTexture(cv), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    glow.frustumCulled = false;
    glow.renderOrder = 6;
    scene.add(glow);
    this.glow = glow;
    for (let i = 0; i < nLights; i++) {
      const l = new THREE.PointLight(0xffb060, 0, 9, 1.4);
      l.visible = false;
      scene.add(l);
      this.lights.push(l);
    }
  }

  private batch(id: string): Batch | null {
    let b = this.batches.get(id);
    if (b) return b;
    const d = PDEFS.get(id);
    if (!d) return null;
    b = new Batch(d.geo(), this.mat, this.scene);
    this.batches.set(id, b);
    return b;
  }

  private colliders(p: Piece): void {
    for (const b of p.boxes) this.solids.remove(b);
    p.boxes = [];
    const d = PDEFS.get(p.id);
    if (!d) return;
    const a = (p.r * Math.PI) / 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    if (d.door && p.open) return;
    for (const bx of d.boxes) {
      // local → mundo (mesma convenção do THREE: rotação em Y)
      const wx = p.x + bx.x * c + bx.z * s;
      const wz = p.z - bx.x * s + bx.z * c;
      const box = this.solids.makeBox(wx, wz, p.y + bx.y0, p.y + bx.y1, bx.hx, bx.hz, a, 5000 + p.uid);
      this.solids.add(box);
      p.boxes.push(box);
    }
  }

  /** chão (terreno + blocos + construções) — o motor liga; objetos soltos pousam nele */
  ground: ((x: number, y: number, z: number) => number) | null = null;
  /** baú, fornalha, bancadas, cama: objetos soltos que nunca podem ficar flutuando */
  static loose(d: PDef | undefined): boolean {
    // móveis soltos (baú, fornalha, bancadas, cama, mesa…): os de grade (piso, parede, trilho) ficam onde estão
    return !!d && (!!(d.chest || d.furnace || d.station || d.bed) || !!d.floor) && d.snap === 'free' && !d.rail && !d.door;
  }
  private snapY(d: PDef, x: number, y: number, z: number): number {
    if (!this.ground || !Builds.loose(d)) return y;
    const g = this.ground(x, y + 1.2, z);
    return Number.isFinite(g) && Math.abs(g - y) < 8 ? g : y;
  }
  /** depois de mexer no chão: objetos soltos por perto caem até o chão novo */
  settle(x: number, z: number, r: number): void {
    if (!this.ground) return;
    for (const p of this.pieces) {
      if ((p.x - x) ** 2 + (p.z - z) ** 2 > r * r) continue;
      const d = PDEFS.get(p.id);
      if (!Builds.loose(d)) continue;
      for (const bx of p.boxes) bx.off = true; // não se apoia em si mesmo
      const g = this.ground(p.x, p.y + 0.3, p.z);
      for (const bx of p.boxes) bx.off = false;
      if (!Number.isFinite(g) || g >= p.y - 0.04 || p.y - g > 40) continue;
      p.y = g;
      this.colliders(p);
      const b = this.batches.get(p.id);
      if (b) b.dirty = true;
      this.onChange?.('upd', p);
    }
  }

  add(id: string, x: number, y: number, z: number, r: number, uid = 0): Piece | null {
    const b = this.batch(id);
    if (!b) return null;
    y = this.snapY(PDEFS.get(id)!, x, y, z);
    const p: Piece = { uid: uid || this.uid++, id, x, y, z, r: r & 3, boxes: [] };
    if (uid >= this.uid) this.uid = uid + 1;
    const d = PDEFS.get(id)!;
    if (d.chest) p.chest = new Slots(d.chest);
    if (d.furnace) p.furnace = new Furnace();
    if (id === 'muda') p.age = 0;
    this.pieces.push(p);
    b.list.push(p);
    b.dirty = true;
    this.colliders(p);
    this.lightT = 0;
    return p;
  }
  remove(p: Piece): void {
    const i = this.pieces.indexOf(p);
    if (i < 0) return;
    this.pieces.splice(i, 1);
    for (const bx of p.boxes) this.solids.remove(bx);
    const b = this.batches.get(p.id);
    if (b) {
      b.list.splice(b.list.indexOf(p), 1);
      b.dirty = true;
    }
    if (p.crop) this.setCrop(p, '', 0);
    this.lightT = 0;
  }
  byUid(uid: number): Piece | undefined {
    return this.pieces.find((p) => p.uid === uid);
  }
  toggleDoor(p: Piece): void {
    p.open = !p.open;
    this.colliders(p);
    const b = this.batches.get(p.id);
    if (b) b.dirty = true;
  }

  /** cultivo no canteiro: desenha a planta como outra "peça" */
  /** relógios de fornalha/cultivo rodam aqui (false = convidado online) */
  simTimers = true;
  /** online: cada aparelho numera as peças numa faixa própria (sem colisão de uid) */
  uidFrom(n: number): void {
    this.uid = Math.max(this.uid, n);
  }
  /** crescimento do cultivo (desenho muda a cada 1/4) */
  setGrow(p: Piece, grow: number): void {
    if (!p.crop) return;
    const g0 = p.grow ?? 0;
    p.grow = grow;
    if (Math.floor(g0 * 4) !== Math.floor(grow * 4)) {
      const b = this.batches.get(CROPS[p.crop].piece);
      const q = b?.list.find((x) => x.uid === -p.uid);
      if (q && b) {
        q.grow = grow;
        b.dirty = true;
      }
    }
  }
  setCrop(p: Piece, crop: string, grow: number): void {
    const old = p.crop ? CROPS[p.crop]?.piece : '';
    if (old) {
      const b = this.batches.get(old);
      if (b) {
        const i = b.list.findIndex((q) => q.uid === -p.uid);
        if (i >= 0) b.list.splice(i, 1);
        b.dirty = true;
      }
    }
    p.crop = crop || undefined;
    p.grow = crop ? grow : undefined;
    if (!crop) return;
    const b = this.batch(CROPS[crop].piece);
    if (!b) return;
    b.list.push({ uid: -p.uid, id: CROPS[crop].piece, x: p.x, y: p.y + 0.2, z: p.z, r: p.r, boxes: [], grow, crop });
    b.dirty = true;
  }

  /** a mira acerta qual peça? (raio contra as caixas) */
  pick(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): { p: Piece; t: number } | null {
    const hit = { b: null as SBox | null };
    const t = this.solids.ray(ox, oy, oz, dx, dy, dz, max, hit);
    let best: { p: Piece; t: number } | null = null;
    if (hit.b && hit.b.tag >= 5000) {
      const p = this.byUid(hit.b.tag - 5000);
      if (p) best = { p, t };
    }
    // peças sem caixa (tochas, flores, trilhos, tapetes): perto do raio
    for (const p of this.pieces) {
      if (p.boxes.length) continue;
      const ex = p.x - ox;
      const ey = p.y + 0.4 - oy;
      const ez = p.z - oz;
      const tt = ex * dx + ey * dy + ez * dz;
      if (tt < 0 || tt > (best ? best.t : max)) continue;
      const qx = ex - dx * tt;
      const qy = ey - dy * tt;
      const qz = ez - dz * tt;
      if (qx * qx + qy * qy + qz * qz < 0.5 * 0.5) best = { p, t: tt };
    }
    return best;
  }

  /** estação de trabalho mais "forte" a até r metros */
  stationNear(x: number, y: number, z: number, r: number): { st: Station; p: Piece } | null {
    let best: { st: Station; p: Piece } | null = null;
    const rank: Record<string, number> = { bancada: 1, bigorna: 2, oficina: 3 };
    for (const p of this.pieces) {
      const st = PDEFS.get(p.id)?.station;
      if (!st) continue;
      if ((p.x - x) ** 2 + (p.z - z) ** 2 + (p.y - y) ** 2 > r * r) continue;
      if (!best || rank[st] > rank[best.st]) best = { st, p };
    }
    return best;
  }

  /** passo: fornalhas queimam, cultivos crescem, luzes nas fontes mais perto */
  update(dt: number, px: number, py: number, pz: number, dark: number): void {
    // online: só o anfitrião anda os relógios (fornalhas/cultivos); os outros recebem o estado
    if (this.simTimers)
      for (const p of this.pieces) {
        if (p.furnace && (p.furnace.inp || p.furnace.burn > 0)) p.furnace.step(dt);
        if (p.crop && p.grow! < 1) this.setGrow(p, Math.min(1, p.grow! + dt / CROPS[p.crop].grow));
      }
    for (const b of this.batches.values()) b.flush((p) => (p.grow !== undefined && p.uid < 0 ? 0.25 + Math.floor(p.grow * 4) / 4 * 0.75 : 1));
    this.lightT -= dt;
    if (this.lightT > 0) return;
    this.lightT = 0.5;
    // as N fontes de luz mais perto acendem (só faz diferença no escuro)
    const L = this.lights;
    const cand: [number, Piece][] = [];
    for (const p of this.pieces) {
      const d = PDEFS.get(p.id);
      if (!d?.light || (d.furnace && !p.furnace?.lit && p.id === 'fornalha')) continue;
      const d2 = (p.x - px) ** 2 + (p.y - py) ** 2 + (p.z - pz) ** 2;
      if (d2 < 40 * 40) cand.push([d2, p]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    // pontos de brilho em todas as fontes perto
    let gn = 0;
    const gc = new THREE.Color();
    for (const [, p] of cand) {
      if (gn >= 256) break;
      const d = PDEFS.get(p.id)!;
      const top = p.id === 'tocha' ? 1.0 : p.id === 'luminaria' ? 1.75 : p.id.startsWith('lanterna') ? 1.9 : p.id === 'abajur' ? 1.45 : 0.45;
      this.glowPos[gn * 3] = p.x;
      this.glowPos[gn * 3 + 1] = p.y + top;
      this.glowPos[gn * 3 + 2] = p.z;
      gc.setHex(d.light!);
      this.glowCol[gn * 3] = gc.r;
      this.glowCol[gn * 3 + 1] = gc.g;
      this.glowCol[gn * 3 + 2] = gc.b;
      gn++;
    }
    this.glowGeo.setDrawRange(0, gn);
    (this.glowGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.glowGeo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    for (let i = 0; i < L.length; i++) {
      const c = cand[i];
      const l = L[i];
      if (!c || dark < 0.05) {
        l.visible = false;
        l.intensity = 0;
        continue;
      }
      const d = PDEFS.get(c[1].id)!;
      l.visible = true;
      l.color.setHex(d.light!);
      l.intensity = 2.2 * dark;
      l.position.set(c[1].x, c[1].y + (c[1].id === 'luminaria' ? 1.6 : 1), c[1].z);
    }
  }

  /* ------------------------------ encaixe ------------------------------ */

  /**
   * Onde a peça `id` ficaria se colocada mirando no ponto (hx,hy,hz), olhando com yaw.
   * `hitPiece` = peça atingida (para grudar no mesmo nível).
   */
  snap(id: string, hx: number, hy: number, hz: number, yaw: number, rot: number, hitPiece: Piece | null): { x: number; y: number; z: number; r: number } {
    const d = PDEFS.get(id);
    const snap = d?.snap ?? 'free';
    // nível: o da peça atingida (ou o topo dela se mirou em cima), senão o chão em passos de 0,25
    let lv = Math.round(hy * 4) / 4;
    if (hitPiece) {
      const hd = PDEFS.get(hitPiece.id);
      const top = hitPiece.y + Math.max(...(hd?.boxes.map((b) => b.y1) ?? [0]));
      lv = hy > top - 0.25 && hd?.snap !== 'cell' ? top : hitPiece.y + (hd?.id.startsWith('piso') && hy > hitPiece.y - 0.25 ? 0 : 0);
      if (hd?.snap === 'cell' && hd.id.startsWith('piso')) lv = hitPiece.y;
    }
    // giro: de frente para o jogador (quartos de volta) + giro manual
    const face = (Math.round(-yaw / (Math.PI / 2)) + rot + 8) & 3;
    if (snap === 'free') return { x: Math.round(hx * 2) / 2, y: hy, z: Math.round(hz * 2) / 2, r: face };
    const cx = Math.floor(hx / GRID) * GRID + GRID / 2;
    const cz = Math.floor(hz / GRID) * GRID + GRID / 2;
    if (snap === 'cell') return { x: cx, y: lv, z: cz, r: face };
    if (snap === 'corner') return { x: Math.round(hx / GRID) * GRID, y: lv, z: Math.round(hz / GRID) * GRID, r: 0 };
    // aresta mais perto do ponto dentro da célula
    const lx = hx - cx;
    const lz = hz - cz;
    if (Math.abs(lx) > Math.abs(lz)) return { x: cx + Math.sign(lx) * (GRID / 2), y: lv, z: cz, r: 1 + (rot & 1) * 0 };
    return { x: cx, y: lv, z: cz + Math.sign(lz) * (GRID / 2), r: 0 };
  }

  /** já tem peça igual no lugar? */
  occupied(id: string, x: number, y: number, z: number, r: number): boolean {
    const snap = PDEFS.get(id)?.snap;
    for (const p of this.pieces) {
      if (Math.abs(p.x - x) > 0.05 || Math.abs(p.z - z) > 0.05 || Math.abs(p.y - y) > 0.3) continue;
      const ps = PDEFS.get(p.id)?.snap;
      if (snap === 'free' || ps === 'free') {
        if (snap === ps) return true;
        continue;
      }
      if (ps === snap && (snap !== 'cell' || p.id.split('_')[0] === id.split('_')[0] || (p.r & 1) === (r & 1) || true)) return true;
    }
    return false;
  }

  /* ------------------------------ save ------------------------------ */

  toJSON(): unknown[] {
    return this.pieces.map((p) => {
      const o: Record<string, unknown> = { u: p.uid, i: p.id, p: [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100, Math.round(p.z * 100) / 100, p.r] };
      if (p.open) o.o = 1;
      if (p.chest && p.chest.s.some((s) => s)) o.c = p.chest.toJSON();
      if (p.furnace && (p.furnace.inp || p.furnace.out || p.furnace.fuel)) o.f = p.furnace.toJSON();
      if (p.crop) o.g = [p.crop, Math.round(p.grow! * 100) / 100];
      return o;
    });
  }
  load(a: unknown): void {
    if (!Array.isArray(a)) return;
    for (const o of a as any[]) {
      if (!o || typeof o.i !== 'string' || !PDEFS.has(o.i) || !Array.isArray(o.p)) continue;
      const p = this.add(o.i, +o.p[0], +o.p[1], +o.p[2], +o.p[3] | 0, +o.u | 0);
      if (!p) continue;
      if (o.o) this.toggleDoor(p);
      if (o.c && p.chest) p.chest.load(o.c);
      if (o.f && p.furnace) p.furnace.load(o.f);
      if (Array.isArray(o.g) && CROPS[o.g[0]]) this.setCrop(p, o.g[0], +o.g[1] || 0);
    }
  }

  dispose(): void {
    for (const b of this.batches.values()) b.dispose();
    for (const p of this.pieces) for (const b of p.boxes) this.solids.remove(b);
    for (const l of this.lights) this.scene.remove(l);
    this.scene.remove(this.glow);
    this.pieces = [];
  }
}

/** preview fantasma (malha semitransparente da peça) */
export function ghostMesh(id: string): THREE.Mesh | null {
  const d = PDEFS.get(id);
  if (!d) return null;
  const m = new THREE.Mesh(d.geo(), new THREE.MeshBasicMaterial({ color: 0x7aff8a, transparent: true, opacity: 0.45, depthWrite: false }));
  m.renderOrder = 5;
  return m;
}

export const isPlaceable = (itemId: string) => !!ITEM.get(itemId)?.place && PDEFS.has(ITEM.get(itemId)!.place!);
export { PIECE_KINDS };
