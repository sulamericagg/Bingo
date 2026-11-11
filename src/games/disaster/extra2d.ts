/* ============================================================
 *  MOTORES NOVOS DO 2D (docs/DISASTER-DESIGN.md §9): gravidade maluca, buraco negro,
 *  abdução, lasers, pisão do gigante, onda de calor, incêndio, nevasca, gêiseres,
 *  fantasminhas, abelhas e bolas rolando. Cada um tem AVISO (contagem/sombra/linha),
 *  CONTRA-JOGADA clara e ajuda para os bots. Estado em pool fixo (nada alocado por quadro).
 * ============================================================ */
import { t } from '../../i18n';
import { audio } from '../../core/audio';
import { tap } from '../../core/haptics';
import type { DisasterGame, Player } from './game';
import { R } from './game';
import { GROUND_Y } from './world';
import type { DisasterId } from './scenarios';
import { roundRect } from './draw';

const TAU = Math.PI * 2;

interface Ufo {
  on: boolean;
  x: number;
  y: number;
  vx: number;
  /** 0 = procurando, 1 = aviso (luz fraca), 2 = raio */
  st: number;
  t: number;
  r: number;
  /** centro do raio (travado no aviso: o círculo no chão não anda) */
  bx: number;
}
interface Laser {
  on: boolean;
  y: number;
  dir: number;
  front: number;
  /** aviso restante (s) */
  warn: number;
  /** fim da varredura (bateu numa casa) */
  stop: number;
  high: boolean;
  life: number;
}
interface Stomp {
  on: boolean;
  x: number;
  r: number;
  t: number;
  T: number;
  /** onda de choque: raio atual (−1 = ainda não) */
  ring: number;
  max: number;
  lift: number;
}
interface Vent {
  x: number;
  warn: number;
  erupt: number;
  cd: number;
}
interface Ghost {
  on: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  tgt: number;
  t: number;
  /** aparecendo (s): inofensivo */
  fade: number;
  dash: number;
  r: number;
}
interface Swarm {
  on: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  tgt: number;
  t: number;
  r: number;
  angry: number;
  bored: number;
}
interface Camp {
  on: boolean;
  x: number;
  t: number;
}

export class Extra2D {
  g: DisasterGame;
  /* gravidade: 0 calma, 1 aviso, 2 flutuando */
  grav = { st: 0, t: 0, next: 0 };
  hole = { on: false, x: 0, y: -520, st: 0, t: 0, next: 0, pull: 0 };
  ufos: Ufo[] = [];
  lasers: Laser[] = [];
  stomps: Stomp[] = [];
  /** onda de calor: 0 calma, 1 aviso, 2 solão */
  sun = { st: 0, t: 0, next: 0, k: 0 };
  /** incêndio: frentes (x) e direção; ±1e9 = desligada */
  fire = { a: -1e9, b: 1e9, va: 0, vb: 0, band: 160, bOn: false, bAt: 0 };
  cold = { st: 0, t: 0, next: 0 };
  camps: Camp[] = [];
  vents: Vent[] = [];
  ghosts: Ghost[] = [];
  swarms: Swarm[] = [];
  /** bolas rolando: relógio próprio */
  ballSide = 1;
  /** tremor visual do "pisão" */
  thump = 0;
  /** casas assombradas (s restantes) */
  haunt: number[] = [];
  /** buraco negro sobre a casa (s) / casa abafada no calor (s) */
  roofT: number[] = [];
  stuffy: number[] = [];

  constructor(g: DisasterGame) {
    this.g = g;
    for (let i = 0; i < 3; i++) this.ufos.push({ on: false, x: 0, y: -420, vx: 0, st: 0, t: 0, r: 60, bx: 0 });
    for (let i = 0; i < 4; i++) this.lasers.push({ on: false, y: 0, dir: 1, front: 0, warn: 0, stop: 0, high: false, life: 0 });
    for (let i = 0; i < 6; i++) this.stomps.push({ on: false, x: 0, r: 90, t: 0, T: 1, ring: -1, max: 300, lift: 0 });
    for (let i = 0; i < 4; i++) this.camps.push({ on: false, x: 0, t: 0 });
    for (let i = 0; i < 9; i++) this.ghosts.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, tgt: -1, t: 0, fade: 0, dash: 0, r: 20 });
    for (let i = 0; i < 3; i++) this.swarms.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, tgt: -1, t: 0, r: 30, angry: 0, bored: 0 });
  }

  get tn() {
    return this.g.sc.tune;
  }
  private size(): number {
    return this.tn?.size ?? 1;
  }
  /** este motor é o 2º do desastre duplo? (entra mais fraco) */
  private sec(d: DisasterId): boolean {
    const ds = this.g.sc.disasters;
    return ds.length > 1 && ds[1] === d;
  }
  private rate(): number {
    return this.tn?.rate ?? 1;
  }

  /** zera tudo (nova rodada) */
  reset(): void {
    this.grav.st = 0;
    this.hole.on = false;
    for (const u of this.ufos) u.on = false;
    for (const l of this.lasers) l.on = false;
    for (const s of this.stomps) s.on = false;
    this.sun.st = 0;
    this.sun.k = 0;
    this.fire.a = -1e9;
    this.fire.b = 1e9;
    this.fire.bOn = false;
    this.cold.st = 0;
    for (const c of this.camps) c.on = false;
    this.vents.length = 0;
    for (const o of this.ghosts) o.on = false;
    for (const o of this.swarms) o.on = false;
    this.thump = 0;
    this.haunt = this.g.world.houses.map(() => 0);
    this.roofT = this.g.world.houses.map(() => 0);
    this.stuffy = this.g.world.houses.map(() => 0);
  }

  /* ------------------------------ começo ------------------------------ */

  begin(d: DisasterId): void {
    const g = this.g;
    const w = g.world;
    const I = g.I;
    const sz = this.size();
    switch (d) {
      case 'gravidade':
        this.grav.st = 0;
        this.grav.next = 4.5;
        break;
      case 'buraco':
        this.hole.on = true;
        this.hole.x = w.W * (0.35 + g.rng() * 0.3);
        this.hole.y = -540;
        this.hole.st = 0;
        this.hole.t = 0;
        this.hole.next = 3;
        this.hole.pull = 0;
        break;
      case 'abducao': {
        const n = this.tn?.mini ? 3 : 1;
        for (let i = 0; i < n; i++) {
          const u = this.ufos[i];
          u.on = true;
          u.x = i % 2 ? w.W + 200 : -200;
          u.y = -430 - i * 30;
          u.vx = 0;
          u.st = 0;
          u.t = 1.5 + i * 1.2;
          u.r = (this.tn?.mini ? 58 : 90) * sz;
        }
        break;
      }
      case 'laser':
        g.timers.laser = 1.5;
        break;
      case 'pisao':
        g.timers.pisao = 1.2;
        break;
      case 'calor':
        this.sun.st = 0;
        this.sun.next = 3.5;
        break;
      case 'incendio': {
        const side = g.rng() < 0.5 ? -1 : 1;
        const dur = g.phaseDur || 46;
        const v = ((w.W + 400) / (dur * 0.82)) * (this.tn?.wind ? 1.2 : 1);
        if (side > 0) {
          this.fire.a = -200;
          this.fire.va = v;
        } else {
          this.fire.b = w.W + 200;
          this.fire.vb = v;
        }
        this.fire.band = 150 + 40 * I;
        // 2º foco do outro lado (mais tarde) em intensidade alta
        this.fire.bOn = I >= 1.05 || !!this.tn?.giant;
        this.fire.bAt = dur * 0.42;
        g.timers.ember = 3;
        break;
      }
      case 'nevasca':
        this.cold.st = 0;
        this.cold.next = 6;
        g.timers.camp = 0.5;
        // a neve cobre o chão (não mata: só enfeita e esconde degraus baixos)
        if (!g.fluid) {
          g.fluid = { kind: 'snow', level: 0, target: 9, rate: 0.4, front: -300, dir: 0, speed: 0, crest: 0, push: 0, base: 0 };
        }
        break;
      case 'geiser': {
        this.vents.length = 0;
        const n = Math.round((5 + 1.5 * I) * (this.tn?.mini ? 1.5 : 1));
        for (let i = 0; i < n; i++) {
          const x = 90 + ((i + 0.3 + g.rng() * 0.4) / n) * (w.W - 180);
          this.vents.push({ x, warn: 0, erupt: 0, cd: 1 + g.rng() * 4 });
        }
        g.timers.geiser = 1.4;
        // água quente acumulando no chão (rasa)
        if (!g.fluid) g.fluid = { kind: 'water', level: 0, target: 14 + 6 * I, rate: 0.35, front: -300, dir: 0, speed: 0, crest: 0, push: 0, base: 0 };
        break;
      }
      case 'fantasma': {
        const n = this.sec('fantasma') ? 1 : this.tn?.giant ? 1 : Math.round((1.0 + 0.8 * I) * (this.tn?.mini ? 1.8 : 1));
        for (let i = 0; i < Math.min(n, this.ghosts.length); i++) this.spawnGhost(this.ghosts[i], i * 1.4);
        break;
      }
      case 'abelhas': {
        const n = this.tn?.mini ? 3 : this.tn?.giant ? 1 : 1;
        for (let i = 0; i < n; i++) this.spawnSwarm(this.swarms[i], i);
        g.timers.swarm2 = (g.phaseDur || 46) * 0.4;
        break;
      }
      case 'bolas':
        g.timers.bolas = 1.2;
        this.ballSide = g.rng() < 0.5 ? -1 : 1;
        break;
      default:
        break;
    }
  }

  private spawnGhost(o: Ghost, delay: number): void {
    const g = this.g;
    o.on = true;
    o.x = 80 + g.rng() * (g.world.W - 160);
    o.y = -120 - g.rng() * 160;
    o.vx = o.vy = 0;
    o.tgt = -1;
    o.t = 0;
    o.fade = 1.4 + delay;
    o.dash = 0;
    o.r = (this.tn?.giant ? 34 : this.tn?.mini ? 14 : 20) * (this.tn?.giant ? 1 : 1);
  }
  private spawnSwarm(o: Swarm, i: number): void {
    const g = this.g;
    o.on = true;
    o.x = i % 2 ? g.world.W + 60 : -60;
    o.y = -160;
    o.vx = o.vy = 0;
    o.tgt = -1;
    o.t = 0;
    o.r = this.tn?.giant ? 46 : this.tn?.mini ? 20 : 30;
    o.angry = 0;
    o.bored = 0;
  }

  /* ------------------------------ consultas ------------------------------ */

  /** y da parte de baixo do que está logo acima da cabeça (−1e9 = céu aberto) */
  ceilingAbove(px: number, py: number, maxUp = 900, solidOnly = false): number {
    const w = this.g.world;
    const head = py - 24;
    let best = -1e9;
    for (const s of w.solids) {
      if (s.kind === 'ground' || s.gone || (solidOnly && s.oneWay)) continue;
      if (px < s.x + 2 || px > s.x + s.w - 2) continue;
      const bot = s.y + s.h;
      if (bot <= head + 2 && bot > head - maxUp && bot > best) best = bot;
    }
    for (const b of w.bodies) {
      if (!b.alive || b.kind === 'ladder' || b.tip) continue;
      if (px < b.x + 2 || px > b.x + b.w - 2) continue;
      const bot = b.y + b.h;
      if (bot <= head + 2 && bot > head - maxUp && bot > best) best = bot;
    }
    return best;
  }
  /** inclinação do sol (dx por unidade de altura): o sol cruza o céu e a sombra anda */
  sunSlope(): number {
    const g = this.g;
    return -0.85 + 1.7 * Math.min(1, g.phaseT / Math.max(1, g.phaseDur));
  }
  /** na sombra de algo (raio inclinado do sol) */
  shaded(px: number, py: number): boolean {
    const w = this.g.world;
    const sl = this.sunSlope();
    const head = py - 24;
    for (const s of w.solids) {
      if (s.kind === 'ground' || s.gone) continue;
      const bot = s.y + s.h;
      if (bot > head + 2 || bot < head - 700) continue;
      const rx = px + sl * (py - bot);
      if (rx > s.x + 2 && rx < s.x + s.w - 2) return true;
    }
    for (const b of w.bodies) {
      if (!b.alive || b.kind === 'ladder' || b.tip) continue;
      const bot = b.y + b.h;
      if (bot > head + 2 || bot < head - 700) continue;
      const rx = px + sl * (py - bot);
      if (rx > b.x + 2 && rx < b.x + b.w - 2) return true;
    }
    return false;
  }
  /** debaixo de algo (teto, laje, plataforma, copa) ou dentro de casa */
  covered(p: Player, maxUp = 700): boolean {
    return this.g.world.insideHouse(p.x, p.y) || this.ceilingAbove(p.x, p.y, maxUp) > -1e8;
  }
  /** teto de verdade (casa, laje, bloco de torre): plataforma de tábua/copa não segura quem flutua */
  roofed(p: Player, maxUp = 900): boolean {
    return this.g.world.insideHouse(p.x, p.y) || this.ceilingAbove(p.x, p.y, maxUp, true) > -1e8;
  }
  private houseSafe(p: Player): boolean {
    const w = this.g.world;
    for (let i = 0; i < w.houses.length; i++) {
      const h = w.houses[i];
      if (p.x > h.x + 6 && p.x < h.x + h.w - 6 && p.y > h.top - 4 && p.y <= GROUND_Y + 2) return !h.ripped && (this.haunt[i] ?? 0) <= 0 && w.insideHouse(p.x, p.y);
    }
    return false;
  }
  private houseAt(p: Player): number {
    const w = this.g.world;
    for (let i = 0; i < w.houses.length; i++) {
      const h = w.houses[i];
      if (p.x > h.x + 6 && p.x < h.x + h.w - 6 && p.y > h.top - 4 && p.y <= GROUND_Y + 2 && w.insideHouse(p.x, p.y)) return i;
    }
    return -1;
  }
  private warm(p: Player): number {
    for (const c of this.camps) if (c.on && Math.abs(p.x - c.x) < 64 && p.y > -60) return 1;
    return this.g.world.insideHouse(p.x, p.y) ? 0.5 : 0;
  }
  /** chão queimando em x (incêndio) */
  burningAt(x: number): boolean {
    const f = this.fire;
    if (f.a > -1e8 && x < f.a && x > f.a - f.band) return true;
    if (f.b < 1e8 && x > f.b && x < f.b + f.band) return true;
    return false;
  }
  /** chão já queimado (seguro) */
  ashAt(x: number): boolean {
    const f = this.fire;
    return (f.a > -1e8 && x <= f.a - f.band) || (f.b < 1e8 && x >= f.b + f.band);
  }

  /** multiplicador da gravidade do Bloop */
  gravK(p: Player): number {
    const base = this.tn?.grav ?? 1;
    if (this.grav.st === 2 && !p.climbing && !this.g.world.insideHouse(p.x, p.y)) return -0.66;
    return this.g.active.has('gravidade') ? base * 0.82 : base;
  }
  /** atrito no chão (gelo/neve) */
  slipK(): number {
    return this.tn?.slip ?? 1;
  }

  /* ------------------------------ forças nos jogadores ------------------------------ */

  force(p: Player, dt: number): void {
    const g = this.g;
    if (g.phase !== 'disaster') return;
    const w = g.world;
    // buraco negro: puxa para o meio (dentro de casa ou na escada, não) e levanta perto
    const h = this.hole;
    if (h.on && !p.climbing && !w.insideHouse(p.x, p.y)) {
      const dx = h.x - p.x;
      const ad = Math.abs(dx);
      const F = h.pull * Math.max(0, 1 - ad / 1100);
      p.x += Math.sign(dx) * F * 0.4 * dt;
      p.vx += Math.sign(dx) * F * dt;
      if (ad < 230 && h.st === 2) p.vy -= (3300 + 500 * g.I) * (1 - ad / 230) * dt;
    }
    // disco voador: o raio levanta quem está debaixo dele sem teto
    for (const u of this.ufos) {
      if (!u.on || u.st !== 2) continue;
      if (Math.abs(p.x - u.bx) < u.r && !this.roofed(p, 600)) {
        p.vy -= 4300 * dt;
        if (p.vy < -420) p.vy = -420;
        p.vx += (u.bx - p.x) * 2 * dt;
      }
    }
    // nevasca: rajada gelada empurra
    if (this.cold.st === 2 && !w.insideHouse(p.x, p.y)) p.vx += (g.wind >= 0 ? 1 : -1) * 260 * dt * (p.onGround ? 0.5 : 1);
  }

  /** depois de mover: teto segura quem flutua; incêndio, calor, frio, gêiseres, fantasmas, abelhas, lasers */
  post(p: Player, prevY: number, dt: number): void {
    const g = this.g;
    if (this.grav.st === 2 && p.vy < 0) {
      if (p.vy < -320) p.vy = -320;
      const c = this.ceilingAbove(p.x, prevY, 900, true);
      if (c > -1e8 && p.y - 24 < c) {
        p.y = c + 24;
        p.vy = 0;
      }
    }
    if (!p.alive || p.safe || p.shield > 0 || g.phase !== 'disaster') return;
    // flutuou para longe / foi abduzido (chegou no disco)
    if (p.y < -640 || (p.y < -360 && this.ufos.some((u) => u.on && u.st === 2 && Math.abs(p.x - u.bx) < u.r))) {
      g.knockOut(p, 0, this.hole.on ? 'hole' : this.grav.st === 2 ? 'float' : 'ufo');
      if (p.self) g.hud.toast(this.ufos.some((u) => u.on) ? t('dz.out.ufo', 'Os alienígenas levaram você para passear!') : t('dz.out.float', 'Você flutuou para longe!'));
      return;
    }
    const h = this.hole;
    if (h.on && Math.hypot(p.x - h.x, p.y - 12 - h.y) < 80) {
      g.knockOut(p, 0, 'hole');
      return;
    }
    // incêndio: chão queimando
    if (p.y > -10 && this.burningAt(p.x) && !g.world.insideHouse(p.x, p.y)) {
      p.burn += dt * 1.4;
      if (p.burn > 0.5) {
        g.knockOut(p, 0, 'wildfire');
        return;
      }
    }
    // medidor (calor/frio)
    if (g.active.has('calor')) {
      const hi = this.houseAt(p);
      const cov = hi >= 0 ? this.stuffy[hi] >= 0 : this.shaded(p.x, p.y) || (p.swim && g.fluid?.kind === 'water');
      const k = this.sun.st === 2 ? 0.25 + 0.07 * g.I : 0.035;
      p.meter = cov ? Math.max(0, p.meter - dt * 0.3) : Math.min(1.05, p.meter + dt * k * (g.training ? 0.7 : 1));
    } else if (g.active.has('nevasca')) {
      const wm = this.warm(p);
      const k = (0.038 + 0.016 * g.I + (this.cold.st === 2 ? 0.09 : 0)) * (g.training ? 0.7 : 1);
      p.meter = wm >= 1 ? Math.max(0, p.meter - dt * 0.35) : Math.min(1.05, p.meter + dt * k * (wm > 0 ? 0.45 : 1));
    }
    if (p.meter >= 1) {
      g.knockOut(p, 0, g.active.has('calor') ? 'heat' : 'cold');
      if (p.self) g.hud.toast(g.active.has('calor') ? t('dz.out.heat', 'Ufa, que calor! Você derreteu como sorvete.') : t('dz.out.cold', 'Brrr! Você virou picolé.'));
      return;
    }
    // gêiser: coluna de água quente
    for (const v of this.vents) {
      if (v.erupt <= 0) continue;
      if (Math.abs(p.x - v.x) < 22 * this.size() + 6 && p.y > -520) {
        g.knockOut(p, 0, 'geyser');
        return;
      }
    }
    // fantasminhas / abelhas
    for (const o of this.ghosts) {
      if (!o.on || o.fade > 0) continue;
      if (Math.hypot(p.x - o.x, p.y - 12 - o.y) < o.r + 10 && !this.houseSafe(p)) {
        g.knockOut(p, Math.sign(p.x - o.x), 'ghost');
        if (p.self) g.hud.toast(t('dz.out.ghost', 'Buu! Um fantasminha te pegou.'));
        return;
      }
    }
    for (const o of this.swarms) {
      if (!o.on) continue;
      if (Math.hypot(p.x - o.x, p.y - 12 - o.y) < o.r * 0.7 + 10 && !g.world.insideHouse(p.x, p.y) && !(p.swim && p.y - 20 > g.surfaceAt(p.x))) {
        g.knockOut(p, Math.sign(p.x - o.x), 'bees');
        if (p.self) g.hud.toast(t('dz.out.bees', 'Ai! As abelhas te alcançaram.'));
        return;
      }
    }
    // lasers: a linha de luz na altura dela
    for (const l of this.lasers) {
      if (!l.on || l.warn > 0) continue;
      const tail = l.front - l.dir * 120;
      const lo = Math.min(tail, l.front);
      const hi = Math.max(tail, l.front);
      if (p.x > lo && p.x < hi && p.y - 20 < l.y && p.y - 5 > l.y) {
        g.knockOut(p, l.dir, l.high ? 'laserHi' + (p.onGround ? 'G' : 'A') : 'laserLo' + (p.onGround ? 'G' : 'A'));
        return;
      }
    }
    // pisão: dentro do pé / onda de choque no chão
    for (const s of this.stomps) {
      if (!s.on) continue;
      if (s.t <= 0 && s.ring < 0) continue;
      if (s.ring >= 0 && s.ring < s.max && p.onGround && p.y > -8) {
        const d = Math.abs(p.x - s.x);
        if (d > s.r * 0.8 && Math.abs(d - s.ring) < 26) {
          g.knockOut(p, Math.sign(p.x - s.x), 'shock');
          return;
        }
      }
    }
  }

  /* ------------------------------ atualização ------------------------------ */

  update(dt: number, k: number): void {
    const g = this.g;
    const w = g.world;
    const I = g.I;
    const A = g.active;
    if (this.thump > 0) this.thump = Math.max(0, this.thump - dt * 2.5);
    for (let i = 0; i < this.haunt.length; i++) if (this.haunt[i] > 0) this.haunt[i] -= dt;

    // ---- gravidade maluca: pulsos de flutuar (avisados) ----
    if (A.has('gravidade')) {
      const G = this.grav;
      G.t += dt;
      if (G.st === 0) {
        G.next -= dt * g.kOf('gravidade', k);
        if (G.next <= 1.9 * g.tele) {
          G.st = 1;
          G.t = 0;
          g.alert('gravidade', 2, 1.9 * g.tele, t('dz.al.float', 'A gravidade vai sumir! Fique embaixo de um teto!'));
        // no aviso, a casa mais cheia perde o telhado (sai flutuando): dá tempo de correr para outro teto
        if (g.rng() < 0.1 + 0.2 * g.heat && w.houses.filter((hh) => !hh.ripped).length >= 2) {
          let best = -1;
          let bn = 0;
          for (let i = 0; i < w.houses.length; i++) {
            const hs = w.houses[i];
            if (hs.ripped) continue;
            let n = 0;
            for (const p of g.players) if (p.alive && p.x > hs.x && p.x < hs.x + hs.w && p.y > hs.top - 4 && p.y <= 2) n++;
            if (n > bn) {
              bn = n;
              best = i;
            }
          }
          if (best >= 0) g.ripRoof(best, 0);
        }
        }
      } else if (G.st === 1 && G.t >= 1.9 * g.tele) {
        G.st = 2;
        G.t = 0;

        audio.siren(0.6);
        for (const b of w.bodies) if (b.alive && b.kind === 'crate') w.push(b, (g.rng() - 0.5) * 80, -260);
      } else if (G.st === 2) {
        for (const b of w.bodies) if (b.alive && b.awake && b.kind === 'crate' && b.y > -500) b.vy -= 2100 * dt;
        if (G.t >= 2.8 + 0.8 * I) {
          G.st = 0;
          G.next = Math.max(4.5, 8 - 2 * g.heat) / this.rate();
          if (g.q.shake) g.shake = Math.max(g.shake, 0.3);
        }
      }
    }
    // ---- buraco negro ----
    const h = this.hole;
    if (h.on) {
      h.t += dt;
      // deriva devagar para onde está a turma
      let sx = 0;
      let n = 0;
      for (const p of g.players)
        if (p.alive) {
          sx += p.x;
          n++;
        }
      if (n) h.x += Math.max(-1, Math.min(1, (sx / n - h.x) / 200)) * (22 + 10 * I) * dt;
      h.x = Math.max(160, Math.min(w.W - 160, h.x));
      if (h.st === 0) {
        h.pull = 40;
        h.next -= dt * g.kOf('buraco', k);
        if (h.next <= 1.8 * g.tele) {
          h.st = 1;
          h.t = 0;
          g.alert('buraco', 2, 1.8 * g.tele, t('dz.al.hole', 'O buraco negro vai puxar! Fuja do meio!'));
        }
      } else if (h.st === 1) {
        h.pull = 60;
        if (h.t >= 1.8 * g.tele) {
          h.st = 2;
          h.t = 0;
        }
      } else {
        h.pull = (235 + 90 * I) * (this.tn?.mini || this.sec('buraco') ? 0.7 : 1);
        if (g.q.shake) g.shake = Math.max(g.shake, 0.15);
        // casas logo abaixo perdem o telhado (deixam de ser abrigo)
        for (let i = 0; i < w.houses.length; i++) {
          const hs = w.houses[i];
          if (hs.ripped || Math.abs(hs.x + hs.w / 2 - h.x) > 230) continue;
          this.roofT[i] = (this.roofT[i] ?? 0) + dt * I;
          if (this.roofT[i] > 2.6) g.ripRoof(i, h.x - (hs.x + hs.w / 2));
        }
        // suga caixas, telhados soltos e destroços
        for (const b of w.bodies) {
          if (!b.alive) continue;
          const dx = h.x - (b.x + b.w / 2);
          if (Math.abs(dx) > 520) continue;
          if (!b.awake && (b.kind === 'crate' || b.kind === 'roof' || b.kind === 'cap') && g.rng() < dt * 0.6) w.wake(b);
          if (!b.awake) continue;
          b.vx += Math.sign(dx) * 500 * dt;
          if (Math.abs(dx) < 160) b.vy -= 2600 * dt;
          if (Math.hypot(dx, b.y - h.y) < 90) {
            b.alive = false;
            g.draw.particles.burst(h.x, h.y, 6, 'spark', 160);
          }
        }
        if (h.t >= 4 + 1.2 * I) {
          h.st = 0;
          h.next = Math.max(4, 8 - 2 * g.heat) / this.rate();
        }
      }
    }
    // ---- discos voadores (abdução) ----
    for (const u of this.ufos) {
      if (!u.on) continue;
      u.t -= dt * g.kOf('abducao', k);
      if (u.st === 0) {
        // segue alguém (com inércia); quando chega perto, avisa
        let tx = w.W / 2;
        const p = g.players[Math.max(0, (g.players.findIndex((q) => q.alive) + Math.floor(g.time / 6)) % g.players.length)];
        const tg = this.ufoTarget(u) ?? (p && p.alive ? p : null);
        if (tg) tx = tg.x + tg.vx * 0.6;
        const want = Math.max(-1, Math.min(1, (tx - u.x) / 120)) * (95 + 35 * I) * (this.tn?.turbo ? 1.2 : 1);
        u.vx += (want - u.vx) * Math.min(1, dt * 2);
        u.x += u.vx * dt;
        if (u.t <= 0 && Math.abs(tx - u.x) < 140) {
          u.st = 1;
          u.t = 0.95 * g.tele;
          u.bx = Math.max(40, Math.min(w.W - 40, tx));
          if (Math.abs(u.x - g.me.x) < 700) audio.siren(0.8);
        }
      } else if (u.st === 1) {
        // desliza até o círculo marcado no chão (o círculo não anda)
        u.vx = (u.bx - u.x) * 3;
        u.x += u.vx * dt;
        if (u.t <= 0) {
          u.st = 2;
          u.t = 2 + 0.4 * I;
        }
      } else {
        // raio ligado: alarga e persegue devagar quem está sem teto embaixo
        const tg = this.ufoTarget(u);
        if (tg && !this.roofed(tg, 600)) u.bx += Math.max(-1, Math.min(1, (tg.x - u.bx) / 60)) * (185 + 50 * I) * dt;
        // o raio trator leva telhados, plataformas e copas que estiverem embaixo (o abrigo não dura)
        for (let i = 0; i < w.houses.length; i++) {
          const hs = w.houses[i];
          if (hs.ripped || Math.abs(hs.x + hs.w / 2 - u.bx) > u.r) continue;
          this.roofT[i] = (this.roofT[i] ?? 0) + dt;
          if (this.roofT[i] > 1.5) g.ripRoof(i, 0);
        }
        for (const so of w.solids) if (so.oneWay && !so.gone && !(so.crumble ?? 0) && Math.abs(so.x + so.w / 2 - u.bx) < u.r * 0.8 && g.rng() < dt * 1.2) so.crumble = 0.6;
        u.x += (u.bx - u.x) * Math.min(1, dt * 3);
        if (u.t <= 0) {
          u.st = 0;
          u.t = (2.1 - 0.7 * g.heat) / this.rate();
        }
      }
    }
    if (A.has('abducao') && !this.ufos[2].on && this.ufos[1].on && g.heat > 0.55 && I >= 0.95 && !this.tn?.mini) {
      const u = this.ufos[2];
      u.on = true;
      u.x = w.W / 2;
      u.y = -490;
      u.st = 0;
      u.t = 2;
      u.vx = 0;
      u.r = 90 * this.size();
    }
    if (A.has('abducao') && !this.ufos[1].on && g.heat > 0.22 && !this.tn?.mini && !this.sec('abducao')) {
      const u = this.ufos[1];
      u.on = true;
      u.x = g.me.x < w.W / 2 ? w.W + 200 : -200;
      u.y = -470;
      u.st = 0;
      u.t = 2;
      u.vx = 0;
      u.r = 90 * this.size();
      g.alert('abducao', u.x < 0 ? -1 : 1, 1.6, t('dz.al.ufo2', 'Outro disco voador!'));
    }
    // ---- lasers ----
    if (A.has('laser')) {
      g.tick(
        'laser',
        dt * g.kOf('laser', k),
        () => {
          const l = this.lasers.find((o) => !o.on);
          const p = g.pickTarget();
          if (!l || !p) return;
          const surf = p.onGround ? p.y : w.topAt(p.x);
          l.on = true;
          l.high = g.rng() < 0.38;
          l.y = l.high ? surf - 46 : surf - 11;
          l.dir = g.rng() < 0.5 ? 1 : -1;
          l.front = l.dir > 0 ? -60 : w.W + 60;
          l.warn = 1.3 * g.tele;
          l.stop = 0;
          l.life = 0;
          if (Math.abs(p.x - g.me.x) < 600) audio.siren(0.5);
        },
        (2.2 - 0.8 * g.heat) / this.rate(),
      );
    }
    for (const l of this.lasers) {
      if (!l.on) continue;
      if (l.warn > 0) {
        l.warn -= dt;
        continue;
      }
      l.life += dt;
      if (l.stop) {
        // a parede da casa segura o laser: a luz some rapidinho
      } else {
        const v = (540 + 90 * I) * (this.tn?.turbo ? 1.15 : 1);
        l.front += l.dir * v * dt;
        if (g.blockedByHouse(l.front, l.y)) {
          l.stop = l.life + 0.001;
          g.draw.particles.burst(l.front, l.y, 6, 'spark', 160);
        }
      }
      if ((l.dir > 0 && l.front > w.W + 300) || (l.dir < 0 && l.front < -300) || (l.stop && l.life - l.stop > 0.12) || l.life > 4) l.on = false;
    }
    // ---- pisão do gigante ----
    if (A.has('pisao')) {
      g.tick(
        'pisao',
        dt * g.kOf('pisao', k),
        () => {
          const s = this.stomps.find((o) => !o.on);
          const p = g.pickTarget();
          if (!s) return;
          s.on = true;
          s.r = (92 + 10 * I) * this.size();
          s.x = p ? p.x + p.vx * 1.2 + (g.rng() - 0.5) * s.r : 100 + g.rng() * (w.W - 200);
          s.x = Math.max(40, Math.min(w.W - 40, s.x));
          s.T = s.t = 1.9 * g.tele * (this.tn?.giant ? 1.15 : 1);
          s.ring = -1;
          s.max = (360 + 80 * I) * Math.sqrt(this.size());
          s.lift = p ? g.players.indexOf(p) : -1;
        },
        (3.1 - 1.0 * g.heat) / this.rate(),
      );
    }
    for (const s of this.stomps) {
      if (!s.on) continue;
      if (s.t > 0) {
        // a sombra persegue o alvo no começo do aviso e depois trava (o pé vai descer ali)
        if (s.t > s.T * 0.45 && s.lift >= 0) {
          const p = g.players[Math.round(s.lift)] ?? null;
          if (p && p.alive) s.x += Math.max(-1, Math.min(1, (p.x - s.x) / 40)) * (150 + 40 * I) * dt;
        }
        s.t -= dt;
        if (s.t <= 0) {
          s.lift = 0;
          this.stompHit(s);
        }
        continue;
      }
      s.lift += dt;
      if (s.ring >= 0) {
        s.ring += 680 * dt;
        if (s.ring > s.max) s.ring = s.max + 1;
      }
      if (s.lift > 1.3) s.on = false;
    }
    // ---- onda de calor ----
    if (A.has('calor')) {
      // casa cheia no solão fica abafada (deixa de proteger por um tempo); copas murcham
      for (let i = 0; i < w.houses.length; i++) {
        const hs = w.houses[i];
        if (this.stuffy[i] < 0) {
          this.stuffy[i] += dt;
          if (this.stuffy[i] >= 0) this.stuffy[i] = 0;
          continue;
        }
        let occ = 0;
        for (const p of g.players) if (p.alive && p.x > hs.x && p.x < hs.x + hs.w && p.y > hs.top - 4 && p.y <= 2) occ++;
        if (occ && this.sun.st === 2) this.stuffy[i] += dt * (0.6 + 0.25 * occ) * I;
        if (this.stuffy[i] > 5) {
          this.stuffy[i] = -(5 + 2 * I);
          if (g.me.alive && g.me.x > hs.x && g.me.x < hs.x + hs.w && g.me.y > hs.top) g.hud.toast(t('dz.al.stuffy', 'A casa ficou abafada! Procure outra sombra.'), 'dz-alert');
        }
      }
      if (this.sun.st === 2)
        for (const tr of w.trees) {
          const so = w.solids[tr.solid];
          if (so && !so.gone && !(so.crumble ?? 0) && g.rng() < dt * 0.05 * I) so.crumble = 1.6 * g.tele;
        }
      const S = this.sun;
      S.t += dt;
      S.k += ((S.st === 2 ? 1 : 0.25) - S.k) * Math.min(1, dt * 1.5);
      if (S.st === 0) {
        S.next -= dt * g.kOf('calor', k);
        if (S.next <= 2 * g.tele) {
          S.st = 1;
          S.t = 0;
          g.alert('calor', 2, 2 * g.tele, t('dz.al.sun', 'Sol fortíssimo! Corra para a sombra!'));
        }
      } else if (S.st === 1 && S.t >= 2 * g.tele) {
        S.st = 2;
        S.t = 0;
      } else if (S.st === 2 && S.t >= 3.6 + 0.8 * I) {
        S.st = 0;
        S.next = Math.max(3.5, 7.5 - 2.5 * g.heat) / this.rate();
      }
    }
    // ---- incêndio ----
    const F = this.fire;
    if (A.has('incendio')) {
      if (F.a > -1e8) F.a += F.va * dt;
      if (F.b < 1e8) F.b -= F.vb * dt;
      if (F.bOn && g.phaseT >= F.bAt) {
        F.bOn = false;
        const v = F.va || F.vb;
        if (F.a < -1e8) {
          F.a = -200;
          F.va = v * 1.1;
        } else {
          F.b = w.W + 200;
          F.vb = v * 1.1;
        }
        g.alert('incendio', F.a === -200 ? -1 : 1, 2, t('dz.al.fire2', 'Fogo do outro lado também!'));
      }
      // árvores e plataformas de madeira pegam fogo e caem
      for (let i = 0; i < w.trees.length; i++) {
        const tr = w.trees[i];
        const s = w.solids[tr.solid];
        if (!s || s.gone || (s.crumble ?? 0) > 0) continue;
        if (this.burningAt(tr.x)) s.crumble = 2.6 * g.tele;
      }
      for (const b of w.bodies) {
        if (!b.alive || b.awake || b.heavy || b.y + b.h < -6) continue;
        if (this.burningAt(b.x + b.w / 2) && g.rng() < dt * 0.8) {
          w.push(b, (g.rng() - 0.5) * 120, -120);
        }
      }
      // fogo embaixo de uma casa: o telhado pega fogo por uns segundos
      for (let i = 0; i < w.houses.length; i++) {
        const hs = w.houses[i];
        const cx = hs.x + hs.w / 2;
        if (!this.burningAt(cx)) continue;
        this.roofT[i] = (this.roofT[i] ?? 0) + dt;
        if (this.roofT[i] > 2.2 && this.roofT[i] < 2.2 + dt * 1.5) {
          const fi = g.fires.find((o) => !o.on) ?? g.fires[0];
          fi.on = true;
          fi.x = cx;
          fi.y = w.topAt(cx);
          fi.r = hs.w * 0.45;
          fi.t = 4 + I;
        }
      }
      // fumaça e fagulhas
      if (g.rng() < dt * 30 * g.q.particleBudget) {
        const fx = F.a > -1e8 && (F.b > 1e8 || g.rng() < 0.5) ? F.a - g.rng() * F.band : F.b + g.rng() * F.band;
        g.draw.particles.spray(fx, -8, 1, g.rng() < 0.7 ? 'fire' : 'dust', 0, -160 - g.rng() * 100, 0.5);
      }
      g.tick(
        'ember',
        dt * g.kOf('incendio', k),
        () => {
          const p = g.pickTarget();
          if (!p) return;
          const near = (F.a > -1e8 && Math.abs(p.x - F.a) < 560) || (F.b < 1e8 && Math.abs(p.x - F.b) < 560);
          if (!near) return;
          // brasas voando caem em quem espera no alto perto do fogo
          let hi: Player | null = null;
          for (const q of g.players) if (q.alive && q.y < -40 && ((F.a > -1e8 && Math.abs(q.x - F.a) < 400) || (F.b < 1e8 && Math.abs(q.x - F.b) < 400)) && (!hi || q.idle > hi.idle)) hi = q;
          if (hi && g.rng() < 0.5) g.spawnStrike('bomb', 1.45 * g.tele, 22, hi.x + (g.rng() - 0.5) * 20);
          else g.spawnAimed('bomb', 1.5 * g.tele, 20, 0.7);
        },
        (3.0 - 0.8 * g.heat) / this.rate(),
      );
    }
    // ---- nevasca ----
    if (A.has('nevasca')) {
      const C = this.cold;
      C.t += dt;
      if (C.st === 0) {
        C.next -= dt * g.kOf('nevasca', k);
        if (C.next <= 1.8 * g.tele) {
          C.st = 1;
          C.t = 0;
          if (!g.wind) g.wind = g.rng() < 0.5 ? -60 : 60;
          g.alert('nevasca', g.wind > 0 ? -1 : 1, 1.8 * g.tele, t('dz.al.cold', 'Rajada gelada! Fique perto do fogo!'));
        }
      } else if (C.st === 1 && C.t >= 1.8 * g.tele) {
        C.st = 2;
        C.t = 0;
        // a rajada apaga uma fogueira
        const on = this.camps.filter((c) => c.on);
        if (on.length > 1) on[Math.floor(g.rng() * on.length)].t = Math.min(on[0].t, 0.8);
      } else if (C.st === 2 && C.t >= 3 + I) {
        C.st = 0;
        C.next = Math.max(5, 9 - 2 * g.heat) / this.rate();
        g.wind = -g.wind;
      }
      g.tick(
        'camp',
        dt * k,
        () => {
          const c = this.camps.find((o) => !o.on);
          if (!c || this.camps.filter((o) => o.on).length >= 2) return;
          c.on = true;
          // nasce longe de quem está mais frio (precisa correr até lá)
          let x = 80 + g.rng() * (w.W - 160);
          for (let i = 0; i < 6 && w.topAt(x) < GROUND_Y - 2; i++) x = 80 + g.rng() * (w.W - 160);
          c.x = x;
          c.t = (9 + 3 * g.rng()) * (g.training ? 1.4 : 1);
          if (Math.abs(x - g.me.x) < 900) g.hud.toast(t('dz.al.camp', 'Uma fogueira acendeu! Vá se esquentar.'), 'dz-camp');
        },
        5.8 / this.rate(),
      );
    }
    for (const c of this.camps) {
      if (!c.on) continue;
      c.t -= dt;
      if (c.t <= 0) c.on = false;
      else if (g.rng() < dt * 10 * g.q.particleBudget) g.draw.particles.spray(c.x + (g.rng() - 0.5) * 20, -6, 1, 'fire', 0, -110, 0.4);
    }
    // ---- gêiseres ----
    if (A.has('geiser') && this.vents.length) {
      g.tick(
        'geiser',
        dt * g.kOf('geiser', k),
        () => {
          // prefere o gêiser mais perto de alguém (golpe "mirado"), às vezes um novo no pé de quem para
          const p = g.pickTarget();
          let best: Vent | null = null;
          let bd = 1e9;
          for (const v of this.vents) {
            if (v.warn > 0 || v.erupt > 0 || v.cd > 0) continue;
            const d = p ? Math.abs(v.x - p.x) + g.rng() * 200 : g.rng() * 1000;
            if (d < bd) {
              bd = d;
              best = v;
            }
          }
          if (p && p.idle > 2.5 && g.rng() < 0.4 && this.vents.length < 14) {
            best = { x: Math.max(40, Math.min(w.W - 40, p.x + (g.rng() - 0.5) * 30)), warn: 0, erupt: 0, cd: 0 };
            this.vents.push(best);
          }
          if (!best) return;
          best.warn = 1.7 * g.tele;
          if (Math.abs(best.x - g.me.x) < 500) audio.crack();
        },
        (2.0 - 0.7 * g.heat) / this.rate(),
      );
    }
    for (const v of this.vents) {
      if (v.cd > 0) v.cd -= dt;
      if (v.warn > 0) {
        v.warn -= dt;
        if (g.rng() < dt * 14 * g.q.particleBudget) g.draw.particles.spray(v.x + (g.rng() - 0.5) * 30, -4, 1, 'puff', 0, -60, 0.6);
        if (v.warn <= 0) {
          v.erupt = 1.5 + 0.3 * g.I;
          if (Math.abs(v.x - g.me.x) < 500) {
            audio.hit();
            tap('medium');
          }
          for (const b of w.bodies) if (b.alive && !b.heavy && Math.abs(b.x + b.w / 2 - v.x) < 30 + b.w / 2) w.push(b, (g.rng() - 0.5) * 120, -420);
          g.splash(v.x, 30, 500);
        }
      } else if (v.erupt > 0) {
        v.erupt -= dt;
        if (g.rng() < dt * 40 * g.q.particleBudget) g.draw.particles.spray(v.x + (g.rng() - 0.5) * 16, -40 - g.rng() * 380, 1, 'spray', (g.rng() - 0.5) * 120, -80, 0.8);
        if (v.erupt <= 0) v.cd = 2.5;
      }
    }
    // ---- fantasminhas ----
    for (const o of this.ghosts) {
      if (!o.on) continue;
      if (o.fade > 0) {
        o.fade -= dt;
        continue;
      }
      o.t -= dt;
      if (o.t <= 0 || o.tgt < 0 || !g.players[o.tgt]?.alive || this.houseSafe(g.players[o.tgt])) {
        o.t = 3 + g.rng() * 2;
        o.tgt = this.nearest(o.x, o.y, true);
      }
      const p = o.tgt >= 0 ? g.players[o.tgt] : null;
      let tx = o.x + Math.sin(g.time * 0.7 + o.r) * 80;
      let ty = -140 + Math.sin(g.time * 1.1 + o.x) * 40;
      if (p) {
        tx = p.x;
        ty = p.y - 14;
      } else {
        // todo mundo escondido: vai assombrar a casa mais perto
        const hi = this.nearestHouse(o.x);
        if (hi >= 0) {
          const hh = w.houses[hi];
          tx = hh.x + hh.w / 2;
          ty = hh.top - 30;
          if (Math.abs(o.x - tx) < 40 && (this.haunt[hi] ?? 0) <= 0 && g.rng() < dt * 0.2) {
            this.haunt[hi] = 5 + I;
            if (Math.abs(tx - g.me.x) < 600) g.hud.toast(t('dz.al.haunt', 'A casa foi assombrada! Saia correndo!'), 'dz-haunt');
          }
        }
      }
      if (o.dash <= 0 && p && g.rng() < dt * 0.08 * I) o.dash = -1 * g.tele;
      if (o.dash < 0) {
        o.dash += dt;
        if (o.dash >= 0) o.dash = 1;
      } else if (o.dash > 0) o.dash = Math.max(0, o.dash - dt);
      const sp = (48 + 11 * I + 16 * g.heat) * (this.sec('fantasma') ? 0.8 : 1) * (o.dash > 0 ? 1.8 : o.dash < 0 ? 0.2 : 1) * (this.tn?.giant ? 0.8 : 1) * (this.tn?.turbo ? 1.15 : 1);
      const dx = tx - o.x;
      const dy = ty - o.y;
      const d = Math.hypot(dx, dy) || 1;
      o.vx += ((dx / d) * sp - o.vx) * Math.min(1, dt * 2.2);
      o.vy += ((dy / d) * sp - o.vy) * Math.min(1, dt * 2.2);
      o.x += o.vx * dt;
      o.y += o.vy * dt;
    }
    // ---- abelhas ----
    if (A.has('abelhas') && g.timers.swarm2 !== undefined) {
      g.timers.swarm2 -= dt;
      if (g.timers.swarm2 <= 0) {
        g.timers.swarm2 = 1e9;
        if ((I >= 1.05 || this.tn?.turbo) && !this.tn?.giant) {
          const o = this.swarms.find((s) => !s.on);
          if (o) {
            this.spawnSwarm(o, 1);
            g.alert('abelhas', o.x < 0 ? -1 : 1, 1.6, t('dz.al.bees2', 'Mais abelhas!'));
          }
        }
      }
    }
    for (const o of this.swarms) {
      if (!o.on) continue;
      o.t -= dt;
      const cur = o.tgt >= 0 ? g.players[o.tgt] : null;
      const hidden = cur && (g.world.insideHouse(cur.x, cur.y) || (cur.swim && cur.y - 20 > g.surfaceAt(cur.x)));
      if (hidden) o.bored += dt;
      if (o.t <= 0 || !cur || !cur.alive || o.bored > 1.6) {
        o.t = 5 + g.rng() * 2;
        o.bored = 0;
        o.tgt = this.nearest(o.x, o.y, false);
      }
      const p = o.tgt >= 0 ? g.players[o.tgt] : null;
      if (o.angry <= 0 && p && g.rng() < dt * 0.15 * I) o.angry = -0.8 * g.tele;
      if (o.angry < 0) {
        o.angry += dt;
        if (o.angry >= 0) o.angry = 0.9;
      } else if (o.angry > 0) o.angry = Math.max(0, o.angry - dt);
      const tx = p && !hidden ? p.x : o.x + Math.sin(g.time) * 60;
      const ty = p && !hidden ? p.y - 14 : -160;
      const sp = 150 * (this.sec('abelhas') ? 0.82 : 1) * (0.92 + 0.12 * I + 0.15 * g.heat) * (o.angry > 0 ? 1.6 : o.angry < 0 ? 0.25 : 1) * (this.tn?.giant ? 0.85 : this.tn?.mini ? 1.05 : 1) * (this.tn?.turbo ? 1.15 : 1);
      const dx = tx - o.x;
      const dy = ty - o.y;
      const d = Math.hypot(dx, dy) || 1;
      o.vx += ((dx / d) * sp - o.vx) * Math.min(1, dt * 3);
      o.vy += ((dy / d) * sp - o.vy) * Math.min(1, dt * 3);
      o.x += o.vx * dt;
      o.y += o.vy * dt;
    }
    // ---- bolas rolando ----
    if (A.has('bolas')) {
      g.tick(
        'bolas',
        dt * g.kOf('bolas', k),
        () => {
          const side = (this.ballSide = g.rng() < 0.65 ? -this.ballSide : this.ballSide);
          // metade vem das pontas; a outra metade cai do céu perto de alguém e sai rolando
          const p = g.rng() < 0.5 ? g.pickTarget() : null;
          const sx = p ? Math.max(30, Math.min(w.W - 30, p.x - side * (160 + g.rng() * 160))) : side > 0 ? -40 : w.W + 40;
          const s = g.spawnStrike('ball', 1.4 * g.tele, (24 + 2 * I) * this.size(), sx);
          if (!s) return;
          s.vx = side * (250 + 60 * I) * (this.tn?.speed ?? 1) * (this.tn?.turbo ? 1.15 : 1);
          s.ty = GROUND_Y - s.r;
        },
        (2.9 - 0.8 * g.heat) / this.rate(),
      );
    }
  }

  private ufoTarget(u: Ufo): Player | null {
    const g = this.g;
    let best: Player | null = null;
    let bs = -1e9;
    for (const p of g.players) {
      if (!p.alive || p.safe) continue;
      const s = -Math.abs(p.x - u.x) * 0.5 + p.idle * 120 + (this.roofed(p, 600) ? -120 : 0);
      if (s > bs) {
        bs = s;
        best = p;
      }
    }
    return best;
  }

  private nearest(x: number, y: number, ghosts: boolean): number {
    const g = this.g;
    let best = -1;
    let bd = 1e9;
    for (let i = 0; i < g.players.length; i++) {
      const p = g.players[i];
      if (!p.alive || p.safe) continue;
      if (ghosts ? this.houseSafe(p) : g.world.insideHouse(p.x, p.y)) continue;
      const d = Math.hypot(p.x - x, p.y - y) - p.idle * 40;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }
  private nearestHouse(x: number): number {
    const w = this.g.world;
    let best = -1;
    let bd = 1e9;
    for (let i = 0; i < w.houses.length; i++) {
      const h = w.houses[i];
      if (h.ripped || (this.haunt[i] ?? 0) > 0) continue;
      const d = Math.abs(h.x + h.w / 2 - x);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  private stompHit(s: Stomp): void {
    const g = this.g;
    const w = g.world;
    s.ring = s.r * 0.6;
    this.thump = 1;
    if (g.q.shake) g.shake = Math.max(g.shake, 0.9);
    if (Math.abs(s.x - g.me.x) < 700) {
      audio.hit();
      tap('heavy');
    }
    g.draw.particles.burst(s.x - s.r * 0.6, -6, 10, 'dust', 300);
    g.draw.particles.burst(s.x + s.r * 0.6, -6, 10, 'dust', 300);
    // amassa o que está embaixo do pé
    for (const b of w.bodies) {
      if (!b.alive) continue;
      const dx = b.x + b.w / 2 - s.x;
      if (Math.abs(dx) < s.r * 0.9 + b.w / 2) {
        w.push(b, Math.sign(dx || 1) * 220, -80);
        if (b.y + b.h > -400) b.va += (g.rng() - 0.5) * 4;
      } else if (Math.abs(dx) < s.r * 2) w.push(b, Math.sign(dx) * 90, -140);
    }
    for (const p of g.players) {
      if (!p.alive || p.shield > 0 || p.safe) continue;
      if (Math.abs(p.x - s.x) < s.r * 0.82) g.knockOut(p, Math.sign(p.x - s.x), 'stomp');
    }
  }

  /* ------------------------------ bots ------------------------------ */

  /** perigos que este módulo ajuda a planejar */
  handles(d: DisasterId | null): boolean {
    return d === 'gravidade' || d === 'buraco' || d === 'abducao' || d === 'laser' || d === 'pisao' || d === 'calor' || d === 'incendio' || d === 'nevasca' || d === 'geiser' || d === 'fantasma' || d === 'abelhas' || d === 'bolas';
  }

  /** lugar coberto mais perto no chão (casa, embaixo de plataforma, copa, laje) */
  private coverX(p: Player, skill: number, roofOnly = false): number | null {
    const g = this.g;
    const w = g.world;
    let best: number | null = null;
    let bd = 1e9;
    const tryX = (x: number, bonus: number) => {
      if (x < 20 || x > w.W - 20) return;
      if (w.inHole(x)) return;
      const d = Math.abs(x - p.x) - bonus + g.rng() * 120 * (1.2 - skill);
      if (d < bd) {
        bd = d;
        best = x;
      }
    };
    for (let i = 0; i < w.houses.length; i++) {
      const h = w.houses[i];
      if (!h.ripped && (this.haunt[i] ?? 0) <= 0 && w.insideHouse(h.x + h.w / 2, -2)) tryX(h.x + h.w * 0.5, 60);
    }
    const sl = this.g.active.has('calor') ? this.sunSlope() : 0;
    if (!roofOnly)
      for (const s of w.solids) if ((s.kind === 'plat' || s.kind === 'leaf') && !s.gone && !(s.crumble ?? 0) && s.y > -330) tryX(s.x + s.w / 2 + sl * (s.y + s.h), 0);
    return best;
  }

  /** decide alvo do bot para os motores novos; true = decidido */
  plan(p: Player, d: DisasterId): boolean {
    const g = this.g;
    const b = p.bot!;
    const w = g.world;
    const sk = b.skill;
    const ground = () => {
      b.gy = GROUND_Y;
    };
    switch (d) {
      case 'gravidade':
      case 'calor':
      case 'abducao': {
        const urgent = d === 'gravidade' ? this.grav.st > 0 : d === 'calor' ? this.sun.st > 0 || p.meter > 0.5 : this.ufos.some((u) => u.on && u.st > 0 && Math.abs(u.x - p.x) < u.r + 90);
        if ((d === 'calor' ? this.shaded(p.x, p.y) || (this.houseAt(p) >= 0 && this.stuffy[this.houseAt(p)] >= 0) : this.roofed(p, 900)) && p.onGround) {
          b.gx = p.x;
          b.gy = p.y;
          return true;
        }
        if (urgent || g.rng() < sk * 0.6) {
          const x = this.coverX(p, sk, d !== 'calor');
          if (x !== null) {
            b.gx = x;
            ground();
            return true;
          }
        }
        b.gx = g.openX();
        ground();
        return true;
      }
      case 'nevasca': {
        let best: number | null = null;
        let bd = 1e9;
        for (const c of this.camps)
          if (c.on && c.t > 3 && Math.abs(c.x - p.x) < bd) {
            bd = Math.abs(c.x - p.x);
            best = c.x;
          }
        if (best === null || (p.meter < 0.3 && g.rng() < 0.5)) {
          for (const h of w.houses)
            if (!h.ripped && Math.abs(h.x + h.w / 2 - p.x) < bd * 0.8) {
              bd = Math.abs(h.x + h.w / 2 - p.x);
              best = h.x + h.w / 2;
            }
        }
        b.gx = (best ?? p.x) + (g.rng() - 0.5) * 30 * (1.3 - sk);
        ground();
        return true;
      }
      case 'buraco': {
        const h = this.hole;
        const inH = w.insideHouse(p.x, p.y);
        if (inH && h.st > 0) {
          b.gx = p.x;
          b.gy = p.y;
          return true;
        }
        // longe do meio: o lado mais longe do buraco, de preferência numa casa
        const side = p.x < h.x ? -1 : 1;
        let best = side < 0 ? 60 + g.rng() * 120 : w.W - 60 - g.rng() * 120;
        for (const hs of w.houses) {
          const cx = hs.x + hs.w / 2;
          if (!hs.ripped && Math.sign(cx - h.x) === side && Math.abs(cx - h.x) > 260 && Math.abs(cx - p.x) < Math.abs(best - p.x) + 200 * sk) best = cx;
        }
        b.gx = best;
        ground();
        return true;
      }
      case 'incendio': {
        const near = (this.fire.a > -1e8 && p.x > this.fire.a - this.fire.band - 40 && p.x < this.fire.a + 380) || (this.fire.b < 1e8 && p.x < this.fire.b + this.fire.band + 40 && p.x > this.fire.b - 380);
        if (this.ashAt(p.x) && !this.burningAt(p.x) && g.rng() < sk) {
          b.gx = p.x;
          ground();
          return true;
        }
        if (!near) {
          // espera longe do fogo: no chão já queimado, se tiver
          let x = p.x;
          for (let i = 0; i < 8; i++) {
            const c = 40 + g.rng() * (w.W - 80);
            if (this.ashAt(c) && !this.burningAt(c)) {
              x = c;
              break;
            }
          }
          b.gx = x;
          ground();
          return true;
        }
        return false; // fogo chegando: sobe (planejador padrão: alto)
      }
      case 'geiser':
      case 'pisao':
      case 'laser':
      case 'bolas':
      case 'fantasma':
      case 'abelhas': {
        if (d === 'bolas' && g.rng() < 0.5 + sk * 0.3) return false; // sobe (padrão)
        if (d === 'fantasma' || d === 'abelhas') {
          // longe do perseguidor; casa se estiver perto
          let tx = p.x;
          let ty = p.y;
          let close = 1e9;
          const src = d === 'fantasma' ? this.ghosts : this.swarms;
          for (const o of src)
            if (o.on && Math.hypot(o.x - p.x, o.y - p.y) < close) {
              close = Math.hypot(o.x - p.x, o.y - p.y);
              tx = o.x;
              ty = o.y;
            }
          void ty;
          if (close < 420) {
            const hx = this.coverHouse(p, tx);
            b.gx = hx ?? (p.x < tx ? Math.max(30, p.x - 360) : Math.min(w.W - 30, p.x + 360));
          } else if (Math.abs(b.gx - p.x) < 14 || g.rng() < 0.2) b.gx = g.openX();
          ground();
          return true;
        }
        if (Math.abs(b.gx - p.x) < 10 || g.rng() < 0.15 || w.topAt(b.gx) < GROUND_Y - 2) b.gx = sk > 0.5 ? g.openX() : 40 + g.rng() * (w.W - 80);
        ground();
        return true;
      }
      default:
        return false;
    }
  }

  private coverHouse(p: Player, from: number): number | null {
    const w = this.g.world;
    let best: number | null = null;
    let bd = 1e9;
    for (let i = 0; i < w.houses.length; i++) {
      const h = w.houses[i];
      const cx = h.x + h.w / 2;
      if (h.ripped || (this.haunt[i] ?? 0) > 0) continue;
      if (Math.sign(cx - p.x) === Math.sign(from - p.x) && Math.abs(from - p.x) < Math.abs(cx - p.x) + 40) continue; // não corre na direção do perseguidor
      const d = Math.abs(cx - p.x);
      if (d < bd && d < 520) {
        bd = d;
        best = cx;
      }
    }
    return best;
  }

  /** fuga imediata (−1/1) e pulo, por cima do plano */
  react(p: Player): { flee: number; jump: boolean; noJump: boolean } {
    const g = this.g;
    const sk = p.bot?.skill ?? 1;
    let flee = 0;
    let jump = false;
    for (const s of this.stomps) {
      if (!s.on) continue;
      if (s.t > 0 && Math.abs(p.x - s.x) < s.r + 20 && g.rng() < sk + 0.3) flee = p.x >= s.x ? 1 : -1;
      if (s.ring >= 0 && s.ring < s.max && p.onGround) {
        const d = Math.abs(p.x - s.x);
        if (d > s.ring && d - s.ring < 50 + 40 * sk && g.rng() < 0.4 + sk * 0.6) jump = true;
      }
    }
    for (const v of this.vents) if ((v.warn > 0 || v.erupt > 0) && Math.abs(p.x - v.x) < 50 && g.rng() < sk + 0.35) flee = p.x >= v.x ? 1 : -1;
    for (const o of this.ghosts) if (o.on && o.fade <= 0 && Math.hypot(o.x - p.x, o.y - p.y) < 130 && g.rng() < sk + 0.3) flee = p.x >= o.x ? 1 : -1;
    for (const o of this.swarms) if (o.on && Math.hypot(o.x - p.x, o.y - p.y) < 120 && g.rng() < sk + 0.2) flee = p.x >= o.x ? 1 : -1;
    for (const u of this.ufos) if (u.on && u.st > 0 && Math.abs(p.x - u.bx) < u.r + 30 && !this.roofed(p, 600) && g.rng() < sk + 0.2) flee = p.x >= u.bx ? 1 : -1;
    let noJump = false;
    for (const l of this.lasers) {
      if (!l.on) continue;
      const ahead = (p.x - l.front) * l.dir;
      // laser alto vindo: fica no chão (não pula nem sobe)
      if (l.high && ahead > -260 && l.y < p.y - 20 && l.y > p.y - 130 && g.rng() < 0.5 + sk * 0.5) noJump = true;
      if (l.warn > 0 || l.high || !p.onGround) continue;
      if (ahead > 0 && ahead < 40 + 80 * sk && Math.abs(p.y - 11 - l.y) < 20 && g.rng() < 0.45 + sk * 0.55) jump = true;
    }
    if (noJump) jump = false;
    const F = this.fire;
    if (p.y > -8 && g.active.has('incendio')) {
      if (F.a > -1e8 && p.x > F.a - F.band - 20 && p.x < F.a + 120 && g.rng() < sk + 0.2) flee = 1;
      if (F.b < 1e8 && p.x < F.b + F.band + 20 && p.x > F.b - 120 && g.rng() < sk + 0.2) flee = -1;
    }
    return { flee, jump, noJump };
  }

  /* ------------------------------ desenho (mundo) ------------------------------ */

  /** atrás dos jogadores: chão queimando, gêiseres, sombras do pé, linhas dos lasers, fogueiras */
  drawBack(x: CanvasRenderingContext2D, x0: number, x1: number, top: number): void {
    const g = this.g;
    const time = g.time;
    // incêndio: chão queimado + faixa de fogo
    const F = this.fire;
    if (F.a > -1e8 || F.b < 1e8) {
      x.fillStyle = 'rgba(40,24,20,.85)';
      if (F.a > -1e8 && F.a - F.band > x0) x.fillRect(Math.max(x0, -200), -4, Math.min(x1, F.a - F.band) - Math.max(x0, -200), 12);
      if (F.b < 1e8 && F.b + F.band < x1) x.fillRect(Math.max(x0, F.b + F.band), -4, x1 - Math.max(x0, F.b + F.band), 12);
      for (const [fx, dir] of [
        [F.a, -1],
        [F.b, 1],
      ] as const) {
        if (Math.abs(fx) > 1e8) continue;
        const a0 = dir < 0 ? fx - F.band : fx;
        const a1 = dir < 0 ? fx : fx + F.band;
        if (a1 < x0 || a0 > x1) continue;
        if (g.q.dynLights) {
          const gr = x.createRadialGradient((a0 + a1) / 2, -30, 10, (a0 + a1) / 2, -30, F.band * 1.4);
          gr.addColorStop(0, 'rgba(255,150,40,.45)');
          gr.addColorStop(1, 'rgba(255,90,20,0)');
          x.fillStyle = gr;
          x.fillRect(a0 - F.band, -F.band * 1.6, F.band * 3, F.band * 1.8);
        }
        const n = Math.ceil((a1 - a0) / 16);
        for (let i = 0; i < n; i++) {
          const fx2 = a0 + i * 16 + 8;
          const lead = dir < 0 ? (fx2 - a0) / F.band : (a1 - fx2) / F.band;
          const fh = (18 + 34 * lead) * (0.75 + 0.25 * Math.sin(time * 11 + i * 1.7));
          x.fillStyle = i % 3 ? '#ff7a1e' : '#ffb13a';
          x.beginPath();
          x.moveTo(fx2 - 10, 2);
          x.quadraticCurveTo(fx2 - 6, -fh * 0.5, fx2 + Math.sin(time * 9 + i) * 3, -fh);
          x.quadraticCurveTo(fx2 + 6, -fh * 0.5, fx2 + 10, 2);
          x.fill();
          x.fillStyle = '#ffe680';
          x.beginPath();
          x.moveTo(fx2 - 5, 2);
          x.quadraticCurveTo(fx2, -fh * 0.45, fx2 + 5, 2);
          x.fill();
        }
      }
    }
    // gêiseres: buraquinho, borbulhas no aviso
    for (const v of this.vents) {
      if (v.x < x0 - 40 || v.x > x1 + 40) continue;
      x.fillStyle = '#3a3040';
      x.beginPath();
      x.ellipse(v.x, 1, 16, 5, 0, 0, TAU);
      x.fill();
      x.fillStyle = 'rgba(160,230,255,.6)';
      x.beginPath();
      x.ellipse(v.x, 0, 10, 3, 0, 0, TAU);
      x.fill();
      if (v.warn > 0) {
        const a = 0.35 + 0.3 * Math.sin(time * 20);
        x.strokeStyle = `rgba(255,80,110,${a + 0.2})`;
        x.lineWidth = 3;
        x.beginPath();
        x.ellipse(v.x, 0, 28 * this.size(), 8, 0, 0, TAU);
        x.stroke();
        x.fillStyle = `rgba(160,230,255,${a})`;
        x.fillRect(v.x - 22 * this.size(), -520, 44 * this.size(), 520);
      }
    }
    // sombra do pé do gigante
    for (const s of this.stomps) {
      if (!s.on || s.t <= 0 || s.x < x0 - s.r || s.x > x1 + s.r) continue;
      const k = 1 - s.t / s.T;
      x.fillStyle = `rgba(30,10,40,${0.2 + 0.35 * k})`;
      x.beginPath();
      x.ellipse(s.x, -2, s.r * (0.5 + 0.5 * k), 10 + 6 * k, 0, 0, TAU);
      x.fill();
      x.strokeStyle = `rgba(255,51,85,${0.5 + 0.4 * Math.sin(time * 18)})`;
      x.lineWidth = 3;
      x.beginPath();
      x.ellipse(s.x, -2, s.r, 16, 0, 0, TAU);
      x.stroke();
    }
    // lasers: linha de aviso tracejada
    for (const l of this.lasers) {
      if (!l.on || l.warn <= 0) continue;
      const a = 0.45 + 0.35 * Math.sin(time * 22);
      x.strokeStyle = `rgba(255,79,216,${a})`;
      x.lineWidth = 3;
      x.setLineDash([14, 10]);
      x.beginPath();
      x.moveTo(x0, l.y);
      x.lineTo(x1, l.y);
      x.stroke();
      x.setLineDash([]);
    }
    // fogueiras
    for (const c of this.camps) {
      if (!c.on || c.x < x0 - 80 || c.x > x1 + 80) continue;
      if (g.q.dynLights) {
        const gr = x.createRadialGradient(c.x, -20, 4, c.x, -20, 110);
        gr.addColorStop(0, 'rgba(255,190,90,.5)');
        gr.addColorStop(1, 'rgba(255,140,60,0)');
        x.fillStyle = gr;
        x.fillRect(c.x - 110, -130, 220, 140);
      }
      x.fillStyle = '#6a3e1f';
      x.save();
      x.translate(c.x, -4);
      x.rotate(0.35);
      x.fillRect(-16, -3, 32, 6);
      x.rotate(-0.7);
      x.fillRect(-16, -3, 32, 6);
      x.restore();
      const fl = Math.min(1, c.t / 2);
      for (let i = 0; i < 3; i++) {
        const fh = (26 - i * 6) * fl * (0.85 + 0.15 * Math.sin(time * 13 + i));
        x.fillStyle = ['#ff6a1e', '#ffb13a', '#ffe680'][i];
        x.beginPath();
        x.moveTo(c.x - 11 + i * 3, -4);
        x.quadraticCurveTo(c.x - 6 + i * 2, -fh * 0.6, c.x, -6 - fh);
        x.quadraticCurveTo(c.x + 6 - i * 2, -fh * 0.6, c.x + 11 - i * 3, -4);
        x.fill();
      }
    }
    void top;
  }

  /** na frente dos jogadores: colunas d'água, discos voadores, lasers, pé, fantasmas, abelhas, buraco negro */
  drawFront(x: CanvasRenderingContext2D, x0: number, x1: number, top: number): void {
    const g = this.g;
    const time = g.time;
    // buraco negro
    const h = this.hole;
    if (h.on) {
      const pr = h.st === 2 ? 1 : h.st === 1 ? 0.6 : 0.35;
      const R0 = 70 + 30 * pr;
      if (g.q.glows) {
        const gr = x.createRadialGradient(h.x, h.y, R0 * 0.4, h.x, h.y, R0 * 3.2);
        gr.addColorStop(0, 'rgba(160,110,255,.6)');
        gr.addColorStop(0.5, 'rgba(90,40,200,.25)');
        gr.addColorStop(1, 'rgba(40,10,120,0)');
        x.fillStyle = gr;
        x.fillRect(h.x - R0 * 3.2, h.y - R0 * 3.2, R0 * 6.4, R0 * 6.4);
      }
      x.lineWidth = 6;
      for (let i = 0; i < 4; i++) {
        const a0 = time * (1.2 + pr) + i * 1.57;
        x.strokeStyle = i % 2 ? 'rgba(200,170,255,.8)' : 'rgba(255,180,240,.7)';
        x.beginPath();
        x.ellipse(h.x, h.y, R0 * (1.5 + i * 0.25), R0 * (0.45 + i * 0.08), Math.sin(time * 0.3) * 0.2, a0, a0 + 2.2);
        x.stroke();
      }
      x.fillStyle = '#05010f';
      x.beginPath();
      x.arc(h.x, h.y, R0 * 0.62, 0, TAU);
      x.fill();
      x.strokeStyle = '#ffd3ff';
      x.lineWidth = 3;
      x.beginPath();
      x.arc(h.x, h.y, R0 * 0.66, 0, TAU);
      x.stroke();
      // faixas de sucção
      if (h.st === 2) {
        x.strokeStyle = 'rgba(220,200,255,.35)';
        x.lineWidth = 2;
        for (let i = 0; i < 10; i++) {
          const ph = (time * 1.6 + i / 10) % 1;
          const sx2 = h.x + (i % 2 ? 1 : -1) * (500 * (1 - ph) + 60);
          x.beginPath();
          x.moveTo(sx2, -20 - i * 30 * (1 - ph));
          x.lineTo(sx2 + (h.x - sx2) * 0.2, -20 - i * 30 * (1 - ph) + (h.y + 20) * 0.2);
          x.stroke();
        }
      }
    }
    // colunas dos gêiseres
    for (const v of this.vents) {
      if (v.erupt <= 0 || v.x < x0 - 60 || v.x > x1 + 60) continue;
      const wd = 22 * this.size();
      const hgt = 520 * Math.min(1, (1.8 - v.erupt) * 5 + 0.2);
      const gr = x.createLinearGradient(v.x - wd, 0, v.x + wd, 0);
      gr.addColorStop(0, 'rgba(160,220,255,.35)');
      gr.addColorStop(0.5, 'rgba(240,252,255,.95)');
      gr.addColorStop(1, 'rgba(160,220,255,.35)');
      x.fillStyle = gr;
      x.beginPath();
      x.moveTo(v.x - wd * 0.8, 0);
      for (let yy = 0; yy <= hgt; yy += 40) x.lineTo(v.x - wd * (0.8 + 0.3 * Math.sin(time * 14 + yy * 0.05)), -yy);
      x.arc(v.x, -hgt, wd * 1.4, Math.PI, 0);
      for (let yy = hgt; yy >= 0; yy -= 40) x.lineTo(v.x + wd * (0.8 + 0.3 * Math.sin(time * 13 + yy * 0.05 + 1)), -yy);
      x.fill();
    }
    // pé do gigante descendo (tênis colorido)
    for (const s of this.stomps) {
      if (!s.on || s.x < x0 - s.r * 2 || s.x > x1 + s.r * 2) continue;
      const k = s.t > 0 ? 1 - s.t / s.T : 1;
      const lift = s.t > 0 ? 0 : Math.max(0, s.lift - 0.35) * 900;
      const fy = s.t > 0 ? top - 40 + (-8 - (top - 40)) * Math.pow(Math.max(0, (k - 0.55) / 0.45), 2) * (k > 0.55 ? 1 : 0) : -8 - lift;
      if (s.t > 0 && k < 0.55) continue;
      this.foot(x, s.x, fy, s.r, top);
      if (s.ring >= 0 && s.ring <= s.max) {
        const a = 1 - s.ring / s.max;
        x.strokeStyle = `rgba(255,236,200,${0.85 * a})`;
        x.lineWidth = 7;
        for (const sd of [-1, 1]) {
          x.beginPath();
          x.moveTo(s.x + sd * s.ring, -2);
          x.quadraticCurveTo(s.x + sd * (s.ring - 14), -26 * a, s.x + sd * (s.ring - 30), -2);
          x.stroke();
        }
      }
    }
    // lasers ativos
    for (const l of this.lasers) {
      if (!l.on || l.warn > 0) continue;
      const tail = l.front - l.dir * 120;
      const a0 = Math.min(tail, l.front);
      const a1 = Math.max(tail, l.front);
      if (a1 < x0 || a0 > x1) continue;
      x.strokeStyle = 'rgba(255,79,216,.45)';
      x.lineWidth = 12;
      x.beginPath();
      x.moveTo(a0, l.y);
      x.lineTo(a1, l.y);
      x.stroke();
      x.strokeStyle = '#ffe0fa';
      x.lineWidth = 3.5;
      x.beginPath();
      x.moveTo(a0, l.y);
      x.lineTo(a1, l.y);
      x.stroke();
      x.fillStyle = '#fff';
      x.beginPath();
      x.arc(l.front, l.y, 7, 0, TAU);
      x.fill();
    }
    // discos voadores + raio
    for (const u of this.ufos) {
      if (!u.on || u.x < x0 - 200 || u.x > x1 + 200) continue;
      const by = u.y + Math.sin(time * 2 + u.x * 0.01) * 8;
      if (u.st >= 1) {
        const strong = u.st === 2;
        const gr = x.createLinearGradient(0, by, 0, 10);
        gr.addColorStop(0, strong ? 'rgba(150,255,170,.75)' : 'rgba(150,255,170,.18)');
        gr.addColorStop(1, strong ? 'rgba(150,255,170,.35)' : 'rgba(150,255,170,.06)');
        x.fillStyle = gr;
        x.beginPath();
        x.moveTo(u.x - 24, by + 10);
        x.lineTo(u.bx - u.r, 6);
        x.lineTo(u.bx + u.r, 6);
        x.lineTo(u.x + 24, by + 10);
        x.fill();
        x.strokeStyle = strong ? '#c8ffd2' : `rgba(255,80,110,${0.5 + 0.4 * Math.sin(time * 18)})`;
        x.lineWidth = 3;
        x.beginPath();
        x.ellipse(u.bx, 0, u.r, 9, 0, 0, TAU);
        x.stroke();
        if (strong && g.rng() < 0.5 * g.q.particleBudget) g.draw.particles.spray(u.bx + (g.rng() - 0.5) * u.r * 1.6, -10, 1, 'spark', 0, -320, 0.3);
      }
      this.ufo(x, u.x, by, time);
    }
    // fantasminhas
    for (const o of this.ghosts) {
      if (!o.on || o.x < x0 - 60 || o.x > x1 + 60) continue;
      const a = o.fade > 0 ? Math.max(0, 1 - o.fade / 1.4) * 0.6 : 0.92;
      x.globalAlpha = a;
      this.ghostShape(x, o.x, o.y, o.r, time + o.r, o.dash < 0 ? 1 : 0, o.vx);
      x.globalAlpha = 1;
    }
    // abelhas
    for (const o of this.swarms) {
      if (!o.on || o.x < x0 - 80 || o.x > x1 + 80) continue;
      if (o.angry < 0 && g.q.glows) {
        x.fillStyle = `rgba(255,60,60,${0.2 + 0.15 * Math.sin(time * 20)})`;
        x.beginPath();
        x.arc(o.x, o.y, o.r * 1.4, 0, TAU);
        x.fill();
      }
      const n = Math.round(o.r * 0.45);
      for (let i = 0; i < n; i++) {
        const a = time * (3 + (i % 3)) + i * 2.4;
        const bx = o.x + Math.cos(a) * o.r * (0.3 + ((i * 37) % 10) / 14);
        const by = o.y + Math.sin(a * 1.3) * o.r * 0.6;
        this.bee(x, bx, by, Math.cos(a) > 0 ? 1 : -1, time * 40 + i);
      }
    }
  }

  private foot(x: CanvasRenderingContext2D, fx: number, fy: number, r: number, top: number): void {
    // perna de calça jeans + tênis de desenho (sola branca, bico arredondado, cadarços, listra)
    const ink = '#2a0b5c';
    const legW = r * 0.95;
    const ankle = fy - r * 0.62;
    x.fillStyle = ink;
    x.fillRect(fx - legW / 2 - 3, top - 80, legW + 6, ankle - (top - 80) + 4);
    const jg = x.createLinearGradient(fx - legW / 2, 0, fx + legW / 2, 0);
    jg.addColorStop(0, '#2f4a9a');
    jg.addColorStop(0.5, '#4a6ad0');
    jg.addColorStop(1, '#2a3e86');
    x.fillStyle = jg;
    x.fillRect(fx - legW / 2, top - 80, legW, ankle - (top - 80));
    x.strokeStyle = 'rgba(255,220,120,.6)';
    x.setLineDash([5, 4]);
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(fx - legW * 0.35, top - 80);
    x.lineTo(fx - legW * 0.35, ankle);
    x.stroke();
    x.setLineDash([]);
    x.fillStyle = '#26387a';
    x.fillRect(fx - legW / 2 - 4, ankle - 14, legW + 8, 14);
    // tênis
    const back = fx - r * 0.75;
    const toe = fx + r * 0.95;
    const h = r * 0.62;
    x.fillStyle = ink;
    x.beginPath();
    x.moveTo(back - 4, fy + 3);
    x.lineTo(back - 4, fy - h - 4);
    x.quadraticCurveTo(fx, fy - h - 10, fx + r * 0.35, fy - h * 0.62);
    x.quadraticCurveTo(toe + 6, fy - h * 0.55, toe + 6, fy - 4);
    x.lineTo(toe + 6, fy + 3);
    x.closePath();
    x.fill();
    x.fillStyle = '#ff4a5a';
    x.beginPath();
    x.moveTo(back, fy - 8);
    x.lineTo(back, fy - h);
    x.quadraticCurveTo(fx, fy - h - 6, fx + r * 0.35, fy - h * 0.6);
    x.quadraticCurveTo(toe, fy - h * 0.52, toe, fy - 8);
    x.closePath();
    x.fill();
    // bico branco + sola
    x.fillStyle = '#ffffff';
    x.beginPath();
    x.ellipse(toe - r * 0.28, fy - 10, r * 0.32, h * 0.22, 0, Math.PI, TAU);
    x.fill();
    x.fillRect(back, fy - 10, toe - back, 10);
    x.fillStyle = '#d8dce8';
    x.fillRect(back, fy - 3, toe - back, 3);
    // listra e cadarços
    x.strokeStyle = '#ffffff';
    x.lineWidth = r * 0.08;
    x.beginPath();
    x.moveTo(back + r * 0.25, fy - h * 0.25);
    x.quadraticCurveTo(fx, fy - h * 0.7, fx + r * 0.3, fy - h * 0.3);
    x.stroke();
    x.strokeStyle = '#ffe14d';
    x.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      x.beginPath();
      x.moveTo(fx - r * 0.12 + i * r * 0.14, fy - h * 0.92 + i * 4);
      x.lineTo(fx + r * 0.08 + i * r * 0.14, fy - h * 0.78 + i * 4);
      x.stroke();
    }
  }

  private ufo(x: CanvasRenderingContext2D, ux: number, uy: number, time: number): void {
    x.fillStyle = '#2a0b5c';
    x.beginPath();
    x.ellipse(ux, uy, 74, 22, 0, 0, TAU);
    x.fill();
    const gr = x.createLinearGradient(0, uy - 20, 0, uy + 20);
    gr.addColorStop(0, '#e8eef8');
    gr.addColorStop(1, '#8a96b8');
    x.fillStyle = gr;
    x.beginPath();
    x.ellipse(ux, uy, 70, 18, 0, 0, TAU);
    x.fill();
    x.fillStyle = 'rgba(140,240,255,.9)';
    x.beginPath();
    x.ellipse(ux, uy - 12, 32, 24, 0, Math.PI, TAU);
    x.fill();
    // alienzinho verde
    x.fillStyle = '#7dff9a';
    x.beginPath();
    x.arc(ux, uy - 18, 10, 0, TAU);
    x.fill();
    x.fillStyle = '#2a0b5c';
    x.beginPath();
    x.arc(ux - 4, uy - 20, 2.4, 0, TAU);
    x.arc(ux + 4, uy - 20, 2.4, 0, TAU);
    x.fill();
    for (let i = 0; i < 6; i++) {
      x.fillStyle = (i + Math.floor(time * 6)) % 2 ? '#ffe14d' : '#ff5aa5';
      x.beginPath();
      x.arc(ux - 50 + i * 20, uy + 4, 4, 0, TAU);
      x.fill();
    }
  }

  private ghostShape(x: CanvasRenderingContext2D, gx: number, gy: number, r: number, t2: number, red: number, vx: number): void {
    const wob = Math.sin(t2 * 3) * 3;
    x.fillStyle = 'rgba(42,11,92,.55)';
    x.beginPath();
    x.arc(gx, gy + wob, r + 2.5, Math.PI, 0);
    x.lineTo(gx + r + 2.5, gy + r * 1.1 + wob);
    x.lineTo(gx - r - 2.5, gy + r * 1.1 + wob);
    x.fill();
    x.fillStyle = red ? '#ffd6e0' : '#f4f6ff';
    x.beginPath();
    x.arc(gx, gy + wob, r, Math.PI, 0);
    const n = 4;
    for (let i = 0; i <= n; i++) {
      const px = gx + r - (i / n) * 2 * r;
      x.lineTo(px, gy + r + wob + (i % 2 ? 6 : 0) + Math.sin(t2 * 6 + i) * 2);
    }
    x.fill();
    const lk = Math.max(-1, Math.min(1, vx / 80)) * r * 0.15;
    x.fillStyle = red ? '#ff3355' : '#2a0b5c';
    x.beginPath();
    x.ellipse(gx - r * 0.32 + lk, gy - r * 0.15 + wob, r * 0.14, r * 0.22, 0, 0, TAU);
    x.ellipse(gx + r * 0.32 + lk, gy - r * 0.15 + wob, r * 0.14, r * 0.22, 0, 0, TAU);
    x.fill();
    x.fillStyle = '#ff9ad5';
    x.globalAlpha *= 0.7;
    x.beginPath();
    x.arc(gx - r * 0.55 + lk, gy + r * 0.18 + wob, r * 0.12, 0, TAU);
    x.arc(gx + r * 0.55 + lk, gy + r * 0.18 + wob, r * 0.12, 0, TAU);
    x.fill();
    x.globalAlpha /= 0.7;
  }

  private bee(x: CanvasRenderingContext2D, bx: number, by: number, f: number, ph: number): void {
    x.fillStyle = 'rgba(255,255,255,.75)';
    const wf = Math.sin(ph) * 2;
    x.beginPath();
    x.ellipse(bx - f, by - 4 - wf, 3, 4.5, -0.4 * f, 0, TAU);
    x.fill();
    x.fillStyle = '#2a0b5c';
    x.beginPath();
    x.ellipse(bx, by, 6, 4.6, 0, 0, TAU);
    x.fill();
    x.fillStyle = '#ffd23f';
    x.beginPath();
    x.ellipse(bx, by, 4.8, 3.4, 0, 0, TAU);
    x.fill();
    x.fillStyle = '#2a0b5c';
    x.fillRect(bx - 1, by - 3.4, 2, 6.8);
  }

  /** medidor de calor/frio em cima de cada Bloop */
  drawMeters(x: CanvasRenderingContext2D, x0: number, x1: number): void {
    const g = this.g;
    if (!g.active.has('calor') && !g.active.has('nevasca')) return;
    const hot = g.active.has('calor');
    for (const p of g.players) {
      if (!p.alive || p.meter < 0.05 || p.x < x0 || p.x > x1) continue;
      const bw = p.self ? 34 : 22;
      const by = p.y - R * 2 - (p.self ? 30 : 22) - (p.swim ? 10 : 0);
      x.fillStyle = 'rgba(30,15,60,.75)';
      roundRect(x, p.x - bw / 2 - 2, by - 2, bw + 4, 8, 4);
      x.fill();
      const blink = p.meter > 0.75 && Math.sin(g.time * 18) > 0;
      x.fillStyle = hot ? (blink ? '#ff3355' : '#ffb000') : blink ? '#ffffff' : '#7ad8ff';
      roundRect(x, p.x - bw / 2, by, bw * Math.min(1, p.meter), 4, 2);
      x.fill();
    }
  }

  /** tela: neblina, calor, frio, flutuar */
  drawScreen(x: CanvasRenderingContext2D, cw: number, ch: number, meX: number, meY: number, ps: number): void {
    const g = this.g;
    const fog = (this.tn?.fog || g.active.has('fantasma')) && g.phase !== 'intro';
    if (fog) {
      const r0 = 150 * ps;
      const r1 = Math.max(cw, ch) * 0.75;
      const gr = x.createRadialGradient(meX, meY, r0, meX, meY, r1);
      gr.addColorStop(0, 'rgba(200,210,240,0)');
      gr.addColorStop(0.45, 'rgba(170,180,215,.5)');
      gr.addColorStop(1, 'rgba(120,130,170,.82)');
      x.fillStyle = gr;
      x.fillRect(0, 0, cw, ch);
    }
    if (g.active.has('calor') && g.q.grade) {
      const k = this.sun.k;
      x.fillStyle = `rgba(255,170,40,${0.08 + 0.16 * k})`;
      x.fillRect(0, 0, cw, ch);
      const sx = cw * (0.5 - this.sunSlope() * 0.45);
      const gr = x.createRadialGradient(sx, ch * 0.08, 10, sx, ch * 0.08, ch * (0.6 + 0.4 * k));
      gr.addColorStop(0, `rgba(255,255,220,${0.55 + 0.4 * k})`);
      gr.addColorStop(1, 'rgba(255,220,120,0)');
      x.fillStyle = gr;
      x.fillRect(0, 0, cw, ch);
    }
    if (g.active.has('nevasca')) {
      x.fillStyle = `rgba(200,230,255,${this.cold.st === 2 ? 0.32 : 0.12})`;
      x.fillRect(0, 0, cw, ch);
    }
    if (this.grav.st === 2) {
      x.fillStyle = 'rgba(160,120,255,.12)';
      x.fillRect(0, 0, cw, ch);
    }
  }
}
