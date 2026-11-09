/* ============================================================
 *  FLUIDO 2D — superfície em colunas (heightfield) com equação
 *  de onda: mola até o nível de repouso + propagação entre vizinhas
 *  + amortecimento. O nível de repouso vem do desastre (enchente
 *  subindo, frente do tsunami/avalanche chegando). Casas inteiras
 *  enchem por dentro com atraso (água entrando pela porta/frestas)
 *  e as paredes bloqueiam as ondinhas.
 *  Tudo em Float32Array criados uma vez por desastre: nada é
 *  alocado por quadro. Roda dentro do passo fixo do jogo.
 *  Alturas aqui são "acima do chão" (positivo para cima); o mundo
 *  usa y para baixo, então surf(x) = GROUND_Y - altura.
 * ============================================================ */
import { GROUND_Y, type World } from './world';

export type FluidKind = 'water' | 'lava' | 'goo' | 'snow';

/** o que o desastre controla (subconjunto de Fluid em game.ts) */
export interface FluidDrive {
  level: number;
  front: number;
  dir: number;
  crest: number;
  speed: number;
}

interface Phys {
  /** velocidade das ondas (unidades/s) */
  c: number;
  /** amortecimento da velocidade (1/s) */
  damp: number;
  /** mola até o nível de repouso (1/s²) */
  k: number;
  /** marola procedural (amplitude) */
  swell: number;
  /** força dos "pingos" aleatórios de vento/chuva */
  stir: number;
  /** quanto a velocidade da coluna vira espuma */
  foam: number;
  /** velocidade da frente vira correnteza (fração) */
  flow: number;
}

const PHYS: Record<FluidKind, Phys> = {
  water: { c: 230, damp: 0.9, k: 1.6, swell: 2.2, stir: 28, foam: 0.0035, flow: 1.25 },
  lava: { c: 70, damp: 2.8, k: 2.5, swell: 1.3, stir: 9, foam: 0, flow: 0.6 },
  goo: { c: 115, damp: 2.0, k: 2.2, swell: 1.6, stir: 12, foam: 0.002, flow: 0.8 },
  snow: { c: 45, damp: 7, k: 4, swell: 0, stir: 0, foam: 0, flow: 1.1 },
};

/** espaçamento das colunas (unidades do mundo) por nível de qualidade: ~96–160 por tela em retrato */
export const FLUID_DX = [2.9, 2.4, 2.0, 1.7];
const MAX_COLS = 1500;
/** desnível máximo de uma coluna em relação ao repouso */
const MAX_D = 70;

interface Room {
  /** índices das colunas internas (entre as paredes) */
  i0: number;
  i1: number;
  /** colunas das paredes (barreira) */
  wl0: number;
  wl1: number;
  wr0: number;
  wr1: number;
  /** altura da água lá dentro */
  h: number;
  /** casa inteira: a água de dentro é separada da de fora */
  on: boolean;
  house: number;
}

export class FluidSim {
  readonly kind: FluidKind;
  readonly dx: number;
  readonly x0: number;
  readonly n: number;
  /** altura de repouso (acima do chão) — 0 = seco */
  readonly rest: Float32Array;
  /** desnível da coluna (onda) */
  readonly d: Float32Array;
  readonly v: Float32Array;
  /** espuma 0..1.5 */
  readonly foam: Float32Array;
  readonly wet: Uint8Array;
  readonly wall: Uint8Array;
  private rooms: Room[] = [];
  private world: World;
  private ph: Phys;

  // bolhas (pool)
  readonly NB = 56;
  readonly bx = new Float32Array(56);
  readonly by = new Float32Array(56);
  readonly br = new Float32Array(56);
  readonly bl = new Float32Array(56);
  private bHead = 0;

  time = 0;
  /** forçantes aleatórias (vento/chuva); o harness desliga para medir o decaimento */
  ambient = true;
  /** chuva extra (pingos por coluna por segundo) */
  rain = 0;
  level = 0;
  front = 0;
  dir = 0;
  crest = 0;
  speed = 0;
  private seed = 0x2f6b1;

  constructor(kind: FluidKind, world: World, tier: number) {
    this.kind = kind;
    this.world = world;
    this.ph = PHYS[kind];
    let dx = FLUID_DX[Math.max(0, Math.min(3, tier | 0))];
    const span = world.W + 480;
    if (span / dx > MAX_COLS) dx = span / MAX_COLS;
    this.dx = dx;
    this.x0 = -240;
    this.n = Math.ceil(span / dx) + 1;
    const n = this.n;
    this.rest = new Float32Array(n);
    this.d = new Float32Array(n);
    this.v = new Float32Array(n);
    this.foam = new Float32Array(n);
    this.wet = new Uint8Array(n);
    this.wall = new Uint8Array(n);
    const col = (x: number) => Math.max(0, Math.min(n - 1, Math.round((x - this.x0) / dx)));
    for (let hi = 0; hi < world.houses.length; hi++) {
      const h = world.houses[hi];
      const a = world.bodies[h.wallL];
      const b = world.bodies[h.wallR];
      this.rooms.push({
        i0: col(a.x + a.w) + 1,
        i1: col(b.x) - 1,
        wl0: col(a.x),
        wl1: col(a.x + a.w),
        wr0: col(b.x),
        wr1: col(b.x + b.w),
        h: 0,
        on: false,
        house: hi,
      });
    }
  }

  private rnd(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  /** altura de repouso do lado de fora (perfil do desastre + marola) */
  restAt(x: number): number {
    const L = this.level;
    let H = L;
    if (this.dir !== 0) {
      const u = (this.front - x) * this.dir; // > 0: atrás da frente (já passou)
      if (u < -6) return 0;
      const C = this.crest;
      // tsunami: parede de água; avalanche: rampa larga rolando
      const fw = this.kind === 'snow' ? 140 : 52;
      if (u < fw - 6) {
        const k = (u + 6) / fw;
        const s = Math.sin(k * 1.5707963);
        H = (L * Math.min(1, (u + 6) / 90) + C) * Math.sqrt(s);
      } else {
        // atrás da crista: cai para o nível com ondulações (onda "ondular")
        const s = u - fw + 6;
        H = L * Math.min(1, (u + 6) / 90) + C * Math.exp(-s / 120) * (0.72 + 0.28 * Math.cos(s * 0.055)) + C * 0.1 * Math.sin(s * 0.045) * Math.exp(-s / 380);
      }
      if (this.kind === 'snow') {
        // neve: monte granuloso que viaja com a frente
        const q = x - this.front * 0.92;
        H += (2.6 * Math.sin(q * 0.13) * Math.sin(q * 0.047) + 1.6 * Math.sin(q * 0.31)) * Math.min(1, H / 30);
      }
    }
    if (H < 0.5) return 0;
    const sw = this.ph.swell;
    if (sw > 0) {
      const t = this.time;
      H += sw * (Math.sin(x * 0.045 - t * 1.7) + 0.6 * Math.sin(x * 0.018 + t * 1.1)) * Math.min(1, H / 24);
    }
    return H > 0.5 ? H : 0;
  }

  /** passo fixo (dt ≤ 1/60) */
  step(dt: number, f: FluidDrive): void {
    this.time += dt;
    this.level = f.level;
    this.front = f.front;
    this.dir = f.dir;
    this.crest = f.crest;
    this.speed = f.speed;
    const n = this.n;
    const dx = this.dx;
    const x0 = this.x0;
    const rest = this.rest;
    const d = this.d;
    const v = this.v;
    const wet = this.wet;
    const wall = this.wall;
    const foam = this.foam;
    const ph = this.ph;

    // repouso de fora
    for (let i = 0; i < n; i++) rest[i] = this.restAt(x0 + i * dx);
    wall.fill(0);

    // casas: água entra pela porta/frestas, sobe com atraso; paredes seguram as ondas
    const bs = this.world.bodies;
    const hs = this.world.houses;
    for (let r = 0; r < this.rooms.length; r++) {
      const rm = this.rooms[r];
      const h = hs[rm.house];
      const a = bs[h.wallL];
      const b = bs[h.wallR];
      const intact = a.alive && b.alive && !a.tip && !b.tip && Math.abs(a.x - h.x) < 8 && Math.abs(b.x - (h.x + h.w - 12)) < 8 && Math.abs(a.ang) < 0.15 && Math.abs(b.ang) < 0.15;
      const out = Math.max(rest[Math.max(0, rm.wl0 - 2)] + d[Math.max(0, rm.wl0 - 2)], rest[Math.min(n - 1, rm.wr1 + 2)] + d[Math.min(n - 1, rm.wr1 + 2)]);
      const wallH = GROUND_Y - h.top;
      if (!intact || rm.i1 <= rm.i0) {
        rm.on = false;
        rm.h = out;
        continue;
      }
      rm.on = true;
      const diff = out - rm.h;
      if (diff > 0) rm.h += Math.min(diff, (7 * Math.sqrt(diff) + (out > wallH ? 70 : 0)) * dt);
      else rm.h += Math.max(diff, -3 * Math.sqrt(-diff) * dt);
      if (rm.h > wallH + 4 && out > wallH + 4) {
        // passou por cima das paredes: uma água só
        rm.h = out;
        continue;
      }
      const hh = rm.h;
      for (let i = rm.i0; i <= rm.i1; i++) {
        if (hh < 3) rest[i] = 0;
        else rest[i] = hh + 0.6 * Math.sin(i * 0.4 + this.time * 2.1) * Math.min(1, hh / 10);
      }
      for (let i = rm.wl0; i <= rm.wl1; i++) wall[i] = 1;
      for (let i = rm.wr0; i <= rm.wr1; i++) wall[i] = 1;
    }

    for (let i = 0; i < n; i++) {
      const w = rest[i] > 0.5 ? 1 : 0;
      if (!w && wet[i]) foam[i] = 0;
      if (!w || (w && !wet[i])) {
        // coluna seca (ou que acabou de molhar): começa parada
        d[i] = 0;
        v[i] = 0;
      }
      wet[i] = w;
      if (wall[i]) {
        d[i] = 0;
        v[i] = 0;
      }
    }

    // forçantes: vento, chuva e a turbulência atrás da frente
    if (this.ambient && ph.stir > 0) {
      let k = n * dt * (0.22 + this.rain);
      while (k > 0) {
        if (k < 1 && this.rnd() > k) break;
        k -= 1;
        const i = Math.floor(this.rnd() * n);
        if (wet[i] && !wall[i]) v[i] += (this.rnd() - 0.6) * ph.stir * (this.rain > 0 ? 1.4 : 1);
      }
    }
    if (this.dir !== 0 && this.crest > 2 && this.kind !== 'snow') {
      // frente: água revolta e espuma (a crista passa e deixa a superfície "fervendo")
      const iF = Math.round((this.front - x0) / dx);
      const back = Math.round(170 / dx);
      for (let j = -2; j < back; j++) {
        const i = iF - j * this.dir;
        if (i < 0 || i >= n || !wet[i]) continue;
        const k = 1 - j / back;
        foam[i] = Math.max(foam[i], k * Math.min(1, this.crest / 40));
        if (this.ambient && this.rnd() < 0.08) v[i] += (this.rnd() - 0.5) * 60 * k;
      }
    }

    // equação de onda (semi-implícita), em passes para ficar estável em qualquer espaçamento
    const passes = Math.max(1, Math.min(6, Math.ceil((ph.c * dt) / (0.6 * dx))));
    const h = dt / passes;
    const c2 = (ph.c * ph.c) / (dx * dx);
    const kk = ph.k;
    const dm = ph.damp;
    for (let p = 0; p < passes; p++) {
      for (let i = 0; i < n; i++) {
        if (!wet[i] || wall[i]) continue;
        const di = d[i];
        const l = i > 0 && wet[i - 1] && !wall[i - 1] ? d[i - 1] : di;
        const r = i < n - 1 && wet[i + 1] && !wall[i + 1] ? d[i + 1] : di;
        v[i] += (c2 * (l + r - 2 * di) - kk * di - dm * v[i]) * h;
      }
      for (let i = 0; i < n; i++) {
        if (!wet[i] || wall[i]) continue;
        let di = d[i] + v[i] * h;
        if (di > MAX_D) {
          di = MAX_D;
          if (v[i] > 0) v[i] = 0;
        } else if (di < -MAX_D) {
          di = -MAX_D;
          if (v[i] < 0) v[i] = 0;
        }
        // nunca abaixo do chão
        if (rest[i] + di < 0.5) {
          di = 0.5 - rest[i];
          if (v[i] < 0) v[i] = 0;
        }
        d[i] = di;
      }
    }

    // espuma: nasce onde a água mexe rápido, some devagar
    const fk = ph.foam;
    const fd = dt * (this.kind === 'water' ? 0.55 : 0.9);
    for (let i = 0; i < n; i++) {
      if (!wet[i]) continue;
      let fo = foam[i] - fd;
      const av = v[i] < 0 ? -v[i] : v[i];
      if (fk > 0 && av > 30) fo += (av - 30) * fk;
      foam[i] = fo < 0 ? 0 : fo > 1.5 ? 1.5 : fo;
    }

    // bolhas: sobem e estouram na superfície
    const rise = this.kind === 'water' ? 70 : this.kind === 'snow' ? 0 : 28;
    for (let i = 0; i < this.NB; i++) {
      if (this.bl[i] <= 0) continue;
      this.bl[i] -= dt;
      this.by[i] -= rise * dt * (0.6 + this.br[i] * 0.15);
      this.bx[i] += Math.sin(this.time * 5 + i) * 6 * dt;
      if (this.by[i] < this.surf(this.bx[i]) + this.br[i]) this.bl[i] = 0;
    }
    if (this.ambient && (this.kind === 'goo' || this.kind === 'lava') && this.rnd() < dt * 3) {
      const i = Math.floor(this.rnd() * n);
      if (wet[i] && rest[i] > 14) this.bubble(x0 + i * dx, GROUND_Y - 3, 2 + this.rnd() * 3);
    }
  }

  /** sopra uma bolha (pool) */
  bubble(x: number, y: number, r: number): void {
    const j = this.bHead;
    this.bHead = (j + 1) % this.NB;
    this.bx[j] = x;
    this.by[j] = y;
    this.br[j] = r;
    this.bl[j] = 3;
  }

  /** empurra a superfície (dv < 0 = para baixo) numa faixa; as bordas sobem (coroa do respingo) */
  disturb(x: number, w: number, dv: number): void {
    const n = this.n;
    const a = Math.max(0, Math.floor((x - w * 0.5 - this.x0) / this.dx));
    const b = Math.min(n - 1, Math.ceil((x + w * 0.5 - this.x0) / this.dx));
    for (let i = a; i <= b; i++) if (this.wet[i] && !this.wall[i]) this.v[i] += dv;
    const e = Math.max(2, Math.round(w * 0.35 / this.dx));
    for (let k = 1; k <= e; k++) {
      const s = -dv * 0.35 * (1 - k / (e + 1));
      const l = a - k;
      const r = b + k;
      if (l >= 0 && this.wet[l] && !this.wall[l]) this.v[l] += s;
      if (r < n && this.wet[r] && !this.wall[r]) this.v[r] += s;
    }
    const av = dv < 0 ? -dv : dv;
    if (this.ph.foam > 0) for (let i = Math.max(0, a - e); i <= Math.min(n - 1, b + e); i++) if (this.wet[i]) this.foam[i] = Math.min(1.5, this.foam[i] + av * 0.006);
  }

  /** altura (acima do chão) da coluna i */
  heightAt(i: number): number {
    return this.rest[i] + this.d[i];
  }

  /** y da superfície em x (9999 = seco) */
  surf(x: number): number {
    const t = (x - this.x0) / this.dx;
    let i = Math.floor(t);
    if (i < 0) i = 0;
    else if (i > this.n - 2) i = this.n - 2;
    const w0 = this.wet[i];
    const w1 = this.wet[i + 1];
    if (!w0 && !w1) return 9999;
    const h0 = this.rest[i] + this.d[i];
    const h1 = this.rest[i + 1] + this.d[i + 1];
    if (!w1) return GROUND_Y - h0;
    if (!w0) return GROUND_Y - h1;
    const f = t - i < 0 ? 0 : t - i > 1 ? 1 : t - i;
    return GROUND_Y - (h0 + (h1 - h0) * f);
  }

  /** inclinação dy/dx da superfície (y para baixo) */
  slope(x: number): number {
    const e = this.dx * 2;
    const a = this.surf(x - e);
    const b = this.surf(x + e);
    if (a > 5000 || b > 5000) return 0;
    return (b - a) / (2 * e);
  }

  /** correnteza horizontal em x (unidades/s) */
  flow(x: number): number {
    if (this.dir === 0) return 0;
    const u = (this.front - x) * this.dir;
    if (u < -12 || u > 420) return 0;
    return this.dir * this.speed * this.ph.flow * (1 - Math.max(0, u) / 420);
  }

  /** energia das ondas (para o harness): cinética + elástica + mola */
  energy(): number {
    const c2 = (this.ph.c * this.ph.c) / (this.dx * this.dx);
    let e = 0;
    for (let i = 0; i < this.n - 1; i++) {
      if (!this.wet[i]) continue;
      const g = this.wet[i + 1] ? this.d[i + 1] - this.d[i] : 0;
      e += this.v[i] * this.v[i] + c2 * g * g + this.ph.k * this.d[i] * this.d[i];
    }
    return e * 0.5 * this.dx;
  }
}
