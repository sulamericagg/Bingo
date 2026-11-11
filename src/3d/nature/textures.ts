/* ============================================================
 *  NATUREZA — biblioteca de texturas de chão procedurais
 *  (geradas UMA vez em canvas, em cache, repetem sem emenda, mipmap).
 *
 *  - natureTexture('grass')         → THREE.Texture comum (RepeatWrapping),
 *                                      para qualquer jogo usar direto num map
 *  - natureTextureArray()           → todas as camadas numa DataArrayTexture
 *                                      (uma textura, uma amostra por camada)
 *  - terrainMaterial({ tier })      → Lambert que mistura as camadas por
 *                                      PESOS POR VÉRTICE (aSplat0..2), projeção
 *                                      no mundo (triplanar barata), só as 2
 *                                      camadas mais fortes por pixel (Mínimo: 1)
 *  - splatAttributes(geo) / setSplat → ajudam a montar os pesos
 *
 *  A cor por vértice continua mandando no tom (bioma); a textura entra como
 *  "estrutura" relativa à própria média + uma fração da cor própria (OWN).
 *  Documentação: docs/NATURE.md
 * ============================================================ */
import * as THREE from 'three';
import { hash2 } from './noise';
import { groundDetailTexture } from './ground';

/** camadas (a ordem é o índice na DataArrayTexture e nos pesos) */
export const TERRAIN_LAYERS = ['grass', 'dryGrass', 'forestFloor', 'snow', 'dirt', 'redDirt', 'mud', 'gravel', 'stone', 'sand'] as const;
export type TerrainLayer = (typeof TERRAIN_LAYERS)[number];
export const NL = TERRAIN_LAYERS.length;
/** índice da camada pelo nome */
export const TL: Record<TerrainLayer, number> = Object.fromEntries(TERRAIN_LAYERS.map((n, i) => [n, i])) as Record<TerrainLayer, number>;

/** quanto da cor própria da textura aparece (o resto é a cor do vértice com a estrutura da textura) */
const OWN: Record<TerrainLayer, number> = { grass: 0.12, dryGrass: 0.35, forestFloor: 0.55, snow: 0.45, dirt: 0.3, redDirt: 0.55, mud: 0.4, gravel: 0.55, stone: 0.3, sand: 0.4 };
/** repetições por metro */
const SCALE: Record<TerrainLayer, number> = { grass: 0.42, dryGrass: 0.4, forestFloor: 0.3, snow: 0.25, dirt: 0.35, redDirt: 0.35, mud: 0.3, gravel: 0.45, stone: 0.18, sand: 0.3 };

const S = 256;

/* ------------------------------ geração ------------------------------ */

/** ruído de valor periódico (período `per` células em S px) */
function pnoise(x: number, y: number, per: number, seed: number): number {
  const px = (x / S) * per;
  const py = (y / S) * per;
  const xi = Math.floor(px);
  const yi = Math.floor(py);
  const fx = px - xi;
  const fy = py - yi;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const h = (i: number, j: number) => hash2(((i % per) + per) % per, ((j % per) + per) % per, seed);
  const a = h(xi, yi);
  const b = h(xi + 1, yi);
  const c = h(xi, yi + 1);
  const d = h(xi + 1, yi + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbmP(x: number, y: number, seed: number): number {
  return pnoise(x, y, 4, seed) * 0.5 + pnoise(x, y, 8, seed + 1) * 0.3 + pnoise(x, y, 32, seed + 2) * 0.2;
}

type RGB = [number, number, number];
const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** fundo: cor base variando entre duas cores por ruído + grão fino */
function base(x: CanvasRenderingContext2D, a: string, b: string, seed: number, grain = 18): void {
  const A = hex(a);
  const B = hex(b);
  const img = x.createImageData(S, S);
  const d = img.data;
  for (let j = 0; j < S; j++)
    for (let i = 0; i < S; i++) {
      const t = fbmP(i, j, seed);
      const g = (hash2(i, j, seed + 9) - 0.5) * grain;
      const o = (j * S + i) * 4;
      d[o] = A[0] + (B[0] - A[0]) * t + g;
      d[o + 1] = A[1] + (B[1] - A[1]) * t + g;
      d[o + 2] = A[2] + (B[2] - A[2]) * t + g;
      d[o + 3] = 255;
    }
  x.putImageData(img, 0, 0);
}

/** desenha `f` nas 9 posições (repete sem emenda) */
function wrap(_x: CanvasRenderingContext2D, px: number, py: number, r: number, f: (ox: number, oy: number) => void): void {
  for (let oy = -1; oy <= 1; oy++)
    for (let ox = -1; ox <= 1; ox++) {
      const cx = px + ox * S;
      const cy = py + oy * S;
      if (cx < -r || cx > S + r || cy < -r || cy > S + r) continue;
      f(cx, cy);
    }
}

function rnd(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** tracinhos de capim vistos de cima/de lado */
function blades(x: CanvasRenderingContext2D, n: number, cols: string[], seed: number, len: [number, number], w = 1.6): void {
  const R = rnd(seed);
  x.lineCap = 'round';
  for (let k = 0; k < n; k++) {
    const px = R() * S;
    const py = R() * S;
    const L = len[0] + R() * (len[1] - len[0]);
    const a = -Math.PI / 2 + (R() - 0.5) * 1.3;
    const bend = (R() - 0.5) * L * 0.6;
    x.strokeStyle = cols[Math.floor(R() * cols.length)];
    x.lineWidth = w * (0.7 + R() * 0.6);
    wrap(x, px, py, L + 4, (cx, cy) => {
      x.beginPath();
      x.moveTo(cx, cy);
      x.quadraticCurveTo(cx + Math.cos(a) * L * 0.5 + bend, cy + Math.sin(a) * L * 0.5, cx + Math.cos(a) * L + bend * 0.6, cy + Math.sin(a) * L);
      x.stroke();
    });
  }
}

/** pedrinhas com luz em cima */
function pebbles(x: CanvasRenderingContext2D, n: number, cols: string[], seed: number, r: [number, number]): void {
  const R = rnd(seed);
  for (let k = 0; k < n; k++) {
    const px = R() * S;
    const py = R() * S;
    const rr = r[0] + R() * (r[1] - r[0]);
    const c = cols[Math.floor(R() * cols.length)];
    const rot = R() * Math.PI;
    const sq = 0.6 + R() * 0.35;
    wrap(x, px, py, rr + 2, (cx, cy) => {
      x.fillStyle = 'rgba(0,0,0,0.28)';
      x.beginPath();
      x.ellipse(cx + rr * 0.18, cy + rr * 0.25, rr, rr * sq, rot, 0, Math.PI * 2);
      x.fill();
      const g = x.createRadialGradient(cx - rr * 0.35, cy - rr * 0.4, rr * 0.1, cx, cy, rr * 1.05);
      g.addColorStop(0, 'rgba(255,255,255,0.35)');
      g.addColorStop(0.35, c);
      g.addColorStop(1, c);
      x.fillStyle = g;
      x.beginPath();
      x.ellipse(cx, cy, rr, rr * sq, rot, 0, Math.PI * 2);
      x.fill();
    });
  }
}

/** folhas secas caídas */
function leaves(x: CanvasRenderingContext2D, n: number, cols: string[], seed: number): void {
  const R = rnd(seed);
  for (let k = 0; k < n; k++) {
    const px = R() * S;
    const py = R() * S;
    const L = 5 + R() * 6;
    const W = L * (0.45 + R() * 0.2);
    const a = R() * Math.PI * 2;
    const c = cols[Math.floor(R() * cols.length)];
    wrap(x, px, py, L + 2, (cx, cy) => {
      x.save();
      x.translate(cx, cy);
      x.rotate(a);
      x.fillStyle = 'rgba(0,0,0,0.22)';
      x.beginPath();
      x.ellipse(1, 1.5, L, W, 0, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = c;
      x.beginPath();
      x.moveTo(-L, 0);
      x.quadraticCurveTo(0, -W * 1.4, L, 0);
      x.quadraticCurveTo(0, W * 1.4, -L, 0);
      x.fill();
      x.strokeStyle = 'rgba(60,30,10,0.35)';
      x.lineWidth = 0.8;
      x.beginPath();
      x.moveTo(-L * 0.9, 0);
      x.lineTo(L * 0.9, 0);
      x.stroke();
      x.restore();
    });
  }
}

/** rachaduras (pedra, lama seca) */
function cracks(x: CanvasRenderingContext2D, n: number, col: string, seed: number, w = 1.2): void {
  const R = rnd(seed);
  x.strokeStyle = col;
  x.lineWidth = w;
  x.lineCap = 'round';
  for (let k = 0; k < n; k++) {
    let px = R() * S;
    let py = R() * S;
    let a = R() * Math.PI * 2;
    const steps = 4 + Math.floor(R() * 6);
    for (let s = 0; s < steps; s++) {
      const L = 6 + R() * 12;
      const nx = px + Math.cos(a) * L;
      const ny = py + Math.sin(a) * L;
      const x0 = px;
      const y0 = py;
      wrap(x, x0, y0, 30, (cx, cy) => {
        x.beginPath();
        x.moveTo(cx, cy);
        x.lineTo(cx + nx - x0, cy + ny - y0);
        x.stroke();
      });
      px = nx;
      py = ny;
      a += (R() - 0.5) * 1.2;
    }
  }
}

/** pontinhos (grão, brilho da neve, torrões) */
function specks(x: CanvasRenderingContext2D, n: number, cols: string[], seed: number, r: [number, number]): void {
  const R = rnd(seed);
  for (let k = 0; k < n; k++) {
    const px = R() * S;
    const py = R() * S;
    const rr = r[0] + R() * (r[1] - r[0]);
    x.fillStyle = cols[Math.floor(R() * cols.length)];
    wrap(x, px, py, rr, (cx, cy) => {
      x.beginPath();
      x.arc(cx, cy, rr, 0, Math.PI * 2);
      x.fill();
    });
  }
}

const RECIPES: Record<TerrainLayer, (x: CanvasRenderingContext2D) => void> = {
  grass: (x) => {
    base(x, '#3f7a2a', '#68a83e', 11, 14);
    blades(x, 2600, ['#2f6a22', '#4a8a30', '#6cb042', '#86c450', '#a4d062', '#3d7a28'], 12, [5, 12], 1.5);
  },
  dryGrass: (x) => {
    base(x, '#9a8040', '#c8ad62', 21, 14);
    blades(x, 2200, ['#8a6e34', '#b8984c', '#d8c070', '#e8d48a', '#a88a44', '#7a8a3a'], 22, [5, 13], 1.4);
  },
  forestFloor: (x) => {
    base(x, '#3e3020', '#5a4a2e', 31, 16);
    specks(x, 300, ['rgba(30,20,10,0.5)', 'rgba(90,110,50,0.5)'], 32, [1, 2.5]);
    leaves(x, 520, ['#b8642a', '#d8902e', '#8a4a22', '#a87a34', '#6a7a2e', '#c8a040', '#7a3a1e'], 33);
    cracks(x, 22, 'rgba(40,26,14,0.8)', 34, 1.4);
  },
  snow: (x) => {
    base(x, '#d8e2f0', '#f6f9ff', 41, 8);
    specks(x, 500, ['rgba(255,255,255,0.9)', 'rgba(190,205,230,0.6)'], 42, [0.6, 1.6]);
    specks(x, 90, ['rgba(170,190,220,0.35)'], 43, [3, 7]);
  },
  dirt: (x) => {
    base(x, '#5e4228', '#8a6640', 51, 22);
    specks(x, 700, ['rgba(40,26,14,0.55)', 'rgba(160,126,86,0.55)'], 52, [0.7, 2]);
    pebbles(x, 60, ['#8a7a68', '#a08a70', '#6a5a4a'], 53, [1.5, 3.5]);
  },
  redDirt: (x) => {
    base(x, '#8a3a1e', '#b85a2c', 61, 22);
    specks(x, 700, ['rgba(80,26,10,0.5)', 'rgba(220,130,80,0.5)'], 62, [0.7, 2]);
    pebbles(x, 40, ['#a0583a', '#7a3a24', '#c07a4a'], 63, [1.5, 3]);
    cracks(x, 14, 'rgba(70,24,10,0.6)', 64, 1);
  },
  mud: (x) => {
    base(x, '#3a2a1a', '#5a4428', 71, 12);
    specks(x, 120, ['rgba(20,14,8,0.5)'], 72, [3, 9]);
    // poças com brilho
    specks(x, 60, ['rgba(150,140,120,0.25)'], 73, [2, 6]);
    cracks(x, 10, 'rgba(25,16,8,0.6)', 74, 2);
  },
  gravel: (x) => {
    base(x, '#6a6258', '#8a8274', 81, 18);
    pebbles(x, 900, ['#9a948a', '#7a746a', '#aaa49a', '#8a7a6a', '#b0a898', '#6a6660'], 82, [2, 5]);
  },
  stone: (x) => {
    base(x, '#6e6e74', '#9a9aa2', 91, 26);
    cracks(x, 40, 'rgba(40,40,46,0.7)', 92, 1.6);
    specks(x, 400, ['rgba(255,255,255,0.18)', 'rgba(30,30,36,0.3)'], 93, [0.6, 1.8]);
    specks(x, 30, ['rgba(90,120,60,0.35)'], 94, [3, 8]);
  },
  sand: (x) => {
    base(x, '#c8b080', '#e4d2a0', 101, 20);
    // ondinhas do vento
    x.strokeStyle = 'rgba(150,120,70,0.25)';
    x.lineWidth = 1.4;
    for (let k = 0; k < 14; k++) {
      const y0 = (k / 14) * S;
      x.beginPath();
      for (let i = 0; i <= S; i += 8) {
        const yy = y0 + Math.sin((i / S) * Math.PI * 4 + k) * 4;
        if (i === 0) x.moveTo(i, yy);
        else x.lineTo(i, yy);
      }
      x.stroke();
    }
    specks(x, 900, ['rgba(120,96,60,0.35)', 'rgba(255,250,230,0.5)'], 102, [0.5, 1.3]);
  },
};

const CANV = new Map<TerrainLayer, HTMLCanvasElement>();
/** canvas 256² da camada (gerado uma vez) */
export function natureTexCanvas(name: TerrainLayer): HTMLCanvasElement {
  let c = CANV.get(name);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  RECIPES[name](x);
  CANV.set(name, c);
  return c;
}

const TEX = new Map<TerrainLayer, THREE.CanvasTexture>();
/** textura comum (RepeatWrapping, mipmap, sRGB) — para qualquer jogo usar num `map` */
export function natureTexture(name: TerrainLayer): THREE.CanvasTexture {
  let t = TEX.get(name);
  if (t) return t;
  t = new THREE.CanvasTexture(natureTexCanvas(name));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  TEX.set(name, t);
  return t;
}

let ARR: THREE.DataArrayTexture | null = null;
const MEANS: THREE.Vector3[] = [];
const toLin = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
/** todas as camadas numa DataArrayTexture (sRGB, mipmap) + a cor média (linear) de cada uma */
export function natureTextureArray(): THREE.DataArrayTexture {
  if (ARR) return ARR;
  const data = new Uint8Array(S * S * 4 * NL);
  for (let l = 0; l < NL; l++) {
    const c = natureTexCanvas(TERRAIN_LAYERS[l]);
    const px = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, S, S).data;
    data.set(px, l * S * S * 4);
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < px.length; i += 16) {
      r += toLin(px[i]);
      g += toLin(px[i + 1]);
      b += toLin(px[i + 2]);
    }
    const n = px.length / 16;
    MEANS[l] = new THREE.Vector3(r / n, g / n, b / n);
  }
  const t = new THREE.DataArrayTexture(data, S, S, NL);
  t.format = THREE.RGBAFormat;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  ARR = t;
  return t;
}
export function natureTexMeans(): THREE.Vector3[] {
  natureTextureArray();
  return MEANS;
}

/* ------------------------------ pesos por vértice ------------------------------ */

/** cria (ou devolve) os 3 atributos de pesos (Uint8 normalizado) para `count` vértices */
export function splatAttributes(geo: THREE.BufferGeometry, count: number): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let k = 0; k < 3; k++) {
    const name = 'aSplat' + k;
    let a = geo.getAttribute(name) as THREE.BufferAttribute | undefined;
    if (!a || a.count !== count) {
      a = new THREE.BufferAttribute(new Uint8Array(count * 4), 4, true);
      geo.setAttribute(name, a);
    }
    out.push(a.array as Uint8Array);
  }
  return out;
}
/** grava os pesos w[0..NL) (somando ~1) no vértice v */
export function setSplat(arrs: Uint8Array[], v: number, w: ArrayLike<number>): void {
  let s = 0;
  for (let i = 0; i < NL; i++) s += w[i] > 0 ? w[i] : 0;
  const k = s > 0 ? 255 / s : 0;
  for (let i = 0; i < 12; i++) arrs[i >> 2][v * 4 + (i & 3)] = i < NL && w[i] > 0 ? Math.round(w[i] * k) : 0;
}
/** copia os pesos do vértice a para b (saias, emendas) */
export function copySplat(arrs: Uint8Array[], a: number, b: number): void {
  for (let k = 0; k < 3; k++) for (let i = 0; i < 4; i++) arrs[k][b * 4 + i] = arrs[k][a * 4 + i];
}
export function markSplat(geo: THREE.BufferGeometry): void {
  for (let k = 0; k < 3; k++) {
    const a = geo.getAttribute('aSplat' + k) as THREE.BufferAttribute | undefined;
    if (a) a.needsUpdate = true;
  }
}

/** mistura em w: w = w·(1−s) + s·(alvo) — alvo = uma camada */
export function lerpSplat(w: Float32Array, layer: number, s: number): void {
  if (s <= 0) return;
  if (s > 1) s = 1;
  for (let i = 0; i < NL; i++) w[i] *= 1 - s;
  w[layer] += s;
}

/* ------------------------------ material ------------------------------ */

export interface TerrainOpts {
  /** nível de qualidade: 0 = só a camada mais forte, sem manchas grandes */
  tier: number;
  /**
   * sem atributos de peso (malhas de cavernas/volumes): topo = `topLayer`, paredes = pedra/terra pela normal
   */
  noSplat?: boolean;
  topLayer?: TerrainLayer;
}

/**
 * Material de terreno: cor por vértice (tom do bioma) × textura das 2 camadas mais fortes do pixel
 * (pesos por vértice aSplat0..2), projeção no mundo pela normal dominante.
 */
export function terrainMaterial(o: TerrainOpts): THREE.MeshLambertMaterial {
  const tex = natureTextureArray();
  const means = natureTexMeans();
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  const one = o.tier <= 0;
  const macro = o.tier >= 2;
  const own = TERRAIN_LAYERS.map((n) => OWN[n]);
  const scl = TERRAIN_LAYERS.map((n) => SCALE[n]);
  const top = TL[o.topLayer ?? 'grass'];
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTerr = { value: tex };
    sh.uniforms.uMean = { value: means };
    sh.uniforms.uOwn = { value: own };
    sh.uniforms.uScl = { value: scl };
    sh.uniforms.uGTex = { value: groundDetailTexture() };
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
${o.noSplat ? '' : 'attribute vec4 aSplat0; attribute vec4 aSplat1; attribute vec4 aSplat2;'}
varying vec4 vS0; varying vec4 vS1; varying vec4 vS2;
varying vec3 vTW; varying vec3 vTN;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vTW = (modelMatrix * vec4(transformed, 1.0)).xyz;
vTN = normal;
${
  o.noSplat
    ? `{
  float up = smoothstep(0.5, 0.8, normal.y);
  float w[12];
  for (int i = 0; i < 12; i++) w[i] = 0.0;
  w[${top}] = up;
  w[${TL.dirt}] = (1.0 - up) * 0.35;
  w[${TL.stone}] = (1.0 - up) * 0.65;
  vS0 = vec4(w[0], w[1], w[2], w[3]); vS1 = vec4(w[4], w[5], w[6], w[7]); vS2 = vec4(w[8], w[9], w[10], w[11]);
}`
    : 'vS0 = aSplat0; vS1 = aSplat1; vS2 = aSplat2;'
}`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
precision highp sampler2DArray;
uniform sampler2DArray uTerr;
uniform sampler2D uGTex;
uniform vec3 uMean[${NL}];
uniform float uOwn[${NL}];
uniform float uScl[${NL}];
varying vec4 vS0; varying vec4 vS1; varying vec4 vS2;
varying vec3 vTW; varying vec3 vTN;
vec3 terrLayer(int i, vec2 uv, vec3 base) {
  vec3 t = texture(uTerr, vec3(uv * uScl[i], float(i))).rgb;
  return mix(base * t / max(uMean[i], vec3(0.02)), t, uOwn[i]);
}`,
      )
      .replace(
        '#include <color_fragment>',
        `{
  float w[${NL}];
  w[0] = vS0.x; w[1] = vS0.y; w[2] = vS0.z; w[3] = vS0.w;
  w[4] = vS1.x; w[5] = vS1.y; w[6] = vS1.z; w[7] = vS1.w;
  w[8] = vS2.x; w[9] = vS2.y;
  int i1 = 0; int i2 = 0; float b1 = -1.0; float b2 = -1.0;
  for (int i = 0; i < ${NL}; i++) {
    float v = w[i];
    if (v > b1) { b2 = b1; i2 = i1; b1 = v; i1 = i; }
    else if (v > b2) { b2 = v; i2 = i; }
  }
  vec3 an = abs(vTN);
  vec2 uv = an.y > 0.6 ? vTW.xz : (an.x > an.z ? vTW.zy : vTW.xy);
  vec3 col = terrLayer(i1, uv, vColor);
  ${one ? '' : 'float f = b2 / max(b1 + b2, 1e-4); if (f > 0.02) col = mix(col, terrLayer(i2, uv, vColor), f);'}
  ${macro ? 'col *= 0.84 + texture2D(uGTex, uv * 0.045 + vec2(0.37, 0.71)).r * 0.32;' : ''}
  diffuseColor.rgb *= col;
}`,
      );
  };
  m.customProgramCacheKey = () => `terrain3_${one ? 1 : 0}_${macro ? 1 : 0}_${o.noSplat ? 'n' + top : 's'}`;
  return m;
}
