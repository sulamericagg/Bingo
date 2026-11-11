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
  /** plataforma/copa que cedeu nesta rodada (não colide mais; desenho cai) */
  gone?: boolean;
  /** tempo com alguém em cima durante o desastre (s) */
  stood?: number;
  /** tremendo antes de cair (s restantes; 0 = firme) */
  crumble?: number;
  /** queda visual depois de ceder */
  fallY?: number;
}

/** buraco no chão (rachadura do terremoto / sumidouro): avisa, abre, às vezes fecha */
export interface Hole {
  on: boolean;
  x: number;
  w: number;
  /** aviso restante (s); > 0 = ainda fechado, piscando */
  warn: number;
  warnT: number;
  /** aberto há (s) */
  open: number;
  /** fecha depois de (s) aberto; 0 = nunca */
  life: number;
  /** cresce (unidades/s) — sumidouro */
  grow: number;
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
  /** base no início do passo (colisão varrida com plataformas finas) */
  py: number;
  /** encostou em algo por baixo neste passo */
  rest: boolean;
  /** fração submersa no passo anterior (respingo ao entrar) */
  sub: number;
}

/** fluido visto pela física dos corpos (implementado em game.ts sobre o FluidSim) */
export interface FluidField {
  /** y da superfície em x (9999 = seco) */
  surf(x: number): number;
  /** inclinação dy/dx da superfície */
  slope(x: number): number;
  /** correnteza horizontal (unidades/s) */
  flow(x: number): number;
  /** empurrão da frente (tsunami/avalanche); 0 = fluido que só sobe */
  push: number;
  /** empuxo de um corpo leve (água ~2,4: flutua com ~40% submerso) */
  buoy: number;
  /** arrasto (1/s) */
  drag: number;
  /** algo entrou/mexeu na superfície: vy > 0 = para baixo */
  splash(x: number, w: number, vy: number): void;
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
  /** o tornado arrancou o telhado nesta rodada (não é mais abrigo) */
  ripped?: boolean;
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
/** velocidade máxima dos corpos (px/s) */
const MAX_FALL = 720;

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
  /** buracos abertos/avisando no chão da arena (tamanho fixo: nada alocado na rodada) */
  holes: Hole[] = [];
  spawnX = 120;
  map: MapTheme;
  maxBodies: number;
  /** wobble do terremoto aplicado ao desenho */
  awakeCount = 0;

  constructor(sc: Scenario, maxBodies: number) {
    this.map = sc.map;
    this.maxBodies = maxBodies;
    const r = mulberry(sc.seed);
    for (let i = 0; i < 10; i++) this.holes.push({ on: false, x: 0, w: 0, warn: 0, warnT: 1, open: 0, life: 0, grow: 0 });
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
    this.bodies.push({ id, x, y, w, h, vx: 0, vy: 0, kind, color, color2, awake: false, still: 0, tip: 0, tipT: 0, ang: 0, va: 0, alive: true, check: Math.random() * 0.3, heavy, wet: 0, py: y + h, rest: false, sub: 0 });
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
    let free = 0; // fim da última construção (casas/torres não nascem sobrepostas)
    const slot = (this.W - 140) / Math.max(1, bag.length);
    for (const k of bag) {
      const at = Math.max(x + r() * slot * 0.25, free);
      if (k === 'h') free = at + 12 + this.house(r, at, r() < 0.35 ? 2 : 1);
      else if (k === 't') free = at + 12 + this.tower(r, at, 3 + Math.floor(r() * 3));
      else this.tree(r, at + 40);
      x += slot;
    }
    // plataformas flutuantes (andaimes/nuvens)
    for (let i = 0; i < m.floats; i++) {
      const fx = 80 + r() * (this.W - 240);
      const fy = -90 - r() * 150;
      this.solid(fx, fy, 70 + r() * 40, 10, 'plat', true);
    }
    // caixas soltas
    // (sem nascer dentro de paredes/torres: antes uma caixa podia surgir sobreposta e "explodir" ao acordar)
    for (let i = 0; i < m.crates; i++) {
      for (let k = 0; k < 10; k++) {
        const cx = 60 + r() * (this.W - 120);
        if (k < 9 && this.bodies.some((o) => cx + 26 > o.x - 2 && cx < o.x + o.w + 2 && o.y + o.h > GROUND_Y - 30)) continue;
        this.body(cx, GROUND_Y - 26, 26, 26, 'crate', '#c98a4a', '#8a5a2a', 0);
        break;
      }
    }
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

  /** x está sobre um buraco aberto no chão? (margem: o Bloop precisa estar bem dentro) */
  inHole(x: number, margin = 0): boolean {
    const hs = this.holes;
    for (let i = 0; i < hs.length; i++) {
      const h = hs[i];
      if (h.on && h.warn <= 0 && x > h.x + margin && x < h.x + h.w - margin) return true;
    }
    return false;
  }

  /** sólido conta para colisão neste x? (chão some em cima de buraco; plataforma que cedeu some) */
  solidAt(s: Solid, x: number): boolean {
    if (s.gone) return false;
    if (s.kind === 'ground' && this.inHole(x)) return false;
    return true;
  }

  /** topo da superfície mais alta em x abaixo de fromY (para sombras/IA). */
  surfaceBelow(x: number, fromY: number): number {
    let best = 400;
    for (let i = 0; i < this.solids.length; i++) {
      const s = this.solids[i];
      if (x >= s.x && x <= s.x + s.w && s.y >= fromY && s.y < best && this.solidAt(s, x)) best = s.y;
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

  /** dentro da área de uma casa (térreo), mesmo que ela tenha levado uns trancos */
  insideHouse(px: number, py: number): boolean {
    for (const h of this.houses) {
      if (h.ripped) continue;
      if (px < h.x + 6 || px > h.x + h.w - 6 || py < h.top - 4 || py > GROUND_Y + 2) continue;
      const c = this.bodies[h.ceil];
      if (c.alive && c.y + c.h < h.top + 30) return true;
    }
    return false;
  }

  isSheltered(px: number, py: number): boolean {
    for (const h of this.houses) {
      if (h.ripped) continue;
      if (px < h.x + 8 || px > h.x + h.w - 8 || py < h.top || py > GROUND_Y + 2) continue;
      const a = this.bodies[h.wallL];
      const b = this.bodies[h.wallR];
      const c = this.bodies[h.ceil];
      // tolera paredes "acordadas" por um tranco, desde que continuem no lugar e em pé
      if (!a.alive || !b.alive || !c.alive || a.tip || b.tip) continue;
      if (Math.abs(a.x - h.x) > 6 || Math.abs(b.x - (h.x + h.w - 12)) > 6 || Math.abs(Math.sin(a.ang || 0)) > 0.12 || Math.abs(Math.sin(b.ang || 0)) > 0.12) continue;
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

  step(dt: number, fl: FluidField | null): void {
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
        if (fl) {
          const s = fl.surf(b.x + b.w * 0.5);
          if (b.y + b.h > s + 4) {
            b.wet += dt;
            // torres (blocos) aguentam mais tempo antes de ceder
            const hold = b.kind === 'block' || b.kind === 'cap' ? 3.5 + (b.id % 5) : 0.15;
            if (b.wet > hold && fl.push !== 0) this.push(b, fl.push * 0.5, -40);
            // leve (madeira) com água pela metade: solta e flutua
            else if (!b.heavy && b.kind !== 'ladder' && b.y + b.h - s > b.h * 0.45) {
              this.wake(b);
              b.sub = 0.45;
            }
          }
        }
        if (!b.awake) continue;
      }
      awake++;
      // fluido: empuxo pela altura local (amostrada nas duas pontas), arrasto pela correnteza,
      // escorrega na inclinação e inclina junto com a onda
      let sub = 0;
      if (fl) {
        const sl = fl.surf(b.x + 2);
        const sr = fl.surf(b.x + b.w - 2);
        const s = sl > 5000 ? sr : sr > 5000 ? sl : (sl + sr) * 0.5;
        if (s < 5000 && b.y + b.h > s) {
          sub = Math.min(1, (b.y + b.h - s) / b.h);
          b.wet = Math.max(b.wet, 1);
          if (b.sub === 0 && b.vy > 90) fl.splash(b.x + b.w * 0.5, b.w, b.vy);
          else if (b.vy > 40 || b.vy < -40) fl.splash(b.x + b.w * 0.5, b.w, b.vy * 0.05);
        }
      }
      b.sub = sub;
      b.vy += GRAV_BODY * dt * (1 - sub * (b.heavy ? 0.85 : fl ? fl.buoy : 1.5));
      if (sub > 0 && fl) {
        const k = Math.min(1, fl.drag * dt * (0.4 + sub));
        const cx = b.x + b.w * 0.5;
        const flow = fl.flow(cx);
        b.vx += (flow * (b.heavy ? 0.7 : 1) - b.vx) * k;
        b.vy -= b.vy * Math.min(1, (b.vy < 0 ? 3.2 : 1.6) * dt * sub);
        // subida limitada (madeira não vira foguete numa onda alta)
        if (b.vy < -320) b.vy = -320;
        const sl = fl.slope(cx);
        b.vx += sl * GRAV_BODY * 0.22 * dt * sub;
        if (!b.heavy) {
          // flutuando: acompanha a inclinação da onda (só visual)
          const ta = Math.max(-0.45, Math.min(0.45, Math.atan(sl)));
          b.va += ((ta - b.ang) * 10 - b.va * 3) * dt;
        }
      }
      // velocidade terminal: no máx. ~12 px por subpasso de 1/60 s (lajes têm 12 px: sem atravessar)
      if (b.vy > MAX_FALL) b.vy = MAX_FALL;
      else if (b.vy < -MAX_FALL) b.vy = -MAX_FALL;
      if (b.vx > MAX_FALL) b.vx = MAX_FALL;
      else if (b.vx < -MAX_FALL) b.vx = -MAX_FALL;
      b.py = b.y + b.h;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.ang += b.va * dt;
      b.va *= 1 - Math.min(1, 1.5 * dt);
      if (b.ang > 0.5) b.ang = 0.5;
      else if (b.ang < -0.5) b.ang = -0.5;
      if (b.x < -150) b.x = -150;
      if (b.x > this.W + 150) b.x = this.W + 150;
      b.rest = false;
      this.collideStatic(b);
      for (let j = 0; j < bs.length; j++) if (j !== i) this.collideBodies(b, bs[j]);
      // apoiado: a inclinação (só visual) volta a zero — a colisão é sempre da caixa reta,
      // então um bloco "torto" parado parecia flutuar/afundar
      if (b.rest) {
        const k = Math.min(1, 6 * dt);
        b.ang -= b.ang * k;
        b.va -= b.va * k;
      }
      // dormir: limiar independente do passo (a gravidade de um passo não conta como movimento)
      const sp = Math.abs(b.vx) + Math.abs(b.vy) - GRAV_BODY * dt;
      if (sp < 20 && sub === 0 && Math.abs(b.ang) < 0.08) {
        b.still += dt;
        if (b.still > 0.4) {
          b.awake = false;
          b.vx = b.vy = 0;
          b.va = 0;
          b.ang = 0;
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
      if (Math.abs(s.y - bottom) < 3 && b.x + b.w > s.x + 2 && b.x < s.x + s.w - 2 && this.solidAt(s, b.x + b.w * 0.5)) return true;
    }
    for (let i = 0; i < this.bodies.length; i++) {
      const o = this.bodies[i];
      // escada não segura nada (antes o chapéu da torre ficava flutuando preso na escada)
      if (o === b || !o.alive || o.tip || o.kind === 'ladder') continue;
      if (Math.abs(o.y - bottom) < 3) {
        const ov = Math.min(b.x + b.w, o.x + o.w) - Math.max(b.x, o.x);
        // mesmo critério da colisão (qualquer apoio de verdade): antes um bloco com apoio
        // estreito era acordado a cada 0,2 s, a colisão o segurava, ele dormia... para sempre
        if (ov > 2) return true;
      }
    }
    return false;
  }

  private collideStatic(b: Body): void {
    for (let i = 0; i < this.solids.length; i++) {
      const s = this.solids[i];
      if (b.x + b.w <= s.x || b.x >= s.x + s.w) continue;
      if (!this.solidAt(s, b.x + b.w * 0.5)) continue;
      if (s.oneWay) {
        // varrido: a base cruzou o topo da plataforma neste passo (não depende do fps)
        if (b.vy >= 0 && b.py <= s.y + 2 && b.y + b.h >= s.y) {
          b.y = s.y - b.h;
          this.land(b);
        }
        continue;
      }
      if (b.y + b.h <= s.y || b.y >= s.y + s.h) continue;
      if (b.py <= s.y + 2) {
        // vinha de cima: sempre resolve para cima (nunca "afunda" e sai por baixo/lado)
        b.y = s.y - b.h;
        this.land(b);
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
    b.rest = true;
    if (b.vy > 0) b.vy = b.vy > 300 ? -b.vy * 0.15 : 0;
    b.vx *= 0.82;
    b.va += b.vx * 0.002;
  }

  private collideBodies(b: Body, o: Body): void {
    // corpo tombando é só animação (gira em volta do canto): sua caixa reta não empurra ninguém
    if (!o.alive || o.kind === 'ladder' || b.kind === 'ladder' || o.tip) return;
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
      // vertical: quem está EM CIMA sai da sobreposição (empurrar o de baixo para baixo
      // enterrava pilhas no chão e as fazia tremer sem nunca dormir)
      if (dy1 < dy2) {
        b.y -= my;
        b.rest = true;
        // apoio: o de cima não desce mais rápido que o de baixo (sem passar velocidade para
        // baixo — antes a média "bombeava" a pilha e ela tremia acordada para sempre)
        const lim = o.awake ? Math.max(0, o.vy) : 0;
        if (b.vy > lim) b.vy = lim;
        b.vx *= 0.85;
      } else if (o.awake && !o.tip && !(b.sub > 0 && b.vy < 0)) {
        // (um corpo subindo pelo empuxo não levanta o que está em cima: antes uma caixa
        // submersa erguia a laje + telhado inteiros como um macaco hidráulico)
        o.y -= my;
        o.rest = true;
        const lim = Math.max(0, b.vy);
        if (o.vy > lim) o.vy = lim;
      } else if (b.rest) {
        // b já está apoiado (chão/plataforma): quem sai é o de cima — antes b era empurrado
        // para dentro do chão e ficava "brigando" com ele para sempre (parede tombada enterrada)
        o.y -= my;
        if (my > 1) this.wake(o); // encostinho de <1 px não acorda (evita ping-pong de acordar/dormir)
        if (o.vy > 0) o.vy = 0;
      } else {
        b.y += my;
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
