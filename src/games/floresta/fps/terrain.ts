/* ============================================================
 *  LENHADORES 3D — terreno: morros suaves (função analítica), malha
 *  visual com cores por bioma e heightfield do cannon-es só no corredor.
 * ============================================================ */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BIOMES, BASE_END, WORLD_Z, gateX } from '../data';
import { NL, TL, lerpSplat } from '../../../3d/nature/textures';

export const WORLD_X1 = gateX(BIOMES.length) + 30;
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** altura do chão em (x,z): base plana, morros ao longo do caminho, barrancos nas bordas */
export function groundH(x: number, z: number): number {
  const az = Math.abs(z);
  const flat = smooth(BASE_END + 2, BASE_END + 18, x);
  const hills = 2.4 * Math.sin(x * 0.052 + 0.6) + 1.25 * Math.sin(x * 0.131 + z * 0.19) + 0.45 * Math.sin(z * 0.5 + x * 0.04);
  const bank = az > 6.6 ? (az - 6.6) * (az - 6.6) * 0.16 : 0;
  const far = az > 14 ? Math.min(14, (az - 14) * 0.35) * (0.6 + 0.4 * Math.sin(x * 0.07 + z * 0.11)) : 0;
  // degrau suave na entrada da base (rampa)
  return flat * (hills + 2.4) + bank + far;
}

/** inclinação aproximada (para empurrar coisas morro abaixo) */
export function slopeX(x: number, z: number): number {
  return (groundH(x + 0.5, z) - groundH(x - 0.5, z)) / 1;
}

const _cA = new THREE.Color();
const _cB = new THREE.Color();
const _cP = new THREE.Color();
const SEG = (() => {
  const st = [-40];
  for (let b = 0; b < BIOMES.length; b++) st.push(gateX(b));
  st.push(WORLD_X1);
  return st;
})();
/** pedaço (0 = base, k = bioma k-1) que contém x */
function segOf(x: number): number {
  for (let k = SEG.length - 2; k >= 0; k--) if (x >= SEG[k]) return k;
  return 0;
}

/**
 * Cor do chão em (x,z) (pedaço k) e quanto cabe de grama de lâminas (0 no caminho e na serraria).
 */
export function groundColorAt(x: number, z: number, c: THREE.Color, k = segOf(x)): number {
  const B = BIOMES[Math.max(0, k - 1)];
  _cA.set(B.grass === '#ffffff' ? '#eef3ff' : B.grass);
  _cB.set(B.mid);
  _cP.set(k === 0 ? '#d8b880' : B.night ? '#6a5a8a' : B.id === 'cristal' ? '#c8d8f0' : B.id === 'nuvens' ? '#f4e8d8' : '#d8b880');
  const az = Math.abs(z);
  const n = Math.sin(x * 1.7 + z * 2.3) * 0.5 + Math.sin(x * 0.37 - z * 0.9) * 0.5;
  c.copy(_cA);
  if (az > 7) c.lerp(_cB, Math.min(0.8, (az - 7) / 20));
  // manchas suaves (sem listras)
  c.multiplyScalar(0.93 + n * 0.05);
  const pathW = k === 0 ? 2.8 : 1.5;
  const edge = pathW + Math.sin(x * 0.3) * 0.3;
  if (az < edge) c.lerp(_cP, 0.85);
  // grama: fora do caminho (com folga), fora da base/serraria e não nos morros distantes
  let g = Math.min(1, Math.max(0, (az - edge - 0.35) / 0.8));
  if (x < BASE_END + 6) g *= Math.max(0, (x - BASE_END) / 6);
  if (B.id === 'nuvens') g *= 0.5;
  return g;
}

/** malha do chão: um pedaço por bioma (frustum culling por pedaço), normais suaves */
/** camadas de textura por bioma do Lenhadores 3D: cobertura e caminho */
const COVER: Record<string, number> = { bosque: TL.grass, pinheiral: TL.forestFloor, tropical: TL.grass, cerejeiras: TL.grass, cogumelos: TL.forestFloor, cristal: TL.snow, nuvens: TL.snow };
const PATH: Record<string, number> = { bosque: TL.dirt, pinheiral: TL.dirt, tropical: TL.redDirt, cerejeiras: TL.dirt, cogumelos: TL.mud, cristal: TL.gravel, nuvens: TL.sand };
const _w = new Float32Array(NL);
/** pesos das texturas do chão em (x,z) (pedaço k) */
export function groundSplatAt(x: number, z: number, w: Float32Array, k = segOf(x)): void {
  const B = BIOMES[Math.max(0, k - 1)];
  w.fill(0);
  const az = Math.abs(z);
  w[COVER[B.id] ?? TL.grass] = 1;
  // pinheiral: chão de folhas com manchas de grama
  if (B.id === 'pinheiral') lerpSplat(w, TL.grass, 0.5 + 0.5 * Math.sin(x * 0.21 + z * 0.33));
  if (az > 14) lerpSplat(w, TL.stone, Math.min(0.55, (az - 14) / 22) * (0.5 + 0.5 * Math.sin(x * 0.11 + z * 0.07)));
  const pathW = k === 0 ? 2.8 : 1.5;
  const edge = pathW + Math.sin(x * 0.3) * 0.3;
  const p = az < edge ? 1 : Math.max(0, 1 - (az - edge) / 0.7);
  lerpSplat(w, k === 0 ? TL.sand : PATH[B.id] ?? TL.dirt, p * 0.95);
}

export function buildGroundMeshes(scene: THREE.Scene, mat: THREE.Material): THREE.Mesh[] {
  const zs = [-80, -58, -42, -30, -22, -16, -12, -9.5, -8, -6.8, -5.4, -4, -2.7, -1.4, -0.5, 0.5, 1.4, 2.7, 4, 5.4, 6.8, 8, 9.5, 12, 16, 22, 30, 42, 58, 80];
  const out: THREE.Mesh[] = [];
  const c = new THREE.Color();
  const starts = SEG;
  for (let k = 0; k < starts.length - 1; k++) {
    const x0 = starts[k];
    const x1 = starts[k + 1];
    const nx = Math.max(2, Math.round((x1 - x0) / 2.2));
    const pos: number[] = [];
    const col: number[] = [];
    const spl: number[] = [];
    const vert = (x: number, z: number) => {
      const y = groundH(x, z);
      pos.push(x, y, z);
      groundColorAt(x, z, c, k);
      col.push(c.r, c.g, c.b);
      groundSplatAt(x, z, _w, k);
      let sum = 0;
      for (let i = 0; i < NL; i++) sum += _w[i];
      for (let i = 0; i < 12; i++) spl.push(i < NL ? Math.round((_w[i] / (sum || 1)) * 255) : 0);
    };
    const tri = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number) => {
      vert(ax, az);
      vert(bx, bz);
      vert(cx, cz);
    };
    for (let i = 0; i < nx; i++) {
      const xa = x0 + ((x1 - x0) * i) / nx;
      const xb = x0 + ((x1 - x0) * (i + 1)) / nx;
      for (let j = 0; j < zs.length - 1; j++) {
        const za = zs[j];
        const zb = zs[j + 1];
        tri(xa, za, xa, zb, xb, za);
        tri(xb, za, xa, zb, xb, zb);
      }
    }
    const g0 = new THREE.BufferGeometry();
    g0.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g0.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    // pesos das texturas (3 × vec4 Uint8)
    const n = pos.length / 3;
    for (let a = 0; a < 3; a++) {
      const arr = new Uint8Array(n * 4);
      for (let v = 0; v < n; v++) for (let i = 0; i < 4; i++) arr[v * 4 + i] = spl[v * 12 + a * 4 + i];
      g0.setAttribute('aSplat' + a, new THREE.BufferAttribute(arr, 4, true));
    }
    // vértices iguais viram um só: normais suaves (morros sem facetas)
    const g = mergeVertices(g0, 1e-3);
    g0.dispose();
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    scene.add(m);
    out.push(m);
  }
  return out;
}

/** heightfield físico do corredor (|z| ≤ 13) */
export function buildGroundBody(mat: CANNON.Material): CANNON.Body {
  const es = 1;
  const x0 = -12;
  const zMax = 13;
  const nx = Math.ceil((WORLD_X1 - x0) / es) + 1;
  const nz = Math.ceil((zMax * 2) / es) + 1;
  const data: number[][] = [];
  for (let i = 0; i < nx; i++) {
    const row: number[] = [];
    for (let j = 0; j < nz; j++) row.push(groundH(x0 + i * es, zMax - j * es));
    data.push(row);
  }
  const shape = new CANNON.Heightfield(data, { elementSize: es });
  const body = new CANNON.Body({ mass: 0, material: mat });
  body.addShape(shape);
  // o heightfield fica no plano XY local com altura em Z: gira para ficar deitado
  body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  body.position.set(x0, 0, zMax);
  return body;
}

export { WORLD_Z };
