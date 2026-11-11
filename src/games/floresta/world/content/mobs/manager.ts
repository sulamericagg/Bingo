/* ============================================================
 *  BICHOS — gerente: nasce/some por regras e cotas, IA com tique
 *  reduzido longe do jogador, movimento sobre o mapa de alturas
 *  (A* + direção simples), dano/derrota/drops, domar/criar/montar,
 *  projéteis, avisos e chefes. Uma instância por mundo.
 *  API: docs/MUNDO-CRIATURAS.md
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../../../../../i18n';
import { ALL_MOBS, MOB_INDEX } from './registry';
import { Mob } from './mob';
import { MobRenderer, mobTime } from './render';
import { MobFx, type FxKind, type Projectile } from './fx';
import { findPath, type PathQuery } from './path';
import { thinkAnimal, thinkMonster, onLand } from './ai';
import { BossCtl, lairAt, LAIR_CELL } from './boss';
import { BossBar, type BossView } from './bossbar';
import {
  BUDGETS, type BiomeId, type DamageKind, type Effect, type Lair, type MobBudget, type MobDef, type MobHost, type MobSound, type PlayerMods, type PlayerView, type SpawnRule,
} from './types';

export type MobEvent = 'kill' | 'tame' | 'breed' | 'birth' | 'hurtPlayer' | 'bossStart' | 'bossPhase' | 'bossDefeat' | 'toast' | 'mount' | 'dismount';
export interface DamageOpts {
  kind?: DamageKind;
  /** de onde veio o golpe (para escudo e empurrão) */
  fromX?: number;
  fromZ?: number;
  knock?: number;
}
export interface DamageResult {
  dealt: number;
  blocked: boolean;
  killed: boolean;
}
export type InteractAction = 'none' | 'taming' | 'tamed' | 'love' | 'milk' | 'shear' | 'mount' | 'notHungry';
export interface InteractResult {
  action: InteractAction;
  /** quantos itens da mão o motor deve gastar */
  consumed: number;
}
export interface MobSave {
  v: 1;
  tamed: { id: string; x: number; z: number; y: number; age: number; name: string }[];
  defeated: string[];
}

const DEF_MODS: PlayerMods = { armor: 0, fireRes: 0, coldRes: 0, poisonRes: 0, light: false, stealth: 0 };
const TAU = Math.PI * 2;
const G = 20;

export function angDiff(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export class MobManager {
  readonly mobs: Mob[] = [];
  readonly render: MobRenderer;
  readonly fx: MobFx;
  readonly bosses: BossCtl[] = [];
  readonly bar: BossBar | null;
  budget: MobBudget;
  time = 0;
  isNight = false;
  nights = 0;
  pl: PlayerView = { x: 0, y: 0, z: 0, yaw: 0, grounded: true, alive: true, held: null };
  mods: PlayerMods = DEF_MODS;
  /** jogador está no subsolo (≥ 5 m abaixo da superfície) */
  plCave = false;
  plDepth = 0;
  /** liga/desliga o nascimento automático (zoológico) */
  autoSpawn = true;
  /** liga/desliga a IA (zoológico: poses fixas) */
  aiOn = true;
  riding: Mob | null = null;
  /** online (convidado): golpes nos espelhos vão para o anfitrião; true = não aplica aqui */
  damageHook: ((m: Mob, amount: number, o: DamageOpts) => boolean) | null = null;
  /** online (convidado): chefe do anfitrião para a barra de vida */
  netBoss: BossView | null = null;
  /** jogador-alvo atual quando não é o local (online, anfitrião) */
  private targetId = '';
  private ride = { fwd: 0, turn: 0, jump: false };
  private grid = new Map<number, Mob[]>();
  private spawnT = 0;
  private lairT = 0;
  private pathsLeft = 0;
  private listeners = new Map<MobEvent, ((...a: unknown[]) => void)[]>();
  private defeated = new Set<string>();
  private preparedLairs = new Set<string>();
  readonly lairs = new Map<string, Lair>();
  private frustum = new THREE.Frustum();
  private pv = new THREE.Matrix4();
  private camPos = new THREE.Vector3();
  private camRight = new THREE.Vector3();
  private groupSeq = 1;
  /** estatísticas (ms) */
  stats = { ai: 0, move: 0, render: 0, thinks: 0, paths: 0, alive: 0 };

  constructor(
    readonly host: MobHost,
    readonly scene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
    tier: 0 | 1 | 2 | 3 = 2,
    uiRoot: HTMLElement | null = null,
  ) {
    this.budget = { ...BUDGETS[tier] };
    this.render = new MobRenderer(scene, renderer, ALL_MOBS);
    this.fx = new MobFx(scene, this.budget.fx);
    this.bar = uiRoot ? new BossBar(uiRoot) : null;
  }

  /* ------------------------------ eventos ------------------------------ */
  on(ev: 'kill', cb: (m: Mob, drops: [string, number][]) => void): void;
  on(ev: 'tame' | 'breed' | 'birth' | 'mount' | 'dismount', cb: (m: Mob) => void): void;
  on(ev: 'hurtPlayer', cb: (dmg: number, kind: DamageKind, m: Mob | null) => void): void;
  on(ev: 'bossStart' | 'bossPhase' | 'bossDefeat', cb: (b: BossCtl) => void): void;
  on(ev: 'toast', cb: (msg: string) => void): void;
  on(ev: MobEvent, cb: (...a: never[]) => void): void {
    const l = this.listeners.get(ev) ?? [];
    l.push(cb as (...a: unknown[]) => void);
    this.listeners.set(ev, l);
  }
  emit(ev: MobEvent, ...a: unknown[]): void {
    const l = this.listeners.get(ev);
    if (l) for (const cb of l) cb(...a);
  }
  sound(s: MobSound, x: number, y: number, z: number): void {
    this.host.sound?.(s, x, y, z);
  }

  setTier(tier: 0 | 1 | 2 | 3): void {
    this.budget = { ...BUDGETS[tier] };
    this.fx.cap = this.budget.fx;
  }

  /* ------------------------------ consultas ao mundo ------------------------------ */
  /** chão para o bicho (caverna: procura perto do y atual) */
  ground(m: Mob | null, x: number, z: number, y?: number): number {
    const h = this.host;
    if (m?.cave && h.floorAt) return h.floorAt(x, (y ?? m.y) + 1.6, z);
    if (y !== undefined && h.floorAt) return h.floorAt(x, y + 1.6, z);
    return h.heightAt(x, z);
  }
  water(x: number, z: number): number {
    return this.host.waterLevel(x, z);
  }
  /** pode pisar/nadar em (x,z) vindo de y? */
  canGo(m: Mob, x: number, z: number, fromY: number, step: number): boolean {
    const d = m.def;
    const ride = m === this.riding ? d.ride : undefined;
    if (this.host.blocked?.(x, z, fromY)) return false;
    if (m.flying) return true;
    const g = this.ground(m, x, z, fromY);
    const w = m.cave ? -Infinity : this.water(x, z);
    const wet = w > g + 0.35;
    if (d.habitat === 'water') return w > g + 0.5;
    if (wet && d.habitat === 'ground' && !(ride && ride.swim) && m.boss === null) return false;
    if (d.habitat === 'air') return true;
    const climb = d.climb || ride?.climb;
    const maxUp = Math.max(0.35, step * (climb ? 3 : 1.05));
    if (g - fromY > maxUp && !wet) return false;
    return true;
  }

  /* ------------------------------ grade espacial ------------------------------ */
  private key(x: number, z: number): number {
    return (Math.floor(x / 8) + 4096) * 8192 + (Math.floor(z / 8) + 4096);
  }
  private rebuildGrid(): void {
    for (const l of this.grid.values()) l.length = 0;
    for (const m of this.mobs) {
      if (m.dead) continue;
      const k = this.key(m.x, m.z);
      let l = this.grid.get(k);
      if (!l) this.grid.set(k, (l = []));
      l.push(m);
    }
  }
  /** chama cb para bichos a até r m de (x,z) */
  near(x: number, z: number, r: number, cb: (o: Mob, d2: number) => void): void {
    const r2 = r * r;
    const x0 = Math.floor((x - r) / 8);
    const x1 = Math.floor((x + r) / 8);
    const z0 = Math.floor((z - r) / 8);
    const z1 = Math.floor((z + r) / 8);
    for (let i = x0; i <= x1; i++)
      for (let j = z0; j <= z1; j++) {
        const l = this.grid.get((i + 4096) * 8192 + (j + 4096));
        if (!l) continue;
        for (const o of l) {
          if (o.dead) continue;
          const d2 = (o.x - x) ** 2 + (o.z - z) ** 2;
          if (d2 <= r2) cb(o, d2);
        }
      }
  }

  /* ------------------------------ nascimento ------------------------------ */
  /** cria um bicho pelo id (ou índice) já assentado no chão */
  spawn(id: string | number, x: number, z: number, opts: { y?: number; cave?: boolean; group?: number; age?: number; tamed?: boolean; persistent?: boolean } = {}): Mob {
    const sp = typeof id === 'number' ? id : MOB_INDEX.get(id);
    if (sp === undefined) throw new Error('mob? ' + id);
    const def = ALL_MOBS[sp];
    const m = new Mob(sp, def);
    m.x = m.homeX = x;
    m.z = m.homeZ = z;
    m.cave = !!opts.cave;
    m.group = opts.group ?? 0;
    m.age = opts.age ?? 1;
    m.tamed = !!opts.tamed;
    m.persistent = !!opts.persistent || m.tamed;
    m.yaw = Math.random() * TAU;
    m.size = 1 + (Math.random() * 2 - 1) * (def.vary ?? 0);
    const g = opts.y !== undefined ? this.ground(m, x, z, opts.y) : this.ground(m, x, z);
    m.y = g;
    if (def.kind === 'monster') {
      m.lvl = 1 + Math.min(1.5, this.nights * 0.06) + (m.cave ? Math.min(1.5, this.plDepth / 40) : 0) + (this.isNight ? 0.1 : 0);
      m.hp = m.maxHp = Math.round(def.hp * m.lvl);
    }
    const w = m.cave ? -Infinity : this.water(x, z);
    if (def.habitat === 'water') {
      m.y = g + (w - g) * (0.3 + Math.random() * 0.4);
      m.alt = 0.5;
      m.inWater = true;
    } else if (def.habitat === 'air' && def.alt) {
      m.alt = def.alt[0] + Math.random() * (def.alt[1] - def.alt[0]);
      m.y = g + m.alt;
      m.grounded = false;
      m.flying = true;
      m.st = 'fly';
    }
    this.mobs.push(m);
    return m;
  }

  private ruleOk(r: SpawnRule, biome: BiomeId, depth: number): boolean {
    if (!r.biomes.includes(biome)) return false;
    if (r.time === 'night' && !this.isNight && biome !== 'caverna') return false;
    if (r.time === 'day' && this.isNight && biome !== 'caverna') return false;
    if (r.minNight && this.nights < r.minNight) return false;
    if (r.depth && (depth < r.depth[0] || depth > r.depth[1])) return false;
    return true;
  }

  /** tenta um nascimento natural perto do jogador */
  private trySpawn(): void {
    let na = 0;
    let nm = 0;
    for (const m of this.mobs) {
      if (m.dead || m.def.kind === 'boss' || m.tamed) continue;
      if (m.def.kind === 'animal') na++;
      else nm++;
    }
    const b = this.budget;
    const wantMon = (this.isNight || this.plCave) && nm < b.monsters;
    const wantAni = na < b.animals;
    if (!wantMon && !wantAni) return;
    const kind = wantMon && (!wantAni || Math.random() < 0.45) ? 'monster' : 'animal';
    const p = this.pl;
    const ang = Math.random() * TAU;
    let x: number;
    let z: number;
    let biome: BiomeId;
    let y: number | undefined;
    let depth = 0;
    let water = false;
    if (this.plCave) {
      const r = 10 + Math.random() * 18;
      x = p.x + Math.cos(ang) * r;
      z = p.z + Math.sin(ang) * r;
      y = this.ground(null, x, z, p.y + 2);
      if (Math.abs(y - p.y) > 6) return;
      depth = this.host.heightAt(x, z) - y;
      if (depth < 4) return;
      biome = 'caverna';
    } else {
      const r = b.near * 0.55 + Math.random() * (b.far * 0.75 - b.near * 0.55);
      x = p.x + Math.cos(ang) * r;
      z = p.z + Math.sin(ang) * r;
      const g = this.host.heightAt(x, z);
      const w = this.water(x, z);
      biome = this.host.biomeAt(x, z);
      water = w > g + 0.6;
      if (water && biome !== 'oceano' && biome !== 'rio') biome = w - g > 5 ? 'oceano' : 'rio';
    }
    // candidatas
    let tot = 0;
    const cands: [MobDef, SpawnRule, number][] = [];
    for (let i = 0; i < ALL_MOBS.length; i++) {
      const d = ALL_MOBS[i];
      if (d.kind !== kind) continue;
      if (water ? d.habitat !== 'water' && d.habitat !== 'amphib' : d.habitat === 'water') continue;
      for (const r of d.spawn) {
        if (!this.ruleOk(r, biome, depth)) continue;
        cands.push([d, r, i]);
        tot += r.weight;
      }
    }
    if (!tot) return;
    let q = Math.random() * tot;
    let pick = cands[0];
    for (const c of cands) {
      q -= c[1].weight;
      if (q <= 0) {
        pick = c;
        break;
      }
    }
    const [d, r] = pick;
    const n = r.group[0] + Math.floor(Math.random() * (r.group[1] - r.group[0] + 1));
    const grp = this.groupSeq++;
    for (let i = 0; i < n; i++) {
      const jx = x + (Math.random() - 0.5) * Math.min(8, 2 + n);
      const jz = z + (Math.random() - 0.5) * Math.min(8, 2 + n);
      if (d.habitat === 'water' && !(this.water(jx, jz) > this.host.heightAt(jx, jz) + 0.5)) continue;
      const m = this.spawn(pick[2], jx, jz, { y, cave: biome === 'caverna', group: grp });
      if (Math.random() < 0.15 && d.kind === 'animal' && d.breed) m.age = 0.4;
    }
  }

  /* ------------------------------ ciclo ------------------------------ */
  update(dt: number, camera: THREE.Camera): void {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    mobTime.value = this.time;
    const h = this.host;
    const day = h.dayTime();
    this.isNight = day < 0.23 || day > 0.77;
    this.nights = h.nightCount();
    this.pl = h.player();
    this.mods = h.playerMods?.() ?? DEF_MODS;
    const surf = h.heightAt(this.pl.x, this.pl.z);
    this.plDepth = Math.max(0, surf - this.pl.y);
    this.plCave = this.plDepth > 5;
    const t0 = performance.now();
    this.rebuildGrid();
    // nascimento / sumiço
    if (this.autoSpawn) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = 0.5;
        this.trySpawn();
      }
      this.lairT -= dt;
      if (this.lairT <= 0) {
        this.lairT = 1.5;
        this.checkLairs();
      }
    }
    this.pathsLeft = this.budget.paths;
    let thinks = 0;
    const p = this.pl;
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      if (m.dead) {
        this.mobs[i] = this.mobs[this.mobs.length - 1];
        this.mobs.pop();
        continue;
      }
      m.dist = Math.hypot(m.x - p.x, m.z - p.z, (m.y - p.y) * 0.5);
      if (m.dist > this.budget.despawn && !m.persistent && !m.tamed && m.def.kind !== 'boss' && m !== this.riding) {
        m.dead = true;
        continue;
      }
      if (m.st === 'dying') {
        this.stepDying(m, dt);
        continue;
      }
      // tique da IA mais lento longe
      const every = m.dist < 24 ? 0 : m.dist < 60 ? 0.15 : 0.4;
      m.aiAcc += dt;
      if (this.aiOn && m.aiAcc >= every && m !== this.riding && !m.boss && !m.pinned) {
        const adt = m.aiAcc;
        m.aiAcc = 0;
        thinks++;
        // bicho domado por outro jogador segue o dono dele
        const ov = m.owner ? this.host.others?.().find((o) => o.id === m.owner) : undefined;
        const save = this.pl;
        if (ov) this.pl = ov;
        if (m.def.kind === 'animal') thinkAnimal(this, m, adt);
        else thinkMonster(this, m, adt);
        this.pl = save;
      }
    }
    const t1 = performance.now();
    for (const b of this.bosses)
      this.withTarget(b.main.x, b.main.z, () => {
        if (this.targetId) for (const m of [b.main, ...b.heads]) m.dist = Math.hypot(m.x - this.pl.x, m.z - this.pl.z, (m.y - this.pl.y) * 0.5);
        b.update(dt);
      });
    for (let i = this.bosses.length - 1; i >= 0; i--) if (this.bosses[i].done) this.bosses.splice(i, 1);
    if (this.riding) this.stepRide(this.riding, dt);
    for (const m of this.mobs) {
      if (m.dead || m.st === 'dying' || m === this.riding) continue;
      // longe: move só no tique
      if (m.dist < 60 || m.aiAcc === 0) this.move(m, m.dist < 60 ? dt : Math.max(dt, 0.15));
      this.animate(m, dt);
    }
    this.stepProjectiles(dt);
    this.fx.update(dt);
    const t2 = performance.now();
    this.sync(camera);
    const t3 = performance.now();
    const k = 0.1;
    this.stats.ai += (t1 - t0 - this.stats.ai) * k;
    this.stats.move += (t2 - t1 - this.stats.move) * k;
    this.stats.render += (t3 - t2 - this.stats.render) * k;
    this.stats.thinks = thinks;
    this.stats.alive = this.mobs.length;
    this.bar?.update(this.netBoss ?? this.bosses.find((b) => b.active) ?? null);
  }

  /** roda f com `pl` = jogador vivo mais perto de (x,z) (online: pode ser um convidado) */
  private withTarget(x: number, z: number, f: () => void): void {
    const others = this.host.others?.();
    if (!others || !others.length) return f();
    const save = this.pl;
    let best: PlayerView = save;
    let bd = save.alive ? Math.hypot(save.x - x, save.z - z) : 1e9;
    let id = '';
    for (const o of others) {
      const d = Math.hypot(o.x - x, o.z - z);
      if (o.alive && d < bd) {
        bd = d;
        best = o;
        id = o.id;
      }
    }
    this.pl = best;
    this.targetId = id;
    try {
      f();
    } finally {
      this.pl = save;
      this.targetId = '';
    }
  }

  /* ------------------------------ movimento ------------------------------ */
  /** pede caminho A* (com cota por quadro) */
  requestPath(m: Mob, gx: number, gz: number): boolean {
    if (this.pathsLeft <= 0) return false;
    this.pathsLeft--;
    this.stats.paths++;
    const d = m.def;
    const q: PathQuery = {
      height: (x, z) => this.ground(m, x, z, m.y),
      pass: (x, z, hh) => {
        if (this.host.blocked?.(x, z, hh)) return false;
        if (m.cave) return true;
        const w = this.water(x, z);
        if (d.habitat === 'ground' && w > hh + 0.35) return false;
        return true;
      },
      maxStep: d.climb ? 4.5 : 1.6,
    };
    m.path = findPath(m.x, m.z, gx, gz, q, 24, 2);
    m.pathI = 0;
    m.pathT = this.time;
    m.pathGX = gx;
    m.pathGZ = gz;
    m.wantPath = false;
    return !!m.path;
  }

  /** anda na direção do alvo (tx,tz) com velocidade m.want; segue caminho se houver */
  private move(m: Mob, dt: number): void {
    if (m.pinned) return;
    const d = m.def;
    let tx = m.tx;
    let tz = m.tz;
    if (m.path && m.pathI < m.path.length) {
      tx = m.path[m.pathI];
      tz = m.path[m.pathI + 1];
      if ((tx - m.x) ** 2 + (tz - m.z) ** 2 < 1.2) {
        m.pathI += 2;
        if (m.pathI >= m.path.length) m.path = null;
      }
    }
    // separação dos vizinhos
    let sx = 0;
    let sz = 0;
    if (m.dist < 40 && m.want > 0) {
      const r = m.radius * 2.2;
      this.near(m.x, m.z, r + 0.6, (o, d2) => {
        if (o === m || o.st === 'dying' || d2 < 1e-4) return;
        const dd = Math.sqrt(d2);
        const push = (r + o.radius - dd) / (r + o.radius);
        if (push > 0) {
          sx += ((m.x - o.x) / dd) * push;
          sz += ((m.z - o.z) / dd) * push;
        }
      });
    }
    const dx = tx - m.x;
    const dz = tz - m.z;
    const dl = Math.hypot(dx, dz);
    let want = m.want;
    if (dl < 0.4 && !m.path) want = 0;
    if (want > 0 || sx || sz || m.st === 'windup') {
      const ty = Math.atan2(dl > 0.01 ? dx / dl + sx * 1.5 : sx, dl > 0.01 ? dz / dl + sz * 1.5 : sz);
      const turn = (d.mech === 'shield' ? 1.6 : 5) * dt;
      const ad = angDiff(m.yaw, ty);
      m.yaw += Math.abs(ad) < turn ? ad : Math.sign(ad) * turn;
      // freia nas curvas fechadas
      if (Math.abs(ad) > 1.2) want *= 0.4;
    }
    const acc = m.st === 'charge' || m.boss ? 30 : 6;
    m.spd += Math.max(-acc * dt, Math.min(acc * dt, want - m.spd));
    const fx = Math.sin(m.yaw);
    const fz = Math.cos(m.yaw);
    let nx = m.x + fx * m.spd * dt + m.vx * dt;
    let nz = m.z + fz * m.spd * dt + m.vz * dt;
    // empurrões decaem (não durante um pulo de ataque)
    if (!m.leap || m.grounded) {
      m.vx *= Math.max(0, 1 - dt * 4);
      m.vz *= Math.max(0, 1 - dt * 4);
    }
    const step = Math.hypot(nx - m.x, nz - m.z) + 0.05;
    const flying = m.flying;
    if (!flying && !m.boss && step > 0.06) {
      if (!this.canGo(m, nx, nz, m.y, step)) {
        if (this.canGo(m, nx, m.z, m.y, step)) nz = m.z;
        else if (this.canGo(m, m.x, nz, m.y, step)) nx = m.x;
        else {
          nx = m.x;
          nz = m.z;
          m.blocked++;
          if (m.blocked > 3 && m.want > 0) m.wantPath = true;
        }
      } else m.blocked = 0;
    }
    m.x = nx;
    m.z = nz;
    // altura
    const g = this.ground(m, m.x, m.z);
    const w = m.cave ? -Infinity : this.water(m.x, m.z);
    m.inWater = w > g + 0.35;
    if (flying) {
      const target = Math.max(g, m.inWater ? w : g) + m.alt;
      m.y += (target - m.y) * Math.min(1, dt * 2);
      if (m.y < g + 0.2) m.y = g + 0.2;
    } else if (d.habitat === 'water') {
      const lo = g + 0.3;
      const hi = w - 0.25;
      const target = lo + (hi - lo) * m.alt;
      m.y += (Math.max(lo, Math.min(hi, target)) - m.y) * Math.min(1, dt * 2);
      if (!(w > g + 0.4)) m.y = g + 0.2; // encalhado: fica no fundo (IA volta para a água)
    } else {
      m.vy -= G * dt;
      m.y += m.vy * dt;
      let floor = g;
      if (m.inWater && (d.habitat === 'amphib' || m.boss || (this.riding === m && d.ride?.swim))) floor = Math.max(g, w - m.def.plan.body[1] * 0.45 * m.scale);
      else if (m.inWater) floor = Math.max(g, w - 0.6);
      if (m.y <= floor) {
        const wasAir = !m.grounded;
        m.y = floor;
        m.vy = 0;
        m.grounded = true;
        if (wasAir) onLand(this, m);
      } else if (m.y > floor + 0.08) m.grounded = false;
      else {
        m.y = floor;
        m.vy = 0;
      }
    }
  }

  private animate(m: Mob, dt: number): void {
    const p = m.pose;
    const d = m.def;
    const k = Math.min(1, dt * 6);
    const sp = m.spd + Math.hypot(m.vx, m.vz) * 0.3;
    const legL = Math.max(0.12, (d.plan.legs?.len ?? d.plan.body[1] * 0.5) * m.scale);
    p.cycle += (sp / legL) * dt * 1.6;
    const gaitT = Math.min(1, sp / Math.max(1, d.run * 0.6));
    p.gait += (gaitT - p.gait) * k;
    const sleeping = m.st === 'sleep' ? 1 : 0;
    p.sleep += (sleeping - p.sleep) * Math.min(1, dt * 2);
    p.flash = Math.max(0, p.flash - dt * 4);
    let neck = 0;
    if (m.st === 'graze') neck = d.browse ? -0.7 : 1;
    if (m.st === 'idle' && d.browse) neck = -0.4;
    p.neck += (neck - p.neck) * Math.min(1, dt * 2.5);
    const flying = m.flying || (!m.grounded && d.ride?.glide && m === this.riding);
    if (m.boss) {
      // o chefe controla bote/braços; aqui só volta devagar ao normal
      p.flap += ((flying ? 1 : 0) - p.flap) * Math.min(1, dt * 3);
      p.lunge += (0 - p.lunge) * Math.min(1, dt * 3);
    } else {
      const flap = flying ? (m.st === 'flee' || m.vy > 0.5 ? 1 : 0.65) : d.plan.form === 'ghost' ? 0.25 : d.plan.form === 'plant' && m.st === 'windup' ? 1 : 0;
      p.flap += (flap - p.flap) * k;
      // bote: recua no aviso, avança no golpe
      if (m.st === 'windup') p.lunge += (-0.6 - p.lunge) * Math.min(1, dt * 5);
      else p.lunge += (0 - p.lunge) * Math.min(1, dt * 7);
    }
    const swim = m.inWater || d.habitat === 'water' ? 1 : 0;
    p.swim += (swim - p.swim) * k;
    // achatamento: pulos / gosmas / aviso de pulo
    let sq = 0;
    if (d.hops || d.mech === 'hop' || d.mech === 'split') {
      if (!m.grounded) sq = m.vy > 0 ? 0.18 : -0.05;
      else if (m.st === 'windup') sq = -0.25;
      else if (sp > 0.3) sq = Math.sin(p.cycle * 2) * 0.08;
    }
    if (d.plan.form === 'blob') sq += Math.sin(this.time * 4 + p.seed * 9) * 0.04;
    p.squash += (sq - p.squash) * Math.min(1, dt * 12);
    const ghost = m.phased ? 0.72 : m.st === 'vanish' ? Math.min(0.9, (6 - m.stT) / 6) : 0;
    p.ghost += (ghost - p.ghost) * k;
    // olhar o jogador quando perto e calmo
    let hy = 0;
    if (m.dist < 8 && (m.st === 'idle' || m.st === 'follow' || m.st === 'graze')) {
      hy = angDiff(m.yaw, Math.atan2(this.pl.x - m.x, this.pl.z - m.z));
      hy = Math.max(-0.8, Math.min(0.8, hy));
    }
    p.headYaw += (hy - p.headYaw) * Math.min(1, dt * 3);
    if (m.age < 1 && m.def.kind === 'animal') m.age = Math.min(1, m.age + dt / 600);
  }

  private stepDying(m: Mob, dt: number): void {
    m.dying -= dt;
    m.pose.squash = -0.3 + Math.max(0, m.dying) * 0.6;
    m.pose.flash = 1;
    m.y += dt * 1.5;
    m.yaw += dt * 14;
    if (m.dying <= 0) {
      m.dead = true;
      const s = m.def.plan.body[1] * m.scale;
      this.fx.poof(m.x, m.y, m.z, Math.max(0.5, s * 1.4), m.def.plan.glow ?? m.def.plan.col);
      this.sound('poof', m.x, m.y, m.z);
    }
  }

  /* ------------------------------ montaria ------------------------------ */
  mount(m: Mob): boolean {
    if (!m.tamed || !m.def.ride || m.age < 1 || this.riding || !m.alive || m.pinned) return false;
    this.riding = m;
    m.st = 'ridden';
    m.path = null;
    this.emit('mount', m);
    return true;
  }
  dismount(): Mob | null {
    const m = this.riding;
    if (!m) return null;
    this.riding = null;
    m.st = 'idle';
    m.want = 0;
    m.homeX = m.x;
    m.homeZ = m.z;
    this.emit('dismount', m);
    return m;
  }
  /** entrada do jogador montado: fwd -1..1, turn -1..1 (direita +), jump */
  rideInput(fwd: number, turn: number, jump: boolean): void {
    this.ride.fwd = fwd;
    this.ride.turn = turn;
    this.ride.jump = jump;
  }
  /** posição do assento (para o motor pôr o jogador/câmera) */
  seat(out: THREE.Vector3): THREE.Vector3 | null {
    const m = this.riding;
    if (!m || !m.def.ride) return null;
    return out.set(m.x, m.y + m.def.ride.seatY * m.scale, m.z);
  }
  private stepRide(m: Mob, dt: number): void {
    const r = m.def.ride!;
    m.yaw -= this.ride.turn * 2.4 * dt;
    m.want = this.ride.fwd * r.speed * (this.ride.fwd < 0 ? 0.4 : 1);
    if (m.want < 0) {
      m.yaw += Math.PI;
      m.want = -m.want;
      m.tx = m.x + Math.sin(m.yaw) * 5;
      m.tz = m.z + Math.cos(m.yaw) * 5;
      this.move(m, dt);
      m.yaw -= Math.PI;
    } else {
      m.tx = m.x + Math.sin(m.yaw) * 5;
      m.tz = m.z + Math.cos(m.yaw) * 5;
      this.move(m, dt);
    }
    if (this.ride.jump && m.grounded && r.jump > 0) {
      m.vy = r.jump;
      m.grounded = false;
    }
    if (r.glide && !m.grounded && this.ride.jump && m.vy < -2) m.vy = -2;
    m.dist = 0;
    this.animate(m, dt);
  }

  /* ------------------------------ combate ------------------------------ */
  /** dano no jogador já com armadura/resistências */
  hurtPlayer(m: Mob | null, dmg: number, kind: DamageKind, knock = 4, effect?: Effect, effSec = 3): number {
    if (this.targetId) {
      // outro jogador (online): o aparelho dele aplica a armadura
      const raw = Math.round(dmg * (m ? Math.sqrt(m.lvl) : 1) * 10) / 10;
      this.host.hurtPeer?.(this.targetId, raw, kind, m ? m.x : this.pl.x, m ? m.z : this.pl.z, knock, effect, effSec);
      this.emit('hurtPlayer', raw, kind, m);
      return raw;
    }
    const mo = this.mods;
    let f = dmg * (m ? Math.sqrt(m.lvl) : 1) * (1 - Math.min(0.85, mo.armor));
    if (kind === 'fire') f *= 1 - mo.fireRes;
    if (kind === 'cold') f *= 1 - mo.coldRes;
    if (kind === 'poison') f *= 1 - mo.poisonRes;
    f = Math.round(f * 10) / 10;
    const fx = m ? m.x : this.pl.x;
    const fz = m ? m.z : this.pl.z;
    if (f > 0) this.host.hurtPlayer(f, kind, fx, fz, knock);
    if (effect) {
      const res = effect === 'queimando' ? mo.fireRes : effect === 'gelo' ? mo.coldRes : effect === 'sono' ? mo.poisonRes : 0;
      if (res < 0.99) this.host.effect?.(effect, effSec * (1 - res));
    }
    this.emit('hurtPlayer', f, kind, m);
    return f;
  }

  /** dano num bicho (golpe, flecha, fogo, explosão) */
  damage(m: Mob, amount: number, o: DamageOpts = {}): DamageResult {
    const res: DamageResult = { dealt: 0, blocked: false, killed: false };
    if (!m.alive) return res;
    if (this.damageHook?.(m, amount, o)) return res;
    const kind = o.kind ?? 'melee';
    const fx = o.fromX ?? this.pl.x;
    const fz = o.fromZ ?? this.pl.z;
    let amt = amount;
    if (m.boss) {
      amt = m.boss.onDamage(m, amt, kind);
      if (amt <= 0) {
        res.blocked = true;
        this.fx.emit('star', m.x, m.y + m.def.plan.body[1] * m.scale, m.z, 3, 0.4, 2);
        this.sound('block', m.x, m.y, m.z);
        return res;
      }
    }
    if (m.def.mech === 'shield' && kind !== 'blast' && m.st !== 'stun') {
      const toSrc = Math.atan2(fx - m.x, fz - m.z);
      if (Math.abs(angDiff(m.yaw, toSrc)) < 1.0) {
        amt *= 0.1;
        res.blocked = true;
        this.fx.emit('star', m.x + Math.sin(m.yaw) * 0.6, m.y + 0.8, m.z + Math.cos(m.yaw) * 0.6, 5, 0.2, 3);
        this.sound('block', m.x, m.y, m.z);
      }
    }
    if ((m.phased || m.under) && kind !== 'blast') {
      res.blocked = true;
      this.fx.emit('sparkle', m.x, m.y + 0.6, m.z, 3, 0.3, 1);
      return res;
    }
    amt = Math.max(0, amt);
    m.hp -= amt;
    res.dealt = amt;
    m.pose.flash = 1;
    m.hurtT = this.time;
    this.sound('hit', m.x, m.y, m.z);
    // empurrão (bichos grandes quase não se mexem)
    const kb = (o.knock ?? 3) / Math.max(1, m.def.radius * m.scale * 1.5);
    if (!m.boss) {
      const dl = Math.hypot(m.x - fx, m.z - fz) || 1;
      m.vx += ((m.x - fx) / dl) * kb;
      m.vz += ((m.z - fz) / dl) * kb;
      if (m.grounded && m.def.habitat !== 'water') m.vy = Math.min(4, kb * 0.8);
    }
    // reação
    if (m.st === 'sleep') m.st = 'idle';
    const d = m.def;
    if (d.kind === 'animal') {
      if (d.attack && (d.temper === 'neutral' || m.tamed === false && d.temper === 'hostile')) m.aggro = this.time + 20;
      else m.alarm = this.time + 8;
      // o bando todo se assusta
      if (m.group) this.near(m.x, m.z, 16, (o2) => {
        if (o2.group === m.group && o2 !== m) {
          if (o2.def.attack && o2.def.temper === 'neutral') o2.aggro = this.time + 14;
          else o2.alarm = this.time + 8;
        }
      });
    } else m.aggro = this.time + 30;
    if (m.hp <= 0) {
      res.killed = true;
      this.kill(m);
    }
    return res;
  }

  /** derrota (puf de desenho animado + drops) */
  kill(m: Mob, drops = true): void {
    if (!m.alive) return;
    m.st = 'dying';
    m.dying = 0.35;
    m.hp = 0;
    if (this.riding === m) this.dismount();
    const got: [string, number][] = [];
    if (drops) {
      const big = m.age >= 1 ? 1 : 0.4;
      for (const dr of m.def.drops) {
        if (dr.chance !== undefined && Math.random() > dr.chance) continue;
        const n = Math.round((dr.min + Math.floor(Math.random() * (dr.max - dr.min + 1))) * big);
        if (n > 0) {
          got.push([dr.id, n]);
          this.host.drop(dr.id, n, m.x, m.y + 0.5, m.z);
        }
      }
      if (m.def.coins) this.host.coins?.(Math.round(m.def.coins * m.lvl));
    }
    // gosma divide
    if (m.def.mech === 'split' && m.gen < 2) {
      for (let i = 0; i < 2; i++) {
        const c = this.spawn(m.sp, m.x + (i ? 0.6 : -0.6), m.z + (Math.random() - 0.5), { y: m.y, cave: m.cave, group: m.group });
        c.gen = m.gen + 1;
        c.size = m.size * 0.62;
        c.hp = c.maxHp = Math.max(3, Math.round(m.maxHp * 0.42));
        c.lvl = m.lvl;
        c.vy = 5;
        c.grounded = false;
        c.vx = (i ? 1 : -1) * 3;
        c.aggro = this.time + 30;
      }
    }
    m.boss?.onPartDown(m);
    this.emit('kill', m, got);
  }

  /** bicho mais próximo atingido por um raio (mira de arma/ferramenta) */
  pick(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxD: number): Mob | null {
    let best: Mob | null = null;
    let bt = maxD;
    for (const m of this.mobs) {
      if (!m.alive || m.dist > maxD + 12) continue;
      const r = Math.max(0.35, m.radius * 1.15);
      const cy = m.y + m.def.plan.body[1] * 0.5 * m.scale + (m.def.plan.bodyY ?? 0) * 0.3;
      const lx = m.x - ox;
      const ly = cy - oy;
      const lz = m.z - oz;
      const tc = lx * dx + ly * dy + lz * dz;
      if (tc < 0 || tc > bt) continue;
      const d2 = lx * lx + ly * ly + lz * lz - tc * tc;
      const rr = r + m.def.plan.body[1] * 0.3 * m.scale;
      if (d2 < rr * rr) {
        bt = tc;
        best = m;
      }
    }
    return best;
  }

  /** golpe em arco à frente (espada, ferramenta) */
  hitArc(x: number, z: number, yaw: number, range: number, halfArc: number, dmg: number, kind: DamageKind = 'melee'): Mob[] {
    const hit: Mob[] = [];
    this.near(x, z, range + 3, (m) => {
      if (!m.alive) return;
      const d = Math.hypot(m.x - x, m.z - z) - m.radius;
      if (d > range) return;
      if (Math.abs(angDiff(yaw, Math.atan2(m.x - x, m.z - z))) > halfArc && d > 0.5) return;
      this.damage(m, dmg, { kind, fromX: x, fromZ: z, knock: 4 });
      hit.push(m);
    });
    return hit;
  }

  /** dano em área (bomba, poção) */
  hitSphere(x: number, y: number, z: number, r: number, dmg: number, kind: DamageKind = 'blast'): number {
    let n = 0;
    this.near(x, z, r + 4, (m) => {
      const d = Math.hypot(m.x - x, m.z - z, (m.y - y) * 0.7) - m.radius;
      if (d > r) return;
      this.damage(m, dmg * (1 - Math.max(0, d) / (r * 1.5)), { kind, fromX: x, fromZ: z, knock: 8 });
      n++;
    });
    return n;
  }

  /** projétil do jogador (estilingue, arco, bumerangue) */
  shoot(x: number, y: number, z: number, vx: number, vy: number, vz: number, dmg: number, col = '#ffe07a', grav = 9): Projectile {
    return this.fx.shoot({ x, y, z, vx, vy, vz, r: 0.12, grav, life: 3, col, side: 1, dmg, tag: null, trail: null });
  }

  /** projétil de bicho mirado no jogador (com arco opcional) */
  mobShoot(m: Mob, speed: number, col: string, r: number, arc: boolean, dmg: number, tag: unknown, fromY?: number): void {
    const p = this.pl;
    const sy = fromY ?? m.y + m.def.plan.body[1] * m.scale * 0.9;
    const dx = p.x - m.x;
    const dz = p.z - m.z;
    const dh = Math.hypot(dx, dz) || 1;
    const tFlight = dh / speed;
    const g = arc ? 9 : 0;
    const vy = (p.y + 1 - sy) / tFlight + 0.5 * g * tFlight;
    this.fx.shoot({ x: m.x + (dx / dh) * m.radius, y: sy, z: m.z + (dz / dh) * m.radius, vx: (dx / dh) * speed, vy, vz: (dz / dh) * speed, r, grav: g, life: 4, col, side: 0, dmg, tag, trail: null });
    this.sound('spit', m.x, m.y, m.z);
  }

  private stepProjectiles(dt: number): void {
    const P = this.fx.proj;
    const p = this.pl;
    for (let i = P.length - 1; i >= 0; i--) {
      const q = P[i];
      q.life -= dt;
      q.vy -= q.grav * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.z += q.vz * dt;
      if (q.trail && Math.random() < 0.5) this.fx.emit(q.trail, q.x, q.y, q.z, 1, 0.1, 0.5);
      let hit = false;
      if (q.side === 0) {
        const dx = q.x - p.x;
        const dy = q.y - (p.y + 0.9);
        const dz = q.z - p.z;
        if (dx * dx + dy * dy * 0.5 + dz * dz < (0.55 + q.r) ** 2 && p.alive) {
          const tag = q.tag as { m: Mob | null; kind: DamageKind; effect?: Effect; eff?: number } | null;
          this.hurtPlayer(tag?.m ?? null, q.dmg, tag?.kind ?? 'ranged', 3, tag?.effect, tag?.eff ?? 3);
          hit = true;
        } else if (this.host.others && this.host.hurtPeer)
          for (const o of this.host.others()) {
            const ex = q.x - o.x;
            const ey = q.y - (o.y + 0.9);
            const ez = q.z - o.z;
            if (ex * ex + ey * ey * 0.5 + ez * ez < (0.55 + q.r) ** 2 && o.alive) {
              const tag = q.tag as { m: Mob | null; kind: DamageKind; effect?: Effect; eff?: number } | null;
              const mm = tag?.m ?? null;
              this.host.hurtPeer(o.id, Math.round(q.dmg * (mm ? Math.sqrt(mm.lvl) : 1) * 10) / 10, tag?.kind ?? 'ranged', q.x - q.vx, q.z - q.vz, 3, tag?.effect, tag?.eff ?? 3);
              hit = true;
              break;
            }
          }
      } else {
        const sp = Math.hypot(q.vx, q.vy, q.vz) || 1;
        const m = this.pick(q.x - q.vx * dt, q.y - q.vy * dt, q.z - q.vz * dt, q.vx / sp, q.vy / sp, q.vz / sp, sp * dt + q.r);
        if (m) {
          this.damage(m, q.dmg, { kind: 'ranged', fromX: q.x - q.vx, fromZ: q.z - q.vz, knock: 2 });
          hit = true;
        }
      }
      if (!hit && q.y < this.host.heightAt(q.x, q.z) && !this.plCave) hit = true;
      if (!hit && this.plCave && this.host.floorAt && q.y < this.host.floorAt(q.x, q.y + 0.5, q.z)) hit = true;
      if (hit || q.life <= 0) {
        this.fx.emit(q.side === 0 ? 'goo' : 'dust', q.x, q.y, q.z, 5, 0.2, 2, '#' + q.col.getHexString());
        P[i] = P[P.length - 1];
        P.pop();
      }
    }
  }

  /* ------------------------------ domar / criar / produtos ------------------------------ */
  /** usar o item da mão num bicho (motor gasta `consumed` itens) */
  interact(m: Mob, held: string | null): InteractResult {
    const d = m.def;
    const none: InteractResult = { action: 'none', consumed: 0 };
    if (!m.alive || d.kind !== 'animal') return none;
    if (!held && m.tamed && d.ride && m.age >= 1) return { action: this.mount(m) ? 'mount' : 'none', consumed: 0 };
    if (held === 'balde' && d.milk && m.age >= 1 && m.produceT <= this.time) {
      m.produceT = this.time + 120;
      this.host.drop(d.milk, 1, m.x, m.y + 0.6, m.z);
      this.toast(t('mob.ui.milk', 'Leitinho fresco!'));
      return { action: 'milk', consumed: 0 };
    }
    if (held === 'tesoura' && d.shear && m.age >= 1 && m.shearedT <= this.time) {
      m.shearedT = this.time + 240;
      this.host.drop(d.shear, 1 + Math.floor(Math.random() * 3), m.x, m.y + 0.6, m.z);
      this.fx.emit('snow', m.x, m.y + 0.8, m.z, 8, 0.5, 2);
      return { action: 'shear', consumed: 0 };
    }
    if (!held) return none;
    if (!m.tamed && d.tame && d.tame.food.includes(held)) {
      if (Math.random() < d.tame.chance) {
        this.tame(m);
        return { action: 'tamed', consumed: 1 };
      }
      this.fx.emit('smoke', m.x, m.y + m.def.plan.body[1], m.z, 4, 0.3, 1);
      m.alarm = 0;
      return { action: 'taming', consumed: 1 };
    }
    if (d.breed && d.breed.includes(held) && (m.tamed || !d.tame)) {
      if (m.age < 1) {
        m.age = Math.min(1, m.age + 0.1);
        this.fx.emit('heart', m.x, m.y + 1, m.z, 2, 0.3, 1);
        return { action: 'love', consumed: 1 };
      }
      if (m.breedCd > this.time || m.love > this.time) return { action: 'notHungry', consumed: 0 };
      m.love = this.time + 30;
      this.fx.emit('heart', m.x, m.y + m.def.plan.body[1] * m.scale + 0.6, m.z, 6, 0.4, 1.5);
      this.sound('love', m.x, m.y, m.z);
      return { action: 'love', consumed: 1 };
    }
    return none;
  }

  tame(m: Mob): void {
    m.tamed = true;
    m.persistent = true;
    m.st = 'follow';
    m.aggro = 0;
    m.alarm = 0;
    this.fx.emit('heart', m.x, m.y + m.def.plan.body[1] * m.scale + 0.5, m.z, 10, 0.5, 2);
    this.sound('tame', m.x, m.y, m.z);
    this.toast(t('mob.ui.tamed', '{n} agora é seu amigo!', { n: m.def.name() }));
    this.emit('tame', m);
  }

  /** dois apaixonados se encontraram */
  breed(a: Mob, b: Mob): void {
    a.love = b.love = 0;
    a.breedCd = b.breedCd = this.time + 120;
    const baby = this.spawn(a.sp, (a.x + b.x) / 2, (a.z + b.z) / 2, { y: a.y, cave: a.cave, age: 0.3, tamed: a.tamed || b.tamed, group: a.group });
    this.fx.emit('heart', baby.x, baby.y + 0.8, baby.z, 12, 0.6, 2);
    this.toast(t('mob.ui.baby', 'Nasceu um filhote de {n}!', { n: a.def.name() }));
    this.emit('breed', a);
    this.emit('birth', baby);
  }

  toast(msg: string): void {
    this.emit('toast', msg);
  }

  /* ------------------------------ chefes e covis ------------------------------ */
  private checkLairs(): void {
    this.checkLairsAt(this.pl);
    for (const o of this.host.others?.() ?? []) this.checkLairsAt(o);
  }
  private checkLairsAt(p: PlayerView): void {
    const ci = Math.round(p.x / LAIR_CELL);
    const cj = Math.round(p.z / LAIR_CELL);
    for (let i = ci - 1; i <= ci + 1; i++)
      for (let j = cj - 1; j <= cj + 1; j++) {
        const key = i + ',' + j;
        let L = this.lairs.get(key);
        if (L === undefined) {
          const l = lairAt(this.host, i, j);
          if (!l) continue;
          this.lairs.set(key, l);
          L = l;
        }
        const d = Math.hypot(L.x - p.x, L.z - p.z);
        if (d < 160 && !this.preparedLairs.has(L.key)) {
          this.preparedLairs.add(L.key);
          this.host.prepareArena?.(L);
        }
        if (d < L.r + 10 && Math.abs(L.y - p.y) < 14 && !this.defeated.has(L.key) && !this.bosses.some((b) => b.lair.key === L!.key)) this.startBoss(L);
      }
  }

  /** começa a luta (usado também pelo zoológico / comandos de teste) */
  startBoss(lair: Lair): BossCtl {
    const b = new BossCtl(this, lair);
    this.bosses.push(b);
    this.emit('bossStart', b);
    return b;
  }
  /** chamado pelo chefe ao ser derrotado */
  bossDefeated(b: BossCtl): void {
    this.defeated.add(b.lair.key);
    this.emit('bossDefeat', b);
  }
  isDefeated(key: string): boolean {
    return this.defeated.has(key);
  }

  /* ------------------------------ desenho ------------------------------ */
  private sync(camera: THREE.Camera): void {
    const R = this.render;
    const b = this.budget;
    camera.updateMatrixWorld();
    this.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pv);
    this.camPos.setFromMatrixPosition(camera.matrixWorld);
    this.camRight.setFromMatrixColumn(camera.matrixWorld, 0);
    const sph = _sph;
    R.begin();
    const day = this.host.dayTime();
    const light = 0.3 + 0.7 * Math.max(0, Math.min(1, (Math.sin((day - 0.25) * TAU) + 0.25) * 1.6));
    R.setLight(light);
    for (const m of this.mobs) {
      if (m.dead) continue;
      if (m.under && m.st !== 'windup') {
        // embaixo da terra: só o montinho de poeira
        if (m.dist < 40 && Math.random() < 0.3) this.fx.emit('dust', m.x, m.y, m.z, 1, 0.4, 1.5);
        continue;
      }
      const s = m.scale;
      const hgt = R.models[m.sp].height * s;
      sph.center.set(m.x, m.y + hgt * 0.5, m.z);
      sph.radius = Math.max(hgt, R.models[m.sp].halfW * 2 * s) * 0.75;
      if (!this.frustum.intersectsSphere(sph)) continue;
      const cd = this.camPos.distanceTo(sph.center);
      m.camD = cd;
      const nearD = m.def.kind === 'boss' ? 400 : b.near * (m.def.radius > 1.5 ? 1.6 : 1);
      if (cd < nearD) {
        const tint = m.tamed ? 1.05 : 1;
        let pitch = 0;
        let roll = 0;
        if (m.flying) {
          pitch = Math.max(-0.4, Math.min(0.4, -m.vy * 0.05));
          roll = Math.sin(this.time * 1.3 + m.pose.seed * 6) * 0.12;
        }
        R.pushNear(m.sp, m.x, m.y, m.z, m.yaw, s, m.pose, tint, pitch, roll);
        if (cd < b.near * 0.8 && m.def.habitat !== 'water') {
          const g = m.flying || !m.grounded ? this.ground(m, m.x, m.z) : m.y;
          if (m.y - g < 12) R.pushShadow(m.x, g, m.z, Math.max(0.25, R.models[m.sp].halfW * s * 0.9) * (1 - (m.y - g) / 16));
        }
      } else if (cd < b.far && !m.phased) {
        const fwdX = Math.sin(m.yaw);
        const fwdZ = Math.cos(m.yaw);
        R.pushFar(m.sp, m.x, m.y, m.z, s, fwdX * this.camRight.x + fwdZ * this.camRight.z > 0);
      }
    }
    R.end();
    this.fx.sync();
  }

  /* ------------------------------ salvar ------------------------------ */
  save(): MobSave {
    return {
      v: 1,
      tamed: this.mobs.filter((m) => m.tamed && !m.dead).map((m) => ({ id: m.def.id, x: +m.x.toFixed(1), y: +m.y.toFixed(1), z: +m.z.toFixed(1), age: +m.age.toFixed(2), name: m.name })),
      defeated: [...this.defeated],
    };
  }
  load(s: MobSave | null | undefined): void {
    if (!s || s.v !== 1) return;
    for (const k of s.defeated) this.defeated.add(k);
    for (const r of s.tamed) {
      if (!MOB_INDEX.has(r.id)) continue;
      const m = this.spawn(r.id, r.x, r.z, { y: r.y, age: r.age, tamed: true });
      m.name = r.name;
    }
  }

  /** remove tudo (troca de mundo) */
  clear(): void {
    for (const m of this.mobs) m.dead = true;
    this.mobs.length = 0;
    for (const b of this.bosses) b.dispose();
    this.bosses.length = 0;
    this.riding = null;
    this.fx.clear();
  }

  dispose(): void {
    this.clear();
    this.render.dispose();
    this.fx.dispose();
    this.bar?.dispose();
  }

  /** estatística: contagem por tipo */
  counts(): { animals: number; monsters: number; bosses: number } {
    let a = 0;
    let mo = 0;
    let bo = 0;
    for (const m of this.mobs) {
      if (m.dead) continue;
      if (m.def.kind === 'animal') a++;
      else if (m.def.kind === 'monster') mo++;
      else bo++;
    }
    return { animals: a, monsters: mo, bosses: bo };
  }

  emitFx(kind: FxKind, x: number, y: number, z: number, n: number, spread = 0.5, speed = 2, col?: string): void {
    this.fx.emit(kind, x, y, z, n, spread, speed, col);
  }
}
const _sph = new THREE.Sphere();
