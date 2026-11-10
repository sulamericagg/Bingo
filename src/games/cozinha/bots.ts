/* ============================================================
 *  COZINHA MALUCA — ajudantes (bots). Prestativos, mas imperfeitos:
 *  reagem com atraso, andam um pouco mais devagar, às vezes deixam
 *  algo cair no chão. Escrevem no mesmo `p.in` que o jogador humano.
 *  Papéis: cozinheiro (pedido inteiro), picador, lavador, garçom.
 * ============================================================ */
import { INGS, RECIPES, compIng, compRoute, compStage } from './data';
import { COOKERS, IK, Sim, type Item, type Player, type Station } from './sim';

const enum A {
  None = 0,
  Pick = 1,
  Act = 2,
}

const crews = new WeakMap<Sim, Brain[]>();

/** comandos que o jogador dá aos ajudantes (como um bichinho fiel) */
export type Cmd = 'follow' | 'stay' | 'wash' | 'chop' | 'serve' | 'fire' | 'cook' | 'fetch';
/** tarefas do menu (ordem dos botões) */
export const CMDS: Cmd[] = ['chop', 'cook', 'wash', 'serve', 'fetch'];
/** teto: ajudantes fazem no máximo esta parte do trabalho */
export const BOT_CAP = 0.3;

export class Brain {
  private think = 0;
  private goal = -1; // estação alvo
  private action: A = A.None;
  private path: Int16Array;
  private pathLen = 0;
  private pathI = 0;
  private pathFor = -2;
  private assembly = -1;
  private order = 0;
  private wander = 0;
  private stuck = 0;
  private lastX = 0;
  private lastY = 0;
  private pressed = false;
  private actHold = 0;
  /* ------------- modo bichinho (ajudante obediente) ------------- */
  /** true = ajudante que só age por comando; false = piloto automático (teste/depuração) */
  pet = false;
  /** a quem obedece / segue */
  owner: Player | null = null;
  /** modo de espera: seguir ou ficar */
  idleMode: 'follow' | 'stay' = 'follow';
  /** tarefa em andamento (uma só, sem encadear) */
  task: Cmd | '' = '';
  private taskSt = -1;
  private taskT = 0;
  /** atraso de reação (s) antes de começar */
  private react = 0;
  private pending: { c: Cmd; st: number } | null = null;
  private stayX = 0;
  private stayY = 0;
  private stillT = 0;
  /** co-op: ainda mais devagar */
  slow = 1;
  /** motivo da última recusa (para o jogo mostrar um aviso) */
  why: '' | 'tired' | 'nothing' = '';
  /** ingrediente que vai buscar (tarefa 'fetch') */
  private fetchIng = -1;
  /** errinho planejado nesta tarefa */
  private oops = false;
  /** avisos (latido/bip) para o jogo tocar som */
  onBark: ((p: Player, kind: '?' | '!' | 'no' | 'ok' | 'oops') => void) | null = null;

  constructor(
    readonly sim: Sim,
    readonly p: Player,
    private rnd: () => number,
  ) {
    this.path = new Int16Array(sim.cols * sim.rows);
    const list = crews.get(sim) ?? [];
    list.push(this);
    crews.set(sim, list);
  }
  /** outro bot já vai para essa estação? */
  private takenByOther(st: number): boolean {
    for (const b of crews.get(this.sim) ?? []) if (b !== this && b.goal === st && b.action !== A.None) return true;
    return false;
  }

  /** depuração */
  dbg(): string {
    const h = this.p.hold;
    const g = this.goal >= 0 ? this.sim.st[this.goal] : null;
    return `${this.p.role} @${this.p.x.toFixed(1)},${this.p.y.toFixed(1)} hold=${h ? h.k + ':' + h.c + (h.parts.length ? '[' + h.parts + ']' : '') : '-'} goal=${g ? g.k + '(' + g.x + ',' + g.y + ')' : '-'} a=${this.action} asm=${this.assembly} ord=${this.order}`;
  }

  update(dt: number): void {
    const p = this.p;
    const sim = this.sim;
    p.in.pick = false;
    this.think -= dt;
    if (this.wander > 0) {
      this.wander -= dt;
      p.in.act = false;
      return;
    }
    if (this.pet) {
      if (this.react > 0) {
        this.react -= dt;
        p.in.mx = p.in.my = 0;
        p.in.act = false;
        if (this.react <= 0 && this.pending) this.begin(this.pending.c, this.pending.st);
        return;
      }
      if (this.think <= 0) {
        this.think = (0.35 + this.rnd() * 0.3) * this.slow;
        this.petDecide();
      }
      if (this.goal < 0) return this.petIdle(dt);
    } else if (this.think <= 0) {
      this.think = 0.22 + this.rnd() * 0.3;
      this.decide();
      if (this.rnd() < 0.006) {
        // distração rápida (imperfeito!)
        this.wander = 0.5 + this.rnd() * 0.6;
        p.in.mx = this.rnd() * 2 - 1;
        p.in.my = this.rnd() * 2 - 1;
        p.emote = 'rindo';
        p.emoteT = 1.5;
        return;
      }
    }
    // movimento
    if (this.goal < 0) {
      p.in.mx = p.in.my = 0;
      p.in.act = false;
      p.force = -1;
      return;
    }
    const s = sim.st[this.goal];
    if (this.pathFor !== this.goal) this.plan(s);
    const tx = Math.floor(p.x);
    const ty = Math.floor(p.y);
    if (this.pathLen > 0 && tx + ty * sim.cols === this.path[this.pathLen - 1] && Math.hypot(s.x + 0.5 - p.x, s.y + 0.5 - p.y) < 1.3) this.pathI = this.pathLen;
    const atEnd = this.pathI >= this.pathLen;
    if (!atEnd) {
      const cell = this.path[this.pathI];
      const cx = (cell % sim.cols) + 0.5;
      const cy = Math.floor(cell / sim.cols) + 0.5;
      const dx = cx - p.x;
      const dy = cy - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.18 || (this.pathI < this.pathLen - 1 && d < 0.45 && tx + ty * sim.cols === cell)) this.pathI++;
      p.in.mx = dx / (d || 1);
      p.in.my = dy / (d || 1);
      p.in.act = false;
      p.force = -1;
      // preso?
      if (Math.hypot(p.x - this.lastX, p.y - this.lastY) < 0.01) {
        this.stuck += dt;
        if (this.stuck > 0.8) {
          this.stuck = 0;
          this.pathFor = -2;
          p.in.mx = this.rnd() * 2 - 1;
          p.in.my = this.rnd() * 2 - 1;
        }
      } else this.stuck = 0;
      this.lastX = p.x;
      this.lastY = p.y;
      return;
    }
    // chegou: vira para a estação e age
    const fx = s.x + 0.5 - p.x;
    const fy = s.y + 0.5 - p.y;
    const fl = Math.hypot(fx, fy) || 1;
    p.fx = fx / fl;
    p.fy = fy / fl;
    p.in.mx = p.in.my = 0;
    p.force = this.goal;
    if (this.action === A.Pick) {
      if (!this.pressed) {
        // tropeção: às vezes derruba o que carrega
        if (p.hold && p.hold.k === IK.Ing && this.rnd() < 0.025) {
          p.force = -1;
          p.fx = -p.fx;
        }
        p.in.pick = true;
        this.pressed = true;
        this.think = Math.min(this.think, 0.12);
      }
      p.in.act = false;
    } else if (this.action === A.Act) {
      p.in.act = true;
      this.actHold += dt;
    }
  }

  /* =========================== bichinho =========================== */
  /** o jogador deu um comando. st = estação apontada (-1 = a mais adequada). false = não dá. */
  command(c: Cmd, st = -1): boolean {
    const sim = this.sim;
    if (c === 'follow' || c === 'stay') {
      this.idleMode = c;
      this.stayX = this.p.x;
      this.stayY = this.p.y;
      this.pending = { c, st: -1 };
      this.react = 0.5 + this.rnd() * 0.4;
      this.p.pet = '?';
      this.onBark?.(this.p, '?');
      return true;
    }
    // teto de trabalho: ajudantes não fazem mais que BOT_CAP do total
    const tot = sim.workHuman + sim.workBot;
    if ((sim.workBot + 1) / (tot + 1) > BOT_CAP + 0.05 && tot > 2) {
      this.why = 'tired';
      return this.refuse();
    }
    const target = this.findTarget(c, st);
    if (target < 0 && !(c === 'wash' && this.hasDishes())) {
      this.why = 'nothing';
      return this.refuse();
    }
    this.why = '';
    if (c === 'fetch') this.fetchIng = this.wantIng(target);
    this.pending = { c, st: target };
    this.react = (0.8 + this.rnd() * 0.7) * this.slow;
    this.goal = -1;
    this.p.pet = '?';
    this.onBark?.(this.p, '?');
    return true;
  }
  /** há algo para essa ordem agora? (só para o menu ficar claro) */
  available(c: Cmd): boolean {
    if (c === 'follow' || c === 'stay') return true;
    return this.findTarget(c, -1) >= 0 || (c === 'wash' && this.hasDishes());
  }
  private refuse(): boolean {
    this.p.pet = 'no';
    this.p.emoteT = 0;
    this.taskT = -1.2; // mostra "não dá" por um tempinho
    this.onBark?.(this.p, 'no');
    return false;
  }
  private hasDishes(): boolean {
    const sim = this.sim;
    return sim.st.some((s) => (s.k === 'sink' || s.k === 'dirty') && s.n > 0);
  }
  /** alvo válido para o comando (respeita as regras: só o que o JOGADOR fez) */
  private findTarget(c: Cmd, st: number): number {
    const sim = this.sim;
    const ok = (s: Station): boolean => {
      if (!s || s.fire > 0 && c !== 'fire') return false;
      if (c === 'chop') return s.k === 'board' && !!s.item && s.item.k === IK.Ing && sim.nextProc(s.item) === 'chop' && s.claim === 0;
      if (c === 'serve') return (s.k === 'counter' || s.k === 'board') && !!s.item && s.item.k === IK.Plate && s.item.parts.length > 0 && !!sim.matchOrder(s.item.parts) && s.claim === 0;
      if (c === 'fire') return s.fire > 0;
      if (c === 'wash') return (s.k === 'sink' || s.k === 'dirty') && s.n > 0;
      if (c === 'cook') return this.cookable(s);
      if (c === 'fetch') return s.k === 'crate' && this.neededIngs().includes(s.ing);
      return false;
    };
    if (st >= 0 && ok(sim.st[st])) return st;
    const o = this.owner;
    let best = -1;
    let bd = 1e9;
    for (const s of sim.st) {
      if ((!s.fx && !s.fy) || !ok(s)) continue;
      const d = o ? Math.hypot(s.x + 0.5 - o.x, s.y + 0.5 - o.y) : 0;
      if (d < bd) {
        bd = d;
        best = s.i;
      }
    }
    return best;
  }
  /** ingrediente cru/picado numa bancada que precisa ir ao fogo/forno/liquidificador, com o aparelho livre */
  private cookable(s: Station): boolean {
    const sim = this.sim;
    if ((s.k !== 'counter' && s.k !== 'board') || !s.item || s.item.k !== IK.Ing || s.item.burnt || s.fire > 0 || s.claim !== 0) return false;
    const np = sim.nextProc(s.item);
    if (!np || np === 'chop') return false;
    return sim.st.some((q) => COOKERS[q.k] === np && !q.item && q.fire <= 0 && (q.fx || q.fy));
  }
  /** ingredientes que os pedidos abertos ainda pedem */
  private neededIngs(): number[] {
    const out: number[] = [];
    for (const o of this.sim.orders) for (const c of RECIPES[o.r].parts) if (!out.includes(compIng(c))) out.push(compIng(c));
    return out;
  }
  private wantIng(crate: number): number {
    const s = crate >= 0 ? this.sim.st[crate] : null;
    return s ? s.ing : -1;
  }
  private begin(c: Cmd, st: number): void {
    this.pending = null;
    // errinhos de bichinho: às vezes se distrai, às vezes faz pela metade, às vezes pega a coisa errada
    this.oops = this.rnd() < 0.22;
    if (this.oops && (c === 'cook' || c === 'serve' || c === 'wash')) {
      this.oops = false;
      this.wander = 0.9 + this.rnd() * 0.8;
      this.p.in.mx = this.rnd() * 2 - 1;
      this.p.in.my = this.rnd() * 2 - 1;
      this.p.emote = 'rindo';
      this.p.emoteT = 1.6;
    }
    if (this.oops && c === 'fetch') {
      // pega o ingrediente errado (vizinho)
      const crates = this.sim.st.filter((q) => q.k === 'crate' && q.ing !== this.fetchIng && (q.fx || q.fy));
      if (crates.length) {
        const q = crates[Math.floor(this.rnd() * crates.length)];
        st = q.i;
        this.fetchIng = q.ing;
      }
    }
    this.p.pet = '!';
    this.onBark?.(this.p, '!');
    this.taskT = -0.6; // mostra "!" um instante
    if (c === 'follow' || c === 'stay') {
      this.task = '';
      return;
    }
    this.task = c;
    this.taskSt = st;
  }
  private finish(): void {
    this.task = '';
    this.taskSt = -1;
    this.goal = -1;
    this.action = A.None;
    this.p.force = -1;
    this.p.in.act = false;
    this.onBark?.(this.p, 'ok');
  }
  private petDecide(): void {
    const sim = this.sim;
    const p = this.p;
    const h = p.hold;
    if (!this.task) {
      // sem tarefa: larga o que estiver segurando (não fica com nada) e espera
      if (h) return void this.putDown();
      this.goal = -1;
      return;
    }
    this.taskT += 0.4;
    if (this.taskT >= 0) p.pet = this.task;
    if (this.taskT > 40) {
      if (h) return void this.putDown();
      return this.finish(); // desistiu (não achou jeito)
    }
    const st = this.taskSt >= 0 ? sim.st[this.taskSt] : null;
    if (this.task === 'chop') {
      if (h) return void this.putDown();
      if (!st || !st.item || st.item.k !== IK.Ing || sim.nextProc(st.item) !== 'chop') return this.finish();
      if (this.oops && st.item.prog > 0.5) {
        // cansou no meio (você termina!)
        p.emote = 'uau';
        p.emoteT = 1.6;
        this.finish();
        this.onBark?.(p, 'oops');
        return;
      }
      this.setGoal(st.i, A.Act);
      return;
    }
    if (this.task === 'cook') {
      if (h && h.k === IK.Ing) {
        const np = sim.nextProc(h);
        const cooker = this.near((q) => !!np && COOKERS[q.k] === np && !q.item && q.fire <= 0);
        if (cooker < 0) return void this.putDown();
        this.setGoal(cooker, A.Pick);
        return;
      }
      if (h) return void this.putDown();
      if (this.taskT > 1 && (!st || !this.cookable(st))) return this.finish(); // já colocou (ou alguém pegou)
      if (st) this.setGoal(st.i, A.Pick);
      return;
    }
    if (this.task === 'fetch') {
      if (h && h.k === IK.Ing) {
        // leva para a bancada livre mais perto de VOCÊ
        const o = this.owner;
        let best = -1;
        let bd = 1e9;
        for (const q of sim.st) {
          if (q.k !== 'counter' || q.item || q.fire > 0 || (!q.fx && !q.fy)) continue;
          const d = o ? Math.hypot(q.x + 0.5 - o.x, q.y + 0.5 - o.y) : 0;
          if (d < bd) {
            bd = d;
            best = q.i;
          }
        }
        if (best < 0) return void this.putDown();
        this.setGoal(best, A.Pick);
        return;
      }
      if (h) return void this.putDown();
      if (this.taskT > 1.5 && this.goal >= 0 && sim.st[this.goal].k === 'counter') {
        this.finish(); // entregou
        if (this.oops) this.onBark?.(p, 'oops'); // ...o ingrediente errado
        return;
      }
      const crate = st && st.k === 'crate' ? st.i : this.near((q) => q.k === 'crate' && q.ing === this.fetchIng);
      if (crate < 0) return this.finish();
      this.setGoal(crate, A.Pick);
      return;
    }
    if (this.task === 'serve') {
      if (h && h.k === IK.Plate) {
        if (!sim.matchOrder(h.parts)) return void this.putDown();
        this.setGoal(this.near((s) => s.k === 'window' || s.k === 'belt'), A.Pick);
        return;
      }
      if (h) return void this.putDown();
      if (this.taskT > 1 && (!st || !st.item || st.item.k !== IK.Plate)) return this.finish(); // entregou (ou alguém pegou)
      if (st) this.setGoal(st.i, A.Pick);
      return;
    }
    if (this.task === 'wash') {
      if (!this.washJob()) {
        if (h) return void this.putDown();
        return this.finish();
      }
      return;
    }
    if (this.task === 'fire') {
      const fire = this.near((s) => s.fire > 0);
      if (fire < 0) {
        if (h && h.k === IK.Ext) return void this.putDown();
        return this.finish();
      }
      if (h && h.k === IK.Ext) return this.setGoal(fire, A.Act);
      if (h) return void this.putDown();
      if (this.extHeldByOther()) return this.finish();
      const ext = this.near((s) => !!s.item && s.item.k === IK.Ext);
      if (ext >= 0) return this.setGoal(ext, A.Pick);
      const fl = sim.floor.find((it) => it.k === IK.Ext);
      if (fl) return this.goFloor(fl);
      return this.finish();
    }
  }
  /** esperando: segue o dono ou fica parado; parado muito tempo → senta/dorme (fofo) */
  private petIdle(dt: number): void {
    const p = this.p;
    const o = this.owner;
    if (this.task) return; // indo pegar algo no chão (goFloor) — mantém o rumo
    p.in.act = false;
    p.force = -1;
    if (this.taskT < 0) {
      this.taskT += dt;
      if (this.taskT >= 0) p.pet = '';
    }
    let tx = this.stayX;
    let ty = this.stayY;
    let near = 0.25;
    if (this.idleMode === 'follow' && o) {
      tx = o.x - o.fx * 1.3;
      ty = o.y - o.fy * 1.3;
      near = 1.1;
    }
    const dx = tx - p.x;
    const dy = ty - p.y;
    const d = Math.hypot(dx, dy);
    if (d > near && this.sim.isFloor(tx, ty)) {
      p.in.mx = (dx / d) * Math.min(1, d);
      p.in.my = (dy / d) * Math.min(1, d);
      this.stillT = 0;
      if (this.taskT >= 0) p.pet = this.idleMode === 'follow' ? 'follow' : 'stay';
    } else {
      p.in.mx = p.in.my = 0;
      this.stillT += dt;
      if (this.taskT >= 0) p.pet = this.stillT > 9 ? 'sleep' : this.stillT > 4 ? 'sit' : this.idleMode === 'follow' ? 'follow' : 'stay';
      if (o && this.stillT > 0.3) {
        const fx = o.x - p.x;
        const fy = o.y - p.y;
        const fl = Math.hypot(fx, fy) || 1;
        p.fx = fx / fl;
        p.fy = fy / fl;
      }
    }
  }
  /** ícone de estado: tarefa atual */
  get state(): string {
    return this.task || this.p.pet;
  }

  private setGoal(st: number, a: A): void {
    if (st !== this.goal || a !== this.action) {
      this.goal = st;
      this.action = a;
      this.pressed = false;
      this.actHold = 0;
    } else if (a === A.Pick) this.pressed = false;
  }

  /* --------------------------- caminho (BFS na grade) --------------------------- */
  private bfsDist = new Int16Array(0);
  private bfsPrev = new Int16Array(0);
  private bfsQ = new Int16Array(0);
  private plan(s: Station): void {
    const sim = this.sim;
    const N = sim.cols * sim.rows;
    if (this.bfsDist.length !== N) {
      this.bfsDist = new Int16Array(N);
      this.bfsPrev = new Int16Array(N);
      this.bfsQ = new Int16Array(N);
      this.path = new Int16Array(N);
    }
    const dist = this.bfsDist;
    const prev = this.bfsPrev;
    const q = this.bfsQ;
    dist.fill(-1);
    const start = Math.floor(this.p.y) * sim.cols + Math.floor(this.p.x);
    let qh = 0;
    let qt = 0;
    q[qt++] = start;
    dist[start] = 0;
    prev[start] = -1;
    let found = -1;
    let bestScore = 1e9;
    while (qh < qt) {
      const c = q[qh++];
      const cx = c % sim.cols;
      const cy = (c / sim.cols) | 0;
      // adjacente à estação?
      if (Math.abs(cx - s.x) + Math.abs(cy - s.y) === 1) {
        const sc = dist[c];
        if (sc < bestScore) {
          bestScore = sc;
          found = c;
        }
      }
      if (dist[c] > bestScore) break;
      for (let k = 0; k < 4; k++) {
        const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= sim.cols || ny >= sim.rows) continue;
        const ni = ny * sim.cols + nx;
        if (dist[ni] >= 0 || sim.grid[ni] !== 0) continue;
        dist[ni] = dist[c] + 1;
        prev[ni] = c;
        q[qt++] = ni;
      }
    }
    this.pathFor = s.i;
    this.pathLen = 0;
    this.pathI = 0;
    if (found < 0) {
      this.goal = -1;
      return;
    }
    // reconstrói (inverte)
    let c = found;
    let n = 0;
    while (c >= 0 && c !== start) {
      this.path[n++] = c;
      c = prev[c];
    }
    for (let i = 0; i < n >> 1; i++) {
      const t = this.path[i];
      this.path[i] = this.path[n - 1 - i];
      this.path[n - 1 - i] = t;
    }
    // inclui o centro da própria célula de destino
    this.pathLen = n;
    if (n === 0) {
      this.path[0] = start;
      this.pathLen = 1;
    }
  }

  /* --------------------------- decisões --------------------------- */
  private near(filter: (s: Station) => boolean): number {
    const p = this.p;
    let best = -1;
    let bd = 1e9;
    for (const s of this.sim.st) {
      if ((!s.fx && !s.fy) || !filter(s)) continue;
      if (s.k !== 'crate' && s.k !== 'plates' && s.k !== 'window' && s.k !== 'trash' && s.k !== 'sink' && s.k !== 'dirty' && this.takenByOther(s.i)) continue;
      const d = Math.abs(s.x + 0.5 - p.x) + Math.abs(s.y + 0.5 - p.y);
      if (d < bd) {
        bd = d;
        best = s.i;
      }
    }
    return best;
  }
  private freeCounter(): number {
    return this.near((s) => s.k === 'counter' && !s.item && s.fire <= 0);
  }
  private putDown(): boolean {
    const h = this.p.hold;
    if (!h) return false;
    if (h.k === IK.Ing && h.burnt) {
      this.setGoal(this.near((s) => s.k === 'trash'), A.Pick);
      return true;
    }
    if (h.k === IK.Dirty) {
      this.setGoal(this.near((s) => s.k === 'sink' && s.fire <= 0), A.Pick);
      return true;
    }
    const c = this.freeCounter();
    if (c >= 0) this.setGoal(c, A.Pick);
    else this.setGoal(this.near((s) => s.k === 'trash'), A.Pick);
    return true;
  }

  private decide(): void {
    const sim = this.sim;
    const p = this.p;
    const h = p.hold;
    const role = p.role;
    // 0) item queimado na mão → lixo
    if (h && h.k === IK.Ing && h.burnt) return void this.putDown();
    // 1) fogo
    const fire = this.near((s) => s.fire > 0);
    const firefighter = role === 'washer' || role === 'cook' || !sim.players.some((q) => q.bot && q.role === 'washer');
    if (fire >= 0 && firefighter) {
      if (h && h.k === IK.Ext) {
        // vai até perto do fogo e segura o jato
        const s = sim.st[fire];
        const adj = this.near((x) => x.fire <= 0 && Math.abs(x.x - s.x) + Math.abs(x.y - s.y) <= 2) >= 0;
        void adj;
        this.setGoal(fire, A.Act);
        return;
      }
      if (!this.extHeldByOther()) {
        if (h) return void this.putDown();
        const ext = this.near((s) => !!s.item && s.item.k === IK.Ext);
        if (ext >= 0) return this.setGoal(ext, A.Pick);
        const fl = sim.floor.find((it) => it.k === IK.Ext);
        if (fl) return this.goFloor(fl);
      }
    }
    if (h && h.k === IK.Ext) return void this.putDown();
    // 1b) algo quase queimando (ou já queimado) no fogo → qualquer um socorre
    if (!h || h.k === IK.Plate) {
      for (const s of sim.st) {
        const proc = COOKERS[s.k];
        const it = s.item;
        if (!proc || !it || it.k !== IK.Ing || s.fire > 0 || this.takenByOther(s.i)) continue;
        if (it.burnt || (sim.nextProc(it) !== proc && it.over > 4.5)) {
          if (h && it.burnt) continue;
          this.setGoal(s.i, A.Pick);
          return;
        }
      }
    }
    // 2) papéis
    if (role === 'washer') {
      if (this.washJob()) return;
      if (this.rescueJob()) return;
      return this.idle();
    }
    if (role === 'server') {
      if (this.serveReadyJob()) return;
      if (this.rescueJob()) return;
      if (this.washJob(true)) return;
      return this.idle();
    }
    if (role === 'chopper') {
      if (this.chopJob()) return;
      if (this.rescueJob()) return;
      return this.idle();
    }
    // cozinheiro
    if (this.orderJob()) return;
    if (this.washJob(true)) return;
    this.idle();
  }

  private extHeldByOther(): boolean {
    return this.sim.players.some((q) => q !== this.p && q.hold?.k === IK.Ext);
  }
  private goFloor(it: Item): void {
    // vai até o item e aperta pegar perto dele (sem estação alvo)
    const p = this.p;
    const dx = it.x - p.x;
    const dy = it.y - p.y;
    const d = Math.hypot(dx, dy);
    this.goal = -1;
    if (d < 0.6) {
      p.in.pick = true;
      return;
    }
    p.in.mx = dx / d;
    p.in.my = dy / d;
  }
  private idle(): void {
    if (this.p.hold) return void this.putDown();
    this.goal = -1;
    this.action = A.None;
  }

  /** lavar louça */
  private washJob(onlyIfNeeded = false): boolean {
    const sim = this.sim;
    const h = this.p.hold;
    const sink = sim.st.find((s) => s.k === 'sink');
    const dirty = sim.st.find((s) => s.k === 'dirty');
    const plates = sim.st.find((s) => s.k === 'plates');
    if (!sink) return false;
    if (onlyIfNeeded && plates && plates.n > 0) return false;
    if (h && h.k === IK.Dirty) {
      this.setGoal(sink.i, A.Pick);
      return true;
    }
    if (sink.n > 0 && sink.fire <= 0) {
      if (h) return this.putDown();
      this.setGoal(sink.i, A.Act);
      return true;
    }
    if (dirty && dirty.n > 0) {
      if (h) return this.putDown();
      this.setGoal(dirty.i, A.Pick);
      return true;
    }
    return false;
  }

  /** tira comida pronta do fogo antes de queimar */
  private rescueJob(): boolean {
    const sim = this.sim;
    const h = this.p.hold;
    for (const s of sim.st) {
      const proc = COOKERS[s.k];
      if (!proc || !s.item || s.item.k !== IK.Ing || s.item.burnt || s.fire > 0) continue;
      if (sim.nextProc(s.item) === proc || s.item.over < 2.5) continue;
      if (h && h.k !== IK.Plate) return this.putDown();
      this.setGoal(s.i, A.Pick);
      return true;
    }
    // segurando ingrediente pronto: leva a um prato que precise dele
    if (h && h.k === IK.Ing) {
      const plate = this.near((s) => !!s.item && s.item.k === IK.Plate && this.plateWants(s.item, h.c));
      if (plate >= 0) {
        this.setGoal(plate, A.Pick);
        return true;
      }
      return this.putDown();
    }
    if (h && h.k === IK.Plate) return this.putDown();
    return false;
  }

  /** prato em bancada que já bate com um pedido → janela */
  private serveReadyJob(): boolean {
    const sim = this.sim;
    const h = this.p.hold;
    const win = this.near((s) => s.k === 'window' || s.k === 'belt');
    if (h && h.k === IK.Plate && h.parts.length && sim.matchOrder(h.parts)) {
      this.setGoal(win, A.Pick);
      return true;
    }
    for (const s of sim.st) {
      if (s.k === 'counter' && s.item && s.item.k === IK.Plate && s.item.parts.length && sim.matchOrder(s.item.parts)) {
        if (h) return this.putDown();
        this.setGoal(s.i, A.Pick);
        return true;
      }
    }
    return false;
  }

  /** picador: deixa componentes picados prontos */
  private chopJob(): boolean {
    const sim = this.sim;
    const h = this.p.hold;
    if (h && h.k === IK.Ing) {
      if (sim.nextProc(h) === 'chop') {
        const b = this.near((s) => s.k === 'board' && !s.item && s.fire <= 0);
        if (b >= 0) {
          this.setGoal(b, A.Pick);
          return true;
        }
      }
      const plate = this.near((s) => !!s.item && s.item.k === IK.Plate && this.plateWants(s.item, h.c));
      if (plate >= 0) {
        this.setGoal(plate, A.Pick);
        return true;
      }
      return this.putDown();
    }
    if (h) return this.putDown();
    // tábua com algo para picar
    const board = this.near((s) => s.k === 'board' && !!s.item && s.item.k === IK.Ing && sim.nextProc(s.item) === 'chop');
    if (board >= 0) {
      this.setGoal(board, A.Act);
      return true;
    }
    // algo picado esperando na tábua → tira (libera a tábua)
    const ready = this.near((s) => s.k === 'board' && !!s.item && s.item.k === IK.Ing && sim.nextProc(s.item) !== 'chop');
    if (ready >= 0 && this.rnd() < 0.6) {
      this.setGoal(ready, A.Pick);
      return true;
    }
    // o que falta picar nos pedidos?
    let loose = 0;
    for (const s of sim.st) if (s.k === 'counter' && s.item && s.item.k === IK.Ing) loose++;
    if (loose >= 3) return false;
    for (const o of sim.orders) {
      for (const c of RECIPES[o.r].parts) {
        const g = INGS[compIng(c)];
        const route = g.routes[compRoute(c)];
        if (!compStage(c) || route[0] !== 'chop') continue;
        if (this.existsLoose(c)) continue;
        const crate = this.near((s) => s.k === 'crate' && s.ing === compIng(c));
        if (crate >= 0) {
          this.setGoal(crate, A.Pick);
          return true;
        }
      }
    }
    return false;
  }
  private existsLoose(c: number): boolean {
    const sim = this.sim;
    for (const s of sim.st) {
      const it = s.item;
      if (!it) continue;
      if (it.k === IK.Ing && compIng(it.c) === compIng(c) && !it.burnt) return true;
      if (it.k === IK.Plate && it.parts.includes(c)) return true;
    }
    for (const q of sim.players) if (q.hold && q.hold.k === IK.Ing && compIng(q.hold.c) === compIng(c)) return true;
    return false;
  }
  private plateWants(plate: Item, c: number): boolean {
    if (plate.parts.length >= 4 || plate.parts.includes(c)) return false;
    for (const o of this.sim.orders) {
      const parts = RECIPES[o.r].parts;
      if (!parts.includes(c)) continue;
      let ok = true;
      for (const x of plate.parts) if (!parts.includes(x)) ok = false;
      if (ok) return true;
    }
    return false;
  }

  /** cozinheiro: faz um pedido inteiro */
  private orderJob(): boolean {
    const sim = this.sim;
    const p = this.p;
    const h = p.hold;
    // escolhe pedido
    let o = sim.orders.find((x) => x.id === this.order);
    if (!o) {
      o = sim.orders.find((x) => !x.claim) ?? sim.orders[0];
      if (!o) {
        this.order = 0;
        return false;
      }
      this.order = o.id;
      o.claim = p.id;
    }
    const parts = RECIPES[o.r].parts;
    // valida montagem
    if (this.assembly >= 0) {
      const a = sim.st[this.assembly];
      const ok = a.item && a.item.k === IK.Plate && a.item.parts.every((x) => parts.includes(x)) && a.fire <= 0;
      if (!ok && !(h && h.k === IK.Plate)) this.assembly = -1;
    }
    const plate = this.assembly >= 0 ? sim.st[this.assembly].item : null;
    // segurando prato
    if (h && h.k === IK.Plate) {
      if (h.parts.length && sim.matchOrder(h.parts)) {
        this.setGoal(this.near((s) => s.k === 'window' || s.k === 'belt'), A.Pick);
        return true;
      }
      if (h.parts.some((x) => !parts.includes(x))) {
        this.setGoal(this.near((s) => s.k === 'trash'), A.Pick);
        return true;
      }
      // pousa na bancada mais perto do fogão/tábua (montagem)
      const c = this.freeCounter();
      if (c >= 0) {
        this.assembly = c;
        this.setGoal(c, A.Pick);
        return true;
      }
      return false;
    }
    const missing = plate ? parts.filter((x) => !plate.parts.includes(x)) : parts;
    if (plate && missing.length === 0) {
      if (h) return this.putDown();
      this.setGoal(this.assembly, A.Pick);
      return true;
    }
    // segurando ingrediente
    if (h && h.k === IK.Ing) {
      const want = missing.find((c) => compIng(c) === compIng(h.c));
      if (want === undefined) return this.putDown();
      const hs = compStage(h.c);
      if (hs > 0 && compRoute(h.c) !== compRoute(want)) return this.putDown();
      if (hs < compStage(want)) {
        const route = INGS[compIng(want)].routes[compRoute(want)];
        const np = route[hs];
        const kind = np === 'chop' ? 'board' : np === 'boil' ? 'pot' : np === 'fry' ? 'pan' : np === 'bake' ? 'oven' : 'blender';
        const st = this.near((s) => s.k === kind && !s.item && s.fire <= 0);
        if (st >= 0) this.setGoal(st, A.Pick);
        else this.goal = -1; // espera a estação liberar
        return true;
      }
      if (!plate) {
        return this.putDown();
      }
      this.setGoal(this.assembly, A.Pick);
      return true;
    }
    if (h) return this.putDown();
    // mãos livres
    if (!plate) {
      // pega prato limpo
      const pl = this.near((s) => s.k === 'plates' && s.n > 0);
      if (pl >= 0) {
        this.setGoal(pl, A.Pick);
        return true;
      }
      const emptyPlate = this.near((s) => s.k === 'counter' && !!s.item && s.item.k === IK.Plate && s.item.parts.every((x) => parts.includes(x)));
      if (emptyPlate >= 0) {
        this.assembly = emptyPlate;
        return this.orderJob();
      }
      return this.washJob();
    }
    // algo já em preparo (meu ou solto) que serve?
    for (const s of sim.st) {
      const it = s.item;
      if (!it || it.k !== IK.Ing || it.burnt || s.fire > 0) continue;
      const want = missing.find((c) => compIng(c) === compIng(it.c) && (compStage(it.c) === 0 || compRoute(c) === compRoute(it.c)) && compStage(it.c) <= compStage(c));
      if (want === undefined) continue;
      if (COOKERS[s.k]) {
        if (it.c === want) {
          this.setGoal(s.i, A.Pick); // pronto: tira
          return true;
        }
        continue;
      }
      if (s.k === 'board' && sim.nextProc(it) === 'chop' && compStage(it.c) < compStage(want)) {
        if (this.takenByOther(s.i)) continue;
        this.setGoal(s.i, A.Act);
        return true;
      }
      if (this.takenByOther(s.i)) continue;
      this.setGoal(s.i, A.Pick);
      return true;
    }
    // pega da caixa o próximo que falta (que ninguém esteja cozinhando)
    for (const c of missing) {
      if (this.cookingSomewhere(c)) continue;
      const crate = this.near((s) => s.k === 'crate' && s.ing === compIng(c));
      if (crate >= 0) {
        this.setGoal(crate, A.Pick);
        return true;
      }
    }
    // tudo cozinhando: espera perto do fogão que termina primeiro
    for (const s of sim.st) if (s.item && s.item.k === IK.Ing && COOKERS[s.k] && missing.some((c) => compIng(c) === compIng(s.item!.c))) {
      this.goal = -1;
      this.p.in.mx = this.p.in.my = 0;
      return true;
    }
    return false;
  }
  private cookingSomewhere(c: number): boolean {
    for (const s of this.sim.st) if (s.item && s.item.k === IK.Ing && !s.item.burnt && compIng(s.item.c) === compIng(c) && (COOKERS[s.k] || s.k === 'board')) return true;
    return false;
  }
}
