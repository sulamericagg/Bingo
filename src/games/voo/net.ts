/* ============================================================
 *  POUSO FORÇADO — online (2 a 4 celulares).
 *  Modelo: o celular do ANFITRIÃO roda a simulação (sim.ts) e manda
 *  retratos compactos ~12x/s; os CONVIDADOS mandam só a própria
 *  posição/entrada (~15x/s) e ações (ordens, minijogos, flapes...).
 *  O servidor (server/flight.ts, DO FlightRoom) é só um relé por código.
 *  No convidado a sim não roda: o meu boneco anda na hora (previsão) e
 *  o resto é suavizado entre retratos.
 * ============================================================ */
import { wsUrl } from '../../social/net';
import type { EmerKind, ItemKind, SpotId } from './data';
import type { Emer, Ev, Item, NetAct, Outcome, Phase, Sim, Stats } from './sim';

export interface VooNet {
  readonly online: boolean;
  readonly isHost: boolean;
  leave(): void;
}
/** sem rede: tudo local */
export class LocalNet implements VooNet {
  readonly online = false;
  readonly isHost = true;
  leave(): void {}
}

export type NetMsg = Record<string, any> & { t: string };
export interface Me {
  id: string;
  name: string;
  skin: string;
}
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const newCode = (): string => Array.from({ length: 5 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
export const CODE_OK = /^[A-HJ-NP-Z2-9]{5}$/;

/** conexão com a sala de voo (anfitrião ou convidado) */
export class FlightNet implements VooNet {
  readonly online = true;
  hostId = '';
  closed = false;
  private subs = new Map<string, ((m: NetMsg) => void)[]>();
  private closeCbs: ((why: string) => void)[] = [];

  private constructor(
    private ws: WebSocket,
    readonly code: string,
    readonly isHost: boolean,
    readonly me: Me,
  ) {}

  /** abre (cria ou entra); resolve no 'welcome', rejeita com o motivo */
  static open(code: string, create: boolean, me: Me, timeoutMs = 9000): Promise<FlightNet> {
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try {
        const q = new URLSearchParams({ id: me.id, name: me.name.slice(0, 24), skin: /^[a-z0-9_-]{1,24}$/.test(me.skin) ? me.skin : 'bloop', ...(create ? { create: '1' } : {}) });
        ws = new WebSocket(wsUrl(`/voo/room/${code}?${q}`));
      } catch {
        return reject(new Error('offline'));
      }
      const net = new FlightNet(ws, code, create, me);
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          ws.close();
        } catch {
          /* */
        }
        reject(new Error('timeout'));
      }, timeoutMs);
      ws.onmessage = (e) => {
        let m: NetMsg;
        try {
          m = JSON.parse(String(e.data));
        } catch {
          return;
        }
        if (!settled) {
          if (m.t === 'welcome') {
            settled = true;
            clearTimeout(timer);
            net.hostId = String(m.host ?? '');
            resolve(net);
          } else if (m.t === 'reject') {
            settled = true;
            clearTimeout(timer);
            reject(new Error(String(m.reason ?? 'reject')));
          }
          return;
        }
        if (m.t === 'hostLeft') return net.fail('hostLeft');
        for (const cb of net.subs.get(m.t) ?? []) cb(m);
        for (const cb of net.subs.get('*') ?? []) cb(m);
      };
      ws.onclose = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error('offline'));
          return;
        }
        net.fail('closed');
      };
      ws.onerror = () => {
        /* onclose vem em seguida */
      };
    });
  }

  private fail(why: string): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.ws.close();
    } catch {
      /* */
    }
    for (const cb of this.closeCbs) cb(why);
  }
  on(t: string, cb: (m: NetMsg) => void): () => void {
    const l = this.subs.get(t) ?? [];
    l.push(cb);
    this.subs.set(t, l);
    return () => {
      const i = l.indexOf(cb);
      if (i >= 0) l.splice(i, 1);
    };
  }
  onClose(cb: (why: string) => void): () => void {
    this.closeCbs.push(cb);
    return () => {
      const i = this.closeCbs.indexOf(cb);
      if (i >= 0) this.closeCbs.splice(i, 1);
    };
  }
  send(m: NetMsg): void {
    if (this.closed || this.ws.readyState !== 1) return;
    try {
      this.ws.send(JSON.stringify(m));
    } catch {
      /* */
    }
  }
  leave(): void {
    if (this.closed) return;
    this.closed = true;
    this.closeCbs.length = 0;
    try {
      this.ws.close(1000, 'leave');
    } catch {
      /* */
    }
  }
}

/* ============================== retratos ============================== */

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const KINDS: ItemKind[] = ['ext', 'tape', 'water', 'snack', 'bag'];
const EMERS: EmerKind[] = ['fire', 'leak', 'spark', 'pressure', 'door', 'turb', 'panic', 'bird', 'gear'];
const SPOTS_L: SpotId[] = ['pilot', 'copilot', 'elec', 'doorF', 'doorR', 'oven', 'water', 'snack', 'engL', 'engR', 'cabinA', 'cabinB', 'valve', 'cargoFire', 'leak', 'pump', 'gear', 'win'];
const PHASES: Phase[] = ['cruise', 'descent', 'final', 'rollout', 'crash', 'done'];
const ACTS = ['', 'sit', 'spray', 'patch', 'rewire', 'pump', 'valve', 'crank', 'door', 'give', 'hug', 'take', 'pick', 'stow'];
const F_KEYS = ['x', 'z', 'alt', 'hdg', 'spd', 'pitch', 'roll', 'gamma', 'vs', 'thr', 'flaps', 'gear', 'gearPos', 'fuel', 'brg', 'talt', 'dist', 'dev', 'wind'] as const;
/** eventos que o convidado precisa ver/ouvir */
const EV_SEND = new Set(['toast', 'sfx', 'fx', 'jolt', 'bags', 'touch', 'say', 'mini']);

/** anfitrião: retrato do mundo */
export function encodeSnap(s: Sim, seq: number, ev: Ev[]): NetMsg {
  const f = s.f;
  const m: NetMsg = {
    t: 'snap',
    n: seq,
    tm: r2(s.time),
    ph: PHASES.indexOf(s.phase),
    f: [...F_KEYS.map((k) => r3(f[k] as number)), f.eng[0], f.eng[1], f.stall ? 1 : 0, f.loc ? 1 : 0],
    g: [r2(s.hull), r2(s.turb), r2(s.dizzy), s.flicker ? 1 : 0, s.gearStuck ? 1 : 0, SPOTS_L.indexOf(s.doorOpen as SpotId), s.winBroken, s.fixedCount, r2(s.panicAvg), r2(s.acc.x), r2(s.acc.y), r2(s.acc.z), r2(s.ctrl.sx), r2(s.ctrl.sy), r2(s.ctrl.thr)],
    pl: s.players.map((p) => [r2(p.x), r2(p.z), r2(p.yaw), p.hold, p.seated ? 1 : 0, r2(p.stun), p.busy, p.spraying ? 1 : 0, r2(p.actProg), p.bot ? 1 : 0, r2(p.walk), ACTS.indexOf(p.actKind)]),
    it: s.items.filter((i) => i.alive).map((i) => [i.id, KINDS.indexOf(i.kind), r2(i.x), r2(i.y), r2(i.z), r2(i.rot), i.held, r2(i.charge)]),
    em: s.emers.filter((e) => !e.done).map((e) => [e.id, EMERS.indexOf(e.kind), SPOTS_L.indexOf(e.spot), r2(e.x), r2(e.y), r2(e.z), r3(e.sev), r3(e.prog), e.stage, e.win, r2(e.age), r2(e.dur)]),
  };
  if (seq % 2 === 0) m.px = s.pax.map((q) => [Math.round(q.panic * 100), q.standing ? 1 : 0, r2(q.x), r2(q.z), q.happyT > 0 ? 1 : 0]);
  const evs = ev.filter((e) => EV_SEND.has(e.k));
  if (evs.length) m.ev = evs;
  if (s.outcome) m.out = s.outcome;
  if (seq % 10 === 0 || s.phase !== 'cruise') m.st = s.players.map((p) => p.stats);
  return m;
}

const wrapA = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

/** convidado: aplica retratos na sim local (sem rodá-la) e suaviza entre eles */
export class SnapSync {
  private tf: number[] | null = null;
  private tp: number[][] = [];
  private ti = new Map<number, number[]>();
  private lastN = -1;
  /** fechei o minijogo há pouco: ignora o "ocupado" velho do anfitrião */
  miniClosedAt = 0;
  gotFirst = false;

  constructor(private s: Sim) {}

  apply(m: NetMsg): void {
    const s = this.s;
    if (typeof m.n === 'number') {
      if (m.n <= this.lastN && this.lastN - m.n < 1000) return; // fora de ordem
      this.lastN = m.n;
    }
    const first = !this.gotFirst;
    this.gotFirst = true;
    s.phase = PHASES[m.ph] ?? s.phase;
    this.tf = m.f;
    if (first) this.snapFlight();
    const g = m.g as number[];
    s.hull = g[0];
    s.turb = g[1];
    s.dizzy = g[2];
    s.flicker = !!g[3];
    s.gearStuck = !!g[4];
    s.doorOpen = (g[5] >= 0 ? SPOTS_L[g[5]] : '') as SpotId | '';
    s.winBroken = g[6];
    s.fixedCount = g[7];
    s.panicAvg = g[8];
    s.acc.x = g[9];
    s.acc.y = g[10];
    s.acc.z = g[11];
    const me = s.players[s.me];
    if (!me?.seated) {
      // quem pilota é outro: o manche desenhado acompanha o dele
      s.ctrl.sx = g[12];
      s.ctrl.sy = g[13];
      s.ctrl.thr = g[14];
    }
    // jogadores
    this.tp = m.pl;
    (m.pl as number[][]).forEach((a, i) => {
      const p = s.players[i];
      if (!p) return;
      const mine = i === s.me;
      p.hold = a[3];
      const wasSeated = p.seated;
      p.seated = !!a[4];
      p.stun = a[5];
      if (!mine || performance.now() - this.miniClosedAt > 600) p.busy = a[6];
      p.spraying = !!a[7];
      p.actProg = a[8];
      p.bot = !!a[9];
      p.actKind = ACTS[a[11]] ?? '';
      if (mine) {
        // o meu boneco é meu: só corrige se o anfitrião me moveu de verdade (sentar, levantar, tombo longe)
        if (p.seated || wasSeated !== p.seated || Math.hypot(a[0] - p.x, a[1] - p.z) > 2.5) {
          p.x = a[0];
          p.z = a[1];
          if (wasSeated !== p.seated) p.yaw = a[2];
        }
      } else if (first) {
        p.x = a[0];
        p.z = a[1];
        p.yaw = a[2];
      }
    });
    // objetos (mantém os mesmos objetos por id: a vista guarda malhas por id)
    const old = new Map(s.items.map((i) => [i.id, i]));
    const items: Item[] = [];
    for (const a of m.it as number[][]) {
      let it = old.get(a[0]);
      if (!it) {
        it = { id: a[0], kind: KINDS[a[1]], x: a[2], y: a[3], z: a[4], vx: 0, vy: 0, vz: 0, held: a[6], rot: a[5], spin: 0, charge: a[7], alive: true };
      }
      it.held = a[6];
      it.charge = a[7];
      it.alive = true;
      this.ti.set(a[0], a);
      items.push(it);
    }
    s.items = items;
    // emergências
    const oldE = new Map(s.emers.map((e) => [e.id, e]));
    s.emers = (m.em as number[][]).map((a) => {
      const e: Emer = oldE.get(a[0]) ?? { id: a[0], kind: EMERS[a[1]], spot: SPOTS_L[a[2]], x: a[3], y: a[4], z: a[5], sev: 0, prog: 0, stage: 0, age: 0, done: false, dur: 0, hot: 0, win: -1 };
      e.x = a[3];
      e.y = a[4];
      e.z = a[5];
      e.sev = a[6];
      e.prog = a[7];
      e.stage = a[8];
      e.win = a[9];
      e.age = a[10];
      e.dur = a[11];
      e.done = false;
      return e;
    });
    // passageiros (o assento vem da semente: mesma lista dos dois lados)
    if (m.px)
      (m.px as number[][]).forEach((a, i) => {
        const q = s.pax[i];
        if (!q) return;
        q.panic = a[0] / 100;
        q.standing = !!a[1];
        q.x = a[2];
        q.z = a[3];
        q.happyT = a[4] ? 1 : 0;
      });
    if (m.out) s.outcome = m.out as Outcome;
    if (m.st) (m.st as Stats[]).forEach((st, i) => s.players[i] && (s.players[i].stats = st));
    // eventos (toasts, sons, efeitos, minijogo aberto para mim)
    for (const e of (m.ev ?? []) as Ev[]) {
      if (e.k === 'mini') {
        if (e.who === s.me) {
          s.miniOpen = { kind: e.kind, emer: e.emer };
          if (me) me.busy = e.emer;
          this.miniClosedAt = 0;
        }
        continue;
      }
      s.ev.push(e);
    }
  }

  private snapFlight(): void {
    const tf = this.tf;
    if (!tf) return;
    const f = this.s.f as unknown as Record<string, number>;
    F_KEYS.forEach((k, i) => (f[k] = tf[i]));
  }

  /** a cada quadro: aproxima do último retrato */
  smooth(dt: number): void {
    const s = this.s;
    const k = 1 - Math.exp(-dt * 12);
    const tf = this.tf;
    if (tf) {
      const f = s.f as unknown as Record<string, number>;
      F_KEYS.forEach((key, i) => {
        if (key === 'hdg' || key === 'brg') f[key] = wrapA(f[key] + wrapA(tf[i] - f[key]) * k);
        else if (key === 'flaps' || key === 'gear') {
          if (!s.players[s.me]?.seated) f[key] = tf[i];
        } else f[key] += (tf[i] - f[key]) * k;
      });
      const n = F_KEYS.length;
      s.f.eng[0] = tf[n];
      s.f.eng[1] = tf[n + 1];
      s.f.stall = !!tf[n + 2];
      s.f.loc = !!tf[n + 3];
    }
    this.tp.forEach((a, i) => {
      const p = s.players[i];
      if (!p || i === s.me) return;
      const ox = p.x;
      const oz = p.z;
      p.x += (a[0] - p.x) * k;
      p.z += (a[1] - p.z) * k;
      p.yaw += wrapA(a[2] - p.yaw) * k;
      p.vx = (p.x - ox) / Math.max(dt, 1e-3);
      p.vz = (p.z - oz) / Math.max(dt, 1e-3);
      p.walk = a[10];
    });
    const me = s.players[s.me];
    for (const it of s.items) {
      if (me && it.held === me.idx) continue; // na minha mão: segue o meu boneco
      const a = this.ti.get(it.id);
      if (!a) continue;
      it.x += (a[2] - it.x) * k;
      it.y += (a[3] - it.y) * k;
      it.z += (a[4] - it.z) * k;
      it.rot = a[5];
    }
    for (const q of s.pax) q.bob += dt;
    for (const e of s.emers) e.age += dt;
  }
}

/** convidado: pacote de entrada (~15/s) com as ações acumuladas */
export class InputOut {
  private acts: NetAct[] = [];
  private miniAcc = new Map<number, number>();
  private t = 0;
  constructor(
    private s: Sim,
    private net: FlightNet,
  ) {}
  push(a: NetAct): void {
    if (a[0] === 'mini') this.miniAcc.set(a[1], (this.miniAcc.get(a[1]) ?? 0) + a[2]);
    else this.acts.push(a);
    if (a[0] !== 'mini') this.t = 1; // ação discreta: manda já
  }
  tick(dt: number): void {
    this.t += dt;
    if (this.t < 1 / 15) return;
    this.t = 0;
    const s = this.s;
    const p = s.players[s.me];
    if (!p) return;
    for (const [e, amt] of this.miniAcc) this.acts.push(['mini', e, r3(Math.min(0.2, amt))]);
    this.miniAcc.clear();
    const i = s.input;
    this.net.send({
      t: 'in',
      i: [r2(p.x), r2(p.z), r2(p.yaw), r2(i.fx), r2(i.fz), i.act ? 1 : 0, s.tapCount, r2(s.ctrl.sx), r2(s.ctrl.sy), r2(s.ctrl.thr)],
      ...(this.acts.length ? { a: this.acts.splice(0) } : {}),
    });
  }
}

/** anfitrião: recebe entradas/ações dos convidados e manda retratos ~12/s */
export class HostSync {
  private idx = new Map<string, number>();
  private lastTap = new Map<number, number>();
  private evq: Ev[] = [];
  private t = 0;
  private seq = 0;
  private offs: (() => void)[] = [];

  constructor(
    private s: Sim,
    private net: FlightNet,
    ids: string[],
    onLeave: (idx: number) => void,
  ) {
    ids.forEach((id, i) => id && id !== net.me.id && this.idx.set(id, i));
    this.offs.push(
      net.on('in', (m) => {
        const i = this.idx.get(String(m.from));
        const p = i === undefined ? undefined : s.players[i];
        if (!p || p.bot || !Array.isArray(m.i)) return;
        const a = m.i as number[];
        const prev = s.rin.get(p.idx);
        const last = this.lastTap.get(p.idx) ?? a[6];
        this.lastTap.set(p.idx, a[6]);
        s.rin.set(p.idx, { x: +a[0] || 0, z: +a[1] || 0, yaw: +a[2] || 0, fx: +a[3] || 0, fz: +a[4] || -1, act: !!a[5], tap: !!prev?.tap || a[6] > last, sx: Math.max(-1, Math.min(1, +a[7] || 0)), sy: Math.max(-1, Math.min(1, +a[8] || 0)), thr: Math.max(0, Math.min(1, +a[9] || 0)) });
        if (!prev) {
          p.x = +a[0] || p.x;
          p.z = +a[1] || p.z;
        }
        if (Array.isArray(m.a)) for (const act of (m.a as NetAct[]).slice(0, 20)) if (Array.isArray(act)) s.applyAct(p, act);
      }),
      net.on('leave', (m) => {
        const i = this.idx.get(String(m.from ?? m.id));
        if (i === undefined) return;
        this.idx.delete(String(m.id));
        const p = s.players[i];
        if (!p) return;
        // caiu: um ajudante Bloop assume o lugar (e o manche, se estava pilotando)
        p.remote = false;
        p.bot = true;
        p.cmd = p.seated ? { kind: 'pilot' } : null;
        p.busy = -1;
        s.rin.delete(i);
        onLeave(i);
      }),
    );
  }
  capture(ev: Ev[]): void {
    for (const e of ev) if (this.evq.length < 80) this.evq.push(e);
  }
  tick(dt: number, force = false): void {
    this.t += dt;
    if (!force && this.t < 1 / 12) return;
    this.t = 0;
    this.net.send(encodeSnap(this.s, this.seq++, this.evq));
    this.evq.length = 0;
  }
  dispose(): void {
    for (const f of this.offs) f();
  }
}
