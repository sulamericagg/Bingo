/* ============================================================
 *  MOTOR DO MODO 3D DA CASA
 *  Renderer + cena + casa (cômodos, paredes pintáveis, pisos), móveis com
 *  física (cannon-es), sujeira (decalques), partículas e qualidade automática.
 *  Os modos (FPS, construção, festa) ficam em fps.ts / build.ts / party.ts.
 * ============================================================ */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import type { HomeDesign, HomeRole, MessItem } from '../home/api';
import { QualityGovernor, detectInitialTier, loadMode, type Tier } from '../core/quality';
import {
  dimsOf, ensureRooms, FLOOR_Y0, floorXYToLocal, isDirt, itemColor, itemToPlace, KINDS, kindOf, localToFloorXY, newMessId, PAINT_GH, PAINT_GW,
  palColor, placeToXY, ROOM_D, ROOM_W, surface, WALL_H, WALL_T, wallHToY, decodeStrokes, encodeStrokes, bitsToB64, type Kind, type KindInfo,
  type MessKind,
} from './adapter';
import { buildModel, disposeModels, type ModelParts } from './models';
import { blobTexture, canvas, disposeTextures, drawWallpaper, floorTexture, paintFill, splatTexture, track } from './textures';
import type { MessItem3D, RoomItem3D } from './types';

/* ---------------- qualidade (compartilhada: src/3d/common/quality.ts) ---------------- */
import { q3For, type Q3 } from '../3d/common/quality';
export { q3For, type Q3 };

/* ---------------- grupos de colisão ---------------- */
export const G = { STATIC: 1, ITEM: 2, PLAYER: 4, FOOD: 8, DEBRIS: 16, BOT: 32 };

/* ---------------- layout da casa ---------------- */
type Side = 'n' | 'e' | 's' | 'w';
const LAYOUT: Record<string, { row: 0 | 1; col: number; doors: [Side, number][] }> = {
  living: { row: 0, col: 0, doors: [['e', ROOM_D / 2], ['s', ROOM_W / 2]] },
  kitchen: { row: 0, col: 1, doors: [['w', ROOM_D / 2], ['e', ROOM_D / 2], ['s', ROOM_W / 2]] },
  bedroom: { row: 0, col: 2, doors: [['w', ROOM_D / 2]] },
  bath: { row: 1, col: 0, doors: [['s', ROOM_W / 2], ['w', ROOM_D / 2]] },
  party: { row: 1, col: 1, doors: [['e', ROOM_D / 2], ['s', ROOM_W / 2]] },
};
const DOOR_W = 1.15;
const DOOR_H = 2.05;
export const HOUSE = { minX: 0, maxX: ROOM_W * 3, minZ: 0, maxZ: ROOM_D * 2 };

export interface WallRec {
  room: RoomRec;
  side: Side;
  len: number;
  holder: THREE.Group;
  face: THREE.Mesh;
  body: THREE.Mesh;
  cv: HTMLCanvasElement;
  cx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  /** índice da parede no vetor de cobertura do cômodo */
  wi: number;
  doors: [number, number][];
  /** normal interna em mundo */
  normal: THREE.Vector3;
  cut: number;
}
export interface RoomRec {
  id: string;
  design: HomeDesign['rooms'][number];
  group: THREE.Group;
  rotY: number;
  walls: WallRec[];
  floor: THREE.Mesh;
  ceil: THREE.Mesh;
  /** cobertura de pintura (4 paredes × GW × GH) */
  cover: Uint8Array;
  /** células pintáveis (fora das portas) */
  valid: Uint8Array;
  /** camada de tinta em andamento (spec do 2D) */
  paint: string | null;
  /** tinta de base já completa (paint[room].wall) */
  base: string | null;
  center: THREE.Vector3;
  min: THREE.Vector2;
  max: THREE.Vector2;
}
export type ItemState = 'home' | 'moved' | 'held' | 'broken';
export interface ItemRec {
  room: RoomRec;
  data: RoomItem3D;
  kind: Kind;
  v: number;
  info: KindInfo;
  dims: { w: number; d: number; h: number };
  obj: THREE.Group;
  solid: THREE.Mesh | null;
  shadow: THREE.Mesh | null;
  body: CANNON.Body | null;
  homeP: THREE.Vector3;
  homeQ: THREE.Quaternion;
  state: ItemState;
  /** veio do save já fora do lugar/quebrado (visitante pode arrumar) */
  fromMess: boolean;
  /** animação de arrumar (0..1) */
  fix: number;
  fixFrom?: { p: THREE.Vector3; q: THREE.Quaternion };
  debris?: THREE.Group;
}
export interface DecalRec {
  m: MessItem3D;
  mesh: THREE.Mesh;
  mat: THREE.MeshLambertMaterial;
  dirt: number;
  room: RoomRec;
  normal: THREE.Vector3;
  vacuum: boolean;
}
interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  grow: number;
  tile: number;
  r: number;
  g: number;
  b: number;
  grav: number;
}

const V = new THREE.Vector3();
const V2 = new THREE.Vector3();
const Q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(70, 1, 0.05, 80);
  readonly world = new CANNON.World({ gravity: new CANNON.Vec3(0, -14, 0), allowSleep: true });
  readonly gov: QualityGovernor;
  q: Q3;
  design: HomeDesign;
  mess: MessItem3D[];
  rooms: RoomRec[] = [];
  items: ItemRec[] = [];
  decals: DecalRec[] = [];
  pickables: THREE.Object3D[] = [];
  readonly matSolid: THREE.Material;
  readonly matGlow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  readonly matShadow = new THREE.MeshBasicMaterial({ map: blobTexture('shadow'), transparent: true, depthWrite: false, opacity: 0.9 });
  readonly matWallBody = new THREE.MeshLambertMaterial({ color: '#efe6ff' });
  private faceMats = new Map<THREE.Texture, THREE.Material>();
  private matsOwned: THREE.Material[] = [];
  private geoOwned: THREE.BufferGeometry[] = [];
  readonly planeGeo = new THREE.PlaneGeometry(1, 1);
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  point: THREE.PointLight | null = null;
  bodyMat = new CANNON.Material('default');
  role: HomeRole;
  editable: boolean;
  changed = false;
  cleaned = 0;
  broken = 0;
  /** chamado quando uma sujeira nasce/some (festa sincroniza) */
  onMessAdded?: (m: MessItem3D) => void;
  onMessCleaned?: (m: MessItem3D) => void;
  private onResize = () => this.resize();
  private lost = false;
  onContextLost?: () => void;
  private elapsed = 0;
  /* partículas */
  private pts: Particle[] = [];
  private ptsGeo!: THREE.BufferGeometry;
  private ptsMat!: THREE.ShaderMaterial;
  private ptsObj!: THREE.Points;
  private readonly PMAX = 320;

  constructor(
    readonly host: HTMLElement,
    design: HomeDesign,
    mess: MessItem[],
    opts: { editable: boolean; role: HomeRole; antialias?: boolean },
  ) {
    this.editable = opts.editable;
    this.role = opts.role;
    const initial = detectInitialTier();
    this.gov = new QualityGovernor({ initial, mode: loadMode(), emit: false, persist: false, onChange: (t) => this.applyTier(t) });
    this.q = q3For(this.gov.tier);
    this.renderer = new THREE.WebGLRenderer({ antialias: opts.antialias ?? this.q.tier >= 2, powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(this.q.pr);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = this.q.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const cvs = this.renderer.domElement;
    cvs.className = 'h3-canvas';
    host.appendChild(cvs);
    cvs.addEventListener('webglcontextlost', this.ctxLost, false);
    this.matSolid = this.q.standard
      ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0 })
      : new THREE.MeshLambertMaterial({ vertexColors: true });
    this.design = ensureRooms(design);
    this.mess = mess as MessItem3D[];
    this.scene.background = new THREE.Color('#2a1a63');
    this.hemi = new THREE.HemisphereLight('#fff4e6', '#7a5ca8', this.q.standard ? 1.6 : 1.35);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff1d6', this.q.standard ? 1.6 : 1.25);
    this.sun.position.set(HOUSE.maxX * 0.3 - 6, 14, -4);
    this.sun.target.position.set(HOUSE.maxX / 2, 0, HOUSE.maxZ / 2);
    this.scene.add(this.sun, this.sun.target);
    this.setupShadows();
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.defaultContactMaterial.friction = 0.35;
    this.world.defaultContactMaterial.restitution = 0.15;
    (this.world.solver as CANNON.GSSolver).iterations = 6;
    this.initParticles();
    window.addEventListener('resize', this.onResize);
    this.resize();
  }

  /* ======================= qualidade ======================= */
  private setupShadows(): void {
    const s = this.sun;
    s.castShadow = this.q.shadows;
    if (this.q.shadows) {
      s.shadow.mapSize.set(1024, 1024);
      const c = s.shadow.camera;
      c.left = -12;
      c.right = 12;
      c.top = 9;
      c.bottom = -9;
      c.near = 1;
      c.far = 40;
      s.shadow.bias = -0.0015;
      s.shadow.normalBias = 0.03;
      s.shadow.radius = 3;
    }
  }
  applyTier(t: Tier): void {
    const prevShadows = this.q.shadows;
    this.q = q3For(t);
    this.renderer.setPixelRatio(this.q.pr);
    this.resize();
    if (prevShadows !== this.q.shadows) {
      this.renderer.shadowMap.enabled = this.q.shadows;
      this.setupShadows();
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (m) m.needsUpdate = true;
      });
    }
    if (this.point) this.point.visible = this.q.pointLight;
  }
  resize(): void {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }
  private ctxLost = (e: Event) => {
    e.preventDefault();
    this.lost = true;
    this.onContextLost?.();
  };
  get contextLost(): boolean {
    return this.lost;
  }

  /* ======================= construção da casa ======================= */
  /** gera a casa em passos (para a tela de carregamento) */
  *buildSteps(): Generator<string> {
    for (const rd of this.design.rooms) {
      const L = LAYOUT[rd.id];
      if (!L) continue;
      this.buildRoom(rd);
      yield 'room:' + rd.id;
    }
    this.buildStaticPhysics();
    yield 'physics';
    for (const r of this.rooms) {
      r.design.items.forEach((it) => this.addItem(r, it as RoomItem3D));
      yield 'items:' + r.id;
    }
    this.applyMessOnLoad();
    yield 'mess';
    if (this.q.pointLight || this.q.tier >= 2) {
      this.point = new THREE.PointLight('#ffd9a8', 6, 7, 1.6);
      this.point.position.set(ROOM_W / 2, WALL_H - 0.4, ROOM_D / 2);
      this.point.visible = this.q.pointLight;
      this.scene.add(this.point);
    }
    // aquece shaders
    this.renderer.compile(this.scene, this.camera);
    yield 'shaders';
  }

  roomById(id: string): RoomRec | undefined {
    return this.rooms.find((r) => r.id === id);
  }
  roomAt(x: number, z: number): RoomRec | null {
    for (const r of this.rooms) if (x >= r.min.x && x <= r.max.x && z >= r.min.y && z <= r.max.y) return r;
    return null;
  }

  private buildRoom(rd: HomeDesign['rooms'][number]): void {
    const L = LAYOUT[rd.id];
    const g = new THREE.Group();
    const rotY = L.row === 0 ? 0 : Math.PI;
    if (L.row === 0) g.position.set(L.col * ROOM_W, 0, 0);
    else g.position.set((L.col + 1) * ROOM_W, 0, ROOM_D * 2);
    g.rotation.y = rotY;
    this.scene.add(g);
    g.updateMatrixWorld(true);
    const a = g.localToWorld(new THREE.Vector3(0, 0, 0));
    const b = g.localToWorld(new THREE.Vector3(ROOM_W, 0, ROOM_D));
    const room: RoomRec = {
      id: rd.id,
      design: rd,
      group: g,
      rotY,
      walls: [],
      floor: null as unknown as THREE.Mesh,
      ceil: null as unknown as THREE.Mesh,
      cover: new Uint8Array(4 * PAINT_GW * PAINT_GH),
      valid: new Uint8Array(4 * PAINT_GW * PAINT_GH),
      paint: null,
      base: null,
      center: g.localToWorld(new THREE.Vector3(ROOM_W / 2, 0, ROOM_D / 2)),
      min: new THREE.Vector2(Math.min(a.x, b.x), Math.min(a.z, b.z)),
      max: new THREE.Vector2(Math.max(a.x, b.x), Math.max(a.z, b.z)),
    };
    // piso
    const fw = ROOM_W - WALL_T * 2,
      fd = ROOM_D - WALL_T * 2;
    const fgeo = new THREE.PlaneGeometry(fw, fd);
    fgeo.rotateX(-Math.PI / 2);
    const uv = fgeo.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (fw / 1.1), uv.getY(i) * (fd / 1.1));
    this.geoOwned.push(fgeo);
    const fmat = this.q.standard ? new THREE.MeshStandardMaterial({ roughness: 0.85 }) : new THREE.MeshLambertMaterial();
    this.matsOwned.push(fmat);
    room.floor = new THREE.Mesh(fgeo, fmat);
    room.floor.position.set(ROOM_W / 2, 0, ROOM_D / 2);
    room.floor.receiveShadow = this.q.shadows;
    room.floor.userData = { type: 'floor', room };
    g.add(room.floor);
    // teto
    const cgeo = new THREE.PlaneGeometry(ROOM_W, ROOM_D);
    cgeo.rotateX(Math.PI / 2);
    this.geoOwned.push(cgeo);
    const cmat = new THREE.MeshBasicMaterial({ color: '#efe4f7' });
    this.matsOwned.push(cmat);
    room.ceil = new THREE.Mesh(cgeo, cmat);
    room.ceil.position.set(ROOM_W / 2, WALL_H, ROOM_D / 2);
    g.add(room.ceil);
    // paredes
    const sides: Side[] = ['n', 'e', 's', 'w'];
    sides.forEach((side, wi) => room.walls.push(this.buildWall(room, side, wi, L.doors.filter((d) => d[0] === side).map((d) => [d[1] - DOOR_W / 2, d[1] + DOOR_W / 2] as [number, number]))));
    for (const w of room.walls)
      for (let gy = 0; gy < PAINT_GH; gy++)
        for (let gx = 0; gx < PAINT_GW; gx++) {
          const u = ((gx + 0.5) / PAINT_GW) * w.len,
            y = ((gy + 0.5) / PAINT_GH) * WALL_H;
          const inDoor = w.doors.some(([a, b]) => u > a && u < b && y < DOOR_H);
          room.valid[w.wi * PAINT_GW * PAINT_GH + gy * PAINT_GW + gx] = inDoor ? 0 : 1;
        }
    this.rooms.push(room);
    // pintura salva
    const p = this.design.paint?.[rd.id] as { wall: string; strokes?: string; w3?: string } | undefined;
    if (p) {
      room.base = p.wall || null;
      room.paint = decodeStrokes(p.strokes, p.w3, room.cover);
    }
    this.refreshSurfaces(room);
  }

  private wallFrame(side: Side): { p: (u: number, y: number, d: number) => THREE.Vector3; n: THREE.Vector3; len: number } {
    const W = ROOM_W,
      D = ROOM_D,
      T = WALL_T;
    switch (side) {
      case 'n':
        return { p: (u, y, d) => new THREE.Vector3(u, y, T - d), n: new THREE.Vector3(0, 0, 1), len: W };
      case 's':
        return { p: (u, y, d) => new THREE.Vector3(W - u, y, D - T + d), n: new THREE.Vector3(0, 0, -1), len: W };
      case 'e':
        return { p: (u, y, d) => new THREE.Vector3(W - T + d, y, u), n: new THREE.Vector3(-1, 0, 0), len: D };
      default:
        return { p: (u, y, d) => new THREE.Vector3(T - d, y, D - u), n: new THREE.Vector3(1, 0, 0), len: D };
    }
  }

  private buildWall(room: RoomRec, side: Side, wi: number, doors: [number, number][]): WallRec {
    const fr = this.wallFrame(side);
    const len = fr.len;
    // face interna com recorte das portas (polígono em U)
    const pts: [number, number][] = [[0, 0]];
    for (const [a, b] of doors.sort((x, y) => x[0] - y[0])) pts.push([a, 0], [a, DOOR_H], [b, DOOR_H], [b, 0]);
    pts.push([len, 0], [len, WALL_H], [0, WALL_H]);
    const shape = new THREE.Shape(pts.map(([u, y]) => new THREE.Vector2(u, y)));
    const sg = new THREE.ShapeGeometry(shape);
    const pos = sg.getAttribute('position');
    const uv = sg.getAttribute('uv');
    const nrm = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i),
        y = pos.getY(i);
      uv.setXY(i, u / len, y / WALL_H);
      const p = fr.p(u, y, 0);
      pos.setXYZ(i, p.x, p.y, p.z);
      nrm[i * 3] = fr.n.x;
      nrm[i * 3 + 1] = fr.n.y;
      nrm[i * 3 + 2] = fr.n.z;
    }
    sg.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    // garante a face voltada para dentro
    const idx = sg.getIndex();
    if (idx) {
      const p0 = new THREE.Vector3().fromBufferAttribute(pos, idx.getX(0));
      const p1 = new THREE.Vector3().fromBufferAttribute(pos, idx.getX(1));
      const p2 = new THREE.Vector3().fromBufferAttribute(pos, idx.getX(2));
      const fn = p1.sub(p0).cross(p2.sub(p0));
      if (fn.dot(fr.n) < 0) {
        for (let i = 0; i < idx.count; i += 3) {
          const t = idx.getX(i + 1);
          idx.setX(i + 1, idx.getX(i + 2));
          idx.setX(i + 2, t);
        }
      }
    }
    this.geoOwned.push(sg);
    const cw = Math.round((len / ROOM_W) * 320),
      ch = 144;
    const [cv, cx] = canvas(cw, ch);
    const tex = track(new THREE.CanvasTexture(cv));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.q.tier >= 2 ? 4 : 1;
    const fmat = this.q.standard ? new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }) : new THREE.MeshLambertMaterial({ map: tex });
    this.matsOwned.push(fmat);
    const face = new THREE.Mesh(sg, fmat);
    face.receiveShadow = this.q.shadows;
    // corpo (blocos ao redor das portas)
    const boxes: THREE.BufferGeometry[] = [];
    const seg = (u0: number, u1: number, y0: number, y1: number) => {
      if (u1 - u0 < 0.01) return;
      const bx = new THREE.BoxGeometry(u1 - u0, y1 - y0, WALL_T);
      // monta no referencial (u, y, profundidade) e converte
      const c = fr.p((u0 + u1) / 2, (y0 + y1) / 2, WALL_T / 2 + 0.003);
      const ang = side === 'n' ? 0 : side === 's' ? Math.PI : side === 'e' ? -Math.PI / 2 : Math.PI / 2;
      bx.rotateY(ang);
      bx.translate(c.x, c.y, c.z);
      boxes.push(bx);
    };
    let u = 0;
    for (const [a, b] of doors) {
      seg(u, a, 0, WALL_H);
      seg(a, b, DOOR_H, WALL_H);
      u = b;
    }
    seg(u, len, 0, WALL_H);
    const bodyGeo = boxes.length === 1 ? boxes[0] : mergeBoxes(boxes);
    this.geoOwned.push(bodyGeo);
    const body = new THREE.Mesh(bodyGeo, this.matWallBody);
    const holder = new THREE.Group();
    holder.add(face, body);
    room.group.add(holder);
    const normal = fr.n.clone().applyAxisAngle(UP, room.rotY);
    const w: WallRec = { room, side, len, holder, face, body, cv, cx, tex, wi, doors, normal, cut: 1 };
    face.userData = { type: 'wall', wall: w };
    this.pickables.push(face);
    return w;
  }

  /** redesenha piso e paredes (estilo + pintura) */
  refreshSurfaces(room: RoomRec): void {
    const [fs, fc] = surface(room.design.floor, 'wood:15');
    const fm = room.floor.material as THREE.MeshLambertMaterial;
    fm.map = floorTexture(fs, fc, this.q.tier >= 2 ? 4 : 1);
    fm.needsUpdate = true;
    for (const w of room.walls) this.redrawWall(w);
  }
  redrawWall(w: WallRec, rect?: [number, number, number, number]): void {
    const room = w.room;
    const [ws, wc] = surface(room.design.wall, 'paint:14');
    const { cv, cx } = w;
    const W = cv.width,
      H = cv.height;
    cx.save();
    if (rect) {
      cx.beginPath();
      cx.rect(rect[0], rect[1], rect[2], rect[3]);
      cx.clip();
    }
    drawWallpaper(cx, ws, wc, W, H, room.id + w.side);
    if (room.base) {
      paintFill(cx, room.base, 0, 0, W, H - 5, W, H);
    }
    if (room.paint) {
      const off = w.wi * PAINT_GW * PAINT_GH;
      const cw = W / PAINT_GW,
        ch = H / PAINT_GH;
      for (let gy = 0; gy < PAINT_GH; gy++)
        for (let gx = 0; gx < PAINT_GW; gx++)
          if (room.cover[off + gy * PAINT_GW + gx]) {
            const x = gx * cw,
              y = (PAINT_GH - 1 - gy) * ch;
            if (rect && (x > rect[0] + rect[2] || x + cw < rect[0] || y > rect[1] + rect[3] || y + ch < rect[1])) continue;
            paintFill(cx, room.paint, Math.floor(x), Math.floor(y), Math.ceil(cw) + 1, Math.ceil(ch) + 1, W, H);
          }
    }
    if (room.base || room.paint) {
      cx.fillStyle = 'rgba(40,20,70,0.35)';
      cx.fillRect(0, H - 5, W, 5);
    }
    cx.restore();
    w.tex.needsUpdate = true;
  }

  private buildStaticPhysics(): void {
    const floor = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane(), material: this.bodyMat, collisionFilterGroup: G.STATIC });
    floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(floor);
    const ceil = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane(), collisionFilterGroup: G.STATIC });
    ceil.quaternion.setFromEuler(Math.PI / 2, 0, 0);
    ceil.position.set(0, WALL_H, 0);
    this.world.addBody(ceil);
    for (const r of this.rooms)
      for (const w of r.walls) {
        const fr = this.wallFrame(w.side);
        let u = 0;
        const seg = (u0: number, u1: number) => {
          if (u1 - u0 < 0.01) return;
          const c = r.group.localToWorld(fr.p((u0 + u1) / 2, WALL_H / 2, WALL_T / 2));
          const along = new THREE.Vector3(1, 0, 0).applyAxisAngle(UP, (w.side === 'n' ? 0 : w.side === 's' ? Math.PI : w.side === 'e' ? -Math.PI / 2 : Math.PI / 2) + r.rotY);
          const hx = Math.abs(along.x) > 0.5 ? (u1 - u0) / 2 : WALL_T / 2;
          const hz = Math.abs(along.x) > 0.5 ? WALL_T / 2 : (u1 - u0) / 2;
          const b = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Box(new CANNON.Vec3(hx, WALL_H / 2, hz)), collisionFilterGroup: G.STATIC });
          b.position.set(c.x, c.y, c.z);
          this.world.addBody(b);
        };
        for (const [a, b] of w.doors) {
          seg(u, a);
          u = b;
        }
        seg(u, w.len);
      }
  }

  /* ======================= móveis ======================= */
  addItem(room: RoomRec, data: RoomItem3D): ItemRec {
    const { kind, v } = kindOf(data.id);
    const info = KINDS[kind];
    const dims = dimsOf(kind, v);
    const col = itemColor(data);
    const parts = buildModel(kind, v, col, this.q.seg, hashN(data.id + room.id + data.x));
    const obj = this.makeObj(parts);
    const pl = itemToPlace(data);
    const homeP = room.group.localToWorld(new THREE.Vector3(pl.x, pl.y, pl.z));
    const homeQ = new THREE.Quaternion().setFromAxisAngle(UP, pl.yaw + room.rotY);
    obj.position.copy(homeP);
    obj.quaternion.copy(homeQ);
    this.scene.add(obj);
    let shadow: THREE.Mesh | null = null;
    if (!info.wall && !info.ceil && !info.flat) {
      shadow = new THREE.Mesh(this.planeGeo, this.matShadow);
      shadow.rotation.x = -Math.PI / 2;
      shadow.scale.set(dims.w * 1.25, dims.d * 1.25, 1);
      shadow.position.set(0, 0.006, 0);
      shadow.renderOrder = 1;
      obj.add(shadow);
    }
    const rec: ItemRec = { room, data, kind, v, info, dims, obj, solid: null, shadow, body: null, homeP, homeQ, state: 'home', fromMess: false, fix: 0 };
    obj.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o !== shadow) {
        o.userData = { type: 'item', item: rec };
        this.pickables.push(o);
        if (!rec.solid) rec.solid = o as THREE.Mesh;
      }
    });
    if (!info.wall && !info.ceil && !info.flat) {
      const b = new CANNON.Body({
        mass: info.light ? Math.max(1, dims.w * dims.d * dims.h * 30) : 0,
        type: info.light ? CANNON.Body.DYNAMIC : CANNON.Body.STATIC,
        shape: new CANNON.Box(new CANNON.Vec3(dims.w / 2, dims.h / 2, dims.d / 2)),
        material: this.bodyMat,
        collisionFilterGroup: G.ITEM,
        collisionFilterMask: G.STATIC | G.ITEM | G.PLAYER | G.FOOD | G.DEBRIS | G.BOT,
        linearDamping: 0.25,
        angularDamping: 0.4,
        allowSleep: true,
        sleepSpeedLimit: 0.15,
        sleepTimeLimit: 0.6,
      });
      this.syncBodyFromObj(rec, b);
      this.world.addBody(b);
      if (info.light) b.sleep();
      rec.body = b;
      (b as unknown as { item: ItemRec }).item = rec;
    }
    this.items.push(rec);
    return rec;
  }
  makeObj(parts: ModelParts): THREE.Group {
    const obj = new THREE.Group();
    if (parts.solid) {
      const m = new THREE.Mesh(parts.solid, this.matSolid);
      m.castShadow = this.q.shadows;
      m.receiveShadow = this.q.shadows;
      obj.add(m);
    }
    if (parts.glow) obj.add(new THREE.Mesh(parts.glow, this.matGlow));
    for (const f of parts.faces) {
      let mat = this.faceMats.get(f.tex);
      if (!mat) {
        mat = new THREE.MeshBasicMaterial({ map: f.tex, toneMapped: false });
        this.faceMats.set(f.tex, mat);
      }
      const p = new THREE.Mesh(this.planeGeo, mat);
      p.scale.set(f.w, f.h, 1);
      p.position.set(f.x, f.y, f.z);
      p.rotation.y = f.ry;
      obj.add(p);
    }
    return obj;
  }
  removeItem(it: ItemRec): void {
    this.scene.remove(it.obj);
    if (it.debris) this.scene.remove(it.debris);
    if (it.body) this.world.removeBody(it.body);
    this.pickables = this.pickables.filter((o) => o.userData.item !== it);
    this.items.splice(this.items.indexOf(it), 1);
  }
  /** corpo ← objeto (base no chão → centro da caixa) */
  syncBodyFromObj(it: ItemRec, b = it.body!): void {
    V.set(0, it.dims.h / 2, 0).applyQuaternion(it.obj.quaternion).add(it.obj.position);
    b.position.set(V.x, V.y, V.z);
    b.quaternion.set(it.obj.quaternion.x, it.obj.quaternion.y, it.obj.quaternion.z, it.obj.quaternion.w);
    b.velocity.setZero();
    b.angularVelocity.setZero();
  }
  syncObjFromBody(it: ItemRec): void {
    const b = it.body!;
    it.obj.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    V.set(0, -it.dims.h / 2, 0).applyQuaternion(it.obj.quaternion);
    it.obj.position.set(b.position.x + V.x, b.position.y + V.y, b.position.z + V.z);
  }
  /** move o objeto de volta para casa (sem animação) */
  homeItem(it: ItemRec): void {
    it.obj.position.copy(it.homeP);
    it.obj.quaternion.copy(it.homeQ);
    if (it.body) {
      this.syncBodyFromObj(it);
      it.body.sleep();
    }
    it.state = 'home';
  }
  /** recalcula a casa do item depois de editar data (construção) */
  rehome(it: ItemRec): void {
    const pl = itemToPlace(it.data);
    it.homeP.copy(it.room.group.localToWorld(new THREE.Vector3(pl.x, pl.y, pl.z)));
    it.homeQ.setFromAxisAngle(UP, pl.yaw + it.room.rotY);
    this.homeItem(it);
  }
  /** troca a malha (cor nova) */
  remodel(it: ItemRec): void {
    const parts = buildModel(it.kind, it.v, itemColor(it.data), this.q.seg, hashN(it.data.id + it.room.id + it.data.x));
    const fresh = this.makeObj(parts);
    for (const c of [...it.obj.children]) if (c !== it.shadow) it.obj.remove(c);
    this.pickables = this.pickables.filter((o) => o.userData.item !== it);
    it.solid = null;
    for (const c of [...fresh.children]) {
      it.obj.add(c);
      c.userData = { type: 'item', item: it };
      this.pickables.push(c);
      if (!it.solid) it.solid = c as THREE.Mesh;
    }
  }

  /* ======================= sujeira ======================= */
  private applyMessOnLoad(): void {
    for (const m of this.mess) {
      if (m.moved) {
        const it = this.findItemFor(m);
        if (!it) continue;
        it.fromMess = true;
        if (m.broken) this.setBroken(it, false);
        else {
          const loc = floorXYToLocal(m.x, m.y);
          const p = it.room.group.localToWorld(new THREE.Vector3(loc.x, 0, loc.z));
          it.obj.position.set(p.x, it.homeP.y, p.z);
          const yaw = (m.yaw ?? 0) + it.room.rotY;
          it.obj.quaternion.setFromAxisAngle(UP, yaw);
          if (m.rot) it.obj.quaternion.multiply(Q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), m.rot));
          if (m.rot && Math.abs(m.rot) > 0.6) it.obj.position.y += Math.min(it.dims.w, it.dims.h) / 2;
          it.state = 'moved';
          if (it.body) {
            this.syncBodyFromObj(it);
            it.body.wakeUp();
          }
        }
      }
      if (isDirt(m)) this.addDecal(m, false);
    }
  }
  /** moved.itemId = índice do item em RoomDesign.items (igual ao 2D); aceita id do catálogo como reserva */
  findItemFor(m: MessItem): ItemRec | undefined {
    const mv = m.moved!;
    const room = this.roomById(m.room);
    if (!room) return undefined;
    const idx = /^\d+$/.test(mv.itemId) ? Number(mv.itemId) : -1;
    const data = idx >= 0 ? room.design.items[idx] : room.design.items.find((d) => d.id === mv.itemId && d.x === mv.ox && d.y === mv.oy);
    return data ? this.items.find((i) => i.data === data) : undefined;
  }
  /** cria o decalque de uma sujeira. Se `fresh`, também adiciona ao vetor mess. */
  addDecal(m: MessItem3D, fresh: boolean, at?: { p: THREE.Vector3; n: THREE.Vector3 }): DecalRec | null {
    const room = this.roomById(m.room);
    if (!room) return null;
    const kind = m.kind as MessKind;
    const mat = new THREE.MeshLambertMaterial({ map: splatTexture(kind, hashN(m.id)), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    this.matsOwned.push(mat);
    const mesh = new THREE.Mesh(this.planeGeo, mat);
    const size = Math.max(0.25, (m.r / 60) * 2.2);
    mesh.scale.set(size, size, 1);
    const normal = new THREE.Vector3();
    if (at) {
      normal.copy(at.n);
      mesh.position.copy(at.p).addScaledVector(normal, 0.012);
    } else if (m.wall && m.h !== undefined) {
      const w = room.walls.find((x) => x.side === m.wall)!;
      const fr = this.wallFrame(w.side);
      const loc = floorXYToLocal(m.x, m.y);
      const u = w.side === 'n' ? loc.x : w.side === 's' ? ROOM_W - loc.x : w.side === 'e' ? loc.z : ROOM_D - loc.z;
      mesh.position.copy(room.group.localToWorld(fr.p(u, m.h, -0.012)));
      normal.copy(w.normal);
    } else if (m.y < FLOOR_Y0) {
      const w = room.walls[0];
      const fr = this.wallFrame('n');
      const h = WALL_H * (1 - m.y / FLOOR_Y0);
      mesh.position.copy(room.group.localToWorld(fr.p(m.x / 60, h, -0.012)));
      normal.copy(w.normal);
    } else if (m.h) {
      const loc = floorXYToLocal(m.x, m.y);
      mesh.position.copy(room.group.localToWorld(new THREE.Vector3(loc.x, m.h + 0.012, loc.z)));
      normal.set(0, 1, 0);
    } else {
      const loc = floorXYToLocal(m.x, m.y);
      mesh.position.copy(room.group.localToWorld(new THREE.Vector3(loc.x, 0.012 + (this.decals.length % 7) * 0.0006, loc.z)));
      normal.set(0, 1, 0);
    }
    mesh.lookAt(V.copy(mesh.position).add(normal));
    mesh.rotateZ(m.rot ?? (hashN(m.id) % 628) / 100);
    mesh.renderOrder = 2;
    this.scene.add(mesh);
    const d: DecalRec = { m, mesh, mat, dirt: 1, room, normal, vacuum: kind === 'crumbs' || kind === 'confetti' || kind === 'balloon-pop' };
    mesh.userData = { type: 'decal', decal: d };
    this.pickables.push(mesh);
    this.decals.push(d);
    if (fresh) {
      this.mess.push(m);
      this.changed = true;
    }
    return d;
  }
  /** sujeira nova num ponto do mundo (comida acertou algo) */
  splatAt(kind: MessKind, p: THREE.Vector3, n: THREE.Vector3, r = 26): DecalRec | null {
    const room = this.roomAt(p.x, p.z) ?? this.nearestRoom(p);
    const local = room.group.worldToLocal(p.clone());
    const m: MessItem3D = { id: newMessId(), kind, room: room.id, x: 0, y: 0, r, rot: Math.round(Math.random() * 628) / 100 };
    const ny = n.y;
    if (ny > 0.6) {
      const xy = localToFloorXY(local.x, local.z);
      m.x = xy.x;
      m.y = xy.y;
      if (p.y > 0.08) m.h = Math.round(p.y * 100) / 100;
    } else {
      // parede mais próxima no referencial do cômodo
      const nl = n.clone().applyAxisAngle(UP, -room.rotY);
      const side: Side = Math.abs(nl.z) > Math.abs(nl.x) ? (nl.z > 0 ? 'n' : 's') : nl.x > 0 ? 'w' : 'e';
      const nearWall = side === 'n' ? local.z < WALL_T + 0.08 : side === 's' ? local.z > ROOM_D - WALL_T - 0.08 : side === 'w' ? local.x < WALL_T + 0.08 : local.x > ROOM_W - WALL_T - 0.08;
      const xy = localToFloorXY(local.x, local.z);
      m.x = xy.x;
      m.y = side === 'n' && nearWall ? wallHToY(p.y) : xy.y;
      if (nearWall) {
        m.wall = side;
        m.h = Math.round(p.y * 100) / 100;
      } else m.h = Math.round(p.y * 100) / 100;
    }
    const d = this.addDecal(m, true, { p, n });
    if (d) this.onMessAdded?.(m);
    return d;
  }
  nearestRoom(p: THREE.Vector3): RoomRec {
    let best = this.rooms[0],
      bd = 1e9;
    for (const r of this.rooms) {
      const d = r.center.distanceToSquared(p);
      if (d < bd) (bd = d), (best = r);
    }
    return best;
  }
  /** remove a sujeira (limpou) */
  removeDecal(d: DecalRec, byMe: boolean): void {
    this.scene.remove(d.mesh);
    d.mat.dispose();
    this.pickables.splice(this.pickables.indexOf(d.mesh), 1);
    this.decals.splice(this.decals.indexOf(d), 1);
    const i = this.mess.indexOf(d.m);
    if (i >= 0) this.mess.splice(i, 1);
    this.changed = true;
    if (byMe) {
      this.cleaned++;
      this.onMessCleaned?.(d.m);
    }
  }
  decalById(id: string): DecalRec | undefined {
    return this.decals.find((d) => d.m.id === id);
  }

  /* ======================= quebrar / arrumar ======================= */
  setBroken(it: ItemRec, effects: boolean): void {
    it.state = 'broken';
    it.obj.visible = false;
    if (it.body) {
      it.body.collisionResponse = false;
      it.body.type = CANNON.Body.KINEMATIC;
      it.body.velocity.setZero();
      it.body.angularVelocity.setZero();
    }
    const g = new THREE.Group();
    const col = itemColor(it.data);
    const mats = [this.pieceMat(col), this.pieceMat(it.kind === 'plant' || it.kind === 'cactus' ? '#4fd67a' : '#fffaf0')];
    const n = 6;
    for (let i = 0; i < n; i++) {
      const s = 0.06 + ((i * 37) % 10) / 100;
      const m = new THREE.Mesh(this.boxGeo(), mats[i % 2]);
      m.scale.set(s, s * 0.6, s);
      const a = (i / n) * 6.28;
      m.position.set(Math.cos(a) * it.dims.w * 0.3, s * 0.3, Math.sin(a) * it.dims.d * 0.3);
      m.rotation.set(i, i * 2, 0);
      m.userData = { type: 'item', item: it };
      g.add(m);
      this.pickables.push(m);
    }
    g.position.copy(it.homeP);
    g.position.y = 0;
    this.scene.add(g);
    it.debris = g;
    if (effects) this.broken++;
    this.changed = true;
  }
  private _box?: THREE.BoxGeometry;
  boxGeo(): THREE.BoxGeometry {
    if (!this._box) {
      this._box = new THREE.BoxGeometry(1, 1, 1);
      this.geoOwned.push(this._box);
    }
    return this._box;
  }
  private pieceMats = new Map<string, THREE.Material>();
  pieceMat(col: string): THREE.Material {
    let m = this.pieceMats.get(col);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color: col });
      this.pieceMats.set(col, m);
      this.matsOwned.push(m);
    }
    return m;
  }
  /** começa a animação de arrumar (volta pro lugar com pulinho) */
  startFix(it: ItemRec): void {
    if (it.state === 'broken') {
      if (it.debris) {
        this.pickables = this.pickables.filter((o) => !it.debris!.children.includes(o));
        this.scene.remove(it.debris);
        it.debris = undefined;
      }
      it.obj.visible = true;
      it.obj.position.copy(it.homeP);
      it.obj.quaternion.copy(it.homeQ);
      it.obj.scale.setScalar(0.01);
      if (it.body) it.body.collisionResponse = true;
    }
    it.fixFrom = { p: it.obj.position.clone(), q: it.obj.quaternion.clone() };
    it.fix = 0.0001;
    if (it.body) {
      it.body.type = CANNON.Body.KINEMATIC;
      it.body.collisionResponse = false;
    }
    this.changed = true;
  }
  private updateFix(it: ItemRec, dt: number): void {
    it.fix = Math.min(1, it.fix + dt / 0.7);
    const t = it.fix;
    const e = 1 - Math.pow(1 - t, 3);
    const from = it.fixFrom!;
    it.obj.position.lerpVectors(from.p, it.homeP, e);
    it.obj.position.y += Math.sin(t * Math.PI) * 0.6;
    it.obj.quaternion.slerpQuaternions(from.q, it.homeQ, e);
    if (it.obj.scale.x < 1) it.obj.scale.setScalar(Math.min(1, 0.01 + (1 + Math.sin(t * 9) * 0.15 * (1 - t)) * e));
    // giro extra charmoso
    it.obj.rotateY(Math.sin(t * Math.PI) * 0.6);
    if (t >= 1) {
      it.fix = 0;
      it.obj.scale.setScalar(1);
      if (it.body) {
        it.body.type = it.info.light ? CANNON.Body.DYNAMIC : CANNON.Body.STATIC;
        it.body.collisionResponse = true;
      }
      this.homeItem(it);
      this.burst(it.homeP.x, it.homeP.y + it.dims.h * 0.6, it.homeP.z, 14, 'spark', '#ffe27a', 2.2);
    }
  }

  /* ======================= partículas ======================= */
  private initParticles(): void {
    const N = this.PMAX;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('pcol', new THREE.BufferAttribute(new Float32Array(N * 4), 4));
    g.setAttribute('psize', new THREE.BufferAttribute(new Float32Array(N), 1));
    g.setAttribute('ptile', new THREE.BufferAttribute(new Float32Array(N), 1));
    g.setDrawRange(0, 0);
    this.geoOwned.push(g);
    // atlas 2×2: espuma, brilho, fumaça, pedacinho
    const [cv, c] = canvas(128, 128);
    const tiles: ('foam' | 'spark' | 'glow')[] = ['foam', 'spark', 'glow'];
    tiles.forEach((k, i) => c.drawImage(blobTexture(k).image as HTMLCanvasElement, (i % 2) * 64, Math.floor(i / 2) * 64, 64, 64));
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(96, 96, 22, 0, 7);
    c.fill();
    const atlas = track(new THREE.CanvasTexture(cv));
    atlas.colorSpace = THREE.SRGBColorSpace;
    this.ptsMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: atlas }, scale: { value: 400 } },
      vertexShader: `attribute vec4 pcol; attribute float psize; attribute float ptile; uniform float scale; varying vec4 vC; varying float vT;
        void main(){ vC=pcol; vT=ptile; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=psize*scale/max(0.1,-mv.z); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec4 vC; varying float vT;
        void main(){ vec2 o=vec2(mod(vT,2.0), floor(vT/2.0)); vec2 uv=(vec2(gl_PointCoord.x,1.0-gl_PointCoord.y)+o)*0.5; uv.y=1.0-uv.y; vec4 t=texture2D(map,uv); gl_FragColor=vec4(t.rgb*vC.rgb, t.a*vC.a); if(gl_FragColor.a<0.02) discard; }`,
      transparent: true,
      depthWrite: false,
    });
    this.matsOwned.push(this.ptsMat);
    this.ptsGeo = g;
    this.ptsObj = new THREE.Points(g, this.ptsMat);
    this.ptsObj.frustumCulled = false;
    this.ptsObj.renderOrder = 5;
    this.scene.add(this.ptsObj);
  }
  /** tile: 0 espuma, 1 brilho, 2 fumaça, 3 pedacinho */
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, o: { tile?: number; color?: string; life?: number; size?: number; grow?: number; grav?: number }): void {
    if (this.pts.length >= this.PMAX) this.pts.shift();
    const c = TMPC.set(o.color ?? '#ffffff');
    this.pts.push({ x, y, z, vx, vy, vz, life: o.life ?? 0.8, max: o.life ?? 0.8, size: o.size ?? 0.08, grow: o.grow ?? 0, tile: o.tile ?? 0, r: c.r, g: c.g, b: c.b, grav: o.grav ?? 0 });
  }
  burst(x: number, y: number, z: number, n: number, kind: 'spark' | 'poof' | 'foam' | 'chunk', color = '#ffffff', speed = 1.5): void {
    const N = Math.max(2, Math.round(n * this.q.particles));
    for (let i = 0; i < N; i++) {
      const a = Math.random() * 6.283,
        e = Math.random() * 2 - 0.3;
      const s = speed * (0.4 + Math.random() * 0.8);
      const vx = Math.cos(a) * s,
        vz = Math.sin(a) * s,
        vy = e * s;
      if (kind === 'spark') this.emit(x, y, z, vx, vy + 1, vz, { tile: 1, color, life: 0.6 + Math.random() * 0.4, size: 0.07, grav: 2 });
      else if (kind === 'poof') this.emit(x, y, z, vx * 0.6, Math.abs(vy) * 0.5 + 0.3, vz * 0.6, { tile: 2, color, life: 0.7 + Math.random() * 0.3, size: 0.18, grow: 0.5 });
      else if (kind === 'foam') this.emit(x, y, z, vx * 0.3, Math.abs(vy) * 0.4, vz * 0.3, { tile: 0, color, life: 0.6 + Math.random() * 0.5, size: 0.05 + Math.random() * 0.05, grow: 0.05, grav: -0.2 });
      else this.emit(x, y, z, vx, vy + 1.5, vz, { tile: 3, color, life: 0.6, size: 0.035, grav: 9 });
    }
  }
  private updateParticles(dt: number): void {
    const P = this.pts;
    const pos = this.ptsGeo.getAttribute('position') as THREE.BufferAttribute;
    const col = this.ptsGeo.getAttribute('pcol') as THREE.BufferAttribute;
    const siz = this.ptsGeo.getAttribute('psize') as THREE.BufferAttribute;
    const til = this.ptsGeo.getAttribute('ptile') as THREE.BufferAttribute;
    let n = 0;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy -= p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.01) (p.y = 0.01), (p.vy *= -0.3), (p.vx *= 0.7), (p.vz *= 0.7);
      p.size += p.grow * dt;
      P[n++] = p;
    }
    P.length = n;
    for (let i = 0; i < n; i++) {
      const p = P[i];
      pos.setXYZ(i, p.x, p.y, p.z);
      col.setXYZW(i, p.r, p.g, p.b, Math.min(1, (p.life / p.max) * 2));
      siz.setX(i, p.size);
      til.setX(i, p.tile);
    }
    pos.needsUpdate = col.needsUpdate = siz.needsUpdate = til.needsUpdate = true;
    this.ptsGeo.setDrawRange(0, n);
    this.ptsMat.uniforms.scale.value = (this.renderer.domElement.height / 2 / Math.tan((this.camera.fov * Math.PI) / 360)) * 1;
  }

  /* ======================= laço ======================= */
  step(dt: number): void {
    this.elapsed += dt;
    this.world.step(1 / 60, dt, 3);
    let awake = 0;
    for (const it of this.items) {
      if (it.fix > 0) {
        this.updateFix(it, dt);
        continue;
      }
      const b = it.body;
      if (!b || b.type !== CANNON.Body.DYNAMIC || it.state === 'broken') continue;
      if (b.sleepState !== CANNON.Body.SLEEPING) {
        awake++;
        // nunca sai de casa
        if (b.position.y < -0.5 || b.position.x < HOUSE.minX || b.position.x > HOUSE.maxX || b.position.z < HOUSE.minZ || b.position.z > HOUSE.maxZ || b.position.y > WALL_H + 1) {
          this.homeItem(it);
          continue;
        }
        this.syncObjFromBody(it);
        if (it.state === 'home' && it.obj.position.distanceToSquared(it.homeP) > 0.04) it.state = 'moved';
      }
    }
    if (awake > this.q.maxBodies) {
      // adormece os mais lentos
      const list = this.items.filter((i) => i.body && i.body.type === CANNON.Body.DYNAMIC && i.body.sleepState !== CANNON.Body.SLEEPING && i.state !== 'held');
      list.sort((a, b) => a.body!.velocity.lengthSquared() - b.body!.velocity.lengthSquared());
      for (let i = 0; i < awake - this.q.maxBodies && i < list.length; i++) list[i].body!.sleep();
    }
    this.updateParticles(dt);
  }
  render(): void {
    if (this.lost) return;
    this.renderer.render(this.scene, this.camera);
  }

  /* ======================= pintura ======================= */
  /** pinta um círculo (uv da parede) — devolve true se cobriu algo novo */
  paintAt(w: WallRec, u: number, v: number, radius: number, color: string): boolean {
    const room = w.room;
    if (room.paint !== color) {
      // tinta nova: começa cobertura do zero (a parcial anterior vira a base visual desta sessão)
      room.paint = color;
      room.cover.fill(0);
      for (const ww of room.walls) this.redrawWall(ww);
    }
    const off = w.wi * PAINT_GW * PAINT_GH;
    const gx0 = u * PAINT_GW,
      gy0 = v * PAINT_GH;
    const rx = (radius / w.len) * PAINT_GW,
      ry = (radius / WALL_H) * PAINT_GH;
    let changed = false;
    const W = w.cv.width,
      H = w.cv.height;
    const cw = W / PAINT_GW,
      ch = H / PAINT_GH;
    let minx = 1e9,
      miny = 1e9,
      maxx = -1,
      maxy = -1;
    for (let gy = Math.max(0, Math.floor(gy0 - ry)); gy <= Math.min(PAINT_GH - 1, Math.ceil(gy0 + ry)); gy++)
      for (let gx = Math.max(0, Math.floor(gx0 - rx)); gx <= Math.min(PAINT_GW - 1, Math.ceil(gx0 + rx)); gx++) {
        const dx = (gx + 0.5 - gx0) / rx,
          dy = (gy + 0.5 - gy0) / ry;
        if (dx * dx + dy * dy > 1) continue;
        const k = off + gy * PAINT_GW + gx;
        if (room.cover[k]) continue;
        room.cover[k] = 1;
        changed = true;
        minx = Math.min(minx, gx);
        maxx = Math.max(maxx, gx);
        miny = Math.min(miny, gy);
        maxy = Math.max(maxy, gy);
      }
    // pincelada visual (círculo macio) + células cobertas
    const cx = w.cx;
    cx.save();
    cx.beginPath();
    cx.ellipse(u * W, (1 - v) * H, rx * cw, ry * ch, 0, 0, 7);
    cx.clip();
    paintFill(cx, color, Math.floor(u * W - rx * cw), Math.floor((1 - v) * H - ry * ch), Math.ceil(rx * cw * 2) + 1, Math.ceil(ry * ch * 2) + 1, W, H);
    cx.restore();
    if (changed) {
      cx.save();
      for (let gy = miny; gy <= maxy; gy++)
        for (let gx = minx; gx <= maxx; gx++)
          if (room.cover[off + gy * PAINT_GW + gx]) paintFill(cx, color, Math.floor(gx * cw), Math.floor((PAINT_GH - 1 - gy) * ch), Math.ceil(cw) + 1, Math.ceil(ch) + 1, W, H);
      cx.restore();
    }
    w.tex.needsUpdate = true;
    if (changed) this.changed = true;
    return changed;
  }
  paintProgress(room: RoomRec): number {
    if (!room.paint) return 0;
    let n = 0,
      tot = 0;
    for (let i = 0; i < room.cover.length; i++)
      if (room.valid[i]) {
        tot++;
        n += room.cover[i];
      }
    return tot ? n / tot : 0;
  }
  /** completa a pintura: a camada vira a tinta de base (igual ao 2D: { wall: spec }) */
  finishPaint(room: RoomRec): void {
    if (!room.paint) return;
    room.base = room.paint;
    room.paint = null;
    room.cover.fill(0);
    for (const w of room.walls) this.redrawWall(w);
    this.changed = true;
  }
  /** aplica paint[room] vindo de fora (festa: outro jogador pintando) */
  reloadPaint(r: RoomRec): void {
    const p = this.design.paint?.[r.id] as { wall: string; strokes?: string; w3?: string } | undefined;
    r.base = p?.wall || null;
    r.paint = decodeStrokes(p?.strokes, p?.w3, r.cover);
    for (const w of r.walls) this.redrawWall(w);
  }
  /** recria os móveis de um cômodo a partir de room.design.items (festa: alguém decorou) */
  rebuildRoomItems(r: RoomRec): void {
    for (const it of this.items.filter((i) => i.room === r)) this.removeItem(it);
    for (const d of r.design.items) this.addItem(r, d as RoomItem3D);
  }
  /** objeto paint do cômodo no formato do contrato */
  paintRecord(r: RoomRec): { wall: string; strokes?: string; w3?: string } | null {
    if (!r.paint && !r.base) return null;
    if (!r.paint) return { wall: r.base! };
    return { wall: r.base ?? '', strokes: encodeStrokes(r.paint, r.cover), w3: r.paint + '|' + bitsToB64(r.cover) };
  }

  /* ======================= saída: design + mess ======================= */
  snapshot(): { design: HomeDesign; mess: MessItem[] } {
    // pintura
    for (const r of this.rooms) {
      const rec = this.paintRecord(r);
      if (rec) {
        this.design.paint = this.design.paint ?? {};
        this.design.paint[r.id] = rec;
      }
    }
    // móveis fora do lugar → mess (dono; visita só mantém o que já estava)
    const out: MessItem3D[] = this.mess.filter((m) => !m.moved);
    for (const it of this.items) {
      if (it.state !== 'moved' && it.state !== 'broken') continue;
      if (!this.editable && !it.fromMess) continue;
      if (it.state === 'moved' && it.obj.position.distanceTo(it.homeP) < 0.2 && it.obj.quaternion.angleTo(it.homeQ) < 0.3) continue;
      const local = it.room.group.worldToLocal(it.obj.position.clone());
      const xy = placeToXY(it.kind, { x: local.x, y: local.y, z: local.z });
      const e = new THREE.Euler().setFromQuaternion(it.obj.quaternion, 'YXZ');
      const m: MessItem3D = {
        id: newMessId(),
        kind: 'mud',
        room: it.room.id,
        x: xy.x,
        y: xy.y,
        r: 1,
        moved: { itemId: String(it.room.design.items.indexOf(it.data)), ox: it.data.x, oy: it.data.y },
      };
      if (it.state === 'broken') m.broken = true;
      else {
        m.yaw = Math.round((e.y - it.room.rotY) * 100) / 100;
        const tilt = Math.round(e.z * 100) / 100;
        if (Math.abs(tilt) > 0.2) m.rot = tilt;
      }
      out.push(m);
    }
    return { design: JSON.parse(JSON.stringify(this.design)) as HomeDesign, mess: JSON.parse(JSON.stringify(out)) as MessItem[] };
  }

  /* ======================= limpeza ======================= */
  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.ctxLost);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && !this.geoOwned.includes(m.geometry) && m.geometry !== this.planeGeo) {
        /* geometrias de modelos são liberadas por disposeModels */
      }
    });
    for (const g of this.geoOwned) g.dispose();
    this.planeGeo.dispose();
    for (const m of this.matsOwned) m.dispose();
    for (const m of this.faceMats.values()) m.dispose();
    this.matSolid.dispose();
    this.matGlow.dispose();
    this.matShadow.dispose();
    this.matWallBody.dispose();
    for (const d of this.decals) d.mat.dispose();
    disposeModels();
    disposeTextures();
    for (const b of [...this.world.bodies]) this.world.removeBody(b);
    this.scene.clear();
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
  get time(): number {
    return this.elapsed;
  }
  /** cor da paleta por índice (atalho para UI) */
  pal(i: number): string {
    return palColor(i);
  }
}

const TMPC = new THREE.Color();
export function hashN(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function mergeBoxes(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // mescla simples (mesmos atributos)
  const nonIdx = list.map((g) => {
    const n = g.toNonIndexed();
    g.dispose();
    return n;
  });
  let count = 0;
  for (const g of nonIdx) count += g.getAttribute('position').count;
  const pos = new Float32Array(count * 3),
    nrm = new Float32Array(count * 3);
  let o = 0;
  for (const g of nonIdx) {
    pos.set(g.getAttribute('position').array as Float32Array, o * 3);
    nrm.set(g.getAttribute('normal').array as Float32Array, o * 3);
    o += g.getAttribute('position').count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return out;
}
export { V2 };
