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
    if (this.think <= 0) {
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
