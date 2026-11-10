/* ============================================================
 *  Materiais "de verdade" gerados em canvas (zero bytes no APK):
 *  madeira com veios, pedra/granito, azulejo com rejunte, metal escovado,
 *  casca de árvore — cada um com mapa de cor (neutro, tingido pela cor do
 *  vértice) + mapa de normais derivado da altura. Mais o mapa de ambiente
 *  procedural (RoomEnvironment → PMREM) para reflexos no nível Alto/Médio.
 * ============================================================ */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

type Ctx = CanvasRenderingContext2D;
function cv(n: number, m = n): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = n;
  c.height = m;
  return [c, c.getContext('2d', { willReadFrequently: true })!];
}
/** ruído de valor 2D com repetição (tileable) */
function noise(seed: number, per: number): (x: number, y: number) => number {
  const g = new Float32Array(per * per);
  let s = seed * 9301 + 49297;
  for (let i = 0; i < g.length; i++) {
    s = (s * 16807) % 2147483647;
    g[i] = s / 2147483647;
  }
  const at = (x: number, y: number) => g[(((y % per) + per) % per) * per + (((x % per) + per) % per)];
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    let fx = x - xi;
    let fy = y - yi;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * fx;
    const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * fx;
    return a + (b - a) * fy;
  };
}
function fbm(n: (x: number, y: number) => number, x: number, y: number, oct = 4): number {
  let v = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    v += n(x * f, y * f) * a;
    a *= 0.5;
    f *= 2;
  }
  return v;
}
/** gera cor + normal a partir de uma função altura/cor por pixel */
function bake(size: number, fn: (u: number, v: number) => [number, number]): { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } {
  const [c1, x1] = cv(size);
  const [c2, x2] = cv(size);
  const col = x1.createImageData(size, size);
  const nor = x2.createImageData(size, size);
  const hgt = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const [l, h] = fn(x / size, y / size);
      const i = y * size + x;
      hgt[i] = h;
      const v = Math.max(0, Math.min(255, l * 255));
      col.data[i * 4] = col.data[i * 4 + 1] = col.data[i * 4 + 2] = v;
      col.data[i * 4 + 3] = 255;
    }
  const H = (x: number, y: number) => hgt[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * 2.2;
      const dy = (H(x, y + 1) - H(x, y - 1)) * 2.2;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      nor.data[i] = ((-dx / l) * 0.5 + 0.5) * 255;
      nor.data[i + 1] = ((dy / l) * 0.5 + 0.5) * 255;
      nor.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      nor.data[i + 3] = 255;
    }
  x1.putImageData(col, 0, 0);
  x2.putImageData(nor, 0, 0);
  const map = new THREE.CanvasTexture(c1);
  map.colorSpace = THREE.SRGBColorSpace;
  const normal = new THREE.CanvasTexture(c2);
  for (const t of [map, normal]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
  }
  return { map, normal };
}

export type PbrSet = { map: THREE.CanvasTexture; normal: THREE.CanvasTexture };
const cache = new Map<string, PbrSet>();
function cached(k: string, f: () => PbrSet): PbrSet {
  let v = cache.get(k);
  if (!v || (v.map.image as HTMLCanvasElement).width === 0) {
    v = f();
    cache.set(k, v);
  }
  return v;
}

/** madeira: veios ao longo de U, nós ocasionais, tábuas */
export function woodTex(size = 256, planks = 4): PbrSet {
  return cached('wood' + size + planks, () => {
    const n = noise(3, 32);
    return bake(size, (u, v) => {
      const pl = Math.floor(v * planks);
      const pv = v * planks - pl;
      const off = pl * 0.37;
      const w = fbm(n, (u + off) * 3, v * 40, 3);
      const ring = Math.sin((v * planks * 7 + w * 6 + Math.sin((u + off) * 12) * 0.4) * Math.PI * 2);
      let l = 0.82 + ring * 0.07 + (fbm(n, u * 60, v * 4, 2) - 0.5) * 0.12 + ((pl * 0.13) % 0.1) - 0.05;
      let h = ring * 0.15;
      if (pv < 0.03 || pv > 0.97) (l *= 0.62), (h -= 0.8);
      return [l, h];
    });
  });
}
/** pedra polida/granito (bancadas) */
export function stoneTex(size = 256): PbrSet {
  return cached('stone' + size, () => {
    const n = noise(11, 64);
    return bake(size, (u, v) => {
      const b = fbm(n, u * 16, v * 16, 4);
      const sp = n(u * 64 * 1.7, v * 64 * 1.7);
      let l = 0.86 + (b - 0.5) * 0.18;
      if (sp > 0.84) l -= 0.2;
      else if (sp < 0.12) l += 0.1;
      return [l, b * 0.15];
    });
  });
}
/** azulejo com rejunte (nx × ny peças por textura) */
export function tileTex(size = 256, nx = 4, ny = 4, grout = 0.035): PbrSet {
  return cached('tile' + size + nx + ny + grout, () => {
    const n = noise(5, 32);
    return bake(size, (u, v) => {
      const tx = u * nx;
      const ty = v * ny + (ny > nx ? (Math.floor(tx) % 2) * 0.5 : 0);
      const fx = tx - Math.floor(tx);
      const fy = ty - Math.floor(ty);
      const e = Math.min(fx, 1 - fx, fy * (nx / ny), (1 - fy) * (nx / ny));
      const id = Math.floor(tx) * 7 + Math.floor(ty) * 13;
      if (e < grout) return [0.72, -0.6];
      const bevel = Math.min(1, (e - grout) / 0.05);
      const l = 0.97 - ((id * 37) % 10) * 0.006 + (n(u * 20, v * 20) - 0.5) * 0.03;
      return [l, bevel * 0.5 + n(u * 30, v * 30) * 0.03];
    });
  });
}
/** metal escovado (inox) */
export function brushedTex(size = 128): PbrSet {
  return cached('brushed' + size, () => {
    const n = noise(7, 128);
    return bake(size, (u, v) => {
      const s = n(u * 2, v * 128) * 0.6 + n(u * 4, v * 64) * 0.4;
      return [0.9 + (s - 0.5) * 0.14, s * 0.06];
    });
  });
}
/** casca de árvore: sulcos verticais */
export function barkTex(size = 256): PbrSet {
  return cached('bark' + size, () => {
    const n = noise(13, 32);
    return bake(size, (u, v) => {
      const w = fbm(n, u * 6, v * 2, 4);
      const r = Math.abs(Math.sin((u * 9 + w * 1.6) * Math.PI));
      const ridge = Math.pow(r, 0.6);
      const l = 0.55 + ridge * 0.42 + (n(u * 40, v * 10) - 0.5) * 0.1;
      return [l, ridge * 0.9 + w * 0.3];
    });
  });
}
/** tecido (estofados, toalhas) */
export function fabricTex(size = 128): PbrSet {
  return cached('fabric' + size, () => {
    const n = noise(17, 64);
    return bake(size, (u, v) => {
      const a = Math.sin(u * size * Math.PI * 0.5) * Math.sin(v * size * Math.PI * 0.5);
      return [0.9 + a * 0.05 + (n(u * 30, v * 30) - 0.5) * 0.06, a * 0.12];
    });
  });
}

let envRT: THREE.WebGLRenderTarget | null = null;
let envOwner: THREE.WebGLRenderer | null = null;
/** mapa de ambiente procedural (sala com janelas) para reflexos — compartilhado */
export function roomEnv(r: THREE.WebGLRenderer): THREE.Texture {
  if (envRT && envOwner === r) return envRT.texture;
  const pm = new THREE.PMREMGenerator(r);
  const room = new RoomEnvironment();
  envRT = pm.fromScene(room, 0.04);
  envOwner = r;
  room.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    if (m.material) (m.material as THREE.Material).dispose();
  });
  pm.dispose();
  return envRT.texture;
}
export function disposeEnv(): void {
  envRT?.dispose();
  envRT = null;
  envOwner = null;
}
