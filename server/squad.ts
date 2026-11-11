/**
 * GRUPO (party de até 4) — Durable Object `SquadRoom` (binding SQUAD, SQLite, plano grátis), uma instância por grupo.
 * Detalhes e contrato do app: docs/PARTY.md.
 *
 *   POST /api/squad/create  { id }                 → { squad, code }   (cria e vira líder)
 *   POST /api/squad/invite  { id, squad, to }      → { result }        (só amigos; respeita "aceitar convites de")
 *   GET  /api/squad/<squad>?id=&code=  (WebSocket) → entra (membro, convidado ou com o código do link/QR)
 *
 * WebSocket (JSON):
 *   cliente → {t:'hello', id, name, skin, avatar?, handle?, code?}  {t:'ready', on}  {t:'chat', text}  {t:'quick', code}
 *             {t:'emote', code}  {t:'kick', id}  {t:'promote', id}  {t:'launch', game, room}  {t:'leave'}  {t:'hb'}
 *             {t:'focus', game, cfg?} (líder: jogo/ajustes que está olhando)  {t:'votemode', on} (líder)  {t:'vote', game}
 *   servidor → {t:'state', s:{id, code, leader, members:[{id,name,handle,skin,avatar?,ready,on}], focus, cfg, vote, votes}, you}
 *              {t:'focus', game, cfg, by}
 *              {t:'chat', m:{id, from, name, text?|q?, at}}  {t:'emote', from, code}  {t:'launch', game, room, by}
 *              {t:'kicked'}  {t:'error', code}  {t:'reject', reason}
 *
 * Membros ficam guardados (reconectar não tira do grupo); quem fica 2 min desconectado sai sozinho (alarme).
 * Chat: mesmo filtro do chat global (shared/moderation), banidos/silenciados do chat não falam, limite de ritmo.
 */
import { DurableObject } from 'cloudflare:workers';
import { banKey, buildExtra, filterMessage, loadExtraWords, muteKey, safeName } from './moderation';
import { QUICK_CODES } from './chat';
import { EMOTE_CODES } from './presence';
import { cleanName, HttpError, json, PLAYER_ID_RE, randomId, readJson } from './util';
import { requireId } from './friends';

export const SQUAD_MAX = 4;
const INVITE_TTL = 20 * 60_000;
const OFFLINE_KICK_MS = 2 * 60_000;
const CHAT_KEEP = 30;
export const SQUAD_RE = /^[a-z0-9]{8,16}$/;

interface Member {
  id: string;
  name: string;
  handle: string;
  skin: string;
  avatar?: unknown;
  ready: boolean;
  /** desconectou em (0 = conectado) */
  off: number;
}
interface ChatMsg {
  id: string;
  from: string;
  name: string;
  text?: string;
  q?: string;
  at: number;
}
interface State {
  id: string;
  code: string;
  leader: string;
  members: Member[];
  invited: Record<string, number>;
  chat: ChatMsg[];
  /** jogo que o líder está olhando no hub (os outros acompanham ao vivo) + ajustes dele */
  focus?: string;
  cfg?: Record<string, string | number>;
  /** votação ligada pelo líder: cada um escolhe um jogo; JOGAR leva o mais votado */
  vote?: boolean;
  votes?: Record<string, string>;
}
interface Att {
  id: string;
  tokens: number;
  at: number;
  muted: boolean;
}

export class SquadRoom extends DurableObject<Env> {
  private st: State | null = null;

  private async load(): Promise<State | null> {
    if (!this.st) this.st = (await this.ctx.storage.get<State>('st')) ?? null;
    return this.st;
  }
  private async save(): Promise<void> {
    if (this.st) await this.ctx.storage.put('st', this.st);
  }

  /* ---------- RPC (rotas HTTP) ---------- */

  async init(id: string, code: string, leader: string): Promise<void> {
    this.st = { id, code, leader, members: [], invited: { [leader]: Date.now() }, chat: [] };
    await this.save();
    await this.ctx.storage.setAlarm(Date.now() + OFFLINE_KICK_MS);
  }

  /** Prepara o convite (quem convida é membro e há vaga). */
  async allowInvite(from: string, to: string): Promise<'ok' | 'not_member' | 'full' | 'already'> {
    const s = await this.load();
    if (!s || !s.members.some((m) => m.id === from)) return 'not_member';
    if (s.members.some((m) => m.id === to)) return 'already';
    if (s.members.length >= SQUAD_MAX) return 'full';
    s.invited[to] = Date.now();
    await this.save();
    return 'ok';
  }
  async dropInvite(to: string): Promise<void> {
    const s = await this.load();
    if (s && s.invited[to]) {
      delete s.invited[to];
      await this.save();
    }
  }

  /* ---------- WebSocket ---------- */

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'expected_websocket' }, 426);
    if (!(await this.load())) return json({ error: 'not_found', message: 'Esse grupo acabou.' }, 404);
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  private sockets(): { ws: WebSocket; a: Att }[] {
    const out: { ws: WebSocket; a: Att }[] = [];
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Att | null;
      if (a) out.push({ ws, a });
    }
    return out;
  }
  private send(ws: WebSocket, m: unknown): void {
    try {
      ws.send(JSON.stringify(m));
    } catch {
      /* */
    }
  }
  private broadcast(m: unknown, except?: WebSocket): void {
    const data = JSON.stringify(m);
    for (const { ws } of this.sockets()) {
      if (ws === except) continue;
      try {
        ws.send(data);
      } catch {
        /* */
      }
    }
  }
  private pub(s: State): unknown {
    const on = new Set(this.sockets().map((x) => x.a.id));
    return {
      id: s.id,
      code: s.code,
      leader: s.leader,
      members: s.members.map((m) => ({ id: m.id, name: m.name, handle: m.handle, skin: m.skin, ...(m.avatar ? { avatar: m.avatar } : {}), ready: m.ready, on: on.has(m.id) })),
      focus: s.focus ?? '',
      cfg: s.cfg ?? {},
      vote: !!s.vote,
      votes: s.votes ?? {},
    };
  }
  private pushState(): void {
    if (this.st) this.broadcast({ t: 'state', s: this.pub(this.st) });
  }

  /** Algum membro bloqueou o outro? (FriendsHub) */
  private async blockedWith(id: string, others: string[]): Promise<boolean> {
    if (!others.length) return false;
    const fh = this.env.FRIENDS.get(this.env.FRIENDS.idFromName('hub'));
    return fh.anyBlocked(id, others).catch(() => false);
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    if (typeof data !== 'string' || data.length > 3000) return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(data);
      if (!msg || typeof msg !== 'object') return;
    } catch {
      return;
    }
    const s = await this.load();
    if (!s) return ws.close(1000, 'gone');
    let a = ws.deserializeAttachment() as Att | null;
    if (!a) {
      if (msg.t !== 'hello') return;
      const id = String(msg.id ?? '');
      if (!PLAYER_ID_RE.test(id)) return ws.close(1008, 'bad_id');
      const member = s.members.find((m) => m.id === id);
      const now = Date.now();
      if (!member) {
        const invited = s.invited[id] && now - s.invited[id] < INVITE_TTL;
        const byCode = typeof msg.code === 'string' && msg.code === s.code;
        if (!invited && !byCode) return this.reject(ws, 'not_invited');
        if (s.members.length >= SQUAD_MAX) return this.reject(ws, 'full');
        if (await this.blockedWith(id, s.members.map((m) => m.id))) return this.reject(ws, 'not_invited');
      }
      const banned = await this.env.DATA.get(banKey(id));
      const muted = !!banned || !!(await this.env.DATA.get(muteKey(id)));
      const extra = buildExtra(await loadExtraWords(this.env));
      let avatar: unknown;
      try {
        if (msg.avatar && JSON.stringify(msg.avatar).length <= 1200) avatar = msg.avatar;
      } catch {
        /* */
      }
      const me: Member = {
        id,
        name: safeName(cleanName(msg.name) || 'Bloop', extra),
        handle: /^[a-z0-9_.]{3,16}$/.test(String(msg.handle ?? '')) ? String(msg.handle) : '',
        skin: String(msg.skin ?? 'bloop').slice(0, 24),
        ...(avatar ? { avatar } : {}),
        ready: member?.ready ?? false,
        off: 0,
      };
      // mesma pessoa em outra aba/aparelho: derruba a conexão antiga
      for (const o of this.sockets()) if (o.a.id === id) o.ws.close(1000, 'replaced');
      if (member) Object.assign(member, me);
      else s.members.push(me);
      if (!s.members.some((m) => m.id === s.leader)) s.leader = id;
      delete s.invited[id];
      a = { id, tokens: 3, at: now, muted };
      ws.serializeAttachment(a);
      await this.save();
      this.send(ws, { t: 'state', s: this.pub(s), you: id });
      this.send(ws, { t: 'hist', msgs: s.chat });
      this.pushState();
      return;
    }
    const me = s.members.find((m) => m.id === a!.id);
    if (!me) {
      this.send(ws, { t: 'kicked' });
      return ws.close(1000, 'kicked');
    }
    const leader = s.leader === me.id;
    switch (msg.t) {
      case 'hb':
        return;
      case 'ready':
        me.ready = !!msg.on;
        await this.save();
        return this.pushState();
      case 'emote': {
        const code = String(msg.code ?? '');
        if (EMOTE_CODES.includes(code)) this.broadcast({ t: 'emote', from: me.id, code });
        return;
      }
      case 'chat':
      case 'quick': {
        const now = Date.now();
        a.tokens = Math.min(3, a.tokens + (now - a.at) / 2000);
        a.at = now;
        if (a.tokens < 1) {
          ws.serializeAttachment(a);
          return this.send(ws, { t: 'reject', reason: 'rate' });
        }
        a.tokens -= 1;
        ws.serializeAttachment(a);
        if (a.muted) return this.send(ws, { t: 'reject', reason: 'muted' });
        const m: ChatMsg = { id: randomId(8), from: me.id, name: me.handle ? '@' + me.handle : me.name, at: now };
        if (msg.t === 'quick') {
          const code = String(msg.code ?? '');
          if (!(QUICK_CODES as readonly string[]).includes(code)) return;
          m.q = code;
        } else {
          const r = filterMessage(msg.text, buildExtra(await loadExtraWords(this.env)));
          if (!r.ok) return this.send(ws, { t: 'reject', reason: r.reason ?? 'bad' });
          m.text = r.text;
        }
        s.chat = [...s.chat, m].slice(-CHAT_KEEP);
        await this.save();
        return this.broadcast({ t: 'chat', m });
      }
      case 'kick':
      case 'promote': {
        const target = String(msg.id ?? '');
        if (!leader || target === me.id || !s.members.some((m) => m.id === target)) return;
        if (msg.t === 'promote') s.leader = target;
        else {
          s.members = s.members.filter((m) => m.id !== target);
          for (const o of this.sockets())
            if (o.a.id === target) {
              this.send(o.ws, { t: 'kicked' });
              o.ws.serializeAttachment(null);
              o.ws.close(1000, 'kicked');
            }
        }
        await this.save();
        return this.pushState();
      }
      case 'focus': {
        // o líder passou para outro jogo / mudou um ajuste: todos veem na hora (sem gravar: é só "ao vivo")
        if (!leader) return;
        const game = String(msg.game ?? '');
        if (!/^[a-z0-9-]{1,24}$/.test(game)) return;
        const cfg: Record<string, string | number> = {};
        if (msg.cfg && typeof msg.cfg === 'object')
          for (const [k, v] of Object.entries(msg.cfg as Record<string, unknown>).slice(0, 8))
            if (/^[a-z0-9_]{1,16}$/i.test(k) && (typeof v === 'number' || (typeof v === 'string' && v.length <= 24))) cfg[k] = v as string | number;
        s.focus = game;
        s.cfg = cfg;
        return this.broadcast({ t: 'focus', game, cfg, by: me.id }, ws);
      }
      case 'votemode': {
        if (!leader) return;
        s.vote = !!msg.on;
        s.votes = {};
        await this.save();
        return this.pushState();
      }
      case 'vote': {
        const game = String(msg.game ?? '');
        if (!s.vote || !/^[a-z0-9-]{1,24}$/.test(game)) return;
        s.votes = { ...(s.votes ?? {}), [me.id]: game };
        await this.save();
        return this.pushState();
      }
      case 'launch': {
        if (!leader) return;
        s.votes = {};
        const game = String(msg.game ?? '');
        const room = String(msg.room ?? '');
        if (!/^[a-z0-9-]{1,24}$/.test(game) || !/^[a-z0-9-]{4,48}$/.test(room)) return;
        for (const m of s.members) m.ready = false;
        await this.save();
        this.broadcast({ t: 'launch', game, room, by: me.id }, ws);
        return this.pushState();
      }
      case 'leave':
        await this.removeMember(me.id);
        ws.serializeAttachment(null);
        return ws.close(1000, 'bye');
    }
  }

  private reject(ws: WebSocket, reason: string): void {
    this.send(ws, { t: 'error', code: reason });
    ws.close(1000, reason);
  }

  private async removeMember(id: string): Promise<void> {
    const s = this.st;
    if (!s) return;
    s.members = s.members.filter((m) => m.id !== id);
    if (s.leader === id && s.members.length) s.leader = (s.members.find((m) => !m.off) ?? s.members[0]).id;
    if (!s.members.length) {
      // grupo vazio: acaba (o link/QR para de funcionar)
      await this.ctx.storage.deleteAll();
      this.st = null;
      return;
    }
    await this.save();
    this.pushState();
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const a = ws.deserializeAttachment() as Att | null;
    ws.serializeAttachment(null);
    const s = await this.load();
    if (!a || !s) return;
    if (this.sockets().some((o) => o.a.id === a.id)) return; // reconectou em outra conexão
    const m = s.members.find((x) => x.id === a.id);
    if (m) {
      m.off = Date.now();
      m.ready = false;
      await this.save();
      this.pushState();
      await this.ctx.storage.setAlarm(Date.now() + OFFLINE_KICK_MS + 1000);
    }
  }
  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  /** Tira quem ficou desconectado tempo demais; grupo sem ninguém conectado some. */
  async alarm(): Promise<void> {
    const s = await this.load();
    if (!s) return;
    const on = new Set(this.sockets().map((x) => x.a.id));
    const now = Date.now();
    for (const m of [...s.members]) if (!on.has(m.id) && (m.off ? now - m.off >= OFFLINE_KICK_MS : true)) await this.removeMember(m.id);
    if (!this.st) return;
    if (!this.st.members.length && !Object.values(this.st.invited).some((t) => now - t < OFFLINE_KICK_MS)) {
      await this.ctx.storage.deleteAll();
      this.st = null;
      return;
    }
    await this.ctx.storage.setAlarm(now + OFFLINE_KICK_MS);
  }
}

const squad = (env: Env, sid: string): DurableObjectStub<SquadRoom> => env.SQUAD.get(env.SQUAD.idFromName('sq:' + sid));

/** POST /api/squad/create { id } → { squad, code } */
export async function squadCreate(req: Request, env: Env): Promise<Response> {
  const id = requireId((await readJson(req)).id);
  const sid = randomId(10);
  const code = randomId(6);
  await squad(env, sid).init(sid, code, id);
  return json({ squad: sid, code });
}

/** POST /api/squad/invite { id, squad, to } → { result: 'sent'|'not_friend'|'off'|'wait'|'full'|'not_member'|'already' } */
export async function squadInvite(req: Request, env: Env): Promise<Response> {
  const b = await readJson(req);
  const id = requireId(b.id);
  const to = requireId(b.to, 'to');
  const sid = String(b.squad ?? '');
  if (!SQUAD_RE.test(sid)) throw new HttpError(400, 'bad_squad', 'Grupo inválido.');
  const sq = squad(env, sid);
  const ok = await sq.allowInvite(id, to);
  if (ok !== 'ok') return json({ result: ok });
  const r = await env.FRIENDS.get(env.FRIENDS.idFromName('hub')).invite(id, to, 'squad', undefined, sid);
  if (r !== 'sent') await sq.dropInvite(to);
  return json({ result: r });
}

/** GET /api/squad/<sid> (WebSocket) */
export async function squadJoin(req: Request, env: Env, sid: string): Promise<Response> {
  if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'expected_websocket', message: 'Use WebSocket' }, 426);
  if (!SQUAD_RE.test(sid)) return json({ error: 'bad_squad' }, 400);
  return squad(env, sid).fetch(req);
}
