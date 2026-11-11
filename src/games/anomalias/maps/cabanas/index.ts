/* ============================================================
 *  ANOMALIAS — mapa "Hotel de Cabanas" (hotel de cabanas na floresta, à noite).
 *
 *  Planta (metros, y = 0 no chão; −z = fundo da trilha):
 *
 *        z=-42  [Cabana 5]  (porta para +z)
 *                    │
 *        z=-30 [C3]──┼──[C4]        lampiões a cada ~4 m na trilha
 *        z=-26       │      fogueira (−4.5, −20.5)
 *        z=-18 [C1]──┼──[C2]
 *        z=-14       │         [Lavanderia] (11, −9.5)
 *        z=-5  ┌─────┴porta──────┐
 *              │Recepção│Lareira │  casa principal 14 × 10 m, telhado de duas águas
 *        z=5   └──porta──────────┘
 *             x=-7      0       7
 *
 *  Cada cabana (4 × 5 m + varanda): cama de casal, criado-mudo, guarda-roupa,
 *  banheirinho com cortina, janela, varanda com cadeira de balanço e placa
 *  com número + ícone/cor (iguais à etiqueta da chave no quadro da recepção).
 *  Natureza (árvores, samambaias, chão) vem de src/3d/nature, com neblina.
 * ============================================================ */
import * as THREE from 'three';
import { woodTex } from '../../../../3d/common/pbr';
import { natureFern, natureMat, natureRock, natureTexture, natureTree, natureTuft } from '../../../../3d/nature';
import type { MapBuild, MapDef } from '../types';
import { creature, silhouette } from '../nightkit/bloops';
import { all, animate, flicker, hide, moveBy, rotBy, scaleBy, show, swap, texSwap, tint, type H } from '../nightkit/fx';
import { gable, MapKit, quad, ribbon, sbox, splane, type G, type Tier } from '../nightkit/kit';
import { bookshelf, curtain, door, frame, plant, rug, shade, stdMats, tableLamp, wallClock, windowPane } from '../nightkit/props';
import { footprintTex, logTex, paintingTex, rugTex, shingleTex, signTex, stoneWall, tagTex, type TagIcon } from '../nightkit/tex';
import { wall, type Side } from '../nightkit/walls';
import { armchair, bedMade, bedMessy, clothesline, fireLogs, firePitRing, flames, lanternPost, logBed, mooseHead, nightstand, porchRocker, sofa, suitcase, towels, wardrobeBody, wardrobeDoor, washer, woodPile } from './furniture';

const LH = 2.8; // pé-direito da casa principal (beiral)
const RIDGE = 4.6; // cumeeira
const CH = 2.4; // parede das cabanas
const CR = 3.5; // cumeeira das cabanas
const FY = 0.35; // piso das cabanas (sobre fundação)

interface CabinInfo {
  n: number;
  id: string;
  x: number;
  z: number;
  ry: number;
  col: string;
  icon: TagIcon;
  quilt: string;
}
const CABINS: CabinInfo[] = [
  { n: 1, id: 'cabana1', x: -9, z: -14, ry: Math.PI / 2, col: '#e0503a', icon: 'star', quilt: '#b84a3a' },
  { n: 2, id: 'cabana2', x: 8.5, z: -18, ry: -Math.PI / 2, col: '#3a7ae0', icon: 'moon', quilt: '#3a5a8a' },
  { n: 3, id: 'cabana3', x: -9, z: -27, ry: Math.PI / 2, col: '#3aa05a', icon: 'leaf', quilt: '#3a7a4a' },
  { n: 4, id: 'cabana4', x: 8.5, z: -31, ry: -Math.PI / 2, col: '#e0b03a', icon: 'sun', quilt: '#c8903a' },
  { n: 5, id: 'cabana5', x: 0, z: -42.5, ry: 0, col: '#9a5ad0', icon: 'heart', quilt: '#7a4a9a' },
];
const LANTERNS: [number, number][] = [
  [1.15, -8.2],
  [-1.2, -12.0],
  [1.2, -16.0],
  [-1.2, -21.5],
  [1.2, -24.5],
  [-1.2, -29.0],
  [1.2, -33.5],
  [-1.2, -37.0],
];

async function build({ tier }: { tier: Tier }): Promise<MapBuild> {
  const k = new MapKit('cabanas', tier);
  stdMats(k, '#ffffff');
  const lg = logTex(4);
  k.def('logs', { map: lg.map, normal: lg.normal, uv: 0.85 });
  k.def('roof', { map: shingleTex(), uv: 1.1 });
  k.def('stone', { map: stoneWall(), uv: 1.3 });
  const fw = woodTex(256, 4);
  k.def('floor', { map: fw.map, normal: fw.normal, uv: 0.7 });
  k.def('planks', { map: fw.map, uv: 0.9 });
  k.def('ground', { map: natureTexture('forestFloor'), uv: 0.3 });
  k.def('path', { map: natureTexture('dirt'), uv: 0.6, side: THREE.DoubleSide, polygonOffset: 1 });
  k.def('tile', { map: wallTile(), uv: 1.5 });
  k.portalDist = tier >= 2 ? 22 : 14;

  const views: Record<string, [number, number, number, number?][]> = {};
  const view = (room: string, x: number, z: number, yaw: number, pitch = -0.1) => (views[room] ??= []).push([x, z, yaw, pitch]);

  /* ===================== SALAS ===================== */
  const C = 2.55;
  k.room('recepcao', 'Recepção', -7, -5, 0, 5, RIDGE, [
    [-6.7, C, 4.7, -4, 0.8, -2],
    [-0.4, C, -4.7, -4.5, 0.8, 2.5],
  ]);
  k.room('lareira', 'Sala da Lareira', 0, -5, 7, 5, RIDGE, [
    [0.4, C, 4.7, 5.5, 0.8, -1],
    [6.6, C, -4.6, 2, 0.8, 2.5],
  ]);
  for (const c of CABINS) {
    k.begin(c.x, c.z, c.ry, FY);
    k.room(c.id, 'Cabana ' + c.n, -2, -2.5, 2, 2.5, CR, [
      [1.8, 2.2, 2.25, -0.8, 0.4, -1.5],
      [-1.8, 2.2, -2.25, 1.0, 0.5, 1.8],
    ]);
    k.end();
  }
  k.begin(11, -9.5, -Math.PI / 2, 0.15);
  k.room('lavanderia', 'Lavanderia', -1.8, -1.8, 1.8, 1.8, 2.6, [[1.6, 2.1, 1.6, -0.8, 0.4, -1.0]]);
  k.end();
  k.room('trilha', 'Trilha', -18, -50, 18, 12, 10, [
    [-2.2, 3.4, -6.0, 0, 0.5, -20],
    [2.5, 3.4, -35, 0, 0.5, -20],
    [-6, 3.4, -38.5, -6, 0.5, -24],
  ]);

  /* ===================== LUZ ===================== */
  const warm = '#ffd9a8';
  // casa principal
  k.light('recepcao', -3.5, 3.4, 0, warm, 3.4, 8.5);
  k.light('recepcao', -5.2, 1.4, -3.6, '#ffc890', 0.55, 3, 'night', false); // abajur do balcão
  k.light('lareira', 3.0, 3.4, 0, warm, 1.6, 7.5);
  const fireL = k.light('lareira', 5.7, 0.7, 0, '#ff9a4a', 2.6, 7.5, 'night', false);
  void fireL;
  k.light('lareira', 1.2, 1.6, 3.6, '#ffc890', 0.5, 3, 'night', false); // abajur de pé
  // varanda da frente e poste dos fundos (fora)
  const lodgeEx = [k.roomBox.get('recepcao')!, k.roomBox.get('lareira')!];
  k.baker.add(-3.5, 2.4, 5.4, '#ffd090', 1.0, 5.5, 'night', undefined, true).ex = lodgeEx;
  k.baker.add(-2.0, 2.4, -5.4, '#ffd090', 0.9, 5, 'night', undefined, true).ex = lodgeEx;
  // lua (direcional, só fora)
  const inside = [...k.roomBox.entries()].filter(([id]) => id !== 'trilha').map(([, b]) => b);
  k.baker.add(-0.4, 0.75, -0.5, '#8aa0ff', 0.42, 0, 'night', undefined, false).ex = inside;
  // fogueira (fora)
  k.baker.add(-4.5, 0.6, -20.5, '#ff9a4a', 1.3, 6, 'night', undefined, false).ex = inside;
  k.baker.ambient.set('#141c2c');
  k.baker.ambientMain.set('#2a2420');

  /* ===================== CHÃO, TRILHA ===================== */
  {
    const z = k.zone('trilha');
    splane(z('ground'), -45, -75, 45, 32, -0.02, '#7a8a5a', true, 3);
    const P = (pts: [number, number][], w = 1.5) => ribbon(z('path'), pts, w, 0.012, '#c8a880');
    P([[-2.0, -5.2], [-1.3, -8], [-0.2, -11], [0, -14], [0, -20], [0, -27], [0, -33], [0, -38.3]], 1.6);
    P([[-0.2, -14], [-2.5, -14.2], [-4.5, -14]]);
    P([[0, -18], [2.4, -18.1], [4.0, -18]]);
    P([[0, -27], [-2.5, -27.1], [-4.5, -27]]);
    P([[0, -31], [2.4, -31.1], [4.0, -31]]);
    P([[0, -20.5], [-1.8, -20.6], [-3.5, -20.5]], 1.2);
    P([[-1.1, -8.4], [3, -8.8], [6.5, -9.3], [8.7, -9.5]], 1.2);
    P([[-3.5, 5.3], [-3.6, 8], [-3.2, 12]], 1.8);
  }

  /* ===================== CASA PRINCIPAL ===================== */
  const T = 0.22;
  const iR: Side = { zone: 'recepcao', paper: 'logs', paperCol: '#d8a874', trim: '#7a4a2a' };
  const iL: Side = { zone: 'lareira', paper: 'logs', paperCol: '#d8a874', trim: '#7a4a2a' };
  const ex: Side = { zone: 'trilha', paper: 'logs', paperCol: '#b88454', trim: '#5a3a22' };
  // pisos
  splane(k.g('recepcao', 'floor'), -7, -5, 0, 5, 0, '#c8905a');
  splane(k.g('lareira', 'floor'), 0, -5, 7, 5, 0, '#c08454');
  // paredes
  wall(k, { axis: 'x', at: 5, from: -7, to: 0, h: LH, t: T, neg: iR, pos: ex, holes: [{ at: 3.5, w: 1.1, h: 2.2 }, { at: 1.2, w: 1.0, h: 1.1, sill: 0.9 }] });
  wall(k, { axis: 'x', at: 5, from: 0, to: 7, h: LH, t: T, neg: iL, pos: ex, holes: [{ at: 2.0, w: 1.2, h: 1.2, sill: 0.8 }, { at: 5.0, w: 1.2, h: 1.2, sill: 0.8 }] });
  wall(k, { axis: 'x', at: -5, from: -7, to: 0, h: LH, t: T, neg: ex, pos: iR, holes: [{ at: 5.0, w: 1.0, h: 2.15 }] });
  wall(k, { axis: 'x', at: -5, from: 0, to: 7, h: LH, t: T, neg: ex, pos: iL, holes: [{ at: 2.5, w: 1.2, h: 1.2, sill: 0.8 }, { at: 5.0, w: 1.2, h: 1.2, sill: 0.8 }] });
  wall(k, { axis: 'z', at: -7, from: -5, to: 5, h: LH, t: T, neg: ex, pos: iR, holes: [{ at: 6.5, w: 1.1, h: 1.1, sill: 0.9 }] });
  wall(k, { axis: 'z', at: 7, from: -5, to: 5, h: LH, t: T, neg: iL, pos: ex, holes: [{ at: 1.7, w: 0.8, h: 1.1, sill: 0.9 }, { at: 8.3, w: 0.8, h: 1.1, sill: 0.9 }] });
  wall(k, { axis: 'z', at: 0, from: -5, to: 5, h: LH, t: 0.18, neg: iR, pos: iL, holes: [{ at: 5, w: 3.0, h: 2.5 }] });
  // empenas (triângulos acima do beiral) — dentro e fora
  for (const [x, inZone] of [[-7, 'recepcao'], [7, 'lareira']] as [number, string][]) {
    const sg = Math.sign(x);
    gable(k.g(inZone, 'logs'), 10, RIDGE - LH, T / 2, x - (sg * T) / 4, LH, 0, '#d8a874', Math.PI / 2);
    gable(k.g('trilha', 'logs'), 10 + T, RIDGE - LH + 0.05, T / 2, x + (sg * T) / 4, LH, 0, '#b88454', Math.PI / 2);
  }
  gable(k.g('recepcao', 'logs'), 10, RIDGE - LH, 0.09, -0.045, LH, 0, '#d8a874', Math.PI / 2);
  gable(k.g('lareira', 'logs'), 10, RIDGE - LH, 0.09, 0.045, LH, 0, '#d8a874', Math.PI / 2);
  // telhado: tábuas por dentro, telhas por fora, beiral
  const ang = Math.atan2(RIDGE - LH, 5);
  for (const s of [-1, 1]) {
    const len = 5 / Math.cos(ang);
    // forro inclinado (cada sala)
    for (const [zone, x0, x1] of [['recepcao', -7, 0], ['lareira', 0, 7]] as [string, number, number][]) {
      const g = new THREE.BoxGeometry(x1 - x0, 0.04, len, Math.ceil((x1 - x0) / 0.6), 1, Math.ceil(len / 0.6));
      k.g(zone, 'planks').geo(g, '#c89a6a', (x0 + x1) / 2, (LH + RIDGE) / 2 + 0.02, s * 2.5, s * ang, 0, 0);
    }
    // telhas (fora) com beiral de 0.7 m
    const ol = (5.7 / Math.cos(ang)) + 0.05;
    const n = new THREE.Vector3(0, Math.cos(ang), s * Math.sin(ang));
    const cz = s * 2.85;
    const cy = RIDGE - 2.85 * Math.tan(ang);
    const g = new THREE.BoxGeometry(15.4, 0.14, ol, 8, 1, 6);
    k.g('trilha', 'roof').geo(g, '#7a5a4a', n.x * 0.16, cy + n.y * 0.16, cz + n.z * 0.16, s * ang, 0, 0);
    // testeira (madeira) na borda do beiral
    k.g('trilha', 'wood').box(15.4, 0.22, 0.06, 0, LH - 0.7 * Math.tan(ang) - 0.05, s * 5.72, '#5a3a22');
  }
  k.g('trilha', 'wood').box(15.5, 0.12, 0.22, 0, RIDGE + 0.22, 0, '#5a3a22');
  // vigas aparentes por dentro
  for (const x of [-5.2, -1.8, 1.8, 5.2]) {
    const zone = x < 0 ? 'recepcao' : 'lareira';
    k.g(zone, 'wood').box(0.18, 0.22, 10, x, LH - 0.1, 0, '#7a4a2a');
    k.g(zone, 'wood').box(0.14, RIDGE - LH - 0.15, 0.14, x, LH + 0.1, 0, '#7a4a2a');
  }
  k.g('recepcao', 'wood').box(7, 0.22, 0.22, -3.5, RIDGE - 0.3, 0, '#6a3e22');
  k.g('lareira', 'wood').box(7, 0.22, 0.22, 3.5, RIDGE - 0.3, 0, '#6a3e22');
  // cantos de toras cruzadas (fora)
  for (const [x, z] of [[-7, -5], [7, -5], [-7, 5], [7, 5]]) for (let i = 0; i < 10; i++) k.g('trilha', 'logs').cyl(0.13, 0.13, 0.55, x, 0.14 + i * 0.28, z, '#a87444', 8, Math.PI / 2, 0, i % 2 ? 0 : Math.PI / 2);
  // fundação de pedra
  for (const [w, d, x, z] of [[14.6, 0.3, 0, 5.05], [14.6, 0.3, 0, -5.05], [0.3, 10.4, -7.05, 0], [0.3, 10.4, 7.05, 0]]) k.g('trilha', 'stone').box(w, 0.3, d, x, 0, z, '#9a948c');
  // janelas
  for (const [zone, x, z, ry, w, h, y] of [
    ['recepcao', -5.8, 5, Math.PI, 1.0, 1.1, 0.9],
    ['lareira', 2.0, 5, Math.PI, 1.2, 1.2, 0.8],
    ['lareira', 5.0, 5, Math.PI, 1.2, 1.2, 0.8],
    ['lareira', 2.5, -5, 0, 1.2, 1.2, 0.8],
    ['lareira', 5.0, -5, 0, 1.2, 1.2, 0.8],
    ['recepcao', -7, 1.5, Math.PI / 2, 1.1, 1.1, 0.9],
    ['lareira', 7, -3.3, -Math.PI / 2, 0.8, 1.1, 0.9],
    ['lareira', 7, 3.3, -Math.PI / 2, 0.8, 1.1, 0.9],
  ] as [string, number, number, number, number, number, number][])
    windowPane(k, zone, x, y, z, ry, w, h, '#5a3a22', 0);
  // varanda da frente
  {
    const z = k.zone('trilha');
    sbox(z('planks'), 4.6, 0.12, 1.8, -3.5, 0, 5.95, '#9a6a3a');
    for (const x of [-5.6, -1.4]) {
      z('wood').cyl(0.09, 0.1, 2.6, x, 0.12, 6.7, '#7a4a2a', 10);
      z('stone').box(0.3, 0.14, 0.3, x, 0, 6.7, '#8a847c');
    }
    const pa = Math.atan2(0.35, 1.9);
    const g = new THREE.BoxGeometry(5.2, 0.1, 2.1, 6, 1, 3);
    z('roof').geo(g, '#7a5a4a', -3.5, 2.62 - 0.17, 6.0, pa, 0, 0);
    z('wood').box(4.6, 0.16, 0.14, -3.5, 2.55, 6.7, '#5a3a22');
    k.mesh(quad(2.2, 0.5), k.tmat(signTex('Hotel de Cabanas', '#5a3a22', '#ffe8b0', 512, 116, '#e8c070')), -3.5, 2.95, 5.13, 0);
    z('paint').box(0.18, 0.28, 0.12, -2.6, 2.05, 5.13, '#2a2a30');
    z('glow').sph(0.06, -2.6, 2.15, 5.22, '#ffe0a0', 1, 1.2, 1, 8);
    k.halo(-2.6, 2.15, 5.3, 0.9, '#ffcf80', false, k.root, 0.5);
    z('paint').box(0.18, 0.28, 0.12, -2.0, 2.05, -5.13, '#2a2a30');
    z('glow').sph(0.06, -2.0, 2.15, -5.22, '#ffe0a0', 1, 1.2, 1, 8);
    k.halo(-2.0, 2.15, -5.3, 0.9, '#ffcf80', false, k.root, 0.5);
    // banco da varanda
    z('wood').box(1.4, 0.06, 0.4, -5.0, 0.55, 5.4, '#8a5a32');
    for (const s of [-1, 1]) z('wood').box(0.06, 0.55, 0.36, -5.0 + s * 0.6, 0, 5.4, '#7a4a2a');
    k.solid(-5.75, 5.2, -4.25, 5.6, 0.6);
    for (const x of [-5.6, -1.4]) k.solidC(x, 6.7, 0.2, 0.2, 0, 2.5);
    // chaminé de pedra (fora, parede leste)
    z('stone').box(1.0, 5.6, 1.3, 7.55, 0, 0, '#a09a90');
    z('stone').box(1.15, 0.15, 1.45, 7.55, 5.6, 0, '#8a847c');
    k.solid(7.05, -0.65, 8.05, 0.65, 3);
    // pilha de lenha encostada nos fundos
    woodPile(z, 3.6, -5.75, 0, 3, 1.6);
    k.solid(2.7, -6.2, 4.5, -5.3, 0.6);
    k.shadow(3.6, -5.75, 1.0, 0.45);
  }

  /* ===================== RECEPÇÃO ===================== */
  {
    const z = k.zone('recepcao');
    // balcão (frente para +z)
    const w = z('wood');
    w.box(2.6, 1.0, 0.6, -5.1, 0, -3.2, '#8a5a32');
    for (let i = 0; i < 6; i++) w.box(0.03, 0.85, 0.03, -6.25 + i * 0.46, 0.08, -2.89, '#6a3e22');
    w.box(2.8, 0.06, 0.75, -5.1, 1.0, -3.15, '#a8703f');
    w.box(0.6, 1.0, 0.6, -6.1, 0, -2.6, '#8a5a32');
    k.solid(-6.45, -3.55, -3.75, -2.85, 1.1);
    k.solid(-6.45, -2.95, -5.75, -2.25, 1.1);
    k.shadow(-5.1, -3.2, 1.4, 0.4);
    // livro de hóspedes, abajur, telefone antigo
    z('paint').box(0.36, 0.04, 0.26, -4.4, 1.06, -3.05, '#7a2a2a', 0.1);
    z('paint').box(0.34, 0.006, 0.24, -4.4, 1.1, -3.05, '#f4ead4', 0.1);
    tableLamp(z, -5.9, 1.06, -3.3, '#3a3a2a', '#e8c890', 1.0);
    k.halo(-5.9, 1.37, -3.3, 0.6, '#ffcf80', false, k.root, 0.55);
    z('paint').box(0.2, 0.08, 0.16, -5.3, 1.06, -3.35, '#1a1a1a');
    z('paint').cyl(0.03, 0.03, 0.22, -5.3, 1.17, -3.35, '#1a1a1a', 8, 0, Math.PI / 2);
    // quadro de chaves (parede norte, atrás do balcão)
    z('wood').box(1.5, 0.75, 0.05, -5.1, 1.45, -4.86, '#6a3e22');
    z('wood').box(1.4, 0.65, 0.02, -5.1, 1.5, -4.83, '#c8a070');
    k.mesh(quad(0.9, 0.16), k.tmat(signTex('CHAVES', '#5a3a22', '#ffe8b0', 256, 46)), -5.1, 2.3, -4.84, 0);
    // banco de espera (parede oeste)
    z('wood').box(0.45, 0.06, 1.6, -6.6, 0.45, 2.3, '#8a5a32');
    z('wood').box(0.08, 0.5, 1.6, -6.85, 0.5, 2.3, '#8a5a32');
    for (const s of [-1, 1]) z('wood').box(0.4, 0.45, 0.06, -6.6, 0, 2.3 + s * 0.72, '#7a4a2a');
    k.solid(-6.9, 1.45, -6.35, 3.15, 0.6);
    k.shadow(-6.6, 2.3, 0.3, 0.85);
    // tapete
    rug(k, rugTex('border', '#8a2a2a', '#e8c070', '#3a5a3a'), -3.6, 0.8, 2.6, 3.4, false);
    // cabideiro
    z('wood').cyl(0.03, 0.04, 1.8, -0.7, 0, 4.4, '#6a3e22', 8);
    z('wood').cyl(0.2, 0.22, 0.04, -0.7, 0, 4.4, '#6a3e22', 12);
    for (let i = 0; i < 4; i++) z('wood').cyl(0.012, 0.012, 0.22, -0.7 + Math.cos(i * 1.57) * 0.08, 1.65, 4.4 + Math.sin(i * 1.57) * 0.08, '#6a3e22', 5, 0, 0.8);
    z('fabric').box(0.3, 0.6, 0.12, -0.6, 1.05, 4.4, '#3a5a8a', 0.4);
    k.solidC(-0.7, 4.4, 0.4, 0.4, 0, 1.8);
    plant(z, -6.5, 4.4, '#8a5a3a', 1.1);
    k.solidC(-6.5, 4.4, 0.45, 0.45, 0, 0.8);
    // lustre de galhada (corpo fixo)
    {
      const cx = -3.5;
      const cy = 3.15;
      z('paint').cyl(0.008, 0.008, RIDGE - 0.3 - cy - 0.3, cx, cy + 0.3, 0, '#2a2a2a', 4);
      z('wood').torus(0.55, 0.05, cx, cy, 0, '#e8d8b8', Math.PI / 2, 20);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        z('wood').lathe([[0.03, 0], [0.0, 0.22]], cx + Math.cos(a) * 0.55, cy, Math.sin(a) * 0.55, '#e8d8b8', 5, Math.cos(a) * 0.5, -Math.sin(a) * 0.5);
        z('glowMain').sph(0.05, cx + Math.cos(a) * 0.55, cy + 0.08, Math.sin(a) * 0.55, '#ffe8b8', 0.8, 1.3, 0.8, 8);
      }
      k.halo(cx, cy, 0, 1.6, '#ffd9a0', true, k.root, 0.35);
    }
    view('recepcao', -3.5, 4.2, 0.35);
    view('recepcao', -1.0, -4.2, Math.PI + 0.9);
  }

  /* ===================== SALA DA LAREIRA ===================== */
  {
    const z = k.zone('lareira');
    // peito da lareira (pedra) com boca
    const st = z('stone');
    st.box(0.7, 0.15, 2.2, 6.55, 0, 0, '#a09a90');
    st.box(0.7, 3.6 - 0.9 + 1.1, 0.75, 6.55, 0.95, 0.73, '#b0a89c');
    st.box(0.7, 3.6 - 0.9 + 1.1, 0.75, 6.55, 0.95, -0.73, '#b0a89c');
    st.box(0.7, 0.8, 0.6, 6.55, 0.15, 0.8, '#b0a89c');
    st.box(0.7, 0.8, 0.6, 6.55, 0.15, -0.8, '#b0a89c');
    st.box(0.7, RIDGE - 0.95 + 0.05, 0.8, 6.55, 0.95, 0, '#b0a89c');
    z('paint').box(0.08, 0.8, 1.0, 6.86, 0.15, 0, '#1a1410');
    for (const s of [-1, 1]) z('paint').box(0.5, 0.8, 0.04, 6.62, 0.15, s * 0.5, '#2a2018');
    z('paint').box(0.5, 0.04, 1.0, 6.62, 0.93, 0, '#2a2018');
    st.box(0.9, 0.12, 2.6, 5.75, 0, 0, '#8a847c');
    z('wood').box(0.3, 0.16, 2.5, 6.15, 1.32, 0, '#5a3a22');
    // ferramentas da lareira
    z('paint').cyl(0.01, 0.01, 0.75, 5.9, 0.12, 1.15, '#2a2a2a', 6);
    z('paint').cyl(0.05, 0.06, 0.04, 5.9, 0.12, 1.15, '#2a2a2a', 10);
    k.solid(5.3, -1.3, 7, 1.3, 1.0);
    // sofá virado para a lareira + poltronas + mesa de centro
    k.part((g) => sofa(g, 2.1, '#7a3a2a', '#8a4632'), 3.3, 0, 0, Math.PI / 2, k.zoneGroup('lareira'));
    k.solid(2.85, -1.1, 3.75, 1.1, 0.8);
    k.shadow(3.3, 0, 0.5, 1.1);
    z('wood').box(1.1, 0.06, 0.6, 4.6, 0.42, 0, '#8a5a32');
    for (const [a, b] of [[-0.45, -0.22], [0.45, -0.22], [-0.45, 0.22], [0.45, 0.22]]) z('wood').cyl(0.035, 0.035, 0.42, 4.6 + b, 0, a, '#6a3e22', 8);
    z('paint').box(0.3, 0.03, 0.3, 4.55, 0.48, -0.15, '#3a6a4a', 0.3);
    z('paint').cyl(0.05, 0.04, 0.1, 4.75, 0.48, 0.2, '#f0e8d8', 10);
    k.solidC(4.6, 0, 0.6, 1.1, 0, 0.5);
    k.shadow(4.6, 0, 0.4, 0.65);
    rug(k, rugTex('rag', '#7a2a2a', '#c8a050', '#3a5a6a'), 4.6, 0, 2.6, 3.4, true, 0, 0.007);
    // estante (parede divisória, lado da lareira)
    bookshelf(z, 0.3, -3.4, Math.PI / 2, 2.2, 2.0, 0.35, '#7a4a2a', 5);
    k.solid(0.09, -4.5, 0.5, -2.3, 2.0);
    // abajur de pé (corpo fixo)
    z('paint').cyl(0.015, 0.015, 1.5, 1.2, 0, 3.6, '#2a2a2a', 6);
    z('paint').cyl(0.18, 0.2, 0.03, 1.2, 0, 3.6, '#2a2a2a', 12);
    z('fabric').lathe([[0.25, 0], [0.16, 0.3], [0.15, 0.3]], 1.2, 1.45, 3.6, '#e8d0a0', 16);
    k.solidC(1.2, 3.6, 0.4, 0.4, 0, 1.6);
    // cesto de lenha
    z('paint').cyl(0.28, 0.24, 0.35, 5.95, 0, 1.75, '#7a5a3a', 14);
    woodPile(z, 5.95, 1.75, Math.PI / 2, 2, 0.5);
    // mesa de jogos perto da janela
    z('wood').cyl(0.45, 0.45, 0.05, 2.0, 0.72, 3.8, '#8a5a32', 18);
    z('wood').cyl(0.06, 0.12, 0.72, 2.0, 0, 3.8, '#6a3e22', 10);
    z('paint').box(0.4, 0.02, 0.4, 2.0, 0.77, 3.8, '#e8e0d0', 0.4);
    k.solidC(2.0, 3.8, 0.9, 0.9, 0, 0.8);
    view('lareira', 0.8, 2.3, -1.75);
    view('lareira', 0.8, -1.0, -Math.PI / 2 + 0.05);
  }

  /* ===================== CABANAS ===================== */
  const cabinParts = CABINS.map((c) => buildCabin(k, c));

  /* ===================== LAVANDERIA ===================== */
  k.begin(11, -9.5, -Math.PI / 2, 0.15);
  const laundry = buildLaundry(k);
  k.end();

  /* ===================== LAMPIÕES, FOGUEIRA, NATUREZA ===================== */
  const lamps = buildLanterns(k);
  forest(k, tier);
  {
    const z = k.zone('trilha');
    // fogueira com bancos de tora
    k.part((g) => firePitRing(g), -4.5, 0, -20.5, 0, k.zoneGroup('trilha'));
    for (const [x, zz, ry] of [[-4.5, -22.0, 0], [-6.0, -20.3, Math.PI / 2]]) {
      z('wood').cyl(0.2, 0.2, 1.4, x, 0.2, zz, '#7a4a2a', 10, Math.PI / 2, 0, ry);
      k.solidC(x, zz, 1.4, 0.45, ry, 0.45);
      k.shadow(x, zz, ry ? 0.25 : 0.75, ry ? 0.75 : 0.25);
    }
    k.solidC(-4.5, -20.5, 1.2, 1.2, 0, 0.3);
    // placa de direção
    z('wood').box(0.1, 1.8, 0.1, 0.9, 0, -13.2, '#6a4a2a');
    k.solidC(0.9, -13.2, 0.2, 0.2, 0, 1.8);
  }

  /* ===================== CÉU ===================== */
  sky(k);

  /* ===================== ANOMALIAS + TAREFAS ===================== */
  anomalies(k, cabinParts, laundry, lamps);

  view('trilha', -1.5, -9, 0.2, -0.05);
  view('trilha', 0.5, -36, Math.PI - 0.2, -0.05);
  for (const c of CABINS) {
    const p = (lx: number, lz: number) => {
      const co = Math.cos(c.ry);
      const si = Math.sin(c.ry);
      return [c.x + lx * co + lz * si, c.z - lx * si + lz * co];
    };
    const [ax, az] = p(0.9, 2.0);
    view(c.id, ax, az, c.ry + 0.25, -0.12);
    const [bx, bz] = p(0.0, 5.5);
    view(c.id, bx, bz, c.ry, -0.05);
  }
  {
    const [ax, az] = [11 + 1.2 * Math.cos(-Math.PI / 2) + 1.3 * Math.sin(-Math.PI / 2), -9.5 - 1.2 * Math.sin(-Math.PI / 2) + 1.3 * Math.cos(-Math.PI / 2)];
    view('lavanderia', ax, az, -Math.PI / 2 + 0.6, -0.15);
  }
  k.root.userData.views = views;
  return k.finish(
    { pos: { x: -3.5, y: 0, z: 3.6 }, yaw: 0 },
    { atmosphere: { background: '#0a1220', fog: { color: '#0a1220', near: tier >= 2 ? 9 : 7, far: tier >= 2 ? 40 : 32 }, exposure: 1.1 } } as Partial<MapBuild>,
  );
}

/** azulejo simples (banheirinho) */
function wallTile(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#c8c8c8';
  x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#f2f2f2';
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) x.fillRect(i * 32 + 1.5, j * 32 + 1.5, 29, 29);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/* ============================================================
 *  Cabana (coordenadas locais: porta em +z, piso em y = 0)
 * ============================================================ */
interface CabinParts {
  c: CabinInfo;
  door: ReturnType<typeof door>;
  made: THREE.Group;
  messy: THREE.Group;
  towelsBed: THREE.Group;
  towelsFloor: THREE.Group;
  winGlow: THREE.Object3D;
  winPool: THREE.Object3D;
  guest: THREE.Group;
  sign: { mat: THREE.MeshLambertMaterial; g: THREE.Group };
  rocker: THREE.Group;
  wardrobe: THREE.Group;
  painting: { mat: THREE.MeshLambertMaterial; g: THREE.Group };
  lump: THREE.Group;
  bed: THREE.Group;
}
function buildCabin(k: MapKit, c: CabinInfo): CabinParts {
  k.begin(c.x, c.z, c.ry, FY);
  const id = c.id;
  const zi = k.zone(id);
  const zo = k.zone('trilha');
  const t = 0.2;
  const inn: Side = { zone: id, paper: 'logs', paperCol: '#dcb07c', trim: '#7a4a2a' };
  const out: Side = { zone: 'trilha', paper: 'logs', paperCol: '#b0784a', trim: '#5a3a22' };
  // piso e fundação
  splane(zi('floor'), -2, -2.5, 2, 2.5, 0, '#c08a58');
  zo('stone').box(4.3, FY - 0.012, 5.3, 0, -FY, 0, '#8a847c');
  // paredes
  wall(k, { axis: 'x', at: -2.5, from: -2, to: 2, h: CH, t, neg: out, pos: inn });
  wall(k, { axis: 'x', at: 2.5, from: -2, to: 2, h: CH, t, neg: inn, pos: out, holes: [{ at: 2.8, w: 0.9, h: 2.05 }, { at: 1.0, w: 0.8, h: 0.9, sill: 0.95 }] });
  wall(k, { axis: 'z', at: -2, from: -2.5, to: 2.5, h: CH, t, neg: out, pos: inn, holes: [{ at: 2.9, w: 1.0, h: 1.0, sill: 0.9 }] });
  wall(k, { axis: 'z', at: 2, from: -2.5, to: 2.5, h: CH, t, neg: inn, pos: out });
  // empenas
  for (const s of [-1, 1]) {
    gable(zi('logs'), 4, CR - CH, t / 2, 0, CH, s * (2.5 - t / 4), '#dcb07c');
    gable(zo('logs'), 4 + t, CR - CH + 0.04, t / 2, 0, CH, s * (2.5 + t / 4), '#b0784a');
  }
  // telhado (cobre a varanda) e forro inclinado
  const a = Math.atan2(CR - CH, 2);
  for (const s of [-1, 1]) {
    const L = 2 / Math.cos(a);
    zi('planks').geo(new THREE.BoxGeometry(L, 0.03, 5, Math.ceil(L / 0.6), 1, 9), '#c8986a', s * 1.0, (CH + CR) / 2 + 0.015, 0, 0, 0, -s * a);
    const ol = 2.55 / Math.cos(a);
    const cx = s * 1.275;
    const cy = CR - 1.275 * Math.tan(a);
    const n = [-s * Math.sin(a) * -1, Math.cos(a)];
    zo('roof').geo(new THREE.BoxGeometry(ol, 0.12, 7.4, 4, 1, 8), '#6a4a3e', cx + s * Math.sin(a) * 0.13 * 0 + n[0] * 0.0 + s * 0.06 * Math.sin(a), cy + 0.13, 0.75, 0, 0, -s * a);
    zo('wood').box(0.06, 0.18, 7.4, s * 2.55, CH - 0.55 * Math.tan(a) - 0.02, 0.75, '#5a3a22');
  }
  zo('wood').box(0.2, 0.12, 7.5, 0, CR + 0.12, 0.75, '#5a3a22');
  // cantos de toras
  for (const [x, z] of [[-2, -2.5], [2, -2.5], [-2, 2.5], [2, 2.5]]) for (let i = 0; i < 9; i++) zo('logs').cyl(0.11, 0.11, 0.45, x, 0.12 + i * 0.27, z, '#a87444', 8, Math.PI / 2, 0, i % 2 ? 0 : Math.PI / 2);
  // varanda
  sbox(zo('planks'), 4.4, 0.08, 1.75, 0, -0.08, 3.35, '#9a6a3a');
  for (const s of [-1, 1]) {
    zo('wood').cyl(0.07, 0.08, CH + 0.05, s * 2.0, 0, 4.1, '#7a4a2a', 8);
    zo('wood').box(0.06, 0.06, 1.6, s * 2.1, 0.85, 3.3, '#7a4a2a');
    for (let i = 0; i < 6; i++) zo('wood').box(0.035, 0.85, 0.035, s * 2.1, 0, 2.6 + i * 0.28, '#7a4a2a');
    zo('wood').box(1.4, 0.06, 0.06, s * 1.35, 0.85, 4.12, '#7a4a2a');
    for (let i = 0; i < 4; i++) zo('wood').box(0.035, 0.85, 0.035, s * (0.8 + i * 0.35), 0, 4.12, '#7a4a2a');
    zo('stone').box(0.3, FY, 0.3, s * 2.0, -FY, 4.1, '#8a847c');
    k.solid(s * 2.15 - 0.06, 2.55, s * 2.15 + 0.06, 4.2, 1.0);
    k.solid(s * 0.65, 4.06, s * 2.1, 4.18, 1.0);
  }
  // degraus
  for (let i = 0; i < 2; i++) sbox(zo('planks'), 1.2, 0.08, 0.32, 0, -0.18 - i * 0.17, 4.35 + i * 0.3, '#8a5a32');
  // capacho
  zo('fabric').box(0.8, 0.02, 0.5, 0.8, 0, 2.95, '#6a4a2a');
  // luz da varanda (fixa) + interior
  zo('paint').box(0.16, 0.24, 0.1, 1.65, 1.95, 2.66, '#2a2a30');
  zo('glow').sph(0.055, 1.65, 2.05, 2.73, '#ffe0a0', 1, 1.2, 1, 8);
  k.halo(1.65, 2.05, 2.8, 0.8, '#ffcf80', false, k.root, 0.5);
  k.lightB([-2.6, -1.0, 2.62, 2.6, 3.0, 5.6], 1.65, 2.0, 3.1, '#ffd090', 0.9, 4.2, 'night', true);
  k.light(id, 0, 2.7, 0, '#ffd9a8', 2.4, 6);
  k.light(id, -1.7, 0.9, -2.05, '#ffc080', 0.45, 2.6, 'night', false);

  // ---- interior ----
  const bed = k.part((g) => logBed(g, 1.5, 2.0), -0.6, 0, -1.45, 0, k.detail(id));
  k.solidC(-0.6, -1.45, 1.6, 2.05, 0, 0.7);
  k.shadow(-0.6, -1.45, 0.85, 1.1);
  const made = k.part((g) => bedMade(g, 1.5, 2.0, c.quilt), 0, 0, 0, 0, bed);
  const messy = k.part((g) => bedMessy(g, 1.5, 2.0, c.quilt), 0, 0, 0, 0, bed);
  messy.visible = false;
  const towelsBed = k.part((g) => towels(g, 2, '#ffffff', shade(c.col, 0.5)), 0.2, 0.62, 0.55, 0.2, bed);
  const towelsFloor = k.part((g) => {
    g('fabric').box(0.5, 0.025, 0.4, 0, 0, 0, '#ffffff', 0.5);
    g('fabric').box(0.4, 0.025, 0.3, 0.3, 0.02, 0.2, shade(c.col, 0.5), 1.2);
  }, 1.0, 0.0, 0.3, 0);
  towelsFloor.visible = false;
  // criado-mudo + abajur
  nightstand(zi, -1.7, -2.15);
  tableLamp(zi, -1.7, 0.58, -2.15, '#5a3a22', '#e8d0a0', 0.85);
  k.halo(-1.7, 0.85, -2.15, 0.5, '#ffc890', false, k.root, 0.5);
  k.solidC(-1.7, -2.15, 0.48, 0.42, 0, 0.6);
  // banheirinho (divisórias + cortina)
  sbox(zi('logs'), 0.1, CH, 1.6, 0.6, 0, -1.6, '#dcb07c');
  sbox(zi('logs'), 0.55, CH, 0.1, 0.875, 0, -0.8, '#dcb07c');
  zi('trim').box(0.12, 0.06, 1.62, 0.6, CH - 0.06, -1.6, '#7a4a2a');
  k.solid(0.55, -2.4, 0.65, -0.8, CH);
  k.solid(0.55, -0.85, 1.15, -0.75, CH);
  sbox(zi('tile'), 0.02, 1.3, 1.6, 1.89, 0, -1.6, '#ffffff');
  sbox(zi('tile'), 1.29, 1.3, 0.02, 1.25, 0, -2.39, '#ffffff');
  // vaso, pia, espelho, toalheiro
  zi('paint').lathe([[0, 0], [0.16, 0], [0.19, 0.3], [0.2, 0.38]], 1.45, 0, -2.05, '#f4f4f4', 16);
  zi('paint').box(0.38, 0.4, 0.18, 1.45, 0.25, -2.3, '#f4f4f4');
  zi('paint').torus(0.17, 0.03, 1.45, 0.4, -2.04, '#f4f4f4', Math.PI / 2, 16);
  zi('paint').box(0.4, 0.15, 0.45, 1.68, 0.78, -1.25, '#f4f4f4');
  zi('paint').cyl(0.03, 0.03, 0.78, 1.7, 0, -1.25, '#f4f4f4', 8);
  zi('paint').cyl(0.012, 0.012, 0.15, 1.82, 0.93, -1.25, '#c0c0c8', 6);
  k.mesh(quad(0.36, 0.5), k.tmat(signTex('', '#9ab8c8', '#000', 64, 96)), 1.885, 1.45, -1.25, -Math.PI / 2);
  zi('paint').cyl(0.01, 0.01, 0.5, 0.67, 1.3, -1.6, '#c0c0c8', 6, Math.PI / 2);
  zi('fabric').box(0.04, 0.5, 0.4, 0.7, 0.85, -1.6, shade(c.col, 0.5));
  k.solidC(1.45, -2.1, 0.45, 0.6, 0, 0.5);
  k.solidC(1.68, -1.25, 0.45, 0.5, 0, 0.9);
  curtain(zi, 1.15, 1.9, -0.82, 2.05, 0.15, '#e8e0c8');
  // guarda-roupa (corpo fixo, portas são peças)
  k.part((g) => wardrobeBody(g, 1.1, 2.0, 0.55, '#8a5a32'), 1.63, 0, 0.75, -Math.PI / 2, k.zoneGroup(id));
  const wardrobe = new THREE.Group();
  k.place(wardrobe, 1.35, 0, 1.3, -Math.PI / 2);
  k.root.add(wardrobe);
  const dL = k.part((g) => wardrobeDoor(g, 0.53, 1.86), 0, 0.07, 0, 0, wardrobe);
  const dR = k.part((g) => wardrobeDoor(g, 0.53, 1.86), 1.08, 0.07, 0, Math.PI, wardrobe);
  wardrobe.userData.doors = [dL, dR];
  k.solid(1.33, 0.18, 1.92, 1.32, 2.0);
  k.shadow(1.63, 0.75, 0.3, 0.58);
  // poltrona + mesinha junto da janela
  k.part((g) => armchair(g, '#4a5a3a', '#5a6a4a'), -1.45, 0, 1.55, Math.PI / 2 + 0.5, k.zoneGroup(id));
  k.solidC(-1.45, 1.55, 0.85, 0.85, 0, 0.7);
  k.shadow(-1.45, 1.55, 0.45, 0.45);
  zi('wood').cyl(0.25, 0.25, 0.04, -0.6, 0.6, 2.0, '#8a5a32', 14);
  zi('wood').cyl(0.04, 0.08, 0.6, -0.6, 0, 2.0, '#6a3e22', 8);
  zi('paint').cyl(0.05, 0.04, 0.12, -0.55, 0.64, 2.0, '#e8e0d0', 10);
  k.solidC(-0.6, 2.0, 0.5, 0.5, 0, 0.6);
  // tapete, cortinas, luminária de teto
  rug(k, rugTex('rag', shade(c.col, -0.3), '#e8d8b8', shade(c.col, 0.2)), -0.3, 0.55, 1.6, 1.0, false);
  curtain(zi, 0.4 - 0.65, 0.4 - 0.4, -1.88, 2.05, 0.85, shade(c.col, 0.35), true);
  curtain(zi, 0.4 + 0.4, 0.4 + 0.65, -1.88, 2.05, 0.85, shade(c.col, 0.35), true);
  zi('paint').cyl(0.006, 0.006, 0.6, 0, CR - 0.65, 0, '#2a2a2a', 4);
  zi('paint').lathe([[0.22, 0], [0.18, 0.08], [0.08, 0.16], [0.03, 0.18]], 0, CR - 0.83, 0, '#3a3a3a', 16);
  zi('glowMain').sph(0.06, 0, CR - 0.78, 0, '#fff0c8', 1, 1, 1, 8);
  k.halo(0, CR - 0.8, 0, 0.7, '#ffe0b0', true, k.root, 0.4);
  // janelas (vidro; o brilho anômalo é peça)
  windowPane(k, id, -2, 0.9, 0.4, Math.PI / 2, 1.0, 1.0, '#5a3a22', 0);
  windowPane(k, id, -1.0, 0.95, 2.5, Math.PI, 0.8, 0.9, '#5a3a22', 0);
  const winGlow = k.part((g) => {
    g('glow').sharp(0.96, 0.96, 0.01, 0, 0, 0, '#ffd890');
    g('glow').sharp(0.76, 0.86, 0.01, 1.6, 0.05, 2.06, '#ffd890');
  }, -2.02, 0.92, 0.4, -Math.PI / 2);
  // segundo painel: janela da frente (posição relativa calculada à mão acima)
  winGlow.children.forEach((m) => (m.renderOrder = 3));
  winGlow.visible = false;
  const winPool = k.pool(-3.2, -FY + 0.02, 0.4, 2.2, 1.6, '#ffc870', 0.4);
  winPool.visible = false;
  // hóspede (silhueta) na janela
  const guest = silhouette(k, 1.0, k.root, c.n % 2 === 0);
  k.place(guest, -1.55, 0, 0.4, -Math.PI / 2);
  guest.visible = false;
  // caroço debaixo da colcha (alguém dormindo)
  const lump = k.part((g) => g('fabric').sph(0.35, 0, 0, 0, c.quilt, 0.8, 0.45, 1.6, 12), 0, 0.6, 0.15, 0, bed);
  lump.visible = false;
  // quadro sobre a cama
  const pk = (['lake', 'mountain', 'forest', 'boat', 'moose'] as const)[(c.n - 1) % 5];
  const painting = frame(k, paintingTex(pk), 0.8, 0.6, -0.6, 1.75, -2.37, 0, '#5a3a22');
  // placa do número (cor + ícone da chave)
  const sign = numberSign(k, c, String(c.n));
  // cadeira de balanço da varanda
  const rocker = k.part((g) => porchRocker(g), -1.3, 0, 3.35, 0.3);
  k.solidC(-1.3, 3.35, 0.65, 0.7, 0, 0.9);
  k.shadow(-1.3, 3.35, 0.35, 0.35);
  // porta (abre para dentro)
  const dr = door(k, 0.35, 2.5, 0, 0.9, 2.03, '#7a4a2a', { knob: '#d8c27a' });
  // pontos
  k.npc(id + '_varanda', 'trilha', 0.2, 0, 3.6, 0, 'stand');
  k.npc(id + '_poltrona', id, -1.45, 0.42, 1.55, Math.PI / 2 + 0.5, 'sit');
  k.end();
  return { c, door: dr, made, messy, towelsBed, towelsFloor, winGlow, winPool, guest, sign, rocker, wardrobe, painting, lump, bed };
}

function numberSign(k: MapKit, c: CabinInfo, txt: string): { mat: THREE.MeshLambertMaterial; g: THREE.Group } {
  const g = k.part((gg) => {
    gg('wood').box(0.42, 0.42, 0.04, 0, -0.21, 0, '#5a3a22');
    gg('paint').box(0.14, 0.14, 0.012, 0, -0.38, 0.03, c.col);
  }, -0.35, 1.85, 2.63, 0);
  const tex = signNumTex(txt, c.col, c.icon);
  const mat = k.tmat(tex) as THREE.MeshLambertMaterial;
  const m = new THREE.Mesh(quad(0.36, 0.36), mat);
  m.position.set(0, 0, 0.025);
  g.add(m);
  return { mat, g };
}
const signCache = new Map<string, THREE.CanvasTexture>();
function signNumTex(txt: string, col: string, icon: TagIcon): THREE.CanvasTexture {
  const key = txt + col + icon;
  let t = signCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#e8d8b8';
  x.beginPath();
  x.roundRect(4, 4, 120, 120, 14);
  x.fill();
  x.strokeStyle = '#5a3a22';
  x.lineWidth = 5;
  x.stroke();
  x.fillStyle = '#3a2412';
  x.font = 'bold 74px Fredoka, Arial, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(txt, 64, 58);
  const ic = tagTex(col, icon).image as HTMLCanvasElement;
  x.drawImage(ic, 46, 92, 36, 30);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  signCache.set(key, t);
  return t;
}

/* ============================================================
 *  Lavanderia (local: porta em +z, piso y = 0)
 * ============================================================ */
interface LaundryParts {
  washerDoor: THREE.Group;
  washer: THREE.Group;
  bulb: THREE.Group;
  basketMore: THREE.Group;
  sheets: THREE.Group[];
  ghost: THREE.Group;
  pile: THREE.Group;
}
function buildLaundry(k: MapKit): LaundryParts {
  const id = 'lavanderia';
  const zi = k.zone(id);
  const zo = k.zone('trilha');
  const t = 0.16;
  const inn: Side = { zone: id, paper: 'planks', paperCol: '#c8b08a', trim: '#6a4a2a' };
  const out: Side = { zone: 'trilha', paper: 'planks', paperCol: '#8a6a4a', trim: '#5a3a22' };
  splane(zi('floor'), -1.8, -1.8, 1.8, 1.8, 0, '#9a8a7a');
  zo('stone').box(3.9, 0.138, 3.9, 0, -0.15, 0, '#8a847c');
  const H = 2.4;
  wall(k, { axis: 'x', at: -1.8, from: -1.8, to: 1.8, h: H, t, neg: out, pos: inn });
  wall(k, { axis: 'x', at: 1.8, from: -1.8, to: 1.8, h: H, t, neg: inn, pos: out, holes: [{ at: 1.8, w: 0.9, h: 2.0 }] });
  wall(k, { axis: 'z', at: -1.8, from: -1.8, to: 1.8, h: H, t, neg: out, pos: inn, holes: [{ at: 1.8, w: 0.8, h: 0.6, sill: 1.3 }] });
  wall(k, { axis: 'z', at: 1.8, from: -1.8, to: 1.8, h: H, t, neg: inn, pos: out });
  windowPane(k, id, -1.8, 1.3, 0, Math.PI / 2, 0.8, 0.6, '#5a3a22', 0, false);
  // teto de uma água (zinco)
  zi('planks').geo(new THREE.BoxGeometry(3.6, 0.03, 3.6, 6, 1, 6), '#b8a080', 0, H + 0.02, 0, 0, 0, 0);
  zo('paint').geo(new THREE.BoxGeometry(4.4, 0.08, 4.4, 6, 1, 6), '#7a8a96', 0, H + 0.18, 0.1, 0.12, 0, 0);
  // máquinas (parede do fundo)
  const wsh = k.part((g) => washer(g), -0.9, 0, -1.4, 0);
  k.part((g) => washer(g, '#e8eef4'), -0.2, 0, -1.4, 0, k.zoneGroup(id));
  const washerDoor = k.part((g) => {
    g('glass').cyl(0.17, 0.17, 0.02, 0, 0, 0, '#a8c8e8', 18, Math.PI / 2);
    g('paint').torus(0.18, 0.03, 0, 0, 0.012, '#e0e0e8', 0, 18);
  }, -0.9 - 0.18, 0.38, -1.4 + 0.325);
  washerDoor.children.forEach((m) => m.position.set(0.18, 0, 0));
  k.solid(-1.25, -1.75, 0.15, -1.1, 0.9);
  k.shadow(-0.55, -1.4, 0.75, 0.35);
  // prateleira com toalhas/lençóis (parede esquerda)
  for (let i = 0; i < 3; i++) zi('wood').box(0.4, 0.03, 1.6, -1.55, 0.6 + i * 0.5, 0.4, '#8a5a32');
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) zi('fabric').box(0.32, 0.18, 0.4, -1.55, 0.63 + i * 0.5, -0.1 + j * 0.5, ['#ffffff', '#d8e8f0', '#f0e0d0'][(i + j) % 3]);
  k.solid(-1.78, -0.45, -1.33, 1.25, 1.7);
  // mesa de dobrar (direita) + cesto
  zi('wood').box(0.6, 0.05, 1.4, 1.45, 0.85, -0.2, '#a8784a');
  for (const [a, b] of [[-0.6, -0.25], [0.6, -0.25], [-0.6, 0.25], [0.6, 0.25]]) zi('wood').box(0.05, 0.85, 0.05, 1.45 + b, 0, -0.2 + a, '#7a4a2a');
  zi('fabric').box(0.4, 0.08, 0.35, 1.45, 0.9, -0.4, '#ffffff', 0.2);
  zi('paint').box(0.15, 0.1, 0.25, 1.5, 0.9, 0.1, '#c8c8d0', 0.4);
  k.solid(1.13, -0.95, 1.77, 0.55, 0.9);
  zi('paint').cyl(0.26, 0.22, 0.45, 1.3, 0, 1.1, '#c8a878', 14);
  const pile = k.part((g) => g('fabric').sph(0.24, 0, 0, 0, '#e8e8f0', 1, 0.45, 1, 10), 1.3, 0.45, 1.1);
  const basketMore = k.part((g) => {
    g('fabric').sph(0.3, 0, 0.1, 0, '#d8e0e8', 1, 0.7, 1, 10);
    g('fabric').box(0.4, 0.04, 0.3, 0.15, -0.38, 0.35, '#f0e0d0', 0.6);
    g('fabric').box(0.3, 0.04, 0.25, -0.3, -0.38, 0.4, '#ffffff', 1.2);
  }, 1.3, 0.48, 1.1);
  basketMore.visible = false;
  k.solidC(1.3, 1.1, 0.55, 0.55, 0, 0.5);
  // lâmpada pendurada (principal)
  zi('paint').cyl(0.006, 0.006, 0.5, 0, H - 0.5, 0, '#2a2a2a', 4);
  const bulb = k.part((g) => g('glowMain').sph(0.06, 0, 0, 0, '#fff0c8', 1, 1.3, 1, 8), 0, H - 0.56, 0);
  k.light(id, 0, H - 0.6, 0, '#fff0d0', 0.9, 4.5);
  k.halo(0, H - 0.56, 0, 0.7, '#ffe8c0', true, k.root, 0.4);
  // porta
  door(k, -0.45 + 1.8 - 1.8, 1.8, 0, 0.9, 1.98, '#6a7a5a', { knob: '#c0c0c8' });
  // varal com lençóis (fora, ao lado)
  zo('wood');
  k.part((g) => clothesline(g, 3.6), 0, 0, 4.4, 0, k.zoneGroup('trilha'));
  const sheets: THREE.Group[] = [];
  for (let i = 0; i < 2; i++) {
    const s = k.part((g) => {
      g('fabric').box(1.3, 1.05, 0.02, 0, -1.05, 0, ['#f4f4f0', '#d8e8f4'][i]);
      g('paint').box(0.04, 0.06, 0.03, -0.5, -0.02, 0, '#c8a060');
      g('paint').box(0.04, 0.06, 0.03, 0.5, -0.02, 0, '#c8a060');
    }, -0.85 + i * 1.6, 1.84, 4.4);
    sheets.push(s);
  }
  const ghost = silhouette(k, 1.0, k.root, false);
  k.place(ghost, -0.85, 0, 4.15, 0);
  ghost.visible = false;
  k.solid(-1.9, 4.3, 1.9, 4.5, 1.9);
  void wsh;
  return { washerDoor, washer: wsh, bulb, basketMore, sheets, ghost, pile };
}

/* ============================================================
 *  Lampiões (chamas e poças de luz instanciadas: 2 chamadas no total)
 * ============================================================ */
interface Lamps {
  flames: THREE.InstancedMesh;
  pools: THREE.InstancedMesh;
  set(i: number, on: boolean): void;
  posts: [number, number][];
}
function buildLanterns(k: MapKit): Lamps {
  const z = k.zone('trilha');
  for (const [x, zz] of LANTERNS) {
    lanternPost(z, x, zz);
    k.solidC(x, zz, 0.2, 0.2, 0, 1.6);
    k.shadow(x, zz, 0.18, 0.18);
  }
  const fl = new THREE.SphereGeometry(0.05, 8, 6);
  fl.scale(1, 1.6, 1);
  const fm = new THREE.MeshBasicMaterial({ color: '#ffd27a', toneMapped: false });
  const flamesIM = new THREE.InstancedMesh(fl, fm, LANTERNS.length);
  const pm = new THREE.MeshBasicMaterial({ map: (k as unknown as { poolMap?: THREE.Texture }).poolMap ?? glowMap(), color: '#ffb860', transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, toneMapped: false });
  const pg = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const poolsIM = new THREE.InstancedMesh(pg, pm, LANTERNS.length);
  poolsIM.renderOrder = 3;
  const m4 = new THREE.Matrix4();
  const set = (i: number, on: boolean) => {
    const [x, zz] = LANTERNS[i];
    m4.makeScale(on ? 1 : 0, on ? 1 : 0, on ? 1 : 0).setPosition(x, 1.42, zz);
    flamesIM.setMatrixAt(i, m4);
    m4.makeScale(on ? 4.2 : 0, 1, on ? 4.2 : 0).setPosition(x, 0.02, zz);
    poolsIM.setMatrixAt(i, m4);
    flamesIM.instanceMatrix.needsUpdate = true;
    poolsIM.instanceMatrix.needsUpdate = true;
  };
  for (let i = 0; i < LANTERNS.length; i++) set(i, true);
  flamesIM.computeBoundingSphere();
  poolsIM.computeBoundingSphere();
  flamesIM.frustumCulled = poolsIM.frustumCulled = false;
  flamesIM.userData.noBake = poolsIM.userData.noBake = true;
  const zg = k.zoneGroup('trilha');
  zg.add(flamesIM);
  zg.add(poolsIM);
  return { flames: flamesIM, pools: poolsIM, set, posts: LANTERNS };
}
let _glow: THREE.CanvasTexture | null = null;
function glowMap(): THREE.CanvasTexture {
  if (_glow) return _glow;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  _glow = new THREE.CanvasTexture(c);
  return _glow;
}

/* ============================================================
 *  Floresta: árvores instanciadas (anel denso + algumas entre as cabanas),
 *  samambaias/tufos/pedras. Tudo com luz assada (lua) por instância.
 * ============================================================ */
function forest(k: MapKit, tier: Tier): void {
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const clear: [number, number, number][] = [[0, 0, 9.5], [11, -9.5, 4], [-4.5, -20.5, 3.5], [-3.5, 8, 2.5]];
  for (const c of CABINS) clear.push([c.x, c.z, 5.2]);
  const pathPts: [number, number][] = [];
  for (let z = -5; z > -40; z -= 2) pathPts.push([0, z]);
  const ok = (x: number, z: number, r: number) => clear.every(([a, b, rr]) => Math.hypot(x - a, z - b) > rr + r) && pathPts.every(([a, b]) => Math.hypot(x - a, z - b) > 2.6 + r);
  const kinds: { kind: 'pine' | 'broad' | 'birch'; h: number; leaf: string; leaf2: string; trunk: string; n: number }[] = [
    { kind: 'pine', h: 9, leaf: '#1e4030', leaf2: '#2e5a3e', trunk: '#4a3020', n: tier === 0 ? 40 : 70 },
    { kind: 'broad', h: 7.5, leaf: '#26462e', leaf2: '#3a6040', trunk: '#5a3a26', n: tier === 0 ? 14 : 24 },
    { kind: 'birch', h: 8, leaf: '#3a5a32', leaf2: '#5a7a40', trunk: '#d8d0c0', n: tier === 0 ? 8 : 14 },
  ];
  const mat = k.baker.adopt(natureMat({ amp: 0.0025, y0: 1.5, rustle: 0.02, wrap: 0.45 }));
  const placed: [number, number][] = [];
  const zg = k.zoneGroup('trilha');
  for (const sp of kinds) {
    const geo = natureTree({ kind: sp.kind, h: sp.h, trunk: sp.trunk, leaf: sp.leaf, leaf2: sp.leaf2, seed: sp.n, lod: tier <= 1 ? 1 : 0 });
    const xf: { x: number; z: number; s: number; r: number }[] = [];
    let guard = 0;
    while (xf.length < sp.n && guard++ < 4000) {
      // anel: fora da área jogável (mais denso) ou espalhado dentro
      const inner = rnd() < 0.22;
      const x = inner ? -15 + rnd() * 30 : -34 + rnd() * 68;
      const z = inner ? -46 + rnd() * 52 : -62 + rnd() * 80;
      if (!inner && x > -16 && x < 16 && z > -48 && z < 9) continue;
      if (!ok(x, z, 1.2)) continue;
      if (placed.some(([a, b]) => Math.hypot(a - x, b - z) < 2.6)) continue;
      placed.push([x, z]);
      xf.push({ x, z, s: 0.8 + rnd() * 0.45, r: rnd() * 6.28 });
    }
    const im = new THREE.InstancedMesh(geo, mat, xf.length);
    const m4 = new THREE.Matrix4();
    xf.forEach((t, i) => {
      m4.makeRotationY(t.r).scale(new THREE.Vector3(t.s, t.s, t.s)).setPosition(t.x, 0, t.z);
      im.setMatrixAt(i, m4);
      if (Math.abs(t.x) < 20 && t.z > -52 && t.z < 12) k.shadow(t.x, t.z, 1.2 * t.s, 1.2 * t.s, 0.006);
    });
    im.computeBoundingSphere();
    im.userData.global = true;
    zg.add(im);
  }
  if (tier === 0) return;
  // vegetação rasteira
  const deco = (geo: THREE.BufferGeometry, n: number, sc: number, cols: string[]) => {
    const dm = k.baker.adopt(natureMat({ amp: 0.004, y0: 0.05, rustle: 0.01, wrap: 0.5, tintGray: true }));
    const xs: { x: number; z: number; s: number; r: number; c: string }[] = [];
    let guard = 0;
    while (xs.length < n && guard++ < 3000) {
      const x = -17 + rnd() * 34;
      const z = -48 + rnd() * 58;
      if (x > -7.6 && x < 8.6 && z > -5.8 && z < 7.3) continue;
      if (!ok(x, z, -0.6)) continue;
      xs.push({ x, z, s: sc * (0.7 + rnd() * 0.6), r: rnd() * 6.28, c: cols[Math.floor(rnd() * cols.length)] });
    }
    const im = new THREE.InstancedMesh(geo, dm, xs.length);
    const m4 = new THREE.Matrix4();
    const c = new THREE.Color();
    xs.forEach((t, i) => {
      m4.makeRotationY(t.r).scale(new THREE.Vector3(t.s, t.s, t.s)).setPosition(t.x, 0, t.z);
      im.setMatrixAt(i, m4);
      im.setColorAt(i, c.set(t.c));
    });
    im.computeBoundingSphere();
    im.userData.global = true;
    zg.add(im);
  };
  deco(natureFern(9), tier >= 2 ? 90 : 50, 0.9, ['#3a6a3a', '#4a7a40']);
  deco(natureTuft('#3a6030', '#8aa850', 9, 0.6), tier >= 2 ? 140 : 70, 0.9, ['#ffffff']);
  deco(natureRock(2), 10, 0.45, ['#5a5a56', '#4a4a46']);
}

function sky(k: MapKit): void {
  const n = 380;
  const pos = new Float32Array(n * 3);
  let s = 5;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const e = 0.15 + r() * 1.3;
    pos[i * 3] = Math.cos(a) * Math.cos(e) * 90;
    pos[i * 3 + 1] = Math.sin(e) * 90;
    pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 90 - 20;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: '#dfe8ff', size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 }));
  pts.userData.global = true;
  pts.frustumCulled = false;
  k.root.add(pts);
  const moon = new THREE.Mesh(new THREE.CircleGeometry(3.2, 28), new THREE.MeshBasicMaterial({ color: '#fff6d8', fog: false, toneMapped: false }));
  moon.position.set(-30, 48, -60);
  moon.lookAt(0, 0, -20);
  moon.userData.global = true;
  k.root.add(moon);
  const h = k.halo(-30, 48, -60, 26, '#b8c8ff', false, k.root, 0.35);
  if (h) {
    h.material.fog = false;
    h.userData.global = true;
  }
}

/* ============================================================
 *  ANOMALIAS + TAREFAS
 * ============================================================ */
function anomalies(k: MapKit, cabins: CabinParts[], L: LaundryParts, lamps: Lamps): void {
  const cr = (s = 1) => creature(k, s);

  /* ---------- RECEPÇÃO ---------- */
  // quadro de chaves: 5 chaves com etiqueta (cor + ícone da cabana)
  const keys: THREE.Group[] = [];
  CABINS.forEach((c, i) => {
    const key = k.part((g) => {
      g('paint').cyl(0.008, 0.008, 0.06, 0, -0.03, 0, '#c8a040', 6, Math.PI / 2);
      g('paint').torus(0.02, 0.006, 0, -0.03, 0, '#c8a040', 0, 10);
      g('paint').box(0.012, 0.08, 0.006, 0, -0.1, 0, '#c8a040');
      g('paint').box(0.025, 0.012, 0.006, 0.012, -0.13, 0, '#c8a040');
    }, -5.68 + i * 0.29, 1.82, -4.79);
    const tag = new THREE.Mesh(quad(0.11, 0.11), k.tmat(tagTex(c.col, c.icon)));
    tag.position.set(0, -0.22, 0.004);
    key.add(tag);
    key.userData.tag = { cabin: c.id, n: c.n, color: c.col, icon: c.icon };
    keys.push(key);
    k.interact({ id: 'chave' + c.n, room: 'recepcao', kind: 'checkin', object: key, at: { x: -5.1, y: 0, z: -4.2 }, states: ['onboard', 'taken'], setState: (s) => (key.visible = s !== 'taken') });
  });
  {
    const blackKey = k.part((g) => {
      g('paint').torus(0.02, 0.006, 0, -0.03, 0, '#3a3a3a', 0, 10);
      g('paint').box(0.012, 0.08, 0.006, 0, -0.1, 0, '#3a3a3a');
    }, -4.23, 1.82, -4.79);
    const bt = new THREE.Mesh(quad(0.11, 0.11), k.tmat(tagTex('#1a1a1a', 'moon')));
    bt.position.set(0, -0.22, 0.004);
    blackKey.add(bt);
    blackKey.visible = false;
    const grp = new THREE.Group();
    k.root.add(grp);
    k.slot({
      id: 'chaves',
      room: 'recepcao',
      object: keys[2],
      kinds: {
        missing: [hide(keys[2])],
        extra: [show(blackKey)],
        color: [all(...keys.map((x) => tint(k, x, '#5a5a5a')))],
        move: [moveBy(keys[1], 0.4, -0.75, 1.55, 0, Math.PI / 2)],
      },
    });
  }
  // balcão (tarefa de check-in: hóspede esperando)
  {
    const bell = k.part((g) => {
      g('paint').cyl(0.06, 0.07, 0.015, 0, 0, 0, '#3a2a1a', 14);
      g('paint').lathe([[0.055, 0], [0.05, 0.02], [0.03, 0.05], [0, 0.058]], 0, 0.015, 0, '#e8c860', 14);
      g('paint').sph(0.01, 0, 0.075, 0, '#e8c860', 1, 1, 1, 6);
    }, -3.95, 1.06, -2.95);
    const ticket = k.part((g) => g('paint').box(0.12, 0.004, 0.08, 0, 0, 0, '#ffffff'), -4.3, 1.065, -2.8, 0.3);
    ticket.visible = false;
    k.interact({
      id: 'balcao',
      room: 'recepcao',
      kind: 'checkin',
      object: bell,
      at: { x: -4.3, y: 0, z: -1.9 },
      states: ['idle', 'waiting', 'done'],
      setState: (s) => (ticket.visible = s === 'waiting'),
    });
    bell.userData.keys = CABINS.map((c) => ({ cabin: c.id, n: c.n, color: c.col, icon: c.icon }));
    k.slot({
      id: 'sino',
      room: 'recepcao',
      object: bell,
      sound: 'bell',
      kinds: {
        sound: [animate(k, (_dt, t) => (bell.rotation.z = Math.sin(t * 30) * 0.12 * (Math.sin(t * 2) > 0 ? 1 : 0)), () => (bell.rotation.z = 0))],
        move: [moveBy(bell, -1.2, 0, -0.3)],
      },
    });
    k.npc('hospede_balcao', 'recepcao', -4.6, 0, -1.7, Math.PI, 'stand');
  }
  // relógio cuco (parede oeste)
  {
    const ck = wallClock(k, -6.86, 2.15, -1.2, Math.PI / 2, 0.16, '#6a3e22');
    const roofC = k.part((g) => {
      g('wood').box(0.5, 0.06, 0.12, 0, 0.18, 0, '#5a3a22', 0, 0, 0.5);
      g('wood').box(0.5, 0.06, 0.12, 0, 0.18, 0, '#5a3a22', 0, 0, -0.5);
      for (const s of [-1, 1]) g('paint').cyl(0.004, 0.004, 0.5, s * 0.06, -0.7, 0.02, '#c8a040', 4);
      for (const s of [-1, 1]) g('paint').lathe([[0.02, 0], [0.025, 0.08], [0, 0.11]], s * 0.06, -0.85, 0.02, '#c8a040', 8);
    }, 0, 0, 0, 0, ck.g);
    void roofC;
    const bird = k.part((g) => {
      g('paint').sph(0.04, 0, 0, 0, '#e8d070', 1.3, 1, 1, 8);
      g('paint').sph(0.012, 0, 0, 0.045, '#ff8a2a', 1, 1, 1.5, 6);
    }, 0, 0.26, 0.04, 0, ck.g);
    bird.visible = false;
    k.slot({
      id: 'cuco',
      room: 'recepcao',
      object: ck.g,
      sound: 'cuckoo',
      kinds: {
        rotate: [animate(k, (dt) => (ck.hands.rotation.z += dt * 5), () => (ck.hands.rotation.z = 0.9))],
        sound: [all(show(bird), animate(k, (_dt, t) => (bird.position.z = 0.06 + Math.abs(Math.sin(t * 4)) * 0.12), () => (bird.position.z = 0.04)))],
      },
    });
  }
  // carrinho de malas
  {
    const cart = k.part((g) => {
      const m = g('paint');
      m.box(0.9, 0.04, 0.55, 0, 0.18, 0, '#c8a040');
      for (const s of [-1, 1]) {
        m.tube([[s * 0.42, 0.2, -0.25], [s * 0.42, 1.5, -0.25], [s * 0.42, 1.5, 0.25], [s * 0.42, 0.2, 0.25]], 0.018, '#e0c060', 10, 5);
        for (const s2 of [-1, 1]) m.torus(0.07, 0.02, s * 0.36, 0.08, s2 * 0.22, '#2a2a30', 0, 12);
      }
      m.cyl(0.02, 0.02, 0.84, 0, 1.5, 0, '#e0c060', 8, 0, Math.PI / 2);
      suitcaseAt(g, '#3a5a8a', 0, 0.2, 0.0, 0.6, 0.4);
      suitcaseAt(g, '#8a3a3a', -0.05, 0.6, 0.0, 0.45, 0.32);
    }, -1.3, 0, 3.3, 0.3);
    k.solidC(-1.3, 3.3, 1.0, 0.7, 0, 1.5);
    k.shadow(-1.3, 3.3, 0.5, 0.35);
    const extra = k.part((g) => suitcase(g, '#2a2a2a', 0.55, 0.4, 0.22), -2.3, 0, 2.6, 1.2);
    extra.visible = false;
    k.slot({ id: 'malas', room: 'recepcao', object: cart, kinds: { move: [moveBy(cart, -1.8, 0, -1.8, 1.2)], extra: [show(extra)] } });
  }
  // portas
  {
    const d = door(k, -4.05, 5, 0, 1.08, 2.18, '#7a4a2a', { glass: true, knob: '#d8c27a' });
    k.slot({ id: 'porta_frente', room: 'recepcao', object: d.leaf, sound: 'wind', kinds: { door: [(on) => d.set(on ? -1.3 : 0), (on) => d.set(on ? -0.35 : 0)] } });
    const d2 = door(k, -2.5, -5, 0, 0.98, 2.13, '#7a4a2a', { knob: '#d8c27a' });
    k.slot({ id: 'porta_fundos', room: 'recepcao', object: d2.leaf, sound: 'creak', kinds: { door: [(on) => d2.set(on ? 1.3 : 0)] } });
  }
  // mapa da trilha emoldurado
  {
    const f = frame(k, trailMap(false), 1.0, 0.7, -6.86, 1.75, 2.3, Math.PI / 2, '#5a3a22');
    k.slot({ id: 'mapa', room: 'recepcao', object: f.g, kinds: { picture: [texSwap(f.mat, trailMap(true))], rotate: [rotBy(f.g, 0, 0, 0.35)] } });
  }
  // lustre (pisca / vermelho)
  {
    const red = k.pool(-3.5, 0.012, 0, 5, 5, '#ff2a2a', 0.35);
    red.visible = false;
    const glow = k.part((g) => {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g('glow').sph(0.055, Math.cos(a) * 0.55, 0.08, Math.sin(a) * 0.55, '#ff3030', 0.8, 1.3, 0.8, 8);
      }
    }, -3.5, 3.15, 0);
    glow.visible = false;
    const dark = k.pool(-3.5, 0.013, 0, 6, 6, '#000000', 0.0);
    dark.visible = false;
    k.slot({ id: 'lustre', room: 'recepcao', object: glow, kinds: { light: [flicker(k, [glow, red], 1.2), all(show(glow), show(red))] } });
  }
  // hóspede-sombra sentado no banco
  {
    const g = silhouette(k, 0.95, k.root, true);
    g.position.set(-6.5, 0.0, 2.3);
    g.rotation.y = Math.PI / 2;
    g.scale.y = 0.75;
    g.visible = false;
    k.slot({ id: 'banco_sombra', room: 'recepcao', object: g, kinds: { extra: [show(g)] } });
    k.npc('banco_recepcao', 'recepcao', -6.5, 0.45, 2.0, Math.PI / 2, 'sit');
  }

  /* ---------- LAREIRA ---------- */
  {
    const moose = k.part((g) => mooseHead(g), 6.18, 2.4, 0, -Math.PI / 2);
    const eyes = k.part((g) => {
      for (const s of [-1, 1]) g('glow').sph(0.03, s * 0.1, 0.03, 0.39, '#ff2020', 1, 1, 0.6, 8);
    }, 0, 0, 0, 0, moose);
    eyes.visible = false;
    k.slot({ id: 'alce', room: 'lareira', object: moose, kinds: { rotate: [rotBy(moose, 0, 0.9, 0), rotBy(moose, 0, 0, Math.PI)], face: [show(eyes)], missing: [hide(moose)] } });
  }
  // fogo da lareira (tarefa lenha + anomalias)
  {
    const logs = k.part((g) => fireLogs(g, 1), 6.55, 0.15, 0, Math.PI / 2);
    void logs;
    const fireBig = k.part((g) => flames(g, 1.0), 6.55, 0.2, 0);
    const fireLow = k.part((g) => flames(g, 0.45), 6.55, 0.2, 0);
    fireLow.visible = false;
    const fireGreen = k.part((g) => flames(g, 1.0, '#7aff8a', '#2ad05a', '#e0ffe0'), 6.55, 0.2, 0);
    fireGreen.visible = false;
    const glowF = k.pool(5.9, 0.013, 0, 2.6, 3.0, '#ff8a3a', 0.28);
    const glowG = k.pool(5.9, 0.013, 0, 2.6, 3.0, '#3aff6a', 0.32);
    glowG.visible = false;
    const halo = k.halo(6.4, 0.6, 0, 1.6, '#ff9a4a', false, k.root, 0.5);
    let state = 'full';
    k.anim((_dt, t) => {
      const f = fireBig.visible ? fireBig : fireGreen.visible ? fireGreen : fireLow;
      f.scale.y = 1 + Math.sin(t * 9) * 0.08 + Math.sin(t * 23) * 0.05;
      f.scale.x = f.scale.z = 1 + Math.sin(t * 7 + 1) * 0.05;
      if (halo) halo.material.opacity = 0.45 + Math.sin(t * 11) * 0.06;
    });
    k.interact({
      id: 'lenha_lareira',
      room: 'lareira',
      kind: 'firewood',
      object: fireBig,
      at: { x: 5.0, y: 0, z: 0.8 },
      states: ['low', 'full'],
      setState(s) {
        state = s;
        fireBig.visible = s === 'full';
        fireLow.visible = s === 'low';
      },
    });
    const eyes = k.part((g) => {
      for (const s of [-1, 1]) g('glow').sph(0.035, 0, 0, s * 0.12, '#ffe23a', 0.5, 0.7, 1.2, 8);
    }, 6.75, 0.62, 0);
    eyes.visible = false;
    k.slot({
      id: 'fogo',
      room: 'lareira',
      object: fireBig,
      sound: 'crackle',
      kinds: {
        light: [
          (on) => {
            fireGreen.visible = on;
            fireBig.visible = !on && state === 'full';
            fireLow.visible = !on && state === 'low';
            glowG.visible = on;
            glowF.visible = !on;
          },
        ],
        creature: [show(eyes)],
        sound: [scaleBy(fireBig, 1.5)],
      },
    });
  }
  // quadros
  {
    const f1 = frame(k, paintingTex('lake'), 1.1, 0.8, 3.5, 1.75, 4.88, Math.PI, '#5a3a22');
    k.slot({ id: 'quadro_lago', room: 'lareira', object: f1.g, kinds: { picture: [texSwap(f1.mat, paintingTex('lakeMonster')), texSwap(f1.mat, paintingTex('mountainRed'))], rotate: [rotBy(f1.g, 0, 0, Math.PI)] } });
    const f2 = frame(k, paintingTex('portrait'), 0.7, 0.9, 3.75, 1.75, -4.88, 0, '#c9a227');
    k.slot({ id: 'retrato', room: 'lareira', object: f2.g, kinds: { picture: [texSwap(f2.mat, paintingTex('portraitEyes')), texSwap(f2.mat, paintingTex('portraitEmpty'))] } });
  }
  // poltrona
  {
    const ch = k.part((g) => armchair(g, '#3a5a4a', '#4a6a5a'), 5.0, 0, 2.3, -Math.PI / 2 - 0.6);
    k.solidC(5.0, 2.3, 0.85, 0.85, 0, 0.8);
    k.shadow(5.0, 2.3, 0.45, 0.45);
    const ch2 = k.part((g) => armchair(g, '#3a5a4a', '#4a6a5a'), 5.0, 0, -2.3, -Math.PI / 2 + 0.6);
    k.solidC(5.0, -2.3, 0.85, 0.85, 0, 0.8);
    k.shadow(5.0, -2.3, 0.45, 0.45);
    void ch2;
    const c = cr(0.7);
    c.g.position.set(5.0, 0.3, 2.3);
    c.g.rotation.y = -Math.PI / 2 - 0.6;
    c.g.visible = false;
    k.slot({ id: 'poltrona', room: 'lareira', object: ch, kinds: { move: [moveBy(ch, -1.2, 0, 1.4, 0.8)], rotate: [rotBy(ch, 0, Math.PI, 0)], creature: [show(c.g)] } });
    k.npc('poltrona_lareira', 'lareira', 5.0, 0.42, -2.3, -Math.PI / 2 + 0.6, 'sit');
    k.npc('sofa', 'lareira', 3.4, 0.45, 0.5, Math.PI / 2, 'sit');
  }
  // criatura na janela da lareira (lado de fora)
  {
    const c = cr(1.0);
    c.g.position.set(5.0, 0.1, -5.9);
    c.g.rotation.y = 0;
    const c2 = cr(1.0);
    c2.g.position.set(7.9, 0.1, 3.3);
    c2.g.rotation.y = -Math.PI / 2;
    k.slot({ id: 'janela_lareira', room: 'lareira', object: c.g, kinds: { creature: [show(c.g), show(c2.g)] } });
  }
  // livros (estante)
  {
    const books = k.part((g) => {
      const cols = ['#8a2a2a', '#2a4a8a', '#3a6a3a', '#8a6a2a', '#5a2a6a'];
      for (let i = 0; i < 9; i++) g('paint').box(0.05, 0.24, 0.26, 0, 0, -0.5 + i * 0.065, cols[i % 5]);
    }, 0.38, 1.24, -3.0);
    const gap = k.part((g) => g('paint').box(0.05, 0.24, 0.26, 0, 0, 0, '#000000'), 0.38, 1.24, -3.0);
    gap.visible = false;
    k.slot({ id: 'livros', room: 'lareira', object: books, kinds: { color: [tint(k, books, '#3a3a3a')], missing: [hide(books)], rotate: [rotBy(books, 0, 0, Math.PI)] } });
    void gap;
  }
  // abajur de pé (luz)
  {
    const lit = k.part((g) => g('glow').sph(0.07, 0, 0, 0, '#ffe0a0', 1, 1, 1, 8), 1.2, 1.55, 3.6);
    const halo = k.halo(1.2, 1.6, 3.6, 1.0, '#ffcf80', false, k.root, 0.5);
    const blue = k.part((g) => g('glow').sph(0.075, 0, 0, 0, '#7ab0ff', 1, 1, 1, 8), 1.2, 1.55, 3.6);
    blue.visible = false;
    const bp = k.pool(1.2, 0.013, 3.6, 2.4, 2.4, '#4a8aff', 0.35);
    bp.visible = false;
    k.slot({ id: 'abajur', room: 'lareira', object: lit, kinds: { light: [flicker(k, halo ? [lit, halo] : [lit], 1.6), all(swap(lit, blue), show(bp), ...(halo ? [hide(halo)] : []))] } });
  }

  /* ---------- TRILHA ---------- */
  {
    const c1 = cr(1.15);
    c1.g.position.set(3.4, 0, -22.5);
    c1.g.rotation.y = -1.6;
    const c2 = cr(1.2);
    c2.g.position.set(11.2, 0, -22.0);
    c2.g.rotation.y = -0.9;
    const c3 = cr(1.1);
    c3.g.position.set(0.0, 0, -35.5);
    c3.g.rotation.y = 0;
    k.slot({ id: 'criatura_trilha', room: 'trilha', object: c1.g, sound: 'growl', kinds: { creature: [show(c1.g), show(c2.g), show(c3.g)] } });
  }
  {
    const fp1 = k.mesh(new THREE.PlaneGeometry(0.5, 2.2).rotateX(-Math.PI / 2), k.tmat(footprintTex('claw'), { transparent: true, depthWrite: false, polygonOffset: 4 }), 0.1, 0.02, -19.0, 0.1);
    const fp2 = k.mesh(new THREE.PlaneGeometry(0.5, 2.2).rotateX(-Math.PI / 2), k.tmat(footprintTex('boot'), { transparent: true, depthWrite: false, polygonOffset: 4 }), -2.6, 0.02, -27.0, Math.PI / 2);
    fp1.renderOrder = fp2.renderOrder = 4;
    k.slot({ id: 'pegadas', room: 'trilha', object: fp1, kinds: { extra: [show(fp1), show(fp2)] } });
  }
  {
    // lampião anômalo: chama roxa / caído / sumiu
    const i4 = 3;
    const [x, z] = LANTERNS[i4];
    const purple = k.part((g) => g('glow').sph(0.06, 0, 0, 0, '#c060ff', 1, 1.6, 1, 8), x, 1.42, z);
    purple.visible = false;
    const pp = k.pool(x, 0.021, z, 4.2, 4.2, '#9a3aff', 0.4);
    pp.visible = false;
    const [x6, z6] = LANTERNS[5];
    const cover = k.part((g) => {
      // tampa o poste 6 com um poste "caído" (o fixo some sob ele? não: mostramos um caído ao lado e escondemos a chama)
      lanternPost(g, 0, 0);
    }, x6 + 0.9, 0.12, z6, 0);
    cover.rotation.z = Math.PI / 2 - 0.15;
    cover.visible = false;
    k.slot({
      id: 'lampiao',
      room: 'trilha',
      object: purple,
      kinds: {
        light: [all(show(purple), show(pp), (on) => lamps.set(i4, !on))],
        move: [all(show(cover), (on) => lamps.set(5, !on))],
      },
    });
  }
  {
    const sign = k.part((g) => {
      g('wood').box(0.9, 0.2, 0.04, 0.35, 0, 0, '#8a5a32');
      g('wood').lathe([[0.14, 0], [0, 0.14]], 0.85, 0.1, 0, '#8a5a32', 3, 0, -Math.PI / 2);
      g('wood').box(0.9, 0.2, 0.04, -0.35, 0.28, 0, '#8a5a32');
      g('wood').lathe([[0.14, 0], [0, 0.14]], -0.85, 0.38, 0, '#8a5a32', 3, 0, Math.PI / 2);
    }, 0.9, 1.4, -13.2, Math.PI / 2);
    const tx1 = new THREE.Mesh(quad(0.8, 0.16), k.tmat(signTex('Cabanas 1-2', '#8a5a32', '#ffe8b0', 256, 52)));
    tx1.position.set(0.32, 0.1, 0.025);
    sign.add(tx1);
    const tx2 = new THREE.Mesh(quad(0.8, 0.16), k.tmat(signTex('Lavanderia', '#8a5a32', '#ffe8b0', 256, 52)));
    tx2.position.set(-0.32, 0.38, 0.025);
    sign.add(tx2);
    k.slot({ id: 'placa_trilha', room: 'trilha', object: sign, kinds: { rotate: [rotBy(sign, 0, Math.PI, 0), rotBy(sign, 0, 0, 0.6)], missing: [hide(sign)] } });
  }
  // fogueira (tarefa + anomalias)
  {
    const fire = k.part((g) => {
      fireLogs(g, 1.1);
    }, -4.5, 0.03, -20.5);
    void fire;
    const fl = k.part((g) => flames(g, 1.2), -4.5, 0.1, -20.5);
    const pool = k.pool(-4.5, 0.022, -20.5, 5.5, 5.5, '#ff8a3a', 0.3);
    const halo = k.halo(-4.5, 0.7, -20.5, 2.2, '#ff9a4a', false, k.root, 0.5);
    let lit = true;
    k.anim((_dt, t) => {
      if (!fl.visible) return;
      fl.scale.y = 1 + Math.sin(t * 8) * 0.1 + Math.sin(t * 19) * 0.05;
    });
    const setLit = (on: boolean) => {
      lit = on;
      fl.visible = on;
      pool.visible = on;
      if (halo) halo.visible = on;
    };
    k.interact({ id: 'lenha_fogueira', room: 'trilha', kind: 'firewood', object: fl, at: { x: -3.4, y: 0, z: -20.5 }, states: ['out', 'lit'], setState: (s) => setLit(s === 'lit') });
    const c = cr(0.85);
    c.g.position.set(-6.0, 0.35, -20.3);
    c.g.rotation.y = Math.PI / 2;
    c.g.visible = false;
    k.slot({ id: 'fogueira', room: 'trilha', object: fl, sound: 'crackle', kinds: { creature: [show(c.g)], sound: [(on) => setLit(on ? true : lit)] } });
    k.npc('fogueira1', 'trilha', -4.5, 0.4, -22.0, 0, 'sit');
  }
  // pilha de lenha (tarefa: pegar lenha)
  {
    const pile = k.part((g) => woodPile(g, 0, 0, 0, 2, 1.0), 3.6, 0.44, -5.75);
    k.interact({ id: 'lenha_pilha', room: 'trilha', kind: 'firewood', object: pile, at: { x: 3.6, y: 0, z: -6.9 }, states: ['full', 'empty'], setState: (s) => (pile.visible = s === 'full') });
  }

  /* ---------- LAVANDERIA ---------- */
  k.slot({
    id: 'maquina',
    room: 'lavanderia',
    object: L.washer,
    sound: 'washer',
    kinds: {
      sound: [animate(k, (_dt, t) => (L.washer.position.y = Math.abs(Math.sin(t * 40)) * 0.012), () => (L.washer.position.y = 0))],
      door: [(on) => (L.washerDoor.rotation.y = on ? -1.8 : 0)],
    },
  });
  k.slot({ id: 'lampada', room: 'lavanderia', object: L.bulb, kinds: { light: [flicker(k, [L.bulb], 2), tint(k, L.bulb, '#5aff6a')] } });
  k.slot({ id: 'cesto', room: 'lavanderia', object: L.pile, kinds: { extra: [all(show(L.basketMore), hide(L.pile))] } });
  k.slot({ id: 'varal', room: 'trilha', object: L.sheets[0], kinds: { creature: [show(L.ghost)], missing: [hide(L.sheets[1])], move: [animate(k, (_dt, t) => (L.sheets[0].rotation.x = 0.25 + Math.sin(t * 3) * 0.2), () => (L.sheets[0].rotation.x = 0))] } });

  /* ---------- CABANAS ---------- */
  for (const cp of cabins) {
    const { c } = cp;
    const id = c.id;
    // porta da cabana
    const doorKinds: Record<string, H[]> = { door: [(on) => cp.door.set(on ? -1.25 : 0), (on) => cp.door.set(on ? -0.3 : 0)] };
    if (c.n === 3) {
      const cc = cr(1.0);
      k.begin(c.x, c.z, c.ry, FY);
      k.place(cc.g, 0.8, 0, 1.9, 0);
      k.end();
      cc.g.visible = false;
      doorKinds.creature = [all(show(cc.g), (on) => cp.door.set(on ? -1.25 : 0))];
    }
    k.slot({ id: id + '_porta', room: id, object: cp.door.leaf, sound: 'creak', kinds: doorKinds as never });
    // janela: luz acesa / hóspede na janela
    k.slot({ id: id + '_janela', room: id, object: cp.winGlow, kinds: { light: [all(show(cp.winGlow), show(cp.winPool))], creature: [all(show(cp.guest), show(cp.winGlow))] } });
    // placa do número (número errado / de cabeça p/ baixo)
    const wrong = signNumTex(String(c.n === 5 ? 6 : c.n + 2 > 5 ? c.n - 2 : c.n + 2), c.col, c.icon);
    const wrongIcon = signNumTex(String(c.n), '#1a1a1a', c.icon === 'moon' ? 'star' : 'moon');
    k.slot({ id: id + '_placa', room: id, object: cp.sign.g, kinds: { picture: [texSwap(cp.sign.mat, wrong), texSwap(cp.sign.mat, wrongIcon)], rotate: [rotBy(cp.sign.g, 0, 0, Math.PI)] } });
    // tarefa: arrumar a cabana (cama + toalhas) → "liberada"
    k.interact({
      id: 'limpar_' + id,
      room: id,
      kind: 'cleanroom',
      object: cp.bed,
      at: wAt(c, 0.4, -0.2),
      states: ['dirty', 'clean'],
      setState(s) {
        const clean = s === 'clean';
        cp.made.visible = clean;
        cp.messy.visible = !clean;
        cp.towelsBed.visible = clean;
        cp.towelsFloor.visible = !clean;
      },
    });
    // uma anomalia de interior diferente por cabana
    if (c.n === 1) k.slot({ id: id + '_quadro', room: id, object: cp.painting.g, kinds: { picture: [texSwap(cp.painting.mat, paintingTex('forestEyes'))], rotate: [rotBy(cp.painting.g, 0, 0, Math.PI)] } });
    if (c.n === 2) {
      const [dl, dr] = cp.wardrobe.userData.doors as THREE.Group[];
      const cc = cr(0.55);
      k.begin(c.x, c.z, c.ry, FY);
      k.place(cc.g, 1.62, 0.07, 0.75, -Math.PI / 2);
      k.end();
      cc.g.visible = false;
      const open = (on: boolean) => {
        dl.rotation.y = on ? -1.6 : 0;
        dr.rotation.y = on ? Math.PI + 1.6 : Math.PI;
      };
      k.slot({ id: id + '_armario', room: id, object: cp.wardrobe, kinds: { door: [open], creature: [all(open, show(cc.g))] } });
    }
    if (c.n === 3) k.slot({ id: id + '_cama', room: id, object: cp.bed, kinds: { extra: [show(cp.lump)], move: [moveBy(cp.bed, 0, 0, 0)] } });
    if (c.n === 4) k.slot({ id: id + '_cadeira', room: 'trilha', object: cp.rocker, sound: 'creak', kinds: { move: [animate(k, (_dt, t) => (cp.rocker.rotation.x = Math.sin(t * 2.4) * 0.16), () => (cp.rocker.rotation.x = 0))], missing: [hide(cp.rocker)] } });
    if (c.n === 5) k.slot({ id: id + '_toalhas', room: id, object: cp.towelsBed, kinds: { color: [tint(k, cp.towelsBed, '#c81a2a')], extra: [show(cp.towelsFloor)] } });
  }
  // a cabana 3 usa "move" sem efeito acima — remove (mantém só 'extra')
  const s3 = k.slots.find((s) => s.id === 'cabana3_cama');
  if (s3) s3.kinds = ['extra'];

  /* ---------- TAREFAS: LAMPIÕES ---------- */
  LANTERNS.forEach(([x, z], i) => {
    const o = new THREE.Object3D();
    o.position.set(x, 1.42, z);
    k.root.add(o);
    k.interact({ id: 'lampiao' + (i + 1), room: 'trilha', kind: 'lantern', object: o, at: { x: x + (x > 0 ? -0.8 : 0.8), y: 0, z }, states: ['off', 'lit'], setState: (s) => lamps.set(i, s === 'lit') });
  });
}

/** ponto local (lx, lz) de uma cabana → mundo */
function wAt(c: CabinInfo, lx: number, lz: number): { x: number; y: number; z: number } {
  const co = Math.cos(c.ry);
  const si = Math.sin(c.ry);
  return { x: c.x + lx * co + lz * si, y: FY, z: c.z - lx * si + lz * co };
}

function suitcaseAt(g: G, col: string, x: number, y: number, z: number, w: number, h: number): void {
  const p = g('paint');
  p.box(w, h, 0.42, x, y, z, col);
  p.box(w + 0.01, 0.03, 0.43, x, y + h * 0.3, z, shade(col, -0.3));
  p.box(w + 0.01, 0.03, 0.43, x, y + h * 0.75, z, shade(col, -0.3));
}

/** mapa da trilha (desenho); `weird` = com a criatura e um X */
const mapCache: THREE.CanvasTexture[] = [];
function trailMap(weird: boolean): THREE.CanvasTexture {
  const i = weird ? 1 : 0;
  if (mapCache[i]) return mapCache[i];
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 180;
  const x = c.getContext('2d')!;
  x.fillStyle = '#efe0bc';
  x.fillRect(0, 0, 256, 180);
  x.fillStyle = '#7aa070';
  for (let k2 = 0; k2 < 40; k2++) {
    const px = (k2 * 53) % 256;
    const py = (k2 * 37) % 180;
    x.beginPath();
    x.moveTo(px - 6, py + 8);
    x.lineTo(px, py - 6);
    x.lineTo(px + 6, py + 8);
    x.fill();
  }
  x.strokeStyle = '#8a5a32';
  x.lineWidth = 6;
  x.setLineDash([8, 6]);
  x.beginPath();
  x.moveTo(128, 170);
  x.lineTo(128, 20);
  x.moveTo(128, 120);
  x.lineTo(70, 120);
  x.moveTo(128, 100);
  x.lineTo(186, 100);
  x.moveTo(128, 70);
  x.lineTo(70, 70);
  x.moveTo(128, 55);
  x.lineTo(186, 55);
  x.stroke();
  x.setLineDash([]);
  x.fillStyle = '#6a3e22';
  for (const [px, py] of [[60, 120], [196, 100], [60, 70], [196, 55], [128, 14]]) x.fillRect(px - 9, py - 8, 18, 16);
  x.fillRect(110, 160, 36, 18);
  if (weird) {
    x.fillStyle = '#2a1238';
    x.beginPath();
    x.ellipse(160, 80, 14, 13, 0, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#ffe14a';
    x.fillRect(153, 75, 4, 3);
    x.fillRect(163, 75, 4, 3);
    x.strokeStyle = '#c81a1a';
    x.lineWidth = 5;
    x.beginPath();
    x.moveTo(50, 60);
    x.lineTo(70, 80);
    x.moveTo(70, 60);
    x.lineTo(50, 80);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  mapCache[i] = t;
  return t;
}

const map: MapDef = {
  id: 'cabanas',
  name: 'Hotel de Cabanas',
  icon: '🛖',
  build,
};
export default map;
