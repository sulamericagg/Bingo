/* ============================================================
 *  FÁBRICA ESTELAR — simulação de lote (sem desenho).
 *  Mesma lógica para jogador, bots, jogadores remotos e fábrica ociosa.
 *  Estrelas na esteira ficam num pool fixo (zero alocação por frame).
 * ============================================================ */
import {
  BELT_SPEED,
  BELT_X1,
  COFRE,
  DROP_PERIOD,
  ITEMS,
  LINE_VALUE,
  SPAWN,
  TURBO_INDEX,
  UPG_MULT,
  type ItemDef,
} from './data';

export interface SimFx {
  built(p: Plot, i: number): void;
  collected(p: Plot, amount: number): void;
  dropped(p: Plot, slot: number): void;
  zapped(p: Plot, line: number, k: number): void;
  delivered(p: Plot, line: number, value: number): void;
}

/* --------------------------- pool de estrelas --------------------------- */
export const STAR_MAX = 220;
export const stars = {
  n: 0,
  plot: new Int8Array(STAR_MAX),
  line: new Int8Array(STAR_MAX),
  x: new Float32Array(STAR_MAX),
  value: new Float32Array(STAR_MAX),
  tier: new Uint8Array(STAR_MAX),
  pass: new Uint8Array(STAR_MAX), // bits: polidores já atravessados
  spin: new Float32Array(STAR_MAX),
};
export function clearStars(): void {
  stars.n = 0;
}
function spawnStar(plot: number, line: number, x: number, value: number): void {
  if (stars.n >= STAR_MAX) return;
  const i = stars.n++;
  stars.plot[i] = plot;
  stars.line[i] = line;
  stars.x[i] = x;
  stars.value[i] = value;
  stars.tier[i] = line;
  stars.pass[i] = 0;
  stars.spin[i] = (i * 1.7) % 6.28;
}

/* --------------------------- índices úteis --------------------------- */
/** slot de extrator (linha*3+k) -> índice do item */
export const DROPPER_ITEM = new Int16Array(9).fill(-1);
/** polidor (linha*2+k) -> índice do item */
export const UPG_ITEM = new Int16Array(6).fill(-1);
export const BELT_ITEM = new Int16Array(3).fill(-1);
export const HELPER_ITEM = new Int16Array(2).fill(-1);
ITEMS.forEach((it, i) => {
  if (it.kind === 'dropper') DROPPER_ITEM[it.line * 3 + (it.x - 1)] = i;
  else if (it.kind === 'upgrader') UPG_ITEM[it.line * 2 + (it.x - 4)] = i;
  else if (it.kind === 'belt') BELT_ITEM[it.line] = i;
  else if (it.kind === 'helper') HELPER_ITEM[it.v] = i;
});

export function padCenter(it: ItemDef): { x: number; y: number } {
  if (it.kind === 'belt') return { x: 1.5, y: it.y + 0.5 };
  if (it.kind === 'turbo') return { x: 4, y: 1.25 };
  if (it.kind === 'deco') return { x: it.x + 0.5, y: 1.3 };
  return { x: it.x + 0.5, y: it.y + 0.5 };
}
export const PAD_POS = ITEMS.map(padCenter);

/* ------------------------------- lote ------------------------------- */

export class Plot {
  built = new Uint8Array(ITEMS.length);
  builtAt = new Float32Array(ITEMS.length).fill(-99);
  nBuilt = 0;
  wallet = 10;
  bank = 0;
  score = 0;
  // personagem (coordenadas locais em tiles)
  cx = SPAWN.x;
  cy = SPAWN.y;
  tx = SPAWN.x;
  ty = SPAWN.y;
  vx = 0;
  vy = 0;
  speed = 3.4;
  moving = false;
  face = 1;
  walkT = 0;
  happyT = 0;
  // máquinas
  dropT = new Float32Array(9);
  squash = new Float32Array(9);
  zap = new Float32Array(6);
  colFlash = new Float32Array(3);
  helperT = 0;
  helperFly = 0; // 0..1 animação do drone coletando
  padItem = -1;
  padHold = 0;
  cofreFlash = 0;
  decoMult = 1;
  dropMult = 1;
  finished = false;
  remote = false;
  /** emote/ícone sobre a cabeça */
  bubble = '';
  bubbleT = 0;

  constructor(
    public idx: number,
    public ox: number,
    public oy: number,
    public name: string,
    public skin: string,
    public color: string,
    public isPlayer: boolean,
  ) {
    for (let i = 0; i < 9; i++) this.dropT[i] = (i * 0.37) % DROP_PERIOD;
    this.buildNow(0, -99, null); // esteira A já vem pronta
  }

  available(i: number): boolean {
    if (this.built[i]) return false;
    const r = ITEMS[i].req;
    for (let k = 0; k < r.length; k++) if (!this.built[ITEM_IDX(r[k])]) return false;
    return true;
  }

  buildNow(i: number, now: number, fx: SimFx | null): void {
    if (this.built[i]) return;
    this.built[i] = 1;
    this.builtAt[i] = now;
    this.nBuilt++;
    const it = ITEMS[i];
    if (it.kind === 'deco') this.decoMult += 0.1;
    if (it.kind === 'helper' && it.v === 1) this.dropMult = 1.3;
    if (i === TURBO_INDEX) this.finished = true;
    fx?.built(this, i);
  }

  tryBuy(i: number, now: number, fx: SimFx | null): boolean {
    if (!this.available(i) || this.wallet < ITEMS[i].cost) return false;
    this.wallet -= ITEMS[i].cost;
    this.buildNow(i, now, fx);
    return true;
  }

  collect(fx: SimFx | null): void {
    if (this.bank < 1) return;
    const a = Math.floor(this.bank);
    this.wallet += a;
    this.bank -= a;
    this.cofreFlash = 1;
    fx?.collected(this, a);
  }

  /** máscara de bits dos itens construídos (para presença online) */
  mask(): number {
    let m = 0;
    for (let i = 0; i < ITEMS.length; i++) if (this.built[i]) m += 2 ** i;
    return m;
  }

  incomePerSec(): number {
    let s = 0;
    for (let l = 0; l < 3; l++) {
      if (!this.built[BELT_ITEM[l]]) continue;
      let n = 0;
      for (let k = 0; k < 3; k++) if (this.built[DROPPER_ITEM[l * 3 + k]]) n++;
      let m = 1;
      for (let k = 0; k < 2; k++) if (this.built[UPG_ITEM[l * 2 + k]]) m *= UPG_MULT;
      s += (n * LINE_VALUE[l] * m * this.dropMult) / DROP_PERIOD;
    }
    return s * this.decoMult;
  }

  /** move o personagem rumo ao alvo (ou pela velocidade do joystick) */
  stepWalker(dt: number, joy: boolean): void {
    let dx: number, dy: number;
    if (joy) {
      dx = this.vx * this.speed * dt;
      dy = this.vy * this.speed * dt;
      this.moving = dx !== 0 || dy !== 0;
    } else {
      const ex = this.tx - this.cx;
      const ey = this.ty - this.cy;
      const d = Math.hypot(ex, ey);
      const st = this.speed * dt;
      if (d <= st || d < 0.02) {
        dx = ex;
        dy = ey;
        this.moving = false;
      } else {
        dx = (ex / d) * st;
        dy = (ey / d) * st;
        this.moving = true;
      }
    }
    if (dx > 0.001) this.face = 1;
    else if (dx < -0.001) this.face = -1;
    this.cx = Math.min(7.7, Math.max(0.3, this.cx + dx));
    this.cy = Math.min(9.75, Math.max(0.9, this.cy + dy));
    if (this.moving) this.walkT += dt;
  }

  /** máquinas, estrelas (deste lote), compras por pisar e cofre */
  update(dt: number, now: number, fx: SimFx | null, economy = true): void {
    // extratores
    for (let s = 0; s < 9; s++) {
      if (this.squash[s] > 0) this.squash[s] = Math.max(0, this.squash[s] - dt * 4);
      const it = DROPPER_ITEM[s];
      if (!this.built[it]) continue;
      this.dropT[s] += dt * this.dropMult;
      if (this.dropT[s] >= DROP_PERIOD) {
        this.dropT[s] -= DROP_PERIOD;
        const l = (s / 3) | 0;
        spawnStar(this.idx, l, (s % 3) + 1.5, LINE_VALUE[l]);
        this.squash[s] = 1;
        fx?.dropped(this, s);
      }
    }
    for (let k = 0; k < 6; k++) if (this.zap[k] > 0) this.zap[k] = Math.max(0, this.zap[k] - dt * 3);
    for (let k = 0; k < 3; k++) if (this.colFlash[k] > 0) this.colFlash[k] = Math.max(0, this.colFlash[k] - dt * 3);
    if (this.cofreFlash > 0) this.cofreFlash = Math.max(0, this.cofreFlash - dt * 2.5);
    if (this.happyT > 0) this.happyT -= dt;
    if (this.bubbleT > 0) this.bubbleT -= dt;
    if (!economy) return;
    // ajudante coletor
    if (this.built[HELPER_ITEM[0]]) {
      this.helperT += dt;
      if (this.helperFly > 0) this.helperFly = Math.max(0, this.helperFly - dt * 1.4);
      if (this.helperT > 4) {
        this.helperT = 0;
        if (this.bank >= 1) {
          this.helperFly = 1;
          this.collect(fx);
        }
      }
    }
    if (this.remote) return;
    // pisar em botão de compra
    let on = -1;
    for (let i = 0; i < ITEMS.length; i++) {
      if (this.built[i] || !this.available(i)) continue;
      const p = PAD_POS[i];
      if (Math.abs(p.x - this.cx) < 0.5 && Math.abs(p.y - this.cy) < 0.5) {
        on = i;
        break;
      }
    }
    if (on !== this.padItem) {
      this.padItem = on;
      this.padHold = 0;
    }
    if (on >= 0 && this.wallet >= ITEMS[on].cost) {
      this.padHold += dt;
      if (this.padHold >= 0.3) {
        this.tryBuy(on, now, fx);
        this.padItem = -1;
        this.padHold = 0;
        this.happyT = 0.8;
      }
    }
    // cofre
    if (Math.abs(COFRE.x - this.cx) < 0.65 && Math.abs(COFRE.y - this.cy) < 0.6) this.collect(fx);
  }
}

const ITEM_IDX = (id: string): number => IDX[id];
const IDX: Record<string, number> = {};
ITEMS.forEach((it, i) => (IDX[it.id] = i));

/** Avança as estrelas de todos os lotes (polidores multiplicam; coletor credita). */
export function updateStars(plots: Plot[], dt: number, fx: SimFx | null): void {
  const mv = BELT_SPEED * dt;
  let i = 0;
  while (i < stars.n) {
    const p = plots[stars.plot[i]];
    const l = stars.line[i];
    const x0 = stars.x[i];
    const x1 = x0 + mv;
    stars.x[i] = x1;
    stars.spin[i] += dt * 3;
    for (let k = 0; k < 2; k++) {
      const ux = 4.5 + k;
      if (x0 < ux && x1 >= ux && p.built[UPG_ITEM[l * 2 + k]] && !(stars.pass[i] & (1 << k))) {
        stars.pass[i] |= 1 << k;
        stars.value[i] *= UPG_MULT;
        stars.tier[i] = Math.min(5, stars.tier[i] + 1);
        p.zap[l * 2 + k] = 1;
        fx?.zapped(p, l, k);
      }
    }
    if (x1 >= BELT_X1 + 0.35) {
      const v = stars.value[i] * p.decoMult;
      p.bank += v;
      if (!p.remote) p.score += v;
      p.colFlash[l] = 1;
      fx?.delivered(p, l, v);
      // remove trocando com o último
      const j = --stars.n;
      if (i !== j) {
        stars.plot[i] = stars.plot[j];
        stars.line[i] = stars.line[j];
        stars.x[i] = stars.x[j];
        stars.value[i] = stars.value[j];
        stars.tier[i] = stars.tier[j];
        stars.pass[i] = stars.pass[j];
        stars.spin[i] = stars.spin[j];
      }
      continue;
    }
    i++;
  }
}

export { COFRE };
