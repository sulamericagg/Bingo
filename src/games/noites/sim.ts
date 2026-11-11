/* ============================================================
 *  NOITES — simulação (roda no host / no modo solo).
 *  Sem three nem DOM: o host avança tudo e manda instantâneos;
 *  convidados só aplicam (e movem o próprio boneco).
 * ============================================================ */
import {
  BAG_BASE,
  BENCH_BABIES,
  BENCH_POS,
  BABIES,
  CAMP_R,
  CDEFS,
  CK,
  DAY_LEN,
  GOAL_NIGHTS,
  HEARTS,
  ITEM,
  NIGHT_LEN,
  RAW_FOOD,
  RES,
  WORLD_R,
  clamp,
  nightInfo,
  rng,
  TAU,
  type ItemDef,
  type Res,
  type Slot,
} from './data';
import { NODE_GIVES, NODE_R, NODE_REGROW, NK, World, treeR } from './world';
import { ENERGY_PER, Vehicles, stats, validDesign, type VDesign } from './vehicles';
import { BuildState, type BuildAction } from './build/state'; // BUILD

export type Bag = Partial<Record<Res, number>>;
export type BotCmd = 'follow' | 'stay' | 'wood' | 'guard';

export interface Player {
  id: string;
  name: string;
  skin: string;
  hat: string;
  bot: boolean;
  x: number;
  z: number;
  yaw: number;
  /** direção da lanterna */
  aim: number;
  hearts: number;
  hunger: number;
  warmth: number;
  bag: Bag;
  axe: number;
  bonk: number;
  lampId: string;
  wear: Partial<Record<Slot, string>>;
  inv: Record<string, number>;
  lightOn: boolean;
  faint: number;
  invT: number;
  starveT: number;
  /** bebê carregado (índice) ou -1 */
  carry: number;
  /** animação de golpe (s restantes) */
  swing: number;
  /** veículo onde está sentado (-1 = a pé) */
  seat: number;
  // ajudante
  cmd: BotCmd;
  next: BotCmd | null;
  delay: number;
  tgt: number;
  actT: number;
}

export interface Creature {
  id: number;
  k: CK;
  x: number;
  z: number;
  hp: number;
  max: number;
  /** iluminada agora (tremendo) */
  lit: number;
  /** sugando a luz da fogueira */
  drain: number;
  vx: number;
  vz: number;
  t: number;
  summonT: number;
}

export interface Struct {
  id: number;
  k: string;
  x: number;
  z: number;
  r: number;
  hp: number;
  /** tocha: segundos de queima restantes */
  burn: number;
  /** processadores: entrada, saída, cronômetro / horta: pronta (1) */
  a: number;
  b: number;
  t: number;
}

export interface Flash {
  id: number;
  x: number;
  z: number;
  r: number;
  t: number;
  dmg: number;
  k: string;
}

export interface Ev {
  s: number;
  k: string;
  x?: number;
  z?: number;
  p?: string;
  i?: string;
  n?: number;
}

export interface Baby {
  st: 0 | 1 | 2;
  x: number;
  z: number;
  by: string;
}

export interface Fire {
  fuel: number;
  max: number;
  ring: boolean;
  bellows: boolean;
  big: boolean;
  outT: number;
}

export type Action =
  | { a: 'hit'; i: number }
  | { a: 'take'; i: number }
  | { a: 'chest'; i: number }
  | { a: 'baby'; i: number }
  | { a: 'feed' }
  | { a: 'craft'; id: string }
  | { a: 'eat'; id: string }
  | { a: 'use'; id: string; x: number; z: number; r: number }
  | { a: 'bonk'; yaw: number }
  | { a: 'proc'; s: number }
  | { a: 'cmd'; c: BotCmd }
  | { a: 'pick'; s: number }
  | { a: 'vbuild'; d: VDesign }
  | { a: 'venter'; v: number }
  | { a: 'vexit' }
  | { a: 'vload'; v: number }
  | { a: 'vfuel'; v: number }
  | { a: 'vstore'; v: number }
  | BuildAction; // BUILD

export interface VehView {
  id: number;
  dk: string;
  x: number;
  y: number;
  z: number;
  q: [number, number, number, number];
  fuel: number;
  driver: string;
  riders: string[];
  spin: number;
  steer: number;
  logs: number[];
  speed: number;
}

export interface LightSrc {
  x: number;
  z: number;
  r: number;
}

const WOOD_FUEL = 10;
const CHEST_LOOT: Bag[][] = [
  [{ scrap: 2, fiber: 2 }, { scrap: 1, spark: 1, berry: 2 }, { wood: 3, scrap: 2 }, { apple: 2, scrap: 1 }],
  [{ scrap: 3, spark: 2 }, { scrap: 4, fiber: 3 }, { spark: 3, mush: 2 }, { scrap: 2, spark: 2, sap: 1 }],
  [{ scrap: 5, spark: 4 }, { spark: 6, sap: 1 }, { scrap: 6, spark: 3, pumpkin: 1 }],
];
const CHEST_ITEMS = [
  ['torch', 'flare'],
  ['flare', 'torch', 'heal'],
  ['flare2', 'orb', 'heal'],
];

export function bagCount(b: Bag): number {
  let n = 0;
  for (const k in b) n += b[k as Res] ?? 0;
  return n;
}

export class Sim {
  w: World;
  players: Player[] = [];
  creatures: Creature[] = [];
  structs: Struct[] = [];
  flashes: Flash[] = [];
  babies: Baby[];
  fire: Fire = { fuel: 70, max: 100, ring: false, bellows: false, big: false, outT: 0 };
  stash: Bag = { wood: 6, berry: 4 };
  bench = 1;
  compass = false;
  /** noite atual (1 = primeira) */
  night = 1;
  phase: 'day' | 'night' = 'day';
  clock = 0;
  survived = 0;
  rescued = 0;
  poofs = 0;
  over = false;
  won = false;
  /** dia em que cada árvore volta (0 = em pé) */
  treeT: Int16Array;
  /** golpes já levados (por árvore) */
  treeHit = new Map<number, number>();
  nodeT: Int16Array;
  chestOpen: Uint8Array;
  /** versões (rede: manda listas grandes só quando mudam) */
  verTrees = 0;
  verStruct = 0;
  verChest = 0;
  events: Ev[] = [];
  private evSeq = 0;
  private nextId = 1;
  private spawnT = 3;
  private bossDone = false;
  private bellT = 0;
  private r = rng(1234567);
  time = 0;
  /** hook: veículos (opcional) */
  vehLights: (() => LightSrc[]) | null = null;
  /** veículos (só no host; criado no primeiro veículo) */
  veh: Vehicles | null = null;
  /** espelho dos veículos para convidados/vista */
  vehView: VehView[] = [];
  looseView: { id: number; x: number; z: number }[] = [];
  designs = new Map<string, VDesign>();
  verVeh = 0;
  /** nível de qualidade do host (limita toras físicas) */
  logCap = 40;
  /** construção em grade (cercas, muros, portões...) — src/games/noites/build */
  build: BuildState = new BuildState(this); // BUILD

  constructor(readonly seed: number) {
    this.w = new World(seed);
    this.treeT = new Int16Array(this.w.trees.length);
    this.nodeT = new Int16Array(this.w.nodes.length);
    this.chestOpen = new Uint8Array(this.w.chests.length);
    this.babies = this.w.babies.map((b) => ({ st: 0, x: b.x, z: b.z, by: '' }));
    this.clock = 0;
  }

  /* ------------------------------ jogadores ------------------------------ */
  addPlayer(id: string, name: string, skin: string, hat: string, bot = false): Player {
    let p = this.players.find((q) => q.id === id);
    if (p) return p;
    const a = this.players.length * 1.6 + 0.6;
    p = {
      id,
      name,
      skin,
      hat,
      bot,
      x: Math.cos(a) * 5,
      z: Math.sin(a) * 5,
      yaw: a + Math.PI,
      aim: a + Math.PI,
      hearts: HEARTS,
      hunger: 85,
      warmth: 100,
      bag: {},
      axe: 1,
      bonk: 0,
      lampId: 'lamp1',
      wear: {},
      inv: bot ? {} : { torch: 1 },
      lightOn: false,
      faint: 0,
      invT: 0,
      starveT: 0,
      carry: -1,
      swing: 0,
      seat: -1,
      cmd: 'follow',
      next: null,
      delay: 0,
      tgt: -1,
      actT: 0,
    };
    if (bot) {
      p.axe = 2;
      p.lampId = 'lamp2';
    }
    this.players.push(p);
    return p;
  }
  removePlayer(id: string): void {
    const p = this.players.find((q) => q.id === id);
    if (!p) return;
    if (p.carry >= 0) this.dropBaby(p);
    if (p.seat >= 0) this.veh?.exit(p);
    // o que estava no saco vai para o estoque (ninguém perde nada por cair a conexão)
    for (const k in p.bag) this.addStash(k as Res, p.bag[k as Res] ?? 0);
    this.players = this.players.filter((q) => q !== p);
  }
  player(id: string): Player | undefined {
    return this.players.find((p) => p.id === id);
  }
  cap(p: Player): number {
    const b = p.wear.back;
    return b ? ITEM[b].wear!.cap! : BAG_BASE;
  }
  lamp(p: Player): [number, number, number] {
    return ITEM[p.lampId]?.lamp ?? [10, 1.4, 0.38];
  }

  /* ------------------------------ eventos ------------------------------ */
  ev(k: string, o: Omit<Ev, 's' | 'k'> = {}): void {
    this.events.push({ s: ++this.evSeq, k, ...o });
    if (this.events.length > 60) this.events.splice(0, this.events.length - 60);
  }
  get evHead(): number {
    return this.evSeq;
  }
  private addStash(k: Res, n: number): void {
    if (n > 0) this.stash[k] = (this.stash[k] ?? 0) + n;
  }

  /* ------------------------------ fogueira / luz ------------------------------ */
  fireR(): number {
    const f = this.fire;
    if (f.fuel <= 0) return 0;
    const maxR = 15 + (f.bellows ? 4 : 0) + (f.big ? 5 : 0);
    return 3 + (maxR - 3) * Math.sqrt(f.fuel / f.max);
  }
  /** fontes de luz que espantam Sombrinhas (fogueira, construções, sinalizadores, roupas) */
  lights(): LightSrc[] {
    const out: LightSrc[] = [];
    const fr = this.fireR();
    if (fr > 0) out.push({ x: 0, z: 0, r: fr });
    for (const s of this.structs) {
      const d = ITEM[s.k]?.place;
      if (!d?.light) continue;
      if (d.burn && s.burn <= 0) continue;
      out.push({ x: s.x, z: s.z, r: d.light });
    }
    for (const f of this.flashes) out.push({ x: f.x, z: f.z, r: f.r });
    for (const p of this.players) {
      if (p.faint > 0) continue;
      const g = p.wear.cape ? ITEM[p.wear.cape].wear!.glow ?? 0 : 0;
      if (g) out.push({ x: p.x, z: p.z, r: g });
    }
    if (this.vehLights) out.push(...this.vehLights());
    this.build.lights(out); // BUILD
    return out;
  }
  /** 0..1: quão iluminado está o ponto (0 = escuro) */
  litAt(x: number, z: number, L = this.lights()): number {
    let m = 0;
    for (const l of L) {
      const d = Math.hypot(l.x - x, l.z - z);
      if (d < l.r) m = Math.max(m, 1 - d / l.r + 0.05);
    }
    return Math.min(1, m);
  }
  get dark(): boolean {
    return this.phase === 'night';
  }

  /* ------------------------------ colisão ------------------------------ */
  /** empurra o círculo (x,z,r) para fora de árvores, pedras, baús e construções sólidas */
  collide(x: number, z: number, r: number): [number, number] {
    const w = this.w;
    for (let it = 0; it < 2; it++) {
      w.each(x, z, (i) => {
        let ox: number, oz: number, rr: number;
        if (i >= 0) {
          if (this.treeT[i]) return;
          const t = w.trees[i];
          ox = t.x;
          oz = t.z;
          rr = treeR(t);
        } else if (i > -100000) {
          const n = w.nodes[-1 - i];
          ox = n.x;
          oz = n.z;
          rr = NODE_R[n.k];
        } else {
          const c = w.chests[-100000 - i];
          ox = c.x;
          oz = c.z;
          rr = 0.6;
        }
        const dx = x - ox;
        const dz = z - oz;
        const d = Math.hypot(dx, dz);
        const m = rr + r;
        if (d < m && d > 1e-4) {
          x = ox + (dx / d) * m;
          z = oz + (dz / d) * m;
        }
      });
      for (const s of this.structs) {
        const d0 = ITEM[s.k]?.place;
        if (!d0 || d0.kind === 'torch' || d0.kind === 'glowshroom' || d0.kind === 'trap' || d0.kind === 'bedroll') continue;
        if (d0.kind === 'fence') {
          // segmento ao longo de r
          const ca = Math.cos(s.r);
          const sa = Math.sin(s.r);
          const lx = (x - s.x) * ca + (z - s.z) * sa;
          const lz = -(x - s.x) * sa + (z - s.z) * ca;
          const hx = 0.85;
          if (Math.abs(lx) < hx + r && Math.abs(lz) < 0.12 + r) {
            const pz = lz >= 0 ? 0.12 + r : -0.12 - r;
            x = s.x + lx * ca - pz * sa;
            z = s.z + lx * sa + pz * ca;
          }
          continue;
        }
        const rr = (d0.size ?? 0.5) * 0.6;
        const dx = x - s.x;
        const dz = z - s.z;
        const d = Math.hypot(dx, dz);
        if (d < rr + r && d > 1e-4) {
          x = s.x + (dx / d) * (rr + r);
          z = s.z + (dz / d) * (rr + r);
        }
      }
      // fogueira e bancada
      const fd = Math.hypot(x, z);
      if (fd < 1.1 + r && fd > 1e-4) {
        x = (x / fd) * (1.1 + r);
        z = (z / fd) * (1.1 + r);
      }
      const bx = x - BENCH_POS[0];
      const bz = z - BENCH_POS[1];
      const bd = Math.hypot(bx, bz);
      if (bd < 0.9 + r && bd > 1e-4) {
        x = BENCH_POS[0] + (bx / bd) * (0.9 + r);
        z = BENCH_POS[1] + (bz / bd) * (0.9 + r);
      }
    }
    if (this.veh) [x, z] = this.veh.collide(x, z, r);
    [x, z] = this.build.collide(x, z, r); // BUILD
    const d = Math.hypot(x, z);
    if (d > WORLD_R - 1) {
      x = (x / d) * (WORLD_R - 1);
      z = (z / d) * (WORLD_R - 1);
    }
    return [x, z];
  }

  /* ------------------------------ ações ------------------------------ */
  act(pid: string, A: Action): void {
    const p = this.player(pid);
    if (!p || this.over) return;
    if (p.faint > 0 && A.a !== 'cmd') return;
    switch (A.a) {
      case 'hit':
        return this.hitTree(p, A.i);
      case 'take':
        return this.takeNode(p, A.i);
      case 'chest':
        return this.openChest(p, A.i);
      case 'baby':
        return this.pickBaby(p, A.i);
      case 'feed':
        return this.feed(p);
      case 'craft':
        return this.craft(p, A.id);
      case 'eat':
        return this.eat(p, A.id);
      case 'use':
        return this.use(p, A.id, A.x, A.z, A.r);
      case 'bonk':
        return this.doBonk(p, A.yaw);
      case 'proc':
        return this.proc(p, A.s);
      case 'pick':
        return this.pickUp(p, A.s);
      case 'vbuild':
        return this.vBuild(p, A.d);
      case 'venter': {
        const v = this.veh?.get(A.v);
        if (!v || p.seat >= 0 || Math.hypot(v.x - p.x, v.z - p.z) > v.st.lt / 2 + 3) return;
        if (p.carry >= 0) return void this.ev('need', { p: p.id, i: 'carry' });
        if (this.veh!.enter(p, v)) this.ev('venter', { p: p.id, n: v.id });
        else this.ev('need', { p: p.id, i: 'seat' });
        return;
      }
      case 'vexit':
        if (p.seat >= 0) this.veh?.exit(p);
        return;
      case 'vload': {
        const v = this.veh?.get(A.v);
        if (!v || Math.hypot(v.x - p.x, v.z - p.z) > v.st.lt / 2 + 3) return;
        const n = this.veh!.addLogs(v, p.bag.wood ?? 0);
        if (n) {
          p.bag.wood = (p.bag.wood ?? 0) - n;
          this.ev('vload', { p: p.id, n, x: v.x, z: v.z });
        } else this.ev('need', { p: p.id, i: 'space' });
        return;
      }
      case 'vfuel':
        return this.vFuel(p, A.v);
      case 'vstore': {
        const v = this.veh?.get(A.v);
        if (!v || v.driver || !this.nearGarage(v.x, v.z, 8)) return;
        this.veh!.remove(v);
        this.verVeh++;
        this.ev('vstore', { p: p.id, x: v.x, z: v.z });
        return;
      }
      case 'build': // BUILD
        return this.build.act(p, A);
      case 'cmd':
        for (const b of this.players) if (b.bot) b.next = A.c;
        for (const b of this.players) if (b.bot) (b.delay = 0.6 + this.r() * 0.6), this.ev('think', { p: b.id, i: A.c });
        return;
    }
  }

  private bagAdd(p: Player, g: Bag): boolean {
    const cap = this.cap(p);
    let full = false;
    for (const k in g) {
      const r = k as Res;
      let n = g[r] ?? 0;
      const room = cap - bagCount(p.bag);
      if (n > room) {
        // o que não cabe vai direto para o estoque (sem frustração), mas avisa
        this.addStash(r, n - room);
        n = room;
        full = true;
      }
      if (n > 0) p.bag[r] = (p.bag[r] ?? 0) + n;
    }
    if (full) this.ev('bagfull', { p: p.id });
    return full;
  }

  hitTree(p: Player, i: number): void {
    const t = this.w.trees[i];
    if (!t || this.treeT[i]) return;
    if (Math.hypot(t.x - p.x, t.z - p.z) > 3.4) return;
    p.swing = 0.35;
    const h = (this.treeHit.get(i) ?? 0) + p.axe;
    this.ev('chop', { x: t.x, z: t.z, p: p.id, n: i });
    if (h < t.hp) {
      this.treeHit.set(i, h);
      return;
    }
    this.treeHit.delete(i);
    this.treeT[i] = this.night + 2;
    this.verTrees++;
    const g: Bag = { wood: Math.round(2 + t.s * 2) };
    if (t.k === 0 && this.r() < 0.4) g.apple = 1;
    if (t.k === 1 && this.r() < 0.3) g.sap = 1;
    // veículo com caçamba por perto: as toras vão para ela (guincho alcança mais longe)
    const V = this.veh;
    if (V) {
      for (const v of V.list) {
        if (!v.st.cap || v.logs.length >= v.st.cap) continue;
        if (Math.hypot(v.x - t.x, v.z - t.z) > (v.d.winch ? 15 : 8)) continue;
        const n = V.addLogs(v, g.wood ?? 0);
        if (n) {
          g.wood = (g.wood ?? 0) - n;
          this.ev('vlog', { x: t.x, z: t.z, n, p: p.id, i: v.d.winch ? 'winch' : '' });
        }
        break;
      }
    }
    this.bagAdd(p, g);
    this.ev('fell', { x: t.x, z: t.z, p: p.id, n: i, i: 'wood' });
  }
  takeNode(p: Player, i: number): void {
    const n = this.w.nodes[i];
    if (!n || this.nodeT[i]) return;
    if (Math.hypot(n.x - p.x, n.z - p.z) > 3) return;
    this.nodeT[i] = this.night + NODE_REGROW[n.k];
    this.verTrees++;
    const g = { ...NODE_GIVES[n.k] };
    if (n.k === NK.Junk && this.r() < 0.35) g.spark = 1;
    this.bagAdd(p, g);
    p.swing = 0.25;
    this.ev('take', { x: n.x, z: n.z, p: p.id, n: n.k, i: Object.keys(g)[0] });
  }
  openChest(p: Player, i: number): void {
    const c = this.w.chests[i];
    if (!c || this.chestOpen[i]) return;
    if (Math.hypot(c.x - p.x, c.z - p.z) > 3) return;
    this.chestOpen[i] = 1;
    this.verChest++;
    const pool = CHEST_LOOT[c.tier];
    const loot = { ...pool[Math.floor(this.r() * pool.length)] };
    if (this.r() < 0.6) loot.spark = (loot.spark ?? 0) + 1;
    // loot do baú não respeita o limite do saco
    for (const k in loot) p.bag[k as Res] = (p.bag[k as Res] ?? 0) + (loot[k as Res] ?? 0);
    const items = CHEST_ITEMS[c.tier];
    const it = items[Math.floor(this.r() * items.length)];
    p.inv[it] = (p.inv[it] ?? 0) + 1;
    this.ev('chest', { x: c.x, z: c.z, p: p.id, i: it, n: i });
  }
  pickBaby(p: Player, i: number): void {
    const b = this.babies[i];
    if (!b || b.st !== 0 || p.carry >= 0) return;
    if (Math.hypot(b.x - p.x, b.z - p.z) > 3) return;
    b.st = 1;
    b.by = p.id;
    p.carry = i;
    this.ev('pickbaby', { x: b.x, z: b.z, p: p.id, n: i });
  }
  private dropBaby(p: Player): void {
    const i = p.carry;
    if (i < 0) return;
    const b = this.babies[i];
    b.st = 0;
    b.by = '';
    b.x = this.w.babies[i].x;
    b.z = this.w.babies[i].z;
    p.carry = -1;
    this.ev('babylost', { p: p.id, n: i });
  }
  feed(p: Player): void {
    if (Math.hypot(p.x, p.z) > 4.2) return;
    if (this.fire.fuel >= this.fire.max - 1) return void this.ev('firefull', { p: p.id });
    if ((p.bag.wood ?? 0) > 0) p.bag.wood!--;
    else if ((this.stash.wood ?? 0) > 0) this.stash.wood!--;
    else return void this.ev('need', { p: p.id, i: 'wood' });
    this.fire.fuel = Math.min(this.fire.max, this.fire.fuel + WOOD_FUEL);
    this.fire.outT = 0;
    this.ev('feed', { x: 0, z: 0, p: p.id });
  }
  hasPot(): boolean {
    return this.structs.some((s) => s.k === 'pot');
  }
  /** motivo de não poder fazer (ou null) */
  craftBlock(d: ItemDef): 'tier' | 'res' | 'pot' | 'have' | null {
    if (d.tier > this.bench) return 'tier';
    if (d.camp === 'bench' && (d.benchTo ?? 0) <= this.bench) return 'have';
    if (d.camp === 'ring' && this.fire.ring) return 'have';
    if (d.camp === 'bellows' && this.fire.bellows) return 'have';
    if (d.camp === 'bigfire' && this.fire.big) return 'have';
    if (d.camp === 'compass' && this.compass) return 'have';
    if (d.pot && !this.hasPot()) return 'pot';
    for (const k in d.cost) if ((this.stash[k as Res] ?? 0) < (d.cost[k as Res] ?? 0)) return 'res';
    return null;
  }
  benchLocked(level: number): boolean {
    return this.rescued < BENCH_BABIES[level];
  }
  craft(p: Player, id: string): void {
    const d = ITEM[id];
    if (!d) return;
    if (Math.hypot(p.x - BENCH_POS[0], p.z - BENCH_POS[1]) > 5 && !this.build.benchNear(p.x, p.z, 5)) return; // BUILD: bancada extra
    const why = this.craftBlock(d);
    if (why) return void this.ev('need', { p: p.id, i: why === 'res' ? Object.keys(d.cost).find((k) => (this.stash[k as Res] ?? 0) < (d.cost[k as Res] ?? 0)) : why });
    if (d.camp === 'bench' && this.benchLocked(d.benchTo!)) return void this.ev('need', { p: p.id, i: 'baby' });
    for (const k in d.cost) this.stash[k as Res]! -= d.cost[k as Res] ?? 0;
    const q = d.qty ?? 1;
    if (d.axe) p.axe = Math.max(p.axe, d.axe);
    else if (d.bonk) p.bonk = Math.max(p.bonk, d.bonk);
    else if (d.lamp) p.lampId = d.id;
    else if (d.wear) p.wear[d.wear.slot] = d.id;
    else if (d.camp === 'bench') this.bench = d.benchTo!;
    else if (d.camp === 'ring') this.fire.ring = true;
    else if (d.camp === 'bellows') this.fire.bellows = true;
    else if (d.camp === 'bigfire') (this.fire.big = true), (this.fire.max = 160);
    else if (d.camp === 'compass') this.compass = true;
    else p.inv[id] = (p.inv[id] ?? 0) + q;
    this.ev('craft', { p: p.id, i: id, x: BENCH_POS[0], z: BENCH_POS[1] });
  }
  eat(p: Player, id: string): void {
    const raw = RAW_FOOD[id as Res];
    let f: { hunger: number; warmth?: number; hearts?: number } | undefined;
    if (raw) {
      if ((p.bag[id as Res] ?? 0) > 0) p.bag[id as Res]!--;
      else if ((this.stash[id as Res] ?? 0) > 0 && Math.hypot(p.x, p.z) < CAMP_R + 4) this.stash[id as Res]!--;
      else return;
      f = { hunger: raw };
    } else {
      const d = ITEM[id];
      if (!d?.food || !(p.inv[id] > 0)) return;
      p.inv[id]--;
      if (!p.inv[id]) delete p.inv[id];
      f = d.food;
    }
    p.hunger = Math.min(100, p.hunger + f.hunger);
    p.warmth = Math.min(100, p.warmth + (f.warmth ?? 0));
    p.hearts = Math.min(HEARTS, p.hearts + (f.hearts ?? 0));
    this.ev('eat', { p: p.id, x: p.x, z: p.z, i: id });
  }
  use(p: Player, id: string, x: number, z: number, r: number): void {
    const d = ITEM[id];
    if (!d || !(p.inv[id] > 0)) return;
    if (d.food) return this.eat(p, id);
    if (Math.hypot(x - p.x, z - p.z) > 14) return;
    if (d.throwLight) {
      const L = d.throwLight;
      this.flashes.push({ id: this.nextId++, x, z, r: L.r, t: L.t, dmg: L.dmg, k: id });
      this.ev('flare', { x, z, p: p.id, i: id });
    } else if (d.place) {
      if (Math.hypot(x, z) < 1.6 || Math.hypot(x - BENCH_POS[0], z - BENCH_POS[1]) < 1.4) return void this.ev('need', { p: p.id, i: 'space' });
      this.structs.push({ id: this.nextId++, k: id, x, z, r, hp: d.place.hp ?? 10, burn: d.place.burn ?? 0, a: d.place.kind === 'trap' ? 3 : 0, b: 0, t: 0 });
      this.verStruct++;
      this.ev('place', { x, z, p: p.id, i: id });
    } else return;
    p.inv[id]--;
    if (!p.inv[id]) delete p.inv[id];
  }
  /** pegar de volta uma construção (tocha apagada, cerca no lugar errado...) */
  pickUp(p: Player, sid: number): void {
    const s = this.structs.find((q) => q.id === sid);
    if (!s || Math.hypot(s.x - p.x, s.z - p.z) > 3.5) return;
    this.structs = this.structs.filter((q) => q !== s);
    this.verStruct++;
    const d = ITEM[s.k]?.place;
    if (!(d?.burn && s.burn <= 0)) p.inv[s.k] = (p.inv[s.k] ?? 0) + 1;
    this.ev('pick', { x: s.x, z: s.z, p: p.id, i: s.k });
  }
  doBonk(p: Player, yaw: number): void {
    if (p.swing > 0.05) return;
    p.swing = 0.4;
    p.yaw = yaw;
    const dmg = 1 + p.bonk * 1.5;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    let hit = false;
    for (const c of this.creatures) {
      const dx = c.x - p.x;
      const dz = c.z - p.z;
      const d = Math.hypot(dx, dz);
      const reach = 2.2 + CDEFS[c.k].size * 0.5;
      if (d < reach && (dx * fx + dz * fz) / (d || 1) > 0.2) {
        c.hp -= c.k === CK.King ? dmg * 0.5 : dmg;
        c.vx += (dx / (d || 1)) * 7;
        c.vz += (dz / (d || 1)) * 7;
        c.lit = 0.4;
        hit = true;
      }
    }
    this.ev(hit ? 'bonk' : 'swish', { x: p.x + fx * 1.5, z: p.z + fz * 1.5, p: p.id });
  }
  /** processadores (forno, destilador, baterias, painel) e hortas */
  proc(p: Player, sid: number): void {
    const s = this.structs.find((q) => q.id === sid);
    if (!s || Math.hypot(s.x - p.x, s.z - p.z) > 3.5) return;
    const kind = ITEM[s.k]?.place?.kind;
    if (kind === 'garden' || kind === 'berrybed') {
      if (!s.a) return void this.ev('need', { p: p.id, i: 'grow' });
      s.a = 0;
      this.bagAdd(p, kind === 'garden' ? { carrot: 3 } : { berry: 4 });
      this.verStruct++;
      this.ev('take', { x: s.x, z: s.z, p: p.id, i: kind === 'garden' ? 'carrot' : 'berry' });
      return;
    }
    const out: Res = kind === 'kiln' ? 'coal' : kind === 'still' ? 'fuel' : 'battery';
    let got = 0;
    if (s.b > 0) {
      got = s.b;
      this.addStash(out, s.b);
      s.b = 0;
    }
    // carrega entrada do estoque (até 5)
    const take = (k: Res, n: number) => {
      const have = (this.stash[k] ?? 0) + (p.bag[k] ?? 0);
      if (have < n) return false;
      for (let i = 0; i < n; i++) {
        if ((p.bag[k] ?? 0) > 0) p.bag[k]!--;
        else this.stash[k]!--;
      }
      return true;
    };
    let loaded = 0;
    while (s.a < 5) {
      const ok = kind === 'kiln' ? take('wood', 2) : kind === 'still' ? take('sap', 1) || take('berry', 3) : kind === 'charger' ? take('scrap', 2) && (take('spark', 1) || (this.addStash('scrap', 2), false)) : false;
      if (!ok) break;
      s.a++;
      loaded++;
    }
    this.verStruct++;
    this.ev(got ? 'collect' : loaded ? 'load' : 'need', { x: s.x, z: s.z, p: p.id, i: got ? out : loaded ? s.k : kind === 'kiln' ? 'wood' : kind === 'still' ? 'sap' : kind === 'charger' ? 'scrap' : 'sun', n: got });
  }

  /* ------------------------------ veículos ------------------------------ */
  ensureVeh(): Vehicles {
    if (!this.veh) {
      this.veh = new Vehicles(this);
      this.veh.maxLogs = this.logCap;
      this.vehLights = () => this.veh!.lights();
    }
    return this.veh;
  }
  nearGarage(x: number, z: number, d = 6): { x: number; z: number; r: number } | null {
    return this.structs.find((q) => q.k === 'garage' && Math.hypot(q.x - x, q.z - z) < d) ?? null;
  }
  vBuild(p: Player, d0: VDesign): void {
    const d = validDesign(d0);
    if (!d) return;
    const g = this.nearGarage(p.x, p.z);
    if (!g) return void this.ev('need', { p: p.id, i: 'garage' });
    const st = stats(d);
    if (this.bench < st.bench) return void this.ev('need', { p: p.id, i: 'tier' });
    if ((this.veh?.list.length ?? 0) >= 6) return void this.ev('need', { p: p.id, i: 'space' });
    for (const k in st.cost) if ((this.stash[k as Res] ?? 0) < (st.cost[k as Res] ?? 0)) return void this.ev('need', { p: p.id, i: k });
    for (const k in st.cost) this.stash[k as Res]! -= st.cost[k as Res] ?? 0;
    const V = this.ensureVeh();
    const dl = Math.hypot(g.x, g.z) || 1;
    const k = dl > 9 ? -4.5 : 4.5;
    const x = g.x + (g.x / dl) * k;
    const z = g.z + (g.z / dl) * k;
    this.designs.set(d.id + '@' + p.id, d);
    const v = V.spawn(d, x, z, Math.atan2(g.x, g.z) + Math.PI / 2, p.id);
    v.d = d;
    this.verVeh++;
    this.ev('vbuild', { p: p.id, x, z, n: v.id, i: d.id });
  }
  vFuel(p: Player, vid: number): void {
    const v = this.veh?.get(vid);
    if (!v || Math.hypot(v.x - p.x, v.z - p.z) > v.st.lt / 2 + 3) return;
    const e = v.st.energy;
    if (!e) return void this.ev('need', { p: p.id, i: 'have' });
    if (Math.hypot(v.x, v.z) > CAMP_R + 8 && !this.nearGarage(v.x, v.z, 10)) return void this.ev('need', { p: p.id, i: 'camp' });
    const per = ENERGY_PER[e] ?? 15;
    let n = 0;
    while (v.fuel + per <= v.st.fuelCap + per * 0.5 && v.fuel < v.st.fuelCap) {
      if ((p.bag[e] ?? 0) > 0) p.bag[e]!--;
      else if ((this.stash[e] ?? 0) > 0) this.stash[e]!--;
      else break;
      v.fuel = Math.min(v.st.fuelCap, v.fuel + per);
      n++;
    }
    this.ev(n ? 'vfuel' : 'need', { p: p.id, i: n ? e : e, n, x: v.x, z: v.z });
  }
  /** motorista manda acelerador/direção */
  drive(pid: string, thr: number, steer: number): void {
    const p = this.player(pid);
    const v = p && p.seat >= 0 ? this.veh?.get(p.seat) : undefined;
    if (!v || v.driver !== pid) return;
    v.thr = clamp(+thr || 0, -1, 1);
    v.steer = clamp(+steer || 0, -1, 1);
  }
  private stepVeh(dt: number): void {
    const V = this.veh;
    if (!V) return;
    const evf = (k: string, o: Record<string, unknown>) => {
      if (k === 'unload') this.addStash('wood', o.n as number);
      this.ev(k, o as Omit<Ev, 's' | 'k'>);
    };
    V.step(dt, evf);
    V.bump(evf);
    for (const p of this.players) {
      if (p.seat < 0) continue;
      const v = V.get(p.seat);
      if (!v) {
        p.seat = -1;
        continue;
      }
      const i = v.driver === p.id ? 0 : 1 + v.riders.indexOf(p.id);
      const [x, , z] = V.seatPos(v, i);
      p.x = x;
      p.z = z;
      p.yaw = p.aim = V.yaw(v);
    }
    // toras soltas: pega sozinho ao passar perto
    if (V.loose.length) {
      for (const p of this.players) {
        if (p.faint > 0 || p.seat >= 0) continue;
        for (const l of V.loose)
          if (Math.hypot(l.x - p.x, l.z - p.z) < 1.4) {
            l.id = -1;
            p.bag.wood = (p.bag.wood ?? 0) + 1;
            this.ev('take', { x: l.x, z: l.z, p: p.id, i: 'wood' });
          }
      }
      if (V.loose.some((l) => l.id < 0)) {
        V.loose = V.loose.filter((l) => l.id >= 0);
        V.ver++;
      }
    }
    this.mirrorVeh();
  }
  /** monta a lista leve (rede + vista) a partir da física */
  mirrorVeh(): void {
    const V = this.veh;
    if (!V) return;
    this.vehView = V.list.map((v) => ({
      id: v.id,
      dk: v.d.id + '@' + v.owner,
      x: v.x,
      y: v.y,
      z: v.z,
      q: v.q,
      fuel: v.fuel,
      driver: v.driver,
      riders: v.riders,
      spin: v.spin,
      steer: v.steer,
      speed: v.speed,
      logs: v.logs.flatMap((l) => [l.position.x, l.position.y, l.position.z, l.quaternion.x, l.quaternion.y, l.quaternion.z, l.quaternion.w]),
    }));
    for (const v of V.list) this.designs.set(v.d.id + '@' + v.owner, v.d);
    this.looseView = V.loose;
    if (V.ver !== this.verVeh) this.verVeh = V.ver;
  }

  /* ------------------------------ passo ------------------------------ */
  step(dt: number): void {
    if (this.over) return;
    this.time += dt;
    this.clock += dt;
    const len = this.phase === 'day' ? DAY_LEN : NIGHT_LEN;
    if (this.clock >= len) {
      this.clock = 0;
      if (this.phase === 'day') this.toNight();
      else this.toDay();
    }
    this.stepFire(dt);
    const L = this.lights();
    this.stepPlayers(dt, L);
    this.stepBabies(dt);
    this.stepCreatures(dt, L);
    this.stepStructs(dt);
    this.build.step(dt); // BUILD
    this.stepVeh(dt);
    for (const f of this.flashes) f.t -= dt;
    if (this.flashes.some((f) => f.t <= 0)) this.flashes = this.flashes.filter((f) => f.t > 0);
  }

  private toNight(): void {
    this.phase = 'night';
    this.spawnT = 4;
    this.bossDone = false;
    const ni = nightInfo(this.night);
    this.ev('night', { n: this.night, i: ni.boss ? 'boss' : ni.fog ? 'fog' : ni.moon ? 'moon' : '' });
  }
  private toDay(): void {
    this.phase = 'day';
    for (const c of this.creatures) this.ev('poof', { x: c.x, z: c.z, n: c.k });
    this.creatures = [];
    this.survived = this.night;
    this.night++;
    // recompensa da manhã: brilhinhos no estoque
    this.addStash('spark', 1 + Math.floor(this.survived / 3));
    // rebrota
    for (let i = 0; i < this.treeT.length; i++) if (this.treeT[i] && this.treeT[i] <= this.night) this.treeT[i] = 0;
    for (let i = 0; i < this.nodeT.length; i++) if (this.nodeT[i] && this.nodeT[i] <= this.night) this.nodeT[i] = 0;
    this.verTrees++;
    if (this.night % 3 === 1) {
      // alguns baús reabastecem
      let n = 4;
      for (let i = 0; i < this.chestOpen.length && n > 0; i++) {
        const j = (i * 7 + this.night * 3) % this.chestOpen.length;
        if (this.chestOpen[j]) (this.chestOpen[j] = 0), n--;
      }
      this.verChest++;
    }
    for (const s of this.structs) {
      const k = ITEM[s.k]?.place?.kind;
      if (k === 'garden' || k === 'berrybed') s.a = 1;
    }
    this.verStruct++;
    this.ev('dawn', { n: this.survived });
    if (this.survived === GOAL_NIGHTS && !this.won) {
      this.won = true;
      this.ev('win', { n: this.survived });
    }
  }

  private stepFire(dt: number): void {
    const f = this.fire;
    const rate = (this.phase === 'night' ? 0.34 : 0.2) * (f.ring ? 0.72 : 1);
    f.fuel = Math.max(0, f.fuel - rate * dt);
    if (f.fuel <= 0 && this.phase === 'night') {
      if (f.outT === 0) this.ev('fireout');
      f.outT += dt;
      if (f.outT > 14) {
        this.over = true;
        this.ev('over', { n: this.survived });
      }
    } else f.outT = 0;
    if (f.fuel > 0 && f.fuel < f.max * 0.22 && Math.floor(this.time / 9) !== Math.floor((this.time - dt) / 9)) this.ev('firelow');
  }

  private stepPlayers(dt: number, L: LightSrc[]): void {
    const fr = this.fireR();
    for (const p of this.players) {
      p.swing = Math.max(0, p.swing - dt);
      p.invT = Math.max(0, p.invT - dt);
      if (p.faint > 0) {
        p.faint -= dt;
        if (p.faint <= 0) this.respawn(p);
        continue;
      }
      if (p.bot) this.stepBot(p, dt, L);
      const dFire = Math.hypot(p.x, p.z);
      // depósito automático no acampamento
      if (dFire < Math.max(CAMP_R, fr) && bagCount(p.bag) > 0) {
        for (const k in p.bag) {
          const n = p.bag[k as Res] ?? 0;
          if (n > 0) this.addStash(k as Res, n);
        }
        if (!p.bot || bagCount(p.bag) > 2) this.ev('deposit', { p: p.id, n: bagCount(p.bag) });
        p.bag = {};
      }
      // resgate
      if (p.carry >= 0 && dFire < CAMP_R) {
        const b = this.babies[p.carry];
        b.st = 2;
        this.rescued++;
        const a = (this.rescued / BABIES) * TAU;
        b.x = Math.cos(a) * 3.4;
        b.z = Math.sin(a) * 3.4;
        p.carry = -1;
        this.addStash('spark', 3);
        this.ev('rescue', { p: p.id, n: this.rescued, x: b.x, z: b.z });
      }
      // fome e calor
      p.hunger = Math.max(0, p.hunger - dt * 0.17);
      let warmD: number;
      const wm = (['neck', 'head', 'body', 'cape'] as Slot[]).reduce((s, k) => s + (p.wear[k] ? ITEM[p.wear[k]!].wear!.warm ?? 0 : 0), 0);
      if (fr > 0 && dFire < fr) warmD = 5;
      else if (this.phase === 'night') warmD = this.litAt(p.x, p.z, L) > 0 ? -0.2 : -0.85 * Math.max(0.15, 1 - wm);
      else warmD = 0.6;
      if (this.phase === 'night' && this.structs.some((s) => s.k === 'logbench' && Math.hypot(s.x - p.x, s.z - p.z) < 2.4)) warmD += 2;
      p.warmth = clamp(p.warmth + warmD * dt, 0, 100);
      if (p.hunger <= 0 || p.warmth <= 0) {
        p.starveT += dt;
        if (p.starveT > 12) {
          p.starveT = 0;
          this.hurt(p, p.hunger <= 0 ? 'hungry' : 'cold');
        }
      } else p.starveT = 0;
      // tambor da coragem
      if (Math.floor(this.time / 15) !== Math.floor((this.time - dt) / 15) && p.hearts < HEARTS && this.structs.some((s) => s.k === 'drum' && Math.hypot(s.x - p.x, s.z - p.z) < 6)) {
        p.hearts++;
        this.ev('heal', { p: p.id, x: p.x, z: p.z });
      }
    }
  }
  hurt(p: Player, why: string): void {
    if (p.invT > 0 || p.faint > 0) return;
    p.hearts--;
    p.invT = 1.6;
    this.ev('hurt', { p: p.id, x: p.x, z: p.z, i: why });
    if (p.hearts <= 0) {
      if (p.seat >= 0) this.veh?.exit(p);
      p.faint = 5;
      if (p.carry >= 0) this.dropBaby(p);
      // metade do saco se perde
      for (const k in p.bag) p.bag[k as Res] = Math.floor((p.bag[k as Res] ?? 0) / 2);
      p.lightOn = false;
      this.ev('faint', { p: p.id, x: p.x, z: p.z });
    }
  }
  private respawn(p: Player): void {
    p.faint = 0;
    p.hearts = 3;
    p.warmth = Math.max(p.warmth, 60);
    p.hunger = Math.max(p.hunger, 30);
    p.invT = 3;
    const bed = this.build.bed() ?? this.structs.find((s) => s.k === 'tent') ?? this.structs.find((s) => s.k === 'bedroll'); // BUILD: cama construída
    const a = this.r() * TAU;
    if (bed) [p.x, p.z] = [bed.x + Math.cos(a) * 1.4, bed.z + Math.sin(a) * 1.4];
    else [p.x, p.z] = [Math.cos(a) * 4, Math.sin(a) * 4];
    this.ev('respawn', { p: p.id, x: p.x, z: p.z });
  }

  private stepBabies(dt: number): void {
    for (const b of this.babies) {
      if (b.st !== 1) continue;
      const p = this.player(b.by);
      if (!p) {
        b.st = 0;
        continue;
      }
      const tx = p.x - Math.sin(p.yaw) * 1.3;
      const tz = p.z - Math.cos(p.yaw) * 1.3;
      const d = Math.hypot(tx - b.x, tz - b.z);
      if (d > 8) [b.x, b.z] = [tx, tz];
      else if (d > 0.3) {
        const k = Math.min(1, dt * 6);
        b.x += (tx - b.x) * k;
        b.z += (tz - b.z) * k;
      }
    }
  }

  /* ------------------------------ Sombrinhas ------------------------------ */
  private spawn(k: CK, x?: number, z?: number): void {
    const d = CDEFS[k];
    if (x === undefined || z === undefined) {
      const a = this.r() * TAU;
      const R = clamp(this.fireR() + 26 + this.r() * 14, 22, WORLD_R - 3);
      x = Math.cos(a) * R;
      z = Math.sin(a) * R;
    }
    const hpMul = 1 + Math.max(0, this.night - 5) * 0.06 + (k === CK.King ? (Math.floor(this.night / 10) - 1) * 0.4 : 0);
    this.creatures.push({ id: this.nextId++, k, x, z, hp: d.hp * hpMul, max: d.hp * hpMul, lit: 0, drain: 0, vx: 0, vz: 0, t: this.r() * 10, summonT: 6 });
    if (k === CK.King) this.ev('boss', { x, z });
  }

  private stepCreatures(dt: number, L: LightSrc[]): void {
    if (this.phase === 'night') {
      const ni = nightInfo(this.night);
      this.spawnT -= dt;
      const alive = this.creatures.filter((c) => c.k !== CK.King).length;
      if (this.spawnT <= 0 && alive < ni.cap) {
        this.spawnT = ni.every * (0.7 + this.r() * 0.6);
        const roll = this.r();
        let k: CK = CK.Small;
        if (this.night >= CDEFS[CK.Big].from && roll < 0.14) k = CK.Big;
        else if (this.night >= CDEFS[CK.Hopper].from && roll < 0.4) k = CK.Hopper;
        else if (ni.fog && roll < 0.75) k = CK.Mist;
        this.spawn(k);
      }
      if (ni.boss && !this.bossDone && this.clock > NIGHT_LEN * 0.25) {
        this.bossDone = true;
        this.spawn(CK.King);
      }
    }
    const fr = this.fireR();
    const fences = this.structs.filter((s) => s.k.startsWith('fence'));
    let bell = false;
    for (const c of this.creatures) {
      const D = CDEFS[c.k];
      c.t += dt;
      c.lit = Math.max(0, c.lit - dt);
      // alvo: jogador no escuro por perto; senão, a fogueira
      let tx = 0;
      let tz = 0;
      let best = 26;
      let tp: Player | null = null;
      for (const p of this.players) {
        if (p.faint > 0 || p.seat >= 0) continue;
        const d = Math.hypot(p.x - c.x, p.z - c.z);
        if (d < best && this.litAt(p.x, p.z, L) <= 0) {
          best = d;
          tp = p;
        }
      }
      if (c.k === CK.King) tp = null;
      if (tp) [tx, tz] = [tp.x, tp.z];
      let dx = tx - c.x;
      let dz = tz - c.z;
      const dist = Math.hypot(dx, dz) || 1;
      dx /= dist;
      dz /= dist;
      // luz: dói e empurra
      const lit = this.litAt(c.x, c.z, L);
      const resist = c.k === CK.King ? 0.08 : 1;
      if (lit > 0) {
        c.hp -= lit * 3.2 * resist * dt;
        c.lit = 0.2;
      }
      // luzes à frente: para na borda (anda de lado)
      const ahead = this.litAt(c.x + dx * 1.2, c.z + dz * 1.2, L);
      let sp = D.speed * (c.k === CK.Hopper ? 0.6 + Math.max(0, Math.sin(c.t * 5)) * 1.2 : 1);
      let mx = dx;
      let mz = dz;
      c.drain = Math.max(0, c.drain - dt);
      if (ahead > 0 && c.k !== CK.King) {
        // na borda da luz da fogueira: suga combustível
        const df = Math.hypot(c.x, c.z);
        if (fr > 0 && df < fr + 2.5) {
          this.fire.fuel = Math.max(0, this.fire.fuel - 0.32 * dt * (c.k === CK.Big ? 2 : 1));
          c.drain = 0.3;
        }
        mx = -dz * Math.sin(c.id) - dx * 0.5;
        mz = dx * Math.sin(c.id) - dz * 0.5;
        sp *= lit > 0 ? 1.4 : 0.5;
      }
      if (c.k === CK.King) {
        const df = Math.hypot(c.x, c.z);
        if (df < fr + 3) {
          this.fire.fuel = Math.max(0, this.fire.fuel - 1.6 * dt);
          c.drain = 0.3;
          sp = 0;
        }
        c.summonT -= dt;
        if (c.summonT <= 0 && this.creatures.length < 40) {
          c.summonT = 9;
          for (let i = 0; i < 2; i++) this.spawn(CK.Small, c.x + (this.r() - 0.5) * 6, c.z + (this.r() - 0.5) * 6);
        }
      }
      c.vx *= Math.exp(-4 * dt);
      c.vz *= Math.exp(-4 * dt);
      c.x += (mx * sp + c.vx) * dt;
      c.z += (mz * sp + c.vz) * dt;
      // cercas
      for (const f of fences) {
        const d = Math.hypot(f.x - c.x, f.z - c.z);
        if (d < 1.1 + D.size * 0.4) {
          const k = (1.1 + D.size * 0.4 - d) / (d || 1);
          c.x -= (f.x - c.x) * k;
          c.z -= (f.z - c.z) * k;
          f.hp -= dt * (c.k === CK.King ? 6 : c.k === CK.Big ? 1.6 : 0.7);
          if (f.k === 'fence3') c.hp -= dt * 2;
        }
      }
      this.build.creature(c, dt); // BUILD
      // armadilhas
      for (const s of this.structs) {
        if (s.k !== 'trap' || s.a <= 0) continue;
        if (Math.hypot(s.x - c.x, s.z - c.z) < 1.3 + D.size * 0.3) {
          c.hp -= c.k === CK.King ? 8 : 99;
          s.a--;
          this.verStruct++;
          this.ev('trap', { x: s.x, z: s.z });
        }
      }
      // feixe das lanternas
      for (const p of this.players) {
        if (!p.lightOn || p.faint > 0) continue;
        const [range, dps, ang] = this.lamp(p);
        const ex = c.x - p.x;
        const ez = c.z - p.z;
        const ed = Math.hypot(ex, ez);
        if (ed > range + D.size * 0.5) continue;
        const ca = (ex * Math.sin(p.aim) + ez * Math.cos(p.aim)) / (ed || 1);
        if (ca < Math.cos(ang + Math.atan2(D.size * 0.5, ed))) continue;
        c.hp -= dps * dt * (c.k === CK.King ? 0.7 : 1);
        c.lit = 0.25;
        c.vx += (ex / (ed || 1)) * dt * 6;
        c.vz += (ez / (ed || 1)) * dt * 6;
      }
      // sinalizadores
      for (const f of this.flashes) if (Math.hypot(f.x - c.x, f.z - c.z) < f.r) c.hp -= f.dmg * dt * (c.k === CK.King ? 0.6 : 1);
      // toque nos jogadores
      if (tp && Math.hypot(tp.x - c.x, tp.z - c.z) < 0.55 + D.size * 0.45) {
        this.hurt(tp, 'shadow');
        c.vx = -dx * 9;
        c.vz = -dz * 9;
      }
      for (const s of this.structs) if (s.k === 'bell' && Math.hypot(s.x - c.x, s.z - c.z) < 12) bell = true;
    }
    this.bellT -= dt;
    if (bell && this.bellT <= 0) {
      this.bellT = 6;
      const s = this.structs.find((q) => q.k === 'bell')!;
      this.ev('bell', { x: s.x, z: s.z });
    }
    // poof!
    if (this.creatures.some((c) => c.hp <= 0)) {
      for (const c of this.creatures) {
        if (c.hp > 0) continue;
        this.poofs++;
        this.addStash('spark', CDEFS[c.k].spark * (nightInfo(this.night).moon ? 2 : 1));
        this.ev(c.k === CK.King ? 'bossdown' : 'poof', { x: c.x, z: c.z, n: c.k });
      }
      this.creatures = this.creatures.filter((c) => c.hp > 0);
    }
    // cercas destruídas
    if (fences.some((f) => f.hp <= 0)) {
      for (const f of fences) if (f.hp <= 0) this.ev('break', { x: f.x, z: f.z });
      this.structs = this.structs.filter((s) => !(s.k.startsWith('fence') && s.hp <= 0));
      this.verStruct++;
    }
  }

  private stepStructs(dt: number): void {
    for (const s of this.structs) {
      const d = ITEM[s.k]?.place;
      if (!d) continue;
      if (d.burn && s.burn > 0) {
        s.burn -= dt * (this.phase === 'night' ? 1 : 0.35);
        if (s.burn <= 0) this.verStruct++;
      }
      const kind = d.kind;
      if ((kind === 'kiln' || kind === 'still' || kind === 'charger') && s.a > 0) {
        s.t += dt;
        if (s.t >= 8) {
          s.t = 0;
          s.a--;
          s.b++;
          this.verStruct++;
        }
      }
      if (kind === 'solar' && this.phase === 'day' && s.b < 5) {
        s.t += dt;
        if (s.t >= 25) {
          s.t = 0;
          s.b++;
          this.verStruct++;
        }
      }
    }
  }

  /* ------------------------------ ajudantes (solo) ------------------------------ */
  private moveTo(p: Player, x: number, z: number, dt: number, stop = 1.2): boolean {
    const dx = x - p.x;
    const dz = z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < stop) return true;
    const sp = 4.4 * dt;
    const k = Math.min(1, sp / d);
    // contorno simples: desvia para o lado quando trava
    const ox = p.x;
    const oz = p.z;
    [p.x, p.z] = this.collide(p.x + dx * k, p.z + dz * k, 0.4);
    if (Math.hypot(p.x - ox, p.z - oz) < sp * 0.3) [p.x, p.z] = this.collide(p.x - (dz / d) * sp, p.z + (dx / d) * sp, 0.4);
    p.yaw = Math.atan2(dx, dz);
    return false;
  }
  private stepBot(p: Player, dt: number, L: LightSrc[]): void {
    if (p.next) {
      p.delay -= dt;
      if (p.delay > 0) return;
      p.cmd = p.next;
      p.next = null;
      p.tgt = -1;
      this.ev('ok', { p: p.id, i: p.cmd });
    }
    const lead = this.players.find((q) => !q.bot);
    p.actT -= dt;
    // sempre: luz ligada à noite mirando a Sombrinha mais perto
    let near: Creature | null = null;
    let nd = 15;
    for (const c of this.creatures) {
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < nd) (nd = d), (near = c);
    }
    p.lightOn = this.phase === 'night' && !!near;
    if (near) p.aim = Math.atan2(near.x - p.x, near.z - p.z);
    switch (p.cmd) {
      case 'stay':
        break;
      case 'follow':
        if (lead) {
          const i = this.players.filter((q) => q.bot).indexOf(p);
          const a = lead.yaw + Math.PI + (i ? 0.7 : -0.7);
          this.moveTo(p, lead.x + Math.sin(a) * 2.4, lead.z + Math.cos(a) * 2.4, dt, 0.8);
        }
        break;
      case 'guard': {
        const fr = Math.max(3, this.fireR());
        const a = near ? Math.atan2(near.z, near.x) : this.players.indexOf(p) * 2;
        const R = Math.max(2.4, fr - 1.5);
        this.moveTo(p, Math.cos(a) * R, Math.sin(a) * R, dt, 0.8);
        if (this.fire.fuel < this.fire.max * 0.45 && Math.hypot(p.x, p.z) < 4.2 && p.actT <= 0) {
          p.actT = 1;
          this.feed(p);
        } else if (this.fire.fuel < this.fire.max * 0.45 && (this.stash.wood ?? 0) > 0) this.moveTo(p, 0, 0, dt, 3.6);
        break;
      }
      case 'wood': {
        if (bagCount(p.bag) >= 8 || (this.phase === 'night' && this.litAt(p.x, p.z, L) <= 0 && nd < 8)) {
          // volta para o acampamento (o depósito é automático)
          if (this.moveTo(p, p.x * 0.1, p.z * 0.1, dt, CAMP_R * 0.6)) p.tgt = -1;
          if (this.fire.fuel < this.fire.max * 0.5 && Math.hypot(p.x, p.z) < 4.2 && p.actT <= 0) (p.actT = 1), this.feed(p);
          break;
        }
        if (p.tgt < 0 || this.treeT[p.tgt]) {
          let bd = 1e9;
          p.tgt = -1;
          this.w.trees.forEach((t, i) => {
            if (this.treeT[i]) return;
            const dd = Math.hypot(t.x - p.x, t.z - p.z) + Math.hypot(t.x, t.z) * 0.5;
            if (dd < bd && Math.hypot(t.x, t.z) < 48) (bd = dd), (p.tgt = i);
          });
        }
        if (p.tgt >= 0) {
          const t = this.w.trees[p.tgt];
          if (this.moveTo(p, t.x, t.z, dt, treeR(t) + 1.3) && p.actT <= 0) {
            p.actT = 0.75;
            p.yaw = Math.atan2(t.x - p.x, t.z - p.z);
            this.hitTree(p, p.tgt);
          }
        }
        break;
      }
    }
  }

  /* ------------------------------ estatísticas ------------------------------ */
  stashCount(): number {
    return RES.reduce((s, k) => s + (this.stash[k] ?? 0), 0);
  }
}
