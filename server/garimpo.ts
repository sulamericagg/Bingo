/**
 * GARIMPO BRUTO online — Durable Object `GarimpoRoom` (binding GARIMPO, SQLite, plano grátis).
 *
 * Dois papéis na mesma classe (como o FlightRoom):
 *  - sala de garimpo (idFromName('room:<CÓDIGO>')): RELÉ entre o anfitrião e até 3 convidados.
 *    O aparelho do anfitrião roda a simulação inteira (terreno, ouro, economia, bots, fogo) com o
 *    save dele; manda o estado inicial a quem entra (semente + diferença do terreno, em partes) e
 *    retratos ~10/s com as edições do terreno em delta. Convidados mandam só entrada/ações.
 *    O servidor não simula nada: repassa, limita tamanho/ritmo e avisa quem entrou/saiu.
 *    Entrar no meio é livre (drop-in) até 4 pessoas. WebSocket com hibernação em /api/garimpo/room/<CÓDIGO>.
 *  - caixa de convites (idFromName('inbox:<id>')): RPC invite()/list() — amigo chamou para garimpar.
 *
 * Protocolo (JSON, campo t):
 *   anfitrião → servidor: qualquer mensagem; com `to` vai só para aquele id, senão para todos os convidados.
 *   convidado → servidor: qualquer mensagem; vai SÓ para o anfitrião, com `from` = id do convidado.
 *   servidor → anfitrião: {t:'join', id, name, skin} {t:'leave', id}
 *   servidor → convidado: {t:'welcome', host, you} | {t:'reject', reason} | {t:'hostLeft'}
 *   reject: bad_code | bad_id | taken | no_room | full
 * Limites: 4 pessoas; anfitrião ≤ 64 KB por mensagem (o terreno inicial vai em partes), convidado ≤ 4 KB
 * e ~40 mensagens/s. Nomes passam por safeName; nada de texto livre além do apelido.
 */
import { DurableObject } from 'cloudflare:workers';
import { hub } from './friends';
import { safeName } from './moderation';
import { cleanName, HttpError, json, PLAYER_ID_RE, readJson } from './util';

export const GARIMPO_MAX = 4;
export const GB_CODE_RE = /^[A-HJ-NP-Z2-9]{5}$/;
const HOST_MAX = 64_000;
const GUEST_MAX = 4_000;
const CLIENT_PER_S = 40;
const INVITE_TTL = 3 * 60_000;
const INVITES_MAX = 10;
const SKIN_RE = /^[a-z0-9_-]{1,24}$/;

interface Att {
  id: string;
  name: string;
  skin: string;
  host: boolean;
}
export interface GbInvite {
  from: string;
  name: string;
  code: string;
  at: number;
}

export class GarimpoRoom extends DurableObject<Env> {
  private rate = new Map<string, { n: number; at: number }>();

  /* ============================== sala ============================== */

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'expected_websocket' }, 426);
    const u = new URL(req.url);
    const code = u.searchParams.get('code') ?? '';
    const id = u.searchParams.get('id') ?? '';
    const create = u.searchParams.get('create') === '1';
    const pair = new WebSocketPair();
    const ws = pair[1];
    this.ctx.acceptWebSocket(ws);
    const fail = (reason: string) => {
      ws.send(JSON.stringify({ t: 'reject', reason }));
      ws.close(1008, reason);
      return new Response(null, { status: 101, webSocket: pair[0] });
    };
    if (!GB_CODE_RE.test(code)) return fail('bad_code');
    if (!PLAYER_ID_RE.test(id)) return fail('bad_id');
    const skin = u.searchParams.get('skin') ?? '';
    const a: Att = { id, name: safeName(cleanName(u.searchParams.get('name') ?? '')) || 'Bloop', skin: SKIN_RE.test(skin) ? skin : 'bloop', host: create };
    const others = this.members().filter((m) => m.ws !== ws);
    const host = others.find((m) => m.a.host);
    if (create) {
      if (host && host.a.id !== id) return fail('taken');
      // sala nova (ou o mesmo anfitrião reconectando): quem estava recomeça
      for (const m of others) this.close(m.ws, 'reset');
      await this.ctx.storage.put('host', id);
    } else {
      if (!host) return fail('no_room');
      for (const m of others) if (m.a.id === id) this.close(m.ws, 'replaced');
      if (this.members().filter((m) => m.ws !== ws && m.a.id !== id).length >= GARIMPO_MAX) return fail('full');
    }
    ws.serializeAttachment(a);
    if (create) ws.send(JSON.stringify({ t: 'welcome', host: id, you: id }));
    else {
      ws.send(JSON.stringify({ t: 'welcome', host: host!.a.id, you: id }));
      this.send(host!.ws, { t: 'join', id: a.id, name: a.name, skin: a.skin });
      // quem garimpou junto pode virar amigo depois (registro do servidor, não forjável)
      this.ctx.waitUntil(hub(this.env).met([host!.a.id, a.id]).catch(() => {}));
    }
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
  private close(ws: WebSocket, reason: string): void {
    try {
      ws.serializeAttachment(null);
      ws.close(1000, reason);
    } catch {
      /* */
    }
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    if (typeof data !== 'string') return;
    const a = ws.deserializeAttachment() as Att | null;
    if (!a) return;
    if (data.length > (a.host ? HOST_MAX : GUEST_MAX)) return;
    if (a.host) {
      // retratos vão sem reserializar; só olha o destinatário
      let to = '';
      const m = /^\{"t":"[a-z]+","to":"([^"]{1,64})"/.exec(data);
      if (m) to = m[1];
      for (const x of this.members()) if (!x.a.host && (!to || x.a.id === to)) this.send(x.ws, data);
      return;
    }
    // convidado → só o anfitrião (limite simples de mensagens por segundo)
    const now = Date.now();
    const r = this.rate.get(a.id) ?? { n: 0, at: now };
    if (now - r.at > 1000) (r.n = 0), (r.at = now);
    if (++r.n > CLIENT_PER_S) return;
    this.rate.set(a.id, r);
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(data);
      if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
    } catch {
      return;
    }
    msg.from = a.id;
    const host = this.members().find((x) => x.a.host);
    if (host) this.send(host.ws, msg);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const a = ws.deserializeAttachment() as Att | null;
    if (!a) return;
    ws.serializeAttachment(null);
    this.rate.delete(a.id);
    if (a.host) {
      // anfitrião saiu: a sala acaba para todos (sem migração de anfitrião)
      for (const m of this.members()) {
        this.send(m.ws, { t: 'hostLeft' });
        this.close(m.ws, 'host_left');
      }
      await this.ctx.storage.deleteAll();
      return;
    }
    const host = this.members().find((m) => m.a.host);
    if (host) this.send(host.ws, { t: 'leave', id: a.id });
  }
  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  /* ============================== convites ============================== */

  async invite(inv: GbInvite): Promise<void> {
    const now = Date.now();
    const list = ((await this.ctx.storage.get<GbInvite[]>('inv')) ?? []).filter((i) => now - i.at < INVITE_TTL && i.from !== inv.from);
    list.push(inv);
    await this.ctx.storage.put('inv', list.slice(-INVITES_MAX));
  }
  async list(): Promise<GbInvite[]> {
    const now = Date.now();
    return ((await this.ctx.storage.get<GbInvite[]>('inv')) ?? []).filter((i) => now - i.at < INVITE_TTL);
  }
}

/* ============================== rotas ============================== */

/** WebSocket: /api/garimpo/room/<CÓDIGO>?id=&name=&skin=&create=1 */
export async function garimpoJoin(req: Request, env: Env, code: string): Promise<Response> {
  if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'expected_websocket', message: 'Use WebSocket' }, 426);
  if (!GB_CODE_RE.test(code)) return json({ error: 'bad_code' }, 400);
  const url = new URL(req.url);
  url.searchParams.set('code', code);
  return env.GARIMPO.get(env.GARIMPO.idFromName('room:' + code)).fetch(new Request(url.toString(), req));
}

/** POST /api/garimpo/invite {id, to, code, name} — só entre amigos */
export async function garimpoInvite(req: Request, env: Env): Promise<Response> {
  const b = await readJson<{ id?: string; to?: string; code?: string; name?: string }>(req);
  const id = String(b.id ?? '');
  const to = String(b.to ?? '');
  const code = String(b.code ?? '');
  if (!PLAYER_ID_RE.test(id) || !PLAYER_ID_RE.test(to) || !GB_CODE_RE.test(code)) throw new HttpError(400, 'bad_request', 'Dados inválidos');
  if (!(await hub(env).areFriends(id, to))) throw new HttpError(403, 'not_friend', 'Só amigos podem chamar');
  await env.GARIMPO.get(env.GARIMPO.idFromName('inbox:' + to)).invite({ from: id, name: safeName(cleanName(b.name ?? '')) || 'Bloop', code, at: Date.now() });
  return json({ ok: true });
}

/** GET /api/garimpo/invites?id= */
export async function garimpoInvites(req: Request, env: Env): Promise<Response> {
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!PLAYER_ID_RE.test(id)) throw new HttpError(400, 'bad_id', 'id inválido');
  return json({ invites: await env.GARIMPO.get(env.GARIMPO.idFromName('inbox:' + id)).list() });
}
