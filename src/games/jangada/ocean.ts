/* ============================================================
 *  JANGADA BLOOP — oceano sem fim, céu e mundo submarino.
 *  ÁGUA (por tier de qualidade):
 *   - ondas de Gerstner em 2 oitavas (3/5/8 ondas), as mesmas da CPU
 *     para a jangada, barcos e restos boiarem certinho; as ondas curtas
 *     somem com a distância (sem serrilhado);
 *   - 2 camadas de normal map rolando (+1 macro no alto), geradas no
 *     aparelho (sem arquivos);
 *   - Fresnel de Schlick (F0 = 0,02) refletindo o MESMO céu (gradiente,
 *     sol e nuvens), brilho do sol físico (meio-vetor), luar;
 *   - cor por profundidade (analítica: o fundo das ilhas é conhecido):
 *     turquesa no raso → azul fundo; transparência no raso (vê a areia
 *     com cáusticas por baixo); espalhamento (SSS) nas cristas contra o sol;
 *   - espuma nas cristas (Jacobiano), na praia (faixas que vão e voltam),
 *     na beira da jangada e na esteira dos barcos/chefes;
 *   - visto de baixo: janela de Snell, reflexo interno, névoa azul.
 *  CÉU: gradiente com halo do sol (Mie), nuvens procedurais iluminadas
 *  (borda prateada), sol, lua e estrelas; tempestade fecha o céu.
 *  SUBMARINO: raios de luz (god rays) e partículas boiando.
 *  A malha do mar é polar (densa perto da câmera) e segue a câmera.
 * ============================================================ */
import * as THREE from 'three';
import { NIGHT0, NIGHT1 } from './data';

/** dir (rad), comprimento (m), altura (m), "pontuda" (Q) — 2 oitavas */
export const WAVES: [number, number, number, number][] = [
  [0.35, 27, 0.24, 0.42],
  [1.45, 15.5, 0.14, 0.5],
  [-0.75, 9.3, 0.08, 0.55],
  [2.4, 5.7, 0.045, 0.6],
  [0.95, 3.6, 0.026, 0.55],
  [-1.9, 2.5, 0.016, 0.5],
  [2.95, 1.75, 0.0095, 0.45],
  [-0.25, 1.25, 0.006, 0.4],
];
const WK = WAVES.map(([d, L, A, Q]) => {
  const k = (Math.PI * 2) / L;
  return { dx: Math.cos(d), dz: Math.sin(d), k, A, Q, L, w: Math.sqrt(9.8 * k) * 0.85 };
});
/** ondas usadas na CPU (as compridas: as curtas são só detalhe visual) */
const CPU_W = WK.slice(0, 5);
/** altura do mar (aprox. da superfície do shader) em (x, z) do mundo */
export function waveH(x: number, z: number, t: number, amp: number, ox: number, oz: number): number {
  let y = 0;
  const px = x + ox;
  const pz = z + oz;
  for (const v of CPU_W) y += v.A * amp * Math.sin(v.k * (v.dx * px + v.dz * pz) - v.w * t);
  return y;
}

/* ------------------------------ paleta do dia ------------------------------ */
export interface SkyCols {
  zen: THREE.Color;
  hor: THREE.Color;
  sun: THREE.Color;
  sunI: number;
  amb: THREE.Color;
  ambI: number;
  fog: THREE.Color;
  dir: THREE.Vector3;
  moon: THREE.Vector3;
  night: number;
  deep: THREE.Color;
  shallow: THREE.Color;
}
const KEYS: { t: number; zen: string; hor: string; sun: string; sunI: number; amb: string; ambI: number; deep: string; shallow: string }[] = [
  { t: 0.0, zen: '#3e5aa8', hor: '#ffb58e', sun: '#ffb070', sunI: 0.75, amb: '#c8b0d8', ambI: 0.8, deep: '#123a6a', shallow: '#2a8aa8' },
  { t: 0.08, zen: '#2a7ad8', hor: '#c4e6fa', sun: '#fff0d0', sunI: 1.5, amb: '#d8f0ff', ambI: 1.15, deep: '#0b4c84', shallow: '#16b4c4' },
  { t: 0.4, zen: '#1c6ed8', hor: '#cdeafa', sun: '#fff8e8', sunI: 1.7, amb: '#e0f4ff', ambI: 1.25, deep: '#0a4f88', shallow: '#13bccb' },
  { t: 0.66, zen: '#2a64c0', hor: '#ffd8a8', sun: '#ffd8a0', sunI: 1.4, amb: '#f0e0d0', ambI: 1.1, deep: '#0c477f', shallow: '#20a6b8' },
  { t: 0.74, zen: '#4a3e9a', hor: '#ff8a62', sun: '#ff8a50', sunI: 0.95, amb: '#d0a0c0', ambI: 0.85, deep: '#16305e', shallow: '#3a7898' },
  { t: 0.8, zen: '#10163e', hor: '#363a72', sun: '#9ab0ff', sunI: 0.45, amb: '#6a78c8', ambI: 0.62, deep: '#08183c', shallow: '#183e6a' },
  { t: 0.88, zen: '#0a0f30', hor: '#222c62', sun: '#a8c0ff', sunI: 0.5, amb: '#6a7ad0', ambI: 0.6, deep: '#061434', shallow: '#163c68' },
  { t: 0.95, zen: '#18245e', hor: '#665690', sun: '#c0b0ff', sunI: 0.45, amb: '#8a88c8', ambI: 0.65, deep: '#0a1e4a', shallow: '#1c487c' },
  { t: 1.0, zen: '#3e5aa8', hor: '#ffb58e', sun: '#ffb070', sunI: 0.75, amb: '#c8b0d8', ambI: 0.8, deep: '#123a6a', shallow: '#2a8aa8' },
];
const STORM = { zen: new THREE.Color('#465064'), hor: new THREE.Color('#8890a0'), deep: new THREE.Color('#123244'), shallow: new THREE.Color('#2a6070') };
const _a = new THREE.Color();
const _b = new THREE.Color();
export function skyAt(tod: number, storm: number, out?: SkyCols): SkyCols {
  const o: SkyCols = out ?? {
    zen: new THREE.Color(),
    hor: new THREE.Color(),
    sun: new THREE.Color(),
    sunI: 1,
    amb: new THREE.Color(),
    ambI: 1,
    fog: new THREE.Color(),
    dir: new THREE.Vector3(),
    moon: new THREE.Vector3(),
    night: 0,
    deep: new THREE.Color(),
    shallow: new THREE.Color(),
  };
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].t <= tod) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const k = Math.max(0, Math.min(1, (tod - a.t) / Math.max(1e-4, b.t - a.t)));
  const lerp = (x: string, y: string, c: THREE.Color) => c.copy(_a.set(x)).lerp(_b.set(y), k);
  lerp(a.zen, b.zen, o.zen);
  lerp(a.hor, b.hor, o.hor);
  lerp(a.sun, b.sun, o.sun);
  lerp(a.amb, b.amb, o.amb);
  lerp(a.deep, b.deep, o.deep);
  lerp(a.shallow, b.shallow, o.shallow);
  o.sunI = a.sunI + (b.sunI - a.sunI) * k;
  o.ambI = a.ambI + (b.ambI - a.ambI) * k;
  if (storm > 0) {
    const s = storm * 0.85;
    const dark = 1 - Math.max(0, tod - NIGHT0) * 2.5;
    o.zen.lerp(_a.copy(STORM.zen).multiplyScalar(Math.max(0.25, dark)), s);
    o.hor.lerp(_a.copy(STORM.hor).multiplyScalar(Math.max(0.3, dark)), s);
    o.deep.lerp(STORM.deep, s);
    o.shallow.lerp(STORM.shallow, s);
    o.sunI *= 1 - s * 0.65;
  }
  o.fog.copy(o.hor).lerp(o.zen, 0.12);
  const dayLen = NIGHT0 + 0.06;
  const sa = Math.min(1, tod / dayLen) * Math.PI;
  o.dir.set(Math.cos(sa), Math.max(-0.3, Math.sin(sa)) * 0.95 + 0.04, -0.35).normalize();
  const nl = NIGHT1 + 0.04 - (NIGHT0 + 0.02);
  const ma = Math.max(0, Math.min(1, (tod - NIGHT0 - 0.02) / nl)) * Math.PI;
  o.moon.set(Math.cos(ma), Math.sin(ma) * 0.8 + 0.06, 0.3).normalize();
  o.night = tod > NIGHT0 && tod < NIGHT1 + 0.03 ? Math.min(1, Math.min((tod - NIGHT0) / 0.05, (NIGHT1 + 0.03 - tod) / 0.05)) : 0;
  return o;
}

/* ------------------------------ texturas geradas no aparelho ------------------------------ */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let q = Math.imul(a ^ (a >>> 15), 1 | a);
    q = (q + Math.imul(q ^ (q >>> 7), 61 | q)) ^ q;
    return ((q ^ (q >>> 14)) >>> 0) / 4294967296;
  };
}
/** ruído de valor periódico (repete sem emenda) em [0,1] */
function tileNoise(N: number, cells: number[], seed: number, weights: number[]): Float32Array {
  const out = new Float32Array(N * N);
  const r = rng(seed);
  cells.forEach((c, oi) => {
    const lat = new Float32Array(c * c).map(() => r());
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const fx = (x / N) * c;
        const fy = (y / N) * c;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        let tx = fx - ix;
        let ty = fy - iy;
        tx = tx * tx * (3 - 2 * tx);
        ty = ty * ty * (3 - 2 * ty);
        const g = (i: number, j: number) => lat[((j + c) % c) * c + ((i + c) % c)];
        const v = (g(ix, iy) * (1 - tx) + g(ix + 1, iy) * tx) * (1 - ty) + (g(ix, iy + 1) * (1 - tx) + g(ix + 1, iy + 1) * tx) * ty;
        out[y * N + x] += v * weights[oi];
      }
  });
  const sw = weights.reduce((a, v) => a + v, 0);
  for (let i = 0; i < out.length; i++) out[i] /= sw;
  return out;
}
/** normal map do mar (RGB) + ruído de espuma (A), periódicos */
export function waterTex(N: number): THREE.DataTexture {
  const r = rng(77);
  // campo de alturas = soma de senos com frequências inteiras (periódico)
  const comps: { kx: number; ky: number; a: number; ph: number }[] = [];
  for (let i = 0; i < 46; i++) {
    let kx = 0;
    let ky = 0;
    while (kx === 0 && ky === 0) {
      kx = Math.round((r() * 2 - 1) * 14);
      ky = Math.round((r() * 2 - 1) * 14);
    }
    const km = Math.hypot(kx, ky);
    comps.push({ kx, ky, a: 1 / Math.pow(km, 1.55), ph: r() * Math.PI * 2 });
  }
  const foam = tileNoise(N, [8, 16, 32], 913, [0.55, 0.3, 0.15]);
  const d = new Uint8Array(N * N * 4);
  const TAU = Math.PI * 2;
  let maxG = 0;
  const gx = new Float32Array(N * N);
  const gy = new Float32Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let dx = 0;
      let dy = 0;
      const u = x / N;
      const v = y / N;
      for (const c of comps) {
        const th = TAU * (c.kx * u + c.ky * v) + c.ph;
        const co = Math.cos(th) * c.a;
        dx += co * c.kx;
        dy += co * c.ky;
      }
      const i = y * N + x;
      gx[i] = dx;
      gy[i] = dy;
      maxG = Math.max(maxG, Math.abs(dx), Math.abs(dy));
    }
  for (let i = 0; i < N * N; i++) {
    const nx = -gx[i] / maxG;
    const ny = -gy[i] / maxG;
    const nz = 1.2;
    const l = Math.hypot(nx, ny, nz);
    d[i * 4] = Math.round(((nx / l) * 0.5 + 0.5) * 255);
    d[i * 4 + 1] = Math.round(((ny / l) * 0.5 + 0.5) * 255);
    d[i * 4 + 2] = Math.round(((nz / l) * 0.5 + 0.5) * 255);
    d[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, (foam[i] - 0.5) * 1.8 + 0.5)) * 255);
  }
  const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 2;
  t.needsUpdate = true;
  return t;
}
/** ruído para as nuvens (R) */
export function cloudNoiseTex(N: number): THREE.DataTexture {
  const n = tileNoise(N, [4, 8, 16, 32], 4242, [0.5, 0.27, 0.15, 0.08]);
  const d = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    const v = Math.round(Math.min(1, Math.max(0, (n[i] - 0.5) * 1.6 + 0.5)) * 255);
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
    d[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
/** cáusticas: bordas de Voronoi periódicas (R) */
let causticT: THREE.DataTexture | null = null;
export function causticTex(): THREE.DataTexture {
  if (causticT) return causticT;
  const N = 128;
  const G = 7;
  const r = rng(31337);
  const pts: [number, number][] = [];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) pts.push([(i + 0.15 + r() * 0.7) / G, (j + 0.15 + r() * 0.7) / G]);
  const d = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const u = x / N;
      const v = y / N;
      let f1 = 9;
      let f2 = 9;
      for (const [px, py] of pts) {
        let dx = Math.abs(u - px);
        let dy = Math.abs(v - py);
        dx = Math.min(dx, 1 - dx);
        dy = Math.min(dy, 1 - dy);
        const dd = Math.hypot(dx, dy);
        if (dd < f1) {
          f2 = f1;
          f1 = dd;
        } else if (dd < f2) f2 = dd;
      }
      const e = (f2 - f1) * G;
      const c = Math.pow(Math.max(0, 1 - e / 0.35), 2.2);
      const i = (y * N + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = Math.round(c * 255);
      d[i + 3] = 255;
    }
  const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  causticT = t;
  return t;
}

/** uniforms compartilhados com o fundo das ilhas (cáusticas e cor debaixo d'água) */
export const SEABED_U = {
  uCaus: { value: null as THREE.Texture | null },
  uCTime: { value: 0 },
  uCSun: { value: 1 },
  uCDeep: { value: new THREE.Color('#0a4a78') },
  uCLevel: { value: 0 },
};
/** liga cáusticas + absorção da água num material Lambert do fundo (ilhas) */
export function patchSeabed(mat: THREE.MeshLambertMaterial, tier: number): void {
  SEABED_U.uCaus.value = causticTex();
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, SEABED_U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSbW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSbW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSbW;\nuniform sampler2D uCaus; uniform float uCTime; uniform float uCSun; uniform vec3 uCDeep; uniform float uCLevel;')
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
  float sbD = uCLevel - vSbW.y;
  if (sbD > -0.25) {
    float wet = smoothstep(-0.25, 0.15, sbD);
    gl_FragColor.rgb *= mix(1.0, 0.78, wet);
    ${tier >= 1 ? `vec2 cu = vSbW.xz * 0.16;
    float c1 = texture2D(uCaus, cu + vec2(uCTime * 0.031, uCTime * 0.017)).r;
    float c2 = texture2D(uCaus, cu * 1.31 + vec2(-uCTime * 0.023, uCTime * 0.029)).r;
    float cs = min(c1, c2) * 1.6 + c1 * c2 * 0.6;` : `float cs = 0.3 + 0.3 * sin(vSbW.x * 1.7 + uCTime * 1.3) * sin(vSbW.z * 1.9 - uCTime * 1.1);`}
    float fadeC = smoothstep(0.0, 0.5, sbD) * exp(-max(sbD, 0.0) * 0.16);
    gl_FragColor.rgb += vec3(0.75, 0.95, 1.0) * cs * fadeC * uCSun * 0.55;
    float ab = 1.0 - exp(-max(sbD, 0.0) * 0.22);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, uCDeep, ab * 0.85);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * vec3(0.7, 0.95, 1.0), wet);
  }`,
      );
  };
  mat.customProgramCacheKey = () => 'seabed' + tier;
}

/* ------------------------------ mar ------------------------------ */
const OCEAN_VS = /* glsl */ `
uniform float uTime; uniform float uAmp; uniform vec2 uOff;
uniform vec4 uW[NW]; uniform vec4 uW2[NW]; uniform vec4 uCalm;
varying vec3 vW; varying vec3 vN; varying float vFoam; varying float vH;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec2 p = wp.xz + uOff;
  float dist = length(wp.xz - cameraPosition.xz);
  // água mansa perto de uma ilha (uCalm: centro xz, raio calmo, raio de volta às ondas): sem onda furando o chão
  float calm = uCalm.w > 0.0 ? smoothstep(uCalm.z, uCalm.w, length(wp.xz - uCalm.xy)) * 0.9 + 0.1 : 1.0;
  vec3 d = vec3(0.0); vec3 n = vec3(0.0, 1.0, 0.0); float j = 0.0;
  for (int i = 0; i < NW; i++) {
    vec4 a = uW[i]; vec4 b = uW2[i];
    float fade = (1.0 - smoothstep(b.z * 6.0, b.z * 16.0, dist)) * calm;
    float A = b.x * uAmp * fade; float k = a.z;
    float Q = min(b.y, 0.9 / (k * max(A, 1e-4) * float(NW)));
    float th = k * dot(a.xy, p) - a.w * uTime;
    float c = cos(th); float s = sin(th);
    d.x += Q * A * a.x * c; d.z += Q * A * a.y * c; d.y += A * s;
    n.x -= a.x * k * A * c; n.z -= a.y * k * A * c; n.y -= Q * k * A * s;
    j += Q * k * A * s;
  }
  float far = smoothstep(300.0, 560.0, dist);
  wp.xyz += d * (1.0 - far);
  vW = wp.xyz; vN = normalize(mix(n, vec3(0.0, 1.0, 0.0), far)); vFoam = j * (1.0 - far); vH = d.y;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const OCEAN_FS = /* glsl */ `
uniform float uTime; uniform float uAmp; uniform vec2 uOff;
uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uSunI;
uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uAmb;
uniform vec3 uFog; uniform float uFogD; uniform vec4 uRaft; uniform float uNight; uniform vec3 uMoon; uniform float uStorm;
uniform vec4 uIsA[4]; uniform vec4 uIsB[4]; uniform vec4 uWake[8];
uniform sampler2D uNrm; uniform sampler2D uCloud; uniform vec3 uUwFog; uniform float uCover;
varying vec3 vW; varying vec3 vN; varying float vFoam; varying float vH;
vec3 skyCol(vec3 d, vec3 L){
  float y = max(d.y, 0.0);
  vec3 c = mix(uHor, uZen, pow(smoothstep(0.0, 0.75, y), 0.75));
  float sd = max(dot(d, L), 0.0);
  c += uSunCol * (pow(sd, 6.0) * 0.18 + pow(sd, 48.0) * 0.35) * (1.0 - uNight) * (1.0 - uStorm * 0.8);
  #if DETAIL >= 2
  vec2 cu = d.xz / (y + 0.12) * 0.32 + uTime * vec2(0.0035, 0.0018);
  float cn = texture2D(uCloud, cu).r * 0.62 + texture2D(uCloud, cu * 2.1 + 0.37).r * 0.38;
  float cc = smoothstep(uCover, uCover + 0.25, cn) * smoothstep(0.02, 0.2, y);
  c = mix(c, mix(uHor, vec3(1.0), 0.55) * (0.45 + 0.55 * uSunI * (1.0 - uNight)), cc * 0.7);
  #endif
  return c;
}
float seabed(vec2 w){
  float dep = 80.0;
  for (int i = 0; i < 4; i++) {
    vec4 A = uIsA[i];
    if (A.w < 0.5) continue;
    vec4 B = uIsB[i];
    vec2 q = w - A.xy; float r = length(q);
    if (r > A.z * 1.25 + 26.0) continue;
    float a = atan(q.y, q.x);
    float re = A.z * (1.0 + 0.14 * sin(3.0 * a + B.x) + 0.07 * sin(5.0 * a + B.y));
    float f = r / re;
    float h = f < 1.0 ? B.z * pow(max(1.0 - f * f, 0.0), 1.25) - 0.05 : -min(9.0, (f - 1.0) * A.z * 0.42) - 0.05;
    dep = min(dep, -h);
  }
  return dep;
}
void main(){
  vec3 toCam = cameraPosition - vW;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec3 Ng = normalize(vN);
  vec3 N = Ng;
  vec2 p = vW.xz + uOff;
  float t = uTime;
  // detalhe: normal maps rolando
  float dk = 1.0 - smoothstep(30.0, 260.0, dist);
  vec4 t1 = texture2D(uNrm, p * 0.085 + t * vec2(0.028, 0.017));
  vec3 n1 = t1.xyz * 2.0 - 1.0;
  #if DETAIL >= 1
  vec4 t2 = texture2D(uNrm, p * 0.29 + t * vec2(-0.043, 0.034));
  vec3 n2 = t2.xyz * 2.0 - 1.0;
  vec2 nd = n1.xy * 0.5 + n2.xy * 0.5;
  #else
  vec4 t2 = t1;
  vec2 nd = n1.xy;
  #endif
  #if DETAIL >= 2
  vec3 n3 = texture2D(uNrm, p * 0.012 - t * vec2(0.004, 0.006)).xyz * 2.0 - 1.0;
  vec3 n4 = texture2D(uNrm, p * 0.93 + t * vec2(0.07, -0.055)).xyz * 2.0 - 1.0;
  nd = nd * (0.75 + n3.z * 0.4) + n3.xy * 0.3 + n4.xy * 0.45 * dk;
  #endif
  float ns = (0.12 + 0.34 * dk) * (1.0 + uStorm * 0.7);
  N = normalize(N + vec3(nd.x, 0.0, nd.y) * ns);
  bool under = !gl_FrontFacing;
  vec3 L = normalize(uSunDir);
  if (under) {
    // ----------- de baixo: janela de Snell -----------
    vec3 Nu = -N;
    float c = max(dot(Nu, V), 0.0);
    float win = smoothstep(0.6, 0.74, c);
    vec3 sky = mix(uHor, uZen, 0.4) * (0.7 + uSunI * 0.35) + vec3(0.12, 0.18, 0.2);
    float sunUp = pow(max(dot(-V, L), 0.0), 40.0) * (1.0 - uNight);
    vec3 col = mix(uUwFog * 1.25, sky + uSunCol * sunUp * 1.5, win);
    col += vec3(0.6, 0.9, 1.0) * smoothstep(0.55, 0.62, c) * (1.0 - smoothstep(0.62, 0.75, c)) * 0.25;
    float fo = 1.0 - exp(-dist * 0.055);
    col = mix(col, uUwFog, clamp(fo, 0.0, 1.0));
    gl_FragColor = vec4(col, 1.0);
    return;
  }
  float ndv = max(dot(N, V), 0.0);
  float ndvG = max(dot(Ng, V), 0.05);
  // Fresnel (Schlick, água F0 = 0.02)
  float F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  F = mix(F, 0.6, uStorm * 0.15);
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 refl = skyCol(R, L);
  // luar no reflexo
  refl += vec3(0.7, 0.8, 1.0) * pow(max(dot(R, normalize(uMoon)), 0.0), 140.0) * 1.6 * uNight;
  // corpo d'água: profundidade analítica
  float dep = seabed(vW.xz);
  float shal = exp(-dep * 0.16);
  vec3 body = mix(uDeep, uShallow * 1.08, shal * 0.85);
  // luz dentro d'água: difusa suave + espalhamento nas cristas contra o sol
  float lit = 0.55 + 0.45 * max(dot(N, L), 0.0);
  body *= lit;
  body += uZen * 0.05 * (1.0 - uNight);
  vec2 Lh = normalize(L.xz + 1e-4);
  float back = pow(max(dot(-V.xz / max(length(V.xz), 1e-3), Lh), 0.0), 3.0);
  float crestH = clamp(vH / (0.32 * uAmp + 0.01) * 0.5 + 0.5, 0.0, 1.0);
  float sss = back * (crestH * crestH) * (0.4 + 0.6 * (1.0 - ndvG)) * (1.0 - uNight * 0.8);
  body += vec3(0.08, 0.62, 0.58) * sss * uSunI * 0.55;
  body += vec3(0.02, 0.12, 0.13) * crestH * 0.5;
  // transparência no raso (caminho dentro d'água)
  float path = dep / ndvG;
  float absorb = 1.0 - exp(-path * 0.42);
  absorb = mix(absorb, 1.0, smoothstep(5.0, 12.0, dep));
  // perto da jangada a água funda não é 100% opaca: o corpo do tubarão/peixes aparece embaixo, não só a barbatana (QA)
  absorb = min(absorb, mix(0.78, 1.0, smoothstep(14.0, 40.0, dist)));
  // sol: brilho físico pelo meio-vetor
  vec3 H = normalize(L + V);
  float ndh = max(dot(N, H), 0.0);
  float vdh = max(dot(V, H), 0.0);
  float Fs = 0.02 + 0.98 * pow(1.0 - vdh, 5.0);
  float sunUp = smoothstep(-0.02, 0.06, L.y);
  float spec = (pow(ndh, 1100.0) * 60.0 + pow(ndh, 160.0) * 1.6) * (0.25 + Fs * 3.0);
  #if DETAIL >= 1
  // cintilância (glints) perto
  float gl = t2.a * t1.a;
  spec += pow(ndh, 300.0) * step(0.42, gl) * 14.0 * dk;
  #endif
  vec3 sunC = uSunCol * uSunI * sunUp * (1.0 - uStorm * 0.85) * (1.0 - uNight * 0.6);
  // espuma
  float fn = t1.a * 0.6 + t2.a * 0.4;
  float foam = smoothstep(0.5, 1.0, vFoam / (0.3 + 0.22 * uAmp) + (fn - 0.5) * 0.9 + uStorm * 0.15) * 0.95;
  // praia: faixas que vão e voltam
  if (dep < 3.0) {
    float band = sin(dep * 3.4 - t * 1.7 + fn * 3.0) * 0.5 + 0.5;
    foam += (1.0 - smoothstep(0.0, 2.2, dep)) * smoothstep(0.55, 0.95, band + (fn - 0.5) * 0.8) * 0.85;
    foam += smoothstep(0.35, 0.0, dep) * smoothstep(0.3, 0.75, fn + 0.25 * sin(t * 1.3 + dep * 9.0)) * 0.85;
  }
  // beira da jangada
  vec2 rq = clamp(vW.xz, uRaft.xy, uRaft.zw);
  float rd = length(vW.xz - rq);
  foam += (1.0 - smoothstep(0.05, 0.85, rd)) * smoothstep(0.42, 0.8, fn + 0.12) * 0.75;
  // esteira (barcos, bichos grandes)
  float wk = 0.0;
  for (int i = 0; i < 8; i++) {
    vec4 w = uWake[i];
    if (w.w <= 0.0) continue;
    float dd = length(vW.xz - w.xy);
    wk += w.w * (1.0 - smoothstep(w.z * 0.35, w.z, dd));
  }
  foam += clamp(wk, 0.0, 1.2) * smoothstep(0.25, 0.75, fn + 0.15);
  foam = clamp(foam, 0.0, 1.0);
  // composição: reflexo (Fresnel) + corpo + sol
  vec3 col = refl * F + body * (1.0 - F);
  col += sunC * spec;
  vec3 foamCol = uAmb * 0.55 + uSunCol * uSunI * max(L.y, 0.0) * 0.55 + vec3(0.08);
  col = mix(col, foamCol, foam);
  float alpha = max(1.0 - (1.0 - F) * (1.0 - absorb), foam);
  // de longe a água é opaca (sem fundo)
  // névoa (igual FogExp2)
  float fd = dist * uFogD;
  float fog = 1.0 - exp(-fd * fd);
  col = mix(col, uFog, clamp(fog, 0.0, 1.0));
  alpha = mix(alpha, 1.0, clamp(fog * 1.5, 0.0, 1.0));
  gl_FragColor = vec4(col, alpha);
}`;

export interface IsleShape {
  x: number;
  z: number;
  r: number;
  ph0: number;
  ph1: number;
  peak: number;
}

export class Ocean {
  readonly mesh: THREE.Mesh;
  readonly mat: THREE.ShaderMaterial;
  private nrm: THREE.DataTexture;
  constructor(
    tier: number,
    private cloud: THREE.Texture,
  ) {
    const R = tier <= 0 ? 48 : tier === 1 ? 64 : 84;
    const S = tier <= 0 ? 56 : tier === 1 ? 80 : 120;
    const maxR = 700;
    const pos: number[] = [0, 0, 0];
    for (let i = 1; i <= R; i++) {
      const r = maxR * Math.pow(i / R, 2.5) + i * 0.06;
      for (let s = 0; s < S; s++) {
        const a = (s / S) * Math.PI * 2 + (i % 2 ? Math.PI / S : 0);
        pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
      }
    }
    const idx: number[] = [];
    for (let s = 0; s < S; s++) idx.push(0, 1 + ((s + 1) % S), 1 + s);
    for (let i = 1; i < R; i++) {
      const a0 = 1 + (i - 1) * S;
      const b0 = 1 + i * S;
      for (let s = 0; s < S; s++) {
        const s1 = (s + 1) % S;
        if (i % 2 === 1) {
          idx.push(a0 + s, a0 + s1, b0 + s);
          idx.push(a0 + s1, b0 + s1, b0 + s);
        } else {
          idx.push(a0 + s, b0 + s1, b0 + s);
          idx.push(a0 + s, a0 + s1, b0 + s1);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const nw = tier <= 0 ? 3 : tier === 1 ? 5 : 8;
    const uW = WK.slice(0, nw).map((v) => new THREE.Vector4(v.dx, v.dz, v.k, v.w));
    const uW2 = WK.slice(0, nw).map((v) => new THREE.Vector4(v.A, v.Q, v.L, 0));
    this.nrm = waterTex(tier <= 1 ? 128 : 256);
    this.mat = new THREE.ShaderMaterial({
      defines: { NW: nw, DETAIL: Math.min(2, tier) },
      uniforms: {
        uTime: { value: 0 },
        uAmp: { value: 1 },
        uOff: { value: new THREE.Vector2() },
        uW: { value: uW },
        uW2: { value: uW2 },
        uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.2) },
        uSunCol: { value: new THREE.Color('#fff4e0') },
        uSunI: { value: 1 },
        uZen: { value: new THREE.Color() },
        uHor: { value: new THREE.Color() },
        uDeep: { value: new THREE.Color() },
        uShallow: { value: new THREE.Color() },
        uAmb: { value: new THREE.Color() },
        uFog: { value: new THREE.Color() },
        uUwFog: { value: new THREE.Color() },
        uFogD: { value: 0.0042 },
        uRaft: { value: new THREE.Vector4(-2, -2, 2, 2) },
        uCalm: { value: new THREE.Vector4(0, 0, 0, 0) },
        uNight: { value: 0 },
        uStorm: { value: 0 },
        uCover: { value: 0.55 },
        uMoon: { value: new THREE.Vector3(0, 1, 0) },
        uIsA: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) },
        uIsB: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) },
        uWake: { value: [0, 1, 2, 3, 4, 5, 6, 7].map(() => new THREE.Vector4()) },
        uNrm: { value: this.nrm },
        uCloud: { value: this.cloud },
      },
      vertexShader: OCEAN_VS,
      fragmentShader: OCEAN_FS,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: true,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    // primeiro entre os transparentes (depois do fundo/ilhas/jangada)
    this.mesh.renderOrder = -1;
  }
  update(cam: THREE.Camera, time: number, amp: number, ox: number, oz: number, c: SkyCols, fogD: number, storm: number, uwFog: THREE.Color): void {
    const u = this.mat.uniforms;
    this.mesh.position.set(cam.position.x, 0, cam.position.z);
    u.uTime.value = time;
    u.uAmp.value = amp;
    u.uOff.value.set(ox, oz);
    u.uSunDir.value.copy(c.night > 0.5 ? c.moon : c.dir);
    u.uSunCol.value.copy(c.sun);
    u.uSunI.value = c.night > 0.5 ? 0.45 : c.sunI;
    u.uZen.value.copy(c.zen);
    u.uHor.value.copy(c.hor);
    u.uDeep.value.copy(c.deep);
    u.uShallow.value.copy(c.shallow);
    u.uAmb.value.copy(c.amb).multiplyScalar(c.ambI * 0.8);
    u.uFog.value.copy(c.fog);
    u.uUwFog.value.copy(uwFog);
    u.uFogD.value = fogD;
    u.uNight.value = c.night;
    u.uStorm.value = storm;
    u.uCover.value = 0.56 - storm * 0.3;
    u.uMoon.value.copy(c.moon);
  }
  /** ilhas mais perto (profundidade analítica do raso) */
  setIsles(list: IsleShape[]): void {
    const A = this.mat.uniforms.uIsA.value as THREE.Vector4[];
    const B = this.mat.uniforms.uIsB.value as THREE.Vector4[];
    for (let i = 0; i < 4; i++) {
      const s = list[i];
      if (!s) {
        A[i].w = 0;
        continue;
      }
      A[i].set(s.x, s.z, s.r, 1);
      B[i].set(s.ph0, s.ph1, s.peak, 0);
    }
  }
  /** esteiras: [x, z, raio, força] */
  setWake(list: [number, number, number, number][]): void {
    const W = this.mat.uniforms.uWake.value as THREE.Vector4[];
    for (let i = 0; i < 8; i++) {
      const w = list[i];
      if (w) W[i].set(w[0], w[1], w[2], w[3]);
      else W[i].w = 0;
    }
  }
  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.nrm.dispose();
  }
}

/* ------------------------------ céu ------------------------------ */
const SKY_FS = /* glsl */ `
uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uMoon; uniform float uNight; uniform float uStorm; uniform float uTime; uniform float uSunI;
uniform sampler2D uCloud; uniform float uCover; uniform vec3 uAmb;
varying vec3 vD;
float h31(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
void main(){
  vec3 d = normalize(vD);
  float y = d.y;
  vec3 L = normalize(uSunDir);
  // gradiente (mais escuro no zênite, claro e enevoado no horizonte)
  vec3 col = mix(uHor, uZen, pow(smoothstep(-0.02, 0.75, y), 0.7));
  if (y < 0.0) col = mix(uHor, uHor * 0.82, smoothstep(0.0, -0.25, y));
  float sd = max(dot(d, L), 0.0);
  float day = (1.0 - uNight) * (1.0 - uStorm * 0.8);
  // halo do sol (Mie) + brilho no horizonte do lado do sol
  col += uSunCol * (pow(sd, 5.0) * 0.22 + pow(sd, 42.0) * 0.38 + pow(sd, 400.0) * 0.6) * day;
  col += uSunCol * pow(1.0 - abs(y), 6.0) * pow(sd, 2.0) * 0.18 * day;
  // disco do sol
  col = mix(col, vec3(1.0, 0.98, 0.92), smoothstep(0.99935, 0.9997, sd) * day);
  // lua
  float md = dot(d, normalize(uMoon));
  col = mix(col, vec3(0.98, 0.97, 0.88), smoothstep(0.9982, 0.9992, md) * uNight * (1.0 - uStorm * 0.7));
  col += vec3(0.5, 0.6, 0.9) * pow(max(md, 0.0), 30.0) * 0.25 * uNight;
  // estrelas
  if (uNight > 0.01 && y > 0.05) {
    vec3 q = floor(d * 170.0);
    float s = h31(q);
    float tw = 0.6 + 0.4 * sin(uTime * 2.0 + s * 40.0);
    col += vec3(1.0, 0.96, 0.85) * step(0.9968, s) * uNight * tw * smoothstep(0.05, 0.3, y) * (1.0 - uStorm);
  }
  // nuvens procedurais
  if (y > 0.0) {
    vec2 cu = d.xz / (y + 0.1) * 0.3 + uTime * vec2(0.0035, 0.0018);
    float n = texture2D(uCloud, cu).r * 0.55 + texture2D(uCloud, cu * 2.07 + 0.31).r * 0.3;
    #if CLOUD >= 2
    n += texture2D(uCloud, cu * 4.3 + 0.77).r * 0.15;
    #else
    n += 0.075;
    #endif
    float cov = uCover;
    float c = smoothstep(cov, cov + 0.22, n) * smoothstep(0.0, 0.14, y);
    float thick = smoothstep(cov, cov + 0.45, n);
    vec3 lit = mix(vec3(1.0), uSunCol, 0.25) * (0.55 + 0.6 * uSunI) * (1.0 - uNight * 0.75);
    vec3 shade = mix(uHor, uZen, 0.4) * mix(0.82, 0.55, uStorm) + uAmb * 0.08;
    vec3 cc = mix(lit, shade, thick * 0.75);
    // borda prateada perto do sol
    cc += uSunCol * pow(sd, 7.0) * (1.0 - thick) * 0.7 * day;
    cc = mix(cc, vec3(0.08, 0.1, 0.18), uNight * 0.7);
    col = mix(col, cc, c * mix(0.92, 1.0, uStorm));
  }
  gl_FragColor = vec4(col, 1.0);
}`;
const SKY_VS = /* glsl */ `varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;

export class Sky {
  readonly group = new THREE.Group();
  readonly cloudTex: THREE.DataTexture;
  private mat: THREE.ShaderMaterial;
  constructor(tier: number) {
    this.cloudTex = cloudNoiseTex(tier <= 0 ? 128 : 256);
    this.mat = new THREE.ShaderMaterial({
      defines: { CLOUD: tier >= 2 ? 2 : 1 },
      uniforms: {
        uZen: { value: new THREE.Color() },
        uHor: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3() },
        uSunCol: { value: new THREE.Color() },
        uMoon: { value: new THREE.Vector3() },
        uNight: { value: 0 },
        uStorm: { value: 0 },
        uTime: { value: 0 },
        uSunI: { value: 1 },
        uCover: { value: 0.55 },
        uAmb: { value: new THREE.Color() },
        uCloud: { value: this.cloudTex },
      },
      vertexShader: SKY_VS,
      fragmentShader: SKY_FS,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 18), this.mat);
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    this.group.add(dome);
  }
  update(cam: THREE.Camera, time: number, _dt: number, c: SkyCols, storm: number): void {
    this.group.position.copy(cam.position);
    const u = this.mat.uniforms;
    u.uZen.value.copy(c.zen);
    u.uHor.value.copy(c.hor);
    u.uSunDir.value.copy(c.dir);
    u.uSunCol.value.copy(c.sun);
    u.uMoon.value.copy(c.moon);
    u.uNight.value = c.night;
    u.uStorm.value = storm;
    u.uTime.value = time;
    u.uSunI.value = c.sunI;
    u.uCover.value = 0.56 - storm * 0.34;
    u.uAmb.value.copy(c.amb);
  }
  dispose(): void {
    this.mat.dispose();
    this.cloudTex.dispose();
  }
}

/* ------------------------------ mundo submarino ------------------------------ */
function rayTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 256);
  x.globalCompositeOperation = 'destination-in';
  const h = x.createLinearGradient(0, 0, 64, 0);
  h.addColorStop(0, 'rgba(0,0,0,0)');
  h.addColorStop(0.5, 'rgba(0,0,0,1)');
  h.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = h;
  x.fillRect(0, 0, 64, 256);
  return new THREE.CanvasTexture(c);
}
/** raios de luz (god rays) + partículas boiando, só debaixo d'água */
export class Underwater {
  readonly group = new THREE.Group();
  private rays: { m: THREE.Mesh; ox: number; oz: number; ph: number; w: number }[] = [];
  private motes: THREE.Points;
  private moteMat: THREE.PointsMaterial;
  private rayMat: THREE.MeshBasicMaterial;
  private tex: THREE.CanvasTexture;
  private N: number;
  constructor(tier: number) {
    this.tex = rayTex();
    this.rayMat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, color: '#9fe8ff', opacity: 0.25, side: THREE.DoubleSide });
    const nr = tier <= 0 ? 5 : tier === 1 ? 9 : 14;
    const geo = new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0);
    for (let i = 0; i < nr; i++) {
      const m = new THREE.Mesh(geo, this.rayMat);
      m.renderOrder = 6;
      m.frustumCulled = false;
      const a = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * 12;
      this.rays.push({ m, ox: Math.cos(a) * r, oz: Math.sin(a) * r, ph: Math.random() * 6.28, w: 0.6 + Math.random() * 1.8 });
      this.group.add(m);
    }
    this.N = tier <= 0 ? 120 : tier === 1 ? 220 : 380;
    const pos = new Float32Array(this.N * 3);
    for (let i = 0; i < this.N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 16;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 16;
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.moteMat = new THREE.PointsMaterial({ color: '#cff8ff', size: 0.045, transparent: true, opacity: 0.6, depthWrite: false, fog: true });
    this.motes = new THREE.Points(pg, this.moteMat);
    this.motes.frustumCulled = false;
    this.group.add(this.motes);
    this.group.visible = false;
  }
  update(cam: THREE.Camera, on: boolean, time: number, dt: number, sun: THREE.Vector3, light: number, waterY: number): void {
    this.group.visible = on;
    if (!on) return;
    const cx = cam.position.x;
    const cz = cam.position.z;
    const tilt = Math.max(-0.5, Math.min(0.5, sun.x * 0.4));
    const tiltZ = Math.max(-0.5, Math.min(0.5, sun.z * 0.4));
    this.rayMat.opacity = 0.18 * light;
    for (const r of this.rays) {
      // flutua e reaparece em volta da câmera
      r.ox += Math.sin(time * 0.1 + r.ph) * dt * 0.2;
      const x = cx + r.ox;
      const z = cz + r.oz;
      r.m.position.set(x, waterY, z);
      const len = 14 + Math.sin(time * 0.7 + r.ph) * 3;
      r.m.scale.set(r.w * (0.8 + Math.sin(time * 1.3 + r.ph) * 0.2), len, 1);
      r.m.rotation.set(tiltZ, Math.atan2(cam.position.x - x, cam.position.z - z), tilt);
    }
    const p = this.motes.geometry.getAttribute('position') as THREE.BufferAttribute;
    const a = p.array as Float32Array;
    const cy = cam.position.y;
    // partículas em coordenadas do mundo; quem sai do cubo de 16 m em volta da câmera volta do outro lado
    for (let i = 0; i < this.N; i++) {
      const j = i * 3;
      a[j + 1] += dt * 0.08;
      a[j] += Math.sin(time * 0.5 + i) * dt * 0.05;
      if (a[j] - cx > 8) a[j] -= 16;
      else if (a[j] - cx < -8) a[j] += 16;
      if (a[j + 2] - cz > 8) a[j + 2] -= 16;
      else if (a[j + 2] - cz < -8) a[j + 2] += 16;
      if (a[j + 1] - cy > 5) a[j + 1] -= 10;
      else if (a[j + 1] - cy < -5) a[j + 1] += 10;
    }
    p.needsUpdate = true;
    this.moteMat.opacity = 0.35 + light * 0.3;
  }
  dispose(): void {
    this.tex.dispose();
    this.rayMat.dispose();
    this.moteMat.dispose();
    this.motes.geometry.dispose();
  }
}
