/* ============================================================
 *  CAVA & FALA — A VILA SOTERRADA.
 *  Prédios procedurais por tema (casas, torre do relógio/farol,
 *  fonte, estátua, poço, jardim, ponte) montados com GeoBuilder.
 *  Começam "sujos" (cor de terra). Pontos de amostra na casca de
 *  cada prédio medem quanto já foi desenterrado; com ~80% (e o
 *  quebra-cabeça resolvido) o prédio é RESTAURADO: cor volta,
 *  janelas acendem, moradores saem comemorando.
 * ============================================================ */
import * as THREE from 'three';
import { GeoBuilder } from '../../3d/common/geo';
import { t } from '../../i18n';
import type { Theme } from './data';
import { rng } from './noise';
import { OBox } from './phys';
import type { Terrain } from './terrain';

export type BKind = 'house' | 'tower' | 'fountain' | 'statue' | 'well' | 'garden' | 'bridge';
export type Puzzle = '' | 'bell' | 'drain' | 'bridge' | 'water';

interface Shell {
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
  /** vira colisor */
  solid: boolean;
}

export interface Building {
  i: number;
  kind: BKind;
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  group: THREE.Group;
  mesh: THREE.Mesh;
  glow: THREE.Mesh | null;
  vivid: Float32Array;
  dirty: Float32Array;
  samples: Float32Array;
  uncovered: number;
  restored: boolean;
  /** 0..1 animação de restauração */
  rt: number;
  puzzle: Puzzle;
  puzzleDone: boolean;
  puzzleHint: boolean;
  colliders: OBox[];
  /** ponta (sino / topo) em coords do mundo */
  top: THREE.Vector3;
  door: THREE.Vector3;
  /** raio aproximado */
  rad: number;
  /** caixa (mundo) para limpar a terra na restauração */
  aabb: THREE.Box3;
  /** animações próprias depois de restaurado */
  anim: ((dt: number, time: number) => void) | null;
  /** partes que só aparecem restauradas (meio da ponte, flores abertas) */
  hidden: THREE.Object3D[];
  water: THREE.Mesh | null;
  waterY0: number;
  waterY1: number;
  drain: number;
}

const TC = new THREE.Color();
const DIRT = new THREE.Color('#7a5a3c');

function bname(k: BKind, th: Theme, n: number): string {
  switch (k) {
    case 'house':
      return [t('cavafala.b.house1', 'Casa do Padeiro'), t('cavafala.b.house2', 'Casa da Costureira'), t('cavafala.b.house3', 'Casa do Carteiro'), t('cavafala.b.house4', 'Casa da Inventora'), t('cavafala.b.house5', 'Casa do Músico')][n % 5];
    case 'tower':
      return th.sea ? t('cavafala.b.lighthouse', 'Farol') : t('cavafala.b.tower', 'Torre do Relógio');
    case 'fountain':
      return th.id === 'deserto' ? t('cavafala.b.oasis', 'Fonte do Oásis') : t('cavafala.b.fountain', 'Fonte da Praça');
    case 'statue':
      return t('cavafala.b.statue', 'Estátua do Fundador');
    case 'well':
      return t('cavafala.b.well', 'Poço dos Desejos');
    case 'garden':
      return t('cavafala.b.garden', 'Jardim Florido');
    case 'bridge':
      return t('cavafala.b.bridge', 'Ponte Velha');
  }
}

/* ---------------------------- construtores ---------------------------- */
interface Made {
  geo: THREE.BufferGeometry;
  glow: THREE.BufferGeometry | null;
  shells: Shell[];
  door: [number, number, number];
  top: [number, number, number];
  extra: THREE.Object3D[];
  hidden: THREE.Object3D[];
  anim: ((dt: number, time: number) => void) | null;
}

const pick = <T,>(r: () => number, a: T[]): T => a[Math.floor(r() * a.length) % a.length];

function makeHouse(th: Theme, r: () => number): Made {
  const b = new GeoBuilder();
  const gl = new GeoBuilder();
  gl.ao = false;
  const w = 4.2 + r() * 1.6;
  const d = 3.8 + r() * 1.2;
  const h = 3 + r() * 1.2;
  const wall = pick(r, th.walls);
  const roof = pick(r, th.roofs);
  const shells: Shell[] = [{ x: 0, y: h / 2, z: 0, hx: w / 2, hy: h / 2, hz: d / 2, solid: true }];
  let topY = h;
  const extra: THREE.Object3D[] = [];
  if (th.id === 'caverna') {
    // casa-cogumelo
    b.cyl(w * 0.42, w * 0.48, h, 0, 0, 0, wall, 16);
    const capR = w * 0.72;
    b.sph(capR, 0, h + 0.2, 0, roof, 1, 0.62, 1, 18);
    for (let i = 0; i < 7; i++) {
      const a = r() * Math.PI * 2;
      const e = 0.3 + r() * 0.8;
      b.sph(0.22 + r() * 0.12, Math.cos(a) * capR * Math.cos(e) * 0.95, h + 0.2 + Math.sin(e) * capR * 0.6, Math.sin(a) * capR * Math.cos(e) * 0.95, '#ffffff', 1, 0.5, 1, 8);
    }
    shells[0] = { x: 0, y: h / 2, z: 0, hx: w * 0.4, hy: h / 2, hz: w * 0.4, solid: true };
    shells.push({ x: 0, y: h + capR * 0.3, z: 0, hx: capR * 0.85, hy: capR * 0.32, hz: capR * 0.85, solid: true });
    topY = h + capR * 0.62;
    gl.box(0.7, 0.7, 0.08, -w * 0.2, h * 0.45, -w * 0.44, '#fff');
    gl.box(0.7, 0.7, 0.08, w * 0.2, h * 0.45, -w * 0.44, '#fff');
    b.box(0.9, 1.6, 0.12, 0, 0, -w * 0.46, th.trim);
    return { geo: b.build(), glow: gl.build(), shells, door: [0, 0, -w * 0.5 - 0.6], top: [0, topY, 0], extra, hidden: [], anim: null };
  }
  b.box(w, h, d, 0, 0, 0, wall);
  // faixas/rodapé
  b.sharp(w + 0.08, 0.25, d + 0.08, 0, 0, 0, th.trim);
  b.sharp(w + 0.06, 0.12, d + 0.06, 0, h - 0.12, 0, th.trim);
  if (th.id === 'deserto' && r() < 0.6) {
    // cúpula
    b.sph(Math.min(w, d) * 0.46, 0, h, 0, roof, 1, 0.8, 1, 16);
    b.cyl(0.05, 0.05, 0.6, 0, h + Math.min(w, d) * 0.37, 0, '#ffd34a', 6);
    topY = h + Math.min(w, d) * 0.4;
    shells.push({ x: 0, y: h + 0.8, z: 0, hx: w * 0.35, hy: 0.8, hz: d * 0.35, solid: true });
    // toldo
    b.sharp(w * 0.6, 0.08, 1, 0, h * 0.62, -d / 2 - 0.5, pick(r, th.roofs), 0, 0.3);
  } else {
    const steep = th.snow ? 0.9 : 0.6;
    const rh = Math.min(w, d) * steep;
    b.frustum((w + 0.7) * 0.72, (d + 0.8) * 0.72, (w + 0.7) * 0.72, 0.06, rh, 0, h, 0, roof);
    topY = h + rh;
    shells.push({ x: 0, y: h + rh * 0.35, z: 0, hx: w * 0.45, hy: rh * 0.35, hz: d * 0.35, solid: true });
    // chaminé
    b.box(0.5, rh * 0.9, 0.5, w * 0.28, h + rh * 0.25, d * 0.12, th.id === 'neve' ? '#8a8a9a' : '#c85a3a');
    if (th.snow) b.sph(0.38, w * 0.28, h + rh * 1.12, d * 0.12, '#ffffff', 1, 0.45, 1, 10);
  }
  // porta, janelas, floreira
  b.box(1, 1.7, 0.14, 0, 0.05, -d / 2 - 0.04, th.trim);
  b.sph(0.06, 0.32, 0.95, -d / 2 - 0.14, '#ffd34a', 1, 1, 1, 6);
  for (const sx of [-1, 1]) {
    gl.box(0.75, 0.75, 0.06, sx * w * 0.3, h * 0.48, -d / 2 - 0.03, '#fff');
    b.sharp(0.95, 0.1, 0.12, sx * w * 0.3, h * 0.48 - 0.1, -d / 2 - 0.06, th.trim);
    b.box(0.9, 0.22, 0.25, sx * w * 0.3, h * 0.48 - 0.3, -d / 2 - 0.16, '#8a5a3a');
    for (let f = 0; f < 3; f++) b.sph(0.1, sx * w * 0.3 - 0.28 + f * 0.28, h * 0.48 - 0.05, -d / 2 - 0.2, pick(r, ['#ff5a8a', '#ffd34a', '#ff8a3a', '#b05aff']), 1, 1, 1, 6);
    gl.box(0.06, 0.75, 0.7, sx * (w / 2 + 0.03), h * 0.48, 0, '#fff');
  }
  return { geo: b.build(), glow: gl.build(), shells, door: [0, 0, -d / 2 - 0.8], top: [0, topY, 0], extra, hidden: [], anim: null };
}

function makeTower(th: Theme, r: () => number): Made {
  const b = new GeoBuilder();
  const gl = new GeoBuilder();
  gl.ao = false;
  const extra: THREE.Object3D[] = [];
  let anim: Made['anim'] = null;
  if (th.sea) {
    // farol listrado
    const H = 11;
    for (let i = 0; i < 5; i++) {
      const y0 = (i * H) / 5;
      const r0 = 1.8 - (i / 5) * 0.6;
      b.cyl(r0 - 0.12, r0, H / 5, 0, y0, 0, i % 2 ? '#ffffff' : '#e8504a', 18);
    }
    b.cyl(1.5, 1.5, 0.2, 0, H, 0, '#2a4c8a', 18);
    gl.cyl(0.9, 0.9, 1.3, 0, H + 0.2, 0, '#fff', 14);
    b.cyl(0.2, 1.15, 1, 0, H + 1.5, 0, '#e8504a', 14);
    b.box(1, 1.8, 0.14, 0, 0, -1.84, th.trim);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(1.4, 9, 16, 1, true), new THREE.MeshBasicMaterial({ color: '#fff6c0', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
    beam.rotation.z = Math.PI / 2;
    beam.position.set(4.6, 0, 0);
    const pivot = new THREE.Group();
    pivot.position.y = H + 0.85;
    pivot.add(beam);
    pivot.visible = false;
    extra.push(pivot);
    anim = (dt) => {
      pivot.visible = true;
      pivot.rotation.y += dt * 0.9;
    };
    return {
      geo: b.build(),
      glow: gl.build(),
      shells: [
        { x: 0, y: H / 2, z: 0, hx: 1.5, hy: H / 2, hz: 1.5, solid: true },
        { x: 0, y: H + 1, z: 0, hx: 1.1, hy: 1, hz: 1.1, solid: true },
      ],
      door: [0, 0, -2.6],
      top: [0, H + 0.8, 0],
      extra,
      hidden: [],
      anim,
    };
  }
  const H = 9.5;
  const wall = th.id === 'deserto' ? '#f0c890' : th.id === 'caverna' ? '#c8b8ff' : '#e8d6b0';
  b.box(3.2, H, 3.2, 0, 0, 0, wall);
  b.sharp(3.4, 0.3, 3.4, 0, H * 0.55, 0, th.trim);
  b.sharp(3.4, 0.3, 3.4, 0, H, 0, th.trim);
  // campanário aberto (4 colunas) + sino
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    b.box(0.4, 2.2, 0.4, sx * 1.3, H + 0.3, sz * 1.3, wall);
  b.lathe(
    [
      [0.05, 0],
      [0.62, 0.05],
      [0.5, 0.35],
      [0.38, 0.9],
      [0.2, 1.05],
      [0.02, 1.1],
    ],
    0,
    H + 1.0,
    0,
    '#ffcc33',
    14,
  );
  const roofH = th.id === 'deserto' ? 2.2 : 3.2;
  if (th.id === 'deserto') b.sph(1.9, 0, H + 2.5, 0, pick(r, th.roofs), 1, 0.9, 1, 16);
  else if (th.id === 'caverna') {
    for (let i = 0; i < 5; i++) b.cyl(0, 0.35 + r() * 0.3, 2 + r() * 2.5, Math.cos(i * 1.3) * 0.9, H + 2.4, Math.sin(i * 1.3) * 0.9, '#9af6ff', 6);
  } else b.frustum(2.6, 2.6, 0.05, 0.05, roofH, 0, H + 2.5, 0, pick(r, th.roofs));
  if (th.snow) b.sph(0.8, 0, H + 2.6, 0, '#ffffff', 1.6, 0.4, 1.6, 10);
  b.box(1.1, 2, 0.14, 0, 0, -1.64, th.trim);
  // relógio (mostrador brilha + ponteiros)
  gl.cyl(1, 1, 0.08, 0, H * 0.72, -1.62, '#fff', 20, Math.PI / 2);
  const hands = new THREE.Group();
  hands.position.set(0, H * 0.72, -1.72);
  const hm = new THREE.MeshLambertMaterial({ color: '#2a0b5c' });
  const hA = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.75, 0.04), hm);
  hA.geometry.translate(0, 0.32, 0);
  const hB = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.04), hm);
  hB.geometry.translate(0, 0.2, 0);
  hands.add(hA, hB);
  extra.push(hands);
  anim = (dt) => {
    hA.rotation.z -= dt * 1.2;
    hB.rotation.z -= dt * 0.1;
  };
  return {
    geo: b.build(),
    glow: gl.build(),
    shells: [
      { x: 0, y: H / 2, z: 0, hx: 1.6, hy: H / 2, hz: 1.6, solid: true },
      { x: 0, y: H + 2.4, z: 0, hx: 1.3, hy: 1.2, hz: 1.3, solid: false },
    ],
    door: [0, 0, -2.4],
    top: [0, H + 1.4, 0],
    extra,
    hidden: [],
    anim,
  };
}

function makeFountain(th: Theme): Made {
  const b = new GeoBuilder();
  const gl = new GeoBuilder();
  gl.ao = false;
  const stone = th.id === 'deserto' ? '#e8c890' : th.id === 'caverna' ? '#b8a8e8' : '#c8c8d8';
  b.rcyl(2.4, 0.7, 0, 0, 0, stone, 24);
  gl.cyl(2.15, 2.15, 0.05, 0, 0.6, 0, '#fff', 24);
  b.cyl(0.3, 0.45, 1.6, 0, 0.6, 0, stone, 12);
  b.lathe(
    [
      [0.1, 0],
      [1, 0.15],
      [1.1, 0.35],
      [0.9, 0.38],
      [0.1, 0.25],
    ],
    0,
    2.1,
    0,
    stone,
    18,
  );
  b.sph(0.35, 0, 2.6, 0, th.id === 'caverna' ? '#9af6ff' : '#8fd3ff', 1, 1.2, 1, 12);
  // jatos de água (aparecem restaurado)
  const jets = new THREE.Group();
  const jm = new THREE.MeshBasicMaterial({ color: '#bfefff', transparent: true, opacity: 0.75 });
  const drops: THREE.Mesh[] = [];
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), jm);
    jets.add(m);
    drops.push(m);
  }
  jets.visible = false;
  const anim = (_dt: number, time: number) => {
    jets.visible = true;
    drops.forEach((m, i) => {
      const k = (time * 0.9 + i / drops.length) % 1;
      const a = i * 2.4;
      const rr = 0.3 + k * 1.2;
      m.position.set(Math.cos(a) * rr, 2.7 + k * 1.6 - k * k * 2.6, Math.sin(a) * rr);
    });
  };
  return {
    geo: b.build(),
    glow: gl.build(),
    shells: [
      { x: 0, y: 0.35, z: 0, hx: 2.2, hy: 0.35, hz: 2.2, solid: true },
      { x: 0, y: 1.6, z: 0, hx: 0.9, hy: 1.1, hz: 0.9, solid: true },
    ],
    door: [0, 0, -3],
    top: [0, 3, 0],
    extra: [jets],
    hidden: [],
    anim,
  };
}

function makeStatue(th: Theme): Made {
  const b = new GeoBuilder();
  const stone = th.id === 'caverna' ? '#a89ad8' : '#b8b8c8';
  b.box(2.2, 1.4, 2.2, 0, 0, 0, stone);
  b.sharp(2.5, 0.25, 2.5, 0, 0, 0, '#9a9aa8');
  b.sharp(2.4, 0.2, 2.4, 0, 1.3, 0, '#9a9aa8');
  // Bloop herói segurando uma pá
  b.sph(0.85, 0, 2.45, 0, '#ffcc33', 1, 0.95, 1, 18);
  b.sph(0.2, -0.3, 2.65, -0.7, '#ffffff', 1, 1.2, 0.6, 8);
  b.sph(0.2, 0.3, 2.65, -0.7, '#ffffff', 1, 1.2, 0.6, 8);
  b.sph(0.1, -0.3, 2.65, -0.82, '#2a1140', 1, 1, 1, 6);
  b.sph(0.1, 0.3, 2.65, -0.82, '#2a1140', 1, 1, 1, 6);
  b.cyl(0.07, 0.07, 2.2, 0.95, 1.5, -0.1, '#8a5a3a', 6, 0, -0.2);
  b.box(0.5, 0.6, 0.1, 1.2, 3.55, -0.1, '#c8c8d8', 0, 0, -0.2);
  b.sph(0.2, 0, 3.3, 0, '#ff4f6a', 1, 0.6, 1, 10);
  return { geo: b.build(), glow: null, shells: [{ x: 0, y: 0.7, z: 0, hx: 1.1, hy: 0.7, hz: 1.1, solid: true }, { x: 0, y: 2.5, z: 0, hx: 0.85, hy: 0.9, hz: 0.85, solid: true }], door: [0, 0, -2], top: [0, 3.4, 0], extra: [], hidden: [], anim: null };
}

function makeWell(th: Theme): Made {
  const b = new GeoBuilder();
  const gl = new GeoBuilder();
  gl.ao = false;
  b.rcyl(1.1, 0.9, 0, 0, 0, '#a8a8b8', 18);
  gl.cyl(0.85, 0.85, 0.04, 0, 0.75, 0, '#fff', 16);
  b.box(0.18, 2.2, 0.18, -0.95, 0, 0, '#8a5a3a');
  b.box(0.18, 2.2, 0.18, 0.95, 0, 0, '#8a5a3a');
  b.frustum(1.8, 1.6, 1.8, 0.05, 0.8, 0, 2.2, 0, pick(Math.random, th.roofs));
  b.cyl(0.06, 0.06, 1.9, -0.95, 1.6, 0, '#6a4a2a', 6, 0, Math.PI / 2);
  b.cyl(0.18, 0.15, 0.3, 0, 1.0, 0, '#8a5a3a', 8);
  return { geo: b.build(), glow: gl.build(), shells: [{ x: 0, y: 0.45, z: 0, hx: 1.05, hy: 0.45, hz: 1.05, solid: true }, { x: 0, y: 2.4, z: 0, hx: 1, hy: 0.45, hz: 0.9, solid: false }], door: [0, 0, -1.8], top: [0, 3, 0], extra: [], hidden: [], anim: null };
}

function makeGarden(th: Theme, r: () => number): Made {
  const b = new GeoBuilder();
  const W = 7,
    D = 5.5;
  // cerca
  for (let i = 0; i <= 7; i++) {
    const x = -W / 2 + (i * W) / 7;
    b.box(0.14, 0.9, 0.14, x, 0, -D / 2, '#ffffff');
    b.box(0.14, 0.9, 0.14, x, 0, D / 2, '#ffffff');
  }
  b.sharp(W, 0.1, 0.06, 0, 0.6, -D / 2, '#ffffff');
  b.sharp(W, 0.1, 0.06, 0, 0.6, D / 2, '#ffffff');
  // canteiros
  for (const z of [-1.3, 1.3]) b.box(W - 1.2, 0.35, 1.4, 0, 0, z, '#6a4a2a');
  // árvore
  const leaf = th.id === 'caverna' ? '#5ad6a0' : th.snow ? '#3a8a5a' : '#4fae5a';
  b.cyl(0.18, 0.25, 1.8, W / 2 - 0.6, 0, 0, '#8a5a3a', 8);
  b.sph(0.9, W / 2 - 0.6, 2.2, 0, leaf, 1, 0.9, 1, 12);
  // flores fechadas (botões) / abertas (escondidas até regar)
  const buds = new THREE.Group();
  const open = new THREE.Group();
  const bm = new THREE.MeshLambertMaterial({ color: '#5a9a4a' });
  const cols = ['#ff5a8a', '#ffd34a', '#ff8a3a', '#b05aff', '#5ab0ff', '#ffffff'];
  const bloom: THREE.Mesh[] = [];
  for (const z of [-1.3, 1.3])
    for (let i = 0; i < 7; i++) {
      const x = -W / 2 + 1 + i * 0.8 + (r() - 0.5) * 0.2;
      const bud = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), bm);
      bud.position.set(x, 0.5, z + (r() - 0.5) * 0.5);
      buds.add(bud);
      const f = new THREE.Group();
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 4), bm);
      st.position.y = 0.25;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshLambertMaterial({ color: pick(r, cols) }));
      head.position.y = 0.55;
      head.scale.y = 0.6;
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshLambertMaterial({ color: '#ffe060' }));
      c.position.y = 0.6;
      f.add(st, head, c);
      f.position.copy(bud.position).setY(0.35);
      open.add(f);
      bloom.push(head);
    }
  open.visible = false;
  return {
    geo: b.build(),
    glow: null,
    shells: [{ x: 0, y: 0.45, z: 0, hx: W / 2, hy: 0.45, hz: D / 2, solid: false }, { x: W / 2 - 0.6, y: 1.6, z: 0, hx: 0.8, hy: 1, hz: 0.8, solid: true }],
    door: [0, 0, -D / 2 - 0.8],
    top: [0, 2, 0],
    extra: [buds, open],
    hidden: [open],
    anim: (_dt, time) => {
      buds.visible = false;
      bloom.forEach((h, i) => (h.rotation.y = Math.sin(time * 2 + i) * 0.3));
    },
  };
}

function makeBridge(th: Theme, span: number): Made {
  const b = new GeoBuilder();
  const stone = th.id === 'caverna' ? '#8a7ab8' : '#a8a0a0';
  const wood = '#a0703a';
  const half = span / 2;
  // pilares das cabeceiras (cada margem)
  for (const s of [-1, 1]) {
    b.box(3.4, 1, 2.2, 0, -0.4, s * (half + 0.6), stone);
    b.box(0.3, 1.4, 0.3, -1.5, 0.5, s * (half + 0.2), stone);
    b.box(0.3, 1.4, 0.3, 1.5, 0.5, s * (half + 0.2), stone);
    // tábuas quebradas que sobram em cada ponta
    b.sharp(3, 0.18, 1, 0, 0.42, s * (half - 0.4), wood);
  }
  // meio (some até restaurar)
  const mid = new THREE.Group();
  const mm = new THREE.MeshLambertMaterial({ color: wood });
  const n = Math.ceil((span - 1.6) / 0.6);
  for (let i = 0; i < n; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(3, 0.16, 0.52), mm);
    p.position.set(0, 0.5, -half + 0.9 + i * 0.6);
    mid.add(p);
  }
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, span + 0.6), new THREE.MeshLambertMaterial({ color: '#ffd34a' }));
    rail.position.set(s * 1.5, 1.2, 0);
    mid.add(rail);
  }
  mid.visible = false;
  return {
    geo: b.build(),
    glow: null,
    shells: [
      { x: 0, y: 0.1, z: -(half + 0.6), hx: 1.7, hy: 0.5, hz: 1.1, solid: true },
      { x: 0, y: 0.1, z: half + 0.6, hx: 1.7, hy: 0.5, hz: 1.1, solid: true },
    ],
    door: [0, 0.6, -(half + 1.6)],
    top: [0, 1, 0],
    extra: [mid],
    hidden: [mid],
    anim: null,
  };
}

/* ------------------------------- layout ------------------------------- */
export interface TownLayout {
  cx: number;
  cz: number;
  floorY: number;
  /** vala (ravina) ao longo de X: centro z e meia largura */
  ravZ: number;
  ravHalf: number;
  spawn: THREE.Vector3;
}

export class Town {
  readonly group = new THREE.Group();
  readonly list: Building[] = [];
  private glowMat = new THREE.MeshBasicMaterial({ color: '#4a3a30', toneMapped: false });
  private mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  private checkI = 0;
  constructor(
    readonly th: Theme,
    readonly L: TownLayout,
    seed: number,
  ) {
    const r = rng(seed);
    const fy = L.floorY;
    const J = () => (r() - 0.5) * 2.2;
    const flip = r() < 0.5 ? -1 : 1;
    const span = L.ravHalf * 2 + 1.2;
    const plan: [BKind, number, number][] = [
      ['fountain', 0, 0],
      ['tower', J() * 0.5, -10.5],
      [r() < 0.5 ? 'statue' : 'well', -8.5 * flip + J() * 0.4, -7 + J() * 0.4],
      [r() < 0.5 ? 'well' : 'statue', 8.5 * flip + J() * 0.4, -7 + J() * 0.4],
      ['house', -10.5 + J() * 0.4, 1.5 + J()],
      ['house', 10.5 + J() * 0.4, 1.5 + J()],
      ['house', -5.5 * flip + J() * 0.5, 8 + J() * 0.3],
      ['bridge', 0, L.ravZ - L.cz],
      ['house', -6.5 * flip + J() * 0.5, L.ravZ - L.cz + L.ravHalf + 6.5],
      ['garden', 6.5 * flip + J() * 0.5, L.ravZ - L.cz + L.ravHalf + 5.5],
    ];
    // nunca dois do mesmo tipo de "decoração"
    if (plan[2][0] === plan[3][0]) plan[3][0] = plan[2][0] === 'statue' ? 'well' : 'statue';
    let hn = Math.floor(r() * 5);
    plan.forEach(([kind, lx, lz], i) => {
      const x = L.cx + lx,
        z = L.cz + lz;
      let made: Made;
      let yaw: number;
      if (kind === 'bridge') {
        made = makeBridge(this.th, span);
        yaw = 0;
      } else {
        // virado para a fonte (porta em -Z local)
        yaw = Math.atan2(-(L.cx - x), -(L.cz - z));
        if (kind === 'fountain') yaw = 0;
        if (kind === 'garden') yaw = 0;
        made =
          kind === 'house'
            ? makeHouse(this.th, r)
            : kind === 'tower'
              ? makeTower(this.th, r)
              : kind === 'fountain'
                ? makeFountain(this.th)
                : kind === 'statue'
                  ? makeStatue(this.th)
                  : kind === 'well'
                    ? makeWell(this.th)
                    : makeGarden(this.th, r);
      }
      const y = kind === 'bridge' ? fy - 0.5 : fy;
      this.add(i, kind, made, x, y, z, yaw, kind === 'house' ? hn++ : 0);
    });
  }

  private add(i: number, kind: BKind, made: Made, x: number, y: number, z: number, yaw: number, n: number): void {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    const mesh = new THREE.Mesh(made.geo, this.mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    const ca = made.geo.getAttribute('color') as THREE.BufferAttribute;
    // GeoBuilder converte sRGB→linear de novo (Color.set já converte): desfaz a 2ª conversão
    const src = ca.array as Float32Array;
    for (let k = 0; k < src.length; k += 3) {
      TC.setRGB(src[k], src[k + 1], src[k + 2]).convertLinearToSRGB();
      src[k] = TC.r;
      src[k + 1] = TC.g;
      src[k + 2] = TC.b;
    }
    const vivid = new Float32Array(src);
    const dirty = new Float32Array(vivid.length);
    for (let k = 0; k < vivid.length; k += 3) {
      TC.setRGB(vivid[k], vivid[k + 1], vivid[k + 2]);
      const l = (TC.r + TC.g + TC.b) / 3;
      TC.setRGB(l, l, l).lerp(DIRT, 0.55).multiplyScalar(0.72);
      dirty[k] = TC.r;
      dirty[k + 1] = TC.g;
      dirty[k + 2] = TC.b;
    }
    (ca.array as Float32Array).set(dirty);
    ca.needsUpdate = true;
    let glow: THREE.Mesh | null = null;
    if (made.glow && made.glow.getAttribute('position')) {
      glow = new THREE.Mesh(made.glow, this.glowMat.clone());
      g.add(glow);
    }
    for (const e of made.extra) g.add(e);
    g.updateMatrixWorld(true);
    // amostras na casca
    const pts: number[] = [];
    const V = new THREE.Vector3();
    const aabb = new THREE.Box3();
    const colliders: OBox[] = [];
    for (const s of made.shells) {
      const step = 1.1;
      const faces: [number, number, number, number, number, number][] = [];
      const off = 0.35;
      // topo + 4 lados (sem fundo)
      for (let a = -s.hx; a <= s.hx + 1e-3; a += Math.max(0.5, (s.hx * 2) / Math.max(1, Math.round((s.hx * 2) / step))))
        for (let b = -s.hz; b <= s.hz + 1e-3; b += Math.max(0.5, (s.hz * 2) / Math.max(1, Math.round((s.hz * 2) / step)))) faces.push([a, s.hy + off, b, 0, 0, 0]);
      for (let a = -s.hx; a <= s.hx + 1e-3; a += Math.max(0.5, (s.hx * 2) / Math.max(1, Math.round((s.hx * 2) / step))))
        for (let h = -s.hy + 0.3; h <= s.hy; h += step) {
          faces.push([a, h, -s.hz - off, 0, 0, 0]);
          faces.push([a, h, s.hz + off, 0, 0, 0]);
        }
      for (let b = -s.hz; b <= s.hz + 1e-3; b += Math.max(0.5, (s.hz * 2) / Math.max(1, Math.round((s.hz * 2) / step))))
        for (let h = -s.hy + 0.3; h <= s.hy; h += step) {
          faces.push([-s.hx - off, h, b, 0, 0, 0]);
          faces.push([s.hx + off, h, b, 0, 0, 0]);
        }
      for (const f of faces) {
        const lx = s.x + f[0],
          ly = s.y + f[1],
          lz = s.z + f[2];
        // dentro de outra casca? descarta
        if (made.shells.some((o) => o !== s && Math.abs(lx - o.x) < o.hx && Math.abs(ly - o.y) < o.hy && Math.abs(lz - o.z) < o.hz)) continue;
        V.set(lx, ly, lz).applyMatrix4(g.matrixWorld);
        if (V.y < y + 0.15) continue;
        pts.push(V.x, V.y, V.z);
      }
      // colisor e caixa
      V.set(s.x, s.y, s.z).applyMatrix4(g.matrixWorld);
      if (s.solid) {
        const ob = new OBox(V.x, V.y, V.z, s.hx, s.hy, s.hz, yaw);
        ob.owner = i;
        colliders.push(ob);
      }
      const ext = Math.max(s.hx, s.hz) + 0.6;
      aabb.expandByPoint(new THREE.Vector3(V.x - ext, V.y - s.hy, V.z - ext));
      aabb.expandByPoint(new THREE.Vector3(V.x + ext, V.y + s.hy + 0.6, V.z + ext));
    }
    const top = new THREE.Vector3(...made.top).applyMatrix4(g.matrixWorld);
    const door = new THREE.Vector3(...made.door).applyMatrix4(g.matrixWorld);
    const puzzle: Puzzle = kind === 'tower' ? 'bell' : kind === 'fountain' ? 'drain' : kind === 'bridge' ? 'bridge' : kind === 'garden' ? 'water' : '';
    let water: THREE.Mesh | null = null;
    const b: Building = {
      i,
      kind,
      name: bname(kind, this.th, n),
      x,
      y,
      z,
      yaw,
      group: g,
      mesh,
      glow,
      vivid,
      dirty,
      samples: new Float32Array(pts),
      uncovered: 0,
      restored: false,
      rt: 0,
      puzzle,
      puzzleDone: puzzle === '',
      puzzleHint: false,
      colliders,
      top,
      door,
      rad: Math.max(aabb.max.x - aabb.min.x, aabb.max.z - aabb.min.z) / 2,
      aabb,
      anim: made.anim,
      hidden: made.hidden,
      water: null,
      waterY0: 0,
      waterY1: 0,
      drain: 0,
    };
    if (kind === 'fountain') {
      // praça alagada: água aparece quando a fonte é desenterrada
      water = new THREE.Mesh(new THREE.CircleGeometry(5.2, 32), new THREE.MeshLambertMaterial({ color: '#4ab0e8', transparent: true, opacity: 0.72, emissive: new THREE.Color('#103a5a') }));
      water.rotation.x = -Math.PI / 2;
      water.position.set(x, y + 1.15, z);
      water.visible = false;
      b.water = water;
      b.waterY0 = y + 1.15;
      b.waterY1 = y - 0.3;
      this.group.add(water);
    }
    this.group.add(g);
    this.list.push(b);
  }

  /** caixas de colisão de todos os prédios */
  colliders(): OBox[] {
    return this.list.flatMap((b) => b.colliders);
  }

  /** mede a parte desenterrada de alguns prédios por quadro */
  measure(T: Terrain, n = 2): void {
    for (let k = 0; k < n; k++) {
      const b = this.list[this.checkI++ % this.list.length];
      if (b.restored) continue;
      const s = b.samples;
      let open = 0;
      const N = s.length / 3;
      for (let i = 0; i < s.length; i += 3) if (T.sample(s[i], s[i + 1], s[i + 2]) <= 0.02) open++;
      b.uncovered = N ? open / N : 1;
    }
  }

  get restoredCount(): number {
    return this.list.filter((b) => b.restored).length;
  }

  update(dt: number, time: number): void {
    for (const b of this.list) {
      if (b.water) {
        const show = !b.restored && b.uncovered > 0.3 && !b.puzzleDone;
        if (b.puzzleDone && b.water.visible) {
          b.drain = Math.min(1, b.drain + dt * 0.35);
          b.water.position.y = b.waterY0 + (b.waterY1 - b.waterY0) * b.drain;
          if (b.drain >= 1) b.water.visible = false;
        } else if (show) {
          b.water.visible = true;
          b.water.position.y = b.waterY0 + Math.sin(time * 1.5) * 0.04;
        }
      }
      if (!b.restored) continue;
      if (b.rt < 1) {
        b.rt = Math.min(1, b.rt + dt / 1.4);
        const k = b.rt;
        const e = k * k * (3 - 2 * k);
        const ca = b.mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
        const arr = ca.array as Float32Array;
        for (let i = 0; i < arr.length; i++) arr[i] = b.dirty[i] + (b.vivid[i] - b.dirty[i]) * e;
        ca.needsUpdate = true;
        if (b.glow) (b.glow.material as THREE.MeshBasicMaterial).color.set('#4a3a30').lerp(new THREE.Color('#ffe08a'), e);
        const pop = 1 + Math.sin(k * Math.PI) * 0.09;
        b.group.scale.set(pop, 1 + Math.sin(k * Math.PI * 2) * 0.05 + (pop - 1), pop);
        if (k >= 1) b.group.scale.set(1, 1, 1);
      }
      b.anim?.(dt, time);
    }
  }

  restore(b: Building): void {
    if (b.restored) return;
    b.restored = true;
    b.rt = 0;
    b.uncovered = 1;
    for (const h of b.hidden) h.visible = true;
    if (b.kind === 'bridge') {
      // o meio da ponte vira colisor
      const span = b.colliders.length ? Math.abs(b.colliders[1].z - b.colliders[0].z) : 6;
      const ob = new OBox(b.x, b.y + 0.5, b.z, 1.5, 0.12, span / 2);
      ob.owner = b.i;
      b.colliders.push(ob);
    }
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        const mm = m.material as THREE.Material;
        if (mm !== this.mat) mm.dispose();
      }
    });
    this.mat.dispose();
    this.glowMat.dispose();
  }
}
