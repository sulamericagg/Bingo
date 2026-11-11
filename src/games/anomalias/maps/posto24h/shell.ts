/* ============================================================
 *  POSTO 24h — prédios: loja de conveniência (com escritório e
 *  depósito), banheiro externo; pisos, forros, paredes, janelas,
 *  portas e as luzes internas.
 * ============================================================ */
import type { MapCtx, WallHole } from '../kit2/ctx';
import { ceilLight } from '../kit2/props';
import { doorLeaf } from '../fastfood/shell';
import { TEAL, sign } from './art';

export const HS = 3.4;
const HX = 4.2;

function windows(ctx: MapCtx, room: string, alongX: boolean, c: number, s0: number, holes: WallHole[]): void {
  const v = ctx.g(room, 'vc');
  const gl = ctx.g(room, 'glass');
  for (const hl of holes) {
    if (hl.y0 < 0.01) continue;
    const a = s0 + hl.at - hl.w / 2;
    const mid = s0 + hl.at;
    const hh = hl.y1 - hl.y0;
    const X = (u: number) => (alongX ? u : c);
    const Z = (u: number) => (alongX ? c : u);
    const B = (len: number, h: number, dep: number, u: number, y: number, col: string) => v.box(alongX ? len : dep, h, alongX ? dep : len, X(u), y, Z(u), col);
    B(hl.w, 0.07, 0.24, mid, hl.y0, '#2a3a3a');
    B(hl.w, 0.07, 0.24, mid, hl.y1 - 0.07, '#2a3a3a');
    const n = Math.max(1, Math.round(hl.w / 1.5));
    for (let i = 0; i <= n; i++) B(0.07, hh, 0.24, a + (i / n) * hl.w, hl.y0, '#2a3a3a');
    gl.sharp(alongX ? hl.w : 0.012, hh, alongX ? 0.012 : hl.w, X(mid), hl.y0, Z(mid), '#33405a');
  }
}

export function buildShell(ctx: MapCtx): void {
  // ---------------------------------------------------------------- luzes internas (loja clara, como de verdade)
  for (const x of [-7.5, -4.5, -1.5, 1.8])
    for (const z of [4.0, 8.5, 13.0]) ceilLight(ctx, 'loja', x, z, HS, 'tube', '#f2f8ff', 0.5, 6.5, ['loja']);
  ceilLight(ctx, 'escritorio', 7, 4.5, HS, 'panel', '#fff0d8', 0.42, 5, ['escritorio']);
  ceilLight(ctx, 'deposito', 7, 9.5, HS, 'tube', '#e8f0ff', 0.5, 6, ['deposito']);
  ceilLight(ctx, 'deposito', 7, 13.8, HS, 'tube', '#e8f0ff', 0.45, 6, ['deposito']);
  ceilLight(ctx, 'banheiro', 14, 6.5, 3.0, 'panel', '#fff6e0', 0.7, 5, ['banheiro']);
  // luz de preenchimento (rebatida) nas salas pequenas: o forro não fica preto
  ctx.light(['escritorio'], 7, 1.2, 4.5, '#fff0d8', 0.12, 7, 4, 1);
  ctx.light(['deposito'], 7, 1.2, 11.5, '#e8f0ff', 0.12, 8, 5, 1);
  ctx.light(['banheiro'], 14, 1.2, 6.5, '#fff6e0', 0.16, 5, 3, 1);
  ctx.light(['loja'], -3, 1.0, 9, '#f2f8ff', 0.12, 14, 8, 1);
  // luz das geladeiras (frente da parede sul)
  ctx.light(['loja'], -5, 1.2, 15.0, '#d8f0ff', 0.45, 5, 2.5, 0.4);

  // ---------------------------------------------------------------- pisos e forros
  ctx.floor('loja', 'vinyl', -10, 2, 4, 16);
  ctx.floor('escritorio', 'carpet', 4, 2, 10, 7, '#5a6474');
  ctx.floor('deposito', 'concrete', 4, 7, 10, 16, '#a8a49c');
  ctx.floor('banheiro', 'btile', 12, 4, 16, 9);
  for (const [r, x0, z0, x1, z1, h] of [
    ['loja', -10, 2, 4, 16, HS],
    ['escritorio', 4, 2, 10, 7, HS],
    ['deposito', 4, 7, 10, 16, HS],
    ['banheiro', 12, 4, 16, 9, 3.0],
  ] as [string, number, number, number, number, number][])
    ctx.floor(r, r === 'deposito' ? 'wall' : 'ceil', x0, z0, x1, z1, '#ffffff', h, true, 0.75);

  // ---------------------------------------------------------------- paredes da loja
  const EXT = '#e8e2d6';
  const EXTLOW = '#3a4a4e';
  const IN = '#f2f0ea';
  const INLOW = TEAL;
  const W = ctx.wall.bind(ctx);
  // frente (z = 2) com vitrine e porta dupla
  const front: WallHole[] = [
    { at: 2.5, w: 4.4, y0: 0.6, y1: 2.7 },
    { at: 8.0, w: 1.9, y0: 0, y1: 2.5 },
    { at: 11.3, w: 3.6, y0: 0.6, y1: 2.7 },
  ];
  W(['patio', 'loja'], -10, 2, 4, 2, { h: HX, holes: front, col: [EXT, IN], low: [EXTLOW, INLOW], lowH: 0.6 });
  windows(ctx, 'loja', true, 2, -10, front);
  const offW: WallHole[] = [{ at: 3, w: 1.6, y0: 1.0, y1: 2.2 }];
  W(['patio', 'escritorio'], 4, 2, 10, 2, { h: HX, holes: offW, col: [EXT, '#d8d2c4'], low: [EXTLOW, '#6a6a72'] });
  windows(ctx, 'escritorio', true, 2, 4, offW);
  // leste (x = 10)
  W(['escritorio', 'patio'], 10, 2, 10, 7, { h: HX, col: ['#d8d2c4', EXT], low: ['#6a6a72', EXTLOW] });
  W(['deposito', 'patio'], 10, 7, 10, 16, { h: HX, col: ['#c8c4bc', EXT], low: ['#8a8a8a', EXTLOW], holes: [{ at: 5.5, w: 1.0, y0: 0, y1: 2.2 }] });
  ctx.box(9.85, 12, 10.15, 13, 0, 3); // porta dos fundos (fechada; a folha é anomalia)
  // sul (z = 16)
  W(['loja', 'patio'], -10, 16, 4, 16, { h: HX, col: [IN, EXT], low: [INLOW, EXTLOW] });
  W(['deposito', 'patio'], 4, 16, 10, 16, { h: HX, col: ['#c8c4bc', EXT], low: ['#8a8a8a', EXTLOW] });
  // oeste (x = −10) com janela do cantinho do café
  const west: WallHole[] = [{ at: 3.2, w: 2.6, y0: 0.9, y1: 2.5 }];
  W(['patio', 'loja'], -10, 2, -10, 16, { h: HX, holes: west, col: [EXT, IN], low: [EXTLOW, INLOW] });
  windows(ctx, 'loja', false, -10, 2, west);
  // internas
  W(['loja', 'escritorio'], 4, 2, 4, 7, { col: [IN, '#d8d2c4'], low: [INLOW, '#6a6a72'], holes: [{ at: 3.6, w: 0.95, y0: 0, y1: 2.2 }] });
  W(['loja', 'deposito'], 4, 7, 4, 16, { col: [IN, '#c8c4bc'], low: [INLOW, '#8a8a8a'], holes: [{ at: 6.5, w: 1.1, y0: 0, y1: 2.2 }] });
  W(['escritorio', 'deposito'], 4, 7, 10, 7, { col: ['#d8d2c4', '#c8c4bc'], low: ['#6a6a72', '#8a8a8a'] });
  // batentes
  for (const [rA, rB, z, w] of [
    ['loja', 'escritorio', 5.6, 0.95],
    ['loja', 'deposito', 13.5, 1.1],
  ] as [string, string, number, number][]) {
    for (const [r, off] of [
      [rA, -0.11],
      [rB, 0.11],
    ] as [string, number][]) {
      const g = ctx.g(r, 'vc');
      g.box(0.04, 2.2, 0.08, 4 + off, 0, z - w / 2 - 0.02, '#5a6a6a');
      g.box(0.04, 2.2, 0.08, 4 + off, 0, z + w / 2 + 0.02, '#5a6a6a');
      g.box(0.04, 0.08, w + 0.2, 4 + off, 2.2, z, '#5a6a6a');
    }
  }
  ctx.refs.set('doorOffice', doorLeaf(ctx, 'escritorio', 4.08, 5.13, 0.95, 2.15, 'z', 1, '#7a8a8a', 1.5));
  ctx.refs.set('doorStore', doorLeaf(ctx, 'deposito', 4.08, 12.95, 1.1, 2.15, 'z', 1, '#7a8a8a', 1.45));
  // portas de vidro da frente (fechadas)
  // portas de vidro da frente: automáticas (abrem quando a câmera chega perto — ver visibleFrom)
  const dl = doorLeaf(ctx, 'loja', -2.95, 2, 0.93, 2.42, 'x', 1, '#2a3a3a', 0, true);
  const dr = doorLeaf(ctx, 'loja', -1.05, 2, 0.93, 2.42, 'x', -1, '#2a3a3a', 0, true);
  ctx.autoDoor(dl, 1.35, -2, 2);
  ctx.autoDoor(dr, -1.35, -2, 2);
  ctx.refs.set('doorFrontL', dl);
  ctx.refs.set('doorFrontR', dr);

  // ---------------------------------------------------------------- telhado e marquise da loja
  {
    const e = ctx.g('patio', 'vc');
    e.sharp(20.4, 0.12, 14.4, 0, HX - 0.12, 9, '#2a2e34');
    e.sharp(20.6, 0.7, 0.08, 0, 3.5, 1.86, TEAL);
    e.sharp(20.6, 0.08, 0.1, 0, 3.42, 1.85, '#ffd23a');
    // marquise sobre a calçada
    e.box(20.4, 0.16, 1.9, 0, 3.0, 0.95, '#e8e2d6');
    for (let i = 0; i < 10; i++) ctx.g('patio', 'glow').cyl(0.08, 0.08, 0.01, -9 + i * 2, 2.99, 0.95, '#fff6e0', 10);
    for (const x of [-9.8, 9.8]) e.cyl(0.08, 0.08, 3.0, x, 0, 0.2, '#5a6a6a', 10);
    ctx.boxAt(-9.8, 0.2, 0.2, 0.2);
    ctx.boxAt(9.8, 0.2, 0.2, 0.2);
    for (const x of [-8, -4, 0, 4, 8]) ctx.light(['patio'], x, 2.8, 0.95, '#fff2d8', 0.45, 5, 0.4, 0.15, true);
  }

  // ---------------------------------------------------------------- banheiro externo (x 12..16, z 4..9)
  W(['patio', 'banheiro'], 12, 4, 12, 9, { h: 3.0, col: [EXT, '#e8f2f0'], low: [EXTLOW, '#5ab8a8'], mat: ['wall', 'btile'], holes: [{ at: 2.5, w: 0.9, y0: 0, y1: 2.1 }] });
  W(['banheiro', 'patio'], 16, 4, 16, 9, { h: 3.0, col: ['#e8f2f0', EXT], low: ['#5ab8a8', EXTLOW], mat: ['btile', 'wall'] });
  W(['patio', 'banheiro'], 12, 4, 16, 4, { h: 3.0, col: [EXT, '#e8f2f0'], low: [EXTLOW, '#5ab8a8'], mat: ['wall', 'btile'] });
  W(['banheiro', 'patio'], 12, 9, 16, 9, { h: 3.0, col: ['#e8f2f0', EXT], low: ['#5ab8a8', EXTLOW], mat: ['btile', 'wall'] });
  {
    const e = ctx.g('patio', 'vc');
    e.sharp(4.5, 0.12, 5.5, 14, 2.98, 6.5, '#2a2e34');
    e.box(0.3, 0.2, 0.3, 11.8, 2.4, 6.5, '#3a3e46');
    ctx.g('patio', 'glow').sph(0.1, 11.7, 2.35, 6.5, '#fff0c0', 1, 1, 1, 8);
    ctx.light(['patio'], 11.4, 2.3, 6.5, '#ffe0a0', 0.55, 5, 0.3, 0.2);
    ctx.picture('patio', sign('BANHEIRO', '#2a6ad8', '#ffffff', 256, 80, 34), 0.6, 0.19, 11.88, 2.0, 7.6, -Math.PI / 2);
  }
  ctx.refs.set('doorWC', doorLeaf(ctx, 'banheiro', 12.08, 6.05, 0.9, 2.05, 'z', 1, '#5ab8a8', 1.25));
}
