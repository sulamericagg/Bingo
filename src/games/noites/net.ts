/* ============================================================
 *  NOITES — online (até 4) pelo Durable Object `NightsRoom`
 *  (/api/nights/<código>). Host-autoritativo: o host simula e manda
 *  instantâneos ~12/s; convidados mandam posição (~12/s) e ações.
 *  Código da sala = 6 dígitos derivados do id do anfitrião, então
 *  amigos entram pela lista de amigos sem digitar nada.
 * ============================================================ */
import { wsUrl } from '../../social/net';
import type { Action, Bag, Player, Sim } from './sim';
import { validDesign } from './vehicles';

/** código numérico estável de 6 dígitos para um id de jogador */
export function roomCode(id: string): string {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return String(100000 + (h % 900000));
}

export interface Peer {
  id: string;
  name: string;
  skin: string;
  hat: string;
}

type Msg = Record<string, unknown> & { t: string };

export class NightsNet {
  ws: WebSocket | null = null;
  isHost = false;
  myId = '';
  hostId = '';
  open = false;
  closed = false;
  onMsg: ((m: Msg, from?: string) => void) | null = null;
  onClose: ((why: string) => void) | null = null;

  connect(code: string, me: Peer, host: boolean): Promise<'ok' | 'full' | 'no_host' | 'busy' | 'offline'> {
    this.isHost = host;
    this.myId = me.id;
    return new Promise((res) => {
      let done = false;
      const fin = (r: 'ok' | 'full' | 'no_host' | 'busy' | 'offline') => {
        if (done) return;
        done = true;
        clearTimeout(to);
        res(r);
      };
      const to = setTimeout(() => {
        fin('offline');
        try {
          this.ws?.close();
        } catch {
          /* */
        }
      }, 7000);
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl('/nights/' + code));
      } catch {
        return fin('offline');
      }
      this.ws = ws;
      ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', ...me, host }));
      ws.onmessage = (e) => {
        let m: Msg;
        try {
          m = JSON.parse(String(e.data));
        } catch {
          return;
        }
        if (m.t === 'welcome') {
          this.hostId = String(m.host ?? '');
          this.open = true;
          fin('ok');
        } else if (m.t === 'reject') fin((m.reason as 'full' | 'no_host' | 'busy') ?? 'offline');
        else if (m.t === 'g') this.onMsg?.(m.m as Msg, String(m.f));
        else this.onMsg?.(m);
      };
      ws.onclose = () => {
        this.open = false;
        fin('offline');
        if (!this.closed) this.onClose?.('lost');
      };
      ws.onerror = () => fin('offline');
    });
  }
  send(m: unknown): void {
    if (this.ws && this.open && this.ws.readyState === 1) {
      try {
        this.ws.send(JSON.stringify(m));
      } catch {
        /* */
      }
    }
  }
  close(): void {
    this.closed = true;
    try {
      this.ws?.close();
    } catch {
      /* */
    }
    this.ws = null;
  }
}

/* ------------------------------ instantâneos ------------------------------ */
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

type PRow = [string, string, string, string, number, number, number, number, number, number, number, number, Bag, number, number, string, Record<string, string>, Record<string, number>, number, number, number, number, number, string];

export interface SnapState {
  verV: number;
  evSent: number;
  verT: number;
  verS: number;
  verC: number;
  full: number;
}
export function newSnapState(): SnapState {
  return { verV: -1, evSent: 0, verT: -1, verS: -1, verC: -1, full: 0 };
}

export function encode(s: Sim, st: SnapState, full: boolean, extra?: Record<string, unknown>): Record<string, unknown> {
  const o: Record<string, unknown> = {
    t: 's',
    sd: s.seed,
    n: s.night,
    ph: s.phase === 'night' ? 1 : 0,
    c: r1(s.clock),
    tm: r1(s.time),
    f: [r1(s.fire.fuel), s.fire.max, +s.fire.ring, +s.fire.bellows, +s.fire.big, r1(s.fire.outT)],
    st: s.stash,
    b: s.bench,
    cp: +s.compass,
    sv: s.survived,
    rs: s.rescued,
    pf: s.poofs,
    ov: +s.over,
    w: +s.won,
    pl: s.players.map((p): PRow => [p.id, p.name, p.skin, p.hat, +p.bot, r2(p.x), r2(p.z), r2(p.yaw), r2(p.aim), p.hearts, Math.round(p.hunger), Math.round(p.warmth), p.bag, p.axe, p.bonk, p.lampId, p.wear as Record<string, string>, p.inv, +p.lightOn, r1(p.faint), p.carry, r2(p.swing), p.seat, p.cmd]),
    cr: s.creatures.map((c) => [c.id, c.k, r2(c.x), r2(c.z), r1(c.hp), r1(c.max), r2(c.lit), r1(c.drain), r1(c.t)]),
    fl: s.flashes.map((f) => [f.id, r1(f.x), r1(f.z), f.r, r1(f.t), f.k]),
    bb: s.babies.map((b) => [b.st, r2(b.x), r2(b.z), b.by]),
    ev: s.events.filter((e) => e.s > st.evSent),
  };
  st.evSent = s.evHead;
  if (full || st.verT !== s.verTrees) {
    st.verT = s.verTrees;
    const tr: number[] = [];
    s.treeT.forEach((v, i) => v && tr.push(i, v));
    const nd: number[] = [];
    s.nodeT.forEach((v, i) => v && nd.push(i, v));
    o.tr = tr;
    o.nd = nd;
    o.vt = s.verTrees;
  }
  if (full || st.verS !== s.verStruct) {
    st.verS = s.verStruct;
    o.sc = s.structs.map((q) => [q.id, q.k, r2(q.x), r2(q.z), r2(q.r), r1(q.hp), r1(q.burn), q.a, q.b, r1(q.t)]);
    o.vs = s.verStruct;
  }
  if (full || st.verC !== s.verChest) {
    st.verC = s.verChest;
    const ch: number[] = [];
    s.chestOpen.forEach((v, i) => v && ch.push(i));
    o.ch = ch;
    o.vc = s.verChest;
  }
  if (s.vehView.length || s.looseView.length) {
    o.vh = s.vehView.map((v) => [v.id, v.dk, r2(v.x), r2(v.y), r2(v.z), r2(v.q[0]), r2(v.q[1]), r2(v.q[2]), r2(v.q[3]), r1(v.fuel), v.driver, v.riders, r1(v.spin), r2(v.steer), r1(v.speed), v.logs.map(r2)]);
    o.lo = s.looseView.map((l) => [l.id, r1(l.x), r1(l.z)]);
  }
  if (full || st.verV !== s.verVeh) {
    st.verV = s.verVeh;
    const used = new Set(s.vehView.map((v) => v.dk));
    o.vd = Object.fromEntries([...s.designs].filter(([k]) => used.has(k)));
  }
  if (extra) Object.assign(o, extra);
  return o;
}

/** aplica um instantâneo no Sim espelho do convidado. Mantém posição/olhar do próprio boneco. */
export function apply(s: Sim, o: Record<string, any>, myId: string): void {
  s.night = o.n;
  s.phase = o.ph ? 'night' : 'day';
  s.clock = o.c;
  s.time = o.tm;
  const f = o.f as number[];
  s.fire.fuel = f[0];
  s.fire.max = f[1];
  s.fire.ring = !!f[2];
  s.fire.bellows = !!f[3];
  s.fire.big = !!f[4];
  s.fire.outT = f[5];
  s.stash = o.st;
  s.bench = o.b;
  s.compass = !!o.cp;
  s.survived = o.sv;
  s.rescued = o.rs;
  s.poofs = o.pf;
  s.over = !!o.ov;
  s.won = !!o.w;
  const keep = new Map(s.players.map((p) => [p.id, p]));
  s.players = (o.pl as PRow[]).map((r) => {
    let p = keep.get(r[0]);
    if (!p) p = s.addPlayer(r[0], r[1], r[2], r[3], !!r[4]);
    const mine = r[0] === myId;
    p.name = r[1];
    p.skin = r[2];
    p.hat = r[3];
    p.bot = !!r[4];
    if (!mine) {
      p.x = r[5];
      p.z = r[6];
      p.yaw = r[7];
      p.aim = r[8];
      p.lightOn = !!r[18];
    }
    p.hearts = r[9];
    p.hunger = r[10];
    p.warmth = r[11];
    p.bag = r[12];
    p.axe = r[13];
    p.bonk = r[14];
    p.lampId = r[15];
    p.wear = r[16] as Player['wear'];
    p.inv = r[17];
    p.faint = r[19];
    p.carry = r[20];
    if (!mine) p.swing = r[21];
    p.seat = r[22];
    p.cmd = r[23] as Player['cmd'];
    return p;
  });
  s.creatures = (o.cr as number[][]).map((r) => ({ id: r[0], k: r[1], x: r[2], z: r[3], hp: r[4], max: r[5], lit: r[6], drain: r[7], vx: 0, vz: 0, t: r[8], summonT: 0 }));
  s.flashes = (o.fl as any[]).map((r) => ({ id: r[0], x: r[1], z: r[2], r: r[3], t: r[4], dmg: 0, k: r[5] }));
  (o.bb as any[]).forEach((r, i) => {
    const b = s.babies[i];
    if (!b) return;
    b.st = r[0];
    b.x = r[1];
    b.z = r[2];
    b.by = r[3];
  });
  s.vehView = ((o.vh as any[]) ?? []).map((r) => ({ id: r[0], dk: r[1], x: r[2], y: r[3], z: r[4], q: [r[5], r[6], r[7], r[8]] as [number, number, number, number], fuel: r[9], driver: r[10], riders: r[11], spin: r[12], steer: r[13], speed: r[14], logs: r[15] }));
  s.looseView = ((o.lo as any[]) ?? []).map((r) => ({ id: r[0], x: r[1], z: r[2] }));
  if (o.vd) for (const k in o.vd) {
    const d = validDesign(o.vd[k]);
    if (d) s.designs.set(k, d);
  }
  if (o.tr) {
    s.treeT.fill(0);
    const tr = o.tr as number[];
    for (let i = 0; i < tr.length; i += 2) s.treeT[tr[i]] = tr[i + 1];
    s.nodeT.fill(0);
    const nd = o.nd as number[];
    for (let i = 0; i < nd.length; i += 2) s.nodeT[nd[i]] = nd[i + 1];
    s.verTrees = o.vt + 1e6; // força a vista a reconstruir
  }
  if (o.sc) {
    s.structs = (o.sc as any[]).map((r) => ({ id: r[0], k: r[1], x: r[2], z: r[3], r: r[4], hp: r[5], burn: r[6], a: r[7], b: r[8], t: r[9] }));
    s.verStruct = o.vs + 1e6;
  }
  if (o.ch) {
    s.chestOpen.fill(0);
    for (const i of o.ch as number[]) s.chestOpen[i] = 1;
    s.verChest = o.vc + 1e6;
  }
}

export type GuestMsg = { t: 'i'; x: number; z: number; yaw: number; aim: number; l: number; th?: number; sr?: number } | ({ t: 'a' } & Action);
