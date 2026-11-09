/**
 * Chat kid-safe — Durable Object `ChatRoom` (binding CHAT, SQLite, plano grátis).
 *
 * Uma instância por sala: 'global' e 'game-<id>' (ex.: game-orbit).
 * WebSocket com HIBERNAÇÃO (ctx.acceptWebSocket): sem conversa, o DO dorme e não gasta.
 *
 * Protocolo (JSON):
 *   cliente → { type:'hello', id, name, skin }                 (1ª mensagem)
 *             { type:'say', text }  |  { type:'quick', code }  (atalho rápido: sempre seguro)
 *   servidor → { type:'hist', msgs, online }  { type:'msg', m }  { type:'del', ids }
 *              { type:'reject', reason, message }  { type:'online', n }  { type:'bye', reason }
 *
 * Regras: 80 letras, 1 msg a cada 2 s com rajada de 3, filtro (server/moderation.ts),
 * banidos/silenciados no KV (chatban:<id> / chatmute:<id>), lidos com cache de 60 s.
 */
import { DurableObject } from 'cloudflare:workers';
import { banKey, buildExtra, filterMessage, loadExtraWords, muteKey, REASON_TEXT, safeName, type Extra } from './moderation';
import { cleanName, json, PLAYER_ID_RE, randomId } from './util';

export const QUICK_CODES = ['oi', 'boa', 'gg', 'vamos', 'uau', 'joinha', 'rindo', 'coracao', 'obrigado', 'denovo', 'quase', 'tchau'] as const;
const HIST_MAX = 40;
const RATE_BURST = 3;
const RATE_REFILL_MS = 2000;
const CACHE_MS = 60_000;

export interface ChatMsg {
  id: string;
  pid: string;
  name: string;
  skin: string;
  t: number;
  text?: string;
  q?: string;
}

interface Att {
  pid: string;
  name: string;
  skin: string;
  tokens: number;
  at: number;
}

export const ROOM_RE = /^(global|game-[a-z0-9-]{1,20})$/;

export class ChatRoom extends DurableObject<Env> {
  private hist: ChatMsg[] | null = null;
  private status = new Map<string, { banned: boolean; muted: boolean; at: number }>();
  private extra: { e: Extra; at: number } | null = null;

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'expected_websocket' }, 426);
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  private async history(): Promise<ChatMsg[]> {
    if (!this.hist) this.hist = ((await this.ctx.storage.get<ChatMsg[]>('hist')) ?? []).slice(-HIST_MAX);
    return this.hist;
  }

  private async extraWords(): Promise<Extra> {
    if (!this.extra || Date.now() - this.extra.at > 5 * 60_000) this.extra = { e: buildExtra(await loadExtraWords(this.env)), at: Date.now() };
    return this.extra.e;
  }

  private async userStatus(pid: string): Promise<{ banned: boolean; muted: boolean }> {
    const c = this.status.get(pid);
    if (c && Date.now() - c.at < CACHE_MS) return c;
    const [b, m] = await Promise.all([this.env.DATA.get(banKey(pid)), this.env.DATA.get(muteKey(pid))]);
    const v = { banned: b !== null, muted: m !== null, at: Date.now() };
    this.status.set(pid, v);
    return v;
  }

  private sockets(): WebSocket[] {
    return this.ctx.getWebSockets();
  }

  private broadcast(data: unknown): void {
    const s = JSON.stringify(data);
    for (const ws of this.sockets()) {
      if (!ws.deserializeAttachment()) continue;
      try {
        ws.send(s);
      } catch {
        /* fechado */
      }
    }
  }

  private onlineCount(): number {
    const ids = new Set<string>();
    for (const ws of this.sockets()) {
      const a = ws.deserializeAttachment() as Att | null;
      if (a) ids.add(a.pid);
    }
    return ids.size;
  }

  private reject(ws: WebSocket, reason: keyof typeof REASON_TEXT): void {
    try {
      ws.send(JSON.stringify({ type: 'reject', reason, message: REASON_TEXT[reason] }));
    } catch {
      /* */
    }
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data));
      if (!msg || typeof msg !== 'object') return;
    } catch {
      return;
    }
    let att = ws.deserializeAttachment() as Att | null;
    if (!att) {
      if (msg.type !== 'hello') return;
      const pid = String(msg.id ?? '');
      if (!PLAYER_ID_RE.test(pid)) return ws.close(1008, 'bad_id');
      const st = await this.userStatus(pid);
      if (st.banned) {
        this.reject(ws, 'banned');
        return ws.close(1008, 'banned');
      }
      att = { pid, name: safeName(cleanName(msg.name) || 'Bloop', await this.extraWords()), skin: String(msg.skin ?? 'bloop').slice(0, 24), tokens: RATE_BURST, at: Date.now() };
      ws.serializeAttachment(att);
      ws.send(JSON.stringify({ type: 'hist', msgs: await this.history(), online: this.onlineCount(), you: att.name }));
      this.broadcast({ type: 'online', n: this.onlineCount() });
      return;
    }
    if (msg.type !== 'say' && msg.type !== 'quick') return;

    // limite: balde de 3, recarrega 1 a cada 2 s
    const now = Date.now();
    att.tokens = Math.min(RATE_BURST, att.tokens + (now - att.at) / RATE_REFILL_MS);
    att.at = now;
    if (att.tokens < 1) {
      ws.serializeAttachment(att);
      return this.reject(ws, 'rate');
    }
    att.tokens -= 1;
    ws.serializeAttachment(att);

    const st = await this.userStatus(att.pid);
    if (st.banned) {
      this.reject(ws, 'banned');
      return ws.close(1008, 'banned');
    }
    if (st.muted) return this.reject(ws, 'muted');

    const m: ChatMsg = { id: randomId(10), pid: att.pid, name: att.name, skin: att.skin, t: now };
    if (msg.type === 'quick') {
      const code = String(msg.code ?? '');
      if (!(QUICK_CODES as readonly string[]).includes(code)) return;
      m.q = code;
    } else {
      const r = filterMessage(msg.text, await this.extraWords());
      if (!r.ok) return this.reject(ws, r.reason ?? 'bad');
      m.text = r.text;
    }
    const hist = await this.history();
    hist.push(m);
    if (hist.length > HIST_MAX) hist.splice(0, hist.length - HIST_MAX);
    await this.ctx.storage.put('hist', hist);
    this.broadcast({ type: 'msg', m });
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    ws.serializeAttachment(null);
    try {
      ws.close(1000, 'bye');
    } catch {
      /* */
    }
    this.broadcast({ type: 'online', n: this.onlineCount() });
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  /* ---------------- RPC (painel admin) ---------------- */

  async recent(): Promise<{ msgs: ChatMsg[]; online: number }> {
    return { msgs: await this.history(), online: this.onlineCount() };
  }

  /** Remove mensagens (por id e/ou todas de um jogador) e avisa os clientes. */
  async remove(ids: string[], pid?: string): Promise<number> {
    const hist = await this.history();
    const del = hist.filter((m) => ids.includes(m.id) || (pid && m.pid === pid)).map((m) => m.id);
    if (!del.length) return 0;
    this.hist = hist.filter((m) => !del.includes(m.id));
    await this.ctx.storage.put('hist', this.hist);
    this.broadcast({ type: 'del', ids: del });
    return del.length;
  }

  /** Derruba as conexões de um jogador (banido) e limpa o cache de status. */
  async kick(pid: string): Promise<number> {
    this.status.delete(pid);
    let n = 0;
    for (const ws of this.sockets()) {
      const a = ws.deserializeAttachment() as Att | null;
      if (a?.pid !== pid) continue;
      n++;
      this.reject(ws, 'banned');
      ws.serializeAttachment(null);
      try {
        ws.close(1008, 'banned');
      } catch {
        /* */
      }
    }
    return n;
  }

  async forget(pid: string): Promise<void> {
    this.status.delete(pid);
  }
}

/** GET /api/chat/<sala> (WebSocket) */
export async function chatJoin(req: Request, env: Env, room: string): Promise<Response> {
  if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'expected_websocket', message: 'Use WebSocket' }, 426);
  if (!ROOM_RE.test(room)) return json({ error: 'bad_room' }, 400);
  return env.CHAT.get(env.CHAT.idFromName(room)).fetch(req);
}

/** Salas conhecidas (para o painel/admin derrubar banidos). */
export const KNOWN_ROOMS = ['global', 'game-orbit', 'game-tubo', 'game-rally', 'game-tycoon'];
