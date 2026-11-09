/* ============================================================
 *  COZINHA 3D — cenário estático (mesclado) a partir da grade da Sim.
 *  1 tile da simulação = T metros. Bancadas, fogões, pia, caixas,
 *  balcão de entrega (janela para o salão), paredes do tema, salão
 *  com mesas. Tudo vira poucas malhas; colisão estática em cannon-es.
 * ============================================================ */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GeoBuilder } from '../../3d/common/geo';
import { canvas, shade } from '../../3d/common/tex';
import { DECOR, type Theme } from './data';
import type { Sim, Station } from './sim';

export const T = 1.1;
export const H = 0.92;
export const WALL_H = 2.9;
export const HATCH_TOP = 2.05;

/** onde o item fica em cima de cada tipo de estação (m acima do chão) */
export function restY(st: Station): number {
  switch (st.k) {
    case 'pot':
      return H + 0.16;
    case 'pan':
      return H + 0.1;
    case 'oven':
      return H + 0.12;
    case 'blender':
      return H + 0.12;
    case 'sink':
      return H - 0.06;
    case 'crate':
      return H + 0.3;
    case 'board':
      return H + 0.05;
    default:
      return H + 0.01;
  }
}

export interface KitchenBuild {
  group: THREE.Group;
  dispose(): void;
  /** cor do céu/fundo */
  bg: string;
}

function wallTexture(theme: Theme, wall: string): THREE.CanvasTexture {
  const [cv, c] = canvas(256, 256);
  if (theme === 'boat') {
    for (let i = 0; i < 8; i++) {
      c.fillStyle = i % 2 ? '#c27a44' : '#b06a38';
      c.fillRect(0, i * 32, 256, 32);
      c.fillStyle = '#8a4a26';
      c.fillRect(0, i * 32 + 30, 256, 2);
      c.fillRect(((i * 97) % 200) + 20, i * 32, 3, 32);
    }
    // vigia (janela redonda) com mar
    c.fillStyle = '#e0b04a';
    c.beginPath();
    c.arc(128, 110, 46, 0, 7);
    c.fill();
    const g = c.createLinearGradient(0, 70, 0, 150);
    g.addColorStop(0, '#8fe0ff');
    g.addColorStop(0.55, '#5ec8ff');
    g.addColorStop(0.56, '#2f8ae0');
    g.addColorStop(1, '#1f5ab0');
    c.fillStyle = g;
    c.beginPath();
    c.arc(128, 110, 36, 0, 7);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,.6)';
    c.beginPath();
    c.ellipse(114, 94, 10, 5, -0.6, 0, 7);
    c.fill();
  } else if (theme === 'space') {
    c.fillStyle = '#4a4f7a';
    c.fillRect(0, 0, 256, 256);
    c.fillStyle = '#5a6090';
    for (let i = 0; i < 4; i++) c.fillRect(4 + i * 64, 4, 56, 248);
    c.fillStyle = '#9aa0d0';
    for (let i = 0; i < 4; i++) for (const y of [14, 242]) c.fillRect(10 + i * 64, y, 4, 4), c.fillRect(50 + i * 64, y, 4, 4);
    // janela com estrelas
    c.fillStyle = '#0b0630';
    c.beginPath();
    c.roundRect(60, 60, 136, 90, 20);
    c.fill();
    c.fillStyle = '#ffffff';
    for (let i = 0; i < 30; i++) c.fillRect(66 + ((i * 53) % 124), 66 + ((i * 31) % 78), i % 5 ? 2 : 3, i % 5 ? 2 : 3);
    c.fillStyle = '#ff9a6b';
    c.beginPath();
    c.arc(160, 120, 14, 0, 7);
    c.fill();
    c.strokeStyle = '#9aa0d0';
    c.lineWidth = 6;
    c.beginPath();
    c.roundRect(60, 60, 136, 90, 20);
    c.stroke();
  } else if (theme === 'truck') {
    c.fillStyle = '#ffcf2e';
    c.fillRect(0, 0, 256, 256);
    c.fillStyle = '#ff5c7a';
    c.fillRect(0, 200, 256, 20);
    // janela da lateral com estrada/árvores
    c.fillStyle = '#9fe08a';
    c.fillRect(30, 50, 196, 100);
    c.fillStyle = '#7ad0ff';
    c.fillRect(30, 50, 196, 50);
    c.fillStyle = '#3e9e54';
    for (let i = 0; i < 5; i++) {
      c.beginPath();
      c.arc(50 + i * 42, 100, 16, 0, 7);
      c.fill();
    }
    c.strokeStyle = '#2a0b5c';
    c.lineWidth = 8;
    c.strokeRect(30, 50, 196, 100);
  } else {
    // azulejos com faixa de cor do restaurante
    c.fillStyle = '#fbf7ff';
    c.fillRect(0, 0, 256, 256);
    c.strokeStyle = '#e2dcef';
    c.lineWidth = 3;
    for (let i = 0; i <= 8; i++) {
      c.beginPath();
      c.moveTo(0, i * 32);
      c.lineTo(256, i * 32);
      c.moveTo(i * 32, 0);
      c.lineTo(i * 32, 256);
      c.stroke();
    }
    // faixa colorida na altura dos olhos + rodapé
    c.fillStyle = wall;
    c.fillRect(0, 64, 256, 30);
    c.fillStyle = shade(wall, 0.3);
    for (let i = 0; i < 8; i++) c.fillRect(i * 32 + 4, 70, 24, 18);
    c.fillStyle = shade(wall, -0.2);
    c.fillRect(0, 0, 256, 14);
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function floorTex(theme: Theme, a: string, b: string, cols: number, rows: number): THREE.CanvasTexture {
  const P = 32;
  const [cv, c] = canvas(cols * P, rows * P);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      if (theme === 'boat') {
        c.fillStyle = (x + y * 3) % 4 ? '#c98a52' : '#b87a44';
        c.fillRect(x * P, y * P, P, P);
        c.fillStyle = '#8a5a30';
        c.fillRect(x * P, y * P + P - 2, P, 2);
      } else if (theme === 'space') {
        c.fillStyle = (x + y) & 1 ? '#3a3f6a' : '#444a78';
        c.fillRect(x * P, y * P, P, P);
        c.fillStyle = '#6a70a8';
        c.fillRect(x * P + 3, y * P + 3, 3, 3);
      } else {
        c.fillStyle = (x + y) & 1 ? a : b;
        c.fillRect(x * P, y * P, P, P);
      }
    }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.anisotropy = 2;
  return t;
}

export function buildKitchen(sim: Sim, decor: number, standard: boolean, world: CANNON.World, staticMat: CANNON.Material): KitchenBuild {
  const D = DECOR[Math.min(DECOR.length - 1, decor)];
  const th = sim.theme;
  const C = sim.cols;
  const R = sim.rows;
  const W = C * T;
  const DZ = R * T;
  const group = new THREE.Group();
  const owned: { dispose(): void }[] = [];
  const mk = <T2 extends { dispose(): void }>(o: T2): T2 => (owned.push(o), o);
  const lam = (o: THREE.MeshLambertMaterialParameters & THREE.MeshStandardMaterialParameters) =>
    mk(standard ? new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0, ...o }) : new THREE.MeshLambertMaterial(o));
  const solidMat = lam({ vertexColors: true });
  const b = new GeoBuilder();
  const glass = new GeoBuilder();
  glass.ao = false;
  const glow = new GeoBuilder();
  glow.ao = false;

  // ---------------- piso ----------------
  const fl = new THREE.Mesh(mk(new THREE.PlaneGeometry(W, DZ)), lam({ map: mk(floorTex(th, D.floorA, D.floorB, C, R)) }));
  fl.rotation.x = -Math.PI / 2;
  fl.position.set(W / 2, 0, DZ / 2);
  group.add(fl);

  // ---------------- paredes (faces internas com textura repetida) ----------------
  const wt = mk(wallTexture(th, D.wall));
  const wallMat = lam({ map: wt });
  const wallSeg = (x0: number, x1: number, y0: number, y1: number, z: number, ry: number, axisX: boolean) => {
    const w = x1 - x0;
    const h = y1 - y0;
    const g = mk(new THREE.PlaneGeometry(w, h));
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (x0 + uv.getX(i) * w) / 2.5, (y0 + uv.getY(i) * h) / WALL_H);
    const m = new THREE.Mesh(g, wallMat);
    m.rotation.y = ry;
    if (axisX) m.position.set((x0 + x1) / 2, (y0 + y1) / 2, z);
    else m.position.set(z, (y0 + y1) / 2, (x0 + x1) / 2);
    group.add(m);
  };
  // norte (z=0): aberturas acima dos balcões de entrega
  let run = 0;
  for (let x = 0; x <= C; x++) {
    const st = x < C ? sim.st[sim.stAt[x]] : null;
    const hatch = !!st && (st.k === 'window' || st.k === 'belt');
    if (hatch || x === C) {
      if (x > run) wallSeg(run * T, x * T, 0, WALL_H, 0, 0, true);
      if (hatch) {
        wallSeg(x * T, (x + 1) * T, 0, H, 0, 0, true);
        wallSeg(x * T, (x + 1) * T, HATCH_TOP, WALL_H, 0, 0, true);
        // moldura do passa-pratos
        b.box(0.08, HATCH_TOP - H, 0.2, x * T + 0.04, H, 0, '#e98f00');
        b.box(0.08, HATCH_TOP - H, 0.2, (x + 1) * T - 0.04, H, 0, '#e98f00');
        b.box(T, 0.1, 0.2, (x + 0.5) * T, HATCH_TOP - 0.05, 0, '#e98f00');
        // toldo listrado
        for (let i = 0; i < 5; i++) b.box(T / 5, 0.04, 0.42, x * T + (i + 0.5) * (T / 5), HATCH_TOP + 0.1 - 0.02, 0.18, i % 2 ? '#ffffff' : '#ff5c7a', 0, -0.35);
      }
      run = x + 1;
    }
  }
  wallSeg(0, W, 0, WALL_H, DZ, Math.PI, true);
  wallSeg(0, DZ, 0, WALL_H, 0, Math.PI / 2, false);
  wallSeg(0, DZ, 0, WALL_H, W, -Math.PI / 2, false);
  // rodapé + teto
  const ceil = new THREE.Mesh(mk(new THREE.PlaneGeometry(W, DZ)), lam({ color: th === 'space' ? '#3a3f6a' : th === 'boat' ? '#a8683a' : '#fff6ea' }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(W / 2, WALL_H, DZ / 2);
  group.add(ceil);
  // luminárias
  for (let x = 1; x < C; x += 3)
    for (let y = 1; y < R; y += 3) {
      b.cyl(0.02, 0.02, 0.35, x * T + T / 2, WALL_H - 0.35, y * T + T / 2, '#5a5370', 6);
      b.cyl(0.08, 0.32, 0.22, x * T + T / 2, WALL_H - 0.55, y * T + T / 2, th === 'space' ? '#9aa0d0' : '#ff5c7a', 10);
      glow.sph(0.13, x * T + T / 2, WALL_H - 0.56, y * T + T / 2, '#fff3c4', 1, 0.5, 1, 8);
    }
  // prateleiras com potes nas paredes laterais (acima das bancadas comuns)
  const jarCols = ['#ff5c7a', '#ffd84a', '#4fd67a', '#7ad0ff', '#c98aff', '#ff9a6b'];
  for (let y = 1; y < R - 1; y++)
    for (const side of [0, 1]) {
      const x = side ? C - 1 : 0;
      const si = sim.stAt[y * C + x];
      const st = si >= 0 ? sim.st[si] : null;
      if (!st || st.k === 'pot' || st.k === 'pan' || st.k === 'oven') continue;
      const wx = side ? W - 0.13 : 0.13;
      b.box(0.26, 0.04, T * 0.9, wx, 1.75, (y + 0.5) * T, '#c89a6a');
      for (let j = 0; j < 3; j++) {
        const jz = (y + 0.5) * T + (j - 1) * 0.3;
        const jc = jarCols[(y * 3 + j + side) % jarCols.length];
        b.cyl(0.07, 0.07, 0.16, wx, 1.79, jz, '#e8f6ff', 8);
        b.cyl(0.06, 0.06, 0.1, wx, 1.8, jz, jc, 8);
        b.cyl(0.075, 0.075, 0.03, wx, 1.95, jz, shade(jc, -0.3), 8);
      }
    }
  // relógio e quadro do cardápio na parede do fundo (sul)
  b.cyl(0.32, 0.32, 0.05, W / 2, 2.25, DZ - 0.02, '#ffffff', 20, Math.PI / 2);
  b.torus(0.32, 0.04, W / 2, 2.25, DZ - 0.04, '#ff5c7a', 0);
  b.box(0.03, 0.2, 0.02, W / 2, 2.25, DZ - 0.06, '#2a0b5c');
  b.box(0.16, 0.03, 0.02, W / 2, 2.25, DZ - 0.06, '#2a0b5c');
  // prateleira com panelas penduradas na parede sul (decoração)
  for (let x = 1; x < C - 1; x += 2) {
    b.box(0.5, 0.04, 0.22, x * T + T / 2, 1.85, DZ - 0.11, '#c89a6a');
    b.cyl(0.09, 0.07, 0.12, x * T + T / 2 - 0.1, 1.89, DZ - 0.12, x % 4 === 1 ? '#ff9a6b' : '#7ad0ff', 10);
    b.sph(0.06, x * T + T / 2 + 0.13, 1.95, DZ - 0.12, '#ffd84a');
  }

  // ---------------- bancadas e estações ----------------
  const bodyShape = new CANNON.Box(new CANNON.Vec3(T / 2, H / 2, T / 2));
  for (const st of sim.st) {
    const cx = (st.x + 0.5) * T;
    const cz = (st.y + 0.5) * T;
    const usable = !!(st.fx || st.fy);
    const face = Math.atan2(st.fx, st.fy); // giro para a frente da estação
    const fx = st.fx;
    const fz = st.fy;
    // corpo do armário
    b.box(T - 0.02, H - 0.08, T - 0.02, cx, 0, cz, usable ? D.counterSide : shade(D.counterSide, -0.15));
    if (usable) {
      // portinhas + puxador na frente
      b.box(T * 0.82, H * 0.62, 0.02, cx + fx * (T / 2), 0.14, cz + fz * (T / 2), shade(D.counterSide, 0.18), face);
      b.box(0.18, 0.04, 0.04, cx + fx * (T / 2 + 0.02), H * 0.62, cz + fz * (T / 2 + 0.02), '#5a5370', face);
    }
    b.box(T, 0.08, T, cx, H - 0.08, cz, st.k === 'crate' ? '#c98a4a' : D.counter);
    const top = H;
    const sideX = -fz; // eixo "lateral" da estação
    const sideZ = fx;
    switch (st.k) {
      case 'crate':
        b.box(0.86, 0.26, 0.86, cx, top, cz, '#d99a5a');
        for (const o of [-0.3, 0, 0.3]) b.box(0.88, 0.03, 0.04, cx, top + 0.06 + (o + 0.3) * 0.25, cz + fz * 0.44 + fx * 0, '#a86a32', face);
        b.box(0.88, 0.04, 0.88, cx, top + 0.26, cz, '#b8783e');
        break;
      case 'board':
        b.box(0.72, 0.04, 0.5, cx, top, cz, '#e8b878', face);
        b.box(0.24, 0.015, 0.05, cx + sideX * 0.42, top + 0.01, cz + sideZ * 0.42, '#dfe3f0', face + Math.PI / 2);
        b.box(0.1, 0.03, 0.05, cx + sideX * 0.5 + fx * 0.0, top + 0.01, cz + sideZ * 0.5, '#ff5c7a', face + Math.PI / 2);
        break;
      case 'pot':
      case 'pan':
        b.box(T - 0.1, 0.05, T - 0.1, cx, top, cz, '#3b3550');
        b.torus(0.2, 0.025, cx, top + 0.06, cz, '#1f1a2e');
        // botões do fogão na frente
        for (const o of [-0.2, 0.2]) b.cyl(0.05, 0.05, 0.04, cx + fx * (T / 2) + sideX * o, H * 0.8, cz + fz * (T / 2) + sideZ * o, '#ffd84a', 10, Math.PI / 2 * (fz ? 1 : 0), Math.PI / 2 * (fx ? 1 : 0));
        if (st.k === 'pot') {
          b.cyl(0.25, 0.22, 0.32, cx, top + 0.07, cz, '#c9c3e6', 16);
          b.torus(0.25, 0.025, cx, top + 0.39, cz, '#a8a2c8');
          b.box(0.1, 0.03, 0.05, cx + sideX * 0.3, top + 0.33, cz + sideZ * 0.3, '#2a2238', face + Math.PI / 2);
          b.box(0.1, 0.03, 0.05, cx - sideX * 0.3, top + 0.33, cz - sideZ * 0.3, '#2a2238', face + Math.PI / 2);
          glass.cyl(0.235, 0.235, 0.02, cx, top + 0.3, cz, '#7ad0ff', 16);
        } else {
          b.cyl(0.3, 0.26, 0.07, cx, top + 0.07, cz, '#2e2a40', 16);
          b.box(0.42, 0.04, 0.07, cx + sideX * 0.48, top + 0.1, cz + sideZ * 0.48, '#7a4fd1', face + Math.PI / 2);
        }
        break;
      case 'oven':
        b.box(0.98, 0.62, 0.92, cx, top, cz, '#ff9a6b', face);
        b.box(0.98, 0.06, 0.92, cx, top + 0.62, cz, '#e0704a', face);
        b.box(0.12, 0.04, 0.06, cx + fx * 0.48 + sideX * 0.3, top + 0.52, cz + fz * 0.48 + sideZ * 0.3, '#2a2238', face);
        glass.box(0.62, 0.36, 0.02, cx + fx * 0.47, top + 0.08, cz + fz * 0.47, '#3a2a50', face);
        glow.box(0.5, 0.03, 0.5, cx, top + 0.06, cz, '#ff7a2e', face);
        break;
      case 'blender':
        b.box(0.34, 0.12, 0.34, cx, top, cz, '#5a5370', face);
        b.cyl(0.05, 0.05, 0.02, cx + fx * 0.17, top + 0.04, cz + fz * 0.17, '#ff5c7a', 8, Math.PI / 2);
        glass.cyl(0.19, 0.14, 0.42, cx, top + 0.12, cz, '#e0feff', 14);
        b.cyl(0.2, 0.2, 0.05, cx, top + 0.54, cz, '#2a2238', 14);
        break;
      case 'plates':
        b.box(0.5, 0.03, 0.5, cx, top, cz, '#c8b8e8');
        break;
      case 'dirty':
        b.box(0.74, 0.05, 0.6, cx, top, cz, '#8a7ab0', face);
        b.box(0.74, 0.1, 0.03, cx + fx * 0.3, top, cz + fz * 0.3, '#8a7ab0', face);
        break;
      case 'sink':
        b.box(0.92, 0.04, 0.92, cx, top - 0.02, cz, '#dfe5f0');
        b.box(0.7, 0.03, 0.7, cx, top - 0.14, cz, '#9fb0d6');
        glass.box(0.68, 0.02, 0.68, cx, top - 0.06, cz, '#7ad0ff');
        b.cyl(0.03, 0.03, 0.4, cx - fx * 0.38, top, cz - fz * 0.38, '#c9c3e6', 8);
        b.box(0.05, 0.04, 0.26, cx - fx * 0.27, top + 0.36, cz - fz * 0.27, '#c9c3e6', face);
        b.sph(0.05, cx + sideX * 0.36 + fx * 0.36, top + 0.02, cz + sideZ * 0.36 + fz * 0.36, '#ffd84a', 1, 0.5, 1);
        break;
      case 'trash':
        b.cyl(0.3, 0.26, 0.55, cx, top, cz, '#3ec96a', 14);
        b.cyl(0.33, 0.33, 0.06, cx, top + 0.55, cz, '#2f9e54', 14);
        b.box(0.12, 0.05, 0.12, cx, top + 0.6, cz, '#2f9e54');
        break;
      case 'window':
        b.box(T - 0.06, 0.05, T - 0.06, cx, top, cz, '#ffcf2e');
        b.sph(0.1, cx + sideX * 0.4, top + 0.05, cz + sideZ * 0.4, '#fff6b0', 1, 0.7, 1);
        b.cyl(0.02, 0.02, 0.05, cx + sideX * 0.4, top + 0.12, cz + sideZ * 0.4, '#e98f00', 6);
        break;
      case 'belt':
        b.box(T, 0.06, 0.6, cx, top, cz, '#4a4560', face + Math.PI / 2);
        for (let i = -2; i <= 2; i++) b.cyl(0.03, 0.03, 0.6, cx + sideX * i * 0.2, top + 0.07, cz + sideZ * i * 0.2, '#9aa0d0', 6, Math.PI / 2 * (fx ? 1 : 0), Math.PI / 2 * (fz ? 1 : 0));
        break;
    }
    const body = new CANNON.Body({ mass: 0, shape: bodyShape, material: staticMat });
    body.position.set(cx, H / 2, cz);
    world.addBody(body);
  }
  // fogões ganham um pouco de "parede" atrás (exaustor) — só nas laterais
  for (const st of sim.st)
    if (st.k === 'pot' || st.k === 'pan') {
      const cx = (st.x + 0.5) * T - st.fx * (T / 2 - 0.06);
      const cz = (st.y + 0.5) * T - st.fy * (T / 2 - 0.06);
      b.box(st.fx ? 0.12 : T * 0.9, 0.4, st.fy ? 0.12 : T * 0.9, cx, 2.25, cz, '#c9c3e6');
    }

  // ---------------- salão (do outro lado do passa-pratos) ----------------
  const dfl = new THREE.Mesh(mk(new THREE.PlaneGeometry(W + 4, 5)), lam({ color: D.dining }));
  dfl.rotation.x = -Math.PI / 2;
  dfl.position.set(W / 2, 0, -2.5);
  group.add(dfl);
  const back = new THREE.Mesh(mk(new THREE.PlaneGeometry(W + 4, 3.2)), lam({ color: shade(D.wall, 0.35) }));
  back.position.set(W / 2, 1.6, -5);
  group.add(back);
  for (let i = 0; i < sim.seats; i++) {
    const sx = ((i + 0.5) / sim.seats) * W;
    b.cyl(0.45, 0.45, 0.05, sx, 0.72, -2.4, '#ffffff', 16);
    b.cyl(0.06, 0.1, 0.72, sx, 0, -2.4, '#7a4fd1', 8);
    b.cyl(0.2, 0.2, 0.06, sx, 0.45, -3.1, '#ff5c7a', 12);
  }

  const solid = new THREE.Mesh(mk(b.build()), solidMat);
  group.add(solid);
  if (!glass.empty) {
    const gm = mk(new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.45, depthWrite: false }));
    const gmesh = new THREE.Mesh(mk(glass.build()), gm);
    gmesh.renderOrder = 3;
    group.add(gmesh);
  }
  if (!glow.empty) group.add(new THREE.Mesh(mk(glow.build()), mk(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }))));

  // ---------------- colisão: chão, paredes, teto ----------------
  const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: staticMat });
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(ground);
  const wall = (x: number, z: number, hx: number, hz: number) => {
    const w = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(hx, 3, hz)), material: staticMat });
    w.position.set(x, 1.5, z);
    world.addBody(w);
  };
  wall(W / 2, -0.25, W / 2 + 1, 0.25);
  wall(W / 2, DZ + 0.25, W / 2 + 1, 0.25);
  wall(-0.25, DZ / 2, 0.25, DZ / 2 + 1);
  wall(W + 0.25, DZ / 2, 0.25, DZ / 2 + 1);
  const roof = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(W, 0.2, DZ)), material: staticMat });
  roof.position.set(W / 2, WALL_H + 0.2, DZ / 2);
  world.addBody(roof);

  const bg = th === 'space' ? '#0b0630' : th === 'boat' ? '#5ec8ff' : th === 'truck' ? '#9fe08a' : '#ffcf9a';
  return {
    group,
    bg,
    dispose() {
      for (const o of owned) o.dispose();
      group.parent?.remove(group);
    },
  };
}
