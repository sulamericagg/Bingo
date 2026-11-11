/* ============================================================
 *  MUNDO ABERTO — streaming de pedaços em volta do jogador:
 *  carrega (no máx. N por quadro, do mais perto ao mais longe),
 *  descarrega os distantes (guardando escavações/árvores no save),
 *  troca o nível de detalhe do chão e refaz as instâncias de árvores
 *  (perto: modelo completo; longe: modelo leve) com cota por qualidade.
 * ============================================================ */
import * as THREE from 'three';
import { CH, RES, VN, WATER_Y, WorldGen, type Camp } from './gen';
import { Chunk, TREE_STRIDE, TState } from './chunk';
import { WBIOMES, WSPECIES, NB } from './biomes';
import type { WorldSave } from './wsave';
import { rockGeometry, wTreeGeometry } from './wmodels';
import { addWind, bushGeometry, lambert, stumpGeometry } from '../fps/models';
import { Solids, type SBox } from './collide';
import { VoxWorld } from './voxworld';

/** cores dos dados (strings) convertidas uma vez só: Color.set(string) por instância custa */
const COLS = new Map<string, THREE.Color>();
function colOf(hex: string, out: THREE.Color): THREE.Color {
  let c = COLS.get(hex);
  if (!c) COLS.set(hex, (c = new THREE.Color(hex)));
  return out.copy(c);
}

export interface StreamQ {
  /** raio em pedaços */
  radius: number;
  /** distância (m) até onde as árvores usam o modelo completo */
  near: number;
  /** fração das plantinhas desenhadas */
  deco: number;
  lite: boolean;
  /** pedaços gerados por quadro */
  perFrame: number;
}

export interface TreeRef {
  c: Chunk;
  i: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const RARE_TINT = [
  [1, 1, 1],
  [1.5, 1.25, 0.45],
  [0.75, 1.2, 1.6],
  [0.9, 1.5, 1.2],
];

class Inst {
  mesh: THREE.InstancedMesh;
  n = 0;
  constructor(
    private geo: THREE.BufferGeometry,
    private mat: THREE.Material,
    private scene: THREE.Scene,
    cap: number,
    private shadow: boolean,
  ) {
    this.mesh = this.make(cap);
  }
  private make(cap: number): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(this.geo, this.mat, cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.count = 0;
    m.frustumCulled = false;
    m.castShadow = this.shadow;
    m.receiveShadow = false;
    m.setColorAt(0, _c.setRGB(1, 1, 1));
    this.scene.add(m);
    return m;
  }
  begin(): void {
    this.n = 0;
  }
  push(m: THREE.Matrix4, r = 1, g = 1, b = 1): void {
    if (this.n >= this.mesh.instanceMatrix.count) {
      const old = this.mesh;
      const nm = this.make(Math.ceil(old.instanceMatrix.count * 1.6) + 16);
      for (let i = 0; i < this.n; i++) {
        old.getMatrixAt(i, _m);
        nm.setMatrixAt(i, _m);
        old.getColorAt(i, _c);
        nm.setColorAt(i, _c);
      }
      this.scene.remove(old);
      old.dispose();
      this.mesh = nm;
    }
    this.mesh.setMatrixAt(this.n, m);
    this.mesh.setColorAt(this.n, _c.setRGB(r, g, b));
    this.n++;
  }
  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.dispose();
  }
}

export class World {
  readonly gen: WorldGen;
  readonly chunks = new Map<string, Chunk>();
  readonly groundMat: THREE.MeshLambertMaterial;
  private treeMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  private nearT: Inst[] = [];
  private farT: Inst[] = [];
  private stumps: Inst;
  private rocks: Inst;
  private bushes: Inst;
  private flowers: Inst;
  private dirty = true;
  private rebuildT = 0;
  private lastRX = 1e9;
  private lastRZ = 1e9;
  private pcx = 0;
  private pcz = 0;
  /** objetos dos acampamentos por chave do pedaço */
  campObjs = new Map<string, THREE.Object3D>();
  onCampLoad: ((c: Camp, ch: Chunk) => THREE.Object3D) | null = null;
  /** árvores escondidas (caindo) — não desenhar */
  hidden = new Set<string>();
  /** pedaços (re)carregados este quadro: útil para "assentar" objetos */
  loadedNow = 0;
  /** caixas de colisão (construções, acampamentos, veículos) */
  readonly solids = new Solids();
  /** água só onde o terreno NATURAL fica abaixo do nível (rios, lagos, mar) */
  readonly waterMat = new THREE.MeshLambertMaterial({ color: 0x3ab0e0, transparent: true, opacity: 0.78, depthWrite: false });
  private waterMesh = new Map<Chunk, THREE.Mesh>();
  onUnload: ((c: Chunk) => void) | null = null;
  readonly vox: VoxWorld;
  onLoad: ((c: Chunk) => void) | null = null;

  constructor(
    readonly scene: THREE.Scene,
    readonly save: WorldSave,
    public q: StreamQ,
  ) {
    this.gen = new WorldGen(save.seed);
    this.groundMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.vox = new VoxWorld(this);
    addWind(this.treeMat);
    const cap = 64;
    for (let s = 0; s < WSPECIES.length; s++) {
      this.nearT.push(new Inst(wTreeGeometry(s, 0, q.lite), this.treeMat, scene, cap, true));
      this.farT.push(new Inst(wTreeGeometry(s, 1, true), this.treeMat, scene, cap * 2, false));
    }
    this.stumps = new Inst(stumpGeometry(), this.treeMat, scene, 32, false);
    const rockMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.rocks = new Inst(rockGeometry(), rockMat, scene, 64, true);
    this.bushes = new Inst(bushGeometry(), this.treeMat, scene, 128, false);
    const fg = new THREE.IcosahedronGeometry(0.12, 0);
    fg.translate(0, 0.35, 0);
    const fcol: number[] = [];
    for (let i = 0; i < fg.getAttribute('position').count; i++) fcol.push(1, 1, 1);
    fg.setAttribute('color', new THREE.Float32BufferAttribute(fcol, 3));
    this.flowers = new Inst(fg, lambert('#ffffff', 0.25), scene, 128, false);
  }

  static key(cx: number, cz: number): string {
    return cx + ',' + cz;
  }
  chunkAt(x: number, z: number): Chunk | undefined {
    return this.chunks.get(World.key(Math.floor(x / CH), Math.floor(z / CH)));
  }

  /** altura do chão (com escavações) — fora dos pedaços carregados usa o gerador */
  heightAt(x: number, z: number): number {
    const c = this.chunkAt(x, z);
    if (!c) return this.gen.height(x, z);
    return c.hAt(x - c.x0, z - c.z0);
  }
  /** altura natural (sem escavações) */
  baseAt(x: number, z: number): number {
    const c = this.chunkAt(x, z);
    if (!c) return this.gen.height(x, z);
    return c.bAt(x - c.x0, z - c.z0);
  }
  /** água natural aqui? (buracos cavados ficam secos) */
  isWater(x: number, z: number): boolean {
    return this.baseAt(x, z) < WATER_Y - 0.02;
  }
  /** nível da água em (x,z) ou -Infinity */
  waterLevel(x: number, z: number): number {
    return this.baseAt(x, z) < WATER_Y - 0.02 ? WATER_Y : -Infinity;
  }
  /**
   * Chão andável debaixo de (x, y, z): terreno (ou caverna) + topo de construções.
   * `y` é a altura de onde se procura (pé + degrau).
   */
  floorAt(x: number, y: number, z: number): number {
    const t = this.terrainFloor(x, y, z);
    const b = this.solids.groundAt(x, z, y);
    return b > t ? b : t;
  }
  /** só o terreno (com volume escavado, se houver) */
  terrainFloor(x: number, y: number, z: number): number {
    const c = this.chunkAt(x, z);
    if (!c) return this.gen.height(x, z);
    if (c.vol) return c.vol.floor(x, y, z);
    return c.hAt(x - c.x0, z - c.z0);
  }
  normalAt(x: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    const e = 0.8;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return out.set(-dx, 2 * e, -dz).normalize();
  }
  biomeAt(x: number, z: number): number {
    return this.gen.weights(x, z);
  }

  /* ------------------------------ streaming ------------------------------ */

  update(px: number, pz: number, dt: number): void {
    const R = this.q.radius;
    const pcx = Math.floor(px / CH);
    const pcz = Math.floor(pz / CH);
    this.pcx = pcx;
    this.pcz = pcz;
    this.loadedNow = 0;
    // carrega os que faltam (mais perto primeiro). Gerar um pedaço inteiro custa vários ms no
    // celular: a geração é dividida entre quadros (~3 ms por quadro), exceto o pedaço onde você
    // está (ou vizinho), que precisa existir já.
    let budget = this.q.perFrame;
    if (this.pending) {
      const p = this.pending;
      const d = Math.max(Math.abs(p.cx - pcx), Math.abs(p.cz - pcz));
      if (p.generateStep(this.gen, d <= 1 ? Infinity : 3)) {
        this.pending = null;
        this.finishLoad(p);
      }
      budget--;
    }
    for (let r = 0; r <= R && budget > 0; r++)
      for (let dz = -r; dz <= r && budget > 0; dz++)
        for (let dx = -r; dx <= r && budget > 0; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const k = World.key(pcx + dx, pcz + dz);
          if (this.chunks.has(k) || (this.pending && this.pending.key() === k)) continue;
          this.load(pcx + dx, pcz + dz, r <= 1);
          budget--;
        }
    // descarrega os distantes
    for (const [k, c] of this.chunks) {
      if (Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz)) > R + 1) this.unload(k, c);
    }
    // nível de detalhe do chão: no máximo UM pedaço refeito por quadro (o mais perto primeiro);
    // ao cruzar a borda de um pedaço vários mudam de LOD juntos e refazer todos travava o quadro
    let lodC: Chunk | null = null;
    let lodD = 1e9;
    let lodStep = 0;
    for (const c of this.chunks.values()) {
      const d = Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz));
      const step = d <= 1 ? 1 : d <= 2 ? 2 : 4;
      if (c.lod !== step && !c.volReady && d < lodD) {
        lodD = d;
        lodC = c;
        lodStep = step;
      }
    }
    if (lodC && (this.loadedNow === 0 || lodD <= 1)) lodC.buildMesh(lodStep, this.groundMat);
    // crescimento das mudas
    for (const c of this.chunks.values()) {
      for (let i = 0; i < c.nt; i++) {
        const st = c.tstate[i];
        if (st === TState.Stump || st === TState.Sapling) {
          c.tgrow[i] += dt / 90;
          if (st === TState.Stump && c.tgrow[i] > 0.25) {
            c.tstate[i] = TState.Sapling;
            this.dirty = true;
          } else if (st === TState.Sapling) {
            if (c.tgrow[i] >= 1) {
              c.tgrow[i] = 1;
              c.tstate[i] = TState.Grown;
              c.thp[i] = treeHp(c.trees[i * TREE_STRIDE + 5], c.trees[i * TREE_STRIDE + 6]);
            }
            this.dirtyT += dt;
          }
        }
      }
    }
    if (this.dirtyT > 2) {
      this.dirtyT = 0;
      this.dirty = true;
    }
    this.rebuildT -= dt;
    const moved = Math.abs(px - this.lastRX) + Math.abs(pz - this.lastRZ) > 8;
    if ((this.dirty || moved) && this.rebuildT <= 0) {
      this.rebuildT = 0.2;
      this.lastRX = px;
      this.lastRZ = pz;
      this.dirty = false;
      this.rebuildInstances(px, pz);
    }
  }
  private dirtyT = 0;

  markTreesDirty(): void {
    this.dirty = true;
    this.rebuildT = 0;
  }

  /** pedaço sendo gerado aos poucos */
  private pending: Chunk | null = null;

  private load(cx: number, cz: number, now = true): void {
    const c = new Chunk(cx, cz);
    if (!now && !this.pending) {
      if (!c.generateStep(this.gen, 3)) {
        this.pending = c;
        return;
      }
    } else c.generate(this.gen);
    this.finishLoad(c);
  }

  private finishLoad(c: Chunk): void {
    const cx = c.cx;
    const cz = c.cz;
    c.natVol = this.vox.natural(c);
    const rec = this.save.chunks[c.key()];
    if (rec) {
      if (rec.e) c.decodeEdit(rec.e);
      if (rec.v) this.vox.decode(c, rec.v);
      if (rec.t)
        for (let k = 0; k + 2 < rec.t.length; k += 3) {
          const i = rec.t[k];
          if (i < 0 || i >= c.nt) continue;
          c.tstate[i] = rec.t[k + 1];
          c.tgrow[i] = rec.t[k + 2] / 100;
        }
    }
    const d = Math.max(Math.abs(cx - this.pcx), Math.abs(cz - this.pcz));
    const m = c.buildMesh(d <= 1 ? 1 : d <= 2 ? 2 : 4, this.groundMat);
    this.scene.add(m);
    this.chunks.set(c.key(), c);
    const wm = this.buildWater(c);
    if (wm) {
      this.scene.add(wm);
      this.waterMesh.set(c, wm);
    }
    this.onLoad?.(c);
    if (c.camp && this.onCampLoad) {
      const o = this.onCampLoad(c.camp, c);
      this.campObjs.set(c.key(), o);
      this.scene.add(o);
    }
    this.dirty = true;
    this.loadedNow++;
  }

  private buildWater(c: Chunk): THREE.Mesh | null {
    if (c.minBase >= WATER_Y - 0.02) return null;
    const pos: number[] = [];
    const b = c.base;
    const y = WATER_Y - 0.05;
    for (let j = 0; j < RES; j++)
      for (let i = 0; i < RES; i++) {
        const k = j * VN + i;
        if (Math.min(b[k], b[k + 1], b[k + VN], b[k + VN + 1]) >= WATER_Y + 0.05) continue;
        const x = c.x0 + i;
        const z = c.z0 + j;
        pos.push(x, y, z, x, y, z + 1, x + 1, y, z, x + 1, y, z, x, y, z + 1, x + 1, y, z + 1);
      }
    if (!pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const n = new Float32Array(pos.length);
    for (let i = 1; i < n.length; i += 3) n[i] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, this.waterMat);
    m.matrixAutoUpdate = false;
    m.renderOrder = 2;
    return m;
  }

  private unload(k: string, c: Chunk): void {
    this.onUnload?.(c);
    this.vox.forget(c);
    const wm = this.waterMesh.get(c);
    if (wm) {
      this.scene.remove(wm);
      wm.geometry.dispose();
      this.waterMesh.delete(c);
    }
    this.store(c);
    if (c.mesh) {
      this.scene.remove(c.mesh);
      c.mesh.geometry.dispose();
    }
    const o = this.campObjs.get(k);
    if (o) {
      this.scene.remove(o);
      for (const b of (o.userData.boxes as SBox[] | undefined) ?? []) this.solids.remove(b);
      this.campObjs.delete(k);
    }
    this.chunks.delete(k);
    this.dirty = true;
  }

  /** guarda escavação e árvores alteradas no save */
  store(c: Chunk): void {
    if (!c.modified) return;
    const rec: { e?: string; t?: number[]; v?: Record<string, string> } = {};
    const e = c.encodeEdit();
    if (e) rec.e = e;
    const v = this.vox.encode(c);
    if (v) rec.v = v;
    const t: number[] = [];
    for (let i = 0; i < c.nt; i++) if (c.tstate[i] !== TState.Grown) t.push(i, c.tstate[i], Math.round(c.tgrow[i] * 100));
    if (t.length) rec.t = t;
    if (rec.e || rec.t || rec.v) this.save.chunks[c.key()] = rec;
    else delete this.save.chunks[c.key()];
  }
  storeAll(): void {
    for (const c of this.chunks.values()) this.store(c);
  }

  /* ------------------------------ instâncias ------------------------------ */

  private rebuildInstances(px: number, pz: number): void {
    for (const i of this.nearT) i.begin();
    for (const i of this.farT) i.begin();
    this.stumps.begin();
    this.rocks.begin();
    this.bushes.begin();
    this.flowers.begin();
    const near2 = this.q.near * this.q.near;
    const deco2 = (this.q.near * 1.2) ** 2;
    const anyHidden = this.hidden.size > 0;
    for (const c of this.chunks.values()) {
      const T = c.trees;
      const kp = anyHidden ? c.key() + ':' : '';
      for (let i = 0; i < c.nt; i++) {
        const st = c.tstate[i];
        if (st === TState.Gone) continue;
        const o = i * TREE_STRIDE;
        const x = T[o];
        const z = T[o + 2];
        if (anyHidden && st === TState.Grown && this.hidden.has(kp + i)) continue;
        const y = c.hAt(x - c.x0, z - c.z0);
        const d2 = (x - px) ** 2 + (z - pz) ** 2;
        const sp = T[o + 5];
        const rare = T[o + 6];
        if (st === TState.Stump) {
          if (d2 > near2 * 1.5) continue;
          const r = WSPECIES[sp].shape === 'cactus' ? 0.6 : 0.85;
          _m.compose(_p.set(x, y - 0.05, z), _q.setFromAxisAngle(UP, T[o + 3]), _s.set(r, 0.9, r));
          colOf(WSPECIES[sp].trunk, _c);
          this.stumps.push(_m, _c.r, _c.g, _c.b);
          continue;
        }
        const sc = T[o + 4] * (st === TState.Sapling ? 0.15 + c.tgrow[i] * 0.85 : 1) * (rare ? 1.15 : 1);
        _m.compose(_p.set(x, y - 0.1, z), _q.setFromAxisAngle(UP, T[o + 3]), _s.set(sc, sc, sc));
        const tint = RARE_TINT[rare] ?? RARE_TINT[0];
        (d2 < near2 ? this.nearT : this.farT)[sp].push(_m, tint[0], tint[1], tint[2]);
      }
      for (let i = 0; i < c.nr; i++) {
        const o = i * 5;
        const x = c.rocks[o];
        const z = c.rocks[o + 2];
        const s = c.rocks[o + 3];
        const y = c.hAt(x - c.x0, z - c.z0);
        _m.compose(_p.set(x, y, z), _q.setFromAxisAngle(UP, x * 1.7 + z), _s.set(s, s, s));
        colOf(WBIOMES[c.rocks[o + 4]].rock, _c);
        this.rocks.push(_m, _c.r * 1.2, _c.g * 1.2, _c.b * 1.2);
      }
      if (this.q.deco > 0)
        for (let i = 0; i < c.nd; i++) {
          if ((i % 10) / 10 >= this.q.deco) continue;
          const o = i * 6;
          const x = c.deco[o];
          const z = c.deco[o + 2];
          if ((x - px) ** 2 + (z - pz) ** 2 > deco2) continue;
          const s = c.deco[o + 3];
          const y = c.hAt(x - c.x0, z - c.z0);
          const b = WBIOMES[c.deco[o + 5]];
          _m.compose(_p.set(x, y - 0.05, z), _q.setFromAxisAngle(UP, x + z), _s.set(s, s, s));
          if (c.deco[o + 4]) {
            colOf(b.flower, _c);
            this.flowers.push(_m, _c.r, _c.g, _c.b);
          } else {
            colOf(b.bush, _c);
            this.bushes.push(_m, _c.r * 1.3, _c.g * 1.3, _c.b * 1.3);
          }
        }
    }
    for (const i of this.nearT) i.end();
    for (const i of this.farT) i.end();
    this.stumps.end();
    this.rocks.end();
    this.bushes.end();
    this.flowers.end();
  }

  /* ------------------------------ árvores ------------------------------ */

  /** árvore em pé mais próxima de (x,z) dentro de r (opcional: cone de mira) */
  treeNear(x: number, z: number, r: number, fx = 0, fz = 0, cosMin = -2): TreeRef | null {
    let best: TreeRef | null = null;
    let bd = r * r;
    const c0x = Math.floor(x / CH);
    const c0z = Math.floor(z / CH);
    const span = Math.ceil(r / CH);
    for (let cz = c0z - span; cz <= c0z + span; cz++)
      for (let cx = c0x - span; cx <= c0x + span; cx++) {
        const c = this.chunks.get(World.key(cx, cz));
        if (!c) continue;
        for (let i = 0; i < c.nt; i++) {
          if (c.tstate[i] !== TState.Grown) continue;
          const o = i * TREE_STRIDE;
          const dx = c.trees[o] - x;
          const dz = c.trees[o + 2] - z;
          const d2 = dx * dx + dz * dz;
          if (d2 >= bd) continue;
          if (cosMin > -2) {
            const d = Math.sqrt(d2) || 1;
            if ((dx * fx + dz * fz) / d < cosMin && d2 > 1.2) continue;
          }
          bd = d2;
          best = { c, i };
        }
      }
    return best;
  }
  treePos(t: TreeRef, out: THREE.Vector3): THREE.Vector3 {
    const o = t.i * TREE_STRIDE;
    return out.set(t.c.trees[o], t.c.hAt(t.c.trees[o] - t.c.x0, t.c.trees[o + 2] - t.c.z0), t.c.trees[o + 2]);
  }
  treeSp(t: TreeRef): number {
    return t.c.trees[t.i * TREE_STRIDE + 5];
  }
  treeRare(t: TreeRef): number {
    return t.c.trees[t.i * TREE_STRIDE + 6];
  }
  treeScale(t: TreeRef): number {
    return t.c.trees[t.i * TREE_STRIDE + 4];
  }
  treeKey(t: TreeRef): string {
    return t.c.key() + ':' + t.i;
  }
  /** derruba: vira toco */
  fell(t: TreeRef): void {
    t.c.tstate[t.i] = TState.Stump;
    t.c.tgrow[t.i] = 0;
    t.c.modified = true;
    this.dirty = true;
    this.rebuildT = 0;
  }
  treeGeo(sp: number): THREE.BufferGeometry {
    return this.nearT[sp].mesh.geometry;
  }
  get treeMaterial(): THREE.Material {
    return this.treeMat;
  }

  /** colisão simples com troncos: empurra (x,z) para fora; devolve true se encostou */
  pushOutTrees(p: { x: number; z: number }, rad: number, y = -1e9): boolean {
    let hit = false;
    const c0x = Math.floor(p.x / CH);
    const c0z = Math.floor(p.z / CH);
    for (let cz = c0z - 1; cz <= c0z + 1; cz++)
      for (let cx = c0x - 1; cx <= c0x + 1; cx++) {
        const c = this.chunks.get(World.key(cx, cz));
        if (!c) continue;
        for (let i = 0; i < c.nt; i++) {
          const st = c.tstate[i];
          if (st !== TState.Grown) continue;
          const o = i * TREE_STRIDE;
          const tr = 0.42 * c.trees[o + 4];
          const dx = p.x - c.trees[o];
          const dz = p.z - c.trees[o + 2];
          const min = rad + tr;
          const d2 = dx * dx + dz * dz;
          if (d2 < min * min && d2 > 1e-6) {
            const d = Math.sqrt(d2);
            p.x = c.trees[o] + (dx / d) * min;
            p.z = c.trees[o + 2] + (dz / d) * min;
            hit = true;
          }
        }
        for (let i = 0; i < c.nr; i++) {
          const o = i * 5;
          // em cima da pedra: não empurra
          if (y > c.hAt(c.rocks[o] - c.x0, c.rocks[o + 2] - c.z0) + c.rocks[o + 3] * 0.55) continue;
          const dx = p.x - c.rocks[o];
          const dz = p.z - c.rocks[o + 2];
          const min = rad + c.rocks[o + 3] * 1.0;
          const d2 = dx * dx + dz * dz;
          if (d2 < min * min && d2 > 1e-6) {
            const d = Math.sqrt(d2);
            p.x = c.rocks[o] + (dx / d) * min;
            p.z = c.rocks[o + 2] + (dz / d) * min;
            hit = true;
          }
        }
      }
    return hit;
  }

  /**
   * Primeiro tronco/pedra que cruza o segmento a→b (no plano), com folga r.
   * Devolve a fração 0..1 do segmento (1 = livre). Usado pela câmera de perseguição.
   */
  segmentHit(ax: number, az: number, bx: number, bz: number, r: number): number {
    let best = 1;
    const dx = bx - ax;
    const dz = bz - az;
    const L2 = dx * dx + dz * dz || 1e-6;
    const test = (px: number, pz: number, rad: number) => {
      let t = ((px - ax) * dx + (pz - az) * dz) / L2;
      if (t < 0 || t > 1) return;
      const qx = ax + dx * t - px;
      const qz = az + dz * t - pz;
      const d2 = qx * qx + qz * qz;
      const R = rad + r;
      if (d2 >= R * R) return;
      // recua até a borda do círculo
      t -= Math.sqrt(R * R - d2) / Math.sqrt(L2);
      if (t < best) best = Math.max(0, t);
    };
    const x0 = Math.floor(Math.min(ax, bx) / CH);
    const x1 = Math.floor(Math.max(ax, bx) / CH);
    const z0 = Math.floor(Math.min(az, bz) / CH);
    const z1 = Math.floor(Math.max(az, bz) / CH);
    for (let cz = z0; cz <= z1; cz++)
      for (let cx = x0; cx <= x1; cx++) {
        const c = this.chunks.get(World.key(cx, cz));
        if (!c) continue;
        for (let i = 0; i < c.nt; i++) {
          if (c.tstate[i] !== TState.Grown) continue;
          const o = i * TREE_STRIDE;
          test(c.trees[o], c.trees[o + 2], 0.45 * c.trees[o + 4]);
        }
        for (let i = 0; i < c.nr; i++) test(c.rocks[i * 5], c.rocks[i * 5 + 2], c.rocks[i * 5 + 3]);
      }
    return best;
  }

  /* ------------------------------ escavação ------------------------------ */

  /**
   * Abaixa (dy<0) ou levanta o chão num disco de raio r com queda suave.
   * rim > 0 levanta uma borda (cratera). Refaz as malhas tocadas.
   * Devolve o volume removido (m³ aproximados).
   */
  deform(x: number, z: number, r: number, dy: number, rim = 0, flattenTo: number | null = null): number {
    let vol = 0;
    const touched = new Set<Chunk>();
    const minY = WATER_Y - 14;
    const R = r * (rim > 0 ? 1.35 : 1);
    const cx0 = Math.floor((x - R - 1) / CH);
    const cx1 = Math.floor((x + R + 1) / CH);
    const cz0 = Math.floor((z - R - 1) / CH);
    const cz1 = Math.floor((z + R + 1) / CH);
    for (let cz = cz0; cz <= cz1; cz++)
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = this.chunks.get(World.key(cx, cz));
        if (!c) continue;
        const i0 = Math.max(0, Math.floor(x - R - c.x0));
        const i1 = Math.min(RES, Math.ceil(x + R - c.x0));
        const j0 = Math.max(0, Math.floor(z - R - c.z0));
        const j1 = Math.min(RES, Math.ceil(z + R - c.z0));
        for (let j = j0; j <= j1; j++)
          for (let i = i0; i <= i1; i++) {
            const d = Math.hypot(c.x0 + i - x, c.z0 + j - z);
            if (d > R) continue;
            let k: number;
            if (flattenTo !== null) {
              const f = d < r ? 1 : 0;
              if (!f) continue;
              const cur = c.h[j * VN + i];
              k = (flattenTo - cur) * Math.min(1, -dy);
              c.addH(i, j, k, minY);
              vol += Math.abs(k);
              touched.add(c);
              continue;
            }
            if (d <= r) {
              const f = Math.cos((d / r) * Math.PI * 0.5);
              k = dy * f * f;
            } else {
              const f = Math.sin(((d - r) / (R - r)) * Math.PI);
              k = rim * f;
            }
            c.addH(i, j, k, minY);
            vol -= k;
            touched.add(c);
          }
      }
    for (const c of touched) {
      c.fillMesh();
      c.treesDirty = true;
    }
    if (touched.size) this.dirty = true;
    return vol;
  }

  /** derruba (devolve) as árvores dentro do raio — explosões e o trator de esteira */
  treesInRadius(x: number, z: number, r: number): TreeRef[] {
    const out: TreeRef[] = [];
    const span = Math.ceil(r / CH) + 1;
    const c0x = Math.floor(x / CH);
    const c0z = Math.floor(z / CH);
    for (let cz = c0z - span; cz <= c0z + span; cz++)
      for (let cx = c0x - span; cx <= c0x + span; cx++) {
        const c = this.chunks.get(World.key(cx, cz));
        if (!c) continue;
        for (let i = 0; i < c.nt; i++) {
          if (c.tstate[i] !== TState.Grown) continue;
          const o = i * TREE_STRIDE;
          if ((c.trees[o] - x) ** 2 + (c.trees[o + 2] - z) ** 2 < r * r) out.push({ c, i });
        }
      }
    return out;
  }

  /** cor média de neblina/céu dos biomas no ponto */
  skyAt(x: number, z: number, fog: THREE.Color, top: THREE.Color): number {
    const w = new Float32Array(NB);
    const best = this.gen.weights(x, z, w);
    fog.setRGB(0, 0, 0);
    top.setRGB(0, 0, 0);
    let fk = 0;
    for (let b = 0; b < NB; b++) {
      if (w[b] < 0.01) continue;
      _c.set(WBIOMES[b].fog);
      fog.r += _c.r * w[b];
      fog.g += _c.g * w[b];
      fog.b += _c.b * w[b];
      _c.set(WBIOMES[b].sky[0]);
      top.r += _c.r * w[b];
      top.g += _c.g * w[b];
      top.b += _c.b * w[b];
      fk += WBIOMES[b].fogK * w[b];
    }
    this.lastBest = best;
    return fk || 1;
  }
  lastBest = 0;

  dispose(): void {
    for (const i of this.nearT) i.dispose();
    for (const i of this.farT) i.dispose();
    this.stumps.dispose();
    this.rocks.dispose();
    this.bushes.dispose();
    this.flowers.dispose();
    this.vox.dispose();
    for (const c of this.chunks.values()) {
      if (c.mesh) {
        this.scene.remove(c.mesh);
        c.mesh.geometry.dispose();
      }
    }
    for (const m of this.waterMesh.values()) {
      this.scene.remove(m);
      m.geometry.dispose();
    }
    this.waterMesh.clear();
    this.solids.clear();
    this.chunks.clear();
  }
}

/** vida da árvore no mundo aberto (golpes ~2.5 de dano) */
export function treeHp(sp: number, rare: number): number {
  return (3 + Math.sqrt(WSPECIES[sp].hp) * 1.4) * (rare ? 1.5 : 1);
}
