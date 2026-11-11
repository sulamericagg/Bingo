/* ============================================================
 *  ANOMALIAS — MUNDO 3D do turno: renderer, câmera do jogador, luz
 *  (lanterna + ambiente noturno + neblina), NPCs, colisão, visibilidade
 *  (frustum + oclusão pelas caixas do mapa), monitor de câmeras em
 *  render target pequeno com chiado, e as fotos de referência do caderno.
 * ============================================================ */
import * as THREE from 'three';
import type { AnomalySlot, MapBuild, RoomDef, Vec3 } from '../maps/types';
import { settingsFor, type Tier } from '../../../core/quality';
import { NpcBloop } from './models';

export type Box = { min: Vec3; max: Vec3 };
export const EYE = 1.55;
export const PLAYER_R = 0.28;

export interface SlotInfo {
  slot: AnomalySlot;
  index: number;
  /** centro medido no início (antes de qualquer anomalia) */
  anchor0: THREE.Vector3;
  npc: NpcBloop | null;
}

export interface Npc {
  id: string;
  room: string;
  model: NpcBloop;
  home: THREE.Vector3;
  homeYaw: number;
  /** posição atual (segue o jogador na anomalia 'move' variante 1) */
  pos: THREE.Vector3;
  follow: boolean;
}

const _v = new THREE.Vector3();
const _box = new THREE.Box3();
const _dir = new THREE.Vector3();
const _frus = new THREE.Frustum();
const _m = new THREE.Matrix4();

/** segmento × caixa (slab). Devolve t∈[0,1] do primeiro contato ou -1. */
export function segBox(ax: number, ay: number, az: number, bx: number, by: number, bz: number, b: Box): number {
  let t0 = 0,
    t1 = 1;
  const d = [bx - ax, by - ay, bz - az];
  const o = [ax, ay, az];
  const mn = [b.min.x, b.min.y, b.min.z];
  const mx = [b.max.x, b.max.y, b.max.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < mn[i] || o[i] > mx[i]) return -1;
    } else {
      let ta = (mn[i] - o[i]) / d[i];
      let tb = (mx[i] - o[i]) / d[i];
      if (ta > tb) [ta, tb] = [tb, ta];
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return -1;
    }
  }
  return t0;
}
const inside = (p: THREE.Vector3, b: Box, m = 0) => p.x > b.min.x - m && p.x < b.max.x + m && p.y > b.min.y - m && p.y < b.max.y + m && p.z > b.min.z - m && p.z < b.max.z + m;

/** move um círculo (x,z) contra caixas (só as que cruzam a altura 0.1..1.7) */
export function slide(p: { x: number; z: number }, r: number, boxes: Box[]): void {
  for (let it = 0; it < 3; it++) {
    let moved = false;
    for (const b of boxes) {
      if (b.max.y < 0.15 || b.min.y > 1.7) continue;
      const cx = Math.max(b.min.x, Math.min(p.x, b.max.x));
      const cz = Math.max(b.min.z, Math.min(p.z, b.max.z));
      let dx = p.x - cx,
        dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 < 1e-10) {
        // centro dentro da caixa: sai pelo lado mais perto
        const l = p.x - b.min.x,
          rr = b.max.x - p.x,
          u = p.z - b.min.z,
          dd = b.max.z - p.z;
        const m = Math.min(l, rr, u, dd);
        if (m === l) p.x = b.min.x - r;
        else if (m === rr) p.x = b.max.x + r;
        else if (m === u) p.z = b.min.z - r;
        else p.z = b.max.z + r;
      } else {
        const d = Math.sqrt(d2);
        dx /= d;
        dz /= d;
        p.x = cx + dx * r;
        p.z = cz + dz * r;
      }
      moved = true;
    }
    if (!moved) break;
  }
}

const STATIC_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const STATIC_FS = `
precision mediump float;
uniform sampler2D map; uniform float time; uniform float noise; uniform float fade;
varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + time*7.0) * 43758.5453); }
void main(){
  vec2 uv = vUv;
  float roll = step(0.985, fract(uv.y * 0.6 - time * 0.35)) * 0.012;
  uv.x += roll;
  vec3 c = texture2D(map, uv).rgb;
  float l = dot(c, vec3(0.299,0.587,0.114));
  c = mix(c, vec3(l*0.8, l*1.08, l*0.86), 0.22);
  c *= 1.3;
  float n = h(floor(vUv * vec2(320.0, 180.0)));
  c = mix(c, vec3(n), noise);
  c *= 0.86 + 0.14 * sin(vUv.y * 540.0);
  vec2 q = vUv - 0.5;
  c *= 1.0 - dot(q, q) * 1.3;
  gl_FragColor = vec4(c * fade, 1.0);
}`;

export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly cam: THREE.PerspectiveCamera;
  readonly hemi: THREE.HemisphereLight;
  readonly flash: THREE.SpotLight;
  readonly npcs: Npc[] = [];
  readonly slots: SlotInfo[] = [];
  private tier: Tier;
  private resScale = 1;
  readonly baseFov = 72;
  private fogBase: { near: number; far: number };
  private hemiBase: number;
  // monitor
  private monRT: THREE.WebGLRenderTarget | null = null;
  private monScene: THREE.Scene | null = null;
  private monMat: THREE.ShaderMaterial | null = null;
  private monCam = new THREE.PerspectiveCamera(68, 16 / 9, 0.1, 40);
  private monT = 0;
  monNoise = 0.08;
  private orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  /** culling por sala: malhas que cabem numa sala só (o resto, ex. geometria assada, fica sempre) */
  private cull: { mesh: THREE.Object3D; room: number }[] = [];
  private walls: Box[] = [];
  private samples: THREE.Vector3[][] = [];
  roomVis: boolean[] = [];
  cullOn = true;
  /** câmera do monitor ligada (o turno desenha só o monitor) */
  monitorOn: { pos: Vec3; look: Vec3 } | null = null;

  constructor(
    readonly root: HTMLElement,
    readonly build: MapBuild,
    tier: Tier,
  ) {
    this.tier = tier;
    const s = settingsFor(tier);
    const r = new THREE.WebGLRenderer({ antialias: s.antialias && tier >= 2, powerPreference: 'high-performance', stencil: false });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, s.pr3d));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.domElement.className = 'ano-canvas';
    root.appendChild(r.domElement);
    this.renderer = r;
    const env = build.env ?? {};
    const fogC = new THREE.Color(env.fog ?? '#0a0f1f');
    this.scene.background = fogC;
    const far = (env.fogFar ?? 24) * (0.75 + 0.25 * s.viewDist);
    this.fogBase = { near: env.fogNear ?? 5, far };
    this.scene.fog = new THREE.Fog(fogC, this.fogBase.near, this.fogBase.far);
    this.cam = new THREE.PerspectiveCamera(this.baseFov, 1, 0.05, far + 4);
    this.cam.rotation.order = 'YXZ';
    this.scene.add(this.cam);
    this.hemiBase = env.ambient ?? 1.15;
    this.hemi = new THREE.HemisphereLight(env.sky ?? '#8796c8', env.ground ?? '#3a2f4a', this.hemiBase);
    this.scene.add(this.hemi);
    // lanterna do jogador (presa na câmera)
    this.flash = new THREE.SpotLight('#fff1d0', 6.5, 14, 0.72, 0.85, 1.0);
    this.flash.position.set(0.15, -0.12, 0.1);
    this.flash.target.position.set(0, -0.5, -6);
    this.cam.add(this.flash, this.flash.target);
    this.scene.add(build.root);
    this.scene.updateMatrixWorld(true);
    // NPCs
    for (const sp of build.npcSpots) {
      const m = new NpcBloop(sp.color ?? '#7ad0ff', sp.pose, sp.scale ?? 1, sp.hat ?? '');
      m.root.position.set(sp.pos.x, sp.pos.y, sp.pos.z);
      m.root.rotation.y = sp.yaw;
      m.baseYaw = sp.yaw;
      this.scene.add(m.root);
      this.npcs.push({ id: sp.id, room: sp.room, model: m, home: new THREE.Vector3(sp.pos.x, sp.pos.y, sp.pos.z), homeYaw: sp.yaw, pos: new THREE.Vector3(sp.pos.x, sp.pos.y, sp.pos.z), follow: false });
    }
    this.scene.updateMatrixWorld(true);
    // âncoras das anomalias (antes de qualquer mudança)
    build.slots.forEach((slot, index) => {
      const npc = slot.npc ? (this.npcs.find((n) => n.id === slot.npc)?.model ?? null) : null;
      const a = new THREE.Vector3();
      if (slot.anchor) a.set(slot.anchor.x, slot.anchor.y, slot.anchor.z);
      else if (npc) npc.head.getWorldPosition(a);
      else {
        _box.setFromObject(slot.object);
        if (_box.isEmpty()) slot.object.getWorldPosition(a);
        else _box.getCenter(a);
      }
      this.slots.push({ slot, index, anchor0: a, npc });
    });
    this.setupCull();
    this.resize();
  }

  /* ------------------------------ culling por sala ------------------------------ */
  private setupCull(): void {
    const rooms = this.build.rooms;
    const b = new THREE.Box3();
    const c = new THREE.Vector3();
    const sz = new THREE.Vector3();
    this.build.root.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return;
      b.setFromObject(o);
      if (b.isEmpty()) return;
      b.getCenter(c);
      b.getSize(sz);
      const ri = rooms.findIndex((r) => c.x >= r.min.x && c.x <= r.max.x && c.z >= r.min.z && c.z <= r.max.z);
      if (ri < 0) return;
      const r = rooms[ri];
      // cabe na sala (com folga de 0,5 m)?
      if (b.min.x < r.min.x - 0.5 || b.max.x > r.max.x + 0.5 || b.min.z < r.min.z - 0.5 || b.max.z > r.max.z + 0.5) return;
      this.cull.push({ mesh: o, room: ri });
    });
    // paredes altas (o que tapa a visão entre salas)
    this.walls = this.build.colliders.filter((w) => w.min.y < 0.5 && w.max.y >= 2 && Math.min(w.max.x - w.min.x, w.max.z - w.min.z) < 0.5);
    for (const r of rooms) {
      const pts: THREE.Vector3[] = [];
      const w = r.max.x - r.min.x,
        d = r.max.z - r.min.z;
      const nx = Math.max(2, Math.min(10, Math.ceil(w / 1.4))),
        nz = Math.max(2, Math.min(10, Math.ceil(d / 1.4)));
      for (let i = 0; i < nx; i++)
        for (let j = 0; j < nz; j++)
          for (const y of [0.4, 1.5]) pts.push(new THREE.Vector3(r.min.x + 0.3 + ((w - 0.6) * i) / (nx - 1), y, r.min.z + 0.3 + ((d - 0.6) * j) / (nz - 1)));
      this.samples.push(pts);
    }
    this.roomVis = rooms.map(() => true);
    this.monCam.layers.enable(1);
  }
  private wallBlocked(a: THREE.Vector3, p: THREE.Vector3): boolean {
    for (const w of this.walls) {
      const t = segBox(a.x, a.y, a.z, p.x, p.y, p.z, w);
      if (t >= 0 && t < 0.999) return true;
    }
    return false;
  }
  /** quais salas a câmera do jogador pode ver agora (frustum + linha de visão por amostras) */
  private updateCull(): void {
    const cam = this.cam;
    const rooms = this.build.rooms;
    _m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    _frus.setFromProjectionMatrix(_m);
    const cp = cam.position;
    for (let i = 0; i < rooms.length; i++) {
      const r = rooms[i];
      let vis = cp.x >= r.min.x - 0.3 && cp.x <= r.max.x + 0.3 && cp.z >= r.min.z - 0.3 && cp.z <= r.max.z + 0.3;
      if (!vis && this.cullOn) {
        _box.min.set(r.min.x, 0, r.min.z);
        _box.max.set(r.max.x, 3, r.max.z);
        if (_frus.intersectsBox(_box))
          for (const p of this.samples[i]) {
            if (!_frus.containsPoint(p)) continue;
            if (!this.wallBlocked(cp, p)) {
              vis = true;
              break;
            }
          }
      } else if (!this.cullOn) vis = true;
      this.roomVis[i] = vis;
    }
    for (const c of this.cull) c.mesh.layers.mask = this.roomVis[c.room] ? 1 : 2;
    for (const n of this.npcs) {
      const ri = rooms.findIndex((r) => n.pos.x >= r.min.x && n.pos.x <= r.max.x && n.pos.z >= r.min.z && n.pos.z <= r.max.z);
      const mask = ri < 0 || this.roomVis[ri] ? 1 : 2;
      if ((n as Npc & { _mask?: number })._mask === mask) continue;
      (n as Npc & { _mask?: number })._mask = mask;
      n.model.root.traverse((o) => (o.layers.mask = mask));
    }
  }

  get colliders(): Box[] {
    return this.build.colliders;
  }

  setTier(t: Tier): void {
    this.tier = t;
    this.applyPR();
  }
  setResScale(k: number): void {
    this.resScale = k;
    this.applyPR();
  }
  private applyPR(): void {
    const s = settingsFor(this.tier);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, s.pr3d) * this.resScale);
    this.resize();
  }
  resize(): void {
    const w = this.root.clientWidth || window.innerWidth;
    const h = this.root.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.cam.aspect = w / Math.max(1, h);
    this.cam.updateProjectionMatrix();
  }

  roomAt(x: number, z: number): RoomDef | null {
    for (const r of this.build.rooms) if (x >= r.min.x && x <= r.max.x && z >= r.min.z && z <= r.max.z) return r;
    return null;
  }

  /** ponto atual da anomalia (para foto / visibilidade) */
  anchorOf(si: SlotInfo, out: THREE.Vector3): THREE.Vector3 {
    if (si.npc) return si.npc.head.getWorldPosition(out);
    if (si.slot.anchor) return out.set(si.slot.anchor.x, si.slot.anchor.y, si.slot.anchor.z);
    const o = si.slot.object;
    if (o.visible && o.parent) {
      _box.setFromObject(o);
      if (!_box.isEmpty()) return _box.getCenter(out);
    }
    return out.copy(si.anchor0);
  }

  /** algo entre `from` e `to` (caixas do mapa)? Ignora caixas que contêm um dos pontos. */
  occluded(from: THREE.Vector3, to: THREE.Vector3): boolean {
    for (const b of this.colliders) {
      if (inside(to, b, 0.05) || inside(from, b, 0.02)) continue;
      const t = segBox(from.x, from.y, from.z, to.x, to.y, to.z, b);
      if (t >= 0 && t < 0.97) return true;
    }
    return false;
  }

  /** o ponto aparece na câmera (frustum + distância + sem parede)? */
  seenBy(cam: THREE.Camera, p: THREE.Vector3, maxDist: number, margin = 1.1): boolean {
    const d = cam.position.distanceTo(p);
    if (d > maxDist) return false;
    if (d > 1.2) {
      cam.getWorldDirection(_dir);
      _v.subVectors(p, cam.position);
      if (_v.dot(_dir) <= 0.05) return false; // atrás
      _m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      _v.copy(p).applyMatrix4(_m);
      if (Math.abs(_v.x) > margin || Math.abs(_v.y) > margin) return false;
    }
    return !this.occluded(cam.position, p);
  }

  /** posição na tela (NDC) do ponto; z>1 = atrás */
  ndc(p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(p).project(this.cam);
  }

  /* ------------------------------ render ------------------------------ */
  render(): void {
    if (this.monitorOn) return this.renderMonitor();
    this.updateCull();
    this.renderer.render(this.scene, this.cam);
  }

  /** luz "de câmera" (monitor/caderno): sem lanterna, ambiente forte, neblina longe */
  private camLight(on: boolean): void {
    this.flash.visible = !on;
    this.hemi.intensity = on ? this.hemiBase * 2.3 : this.hemiBase;
    const f = this.scene.fog as THREE.Fog;
    f.near = on ? 8 : this.fogBase.near;
    f.far = on ? 40 : this.fogBase.far;
  }
  setHemi(k: number): void {
    this.hemiBase = k;
    this.hemi.intensity = k;
  }

  private ensureMon(): void {
    if (this.monRT) return;
    const lo = this.tier <= 1;
    this.monRT = new THREE.WebGLRenderTarget(lo ? 256 : 384, lo ? 144 : 216, { depthBuffer: true });
    this.monRT.texture.colorSpace = THREE.SRGBColorSpace;
    this.monMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.monRT.texture }, time: { value: 0 }, noise: { value: 0.12 }, fade: { value: 1 } },
      vertexShader: STATIC_VS,
      fragmentShader: STATIC_FS,
      depthTest: false,
      depthWrite: false,
    });
    this.monScene = new THREE.Scene();
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.monMat);
    q.frustumCulled = false;
    this.monScene.add(q);
  }
  /** pede um quadro novo do monitor no próximo render (troca de câmera) */
  monDirty(): void {
    this.monT = 0;
  }
  monitorCam(): THREE.PerspectiveCamera {
    return this.monCam;
  }
  private renderMonitor(): void {
    this.ensureMon();
    const now = performance.now();
    const fps = this.tier <= 1 ? 6 : 10;
    const c = this.monitorOn!;
    if (now - this.monT > 1000 / fps) {
      this.monT = now;
      this.monCam.position.set(c.pos.x, c.pos.y, c.pos.z);
      this.monCam.lookAt(c.look.x, c.look.y, c.look.z);
      this.monCam.updateMatrixWorld();
      this.camLight(true);
      this.renderer.setRenderTarget(this.monRT);
      this.renderer.render(this.scene, this.monCam);
      this.renderer.setRenderTarget(null);
      this.camLight(false);
    }
    this.monMat!.uniforms.time.value = (now / 1000) % 100;
    this.monMat!.uniforms.noise.value = this.monNoise;
    this.renderer.render(this.monScene!, this.orthoCam);
  }

  /** fotos de referência do caderno: 1ª câmera de cada sala (dataURL JPEG) */
  snapshots(w = 320, h = 180): Map<string, string> {
    const out = new Map<string, string>();
    const rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    const cam = new THREE.PerspectiveCamera(68, w / h, 0.1, 40);
    cam.layers.enable(1);
    const px = new Uint8Array(w * h * 4);
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const x = cv.getContext('2d')!;
    const img = x.createImageData(w, h);
    this.camLight(true);
    for (const room of this.build.rooms) {
      const c = room.cams[0];
      if (!c) continue;
      cam.position.set(c.pos.x, c.pos.y, c.pos.z);
      cam.lookAt(c.look.x, c.look.y, c.look.z);
      cam.updateMatrixWorld();
      this.renderer.setRenderTarget(rt);
      this.renderer.render(this.scene, cam);
      this.renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
      // vira de cabeça para baixo (GL começa embaixo)
      for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
      x.putImageData(img, 0, 0);
      out.set(room.id, cv.toDataURL('image/jpeg', 0.82));
    }
    this.renderer.setRenderTarget(null);
    this.camLight(false);
    rt.dispose();
    return out;
  }

  /** miniatura do quadro atual (logo depois de render) */
  grab(w: number, h: number): string {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const x = cv.getContext('2d')!;
    const src = this.renderer.domElement;
    const sa = src.width / src.height;
    const da = w / h;
    let sw = src.width,
      sh = src.height;
    if (sa > da) sw = sh * da;
    else sh = sw / da;
    x.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, w, h);
    return cv.toDataURL('image/jpeg', 0.8);
  }

  dispose(): void {
    this.build.dispose();
    this.monRT?.dispose();
    this.monMat?.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
