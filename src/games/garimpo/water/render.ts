/* ============================================================
 *  GARIMPO BRUTO — superfície da água (malha em blocos de 24 m, só onde tem água).
 *  Vértices numa grade mais fina que a simulação (0,75 m alto / 1,5 m baixo). A altura vem do
 *  nível η interpolado das células; célula seca vizinha de molhada usa o η dos vizinhos (a margem
 *  fica plana e corta o terreno na linha certa, sem "subir a encosta"). Onde η fica abaixo do
 *  chão o vértice afunda sob o terreno e o alfa vai a 0 → sem água flutuando nem z-fighting.
 *  Índices refeitos por bloco: só quadras com algum canto molhado (fill-rate mínimo).
 *  Shader: normal map gerado em canvas, rolando na direção do fluxo (2 fases), cor por
 *  profundidade e lama, espuma onde corre rápido ou na frente da onda, borda suave.
 * ============================================================ */
import * as THREE from 'three';
import type { Terrain } from '../terrain';
import { TN, TS, WCS, WN, WA, type WaterSim } from './sim';

const RC = 16; // células por bloco
const NB = WN / RC;
const TPB = RC / TS; // ladrilhos da simulação por lado do bloco

interface Block {
  bx: number;
  bz: number;
  mesh: THREE.Mesh | null;
  geo: THREE.BufferGeometry | null;
  ht: Float32Array | null;
  htDirty: boolean;
  dirty: boolean;
  any: boolean;
}

let NRM: THREE.CanvasTexture | null = null;
/** normal map de ondas (tileável) + ruído de espuma no canal B, desenhado em canvas */
function normalTex(): THREE.CanvasTexture {
  if (NRM) return NRM;
  const S = 128;
  const hgt = new Float32Array(S * S);
  const waves: [number, number, number, number][] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 14; i++) {
    const fx = Math.round((rnd() * 2 - 1) * (2 + i * 0.7));
    const fz = Math.round((rnd() * 2 - 1) * (2 + i * 0.7)) || 1;
    waves.push([fx, fz, rnd() * 6.28, 1 / (1 + i * 0.35)]);
  }
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      let v = 0;
      for (const [fx, fz, ph, a] of waves) v += Math.sin(((fx * x + fz * y) / S) * Math.PI * 2 + ph) * a;
      hgt[y * S + x] = v;
    }
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const cx = cv.getContext('2d')!;
  const img = cx.createImageData(S, S);
  // espuma: manchas (pontos de Worley simplificados, tileável)
  const pts: [number, number][] = [];
  for (let i = 0; i < 40; i++) pts.push([rnd() * S, rnd() * S]);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const hl = hgt[y * S + ((x + S - 1) % S)];
      const hr = hgt[y * S + ((x + 1) % S)];
      const hd = hgt[((y + S - 1) % S) * S + x];
      const hu = hgt[((y + 1) % S) * S + x];
      const nx = (hl - hr) * 0.18;
      const nz = (hd - hu) * 0.18;
      let md = 1e9;
      for (const [px, py] of pts) {
        let dx = Math.abs(px - x);
        let dy = Math.abs(py - y);
        if (dx > S / 2) dx = S - dx;
        if (dy > S / 2) dy = S - dy;
        md = Math.min(md, dx * dx + dy * dy);
      }
      const f = Math.max(0, Math.min(1, 1 - Math.sqrt(md) / 14)) * 0.7 + Math.max(0, hgt[y * S + x]) * 0.08;
      const p = (y * S + x) * 4;
      img.data[p] = Math.max(0, Math.min(255, (nx * 0.5 + 0.5) * 255));
      img.data[p + 1] = Math.max(0, Math.min(255, (nz * 0.5 + 0.5) * 255));
      img.data[p + 2] = Math.max(0, Math.min(255, f * 255));
      img.data[p + 3] = 255;
    }
  cx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  NRM = t;
  return t;
}

const VS = `
attribute vec4 aW;
attribute float aMud;
varying vec4 vW;
varying float vMud;
varying vec3 vPos;
#include <fog_pars_vertex>
void main(){
  vW = aW; vMud = aMud;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPos = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FS = `
uniform sampler2D uNrm;
uniform float uTime;
uniform vec3 uSun;
uniform vec3 uSky;
uniform vec3 uDeep;
uniform vec3 uShal;
uniform vec3 uMud;
uniform float uLight;
uniform float uDetail;
varying vec4 vW;
varying float vMud;
varying vec3 vPos;
#include <fog_pars_fragment>
void main(){
  float depth = vW.x;
  vec2 flow = vW.yz;
  float sp = length(flow);
  float ph0 = fract(uTime * 0.55);
  float ph1 = fract(uTime * 0.55 + 0.5);
  float wg = abs(ph0 * 2.0 - 1.0);
  vec2 uv = vPos.xz * 0.17;
  vec2 fo = flow * 0.22;
  vec3 t0 = texture2D(uNrm, uv - fo * ph0).xyz;
  vec3 t1 = texture2D(uNrm, uv - fo * ph1 + vec2(0.37, 0.21)).xyz;
  vec3 tA = mix(t0, t1, wg);
  vec3 tB = texture2D(uNrm, vPos.xz * 0.045 + vec2(uTime * 0.011, uTime * 0.007)).xyz;
  vec2 nxy = (tA.xy * 2.0 - 1.0) * (0.22 + min(sp, 3.0) * 0.2) * uDetail + (tB.xy * 2.0 - 1.0) * 0.25;
  vec3 N = normalize(vec3(nxy.x, 1.0, nxy.y));
  vec3 V = normalize(cameraPosition - vPos);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 col = mix(uShal, uDeep, smoothstep(0.0, 2.2, depth));
  col = mix(col, uMud * mix(1.0, 0.7, smoothstep(0.0, 1.6, depth)), clamp(vMud, 0.0, 1.0));
  col *= (0.6 + 0.4 * max(dot(N, uSun), 0.0)) * uLight;
  col = mix(col, uSky, fres * 0.6);
  vec3 H = normalize(uSun + V);
  float spec = pow(max(dot(N, H), 0.0), 160.0) * 0.5 * uLight;
  float fw = clamp(vW.w, 0.0, 1.0);
  float foam = smoothstep(0.5, 0.85, tA.z * 0.9 + fw * 0.45) * fw;
  col = mix(col, vec3(0.78, 0.76, 0.7) * uLight, foam * 0.85);
  col += spec * (1.0 - foam);
  float a = mix(0.6, 0.93, smoothstep(0.0, 1.8, depth));
  a = max(a, foam * 0.95);
  a *= smoothstep(0.0, 0.07, depth);
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export class WaterRender {
  readonly group = new THREE.Group();
  readonly mat: THREE.ShaderMaterial;
  private blocks: Block[] = [];
  private res = 2;
  /** η de desenho por célula (NaN = sem água por perto) */
  private eta = new Float32Array(WN * WN);
  private foam = new Float32Array(WN * WN);
  private mud = new Float32Array(WN * WN);
  private budget = 4;
  readonly u = {
    uNrm: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uSun: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
    uSky: { value: new THREE.Color(0xcfd9c8) },
    uDeep: { value: new THREE.Color(0x0f4652) },
    uShal: { value: new THREE.Color(0x3d8f8a) },
    uMud: { value: new THREE.Color(0x8a5530) },
    uLight: { value: 1 },
    uDetail: { value: 1 },
  };

  constructor(
    private sim: WaterSim,
    private T: Terrain,
  ) {
    this.u.uNrm.value = normalTex();
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]) as Record<string, THREE.IUniform>,
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      depthWrite: false,
      fog: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
    });
    Object.assign(this.mat.uniforms, this.u);
    for (let bz = 0; bz < NB; bz++) for (let bx = 0; bx < NB; bx++) this.blocks.push({ bx, bz, mesh: null, geo: null, ht: null, htDirty: true, dirty: true, any: false });
    this.group.name = 'water';
  }

  /** 0..3: resolução dos vértices e quantos blocos por quadro */
  setTier(t: number): void {
    const r = t >= 2 ? 2 : 1;
    this.budget = [2, 3, 5, 8][t] ?? 4;
    this.u.uDetail.value = t === 0 ? 0.6 : 1;
    if (r === this.res) return;
    this.res = r;
    for (const b of this.blocks) {
      this.drop(b);
      b.dirty = true;
    }
  }
  private drop(b: Block): void {
    if (b.mesh) this.group.remove(b.mesh);
    b.geo?.dispose();
    b.mesh = null;
    b.geo = null;
    b.ht = null;
    b.htDirty = true;
  }
  terrainEdited(x0: number, z0: number, x1: number, z1: number): void {
    const S = RC * WCS;
    for (let bz = Math.max(0, Math.floor((z0 - 1) / S)); bz <= Math.min(NB - 1, Math.floor((z1 + 1) / S)); bz++)
      for (let bx = Math.max(0, Math.floor((x0 - 1) / S)); bx <= Math.min(NB - 1, Math.floor((x1 + 1) / S)); bx++) {
        const b = this.blocks[bz * NB + bx];
        b.htDirty = true;
        b.dirty = true;
      }
  }
  markAll(): void {
    for (const b of this.blocks) b.dirty = true;
  }

  /** consome os ladrilhos mudados da simulação e refaz até `budget` blocos (os mais perto da câmera) */
  update(time: number, cam: THREE.Vector3): void {
    this.u.uTime.value = time;
    const chg = this.sim.chgR;
    for (let t = 0; t < TN * TN; t++) {
      if (!chg[t]) continue;
      chg[t] = 0;
      const tx = t % TN;
      const tz = (t / TN) | 0;
      const bx = (tx / TPB) | 0;
      const bz = (tz / TPB) | 0;
      this.blocks[bz * NB + bx].dirty = true;
      // ladrilho na borda do bloco: o vizinho interpola com ele
      if (tx % TPB === 0 && bx > 0) this.blocks[bz * NB + bx - 1].dirty = true;
      if (tx % TPB === TPB - 1 && bx < NB - 1) this.blocks[bz * NB + bx + 1].dirty = true;
      if (tz % TPB === 0 && bz > 0) this.blocks[(bz - 1) * NB + bx].dirty = true;
      if (tz % TPB === TPB - 1 && bz < NB - 1) this.blocks[(bz + 1) * NB + bx].dirty = true;
    }
    let n = this.budget;
    while (n-- > 0) {
      let best: Block | null = null;
      let bd = 1e18;
      const S = RC * WCS;
      for (const b of this.blocks) {
        if (!b.dirty) continue;
        const dx = (b.bx + 0.5) * S - cam.x;
        const dz = (b.bz + 0.5) * S - cam.z;
        const d = dx * dx + dz * dz;
        if (d < bd) {
          bd = d;
          best = b;
        }
      }
      if (!best) break;
      this.build(best);
    }
  }
  /** refaz tudo agora (carregar, testes) */
  rebuildAll(): void {
    for (const b of this.blocks) this.build(b);
  }

  private fields(c0: number, r0: number, c1: number, r1: number): void {
    const s = this.sim;
    const D = s.d;
    const B = s.b;
    for (let j = r0; j <= r1; j++)
      for (let i = c0; i <= c1; i++) {
        const k = j * WN + i;
        const d = D[k];
        if (d > 0.003) {
          this.eta[k] = B[k] + d;
          const vx = s.ux[k];
          const vz = s.uz[k];
          const sp = Math.sqrt(vx * vx + vz * vz);
          let f = Math.max(0, (sp - 1.6) * 0.2);
          // frente da onda: lâmina rasa andando
          if (d < 0.1 && sp > 0.35) f = Math.max(f, 0.3);
          // queda: vizinho bem mais baixo
          this.foam[k] = Math.min(0.75, f);
          const c = s.sed[k] / (d * WA);
          this.mud[k] = Math.min(1, c * 10 + Math.max(0, sp - 0.4) * 0.22);
        } else {
          let se = 0;
          let n = 0;
          let sm = 0;
          for (let b = -1; b <= 1; b++)
            for (let a = -1; a <= 1; a++) {
              if (!a && !b) continue;
              const ii = i + a;
              const jj = j + b;
              if (ii < 0 || jj < 0 || ii >= WN || jj >= WN) continue;
              const kk = jj * WN + ii;
              if (D[kk] > 0.003) {
                se += B[kk] + D[kk];
                sm += this.mud[kk];
                n++;
              }
            }
          this.eta[k] = n ? Math.min(se / n, B[k] + 0.25) : NaN;
          this.foam[k] = 0;
          this.mud[k] = n ? sm / n : 0;
        }
      }
  }

  private build(b: Block): void {
    b.dirty = false;
    const r = this.res;
    const nq = RC * r;
    const nv = nq + 1;
    const c0 = b.bx * RC;
    const r0 = b.bz * RC;
    // há água no bloco (ou na borda)?
    const s = this.sim;
    let any = false;
    for (let j = Math.max(0, r0 - 1); j <= Math.min(WN - 1, r0 + RC) && !any; j++) for (let i = Math.max(0, c0 - 1); i <= Math.min(WN - 1, c0 + RC); i++) if (s.d[j * WN + i] > 0.003) { any = true; break; }
    b.any = any;
    if (!any) {
      if (b.mesh) b.mesh.visible = false;
      return;
    }
    this.fields(Math.max(0, c0 - 2), Math.max(0, r0 - 2), Math.min(WN - 1, c0 + RC + 1), Math.min(WN - 1, r0 + RC + 1));
    if (!b.geo) {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(nv * nv * 3);
      const step = WCS / r;
      for (let q = 0; q < nv; q++)
        for (let p = 0; p < nv; p++) {
          pos[(q * nv + p) * 3] = c0 * WCS + p * step;
          pos[(q * nv + p) * 3 + 2] = r0 * WCS + q * step;
        }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aW', new THREE.BufferAttribute(new Float32Array(nv * nv * 4), 4).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aMud', new THREE.BufferAttribute(new Float32Array(nv * nv), 1).setUsage(THREE.DynamicDrawUsage));
      geo.setIndex(new THREE.BufferAttribute(new Uint16Array(nq * nq * 6), 1).setUsage(THREE.DynamicDrawUsage));
      const mesh = new THREE.Mesh(geo, this.mat);
      mesh.matrixAutoUpdate = false;
      mesh.renderOrder = 2;
      this.group.add(mesh);
      b.geo = geo;
      b.mesh = mesh;
      b.ht = new Float32Array(nv * nv);
      b.htDirty = true;
    }
    const geo = b.geo!;
    const P = geo.getAttribute('position').array as Float32Array;
    const Wt = geo.getAttribute('aW').array as Float32Array;
    const M = geo.getAttribute('aMud').array as Float32Array;
    const ht = b.ht!;
    if (b.htDirty) {
      b.htDirty = false;
      for (let q = 0; q < nv; q++) for (let p = 0; p < nv; p++) ht[q * nv + p] = this.T.heightAt(P[(q * nv + p) * 3], P[(q * nv + p) * 3 + 2]);
    }
    const E = this.eta;
    let lo = 1e9;
    let hi = -1e9;
    const wetV = WET;
    if (wetV.length < nv * nv) WET = new Uint8Array(nv * nv);
    const wv = WET;
    for (let q = 0; q < nv; q++) {
      const fz = (r0 * WCS + (q * WCS) / r) / WCS - 0.5;
      let j = Math.floor(fz);
      let tz = fz - j;
      if (j < 0) {
        j = 0;
        tz = 0;
      } else if (j >= WN - 1) {
        j = WN - 2;
        tz = 1;
      }
      for (let p = 0; p < nv; p++) {
        const fx = (c0 * WCS + (p * WCS) / r) / WCS - 0.5;
        let i = Math.floor(fx);
        let tx = fx - i;
        if (i < 0) {
          i = 0;
          tx = 0;
        } else if (i >= WN - 1) {
          i = WN - 2;
          tx = 1;
        }
        const k = j * WN + i;
        const w00 = (1 - tx) * (1 - tz);
        const w10 = tx * (1 - tz);
        const w01 = (1 - tx) * tz;
        const w11 = tx * tz;
        let ws = 0;
        let e = 0;
        let vx = 0;
        let vz = 0;
        let fo = 0;
        let mu = 0;
        const acc = (kk: number, w: number) => {
          const v = E[kk];
          if (v === v && w > 0) {
            ws += w;
            e += v * w;
            vx += s.ux[kk] * w;
            vz += s.uz[kk] * w;
            fo += this.foam[kk] * w;
            mu += this.mud[kk] * w;
          }
        };
        acc(k, w00);
        acc(k + 1, w10);
        acc(k + WN, w01);
        acc(k + WN + 1, w11);
        const v = q * nv + p;
        const g = ht[v];
        let y: number;
        let dep = 0;
        if (ws > 0.02) {
          e /= ws;
          dep = e - g;
          y = dep > 0 ? e : g - 0.12;
          vx /= ws;
          vz /= ws;
          fo /= ws;
          mu /= ws;
        } else {
          y = g - 0.12;
          vx = vz = fo = mu = 0;
        }
        P[v * 3 + 1] = y;
        Wt[v * 4] = dep;
        Wt[v * 4 + 1] = vx;
        Wt[v * 4 + 2] = vz;
        Wt[v * 4 + 3] = fo;
        M[v] = mu;
        wv[v] = dep > 0.003 ? 1 : 0;
        if (y < lo) lo = y;
        if (y > hi) hi = y;
      }
    }
    // índices: só quadras com algum canto molhado
    const I = geo.getIndex()!.array as Uint16Array;
    let n = 0;
    for (let q = 0; q < nq; q++)
      for (let p = 0; p < nq; p++) {
        const a = q * nv + p;
        if (!(wv[a] | wv[a + 1] | wv[a + nv] | wv[a + nv + 1])) continue;
        if ((p + q) & 1) {
          I[n++] = a;
          I[n++] = a + nv;
          I[n++] = a + 1;
          I[n++] = a + 1;
          I[n++] = a + nv;
          I[n++] = a + nv + 1;
        } else {
          I[n++] = a;
          I[n++] = a + nv;
          I[n++] = a + nv + 1;
          I[n++] = a;
          I[n++] = a + nv + 1;
          I[n++] = a + 1;
        }
      }
    geo.setDrawRange(0, n);
    geo.getIndex()!.needsUpdate = true;
    geo.getAttribute('position').needsUpdate = true;
    geo.getAttribute('aW').needsUpdate = true;
    geo.getAttribute('aMud').needsUpdate = true;
    const half = (RC * WCS) / 2;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(c0 * WCS + half, (lo + hi) / 2, r0 * WCS + half), Math.hypot(half * 1.42, (hi - lo) / 2 + 1));
    b.mesh!.visible = n > 0;
  }

  /** luz/céu seguem o mundo */
  setLight(sun: THREE.Vector3, sky: THREE.Color, k: number): void {
    this.u.uSun.value.copy(sun).normalize();
    this.u.uSky.value.copy(sky);
    this.u.uLight.value = k;
  }

  dispose(): void {
    for (const b of this.blocks) this.drop(b);
    this.mat.dispose();
  }
}
let WET = new Uint8Array(33 * 33);
