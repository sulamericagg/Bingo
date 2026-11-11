/* ============================================================
 *  POSTO 24h — dentro da loja: gôndolas com produtos (InstancedMesh por
 *  formato, cor por instância já com a luz da loja), geladeiras com
 *  garrafas, balcão, cantinho do café, caixa eletrônico; escritório,
 *  depósito e banheiro. Trechos de prateleira que viram anomalia ficam
 *  de fora das instâncias (anomalies.ts monta esses trechos).
 * ============================================================ */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GeoBuilder } from '../../../../3d/common/geo';
import type { MapCtx } from '../kit2/ctx';
import { plant, shadow, trashBin } from '../kit2/props';
import { sign, storePoster, TEAL, TEAL_D } from './art';

export const GONDOLAS = [-6.8, -4.2, -1.6];
export const G_Z0 = 6.2;
export const G_Z1 = 12.6;
export const LEVELS = [0.18, 0.55, 0.92, 1.29];
/** trechos de prateleira que viram anomalia: [gôndola, lado (−1 oeste / +1 leste), nível, z0, z1] */
export const SHELF_SLOTS: [number, number, number, number, number][] = [
  [0, 1, 2, 7.0, 8.2],
  [1, -1, 1, 10.6, 11.8],
  [2, 1, 3, 8.4, 9.6],
  [1, 1, 0, 7.2, 8.4],
];
/** vão da tarefa de repor (gôndola do meio, lado oeste, nível 2) */
export const RESTOCK: [number, number, number, number, number] = [1, -1, 2, 8.6, 9.8];

export const PRODUCT_COLS = ['#e8423a', '#ffd23a', '#3aa0ff', '#5ad06a', '#c87aff', '#ff8ac0', '#ff9a2a', '#2ac8b8', '#f2f2f2', '#8a5a3a'];

/** formatos de produto (origem na base; frente +X) */
export function productGeo(kind: number, tier: number): THREE.BufferGeometry {
  const s = tier >= 2 ? 9 : tier === 1 ? 6 : 5;
  let geo: THREE.BufferGeometry;
  switch (kind) {
    case 0: // caixa de cereal/biscoito
      geo = new THREE.BoxGeometry(0.07, 0.26, 0.18);
      geo.translate(0, 0.13, 0);
      break;
    case 1: // pacote de salgadinho (almofadado)
      geo = new THREE.SphereGeometry(0.1, s, tier >= 2 ? 5 : 4);
      geo.scale(0.45, 1.25, 1);
      geo.translate(0, 0.12, 0);
      break;
    case 2: {
      // garrafa com tampinha branca (de cabeça pra baixo dá para notar)
      const a = new THREE.CylinderGeometry(0.025, 0.04, 0.22, s);
      a.translate(0, 0.11, 0);
      const b = new THREE.CylinderGeometry(0.018, 0.018, 0.035, s);
      b.translate(0, 0.235, 0);
      const ca = new THREE.Float32BufferAttribute(new Array(a.getAttribute('position').count * 3).fill(1), 3);
      const cb = new THREE.Float32BufferAttribute(new Array(b.getAttribute('position').count * 3).fill(4), 3);
      a.setAttribute('color', ca);
      b.setAttribute('color', cb);
      geo = mergeGeometries([a.toNonIndexed(), b.toNonIndexed()])!;
      a.dispose();
      b.dispose();
      return geo;
    }
    default: // lata
      geo = new THREE.CylinderGeometry(0.035, 0.035, 0.12, s);
      geo.translate(0, 0.06, 0);
  }
  const n = geo.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < n; i++) {
    // faixa clara do rótulo no meio da embalagem
    const y = pos.getY(i);
    const h = kind === 0 ? 0.26 : kind === 1 ? 0.24 : kind === 2 ? 0.24 : 0.12;
    const band = y > h * 0.4 && y < h * 0.62 ? 1.6 : 1;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = band;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
const PROD_W = [0.2, 0.17, 0.1, 0.09];

/** fila de produtos de um trecho (para os trechos de anomalia, em GeoBuilder) */
export function productRow(g: GeoBuilder, kind: number, x: number, y: number, z0: number, z1: number, cols: string[], flip = false, seed = 1): void {
  let z = z0 + PROD_W[kind] / 2;
  let i = seed;
  while (z < z1 - PROD_W[kind] / 2 + 0.001) {
    const c = cols[i % cols.length];
    const yy = flip ? y + (kind === 0 ? 0.26 : kind === 3 ? 0.12 : 0.24) : y;
    const rx = flip ? Math.PI : 0;
    if (kind === 0) g.sharp(0.07, 0.26, 0.18, x, yy, z, c, 0, rx);
    else if (kind === 1) g.sph(0.1, x, yy + (flip ? -0.12 : 0.12), z, c, 0.45, 1.25, 1, 7);
    else if (kind === 2) {
      g.cyl(0.025, 0.04, 0.22, x, flip ? y + 0.24 : y, z, c, 8, rx);
      g.cyl(0.018, 0.018, 0.035, x, flip ? y + 0.035 : y + 0.22, z, '#f2f2f2', 8);
    }
    else g.cyl(0.035, 0.035, 0.12, x, yy, z, c, 8, rx);
    z += PROD_W[kind] + 0.02;
    i++;
  }
}

export function buildStore(ctx: MapCtx): void {
  const L = 'loja';
  const v = ctx.g(L, 'vc');
  const st = ctx.g(L, 'steel');

  // ---------------------------------------------------------------- gôndolas + produtos instanciados
  const inst: { kind: number; m: THREE.Matrix4; c: THREE.Color }[] = [];
  const m4 = new THREE.Matrix4();
  const cc = new THREE.Color();
  const skip = (gi: number, side: number, lv: number, z: number) =>
    [...SHELF_SLOTS, RESTOCK].some(([g, s, l, a, b]) => g === gi && s === side && l === lv && z > a - 0.05 && z < b + 0.05);
  const density = ctx.tier === 0 ? 0.6 : 1;
  GONDOLAS.forEach((gx, gi) => {
    const len = G_Z1 - G_Z0;
    const cz = (G_Z0 + G_Z1) / 2;
    v.box(0.9, 0.12, len, gx, 0, cz, '#3a4448');
    st.box(0.06, 1.62, len, gx, 0.1, cz, '#c8ccd2');
    for (const lv of LEVELS) st.box(0.9, 0.03, len, gx, lv - 0.03, cz, '#d8dce0');
    for (const s of [-1, 1]) for (const lv of LEVELS) v.sharp(0.015, 0.05, len, gx + s * 0.455, lv - 0.05, cz, ['#ffd23a', '#e8423a', TEAL, '#ffd23a'][LEVELS.indexOf(lv)]);
    // cabeceiras com cartaz de oferta
    for (const z of [G_Z0 - 0.05, G_Z1 + 0.05]) v.box(0.95, 1.7, 0.06, gx, 0, z, TEAL_D);
    ctx.box(gx - 0.47, G_Z0 - 0.1, gx + 0.47, G_Z1 + 0.1, 0, 1.7);
    shadow(ctx, L, gx, cz, 1.6, len + 0.6);
    for (const side of [-1, 1])
      LEVELS.forEach((ly, li) => {
        const kind = li === 0 ? 0 : li === 1 ? 1 : li === 2 ? 2 : 3;
        const w = PROD_W[kind] + 0.02;
        const deep = kind >= 2 && ctx.tier >= 2 ? 2 : 1;
        for (let z = G_Z0 + 0.15; z < G_Z1 - 0.12; z += w / density) {
          if (skip(gi, side, li, z)) continue;
          const hue = PRODUCT_COLS[(Math.floor(z * 3.3) + gi * 3 + li * 2 + (side > 0 ? 5 : 0)) % PRODUCT_COLS.length];
          for (let d = 0; d < deep; d++) {
            const x = gx + side * (deep === 1 && kind >= 2 ? 0.3 : 0.33 - d * 0.12);
            const lc = ctx.lightAt(L, x + side * 0.1, ly + 0.15, z, side * 0.8, 0.6, 0);
            cc.set(hue).multiply(lc);
            m4.makeRotationY(side > 0 ? 0 : Math.PI).setPosition(x, ly, z);
            inst.push({ kind, m: m4.clone(), c: cc.clone() });
          }
        }
      });
  });
  // garrafas das geladeiras (parede sul)
  const FR_X0 = -9.6;
  const FR_N = ctx.tier === 0 ? 6 : 8;
  const FR_W = 1.3;
  for (let d = 0; d < FR_N; d++)
    for (let lv = 0; lv < 4; lv++)
      for (let k = 0; k < (ctx.tier >= 2 ? 6 : 5); k++) {
        const x = FR_X0 + d * FR_W + 0.17 + k * (ctx.tier >= 2 ? 0.18 : 0.22);
        const y = 0.25 + lv * 0.45;
        const z = 15.5;
        cc.set(['#3a2a10', '#ff8a1a', '#3ad06a', '#3aa0ff', '#e8423a', '#f2f2f2'][(d + lv + k) % 6]).multiplyScalar(1.1);
        const kind = lv === 3 ? 3 : 2;
        m4.makeTranslation(x, y, z);
        inst.push({ kind, m: m4.clone(), c: cc.clone() });
      }
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  ctx.adopt(L, mat);
  for (let kind = 0; kind < 4; kind++) {
    const list = inst.filter((i) => i.kind === kind);
    if (!list.length) continue;
    const geo = ctx.track(productGeo(kind, ctx.tier));
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => {
      im.setMatrixAt(i, it.m);
      im.setColorAt(i, it.c);
    });
    im.computeBoundingSphere();
    im.name = 'produtos' + kind;
    ctx.roomGroup(L).add(im);
  }

  // ---------------------------------------------------------------- geladeiras (portas de vidro com luz)
  {
    const z0 = 15.15;
    const w = FR_N * FR_W;
    const cx = FR_X0 + w / 2;
    // gabinete oco (topo, base, fundo, laterais) — dá para ver as garrafas e a luz
    v.box(w + 0.1, 0.12, 0.85, cx, 0, 15.58, '#2a3034');
    v.box(w + 0.1, 0.32, 0.85, cx, 1.93, 15.58, '#2a3034');
    v.sharp(w, 1.85, 0.03, cx, 0.1, 15.885, '#2a3034');
    for (const ex of [FR_X0 - 0.05, FR_X0 + w + 0.05]) v.box(0.08, 2.25, 0.85, ex, 0, 15.58, '#2a3034');
    v.box(w + 0.1, 0.3, 0.06, cx, 2.0, z0 - 0.02, TEAL);
    const fridgeIn = ctx.gb('glow');
    for (let d = 0; d < FR_N; d++) {
      const x = FR_X0 + d * FR_W + FR_W / 2;
      fridgeIn.sharp(FR_W - 0.08, 1.8, 0.02, x, 0.12, 15.86, '#e8f4ff');
      fridgeIn.sharp(FR_W - 0.2, 0.03, 0.03, x, 1.88, 15.3, '#ffffff');
      for (let lv = 0; lv < 4; lv++) v.sharp(FR_W - 0.1, 0.02, 0.6, x, 0.24 + lv * 0.45, 15.6, '#c8ccd2');
      // caixilho de cada porta
      v.box(0.05, 1.86, 0.05, x - FR_W / 2 + 0.03, 0.1, z0, '#c8ccd2');
      v.box(0.03, 0.5, 0.04, x + FR_W / 2 - 0.12, 0.8, z0 - 0.04, '#e8ecef');
    }
    v.box(w, 0.05, 0.05, cx, 0.1, z0, '#c8ccd2');
    v.box(w, 0.05, 0.05, cx, 1.93, z0, '#c8ccd2');
    const fm = ctx.mesh(L, fridgeIn, 'glow');
    // material próprio: a anomalia muda a cor da luz das geladeiras
    const own = new THREE.MeshBasicMaterial({ vertexColors: true });
    own.toneMapped = false;
    ctx.adopt(L, own, true);
    fm.material = own;
    ctx.refs.set('fridgeLight', fm);
    const gl = ctx.g(L, 'glass');
    for (let d = 0; d < FR_N; d++) {
      if (d === 2) continue; // porta da anomalia
      gl.sharp(FR_W - 0.1, 1.78, 0.01, FR_X0 + d * FR_W + FR_W / 2, 0.12, z0 - 0.02, '#a8c8e8');
    }
    ctx.box(FR_X0, 15.1, FR_X0 + w, 16, 0, 2.3);
  }

  // ---------------------------------------------------------------- balcão do caixa (x ≈ 1, z 3,2..7,6)
  {
    v.box(0.7, 1.0, 4.4, 1.0, 0, 5.4, TEAL);
    v.box(0.02, 0.12, 4.4, 0.64, 0.6, 5.4, '#ffd23a');
    st.box(0.8, 0.05, 4.5, 1.0, 1.0, 5.4, '#e0e4e6');
    ctx.box(0.6, 3.15, 1.4, 7.65, 0, 1.1);
    // expositor de balas e chiclete no balcão
    for (let i = 0; i < 4; i++) {
      v.sharp(0.22, 0.16, 0.28, 0.8, 1.05, 3.6 + i * 0.32, '#c8d8e0');
      for (let k = 0; k < 3; k++) v.sph(0.03, 0.72, 1.12 + k * 0.04, 3.55 + i * 0.32, ['#ff5a8a', '#ffd23a', '#5ad06a', '#3aa0ff'][(i + k) % 4], 1, 1, 1, 6);
    }
    // prateleira de trás (lado do funcionário, contra x = 4)
    for (const [z0, z1] of [
      [2.3, 4.9],
      [6.3, 6.95],
    ]) {
      v.box(0.45, 2.0, z1 - z0, 3.72, 0, (z0 + z1) / 2, '#5a6468');
      for (let k = 0; k < 4; k++) st.box(0.45, 0.02, z1 - z0, 3.72, 0.5 + k * 0.4, (z0 + z1) / 2, '#d8dce0');
      for (let k = 0; k < 4; k++)
        for (let z = z0 + 0.12; z < z1 - 0.08; z += 0.18) v.sharp(0.08, 0.16, 0.12, 3.6, 0.52 + k * 0.4, z, PRODUCT_COLS[Math.floor(z * 7 + k) % PRODUCT_COLS.length]);
      ctx.box(3.45, z0, 4, z1, 0, 2);
    }
    // cartazes atrás do balcão
    ctx.picture(L, sign('PAGUE AQUI', TEAL_D, '#ffffff', 256, 64, 34), 1.0, 0.25, 1.0, 2.55, 5.4, -Math.PI / 2, true);
    v.cyl(0.006, 0.006, 0.8, 1.0, 2.7, 5.0, '#555', 4);
    v.cyl(0.006, 0.006, 0.8, 1.0, 2.7, 5.8, '#555', 4);
  }
  // tapete da entrada
  v.sharp(2.4, 0.012, 1.2, -2.0, 0, 2.75, '#2a3438');

  // ---------------------------------------------------------------- cantinho do café (parede oeste)
  {
    v.box(0.65, 0.95, 3.2, -9.62, 0, 9.0, '#6a4a32');
    ctx.g(L, 'wood').box(0.7, 0.05, 3.25, -9.62, 0.95, 9.0, '#c89a6a');
    // estufa de pão de queijo
    v.box(0.55, 0.42, 0.55, -9.6, 1.0, 10.1, '#c8ccd2');
    ctx.g(L, 'glass').sharp(0.01, 0.34, 0.48, -9.32, 1.04, 10.1, '#ffe8c8');
    for (let i = 0; i < 6; i++) v.sph(0.045, -9.55 + (i % 2) * 0.12, 1.08, 9.95 + Math.floor(i / 2) * 0.12, '#f2c060', 1, 0.8, 1, 8);
    ctx.g(L, 'glow').sharp(0.5, 0.01, 0.5, -9.6, 1.4, 10.1, '#ffb070');
    ctx.light([L], -9.4, 1.3, 10.1, '#ffb070', 0.25, 1.5, 0.2, 0.3);
    // copos e tampas
    for (let i = 0; i < 3; i++) v.cyl(0.05, 0.045, 0.32, -9.7, 1.0, 7.75 + i * 0.13, '#f2f0ea', 10);
    ctx.box(-10, 7.4, -9.25, 10.6, 0, 1);
    // mesinha alta e 2 banquetas na janela
    v.cyl(0.03, 0.03, 1.05, -8.8, 0, 4.6, '#3a3e46', 8);
    ctx.g(L, 'wood').rcyl(0.38, 0.04, -8.8, 1.05, 4.6, '#c89a6a', 18, 0.4);
    v.cyl(0.25, 0.28, 0.03, -8.8, 0, 4.6, '#3a3e46', 14);
    for (const z of [3.8, 5.4]) {
      v.cyl(0.025, 0.025, 0.75, -8.4, 0, z, '#c8ccd2', 6);
      v.rcyl(0.18, 0.06, -8.4, 0.75, z, TEAL, 14, 0.4);
    }
    ctx.boxAt(-8.8, 4.6, 0.8, 0.8, 0, 1.1);
    ctx.refs.set('poster', ctx.picture(L, storePoster(), 0.7, 0.96, -9.89, 1.85, 12.0, Math.PI / 2));
  }
  // revisteiro junto à vitrine
  {
    v.box(1.2, 1.1, 0.35, -7.5, 0, 2.4, '#5a6468', 0, -0.0);
    for (let k = 0; k < 3; k++) for (let i = 0; i < 5; i++) v.box(0.2, 0.26, 0.015, -8.0 + i * 0.24, 0.25 + k * 0.32, 2.58 - k * 0.02, PRODUCT_COLS[(i * 3 + k) % PRODUCT_COLS.length], 0, -0.25);
    ctx.boxAt(-7.5, 2.4, 1.2, 0.4, 0, 1.2);
  }
  plant(ctx, L, -9.4, 14.6, 1.1, TEAL_D);
  trashBin(v, -3.6, 2.6, TEAL_D);
  ctx.boxAt(-3.6, 2.6, 0.5, 0.5);

  // ---------------------------------------------------------------- escritório
  {
    const O = 'escritorio';
    const o = ctx.g(O, 'vc');
    ctx.g(O, 'wood').box(2.6, 0.04, 0.75, 6.8, 0.74, 6.5, '#a8784a');
    o.box(0.5, 0.74, 0.7, 5.75, 0, 6.5, '#4a4e58');
    o.box(0.5, 0.74, 0.7, 7.85, 0, 6.5, '#4a4e58');
    o.box(0.42, 0.04, 0.16, 6.8, 0.78, 6.2, '#2a2a30');
    ctx.box(5.5, 6.1, 8.1, 7, 0, 1);
    // monitores (os da anomalia são uma tela só, em anomalies.ts)
    // armário de pastas
    o.box(0.5, 1.4, 0.6, 9.65, 0, 3.0, '#7a828a');
    for (let k = 0; k < 3; k++) o.box(0.02, 0.04, 0.3, 9.39, 0.4 + k * 0.4, 3.0, '#c8ccd2');
    ctx.boxAt(9.65, 3.0, 0.5, 0.6, 0, 1.5);
    // frigobar
    o.box(0.55, 0.85, 0.55, 4.5, 0, 6.65, '#e8ecef');
    ctx.boxAt(4.5, 6.65, 0.55, 0.55);
    // mural de avisos
    ctx.picture(O, sign('ESCALA: VOCÊ', '#f2e8c8', '#3a2a2a', 320, 80, 34), 1.0, 0.25, 9.89, 1.8, 4.6, -Math.PI / 2);
    ctx.g(O, 'glow').sph(0.05, 6.8, 1.22, 6.75, '#ffe0a0', 1, 1, 1, 8);
    ctx.light([O], 6.8, 1.3, 6.4, '#ffd8a0', 0.4, 3, 0.3, 0.1);
    ctx.light([O], 6.8, 1.4, 6.3, '#9affe0', 0.25, 3, 0.4, 0.4);
  }

  // ---------------------------------------------------------------- depósito
  {
    const D = 'deposito';
    const d = ctx.g(D, 'vc');
    const ds = ctx.g(D, 'steel');
    // estantes de aço (parede leste e sul)
    for (const [x, z, w, dd, ry] of [
      [9.55, 9.6, 0.7, 4.6, 0],
      [6.2, 15.55, 0.7, 3.6, Math.PI / 2],
    ] as [number, number, number, number, number][]) {
      const alongZ = ry === 0;
      for (let k = 0; k < 4; k++) ds.box(alongZ ? w : dd, 0.03, alongZ ? dd : w, x, 0.15 + k * 0.6, z, '#c8ccd2');
      for (const s of [-1, 1]) for (const t of [-1, 1]) ds.box(0.05, 2.2, 0.05, x + (alongZ ? (s * w) / 2 : (t * dd) / 2), 0, z + (alongZ ? (t * dd) / 2 : (s * w) / 2), '#5a6a7a');
      for (let k = 0; k < 4; k++)
        for (let i = 0; i < 6; i++) {
          if ((i + k) % 5 === 4) continue;
          const u = -dd / 2 + 0.4 + i * (dd - 0.8) / 5;
          d.box(0.45, 0.32 + ((i * k) % 3) * 0.06, 0.45, x + (alongZ ? 0 : u), 0.18 + k * 0.6, z + (alongZ ? u : 0), ['#c89a6a', '#b8885a', '#d8aa7a', '#e8e4dc'][(i + k) % 4]);
        }
      ctx.boxAt(x, z, alongZ ? w : dd, alongZ ? dd : w, 0, 2.3);
    }
    // aquecedor de água e tanque
    d.cyl(0.3, 0.3, 1.5, 4.6, 0, 15.5, '#e8ecef', 14);
    d.box(0.6, 0.8, 0.5, 5.4, 0, 15.6, '#c8ccd2');
    ctx.boxAt(4.9, 15.5, 1.4, 0.7, 0, 1.6);
    // paleteira
    d.box(0.55, 0.08, 1.15, 5.2, 0.04, 9.0, '#e8423a');
    d.cyl(0.03, 0.03, 1.1, 5.2, 0.1, 8.4, '#2a2a30', 6, 0.3);
    shadow(ctx, D, 9.55, 11.6, 1.2, 4.8);
  }

  // ---------------------------------------------------------------- banheiro externo
  {
    const B = 'banheiro';
    const b = ctx.g(B, 'vc');
    b.box(0.42, 0.42, 0.55, 15.5, 0, 8.3, '#ffffff', Math.PI / 2);
    b.sph(0.22, 15.45, 0.42, 8.3, '#ffffff', 1, 0.3, 1.2, 12);
    b.box(0.5, 0.4, 0.18, 15.88, 0.4, 8.3, '#ffffff');
    ctx.boxAt(15.6, 8.3, 0.7, 0.6, 0, 1);
    b.box(0.5, 0.82, 0.45, 15.73, 0, 5.1, '#e8ecef');
    b.lathe(
      [
        [0, 0],
        [0.17, 0],
        [0.2, 0.08],
        [0, 0.08],
      ],
      15.68,
      0.8,
      5.1,
      '#ffffff',
      14,
    );
    b.tube(
      [
        [15.95, 0.88, 5.1],
        [15.95, 1.02, 5.1],
        [15.82, 1.04, 5.1],
      ],
      0.016,
      '#d8dce4',
      6,
      6,
    );
    ctx.boxAt(15.73, 5.1, 0.5, 0.5, 0, 1);
    b.box(0.3, 0.24, 0.18, 14.4, 1.2, 4.1, '#f2f2f4');
    trashBin(b, 12.6, 8.5, '#5ab8a8');
    ctx.boxAt(12.6, 8.5, 0.5, 0.5);
  }
}
