/* ============================================================
 *  JANGADA BLOOP — online (server/raft.ts, DO RaftRoom): relé por código
 *  de 5 letras, até 4 Bloops. O ANFITRIÃO manda no mundo (jangada, restos,
 *  tubarão, fantasma, hora, clima, ilhas); cada um simula o próprio Bloop.
 *  Mensagens (campo t):
 *   'p'    {x,y,z,yaw,pitch,h,sw,a}  posição do jogador (10 Hz, todos)
 *   'act'  {o,...}                   pedido ao anfitrião (pegar resto, construir, usar peça...)
 *   'give' {b}                       anfitrião → um jogador: itens
 *   's'    {...}                     anfitrião → todos: hora/clima/tubarão/fantasma/ilha (5 Hz)
 *   'raft' {r}                       anfitrião → todos: jangada inteira (quando muda)
 *   'dAdd' {l} / 'dDel' {ids}        restos boiando
 *   'fx'   {k,x,y,z}                 sons/efeitos
 *   'init' {...}                     anfitrião → quem entrou: o mundo todo
 * ============================================================ */
import { wsUrl } from '../../social/net';

export type NetEvent = Record<string, unknown> & { t: string };

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
export interface JNet {
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

class WsNet implements JNet {
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
export function createNet(code: string, how: 'create' | 'join' | 'auto', me: Me, timeoutMs = 9000): Promise<JNet> {
  return new Promise((resolve, reject) => {
    let ws: WebSocket;
    try {
      const q = new URLSearchParams({ id: me.id, name: me.name.slice(0, 24), skin: /^[a-z0-9_-]{1,24}$/.test(me.skin) ? me.skin : 'bloop' });
      if (how === 'create') q.set('create', '1');
      if (how === 'auto') q.set('auto', '1');
      ws = new WebSocket(wsUrl(`/raft/room/${code}?${q}`));
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
