/* ============================================================
 *  MUNDO: geometria fixa (chão, plataformas, árvores) + corpos
 *  destrutíveis (paredes, lajes, telhados, torres, caixas) com uma
 *  física leve de caixas AABB, "tombar" animado e corpos dormindo.
 *  Coordenadas: chão em y = 0, para cima é negativo.
 * ============================================================ */
import { mulberry, type MapTheme, type Scenario } from './scenarios';

export type SolidKind = 'ground' | 'plat' | 'leaf' | 'bunker';
export interface Solid {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: SolidKind;
  oneWay: boolean;
}

export type BodyKind = 'wall' | 'slab' | 'roof' | 'block' | 'crate' | 'ladder' | 'cap';
export interface Body {
  id: number;
  x: number; // canto superior esquerdo
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  kind: BodyKind;
  color: string;
  color2: string;
  awake: boolean;
  still: number; // tempo parado (para dormir)
  /** tombando: -1/1 = direção, 0 = não */
  tip: number;
  tipT: number;
  ang: number; // rotação cosmética
  va: number;
  alive: boolean;
  /** próxima checagem de apoio (dormindo) */
  check: number;
  /** 0 = madeira/leve (flutua), 1 = pesado */
  heavy: number;
  wet: number;
}

export interface Ladder {
  /** corpo da escada (cai junto) ou -1 = fixa */
  body: number;
  x: number;
  top: number;
  bottom: number;
}

export interface House {
  x: number;
  w: number;
  top: number; // y da laje (teto interno)
  wallL: number;
  wallR: number;
  ceil: number;
}

export interface Tree {
  x: number;
  h: number;
  r: number;
  solid: number;
}

export interface Pickup {
  x: number;
  y: number;
  taken: boolean;
}

export const GROUND_Y = 0;
export const GRAV_BODY = 1500;

export class World {
  W = 1600;
  solids: Solid[] = [];
  bodies: Body[] = [];
  ladders: Ladder[] = [];
  houses: House[] = [];
  trees: Tree[] = [];
  pickups: Pickup[] = [];
  /** bunker do final (x inicial da porta) */
  bunker: { x: number; w: number; doorX: number; closed: number } | null = null;
  pits: { x: number; w: number }[] = [];
  spawnX = 120;
  map: MapTheme;
  maxBodies: number;
  /** wobble do terremoto aplicado ao desenho */
  awakeCount = 0;

  constructor(sc: Scenario, maxBodies: number) {
    this.map = sc.map;
    this.maxBodies = maxBodies;
    const r = mulberry(sc.seed);
    if (sc.disasters[0] === 'meteoro') this.genCourse(r, sc);
    else this.genArena(r, sc);
  }

  /* --------------------------- construção --------------------------- */

  private solid(x: number, y: number, w: number, h: number, kind: SolidKind, oneWay: boolean): number {
    this.solids.push({ x, y, w, h, kind, oneWay });
    return this.solids.length - 1;
  }

  private body(x: number, y: number, w: number, h: number, kind: BodyKind, color: string, color2 = color, heavy = 1): number {
    if (this.bodies.length >= this.maxBodies) return -1;
    const id = this.bodies.length;
    this.bodies.push({ id, x, y, w, h, vx: 0, vy: 0, kind, color, color2, awake: false, still: 0, tip: 0, tipT: 0, ang: 0, va: 0, alive: true, check: Math.random() * 0.3, heavy, wet: 0 });
    return id;
  }

  private house(r: () => number, x: number, floors: number): number {
    const m = this.map;
    const w = 100 + Math.floor(r() * 50);
    const wallH = 66 + Math.floor(r() * 16);
    const col = m.wall[Math.floor(r() * m.wall.length)];
    const roof = m.roof[Math.floor(r() * m.roof.length)];
    let base = GROUND_Y;
    let first = -1;
    for (let f = 0; f < floors; f++) {
      const wl = this.body(x, base - wallH, 12, wallH, 'wall', col);
      const wr = this.body(x + w - 12, base - wallH, 12, wallH, 'wall', col);
      const c = this.body(x - 6, base - wallH - 12, w + 12, 12, 'slab', shade(col, -0.25));
      if (f === 0 && wl >= 0 && wr >= 0 && c >= 0) {
        this.houses.push({ x, w, top: base - wallH, wallL: wl, wallR: wr, ceil: c });
        first = wl;
      }
      base -= wallH + 12;
    }
    this.body(x + 4, base - 34, w - 8, 34, 'roof', roof, shade(roof, -0.2));
    if (r() < 0.5) this.body(x + w * 0.5 - 13, base - 34 - 26, 26, 26, 'crate', '#c98a4a', '#8a5a2a', 0);
    return first >= 0 ? w : w;
  }

  private tower(r: () => number, x: number, segs: number): number {
    const w = 58;
    const h = 52;
    const col = this.map.wall[Math.floor(r() * this.map.wall.length)];
    for (let i = 0; i < segs; i++) this.body(x, GROUND_Y - h * (i + 1), w, h, 'block', i % 2 ? col : shade(col, -0.12));
    const top = GROUND_Y - h * segs;
    this.body(x - 8, top - 12, w + 16, 12, 'cap', shade(this.map.roof[0], -0.1));
    const lb = this.body(x + w + 2, top - 12, 16, -top + 12, 'ladder', '#c98a4a', '#8a5a2a', 0);
    this.ladders.push({ body: lb, x: x + w + 2, top: top - 12, bottom: GROUND_Y });
    return w + 20;
  }

  private tree(r: () => number, x: number): number {
    const h = 90 + Math.floor(r() * 70);
    const rr = 34 + Math.floor(r() * 12);
    const s = this.solid(x - rr * 0.9, -h - 4, rr * 1.8, 10, 'leaf', true);
    this.trees.push({ x, h, r: rr, solid: s });
    return rr * 2;
  }

  private genArena(r: () => number, sc: Scenario): void {
    const m = this.map;
    this.W = 1500 + sc.difficulty * 60;
    this.solid(-200, GROUND_Y, this.W + 400, 600, 'ground', false);
    this.spawnX = this.W * 0.5;
    const bag: string[] = [];
    for (let i = 0; i < m.houses; i++) bag.push('h');
    for (let i = 0; i < m.towers; i++) bag.push('t');
    for (let i = 0; i < m.trees; i++) bag.push('r');
    // embaralha
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const tmp = bag[i];
      bag[i] = bag[j];
      bag[j] = tmp;
    }
    let x = 70;
    const slot = (this.W - 140) / Math.max(1, bag.length);
    for (const k of bag) {
      const jitter = r() * slot * 0.25;
      if (k === 'h') this.house(r, x + jitter, r() < 0.35 ? 2 : 1);
      else if (k === 't') this.tower(r, x + jitter, 3 + Math.floor(r() * 3));
      else this.tree(r, x + jitter + 40);
      x += slot;
    }
    // plataformas flutuantes (andaimes/nuvens)
    for (let i = 0; i < m.floats; i++) {
      const fx = 80 + r() * (this.W - 240);
      const fy = -90 - r() * 150;
      this.solid(fx, fy, 70 + r() * 40, 10, 'plat', true);
    }
    // caixas soltas
    for (let i = 0; i < m.crates; i++) this.body(60 + r() * (this.W - 120), GROUND_Y - 26, 26, 26, 'crate', '#c98a4a', '#8a5a2a', 0);
    // power-up de pulo duplo
    this.pickups.push({ x: 100 + r() * (this.W - 200), y: -40, taken: false });
    if (sc.difficulty >= 3) this.pickups.push({ x: 100 + r() * (this.W - 200), y: -40, taken: false });
  }

  /** Percurso do Meteoro Gigante: largada à esquerda, buracos, plataformas e bunker à direita. */
  private genCourse(r: () => number, sc: Scenario): void {
    this.W = 2500 + sc.difficulty * 100;
    this.spawnX = 140;
    let x = -200;
    let gx = 420;
    const pits: { x: number; w: number }[] = [];
    while (gx < this.W - 520) {
      const w = 90 + Math.floor(r() * 50) + sc.difficulty * 6;
      pits.push({ x: gx, w });
      gx += w + 220 + Math.floor(r() * 160);
    }
    this.pits = pits;
    for (const p of pits) {
      this.solid(x, GROUND_Y, p.x - x, 600, 'ground', false);
      // fundo do buraco (lama macia) + escada de saída
      this.solid(p.x, GROUND_Y + 110, p.w, 490, 'ground', false);
      this.ladders.push({ body: -1, x: p.x + p.w - 20, top: GROUND_Y - 6, bottom: GROUND_Y + 110 });
      // pedras flutuantes por cima do buraco
      const n = p.w > 120 ? 2 : 1;
      for (let i = 0; i < n; i++) this.solid(p.x + (p.w / (n + 1)) * (i + 1) - 22, -40 - r() * 40, 44, 10, 'plat', true);
      x = p.x + p.w;
    }
    this.solid(x, GROUND_Y, this.W + 200 - x, 600, 'ground', false);
    // obstáculos: caixas e muretas entre os buracos
    let ox = 260;
    while (ox < this.W - 500) {
      if (!pits.some((p) => ox > p.x - 50 && ox < p.x + p.w + 50)) {
        if (r() < 0.5) {
          this.body(ox, GROUND_Y - 26, 26, 26, 'crate', '#c98a4a', '#8a5a2a', 0);
          if (r() < 0.5) this.body(ox, GROUND_Y - 52, 26, 26, 'crate', '#c98a4a', '#8a5a2a', 0);
        } else if (r() < 0.6) this.house(r, ox, 1);
        else this.tree(r, ox + 30);
      }
      ox += 170 + r() * 120;
    }
    this.pickups.push({ x: 300, y: -40, taken: false });
    // bunker
    const bx = this.W - 330;
    this.bunker = { x: bx, w: 230, doorX: bx + 30, closed: 0 };
    this.solid(bx, -96, 230, 16, 'bunker', false);
  }

  /* --------------------------- consultas --------------------------- */

  /** topo da superfície mais alta em x abaixo de fromY (para sombras/IA). */
  surfaceBelow(x: number, fromY: number): number {
    let best = 400;
    for (let i = 0; i < this.solids.length; i++) {
      const s = this.solids[i];
      if (x >= s.x && x <= s.x + s.w && s.y >= fromY && s.y < best) best = s.y;
    }
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      if (!b.alive || b.kind === 'ladder' || b.tip) continue;
      if (x >= b.x && x <= b.x + b.w && b.y >= fromY && b.y < best) best = b.y;
    }
    return best;
  }

  /** topo mais alto em x (qualquer altura) */
  topAt(x: number): number {
    return this.surfaceBelow(x, -2000);
  }

  isSheltered(px: number, py: number): boolean {
    for (const h of this.houses) {
      if (px < h.x + 8 || px > h.x + h.w - 8 || py < h.top || py > GROUND_Y + 2) continue;
      const a = this.bodies[h.wallL];
      const b = this.bodies[h.wallR];
      const c = this.bodies[h.ceil];
      if (a.awake || b.awake || c.awake || a.tip || b.tip) continue;
      if (Math.abs(c.y + c.h - h.top) > 6) continue;
      return true;
    }
    return false;
  }

  /* --------------------------- física --------------------------- */

  wake(b: Body): void {
    if (!b.alive) return;
    b.awake = true;
    b.still = 0;
  }

  /** começa a tombar se for alto e estiver em pé */
  push(b: Body, vx: number, vy: number): void {
    if (!b.alive) return;
    if (!b.awake && !b.tip && b.h > b.w * 1.5 && Math.abs(vx) > 60) {
      b.tip = vx > 0 ? 1 : -1;
      b.tipT = 0;
      return;
    }
    if (b.tip) return;
    this.wake(b);
    b.vx += vx;
    b.vy += vy;
    b.va += vx * 0.004 * (b.heavy ? 0.5 : 1.5);
  }

  step(dt: number, fluidAt: ((x: number) => number) | null, fluidPush: number, fluidFront: number): void {
    const bs = this.bodies;
    let awake = 0;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (!b.alive) continue;
      if (b.tip) {
        // tombar em volta do canto de baixo
        b.tipT += dt * (1.2 + b.tipT * 4);
        if (b.tipT >= 1) {
          const px = b.tip > 0 ? b.x + b.w : b.x;
          const py = b.y + b.h;
          const nw = b.h;
          const nh = b.w;
          b.w = nw;
          b.h = nh;
          b.x = b.tip > 0 ? px : px - nw;
          b.y = py - nh;
          b.vx = b.tip * 40;
          b.vy = 80;
          b.tip = 0;
          b.tipT = 0;
          this.wake(b);
        }
        awake++;
        continue;
      }
      if (!b.awake) {
        b.check -= dt;
        if (b.check <= 0) {
          b.check = 0.18 + Math.random() * 0.12;
          if (!this.supported(b)) this.wake(b);
        }
        if (fluidAt) {
          const s = fluidAt(b.x + b.w * 0.5);
          if (b.y + b.h > s + 4 && fluidPush !== 0 && Math.abs(b.x + b.w * 0.5 - fluidFront) < 160) this.push(b, fluidPush * 0.5, -40);
        }
        if (!b.awake) continue;
      }
      awake++;
      // fluido: empurra e faz flutuar
      let sub = 0;
      if (fluidAt) {
        const s = fluidAt(b.x + b.w * 0.5);
        if (b.y + b.h > s) {
          sub = Math.min(1, (b.y + b.h - s) / b.h);
          b.wet = 1;
        }
      }
      b.vy += GRAV_BODY * dt * (1 - sub * (b.heavy ? 0.85 : 1.5));
      if (sub > 0) {
        b.vx *= 1 - Math.min(1, 1.8 * dt);
        b.vy *= 1 - Math.min(1, 2.5 * dt);
        if (fluidPush !== 0 && Math.abs(b.x - fluidFront) < 260) b.vx += fluidPush * dt * 2.5;
      }
      if (b.vy > 900) b.vy = 900;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.ang += b.va * dt;
      b.va *= 1 - Math.min(1, 1.5 * dt);
      if (b.ang > 0.5) b.ang = 0.5;
      else if (b.ang < -0.5) b.ang = -0.5;
      if (b.x < -150) b.x = -150;
      if (b.x > this.W + 150) b.x = this.W + 150;
      this.collideStatic(b);
      for (let j = 0; j < bs.length; j++) if (j !== i) this.collideBodies(b, bs[j]);
      const sp = Math.abs(b.vx) + Math.abs(b.vy);
      if (sp < 20 && sub === 0) {
        b.still += dt;
        if (b.still > 0.4) {
          b.awake = false;
          b.vx = b.vy = 0;
          b.still = 0;
        }
      } else b.still = 0;
      if (b.y > 500) b.alive = false;
    }
    this.awakeCount = awake;
  }

  private supported(b: Body): boolean {
    const bottom = b.y + b.h;
    for (let i = 0; i < this.solids.length; i++) {
      const s = this.solids[i];
      if (Math.abs(s.y - bottom) < 3 && b.x + b.w > s.x + 2 && b.x < s.x + s.w - 2) return true;
    }
    for (let i = 0; i < this.bodies.length; i++) {
      const o = this.bodies[i];
      if (o === b || !o.alive || o.tip) continue;
      if (Math.abs(o.y - bottom) < 3) {
        const ov = Math.min(b.x + b.w, o.x + o.w) - Math.max(b.x, o.x);
        if (ov > Math.min(b.w, o.w) * 0.2) return true;
      }
    }
    return false;
  }

  private collideStatic(b: Body): void {
    for (let i = 0; i < this.solids.length; i++) {
      const s = this.solids[i];
      if (b.x + b.w <= s.x || b.x >= s.x + s.w || b.y + b.h <= s.y || b.y >= s.y + s.h) continue;
      if (s.oneWay) {
        if (b.vy >= 0 && b.y + b.h - b.vy * 0.02 <= s.y + 6) {
          b.y = s.y - b.h;
          this.land(b);
        }
        continue;
      }
      const dx1 = b.x + b.w - s.x;
      const dx2 = s.x + s.w - b.x;
      const dy1 = b.y + b.h - s.y;
      const dy2 = s.y + s.h - b.y;
      const mx = Math.min(dx1, dx2);
      const my = Math.min(dy1, dy2);
      if (my <= mx) {
        if (dy1 < dy2) {
          b.y = s.y - b.h;
          this.land(b);
        } else {
          b.y = s.y + s.h;
          if (b.vy < 0) b.vy = 0;
        }
      } else {
        b.x = dx1 < dx2 ? s.x - b.w : s.x + s.w;
        b.vx *= -0.3;
      }
    }
  }

  private land(b: Body): void {
    if (b.vy > 0) b.vy = b.vy > 300 ? -b.vy * 0.15 : 0;
    b.vx *= 0.82;
    b.va += b.vx * 0.002;
    b.ang *= 0.8;
  }

  private collideBodies(b: Body, o: Body): void {
    if (!o.alive || o.kind === 'ladder' || b.kind === 'ladder') return;
    if (b.x + b.w <= o.x || b.x >= o.x + o.w || b.y + b.h <= o.y || b.y >= o.y + o.h) return;
    const dx1 = b.x + b.w - o.x;
    const dx2 = o.x + o.w - b.x;
    const dy1 = b.y + b.h - o.y;
    const dy2 = o.y + o.h - b.y;
    const mx = Math.min(dx1, dx2);
    const my = Math.min(dy1, dy2);
    const impact = Math.abs(b.vx) + Math.abs(b.vy);
    if (!o.awake && !o.tip && impact > 260) this.push(o, b.vx * 0.5, Math.min(0, b.vy * 0.2));
    const oMove = o.awake ? 0.5 : 0;
    if (my <= mx) {
      if (dy1 < dy2) {
        b.y -= my * (1 - oMove);
        if (oMove) o.y += my * oMove;
        if (b.vy > o.vy) {
          const v = (b.vy + o.vy) * 0.5;
          b.vy = o.awake ? v : 0;
          if (o.awake) o.vy = v;
        }
        b.vx *= 0.85;
      } else {
        b.y += my * (1 - oMove);
        if (oMove) o.y -= my * oMove;
        if (b.vy < 0) b.vy = 0;
      }
    } else {
      const s = dx1 < dx2 ? -1 : 1;
      b.x += s * mx * (1 - oMove);
      if (oMove) o.x -= s * mx * oMove;
      const v = (b.vx + o.vx) * 0.5;
      b.vx = o.awake ? v : -b.vx * 0.2;
      if (o.awake) o.vx = v;
    }
  }
}

export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (k < 0) {
    r *= 1 + k;
    g *= 1 + k;
    b *= 1 + k;
  } else {
    r += (255 - r) * k;
    g += (255 - g) * k;
    b += (255 - b) * k;
  }
  return '#' + ((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1);
}
