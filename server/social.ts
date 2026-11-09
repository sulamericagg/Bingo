/**
 * Rotas públicas do social (perfil + denúncia) e rotas do painel admin
 * (/api/admin/social/*: Moderação + Campeonatos).
 *
 * KV usado:
 *   prof:<id>          perfil público (gravado no máx. 1x a cada 30 min por jogador)
 *   report:<ts>:<rand> denúncia (dados no metadata, expira em 30 dias)
 *   chatban:<id>       banido do chat (valor = motivo)  | chatmute:<id> silenciado (TTL)
 *   chat:words         palavras extras bloqueadas (JSON array)
 */
import { requireAdmin } from './auth';
import { champHub, CHAMP_GAMES, champUnwrap } from './champ';
import { ChatRoom, KNOWN_ROOMS, ROOM_RE } from './chat';
import { banKey, buildExtra, filterMessage, KV_WORDS, loadExtraWords, muteKey, safeName } from './moderation';
import { cleanName, HttpError, json, num, PLAYER_ID_RE, randomId, readJson } from './util';

const text = (v: unknown, max: number) =>
  String(v ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, max);

/* ---------------- perfil ---------------- */

export interface PublicProfile {
  id: string;
  name: string;
  skin: string;
  avatar?: unknown;
  creature?: string;
  level: number;
  bests: Record<string, number>;
  badges: string[];
  t: number;
}

const PROFILE_MIN_MS = 30 * 60_000;

export async function profilePut(req: Request, env: Env): Promise<Response> {
  const b = await readJson(req);
  const id = String(b.id ?? '');
  if (!PLAYER_ID_RE.test(id)) throw new HttpError(400, 'bad_id', 'Jogador inválido.');
  const prev = await env.DATA.getWithMetadata<{ t: number }>('prof:' + id);
  if (prev.metadata && Date.now() - prev.metadata.t < PROFILE_MIN_MS && !b.force) return json({ ok: true, throttled: true });
  const bests: Record<string, number> = {};
  if (b.bests && typeof b.bests === 'object')
    for (const [k, v] of Object.entries(b.bests as Record<string, unknown>).slice(0, 12)) if (/^[a-z0-9-]{1,24}$/.test(k)) bests[k] = num(v, 1e9);
  let avatar: unknown;
  try {
    if (b.avatar && JSON.stringify(b.avatar).length <= 1200) avatar = b.avatar;
  } catch {
    /* */
  }
  const extra = buildExtra(await loadExtraWords(env));
  const p: PublicProfile = {
    id,
    name: safeName(cleanName(b.name) || 'Bloop', extra),
    skin: text(b.skin, 24) || 'bloop',
    ...(avatar ? { avatar } : {}),
    ...(b.creature ? { creature: text(b.creature, 40) } : {}),
    level: num(b.level, 9999),
    bests,
    badges: Array.isArray(b.badges) ? (b.badges as unknown[]).slice(0, 24).map((x) => text(x, 24)) : [],
    t: Date.now(),
  };
  await env.DATA.put('prof:' + id, JSON.stringify(p), { metadata: { t: p.t } });
  return json({ ok: true });
}

export async function profileGet(req: Request, env: Env): Promise<Response> {
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!PLAYER_ID_RE.test(id)) throw new HttpError(400, 'bad_id', 'Jogador inválido.');
  const p = await env.DATA.get('prof:' + id, 'json');
  if (!p) return json({ error: 'not_found', message: 'Perfil não encontrado.' }, 404);
  return json(p);
}

/* ---------------- denúncia ---------------- */

export async function chatReport(req: Request, env: Env): Promise<Response> {
  const b = await readJson(req);
  const reporter = String(b.reporter ?? '');
  const pid = String(b.pid ?? '');
  if (!PLAYER_ID_RE.test(reporter) || !PLAYER_ID_RE.test(pid)) throw new HttpError(400, 'bad_id', 'Jogador inválido.');
  const rl = 'rl:report:' + reporter;
  const n = Number((await env.DATA.get(rl)) ?? 0);
  if (n >= 10) return json({ error: 'rate_limited', message: 'Você já enviou muitas denúncias. Obrigado!' }, 429);
  const meta = {
    reporter,
    pid,
    name: text(b.name, 20),
    text: text(b.text, 90),
    room: ROOM_RE.test(String(b.room)) ? String(b.room) : 'global',
    msgId: text(b.msgId, 16),
    reason: text(b.reason, 20) || 'outro',
    t: Date.now(),
  };
  await env.DATA.put(`report:${Date.now().toString().padStart(14, '0')}:${randomId(6)}`, '1', { metadata: meta, expirationTtl: 30 * 86400 });
  await env.DATA.put(rl, String(n + 1), { expirationTtl: 3600 });
  return json({ ok: true });
}

/* ---------------- admin ---------------- */

const chatRoom = (env: Env, room: string): DurableObjectStub<ChatRoom> => env.CHAT.get(env.CHAT.idFromName(room));

export async function handleSocialAdmin(req: Request, env: Env, url: URL): Promise<Response> {
  await requireAdmin(req, env);
  const path = url.pathname.replace(/^\/api\/admin\/social/, '').replace(/\/+$/, '');
  const m = req.method;

  if (m === 'GET' && path === '/reports') {
    const list = await env.DATA.list<Record<string, unknown>>({ prefix: 'report:', limit: 200 });
    return json({ items: list.keys.map((k) => ({ key: k.name, ...(k.metadata ?? {}) })).reverse() });
  }
  if (m === 'DELETE' && path.startsWith('/reports/')) {
    const key = decodeURIComponent(path.slice('/reports/'.length));
    if (!key.startsWith('report:')) throw new HttpError(400, 'bad_key');
    await env.DATA.delete(key);
    return json({ ok: true });
  }
  if (m === 'GET' && path === '/chat/recent') {
    const room = url.searchParams.get('room') ?? 'global';
    if (!ROOM_RE.test(room)) throw new HttpError(400, 'bad_room');
    return json({ room, ...(await chatRoom(env, room).recent()) });
  }
  if (m === 'POST' && path === '/chat/delete') {
    const b = await readJson(req);
    const room = String(b.room ?? 'global');
    if (!ROOM_RE.test(room)) throw new HttpError(400, 'bad_room');
    const ids = Array.isArray(b.ids) ? (b.ids as unknown[]).map(String).slice(0, 100) : [];
    return json({ removed: await chatRoom(env, room).remove(ids, b.pid ? String(b.pid) : undefined) });
  }
  if (m === 'POST' && (path === '/chat/ban' || path === '/chat/mute')) {
    const b = await readJson(req);
    const pid = String(b.pid ?? '');
    if (!PLAYER_ID_RE.test(pid)) throw new HttpError(400, 'bad_id', 'Jogador inválido.');
    const minutes = num(b.minutes, 60 * 24 * 365);
    const reason = text(b.reason, 80) || '—';
    const ban = path === '/chat/ban';
    const value = JSON.stringify({ reason, t: Date.now(), until: minutes ? Date.now() + minutes * 60_000 : 0 });
    const ttl = minutes ? Math.max(60, minutes * 60) : undefined;
    await env.DATA.put(ban ? banKey(pid) : muteKey(pid), value, ttl ? { expirationTtl: ttl } : {});
    let kicked = 0;
    for (const room of KNOWN_ROOMS) {
      const st = chatRoom(env, room);
      if (ban) {
        kicked += await st.kick(pid);
        if (b.purge) await st.remove([], pid);
      } else await st.forget(pid);
    }
    return json({ ok: true, kicked });
  }
  if (m === 'POST' && path === '/chat/unban') {
    const b = await readJson(req);
    const pid = String(b.pid ?? '');
    if (!PLAYER_ID_RE.test(pid)) throw new HttpError(400, 'bad_id', 'Jogador inválido.');
    await Promise.all([env.DATA.delete(banKey(pid)), env.DATA.delete(muteKey(pid))]);
    for (const room of KNOWN_ROOMS) await chatRoom(env, room).forget(pid);
    return json({ ok: true });
  }
  if (m === 'GET' && path === '/chat/bans') {
    const [bans, mutes] = await Promise.all([env.DATA.list({ prefix: 'chatban:', limit: 500 }), env.DATA.list({ prefix: 'chatmute:', limit: 500 })]);
    const read = async (keys: { name: string }[], prefix: string) =>
      Promise.all(keys.map(async (k) => ({ pid: k.name.slice(prefix.length), ...((await env.DATA.get(k.name, 'json')) as object) })));
    return json({ bans: await read(bans.keys, 'chatban:'), mutes: await read(mutes.keys, 'chatmute:') });
  }
  if (m === 'GET' && path === '/chat/words') return json({ words: await loadExtraWords(env) });
  if (m === 'PUT' && path === '/chat/words') {
    const b = await readJson(req);
    const words = Array.isArray(b.words) ? [...new Set((b.words as unknown[]).map((w) => text(w, 40).toLowerCase()).filter(Boolean))].slice(0, 500) : [];
    await env.DATA.put(KV_WORDS, JSON.stringify(words));
    return json({ words });
  }
  if (m === 'POST' && path === '/chat/test') {
    const b = await readJson(req);
    return json(filterMessage(b.text, buildExtra(await loadExtraWords(env))));
  }

  /* campeonatos */
  if (m === 'GET' && path === '/champs') return json(await champHub(env).adminList());
  if (m === 'POST' && path === '/champs') {
    const b = await readJson(req);
    const name = text(b.name, 40);
    if (!name) throw new HttpError(400, 'bad_name', 'Dê um nome ao campeonato.');
    const games = (Array.isArray(b.games) ? (b.games as unknown[]).map(String) : []).filter((g) => CHAMP_GAMES.includes(g)).slice(0, 3);
    if (!games.length) throw new HttpError(400, 'bad_games', 'Escolha os jogos das rodadas.');
    const startAt = Number(b.startAt);
    if (!Number.isFinite(startAt) || startAt < Date.now() + 1000) throw new HttpError(400, 'bad_start', 'O início precisa ser no futuro.');
    // roundSec (testes) ou roundMinutes (painel)
    const sec = Number(b.roundSec) > 0 ? Math.max(2, Math.min(86400, Number(b.roundSec))) : Math.max(5, Math.min(1440, Number(b.roundMinutes) || 20)) * 60;
    const champ = await champHub(env).adminCreate({
      name,
      games,
      prizeBase: num(b.prizeBase, 1_000_000),
      prizePer: num(b.prizePer, 10_000),
      entry: Math.max(1, Math.min(5, num(b.entry, 5) || 1)),
      startAt,
      roundMs: games.map(() => sec * 1000),
    });
    return json(champ);
  }
  const cm = /^\/champs\/([a-z0-9]{2,20})\/cancel$/.exec(path);
  if (m === 'POST' && cm) return json(champUnwrap(await champHub(env).adminCancel(cm[1])));
  if (m === 'POST' && path === '/champs/regular') {
    const b = await readJson(req);
    return json(await champHub(env).adminRegular(!!b.off));
  }

  return json({ error: 'not_found', message: 'Rota não encontrada' }, 404);
}

