/* ============================================================
 *  LANCHONETE — estacionamento, pista do drive, calçada, rua,
 *  placa alta com o letreiro, postes, carros parados, mato e árvores.
 * ============================================================ */
import type { MapCtx } from '../kit2/ctx';
import { car, halo, shadow, streetLamp, trashBin } from '../kit2/props';
import { asphaltTex, concreteTex } from '../kit2/tex';
import { natureLayerTex, scatter, skyDome, treeBelt, tufts } from '../kit2/outdoor';
import { driveMenu, logoSign } from './art';

const E = 'estac';

export function buildOutside(ctx: MapCtx): void {
  ctx.defMat('asphalt', { map: asphaltTex(), uv: 1 / 4 });
  ctx.defMat('concrete', { map: concreteTex(256, 2), uv: 1 / 3 });
  ctx.defMat('grass', { map: natureLayerTex('grass'), uv: 1 / 3 });

  // ---------- luzes de fora (postes alaranjados, luz das janelas, letreiro)
  streetLamp(ctx, E, -8, 12.2, Math.PI, 6, '#ffb36a', 1.5, 15);
  streetLamp(ctx, E, 4.5, 12.2, Math.PI, 6, '#ffb36a', 1.5, 15);
  streetLamp(ctx, E, 17, 6, -Math.PI / 2, 6, '#ffb36a', 1.4, 14);
  streetLamp(ctx, E, -15, -3, Math.PI / 2, 6, '#ffb36a', 1.2, 13);
  streetLamp(ctx, E, 16.5, -8, -Math.PI / 2, 6, '#ffb36a', 1.2, 13);
  streetLamp(ctx, E, -4, 20.4, 0, 7, '#ffd09a', 1.3, 15);
  streetLamp(ctx, E, 14, 20.4, 0, 7, '#ffd09a', 1.3, 15);
  for (const [x, z] of [
    [-9.2, 10.4],
    [-4.8, 10.4],
    [1.9, 10.4],
    [7, 10.4],
    [11.4, 5.6],
    [-13.4, 1.6],
    [-13.4, 6.4],
  ])
    ctx.light([E], x, 1.4, z, '#ffd8a0', 0.55, 6, 0.8, 0.35);
  ctx.light([E], -1, 3.7, 10.2, '#ff6a4a', 0.7, 7, 1.2, 0.3); // letreiro da fachada

  // ---------- chão
  // estacionamento + pista do drive (asfalto) — fica 3 cm abaixo do piso interno
  ctx.floor(E, 'asphalt', -24, -14, 26, 21, '#ffffff', -0.03, false, ctx.tier === 0 ? 2 : 1.2);
  // rua
  ctx.floor(E, 'asphalt', -60, 21, 60, 27, '#8a8a92', -0.025, false, 2);
  // grama em volta (bem grande)
  ctx.floor(E, 'grass', -70, -50, 70, 21, '#566a4a', -0.07, false, 6);
  ctx.floor(E, 'grass', -70, 27, 70, 70, '#566a4a', -0.07, false, 6);
  // calçada elevada (sul e oeste) com meio-fio
  const C = ctx.g(E, 'concrete');
  C.box(26.2, 0.14, 2.3, -1, -0.02, 10.15, '#d8d4cc');
  C.box(2.3, 0.14, 21.4, -13.15, -0.02, -0.3, '#d8d4cc');
  C.box(2.2, 0.14, 7.6, 11.1, -0.02, 5.25, '#d8d4cc');
  ctx.g(E, 'vc').box(26.2, 0.16, 0.14, -1, -0.03, 11.32, '#bab6ae');
  // pintura: vagas (linhas brancas), faixa do drive, setas
  const P = ctx.g(E, 'vc');
  for (let i = 0; i <= 8; i++) P.sharp(0.12, 0.012, 4.8, -11 + i * 2.6, -0.03, 14.4, '#e8e8e0');
  P.sharp(2.2, 0.012, 0.12, -11 + 2 * 2.6 + 1.3, -0.03, 16.7, '#e8e8e0');
  for (let i = 0; i < 2; i++) P.sharp(0.12, 0.012, 4.8, 17 + i * 2.8, -0.03, -4, '#e8e8e0');
  P.sharp(0.15, 0.012, 22, 12.4, -0.03, 1, '#ffd23a');
  P.sharp(0.15, 0.012, 22, 15.6, -0.03, 1, '#ffd23a');
  for (const z of [8, 2, -5]) {
    P.sharp(0.25, 0.012, 1.4, 14, -0.03, z, '#f2f2ea');
    P.box(0.8, 0.012, 0.25, 14, -0.03, z - 0.75, '#f2f2ea', Math.PI / 4);
  }
  // símbolo de cadeirante numa vaga (quadrado azul)
  P.sharp(2.4, 0.011, 4.6, -11 + 1.3, -0.031, 14.4, '#2a5aa8');
  P.sharp(0.9, 0.012, 0.9, -11 + 1.3, -0.03, 15.6, '#f2f2f2');
  // faixa da rua (tracejada) e sarjeta
  for (let x = -58; x < 58; x += 4) P.sharp(2, 0.012, 0.15, x, -0.025, 24, '#ffd23a');
  P.box(120, 0.16, 0.25, 0, -0.05, 20.9, '#9a968e');
  P.box(120, 0.16, 0.25, 0, -0.05, 27.1, '#9a968e');
  // canteiros
  for (const [x0, z0, x1, z1] of [
    [-24, 17, -14, 20.8],
    [9, 17, 26, 20.8],
  ]) {
    P.box(x1 - x0, 0.18, z1 - z0, (x0 + x1) / 2, -0.04, (z0 + z1) / 2, '#7a766e');
    ctx.g(E, 'grass').box(x1 - x0 - 0.3, 0.02, z1 - z0 - 0.3, (x0 + x1) / 2, 0.13, (z0 + z1) / 2, '#4a6a3a');
  }

  // ---------- placa alta "Bloop Lanches 24h"
  {
    const x = -18.5;
    const z = 18.6;
    P.cyl(0.22, 0.28, 7.2, x - 1.2, -0.03, z, '#6a6e78', 12);
    P.cyl(0.22, 0.28, 7.2, x + 1.2, -0.03, z, '#6a6e78', 12);
    P.box(4.6, 1.6, 0.5, x, 6.2, z, '#3a2a30');
    P.box(4.8, 0.12, 0.6, x, 7.8, z, '#ffd23a');
    ctx.refs.set('poleSign', ctx.picture(E, logoSign(), 4.4, 1.38, x, 7.0, z + 0.26, 0, true));
    ctx.refs.set('poleSignB', ctx.picture(E, logoSign(), 4.4, 1.38, x, 7.0, z - 0.26, Math.PI, true));
    halo(ctx, E, x, 7.0, z + 0.32, 7.5, 3.4, '#ff5a3a');
    ctx.light([E], x, 6.4, z + 1.5, '#ff6a4a', 0.9, 10, 1.5, 0.3);
    P.box(2.8, 0.5, 0.4, x, 0, z, '#7a766e');
    ctx.boxAt(x, z, 3.2, 0.6, 0, 3);
  }
  // letreiro da fachada (sobre a porta)
  ctx.refs.set('frontSign', ctx.picture(E, logoSign(), 4.0, 1.0, -1, 3.62, 9.18, 0, true));

  // ---------- drive-thru: cardápio de fora + poste do interfone
  {
    const x = 16.1;
    const z = 5;
    P.box(0.3, 1.0, 0.3, x, -0.03, z - 0.6, '#3a3a42');
    P.box(0.3, 1.0, 0.3, x, -0.03, z + 0.6, '#3a3a42');
    P.box(0.25, 2.1, 1.8, x + 0.05, 0.9, z, '#d8302a');
    ctx.refs.set('driveMenu', ctx.picture(E, driveMenu(), 1.45, 1.75, x - 0.09, 1.95, z, -Math.PI / 2, true));
    ctx.light([E], x - 0.8, 1.9, z, '#ffeedd', 0.6, 4, 0.6, 0.3);
    // interfone
    P.cyl(0.06, 0.06, 1.2, 15.4, -0.03, 3.0, '#5a5e66', 8);
    P.box(0.35, 0.5, 0.25, 15.4, 1.1, 3.0, '#e8423a');
    P.box(0.02, 0.2, 0.18, 15.27, 1.25, 3.0, '#2a2a30');
    ctx.boxAt(16.1, 5, 0.5, 1.8, 0, 3);
    ctx.boxAt(15.4, 3.0, 0.4, 0.4);
  }
  // ---------- carros parados (o "carro a mais" é anomalia)
  car(ctx, E, '#3a6ad8', -11 + 2.6 * 3 + 1.3, 14.6, Math.PI, 'hatch', false);
  car(ctx, E, '#e8e4dc', -11 + 2.6 * 6 + 1.3, 14.4, Math.PI, 'van', false);
  ctx.boxAt(-11 + 2.6 * 3 + 1.3, 14.6, 1.9, 4.1, 0, 1.7);
  ctx.boxAt(-11 + 2.6 * 6 + 1.3, 14.4, 1.9, 4.4, 0, 1.9);
  // carro dos funcionários atrás
  car(ctx, E, '#7a3a8a', 17, -4, Math.PI, 'hatch', false);
  ctx.boxAt(17, -4, 1.9, 4.1, 0, 1.7);

  // ---------- lixeira grande atrás da cozinha + cerquinha
  {
    const x = 3.5;
    const z = -11.5;
    P.box(2.0, 1.25, 1.2, x, 0.1, z, '#2a6a4a');
    P.box(2.05, 0.1, 1.25, x, 1.35, z, '#1f4a36', 0, 0.12);
    for (const s of [-1, 1]) P.cyl(0.12, 0.12, 0.08, x + s * 0.8, 0.0, z + 0.45, '#222', 8, Math.PI / 2);
    shadow(ctx, E, x, z, 2.8, 2.0, 0, -0.022);
    ctx.boxAt(x, z, 2.1, 1.3, 0, 1.6);
    for (let i = 0; i < 8; i++) P.box(0.12, 1.8, 0.04, 1.8 + i * 0.5, -0.03, -12.8, '#8a6a4a');
    P.box(3.8, 0.08, 0.06, 3.55, 1.4, -12.82, '#7a5a3a');
    P.box(3.8, 0.08, 0.06, 3.55, 0.4, -12.82, '#7a5a3a');
  }
  // banco e lixeira na calçada
  {
    const W = ctx.g(E, 'wood');
    for (let i = 0; i < 3; i++) W.box(1.6, 0.04, 0.12, -7.6, 0.45, 10.4 + i * 0.14, '#a8784a');
    for (let i = 0; i < 2; i++) W.box(1.6, 0.12, 0.04, -7.6, 0.62 + i * 0.16, 10.9, '#a8784a', 0, -0.15);
    for (const s of [-1, 1]) P.box(0.06, 0.45, 0.5, -7.6 + s * 0.7, 0.1, 10.55, '#3a3a42');
    trashBin(P, -5.6, 10.6, '#8a2e28');
    ctx.boxAt(-7.6, 10.6, 1.7, 0.6, 0, 1);
    ctx.boxAt(-5.6, 10.6, 0.5, 0.5);
  }
  // hidrante e floreiras na calçada
  P.cyl(0.13, 0.15, 0.6, 9.2, 0.1, 10.8, '#e8302a', 10);
  P.sph(0.14, 9.2, 0.72, 10.8, '#e8302a', 1, 0.7, 1, 10);
  P.cyl(0.05, 0.05, 0.3, 9.2, 0.45, 10.8, '#c8202a', 8, 0, Math.PI / 2);
  for (const x of [-10.5, 4.6]) {
    P.box(1.4, 0.45, 0.5, x, 0.1, 10.75, '#7a766e');
    for (let i = 0; i < 4; i++) P.sph(0.22, x - 0.5 + i * 0.33, 0.62, 10.75, ['#2f6a34', '#3f8a40', '#4a9a4a'][i % 3], 1, 0.8, 1, 8);
  }

  // ---------- céu, árvores, capim
  skyDome(ctx);
  const avoid: [number, number, number, number][] = [
    [-26, -16, 28, 21.5],
    [-62, 20, 62, 28],
  ];
  const nT = ctx.tier === 0 ? 40 : ctx.tier === 1 ? 70 : 110;
  const trees = scatter(nT, -60, -48, 60, 62, avoid, 3, 0.9, 1.5);
  // fileira perto do lote (sempre)
  for (let x = -30; x <= 32; x += 5.5) trees.push([x + ((x * 7) % 3), -18.5 - ((x * 3) % 2), 1.1]);
  for (let z = -14; z <= 18; z += 5) {
    trees.push([-28.5 - ((z * 5) % 2), z, 1.15]);
    trees.push([30 + ((z * 3) % 2), z + 1, 1.05]);
  }
  treeBelt(ctx, E, trees, ['broad', 'pine', 'oak', 'pine']);
  const tp: [number, number][] = [];
  for (const [x, z] of scatter(ctx.tier >= 2 ? 160 : 70, -40, -30, 40, 40, [[-25, -15, 27, 21.2], [-62, 20.5, 62, 27.5]], 9)) tp.push([x, z]);
  tufts(ctx, E, tp);
}
