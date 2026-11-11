/**
 * POUSO FORÇADO online — Durable Object `FlightRoom` (binding FLIGHT, SQLite, plano grátis).
 *
 * Dois papéis na mesma classe (como o RaceRoom):
 *  - sala de voo  (idFromName('room:<CÓDIGO>')): um RELÉ entre o anfitrião e até 3 convidados.
 *    O celular do anfitrião roda a simulação (sim.ts) e manda retratos (~12/s); os convidados
 *    mandam só a própria entrada/ações. O servidor não simula nada: só repassa, limita e avisa
 *    quem entrou/saiu. WebSocket com hibernação em /api/voo/room/<CÓDIGO>.
 *  - caixa de convites (idFromName('inbox:<id>')): RPC invite()/list() — amigo chamou para voar.
 *
 * Protocolo (JSON, campo t):
 *   anfitrião → servidor: qualquer mensagem; com `to` vai só para aquele id, senão para todos os
 *                         convidados. {t:'start'} trava a sala (ninguém mais entra).
 *   convidado → servidor: qualquer mensagem; vai SÓ para o anfitrião, com `from` = id do convidado.
 *   servidor → anfitrião: {t:'join', id, name, skin} {t:'leave', id}
 *   servidor → convidado: {t:'welcome', host} | {t:'reject', reason} | {t:'hostLeft'}
 *   reject: bad_code | bad_id | taken | no_room | started | full
 */
import { DurableObject } from 'cloudflare:workers';
import { hub } from './friends';
import { safeName } from './moderation';
import { cleanName, HttpError, json, PLAYER_ID_RE, readJson } from './util';

export const FLIGHT_MAX = 4;
export const CODE_RE = /^[A-HJ-NP-Z2-9]{5}$/;
const MSG_MAX = 24_000;
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
export interface Invite {
  from: string;
  name: string;
  code: string;
  at: number;
}

export class FlightRoom extends DurableObject<Env> {
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
    if (!CODE_RE.test(code)) return fail('bad_code');
    if (!PLAYER_ID_RE.test(id)) return fail('bad_id');
    const skin = u.searchParams.get('skin') ?? '';
    const a: Att = { id, name: safeName(cleanName(u.searchParams.get('name') ?? '')) || 'Bloop', skin: SKIN_RE.test(skin) ? skin : 'bloop', host: create };
    const others = this.members().filter((m) => m.ws !== ws);
    const host = others.find((m) => m.a.host);
    if (create) {
      if (host && host.a.id !== id) return fail('taken');
      // sala nova: destrava e esquece quem estava
      await this.ctx.storage.put('locked', false);
      for (const m of others) this.close(m.ws, 'reset');
    } else {
      if (!host) return fail('no_room');
      if (await this.ctx.storage.get<boolean>('locked')) {
        // quem caiu pode voltar para a mesma vaga (mesmo id) — o anfitrião decide
        if (!(await this.ctx.storage.get<string[]>('ids'))?.includes(id)) return fail('started');
      }
      for (const m of others) if (m.a.id === id) this.close(m.ws, 'replaced');
      if (this.members().filter((m) => m.ws !== ws && m.a.id !== id).length >= FLIGHT_MAX) return fail('full');
    }
    ws.serializeAttachment(a);
    if (create) ws.send(JSON.stringify({ t: 'welcome', host: id, you: id }));
    else {
      ws.send(JSON.stringify({ t: 'welcome', host: host!.a.id, you: id }));
      this.send(host!.ws, { t: 'join', id: a.id, name: a.name, skin: a.skin });
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
    if (typeof data !== 'string' || data.length > MSG_MAX) return;
    const a = ws.deserializeAttachment() as Att | null;
    if (!a) return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(data);
      if (!msg || typeof msg !== 'object') return;
    } catch {
      return;
    }
    if (a.host) {
      if (msg.t === 'start') {
        const ids = this.members().map((m) => m.a.id);
        await this.ctx.storage.put({ locked: true, ids });
        // quem voou junto pode virar amigo depois (registro do servidor, não forjável)
        if (ids.length > 1) this.ctx.waitUntil(hub(this.env).met(ids).catch(() => {}));
      }
      if (msg.t === 'reopen') await this.ctx.storage.put('locked', false);
      const to = typeof msg.to === 'string' ? msg.to : '';
      for (const m of this.members()) if (!m.a.host && (!to || m.a.id === to)) this.send(m.ws, data);
      return;
    }
    // convidado → só o anfitrião (limite simples de mensagens por segundo)
    const now = Date.now();
    const r = this.rate.get(a.id) ?? { n: 0, at: now };
    if (now - r.at > 1000) (r.n = 0), (r.at = now);
    if (++r.n > CLIENT_PER_S) return;
    this.rate.set(a.id, r);
    msg.from = a.id;
    const host = this.members().find((m) => m.a.host);
    if (host) this.send(host.ws, msg);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const a = ws.deserializeAttachment() as Att | null;
    if (!a) return;
    ws.serializeAttachment(null);
    if (a.host) {
      // anfitrião saiu: o voo acaba para todos (sem migração de anfitrião)
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

  async invite(inv: Invite): Promise<void> {
    const now = Date.now();
    const list = ((await this.ctx.storage.get<Invite[]>('inv')) ?? []).filter((i) => now - i.at < INVITE_TTL && !(i.from === inv.from));
    list.push(inv);
    await this.ctx.storage.put('inv', list.slice(-INVITES_MAX));
  }
  async list(): Promise<Invite[]> {
    const now = Date.now();
    return ((await this.ctx.storage.get<Invite[]>('inv')) ?? []).filter((i) => now - i.at < INVITE_TTL);
  }
}

/* ============================== rotas ============================== */

/** WebSocket: /api/voo/room/<CÓDIGO>?id=&name=&skin=&create=1 */
export async function flightJoin(req: Request, env: Env, code: string): Promise<Response> {
  if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'expected_websocket', message: 'Use WebSocket' }, 426);
  if (!CODE_RE.test(code)) return json({ error: 'bad_code' }, 400);
  const url = new URL(req.url);
  url.searchParams.set('code', code);
  return env.FLIGHT.get(env.FLIGHT.idFromName('room:' + code)).fetch(new Request(url.toString(), req));
}

/** POST /api/voo/invite {id, to, code, name} — só entre amigos */
export async function flightInvite(req: Request, env: Env): Promise<Response> {
  const b = await readJson<{ id?: string; to?: string; code?: string; name?: string }>(req);
  const id = String(b.id ?? '');
  const to = String(b.to ?? '');
  const code = String(b.code ?? '');
  if (!PLAYER_ID_RE.test(id) || !PLAYER_ID_RE.test(to) || !CODE_RE.test(code)) throw new HttpError(400, 'bad_request', 'Dados inválidos');
  if (!(await hub(env).areFriends(id, to))) throw new HttpError(403, 'not_friend', 'Só amigos podem chamar');
  await env.FLIGHT.get(env.FLIGHT.idFromName('inbox:' + to)).invite({ from: id, name: safeName(cleanName(b.name ?? '')) || 'Bloop', code, at: Date.now() });
  return json({ ok: true });
}

/** GET /api/voo/invites?id= */
export async function flightInvites(req: Request, env: Env): Promise<Response> {
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!PLAYER_ID_RE.test(id)) throw new HttpError(400, 'bad_id', 'id inválido');
  return json({ invites: await env.FLIGHT.get(env.FLIGHT.idFromName('inbox:' + id)).list() });
}
