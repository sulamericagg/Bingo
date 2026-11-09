/* ============================================================
 *  COZINHA MALUCA — renderizador 3D (three.js + cannon-es, chunk
 *  sob demanda). Mesma simulação do 2D. Cozinha modelada (bancadas,
 *  panelas, forno, pia...), personagens como "billboards" do drawPlayer,
 *  itens como sprites do atlas, itens derrubados com física de verdade.
 *  Qualidade: mesmo esquema da casa 3D (src/home3d/engine.ts q3For).
 * ============================================================ */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { QualityGovernor, detectInitialTier, loadMode, type QualitySettings, type Tier } from '../../core/quality';
import { gameFont } from '../../i18n/font';
import { DECOR, RECIPES } from './data';
import { blitIng, charSprite, drawPlate } from './art';
import { Render2D } from './render2d';
import { COOKERS, FX, IK, type FxEv, type Item, type Player, type Sim, type Station } from './sim';
import type { Renderer } from './game';

interface Q3 {
  tier: Tier;
  pr: number;
  shadows: boolean;
  standard: boolean;
  maxBodies: number;
  particles: number;
}
/** espelha q3For da casa 3D */
function q3For(tier: Tier): Q3 {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (tier === 0) return { tier, pr: Math.min(dpr, 0.6), shadows: false, standard: false, maxBodies: 6, particles: 0.35 };
  if (tier === 1) return { tier, pr: Math.min(dpr, 0.8), shadows: false, standard: false, maxBodies: 10, particles: 0.6 };
  if (tier === 2) return { tier, pr: Math.min(dpr, 1), shadows: false, standard: true, maxBodies: 16, particles: 0.85 };
  return { tier, pr: Math.min(dpr, 1.5), shadows: true, standard: true, maxBodies: 24, particles: 1 };
}

const H = 0.9; // altura da bancada
const SKINS_CUST = ['bloop', 'mint', 'sunny', 'chef', 'bee', 'ocean', 'kitty', 'capy', 'pirate', 'astro'];

export async function createRender3D(host: HTMLElement, cv: HTMLCanvasElement, sim: Sim, decor: number): Promise<Renderer> {
  const r = new Render3D(host, cv);
  r.setSim(sim, decor);
  return r;
}

class Render3D implements Renderer {
  me: Player | null = null;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  private gov: QualityGovernor;
  private q: Q3;
  private root = new THREE.Group();
  private kitchen = new THREE.Group();
  private sim!: Sim;
  private overlay: HTMLCanvasElement;
  private o2d: Render2D;
  private w = 1;
  private h = 1;
  private texCache = new Map<string, THREE.SpriteMaterial>();
  private itemPool: THREE.Sprite[] = [];
  private itemUsed = 0;
  private playerSpr = new Map<Player, THREE.Sprite>();
  private custPool: THREE.Sprite[] = [];
  private stMeshes: { st: Station; dyn: THREE.Object3D | null; stack: THREE.Mesh[]; fire: THREE.Mesh[] }[] = [];
  private fireLight: THREE.PointLight | null = null;
  private hemi!: THREE.HemisphereLight;
  private sun!: THREE.DirectionalLight;
  private puff: THREE.Sprite[] = [];
  private puffV: Float32Array = new Float32Array(0);
  private puffHead = 0;
  private world = new CANNON.World({ gravity: new CANNON.Vec3(0, -14, 0) });
  private bodies = new Map<Item, CANNON.Body>();
  private targetRing: THREE.Mesh;
  private mats: Record<string, THREE.Material> = {};
  private decor = 0;
  private lost = false;

  constructor(
    private host: HTMLElement,
    cv: HTMLCanvasElement,
  ) {
    this.gov = new QualityGovernor({ initial: detectInitialTier(), mode: loadMode(), emit: false, persist: false, onChange: (t) => this.applyTier(t) });
    this.q = q3For(this.gov.tier);
    this.renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: this.q.tier >= 2, powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(this.q.pr);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.shadowMap.enabled = this.q.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    cv.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
    this.overlay = document.createElement('canvas');
    this.overlay.className = 'cz-cv';
    this.overlay.style.pointerEvents = 'none';
    cv.after(this.overlay);
    this.o2d = new Render2D(this.overlay, true);
    this.scene.add(this.root);
    this.root.add(this.kitchen);
    this.hemi = new THREE.HemisphereLight('#fff4e6', '#8a6ab8', 1.5);
    this.sun = new THREE.DirectionalLight('#fff1d6', 1.5);
    this.scene.add(this.hemi, this.sun, this.sun.target);
    const ring = new THREE.RingGeometry(0.36, 0.46, 24);
    ring.rotateX(-Math.PI / 2);
    this.targetRing = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthTest: false }));
    this.targetRing.renderOrder = 5;
    this.scene.add(this.targetRing);
    this.world.broadphase = new CANNON.NaiveBroadphase();
    this.world.defaultContactMaterial.restitution = 0.35;
    this.world.defaultContactMaterial.friction = 0.4;
    // partículas (fumaça/vapor/espuma)
    const pt = new THREE.CanvasTexture(softDot());
    const n = Math.round(40 * this.q.particles);
    this.puffV = new Float32Array(n * 5);
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: pt, transparent: true, depthWrite: false, color: '#ffffff' }));
      s.visible = false;
      this.scene.add(s);
      this.puff.push(s);
    }
  }

  private applyTier(t: Tier): void {
    this.q = q3For(t);
    this.renderer.setPixelRatio(this.q.pr);
    this.resize(this.w, this.h, 1, 52, 0);
  }

  private mat(color: string, emissive?: string): THREE.Material {
    const k = color + (emissive ?? '');
    let m = this.mats[k];
    if (!m) {
      m = this.q.standard ? new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.05, emissive: emissive ?? '#000000' }) : new THREE.MeshLambertMaterial({ color, emissive: emissive ?? '#000000' });
      this.mats[k] = m;
    }
    return m;
  }
  private box(w: number, h: number, d: number, color: string, x: number, y: number, z: number, parent: THREE.Object3D = this.kitchen): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mat(color));
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = this.q.shadows;
    parent.add(m);
    return m;
  }
  private cyl(r: number, h: number, color: string, x: number, y: number, z: number, parent: THREE.Object3D = this.kitchen, seg = 18): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), this.mat(color));
    m.position.set(x, y, z);
    m.castShadow = this.q.shadows;
    parent.add(m);
    return m;
  }

  setSim(sim: Sim, decor: number): void {
    this.sim = sim;
    this.decor = Math.min(DECOR.length - 1, decor);
    this.o2d.setSim(sim, decor);
    const D = DECOR[this.decor];
    const bg = sim.theme === 'space' ? '#0b0630' : sim.theme === 'boat' ? '#5ec8ff' : sim.theme === 'truck' ? '#9fe08a' : '#ffcf9a';
    this.scene.background = new THREE.Color(bg);
    this.scene.fog = new THREE.Fog(bg, 30, 60);
    const C = sim.cols;
    const R = sim.rows;
    // piso xadrez
    const fc = document.createElement('canvas');
    fc.width = C * 16;
    fc.height = R * 16;
    const fx = fc.getContext('2d')!;
    for (let y = 0; y < R; y++)
      for (let x = 0; x < C; x++) {
        fx.fillStyle = (x + y) & 1 ? D.floorA : D.floorB;
        fx.fillRect(x * 16, y * 16, 16, 16);
      }
    const ft = new THREE.CanvasTexture(fc);
    ft.magFilter = THREE.NearestFilter;
    ft.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(C, R), this.q.standard ? new THREE.MeshStandardMaterial({ map: ft, roughness: 0.8 }) : new THREE.MeshLambertMaterial({ map: ft }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(C / 2, 0, R / 2);
    floor.receiveShadow = this.q.shadows;
    this.kitchen.add(floor);
    // chão de fora (tema)
    const out = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), this.mat(sim.theme === 'boat' ? '#2f8ae0' : sim.theme === 'space' ? '#1a1048' : sim.theme === 'truck' ? '#6a6a7a' : '#e8b88a'));
    out.rotation.x = -Math.PI / 2;
    out.position.set(C / 2, -0.02, R / 2);
    this.kitchen.add(out);
    if (sim.theme === 'boat') {
      // casco
      this.box(C + 1.2, 0.8, R + 1.2, '#b8643a', C / 2, -0.38, R / 2);
    }
    // salão (ao norte)
    const dining = new THREE.Mesh(new THREE.PlaneGeometry(C, 3), this.mat(D.dining));
    dining.rotation.x = -Math.PI / 2;
    dining.position.set(C / 2, 0.005, -1.5);
    this.kitchen.add(dining);
    for (let i = 0; i < sim.seats; i++) {
      const sx = ((i + 0.5) / sim.seats) * C;
      this.cyl(0.42, 0.06, '#ffffff', sx, 0.6, -1.4);
      this.cyl(0.07, 0.6, '#7a4fd1', sx, 0.3, -1.4);
    }
    // estações
    for (const st of sim.st) this.buildStation(st, D);
    // luzes/sombras
    this.sun.position.set(C * 0.3, 14, R + 6);
    this.sun.target.position.set(C / 2, 0, R / 2);
    this.sun.castShadow = this.q.shadows;
    if (this.q.shadows) {
      this.sun.shadow.mapSize.set(1024, 1024);
      const c = this.sun.shadow.camera;
      c.left = -C;
      c.right = C;
      c.top = R + 3;
      c.bottom = -R - 3;
      c.far = 50;
      this.sun.shadow.bias = -0.002;
    }
    if (this.q.standard) {
      this.fireLight = new THREE.PointLight('#ff7a2e', 0, 5, 1.6);
      this.scene.add(this.fireLight);
    }
    // física: chão + bancadas
    const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(ground);
    for (const st of sim.st) {
      const b = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(0.5, H / 2, 0.5)) });
      b.position.set(st.x + 0.5, H / 2, st.y + 0.5);
      this.world.addBody(b);
    }
    this.renderer.compile(this.scene, this.camera);
  }

  private buildStation(st: Station, D: (typeof DECOR)[number]): void {
    const cx = st.x + 0.5;
    const cz = st.y + 0.5;
    const wall = !st.fx && !st.fy;
    const rec = { st, dyn: null as THREE.Object3D | null, stack: [] as THREE.Mesh[], fire: [] as THREE.Mesh[] };
    this.stMeshes.push(rec);
    if (wall) {
      this.box(1, H + 0.6, 1, D.wall, cx, (H + 0.6) / 2, cz);
      return;
    }
    this.box(0.98, H - 0.06, 0.98, D.counterSide, cx, (H - 0.06) / 2, cz);
    this.box(1, 0.08, 1, st.k === 'crate' ? '#c98a4a' : D.counter, cx, H - 0.02, cz);
    const top = H + 0.02;
    switch (st.k) {
      case 'crate': {
        this.box(0.8, 0.3, 0.8, '#c98a4a', cx, top + 0.15, cz);
        this.box(0.82, 0.05, 0.82, '#a86a32', cx, top + 0.3, cz);
        const spr = new THREE.Sprite(this.matFor('c' + st.ing, (x) => blitIng(x, st.ing * 16, false, 32, 32, 60)));
        spr.scale.setScalar(0.62);
        spr.position.set(cx, top + 0.62, cz);
        this.kitchen.add(spr);
        break;
      }
      case 'board':
        this.box(0.7, 0.05, 0.5, '#e8b878', cx, top + 0.03, cz);
        break;
      case 'pot':
        this.box(0.9, 0.05, 0.9, '#3b3550', cx, top + 0.02, cz);
        rec.dyn = this.cyl(0.3, 0.36, '#d9d2f0', cx, top + 0.2, cz);
        this.cyl(0.26, 0.02, '#9fd0ff', cx, top + 0.37, cz);
        break;
      case 'pan':
        this.box(0.9, 0.05, 0.9, '#3b3550', cx, top + 0.02, cz);
        rec.dyn = this.cyl(0.34, 0.08, '#2e2a40', cx, top + 0.08, cz);
        this.box(0.4, 0.05, 0.08, '#7a4fd1', cx + 0.48, top + 0.1, cz);
        break;
      case 'oven':
        this.box(0.92, 0.7, 0.92, '#ff9a6b', cx, top + 0.35, cz);
        this.box(0.6, 0.36, 0.02, '#3a2a50', cx + st.fx * 0.47, top + 0.35, cz + st.fy * 0.47 + (st.fx ? 0 : 0));
        break;
      case 'blender':
        this.cyl(0.24, 0.16, '#5a5370', cx, top + 0.08, cz);
        rec.dyn = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.5, 14), new THREE.MeshLambertMaterial({ color: '#e0feff', transparent: true, opacity: 0.6 }));
        rec.dyn.position.set(cx, top + 0.42, cz);
        this.kitchen.add(rec.dyn);
        break;
      case 'plates':
      case 'dirty':
        for (let i = 0; i < 6; i++) {
          const m = this.cyl(0.3, 0.05, st.k === 'plates' ? '#ffffff' : '#d9cbb0', cx, top + 0.04 + i * 0.07, cz);
          m.visible = false;
          rec.stack.push(m);
        }
        break;
      case 'sink':
        this.box(0.86, 0.06, 0.86, '#9fd8ff', cx, top + 0.01, cz);
        this.box(0.6, 0.04, 0.6, '#5ab0e8', cx, top + 0.05, cz);
        this.cyl(0.04, 0.4, '#dcd6f0', cx - st.fx * 0.3, top + 0.2, cz - st.fy * 0.3);
        for (let i = 0; i < 4; i++) {
          const m = this.cyl(0.22, 0.04, '#d9cbb0', cx, top + 0.08 + i * 0.06, cz);
          m.visible = false;
          rec.stack.push(m);
        }
        break;
      case 'trash':
        this.cyl(0.32, 0.6, '#3ec96a', cx, top + 0.3, cz);
        this.cyl(0.36, 0.06, '#2f9e54', cx, top + 0.62, cz);
        break;
      case 'window':
        this.box(0.96, 0.08, 0.96, '#ffcf2e', cx, top + 0.04, cz);
        this.box(0.08, 1, 0.96, '#e98f00', cx - 0.46, top + 0.5, cz);
        this.box(0.08, 1, 0.96, '#e98f00', cx + 0.46, top + 0.5, cz);
        this.box(1, 0.1, 1, '#e98f00', cx, top + 1, cz);
        {
          const bell = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.mat('#fff6b0'));
          bell.position.set(cx + 0.28, top + 0.08, cz);
          this.kitchen.add(bell);
        }
        break;
      case 'belt':
        this.box(1, 0.06, 0.7, '#4a4560', cx, top + 0.03, cz);
        break;
    }
    // chamas (escondidas)
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 8), this.mat(i === 1 ? '#ffd84a' : '#ff5a2e', i === 1 ? '#ffb000' : '#ff3a00'));
      f.position.set(cx + (i - 1) * 0.22, top + 0.3, cz);
      f.visible = false;
      this.kitchen.add(f);
      rec.fire.push(f);
    }
  }

  /** material de sprite com textura 64x64 desenhada por `draw` (cache por chave) */
  private matFor(key: string, draw: (x: CanvasRenderingContext2D) => void): THREE.SpriteMaterial {
    let m = this.texCache.get(key);
    if (m) return m;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    draw(c.getContext('2d')!);
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    m = new THREE.SpriteMaterial({ map: tx, transparent: true, alphaTest: 0.1 });
    this.texCache.set(key, m);
    return m;
  }
  private itemMat(it: Item): THREE.SpriteMaterial {
    if (it.k === IK.Ing) return this.matFor('i' + it.c + (it.burnt ? 'b' : ''), (x) => blitIng(x, it.c, it.burnt, 32, 32, 60));
    if (it.k === IK.Plate) {
      const key = 'p' + it.parts.join('.');
      return this.matFor(key, (x) => {
        const m = this.sim.matchOrder(it.parts);
        drawPlate(x, it.parts, 32, 34, 58, false, m ? RECIPES[m.r].dish : 'plate');
      });
    }
    if (it.k === IK.Dirty) return this.matFor('d', (x) => drawPlate(x, [], 32, 34, 58, true));
    return this.matFor('ext', (x) => {
      x.fillStyle = '#ff4f6a';
      x.strokeStyle = '#2a0b5c';
      x.lineWidth = 4;
      x.beginPath();
      x.roundRect(20, 14, 24, 44, 10);
      x.fill();
      x.stroke();
      x.fillStyle = '#dcd6f0';
      x.fillRect(26, 4, 12, 10);
      x.fillRect(32, 4, 20, 5);
    });
  }
  private nextItemSprite(): THREE.Sprite {
    let s = this.itemPool[this.itemUsed];
    if (!s) {
      s = new THREE.Sprite();
      s.scale.setScalar(0.55);
      this.scene.add(s);
      this.itemPool.push(s);
    }
    this.itemUsed++;
    s.visible = true;
    return s;
  }

  resize(w: number, h: number, dpr: number, topPad: number, botPad: number): void {
    this.w = w;
    this.h = h;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    this.o2d.resize(w, h, Math.min(2, dpr || 1), topPad, botPad);
    this.camera.aspect = w / Math.max(1, h);
    // enquadra a cozinha
    const s = this.sim;
    if (!s) return;
    const C = s.cols;
    const R = s.rows + 2.4;
    const portrait = h > w;
    const vfov = (this.camera.fov * Math.PI) / 180;
    const fitH = R / 2 / Math.tan(vfov / 2);
    const fitW = C / 2 / (Math.tan(vfov / 2) * this.camera.aspect);
    const dist = Math.max(fitH * (portrait ? 0.82 : 0.95), fitW * 1.0) + 0.6;
    const tilt = 0.95; // ~54°
    const cz = s.rows / 2 - (portrait ? 0.2 : 0.3);
    this.camera.position.set(C / 2, Math.sin(tilt) * dist + 1, cz + Math.cos(tilt) * dist);
    this.camera.lookAt(C / 2, 0, cz - (portrait ? 1.6 : 0.6));
    this.camera.updateProjectionMatrix();
  }

  onFx(e: FxEv): void {
    if (e.t === FX.Sizzle || e.t === FX.Burn || e.t === FX.Ext || e.t === FX.Wash || e.t === FX.Done || e.t === FX.Serve) {
      const col = e.t === FX.Burn ? '#4a4458' : e.t === FX.Done || e.t === FX.Serve ? '#ffd84a' : '#ffffff';
      const n = e.t === FX.Serve ? 6 : 1;
      for (let i = 0; i < n; i++) this.emitPuff(e.x, e.y, col, e.t === FX.Serve ? 1.6 : 0.5);
    }
    if (e.t === FX.Serve || e.t === FX.Wrong) this.o2d.onFx({ t: e.t, x: -100, y: -100, v: e.v }); // som/partícula só 3D
  }
  private emitPuff(x: number, z: number, col: string, spread: number): void {
    if (!this.puff.length) return;
    const i = this.puffHead;
    this.puffHead = (this.puffHead + 1) % this.puff.length;
    const s = this.puff[i];
    s.visible = true;
    s.position.set(x + (Math.random() - 0.5) * 0.3, H + 0.4, z + (Math.random() - 0.5) * 0.3);
    (s.material as THREE.SpriteMaterial).color.set(col);
    s.scale.setScalar(0.25);
    const v = this.puffV;
    v[i * 5] = (Math.random() - 0.5) * spread;
    v[i * 5 + 1] = 0.8 + Math.random() * spread;
    v[i * 5 + 2] = (Math.random() - 0.5) * spread;
    v[i * 5 + 3] = 1.2; // vida
    v[i * 5 + 4] = 1.2;
  }

  draw(time: number, dt: number, _q: QualitySettings): void {
    void _q;
    if (this.lost) return;
    const t0 = performance.now();
    const s = this.sim;
    // tema
    if (s.theme === 'boat') {
      this.root.rotation.z = Math.sin(time * 0.9) * 0.02;
      this.root.rotation.x = Math.sin(time * 0.7) * 0.012;
    }
    const dim = s.outage ? 0.35 : 1;
    this.hemi.intensity = 1.5 * dim;
    this.sun.intensity = 1.5 * dim;
    // estações dinâmicas
    let fireN = 0;
    let fx = 0;
    let fz = 0;
    for (const r of this.stMeshes) {
      const st = r.st;
      if (r.stack.length) {
        const n = st.k === 'sink' ? Math.min(4, st.n) : Math.min(6, st.n);
        for (let i = 0; i < r.stack.length; i++) r.stack[i].visible = i < n;
      }
      if (r.dyn && st.bump > 0) r.dyn.position.y = H + 0.2 + Math.sin(st.bump * Math.PI) * 0.06;
      if (r.dyn && st.k === 'blender' && st.item && s.nextProc(st.item) === 'blend' && !s.outage) r.dyn.rotation.y = time * 20;
      const on = st.fire > 0;
      for (let i = 0; i < r.fire.length; i++) {
        const f = r.fire[i];
        f.visible = on;
        if (on) {
          const k = 0.7 + Math.sin(time * 16 + i * 2 + st.i) * 0.3;
          f.scale.set(1, k * (0.6 + st.fire * 0.6), 1);
          fireN++;
          fx = st.x + 0.5;
          fz = st.y + 0.5;
        }
      }
      if (on && Math.random() < 0.2) this.emitPuff(st.x + 0.5, st.y + 0.5, '#5a5068', 0.4);
      // itens na estação
      const it = st.item;
      if (it) {
        const sp = this.nextItemSprite();
        sp.material = this.itemMat(it);
        let y = H + 0.42;
        if (st.k === 'pot') y = H + 0.62;
        else if (st.k === 'oven') y = H + 0.95;
        else if (st.k === 'blender') y = H + 0.95;
        let ox = 0;
        if (st.k === 'belt') ox = st.prog * 0.6 - 0.3;
        sp.position.set(st.x + 0.5 + ox, y + (st.bump > 0 ? Math.sin(st.bump * Math.PI) * 0.1 : 0), st.y + 0.5);
        sp.scale.setScalar(it.k === IK.Plate ? 0.7 : 0.55);
        if (st.k === 'board' && st.busy > 0) sp.position.y += Math.abs(Math.sin(time * 22)) * 0.05;
        // progresso: sprite de barra
        const prog = it.k === IK.Ing ? it.prog : 0;
        const proc = COOKERS[st.k];
        const warn = proc && proc !== 'blend' && it.k === IK.Ing && !it.burnt && it.over > 1.5 && s.nextProc(it) !== proc && ((time * 6) | 0) % 2 === 0;
        if ((prog > 0 && prog < 1) || warn) {
          const b = this.nextItemSprite();
          b.material = warn ? this.matFor('warn', drawWarn) : this.matFor('bar' + Math.round(prog * 10), (x) => drawBar(x, Math.round(prog * 10) / 10));
          b.position.set(st.x + 0.5, y + 0.55, st.y + 0.5);
          b.scale.setScalar(warn ? 0.45 : 0.6);
        }
      }
      if (st.k === 'sink' && st.prog > 0) {
        const b = this.nextItemSprite();
        b.material = this.matFor('bar' + Math.round(st.prog * 10), (x) => drawBar(x, Math.round(st.prog * 10) / 10));
        b.position.set(st.x + 0.5, H + 0.9, st.y + 0.5);
        b.scale.setScalar(0.6);
      }
    }
    if (this.fireLight) {
      this.fireLight.intensity = fireN ? 3 + Math.sin(time * 20) : 0;
      this.fireLight.position.set(fx, H + 0.8, fz);
    }
    // itens no chão: física
    this.stepPhysics(dt);
    for (const it of s.floor) {
      const sp = this.nextItemSprite();
      sp.material = this.itemMat(it);
      const b = this.bodies.get(it);
      if (b) sp.position.set(b.position.x, b.position.y + 0.2, b.position.z);
      else sp.position.set(it.x, 0.25 + it.z * 0.5, it.y);
      sp.scale.setScalar(0.5);
    }
    // jogadores
    for (const p of s.players) {
      let spr = this.playerSpr.get(p);
      if (!spr) {
        spr = new THREE.Sprite();
        spr.center.set(0.5, 0.05);
        this.scene.add(spr);
        this.playerSpr.set(p, spr);
      }
      const happy = p.happy > 0;
      const key = 'pl' + p.skin + p.role + (happy ? 1 : 0);
      spr.material = this.matForCanvas(key, () => charSprite(p.skin, p.role, 128, happy));
      const moving = Math.hypot(p.vx, p.vy) > 0.3;
      const hop = moving ? Math.abs(Math.sin(p.walk * 3)) * 0.12 : 0;
      spr.position.set(p.x, hop, p.y);
      const sq = moving ? 1 + Math.sin(p.walk * 6) * 0.05 : 1;
      spr.scale.set((p.fx < -0.2 ? -1 : 1) * 1.15 / sq, 1.44 * sq, 1);
      if (p.hold) {
        const sp = this.nextItemSprite();
        sp.material = this.itemMat(p.hold);
        sp.position.set(p.x + p.fx * 0.38, 0.95 + hop, p.y + p.fy * 0.38 + 0.15);
        sp.scale.setScalar(p.hold.k === IK.Plate ? 0.62 : 0.5);
        if (p.hold.k === IK.Ext && p.acting > 0 && Math.random() < 0.6) this.emitPuff(p.x + p.fx * 0.9, p.y + p.fy * 0.9, '#ffffff', 0.6);
      }
    }
    // clientes no salão
    let ci = 0;
    for (const o of s.orders) {
      let c = this.custPool[ci];
      if (!c) {
        c = new THREE.Sprite();
        c.center.set(0.5, 0.05);
        this.scene.add(c);
        this.custPool.push(c);
      }
      const skin = SKINS_CUST[o.id % SKINS_CUST.length];
      const happy = o.t / o.max > 0.5;
      c.material = this.matForCanvas('cu' + skin + (happy ? 1 : 0), () => charSprite(skin, 'server', 128, happy));
      c.visible = true;
      const sx = (((o.seat % s.seats) + 0.5) / s.seats) * s.cols;
      c.position.set(sx, Math.sin(time * 3 + o.id) * 0.04, -2.1 - (1 - o.a) * 2);
      c.scale.set(1, 1.25, 1);
      const bub = this.nextItemSprite();
      const rr = RECIPES[o.r];
      bub.material = this.matFor('ord' + o.r, (x) => {
        x.beginPath();
        x.arc(32, 32, 30, 0, Math.PI * 2);
        x.fillStyle = '#ffffff';
        x.fill();
        x.lineWidth = 3;
        x.strokeStyle = '#2a0b5c';
        x.stroke();
        blitIng(x, rr.parts[rr.parts.length - 1], false, 32, 32, 44);
      });
      bub.position.set(sx + 0.45, 1.55, -2.1);
      bub.scale.setScalar(0.5);
      ci++;
    }
    for (let i = ci; i < this.custPool.length; i++) this.custPool[i].visible = false;
    // anel do alvo
    const me = this.me;
    if (me && me.target >= 0) {
      const st = s.st[me.target];
      this.targetRing.visible = true;
      this.targetRing.position.set(st.x + 0.5, H + 0.08, st.y + 0.5);
      (this.targetRing.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(time * 8) * 0.3;
    } else this.targetRing.visible = false;
    // partículas
    const v = this.puffV;
    for (let i = 0; i < this.puff.length; i++) {
      const sp = this.puff[i];
      if (!sp.visible) continue;
      v[i * 5 + 3] -= dt;
      if (v[i * 5 + 3] <= 0) {
        sp.visible = false;
        continue;
      }
      sp.position.x += v[i * 5] * dt;
      sp.position.y += v[i * 5 + 1] * dt;
      sp.position.z += v[i * 5 + 2] * dt;
      const k = v[i * 5 + 3] / v[i * 5 + 4];
      sp.scale.setScalar(0.25 + (1 - k) * 0.5);
      (sp.material as THREE.SpriteMaterial).opacity = k * 0.8;
    }
    // esconde sprites não usados
    for (let i = this.itemUsed; i < this.itemPool.length; i++) this.itemPool[i].visible = false;
    this.itemUsed = 0;
    this.renderer.render(this.scene, this.camera);
    this.o2d.drawOverlay(time);
    this.gov.sample(dt * 1000, performance.now() - t0);
  }

  private canvasMats = new Map<string, THREE.SpriteMaterial>();
  private matForCanvas(key: string, mk: () => HTMLCanvasElement): THREE.SpriteMaterial {
    let m = this.canvasMats.get(key);
    if (m) return m;
    const tx = new THREE.CanvasTexture(mk());
    tx.colorSpace = THREE.SRGBColorSpace;
    m = new THREE.SpriteMaterial({ map: tx, transparent: true, alphaTest: 0.1 });
    this.canvasMats.set(key, m);
    return m;
  }

  private stepPhysics(dt: number): void {
    const s = this.sim;
    // cria corpos para itens novos no chão
    for (const it of s.floor) {
      if (this.bodies.has(it) || this.bodies.size >= this.q.maxBodies) continue;
      const b = new CANNON.Body({ mass: 0.4, shape: new CANNON.Sphere(0.16), linearDamping: 0.3, angularDamping: 0.5 });
      b.position.set(it.x, 1.0, it.y);
      b.velocity.set((Math.random() - 0.5) * 2, 2.5, (Math.random() - 0.5) * 2);
      this.world.addBody(b);
      this.bodies.set(it, b);
    }
    for (const [it, b] of this.bodies) {
      if (!s.floor.includes(it)) {
        this.world.removeBody(b);
        this.bodies.delete(it);
        continue;
      }
      // mantém dentro da cozinha e devolve a posição para a simulação (pegar pelo chão)
      if (s.isFloor(b.position.x, b.position.z)) {
        it.x = b.position.x;
        it.y = b.position.z;
      } else {
        b.position.x += (it.x - b.position.x) * 0.5;
        b.position.z += (it.y - b.position.z) * 0.5;
      }
    }
    if (this.bodies.size) this.world.step(1 / 60, Math.min(0.05, dt), 2);
  }

  destroy(): void {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
    });
    for (const m of Object.values(this.mats)) m.dispose();
    for (const m of this.texCache.values()) {
      m.map?.dispose();
      m.dispose();
    }
    for (const m of this.canvasMats.values()) {
      m.map?.dispose();
      m.dispose();
    }
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.overlay.remove();
    void this.host;
  }
}

function softDot(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 32, 32);
  return c;
}
function drawBar(x: CanvasRenderingContext2D, k: number): void {
  x.fillStyle = '#2a0b5c';
  x.beginPath();
  x.roundRect(2, 24, 60, 16, 8);
  x.fill();
  x.fillStyle = '#3ee07a';
  x.beginPath();
  x.roundRect(5, 27, Math.max(4, 54 * k), 10, 5);
  x.fill();
}
function drawWarn(x: CanvasRenderingContext2D): void {
  x.beginPath();
  x.arc(32, 32, 26, 0, Math.PI * 2);
  x.fillStyle = '#ff4f6a';
  x.fill();
  x.lineWidth = 4;
  x.strokeStyle = '#2a0b5c';
  x.stroke();
  x.fillStyle = '#fff';
  x.font = gameFont(700, 36);
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('!', 32, 34);
}
