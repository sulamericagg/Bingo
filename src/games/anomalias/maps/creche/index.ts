/* ============================================================
 *  ANOMALIAS — mapa "Creche" (berçário à noite com bebês Bloop).
 *
 *  Planta (metros, y = 0 no chão, pé-direito 2.8; −z = fundo):
 *
 *   z=-12 ┌──────────────┬───────────────┐ · · · · · ·
 *         │  Berçário    │ Brinquedoteca ├─vidro  Pátio (grama, balanço,
 *         │  (6 berços)  │ (piscina de   │       caixa de areia, cerca)
 *   z=-4  ├───porta──────┴─────arco──────┤
 *         │          Corredor            ├─porta de emergência → pátio
 *   z=-1.6├────arco──┬porta──┬vão───┬porta┤ · · · · · · z=-1.6 (cerca)
 *         │ Recepção │Monitor│Refeit│Troca│
 *   z=5.5 └──porta───┴───────┴──────┴─────┘
 *        x=0        5      8.5   12.5   16      22
 *
 *  Nada de lógica de jogo aqui (ver ../types.ts). Os bebês do cenário
 *  (berços, cadeirão, trocador, tatame) são do mapa — o núcleo só lê
 *  os slots/tarefas; npcSpots são lugares livres para bebês extras.
 * ============================================================ */
import * as THREE from 'three';
import { tileTex, woodTex } from '../../../../3d/common/pbr';
import { natureTexture, natureTree, natureMat, natureBush } from '../../../../3d/nature';
import type { MapBuild, MapDef } from '../types';
import { BABY_COLS, babyBloop, creature, type Baby } from '../nightkit/bloops';
import { all, animate, flicker, hide, moveBy, poseAt, rotBy, scaleBy, show, swap, texSwap, tint, type H } from '../nightkit/fx';
import { MapKit, splane, quad, type G, type Tier } from '../nightkit/kit';
import { bookshelf, ceilingDisc, curtain, door, frame, pendant, plant, rug, shade, stdMats, tableLamp, wallClock, windowPane } from '../nightkit/props';
import { cv, drawingTex, evaMat, rugTex, screenTex, signTex, texOf, wainscot, wallpaper } from '../nightkit/tex';
import { wall, type Side } from '../nightkit/walls';
import { ballGeo, blockGeo, bottle, crib, diaperStack, duck, highChair, kidChair, kidTable, mobile, musicBox, rockingHorse, slide, stroller, teddy, toyChest } from './furniture';

const H = 2.8;
const TAU = Math.PI * 2;

function checker(a: string, b: string): THREE.CanvasTexture {
  const S = 256;
  const [c, x] = cv(S);
  for (let j = 0; j < 2; j++)
    for (let i = 0; i < 2; i++) {
      x.fillStyle = (i + j) % 2 ? a : b;
      x.fillRect(i * 128, j * 128, 128, 128);
    }
  x.fillStyle = 'rgba(0,0,0,0.08)';
  x.fillRect(0, 127, S, 2);
  x.fillRect(127, 0, 2, S);
  x.fillRect(0, 0, S, 1);
  x.fillRect(0, 0, 1, S);
  const d = x.getImageData(0, 0, S, S);
  for (let i = 0; i < d.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 8;
    d.data[i] += n;
    d.data[i + 1] += n;
    d.data[i + 2] += n;
  }
  x.putImageData(d, 0, 0);
  return texOf(c);
}
/** faixa de letras (friso ABC) */
function abcFrieze(): THREE.CanvasTexture {
  const W = 1024;
  const Hh = 64;
  const [c, x] = cv(W, Hh);
  x.fillStyle = '#fff6e8';
  x.fillRect(0, 0, W, Hh);
  const L = 'ABCDEFGHIJKLMNOP';
  const cols = ['#ff6b8a', '#ffb43a', '#ffd93a', '#5ad07a', '#4ab0ff', '#9a7aff'];
  for (let i = 0; i < L.length; i++) {
    x.fillStyle = cols[i % cols.length];
    x.beginPath();
    x.roundRect(i * 64 + 6, 6, 52, 52, 10);
    x.fill();
    x.fillStyle = '#fff';
    x.font = 'bold 40px Fredoka, Arial, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(L[i], i * 64 + 32, 34);
  }
  const t = texOf(c);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

async function build({ tier }: { tier: Tier }): Promise<MapBuild> {
  const k = new MapKit('creche', tier);
  stdMats(k);
  const fw = woodTex(256, 4);
  k.def('floorWood', { map: fw.map, normal: fw.normal, uv: 0.75 });
  k.def('carpet', { map: wallpaper('plain', '#d8d8d8', '#fff', '#fff'), uv: 2 });
  k.def('checker', { map: checker('#fff4e0', '#ffc9b8'), uv: 1 });
  const tl = tileTex(256, 8, 8, 0.035);
  k.def('tileS', { map: tl.map, normal: tl.normal, uv: 0.5 });
  k.def('tileW', { map: tileTex(256, 4, 8, 0.03).map, uv: 0.6 });
  k.def('eva', { map: evaMat(), uv: 0.85 });
  k.def('wains', { map: wainscot(), uv: 1.2 });
  k.def('wpNap', { map: wallpaper('stars', '#cfc4f2', '#fff6c8', '#ffffff'), uv: 1.5 });
  k.def('wpPlay', { map: wallpaper('clouds', '#bfe6ff', '#ffffff', '#e8f6ff'), uv: 1.2 });
  k.def('wpFeed', { map: wallpaper('stripes', '#fff1d6', '#ffd0a8', '#ffe2c2'), uv: 1.3 });
  k.def('wpRecep', { map: wallpaper('balloons', '#ffe8ef', '#ff9ec4', '#9ad7ff'), uv: 1.2 });
  k.def('wpHall', { map: wallpaper('dots', '#e6f5e6', '#b8e0b8', '#ffd9a8'), uv: 1.6 });
  k.def('wpStaff', { map: wallpaper('plaid', '#dfe6ee', '#9ab0c8', '#c88a8a'), uv: 1.4 });
  k.def('ext', { map: wallpaper('plain', '#f2d9c4', '#fff', '#fff'), uv: 1 });
  const gt = natureTexture('grass');
  k.def('grass', { map: gt, uv: 0.35 });
  k.def('ball', { vc: false });
  k.def('paint2', { vc: false });
  const frieze = k.tmat(abcFrieze());

  // pontos de vista de 1ª pessoa para o visualizador
  const views: Record<string, [number, number, number, number?][]> = {};
  const view = (room: string, x: number, z: number, yaw: number, pitch = -0.1) => (views[room] ??= []).push([x, z, yaw, pitch]);

  /* ===================== SALAS ===================== */
  const C = 2.55; // altura das câmeras de segurança
  k.room('recepcao', 'Recepção', 0, -1.6, 5, 5.5, H, [
    [0.3, C, 5.2, 3.2, 0.6, 0.5],
    [4.7, C, -1.3, 1.5, 0.6, 4.0],
  ]);
  k.room('monitores', 'Sala dos Monitores', 5, -1.6, 8.5, 5.5, H, [[5.3, C, -1.3, 7.5, 0.6, 4.2]]);
  k.room('refeitorio', 'Refeitório', 8.5, -1.6, 12.5, 5.5, H, [
    [8.8, C, -1.3, 11.5, 0.6, 4.0],
    [12.2, C, 5.2, 9.6, 0.6, 1.0],
  ]);
  k.room('trocador', 'Trocador', 12.5, -1.6, 16, 5.5, H, [[12.8, C, -1.3, 15.2, 0.6, 3.5]]);
  k.room('corredor', 'Corredor', 0, -4, 16, -1.6, H, [
    [0.3, C, -2.8, 12, 0.8, -2.8],
    [15.7, C, -3.7, 4, 0.8, -2.8],
  ]);
  k.room('bercario', 'Berçário', 0, -12, 8, -4, H, [
    [7.7, C, -4.3, 2.5, 0.5, -10.5],
    [0.3, C, -11.7, 6.0, 0.5, -6.0],
  ]);
  k.room('brinquedoteca', 'Brinquedoteca', 8, -12, 16, -4, H, [
    [8.3, C, -4.3, 13.5, 0.4, -10.5],
    [15.7, C, -11.7, 10.5, 0.4, -6.0],
    [15.7, C, -4.3, 10, 0.4, -9.5],
  ]);
  k.room('patio', 'Pátio', 16, -12, 22, -1.6, 4, [
    [21.7, 2.6, -1.9, 18.5, 0.4, -9],
    [16.4, 2.6, -11.7, 20, 0.4, -4],
  ]);

  /* ===================== CHÃO E TETO ===================== */
  const floor = (zone: string, key: string, x0: number, z0: number, x1: number, z1: number, col: string) => {
    splane(k.g(zone, key), x0, z0, x1, z1, 0, col);
    splane(k.g(zone, 'ceil'), x0, z0, x1, z1, H, '#fbf6ee', false);
  };
  floor('recepcao', 'floorWood', 0, -1.6, 5, 5.5, '#e8b884');
  floor('monitores', 'carpet', 5, -1.6, 8.5, 5.5, '#8a9ab8');
  floor('refeitorio', 'checker', 8.5, -1.6, 12.5, 5.5, '#ffffff');
  floor('trocador', 'tileS', 12.5, -1.6, 16, 5.5, '#d8f2ec');
  floor('corredor', 'floorWood', 0, -4, 16, -1.6, '#f0c898');
  floor('bercario', 'carpet', 0, -12, 8, -4, '#d8c8ef');
  floor('brinquedoteca', 'eva', 8, -12, 16, -4, '#ffffff');
  // pátio: grama + calçada junto da parede + chão escuro além da cerca
  splane(k.g('patio', 'grass'), 16.9, -12, 22, -1.6, 0, '#5a8a4a', true, 1);
  splane(k.g('patio', 'paint'), 16, -12, 16.9, -1.6, 0.0, '#b8b0a8', true, 1);
  splane(k.g('patio', 'grass'), 12, -26, 36, -12, -0.01, '#3a5a34', true, 3);
  splane(k.g('patio', 'grass'), 22, -12, 36, 8, -0.01, '#3a5a34', true, 3);
  splane(k.g('patio', 'grass'), 16, -1.6, 22, 8, -0.01, '#3a5a34', true, 3);

  /* ===================== PAREDES ===================== */
  const S = (zone: string, paper: string, low?: string, lowCol = '#ffffff', trim = '#ffffff', paperCol = '#ffffff'): Side => ({ zone, paper, paperCol, low, lowCol, lowH: low ? 1.0 : 0, trim, crown: true });
  const sRecep = S('recepcao', 'wpRecep', 'wains', '#ffd1df');
  const sStaff = S('monitores', 'wpStaff', 'wains', '#c7d3e3', '#f4f4f4');
  const sFeed = S('refeitorio', 'wpFeed', 'tileW', '#ffffff');
  const sBath = S('trocador', 'tileW', undefined, '#ffffff', '#ffffff', '#d2f3ff');
  const sHall = S('corredor', 'wpHall', 'wains', '#bfe6c6');
  const sNap = S('bercario', 'wpNap', 'wains', '#e6dcff');
  const sPlay = S('brinquedoteca', 'wpPlay', 'wains', '#ffe8a8');
  const sExt: Side = { zone: 'patio', paper: 'ext', paperCol: '#f4dcc8', low: 'paint', lowCol: '#c8a890', lowH: 0.5, trim: '#ffffff' };

  // externas
  wall(k, { axis: 'x', at: -12, from: 0, to: 8, h: H, pos: sNap, holes: [{ at: 6.4, w: 1.2, h: 1.1, sill: 1.05 }] });
  wall(k, { axis: 'x', at: -12, from: 8, to: 16, h: H, pos: sPlay });
  wall(k, { axis: 'z', at: 0, from: -12, to: -4, h: H, pos: sNap, holes: [{ at: 4, w: 1.4, h: 1.2, sill: 1.0 }] });
  wall(k, { axis: 'z', at: 0, from: -4, to: -1.6, h: H, pos: sHall, holes: [{ at: 1.2, w: 0.9, h: 1.2, sill: 1.0 }] });
  wall(k, { axis: 'z', at: 0, from: -1.6, to: 5.5, h: H, pos: sRecep, holes: [{ at: 3.3, w: 1.2, h: 1.2, sill: 1.0 }] });
  wall(k, { axis: 'x', at: 5.5, from: 0, to: 5, h: H, neg: sRecep, holes: [{ at: 2.5, w: 1.0, h: 2.15 }, { at: 1.0, w: 0.9, h: 1.2, sill: 1.0 }, { at: 4.0, w: 0.9, h: 1.2, sill: 1.0 }] });
  wall(k, { axis: 'x', at: 5.5, from: 5, to: 8.5, h: H, neg: sStaff, holes: [{ at: 1.2, w: 1.0, h: 1.1, sill: 1.1 }] });
  wall(k, { axis: 'x', at: 5.5, from: 8.5, to: 12.5, h: H, neg: sFeed, holes: [{ at: 2.0, w: 1.2, h: 1.1, sill: 1.05 }] });
  wall(k, { axis: 'x', at: 5.5, from: 12.5, to: 16, h: H, neg: sBath });
  wall(k, { axis: 'z', at: 16, from: -1.6, to: 5.5, h: H, neg: sBath, pos: sExt, holes: [{ at: 5.6, w: 0.8, h: 0.8, sill: 1.4 }] });
  // fachada para o pátio (vidraça + porta de vidro + porta de emergência)
  wall(k, { axis: 'z', at: 16, from: -12, to: -4, h: H, neg: sPlay, pos: sExt, holes: [{ at: 2.5, w: 2.6, h: 1.8, sill: 0.45 }, { at: 6.0, w: 1.0, h: 2.15 }] });
  wall(k, { axis: 'z', at: 16, from: -4, to: -1.6, h: H, neg: sHall, pos: sExt, holes: [{ at: 1.2, w: 1.0, h: 2.15 }] });
  // internas
  wall(k, { axis: 'x', at: -4, from: 0, to: 8, h: H, neg: sNap, pos: sHall, holes: [{ at: 4.6, w: 1.0, h: 2.15 }, { at: 1.8, w: 1.4, h: 1.0, sill: 1.0 }] });
  wall(k, { axis: 'x', at: -4, from: 8, to: 16, h: H, neg: sPlay, pos: sHall, holes: [{ at: 4.0, w: 1.8, h: 2.3 }] });
  wall(k, { axis: 'z', at: 8, from: -12, to: -4, h: H, neg: sNap, pos: sPlay });
  wall(k, { axis: 'x', at: -1.6, from: 0, to: 5, h: H, neg: sHall, pos: sRecep, holes: [{ at: 2.5, w: 1.8, h: 2.3 }] });
  wall(k, { axis: 'x', at: -1.6, from: 5, to: 8.5, h: H, neg: sHall, pos: sStaff, holes: [{ at: 1.75, w: 0.95, h: 2.15 }] });
  wall(k, { axis: 'x', at: -1.6, from: 8.5, to: 12.5, h: H, neg: sHall, pos: sFeed, holes: [{ at: 2.0, w: 1.3, h: 2.3 }] });
  wall(k, { axis: 'x', at: -1.6, from: 12.5, to: 16, h: H, neg: sHall, pos: sBath, holes: [{ at: 1.75, w: 0.95, h: 2.15 }] });
  wall(k, { axis: 'z', at: 5, from: -1.6, to: 5.5, h: H, neg: sRecep, pos: sStaff });
  wall(k, { axis: 'z', at: 8.5, from: -1.6, to: 5.5, h: H, neg: sStaff, pos: sFeed });
  wall(k, { axis: 'z', at: 12.5, from: -1.6, to: 5.5, h: H, neg: sFeed, pos: sBath });
  // beiral sobre a fachada do pátio
  {
    const z = k.zone('patio');
    z('paint').box(0.7, 0.12, 17.6, 16.33, H, -3.25, '#f4f0ea');
    z('paint').box(0.08, 0.14, 17.6, 16.66, H - 0.04, -3.25, '#d86a6a');
  }

  // janelas (vidro + caixilho + céu lá fora)
  windowPane(k, 'bercario', 6.4, 1.05, -12, 0, 1.2, 1.1, '#ffffff', 1.4);
  windowPane(k, 'bercario', 0, 1.0, -8, Math.PI / 2, 1.4, 1.2, '#ffffff', 1.4);
  windowPane(k, 'corredor', 0, 1.0, -2.8, Math.PI / 2, 0.9, 1.2, '#ffffff', 1.4);
  windowPane(k, 'recepcao', 0, 1.0, 1.7, Math.PI / 2, 1.2, 1.2, '#ffffff', 1.4);
  windowPane(k, 'recepcao', 1.0, 1.0, 5.5, Math.PI, 0.9, 1.2, '#ffffff', 1.4);
  windowPane(k, 'recepcao', 4.0, 1.0, 5.5, Math.PI, 0.9, 1.2, '#ffffff', 1.4);
  windowPane(k, 'monitores', 6.2, 1.1, 5.5, Math.PI, 1.0, 1.1, '#ffffff', 1.4);
  windowPane(k, 'refeitorio', 10.5, 1.05, 5.5, Math.PI, 1.2, 1.1, '#ffffff', 1.4);
  windowPane(k, 'trocador', 16, 1.4, 4.0, -Math.PI / 2, 0.8, 0.8, '#ffffff', 1.4);
  windowPane(k, 'corredor', 1.8, 1.0, -4, 0, 1.4, 1.0, '#ffffff', 0, false); // visor do berçário
  windowPane(k, 'brinquedoteca', 16, 0.45, -9.5, -Math.PI / 2, 2.6, 1.8, '#ffffff', 0);

  /* ===================== LUZ ===================== */
  const warm = '#ffe2b8';
  // principais (apagam com setPower)
  k.light('recepcao', 2.5, 2.6, 0.8, warm, 1.25, 6.5);
  k.light('recepcao', 2.5, 2.6, 3.8, warm, 1.1, 6);
  k.light('monitores', 6.75, 2.6, 1.0, '#e8f0ff', 0.9, 5.5);
  k.light('monitores', 6.75, 2.6, 4.0, '#e8f0ff', 0.7, 5);
  k.light('refeitorio', 10.5, 2.6, 0.6, warm, 1.0, 6);
  k.light('refeitorio', 10.5, 2.6, 3.8, warm, 1.0, 6);
  k.light('trocador', 14.25, 2.6, 1.9, '#f0fff8', 1.1, 6);
  for (const x of [2.5, 8, 13.5]) k.light('corredor', x, 2.6, -2.8, warm, 0.8, 5);
  k.light('bercario', 4, 2.2, -8, '#ffd8b0', 0.95, 7.5);
  k.light('brinquedoteca', 10.5, 2.2, -8, warm, 0.95, 6.5);
  k.light('brinquedoteca', 13.8, 2.2, -8, warm, 0.95, 6.5);
  // noturnas (sempre)
  k.light('bercario', 6.2, 0.9, -4.5, '#ffb070', 0.9, 3.2, 'night', false); // abajur da cômoda
  k.light('bercario', 4, 2.7, -8, '#8a9aff', 0.35, 6, 'night', false); // projetor de estrelas
  k.light('bercario', 1.2, 0.25, -4.3, '#ffcf7a', 0.5, 1.8, 'night', false); // luz de tomada
  k.light('corredor', 15.6, 2.4, -2.8, '#5aff8a', 0.35, 3, 'night', false); // placa SAÍDA
  for (const x of [3.5, 10.5]) k.light('corredor', x, 0.25, -3.85, '#ffcf7a', 0.45, 2, 'night', false);
  k.light('monitores', 6.9, 1.25, 5.0, '#7adfff', 0.7, 3.2, 'night', false); // telas
  k.light('recepcao', 4.1, 1.35, 1.6, '#ffc890', 0.6, 2.6, 'night', false); // abajur do balcão
  k.light('trocador', 15.6, 0.3, -1.3, '#ffcf7a', 0.4, 1.8, 'night', false);
  k.light('refeitorio', 12.2, 1.5, 4.8, '#ffffff', 0.25, 2.2, 'night', false); // geladeira (led)
  k.light('brinquedoteca', 12.6, 1.3, -11.5, '#ff9ad8', 0.4, 3, 'night', false); // teatrinho
  const outBox = new THREE.Box3(new THREE.Vector3(16.0, -1, -40), new THREE.Vector3(60, 30, 30));
  k.baker.add(21, 2.6, -2.6, '#ffd9a0', 1.3, 7, 'night', outBox, true); // poste do pátio
  k.baker.add(0.5, 0.7, -0.6, '#8a9aff', 0.45, 0, 'night', outBox, false); // lua (direcional)
  k.baker.ambient.set('#1c2140');
  k.baker.ambientMain.set('#2a2328');

  /* ===================== RECEPÇÃO ===================== */
  {
    const z = k.zone('recepcao');
    ceilingDisc(z, 2.5, H, 0.8);
    ceilingDisc(z, 2.5, H, 3.8);
    k.halo(2.5, H - 0.1, 0.8, 0.9, '#ffe8c8');
    k.halo(2.5, H - 0.1, 3.8, 0.9, '#ffe8c8');
    // balcão em L arredondado (frente listrada)
    const b = z('paint');
    b.box(0.6, 1.0, 2.4, 4.3, 0, 1.6, '#ffffff');
    for (let i = 0; i < 6; i++) b.box(0.02, 0.9, 0.36, 3.99, 0.05, 0.6 + i * 0.4, ['#ff9ec4', '#ffd27a', '#9ad7ff'][i % 3]);
    b.box(0.8, 0.05, 2.6, 4.25, 1.0, 1.6, '#f8f4ee');
    b.box(0.5, 0.75, 0.6, 4.6, 0, 3.2, '#ffffff');
    z('wood').box(0.75, 0.04, 2.6, 4.25, 1.05, 1.6, '#c89060');
    // computador, campainha, prancheta, porta-lápis
    const m = z('metal');
    m.box(0.36, 0.25, 0.03, 4.55, 1.2, 1.2, '#2a2a34', -Math.PI / 2 + 0.25);
    m.box(0.06, 0.12, 0.06, 4.6, 1.09, 1.2, '#3a3a44');
    m.box(0.2, 0.015, 0.14, 4.6, 1.09, 1.2, '#3a3a44');
    z('glow').box(0.32, 0.21, 0.004, 4.53, 1.22, 1.2, '#9ad8ff', -Math.PI / 2 + 0.25);
    m.lathe([[0.06, 0], [0.055, 0.03], [0.03, 0.06], [0.0, 0.07]], 4.05, 1.09, 2.3, '#e8c860', 14);
    b.box(0.22, 0.012, 0.3, 4.2, 1.09, 1.9, '#c8a070', 0.2);
    b.box(0.19, 0.005, 0.26, 4.2, 1.1, 1.9, '#ffffff', 0.2);
    b.cyl(0.04, 0.035, 0.1, 4.45, 1.09, 2.6, '#ff9ec4', 10);
    for (let i = 0; i < 4; i++) b.cyl(0.005, 0.005, 0.16, 4.44 + (i % 2) * 0.02, 1.1, 2.59 + i * 0.008, ['#ff4a4a', '#4a8aff', '#ffd23a', '#4ad07a'][i], 4);
    tableLamp(z, 4.1, 1.09, 1.0, '#ffffff', '#ffd6e6', 0.9);
    k.halo(4.1, 1.38, 1.0, 0.5, '#ffd0a0', false);
    // cadeira atrás do balcão
    b.cyl(0.22, 0.22, 0.06, 4.75, 0.45, 2.3, '#4a6a9a', 16);
    b.cyl(0.03, 0.03, 0.42, 4.75, 0.03, 2.3, '#3a3a44', 6);
    b.box(0.06, 0.5, 0.4, 4.95, 0.5, 2.3, '#4a6a9a');
    k.solid(4.0, 0.35, 4.9, 2.95, 1.1);
    k.solid(4.3, 2.9, 4.95, 3.55, 0.8);
    // banco de espera sob a janela
    const w = z('wood');
    w.box(1.3, 0.06, 0.42, 1.0, 0.42, 5.05, '#e0a870');
    for (const sx of [-1, 1]) w.box(0.06, 0.42, 0.38, 1.0 + sx * 0.55, 0, 5.05, '#d09060');
    for (let i = 0; i < 3; i++) z('fabric').box(0.38, 0.12, 0.36, 0.6 + i * 0.4, 0.48, 5.05, ['#ffb3c8', '#b3e0ff', '#fff0a0'][i]);
    k.solid(0.3, 4.8, 1.7, 5.3, 0.5);
    k.shadow(1.0, 5.05, 0.75, 0.3);
    // escaninhos (mochilas) na parede oeste
    bookshelf(z, 0.25, -0.15, Math.PI / 2, 2.3, 1.2, 0.4, '#f0d0a0', 3, false);
    k.solid(0.05, -1.32, 0.48, 1.02, 1.2);
    k.shadow(0.25, -0.15, 0.3, 1.2);
    // cabideiros com casaquinhos acima
    for (let i = 0; i < 5; i++) {
      const zz = -1.1 + i * 0.5;
      z('metal').cyl(0.012, 0.012, 0.1, 0.08, 1.62, zz, '#e8c860', 6, 0, -Math.PI / 2);
      z('metal').sph(0.02, 0.17, 1.62, zz, '#e8c860', 1, 1, 1, 6);
    }
    // tapete
    rug(k, rugTex('rings', '#ffd6e6', '#fff3c4', '#cdeafe'), 2.3, 2.3, 2.0, 2.0, true);
    plant(z, 0.4, 3.0, '#ff8a6a', 1.1);
    k.shadow(0.4, 3.0, 0.25, 0.25);
    k.solidC(0.4, 3.0, 0.45, 0.45, 0, 0.6);
    // placa de boas-vindas acima do arco
    k.mesh(quad(1.6, 0.36), k.tmat(signTex('Creche Bloopinhos', '#ff9ec4', '#ffffff', 512, 115, '#ffffff'), { basic: false }), 2.5, 2.52, -1.52, 0);
    view('recepcao', 2.4, 4.9, 0.25);
    view('recepcao', 0.8, -0.9, Math.PI + 0.7);
  }

  /* ===================== SALA DOS MONITORES ===================== */
  {
    const z = k.zone('monitores');
    ceilingDisc(z, 6.75, H, 1.0, 0.22);
    ceilingDisc(z, 6.75, H, 4.0, 0.22);
    k.halo(6.75, H - 0.1, 1.0, 0.8, '#eef4ff');
    // mesa de monitoramento
    const w = z('wood');
    w.box(2.6, 0.05, 0.75, 6.9, 0.74, 5.0, '#b88a5a');
    for (const sx of [-1, 1]) z('paint').box(0.05, 0.74, 0.7, 6.9 + sx * 1.25, 0, 5.0, '#5a5a66');
    z('paint').box(0.6, 0.6, 0.65, 7.7, 0.04, 5.0, '#d8d8de');
    k.solid(5.55, 4.6, 8.25, 5.45, 0.8);
    k.shadow(6.9, 5.0, 1.4, 0.45);
    // teclado, caneca, papéis
    z('paint').box(0.42, 0.02, 0.14, 6.9, 0.79, 4.75, '#2a2a30');
    z('paint').box(0.3, 0.004, 0.22, 6.0, 0.79, 4.85, '#ffffff', 0.3);
    // cadeira de escritório
    // (peça solta — slot)
    // armário/escaninhos (lockers) na parede leste
    for (let i = 0; i < 3; i++) {
      const zz = -0.6 + i * 0.5;
      const lc = ['#7aa0d8', '#e88a9a', '#8ad0a8'][i];
      if (i === 1) {
        // armário do meio é oco (abre na anomalia)
        z('metal').box(0.03, 1.85, 0.46, 8.41, 0, zz, '#5a5a66');
        for (const s of [-1, 1]) z('metal').box(0.45, 1.85, 0.02, 8.2, 0, zz + s * 0.23, lc);
        z('metal').box(0.45, 0.03, 0.46, 8.2, 1.82, zz, lc);
        z('metal').box(0.45, 0.04, 0.46, 8.2, 0, zz, lc);
        z('metal').box(0.4, 0.02, 0.42, 8.22, 1.4, zz, '#9a9aa6');
        continue;
      }
      z('metal').box(0.45, 1.85, 0.48, 8.2, 0, zz, lc);
      for (let j = 0; j < 3; j++) z('paint').box(0.01, 0.015, 0.25, 7.97, 1.5 + j * 0.05, zz, '#2a2a30');
      z('metal').box(0.02, 0.12, 0.03, 7.965, 1.0, zz + 0.16, '#d8d8e0');
    }
    k.solid(7.95, -0.85, 8.45, 0.65, 1.9);
    k.shadow(8.2, -0.1, 0.3, 0.8);
    // sofazinho na parede oeste
    const f = z('fabric');
    f.box(0.8, 0.42, 1.7, 5.5, 0, 2.6, '#7a8ac8');
    f.box(0.25, 0.75, 1.7, 5.2, 0.0, 2.6, '#6a7ab8');
    for (const s of [-1, 1]) f.box(0.8, 0.6, 0.18, 5.5, 0, 2.6 + s * 0.85, '#6a7ab8');
    f.box(0.6, 0.14, 0.75, 5.55, 0.42, 2.2, '#8a9ad8');
    f.box(0.6, 0.14, 0.75, 5.55, 0.42, 3.0, '#8a9ad8');
    f.box(0.12, 0.3, 0.3, 5.36, 0.55, 2.9, '#ffd27a', 0, 0, -0.3);
    k.solid(5.07, 1.65, 5.9, 3.55, 0.7);
    k.shadow(5.5, 2.6, 0.45, 0.95);
    // bancada de café (parede norte)
    z('wood').box(1.3, 0.9, 0.5, 7.7, 0, -1.25, '#e8dccc');
    z('wood').box(1.34, 0.04, 0.54, 7.7, 0.9, -1.25, '#a8784a');
    z('metal').box(0.25, 0.32, 0.25, 7.4, 0.94, -1.25, '#2a2a30');
    z('metal').cyl(0.06, 0.07, 0.12, 7.4, 0.94, -1.12, '#a0c8d8', 10);
    z('glow').box(0.03, 0.03, 0.005, 7.48, 1.15, -1.12, '#ff3a3a');
    z('metal').box(0.45, 0.28, 0.33, 8.05, 0.94, -1.25, '#e8e8ec');
    z('paint').box(0.3, 0.2, 0.004, 7.98, 0.98, -1.08, '#20262a');
    k.solid(7.05, -1.53, 8.43, -0.98, 1.0);
    // mural de cortiça com fotos
    k.mesh(quad(1.3, 0.8), k.tmat(signTex('', '#c8955a', '#000', 256, 160)), 5.08, 1.6, 0.6, Math.PI / 2);
    view('monitores', 6.0, -0.9, Math.PI + 0.35);
    view('monitores', 7.8, 2.0, 1.2);
  }

  /* ===================== REFEITÓRIO ===================== */
  {
    const z = k.zone('refeitorio');
    pendant(z, 10.5, H, 0.6, '#ffb36a', 0.55, 0.28);
    pendant(z, 10.5, H, 3.8, '#ffb36a', 0.55, 0.28);
    k.halo(10.5, H - 0.75, 0.6, 0.8, '#ffd8a0');
    k.halo(10.5, H - 0.75, 3.8, 0.8, '#ffd8a0');
    kidTable(z, 10.0, 1.0, '#ffffff', ['#ff9ec4', '#9ad7ff', '#ffd27a', '#9be5b0']);
    k.solidC(10.0, 1.0, 1.3, 1.3, 0, 0.5);
    k.shadow(10.0, 1.0, 0.75, 0.75);
    // cadeirões (o do meio tem bebê)
    highChair(z, 9.3, 3.8, Math.PI, '#ff9ec4', '#ffe0ec');
    highChair(z, 11.5, 3.8, Math.PI, '#9ad7ff', '#e0f2ff');
    for (const x of [9.3, 11.5]) {
      k.solidC(x, 3.8, 0.6, 0.6, 0, 0.9);
      k.shadow(x, 3.8, 0.35, 0.35);
    }
    // bancada com pia, aquecedor de mamadeira e micro-ondas (parede leste)
    const w = z('wood');
    w.box(0.6, 0.88, 2.4, 12.2, 0, 1.7, '#fff3e0');
    for (let i = 0; i < 4; i++) z('paint').box(0.01, 0.82, 0.56, 11.895, 0.03, 0.8 + i * 0.6, '#ffd8b0');
    for (let i = 0; i < 4; i++) z('metal').box(0.02, 0.02, 0.14, 11.88, 0.72, 0.8 + i * 0.6, '#c0c0c8');
    z('trim').box(0.64, 0.04, 2.44, 12.2, 0.88, 1.7, '#f4f0ea');
    z('metal').box(0.4, 0.06, 0.45, 12.2, 0.86, 0.9, '#c8ccd4');
    z('metal').tube([[12.42, 0.92, 0.9], [12.42, 1.15, 0.9], [12.25, 1.2, 0.9]], 0.018, '#d8dce4', 8, 6);
    z('metal').box(0.45, 0.3, 0.35, 12.2, 0.92, 2.6, '#f0f0f4');
    z('paint').box(0.004, 0.2, 0.25, 12.0, 0.97, 2.55, '#20262a');
    k.solid(11.9, 0.5, 12.5, 2.9, 1.0);
    k.shadow(12.2, 1.7, 0.35, 1.2);
    // geladeira
    // geladeira: parte de baixo maciça, compartimento de cima oco (a porta abre na anomalia)
    z('metal').box(0.7, 0.62, 0.65, 12.15, 0, 4.9, '#f4f6fa');
    z('metal').box(0.04, 1.1, 0.65, 12.48, 0.62, 4.9, '#f4f6fa');
    for (const s of [-1, 1]) z('metal').box(0.66, 1.1, 0.03, 12.17, 0.62, 4.9 + s * 0.31, '#f4f6fa');
    z('metal').box(0.7, 0.05, 0.65, 12.15, 1.7, 4.9, '#f4f6fa');
    z('metal').box(0.66, 0.04, 0.6, 12.17, 0.62, 4.9, '#e8eef4');
    z('metal').box(0.02, 0.3, 0.04, 11.79, 0.25, 4.65, '#c8ccd4');
    z('glow').box(0.01, 1.0, 0.56, 12.455, 0.66, 4.9, '#dff0ff');
    for (const y of [0.98, 1.32]) z('glass').box(0.6, 0.012, 0.56, 12.15, y, 4.9, '#ffffff');
    z('paint').cyl(0.045, 0.045, 0.22, 12.25, 0.99, 4.75, '#ff7a3a', 10);
    z('paint').box(0.18, 0.12, 0.14, 12.2, 1.33, 5.0, '#ffffff');
    z('paint').cyl(0.06, 0.06, 0.08, 12.2, 0.99, 5.05, '#ffe03a', 12);
    k.solid(11.8, 4.55, 12.5, 5.45, 1.8);
    // prateleira de mamadeiras (parede leste, acima da bancada)
    z('wood').box(0.22, 0.03, 1.4, 12.38, 1.55, 1.4, '#e0b080');
    // ganchos com babadores (parede oeste)
    for (let i = 0; i < 4; i++) {
      const zz = 2.4 + i * 0.4;
      z('metal').sph(0.02, 8.6, 1.4, zz, '#e8c860', 1, 1, 1, 6);
      z('fabric').box(0.02, 0.26, 0.22, 8.6, 1.15, zz, ['#ffb3c8', '#b3e0ff', '#fff0a0', '#c8f0c8'][i], 0, 0, 0.05);
    }
    view('refeitorio', 10.5, -1.0, Math.PI);
    view('refeitorio', 9.0, 4.9, 0.4);
  }

  /* ===================== TROCADOR ===================== */
  {
    const z = k.zone('trocador');
    ceilingDisc(z, 14.25, H, 1.9, 0.3);
    k.halo(14.25, H - 0.1, 1.9, 0.9, '#f0fff8');
    // trocador (cômoda) na parede leste
    const w = z('wood');
    w.box(0.65, 0.9, 1.3, 15.6, 0, 1.3, '#ffffff');
    for (let i = 0; i < 3; i++) {
      z('paint').box(0.01, 0.26, 1.2, 15.27, 0.06 + i * 0.28, 1.3, ['#c8f0e0', '#ffe0ec', '#e0e8ff'][i]);
      z('metal').sph(0.025, 15.26, 0.19 + i * 0.28, 1.3, '#e8c860', 1, 1, 1, 6);
    }
    z('fabric').box(0.6, 0.1, 1.15, 15.6, 0.9, 1.3, '#bfe8ff');
    z('fabric').box(0.6, 0.18, 0.06, 15.6, 0.9, 0.72, '#9ad7ff');
    z('fabric').box(0.6, 0.18, 0.06, 15.6, 0.9, 1.88, '#9ad7ff');
    k.solid(15.25, 0.62, 15.95, 1.98, 1.0);
    k.shadow(15.6, 1.3, 0.35, 0.7);
    // prateleira acima (fraldas, lenços, potes)
    z('wood').box(0.28, 0.03, 1.3, 15.8, 1.6, 1.3, '#e0b080');
    z('paint').box(0.18, 0.12, 0.25, 15.8, 1.63, 0.85, '#7ad0ff');
    z('paint').cyl(0.05, 0.05, 0.16, 15.8, 1.63, 1.75, '#ffffff', 12);
    z('paint').cyl(0.05, 0.05, 0.12, 15.8, 1.63, 1.9, '#ffb3c8', 12);
    // pia baixinha + espelho (parede sul)
    z('paint').box(0.9, 0.62, 0.45, 13.3, 0, 5.2, '#ffffff');
    z('paint').lathe([[0.0, 0], [0.18, 0], [0.24, 0.1], [0.26, 0.12]], 13.3, 0.62, 5.15, '#ffffff', 18);
    z('metal').tube([[13.3, 0.7, 5.42], [13.3, 0.85, 5.42], [13.3, 0.86, 5.3]], 0.015, '#c8ccd4', 6, 6);
    k.solid(12.85, 4.95, 13.75, 5.45, 0.8);
    // vasinhos baixos (2)
    for (const x of [14.4, 15.2]) {
      z('paint').lathe([[0.0, 0], [0.13, 0], [0.16, 0.22], [0.18, 0.3]], x, 0, 5.1, '#ffffff', 16);
      z('paint').box(0.34, 0.3, 0.12, x, 0.02, 5.38, '#ffffff');
      z('paint').torus(0.15, 0.03, x, 0.31, 5.08, ['#ff9ec4', '#9ad7ff'][x > 15 ? 1 : 0], Math.PI / 2, 16);
      k.solidC(x, 5.15, 0.4, 0.55, 0, 0.4);
    }
    // banheirinha (oeste)
    z('paint').lathe([[0.0, 0.08], [0.4, 0.08], [0.48, 0.5], [0.5, 0.55]], 13.0, 0, 2.6, '#bfe8ff', 24);
    z('paint').torus(0.49, 0.03, 13.0, 0.56, 2.6, '#ffffff', Math.PI / 2, 24);
    z('paint').cyl(0.43, 0.43, 0.01, 13.0, 0.4, 2.6, '#9ad7ff', 24);
    for (let i = 0; i < 3; i++) z('metal').cyl(0.03, 0.03, 0.1, 13.0 + Math.cos(i * 2.1) * 0.3, 0, 2.6 + Math.sin(i * 2.1) * 0.3, '#c8ccd4', 6);
    k.solidC(13.0, 2.6, 1.0, 1.0, 0, 0.6);
    k.shadow(13.0, 2.6, 0.55, 0.55);
    // toalhas no gancho (parede oeste)
    for (let i = 0; i < 3; i++) z('fabric').box(0.03, 0.5, 0.32, 12.6, 0.95, 0.4 + i * 0.4, ['#ffd27a', '#c8a8ff', '#9be5b0'][i]);
    // cesto de roupa
    z('paint').cyl(0.2, 0.17, 0.45, 12.85, 0, -1.1, '#e8d8b8', 14);
    view('trocador', 12.9, -1.0, Math.PI + 0.75);
  }

  /* ===================== CORREDOR ===================== */
  {
    const z = k.zone('corredor');
    for (const x of [2.5, 8, 13.5]) {
      ceilingDisc(z, x, H, -2.8, 0.22);
      k.halo(x, H - 0.1, -2.8, 0.75, '#ffe8c8');
    }
    // placa SAÍDA sobre a porta de emergência
    k.mesh(quad(0.5, 0.2), k.tmat(signTex('SAÍDA', '#1aa04a', '#ffffff', 256, 100), { basic: true }), 15.92, 2.4, -2.8, -Math.PI / 2);
    z('paint').box(0.06, 0.22, 0.52, 15.95, 2.29, -2.8, '#e8e8e8');
    k.halo(15.85, 2.4, -2.8, 0.7, '#5aff8a', false, k.root, 0.4);
    // extintor
    z('metal').cyl(0.075, 0.075, 0.45, 15.88 - 0.1, 0.35, -1.85, '#e03a3a', 12);
    z('metal').cyl(0.03, 0.03, 0.08, 15.78, 0.8, -1.85, '#2a2a30', 8);
    z('paint').box(0.02, 0.3, 0.2, 15.92, 1.3, -1.85, '#e03a3a');
    // banco + ganchos de casacos (parede sul, entre portas)
    z('wood').box(1.4, 0.05, 0.36, 4.85, 0.38, -1.88, '#e0a870');
    for (const s of [-1, 1]) z('wood').box(0.05, 0.38, 0.34, 4.85 + s * 0.6, 0, -1.88, '#d09060');
    k.solid(4.15, -2.06, 5.55, -1.65, 0.45);
    k.shadow(4.85, -1.88, 0.75, 0.22);
    // tomadas de luz noturna (tarefa)
    // luminárias de rodapé (fixas)
    for (const x of [3.5, 10.5]) {
      z('paint').box(0.12, 0.08, 0.02, x, 0.2, -3.92, '#ffffff');
      z('glow').box(0.09, 0.03, 0.006, x, 0.215, -3.91, '#ffd890');
      k.pool(x, 0.01, -3.7, 0.9, 0.6, '#ffc870', 0.28);
    }
    view('corredor', 0.6, -2.8, -Math.PI / 2);
    view('corredor', 15.2, -2.6, Math.PI / 2);
  }

  /* ===================== BERÇÁRIO ===================== */
  const babies: Baby[] = [];
  {
    const z = k.zone('bercario');
    pendant(z, 4, H, -8, '#ffd8f0', 0.5, 0.32);
    k.halo(4, H - 0.65, -8, 0.9, '#ffe0c8');
    // estrelinhas do projetor no teto (fixas, brilho noturno)
    {
      const st = z('glow');
      let s = 7;
      const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 46; i++) {
        const x = 0.4 + r() * 7.2;
        const zz = -11.6 + r() * 7.2;
        if (Math.hypot(x - 4, zz + 8) < 0.45) continue;
        st.sph(0.015 + r() * 0.02, x, H - 0.005, zz, r() < 0.5 ? '#b8c4ff' : '#fff2b0', 1, 0.2, 1, 5);
      }
    }
    // berços: fileira norte (4: o 4º fica vazio) + 2 na parede leste
    const cribCols = ['#ffffff', '#f6eefc', '#ffffff', '#eef6ff', '#ffffff', '#fff6ee'];
    const sheets = ['#ffd6e6', '#d6ecff', '#e0f8e0', '#efe0ff', '#fff3c4', '#ffe0d0'];
    const cribPos: [number, number, number][] = [
      [1.5, -11.2, 0],
      [3.2, -11.2, 0],
      [4.9, -11.2, 0],
      [7.2, -10.0, -Math.PI / 2],
      [7.2, -8.3, -Math.PI / 2],
      [7.2, -6.6, -Math.PI / 2],
    ];
    cribPos.forEach(([x, zz, ry], i) => {
      crib(z, x, zz, ry, cribCols[i], sheets[i]);
      k.solidC(x, zz, 0.78, 1.36, ry, 1.0);
      k.shadow(x, zz, ry ? 0.75 : 0.45, ry ? 0.45 : 0.75, 0.004);
    });
    // cômoda + abajur + caixinha de música (parede sul, à direita da porta)
    const w = z('wood');
    w.box(1.2, 0.85, 0.5, 6.5, 0, -4.35, '#fff3e0');
    for (let i = 0; i < 3; i++) {
      z('paint').box(1.1, 0.24, 0.01, 6.5, 0.06 + i * 0.26, -4.6, ['#ffd6e6', '#d6ecff', '#e0f8e0'][i]);
      z('metal').sph(0.025, 6.5, 0.18 + i * 0.26, -4.61, '#e8c860', 1, 1, 0.6, 6);
    }
    z('trim').box(1.24, 0.03, 0.54, 6.5, 0.85, -4.35, '#ffffff');
    tableLamp(z, 6.95, 0.88, -4.3, '#ffd27a', '#fff0d6', 1.0);
    k.halo(6.95, 1.2, -4.3, 0.7, '#ffb070', false, k.root, 0.6);
    k.solid(5.88, -4.62, 7.12, -4.07, 0.9);
    k.shadow(6.5, -4.35, 0.65, 0.3);
    // prateleira de pelúcias (parede oeste, acima)
    z('wood').box(0.25, 0.03, 1.6, 0.14, 1.55, -10.3, '#f0d0a0');
    for (const s of [-1, 1]) z('wood').box(0.2, 0.15, 0.03, 0.12, 1.4, -10.3 + s * 0.7, '#f0d0a0');
    k.part((g) => teddy(g, '#c89a6a', 0.7), 0.18, 1.58, -10.8, Math.PI / 2);
    k.part((g) => teddy(g, '#e8a8c8', 0.7), 0.18, 1.58, -9.8, Math.PI / 2);
    // luz de tomada perto da porta (fixa)
    z('paint').box(0.02, 0.1, 0.08, 0.075, 0.22, -4.4, '#ffffff');
    // poltrona de amamentação (peça: slot)
    // tapete redondo
    rug(k, rugTex('stars', '#b8c8f8', '#fff6c8', '#ffffff'), 3.4, -7.8, 2.6, 2.6, true);
    // cortinas na janela oeste e norte
    curtain(z, -8.85, -8.55, 0.11, 2.35, 0.9, '#ffd6e6', true);
    curtain(z, -7.45, -7.15, 0.11, 2.35, 0.9, '#ffd6e6', true);
    curtain(z, 5.65, 5.95, -11.89, 2.3, 0.95, '#d6ecff');
    curtain(z, 6.85, 7.15, -11.89, 2.3, 0.95, '#d6ecff');
    // bebês nos berços 1,2,3,5,6
    const order = [0, 1, 2, 4, 5];
    order.forEach((ci, n) => {
      const [x, zz, ry] = cribPos[ci];
      const b = babyBloop(k, BABY_COLS[n], 'lie', 'sleep');
      // deitado: a cabeça vai para −z local → cabeceira (parede)
      if (ry) b.g.position.set(x + 0.15, 0.41, zz);
      else b.g.position.set(x, 0.41, zz - 0.15);
      b.g.rotation.y = ry ? -Math.PI / 2 : 0;
      babies.push(b);
    });
    view('bercario', 3.2, -4.6, 0.15);
    view('bercario', 1.0, -6.0, 0.0);
  }

  /* ===================== BRINQUEDOTECA ===================== */
  {
    const z = k.zone('brinquedoteca');
    pendant(z, 10.5, H, -8, '#7ad0ff', 0.6, 0.3);
    pendant(z, 13.8, H, -8, '#ffd27a', 0.6, 0.3);
    k.halo(10.5, H - 0.8, -8, 0.8, '#ffe8c8');
    k.halo(13.8, H - 0.8, -8, 0.8, '#ffe8c8');
    // friso ABC no alto das paredes
    for (const [x, zz, ry, len] of [
      [12, -11.92, 0, 7.8],
      [8.08, -8, Math.PI / 2, 7.8],
      [15.92, -8, -Math.PI / 2, 7.8],
    ] as [number, number, number, number][]) {
      const g = new THREE.PlaneGeometry(len, 0.22);
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (len / 3.6));
      k.mesh(g, frieze, x, 2.38, zz, ry);
    }
    // piscina de bolinhas (borda acolchoada)
    const bx = 10.0;
    const bz = -10.4;
    z('fabric').lathe([[0.95, 0], [1.0, 0.04], [1.0, 0.48], [0.94, 0.52], [0.86, 0.48], [0.86, 0.1]], bx, 0, bz, '#ff9ec4', 32);
    z('fabric').torus(0.93, 0.05, bx, 0.5, bz, '#ffffff', Math.PI / 2, 32);
    z('paint').cyl(0.87, 0.87, 0.02, bx, 0.02, bz, '#ffe0ec', 28);
    k.solidC(bx, bz, 2.0, 2.0, 0, 0.55);
    k.shadow(bx, bz, 1.1, 1.1);
    // escorregador
    slide(z, 14.2, -10.9, '#ffb43a', '#4ab0ff');
    k.solid(13.15, -11.25, 15.55, -10.55, 1.3);
    k.shadow(14.3, -10.9, 1.3, 0.35);
    // estante baixa (parede oeste)
    bookshelf(z, 8.3, -6.6, -Math.PI / 2 + Math.PI, 1.6, 0.9, 0.35, '#ffffff', 2);
    k.solid(8.07, -7.45, 8.5, -5.75, 0.9);
    // teatro de fantoches (parede norte)
    {
      const tx = 12.2;
      const tz = -11.55;
      z('wood').box(1.3, 1.0, 0.35, tx, 0, tz, '#ff7a6a');
      z('wood').box(0.2, 1.7, 0.35, tx - 0.55, 0, tz, '#ff7a6a');
      z('wood').box(0.2, 1.7, 0.35, tx + 0.55, 0, tz, '#ff7a6a');
      z('wood').box(1.3, 0.3, 0.35, tx, 1.65, tz, '#ff7a6a');
      z('wood').lathe([[0.0, 0], [0.7, 0], [0.62, 0.15], [0.0, 0.25]], tx, 1.95, tz, '#ffd27a', 4, 0, 0, Math.PI / 4);
      z('fabric').box(0.45, 0.62, 0.04, tx - 0.25, 1.02, tz + 0.12, '#c83a5a', 0, 0, 0.12);
      z('fabric').box(0.45, 0.62, 0.04, tx + 0.25, 1.02, tz + 0.12, '#c83a5a', 0, 0, -0.12);
      z('paint').box(0.9, 0.62, 0.02, tx, 1.02, tz - 0.12, '#2a1a3a');
      for (let i = 0; i < 4; i++) z('glow').sph(0.025, tx - 0.45 + i * 0.3, 1.88, tz + 0.18, ['#ff5a8a', '#ffd23a', '#5ad0ff', '#7aff8a'][i], 1, 1, 1, 6);
      k.solid(tx - 0.68, tz - 0.2, tx + 0.68, tz + 0.2, 1.7);
      k.shadow(tx, tz, 0.7, 0.2);
    }
    // trilho do trenzinho (oval no chão)
    {
      const cx = 12.4;
      const cz = -6.9;
      const pts: [number, number, number][] = [];
      for (let i = 0; i <= 40; i++) {
        const a = (i / 40) * TAU;
        pts.push([cx + Math.cos(a) * 0.9, 0.012, cz + Math.sin(a) * 0.5]);
      }
      z('wood').tube(pts.map(([x, y, zz]) => [x + (x - cx) * 0.06, y, zz + (zz - cz) * 0.1] as [number, number, number]), 0.012, '#c8955a', 80, 4, true);
      z('wood').tube(pts.map(([x, y, zz]) => [x - (x - cx) * 0.06, y, zz - (zz - cz) * 0.1] as [number, number, number]), 0.012, '#c8955a', 80, 4, true);
    }
    // almofadões no canto (puffs)
    z('fabric').sph(0.35, 15.4, 0.2, -4.6, '#9be5b0', 1, 0.6, 1, 16);
    z('fabric').sph(0.3, 14.8, 0.17, -4.5, '#c9a8ff', 1, 0.6, 1, 16);
    k.shadow(15.1, -4.55, 0.7, 0.35);
    // relógio na parede sul (peça: slot)
    view('brinquedoteca', 12.0, -4.3, 0.05);
    view('brinquedoteca', 15.3, -11.3, Math.PI / 2 + 0.6 + Math.PI / 4);
  }

  /* ===================== PÁTIO ===================== */
  {
    const z = k.zone('patio');
    // cerca de madeira (x=22 e z=-12 e z=-1.6)
    const picket = (x0: number, z0: number, x1: number, z1: number) => {
      const L = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.floor(L / 0.16);
      const ry = Math.atan2(-(z1 - z0), x1 - x0);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = x0 + (x1 - x0) * t;
        const zz = z0 + (z1 - z0) * t;
        z('wood').box(0.09, 1.0, 0.025, x, 0, zz, '#f4ece0', ry);
        z('wood').lathe([[0.045, 0], [0.0, 0.07]], x, 1.0, zz, '#f4ece0', 4, 0, 0, ry + Math.PI / 4);
      }
      const mx = (x0 + x1) / 2;
      const mz = (z0 + z1) / 2;
      for (const y of [0.25, 0.75]) z('wood').box(L, 0.07, 0.03, mx, y, mz - (Math.abs(ry) < 0.1 ? 0.025 : 0), '#e8dccc', ry);
      k.solid(Math.min(x0, x1) - 0.05, Math.min(z0, z1) - 0.05, Math.max(x0, x1) + 0.05, Math.max(z0, z1) + 0.05, 1.1);
    };
    picket(16.1, -12, 22, -12);
    picket(22, -12, 22, -1.6);
    picket(16.1, -1.6, 22, -1.6);
    // caixa de areia
    z('wood').box(1.5, 0.25, 0.1, 18.2, 0, -3.0, '#e0a870');
    z('wood').box(1.5, 0.25, 0.1, 18.2, 0, -4.4, '#e0a870');
    z('wood').box(0.1, 0.25, 1.5, 17.5, 0, -3.7, '#e0a870');
    z('wood').box(0.1, 0.25, 1.5, 18.9, 0, -3.7, '#e0a870');
    z('paint').sph(0.68, 18.2, 0.12, -3.7, '#f0d8a0', 1, 0.15, 1, 18);
    k.solid(17.45, -4.45, 18.95, -2.95, 0.3);
    // poste de luz
    z('metal').cyl(0.05, 0.07, 2.6, 21.3, 0, -2.4, '#3a3a44', 10);
    z('metal').tube([[21.3, 2.55, -2.4], [21.2, 2.75, -2.4], [21.0, 2.72, -2.5]], 0.03, '#3a3a44', 8, 6);
    z('glow').sph(0.12, 21.0, 2.6, -2.5, '#ffe8b0', 1, 1, 1, 10);
    z('metal').lathe([[0.18, 0], [0.12, 0.1], [0.03, 0.14]], 21.0, 2.62, -2.5, '#3a3a44', 12);
    k.halo(21.0, 2.55, -2.5, 1.6, '#ffd9a0', false, k.root, 0.5);
    k.solidC(21.3, -2.4, 0.2, 0.2, 0, 2.6);
    // árvores além da cerca
    const treeMat = k.baker.adopt(natureMat({ amp: 0.003, y0: 1, rustle: 0.02, wrap: 0.4 }));
    const tA = natureTree({ kind: 'broad', h: 5.5, trunk: '#6a4a32', leaf: '#2e5a3a', leaf2: '#4a7a4a', seed: 3, lod: tier === 0 ? 1 : 0 });
    const tB = natureTree({ kind: 'pine', h: 6.5, trunk: '#5a3a2a', leaf: '#1e4a34', leaf2: '#2e6a44', seed: 5, lod: tier === 0 ? 1 : 0 });
    const treesA = [[24, -6], [25.5, -11.5], [19, -14.5], [27, -2], [23.5, 1.5]];
    const treesB = [[24.5, -14], [16.5, -15], [28, -8], [22.5, -16.5], [26, 3.5]];
    for (const [arr, geo] of [[treesA, tA], [treesB, tB]] as [number[][], THREE.BufferGeometry][]) {
      const im = new THREE.InstancedMesh(geo, treeMat, arr.length);
      const m4 = new THREE.Matrix4();
      arr.forEach(([x, zz], i) => {
        m4.makeRotationY(i * 1.7).scale(new THREE.Vector3(1, 0.9 + (i % 3) * 0.12, 1)).setPosition(x, 0, zz);
        im.setMatrixAt(i, m4);
      });
      im.computeBoundingSphere();
      k.root.add(im);
    }
    const bush = natureBush(4, tier === 0 ? 1 : 0);
    {
      const bushMat = k.baker.adopt(natureMat({ amp: 0.002, y0: 0.2, rustle: 0.01, wrap: 0.4, tintGray: true }));
      const im = new THREE.InstancedMesh(bush, bushMat, 5);
      const m4 = new THREE.Matrix4();
      const bc = new THREE.Color();
      [[21.4, -11.4], [16.8, -11.3], [21.4, -6.0], [16.9, -9.0], [20.2, -11.5]].forEach(([x, zz], i) => {
        m4.makeScale(0.8, 0.7, 0.8).setPosition(x, 0, zz);
        im.setMatrixAt(i, m4);
        im.setColorAt(i, bc.set(i % 2 ? '#3f7a3a' : '#4f8a44'));
        k.shadow(x, zz, 0.5, 0.5);
      });
      im.computeBoundingSphere();
      k.root.add(im);
    }
    // lua grande no céu
    const moon = k.halo(30, 14, -30, 9, '#dfe6ff', false, k.root, 0.35);
    if (moon) moon.material.fog = false;
    const mm = new THREE.Mesh(new THREE.CircleGeometry(1.4, 24), new THREE.MeshBasicMaterial({ color: '#fff8dc', fog: false, toneMapped: false }));
    mm.position.set(30, 14, -30);
    mm.lookAt(18, 1.6, -6);
    k.root.add(mm);
    view('patio', 16.8, -2.4, -0.75);
    view('patio', 21.4, -11.2, 2.2);
  }

  /* ===================== PEÇAS SOLTAS, ANOMALIAS E TAREFAS ===================== */
  slotsAndTasks(k, babies, view);

  k.pvs = {
    recepcao: ['recepcao', 'corredor', 'bercario', 'brinquedoteca'],
    monitores: ['monitores', 'corredor', 'bercario', 'brinquedoteca'],
    refeitorio: ['refeitorio', 'corredor', 'bercario', 'brinquedoteca'],
    trocador: ['trocador', 'corredor', 'brinquedoteca', 'bercario'],
    corredor: ['corredor', 'recepcao', 'monitores', 'refeitorio', 'trocador', 'bercario', 'brinquedoteca', 'patio'],
    bercario: ['bercario', 'corredor', 'recepcao', 'monitores', 'refeitorio'],
    brinquedoteca: ['brinquedoteca', 'corredor', 'patio', 'recepcao', 'monitores', 'refeitorio', 'trocador'],
    patio: ['patio', 'brinquedoteca', 'corredor'],
  };
  k.near = {
    recepcao: ['recepcao', 'corredor'],
    monitores: ['monitores', 'corredor'],
    refeitorio: ['refeitorio', 'corredor'],
    trocador: ['trocador', 'corredor'],
    corredor: ['corredor', 'recepcao', 'monitores', 'refeitorio', 'trocador', 'bercario', 'brinquedoteca'],
    bercario: ['bercario', 'corredor'],
    brinquedoteca: ['brinquedoteca', 'corredor', 'patio'],
    patio: ['patio', 'brinquedoteca'],
  };
  k.root.userData.views = views;
  return k.finish(
    { pos: { x: 2.5, y: 0, z: 4.6 }, yaw: 0 },
    {
      atmosphere: { background: '#0a0d22', fog: { color: '#0a0d22', near: 14, far: 42 }, exposure: 1.1 },
    } as Partial<MapBuild>,
  );
}

/* ============================================================
 *  Slots de anomalia + tarefas (peças soltas: precisam se mexer)
 * ============================================================ */
function slotsAndTasks(k: MapKit, babies: Baby[], view: (room: string, x: number, z: number, yaw: number, pitch?: number) => void): void {
  void view;
  const cr = (s = 1) => creature(k, s);

  /* ---------- BERÇÁRIO ---------- */
  // bebês dos berços 1..5: rosto, fora do berço, sumiu, girado, grandão, cor
  const babyKinds = (b: Baby, i: number): Record<string, H[]> => {
    const face = (f: 'angry' | 'grin' | 'stare'): H => (on) => b.setFace(on ? f : 'sleep');
    const standCorner: [number, number, number][] = [
      [0.45, -6.4, Math.PI / 2],
      [7.6, -11.6, -Math.PI * 0.75],
      [3.6, -4.5, Math.PI],
      [5.75, -11.55, Math.PI * 0.15],
      [5.5, -6.5, Math.PI / 2],
    ];
    const [sx, sz, sry] = standCorner[i % standCorner.length];
    const outOfCrib: H = (on) => {
      b.setPose(on ? 'stand' : 'lie');
      b.setFace(on ? 'stare' : 'sleep');
      poseH(on);
    };
    const poseH = poseAt(b.g, sx, 0, sz, sry);
    const r: Record<string, H[]> = {
      face: [face('angry'), face('grin'), face('stare')],
      move: [outOfCrib],
    };
    if (i % 2 === 0) r.missing = [hide(b.g)];
    if (i === 1) r.rotate = [rotBy(b.g, 0, Math.PI, 0)];
    if (i === 2) r.scale = [scaleBy(b.g, 1.7)];
    if (i === 3) r.color = [tint(k, b.body, '#7a8a7a'), tint(k, b.g, '#ff5a5a')];
    return r;
  };
  babies.forEach((b, i) => {
    k.slot({ id: 'bebe' + (i + 1), room: 'bercario', object: b.g, kinds: babyKinds(b, i) as never });
  });

  // bebê a mais (berço vazio / atrás da poltrona / na prateleira)
  {
    const b = babyBloop(k, { body: '#d0d0e0', onesie: '#ffffff', accent: '#9a9ab0', eye: '#303040', hat: 'none' }, 'lie', 'sleep');
    b.g.position.set(7.35, 0.41, -10.0);
    b.g.rotation.y = -Math.PI / 2;
    b.g.visible = false;
    const v0: H = (on) => {
      b.g.visible = on;
      b.setPose('lie');
      b.g.position.set(7.35, 0.41, -10.0);
      b.g.rotation.y = -Math.PI / 2;
      b.setFace('sleep');
    };
    const v1: H = (on) => {
      b.g.visible = on;
      b.setPose('stand');
      b.g.position.set(0.55, 0, -5.3);
      b.g.rotation.y = Math.PI * 0.7;
      b.setFace('stare');
    };
    const v2: H = (on) => {
      b.g.visible = on;
      b.setPose('sit');
      b.g.position.set(0.2, 1.57, -10.3);
      b.g.rotation.y = Math.PI / 2;
      b.setFace('awake');
    };
    k.slot({ id: 'bebe_extra', room: 'bercario', object: b.g, kinds: { extra: [v0, v1, v2] } });
  }

  // móbile girando (gira ao contrário na anomalia)
  {
    const m = k.part((g) => mobile(g), 3.2, 2.25, -11.35);
    let dir = 1;
    k.anim((dt) => (m.rotation.y += dt * 0.35 * dir));
    k.slot({
      id: 'mobile',
      room: 'bercario',
      object: m,
      sound: 'musicbox',
      kinds: {
        rotate: [(on) => (dir = on ? -2.6 : 1), rotBy(m, Math.PI, 0, 0)],
        missing: [hide(m)],
        color: [tint(k, m, '#4a3a5a')],
      },
    });
    // haste presa no teto
    k.part((g) => g('paint').cyl(0.01, 0.01, 0.55, 0, 0, 0, '#f0f0f0', 6), 3.2, 2.25, -11.35);
  }

  // caixinha de música na cômoda: tampa aberta + bailarina girando + notas
  {
    const box = k.part((g) => musicBox(g, '#ff9ec4'), 6.2, 0.88, -4.3, 0.3);
    const lid = k.part((g) => g('paint').box(0.23, 0.02, 0.16, 0, 0, 0.08, '#ff7aa8'), 0, 0.1, -0.08, 0, box);
    const dancer = k.part((g) => {
      g('paint').cyl(0.004, 0.004, 0.04, 0, 0, 0, '#e8c860', 4);
      g('paint').sph(0.02, 0, 0.06, 0, '#c9a8ff', 1, 1, 1, 8);
      g('paint').lathe([[0.035, 0], [0.01, 0.03]], 0, 0.03, 0, '#ffd6e6', 10);
    }, 0, 0.1, 0, 0, box);
    dancer.visible = false;
    const notes = k.part((g) => {
      for (let i = 0; i < 3; i++) {
        g('glow').sph(0.018, 0.05 + i * 0.06, 0.15 + i * 0.07, 0, '#ffe08a', 1.2, 1, 0.5, 6);
        g('glow').box(0.006, 0.06, 0.006, 0.065 + i * 0.06, 0.15 + i * 0.07, 0, '#ffe08a');
      }
    }, 0, 0.05, 0, 0, box);
    notes.visible = false;
    const sw = k.part((g) => {
      // caixa-surpresa (troca)
      g('paint').box(0.18, 0.18, 0.18, 0, 0, 0, '#5ac8ff');
      g('paint').tube([[0, 0.18, 0], [0.03, 0.28, 0], [-0.03, 0.36, 0], [0, 0.44, 0]], 0.03, '#d0d0d8', 12, 6);
      g('paint').sph(0.07, 0, 0.5, 0, '#3a1c52', 1, 1, 1, 12);
      g('glow').sph(0.015, -0.025, 0.52, 0.06, '#ffe23a', 1, 1, 1, 6);
      g('glow').sph(0.015, 0.025, 0.52, 0.06, '#ffe23a', 1, 1, 1, 6);
    }, 6.2, 0.88, -4.3, 0.3);
    const play: H = (on) => {
      lid.rotation.x = on ? -1.4 : 0;
      dancer.visible = on;
      notes.visible = on;
    };
    const spin = animate(k, (dt, t) => {
      dancer.rotation.y += dt * 3;
      notes.position.y = 0.05 + (t % 1) * 0.08;
    });
    k.slot({ id: 'caixinha', room: 'bercario', object: box, sound: 'musicbox', kinds: { sound: [all(play, spin)], move: [moveBy(box, -0.5, 0, -0.05, 1.2)], swap: [swap(box, sw)] } });
  }

  // poltrona de balanço (balança sozinha / virada para a parede / criatura sentada)
  {
    const ch = k.part((g) => {
      const w = g('wood');
      for (const s of [-1, 1]) {
        const pts: [number, number, number][] = [];
        for (let i = 0; i <= 8; i++) {
          const t = (i / 8 - 0.5) * 1.1;
          pts.push([s * 0.32, 0.55 - Math.cos(t) * 0.55, Math.sin(t) * 0.55]);
        }
        w.tube(pts, 0.022, '#c8955a', 12, 6);
        w.box(0.05, 0.42, 0.05, s * 0.3, 0.02, 0.2, '#c8955a');
        w.box(0.05, 0.9, 0.05, s * 0.3, 0.02, -0.22, '#c8955a', 0, -0.15);
        w.box(0.07, 0.05, 0.5, s * 0.32, 0.62, 0.0, '#c8955a');
      }
      g('fabric').box(0.6, 0.14, 0.5, 0, 0.42, 0, '#e8b8d8');
      g('fabric').box(0.6, 0.6, 0.12, 0, 0.55, -0.24, '#e8b8d8', 0, -0.15);
      g('fabric').box(0.36, 0.3, 0.1, 0, 0.62, -0.14, '#fff3c4', 0, -0.2);
    }, 1.1, 0, -5.0, Math.PI * 0.8);
    k.solidC(1.1, -5.0, 0.75, 0.75, 0, 0.9);
    k.shadow(1.1, -5.0, 0.42, 0.42);
    const c = cr(0.62);
    c.g.position.set(1.1, 0.36, -5.0);
    c.g.rotation.y = Math.PI * 0.8;
    c.g.visible = false;
    k.slot({
      id: 'poltrona',
      room: 'bercario',
      object: ch,
      sound: 'creak',
      kinds: {
        move: [animate(k, (_dt, t) => (ch.rotation.x = Math.sin(t * 2.2) * 0.14), () => (ch.rotation.x = 0))],
        rotate: [rotBy(ch, 0, Math.PI, 0)],
        creature: [show(c.g)],
      },
    });
  }

  // abajur da cômoda (luz anômala)
  {
    const shadeM = k.part((g) => g('glow').sph(0.06, 0, 0, 0, '#ffffff', 1.5, 1.2, 1.5, 10), 6.95, 1.17, -4.3);
    shadeM.visible = false;
    const red = k.pool(6.6, 0.01, -5.2, 2.2, 1.8, '#ff2a2a', 0.5);
    red.visible = false;
    const wallRed = k.pool(6.6, 1.4, -4.12, 2.4, 2.0, '#ff2a2a', 0.35, k.root, false, [Math.PI / 2, 0, 0]);
    wallRed.visible = false;
    const green = k.pool(6.6, 0.01, -5.2, 2.2, 1.8, '#3aff6a', 0.45);
    green.visible = false;
    const halo = k.halo(6.95, 1.2, -4.3, 0.7, '#ff3a3a', false, k.root, 0.8)!;
    halo.visible = false;
    k.slot({
      id: 'abajur',
      room: 'bercario',
      object: shadeM,
      kinds: {
        light: [
          all(show(red), show(wallRed), show(halo)),
          all(show(green)),
          flicker(k, [red], 1.4),
        ],
      },
    });
  }

  // quadro grande (lua e nuvens) → muda
  {
    const f = frame(k, drawingTex('rocket'), 1.1, 0.82, 7.92, 1.75, -8.3, -Math.PI / 2, '#ffffff');
    k.slot({ id: 'quadro_lua', room: 'bercario', object: f.g, kinds: { picture: [texSwap(f.mat, drawingTex('eyes')), texSwap(f.mat, drawingTex('creature'))], rotate: [rotBy(f.g, 0, 0, Math.PI)] } });
  }

  // urso grande de pelúcia no chão (canto)
  {
    const t = k.part((g) => teddy(g, '#d8a878', 1.6), 0.55, 0, -11.45, Math.PI * 0.25);
    k.shadow(0.55, -11.45, 0.3, 0.3);
    const eyes = k.part((g) => {
      for (const sx of [-1, 1]) g('glow').sph(0.03, sx * 0.08, 0.74, 0.2, '#ff2a2a', 1, 1, 0.6, 8);
      g('paint').sph(0.07, 0, 0.6, 0.2, '#5a0a24', 1.3, 0.6, 0.5, 10);
      for (const sx of [-1, 1]) g('paint').lathe([[0.012, 0], [0, 0.04]], sx * 0.04, 0.63, 0.23, '#ffffff', 6, Math.PI, 0);
    }, 0, 0, 0, 0, t);
    eyes.visible = false;
    k.slot({ id: 'urso_berc', room: 'bercario', object: t, kinds: { face: [show(eyes)], move: [moveBy(t, 3.0, 0, 6.4, 0.8)], scale: [scaleBy(t, 2.1)], rotate: [rotBy(t, 0, Math.PI, 0)] } });
  }

  // porta do berçário
  {
    const d = door(k, 4.1, -4, 0, 0.98, 2.13, '#ffffff', { kid: '#ffb3c8' });
    d.set(-1.3);
    k.slot({ id: 'porta_berc', room: 'corredor', object: d.leaf, kinds: { door: [(on) => d.set(on ? 0 : -1.3), (on) => d.set(on ? -0.35 : -1.3)] } });
  }

  // criatura espiando pela janela do berçário (lado de fora)
  {
    const c = cr(0.9);
    c.g.position.set(-0.7, 0.35, -8.0);
    c.g.rotation.y = Math.PI / 2;
    const c2 = cr(0.9);
    c2.g.position.set(6.4, 0.45, -12.7);
    k.slot({ id: 'janela_berc', room: 'bercario', object: c.g, kinds: { creature: [show(c.g), show(c2.g)] } });
  }

  /* ---------- BRINQUEDOTECA ---------- */
  // piscina de bolinhas (bolinhas instanciadas)
  {
    const balls: { x: number; y: number; z: number; col: string }[] = [];
    const cols = ['#ff5a7a', '#ffd23a', '#4ab0ff', '#5ad07a', '#ff9a3a', '#b07aff'];
    let s = 3;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const n = k.tier === 0 ? 70 : k.tier === 1 ? 120 : 170;
    for (let i = 0; i < n; i++) {
      const a = r() * TAU;
      const rr = Math.sqrt(r()) * 0.78;
      balls.push({ x: 10.0 + Math.cos(a) * rr, y: 0.08 + (i / n) * 0.3 + r() * 0.04, z: -10.4 + Math.sin(a) * rr, col: cols[i % cols.length] });
    }
    const grp = new THREE.Group();
    k.root.add(grp);
    const im = k.inst(ballGeo(), 'ball', balls.map((b) => ({ x: b.x, y: b.y, z: b.z, col: b.col })), grp);
    const red = k.inst(ballGeo(), 'ball', balls.map((b) => ({ x: b.x, y: b.y, z: b.z, col: '#c81a2a' })), grp);
    red.visible = false;
    const c = cr(0.7);
    c.g.position.set(10.0, -0.2, -10.4);
    c.g.rotation.y = 0.6;
    k.slot({ id: 'piscina', room: 'brinquedoteca', object: grp, kinds: { color: [swap(im, red)], creature: [show(c.g)], missing: [hide(im)] } });
  }

  // torre de blocos (some / mais alta / de cabeça para baixo)
  {
    const blk = blockGeo();
    const cols = ['#ff5a7a', '#ffd23a', '#4ab0ff', '#5ad07a', '#ff9a3a'];
    const tower = new THREE.Group();
    tower.position.set(11.6, 0, -8.8);
    k.root.add(tower);
    const mk = (n: number, start = 0) => k.inst(blk, 'paint2', Array.from({ length: n }, (_, i) => ({ x: (i % 2) * 0.01, y: 0.06 + (i + start) * 0.122, z: 0, ry: i * 0.4, col: cols[(i + start) % 5] })), tower);
    mk(5);
    const extra = mk(4, 5);
    const loose = k.inst(blk, 'paint2', [
      { x: 0.4, y: 0.06, z: 0.3, ry: 0.3, col: '#ffd23a' },
      { x: -0.3, y: 0.06, z: 0.45, ry: 1.1, col: '#4ab0ff' },
      { x: 0.55, y: 0.06, z: -0.2, ry: 0.7, col: '#ff5a7a' },
    ], tower);
    void loose;
    k.shadow(11.6, -8.8, 0.2, 0.2);
    k.slot({ id: 'blocos', room: 'brinquedoteca', object: tower, kinds: { extra: [show(extra)], missing: [hide(tower)], rotate: [rotBy(tower, 0, 0, 0.35)], scale: [scaleBy(tower, 2.4)] } });
  }

  // cavalinho de balanço
  {
    const hz = k.part((g) => rockingHorse(g, '#ffffff', '#ff9ec4'), 14.6, 0, -7.4, -Math.PI / 2);
    k.solidC(14.6, -7.4, 0.5, 1.0, 0, 0.8);
    k.shadow(14.6, -7.4, 0.3, 0.5);
    k.slot({
      id: 'cavalinho',
      room: 'brinquedoteca',
      object: hz,
      sound: 'creak',
      kinds: {
        move: [animate(k, (_dt, t) => (hz.rotation.z = Math.sin(t * 2.6) * 0.18), () => (hz.rotation.z = 0)), moveBy(hz, -2.6, 0, 2.6, 1.2)],
        rotate: [rotBy(hz, 0, Math.PI, 0)],
        color: [tint(k, hz, '#3a3a44')],
      },
    });
  }

  // trenzinho no trilho (anda sozinho = som)
  {
    const tr = k.part((g) => {
      const p = g('paint');
      p.box(0.22, 0.14, 0.12, 0, 0.03, 0, '#e03a3a');
      p.box(0.1, 0.1, 0.12, -0.08, 0.17, 0, '#e03a3a');
      p.cyl(0.03, 0.035, 0.08, 0.07, 0.17, 0, '#2a2a30', 8);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.cyl(0.035, 0.035, 0.02, sx * 0.07, 0.035, sz * 0.065, '#ffd23a', 10, Math.PI / 2);
      p.box(0.18, 0.1, 0.11, -0.26, 0.03, 0, '#4ab0ff');
      p.box(0.18, 0.1, 0.11, -0.47, 0.03, 0, '#5ad07a');
    }, 13.3, 0, -6.9, Math.PI / 2);
    let ang = 0;
    const run = animate(
      k,
      (dt) => {
        ang += dt * 0.8;
        tr.position.set(12.4 + Math.cos(ang) * 0.9, 0, -6.9 + Math.sin(ang) * 0.5);
        tr.rotation.y = -ang - Math.PI;
      },
      () => {
        ang = 0;
      },
    );
    k.slot({ id: 'trem', room: 'brinquedoteca', object: tr, sound: 'train', kinds: { sound: [all(poseAt(tr, 13.3, 0, -6.9, Math.PI / 2), run)], missing: [hide(tr)], move: [moveBy(tr, -2.5, 0, -1.5, 0.7)] } });
  }

  // bebês no tatame (2) — sentados
  const matBabies: Baby[] = [];
  [
    [10.9, -8.0, 0.4],
    [12.9, -9.1, -0.5],
  ].forEach(([x, zz, ry], i) => {
    const b = babyBloop(k, BABY_COLS[(i + 3) % BABY_COLS.length], 'sit', 'awake');
    b.g.position.set(x, 0, zz);
    b.g.rotation.y = ry;
    k.shadow(x, zz, 0.2, 0.2);
    matBabies.push(b);
    k.slot({
      id: 'bebe_tatame' + (i + 1),
      room: 'brinquedoteca',
      object: b.g,
      kinds: {
        face: [(on) => b.setFace(on ? 'angry' : 'awake'), (on) => b.setFace(on ? 'grin' : 'awake')],
        rotate: [rotBy(b.g, 0, Math.PI, 0), rotBy(b.g, Math.PI, 0, 0)],
        move: [i ? poseAt(b.g, 13.65, 0.96, -10.9, 0.3) : poseAt(b.g, 12.0, 0, -4.3, 0)],
        missing: [hide(b.g)],
      },
    });
  });
  // bebê em cima do escorregador (deslocamento acima corrige a altura na plataforma)

  // baú de brinquedos (tarefa 'toy': arrumado/bagunçado) ×3 grupos de brinquedos
  {
    const chest = k.part((g) => toyChest(g, '#ffb3c8', '#ffffff'), 9.0, 0, -4.6, 0);
    const lid = k.part((g) => g('paint').box(0.84, 0.05, 0.5, 0, 0, 0.25, '#ffffff'), 0, 0.47, -0.25, 0, chest);
    lid.rotation.x = -1.3;
    k.solidC(9.0, -4.6, 0.84, 0.5, 0, 0.5);
    k.shadow(9.0, -4.6, 0.45, 0.28);
    const inBox = k.part((g) => {
      const p = g('paint');
      p.sph(0.1, -0.2, 0.42, 0, '#5ac8ff', 1, 1, 1, 10);
      p.box(0.12, 0.12, 0.12, 0.1, 0.38, 0.05, '#ffd23a', 0.4);
      p.cyl(0.05, 0.05, 0.18, 0.25, 0.36, -0.05, '#ff5a7a', 10, 0.5);
    }, 0, 0, 0, 0, chest);
    // brinquedos espalhados (3 grupos = 3 tarefas)
    const groups = [
      { x: 10.4, z: -5.4 },
      { x: 13.4, z: -5.0 },
      { x: 9.3, z: -7.4 },
    ];
    groups.forEach((gp, i) => {
      const mess = k.part((g) => {
        const p = g('paint');
        p.sph(0.1, 0, 0.1, 0, ['#5ac8ff', '#ff9a3a', '#5ad07a'][i], 1, 1, 1, 12);
        p.box(0.12, 0.12, 0.12, 0.35, 0, 0.2, '#ffd23a', 0.6);
        p.box(0.12, 0.12, 0.12, -0.3, 0, 0.25, '#ff5a7a', 1.1);
        p.cyl(0.04, 0.04, 0.2, 0.1, 0.04, -0.3, '#b07aff', 10, Math.PI / 2, 0, 0.8);
        // peixinho/ursinho de pano
        g('fabric').sph(0.08, -0.15, 0.06, -0.15, '#ffd6e6', 1.3, 0.7, 1, 10);
      }, gp.x, 0, gp.z, i * 1.3);
      const tidy = k.part((g) => g('paint').sph(0.06, 0, 0, 0, ['#5ac8ff', '#ff9a3a', '#5ad07a'][i], 1, 1, 1, 8), -0.25 + i * 0.25, 0.47, 0.02, 0, chest);
      tidy.visible = false;
      k.interact({
        id: 'brinquedos' + (i + 1),
        room: 'brinquedoteca',
        kind: 'toy',
        object: mess,
        at: { x: gp.x + 0.5, y: 0, z: gp.z + 0.5 },
        states: ['messy', 'tidy'],
        setState(s) {
          mess.visible = s !== 'tidy';
          tidy.visible = s === 'tidy';
          inBox.visible = true;
        },
      });
    });
  }

  // desenhos colados na parede (2 slots)
  {
    const d1 = frame(k, drawingTex('family'), 0.5, 0.38, 8.08, 1.35, -9.6, Math.PI / 2, '', 0, true);
    const d2 = frame(k, drawingTex('sun'), 0.5, 0.38, 8.08, 1.3, -10.4, Math.PI / 2, '', 0, true);
    const d3 = frame(k, drawingTex('rainbow'), 0.5, 0.38, 8.08, 1.4, -8.8, Math.PI / 2, '', 0, true);
    void d3;
    k.slot({ id: 'desenho_familia', room: 'brinquedoteca', object: d1.g, kinds: { picture: [texSwap(d1.mat, drawingTex('creepyFamily')), texSwap(d1.mat, drawingTex('handsDark'))], missing: [hide(d1.g)] } });
    k.slot({ id: 'desenho_sol', room: 'brinquedoteca', object: d2.g, kinds: { picture: [texSwap(d2.mat, drawingTex('sunSad')), texSwap(d2.mat, drawingTex('scribble'))], rotate: [rotBy(d2.g, 0, 0, Math.PI)] } });
  }

  // teatrinho: criatura no palco / cortina fechada
  {
    const c = cr(0.55);
    c.g.position.set(12.2, 0.72, -11.6);
    const cur = k.part((g) => g('fabric').box(0.9, 0.62, 0.03, 0, 0, 0, '#c83a5a'), 12.2, 1.02, -11.44);
    cur.visible = false;
    const puppet = k.part((g) => {
      g('fabric').sph(0.09, 0, 0, 0, '#9be5b0', 1, 1.1, 1, 12);
      g('paint').sph(0.02, -0.03, 0.03, 0.08, '#222', 1, 1, 1, 6);
      g('paint').sph(0.02, 0.03, 0.03, 0.08, '#222', 1, 1, 1, 6);
      g('fabric').cyl(0.06, 0.08, 0.2, 0, -0.28, 0, '#9be5b0', 10);
    }, 12.0, 1.2, -11.55);
    k.slot({ id: 'teatrinho', room: 'brinquedoteca', object: puppet, kinds: { creature: [all(show(c.g), hide(puppet))], swap: [swap(puppet, cur)], move: [moveBy(puppet, 0.45, 0, 0)] } });
  }

  // relógio de parede (ponteiros girando ao contrário / relógio de cabeça p/ baixo)
  {
    const ck = wallClock(k, 10.0, 2.0, -4.08, Math.PI, 0.2, '#7ad0ff');
    k.slot({
      id: 'relogio',
      room: 'brinquedoteca',
      object: ck.g,
      sound: 'tick',
      kinds: {
        rotate: [animate(k, (dt) => (ck.hands.rotation.z += dt * 4), () => (ck.hands.rotation.z = 0.9)), rotBy(ck.g, 0, 0, Math.PI)],
        missing: [hide(ck.g)],
      },
    });
  }

  // porta de vidro para o pátio
  {
    const d = door(k, 16, -6.5, -Math.PI / 2, 0.98, 2.13, '#ffffff', { glass: true, knob: '#c0c0c8' });
    k.slot({ id: 'porta_patio', room: 'brinquedoteca', object: d.leaf, kinds: { door: [(on) => d.set(on ? -1.2 : 0), (on) => d.set(on ? -0.3 : 0)] } });
  }

  // criatura espiando do arco do corredor
  {
    const c = cr(0.95);
    c.g.position.set(11.25, 0, -4.35);
    c.g.rotation.y = Math.PI * 0.95;
    const c2 = cr(0.8);
    c2.g.position.set(15.1, 0.9, -11.2);
    c2.g.rotation.y = -Math.PI * 0.3;
    k.slot({ id: 'criatura_arco', room: 'brinquedoteca', object: c.g, kinds: { creature: [show(c.g), show(c2.g)] } });
  }

  /* ---------- REFEITÓRIO ---------- */
  // bebê no cadeirão do meio + tarefa mamadeira
  {
    highChairPart(k, 10.4, 3.8);
    const b = babyBloop(k, BABY_COLS[2], 'sit', 'awake');
    b.g.position.set(10.4, 0.72, 3.78);
    b.g.rotation.y = Math.PI;
    const bt = k.part((g) => bottle(g), 10.5, 0.885, 3.55, 0);
    bt.visible = false;
    k.slot({
      id: 'bebe_cadeirao',
      room: 'refeitorio',
      object: b.g,
      kinds: {
        face: [(on) => b.setFace(on ? 'angry' : 'awake'), (on) => b.setFace(on ? 'stare' : 'awake')],
        missing: [hide(b.g)],
        move: [all(poseAt(b.g, 10.0, 0.5, 1.0, Math.PI), (on) => b.setPose(on ? 'sit' : 'sit'))],
        scale: [scaleBy(b.g, 1.8)],
      },
    });
    // aquecedor de mamadeira na bancada
    const warmer = k.part((g) => {
      g('paint').lathe([[0.08, 0], [0.085, 0.02], [0.08, 0.14], [0.06, 0.15]], 0, 0, 0, '#ffffff', 16);
      g('paint').box(0.04, 0.02, 0.01, 0, 0.04, 0.08, '#5a5a6a');
    }, 12.2, 0.92, 1.8);
    const wb = k.part((g) => bottle(g), 0, 0.06, 0, 0, warmer);
    const led = k.part((g) => g('glow').sph(0.008, 0, 0, 0, '#ff6a3a', 1, 1, 1, 6), 0, 0.05, 0.085, 0, warmer);
    led.visible = false;
    const states = ['cold', 'warm', 'given'];
    k.interact({
      id: 'mamadeira1',
      room: 'refeitorio',
      kind: 'bottle',
      object: warmer,
      at: { x: 11.5, y: 0, z: 1.8 },
      states,
      setState(s) {
        led.visible = s === 'warm';
        wb.visible = s !== 'given';
        bt.visible = s === 'given';
      },
    });
    // segunda mamadeira: geladeira → bebê da brinquedoteca
    const bt2 = k.part((g) => bottle(g, '#fff6e8', '#ff9ec4'), 0.12, 0.16, 0.12, 0, matBabies[0].g);
    bt2.visible = false;
    const fridgeBottle = k.part((g) => bottle(g, '#fff6e8', '#ff9ec4'), 12.38, 1.585, 1.1);
    k.interact({
      id: 'mamadeira2',
      room: 'brinquedoteca',
      kind: 'bottle',
      object: matBabies[0].g,
      at: { x: 10.9, y: 0, z: -7.3 },
      states,
      setState(s) {
        fridgeBottle.visible = s === 'cold';
        bt2.visible = s === 'given';
      },
    });
    k.npc('cadeirao_esq', 'refeitorio', 9.3, 0.72, 3.8, Math.PI, 'sit');
    k.npc('cadeirao_dir', 'refeitorio', 11.5, 0.72, 3.8, Math.PI, 'sit');
  }

  // mamadeiras na prateleira (a mais / sumiram / leite roxo)
  {
    const shelf = new THREE.Group();
    k.root.add(shelf);
    const bts: THREE.Group[] = [];
    for (let i = 0; i < 4; i++) bts.push(k.part((g) => bottle(g, '#fffaf0', ['#7ac8ff', '#ff9ec4', '#9be5b0', '#ffd27a'][i]), 12.38, 1.585, 1.4 + i * 0.16, 0, shelf));
    const more: THREE.Group[] = [];
    for (let i = 0; i < 3; i++) more.push(k.part((g) => bottle(g, '#fffaf0', '#c9a8ff'), 12.38, 1.585, 2.04 + i * 0.12 - 0.0, 0, shelf));
    more.forEach((m) => (m.visible = false));
    k.slot({ id: 'mamadeiras', room: 'refeitorio', object: shelf, kinds: { extra: [all(...more.map(show))], missing: [all(hide(bts[1]), hide(bts[2]))], color: [all(...bts.map((b) => tint(k, b, '#b07aff')))] } });
  }

  // geladeira: porta aberta com luz
  {
    const piv = k.part((g) => {
      g('metal').box(0.04, 1.08, 0.65, -0.02, 0, -0.325, '#f4f6fa');
      g('metal').box(0.02, 0.5, 0.04, -0.05, 0.3, -0.58, '#c8ccd4');
      g('paint').box(0.004, 0.012, 0.6, -0.042, 0.55, -0.32, '#d8dce4');
      for (let i = 0; i < 4; i++) g('paint').sph(0.03, -0.045, 0.75 + (i % 2) * 0.12, -0.15 - i * 0.1, ['#ff5a5a', '#5ab0ff', '#ffd23a', '#5ad07a'][i], 0.4, 1, 1, 8);
    }, 11.8, 0.66, 5.225);
    const inner = k.pool(11.4, 0.012, 4.9, 1.3, 1.1, '#e8f4ff', 0.45);
    inner.visible = false;
    k.slot({ id: 'geladeira', room: 'refeitorio', object: piv, kinds: { door: [all(show(inner), (on) => (piv.rotation.y = on ? 1.7 : 0)), (on) => (piv.rotation.y = on ? 0.5 : 0)] } });
  }

  // fruteira na mesinha (troca por doces / cor)
  {
    const bowl = k.part((g) => {
      g('paint').lathe([[0.0, 0], [0.08, 0], [0.16, 0.06], [0.17, 0.08]], 0, 0, 0, '#ffffff', 18);
      g('paint').sph(0.05, -0.05, 0.08, 0, '#e03a3a', 1, 1, 1, 10);
      g('paint').sph(0.05, 0.05, 0.08, 0.03, '#ffb43a', 1, 1, 1, 10);
      g('paint').sph(0.03, 0.0, 0.11, -0.05, '#7ad04a', 1, 1, 1, 8);
      g('paint').cyl(0.025, 0.02, 0.18, 0.06, 0.07, -0.05, '#ffe03a', 8, 0, 0.9);
    }, 10.0, 0.52, 1.0);
    const alt = k.part((g) => {
      g('paint').lathe([[0.0, 0], [0.08, 0], [0.16, 0.06], [0.17, 0.08]], 0, 0, 0, '#ffffff', 18);
      for (let i = 0; i < 5; i++) g('paint').sph(0.045, Math.cos(i) * 0.07, 0.08, Math.sin(i) * 0.07, '#3a1c52', 1, 1, 1, 8);
      g('glow').sph(0.012, 0.0, 0.13, 0.03, '#ffe23a', 1, 1, 1, 6);
    }, 10.0, 0.52, 1.0);
    k.slot({ id: 'fruteira', room: 'refeitorio', object: bowl, kinds: { swap: [swap(bowl, alt)], move: [moveBy(bowl, 2.2, 0.4, 0.2)], color: [tint(k, bowl, '#5a6a8a')] } });
  }

  // desenho do refeitório
  {
    const d = frame(k, drawingTex('fish'), 0.6, 0.45, 9.4, 1.55, -1.52, 0, '#ffffff', 0, true);
    const d2 = frame(k, drawingTex('flower'), 0.6, 0.45, 11.6, 1.55, -1.52, 0, '#ffffff', 0, true);
    void d2;
    k.slot({ id: 'desenho_peixe', room: 'refeitorio', object: d.g, kinds: { picture: [texSwap(d.mat, drawingTex('creature')), texSwap(d.mat, drawingTex('eyes'))], missing: [hide(d.g)] } });
  }

  /* ---------- TROCADOR ---------- */
  {
    const b = babyBloop(k, BABY_COLS[4], 'lie', 'awake');
    b.g.position.set(15.62, 1.0, 1.35);
    b.g.rotation.y = -Math.PI / 2;
    // nuvenzinha de "cheirinho" (desenho animado) e brilhos de limpo
    const stink = k.part((g) => {
      for (let i = 0; i < 4; i++) g('glow').sph(0.06 - i * 0.008, Math.sin(i * 1.7) * 0.06, i * 0.1, Math.cos(i * 1.7) * 0.06, '#9ae05a', 1, 0.7, 1, 8);
    }, 15.6, 1.25, 1.55);
    const shine = k.part((g) => {
      for (let i = 0; i < 4; i++) g('glow').sph(0.018, Math.cos(i * 1.6) * 0.18, 0.1 + i * 0.05, Math.sin(i * 1.6) * 0.18, '#ffffff', 1, 1, 1, 5);
    }, 15.6, 1.1, 1.35);
    shine.visible = false;
    k.anim((_dt, t) => {
      if (stink.visible) stink.position.y = 1.25 + Math.sin(t * 2) * 0.03;
      if (shine.visible) shine.rotation.y = t;
    });
    k.interact({
      id: 'fralda',
      room: 'trocador',
      kind: 'diaper',
      object: b.g,
      at: { x: 14.8, y: 0, z: 1.35 },
      states: ['dirty', 'clean'],
      setState(s) {
        stink.visible = s === 'dirty';
        shine.visible = s === 'clean';
      },
    });
    k.slot({ id: 'bebe_trocador', room: 'trocador', object: b.g, kinds: { face: [(on) => b.setFace(on ? 'grin' : 'awake'), (on) => b.setFace(on ? 'stare' : 'awake')], missing: [all(hide(b.g), hide(stink))], color: [tint(k, b.body, '#8affc8')] } });
    // pilha de fraldas
    const st = k.part((g) => diaperStack(g, 6, '#ffffff'), 15.8, 1.63, 1.3, Math.PI / 2);
    const st2 = k.part((g) => diaperStack(g, 8, '#ffffff'), 15.65, 0.0, -0.9, 0.4);
    st2.visible = false;
    k.slot({ id: 'fraldas', room: 'trocador', object: st, kinds: { missing: [hide(st)], extra: [show(st2)], color: [tint(k, st, '#ffb3c8')] } });
  }
  // patinho na banheira
  {
    const d = k.part((g) => duck(g), 13.35, 0.58, 2.35, 2.4);
    const more = k.part((g) => {
      for (let i = 0; i < 6; i++) {
        const p = g('paint');
        void p;
        duckAt(g, 12.8 + (i % 3) * 0.2, 0.41, 2.4 + Math.floor(i / 3) * 0.3, i);
      }
    });
    more.visible = false;
    k.slot({ id: 'patinho', room: 'trocador', object: d, kinds: { extra: [show(more)], scale: [scaleBy(d, 4)], color: [tint(k, d, '#3a3a44')], move: [moveBy(d, 1.5, 0.3, -1.1)] } });
  }
  // espelho (reflexo com a criatura)
  {
    const mirrorTex = signTex('', '#a8c8d8', '#000', 128, 160);
    const f = frame(k, mirrorTex, 0.6, 0.75, 13.3, 1.35, 5.42, Math.PI, '#ffffff', 0.03);
    k.slot({ id: 'espelho', room: 'trocador', object: f.g, kinds: { picture: [texSwap(f.mat, screenTex('face')), texSwap(f.mat, drawingTex('handsDark'))] } });
  }
  // torneira pingando (som) — gota animada
  {
    const drop = k.part((g) => g('glass').sph(0.012, 0, 0, 0, '#bfe8ff', 1, 1.4, 1, 6), 13.3, 0.84, 5.3);
    drop.visible = false;
    k.slot({
      id: 'torneira',
      room: 'trocador',
      object: drop,
      sound: 'drip',
      kinds: {
        sound: [
          all(
            show(drop),
            animate(k, (_dt, t) => (drop.position.y = 0.84 - ((t * 1.3) % 1) * 0.2), () => (drop.position.y = 0.84)),
          ),
        ],
      },
    });
  }
  // porta do trocador
  {
    const d = door(k, 13.775, -1.6, 0, 0.93, 2.13, '#bfe8ff', { kid: '#9be5b0' });
    d.set(1.25);
    k.slot({ id: 'porta_trocador', room: 'corredor', object: d.leaf, kinds: { door: [(on) => d.set(on ? 0 : 1.25)] } });
  }

  /* ---------- RECEPÇÃO ---------- */
  {
    const d = door(k, 2.0, 5.5, 0, 1.0, 2.13, '#ff9ec4', { glass: true });
    k.slot({ id: 'porta_entrada', room: 'recepcao', object: d.leaf, sound: 'wind', kinds: { door: [(on) => d.set(on ? -1.3 : 0), (on) => d.set(on ? -0.4 : 0)] } });
  }
  {
    const s1 = k.part((g) => stroller(g, '#9ad7ff', '#4a8ad0'), 4.3, 0, 4.6, Math.PI * 0.95);
    const s2 = k.part((g) => stroller(g, '#ffb3c8', '#d04a7a'), 3.5, 0, 4.9, Math.PI * 1.05);
    k.solidC(3.9, 4.75, 1.6, 0.8, 0, 1.0);
    k.shadow(4.3, 4.6, 0.45, 0.3);
    k.shadow(3.5, 4.9, 0.45, 0.3);
    const s3 = k.part((g) => stroller(g, '#3a3a44', '#1a1a20'), 2.4, 0, 0.9, 1.9);
    s3.visible = false;
    k.slot({ id: 'carrinhos', room: 'recepcao', object: s1, kinds: { move: [moveBy(s1, -2.1, 0, -2.7, 1.4)], extra: [show(s3)], missing: [hide(s2)], color: [tint(k, s1, '#5a5a5a')] } });
  }
  {
    // mochilas nos escaninhos
    const packs = new THREE.Group();
    k.root.add(packs);
    const pc = ['#ff5a7a', '#4ab0ff', '#ffd23a', '#5ad07a', '#b07aff', '#ff9a3a'];
    const pack = (g: G, i: number, x: number, y: number, z: number) => {
      // mochila virada para +x (frente do escaninho)
      g('paint').box(0.16, 0.28, 0.26, x, y, z, pc[i]);
      g('paint').box(0.05, 0.1, 0.18, x + 0.09, y + 0.04, z, shade(pc[i], -0.15));
      g('paint').torus(0.06, 0.012, x, y + 0.3, z, '#3a3a44', 0, 10, Math.PI / 2, Math.PI);
    };
    const at = (i: number): [number, number, number] => [0.25, 0.42 + (i % 2) * 0.4, -0.95 + Math.floor(i / 2) * 0.77];
    // 4 mochilas numa peça só; 2 soltas (somem / saem do lugar)
    const fixed = k.part((g) => [0, 3, 4, 5].forEach((i) => pack(g, i, ...at(i))), 0, 0, 0, 0, packs);
    const p1 = k.part((g) => pack(g, 1, 0, 0, 0), ...at(1), 0, packs);
    const p2 = k.part((g) => pack(g, 2, 0, 0, 0), ...at(2), 0, packs);
    k.slot({ id: 'mochilas', room: 'recepcao', object: packs, kinds: { color: [all(tint(k, fixed, '#3a3a44'), tint(k, p1, '#3a3a44'), tint(k, p2, '#3a3a44'))], missing: [hide(p1)], move: [moveBy(p2, 1.8, -0.82, 1.2, 0.6)] } });
  }
  {
    const f = frame(k, drawingTex('family'), 0.9, 0.65, 0.08, 1.75, 4.2, Math.PI / 2, '#ff9ec4');
    k.slot({ id: 'quadro_recepcao', room: 'recepcao', object: f.g, kinds: { picture: [texSwap(f.mat, drawingTex('creepyFamily')), texSwap(f.mat, drawingTex('creature'))], rotate: [rotBy(f.g, 0, 0, 0.5)] } });
  }
  {
    const pl = k.part((g) => plant(g, 0, 0, '#9ad7ff', 1.0), 4.65, 0, -1.1);
    k.shadow(4.65, -1.1, 0.25, 0.25);
    k.solidC(4.65, -1.1, 0.45, 0.45, 0, 0.6);
    k.slot({ id: 'planta', room: 'recepcao', object: pl, kinds: { scale: [scaleBy(pl, 2.4)], missing: [hide(pl)], color: [tint(k, pl, '#5a3a6a')] } });
  }
  {
    const ck = wallClock(k, 4.92, 2.05, 1.6, -Math.PI / 2, 0.2, '#ffd27a');
    k.slot({ id: 'relogio_recepcao', room: 'recepcao', object: ck.g, sound: 'tick', kinds: { rotate: [rotBy(ck.hands, 0, 0, 2.6), animate(k, (dt) => (ck.hands.rotation.z -= dt * 6), () => (ck.hands.rotation.z = 0.9))] } });
  }
  {
    // luz da recepção (pisca / cor)
    const sh = k.part((g) => g('glow').cyl(0.26, 0.24, 0.04, 0, 0, 0, '#ff3a3a', 24), 2.5, H - 0.07, 0.8);
    sh.visible = false;
    const red = k.pool(2.5, 0.01, 0.8, 3.4, 3.4, '#ff2a2a', 0.35);
    red.visible = false;
    const dark = k.part((g) => g('paint').cyl(0.27, 0.25, 0.042, 0, 0, 0, '#2a2a30', 24), 2.5, H - 0.075, 3.8);
    dark.visible = false;
    k.slot({ id: 'luz_recepcao', room: 'recepcao', object: sh, kinds: { light: [all(show(sh), show(red)), flicker(k, [red, sh], 1), show(dark)] } });
  }

  /* ---------- SALA DOS MONITORES ---------- */
  {
    const scr = [screenTex('grid', 'a'), screenTex('grid', 'bb'), screenTex('grid', 'ccc')];
    const mons: { m: THREE.Mesh; mat: THREE.Material }[] = [];
    for (let i = 0; i < 3; i++) {
      const x = 6.2 + i * 0.7;
      k.part((g) => {
        g('metal').box(0.62, 0.42, 0.05, 0, 0.2, 0, '#2a2a30');
        g('metal').box(0.08, 0.2, 0.06, 0, 0.0, -0.04, '#3a3a44');
        g('metal').box(0.26, 0.015, 0.18, 0, 0.0, -0.04, '#3a3a44');
      }, x, 0.79, 5.15, Math.PI + (i - 1) * -0.2);
      const mat = k.tmat(scr[i], { basic: true });
      const ry = Math.PI + (i - 1) * -0.2;
      const m = k.mesh(quad(0.56, 0.36), mat, x + Math.sin(ry) * 0.03, 1.19, 5.15 + Math.cos(ry) * 0.03, ry);
      mons.push({ m, mat });
    }
    k.slot({
      id: 'monitores',
      room: 'monitores',
      object: mons[1].m,
      kinds: {
        picture: [texSwap(mons[1].mat, screenTex('face')), texSwap(mons[0].mat, screenTex('blue'))],
        light: [all(texSwap(mons[0].mat, screenTex('static')), texSwap(mons[1].mat, screenTex('static')), texSwap(mons[2].mat, screenTex('static')))],
      },
    });
  }
  {
    const chair = k.part((g) => {
      const p = g('paint');
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        p.box(0.3, 0.03, 0.04, Math.cos(a) * 0.15, 0.05, Math.sin(a) * 0.15, '#2a2a30', -a);
        p.sph(0.03, Math.cos(a) * 0.29, 0.03, Math.sin(a) * 0.29, '#1a1a20', 1, 1, 1, 6);
      }
      p.cyl(0.03, 0.03, 0.4, 0, 0.05, 0, '#8a8a90', 8);
      g('fabric').box(0.48, 0.08, 0.46, 0, 0.45, 0, '#3a4a6a');
      g('fabric').box(0.46, 0.55, 0.07, 0, 0.55, -0.22, '#3a4a6a', 0, -0.1);
    }, 6.9, 0, 4.25, 0.1);
    k.shadow(6.9, 4.25, 0.3, 0.3);
    k.slot({
      id: 'cadeira_monitor',
      room: 'monitores',
      object: chair,
      sound: 'creak',
      kinds: {
        move: [moveBy(chair, -0.9, 0, -2.6, 2.5)],
        rotate: [animate(k, (dt) => (chair.rotation.y += dt * 2.4), () => (chair.rotation.y = 0.1)), rotBy(chair, 0, Math.PI, 0)],
      },
    });
  }
  {
    const mug = k.part((g) => {
      g('paint').cyl(0.04, 0.035, 0.09, 0, 0, 0, '#ff9ec4', 12);
      g('paint').torus(0.025, 0.007, 0.045, 0.045, 0, '#ff9ec4', 0, 10);
      g('paint').cyl(0.035, 0.035, 0.005, 0, 0.08, 0, '#6a3a1a', 12);
    }, 7.5, 0.79, 4.75);
    const mugs = k.part((g) => {
      for (let i = 0; i < 5; i++) g('paint').cyl(0.04, 0.035, 0.09, Math.cos(i * 1.3) * 0.12, 0, Math.sin(i * 1.3) * 0.08, '#ff9ec4', 12);
    }, 6.1, 0.79, 4.75);
    mugs.visible = false;
    k.slot({ id: 'caneca', room: 'monitores', object: mug, kinds: { extra: [show(mugs)], missing: [hide(mug)], color: [tint(k, mug, '#4ad07a')] } });
  }
  {
    // armário que abre (criatura dentro)
    const piv = k.part((g) => {
      g('metal').box(0.43, 1.8, 0.02, 0.215, 0, 0, '#e88a9a');
      for (let j = 0; j < 3; j++) g('paint').box(0.25, 0.015, 0.01, 0.215, 1.5 + j * 0.05, 0.012, '#2a2a30');
    }, 7.965, 0.02, 0.125, Math.PI / 2);
    const c = cr(0.4);
    c.g.position.set(8.22, 0.1, -0.1);
    c.g.rotation.y = -Math.PI / 2;
    c.g.visible = false;
    k.slot({ id: 'armario', room: 'monitores', object: piv, kinds: { door: [(on) => (piv.rotation.y = on ? Math.PI / 2 + 1.7 : Math.PI / 2)], creature: [all(show(c.g), (on) => (piv.rotation.y = on ? Math.PI / 2 + 1.5 : Math.PI / 2))] } });
  }
  {
    const d = door(k, 6.275, -1.6, 0, 0.93, 2.13, '#c7d3e3');
    d.set(1.35);
    k.slot({ id: 'porta_monitores', room: 'corredor', object: d.leaf, kinds: { door: [(on) => d.set(on ? 0 : 1.35)] } });
  }
  {
    // cafeteira fazendo barulho (fumacinha)
    const steam = k.part((g) => {
      for (let i = 0; i < 4; i++) g('glass').sph(0.035 + i * 0.01, Math.sin(i) * 0.02, i * 0.07, 0, '#ffffff', 1, 1, 1, 6);
    }, 7.4, 1.3, -1.15);
    steam.visible = false;
    k.slot({ id: 'cafeteira', room: 'monitores', object: steam, sound: 'boil', kinds: { sound: [all(show(steam), animate(k, (_dt, t) => (steam.position.y = 1.3 + (t % 1) * 0.1)))] } });
  }

  /* ---------- CORREDOR ---------- */
  {
    const draws = ['flower', 'rainbow', 'sun', 'family', 'fish'] as const;
    const xs = [5.6, 6.3, 7.0, 9.6, 10.3];
    const fr = draws.map((d, i) => frame(k, drawingTex(d), 0.5, 0.38, xs[i], 1.45 + (i % 2) * 0.12, -3.92, 0, '', 0, true));
    k.slot({ id: 'desenhos_corredor', room: 'corredor', object: fr[2].g, kinds: { picture: [texSwap(fr[2].mat, drawingTex('creature')), texSwap(fr[3].mat, drawingTex('creepyFamily'))], missing: [hide(fr[4].g)] } });
  }
  {
    // casacos nos ganchos (um a mais, sombrio)
    const coat = k.part((g) => {
      g('fabric').box(0.32, 0.55, 0.1, 0, -0.5, 0, '#1a1424');
      g('fabric').sph(0.12, 0, -0.03, 0, '#1a1424', 1, 0.9, 0.8, 10);
      g('glow').sph(0.015, -0.04, -0.05, 0.08, '#ffe23a', 1, 1, 1, 5);
      g('glow').sph(0.015, 0.04, -0.05, 0.08, '#ffe23a', 1, 1, 1, 5);
    }, 5.25, 1.75, -1.8);
    coat.visible = false;
    const hooks = k.part((g) => {
      for (let i = 0; i < 4; i++) {
        g('metal').sph(0.025, -0.6 + i * 0.4, 0, 0, '#e8c860', 1, 1, 1, 6);
        if (i !== 2) g('fabric').box(0.26, 0.45, 0.08, -0.6 + i * 0.4, -0.5, 0.02, ['#ffb3c8', '#b3e0ff', '#fff0a0', '#c8f0c8'][i]);
      }
    }, 4.85, 1.75, -1.76);
    k.slot({ id: 'casacos', room: 'corredor', object: hooks, kinds: { extra: [show(coat)], color: [tint(k, hooks, '#2a2a30')] } });
  }
  {
    const fp = k.mesh(new THREE.PlaneGeometry(0.4, 1.6).rotateX(-Math.PI / 2), k.tmat(footprintTexSafe(), { transparent: true, depthWrite: false, polygonOffset: 2 }), 6.0, 0.006, -2.8, Math.PI / 2);
    fp.visible = false;
    k.slot({ id: 'pegadas_corredor', room: 'corredor', object: fp, kinds: { extra: [show(fp)] } });
  }
  {
    const c = cr(1.0);
    c.g.position.set(15.5, 0, -3.5);
    c.g.rotation.y = Math.PI / 2 + 0.5;
    const sign = k.part((g) => g('glow').box(0.004, 0.18, 0.48, 0, 0, 0, '#ff2a2a'), 15.9, 2.31, -2.8);
    sign.visible = false;
    k.slot({ id: 'fim_corredor', room: 'corredor', object: c.g, kinds: { creature: [show(c.g)], light: [show(sign)] } });
  }
  {
    const d = door(k, 16, -3.3, -Math.PI / 2, 0.98, 2.13, '#e05a5a', { knob: '#d0d0d8' });
    k.slot({ id: 'porta_emergencia', room: 'corredor', object: d.leaf, sound: 'wind', kinds: { door: [(on) => d.set(on ? -1.2 : 0)] } });
  }

  /* ---------- PÁTIO ---------- */
  {
    // balanço (estrutura fixa + assentos que balançam)
    k.part((g) => {
      const m = g('metal');
      for (const sz of [-1, 1]) {
        m.tube([[-0.6, 0, sz * 1.0], [0, 2.1, sz * 1.0]], 0.04, '#ff7a6a', 2, 8);
        m.tube([[0.6, 0, sz * 1.0], [0, 2.1, sz * 1.0]], 0.04, '#ff7a6a', 2, 8);
      }
      m.cyl(0.045, 0.045, 2.1, 0, 2.08, 0, '#ffd27a', 10, Math.PI / 2);
    }, 19.6, 0, -8.0);
    k.solid(18.9, -9.1, 20.3, -6.9, 2.1);
    const seats: THREE.Group[] = [];
    for (const sz of [-0.45, 0.45]) {
      const s = k.part((g) => {
        g('metal').cyl(0.008, 0.008, 1.55, -0.18, -1.6, 0, '#c0c0c8', 4);
        g('metal').cyl(0.008, 0.008, 1.55, 0.18, -1.6, 0, '#c0c0c8', 4);
        g('paint').box(0.46, 0.04, 0.2, 0, -1.62, 0, sz > 0 ? '#4ab0ff' : '#5ad07a');
      }, 19.6, 2.08, -8.0 + sz, Math.PI / 2);
      seats.push(s);
    }
    k.shadow(19.6, -8.0, 0.8, 1.1);
    k.slot({
      id: 'balanco',
      room: 'patio',
      object: seats[0],
      sound: 'creak',
      kinds: {
        move: [animate(k, (_dt, t) => (seats[0].rotation.x = Math.sin(t * 2.1) * 0.5), () => (seats[0].rotation.x = 0))],
        missing: [hide(seats[1])],
      },
    });
  }
  {
    const c = cr(1.0);
    c.g.position.set(20.5, 0, -12.6);
    c.g.rotation.y = -0.3;
    const c2 = cr(1.2);
    c2.g.position.set(22.7, 0, -6.5);
    c2.g.rotation.y = -Math.PI / 2;
    k.slot({ id: 'cerca', room: 'patio', object: c.g, kinds: { creature: [show(c.g), show(c2.g)] } });
  }
  {
    const castle = k.part((g) => {
      const p = g('paint');
      p.box(0.4, 0.2, 0.4, 0, 0, 0, '#e8c888');
      for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) p.cyl(0.07, 0.08, 0.3, x, 0, z, '#e8c888', 8);
      p.cyl(0.1, 0.12, 0.35, 0, 0.15, 0, '#f0d498', 10);
    }, 18.2, 0.08, -3.7);
    castle.visible = false;
    const bucket = k.part((g) => {
      g('paint').cyl(0.1, 0.075, 0.16, 0, 0, 0, '#ff5a7a', 12);
      g('paint').torus(0.1, 0.008, 0, 0.17, 0, '#ffd23a', 0, 12, 0, Math.PI);
    }, 18.5, 0.08, -3.3);
    k.slot({ id: 'areia', room: 'patio', object: bucket, kinds: { extra: [show(castle)], move: [moveBy(bucket, -1.8, -0.08, -4.0)], color: [tint(k, bucket, '#2a2a30')] } });
  }

  /* ---------- TAREFAS: BERÇO (ninar) ---------- */
  babies.forEach((b, i) => {
    const p = new THREE.Vector3();
    b.g.getWorldPosition(p);
    const front = i < 3 ? { x: p.x, z: p.z + 0.95 } : { x: p.x - 0.95, z: p.z };
    k.interact({
      id: 'berco' + (i + 1),
      room: 'bercario',
      kind: 'crib',
      object: b.g,
      at: { x: front.x, y: 0, z: front.z },
      states: ['asleep', 'awake'],
      setState(s) {
        if (s === 'awake') {
          b.setPose('sit');
          b.setFace('awake');
        } else {
          b.setPose('lie');
          b.setFace('sleep');
        }
      },
    });
  });

  /* ---------- TAREFAS: LUZ NOTURNA ---------- */
  const nl: [string, number, number, number, number][] = [
    ['bercario', 0.075, 0.22, -6.2, Math.PI / 2],
    ['corredor', 8.0, 0.22, -1.67, Math.PI],
    ['trocador', 12.575, 0.22, 4.0, Math.PI / 2],
    ['brinquedoteca', 15.925, 0.22, -4.6, -Math.PI / 2],
  ];
  nl.forEach(([room, x, y, zz, ry], i) => {
    const plug = k.part((g) => {
      g('paint').box(0.08, 0.11, 0.025, 0, -0.055, 0.0125, '#ffffff');
      g('paint').box(0.07, 0.07, 0.04, 0, -0.03, 0.04, '#fff3c4');
    }, x, y, zz, ry);
    const lit = k.part((g) => g('glow').sph(0.035, 0, 0.005, 0.06, '#ffd890', 1, 0.8, 0.6, 10), 0, 0, 0, 0, plug);
    const nx = x + Math.sin(ry) * 0.45;
    const nz = zz + Math.cos(ry) * 0.45;
    const pool = k.pool(nx, 0.012, nz, 1.2, 1.2, '#ffc870', 0.32);
    const wallGlow = k.halo(x + Math.sin(ry) * 0.08, y + 0.02, zz + Math.cos(ry) * 0.08, 0.5, '#ffc870', false, k.root, 0.5);
    k.interact({
      id: 'luznoturna' + (i + 1),
      room,
      kind: 'nightlight',
      object: plug,
      at: { x: x + Math.sin(ry) * 0.8, y: 0, z: zz + Math.cos(ry) * 0.8 },
      states: ['off', 'on'],
      setState(s) {
        const on = s === 'on';
        lit.visible = on;
        pool.visible = on;
        if (wallGlow) wallGlow.visible = on;
      },
    });
  });

  /* ---------- lugares livres para bebês do núcleo ---------- */
  k.npc('tatame1', 'brinquedoteca', 11.8, 0, -9.6, 0.2, 'sit');
  k.npc('tatame2', 'brinquedoteca', 13.6, 0, -8.2, -0.8, 'sit');
  k.npc('mesinha1', 'refeitorio', 10.0 + 0.78, 0.28, 1.0, -Math.PI / 2, 'sit');
  k.npc('mesinha2', 'refeitorio', 10.0, 0.28, 1.78, Math.PI, 'sit');
  k.npc('banco_corredor', 'corredor', 4.85, 0.42, -1.95, Math.PI, 'sit');
  k.npc('recepcao', 'recepcao', 1.4, 0, 3.4, 0.4, 'stand');

  void kidChair;
}

function duckAt(g: G, x: number, y: number, z: number, i: number): void {
  const s = 1;
  const p = g('paint');
  const ry = i * 1.3;
  const c = Math.cos(ry);
  const sn = Math.sin(ry);
  const P = (lx: number, lz: number): [number, number] => [x + lx * c + lz * sn, z - lx * sn + lz * c];
  let [a, b] = P(0, 0);
  p.sph(0.06 * s, a, y + 0.045, b, '#ffd23a', 1.2, 0.8, 1.2, 10);
  [a, b] = P(0.045, 0);
  p.sph(0.04 * s, a, y + 0.1, b, '#ffd23a', 1, 1, 1, 8);
  [a, b] = P(0.085, 0);
  p.sph(0.02, a, y + 0.095, b, '#ff8a2a', 1.2, 0.5, 1.2, 6);
}

function highChairPart(k: MapKit, x: number, z: number): void {
  const zone = k.zone('refeitorio');
  highChair(zone, x, z, Math.PI, '#ffd27a', '#fff3c4');
  k.solidC(x, z, 0.6, 0.6, 0, 0.9);
  k.shadow(x, z, 0.35, 0.35);
}

function footprintTexSafe(): THREE.CanvasTexture {
  // pegadinhas de bebê (pés descalços) — desenhadas na hora
  const W = 128;
  const Hh = 512;
  const [c, x] = cv(W, Hh);
  x.fillStyle = 'rgba(60,30,70,0.75)';
  for (let i = 0; i < 6; i++) {
    const fx = i % 2 ? 78 : 50;
    const fy = Hh - 40 - i * 80;
    x.beginPath();
    x.ellipse(fx, fy, 9, 14, 0, 0, TAU);
    x.fill();
    for (let t = 0; t < 5; t++) {
      x.beginPath();
      x.arc(fx - 9 + t * 4.5, fy - 18, 2.6, 0, TAU);
      x.fill();
    }
  }
  return texOf(c, false);
}

const map: MapDef = {
  id: 'creche',
  name: 'Creche',
  icon: '🧸',
  build,
};
export default map;
