/* ============================================================
 *  CAVA & FALA — multijogador ONLINE (server/cava.ts, DO CavaRoom).
 *  O servidor é só um relé por código de 5 letras (até 4 Bloops). O ANFITRIÃO
 *  (quem criou) manda na partida: semente, bots, borda que desmorona, placar e
 *  progresso da vila. Cada aparelho simula o PRÓPRIO Bloop e manda:
 *   - 'state'  {x,y,z,yaw,pct,…}   → posição/porcentagem de cada Bloop (10 Hz; o anfitrião junta os bots)
 *   - 'dig'    {x,y,z,r,p}          → aplicar no terreno dos outros
 *   - 'build'  {a,id,mods,x,y,z,yaw} → montar a engenhoca igual (a = quem montou: jogador ou bot)
 *   - 'fire'   {a,id,mods,o,d}      → jogar espuma/bolha/martelo igual (efeito visual nos outros)
 *   - 'hit'    {target,dx,dy,dz,power,by} → quem atirou decide o acerto; o atingido aplica o empurrão
 *   - 'voice'  {a,text}             → balão com o que o amigo falou
 *   - 'init' / 'ready' / 'go' / 'out' / 'ko' / 'end' / 'crumble' / 'restore' / 'clock' → partida
 *  O terreno é determinístico pela semente: só as edições trafegam.
 * ============================================================ */
import { wsUrl } from '../../social/net';

export type Num3 = [number, number, number];
export type NetEvent =
  | { t: 'dig'; x: number; y: number; z: number; r: number; p: number }
  | { t: 'build'; a: string; id: string; mods: unknown; x: number; y: number; z: number; yaw: number; tp?: Num3 }
  | { t: 'fire'; a: string; id: string; mods: unknown; o: Num3; d: Num3 }
  | { t: 'state'; x: number; y: number; z: number; yaw: number; pitch: number; pct: number; f: number; g: string; bots?: BotState[] }
  | { t: 'hit'; target: string; dx: number; dy: number; dz: number; power: number; by: string }
  | { t: 'voice'; a: string; text: string }
  | { t: 'init'; mode: 'arena' | 'restore'; seed: number; theme?: string; variant?: number; diff?: number; players: { id: string; col: string; hat: string }[]; bots: { id: string; k: number }[]; round: number }
  | { t: 'ready'; round: number }
  | { t: 'go'; round: number; time?: number }
  | { t: 'out'; id: string; by: string }
  | { t: 'ko'; id: string; place: number; by: string }
  | { t: 'end'; places?: Record<string, number>; win?: boolean }
  | { t: 'crumble'; n: number; w?: number }
  | { t: 'restore'; i: number; k: 'pz' | 'ok' }
  | { t: 'clock'; time: number }
  | { t: 'lobby'; mode: 'arena' | 'restore'; theme: string; bots: number; busy?: boolean }
  | { t: 'menu' };

/** id, x, y, z, yaw, pct, flags, gadget */
export type BotState = [string, number, number, number, number, number, number, string];

export interface Peer {
  id: string;
  name: string;
  skin: string;
}
export interface Me {
  id: string;
  name: string;
  skin: string;
}
type Wire = Record<string, unknown> & { t: string; from?: string };

/** gancho que o jogo usa; null = offline */
export interface CavaNet {
  readonly code: string;
  readonly me: Me;
  /** todos na sala, na ordem de chegada (você incluso) */
  readonly peers: Peer[];
  readonly hostId: string;
  readonly isHost: boolean;
  readonly closed: boolean;
  send(e: NetEvent, to?: string): void;
  onEvent(f: (from: string, e: NetEvent) => void): () => void;
  /** entrou/saiu alguém, ou mudou o anfitrião */
  onRoster(f: (why: 'join' | 'leave' | 'host', id: string) => void): () => void;
  onClose(f: (why: string) => void): void;
  close(): void;
}

export const CODE_ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ALPHA = CODE_ALPHA;
export const newCode = (): string => Array.from({ length: 5 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
export const CODE_OK = /^[A-HJ-NP-Z2-9]{5}$/;
export const MAX_PLAYERS = 4;
/** sala do grupo (party) → código de 5 letras fixo (todos do grupo chegam na mesma) */
export function codeFromRoom(room: string): string {
  let h = 2166136261;
  for (let i = 0; i < room.length; i++) h = Math.imul(h ^ room.charCodeAt(i), 16777619);
  let s = '';
  for (let i = 0; i < 5; i++) {
    s += ALPHA[(h >>> 0) % ALPHA.length];
    h = Math.imul(h ^ (h >>> 13), 2246822519);
  }
  return s;
}

class WsNet implements CavaNet {
  peers: Peer[] = [];
  hostId = '';
  closed = false;
  private evs: ((from: string, e: NetEvent) => void)[] = [];
  private ros: ((why: 'join' | 'leave' | 'host', id: string) => void)[] = [];
  private cls: ((why: string) => void)[] = [];
  stats = { tx: 0, rx: 0 };
  constructor(
    private ws: WebSocket,
    readonly code: string,
    readonly me: Me,
  ) {}
  get isHost(): boolean {
    return this.hostId === this.me.id;
  }
  handle(m: Wire): void {
    if (m.t === 'join') {
      const p = { id: String(m.id), name: String(m.name ?? 'Bloop'), skin: String(m.skin ?? 'bloop') };
      this.peers = this.peers.filter((x) => x.id !== p.id);
      this.peers.push(p);
      for (const f of this.ros) f('join', p.id);
      return;
    }
    if (m.t === 'leave') {
      const id = String(m.id);
      this.peers = this.peers.filter((x) => x.id !== id);
      for (const f of this.ros) f('leave', id);
      return;
    }
    if (m.t === 'host') {
      this.hostId = String(m.id);
      for (const f of this.ros) f('host', this.hostId);
      return;
    }
    const from = String(m.from ?? '');
    if (!from) return;
    delete m.from;
    for (const f of [...this.evs]) f(from, m as unknown as NetEvent);
  }
  fail(why: string): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.ws.close();
    } catch {
      /* */
    }
    for (const f of this.cls) f(why);
  }
  send(e: NetEvent, to?: string): void {
    if (this.closed || this.ws.readyState !== 1) return;
    try {
      const s = JSON.stringify(to ? { ...e, to } : e);
      this.stats.tx += s.length;
      this.ws.send(s);
    } catch {
      /* */
    }
  }
  onEvent(f: (from: string, e: NetEvent) => void): () => void {
    this.evs.push(f);
    return () => {
      const i = this.evs.indexOf(f);
      if (i >= 0) this.evs.splice(i, 1);
    };
  }
  onRoster(f: (why: 'join' | 'leave' | 'host', id: string) => void): () => void {
    this.ros.push(f);
    return () => {
      const i = this.ros.indexOf(f);
      if (i >= 0) this.ros.splice(i, 1);
    };
  }
  onClose(f: (why: string) => void): void {
    this.cls.push(f);
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.cls.length = 0;
    try {
      this.ws.close(1000, 'leave');
    } catch {
      /* */
    }
  }
}

/**
 * Abre a sala: 'create' (você é o anfitrião), 'join' (entrar pelo código) ou 'auto' (grupo: cria se não existe).
 * Resolve no 'welcome'; rejeita com o motivo (bad_code, taken, no_room, full, offline, timeout).
 */
export function createNet(code: string, how: 'create' | 'join' | 'auto', me: Me, timeoutMs = 9000): Promise<CavaNet> {
  return new Promise((resolve, reject) => {
    let ws: WebSocket;
    try {
      const q = new URLSearchParams({ id: me.id, name: me.name.slice(0, 24), skin: /^[a-z0-9_-]{1,24}$/.test(me.skin) ? me.skin : 'bloop' });
      if (how === 'create') q.set('create', '1');
      if (how === 'auto') q.set('auto', '1');
      ws = new WebSocket(wsUrl(`/cava/room/${code}?${q}`));
    } catch {
      return reject(new Error('offline'));
    }
    const net = new WsNet(ws, code, me);
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
      const raw = String(e.data);
      net.stats.rx += raw.length;
      let m: Wire;
      try {
        m = JSON.parse(raw);
      } catch {
        return;
      }
      if (!settled) {
        if (m.t === 'welcome') {
          settled = true;
          clearTimeout(timer);
          net.hostId = String(m.host ?? '');
          const ps = Array.isArray(m.peers) ? (m.peers as Peer[]) : [];
          net.peers = [...ps.filter((p) => p.id !== me.id), { id: me.id, name: me.name, skin: me.skin }];
          // anfitrião sempre primeiro
          net.peers.sort((a, b) => (a.id === net.hostId ? -1 : b.id === net.hostId ? 1 : 0));
          resolve(net);
        } else if (m.t === 'reject') {
          settled = true;
          clearTimeout(timer);
          reject(new Error(String(m.reason ?? 'reject')));
        }
        return;
      }
      net.handle(m);
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
