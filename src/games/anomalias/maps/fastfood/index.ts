/* ============================================================
 *  ANOMALIAS — mapa "Lanchonete" (id 'fastfood').
 *  Lanchonete 24h inventada ("Bloop Lanches") de madrugada: salão com
 *  cabines e mesas, cantinho kids, balcão com caixas e cardápios,
 *  cozinha (chapa, fritadeira, montagem, bebidas), câmara fria,
 *  drive-thru, banheiros, escritório com monitores e o estacionamento.
 *
 *  Planta (m; x → leste, z → sul/frente; teto 3,2):
 *    z −12..−9  câmara fria (x 8..12)
 *    z −9..−2   banheiros (x −12..−6) · escritório (−6..0) · cozinha (0..12)
 *    z −2..9    cantinho kids (−12..−6,5) · salão (−6,5..4) · balcão (4..10)
 *    z −2..1,5  drive-thru (x 10..12, janela na parede x = 12)
 *    z > 9      estacionamento, rua (z 20..26) e mato
 * ============================================================ */
import type { MapBuild, MapDef } from '../types';
import { MapCtx, type Tier } from '../kit2/ctx';
import { stdMats } from '../kit2/props';
import { checkerTex, fontsReady, hexTex, rubberTex, tileTex, carpetTex, steelTex } from '../kit2/tex';
import { buildShell } from './shell';
import { buildFurniture } from './furniture';
import { buildOutside } from './outside';
import { buildAnomalies } from './anomalies';
import { buildTasks } from './tasks';

async function build(opts: { tier: Tier }): Promise<MapBuild> {
  await fontsReady();
  const ctx = new MapCtx(opts.tier);
  stdMats(ctx);
  ctx.defMat('checker', { map: checkerTex('#f2e6cc', '#b83a30', 4), uv: 1 / 1.2 });
  ctx.defMat('quarry', { map: tileTex('#b8603e', '#5a3426', 4, 4, 256, 0.08, 3), uv: 1 / 0.8 });
  ctx.defMat('ktile', { map: tileTex('#f4f4ee', '#b8b8b0', 4, 8, 256, 0.03, 4), uv: 1 / 0.6 });
  ctx.defMat('rtile', { map: tileTex('#ececec', '#a8a8a8', 4, 8, 256, 0.04, 5), uv: 1 / 0.6 });
  ctx.defMat('hex', { map: hexTex('#f2f6f8', '#7ac8e8', '#b8c4c8'), uv: 1 / 0.9 });
  ctx.defMat('rubber', { map: rubberTex(), uv: 1 / 2 });
  ctx.defMat('carpet', { map: carpetTex(), uv: 1 / 1.5 });
  ctx.defMat('plate', { map: steelTex(), uv: 2 });

  // ---------- salas (ordem: interior primeiro) ----------
  const IN = 1.7;
  ctx.room('kids', 'Cantinho Kids', [-12, 0, -2], [-6.5, 3.3, 9], '#3a3048', IN);
  ctx.room('salao', 'Salão', [-6.5, 0, -2], [4, 3.3, 9], '#3a3044', IN);
  ctx.room('balcao', 'Balcão', [4, 0, -2], [10, 3.3, 9], '#3a3044', IN);
  ctx.room('drive', 'Drive-thru', [10, 0, -2], [12, 3.3, 1.5], '#30303e', IN);
  ctx.room('cozinha', 'Cozinha', [0, 0, -9], [12, 3.3, -2], '#343a44', IN);
  ctx.room('camara', 'Câmara Fria', [8, 0, -12], [12, 3.3, -9], '#2a3a50', IN);
  ctx.room('banheiros', 'Banheiros', [-12, 0, -9], [-6, 3.3, -2], '#30384a', IN);
  ctx.room('escritorio', 'Escritório', [-6, 0, -9], [0, 3.3, -2], '#2a2838', IN);
  ctx.room('estac', 'Estacionamento', [-26, 0, -16], [28, 12, 30], '#1c2444', 0.55, true);

  // o que se enxerga de cada sala (portas abertas, janelas, passagem do balcão)
  const FRONT = ['kids', 'salao', 'balcao', 'drive', 'estac', 'banheiros', 'escritorio', 'cozinha'];
  ctx.see('kids', FRONT);
  ctx.see('salao', FRONT);
  ctx.see('balcao', [...FRONT, 'camara']);
  ctx.see('drive', ['balcao', 'salao', 'kids', 'cozinha', 'estac', 'camara']);
  ctx.see('cozinha', ['balcao', 'salao', 'kids', 'drive', 'escritorio', 'camara', 'estac']);
  ctx.see('camara', ['cozinha', 'balcao']);
  ctx.see('banheiros', ['kids', 'salao', 'balcao', 'estac']);
  ctx.see('escritorio', ['salao', 'kids', 'balcao', 'cozinha', 'estac']);
  ctx.see('estac', ['kids', 'salao', 'balcao', 'drive']);
  buildShell(ctx);
  buildFurniture(ctx);
  buildOutside(ctx);
  buildTasks(ctx);
  buildAnomalies(ctx);

  // câmeras de segurança (pos alto no canto → olhar para o meio)
  const C = (r: string, p: [number, number, number], l: [number, number, number]) => ctx.cam(r, p, l);
  C('salao', [3.7, 2.95, -1.7], [-3, 0.6, 5]);
  C('salao', [-6.2, 2.95, 8.7], [1.5, 0.6, 1]);
  C('kids', [-11.7, 2.95, -1.7], [-8, 0.4, 6]);
  C('kids', [-6.8, 2.95, 8.7], [-10, 0.4, 2]);
  C('balcao', [9.7, 2.95, 8.7], [6, 0.8, 0]);
  C('balcao', [4.3, 2.95, -1.7], [8.5, 0.8, 4]);
  C('drive', [10.3, 2.95, 1.2], [11.6, 1, -1.2]);
  C('cozinha', [0.3, 2.95, -2.3], [8, 0.8, -7]);
  C('cozinha', [11.7, 2.95, -8.7], [3, 0.8, -3.5]);
  C('camara', [8.3, 2.9, -11.7], [11, 0.8, -9.5]);
  C('banheiros', [-6.3, 2.95, -2.3], [-10.5, 0.8, -7.5]);
  C('escritorio', [-0.3, 2.95, -8.7], [-4.5, 0.8, -3]);
  C('estac', [9.8, 3.4, 9.3], [-6, 0, 16]);
  C('estac', [-11.8, 3.4, 9.3], [6, 0, 15]);
  C('estac', [12.3, 3.4, -1.5], [13.5, 0.4, 6]);

  // vistas de 1ª pessoa (só para o visualizador/screenshots)
  const V = (id: string, p: [number, number, number], l: [number, number, number]) => (ctx.root.userData.views[id] = { pos: { x: p[0], y: p[1], z: p[2] }, look: { x: l[0], y: l[1], z: l[2] } });
  ctx.root.userData.views = {};
  V('salao', [3.4, 1.6, 6.2], [-5, 1.0, 2.5]);
  V('salao2', [-5.5, 1.6, -0.6], [1.5, 1.0, 7.5]);
  V('kids', [-6.9, 1.6, 0.0], [-10.5, 0.7, 6]);
  V('balcao', [-1, 1.6, 6.5], [7.5, 1.6, 0]);
  V('balcao2', [6.4, 1.6, 0.4], [6.4, 1.2, 8]);
  V('drive', [10.3, 1.6, 1.1], [12, 1.3, -1.2]);
  V('cozinha', [6.6, 1.6, -2.6], [3, 1.0, -8.5]);
  V('cozinha2', [1.0, 1.6, -3.0], [10, 1.0, -7.5]);
  V('camara', [10, 1.6, -9.3], [10, 1.0, -12]);
  V('banheiros', [-9.6, 1.6, -2.6], [-6.3, 1.2, -6.4]);
  V('escritorio', [-0.6, 1.6, -2.6], [-4.2, 1.0, -7.5]);
  V('estac', [8, 1.6, 17], [-2, 1.8, 8]);
  V('estac2', [-14, 1.6, 12], [10, 1.5, 10]);
  // vistas das anomalias (pares antes/depois)
  V('v_cabine', [-3.0, 1.5, 6.4], [-5.4, 0.9, 8.2]);
  V('v_ketchup', [-3.3, 1.45, 2.9], [-4.4, 0.75, 3.9]);
  V('v_batatas', [1.0, 1.45, -0.7], [2.2, 0.85, 0.6]);
  V('v_mascote', [-1.6, 1.6, 4.0], [-2.75, 0.9, 7.35]);
  V('v_camara', [7.6, 1.6, -4.6], [10, 1.2, -9]);
  V('v_janela', [-3.0, 1.6, 5.2], [-3.9, 1.2, 9.6]);
  V('v_monitor', [-4.3, 1.5, -6.4], [-4.3, 1.1, -8.7]);
  V('v_cardapio', [6.0, 1.6, 4.6], [6.6, 2.4, -1.9]);
  V('v_espelho', [-7.9, 1.6, -3.6], [-6.1, 1.4, -5.6]);
  V('v_porta', [-1.0, 1.6, 5.0], [-1.0, 1.2, 9.5]);

  // pontos de NPC (o núcleo põe/anima os clientes)
  const N = (id: string, room: string, x: number, z: number, yaw: number, pose: 'stand' | 'sit' | 'lie' = 'stand', y = 0) => ctx.npcSpots.push({ id, room, pos: { x, y, z }, yaw, pose });
  N('fila1', 'balcao', 5.6, 3.0, Math.PI);
  N('fila2', 'balcao', 7.4, 3.0, Math.PI);
  N('fila3', 'balcao', 5.6, 4.1, Math.PI);
  N('fila4', 'balcao', 6.6, 5.3, Math.PI);
  N('retirada', 'balcao', 9.2, 3.0, Math.PI);
  N('cabine3a', 'salao', 2.35, 8.4, -Math.PI / 2, 'sit', 0.45);
  N('mesa1a', 'salao', -4.95, 0.6, Math.PI / 2, 'sit', 0.45);
  N('mesa4b', 'salao', 2.75, 4.0, -Math.PI / 2, 'sit', 0.45);
  N('mesa5a', 'salao', 1.65, 0.6, Math.PI / 2, 'sit', 0.45);
  N('kids1', 'kids', -9.6, 4.6, 0.6);
  N('kids2', 'kids', -8.4, 1.0, -2.5);
  N('porta', 'salao', -1, 7.6, Math.PI);
  N('drive_carro', 'estac', 13.6, -0.3, Math.PI, 'sit', 0.6);
  N('calcada', 'estac', 4, 10.6, 0);

  const b = ctx.finish('fastfood', { pos: { x: 7, y: 0, z: 0.4 }, yaw: Math.PI }, {
    atmosphere: { background: '#0b1026', fog: { color: '#141a34', near: 18, far: 70 } },
  });
  return b;
}

const map: MapDef = { id: 'fastfood', name: 'Lanchonete', icon: '🍔', build };
export default map;
