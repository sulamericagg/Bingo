/* ============================================================
 *  JANGADA BLOOP — oceano sem fim e céu.
 *   - ondas de Gerstner no vertex shader (mesmas ondas na CPU para a
 *     jangada balançar e os restos boiarem certinho);
 *   - espuma nas cristas, na beira da jangada e na praia das ilhas;
 *   - brilhos do sol (glints), reflexo do céu (Fresnel), neblina no horizonte;
 *   - visto de baixo: superfície prateada e mar azul-turquesa;
 *   - céu com gradiente, sol, lua, estrelas e nuvens (sprites) por hora do dia.
 *  A malha é polar (densa perto da câmera) e segue a câmera.
 * ============================================================ */
import * as THREE from 'three';
import { NIGHT0, NIGHT1 } from './data';

/** dir (rad), comprimento (m), altura (m), "pontuda" (Q) */
export const WAVES: [number, number, number, number][] = [
  [0.35, 19, 0.2, 0.45],
  [1.45, 11.5, 0.12, 0.55],
  [-0.75, 6.8, 0.065, 0.6],
  [2.4, 3.9, 0.032, 0.5],
];
const WK = WAVES.map(([d, L, A, Q]) => {
  const k = (Math.PI * 2) / L;
  return { dx: Math.cos(d), dz: Math.sin(d), k, A, Q, w: Math.sqrt(9.8 * k) * 0.85 };
});
/** altura do mar (aprox. da superfície do shader) em (x, z) do mundo */
export function waveH(x: number, z: number, t: number, amp: number, ox: number, oz: number): number {
  let y = 0;
  const px = x + ox;
  const pz = z + oz;
  for (const v of WK) y += v.A * amp * Math.sin(v.k * (v.dx * px + v.dz * pz) - v.w * t);
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
  { t: 0.0, zen: '#4a6ab8', hor: '#ffb08a', sun: '#ffb070', sunI: 0.7, amb: '#c8b0d8', ambI: 0.8, deep: '#1a3f7a', shallow: '#3a8ab0' },
  { t: 0.08, zen: '#3a9ae8', hor: '#bfe8ff', sun: '#fff0d0', sunI: 1.5, amb: '#d8f0ff', ambI: 1.15, deep: '#0a4f96', shallow: '#1fb2cf' },
  { t: 0.4, zen: '#2a86e8', hor: '#c8ecff', sun: '#fff8e8', sunI: 1.7, amb: '#e0f4ff', ambI: 1.25, deep: '#064a94', shallow: '#18b8d2' },
  { t: 0.66, zen: '#3a7ad0', hor: '#ffd8a8', sun: '#ffd8a0', sunI: 1.4, amb: '#f0e0d0', ambI: 1.1, deep: '#0c4a8a', shallow: '#2aa8c0' },
  { t: 0.74, zen: '#5a4aa8', hor: '#ff8a6a', sun: '#ff8a50', sunI: 0.9, amb: '#d0a0c0', ambI: 0.85, deep: '#1c3870', shallow: '#3a7aa0' },
  { t: 0.8, zen: '#141a48', hor: '#3a3a78', sun: '#9ab0ff', sunI: 0.45, amb: '#6a78c8', ambI: 0.62, deep: '#0a1c48', shallow: '#1a4a78' },
  { t: 0.88, zen: '#0c1238', hor: '#26306a', sun: '#a8c0ff', sunI: 0.5, amb: '#6a7ad0', ambI: 0.6, deep: '#081840', shallow: '#184474' },
  { t: 0.95, zen: '#1c2a68', hor: '#6a5a98', sun: '#c0b0ff', sunI: 0.45, amb: '#8a88c8', ambI: 0.65, deep: '#0c2456', shallow: '#20508a' },
  { t: 1.0, zen: '#4a6ab8', hor: '#ffb08a', sun: '#ffb070', sunI: 0.7, amb: '#c8b0d8', ambI: 0.8, deep: '#1a3f7a', shallow: '#3a8ab0' },
];
const STORM = { zen: new THREE.Color('#4a5468'), hor: new THREE.Color('#8a94a4'), deep: new THREE.Color('#163a52'), shallow: new THREE.Color('#2a6a7a') };
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
  // tempestade: céu cinza, menos sol
  if (storm > 0) {
    const s = storm * 0.85;
    const dark = 1 - Math.max(0, tod - NIGHT0) * 2.5;
    o.zen.lerp(_a.copy(STORM.zen).multiplyScalar(Math.max(0.25, dark)), s);
    o.hor.lerp(_a.copy(STORM.hor).multiplyScalar(Math.max(0.3, dark)), s);
    o.deep.lerp(STORM.deep, s);
    o.shallow.lerp(STORM.shallow, s);
    o.sunI *= 1 - s * 0.65;
  }
  o.fog.copy(o.hor);
  // sol: nasce no leste (+x) e se põe no oeste
  const dayLen = NIGHT0 + 0.06;
  const sa = Math.min(1, tod / dayLen) * Math.PI;
  o.dir.set(Math.cos(sa), Math.max(-0.3, Math.sin(sa)) * 0.95 + 0.04, -0.35).normalize();
  // lua: de noite
  const nl = NIGHT1 + 0.04 - (NIGHT0 + 0.02);
  const ma = Math.max(0, Math.min(1, (tod - NIGHT0 - 0.02) / nl)) * Math.PI;
  o.moon.set(Math.cos(ma), Math.sin(ma) * 0.8 + 0.06, 0.3).normalize();
  o.night = tod > NIGHT0 && tod < NIGHT1 + 0.03 ? Math.min(1, Math.min((tod - NIGHT0) / 0.05, (NIGHT1 + 0.03 - tod) / 0.05)) : 0;
  return o;
}

/* ------------------------------ mar ------------------------------ */
const OCEAN_VS = /* glsl */ `
uniform float uTime; uniform float uAmp; uniform vec2 uOff;
uniform vec4 uW[4]; uniform vec4 uW2[4];
varying vec3 vW; varying vec3 vN; varying float vFoam; varying float vH;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec2 p = wp.xz + uOff;
  vec3 d = vec3(0.0); vec3 n = vec3(0.0, 1.0, 0.0); float j = 0.0;
  for (int i = 0; i < NW; i++) {
    vec4 a = uW[i]; vec4 b = uW2[i];
    float A = b.x * uAmp; float Q = b.y; float k = a.z; float w = a.w;
    float th = k * dot(a.xy, p) - w * uTime;
    float c = cos(th); float s = sin(th);
    d.x += Q * A * a.x * c; d.z += Q * A * a.y * c; d.y += A * s;
    n.x -= a.x * k * A * c; n.z -= a.y * k * A * c; n.y -= Q * k * A * s;
    j += Q * k * A * s;
  }
  float far = smoothstep(260.0, 520.0, length(wp.xz - cameraPosition.xz));
  wp.xyz += d * (1.0 - far);
  vW = wp.xyz; vN = normalize(mix(n, vec3(0.0,1.0,0.0), far)); vFoam = j * (1.0 - far); vH = d.y;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const OCEAN_FS = /* glsl */ `
uniform float uTime; uniform float uAmp; uniform vec2 uOff;
uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uSunI;
uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uDeep; uniform vec3 uShallow;
uniform vec3 uFog; uniform float uFogD; uniform vec4 uIsl; uniform vec4 uRaft; uniform float uNight; uniform vec3 uMoon;
varying vec3 vW; varying vec3 vN; varying float vFoam; varying float vH;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
void main(){
  vec3 V = normalize(cameraPosition - vW);
  float dist = length(cameraPosition - vW);
  vec3 N = normalize(vN);
  vec2 p = vW.xz + uOff;
  #if DETAIL
  // ondinhas finas (detalhe que some com a distância)
  float dk = 1.0 - smoothstep(20.0, 90.0, dist);
  float t = uTime;
  vec2 g = vec2(sin(p.x*1.7 + t*1.6) + sin(p.y*2.3 - t*1.3 + p.x*0.6), cos(p.y*1.9 + t*1.4) + cos(p.x*2.6 + t*1.1 - p.y*0.4));
  N = normalize(N + vec3(g.x, 0.0, g.y) * 0.06 * dk);
  #endif
  bool under = !gl_FrontFacing;
  if (under) N = -N;
  float ndv = max(dot(N, V), 0.0);
  float fres = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);
  // cor da água: fundo -> raso (cristas e perto das ilhas)
  float crest = clamp(vH / (0.35 * uAmp + 0.01) * 0.5 + 0.5, 0.0, 1.0);
  vec3 water = mix(uDeep, uShallow, crest * 0.45 + pow(ndv, 2.0) * 0.25);
  float shore = 0.0;
  if (uIsl.w > 0.5) {
    float di = length(vW.xz - uIsl.xy) - uIsl.z;
    shore = 1.0 - smoothstep(0.0, 26.0, di);
    water = mix(water, vec3(0.25, 0.85, 0.82), shore * 0.75);
  }
  vec3 R = reflect(-V, N);
  vec3 sky = mix(uHor, uZen, smoothstep(0.0, 0.6, R.y));
  vec3 col = mix(water, sky, fres * 0.85);
  // sol: brilho largo + glints finos
  vec3 L = normalize(uSunDir);
  float sd = max(dot(R, L), 0.0);
  float spec = pow(sd, 220.0) * 3.0 + pow(sd, 24.0) * 0.12;
  #if DETAIL
  float gl = vn(p * 3.0 + vec2(uTime * 0.7, -uTime * 0.5));
  spec += pow(sd, 60.0) * step(0.86, gl) * 2.2 * (1.0 - smoothstep(30.0, 140.0, dist));
  #endif
  col += uSunCol * spec * uSunI * (L.y > 0.0 ? 1.0 : 0.0) * (1.0 - uNight * 0.6);
  // luar
  float md = max(dot(R, normalize(uMoon)), 0.0);
  col += vec3(0.7, 0.8, 1.0) * pow(md, 120.0) * 1.4 * uNight;
  // espuma: cristas + beira da jangada + praia
  float fn = vn(p * 1.3 + vec2(uTime * 0.2, 0.0)) * 0.6 + vn(p * 4.1 - vec2(0.0, uTime * 0.35)) * 0.4;
  float foam = smoothstep(0.55, 1.05, vFoam / (0.55 + 0.25 * uAmp) + fn * 0.35) * 0.9;
  vec2 rq = clamp(vW.xz, uRaft.xy, uRaft.zw);
  float rd = length(vW.xz - rq);
  foam += (1.0 - smoothstep(0.0, 1.6, rd)) * smoothstep(0.35, 0.8, fn) * 0.85;
  if (uIsl.w > 0.5) {
    float di = length(vW.xz - uIsl.xy) - uIsl.z;
    foam += (1.0 - smoothstep(0.0, 3.5, abs(di + 1.0 + sin(uTime * 0.8 + fn * 3.0) * 0.8))) * smoothstep(0.3, 0.7, fn);
  }
  col = mix(col, vec3(0.95, 0.98, 1.0) * (0.55 + uSunI * 0.3), clamp(foam, 0.0, 1.0));
  if (under) {
    // de baixo: janela de Snell clara no alto, resto turquesa
    float win = smoothstep(0.55, 0.85, ndv);
    col = mix(uShallow * 0.9 + vec3(0.02, 0.12, 0.14), mix(uHor, vec3(1.0), 0.4) * (0.6 + uSunI * 0.3), win);
    dist *= 3.0;
  }
  float fog = 1.0 - exp(-dist * uFogD);
  col = mix(col, uFog, clamp(fog, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}`;

export class Ocean {
  readonly mesh: THREE.Mesh;
  readonly mat: THREE.ShaderMaterial;
  constructor(tier: number) {
    const R = tier <= 0 ? 44 : tier === 1 ? 56 : 72;
    const S = tier <= 0 ? 48 : tier === 1 ? 64 : 96;
    const maxR = 700;
    const pos: number[] = [0, 0, 0];
    for (let i = 1; i <= R; i++) {
      const r = maxR * Math.pow(i / R, 2.35) + i * 0.08;
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
        const odd = i % 2 === 1;
        // anéis defasados: triângulos alternados
        if (odd) {
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
    const nw = tier <= 0 ? 3 : 4;
    const uW = WK.map((v) => new THREE.Vector4(v.dx, v.dz, v.k, v.w));
    const uW2 = WK.map((v) => new THREE.Vector4(v.A, v.Q, 0, 0));
    this.mat = new THREE.ShaderMaterial({
      defines: { NW: nw, DETAIL: tier >= 2 ? 1 : 0 },
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
        uFog: { value: new THREE.Color() },
        uFogD: { value: 0.0042 },
        uIsl: { value: new THREE.Vector4(0, 0, 0, 0) },
        uRaft: { value: new THREE.Vector4(-2, -2, 2, 2) },
        uNight: { value: 0 },
        uMoon: { value: new THREE.Vector3(0, 1, 0) },
      },
      vertexShader: OCEAN_VS,
      fragmentShader: OCEAN_FS,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -2;
  }
  update(cam: THREE.Camera, time: number, amp: number, ox: number, oz: number, c: SkyCols, fogD: number): void {
    const u = this.mat.uniforms;
    this.mesh.position.set(cam.position.x, 0, cam.position.z);
    u.uTime.value = time;
    u.uAmp.value = amp;
    u.uOff.value.set(ox, oz);
    u.uSunDir.value.copy(c.night > 0.5 ? c.moon : c.dir);
    u.uSunCol.value.copy(c.sun);
    u.uSunI.value = c.night > 0.5 ? 0.5 : c.sunI;
    u.uZen.value.copy(c.zen);
    u.uHor.value.copy(c.hor);
    u.uDeep.value.copy(c.deep);
    u.uShallow.value.copy(c.shallow);
    u.uFog.value.copy(c.fog);
    u.uFogD.value = fogD;
    u.uNight.value = c.night;
    u.uMoon.value.copy(c.moon);
  }
  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

/* ------------------------------ céu ------------------------------ */
const SKY_FS = /* glsl */ `
uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uMoon; uniform float uNight; uniform float uStorm; uniform float uTime;
varying vec3 vD;
float h31(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
void main(){
  vec3 d = normalize(vD);
  float y = d.y;
  vec3 col = mix(uHor, uZen, smoothstep(-0.02, 0.55, y));
  if (y < 0.0) col = mix(uHor, uHor * 0.85, smoothstep(0.0, -0.2, y));
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunCol * (pow(sd, 8.0) * 0.25 + pow(sd, 64.0) * 0.4) * (1.0 - uStorm * 0.8) * (1.0 - uNight);
  col = mix(col, vec3(1.0, 0.98, 0.9), smoothstep(0.9975, 0.999, sd) * (1.0 - uStorm) * (1.0 - uNight));
  // lua
  float md = dot(d, normalize(uMoon));
  col = mix(col, vec3(0.98, 0.97, 0.88), smoothstep(0.9982, 0.9992, md) * uNight * (1.0 - uStorm * 0.7));
  col += vec3(0.5, 0.6, 0.9) * pow(max(md, 0.0), 30.0) * 0.25 * uNight;
  // estrelas
  if (uNight > 0.01 && y > 0.05) {
    vec3 q = floor(d * 160.0);
    float s = h31(q);
    float tw = 0.6 + 0.4 * sin(uTime * 2.0 + s * 40.0);
    col += vec3(1.0, 0.96, 0.85) * step(0.9965, s) * uNight * tw * smoothstep(0.05, 0.3, y) * (1.0 - uStorm);
  }
  gl_FragColor = vec4(col, 1.0);
}`;
const SKY_VS = /* glsl */ `varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;

function cloudTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const x = c.getContext('2d')!;
  const blobs = 14;
  for (let i = 0; i < blobs; i++) {
    const bx = 40 + Math.random() * 176;
    const by = 60 + Math.random() * 30 - Math.abs(bx - 128) * 0.15;
    const r = 22 + Math.random() * 26 - Math.abs(bx - 128) * 0.12;
    const g = x.createRadialGradient(bx, by, 0, bx, by, r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.beginPath();
    x.arc(bx, by, r, 0, 7);
    x.fill();
  }
  // base achatada levemente sombreada
  const sh = x.createLinearGradient(0, 60, 0, 128);
  sh.addColorStop(0, 'rgba(180,200,230,0)');
  sh.addColorStop(1, 'rgba(150,170,210,0.5)');
  x.globalCompositeOperation = 'source-atop';
  x.fillStyle = sh;
  x.fillRect(0, 0, 256, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Sky {
  readonly group = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  private clouds: { s: THREE.Sprite; a: number; r: number; h: number; sp: number }[] = [];
  private cmat: THREE.SpriteMaterial[] = [];
  constructor(tier: number) {
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uZen: { value: new THREE.Color() },
        uHor: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3() },
        uSunCol: { value: new THREE.Color() },
        uMoon: { value: new THREE.Vector3() },
        uNight: { value: 0 },
        uStorm: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: SKY_VS,
      fragmentShader: SKY_FS,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 14), this.mat);
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    this.group.add(dome);
    const n = tier <= 0 ? 7 : 12;
    const tex = cloudTex();
    for (let i = 0; i < n; i++) {
      const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.9 });
      this.cmat.push(m);
      const s = new THREE.Sprite(m);
      const sc = 90 + Math.random() * 110;
      s.scale.set(sc, sc * 0.45, 1);
      s.renderOrder = -9;
      this.group.add(s);
      this.clouds.push({ s, a: Math.random() * Math.PI * 2, r: 420 + Math.random() * 200, h: 70 + Math.random() * 90, sp: (Math.random() * 0.5 + 0.5) * 0.004 });
    }
  }
  update(cam: THREE.Camera, time: number, dt: number, c: SkyCols, storm: number): void {
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
    const lit = _a.copy(c.amb).multiplyScalar(0.55 + c.ambI * 0.45);
    lit.lerp(_b.set('#6a7080'), storm * 0.8);
    for (const cl of this.clouds) {
      cl.a += cl.sp * dt * (1 + storm * 3);
      cl.s.position.set(Math.cos(cl.a) * cl.r, cl.h - storm * 30, Math.sin(cl.a) * cl.r);
      (cl.s.material as THREE.SpriteMaterial).color.copy(lit);
      (cl.s.material as THREE.SpriteMaterial).opacity = 0.75 + storm * 0.25 - c.night * 0.35;
    }
  }
  dispose(): void {
    this.mat.dispose();
    for (const m of this.cmat) {
      m.map?.dispose();
      m.dispose();
    }
  }
}
