/* ============================================================
 *  Bots da Fábrica Estelar — estratégias simples e "gente boa".
 *  0 = Tranquilo (passeia, escolhe meio aleatório)
 *  1 = Esperto (compra o mais barato, coleta com frequência)
 *  2 = Craque (melhor custo-benefício, rápido)
 * ============================================================ */
import { COFRE, DROP_PERIOD, ITEMS, LINE_VALUE, TURBO_INDEX } from './data';
import { PAD_POS, type Plot, type SimFx } from './sim';

export interface Brain {
  diff: number;
  think: number;
  goal: number; // índice de item, -2 = cofre, -3 = passear
  pause: number;
  rnd: () => number;
}

const THINK = [1.3, 0.65, 0.3];
const SPEED = [2.5, 2.8, 3.35];
const BUBBLES = ['star', 'heart', 'sparkle', 'party'];

export function makeBrain(diff: number, rnd: () => number): Brain {
  return { diff, think: rnd() * 0.5, goal: -3, pause: 0, rnd };
}

export function botSpeed(diff: number): number {
  return SPEED[diff] ?? 3;
}

function gainOf(p: Plot, i: number): number {
  const it = ITEMS[i];
  const base = p.incomePerSec();
  if (it.kind === 'dropper' || it.kind === 'upgrader') {
    p.built[i] = 1;
    const g = p.incomePerSec() - base;
    p.built[i] = 0;
    return g;
  }
  if (it.kind === 'belt') return (LINE_VALUE[it.line] / DROP_PERIOD) * 0.9;
  if (it.kind === 'deco') return base * 0.1;
  if (it.kind === 'helper') return it.v === 0 ? base * 0.12 + 0.5 : base * 0.3;
  return 1e9; // turbo
}

function chooseItem(p: Plot, b: Brain): number {
  let best = -1;
  let bestScore = -1;
  let cheapest = -1;
  let n = 0;
  for (let i = 0; i < ITEMS.length; i++) {
    if (!p.available(i)) continue;
    if (i === TURBO_INDEX) return i;
    n++;
    if (cheapest < 0 || ITEMS[i].cost < ITEMS[cheapest].cost) cheapest = i;
    const sc = b.diff === 2 ? gainOf(p, i) / Math.max(1, ITEMS[i].cost) : b.diff === 1 ? 1 / (1 + ITEMS[i].cost) : b.rnd();
    if (sc > bestScore) {
      bestScore = sc;
      best = i;
    }
  }
  if (n === 0) return -1;
  // o craque não fica esperando algo caro se dá pra comprar algo útil agora
  if (b.diff === 2 && best >= 0 && p.wallet + p.bank < ITEMS[best].cost * 0.5 && cheapest >= 0 && p.wallet >= ITEMS[cheapest].cost)
    return cheapest;
  return best;
}

export function botStep(p: Plot, b: Brain, dt: number, now: number, fx: SimFx | null): void {
  if (b.pause > 0) {
    b.pause -= dt;
    p.stepWalker(dt, false);
    p.update(dt, now, fx);
    return;
  }
  b.think -= dt;
  if (b.think <= 0) {
    b.think = THINK[b.diff] * (0.7 + b.rnd() * 0.6);
    // o tranquilo às vezes para pra dançar/olhar a fábrica
    if (b.diff === 0 && b.rnd() < 0.06) {
      b.pause = 1.5 + b.rnd() * 2;
      p.bubble = BUBBLES[(b.rnd() * BUBBLES.length) | 0];
      p.bubbleT = 1.6;
      return;
    }
    const want = chooseItem(p, b);
    const cost = want >= 0 ? ITEMS[want].cost : Infinity;
    const collectAt = b.diff === 0 ? 0.6 : b.diff === 1 ? 0.35 : 0.2;
    if (want >= 0 && p.wallet >= cost) b.goal = want;
    else if (p.bank >= 1 && (p.wallet + p.bank >= cost || p.bank >= cost * collectAt || p.bank > 25)) b.goal = -2;
    else b.goal = want >= 0 ? want : -3;
    if (b.goal >= 0) {
      const pc = PAD_POS[b.goal];
      // espera ao lado do botão se ainda não dá pra pagar
      const off = p.wallet >= cost ? 0 : 0.7;
      p.tx = pc.x;
      p.ty = Math.min(9.6, pc.y + off);
    } else if (b.goal === -2) {
      p.tx = COFRE.x;
      p.ty = COFRE.y;
    } else {
      p.tx = 1 + b.rnd() * 6;
      p.ty = 8.3 + b.rnd() * 1.2;
    }
  }
  const before = p.nBuilt;
  p.stepWalker(dt, false);
  p.update(dt, now, fx);
  if (p.nBuilt !== before) {
    b.think = Math.min(b.think, 0.15);
    if (b.rnd() < 0.35) {
      p.bubble = BUBBLES[(b.rnd() * BUBBLES.length) | 0];
      p.bubbleT = 1.4;
    }
  }
}
