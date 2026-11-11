/* ============================================================
 *  NOITES · CONSTRUÇÃO — modelos low-poly (cor por vértice).
 *  Uma geometria por (peça, forma) → InstancedMesh por variante.
 *  Barreiras são montadas por "braços": a forma (poste, ponta,
 *  reta, canto, T, cruz) decide o poste central e os braços.
 *  Origem = centro da célula no chão; braço canônico para +z.
 * ============================================================ */
import * as THREE from 'three';
import { G, PB } from '../models';
import { CELL, PIECE, Shape, type PK } from './pieces';

const H = CELL / 2;
const CANON_ARMS: number[][] = [[], [0], [0, 2], [0, 1], [0, 1, 2], [0, 1, 2, 3]];
/** braço i (0=N +z, 1=L +x, 2=S −z, 3=O −x) → ângulo em y */
const ARM_ROT = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

/** pseudo-aleatório determinístico (madeira "feita à mão") */
const jit = (i: number, k = 1) => (Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1;

/** adiciona `g` com transformação dentro de um braço girado `ry` (coordenadas locais do braço: x lateral, z ao longo) */
function armAdd(b: PB, ry: number, g: THREE.BufferGeometry, col: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ryy = 0, rz = 0, sh = 0): void {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  // Ry: (x,z) → (x c + z s, −x s + z c)
  if (!rx && !rz) return void b.add(g, col, x * c + z * s, y, -x * s + z * c, sx, sy, sz, 0, ry + ryy, 0, sh);
  // giro do braço por fora (mundo) e inclinação local por dentro
  _qa.setFromAxisAngle(_up, ry).multiply(_qb.setFromEuler(_eu.set(rx, ryy, rz)));
  _eu.setFromQuaternion(_qa);
  b.add(g, col, x * c + z * s, y, -x * s + z * c, sx, sy, sz, _eu.x, _eu.y, _eu.z, sh);
}
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _eu = new THREE.Euler();
const _up = new THREE.Vector3(0, 1, 0);

/* ------------------------------ cerca de madeira ------------------------------ */
const FW = { post: '#9a6436', cap: '#e2b070', rail: '#b07a44', pick: ['#d49a5c', '#c88e52', '#dca468'], dark: '#6a4020' };
function fenceArm(b: PB, ry: number, i: number): void {
  // trilhos
  armAdd(b, ry, G.box, FW.rail, 0, 0.38, H / 2, 0.07, 0.09, H + 0.04);
  armAdd(b, ry, G.box, FW.rail, 0, 0.8, H / 2, 0.07, 0.09, H + 0.04);
  // tábuas pontudas
  for (const [j, z] of [0.19, 0.56].entries()) {
    const c = FW.pick[(i + j) % 3];
    const h = 0.98 + jit(i * 3 + j) * 0.06;
    armAdd(b, ry, G.box, c, 0, h / 2, z, 0.05, h, 0.17, 0, 0, 0, 0.35);
    armAdd(b, ry, G.box, c, 0, h + 0.005, z, 0.05, 0.12, 0.12, Math.PI / 4, 0, 0);
    // pregos
    armAdd(b, ry, G.box, FW.dark, 0.03, 0.8, z, 0.02, 0.03, 0.03);
    armAdd(b, ry, G.box, FW.dark, 0.03, 0.38, z, 0.02, 0.03, 0.03);
  }
}
function fencePost(b: PB, big: boolean): void {
  const r = big ? 0.13 : 0.1;
  b.add(G.cyl, FW.post, 0, 0.58, 0, r * 2, 1.16, r * 2, 0, 0, 0, 0.4);
  b.add(G.cone5, FW.cap, 0, 1.24, 0, r * 2.3, 0.2, r * 2.3);
  if (big) b.add(G.cyl, FW.dark, 0, 0.98, 0, r * 2.15, 0.06, r * 2.15);
}

/* ------------------------------ cerca reforçada (paliçada) ------------------------------ */
const RW = { log: ['#8a5a30', '#7a4e28', '#946238'], tip: '#e0b878', band: '#59606e', bolt: '#c8d0dc', post: '#6a4224' };
function rfenceArm(b: PB, ry: number, i: number): void {
  for (const [j, z] of [0.19, 0.56].entries()) {
    const c = RW.log[(i + j) % 3];
    const h = 1.32 + jit(i * 5 + j, 2) * 0.1;
    armAdd(b, ry, G.cyl, c, 0, h / 2, z, 0.22, h, 0.22, 0, jit(j) * 2, 0, 0.4);
    armAdd(b, ry, G.cone5, RW.tip, 0, h + 0.11, z, 0.22, 0.24, 0.22);
  }
  for (const y of [0.42, 1.02]) {
    armAdd(b, ry, G.box, RW.band, 0, y, H / 2, 0.25, 0.09, H + 0.02);
    armAdd(b, ry, G.box, RW.bolt, 0.13, y, 0.38, 0.03, 0.05, 0.05);
    armAdd(b, ry, G.box, RW.bolt, -0.13, y, 0.38, 0.03, 0.05, 0.05);
  }
}
function rfencePost(b: PB, big: boolean): void {
  const r = big ? 0.19 : 0.13;
  if (big) b.add(G.dodec, '#8a8c9a', 0, 0.12, 0, 0.62, 0.3, 0.62);
  b.add(G.cyl, RW.post, 0, 0.78, 0, r * 2, 1.56, r * 2, 0, 0, 0, 0.4);
  b.add(G.cone5, RW.tip, 0, 1.68, 0, r * 2.2, 0.3, r * 2.2);
  b.add(G.cyl, RW.band, 0, 1.02, 0, r * 2.2, 0.1, r * 2.2);
  b.add(G.cyl, RW.band, 0, 0.42, 0, r * 2.2, 0.1, r * 2.2);
}

/* ------------------------------ muro de pedra ------------------------------ */
const SW = { base: '#8a90a4', st: ['#a4aabd', '#9298ac', '#b0b4c4', '#868ca0'], cap: '#c4c8d4', moss: '#5f9a4a', mort: '#6e7486' };
function wallArm(b: PB, ry: number, i: number, merlon: boolean): void {
  armAdd(b, ry, G.box, SW.mort, 0, 0.62, H / 2, 0.56, 1.24, H + 0.02);
  // fiadas de pedras (salientes, tons alternados) dos dois lados
  const rows = [0.17, 0.5, 0.83, 1.12];
  rows.forEach((y, r) => {
    const off = r % 2 ? 0.19 : 0;
    for (let k = 0; k < 2; k++) {
      const z = 0.19 + k * 0.38 + off - (off && k === 1 ? 0.38 : 0);
      const zz = Math.min(H - 0.17, Math.max(0.17, z));
      const c = SW.st[(i + r * 3 + k) % 4];
      armAdd(b, ry, G.box, c, 0, y, zz, 0.62, 0.29, 0.34, 0, 0, 0, 0.2);
    }
  });
  armAdd(b, ry, G.box, SW.cap, 0, 1.32, H / 2, 0.7, 0.12, H + 0.04);
  if (merlon) armAdd(b, ry, G.box, SW.st[i % 4], 0, 1.5, H / 2, 0.6, 0.26, 0.4);
  armAdd(b, ry, G.ico0, SW.moss, 0.31, 0.06, 0.3 + jit(i) * 0.2, 0.2, 0.12, 0.3);
}
function wallPillar(b: PB): void {
  b.add(G.box, SW.base, 0, 0.8, 0, 0.82, 1.6, 0.82, 0, 0, 0, 0.25);
  for (const y of [0.3, 0.9]) {
    b.add(G.box, SW.st[0], 0, y, 0, 0.88, 0.28, 0.6);
    b.add(G.box, SW.st[2], 0, y + 0.3, 0, 0.6, 0.28, 0.88);
  }
  b.add(G.box, SW.cap, 0, 1.66, 0, 0.98, 0.14, 0.98);
  b.add(G.box, SW.st[1], 0, 1.8, 0, 0.6, 0.18, 0.6);
  b.add(G.ico0, SW.moss, 0.42, 0.06, 0.3, 0.26, 0.14, 0.3);
}

/* ------------------------------ formas das barreiras ------------------------------ */
function barrier(kind: 'fence' | 'rfence' | 'wall', shape: Shape): THREE.BufferGeometry {
  const b = new PB();
  const arms = CANON_ARMS[shape];
  const straight = shape === Shape.Straight;
  for (const a of arms) {
    if (kind === 'fence') fenceArm(b, ARM_ROT[a], a);
    else if (kind === 'rfence') rfenceArm(b, ARM_ROT[a], a);
    else wallArm(b, ARM_ROT[a], a, straight);
  }
  if (kind === 'wall') {
    if (!straight) wallPillar(b);
  } else if (straight) {
    // reta: poste fino escondido entre as tábuas (sem "nó" no meio)
    if (kind === 'fence') b.add(G.cyl, FW.post, 0, 0.5, 0, 0.12, 1.0, 0.12);
  } else if (kind === 'fence') fencePost(b, true);
  else rfencePost(b, shape !== Shape.End);
  return b.geo();
}

/* ------------------------------ portão ------------------------------ */
/** batente do portão (folhas à parte: animadas); eixo ao longo de z */
function gateFrame(): THREE.BufferGeometry {
  const b = new PB();
  for (const z of [-0.68, 0.68]) {
    b.add(G.cyl, '#7a4a26', 0, 0.9, z, 0.26, 1.8, 0.26, 0, 0, 0, 0.4);
    b.add(G.cone5, '#e2b070', 0, 1.88, z, 0.3, 0.18, 0.3);
  }
  b.add(G.box, '#8a5a30', 0, 1.74, 0, 0.16, 0.16, 1.62);
  // plaquinha com estrela
  b.add(G.box, '#f3d9a8', 0, 1.74, 0, 0.2, 0.22, 0.42);
  b.add(G.ico0, '#ffd34a', 0.11, 1.74, 0, 0.04, 0.14, 0.14);
  b.add(G.ico0, '#ffd34a', -0.11, 1.74, 0, 0.04, 0.14, 0.14);
  return b.geo();
}
/** folha do portão: dobradiça na origem, se estende para −z (0,62 m) */
export function gateLeafGeo(): THREE.BufferGeometry {
  const b = new PB();
  const L = 0.6;
  const cols = ['#e0a868', '#d49a5c', '#dcaa70'];
  for (let i = 0; i < 3; i++) b.add(G.box, cols[i], 0, 0.72, -0.1 - i * 0.2, 0.06, 1.1 - (i === 2 ? 0.04 : 0), 0.19, 0, 0, 0, 0.3);
  for (const y of [0.38, 1.06]) b.add(G.box, '#9a6436', 0.035, y, -L / 2, 0.04, 0.1, L);
  b.add(G.box, '#9a6436', 0.035, 0.72, -L / 2, 0.04, 0.09, 0.8, Math.atan2(0.68, L), 0, 0);
  b.add(G.box, '#3a3a48', 0.06, 0.38, -0.05, 0.03, 0.06, 0.14).add(G.box, '#3a3a48', 0.06, 1.06, -0.05, 0.03, 0.06, 0.14);
  b.add(G.sph, '#ffd34a', 0.07, 0.75, -L + 0.06, 0.06, 0.06, 0.06);
  return b.geo();
}

/* ------------------------------ demais peças ------------------------------ */
function tower(): { geo: THREE.BufferGeometry; glow: THREE.BufferGeometry } {
  const b = new PB();
  const g = new PB();
  const leg = '#8a5a30';
  const Y = 2.55;
  for (const [sx, sz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    b.add(G.cyl, leg, sx * 0.56, Y / 2, sz * 0.56, 0.17, Y + 0.1, 0.17, sz * -0.04, 0, sx * 0.04, 0.4);
    b.add(G.cyl, leg, sx * 0.62, Y + 0.45, sz * 0.62, 0.11, 0.9, 0.11);
  }
  // xis de travas nos 4 lados
  const d = Math.atan2(1.12, 1.6);
  for (const s of [-1, 1]) {
    b.add(G.box, '#a8743c', 0, 1.15, s * 0.58, 1.6 * 0.88, 0.08, 0.05, 0, 0, d).add(G.box, '#a8743c', 0, 1.15, s * 0.58, 1.6 * 0.88, 0.08, 0.05, 0, 0, -d);
    b.add(G.box, '#a8743c', s * 0.58, 1.15, 0, 0.05, 0.08, 1.6 * 0.88, d, 0, 0).add(G.box, '#a8743c', s * 0.58, 1.15, 0, 0.05, 0.08, 1.6 * 0.88, -d, 0, 0);
  }
  // escada
  for (const x of [-0.22, 0.22]) b.add(G.box, '#c08a52', x, Y / 2, 0.78, 0.06, Y, 0.06, -0.12, 0, 0);
  for (let y = 0.3; y < Y; y += 0.36) b.add(G.box, '#e2b070', 0, y, 0.78 - (y - Y / 2) * 0.12, 0.44, 0.05, 0.07);
  // plataforma e guarda-corpo
  b.add(G.box, '#b07a44', 0, Y, 0, 1.58, 0.14, 1.58);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    b.add(G.box, '#c88e52', c * 0.74, Y + 0.6, s * 0.74, s ? 1.5 : 0.07, 0.08, s ? 0.07 : 1.5);
    b.add(G.box, '#c88e52', c * 0.74, Y + 0.32, s * 0.74, s ? 1.5 : 0.05, 0.05, s ? 0.05 : 1.5);
  }
  // telhado
  b.add(G.cone, '#e0503a', 0, Y + 1.32, 0, 2.1, 0.62, 2.1, 0, Math.PI / 4, 0, 0.3);
  b.add(G.cone, '#ff7a5a', 0, Y + 1.66, 0, 0.5, 0.3, 0.5, 0, Math.PI / 4);
  b.add(G.sph, '#ffd34a', 0, Y + 1.86, 0, 0.14, 0.14, 0.14);
  // lampião
  b.add(G.box, '#3a3a48', 0, Y + 0.98, 0, 0.04, 0.2, 0.04);
  b.add(G.cyl, '#3a3a48', 0, Y + 0.84, 0, 0.3, 0.05, 0.3).add(G.cyl, '#3a3a48', 0, Y + 0.52, 0, 0.3, 0.05, 0.3);
  g.add(G.sph, '#ffe39a', 0, Y + 0.68, 0, 0.26, 0.32, 0.26);
  return { geo: b.geo(), glow: g.geo() };
}
function spikes(): THREE.BufferGeometry {
  const b = new PB();
  b.add(G.cyl, '#7a4e28', 0, 0.09, -0.32, 0.16, 1.3, 0.16, 0, 0, Math.PI / 2);
  b.add(G.cyl, '#7a4e28', 0, 0.09, 0.32, 0.16, 1.3, 0.16, 0, 0, Math.PI / 2);
  b.add(G.cyl, '#8a5a30', -0.42, 0.13, 0, 0.14, 1.0, 0.14, Math.PI / 2, 0, 0);
  b.add(G.cyl, '#8a5a30', 0.42, 0.13, 0, 0.14, 1.0, 0.14, Math.PI / 2, 0, 0);
  let i = 0;
  for (const x of [-0.38, 0, 0.38])
    for (const z of [-0.32, 0, 0.32]) {
      const h = 0.48 + jit(i++, 3) * 0.12;
      const tx = x * 0.35;
      const tz = z * 0.35;
      b.add(G.cone5, '#e8c890', x, 0.12 + h / 2, z, 0.13, h, 0.13, tz, 0, -tx, 0.35);
      b.add(G.cone5, '#fff4dc', x + tx * h * 0.45, 0.12 + h * 0.9, z + tz * h * 0.45, 0.05, h * 0.22, 0.05, tz, 0, -tx);
    }
  return b.geo();
}
function torch(): { geo: THREE.BufferGeometry; glow: THREE.BufferGeometry } {
  const b = new PB();
  const g = new PB();
  b.add(G.dodec, '#8a8c9a', 0, 0.08, 0, 0.42, 0.2, 0.42);
  b.add(G.cyl, '#7a4a26', 0, 0.68, 0, 0.13, 1.3, 0.13, 0, 0, 0, 0.4);
  b.add(G.cyl, '#c08a52', 0, 1.0, 0, 0.16, 0.08, 0.16);
  b.add(G.taper, '#3a3a48', 0, 1.4, 0, 0.32, 0.2, 0.32, Math.PI);
  g.add(G.cone, '#ff8a2a', 0, 1.66, 0, 0.3, 0.5, 0.3).add(G.cone, '#ffe680', 0, 1.6, 0, 0.16, 0.3, 0.16);
  return { geo: b.geo(), glow: g.geo() };
}
function campfire(): { geo: THREE.BufferGeometry; glow: THREE.BufferGeometry } {
  const b = new PB();
  const g = new PB();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    b.add(G.dodec, ['#9a9cac', '#868a9c', '#b0b2c0'][i % 3], Math.cos(a) * 0.5, 0.1, Math.sin(a) * 0.5, 0.3, 0.24, 0.3, 0, a, 0);
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.3;
    b.add(G.cyl, '#7a4a26', Math.cos(a) * 0.14, 0.2, Math.sin(a) * 0.14, 0.13, 0.7, 0.13, Math.PI / 2 - 0.5, -a + Math.PI / 2, 0);
  }
  b.add(G.dodec, '#3a2a20', 0, 0.06, 0, 0.6, 0.06, 0.6);
  g.add(G.cone, '#ff6a1a', 0, 0.5, 0, 0.55, 0.75, 0.55).add(G.cone, '#ffb030', 0.06, 0.45, 0.04, 0.36, 0.55, 0.36).add(G.cone, '#fff3a0', 0, 0.38, 0, 0.18, 0.32, 0.18);
  return { geo: b.geo(), glow: g.geo() };
}
function chest(): THREE.BufferGeometry {
  const b = new PB();
  b.add(G.box, '#b07a44', 0, 0.3, 0, 0.9, 0.5, 0.58, 0, 0, 0, 0.3);
  b.add(G.cyl12, '#c88e52', 0, 0.55, 0, 0.58, 0.9, 0.58, 0, 0, Math.PI / 2);
  for (const x of [-0.3, 0.3]) {
    b.add(G.box, '#59606e', x, 0.3, 0, 0.08, 0.52, 0.62);
    b.add(G.cyl12, '#59606e', x, 0.55, 0, 0.62, 0.08, 0.62, 0, 0, Math.PI / 2);
  }
  b.add(G.box, '#ffd34a', 0, 0.5, 0.3, 0.16, 0.18, 0.05).add(G.box, '#2a0b5c', 0, 0.48, 0.33, 0.04, 0.06, 0.02);
  return b.geo();
}
function bed(): THREE.BufferGeometry {
  const b = new PB();
  b.add(G.box, '#9a6436', 0, 0.2, 0, 0.98, 0.16, 1.92, 0, 0, 0, 0.3);
  for (const x of [-0.44, 0.44]) for (const z of [-0.88, 0.88]) b.add(G.box, '#7a4a26', x, 0.1, z, 0.1, 0.2, 0.1);
  b.add(G.box, '#9a6436', 0, 0.48, -0.94, 1.0, 0.7, 0.1).add(G.sph, '#e2b070', -0.44, 0.84, -0.94, 0.14, 0.14, 0.14).add(G.sph, '#e2b070', 0.44, 0.84, -0.94, 0.14, 0.14, 0.14);
  b.add(G.box, '#f2f4ff', 0, 0.34, 0, 0.88, 0.14, 1.78);
  b.add(G.box, '#ff8a9a', 0, 0.42, 0.28, 0.94, 0.1, 1.22, 0, 0, 0, 0);
  b.add(G.box, '#ffd0d8', 0, 0.43, -0.28, 0.95, 0.1, 0.12);
  for (const z of [0.05, 0.45]) b.add(G.box, '#ffe080', 0, 0.475, z, 0.96, 0.02, 0.08);
  b.add(G.sph, '#ffffff', 0, 0.48, -0.66, 0.64, 0.18, 0.34);
  return b.geo();
}
function bench(): THREE.BufferGeometry {
  const b = new PB();
  b.add(G.box, '#c08a52', 0, 0.82, 0, 1.4, 0.12, 0.78, 0, 0, 0, 0.2);
  for (const x of [-0.6, 0.6]) for (const z of [-0.3, 0.3]) b.add(G.box, '#7a4a26', x, 0.4, z, 0.11, 0.8, 0.11);
  b.add(G.box, '#9a6436', 0, 0.22, 0, 1.25, 0.06, 0.62);
  // ferramentas: serrote, martelo, morsa, toras
  b.add(G.box, '#d8dce8', -0.25, 0.9, 0.12, 0.5, 0.02, 0.16).add(G.box, '#c0392b', -0.53, 0.91, 0.12, 0.14, 0.05, 0.08);
  b.add(G.cyl, '#8a5228', 0.25, 0.9, -0.15, 0.05, 0.42, 0.05, 0, 0.5, Math.PI / 2).add(G.box, '#5a6478', 0.36, 0.92, -0.08, 0.1, 0.1, 0.2, 0, 0.5, 0);
  b.add(G.box, '#5a6478', 0.55, 0.95, 0.2, 0.18, 0.16, 0.16).add(G.box, '#3a3a48', 0.55, 1.06, 0.2, 0.22, 0.05, 0.05);
  for (let i = 0; i < 3; i++) b.add(G.cyl, '#a8743c', -0.25 + i * 0.22, 0.32, 0, 0.16, 0.6, 0.16, Math.PI / 2, 0, 0);
  return b.geo();
}

/* ------------------------------ rachaduras ------------------------------ */
/** traços escuros em ziguezague nas faces (nível 1 ou 2) */
function cracks(kind: PK, shape: Shape, lv: number): THREE.BufferGeometry {
  const b = new PB();
  // madeira: lascas claras (aparecem até no escuro); pedra: fendas escuras
  const stone = kind === 'wall' || kind === 'campfire';
  const col = stone ? (lv > 1 ? '#2a2a36' : '#4a4a5a') : lv > 1 ? '#fff0c8' : '#e8c890';
  const zig = (ry: number, fx: number, y: number, z: number, n: number, seed: number) => {
    let cy = y;
    let cz = z;
    for (let i = 0; i < n; i++) {
      const a = (jit(seed + i, 7) - 0.5) * 2.2 + (i % 2 ? 0.7 : -0.7);
      const L = 0.14 + jit(seed + i, 9) * 0.08;
      const dy = -Math.cos(a) * L;
      const dz = Math.sin(a) * L;
      for (const s of [-1, 1]) armAdd(b, ry, G.box, col, fx * s, cy + dy / 2, cz + dz / 2, 0.012, 0.025 + lv * 0.01, L, Math.atan2(dy, dz) * -1, 0, 0);
      cy += dy;
      cz += dz;
    }
  };
  const d = PIECE[kind];
  if (d.arms) {
    const fx = kind === 'fence' ? 0.03 : kind === 'rfence' ? 0.112 : 0.315;
    const top = kind === 'wall' ? 1.2 : kind === 'rfence' ? 1.25 : 0.95;
    for (const a of CANON_ARMS[shape]) {
      zig(ARM_ROT[a], fx, top, 0.28 + a * 0.05, lv > 1 ? 4 : 2, a * 11 + lv);
      if (lv > 1) zig(ARM_ROT[a], fx, top * 0.55, 0.55, 3, a * 17);
    }
    if (shape !== Shape.Straight || kind === 'wall') {
      const pr = kind === 'wall' ? 0.42 : kind === 'rfence' ? 0.2 : 0.14;
      zig(0, pr, top + 0.1, 0, lv > 1 ? 4 : 2, 5 + lv);
      zig(Math.PI / 2, pr, top, 0, lv > 1 ? 3 : 1, 8 + lv);
    }
  } else {
    const fx = Math.max(d.hx, 0.2) + 0.01;
    zig(Math.PI / 2, fx, Math.min(1.2, d.h * 0.7), 0, lv > 1 ? 4 : 2, 3 + lv);
    zig(0, Math.max(d.hz, 0.2) + 0.01, Math.min(1.1, d.h * 0.6), 0.1, lv > 1 ? 3 : 2, 13 + lv);
  }
  return b.geo();
}

/* ------------------------------ cache ------------------------------ */
export interface PieceGeo {
  geo: THREE.BufferGeometry;
  glow?: THREE.BufferGeometry;
}
const cache = new Map<string, PieceGeo>();
const crackCache = new Map<string, THREE.BufferGeometry>();
/** geometria da peça; barreiras: `shape` = forma; portão: só o batente */
export function pieceGeo(kind: PK, shape = 0): PieceGeo {
  const key = kind + ':' + shape;
  let g = cache.get(key);
  if (g) return g;
  switch (kind) {
    case 'fence':
    case 'rfence':
    case 'wall':
      g = { geo: barrier(kind, shape as Shape) };
      break;
    case 'gate':
      g = { geo: gateFrame() };
      break;
    case 'tower':
      g = tower();
      break;
    case 'spikes':
      g = { geo: spikes() };
      break;
    case 'torch':
      g = torch();
      break;
    case 'campfire':
      g = campfire();
      break;
    case 'chest':
      g = { geo: chest() };
      break;
    case 'bed':
      g = { geo: bed() };
      break;
    default:
      g = { geo: bench() };
  }
  cache.set(key, g);
  return g;
}
export function crackGeo(kind: PK, shape: number, lv: number): THREE.BufferGeometry {
  const key = kind + ':' + shape + ':' + lv;
  let g = crackCache.get(key);
  if (!g) crackCache.set(key, (g = cracks(kind, shape as Shape, lv)));
  return g;
}
/** as geometrias ficam em cache entre partidas (pequenas); só a cena é descartada */
export function isCached(g: THREE.BufferGeometry): boolean {
  for (const v of cache.values()) if (v.geo === g || v.glow === g) return true;
  for (const v of crackCache.values()) if (v === g) return true;
  return g === leafGeo;
}
let leafGeo: THREE.BufferGeometry | null = null;
export function gateLeaf(): THREE.BufferGeometry {
  return (leafGeo ??= gateLeafGeo());
}
