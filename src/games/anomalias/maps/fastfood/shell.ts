/* ============================================================
 *  LANCHONETE — casca do prédio: luzes, pisos, forros, paredes,
 *  janelas com caixilho, portas (folhas giram num pivô).
 * ============================================================ */
import * as THREE from 'three';
import type { MapCtx, WallHole } from '../kit2/ctx';
import { ceilLight, halo } from '../kit2/props';

export const H = 3.2;
const HX = 4.0;
const WIN0 = 0.8;
const WIN1 = 2.6;
const FRONT: [string, string, string, string] = ['kids', 'salao', 'balcao', 'drive'];
const FRONT3 = ['kids', 'salao', 'balcao'];

/** folha de porta num pivô (dobradiça em hx,hz). axis 'x' = porta fechada ao longo de X */
export function doorLeaf(ctx: MapCtx, room: string, hx: number, hz: number, w: number, h: number, axis: 'x' | 'z', dir: 1 | -1, col: string, open: number, glass = false): THREE.Group {
  const piv = new THREE.Group();
  piv.position.set(hx, 0, hz);
  ctx.root.add(piv);
  const g = ctx.gb('vc');
  const t = 0.045;
  const lx = axis === 'x' ? (dir * w) / 2 : 0;
  const lz = axis === 'z' ? (dir * w) / 2 : 0;
  if (glass) {
    // caixilho de alumínio + vidro
    const fw = 0.07;
    const L = (a: number, b: number, c: number, x: number, y: number, z: number) => g.box(axis === 'x' ? a : c, b, axis === 'x' ? c : a, x, y, z, col);
    L(w, fw, t, lx, 0, lz);
    L(w, fw, t, lx, h - fw, lz);
    L(fw, h, t, axis === 'x' ? lx - (dir * w) / 2 + (dir * fw) / 2 : lx, 0, axis === 'z' ? lz - (dir * w) / 2 + (dir * fw) / 2 : lz);
    L(fw, h, t, axis === 'x' ? lx + (dir * w) / 2 - (dir * fw) / 2 : lx, 0, axis === 'z' ? lz + (dir * w) / 2 - (dir * fw) / 2 : lz);
    L(w, 0.05, t + 0.02, lx, 1.0, lz);
    const gl = ctx.gb('glass');
    gl.sharp(axis === 'x' ? w - 0.1 : 0.01, h - 0.12, axis === 'x' ? 0.01 : w - 0.1, lx, 0.06, lz, '#33405a');
    const gm = ctx.mesh(room, gl, 'glass', 0, 0, 0, 0, piv);
    gm.renderOrder = 5;
  } else {
    g.box(axis === 'x' ? w : t, h, axis === 'x' ? t : w, lx, 0, lz, col);
    // puxador
    const px = axis === 'x' ? lx + dir * (w / 2 - 0.1) : 0.05;
    const pz = axis === 'z' ? lz + dir * (w / 2 - 0.1) : 0.05;
    g.cyl(0.02, 0.02, 0.14, px, 1.0, pz, '#c8ccd2', 8, axis === 'x' ? Math.PI / 2 : 0, axis === 'z' ? Math.PI / 2 : 0);
    g.cyl(0.02, 0.02, 0.14, axis === 'x' ? px : -0.05, 1.0, axis === 'z' ? pz : -0.05, '#c8ccd2', 8, axis === 'x' ? Math.PI / 2 : 0, axis === 'z' ? Math.PI / 2 : 0);
  }
  ctx.mesh(room, g, 'vc', 0, 0, 0, 0, piv);
  piv.rotation.y = open;
  piv.userData.closed = 0;
  return piv;
}

function windows(ctx: MapCtx, room: string, alongX: boolean, c: number, s0: number, holes: WallHole[]): void {
  const v = ctx.g(room, 'vc');
  const gl = ctx.g(room, 'glass');
  for (const hl of holes) {
    if (hl.y0 < 0.01) continue;
    const a = s0 + hl.at - hl.w / 2;
    const b = s0 + hl.at + hl.w / 2;
    const mid = (a + b) / 2;
    const hh = hl.y1 - hl.y0;
    const X = (u: number) => (alongX ? u : c);
    const Z = (u: number) => (alongX ? c : u);
    const B = (len: number, h: number, dep: number, u: number, y: number, col: string) => v.box(alongX ? len : dep, h, alongX ? dep : len, X(u), y, Z(u), col);
    // caixilho
    B(hl.w, 0.07, 0.24, mid, hl.y0, '#3a3a46');
    B(hl.w, 0.07, 0.24, mid, hl.y1 - 0.07, '#3a3a46');
    const n = Math.max(1, Math.round(hl.w / 1.3));
    for (let i = 0; i <= n; i++) B(0.07, hh, 0.24, a + (i / n) * hl.w, hl.y0, '#3a3a46');
    // peitoril (madeira, lado de dentro)
    v.box(alongX ? hl.w + 0.1 : 0.22, 0.05, alongX ? 0.22 : hl.w + 0.1, X(mid), hl.y0 - 0.05, Z(mid), '#9a6a44');
    gl.sharp(alongX ? hl.w : 0.012, hh, alongX ? 0.012 : hl.w, X(mid), hl.y0, Z(mid), '#33405a');
  }
}

export function buildShell(ctx: MapCtx): void {
  // ---------------------------------------------------------------- luzes
  // salão: placas no forro + pendentes quentes sobre as cabines
  for (const x of [-4.8, -1.3, 2.2])
    for (const z of [0.6, 4.2]) ceilLight(ctx, 'salao', x, z, H, 'panel', '#ffe9c8', 0.5, 7, FRONT3);
  for (const x of [-4.6, 1.1, 3.0]) {
    const v = ctx.g('salao', 'vc');
    v.cyl(0.006, 0.006, 1.05, x, H - 1.05, 8.3, '#222', 4);
    v.lathe(
      [
        [0.02, 0.26],
        [0.06, 0.24],
        [0.2, 0.04],
        [0.22, 0],
        [0.0, 0],
      ],
      x,
      H - 1.32,
      8.3,
      '#d8302a',
      16,
    );
    ctx.g('salao', 'glow').cyl(0.16, 0.16, 0.01, x, H - 1.33, 8.3, '#fff0c0', 14);
    ctx.light(FRONT3, x, H - 1.45, 8.3, '#ffcf8a', 0.75, 5, 0.5, 0.1);
  }
  // kids: spots coloridos
  for (const [x, z, c] of [
    [-10.5, 0.5, '#ffd8f0'],
    [-8.2, 3.2, '#d8f0ff'],
    [-10.5, 6.2, '#fff2c8'],
    [-8.2, 7.6, '#e8ffd8'],
  ] as [number, number, string][])
    ceilLight(ctx, 'kids', x, z, H, 'round', c, 0.55, 6, FRONT3);
  // balcão: lado da fila e lado dos funcionários + brilho dos cardápios
  for (const x of [5.4, 8.6]) {
    ceilLight(ctx, 'balcao', x, 5.6, H, 'panel', '#ffe9c8', 0.5, 7, FRONT3);
    ceilLight(ctx, 'balcao', x, 0.0, H, 'panel', '#fff4e0', 0.55, 6, ['balcao', 'drive']);
  }
  ctx.light(['balcao', 'salao'], 7, 2.6, -1.4, '#ffe2b8', 0.45, 6, 0.8, 0.3);
  ceilLight(ctx, 'drive', 11, -0.3, H, 'panel', '#f4f0ff', 0.55, 5, ['drive']);
  // cozinha: calhas de tubo branco-frio, mais forte
  for (const x of [2.2, 5.6, 9.2])
    for (const z of [-7.2, -4.0]) ceilLight(ctx, 'cozinha', x, z, H, 'tube', '#eef6ff', 0.6, 6.5, ['cozinha']);
  ceilLight(ctx, 'camara', 10, -10.5, H, 'panel', '#cfe8ff', 0.6, 5, ['camara']);
  // banheiros: frio
  ceilLight(ctx, 'banheiros', -9.4, -6.6, H, 'panel', '#eef4ff', 0.6, 6, ['banheiros']);
  ceilLight(ctx, 'banheiros', -7.4, -5.0, H, 'panel', '#eef4ff', 0.6, 6, ['banheiros']);
  ceilLight(ctx, 'banheiros', -7.2, -3.4, H, 'round', '#eef4ff', 0.4, 4, ['banheiros']);
  // escritório: penumbra (uma luminária só + abajur na mesa, ver móveis)
  ceilLight(ctx, 'escritorio', -1.6, -4.2, H, 'panel', '#fff0d8', 0.42, 6, ['escritorio']);
  ctx.light(['escritorio'], -4.3, 1.4, -8.0, '#9affc8', 0.35, 3, 0.4, 0.4); // monitores

  // luz de preenchimento (rebatida): forros e cantos não ficam pretos
  ctx.light(['escritorio'], -3, 1.2, -5.5, '#fff0d8', 0.1, 7, 4, 1);
  ctx.light(['banheiros'], -9, 1.2, -5.5, '#eef4ff', 0.12, 7, 4, 1);
  ctx.light(['cozinha'], 6, 1.0, -5.5, '#eef6ff', 0.1, 10, 6, 1);
  ctx.light(['camara'], 10, 1.0, -10.5, '#cfe8ff', 0.12, 5, 3, 1);
  ctx.light(['drive'], 11, 1.0, -0.3, '#f4f0ff', 0.1, 4, 2, 1);

  // ---------------------------------------------------------------- pisos e forros
  ctx.floor('kids', 'rubber', -12, -2, -6.5, 9);
  ctx.floor('salao', 'checker', -6.5, -2, 4, 9);
  ctx.floor('balcao', 'checker', 4, 1.65, 10, 9);
  ctx.floor('balcao', 'quarry', 4, -2, 10, 1.65);
  ctx.floor('drive', 'quarry', 10, -2, 12, 1.5);
  ctx.floor('cozinha', 'quarry', 0, -9, 12, -2);
  ctx.floor('camara', 'plate', 8, -12, 12, -9, '#aab8c4');
  ctx.floor('banheiros', 'hex', -12, -9, -6, -2);
  ctx.floor('escritorio', 'carpet', -6, -9, 0, -2, '#566884');
  for (const [r, x0, z0, x1, z1, m] of [
    ['kids', -12, -2, -6.5, 9, 'ceil'],
    ['salao', -6.5, -2, 4, 9, 'ceil'],
    ['balcao', 4, -2, 10, 9, 'ceil'],
    ['drive', 10, -2, 12, 1.5, 'ceil'],
    ['cozinha', 0, -9, 12, -2, 'wall'],
    ['camara', 8, -12, 12, -9, 'plate'],
    ['banheiros', -12, -9, -6, -2, 'ceil'],
    ['escritorio', -6, -9, 0, -2, 'ceil'],
  ] as [string, number, number, number, number, string][])
    ctx.floor(r, m, x0, z0, x1, z1, m === 'plate' ? '#c8d4dc' : '#ffffff', H, true, 0.75);

  // ---------------------------------------------------------------- paredes externas
  const EXT: [string, string] = ['#f2dcb4', '#f2dcb4'];
  const EXTLOW: [string, string] = ['#8a2e28', '#8a2e28'];
  const diner = (inside: string, insideFirst: boolean) => {
    const cin = inside === 'kids' ? '#cfe6ff' : '#f6e8ce';
    const lin = inside === 'kids' ? '#ffcf4a' : '#c8463c';
    return {
      col: (insideFirst ? [cin, EXT[1]] : [EXT[0], cin]) as [string, string],
      low: (insideFirst ? [lin, EXTLOW[1]] : [EXTLOW[0], lin]) as [string, string],
    };
  };
  const W = (rooms: [string, string], x0: number, z0: number, x1: number, z1: number, o: Parameters<MapCtx['wall']>[5]) => ctx.wall(rooms, x0, z0, x1, z1, o);
  // fachada sul (z = 9)
  const winK: WallHole[] = [{ at: 2.75, w: 4.2, y0: WIN0, y1: WIN1 }];
  const winS: WallHole[] = [
    { at: 1.75, w: 2.9, y0: WIN0, y1: WIN1 },
    { at: 5.5, w: 1.9, y0: 0, y1: 2.45 },
    { at: 8.4, w: 3.4, y0: WIN0, y1: WIN1 },
  ];
  const winB: WallHole[] = [{ at: 3, w: 4.6, y0: WIN0, y1: WIN1 }];
  W(['kids', 'estac'], -12, 9, -6.5, 9, { h: HX, holes: winK, ...diner('kids', true) });
  W(['salao', 'estac'], -6.5, 9, 4, 9, { h: HX, holes: winS, ...diner('salao', true) });
  W(['balcao', 'estac'], 4, 9, 10, 9, { h: HX, holes: winB, ...diner('balcao', true) });
  windows(ctx, 'kids', true, 9, -12, winK);
  windows(ctx, 'salao', true, 9, -6.5, winS);
  windows(ctx, 'balcao', true, 9, 4, winB);
  // fachada leste (x = 10, z 1,5..9) e saliência do drive
  const winE: WallHole[] = [{ at: 4.2, w: 4.6, y0: WIN0, y1: WIN1 }];
  W(['balcao', 'estac'], 10, 1.5, 10, 9, { h: HX, holes: winE, ...diner('balcao', true) });
  windows(ctx, 'balcao', false, 10, 1.5, winE);
  W(['drive', 'estac'], 10, 1.5, 12, 1.5, { h: HX, col: ['#e8dcc4', EXT[1]], low: ['#c8463c', EXTLOW[1]] });
  const winD: WallHole[] = [{ at: 1.7, w: 1.1, y0: 0.95, y1: 1.95 }];
  W(['drive', 'estac'], 12, -2, 12, 1.5, { h: HX, holes: winD, col: ['#e8dcc4', EXT[1]], low: ['#c8463c', EXTLOW[1]] });
  W(['cozinha', 'estac'], 12, -9, 12, -2, { h: HX, mat: ['ktile', 'wall'], col: ['#ffffff', EXT[1]], low: ['', EXTLOW[1]], holes: [{ at: 3.5, w: 1.0, y0: 0, y1: 2.2 }] });
  // porta dos fundos da cozinha (fechada, com barra antipânico)
  {
    const v = ctx.g('cozinha', 'vc');
    v.box(0.05, 2.2, 1.0, 11.95, 0, -5.5, '#7a8088');
    v.box(0.08, 0.06, 0.8, 11.88, 1.0, -5.5, '#c8ccd2');
    ctx.g('cozinha', 'glow').box(0.02, 0.18, 0.5, 11.9, 2.4, -5.5, '#3aff7a');
    ctx.g('estac', 'vc').box(0.05, 2.2, 1.0, 12.05, 0, -5.5, '#6a7078');
    ctx.box(11.8, -6, 12.1, -5, 0, 3);
  }
  // norte (z = −9) e câmara fria
  W(['estac', 'banheiros'], -12, -9, -6, -9, { h: HX, mat: ['wall', 'rtile'], col: [EXT[0], '#e8f2f6'], low: [EXTLOW[0], '#6ab4dc'] });
  W(['estac', 'escritorio'], -6, -9, 0, -9, { h: HX, col: [EXT[0], '#d6d0c4'], low: [EXTLOW[0], '#7a6a5a'] });
  W(['estac', 'cozinha'], 0, -9, 8, -9, { h: HX, mat: ['wall', 'ktile'], col: [EXT[0], '#ffffff'], low: [EXTLOW[0], ''] });
  W(['camara', 'cozinha'], 8, -9, 12, -9, { h: HX, mat: ['plate', 'ktile'], col: ['#c8d4dc', '#ffffff'], low: ['', ''], holes: [{ at: 2, w: 1.1, y0: 0, y1: 2.2 }], base: false });
  ctx.box(9.45, -9.12, 10.55, -8.88, 0, 2.2); // porta da câmara (fechada)
  W(['estac', 'camara'], 8, -12, 12, -12, { h: HX, mat: ['wall', 'plate'], col: [EXT[0], '#c8d4dc'], low: [EXTLOW[0], ''], base: false });
  W(['estac', 'camara'], 8, -12, 8, -9, { h: HX, mat: ['wall', 'plate'], col: [EXT[0], '#c8d4dc'], low: [EXTLOW[0], ''], base: false });
  W(['camara', 'estac'], 12, -12, 12, -9, { h: HX, mat: ['plate', 'wall'], col: ['#c8d4dc', EXT[1]], low: ['', EXTLOW[1]], base: false });
  // oeste (x = −12)
  W(['estac', 'banheiros'], -12, -9, -12, -2, { h: HX, mat: ['wall', 'rtile'], col: [EXT[0], '#e8f2f6'], low: [EXTLOW[0], '#6ab4dc'] });
  const winW: WallHole[] = [
    { at: 3.6, w: 3.4, y0: WIN0, y1: WIN1 },
    { at: 8.4, w: 3.4, y0: WIN0, y1: WIN1 },
  ];
  W(['estac', 'kids'], -12, -2, -12, 9, { h: HX, holes: winW, ...diner('kids', false) });
  windows(ctx, 'kids', false, -12, -2, winW);

  // ---------------------------------------------------------------- paredes internas
  W(['banheiros', 'kids'], -12, -2, -6.5, -2, { mat: ['rtile', 'wall'], col: ['#e8f2f6', '#cfe6ff'], low: ['#6ab4dc', '#ffcf4a'], holes: [{ at: 3.3, w: 1.0, y0: 0, y1: 2.2 }] });
  W(['banheiros', 'salao'], -6.5, -2, -6, -2, { mat: ['rtile', 'wall'], col: ['#e8f2f6', '#f6e8ce'], low: ['#6ab4dc', '#c8463c'] });
  W(['escritorio', 'salao'], -6, -2, 0, -2, { col: ['#d6d0c4', '#f6e8ce'], low: ['#7a6a5a', '#c8463c'], holes: [{ at: 3.6, w: 1.0, y0: 0, y1: 2.2 }] });
  W(['cozinha', 'salao'], 0, -2, 4, -2, { mat: ['ktile', 'wall'], col: ['#ffffff', '#f6e8ce'], low: ['', '#c8463c'] });
  W(['cozinha', 'balcao'], 4, -2, 10, -2, {
    mat: ['ktile', 'wall'],
    col: ['#ffffff', '#f6e8ce'],
    low: ['', '#8a2e28'],
    holes: [
      { at: 2.75, w: 1.3, y0: 0, y1: 2.15 },
      { at: 4.75, w: 1.4, y0: 1.05, y1: 1.8 },
    ],
  });
  W(['cozinha', 'drive'], 10, -2, 12, -2, { mat: ['ktile', 'wall'], col: ['#ffffff', '#e8dcc4'], low: ['', '#c8463c'], holes: [{ at: 1.0, w: 0.9, y0: 0, y1: 2.15 }] });
  W(['banheiros', 'escritorio'], -6, -9, -6, -2, { mat: ['rtile', 'wall'], col: ['#e8f2f6', '#d6d0c4'], low: ['#6ab4dc', '#7a6a5a'] });
  W(['escritorio', 'cozinha'], 0, -9, 0, -2, { mat: ['wall', 'ktile'], col: ['#d6d0c4', '#ffffff'], low: ['#7a6a5a', ''], holes: [{ at: 4.5, w: 1.0, y0: 0, y1: 2.2 }] });
  W(['balcao', 'drive'], 10, -2, 10, 1.5, { col: ['#f6e8ce', '#e8dcc4'], low: ['#8a2e28', '#c8463c'], holes: [{ at: 1.8, w: 1.1, y0: 0, y1: 2.2 }] });

  // batentes das portas internas
  const jamb = (room2: [string, string], alongX: boolean, c: number, u: number, w: number) => {
    for (let s = 0; s < 2; s++) {
      const g = ctx.g(room2[s], 'vc');
      const off = (s ? 1 : -1) * 0.11;
      if (alongX) {
        g.box(0.08, 2.2, 0.04, u - w / 2 - 0.02, 0, c + off, '#8a6a4a');
        g.box(0.08, 2.2, 0.04, u + w / 2 + 0.02, 0, c + off, '#8a6a4a');
        g.box(w + 0.2, 0.08, 0.04, u, 2.2, c + off, '#8a6a4a');
      } else {
        g.box(0.04, 2.2, 0.08, c + off, 0, u - w / 2 - 0.02, '#8a6a4a');
        g.box(0.04, 2.2, 0.08, c + off, 0, u + w / 2 + 0.02, '#8a6a4a');
        g.box(0.04, 0.08, w + 0.2, c + off, 2.2, u, '#8a6a4a');
      }
    }
  };
  jamb(['banheiros', 'kids'], true, -2, -8.7, 1.0);
  jamb(['escritorio', 'salao'], true, -2, -2.4, 1.0);
  jamb(['escritorio', 'cozinha'], false, 0, -4.5, 1.0);
  jamb(['cozinha', 'drive'], true, -2, 11, 0.9);
  jamb(['balcao', 'drive'], false, 10, -0.2, 1.1);

  // folhas de porta (abertas encostadas; anomalia 'door' fecha/abre errado)
  ctx.refs.set('doorWC', doorLeaf(ctx, 'kids', -8.2, -2.08, 1.0, 2.15, 'x', -1, '#7ab8d8', -1.45));
  ctx.refs.set('doorOffice', doorLeaf(ctx, 'escritorio', -2.9, -2.08, 1.0, 2.15, 'x', 1, '#a87a52', -1.5));
  ctx.refs.set('doorOfficeK', doorLeaf(ctx, 'cozinha', 0.08, -5.0, 1.0, 2.15, 'z', 1, '#a87a52', -1.45));
  // porta da câmara fria (fechada: grossa, inox, com trinco)
  {
    const piv = new THREE.Group();
    piv.position.set(9.45, 0, -8.88);
    ctx.root.add(piv);
    const g = ctx.gb('steel');
    g.box(1.1, 2.18, 0.12, 0.55, 0, 0, '#d8dee4');
    g.box(0.08, 0.32, 0.1, 1.0, 0.95, 0.1, '#888e98');
    g.box(0.26, 0.05, 0.05, 0.9, 1.2, 0.12, '#888e98');
    g.sharp(0.6, 0.2, 0.01, 0.55, 1.6, 0.065, '#3a7ad8');
    ctx.mesh('cozinha', g, 'steel', 0, 0, 0, 0, piv);
    ctx.refs.set('doorFreezer', piv);
  }
  // porta de entrada: duas folhas de vidro
  // porta de entrada: automática (abre com a câmera por perto — ver visibleFrom)
  const dl = doorLeaf(ctx, 'salao', -1.93, 9, 0.93, 2.42, 'x', 1, '#3a3a46', 0, true);
  const dr = doorLeaf(ctx, 'salao', -0.07, 9, 0.93, 2.42, 'x', -1, '#3a3a46', 0, true);
  ctx.autoDoor(dl, -1.35, -1, 9);
  ctx.autoDoor(dr, 1.35, -1, 9);
  ctx.refs.set('doorFrontL', dl);
  ctx.refs.set('doorFrontR', dr);

  // ---------------------------------------------------------------- telhado, platibanda, letreiro de fachada
  {
    const e = ctx.g('estac', 'vc');
    e.sharp(24.4, 0.1, 18.4, 0, HX - 0.1, 0, '#2a2a30');
    e.sharp(4.4, 0.1, 3.4, 10, HX - 0.1, -10.5, '#2a2a30');
    e.sharp(2.4, 0.1, 3.9, 11, HX - 0.1, -0.25, '#2a2a30');
    // faixa vermelha da platibanda (sul e leste) + friso amarelo
    e.sharp(22.4, 0.7, 0.06, -1, 3.3, 9.13, '#d8302a');
    e.sharp(22.4, 0.08, 0.08, -1, 3.22, 9.14, '#ffc83a');
    e.sharp(0.06, 0.7, 7.6, 10.13, 3.3, 5.25, '#d8302a');
    e.sharp(0.08, 0.08, 7.6, 10.14, 3.22, 5.25, '#ffc83a');
    e.sharp(0.06, 0.7, 11.2, 12.13, 3.3, -6.4, '#d8302a');
    // toldinho listrado sobre a entrada
    for (let i = 0; i < 6; i++) e.box(0.45, 0.05, 1.2, -2.25 + i * 0.45 + 0.225, 2.72, 9.65, i % 2 ? '#ffffff' : '#e8423a', 0, 0.22);
    e.box(2.9, 0.18, 0.06, -1, 2.55, 10.25, '#e8423a');
    halo(ctx, 'estac', -1, 3.62, 9.2, 5.4, 2.2, '#ff5a3a');
  }
  // espaço sob o forro externo (marquise do drive)
  {
    const e = ctx.g('estac', 'vc');
    e.sharp(3.6, 0.18, 4.2, 13.8, 2.9, -0.3, '#d8302a');
    e.sharp(3.4, 0.03, 4.0, 13.8, 2.88, -0.3, '#f2dcb4');
    for (const z of [-2.2, 1.6]) e.cyl(0.08, 0.08, 2.9, 15.4, 0, z, '#5a5e66', 10);
    ctx.boxAt(15.4, -2.2, 0.2, 0.2);
    ctx.boxAt(15.4, 1.6, 0.2, 0.2);
    ceilLight(ctx, 'estac', 13.6, -0.3, 2.88, 'panel', '#fff0d8', 0.9, 6);
  }
  void FRONT;
}
