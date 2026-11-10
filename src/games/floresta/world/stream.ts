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
import { bushGeometry, lambert, stumpGeometry } from '../fps/models';

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

  constructor(
    readonly scene: THREE.Scene,
    readonly save: WorldSave,
    public q: StreamQ,
  ) {
    this.gen = new WorldGen(save.seed);
    this.groundMat = new THREE.MeshLambertMaterial({ vertexColors: true });
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
    // carrega os que faltam (mais perto primeiro)
    let budget = this.q.perFrame;
    for (let r = 0; r <= R && budget > 0; r++)
      for (let dz = -r; dz <= r && budget > 0; dz++)
        for (let dx = -r; dx <= r && budget > 0; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const k = World.key(pcx + dx, pcz + dz);
          if (this.chunks.has(k)) continue;
          this.load(pcx + dx, pcz + dz);
          budget--;
        }
    // descarrega os distantes
    for (const [k, c] of this.chunks) {
      if (Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz)) > R + 1) this.unload(k, c);
    }
    // nível de detalhe do chão
    for (const c of this.chunks.values()) {
      const d = Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz));
      const step = d <= 1 ? 1 : d <= 2 ? 2 : 4;
      if (c.lod !== step) c.buildMesh(step, this.groundMat);
    }
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

  private load(cx: number, cz: number): void {
    const c = new Chunk(cx, cz);
    c.generate(this.gen);
    const rec = this.save.chunks[c.key()];
    if (rec) {
      if (rec.e) c.decodeEdit(rec.e);
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
    if (c.camp && this.onCampLoad) {
      const o = this.onCampLoad(c.camp, c);
      this.campObjs.set(c.key(), o);
      this.scene.add(o);
    }
    this.dirty = true;
    this.loadedNow++;
  }

  private unload(k: string, c: Chunk): void {
    this.store(c);
    if (c.mesh) {
      this.scene.remove(c.mesh);
      c.mesh.geometry.dispose();
    }
    const o = this.campObjs.get(k);
    if (o) {
      this.scene.remove(o);
      this.campObjs.delete(k);
    }
    this.chunks.delete(k);
    this.dirty = true;
  }

  /** guarda escavação e árvores alteradas no save */
  store(c: Chunk): void {
    if (!c.modified) return;
    const rec: { e?: string; t?: number[] } = {};
    const e = c.encodeEdit();
    if (e) rec.e = e;
    const t: number[] = [];
    for (let i = 0; i < c.nt; i++) if (c.tstate[i] !== TState.Grown) t.push(i, c.tstate[i], Math.round(c.tgrow[i] * 100));
    if (t.length) rec.t = t;
    if (rec.e || rec.t) this.save.chunks[c.key()] = rec;
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
    for (const c of this.chunks.values()) {
      const T = c.trees;
      for (let i = 0; i < c.nt; i++) {
        const st = c.tstate[i];
        if (st === TState.Gone) continue;
        const o = i * TREE_STRIDE;
        const x = T[o];
        const z = T[o + 2];
        if (st === TState.Grown && this.hidden.has(c.key() + ':' + i)) continue;
        const y = c.hAt(x - c.x0, z - c.z0);
        const d2 = (x - px) ** 2 + (z - pz) ** 2;
        const sp = T[o + 5];
        const rare = T[o + 6];
        if (st === TState.Stump) {
          if (d2 > near2 * 1.5) continue;
          const r = WSPECIES[sp].shape === 'cactus' ? 0.6 : 0.85;
          _m.compose(_p.set(x, y - 0.05, z), _q.setFromAxisAngle(UP, T[o + 3]), _s.set(r, 0.9, r));
          const tc = new THREE.Color(WSPECIES[sp].trunk);
          this.stumps.push(_m, tc.r, tc.g, tc.b);
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
        _c.set(WBIOMES[c.rocks[o + 4]].rock);
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
            _c.set(b.flower);
            this.flowers.push(_m, _c.r, _c.g, _c.b);
          } else {
            _c.set(b.bush);
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
  pushOutTrees(p: { x: number; z: number }, rad: number): boolean {
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
          const tr = 0.35 * c.trees[o + 4];
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
    for (const c of this.chunks.values()) {
      if (c.mesh) {
        this.scene.remove(c.mesh);
        c.mesh.geometry.dispose();
      }
    }
    this.chunks.clear();
  }
}

/** vida da árvore no mundo aberto (golpes ~2.5 de dano) */
export function treeHp(sp: number, rare: number): number {
  return (3 + Math.sqrt(WSPECIES[sp].hp) * 1.4) * (rare ? 1.5 : 1);
}
