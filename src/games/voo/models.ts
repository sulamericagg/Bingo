/* ============================================================
 *  POUSO FORÇADO — modelos 3D procedurais (low-poly estilizado):
 *  interior do avião, avião por fora (pintura), Bloops com chapéus,
 *  objetos, aeroporto, chão, montanhas e nuvens. Tudo mesclado com
 *  cor por vértice (GeoBuilder) para poucas chamadas de desenho.
 * ============================================================ */
import * as THREE from 'three';
import { GeoBuilder } from '../../3d/common/geo';
import { canvas, shade, INK } from '../../3d/common/tex';
import { HAT_COLS, SPOTS, WIN_Z, type Cabin, type ItemKind, type Livery } from './data';

const TAU = Math.PI * 2;
export const FUSE_Y = 1.1;
export const FUSE_R = 2.05;
/** centro de giro do avião (CG) em coordenadas locais */
export const CG_Z = 10;
/** altura das rodas abaixo do piso (trem baixado) */
export const WHEEL_Y = -2.67;

export function mat(standard: boolean, opts: { rough?: number; metal?: number; emissive?: boolean; side?: THREE.Side } = {}): THREE.Material {
  if (opts.emissive) return new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: opts.side });
  if (standard) return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: opts.rough ?? 0.72, metalness: opts.metal ?? 0.04, side: opts.side });
  return new THREE.MeshLambertMaterial({ vertexColors: true, side: opts.side });
}

function roundRectShape(w: number, h: number, r: number, cx = 0, cy = 0): THREE.Shape {
  const s = new THREE.Shape();
  const x = cx - w / 2;
  const y = cy - h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
/** moldura arredondada de janela (no plano XY, de frente para +z) */
function frameGeo(w: number, h: number, t: number, depth: number): THREE.BufferGeometry {
  const s = roundRectShape(w + t * 2, h + t * 2, Math.min(w, h) * 0.5 + t);
  s.holes.push(roundRectShape(w, h, Math.min(w, h) * 0.45) as unknown as THREE.Path);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/* ============================== INTERIOR ============================== */

export interface CabinRefs {
  group: THREE.Group;
  yokeL: THREE.Group;
  yokeR: THREE.Group;
  throttle: THREE.Group;
  flapLever: THREE.Group;
  gearLever: THREE.Group;
  pfd: THREE.Mesh;
  nav: THREE.Mesh;
  elecDoor: THREE.Group;
  doorF: THREE.Group;
  doorR: THREE.Group;
  valve: THREE.Group;
  crank: THREE.Group;
  pump: THREE.Group;
  ovenGlow: THREE.Mesh;
  lights: THREE.Mesh;
  alarmLamps: THREE.Mesh;
  wins: { x: number; z: number; y: number; glass: THREE.Mesh }[];
  bins: THREE.Group;
  masks: THREE.InstancedMesh;
  maskBase: THREE.Matrix4[];
  tapePatches: THREE.Group;
}

const WIN_W = 0.34;
const WIN_H = 0.46;
const WIN_Y = 1.25;
const WALL_X = 1.78;

export function buildCabin(cab: Cabin, standard: boolean, bevel: number, pfdTex: THREE.Texture, navTex: THREE.Texture): CabinRefs {
  const group = new THREE.Group();
  const b = new GeoBuilder();
  b.bevel = bevel;
  b.jitter = 0.04;
  const metal = new GeoBuilder();
  metal.bevel = bevel;
  const glow = new GeoBuilder();
  glow.ao = false;
  glow.bevel = 0;
  const WALL = '#efe9f6';
  const WALL2 = '#ded4ee';
  const TRIM = '#b9a8d6';
  const CARGO = '#8c8fa6';
  // ---------- piso ----------
  b.sharp(3.56, 0.06, 17.7, 0, -0.06, -1.2 + 17.7 / 2, cab.carpet);
  b.sharp(0.7, 0.012, 17.6, 0, 0, -1.2 + 17.6 / 2, shade(cab.carpet, 0.18));
  b.sharp(3.56, 0.06, 2.8, 0, -0.06, -2.6, '#3a3f5a');
  b.sharp(3.56, 0.06, 4.5, 0, -0.06, 18.75, '#6b6f86');
  for (let z = 16.9; z < 21; z += 0.7) b.sharp(3.4, 0.012, 0.05, 0, 0, z, '#4f5266');
  // ---------- paredes (faixa de baixo, faixa das janelas com furos, curva de cima) ----------
  const winsL: number[] = [0.15, 1.95, ...WIN_Z, 10.6];
  const winsR: number[] = [0.15, 1.95, ...WIN_Z, 10.6];
  for (const side of [-1, 1]) {
    const X = side * WALL_X;
    const ws = (side < 0 ? winsL : winsR).slice().sort((a, c) => a - c);
    // trechos: cabine de passageiros (-1.2 .. 16.5)
    const z0 = -1.2;
    const z1 = 16.5;
    const doorZ = side < 0 ? [SPOTS.doorF.z, SPOTS.doorR.z] : [];
    const cuts: [number, number][] = [];
    for (const z of ws) cuts.push([z - WIN_W / 2, z + WIN_W / 2]);
    // parte de baixo
    const lowCuts = doorZ.map((z) => [z - 0.5, z + 0.5] as [number, number]);
    const span = (a: number, c: number, y0: number, h: number, col: string, cutList: [number, number][]) => {
      let s = a;
      const cl = cutList.filter((k) => k[1] > a && k[0] < c).sort((p, q) => p[0] - q[0]);
      for (const [ca, cb] of cl) {
        if (ca > s) b.sharp(0.08, h, ca - s, X, y0, (s + ca) / 2, col);
        s = Math.max(s, cb);
      }
      if (c > s) b.sharp(0.08, h, c - s, X, y0, (s + c) / 2, col);
    };
    span(z0, z1, 0, WIN_Y - WIN_H / 2, WALL2, lowCuts);
    span(z0, z1, WIN_Y - WIN_H / 2, WIN_H, WALL, [...cuts, ...lowCuts]);
    span(z0, z1, WIN_Y + WIN_H / 2, 0.36, WALL, lowCuts);
    // acima das portas
    for (const z of doorZ) b.sharp(0.08, 0.3, 1.0, X, 1.95, z, WALL);
    // inclinado até o teto
    const slant = Math.atan2(2.36 - 1.83, WALL_X - 1.05);
    b.sharp(0.06, Math.hypot(2.36 - 1.83, WALL_X - 1.05) + 0.05, z1 - z0, side * WALL_X, 1.82, (z0 + z1) / 2, WALL, 0, 0, side * (Math.PI / 2 - slant));
    // rodapé e friso
    b.sharp(0.1, 0.12, z1 - z0, X - side * 0.02, 0, (z0 + z1) / 2, TRIM);
    b.sharp(0.1, 0.04, z1 - z0, X - side * 0.03, 0.88, (z0 + z1) / 2, TRIM);
    // molduras das janelas
    const fg = frameGeo(WIN_W, WIN_H, 0.05, 0.08);
    for (const z of ws) {
      if (doorZ.some((d) => Math.abs(d - z) < 0.6)) continue;
      b.geo(fg.clone(), '#ffffff', X - side * 0.05, WIN_Y, z, 0, Math.PI / 2, 0);
      // persiana entreaberta em algumas
      if (Math.sin(z * 7.3 + side) > 0.55) b.sharp(0.02, WIN_H * 0.35, WIN_W, X - side * 0.02, WIN_Y + WIN_H * 0.15, z, '#d4c9e8');
    }
    fg.dispose();
    // compartimentos de bagagem
    for (const [a, c] of [
      [-1.0, 3.7],
      [6.2, 16.3],
    ]) {
      b.box(0.72, 0.5, c - a, side * 1.42, 1.78, (a + c) / 2, '#f7f3fb');
      b.sharp(0.02, 0.04, c - a, side * 1.06, 1.98, (a + c) / 2, TRIM);
      for (let z = a + 0.9; z < c; z += 1.8) b.box(0.03, 0.06, 0.18, side * 1.06, 1.86, z, '#9a8ac0');
    }
    // trilho de luz
    glow.sharp(0.05, 0.02, 17.4, side * 0.98, 2.3, 7.5, '#fff1d6');
  }
  // teto
  b.sharp(2.2, 0.06, 17.7, 0, 2.34, -1.2 + 17.7 / 2, '#f7f3fb');
  for (let z = 0; z < 16.5; z += 1.8) glow.cyl(0.07, 0.07, 0.02, 0, 2.32, z, '#fffbe8', 10);
  // ---------- cabine de comando ----------
  const CK = '#4a4f6e';
  b.sharp(3.56, 2.4, 0.12, 0, 0, -4.02, CK); // parede frontal baixa (atrás do painel)
  // painel
  b.box(3.0, 1.0, 0.45, 0, 0, -3.75, '#2c3048');
  b.box(3.0, 0.1, 0.62, 0, 1.0, -3.68, '#1f2236'); // glare shield
  // janelas: postes e teto
  for (const x of [-1.5, -0.74, 0, 0.74, 1.5]) b.sharp(0.09, 0.78, 0.09, x, 1.08, -3.98, CK);
  b.sharp(3.4, 0.5, 0.12, 0, 1.86, -3.98, CK);
  b.sharp(3.4, 0.06, 2.9, 0, 2.18, -2.6, '#3e4360');
  for (const side of [-1, 1]) {
    const X = side * 1.7;
    b.sharp(0.08, 1.12, 2.8, X, 0, -2.6, CK);
    b.sharp(0.08, 0.5, 2.8, X, 1.7, -2.6, CK);
    b.sharp(0.08, 0.58, 0.5, X, 1.12, -3.75, CK);
    b.sharp(0.08, 0.58, 1.3, X, 1.12, -1.85, CK);
    // assentos dos pilotos
    const sx = side * 0.55;
    b.box(0.6, 0.12, 0.55, sx, 0.0, -2.85, '#2a2d40');
    b.box(0.6, 0.18, 0.55, sx, 0.42, -2.85, '#3d405c');
    b.box(0.62, 0.95, 0.16, sx, 0.55, -2.55, '#3d405c');
    b.box(0.4, 0.22, 0.12, sx, 1.5, -2.55, '#55597c');
    b.cyl(0.05, 0.05, 0.42, sx, 0, -2.85, '#888ba3', 8);
    b.box(0.08, 0.06, 0.4, sx - 0.32, 0.72, -2.85, '#2a2d40');
    b.box(0.08, 0.06, 0.4, sx + 0.32, 0.72, -2.85, '#2a2d40');
    // coluna do manche
    b.box(0.1, 0.62, 0.1, sx, 0, -3.42, '#2a2d40');
  }
  // parede de trás com porta aberta
  b.sharp(1.3, 2.4, 0.12, -1.1, 0, -1.2, '#d8cfe8');
  b.sharp(1.3, 2.4, 0.12, 1.1, 0, -1.2, '#d8cfe8');
  b.sharp(0.9, 0.4, 0.12, 0, 2.0, -1.2, '#d8cfe8');
  b.box(0.06, 1.95, 0.85, -0.47, 0, -1.6, '#c3b6dc', 0.0); // porta aberta encostada
  // console central
  metal.box(0.4, 0.8, 0.9, 0, 0, -3.05, '#2a2d40');
  // painel de cima com botões
  b.box(1.2, 0.08, 0.7, 0, 2.08, -3.2, '#2c3048');
  const btnCols = ['#ff5c7a', '#ffd34a', '#3fe06c', '#46d9e6', '#ffffff'];
  for (let i = 0; i < 14; i++) glow.box(0.07, 0.03, 0.07, -0.45 + (i % 7) * 0.15, 2.05, -3.4 + Math.floor(i / 7) * 0.25, btnCols[i % 5]);
  for (let i = 0; i < 10; i++) glow.box(0.06, 0.06, 0.02, -1.2 + i * 0.12 + (i > 4 ? 1.2 : 0), 0.82, -3.53, btnCols[(i * 3) % 5]);
  // ---------- primeira classe ----------
  for (const z of [0.15, 1.95])
    for (const side of [-1, 1]) {
      const x = side * 1.15;
      b.box(0.85, 0.3, 0.75, x, 0.12, z, shade(cab.seat, -0.15));
      b.box(0.8, 0.14, 0.7, x, 0.42, z, cab.seat);
      b.box(0.82, 1.05, 0.2, x, 0.42, z + 0.38, cab.seat);
      b.box(0.5, 0.2, 0.06, x, 1.25, z + 0.3, '#ffffff');
      b.box(0.12, 0.3, 0.7, x - 0.46, 0.42, z, shade(cab.seat, -0.25));
      b.box(0.12, 0.3, 0.7, x + 0.46, 0.42, z, shade(cab.seat, -0.25));
    }
  // ---------- copa ----------
  for (const side of [-1, 1]) {
    const x = side * 1.45;
    b.box(0.62, 1.0, 2.0, x, 0, 4.9, '#e3dcef');
    for (let z = 4.0; z < 5.9; z += 0.5) b.sharp(0.02, 0.85, 0.02, x - side * 0.31, 0.08, z, '#b5a8d0');
    b.box(0.64, 0.05, 2.02, x, 1.0, 4.9, '#c7bde0');
    b.box(0.45, 0.55, 2.0, side * 1.53, 1.7, 4.9, '#efe8f8');
  }
  // bebedouro e cesta de lanches
  b.lathe(
    [
      [0, 0],
      [0.14, 0],
      [0.16, 0.05],
      [0.16, 0.36],
      [0.1, 0.42],
      [0.05, 0.46],
      [0, 0.46],
    ],
    SPOTS.water.x,
    1.05,
    SPOTS.water.z,
    '#7ad8ff',
    14,
  );
  b.box(0.36, 0.2, 0.44, SPOTS.snack.x, 1.05, SPOTS.snack.z, '#ffb02e');
  for (let i = 0; i < 5; i++) b.box(0.1, 0.12, 0.08, SPOTS.snack.x - 0.1 + (i % 3) * 0.1, 1.2, SPOTS.snack.z - 0.12 + i * 0.06, ['#ff5c7a', '#3fe06c', '#ffd34a', '#46d9e6', '#a78bff'][i]);
  // forno
  b.box(0.5, 0.5, 0.6, 1.5, 1.05, SPOTS.oven.z, '#9aa0b8');
  // suporte do extintor
  metal.box(0.08, 0.5, 0.2, 1.74, 0.8, 4.25, '#9aa0b8');
  metal.box(0.08, 0.5, 0.2, -1.74, 0.8, 18.3, '#9aa0b8');
  // ---------- econômica ----------
  for (const z of WIN_Z)
    for (const x of [-1.3, -0.82, 0.82, 1.3]) {
      const s = x < 0 ? -1 : 1;
      const col = (Math.round(z * 10) + (x > 0 ? 1 : 0)) % 5 === 0 ? cab.seat2 : cab.seat;
      b.box(0.44, 0.12, 0.48, x, 0.3, z, shade(col, -0.2));
      b.box(0.42, 0.12, 0.46, x, 0.4, z - 0.01, col);
      b.box(0.44, 0.78, 0.13, x, 0.42, z + 0.27, col, 0, -0.12);
      b.box(0.3, 0.14, 0.04, x, 1.04, z + 0.33, '#ffffff', 0, -0.12);
      if (Math.abs(x) < 1) b.box(0.06, 0.24, 0.42, x - s * 0.25, 0.42, z, shade(col, -0.3));
      metal.cyl(0.03, 0.03, 0.3, x, 0, z, '#9aa0b8', 6);
    }
  // fileira da saída de emergência (porta com alça vermelha)
  for (const side of [-1, 1]) {
    b.box(0.06, 1.4, 0.75, side * 1.74, 0.45, 10.6, '#d8cfe8');
    b.box(0.05, 0.06, 0.3, side * 1.69, 1.62, 10.6, '#ff3d5a');
  }
  // anteparo traseiro (porão)
  b.sharp(1.25, 2.4, 0.18, -1.13, 0, 16.6, '#cfc6e0');
  b.sharp(1.25, 2.4, 0.18, 1.13, 0, 16.6, '#cfc6e0');
  b.sharp(1.0, 0.4, 0.18, 0, 2.0, 16.6, '#cfc6e0');
  // ---------- porão de carga ----------
  for (const side of [-1, 1]) {
    metal.sharp(0.08, 2.4, 4.4, side * WALL_X, 0, 18.8, CARGO);
    for (let z = 16.9; z < 21; z += 0.6) metal.box(0.1, 2.3, 0.08, side * (WALL_X - 0.06), 0, z, '#6d7088');
  }
  metal.sharp(3.56, 0.08, 4.4, 0, 2.3, 18.8, '#7b7e95');
  metal.sharp(3.56, 2.4, 0.1, 0, 0, 21.0, CARGO);
  // prateleiras e caixas
  for (const side of [-1, 1]) {
    const x = side * 1.47;
    metal.box(0.56, 0.05, 1.5, x, 0.9, 17.95, '#5b5e74');
    metal.box(0.56, 0.05, 1.5, x, 0.45, 17.95, '#5b5e74');
    for (const z of [17.25, 18.65]) metal.box(0.05, 1.5, 0.05, x - side * 0.25, 0, z, '#5b5e74');
  }
  for (let i = 0; i < 4; i++) b.box(0.45, 0.4, 0.45, 1.45, 0.48, 17.4 + i * 0.36, ['#c98a4a', '#a8743c', '#d9a066', '#b07a42'][i]);
  for (let i = 0; i < 3; i++) b.box(0.5, 0.45 - i * 0.12, 0.5, 0.98 + (i % 2) * 0.52, i === 2 ? 0.45 : 0, 20.65, ['#8a5cff', '#2fb6ff', '#ff7a3a'][i]);
  // tanque de combustível + bomba
  metal.cyl(0.42, 0.42, 1.8, -1.32, 0.48, 18.9, '#c6c9d8', 16, Math.PI / 2);
  metal.box(0.1, 0.4, 0.5, -1.72, 0.5, 19.8, '#9aa0b8');
  metal.box(0.32, 1.1, 0.5, 1.6, 0, 19.8, '#ff7a3a');
  metal.cyl(0.13, 0.13, 0.05, 1.43, 1.0, 19.8, '#ffffff', 14, 0, Math.PI / 2);
  // alçapão do trem
  metal.sharp(0.9, 0.02, 0.9, 0, 0, 20.4, '#2a2d40');
  for (let i = 0; i < 4; i++) metal.sharp(0.9, 0.025, 0.1, 0, 0.0, 20.0 + i * 0.25, i % 2 ? '#2a2d40' : '#ffd34a');
  // painel elétrico e válvula
  metal.box(0.1, 0.75, 0.62, 1.72, 0.95, SPOTS.elec.z, '#9aa0b8');
  metal.box(0.1, 0.7, 0.6, 1.72, 0.85, SPOTS.valve.z, '#9aa0b8');
  // lâmpadas de alarme (vermelhas) no teto
  const alarm = new GeoBuilder();
  alarm.ao = false;
  alarm.bevel = 0;
  for (const z of [-2.0, 3.0, 8.0, 13.5, 18.5]) alarm.sph(0.08, 0, 2.3, z, '#ff2a4a', 1, 0.6, 1, 8);

  const solid = new THREE.Mesh(b.build(), mat(standard));
  solid.castShadow = true;
  solid.receiveShadow = true;
  const metalM = new THREE.Mesh(metal.build(), mat(standard, { rough: 0.45, metal: 0.35 }));
  metalM.receiveShadow = true;
  const lights = new THREE.Mesh(glow.build(), mat(standard, { emissive: true }));
  const alarmLamps = new THREE.Mesh(alarm.build(), new THREE.MeshBasicMaterial({ color: '#ff2a4a', toneMapped: false }));
  group.add(solid, metalM, lights, alarmLamps);

  // vidros
  const wins: CabinRefs['wins'] = [];
  const glassMat = new THREE.MeshBasicMaterial({ color: '#cfefff', transparent: true, opacity: 0.12, depthWrite: false });
  const glassG = new THREE.PlaneGeometry(WIN_W, WIN_H);
  for (const side of [-1, 1])
    for (const z of [0.15, 1.95, ...WIN_Z, 10.6]) {
      const g = new THREE.Mesh(glassG, glassMat);
      g.position.set(side * (WALL_X + 0.02), WIN_Y, z);
      g.rotation.y = -side * (Math.PI / 2);
      group.add(g);
      wins.push({ x: side * WALL_X, z, y: WIN_Y, glass: g });
    }
  // telas (PFD e mapa)
  const pfd = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.42), new THREE.MeshBasicMaterial({ map: pfdTex, toneMapped: false }));
  pfd.position.set(-0.55, 0.78, -3.52);
  pfd.rotation.x = -0.25;
  const nav = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.42), new THREE.MeshBasicMaterial({ map: navTex, toneMapped: false }));
  nav.position.set(0.55, 0.78, -3.52);
  nav.rotation.x = -0.25;
  group.add(pfd, nav);

  const mk = (fn: (g: GeoBuilder) => void, m = mat(standard)) => {
    const g = new GeoBuilder();
    g.bevel = bevel;
    fn(g);
    return new THREE.Mesh(g.build(), m);
  };
  // manches (o "W" do Bloop Air: duas alças e centro arredondado)
  const yoke = (side: number) => {
    const g = new THREE.Group();
    g.position.set(side * 0.55, 0.7, -3.36);
    g.add(
      mk((y) => {
        y.box(0.08, 0.08, 0.3, 0, -0.04, 0.12, '#2a2d40');
        y.box(0.34, 0.1, 0.06, 0, 0, 0.26, '#3d405c');
        y.box(0.07, 0.2, 0.07, -0.18, 0, 0.26, '#3d405c');
        y.box(0.07, 0.2, 0.07, 0.18, 0, 0.26, '#3d405c');
        y.box(0.08, 0.05, 0.05, 0, 0.08, 0.29, '#ffd34a');
      }),
    );
    group.add(g);
    return g;
  };
  const yokeL = yoke(-1);
  const yokeR = yoke(1);
  const lever = (x: number, z: number, col: string, knob: 'ball' | 'wheel' | 'flap') => {
    const g = new THREE.Group();
    g.position.set(x, 0.8, z);
    g.add(
      mk((y) => {
        y.box(0.03, 0.22, 0.03, 0, 0, 0, '#888ba3');
        if (knob === 'wheel') y.cyl(0.06, 0.06, 0.04, 0, 0.22, 0, col, 12, Math.PI / 2);
        else if (knob === 'flap') y.box(0.09, 0.05, 0.06, 0, 0.22, 0, col);
        else y.sph(0.04, 0, 0.24, 0, col);
      }),
    );
    group.add(g);
    return g;
  };
  const throttle = new THREE.Group();
  throttle.position.set(0, 0.8, -3.15);
  for (const x of [-0.07, 0.07]) {
    const l = mk((y) => {
      y.box(0.03, 0.2, 0.03, 0, 0, 0, '#888ba3');
      y.box(0.08, 0.05, 0.06, 0, 0.2, 0, '#2a2d40');
    });
    l.position.x = x;
    throttle.add(l);
  }
  group.add(throttle);
  const flapLever = lever(0.13, -3.45, '#e0e4f0', 'flap');
  const gearLever = lever(-0.22, -3.6, '#ffffff', 'wheel');
  // porta do painel elétrico (abre na pane)
  const elecDoor = new THREE.Group();
  elecDoor.position.set(1.66, 0.95, SPOTS.elec.z - 0.31);
  const ed = mk((y) => y.box(0.04, 0.73, 0.6, 0, 0, 0.3, '#b9bdd0'));
  elecDoor.add(ed);
  group.add(elecDoor);
  // portas
  const door = (z: number) => {
    const g = new THREE.Group();
    g.position.set(-WALL_X, 0, z - 0.5);
    g.add(
      mk((y) => {
        y.box(0.1, 1.95, 0.98, 0, 0.02, 0.5, '#e6e0f2');
        y.box(0.04, 0.06, 0.32, 0.07, 1.05, 0.5, '#ff3d5a');
        y.box(0.03, 0.4, 0.04, 0.07, 1.0, 0.36, '#ff3d5a');
        y.geo(frameGeo(0.22, 0.28, 0.04, 0.05), '#ffffff', 0.06, 1.45, 0.5, 0, Math.PI / 2, 0);
      }),
    );
    group.add(g);
    return g;
  };
  const doorF = door(SPOTS.doorF.z);
  const doorR = door(SPOTS.doorR.z);
  // volante da válvula
  const valve = new THREE.Group();
  valve.position.set(1.64, 1.2, SPOTS.valve.z);
  valve.add(
    mk((y) => {
      y.torus(0.2, 0.03, 0, 0, 0, '#ff3d5a', 0, 20, Math.PI / 2);
      y.box(0.03, 0.4, 0.04, 0, -0.2, 0, '#ff3d5a');
      y.box(0.03, 0.04, 0.4, 0, 0, 0, '#ff3d5a');
      y.cyl(0.05, 0.05, 0.08, -0.04, 0, 0, '#ffd34a', 10, 0, Math.PI / 2);
    }),
  );
  group.add(valve);
  // manivela do trem
  const crank = new THREE.Group();
  crank.position.set(0, 0.32, 20.4);
  crank.add(
    mk((y) => {
      y.cyl(0.04, 0.04, 0.3, 0, -0.3, 0, '#888ba3', 8);
      y.box(0.36, 0.05, 0.05, 0.18, 0, 0, '#ffd34a');
      y.cyl(0.03, 0.03, 0.18, 0.34, 0, 0, '#ff3d5a', 8);
    }),
  );
  group.add(crank);
  // alavanca da bomba
  const pump = new THREE.Group();
  pump.position.set(1.48, 1.0, 19.8);
  pump.add(
    mk((y) => {
      y.box(0.04, 0.04, 0.45, 0, 0, 0.2, '#2a2d40');
      y.box(0.08, 0.08, 0.12, 0, -0.02, 0.44, '#ffd34a');
    }),
  );
  group.add(pump);
  const ovenGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.26), new THREE.MeshBasicMaterial({ color: '#3a2a3a', toneMapped: false }));
  ovenGlow.position.set(1.24, 1.3, SPOTS.oven.z);
  ovenGlow.rotation.y = -Math.PI / 2;
  group.add(ovenGlow);
  // portas dos bagageiros (abrem na turbulência)
  const bins = new THREE.Group();
  for (const side of [-1, 1])
    for (const z of [7.0, 8.8, 12.0, 13.8]) {
      const d = new THREE.Group();
      d.position.set(side * 1.06, 2.03, z);
      const m = mk((y) => y.box(0.03, 0.26, 1.6, 0, -0.26, 0, '#f2edf9'));
      d.add(m);
      d.userData.side = side;
      bins.add(d);
    }
  group.add(bins);
  // máscaras de oxigênio (caem na despressurização)
  const mg = new GeoBuilder();
  mg.bevel = 0;
  mg.cyl(0.002, 0.002, 0.5, 0, 0, 0, '#ffffff', 3);
  mg.cyl(0.07, 0.05, 0.09, 0, -0.06, 0, '#ffd34a', 10);
  const masks = new THREE.InstancedMesh(mg.build(), mat(standard), 40);
  const maskBase: THREE.Matrix4[] = [];
  const tmp = new THREE.Matrix4();
  let n = 0;
  for (const z of [0.15, 1.95, ...WIN_Z])
    for (const x of z < 3 ? [-1.15, 1.15] : [-1.06, 1.06]) {
      tmp.makeTranslation(x, 1.55, z);
      maskBase.push(tmp.clone());
      masks.setMatrixAt(n++, tmp);
    }
  masks.count = n;
  masks.visible = false;
  group.add(masks);
  const tapePatches = new THREE.Group();
  group.add(tapePatches);
  return { group, yokeL, yokeR, throttle, flapLever, gearLever, pfd, nav, elecDoor, doorF, doorR, valve, crank, pump, ovenGlow, lights, alarmLamps, wins, bins, masks, maskBase, tapePatches };
}

/** "X" de fita prateada (para janela/tanque tapados) */
export function tapeX(standard: boolean): THREE.Mesh {
  const g = new GeoBuilder();
  g.bevel = 0;
  g.sharp(0.02, 0.07, 0.5, 0, -0.035, 0, '#d7dbe8', 0, 0.75);
  g.sharp(0.02, 0.07, 0.5, 0, -0.035, 0, '#c5c9d8', 0, -0.75);
  return new THREE.Mesh(g.build(), mat(standard));
}

/* ============================== BLOOPS ============================== */

export interface BloopCols {
  light: string;
  dark: string;
  belly: string;
}
export type Eyes = 'normal' | 'spiral' | 'happy' | 'worried';

/** Bloop 3D (~1,1 m) com chapéu do papel (role -1 = sem chapéu; 9 = quepe do comandante) */
export function bloopGeo(c: BloopCols, role: number, eyes: Eyes = 'normal', scale = 1): THREE.BufferGeometry {
  const g = new GeoBuilder();
  g.bevel = 1;
  g.ao = false;
  const R = 0.42;
  const cy = 0.5;
  g.sph(R, 0, cy, 0, c.light, 1, 1.08, 0.96, 16);
  g.sph(R * 0.7, 0, cy - 0.06, -R * 0.42, c.belly, 0.95, 0.9, 0.5, 12);
  // pés
  for (const s of [-1, 1]) g.sph(0.12, s * 0.18, 0.08, -0.08, c.dark, 1.2, 0.7, 1.5, 8);
  // bracinhos
  for (const s of [-1, 1]) g.sph(0.09, s * 0.42, cy - 0.05, -0.05, c.light, 0.8, 1.3, 0.8, 8);
  // olhos
  const ey = cy + 0.13;
  for (const s of [-1, 1]) {
    const ex = s * 0.15;
    if (eyes === 'happy') {
      g.torus(0.07, 0.022, ex, ey, -R * 0.9, INK, 0, 10, 0, Math.PI);
    } else {
      g.sph(0.11, ex, ey, -R * 0.82, '#ffffff', 1, 1.15, 0.55, 12);
      if (eyes === 'spiral') {
        g.torus(0.065, 0.012, ex, ey, -R * 0.9 - 0.035, INK, 0, 14);
        g.torus(0.03, 0.012, ex, ey, -R * 0.9 - 0.04, INK, 0, 10);
      } else {
        g.sph(0.055, ex + (eyes === 'worried' ? s * 0.01 : 0), ey - 0.01, -R * 0.82 - 0.045, INK, 1, 1.15, 0.6, 10);
        g.sph(0.02, ex + 0.02, ey + 0.03, -R * 0.82 - 0.075, '#ffffff', 1, 1, 0.6, 6);
      }
    }
  }
  // boca
  if (eyes === 'worried') g.torus(0.05, 0.016, 0, cy - 0.08, -R * 0.93, INK, 0, 10, 0, Math.PI);
  else if (eyes === 'spiral') g.sph(0.06, 0.03, cy - 0.08, -R * 0.9, '#ff6a8a', 1, 0.7, 0.5, 8);
  else g.torus(0.05, 0.016, 0, cy - 0.02, -R * 0.93, INK, Math.PI, 10, 0, Math.PI);
  // bochechas
  for (const s of [-1, 1]) g.sph(0.05, s * 0.27, cy - 0.02, -R * 0.78, '#ff9ab8', 1, 0.6, 0.4, 6);
  if (role >= 0) hat(g, role, cy + R * 1.0);
  const geo = g.build();
  if (scale !== 1) geo.scale(scale, scale, scale);
  return geo;
}

function hat(g: GeoBuilder, role: number, top: number): void {
  if (role === 9) {
    // quepe do comandante desmaiado: preto com louros
    g.cyl(0.3, 0.26, 0.16, 0, top - 0.04, 0.02, '#1c1f30', 16);
    g.cyl(0.27, 0.27, 0.06, 0, top - 0.04, 0.02, '#ffd34a', 16);
    g.cyl(0.2, 0.2, 0.02, 0, top - 0.06, -0.2, '#1c1f30', 14, 0.25);
    return;
  }
  const [a, b, c] = HAT_COLS[role] ?? HAT_COLS[0];
  if (role <= 1) {
    g.cyl(0.31, 0.25, 0.17, 0, top - 0.05, 0.03, a, 18);
    g.cyl(0.26, 0.26, 0.06, 0, top - 0.05, 0.03, b, 18);
    // aba
    g.cyl(0.2, 0.2, 0.02, 0, top - 0.06, -0.19, '#2a2f45', 14, 0.28);
    if (role === 0) {
      // asinhas douradas
      g.box(0.22, 0.04, 0.02, 0, top + 0.03, -0.27, b, 0, 0, 0);
      g.sph(0.035, 0, top + 0.05, -0.28, c, 1, 1, 0.6, 8);
    } else {
      g.sph(0.04, 0, top + 0.04, -0.27, c, 1, 1, 0.6, 8);
      g.box(0.3, 0.02, 0.02, 0, top + 0.12, -0.24, c);
    }
  } else if (role === 2) {
    // boina inclinada
    g.sph(0.28, 0.04, top + 0.02, 0.02, a, 1.05, 0.32, 1, 14);
    g.sph(0.04, 0.12, top + 0.1, 0.02, c, 1, 1, 1, 8);
    // lenço no "pescoço"
    g.torus(0.32, 0.04, 0, 0.34, 0, b, Math.PI / 2, 16, 0);
    g.sph(0.07, 0.14, 0.31, -0.3, b, 1.3, 0.8, 0.6, 8);
  } else {
    // chapeuzinho redondo
    g.cyl(0.2, 0.22, 0.15, 0.05, top - 0.04, 0.03, a, 16, 0, -0.18);
    g.cyl(0.215, 0.215, 0.035, 0.05, top + 0.0, 0.03, c, 16, 0, -0.18);
    g.torus(0.32, 0.04, 0, 0.34, 0, b, Math.PI / 2, 16, 0);
    g.sph(0.07, -0.14, 0.31, -0.3, b, 1.3, 0.8, 0.6, 8);
  }
}

/* ============================== OBJETOS ============================== */

export function itemGeo(k: ItemKind, variant = 0): THREE.BufferGeometry {
  const g = new GeoBuilder();
  g.bevel = 1;
  g.ao = false;
  if (k === 'ext') {
    g.rcyl(0.09, 0.42, 0, -0.2, 0, '#ff3d5a', 14, 0.35);
    g.cyl(0.03, 0.04, 0.08, 0, 0.22, 0, '#2a2d40', 8);
    g.box(0.16, 0.03, 0.04, 0.05, 0.28, 0, '#888ba3');
    g.tube(
      [
        [0, 0.27, 0],
        [-0.08, 0.3, -0.06],
        [-0.12, 0.2, -0.14],
      ],
      0.018,
      '#2a2d40',
      8,
      5,
    );
    g.box(0.18, 0.06, 0.005, 0, -0.05, -0.09, '#ffffff');
  } else if (k === 'tape') {
    g.torus(0.09, 0.04, 0, 0, 0, '#c5c9d8', Math.PI / 2, 16);
    g.cyl(0.06, 0.06, 0.07, 0, -0.035, 0, '#a37a4a', 12);
  } else if (k === 'water') {
    g.lathe(
      [
        [0, 0],
        [0.05, 0],
        [0.055, 0.02],
        [0.055, 0.18],
        [0.03, 0.22],
        [0.02, 0.25],
        [0, 0.25],
      ],
      0,
      -0.12,
      0,
      '#7ad8ff',
      10,
    );
    g.cyl(0.022, 0.022, 0.03, 0, 0.13, 0, '#2fb6ff', 8);
  } else if (k === 'snack') {
    g.box(0.16, 0.2, 0.06, 0, -0.1, 0, ['#ffb02e', '#ff5cae', '#3fe06c'][variant % 3]);
    g.sph(0.04, 0, 0.0, -0.035, '#ffd34a', 1, 1, 0.4, 8);
  } else {
    const cols = ['#8a5cff', '#2fb6ff', '#ff7a3a', '#3fe06c', '#ff5cae'];
    g.box(0.5, 0.36, 0.22, 0, -0.18, 0, cols[variant % cols.length]);
    g.box(0.18, 0.06, 0.04, 0, 0.18, 0, '#2a2d40');
    g.box(0.52, 0.04, 0.24, 0, -0.02, 0, shade(cols[variant % cols.length], -0.25));
  }
  return g.build();
}

/* ============================== AVIÃO POR FORA ============================== */

export interface ExtRefs {
  group: THREE.Group;
  gear: THREE.Group[];
  beacon: THREE.Mesh;
  fans: THREE.Mesh[];
  /** chamas dos motores (escala/visível) */
  engFire: THREE.Mesh[];
  wins: THREE.InstancedMesh;
  darkWins: THREE.Mesh;
}
export function buildExterior(l: Livery, standard: boolean, lite: boolean): ExtRefs {
  const group = new THREE.Group();
  const b = new GeoBuilder();
  b.bevel = lite ? 1 : 2;
  b.ao = false;
  const seg = lite ? 18 : 28;
  // fuselagem (torno ao longo de z), cauda levantada
  const prof: [number, number][] = [
    [0.0, -6.6],
    [0.55, -6.45],
    [1.1, -6.0],
    [1.55, -5.3],
    [1.85, -4.4],
    [2.02, -3.3],
    [FUSE_R, -2.2],
    [FUSE_R, 18.0],
    [1.95, 19.6],
    [1.65, 21.2],
    [1.2, 22.8],
    [0.6, 24.3],
    [0.15, 25.2],
    [0, 25.3],
  ];
  const fg = new THREE.LatheGeometry(
    prof.map(([r, z]) => new THREE.Vector2(r, z)),
    seg,
  );
  fg.rotateX(Math.PI / 2);
  const p = fg.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    let y = p.getY(i);
    if (z > 17.5) y = y * (1 - (z - 17.5) * 0.02) + (z - 17.5) * 0.17;
    if (z < -3.3) y += (-3.3 - z) * -0.08;
    p.setY(i, y + FUSE_Y);
  }
  fg.computeVertexNormals();
  // cores por vértice: barriga, faixa, corpo
  const fuse = fg.toNonIndexed();
  fg.dispose();
  const fp = fuse.getAttribute('position');
  const cols = new Float32Array(fp.count * 3);
  const C = new THREE.Color();
  const cb = new THREE.Color(l.body).convertSRGBToLinear();
  const cbe = new THREE.Color(l.belly).convertSRGBToLinear();
  const cs = new THREE.Color(l.stripe).convertSRGBToLinear();
  const rainbow = l.id === 'rainbow';
  for (let i = 0; i < fp.count; i++) {
    const y = fp.getY(i) - FUSE_Y;
    const z = fp.getZ(i);
    const ty = z > 17.5 ? (z - 17.5) * 0.17 : 0;
    const yy = y - ty;
    if (yy < -0.55) C.copy(cbe);
    else if (yy > 0.45 && yy < 0.7 && z > -5) {
      if (rainbow) C.setHSL((((z + 6) / 30) % 1) * 0.85, 0.85, 0.6).convertSRGBToLinear();
      else C.copy(cs);
    } else C.copy(cb);
    cols[i * 3] = C.r;
    cols[i * 3 + 1] = C.g;
    cols[i * 3 + 2] = C.b;
  }
  fuse.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const fuseMesh = new THREE.Mesh(fuse, mat(standard, { rough: 0.35, metal: 0.1 }));
  fuseMesh.castShadow = true;
  group.add(fuseMesh);
  // janelas (pontinhos escuros) e para-brisa
  const wg = new THREE.SphereGeometry(0.13, 8, 6);
  wg.scale(0.35, 1.35, 1);
  const wins = new THREE.InstancedMesh(wg, new THREE.MeshBasicMaterial({ color: '#2a3050' }), 64);
  const m4 = new THREE.Matrix4();
  let wn = 0;
  for (const s of [-1, 1])
    for (let z = -1.6; z < 16.4; z += 0.9) {
      m4.makeTranslation(s * (FUSE_R - 0.01), FUSE_Y + 0.17, z);
      wins.setMatrixAt(wn++, m4);
    }
  wins.count = wn;
  group.add(wins);
  const dk = new GeoBuilder();
  dk.ao = false;
  dk.bevel = 1;
  dk.box(1.9, 0.42, 0.9, 0, FUSE_Y + 0.55, -4.75, '#1e2440', 0, -0.62);
  for (const s of [-1, 1]) dk.box(0.3, 0.38, 0.7, s * 1.72, FUSE_Y + 0.42, -3.6, '#1e2440', s * 0.3);
  const darkWins = new THREE.Mesh(dk.build(), new THREE.MeshBasicMaterial({ vertexColors: true }));
  group.add(darkWins);
  // asas (planta trapezoidal, diedro)
  const wing = (s: number, x0: number, x1: number, zr0: number, zr1: number, zt0: number, zt1: number, y: number, dih: number, col: string, th: number) => {
    const shape = new THREE.Shape();
    shape.moveTo(x0, zr0);
    shape.lineTo(x1, zt0);
    shape.lineTo(x1, zt1);
    shape.lineTo(x0, zr1);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: th, bevelEnabled: true, bevelThickness: th * 0.4, bevelSize: th * 0.4, bevelSegments: 1, steps: 1 });
    g.rotateX(Math.PI / 2);
    const pa = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i);
      pa.setY(i, pa.getY(i) + y + Math.max(0, x - x0) * dih + th);
      pa.setX(i, x * s);
    }
    const ng = s < 0 ? flipWinding(g) : g;
    ng.computeVertexNormals();
    b.geo(ng, col);
  };
  for (const s of [-1, 1]) {
    wing(s, 1.6, 16.5, 7.6, 12.8, 12.4, 13.9, FUSE_Y - 1.55, 0.06, '#e8ecf6', 0.22);
    // winglet
    b.box(0.12, 1.4, 1.2, s * 16.5, FUSE_Y - 0.6, 13.3, l.stripe, 0, 0.35, -s * 0.1);
    // estabilizadores
    wing(s, 0.4, 6.3, 20.6, 23.4, 23.0, 24.2, FUSE_Y + 1.5, 0.08, '#e8ecf6', 0.14);
    // motor (nacele)
    const ex = s * 6.0;
    b.lathe(
      [
        [0.62, 0],
        [0.78, 0.25],
        [0.82, 1.2],
        [0.74, 2.6],
        [0.5, 3.2],
        [0.38, 3.4],
      ],
      ex,
      FUSE_Y - 2.35,
      7.3,
      l.body,
      seg,
      Math.PI / 2,
    );
    b.torus(0.7, 0.07, ex, FUSE_Y - 2.35, 7.32, l.stripe, 0, seg);
    b.box(0.22, 0.7, 2.4, ex, FUSE_Y - 1.85, 8.9, '#d9dde8');
  }
  // deriva com rosto de Bloop
  const fin = new THREE.Shape();
  fin.moveTo(0, 0);
  fin.lineTo(4.4, 0);
  fin.lineTo(5.6, 4.8);
  fin.lineTo(4.0, 4.8);
  fin.closePath();
  const fing = new THREE.ExtrudeGeometry(fin, { depth: 0.24, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 1 });
  fing.rotateY(-Math.PI / 2);
  fing.translate(0.12, FUSE_Y + 1.9, 19.4);
  b.geo(fing, l.tail);
  for (const s of [-1, 1]) {
    b.sph(0.8, s * 0.2, FUSE_Y + 4.1, 22.7, l.belly === '#1c1f4a' ? '#ffd34a' : '#ffffff', 0.15, 1, 1, 14);
    b.sph(0.2, s * 0.27, FUSE_Y + 4.3, 22.35, '#ffffff', 0.12, 1.2, 1, 8);
    b.sph(0.1, s * 0.31, FUSE_Y + 4.28, 22.3, INK, 0.1, 1.2, 1, 8);
    b.sph(0.2, s * 0.27, FUSE_Y + 4.3, 23.0, '#ffffff', 0.12, 1.2, 1, 8);
    b.sph(0.1, s * 0.31, FUSE_Y + 4.28, 22.95, INK, 0.1, 1.2, 1, 8);
    b.torus(0.18, 0.04, s * 0.29, FUSE_Y + 3.85, 22.65, INK, Math.PI, 10, Math.PI / 2, Math.PI);
  }
  const body = new THREE.Mesh(b.build(), mat(standard, { rough: 0.4, metal: 0.12 }));
  body.castShadow = true;
  group.add(body);
  // ventoinhas (giram)
  const fans: THREE.Mesh[] = [];
  const fanG = new GeoBuilder();
  fanG.ao = false;
  fanG.bevel = 0;
  fanG.cyl(0.62, 0.62, 0.04, 0, 0, 0, '#3a3f5a', 18, Math.PI / 2);
  for (let i = 0; i < 8; i++) fanG.box(0.08, 0.58, 0.03, 0, 0, -0.04, '#c6c9d8', 0, 0, (i / 8) * TAU);
  fanG.sph(0.18, 0, 0, -0.08, '#e8ecf6', 1, 1, 1.4, 10);
  const fanGeo = fanG.build();
  for (const s of [-1, 1]) {
    const f = new THREE.Mesh(fanGeo, mat(standard));
    f.position.set(s * 6.0, FUSE_Y - 2.35, 7.55);
    group.add(f);
    fans.push(f);
  }
  // trem de pouso
  const gear: THREE.Group[] = [];
  const gearG = (x: number, z: number, two: boolean) => {
    const g = new THREE.Group();
    g.position.set(x, FUSE_Y - 1.4, z);
    const gb = new GeoBuilder();
    gb.bevel = 1;
    gb.ao = false;
    gb.cyl(0.09, 0.09, 1.95, 0, -1.95, 0, '#c6c9d8', 8);
    const ws = two ? [-0.28, 0.28] : [0];
    for (const dx of ws) {
      gb.cyl(0.32, 0.32, 0.22, dx + 0.11, -2.05, 0, '#2a2d40', 14, 0, Math.PI / 2);
      gb.cyl(0.16, 0.16, 0.24, dx + 0.12, -2.05, 0, '#c6c9d8', 10, 0, Math.PI / 2);
    }
    const m = new THREE.Mesh(gb.build(), mat(standard));
    g.add(m);
    group.add(g);
    gear.push(g);
  };
  gearG(-2.7, 11.4, true);
  gearG(2.7, 11.4, true);
  gearG(0, -3.4, false);
  // luzes de navegação
  const navG = new THREE.SphereGeometry(0.16, 8, 6);
  const red = new THREE.Mesh(navG, new THREE.MeshBasicMaterial({ color: '#ff3040', toneMapped: false }));
  red.position.set(-16.5, FUSE_Y - 0.6, 13.4);
  const green = new THREE.Mesh(navG, new THREE.MeshBasicMaterial({ color: '#30ff70', toneMapped: false }));
  green.position.set(16.5, FUSE_Y - 0.6, 13.4);
  const beacon = new THREE.Mesh(navG, new THREE.MeshBasicMaterial({ color: '#ff2020', toneMapped: false }));
  beacon.position.set(0, FUSE_Y + FUSE_R + 0.05, 9);
  group.add(red, green, beacon);
  // chamas dos motores (cones aditivos)
  const engFire: THREE.Mesh[] = [];
  const flameMat = new THREE.MeshBasicMaterial({ color: '#ff9a3a', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  for (const s of [-1, 1]) {
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3.2, 10, 1, true), flameMat);
    fl.rotation.x = Math.PI / 2;
    fl.position.set(s * 6.0, FUSE_Y - 2.1, 12.2);
    fl.visible = false;
    group.add(fl);
    engFire.push(fl);
  }
  return { group, gear, beacon, fans, engFire, wins, darkWins };
}

function flipWinding(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(ng.attributes)) {
    const a = ng.getAttribute(name) as THREE.BufferAttribute;
    const n = a.itemSize;
    const arr = a.array as Float32Array;
    for (let i = 0; i < a.count; i += 3) {
      for (let k = 0; k < n; k++) {
        const t1 = arr[(i + 1) * n + k];
        arr[(i + 1) * n + k] = arr[(i + 2) * n + k];
        arr[(i + 2) * n + k] = t1;
      }
    }
  }
  return ng;
}

/* ============================== MUNDO ============================== */

/** céu em degradê com sol (shader leve) */
export function skyDome(): THREE.Mesh {
  const g = new THREE.SphereGeometry(80000, 32, 16);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color('#3b5bb8') },
      mid: { value: new THREE.Color('#f4a9a0') },
      hor: { value: new THREE.Color('#ffd08a') },
      sunDir: { value: new THREE.Vector3(-0.8, 0.15, 0.4).normalize() },
      sunCol: { value: new THREE.Color('#fff0c0') },
    },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w*0.99999; }`,
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 vD;
      void main(){ float h = vD.y; vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.02, 0.55, h)) : mix(hor, hor*0.75, smoothstep(0.0,-0.3,h));
        c = mix(hor, c, smoothstep(-0.02, 0.12, h) * (h>0.0?1.0:0.0) + (h>0.0?0.0:1.0));
        float s = max(0.0, dot(vD, sunDir)); c += sunCol * (pow(s, 900.0)*2.5 + pow(s, 24.0)*0.35 + pow(s,4.0)*0.12);
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

/** textura do chão (plantações, rios, cidades) */
export function groundTexture(size: number): THREE.CanvasTexture {
  const [cv, c] = canvas(size, size);
  const S = size;
  c.fillStyle = '#7cae5a';
  c.fillRect(0, 0, S, S);
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const fields = ['#8fbf5e', '#a7c96a', '#d9c879', '#6c9e4e', '#b8d17a', '#c9b263', '#5f8f48', '#9cc46a'];
  const cell = S / 48;
  for (let gy = 0; gy < 48; gy++)
    for (let gx = 0; gx < 48; gx++) {
      c.fillStyle = fields[Math.floor(r() * fields.length)];
      const w = cell * (0.85 + r() * 0.3);
      c.fillRect(gx * cell + 1, gy * cell + 1, w - 2, cell * (0.85 + r() * 0.3) - 2);
      if (r() < 0.35) {
        c.strokeStyle = 'rgba(0,0,0,0.06)';
        c.lineWidth = 1;
        for (let k = 2; k < w; k += 3) {
          c.beginPath();
          c.moveTo(gx * cell + k, gy * cell);
          c.lineTo(gx * cell + k, gy * cell + cell);
          c.stroke();
        }
      }
    }
  // florestas
  for (let i = 0; i < 70; i++) {
    c.fillStyle = r() < 0.5 ? '#3f7a3c' : '#4a8a44';
    c.beginPath();
    c.ellipse(r() * S, r() * S, S * (0.01 + r() * 0.03), S * (0.01 + r() * 0.025), r() * 3, 0, TAU);
    c.fill();
  }
  // rio
  c.strokeStyle = '#4aa8d8';
  c.lineWidth = S * 0.008;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(0, S * 0.3);
  for (let i = 1; i <= 20; i++) c.lineTo((i / 20) * S, S * 0.3 + Math.sin(i * 0.9) * S * 0.06 + i * S * 0.012);
  c.stroke();
  // lagos
  for (let i = 0; i < 6; i++) {
    c.fillStyle = '#5ab8e0';
    c.beginPath();
    c.ellipse(r() * S, r() * S, S * 0.015, S * 0.01, r() * 3, 0, TAU);
    c.fill();
  }
  // estradas e vilas
  c.strokeStyle = 'rgba(120,110,120,0.55)';
  c.lineWidth = S * 0.0025;
  for (let i = 0; i < 9; i++) {
    c.beginPath();
    c.moveTo(r() * S, 0);
    c.lineTo(r() * S, S);
    c.stroke();
    c.beginPath();
    c.moveTo(0, r() * S);
    c.lineTo(S, r() * S);
    c.stroke();
  }
  for (let i = 0; i < 26; i++) {
    const x = r() * S;
    const y = r() * S;
    for (let k = 0; k < 14; k++) {
      c.fillStyle = ['#e6d6c8', '#f0b8a0', '#d8d0e0', '#c98a7a'][k % 4];
      c.fillRect(x + (r() - 0.5) * S * 0.02, y + (r() - 0.5) * S * 0.02, S * 0.002, S * 0.002);
    }
  }
  const tx = new THREE.CanvasTexture(cv);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  tx.anisotropy = 4;
  return tx;
}

/** textura da pista (asfalto, eixo, cabeceira, zona de toque) */
export function runwayTexture(): THREE.CanvasTexture {
  const [cv, c] = canvas(128, 2048);
  c.fillStyle = '#4a4b55';
  c.fillRect(0, 0, 128, 2048);
  for (let i = 0; i < 3000; i++) {
    c.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},0.05)`;
    c.fillRect(Math.random() * 128, Math.random() * 2048, 2, 2);
  }
  const W = '#f4f4f0';
  c.fillStyle = W;
  // bordas
  c.fillRect(3, 0, 2, 2048);
  c.fillRect(123, 0, 2, 2048);
  // eixo tracejado
  for (let y = 120; y < 1930; y += 36) c.fillRect(62, y, 4, 20);
  // "piano" das duas cabeceiras
  for (const y0 of [8, 2040 - 50]) for (let k = 0; k < 8; k++) c.fillRect(10 + k * 7 + (k > 3 ? 44 : 0), y0, 4, 42);
  // zona de toque e ponto de mira
  for (const dir of [1, -1]) {
    const base = dir > 0 ? 2048 - 110 : 110;
    c.fillRect(30, base - dir * 160 - 30, 12, 60);
    c.fillRect(86, base - dir * 160 - 30, 12, 60);
    for (let k = 1; k < 4; k++) {
      c.fillRect(26, base - dir * (230 + k * 60), 4, 22);
      c.fillRect(34, base - dir * (230 + k * 60), 4, 22);
      c.fillRect(90, base - dir * (230 + k * 60), 4, 22);
      c.fillRect(98, base - dir * (230 + k * 60), 4, 22);
    }
  }
  const tx = new THREE.CanvasTexture(cv);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = 8;
  return tx;
}

/** prédio/torre/hangares do aeroporto (geometria mesclada) */
export function airportGeo(lite: boolean): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.bevel = lite ? 0 : 1;
  b.ao = false;
  // pista taxi e pátio
  b.sharp(22, 0.2, 2600, 120, -0.1, -1300, '#5a5b66');
  for (let z = -2400; z <= -200; z += 550) b.sharp(100, 0.2, 18, 70, -0.1, z, '#5a5b66');
  b.sharp(420, 0.2, 520, 330, -0.1, -1300, '#6a6b76');
  // terminal com vidros
  b.box(60, 22, 300, 430, 0, -1300, '#f2ece2');
  b.box(61, 6, 290, 430, 9, -1300, '#5fb8e0');
  b.box(64, 3, 304, 430, 22, -1300, '#ff5cae');
  // torre
  b.cyl(9, 11, 70, 240, 0, -650, '#e8e2f0', 12);
  b.cyl(18, 14, 14, 240, 70, -650, '#5fb8e0', 12);
  b.cyl(20, 20, 4, 240, 84, -650, '#2b2f6b', 12);
  // hangares
  for (let i = 0; i < 3; i++) {
    const z = -2100 + i * 180;
    b.box(110, 32, 120, 360, 0, z, ['#c9d4e6', '#e6d6c8', '#d8d0e0'][i]);
    b.cyl(60, 60, 110, 360, 32, z, ['#a6b4cc', '#d6b8a0', '#b8acd0'][i], 12, 0, Math.PI / 2);
  }
  // estacionamento e prédios menores
  for (let i = 0; i < 10; i++) b.box(30 + (i % 3) * 10, 12 + (i % 4) * 5, 40, 540 + (i % 2) * 60, 0, -1700 + i * 90, ['#e6d6c8', '#f0b8a0', '#d8d0e0', '#c9d4e6'][i % 4]);
  return b.build();
}

/** nuvem "fofa" (várias bolotas mescladas) */
export function cloudGeo(lite: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const g = new GeoBuilder();
  g.bevel = 0;
  g.ao = false;
  const det = lite ? 0 : 1;
  const puffs: [number, number, number, number][] = [
    [0, 0, 0, 1],
    [1.1, -0.15, 0.2, 0.75],
    [-1.05, -0.2, -0.1, 0.7],
    [0.4, 0.35, -0.5, 0.65],
    [-0.5, 0.25, 0.55, 0.6],
    [1.8, -0.35, -0.3, 0.45],
    [-1.8, -0.4, 0.3, 0.45],
  ];
  for (const [x, y, z, r] of puffs) {
    const s = new THREE.IcosahedronGeometry(r, det);
    // achata a base
    const pa = s.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pa.count; i++) if (pa.getY(i) < -r * 0.25) pa.setY(i, -r * 0.25 - (pa.getY(i) + r * 0.25) * 0.2);
    s.computeVertexNormals();
    g.geo(s, '#ffffff', x, y, z);
    parts.push(s);
  }
  return g.build();
}

/** árvore e casinha para instanciar */
export function treeGeo(): THREE.BufferGeometry {
  const g = new GeoBuilder();
  g.bevel = 0;
  g.ao = false;
  g.cyl(0.15, 0.2, 0.5, 0, 0, 0, '#7a4a2a', 5);
  g.cyl(0.0, 0.7, 1.4, 0, 0.4, 0, '#3f8a44', 6);
  return g.build();
}
export function houseGeo(): THREE.BufferGeometry {
  const g = new GeoBuilder();
  g.bevel = 0;
  g.ao = false;
  g.sharp(1, 0.7, 1, 0, 0, 0, '#f0e6dc');
  g.frustum(1.15, 1.15, 0.05, 1.15, 0.5, 0, 0.7, 0, '#d0604a');
  return g.build();
}
export function mountainGeo(): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(1, 1, 7, 2);
  g.translate(0, 0.5, 0);
  const pa = g.getAttribute('position') as THREE.BufferAttribute;
  const cols = new Float32Array(pa.count * 3);
  const C = new THREE.Color();
  for (let i = 0; i < pa.count; i++) {
    const y = pa.getY(i);
    if (y > 0.1 && y < 0.99) {
      pa.setX(i, pa.getX(i) * (0.85 + Math.sin(i * 12.9) * 0.15));
      pa.setZ(i, pa.getZ(i) * (0.85 + Math.cos(i * 7.3) * 0.15));
    }
    C.set(y > 0.8 ? '#f4f0ff' : y > 0.4 ? '#7a8aa8' : '#5f7a6a').convertSRGBToLinear();
    cols[i * 3] = C.r;
    cols[i * 3 + 1] = C.g;
    cols[i * 3 + 2] = C.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}
export { SPOTS };
