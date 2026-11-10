/* ============================================================
 *  DESENHA E VIRA! — DESAFIOS (palco 2,5D visto de lado).
 *  Desenha-se direto por cima do cenário; o BUM! transforma o traço em
 *  objeto no lugar exato. Física presa ao plano (z fixo, giro só em z).
 *  Pontinhos = pregos (o desenho fica preso na parede e gira em volta).
 * ============================================================ */
import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { tap } from '../../core/haptics';
import type { Particles } from '../../3d/common/particles';
import type { Q3 } from '../../3d/common/quality';
import { sfx } from '../../3d/common/sfx';
import { t } from '../../i18n';
import { notify, objective, setNotifyAlign } from '../../ui/notify';
import { bindButton, type BoundButton } from '../../ui/touch';
import { analyze } from './analyze';
import type { Mapping } from './build';
import { bumBurst, bumParticles, bumSound, cook, flash, landFx } from './cook';
import { Creation } from './creation';
import { DrawUI, MESH_N } from './drawui';
import { disposeObject, elasticOut, makeParticles, makeWorld, type Engine, type Stage } from './engine';
import { dvIcon } from './icons';
import type { Level } from './levels';
import { renderDrawing } from './paper';
import { strokeLen, type Drawing, type Stroke } from './strokes';

const WATER_RHO = 600;

/** frente das plataformas: terra em camadas com pedrinhas e grama recortada no topo (papel) */
function soilTex(w: number, h: number, top: number): THREE.CanvasTexture {
  const P = 40;
  const c = document.createElement('canvas');
  c.width = Math.max(16, Math.min(1024, Math.round(w * P)));
  c.height = Math.max(16, Math.min(1024, Math.round(h * P)));
  const x = c.getContext('2d')!;
  const kx = c.width / w;
  const ky = c.height / h;
  const g = x.createLinearGradient(0, 0, 0, c.height);
  g.addColorStop(0, '#d99a62');
  g.addColorStop(1, '#a8673c');
  x.fillStyle = g;
  x.fillRect(0, 0, c.width, c.height);
  // camadas onduladas
  let seed = Math.round(w * 13 + h * 7 + top * 3);
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 1; k < h * 1.4; k++) {
    x.strokeStyle = k % 2 ? 'rgba(120,60,20,.22)' : 'rgba(255,220,170,.18)';
    x.lineWidth = 3;
    x.beginPath();
    const y0 = (k / 1.4) * ky + 0.35 * ky;
    for (let i = 0; i <= 20; i++) x.lineTo((i / 20) * c.width, y0 + Math.sin(i * 0.9 + k) * 4);
    x.stroke();
  }
  for (let i = 0; i < w * h * 1.2; i++) {
    x.fillStyle = rnd() < 0.5 ? 'rgba(90,50,25,.35)' : 'rgba(255,235,200,.35)';
    x.beginPath();
    x.ellipse(rnd() * c.width, 0.4 * ky + rnd() * (c.height - 0.4 * ky), 3 + rnd() * 5, 2 + rnd() * 3, rnd() * 3, 0, 7);
    x.fill();
  }
  // grama com bordinha recortada
  x.fillStyle = '#5fbf55';
  x.beginPath();
  x.moveTo(0, 0);
  x.lineTo(c.width, 0);
  const gh = 0.32 * ky;
  for (let i = Math.ceil(w * 3); i >= 0; i--) {
    const px = (i / (w * 3)) * c.width;
    x.quadraticCurveTo(px + kx / 6, gh + 7, px, gh);
  }
  x.closePath();
  x.fill();
  x.fillStyle = '#7ad86a';
  x.fillRect(0, 0, c.width, gh * 0.55);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const DEPTH = 3;

interface Dyn {
  mesh: THREE.Object3D;
  body: CANNON.Body;
}

export interface ChallengeResult {
  stars: number;
  ink: number;
  time: number;
}

export class Challenge implements Stage {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 120);
  private world: CANNON.World;
  private mats: ReturnType<typeof makeWorld>['mats'];
  private particles: Particles;
  readonly draw: DrawUI;
  private hud: HTMLDivElement;
  private btns: BoundButton[] = [];
  creations: Creation[] = [];
  private growing: { c: Creation; t: number; pins: THREE.Vector3[] }[] = [];
  private ball: Dyn | null = null;
  private marbles: Dyn[] = [];
  private marbleMesh: THREE.InstancedMesh | null = null;
  private weights: Dyn[] = [];
  private dropped = 0;
  private dropT = 0;
  started = false;
  private inkUsed = 0;
  private clock = 0;
  private firstStroke = -1;
  private stable = 0;
  private bad = 0;
  done = false;
  private flag: THREE.Group | null = null;
  private zoneMesh: THREE.Mesh | null = null;
  private water: THREE.Mesh | null = null;
  private gas = 0;
  private weightT = -1;
  private anchors: CANNON.Body[] = [];
  onWin: (r: ChallengeResult) => void = () => {};
  onFail: () => void = () => {};
  onExit: () => void = () => {};
  onRestart: () => void = () => {};
  private box3 = new THREE.Box3();

  constructor(
    private eng: Engine,
    private layer: HTMLElement,
    readonly lv: Level,
    readonly index: number,
  ) {
    const W = makeWorld();
    this.world = W.world;
    this.mats = W.mats;
    this.scene.background = new THREE.Color('#bfe9ff');
    const hemi = new THREE.HemisphereLight('#ffffff', '#b9a6d8', eng.q.standard ? 1.15 : 1.7);
    const sun = new THREE.DirectionalLight('#fff3e0', eng.q.standard ? 1.8 : 1.2);
    sun.position.set(-4, 12, 10);
    sun.target.position.set(8, 3, 0);
    sun.castShadow = eng.q.shadows;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera;
    sc.left = -12;
    sc.right = 12;
    sc.top = 10;
    sc.bottom = -6;
    sc.far = 40;
    sun.shadow.bias = -0.0006;
    this.scene.add(hemi, sun, sun.target);
    const env = eng.env();
    if (env) {
      this.scene.environment = env;
      this.scene.environmentIntensity = 0.35;
    }
    this.particles = makeParticles(this.scene, eng.q);
    this.particles.floorY = -50;
    this.buildStage();
    // papel transparente por cima de tudo
    const r = layer.getBoundingClientRect();
    const k = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    this.draw = new DrawUI(layer, { mode: 'overlay', w: Math.round(r.width), h: Math.round(r.height), k, tier: eng.q.tier, inkMax: Infinity, allowed: lv.allowed, vehicleOnly: lv.kind === 'car' });
    this.draw.onBum = () => this.bum();
    this.draw.paper.onStart = () => {
      if (this.firstStroke < 0) this.firstStroke = this.clock;
    };
    this.hud = document.createElement('div');
    this.hud.className = 'dv-chud';
    this.hud.innerHTML = `
      <div class="dv-top">
        <button class="dv-btn dv-ic dv-c-back" aria-label="${t('dv.back', 'Voltar')}">${dvIcon('back', 24)}</button>
        <div class="dv-lvname"><b>${index + 1}</b><span>${lv.name()}</span></div>
        <div class="dv-grow"></div>
        <div class="dv-time">${dvIcon('clock', 16)}<span>0</span></div>
        <button class="dv-btn dv-ic dv-c-restart" aria-label="${t('dv.restart', 'Recomeçar')}">${dvIcon('restart', 22)}</button>
      </div>
      <div class="dv-pedals">
        <button class="dv-act dv-ped-l">${dvIcon('back', 34)}</button>
        <button class="dv-act dv-ped-r">${dvIcon('next', 34)}</button>
      </div>`;
    layer.appendChild(this.hud);
    const q = <T extends HTMLElement>(s: string) => this.hud.querySelector(s) as T;
    this.btns.push(bindButton(q('.dv-c-back'), { onPress: () => this.onExit() }), bindButton(q('.dv-c-restart'), { onPress: () => this.onRestart() }));
    this.btns.push(
      bindButton(q('.dv-ped-l'), { onPress: () => (this.gas = -1), onRelease: () => (this.gas = 0), haptic: 'light' }),
      bindButton(q('.dv-ped-r'), { onPress: () => (this.gas = 1), onRelease: () => (this.gas = 0), haptic: 'light' }),
    );
    objective(lv.goal(), { icon: 'target' });
    setNotifyAlign('center');
    this.setInk();
    if (lv.tip) setTimeout(() => !this.done && notify(lv.tip!(), { icon: 'pencil', ms: 4500 }), 700);
  }

  /* ----------------------------- cenário ----------------------------- */
  private M(color: string, o: { map?: THREE.Texture; rough?: number; transparent?: boolean; opacity?: number; emissive?: string } = {}): THREE.Material {
    const base = { color, map: o.map ?? null, transparent: !!o.transparent, opacity: o.opacity ?? 1, emissive: new THREE.Color(o.emissive ?? '#000000') };
    return this.eng.q.standard ? new THREE.MeshStandardMaterial({ ...base, roughness: o.rough ?? 0.85 }) : new THREE.MeshLambertMaterial(base);
  }

  private buildStage(): void {
    const lv = this.lv;
    const sh = this.eng.q.shadows;
    // fundo de papel recortado: céu, nuvens, morros em camadas
    const sky = document.createElement('canvas');
    sky.width = 512;
    sky.height = 256;
    const x = sky.getContext('2d')!;
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#7ccbff');
    g.addColorStop(1, '#fff1d6');
    x.fillStyle = g;
    x.fillRect(0, 0, 512, 256);
    // papel: textura sutil
    for (let i = 0; i < 1500; i++) {
      x.fillStyle = `rgba(255,255,255,${Math.random() * 0.06})`;
      x.fillRect(Math.random() * 512, Math.random() * 256, 2, 2);
    }
    const skyT = new THREE.CanvasTexture(sky);
    skyT.colorSpace = THREE.SRGBColorSpace;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(70, 36), new THREE.MeshBasicMaterial({ map: skyT }));
    back.position.set(8, 6, -12);
    this.scene.add(back);
    const hillCols = ['#b8e6a0', '#8fd48a', '#6cc07a'];
    hillCols.forEach((c, i) => {
      const s = new THREE.Shape();
      s.moveTo(-20, -2);
      for (let k = 0; k <= 40; k++) {
        const xx = -20 + k * 1.4;
        s.lineTo(xx, 1.5 + i * -0.6 + Math.sin(k * 0.55 + i * 1.7) * (1.4 - i * 0.3) + Math.sin(k * 0.21 + i) * 1.2);
      }
      s.lineTo(36, -2);
      const m = new THREE.Mesh(new THREE.ShapeGeometry(s), new THREE.MeshBasicMaterial({ color: c }));
      m.position.set(0, 0, -9 + i * 2);
      this.scene.add(m);
    });
    for (let i = 0; i < 6; i++) {
      const cl = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const b = new THREE.Mesh(new THREE.CircleGeometry(0.7 + k * 0.25, 20), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
        b.position.set(k * 0.8 - 0.8, k === 1 ? 0.35 : 0, 0);
        cl.add(b);
      }
      cl.position.set(-2 + i * 4.2, 8.5 + (i % 2) * 1.2, -10.5);
      cl.userData.drift = 0.15 + (i % 3) * 0.08;
      cl.name = 'cloud';
      this.scene.add(cl);
    }
    // caixas estáticas: papelão com faixa de grama/tinta em cima
    const top = this.M('#7ad86a', { rough: 0.9 });
    const side = this.M('#f4d9a8', { rough: 0.95 });
    const front = this.M('#f9e4bc', { rough: 0.95 });
    for (const [x0, y0, x1, y1] of lv.boxes) {
      const w = x1 - x0;
      const h = y1 - y0;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, DEPTH), [side, side, top, side, this.M('#ffffff', { map: soilTex(w, h, y1) }), side]);
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
      m.receiveShadow = sh;
      m.castShadow = sh;
      this.scene.add(m);
      // faixa de grama arredondada
      const lip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, 0.16, DEPTH + 0.06), top);
      lip.position.set((x0 + x1) / 2, y1 - 0.08, 0);
      this.scene.add(lip);
      const b = new CANNON.Body({ mass: 0, material: this.mats.ground });
      b.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, DEPTH)));
      b.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
      this.world.addBody(b);
    }
    for (const poly of lv.polys ?? []) {
      const s = new THREE.Shape(poly.map(([a, b]) => new THREE.Vector2(a, b)));
      const geo = new THREE.ExtrudeGeometry(s, { depth: DEPTH, bevelEnabled: false });
      geo.translate(0, 0, -DEPTH / 2);
      const m = new THREE.Mesh(geo, [front, top]);
      m.receiveShadow = m.castShadow = sh;
      this.scene.add(m);
      const n = poly.length;
      const pcx = poly.reduce((m, q) => m + q[0], 0) / n;
      const pcy = poly.reduce((m, q) => m + q[1], 0) / n;
      const verts = [...poly.map(([a, b]) => new CANNON.Vec3(a - pcx, b - pcy, -DEPTH)), ...poly.map(([a, b]) => new CANNON.Vec3(a - pcx, b - pcy, DEPTH))];
      let pp = poly;
      const area = pp.reduce((s2, p, i) => s2 + (pp[(i + n - 1) % n][0] + p[0]) * (pp[(i + n - 1) % n][1] - p[1]), 0);
      const ccw = area < 0;
      const idx = (i: number) => (ccw ? i : n - 1 - i);
      pp = poly;
      const faces: number[][] = [Array.from({ length: n }, (_, i) => n + idx(i)), Array.from({ length: n }, (_, i) => idx(n - 1 - i))];
      for (let i = 0; i < n; i++) {
        const a = idx(i);
        const b2 = idx((i + 1) % n);
        faces.push([a, b2, n + b2, n + a]);
      }
      const b = new CANNON.Body({ mass: 0, material: this.mats.ground });
      b.addShape(new CANNON.ConvexPolyhedron({ vertices: verts, faces }));
      b.position.set(pcx, pcy, 0);
      this.world.addBody(b);
    }
    // bola
    if (lv.ball) {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 128;
      const bx = c.getContext('2d')!;
      bx.fillStyle = '#ff5e8a';
      bx.fillRect(0, 0, 256, 128);
      bx.fillStyle = '#ffffff';
      for (let i = 0; i < 4; i++) {
        bx.save();
        bx.translate(32 + i * 64, 64);
        bx.beginPath();
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
          const rr = k % 2 ? 9 : 22;
          bx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        bx.fill();
        bx.restore();
      }
      const tx = new THREE.CanvasTexture(c);
      tx.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.SphereGeometry(lv.ball.r, 28, 18), this.M('#ffffff', { map: tx, rough: 0.3 }));
      m.castShadow = sh;
      const b = new CANNON.Body({ mass: 2, material: this.mats.def });
      b.addShape(new CANNON.Sphere(lv.ball.r));
      b.position.set(lv.ball.x, lv.ball.y, 0);
      b.linearFactor.set(1, 1, 0);
      b.angularFactor.set(0, 0, 1);
      b.linearDamping = 0.01;
      b.angularDamping = 0.02;
      b.allowSleep = false;
      this.world.addBody(b);
      this.scene.add(m);
      this.ball = { mesh: m, body: b };
    }
    // zona da bandeira
    if (lv.zone && lv.kind !== 'slide') {
      const [x0, y0, x1] = lv.zone;
      const f = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 10), this.M('#ffffff', { rough: 0.4 }));
      pole.position.y = 1.3;
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7, 8, 1), this.M('#ffd93d', { emissive: '#664400' }));
      (cloth.material as THREE.Material).side = THREE.DoubleSide;
      cloth.position.set(0.58, 2.2, 0);
      cloth.name = 'cloth';
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), this.M('#ff5e8a'));
      knob.position.y = 2.65;
      f.add(pole, cloth, knob);
      f.position.set((x0 + x1) / 2 + 0.3, y0, -0.9);
      f.traverse((o) => ((o as THREE.Mesh).castShadow = sh));
      this.scene.add(f);
      this.flag = f;
      const z = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.06, DEPTH * 0.9), new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.55 }));
      z.position.set((x0 + x1) / 2, y0 + 0.04, 0);
      this.scene.add(z);
      this.zoneMesh = z;
    }
    // cesta
    if (lv.basket) {
      const { x: bx, y: by, w, h } = lv.basket;
      const mat = this.M('#8a5cff', { rough: 0.6 });
      for (const [cx, cy, ww, hh] of [[bx, by + 0.1, w, 0.2], [bx - w / 2 + 0.1, by + h / 2, 0.2, h], [bx + w / 2 - 0.1, by + h / 2, 0.2, h]]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(ww, hh, DEPTH * 0.7), mat);
        m.position.set(cx, cy, 0);
        m.castShadow = m.receiveShadow = sh;
        this.scene.add(m);
        const b = new CANNON.Body({ mass: 0, material: this.mats.ground });
        b.addShape(new CANNON.Box(new CANNON.Vec3(ww / 2, hh / 2, DEPTH)));
        b.position.set(cx, cy, 0);
        this.world.addBody(b);
      }
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.25), this.M('#ffd93d', { emissive: '#aa7700' }));
      star.position.set(bx, by + h + 0.6, 0);
      star.name = 'spin';
      this.scene.add(star);
    }
    // água
    if (lv.water) {
      const { x0, x1, top: wt } = lv.water;
      const floorY = Math.min(...lv.boxes.filter((b) => b[0] <= x0 + 0.1 && b[2] >= x1 - 0.1).map((b) => b[3]), wt - 2);
      const w = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, wt - floorY, DEPTH * 0.98), this.M('#3fb6ff', { transparent: true, opacity: 0.55, rough: 0.1 }));
      w.position.set((x0 + x1) / 2, (wt + floorY) / 2, 0);
      w.renderOrder = 2;
      (w.material as THREE.Material).depthWrite = false;
      this.scene.add(w);
      this.water = w;
    }
    // torre: linha pontilhada
    if (lv.height) {
      const pts = [new THREE.Vector3(-1, lv.height, DEPTH / 2 + 0.02), new THREE.Vector3(17, lv.height, DEPTH / 2 + 0.02)];
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: '#ff3d7a', dashSize: 0.35, gapSize: 0.22, linewidth: 2 }));
      line.computeLineDistances();
      this.scene.add(line);
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), this.M('#ffd93d', { emissive: '#aa7700' }));
      star.position.set(15.6, lv.height + 0.4, 0);
      star.name = 'spin';
      this.scene.add(star);
    }
    // torneiras das bolinhas
    if (lv.marbles) {
      for (const [mx, my] of lv.marbles.at) {
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.2, 18, 1, true), this.M('#c0c4d6', { rough: 0.3 }));
        (pipe.material as THREE.Material).side = THREE.DoubleSide;
        pipe.position.set(mx, my + 0.3, 0);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.08, 8, 20), this.M('#8a5cff'));
        rim.rotation.x = Math.PI / 2;
        rim.position.set(mx, my - 0.3, 0);
        this.scene.add(pipe, rim);
      }
      const n = lv.marbles.n * lv.marbles.at.length;
      this.marbleMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(lv.marbles.r, 14, 10), this.M(lv.marbles.color, { rough: 0.15 }), n);
      this.marbleMesh.count = 0;
      this.marbleMesh.frustumCulled = false;
      this.marbleMesh.castShadow = sh;
      this.scene.add(this.marbleMesh);
    }
  }

  /* ----------------------------- câmera / mapeamento ----------------------------- */
  private fit(): void {
    const cam = this.camera;
    const W = this.eng.w;
    const H = this.eng.h;
    const a = W / H;
    const tan = Math.tan(((cam.fov / 2) * Math.PI) / 180);
    // o palco cabe na área livre entre as ferramentas (esquerda), o painel (direita) e a barra do topo
    const L = Math.min(W * 0.1, 70);
    const R = Math.min(W * 0.26, 205);
    const T = Math.min(H * 0.14, 54);
    const needH = 9.6;
    const needW = 17;
    const visH = Math.max(needH * (H / (H - T)), (needW * (W / (W - L - R))) / a);
    const D = visH / (2 * tan);
    const ppm = H / visH;
    cam.position.set(8 + (R - L) / 2 / ppm, 4.6 + T / 2 / ppm, D);
    cam.lookAt(cam.position.x, cam.position.y, 0);
    cam.aspect = a;
    cam.updateProjectionMatrix();
  }
  /** papel (lógico) → mundo no plano z = 0 */
  mapping(): Mapping {
    this.fit();
    const p = this.draw.paper;
    const r = p.art.getBoundingClientRect();
    const host = this.layer.getBoundingClientRect();
    const cam = this.camera;
    const tan = Math.tan(((cam.fov / 2) * Math.PI) / 180);
    const Hv = 2 * cam.position.z * tan;
    const wpp = Hv / host.height; // metros por px de tela
    const lpx = r.width / p.drawing.w; // px de tela por unidade lógica
    const s = wpp * lpx;
    const ox = cam.position.x - (host.width / 2 - (r.left - host.left)) * wpp;
    const oy = cam.position.y + (host.height / 2 - (r.top - host.top)) * wpp;
    return { s, ox, oy };
  }

  private setInk(): void {
    const m = this.mapping();
    const left = Math.max(0, this.lv.ink - this.inkUsed);
    this.draw.paper.inkMax = left / m.s;
    this.draw.paper.rerender();
  }

  /* ----------------------------- BUM! ----------------------------- */
  bum(): void {
    if (this.done) return;
    const paper = this.draw.paper;
    const d = paper.drawing;
    // pontinhos = pregos
    const pins: [number, number][] = [];
    const keep: Stroke[] = [];
    for (const s of d.strokes) {
      if (s.t === 'pen' && strokeLen(s) < 9 && s.p.length <= 12) {
        pins.push([s.p[0], s.p[1]]);
        if (s.m) pins.push([d.w - s.p[0], s.p[1]]);
      } else keep.push(s);
    }
    const map = this.mapping();
    const inkSpent = paper.ink * map.s;
    if (!keep.some((s) => s.t === 'pen')) {
      if (pins.length) notify(t('dv.pinOnly', 'Pregos seguram desenhos: desenhe algo antes!'), { icon: 'warning' });
      return;
    }
    const dd: Drawing = { w: d.w, h: d.h, strokes: keep };
    let art = paper.art;
    if (pins.length) {
      art = document.createElement('canvas');
      art.width = paper.art.width;
      art.height = paper.art.height;
      renderDrawing(art.getContext('2d', { willReadFrequently: true })!, dd, paper.k);
    }
    const an = analyze(dd, art, paper.k, MESH_N[this.eng.q.tier] ?? 56);
    if (!an) return;
    const mat = this.draw.manual || !(this.lv.allowed ?? []).length ? this.draw.mat : this.draw.mat;
    const r = cook(dd, mat, { tier: this.eng.q.tier, map, vehicle: this.lv.kind === 'car', forceWheels: this.lv.kind === 'car', flat: true, art, k: paper.k, an });
    if (!r) return;
    const built = r.built;
    const pos = built.center.clone();
    pos.z = 0;
    // não nasce dentro de chão/bola: sobe até ficar livre
    const half = built.size.clone().multiplyScalar(0.5);
    const hits = (p: THREE.Vector3) => {
      for (const [x0, y0, x1, y1] of this.lv.boxes) if (p.x + half.x > x0 && p.x - half.x < x1 && p.y + half.y * 0.8 > y0 && p.y - half.y * 0.8 < y1) return true;
      return false;
    };
    let lift = 0;
    while (hits(pos) && lift < 40) {
      pos.y += 0.1;
      lift++;
    }
    const recipe = { d: dd, mat: built.mat, vehicle: this.lv.kind === 'car', fly: false };
    const c = new Creation(recipe, built, { world: this.world, scene: this.scene, pos, plane2d: true, shadows: this.eng.q.shadows, matDef: this.mats.def, matBouncy: this.mats.bouncy, maxMass: 3000 });
    c.onLand = (v) => landFx(this.particles, c.mesh.position.clone(), v);
    c.grow = 0;
    this.creations.push(c);
    const pinW = pins.map(([px, py]) => new THREE.Vector3(map.ox + px * map.s, map.oy - py * map.s + (lift ? lift * 0.1 : 0), 0));
    this.growing.push({ c, t: 0, pins: pinW });
    this.inkUsed += inkSpent;
    paper.clear();
    this.setInk();
    // efeitos
    const [sx, sy] = this.screenOf(pos);
    bumBurst(this.layer, sx, sy, built.colors);
    flash(this.layer);
    bumSound();
    bumParticles(this.particles, pos, Math.max(1, Math.max(built.size.x, built.size.y) * 0.5), built.colors);
    this.eng.shake = 0.3;
    if (this.lv.kind === 'car') this.hud.classList.add('dv-drive');
  }

  private screenOf(p: THREE.Vector3): [number, number] {
    const v = p.clone().project(this.camera);
    const r = this.layer.getBoundingClientRect();
    return [(v.x * 0.5 + 0.5) * r.width, (-v.y * 0.5 + 0.5) * r.height];
  }

  private start(): void {
    if (this.started) return;
    this.started = true;
    if (this.ball && this.lv.ball?.vx) {
      // já rolando (sem derrapar e perder velocidade no começo)
      this.ball.body.velocity.set(this.lv.ball.vx, 0, 0);
      this.ball.body.angularVelocity.set(0, 0, -this.lv.ball.vx / this.lv.ball.r);
    }
  }

  private addPin(c: Creation, p: THREE.Vector3): void {
    const a = new CANNON.Body({ mass: 0 });
    a.position.set(p.x, p.y, 0);
    a.collisionResponse = false;
    this.world.addBody(a);
    this.anchors.push(a);
    const local = c.body.pointToLocalFrame(new CANNON.Vec3(p.x, p.y, 0));
    this.world.addConstraint(new CANNON.PointToPointConstraint(c.body, local, a, new CANNON.Vec3(), 1e6));
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 14), this.M('#c0c4d6', { rough: 0.25 }));
    head.rotation.x = Math.PI / 2;
    const half = c.built.size.z / 2;
    head.position.set(p.x, p.y, half + 0.06);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, half * 2 + 0.3, 8), this.M('#8f88a8'));
    stem.rotation.x = Math.PI / 2;
    stem.position.set(p.x, p.y, 0);
    this.scene.add(head, stem);
    sfx.click();
  }

  /* ----------------------------- quadro ----------------------------- */
  update(dt: number): void {
    this.fit();
    this.clock += dt;
    const lv = this.lv;
    // nuvens / bandeira / estrelas
    for (const o of this.scene.children) {
      if (o.name === 'cloud') {
        o.position.x += (o.userData.drift as number) * dt;
        if (o.position.x > 22) o.position.x = -6;
      } else if (o.name === 'spin') o.rotation.y += dt * 2;
    }
    if (this.flag) {
      const cl = this.flag.getObjectByName('cloth');
      if (cl) cl.rotation.y = Math.sin(this.clock * 3) * 0.25;
    }
    if (this.zoneMesh) (this.zoneMesh.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(this.clock * 4) * 0.2;
    if (this.water) this.water.position.y += Math.sin(this.clock * 2) * 0.0008;
    // BUM crescendo
    for (const gr of this.growing) {
      gr.t += dt;
      const k = Math.min(1, gr.t / 0.6);
      gr.c.grow = k;
      if (k >= 1) {
        gr.c.spawn(new THREE.Vector3(0, -0.4, 0));
        for (const p of gr.pins) {
          const b = gr.c.worldBox(this.box3);
          if (p.x > b.min.x - 0.1 && p.x < b.max.x + 0.1 && p.y > b.min.y - 0.1 && p.y < b.max.y + 0.1) this.addPin(gr.c, p);
        }
        this.start();
        if (lv.weights && this.weightT < 0) this.weightT = 1.3;
      }
    }
    this.growing = this.growing.filter((g) => g.c.grow < 1);
    if (this.started && !this.done) {
      // bolinhas
      if (lv.marbles && this.dropped < lv.marbles.n * lv.marbles.at.length) {
        this.dropT -= dt;
        if (this.dropT <= 0) {
          this.dropT = 0.22;
          lv.marbles.at.forEach(([mx, my]) => this.addMarble(mx + (Math.random() - 0.5) * 0.3, my - 0.4));
        }
      }
      // pesos
      if (this.weightT > 0) {
        this.weightT -= dt;
        if (this.weightT <= 0) this.dropWeights();
      }
      // carro
      if (lv.kind === 'car') for (const c of this.creations) if (c.isVehicle && c.spawned) c.drive(this.gas, 0);
      this.buoyancy(dt);
    }
    if (this.started) this.world.step(1 / 60, dt, 4);
    for (const c of this.creations) c.sync(c.spawned ? 1 : Math.max(0.02, elasticOut(c.grow)));
    const sync = (d: Dyn) => {
      d.mesh.position.set(d.body.position.x, d.body.position.y, d.body.position.z);
      d.mesh.quaternion.set(d.body.quaternion.x, d.body.quaternion.y, d.body.quaternion.z, d.body.quaternion.w);
    };
    if (this.ball) sync(this.ball);
    this.weights.forEach(sync);
    if (this.marbleMesh) {
      const m4 = new THREE.Matrix4();
      this.marbles.forEach((d, i) => {
        m4.makeTranslation(d.body.position.x, d.body.position.y, d.body.position.z);
        this.marbleMesh!.setMatrixAt(i, m4);
      });
      this.marbleMesh.count = this.marbles.length;
      this.marbleMesh.instanceMatrix.needsUpdate = true;
    }
    this.particles.update(dt, this.camera.fov, this.eng.h);
    const tEl = this.hud.querySelector('.dv-time span');
    if (tEl && !this.done) tEl.textContent = String(Math.floor(this.elapsed()));
    if (this.started && !this.done) this.check(dt);
  }

  private elapsed(): number {
    return this.firstStroke < 0 ? 0 : this.clock - this.firstStroke;
  }

  private addMarble(x: number, y: number): void {
    const lv = this.lv.marbles!;
    const b = new CANNON.Body({ mass: 0.12, material: this.mats.def });
    b.addShape(new CANNON.Sphere(lv.r));
    b.position.set(x, y, 0);
    b.linearFactor.set(1, 1, 0);
    b.angularFactor.set(0, 0, 1);
    b.linearDamping = 0.05;
    b.allowSleep = true;
    this.world.addBody(b);
    this.marbles.push({ mesh: new THREE.Object3D(), body: b });
    this.dropped++;
    if (this.dropped % 2 === 0) sfx.bubble();
  }

  private dropWeights(): void {
    for (const w of this.lv.weights ?? []) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const x = c.getContext('2d')!;
      x.fillStyle = '#9a6238';
      x.fillRect(0, 0, 64, 64);
      x.strokeStyle = '#6b4429';
      x.lineWidth = 6;
      x.strokeRect(3, 3, 58, 58);
      x.beginPath();
      x.moveTo(3, 3);
      x.lineTo(61, 61);
      x.moveTo(61, 3);
      x.lineTo(3, 61);
      x.stroke();
      const tx = new THREE.CanvasTexture(c);
      tx.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w.s, w.s, w.s), this.M('#ffffff', { map: tx }));
      m.castShadow = this.eng.q.shadows;
      const b = new CANNON.Body({ mass: w.m, material: this.mats.def });
      b.addShape(new CANNON.Box(new CANNON.Vec3(w.s / 2, w.s / 2, w.s / 2)));
      b.position.set(w.x, w.y, 0);
      b.linearFactor.set(1, 1, 0);
      b.angularFactor.set(0, 0, 1);
      this.world.addBody(b);
      this.scene.add(m);
      this.weights.push({ mesh: m, body: b });
    }
    sfx.whoosh();
  }

  /**
   * Empuxo distribuído: uma grade de pontos na caixa da criação (no referencial dela); cada ponto
   * debaixo d'água empurra para cima ONDE está — o lado mais afundado empurra mais, então barcos
   * largos se endireitam sozinhos (centro de empuxo de verdade, sem custo).
   */
  private buoyancy(dt: number): void {
    const w = this.lv.water;
    if (!w) return;
    const NX = 6;
    const NY = 3;
    const lp = new CANNON.Vec3();
    const rel = new CANNON.Vec3();
    const apply = (body: CANNON.Body, vol: number, bb: THREE.Box3, sc: number) => {
      if (body.position.x < w.x0 - 1 || body.position.x > w.x1 + 1) return;
      const sx = ((bb.max.x - bb.min.x) * sc) / NX;
      const sy = ((bb.max.y - bb.min.y) * sc) / NY;
      let fsum = 0;
      for (let a = 0; a < NX; a++)
        for (let c = 0; c < NY; c++) {
          lp.set(bb.min.x * sc + (a + 0.5) * sx, bb.min.y * sc + (c + 0.5) * sy, 0);
          body.quaternion.vmult(lp, rel);
          const wx = body.position.x + rel.x;
          if (wx < w.x0 || wx > w.x1) continue;
          const wy = body.position.y + rel.y;
          const f = Math.max(0, Math.min(1, (w.top - wy) / Math.max(0.05, sy) + 0.5));
          if (f <= 0) continue;
          body.applyForce(new CANNON.Vec3(0, (WATER_RHO * vol * f * 9.82) / (NX * NY), 0), new CANNON.Vec3(rel.x, rel.y, 0));
          fsum += f / (NX * NY);
        }
      if (fsum <= 0) return;
      body.velocity.scale(Math.max(0, 1 - 4 * fsum * dt), body.velocity);
      // um balão afundado sobe rápido, mas não vira foguete
      if (body.velocity.y > 2.2) body.velocity.y = 2.2;
      body.angularVelocity.scale(Math.max(0, 1 - 2 * fsum * dt), body.angularVelocity);
    };
    for (const c of this.creations) if (c.spawned) apply(c.body, c.built.volume * c.scale ** 3, c.built.geo.boundingBox!, c.scale);
    for (const d of this.weights) {
      const s = (d.body.shapes[0] as CANNON.Box).halfExtents.y;
      this.box3.min.set(-s, -s, -s);
      this.box3.max.set(s, s, s);
      apply(d.body, (2 * s) ** 3, this.box3, 1);
    }
  }

  private check(dt: number): void {
    const lv = this.lv;
    let win = false;
    let lose = false;
    const inZone = (p: CANNON.Vec3, z: [number, number, number, number]) => p.x > z[0] && p.x < z[2] && p.y > z[1] && p.y < z[3];
    if (lv.kind === 'bridge' || lv.kind === 'ramp' || lv.kind === 'slide') {
      const b = this.ball!.body;
      if (inZone(b.position, lv.zone!) && (lv.kind !== 'slide' || b.velocity.length() < 2.5)) this.stable += dt;
      else this.stable = 0;
      win = this.stable > (lv.kind === 'slide' ? 0.6 : 0.15);
      if (b.position.y < -2.5) lose = true;
      // parou longe do objetivo por muito tempo
      if (b.velocity.length() < 0.05 && !inZone(b.position, lv.zone!) && this.creations.every((c) => c.spawned)) this.bad += dt;
      else this.bad = 0;
      if (this.bad > 4) lose = true;
    } else if (lv.kind === 'car') {
      win = this.creations.some((c) => c.spawned && inZone(c.body.position, lv.zone!));
      if (this.creations.length && this.creations.every((c) => c.spawned && c.body.position.y < -2.5)) lose = true;
    } else if (lv.kind === 'cup') {
      const m = lv.marbles!;
      const total = m.n * m.at.length;
      const floor = 1;
      let caught = 0;
      let moving = false;
      for (const d of this.marbles) {
        const p = d.body.position;
        if (p.y > floor + m.r + 0.05 && p.y < 8 && p.x > -1 && p.x < 17) {
          caught++;
          if (d.body.velocity.length() > 0.6) moving = true;
        }
      }
      if (this.dropped >= total && !moving) this.stable += dt;
      else this.stable = 0;
      if (this.stable > 1.2) {
        if (caught >= m.need) win = true;
        else lose = true;
      }
      objective(t('dv.caught', 'Bolinhas: {a}/{b}', { a: caught, b: m.need }), { icon: 'target' });
    } else if (lv.kind === 'float') {
      const w = lv.water!;
      const ws = this.weights;
      const afloat = this.creations.some((c) => c.spawned && c.body.position.x > w.x0 && c.body.position.x < w.x1 && c.body.position.y > w.top - 1.5);
      const dry = ws.length > 0 && ws.every((d) => d.body.position.y > w.top - 0.05 && d.body.position.x > w.x0 - 0.5 && d.body.position.x < w.x1 + 0.5);
      if (afloat && dry) this.stable += dt;
      else this.stable = 0;
      win = this.stable > 3;
      if (ws.length && ws.some((d) => d.body.position.y < w.top - 1.2)) this.bad += dt;
      else this.bad = 0;
      if (this.bad > 1.2) lose = true;
      if (dry && afloat) objective(t('dv.hold', 'Segure… {n}', { n: Math.max(0, 3 - this.stable).toFixed(1) }), { icon: 'clock' });
    } else if (lv.kind === 'tower') {
      let top = -1e9;
      let still = true;
      for (const c of this.creations) {
        if (!c.spawned) {
          still = false;
          continue;
        }
        top = Math.max(top, c.worldBox(this.box3).max.y);
        if (c.body.velocity.length() > 0.25) still = false;
      }
      if (top >= lv.height! && still) this.stable += dt;
      else this.stable = 0;
      win = this.stable > 1.5;
    }
    if (win) this.finish();
    else if (lose) this.fail();
  }

  private finish(): void {
    this.done = true;
    const time = this.elapsed();
    let stars = 1;
    if (this.inkUsed <= this.lv.par) stars++;
    if (time <= this.lv.time) stars++;
    objective(null);
    this.hud.classList.remove('dv-drive');
    const at = this.ball ? new THREE.Vector3(this.ball.body.position.x, this.ball.body.position.y, 0) : new THREE.Vector3(8, 5, 0);
    for (let i = 0; i < 4; i++) setTimeout(() => this.particles.burst(at.x + (Math.random() - 0.5) * 3, at.y + Math.random() * 2, 0, 18, 'spark', ['#ffd93d', '#ff6fc8', '#22c3c9', '#8be04e'][i], 3), i * 140);
    sfx.clean();
    tap('heavy');
    this.onWin({ stars, ink: this.inkUsed, time });
  }
  private fail(): void {
    this.done = true;
    objective(null);
    sfx.bump();
    tap('medium');
    this.onFail();
  }

  quality(q: Q3): void {
    this.particles.budget = q.particles;
  }

  dispose(): void {
    objective(null);
    setNotifyAlign('left');
    for (const c of this.creations) c.remove();
    this.btns.forEach((b) => b.destroy());
    this.draw.destroy();
    this.hud.remove();
    this.particles.dispose();
    disposeObject(this.scene);
  }
}
