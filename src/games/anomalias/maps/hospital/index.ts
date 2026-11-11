/* ============================================================
 *  MAPA: HOSPITAL (turno da noite) — original.
 *  Planta (metros, Y para cima, chão y=0, pé-direito 3 m):
 *
 *     z=-7.5 ┌──────┬────────┬────────┬───────┬──────┬───────┐
 *            │      │Quarto 1│Quarto 2│Farmác.│Banh. │Estoque│
 *            │Recep-├──┤├────┴──┤├────┴──┤├───┴─┤├───┴──┤├───┤ z=-1.5
 *            │ção   │            CORREDOR                    │
 *            │      ├┤├──────┬┤├─────┬────   ────┬──   ──────┤ z=+1.5
 *            │      │Quarto 3│Quarto 4│Enfermagem│ Espera    │
 *     z=+7.5 └──┤├──┴────────┴────────┴──────────┴───────────┘
 *          x=-20  -14       -7        0         7    (10)   14
 *
 *  Quartos de paciente são montados num "quadro local" (porta em z=0,
 *  fundo em z=-6) e girados 180° no lado sul — o mesmo código serve os 4.
 *  Tudo que não muda é assado numa malha por material (poucas draw calls).
 *  Luz: painéis emissivos + poças de luz falsas no chão; luzes reais só em tier ≥ 2.
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../../../../i18n';
import { drawItem } from '../../core/icons';
import type { AnomalySlot, InteractDef, ItemDef, MapBuild, MapDef, RoomDef, Vec3 } from '../types';
import { Kit, markDyn, type Lamp } from './kit';
import { ceilTex, clockTex, cv, floorTex, mirrorTex, paintingTex, posterTex, screenTex, signTex, tex, wallTex, windowTex, type PicKind, type ScreenKind } from './tex';

const H = 3;
const ITEMS: ItemDef[] = [
  { id: 'red', color: '#ff4f6a', shape: 'heart' },
  { id: 'blue', color: '#3fa7ff', shape: 'drop' },
  { id: 'green', color: '#3ee07a', shape: 'triangle' },
  { id: 'yellow', color: '#ffcf2e', shape: 'star' },
  { id: 'purple', color: '#a066ff', shape: 'moon' },
];

function build({ tier }: { tier: 0 | 1 | 2 | 3 }): MapBuild {
  const k = new Kit(tier);
  const root = k.root;
  const rooms: RoomDef[] = [];
  const interacts: InteractDef[] = [];
  const npcSpots: MapBuild['npcSpots'] = [];
  const lampsByRoom = new Map<string, Lamp[]>();
  const addLamp = (room: string, x: number, z: number, w = 1.2, d = 0.45) => {
    const l = k.lamp(room, x, z, w, d, H);
    const a = lampsByRoom.get(room) ?? [];
    a.push(l);
    lampsByRoom.set(room, a);
    return l;
  };
  const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
  const room = (id: string, name: string, icon: string, x0: number, z0: number, x1: number, z1: number, cams: { pos: Vec3; look: Vec3 }[]) => {
    rooms.push({ id, name, icon, min: v3(x0, 0, z0), max: v3(x1, H, z1), cams });
  };

  /* ------------------------------ materiais ------------------------------ */
  const wallT = k.keep(wallTex('#efe8da', '#8fcfc4', '#4a9a8e'));
  const wallM = k.lam('#ffffff', wallT);
  const wallKidsT = k.keep(wallTex('#fff1d6', '#ffb3c7', '#e0607e'));
  const wallKidsM = k.lam('#ffffff', wallKidsT);
  const floorRoomT = k.keep(floorTex('#cfe6e0', '#b9d8d0', 2));
  const floorCorT = k.keep(floorTex('#dcdfea', '#c6cbdc', 3));
  const floorLobT = k.keep(floorTex('#eadfca', '#d8c8ae', 4));
  const floorBathT = k.keep(floorTex('#e3f1ff', '#c9def2', 5));
  const floorKidsT = k.keep(floorTex('#ffe9a8', '#ffd27a', 6));
  const ceilT = k.keep(ceilTex());
  const M = {
    frame: k.lam('#d4d8e4'),
    metal: k.lam('#b8c2d6'),
    dark: k.lam('#4a5266'),
    white: k.lam('#f4f6fb'),
    wood: k.lam('#c8925e'),
    woodL: k.lam('#e2bf8f'),
    teal: k.lam('#4fb3c9'),
    tealD: k.lam('#2f8aa0'),
    green: k.lam('#5cc86a'),
    leaf: k.lam('#3fae5a'),
    pot: k.lam('#c76b4a'),
    red: k.lam('#ff4f6a'),
    yellow: k.lam('#ffcf2e'),
    brown: k.lam('#9a6a44'),
    card: k.lam('#c9a06a'),
    glassD: k.basic('#0d1a38'),
    blackS: k.lam('#20232e'),
  };

  /* ------------------------------ piso / forro ------------------------------ */
  const floor = (mt: THREE.Texture, x0: number, z0: number, x1: number, z1: number, tile = 1.2) => {
    const g = k.geo(new THREE.PlaneGeometry(x1 - x0, z1 - z0));
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * (x1 - x0)) / tile, (uv.getY(i) * (z1 - z0)) / tile);
    const m = new THREE.Mesh(g, k.lam('#ffffff', mt));
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    root.add(m);
  };
  floor(floorLobT, -20, -7.5, -14, 7.5);
  floor(floorCorT, -14, -1.5, 14, 1.5);
  floor(floorRoomT, -14, -7.5, 6, -1.5);
  floor(floorRoomT, -14, 1.5, 7, 7.5);
  floor(floorBathT, 6, -7.5, 10, -1.5, 0.6);
  floor(floorCorT, 10, -7.5, 14, -1.5);
  floor(floorKidsT, 7, 1.5, 14, 7.5);
  {
    const g = k.geo(new THREE.PlaneGeometry(34, 15));
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 34 * 1.66, uv.getY(i) * 15 * 1.66);
    const c = new THREE.Mesh(g, k.lam('#ffffff', ceilT));
    c.rotation.x = Math.PI / 2;
    c.position.set(-3, H, 0);
    root.add(c);
  }

  /* ------------------------------ paredes ------------------------------ */
  // externas
  k.wallX(wallM, -7.5, -20.1, 14.1);
  k.wallX(wallM, 7.5, -20.1, -14);
  k.wallX(wallM, 7.5, -14, 7);
  k.wallX(wallKidsM, 7.5, 7, 14.1);
  k.wallZ(wallM, -20, -7.5, 7.5);
  k.wallZ(wallM, 14, -7.5, 7.5);
  // corredor
  k.wallX(wallM, -1.5, -14, 14, [
    [-8.5, 1.3],
    [-1.5, 1.3],
    [3, 1.3],
    [8, 1.1],
    [12, 1.1],
  ]);
  k.wallX(wallM, 1.5, -14, 7, [
    [-12.5, 1.3],
    [-5.5, 1.3],
    [3.5, 4],
  ]);
  k.wallX(wallKidsM, 1.5, 7, 14, [[10.5, 2.2]]);
  k.wallZ(wallM, -14, -7.5, -1.5);
  k.wallZ(wallM, -14, 1.5, 7.5);
  // divisórias
  for (const x of [-7, 0, 6, 10]) k.wallZ(wallM, x, -7.5, -1.5);
  for (const x of [-7, 0]) k.wallZ(wallM, x, 1.5, 7.5);
  k.wallZ(wallKidsM, 7, 1.5, 7.5);

  // portas
  const doorLeaf = '#8fc1e8';
  const doors = {
    q1: k.door('q1', -8.5, -1.5, -1, 1.3, doorLeaf, M.frame),
    q2: k.door('q2', -1.5, -1.5, -1, 1.3, doorLeaf, M.frame),
    farm: k.door('farm', 3, -1.5, -1, 1.3, '#9be3a5', M.frame),
    banh: k.door('banh', 8, -1.5, -1, 1.1, '#c7b8ff', M.frame),
    estoq: k.door('estoq', 12, -1.5, -1, 1.1, '#d8c39a', M.frame),
    q3: k.door('q3', -12.5, 1.5, 1, 1.3, doorLeaf, M.frame),
    q4: k.door('q4', -5.5, 1.5, 1, 1.3, doorLeaf, M.frame),
  };

  // placas (ícone, sem texto) acima das portas, do lado do corredor
  const sign = (icon: string, bg: string, x: number, z: number, face: 1 | -1, label = '') => {
    const m = k.lam('#ffffff', k.keep(signTex(icon, bg, label)), 'sign' + icon + label);
    k.plane(root, m, 0.62, 0.31, x, 2.5, z + face * 0.115, face > 0 ? 0 : Math.PI);
  };
  sign('🛏️', '#3f8fd8', -8.5, -1.5, 1, '1');
  sign('🛏️', '#3f8fd8', -1.5, -1.5, 1, '2');
  sign('🛏️', '#3f8fd8', -12.5, 1.5, -1, '3');
  sign('🛏️', '#3f8fd8', -5.5, 1.5, -1, '4');
  sign('💊', '#2fbf6f', 3, -1.5, 1);
  sign('🚻', '#8a5cff', 8, -1.5, 1);
  sign('📦', '#b07a4a', 12, -1.5, 1);
  sign('🩺', '#ff5c9a', 3.5, 1.5, -1);
  sign('🧸', '#ff9a2e', 10.5, 1.5, -1);

  /* ======================== pequenos objetos reutilizáveis ======================== */
  const plant = (p: THREE.Object3D, x: number, z: number, s = 1, cactus = false): THREE.Group => {
    const g = k.group(p, x, 0, z);
    k.cyl(g, M.pot, 0.2 * s, 0.15 * s, 0.34 * s, 0, 0, 0, 10);
    k.cyl(g, M.brown, 0.18 * s, 0.18 * s, 0.02, 0, 0.33 * s, 0, 10);
    if (cactus) {
      const c = k.lam('#4caf50');
      k.cyl(g, c, 0.09 * s, 0.11 * s, 0.7 * s, 0, 0.34 * s, 0, 8);
      k.sph(g, c, 0.09 * s, 0, 1.04 * s, 0, 1, 1, 1, 8);
      k.cyl(g, c, 0.05 * s, 0.05 * s, 0.25 * s, 0.14 * s, 0.6 * s, 0, 6).rotation.z = 0.9;
      k.sph(g, k.lam('#ff5c9a'), 0.05 * s, 0, 1.13 * s, 0, 1, 1, 1, 6);
    } else
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const l = k.sph(g, M.leaf, 0.2 * s, Math.cos(a) * 0.14 * s, (0.55 + (i % 2) * 0.22) * s, Math.sin(a) * 0.14 * s, 1, 1.4, 0.6, 8);
        l.rotation.y = -a;
        l.rotation.z = 0.5;
      }
    if (!cactus) k.sph(g, k.lam('#5bd174'), 0.22 * s, 0, 0.92 * s, 0, 1, 1.2, 1, 8);
    return g;
  };
  const chair = (p: THREE.Object3D, x: number, z: number, ry: number, mat = M.teal): THREE.Group => {
    const g = k.group(p, x, 0, z, ry);
    k.box(g, mat, 0.48, 0.07, 0.46, 0, 0.42, 0);
    k.box(g, mat, 0.48, 0.5, 0.06, 0, 0.49, 0.22);
    for (const [lx, lz] of [
      [-0.2, -0.19],
      [0.2, -0.19],
      [-0.2, 0.19],
      [0.2, 0.19],
    ])
      k.cyl(g, M.dark, 0.022, 0.022, 0.42, lx, 0, lz, 6);
    return g;
  };
  const teddy = (p: THREE.Object3D, x: number, y: number, z: number, ry = 0, col = '#b5835a'): THREE.Group => {
    const g = k.group(p, x, y, z, ry);
    const b = k.lam(col);
    const l = k.lam('#e8c7a0');
    k.sph(g, b, 0.13, 0, 0.13, 0, 1, 1.1, 0.9, 10);
    k.sph(g, b, 0.1, 0, 0.33, 0, 1, 1, 1, 10);
    for (const s of [-1, 1]) {
      k.sph(g, b, 0.04, s * 0.07, 0.42, 0, 1, 1, 0.6, 6);
      k.sph(g, b, 0.05, s * 0.1, 0.04, -0.05, 1, 0.8, 1.3, 6);
      k.sph(g, b, 0.04, s * 0.13, 0.17, -0.03, 1, 1.4, 1, 6);
    }
    k.sph(g, l, 0.045, 0, 0.31, -0.08, 1, 0.8, 0.8, 6);
    k.sph(g, M.blackS, 0.017, -0.035, 0.36, -0.085, 1, 1, 1, 5);
    k.sph(g, M.blackS, 0.017, 0.035, 0.36, -0.085, 1, 1, 1, 5);
    k.sph(g, M.blackS, 0.015, 0, 0.32, -0.125, 1, 1, 1, 5);
    return g;
  };
  /** pelúcia do Bocudo (troca do ursinho) */
  const plushBocudo = (p: THREE.Object3D, x: number, y: number, z: number, ry = 0): THREE.Group => {
    const g = k.group(p, x, y, z, ry);
    k.sph(g, k.lam('#4b2a7a'), 0.17, 0, 0.17, 0, 1, 1, 0.9, 12);
    k.sph(g, k.lam('#33061a'), 0.1, 0, 0.13, -0.12, 1, 0.7, 0.5, 10);
    k.sph(g, k.basic('#ffe14a'), 0.035, -0.06, 0.26, -0.13, 1, 1, 1, 6);
    k.sph(g, k.basic('#ffe14a'), 0.035, 0.06, 0.26, -0.13, 1, 1, 1, 6);
    for (const s of [-1, 1]) {
      const f = k.cyl(g, k.lam('#ffffff'), 0.001, 0.016, 0.04, s * 0.04, 0.17, -0.17, 5);
      f.rotation.x = Math.PI;
      const e = k.cyl(g, k.lam('#2e1650'), 0.001, 0.05, 0.12, s * 0.1, 0.3, 0, 5);
      e.rotation.z = -s * 0.5;
    }
    return g;
  };
  const picture = (p: THREE.Object3D, kind: PicKind, x: number, y: number, z: number, ry: number, w = 0.9, h = 0.68): { g: THREE.Group; mesh: THREE.Mesh; tex: THREE.Texture[] } => {
    const g = k.group(p, x, y, z, ry);
    const texs = [0, 1, 2, 3].map((v) => k.keep(paintingTex(kind, v)));
    k.box(g, k.lam('#6b4a8a'), w + 0.1, h + 0.1, 0.04, 0, -h / 2 - 0.05, 0.0);
    const mesh = k.plane(g, k.own(texs[0]), w, h, 0, 0, 0.022);
    return { g, mesh, tex: texs };
  };
  const screen = (p: THREE.Object3D, kind: ScreenKind, x: number, y: number, z: number, ry: number, w: number, h: number, bez = 0.04): { g: THREE.Group; mesh: THREE.Mesh; tex: THREE.Texture[] } => {
    const g = k.group(p, x, y, z, ry);
    const texs = [0, 1, 2, 3].map((v) => k.keep(screenTex(kind, v)));
    k.box(g, M.blackS, w + bez * 2, h + bez * 2, 0.06, 0, -h / 2 - bez, -0.03);
    const mesh = k.plane(g, k.own(texs[0], true), w, h, 0, 0, 0.002);
    return { g, mesh, tex: texs };
  };
  const bin = (p: THREE.Object3D, x: number, z: number) => {
    k.cyl(p, k.lam('#7a8aa8'), 0.15, 0.13, 0.38, x, 0, z, 10);
    k.cyl(p, k.lam('#5a6a88'), 0.16, 0.16, 0.03, x, 0.38, z, 10);
  };

  /* ============================== RECEPÇÃO ============================== */
  room('recep', t('ano.h.recep', 'Recepção'), '🛎️', -20, -7.5, -14, 7.5, [
    { pos: v3(-14.5, 2.6, 7.0), look: v3(-18, 0.7, -2.5) },
    { pos: v3(-19.6, 2.6, -7.1), look: v3(-15.5, 0.8, 3) },
  ]);
  addLamp('recep', -17, -4);
  addLamp('recep', -17, 3.5);
  // entrada (porta de vidro no sul)
  k.box(root, M.glassD, 2.4, 2.3, 0.06, -17, 0, 7.36);
  k.box(root, M.frame, 0.08, 2.3, 0.12, -17, 0, 7.34);
  k.box(root, M.frame, 2.6, 0.1, 0.12, -17, 2.3, 7.34);
  for (const s of [-1, 1]) k.box(root, M.frame, 0.08, 2.3, 0.12, -17 + s * 1.24, 0, 7.34);
  k.box(root, k.lam('#5a4a7a'), 2.2, 0.01, 1.2, -17, 0.0, 6.6); // capacho
  // balcão
  k.box(root, k.lam('#5fa8c9'), 0.6, 1.05, 4.2, -16.8, 0, 0.5, 0, 0);
  k.box(root, k.lam('#5fa8c9'), 1.6, 1.05, 0.6, -17.6, 0, -1.9);
  k.box(root, M.woodL, 0.8, 0.05, 4.4, -16.85, 1.05, 0.5);
  k.box(root, M.woodL, 1.8, 0.05, 0.8, -17.65, 1.05, -1.9);
  k.box(root, k.lam('#ffffff'), 0.02, 0.3, 3.6, -16.49, 0.55, 0.5); // faixa
  k.col(-17.25, -2.35, -16.45, 2.75, 0, 1.1);
  k.col(-18.45, -2.25, -16.45, -1.55, 0, 1.1);
  k.box(root, M.wood, 1.6, 0.75, 0.6, -19.4, 0, 0.5, Math.PI / 2); // mesa de trás
  k.col(-19.75, -0.35, -19.05, 1.35, 0, 0.8);
  // placa do hospital (cruz + coração) na parede de trás
  {
    const [c, x] = cv(256, 128);
    x.fillStyle = '#ffffff';
    x.beginPath();
    x.roundRect(4, 4, 248, 120, 24);
    x.fill();
    x.fillStyle = '#ff4f6a';
    x.fillRect(48, 34, 60, 60);
    x.fillStyle = '#ffffff';
    x.fillRect(70, 40, 16, 48);
    x.fillRect(54, 56, 48, 16);
    x.font = '64px "Noto Color Emoji", sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('💙', 180, 68);
    k.plane(root, k.lam('#ffffff', k.keep(tex(c))), 1.6, 0.8, -19.885, 2.2, 0.5, Math.PI / 2);
  }
  npcSpots.push({ id: 'nurse1', room: 'recep', pos: v3(-18.2, 0, 0.6), yaw: -Math.PI / 2, pose: 'stand', color: '#ffb3d1', hat: 'nurse' });
  k.slot('npc_nurse1', 'recep', k.group(root, -18.2, 1, 0.6), { kinds: ['face', 'move', 'color', 'scale'], npc: 'nurse1', variants: 4 });
  chair(root, -18.8, 0.6, -Math.PI / 2, k.lam('#8a5cff'));
  {
    const s = screen(root, 'pc', -17.25, 1.45, 1.6, -Math.PI / 2 - 0.6, 0.42, 0.3);
    k.box(s.g, M.blackS, 0.06, 0.18, 0.06, 0, -0.55, -0.06);
    k.box(s.g, M.blackS, 0.22, 0.02, 0.16, 0, -0.56, -0.06);
    k.slot('mon_rec', 'recep', s.g, { kinds: ['picture', 'rotate', 'missing'], pic: s, h: 0.6 });
  }
  {
    const g = k.group(root, -16.75, 1.1, -0.9);
    k.cyl(g, k.lam('#e0c050'), 0.07, 0.08, 0.02, 0, 0, 0, 12);
    k.sph(g, k.lam('#ffd34a'), 0.06, 0, 0.03, 0, 1, 0.8, 1, 10);
    k.sph(g, M.dark, 0.012, 0, 0.09, 0, 1, 1, 1, 5);
    const e = k.group(root, -16.75, 1.1, -0.55);
    k.cyl(e, k.lam('#e0c050'), 0.07, 0.08, 0.02, 0, 0, 0, 12);
    k.sph(e, k.lam('#ffd34a'), 0.06, 0, 0.03, 0, 1, 0.8, 1, 10);
    k.slot('bell', 'recep', g, { kinds: ['extra', 'missing', 'color', 'scale'], extra: [e], colors: ['#ff4f6a', '#45d16b', '#4d7bff'] });
  }
  // cadeiras de espera (fundo norte)
  for (let i = 0; i < 4; i++) {
    if (i === 2) continue;
    chair(root, -19.2 + i * 0.75, -6.9, Math.PI);
  }
  {
    const c = chair(root, -19.2 + 2 * 0.75, -6.9, Math.PI);
    const extra = chair(root, -16.3, -5.4, Math.PI * 0.8);
    k.slot('chair_rec', 'recep', c, { kinds: ['move', 'rotate', 'missing', 'extra', 'color'], move: [[1.2, 2.2, 0.8], [2.4, 4.5, 2.5]], extra: [extra] });
  }
  k.col(-19.5, -7.4, -16.4, -6.6, 0, 0.9);
  // mesinha + revistas
  k.box(root, M.woodL, 0.9, 0.42, 0.5, -17.5, 0, -5.4);
  for (let i = 0; i < 3; i++) k.box(root, k.lam(['#ff8fb0', '#7ad0ff', '#ffd34a'][i]), 0.24, 0.02, 0.3, -17.75 + i * 0.25, 0.42 + i * 0.012, -5.4, 0.2 * (i - 1));
  k.col(-17.95, -5.65, -17.05, -5.15, 0, 0.45);
  {
    const p = plant(root, -14.6, -6.9, 1.25);
    const sw = plant(root, -14.6, -6.9, 1.25, true);
    k.slot('plant_rec', 'recep', p, { kinds: ['move', 'missing', 'swap', 'scale'], swap: sw, move: [[-0.4, 3.0], [-4.6, 0.3]] });
    k.col(-14.9, -7.2, -14.3, -6.6, 0, 1);
  }
  plant(root, -19.5, 6.9, 1.1);
  k.col(-19.8, 6.6, -19.2, 7.2, 0, 1);
  {
    const pic = picture(root, 'land', -17.6, 2.3, -7.38, 0, 1.1, 0.8);
    k.slot('pic_rec', 'recep', pic.g, { kinds: ['picture', 'rotate', 'missing'], pic, h: 0.9 });
  }
  {
    const texs = [0, 1, 2].map((v) => k.keep(clockTex(v)));
    const g = k.group(root, -19.88, 2.35, -3.2, Math.PI / 2);
    k.cyl(g, M.dark, 0.25, 0.25, 0.05, 0, -0.025, 0, 18).rotation.x = Math.PI / 2;
    const mesh = k.plane(g, k.own(texs[0]), 0.44, 0.44, 0, 0, 0.03);
    k.slot('clock_rec', 'recep', g, { kinds: ['picture', 'rotate', 'scale'], pic: { mesh, tex: texs }, h: 0.01 });
  }
  {
    // bebedouro
    const g = k.group(root, -14.45, 0, 4.2, -Math.PI / 2);
    k.box(g, k.lam('#e8ecf4'), 0.36, 1.0, 0.34, 0, 0, 0);
    const bottle = k.cyl(g, k.lam('#7fc8ff'), 0.15, 0.15, 0.42, 0, 1.0, 0, 12);
    bottle.userData.paint = true;
    k.box(g, k.lam('#4d7bff'), 0.06, 0.05, 0.03, -0.07, 0.72, -0.18);
    k.box(g, M.red, 0.06, 0.05, 0.03, 0.07, 0.72, -0.18);
    k.slot('cooler', 'recep', g, { kinds: ['color', 'missing', 'move'], move: [[0, -2.2, 0], [-2.0, 2.4, 1]] });
    k.col(-14.65, 4.0, -14.25, 4.4, 0, 1.4);
  }

  /* ============================== CORREDOR ============================== */
  room('corr', t('ano.h.corr', 'Corredor'), '🚶', -14, -1.5, 14, 1.5, [
    { pos: v3(-13.6, 2.6, 1.2), look: v3(0, 0.6, -0.3) },
    { pos: v3(13.6, 2.6, -1.2), look: v3(0, 0.6, 0.3) },
  ]);
  const corLamps: Lamp[] = [];
  for (const x of [-12, -8, -4, 0, 4, 8, 12]) corLamps.push(addLamp('corr', x, 0, 1.3, 0.38));
  k.slot('lamp_cor', 'corr', corLamps[3].group, { kinds: ['light'], lamp: corLamps[3], variants: 4, anchor: v3(0, 2.9, 0) });
  k.slot('lamp_cor2', 'corr', corLamps[5].group, { kinds: ['light'], lamp: corLamps[5], variants: 4, anchor: v3(8, 2.9, 0) });
  // corrimão nas paredes
  {
    const rail = k.lam('#d9a35e');
    const run = (z: number, gaps: [number, number][]) => {
      let cur = -13.9;
      const gs = [...gaps].sort((a, b) => a[0] - b[0]);
      for (const [c, w] of [...gs, [14.0, 0] as [number, number]]) {
        const a = cur,
          b = c - w / 2 - 0.12;
        if (b - a > 0.3) {
          k.box(root, rail, b - a, 0.06, 0.06, (a + b) / 2, 0.87, z);
          for (const x of [a + 0.1, b - 0.1]) k.box(root, rail, 0.04, 0.04, 0.06, x, 0.86, z + Math.sign(z) * 0.02);
        }
        cur = c + w / 2 + 0.12;
      }
    };
    run(-1.36, [
      [-8.5, 1.3],
      [-1.5, 1.3],
      [3, 1.3],
      [8, 1.1],
      [12, 1.1],
    ]);
    run(1.36, [
      [-12.5, 1.3],
      [-9.1, 1.7],
      [-5.5, 1.3],
      [3.5, 4],
      [7.4, 1.7],
      [10.5, 2.2],
    ]);
  }
  // banco fixo
  const bench = (p: THREE.Object3D, x: number, z: number, ry = 0): THREE.Group => {
    const g = k.group(p, x, 0, z, ry);
    k.box(g, k.lam('#ff9a6a'), 1.6, 0.08, 0.42, 0, 0.42, 0);
    k.box(g, k.lam('#ff9a6a'), 1.6, 0.4, 0.06, 0, 0.55, 0.19);
    for (const s of [-1, 1]) k.box(g, M.dark, 0.06, 0.42, 0.38, s * 0.7, 0, 0);
    return g;
  };
  bench(root, -9.1, 1.18, Math.PI);
  k.col(-9.95, 0.95, -8.25, 1.45, 0, 0.9);
  {
    const b = bench(root, 7.4, 1.18, Math.PI);
    const e = bench(root, 7.4, -1.18, 0);
    k.slot('bench', 'corr', b, { kinds: ['move', 'missing', 'extra', 'rotate', 'color'], move: [[0, -1.0, 0.3], [-1.5, -0.6, 1.2]], extra: [e], h: 0.95 });
    k.col(6.55, 0.95, 8.25, 1.45, 0, 0.9);
  }
  // cadeira de rodas
  {
    const g = k.group(root, -3.6, 0, -1.0, 0.2);
    const blue = k.lam('#3f6bff');
    k.box(g, blue, 0.46, 0.06, 0.44, 0, 0.48, 0);
    k.box(g, blue, 0.46, 0.5, 0.05, 0, 0.52, 0.22);
    for (const s of [-1, 1]) {
      const w = k.cyl(g, M.dark, 0.3, 0.3, 0.04, s * 0.28, 0.0, 0.05, 16);
      w.rotation.z = Math.PI / 2;
      w.position.y = 0.3;
      const ww = k.cyl(g, M.metal, 0.24, 0.24, 0.045, s * 0.28, 0, 0.05, 14);
      ww.rotation.z = Math.PI / 2;
      ww.position.y = 0.3;
      k.cyl(g, M.dark, 0.05, 0.05, 0.04, s * 0.18, 0.0, -0.28, 8).rotation.z = Math.PI / 2;
      k.box(g, M.metal, 0.03, 0.03, 0.36, s * 0.22, 0.9, 0.3);
    }
    k.slot('wheel', 'corr', g, { kinds: ['move', 'rotate', 'missing', 'color'], move: [[2.4, 1.6, 2.2], [-3.0, 1.2, -1.4]], colors: ['#ff4f6a', '#ffcf2e', '#45d16b'], h: 1.0 });
  }
  // maca
  {
    const g = k.group(root, -10.6, 0, -0.98);
    k.box(g, M.white, 1.9, 0.12, 0.62, 0, 0.72, 0);
    k.box(g, M.metal, 1.9, 0.05, 0.6, 0, 0.62, 0);
    k.sph(g, M.white, 0.25, -0.75, 0.86, 0, 1, 0.3, 1.1, 10);
    for (const [lx, lz] of [
      [-0.85, -0.25],
      [0.85, -0.25],
      [-0.85, 0.25],
      [0.85, 0.25],
    ]) {
      k.cyl(g, M.metal, 0.02, 0.02, 0.62, lx, 0, lz, 6);
      k.sph(g, M.dark, 0.05, lx, 0.05, lz, 1, 1, 1, 6);
    }
    const sheet = k.box(g, k.lam('#9be3a5'), 1.3, 0.04, 0.64, 0.25, 0.83, 0);
    sheet.userData.paint = true;
    k.slot('gurney', 'corr', g, { kinds: ['move', 'rotate', 'missing', 'color'], move: [[3.2, 1.0, 0.4], [6.5, 1.1, Math.PI / 2]], h: 0.9 });
  }
  // extintor
  {
    const g = k.group(root, 5.7, 1.0, -1.28);
    const body = k.cyl(g, M.red, 0.09, 0.09, 0.48, 0, 0, 0, 12);
    body.userData.paint = true;
    k.sph(g, M.red, 0.09, 0, 0.48, 0, 1, 0.6, 1, 10).userData.paint = true;
    k.box(g, M.dark, 0.05, 0.08, 0.05, 0, 0.53, 0);
    k.box(g, M.dark, 0.16, 0.03, 0.03, 0.06, 0.6, 0);
    k.box(root, k.lam('#ffffff'), 0.32, 0.72, 0.02, 5.7, 0.98, -1.392);
    k.slot('fire', 'corr', g, { kinds: ['color', 'missing', 'scale'], colors: ['#45d16b', '#3f6bff', '#ff9a2e'] });
  }
  // saída (placa verde no fim do corredor)
  {
    const mk = (v: number) => {
      const [c, x] = cv(128, 64);
      x.fillStyle = v === 1 ? '#ff2d55' : '#1fbf5f';
      x.fillRect(0, 0, 128, 64);
      x.fillStyle = '#fff';
      x.font = '44px "Noto Color Emoji", sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      if (v === 3) {
        x.fillStyle = '#1a0420';
        x.fillRect(0, 0, 128, 64);
        x.fillStyle = '#ffe14a';
        x.beginPath();
        x.ellipse(44, 32, 14, 9, 0, 0, Math.PI * 2);
        x.ellipse(84, 32, 14, 9, 0, 0, Math.PI * 2);
        x.fill();
      } else x.fillText(v === 2 ? '⬅️' : '🏃', 40, 34);
      if (v !== 3) {
        x.beginPath();
        x.moveTo(v === 2 ? 108 : 78, 20);
        x.lineTo(v === 2 ? 78 : 108, 32);
        x.lineTo(v === 2 ? 108 : 78, 44);
        x.fill();
      }
      return k.keep(tex(c));
    };
    const texs = [0, 1, 2, 3].map(mk);
    const g = k.group(root, 13.88, 2.55, 0, -Math.PI / 2);
    k.box(g, M.dark, 0.66, 0.36, 0.06, 0, -0.18, -0.03);
    const mesh = k.plane(g, k.own(texs[0], true), 0.6, 0.3, 0, 0, 0.005);
    k.slot('exit', 'corr', g, { kinds: ['picture'], pic: { mesh, tex: texs } });
  }
  {
    const p1 = picture(root, 'boat', -5.0, 2.0, -1.38, 0);
    k.slot('pic_cor1', 'corr', p1.g, { kinds: ['picture', 'missing', 'rotate'], pic: p1, h: 0.8 });
    const p2 = picture(root, 'flower', -9.1, 2.1, 1.38, Math.PI);
    k.slot('pic_cor2', 'corr', p2.g, { kinds: ['picture', 'missing'], pic: p2 });
    const p3 = picture(root, 'bloop', 10.0, 2.0, -1.38, 0, 0.7, 0.7);
    k.slot('pic_cor3', 'corr', p3.g, { kinds: ['picture', 'rotate', 'scale'], pic: p3, h: 0.8 });
  }
  {
    const texs = [0, 1, 2].map((v) => k.keep(clockTex(v)));
    const g = k.group(root, -2.6, 2.35, 1.39, Math.PI);
    k.cyl(g, M.dark, 0.23, 0.23, 0.05, 0, -0.025, 0, 18).rotation.x = Math.PI / 2;
    const mesh = k.plane(g, k.own(texs[0]), 0.4, 0.4, 0, 0, 0.03);
    k.slot('clock_cor', 'corr', g, { kinds: ['picture', 'missing', 'scale'], pic: { mesh, tex: texs } });
  }
  {
    // placa de piso molhado
    const mk = (p: THREE.Object3D, x: number, z: number, ry: number) => {
      const g = k.group(p, x, 0, z, ry);
      for (const s of [-1, 1]) {
        const b = k.box(g, M.yellow, 0.42, 0.64, 0.03, 0, 0, s * 0.11);
        b.rotation.x = s * 0.33;
        b.position.y = 0.3;
        b.userData.paint = true;
      }
      for (const s2 of [-1, 1]) {
        const pl = k.plane(g, k.lam('#ffffff', k.keep(signTex('💧', '#ffcf2e')), 'wet' + s2), 0.3, 0.15, 0, 0.4, s2 * 0.145, s2 > 0 ? 0 : Math.PI);
        pl.rotation.x = s2 * -0.33;
      }
      return g;
    };
    const g = mk(root, 9.6, 0.35, 1.25);
    const e = mk(root, 4.6, -0.6, 1.9);
    k.slot('wetsign', 'corr', g, { kinds: ['move', 'extra', 'rotate', 'missing', 'color'], move: [[-3.6, -0.6, 1], [2.4, -0.4, 0]], extra: [e], h: 0.66 });
  }
  {
    const p = plant(root, 13.5, 1.0, 1.1);
    const sw = plant(root, 13.5, 1.0, 1.1, true);
    k.slot('plant_cor', 'corr', p, { kinds: ['swap', 'move', 'scale', 'missing'], swap: sw, move: [[-1.8, -2.0], [-6.4, -0.6]] });
    k.col(13.25, 0.75, 13.75, 1.25, 0, 1);
  }
  // álcool em gel + lixeiras
  for (const x of [-11, 1.5, 9.5]) {
    k.box(root, k.lam('#ffffff'), 0.12, 0.2, 0.08, x, 1.1, -1.36);
    k.box(root, k.lam('#3fa7ff'), 0.06, 0.04, 0.03, x, 1.16, -1.31);
  }
  bin(root, -6.6, -1.2);
  bin(root, 5.9, 1.2);
  k.col(-6.78, -1.38, -6.42, -1.02, 0, 0.4);
  k.col(5.72, 1.02, 6.08, 1.38, 0, 0.4);

  /* ============================== QUARTOS DE PACIENTE ============================== */
  const blankets = ['#7ab8ff', '#ff9ec2', '#9be3a5', '#ffd27a'];
  const bodies = ['#7ad0ff', '#ff8fd8', '#9cf27a', '#ffb36b'];
  const pics: PicKind[] = ['land', 'boat', 'flower', 'bloop'];
  const keycap = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'];
  const patient = (i: number, id: string, cx: number, north: boolean) => {
    const R = new THREE.Group();
    R.position.set(cx, 0, north ? -1.5 : 1.5);
    R.rotation.y = north ? 0 : Math.PI;
    root.add(R);
    R.updateMatrixWorld(true);
    const W = (x: number, y: number, z: number) => k.w(R, x, y, z);
    const C = (x0: number, z0: number, x1: number, z1: number, y1 = 1.2) => k.colIn(R, x0, z0, x1, z1, 0, y1);
    const num = i + 1;
    room(id, t('ano.h.room', 'Quarto {n}', { n: num }), keycap[i], Math.min(W(-3.5, 0, 0).x, W(3.5, 0, -6).x), Math.min(W(0, 0, 0).z, W(0, 0, -6).z), Math.max(W(-3.5, 0, 0).x, W(3.5, 0, -6).x), Math.max(W(0, 0, 0).z, W(0, 0, -6).z), [
      { pos: W(0.4, 2.6, -0.25), look: W(-0.9, 0.55, -5) },
      { pos: W(-3.1, 2.55, -5.6), look: W(1.6, 0.9, -1.5) },
    ]);
    const lamp = k.lamp(id, W(0, 0, -3).x, W(0, 0, -3).z, 1.2, 0.45, H);
    lampsByRoom.set(id, [lamp]);
    k.slot(id + '_lamp', id, lamp.group, { kinds: ['light'], lamp, variants: 4, anchor: W(0, 2.9, -3) });
    // --- cama ---
    const bx = -1.0;
    const bedTop = 0.6;
    k.box(R, M.metal, 1.06, 0.12, 2.1, bx, 0.3, -4.85);
    for (const [lx, lz] of [
      [-0.47, -5.8],
      [0.47, -5.8],
      [-0.47, -3.9],
      [0.47, -3.9],
    ]) {
      k.cyl(R, M.metal, 0.03, 0.03, 0.32, bx + lx, 0, lz, 6);
      k.sph(R, M.dark, 0.045, bx + lx, 0.045, lz, 1, 1, 1, 6);
    }
    k.box(R, M.white, 1.0, 0.16, 2.0, bx, 0.43, -4.85);
    k.box(R, k.lam('#9aa6c4'), 1.12, 0.78, 0.07, bx, 0.3, -5.88);
    k.box(R, k.lam('#9aa6c4'), 1.12, 0.45, 0.06, bx, 0.3, -3.82);
    k.sph(R, M.white, 0.3, bx, bedTop + 0.07, -5.55, 1.05, 0.26, 0.6, 10);
    const bl = k.lam(blankets[i]);
    k.box(R, bl, 1.1, 0.1, 1.38, bx, bedTop - 0.04, -4.4);
    for (const s of [-1, 1]) k.box(R, bl, 0.03, 0.34, 1.38, bx + s * 0.55, bedTop - 0.33, -4.4);
    k.box(R, M.white, 1.12, 0.04, 0.22, bx, bedTop + 0.04, -5.0);
    C(bx - 0.56, -5.95, bx + 0.56, -3.76, 1.1);
    npcSpots.push({ id: 'p' + num, room: id, pos: W(bx, bedTop, -5.15), yaw: R.rotation.y + Math.PI, pose: 'lie', color: bodies[i], scale: 0.9, hat: i === 1 ? 'bow' : i === 3 ? 'beanie' : '' });
    k.slot('npc_p' + num, id, k.group(R, bx, 1, -5.1), { kinds: ['face', 'move', 'color', 'scale', 'missing'], npc: 'p' + num, variants: 4 });
    // prontuário (tarefa do remédio)
    const chart = k.group(R, bx, 0.58, -3.77);
    k.box(chart, k.lam('#c98b52'), 0.26, 0.34, 0.02, 0, 0, 0);
    k.box(chart, M.white, 0.22, 0.26, 0.022, 0, 0.02, 0.002);
    k.box(chart, M.metal, 0.1, 0.04, 0.03, 0, 0.32, 0);
    const opts = [ITEMS[i % 5].id, ITEMS[(i + 2) % 5].id, ITEMS[(i + 4) % 5].id];
    interacts.push({ id: id + '_med', room: id, kind: 'medicine', object: chart, at: W(bx, 0, -3.2), icon: '💊', wants: opts });
    // --- mesinha + jarra (tarefa da água) ---
    k.box(R, M.woodL, 0.5, 0.62, 0.45, 0.2, 0, -5.45);
    k.box(R, M.wood, 0.42, 0.02, 0.01, 0.2, 0.42, -5.22);
    C(-0.05, -5.68, 0.45, -5.22, 0.7);
    const jug = k.group(R, 0.12, 0.62, -5.45);
    const jm = k.cyl(jug, k.lam('#a8dcff'), 0.065, 0.075, 0.22, 0, 0, 0, 10);
    k.cyl(jug, k.lam('#ffffff'), 0.05, 0.05, 0.03, 0, 0.22, 0, 10);
    k.box(jug, k.lam('#a8dcff'), 0.02, 0.12, 0.04, 0.08, 0.06, 0);
    k.cyl(jug, k.lam('#ffffff'), 0.035, 0.03, 0.09, 0.15, 0, 0.06, 8);
    jm.userData.water = true;
    const fill = k.cyl(jug, k.lam('#3fa7ff'), 0.06, 0.07, 0.04, 0, 0.005, 0, 10);
    interacts.push({
      id: id + '_water',
      room: id,
      kind: 'water',
      object: jug,
      at: W(0.2, 0, -4.7),
      icon: '💧',
      holdSec: 2.2,
      setState: (s) => {
        fill.scale.y = s === 'done' ? 4.5 : 1;
        fill.position.y = s === 'done' ? 0.08 : 0.005;
      },
    });
    // --- monitor cardíaco (tarefa) ---
    k.cyl(R, M.dark, 0.2, 0.22, 0.04, -2.3, 0, -5.4, 10);
    k.cyl(R, M.metal, 0.025, 0.025, 1.2, -2.3, 0.04, -5.4, 6);
    const mon = screen(R, 'ecg', -2.3, 1.62, -5.35, 0.55, 0.36, 0.26);
    C(-2.55, -5.65, -2.05, -5.15, 1.5);
    interacts.push({ id: id + '_mon', room: id, kind: 'monitor', object: mon.g, at: W(-1.9, 0, -4.5), icon: '💓', holdSec: 1.8 });
    // --- soro (IV) ---
    {
      const g = k.group(R, -1.85, 0, -4.3);
      for (let j = 0; j < 4; j++) k.box(g, M.dark, 0.3, 0.025, 0.04, 0, 0.02, 0, (j * Math.PI) / 4);
      k.cyl(g, M.metal, 0.018, 0.018, 1.85, 0, 0.02, 0, 6);
      k.box(g, M.metal, 0.3, 0.02, 0.02, 0, 1.85, 0);
      const bag = k.box(g, k.lam('#bfe8ff'), 0.16, 0.26, 0.05, 0.12, 1.5, 0);
      bag.userData.paint = true;
      k.cyl(g, k.lam('#e8f6ff'), 0.006, 0.006, 0.8, 0.12, 0.7, 0, 4);
      k.slot(id + '_iv', id, g, { kinds: ['move', 'missing', 'color'], move: [[2.6, 2.2, 0.5], [3.4, -0.8, 0]], colors: ['#ff4f6a', '#45d16b', '#ffcf2e'] });
    }
    // --- cortina (aberta, junto à parede) ---
    {
      k.box(R, M.metal, 3.4, 0.04, 0.04, -1.2, 2.62, -3.42);
      const g = k.group(R, -2.75, 0, -3.42);
      const cm = k.lam(['#bfe3d9', '#d9c7f2', '#ffe0b8', '#c7e0ff'][i]);
      for (let j = 0; j < 5; j++) {
        const b = k.box(g, cm, 0.18, 2.0, 0.05, -0.28 + j * 0.15, 0.55, (j % 2) * 0.07);
        b.rotation.y = j % 2 ? 0.6 : -0.6;
      }
      k.slot(id + '_cur', id, g, { kinds: ['move', 'color', 'missing'], move: [[1.55, 0], [2.4, 0]], colors: ['#ff4f6a', '#2a2a3a', '#ffcf2e'] });
    }
    // --- cadeira de visita + ursinho ---
    {
      const c = chair(R, 1.75, -3.7, -Math.PI / 2 - 0.4, k.lam('#4fb3c9'));
      k.slot(id + '_chair', id, c, { kinds: ['move', 'rotate', 'missing'], move: [[-0.8, 1.7, 1.6], [1.0, -1.6, 3.1]], h: 1.0 });
      C(1.5, -3.95, 2.0, -3.45, 0.9);
      const td = teddy(R, 1.75, 0.46, -3.7, -Math.PI / 2 - 0.4, ['#b5835a', '#e7a6c8', '#d8b26a', '#9ec7e8'][i]);
      const tdExtra = teddy(R, bx + 0.3, bedTop + 0.06, -3.95, Math.PI + 0.3, ['#b5835a', '#e7a6c8', '#d8b26a', '#9ec7e8'][i]);
      const tdSwap = plushBocudo(R, 1.75, 0.46, -3.7, -Math.PI / 2 - 0.4);
      k.slot(id + '_teddy', id, td, { kinds: ['move', 'extra', 'swap', 'scale'], move: [[-2.4, -0.25, 0], [-0.5, 2.6, 1]], extra: [tdExtra], swap: tdSwap });
    }
    // --- janela ---
    {
      const g = k.group(R, 1.75, 1.6, -5.885);
      const texs = [0, 1, 2, 3].map((v) => k.keep(windowTex(v)));
      k.box(g, M.frame, 1.3, 1.25, 0.06, 0, -0.62, -0.02);
      const mesh = k.plane(g, k.own(texs[0], true), 1.16, 1.1, 0, 0, 0.015);
      k.box(g, M.white, 1.36, 0.06, 0.16, 0, -0.62, 0.05);
      k.slot(id + '_win', id, g, { kinds: ['picture', 'creature'], pic: { mesh, tex: texs }, anchor: W(1.75, 1.6, -5.8) });
    }
    // --- quadro na parede esquerda ---
    {
      const p = picture(R, pics[i], -3.38, 1.85, -2.6, Math.PI / 2);
      k.slot(id + '_pic', id, p.g, { kinds: ['picture', 'rotate', 'missing'], pic: p, h: 0.8 });
    }
    // --- armário ---
    k.box(R, M.woodL, 0.6, 1.95, 1.1, 3.05, 0, -2.6);
    k.box(R, M.wood, 0.01, 1.8, 0.02, 2.745, 0.08, -2.6);
    for (const s of [-1, 1]) k.box(R, M.dark, 0.03, 0.18, 0.03, 2.74, 1.0, -2.6 + s * 0.1);
    C(2.75, -3.15, 3.4, -2.05, 2);
    // --- interruptor (tarefa: apagar a luz) ---
    {
      const sw = k.group(R, 2.98, 1.2, -0.11);
      k.box(sw, k.lam('#ffffff'), 0.09, 0.13, 0.02, 0, 0, 0);
      const tog = k.box(sw, k.lam('#ffcf2e'), 0.03, 0.05, 0.025, 0, 0.0, -0.012);
      interacts.push({
        id: id + '_lights',
        room: id,
        kind: 'lights',
        object: sw,
        at: W(2.85, 0, -0.75),
        icon: '💡',
        setState: (s) => {
          if (s === 'done') {
            lamp.user = false;
            k.refreshLamp(lamp);
            tog.rotation.x = 0.6;
          }
        },
      });
    }
    // --- item especial de cada quarto ---
    if (i === 0) {
      // balões presos na mesinha
      const g = k.group(R, 0.35, 0.62, -5.45);
      const cols = ['#ff4f6a', '#ffcf2e', '#4d7bff'];
      cols.forEach((c, j) => {
        const b = k.sph(g, k.lam(c), 0.14, -0.12 + j * 0.13, 1.25 + (j % 2) * 0.12, 0.05 * j, 1, 1.2, 1, 10);
        b.userData.paint = true;
        k.cyl(g, k.lam('#ffffff'), 0.003, 0.003, 1.1, -0.06 + j * 0.06, 0, 0, 3).rotation.z = (j - 1) * 0.1;
      });
      k.slot(id + '_balloon', id, g, { kinds: ['color', 'missing', 'move', 'scale'], move: [[1.8, 2.0], [-2.6, 1.8]], colors: ['#2a2a3a', '#45d16b', '#ff9a2e'] });
    } else if (i === 1) {
      const s = screen(R, 'tv', 3.39, 2.15, -4.4, -Math.PI / 2, 0.8, 0.5);
      k.slot(id + '_tv', id, s.g, { kinds: ['picture', 'sound', 'missing'], pic: s });
    } else if (i === 2) {
      // vaso de flores na mesinha
      const g = k.group(R, 0.3, 0.62, -5.35);
      k.cyl(g, k.lam('#7fd0ff'), 0.06, 0.05, 0.18, 0, 0, 0, 10);
      const fcol = ['#ff5c9a', '#ffcf2e', '#ffffff'];
      for (let j = 0; j < 3; j++) {
        k.cyl(g, M.leaf, 0.006, 0.006, 0.25, -0.03 + j * 0.03, 0.15, 0, 3);
        const f = k.sph(g, k.lam(fcol[j]), 0.045, -0.04 + j * 0.04, 0.42 + (j % 2) * 0.04, 0, 1, 0.8, 1, 8);
        f.userData.paint = true;
      }
      const e = k.group(R, 1.75, 0.46, -3.75);
      k.cyl(e, k.lam('#7fd0ff'), 0.06, 0.05, 0.18, 0, 0, 0, 10);
      k.sph(e, k.lam('#ff5c9a'), 0.05, 0, 0.3, 0, 1, 0.8, 1, 8);
      k.slot(id + '_flowers', id, g, { kinds: ['color', 'missing', 'extra'], colors: ['#2a2a3a', '#4d7bff', '#45d16b'], extra: [e] });
    } else {
      // patinho de borracha no peitoril
      const g = k.group(R, 1.2, 1.0, -5.8);
      const y = k.lam('#ffd34a');
      k.sph(g, y, 0.09, 0, 0.07, 0, 1.2, 0.8, 1, 10);
      k.sph(g, y, 0.06, 0.06, 0.16, 0, 1, 1, 1, 10);
      k.box(g, k.lam('#ff9a2e'), 0.05, 0.02, 0.04, 0.12, 0.15, 0);
      g.children.forEach((c) => (c.userData.paint = true));
      k.slot(id + '_duck', id, g, { kinds: ['color', 'scale', 'move', 'missing'], move: [[-2.2, 1.0], [0.4, 1.8]], colors: ['#ff4f6a', '#2a2a3a', '#45d16b'] });
    }
    bin(R, -3.0, -0.6);
    C(-3.18, -0.78, -2.82, -0.42, 0.4);
    // porta do quarto (anomalia)
    const d = doors[id as 'q1' | 'q2' | 'q3' | 'q4'];
    k.slot(id + '_door', id, d.pivot, { kinds: ['door'], door: d, variants: 2, minNight: 2, anchor: W(2, 1.2, 0) });
  };
  patient(0, 'q1', -10.5, true);
  patient(1, 'q2', -3.5, true);
  patient(2, 'q3', -10.5, false);
  patient(3, 'q4', -3.5, false);

  /* ============================== FARMÁCIA ============================== */
  room('farm', t('ano.h.farm', 'Farmácia'), '💊', 0, -7.5, 6, -1.5, [{ pos: v3(5.6, 2.55, -1.9), look: v3(2, 0.8, -6.6) }]);
  addLamp('farm', 3, -4.5);
  {
    // armário de remédios (fonte)
    const cx = 2.6;
    const cab = k.lam('#e6ebf5');
    k.box(root, k.lam('#c8d0e0'), 2.6, 2.0, 0.03, cx, 0, -7.37);
    for (const s of [-1, 1]) k.box(root, cab, 0.05, 2.0, 0.46, cx + s * 1.28, 0, -7.15);
    k.box(root, cab, 2.6, 0.06, 0.46, cx, 1.98, -7.15);
    k.box(root, cab, 2.6, 0.2, 0.46, cx, 0, -7.15);
    k.box(root, k.lam('#ff4f6a'), 0.5, 0.12, 0.02, cx, 2.1, -7.13);
    k.box(root, k.lam('#ffffff'), 0.14, 0.05, 0.025, cx, 2.135, -7.12);
    k.box(root, k.lam('#ffffff'), 0.05, 0.1, 0.025, cx, 2.11, -7.115);
    const labels = ITEMS.map((it) => {
      const [c, x] = cv(64, 64);
      x.fillStyle = '#ffffff';
      x.fillRect(0, 0, 64, 64);
      drawItem(x, it, 32, 32, 24);
      return k.lam('#ffffff', k.keep(tex(c)), 'lbl' + it.id);
    });
    for (let row = 0; row < 3; row++) {
      const y = 0.25 + row * 0.6;
      k.box(root, M.white, 2.46, 0.03, 0.4, cx, y, -7.12);
      ITEMS.forEach((it, j) => {
        for (let q = 0; q < 2; q++) {
          const bxp = cx - 1.05 + j * 0.5 + q * 0.18;
          k.cyl(root, k.lam(it.color), 0.06, 0.06, 0.2, bxp, y + 0.03, -7.05, 10);
          k.cyl(root, M.white, 0.035, 0.035, 0.05, bxp, y + 0.23, -7.05, 8);
          k.plane(root, labels[j], 0.09, 0.09, bxp, y + 0.13, -6.985);
        }
      });
    }
    k.col(cx - 1.3, -7.4, cx + 1.3, -6.9, 0, 2);
    const anchor = k.group(root, cx, 1.0, -6.95);
    interacts.push({ id: 'pharmacy', room: 'farm', kind: 'pharmacy', object: anchor, at: v3(cx, 0, -6.2), icon: '💊', gives: ITEMS.map((x) => x.id) });
  }
  {
    // bancada + balança
    k.box(root, M.woodL, 0.7, 0.95, 2.2, 0.75, 0, -4.4);
    k.col(0.38, -5.52, 1.12, -3.28, 0, 1);
    const g = k.group(root, 0.75, 0.95, -3.7);
    k.box(g, k.lam('#ffffff'), 0.3, 0.06, 0.24, 0, 0, 0);
    k.cyl(g, M.metal, 0.12, 0.12, 0.02, 0, 0.06, 0, 14);
    k.box(g, k.basic('#7dffb0'), 0.1, 0.035, 0.005, 0, 0.012, -0.123);
    k.slot('balanca', 'farm', g, { kinds: ['move', 'scale', 'missing', 'color'], move: [[0, -1.2], [1.8, -0.4]] });
    const pills = k.group(root, 0.75, 0.95, -4.8);
    const pc = k.cyl(pills, k.lam('#ff8fb0'), 0.08, 0.08, 0.16, 0, 0, 0, 12);
    pc.userData.paint = true;
    k.cyl(pills, M.white, 0.085, 0.085, 0.04, 0, 0.16, 0, 12);
    const pe = k.group(root, 0.75, 0.95, -5.15);
    k.cyl(pe, k.lam('#ff8fb0'), 0.08, 0.08, 0.16, 0, 0, 0, 12);
    k.cyl(pe, M.white, 0.085, 0.085, 0.04, 0, 0.16, 0, 12);
    k.slot('pills', 'farm', pills, { kinds: ['color', 'extra', 'scale'], extra: [pe], colors: ['#45d16b', '#2a2a3a', '#ffcf2e'] });
  }
  {
    // geladeira (porta abre)
    const fx = 5.45,
      fz = -6.7;
    k.box(root, k.lam('#f2f4f8'), 0.8, 1.8, 0.7, fx, 0, fz, -Math.PI / 2);
    k.box(root, k.basic('#dff6ff'), 0.02, 1.5, 0.55, fx - 0.39, 0.15, fz);
    k.col(fx - 0.4, fz - 0.42, fx + 0.42, fz + 0.42, 0, 1.8);
    const door = k.group(root, fx - 0.41, 0, fz - 0.38);
    const dm = k.box(door, k.lam('#f8fafc'), 0.04, 1.76, 0.78, 0, 0.02, 0.38);
    dm.userData.paint = true;
    k.box(door, M.metal, 0.03, 0.4, 0.03, -0.03, 1.0, 0.7);
    k.box(door, M.dark, 0.005, 0.01, 0.76, -0.02, 1.25, 0.38);
    const s = k.slot('fridge', 'farm', door, { kinds: ['door', 'color'], variants: 2, colors: ['#ff8fb0', '#7ad0ff'] });
    const base = s.apply;
    s.apply = (kind, on, v) => {
      if (kind === 'door') door.rotation.y = on ? (v % 2 ? -1.9 : -1.1) : 0;
      else base(kind, on, v);
    };
  }
  {
    const g = k.group(root, 5.89, 1.6, -3.3, -Math.PI / 2);
    const texs = [0, 1].map((v) => k.keep(posterTex('hands', v)));
    const mesh = k.plane(g, k.own(texs[0]), 0.5, 0.66, 0, 0, 0);
    k.slot('poster_farm', 'farm', g, { kinds: ['picture', 'missing', 'rotate'], pic: { mesh, tex: texs }, variants: 1, h: 0.01 });
  }
  {
    // prateleira de potes (parede oeste)
    k.box(root, M.woodL, 0.32, 0.04, 1.6, 0.27, 1.5, -6.0);
    const g = k.group(root, 0.27, 1.54, -6.0);
    const jc = ['#ffcf2e', '#7ad0ff', '#ff8fb0', '#9cf27a'];
    jc.forEach((c, j) => {
      const m = k.cyl(g, k.lam(c), 0.07, 0.07, 0.18, 0, 0, -0.55 + j * 0.36, 10);
      m.userData.paint = true;
      k.cyl(g, M.white, 0.072, 0.072, 0.03, 0, 0.18, -0.55 + j * 0.36, 10);
    });
    const e = k.group(root, 0.27, 1.54, -6.0);
    k.cyl(e, k.lam('#ff4f6a'), 0.07, 0.07, 0.18, 0, 0, -0.37, 10);
    k.cyl(e, k.lam('#ff4f6a'), 0.07, 0.07, 0.18, 0, 0, 0.17, 10);
    k.slot('jars', 'farm', g, { kinds: ['extra', 'color', 'missing'], extra: [e], colors: ['#2a2a3a', '#ff4f6a', '#ffffff'] });
  }

  /* ============================== BANHEIRO ============================== */
  room('banh', t('ano.h.banh', 'Banheiro'), '🚻', 6, -7.5, 10, -1.5, [{ pos: v3(9.7, 2.5, -1.9), look: v3(6.6, 0.9, -5.6) }]);
  const bathLamp = addLamp('banh', 8, -4.2, 0.9, 0.4);
  k.slot('lamp_banh', 'banh', bathLamp.group, { kinds: ['light'], lamp: bathLamp, variants: 4, anchor: v3(8, 2.9, -4.2) });
  {
    // pia
    k.box(root, k.lam('#e8ecf4'), 0.55, 0.85, 1.1, 6.38, 0, -4.4);
    k.box(root, M.white, 0.6, 0.05, 1.16, 6.4, 0.85, -4.4);
    k.cyl(root, k.lam('#cfe0f0'), 0.2, 0.16, 0.05, 6.42, 0.87, -4.4, 14);
    k.cyl(root, M.metal, 0.02, 0.02, 0.2, 6.2, 0.9, -4.4, 6);
    k.box(root, M.metal, 0.16, 0.02, 0.02, 6.27, 1.09, -4.4);
    k.col(6.1, -4.98, 6.7, -3.82, 0, 0.9);
    const g = k.group(root, 6.115, 1.75, -4.4, Math.PI / 2);
    const texs = [0, 1, 2, 3].map((v) => k.keep(mirrorTex(v)));
    k.box(g, M.metal, 0.76, 0.96, 0.03, 0, -0.48, -0.01);
    const mesh = k.plane(g, k.own(texs[0], true), 0.7, 0.9, 0, 0, 0.008);
    k.slot('mirror', 'banh', g, { kinds: ['picture'], pic: { mesh, tex: texs } });
    const soap = k.group(root, 6.3, 0.9, -4.85);
    const sb = k.box(soap, k.lam('#ff8fb0'), 0.09, 0.16, 0.07, 0, 0, 0);
    sb.userData.paint = true;
    k.cyl(soap, M.white, 0.012, 0.012, 0.06, 0, 0.16, 0, 6);
    const soapSwap = k.group(root, 6.3, 0.9, -4.85);
    k.sph(soapSwap, k.lam('#ffd34a'), 0.06, 0, 0.06, 0, 1.2, 0.8, 1, 10);
    k.sph(soapSwap, k.lam('#ffd34a'), 0.04, 0.05, 0.12, 0, 1, 1, 1, 8);
    k.slot('soap', 'banh', soap, { kinds: ['color', 'swap', 'missing'], swap: soapSwap, colors: ['#45d16b', '#4d7bff', '#2a2a3a'] });
  }
  {
    // cabine
    const pm = k.lam('#b9a3e8');
    k.box(root, pm, 0.05, 2.0, 1.8, 8.3, 0.12, -6.6);
    k.box(root, pm, 0.6, 2.0, 0.05, 8.6, 0.12, -5.7);
    k.box(root, pm, 0.15, 2.0, 0.05, 9.85, 0.12, -5.7);
    k.col(8.27, -7.45, 8.33, -5.7, 0, 2.1);
    k.col(8.3, -5.73, 8.9, -5.67, 0, 2.1);
    k.col(9.77, -5.73, 9.93, -5.67, 0, 2.1);
    k.box(root, pm, 1.62, 0.06, 0.06, 9.1, 2.1, -5.7);
    const door = k.group(root, 8.9, 0.12, -5.7);
    k.box(door, k.lam('#8a6ad8'), 0.86, 1.95, 0.04, 0.43, 0, 0);
    k.box(door, M.metal, 0.06, 0.03, 0.06, 0.78, 1.0, 0.03);
    door.rotation.y = 0.9;
    const dcol = { min: { x: 8.9, y: 0, z: -5.75 }, max: { x: 9.78, y: 2, z: -5.65 } };
    const s = k.slot('stall', 'banh', door, { kinds: ['door', 'color'], variants: 2, colors: ['#ff4f6a', '#2a2a3a'] });
    const base = s.apply;
    s.apply = (kind, on, v) => {
      if (kind !== 'door') return base(kind, on, v);
      door.rotation.y = on ? (v % 2 ? 1.6 : 0) : 0.9;
      const i = k.colliders.indexOf(dcol);
      if (on && v % 2 === 0 && i < 0) k.colliders.push(dcol);
      if ((!on || v % 2) && i >= 0) k.colliders.splice(i, 1);
    };
    // vaso
    k.box(root, M.white, 0.42, 0.42, 0.22, 9.1, 0, -7.28);
    k.cyl(root, M.white, 0.2, 0.16, 0.4, 9.1, 0, -6.95, 12);
    k.cyl(root, k.lam('#e8ecf4'), 0.22, 0.22, 0.04, 9.1, 0.4, -6.95, 12);
    k.col(8.85, -7.4, 9.35, -6.7, 0, 0.5);
    const tp = k.group(root, 9.85, 0.75, -6.5, -Math.PI / 2);
    const roll = k.cyl(tp, M.white, 0.06, 0.06, 0.11, 0, 0, 0.0, 10);
    roll.rotation.x = Math.PI / 2;
    roll.position.set(0, 0, 0.06);
    const tpE = k.group(root, 9.55, 0.42, -7.3);
    k.cyl(tpE, M.white, 0.06, 0.06, 0.11, 0, 0, 0, 10);
    k.cyl(tpE, M.white, 0.06, 0.06, 0.11, 0, 0.11, 0, 10);
    k.slot('tp', 'banh', tp, { kinds: ['extra', 'scale', 'missing'], extra: [tpE] });
  }
  {
    k.box(root, M.metal, 0.04, 0.03, 0.6, 9.88, 1.3, -3.0);
    const g = k.group(root, 9.85, 0.75, -3.0);
    const tw = k.box(g, k.lam('#7ad0ff'), 0.05, 0.6, 0.45, 0, 0, 0);
    tw.userData.paint = true;
    k.slot('towel', 'banh', g, { kinds: ['color', 'missing', 'move'], move: [[-1.4, -1.0, 0.5], [-3.2, -2.2, 1]], colors: ['#ff4f6a', '#2a2a3a', '#ffcf2e'] });
    bin(root, 7.0, -2.0);
  }
  {
    const sw = k.group(root, 8.75, 1.2, -1.61);
    k.box(sw, k.lam('#ffffff'), 0.09, 0.13, 0.02, 0, 0, 0);
    interacts.push({ id: 'banh_lights', room: 'banh', kind: 'lights', object: sw, at: v3(8.75, 0, -2.2), icon: '💡', setState: (s) => s === 'done' && ((bathLamp.user = false), k.refreshLamp(bathLamp)) });
  }

  /* ============================== ESTOQUE ============================== */
  room('estoq', t('ano.h.estoq', 'Estoque'), '📦', 10, -7.5, 14, -1.5, [{ pos: v3(10.3, 2.5, -1.9), look: v3(13, 0.8, -6.4) }]);
  const stLamp = addLamp('estoq', 12, -4.5, 0.8, 0.35);
  k.slot('lamp_estoq', 'estoq', stLamp.group, { kinds: ['light'], lamp: stLamp, variants: 4, anchor: v3(12, 2.9, -4.5) });
  {
    // prateleiras de metal (leste e fundo)
    const sm = k.lam('#8a96ac');
    for (const z of [-7.25, -5.6, -3.9]) for (const x of [13.35, 13.85]) k.box(root, sm, 0.04, 2.1, 0.04, x, 0, z);
    for (let s = 0; s < 4; s++) k.box(root, sm, 0.56, 0.03, 3.4, 13.6, 0.15 + s * 0.6, -5.58);
    k.col(13.3, -7.3, 13.9, -3.85, 0, 2.2);
    const boxC = ['#c9a06a', '#b98a54', '#d8b27a'];
    for (let s = 0; s < 4; s++)
      for (let j = 0; j < 3; j++) {
        if ((s === 1 && j === 1) || (s === 2 && j === 0)) continue;
        k.box(root, k.lam(boxC[(s + j) % 3]), 0.42, 0.34, 0.5 + ((s * j) % 2) * 0.2, 13.6, 0.18 + s * 0.6, -6.7 + j * 1.05);
      }
    const ba = k.group(root, 13.6, 0.78, -5.65);
    k.box(ba, k.lam('#c9a06a'), 0.42, 0.34, 0.55, 0, 0, 0).userData.paint = true;
    k.box(ba, k.lam('#e8d0a0'), 0.43, 0.04, 0.1, 0, 0.17, 0);
    const baE = k.group(root, 12.6, 0, -6.9);
    k.box(baE, k.lam('#c9a06a'), 0.5, 0.4, 0.5, 0, 0, 0);
    k.box(baE, k.lam('#c9a06a'), 0.42, 0.34, 0.42, 0.05, 0.4, 0, 0.3);
    k.slot('box_a', 'estoq', ba, { kinds: ['missing', 'extra', 'color', 'move'], extra: [baE], move: [[-1.4, 2.2, 0.6]], colors: ['#ff4f6a', '#4d7bff', '#45d16b'] });
    const bb = k.group(root, 13.6, 1.38, -6.7);
    k.box(bb, k.lam('#ffffff'), 0.4, 0.3, 0.45, 0, 0, 0).userData.paint = true;
    k.box(bb, M.red, 0.41, 0.08, 0.02, 0, 0.12, -0.225);
    k.slot('box_b', 'estoq', bb, { kinds: ['missing', 'color', 'rotate', 'scale'], colors: ['#2a2a3a', '#ffcf2e'] });
  }
  {
    const g = k.group(root, 10.6, 0, -2.25);
    const yb = k.cyl(g, M.yellow, 0.22, 0.18, 0.32, 0, 0, 0, 12);
    yb.userData.paint = true;
    k.cyl(g, k.lam('#6cc6ff'), 0.2, 0.2, 0.01, 0, 0.3, 0, 12);
    const st = k.cyl(g, M.brown, 0.015, 0.015, 1.4, 0.05, 0.15, 0, 6);
    st.rotation.z = -0.15;
    k.sph(g, k.lam('#e8e0d0'), 0.12, 0.0, 0.2, 0, 1, 0.6, 1, 8);
    k.slot('mop', 'estoq', g, { kinds: ['move', 'missing', 'rotate', 'color'], move: [[1.6, -3.0, 0.5], [-2.6, 2.4, 0]], colors: ['#ff4f6a', '#4d7bff'] });
  }
  {
    // canto escuro atrás da prateleira do fundo (o Bocudo pequeno espia; também barulhos)
    k.box(root, k.lam('#8a96ac'), 2.0, 0.03, 0.5, 11.4, 1.1, -7.2);
    k.box(root, k.lam('#8a96ac'), 2.0, 0.03, 0.5, 11.4, 0.4, -7.2);
    for (const x of [10.45, 12.35]) k.box(root, k.lam('#8a96ac'), 0.04, 1.6, 0.5, x, 0, -7.2);
    k.box(root, k.lam('#c9a06a'), 0.5, 0.5, 0.4, 11.0, 0.43, -7.2);
    k.box(root, k.lam('#d8b27a'), 0.6, 0.6, 0.4, 11.8, 0.43, -7.2);
    k.col(10.4, -7.45, 12.4, -6.95, 0, 1.6);
    k.slot('estoq_corner', 'estoq', k.group(root, 12.85, 0, -6.6), { kinds: ['creature', 'sound'], variants: 4, minNight: 3, anchor: v3(12.85, 0.5, -6.6) });
  }
  {
    const sw = k.group(root, 12.75, 1.2, -1.61);
    k.box(sw, k.lam('#ffffff'), 0.09, 0.13, 0.02, 0, 0, 0);
    interacts.push({ id: 'estoq_lights', room: 'estoq', kind: 'lights', object: sw, at: v3(12.75, 0, -2.2), icon: '💡', setState: (s) => s === 'done' && ((stLamp.user = false), k.refreshLamp(stLamp)) });
  }

  /* ============================== ENFERMAGEM ============================== */
  room('enf', t('ano.h.enf', 'Enfermagem'), '🩺', 0, 1.5, 7, 7.5, [{ pos: v3(6.6, 2.6, 1.95), look: v3(2.4, 0.9, 6.2) }]);
  addLamp('enf', 3.5, 4.4, 1.6, 0.5);
  {
    k.box(root, k.lam('#ff8fb0'), 4.0, 1.05, 0.45, 3.5, 0, 1.95);
    k.box(root, M.woodL, 4.2, 0.05, 0.6, 3.5, 1.05, 1.95);
    k.box(root, k.lam('#ffffff'), 3.8, 0.12, 0.02, 3.5, 0.7, 1.72);
    k.col(1.5, 1.7, 5.5, 2.2, 0, 1.1);
    // mesa
    k.box(root, M.wood, 3.0, 0.75, 0.8, 3.5, 0, 5.2);
    k.col(2.0, 4.8, 5.0, 5.6, 0, 0.8);
    const m1 = screen(root, 'cam', 2.9, 1.17, 5.35, Math.PI, 0.48, 0.32);
    k.box(m1.g, M.blackS, 0.06, 0.12, 0.06, 0, -0.44, -0.06);
    k.slot('mon_ns', 'enf', m1.g, { kinds: ['picture', 'missing'], pic: m1 });
    const m2 = screen(root, 'ecg', 4.1, 1.17, 5.35, Math.PI - 0.15, 0.48, 0.32);
    k.box(m2.g, M.blackS, 0.06, 0.12, 0.06, 0, -0.44, -0.06);
    k.box(root, M.blackS, 0.45, 0.02, 0.15, 3.5, 0.75, 5.0);
    const mug = k.group(root, 4.6, 0.75, 4.95);
    k.cyl(mug, k.lam('#ffffff'), 0.045, 0.04, 0.1, 0, 0, 0, 10).userData.paint = true;
    k.cyl(mug, k.lam('#6b3f1f'), 0.04, 0.04, 0.005, 0, 0.095, 0, 10);
    const mugE = k.group(root, 2.2, 0.75, 4.95);
    k.cyl(mugE, k.lam('#ffffff'), 0.045, 0.04, 0.1, 0, 0, 0, 10);
    const mugE2 = k.group(root, 3.1, 1.05, 1.9);
    k.cyl(mugE2, k.lam('#ffffff'), 0.045, 0.04, 0.1, 0, 0, 0, 10);
    k.slot('mug', 'enf', mug, { kinds: ['extra', 'color', 'move', 'scale'], extra: [mugE, mugE2], move: [[-1.2, -3.0], [0.6, 0.1]], colors: ['#ff4f6a', '#2a2a3a', '#45d16b'] });
    const ph = k.group(root, 2.3, 0.75, 5.1);
    k.box(ph, k.lam('#3f6bff'), 0.2, 0.06, 0.16, 0, 0, 0).userData.paint = true;
    k.box(ph, k.lam('#3f6bff'), 0.22, 0.05, 0.06, 0, 0.07, 0).userData.paint = true;
    k.slot('phone', 'enf', ph, { kinds: ['sound', 'color', 'move'], variants: 4, move: [[1.2, -3.1]], colors: ['#ff4f6a', '#ffcf2e'] });
    const oc = k.group(root, 3.5, 0, 4.4, Math.PI);
    k.cyl(oc, M.dark, 0.25, 0.25, 0.04, 0, 0.02, 0, 10);
    k.cyl(oc, M.metal, 0.03, 0.03, 0.4, 0, 0.04, 0, 6);
    k.box(oc, k.lam('#3f6bff'), 0.46, 0.08, 0.44, 0, 0.44, 0).userData.paint = true;
    k.box(oc, k.lam('#3f6bff'), 0.44, 0.5, 0.06, 0, 0.52, 0.2).userData.paint = true;
    k.slot('chair_ns', 'enf', oc, { kinds: ['move', 'rotate', 'color'], move: [[1.6, -1.6, 1.2], [-2.4, -0.6, 2.5]], h: 1.05 });
  }
  npcSpots.push({ id: 'nurse2', room: 'enf', pos: v3(2.0, 0, 3.2), yaw: 0.3, pose: 'stand', color: '#9cf2d0', hat: 'nurse' });
  k.slot('npc_nurse2', 'enf', k.group(root, 2.0, 1, 3.2), { kinds: ['face', 'move', 'color', 'scale'], npc: 'nurse2', variants: 4 });
  {
    const p = picture(root, 'kids', 3.5, 2.05, 7.38, Math.PI, 1.5, 0.9);
    k.slot('board', 'enf', p.g, { kinds: ['picture'], pic: p });
    // estante de pastas
    k.box(root, M.woodL, 0.35, 1.6, 1.4, 6.72, 0, 4.2);
    for (let s = 0; s < 3; s++) for (let j = 0; j < 5; j++) k.box(root, k.lam(['#ff8fb0', '#7ad0ff', '#ffd34a', '#9cf27a', '#c7b8ff'][(s + j) % 5]), 0.25, 0.32, 0.07, 6.6, 0.12 + s * 0.5, 3.7 + j * 0.2);
    k.col(6.54, 3.5, 6.9, 4.9, 0, 1.6);
    const pl = plant(root, 6.45, 7.0, 1.0);
    const plS = plant(root, 6.45, 7.0, 1.0, true);
    k.slot('plant_ns', 'enf', pl, { kinds: ['move', 'missing', 'swap', 'scale'], swap: plS, move: [[-1.4, -0.6], [-5.8, -1.0]] });
    k.col(6.2, 6.75, 6.7, 7.25, 0, 1);
    // carrinho de remédios
    const cart = k.group(root, 0.6, 0, 6.6);
    k.box(cart, k.lam('#7ad0ff'), 0.5, 0.75, 0.6, 0, 0.1, 0).userData.paint = true;
    k.box(cart, M.white, 0.54, 0.03, 0.64, 0, 0.85, 0);
    for (const [lx, lz] of [
      [-0.2, -0.25],
      [0.2, -0.25],
      [-0.2, 0.25],
      [0.2, 0.25],
    ])
      k.sph(cart, M.dark, 0.05, lx, 0.05, lz, 1, 1, 1, 6);
    for (let d = 0; d < 3; d++) k.box(cart, M.white, 0.4, 0.02, 0.01, 0, 0.3 + d * 0.2, -0.305);
    k.slot('cart', 'enf', cart, { kinds: ['move', 'color', 'rotate'], move: [[1.4, -1.2, 0.6], [5.3, -3.4, 1.4]], colors: ['#ff4f6a', '#ffcf2e'], h: 0.9 });
  }

  /* ============================== SALA DE ESPERA / BRINQUEDOS ============================== */
  room('espera', t('ano.h.espera', 'Sala de Espera'), '🧸', 7, 1.5, 14, 7.5, [
    { pos: v3(7.4, 2.6, 1.95), look: v3(12, 0.7, 6.2) },
    { pos: v3(13.6, 2.6, 7.1), look: v3(9, 0.7, 2.6) },
  ]);
  const esLamp1 = addLamp('espera', 9, 4.5, 1.2, 0.5);
  const esLamp2 = addLamp('espera', 12, 4.5, 1.2, 0.5);
  {
    const s = screen(root, 'tv', 13.89, 2.0, 4.4, -Math.PI / 2, 1.1, 0.66, 0.05);
    k.slot('tv_wait', 'espera', s.g, { kinds: ['picture', 'sound', 'missing'], pic: s });
    // mesinha redonda + cadeirinhas
    k.cyl(root, k.lam('#7ad0ff'), 0.6, 0.6, 0.05, 10.5, 0.48, 5.2, 18);
    k.cyl(root, M.dark, 0.05, 0.05, 0.48, 10.5, 0, 5.2, 8);
    k.col(9.95, 4.65, 11.05, 5.75, 0, 0.55);
    const kc = [k.lam('#ff8fb0'), k.lam('#ffd34a'), k.lam('#9cf27a')];
    [0, 2.1, 4.2].forEach((a, j) => {
      const g = new THREE.Group();
      g.position.set(10.5 + Math.cos(a) * 0.9, 0, 5.2 + Math.sin(a) * 0.9);
      g.rotation.y = -a - Math.PI / 2;
      root.add(g);
      k.box(g, kc[j], 0.36, 0.05, 0.34, 0, 0.3, 0);
      k.box(g, kc[j], 0.36, 0.34, 0.05, 0, 0.35, 0.16);
      for (const [lx, lz] of [
        [-0.15, -0.14],
        [0.15, -0.14],
        [-0.15, 0.14],
        [0.15, 0.14],
      ])
        k.cyl(g, M.dark, 0.018, 0.018, 0.3, lx, 0, lz, 5);
    });
    const blocks = k.group(root, 10.4, 0.53, 5.1);
    const bc = ['#ff4f6a', '#4d7bff', '#ffcf2e', '#45d16b'];
    k.box(blocks, k.lam(bc[0]), 0.14, 0.14, 0.14, -0.1, 0, 0);
    k.box(blocks, k.lam(bc[1]), 0.14, 0.14, 0.14, 0.06, 0, 0.02, 0.4);
    k.box(blocks, k.lam(bc[2]), 0.14, 0.14, 0.14, -0.02, 0.14, 0.01, 0.2);
    k.box(blocks, k.lam(bc[3]), 0.12, 0.12, 0.12, 0.25, 0, -0.15, 0.7);
    const be = k.group(root, 10.8, 0.53, 5.45);
    k.box(be, k.lam('#ff9a2e'), 0.14, 0.14, 0.14, 0, 0, 0);
    k.box(be, k.lam('#c7b8ff'), 0.14, 0.14, 0.14, 0, 0.14, 0, 0.5);
    k.slot('blocks', 'espera', blocks, { kinds: ['move', 'extra', 'rotate', 'color'], extra: [be], move: [[-0.8, 1.6], [2.4, -2.6]], h: 0.3 });
    // cavalinho de balanço
    const horse = k.group(root, 12.7, 0, 6.6, -0.6);
    const hm = k.lam('#ffffff');
    const hb = k.box(horse, hm, 0.7, 0.28, 0.24, 0, 0.42, 0);
    hb.userData.paint = true;
    const hh = k.box(horse, hm, 0.22, 0.34, 0.2, -0.38, 0.62, 0);
    hh.rotation.z = 0.4;
    hh.userData.paint = true;
    k.box(horse, k.lam('#ff5c9a'), 0.3, 0.06, 0.26, 0.05, 0.7, 0);
    const rk = k.cyl(horse, k.lam('#c8925e'), 0.6, 0.6, 0.06, 0, 0, 0, 18, );
    rk.scale.set(1, 1, 0.12);
    rk.rotation.x = Math.PI / 2;
    rk.position.set(0, 0.62, 0);
    rk.visible = false;
    for (const s of [-1, 1]) k.box(horse, k.lam('#c8925e'), 1.0, 0.05, 0.05, 0, 0.05, s * 0.12);
    for (const [lx, lz] of [
      [-0.25, -0.1],
      [0.25, -0.1],
      [-0.25, 0.1],
      [0.25, 0.1],
    ])
      k.cyl(horse, hm, 0.03, 0.03, 0.32, lx, 0.08, lz, 6);
    k.slot('horse', 'espera', horse, { kinds: ['move', 'rotate', 'color', 'sound'], move: [[-1.6, -1.2, 1.2], [-4.2, -3.0, 2]], colors: ['#2a2a3a', '#ff4f6a', '#45d16b'], h: 0.9 });
    // aquário
    k.box(root, M.woodL, 1.2, 0.8, 0.5, 8.4, 0, 7.12);
    k.col(7.8, 6.85, 9.0, 7.4, 0, 1.4);
    const tankM = new THREE.MeshLambertMaterial({ color: '#5ab8ff', transparent: true, opacity: 0.45 });
    const tank = k.box(root, tankM, 1.1, 0.55, 0.4, 8.4, 0.8, 7.12);
    void tank;
    k.box(root, k.lam('#e8d090'), 1.08, 0.05, 0.38, 8.4, 0.8, 7.12);
    const fish = k.group(root, 8.4, 1.05, 7.1);
    const fcol = ['#ff9a2e', '#ffcf2e', '#ff5c9a'];
    fcol.forEach((c, j) => {
      const f = k.sph(fish, k.lam(c), 0.05, -0.3 + j * 0.28, (j % 2) * 0.1, (j - 1) * 0.06, 1.4, 0.9, 0.6, 8);
      f.userData.paint = true;
      k.cyl(fish, k.lam(c), 0.0, 0.04, 0.06, -0.3 + j * 0.28 + 0.08, (j % 2) * 0.1 - 0.03, (j - 1) * 0.06, 4).rotation.z = Math.PI / 2;
    });
    k.slot('fish', 'espera', fish, { kinds: ['missing', 'color', 'scale'], colors: ['#2a2a3a', '#45d16b', '#4d7bff'] });
    // máquina de lanches
    const vend = k.group(root, 7.55, 0, 2.5, Math.PI / 2);
    const vb = k.box(vend, k.lam('#ff4f6a'), 0.8, 1.9, 0.7, 0, 0, 0);
    vb.userData.paint = true;
    const [vc, vx] = cv(64, 128);
    vx.fillStyle = '#1a2a50';
    vx.fillRect(0, 0, 64, 128);
    const sn = ['#ffcf2e', '#7ad0ff', '#ff8fb0', '#9cf27a'];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
      vx.fillStyle = sn[(r + c) % 4];
      vx.fillRect(6 + c * 19, 8 + r * 28, 14, 18);
    }
    k.plane(vend, k.basic('#ffffff', k.keep(tex(vc))), 0.5, 1.2, -0.08, 1.15, -0.351, Math.PI);
    k.slot('vend', 'espera', vend, { kinds: ['color', 'move'], move: [[0, 1.6, 0.4]], colors: ['#4d7bff', '#2a2a3a', '#45d16b'] });
    k.col(7.15, 2.1, 7.95, 2.9, 0, 1.9);
    // banco e desenhos
    bench(root, 7.45, 5.3, -Math.PI / 2);
    k.col(7.2, 4.45, 7.7, 6.15, 0, 0.9);
    const d = picture(root, 'kids', 7.12, 2.0, 5.3, Math.PI / 2, 0.9, 0.62);
    k.slot('draw_wait', 'espera', d.g, { kinds: ['picture', 'rotate'], pic: d, h: 0.7 });
    // balões presos na cadeirinha
    const bal = k.group(root, 11.4, 0.6, 4.4);
    ['#ff5c9a', '#7ad0ff'].forEach((c, j) => {
      const b = k.sph(bal, k.lam(c), 0.16, -0.08 + j * 0.16, 1.35 + j * 0.1, 0, 1, 1.2, 1, 10);
      b.userData.paint = true;
      k.cyl(bal, k.lam('#ffffff'), 0.003, 0.003, 1.2, -0.04 + j * 0.08, 0, 0, 3);
    });
    k.slot('balloons', 'espera', bal, { kinds: ['color', 'missing', 'move', 'scale'], move: [[1.9, 2.0], [-3.2, 1.6]], colors: ['#2a2a3a', '#ffcf2e'] });
    const sw = k.group(root, 9.0, 1.2, 1.61, Math.PI);
    k.box(sw, k.lam('#ffffff'), 0.09, 0.13, 0.02, 0, 0, 0);
    interacts.push({
      id: 'espera_lights',
      room: 'espera',
      kind: 'lights',
      object: sw,
      at: v3(9.0, 0, 2.2),
      icon: '💡',
      setState: (s) => {
        if (s !== 'done') return;
        esLamp1.user = esLamp2.user = false;
        k.refreshLamp(esLamp1);
        k.refreshLamp(esLamp2);
      },
    });
  }

  /* ------------------------------ luzes reais (tier ≥ 2) ------------------------------ */
  const real: THREE.PointLight[] = [];
  if (tier >= 2) {
    for (const [x, z, c, i] of [
      [-17, 0, '#ffd9a0', 4],
      [3.5, 4.4, '#d0f0ff', 3.5],
      [10.5, 4.5, '#ffe0b0', 3.5],
      [-1, 0, '#d8e4ff', 3],
    ] as const) {
      const l = new THREE.PointLight(c, i, 8, 1.4);
      l.position.set(x, 1.9, z);
      root.add(l);
      real.push(l);
    }
  }

  k.bake();
  // menos chamadas por objeto dinâmico
  for (const s of k.slots) if (!s.npc) k.compact(s.object);

  /* ------------------------------ grafo do Bocudo ------------------------------ */
  const nodes: Vec3[] = [];
  const links: [number, number][] = [];
  const N = (x: number, z: number) => nodes.push(v3(x, 0, z)) - 1;
  const corX = [-16.5, -12.5, -8.5, -5.5, -1.5, 3, 3.5, 8, 10.5, 12, 13.2];
  const cor = corX.map((x) => N(x, 0));
  for (let i = 0; i + 1 < cor.length; i++) links.push([cor[i], cor[i + 1]]);
  const lobN = N(-17.5, -4.5),
    lobS = N(-15.5, 4.8);
  links.push([cor[0], lobN], [cor[0], lobS]);
  const into = (cx: number, dz: number, ci: number) => {
    const d = N(cx, dz > 0 ? 2.2 : -2.2);
    const r = N(cx - (dz < 0 ? 0 : 0), dz * 4.2);
    links.push([cor[ci], d], [d, r]);
  };
  into(-8.5, -1, 2); // q1
  into(-1.5, -1, 4); // q2
  into(3, -1, 5); // farm
  into(8, -1, 7); // banh
  into(12, -1, 9); // estoq
  into(-12.5, 1, 1); // q3
  into(-5.5, 1, 3); // q4
  into(3.5, 1, 6); // enf
  into(10.5, 1, 8); // espera

  const allLamps = k.lamps;
  return {
    id: 'hospital',
    root,
    rooms,
    spawn: { pos: v3(-17, 0, 5.6), yaw: 0 },
    colliders: k.colliders,
    slots: k.slots as AnomalySlot[],
    interacts,
    npcSpots,
    items: ITEMS,
    env: { fog: '#0a0f22', fogNear: 7, fogFar: 28, sky: '#d4dcf5', ground: '#5a5070', ambient: 1.55 },
    nav: { nodes, links },
    creatureSpawns: [v3(12.4, 0, -4.2), v3(12.5, 0, 5.5), v3(-18.5, 0, -5.5), v3(-11.5, 0, 4.5)],
    setPower(on) {
      k.setPower(on);
      for (const l of real) l.visible = on;
    },
    update(dt) {
      k.updateLamps(dt);
      void allLamps;
    },
    dispose() {
      k.dispose();
    },
  };
}

const hospital: MapDef = {
  id: 'hospital',
  name: 'Hospital',
  icon: '🏥',
  build,
};
export default hospital;
export { markDyn };
