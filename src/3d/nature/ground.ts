/* ============================================================
 *  NATUREZA — chão e ambiente:
 *  - groundDetail: textura de "grama miúda" projetada no mundo
 *    (triplanar barata) multiplicando a cor por vértice: quebra as
 *    áreas lisas gigantes sem custo de geometria;
 *  - SkyDome: céu em degradê (topo → horizonte = cor da neblina);
 *  - BlobShadows: sombras de contato borradas (uma InstancedMesh).
 * ============================================================ */
import * as THREE from 'three';
import { hash2, vnoise2 } from './noise';
import { leafAtlas } from './leaves';
import { natureTextureArray } from './textures';

let detailTex: THREE.DataTexture | null = null;
/** textura 128² cinza (média 0,5): manchas + tracinhos de grama, repete sem emenda */
export function groundDetailTexture(): THREE.DataTexture {
  if (detailTex) return detailTex;
  const N = 128;
  const d = new Uint8Array(N * N * 4);
  const v = new Float32Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      // ruído periódico (período N): manchas médias + grão fino
      const f = (sx: number, sy: number, per: number, s: number) => {
        const px = (sx / N) * per;
        const py = (sy / N) * per;
        const xi = Math.floor(px);
        const yi = Math.floor(py);
        const fx = px - xi;
        const fy = py - yi;
        const ux = fx * fx * (3 - 2 * fx);
        const uy = fy * fy * (3 - 2 * fy);
        const h = (i: number, j: number) => hash2(((i % per) + per) % per, ((j % per) + per) % per, s);
        const a = h(xi, yi);
        const b = h(xi + 1, yi);
        const c = h(xi, yi + 1);
        const e = h(xi + 1, yi + 1);
        return a + (b - a) * ux + (c - a) * uy + (a - b - c + e) * ux * uy;
      };
      v[y * N + x] = f(x, y, 4, 1) * 0.35 + f(x, y, 16, 2) * 0.35 + f(x, y, 64, 3) * 0.3;
    }
  // tracinhos (folhinhas vistas de cima): pontos escuros/claros alongados
  for (let k = 0; k < 900; k++) {
    const x = Math.floor(hash2(k, 1, 9) * N);
    const y = Math.floor(hash2(k, 2, 9) * N);
    const dk = hash2(k, 3, 9) < 0.5 ? -0.16 : 0.12;
    const dir = hash2(k, 4, 9) < 0.5 ? 1 : N;
    for (let s = 0; s < 3; s++) {
      const i = (y * N + x + s * dir) % (N * N);
      v[i] += dk * (1 - s * 0.25);
    }
  }
  let mn = 1e9;
  let mx = -1e9;
  for (let i = 0; i < v.length; i++) {
    if (v[i] < mn) mn = v[i];
    if (v[i] > mx) mx = v[i];
  }
  let mean = 0;
  for (let i = 0; i < v.length; i++) mean += (v[i] - mn) / (mx - mn);
  mean /= v.length;
  for (let i = 0; i < v.length; i++) {
    const t = Math.max(0, Math.min(1, 0.5 + ((v[i] - mn) / (mx - mn) - mean)));
    const b = Math.round(t * 255);
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = b;
    d[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  detailTex = t;
  return t;
}

/** filtro anisotrópico (até 4×) nas texturas da natureza: chão sem borrão listrado em ângulo rasante */
export function natureAnisotropy(r: THREE.WebGLRenderer): void {
  const a = Math.min(4, r.capabilities.getMaxAnisotropy());
  for (const t of [groundDetailTexture(), leafAtlas(), natureTextureArray()] as THREE.Texture[]) {
    if (t.anisotropy !== a) {
      t.anisotropy = a;
      t.needsUpdate = true;
    }
  }
}

export interface DetailOpts {
  /** força do detalhe fino (0..1) */
  amount?: number;
  /** escala do detalhe fino (repetições por m) */
  scale?: number;
  /** manchas grandes (2ª amostra) — desligue no nível mínimo */
  macro?: boolean;
}

/** multiplica a cor do material por textura projetada no mundo (escolhe o plano pela normal) */
export function groundDetail(mat: THREE.Material, o: DetailOpts = {}): void {
  const amt = o.amount ?? 0.5;
  const sc = o.scale ?? 0.5;
  const macro = o.macro ?? true;
  const tex = groundDetailTexture();
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    sh.uniforms.uGTex = { value: tex };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGW;\nvarying vec3 vGN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvGN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uGTex;\nvarying vec3 vGW;\nvarying vec3 vGN;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  vec3 an = abs(vGN);
  vec2 guv = an.y > 0.6 ? vGW.xz : (an.x > an.z ? vGW.zy : vGW.xy);
  float gd = texture2D(uGTex, guv * ${sc.toFixed(3)}).r;
  ${macro ? `gd = gd * 0.6 + texture2D(uGTex, guv * ${(sc * 0.11).toFixed(4)} + vec2(0.37, 0.71)).r * 0.4;` : ''}
  diffuseColor.rgb *= 1.0 + (gd - 0.5) * ${(amt * 1.4).toFixed(3)};
}`,
      );
  };
  const key = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => key() + `gd${amt}_${sc}_${macro ? 1 : 0}`;
}

/* ------------------------------ céu ------------------------------ */

export class SkyDome {
  readonly mesh: THREE.Mesh;
  readonly top = new THREE.Color('#5aa8e8');
  readonly horizon = new THREE.Color('#cfeaf2');
  readonly sunDir = new THREE.Vector3(0.45, 0.6, 0.3).normalize();
  readonly sunCol = new THREE.Color('#fff2c8');
  constructor() {
    const g = new THREE.SphereGeometry(1, 20, 12);
    const m = new THREE.ShaderMaterial({
      uniforms: { uTop: { value: this.top }, uHor: { value: this.horizon }, uSun: { value: this.sunDir }, uSunC: { value: this.sunCol } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uSun; uniform vec3 uSunC; varying vec3 vD;
void main(){
  vec3 d = normalize(vD);
  float h = clamp(d.y, -1.0, 1.0);
  vec3 c = mix(uHor, uTop, smoothstep(0.0, 0.55, h));
  float s = max(0.0, dot(d, uSun));
  c += uSunC * (pow(s, 64.0) * 0.6 + pow(s, 6.0) * 0.12);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
  }
  /** acompanha a câmera (chamar por quadro); o raio fica dentro do plano distante */
  follow(cam: THREE.PerspectiveCamera): void {
    this.mesh.position.copy(cam.position);
    this.mesh.scale.setScalar(cam.far * 0.8);
  }
  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/* ------------------------------ sombras de contato ------------------------------ */

let blobTex: THREE.DataTexture | null = null;
function blobTexture(): THREE.DataTexture {
  if (blobTex) return blobTex;
  const N = 64;
  const d = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = (x + 0.5) / N - 0.5;
      const dy = (y + 0.5) / N - 0.5;
      const r = Math.hypot(dx, dy) * 2;
      const a = r >= 1 ? 0 : Math.pow(1 - r * r, 1.6) * (0.85 + 0.15 * vnoise2(x * 0.3, y * 0.3, 4));
      const i = (y * N + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 0;
      d[i + 3] = Math.round(a * 255);
    }
  blobTex = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
  blobTex.magFilter = THREE.LinearFilter;
  blobTex.minFilter = THREE.LinearFilter;
  blobTex.needsUpdate = true;
  return blobTex;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _n = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** sombras redondas e borradas no chão (sob árvores, pedras...) — 1 chamada de desenho */
export class BlobShadows {
  mesh: THREE.InstancedMesh;
  private n = 0;
  constructor(
    private parent: THREE.Object3D,
    cap = 256,
    opacity = 0.38,
  ) {
    const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const m = new THREE.MeshBasicMaterial({ map: blobTexture(), color: 0x10200a, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mesh = this.make(g, m, cap);
  }
  private make(g: THREE.BufferGeometry, m: THREE.Material, cap: number): THREE.InstancedMesh {
    const im = new THREE.InstancedMesh(g, m, cap);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.count = 0;
    im.frustumCulled = false;
    im.renderOrder = 1;
    this.parent.add(im);
    return im;
  }
  set opacity(v: number) {
    (this.mesh.material as THREE.MeshBasicMaterial).opacity = v;
  }
  begin(): void {
    this.n = 0;
  }
  /** sombra de raio r em (x,y,z), deitada no plano de normal (nx,ny,nz) */
  push(x: number, y: number, z: number, r: number, nx = 0, ny = 1, nz = 0): void {
    if (this.n >= this.mesh.instanceMatrix.count) {
      const old = this.mesh;
      const nm = this.make(old.geometry, old.material as THREE.Material, Math.ceil(old.instanceMatrix.count * 1.6));
      for (let i = 0; i < this.n; i++) {
        old.getMatrixAt(i, _m);
        nm.setMatrixAt(i, _m);
      }
      this.parent.remove(old);
      old.dispose();
      this.mesh = nm;
    }
    _n.set(nx, ny, nz).normalize();
    _q.setFromUnitVectors(UP, _n);
    _m.compose(_p.set(x, y + 0.06, z), _q, _s.set(r * 2, 1, r * 2));
    this.mesh.setMatrixAt(this.n++, _m);
  }
  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose(): void {
    this.parent.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
