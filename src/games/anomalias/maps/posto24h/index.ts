/* ============================================================
 *  ANOMALIAS — mapa "Posto 24h" (id 'posto24h').
 *  Posto de beira de estrada inventado ("Bloop Gás") de madrugada:
 *  pátio com 4 bombas sob a cobertura, placa de preços, loja de
 *  conveniência (gôndolas, geladeiras, café, caixa eletrônico),
 *  escritório com monitores, depósito, banheiro do lado de fora,
 *  lava-jato, orelhão, estrada e mato escuro com neblina.
 *
 *  Planta (m; x → leste, z → sul):
 *    z −38..−24  estrada (leste–oeste)
 *    z −21..0    pátio de concreto; cobertura x −9..9, z −17,5..−4,5
 *    z 2..16     loja x −10..4 · escritório x 4..10 (z 2..7) · depósito x 4..10 (z 7..16)
 *    banheiro externo x 12..16, z 4..9 · lava-jato x −24..−14, z −10..4
 * ============================================================ */
import type { MapBuild, MapDef } from '../types';
import { MapCtx, type Tier } from '../kit2/ctx';
import { stdMats } from '../kit2/props';
import { asphaltTex, carpetTex, concreteTex, fontsReady, tileTex } from '../kit2/tex';
import { buildShell } from './shell';
import { buildOutside } from './outside';
import { buildStore } from './store';
import { buildTasks } from './tasks';
import { buildAnomalies } from './anomalies';
import { BLOOP_PALS } from '../kit2/chars';
import { chooseHandler } from '../kit2/tasks';
import type { ItemDef, Vec3 } from '../types';

async function build(opts: { tier: Tier }): Promise<MapBuild> {
  await fontsReady();
  const ctx = new MapCtx(opts.tier);
  stdMats(ctx);
  ctx.defMat('vinyl', { map: tileTex('#eceae4', '#c4c0b8', 2, 2, 256, 0.04, 7), uv: 1 / 1.2 });
  ctx.defMat('btile', { map: tileTex('#f2f4f2', '#a8b0ac', 4, 4, 256, 0.05, 8), uv: 1 / 0.6 });
  ctx.defMat('carpet', { map: carpetTex(), uv: 1 / 1.5 });
  ctx.defMat('concrete', { map: concreteTex(256, 2), uv: 1 / 4 });
  ctx.defMat('asphalt2', { map: asphaltTex(), uv: 1 / 4 });

  const IN = 1.7;
  ctx.room('loja', 'Loja', [-10, 0, 2], [4, 3.5, 16], '#3a4048', IN).icon = '🛒';
  ctx.room('escritorio', 'Escritório', [4, 0, 2], [10, 3.5, 7], '#2a2838', IN).icon = '🖥️';
  ctx.room('deposito', 'Depósito', [4, 0, 7], [10, 3.5, 16], '#2a2a34', IN).icon = '📦';
  ctx.room('banheiro', 'Banheiro', [12, 0, 4], [16, 3.1, 9], '#2e3640', IN).icon = '🚻';
  ctx.room('lavajato', 'Lava-Jato', [-24, 0, -10], [-14, 4.3, 4], '#1c2444', 0.6, true).icon = '🧽';
  ctx.room('estrada', 'Estrada', [-90, 0, -40], [90, 12, -24], '#1c2444', 0.5, true).icon = '🛣️';
  ctx.room('patio', 'Pátio', [-40, 0, -24], [40, 12, 40], '#1c2444', 0.55, true).icon = '⛽';

  // visibilidade (o que se vê de cada sala)
  ctx.see('loja', ['patio', 'estrada', 'lavajato', 'escritorio', 'deposito']);
  ctx.see('escritorio', ['loja', 'patio', 'estrada']);
  ctx.see('deposito', ['loja']);
  ctx.see('banheiro', ['patio']);
  ctx.see('lavajato', ['patio', 'estrada', 'loja']);
  ctx.see('patio', ['loja', 'estrada', 'lavajato', 'escritorio', 'banheiro']);
  ctx.see('estrada', ['patio', 'loja', 'lavajato']);

  buildShell(ctx);
  buildOutside(ctx);
  buildStore(ctx);
  buildTasks(ctx);
  buildAnomalies(ctx);

  const C = (r: string, p: [number, number, number], l: [number, number, number]) => ctx.cam(r, p, l);
  C('patio', [8.6, 4.7, -4.9], [-3, 0.3, -14]);
  C('patio', [-8.6, 4.7, -17.2], [4, 0.3, -7]);
  C('patio', [9.6, 3.1, 1.4], [-6, 0.3, 0.5]);
  C('estrada', [-14.6, 7.6, -21.2], [10, 0, -31]);
  C('loja', [3.7, 3.1, 15.7], [-6, 0.8, 4]);
  C('loja', [-9.7, 3.1, 2.3], [0, 0.8, 12]);
  C('loja', [3.7, 3.1, 2.3], [-5, 0.8, 9]);
  C('escritorio', [4.3, 3.1, 2.3], [8, 0.6, 6.5]);
  C('deposito', [4.3, 3.1, 7.3], [9, 0.6, 14]);
  C('banheiro', [12.3, 2.8, 4.3], [15.5, 0.8, 8]);
  C('lavajato', [-14.4, 3.9, 3.6], [-21, 0.4, -6]);

  const V = (id: string, p: [number, number, number], l: [number, number, number]) => (ctx.root.userData.views[id] = { pos: { x: p[0], y: p[1], z: p[2] }, look: { x: l[0], y: l[1], z: l[2] } });
  ctx.root.userData.views = {};
  V('loja', [2.2, 1.6, 4.0], [-7, 1.0, 12]);
  V('loja2', [-8.6, 1.6, 14.4], [1, 1.1, 4]);
  V('loja3', [-5.5, 1.6, 5.4], [-5.5, 1.2, 15]);
  V('escritorio', [4.6, 1.6, 2.6], [8, 1.0, 6.5]);
  V('deposito', [4.8, 1.6, 7.8], [8.8, 0.9, 14]);
  V('banheiro', [12.7, 1.6, 8.5], [15.9, 1.1, 5]);
  V('lavajato', [-17, 1.6, -9.0], [-20, 1.0, 1]);
  V('patio', [-1.5, 1.6, -1.2], [1, 1.6, -14]);
  V('patio2', [12, 1.6, -20], [-6, 2.0, -6]);
  V('estrada', [-30, 1.6, -30], [0, 2.5, -12]);
  V('v_preco', [-10.5, 1.6, -14.5], [-15, 5.0, -21.5]);
  V('v_bomba', [6.8, 1.6, -6.4], [3.9, 1.0, -9.0]);
  V('v_prat', [-5.3, 1.6, 5.6], [-6.3, 0.9, 7.8]);
  V('v_boneco', [1.5, 1.6, -16.5], [8.5, 2.0, -21.5]);
  V('v_balcao', [-0.4, 1.6, 10.2], [2.0, 1.1, 3.6]);
  V('v_espelho', [13.2, 1.6, 7.6], [15.9, 1.4, 5.1]);
  V('v_geladeira', [-4.0, 1.6, 13.3], [-6.5, 1.1, 15.8]);

  // yaw no padrão do núcleo (personagem olha −Z com yaw 0): +π sobre a nossa convenção (+Z)
  let ni = 2;
  const N = (id: string, room: string, x: number, z: number, yaw: number, pose: 'stand' | 'sit' | 'lie' = 'stand', y = 0) =>
    ctx.npcSpots.push({ id, room, pos: { x, y, z }, yaw: yaw + Math.PI, pose, color: BLOOP_PALS[ni++ % BLOOP_PALS.length].light, hat: ['', 'cap', 'beanie', '', 'bow'][ni % 5] });
  N('fila1', 'loja', -0.2, 5.0, -Math.PI / 2);
  N('fila2', 'loja', -1.2, 5.6, -Math.PI / 2);
  N('corredor1', 'loja', -5.5, 9.0, 0);
  N('geladeira', 'loja', -3.5, 14.2, Math.PI);
  N('cafe', 'loja', -8.6, 9.5, Math.PI / 2);
  N('bomba_a', 'patio', 1.2, -14.8, 0);
  N('calcada', 'patio', -8.5, 0.7, Math.PI);
  N('orelhao', 'patio', 11.0, 1.0, Math.PI);

  const nodes: Vec3[] = (
    [
      [2.4, 5.0], [2.4, 8.2], [-0.3, 8.2], [-0.3, 5.0], [-2.9, 5.0], [-5.5, 5.0], [-7.8, 5.4], [-8.3, 13.9], [-5.5, 14.1], [-2.9, 13.9],
      [-0.3, 13.9], [2.4, 13.9], [5.5, 13.5], [7.5, 11.5], [3.3, 5.6], [5.2, 5.6], [6.5, 4.0], [-2.0, 3.2], [-2.0, 0.6], [-1.3, -3.0],
      [-1.3, -11.0], [-1.3, -19.0], [-8.5, -11.0], [6.5, -13.0], [8.0, -1.5], [11.0, 4.0], [11.0, 6.5], [14.0, 7.0], [-19.0, -12.0], [-19.0, -5.0],
      [-19.0, 2.0], [-1.3, -27.0], [-20.0, -27.0], [15.0, -27.0], [-2.9, 9.5], [-5.5, 9.5], [-8.3, 9.5],
    ] as [number, number][]
  ).map(([x, z]) => ({ x, y: 0, z }));
  const links: [number, number][] = [
    [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 36], [36, 7], [7, 8], [8, 9], [9, 10], [10, 11], [11, 1], [11, 12], [12, 13], [0, 14],
    [14, 15], [15, 16], [4, 17], [17, 18], [18, 19], [19, 20], [20, 21], [20, 22], [20, 23], [19, 24], [24, 25], [25, 26], [26, 27], [22, 28],
    [28, 29], [29, 30], [21, 31], [31, 32], [31, 33], [32, 28], [4, 34], [34, 9], [5, 35], [35, 8], [2, 10],
  ];
  const ITEMS: ItemDef[] = [
    { id: 'gasolina', color: '#2ac85a', shape: 'drop' },
    { id: 'etanol', color: '#ffd23a', shape: 'drop' },
    { id: 'diesel', color: '#3a3a44', shape: 'drop' },
    { id: 'agua', color: '#3aa0ff', shape: 'circle' },
    { id: 'salgadinho', color: '#e8423a', shape: 'triangle' },
    { id: 'doce', color: '#ff8ac0', shape: 'star' },
    { id: 'pao', color: '#e8b060', shape: 'circle' },
    { id: 'cafe', color: '#6a3a1a', shape: 'heart' },
  ];
  return ctx.finish('posto24h', { pos: { x: 2.3, y: 0, z: 5.0 }, yaw: Math.PI / 2 }, {
    atmosphere: { background: '#0a0f24', fog: { color: '#121a30', near: 22, far: 85 } },
    env: { fog: '#121a30', fogNear: 20, fogFar: 70, sky: '#8a96c8', ground: '#2f3a3a', ambient: 0.3, outdoor: true },
    items: ITEMS,
    taskHandlers: {
      pump: chooseHandler(['gasolina', 'etanol', 'diesel'], '⛽', 3, 5),
      register: chooseHandler(['agua', 'salgadinho', 'doce', 'pao', 'cafe'], '💵', 3, 9),
    },
    nav: { nodes, links },
    creatureSpawns: [{ x: -19, y: 0, z: -5 }, { x: 7.5, y: 0, z: 11.5 }, { x: 15, y: 0, z: -27 }, { x: -8.3, y: 0, z: 13.9 }],
  });
}

const map: MapDef = { id: 'posto24h', name: 'Posto 24h', icon: '⛽', build };
export default map;
