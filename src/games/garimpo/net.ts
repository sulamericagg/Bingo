/* ============================================================
 *  GARIMPO BRUTO — conexão com a sala online (server/garimpo.ts, DO GarimpoRoom).
 *  O servidor é só um relé por código de 5 letras: o ANFITRIÃO roda o jogo com o
 *  save dele; os CONVIDADOS mandam entrada/ações e recebem retratos.
 * ============================================================ */
import { wsUrl } from '../../social/net';

export type NetMsg = Record<string, any> & { t: string };
export interface Me {
  id: string;
  name: string;
  skin: string;
}
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const newCode = (): string => Array.from({ length: 5 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
export const CODE_OK = /^[A-HJ-NP-Z2-9]{5}$/;
export const MAX_PLAYERS = 4;

export class GbNet {
  hostId = '';
  closed = false;
  private subs = new Map<string, ((m: NetMsg) => void)[]>();
  private closeCbs: ((why: string) => void)[] = [];
  /** bytes mandados/recebidos (teste/diagnóstico) */
  stats = { tx: 0, rx: 0 };

  private constructor(
    private ws: WebSocket,
    readonly code: string,
    readonly isHost: boolean,
    readonly me: Me,
  ) {}

  /** abre (cria ou entra); resolve no 'welcome', rejeita com o motivo */
  static open(code: string, create: boolean, me: Me, timeoutMs = 9000): Promise<GbNet> {
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try {
        const q = new URLSearchParams({ id: me.id, name: me.name.slice(0, 24), skin: /^[a-z0-9_-]{1,24}$/.test(me.skin) ? me.skin : 'bloop', ...(create ? { create: '1' } : {}) });
        ws = new WebSocket(wsUrl(`/garimpo/room/${code}?${q}`));
      } catch {
        return reject(new Error('offline'));
      }
      const net = new GbNet(ws, code, create, me);
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
        let m: NetMsg;
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
  onClose(cb: (why: string) => void): void {
    this.closeCbs.push(cb);
  }
  /** `t` sempre primeiro (e `to` logo depois): o relé lê o destinatário sem reserializar */
  send(m: NetMsg): void {
    if (this.closed || this.ws.readyState !== 1) return;
    try {
      const s = JSON.stringify(m);
      this.stats.tx += s.length;
      this.ws.send(s);
    } catch {
      /* */
    }
  }
  get buffered(): number {
    return this.ws.bufferedAmount;
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
