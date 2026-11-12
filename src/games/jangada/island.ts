/* ============================================================
 *  JANGADA BLOOP — ilhas por bioma (ver biomes.ts): chão com cores
 *  do bioma (areia/grama/rocha/neve/cinza), árvores próprias, frutas,
 *  pedras e minérios, plantinhas, baús por raridade (alguns guardados
 *  pelos donos), caverna escura (precisa de luz) e, em volta, fundo do
 *  mar raso com algas, argila, sucata, conchas, pedras e pérolas,
 *  com cáusticas (ocean.ts → patchSeabed).
 *  Geração determinística pela semente (online: todos iguais).
 * ============================================================ */
import * as THREE from 'three';
import type { Bag, ItemId } from './data';
import { BIOMES, chestLoot, mulberry, type Biome, type BiomeDef, type IsleSpec, type Rarity, type TreeK } from './biomes';
import { MAT, initMats, merge, palmGeo, rockGeo, seabedGeo } from './models';
import { boulderGeo, caveCrystalsGeo, caveGeo, chestModel, fruitBushGeo, oreGeo, plantGeo, treeGeo, volcanoGeo } from './models2';
import { ISLE_DEEP, SEABED_SAND, patchSeabed } from './ocean';

export type NK = 'palm' | 'tree' | 'bamboo' | 'rock' | 'ore' | 'bush' | 'chest' | 'seaweed' | 'clay' | 'scrap' | 'shell' | 'stone' | 'pearl';
export interface INode {
  id: number;
  k: NK;
  x: number;
  z: number;
  y: number;
  hp: number;
  alive: boolean;
  /** árvore: tipo */
  tk?: TreeK;
  /** baú: raridade */
  r?: Rarity;
  /** baú guardado pelos donos */
  guarded?: boolean;
  /** dentro da caverna */
  cave?: boolean;
  obj?: THREE.Object3D;
  lid?: THREE.Object3D;
  glow?: THREE.Object3D | null;
}
export const NODE_HP: Record<NK, number> = { palm: 3, tree: 4, bamboo: 2, rock: 3, ore: 4, bush: 1, chest: 1, seaweed: 1, clay: 1, scrap: 1, shell: 1, stone: 1, pearl: 1 };
export const underwaterNode = (k: NK) => k === 'seaweed' || k === 'clay' || k === 'scrap' || k === 'shell' || k === 'stone' || k === 'pearl';
/** precisa do machado */
export const axeNode = (k: NK) => k === 'palm' || k === 'tree' || k === 'rock' || k === 'ore' || k === 'bamboo';
/** bloqueia a passagem */
export const solidNode = (k: NK) => k === 'palm' || k === 'tree' || k === 'rock' || k === 'ore' || k === 'chest';

export function nodeLoot(n: INode, biome: Biome, r: () => number): { bag: Bag; coins: number } {
  const B = BIOMES[biome];
  const ch = (p: number, id: ItemId, k = 1): Bag => (r() < p ? { [id]: k } : {});
  let bag: Bag = {};
  switch (n.k) {
    case 'palm':
      bag = { wood: 3, leaf: 3, ...(r() < 0.6 ? { coco: 1 + (r() < 0.4 ? 1 : 0) } : {}) };
      break;
    case 'tree':
      if (n.tk === 'jungle') bag = { hardwood: 2, wood: 2, leaf: 2, ...ch(0.6, 'banana', 2) };
      else if (n.tk === 'mangrove') bag = { hardwood: 2, wood: 2, ...ch(0.55, 'caju', 2) };
      else if (n.tk === 'pine') bag = { wood: 4, ...ch(0.35, 'snowberry', 2) };
      else if (n.tk === 'dead') bag = { wood: 3, ...ch(0.3, 'obsidian', 1) };
      else bag = { wood: 2, starfruit: 1, ...ch(0.4, 'pearl', 1) };
      break;
    case 'bamboo':
      bag = { bamboo: 3 };
      break;
    case 'rock':
      bag = { stone: 2 + (r() < 0.5 ? 1 : 0) };
      break;
    case 'ore':
      bag = { [B.ore ?? 'stone']: 2 + (r() < 0.4 ? 1 : 0), stone: 1 };
      break;
    case 'bush':
      bag = { [B.fruit]: 2 + (r() < 0.5 ? 1 : 0), ...(biome === 'tropical' ? ch(0.45, 'seed') : {}) };
      break;
    case 'chest':
      return chestLoot(n.r ?? 0, biome, r);
    case 'seaweed':
      bag = { seaweed: 2 };
      break;
    case 'clay':
      bag = { clay: 2 };
      break;
    case 'scrap':
      bag = { scrap: 2 };
      break;
    case 'shell':
      bag = { shell: 1 };
      break;
    case 'stone':
      bag = { stone: 2 };
      break;
    case 'pearl':
      bag = { pearl: 1, shell: 1 };
      break;
  }
  return { bag, coins: 0 };
}

const groundMats: THREE.MeshLambertMaterial[] = [];
function groundMat(tier: number): THREE.MeshLambertMaterial {
  if (!groundMats[tier]) {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true });
    patchSeabed(m, tier);
    groundMats[tier] = m;
  }
  return groundMats[tier];
}
let crystalMat: THREE.MeshBasicMaterial | null = null;

export interface Cave {
  /** centro (local) */
  x: number;
  z: number;
  y: number;
  R: number;
  H: number;
  /** ângulo da porta */
  door: number;
  gap: number;
}

export class Island {
  readonly group = new THREE.Group();
  readonly r: number;
  readonly peak: number;
  readonly biome: Biome;
  readonly def: BiomeDef;
  readonly id: number;
  readonly seed: number;
  nodes: INode[] = [];
  readonly ph: number[];
  cave: Cave | null = null;
  /** pontos dos donos (locais) */
  ownerSpots: [number, number][] = [];
  /** baú guardado */
  guard: INode | null = null;
  /** vulcão (bloqueia) */
  volcano: { x: number; z: number; r: number } | null = null;
  private rnd: () => number;
  x: number;
  z: number;
  constructor(spec: IsleSpec, tier: number) {
    initMats();
    this.id = spec.id;
    this.seed = spec.seed;
    this.biome = spec.biome;
    this.def = BIOMES[spec.biome];
    this.x = spec.x;
    this.z = spec.z;
    this.rnd = mulberry(spec.seed * 9973 + 17);
    const r = this.rnd;
    this.r = spec.r;
    const pk: Record<Biome, [number, number]> = { tropical: [2.2, 1.6], jungle: [3, 1.5], rocky: [4.2, 1.8], mangrove: [1.1, 0.5], snowy: [3.2, 1.6], volcanic: [2.6, 1], legend: [3, 1.2], megaIsle: [1.8, 0.8], krakenIsle: [2, 1] };
    this.peak = pk[this.biome][0] + r() * pk[this.biome][1];
    this.ph = [r() * 6.28, r() * 6.28, r() * 6.28];
    this.planCave();
    this.buildGround(tier);
    this.spawnNodes(tier);
    this.group.position.set(this.x, 0, this.z);
  }
  private shape(lx: number, lz: number): number {
    const a = Math.atan2(lz, lx);
    const re = this.r * (1 + 0.14 * Math.sin(3 * a + this.ph[0]) + 0.07 * Math.sin(5 * a + this.ph[1]));
    return Math.hypot(lx, lz) / re;
  }
  /** altura do terreno (m, 0 = mar parado) em coordenadas locais da ilha */
  hLocal(lx: number, lz: number): number {
    const f = this.shape(lx, lz);
    if (f < 1) {
      const b = Math.pow(1 - f * f, 1.25);
      return this.peak * b + Math.sin(lx * 0.7 + this.ph[2]) * Math.cos(lz * 0.6) * 0.25 * b - 0.05;
    }
    return -Math.min(ISLE_DEEP, (f - 1) * this.r * 0.42) - 0.05;
  }
  heightAt(wx: number, wz: number): number {
    return this.hLocal(wx - this.x, wz - this.z);
  }
  get outer(): number {
    return this.r * 1.25 + 20;
  }
  /** forma para a água (profundidade analítica) */
  shapeU() {
    return { x: this.x, z: this.z, r: this.r, ph0: this.ph[0], ph1: this.ph[1], peak: this.peak };
  }
  private planCave(): void {
    if (!this.def.cave) return;
    const r = this.rnd;
    const a = r() * Math.PI * 2;
    const d = this.r * 0.42;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    this.cave = { x, z, y: this.hLocal(x, z), R: 4.3, H: 3.7, door: a, gap: 1.0 };
  }
  /** dentro da caverna? (coordenadas do mundo) */
  inCave(wx: number, wz: number): boolean {
    const c = this.cave;
    if (!c) return false;
    return Math.hypot(wx - this.x - c.x, wz - this.z - c.z) < c.R - 0.15;
  }
  /** paredes da caverna e do vulcão (coordenadas do mundo) */
  blocks(wx: number, wz: number, rad: number): boolean {
    const lx = wx - this.x;
    const lz = wz - this.z;
    const c = this.cave;
    if (c) {
      const dx = lx - c.x;
      const dz = lz - c.z;
      const d = Math.hypot(dx, dz);
      if (d > c.R - 0.3 - rad && d < c.R + 1.1 + rad) {
        const a = Math.atan2(dz, dx);
        const diff = Math.abs(Math.atan2(Math.sin(a - c.door), Math.cos(a - c.door)));
        // na porta: passa (com folga para o raio do corpo)
        if (!(diff < c.gap / 2 - rad / Math.max(1, d))) return true;
      }
    }
    const v = this.volcano;
    if (v && Math.hypot(lx - v.x, lz - v.z) < v.r + rad) return true;
    return false;
  }
  /** raio da malha do chão: a encosta desce até passar do fundo do mar (vista de baixo d'água: ilha sólida, sem "tampa" boiando) */
  get meshR(): number {
    return this.r * 1.25 + 46;
  }
  private buildGround(tier: number): void {
    const R = tier <= 0 ? 24 : 36;
    const S = tier <= 0 ? 40 : 64;
    const maxR = this.meshR;
    const pos: number[] = [];
    const col: number[] = [];
    const c = new THREE.Color();
    const D = this.def;
    const sand = new THREE.Color(D.sand);
    const wet = new THREE.Color(D.sand).multiplyScalar(0.82);
    const grass = new THREE.Color(D.grass);
    const grass2 = new THREE.Color(D.grass2);
    const rock = new THREE.Color(D.rock);
    const deep = new THREE.Color('#3a8a98');
    const seabed = new THREE.Color(SEABED_SAND);
    const push = (lx: number, lz: number) => {
      const h = this.hLocal(lx, lz);
      pos.push(lx, h, lz);
      const n = (Math.sin(lx * 1.3) * Math.cos(lz * 1.1) + 1) / 2;
      if (h > 0.75) {
        c.copy(grass).lerp(grass2, n);
        const rk = this.biome === 'rocky' || this.biome === 'volcanic' || this.biome === 'snowy' ? Math.min(1, Math.max(0, (h - this.peak * 0.55) / (this.peak * 0.3))) : 0;
        if (rk > 0) c.lerp(rock, rk * (0.6 + n * 0.4));
      } else if (h > 0.45) c.copy(sand).lerp(grass, (h - 0.45) / 0.3);
      else if (h > -0.1) c.copy(sand);
      else if (h > -1.2) c.copy(wet).lerp(sand, 0.3);
      else if (h > -9) c.copy(wet).lerp(deep, Math.min(1, (-h - 1.2) / 7));
      else c.copy(deep).lerp(seabed, Math.min(1, (-h - 9) / 6));
      // manchinhas
      const sp = Math.sin(lx * 3.7 + lz * 2.3) * Math.sin(lz * 4.1 - lx * 1.7);
      c.multiplyScalar(0.94 + sp * 0.06);
      col.push(c.r, c.g, c.b);
    };
    push(0, 0);
    for (let i = 1; i <= R; i++) {
      const rr = maxR * Math.pow(i / R, 1.35);
      for (let s = 0; s < S; s++) {
        const a = (s / S) * Math.PI * 2;
        push(Math.cos(a) * rr, Math.sin(a) * rr);
      }
    }
    // aba final: desce reto abaixo do fundo (nenhuma fresta onde a encosta encontra a areia)
    for (let s = 0; s < S; s++) {
      const a = (s / S) * Math.PI * 2;
      const lx = Math.cos(a) * maxR * 1.01;
      const lz = Math.sin(a) * maxR * 1.01;
      pos.push(lx, -ISLE_DEEP - 2.5, lz);
      col.push(seabed.r * 0.9, seabed.g * 0.9, seabed.b * 0.9);
    }
    const idx: number[] = [];
    for (let s = 0; s < S; s++) idx.push(0, 1 + ((s + 1) % S), 1 + s);
    for (let i = 1; i <= R; i++) {
      const a0 = 1 + (i - 1) * S;
      const b0 = 1 + i * S;
      for (let s = 0; s < S; s++) {
        const s1 = (s + 1) % S;
        idx.push(a0 + s, a0 + s1, b0 + s, a0 + s1, b0 + s1, b0 + s);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, groundMat(tier));
    m.receiveShadow = true;
    this.group.add(m);
  }
  private spawnNodes(tier: number): void {
    const r = this.rnd;
    const D = this.def;
    let id = 1;
    const R = this.r;
    const free = (lx: number, lz: number, d: number) => {
      if (this.nodes.some((o) => Math.hypot(o.x - lx, o.z - lz) < d)) return false;
      const c = this.cave;
      if (c && Math.hypot(lx - c.x, lz - c.z) < c.R + 2.2) return false;
      const v = this.volcano;
      if (v && Math.hypot(lx - v.x, lz - v.z) < v.r + 1.5) return false;
      return true;
    };
    const tryPut = (k: NK, n: number, dmin: number, dmax: number, under: boolean, extra: Partial<INode> = {}) => {
      const out: INode[] = [];
      for (let i = 0, tries = 0; i < n && tries < 90; tries++) {
        const a = r() * Math.PI * 2;
        const d = dmin + r() * (dmax - dmin);
        const lx = Math.cos(a) * d;
        const lz = Math.sin(a) * d;
        const h = this.hLocal(lx, lz);
        if (under ? h > -1.6 : h < 0.6) continue;
        if (!free(lx, lz, under ? 1.6 : 2.4)) continue;
        const nd: INode = { id: id++, k, x: lx, z: lz, y: h, hp: NODE_HP[k], alive: true, ...extra };
        this.nodes.push(nd);
        out.push(nd);
        i++;
      }
      return out;
    };
    // vulcão no meio
    if (this.biome === 'volcanic') {
      this.volcano = { x: 0, z: 0, r: 3.6 };
      const vm = new THREE.Mesh(volcanoGeo(4.4, 7.5), MAT.vc);
      vm.position.set(0, this.peak - 0.6, 0);
      this.group.add(vm);
    }
    const tier0 = D.tier;
    // árvores
    const nt = this.biome === 'mangrove' ? 7 : this.biome === 'jungle' ? 7 : this.biome === 'megaIsle' || this.biome === 'krakenIsle' ? 3 : 5;
    for (let i = 0; i < nt; i++) {
      const tk = D.trees[i % D.trees.length];
      if (tk === 'palm') tryPut('palm', 1, 0, R * 0.78, false);
      else tryPut('tree', 1, 0, R * 0.8, false, { tk });
    }
    if (this.biome === 'jungle') tryPut('bamboo', 4, R * 0.2, R * 0.85, false);
    tryPut('rock', 2 + Math.floor(r() * 2), R * 0.2, R * 0.85, false);
    if (D.ore) tryPut('ore', this.biome === 'rocky' ? 4 : 2, R * 0.25, R * 0.85, false);
    tryPut('bush', 2 + Math.floor(r() * 2), 0, R * 0.8, false);
    // baús
    const pk = (base: Rarity, n: number) => tryPut('chest', n, R * 0.15, R * 0.7, false, { r: base });
    if (tier0 === 1) {
      pk(0, 2);
      if (r() < 0.35) pk(1, 1);
    } else if (tier0 === 2) {
      pk(0, 1);
      pk(1, 1);
    } else {
      pk(1, 1);
      pk(2, 1);
    }
    // baú guardado pelos donos territoriais
    const own = D.owner;
    const territorial = own === 'monkey' || own === 'lizard' || own === 'pirate';
    if (territorial) {
      const g = tryPut('chest', 1, R * 0.3, R * 0.55, false, { r: tier0 >= 3 ? 3 : 2, guarded: true })[0];
      if (g) {
        this.guard = g;
        for (let i = 0; i < (tier0 >= 3 ? 3 : 2); i++) {
          const a = (i / 3) * Math.PI * 2 + 0.4;
          this.ownerSpots.push([g.x + Math.cos(a) * 2.6, g.z + Math.sin(a) * 2.6]);
        }
      }
    } else if (own === 'crab' || own === 'penguin') {
      // chefe perto do meio (num lugar livre) + cidadãos
      for (let tries = 0; tries < 30; tries++) {
        const a = r() * Math.PI * 2;
        const d = R * (0.15 + r() * 0.3);
        const lx = Math.cos(a) * d;
        const lz = Math.sin(a) * d;
        if (this.hLocal(lx, lz) < 0.7 || !free(lx, lz, 1.8)) continue;
        this.ownerSpots.push([lx, lz]);
        break;
      }
      for (let i = 0; i < 3; i++) {
        const a = r() * Math.PI * 2;
        const d = R * (0.3 + r() * 0.4);
        this.ownerSpots.push([Math.cos(a) * d, Math.sin(a) * d]);
      }
    }
    // caverna: minérios + baú melhor lá dentro
    const c = this.cave;
    if (c) {
      for (let i = 0; i < 3; i++) {
        const a = c.door + Math.PI + (i - 1) * 0.9;
        const nd: INode = { id: id++, k: 'ore', x: c.x + Math.cos(a) * (c.R - 1.3), z: c.z + Math.sin(a) * (c.R - 1.3), y: 0, hp: NODE_HP.ore, alive: true, cave: true };
        nd.y = this.hLocal(nd.x, nd.z);
        this.nodes.push(nd);
      }
      const nd: INode = { id: id++, k: 'chest', x: c.x - Math.cos(c.door) * 0.8, z: c.z - Math.sin(c.door) * 0.8, y: 0, hp: 1, alive: true, cave: true, r: Math.min(3, tier0) as Rarity };
      nd.y = this.hLocal(nd.x, nd.z);
      this.nodes.push(nd);
    }
    // fundo do mar
    tryPut('seaweed', 5, R * 1.05, R * 1.25 + 14, true);
    tryPut('clay', 3, R * 1.05, R * 1.25 + 14, true);
    tryPut('scrap', 3, R * 1.1, R * 1.25 + 16, true);
    tryPut('shell', 4, R * 1.02, R * 1.25 + 10, true);
    tryPut('stone', 2, R * 1.05, R * 1.25 + 14, true);
    if (tier0 >= 2 || this.biome === 'mangrove') tryPut('pearl', tier0 >= 3 ? 3 : 2, R * 1.1, R * 1.25 + 14, true);
    // malhas
    const palmVar = [palmGeo(4.6, 0.8), palmGeo(5.4, 1.2), palmGeo(4.2, 0.5)];
    const treeVar = new Map<string, THREE.BufferGeometry>();
    const rockVar = [boulderGeo(D.rock, 0.85), boulderGeo(D.rock, 1.1)];
    const ore = D.ore ? oreGeo({ iron: '#d8885a', ice: '#bff0ff', obsidian: '#8a5ae8', gold: '#ffcf2e' }[D.ore as string] ?? '#ffffff', D.rock) : null;
    const bush = fruitBushGeo({ banana: '#ffe04a', mango: '#ffa83a', caju: '#ff6a4a', snowberry: '#8ab8ff', pepper: '#ff3a2a', starfruit: '#ffe86a', coco: '#8a5a32', berry: '#ff4f8a' }[D.fruit as string] ?? '#ff4f8a', this.biome === 'snowy' ? '#4a8a6a' : '#3aa84e');
    const sb: Record<string, THREE.BufferGeometry> = {};
    for (const n of this.nodes) {
      let obj: THREE.Object3D;
      if (n.k === 'chest') {
        const cm = chestModel(n.r ?? 0);
        obj = cm.root;
        n.lid = cm.lid;
        n.glow = cm.glow;
        obj.rotation.y = Math.atan2(-n.x, -n.z) + Math.PI;
      } else {
        let geo: THREE.BufferGeometry;
        if (n.k === 'palm') geo = palmVar[n.id % 3];
        else if (n.k === 'tree') {
          const key = `${n.tk}${n.id % 2}`;
          if (!treeVar.has(key)) treeVar.set(key, treeGeo(n.tk!, n.id % 2 ? 1.1 : 0.9));
          geo = treeVar.get(key)!;
        } else if (n.k === 'bamboo') geo = sb.bamboo ??= bambooGeo();
        else if (n.k === 'rock') geo = rockVar[n.id % 2];
        else if (n.k === 'ore') geo = ore ?? rockGeo(0.8);
        else if (n.k === 'bush') geo = bush;
        else if (n.k === 'pearl') geo = sb.pearl ??= oysterGeo();
        else geo = sb[n.k] ??= seabedGeo(n.k as 'seaweed');
        obj = new THREE.Mesh(geo, MAT.vc);
        obj.rotation.y = r() * Math.PI * 2;
        (obj as THREE.Mesh).castShadow = n.k === 'palm' || n.k === 'tree';
      }
      obj.position.set(n.x, n.y - 0.05, n.z);
      this.group.add(obj);
      n.obj = obj;
    }
    // caverna
    if (c) {
      const cg = caveGeo(c.R, c.H, D.rock, this.biome === 'snowy' ? '#f0f6ff' : D.grass2, c.gap);
      const cm = new THREE.Mesh(cg, MAT.vc);
      cm.position.set(c.x, c.y, c.z);
      cm.rotation.y = -c.door;
      this.group.add(cm);
      crystalMat ??= new THREE.MeshBasicMaterial({ vertexColors: true });
      const cr = new THREE.Mesh(caveCrystalsGeo(c.R, { ice: '#9af0ff', obsidian: '#c89aff', gold: '#ffe86a', iron: '#ffb08a' }[D.ore as string] ?? '#9af0ff'), crystalMat);
      cr.position.copy(cm.position);
      cr.rotation.y = cm.rotation.y;
      this.group.add(cr);
    }
    // plantinhas (decoração, uma malha só)
    const deco: THREE.BufferGeometry[] = [];
    const nd = tier <= 0 ? 6 : 14;
    const flower = { tropical: '#ff6ab8', jungle: '#ff4a4a', rocky: '#ffd34a', mangrove: '#ffffff', snowy: '#bfe8ff', volcanic: '#ff7a2a', legend: '#c89aff', megaIsle: '#ffd34a', krakenIsle: '#c89aff' }[this.biome];
    const leaf = this.biome === 'snowy' ? '#9ab8a8' : this.biome === 'volcanic' ? '#5a4a3a' : '#3a9a4a';
    for (let i = 0; i < nd; i++) {
      const a = r() * Math.PI * 2;
      const d = r() * R * 0.85;
      const lx = Math.cos(a) * d;
      const lz = Math.sin(a) * d;
      const h = this.hLocal(lx, lz);
      if (h < 0.5 || !free(lx, lz, 1)) continue;
      deco.push(plantGeo(leaf, flower).translate(lx, h - 0.05, lz));
    }
    if (deco.length) this.group.add(new THREE.Mesh(merge(deco), MAT.vc));
  }
  /** pegou/derrubou/abriu */
  kill(n: INode): void {
    n.alive = false;
    const o = n.obj;
    if (!o) return;
    if (n.k === 'chest') {
      // baú fica aberto
      const lid = n.lid;
      const t0 = performance.now();
      const open = () => {
        const k = Math.min(1, (performance.now() - t0) / 500);
        if (lid) lid.rotation.x = -k * 1.9;
        if (k < 1) requestAnimationFrame(open);
      };
      open();
      if (n.glow) n.glow.visible = false;
      return;
    }
    if (n.k === 'palm' || n.k === 'tree') {
      const t0 = performance.now();
      const fall = () => {
        const k = Math.min(1, (performance.now() - t0) / 900);
        o.rotation.z = k * k * 1.45;
        if (k < 1) requestAnimationFrame(fall);
        else o.visible = false;
      };
      fall();
    } else o.visible = false;
  }
  /** detalhe ligado (nós, plantas, donos); longe só o chão */
  detailOn = true;
  detail(on: boolean): void {
    if (on === this.detailOn) return;
    this.detailOn = on;
    for (let i = 1; i < this.group.children.length; i++) this.group.children[i].visible = on && (this.group.children[i].userData.hidden !== true);
    if (on) for (const n of this.nodes) if (n.obj && !n.alive && n.k !== 'chest') n.obj.visible = false;
  }
  hit(n: INode): void {
    const o = n.obj;
    if (!o) return;
    const t0 = performance.now();
    const shake = () => {
      const k = (performance.now() - t0) / 250;
      o.rotation.x = Math.sin(k * 20) * 0.06 * (1 - k);
      if (k < 1) requestAnimationFrame(shake);
      else o.rotation.x = 0;
    };
    shake();
  }
  animate(time: number): void {
    for (const n of this.nodes) if (n.glow && n.alive) n.glow.scale.setScalar(1 + Math.sin(time * 3 + n.id) * 0.08);
  }
  nearest(wx: number, wz: number, wy: number, maxD: number, under: boolean | null): INode | null {
    let best: INode | null = null;
    let bd = maxD;
    for (const n of this.nodes) {
      if (!n.alive) continue;
      if (under !== null && underwaterNode(n.k) !== under) continue;
      const hy = n.k === 'palm' || n.k === 'tree' ? 1.2 : n.k === 'bamboo' ? 1 : 0.3;
      const d = Math.hypot(n.x + this.x - wx, n.z + this.z - wz, (n.y + hy - wy) * 0.6);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }
  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh && o.geometry) o.geometry.dispose();
    });
  }
}
function bambooGeo(): THREE.BufferGeometry {
  const L: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const a = i * 1.3;
    const h = 3 + (i % 3) * 0.7;
    const x = Math.cos(a) * 0.3;
    const z = Math.sin(a) * 0.3;
    for (let s = 0; s < 5; s++) L.push(new THREE.CylinderGeometry(0.06, 0.07, h / 5 - 0.03, 6).translate(x, (s + 0.5) * (h / 5), z));
  }
  const g = merge(L.map((x) => paintG(x, '#a8d860')));
  return g;
}
function oysterGeo(): THREE.BufferGeometry {
  return merge([paintG(new THREE.SphereGeometry(0.28, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.4, 1), '#8a8aa0'), paintG(new THREE.SphereGeometry(0.09, 8, 6).translate(0, 0.08, 0.05), '#f8f4ff'), paintG(new THREE.SphereGeometry(0.28, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.4, 1).rotateX(-0.9).translate(0, 0.05, -0.18), '#a8a0b8')]);
}
function paintG(g: THREE.BufferGeometry, col: string): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  const n = ng.getAttribute('position').count;
  const c = new THREE.Color(col);
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  ng.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (!ng.getAttribute('uv')) ng.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return ng;
}
