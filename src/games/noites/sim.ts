/* ============================================================
 *  NOITES — simulação (roda no host / no modo solo).
 *  Sem three nem DOM: o host avança tudo e manda instantâneos;
 *  convidados só aplicam (e movem o próprio boneco).
 * ============================================================ */
import {
  BENCH_BABIES,
  CHEST_POS,
  BENCH_POS,
  BABIES,
  CAMP_R,
  CDEFS,
  CK,
  DAY_LEN,
  DIFFS,
  DUSK,
  FIRE_LV,
  FIRE_MAX_LV,
  FIRE_TIME,
  FIRE_XP,
  GOAL_NIGHTS,
  RELIGHT,
  fireCap,
  fireRate,
  HEARTS,
  ITEM,
  NIGHT_LEN,
  RAW_FOOD,

  WORLD_R,
  HOT,
  clamp,
  nightInfo,
  rng,
  TAU,
  type ItemDef,

  type Res,
  type Slot,
} from './data';
import { addTo, bestAxe, capSlots, countOf, fitSlots, heldKind, isRes, packSlots, roomFor, stackMax, takeFrom, unpackSlots, type Slots } from './items';
import { NODE_GIVES, NODE_R, NODE_REGROW, NK, World, treeR } from './world';
import { ENERGY_PER, Vehicles, stats, validDesign, type VDesign } from './vehicles';

/** estoque do acampamento (baú): qualquer item → quantidade */
export type Bag = Record<string, number>;
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
  /** espaços: [0..HOT-1] barra (mão), resto mochila/saco */
  slots: Slots;
  /** espaço da barra na mão */
  sel: number;
  wear: Partial<Record<Slot, string>>;
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
  /** ajudante: com medo, pedindo ajuda (s) */
  scared: number;
  askT: number;
  /** aviso de mochila cheia (s) */
  fullT: number;
}

/** coisa solta no chão (host-autoritativa): pula, rola, pode ser pega ou jogada */
export interface Loot {
  id: number;
  k: string;
  n: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** parada no chão */
  rest: boolean;
  /** idade (s) */
  age: number;
  /** atraso até aparecer (s) — espera a árvore cair */
  d: number;
  /** quem jogou (não pega de volta logo) */
  by: string;
  /** voando para a fogueira */
  fire: boolean;
}
/** árvore caída: bata de novo para virar toras e galhos */
export interface Felled {
  id: number;
  /** índice da árvore */
  i: number;
  /** direção da queda */
  a: number;
  hp: number;
  age: number;
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
  /** tamanho (cresce noite a noite) */
  sz: number;
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
  /** carrinho/trenó: quem está puxando ('' = parado) */
  by?: string;
  /** carrinho/trenó: carga */
  load?: Bag;
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
  /** ângulo (queda, entalhe) */
  a?: number;
  y?: number;
}

export interface Baby {
  st: 0 | 1 | 2;
  x: number;
  z: number;
  by: string;
}

export interface Fire {
  /** segundos de fogo restantes */
  fuel: number;
  /** capacidade (s) */
  max: number;
  /** nível (fica maior, gasta mais) e progresso */
  lv: number;
  xp: number;
  /** brilho de quando algo cai no fogo (vista) */
  flare: number;
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
  | { a: 'grab'; id: number }
  | { a: 'throw'; yaw: number; pitch: number; tx?: number; ty?: number; tz?: number }
  | { a: 'store'; s: number }
  | { a: 'storeall' }
  | { a: 'unstore'; id: string }
  | { a: 'swap'; i: number; j: number }
  | { a: 'drop'; s: number }
  | { a: 'sel'; i: number }
  | { a: 'log'; id: number }
  | { a: 'haul'; s: number }
  | { a: 'cargo'; s: number }
  | { a: 'relight' }
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
  | { a: 'vstore'; v: number };

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

const CHEST_LOOT: Bag[][] = [
  [{ scrap: 2, fiber: 2 }, { scrap: 1, spark: 1, berry: 2 }, { twig: 3, scrap: 2 }, { apple: 2, scrap: 1, seed: 1 }],
  [{ scrap: 3, spark: 2 }, { scrap: 4, fiber: 3 }, { spark: 3, mush: 2 }, { scrap: 2, spark: 2, sap: 1 }],
  [{ scrap: 5, spark: 4 }, { spark: 6, sap: 1 }, { scrap: 6, spark: 3, pumpkin: 1 }],
];
const CHEST_ITEMS = [
  ['torch', 'flare', 'bag1', 'bag1'],
  ['flare', 'torch', 'heal', 'bag2'],
  ['flare2', 'orb', 'heal', 'bag3'],
];
/** gravidade das coisas soltas */
const GRAV = 18;
/** raio da boca da fogueira (onde o que cai queima) */
export const FIRE_MOUTH = 1.25;
/** máximo de coisas no chão (o excesso mais antigo vai para o baú) */
const LOOT_CAP = 140;
const PICK_R = 1.45;

export function bagCount(b: Bag): number {
  let n = 0;
  for (const k in b) n += b[k] ?? 0;
  return n;
}

/** física simples de uma coisa solta (host e convidado usam a mesma) */
export function lootPhys(l: Loot, dt: number, ground: (x: number, z: number) => number): void {
  if (l.d > 0) {
    l.d -= dt;
    return;
  }
  l.age += dt;
  if (l.rest) return;
  l.vy -= GRAV * dt;
  l.x += l.vx * dt;
  l.y += l.vy * dt;
  l.z += l.vz * dt;
  const g = ground(l.x, l.z) + 0.1;
  if (l.y <= g) {
    l.y = g;
    if (l.vy < -2.2) {
      l.vy = -l.vy * 0.36;
      l.vx *= 0.62;
      l.vz *= 0.62;
    } else {
      l.vy = 0;
      const f = Math.exp(-7 * dt);
      l.vx *= f;
      l.vz *= f;
      if (Math.hypot(l.vx, l.vz) < 0.25) {
        l.vx = l.vz = 0;
        l.rest = true;
      }
    }
  }
}

export class Sim {
  w: World;
  players: Player[] = [];
  creatures: Creature[] = [];
  structs: Struct[] = [];
  flashes: Flash[] = [];
  babies: Baby[];
  /** coisas soltas no chão / voando */
  loot: Loot[] = [];
  /** árvores caídas esperando virar toras */
  felled: Felled[] = [];
  fire: Fire = { fuel: 120, max: 150, lv: 1, xp: 0, flare: 0, ring: false, bellows: false, big: false, outT: 0 };
  /** baú do acampamento (estoque compartilhado) */
  stash: Bag = { wood: 3, twig: 4, berry: 4 };
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
  /** dificuldade (índice em DIFFS) e ajudantes pedidos */
  diff = 1;
  helpers = 0;
  /** dia em que cada árvore volta (0 = em pé) */
  treeT: Int16Array;
  /** golpes já levados (por árvore) */
  treeHit = new Map<number, number>();
  /** lado do entalhe (ângulo do primeiro golpe) */
  treeSide = new Map<number, number>();
  nodeT: Int16Array;
  nodeHit = new Map<number, number>();
  chestOpen: Uint8Array;
  /** versões (rede: manda listas grandes só quando mudam) */
  verTrees = 0;
  verStruct = 0;
  verChest = 0;
  verLoot = 0;
  events: Ev[] = [];
  private evSeq = 0;
  nextId = 1;
  private spawnT = 3;
  private bossDone = false;
  private bellT = 0;
  private r = rng(1234567);
  private duskSent = false;
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

  constructor(readonly seed: number) {
    this.w = new World(seed);
    this.treeT = new Int16Array(this.w.trees.length);
    this.nodeT = new Int16Array(this.w.nodes.length);
    this.chestOpen = new Uint8Array(this.w.chests.length);
    this.babies = this.w.babies.map((b) => ({ st: 0, x: b.x, z: b.z, by: '' }));
    this.clock = 0;
  }

  /** a noite de hoje, já escalada por dificuldade, jogadores e ajudantes */
  nightNow(n = this.night): ReturnType<typeof nightInfo> {
    const humans = this.players.filter((p) => !p.bot).length;
    return nightInfo(n, { diff: DIFFS[this.diff] ?? 1, players: Math.max(1, humans), helpers: this.players.length - humans });
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
      slots: fitSlots(bot ? [{ id: 'axe1', n: 1 }, { id: 'lamp1', n: 1 }] : [{ id: 'axe1', n: 1 }, { id: 'lamp1', n: 1 }, { id: 'torch', n: 1 }], HOT),
      sel: 0,
      wear: {},
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
      scared: 0,
      askT: 10 + this.r() * 20,
      fullT: 0,
    };
    fitSlots(p.slots, this.cap(p));
    this.players.push(p);
    return p;
  }
  removePlayer(id: string): void {
    const p = this.players.find((q) => q.id === id);
    if (!p) return;
    if (p.carry >= 0) this.dropBaby(p);
    if (p.seat >= 0) this.veh?.exit(p);
    this.unhaul(p);
    // o que estava na mochila vai para o baú (ninguém perde nada por cair a conexão)
    for (const s of p.slots) if (s) this.addStash(s.id, s.n);
    this.players = this.players.filter((q) => q !== p);
  }
  player(id: string): Player | undefined {
    return this.players.find((p) => p.id === id);
  }
  /** espaços totais do jogador */
  cap(p: Player): number {
    return capSlots(p.wear.back, p.bot);
  }
  /** o que está na mão */
  held(p: Player): string | undefined {
    return p.slots[p.sel]?.id;
  }
  lamp(p: Player): [number, number, number] {
    const h = this.held(p);
    return ITEM[h ?? '']?.lamp ?? ITEM.lamp1.lamp!;
  }
  /** quanto há para usar (baú + mochila de quem está fazendo) */
  avail(k: string, p?: Player): number {
    return (this.stash[k] ?? 0) + (p ? countOf(p.slots, k) : 0);
  }
  /** gasta do baú primeiro, depois da mochila */
  spend(k: string, n: number, p?: Player): boolean {
    if (this.avail(k, p) < n) return false;
    const fromStash = Math.min(n, this.stash[k] ?? 0);
    if (fromStash) {
      this.stash[k] -= fromStash;
      if (!this.stash[k]) delete this.stash[k];
    }
    if (n - fromStash > 0 && p) takeFrom(p.slots, k, n - fromStash);
    return true;
  }

  /* ------------------------------ eventos ------------------------------ */
  ev(k: string, o: Omit<Ev, 's' | 'k'> = {}): void {
    this.events.push({ s: ++this.evSeq, k, ...o });
    if (this.events.length > 80) this.events.splice(0, this.events.length - 80);
  }
  get evHead(): number {
    return this.evSeq;
  }
  addStash(k: string, n: number): void {
    if (n > 0) this.stash[k] = (this.stash[k] ?? 0) + n;
  }

  /* ------------------------------ fogueira / luz ------------------------------ */
  fireR(): number {
    const f = this.fire;
    if (f.fuel <= 0) return 0;
    const maxR = 11 + f.lv * 2.5 + (f.bellows ? 3 : 0) + (f.big ? 4 : 0);
    return 3 + (maxR - 3) * Math.sqrt(Math.min(1, f.fuel / 90));
  }
  /** segundos de fogo que se gasta por segundo agora */
  fireBurn(): number {
    const f = this.fire;
    const night = this.phase === 'night' ? 1 + Math.min(0.5, (this.night - 1) * 0.03) : 0.8;
    return fireRate(f.lv) * night * (f.ring ? 0.75 : 1) * (0.8 + 0.2 * (DIFFS[this.diff] ?? 1));
  }
  /** quanto tempo a fogueira ainda dura (s) no ritmo atual */
  fireLeft(): number {
    return this.fire.fuel / this.fireBurn();
  }
  /** fontes de luz que espantam Sombrinhas (fogueira, construções, sinalizadores, roupas, tocha na mão) */
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
      else if (this.held(p) === 'torch') out.push({ x: p.x, z: p.z, r: 3.2 });
    }
    if (this.vehLights) out.push(...this.vehLights());
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
          // colhido: o colisor some junto (sem parede invisível)
          if (this.nodeT[-1 - i]) return;
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
        if (!d0 || d0.kind === 'torch' || d0.kind === 'glowshroom' || d0.kind === 'trap' || d0.kind === 'bedroll' || d0.kind === 'cart' || d0.kind === 'sled') continue;
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
      for (const [px, pz, pr] of [[CHEST_POS[0], CHEST_POS[1], 0.75]] as const) {
        const dx = x - px;
        const dz = z - pz;
        const dd = Math.hypot(dx, dz);
        if (dd < pr + r && dd > 1e-4) {
          x = px + (dx / dd) * (pr + r);
          z = pz + (dz / dd) * (pr + r);
        }
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
      case 'log':
        return this.hitLog(p, A.id);
      case 'take':
        return this.takeNode(p, A.i);
      case 'chest':
        return this.openChest(p, A.i);
      case 'baby':
        return this.pickBaby(p, A.i);
      case 'grab':
        return this.grab(p, A.id);
      case 'throw':
        return this.throwHeld(p, A);
      case 'sel':
        if (A.i >= 0 && A.i < HOT) p.sel = A.i | 0;
        return;
      case 'swap':
        return this.swap(p, A.i | 0, A.j | 0);
      case 'drop':
        return this.dropSlot(p, A.s | 0);
      case 'store':
        return this.store(p, A.s | 0);
      case 'storeall':
        for (let i = HOT; i < p.slots.length; i++) this.store(p, i, true);
        return;
      case 'unstore':
        return this.unstore(p, String(A.id));
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
      case 'haul':
        return this.haul(p, A.s);
      case 'cargo':
        return this.cargo(p, A.s);
      case 'relight':
        return this.relight(p);
      case 'vbuild':
        return this.vBuild(p, A.d);
      case 'venter': {
        const v = this.veh?.get(A.v);
        if (!v || p.seat >= 0 || Math.hypot(v.x - p.x, v.z - p.z) > v.st.lt / 2 + 3) return;
        if (p.carry >= 0) return void this.ev('need', { p: p.id, i: 'carry' });
        this.unhaul(p);
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
        const n = this.veh!.addLogs(v, countOf(p.slots, 'wood'));
        if (n) {
          takeFrom(p.slots, 'wood', n);
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
      case 'cmd':
        for (const b of this.players) if (b.bot) b.next = A.c;
        for (const b of this.players) if (b.bot) (b.delay = 0.6 + this.r() * 0.6), this.ev('think', { p: b.id, i: A.c });
        return;
    }
  }

  /* ------------------------------ inventário ------------------------------ */
  /** dá ao jogador; o que não cabe vai para o baú do acampamento (com aviso). Devolve true se coube tudo. */
  give(p: Player, id: string, n: number): boolean {
    const cap = this.cap(p);
    fitSlots(p.slots, cap);
    // saco achado: veste na hora se for melhor
    const w = ITEM[id]?.wear;
    if (w) {
      const cur = p.wear[w.slot];
      const better = !cur || (w.slots ?? 0) > (ITEM[cur].wear?.slots ?? 0) || !w.slots;
      if (better) {
        p.wear[w.slot] = id;
        fitSlots(p.slots, this.cap(p));
        if (cur && cur !== id) this.addStash(cur, 1);
        this.ev('wear', { p: p.id, i: id });
        if (n <= 1) return true;
        n--;
      }
    }
    // ferramenta melhor do mesmo tipo troca a velha no mesmo espaço
    const d = ITEM[id];
    if (d && (d.axe || d.lamp || d.bonk)) {
      const same = p.slots.findIndex((s) => s && ITEM[s.id] && ((d.axe && ITEM[s.id].axe) || (d.lamp && ITEM[s.id].lamp) || (d.bonk && ITEM[s.id].bonk)));
      if (same >= 0) {
        const old = ITEM[p.slots[same]!.id];
        const pw = (x: typeof d) => x.axe ?? x.bonk ?? x.lamp?.[0] ?? 0;
        if (pw(d) >= pw(old)) {
          if (old.id !== id) this.addStash(old.id, 1);
          p.slots[same] = { id, n: 1 };
          return true;
        }
      }
    }
    const left = addTo(p.slots, id, n, cap, p.sel);
    if (left > 0) {
      this.addStash(id, left);
      if (p.fullT <= 0) {
        p.fullT = 6;
        this.ev('bagfull', { p: p.id, i: id, n: left });
      }
      return false;
    }
    return true;
  }
  private swap(p: Player, i: number, j: number): void {
    const cap = this.cap(p);
    if (i < 0 || j < 0 || i >= cap || j >= cap || i === j) return;
    fitSlots(p.slots, cap);
    const a = p.slots[i];
    const b = p.slots[j];
    if (a && b && a.id === b.id) {
      const k = Math.min(a.n, stackMax(a.id) - b.n);
      b.n += k;
      a.n -= k;
      if (a.n <= 0) p.slots[i] = null;
      return;
    }
    p.slots[i] = b;
    p.slots[j] = a;
  }
  /** solta a pilha inteira no chão à frente */
  private dropSlot(p: Player, i: number): void {
    const s = p.slots[i];
    if (!s) return;
    p.slots[i] = null;
    const n = Math.min(s.n, 6);
    for (let k = 0; k < n; k++) {
      const a = p.yaw + (this.r() - 0.5) * 0.9;
      const q = n === s.n ? 1 : k < n - 1 ? 1 : s.n - (n - 1);
      this.spawnLoot(s.id, q, p.x + Math.sin(p.yaw) * 0.8, this.w.height(p.x, p.z) + 1.1, p.z + Math.cos(p.yaw) * 0.8, Math.sin(a) * 2.2, 2.5, Math.cos(a) * 2.2, 0, p.id);
    }
    this.ev('drop', { p: p.id, i: s.id, x: p.x, z: p.z });
  }
  /** perto do baú/estante? */
  nearStore(p: Player): boolean {
    if (Math.hypot(p.x - CHEST_POS[0], p.z - CHEST_POS[1]) < 3.6) return true;
    return this.structs.some((s) => ITEM[s.k]?.place?.shows && Math.hypot(s.x - p.x, s.z - p.z) < 3.4);
  }
  private store(p: Player, i: number, quiet = false): void {
    const s = p.slots[i];
    if (!s || !this.nearStore(p)) return;
    // ferramentas da mão ficam (guardar tudo não leva o machado)
    if (quiet && i < HOT) return;
    this.addStash(s.id, s.n);
    p.slots[i] = null;
    if (!quiet) this.ev('store', { p: p.id, i: s.id, n: s.n });
    else this.ev('store', { p: p.id, i: s.id, n: s.n, a: 1 });
  }
  private unstore(p: Player, id: string): void {
    if (!this.nearStore(p)) return;
    const have = this.stash[id] ?? 0;
    if (have <= 0) return;
    const n = Math.min(have, stackMax(id), roomFor(p.slots, id, this.cap(p)));
    if (n <= 0) return void this.ev('need', { p: p.id, i: 'room' });
    this.stash[id] -= n;
    if (!this.stash[id]) delete this.stash[id];
    addTo(p.slots, id, n, this.cap(p), p.sel);
    this.ev('unstore', { p: p.id, i: id, n });
  }

  /* ------------------------------ coisas soltas ------------------------------ */
  spawnLoot(k: string, n: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, d = 0, by = '', fire = false): Loot {
    const l: Loot = { id: this.nextId++, k, n, x, y, z, vx, vy, vz, rest: false, age: 0, d, by, fire };
    this.loot.push(l);
    this.verLoot++;
    if (this.loot.length > LOOT_CAP) {
      // o mais antigo parado vai para o baú (sem perder nada)
      const old = this.loot.find((q) => q.rest && !q.fire);
      if (old) {
        this.addStash(old.k, old.n);
        this.loot = this.loot.filter((q) => q !== old);
      }
    }
    return l;
  }
  /** pipoca coisas em volta de um ponto (colheita, baú) */
  private pop(g: Bag, x: number, z: number, d = 0, spread = 1): void {
    const y = this.w.height(x, z) + 0.6;
    for (const k in g) {
      let n = g[k] ?? 0;
      while (n > 0) {
        const q = isRes(k) && n > 3 ? Math.min(n, 2) : 1;
        n -= q;
        const a = this.r() * TAU;
        const sp = (1.4 + this.r() * 1.6) * spread;
        this.spawnLoot(k, q, x, y, z, Math.sin(a) * sp, 3.2 + this.r() * 2, Math.cos(a) * sp, d);
      }
    }
  }
  private grab(p: Player, id: number): void {
    const l = this.loot.find((q) => q.id === id);
    if (!l || l.d > 0 || Math.hypot(l.x - p.x, l.z - p.z) > 3.4) return;
    this.pickLoot(p, l);
  }
  private pickLoot(p: Player, l: Loot): void {
    this.loot = this.loot.filter((q) => q !== l);
    this.verLoot++;
    const cart = this.hauling(p);
    if (cart && isRes(l.k) && this.cartRoom(cart) >= l.n) {
      cart.load![l.k] = (cart.load![l.k] ?? 0) + l.n;
      this.verStruct++;
      this.ev('pickup', { p: p.id, i: l.k, n: l.n, x: l.x, z: l.z, y: l.y, a: cart.id });
      return;
    }
    this.give(p, l.k, l.n);
    this.ev('pickup', { p: p.id, i: l.k, n: l.n, x: l.x, z: l.z, y: l.y });
  }
  /** joga 1 do que está na mão (arco). Com alvo: mira certinho (fogueira, amigo). */
  private throwHeld(p: Player, A: { yaw: number; pitch: number; tx?: number; ty?: number; tz?: number }): void {
    const s = p.slots[p.sel];
    if (!s || p.seat >= 0) return;
    const d = ITEM[s.id];
    if (d && (d.axe || d.lamp || d.bonk)) return;
    s.n--;
    if (s.n <= 0) p.slots[p.sel] = null;
    this.launch(p, s.id, A);
  }
  launch(p: Player, k: string, A: { yaw: number; pitch: number; tx?: number; ty?: number; tz?: number }): void {
    const gy = this.w.height(p.x, p.z);
    const x0 = p.x + Math.sin(A.yaw) * 0.5;
    const z0 = p.z + Math.cos(A.yaw) * 0.5;
    const y0 = gy + 1.15;
    let vx: number, vy: number, vz: number;
    const tx = A.tx;
    const tz = A.tz;
    if (tx !== undefined && tz !== undefined && Math.hypot(tx - p.x, tz - p.z) < 16) {
      const ty = A.ty ?? this.w.height(tx, tz) + 0.4;
      const dist = Math.hypot(tx - x0, tz - z0);
      const T = clamp(dist / 8, 0.4, 1.1);
      vx = (tx - x0) / T;
      vz = (tz - z0) / T;
      vy = (ty - y0 + 0.5 * GRAV * T * T) / T;
    } else {
      const pitch = clamp(+A.pitch || 0, -0.6, 1.2) + 0.35;
      const sp = 8.5;
      vx = Math.sin(A.yaw) * Math.cos(pitch) * sp;
      vz = Math.cos(A.yaw) * Math.cos(pitch) * sp;
      vy = Math.sin(pitch) * sp;
    }
    const l = this.spawnLoot(k, 1, x0, y0, z0, vx, vy, vz, 0, p.id, true);
    p.swing = 0.3;
    this.ev('throw', { p: p.id, i: k, x: p.x, z: p.z, n: l.id });
  }
  private stepLoot(dt: number): void {
    const g = (x: number, z: number) => this.w.height(x, z);
    let gone = false;
    for (const l of this.loot) {
      lootPhys(l, dt, g);
      if (l.d > 0) continue;
      // caiu na fogueira?
      const df = Math.hypot(l.x, l.z);
      if (df < FIRE_MOUTH && l.y < 2.2) {
        const t = FIRE_TIME[l.k];
        if (t && this.fire.fuel > 0) {
          this.burn(l.k, l.n, l.by);
          l.n = 0;
          gone = true;
          continue;
        }
        // não queima (ou fogo apagado): quica para fora da fogueira
        if (df > 1e-3) {
          l.x = (l.x / df) * (FIRE_MOUTH + 0.05);
          l.z = (l.z / df) * (FIRE_MOUTH + 0.05);
          l.vx = (l.x / df) * 2.5;
          l.vz = (l.z / df) * 2.5;
          l.vy = Math.max(l.vy, 2);
          l.rest = false;
        }
      }
      if (l.rest) l.fire = false;
    }
    if (gone) {
      this.loot = this.loot.filter((l) => l.n > 0);
      this.verLoot++;
    }
    // pilhas: coisas iguais paradas bem juntas viram uma pilha só (menos objetos)
    if (Math.floor(this.time * 2) !== Math.floor((this.time - dt) * 2)) this.mergeLoot();
    // pegar sozinho ao passar perto
    for (const p of this.players) {
      if (p.faint > 0 || p.seat >= 0) continue;
      for (const l of this.loot) {
        if (l.d > 0 || l.n <= 0 || l.age < 0.35 || (l.by === p.id && l.age < 1.6) || (!l.rest && l.fire)) continue;
        if (Math.abs(l.x - p.x) > PICK_R || Math.abs(l.z - p.z) > PICK_R) continue;
        if (Math.hypot(l.x - p.x, l.z - p.z) > PICK_R || l.y > this.w.height(l.x, l.z) + 1.3) continue;
        if (p.bot) {
          // ajudante leva pouco (e só lenha)
          if ((l.k !== 'wood' && l.k !== 'twig') || countOf(p.slots, 'wood') + countOf(p.slots, 'twig') >= 4) continue;
        }
        this.pickLoot(p, l);
        break;
      }
    }
  }
  private mergeLoot(): void {
    const L = this.loot;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (!a.rest || a.n <= 0) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (!b.rest || b.k !== a.k || b.n <= 0) continue;
        if (Math.abs(a.x - b.x) > 0.6 || Math.abs(a.z - b.z) > 0.6) continue;
        if (a.n + b.n > stackMax(a.k) * 2) continue;
        a.n += b.n;
        b.n = 0;
      }
    }
    if (L.some((l) => l.n <= 0)) {
      this.loot = L.filter((l) => l.n > 0);
      this.verLoot++;
    }
  }
  /** algo caiu no fogo: mais tempo, nível sobe, chama brilha */
  burn(k: string, n: number, by = ''): void {
    const f = this.fire;
    const t = (FIRE_TIME[k] ?? 0) * n;
    f.fuel = Math.min(f.max, f.fuel + t);
    f.outT = 0;
    f.flare = Math.min(1.5, f.flare + 0.4 + t / 60);
    if (f.lv < FIRE_MAX_LV) {
      f.xp += (FIRE_XP[k] ?? 0) * n;
      if (f.xp >= FIRE_LV[f.lv + 1]) {
        f.lv++;
        f.max = fireCap(f.lv, f.big);
        this.ev('firelv', { n: f.lv, x: 0, z: 0 });
      }
    }
    this.ev('burn', { x: 0, z: 0, p: by, i: k, n: Math.round(t) });
  }
  relight(p: Player): void {
    if (this.fire.fuel > 0 || Math.hypot(p.x, p.z) > 4.5) return;
    for (const k in RELIGHT) if (this.avail(k, p) < (RELIGHT[k as Res] ?? 0)) return void this.ev('need', { p: p.id, i: k });
    for (const k in RELIGHT) this.spend(k, RELIGHT[k as Res] ?? 0, p);
    this.fire.fuel = 30;
    this.fire.outT = 0;
    this.fire.flare = 1;
    this.ev('relight', { p: p.id, x: 0, z: 0 });
  }

  /* ------------------------------ carrinho / trenó ------------------------------ */
  hauling(p: Player): Struct | undefined {
    return this.structs.find((s) => s.by === p.id);
  }
  cartRoom(s: Struct): number {
    const cap = ITEM[s.k]?.place?.haul ?? 0;
    return cap - bagCount(s.load ?? {});
  }
  private unhaul(p: Player): void {
    const s = this.hauling(p);
    if (s) {
      s.by = '';
      this.verStruct++;
    }
  }
  /** pega/solta o carrinho */
  private haul(p: Player, sid: number): void {
    const s = this.structs.find((q) => q.id === sid);
    if (!s || !ITEM[s.k]?.place?.haul) return;
    if (s.by === p.id) return this.unhaul(p);
    if (s.by || Math.hypot(s.x - p.x, s.z - p.z) > 3.2 || p.seat >= 0) return;
    this.unhaul(p);
    s.by = p.id;
    s.load ??= {};
    this.verStruct++;
    this.ev('haul', { p: p.id, i: s.k, x: s.x, z: s.z });
  }
  /** carrinho: despeja na fogueira (o que queima), guarda no baú, ou põe nele o que está na mão */
  private cargo(p: Player, sid: number): void {
    const s = this.structs.find((q) => q.id === sid);
    if (!s || !s.load || Math.hypot(s.x - p.x, s.z - p.z) > 3.4) return;
    if (Math.hypot(s.x, s.z) < 5.5) {
      // despeja na fogueira: cada tora voa em arco (efeito) e queima ao cair
      let i = 0;
      for (const k in s.load) {
        if (!FIRE_TIME[k]) continue;
        let n = s.load[k];
        while (n-- > 0 && i < 40) {
          const l = this.spawnLoot(k, 1, s.x, this.w.height(s.x, s.z) + 0.9, s.z, 0, 0, 0, i * 0.12, p.id, true);
          const T = 0.6;
          l.vx = (-s.x + (this.r() - 0.5) * 0.4) / T;
          l.vz = (-s.z + (this.r() - 0.5) * 0.4) / T;
          l.vy = (0.6 - 0.9 + 0.5 * GRAV * T * T) / T;
          i++;
        }
        delete s.load[k];
      }
      this.verStruct++;
      this.ev(i ? 'dump' : 'need', { p: p.id, i: i ? 'fire' : 'wood', n: i, x: s.x, z: s.z });
      return;
    }
    if (this.nearStore(p)) {
      let n = 0;
      for (const k in s.load) (n += s.load[k]), this.addStash(k, s.load[k]);
      s.load = {};
      this.verStruct++;
      this.ev('dump', { p: p.id, i: 'store', n, x: s.x, z: s.z });
      return;
    }
    // põe o que está na mão no carrinho
    const h = p.slots[p.sel];
    if (h && isRes(h.id)) {
      const n = Math.min(h.n, this.cartRoom(s));
      if (n <= 0) return void this.ev('need', { p: p.id, i: 'space' });
      s.load[h.id] = (s.load[h.id] ?? 0) + n;
      h.n -= n;
      if (h.n <= 0) p.slots[p.sel] = null;
      this.verStruct++;
      this.ev('cargo', { p: p.id, i: h.id, n, x: s.x, z: s.z });
    }
  }
  private stepHaul(dt: number): void {
    for (const s of this.structs) {
      if (!s.by) continue;
      const p = this.player(s.by);
      if (!p || p.faint > 0 || p.seat >= 0) {
        s.by = '';
        this.verStruct++;
        continue;
      }
      const sled = ITEM[s.k]?.place?.kind === 'sled';
      const d = sled ? -1.7 : 1.35;
      const tx = p.x + Math.sin(p.yaw) * d;
      const tz = p.z + Math.cos(p.yaw) * d;
      const k = sled ? Math.min(1, dt * 5) : 1;
      s.x += (tx - s.x) * k;
      s.z += (tz - s.z) * k;
      const ty = sled ? Math.atan2(p.x - s.x, p.z - s.z) : p.yaw;
      s.r = -ty;
    }
  }

  /* ------------------------------ árvores / nós / baús ------------------------------ */
  hitTree(p: Player, i: number): void {
    const t = this.w.trees[i];
    if (!t || this.treeT[i]) return;
    if (Math.hypot(t.x - p.x, t.z - p.z) > 3.6) return;
    const ax = bestAxe(p.slots.slice(0, HOT));
    if (p.swing > 0.1) return;
    p.swing = Math.min(0.35, ax.cd * 0.7);
    const side = this.treeSide.get(i) ?? Math.atan2(p.x - t.x, p.z - t.z);
    this.treeSide.set(i, side);
    const h = (this.treeHit.get(i) ?? 0) + ax.pow;
    this.ev('chop', { x: t.x, z: t.z, p: p.id, n: i, a: side, y: Math.min(1, h / t.hp) });
    if (h < t.hp) {
      this.treeHit.set(i, h);
      this.verTrees++;
      return;
    }
    this.treeHit.delete(i);
    this.treeSide.delete(i);
    this.treeT[i] = this.night + 2;
    this.verTrees++;
    // cai para longe de quem cortou, girando no entalhe
    const a = Math.atan2(t.x - p.x, t.z - p.z);
    this.felled.push({ id: this.nextId++, i, a, hp: Math.round(1 + t.s * 1.5), age: 0 });
    this.verLoot++;
    this.ev('fell', { x: t.x, z: t.z, p: p.id, n: i, a });
  }
  /** bate na árvore caída: vira toras e galhos (às vezes maçã, semente, seiva) */
  hitLog(p: Player, id: number): void {
    const f = this.felled.find((q) => q.id === id);
    if (!f || f.age < 1) return;
    const t = this.w.trees[f.i];
    const h = 4.6 * t.s;
    const mx = t.x + Math.sin(f.a) * h * 0.4;
    const mz = t.z + Math.cos(f.a) * h * 0.4;
    if (Math.hypot(mx - p.x, mz - p.z) > h * 0.5 + 2.6) return;
    const ax = bestAxe(p.slots.slice(0, HOT));
    if (p.swing > 0.1) return;
    p.swing = Math.min(0.35, ax.cd * 0.7);
    f.hp -= Math.max(1, ax.pow * 0.75);
    this.ev('logchop', { x: mx, z: mz, p: p.id, n: f.id });
    if (f.hp > 0) return;
    this.felled = this.felled.filter((q) => q !== f);
    this.verLoot++;
    const logs = Math.round(2 + t.s * 1.5);
    const g: Bag = { wood: logs, twig: 1 + Math.floor(this.r() * 3) };
    if (t.k === 0 && this.r() < 0.45) g.apple = 1 + Math.floor(this.r() * 2);
    if (this.r() < 0.35) g.seed = 1;
    if (t.k === 1 && this.r() < 0.3) g.sap = 1;
    // veículo com caçamba por perto: as toras vão direto para ela
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
    // toras ao longo do tronco caído
    const gy = (x: number, z: number) => this.w.height(x, z) + 0.5;
    let k = 0;
    for (const id2 in g) {
      for (let q = 0; q < (g[id2] ?? 0); q++, k++) {
        const along = id2 === 'wood' ? 0.6 + (q / Math.max(1, logs - 1)) * h * 0.55 : h * (0.55 + this.r() * 0.35);
        const x = t.x + Math.sin(f.a) * along + (this.r() - 0.5) * 0.8;
        const z = t.z + Math.cos(f.a) * along + (this.r() - 0.5) * 0.8;
        const sa = this.r() * TAU;
        this.spawnLoot(id2, 1, x, gy(x, z), z, Math.sin(sa) * 1.2, 3 + this.r() * 2, Math.cos(sa) * 1.2, k * 0.04);
      }
    }
    this.ev('split', { x: mx, z: mz, p: p.id, n: f.i, a: f.a });
  }
  takeNode(p: Player, i: number): void {
    const n = this.w.nodes[i];
    if (!n || this.nodeT[i]) return;
    if (Math.hypot(n.x - p.x, n.z - p.z) > 3.2) return;
    // pedra e sucata pedem golpes; o resto sai na mão
    const hard = n.k === NK.Rock ? 3 : n.k === NK.Junk ? 2 : 0;
    if (hard) {
      if (p.swing > 0.1) return;
      const ax = bestAxe(p.slots.slice(0, HOT));
      p.swing = Math.min(0.35, ax.cd * 0.7);
      const h = (this.nodeHit.get(i) ?? 0) + Math.max(1, ax.pow * 0.8);
      this.ev('nodehit', { x: n.x, z: n.z, p: p.id, n: n.k });
      if (h < hard) return void this.nodeHit.set(i, h);
      this.nodeHit.delete(i);
    }
    this.nodeT[i] = this.night + NODE_REGROW[n.k];
    this.verTrees++;
    const g: Bag = { ...(NODE_GIVES[n.k] as Bag) };
    if (n.k === NK.Junk && this.r() < 0.35) g.spark = 1;
    if (n.k === NK.Bush && this.r() < 0.3) g.seed = 1;
    if (n.k === NK.Grass && this.r() < 0.25) g.seed = 1;
    p.swing = 0.25;
    this.pop(g, n.x, n.z, 0, n.k === NK.Rock ? 1 : 0.7);
    this.ev('take', { x: n.x, z: n.z, p: p.id, n: n.k, i: Object.keys(g)[0] });
  }
  openChest(p: Player, i: number): void {
    const c = this.w.chests[i];
    if (!c || this.chestOpen[i]) return;
    if (Math.hypot(c.x - p.x, c.z - p.z) > 3) return;
    this.chestOpen[i] = 1;
    this.verChest++;
    const pool = CHEST_LOOT[c.tier];
    const loot: Bag = { ...pool[Math.floor(this.r() * pool.length)] };
    if (this.r() < 0.6) loot.spark = (loot.spark ?? 0) + 1;
    const items = CHEST_ITEMS[c.tier];
    const it = items[Math.floor(this.r() * items.length)];
    loot[it] = (loot[it] ?? 0) + 1;
    this.pop(loot, c.x, c.z, 0.25, 0.8);
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
  /** ajudante joga lenha na fogueira (do que carrega ou do baú) */
  private botFeed(p: Player): void {
    let k = countOf(p.slots, 'wood') ? 'wood' : countOf(p.slots, 'twig') ? 'twig' : '';
    if (k) takeFrom(p.slots, k, 1);
    else if ((this.stash.wood ?? 0) > 0) (k = 'wood'), this.spend('wood', 1);
    else return;
    this.launch(p, k, { yaw: Math.atan2(-p.x, -p.z), pitch: 0, tx: 0, tz: 0, ty: 0.5 });
  }
  hasPot(): boolean {
    return this.structs.some((s) => s.k === 'pot');
  }
  /** motivo de não poder fazer (ou null) */
  craftBlock(d: ItemDef, p?: Player): 'tier' | 'res' | 'pot' | 'have' | null {
    if (d.tier > this.bench) return 'tier';
    if (d.camp === 'bench' && (d.benchTo ?? 0) <= this.bench) return 'have';
    if (d.camp === 'ring' && this.fire.ring) return 'have';
    if (d.camp === 'bellows' && this.fire.bellows) return 'have';
    if (d.camp === 'bigfire' && this.fire.big) return 'have';
    if (d.camp === 'compass' && this.compass) return 'have';
    if (d.pot && !this.hasPot()) return 'pot';
    for (const k in d.cost) if (this.avail(k, p) < (d.cost[k as Res] ?? 0)) return 'res';
    return null;
  }
  benchLocked(level: number): boolean {
    return this.rescued < BENCH_BABIES[level];
  }
  craft(p: Player, id: string): void {
    const d = ITEM[id];
    if (!d) return;
    if (Math.hypot(p.x - BENCH_POS[0], p.z - BENCH_POS[1]) > 5) return;
    const why = this.craftBlock(d, p);
    if (why) return void this.ev('need', { p: p.id, i: why === 'res' ? Object.keys(d.cost).find((k) => this.avail(k, p) < (d.cost[k as Res] ?? 0)) : why });
    if (d.camp === 'bench' && this.benchLocked(d.benchTo!)) return void this.ev('need', { p: p.id, i: 'baby' });
    for (const k in d.cost) this.spend(k, d.cost[k as Res] ?? 0, p);
    const q = d.qty ?? 1;
    if (d.camp === 'bench') this.bench = d.benchTo!;
    else if (d.camp === 'ring') this.fire.ring = true;
    else if (d.camp === 'bellows') this.fire.bellows = true;
    else if (d.camp === 'bigfire') (this.fire.big = true), (this.fire.max = fireCap(this.fire.lv, true));
    else if (d.camp === 'compass') this.compass = true;
    else this.give(p, id, q);
    this.ev('craft', { p: p.id, i: id, x: BENCH_POS[0], z: BENCH_POS[1] });
  }
  eat(p: Player, id: string): void {
    const raw = RAW_FOOD[id as Res];
    let f: { hunger: number; warmth?: number; hearts?: number } | undefined;
    if (raw) f = { hunger: raw };
    else {
      const d = ITEM[id];
      if (!d?.food) return;
      f = d.food;
    }
    if (countOf(p.slots, id) > 0) takeFrom(p.slots, id, 1);
    else if ((this.stash[id] ?? 0) > 0 && Math.hypot(p.x, p.z) < CAMP_R + 4) this.spend(id, 1);
    else return;
    p.hunger = Math.min(100, p.hunger + f.hunger);
    p.warmth = Math.min(100, p.warmth + (f.warmth ?? 0));
    p.hearts = Math.min(HEARTS, p.hearts + (f.hearts ?? 0));
    this.ev('eat', { p: p.id, x: p.x, z: p.z, i: id });
  }
  use(p: Player, id: string, x: number, z: number, r: number): void {
    const d = ITEM[id];
    if (!d || countOf(p.slots, id) <= 0) return;
    if (d.food) return this.eat(p, id);
    if (Math.hypot(x - p.x, z - p.z) > 14) return;
    if (d.throwLight) {
      const L = d.throwLight;
      this.flashes.push({ id: this.nextId++, x, z, r: L.r, t: L.t, dmg: L.dmg, k: id });
      this.ev('flare', { x, z, p: p.id, i: id });
    } else if (d.place) {
      if (Math.hypot(x, z) < 1.6 || Math.hypot(x - BENCH_POS[0], z - BENCH_POS[1]) < 1.4 || Math.hypot(x - CHEST_POS[0], z - CHEST_POS[1]) < 1.3) return void this.ev('need', { p: p.id, i: 'space' });
      this.structs.push({ id: this.nextId++, k: id, x, z, r, hp: d.place.hp ?? 10, burn: d.place.burn ?? 0, a: d.place.kind === 'trap' ? 3 : 0, b: 0, t: 0, ...(d.place.haul ? { by: '', load: {} } : {}) });
      this.verStruct++;
      this.ev('place', { x, z, p: p.id, i: id });
    } else return;
    takeFrom(p.slots, id, 1);
  }
  /** pegar de volta uma construção (tocha apagada, cerca no lugar errado...) */
  pickUp(p: Player, sid: number): void {
    const s = this.structs.find((q) => q.id === sid);
    if (!s || Math.hypot(s.x - p.x, s.z - p.z) > 3.5) return;
    this.structs = this.structs.filter((q) => q !== s);
    this.verStruct++;
    const d = ITEM[s.k]?.place;
    if (s.load) for (const k in s.load) this.addStash(k, s.load[k]);
    if (!(d?.burn && s.burn <= 0)) this.give(p, s.k, 1);
    this.ev('pick', { x: s.x, z: s.z, p: p.id, i: s.k });
  }
  doBonk(p: Player, yaw: number): void {
    if (p.swing > 0.05) return;
    p.swing = 0.4;
    p.yaw = yaw;
    const h = ITEM[this.held(p) ?? '']?.bonk ?? 0;
    const dmg = 1 + h * 1.5;
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
      this.pop(kind === 'garden' ? { carrot: 3 } : { berry: 4 }, s.x, s.z, 0, 0.6);
      this.verStruct++;
      this.ev('take', { x: s.x, z: s.z, p: p.id, i: kind === 'garden' ? 'carrot' : 'berry' });
      return;
    }
    const out: Res = kind === 'kiln' ? 'coal' : kind === 'still' ? 'fuel' : 'battery';
    let got = 0;
    if (s.b > 0) {
      got = s.b;
      this.pop({ [out]: s.b }, s.x, s.z, 0, 0.6);
      s.b = 0;
    }
    // carrega entrada do baú/mochila (até 5)
    const take = (k: Res, n: number) => this.spend(k, n, p);
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
    for (const k in st.cost) if (this.avail(k, p) < (st.cost[k as Res] ?? 0)) return void this.ev('need', { p: p.id, i: k });
    for (const k in st.cost) this.spend(k, st.cost[k as Res] ?? 0, p);
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
      if (!this.spend(e, 1, p)) break;
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
            this.give(p, 'wood', 1);
            this.ev('pickup', { x: l.x, z: l.z, p: p.id, i: 'wood', n: 1 });
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
    if (this.phase === 'day' && !this.duskSent && this.clock > DAY_LEN - DUSK - 6) {
      this.duskSent = true;
      const ni = this.nightNow(this.night);
      this.ev('dusk', { n: this.night, i: (ni.boss ? [...ni.kinds, CK.King] : ni.kinds).join(',') });
    }
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
    this.stepVeh(dt);
    this.stepLoot(dt);
    for (const f of this.flashes) f.t -= dt;
    if (this.flashes.some((f) => f.t <= 0)) this.flashes = this.flashes.filter((f) => f.t > 0);
  }

  private toNight(): void {
    this.phase = 'night';
    this.spawnT = 4;
    this.bossDone = false;
    const ni = this.nightNow();
    this.ev('night', { n: this.night, i: ni.boss ? 'boss' : ni.fog ? 'fog' : ni.moon ? 'moon' : ni.shy ? 'calm' : '' });
    for (const k of ni.fresh) this.ev('newc', { n: k });
  }
  private toDay(): void {
    this.phase = 'day';
    this.duskSent = false;
    for (const c of this.creatures) this.ev('poof', { x: c.x, z: c.z, n: c.k });
    this.creatures = [];
    this.survived = this.night;
    this.night++;
    // recompensa da manhã: brilhinhos no baú
    this.addStash('spark', 1 + Math.floor(this.survived / 3));
    // rebrota
    for (let i = 0; i < this.treeT.length; i++) if (this.treeT[i] && this.treeT[i] <= this.night) this.treeT[i] = 0;
    for (let i = 0; i < this.nodeT.length; i++) if (this.nodeT[i] && this.nodeT[i] <= this.night) this.nodeT[i] = 0;
    this.verTrees++;
    if (this.night % 3 === 1) {
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
    f.flare = Math.max(0, f.flare - dt * 1.2);
    const was = f.fuel;
    f.fuel = Math.max(0, f.fuel - this.fireBurn() * dt);
    if (was > 0 && f.fuel <= 0) this.ev('fireout');
    if (f.fuel <= 0 && this.phase === 'night') {
      f.outT += dt;
      if (f.outT > 25) {
        this.over = true;
        this.ev('over', { n: this.survived });
      }
    } else if (f.fuel > 0) f.outT = 0;
    const left = this.fireLeft();
    if (f.fuel > 0 && left < 40 && Math.floor(this.time / 9) !== Math.floor((this.time - dt) / 9)) this.ev('firelow', { n: Math.round(left) });
  }

  private stepPlayers(dt: number, L: LightSrc[]): void {
    const fr = this.fireR();
    for (const p of this.players) {
      p.swing = Math.max(0, p.swing - dt);
      p.invT = Math.max(0, p.invT - dt);
      p.fullT = Math.max(0, p.fullT - dt);
      if (p.faint > 0) {
        p.faint -= dt;
        if (p.faint <= 0) this.respawn(p);
        continue;
      }
      if (p.sel >= HOT || p.sel < 0) p.sel = 0;
      // luz: lanterna na mão acende
      p.lightOn = heldKind(this.held(p)) === 'lamp' && (p.bot ? this.phase === 'night' : true);
      if (p.bot) this.stepBot(p, dt, L);
      const dFire = Math.hypot(p.x, p.z);
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
      this.unhaul(p);
      p.faint = 5;
      if (p.carry >= 0) this.dropBaby(p);
      // metade da mochila cai no chão (dá para buscar depois)
      for (let i = HOT; i < p.slots.length; i++) {
        const s = p.slots[i];
        if (!s || i % 2) continue;
        p.slots[i] = null;
        const a = this.r() * TAU;
        this.spawnLoot(s.id, s.n, p.x, this.w.height(p.x, p.z) + 0.8, p.z, Math.sin(a) * 2, 3, Math.cos(a) * 2);
      }
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
    const bed = this.structs.find((s) => s.k === 'tent') ?? this.structs.find((s) => s.k === 'bedroll');
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
    const ni = this.nightNow();
    const hpMul = ni.hp + (k === CK.King ? (Math.floor(this.night / 10) - 1) * 0.4 : 0);
    const sz = k === CK.King ? 1 + (Math.floor(this.night / 10) - 1) * 0.15 : ni.size * (0.92 + this.r() * 0.16);
    this.creatures.push({ id: this.nextId++, k, x, z, hp: d.hp * hpMul, max: d.hp * hpMul, lit: 0, drain: 0, vx: 0, vz: 0, t: this.r() * 10, summonT: 6, sz });
    if (k === CK.King) this.ev('boss', { x, z });
  }

  private stepCreatures(dt: number, L: LightSrc[]): void {
    if (this.phase === 'night') {
      const ni = this.nightNow();
      this.spawnT -= dt;
      const alive = this.creatures.filter((c) => c.k !== CK.King).length;
      if (this.spawnT <= 0 && alive < ni.cap && this.clock > NIGHT_LEN * ni.start) {
        this.spawnT = ni.every * (0.7 + this.r() * 0.6);
        const roll = this.r();
        const has = (k: CK) => ni.kinds.includes(k);
        let k: CK = CK.Small;
        if (has(CK.Big) && roll < 0.14) k = CK.Big;
        else if (has(CK.Hopper) && roll < 0.4) k = CK.Hopper;
        else if (has(CK.Mist) && roll < (ni.fog ? 0.75 : 0.5)) k = CK.Mist;
        this.spawn(k);
        // bando: mais 1–2 do mesmo tipo juntinho
        if (this.r() < ni.pack) {
          const c = this.creatures[this.creatures.length - 1];
          for (let i = 0; i < 1 + Math.floor(this.r() * 2) && alive + i + 1 < ni.cap; i++) this.spawn(k, c.x + (this.r() - 0.5) * 4, c.z + (this.r() - 0.5) * 4);
        }
      }
      if (ni.boss && !this.bossDone && this.clock > NIGHT_LEN * 0.25) {
        this.bossDone = true;
        this.spawn(CK.King);
      }
    }
    const fr = this.fireR();
    const shy = this.nightNow().shy;
    const spd = this.nightNow().speed;
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
      if (tp && !shy) [tx, tz] = [tp.x, tp.z];
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
      let sp = spd * D.speed * (shy ? 0.6 : 1) * (c.k === CK.Hopper ? 0.6 + Math.max(0, Math.sin(c.t * 5)) * 1.2 : 1);
      let mx = dx;
      let mz = dz;
      c.drain = Math.max(0, c.drain - dt);
      if (ahead > 0 && c.k !== CK.King) {
        // na borda da luz da fogueira: suga combustível
        const df = Math.hypot(c.x, c.z);
        if (fr > 0 && df < fr + 2.5 && !shy) {
          this.fire.fuel = Math.max(0, this.fire.fuel - 0.6 * dt * (c.k === CK.Big ? 2 : 1));
          c.drain = 0.3;
        }
        mx = -dz * Math.sin(c.id) - dx * 0.5;
        mz = dx * Math.sin(c.id) - dz * 0.5;
        sp *= lit > 0 ? 1.4 : 0.5;
      }
      if (c.k === CK.King) {
        const df = Math.hypot(c.x, c.z);
        if (df < fr + 3) {
          this.fire.fuel = Math.max(0, this.fire.fuel - 3 * dt);
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
      if (tp && !shy && Math.hypot(tp.x - c.x, tp.z - c.z) < 0.55 + D.size * c.sz * 0.45) {
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
        this.pop({ spark: CDEFS[c.k].spark * (this.nightNow().moon ? 2 : 1) }, c.x, c.z, 0, 0.6);
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
    this.stepHaul(dt);
    for (const f of this.felled) f.age += dt;
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

  /* ------------------------------ ajudantes ------------------------------ */
  /** ajudantes andam mais devagar que você, levam pouco e às vezes pedem ajuda */
  private moveTo(p: Player, x: number, z: number, dt: number, stop = 1.2): boolean {
    const dx = x - p.x;
    const dz = z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < stop) return true;
    const sp = 3.3 * dt;
    const k = Math.min(1, sp / d);
    const ox = p.x;
    const oz = p.z;
    [p.x, p.z] = this.collide(p.x + dx * k, p.z + dz * k, 0.4);
    if (Math.hypot(p.x - ox, p.z - oz) < sp * 0.3) [p.x, p.z] = this.collide(p.x - (dz / d) * sp, p.z + (dx / d) * sp, 0.4);
    p.yaw = Math.atan2(dx, dz);
    return false;
  }
  private botSel(p: Player, kind: 'axe' | 'lamp' | 'res'): void {
    const i = p.slots.findIndex((s, j) => j < HOT && s && heldKind(s.id) === kind);
    if (i >= 0) p.sel = i;
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
    p.askT -= dt;
    let near: Creature | null = null;
    let nd = 15;
    for (const c of this.creatures) {
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < nd) (nd = d), (near = c);
    }
    // medo: no escuro com Sombrinha perto, para e pede ajuda (até alguém chegar)
    if (p.scared > 0) {
      p.scared -= dt;
      const friend = this.players.some((q) => !q.bot && Math.hypot(q.x - p.x, q.z - p.z) < 4.5);
      if (friend || this.phase === 'day') p.scared = 0;
      else {
        this.botSel(p, 'lamp');
        if (near) p.aim = p.yaw = Math.atan2(near.x - p.x, near.z - p.z);
        return;
      }
    }
    if (this.phase === 'night' && near && nd < 7 && this.litAt(p.x, p.z, L) <= 0 && p.askT <= 0) {
      p.askT = 30 + this.r() * 20;
      p.scared = 10;
      this.ev('ask', { p: p.id, x: p.x, z: p.z });
      return;
    }
    const night = this.phase === 'night' && !!near;
    if (night) {
      this.botSel(p, 'lamp');
      p.aim = Math.atan2(near!.x - p.x, near!.z - p.z);
    }
    switch (p.cmd) {
      case 'stay':
        break;
      case 'follow':
        if (lead) {
          const i = this.players.filter((q) => q.bot).indexOf(p);
          const a = lead.yaw + Math.PI + (i % 2 ? 0.7 : -0.7) * (1 + Math.floor(i / 2) * 0.6);
          this.moveTo(p, lead.x + Math.sin(a) * 2.4, lead.z + Math.cos(a) * 2.4, dt, 0.8);
        }
        break;
      case 'guard': {
        const fr = Math.max(3, this.fireR());
        const a = near ? Math.atan2(near.z, near.x) : this.players.indexOf(p) * 2;
        const R = Math.max(2.4, fr - 1.5);
        this.moveTo(p, Math.cos(a) * R, Math.sin(a) * R, dt, 0.8);
        if (this.fireLeft() < 50 && Math.hypot(p.x, p.z) < 8 && p.actT <= 0) {
          p.actT = 3;
          this.botFeed(p);
        }
        break;
      }
      case 'wood': {
        const carried = countOf(p.slots, 'wood') + countOf(p.slots, 'twig');
        if (carried >= 4 || (this.phase === 'night' && this.litAt(p.x, p.z, L) <= 0 && nd < 8)) {
          // volta e joga na fogueira (um por vez)
          if (this.moveTo(p, p.x * 0.25, p.z * 0.25, dt, 6) || Math.hypot(p.x, p.z) < 7) {
            p.tgt = -1;
            if (p.actT <= 0 && carried > 0) {
              p.actT = 1.1;
              this.botFeed(p);
            }
          }
          break;
        }
        // toras no chão por perto? vai pegar
        let lb: Loot | null = null;
        let ld = 14;
        for (const l of this.loot) {
          if (!l.rest || (l.k !== 'wood' && l.k !== 'twig')) continue;
          const d = Math.hypot(l.x - p.x, l.z - p.z);
          if (d < ld) (ld = d), (lb = l);
        }
        if (lb) {
          this.moveTo(p, lb.x, lb.z, dt, 0.6);
          break;
        }
        const fl = this.felled.find((f) => f.age > 1 && Math.hypot(this.w.trees[f.i].x - p.x, this.w.trees[f.i].z - p.z) < 12);
        if (fl) {
          const t = this.w.trees[fl.i];
          const h = 4.6 * t.s;
          const mx = t.x + Math.sin(fl.a) * h * 0.4;
          const mz = t.z + Math.cos(fl.a) * h * 0.4;
          if (this.moveTo(p, mx, mz, dt, 1.6) && p.actT <= 0) {
            p.actT = 1.2;
            this.botSel(p, 'axe');
            this.hitLog(p, fl.id);
          }
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
            p.actT = 1.2;
            p.yaw = Math.atan2(t.x - p.x, t.z - p.z);
            this.botSel(p, 'axe');
            this.hitTree(p, p.tgt);
          }
        }
        break;
      }
    }
  }

  /* ------------------------------ salvar ------------------------------ */
  /** retrato da partida (solo/anfitrião) para continuar depois */
  toSave(myId: string): RunSave {
    const me = this.player(myId);
    const nz = (a: ArrayLike<number>) => {
      const o: number[] = [];
      for (let i = 0; i < a.length; i++) if (a[i]) o.push(i, a[i]);
      return o;
    };
    return {
      v: 1,
      seed: this.seed,
      night: this.night,
      phase: this.phase,
      clock: Math.round(this.clock),
      survived: this.survived,
      rescued: this.rescued,
      poofs: this.poofs,
      won: this.won,
      fire: { ...this.fire },
      stash: { ...this.stash },
      bench: this.bench,
      compass: this.compass,
      diff: this.diff,
      helpers: this.helpers,
      tr: nz(this.treeT),
      nd: nz(this.nodeT),
      ch: nz(this.chestOpen),
      bb: this.babies.map((b) => (b.st === 2 ? [2, b.x, b.z] : [0])),
      sc: this.structs.map((q) => ({ ...q, by: '' })),
      lt: this.loot.filter((l) => l.d <= 0).map((l) => [l.k, l.n, Math.round(l.x * 10) / 10, Math.round(l.z * 10) / 10]),
      me: me ? { slots: packSlots(me.slots), sel: me.sel, wear: { ...me.wear }, hearts: me.hearts, hunger: Math.round(me.hunger), warmth: Math.round(me.warmth), x: me.x, z: me.z } : null,
      nextId: this.nextId,
    };
  }
  loadSave(o: RunSave, myId: string): void {
    this.night = o.night;
    this.phase = o.phase === 'night' ? 'night' : 'day';
    this.clock = o.clock;
    this.survived = o.survived;
    this.rescued = o.rescued;
    this.poofs = o.poofs;
    this.won = o.won;
    this.fire = { ...this.fire, ...o.fire, flare: 0 };
    this.stash = { ...o.stash };
    this.bench = o.bench;
    this.compass = o.compass;
    this.diff = o.diff ?? 1;
    this.helpers = o.helpers ?? 0;
    const unz = (a: Int16Array | Uint8Array, l: number[]) => {
      for (let i = 0; i + 1 < l.length; i += 2) if (l[i] < a.length) a[l[i]] = l[i + 1];
    };
    unz(this.treeT, o.tr);
    unz(this.nodeT, o.nd);
    unz(this.chestOpen, o.ch);
    o.bb.forEach((r, i) => {
      const b = this.babies[i];
      if (b && r[0] === 2) [b.st, b.x, b.z] = [2, r[1], r[2]];
    });
    this.structs = o.sc.filter((q) => ITEM[q.k]);
    this.nextId = Math.max(this.nextId, o.nextId ?? 1, ...this.structs.map((q) => q.id + 1));
    for (const [k, n, x, z] of o.lt) if ((ITEM[k] || isRes(k)) && n > 0) {
      const l = this.spawnLoot(k, n, x, this.w.height(x, z) + 0.1, z, 0, 0, 0);
      l.rest = true;
      l.age = 5;
    }
    const me = this.player(myId);
    if (me && o.me) {
      me.wear = { ...o.me.wear };
      me.slots = fitSlots(unpackSlots(o.me.slots), this.cap(me));
      me.sel = o.me.sel ?? 0;
      me.hearts = o.me.hearts;
      me.hunger = o.me.hunger;
      me.warmth = o.me.warmth;
      [me.x, me.z] = this.collide(o.me.x, o.me.z, 0.4);
    }
    this.verTrees++;
    this.verStruct++;
    this.verChest++;
    this.verLoot++;
  }

  /* ------------------------------ estatísticas ------------------------------ */
  stashCount(): number {
    return bagCount(this.stash);
  }
}

export interface RunSave {
  v: 1;
  seed: number;
  night: number;
  phase: string;
  clock: number;
  survived: number;
  rescued: number;
  poofs: number;
  won: boolean;
  fire: Fire;
  stash: Bag;
  bench: number;
  compass: boolean;
  diff: number;
  helpers: number;
  tr: number[];
  nd: number[];
  ch: number[];
  bb: number[][];
  sc: Struct[];
  lt: [string, number, number, number][];
  me: { slots: (0 | [string, number])[]; sel: number; wear: Partial<Record<Slot, string>>; hearts: number; hunger: number; warmth: number; x: number; z: number } | null;
  nextId: number;
}
