/* ============================================================
 *  COZINHA MALUCA — online com amigos (até 5) via presença.
 *  Host-autoritativo e simples: o humano com menor `h` (número
 *  aleatório) é o host. Cada cliente manda seu estado (~5/s); o host
 *  junta pedidos, estações, bots e mãos de todos num registro numérico.
 *  Clientes só movem o próprio boneco e repetem o que o host manda.
 *  Sem humanos → só bots locais (a presença nem precisa de rede).
 * ============================================================ */
import type { PeerState, PresenceSession } from '../../services/presence-api';
import type { Role, UpId } from './data';
import { IK, type Item, type Player, type Sim } from './sim';

const UPS: UpId[] = ['stove', 'knife', 'counters', 'dining', 'washer', 'conveyor', 'sprinkler', 'shoes', 'decor'];
export interface HostCfg {
  day: number;
  seed: number;
  crew: number;
  ups: Record<UpId, number>;
  packs: number[];
  portrait: boolean;
  go: number;
}

/** código numérico de um item (0 = nada) */
function itemCode(it: Item | null): number {
  if (!it) return 0;
  return it.k + 1 + it.c * 8 + (it.burnt ? 1 << 20 : 0) + Math.min(15, it.n) * (1 << 21);
}
function partsCode(it: Item | null): number {
  if (!it || !it.parts.length) return 0;
  let v = 0;
  for (let i = 0; i < it.parts.length && i < 4; i++) v = v * 1024 + (it.parts[i] + 1);
  return v;
}
function decodeInto(sim: Sim, code: number, parts: number, prev: Item | null): Item | null {
  if (!code) return null;
  const k = ((code % 8) - 1) as IK;
  const c = Math.floor(code / 8) % (1 << 17);
  const burnt = !!(Math.floor(code / (1 << 20)) % 2);
  const n = Math.floor(code / (1 << 21));
  const it = prev && prev.k === k ? prev : sim.newItem(k, c);
  it.c = c;
  it.burnt = burnt;
  it.n = n;
  it.parts.length = 0;
  let p = parts;
  while (p > 0) {
    it.parts.unshift((p % 1024) - 1);
    p = Math.floor(p / 1024);
  }
  return it;
}

type Load = () => Promise<{ joinPresence?: (id: string, o?: { botsIfAlone?: number; seed?: number }) => Promise<PresenceSession> }>;

export class Net {
  ses: PresenceSession | null = null;
  readonly h = 1 + Math.floor(Math.random() * 9e6);
  humans: PeerState[] = [];
  private out: Record<string, number> = {};
  private sendT = 0;
  private pickN = 0;
  /** host visto pela última vez (estado) */
  hostState: Record<string, number> | null = null;
  onChange: (() => void) | null = null;
  closed = false;

  async connect(code: string): Promise<boolean> {
    try {
      const mods = import.meta.glob('../../services/presence.ts');
      const load = Object.values(mods)[0] as Load | undefined;
      if (!load) return false;
      const mod = await load().catch(() => null);
      if (!mod?.joinPresence || this.closed) return false;
      const room = 'cozinha' + (code ? '-' + code.replace(/[^0-9a-z]/gi, '').slice(0, 8).toLowerCase() : '');
      const s = await mod.joinPresence(room, { botsIfAlone: 0 });
      if (this.closed) {
        s.leave();
        return false;
      }
      this.ses = s;
      s.onPeers((peers) => {
        this.humans.length = 0;
        for (const p of peers) if (!p.bot && this.humans.length < 4) this.humans.push(p);
        let host: PeerState | null = null;
        for (const p of this.humans) if (p.s.H && (p.s.h ?? 1e9) < this.h && (!host || p.s.h < host.s.h)) host = p;
        this.hostState = host ? host.s : null;
        this.onChange?.();
      });
      return s.online;
    } catch {
      return false;
    }
  }
  get online(): boolean {
    return !!this.ses?.online;
  }
  /** sou host? (nenhum humano com h menor) */
  isHost(): boolean {
    for (const p of this.humans) if ((p.s.h ?? 1e9) < this.h) return false;
    return true;
  }
  leave(): void {
    this.closed = true;
    this.ses?.leave();
    this.ses = null;
  }
  emote(code: string): void {
    this.ses?.emote(code);
  }

  /* ------------------------------ saguão ------------------------------ */
  sendLobby(cfg: HostCfg | null, dt: number): void {
    this.sendT -= dt;
    if (this.sendT > 0 || !this.ses) return;
    this.sendT = 0.4;
    const o = this.out;
    for (const k in o) delete o[k];
    o.h = this.h;
    if (cfg && this.isHost()) this.putCfg(o, cfg);
    this.ses.send(o);
  }
  private putCfg(o: Record<string, number>, c: HostCfg): void {
    o.H = 1;
    o.D = c.day;
    o.Sd = c.seed;
    o.Cr = c.crew;
    o.go = c.go;
    o.Pt = c.portrait ? 1 : 0;
    let u = 0;
    for (let i = UPS.length - 1; i >= 0; i--) u = u * 8 + Math.min(7, c.ups[UPS[i]]);
    o.U = u;
    let pk = 0;
    for (const p of c.packs) pk |= 1 << p;
    o.Pk = pk;
  }
  static readCfg(s: Record<string, number>): HostCfg | null {
    if (!s.H) return null;
    const ups = {} as Record<UpId, number>;
    let u = s.U ?? 0;
    for (const k of UPS) {
      ups[k] = u % 8;
      u = Math.floor(u / 8);
    }
    const packs: number[] = [];
    for (let i = 0; i < 16; i++) if ((s.Pk ?? 1) & (1 << i)) packs.push(i);
    return { day: s.D ?? 1, seed: s.Sd ?? 1, crew: s.Cr ?? 1, ups, packs, portrait: !!s.Pt, go: s.go ?? 0 };
  }

  /* ------------------------------ partida ------------------------------ */
  /** cliente apertou pegar */
  notePick(): void {
    this.pickN++;
  }
  /** envia (host: mundo inteiro; cliente: só eu) */
  sendGame(sim: Sim, me: Player, cfg: HostCfg, dt: number): void {
    this.sendT -= dt;
    if (this.sendT > 0 || !this.ses) return;
    this.sendT = 0.2;
    const o = this.out;
    for (const k in o) delete o[k];
    o.h = this.h;
    o.x = Math.round(me.x * 100) / 100;
    o.y = Math.round(me.y * 100) / 100;
    o.fx = Math.round(me.fx * 100) / 100;
    o.fy = Math.round(me.fy * 100) / 100;
    o.pk = this.pickN;
    o.ac = me.in.act ? 1 : 0;
    if (this.isHost()) {
      this.putCfg(o, cfg);
      o.T = Math.round(sim.time * 10);
      o.C = sim.cash;
      o.Sv = sim.served;
      o.Ms = sim.missed;
      o.on = sim.orders.length;
      sim.orders.forEach((od, i) => {
        o['o' + i] = od.r + 1000 * (od.vip ? 1 : 0) + 2000 * od.seat;
        o['t' + i] = Math.round(od.t * 10);
        o['m' + i] = Math.round(od.max);
        o['oi' + i] = od.id;
      });
      sim.st.forEach((s, i) => {
        if (s.item) {
          o['s' + i] = itemCode(s.item);
          const pc = partsCode(s.item);
          if (pc) o['p' + i] = pc;
          if (s.item.prog > 0) o['g' + i] = Math.round(s.item.prog * 99);
        }
        if (s.n) o['n' + i] = s.n;
        if (s.fire > 0) o['f' + i] = Math.round(s.fire * 9) + 1;
        if (s.prog > 0) o['w' + i] = Math.round(s.prog * 99);
      });
      let bi = 0;
      for (const p of sim.players) {
        if (p === me) continue;
        if (p.remote) {
          o['R' + p.hid] = itemCode(p.hold);
          const pc = partsCode(p.hold);
          if (pc) o['RP' + p.hid] = pc;
          continue;
        }
        o['bx' + bi] = Math.round(p.x * 100) / 100;
        o['by' + bi] = Math.round(p.y * 100) / 100;
        o['bf' + bi] = Math.round(Math.atan2(p.fy, p.fx) * 100) / 100;
        o['bh' + bi] = itemCode(p.hold);
        const pc = partsCode(p.hold);
        if (pc) o['bp' + bi] = pc;
        o['br' + bi] = ['cook', 'chopper', 'washer', 'server'].indexOf(p.role);
        bi++;
      }
      o.bn = bi;
      o.hh = itemCode(me.hold);
      const hp = partsCode(me.hold);
      if (hp) o.hp = hp;
    }
    this.ses.send(o);
  }

  /** host: aplica estado dos humanos remotos nos jogadores remotos */
  applyRemotes(sim: Sim, remotes: Map<number, Player>, lastPick: Map<number, number>): void {
    for (const h of this.humans) {
      const s = h.s;
      if (!s.h) continue;
      const p = remotes.get(s.h);
      if (!p) continue;
      if (typeof s.x === 'number') {
        p.x += (s.x - p.x) * 0.35;
        p.y += (s.y - p.y) * 0.35;
        p.fx = s.fx ?? p.fx;
        p.fy = s.fy ?? p.fy;
      }
      const lp = lastPick.get(s.h) ?? s.pk ?? 0;
      p.in.pick = false;
      if ((s.pk ?? 0) > lp) {
        sim.pick(p);
        lastPick.set(s.h, s.pk);
      } else lastPick.set(s.h, lp);
      p.in.act = !!s.ac;
      p.emote = h.emote ?? '';
      p.emoteT = h.emote ? 1 : 0;
    }
  }

  /** cliente: espelha o mundo do host */
  applyHost(sim: Sim, me: Player, others: Map<string, Player>, mkBot: (i: number, role: Role) => Player, mkHuman: (p: PeerState) => Player): void {
    const s = this.hostState;
    if (!s || !s.H) return;
    sim.time = (s.T ?? 0) / 10;
    sim.cash = s.C ?? 0;
    sim.served = s.Sv ?? 0;
    sim.missed = s.Ms ?? 0;
    if (sim.time >= sim.p.len) sim.ended = true;
    const on = s.on ?? 0;
    while (sim.orders.length > on) sim.orders.pop();
    for (let i = 0; i < on; i++) {
      const code = s['o' + i] ?? 0;
      const id = s['oi' + i] ?? i;
      let od = sim.orders[i];
      if (!od || od.id !== id) {
        od = { id, r: 0, t: 0, max: 1, vip: false, claim: 0, seat: 0, a: od && od.id === id ? od.a : 0 };
        sim.orders[i] = od;
      }
      od.r = code % 1000;
      od.vip = Math.floor(code / 1000) % 2 === 1;
      od.seat = Math.floor(code / 2000);
      od.t = (s['t' + i] ?? 0) / 10;
      od.max = s['m' + i] ?? 60;
    }
    sim.st.forEach((st, i) => {
      st.item = decodeInto(sim, s['s' + i] ?? 0, s['p' + i] ?? 0, st.item);
      if (st.item) st.item.prog = (s['g' + i] ?? 0) / 99;
      st.n = s['n' + i] ?? 0;
      st.fire = s['f' + i] ? (s['f' + i] - 1) / 9 + 0.05 : 0;
      st.prog = (s['w' + i] ?? 0) / 99;
    });
    me.hold = decodeInto(sim, s['R' + this.h] ?? 0, s['RP' + this.h] ?? 0, me.hold);
    // bots do host
    const bn = s.bn ?? 0;
    for (let i = 0; i < bn; i++) {
      const key = 'b' + i;
      let p = others.get(key);
      if (!p) {
        p = mkBot(i, (['cook', 'chopper', 'washer', 'server'] as Role[])[s['br' + i] ?? 0] ?? 'cook');
        others.set(key, p);
      }
      const tx = s['bx' + i] ?? p.x;
      const ty = s['by' + i] ?? p.y;
      p.vx = (tx - p.x) * 5;
      p.vy = (ty - p.y) * 5;
      p.x += (tx - p.x) * 0.3;
      p.y += (ty - p.y) * 0.3;
      const a = s['bf' + i] ?? 0;
      p.fx = Math.cos(a);
      p.fy = Math.sin(a);
      p.hold = decodeInto(sim, s['bh' + i] ?? 0, s['bp' + i] ?? 0, p.hold);
    }
    // humanos (inclui o host)
    for (const hp of this.humans) {
      const key = 'h' + (hp.s.h ?? hp.id);
      let p = others.get(key);
      if (!p) {
        p = mkHuman(hp);
        others.set(key, p);
      }
      if (typeof hp.s.x === 'number') {
        p.vx = (hp.s.x - p.x) * 5;
        p.vy = (hp.s.y - p.y) * 5;
        p.x += (hp.s.x - p.x) * 0.3;
        p.y += (hp.s.y - p.y) * 0.3;
        p.fx = hp.s.fx ?? p.fx;
        p.fy = hp.s.fy ?? p.fy;
      }
      p.emote = hp.emote ?? '';
      if (hp.s.H) p.hold = decodeInto(sim, s.hh ?? 0, s.hp ?? 0, p.hold);
      else p.hold = decodeInto(sim, s['R' + hp.s.h] ?? 0, s['RP' + hp.s.h] ?? 0, p.hold);
    }
  }
}
