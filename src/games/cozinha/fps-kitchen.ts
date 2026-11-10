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
import { brushedTex, stoneTex, tileTex, woodTex } from '../../3d/common/pbr';
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
  const P = 64;
  const [cv, c] = canvas(cols * P, rows * P);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      if (theme === 'boat') {
        // tábuas de convés
        for (let k = 0; k < 4; k++) {
          c.fillStyle = shade((x * 3 + y * 7 + k) % 3 ? '#c98a52' : '#b87a44', (((x * 13 + y * 5 + k * 7) % 9) - 4) * 0.02);
          c.fillRect(x * P, y * P + k * 16, P, 16);
          c.fillStyle = '#6a4020';
          c.fillRect(x * P, y * P + k * 16 + 15, P, 1);
        }
        c.fillStyle = '#5a3a1a';
        c.fillRect(x * P + ((y * 23) % 40) + 10, y * P, 1, P);
      } else if (theme === 'space') {
        c.fillStyle = (x + y) & 1 ? '#3a3f6a' : '#444a78';
        c.fillRect(x * P, y * P, P, P);
        c.strokeStyle = '#2a2e50';
        c.lineWidth = 2;
        c.strokeRect(x * P + 1, y * P + 1, P - 2, P - 2);
        c.fillStyle = '#7a80b8';
        for (const [u, v] of [[6, 6], [P - 9, 6], [6, P - 9], [P - 9, P - 9]]) c.fillRect(x * P + u, y * P + v, 3, 3);
      } else {
        // ladrilho cerâmico 2x2 por tile (casa com o mapa de normais)
        for (let k = 0; k < 4; k++) {
          const u = k & 1;
          const v = k >> 1;
          c.fillStyle = shade((x * 2 + u + y * 2 + v) & 1 ? a : b, (((x * 7 + y * 11 + k * 5) % 7) - 3) * 0.008);
          c.fillRect(x * P + u * 32, y * P + v * 32, 32, 32);
        }
      }
    }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
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
  type MP = THREE.MeshLambertMaterialParameters & THREE.MeshStandardMaterialParameters;
  const lam = (o: MP) => {
    if (standard) return mk(new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0, ...o }));
    const { roughness: _r, metalness: _m, normalMap: _n, envMapIntensity: _e, ...rest } = o;
    void _r, _m, _n, _e;
    return mk(new THREE.MeshLambertMaterial(rest));
  };
  // texturas procedurais (compartilhadas em cache; não descartar aqui)
  const wood = woodTex(256, 4);
  const stone = stoneTex(256);
  const brushed = brushedTex(128);
  const tileN = tileTex(256, 8, 8, 0.03);
  const floorN = tileTex(256, 2, 2, 0.025);
  const rep = (t: THREE.Texture, x: number, y: number) => {
    const c = t.clone();
    c.repeat.set(x, y);
    c.needsUpdate = true;
    return mk(c);
  };
  const b = new GeoBuilder(); // pintado / plástico
  b.jitter = 0.06;
  const wd = new GeoBuilder(); // madeira
  wd.uvScale = 1.6;
  wd.jitter = 0.12;
  const mt = new GeoBuilder(); // inox / metal
  mt.uvScale = 2;
  const dk = new GeoBuilder(); // ferro fundido / borracha / vidro escuro
  const sn = new GeoBuilder(); // pedra das bancadas
  sn.uvScale = 2.2;
  const cer = new GeoBuilder(); // cerâmica / louça brilhante
  const glass = new GeoBuilder();
  glass.ao = false;
  glass.bevel = 0;
  const glow = new GeoBuilder();
  glow.ao = false;
  glow.bevel = 0;
  const lowSeg = standard ? 1 : 0;
  for (const g of [b, wd, mt, dk, sn, cer]) {
    g.bevel = standard ? 2 : 1;
    if (!standard) g.minBevel = 0.045;
  }
  void lowSeg;
  const RS = standard ? 20 : 12; // segmentos radiais

  // ---------------- piso ----------------
  const floorMat = lam({ map: mk(floorTex(th, D.floorA, D.floorB, C, R)), roughness: th === 'boat' ? 0.75 : 0.35, ...(standard && th !== 'boat' ? { normalMap: rep(floorN.normal, C, R), normalScale: new THREE.Vector2(0.6, 0.6) } : {}) });
  const fl = new THREE.Mesh(mk(new THREE.PlaneGeometry(W, DZ)), floorMat);
  fl.rotation.x = -Math.PI / 2;
  fl.position.set(W / 2, 0, DZ / 2);
  fl.receiveShadow = true;
  group.add(fl);

  // ---------------- paredes (faces internas com textura repetida) ----------------
  const wt = mk(wallTexture(th, D.wall));
  const wallMat = lam({ map: wt, roughness: th !== 'boat' && th !== 'space' && th !== 'truck' ? 0.3 : 0.7, ...(standard && th !== 'boat' && th !== 'truck' && th !== 'space' ? { normalMap: tileN.normal, normalScale: new THREE.Vector2(0.5, 0.5) } : {}) });
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
    m.receiveShadow = true;
    group.add(m);
  };
  const trim = th === 'space' ? '#9aa0d0' : th === 'boat' ? '#7a4a26' : shade(D.wall, -0.1);
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
        // moldura de madeira do passa-pratos
        wd.box(0.1, HATCH_TOP - H, 0.22, x * T + 0.05, H, 0, '#c9843a');
        wd.box(0.1, HATCH_TOP - H, 0.22, (x + 1) * T - 0.05, H, 0, '#c9843a');
        wd.box(T, 0.12, 0.24, (x + 0.5) * T, HATCH_TOP - 0.06, 0, '#b8742e');
        // toldo listrado com bordinha ondulada
        for (let i = 0; i < 6; i++) b.box(T / 6 + 0.002, 0.025, 0.46, x * T + (i + 0.5) * (T / 6), HATCH_TOP + 0.12, 0.2, i % 2 ? '#fff8ee' : '#ff5c7a', 0, -0.38);
        for (let i = 0; i < 6; i++) b.sph(T / 12, x * T + (i + 0.5) * (T / 6), HATCH_TOP - 0.05, 0.42, i % 2 ? '#fff8ee' : '#ff5c7a', 1, 0.55, 0.25, 10);
        // trilho de comandas
        mt.cyl(0.012, 0.012, T - 0.2, x * T + 0.1, HATCH_TOP - 0.2, 0.14, '#cfd5e0', 8, 0, -Math.PI / 2);
        for (let i = 0; i < 3; i++) b.sharp(0.1, 0.13, 0.004, x * T + 0.28 + i * 0.27, HATCH_TOP - 0.34, 0.14, i === 1 ? '#fff6c4' : '#ffffff', (i - 1) * 0.08);
      }
      run = x + 1;
    }
  }
  wallSeg(0, W, 0, WALL_H, DZ, Math.PI, true);
  wallSeg(0, DZ, 0, WALL_H, 0, Math.PI / 2, false);
  wallSeg(0, DZ, 0, WALL_H, W, -Math.PI / 2, false);
  // rodapé e sanca em todas as paredes
  for (const [x, z, w, d] of [[W / 2, DZ - 0.015, W, 0.03], [0.015, DZ / 2, 0.03, DZ], [W - 0.015, DZ / 2, 0.03, DZ]] as const) {
    b.sharp(w, 0.12, d, x, 0, z, shade(trim, -0.2));
    b.sharp(w + 0.02, 0.08, d + 0.02, x, WALL_H - 0.08, z, shade(trim, 0.2));
  }
  // teto com placas
  const ceil = new THREE.Mesh(mk(new THREE.PlaneGeometry(W, DZ)), lam({ color: th === 'space' ? '#3a3f6a' : th === 'boat' ? '#a8683a' : '#fff6ea', map: th === 'boat' ? rep(wood.map, W, DZ) : null }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(W / 2, WALL_H, DZ / 2);
  group.add(ceil);
  if (th === 'boat') for (let x = 0.5; x < W; x += 1.1) wd.box(0.12, 0.14, DZ, x, WALL_H - 0.14, DZ / 2, '#7a4a26');
  // luminárias pendentes (cúpula de metal + lâmpada que brilha)
  const shadeCol = th === 'space' ? '#9aa0d0' : th === 'boat' ? '#2f6a4a' : '#2f3a4a';
  for (let x = 1; x < C; x += 3)
    for (let y = 1; y < R; y += 3) {
      const lx = x * T + T / 2;
      const lz = y * T + T / 2;
      dk.cyl(0.006, 0.006, 0.5, lx, WALL_H - 0.5, lz, '#1a1a22', 6);
      mt.rcyl(0.035, 0.06, lx, WALL_H - 0.55, lz, '#8a8f9a', 10);
      mt.lathe([[0.03, 0.2], [0.06, 0.18], [0.16, 0.08], [0.22, 0.0], [0.215, -0.005], [0.155, 0.075], [0.055, 0.17], [0.025, 0.19]], lx, WALL_H - 0.75, lz, shadeCol, RS);
      glow.sph(0.075, lx, WALL_H - 0.72, lz, '#fff3c4', 1, 1.1, 1, 12);
    }
  // prateleiras com potes de vidro nas paredes laterais (acima das bancadas comuns)
  const jarCols = ['#ff5c7a', '#ffd84a', '#4fd67a', '#c98a4a', '#c98aff', '#ff9a6b'];
  for (let y = 1; y < R - 1; y++)
    for (const side of [0, 1]) {
      const x = side ? C - 1 : 0;
      const si = sim.stAt[y * C + x];
      const st = si >= 0 ? sim.st[si] : null;
      if (!st || st.k === 'pot' || st.k === 'pan' || st.k === 'oven') continue;
      const wx = side ? W - 0.14 : 0.14;
      const zc = (y + 0.5) * T;
      wd.box(0.26, 0.035, T * 0.92, wx, 1.72, zc, '#b98a5a');
      // mãos-francesas
      for (const o of [-0.36, 0.36]) mt.box(0.03, 0.14, 0.03, side ? W - 0.03 : 0.03, 1.58, zc + o, '#3a3a44');
      for (let j = 0; j < 3; j++) {
        const jz = zc + (j - 1) * 0.29;
        const jc = jarCols[(y * 3 + j + side) % jarCols.length];
        const hj = 0.15 + ((y + j) % 2) * 0.05;
        glass.lathe([[0, 0], [0.06, 0], [0.068, 0.012], [0.07, hj - 0.03], [0.055, hj - 0.005], [0.05, hj]], wx, 1.755, jz, '#e8f6ff', 14);
        b.lathe([[0, 0], [0.062, 0], [0.064, hj * 0.62], [0, hj * 0.66]], wx, 1.758, jz, jc, 12);
        mt.rcyl(0.054, 0.03, wx, 1.755 + hj, jz, j % 2 ? '#d4a017' : '#c8ccd6', 14, 0.3);
      }
    }
  // relógio de parede (aro de metal, mostrador, ponteiros) na parede do fundo (sul)
  const ck = { x: W / 2, y: 2.25, z: DZ };
  mt.rcyl(0.33, 0.06, ck.x, ck.y, ck.z - 0.06, '#c9ced8', 32, 0.4, Math.PI / 2);
  cer.cyl(0.29, 0.29, 0.01, ck.x, ck.y, ck.z - 0.065, '#fffdf6', 32, Math.PI / 2);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    dk.sharp(0.012, i % 3 ? 0.03 : 0.05, 0.006, ck.x + Math.sin(a) * 0.24, ck.y - (i % 3 ? 0.015 : 0.025) + Math.cos(a) * 0.24, ck.z - 0.078, '#2a2238', 0, 0, -a);
  }
  dk.sharp(0.018, 0.16, 0.008, ck.x, ck.y, ck.z - 0.082, '#2a2238', 0, 0, 0.6);
  dk.sharp(0.014, 0.22, 0.008, ck.x, ck.y, ck.z - 0.088, '#2a2238', 0, 0, -1.9);
  b.sph(0.018, ck.x, ck.y, ck.z - 0.095, '#ff5c7a');
  // trilho com panelas de cobre penduradas na parede sul
  for (let x = 1; x < C - 1; x += 2) {
    const rx = x * T + T / 2;
    mt.cyl(0.012, 0.012, 0.9, rx - 0.45, 1.95, DZ - 0.08, '#9aa0aa', 8, 0, -Math.PI / 2);
    for (const [o, r, c] of [[-0.26, 0.11, '#c8743a'], [0.04, 0.085, '#d08a4a'], [0.28, 0.07, '#b8b8c4']] as const) {
      const px = rx + o;
      mt.torus(0.02, 0.004, px, 1.93, DZ - 0.08, '#9aa0aa', 0, 8);
      mt.lathe([[0, 0], [r * 0.9, 0], [r, 0.02], [r, r * 0.9]], px, 1.9 - r - 0.24, DZ - 0.1 - r, c, 16, -Math.PI / 2 + 0.05);
      mt.box(0.024, 0.2, 0.012, px, 1.9 - 0.25, DZ - 0.092, c);
    }
  }

  // ---------------- bancadas e estações ----------------
  const bodyShape = new CANNON.Box(new CANNON.Vec3(T / 2, H / 2, T / 2));
  const steel = th === 'space' ? '#d6dbf0' : '#d9dde6';
  const cab = D.counterSide;
  for (const st of sim.st) {
    const cx = (st.x + 0.5) * T;
    const cz = (st.y + 0.5) * T;
    const usable = !!(st.fx || st.fy);
    const face = Math.atan2(st.fx, st.fy); // giro para a frente da estação
    const cs = Math.cos(face);
    const sn_ = Math.sin(face);
    /** local (lx lateral, lz para a frente) → mundo */
    const P = (lx: number, lz: number): [number, number] => [cx + lx * cs + lz * sn_, cz - lx * sn_ + lz * cs];
    const lb = (B: GeoBuilder, w: number, h: number, d: number, lx: number, y: number, lz: number, col: string, rx = 0, rz = 0, ry = 0) => {
      const [x, z] = P(lx, lz);
      B.box(w, h, d, x, y, z, col, face + ry, rx, rz);
    };
    const ls = (B: GeoBuilder, w: number, h: number, d: number, lx: number, y: number, lz: number, col: string, rx = 0) => {
      const [x, z] = P(lx, lz);
      B.sharp(w, h, d, x, y, z, col, face, rx);
    };
    const lc = (B: GeoBuilder, r: number, h: number, lx: number, y: number, lz: number, col: string, seg = 16, bev = 0.2) => {
      const [x, z] = P(lx, lz);
      B.rcyl(r, h, x, y, z, col, seg, bev);
    };
    const ll = (B: GeoBuilder, prof: [number, number][], lx: number, y: number, lz: number, col: string, seg = RS, grad = 0) => {
      const [x, z] = P(lx, lz);
      B.lathe(prof, x, y, z, col, seg, 0, 0, 0, grad);
    };
    /** tubo em coordenadas locais */
    const lt = (B: GeoBuilder, pts: [number, number, number][], r: number, col: string, segs = 12) => {
      B.tube(
        pts.map(([a, y, c]) => {
          const [x, z] = P(a, c);
          return [x, y, z];
        }),
        r,
        col,
        segs,
        6,
      );
    };
    /** botão de fogão/forno na frente (eixo para fora) */
    const knob = (lx: number, y: number, lz: number, col = '#2a2a33') => {
      const [x, z] = P(lx, lz);
      mt.rcyl(0.04, 0.012, x, y, z, '#cfd3dc', 14, 0.3, Math.PI / 2, 0, face);
      dk.rcyl(0.03, 0.035, x + sn_ * 0.012, y, z + cs * 0.012, col, 14, 0.35, Math.PI / 2, 0, face);
      const [x2, z2] = P(lx, lz + 0.05);
      b.sharp(0.008, 0.026, 0.006, x2, y + 0.002, z2, '#ff5c7a', face);
    };
    const stove = st.k === 'pot' || st.k === 'pan' || st.k === 'oven';
    const bodyCol = usable ? cab : shade(cab, -0.15);
    // -------- móvel: rodapé recuado, caixa, portas almofadadas com puxadores de inox --------
    ls(b, T - 0.04, 0.1, T - 0.14, 0, 0, -0.04, shade(cab, -0.45));
    lb(b, T - 0.02, H - 0.15, T - 0.06, 0, 0.09, -0.02, bodyCol);
    if (usable) {
      if (stove) {
        // frente de fogão industrial: painel de inox + porta do forno com visor
        lb(mt, T - 0.06, H - 0.24, 0.03, 0, 0.12, T / 2 - 0.05, steel);
        lb(dk, T * 0.6, 0.26, 0.012, 0, 0.32, T / 2 - 0.03, '#1b1822');
        lt(mt, [[-0.3, 0.72, T / 2 - 0.03], [-0.28, 0.74, T / 2 + 0.03], [0.28, 0.74, T / 2 + 0.03], [0.3, 0.72, T / 2 - 0.03]], 0.012, '#eef0f5', 16);
        lb(mt, T - 0.04, 0.08, 0.05, 0, H - 0.17, T / 2 - 0.03, shade(steel, -0.08));
      } else {
        // gaveta em cima + 2 portas almofadadas
        const dw = T - 0.08;
        lb(b, dw, 0.15, 0.025, 0, H - 0.27, T / 2 - 0.03, shade(cab, 0.12));
        lt(mt, [[-0.12, H - 0.19, T / 2 - 0.02], [-0.11, H - 0.19, T / 2 + 0.015], [0.11, H - 0.19, T / 2 + 0.015], [0.12, H - 0.19, T / 2 - 0.02]], 0.008, '#e6e9f0', 12);
        for (const sd of [-1, 1]) {
          const ox = sd * (dw / 4 + 0.006);
          lb(b, dw / 2 - 0.012, H - 0.48, 0.025, ox, 0.14, T / 2 - 0.03, shade(cab, 0.1));
          lb(b, dw / 2 - 0.1, H - 0.58, 0.012, ox, 0.19, T / 2 - 0.012, shade(cab, 0.2));
          lt(mt, [[ox - sd * 0.17, 0.52, T / 2 - 0.02], [ox - sd * 0.17, 0.52, T / 2 + 0.012], [ox - sd * 0.17, 0.36, T / 2 + 0.012], [ox - sd * 0.17, 0.36, T / 2 - 0.02]], 0.008, '#e6e9f0', 10);
        }
      }
    }
    // tampo: pedra com borda arredondada e leve beiral
    const topCol = st.k === 'crate' ? '#c9a27a' : stove ? '#2a2733' : D.counter;
    if (st.k === 'sink') {
      // tampo vazado em volta da cuba
      lb(mt, T, 0.045, 0.14, 0, H - 0.045, T / 2 - 0.05, steel);
      lb(mt, T, 0.045, 0.14, 0, H - 0.045, -T / 2 + 0.07, steel);
      lb(mt, 0.15, 0.045, T, -T / 2 + 0.075, H - 0.045, 0, steel);
      lb(mt, 0.15, 0.045, T, T / 2 - 0.075, H - 0.045, 0, steel);
    } else if (stove) lb(dk, T + 0.01, 0.05, T + 0.01, 0, H - 0.05, 0.005, topCol);
    else lb(sn, T + 0.01, 0.05, T + 0.02, 0, H - 0.05, 0.01, topCol);
    const top = H;
    switch (st.k) {
      case 'crate': {
        // caixote de feira: ripas com frestas, cantoneiras, palha por dentro
        const cw = 0.84;
        const ch = 0.3;
        for (const sd of [-1, 1])
          for (let i = 0; i < 3; i++) {
            lb(wd, cw, 0.075, 0.022, 0, top + 0.02 + i * 0.095, sd * (cw / 2 - 0.011), '#d9a868');
            lb(wd, 0.022, 0.075, cw, sd * (cw / 2 - 0.011), top + 0.02 + i * 0.095, 0, '#cf9d5e');
          }
        for (const [a, c] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) lb(wd, 0.05, ch, 0.05, a * (cw / 2 - 0.02), top, c * (cw / 2 - 0.02), '#a8743c');
        lb(wd, cw - 0.04, 0.02, cw - 0.04, 0, top + 0.01, 0, '#b88a50');
        // palha / papel de seda
        b.sph(0.38, cx, top + 0.2, cz, '#e9d59a', 1, 0.18, 1, 14);
        // etiqueta
        lb(cer, 0.22, 0.06, 0.006, 0, top + 0.13, cw / 2 + 0.002, '#fff6e0');
        break;
      }
      case 'board': {
        // tábua de madeira grossa com canaleta + faca de chef
        lb(wd, 0.7, 0.04, 0.46, 0, top, 0, '#d9a868');
        lb(wd, 0.6, 0.004, 0.36, 0, top + 0.039, 0, '#c4925a');
        lb(wd, 0.56, 0.0045, 0.32, 0, top + 0.04, 0, '#ddb070');
        const [kx, kz] = P(0.42, 0.06);
        mt.box(0.2, 0.004, 0.045, kx, top + 0.008, kz, '#eef1f7', face + Math.PI / 2 + 0.2);
        const [hx, hz] = P(0.46, -0.1);
        dk.box(0.11, 0.022, 0.032, hx, top + 0.003, hz, '#2a1a12', face + Math.PI / 2 + 0.2);
        for (const o of [-0.02, 0.02]) {
          const [rx2, rz2] = P(0.46 + o * 0.2, -0.1 + o);
          mt.cyl(0.004, 0.004, 0.026, rx2, top + 0.0, rz2, '#cfd3dc', 6);
        }
        break;
      }
      case 'pot':
      case 'pan': {
        // grelha de ferro fundido + queimador
        lc(dk, 0.13, 0.025, 0, top, 0, '#1a1820', 16);
        lc(mt, 0.07, 0.03, 0, top + 0.01, 0, '#3a3a44', 14);
        dk.torus(0.22, 0.012, cx, top + 0.055, cz, '#24222c', Math.PI / 2, 24);
        for (let i = 0; i < 4; i++) {
          const a = face + i * (Math.PI / 2) + Math.PI / 4;
          const [gx, gz] = [cx + Math.sin(a) * 0.15, cz + Math.cos(a) * 0.15];
          dk.box(0.16, 0.022, 0.02, gx, top + 0.045, gz, '#24222c', a + Math.PI / 2);
        }
        for (const o of [-0.3, -0.1, 0.1, 0.3]) knob(o, H * 0.82, T / 2 + 0.005);
        if (st.k === 'pot') {
          // caldeirão de inox: parede dupla, borda virada, alças, tampa de vidro
          ll(mt, [[0, 0.0], [0.21, 0.0], [0.235, 0.015], [0.245, 0.04], [0.245, 0.3], [0.258, 0.315], [0.25, 0.325], [0.232, 0.315], [0.228, 0.05], [0.0, 0.05]], 0, top + 0.065, 0, '#d4d8e2', RS + 4);
          for (const sd of [-1, 1])
            lt(mt, [[sd * 0.24, top + 0.32, -0.05], [sd * 0.31, top + 0.34, -0.03], [sd * 0.31, top + 0.34, 0.03], [sd * 0.24, top + 0.32, 0.05]], 0.012, '#c4c8d2', 10);
          glass.lathe([[0.0, 0.07], [0.12, 0.06], [0.235, 0.0], [0.22, 0.0], [0.0, 0.055]], cx, top + 0.33, cz, '#bfe8ff', RS);
          mt.rcyl(0.035, 0.03, cx, top + 0.395, cz, '#2a2733', 12, 0.4);
        } else {
          // frigideira antiaderente com cabo de baquelite
          ll(dk, [[0, 0.0], [0.24, 0.0], [0.27, 0.02], [0.29, 0.075], [0.282, 0.078], [0.26, 0.026], [0.23, 0.012], [0, 0.012]], 0, top + 0.06, 0, '#2c2a36', RS + 4);
          ll(mt, [[0.24, -0.002], [0.272, 0.02], [0.292, 0.074], [0.296, 0.074], [0.276, 0.016], [0.24, -0.006]], 0, top + 0.06, 0, '#b9bcc6', RS + 4);
          lt(mt, [[0.28, top + 0.1, 0], [0.34, top + 0.115, 0]], 0.016, '#b9bcc6', 4);
          lt(dk, [[0.34, top + 0.115, 0], [0.45, top + 0.13, 0], [0.56, top + 0.145, 0]], 0.022, '#1e1b26', 8);
          const [hx, hz] = P(0.56, 0);
          mt.torus(0.016, 0.005, hx, top + 0.145, hz, '#b9bcc6', 0, 10, face + Math.PI / 2);
        }
        break;
      }
      case 'oven': {
        // forno de bancada de inox: porta com visor, puxador em barra, painel de controle, pés
        for (const [a, c] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) lc(dk, 0.025, 0.03, a * 0.42, top, c * 0.38, '#1a1820', 10);
        lb(mt, 0.98, 0.6, 0.86, 0, top + 0.03, -0.03, steel);
        lb(mt, 0.24, 0.5, 0.02, 0.36, top + 0.08, 0.4, shade(steel, -0.1));
        for (const yy of [0.47, 0.34, 0.21]) knob(0.36, top + yy, 0.415);
        lb(dk, 0.64, 0.46, 0.03, -0.12, top + 0.1, 0.4, '#2a2733');
        {
          const [gx, gz] = P(-0.12, 0.42);
          glass.box(0.5, 0.3, 0.012, gx, top + 0.17, gz, '#ffb366', face);
        }
        lt(mt, [[-0.38, top + 0.5, 0.41], [-0.37, top + 0.52, 0.46], [0.13, top + 0.52, 0.46], [0.14, top + 0.5, 0.41]], 0.013, '#eef0f5', 14);
        glow.box(0.5, 0.025, 0.5, cx, top + 0.1, cz, '#ff7a2e', face);
        // chaminé
        lc(mt, 0.05, 0.12, -0.3, top + 0.62, -0.25, '#b9bcc6', 12);
        break;
      }
      case 'blender': {
        // base pesada, jarra de vidro facetada, tampa e botões
        ll(b, [[0, 0], [0.16, 0], [0.17, 0.02], [0.15, 0.14], [0.12, 0.16], [0, 0.16]], 0, top, 0, '#3a3546', 12);
        for (const o of [-0.05, 0, 0.05]) {
          const [x, z] = P(o, 0.145);
          b.rcyl(0.016, 0.012, x, top + 0.07, z, o ? '#dfe3ea' : '#ff5c7a', 10, 0.4, Math.PI / 2, 0, face);
        }
        glass.lathe([[0.0, 0.0], [0.1, 0.0], [0.17, 0.4], [0.165, 0.42], [0.0, 0.42]], cx, top + 0.16, cz, '#e0feff', 8);
        lc(dk, 0.175, 0.04, 0, top + 0.575, 0, '#2a2238', 16, 0.3);
        lc(dk, 0.05, 0.03, 0, top + 0.61, 0, '#2a2238', 12, 0.4);
        lt(dk, [[0.13, top + 0.52, 0], [0.24, top + 0.48, 0], [0.24, top + 0.26, 0], [0.12, top + 0.22, 0]], 0.02, '#2a2238', 12);
        break;
      }
      case 'plates':
        // tapete de borracha + suporte de pratos
        lb(dk, 0.56, 0.012, 0.56, 0, top, 0, '#5a6070');
        for (const sd of [-1, 1]) lb(mt, 0.012, 0.18, 0.5, sd * 0.24, top, 0, '#cfd3dc');
        break;
      case 'dirty':
        // bacia plástica de louça suja
        ll(b, [[0, 0], [0.3, 0], [0.33, 0.12], [0.34, 0.125], [0.33, 0.13], [0.31, 0.02], [0, 0.02]], 0, top, 0, '#8a9ab8', RS);
        break;
      case 'sink': {
        // cuba de inox funda, ralo, água, torneira gourmet (pescoço de ganso) e registros
        const bw = 0.62;
        const by = top - 0.2;
        lb(mt, bw + 0.04, 0.02, bw + 0.04, 0, by, 0, shade(steel, -0.15));
        for (const sd of [-1, 1]) {
          lb(mt, bw + 0.04, 0.2, 0.02, 0, by, sd * (bw / 2 + 0.01), shade(steel, -0.08));
          lb(mt, 0.02, 0.2, bw + 0.04, sd * (bw / 2 + 0.01), by, 0, shade(steel, -0.04));
        }
        lc(dk, 0.035, 0.01, 0, by + 0.02, 0, '#3a3a44', 12);
        glass.box(bw, 0.01, bw, cx, top - 0.08, cz, '#7ad0ff');
        const fz = -0.42;
        lc(mt, 0.035, 0.05, 0, top, fz, '#e9ecf2', 14);
        lt(mt, [[0, top + 0.04, fz], [0, top + 0.3, fz], [0, top + 0.4, fz + 0.06], [0, top + 0.36, fz + 0.2], [0, top + 0.26, fz + 0.24]], 0.016, '#e9ecf2', 20);
        lc(mt, 0.02, 0.03, 0, top + 0.23, fz + 0.24, '#d4d8e2', 10);
        for (const sd of [-1, 1]) {
          lc(mt, 0.025, 0.05, sd * 0.16, top, fz, '#e9ecf2', 10);
          lt(mt, [[sd * 0.16, top + 0.05, fz], [sd * 0.16, top + 0.065, fz + 0.03], [sd * 0.16, top + 0.07, fz + 0.08]], 0.008, '#e9ecf2', 6);
          const [x, z] = P(sd * 0.16, fz);
          b.sph(0.012, x, top + 0.052, z, sd < 0 ? '#ff5c7a' : '#5aaaff');
        }
        // esponja e detergente
        lb(b, 0.09, 0.03, 0.06, 0.36, top, 0.36, '#ffd84a');
        lb(b, 0.09, 0.012, 0.06, 0.36, top + 0.03, 0.36, '#4fd67a');
        ll(b, [[0, 0], [0.032, 0], [0.034, 0.12], [0.015, 0.15], [0.008, 0.17], [0, 0.17]], 0.36, top, 0.22, '#4fd67a', 12);
        break;
      }
      case 'trash': {
        // lixeira de pedal: corpo cilíndrico, tampa abaulada, pedal
        ll(b, [[0, 0], [0.24, 0], [0.26, 0.02], [0.28, 0.5], [0.29, 0.52], [0, 0.52]], 0, top, 0, '#3ec96a', RS, 0.25);
        ll(b, [[0.295, 0], [0.295, 0.03], [0.24, 0.07], [0.12, 0.09], [0, 0.095]], 0, top + 0.52, 0, '#2f9e54', RS);
        lb(mt, 0.12, 0.02, 0.08, 0, top + 0.01, 0.27, '#cfd3dc');
        lc(dk, 0.05, 0.03, 0, top + 0.6, 0, '#26803f', 12, 0.4);
        break;
      }
      case 'window': {
        // balcão de entrega de inox, lâmpada de aquecimento, sininho
        lb(mt, T - 0.04, 0.035, T - 0.1, 0, top, 0, steel);
        const [bx, bz] = P(0.36, 0.2);
        mt.lathe([[0.06, 0], [0.065, 0.006], [0.06, 0.02], [0.045, 0.045], [0.02, 0.06], [0, 0.064]], bx, top + 0.04, bz, '#e8c24a', 16);
        mt.rcyl(0.07, 0.008, bx, top + 0.035, bz, '#2a2238', 16, 0.3);
        mt.rcyl(0.01, 0.025, bx, top + 0.1, bz, '#cfd3dc', 8);
        // lâmpada de aquecimento
        mt.box(T - 0.16, 0.06, 0.18, cx, HATCH_TOP - 0.42, cz + 0.05, '#b9bcc6');
        glow.box(T - 0.24, 0.012, 0.12, cx, HATCH_TOP - 0.43, cz + 0.05, '#ff9a4a');
        for (const sd of [-1, 1]) mt.cyl(0.008, 0.008, 0.36, cx + sd * 0.4, HATCH_TOP - 0.36, cz + 0.05, '#9aa0aa', 6);
        break;
      }
      case 'belt': {
        // esteira: trilhos laterais de inox, roletes, lona de borracha
        for (const sd of [-1, 1]) lb(mt, T, 0.12, 0.04, 0, top, sd * 0.32, steel);
        for (let i = -2; i <= 2; i++) lt(mt, [[i * 0.22, top + 0.06, -0.3], [i * 0.22, top + 0.06, 0.3]], 0.03, '#9aa0aa', 2);
        lb(dk, T, 0.012, 0.58, 0, top + 0.085, 0, '#2c2a34');
        break;
      }
    }
    const body = new CANNON.Body({ mass: 0, shape: bodyShape, material: staticMat });
    body.position.set(cx, H / 2, cz);
    world.addBody(body);
  }
  // exaustores de inox (tronco de pirâmide + duto) sobre os fogões
  for (const st of sim.st)
    if (st.k === 'pot' || st.k === 'pan') {
      const cx = (st.x + 0.5) * T - st.fx * 0.06;
      const cz = (st.y + 0.5) * T - st.fy * 0.06;
      const ry = Math.atan2(st.fx, st.fy);
      mt.frustum(T * 0.98, T * 0.86, T * 0.4, T * 0.34, 0.32, cx, 1.95, cz, steel, ry);
      mt.box(T * 0.98, 0.06, T * 0.86, cx, 1.9, cz, shade(steel, -0.06), ry);
      mt.box(T * 0.34, WALL_H - 2.27, T * 0.3, cx - st.fx * 0.1, 2.27, cz - st.fy * 0.1, steel, ry);
      glow.box(T * 0.7, 0.01, 0.06, cx, 1.895, cz, '#fff3c4', ry);
    }

  // ---------------- salão (do outro lado do passa-pratos) ----------------
  const dfl = new THREE.Mesh(mk(new THREE.PlaneGeometry(W + 4, 5)), lam({ color: D.dining, map: rep(wood.map, (W + 4) / 1.2, 5 / 1.2), roughness: 0.6 }));
  dfl.rotation.x = -Math.PI / 2;
  dfl.position.set(W / 2, 0, -2.5);
  group.add(dfl);
  const back = new THREE.Mesh(mk(new THREE.PlaneGeometry(W + 4, 3.2)), lam({ color: shade(D.wall, 0.35) }));
  back.position.set(W / 2, 1.6, -5);
  group.add(back);
  // lambri + quadros no salão
  wd.sharp(W + 4, 0.9, 0.04, W / 2, 0, -4.98, shade(D.wall, -0.1));
  for (let i = 0; i < 3; i++) {
    const px = ((i + 0.5) / 3) * W;
    wd.box(0.7, 0.5, 0.04, px, 1.6, -4.96, '#8a5a30');
    b.sharp(0.6, 0.4, 0.01, px, 1.65, -4.93, ['#ffcf9a', '#9fe08a', '#7ad0ff'][i]);
  }
  for (let i = 0; i < sim.seats; i++) {
    const sx = ((i + 0.5) / sim.seats) * W;
    // mesa redonda com toalha xadrez (torno) + pé de ferro
    dk.lathe([[0.22, 0], [0.2, 0.02], [0.05, 0.05], [0.04, 0.7], [0, 0.7]], sx, 0, -2.4, '#2a2733', 16);
    cer.lathe([[0, 0.72], [0.47, 0.72], [0.5, 0.71], [0.52, 0.6], [0.53, 0.58], [0.5, 0.6], [0.48, 0.7], [0, 0.7]], sx, 0, -2.4, i % 2 ? '#ff7a8a' : '#fff6ea', 24);
    // cadeira bistrô: assento, encosto curvo de madeira, pernas de metal
    const cz2 = -3.05;
    wd.rcyl(0.21, 0.05, sx, 0.45, cz2, '#b8783e', 18, 0.35);
    for (const [a, c] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) dk.cyl(0.014, 0.014, 0.45, sx + a * 0.14, 0, cz2 + c * 0.14, '#2a2733', 6);
    for (const sd of [-1, 1]) dk.cyl(0.014, 0.014, 0.45, sx + sd * 0.16, 0.5, cz2 - 0.15, '#2a2733', 6);
    wd.tube([[sx - 0.18, 0.92, cz2 - 0.12], [sx, 0.95, cz2 - 0.2], [sx + 0.18, 0.92, cz2 - 0.12]], 0.035, '#b8783e', 10, 6);
    // jarrinho com flor
    glass.lathe([[0, 0], [0.04, 0], [0.045, 0.06], [0.02, 0.12], [0.025, 0.14]], sx + 0.15, 0.72, -2.35, '#d8f6ff', 10);
    b.sph(0.03, sx + 0.15, 0.88, -2.35, ['#ff5c7a', '#ffd84a', '#c98aff'][i % 3], 1, 1, 1, 8);
    b.cyl(0.004, 0.004, 0.16, sx + 0.15, 0.72, -2.35, '#3e9e54', 4);
  }

  const solidMat = lam({ vertexColors: true, roughness: 0.55 });
  const woodMat = lam({ vertexColors: true, map: wood.map, roughness: 0.68, ...(standard ? { normalMap: wood.normal, normalScale: new THREE.Vector2(0.5, 0.5) } : {}) });
  const metalMat = standard
    ? mk(new THREE.MeshStandardMaterial({ vertexColors: true, map: brushed.map, metalness: 0.85, roughness: 0.32, roughnessMap: brushed.map }))
    : lam({ vertexColors: true });
  const darkMat = lam({ vertexColors: true, roughness: 0.42, metalness: standard ? 0.3 : 0 });
  const stoneMat = lam({ vertexColors: true, map: stone.map, roughness: 0.22, ...(standard ? { normalMap: stone.normal, normalScale: new THREE.Vector2(0.25, 0.25) } : {}) });
  const cerMat = lam({ vertexColors: true, roughness: 0.18 });
  for (const [B, m] of [[b, solidMat], [wd, woodMat], [mt, metalMat], [dk, darkMat], [sn, stoneMat], [cer, cerMat]] as const) {
    if (B.empty) continue;
    const mesh = new THREE.Mesh(mk(B.build()), m);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  if (!glass.empty) {
    const gm = standard
      ? mk(new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.38, roughness: 0.05, metalness: 0.1, depthWrite: false }))
      : mk(new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.45, depthWrite: false }));
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
