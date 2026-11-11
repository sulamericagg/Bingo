/* ============================================================
 *  NOITES — cena 3D: bosque instanciado, ciclo dia/noite com
 *  neblina, fogueira com luz viva, lanternas, Sombrinhas e efeitos.
 *  Orçamento por nível de qualidade (src/core/quality.ts).
 * ============================================================ */
import * as THREE from 'three';
import type { Tier } from '../../core/quality';
import { Particles } from '../../3d/common/particles';
import { SKINS } from '../../game/skins';
import { BENCH_POS, CDEFS, CK, DAY_LEN, DUSK, ITEM, WORLD_R, CAMP_R, nightInfo, TAU } from './data';
import type { Ev, Player, Sim } from './sim';
import { NK, TK, treeR } from './world';
import { ic } from './icons';
import { VehView } from './vehview';
import { BuildView } from './build/view'; // BUILD
import { BlobShadows, GrassField, LeafBurst, hitTreeShake, natureTick, windTime, NL, TL, lerpSplat, setSplat, splatAttributes, terrainMaterial, leafCardMat, natureAnisotropy, natureLeafCards, natureMat, natureQ, type GrassSource } from '../../3d/nature';
import {
  G,
  PB,
  benchGeo,
  bloopModel,
  chestGeo,
  fireBaseGeo,
  glowMat,
  glowTex,
  hatMesh,
  iconSprite,
  nodeGeo,
  shadowBodyGeo,
  stumpGeo,
  structModel,
  toolMesh,
  treeGeo,
  vcMat,
  wallTreeGeo,
  type BloopRig,
} from './models';

interface VQ {
  pr: number;
  draw: number;
  lights: number;
  spot: boolean;
  deco: number;
  particles: number;
  aa: boolean;
}
function vq(tier: Tier): VQ {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  return [
    { pr: Math.min(dpr, 0.6), draw: 42, lights: 0, spot: false, deco: 0, particles: 0.4, aa: false },
    { pr: Math.min(dpr, 0.75), draw: 55, lights: 1, spot: true, deco: 350, particles: 0.6, aa: false },
    { pr: Math.min(dpr, 1), draw: 70, lights: 2, spot: true, deco: 800, particles: 0.85, aa: false },
    { pr: Math.min(dpr, 1.5), draw: 90, lights: 4, spot: true, deco: 1400, particles: 1, aa: true },
  ][tier];
}

export interface Focus {
  x: number;
  z: number;
  r: number;
  col?: string;
}
export interface Ghost {
  id: string;
  x: number;
  z: number;
  r: number;
  ok: boolean;
}

interface PRig {
  rig: BloopRig;
  shadow: THREE.Mesh;
  tool: THREE.Object3D | null;
  toolK: string;
  hatK: string;
  beam: THREE.Mesh;
  label: THREE.Sprite | null;
  bubble: THREE.Sprite | null;
  bubbleK: string;
  bubbleT: number;
  px: number;
  pz: number;
  walk: number;
  zz: THREE.Sprite;
}
interface CRig {
  g: THREE.Group;
  body: THREE.Mesh;
  eyes: THREE.Mesh;
  px: number;
  pz: number;
  yaw: number;
  seen: boolean;
}
interface Fall {
  m: THREE.Mesh;
  t: number;
  dx: number;
  dz: number;
  /** já bateu no chão */
  hit: boolean;
  h: number;
  col: string;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _c2 = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const lerpC = (a: string, b: string, k: number) => _c.set(a).lerp(_c2.set(b), k);
const smooth = (x: number) => x * x * (3 - 2 * x);
const _gc = new THREE.Color();
const _gw = new Float32Array(NL);
/** cor das folhas por tipo de árvore (chuva de folhas) */
const TREE_LEAF = ['#56b85a', '#3a8a5c', '#5a6aa0', '#b4e070'];
const _gc2 = new THREE.Color();
const TRAILS = [0.4, 2.5, 4.6];
/** cor do chão em (x,z) e quanto cabe de grama (0 nas trilhas e no acampamento) */
function groundColor(x: number, z: number, c: THREE.Color, w: Float32Array | null = null): number {
  const d = Math.hypot(x, z);
  if (w) {
    w.fill(0);
    w[TL.grass] = 1;
    // chão de folhas em manchas e na mata funda
    const ff = Math.sin(x * 0.09 + 0.7) * Math.sin(z * 0.08 - 1.1);
    lerpSplat(w, TL.forestFloor, Math.max(0, ff - 0.2) * 1.2 + (d > 55 ? Math.min(0.8, (d - 55) / 40) : 0));
  }
  const n = Math.sin(x * 0.13) * Math.sin(z * 0.11) * 0.5 + Math.sin(x * 0.37 + z * 0.29) * 0.25;
  c.set('#5aa64a').lerp(_gc2.set('#3f8a40'), 0.5 + n * 0.5);
  // manchas de capim mais claro/seco
  const dry = Math.sin(x * 0.071 + 1.3) * Math.sin(z * 0.063 - 0.4);
  if (dry > 0.45) {
    c.lerp(_gc2.set('#9ab44a'), (dry - 0.45) * 0.9);
    if (w) lerpSplat(w, TL.dryGrass, (dry - 0.45) * 1.2);
  }
  let k = 1;
  const ang = Math.atan2(z, x);
  let trail = 1e9;
  for (const a of TRAILS) trail = Math.min(trail, Math.abs(Math.sin((ang - a) / 2)) * d);
  if (trail < 2.2 && d > CAMP_R - 2) {
    c.lerp(_gc2.set('#a88a5a'), 0.55 * (1 - trail / 2.2));
    k = Math.min(k, Math.max(0, (trail - 1.1) / 1.1));
    if (w) lerpSplat(w, TL.dirt, 0.9 * (1 - trail / 2.2));
  }
  if (d < CAMP_R - 1) {
    const s = smooth(Math.min(1, (CAMP_R - 1 - d) / 4));
    c.lerp(_gc2.set('#b8946a'), s * 0.75);
    if (w) {
      lerpSplat(w, TL.dirt, s);
      if (d < 3.2) lerpSplat(w, TL.gravel, Math.min(1, (3.2 - d) / 1.2) * 0.8);
    }
  }
  if (d < CAMP_R + 1.5) k = Math.min(k, Math.max(0, (d - CAMP_R + 1) / 2.5) * 0.7);
  if (d > 60) c.lerp(_gc2.set('#2f5a48'), Math.min(1, (d - 60) / 50) * 0.6);
  if (d > WORLD_R) c.lerp(_gc2.set('#14222a'), 0.8);
  return k;
}

export class View {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  q: VQ;
  camYaw = 0;
  camPitch = 0.46;
  camDist = 6.8;
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private fireLight: THREE.PointLight;
  private pool: THREE.PointLight[] = [];
  private spot: THREE.SpotLight | null = null;
  private sky: THREE.Mesh;
  private skyU: { top: { value: THREE.Color }; bot: { value: THREE.Color } };
  private stars: THREE.Points;
  private moon: THREE.Mesh;
  private sunDisc: THREE.Mesh;
  private ground: THREE.Mesh;
  private trees: THREE.InstancedMesh[] = [];
  private treeIdx: number[][] = [];
  private farTrees: THREE.InstancedMesh[] = [];
  private cards: THREE.InstancedMesh[] = [];
  private leafFx: LeafBurst;
  private cardMat = leafCardMat({ amp: 0.004, y0: 1, rustle: 0.03, wrap: 0.45 });
  private stumps: THREE.InstancedMesh;
  private nodes: THREE.InstancedMesh[] = [];
  private chests: THREE.InstancedMesh[] = [];
  private flames: THREE.Mesh[] = [];
  private fireBase: THREE.Mesh;
  private fireKey = '';
  private bench: THREE.Mesh;
  private benchLv = -1;
  private ring: THREE.Mesh;
  private decals: THREE.InstancedMesh;
  private focusRing: THREE.Mesh;
  private ghost: THREE.Group = new THREE.Group();
  private ghostId = '';
  private ghostMat = new THREE.MeshBasicMaterial({ color: '#7dffb0', transparent: true, opacity: 0.5, depthWrite: false });
  private parts: Particles;
  private embers: Particles;
  private players = new Map<string, PRig>();
  private cre = new Map<number, CRig>();
  private babies: { rig: BloopRig; help: THREE.Sprite; shadow: THREE.Mesh }[] = [];
  private structs = new Map<number, THREE.Object3D>();
  private flashes = new Map<number, THREE.Mesh>();
  private falls: Fall[] = [];
  private shake = new Map<number, number>();
  private fireflies: THREE.Points;
  private vv: VehView;
  /** construção em grade (peças, fantasma, barras) */
  build: BuildView; // BUILD
  private lastBuild = { x: 1e9, z: 1e9, ver: -1, verC: -1, verS: -1 };
  private time = 0;
  private sunAmt = 1;
  private bodyMats: THREE.MeshBasicMaterial[] = [];
  private eyeMat = glowMat('#ffe45c');
  private kingEye = glowMat('#ff7aff');
  private shadowGeo = new THREE.CircleGeometry(0.5, 16);
  private shadowMat = new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.28, depthWrite: false });
  private beamGeo: THREE.BufferGeometry;
  private beamMat = new THREE.MeshBasicMaterial({ color: '#fff6c0', transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  private tierNow: Tier;
  /** grama de lâminas (canteiros em volta da câmera) */
  private grass: GrassField;
  private blobs: BlobShadows;
  private treeMat = natureMat({ amp: 0.004, y0: 1, rustle: 0.03, wrap: 0.45 });

  constructor(
    private wrap: HTMLElement,
    private sim: Sim,
    tier: Tier,
  ) {
    this.tierNow = tier;
    this.q = vq(tier);
    const r = new THREE.WebGLRenderer({ antialias: this.q.aa, powerPreference: 'high-performance' });
    r.setPixelRatio(this.q.pr);
    r.setSize(wrap.clientWidth || innerWidth, wrap.clientHeight || innerHeight);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.domElement.className = 'nc-canvas';
    wrap.appendChild(r.domElement);
    this.renderer = r;
    natureAnisotropy(r);
    this.camera = new THREE.PerspectiveCamera(62, (wrap.clientWidth || innerWidth) / (wrap.clientHeight || innerHeight), 0.1, 420);
    const sc = this.scene;
    sc.fog = new THREE.Fog('#bfe6ff', 40, 120);

    this.hemi = new THREE.HemisphereLight('#cfefff', '#4a7a3a', 1);
    sc.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff4dd', 1.2);
    this.sun.position.set(30, 60, 20);
    sc.add(this.sun);
    this.fireLight = new THREE.PointLight('#ff9a40', 0, 30, 1.3);
    this.fireLight.position.set(0, 1.6, 0);
    sc.add(this.fireLight);
    for (let i = 0; i < this.q.lights; i++) {
      const l = new THREE.PointLight('#ffe39a', 0, 12, 1.4);
      sc.add(l);
      this.pool.push(l);
    }
    if (this.q.spot) {
      this.spot = new THREE.SpotLight('#fff6d0', 0, 20, 0.5, 0.45, 1.2);
      sc.add(this.spot, this.spot.target);
    }

    // céu
    this.skyU = { top: { value: new THREE.Color('#6cc4ff') }, bot: { value: new THREE.Color('#bfe6ff') } };
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(380, 24, 12),
      new THREE.ShaderMaterial({
        uniforms: this.skyU,
        side: THREE.BackSide,
        depthWrite: false,
        vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying float h; void main(){ gl_FragColor = vec4(mix(bot, top, smoothstep(-0.05, 0.5, h)), 1.0); }',
      }),
    );
    this.sky.renderOrder = -10;
    sc.add(this.sky);
    const sp: number[] = [];
    for (let i = 0; i < 500; i++) {
      const a = Math.random() * TAU;
      const e = 0.12 + Math.random() * 1.3;
      sp.push(Math.cos(a) * Math.cos(e) * 360, Math.sin(e) * 360, Math.sin(a) * Math.cos(e) * 360);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    sc.add(this.stars);
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(14, 16, 12), glowMat('#e8f0ff'));
    sc.add(this.moon);
    this.sunDisc = new THREE.Mesh(new THREE.SphereGeometry(16, 16, 12), glowMat('#fff3b0'));
    sc.add(this.sunDisc);

    // chão
    this.ground = this.buildGround();
    sc.add(this.ground);
    // muralha de árvores escuras
    const wall = new THREE.InstancedMesh(wallTreeGeo(), this.treeMat, 220);
    for (let i = 0; i < 220; i++) {
      const a = (i / 220) * TAU + Math.sin(i * 7.1) * 0.01;
      const d = WORLD_R + 3 + (i % 3) * 3.5;
      const s = 1 + ((i * 37) % 10) / 12;
      wall.setMatrixAt(i, _m.compose(_v.set(Math.cos(a) * d, 0, Math.sin(a) * d), _q.identity(), _s.set(s, s * 1.3, s)));
    }
    sc.add(wall);

    // árvores e nós (instâncias)
    const W = sim.w;
    for (let k = 0; k < 4; k++) {
      const n = W.trees.filter((t) => t.k === k).length;
      const im = new THREE.InstancedMesh(treeGeo(k as TK, tier === 0 ? 1 : 0), this.treeMat, Math.max(1, n));
      im.count = 0;
      im.frustumCulled = false;
      sc.add(im);
      this.trees.push(im);
      this.treeIdx.push([]);
      // cartões de folhas na borda das copas (Médio/Alto)
      const cg = tier >= 2 ? natureLeafCards(im.geometry, 5, k + 3) : null;
      const cm = new THREE.InstancedMesh(cg ?? new THREE.BufferGeometry(), this.cardMat, Math.max(1, n));
      cm.count = 0;
      cm.frustumCulled = false;
      cm.visible = !!cg;
      sc.add(cm);
      this.cards.push(cm);
      // longe: modelo leve (~70 tri)
      const fm = new THREE.InstancedMesh(treeGeo(k as TK, 1), this.treeMat, Math.max(1, n));
      fm.count = 0;
      fm.frustumCulled = false;
      sc.add(fm);
      this.farTrees.push(fm);
    }
    this.stumps = new THREE.InstancedMesh(stumpGeo(), vcMat(), W.trees.length);
    this.stumps.count = 0;
    this.stumps.frustumCulled = false;
    sc.add(this.stumps);
    for (let k = 0; k <= NK.Sap; k++) {
      const n = W.nodes.filter((q) => q.k === k).length;
      const im = new THREE.InstancedMesh(nodeGeo(k as NK), vcMat(), Math.max(1, n));
      im.count = 0;
      im.frustumCulled = false;
      sc.add(im);
      this.nodes.push(im);
    }
    for (let i = 0; i < 6; i++) {
      const im = new THREE.InstancedMesh(chestGeo(i >= 3, i % 3), vcMat(), W.chests.length);
      im.count = 0;
      sc.add(im);
      this.chests.push(im);
    }
    // grama de lâminas na GPU (nível Mínimo: só o chão texturizado) + sombras de contato
    const nq = natureQ(tier);
    this.grass = new GrassField(sc, this.grassSrc, nq.grass, { width: 1.7, height: 1.1 });
    this.blobs = new BlobShadows(sc, 256, nq.blobAlpha);
    this.leafFx = new LeafBurst(sc, 160);
    this.leafFx.ground = (x, z) => this.sim.w.height(x, z);

    // fogueira
    this.fireBase = new THREE.Mesh(fireBaseGeo(false, false), vcMat());
    sc.add(this.fireBase);
    const fm = [
      new THREE.MeshBasicMaterial({ color: '#ff5a1a', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
      new THREE.MeshBasicMaterial({ color: '#ffb030', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
      new THREE.MeshBasicMaterial({ color: '#fff3a0', transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    ];
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(G.cone, fm[i]);
      sc.add(f);
      this.flames.push(f);
    }
    this.bench = new THREE.Mesh(benchGeo(1), vcMat());
    this.bench.position.set(BENCH_POS[0], 0, BENCH_POS[1]);
    this.bench.rotation.y = -0.6;
    sc.add(this.bench);

    // anel da área segura + manchas de luz no chão
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 72), new THREE.MeshBasicMaterial({ color: '#ffd34a', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.06;
    sc.add(this.ring);
    this.decals = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: glowTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
      64,
    );
    this.decals.count = 0;
    this.decals.frustumCulled = false;
    this.decals.position.y = 0.04;
    sc.add(this.decals);
    this.focusRing = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 40), new THREE.MeshBasicMaterial({ color: '#fff36b', fog: false, transparent: true }));
    this.focusRing.rotation.x = -Math.PI / 2;
    this.focusRing.visible = false;
    sc.add(this.focusRing);
    sc.add(this.ghost);

    // feixe de lanterna (cone aberto: ponta na mão, base longe)
    this.beamGeo = new THREE.ConeGeometry(1, 1, 18, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2);

    // partículas
    this.parts = new Particles(500, false);
    this.parts.budget = this.q.particles;
    sc.add(this.parts.obj);
    this.embers = new Particles(160, true);
    this.embers.budget = this.q.particles;
    sc.add(this.embers.obj);
    this.vv = new VehView(sc, sim, this.parts);
    this.build = new BuildView(sc, sim, this.parts); // BUILD

    // vagalumes
    const ff: number[] = [];
    for (let i = 0; i < 70; i++) ff.push((Math.random() - 0.5) * 60, 0.5 + Math.random() * 2.5, (Math.random() - 0.5) * 60);
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(ff, 3));
    this.fireflies = new THREE.Points(fg, new THREE.PointsMaterial({ color: '#d8ff7a', size: 0.22, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    sc.add(this.fireflies);

    // Sombrinhas: materiais por tipo
    for (let k = 0; k <= CK.King; k++) this.bodyMats.push(new THREE.MeshBasicMaterial({ color: k === CK.King ? '#1a0a2a' : '#140c26', transparent: k === CK.Mist, opacity: k === CK.Mist ? 0.55 : 1 }));
    this.bodyGeo = shadowBodyGeo(false);
    this.kingGeo = shadowBodyGeo(true);
    const eg = new PB();
    for (const sx of [-1, 1]) eg.add(G.sph, '#fff', sx * 0.2, 0.68, 0.42, 0.2, 0.26, 0.1);
    this.eyeGeo = eg.geo();

    // bebês
    for (const b of sim.w.babies) {
      const rig = bloopModel({ light: b.col, dark: b.col, belly: '#ffffff', eye: '#2a1140' }, 0.5, true);
      const help = iconSprite(ic('help', 48));
      help.position.y = 2.4;
      help.scale.setScalar(1.6);
      rig.g.add(help);
      const sh = this.mkShadow(0.5);
      sc.add(rig.g, sh);
      this.babies.push({ rig, help, shadow: sh });
    }
  }
  private bodyGeo: THREE.BufferGeometry;
  private kingGeo: THREE.BufferGeometry;
  private eyeGeo: THREE.BufferGeometry;

  private mkShadow(s: number): THREE.Mesh {
    const m = new THREE.Mesh(this.shadowGeo, this.shadowMat);
    m.rotation.x = -Math.PI / 2;
    m.scale.setScalar(s);
    m.position.y = 0.03;
    return m;
  }

  private buildGround(): THREE.Mesh {
    const S = (WORLD_R + 40) * 2;
    const N = this.tierNow <= 1 ? 60 : 96;
    const g = new THREE.PlaneGeometry(S, S, N, N).rotateX(-Math.PI / 2);
    const pa = g.getAttribute('position');
    const col: number[] = [];
    const SP = splatAttributes(g, pa.count);
    const c = new THREE.Color();
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i);
      const z = pa.getZ(i);
      const d = Math.hypot(x, z);
      groundColor(x, z, c, _gw);
      col.push(c.r, c.g, c.b);
      setSplat(SP, i, _gw);
      pa.setY(i, d > WORLD_R + 2 ? (d - WORLD_R - 2) * 0.25 : this.sim.w.height(x, z));
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const gm = terrainMaterial({ tier: this.tierNow });
    return new THREE.Mesh(g, gm);
  }

  /** fonte da grama: cor do chão; nada no acampamento, nas trilhas, fora do mapa nem sob construções */
  private grassSrc: GrassSource = {
    height: (x, z) => this.sim.w.height(x, z),
    cell: (x, z, out) => {
      const d = Math.hypot(x, z);
      if (d > WORLD_R - 1) return 0;
      const k = groundColor(x, z, _gc);
      if (k <= 0.02) return 0;
      for (const st of this.sim.structs) if (Math.abs(st.x - x) < 1.6 && Math.abs(st.z - z) < 1.6) return 0;
      out[0] = _gc.r;
      out[1] = _gc.g;
      out[2] = _gc.b;
      out[3] = 0.85 + Math.sin(x * 0.21 + z * 0.17) * 0.15;
      return k;
    },
  };

  setTier(tier: Tier): void {
    if (tier === this.tierNow) return;
    this.tierNow = tier;
    const old = this.q;
    this.q = { ...vq(tier), lights: old.lights, spot: old.spot, deco: old.deco };
    this.renderer.setPixelRatio(this.q.pr);
    this.parts.budget = this.embers.budget = this.q.particles;
    const nq = natureQ(tier);
    this.grass.setQuality(nq.grass);
    this.blobs.opacity = nq.blobAlpha;
    this.lastBuild.x = 1e9;
  }

  resize(): void {
    const w = this.wrap.clientWidth || innerWidth;
    const h = this.wrap.clientHeight || innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /* ------------------------------ instâncias do bosque ------------------------------ */
  private rebuild(cx: number, cz: number): void {
    const s = this.sim;
    const W = s.w;
    const D = this.q.draw;
    const D2 = D * D;
    const cnt = [0, 0, 0, 0];
    const fcnt = [0, 0, 0, 0];
    const near2 = (this.tierNow >= 3 ? 40 : this.tierNow === 2 ? 30 : 22) ** 2;
    this.treeIdx.forEach((a) => (a.length = 0));
    let st = 0;
    this.blobs.begin();
    W.trees.forEach((t, i) => {
      const dx = t.x - cx;
      const dz = t.z - cz;
      if (dx * dx + dz * dz > D2) return;
      const ty = W.height(t.x, t.z) - 0.15;
      if (!s.treeT[i] && dx * dx + dz * dz < 45 * 45) this.blobs.push(t.x, ty + 0.15, t.z, t.s * (t.k === TK.Pine ? 1.25 : 1.55));
      _m.compose(_v.set(t.x, ty, t.z), _q.setFromAxisAngle(UP, t.rot), _s.set(t.s, t.s, t.s));
      if (s.treeT[i]) {
        this.stumps.setMatrixAt(st++, _m.compose(_v.set(t.x, ty, t.z), _q.setFromAxisAngle(UP, t.rot), _s.setScalar(t.s * 0.9)));
        return;
      }
      if (dx * dx + dz * dz > near2) {
        this.farTrees[t.k].setMatrixAt(fcnt[t.k]++, _m);
        return;
      }
      this.trees[t.k].setMatrixAt(cnt[t.k], _m);
      this.cards[t.k].setMatrixAt(cnt[t.k], _m);
      this.treeIdx[t.k][cnt[t.k]++] = i;
    });
    this.trees.forEach((m, k) => {
      m.count = cnt[k];
      m.instanceMatrix.needsUpdate = true;
      this.cards[k].count = cnt[k];
      this.cards[k].instanceMatrix.needsUpdate = true;
    });
    this.farTrees.forEach((m, k) => {
      m.count = fcnt[k];
      m.instanceMatrix.needsUpdate = true;
    });
    this.stumps.count = st;
    this.stumps.instanceMatrix.needsUpdate = true;
    this.blobs.end();
    const nc = new Array(this.nodes.length).fill(0);
    W.nodes.forEach((n, i) => {
      if (s.nodeT[i]) return;
      const dx = n.x - cx;
      const dz = n.z - cz;
      if (dx * dx + dz * dz > D2) return;
      this.nodes[n.k].setMatrixAt(nc[n.k]++, _m.compose(_v.set(n.x, W.height(n.x, n.z) - 0.05, n.z), _q.setFromAxisAngle(UP, n.rot), _s.setScalar(1)));
    });
    this.nodes.forEach((m, k) => {
      m.count = nc[k];
      m.instanceMatrix.needsUpdate = true;
    });
  }
  private rebuildChests(): void {
    const cc = [0, 0, 0, 0, 0, 0];
    this.sim.w.chests.forEach((c, i) => {
      const k = (this.sim.chestOpen[i] ? 3 : 0) + c.tier;
      this.chests[k].setMatrixAt(cc[k]++, _m.compose(_v.set(c.x, this.sim.w.height(c.x, c.z), c.z), _q.setFromAxisAngle(UP, c.rot), _s.setScalar(1)));
    });
    this.chests.forEach((m, k) => {
      m.count = cc[k];
      m.instanceMatrix.needsUpdate = true;
    });
  }
  private syncStructs(): void {
    const s = this.sim;
    const alive = new Set<number>();
    for (const st of s.structs) {
      alive.add(st.id);
      let o = this.structs.get(st.id);
      if (!o) {
        const m = structModel(st.k);
        o = new THREE.Group();
        o.add(new THREE.Mesh(m.geo, vcMat()));
        if (m.glow) {
          const gm = new THREE.Mesh(m.glow, glowMat(m.glowCol ?? '#ffe680'));
          gm.name = 'glow';
          o.add(gm);
        }
        o.position.set(st.x, s.w.height(st.x, st.z), st.z);
        o.rotation.y = -st.r;
        this.scene.add(o);
        this.structs.set(st.id, o);
      }
      const d = ITEM[st.k]?.place;
      const gl = o.getObjectByName('glow');
      if (gl && d?.burn) gl.visible = st.burn > 0;
      if (gl && d?.kind === 'trap') gl.visible = st.a > 0;
      // processadores: balão com o produto pronto
      const ready = (d?.kind === 'kiln' || d?.kind === 'still' || d?.kind === 'charger' || d?.kind === 'solar') && st.b > 0 ? (d.kind === 'kiln' ? 'coal' : d.kind === 'still' ? 'fuel' : 'battery') : (d?.kind === 'garden' || d?.kind === 'berrybed') && st.a ? (d.kind === 'garden' ? 'carrot' : 'berry') : '';
      let bub = o.getObjectByName('bub') as THREE.Sprite | undefined;
      if (ready && (!bub || bub.userData.k !== ready)) {
        if (bub) o.remove(bub);
        bub = iconSprite(ic(ready, 48));
        bub.name = 'bub';
        bub.userData.k = ready;
        bub.position.y = 2.4;
        o.add(bub);
      } else if (!ready && bub) o.remove(bub);
    }
    for (const [id, o] of this.structs)
      if (!alive.has(id)) {
        this.scene.remove(o);
        this.structs.delete(id);
      }
  }

  /* ------------------------------ jogadores ------------------------------ */
  private prig(p: Player, me: boolean): PRig {
    let r = this.players.get(p.id);
    if (r) return r;
    const sk = SKINS.find((s) => s.id === p.skin) ?? SKINS[0];
    const rig = bloopModel({ light: p.bot ? '#8ad8ff' : sk.light, dark: p.bot ? '#3a8aff' : sk.dark, belly: sk.belly, eye: sk.eye });
    const beam = new THREE.Mesh(this.beamGeo, this.beamMat);
    beam.visible = false;
    const zz = iconSprite(ic('sleep', 48), '#2a2a5a');
    zz.position.y = 1.9;
    zz.visible = false;
    rig.g.add(zz);
    let label: THREE.Sprite | null = null;
    if (!me) {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 64;
      const x = c.getContext('2d')!;
      x.font = '600 34px Fredoka, sans-serif';
      x.textAlign = 'center';
      x.lineWidth = 8;
      x.strokeStyle = '#2a0b5c';
      x.fillStyle = '#fff';
      const nm = p.name.slice(0, 14);
      x.strokeText(nm, 128, 44);
      x.fillText(nm, 128, 44);
      const tx = new THREE.CanvasTexture(c);
      tx.colorSpace = THREE.SRGBColorSpace;
      label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, fog: false, depthTest: false }));
      label.scale.set(2, 0.5, 1);
      label.position.y = 1.55;
      label.renderOrder = 20;
      rig.g.add(label);
    }
    const sh = this.mkShadow(0.9);
    this.scene.add(rig.g, beam, sh);
    r = { rig, shadow: sh, tool: null, toolK: '', hatK: '', beam, label, bubble: null, bubbleK: '', bubbleT: 0, px: p.x, pz: p.z, walk: 0, zz };
    this.players.set(p.id, r);
    return r;
  }
  /** balão de ícone sobre um jogador/ajudante (comando, pensamento) */
  bubble(pid: string, icon: string, secs = 2): void {
    const r = this.players.get(pid);
    if (!r) return;
    if (r.bubble && r.bubbleK !== icon) {
      r.rig.g.remove(r.bubble);
      r.bubble = null;
    }
    if (!r.bubble) {
      r.bubble = iconSprite(ic(icon, 48));
      r.bubble.position.y = 2.1;
      r.rig.g.add(r.bubble);
      r.bubbleK = icon;
    }
    r.bubbleT = secs;
  }

  private updPlayers(dt: number, meId: string): void {
    const s = this.sim;
    const seen = new Set<string>();
    for (const p of s.players) {
      seen.add(p.id);
      const r = this.prig(p, p.id === meId);
      const g = r.rig.g;
      const mv = Math.hypot(p.x - r.px, p.z - r.pz) / Math.max(dt, 1e-3);
      r.px = p.x;
      r.pz = p.z;
      r.walk += dt * Math.min(mv, 7) * 2.2;
      const bob = mv > 0.4 ? Math.abs(Math.sin(r.walk)) * 0.12 : Math.sin(this.time * 2.4) * 0.02;
      const vh = p.seat >= 0 ? s.vehView.find((q) => q.id === p.seat) : undefined;
      const gy = vh ? vh.y - 0.1 : s.w.height(p.x, p.z);
      g.position.set(p.x, (vh ? 0 : bob) + gy, p.z);
      g.rotation.y = p.lightOn ? p.aim : p.yaw;
      g.visible = true;
      g.scale.setScalar(vh ? 0.75 : 1);
      r.shadow.position.set(p.x, gy + 0.03, p.z);
      r.shadow.visible = g.visible;
      r.rig.feet[0].position.z = 0.05 + (mv > 0.4 ? Math.sin(r.walk) * 0.15 : 0);
      r.rig.feet[1].position.z = 0.05 - (mv > 0.4 ? Math.sin(r.walk) * 0.15 : 0);
      // desmaiado: achatado e dormindo
      const faint = p.faint > 0;
      r.rig.body.scale.set(faint ? 1.25 : 1, faint ? 0.45 : 1, faint ? 1.25 : 1);
      r.zz.visible = faint;
      if (p.invT > 0 && !faint) g.visible = Math.floor(this.time * 12) % 2 === 0;
      // ferramenta na mão
      const tk = p.lightOn ? 'lamp' + p.lampId : p.bonk > 0 && s.dark ? 'hammer' + p.bonk : 'axe' + p.axe;
      if (tk !== r.toolK) {
        if (r.tool) r.rig.hand.remove(r.tool);
        const col = p.lightOn ? (ITEM[p.lampId]?.col ?? '#fff6c0') : tk.startsWith('hammer') ? '#ffb3d9' : ['#c8d0e0', '#c8d0e0', '#b8c4d8', '#7ad0ff', '#ffd34a', '#ffd34a', '#ff8fd8'][Math.round(p.axe)] ?? '#c8d0e0';
        r.tool = toolMesh(p.lightOn ? 'lamp' : tk.startsWith('hammer') ? 'hammer' : 'axe', col);
        r.rig.hand.add(r.tool);
        r.toolK = tk;
      }
      r.rig.hand.rotation.x = p.swing > 0 ? -Math.sin((1 - p.swing / 0.4) * Math.PI) * 1.8 : p.lightOn ? 0 : -0.3;
      // chapéu: cosmético, ou gorro vestido
      const hk = p.wear.head === 'beanie' ? 'beanie' : p.hat;
      if (hk !== r.hatK) {
        r.rig.hat.clear();
        const h = hatMesh(hk);
        if (h) r.rig.hat.add(h);
        r.hatK = hk;
      }
      // feixe
      r.beam.visible = p.lightOn && !faint && g.visible;
      if (r.beam.visible) {
        const [range, , ang] = s.lamp(p);
        const w = Math.tan(ang) * range;
        r.beam.position.set(p.x + Math.sin(p.aim) * 0.5, gy + 0.9, p.z + Math.cos(p.aim) * 0.5);
        r.beam.rotation.set(0, p.aim, 0);
        r.beam.rotateX(0.06);
        r.beam.scale.set(w, w * 0.6, range);
      }
      if (r.bubble) {
        r.bubbleT -= dt;
        if (r.bubbleT <= 0) {
          r.rig.g.remove(r.bubble);
          r.bubble = null;
        }
      }
    }
    for (const [id, r] of this.players)
      if (!seen.has(id)) {
        this.scene.remove(r.rig.g, r.beam, r.shadow);
        this.players.delete(id);
      }
  }

  /* ------------------------------ Sombrinhas ------------------------------ */
  private updCreatures(_dt: number): void {
    const s = this.sim;
    for (const r of this.cre.values()) r.seen = false;
    for (const c of s.creatures) {
      let r = this.cre.get(c.id);
      if (!r) {
        const g = new THREE.Group();
        const king = c.k === CK.King;
        const body = new THREE.Mesh(king ? this.kingGeo : this.bodyGeo, this.bodyMats[c.k]);
        const eyes = new THREE.Mesh(this.eyeGeo, king ? this.kingEye : this.eyeMat);
        g.add(body, eyes);
        this.scene.add(g);
        r = { g, body, eyes, px: c.x, pz: c.z, yaw: 0, seen: true };
        this.cre.set(c.id, r);
        this.parts.burst(c.x, 0.5, c.z, 8, 'poof', '#3a2a5a', 1);
      }
      r.seen = true;
      const dx = c.x - r.px;
      const dz = c.z - r.pz;
      if (Math.hypot(dx, dz) > 0.01) r.yaw += (Math.atan2(dx, dz) - r.yaw + Math.PI * 3) % TAU - Math.PI;
      r.px = c.x;
      r.pz = c.z;
      const D = CDEFS[c.k];
      const hpk = 0.55 + 0.45 * Math.max(0, c.hp / c.max);
      const sz = D.size * hpk;
      const w = Math.sin(this.time * 6 + c.id) * 0.06;
      const jit = c.lit > 0 ? (Math.random() - 0.5) * 0.12 : 0;
      const hop = c.k === CK.Hopper ? Math.max(0, Math.sin(c.t * 5)) * 0.6 : Math.sin(this.time * 2 + c.id) * 0.08 + 0.1;
      r.g.position.set(c.x + jit, hop + s.w.height(c.x, c.z), c.z + jit);
      r.g.rotation.y = r.yaw;
      r.g.scale.set(sz * (1 - w), sz * (1 + w), sz * (1 - w));
      r.body.material = c.lit > 0 ? this.litMat : this.bodyMats[c.k];
      // olhos piscam
      r.eyes.scale.y = Math.sin(this.time * 0.9 + c.id * 3) > 0.97 ? 0.1 : c.drain > 0 ? 0.6 : 1;
    }
    for (const [id, r] of this.cre)
      if (!r.seen) {
        this.scene.remove(r.g);
        this.cre.delete(id);
      }
  }
  private litMat = new THREE.MeshBasicMaterial({ color: '#6a4aa0' });

  /* ------------------------------ efeitos ------------------------------ */
  fx(e: Ev): void {
    const x = e.x ?? 0;
    const z = e.z ?? 0;
    switch (e.k) {
      case 'chop':
        this.parts.burst(x, 1, z, 8, 'chunk', '#c08a52', 2.5);
        this.parts.burst(x, 2.6, z, 5, 'chunk', '#4fb05a', 1.5);
        if (e.n !== undefined) this.shake.set(e.n, 0.3);
        hitTreeShake(x, z, 1);
        break;
      case 'fell': {
        const t = this.sim.w.trees[e.n ?? -1];
        if (!t) break;
        const m = new THREE.Mesh(this.trees[t.k].geometry, this.trees[t.k].material as THREE.Material);
        if (this.cards[t.k].visible) m.add(new THREE.Mesh(this.cards[t.k].geometry, this.cardMat));
        // cai a partir do corte (o toco fica)
        m.position.set(t.x, this.sim.w.height(t.x, t.z) + 0.3 * t.s, t.z);
        m.scale.setScalar(t.s);
        this.scene.add(m);
        const p = this.sim.players.find((q) => q.id === e.p);
        const a = p ? Math.atan2(t.x - p.x, t.z - p.z) : 0;
        this.falls.push({ m, t: 0, dx: Math.sin(a), dz: Math.cos(a), hit: false, h: 4.6 * t.s, col: TREE_LEAF[t.k] });
        this.parts.burst(x, 0.5, z, 10, 'chunk', '#ffe2b0', 3);
        this.parts.burst(x, 0.5, z, 14, 'poof', '#e8dcc0', 2);
        this.lastBuild.ver = -1;
        break;
      }
      case 'take':
      case 'collect':
        this.parts.burst(x, 0.6, z, 10, 'spark', '#9dffcb', 2);
        break;
      case 'chest':
        this.parts.burst(x, 0.8, z, 22, 'spark', '#ffd34a', 3);
        break;
      case 'poof':
        this.parts.burst(x, 0.6, z, 16, 'poof', '#6a4aa0', 2.4);
        this.parts.burst(x, 0.8, z, 14, 'spark', '#ffe45c', 3);
        break;
      case 'bossdown':
        this.parts.burst(x, 2, z, 60, 'poof', '#6a4aa0', 5);
        this.parts.burst(x, 2, z, 60, 'spark', '#ffe45c', 7);
        break;
      case 'feed':
        this.embers.burst(0, 1, 0, 20, 'spark', '#ffb030', 2.5);
        break;
      case 'rescue':
        this.parts.burst(x, 1, z, 30, 'spark', '#ff8fd8', 3);
        break;
      case 'craft':
      case 'place':
        this.parts.burst(x, 0.8, z, 18, 'spark', '#9ffcff', 2.5);
        this.parts.burst(x, 0.3, z, 8, 'poof', '#e8dcc0', 1.4);
        break;
      case 'hurt':
        this.parts.burst(x, 1.2, z, 10, 'spark', '#ffffff', 2);
        break;
      case 'trap':
        this.parts.burst(x, 0.6, z, 20, 'spark', '#c8ff6a', 3);
        break;
      case 'break':
        this.parts.burst(x, 0.6, z, 14, 'chunk', '#a8743c', 3);
        break;
      case 'bonk':
        this.parts.burst(x, 1, z, 12, 'spark', '#ffb3d9', 3);
        break;
      case 'flare':
        this.parts.burst(x, 0.5, z, 20, 'spark', '#ff8a6a', 4);
        break;
      case 'eat':
        this.parts.burst(x, 1.2, z, 6, 'spark', '#ffd34a', 1.5);
        break;
    }
  }

  /* ------------------------------ quadro ------------------------------ */
  update(dt: number, me: Player | null, focus: Focus | null, ghost: Ghost | null, camX: number, camZ: number): void {
    this.time += dt;
    const s = this.sim;
    // reconstrução das instâncias
    const lb = this.lastBuild;
    if (Math.hypot(camX - lb.x, camZ - lb.z) > 6 || lb.ver !== s.verTrees) {
      lb.x = camX;
      lb.z = camZ;
      lb.ver = s.verTrees;
      this.rebuild(camX, camZ);
    }
    if (lb.verC !== s.verChest) {
      lb.verC = s.verChest;
      this.rebuildChests();
    }
    if (lb.verS !== s.verStruct) {
      lb.verS = s.verStruct;
      this.syncStructs();
      this.grass.invalidateAll();
    }
    this.grass.update(camX, 0, camZ, me ? me.x : 0, me ? me.z : 0, me ? 0.7 : 0);
    // árvores tremendo
    for (const [i, t] of this.shake) {
      const tr = s.w.trees[i];
      const k = tr.k;
      const ii = this.treeIdx[k].indexOf(i);
      const nt = t - dt;
      if (ii >= 0) {
        const a = nt > 0 ? Math.sin(nt * 60) * 0.05 * nt * 3 : 0;
        this.trees[k].setMatrixAt(ii, _m.compose(_v.set(tr.x, s.w.height(tr.x, tr.z) - 0.15, tr.z), _q.setFromAxisAngle(UP, tr.rot).multiply(_q2.setFromAxisAngle(_s.set(1, 0, 0), a)), _s.setScalar(tr.s)));
        this.trees[k].instanceMatrix.needsUpdate = true;
        this.cards[k].setMatrixAt(ii, _m);
        this.cards[k].instanceMatrix.needsUpdate = true;
      }
      if (nt <= 0) this.shake.delete(i);
      else this.shake.set(i, nt);
    }
    for (const f of this.falls) {
      f.t += dt;
      // range (0,3 s) → queda acelerando → quique ao bater → some em folhas
      const tt = Math.max(0, f.t - 0.3);
      let a = f.t < 0.3 ? f.t * 0.3 + Math.sin(f.t * 40) * 0.02 : Math.min(Math.PI / 2, 0.09 + tt * tt * 3);
      if (a >= Math.PI / 2 && !f.hit) {
        f.hit = true;
        const cx = f.m.position.x + f.dx * f.h * 0.65;
        const cz = f.m.position.z + f.dz * f.h * 0.65;
        this.leafFx.emit(this.q.particles >= 0.8 ? 50 : 26, cx, this.sim.w.height(cx, cz) + 0.7, cz, f.h * 0.25, f.col, 3);
        this.parts.burst(cx, 0.4, cz, 12, 'poof', '#e8dcc0', 2);
      }
      if (f.hit) a -= Math.abs(Math.sin((f.t - 0.3 - Math.sqrt((Math.PI / 2 - 0.09) / 3)) * 14)) * 0.08 * Math.max(0, 1 - (f.t - 0.95) * 3);
      f.m.quaternion.setFromAxisAngle(_v.set(f.dz, 0, -f.dx), a);
      if (f.t > 1.4) f.m.scale.multiplyScalar(1 - dt * 4);
    }
    if (this.falls.some((f) => f.t > 1.9)) {
      for (const f of this.falls) if (f.t > 1.9) this.scene.remove(f.m);
      this.falls = this.falls.filter((f) => f.t <= 1.9);
    }

    this.leafFx.update(dt);
    natureTick(dt);
    windTime.value = this.time;
    this.updLighting(dt, me);
    this.updPlayers(dt, me?.id ?? '');
    this.updCreatures(dt);
    this.vv.update(dt, 1 - this.sunAmt);
    this.build.update(dt, this.camera, me ? me.x : camX, me ? me.z : camZ); // BUILD

    // bebês
    s.babies.forEach((b, i) => {
      const v = this.babies[i];
      const hop = b.st === 2 ? Math.abs(Math.sin(this.time * 3 + i)) * 0.25 : b.st === 1 ? Math.abs(Math.sin(this.time * 9)) * 0.15 : 0;
      const by = s.w.height(b.x, b.z);
      v.rig.g.position.set(b.x, hop + by, b.z);
      v.shadow.position.set(b.x, by + 0.03, b.z);
      if (b.st === 2) v.rig.g.rotation.y = Math.atan2(-b.x, -b.z);
      else if (b.st === 1) {
        const p = s.player(b.by);
        if (p) v.rig.g.rotation.y = p.yaw;
      } else v.rig.g.rotation.y = Math.sin(this.time * 0.7 + i) * 0.6;
      v.help.visible = b.st === 0;
      v.help.position.y = 2.2 + Math.sin(this.time * 3) * 0.15;
    });

    // sinalizadores
    const seenF = new Set<number>();
    for (const f of s.flashes) {
      seenF.add(f.id);
      let m = this.flashes.get(f.id);
      if (!m) {
        m = new THREE.Mesh(G.sph, glowMat(ITEM[f.k]?.col ?? '#ff4f6a'));
        this.scene.add(m);
        this.flashes.set(f.id, m);
      }
      m.position.set(f.x, s.w.height(f.x, f.z) + 0.4 + Math.sin(this.time * 8) * 0.05, f.z);
      m.scale.setScalar(0.5 + Math.sin(this.time * 20) * 0.08);
      if (Math.random() < 0.4) this.embers.emit(f.x, 0.5, f.z, (Math.random() - 0.5) * 1.5, 2 + Math.random() * 2, (Math.random() - 0.5) * 1.5, { tile: 1, color: ITEM[f.k]?.col ?? '#ff8a6a', life: 0.6, size: 0.08, grav: 3 });
    }
    for (const [id, m] of this.flashes)
      if (!seenF.has(id)) {
        this.scene.remove(m);
        this.flashes.delete(id);
      }

    // foco (contorno pulsante no que dá para usar)
    const fr = this.focusRing;
    fr.visible = !!focus;
    if (focus) {
      const k = 1 + Math.sin(this.time * 6) * 0.08;
      fr.position.set(focus.x, s.w.height(focus.x, focus.z) + 0.08, focus.z);
      fr.scale.setScalar(focus.r * k);
      (fr.material as THREE.MeshBasicMaterial).color.set(focus.col ?? '#fff36b');
      (fr.material as THREE.MeshBasicMaterial).opacity = 0.65 + Math.sin(this.time * 6) * 0.3;
    }
    // fantasma de construção
    if (ghost) {
      if (ghost.id !== this.ghostId) {
        this.ghost.clear();
        this.ghost.add(new THREE.Mesh(structModel(ghost.id).geo, this.ghostMat));
        this.ghostId = ghost.id;
      }
      this.ghost.visible = true;
      this.ghost.position.set(ghost.x, s.w.height(ghost.x, ghost.z) + 0.02, ghost.z);
      this.ghost.rotation.y = -ghost.r;
      this.ghostMat.color.set(ghost.ok ? '#7dffb0' : '#ff5a6a');
    } else this.ghost.visible = false;

    this.parts.update(dt, this.camera.fov, this.renderer.domElement.height);
    this.embers.update(dt, this.camera.fov, this.renderer.domElement.height);
  }

  private updLighting(dt: number, me: Player | null): void {
    const s = this.sim;
    void dt;
    // quanto de sol: amanhecer suave e entardecer nos últimos DUSK s
    let sunT: number;
    if (s.phase === 'day') {
      const left = DAY_LEN - s.clock;
      sunT = Math.min(1, s.survived > 0 ? s.clock / 6 : 1, left / DUSK);
    } else sunT = 0;
    this.sunAmt += (Math.max(0, sunT) - this.sunAmt) * Math.min(1, dt * 3);
    const k = smooth(Math.max(0, Math.min(1, this.sunAmt)));
    const ni = nightInfo(s.night);
    const dark = ni.dark;
    const fog = ni.fog && s.phase === 'night';
    const dusk = 1 - Math.abs(k - 0.5) * 2; // pico no meio da transição
    // céu
    this.skyU.top.value.copy(lerpC(fog ? '#0a0c14' : '#05061a', '#5ab8ff', k)).lerp(_c2.set('#6a3a8a'), dusk * 0.4);
    const fogCol = lerpC(fog ? '#1a1c2a' : '#0a0e22', '#bfe6ff', k).lerp(_c2.set('#ff9a7a'), dusk * 0.45);
    this.skyU.bot.value.copy(fogCol);
    const F = this.scene.fog as THREE.Fog;
    F.color.copy(fogCol);
    const nNear = fog ? 3 : 9 - dark * 3;
    const nFar = fog ? 20 : 46 - dark * 12;
    F.near = nNear + (40 - nNear) * k;
    F.far = Math.min(this.q.draw + 10, nFar + (this.q.draw + 10 - nFar) * k);
    this.renderer.setClearColor(fogCol);
    (this.stars.material as THREE.PointsMaterial).opacity = (1 - k) * (fog ? 0.2 : 0.9);
    // sol e lua cruzam o céu
    const dayP = s.phase === 'day' ? s.clock / DAY_LEN : 1;
    const sa = Math.PI * (0.1 + dayP * 0.8);
    const cp = this.camera.position;
    this.sunDisc.position.set(cp.x + Math.cos(sa) * 300, Math.sin(sa) * 220 - 20, cp.z - 120);
    this.sunDisc.visible = k > 0.05;
    const na = s.phase === 'night' ? Math.PI * (0.15 + (s.clock / 115) * 0.7) : 0.2;
    this.moon.position.set(cp.x - Math.cos(na) * 280, Math.sin(na) * 200 + 20, cp.z + 140);
    this.moon.visible = k < 0.9;
    (this.moon.material as THREE.MeshBasicMaterial).color.set(ni.moon && s.phase === 'night' ? '#fff0c0' : '#e8f0ff');
    this.moon.scale.setScalar(ni.moon ? 1.6 : 1);
    this.sky.position.copy(cp);
    this.stars.position.copy(cp);
    // luzes globais
    const nightAmb = (0.2 - dark * 0.08) * (fog ? 0.8 : 1) * (ni.moon ? 1.6 : 1);
    this.hemi.intensity = nightAmb + (1.05 - nightAmb) * k;
    this.hemi.color.copy(lerpC('#4a5aa0', '#d8f0ff', k));
    this.hemi.groundColor.copy(lerpC('#0a0a18', '#4a6a3a', k));
    this.sun.intensity = 0.12 + 1.15 * k;
    this.sun.color.copy(lerpC('#8aa0ff', '#fff2d8', k)).lerp(_c2.set('#ff9a5a'), dusk * 0.6);
    this.sun.position.set(Math.cos(sa) * 40 + cp.x, 50, cp.z + 20);
    this.sun.target.position.set(cp.x, 0, cp.z);
    this.sun.target.updateMatrixWorld();
    // fogueira
    const fr = s.fireR();
    const fl = s.fire.fuel / s.fire.max;
    const flick = 1 + Math.sin(this.time * 13) * 0.06 + Math.sin(this.time * 7.3) * 0.08;
    this.fireLight.intensity = fr > 0 ? (2.2 + fl * 3) * flick * (0.35 + 0.65 * (1 - k)) : 0;
    this.fireLight.distance = fr * 2.1 + 2;
    const fk = (s.fire.ring ? 'r' : '') + (s.fire.big ? 'b' : '');
    if (fk !== this.fireKey) {
      this.fireKey = fk;
      this.fireBase.geometry.dispose();
      this.fireBase.geometry = fireBaseGeo(s.fire.ring, s.fire.big);
    }
    const fs = fr > 0 ? 0.45 + fl * 0.9 * (s.fire.big ? 1.3 : 1) : 0.0001;
    this.flames.forEach((f, i) => {
      const w = [1, 0.7, 0.4][i];
      const h = [1.8, 1.4, 0.9][i] * fs * (1 + Math.sin(this.time * (9 + i * 3) + i) * 0.12);
      f.scale.set(w * fs, h, w * fs);
      f.position.set(Math.sin(this.time * 3 + i) * 0.05, h / 2 + 0.15, Math.cos(this.time * 2.6 + i) * 0.05);
      f.rotation.y = this.time * (0.6 + i * 0.4);
    });
    if (fr > 0 && Math.random() < 0.5 * fs) this.embers.burst(0, 0.8 + fs * 0.5, 0, 1, 'flame', '#ff9a40', 0.8);
    if (fr > 0 && Math.random() < 0.15) this.embers.emit((Math.random() - 0.5) * 0.6, 1.2, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.4, 1.8 + Math.random(), (Math.random() - 0.5) * 0.4, { tile: 1, color: '#ffcf6a', life: 1.4, size: 0.05, grav: -0.2 });
    if (this.benchLv !== s.bench) {
      this.benchLv = s.bench;
      this.bench.geometry.dispose();
      this.bench.geometry = benchGeo(s.bench);
    }
    // anel seguro
    this.ring.visible = fr > 0;
    this.ring.scale.setScalar(Math.max(0.01, fr));
    (this.ring.material as THREE.MeshBasicMaterial).opacity = (0.15 + 0.45 * (1 - k)) * (0.8 + Math.sin(this.time * 3) * 0.2);
    (this.ring.material as THREE.MeshBasicMaterial).color.set(fl < 0.22 ? '#ff6a4a' : '#ffd34a');
    // manchas de luz no chão + pool de luzes pontuais
    const L = s.lights();
    const dm = this.decals;
    let n = 0;
    const dOp = 0.12 + 0.75 * (1 - k);
    (dm.material as THREE.MeshBasicMaterial).opacity = dOp;
    const srcs: { x: number; z: number; r: number; c: string }[] = [];
    for (const l of L) srcs.push({ x: l.x, z: l.z, r: l.r, c: l.x === 0 && l.z === 0 ? '#ff9a40' : '#ffe39a' });
    for (const st of s.structs) {
      const d = ITEM[st.k]?.place;
      if (d?.light && !(d.burn && st.burn <= 0)) {
        const m = srcs.find((q) => q.x === st.x && q.z === st.z);
        if (m) m.c = d.lc ?? m.c;
      }
    }
    for (const f of s.flashes) {
      const m = srcs.find((q) => q.x === f.x && q.z === f.z);
      if (m) m.c = ITEM[f.k]?.col ?? '#ff8a6a';
    }
    for (const sr of srcs) {
      if (n >= 64) break;
      dm.setMatrixAt(n, _m.compose(_v.set(sr.x, s.w.height(sr.x, sr.z), sr.z), _q.identity(), _s.set(sr.r * 1.15, 1, sr.r * 1.15)));
      dm.setColorAt(n, _c.set(sr.c).multiplyScalar(0.55));
      n++;
    }
    dm.count = n;
    dm.instanceMatrix.needsUpdate = true;
    if (dm.instanceColor) dm.instanceColor.needsUpdate = true;
    // luzes pontuais nas fontes mais perto da câmera (fora a fogueira)
    const cx = cp.x;
    const cz = cp.z;
    const extra = srcs.filter((q) => !(q.x === 0 && q.z === 0)).sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz));
    this.pool.forEach((l, i) => {
      const q = extra[i];
      if (!q || k > 0.85) {
        l.intensity = 0;
        return;
      }
      l.position.set(q.x, s.w.height(q.x, q.z) + 1.6, q.z);
      l.color.set(q.c);
      l.distance = q.r * 2;
      l.intensity = 2.2 * (1 - k);
    });
    // lanterna do jogador local
    if (this.spot) {
      const on = !!me && me.lightOn && me.faint <= 0;
      this.spot.intensity = on ? 9 * (1 - k * 0.8) : 0;
      if (on && me) {
        const [range, , ang] = s.lamp(me);
        this.spot.angle = ang * 1.1;
        this.spot.distance = range * 1.4;
        const hy = s.w.height(me.x, me.z);
        this.spot.position.set(me.x, hy + 1.2, me.z);
        this.spot.target.position.set(me.x + Math.sin(me.aim) * range, hy + 0.2, me.z + Math.cos(me.aim) * range);
        this.spot.target.updateMatrixWorld();
      }
    }
    // vagalumes
    const fm = this.fireflies.material as THREE.PointsMaterial;
    fm.opacity = (1 - k) * (0.6 + Math.sin(this.time * 2) * 0.3);
    this.fireflies.position.set(Math.sin(this.time * 0.1) * 2, Math.sin(this.time * 0.7) * 0.3, Math.cos(this.time * 0.13) * 2);
  }

  /** câmera em terceira pessoa atrás do alvo */
  placeCamera(x: number, z: number, dt: number, y = 0, dist = this.camDist): void {
    const p = this.camPitch;
    const tx = x - Math.sin(this.camYaw) * Math.cos(p) * dist;
    const tz = z - Math.cos(this.camYaw) * Math.cos(p) * dist;
    const ty = y + 1.2 + Math.sin(p) * dist;
    const c = this.camera.position;
    const k = Math.min(1, dt * 12);
    c.x += (tx - c.x) * k;
    c.y += (Math.max(0.6, ty) - c.y) * k;
    c.z += (tz - c.z) * k;
    this.camera.lookAt(x, y + 1.3, z);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /** posição na tela (px CSS) e se está à frente da câmera */
  project(x: number, y: number, z: number): { x: number; y: number; front: boolean } {
    _v.set(x, y, z).project(this.camera);
    const w = this.renderer.domElement.clientWidth;
    const h = this.renderer.domElement.clientHeight;
    return { x: (_v.x * 0.5 + 0.5) * w, y: (-_v.y * 0.5 + 0.5) * h, front: _v.z < 1 };
  }

  destroy(): void {
    this.build.dispose(); // BUILD
    this.grass.dispose();
    this.blobs.dispose();
    this.leafFx.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((q) => q.dispose());
      else mat?.dispose?.();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

export { treeR };
