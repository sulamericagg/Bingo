/* ============================================================
 *  COZINHA MALUCA — simulação (sem DOM). Mesma lógica para 2D e 3D.
 *  Grade de bancadas (estações) + jogadores livres no piso.
 *  Sem alocação por quadro: itens nascem só em eventos (pegar da caixa).
 * ============================================================ */
import {
  BURN_AFTER, FIRE_AFTER, FIRE_SPREAD, INGS, PROC_TIME, RECIPES, compIng, compRoute, compStage, comp, dayParams, recipeProcs,
  type DayParams, type Proc, type Role, type Special, type Theme, type UpId,
} from './data';
import type { Level } from './levels';

export type SK = 'counter' | 'crate' | 'board' | 'pot' | 'pan' | 'oven' | 'blender' | 'plates' | 'sink' | 'dirty' | 'trash' | 'window' | 'belt';
export const COOKERS: Partial<Record<SK, Proc>> = { pot: 'boil', pan: 'fry', oven: 'bake', blender: 'blend' };

export const enum IK {
  Ing = 0,
  Plate = 1,
  Ext = 2,
  Dirty = 3,
}
export interface Item {
  id: number;
  k: IK;
  /** componente (ingrediente) */
  c: number;
  burnt: boolean;
  /** progresso do processo atual 0..1 */
  prog: number;
  /** tempo além do ponto */
  over: number;
  parts: number[];
  /** pratos sujos empilhados */
  n: number;
  /** posição no piso (se solto) */
  x: number;
  y: number;
  /** visual: altura/pulo */
  z: number;
  vz: number;
}
export interface Station {
  i: number;
  k: SK;
  x: number;
  y: number;
  item: Item | null;
  /** contagem (pratos limpos / sujos / na pia) */
  n: number;
  /** ingrediente da caixa */
  ing: number;
  /** fogo 0..1 (0 = sem fogo) */
  fire: number;
  fireT: number;
  /** progresso de lavar/picar mostrado */
  prog: number;
  /** alguém agindo aqui neste quadro */
  busy: number;
  /** lado da bancada voltado para o piso (dx,dy) */
  fx: number;
  fy: number;
  /** quem colocou (bots) */
  claim: number;
  /** animação de "bump" */
  bump: number;
  /** fogo/forno/liquidificador ligado (só conta com sim.manualHeat — 3D com botão físico) */
  heat: boolean;
}
export interface PIn {
  mx: number;
  my: number;
  pick: boolean;
  act: boolean;
}
export interface Player {
  id: number;
  name: string;
  skin: string;
  bot: boolean;
  /** humano remoto (online) */
  remote: boolean;
  role: Role;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number;
  fy: number;
  hold: Item | null;
  target: number;
  /** alvo forçado (bots) */
  force: number;
  in: PIn;
  pickPrev: boolean;
  walk: number;
  acting: number;
  emote: string;
  emoteT: number;
  happy: number;
  speedMul: number;
  hid: number;
  /** ações úteis feitas (medir a parte dos ajudantes) */
  work: number;
  /** ajudante: ícone de estado acima da cabeça ('' = nada) */
  pet: string;
  /** cosmético: chapéu*16 + avental (só visual) */
  look: number;
}
export interface Order {
  id: number;
  r: number;
  t: number;
  max: number;
  vip: boolean;
  claim: number;
  seat: number;
  /** animação de entrada */
  a: number;
}
export const enum FX {
  Chop = 1,
  Sizzle,
  Done,
  Burn,
  Fire,
  Ext,
  Serve,
  Wrong,
  Drop,
  Pick,
  Place,
  Wash,
  Expire,
  Order,
  Coins,
  Event,
  Bump,
}
export interface FxEv {
  t: FX;
  x: number;
  y: number;
  v: number;
}

export function mulberry(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SimOpts {
  day: number;
  seed: number;
  ups: Record<UpId, number>;
  /** pacotes de receitas liberados */
  packs: number[];
  crew: number;
  /** força tema/evento (dev/screenshot) */
  theme?: Theme;
  special?: Special;
  /** layout em pé (celular na vertical) */
  portrait?: boolean;
  /** cliente online: só move o próprio boneco; o host manda o resto */
  client?: boolean;
  /** fase da campanha (substitui a curva do modo sem fim) */
  level?: Level;
}

const PR = 0.32; // raio do jogador
const REACH = 1.35;

export class Sim {
  readonly p: DayParams;
  readonly day: number;
  cols = 9;
  rows = 7;
  /** 0 piso, 1 bancada, 2 parede/sem uso */
  grid!: Uint8Array;
  /** estação por célula (-1) */
  stAt!: Int16Array;
  st: Station[] = [];
  players: Player[] = [];
  floor: Item[] = [];
  orders: Order[] = [];
  menu: number[] = [];
  theme: Theme = 'classic';
  special: Special = 'none';
  specialAt = 1e9;
  specialLeft = 0;
  specialShown = false;
  time = 0;
  ended = false;
  cash = 0;
  tips = 0;
  served = 0;
  missed = 0;
  burnt = 0;
  fires = 0;
  combo = 0;
  bestCombo = 0;
  totalPlates = 4;
  private nextOrder = 2;
  private orderId = 1;
  private itemId = 1;
  private returnQ: number[] = [];
  /** 3D em 1ª pessoa: a física dos itens soltos é do renderizador (não pula/escorrega aqui) */
  physFloor = false;
  /** 3D físico: fogão/forno/liquidificador só cozinham com o botão ligado (station.heat) */
  manualHeat = false;
  /** pratos quebrados (3D) */
  broken = 0;
  private ghost: Player | null = null;
  readonly rnd: () => number;
  readonly ups: Record<UpId, number>;
  /** fila de efeitos (anel) */
  fx: FxEv[] = [];
  fxHead = 0;
  fxCount = 0;
  seats = 4;
  /** apagão em andamento */
  get outage(): boolean {
    return this.special === 'outage' && this.specialLeft > 0;
  }

  /** trabalho feito por humanos / ajudantes (ações úteis) */
  workHuman = 0;
  workBot = 0;
  /** parte do trabalho feita por ajudantes 0..1 */
  get botShare(): number {
    const t = this.workHuman + this.workBot;
    return t ? this.workBot / t : 0;
  }
  readonly lv: Level | null;
  constructor(readonly o: SimOpts) {
    this.day = o.day;
    this.ups = o.ups;
    this.lv = o.level ?? null;
    this.p = this.lv ? { ...this.lv.p } : dayParams(o.day, o.ups);
    this.rnd = mulberry(o.seed ^ (o.day * 2654435761));
    for (let i = 0; i < 48; i++) this.fx.push({ t: 0 as FX, x: 0, y: 0, v: 0 });
    this.seats = Math.min(8, 3 + o.ups.dining + Math.floor(o.day / 4));
    this.pickTheme();
    this.buildMenuAndLayout();
    this.totalPlates = this.lv?.plates || 3 + Math.min(5, Math.ceil(this.p.maxOrders * 0.8)) + Math.floor(o.crew / 2);
    const plates = this.st.find((s) => s.k === 'plates');
    if (plates) plates.n = this.totalPlates;
  }

  /* ------------------------------ geração ------------------------------ */
  private pickTheme(): void {
    const d = this.day;
    if (this.lv) {
      this.theme = this.o.theme ?? this.lv.theme;
      this.special = this.o.special ?? this.lv.special;
      if (this.special !== 'none') this.specialAt = this.p.len * 0.4;
      return;
    }
    if (this.o.theme) this.theme = this.o.theme;
    else if (d >= 5 && d % 5 === 0) this.theme = (['boat', 'space', 'truck'] as Theme[])[Math.floor(d / 5) % 3];
    if (this.o.special) this.special = this.o.special;
    else if (this.rnd() < this.p.eventChance) this.special = (['rush', 'critic', 'outage'] as Special[])[Math.floor(this.rnd() * 3)];
    if (this.special !== 'none') this.specialAt = this.o.special ? 3 : this.p.len * (0.3 + this.rnd() * 0.3);
  }

  private buildMenuAndLayout(): void {
    if (this.lv) {
      let menu = this.lv.menu.slice();
      for (let tries = 0; tries < 10; tries++) {
        if (this.layout(menu)) break;
        menu = menu.slice(0, Math.max(1, menu.length - 1));
      }
      this.menu = menu;
      return;
    }
    const unlocked: number[] = [];
    RECIPES.forEach((r, i) => {
      if (this.o.packs.includes(r.pack)) unlocked.push(i);
    });
    // embaralha com preferência para receitas de pacotes mais novos (variedade)
    for (let i = unlocked.length - 1; i > 0; i--) {
      const j = Math.floor(this.rnd() * (i + 1));
      const tmp = unlocked[i];
      unlocked[i] = unlocked[j];
      unlocked[j] = tmp;
    }
    unlocked.sort((a, b) => RECIPES[b].pack - RECIPES[a].pack + (this.rnd() - 0.5) * 3.5);
    let menu = unlocked.slice(0, Math.max(1, this.p.menu));
    for (let tries = 0; tries < 10; tries++) {
      if (this.layout(menu)) break;
      menu = menu.slice(0, Math.max(1, menu.length - 1));
    }
    this.menu = menu;
  }

  private layout(menu: number[]): boolean {
    let cols = this.p.cols;
    let rows = this.p.rows;
    if (this.theme === 'truck') {
      cols = Math.max(9, cols + 2);
      rows = 5;
    }
    if (this.o.portrait) {
      const t = cols;
      cols = Math.max(this.theme === 'truck' ? 6 : 7, rows);
      rows = Math.max(9, t);
    }
    this.cols = cols;
    this.rows = rows;
    const N = cols * rows;
    const grid = new Uint8Array(N);
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1) grid[y * cols + x] = 1;
    for (const c of [0, cols - 1, N - cols, N - 1]) grid[c] = 2;
    // ilha central
    if (rows >= 7 && cols >= 10) {
      const iy = Math.floor(rows / 2);
      const x0 = 3;
      const x1 = cols - 4;
      const gap = x1 - x0 >= 6 ? Math.floor((x0 + x1) / 2) : -1;
      for (let x = x0; x <= x1; x++) if (x !== gap && x !== gap + 1) grid[iy * cols + x] = 1;
    }
    if (rows >= 10 && cols >= 12) {
      // cozinhas grandes: bancadas extras em "ilhotas" verticais
      for (const x of [3, cols - 4]) for (let y = 2; y <= 3; y++) grid[y * cols + x] = 1;
    }
    // células usáveis: bancada com vizinho de piso
    const usable: number[] = [];
    const face = new Int8Array(N * 2);
    for (let i = 0; i < N; i++) {
      if (grid[i] !== 1) continue;
      const x = i % cols;
      const y = (i / cols) | 0;
      const dirs = [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ];
      for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        if (grid[ny * cols + nx] === 0) {
          face[i * 2] = dx;
          face[i * 2 + 1] = dy;
          usable.push(i);
          break;
        }
      }
    }
    // o que precisamos
    const need: { k: SK; ing?: number; zone: 'top' | 'bottom' | 'side' | 'island' | 'any' }[] = [];
    const procs = new Set<Proc>();
    const ings = new Set<number>();
    for (const ri of menu) {
      recipeProcs(RECIPES[ri], procs);
      for (const c of RECIPES[ri].parts) ings.add(compIng(c));
    }
    const big = cols >= 12;
    need.push({ k: 'window', zone: 'top' });
    if (this.ups.dining >= 3) need.push({ k: 'window', zone: 'top' });
    if (this.ups.conveyor > 0) need.push({ k: 'belt', zone: 'top' });
    need.push({ k: 'dirty', zone: 'top' }, { k: 'plates', zone: 'top' }, { k: 'sink', zone: 'top' });
    const crew = this.o.crew;
    const extra = (big ? 1 : 0) + (crew >= 4 ? 1 : 0);
    for (const pr of procs) {
      const k: SK = pr === 'chop' ? 'board' : pr === 'boil' ? 'pot' : pr === 'fry' ? 'pan' : pr === 'bake' ? 'oven' : 'blender';
      const n = Math.min(3, 1 + extra + (pr === 'chop' && crew >= 3 ? 1 : 0));
      for (let i = 0; i < n; i++) need.push({ k, zone: pr === 'chop' ? 'island' : 'side' });
    }
    for (const ig of [...ings].sort((a, b) => a - b)) need.push({ k: 'crate', ing: ig, zone: 'bottom' });
    need.push({ k: 'trash', zone: 'island' });
    const minPlain = 3;
    if (need.length + minPlain > usable.length) return false;

    // zonas
    const zoneOf = (i: number): 'top' | 'bottom' | 'side' | 'island' => {
      const x = i % cols;
      const y = (i / cols) | 0;
      if (y === 0) return 'top';
      if (y === rows - 1) return 'bottom';
      if (x === 0 || x === cols - 1) return 'side';
      return 'island';
    };
    const free = new Set(usable);
    const assigned = new Map<number, { k: SK; ing: number }>();
    const cx = (cols - 1) / 2;
    const take = (zone: string, k: SK): number => {
      let best = -1;
      let bs = 1e9;
      for (const i of free) {
        const z = zoneOf(i);
        const x = i % cols;
        const y = (i / cols) | 0;
        let s = this.rnd() * 0.8;
        if (zone !== 'any' && z !== zone) s += 100;
        if (k === 'window') s += Math.abs(x - cx) * 2;
        else if (k === 'dirty' || k === 'plates' || k === 'sink' || k === 'belt') s += Math.abs(x - cx) * 0.6;
        else if (zone === 'side') s += Math.abs(y - rows / 2) * 0.3;
        if (s < bs) {
          bs = s;
          best = i;
        }
      }
      if (best >= 0) free.delete(best);
      return best;
    };
    for (const n of need) {
      const i = take(n.zone, n.k);
      if (i < 0) return false;
      assigned.set(i, { k: n.k, ing: n.ing ?? -1 });
    }
    // monta
    this.grid = grid;
    this.stAt = new Int16Array(N).fill(-1);
    this.st = [];
    for (let i = 0; i < N; i++) {
      if (grid[i] === 0) continue;
      const a = assigned.get(i);
      const s: Station = {
        i: this.st.length,
        k: a ? a.k : 'counter',
        x: i % cols,
        y: (i / cols) | 0,
        item: null,
        n: 0,
        ing: a ? a.ing : -1,
        fire: 0,
        fireT: 0,
        prog: 0,
        busy: 0,
        fx: face[i * 2],
        fy: face[i * 2 + 1],
        claim: 0,
        bump: 0,
        heat: false,
      };
      if (grid[i] === 2) s.k = 'counter';
      this.stAt[i] = s.i;
      this.st.push(s);
    }
    // extintor numa bancada livre
    const plain = this.st.filter((s) => s.k === 'counter' && (s.fx || s.fy));
    if (plain.length) {
      const s = plain[Math.floor(this.rnd() * plain.length)];
      s.item = this.newItem(IK.Ext, 0);
    }
    return true;
  }

  /* ------------------------------ jogadores ------------------------------ */
  addPlayer(id: number, name: string, skin: string, bot: boolean, role: Role, remote = false): Player {
    const spawn = this.spawnPoint(this.players.length);
    const p: Player = {
      id,
      name,
      skin,
      bot,
      remote,
      role,
      x: spawn[0],
      y: spawn[1],
      vx: 0,
      vy: 0,
      fx: 0,
      fy: -1,
      hold: null,
      target: -1,
      force: -1,
      in: { mx: 0, my: 0, pick: false, act: false },
      pickPrev: false,
      walk: 0,
      acting: 0,
      emote: '',
      emoteT: 0,
      happy: 0,
      speedMul: bot ? 0.68 + this.rnd() * 0.06 : 1,
      hid: 0,
      work: 0,
      pet: '',
      look: 0,
    };
    this.players.push(p);
    return p;
  }
  spawnPoint(i: number): [number, number] {
    const cx = this.cols / 2;
    const cy = this.rows - 2 + 0.5;
    const off = [0, -1.2, 1.2, -2.4, 2.4, -3.6][i % 6];
    let x = Math.floor(cx + off) + 0.5;
    let y = cy;
    if (!this.isFloor(x, y)) {
      x = 1.5 + (i % Math.max(1, this.cols - 3));
      y = this.rows - 1.5;
    }
    return [x, y];
  }
  isFloor(x: number, y: number): boolean {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return false;
    return this.grid[ty * this.cols + tx] === 0;
  }

  /* ------------------------------ itens ------------------------------ */
  newItem(k: IK, c: number): Item {
    return { id: this.itemId++, k, c, burnt: false, prog: 0, over: 0, parts: [], n: 0, x: 0, y: 0, z: 0, vz: 0 };
  }
  /** próximo processo pendente do ingrediente (ou null se pronto) */
  nextProc(it: Item): Proc | null {
    if (it.k !== IK.Ing || it.burnt) return null;
    const g = INGS[compIng(it.c)];
    const route = g.routes[compRoute(it.c)];
    const s = compStage(it.c);
    return s < route.length ? route[s] : null;
  }
  /** a estação pode processar o item? (escolhe rota no estágio 0) */
  private acceptProc(it: Item, proc: Proc): boolean {
    if (it.k !== IK.Ing || it.burnt) return false;
    const gi = compIng(it.c);
    const g = INGS[gi];
    const s = compStage(it.c);
    if (s === 0) {
      for (let r = 0; r < g.routes.length; r++)
        if (g.routes[r][0] === proc) {
          it.c = comp(gi, r, 0);
          return true;
        }
      return false;
    }
    return g.routes[compRoute(it.c)][s] === proc;
  }

  /** como acceptProc, sem mudar nada */
  private acceptsProc(it: Item, proc: Proc): boolean {
    if (it.k !== IK.Ing || it.burnt) return false;
    const g = INGS[compIng(it.c)];
    const s = compStage(it.c);
    if (s === 0) return g.routes.some((r) => r[0] === proc);
    return g.routes[compRoute(it.c)][s] === proc;
  }
  /**
   * O que aconteceria se `h` fosse solto na estação (mesmas regras de pickRaw, sem efeitos):
   * 0 = recusa, 1 = fica/entra, 2 = combina com o prato ("+"), 3 = entrega.
   */
  wouldAccept(si: number, h: Item): 0 | 1 | 2 | 3 {
    const s = this.st[si];
    if (!s || s.fire > 0 || (!s.fx && !s.fy)) return 0;
    if (s.k === 'window' || s.k === 'belt') return h.k === IK.Plate && h.parts.length && !(s.k === 'belt' && s.item) ? 3 : 0;
    if (s.k === 'trash') return (h.k === IK.Plate && h.parts.length) || h.k === IK.Ing ? 1 : 0;
    if (s.k === 'sink') return h.k === IK.Dirty ? 1 : 0;
    if (s.k === 'plates') return h.k === IK.Plate && !h.parts.length ? 1 : 0;
    if (s.k === 'crate') return h.k === IK.Ing && compIng(h.c) === s.ing && compStage(h.c) === 0 && !h.burnt ? 1 : 0;
    if (s.k === 'dirty') return 0;
    const it = s.item;
    if (it) {
      if (it.k === IK.Plate && h.k === IK.Ing && !h.burnt && it.parts.length < 4) return 2;
      if (h.k === IK.Plate && it.k === IK.Ing && !it.burnt && h.parts.length < 4 && (!COOKERS[s.k] || this.nextProc(it) !== COOKERS[s.k] || s.k === 'counter')) return 2;
      return 0;
    }
    const proc = COOKERS[s.k];
    if (proc) return this.acceptsProc(h, proc) ? 1 : 0;
    return h.k === IK.Dirty ? 0 : 1;
  }
  /** lavar na pia sem "mirar" (torneira aberta no 3D). Retorna true se lavou algo */
  washAt(si: number, dt: number, p: Player | null): boolean {
    const s = this.st[si];
    if (!s || s.k !== 'sink' || s.n <= 0 || s.fire > 0) return false;
    s.prog += (dt * (p?.bot ? 0.6 : 1)) / 1.6;
    s.busy = 0.15;
    if (Math.random() < dt * 3) this.emit(FX.Wash, s.x + 0.5, s.y + 0.5);
    if (s.prog >= 1) {
      this.washOne(s);
      this.credit(p);
    }
    return true;
  }

  emit(t: FX, x: number, y: number, v = 0): void {
    const e = this.fx[(this.fxHead + this.fxCount) % this.fx.length];
    e.t = t;
    e.x = x;
    e.y = y;
    e.v = v;
    if (this.fxCount < this.fx.length) this.fxCount++;
    else this.fxHead = (this.fxHead + 1) % this.fx.length;
  }
  /** consome efeitos (renderizadores chamam a cada quadro) */
  drainFx(cb: (e: FxEv) => void): void {
    while (this.fxCount > 0) {
      const e = this.fx[this.fxHead];
      this.fxHead = (this.fxHead + 1) % this.fx.length;
      this.fxCount--;
      cb(e);
    }
  }

  /* ------------------------------ alvo (mira automática) ------------------------------ */
  aim(p: Player): number {
    if (p.force >= 0) return p.force;
    const tx = Math.floor(p.x);
    const ty = Math.floor(p.y);
    let best = -1;
    let bs = 1e9;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = tx + dx;
        const y = ty + dy;
        if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) continue;
        const si = this.stAt[y * this.cols + x];
        if (si < 0) continue;
        const s = this.st[si];
        if (!s.fx && !s.fy) continue;
        const ddx = x + 0.5 - p.x;
        const ddy = y + 0.5 - p.y;
        const dist = Math.hypot(ddx, ddy);
        if (dist > REACH) continue;
        const dot = (ddx * p.fx + ddy * p.fy) / (dist || 1);
        const sc = dist - dot * 0.9;
        if (sc < bs) {
          bs = sc;
          best = si;
        }
      }
    return best;
  }

  /* ------------------------------ ações ------------------------------ */
  private nearFloorItem(p: Player): Item | null {
    let best: Item | null = null;
    let bd = 0.85;
    for (const it of this.floor) {
      const d = Math.hypot(it.x - p.x - p.fx * 0.3, it.y - p.y - p.fy * 0.3);
      if (d < bd) {
        bd = d;
        best = it;
      }
    }
    return best;
  }
  private dropToFloor(p: Player, it: Item, fling = 0.55): void {
    it.x = p.x + p.fx * fling;
    it.y = p.y + p.fy * fling;
    if (!this.isFloor(it.x, it.y)) {
      it.x = p.x;
      it.y = p.y;
    }
    it.z = 0.6;
    it.vz = 1.5;
    this.floor.push(it);
    this.emit(FX.Drop, it.x, it.y, it.id);
  }
  /* ---------- ponte para o 3D físico (itens voando/soltos são do renderizador) ---------- */
  /** coloca um item solto no chão em (x,y) (sem pulo) */
  dropAt(it: Item, x: number, y: number): void {
    it.x = x;
    it.y = y;
    it.z = 0;
    it.vz = 0;
    if (!this.floor.includes(it)) this.floor.push(it);
  }
  /** tira um item do chão (pegou / pousou numa estação) */
  takeFloor(it: Item): boolean {
    const i = this.floor.indexOf(it);
    if (i < 0) return false;
    this.floor.splice(i, 1);
    return true;
  }
  /**
   * Um item que chegou VOANDO (ou foi solto) numa estação: mesma regra de "Pegar/Soltar"
   * com as mãos cheias. 0 = recusou (quica), 1 = ficou na estação (ou foi servido/lixo),
   * 2 = o item mudou mas continua solto (prato pegou o ingrediente da bancada, lixo esvaziou o prato).
   */
  placeInto(si: number, it: Item, by: Player | null = null): 0 | 1 | 2 {
    const s = this.st[si];
    if (!s || s.fire > 0 || (!s.fx && !s.fy)) return 0;
    let g = this.ghost;
    if (!g) g = this.ghost = this.addGhost();
    g.x = s.x + 0.5 + s.fx;
    g.y = s.y + 0.5 + s.fy;
    g.fx = -s.fx;
    g.fy = -s.fy;
    g.hold = it;
    g.force = si;
    g.bot = by?.bot ?? false;
    g.id = by?.id ?? 0;
    const np = it.parts.length;
    this.pick(g);
    g.force = -1;
    if (g.hold !== it) {
      g.hold = null;
      return 1;
    }
    g.hold = null;
    return it.parts.length !== np ? 2 : 0;
  }
  private addGhost(): Player {
    return { id: 0, name: '', skin: '', bot: false, remote: true, role: 'cook', x: 0, y: 0, vx: 0, vy: 0, fx: 0, fy: 1, hold: null, target: -1, force: -1, in: { mx: 0, my: 0, pick: false, act: false }, pickPrev: false, walk: 0, acting: 0, emote: '', emoteT: 0, happy: 0, speedMul: 1, hid: 0, work: 0, pet: '', look: 0 };
  }
  /** prato (ou pilha suja) quebrou no 3D: o conteúdo se perde e os pratos voltam sujos depois */
  breakPlate(it: Item): void {
    const n = it.k === IK.Dirty ? Math.max(1, it.n) : it.k === IK.Plate ? 1 : 0;
    for (let i = 0; i < n; i++) this.returnQ.push(this.time + 5 + i * 0.5);
    this.broken += n;
    this.takeFloor(it);
  }
  /** item perdido (caiu fora da cozinha): ingrediente some; prato volta sujo; extintor volta à bancada */
  lose(it: Item): void {
    this.takeFloor(it);
    if (it.k === IK.Plate || it.k === IK.Dirty) this.breakPlate(it);
    else if (it.k === IK.Ext) {
      const c = this.st.find((s) => s.k === 'counter' && (s.fx || s.fy) && !s.item);
      if (c) c.item = it;
    }
  }

  /** quem fez uma ação útil (humano ou ajudante) */
  credit(p: Player | null): void {
    if (!p) return;
    p.work++;
    if (p.bot) this.workBot++;
    else this.workHuman++;
    const real = this.players.find((q) => q.id === p.id);
    if (real && real !== p) real.work++;
  }
  /** Pegar/Soltar (conta como trabalho quando muda algo) */
  pick(p: Player): void {
    const h = p.hold;
    const n = h ? h.parts.length : 0;
    const sv = this.served;
    this.pickRaw(p);
    if (p.hold !== h || (h && h.parts.length !== n) || this.served !== sv) this.credit(p);
  }
  private pickRaw(p: Player): void {
    const si = this.aim(p);
    const s = si >= 0 ? this.st[si] : null;
    const h = p.hold;
    // chão primeiro se não houver estação
    if (!h) {
      const fi = this.nearFloorItem(p);
      if (fi && (!s || !this.canTake(s))) {
        this.floor.splice(this.floor.indexOf(fi), 1);
        p.hold = fi;
        fi.z = 0;
        this.emit(FX.Pick, p.x, p.y);
        return;
      }
      if (!s || s.fire > 0) return this.bumpSt(s);
      if (s.k === 'crate') {
        p.hold = this.newItem(IK.Ing, comp(s.ing, 0, 0));
        s.bump = 1;
        this.emit(FX.Pick, s.x + 0.5, s.y + 0.5);
        return;
      }
      if (s.k === 'plates') {
        if (s.n > 0) {
          s.n--;
          p.hold = this.newItem(IK.Plate, 0);
          this.emit(FX.Pick, s.x + 0.5, s.y + 0.5);
        } else this.bumpSt(s);
        return;
      }
      if (s.k === 'dirty') {
        if (s.n > 0) {
          const it = this.newItem(IK.Dirty, 0);
          it.n = s.n;
          s.n = 0;
          p.hold = it;
          this.emit(FX.Pick, s.x + 0.5, s.y + 0.5);
        } else this.bumpSt(s);
        return;
      }
      if (s.item) {
        p.hold = s.item;
        s.item = null;
        s.prog = 0;
        s.claim = 0;
        this.emit(FX.Pick, s.x + 0.5, s.y + 0.5);
        return;
      }
      return this.bumpSt(s);
    }
    // mãos ocupadas
    if (!s || s.fire > 0) {
      this.dropToFloor(p, h);
      p.hold = null;
      return;
    }
    if (s.k === 'window' || s.k === 'belt') {
      if (h.k === IK.Plate && h.parts.length) {
        if (s.k === 'belt') {
          if (!s.item) {
            s.item = h;
            s.prog = 0;
            p.hold = null;
            this.emit(FX.Place, s.x + 0.5, s.y + 0.5);
          }
          return;
        }
        this.serve(h, s, p);
        p.hold = null;
        return;
      }
      return this.bumpSt(s);
    }
    if (s.k === 'trash') {
      if (h.k === IK.Plate) {
        if (h.parts.length) {
          h.parts.length = 0;
          this.emit(FX.Drop, s.x + 0.5, s.y + 0.5);
        }
        return;
      }
      if (h.k === IK.Ing) {
        p.hold = null;
        this.emit(FX.Drop, s.x + 0.5, s.y + 0.5);
      }
      return;
    }
    if (s.k === 'sink') {
      if (h.k === IK.Dirty) {
        s.n += h.n;
        p.hold = null;
        this.emit(FX.Place, s.x + 0.5, s.y + 0.5);
      } else this.bumpSt(s);
      return;
    }
    if (s.k === 'plates') {
      if (h.k === IK.Plate && !h.parts.length) {
        s.n++;
        p.hold = null;
        this.emit(FX.Place, s.x + 0.5, s.y + 0.5);
      } else this.bumpSt(s);
      return;
    }
    if (s.k === 'crate') {
      // devolver ingrediente cru do mesmo tipo
      if (h.k === IK.Ing && compIng(h.c) === s.ing && compStage(h.c) === 0 && !h.burnt) {
        p.hold = null;
        this.emit(FX.Place, s.x + 0.5, s.y + 0.5);
        return;
      }
      return this.bumpSt(s);
    }
    if (s.k === 'dirty') return this.bumpSt(s);
    // combinar com prato
    const si2 = s.item;
    if (si2) {
      if (si2.k === IK.Plate && h.k === IK.Ing && !h.burnt && si2.parts.length < 4) {
        si2.parts.push(h.c);
        si2.parts.sort((a, b) => a - b);
        p.hold = null;
        s.bump = 1;
        this.emit(FX.Place, s.x + 0.5, s.y + 0.5, 1);
        return;
      }
      if (h.k === IK.Plate && si2.k === IK.Ing && !si2.burnt && h.parts.length < 4 && (!COOKERS[s.k] || this.nextProc(si2) !== COOKERS[s.k] || s.k === 'counter')) {
        h.parts.push(si2.c);
        h.parts.sort((a, b) => a - b);
        s.item = null;
        s.prog = 0;
        s.claim = 0;
        s.bump = 1;
        this.emit(FX.Place, s.x + 0.5, s.y + 0.5, 1);
        return;
      }
      return this.bumpSt(s);
    }
    // colocar
    const proc = COOKERS[s.k];
    if (proc) {
      if (h.k === IK.Ing && this.acceptProc(h, proc)) {
        s.item = h;
        h.prog = 0;
        h.over = 0;
        p.hold = null;
        s.claim = p.bot ? p.id : 0;
        // ajudantes ligam o fogo sozinhos (no 3D o jogador gira o botão)
        if (p.bot) s.heat = true;
        this.emit(FX.Place, s.x + 0.5, s.y + 0.5);
        return;
      }
      return this.bumpSt(s);
    }
    if (s.k === 'board') {
      if (h.k === IK.Ing) this.acceptProc(h, 'chop');
      if (h.k === IK.Dirty) return this.bumpSt(s);
    }
    if (h.k === IK.Dirty) return this.bumpSt(s);
    s.item = h;
    h.prog = 0;
    p.hold = null;
    s.claim = p.bot ? p.id : 0;
    this.emit(FX.Place, s.x + 0.5, s.y + 0.5);
  }
  private canTake(s: Station): boolean {
    return !!s.item || (s.k === 'crate') || (s.k === 'plates' && s.n > 0) || (s.k === 'dirty' && s.n > 0);
  }
  private bumpSt(s: Station | null): void {
    if (s) {
      s.bump = 1;
      this.emit(FX.Bump, s.x + 0.5, s.y + 0.5);
    }
  }

  /** Ação (segurar): picar, lavar, apagar fogo */
  act(p: Player, dt: number): boolean {
    const h = p.hold;
    if (h && h.k === IK.Ext) {
      // jato à frente: apaga estações em cone
      let hit = false;
      for (const s of this.st) {
        if (s.fire <= 0) continue;
        const dx = s.x + 0.5 - p.x;
        const dy = s.y + 0.5 - p.y;
        const d = Math.hypot(dx, dy);
        if (d > 2.6) continue;
        if ((dx * p.fx + dy * p.fy) / (d || 1) < 0.35 && d > 1.0) continue;
        s.fire = Math.max(0, s.fire - dt * (p.bot ? 0.55 : 0.9));
        hit = true;
        if (s.fire === 0) {
          this.credit(p);
          s.fireT = 0;
          if (s.item && s.item.k === IK.Ing) s.item.over = -1e6; // carvão: não reacende
          this.emit(FX.Ext, s.x + 0.5, s.y + 0.5, 1);
        }
      }
      if (Math.random() < 0.5) this.emit(FX.Ext, p.x + p.fx * 0.8, p.y + p.fy * 0.8, 0);
      return hit || true;
    }
    if (h) return false;
    const si = this.aim(p);
    if (si < 0) return false;
    const s = this.st[si];
    if (s.fire > 0) return false;
    if (s.k === 'board' && s.item && s.item.k === IK.Ing && this.nextProc(s.item) === 'chop') {
      const it = s.item;
      it.prog += (dt * (1 + this.ups.knife * 0.22) * (p.bot ? 0.6 : 1)) / PROC_TIME.chop;
      s.busy = 0.15;
      if (Math.random() < dt * 7) this.emit(FX.Chop, s.x + 0.5, s.y + 0.5);
      if (it.prog >= 1) {
        it.prog = 0;
        it.c += 1; // estágio +1
        this.credit(p);
        this.emit(FX.Done, s.x + 0.5, s.y + 0.5);
      }
      return true;
    }
    if (s.k === 'sink' && s.n > 0) return this.washAt(si, dt, p);
    return false;
  }
  private washOne(s: Station): void {
    s.prog = 0;
    s.n--;
    const pl = this.st.find((x) => x.k === 'plates');
    if (pl) pl.n++;
    this.emit(FX.Done, s.x + 0.5, s.y + 0.5);
  }

  /* ------------------------------ pedidos ------------------------------ */
  private spawnOrder(vip = false): void {
    if (!this.menu.length) return;
    const r = this.menu[Math.floor(this.rnd() * this.menu.length)];
    const parts = RECIPES[r].parts.length;
    let max = this.p.patience + parts * this.p.perPart;
    if (vip) max *= 0.75;
    const used = new Set(this.orders.map((o) => o.seat));
    let seat = 0;
    while (used.has(seat) && seat < 16) seat++;
    this.orders.push({ id: this.orderId++, r, t: max, max, vip, claim: 0, seat, a: 0 });
    this.emit(FX.Order, 0, 0, r);
  }
  /** pratos iguais? (partes ordenadas) */
  static same(a: number[], b: number[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  matchOrder(parts: number[]): Order | null {
    let best: Order | null = null;
    for (const o of this.orders) if (Sim.same(RECIPES[o.r].parts, parts) && (!best || o.t < best.t)) best = o;
    return best;
  }
  private serve(plate: Item, s: Station, p: Player | null): void {
    const o = this.matchOrder(plate.parts);
    if (!o) {
      // devolvido! prato volta ao chão na frente do balcão
      this.emit(FX.Wrong, s.x + 0.5, s.y + 0.5);
      this.combo = 0;
      plate.x = s.x + 0.5 + s.fx * 1.1;
      plate.y = s.y + 0.5 + s.fy * 1.1;
      plate.z = 1;
      plate.vz = 3;
      this.floor.push(plate);
      return;
    }
    const r = RECIPES[o.r];
    const frac = Math.max(0, o.t / o.max);
    const base = Math.round(r.price * this.p.priceMul);
    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const tip = Math.round(base * (0.1 + 0.5 * frac) * (1 + this.ups.dining * 0.12 + this.ups.decor * 0.06) * (1 + Math.min(4, this.combo - 1) * 0.1));
    const pay = (base + tip) * (o.vip ? 2 : 1);
    this.cash += pay;
    this.tips += tip;
    this.served++;
    this.orders.splice(this.orders.indexOf(o), 1);
    this.returnQ.push(this.time + (this.ups.conveyor ? 3 - this.ups.conveyor : 6));
    if (p) p.happy = 1.2;
    this.emit(FX.Serve, s.x + 0.5, s.y + 0.5, pay);
  }

  /* ------------------------------ passo ------------------------------ */
  /** cliente online: chamado no lugar de pick() */
  clientPick: ((p: Player) => void) | null = null;

  step(dt: number): void {
    if (this.ended) return;
    if (this.o.client) {
      for (const st of this.st) if (st.bump > 0) st.bump = Math.max(0, st.bump - dt * 5);
      for (const p of this.players) this.movePlayer(p, dt);
      return;
    }
    this.time += dt;
    // eventos especiais
    if (!this.specialShown && this.time >= this.specialAt) {
      this.specialShown = true;
      this.specialLeft = this.special === 'critic' ? 0.01 : this.special === 'outage' ? 12 : 25;
      this.emit(FX.Event, 0, 0, 0);
      if (this.special === 'critic') this.spawnOrder(true);
    }
    if (this.specialLeft > 0) this.specialLeft = Math.max(0, this.specialLeft - dt);
    // pedidos
    this.nextOrder -= dt;
    const rush = this.special === 'rush' && this.specialLeft > 0;
    if (this.nextOrder <= 0 && this.time < this.p.len - 8) {
      if (this.orders.length < this.p.maxOrders) this.spawnOrder();
      const e = this.p.every * (rush ? 0.45 : 1);
      this.nextOrder = e * (0.75 + this.rnd() * 0.5);
      if (this.orders.length === 0) this.nextOrder = Math.min(this.nextOrder, 2);
    }
    if (this.orders.length === 0 && this.nextOrder > 3 && this.time < this.p.len - 8) this.nextOrder = 3;
    for (let i = this.orders.length - 1; i >= 0; i--) {
      const o = this.orders[i];
      o.a = Math.min(1, o.a + dt * 3);
      o.t -= dt;
      if (o.t <= 0) {
        this.orders.splice(i, 1);
        this.missed++;
        this.combo = 0;
        this.emit(FX.Expire, 0, 0, o.r);
      }
    }
    // pratos sujos voltando
    for (let i = this.returnQ.length - 1; i >= 0; i--)
      if (this.time >= this.returnQ[i]) {
        this.returnQ.splice(i, 1);
        const d = this.st.find((s) => s.k === 'dirty');
        if (d) d.n++;
      }
    // estações
    const cookMul = 1 + this.ups.stove * 0.2;
    for (const s of this.st) {
      if (s.bump > 0) s.bump = Math.max(0, s.bump - dt * 5);
      if (s.busy > 0) s.busy -= dt;
      const it = s.item;
      if (s.fire > 0) {
        s.fireT += dt;
        if (it && it.k === IK.Ing) it.burnt = true;
        if (this.ups.sprinkler && s.fireT > 6 / this.ups.sprinkler) s.fire = Math.max(0, s.fire - dt * 0.5);
        if (s.fire <= 0) {
          s.fireT = 0;
          if (it && it.k === IK.Ing) it.over = -1e6;
          continue;
        }
        if (s.fireT > FIRE_SPREAD) {
          s.fireT = FIRE_SPREAD * 0.4;
          this.spread(s);
        }
        continue;
      }
      if (s.k === 'sink' && this.ups.washer && s.n > 0) {
        s.prog += (dt * 0.22 * this.ups.washer) / 1.6;
        if (s.prog >= 1) this.washOne(s);
      }
      if (s.k === 'belt' && it) {
        s.prog += dt / 1.5;
        if (s.prog >= 1) {
          s.item = null;
          s.prog = 0;
          const w = this.st.find((x) => x.k === 'window') ?? s;
          this.serve(it, w, null);
        }
        continue;
      }
      const proc = COOKERS[s.k];
      if (!proc || !it || it.k !== IK.Ing) continue;
      if (this.outage) continue;
      if (this.manualHeat && !s.heat) continue;
      if (this.nextProc(it) === proc) {
        it.prog += (dt * cookMul) / PROC_TIME[proc];
        if (it.prog >= 1) {
          it.prog = 0;
          it.c += 1;
          it.over = 0;
          // o liquidificador desliga sozinho quando termina
          if (proc === 'blend') s.heat = false;
          this.emit(FX.Done, s.x + 0.5, s.y + 0.5);
        } else if (Math.random() < dt * 2) this.emit(FX.Sizzle, s.x + 0.5, s.y + 0.5, proc === 'boil' ? 1 : 0);
      } else if (proc !== 'blend' && !it.burnt) {
        it.over += dt;
        if (it.over > BURN_AFTER) {
          it.burnt = true;
          this.burnt++;
          this.emit(FX.Burn, s.x + 0.5, s.y + 0.5);
        }
      } else if (it.burnt && it.over > -1e5) {
        it.over += dt;
        if (it.over > BURN_AFTER + FIRE_AFTER) this.ignite(s);
      }
    }
    // itens no chão (pulo visual; no barco escorregam) — no 3D físico quem move é o renderizador
    if (!this.physFloor) for (const it of this.floor) {
      if (it.z > 0 || it.vz) {
        it.vz -= 12 * dt;
        it.z += it.vz * dt;
        if (it.z <= 0) {
          it.z = 0;
          it.vz = Math.abs(it.vz) > 2 ? -it.vz * 0.35 : 0;
        }
      }
      if (this.theme === 'boat') {
        const sway = Math.sin(this.time * 0.9) * 0.25 * dt;
        if (this.isFloor(it.x + sway, it.y)) it.x += sway;
      }
    }
    // jogadores
    for (const p of this.players) this.movePlayer(p, dt);
    if (this.time >= this.p.len) this.ended = true;
  }

  ignite(s: Station): void {
    if (s.fire > 0) return;
    s.fire = 1;
    s.fireT = 0;
    this.fires++;
    this.emit(FX.Fire, s.x + 0.5, s.y + 0.5);
  }
  private spread(s: Station): void {
    const opts = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    const [dx, dy] = opts[Math.floor(this.rnd() * 4)];
    const x = s.x + dx;
    const y = s.y + dy;
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return;
    const ni = this.stAt[y * this.cols + x];
    if (ni < 0) return;
    const n = this.st[ni];
    if (n.k === 'window' || n.k === 'sink' || n.k === 'belt') return;
    this.ignite(n);
  }

  private movePlayer(p: Player, dt: number): void {
    const inp = p.in;
    let mx = inp.mx;
    let my = inp.my;
    const ml = Math.hypot(mx, my);
    if (ml > 1) {
      mx /= ml;
      my /= ml;
    }
    const speed = 3.7 * (1 + this.ups.shoes * 0.08) * p.speedMul * (p.hold && p.hold.k === IK.Ext ? 0.85 : 1);
    const space = this.theme === 'space';
    const k = space ? 3 : this.theme === 'snow' ? 6 : 14;
    p.vx += (mx * speed - p.vx) * Math.min(1, k * dt);
    p.vy += (my * speed - p.vy) * Math.min(1, k * dt);
    if (ml > 0.2) {
      const l = Math.hypot(mx, my) || 1;
      p.fx = mx / l;
      p.fy = my / l;
      p.walk += dt * Math.hypot(p.vx, p.vy) * 2.4;
    }
    if (!p.remote) {
      this.collideMove(p, p.vx * dt, 0);
      this.collideMove(p, 0, p.vy * dt);
      // empurrão suave entre jogadores
      for (const q of this.players) {
        if (q === p) continue;
        const dx = p.x - q.x;
        const dy = p.y - q.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.001 && d < PR * 2) {
          const push = (PR * 2 - d) * 0.5;
          this.collideMove(p, (dx / d) * push, 0);
          this.collideMove(p, 0, (dy / d) * push);
        }
      }
    }
    p.target = this.aim(p);
    // pegar (borda)
    if (inp.pick && !p.pickPrev) {
      if (this.clientPick) this.clientPick(p);
      else this.pick(p);
    }
    p.pickPrev = inp.pick;
    if (this.o.client) p.acting = inp.act ? p.acting + dt : 0;
    else p.acting = inp.act ? (this.act(p, dt) ? p.acting + dt : 0) : 0;
    if (p.happy > 0) p.happy -= dt;
    if (p.emoteT > 0) {
      p.emoteT -= dt;
      if (p.emoteT <= 0) p.emote = '';
    }
  }
  private collideMove(p: Player, dx: number, dy: number): void {
    const nx = p.x + dx;
    const ny = p.y + dy;
    if (this.free(nx, ny)) {
      p.x = nx;
      p.y = ny;
    }
  }
  private free(x: number, y: number): boolean {
    const r = PR;
    return this.isFloor(x - r, y - r) && this.isFloor(x + r, y - r) && this.isFloor(x - r, y + r) && this.isFloor(x + r, y + r);
  }

  /* ------------------------------ resultado ------------------------------ */
  stars(): number {
    const g = this.p.goal;
    return this.cash >= g[2] ? 3 : this.cash >= g[1] ? 2 : this.cash >= g[0] ? 1 : 0;
  }
}
