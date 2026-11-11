/* ============================================================
 *  JANGADA BLOOP — ilhas: pequenas, com coqueiros, pedras, arbustos
 *  de frutinha e, em volta, fundo do mar raso com algas, argila,
 *  sucata, conchas e pedras para pegar mergulhando.
 *  Geração determinística pela semente (online: todos iguais).
 * ============================================================ */
import * as THREE from 'three';
import type { Bag } from './data';
import { MAT, bushGeo, initMats, merge, palmGeo, rockGeo, seabedGeo } from './models';

export type NK = 'palm' | 'rock' | 'bush' | 'seaweed' | 'clay' | 'scrap' | 'shell' | 'stone';
export interface INode {
  id: number;
  k: NK;
  x: number;
  z: number;
  y: number;
  hp: number;
  alive: boolean;
  obj?: THREE.Object3D;
}
export const NODE_HP: Record<NK, number> = { palm: 3, rock: 3, bush: 1, seaweed: 1, clay: 1, scrap: 1, shell: 1, stone: 1 };
export const underwaterNode = (k: NK) => k !== 'palm' && k !== 'rock' && k !== 'bush';

function mulberry(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function nodeLoot(k: NK, r: () => number): Bag {
  switch (k) {
    case 'palm':
      return { wood: 3, leaf: 3, ...(r() < 0.6 ? { coco: 1 + (r() < 0.4 ? 1 : 0) } : {}) };
    case 'rock':
      return { stone: 2 + (r() < 0.5 ? 1 : 0) };
    case 'bush':
      return { berry: 2 + (r() < 0.5 ? 1 : 0), ...(r() < 0.45 ? { seed: 1 } : {}) };
    case 'seaweed':
      return { seaweed: 2 };
    case 'clay':
      return { clay: 2 };
    case 'scrap':
      return { scrap: 2 };
    case 'shell':
      return { shell: 1 };
    case 'stone':
      return { stone: 2 };
  }
}

export class Island {
  readonly group = new THREE.Group();
  readonly r: number;
  readonly peak: number;
  nodes: INode[] = [];
  private ph: number[];
  private rnd: () => number;
  constructor(
    readonly seed: number,
    public x: number,
    public z: number,
    tier: number,
  ) {
    initMats();
    this.rnd = mulberry(seed * 9973 + 17);
    const r = this.rnd;
    this.r = 9 + r() * 6;
    this.peak = 2.2 + r() * 1.6;
    this.ph = [r() * 6.28, r() * 6.28, r() * 6.28];
    this.buildGround(tier);
    this.spawnNodes();
    this.group.position.set(x, 0, z);
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
    return -Math.min(9, (f - 1) * this.r * 0.42) - 0.05;
  }
  /** altura no mundo */
  heightAt(wx: number, wz: number): number {
    return this.hLocal(wx - this.x, wz - this.z);
  }
  /** raio total (até o fundo) */
  get outer(): number {
    return this.r * 1.25 + 20;
  }
  private buildGround(tier: number): void {
    const R = tier <= 0 ? 20 : 30;
    const S = tier <= 0 ? 36 : 56;
    const maxR = this.outer;
    const pos: number[] = [];
    const col: number[] = [];
    const c = new THREE.Color();
    const sand = new THREE.Color('#ffe2a8');
    const wet = new THREE.Color('#e8c48a');
    const grass = new THREE.Color('#6ad06a');
    const grass2 = new THREE.Color('#4cb85a');
    const deep = new THREE.Color('#3aa0a8');
    const push = (lx: number, lz: number) => {
      const h = this.hLocal(lx, lz);
      pos.push(lx, h, lz);
      if (h > 0.75) c.copy(grass).lerp(grass2, (Math.sin(lx * 1.3) * Math.cos(lz * 1.1) + 1) / 2);
      else if (h > 0.45) c.copy(sand).lerp(grass, (h - 0.45) / 0.3);
      else if (h > -0.1) c.copy(sand);
      else if (h > -1.2) c.copy(wet).lerp(sand, 0.3);
      else c.copy(wet).lerp(deep, Math.min(1, (-h - 1.2) / 6));
      col.push(c.r, c.g, c.b);
    };
    push(0, 0);
    for (let i = 1; i <= R; i++) {
      const rr = maxR * Math.pow(i / R, 1.4);
      for (let s = 0; s < S; s++) {
        const a = (s / S) * Math.PI * 2;
        push(Math.cos(a) * rr, Math.sin(a) * rr);
      }
    }
    const idx: number[] = [];
    for (let s = 0; s < S; s++) idx.push(0, 1 + ((s + 1) % S), 1 + s);
    for (let i = 1; i < R; i++) {
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
    const m = new THREE.Mesh(g, MAT.vc);
    m.receiveShadow = true;
    this.group.add(m);
  }
  private spawnNodes(): void {
    const r = this.rnd;
    let id = 1;
    const tryPut = (k: NK, n: number, dmin: number, dmax: number, under: boolean) => {
      for (let i = 0, tries = 0; i < n && tries < 80; tries++) {
        const a = r() * Math.PI * 2;
        const d = dmin + r() * (dmax - dmin);
        const lx = Math.cos(a) * d;
        const lz = Math.sin(a) * d;
        const h = this.hLocal(lx, lz);
        if (under ? h > -1.6 : h < 0.6) continue;
        if (this.nodes.some((o) => Math.hypot(o.x - lx, o.z - lz) < (under ? 1.6 : 2.4))) continue;
        this.nodes.push({ id: id++, k, x: lx, z: lz, y: h, hp: NODE_HP[k], alive: true });
        i++;
      }
    };
    const R = this.r;
    tryPut('palm', 3 + Math.floor(r() * 3), 0, R * 0.75, false);
    tryPut('rock', 2 + Math.floor(r() * 2), R * 0.2, R * 0.85, false);
    tryPut('bush', 2 + Math.floor(r() * 2), 0, R * 0.8, false);
    tryPut('seaweed', 5, R * 1.05, R * 1.25 + 14, true);
    tryPut('clay', 3, R * 1.05, R * 1.25 + 14, true);
    tryPut('scrap', 3, R * 1.1, R * 1.25 + 16, true);
    tryPut('shell', 4, R * 1.02, R * 1.25 + 10, true);
    tryPut('stone', 2, R * 1.05, R * 1.25 + 14, true);
    const palmVar = [palmGeo(4.6, 0.8), palmGeo(5.4, 1.2), palmGeo(4.2, 0.5)];
    const rockVar = [rockGeo(0.7), rockGeo(0.95)];
    const bush = bushGeo();
    const sb: Record<string, THREE.BufferGeometry> = {};
    for (const n of this.nodes) {
      let geo: THREE.BufferGeometry;
      if (n.k === 'palm') geo = palmVar[n.id % 3];
      else if (n.k === 'rock') geo = rockVar[n.id % 2];
      else if (n.k === 'bush') geo = bush;
      else geo = sb[n.k] ??= seabedGeo(n.k);
      const m = new THREE.Mesh(geo, MAT.vc);
      m.position.set(n.x, n.y - 0.05, n.z);
      m.rotation.y = r() * Math.PI * 2;
      m.castShadow = n.k === 'palm';
      this.group.add(m);
      n.obj = m;
    }
  }
  /** pegou/derrubou: some (árvore cai antes) */
  kill(n: INode): void {
    n.alive = false;
    const o = n.obj;
    if (!o) return;
    if (n.k === 'palm') {
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
  /** nó mais perto de (wx, wz) num raio */
  nearest(wx: number, wz: number, wy: number, maxD: number, under: boolean | null): INode | null {
    let best: INode | null = null;
    let bd = maxD;
    for (const n of this.nodes) {
      if (!n.alive) continue;
      if (under !== null && underwaterNode(n.k) !== under) continue;
      const d = Math.hypot(n.x + this.x - wx, n.z + this.z - wz, (n.y + (n.k === 'palm' ? 1.2 : 0.3) - wy) * 0.6);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }
  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh && o.geometry && !(o.material === MAT.vc && o.parent !== this.group)) o.geometry.dispose();
    });
    void merge;
  }
}
