/* ============================================================
 *  LENHADORES DO BOSQUE — modo 3D (three.js + cannon-es).
 *  Carregado sob demanda (chunk separado). Mesma simulação do 2D:
 *  aqui só desenhamos e, na queda das árvores e no rolar das toras,
 *  a física do cannon-es assume o movimento.
 * ============================================================ */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { gameFont } from '../../i18n/font';
import { drawPlayer, type PlayerPose } from '../../game/character';
import { SKINS } from '../../game/skins';
import { save as globalSave } from '../../core/storage';
import { settingsFor, type QualitySettings, type Tier } from '../../core/quality';
import { BIOMES, BUILDS, INTAKE_X, RARES, SPECIES, TOOLS, WORLD_Z, gateX, short, type Species } from './data';
import { DRONE_PAD_X, PALLET_X, PLANER_X, SAW_X, SELL_X, TS, type Ev, type Sim, type Tree } from './sim';
import type { View } from './game';

const TAU = Math.PI * 2;
const VIEW_R = 60; // distância de desenho das árvores (m)
const MAXP = 600;

interface Q {
  pr: number;
  shadows: boolean;
  logBodies: number;
  particles: number;
}
function qFor(tier: Tier): Q {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  return [
    { pr: Math.min(dpr, 0.6), shadows: false, logBodies: 8, particles: 0.35 },
    { pr: Math.min(dpr, 0.8), shadows: false, logBodies: 14, particles: 0.6 },
    { pr: Math.min(dpr, 1.0), shadows: false, logBodies: 24, particles: 0.85 },
    { pr: Math.min(dpr, 1.5), shadows: true, logBodies: 40, particles: 1 },
  ][tier];
}

export async function createView3D(root: HTMLElement, sim: Sim, tier: Tier): Promise<View> {
  const v = new View3D(root, sim, tier);
  return v;
}

interface TreeVis {
  g: THREE.Group;
  stump: THREE.Mesh;
  body: CANNON.Body | null;
  fallT: number;
  rare: number;
  sp: number;
}

class View3D implements View {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  cam: THREE.PerspectiveCamera;
  world: CANNON.World;
  q: Q;
  private yaw = Math.PI / 2;
  private pitch = 0.42;
  private first = false;
  private camPos = new THREE.Vector3();
  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();
  private trees: TreeVis[] = [];
  private logMeshes: THREE.Mesh[] = [];
  private logBodies: (CANNON.Body | null)[] = [];
  private beltMeshes: THREE.Mesh[] = [];
  private mats = new Map<string, THREE.Material>();
  private geos: Record<string, THREE.BufferGeometry> = {};
  private player!: THREE.Group;
  private playerSpr!: THREE.Sprite;
  private toolMesh!: THREE.Group;
  private vehMesh: THREE.Group[] = [];
  private carryMeshes: THREE.Mesh[] = [];
  private agentObjs = new Map<object, THREE.Object3D>();
  private remoteObjs = new Map<string, THREE.Object3D>();
  private blade!: THREE.Mesh;
  private stack!: THREE.Mesh;
  private gates: THREE.Group[] = [];
  private gateBuilt: boolean[] = [];
  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private biome = -1;
  private skyCol = new THREE.Color();
  private skyTarget = new THREE.Color();
  // partículas
  private pPos: Float32Array;
  private pCol: Float32Array;
  private pVel: Float32Array;
  private pLife: Float32Array;
  private pGeo: THREE.BufferGeometry;
  private pNext = 0;
  private time = 0;
  private drag = { id: -1, x: 0, y: 0 };
  private offs: (() => void)[] = [];
  private groundMat: CANNON.Material;
  private texs: THREE.Texture[] = [];
  private col = new THREE.Color();

  constructor(
    private root: HTMLElement,
    private sim: Sim,
    tier: Tier,
  ) {
    this.q = qFor(tier);
    this.renderer = new THREE.WebGLRenderer({ antialias: tier >= 2, powerPreference: 'high-performance' });
    if (!this.renderer.getContext()) throw new Error('webgl');
    this.renderer.setPixelRatio(this.q.pr);
    this.renderer.shadowMap.enabled = this.q.shadows;
    this.renderer.domElement.className = 'fl-canvas';
    root.appendChild(this.renderer.domElement);
    this.cam = new THREE.PerspectiveCamera(60, 1, 0.1, 160);
    this.first = sim.s.cam === 'first';
    this.scene.fog = new THREE.Fog(0xbfe8ff, 30, VIEW_R + 5);
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -20, 0) });
    this.world.allowSleep = true;
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.groundMat = new CANNON.Material('ground');
    const ground = new CANNON.Body({ mass: 0, material: this.groundMat });
    ground.addShape(new CANNON.Plane());
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(ground);
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.groundMat, this.groundMat, { friction: 0.5, restitution: 0.15 }));
    // paredes laterais do corredor
    for (const s of [-1, 1]) {
      const wall = new CANNON.Body({ mass: 0 });
      wall.addShape(new CANNON.Plane());
      wall.quaternion.setFromEuler(0, s > 0 ? Math.PI : 0, 0);
      wall.position.set(0, 0, -s * (WORLD_Z + 1));
      this.world.addBody(wall);
    }
    // partículas
    this.pPos = new Float32Array(MAXP * 3);
    this.pCol = new Float32Array(MAXP * 3);
    this.pVel = new Float32Array(MAXP * 3);
    this.pLife = new Float32Array(MAXP);
    for (let i = 0; i < MAXP; i++) this.pPos[i * 3 + 1] = -100;
    this.pGeo = new THREE.BufferGeometry();
    this.pGeo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    this.pGeo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    const pts = new THREE.Points(this.pGeo, new THREE.PointsMaterial({ size: 0.22, vertexColors: true, sizeAttenuation: true }));
    pts.frustumCulled = false;
    this.scene.add(pts);

    this.buildLights();
    this.buildGround();
    this.buildTrees();
    this.buildBase();
    this.buildGates();
    this.buildPlayer();
    for (let i = 0; i < sim.logs.length; i++) {
      const m = new THREE.Mesh(this.geo('log'), this.mat('#9a6a3c'));
      m.visible = false;
      m.castShadow = this.q.shadows;
      const cap = new THREE.Mesh(this.geo('logcap'), this.mat('#f3d9a8'));
      cap.position.y = 0.66;
      const cap2 = cap.clone();
      cap2.position.y = -0.66;
      m.add(cap, cap2);
      this.scene.add(m);
      this.logMeshes.push(m);
      this.logBodies.push(null);
    }
    for (let i = 0; i < sim.belt.length; i++) {
      const m = new THREE.Mesh(this.geo('plank'), this.mat('#ffe2b0'));
      m.visible = false;
      this.scene.add(m);
      this.beltMeshes.push(m);
    }
    this.bindDrag();
    this.resize();
  }

  /* ------------------------------ recursos ------------------------------ */

  private mat(color: string, emissive = 0): THREE.Material {
    const k = color + emissive;
    let m = this.mats.get(k);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color, flatShading: true, emissive: emissive ? new THREE.Color(color).multiplyScalar(emissive) : undefined });
      this.mats.set(k, m);
    }
    return m;
  }
  private geo(k: string): THREE.BufferGeometry {
    let g = this.geos[k];
    if (g) return g;
    switch (k) {
      case 'trunk':
        g = new THREE.CylinderGeometry(0.22, 0.32, 1, 7);
        g.translate(0, 0.5, 0);
        break;
      case 'sphere':
        g = new THREE.IcosahedronGeometry(1, 0);
        break;
      case 'cone':
        g = new THREE.ConeGeometry(1, 1, 7);
        break;
      case 'cap':
        g = new THREE.SphereGeometry(1, 9, 5, 0, TAU, 0, Math.PI / 2);
        break;
      case 'crystal':
        g = new THREE.OctahedronGeometry(1, 0);
        break;
      case 'leafpalm':
        g = new THREE.BoxGeometry(0.5, 0.06, 2.4);
        g.translate(0, 0, 1.2);
        break;
      case 'log':
        g = new THREE.CylinderGeometry(0.33, 0.33, 1.3, 8);
        break;
      case 'logcap':
        g = new THREE.CylinderGeometry(0.28, 0.28, 0.04, 8);
        break;
      case 'plank':
        g = new THREE.BoxGeometry(1.1, 0.12, 0.5);
        break;
      case 'stump':
        g = new THREE.CylinderGeometry(0.3, 0.38, 0.5, 7);
        g.translate(0, 0.25, 0);
        break;
      case 'box':
        g = new THREE.BoxGeometry(1, 1, 1);
        break;
      default:
        g = new THREE.BoxGeometry(1, 1, 1);
    }
    this.geos[k] = g;
    return g;
  }

  private buildLights(): void {
    this.hemi = new THREE.HemisphereLight(0xeaf6ff, 0x5a7a3a, 1.4);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2d0, 1.6);
    this.sun.position.set(-10, 20, 8);
    if (this.q.shadows) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(1024, 1024);
      const c = this.sun.shadow.camera;
      c.left = c.bottom = -25;
      c.right = c.top = 25;
      c.near = 1;
      c.far = 70;
    }
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
  }

  private buildGround(): void {
    for (let b = -1; b < BIOMES.length; b++) {
      const B = BIOMES[Math.max(0, b)];
      const x0 = b < 0 ? -20 : gateX(b);
      const x1 = gateX(b + 1);
      const len = x1 - x0;
      const g = new THREE.Mesh(new THREE.PlaneGeometry(len, 80), this.mat(B.grass === '#ffffff' ? '#eef4ff' : B.grass));
      g.rotation.x = -Math.PI / 2;
      g.position.set(x0 + len / 2, 0, 0);
      g.receiveShadow = this.q.shadows;
      this.scene.add(g);
      const path = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.6), this.mat(B.night ? '#6a5a8a' : '#d8b880'));
      path.rotation.x = -Math.PI / 2;
      path.position.set(x0 + len / 2, 0.02, 0);
      this.scene.add(path);
      // arbustos e flores nas bordas do corredor
      const bush = this.mat(B.night ? '#7a6ad0' : '#4fae5a');
      for (let i = 0; i < len / 5; i++) {
        const m = new THREE.Mesh(this.geo('sphere'), i % 4 === 0 ? this.mat(B.night ? '#ff86b6' : '#ffd34a') : bush);
        const s = i % 4 === 0 ? 0.25 : 0.6 + ((i * 13) % 5) * 0.12;
        m.scale.set(s * 1.3, s, s);
        m.position.set(x0 + i * 5 + ((i * 7) % 3), s * 0.5, (i % 2 ? 1 : -1) * (WORLD_Z + 1.5 + ((i * 11) % 4)));
        this.scene.add(m);
      }
      // morros ao fundo
      const hill = this.mat(B.mid);
      for (let i = 0; i < len / 14; i++) {
        const m = new THREE.Mesh(this.geo('sphere'), hill);
        const s = 5 + ((i * 37) % 6);
        m.scale.set(s * 1.6, s * 0.55, s);
        m.position.set(x0 + i * 14 + 7, -1, (i % 2 ? 1 : -1) * (WORLD_Z + 22 + (i % 3) * 4));
        this.scene.add(m);
      }
    }
  }

  private crownColor(sp: Species, rare: number, two = false): string {
    if (rare === 1) return two ? '#e9a400' : '#ffd34a';
    if (rare === 2) return two ? '#4ab8f0' : '#9ff6ff';
    if (rare === 3) return two ? '#20c890' : '#7affc4';
    return two ? sp.leaf2 : sp.leaf;
  }

  private makeTree(sp: Species, rare: number): THREE.Group {
    const g = new THREE.Group();
    const h = sp.h;
    const glow = rare === 3 || sp.shape === 'crystal' || sp.shape === 'mushroom' ? 0.35 : rare ? 0.15 : 0;
    const leaf = this.mat(this.crownColor(sp, rare), glow);
    const leaf2 = this.mat(this.crownColor(sp, rare, true), glow);
    const trunk = new THREE.Mesh(this.geo('trunk'), this.mat(rare === 1 ? '#d8a040' : sp.trunk));
    const add = (m: THREE.Mesh) => {
      m.castShadow = this.q.shadows;
      g.add(m);
      return m;
    };
    switch (sp.shape) {
      case 'pine':
        trunk.scale.set(1, h * 0.45, 1);
        add(trunk);
        for (let i = 0; i < 4; i++) {
          const c = add(new THREE.Mesh(this.geo('cone'), i % 2 ? leaf2 : leaf));
          const w = h * (0.3 - i * 0.055);
          c.scale.set(w, h * 0.3, w);
          c.position.y = h * (0.42 + i * 0.16);
        }
        break;
      case 'palm': {
        trunk.scale.set(0.8, h * 0.9, 0.8);
        trunk.rotation.z = 0.12;
        add(trunk);
        for (let i = 0; i < 7; i++) {
          const l = add(new THREE.Mesh(this.geo('leafpalm'), i % 2 ? leaf2 : leaf));
          l.position.set(-h * 0.1, h * 0.88, 0);
          l.rotation.set(0.35, (i / 7) * TAU, 0);
          l.scale.setScalar(h * 0.14);
        }
        break;
      }
      case 'mushroom': {
        trunk.scale.set(2.2, h * 0.65, 2.2);
        add(trunk);
        const c = add(new THREE.Mesh(this.geo('cap'), leaf));
        c.scale.set(h * 0.42, h * 0.32, h * 0.42);
        c.position.y = h * 0.6;
        for (let i = 0; i < 5; i++) {
          const d = add(new THREE.Mesh(this.geo('sphere'), this.mat('#fff6f0')));
          const a = (i / 5) * TAU;
          d.scale.setScalar(h * 0.05);
          d.position.set(Math.cos(a) * h * 0.25, h * 0.82, Math.sin(a) * h * 0.25);
        }
        break;
      }
      case 'crystal':
        trunk.scale.set(1, h * 0.5, 1);
        add(trunk);
        for (let i = 0; i < 5; i++) {
          const c = add(new THREE.Mesh(this.geo('crystal'), i % 2 ? leaf2 : leaf));
          const a = (i / 5) * TAU;
          const r = i === 0 ? 0 : h * 0.16;
          c.scale.set(h * 0.1, h * (i === 0 ? 0.28 : 0.18), h * 0.1);
          c.position.set(Math.cos(a) * r, h * (i === 0 ? 0.78 : 0.62), Math.sin(a) * r);
        }
        break;
      default: {
        trunk.scale.set(1.1, h * 0.6, 1.1);
        add(trunk);
        const blobs = sp.shape === 'cloud' ? 6 : 5;
        for (let i = 0; i < blobs; i++) {
          const c = add(new THREE.Mesh(this.geo('sphere'), i % 2 ? leaf2 : leaf));
          const a = (i / blobs) * TAU;
          const r = i === 0 ? 0 : h * 0.17;
          c.scale.setScalar(h * (i === 0 ? 0.24 : 0.17));
          c.position.set(Math.cos(a) * r, h * (i === 0 ? 0.78 : 0.66), Math.sin(a) * r);
        }
        if (sp.shape === 'blossom')
          for (let i = 0; i < 8; i++) {
            const d = add(new THREE.Mesh(this.geo('sphere'), this.mat('#ffffff')));
            const a = i * 2.4;
            d.scale.setScalar(h * 0.035);
            d.position.set(Math.cos(a) * h * 0.3, h * (0.68 + (i % 3) * 0.06), Math.sin(a) * h * 0.3);
          }
      }
    }
    return g;
  }

  private buildTrees(): void {
    for (const tr of this.sim.trees) {
      const g = this.makeTree(SPECIES[tr.sp], tr.rare);
      g.position.set(tr.x, 0, tr.z);
      g.rotation.y = (tr.id * 1.7) % TAU;
      this.scene.add(g);
      const stump = new THREE.Mesh(this.geo('stump'), this.mat(SPECIES[tr.sp].trunkDark));
      stump.position.set(tr.x, 0, tr.z);
      stump.visible = false;
      this.scene.add(stump);
      this.trees.push({ g, stump, body: null, fallT: 0, rare: tr.rare, sp: tr.sp });
    }
  }

  private box(w: number, h: number, d: number, color: string, x: number, y: number, z: number, parent: THREE.Object3D = this.scene): THREE.Mesh {
    const m = new THREE.Mesh(this.geo('box'), this.mat(color));
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    m.castShadow = this.q.shadows;
    m.receiveShadow = this.q.shadows;
    parent.add(m);
    return m;
  }

  private label(text: string, color = '#fff', scale = 1): THREE.Sprite {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const x = c.getContext('2d')!;
    x.font = gameFont(800, 34);
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.lineWidth = 7;
    x.strokeStyle = '#2a0b5c';
    x.strokeText(text, 128, 34, 248);
    x.fillStyle = color;
    x.fillText(text, 128, 34, 248);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.texs.push(tex);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
    s.scale.set(4 * scale, 1 * scale, 1);
    return s;
  }

  private buildBase(): void {
    // serraria
    const mill = new THREE.Group();
    mill.position.set(SAW_X + 2, 0, -3.2);
    this.scene.add(mill);
    this.box(4.6, 3.2, 4, '#a0683a', 0, 1.6, 0, mill);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 3.6, 2, 4, 1), this.mat('#c21d3c'));
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 4.2;
    roof.scale.set(1, 1, 1.1);
    mill.add(roof);
    this.blade = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.08, 14), this.mat('#dcd6f0'));
    this.blade.rotation.x = Math.PI / 2;
    this.blade.position.set(-2.5, 1.2, 3.2);
    mill.add(this.blade);
    const lab = this.label('Serraria');
    lab.position.set(0, 6, 0);
    mill.add(lab);
    // funil
    const fun = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 0.5, 1.4, 8, 1, true), this.mat('#ffcf2e'));
    fun.position.set(INTAKE_X, 2.2, 0);
    this.scene.add(fun);
    this.box(0.8, 1.6, 0.8, '#e98f00', INTAKE_X, 0.8, 0);
    // esteira
    const len = SAW_X - PALLET_X;
    this.box(len, 0.3, 1.2, '#5a4585', PALLET_X + len / 2, 0.85, 0);
    for (let x = PALLET_X + 0.5; x < SAW_X; x += 1.6) this.box(0.15, 0.7, 1, '#9a82c4', x, 0.35, 0);
    // plaina
    this.box(1.8, 1.2, 1.6, '#2a9be0', PLANER_X, 1.4, 0);
    this.box(1.4, 0.5, 1.2, '#8a5cff', PLANER_X, 2.2, 0);
    // palete
    this.box(2.2, 0.3, 1.6, '#8a5228', PALLET_X, 0.15, 0);
    this.stack = this.box(2, 1, 1.4, '#ffe2b0', PALLET_X, 0.8, 0);
    // barraca de venda
    this.box(2.4, 1.4, 1.6, '#c98a4a', SELL_X, 0.7, 2.6);
    this.box(3, 0.2, 2.2, '#ff4f6a', SELL_X, 2.4, 2.6);
    for (const dx of [-1.2, 1.2]) this.box(0.12, 1, 0.12, '#fff', SELL_X + dx, 1.9, 3.5);
    // pista dos drones
    this.box(2, 0.1, 2, '#5a4585', DRONE_PAD_X, 0.05, 3);
  }

  private buildGates(): void {
    for (let b = 1; b < BIOMES.length; b++) {
      const g = new THREE.Group();
      g.position.set(gateX(b), 0, 0);
      this.scene.add(g);
      this.gates.push(g);
      this.gateBuilt.push(false);
      this.fillGate(b, g, this.sim.s.unlocked > b);
    }
  }

  private fillGate(b: number, g: THREE.Group, built: boolean): void {
    while (g.children.length) g.remove(g.children[0]);
    const kind = b - 1;
    this.gateBuilt[b - 1] = built;
    if (!built) {
      for (const z of [-WORLD_Z, -2, 2, WORLD_Z]) this.box(0.25, 2.2, 0.25, '#7a4a20', 0, 1.1, z, g);
      this.box(0.08, 0.15, WORLD_Z * 2, '#ffcf2e', 0, 1.6, 0, g);
      this.box(0.15, 1.4, 2.6, '#fff6d6', -0.2, 3, 0, g);
      const l = this.label(BUILDS[kind].name(), '#fff');
      l.position.set(-0.4, 4.3, 0);
      g.add(l);
      const l2 = this.label(short(BUILDS[kind].planks) + ' + ' + short(BUILDS[kind].cost), '#ffe2b0', 0.8);
      l2.position.set(-0.4, 3.4, 0);
      g.add(l2);
      return;
    }
    const wood = '#c98a4a';
    if (kind === 0) {
      for (const z of [-WORLD_Z, -4, -1.6, 1.6, 4, WORLD_Z]) this.box(0.25, 1.6, 0.25, wood, 0, 0.8, z, g);
      this.box(0.12, 0.18, WORLD_Z * 2, wood, 0, 1.2, 0, g).position.z = 0;
    } else if (kind === 1) {
      this.box(5, 0.3, WORLD_Z * 2, '#4a8ad0', 0, 0.02, 0, g);
      this.box(5, 0.2, 3, wood, 0, 0.3, 0, g);
      for (const z of [-1.5, 1.5]) this.box(5, 0.15, 0.15, wood, 0, 1.2, z, g);
    } else if (kind === 2) {
      this.box(3, 2.4, 3, wood, 0, 1.2, -4.5, g);
      const r = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.6, 4), this.mat('#3a9a6a'));
      r.position.set(0, 3.2, -4.5);
      r.rotation.y = Math.PI / 4;
      g.add(r);
    } else if (kind === 3) {
      for (let i = 0; i < 5; i++) this.box(0.8, 0.4 * (i + 1), 3, wood, -2 + i * 0.8, 0.2 * (i + 1), 0, g);
    } else if (kind === 4) {
      for (const dx of [-0.8, 0.8]) for (const dz of [-0.8, 0.8]) this.box(0.2, 5, 0.2, wood, dx, 2.5, dz - 4.5, g);
      this.box(2, 0.2, 2, wood, 0, 5, -4.5, g);
      const r = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.2, 4), this.mat('#ff4f6a'));
      r.position.set(0, 5.7, -4.5);
      g.add(r);
    } else {
      const bal = new THREE.Mesh(this.geo('sphere'), this.mat('#ff9a2e'));
      bal.scale.setScalar(1.6);
      bal.position.set(0, 5, -4);
      g.add(bal);
      this.box(1.4, 0.8, 1.4, wood, 0, 2.4, -4, g);
    }
  }

  private heroTex(skinId: string): THREE.Texture {
    const skin = skinId === 'me' ? (SKINS.find((s) => s.id === globalSave.skin) ?? SKINS[0]) : (SKINS.find((s) => s.id === skinId) ?? SKINS[0]);
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d')!;
    x.translate(64, 64);
    const pose: PlayerPose = { t: 0, blink: 0, lookX: 0, lookY: 0.1, sx: 1, sy: 1, mood: 'happy', lx: -0.5, ly: -0.7, still: true };
    try {
      drawPlayer(x, skin, 38, pose);
    } catch {
      x.fillStyle = skin.light;
      x.beginPath();
      x.arc(0, 0, 38, 0, TAU);
      x.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.texs.push(tex);
    return tex;
  }

  private buildPlayer(): void {
    this.player = new THREE.Group();
    this.scene.add(this.player);
    this.playerSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.heroTex('me') }));
    this.playerSpr.scale.set(1.9, 1.9, 1);
    this.playerSpr.position.y = 0.95;
    this.player.add(this.playerSpr);
    const sh = new THREE.Mesh(new THREE.CircleGeometry(0.6, 12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.03;
    this.player.add(sh);
    this.toolMesh = new THREE.Group();
    this.player.add(this.toolMesh);
    this.rebuildTool();
    // veículos (1..4)
    for (let v = 1; v <= 4; v++) {
      const g = new THREE.Group();
      const col = ['#3ee07a', '#ff9a2e', '#ffcf2e', '#ff4f6a'][v - 1];
      if (v === 1) {
        this.box(1.2, 0.5, 0.9, col, 1.0, 0.55, 0, g);
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.15, 10), this.mat('#2a0b5c'));
        w.rotation.x = Math.PI / 2;
        w.position.set(1.4, 0.25, 0);
        g.add(w);
      } else {
        const L = v === 4 ? 3.6 : 3;
        this.box(L, 0.8, 1.6, col, 0, 0.75, 0, g);
        this.box(1, 0.9, 1.4, '#5ef0ff', L * 0.3, 1.5, 0, g);
        for (const dx of [-L * 0.35, L * 0.3])
          for (const dz of [-0.85, 0.85]) {
            const w = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.25, 10), this.mat('#2a0b5c'));
            w.rotation.x = Math.PI / 2;
            w.position.set(dx, 0.38, dz);
            g.add(w);
          }
        if (v === 3) this.box(0.9, 0.15, 1.6, '#9b92bf', L * 0.6 + 0.4, 0.5, 0, g);
        if (v === 4) this.box(0.35, 1, 0.35, '#2a0b5c', L * 0.4, 2.2, 0, g);
      }
      g.visible = false;
      this.player.add(g);
      this.vehMesh.push(g);
    }
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(this.geo('log'), this.mat('#9a6a3c'));
      m.scale.set(0.7, 0.8, 0.7);
      m.rotation.z = Math.PI / 2;
      m.visible = false;
      this.player.add(m);
      this.carryMeshes.push(m);
    }
  }

  private toolLevel = -1;
  private rebuildTool(): void {
    const tl = TOOLS[this.sim.s.tool];
    this.toolLevel = this.sim.s.tool;
    while (this.toolMesh.children.length) this.toolMesh.remove(this.toolMesh.children[0]);
    this.box(0.1, 1.1, 0.1, '#8a5228', 0, 0.55, 0, this.toolMesh);
    if (tl.kind === 'axe') this.box(0.08, 0.4, 0.5, tl.color, 0, 1.0, 0.22, this.toolMesh);
    else if (tl.kind === 'saw') this.box(0.12, 0.7, 0.28, tl.color, 0, 1.2, 0, this.toolMesh);
    else this.box(0.14, 0.5, 0.14, tl.color, 0, 1.1, 0, this.toolMesh);
    this.toolMesh.position.set(0.7, 0.6, 0);
  }

  /* ------------------------------ entrada de câmera ------------------------------ */

  private bindDrag(): void {
    const el = this.renderer.domElement;
    const down = (e: PointerEvent) => {
      if (this.drag.id >= 0) return;
      this.drag.id = e.pointerId;
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== this.drag.id) return;
      this.yaw -= (e.clientX - this.drag.x) * 0.008;
      this.pitch = Math.max(-0.2, Math.min(0.9, this.pitch + (e.clientY - this.drag.y) * 0.005));
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId === this.drag.id) this.drag.id = -1;
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    this.offs.push(() => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    });
  }

  toWorld(jx: number, jy: number, out: { mx: number; mz: number }): void {
    // frente da câmera = (sin yaw, cos yaw); direita = (cos yaw, -sin yaw)… no plano XZ
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const rx = -fz;
    const rz = fx;
    out.mx = fx * -jy + rx * jx;
    out.mz = fz * -jy + rz * jx;
  }

  toggleCam(): void {
    this.first = !this.first;
    this.sim.s.cam = this.first ? 'first' : 'third';
  }

  setQuality(q: QualitySettings): void {
    void q;
  }

  resize(): void {
    const w = this.root.clientWidth || window.innerWidth;
    const h = this.root.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.cam.aspect = w / h;
    this.cam.fov = w < h ? 70 : 58;
    this.cam.updateProjectionMatrix();
  }

  /* ------------------------------ partículas ------------------------------ */

  private emitP(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: string, life: number): void {
    if (Math.random() > this.q.particles) return;
    const i = this.pNext;
    this.pNext = (this.pNext + 1) % MAXP;
    this.pPos[i * 3] = x;
    this.pPos[i * 3 + 1] = y;
    this.pPos[i * 3 + 2] = z;
    this.pVel[i * 3] = vx;
    this.pVel[i * 3 + 1] = vy;
    this.pVel[i * 3 + 2] = vz;
    this.col.set(color);
    this.pCol[i * 3] = this.col.r;
    this.pCol[i * 3 + 1] = this.col.g;
    this.pCol[i * 3 + 2] = this.col.b;
    this.pLife[i] = life;
  }

  private burst(n: number, x: number, y: number, z: number, sp: number, color: string, life = 1, up = 4): void {
    for (let i = 0; i < n; i++) this.emitP(x, y, z, (Math.random() - 0.5) * sp, Math.random() * up, (Math.random() - 0.5) * sp, color, life * (0.6 + Math.random() * 0.6));
  }

  private onEvent(e: Ev): void {
    switch (e.type) {
      case 'chip': {
        const sp = SPECIES[e.a];
        this.burst(8, e.x, e.y, e.z, 5, sp.trunk, 0.8);
        this.burst(4, e.x, e.y, e.z, 3, '#ffe2b0', 0.8);
        this.burst(2, e.x, sp.h * 0.7, e.z, 2, sp.leaf, 2, 0.5);
        if (e.b === 2) this.burst(6, e.x, e.y, e.z, 4, '#9ff6ff', 0.6);
        break;
      }
      case 'fell':
        this.startFall(this.sim.trees[e.a]);
        break;
      case 'land':
        this.burst(18, e.x, 0.3, e.z, 6, '#e6d2aa', 0.9, 2);
        this.burst(10, e.x, 1, e.z, 5, SPECIES[e.a].leaf, 1.6, 3);
        break;
      case 'saw':
        this.burst(16, SAW_X - 0.5, 1.2, 0, 4, '#ffe6b8', 1);
        break;
      case 'plank':
        if (e.b === 1) this.burst(6, PLANER_X, 1.4, 0, 3, '#fff3d0', 0.8);
        break;
      case 'sell':
      case 'buy':
        this.burst(24, e.x, 1.5, e.z, 6, '#ffd34a', 1.2, 6);
        break;
      case 'build':
        this.burst(40, e.x, 2, 0, 8, '#7affc4', 1.5, 6);
        this.burst(30, e.x, 2, 0, 8, '#ffd34a', 1.5, 6);
        break;
      case 'rare':
        this.burst(30, e.x, e.y, e.z, 6, RARES[e.a].color, 1.5, 5);
        this.sim.toast?.(RARES[e.a].name() + '!');
        break;
      case 'grow':
      case 'plant':
        this.burst(8, e.x, 0.6, e.z, 2, '#9cff8a', 1, 2);
        break;
      default:
        break;
    }
  }

  /* ------------------------------ queda com cannon-es ------------------------------ */

  private startFall(tr: Tree): void {
    const v = this.trees[tr.id];
    const sp = SPECIES[tr.sp];
    tr.ext = true;
    const h = sp.h * 0.85;
    const body = new CANNON.Body({ mass: 30, material: this.groundMat, angularDamping: 0.3, linearDamping: 0.05 });
    body.addShape(new CANNON.Box(new CANNON.Vec3(0.35, h / 2, 0.35)));
    body.position.set(tr.x + tr.fdx * 0.05, h / 2 + 0.02, tr.z + tr.fdz * 0.05);
    // gira em torno do eixo perpendicular à direção da queda
    const ax = new CANNON.Vec3(tr.fdz, 0, -tr.fdx);
    body.angularVelocity.set(ax.x * 1.2, 0, ax.z * 1.2);
    body.applyImpulse(new CANNON.Vec3(tr.fdx * 30, 0, tr.fdz * 30), new CANNON.Vec3(body.position.x, h, body.position.z));
    this.world.addBody(body);
    v.body = body;
    v.fallT = 0;
    v.stump.visible = true;
  }

  private stepFalls(dt: number): void {
    for (let i = 0; i < this.trees.length; i++) {
      const v = this.trees[i];
      if (!v.body) continue;
      const tr = this.sim.trees[i];
      v.fallT += dt;
      const b = v.body;
      const h = SPECIES[tr.sp].h * 0.85;
      // origem do grupo = base do tronco
      this.tmpQ.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      this.tmpV.set(0, -h / 2, 0).applyQuaternion(this.tmpQ);
      v.g.position.set(b.position.x + this.tmpV.x, b.position.y + this.tmpV.y, b.position.z + this.tmpV.z);
      v.g.quaternion.copy(this.tmpQ);
      v.g.scale.setScalar(0.85);
      const up = this.tmpV2.set(0, 1, 0).applyQuaternion(this.tmpQ);
      const landed = (up.y < 0.25 && b.angularVelocity.length() < 1.5) || v.fallT > 3.2;
      if (landed) {
        const L = Math.hypot(up.x, up.z) || 1;
        tr.fdx = up.x / L;
        tr.fdz = up.z / L;
        this.world.removeBody(b);
        v.body = null;
        v.g.visible = false;
        v.g.scale.setScalar(1);
        v.g.quaternion.identity();
        v.g.rotation.y = (tr.id * 1.7) % TAU;
        v.g.position.set(tr.x, 0, tr.z);
        tr.ext = false;
        this.sim.landTree(tr);
      }
    }
  }

  /* ------------------------------ quadro ------------------------------ */

  frame(dt: number): void {
    this.time += dt;
    const sim = this.sim;
    sim.drain((e) => this.onEvent(e));
    this.world.step(1 / 60, dt, 3);
    this.stepFalls(dt);
    const m = sim.me;
    // céu por bioma
    const b = sim.biome;
    if (b !== this.biome) {
      this.biome = b;
      this.skyTarget.set(BIOMES[b].sky[1]);
      this.hemi.intensity = BIOMES[b].night ? 0.8 : 1.4;
      this.sun.intensity = BIOMES[b].night ? 0.5 : 1.6;
    }
    this.skyCol.lerp(this.skyTarget, Math.min(1, dt * 2));
    this.scene.background = this.skyCol;
    (this.scene.fog as THREE.Fog).color.copy(this.skyCol);
    this.sun.position.set(m.x - 10, 20, m.z + 8);
    this.sun.target.position.set(m.x, 0, m.z);

    // árvores
    for (let i = 0; i < this.trees.length; i++) {
      const v = this.trees[i];
      const tr = sim.trees[i];
      const near = Math.abs(tr.x - m.x) < VIEW_R;
      if (v.body) continue;
      if (tr.rare !== v.rare || tr.sp !== v.sp) {
        // a muda nasceu com outra variante: refaz o modelo
        this.scene.remove(v.g);
        v.g = this.makeTree(SPECIES[tr.sp], tr.rare);
        v.g.position.set(tr.x, 0, tr.z);
        v.g.rotation.y = (tr.id * 1.7) % TAU;
        this.scene.add(v.g);
        v.rare = tr.rare;
        v.sp = tr.sp;
      }
      v.stump.visible = near && (tr.state === TS.Stump || tr.state === TS.Sapling);
      const show = near && (tr.state === TS.Grown || tr.state === TS.Sapling);
      v.g.visible = show;
      if (!show) continue;
      const s = tr.state === TS.Sapling ? 0.12 + tr.grow * 0.88 : 1;
      v.g.scale.setScalar(s);
      if (tr.shake > 0) v.g.rotation.z = Math.sin(tr.shake * 60) * 0.03;
      else if (v.g.rotation.z) v.g.rotation.z = 0;
    }
    // toras
    this.syncLogs(dt);
    // esteira
    for (let i = 0; i < sim.belt.length; i++) {
      const bi = sim.belt[i];
      const me = this.beltMeshes[i];
      me.visible = bi.on;
      if (!bi.on) continue;
      me.position.set(bi.x, 1.1, 0);
      me.scale.y = Math.min(5, bi.n) * 0.8;
      const mk = bi.planed ? 99 : bi.sp;
      if (me.userData.k !== mk) {
        me.userData.k = mk;
        me.material = this.mat(bi.planed ? '#ffe2b0' : SPECIES[bi.sp].trunk);
      }
    }
    this.blade.rotation.y = sim.sawSpin;
    const st = Math.min(4, Math.sqrt(sim.s.planks) * 0.25);
    this.stack.visible = sim.s.planks > 0;
    this.stack.scale.y = Math.max(0.05, st);
    this.stack.position.y = 0.3 + st / 2;
    // portões
    for (let i = 0; i < this.gates.length; i++) {
      const built = sim.s.unlocked > i + 1;
      if (built !== this.gateBuilt[i]) this.fillGate(i + 1, this.gates[i], built);
    }
    // jogador
    this.player.position.set(m.x, 0, m.z);
    const ride = sim.s.vehicle >= 2;
    this.playerSpr.position.y = ride ? 2.3 : 0.95 + Math.abs(Math.sin(m.walk * 3)) * 0.18;
    this.player.rotation.y = m.yaw - Math.PI / 2;
    for (let i = 0; i < this.vehMesh.length; i++) this.vehMesh[i].visible = sim.s.vehicle === i + 1;
    if (this.toolLevel !== sim.s.tool) this.rebuildTool();
    this.toolMesh.position.set(0.7, ride ? 1.9 : 0.6, 0.3);
    this.toolMesh.rotation.z = -0.4 - m.swing * 1.6;
    const showN = Math.min(m.carry, this.carryMeshes.length);
    for (let i = 0; i < this.carryMeshes.length; i++) {
      const c = this.carryMeshes[i];
      c.visible = i < showN;
      if (!c.visible) continue;
      const row = Math.floor(i / 2);
      if (ride) c.position.set(-0.6, 1.4 + row * 0.5, (i % 2) * 0.6 - 0.3);
      else if (sim.s.vehicle === 1) c.position.set(1.0, 1.0 + row * 0.45, (i % 2) * 0.5 - 0.25);
      else c.position.set(-0.3, 1.9 + row * 0.45, 0);
    }
    this.playerSpr.visible = !this.first;
    // ajudantes, amigos e remotos
    this.syncAgents();
    // partículas
    for (let i = 0; i < MAXP; i++) {
      if (this.pLife[i] <= 0) continue;
      this.pLife[i] -= dt;
      const k = i * 3;
      this.pVel[k + 1] -= 9 * dt;
      this.pPos[k] += this.pVel[k] * dt;
      this.pPos[k + 1] += this.pVel[k + 1] * dt;
      this.pPos[k + 2] += this.pVel[k + 2] * dt;
      if (this.pPos[k + 1] < 0.05) {
        this.pPos[k + 1] = 0.05;
        this.pVel[k] *= 0.5;
        this.pVel[k + 2] *= 0.5;
        this.pVel[k + 1] = 0;
      }
      if (this.pLife[i] <= 0) this.pPos[k + 1] = -100;
    }
    (this.pGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.pGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    // câmera
    if (this.first) {
      this.camPos.set(m.x, 1.6, m.z);
      this.cam.position.copy(this.camPos);
      this.tmpV.set(m.x + Math.sin(this.yaw) * 5, 1.6 - this.pitch * 3 + 1, m.z + Math.cos(this.yaw) * 5);
      this.cam.lookAt(this.tmpV);
    } else {
      const dist = ride ? 10 : 8.5;
      const tx = m.x - Math.sin(this.yaw) * dist * Math.cos(this.pitch);
      const tz = m.z - Math.cos(this.yaw) * dist * Math.cos(this.pitch);
      const ty = 1.5 + Math.sin(this.pitch) * dist + 1.5;
      this.camPos.lerp(this.tmpV.set(tx, ty, tz), Math.min(1, dt * 6));
      this.cam.position.copy(this.camPos);
      this.cam.lookAt(this.tmpV.set(m.x, 1.6, m.z));
    }
    this.renderer.render(this.scene, this.cam);
  }

  private syncLogs(dt: number): void {
    const sim = this.sim;
    let bodies = 0;
    for (const b of this.logBodies) if (b) bodies++;
    for (let i = 0; i < sim.logs.length; i++) {
      const l = sim.logs[i];
      const mesh = this.logMeshes[i];
      let body = this.logBodies[i];
      if (!l.on) {
        mesh.visible = false;
        if (body) {
          this.world.removeBody(body);
          this.logBodies[i] = null;
          (l as any).body = null;
        }
        continue;
      }
      if (!body && l.age < 0.3 && bodies < this.q.logBodies) {
        body = new CANNON.Body({ mass: 3, material: this.groundMat, angularDamping: 0.4, linearDamping: 0.25 });
        body.addShape(new CANNON.Cylinder(0.33, 0.33, 1.3, 8));
        body.position.set(l.x, Math.max(0.4, l.y + 0.2), l.z);
        // eixo da tora perpendicular à queda → rola para a frente
        body.quaternion.setFromEuler(Math.PI / 2, 0, 0);
        const q2 = new CANNON.Quaternion();
        q2.setFromEuler(0, -l.yaw, 0);
        body.quaternion = q2.mult(body.quaternion);
        body.velocity.set(l.vx, l.vy, l.vz);
        this.world.addBody(body);
        this.logBodies[i] = body;
        (l as any).body = body;
        bodies++;
      }
      if (body) {
        l.x = body.position.x;
        l.y = body.position.y;
        l.z = Math.max(-WORLD_Z, Math.min(WORLD_Z, body.position.z));
        mesh.position.set(body.position.x, body.position.y, body.position.z);
        mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
        // depois de parar, devolve para a simulação simples (libera corpo)
        if (body.sleepState === CANNON.Body.SLEEPING || l.age > 6) {
          this.world.removeBody(body);
          this.logBodies[i] = null;
          (l as any).body = null;
          l.vx = l.vy = l.vz = 0;
          l.y = 0.3;
        }
      } else {
        mesh.position.set(l.x, Math.max(0.33, l.y), l.z);
        mesh.rotation.set(0, -l.yaw, Math.PI / 2);
      }
      mesh.visible = Math.abs(l.x - sim.me.x) < VIEW_R;
      const mk = l.sp * 8 + l.rare;
      if (mesh.userData.k !== mk) {
        mesh.userData.k = mk;
        mesh.material = this.mat(l.rare ? RARES[l.rare].color : SPECIES[l.sp].trunk, l.rare ? 0.2 : 0);
      }
      if (l.ghost) mesh.visible = mesh.visible && l.age < 4;
    }
    void dt;
  }

  private agentObj(key: object, kind: string, skin: string, name: string): THREE.Object3D {
    let o = this.agentObjs.get(key);
    if (o) return o;
    const g = new THREE.Group();
    if (kind === 'friend' || kind === 'remote') {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.heroTex(skin) }));
      s.scale.set(1.7, 1.7, 1);
      s.position.y = 0.85;
      g.add(s);
      const l = this.label(name, '#fff', 0.6);
      l.position.y = 2.1;
      g.add(l);
      const t = new THREE.Group();
      this.box(0.08, 0.9, 0.08, '#8a5228', 0, 0.45, 0, t);
      this.box(0.06, 0.32, 0.4, '#dcd6f0', 0, 0.8, 0.18, t);
      t.position.set(0.6, 0.5, 0.2);
      t.name = 'tool';
      g.add(t);
    } else if (kind === 'drone') {
      const body = new THREE.Mesh(this.geo('sphere'), this.mat('#2a9be0'));
      body.scale.set(0.6, 0.35, 0.6);
      g.add(body);
      for (const dx of [-0.7, 0.7]) this.box(0.8, 0.05, 0.12, '#dcd6f0', dx, 0.35, 0, g).name = 'rotor';
    } else {
      const col = kind === 'planter' ? '#3ee07a' : '#dcd6f0';
      this.box(0.9, 0.9, 0.7, col, 0, 0.85, 0, g);
      this.box(0.6, 0.3, 0.05, '#2a0b5c', 0, 0.95, 0.36, g);
      this.box(0.18, 0.4, 0.18, '#5a4585', -0.25, 0.2, 0, g);
      this.box(0.18, 0.4, 0.18, '#5a4585', 0.25, 0.2, 0, g);
      if (kind === 'planter') {
        const l = new THREE.Mesh(this.geo('sphere'), this.mat('#5cd04a'));
        l.scale.set(0.3, 0.12, 0.2);
        l.position.y = 1.45;
        g.add(l);
      }
    }
    const carry = new THREE.Mesh(this.geo('log'), this.mat('#9a6a3c'));
    carry.scale.set(0.6, 0.7, 0.6);
    carry.rotation.z = Math.PI / 2;
    carry.position.y = kind === 'drone' ? -0.4 : 1.9;
    carry.name = 'carry';
    g.add(carry);
    this.scene.add(g);
    this.agentObjs.set(key, g);
    o = g;
    return o;
  }

  private seen = new Set<object>();
  private syncAgents(): void {
    const sim = this.sim;
    this.seen.clear();
    for (const a of sim.agents) {
      const o = this.agentObj(a, a.kind, a.skin, a.name);
      this.seen.add(a);
      o.visible = Math.abs(a.x - sim.me.x) < VIEW_R;
      const bob = a.kind === 'drone' ? Math.sin(this.time * 4 + a.idx) * 0.1 : Math.abs(Math.sin(a.walk * 3)) * 0.1;
      o.position.set(a.x, a.y + bob + (a.kind === 'drone' ? 1 : 0), a.z);
      const carry = o.getObjectByName('carry');
      if (carry) carry.visible = a.carry > 0;
      if (a.kind === 'drone') for (const c of o.children) if (c.name === 'rotor') c.rotation.y += 0.8;
      const tool = o.getObjectByName('tool');
      if (tool) tool.rotation.z = a.state === 'chop' ? -0.4 - Math.max(0, a.swing) * 1.6 : -0.3;
      if (a.kind !== 'friend') o.rotation.y = a.face > 0 ? 0 : Math.PI;
    }
    for (const r of sim.remotes) {
      const o = this.agentObj(r, 'remote', r.skin, r.name);
      this.seen.add(r);
      o.position.set(r.x, Math.abs(Math.sin(r.walk * 3)) * 0.1, r.z);
      const carry = o.getObjectByName('carry');
      if (carry) carry.visible = r.carry > 0;
      const tool = o.getObjectByName('tool');
      if (tool) tool.rotation.z = r.chop ? -0.4 - r.swing * 1.6 : -0.3;
    }
    for (const [k, o] of this.agentObjs) {
      if (this.seen.has(k)) continue;
      this.scene.remove(o);
      this.agentObjs.delete(k);
    }
    void this.remoteObjs;
  }

  destroy(): void {
    for (const f of this.offs) f();
    this.renderer.domElement.remove();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && !Object.values(this.geos).includes(m.geometry)) m.geometry.dispose();
    });
    for (const g of Object.values(this.geos)) g.dispose();
    for (const m of this.mats.values()) m.dispose();
    for (const t of this.texs) t.dispose();
    this.pGeo.dispose();
    this.renderer.dispose();
    void settingsFor;
  }
}
