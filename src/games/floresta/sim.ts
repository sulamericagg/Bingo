/* ============================================================
 *  LENHADORES DO BOSQUE — simulação (sem desenho).
 *  O mundo é um corredor ao longo de X (base → biomas); Z é a
 *  profundidade (usada no 3D; no 2D vira camada de profundidade).
 *  Pools pré-alocados: nada de alocação por quadro.
 * ============================================================ */
import {
  BIOMES, BIOME_LEN, BUILDS, HELPERS, INTAKE_X, MACHINES, RARES, SPECIES, TOOLS, VEHICLES, WORLD_Z,
  beltSpeed, biomeAt, gateX, growTime, helperCost, machineCost, mulberry, planerMult, planksPerLog, prestigeMult, prestigeSeeds,
  replantDelay, sawTime, type HelperId, type MachineId, type Rare,
} from './data';
import { type FlorestaSave, freshSave, writeSave } from './save';

export const SAW_X = 21;
export const PLANER_X = 13;
export const PALLET_X = 5;
export const SELL_X = 2.5;
export const DRONE_PAD_X = 30;

export const enum TS {
  Grown = 0,
  Falling = 1,
  Stump = 2,
  Sapling = 3,
}

export interface Tree {
  id: number;
  x: number;
  z: number;
  biome: number;
  sp: number;
  rare: Rare;
  state: TS;
  hp: number;
  maxHp: number;
  /** 0..1 crescimento da muda */
  grow: number;
  timer: number;
  /** direção da queda (unitária no plano XZ) */
  fdx: number;
  fdz: number;
  ang: number;
  angV: number;
  bounces: number;
  /** tremidinha ao levar golpe (s) */
  shake: number;
  /** quem derrubou: 0 eu, 1 ajudante/amigo-bot, 2 outro jogador */
  by: number;
  /** quem está mirando a árvore (índice do agente) ou -1 */
  claim: number;
  /** o 3D cuida da queda (cannon-es) e avisa com landTree() */
  ext: boolean;
  /** cliente (não-anfitrião) chegou a hp 0 e espera confirmação */
  pend: number;
  seed: number;
  /** plantada à mão: cresce mais rápido */
  fast?: boolean;
}

export interface Log {
  on: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rot: number;
  /** direção do eixo da tora (rad no plano XZ) */
  yaw: number;
  val: number;
  sp: number;
  rare: Rare;
  age: number;
  /** 1 = tora "fantasma" de outro jogador (só visual) */
  ghost: number;
  /** reservada por agente */
  claim: number;
}

export interface BeltItem {
  on: boolean;
  x: number;
  n: number;
  val: number;
  sp: number;
  planed: boolean;
}

export type AgentKind = 'bot' | 'drone' | 'planter' | 'friend';
export interface Agent {
  kind: AgentKind;
  idx: number;
  x: number;
  y: number;
  z: number;
  face: number;
  state: 'idle' | 'go' | 'chop' | 'collect' | 'home' | 'unload' | 'plant';
  tree: number;
  carry: number;
  carryVal: number;
  carrySp: number;
  cap: number;
  speed: number;
  dmg: number;
  rate: number;
  swing: number;
  wait: number;
  walk: number;
  name: string;
  skin: string;
  emote: string;
  emoteT: number;
  seed: number;
  rng: () => number;
}

export interface Remote {
  id: string;
  name: string;
  skin: string;
  x: number;
  z: number;
  tx: number;
  tz: number;
  face: number;
  carry: number;
  chop: number;
  vehicle: number;
  tool: number;
  emote: string;
  emoteT: number;
  walk: number;
  swing: number;
}

export type EvType = 'chip' | 'fell' | 'land' | 'pickup' | 'deliver' | 'saw' | 'plank' | 'sell' | 'build' | 'rare' | 'grow' | 'plant' | 'buy' | 'swing';
export interface Ev {
  type: EvType;
  x: number;
  y: number;
  z: number;
  a: number;
  b: number;
}

const MAX_LOGS = 90;
const MAX_BELT = 40;
const MAX_EV = 96;
const QUEUE = 256;
const TREE_GAP = 4.3;

export class Sim {
  s: FlorestaSave;
  mode3d = false;
  trees: Tree[] = [];
  logs: Log[] = [];
  /** 3D: toras na mão (o guia lê) */
  held3d = 0;
  belt: BeltItem[] = [];
  agents: Agent[] = [];
  remotes: Remote[] = [];
  time = 0;

  // jogador
  me = { x: INTAKE_X + 6, z: 0, vx: 0, vz: 0, face: 1, yaw: 0, swing: 0, swingT: 0, target: -1, carry: 0, carryVal: 0, walk: 0, unloadT: 0, emote: '', emoteT: 0 };
  carrySp = new Uint8Array(64);
  input = { mx: 0, mz: 0, chop: false };

  // serraria
  private qVal = new Float32Array(QUEUE);
  private qSp = new Uint8Array(QUEUE);
  private qHead = 0;
  qLen = 0;
  sawT = 0;
  sawSpin = 0;
  /** tora que está sendo serrada (para desenhar) */
  sawing = -1;

  // net
  isHost = true;
  /** 3D em primeira pessoa: a visão decide o alvo (mira), a coleta (mãos/veículo) e a entrega no funil */
  fps = false;
  /** árvore sob a mira (só com fps) */
  aim = -1;
  /** dirigindo um veículo (fps): a visão move o jogador */
  driving = false;
  /** altura do chão (3D com morros) */
  groundY: ((x: number, z: number) => number) | null = null;
  /** chamado quando o anfitrião precisa anunciar uma queda (tree, dirx, dirz) */
  onFell: ((t: Tree) => void) | null = null;
  /** dano que pedi ao anfitrião (cumulativo) por árvore */
  reqTree = -1;
  reqDmg = 0;

  // eventos para os desenhistas
  ev: Ev[] = [];
  evHead = 0;
  evCount = 0;

  // sessão
  sessionEarned = 0;
  sessionTrees = 0;
  sessionPlanks = 0;
  health = 1;
  toast: ((msg: string, kind?: string) => void) | null = null;
  private saveT = 0;
  private healthT = 0;

  constructor(save: FlorestaSave, seed = 20261109) {
    this.s = save;
    for (let i = 0; i < MAX_LOGS; i++) this.logs.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rot: 0, yaw: 0, val: 0, sp: 0, rare: 0, age: 0, ghost: 0, claim: -1 });
    for (let i = 0; i < MAX_BELT; i++) this.belt.push({ on: false, x: 0, n: 0, val: 0, sp: 0, planed: false });
    for (let i = 0; i < MAX_EV; i++) this.ev.push({ type: 'chip', x: 0, y: 0, z: 0, a: 0, b: 0 });
    this.buildForest(seed);
    this.syncHelpers();
  }

  /* ------------------------------ mundo ------------------------------ */

  private buildForest(seed: number): void {
    const r = mulberry(seed);
    let id = 0;
    for (let b = 0; b < BIOMES.length; b++) {
      const x0 = gateX(b) + 7;
      const x1 = gateX(b + 1) - 4;
      let row = 0;
      for (let x = x0; x < x1; x += TREE_GAP + r() * 1.6) {
        const z = (row++ % 2 === 0 ? -1 : 1) * (1.6 + r() * (WORLD_Z - 2.6));
        const t: Tree = {
          id: id++, x: x + r() * 0.8, z, biome: b, sp: BIOMES[b].species, rare: 0, state: TS.Grown, hp: 1, maxHp: 1, grow: 1, timer: 0,
          fdx: 1, fdz: 0, ang: 0, angV: 0, bounces: 0, shake: 0, by: 0, claim: -1, ext: false, pend: 0, seed: (r() * 1e9) | 0,
        };
        this.rollTree(t, r);
        this.trees.push(t);
      }
    }
  }

  private rollTree(t: Tree, r: () => number): void {
    const q = r();
    t.rare = (q < 0.022 ? 1 : q < 0.037 ? 2 : q < 0.052 ? 3 : 0) as Rare;
    const sp = SPECIES[t.sp];
    t.maxHp = t.hp = Math.round(sp.hp * RARES[t.rare].hpMult);
  }

  get tool() {
    return TOOLS[Math.min(TOOLS.length - 1, this.s.tool)];
  }
  get vehicle() {
    return VEHICLES[Math.min(VEHICLES.length - 1, this.s.vehicle)];
  }
  get limitX(): number {
    return this.s.unlocked >= BIOMES.length ? gateX(BIOMES.length) - 2 : gateX(this.s.unlocked) - 1.4;
  }
  /** multiplicador de venda (renovações × bosque saudável) */
  get saleMult(): number {
    return prestigeMult(this.s.seeds) * (this.health >= 0.75 ? 1.25 : 1);
  }
  get happy(): boolean {
    return this.health >= 0.75;
  }

  emit(type: EvType, x: number, y: number, z: number, a = 0, b = 0): void {
    const e = this.ev[(this.evHead + this.evCount) % MAX_EV];
    e.type = type;
    e.x = x;
    e.y = y;
    e.z = z;
    e.a = a;
    e.b = b;
    if (this.evCount < MAX_EV) this.evCount++;
    else this.evHead = (this.evHead + 1) % MAX_EV;
  }
  /** percorre e esvazia a fila de eventos */
  drain(cb: (e: Ev) => void): void {
    while (this.evCount > 0) {
      cb(this.ev[this.evHead]);
      this.evHead = (this.evHead + 1) % MAX_EV;
      this.evCount--;
    }
  }

  /* ------------------------------ ajudantes ------------------------------ */

  /** ajudantes só trabalham quando mandados: tarefas pendentes (1 árvore/canteiro cada) */
  orders = 0;
  /** jogar sozinho: sem ajudantes nem amigos-bot */
  solo = false;
  /** manda os ajudantes trabalharem (respondem com um pequeno atraso); devolve quantos */
  commandHelpers(): number {
    let n = 0;
    for (const a of this.agents) {
      if (a.kind === 'friend') continue;
      n++;
      if (a.state === 'idle') a.wait = 0.6 + a.idx * 0.35 + a.rng() * 0.3;
    }
    this.orders = n;
    return n;
  }
  helperCount(): number {
    let n = 0;
    for (const a of this.agents) if (a.kind !== 'friend') n++;
    return n;
  }
  setSolo(on: boolean): void {
    this.solo = on;
    if (on) {
      this.removeFriends();
      for (const a of this.agents) this.release(a);
      this.agents = [];
      this.orders = 0;
    } else this.syncHelpers();
  }

  syncHelpers(): void {
    if (this.solo) return;
    const want: Record<HelperId, number> = this.s.help;
    for (const kind of ['bot', 'drone', 'planter'] as const) {
      const id: HelperId = kind === 'bot' ? 'bots' : kind === 'drone' ? 'drones' : 'planters';
      let have = 0;
      for (const a of this.agents) if (a.kind === kind) have++;
      for (let i = have; i < want[id]; i++) this.addAgent(kind, i, '', '');
      if (have > want[id]) this.agents = this.agents.filter((a) => a.kind !== kind || a.idx < want[id]);
    }
    this.retuneAgents();
  }

  addAgent(kind: AgentKind, idx: number, name: string, skin: string): Agent {
    const seed = (kind.length * 977 + idx * 131 + name.length * 17) | 0;
    const a: Agent = {
      kind, idx, x: kind === 'drone' ? DRONE_PAD_X : INTAKE_X + 2 + idx, y: 0, z: (idx % 3) - 1, face: 1, state: 'idle', tree: -1, carry: 0, carryVal: 0, carrySp: 0,
      cap: 2, speed: 3, dmg: 1, rate: 1.5, swing: 0, wait: idx * 0.4, walk: 0, name, skin, emote: '', emoteT: 0, seed, rng: mulberry(seed + 99),
    };
    this.agents.push(a);
    this.retuneAgents();
    return a;
  }

  removeFriends(): void {
    for (const a of this.agents) if (a.kind === 'friend' && a.tree >= 0) this.trees[a.tree].claim = -1;
    this.agents = this.agents.filter((a) => a.kind !== 'friend');
  }

  private retuneAgents(): void {
    const td = this.tool.dmg;
    for (const a of this.agents) {
      if (a.kind === 'bot') {
        a.cap = 3;
        a.speed = 3.6;
        a.dmg = Math.max(1, td * 0.35);
        a.rate = 1.6;
      } else if (a.kind === 'drone') {
        a.cap = 4;
        a.speed = 9;
        a.dmg = Math.max(1, td * 0.6);
        a.rate = 2.4;
      } else if (a.kind === 'planter') {
        a.cap = 0;
        a.speed = 4;
        a.dmg = 0;
        a.rate = 1;
      } else {
        a.cap = Math.max(2, Math.round(this.vehicle.cap * 0.6));
        a.speed = Math.min(9, this.vehicle.speed * 0.85);
        a.dmg = Math.max(1, td * 0.7);
        a.rate = 2.1;
      }
    }
  }

  /* ------------------------------ passo ------------------------------ */

  step(dt: number): void {
    this.time += dt;
    this.stepPlayer(dt);
    this.stepTrees(dt);
    this.stepLogs(dt);
    this.stepAgents(dt);
    this.stepMill(dt);
    this.stepRemotes(dt);
    this.healthT -= dt;
    if (this.healthT <= 0) {
      this.healthT = 0.5;
      this.health = this.computeHealth();
    }
    this.saveT -= dt;
    if (this.saveT <= 0) {
      this.saveT = 4;
      writeSave(this.s);
    }
  }

  computeHealth(): number {
    let sum = 0;
    let n = 0;
    const maxB = this.s.unlocked;
    for (const t of this.trees) {
      if (t.biome >= maxB) continue;
      n++;
      if (t.state === TS.Grown) sum += 1;
      else if (t.state === TS.Sapling) sum += 0.25 + t.grow * 0.6;
    }
    return n ? sum / n : 1;
  }

  private stepPlayer(dt: number): void {
    const m = this.me;
    const v = this.vehicle;
    let mx = this.input.mx;
    let mz = this.mode3d ? this.input.mz : 0;
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }
    const sp = (this.fps ? (this.driving ? 0 : VEHICLES[0].speed) : v.speed) * (this.input.chop && m.target >= 0 ? 0.25 : 1);
    m.vx += (mx * sp - m.vx) * Math.min(1, dt * 10);
    m.vz += (mz * sp - m.vz) * Math.min(1, dt * 10);
    m.x += m.vx * dt;
    m.z += m.vz * dt;
    if (m.x < 1) m.x = 1;
    if (m.x > this.limitX) {
      m.x = this.limitX;
      m.vx = 0;
    }
    if (!this.mode3d) m.z = 0;
    else if (m.z < -WORLD_Z) m.z = -WORLD_Z;
    else if (m.z > WORLD_Z) m.z = WORLD_Z;
    const spd = Math.hypot(m.vx, m.vz);
    if (spd > 0.4) {
      m.walk += dt * spd * 1.6;
      if (Math.abs(m.vx) > 0.3) m.face = m.vx > 0 ? 1 : -1;
      if (this.mode3d && !this.fps) m.yaw = Math.atan2(m.vx, m.vz);
    }
    if (m.emoteT > 0) m.emoteT -= dt;

    // alvo de corte
    if (this.fps) {
      const a = this.trees[this.aim];
      m.target = a && a.state === TS.Grown && a.biome < this.s.unlocked ? this.aim : -1;
    } else m.target = this.findTarget(m.x, m.z, 2.6, this.mode3d ? m.yaw : m.face > 0 ? Math.PI / 2 : -Math.PI / 2);
    if (m.swing > 0) m.swing = Math.max(0, m.swing - dt * 4);
    if (this.input.chop && !this.driving) {
      m.swingT -= dt;
      if (m.swingT <= 0) {
        m.swingT = 1 / this.tool.rate;
        m.swing = 1;
        if (m.target >= 0) {
          const t = this.trees[m.target];
          if (!this.mode3d) m.face = t.x >= m.x ? 1 : -1;
          else if (!this.fps) m.yaw = Math.atan2(t.x - m.x, t.z - m.z);
          this.hitTree(t, this.tool.dmg * (1 + this.s.seeds * 0.05), m.x, m.z, 0);
        } else this.emit('swing', m.x + m.face, 1, m.z);
      }
    } else m.swingT = Math.min(m.swingT, 0.05);

    if (this.fps) return;
    // coleta de toras
    const reach = v.reach;
    if (m.carry < v.cap) {
      for (const l of this.logs) {
        if (!l.on || l.ghost || l.claim >= 0 || l.age < 0.35) continue;
        const dx = l.x - m.x;
        const dz = this.mode3d ? l.z - m.z : 0;
        if (dx * dx + dz * dz < reach * reach) {
          this.carrySp[m.carry % 64] = l.sp | (l.rare << 4);
          m.carry++;
          m.carryVal += l.val;
          l.on = false;
          this.emit('pickup', l.x, l.y, l.z, l.sp, m.carry);
          if (m.carry >= v.cap) break;
        }
      }
    }
    // entrega no funil
    if (m.carry > 0 && m.x < INTAKE_X + 3) {
      m.unloadT -= dt;
      if (m.unloadT <= 0 && this.qLen < QUEUE) {
        m.unloadT = 0.07;
        const per = m.carryVal / m.carry;
        m.carry--;
        m.carryVal -= per;
        if (m.carry <= 0) m.carryVal = 0;
        this.pushQueue(per, this.carrySp[m.carry % 64]);
        this.emit('deliver', m.x, 1.2, m.z, this.carrySp[m.carry % 64]);
      }
    }
  }

  findTarget(x: number, z: number, reach: number, yaw: number): number {
    let best = -1;
    let bd = 1e9;
    for (let i = 0; i < this.trees.length; i++) {
      const t = this.trees[i];
      if (t.state !== TS.Grown || t.biome >= this.s.unlocked) continue;
      const dx = t.x - x;
      if (dx > reach + 0.5 || dx < -reach - 0.5) continue;
      let d: number;
      if (this.mode3d) {
        const dz = t.z - z;
        d = dx * dx + dz * dz;
        if (d > reach * reach) continue;
        // prefere o que está à frente
        const fx = Math.sin(yaw);
        const fz = Math.cos(yaw);
        const dot = (dx * fx + dz * fz) / Math.sqrt(d + 1e-6);
        d -= dot * 2;
      } else {
        d = Math.abs(dx);
        if (d > reach) continue;
        if (Math.sign(dx) !== Math.sign(Math.sin(yaw))) d += 1;
      }
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  /** golpe numa árvore. who: 0 eu, 1 ajudante, 2 remoto */
  hitTree(t: Tree, dmg: number, fromX: number, fromZ: number, who: number): void {
    if (t.state !== TS.Grown) return;
    t.shake = 0.25;
    const tool = TOOLS[Math.min(TOOLS.length - 1, this.s.tool)];
    this.emit('chip', t.x, 1.1, t.z, t.sp, who === 0 ? (tool.kind === 'axe' ? 0 : tool.kind === 'saw' ? 1 : 2) : 0);
    let dx = t.x - fromX;
    let dz = this.mode3d ? t.z - fromZ : 0;
    const L = Math.hypot(dx, dz) || 1;
    dx /= L;
    dz /= L;
    if (!this.isHost && who === 0) {
      // cliente: mostra o dano e pede ao anfitrião
      t.hp = Math.max(0.01, t.hp - dmg);
      if (this.reqTree !== t.id) this.reqTree = t.id;
      this.reqDmg += dmg;
      if (t.hp <= 0.01 && t.pend <= 0) t.pend = 1.6;
      t.fdx = dx;
      t.fdz = dz;
      return;
    }
    t.hp -= dmg;
    if (t.hp <= 0) this.fell(t, dx, dz, who);
  }

  /** derruba (anfitrião decide; clientes aplicam o anúncio) */
  fell(t: Tree, dx: number, dz: number, who: number): void {
    if (t.state !== TS.Grown) return;
    t.state = TS.Falling;
    t.hp = 0;
    t.fdx = dx || 1;
    t.fdz = dz;
    t.ang = 0;
    t.angV = 0.35;
    t.bounces = 0;
    t.by = who;
    t.pend = 0;
    t.ext = false;
    if (t.claim >= 0 && who !== 1) t.claim = -1;
    this.emit('fell', t.x, 0, t.z, t.id, who);
    if (this.isHost && this.onFell) this.onFell(t);
    if (who === 0) {
      this.s.trees++;
      this.sessionTrees++;
      if (t.rare) {
        this.s.rares++;
        this.emit('rare', t.x, SPECIES[t.sp].h * 0.6, t.z, t.rare);
      }
    }
  }

  /** fim da queda: vira toras */
  landTree(t: Tree): void {
    if (t.state !== TS.Falling) return;
    t.state = TS.Stump;
    t.timer = replantDelay(this.s.mach.nursery, 0);
    const sp = SPECIES[t.sp];
    const n = sp.logs;
    const seg = (sp.h * 0.8) / n;
    const val = sp.value * RARES[t.rare].mult;
    this.emit('land', t.x + t.fdx * sp.h * 0.5, 0.3, t.z + t.fdz * sp.h * 0.5, t.sp, t.id);
    for (let i = 0; i < n; i++) {
      const l = this.spawnLog();
      if (!l) break;
      const d = 0.8 + seg * (i + 0.5);
      l.x = t.x + t.fdx * d;
      l.z = this.mode3d ? Math.max(-WORLD_Z, Math.min(WORLD_Z, t.z + t.fdz * d)) : t.z;
      l.y = 0.35;
      l.vx = t.fdx * (1.5 + Math.random() * 1.5);
      l.vz = t.fdz * (1.5 + Math.random() * 1.5);
      l.vy = 2 + Math.random() * 2;
      l.yaw = Math.atan2(t.fdz, t.fdx) + Math.PI / 2;
      l.rot = 0;
      l.val = val;
      l.sp = t.sp;
      l.rare = t.rare;
      l.ghost = t.by === 2 ? 1 : 0;
    }
  }

  spawnLog(): Log | null {
    let oldest: Log | null = null;
    for (const l of this.logs) {
      if (!l.on) {
        l.on = true;
        l.age = 0;
        l.claim = -1;
        return l;
      }
      if (!oldest || (l.age > oldest.age && l.claim < 0)) oldest = l;
    }
    // sem espaço: a tora mais antiga vai direto para a serraria (nada se perde)
    if (oldest && !oldest.ghost) this.pushQueue(oldest.val, oldest.sp);
    if (oldest) {
      oldest.age = 0;
      oldest.claim = -1;
    }
    return oldest;
  }

  private stepTrees(dt: number): void {
    const nursery = this.s.mach.nursery;
    for (const t of this.trees) {
      if (t.shake > 0) t.shake -= dt;
      switch (t.state) {
        case TS.Grown:
          if (t.pend > 0) {
            t.pend -= dt;
            if (t.pend <= 0) this.fell(t, t.fdx, t.fdz, 0); // anfitrião sumiu: derruba local
          }
          break;
        case TS.Falling:
          if (t.ext) break;
          // pêndulo invertido simples: aceleração cresce com o seno do ângulo
          t.angV += (2.2 + 9 * Math.sin(t.ang)) * dt * (7 / SPECIES[t.sp].h);
          t.ang += t.angV * dt;
          if (t.ang >= Math.PI / 2) {
            t.ang = Math.PI / 2;
            if (t.bounces < 2 && t.angV > 0.8) {
              t.angV = -t.angV * 0.22;
              t.bounces++;
              this.emit('land', t.x + t.fdx * SPECIES[t.sp].h * 0.6, 0.2, t.z + t.fdz * SPECIES[t.sp].h * 0.6, t.sp, -1);
            } else this.landTree(t);
          }
          break;
        case TS.Stump:
          t.timer -= dt;
          if (t.timer <= 0) {
            t.state = TS.Sapling;
            t.grow = 0;
            this.emit('plant', t.x, 0.2, t.z, t.sp);
          }
          break;
        case TS.Sapling:
          t.grow += (dt / growTime(nursery)) * (t.fast ? 2.2 : 1);
          if (t.grow >= 1) {
            t.grow = 1;
            t.fast = false;
            t.state = TS.Grown;
            const r = mulberry(t.seed + ((this.time * 1000) | 0));
            this.rollTree(t, r);
            t.claim = -1;
            this.emit('grow', t.x, SPECIES[t.sp].h * 0.5, t.z, t.sp, t.rare);
          }
          break;
      }
    }
  }

  private stepLogs(dt: number): void {
    for (const l of this.logs) {
      if (!l.on) continue;
      l.age += dt;
      if (l.ghost && l.age > 4) {
        l.on = false;
        continue;
      }
      if (this.mode3d && l.age > 0.05 && (l as any).body) continue; // o 3D move pela física
      l.vy -= 22 * dt;
      l.y += l.vy * dt;
      const gy = (this.groundY ? this.groundY(l.x, l.z) : 0) + 0.3;
      if (l.y < gy) {
        l.y = gy;
        l.vy = Math.abs(l.vy) > 2 ? -l.vy * 0.3 : 0;
        const f = Math.pow(0.25, dt);
        l.vx *= f;
        l.vz *= f;
      }
      l.x += l.vx * dt;
      l.z += l.vz * dt;
      l.rot += (l.vx / 0.35) * dt;
      if (l.x > this.limitX) {
        l.x = this.limitX;
        l.vx = -Math.abs(l.vx) * 0.4;
      }
      if (l.z < -WORLD_Z) l.z = -WORLD_Z;
      if (l.z > WORLD_Z) l.z = WORLD_Z;
    }
  }

  /** fps: o jogador pegou a tora com as mãos (ou o veículo recolheu) */
  takeLog(l: Log): void {
    if (!l.on) return;
    l.on = false;
    this.emit('pickup', l.x, l.y, l.z, l.sp, 0);
  }

  /** fps: tora entregue no funil da serraria */
  feed(val: number, sp: number): void {
    this.pushQueue(val, sp);
    this.emit('deliver', INTAKE_X, 2.2, 0, sp & 15);
  }

  /* ------------------------------ IA dos ajudantes ------------------------------ */

  private pickTree(a: Agent): number {
    let best = -1;
    let bd = 1e9;
    const maxB = this.s.unlocked;
    for (let i = 0; i < this.trees.length; i++) {
      const t = this.trees[i];
      if (t.biome >= maxB || t.claim >= 0) continue;
      const want = a.kind === 'planter' ? t.state === TS.Stump && t.timer > 1 : t.state === TS.Grown && t.pend <= 0;
      if (!want) continue;
      const d = Math.abs(t.x - a.x) + a.rng() * 25 + (a.kind === 'friend' ? Math.abs(t.x - this.me.x - (a.idx - 1) * 12) * 0.5 : 0);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  private moveTo(a: Agent, x: number, z: number, dt: number): boolean {
    const dx = x - a.x;
    const dz = this.mode3d ? z - a.z : 0;
    const d = Math.hypot(dx, dz);
    if (d < 0.25) return true;
    const st = Math.min(d, a.speed * dt);
    a.x += (dx / d) * st;
    if (this.mode3d) a.z += (dz / d) * st;
    a.walk += st * 1.6;
    if (Math.abs(dx) > 0.05) a.face = dx > 0 ? 1 : -1;
    return false;
  }

  private stepAgents(dt: number): void {
    for (const a of this.agents) {
      if (a.emoteT > 0) a.emoteT -= dt;
      if (a.kind === 'drone') a.y += ((a.state === 'chop' ? 3.2 : a.state === 'idle' ? 1 : 4.5) - a.y) * Math.min(1, dt * 3);
      if (a.swing > 0) a.swing = Math.max(0, a.swing - dt * 4);
      if (a.wait > 0) {
        a.wait -= dt;
        continue;
      }
      switch (a.state) {
        case 'idle': {
          if (a.carry > 0) {
            a.state = 'home';
            break;
          }
          if (a.kind !== 'friend') {
            // bichinho de estimação: espera ordem, seguindo você de perto
            if (this.orders <= 0) {
              const fx = this.me.x - (2 + a.idx * 1.3) * (this.me.face || 1);
              if (Math.abs(fx - a.x) > 2.5 || (this.mode3d && Math.abs(this.me.z - a.z) > 3)) this.moveTo(a, fx, this.me.z + ((a.idx % 3) - 1) * 1.2, dt);
              break;
            }
            this.orders--;
          }
          const ti = this.pickTree(a);
          if (ti < 0) {
            a.wait = 1;
            break;
          }
          a.tree = ti;
          this.trees[ti].claim = this.agents.indexOf(a);
          a.state = a.kind === 'planter' ? 'plant' : 'go';
          break;
        }
        case 'go': {
          const t = this.trees[a.tree];
          if (!t || t.state !== TS.Grown) {
            this.release(a);
            a.state = 'collect';
            break;
          }
          const side = a.x < t.x ? -1 : 1;
          if (this.moveTo(a, t.x + side * 1.3, t.z, dt)) {
            a.state = 'chop';
            a.swing = 0;
          }
          break;
        }
        case 'chop': {
          const t = this.trees[a.tree];
          if (!t || t.state !== TS.Grown) {
            this.release(a);
            a.state = 'collect';
            a.wait = 0.9;
            break;
          }
          a.face = t.x > a.x ? 1 : -1;
          a.swing -= dt;
          if (a.swing <= 0) {
            a.swing = 1 / a.rate;
            if (this.isHost) this.hitTree(t, a.dmg, a.x, a.z, 1);
            else {
              t.shake = 0.2;
              this.emit('chip', t.x, 1.1, t.z, t.sp, 0);
              t.hp -= a.dmg;
              if (t.hp <= 0) this.fell(t, t.x > a.x ? 1 : -1, 0, 1);
            }
            a.swing = Math.max(a.swing, 0.3);
          }
          break;
        }
        case 'collect': {
          // pega toras perto (do próprio corte ou soltas)
          let best: Log | null = null;
          let bd = 14;
          for (const l of this.logs) {
            if (!l.on || l.ghost || l.claim >= 0 || l.age < 0.6) continue;
            const d = Math.abs(l.x - a.x) + (this.mode3d ? Math.abs(l.z - a.z) : 0);
            if (d < bd) {
              bd = d;
              best = l;
            }
          }
          if (!best || a.carry >= a.cap) {
            a.state = a.carry > 0 ? 'home' : 'idle';
            break;
          }
          if (this.moveTo(a, best.x, best.z, dt) || Math.abs(best.x - a.x) < 0.9) {
            a.carry++;
            a.carryVal += best.val;
            a.carrySp = best.sp;
            best.on = false;
            this.emit('pickup', best.x, best.y, best.z, best.sp, -1);
          }
          break;
        }
        case 'home': {
          if (this.moveTo(a, INTAKE_X + 1 + (a.idx % 3) * 0.6, a.z, dt)) a.state = 'unload';
          break;
        }
        case 'unload': {
          if (this.qLen >= QUEUE) {
            a.wait = 0.5;
            break;
          }
          if (a.carry > 0) {
            const per = a.carryVal / a.carry;
            a.carry--;
            a.carryVal -= per;
            this.pushQueue(per, a.carrySp);
            this.emit('deliver', a.x, 1, a.z, a.carrySp);
            a.wait = 0.12;
          } else {
            a.carryVal = 0;
            a.state = 'idle';
          }
          break;
        }
        case 'plant': {
          const t = this.trees[a.tree];
          if (!t || t.state !== TS.Stump) {
            this.release(a);
            a.state = 'idle';
            break;
          }
          if (this.moveTo(a, t.x - 1, t.z, dt)) {
            t.timer = 0;
            a.swing = 1;
            this.release(a);
            a.state = 'idle';
            a.wait = 0.8;
          }
          break;
        }
      }
    }
  }

  private release(a: Agent): void {
    if (a.tree >= 0 && this.trees[a.tree]?.claim === this.agents.indexOf(a)) this.trees[a.tree].claim = -1;
    a.tree = -1;
  }

  /* ------------------------------ serraria ------------------------------ */

  pushQueue(val: number, sp: number): void {
    if (this.qLen >= QUEUE) return;
    const i = (this.qHead + this.qLen) % QUEUE;
    this.qVal[i] = val;
    this.qSp[i] = sp;
    this.qLen++;
  }

  private stepMill(dt: number): void {
    const m = this.s.mach;
    this.sawSpin += dt * (this.sawing >= 0 ? 30 : 4);
    if (this.sawT > 0) {
      this.sawT -= dt;
      if (this.sawT <= 0) {
        // termina a tora: sai uma pilha de tábuas na esteira
        const slot = this.belt.find((b) => !b.on);
        if (slot) {
          const i = this.qHead;
          const val = this.qVal[i];
          slot.on = true;
          slot.x = SAW_X - 1.2;
          slot.n = planksPerLog(m.saw);
          slot.val = val * 0.6;
          slot.sp = this.qSp[i] & 15;
          slot.planed = false;
          this.qHead = (this.qHead + 1) % QUEUE;
          this.qLen--;
          this.emit('saw', SAW_X, 1.2, 0, slot.sp, slot.n);
          this.sawing = -1;
        } else this.sawT = 0.1; // esteira cheia: espera
      }
    } else if (this.qLen > 0) {
      this.sawT = sawTime(m.saw);
      this.sawing = this.qSp[this.qHead] & 15;
    }
    const sp = beltSpeed(m.belt);
    for (const b of this.belt) {
      if (!b.on) continue;
      b.x -= sp * dt;
      if (!b.planed && b.x <= PLANER_X) {
        b.planed = true;
        b.val *= planerMult(m.planer);
        this.emit('plank', PLANER_X, 1.1, 0, b.sp, 1);
      }
      if (b.x <= PALLET_X + 0.6) {
        b.on = false;
        const tot = this.s.planks * this.s.plankVal + b.n * b.val;
        this.s.planks += b.n;
        this.s.plankVal = tot / this.s.planks;
        this.s.planksMade += b.n;
        this.sessionPlanks += b.n;
        this.emit('plank', PALLET_X, 1, 0, b.sp, 0);
      }
    }
  }

  /* ------------------------------ remotos ------------------------------ */

  private stepRemotes(dt: number): void {
    const k = Math.min(1, dt * 6);
    for (const r of this.remotes) {
      const ox = r.x;
      r.x += (r.tx - r.x) * k;
      r.z += (r.tz - r.z) * k;
      const v = Math.abs(r.x - ox) / Math.max(dt, 1e-3);
      if (v > 0.3) {
        r.walk += dt * v * 1.6;
        r.face = r.x > ox ? 1 : -1;
      }
      if (r.chop) r.swing = (this.time * 2.4) % 1;
      if (r.emoteT > 0) r.emoteT -= dt;
    }
  }

  /* ------------------------------ economia ------------------------------ */

  sellAll(): number {
    if (this.s.planks <= 0) return 0;
    const v = Math.round(this.s.planks * this.s.plankVal * this.saleMult);
    this.earn(v);
    this.emit('sell', SELL_X, 1.4, 0, v, this.s.planks);
    this.s.planks = 0;
    this.s.plankVal = 0;
    writeSave(this.s);
    return v;
  }

  earn(v: number): void {
    this.s.bolotas += v;
    this.s.earnedRun += v;
    this.s.totalEarned += v;
    this.sessionEarned += v;
  }

  pay(c: number): boolean {
    if (this.s.bolotas < c) return false;
    this.s.bolotas -= c;
    return true;
  }

  buyTool(): boolean {
    const n = this.s.tool + 1;
    if (n >= TOOLS.length || !this.pay(TOOLS[n].cost)) return false;
    this.s.tool = n;
    this.retuneAgents();
    this.afterBuy();
    return true;
  }
  buyVehicle(): boolean {
    const n = this.s.vehicle + 1;
    if (n >= VEHICLES.length || !this.pay(VEHICLES[n].cost)) return false;
    this.s.vehicle = n;
    this.retuneAgents();
    this.afterBuy();
    return true;
  }
  buyMachine(id: MachineId): boolean {
    const m = MACHINES.find((x) => x.id === id)!;
    if (!this.pay(machineCost(m, this.s.mach[id]))) return false;
    this.s.mach[id]++;
    this.afterBuy();
    return true;
  }
  buyHelper(i: number): boolean {
    const h = HELPERS[i];
    const n = this.s.help[h.id];
    if (n >= h.max || !this.pay(helperCost(i, n))) return false;
    this.s.help[h.id]++;
    this.syncHelpers();
    this.afterBuy();
    return true;
  }
  /** construção no portão do próximo bioma */
  canBuild(): number {
    const b = this.s.unlocked - 1;
    return b < BUILDS.length ? b : -1;
  }
  build(): boolean {
    const b = this.canBuild();
    if (b < 0) return false;
    const B = BUILDS[b];
    if (this.s.planks < B.planks || this.s.bolotas < B.cost) return false;
    this.s.bolotas -= B.cost;
    this.s.planks -= B.planks;
    if (this.s.planks <= 0) this.s.plankVal = 0;
    this.s.unlocked++;
    this.emit('build', gateX(b + 1), 2, 0, b);
    this.healthT = 0;
    this.afterBuy();
    return true;
  }
  nearGate(): boolean {
    const b = this.canBuild();
    return b >= 0 && Math.abs(this.me.x - gateX(b + 1)) < 5;
  }
  /** toco ao alcance para plantar uma muda com as mãos */
  nearStump(r = 2.6): Tree | null {
    let best: Tree | null = null;
    let bd = r;
    for (const t of this.trees) {
      if (t.state !== TS.Stump || t.biome >= this.s.unlocked) continue;
      const d = Math.abs(t.x - this.me.x) + (this.mode3d ? Math.abs(t.z - this.me.z) : 0);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  }
  /** planta a muda no toco: nasce na hora e cresce mais rápido que a natural */
  plantByHand(): boolean {
    const t = this.nearStump();
    if (!t) return false;
    t.timer = 0;
    t.fast = true;
    return true;
  }
  /** perto da serra (minigame de serrar na mão) */
  nearSaw(): boolean {
    const x = this.me.x;
    // 2D: logo antes do funil (que descarrega sozinho ao encostar); 3D: perto do funil ou da serra
    return this.mode3d ? Math.abs(x - INTAKE_X) < 6 || Math.abs(x - SAW_X) < 4.5 : x > INTAKE_X + 3 && x < INTAKE_X + 12;
  }
  /**
   * Serrar na mão: n toras (valor total val) viram tábuas na hora.
   * quality 0..1 (minigame): até +50% de tábuas e +25% de valor.
   */
  handSaw(n: number, val: number, quality: number): number {
    if (n <= 0) return 0;
    const m = this.s.mach;
    const per = planksPerLog(m.saw);
    const planks = Math.max(n, Math.round(n * per * (1 + quality * 0.5)));
    const pv = ((val / n) * 0.6 * planerMult(m.planer) * (1 + quality * 0.25) * n * per) / planks;
    const tot = this.s.planks * this.s.plankVal + planks * pv;
    this.s.planks += planks;
    this.s.plankVal = tot / this.s.planks;
    this.s.planksMade += planks;
    this.sessionPlanks += planks;
    this.emit('saw', SAW_X, 1.2, 0, 0, planks);
    return planks;
  }

  nearSell(): boolean {
    return this.me.x < PALLET_X + 4;
  }

  renewGain(): number {
    return this.s.unlocked >= 3 ? prestigeSeeds(this.s.earnedRun) : 0;
  }
  renew(): boolean {
    const g = this.renewGain();
    if (g <= 0) return false;
    const keep = this.s;
    const f = freshSave();
    keep.seeds += g;
    keep.renewals++;
    keep.bolotas = 0;
    keep.planks = 0;
    keep.plankVal = 0;
    keep.tool = 0;
    keep.vehicle = 0;
    keep.mach = f.mach;
    keep.help = f.help;
    keep.unlocked = 1;
    keep.earnedRun = 0;
    this.me.carry = 0;
    this.me.carryVal = 0;
    this.me.x = INTAKE_X + 6;
    this.qLen = 0;
    for (const b of this.belt) b.on = false;
    for (const l of this.logs) l.on = false;
    // o bosque renasce inteiro
    for (const t of this.trees) {
      t.state = TS.Grown;
      t.grow = 1;
      t.claim = -1;
      t.hp = t.maxHp;
    }
    this.agents = this.agents.filter((a) => a.kind === 'friend');
    for (const a of this.agents) {
      a.state = 'idle';
      a.carry = 0;
      a.tree = -1;
    }
    this.syncHelpers();
    this.afterBuy();
    return true;
  }

  private afterBuy(): void {
    this.emit('buy', this.me.x, 2, this.me.z);
    writeSave(this.s);
  }

  /** bioma onde o jogador está */
  get biome(): number {
    return this.me.x < gateX(0) ? 0 : biomeAt(this.me.x);
  }
  biomeLen(): number {
    return BIOME_LEN;
  }
}
