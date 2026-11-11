/* ============================================================
 *  GARIMPO BRUTO — cena: céu, luz, névoa, lago, árvores (instanciadas), prédios,
 *  colisões estáticas (grade espacial de círculos) e ajustes por qualidade.
 * ============================================================ */
import * as THREE from 'three';
import type { Tier } from '../../core/quality';
import { Flames, makeClods, makeDrops, Particles, Rain } from './fx';
import { generate, type MapInfo } from './gen';
import { buildFlag, buildGarage, buildHouse, buildPlant, buildStock, C, treeGeometries } from './models';
import { SIZE, Terrain } from './terrain';

export interface Circle {
  x: number;
  z: number;
  r: number;
  /** árvore: índice em world.trees (para o fogo) */
  tree?: number;
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
  treeMeshes: THREE.InstancedMesh[] = [];
  /** por árvore: tipo, índice na malha, viva (0..1), queimada */
  treeRef: { kind: number; idx: number; burn: number }[] = [];
  private grid = new Map<number, Circle[]>();
  /** volumes de prédios (a câmera não entra): centro, raio, altura do topo */
  blockers: { x: number; z: number; r: number; y: number }[] = [];
  plant!: ReturnType<typeof buildPlant>;
  stock!: ReturnType<typeof buildStock>;
  private statics: THREE.Object3D[] = [];
  tier: Tier = 2;
  rainK = 0;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.3, 260);
    this.scene.fog = new THREE.Fog(0xcfd9c8, 60, 200);
    this.scene.background = new THREE.Color(0xcfd9c8);
    this.hemi = new THREE.HemisphereLight(0xdfefff, 0x8a6a4a, 2.7);
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
    this.T.build(tier <= 1 ? 2 : 1);
    this.tier = tier;
    for (const o of this.statics) this.scene.remove(o);
    this.statics = [];
    this.grid.clear();
    this.blockers = [];
    const m = this.map;
    // lago
    const wg = new THREE.CircleGeometry(m.lake.r + 4, 40);
    wg.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(wg, new THREE.MeshLambertMaterial({ color: 0x3f8fb0, transparent: true, opacity: 0.82, emissive: 0x0c2a3a }));
    this.water.position.set(m.lake.x, m.lake.level, m.lake.z);
    this.addStatic(this.water);
    // prédios
    const plant = buildPlant();
    plant.root.position.set(m.plant.x, this.T.heightAt(m.plant.x, m.plant.z), m.plant.z);
    plant.root.rotation.y = m.plant.rot;
    this.plant = plant;
    this.addStatic(plant.root);
    this.solidBox(plant.root, 0, -1.8, 3.4, 5.6);
    const st = buildStock();
    st.root.position.set(m.stock.x, this.T.heightAt(m.stock.x, m.stock.z), m.stock.z);
    this.stock = st;
    this.addStatic(st.root);
    this.solidBox(st.root, 0, -1.5, 4.6, 2.2);
    const gar = buildGarage();
    gar.position.set(m.garage.x, this.T.heightAt(m.garage.x, m.garage.z), m.garage.z);
    this.addStatic(gar);
    this.blockers.push({ x: gar.position.x, z: gar.position.z, r: 7.5, y: gar.position.y + 5 });
    this.blockers.push({ x: st.root.position.x, z: st.root.position.z, r: 5.5, y: st.root.position.y + 4.2 });
    this.blockers.push({ x: m.plant.x, z: m.plant.z, r: 5, y: plant.root.position.y + 3.5 });
    this.solidBox(gar, 0, -4.3, 6, 0.4);
    this.solidBox(gar, -5.9, 0, 0.4, 4.5);
    for (const h of m.houses) {
      const hm = buildHouse(h.color);
      hm.position.set(h.x, this.T.heightAt(h.x, h.z) + 0.4, h.z);
      hm.rotation.y = h.rot;
      this.addStatic(hm);
      this.addCircle({ x: h.x, z: h.z, r: 3.1 });
      this.blockers.push({ x: h.x, z: h.z, r: 3.6, y: hm.position.y + 4.5 });
    }
    // bandeira no pátio da mina
    const fl = buildFlag(C.yellow);
    fl.position.set(m.mine.x, this.T.heightAt(m.mine.x, m.mine.z), m.mine.z);
    this.addStatic(fl);
    this.buildTrees();
    this.setTier(tier);
  }

  private addStatic(o: THREE.Object3D): void {
    o.updateMatrixWorld(true);
    this.scene.add(o);
    this.statics.push(o);
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
        if (l) for (const c of l) fn(c);
      }
  }

  private buildTrees(): void {
    for (const m of this.treeMeshes) {
      this.scene.remove(m);
      m.dispose();
    }
    const geos = treeGeometries();
    const counts = [0, 0, 0, 0];
    for (const t of this.map.trees) counts[t.kind]++;
    this.treeMeshes = geos.map((g, i) => {
      const im = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), Math.max(1, counts[i]));
      im.castShadow = true;
      im.count = 0;
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, counts[i]) * 3).fill(1), 3);
      this.scene.add(im);
      return im;
    });
    this.treeRef = [];
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    this.map.trees.forEach((t, n) => {
      const im = this.treeMeshes[t.kind];
      const idx = im.count++;
      q.setFromAxisAngle(up, t.rot);
      m4.compose(p.set(t.x, this.T.heightAt(t.x, t.z) - 0.1, t.z), q, s.setScalar(t.s));
      im.setMatrixAt(idx, m4);
      this.treeRef.push({ kind: t.kind, idx, burn: 0 });
      if (t.kind !== 3) this.addCircle({ x: t.x, z: t.z, r: 0.45 * t.s, tree: n });
    });
    for (const im of this.treeMeshes) {
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
    }
  }
  /** pinta uma árvore conforme a queima (0 = verde, 1 = carvão) */
  burnTree(n: number, b: number): void {
    const r = this.treeRef[n];
    if (!r || Math.abs(r.burn - b) < 0.05) return;
    r.burn = b;
    const im = this.treeMeshes[r.kind];
    const k = 1 - b * 0.8;
    im.setColorAt(r.idx, _c.setRGB(k + b * 0.25, k, k * (1 - b * 0.3)));
    im.instanceColor!.needsUpdate = true;
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
    const tf = [0.45, 0.7, 1, 1][t];
    this.treeMeshes.forEach((im, i) => {
      const total = this.map.trees.filter((x) => x.kind === i).length;
      im.count = Math.max(0, Math.round(total * (i === 3 ? tf * tf : tf)));
      im.castShadow = t >= 3;
    });
  }

  /** chuva 0..1: céu, luz e névoa */
  setRain(k: number): void {
    this.rainK = k;
    this.skyU.top.value.setRGB(0.31 - k * 0.12, 0.61 - k * 0.25, 0.88 - k * 0.3);
    this.skyU.bot.value.setRGB(0.95 - k * 0.3, 0.84 - k * 0.22, 0.66 - k * 0.08);
    const f = this.scene.fog as THREE.Fog;
    f.color.setRGB(0.74 - k * 0.22, 0.83 - k * 0.28, 0.9 - k * 0.3);
    this.sun.intensity = 2.6 - k * 1.5;
    this.hemi.intensity = 2.7 - k * 0.6;
    this.skyU.bot.value.copy(f.color);
    (this.scene.background as THREE.Color).copy(f.color);
    const far = FAR[this.tier];
    f.far = far * (1 - k * 0.3);
    f.near = far * (0.45 - k * 0.3);
  }

  /** sombra/céu seguem a câmera */
  follow(x: number, z: number): void {
    this.sky.position.set(x, 0, z);
    this.sun.position.set(x + 40, 90, z + 25);
    this.sun.target.position.set(x, 0, z);
  }

  dispose(): void {
    this.T.dispose();
    this.rain.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
  }
}
const _c = new THREE.Color();
