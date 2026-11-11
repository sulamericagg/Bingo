/* ============================================================
 *  GARIMPO BRUTO — mina subterrânea (fim de jogo, cara).
 *  Escolha: o terreno de superfície é um campo de alturas (não faz túnel), então a mina
 *  é um NÍVEL À PARTE: grade de células de rocha (3 m) vista em corte de cima, entrada
 *  pelo portal na encosta da montanha. Robusto e barato: paredes = 1 InstancedMesh,
 *  piso = 1 plano, refeito só quando uma célula abre.
 *  - Picareta abre células (veios de ouro mais ricos mais fundo).
 *  - Trilhos (grade, toque para pôr), vagonetas que levam a carga até a moega da entrada.
 *  - Gerador + cabos acendem lâmpadas; mineiros-robô só trabalham com luz.
 *  - Moega + esteira sobem o minério para a baia na superfície (caminhão parado embaixo).
 * ============================================================ */
import * as THREE from 'three';
import { natureTexture } from '../../3d/nature';
import { buildWorker, C, type WorkerParts } from './models';
import { Kit } from './kit';
import type { Ctl } from './machines';
import { rng } from './gen';

export const UG = 24;
export const CS = 3;
/** célula: 0 rocha, 1 aberta */
export interface UgSave {
  cells: string;
  rails: string;
  lamps: number[];
  gen: number;
  carts: number;
  bots: number;
}
export type Tool = 'none' | 'rail' | 'lamp' | 'gen';
export const UG_PRICE = { mine: 12000, rail: 40, lamp: 150, gen: 4000, cart: 1800, bot: 3000 };

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

interface Cart {
  mesh: THREE.Group;
  load: number;
  gold: number;
  path: number[];
  pi: number;
  st: 'load' | 'go' | 'back';
  t: number;
  x: number;
  z: number;
}
interface Bot {
  p: WorkerParts;
  cell: number;
  t: number;
}

export class Underground {
  readonly scene = new THREE.Scene();
  readonly cells = new Uint8Array(UG * UG);
  readonly rail = new Uint8Array(UG * UG);
  /** teor (g/m³) de cada célula */
  readonly grade = new Float32Array(UG * UG);
  /** golpes já dados em cada célula */
  private hits = new Uint8Array(UG * UG);
  lamps: number[] = [];
  gen = -1;
  carts: Cart[] = [];
  bots: Bot[] = [];
  readonly entrance = (UG >> 1) + 0 * UG;
  private walls: THREE.InstancedMesh;
  private floor: THREE.Mesh;
  private railMesh: THREE.InstancedMesh;
  private lampMesh: THREE.InstancedMesh;
  private genMesh: THREE.Group;
  private cables: THREE.LineSegments;
  private ghost: THREE.Mesh;
  private amb: THREE.HemisphereLight;
  private plight: THREE.PointLight;
  readonly worker: WorkerParts;
  readonly pos = new THREE.Vector3();
  yaw = 0;
  private walk = 0;
  private swing = -1;
  cargo = { vol: 0, gold: 0, cap: 0.2 };
  /** recebido pela moega (sobe para a baia da superfície) */
  onHopper: ((vol: number, gold: number) => void) | null = null;
  tool: Tool = 'none';
  ghostCell = -1;

  constructor(seed: number) {
    const r = rng(seed * 31 + 7);
    // veios: 3 faixas diagonais + bolsões, mais ricos ao fundo (z alto)
    const veins = [0, 1, 2].map(() => ({ a: r() * Math.PI, o: r() * UG, w: 1.2 + r() * 1.5, g: 60 + r() * 90 }));
    for (let j = 0; j < UG; j++)
      for (let i = 0; i < UG; i++) {
        let g = 4 + (j / UG) * 18;
        for (const v of veins) {
          const d = Math.abs(i * Math.cos(v.a) + j * Math.sin(v.a) - v.o);
          if (d < v.w) g += v.g * (1 - d / v.w) * (0.4 + (j / UG) * 0.9);
        }
        this.grade[j * UG + i] = g * (0.7 + r() * 0.6);
      }
    // entrada + corredor inicial
    for (let j = 0; j < 4; j++) this.cells[j * UG + (UG >> 1)] = 1;
    this.cells[1 * UG + (UG >> 1) - 1] = 1;
    this.cells[1 * UG + (UG >> 1) + 1] = 1;
    const stone = natureTexture('stone');
    const gravel = natureTexture('gravel');
    this.walls = new THREE.InstancedMesh(boxUV(CS, 2.2, CS), new THREE.MeshLambertMaterial({ map: stone }), UG * UG);
    this.walls.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(UG * UG * 3), 3);
    this.walls.frustumCulled = false;
    this.scene.add(this.walls);
    const fg = new THREE.PlaneGeometry(UG * CS, UG * CS).rotateX(-Math.PI / 2);
    const uv = fg.attributes.uv.array as Float32Array;
    for (let i = 0; i < uv.length; i++) uv[i] *= UG * 0.9;
    this.floor = new THREE.Mesh(fg, new THREE.MeshLambertMaterial({ map: gravel, color: 0xc0a890 }));
    this.floor.position.set((UG * CS) / 2 - CS / 2, 0, (UG * CS) / 2 - CS / 2);
    this.scene.add(this.floor);
    // trilho: dormentes + 2 barras (uma peça por célula; reto ao longo de z ou x pelo vizinho)
    const rk = new Kit();
    for (let i = 0; i < 4; i++) rk.box(1.3, 0.1, 0.22, C.wood, 0, 0.05, -1.1 + i * 0.75);
    rk.use('shiny').box(0.08, 0.1, CS, C.steel, 0.42, 0.14, 0).box(0.08, 0.1, CS, C.steel, -0.42, 0.14, 0);
    this.railMesh = new THREE.InstancedMesh(rk.geometry(), new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 60 }), UG * UG);
    this.railMesh.count = 0;
    this.railMesh.frustumCulled = false;
    this.scene.add(this.railMesh);
    const lk = new Kit();
    lk.box(0.12, 2.0, 0.12, C.wood, 0, 1.0, 0);
    lk.box(0.7, 0.1, 0.12, C.wood, 0.3, 1.95, 0);
    lk.use('glow').ball(0.18, C.light, 0.6, 1.75, 0);
    this.lampMesh = new THREE.InstancedMesh(lk.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true }), 64);
    this.lampMesh.count = 0;
    this.lampMesh.frustumCulled = false;
    this.scene.add(this.lampMesh);
    const gk = new Kit({ y: 0.3, k: 0.4 });
    gk.rbox(1.6, 1.0, 1.0, 0.08, C.yellow, 0, 0.6, 0);
    gk.rbox(1.62, 0.12, 1.02, 0.04, C.dark, 0, 1.12, 0);
    gk.cyl(0.25, 0.25, 0.5, C.dark, 0.5, 0.9, 0.55, 10, Math.PI / 2);
    gk.use('shiny').cyl(0.05, 0.05, 0.6, C.chrome, -0.6, 1.4, -0.3);
    gk.decal('warn', 0.4, 0.4, 0, 0.7, 0.51);
    gk.decal('logo', 0.9, 0.45, 0.81, 0.65, 0, Math.PI / 2);
    this.genMesh = gk.build();
    this.genMesh.visible = false;
    this.scene.add(this.genMesh);
    this.cables = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x111111 }));
    this.cables.frustumCulled = false;
    this.scene.add(this.cables);
    this.ghost = new THREE.Mesh(new THREE.BoxGeometry(CS * 0.96, 0.2, CS * 0.96), new THREE.MeshBasicMaterial({ color: 0x44ff66, transparent: true, opacity: 0.45, depthWrite: false }));
    this.ghost.visible = false;
    this.scene.add(this.ghost);
    // moega da entrada + esteira subindo
    const hk = new Kit({ y: 0.4, k: 0.5 });
    hk.rbox(2.4, 0.2, 2.4, 0.05, C.steelD, 0, 1.0, 0);
    for (const [x, z] of [[1.1, 1.1], [-1.1, 1.1], [1.1, -1.1], [-1.1, -1.1]]) hk.box(0.15, 1.0, 0.15, C.steelD, x, 0.5, z);
    hk.rbox(2.4, 0.9, 0.12, 0.03, C.yellowD, 0, 1.5, 1.15).rbox(2.4, 0.9, 0.12, 0.03, C.yellowD, 0, 1.5, -1.15).rbox(0.12, 0.9, 2.4, 0.03, C.yellowD, 1.15, 1.5, 0).rbox(0.12, 0.9, 2.4, 0.03, C.yellowD, -1.15, 1.5, 0);
    hk.decal('hazard', 2.3, 0.25, 0, 1.5, 1.22);
    hk.rbox(1.0, 0.15, 7, 0.04, C.black, 0, 3.4, -4.2, -0.5);
    for (let i = 0; i < 3; i++) hk.box(0.14, 2 + i * 1.2, 0.14, C.yellowD, 0, 1 + i * 0.6, -1.8 - i * 1.8);
    const hop = hk.build();
    hop.position.set(this.cx(this.entrance), 0, this.cz(this.entrance));
    this.scene.add(hop);
    // luz: escura sem gerador
    this.amb = new THREE.HemisphereLight(0xc8d0ff, 0x3a2a1a, 0.6);
    this.plight = new THREE.PointLight(0xffe2a8, 30, 14, 1.6);
    this.scene.add(this.amb, this.plight);
    this.scene.background = new THREE.Color(0x0d0907);
    this.scene.fog = new THREE.Fog(0x0d0907, 18, 46);
    this.worker = buildWorker(0x6a6a6a);
    this.worker.barrow.visible = true;
    this.scene.add(this.worker.root);
    this.rebuild();
  }

  cx(k: number): number {
    return (k % UG) * CS;
  }
  cz(k: number): number {
    return Math.floor(k / UG) * CS;
  }
  cellAt(x: number, z: number): number {
    const i = Math.round(x / CS);
    const j = Math.round(z / CS);
    if (i < 0 || j < 0 || i >= UG || j >= UG) return -1;
    return j * UG + i;
  }
  open(k: number): boolean {
    return k >= 0 && this.cells[k] === 1;
  }
  get powered(): boolean {
    return this.gen >= 0;
  }

  /** refaz paredes, trilhos, lâmpadas e cabos */
  rebuild(): void {
    let n = 0;
    for (let k = 0; k < UG * UG; k++) {
      if (this.cells[k]) continue;
      const i = k % UG;
      const j = (k / UG) | 0;
      void i;
      void j;
      _m.compose(_v.set(this.cx(k), 1.1, this.cz(k)), _q.identity(), _s.set(1, 1, 1));
      this.walls.setMatrixAt(n, _m);
      // veio rico: rocha com brilho dourado
      const g = this.grade[k];
      const f = Math.min(1, Math.max(0, (g - 25) / 90));
      _c.setRGB(0.62 + f * 0.6, 0.55 + f * 0.42, 0.5 - f * 0.18);
      this.walls.setColorAt(n, _c);
      n++;
    }
    this.walls.count = n;
    this.walls.instanceMatrix.needsUpdate = true;
    this.walls.instanceColor!.needsUpdate = true;
    let r = 0;
    for (let k = 0; k < UG * UG; k++) {
      if (!this.rail[k]) continue;
      const horiz = (this.rail[k - 1] || this.rail[k + 1]) && !(this.rail[k - UG] || this.rail[k + UG]);
      _q.setFromAxisAngle(_v.set(0, 1, 0), horiz ? Math.PI / 2 : 0);
      _m.compose(_v.set(this.cx(k), 0, this.cz(k)), _q, _s.set(1, 1, 1));
      this.railMesh.setMatrixAt(r++, _m);
    }
    this.railMesh.count = r;
    this.railMesh.instanceMatrix.needsUpdate = true;
    this.lamps.forEach((k, i) => {
      _m.makeTranslation(this.cx(k) - CS * 0.4, 0, this.cz(k) - CS * 0.4);
      this.lampMesh.setMatrixAt(i, _m);
    });
    this.lampMesh.count = this.lamps.length;
    this.lampMesh.instanceMatrix.needsUpdate = true;
    this.lampMesh.visible = true;
    (this.lampMesh.material as THREE.MeshBasicMaterial).color.setScalar(this.powered ? 1 : 0.25);
    this.genMesh.visible = this.gen >= 0;
    if (this.gen >= 0) this.genMesh.position.set(this.cx(this.gen), 0, this.cz(this.gen));
    // cabos: do gerador até cada lâmpada (pendurados no teto)
    const pts: number[] = [];
    if (this.gen >= 0)
      for (const k of this.lamps) pts.push(this.cx(this.gen), 1.3, this.cz(this.gen), this.cx(k) - CS * 0.4 + 0.3, 1.95, this.cz(k) - CS * 0.4);
    this.cables.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.amb.intensity = this.powered ? 2.0 + Math.min(1.2, this.lamps.length / 6) : 0.9;
  }

  /** caminho em trilho (BFS) da célula a até a entrada */
  railPath(a: number): number[] | null {
    const prev = new Int32Array(UG * UG).fill(-2);
    const q = [a];
    prev[a] = -1;
    while (q.length) {
      const k = q.shift()!;
      if (k === this.entrance || (Math.abs(k - this.entrance) === UG && this.rail[k])) {
        const out: number[] = [];
        for (let c = k; c !== -1; c = prev[c]) out.unshift(c);
        return out;
      }
      for (const d of [1, -1, UG, -UG]) {
        const n = k + d;
        if (n < 0 || n >= UG * UG || prev[n] !== -2) continue;
        if (Math.abs(d) === 1 && Math.floor(n / UG) !== Math.floor(k / UG)) continue;
        if (!this.rail[n] && n !== this.entrance) continue;
        prev[n] = k;
        q.push(n);
      }
    }
    return null;
  }

  /** ponta do trilho mais longe da entrada (onde a vagoneta carrega) */
  railEnd(): number {
    let best = -1;
    let bd = -1;
    for (let k = 0; k < UG * UG; k++) {
      if (!this.rail[k]) continue;
      const p = this.railPath(k);
      if (p && p.length > bd) {
        bd = p.length;
        best = k;
      }
    }
    return best;
  }

  /** coloca a ferramenta numa célula (true = colocou) */
  place(k: number): boolean {
    if (!this.open(k) || k === this.entrance) return false;
    if (this.tool === 'rail') {
      if (this.rail[k]) return false;
      this.rail[k] = 1;
    } else if (this.tool === 'lamp') {
      if (this.lamps.includes(k) || this.lamps.length >= 64) return false;
      this.lamps.push(k);
    } else if (this.tool === 'gen') {
      if (this.gen >= 0) return false;
      this.gen = k;
    } else return false;
    this.rebuild();
    return true;
  }
  canPlace(k: number): boolean {
    if (!this.open(k) || k === this.entrance) return false;
    if (this.tool === 'rail') return !this.rail[k];
    if (this.tool === 'lamp') return !this.lamps.includes(k);
    if (this.tool === 'gen') return this.gen < 0;
    return false;
  }
  showGhost(k: number): void {
    this.ghostCell = k;
    this.ghost.visible = k >= 0 && this.tool !== 'none';
    if (!this.ghost.visible) return;
    this.ghost.position.set(this.cx(k), 0.12, this.cz(k));
    (this.ghost.material as THREE.MeshBasicMaterial).color.setHex(this.canPlace(k) ? 0x44ff66 : 0xff4433);
  }

  addCart(): void {
    const k = new Kit({ y: 0.2, k: 0.6 });
    k.rbox(1.2, 0.7, 1.6, 0.08, C.steelD, 0, 0.75, 0);
    k.rbox(1.05, 0.08, 1.45, 0.03, C.dark, 0, 1.06, 0);
    for (const [x, z] of [[0.45, 0.55], [-0.45, 0.55], [0.45, -0.55], [-0.45, -0.55]]) k.cylX(0.18, 0.1, C.dark, x, 0.28, z, 10);
    k.decal('num2', 0.4, 0.4, 0, 0.75, 0.81);
    const g = k.build();
    const heap = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 6), new THREE.MeshLambertMaterial({ color: 0x7a5a3a }));
    heap.scale.set(0.9, 0.35, 1.2);
    heap.position.y = 1.05;
    heap.name = 'heap';
    heap.visible = false;
    g.add(heap);
    this.scene.add(g);
    this.carts.push({ mesh: g, load: 0, gold: 0, path: [], pi: 0, st: 'load', t: 0, x: this.cx(this.entrance), z: this.cz(this.entrance) });
  }
  addBot(): void {
    const p = buildWorker(0x3f7a3f);
    p.barrow.visible = false;
    p.shovel.visible = true;
    this.scene.add(p.root);
    this.bots.push({ p, cell: -1, t: Math.random() });
  }

  /** golpe de picareta na célula k: depois de 3 golpes ela abre e dá minério */
  hit(k: number): { vol: number; gold: number } | null {
    if (k < 0 || this.cells[k]) return null;
    const i = k % UG;
    if (i === 0 || i === UG - 1 || k >= UG * (UG - 1)) return null; // borda é rocha firme
    this.hits[k]++;
    if (this.hits[k] < 3) return { vol: 0, gold: 0 };
    this.cells[k] = 1;
    this.rebuild();
    const vol = 0.6;
    return { vol, gold: vol * this.grade[k] };
  }

  enterAt(): void {
    this.pos.set(this.cx(this.entrance), 0, this.cz(this.entrance) + CS);
    this.yaw = 0;
  }

  /** um quadro: jogador (ctl), vagonetas e robôs */
  step(dt: number, ctl: Ctl | null, camYaw: number, say: (s: string) => void): void {
    const w = this.worker;
    if (ctl && this.swing < 0) {
      const mag = Math.min(1, Math.hypot(ctl.mx, ctl.my));
      if (mag > 0.08) {
        const a = camYaw + Math.atan2(-ctl.mx, -ctl.my);
        let d = a - this.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        this.yaw += d * Math.min(1, dt * 10);
        const sp = mag * 3.2 * dt;
        const nx = this.pos.x + Math.sin(this.yaw) * sp;
        const nz = this.pos.z + Math.cos(this.yaw) * sp;
        // colide com rocha (raio 0.6)
        const ok = (x: number, z: number) => this.open(this.cellAt(x + 0.6, z)) && this.open(this.cellAt(x - 0.6, z)) && this.open(this.cellAt(x, z + 0.6)) && this.open(this.cellAt(x, z - 0.6));
        if (ok(nx, this.pos.z)) this.pos.x = nx;
        if (ok(this.pos.x, nz)) this.pos.z = nz;
        this.walk += sp * 3;
      }
    }
    w.root.position.copy(this.pos);
    w.root.rotation.y = this.yaw;
    const sw = Math.sin(this.walk) * 0.5;
    w.legL.rotation.x = sw;
    w.legR.rotation.x = -sw;
    // picareta
    if (ctl && ctl.act && this.swing < 0) this.swing = 0;
    if (this.swing >= 0) {
      this.swing += dt / 0.5;
      w.shovel.visible = true;
      w.shovel.rotation.x = -1.2 + Math.sin(this.swing * Math.PI) * 1.6;
      w.armR.rotation.x = -1.6 + Math.sin(this.swing * Math.PI) * 1.2;
      if (this.swing >= 0.5 && this.swing - dt / 0.5 < 0.5) {
        const k = this.cellAt(this.pos.x + Math.sin(this.yaw) * 1.9, this.pos.z + Math.cos(this.yaw) * 1.9);
        if (this.cargo.vol >= this.cargo.cap - 1e-3) say('full');
        else {
          const got = this.hit(k);
          if (got && got.vol > 0) {
            const v = Math.min(got.vol, this.cargo.cap - this.cargo.vol);
            this.cargo.vol += v;
            this.cargo.gold += (got.gold * v) / got.vol;
            say('ore');
          } else if (got) say('hit');
        }
      }
      if (this.swing >= 1) {
        this.swing = -1;
        w.shovel.visible = false;
      }
    }
    w.heap.visible = this.cargo.vol > 0.01;
    w.heap.scale.set(1, 0.4 + (this.cargo.vol / this.cargo.cap) * 0.8, 1);
    // despejar: moega da entrada ou vagoneta perto
    if (ctl && ctl.act2 && this.cargo.vol > 0) {
      const hx = this.cx(this.entrance);
      const hz = this.cz(this.entrance);
      if (Math.hypot(this.pos.x - hx, this.pos.z - hz) < 3.2) {
        this.onHopper?.(this.cargo.vol, this.cargo.gold);
        this.cargo.vol = this.cargo.gold = 0;
        say('dump');
      } else {
        const c = this.carts.find((c) => Math.hypot(c.x - this.pos.x, c.z - this.pos.z) < 2.6);
        if (c) {
          c.load += this.cargo.vol;
          c.gold += this.cargo.gold;
          this.cargo.vol = this.cargo.gold = 0;
          say('dump');
        }
      }
    }
    this.plight.position.set(this.pos.x, 2.6, this.pos.z);
    this.plight.intensity = this.powered ? 18 : 30;
    this.stepCarts(dt);
    this.stepBots(dt);
  }

  private stepCarts(dt: number): void {
    const end = this.carts.length ? this.railEnd() : -1;
    for (const c of this.carts) {
      const heap = c.mesh.getObjectByName('heap')!;
      heap.visible = c.load > 0.05;
      if (end < 0) {
        c.mesh.position.set(c.x, 0, c.z);
        continue;
      }
      if (c.st === 'load') {
        // parada na ponta do trilho até encher
        const px = this.cx(end);
        const pz = this.cz(end);
        c.x += (px - c.x) * Math.min(1, dt * 2);
        c.z += (pz - c.z) * Math.min(1, dt * 2);
        c.t += dt;
        if (c.load >= 1.6 || (c.t > 50 && c.load > 0.2)) {
          const p = this.railPath(end);
          if (p) {
            c.path = p;
            c.pi = 0;
            c.st = 'go';
          }
        }
      } else {
        const tgt = c.path[c.pi];
        const tx = this.cx(tgt);
        const tz = this.cz(tgt);
        const dx = tx - c.x;
        const dz = tz - c.z;
        const d = Math.hypot(dx, dz);
        const sp = 2.6 * dt;
        if (d <= sp) {
          c.x = tx;
          c.z = tz;
          if (c.st === 'go') {
            if (++c.pi >= c.path.length) {
              this.onHopper?.(c.load, c.gold);
              c.load = c.gold = 0;
              c.st = 'back';
              c.path.reverse();
              c.pi = 0;
            }
          } else if (++c.pi >= c.path.length) {
            c.st = 'load';
            c.t = 0;
          }
        } else {
          c.x += (dx / d) * sp;
          c.z += (dz / d) * sp;
          c.mesh.rotation.y = Math.atan2(dx, dz);
        }
      }
      c.mesh.position.set(c.x, 0, c.z);
    }
  }

  private stepBots(dt: number): void {
    const end = this.carts.length ? this.railEnd() : -1;
    this.bots.forEach((b, i) => {
      const p = b.p;
      // sem luz não trabalham: ficam na entrada
      const base = end >= 0 ? end : this.entrance;
      if (!this.powered) {
        p.root.position.set(this.cx(this.entrance) + 1.5 + i * 0.8, 0, this.cz(this.entrance) + 1.5);
        return;
      }
      // escolhe uma rocha encostada no espaço aberto perto da ponta do trilho
      if (b.cell < 0 || this.cells[b.cell]) {
        let best = -1;
        let bd = 1e9;
        for (let k = 0; k < UG * UG; k++) {
          if (this.cells[k]) continue;
          const kx = k % UG;
          if (kx === 0 || kx === UG - 1 || k >= UG * (UG - 1)) continue;
          const nb = [k - 1, k + 1, k - UG, k + UG].find((n) => n >= 0 && n < UG * UG && this.cells[n] && Math.abs((n % UG) - kx) <= 1);
          if (nb === undefined) continue;
          const d = Math.hypot(this.cx(k) - this.cx(base), this.cz(k) - this.cz(base)) + i * 2.5 * ((k * 7) % 3);
          if (d < bd) {
            bd = d;
            best = k;
          }
        }
        b.cell = best;
      }
      if (b.cell < 0) return;
      const nb = [b.cell - 1, b.cell + 1, b.cell - UG, b.cell + UG].find((n) => this.open(n)) ?? this.entrance;
      const sx = (this.cx(nb) + this.cx(b.cell)) / 2;
      const sz = (this.cz(nb) + this.cz(b.cell)) / 2;
      const root = p.root;
      const dx = sx - root.position.x;
      const dz = sz - root.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.3) {
        // anda (sem colisão: caminha pelos espaços abertos já ligados)
        root.position.x += (dx / d) * Math.min(d, 2.5 * dt);
        root.position.z += (dz / d) * Math.min(d, 2.5 * dt);
        root.rotation.y = Math.atan2(dx, dz);
        return;
      }
      root.rotation.y = Math.atan2(this.cx(b.cell) - root.position.x, this.cz(b.cell) - root.position.z);
      b.t += dt;
      p.shovel.rotation.x = -1.2 + Math.max(0, Math.sin(b.t * 5)) * 1.5;
      p.armR.rotation.x = -1.6 + Math.max(0, Math.sin(b.t * 5)) * 1.2;
      if (b.t > 4) {
        b.t = 0;
        const got = this.hit(b.cell);
        if (got && got.vol > 0) {
          // joga na vagoneta parada (ou direto na moega se não houver trilho)
          const cart = this.carts.find((c) => c.st === 'load');
          if (cart) {
            cart.load += got.vol;
            cart.gold += got.gold;
          } else if (end < 0) this.onHopper?.(got.vol * 0.5, got.gold * 0.5);
        }
      }
    });
  }

  save(): UgSave {
    return { cells: b64(this.cells), rails: b64(this.rail), lamps: [...this.lamps], gen: this.gen, carts: this.carts.length, bots: this.bots.length };
  }
  load(s: UgSave): void {
    unb64(s.cells, this.cells);
    unb64(s.rails, this.rail);
    this.lamps = [...(s.lamps || [])];
    this.gen = s.gen ?? -1;
    for (let i = 0; i < (s.carts || 0); i++) this.addCart();
    for (let i = 0; i < (s.bots || 0); i++) this.addBot();
    this.rebuild();
  }
  dispose(): void {
    this.scene.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }
}

function b64(a: Uint8Array): string {
  let s = '';
  for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
  return btoa(s);
}
function unb64(s: string, out: Uint8Array): void {
  try {
    const b = atob(s || '');
    for (let i = 0; i < b.length && i < out.length; i++) out[i] = b.charCodeAt(i);
  } catch {
    /* save velho */
  }
}
/** caixa com UV em metros (textura de pedra repete sem esticar) */
function boxUV(w: number, h: number, d: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv.array as Float32Array;
  for (let i = 0; i < uv.length; i += 2) {
    uv[i] *= w * 0.3;
    uv[i + 1] *= h * 0.3;
  }
  return g;
}
