/* ============================================================
 *  LANCHONETE — móveis e equipamentos FIXOS (tudo mesclado por sala).
 *  O que vira anomalia ou tarefa fica em anomalies.ts / tasks.ts.
 * ============================================================ */
import * as THREE from 'three';
import type { GeoBuilder } from '../../../../3d/common/geo';
import type { MapCtx } from '../kit2/ctx';
import { plant, shadow, trashBin } from '../kit2/props';
import { bottle3, burger3, cup3 } from '../kit2/food';
import { plate, whiteboard } from './art';

export const BOOTHS = [-4.75, 1.1, 3.3];
export const TABLES: [number, number][] = [
  [-4.4, 0.6],
  [-4.4, 4.0],
  [2.2, 0.6],
  [2.2, 4.0],
];
const VINYL = '#c8302a';
const VINYL2 = '#a82420';

/** cadeira de lanchonete (assento vermelho, pés cromados) — frente para +Z girada por ry */
export function chair(g: GeoBuilder, x: number, z: number, ry: number, seat = VINYL): void {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const P = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];
  for (const [lx, lz] of [
    [-0.18, -0.18],
    [0.18, -0.18],
    [-0.18, 0.18],
    [0.18, 0.18],
  ]) {
    const [px, pz] = P(lx, lz);
    g.cyl(0.016, 0.016, 0.44, px, 0, pz, '#c8ccd4', 6);
  }
  const [sx, sz] = P(0, 0);
  g.box(0.44, 0.07, 0.42, sx, 0.43, sz, seat, ry);
  const [bx, bz] = P(0, -0.2);
  g.box(0.42, 0.42, 0.05, bx, 0.52, bz, seat, ry, -0.08);
  const [rx, rz] = P(0, -0.21);
  g.box(0.44, 0.04, 0.06, rx, 0.92, rz, '#c8ccd4', ry, -0.08);
}

/** mesa de pé central (tampo de madeira com borda cromada) */
function table(g: GeoBuilder, w: GeoBuilder, x: number, z: number, sx = 0.8, sz = 0.8): void {
  g.cyl(0.24, 0.28, 0.04, x, 0, z, '#3a3a42', 12);
  g.cyl(0.04, 0.04, 0.72, x, 0.02, z, '#b8bcc6', 8);
  w.box(sx, 0.04, sz, x, 0.72, z, '#c88a5a');
  g.box(sx + 0.02, 0.025, sz + 0.02, x, 0.71, z, '#d8dce4');
}

export function buildFurniture(ctx: MapCtx): void {
  const S = ctx.g('salao', 'vc');
  const SW = ctx.g('salao', 'wood');
  // ---------------------------------------------------------------- SALÃO
  // cabines junto à janela (mesa perpendicular à vidraça)
  for (const bx of BOOTHS) {
    for (const s of [-1, 1]) {
      const cx = bx + s * 0.7;
      S.box(0.5, 0.42, 1.25, cx, 0, 8.25, '#3a2a2a'); // base
      S.box(0.54, 0.12, 1.3, cx, 0.36, 8.25, VINYL); // assento
      S.box(0.14, 0.72, 1.3, bx + s * 1.02, 0.42, 8.25, VINYL); // encosto
      S.box(0.18, 0.06, 1.34, bx + s * 1.02, 1.12, 8.25, VINYL2);
      for (let k = 0; k < 3; k++) S.box(0.02, 0.6, 0.02, bx + s * 0.95, 0.5, 7.85 + k * 0.4, VINYL2); // costura
    }
    S.cyl(0.05, 0.05, 0.72, bx, 0, 8.1, '#b8bcc6', 8);
    S.box(0.5, 0.04, 0.5, bx, 0, 8.1, '#3a3a42');
    SW.box(0.82, 0.045, 1.05, bx, 0.72, 8.32, '#c88a5a');
    S.box(0.84, 0.025, 1.07, bx, 0.705, 8.32, '#d8dce4');
    // porta-guardanapo
    S.box(0.1, 0.12, 0.06, bx, 0.765, 8.75, '#c8ccd2');
    S.box(0.08, 0.1, 0.03, bx, 0.78, 8.75, '#ffffff');
    shadow(ctx, 'salao', bx, 8.25, 2.6, 1.9);
    ctx.box(bx - 1.1, 7.55, bx + 1.1, 8.95, 0, 1.2);
  }
  // mesas com 2 cadeiras
  for (const [x, z] of TABLES) {
    table(S, SW, x, z);
    if (x !== TABLES[0][0] || z !== TABLES[0][1]) chair(S, x - 0.55, z, Math.PI / 2); // a da mesa 1 é anomalia
    chair(S, x + 0.55, z, -Math.PI / 2);
    shadow(ctx, 'salao', x, z, 2.0, 1.3);
    ctx.boxAt(x, z, 1.5, 0.8, 0, 0.9);
  }
  // talheres/guardanapos nas mesas (exceto a da anomalia de ketchup: TABLES[1])
  for (const [x, z] of [TABLES[0], TABLES[2], TABLES[3]]) {
    S.box(0.1, 0.12, 0.06, x, 0.74, z + 0.3, '#c8ccd2');
    bottle3(S, x + 0.06, 0.74, z - 0.3, '#e8302a', 0.9);
    bottle3(S, x - 0.06, 0.74, z - 0.3, '#ffcc1a', 0.9);
  }
  // restos de lanche numa mesa (vida)
  {
    const g = S;
    g.box(0.42, 0.02, 0.3, 2.2, 0.74, 4.0, '#c8302a');
    burger3(g, 2.15, 0.76, 4.0, 1.1);
    cup3(g, 2.33, 0.76, 3.92, 1);
  }
  // estação de condimentos / guardanapos (parede norte)
  {
    const x0 = -5.9;
    S.box(1.4, 0.95, 0.5, x0 + 0.7, 0, -1.7, '#8a2e28');
    ctx.g('salao', 'steel').box(1.44, 0.04, 0.54, x0 + 0.7, 0.95, -1.7, '#d8dce4');
    for (let i = 0; i < 3; i++) {
      const col = ['#e8302a', '#ffcc1a', '#7ac04a'][i];
      S.box(0.2, 0.28, 0.2, x0 + 0.3 + i * 0.32, 0.99, -1.72, '#e8e8ee');
      S.cyl(0.03, 0.03, 0.08, x0 + 0.3 + i * 0.32, 1.27, -1.72, col, 8);
      S.box(0.18, 0.04, 0.04, x0 + 0.3 + i * 0.32, 1.33, -1.64, col);
    }
    S.box(0.24, 0.3, 0.2, x0 + 1.2, 0.99, -1.72, '#c8ccd2');
    S.box(0.2, 0.22, 0.02, x0 + 1.2, 1.03, -1.61, '#ffffff');
    ctx.box(x0, -1.95, x0 + 1.4, -1.45, 0, 1);
  }
  // lixeiras junto à saída
  trashBin(S, 0.9, 7.6, '#8a2e28');
  S.box(0.5, 0.04, 0.4, 0.9, 1.1, 7.6, '#c8ccd2');
  ctx.boxAt(0.9, 7.6, 0.55, 0.55);
  plant(ctx, 'salao', -6.0, 8.4, 1.0);
  plant(ctx, 'salao', 3.6, -1.5, 1.2);
  // placas: "Banheiro" (kids) e "Só funcionários"
  ctx.picture('salao', plate('SÓ FUNCIONÁRIOS', '#3a3a46', '#ffd35a', 320, 64, 30), 0.8, 0.16, -2.4, 2.4, -1.89, 0);
  ctx.picture('kids', plate('BANHEIROS', '#2a8ad8', '#ffffff', 256, 64, 32), 0.7, 0.17, -8.7, 2.42, -1.89, 0);
  ctx.picture('salao', plate('SAÍDA', '#1a8a3a', '#ffffff', 192, 64, 36), 0.5, 0.16, -1, 2.62, 8.88, Math.PI, true);

  // ---------------------------------------------------------------- CANTINHO KIDS
  const K = ctx.g('kids', 'vc');
  // piscina de bolinhas (parede acolchoada) — bolinhas instanciadas
  {
    const x0 = -11.85;
    const x1 = -9.3;
    const z0 = 5.1;
    const z1 = 8.85;
    const pad = ['#ff7a6b', '#ffd35a', '#6bd0ff', '#8ee07a'];
    K.box(x1 - x0, 0.55, 0.16, (x0 + x1) / 2, 0, z0, pad[0]);
    K.box(0.16, 0.55, z1 - z0, x1, 0, (z0 + z1) / 2, pad[2]);
    for (let i = 0; i < 4; i++) K.cyl(0.11, 0.11, 0.64, x0 + 0.1 + i * ((x1 - x0) / 3.2), 0, z0, pad[(i + 1) % 4], 12);
    K.cyl(0.11, 0.11, 0.64, x1, 0, z1 - 0.1, pad[3], 12);
    K.box(x1 - x0, 0.02, z1 - z0, (x0 + x1) / 2, 0.02, (z0 + z1) / 2, '#4a6aa0');
    ctx.box(x0, z0 - 0.1, x1 + 0.1, z1, 0, 0.7);
    const n = ctx.tier === 0 ? 160 : ctx.tier === 1 ? 300 : 460;
    const balls = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.1, ctx.tier >= 2 ? 1 : 0), new THREE.MeshLambertMaterial(), n);
    ctx.adopt('kids', balls.material as THREE.Material);
    ctx.track(balls.geometry);
    const m4 = new THREE.Matrix4();
    const cols = ['#ff5a5a', '#ffd23a', '#3ab0ff', '#5ad06a', '#c87aff', '#ff8ac0'];
    const col = new THREE.Color();
    let seed = 3;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      const bx = x0 + 0.15 + r() * (x1 - x0 - 0.3);
      const bz = z0 + 0.15 + r() * (z1 - z0 - 0.3);
      const by = 0.1 + Math.pow(r(), 0.6) * 0.32;
      m4.makeTranslation(bx, by, bz);
      balls.setMatrixAt(i, m4);
      col.set(cols[i % cols.length]).multiplyScalar(0.62 + by * 0.6);
      balls.setColorAt(i, col);
    }
    balls.name = 'bolinhas';
    ctx.root.add(balls);
    ctx.refs.set('balls', balls);
  }
  // escorregador
  {
    const x = -11.2;
    const z = 1.4;
    K.box(1.0, 1.1, 1.0, x, 0, z, '#6bd0ff');
    K.box(1.1, 0.1, 1.1, x, 1.1, z, '#ffd35a');
    for (const s of [-1, 1]) K.cyl(0.04, 0.04, 0.6, x + s * 0.48, 1.2, z - 0.48, '#ff7a6b', 8);
    K.box(1.0, 0.06, 0.06, x, 1.75, z - 0.48, '#ff7a6b');
    // degraus
    for (let i = 0; i < 4; i++) K.box(0.8, 0.07, 0.25, x, 0.22 + i * 0.27, z - 0.62 - (3 - i) * 0.22, '#ff7a6b');
    K.box(0.06, 1.25, 1.0, x - 0.42, 0, z - 0.95, '#ffd35a', 0, 0.3);
    K.box(0.06, 1.25, 1.0, x + 0.42, 0, z - 0.95, '#ffd35a', 0, 0.3);
    // rampa
    K.box(0.7, 0.06, 2.0, x, 0.5, z + 1.25, '#ff9ad0', 0, 0.5);
    for (const s of [-1, 1]) K.box(0.05, 0.16, 2.0, x + s * 0.36, 0.53, z + 1.25, '#ff5a8a', 0, 0.5);
    shadow(ctx, 'kids', x, z + 0.5, 1.8, 3.4);
    ctx.box(x - 0.6, z - 1.4, x + 0.6, z + 2.3, 0, 1.6);
  }
  // mesinhas redondas com banquinhos
  for (const [x, z, c] of [
    [-9.0, 3.4, '#ffd35a'],
    [-7.6, 0.2, '#8ee07a'],
  ] as [number, number, string][]) {
    K.cyl(0.04, 0.05, 0.5, x, 0, z, '#b8bcc6', 8);
    K.rcyl(0.42, 0.05, x, 0.5, z, c, 20, 0.4);
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + 0.4;
      K.rcyl(0.15, 0.3, x + Math.cos(a) * 0.65, 0, z + Math.sin(a) * 0.65, ['#ff7a6b', '#6bd0ff', '#c79bff'][i], 14, 0.3);
    }
    shadow(ctx, 'kids', x, z, 1.8, 1.8);
    ctx.boxAt(x, z, 1.0, 1.0, 0, 0.6);
  }
  // cerquinha colorida (kids | salão)
  for (let i = 0; i <= 14; i++) {
    const z = 1.0 + i * 0.5;
    K.box(0.08, 0.8, 0.08, -6.55, 0, z, ['#ff7a6b', '#ffd35a', '#6bd0ff', '#8ee07a'][i % 4]);
  }
  K.box(0.06, 0.08, 7.1, -6.55, 0.72, 4.5, '#ffffff');
  K.box(0.06, 0.08, 7.1, -6.55, 0.3, 4.5, '#ffffff');
  ctx.box(-6.62, 0.95, -6.48, 8.05, 0, 0.9);
  // baú de brinquedos
  K.box(0.9, 0.5, 0.5, -11.5, 0, -1.4, '#c79bff');
  K.box(0.94, 0.08, 0.54, -11.5, 0.5, -1.4, '#a07ae0');
  K.sph(0.12, -11.7, 0.62, -1.4, '#ff5a5a', 1, 1, 1, 10);
  K.box(0.2, 0.2, 0.2, -11.35, 0.58, -1.45, '#ffd23a', 0.5);
  ctx.boxAt(-11.5, -1.4, 0.9, 0.5);

  // ---------------------------------------------------------------- BALCÃO
  const B = ctx.g('balcao', 'vc');
  const BS = ctx.g('balcao', 'steel');
  // balcão de atendimento (z 1,65..2,35), x 4,8..10
  B.box(5.2, 1.0, 0.62, 7.4, 0, 2.0, '#c8302a');
  B.box(5.2, 0.14, 0.03, 7.4, 0.5, 2.32, '#ffc83a');
  B.box(5.2, 0.08, 0.04, 7.4, 0.0, 2.33, '#3a2a2a');
  BS.box(5.3, 0.05, 0.74, 7.4, 1.0, 2.0, '#d8dce4');
  // tampa basculante da passagem (x 4..4,8)
  B.box(0.75, 0.05, 0.7, 4.4, 1.0, 2.0, '#d8dce4');
  B.box(0.04, 1.0, 0.6, 4.05, 0, 2.0, '#c8302a');
  ctx.box(4.8, 1.65, 10, 2.35, 0, 1.1);
  ctx.box(4.0, 1.65, 4.1, 2.35, 0, 1.1);
  // prateleira inferior do lado de dentro
  B.box(5.2, 0.04, 0.3, 7.4, 0.45, 1.55, '#b8bcc6');
  for (let i = 0; i < 6; i++) B.box(0.3, 0.3, 0.25, 5.2 + i * 0.8, 0.49, 1.55, '#d8c0a0');
  // pilha de bandejas e porta-canudos na retirada
  for (let i = 0; i < 6; i++) B.box(0.42, 0.02, 0.3, 9.55, 1.03 + i * 0.022, 1.85, '#c8302a');
  B.cyl(0.05, 0.05, 0.2, 9.85, 1.03, 2.2, '#c8ccd2', 10);
  // balcão de trás (contra a parede z = −2)
  for (const [x0, x1] of [
    [4.1, 6.0],
    [7.55, 10.0],
  ]) {
    B.box(x1 - x0, 0.9, 0.6, (x0 + x1) / 2, 0, -1.68, '#b8bcc6');
    BS.box(x1 - x0 + 0.02, 0.04, 0.64, (x0 + x1) / 2, 0.9, -1.68, '#e0e4ea');
    ctx.box(x0, -2, x1, -1.36, 0, 1);
  }
  // estufa de lanches embaixo da janela de passagem
  {
    B.box(1.4, 0.04, 0.5, 8.75, 1.05, -1.75, '#d8dce4');
    for (let i = 0; i < 4; i++) {
      B.box(0.14, 0.08, 0.14, 8.25 + i * 0.32, 1.09, -1.75, '#ffd35a');
      burger3(B, 8.25 + i * 0.32, 1.09, -1.62, 0.8);
    }
    ctx.g('balcao', 'glow').box(1.3, 0.02, 0.1, 8.75, 1.86, -1.85, '#ffb070');
    ctx.light(['balcao'], 8.75, 1.7, -1.6, '#ffa060', 0.35, 2.2, 0.3, 0.2);
  }
  // copos e tampas
  for (let i = 0; i < 4; i++) B.cyl(0.05, 0.045, 0.35, 7.8 + i * 0.13, 0.94, -1.8, ['#ffffff', '#e8423a', '#ffffff', '#3aa0ff'][i], 10);
  // cercadinho da fila (postes + fita)
  for (const [x, z] of [
    [4.6, 3.4],
    [4.6, 5.0],
    [6.5, 5.0],
    [8.4, 5.0],
  ]) {
    B.cyl(0.14, 0.16, 0.04, x, 0, z, '#3a3a42', 12);
    B.cyl(0.025, 0.025, 0.92, x, 0, z, '#c8ccd4', 8);
    B.sph(0.04, x, 0.94, z, '#c8ccd4', 1, 1, 1, 8);
  }
  B.box(0.03, 0.06, 1.6, 4.6, 0.86, 4.2, '#d8302a');
  B.box(3.8, 0.06, 0.03, 6.5, 0.86, 5.0, '#d8302a');
  // estação de guardanapos/canudos na parede leste
  B.box(0.5, 1.0, 1.2, 9.72, 0, 3.6, '#8a2e28');
  ctx.g('balcao', 'steel').box(0.54, 0.04, 1.24, 9.72, 1.0, 3.6, '#d8dce4');
  B.box(0.2, 0.25, 0.2, 9.75, 1.04, 3.3, '#c8ccd2');
  B.box(0.2, 0.22, 0.2, 9.75, 1.04, 3.9, '#c8ccd2');
  ctx.box(9.45, 3.0, 10, 4.2, 0, 1);
  // banquetas altas na janela leste
  ctx.g('balcao', 'wood').box(0.4, 0.05, 4.4, 9.75, 1.05, 6.7, '#c88a5a');
  B.box(0.06, 1.05, 0.06, 9.75, 0, 4.6, '#b8bcc6');
  B.box(0.06, 1.05, 0.06, 9.75, 0, 8.8, '#b8bcc6');
  for (const z of [5.4, 6.4, 7.4, 8.3]) {
    B.cyl(0.18, 0.2, 0.03, 9.2, 0, z, '#3a3a42', 12);
    B.cyl(0.025, 0.025, 0.72, 9.2, 0, z, '#c8ccd4', 6);
    B.rcyl(0.19, 0.07, 9.2, 0.72, z, VINYL, 14, 0.4);
  }
  ctx.box(9.0, 4.6, 10, 8.9, 0, 1.1);
  plant(ctx, 'balcao', 4.4, 8.4, 1.1, '#3a3a46');

  // ---------------------------------------------------------------- DRIVE-THRU
  const D = ctx.g('drive', 'vc');
  D.box(0.6, 0.95, 1.9, 11.65, 0, -0.35, '#b8bcc6');
  ctx.g('drive', 'steel').box(0.64, 0.04, 1.94, 11.65, 0.95, -0.35, '#e0e4ea');
  ctx.box(11.3, -1.35, 12, 0.65, 0, 1);
  // gaveta de dinheiro + monitor do pedido
  D.box(0.4, 0.12, 0.4, 11.6, 0.99, 0.35, '#2a2a30');
  D.box(0.06, 0.3, 0.42, 11.5, 1.2, 0.35, '#1a1a20');
  D.cyl(0.02, 0.02, 0.2, 11.52, 1.0, 0.35, '#2a2a30', 6);
  ctx.g('drive', 'glow').box(0.01, 0.25, 0.37, 11.468, 1.225, 0.35, '#3a6ad8');
  // cartaz do turno
  ctx.picture('drive', plate('SORRIA NO DRIVE :)', '#ffd35a', '#c8302a', 384, 64, 34), 1.0, 0.17, 10.12, 2.3, -0.9, Math.PI / 2);

  // ---------------------------------------------------------------- COZINHA
  const Kc = ctx.g('cozinha', 'vc');
  const KS = ctx.g('cozinha', 'steel');
  // linha quente na parede norte (z −9..−8,2)
  // prateleira de pães
  for (let i = 0; i < 4; i++) KS.box(1.2, 0.03, 0.5, 0.95, 0.3 + i * 0.45, -8.65, '#c8ccd2');
  for (const x of [0.38, 1.52]) KS.box(0.04, 1.75, 0.04, x, 0, -8.42, '#9aa0a8');
  for (let i = 0; i < 3; i++) for (let k = 0; k < 2; k++) Kc.box(0.5, 0.18, 0.4, 0.68 + k * 0.56, 0.33 + i * 0.45, -8.65, k ? '#d8b88a' : '#e8c89a');
  ctx.box(0.3, -9, 1.6, -8.35, 0, 2);
  // base da linha (gabinete inox) x 1,9..6,9
  KS.box(5.0, 0.86, 0.8, 4.4, 0, -8.55, '#c8ccd2');
  ctx.box(1.9, -9, 6.9, -8.1, 0, 1);
  // coifa
  KS.frustum(5.4, 1.1, 5.0, 0.7, 0.55, 4.3, 2.35, -8.5, '#d4d8de');
  KS.box(5.0, 0.3, 0.7, 4.3, 2.9, -8.6, '#c8ccd2');
  ctx.g('cozinha', 'glow').box(4.6, 0.01, 0.12, 4.3, 2.34, -8.25, '#fff2d8');
  ctx.light(['cozinha'], 4.3, 2.2, -8.3, '#fff0d8', 0.5, 3, 1.5, 0.1, true);
  // pia
  KS.box(1.0, 0.9, 0.7, 7.5, 0, -8.6, '#c8ccd2');
  Kc.box(0.7, 0.02, 0.45, 7.5, 0.9, -8.6, '#6a7078');
  Kc.tube(
    [
      [7.5, 0.92, -8.92],
      [7.5, 1.25, -8.9],
      [7.5, 1.3, -8.72],
      [7.5, 1.2, -8.6],
    ],
    0.02,
    '#d8dce4',
    8,
    6,
  );
  ctx.box(7.0, -9, 8.0, -8.25, 0, 1);
  // ilha de montagem (x 2,5..7,5; z −5,6..−4,6) — os potes ficam em tasks.ts
  KS.box(5.0, 0.9, 1.0, 5.0, 0, -5.1, '#c8ccd2');
  for (let i = 0; i < 5; i++) KS.box(0.04, 0.88, 0.02, 2.7 + i * 1.15, 0, -4.59, '#a8aeb6');
  KS.box(5.1, 0.04, 1.08, 5.0, 0.9, -5.1, '#e0e4ea');
  // rampa aquecida de lanches prontos + lâmpadas
  Kc.box(1.2, 0.03, 0.5, 6.8, 1.45, -5.1, '#d8dce4');
  for (const x of [6.4, 7.2]) {
    Kc.cyl(0.008, 0.008, 0.36, x, 1.84, -5.1, '#888', 4);
    Kc.cyl(0.05, 0.08, 0.1, x, 1.76, -5.1, '#c83a2a', 10);
  }
  for (const x of [6.4, 7.2]) ctx.g('cozinha', 'glow').cyl(0.065, 0.065, 0.01, x, 1.755, -5.1, '#ffa040', 10);
  for (const x of [6.4, 6.65, 6.9, 7.15]) burger3(Kc, x, 1.48, -5.0, 0.8);
  ctx.light(['cozinha'], 6.8, 1.7, -5.0, '#ff9a50', 0.45, 2.4, 0.3, 0.2, true);
  ctx.box(2.5, -5.6, 7.5, -4.6, 0, 1);
  // trilho de comandas sobre a janela de passagem (lado da cozinha)
  KS.box(1.6, 0.04, 0.08, 8.75, 1.95, -2.15, '#c8ccd2');
  for (let i = 0; i < 4; i++) Kc.box(0.12, 0.18, 0.005, 8.2 + i * 0.36, 1.78, -2.12, '#fffbe8');
  // freezer vertical e geladeira de insumos (parede oeste)
  KS.box(0.75, 1.95, 1.3, 0.45, 0, -2.9, '#d8dce4');
  Kc.box(0.03, 0.4, 0.06, 0.84, 1.0, -2.6, '#7a8088');
  Kc.box(0.03, 0.4, 0.06, 0.84, 1.0, -3.2, '#7a8088');
  ctx.box(0.05, -3.6, 0.85, -2.2, 0, 2);
  // prateleiras de caixas na parede leste
  for (let i = 0; i < 4; i++) KS.box(0.5, 0.03, 1.6, 11.7, 0.25 + i * 0.5, -8.0, '#c8ccd2');
  for (const z of [-8.75, -7.25]) KS.box(0.04, 1.85, 0.04, 11.5, 0, z, '#9aa0a8');
  for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) Kc.box(0.4, 0.28, 0.4, 11.7, 0.28 + i * 0.5, -8.5 + k * 0.5, ['#c8a070', '#d8b080', '#b89060'][(i + k) % 3]);
  ctx.box(11.4, -8.8, 12, -7.2, 0, 2);
  // relógio de ponto + quadro de avisos
  ctx.picture('cozinha', plate('LAVE AS MÃOS!', '#2a8ad8', '#ffffff', 320, 80, 36), 0.7, 0.18, 0.09, 1.7, -6.6, Math.PI / 2);
  // tapetes antiderrapantes
  Kc.sharp(4.6, 0.012, 0.8, 4.4, 0, -7.75, '#2a2a30');
  Kc.sharp(4.6, 0.012, 0.6, 5.0, 0, -4.2, '#2a2a30');

  // ---------------------------------------------------------------- CÂMARA FRIA
  const F = ctx.g('camara', 'steel');
  const Fv = ctx.g('camara', 'vc');
  for (const x of [8.35, 11.65]) {
    for (let i = 0; i < 4; i++) F.box(0.55, 0.03, 2.6, x, 0.3 + i * 0.5, -10.6, '#c8ccd2');
    for (const z of [-11.85, -9.35]) F.box(0.03, 1.9, 0.03, x + (x < 10 ? 0.25 : -0.25), 0, z, '#9aa0a8');
    for (let i = 0; i < 4; i++)
      for (let k = 0; k < 4; k++) if ((i + k) % 3 !== 2) Fv.sharp(0.42, 0.25 + ((i * k) % 2) * 0.08, 0.5, x, 0.33 + i * 0.5, -11.6 + k * 0.62, ['#e8eef4', '#c89a6a', '#b8a080'][(i + k) % 3]);
    ctx.box(x - 0.3, -11.9, x + 0.3, -9.3, 0, 2);
  }
  // cortina de tiras na porta
  for (let i = 0; i < 7; i++) ctx.g('camara', 'glass').sharp(0.15, 2.15, 0.01, 9.55 + i * 0.15, 0, -9.12, '#cfe8ff');
  // gelo nas paredes (manchas claras)
  Fv.box(3.6, 0.06, 0.04, 10, 2.9, -11.95, '#f4fbff');

  // ---------------------------------------------------------------- BANHEIROS
  const R = ctx.g('banheiros', 'vc');
  // pias (bancada na parede leste x = −6)
  R.box(0.6, 0.85, 2.6, -6.4, 0, -5.0, '#e0e4ea');
  ctx.g('banheiros', 'steel').box(0.62, 0.05, 2.62, -6.4, 0.85, -5.0, '#f0f2f4');
  for (const z of [-5.7, -4.3]) {
    R.lathe(
      [
        [0, 0],
        [0.16, 0.0],
        [0.2, 0.1],
        [0.0, 0.1],
      ],
      -6.35,
      0.8,
      z,
      '#ffffff',
      14,
    );
    R.tube(
      [
        [-6.12, 0.9, z],
        [-6.12, 1.05, z],
        [-6.25, 1.08, z],
      ],
      0.018,
      '#d8dce4',
      6,
      6,
    );
  }
  R.box(0.14, 0.24, 0.1, -6.12, 1.2, -6.3, '#ffffff'); // saboneteira
  ctx.box(-6.7, -6.3, -6, -3.7, 0, 1);
  // cabines (parede oeste): divisórias + vasos (portas em anomalies)
  for (const z of [-9, -7.4, -5.8]) R.box(1.65, 1.9, 0.05, -11.15, 0.12, z, '#7ab8d8');
  for (const z of [-8.2, -6.6]) {
    R.box(0.4, 0.42, 0.55, -11.6, 0, z, '#ffffff');
    R.sph(0.22, -11.5, 0.42, z, '#ffffff', 1.2, 0.3, 1, 12);
    R.box(0.18, 0.4, 0.5, -11.88, 0.4, z, '#ffffff');
    R.cyl(0.06, 0.06, 0.1, -11.85, 0.85, z + 0.4, '#e8e8e8', 8, 0, Math.PI / 2);
  }
  R.box(0.06, 0.12, 4.0, -10.33, 1.9, -7.0, '#6aa8c8');
  ctx.box(-12, -9, -10.3, -5.75, 0, 2);
  // trocador de bebê (parede norte)
  R.box(0.9, 0.08, 0.5, -8.8, 0.95, -8.7, '#ff9ac0');
  R.box(0.9, 0.5, 0.06, -8.8, 0.95, -8.95, '#ff9ac0');
  // lixeira
  trashBin(R, -7.1, -2.5, '#6aa8c8', 0);
  ctx.boxAt(-7.1, -2.5, 0.5, 0.5);

  // ---------------------------------------------------------------- ESCRITÓRIO
  const O = ctx.g('escritorio', 'vc');
  const OW = ctx.g('escritorio', 'wood');
  // mesa com monitores (monitores em anomalies)
  OW.box(2.6, 0.04, 0.8, -4.3, 0.74, -8.5, '#a8784a');
  O.box(0.5, 0.74, 0.76, -5.3, 0, -8.5, '#6a4a32');
  O.box(0.5, 0.74, 0.76, -3.3, 0, -8.5, '#6a4a32');
  O.box(0.42, 0.06, 0.2, -4.3, 0.78, -8.15, '#2a2a30'); // teclado
  O.box(0.1, 0.03, 0.14, -3.85, 0.78, -8.15, '#2a2a30');
  // abajur
  O.cyl(0.08, 0.1, 0.03, -5.35, 0.78, -8.6, '#2a2a30', 10);
  O.tube(
    [
      [-5.35, 0.8, -8.6],
      [-5.3, 1.15, -8.65],
      [-5.15, 1.25, -8.45],
    ],
    0.015,
    '#2a2a30',
    8,
    5,
  );
  O.cyl(0.05, 0.12, 0.12, -5.12, 1.13, -8.4, '#2a8a5a', 10);
  ctx.g('escritorio', 'glow').cyl(0.1, 0.1, 0.01, -5.12, 1.125, -8.4, '#fff0c0', 10);
  ctx.light(['escritorio'], -5.1, 1.0, -8.35, '#ffd8a0', 0.6, 3.2, 0.3, 0.1);
  // papéis e caneca
  O.box(0.3, 0.01, 0.22, -3.5, 0.78, -8.3, '#ffffff', 0.3);
  O.cyl(0.04, 0.04, 0.1, -3.3, 0.78, -8.6, '#e8423a', 10);
  ctx.box(-5.6, -8.95, -3.0, -8.05, 0, 1);
  // armários (lockers) na parede oeste — uma porta é anomalia
  for (let i = 0; i < 4; i++) {
    const z = -6.9 + i * 0.5;
    O.box(0.5, 1.9, 0.48, -5.72, 0, z, ['#4a7ab8', '#3a6aa8'][i % 2]);
    for (let k = 0; k < 3; k++) O.box(0.01, 0.02, 0.3, -5.465, 1.6 + k * 0.05, z, '#2a3a58');
    O.box(0.02, 0.1, 0.03, -5.46, 1.0, z + 0.15, '#c8ccd2');
  }
  ctx.box(-6, -7.2, -5.45, -4.95, 0, 2);
  // arquivo de aço
  O.box(0.5, 1.3, 0.6, -1.5, 0, -8.6, '#8a929a');
  for (let k = 0; k < 3; k++) O.box(0.3, 0.04, 0.02, -1.5, 0.35 + k * 0.4, -8.29, '#c8ccd2');
  ctx.boxAt(-1.5, -8.6, 0.5, 0.6, 0, 1.4);
  // quadro branco da escala
  ctx.picture('escritorio', whiteboard(), 1.5, 1.0, -0.09, 1.6, -7.3, -Math.PI / 2);
  // cabideiro com jaqueta e boné do uniforme
  O.cyl(0.02, 0.025, 1.75, -0.6, 0, -2.6, '#3a2a20', 8);
  O.cyl(0.18, 0.2, 0.03, -0.6, 0, -2.6, '#3a2a20', 10);
  O.sph(0.2, -0.6, 1.4, -2.55, '#c8302a', 1, 1.4, 0.6, 10);
  O.sph(0.12, -0.6, 1.75, -2.6, '#ffd35a', 1.1, 0.5, 1.1, 10);
  ctx.boxAt(-0.6, -2.6, 0.4, 0.4);
  // tapetinho
  O.sharp(1.6, 0.01, 1.1, -4.2, 0, -7.2, '#3a4a6a');
}
