/* ============================================================
 *  POUSO FORÇADO — 3D em PRIMEIRA PESSOA (three.js; chunk sob demanda).
 *  Dois passes: (1) o mundo lá fora (céu de pôr do sol, nuvens, chão,
 *  aeroporto com luzes e PAPI) com a câmera no espaço do mundo;
 *  (2) o interior do avião (espaço local) por cima, com as janelas
 *  "furadas" mostrando o mundo. Câmera externa no fim/na abertura.
 * ============================================================ */
import * as THREE from 'three';
import { Hand, handColors } from '../../3d/common/hand';
import { Particles, PT } from '../../3d/common/particles';
import { disposeEnv, roomEnv } from '../../3d/common/pbr';
import { q3For, type Q3 } from '../../3d/common/quality';
import { canvas, INK } from '../../3d/common/tex';
import type { Tier } from '../../core/quality';
import { BOXES, SPOTS, type Cabin, type Livery } from './data';
import {
  CG_Z, FUSE_Y, WHEEL_Y, airportGeo, bloopGeo, buildCabin, buildExterior, cartGeo, groundTexture, trayGeo, houseGeo, itemGeo, mat, mountainGeo,
  runwayTexture, skyDome, tapeX, treeGeo, type CabinRefs, type ExtRefs,
} from './models';
import { DRINKS, GS, MAINS, RWY_HALF, RWY_LEN, seatLabel, type Ev, type Order, type Sim } from './sim';
import { GeoBuilder } from '../../3d/common/geo';
import { vIconImg } from './icons';
import { CloudField } from './clouds';

const TAU = Math.PI * 2;
/** altura dos olhos a pé (balcões da copa ~0,9 m ficam na cintura) */
const EYE = 1.45;
/** tripulação (outros jogadores/ajudantes) do tamanho de quem tem os olhos a 1,45 m */
const CREW_S = 1.3;
const UP = new THREE.Vector3(0, 1, 0);
const STREAKS = 44;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _e = new THREE.Euler();
const _s = new THREE.Vector3(1, 1, 1);
const _c = new THREE.Color();
const _c2 = new THREE.Color();
const _c3 = new THREE.Color();
const PAX_SKINS = ['bloop', 'mint', 'sunny', 'ocean', 'kitty', 'bee', 'devil', 'astro'];
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const ease = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));

/** a câmera nunca entra em móveis (folga maior que meio plano near com FOV largo) — como a Cozinha */
function camClamp(x: number, z: number): [number, number] {
  const M = 0.3;
  for (const b of BOXES) {
    const nx = clamp(x, b[0], b[1]);
    const nz = clamp(z, b[2], b[3]);
    const dx = x - nx;
    const dz = z - nz;
    const d = Math.hypot(dx, dz);
    if (d >= M) continue;
    if (d < 1e-4) continue;
    x = nx + (dx / d) * M;
    z = nz + (dz / d) * M;
  }
  return [x, z];
}

export interface ViewOpts {
  livery: Livery;
  cabin: Cabin;
  pfd: HTMLCanvasElement;
  nav: HTMLCanvasElement;
  mySkin: string;
}

/** ponto luminoso que não diminui com a distância (luzes do aeroporto) */
function lightPoints(n: number): THREE.Points {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('size', new THREE.BufferAttribute(new Float32Array(n), 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { pr: { value: 1 } },
    vertexShader: `attribute vec3 color; attribute float size; uniform float pr; varying vec3 vC; void main(){ vC=color; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=size*pr*clamp(700.0/max(1.0,-mv.z),0.55,1.7); }`,
    fragmentShader: `varying vec3 vC; void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d)*2.0; float a=smoothstep(1.0,0.0,r); a=a*a; gl_FragColor=vec4(vC*(0.6+a*1.4), a); if(a<0.02) discard; }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  p.renderOrder = 4;
  return p;
}
function glowTexture(col: string): THREE.CanvasTexture {
  const [cv, c] = canvas(64, 64);
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, col);
  g.addColorStop(0.35, col + 'aa');
  g.addColorStop(1, col + '00');
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function crackTexture(): THREE.CanvasTexture {
  const [cv, c] = canvas(128, 160);
  c.strokeStyle = 'rgba(255,255,255,0.95)';
  c.lineWidth = 2.5;
  c.lineCap = 'round';
  const cx = 70;
  const cy = 70;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + Math.sin(i * 3) * 0.3;
    c.beginPath();
    c.moveTo(cx, cy);
    let x = cx;
    let y = cy;
    for (let k = 0; k < 4; k++) {
      x += Math.cos(a + Math.sin(k * 2 + i) * 0.4) * 22;
      y += Math.sin(a + Math.cos(k * 3 + i) * 0.4) * 22;
      c.lineTo(x, y);
    }
    c.stroke();
  }
  for (const r of [14, 30, 48]) {
    c.beginPath();
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * TAU;
      const rr = r + Math.sin(i * 5) * 4;
      c[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    c.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function bangTexture(txt: string, bg: string): THREE.CanvasTexture {
  const [cv, c] = canvas(96, 96);
  c.fillStyle = bg;
  c.strokeStyle = INK;
  c.lineWidth = 6;
  c.beginPath();
  c.arc(48, 44, 34, 0, TAU);
  c.fill();
  c.stroke();
  c.fillStyle = '#fff';
  c.font = '900 48px Fredoka, system-ui, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.strokeText(txt, 48, 46);
  c.fillText(txt, 48, 46);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function starTexture(): THREE.CanvasTexture {
  const [cv, c] = canvas(64, 64);
  c.fillStyle = '#ffd34a';
  c.strokeStyle = INK;
  c.lineWidth = 4;
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU - Math.PI / 2;
    const r = i % 2 ? 12 : 28;
    c.lineTo(32 + Math.cos(a) * r, 34 + Math.sin(a) * r);
  }
  c.closePath();
  c.fill();
  c.stroke();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}


/** rastro em fita sempre de frente para a câmera (vórtices/condensação): some com a idade */
class Ribbon {
  readonly mesh: THREE.Mesh;
  private pts: THREE.Vector3[] = [];
  private age: number[] = [];
  private alpha: number[] = [];
  private head = 0;
  private n = 0;
  private pos: Float32Array;
  private al: Float32Array;
  constructor(
    private N: number,
    private width: number,
    private life: number,
  ) {
    for (let i = 0; i < N; i++) this.pts.push(new THREE.Vector3()), this.age.push(99), this.alpha.push(0);
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(N * 2 * 3);
    this.al = new Float32Array(N * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('a', new THREE.BufferAttribute(this.al, 1));
    const idx: number[] = [];
    for (let i = 0; i < N - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    g.setIndex(idx);
    const m = new THREE.ShaderMaterial({
      vertexShader: `attribute float a; varying float vA; void main(){ vA=a; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying float vA; void main(){ gl_FragColor=vec4(1.0,1.0,1.0,vA); }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }
  update(p: THREE.Vector3, strength: number, cam: THREE.Vector3, dt: number): void {
    for (let i = 0; i < this.N; i++) this.age[i] += dt;
    if (strength > 0.01 || this.n > 0) {
      this.head = (this.head + 1) % this.N;
      this.pts[this.head].copy(p);
      this.age[this.head] = 0;
      this.alpha[this.head] = strength;
      this.n = Math.min(this.N, this.n + 1);
    }
    let any = false;
    for (let k = 0; k < this.N; k++) {
      const i = (this.head - k + this.N) % this.N;
      const j = (i - 1 + this.N) % this.N;
      const P = this.pts[i];
      const Q = k < this.n - 1 ? this.pts[j] : P;
      const lifeK = Math.max(0, 1 - this.age[i] / this.life);
      const a = k < this.n ? this.alpha[i] * lifeK * Math.min(1, k / 3) * 0.55 : 0;
      if (a > 0.003) any = true;
      // largura cresce com a idade (o vórtice se espalha); direção perpendicular à câmera
      _v2.subVectors(P, Q);
      if (_v2.lengthSq() < 1e-6) _v2.set(0, 0, 1);
      _v.subVectors(cam, P).cross(_v2).normalize().multiplyScalar(this.width * (0.4 + (1 - lifeK) * 1.6));
      const o = k * 6;
      this.pos[o] = P.x + _v.x;
      this.pos[o + 1] = P.y + _v.y;
      this.pos[o + 2] = P.z + _v.z;
      this.pos[o + 3] = P.x - _v.x;
      this.pos[o + 4] = P.y - _v.y;
      this.pos[o + 5] = P.z - _v.z;
      this.al[k * 2] = this.al[k * 2 + 1] = a;
    }
    if (!any) this.n = 0;
    this.mesh.visible = any;
    this.mesh.geometry.getAttribute('position').needsUpdate = true;
    this.mesh.geometry.getAttribute('a').needsUpdate = true;
  }
}

interface CrewVis {
  mesh: THREE.Mesh;
  role: number;
  stars: THREE.Sprite[];
}
interface Popper {
  mesh: THREE.Mesh;
  p: THREE.Vector3;
  v: THREE.Vector3;
  spin: number;
  landed: boolean;
  stars: THREE.Sprite[];
  delay: number;
}

export class View3D {
  readonly canvas: HTMLCanvasElement;
  private r: THREE.WebGLRenderer;
  private q: Q3;
  private world = new THREE.Scene();
  private cabin = new THREE.Scene();
  cam: THREE.PerspectiveCamera;
  private wcam: THREE.PerspectiveCamera;
  private planeObj = new THREE.Object3D();
  private planeOff = new THREE.Object3D();
  private cab: CabinRefs;
  private ext: ExtRefs;
  private sky: THREE.Mesh;
  private skyU: Record<string, THREE.IUniform>;
  private sun: THREE.DirectionalLight;
  private wSun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private wHemi: THREE.HemisphereLight;
  private redLight: THREE.PointLight | null = null;
  private fireLight: THREE.PointLight | null = null;
  private fog: THREE.Fog;
  private cloudF: CloudField;
  private streaks: THREE.LineSegments;
  private streakPos: THREE.Vector3[] = [];
  private lights: THREE.Points;
  private papi: THREE.Points;
  private nApp = 0;
  private appStart = 0;
  private hand: Hand;
  private itemMeshes = new Map<number, THREE.Mesh>();
  private itemGeos = new Map<string, THREE.BufferGeometry>();
  private itemMat: THREE.Material;
  private crew = new Map<number, CrewVis>();
  private captain: THREE.Mesh;
  private capGeo: [THREE.BufferGeometry, THREE.BufferGeometry];
  private paxMeshes: THREE.InstancedMesh[] = [];
  private bangs: THREE.Sprite[] = [];
  private fx: Particles;
  private flames: Particles;
  private wfx: Particles;
  private fireGlows: THREE.Sprite[] = [];
  private cracks = new Map<number, THREE.Mesh>();
  private crackTex: THREE.CanvasTexture;
  private starTex: THREE.CanvasTexture;
  private pfdTex: THREE.CanvasTexture;
  private navTex: THREE.CanvasTexture;
  private puddle: THREE.Mesh;
  private cartM: THREE.Mesh;
  private trayMs: THREE.Mesh[] = [];
  private trayGeos = new Map<number, THREE.BufferGeometry>();
  private bubbles = new Map<number, { sp: THREE.Sprite; cv: HTMLCanvasElement; tex: THREE.CanvasTexture; sig: string }>();
  private patched = new Set<string>();
  private dispose: { dispose(): void }[] = [];
  yaw = Math.PI;
  pitch = -0.05;
  /** câmera: 0 = cabine (1ª pessoa), 1 = externa atrás (volta sozinha), 2 = órbita livre */
  camMode: 0 | 1 | 2 = 0;
  get extCam(): boolean {
    return this.camMode !== 0;
  }
  set extCam(v: boolean) {
    this.camMode = v ? 1 : 0;
  }
  /** botão de câmera: cabine → externa atrás → órbita livre → cabine */
  cycleCam(): number {
    this.camMode = ((this.camMode + 1) % 3) as 0 | 1 | 2;
    if (this.camMode === 1) {
      this.orb.az = 0;
      this.orb.el = 0.16;
      this.orb.dist = 48;
    }
    this.orb.t = this.t;
    return this.camMode;
  }
  /** arrastar na câmera externa: gira em volta do avião */
  orbit(dx: number, dy: number): void {
    const o = this.orb;
    o.az -= dx * 0.008;
    o.el = clamp(o.el + dy * 0.006, -0.35, 1.25);
    o.t = this.t;
  }
  /** pinça: aproxima/afasta (k > 1 afasta) */
  zoom(k: number): void {
    this.orb.dist = clamp(this.orb.dist * k, 20, 150);
    this.orb.t = this.t;
  }
  private orb = { az: 0, el: 0.16, dist: 48, t: -99, hdg: 0, init: false };
  /** intro: tempo (s) ou -1 */
  cut = -1;
  private ending: { t: number; kind: string; base: THREE.Vector3; hdg: number; poppers: Popper[] } | null = null;
  private shake = 0;
  private paxBump = 0;
  private paxWorried: number[] = [];
  private t = 0;
  private lookD = { x: 0, y: 0 };
  private wasSeated = false;
  private wasPortrait = false;
  private lastMaskDrop = 0;
  private binOpen = 0;
  private instT = 0;

  constructor(
    private root: HTMLElement,
    private sim: Sim,
    tier: Tier,
    o: ViewOpts,
  ) {
    this.q = q3For(tier);
    const q = this.q;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'voo-canvas';
    root.appendChild(this.canvas);
    this.r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: q.tier >= 1, powerPreference: 'high-performance', stencil: false });
    this.r.setPixelRatio(this.prFor(q));
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.r.toneMapping = THREE.ACESFilmicToneMapping;
    this.r.toneMappingExposure = q.standard ? 1.0 : 1.1;
    this.r.shadowMap.enabled = q.shadows;
    this.r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.r.autoClear = false;
    this.cam = new THREE.PerspectiveCamera(72, 1, 0.04, 140);
    this.wcam = new THREE.PerspectiveCamera(72, 1, 2, 160000);
    this.cabin.add(this.cam);

    // ---------- mundo ----------
    this.sky = skyDome();
    this.skyU = (this.sky.material as THREE.ShaderMaterial).uniforms;
    this.world.add(this.sky);
    this.fog = new THREE.Fog('#ffd7a8', 2500, 70000);
    this.world.fog = this.fog;
    this.wHemi = new THREE.HemisphereLight('#ffe8d0', '#5a6a7a', 1.2);
    this.wSun = new THREE.DirectionalLight('#ffd8a0', 2.2);
    this.world.add(this.wHemi, this.wSun, this.wSun.target);
    const gTex = groundTexture(q.tier >= 2 ? 2048 : 1024);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200000, 200000), new THREE.MeshLambertMaterial({ map: gTex }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -4, 10000);
    gTex.repeat.set(3, 3);
    this.world.add(ground);
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(9000, 12000), new THREE.MeshLambertMaterial({ color: '#7fb85e', polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(0, -0.5, -500);
    this.world.add(grass);
    const rwy = new THREE.Mesh(new THREE.PlaneGeometry(RWY_HALF * 2 + 6, RWY_LEN + 40), new THREE.MeshLambertMaterial({ map: runwayTexture(), polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }));
    rwy.rotation.x = -Math.PI / 2;
    rwy.position.set(0, 0.05, -RWY_LEN / 2 + 10);
    this.world.add(rwy);
    const ap = new THREE.Mesh(airportGeo(q.tier < 2), mat(false));
    (ap.material as THREE.MeshLambertMaterial).polygonOffset = true;
    (ap.material as THREE.MeshLambertMaterial).polygonOffsetFactor = -2;
    this.world.add(ap);
    // árvores, casas e montanhas
    const nT = [250, 450, 750, 1000][q.tier];
    const trees = new THREE.InstancedMesh(treeGeo(), mat(false), nT);
    let seed = 99;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < nT; i++) {
      let x = 0;
      let z = 0;
      for (let k = 0; k < 8; k++) {
        x = (rnd() * 2 - 1) * 5000;
        z = -3500 + rnd() * 16000;
        if (!(Math.abs(x) < 220 && z > -2900 && z < 1600) && !(x > 60 && x < 760 && z < -150 && z > -2500)) break;
      }
      const s = 9 + rnd() * 12;
      _m.compose(_v.set(x, -0.5, z), _q.setFromAxisAngle(UP, rnd() * TAU), _v2.set(s, s * (0.8 + rnd() * 0.6), s));
      trees.setMatrixAt(i, _m);
    }
    this.world.add(trees);
    const nH = [60, 120, 200, 280][q.tier];
    const houses = new THREE.InstancedMesh(houseGeo(), mat(false), nH);
    for (let i = 0; i < nH; i++) {
      const cx = i % 3 === 0 ? -1800 : i % 3 === 1 ? 2600 : -900;
      const cz = i % 3 === 0 ? 4000 : i % 3 === 1 ? 9000 : -4200;
      const s = 12 + rnd() * 10;
      _m.compose(_v.set(cx + (rnd() * 2 - 1) * 700, -0.5, cz + (rnd() * 2 - 1) * 700), _q.setFromAxisAngle(UP, Math.round(rnd() * 4) * (Math.PI / 2)), _v2.set(s, s, s * 1.3));
      houses.setMatrixAt(i, _m);
    }
    this.world.add(houses);
    const mts = new THREE.InstancedMesh(mountainGeo(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: '#3c4658' }), 30);
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * TAU + rnd() * 0.2;
      const d = 38000 + rnd() * 22000;
      const w = 3000 + rnd() * 4500;
      _m.compose(_v.set(Math.cos(a) * d, -10, 12000 + Math.sin(a) * d), _q.identity(), _v2.set(w, 900 + rnd() * 2400, w));
      mts.setMatrixAt(i, _m);
    }
    this.world.add(mts);
    // nuvens: cachos de bolotas macias (billboards ordenados), véu branco ao atravessar
    this.cloudF = new CloudField(q.tier);
    this.world.add(this.cloudF.mesh);
    // riscos de vento/velocidade
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(STREAKS * 6), 3));
    this.streaks = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.3, depthWrite: false, fog: false }));
    this.streaks.frustumCulled = false;
    for (let i = 0; i < STREAKS; i++) this.streakPos.push(new THREE.Vector3(0, -99999, 0));
    this.world.add(this.streaks);
    // luzes do aeroporto
    this.lights = this.buildLights();
    this.world.add(this.lights);
    this.papi = lightPoints(4);
    for (let i = 0; i < 4; i++) {
      (this.papi.geometry.getAttribute('position') as THREE.BufferAttribute).setXYZ(i, -RWY_HALF - 14 - i * 10, 1.5, -330);
      (this.papi.geometry.getAttribute('size') as THREE.BufferAttribute).setX(i, 9);
    }
    this.world.add(this.papi);
    this.world.add(this.planeObj);
    this.planeObj.add(this.planeOff);
    for (let i = 0; i < 4; i++) {
      const rb = i < 2 ? new Ribbon(44, 0.5, 0.75) : new Ribbon(40, 1.2, 1.4);
      this.trails.push(rb);
      this.world.add(rb.mesh);
    }
    this.planeOff.position.set(0, 0, -CG_Z);

    // ---------- interior ----------
    this.pfdTex = new THREE.CanvasTexture(o.pfd);
    this.pfdTex.colorSpace = THREE.SRGBColorSpace;
    this.navTex = new THREE.CanvasTexture(o.nav);
    this.navTex.colorSpace = THREE.SRGBColorSpace;
    this.cab = buildCabin(o.cabin, q.standard, q.seg, this.pfdTex, this.navTex);
    this.cabin.add(this.cab.group);
    this.ext = buildExterior(o.livery, q.standard, q.tier < 2);
    this.cabin.add(this.ext.group);
    this.ext.wins.visible = false;
    this.ext.darkWins.visible = false;
    this.hemi = new THREE.HemisphereLight('#fff4e8', '#b8a8d8', q.standard ? 1.5 : 2.1);
    this.cabin.add(this.hemi, new THREE.AmbientLight('#ffffff', q.standard ? 0.35 : 0.55));
    if (q.standard) {
      this.cabin.environment = roomEnv(this.r);
      this.cabin.environmentIntensity = 0.55;
    }
    this.sun = new THREE.DirectionalLight('#ffd0a0', q.standard ? 1.6 : 1.0);
    this.cabin.add(this.sun, this.sun.target);
    this.sun.target.position.set(0, 0, 8);
    if (q.shadows) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(2048, 2048);
      const sc = this.sun.shadow.camera;
      sc.left = -14;
      sc.right = 14;
      sc.top = 14;
      sc.bottom = -14;
      sc.near = 1;
      sc.far = 60;
      this.sun.shadow.bias = -0.0015;
      this.sun.shadow.normalBias = 0.03;
    }
    if (q.pointLight) {
      for (const z of [-2.2, 4.8, 12]) {
        const pl = new THREE.PointLight('#ffe6c8', 0.9, 7, 1.6);
        pl.position.set(0, 2.1, z);
        this.cabin.add(pl);
      }
      this.redLight = new THREE.PointLight('#ff2a3a', 0, 14, 1.4);
      this.redLight.position.set(0, 2.1, 6);
      this.fireLight = new THREE.PointLight('#ff8a2a', 0, 5, 1.6);
      this.cabin.add(this.redLight, this.fireLight);
    }
    // comandante desmaiado
    const cc = handColors('bloop');
    this.capGeo = [bloopGeo({ light: '#ffd1a8', dark: '#e0905a', belly: '#fff0e0' }, 9, 'normal'), bloopGeo({ light: '#ffd1a8', dark: '#e0905a', belly: '#fff0e0' }, 9, 'spiral')];
    void cc;
    this.captain = new THREE.Mesh(this.capGeo[1], mat(q.standard, { rough: 0.55 }));
    this.captain.castShadow = true;
    this.cabin.add(this.captain);
    // passageiros (instanciados por cor e expressão)
    const counts = new Array(16).fill(0);
    for (const p of sim.pax) counts[p.skin * 2]++, counts[p.skin * 2 + 1]++;
    for (let i = 0; i < 16; i++) {
      const sk = handColors(PAX_SKINS[i >> 1]);
      const im = new THREE.InstancedMesh(bloopGeo(sk, -1, i % 2 ? 'worried' : 'normal', 0.82), mat(q.standard, { rough: 0.55 }), Math.max(1, counts[i]));
      im.count = 0;
      // instâncias espalhadas pela cabine inteira: a esfera da geometria-base (na origem) fazia o
      // three.js descartar o grupo todo quando a origem saía da tela → passageiros sumindo
      im.frustumCulled = false;
      im.castShadow = q.tier >= 3;
      this.paxMeshes.push(im);
      this.cabin.add(im);
    }
    const bt = bangTexture('!', '#ff4d6a');
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: bt, depthWrite: false }));
      s.scale.set(0.32, 0.32, 1);
      s.visible = false;
      this.bangs.push(s);
      this.cabin.add(s);
    }
    this.starTex = starTexture();
    this.crackTex = crackTexture();
    this.itemMat = mat(q.standard, { rough: 0.45, metal: 0.1 });
    this.fx = new Particles(Math.round(500 * q.particles + 100));
    this.flames = new Particles(Math.round(320 * q.particles + 60), true);
    this.wfx = new Particles(400);
    this.fx.budget = this.flames.budget = q.particles;
    this.cabin.add(this.fx.obj, this.flames.obj);
    this.world.add(this.wfx.obj);
    this.wfx.floorY = -1;
    const gt = glowTexture('#ff9a3a');
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      s.visible = false;
      this.fireGlows.push(s);
      this.cabin.add(s);
    }
    // carrinho do serviço de bordo + bandejas
    this.cartM = cartGeo(q.standard);
    this.cartM.castShadow = q.shadows;
    this.cabin.add(this.cartM);
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(this.trayGeoFor(1, 2), this.itemMat);
      m.visible = false;
      this.cartM.add(m);
      this.trayMs.push(m);
    }
    this.puddle = new THREE.Mesh(new THREE.CircleGeometry(0.5, 18), new THREE.MeshStandardMaterial({ color: '#b07aff', roughness: 0.1, transparent: true, opacity: 0.75 }));
    this.puddle.rotation.x = -Math.PI / 2;
    this.puddle.position.set(SPOTS.leak.x + 0.6, 0.012, SPOTS.leak.z);
    this.puddle.scale.setScalar(0.01);
    this.cabin.add(this.puddle);
    // mão
    this.hand = new Hand(this.cam, handColors(o.mySkin));
    this.resize();
    this.warmUp();
  }

  /**
   * Um quadro com culling desligado e tudo visível (cabine e mundo): sobe geometrias/texturas e
   * compila shaders no carregamento, em vez de engasgar na primeira vez que cada coisa aparece.
   */
  private warmUp(): void {
    const off: THREE.Object3D[] = [];
    const hid: THREE.Object3D[] = [];
    for (const sc of [this.world, this.cabin])
      sc.traverse((o) => {
        if (o.frustumCulled) {
          o.frustumCulled = false;
          off.push(o);
        }
        if (!o.visible) {
          o.visible = true;
          hid.push(o);
        }
      });
    try {
      this.planeObj.updateMatrixWorld(true);
      this.r.render(this.world, this.wcam);
      this.r.render(this.cabin, this.cam);
      this.r.clear();
    } finally {
      for (const o of off) o.frustumCulled = true;
      for (const o of hid) o.visible = false;
    }
  }

  private buildLights(): THREE.Points {
    const pts: [number, number, number, string, number][] = [];
    for (let z = 0; z >= -RWY_LEN; z -= 60) for (const s of [-1, 1]) pts.push([s * (RWY_HALF + 1), 0.6, z, '#fff6d8', 5]);
    for (let x = -RWY_HALF; x <= RWY_HALF; x += 4) pts.push([x, 0.6, 2, '#3fff7a', 6]), pts.push([x, 0.6, -RWY_LEN - 2, '#ff3a4a', 6]);
    // as de aproximação ficam ANTES da cabeceira (z positivo)
    const appS = pts.length;
    for (let z = 60; z <= 900; z += 30) pts.push([0, 1.5, z, '#ffffff', 7]);
    for (let z = 60; z <= 900; z += 30) for (const k of [-2, -1, 1, 2]) pts.push([k * 1.8, 1.0, z, '#ffe8c8', 5]);
    for (let x = -15; x <= 15; x += 2.5) pts.push([x, 1.0, 300, '#ffe8c8', 5]);
    const p = lightPoints(pts.length);
    const pa = p.geometry.getAttribute('position') as THREE.BufferAttribute;
    const ca = p.geometry.getAttribute('color') as THREE.BufferAttribute;
    const sa = p.geometry.getAttribute('size') as THREE.BufferAttribute;
    pts.forEach(([x, y, z, c, s], i) => {
      pa.setXYZ(i, x, y, z);
      _c.set(c);
      ca.setXYZ(i, _c.r, _c.g, _c.b);
      sa.setX(i, s);
    });
    this.appStart = appS;
    this.nApp = 29;
    return p;
  }

  resize(): void {
    const w = Math.max(1, this.root.clientWidth || window.innerWidth);
    const h = Math.max(1, this.root.clientHeight || window.innerHeight);
    this.r.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.cw = w;
    this.ch = h;
    for (const c of [this.cam, this.wcam]) {
      c.aspect = w / h;
      c.fov = w < h ? 84 : 76;
      c.updateProjectionMatrix();
    }
    for (const p of [this.lights, this.papi]) ((p.material as THREE.ShaderMaterial).uniforms.pr.value = this.q.pr * (h / 400));
  }
  private resK = 1;
  private cw = 1;
  private ch = 1;
  /** resolução dinâmica (QualityGovernor.onResScale) */
  /** resolução da cabine: nunca tão baixa que as colunas do para-brisa virem escadinha */
  private prFor(q: Q3, k = 1): number {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const floor = Math.min(dpr, q.tier >= 1 ? 1 : 0.8);
    return Math.max(floor, q.pr * k);
  }
  setResScale(k: number): void {
    this.resK = Math.max(0.8, k);
    this.r.setPixelRatio(this.prFor(this.q, this.resK));
  }
  setTier(tier: Tier): void {
    this.q = q3For(tier);
    this.r.setPixelRatio(this.prFor(this.q, this.resK));
    this.fx.budget = this.flames.budget = this.q.particles;
    this.resize();
  }

  look(dx: number, dy: number): void {
    this.lookD.x += dx;
    this.lookD.y += dy;
  }
  facing(): [number, number] {
    return [Math.sin(this.yaw), Math.cos(this.yaw)];
  }

  /** ponto no espaço do avião → pixels da tela (null se atrás) */
  project(x: number, y: number, z: number, out: { x: number; y: number; behind: boolean }): void {
    // tamanho guardado no resize(): ler clientWidth aqui (chamado pelo HUD a cada marcador,
    // entre escritas de estilo) forçava layout síncrono várias vezes por quadro
    const w = this.cw;
    const h = this.ch;
    if (this.extCam || this.ending || (this.cut >= 0 && this.cut < 6)) {
      _v.set(x, y, z);
      this.planeOff.localToWorld(_v);
      _v.project(this.wcam);
    } else {
      _v.set(x, y, z).project(this.cam);
    }
    out.behind = _v.z > 1;
    out.x = ((out.behind ? -_v.x : _v.x) * 0.5 + 0.5) * w;
    out.y = ((out.behind ? _v.y : -_v.y) * 0.5 + 0.5) * h;
  }

  /* ============================== por quadro ============================== */

  frame(dt: number): void {
    this.t += dt;
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const s = this.sim;
    const f = s.f;
    // ----- transformação do avião no mundo (interpolada entre passos fixos da física) -----
    const ps = s.pose();
    let pitch = ps.pitch;
    let roll = ps.roll;
    let hdg = ps.hdg;
    let px = ps.x;
    let py = ps.alt - WHEEL_Y;
    let pz = ps.z;
    let gearPos = f.gearPos;
    let throttle = f.thr;
    const intro = this.cut >= 0;
    if (intro && this.cut < 6) {
      const tt = this.cut;
      const v = 18 + tt * 16;
      pz = -30 - (18 * tt + 8 * tt * tt);
      px = 0;
      hdg = 0;
      const lift = Math.max(0, tt - 2.6);
      py = -WHEEL_Y + lift * lift * 9;
      pitch = Math.min(0.16, lift * 0.25);
      roll = Math.sin(tt * 0.8) * 0.03 * lift;
      gearPos = 1 - clamp((tt - 4.2) / 1.5, 0, 1);
      throttle = 1;
      void v;
    }
    if (this.ending) {
      const e = this.ending;
      e.t += dt;
      if (e.kind === 'crash') {
        const k = e.t;
        const hop = Math.abs(Math.sin(k * 5)) * Math.exp(-k * 1.4) * 9;
        const slide = Math.min(1, k / 2.6);
        px = e.base.x + Math.sin(e.hdg) * 120 * ease(slide);
        pz = e.base.z - Math.cos(e.hdg) * 120 * ease(slide);
        py = -WHEEL_Y * 0.4 + hop;
        hdg = e.hdg + ease(slide) * 0.7;
        pitch = Math.sin(k * 6) * Math.exp(-k * 1.5) * 0.18 - 0.04 * slide;
        roll = 0.16 * slide + Math.sin(k * 7) * Math.exp(-k) * 0.2;
        gearPos = 0;
        throttle = 0;
      }
    }
    this.planeObj.position.set(px, py, pz);
    this.planeObj.quaternion.setFromEuler(_e.set(pitch, -hdg, -roll, 'YXZ'));
    this.planeObj.updateMatrixWorld(true);
    // ----- ambiente (hora do dia avança para o pôr do sol) -----
    this.updateSky(intro && this.cut < 6 ? 0 : s.progress);
    this.updateMotion(intro && this.cut < 6);
    // ----- interior: personagens, objetos, efeitos -----
    this.updateCabin(dt, intro);
    // ----- câmera -----
    const me = s.players[s.me];
    const ext = this.extCam || !!this.ending || (intro && this.cut < 6);
    this.setExtMode(ext);
    if (ext) this.extCamera(dt, intro, me);
    else this.fpCamera(dt, intro);
    // anima o exterior (trem, superfícies de comando, ventoinhas, asas, farol, vórtices)
    this.animExterior(dt, intro, gearPos, throttle);
    // PAPI e "coelho" das luzes de aproximação
    this.updateAirportLights();
    // instrumentos (texturas) ~12 Hz
    this.instT -= dt;
    if (this.instT <= 0) {
      this.instT = 0.08;
      this.pfdTex.needsUpdate = true;
      this.navTex.needsUpdate = true;
    }
    // partículas
    const h = this.ch || 400;
    this.fx.update(dt, this.cam.fov, h);
    this.flames.update(dt, this.cam.fov, h);
    this.wfx.update(dt, this.wcam.fov, h);
    // ----- nuvens (precisam da câmera do mundo já posicionada) -----
    this.wcam.updateMatrixWorld();
    this.inCloud = this.cloudF.update(dt, this.wcam.position, this.planeObj.position, hdg, !(intro && this.cut < 6) && s.flying && f.alt > 150, this.t);
    // ----- render -----
    this.r.clear();
    this.r.render(this.world, this.wcam);
    if (this.cloudF.wash.visible) this.r.render(this.cloudF.washScene, this.cloudF.washCam);
    if (!ext) {
      this.r.clearDepth();
      this.r.render(this.cabin, this.cam);
    }
  }

  private setExtMode(ext: boolean): void {
    const inWorld = this.ext.group.parent === this.planeOff;
    if (ext && !inWorld) {
      this.planeOff.add(this.ext.group);
      this.ext.wins.visible = true;
      this.ext.darkWins.visible = true;
    } else if (!ext && inWorld) {
      this.cabin.add(this.ext.group);
      this.ext.wins.visible = false;
      this.ext.darkWins.visible = false;
    }
  }

  /** superfícies seguem as entradas (suavizadas como um atuador hidráulico), ventoinhas giram com a rotação */
  private animExterior(dt: number, intro: boolean, gearPos: number, throttle: number): void {
    const s = this.sim;
    const f = s.f;
    const e = this.ext;
    const sm = this.ctlS;
    const k = Math.min(1, dt * 9);
    const live = !intro && !this.ending;
    const ail = live ? f.ail : 0;
    const elev = live ? f.elev : intro && this.cut > 2.4 && this.cut < 4.4 ? 0.6 : 0;
    sm.ail += (ail - sm.ail) * k;
    sm.elev += (elev - sm.elev) * k;
    sm.rud += ((live ? f.rud : 0) - sm.rud) * k;
    const fp = intro ? 1 : f.flapPos;
    const spoil = this.ending ? Math.min(1, this.ending.t * 3) : live ? f.spoiler : 0;
    // ailerons: um sobe, o outro desce
    e.ailerons[0].rotation.x = sm.ail * 0.32;
    e.ailerons[1].rotation.x = -sm.ail * 0.32;
    for (const el of e.elevators) el.rotation.x = -sm.elev * 0.36;
    e.rudder.rotation.x = sm.rud * 0.45;
    for (const fl of e.flaps) {
      fl.rotation.x = (fp / 2) * 0.62;
      fl.children[0].position.z = (fp / 2) * 0.32; // Fowler: desliza para trás
    }
    for (const sp of e.spoilers) sp.rotation.x = -spoil * 0.95;
    for (const g of e.gear) g.rotation.x = (1 - gearPos) * 1.45;
    // flexão das asas com a carga g (no chão elas caem um pouquinho)
    const gl = live && s.flying ? f.gload : intro && this.cut > 3 ? 1 : 0;
    this.flex += (clamp(0.009 * gl - 0.004, -0.006, 0.03) - this.flex) * Math.min(1, dt * 4);
    e.wings[0].rotation.z = -this.flex;
    e.wings[1].rotation.z = this.flex;
    // ventoinhas: rotação ∝ manete (N1), disco borrado quando rápido
    for (let i = 0; i < 2; i++) {
      const rpm = live || intro ? clamp(0.25 + throttle * 0.75, 0, 1) * (f.fuel > 0 || intro ? f.eng[i] : 0.1) : this.ending?.kind === 'crash' ? 0 : 0.2;
      this.fanRpm[i] += (rpm - this.fanRpm[i]) * Math.min(1, dt * 1.5);
      const r = this.fanRpm[i];
      e.fans[i].rotation.z += dt * (r * 70);
      const bl = e.fanBlur[i];
      (bl.material as THREE.MeshBasicMaterial).opacity = clamp((r - 0.2) * 1.3, 0, 0.8);
      bl.rotation.z -= dt * r * 9;
      const fe = e.engFire[i];
      fe.visible = live && f.eng[i] < 0.9 && s.flying;
      if (fe.visible) fe.scale.set(1 + Math.sin(this.t * 23 + i) * 0.15, 1 + Math.sin(this.t * 17) * 0.25, 1 + Math.sin(this.t * 19 + i) * 0.15);
    }
    e.beacon.visible = Math.floor(this.t * 1.4) % 2 === 0;
    // vórtices de ponta de asa (carga g / α alto / úmido) e rastros de condensação em altitude
    const ext = this.extCam || !!this.ending || (intro && this.cut < 6);
    const spdK = clamp((f.spd - 55) / 40, 0, 1);
    const vort = live && s.flying ? clamp((f.gload - 1.08) * 2.2 + Math.max(0, f.alpha - 0.09) * 6 + this.inCloud * 0.6, 0, 1) * spdK : 0;
    const con = live && s.flying && f.alt > 2000 ? clamp((f.alt - 2000) / 300, 0, 1) * clamp(throttle * 1.6, 0, 1) * 0.55 : 0;
    for (let i = 0; i < this.trails.length; i++) {
      const tr = this.trails[i];
      const pt = i < 2 ? e.tips[i] : this.engTail[i - 2];
      _v.copy(pt);
      this.planeOff.localToWorld(_v);
      tr.update(_v, ext ? (i < 2 ? vort : con) : 0, this.wcam.position, dt);
    }
  }
  private ctlS = { ail: 0, elev: 0, rud: 0 };
  private flex = 0;
  private fanRpm = [0, 0];
  private trails: Ribbon[] = [];
  private engTail = [new THREE.Vector3(-6, FUSE_Y - 2.35, 11.2), new THREE.Vector3(6, FUSE_Y - 2.35, 11.2)];
  private inCloud = 0;

  private updateSky(k: number): void {
    const u = this.skyU;
    (u.top.value as THREE.Color).set('#4f74d6').lerp(_c.set('#3b3f96'), k);
    (u.mid.value as THREE.Color).set('#a9cdf2').lerp(_c.set('#f2a0a6'), k);
    (u.hor.value as THREE.Color).set('#ffe2b8').lerp(_c.set('#ffae6e'), k);
    const el = lerp(0.24, 0.06, k);
    const sd = u.sunDir.value as THREE.Vector3;
    sd.set(-Math.cos(el) * 0.9, Math.sin(el), Math.cos(el) * 0.42).normalize();
    this.fog.color.copy(u.hor.value as THREE.Color);
    this.wSun.color.set('#fff0d8').lerp(_c.set('#ff9a5a'), k);
    this.wSun.position.copy(sd).multiplyScalar(1000).add(this.wcam.position);
    this.wSun.target.position.copy(this.wcam.position);
    this.wHemi.color.set('#e8f0ff').lerp(_c.set('#ffc8b0'), k);
    this.sky.position.copy(this.wcam.position);
    // dentro da nuvem: neblina fechada (medido pelas nuvens no quadro anterior)
    const inCloud = this.inCloud;
    this.fog.near = lerp(2500, 20, inCloud);
    this.fog.far = lerp(70000, 900, inCloud);
    if (inCloud > 0) this.fog.color.lerp(_c.set('#f4eef2'), inCloud);
    // nuvens: topo claro (pôr do sol rosado no fim), base lilás
    this.cloudF.setColors(_c.set('#ffffff').lerp(_c2.set('#ffe2d2'), k), _c3.set('#b9c3e2').lerp(_c2.set('#c79aae'), k), this.fog);
    // sol dentro da cabine (direção local)
    _q.copy(this.planeObj.quaternion).invert();
    _v.copy(sd).applyQuaternion(_q);
    this.sun.position.set(0, 0, 8).addScaledVector(_v, 30);
    this.sun.color.copy(this.wSun.color);
    this.sun.intensity = (this.q.standard ? 1.7 : 1.0) * (1 - inCloud * 0.7);
  }

  /** riscos de vento em volta do avião (reciclados) */
  private updateMotion(hide: boolean): void {
    const f = this.sim.f;
    const fx = Math.sin(f.hdg);
    const fz = -Math.cos(f.hdg);
    // riscos: pontos fixos no ar que passam pela câmera
    const st = this.streaks;
    st.visible = !hide && f.spd > 45 && this.sim.flying;
    if (!st.visible) return;
    const C = this.wcam.position;
    const v = f.spd;
    const gx = fx * Math.cos(f.gamma);
    const gy = Math.sin(f.gamma);
    const gz = fz * Math.cos(f.gamma);
    const len = Math.min(26, v * 0.11);
    const arr = (st.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    for (let i = 0; i < this.streakPos.length; i++) {
      const p = this.streakPos[i];
      const rx = p.x - C.x;
      const ry = p.y - C.y;
      const rz = p.z - C.z;
      const along = rx * gx + ry * gy + rz * gz;
      if (along < -30 || along > 260 || p.y < -9000) {
        const d = 60 + Math.random() * 190;
        const sx = (Math.random() * 2 - 1) * 34;
        const sy = (Math.random() * 2 - 1) * 22;
        p.set(C.x + gx * d - fz * sx, C.y + gy * d + sy, C.z + gz * d + fx * sx);
      }
      arr[i * 6] = p.x;
      arr[i * 6 + 1] = p.y;
      arr[i * 6 + 2] = p.z;
      arr[i * 6 + 3] = p.x - gx * len;
      arr[i * 6 + 4] = p.y - gy * len;
      arr[i * 6 + 5] = p.z - gz * len;
    }
    st.geometry.getAttribute('position').needsUpdate = true;
    (st.material as THREE.LineBasicMaterial).opacity = Math.min(0.42, 0.12 + (v - 45) / 400 + this.sim.turb * 0.4);
  }

  private updateAirportLights(): void {
    const ca = this.lights.geometry.getAttribute('color') as THREE.BufferAttribute;
    const ph = (this.t * 2.2) % 1;
    for (let i = 0; i < this.nApp; i++) {
      const k = 1 - i / this.nApp;
      const on = Math.abs(k - ph) < 0.04 ? 3 : 0.35;
      ca.setXYZ(this.appStart + i, on, on, on);
    }
    ca.needsUpdate = true;
    // PAPI: brancas acima do ângulo, vermelhas abaixo
    const pa = this.papi.geometry.getAttribute('color') as THREE.BufferAttribute;
    const cp = this.wcam.position;
    const ang = (Math.atan2(cp.y, Math.max(1, cp.z + 330)) * 180) / Math.PI;
    const th = [3.5, 3.17, 2.83, 2.5];
    for (let i = 0; i < 4; i++) {
      if (ang > th[i]) pa.setXYZ(i, 1.4, 1.4, 1.3);
      else pa.setXYZ(i, 1.6, 0.12, 0.12);
    }
    pa.needsUpdate = true;
  }

  /* ------------------------------ câmeras ------------------------------ */

  private fpCamera(dt: number, intro: boolean): void {
    const s = this.sim;
    const me = s.players[s.me];
    const cam = this.cam;
    const look = this.lookD;
    if (intro) {
      // dentro da cabine: olhando o comandante
      const k = this.cut;
      const sh = k > 8.4 ? Math.sin(k * 40) * 0.01 * Math.max(0, 9.4 - k) : 0;
      // de frente para o comandante (entre o painel e os assentos)
      const dolly = Math.min(1, Math.max(0, (k - 6) / 2.2));
      cam.position.set(0.22 + sh - dolly * 0.12, 1.42 - dolly * 0.06, -3.48 + dolly * 0.06);
      _v.set(0.5, 0.92 + (k > 8.4 ? -0.12 : 0), -2.85);
      cam.lookAt(_v);
      cam.rotation.z += sh * 2;
      this.hand.visible = false;
      look.x = look.y = 0;
      cam.updateMatrixWorld();
      this.syncWorldCam(cam, 1.5);
      return;
    }
    this.hand.visible = true;
    const seated = me.seated;
    const portrait = this.ch > this.cw;
    if (seated !== this.wasSeated || (seated && portrait !== this.wasPortrait)) {
      this.wasSeated = seated;
      this.wasPortrait = portrait;
      this.yaw = Math.PI;
      // sentado: horizonte a ~40% do topo, pista visível na final e o painel embaixo
      // em pé (retrato) olha mais para baixo: painel no meio da tela, longe dos controles de baixo
      this.pitch = seated ? (portrait ? -0.33 : -0.15) : -0.05;
    }
    this.yaw -= look.x;
    this.pitch = clamp(this.pitch - look.y, -1.2, 1.1);
    const lx = look.x;
    const ly = look.y;
    look.x = look.y = 0;
    if (seated) {
      this.yaw = clamp(this.yaw, Math.PI - 1.4, Math.PI + 1.4);
      this.pitch = clamp(this.pitch, -0.7, 0.5);
    }
    // andar com a sensação da Cozinha: balanço de cabeça 0,025 m a ~9 Hz, leve rolagem, sem tremedeira
    const walk = Math.hypot(me.vx, me.vz);
    const speedK = Math.min(1, walk / 3.3);
    this.bobT += dt * 9 * speedK;
    const bobY = Math.sin(this.bobT * 2) * 0.025 * speedK;
    const bobRoll = Math.cos(this.bobT) * 0.008 * speedK;
    const stun = me.stun > 0 ? Math.sin(Math.min(1, me.stun) * Math.PI) : 0;
    // tremor: só por estol (buffet) e rajadas/solavancos da turbulência — suave e proporcional
    const sh = this.shakeAmt();
    const shx = Math.sin(this.t * 19.7) * sh * 0.02;
    const shy = Math.sin(this.t * 15.3 + 0.7) * sh * 0.025 + Math.sin(this.t * 31.1) * sh * 0.008;
    if (seated) cam.position.set(SPOTS.pilot.x, 1.5, SPOTS.pilot.z - 0.02);
    else {
      // posição interpolada entre passos (andar liso em 60/90/120 Hz) e afastada dos móveis
      const k = s.lerpK;
      const mx = (me.ox ?? me.x) + (me.x - (me.ox ?? me.x)) * k;
      const mz = (me.oz ?? me.z) + (me.z - (me.oz ?? me.z)) * k;
      const [cx, cz] = camClamp(mx, mz);
      cam.position.set(cx, EYE + bobY - stun * 0.55, cz);
    }
    cam.position.x += shx;
    cam.position.y += shy;
    const dz = s.dizzy;
    const wob = dz > 0 ? Math.sin(this.t * 1.3) * 0.06 * dz : 0;
    cam.rotation.set(this.pitch + wob * 0.5 + shy * 0.6, this.yaw + Math.PI, -s.acc.x * 0.012 + stun * 0.5 + wob + bobRoll, 'YXZ');
    cam.updateMatrixWorld();
    this.syncWorldCam(cam, clamp(s.f.alt * 0.03, 2, 40));
    // mão
    const held = s.item(me.hold);
    this.hand.setPose(held || seated ? 'grab' : 'open');
    this.hand.scrub = me.actKind === 'hug' || me.actKind === 'door' || me.actKind === 'patch' ? 1 : 0;
    this.hand.update(dt, speedK, lx, ly);
    this.hand.visible = true; // sentado: a mão fica na manete (canto de baixo), menor e mais para o canto
    this.hand.sizeMul = seated ? 0.68 : 1;
    this.hand.offX = seated ? 0.3 : 0;
    this.hand.offY = seated ? -0.42 : 0;
    // retrato: o manche 3D ficaria no meio, embaixo da tela (o manche de toque já faz esse papel)
    this.cab.yokeL.visible = !(seated && portrait);
  }

  /** intensidade do tremor da câmera: buffet de estol + carga vertical da turbulência + solavancos */
  private shakeAmt(): number {
    const s = this.sim;
    if (!s.flying) return this.shake * 0.5;
    const turbG = Math.abs(s.acc.y) / 9.8;
    return clamp(s.f.buffet * 0.8 + (s.turb > 0 ? turbG * 1.4 + s.turb * 0.25 : 0) + this.shake * 0.6, 0, 1.6);
  }
  private bobT = 0;

  private syncWorldCam(cam: THREE.Camera, near: number): void {
    _m.multiplyMatrices(this.planeOff.matrixWorld, cam.matrixWorld);
    _m.decompose(this.wcam.position, this.wcam.quaternion, _s);
    if (Math.abs(this.wcam.near - near) > 0.5) {
      this.wcam.near = near;
      this.wcam.updateProjectionMatrix();
    }
  }

  private extCamera(dt: number, intro: boolean, _me: unknown): void {
    const c = this.wcam;
    const P = this.planeObj.position;
    this.hand.visible = false;
    if (intro) {
      const k = this.cut;
      if (k < 3.4) {
        // ao lado da pista, girando
        const a = -0.9 + k * 0.32;
        c.position.set(P.x + Math.sin(a) * 42, 3 + k * 1.2, P.z - Math.cos(a) * 42 + 8);
        c.lookAt(P.x, P.y + 1, P.z);
      } else {
        // perseguição por trás e por baixo, rumo ao sol
        const k2 = k - 3.4;
        c.position.set(P.x + 22 - k2 * 4, Math.max(2.5, P.y - 6 + k2 * 2), P.z + 55 + k2 * 6);
        c.lookAt(P.x, P.y + 2, P.z - 10);
      }
    } else if (this.ending) {
      const e = this.ending;
      const a = e.hdg + 1.9 + e.t * 0.18;
      const d = e.kind === 'crash' ? 46 : 40;
      c.position.set(P.x + Math.sin(a) * d, (e.kind === 'crash' ? 9 : 6) + Math.sin(e.t * 0.4) * 2, P.z - Math.cos(a) * d);
      c.lookAt(P.x, 2, P.z);
      this.updatePoppers(dt);
    } else {
      // câmera externa: atrás (volta sozinha depois de ~2,5 s parada) ou órbita livre; nunca entra no chão
      const o = this.orb;
      const ps = this.sim.pose();
      if (!o.init) {
        o.init = true;
        o.hdg = ps.hdg;
      }
      o.hdg += wrapA(ps.hdg - o.hdg) * Math.min(1, dt * (this.camMode === 1 ? 2.2 : 4));
      if (this.camMode === 1 && this.t - o.t > 2.5) {
        const k = Math.min(1, dt * 1.4);
        o.az += wrapA(0 - o.az) * k;
        o.el += (0.16 - o.el) * k;
        o.dist += (48 - o.dist) * k;
      }
      _v2.set(0, 1.2, CG_Z - 2);
      this.planeOff.localToWorld(_v2);
      const a = o.hdg + o.az;
      const ce = Math.cos(o.el);
      c.position.set(_v2.x - Math.sin(a) * ce * o.dist, _v2.y + Math.sin(o.el) * o.dist, _v2.z + Math.cos(a) * ce * o.dist);
      // tremor proporcional à turbulência/estol (suave, sem ruído por quadro)
      const sh = this.shakeAmt();
      if (sh > 0.001) {
        c.position.x += Math.sin(this.t * 17.3) * sh * 0.5;
        c.position.y += Math.sin(this.t * 13.1 + 1) * sh * 0.6;
      }
      c.position.y = Math.max(c.position.y, 2.2);
      c.up.copy(UP);
      if (this.camMode === 1) c.up.applyQuaternion(this.planeObj.quaternion).lerp(UP, 0.75).normalize();
      c.lookAt(_v2);
      c.up.copy(UP);
    }
    if (c.near !== 1) {
      c.near = 1;
      c.updateProjectionMatrix();
    }
    c.updateMatrixWorld();
  }

  /* ------------------------------ interior ------------------------------ */

  private updateCabin(dt: number, intro: boolean): void {
    const s = this.sim;
    const f = s.f;
    const cab = this.cab;
    const act = s.active();
    const alarm = !intro && act.some((e) => e.kind !== 'turb' && e.kind !== 'panic');
    const red = alarm || (intro && this.cut > 8.4) ? 0.5 + 0.5 * Math.sin(this.t * 7) : 0;
    (cab.alarmLamps.material as THREE.MeshBasicMaterial).color.setRGB(0.25 + red * 2.2, 0.05, 0.08 + red * 0.2);
    if (this.redLight) this.redLight.intensity = red * 2.2;
    else this.hemi.groundColor.set('#6a5a8a').lerp(_c.set('#a0303a'), red * 0.5);
    // luzes piscando na pane elétrica
    const flick = s.flicker && Math.random() < 0.12 ? 0.25 : 1;
    (cab.lights.material as THREE.MeshBasicMaterial).color.setScalar(flick);
    this.hemi.intensity = (this.q.standard ? 1.5 : 2.1) * (0.75 + flick * 0.25);
    // manche, manetes, alavancas
    const me = s.players[s.me];
    const pilot = s.pilot;
    const sx = pilot && !pilot.bot ? s.ctrl.sx : 0;
    const sy = pilot && !pilot.bot ? s.ctrl.sy : 0;
    cab.yokeL.rotation.z = -sx * 0.6;
    cab.yokeL.position.z = (cab.yokeL.userData.z0 as number) - sy * 0.06;
    cab.throttle.rotation.x = -0.5 + f.thr * 1.0;
    cab.flapLever.rotation.x = -0.4 + f.flaps * 0.4;
    cab.gearLever.position.y = (cab.gearLever.userData.y0 as number) - (f.gear ? 0.1 : 0);
    // comandante
    const cap = this.captain;
    if (intro) {
      const k = this.cut;
      const faint = ease((k - 8.2) / 0.5);
      cap.geometry = k < 7.6 ? this.capGeo[0] : this.capGeo[1];
      const sway = k > 7.6 && k < 8.3 ? Math.sin((k - 7.6) * 14) * 0.25 : 0;
      const yawn = k > 7.0 && k < 7.6 ? Math.sin(((k - 7.0) / 0.6) * Math.PI) * 0.15 : 0;
      cap.position.set(0.55, 0.42 - faint * 0.12, -2.88 - faint * 0.12);
      cap.rotation.set(-faint * 0.75, sway * 0.3, sway - faint * 0.35);
      cap.scale.set(1 - yawn * 0.4, 1 + yawn, 1);
      cab.yokeR.rotation.z = Math.sin(k * 1.3) * 0.08 * (1 - faint) + faint * 0.3;
    } else {
      cap.geometry = this.capGeo[1];
      // desmaiado recostado na poltrona e caído para a janela (fora da vista do piloto)
      cap.position.set(0.62, 0.4, -2.68);
      cap.rotation.set(0.3, 0, -0.55 + Math.sin(this.t * 0.9) * 0.03);
      cap.scale.set(1 + Math.sin(this.t * 1.6) * 0.02, 1 - Math.sin(this.t * 1.6) * 0.02, 1);
      cab.yokeR.rotation.z = 0.3 + sx * 0.2;
    }
    // tripulação (outros jogadores/bots)
    for (const p of s.players) {
      if (p.idx === s.me) continue;
      let v = this.crew.get(p.idx);
      if (!v) {
        const m = new THREE.Mesh(bloopGeo(handColors(p.skin), p.role, 'normal'), mat(this.q.standard, { rough: 0.55 }));
        m.castShadow = this.q.shadows;
        v = { mesh: m, role: p.role, stars: [] };
        this.cabin.add(m);
        this.crew.set(p.idx, v);
      }
      const m = v.mesh;
      if (p.seated) {
        m.position.set(SPOTS.pilot.x, 0.42, SPOTS.pilot.z + 0.02);
        m.rotation.set(0, 0, Math.sin(this.t * 0.8) * 0.03);
        m.scale.setScalar(CREW_S);
      } else {
        const sp = Math.hypot(p.vx, p.vz);
        const hop = Math.abs(Math.sin(p.walk * 3.2)) * 0.07 * Math.min(1, sp);
        m.position.set(p.x, hop, p.z);
        m.rotation.set(p.stun > 0 ? -1.2 : sp * 0.04, p.yaw + Math.PI, p.stun > 0 ? 0.4 : Math.sin(p.walk * 3.2) * 0.08 * Math.min(1, sp));
        const sq = p.actProg > 0 ? Math.sin(this.t * 14) * 0.04 : 0;
        m.scale.set(CREW_S * (1 + sq), CREW_S * (1 - sq), CREW_S * (1 + sq));
      }
      this.updateStars(v.stars, p.stun > 0, m.position.x, 1.6, m.position.z, 1.2);
      if (p.spraying) this.spray(p.x + Math.sin(p.yaw) * 0.45, 0.85, p.z + Math.cos(p.yaw) * 0.45, Math.sin(p.yaw), Math.cos(p.yaw));
    }
    for (const [idx, v] of this.crew)
      if (!s.players[idx]) {
        v.mesh.removeFromParent();
        this.crew.delete(idx);
      }
    // minhas estrelinhas de tontura + jato do extintor
    if (me.spraying) {
      _v.set(0.12, -0.12, -0.6).applyMatrix4(this.cam.matrixWorld);
      const [fx, fz] = this.facing();
      this.spray(_v.x, _v.y, _v.z, fx, fz);
    }
    // passageiros
    const cnt = new Array(16).fill(0);
    const bangList: { x: number; z: number; p: number }[] = [];
    this.paxBump = Math.max(0, this.paxBump - dt * 4);
    const bump = this.paxBump > 0 ? Math.sin(this.paxBump * 18) * 0.05 * this.paxBump : 0;
    for (let k = 0; k < s.pax.length; k++) {
      const p = s.pax[k];
      // rosto preocupado com histerese (não pisca entre as duas malhas)
      const was = this.paxWorried[k] ?? 0;
      const w = p.panic > 0.58 ? 1 : p.panic < 0.45 ? 0 : was;
      this.paxWorried[k] = w;
      const im = this.paxMeshes[p.skin * 2 + w];
      const i = cnt[p.skin * 2 + w]++;
      const ph = k * 1.37;
      if (p.mode === 0) {
        // sentado: preso à poltrona, com vida: respira, olha em volta, balança aflito, pula de alegria
        const sway = w ? Math.sin(p.bob * 3.2) * 0.1 * p.panic : 0;
        const happy = p.happyT > 0 ? Math.abs(Math.sin(p.bob * 5)) * 0.05 : 0;
        const breathe = 1 + Math.sin(p.bob * 1.9 + ph) * 0.018;
        const look = Math.sin(p.bob * 0.37 + ph) * 0.28 * Math.max(0, Math.sin(p.bob * 0.11 + ph * 3));
        _m.compose(_v.set(p.sx, 0.36 + happy + bump * (0.6 + (k % 3) * 0.2), p.sz - 0.05), _q.setFromEuler(_e.set(0, look, sway)), _v2.set(1, breathe, 1));
      } else if (p.mode === 1) {
        // em pé no espaço da própria fileira: pulinho de aflição, braços para cima (não bloqueia o corredor)
        const hop = Math.abs(Math.sin(p.bob * 3.4)) * 0.07;
        _m.compose(_v.set(p.x, hop, p.z), _q.setFromEuler(_e.set(0, p.yaw + Math.PI, Math.sin(p.bob * 5) * 0.08)), _v2.setScalar(1.05));
      } else {
        // andando no corredor (ou esperando no banheiro)
        const walking = p.mode === 2;
        const hop = walking ? Math.abs(Math.sin(p.bob * 6)) * 0.035 : 0;
        _m.compose(_v.set(p.x, hop, p.z), _q.setFromEuler(_e.set(walking ? 0.06 : 0, p.yaw + Math.PI, walking ? Math.sin(p.bob * 6) * 0.05 : 0)), _v2.setScalar(1.05));
      }
      im.setMatrixAt(i, _m);
      if (p.panic > 0.7) bangList.push({ x: p.x, z: p.z, p: p.panic });
    }
    this.paxMeshes.forEach((im, i) => {
      im.count = cnt[i];
      im.instanceMatrix.needsUpdate = true;
    });
    bangList.sort((a, b) => b.p - a.p);
    this.bangs.forEach((b, i) => {
      const e = bangList[i];
      b.visible = !!e;
      if (e) b.position.set(e.x, 1.25 + Math.sin(this.t * 6 + i) * 0.05, e.z);
    });
    // objetos
    this.updateItems(dt);
    this.updateService();
    // emergências
    this.updateEmers(dt, act, intro);
    // máscaras de oxigênio
    const press = act.some((e) => e.kind === 'pressure');
    if (press && !cab.masks.visible) {
      cab.masks.visible = true;
      this.lastMaskDrop = this.t;
    }
    if (!press) cab.masks.visible = false;
    if (cab.masks.visible) {
      const k = ease((this.t - this.lastMaskDrop) / 0.6);
      for (let i = 0; i < cab.maskBase.length; i++) {
        _m.copy(cab.maskBase[i]);
        _m.elements[13] += (1 - k) * 0.55 + Math.sin(this.t * 3 + i) * 0.02;
        _m.elements[12] += Math.sin(this.t * 2.3 + i * 1.7) * 0.03;
        cab.masks.setMatrixAt(i, _m);
      }
      cab.masks.instanceMatrix.needsUpdate = true;
    }
    // bagageiros abrem na turbulência
    const turb = act.some((e) => e.kind === 'turb');
    this.binOpen += ((turb ? 1 : 0) - this.binOpen) * Math.min(1, dt * (turb ? 6 : 1.2));
    cab.bins.children.forEach((d, i) => {
      const sd = d.userData.side as number;
      d.rotation.z = sd * (this.binOpen * (1.1 + Math.sin(this.t * 9 + i) * 0.15));
    });
  }

  private trayGeoFor(main: number, drink: number): THREE.BufferGeometry {
    const key = main * 10 + drink;
    let g = this.trayGeos.get(key);
    if (!g) {
      const gb = new GeoBuilder();
      gb.bevel = 1;
      gb.ao = false;
      trayGeo(gb, 0, 0, 0, main, drink);
      g = gb.build();
      this.trayGeos.set(key, g);
    }
    return g;
  }

  /** carrinho (posição, bandejas) e balões de pedido em cima das poltronas */
  private updateService(): void {
    const s = this.sim;
    const c = s.cart;
    this.cartM.position.set(c.x, 0, c.z);
    this.cartM.rotation.y = c.yaw;
    this.trayMs.forEach((m, i) => {
      const tr = c.trays[i];
      m.visible = !!tr;
      if (!tr) return;
      m.geometry = this.trayGeoFor(tr.main, tr.drink);
      m.position.set(0, 1.03 + (i >> 1) * 0.11, (i % 2 ? 0.17 : -0.17));
    });
    const seen = new Set<number>();
    for (const o of s.orders) {
      const q = s.pax[o.pax];
      if (!q) continue;
      seen.add(o.id);
      let b = this.bubbles.get(o.id);
      if (!b) {
        const [cv] = canvas(192, 96);
        const tex = new THREE.CanvasTexture(cv);
        tex.colorSpace = THREE.SRGBColorSpace;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
        sp.scale.set(0.5, 0.25, 1);
        sp.renderOrder = 5;
        this.cabin.add(sp);
        b = { sp, cv, tex, sig: '' };
        this.bubbles.set(o.id, b);
      }
      const sig = this.drawBubble(b.cv, o, seatLabel(q.seat), b.sig);
      if (sig !== b.sig) {
        b.sig = sig;
        b.tex.needsUpdate = true;
      }
      b.sp.position.set(q.sx, 1.62 + Math.sin(this.t * 2 + o.id) * 0.03, q.sz);
      // tamanho quase constante na tela (legível do fundo do corredor, sem tapar de perto)
      const dd = b.sp.position.distanceTo(this.cam.position);
      const sc = clamp(dd * 0.11, 0.42, 1.2);
      b.sp.scale.set(sc, sc * 0.5, 1);
      b.sp.visible = !s.players[s.me].seated || this.extCam;
    }
    for (const [id, b] of this.bubbles)
      if (!seen.has(id)) {
        b.sp.removeFromParent();
        b.sp.material.dispose();
        b.tex.dispose();
        this.bubbles.delete(id);
      }
  }
  /** balão: poltrona + ícones do pedido + tempo; devolve uma assinatura (só redesenha quando muda) */
  private drawBubble(cv: HTMLCanvasElement, o: Order, label: string, prev: string): string {
    const k = Math.max(0, Math.min(1, o.t / o.tmax));
    const ims = [o.main ? vIconImg(MAINS[o.main]) : null, o.drink ? vIconImg(DRINKS[o.drink]) : null].filter((x): x is HTMLImageElement => !!x);
    const ready = ims.every((im) => im.complete && im.naturalWidth > 0);
    const sig = `${Math.ceil(k * 12)}|${ready}|${o.tray >= 0}`;
    if (sig === prev) return sig;
    const x = cv.getContext('2d')!;
    x.clearRect(0, 0, 192, 96);
    x.lineWidth = 6;
    x.strokeStyle = INK;
    x.fillStyle = o.tray >= 0 ? '#e8fff0' : '#ffffff';
    x.beginPath();
    x.roundRect(6, 6, 180, 66, 20);
    x.moveTo(84, 72);
    x.lineTo(96, 90);
    x.lineTo(108, 72);
    x.fill();
    x.stroke();
    x.fillStyle = '#ffffff';
    x.fillRect(86, 66, 20, 8);
    x.fillStyle = INK;
    x.font = '900 28px Fredoka, system-ui, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(label, 40, 37);
    ims.forEach((im, i) => {
      if (im.complete && im.naturalWidth) x.drawImage(im, 74 + i * 52, 13, 48, 48);
    });
    // tempo
    x.fillStyle = 'rgba(42,11,92,.18)';
    x.fillRect(22, 60, 148, 6);
    x.fillStyle = k < 0.35 ? '#ff4d6a' : '#3fe06c';
    x.fillRect(22, 60, 148 * k, 6);
    return sig;
  }

  private spray(x: number, y: number, z: number, fx: number, fz: number): void {
    for (let i = 0; i < 3; i++) {
      const sp = 4 + Math.random() * 2;
      this.fx.emit(x, y, z, fx * sp + (Math.random() - 0.5), (Math.random() - 0.3) * 0.8, fz * sp + (Math.random() - 0.5), { tile: PT.Foam, color: '#ffffff', life: 0.45, size: 0.09, grow: 0.4, drag: 2.5 });
    }
  }

  private updateStars(list: THREE.Sprite[], on: boolean, x: number, y: number, z: number, scale: number): void {
    if (on && !list.length)
      for (let i = 0; i < 3; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.starTex, depthWrite: false }));
        sp.scale.setScalar(0.16 * scale);
        list.push(sp);
        (this.ending ? this.world : this.cabin).add(sp);
      }
    if (!on && list.length) {
      for (const sp of list) sp.removeFromParent(), sp.material.dispose();
      list.length = 0;
    }
    list.forEach((sp, i) => {
      const a = this.t * 4 + (i / list.length) * TAU;
      sp.position.set(x + Math.cos(a) * 0.32 * scale, y + Math.sin(this.t * 6 + i) * 0.04 * scale, z + Math.sin(a) * 0.32 * scale);
    });
  }

  private geoFor(kind: string, variant: number): THREE.BufferGeometry {
    const key = kind + variant;
    let g = this.itemGeos.get(key);
    if (!g) {
      g = itemGeo(kind as never, variant);
      this.itemGeos.set(key, g);
    }
    return g;
  }

  private updateItems(dt: number): void {
    const s = this.sim;
    const me = s.players[s.me];
    const seen = new Set<number>();
    for (const it of s.items) {
      if (!it.alive) continue;
      seen.add(it.id);
      let m = this.itemMeshes.get(it.id);
      if (!m) {
        m = new THREE.Mesh(this.geoFor(it.kind, it.id), this.itemMat);
        m.castShadow = this.q.shadows;
        this.itemMeshes.set(it.id, m);
        this.cabin.add(m);
      }
      if (it.held === me.idx && !me.seated) {
        // na minha mão (filho da câmera)
        if (m.parent !== this.cam) {
          this.cam.add(m);
          m.renderOrder = 101;
          (m.material as THREE.Material).depthTest = true;
        }
        this.hand.grip(_v);
        m.position.copy(_v).add(_v2.set(-0.02, it.kind === 'ext' ? 0.06 : 0.02, -0.04));
        m.rotation.set(0.15, it.kind === 'ext' ? 0.4 : 0.2, -0.2);
        m.scale.setScalar(this.hand.k * (it.kind === 'ext' ? 0.42 : 0.6));
      } else {
        if (m.parent !== this.cabin) {
          this.cabin.add(m);
          m.renderOrder = 0;
          m.scale.setScalar(1);
        }
        const held = it.held >= 0;
        m.position.set(it.x, held ? 0.7 : it.y + (it.kind === 'bag' ? 0.06 : it.kind === 'ext' ? 0.12 : 0.02), it.z);
        m.rotation.set(held ? 0 : Math.sin(it.rot) * 0.3, it.rot, held ? 0 : Math.cos(it.rot * 0.7) * 0.4);
      }
    }
    for (const [id, m] of this.itemMeshes)
      if (!seen.has(id)) {
        m.removeFromParent();
        this.itemMeshes.delete(id);
      }
    void dt;
  }

  private updateEmers(dt: number, act: ReturnType<Sim['active']>, intro: boolean): void {
    const s = this.sim;
    const cab = this.cab;
    let gi = 0;
    let bestFire = 0;
    const fl = this.flames;
    const ps = this.fx;
    for (const e of act) {
      if (e.kind === 'fire') {
        const eng = e.spot === 'engL' || e.spot === 'engR';
        const sd = e.spot === 'engL' ? -1 : 1;
        const n = Math.random() < dt * 60 * Math.min(1, e.sev) ? 2 : 1;
        for (let i = 0; i < n; i++) {
          if (eng) {
            fl.emit(sd * 6 + (Math.random() - 0.5), -1.1, 11 + Math.random() * 1.2, (Math.random() - 0.5) * 2, 1 + Math.random(), 8 + Math.random() * 6, { tile: PT.Smoke, color: Math.random() < 0.5 ? '#ff8a2a' : '#ffd34a', life: 0.5, size: 0.9, grow: 1.2 });
            ps.emit(sd * 6, -0.8, 12.4, 0, 0.5, 14, { tile: PT.Smoke, color: '#4a4a55', life: 1.2, size: 1.0, grow: 3 });
          } else {
            const r = 0.25 + e.sev * 0.25;
            fl.emit(e.x + (Math.random() - 0.5) * r, e.y - 0.05, e.z + (Math.random() - 0.5) * r, (Math.random() - 0.5) * 0.3, 0.8 + Math.random() * 0.9, (Math.random() - 0.5) * 0.3, { tile: PT.Smoke, color: Math.random() < 0.4 ? '#ffd34a' : '#ff6a2a', life: 0.45 + Math.random() * 0.3, size: 0.2 + e.sev * 0.18, grow: -0.2 });
            if (Math.random() < 0.3) ps.emit(e.x, e.y + 0.3, e.z, (Math.random() - 0.5) * 0.2, 0.6, (Math.random() - 0.5) * 0.2, { tile: PT.Smoke, color: '#5a5060', life: 1.6, size: 0.25, grow: 0.5 });
          }
        }
        if (!eng && gi < this.fireGlows.length) {
          const g = this.fireGlows[gi++];
          g.visible = true;
          g.position.set(e.x, e.y + 0.1, e.z);
          g.scale.setScalar(0.9 + e.sev * 0.9 + Math.sin(this.t * 20 + gi) * 0.1);
        }
        if (!eng && e.sev > bestFire && this.fireLight) {
          bestFire = e.sev;
          this.fireLight.position.set(e.x * 0.8, e.y + 0.4, e.z);
        }
      } else if (e.kind === 'spark') {
        if (Math.random() < dt * 14) ps.burst(e.x - 0.08, e.y + (Math.random() - 0.5) * 0.4, e.z + (Math.random() - 0.5) * 0.4, 6, 'spark', '#9ff4ff', 2);
      } else if (e.kind === 'leak' && e.stage === 0) {
        if (Math.random() < dt * 10) ps.emit(SPOTS.leak.x + 0.2, 0.55, SPOTS.leak.z + (Math.random() - 0.5) * 0.2, 0.6, 0, 0, { tile: PT.Foam, color: '#b07aff', life: 0.6, size: 0.05, grav: 6 });
      } else if (e.kind === 'door' && e.stage === 1) {
        const dz = SPOTS[e.spot as 'doorF'].z;
        for (let i = 0; i < 2; i++) ps.emit((Math.random() - 0.5) * 2, 0.4 + Math.random() * 1.6, dz + (Math.random() - 0.5) * 8, -6, 0, (dz - (dz + (Math.random() - 0.5) * 8)) * 0.8, { tile: PT.Foam, color: '#ffffff', life: 0.5, size: 0.02, grow: 0 });
      } else if (e.kind === 'bird' && e.stage === 1) {
        if (Math.random() < dt * 20) ps.emit(e.x * 0.5, 0.6 + Math.random() * 1.3, e.z + (Math.random() - 0.5) * 3, e.x > 0 ? 5 : -5, 0, 0, { tile: PT.Foam, color: '#ffffff', life: 0.45, size: 0.02 });
      }
    }
    for (; gi < this.fireGlows.length; gi++) this.fireGlows[gi].visible = false;
    if (this.fireLight) this.fireLight.intensity = bestFire > 0 ? 2 + bestFire * 2 + Math.sin(this.t * 25) * 0.5 : 0;
    // forno brilhando
    const oven = act.find((e) => e.kind === 'fire' && e.spot === 'oven');
    (cab.ovenGlow.material as THREE.MeshBasicMaterial).color.set(oven ? (Math.sin(this.t * 18) > 0 ? '#ff8a2a' : '#ffcf3a') : '#3a2a3a');
    // painel elétrico aberto
    const spark = act.find((e) => e.kind === 'spark');
    cab.elecDoor.rotation.y += ((spark ? -1.4 + Math.sin(this.t * 13) * 0.08 : 0) - cab.elecDoor.rotation.y) * Math.min(1, dt * 6);
    // portas
    for (const [spot, g] of [
      ['doorF', cab.doorF],
      ['doorR', cab.doorR],
    ] as const) {
      const e = act.find((x) => x.kind === 'door' && x.spot === spot);
      const open = e && e.stage === 1 ? 1 : 0;
      const shake = e && e.stage === 0 ? Math.sin(this.t * 30) * 0.03 * (0.3 + e.sev) : 0;
      g.rotation.y += ((open ? 1.3 : 0) + shake - g.rotation.y) * Math.min(1, dt * (open ? 3 : 12));
    }
    // válvula, manivela e bomba seguem o progresso
    const pr = act.find((e) => e.kind === 'pressure');
    cab.valve.rotation.x = (pr ? pr.prog : 0) * TAU * 3;
    const gear = act.find((e) => e.kind === 'gear');
    cab.crank.rotation.y = (gear ? gear.prog : s.gearStuck ? 0 : 1) * TAU * 8;
    const leak = act.find((e) => e.kind === 'leak');
    cab.pump.rotation.z = leak && leak.stage === 1 ? Math.sin(leak.prog * 40) * 0.5 : 0;
    // poça de combustível
    const ps2 = leak && leak.stage === 0 ? Math.min(1.4, 0.2 + leak.age * 0.03) : Math.max(0.01, this.puddle.scale.x - dt * 0.2);
    this.puddle.scale.setScalar(ps2);
    // janelas trincadas / quebradas
    for (const e of act) {
      if (e.kind !== 'bird') continue;
      let m = this.cracks.get(e.id);
      if (!m) {
        m = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.46), new THREE.MeshBasicMaterial({ map: this.crackTex, transparent: true, depthWrite: false }));
        const sd = e.x > 0 ? 1 : -1;
        m.position.set(sd * 1.76, 1.25, e.z);
        m.rotation.y = -sd * (Math.PI / 2);
        this.cracks.set(e.id, m);
        this.cabin.add(m);
      }
      (m.material as THREE.MeshBasicMaterial).opacity = 0.35 + e.sev * 0.65;
      m.scale.setScalar(0.6 + e.sev * 0.4);
      const w = cab.wins.find((x) => Math.abs(x.z - e.z) < 0.01 && Math.sign(x.x) === Math.sign(e.x));
      if (w) w.glass.visible = e.stage === 0;
    }
    for (const [id, m] of this.cracks)
      if (!act.some((e) => e.id === id)) {
        m.removeFromParent();
        this.cracks.delete(id);
        for (const w of cab.wins) w.glass.visible = true;
      }
    void intro;
  }

  /* ------------------------------ eventos ------------------------------ */

  onEv(ev: Ev): void {
    const s = this.sim;
    if (ev.k === 'jolt') {
      this.shake = Math.min(1.5, this.shake + ev.amt * 0.4);
      if (ev.amt > 0.8) this.paxBump = Math.min(1, ev.amt * 0.35);
    }
    else if (ev.k === 'fx') {
      const y = ev.y ?? 1;
      if (ev.t === 'fireOut') this.fx.burst(ev.x, y, ev.z, 26, 'steam', '#e8e8f0', 1.2);
      else if (ev.t === 'spark') this.fx.burst(ev.x, y, ev.z, 10, 'spark', '#9ff4ff', 2.2);
      else if (ev.t === 'glass') this.fx.burst(ev.x, y, ev.z, 24, 'chunk', '#cfefff', 2.5);
      else if (ev.t === 'calm') this.fx.burst(ev.x, y + 0.2, ev.z, 8, 'spark', '#ff7ab8', 1);
      else if (ev.t === 'fixed') this.fx.burst(ev.x, y, ev.z, 14, 'spark', '#7aff9a', 1.6);
      else if (ev.t === 'stun') this.fx.burst(ev.x, 1.1, ev.z, 6, 'spark', '#ffd34a', 1);
      else if (ev.t === 'patch') {
        const key = Math.round(ev.x * 10) + ':' + Math.round(ev.z * 10);
        if (!this.patched.has(key)) {
          this.patched.add(key);
          const tp = tapeX(this.q.standard);
          const sd = ev.x > 0 ? 1 : -1;
          tp.position.set(sd * (Math.abs(ev.x) > 1.6 ? 1.74 : Math.abs(ev.x) - 0.02), y, ev.z);
          tp.rotation.y = -sd * (Math.PI / 2);
          tp.rotation.order = 'YXZ';
          this.cab.tapePatches.add(tp);
        }
      }
    } else if (ev.k === 'touch') {
      const f = s.f;
      this.ending = { t: 0, kind: ev.out.kind, base: new THREE.Vector3(f.x, 0, f.z), hdg: f.hdg, poppers: [] };
      this.wfx.burst(f.x, 0.5, f.z, 30, 'poof', '#e8e2ea', 6);
      if (ev.out.kind === 'crash') this.makePoppers();
    }
  }

  private makePoppers(): void {
    const s = this.sim;
    const e = this.ending!;
    const geos: THREE.BufferGeometry[] = [];
    for (const p of s.players) geos.push(bloopGeo(handColors(p.skin), p.role, 'spiral'));
    geos.push(this.capGeo[1]);
    for (let i = 0; i < 6; i++) geos.push(bloopGeo(handColors(PAX_SKINS[i]), -1, 'spiral', 0.85));
    geos.forEach((g, i) => {
      const m = new THREE.Mesh(g, mat(this.q.standard, { rough: 0.55 }));
      m.scale.setScalar(2.2);
      m.visible = false;
      this.world.add(m);
      const a = (i / geos.length) * TAU;
      e.poppers.push({ mesh: m, p: new THREE.Vector3(), v: new THREE.Vector3(Math.cos(a) * (6 + Math.random() * 5), 16 + Math.random() * 8, Math.sin(a) * (6 + Math.random() * 5)), spin: (Math.random() - 0.5) * 12, landed: false, stars: [], delay: 1.6 + i * 0.12 });
    });
  }

  private updatePoppers(dt: number): void {
    const e = this.ending!;
    const P = this.planeObj.position;
    for (const pp of e.poppers) {
      if (e.t < pp.delay) continue;
      if (!pp.mesh.visible) {
        pp.mesh.visible = true;
        pp.p.set(P.x, P.y + 4, P.z);
        this.wfx.burst(pp.p.x, pp.p.y, pp.p.z, 6, 'poof', '#ffffff', 4);
      }
      if (!pp.landed) {
        pp.v.y -= 26 * dt;
        pp.p.addScaledVector(pp.v, dt);
        pp.mesh.rotation.x += pp.spin * dt;
        if (pp.p.y <= 0) {
          pp.p.y = 0;
          pp.landed = true;
          pp.mesh.rotation.set(0, Math.random() * TAU, 0);
          this.wfx.burst(pp.p.x, 0.3, pp.p.z, 5, 'poof', '#d8c8a8', 3);
        }
      }
      pp.mesh.position.copy(pp.p);
      if (pp.landed) {
        pp.mesh.scale.set(2.2 + Math.sin(e.t * 9) * 0.06, 2.2 - Math.sin(e.t * 9) * 0.06, 2.2);
        this.updateStars(pp.stars, true, pp.p.x, pp.p.y + 3.0, pp.p.z, 4);
      }
    }
    if (e.kind === 'crash' && Math.random() < dt * 6) this.wfx.emit(P.x + (Math.random() - 0.5) * 8, P.y + 3, P.z + (Math.random() - 0.5) * 20, 0, 3, 0, { tile: PT.Smoke, color: '#6a6470', life: 2.5, size: 4, grow: 4 });
    if (e.kind !== 'crash' && e.kind !== 'rough' && Math.random() < dt * 10)
      this.wfx.emit(P.x + (Math.random() - 0.5) * 6, P.y + 8, P.z, (Math.random() - 0.5) * 10, 10, (Math.random() - 0.5) * 10, { tile: PT.Chunk, color: ['#ff5cae', '#ffd34a', '#46d9e6', '#7aff9a'][Math.floor(Math.random() * 4)], life: 2.4, size: 1.4, grav: 8 });
  }

  destroy(): void {
    disposeEnv();
    this.cloudF.dispose();
    this.r.dispose();
    this.fx.dispose();
    this.flames.dispose();
    this.wfx.dispose();
    this.hand.dispose();
    const done = new Set<unknown>();
    const free = (o: THREE.Object3D) =>
      o.traverse((n) => {
        const m = n as THREE.Mesh;
        if (m.geometry && !done.has(m.geometry)) done.add(m.geometry), m.geometry.dispose();
        const mt = m.material as THREE.Material | THREE.Material[] | undefined;
        if (mt) for (const x of Array.isArray(mt) ? mt : [mt]) if (!done.has(x)) done.add(x), x.dispose();
      });
    free(this.world);
    free(this.cabin);
    for (const d of this.dispose) d.dispose();
    this.canvas.remove();
  }
}

export async function createView3D(root: HTMLElement, sim: Sim, tier: Tier, o: ViewOpts): Promise<View3D> {
  return new View3D(root, sim, tier, o);
}
export { GS };
