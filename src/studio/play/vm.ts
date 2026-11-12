/* ============================================================
 *  BLOOP STUDIO — interpretador dos BLOCOS DE LÓGICA.
 *  Determinístico (aleatório com semente), sem eval, isolado: só conversa
 *  com o jogo pela interface VmHost. Cada evento cria uma "linha" (thread);
 *  por quadro há um orçamento de passos (global e por linha), então um
 *  "repetir" sem "esperar" nunca trava o jogo — só anda devagar.
 * ============================================================ */
import { LIMITS, type Block, type Cond, type Expr, type ExprQuery, type Script, type ScriptEventKind } from '../format';

export interface VmHost {
  move(part: number, d: [number, number, number], t: number): void;
  rotate(part: number, r: [number, number, number], t: number): void;
  teleport(part: number): void;
  spawn(part: number): void;
  destroy(part: number): void;
  sound(snd: string): void;
  say(text: string): void;
  score(n: number): void;
  color(part: number, c: string): void;
  force(part: number, d: [number, number, number]): void;
  door(part: number): void;
  light(part: number): void;
  motor(joint: number): void;
  checkpoint(part: number | null): void;
  team(team: number): void;
  lives(n: number): void;
  match(on: 'start' | 'win' | 'lose'): void;
  /** v4 acrescentou 'it' | 'level' | 'alive' (W0: o PlaySession atual devolve 1 — a fase 1 — até o W1) */
  read(q: ExprQuery): number;
}

interface Frame {
  list: Block[];
  i: number;
  /** repetições restantes (repetir) */
  left?: number;
}
interface Thread {
  sc: Script;
  self: number | null;
  stack: Frame[];
  wake: number;
}

const MAX_THREADS = 48;
const STEPS_PER_THREAD = 120;
const STEPS_PER_FRAME = 600;

export class ScriptVM {
  vars = new Map<string, number>();
  private threads: Thread[] = [];
  private timers: { sc: Script; next: number }[] = [];
  private now = 0;
  private seed: number;
  /** passos executados no último quadro (debug/perf) */
  lastSteps = 0;

  constructor(
    private scripts: Script[],
    private host: VmHost,
    seed = 12345,
  ) {
    this.seed = seed >>> 0 || 1;
    for (const sc of scripts) if (sc.on.k === 'every') this.timers.push({ sc, next: sc.on.sec ?? 1 });
  }

  get count(): number {
    return this.scripts.length;
  }

  /** dispara um evento; `part` filtra (touch/zone/collect/button) e vira "esta peça" */
  emit(k: ScriptEventKind, part: number | null = null, msg?: string): void {
    for (const sc of this.scripts) {
      if (sc.on.k !== k) continue;
      if (k === 'message' && sc.on.msg !== msg) continue;
      if (sc.on.part != null && sc.on.part !== part) continue;
      // o mesmo script para a mesma peça não roda duas vezes ao mesmo tempo (toque contínuo)
      if (k !== 'message' && this.threads.some((t) => t.sc === sc && t.self === (part ?? sc.on.part ?? null))) continue;
      if (this.threads.length >= MAX_THREADS) return;
      this.threads.push({ sc, self: part ?? sc.on.part ?? null, stack: [{ list: sc.body, i: 0 }], wake: this.now });
    }
  }

  /** scripts esperam eventos com peça? (para o jogo saber o que vigiar) */
  watchedParts(k: ScriptEventKind): Set<number> {
    const s = new Set<number>();
    for (const sc of this.scripts) if (sc.on.k === k && sc.on.part != null) s.add(sc.on.part);
    return s;
  }

  update(dt: number): void {
    this.now += dt;
    for (const tm of this.timers) {
      tm.next -= dt;
      if (tm.next <= 0) {
        tm.next += tm.sc.on.sec ?? 1;
        if (tm.next < 0) tm.next = tm.sc.on.sec ?? 1;
        this.emit('every', tm.sc.on.part ?? null);
      }
    }
    let budget = STEPS_PER_FRAME;
    for (const th of [...this.threads]) {
      if (budget <= 0) break;
      if (th.wake > this.now) continue;
      let steps = 0;
      while (th.stack.length && steps < STEPS_PER_THREAD && budget > 0 && th.wake <= this.now) {
        steps++;
        budget--;
        this.step(th);
      }
      if (!th.stack.length) this.threads.splice(this.threads.indexOf(th), 1);
    }
    this.lastSteps = STEPS_PER_FRAME - budget;
  }

  private step(th: Thread): void {
    const f = th.stack[th.stack.length - 1];
    if (f.i >= f.list.length) {
      if (f.left != null && f.left > 1) {
        f.left--;
        f.i = 0;
      } else th.stack.pop();
      return;
    }
    const b = f.list[f.i++];
    const self = (p?: number) => (p ?? th.self) as number | null;
    const h = this.host;
    switch (b.k) {
      case 'move': {
        const p = self(b.part);
        if (p != null) h.move(p, b.d, b.t ?? 0.5);
        return;
      }
      case 'rotate': {
        const p = self(b.part);
        if (p != null) h.rotate(p, b.r, b.t ?? 0.5);
        return;
      }
      case 'teleport':
        return h.teleport(b.part);
      case 'spawn':
        return h.spawn(b.part);
      case 'destroy': {
        const p = self(b.part);
        if (p != null) h.destroy(p);
        return;
      }
      case 'sound':
        return h.sound(b.snd);
      case 'say':
        return h.say(this.fmt(b.text));
      case 'score':
        return h.score(this.ev(b.n));
      case 'color': {
        const p = self(b.part);
        if (p != null) h.color(p, b.c);
        return;
      }
      case 'force': {
        const p = self(b.part);
        if (p != null) h.force(p, b.d);
        return;
      }
      case 'door':
        return h.door(b.part);
      case 'light':
        return h.light(b.part);
      case 'motor':
        return h.motor(b.joint);
      case 'checkpoint':
        return h.checkpoint(self(b.part));
      case 'set':
        this.vars.set(b.v, this.ev(b.e));
        return;
      case 'change':
        this.vars.set(b.v, (this.vars.get(b.v) ?? 0) + this.ev(b.e));
        return;
      case 'if': {
        const list = this.test(b.c) ? b.then : b.else;
        if (list?.length && th.stack.length < LIMITS.blockDepth + 2) th.stack.push({ list, i: 0 });
        return;
      }
      case 'repeat': {
        const n = Math.max(0, Math.min(LIMITS.repeatMax, Math.round(this.ev(b.n))));
        if (n > 0 && b.body.length && th.stack.length < LIMITS.blockDepth + 2) th.stack.push({ list: b.body, i: 0, left: n });
        return;
      }
      case 'wait':
        th.wake = this.now + Math.max(0, Math.min(600, this.ev(b.sec)));
        return;
      case 'team':
        return h.team(b.team);
      case 'lives':
        return h.lives(this.ev(b.n));
      case 'match':
        return h.match(b.on);
      case 'send':
        this.emit('message', null, b.msg);
        return;
    }
  }

  /** "Pontos: {score}" / "{vidas}" → troca {nome} por variáveis/leituras */
  private fmt(s: string): string {
    return s.replace(/\{([^}]{1,16})\}/g, (_, k: string) => {
      if (k === 'score' || k === 'time' || k === 'lives' || k === 'team' || k === 'players') return String(Math.round(this.host.read(k)));
      return String(Math.round((this.vars.get(k) ?? 0) * 100) / 100);
    });
  }

  ev(e: Expr): number {
    if (typeof e === 'number') return e;
    if ('v' in e) return this.vars.get(e.v) ?? 0;
    if ('q' in e) return this.host.read(e.q);
    const a = this.ev(e.a);
    const b = this.ev(e.b);
    switch (e.op) {
      case '+':
        return a + b;
      case '-':
        return a - b;
      case '*':
        return a * b;
      case '/':
        return b === 0 ? 0 : a / b;
      case 'min':
        return Math.min(a, b);
      case 'max':
        return Math.max(a, b);
      case 'rand': {
        // xorshift com semente: a mesma partida sempre sorteia igual
        let x = this.seed;
        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;
        this.seed = x >>> 0;
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        return Math.floor(lo + (this.seed / 4294967296) * (hi - lo + 1));
      }
    }
    return 0;
  }

  test(c: Cond): boolean {
    const a = this.ev(c.a);
    const b = this.ev(c.b);
    switch (c.op) {
      case '<':
        return a < b;
      case '>':
        return a > b;
      case '<=':
        return a <= b;
      case '>=':
        return a >= b;
      case '!=':
        return a !== b;
      default:
        return a === b;
    }
  }

  reset(): void {
    this.threads.length = 0;
    this.vars.clear();
    for (const tm of this.timers) tm.next = tm.sc.on.sec ?? 1;
  }
}

/** todos os blocos (achatado) — para descobrir quais peças os scripts mexem */
export function walkBlocks(list: Block[], fn: (b: Block) => void): void {
  for (const b of list) {
    fn(b);
    if (b.k === 'if') {
      walkBlocks(b.then, fn);
      if (b.else) walkBlocks(b.else, fn);
    } else if (b.k === 'repeat') walkBlocks(b.body, fn);
  }
}
