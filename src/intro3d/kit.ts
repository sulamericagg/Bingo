/* ============================================================
 *  INTRO 3D — kit compartilhado pelas cenas: materiais, céu, estrelas,
 *  brilhos (bloom "falso" barato), Bloop em billboard, caminhos de câmera
 *  suaves (Hermite em função do tempo), easing e cache de geometria.
 * ============================================================ */
import * as THREE from 'three';
import { GeoBuilder } from '../3d/common/geo';
import { Particles } from '../3d/common/particles';
import { canvas } from '../3d/common/tex';
import { drawPlayer, type PlayerPose } from '../game/character';
import { skinById } from '../game/skins';
import { save } from '../core/storage';
import type { HubTheme } from '../hub/registry';
import type { Sting } from './sting';

export type V3 = [number, number, number];

/* ------------------------------ easing ------------------------------ */
export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
/** 0..1 entre a e b (linear, presa) */
export const seg = (t: number, a: number, b: number): number => clamp01((t - a) / (b - a));
export const smooth = (x: number): number => x * x * (3 - 2 * x);
export const inOut = (x: number): number => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const outCubic = (x: number): number => 1 - Math.pow(1 - x, 3);
export const inCubic = (x: number): number => x * x * x;
export const outBack = (x: number, s = 1.7): number => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);
export const outElastic = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1);
/** salto: 0→1→0 em parábola */
export const arc = (x: number): number => 4 * x * (1 - x);

/** pseudo-aleatório determinístico (cenas iguais a cada vez) */
export function rng(seed = 1): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/* --------------------------- caminho de câmera --------------------------- */
export interface CamKey {
  t: number;
  p: V3;
  /** ponto para onde olha */
  l: V3;
  fov?: number;
  /** giro (rad) */
  r?: number;
}

/** Hermite cúbico por canal com tangentes Catmull-Rom NO TEMPO (velocidade contínua); pontas com velocidade 0. */
function herm(ts: number[], vs: number[], t: number): number {
  const n = ts.length;
  if (t <= ts[0]) return vs[0];
  if (t >= ts[n - 1]) return vs[n - 1];
  let i = 0;
  while (i < n - 2 && t > ts[i + 1]) i++;
  const t0 = ts[i];
  const t1 = ts[i + 1];
  const h = t1 - t0;
  const m = (k: number): number => (k <= 0 || k >= n - 1 ? 0 : (vs[k + 1] - vs[k - 1]) / (ts[k + 1] - ts[k - 1]));
  const u = (t - t0) / h;
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * vs[i] + (u3 - 2 * u2 + u) * h * m(i) + (-2 * u3 + 3 * u2) * vs[i + 1] + (u3 - u2) * h * m(i + 1);
}

export class CamPath {
  private ts: number[];
  private ch: number[][];
  constructor(keys: CamKey[], baseFov: number) {
    this.ts = keys.map((k) => k.t);
    this.ch = [];
    for (let c = 0; c < 8; c++)
      this.ch.push(keys.map((k) => (c < 3 ? k.p[c] : c < 6 ? k.l[c - 3] : c === 6 ? (k.fov ?? baseFov) : (k.r ?? 0))));
  }
  get(t: number, out: number[]): number[] {
    for (let c = 0; c < 8; c++) out[c] = herm(this.ts, this.ch[c], t);
    return out;
  }
}

/* ------------------------------ texturas ------------------------------ */
let glowTex: THREE.CanvasTexture | null = null;
let beamTex: THREE.CanvasTexture | null = null;

function makeGlow(): THREE.CanvasTexture {
  const [cv, c] = canvas(128, 128);
  const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.22)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** faixa vertical macia (fachos de luz, rastros) */
function makeBeam(): THREE.CanvasTexture {
  const [cv, c] = canvas(64, 128);
  const g = c.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 128);
  c.globalCompositeOperation = 'destination-in';
  const v = c.createLinearGradient(0, 0, 0, 128);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(0.35, 'rgba(0,0,0,0.8)');
  v.addColorStop(1, 'rgba(0,0,0,1)');
  c.fillStyle = v;
  c.fillRect(0, 0, 64, 128);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Bloop desenhado pelo personagem 2D do jogo (skin equipada), num canvas → textura */
export function bloopCanvas(mood: PlayerPose['mood'] = 'happy', size = 256, lookX = 0.15, lookY = 0.1): HTMLCanvasElement {
  const [cv, c] = canvas(size, size);
  c.translate(size / 2, size * 0.5);
  const R = size * 0.34;
  try {
    drawPlayer(c, skinById(save.skin), R, { t: 0.3, blink: 0, lookX, lookY, sx: 1, sy: 1, mood, lx: -0.55, ly: -0.83, still: true });
  } catch {
    c.fillStyle = '#ff6fb5';
    c.beginPath();
    c.arc(0, 0, R, 0, 7);
    c.fill();
  }
  return cv;
}

/* ------------------------------ geometria em cache ------------------------------ */
/** geometria estática pré-computada uma vez por sessão (as cenas reabrem sem recalcular) */
const geoCache = new Map<string, THREE.BufferGeometry>();

/* ------------------------------ o kit ------------------------------ */
export interface Shot {
  /** duração da ação (s); o título entra perto do fim */
  dur: number;
  /** fundo da cena antes do primeiro quadro (cor css) */
  update(t: number, dt: number): void;
  /** agenda os sons (em segundos da cena) */
  sting?(s: Sting): void;
}
export type SceneFn = (k: Kit) => Shot;

export class Kit {
  readonly scene = new THREE.Scene();
  readonly cam: THREE.PerspectiveCamera;
  /** partículas normais (fumaça, poeira, pedaços) e aditivas (faíscas, fogo) */
  readonly fx: Particles;
  readonly fxAdd: Particles;
  readonly hi: boolean;
  private mats: THREE.Material[] = [];
  private texs: THREE.Texture[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private cv = [0, 0, 0, 0, 0, 0, 0, 0];
  /** tremor de câmera (decai sozinho) */
  shakeAmt = 0;
  /** flash de tela (0..1), cor */
  flashAmt = 0;
  flashCol = '#ffffff';
  /** fov vertical-base (paisagem); em retrato a engine abre o ângulo */
  baseFov = 50;
  aspect = 1;

  constructor(
    readonly tier: number,
    readonly theme: HubTheme,
  ) {
    this.cam = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
    this.hi = tier >= 2;
    const pf = [0.35, 0.6, 0.85, 1][tier] ?? 1;
    this.fx = new Particles(Math.round(500 * pf) + 60, false);
    this.fxAdd = new Particles(Math.round(500 * pf) + 60, true);
    this.fx.budget = this.fxAdd.budget = pf;
    this.fx.floorY = this.fxAdd.floorY = -1e6;
    this.scene.add(this.fx.obj, this.fxAdd.obj);
  }

  /* ---- materiais ---- */
  /** material com cor por vértice (Standard no Médio/Alto, Lambert abaixo) */
  std(o: { rough?: number; metal?: number; emissive?: string; ei?: number; flat?: boolean; side?: THREE.Side } = {}): THREE.Material {
    const m = this.hi
      ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: o.rough ?? 0.65, metalness: o.metal ?? 0, flatShading: o.flat, side: o.side })
      : new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: o.flat, side: o.side });
    if (o.emissive) {
      (m as THREE.MeshStandardMaterial).emissive.set(o.emissive);
      (m as THREE.MeshStandardMaterial).emissiveIntensity = o.ei ?? 1;
    }
    return this.own(m);
  }
  /** cor única com luz (Standard no Médio/Alto, Lambert abaixo) */
  solid(color: string, o: { rough?: number; metal?: number; emissive?: string; ei?: number; flat?: boolean; side?: THREE.Side; opacity?: number } = {}): THREE.Material {
    const tr = o.opacity !== undefined;
    const m = this.hi
      ? new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.6, metalness: o.metal ?? 0, flatShading: o.flat, side: o.side, transparent: tr, opacity: o.opacity ?? 1 })
      : new THREE.MeshLambertMaterial({ color, flatShading: o.flat, side: o.side, transparent: tr, opacity: o.opacity ?? 1 });
    if (o.emissive) {
      (m as THREE.MeshStandardMaterial).emissive.set(o.emissive);
      (m as THREE.MeshStandardMaterial).emissiveIntensity = o.ei ?? 1;
    }
    return this.own(m);
  }
  /** sombra de contato macia (disco escuro no chão) */
  blob(r: number, opacity = 0.35, parent: THREE.Object3D = this.scene): THREE.Mesh {
    const m = this.own(new THREE.MeshBasicMaterial({ map: this.glowTexture(), color: 0x000000, transparent: true, opacity, depthWrite: false, fog: false }));
    const g = this.ownGeo(new THREE.PlaneGeometry(r * 2, r * 2));
    g.rotateX(-Math.PI / 2);
    const me = new THREE.Mesh(g, m);
    me.renderOrder = 1;
    parent.add(me);
    return me;
  }
  /** cor sólida sem luz (brilhos, emissivos) */
  basic(color: string | number, o: { add?: boolean; opacity?: number; side?: THREE.Side; vc?: boolean; depthWrite?: boolean; map?: THREE.Texture } = {}): THREE.MeshBasicMaterial {
    const m = new THREE.MeshBasicMaterial({
      color,
      vertexColors: o.vc,
      transparent: o.add || o.opacity !== undefined,
      opacity: o.opacity ?? 1,
      blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: o.depthWrite ?? !o.add,
      side: o.side,
      map: o.map,
      fog: !o.add,
    });
    return this.own(m);
  }
  own<T extends THREE.Material>(m: T): T {
    this.mats.push(m);
    return m;
  }
  ownTex<T extends THREE.Texture>(t: T): T {
    this.texs.push(t);
    return t;
  }
  /** geometria temporária (descartada no fim) */
  ownGeo<T extends THREE.BufferGeometry>(g: T): T {
    this.geos.push(g);
    return g;
  }

  /* ---- geometria ---- */
  /** constrói (uma vez por sessão) uma malha mesclada com GeoBuilder */
  build(key: string, fn: (b: GeoBuilder) => void, bevel = 2): THREE.BufferGeometry {
    let g = geoCache.get(key);
    if (!g) {
      const b = new GeoBuilder();
      b.bevel = this.tier >= 2 ? bevel : Math.min(1, bevel);
      fn(b);
      g = b.build();
      geoCache.set(key, g);
    }
    return g;
  }
  mesh(g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D = this.scene): THREE.Mesh {
    const me = new THREE.Mesh(g, m);
    parent.add(me);
    return me;
  }

  /* ---- ambiente ---- */
  /** domo de céu com degradê (topo → horizonte → baixo) */
  sky(top: string, horizon: string, bottom = horizon, r = 300, sharp = 1.6): THREE.Mesh {
    const g = this.ownGeo(new THREE.SphereGeometry(r, 24, 16));
    const p = g.getAttribute('position');
    const col = new Float32Array(p.count * 3);
    const a = new THREE.Color(top).convertSRGBToLinear();
    const h = new THREE.Color(horizon).convertSRGBToLinear();
    const b = new THREE.Color(bottom).convertSRGBToLinear();
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / r;
      if (y >= 0) c.copy(h).lerp(a, Math.pow(y, 1 / sharp));
      else c.copy(h).lerp(b, Math.min(1, -y * 3));
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = this.basic(0xffffff, { vc: true, side: THREE.BackSide });
    m.fog = false;
    m.depthWrite = false;
    const me = this.mesh(g, m);
    me.renderOrder = -10;
    return me;
  }
  /** campo de estrelas (um só Points) */
  stars(n: number, r = 200, size = 1.4, seed = 3): THREE.Points {
    const R = rng(seed);
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const u = R() * 2 - 1;
      const a = R() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const rr = r * (0.7 + R() * 0.3);
      pos[i * 3] = Math.cos(a) * s * rr;
      pos[i * 3 + 1] = u * rr;
      pos[i * 3 + 2] = Math.sin(a) * s * rr;
      c.setHSL(0.55 + R() * 0.4, 0.6, 0.75 + R() * 0.25);
      const k = 0.4 + R() * 0.6;
      col[i * 3] = c.r * k;
      col[i * 3 + 1] = c.g * k;
      col[i * 3 + 2] = c.b * k;
    }
    const g = this.ownGeo(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = this.own(new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, map: this.glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const p = new THREE.Points(g, m);
    p.renderOrder = -9;
    this.scene.add(p);
    return p;
  }
  lights(skyCol: string, groundCol: string, sunCol: string, sun: V3, hemiI = 1.1, sunI = 2.2): THREE.DirectionalLight {
    this.scene.add(new THREE.HemisphereLight(skyCol, groundCol, hemiI));
    const d = new THREE.DirectionalLight(sunCol, sunI);
    d.position.set(...sun);
    this.scene.add(d);
    return d;
  }
  fog(col: string, near: number, far: number): void {
    this.scene.fog = new THREE.Fog(col, near, far);
  }

  glowTexture(): THREE.CanvasTexture {
    return (glowTex ??= makeGlow());
  }
  beamTexture(): THREE.CanvasTexture {
    return (beamTex ??= makeBeam());
  }
  /** sprite de brilho aditivo (o "bloom" barato de todos os níveis) */
  glow(color: string, size: number, opacity = 1, parent: THREE.Object3D = this.scene): THREE.Sprite {
    const m = this.own(new THREE.SpriteMaterial({ map: this.glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    const s = new THREE.Sprite(m);
    s.scale.setScalar(size);
    parent.add(s);
    return s;
  }
  /** Bloop como billboard (o mesmo desenho 2D do jogo) */
  bloop(size = 1, mood: PlayerPose['mood'] = 'happy', parent: THREE.Object3D = this.scene): THREE.Sprite {
    const t = this.ownTex(new THREE.CanvasTexture(bloopCanvas(mood)));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 2;
    const m = this.own(new THREE.SpriteMaterial({ map: t, transparent: true, fog: false, depthWrite: true, alphaTest: 0.08 }));
    const s = new THREE.Sprite(m);
    s.center.set(0.5, 0.5);
    s.scale.setScalar(size);
    parent.add(s);
    return s;
  }
  /** facho de luz (plano cruzado aditivo) — palco, sirene, sol */
  beam(color: string, w: number, h: number, opacity = 0.5, parent: THREE.Object3D = this.scene): THREE.Group {
    const gr = new THREE.Group();
    const m = this.own(new THREE.MeshBasicMaterial({ map: this.beamTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    const g = this.ownGeo(new THREE.PlaneGeometry(w, h));
    g.translate(0, -h / 2, 0);
    for (let i = 0; i < 2; i++) {
      const me = new THREE.Mesh(g, m);
      me.rotation.y = (i * Math.PI) / 2;
      gr.add(me);
    }
    parent.add(gr);
    return gr;
  }

  /* ---- câmera ---- */
  path(keys: CamKey[]): CamPath {
    return new CamPath(keys, this.baseFov);
  }
  /** aplica o caminho no tempo t (+ tremor) */
  follow(path: CamPath, t: number): void {
    const v = path.get(t, this.cv);
    const sh = this.shakeAmt;
    const j = sh ? (Math.random() - 0.5) * sh : 0;
    const j2 = sh ? (Math.random() - 0.5) * sh : 0;
    this.cam.position.set(v[0] + j, v[1] + j2, v[2]);
    this.cam.lookAt(v[3], v[4], v[5]);
    if (v[7]) this.cam.rotateZ(v[7]);
    this.setFov(v[6]);
  }
  /** fov vertical para paisagem; em retrato abre o ângulo para manter a largura enquadrada */
  setFov(f: number): void {
    const a = this.aspect;
    const ref = 1.25; // largura de referência
    let fov = f;
    if (a < ref) {
      const h = 2 * Math.atan(Math.tan((f * Math.PI) / 360) * ref);
      fov = Math.min(88, ((2 * Math.atan(Math.tan(h / 2) / a)) * 180) / Math.PI);
      // não abre tudo: meio-termo entre preservar largura e altura (retrato fica mais vertical)
      fov = f + (fov - f) * 0.78;
    }
    if (Math.abs(this.cam.fov - fov) > 1e-3) {
      this.cam.fov = fov;
      this.cam.updateProjectionMatrix();
    }
  }
  shake(a: number): void {
    this.shakeAmt = Math.max(this.shakeAmt, a);
  }
  flash(a: number, col = '#ffffff'): void {
    this.flashAmt = Math.max(this.flashAmt, a);
    this.flashCol = col;
  }

  dispose(): void {
    this.fx.dispose();
    this.fxAdd.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.texs) t.dispose();
    for (const g of this.geos) g.dispose();
    this.scene.clear();
  }
}

/** InstancedMesh com matriz por instância (multidões, anéis, árvores) */
export const M4 = new THREE.Matrix4();
export const Q = new THREE.Quaternion();
export const E = new THREE.Euler();
export const VA = new THREE.Vector3();
export const VB = new THREE.Vector3();
export function setInst(im: THREE.InstancedMesh, i: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s = 1, sy = s, sz = s): void {
  Q.setFromEuler(E.set(rx, ry, rz));
  M4.compose(VA.set(x, y, z), Q, VB.set(s, sy, sz));
  im.setMatrixAt(i, M4);
}
