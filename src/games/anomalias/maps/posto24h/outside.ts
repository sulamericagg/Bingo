/* ============================================================
 *  POSTO 24h — lado de fora: pátio de concreto, cobertura "Bloop Gás"
 *  com 4 bombas, placa de preços, calibrador, lava-jato, orelhão,
 *  estrada com postes, mato e árvores escuras (módulo de natureza).
 * ============================================================ */
import * as THREE from 'three';
import type { GeoBuilder } from '../../../../3d/common/geo';
import type { MapCtx } from '../kit2/ctx';
import { car, halo, shadow, streetLamp, trashBin } from '../kit2/props';
import { natureLayerTex, scatter, skyDome, treeBelt, tufts } from '../kit2/outdoor';
import { fasciaTex, priceSign, storeSign, washSign, TEAL, TEAL_D, SUN } from './art';

const P = 'patio';
export const PUMPS: [number, number][] = [
  [-3.5, -12.6],
  [-3.5, -9.0],
  [3.5, -12.6],
  [3.5, -9.0],
];
export const NOZZLE = ['#2ac85a', '#ffd23a', '#2a2a30'];

/** bomba de combustível (corpo; frente para ±X — os dois lados) sem a tela/bico da anomalia */
export function pumpGeo(g: GeoBuilder): void {
  g.box(0.9, 0.12, 0.6, 0, 0, 0, '#3a4a4e');
  g.box(0.75, 1.75, 0.5, 0, 0.12, 0, '#f2f4f4');
  g.box(0.77, 0.5, 0.52, 0, 1.6, 0, TEAL);
  g.box(0.79, 0.06, 0.54, 0, 1.55, 0, SUN);
  for (const s of [-1, 1]) {
    // painel da tela (moldura escura) e teclado
    g.box(0.02, 0.36, 0.34, s * 0.385, 1.1, 0, '#1a2228');
    g.box(0.02, 0.18, 0.2, s * 0.385, 0.75, 0, '#2a3238');
    // coldres dos 3 bicos
    for (let k = 0; k < 3; k++) {
      g.box(0.06, 0.16, 0.1, s * 0.4, 0.42, -0.15 + k * 0.15, NOZZLE[k]);
      g.box(0.05, 0.22, 0.05, s * 0.43, 0.48, -0.15 + k * 0.15, '#2a2a30', 0, 0, s * 0.3);
    }
  }
}

export function buildOutside(ctx: MapCtx): void {
  ctx.defMat('grass', { map: natureLayerTex('grass'), uv: 1 / 3 });
  ctx.defMat('fascia', { map: fasciaTex(), glow: true, rawUv: true });

  // ---------------------------------------------------------------- luzes de fora
  // cobertura: painéis de LED fortes (o posto é o ponto mais claro da noite)
  for (const x of [-5.5, 0, 5.5])
    for (const z of [-14.5, -7.5]) {
      ctx.g(P, 'glow').sharp(1.6, 0.02, 0.9, x, 4.845, z, '#f4fbff');
      ctx.g(P, 'vc').sharp(1.8, 0.04, 1.1, x, 4.86, z, '#c8ccd2');
      ctx.light([P], x, 4.75, z, '#eaf6ff', 0.62, 13, 3.4, 0.08, true);
    }
  // luz rebatida do piso clareando o forro da cobertura
  ctx.light([P], 0, 0.3, -11, '#dff0ff', 0.45, 16, 9, 1);
  streetLamp(ctx, 'estrada', -22, -24.6, Math.PI, 7, '#ffb36a', 1.3, 15, ['estrada', P]);
  streetLamp(ctx, 'estrada', 14, -24.6, Math.PI, 7, '#ffb36a', 1.3, 15, ['estrada', P]);
  streetLamp(ctx, 'estrada', 50, -24.6, Math.PI, 7, '#ffb36a', 1.1, 14, ['estrada']);
  streetLamp(ctx, 'estrada', -56, -24.6, Math.PI, 7, '#ffb36a', 1.1, 14, ['estrada']);
  streetLamp(ctx, P, -12.5, 8.5, Math.PI / 2, 6, '#ffc890', 1.0, 12);
  // luz da loja saindo pela vitrine
  for (const x of [-6.5, 2.0]) ctx.light([P], x, 1.4, 0.4, '#f2f8ff', 0.6, 7, 1.2, 0.35);
  ctx.light([P], -2, 1.6, 0.8, '#f2f8ff', 0.4, 5, 0.6, 0.3);

  // ---------------------------------------------------------------- chão
  ctx.floor(P, 'asphalt2', -40, -24, 40, 30, '#ffffff', -0.03, false, ctx.tier === 0 ? 2.5 : 1.5);
  ctx.floor(P, 'concrete', -13, -21, 12, 0.05, '#ffffff', -0.012, false, ctx.tier === 0 ? 2 : 1);
  ctx.floor('lavajato', 'concrete', -24, -10, -14, 4, '#c8ccd2', -0.014, false, 1);
  ctx.floor(P, 'concrete', -25.5, -12, -12.5, -10, '#9a9690', -0.014, false, 1.5);
  ctx.floor(P, 'concrete', -25.5, 4, -12.5, 6, '#9a9690', -0.014, false, 1.5);
  ctx.floor('estrada', 'asphalt2', -90, -38, 90, -24, '#7a7a82', -0.025, false, 3);
  ctx.floor(P, 'grass', -95, -24, 95, 90, '#4f6446', -0.07, false, 6);
  ctx.floor('estrada', 'grass', -95, -80, 95, -38, '#4f6446', -0.07, false, 6);
  // calçada da loja
  const C = ctx.g(P, 'concrete');
  C.box(22.4, 0.13, 2.2, 0, -0.02, 0.9, '#d8d4cc');
  C.box(1.9, 0.13, 7.5, 11.0, -0.02, 6.0, '#d8d4cc');
  ctx.g(P, 'vc').box(22.4, 0.15, 0.12, 0, -0.03, -0.2, '#c8b84a');
  // pintura: faixa da estrada, setas e vagas
  const V = ctx.g(P, 'vc');
  const R = ctx.g('estrada', 'vc');
  for (let x = -88; x < 88; x += 4.5) R.sharp(2.4, 0.012, 0.16, x, -0.025, -31, '#ffd23a');
  R.sharp(176, 0.012, 0.14, 0, -0.025, -25.0, '#e8e8e0');
  R.sharp(176, 0.012, 0.14, 0, -0.025, -37.0, '#e8e8e0');
  // guard-rail do outro lado
  for (let x = -60; x <= 60; x += 2.5) R.box(0.1, 0.65, 0.1, x, -0.03, -38.6, '#9aa0a8');
  R.box(120, 0.22, 0.06, 0, 0.42, -38.55, '#c8ccd2');
  // vagas a leste (ao lado da cobertura)
  for (const x of [16.2, 18.8, 21.4, 24.0]) V.sharp(0.12, 0.012, 4.8, x, -0.03, -5.6, '#e8e8e0');
  for (const z of [-19, -3.2]) {
    V.sharp(0.22, 0.012, 1.3, -0.0, -0.01, z, '#f2f2ea');
    V.box(0.7, 0.012, 0.22, 0, -0.01, z - 0.7, '#f2f2ea', Math.PI / 4);
  }

  // ---------------------------------------------------------------- cobertura "Bloop Gás"
  {
    const x0 = -9;
    const x1 = 9;
    const z0 = -17.5;
    const z1 = -4.5;
    const v = ctx.g(P, 'vc');
    v.sharp(x1 - x0, 0.08, z1 - z0, 0, 4.9, (z0 + z1) / 2, '#f2f4f6');
    v.box(x1 - x0 + 0.2, 0.75, z1 - z0 + 0.2, 0, 4.98, (z0 + z1) / 2, '#d8dcde');
    // faixa luminosa nos 4 lados
    const F = ctx.g(P, 'fascia');
    const band = (w: number, cx: number, cz: number, ry: number) => {
      const pg = new THREE.PlaneGeometry(w, 0.66);
      const uv = pg.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (w / 6));
      F.geo(pg, '#ffffff', cx, 5.34, cz, 0, ry);
    };
    band(x1 - x0 + 0.24, 0, z0 - 0.125, Math.PI);
    band(x1 - x0 + 0.24, 0, z1 + 0.125, 0);
    band(z1 - z0 + 0.24, x0 - 0.125, (z0 + z1) / 2, -Math.PI / 2);
    band(z1 - z0 + 0.24, x1 + 0.125, (z0 + z1) / 2, Math.PI / 2);
    halo(ctx, P, 0, 5.3, z0 - 0.3, 22, 2.2, '#2ae8d0');
    // pilares revestidos
    for (const [x, z] of [
      [-3.5, -15.2],
      [3.5, -15.2],
      [-3.5, -6.8],
      [3.5, -6.8],
    ]) {
      v.box(0.5, 4.95, 0.5, x, 0, z, '#e8ecee');
      v.box(0.54, 1.0, 0.54, x, 0, z, TEAL_D);
      v.box(0.56, 0.08, 0.56, x, 1.0, z, SUN);
      ctx.boxAt(x, z, 0.55, 0.55, 0, 5);
    }
    // ilhas e bombas
    for (const ix of [-3.5, 3.5]) {
      v.box(1.3, 0.2, 9.2, ix, -0.02, -10.9, '#c8c4bc');
      v.box(1.34, 0.08, 9.24, ix, 0.18, -10.9, SUN);
      ctx.box(ix - 0.65, -15.5, ix + 0.65, -6.3, 0, 0.3);
      // protetores amarelos nas pontas
      for (const z of [-15.3, -6.5]) v.cyl(0.08, 0.08, 0.9, ix, 0.18, z, SUN, 10);
    }
    for (const [x, z] of PUMPS) {
      const g = ctx.gb('vc');
      pumpGeo(g);
      const geo = g.build();
      geo.translate(x, 0.26, z);
      v.colored(geo);
      geo.dispose();
      shadow(ctx, P, x, z, 1.4, 1.1, 0, 0.27);
      ctx.boxAt(x, z, 0.9, 0.7, 0, 2);
      // telas das bombas (glow) — a de [3] é anomalia
      for (const s of [-1, 1]) if (!(x === PUMPS[3][0] && z === PUMPS[3][1] && s === 1)) ctx.g(P, 'glow').box(0.01, 0.28, 0.28, x + s * 0.398, 1.38, z, '#1a5a3a');
    }
    // mangueiras (das bombas até o bico no coldre) — a da bomba [3] lado leste é anomalia
    for (const [pi, [x, z]] of PUMPS.entries())
      for (const s of [-1, 1]) {
        if (pi === 3 && s === 1) continue;
        v.tube(
          [
            [x + s * 0.2, 2.08, z],
            [x + s * 0.55, 1.6, z + 0.1],
            [x + s * 0.6, 0.6, z + 0.2],
            [x + s * 0.43, 0.6, z],
          ],
          0.022,
          '#1a1a1e',
          10,
          5,
        );
      }
    // lixeiras + baldes com rodo nas ilhas
    for (const [ix, i] of [
      [-3.5, 0],
      [3.5, 1],
    ] as [number, number][]) {
      // (lixeira da ilha 1 e balde da ilha 2 são anomalias)
      if (i === 1) {
        trashBin(v, ix, -14.6, TEAL_D);
        ctx.boxAt(ix, -14.6, 0.5, 0.5, 0, 1.2);
      } else {
        v.cyl(0.16, 0.13, 0.32, ix, 0.26, -7.1, '#2a6ad8', 12);
        v.cyl(0.012, 0.012, 0.8, ix + 0.05, 0.3, -7.1, '#8a6a4a', 6, 0, 0.2);
        v.box(0.32, 0.04, 0.05, ix + 0.21, 1.06, -7.1, '#2a2a30', 0, 0, 0.2);
      }
    }
  }

  // ---------------------------------------------------------------- placa alta de preços (perto da estrada)
  {
    const x = -15;
    const z = -21.5;
    V.box(0.5, 6.6, 0.5, x, -0.03, z, '#e8ecee');
    V.box(2.5, 3.9, 0.55, x, 4.0, z, TEAL);
    V.box(2.6, 0.12, 0.62, x, 7.9, z, SUN);
    const p = ctx.picture(P, priceSign(), 2.3, 3.45, x, 5.95, z - 0.285, Math.PI, true);
    const p2 = ctx.picture(P, priceSign(), 2.3, 3.45, x, 5.95, z + 0.285, 0, true);
    ctx.refs.set('price', p);
    ctx.refs.set('price2', p2);
    halo(ctx, P, x, 5.9, z - 0.35, 4.6, 5.0, '#3ae0c8');
    ctx.light([P, 'estrada'], x, 5, z - 1.5, '#9ff0e0', 0.6, 9, 1.5, 0.3);
    V.box(1.6, 0.5, 1.6, x, -0.03, z, '#8a8680');
    ctx.boxAt(x, z, 1.6, 1.6, 0, 3);
  }
  // letreiro da loja
  ctx.refs.set('storeSign', ctx.picture(P, storeSign(), 6.4, 1.0, -2.5, 3.52, 1.8, Math.PI, true));
  halo(ctx, P, -2.5, 3.5, 1.7, 9, 2.4, '#bff8ee');

  // ---------------------------------------------------------------- calibrador (ar/água) e gelo
  {
    V.box(0.5, 1.3, 0.4, 9.2, 0, -2.6, '#e8423a');
    V.box(0.42, 0.3, 0.02, 9.2, 0.85, -2.39, '#1a2228');
    ctx.g(P, 'glow').box(0.36, 0.22, 0.01, 9.2, 0.89, -2.375, '#3ad06a');
    ctx.boxAt(9.2, -2.6, 0.5, 0.4, 0, 1.4);
    // freezer de gelo encostado na loja
    V.box(1.4, 1.2, 0.75, 7.0, 0.1, 2.5, '#f2f4f8', 0);
    V.box(1.3, 0.3, 0.02, 7.0, 0.8, 2.11, '#2a6ad8');
    ctx.boxAt(7.0, 2.5, 1.4, 0.75, 0, 1.4);
  }

  // ---------------------------------------------------------------- lava-jato (x −24..−14, z −10..4)
  {
    const L = 'lavajato';
    const lv = ctx.g(L, 'vc');
    const sides = [-24, -14];
    for (const sx of sides) {
      // paredes laterais (painel azul + faixa)
      ctx.wall(sx < -20 ? [P, L] : [L, P], sx, -10, sx, 4, { h: 4.2, col: [sx < -20 ? '#d8dce4' : '#3a6ad8', sx < -20 ? '#3a6ad8' : '#d8dce4'], low: ['#2a3a5a', '#2a3a5a'], lowH: 0.5, base: false });
    }
    // teto
    ctx.floor(L, 'vc', -24, -10, -14, 4, '#c8ccd2', 4.12, true, 1);
    ctx.g(P, 'vc').sharp(10.4, 0.15, 14.2, -19, 4.2, -3, '#3a3e46');
    // arcos de entrada/saída
    for (const z of [-10, 4]) ctx.g(P, 'vc').box(10.4, 0.6, 0.3, -19, 3.7, z, '#2a6ad8');
    ctx.refs.set('washSign', ctx.picture(P, washSign(), 4.2, 1.05, -19, 3.95, -10.17, Math.PI, true));
    // trilho no chão e ralos
    for (const sx of [-1, 1]) lv.box(0.2, 0.12, 13.6, -19 + sx * 0.95, -0.014, -3, '#5a5e66');
    lv.sharp(0.8, 0.01, 12, -19, -0.012, -3, '#2a2e34');
    // pórtico com sprays
    lv.box(9.0, 0.25, 0.3, -19, 3.2, -6.5, '#c8ccd2');
    for (let i = 0; i < 9; i++) lv.cyl(0.04, 0.03, 0.15, -23 + i, 3.05, -6.5, '#3a3e46', 8);
    // luz azulada fraca
    ctx.light([L], -19, 1.0, -3, '#b8d8ff', 0.15, 9, 6, 1);
    for (const z of [-7.5, -3, 1.5]) {
      ctx.light([L], -19, 4.0, z, '#b8d8ff', 0.85, 7, 2.5, 0.2, true);
      ctx.g(L, 'glow').sharp(1.6, 0.02, 0.5, -19, 4.17, z, '#d8ecff');
    }
  }

  // ---------------------------------------------------------------- orelhão (telefone público)
  {
    const x = 11.0;
    const z = 1.6;
    V.cyl(0.06, 0.06, 1.6, x, 0, z, '#5a5e66', 8);
    V.sph(0.55, x, 2.05, z + 0.05, '#ff8a1a', 1, 0.9, 0.85, 14);
    V.box(0.32, 0.5, 0.14, x, 1.4, z - 0.12, '#c8ccd2');
    ctx.boxAt(x, z, 0.5, 0.5, 0, 2);
  }

  // ---------------------------------------------------------------- carros parados (cenário)
  car(ctx, P, '#c8302a', 17.5, -5.6, Math.PI, 'hatch', false);
  ctx.boxAt(17.5, -5.6, 1.9, 4.1, 0, 1.7);

  // ---------------------------------------------------------------- lixeiras grandes atrás e pallets
  {
    V.box(2.0, 1.3, 1.2, 6.5, 0.0, 18.0, '#2a6a4a');
    V.box(2.05, 0.1, 1.25, 6.5, 1.3, 18.0, '#1f4a36', 0, 0.1);
    ctx.boxAt(6.5, 18, 2.1, 1.3, 0, 1.5);
    for (let i = 0; i < 3; i++) V.box(1.2, 0.14, 1.0, -6 + i * 0.05, i * 0.15, 17.6, '#a8784a');
    ctx.boxAt(-6, 17.6, 1.3, 1.1, 0, 0.6);
  }

  // ---------------------------------------------------------------- céu, árvores, capim
  skyDome(ctx, '#060a1c', '#182040');
  const avoid: [number, number, number, number][] = [
    [-30, -24, 22, 22],
    [-95, -39, 95, -23],
  ];
  const nT = ctx.tier === 0 ? 45 : ctx.tier === 1 ? 80 : 120;
  const trees = scatter(nT, -70, -75, 70, 70, avoid, 5, 0.9, 1.6);
  for (let x = -60; x <= 60; x += 5) trees.push([x + ((x * 7) % 3), -42 - ((x * 3) % 3), 1.2]);
  for (let x = -34; x <= 30; x += 5) trees.push([x, 25 + ((x * 5) % 3), 1.1]);
  for (let z = -20; z <= 22; z += 5) {
    trees.push([-33 - ((z * 3) % 2), z, 1.15]);
    trees.push([26 + ((z * 7) % 2), z, 1.05]);
  }
  treeBelt(ctx, P, trees, ['pine', 'broad', 'pine', 'oak']);
  const tp: [number, number][] = [];
  for (const [x, z] of scatter(ctx.tier >= 2 ? 180 : 80, -45, -60, 45, 40, [
    [-30, -24.5, 23, 21],
    [-95, -38.5, 95, -23.5],
  ], 13))
    tp.push([x, z]);
  tufts(ctx, P, tp);
}
