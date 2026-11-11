/* ============================================================
 *  BICHOS — desenho.
 *  · 1 InstancedMesh por espécie (modelo procedural, perto)
 *  · animação sem esqueleto no vertex shader (pernas, cabeça, pescoço,
 *    cauda, asas, nado, sono, bote, achatamento, piscar de dano, fantasma)
 *  · impostores (atlas renderizado 1× no início) para longe: 1 draw call
 *  · sombras de bolha: 1 draw call
 * ============================================================ */
import * as THREE from 'three';
import { buildModel, type MobModel } from './model';
import type { MobDef } from './types';

/** relógio compartilhado do shader (s) */
export const mobTime = { value: 0 };

const V_COMMON = /* glsl */ `#include <common>
uniform float uTime;
uniform vec4 uNeck;
uniform vec4 uDim;
attribute vec4 aPivot;
attribute float aGlow;
attribute vec4 iA;
attribute vec4 iB;
attribute vec4 iC;
varying float vGlow;
varying float vFlash;
varying float vGhost;
mat3 mobRX(float a){ float c=cos(a), s=sin(a); return mat3(1.0,0.0,0.0, 0.0,c,s, 0.0,-s,c); }
mat3 mobRY(float a){ float c=cos(a), s=sin(a); return mat3(c,0.0,-s, 0.0,1.0,0.0, s,0.0,c); }
mat3 mobRZ(float a){ float c=cos(a), s=sin(a); return mat3(c,s,0.0, -s,c,0.0, 0.0,0.0,1.0); }
`;

const V_BEGIN = /* glsl */ `
vec3 transformed = position;
{
  float part = aPivot.w;
  vec3 pv = aPivot.xyz;
  float t = uTime + iC.w * 37.0;
  float cyc = iA.x, gait = iA.y, slp = iA.z;
  float neckA = iB.x, flap = iB.y, swim = iB.z, lunge = iB.w;
  float H = uDim.x;
  // pernas (e braços): balanço em pares diagonais; dobram dormindo
  if (part > 1.5 && part < 5.5) {
    float ph = (part < 2.5 || part > 4.5) ? 0.0 : 3.14159;
    float a = sin(cyc + ph) * 0.7 * gait * (1.0 - slp);
    if (part > 3.5) a -= flap * 2.4 * uDim.z;
    transformed = mobRX(a) * (transformed - pv) + pv;
    transformed.y = mix(transformed.y, pv.y + (transformed.y - pv.y) * 0.3, slp);
  }
  // cauda abana
  if (part > 5.5 && part < 6.5) {
    float a = sin(t * (3.0 + gait * 6.0 + swim * 6.0)) * (0.22 + gait * 0.2 + swim * 0.45);
    transformed = mobRY(a) * (transformed - pv) + pv;
  }
  // asas batem
  if (part > 6.5 && part < 8.5) {
    float s = part < 7.5 ? -1.0 : 1.0;
    float a = (sin(t * (11.0 + flap * 6.0)) * 0.95 + 0.2) * flap + sin(t * 2.0) * 0.06;
    transformed = mobRZ(s * a) * (transformed - pv) + pv;
  }
  bool isHead = (part > 0.5 && part < 1.5) || (part > 8.5 && part < 9.5);
  if (isHead) {
    float hp = neckA * (uNeck.w > 0.5 ? 0.35 : 0.75) + sin(t * 1.7) * 0.06 + slp * 0.4 + lunge * 0.35;
    vec3 q = transformed - pv;
    if (part > 8.5) q = mobRZ(sin(t * 5.0 + pv.x * 7.0) * 0.1) * q;
    q = mobRY(iC.z) * mobRX(hp) * q;
    transformed = q + pv;
  }
  if ((isHead || part > 9.5) && uNeck.w > 0.5) {
    transformed = mobRX(neckA * 0.85) * (transformed - uNeck.xyz) + uNeck.xyz;
  }
  // corpo inteiro: respiração, sacolejo do passo, nado, sono, achatamento, bote
  transformed.y *= 1.0 + sin(t * 2.3) * 0.018;
  transformed.y += abs(sin(cyc)) * 0.06 * H * gait;
  transformed.x += sin(transformed.z * 5.0 / max(H, 0.25) - t * 7.0) * 0.07 * H * swim;
  transformed.y *= 1.0 - 0.2 * slp;
  float sq = iC.y;
  transformed.y *= 1.0 + sq;
  transformed.xz *= 1.0 - sq * 0.45;
  transformed = mobRX(lunge * 0.22) * transformed;
  vGlow = aGlow;
  vFlash = iA.w;
  vGhost = iC.x;
}
`;

const F_COMMON = /* glsl */ `#include <common>
varying float vGlow;
varying float vFlash;
varying float vGhost;
`;

function mobMaterial(model: MobModel, legsSwingUp: number): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const uNeck = { value: model.neck };
  const uDim = { value: new THREE.Vector4(model.height, model.halfW, legsSwingUp, 0) };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = mobTime;
    sh.uniforms.uNeck = uNeck;
    sh.uniforms.uDim = uDim;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', V_COMMON).replace('#include <begin_vertex>', V_BEGIN);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', F_COMMON)
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        if (vGhost > 0.01) { vec2 gf = floor(gl_FragCoord.xy); float gn = fract(52.9829189 * fract(dot(gf, vec2(0.06711056, 0.00583715)))); if (gn < vGhost) discard; }`,
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vColor.rgb * vGlow;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.92, 0.9), vFlash * 0.75);');
  };
  m.customProgramCacheKey = () => 'bloop-mob-v1';
  return m;
}

const IMP_V = /* glsl */ `
attribute vec4 iImp;
uniform vec2 uGrid;
varying vec2 vUv;
#include <fog_pars_vertex>
void main() {
  vec4 c = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec3 right = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]));
  vec3 wp = c.xyz + right * (position.x * iImp.y) + vec3(0.0, (position.y - 0.04) * iImp.z, 0.0);
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float col = mod(iImp.x, uGrid.x);
  float row = floor(iImp.x / uGrid.x);
  vec2 u = vec2(iImp.w > 0.5 ? 1.0 - uv.x : uv.x, uv.y);
  vUv = (vec2(col, row) + u) / uGrid;
  #include <fog_vertex>
}`;
const IMP_F = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uLight;
varying vec2 vUv;
#include <fog_pars_fragment>
void main() {
  vec4 c = texture2D(uAtlas, vUv);
  if (c.a < 0.5) discard;
  gl_FragColor = vec4(c.rgb * uLight, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

class SpeciesMesh {
  mesh: THREE.InstancedMesh;
  n = 0;
  cap = 0;
  iA!: THREE.InstancedBufferAttribute;
  iB!: THREE.InstancedBufferAttribute;
  iC!: THREE.InstancedBufferAttribute;
  constructor(
    readonly model: MobModel,
    readonly mat: THREE.Material,
    private scene: THREE.Scene,
  ) {
    this.mesh = this.make(8);
  }
  private make(cap: number): THREE.InstancedMesh {
    const g = this.model.geo;
    const old = this.cap ? { a: this.iA, b: this.iB, c: this.iC } : null;
    this.cap = cap;
    this.iA = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.iB = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.iC = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    for (const a of [this.iA, this.iB, this.iC]) a.setUsage(THREE.DynamicDrawUsage);
    if (old) {
      this.iA.array.set(old.a.array as Float32Array);
      this.iB.array.set(old.b.array as Float32Array);
      this.iC.array.set(old.c.array as Float32Array);
    }
    g.setAttribute('iA', this.iA);
    g.setAttribute('iB', this.iB);
    g.setAttribute('iC', this.iC);
    const m = new THREE.InstancedMesh(g, this.mat, cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.count = 0;
    m.frustumCulled = false;
    m.setColorAt(0, new THREE.Color(1, 1, 1));
    m.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(m);
    return m;
  }
  begin(): void {
    this.n = 0;
  }
  ensure(): void {
    if (this.n < this.cap) return;
    const old = this.mesh;
    const nm = this.make(this.cap * 2);
    (nm.instanceMatrix.array as Float32Array).set(old.instanceMatrix.array as Float32Array);
    (nm.instanceColor!.array as Float32Array).set(old.instanceColor!.array as Float32Array);
    this.scene.remove(old);
    old.dispose();
    this.mesh = nm;
  }
  end(): void {
    const m = this.mesh;
    m.count = this.n;
    m.visible = this.n > 0;
    if (!this.n) return;
    m.instanceMatrix.clearUpdateRanges();
    m.instanceMatrix.addUpdateRange(0, this.n * 16);
    m.instanceMatrix.needsUpdate = true;
    for (const a of [this.iA, this.iB, this.iC, m.instanceColor!]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.n * a.itemSize);
      a.needsUpdate = true;
    }
  }
  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.dispose();
  }
}

/** pose de animação de uma instância (12 números: iA, iB, iC) */
export interface Pose {
  cycle: number;
  gait: number;
  sleep: number;
  flash: number;
  neck: number;
  flap: number;
  swim: number;
  lunge: number;
  ghost: number;
  squash: number;
  headYaw: number;
  seed: number;
}

const TILE = 128;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _e = new THREE.Euler();

export class MobRenderer {
  readonly models: MobModel[] = [];
  private meshes: SpeciesMesh[] = [];
  private imp: THREE.InstancedMesh;
  private impA: THREE.InstancedBufferAttribute;
  private impN = 0;
  private impCap = 0;
  private impMat: THREE.ShaderMaterial;
  private atlas: THREE.WebGLRenderTarget | null = null;
  /** tamanho (m) do quadro do impostor por espécie */
  private impS: number[] = [];
  private shadow: THREE.InstancedMesh;
  private shN = 0;
  private shCap = 0;
  readonly group = new THREE.Group();
  /** estatísticas do último quadro */
  stats = { near: 0, far: 0, draws: 0, tris: 0 };

  constructor(
    private scene: THREE.Scene,
    private renderer: THREE.WebGLRenderer,
    readonly defs: MobDef[],
  ) {
    scene.add(this.group);
    for (const d of defs) {
      const model = buildModel(d.plan, d.kind === 'monster');
      this.models.push(model);
      const swingUp = d.plan.arms && d.plan.form === 'biped' ? 1 : 0;
      this.meshes.push(new SpeciesMesh(model, mobMaterial(model, swingUp), this.group as unknown as THREE.Scene));
    }
    // impostores
    const pg = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    this.impMat = new THREE.ShaderMaterial({
      vertexShader: IMP_V,
      fragmentShader: IMP_F,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uAtlas: { value: null }, uGrid: { value: new THREE.Vector2(16, 8) }, uLight: { value: 1 } }]),
      fog: true,
    });
    this.impCap = 64;
    this.impA = new THREE.InstancedBufferAttribute(new Float32Array(this.impCap * 4), 4);
    pg.setAttribute('iImp', this.impA);
    this.imp = new THREE.InstancedMesh(pg, this.impMat, this.impCap);
    this.imp.frustumCulled = false;
    this.imp.count = 0;
    this.group.add(this.imp);
    // sombras de bolha
    const cg = new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2);
    const sm = new THREE.MeshBasicMaterial({ color: 0x1a1030, transparent: true, opacity: 0.22, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.shCap = 128;
    this.shadow = new THREE.InstancedMesh(cg, sm, this.shCap);
    this.shadow.frustumCulled = false;
    this.shadow.count = 0;
    this.shadow.renderOrder = 1;
    this.group.add(this.shadow);
    this.buildAtlas();
  }

  /** renderiza todas as espécies (vista 3/4 de lado) num atlas 16×N de 128 px */
  private buildAtlas(): void {
    const n = this.defs.length;
    const cols = 16;
    const rows = Math.max(1, Math.ceil(n / cols));
    const rowsP2 = 1 << Math.ceil(Math.log2(rows));
    const rt = new THREE.WebGLRenderTarget(cols * TILE, rowsP2 * TILE, { magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, generateMipmaps: false });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xffffff, 0x8a7aa0, 2.2));
    const dl = new THREE.DirectionalLight(0xffffff, 1.6);
    dl.position.set(3, 6, 4);
    sc.add(dl);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    const r = this.renderer;
    const prevRT = r.getRenderTarget();
    const prevClear = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();
    const prevAuto = r.autoClear;
    const prevVp = new THREE.Vector4();
    r.getViewport(prevVp);
    const prevSc = new THREE.Vector4();
    r.getScissor(prevSc);
    const prevScT = r.getScissorTest();
    r.setRenderTarget(rt);
    r.setClearColor(0x000000, 0);
    r.autoClear = false;
    r.clear();
    r.setScissorTest(true);
    for (let i = 0; i < n; i++) {
      const md = this.models[i];
      const S = Math.max(md.height * 1.08, md.halfW * 2.1, 0.3);
      this.impS.push(S);
      if (this.defs[i].kind === 'boss') continue;
      const sm = this.meshes[i];
      sm.begin();
      sm.ensure();
      this.writeInst(sm, 0, _m.identity(), 1, 1, 1, null);
      sm.n = 1;
      sm.end();
      sm.mesh.removeFromParent();
      sc.add(sm.mesh);
      cam.left = -S / 2;
      cam.right = S / 2;
      cam.bottom = -S / 2;
      cam.top = S / 2;
      cam.updateProjectionMatrix();
      cam.position.set(S * 2.2, S * 0.71, S * 0.9);
      cam.lookAt(0, S * 0.46, 0);
      const col = i % cols;
      const row = Math.floor(i / cols);
      r.setViewport(col * TILE, row * TILE, TILE, TILE);
      r.setScissor(col * TILE, row * TILE, TILE, TILE);
      r.render(sc, cam);
      sc.remove(sm.mesh);
      this.group.add(sm.mesh);
      sm.begin();
      sm.end();
    }
    r.setScissorTest(prevScT);
    r.setScissor(prevSc);
    r.setViewport(prevVp);
    r.setRenderTarget(prevRT);
    r.setClearColor(prevClear, prevAlpha);
    r.autoClear = prevAuto;
    this.atlas = rt;
    this.impMat.uniforms.uAtlas.value = rt.texture;
    (this.impMat.uniforms.uGrid.value as THREE.Vector2).set(cols, rowsP2);
  }

  /** textura do atlas (para depuração) */
  atlasTexture(): THREE.Texture | null {
    return this.atlas?.texture ?? null;
  }

  begin(): void {
    for (const m of this.meshes) m.begin();
    this.impN = 0;
    this.shN = 0;
    this.stats.near = 0;
    this.stats.far = 0;
  }

  private writeInst(sm: SpeciesMesh, i: number, m: THREE.Matrix4, r: number, g: number, b: number, p: Pose | null): void {
    sm.mesh.setMatrixAt(i, m);
    sm.mesh.setColorAt(i, _c.setRGB(r, g, b));
    const A = sm.iA.array as Float32Array;
    const B = sm.iB.array as Float32Array;
    const C = sm.iC.array as Float32Array;
    const o = i * 4;
    if (!p) {
      A.fill(0, o, o + 4);
      B.fill(0, o, o + 4);
      C.fill(0, o, o + 4);
      return;
    }
    A[o] = p.cycle;
    A[o + 1] = p.gait;
    A[o + 2] = p.sleep;
    A[o + 3] = p.flash;
    B[o] = p.neck;
    B[o + 1] = p.flap;
    B[o + 2] = p.swim;
    B[o + 3] = p.lunge;
    C[o] = p.ghost;
    C[o + 1] = p.squash;
    C[o + 2] = p.headYaw;
    C[o + 3] = p.seed;
  }

  /** modelo 3D (perto) */
  pushNear(sp: number, x: number, y: number, z: number, yaw: number, scale: number, pose: Pose, tint = 1, pitch = 0, roll = 0): void {
    const sm = this.meshes[sp];
    sm.ensure();
    _q.setFromEuler(_e.set(pitch, yaw, roll, 'YXZ'));
    _m.compose(_p.set(x, y, z), _q, _s.set(scale, scale, scale));
    this.writeInst(sm, sm.n, _m, tint, tint, tint, pose);
    sm.n++;
    this.stats.near++;
  }

  /** impostor (longe). flip = true quando o bicho olha para a direita da câmera */
  pushFar(sp: number, x: number, y: number, z: number, scale: number, flip: boolean): void {
    if (this.impN >= this.impCap) this.growImp();
    const S = this.impS[sp] * scale;
    _m.makeTranslation(x, y, z);
    this.imp.setMatrixAt(this.impN, _m);
    const a = this.impA.array as Float32Array;
    const o = this.impN * 4;
    a[o] = sp;
    a[o + 1] = S;
    a[o + 2] = S;
    a[o + 3] = flip ? 1 : 0;
    this.impN++;
    this.stats.far++;
  }

  pushShadow(x: number, y: number, z: number, r: number): void {
    if (this.shN >= this.shCap) {
      const old = this.shadow;
      this.shCap *= 2;
      const nm = new THREE.InstancedMesh(old.geometry, old.material, this.shCap);
      (nm.instanceMatrix.array as Float32Array).set(old.instanceMatrix.array as Float32Array);
      nm.frustumCulled = false;
      nm.renderOrder = 1;
      this.group.remove(old);
      this.group.add(nm);
      this.shadow = nm;
    }
    _m.compose(_p.set(x, y + 0.04, z), _q.identity(), _s.set(r, 1, r));
    this.shadow.setMatrixAt(this.shN++, _m);
  }

  private growImp(): void {
    const old = this.imp;
    const cap = this.impCap * 2;
    const na = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    na.array.set(this.impA.array as Float32Array);
    const g = old.geometry;
    g.setAttribute('iImp', na);
    const nm = new THREE.InstancedMesh(g, this.impMat, cap);
    (nm.instanceMatrix.array as Float32Array).set(old.instanceMatrix.array as Float32Array);
    nm.frustumCulled = false;
    this.group.remove(old);
    this.group.add(nm);
    this.imp = nm;
    this.impA = na;
    this.impCap = cap;
  }

  end(): void {
    let draws = 0;
    let tris = 0;
    for (const m of this.meshes) {
      m.end();
      if (m.n) {
        draws++;
        tris += (m.model.geo.getAttribute('position').count / 3) * m.n;
      }
    }
    this.imp.count = this.impN;
    this.imp.visible = this.impN > 0;
    if (this.impN) {
      this.imp.instanceMatrix.needsUpdate = true;
      this.impA.needsUpdate = true;
      draws++;
      tris += this.impN * 2;
    }
    this.shadow.count = this.shN;
    this.shadow.visible = this.shN > 0;
    if (this.shN) {
      this.shadow.instanceMatrix.needsUpdate = true;
      draws++;
    }
    this.stats.draws = draws;
    this.stats.tris = Math.round(tris);
  }

  /** luz do dia nos impostores (0.25 noite .. 1 dia) */
  setLight(k: number): void {
    this.impMat.uniforms.uLight.value = k;
  }

  dispose(): void {
    for (const m of this.meshes) {
      m.dispose();
      m.model.geo.dispose();
      m.mat.dispose();
    }
    this.imp.geometry.dispose();
    this.impMat.dispose();
    this.shadow.geometry.dispose();
    (this.shadow.material as THREE.Material).dispose();
    this.atlas?.dispose();
    this.scene.remove(this.group);
  }
}
