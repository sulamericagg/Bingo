/* ============================================================
 *  GARIMPO BRUTO — cena: céu, luz, névoa, lago, árvores (instanciadas), prédios,
 *  colisões estáticas (grade espacial de círculos) e ajustes por qualidade.
 * ============================================================ */
import * as THREE from 'three';
import type { Tier } from '../../core/quality';
import { Flames, makeClods, makeDrops, Particles, Rain } from './fx';
import { generate, type MapInfo } from './gen';
import { buildFlag, buildGarage, buildHouse, buildPlant, buildStock, C } from './models';
import { Vegetation } from './veg';
import { Kit, setLod } from './kit';
import { CELL, MAT_DIRT, N, SIZE, Terrain, V } from './terrain';

export interface Circle {
  x: number;
  z: number;
  r: number;
  /** árvore: índice em world.trees (para o fogo) */
  tree?: number;
  /** construção ainda não feita (start/camp.ts): sem colisão */
  off?: boolean;
}
export interface Blocker {
  x: number;
  z: number;
  r: number;
  y: number;
  off?: boolean;
}
/** construção do acampamento: objetos + colisões que aparecem/somem juntos (start/camp.ts) */
export interface Bld {
  objs: THREE.Object3D[];
  circles: Circle[];
  blockers: Blocker[];
  on: boolean;
}

const FAR = [95, 125, 165, 230];

export class World {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly T = new Terrain();
  map!: MapInfo;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly clods: Particles;
  readonly drops: Particles;
  readonly rain: Rain;
  readonly flames: Flames;
  private sky: THREE.Mesh;
  private skyU = { top: { value: new THREE.Color(0x4f9be0) }, bot: { value: new THREE.Color(0xf3d6a8) } };
  private water!: THREE.Mesh;
  private skirt: THREE.Mesh;
  veg: Vegetation | null = null;
  private grid = new Map<number, Circle[]>();
  /** volumes de prédios (a câmera não entra): centro, raio, altura do topo */
  blockers: Blocker[] = [];
  /** construções do acampamento por id (plant, stock, garage, houses, portal) */
  readonly bld = new Map<string, Bld>();
  /** registrando objetos/colisões numa construção (build) */
  private reg: Bld | null = null;
  plant!: ReturnType<typeof buildPlant>;
  /** portal da mina subterrânea e baia onde a esteira despeja */
  portal = { x: 0, z: 0, yaw: 0, obj: null as THREE.Object3D | null };
  bay = { x: 0, z: 0 };
  stock!: ReturnType<typeof buildStock>;
  private statics: THREE.Object3D[] = [];
  tier: Tier = 2;
  private matTier = -1;
  rainK = 0;
  /** rede (anfitrião): árvore queimando mudou */
  onBurn: ((n: number, b: number) => void) | null = null;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.3, 260);
    this.scene.fog = new THREE.Fog(0xcfd9c8, 60, 200);
    this.scene.background = new THREE.Color(0xcfd9c8);
    this.hemi = new THREE.HemisphereLight(0xdfefff, 0x8a6a4a, 2.0);
    this.sun = new THREE.DirectionalLight(0xfff0d0, 2.6);
    this.sun.position.set(60, 90, 30);
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -26;
    sc.right = sc.top = 26;
    sc.near = 10;
    sc.far = 220;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    // céu (gradiente)
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 10),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: this.skyU,
        vertexShader: 'varying float vY; void main(){ vY = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying float vY; void main(){ gl_FragColor = vec4(mix(bot, top, smoothstep(-0.05, 0.45, vY)), 1.0); }',
      }),
    );
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    // chão além da borda (mata fechada ao longe)
    // anel quadrado: só fora do mapa (a borda do terreno sobe acima dele)
    const outer = new THREE.Shape([new THREE.Vector2(-400, -400), new THREE.Vector2(400 + SIZE, -400), new THREE.Vector2(400 + SIZE, 400 + SIZE), new THREE.Vector2(-400, 400 + SIZE)]);
    outer.holes.push(new THREE.Path([new THREE.Vector2(2, 2), new THREE.Vector2(2, SIZE - 2), new THREE.Vector2(SIZE - 2, SIZE - 2), new THREE.Vector2(SIZE - 2, 2)]));
    const sg = new THREE.ShapeGeometry(outer);
    sg.rotateX(Math.PI / 2);
    this.skirt = new THREE.Mesh(sg, new THREE.MeshLambertMaterial({ color: 0x3d6b2a, side: THREE.DoubleSide }));
    this.skirt.position.set(0, 10, 0);
    this.scene.add(this.skirt);
    this.scene.add(this.T.group);
    this.clods = makeClods(260);
    this.drops = makeDrops(220);
    this.scene.add(this.clods.mesh, this.drops.mesh);
    this.rain = new Rain(1400);
    this.scene.add(this.rain.mesh);
    this.flames = new Flames(90);
    this.scene.add(this.flames.group);
  }

  /** gera o mapa da semente e monta a cena estática */
  build(seed: number, tier: Tier): void {
    this.map = generate(this.T, seed, 1);
    this.portalCut();
    this.T.setTier(tier);
    this.T.build(tier <= 1 ? 2 : 1);
    this.tier = tier;
    for (const o of this.statics) this.scene.remove(o);
    this.statics = [];
    this.grid.clear();
    this.blockers = [];
    this.bld.clear();
    const m = this.map;
    // lago
    const wg = new THREE.CircleGeometry(m.lake.r + 4, 40);
    wg.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(wg, new THREE.MeshLambertMaterial({ color: 0x3f8fb0, transparent: true, opacity: 0.82, emissive: 0x0c2a3a }));
    this.water.position.set(m.lake.x, m.lake.level, m.lake.z);
    this.addStatic(this.water);
    // prédios
    setLod(tier <= 1 ? 1 : 0);
    this.regIn('plant');
    const plant = buildPlant();
    plant.root.position.set(m.plant.x, this.T.heightAt(m.plant.x, m.plant.z), m.plant.z);
    plant.root.rotation.y = m.plant.rot;
    this.plant = plant;
    this.addStatic(plant.root);
    this.solidBox(plant.root, 0, -1.8, 3.4, 5.6);
    this.regIn('stock');
    const st = buildStock();
    st.root.position.set(m.stock.x, this.T.heightAt(m.stock.x, m.stock.z), m.stock.z);
    this.stock = st;
    this.addStatic(st.root);
    this.solidBox(st.root, 0, -1.5, 4.6, 2.2);
    this.blocker({ x: st.root.position.x, z: st.root.position.z, r: 5.5, y: st.root.position.y + 4.2 });
    this.regIn('plant');
    this.blocker({ x: m.plant.x, z: m.plant.z, r: 5, y: plant.root.position.y + 3.5 });
    this.regIn('garage');
    const gar = buildGarage();
    gar.position.set(m.garage.x, this.T.heightAt(m.garage.x, m.garage.z), m.garage.z);
    this.addStatic(gar);
    this.blocker({ x: gar.position.x, z: gar.position.z, r: 7.5, y: gar.position.y + 5 });
    this.solidBox(gar, 0, -4.3, 6, 0.4);
    this.solidBox(gar, -5.9, 0, 0.4, 4.5);
    this.regIn('houses');
    for (const h of m.houses) {
      const hm = buildHouse(h.color);
      hm.position.set(h.x, this.T.heightAt(h.x, h.z) + 0.4, h.z);
      hm.rotation.y = h.rot;
      this.addStatic(hm);
      this.addCircle({ x: h.x, z: h.z, r: 3.1 });
      this.blocker({ x: h.x, z: h.z, r: 3.6, y: hm.position.y + 4.5 });
    }
    this.regIn('portal');
    // portal da mina subterrânea encostado na encosta (lado da montanha) + baia da esteira
    {
      const { a, r: pr } = this.portalAt;
      const px = m.mine.x + Math.sin(a) * pr;
      const pz = m.mine.z + Math.cos(a) * pr;
      const py = this.T.heightAt(m.mine.x, m.mine.z);
      const pk = new Kit({ y: 0.5, k: 0.5 });
      for (const sx of [1.8, -1.8]) pk.rbox(0.45, 3.6, 0.45, 0.06, C.wood, sx, 1.8, 0);
      pk.rbox(4.4, 0.5, 0.5, 0.06, C.wood, 0, 3.7, 0);
      pk.box(3.2, 3.4, 0.2, 0x0b0705, 0, 1.7, -0.25);
      pk.rbox(4.6, 0.6, 1.6, 0.1, 0x6e5a48, 0, 4.2, -0.6);
      pk.decal('warn', 0.7, 0.7, 0, 4.2, 0.22);
      pk.decal('logoDark', 2.0, 1.0, 0, 5.0, -0.3);
      for (let i = 0; i < 4; i++) pk.box(1.3, 0.1, 0.22, C.wood, 0, 0.05, 0.6 + i * 0.75);
      pk.use('shiny').box(0.08, 0.1, 3.2, C.steel, 0.42, 0.14, 1.7).box(0.08, 0.1, 3.2, C.steel, -0.42, 0.14, 1.7).use('paint');
      // esteira saindo do portal até a baia (o caminhão para embaixo)
      {
        // correia subindo da boca do portal até a cabeça sobre a baia (o minério cai na caçamba)
        const A = new THREE.Vector3(1.5, 0.55, 0.7);
        const B = new THREE.Vector3(6.1, 3.25, 5.6);
        const d = B.clone().sub(A);
        const hl = Math.hypot(d.x, d.z);
        const L = d.length();
        const belt = new THREE.BoxGeometry(1.0, 0.16, L).rotateX(-Math.atan2(d.y, hl)).rotateY(Math.atan2(d.x, d.z));
        const mid = A.clone().add(B).multiplyScalar(0.5);
        pk.add(belt, C.black, mid.x, mid.y, mid.z);
        const rail = () => new THREE.BoxGeometry(0.08, 0.22, L).rotateX(-Math.atan2(d.y, hl)).rotateY(Math.atan2(d.x, d.z));
        for (const sd of [1, -1]) {
          const ox = (Math.cos(Math.atan2(d.x, d.z)) * 0.54) * sd;
          const oz = (-Math.sin(Math.atan2(d.x, d.z)) * 0.54) * sd;
          pk.add(rail(), C.yellowD, mid.x + ox, mid.y + 0.08, mid.z + oz);
        }
        for (const f of [0.3, 0.62, 0.92]) {
          const q = A.clone().lerp(B, f);
          pk.box(0.14, q.y, 0.14, C.yellowD, q.x, q.y / 2, q.z);
        }
      }
      pk.rbox(1.6, 0.8, 1.6, 0.06, C.yellowD, 6.1, 3.6, 5.6);
      const portal = pk.build();
      portal.position.set(px, py, pz);
      portal.rotation.y = a + Math.PI;
      this.addStatic(portal);
      this.portal = { x: px, z: pz, yaw: a + Math.PI, obj: portal };
      const bay = new THREE.Vector3(6.1, 0, 5.6);
      portal.localToWorld(bay);
      this.bay = { x: bay.x, z: bay.z };
    }
    // bandeira no pátio da mina
    const fl = buildFlag(C.yellow);
    fl.position.set(m.mine.x, this.T.heightAt(m.mine.x, m.mine.z), m.mine.z);
    this.addStatic(fl);
    this.reg = null;
    this.buildTrees();
    this.setTier(tier);
  }

  /** onde fica o portal: direção da montanha e distância do centro do pátio (a encosta) */
  private portalAt = { a: 0, r: 12.5 };
  /**
   * Portal da mina em toda semente: anda do pátio para a montanha até a encosta subir ~2,5 m e
   * encosta o portal ali; recorta um nicho plano na frente (soleira + trilhos), garante morro
   * atrás do batente (a entrada some na rocha) e aplaina a baia da esteira e a faixa de ré do
   * caminhão. Mexe em h e h0 juntos (é o terreno "gerado"; o save guarda só o que se cavou).
   */
  private portalCut(): void {
    const T = this.T;
    const m = this.map;
    const mt = m.mountain;
    const a = Math.atan2(mt.x - m.mine.x, mt.z - m.mine.z);
    const sa = Math.sin(a);
    const ca = Math.cos(a);
    const py = T.heightAt(m.mine.x, m.mine.z);
    let r = 12.5;
    for (let q = 12.5; q < 26; q += 0.25) {
      if (T.heightAt(m.mine.x + sa * q, m.mine.z + ca * q) > py + 2.5) {
        r = q - 0.4;
        break;
      }
      r = q;
    }
    r = Math.max(12.5, Math.min(24, r));
    this.portalAt = { a, r };
    const px = m.mine.x + sa * r;
    const pz = m.mine.z + ca * r;
    // eixos locais do portal (gira a+π): +z local = para o pátio, +x local = lado
    const fz = [-sa, -ca];
    const fx = [-ca, sa];
    const sst = (e0: number, e1: number, x: number) => {
      const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
      return t * t * (3 - 2 * t);
    };
    const R = 26;
    const i0 = Math.max(0, Math.floor((px - R) / CELL));
    const i1 = Math.min(N, Math.ceil((px + R) / CELL));
    const j0 = Math.max(0, Math.floor((pz - R) / CELL));
    const j1 = Math.min(N, Math.ceil((pz + R) / CELL));
    const bay = { x: 6.1, z: 5.6 };
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const dx = i * CELL - px;
        const dz = j * CELL - pz;
        const lx = dx * fx[0] + dz * fx[1];
        const lz = dx * fz[0] + dz * fz[1];
        const k = j * V + i;
        let h = T.h[k];
        // morro atrás do batente: no mínimo 3,8 m acima do pátio (a boca entra na rocha)
        const wb = (1 - sst(2.6, 4.6, Math.abs(lx))) * sst(-0.2, 0.6, -lz) * (1 - sst(5, 9, -lz));
        if (wb > 0) h = Math.max(h, h + (py + 3.8 - h) * wb);
        // nicho plano na frente do portal (soleira, trilhos, quem entra)
        const wn = (1 - sst(2.8, 4.2, Math.abs(lx))) * sst(-0.9, -0.1, lz) * (1 - sst(9, 12, lz));
        // baia e faixa de ré (12 m de frente da baia)
        const bx = lx - bay.x;
        const wbay = (1 - sst(4.4, 6.4, Math.abs(bx))) * sst(bay.z - 6.8, bay.z - 4.8, lz) * (1 - sst(bay.z + 13, bay.z + 16, lz));
        const w = Math.max(wn, wbay);
        if (w > 0) h += (py - h) * w;
        if (h !== T.h[k]) {
          T.h[k] = h;
          T.h0[k] = h;
          if (w > 0.5) T.mat[k] = MAT_DIRT;
        }
      }
    // nada de árvore no nicho, na baia ou em cima da boca
    m.trees = m.trees.filter((t) => {
      const dx = t.x - px;
      const dz = t.z - pz;
      const lx = dx * fx[0] + dz * fx[1];
      const lz = dx * fz[0] + dz * fz[1];
      if (Math.abs(lx) < 5.5 && lz > -6 && lz < 13) return false;
      if (Math.abs(lx - bay.x) < 6 && lz > bay.z - 6 && lz < bay.z + 16) return false;
      return true;
    });
  }

  private addStatic(o: THREE.Object3D): void {
    o.updateMatrixWorld(true);
    this.scene.add(o);
    this.statics.push(o);
    this.reg?.objs.push(o);
  }

  /* ---------------- construções do acampamento (start/camp.ts) ---------------- */
  /** passa a registrar o que for criado na construção `id` */
  private regIn(id: string): void {
    let b = this.bld.get(id);
    if (!b) this.bld.set(id, (b = { objs: [], circles: [], blockers: [], on: true }));
    this.reg = b;
  }
  private blocker(b: Blocker): void {
    this.blockers.push(b);
    this.reg?.blockers.push(b);
  }
  /** anexa algo criado depois (ex.: tambor da lavadora) a uma construção */
  attach(id: string, o: { obj?: THREE.Object3D; circle?: Circle; blocker?: Blocker }): void {
    this.regIn(id);
    const b = this.reg!;
    this.reg = null;
    if (o.obj) {
      b.objs.push(o.obj);
      o.obj.visible = b.on;
    }
    if (o.circle) {
      b.circles.push(o.circle);
      o.circle.off = !b.on;
    }
    if (o.blocker) {
      b.blockers.push(o.blocker);
      o.blocker.off = !b.on;
    }
  }
  /** mostra/esconde uma construção (com colisão e volume da câmera) */
  setBuilt(id: string, on: boolean): void {
    const b = this.bld.get(id);
    if (!b) return;
    b.on = on;
    for (const o of b.objs) o.visible = on;
    for (const c of b.circles) c.off = !on;
    for (const k of b.blockers) k.off = !on;
  }
  built(id: string): boolean {
    return this.bld.get(id)?.on ?? true;
  }

  /** caixa sólida (meia-largura hx, meia-prof hz) no referencial do objeto → círculos */
  private solidBox(o: THREE.Object3D, cx: number, cz: number, hx: number, hz: number): void {
    const r = Math.min(hx, hz);
    const v = new THREE.Vector3();
    const nx = Math.max(1, Math.round(hx / r));
    const nz = Math.max(1, Math.round(hz / r));
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++) {
        v.set(cx - hx + r + (i * (2 * hx - 2 * r)) / Math.max(1, nx - 1), 0, cz - hz + r + (j * (2 * hz - 2 * r)) / Math.max(1, nz - 1));
        o.localToWorld(v);
        this.addCircle({ x: v.x, z: v.z, r: r * 1.05 });
      }
  }

  addCircle(c: Circle): void {
    this.reg?.circles.push(c);
    const k = (Math.floor(c.x / 8) & 0xffff) | ((Math.floor(c.z / 8) & 0xffff) << 16);
    let a = this.grid.get(k);
    if (!a) this.grid.set(k, (a = []));
    a.push(c);
  }
  /** visita os círculos estáticos perto de (x,z) */
  near(x: number, z: number, fn: (c: Circle) => void): void {
    const gx = Math.floor(x / 8);
    const gz = Math.floor(z / 8);
    for (let a = gx - 1; a <= gx + 1; a++)
      for (let b = gz - 1; b <= gz + 1; b++) {
        const l = this.grid.get((a & 0xffff) | ((b & 0xffff) << 16));
        if (l) for (const c of l) if (!c.off) fn(c);
      }
  }

  private buildTrees(): void {
    this.veg?.dispose();
    this.veg = new Vegetation(this.scene, this.map, this.T, this.tier);
    this.map.trees.forEach((t, n) => {
      if (t.kind <= 2) this.addCircle({ x: t.x, z: t.z, r: 0.45 * t.s, tree: n });
      else if (t.kind === 4) this.addCircle({ x: t.x, z: t.z, r: 0.75 * t.s });
    });
  }
  /** pinta uma planta conforme a queima (0 = verde, 1 = carvão) */
  burnTree(n: number, b: number): void {
    this.veg?.burn(n, b);
    this.onBurn?.(n, b);
  }

  /** altura da água em (x,z) (ou -∞ fora do lago) */
  waterY = (x: number, z: number): number => {
    const l = this.map.lake;
    return Math.hypot(x - l.x, z - l.z) < l.r + 3 ? l.level : -1e9;
  };

  setTier(t: Tier): void {
    const changed = (t <= 1) !== (this.tier <= 1);
    this.tier = t;
    if (changed) this.T.build(t <= 1 ? 2 : 1);
    if ((t === 0) !== (this.matTier === 0)) this.T.setTier(t);
    this.matTier = t;
    const far = FAR[t];
    this.camera.far = far + 40;
    this.sky.scale.setScalar(far + 30);
    this.camera.updateProjectionMatrix();
    const f = this.scene.fog as THREE.Fog;
    f.near = far * 0.45;
    f.far = far;
    this.sun.castShadow = t >= 3;
    this.clods.budget = [0.35, 0.6, 0.85, 1][t];
    this.drops.budget = [0.5, 0.7, 0.9, 1][t];
    (this.rain.mesh.geometry as THREE.BufferGeometry).setDrawRange(0, [400, 700, 1000, 1400][t] * 2);
    this.veg?.setTier(t);
  }

  /** chuva 0..1: céu, luz e névoa */
  setRain(k: number): void {
    this.rainK = k;
    this.skyU.top.value.setRGB(0.31 - k * 0.12, 0.61 - k * 0.25, 0.88 - k * 0.3);
    this.skyU.bot.value.setRGB(0.95 - k * 0.3, 0.84 - k * 0.22, 0.66 - k * 0.08);
    const f = this.scene.fog as THREE.Fog;
    f.color.setRGB(0.74 - k * 0.22, 0.83 - k * 0.28, 0.9 - k * 0.3);
    this.sun.intensity = 2.6 - k * 1.5;
    this.hemi.intensity = 2.0 - k * 0.5;
    this.skyU.bot.value.copy(f.color);
    (this.scene.background as THREE.Color).copy(f.color);
    const far = FAR[this.tier];
    f.far = far * (1 - k * 0.3);
    f.near = far * (0.45 - k * 0.3);
  }

  /** abertura (start/cinematic.ts): cores do céu/névoa e luz do sol/céu direto */
  grade(o: { top: THREE.Color; bot: THREE.Color; sun: THREE.Color; sunI: number; hemiI: number; hemiSky?: THREE.Color }): void {
    this.skyU.top.value.copy(o.top);
    this.skyU.bot.value.copy(o.bot);
    const f = this.scene.fog as THREE.Fog;
    f.color.copy(o.bot);
    (this.scene.background as THREE.Color).copy(o.bot);
    this.sun.color.copy(o.sun);
    this.sun.intensity = o.sunI;
    this.hemi.intensity = o.hemiI;
    if (o.hemiSky) this.hemi.color.copy(o.hemiSky);
  }
  /** estado do céu/luz para restaurar depois da abertura */
  gradeSnap(): () => void {
    const top = this.skyU.top.value.clone();
    const bot = this.skyU.bot.value.clone();
    const f = this.scene.fog as THREE.Fog;
    const fc = f.color.clone();
    const fn = f.near;
    const ff = f.far;
    const bg = (this.scene.background as THREE.Color).clone();
    const sc = this.sun.color.clone();
    const si = this.sun.intensity;
    const hi = this.hemi.intensity;
    const hc = this.hemi.color.clone();
    return () => {
      this.skyU.top.value.copy(top);
      this.skyU.bot.value.copy(bot);
      f.color.copy(fc);
      f.near = fn;
      f.far = ff;
      (this.scene.background as THREE.Color).copy(bg);
      this.sun.color.copy(sc);
      this.sun.intensity = si;
      this.hemi.intensity = hi;
      this.hemi.color.copy(hc);
    };
  }

  /** sombra/céu seguem a câmera */
  follow(x: number, z: number): void {
    this.sky.position.set(x, 0, z);
    this.sun.position.set(x + 40, 90, z + 25);
    this.sun.target.position.set(x, 0, z);
  }

  dispose(): void {
    this.veg?.dispose();
    this.T.dispose();
    this.rain.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
  }
}
