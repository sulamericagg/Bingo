/* ============================================================
 *  NOITES — geração do bosque (determinística pela semente:
 *  host e convidados geram o MESMO mapa; a rede só manda o que mudou).
 * ============================================================ */
import { BABIES, CAMP_R, WORLD_R, rng, TAU, type Res } from './data';

export const enum TK {
  Round = 0,
  Pine = 1,
  Twisty = 2,
  Birch = 3,
}
export interface Tree {
  x: number;
  z: number;
  k: TK;
  s: number;
  rot: number;
  /** golpes necessários (força 1) */
  hp: number;
}
export const enum NK {
  Rock = 0,
  Bush = 1,
  Grass = 2,
  Shroom = 3,
  Carrot = 4,
  Pumpkin = 5,
  Junk = 6,
  Apple = 7,
  Sap = 8,
}
export interface Node {
  x: number;
  z: number;
  k: NK;
  rot: number;
}
export interface Chest {
  x: number;
  z: number;
  tier: number;
  rot: number;
}
export interface BabySpot {
  x: number;
  z: number;
  col: string;
}

/** o que cada nó dá ao pegar */
export const NODE_GIVES: Record<NK, Partial<Record<Res, number>>> = {
  [NK.Rock]: { stone: 2 },
  [NK.Bush]: { berry: 3, fiber: 1 },
  [NK.Grass]: { fiber: 2 },
  [NK.Shroom]: { mush: 2 },
  [NK.Carrot]: { carrot: 2 },
  [NK.Pumpkin]: { pumpkin: 1 },
  [NK.Junk]: { scrap: 3 },
  [NK.Apple]: { apple: 3 },
  [NK.Sap]: { sap: 1, wood: 1 },
};
/** dias até voltar a dar */
export const NODE_REGROW: Record<NK, number> = {
  [NK.Rock]: 2,
  [NK.Bush]: 1,
  [NK.Grass]: 1,
  [NK.Shroom]: 1,
  [NK.Carrot]: 2,
  [NK.Pumpkin]: 2,
  [NK.Junk]: 3,
  [NK.Apple]: 2,
  [NK.Sap]: 2,
};
export const NODE_R: Record<NK, number> = {
  [NK.Rock]: 0.9,
  [NK.Bush]: 0,
  [NK.Grass]: 0,
  [NK.Shroom]: 0,
  [NK.Carrot]: 0,
  [NK.Pumpkin]: 0,
  [NK.Junk]: 0.7,
  [NK.Apple]: 0.35,
  [NK.Sap]: 0.35,
};

const BABY_COLS = ['#ffc7ee', '#c9ffdc', '#fff6b0', '#bfe8ff', '#ffd2a8', '#e0c8ff', '#ffb3c0', '#c8fff4'];

export class World {
  trees: Tree[] = [];
  nodes: Node[] = [];
  chests: Chest[] = [];
  babies: BabySpot[] = [];
  /** colinas suaves (gaussianas): o chão do bosque não é plano (veículos sobem/descem) */
  hills: { x: number; z: number; h: number; s: number }[] = [];
  /** grade de colisão estática (árvores e nós sólidos) */
  private grid = new Map<number, number[]>();
  static readonly CELL = 4;

  constructor(readonly seed: number) {
    const r = rng(seed);
    const rh = rng(seed ^ 0x5bd1e995);
    for (let i = 0; i < 12; i++) {
      const a = rh() * TAU;
      const d = 34 + rh() * (WORLD_R - 44);
      this.hills.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, h: 1.6 + rh() * 3.4, s: 6 + rh() * 8 });
    }
    const occ = (x: number, z: number, d: number) => this.near(x, z, d);
    // árvores: amostragem com tremor, mais densas longe da fogueira
    const step = 4.6;
    for (let gx = -WORLD_R; gx <= WORLD_R; gx += step) {
      for (let gz = -WORLD_R; gz <= WORLD_R; gz += step) {
        const x = gx + (r() - 0.5) * step * 0.9;
        const z = gz + (r() - 0.5) * step * 0.9;
        const d = Math.hypot(x, z);
        if (d < CAMP_R + 2 || d > WORLD_R - 1) {
          r();
          r();
          r();
          continue;
        }
        const dens = d < 24 ? 0.28 : d < 55 ? 0.5 : 0.66;
        // trilhas: 3 caminhos radiais mais abertos
        const ang = Math.atan2(z, x);
        const trail = Math.min(...[0.4, 2.5, 4.6].map((a) => Math.abs(Math.sin((ang - a) / 2)))) * d < 2.6;
        const p = r();
        const kr = r();
        const sr = r();
        if (trail || p > dens) continue;
        const k: TK = d > 70 && kr < 0.45 ? TK.Twisty : kr < 0.42 ? TK.Pine : kr < 0.82 ? TK.Round : TK.Birch;
        const s = 0.8 + sr * 0.6 + (d > 60 ? 0.2 : 0);
        this.trees.push({ x, z, k, s, rot: sr * TAU, hp: Math.round(3 + s * 3) });
      }
    }
    this.trees.forEach((t, i) => this.addGrid(t.x, t.z, i));
    // nós de recurso
    const place = (k: NK, n: number, rMin: number, rMax: number) => {
      let tries = 0;
      while (n > 0 && tries++ < n * 40) {
        const a = r() * TAU;
        const d = rMin + Math.sqrt(r()) * (rMax - rMin);
        const x = Math.cos(a) * d;
        const z = Math.sin(a) * d;
        if (occ(x, z, 1.6)) continue;
        this.nodes.push({ x, z, k, rot: r() * TAU });
        if (NODE_R[k] > 0) this.addGrid(x, z, -1 - (this.nodes.length - 1));
        n--;
      }
    };
    place(NK.Bush, 40, CAMP_R + 2, 70);
    place(NK.Bush, 30, 50, WORLD_R - 4);
    place(NK.Grass, 70, CAMP_R, WORLD_R - 4);
    place(NK.Rock, 30, CAMP_R + 4, 60);
    place(NK.Rock, 25, 60, WORLD_R - 4);
    place(NK.Shroom, 45, 22, WORLD_R - 4);
    place(NK.Carrot, 22, CAMP_R + 4, 60);
    place(NK.Pumpkin, 18, 45, WORLD_R - 4);
    place(NK.Junk, 14, 30, 70);
    place(NK.Junk, 16, 70, WORLD_R - 4);
    place(NK.Apple, 16, 20, 85);
    place(NK.Sap, 14, 35, WORLD_R - 4);
    // baús: mais valiosos longe
    let tries = 0;
    while (this.chests.length < 26 && tries++ < 2000) {
      const a = r() * TAU;
      const d = 20 + Math.sqrt(r()) * (WORLD_R - 26);
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (occ(x, z, 2)) continue;
      this.chests.push({ x, z, tier: d < 45 ? 0 : d < 80 ? 1 : 2, rot: r() * TAU });
      this.addGrid(x, z, -100000 - (this.chests.length - 1));
    }
    // bebês perdidos: anel crescente, ângulos espalhados
    for (let i = 0; i < BABIES; i++) {
      for (let k = 0; k < 60; k++) {
        const a = i * 2.39996 + r() * 0.6;
        const d = 26 + (i / (BABIES - 1)) * (WORLD_R - 34) + (r() - 0.5) * 6;
        const x = Math.cos(a) * d;
        const z = Math.sin(a) * d;
        if (occ(x, z, 2.2) && k < 59) continue;
        this.babies.push({ x, z, col: BABY_COLS[i % BABY_COLS.length] });
        break;
      }
    }
  }

  /** altura do chão (m) — o acampamento é sempre plano */
  height(x: number, z: number): number {
    const dc = Math.hypot(x, z);
    if (dc < 18) return 0;
    let y = 0;
    for (const h of this.hills) {
      const dx = x - h.x;
      const dz = z - h.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < h.s * h.s * 9) y += h.h * Math.exp(-d2 / (2 * h.s * h.s));
    }
    return dc < 28 ? y * ((dc - 18) / 10) : y;
  }

  private key(cx: number, cz: number): number {
    return (cx + 512) * 4096 + (cz + 512);
  }
  private addGrid(x: number, z: number, i: number): void {
    const k = this.key(Math.floor(x / World.CELL), Math.floor(z / World.CELL));
    let a = this.grid.get(k);
    if (!a) this.grid.set(k, (a = []));
    a.push(i);
  }
  /** chama f para cada colisor (i>=0 árvore, -1-n nó, -100000-n baú) em volta de (x,z) */
  each(x: number, z: number, f: (i: number) => void): void {
    const cx = Math.floor(x / World.CELL);
    const cz = Math.floor(z / World.CELL);
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++) {
        const l = this.grid.get(this.key(cx + a, cz + b));
        if (l) for (const i of l) f(i);
      }
  }
  private near(x: number, z: number, d: number): boolean {
    if (Math.hypot(x, z) < CAMP_R) return true;
    let hit = false;
    this.each(x, z, (i) => {
      const p = i >= 0 ? this.trees[i] : i > -100000 ? this.nodes[-1 - i] : this.chests[-100000 - i];
      if (Math.hypot(p.x - x, p.z - z) < d) hit = true;
    });
    return hit;
  }
}

export const treeR = (t: Tree): number => 0.32 * t.s + 0.1;
