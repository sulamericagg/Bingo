/**
 * NOITES DO ACAMPAMENTO — Durable Object `NightsRoom` (binding NIGHTS, SQLite, plano grátis).
 * Uma instância por código de sala (6 dígitos). WebSocket com hibernação em /api/nights/<código>.
 * O servidor NÃO simula: só repassa. O anfitrião (host) é a fonte da verdade.
 *
 * Protocolo (JSON):
 *   cliente → {t:'hello', id, name, skin, hat, host:boolean}
 *   servidor → {t:'welcome', you, host, peers} | {t:'reject', reason: 'full'|'no_host'|'busy'|'bad'}
 *   host → {t:'s', ...instantâneo}          → repassado a todos os convidados
 *   convidado → {t:'i'|'a', ...}            → repassado ao host como {t:'g', f:id, m}
 *   servidor → host {t:'join', p} / {t:'leave', id};  → convidados {t:'end'} quando o host sai
 * Limites: 4 pessoas, mensagens ≤ 48 KB (host) / 2 KB (convidado), ~40 msg/s por conexão.
 * Nomes passam por safeName; nada de texto livre além do apelido.
 */
import { DurableObject } from 'cloudflare:workers';
import { safeName } from './moderation';
import { cleanName, json, PLAYER_ID_RE } from './util';

const MAX = 4;
const HOST_MAX_BYTES = 48_000;
const GUEST_MAX_BYTES = 2_000;
const PER_S = 40;
const TOKEN_RE = /^[a-z0-9_-]{1,24}$/;

interface Att {
  id: string;
  name: string;
  skin: string;
  hat: string;
  host: boolean;
}

export class NightsRoom extends DurableObject<Env> {
  private rate = new Map<WebSocket, { n: number; at: number }>();

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'expected_websocket' }, 426);
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  private members(): { ws: WebSocket; a: Att }[] {
    const out: { ws: WebSocket; a: Att }[] = [];
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Att | null;
      if (a) out.push({ ws, a });
    }
    return out;
  }
  private send(ws: WebSocket, data: unknown): void {
    try {
      ws.send(typeof data === 'string' ? data : JSON.stringify(data));
    } catch {
      /* fechado */
    }
  }
  private allowed(ws: WebSocket): boolean {
    const now = Date.now();
    const b = this.rate.get(ws) ?? { n: 0, at: now };
    if (now - b.at > 1000) {
      b.n = 0;
      b.at = now;
    }
    b.n++;
    this.rate.set(ws, b);
    return b.n <= PER_S;
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string') return;
    const me = ws.deserializeAttachment() as Att | null;
    if (raw.length > (me?.host ? HOST_MAX_BYTES : GUEST_MAX_BYTES) && me) return;
    if (!this.allowed(ws)) return;
    if (!me) {
      if (raw.length > GUEST_MAX_BYTES) return this.reject(ws, 'bad');
      let m: Record<string, unknown>;
      try {
        m = JSON.parse(raw);
      } catch {
        return this.reject(ws, 'bad');
      }
      if (m.t !== 'hello' || typeof m.id !== 'string' || !PLAYER_ID_RE.test(m.id)) return this.reject(ws, 'bad');
      const all = this.members();
      const host = all.find((x) => x.a.host);
      const wantHost = m.host === true;
      if (wantHost && host && host.a.id !== m.id) return this.reject(ws, 'busy');
      if (!wantHost && !host) return this.reject(ws, 'no_host');
      // mesmo id reconectando: derruba a conexão antiga
      for (const x of all)
        if (x.a.id === m.id) {
          try {
            x.ws.close(1000, 'replaced');
          } catch {
            /* */
          }
        }
      const others = all.filter((x) => x.a.id !== m.id);
      if (others.length >= MAX) return this.reject(ws, 'full');
      const a: Att = {
        id: m.id,
        name: safeName(cleanName(String(m.name ?? ''))) || 'Bloop',
        skin: TOKEN_RE.test(String(m.skin)) ? String(m.skin) : 'bloop',
        hat: TOKEN_RE.test(String(m.hat)) ? String(m.hat) : 'none',
        host: wantHost,
      };
      ws.serializeAttachment(a);
      this.send(ws, { t: 'welcome', you: a.id, host: wantHost ? a.id : host!.a.id, peers: others.map((x) => x.a) });
      if (!wantHost) this.send(host!.ws, { t: 'join', p: a });
      return;
    }
    if (me.host) {
      // instantâneo do host → todos os convidados (sem reserializar)
      if (!raw.startsWith('{"t":"s"') && !raw.startsWith('{"t":"x"')) return;
      for (const x of this.members()) if (!x.a.host) this.send(x.ws, raw);
      return;
    }
    if (!raw.startsWith('{"t":"i"') && !raw.startsWith('{"t":"a"')) return;
    const host = this.members().find((x) => x.a.host);
    if (host) this.send(host.ws, `{"t":"g","f":${JSON.stringify(me.id)},"m":${raw}}`);
  }

  private reject(ws: WebSocket, reason: string): void {
    this.send(ws, { t: 'reject', reason });
    try {
      ws.close(1000, reason);
    } catch {
      /* */
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.gone(ws);
  }
  async webSocketError(ws: WebSocket): Promise<void> {
    this.gone(ws);
  }
  private gone(ws: WebSocket): void {
    this.rate.delete(ws);
    const a = ws.deserializeAttachment() as Att | null;
    if (!a) return;
    ws.serializeAttachment(null);
    const rest = this.members().filter((x) => x.ws !== ws);
    if (a.host) {
      for (const x of rest) {
        this.send(x.ws, { t: 'end' });
        try {
          x.ws.close(1000, 'host_left');
        } catch {
          /* */
        }
      }
    } else {
      const host = rest.find((x) => x.a.host);
      if (host) this.send(host.ws, { t: 'leave', id: a.id });
    }
  }
}

export async function nightsJoin(req: Request, env: Env, code: string): Promise<Response> {
  if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'expected_websocket', message: 'Use WebSocket' }, 426);
  if (!/^\d{6}$/.test(code)) return json({ error: 'bad_code' }, 400);
  return env.NIGHTS.get(env.NIGHTS.idFromName(code)).fetch(req);
}
