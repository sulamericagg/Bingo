/** API do painel admin (/api/admin/*). Todas as rotas exigem token, exceto /login. */
import { CATALOG_BOOSTS, CATALOG_SKINS, CATALOG_TRAILS } from '../shared/catalog';
import { normalizeCode, packIsEmpty, sanitizePack, type RewardPack } from '../shared/reward';
import { handleLogin, requireAdmin } from './auth';
import { adminLeaderboard, adminRemove, adminUnban } from './leaderboard';
import {
  deleteChallenge,
  deleteCode,
  getChallenge,
  getCode,
  getGifts,
  getPlayer,
  getPresets,
  listChallenges,
  listCodes,
  listPlayers,
  pendingGiftsFor,
  putChallenge,
  putCode,
  putGifts,
  putPresets,
  type ChallengeRec,
  type CodeRec,
  type GiftRec,
  type PlayerRow,
} from './store';
import { codeSummary } from './summary';
import { HttpError, json, num, optDate, PLAYER_ID_RE, randomCode, randomId, readJson } from './util';

const DAY = 86_400_000;
const MAX_BATCH = 1000;

const text = (v: unknown, max: number) =>
  String(v ?? '')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);

function requirePack(v: unknown): RewardPack {
  const pack = sanitizePack(v);
  if (packIsEmpty(pack)) throw new HttpError(400, 'empty_pack', 'O pacote está vazio: escolha pelo menos uma recompensa.');
  return pack;
}

function cleanLink(v: unknown): string {
  const s = text(v, 500);
  if (!s) return '';
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error();
    return u.toString();
  } catch {
    throw new HttpError(400, 'bad_link', 'Link inválido. Use um endereço começando com https://');
  }
}

/** Parte "texto" do código digitado no painel: mantém hífens para exibição. */
function displayCode(v: string): string {
  return v
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });

export function shareText(c: Pick<ChallengeRec, 'title' | 'link' | 'code' | 'reward' | 'endsAt'>): string {
  const lines = [
    `🪐 Desafio Bloop Orbit: ${c.title}`,
    c.link ? `🎬 Assista o vídeo: ${c.link}` : `🎬 Assista o vídeo`,
    `🎁 Use o código ${c.code} no Bloop Orbit (Menu → Resgatar código) e ganhe ${codeSummary(c.reward)}!`,
  ];
  if (c.endsAt) lines.push(`⏰ Válido até ${fmtDate(c.endsAt)}.`);
  return lines.join('\n');
}

/* ---------------- Rotas ---------------- */

type Handler = (req: Request, env: Env, params: string[], url: URL) => Promise<Response>;
const routes: [string, RegExp, Handler][] = [];
const route = (method: string, path: string, h: Handler) => routes.push([method, new RegExp('^' + path + '$'), h]);

export async function handleAdminApi(req: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname.replace(/^\/api\/admin/, '') || '/';
  if (path === '/login' && req.method === 'POST') return handleLogin(req, env);
  await requireAdmin(req, env);
  for (const [method, re, h] of routes) {
    if (method !== req.method) continue;
    const m = re.exec(path);
    if (m) return h(req, env, m.slice(1).map(decodeURIComponent), url);
  }
  throw new HttpError(404, 'not_found', 'Rota não encontrada');
}

route('GET', '/me', async () => json({ ok: true }));

route('GET', '/catalog', async () => json({ skins: CATALOG_SKINS, trails: CATALOG_TRAILS, boosts: CATALOG_BOOSTS }));

/* ---- Painel ---- */
route('GET', '/stats', async (_req, env) => {
  const now = Date.now();
  const [players, codes, challenges, gifts] = await Promise.all([listPlayers(env, true), listCodes(env), listChallenges(env, true), getGifts(env, true)]);
  const platforms: Record<string, number> = {};
  for (const p of players) platforms[p.platform || '?'] = (platforms[p.platform || '?'] ?? 0) + 1;
  const top = [...players].sort((a, b) => b.best - a.best).slice(0, 5);
  return json({
    players: players.length,
    active24h: players.filter((p) => now - p.lastSeen < DAY).length,
    active7d: players.filter((p) => now - p.lastSeen < 7 * DAY).length,
    new7d: players.filter((p) => now - p.created < 7 * DAY).length,
    platforms,
    codes: codes.length,
    activeCodes: codes.filter((c) => c.active && (!c.expiresAt || c.expiresAt > now)).length,
    redemptions: codes.reduce((s, c) => s + c.uses, 0),
    challenges: challenges.length,
    activeChallenges: challenges.filter((c) => c.active && (!c.endsAt || c.endsAt > now)).length,
    gifts: gifts.length,
    top,
  });
});

/* ---- Jogadores ---- */
function filterPlayers(rows: PlayerRow[], url: URL): PlayerRow[] {
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
  const days = Number(url.searchParams.get('days') ?? 0);
  const now = Date.now();
  let out = rows;
  if (q) out = out.filter((p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q));
  if (days > 0) out = out.filter((p) => now - p.lastSeen < days * DAY);
  const sort = url.searchParams.get('sort') ?? 'lastSeen';
  const key = (['lastSeen', 'best', 'runs', 'created', 'name'] as const).find((k) => k === sort) ?? 'lastSeen';
  return [...out].sort((a, b) => (key === 'name' ? a.name.localeCompare(b.name) : b[key] - a[key]));
}

route('GET', '/players', async (_req, env, _p, url) => {
  const rows = filterPlayers(await listPlayers(env), url);
  const size = Math.min(200, Math.max(1, Number(url.searchParams.get('size') ?? 50)));
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
  return json({ total: rows.length, page, size, items: rows.slice((page - 1) * size, page * size) });
});

route('GET', '/players/([^/]+)', async (_req, env, [id]) => {
  const p = await getPlayer(env, id);
  if (!p) throw new HttpError(404, 'not_found', 'Jogador não encontrado');
  return json({ player: p, pending: pendingGiftsFor(p, await getGifts(env, true)) });
});

/* ---- Presentes ---- */
route('GET', '/gifts', async (_req, env) => {
  const list = await getGifts(env, true);
  return json({ items: list.map((g) => ({ ...g, to: g.to === 'all' ? 'all' : g.to.length })).sort((a, b) => b.sentAt - a.sentAt) });
});

route('POST', '/gifts', async (req, env) => {
  const body = await readJson(req);
  const reward = requirePack(body.reward);
  const target = body.target ?? {};
  const now = Date.now();
  let to: GiftRec['to'];
  let label: string;
  let count: number;
  if (target.type === 'all') {
    to = 'all';
    count = (await listPlayers(env, true)).length;
    label = 'Todos os jogadores';
  } else if (target.type === 'active') {
    const days = Math.max(1, Math.min(365, num(target.days) || 7));
    to = (await listPlayers(env, true)).filter((p) => now - p.lastSeen < days * DAY).map((p) => p.id);
    count = to.length;
    label = `Ativos nos últimos ${days} dia${days === 1 ? '' : 's'}`;
  } else if (target.type === 'players') {
    to = [...new Set<string>((Array.isArray(target.ids) ? target.ids : []).map(String).filter((id: string) => PLAYER_ID_RE.test(id)))];
    count = to.length;
    label = count === 1 ? '1 jogador selecionado' : `${count} jogadores selecionados`;
  } else {
    throw new HttpError(400, 'bad_target', 'Escolha para quem enviar o presente.');
  }
  if (!count) throw new HttpError(400, 'no_players', 'Nenhum jogador recebe esse presente.');
  if (Array.isArray(to) && to.length > 20000) throw new HttpError(400, 'too_many', 'Muitos jogadores: use "Todos os jogadores".');
  const expiresDays = num(body.expiresDays, 365);
  const gift: GiftRec = {
    id: 'g' + randomId(10),
    title: text(body.title, 60) || reward.title || 'Presente para você!',
    message: text(body.message, 300) || reward.message || '',
    reward,
    sentAt: now,
    expiresAt: expiresDays ? now + expiresDays * DAY : null,
    to,
    label,
    count,
  };
  const list = (await getGifts(env, true)).filter((g) => !g.expiresAt || g.expiresAt > now);
  list.push(gift);
  // Mantém o índice enxuto (é lido a cada sync dos jogadores).
  await putGifts(env, list.sort((a, b) => b.sentAt - a.sentAt).slice(0, 300));
  return json({ gift: { ...gift, to: gift.to === 'all' ? 'all' : gift.to.length }, recipients: count });
});

route('DELETE', '/gifts/([^/]+)', async (_req, env, [id]) => {
  const list = await getGifts(env, true);
  await putGifts(env, list.filter((g) => g.id !== id));
  return json({ ok: true });
});

/* ---- Códigos ---- */
route('GET', '/codes', async (_req, env) => json({ items: await listCodes(env) }));

route('GET', '/codes/([^/]+)', async (_req, env, [k]) => {
  const c = await getCode(env, normalizeCode(k));
  if (!c) throw new HttpError(404, 'not_found', 'Código não encontrado');
  return json({ code: c, summary: codeSummary(c.reward) });
});

function codeOptions(body: Record<string, any>) {
  const startsAt = optDate(body.startsAt);
  const expiresAt = optDate(body.expiresAt);
  if (startsAt && expiresAt && expiresAt <= startsAt) throw new HttpError(400, 'bad_dates', 'A data de fim precisa ser depois do início.');
  return { maxUses: num(body.maxUses, 10_000_000), startsAt, expiresAt, active: body.active !== false, notes: text(body.notes, 200) };
}

async function createOneCode(env: Env, display: string, reward: RewardPack, opts: ReturnType<typeof codeOptions>, extra: Partial<CodeRec> = {}) {
  const key = normalizeCode(display);
  if (key.length < 3) throw new HttpError(400, 'bad_code', 'O código precisa ter pelo menos 3 letras ou números.');
  if (await getCode(env, key)) throw new HttpError(409, 'exists', `O código ${display} já existe.`);
  const rec: CodeRec = { code: display, key, reward, uses: 0, createdAt: Date.now(), recent: [], ...opts, ...extra };
  await putCode(env, rec, codeSummary(reward));
  return rec;
}

route('POST', '/codes', async (req, env) => {
  const body = await readJson(req);
  const reward = requirePack(body.reward);
  const opts = codeOptions(body);
  const count = Math.max(1, num(body.count, MAX_BATCH));
  const prefix = displayCode(String(body.prefix ?? 'BLP')).replace(/-/g, '').slice(0, 8);
  if (count === 1) {
    const display = body.code ? displayCode(String(body.code)) : randomCode(prefix);
    const rec = await createOneCode(env, display, reward, opts);
    return json({ codes: [rec.code], batch: null });
  }
  // Lote: N códigos únicos aleatórios (cada escrita conta no limite diário do KV).
  const batch = randomId(6);
  const set = new Set<string>();
  while (set.size < count) set.add(randomCode(prefix));
  const codes = [...set];
  const now = Date.now();
  const summary = codeSummary(reward);
  for (let i = 0; i < codes.length; i += 50) {
    await Promise.all(
      codes.slice(i, i + 50).map((display) =>
        putCode(env, { code: display, key: normalizeCode(display), reward, uses: 0, createdAt: now, recent: [], batch, ...opts }, summary),
      ),
    );
  }
  return json({ codes, batch });
});

route('PATCH', '/codes/([^/]+)', async (req, env, [k]) => {
  const c = await getCode(env, normalizeCode(k));
  if (!c) throw new HttpError(404, 'not_found', 'Código não encontrado');
  const body = await readJson(req);
  if ('active' in body) c.active = !!body.active;
  if ('maxUses' in body) c.maxUses = num(body.maxUses, 10_000_000);
  if ('expiresAt' in body) c.expiresAt = optDate(body.expiresAt);
  if ('startsAt' in body) c.startsAt = optDate(body.startsAt);
  if ('notes' in body) c.notes = text(body.notes, 200);
  if ('reward' in body) c.reward = requirePack(body.reward);
  await putCode(env, c, codeSummary(c.reward));
  return json({ code: c });
});

route('DELETE', '/codes/([^/]+)', async (_req, env, [k]) => {
  await deleteCode(env, normalizeCode(k));
  return json({ ok: true });
});

/** POST /codes/bulk { action: 'enable'|'disable'|'delete', keys?: string[], batch?: string } */
route('POST', '/codes/bulk', async (req, env) => {
  const body = await readJson(req);
  let keys: string[] = Array.isArray(body.keys) ? body.keys.map((k: unknown) => normalizeCode(String(k))) : [];
  if (body.batch) keys = (await listCodes(env)).filter((c) => c.batch === body.batch).map((c) => c.key);
  keys = [...new Set(keys.filter(Boolean))].slice(0, MAX_BATCH);
  const action = String(body.action);
  if (!['enable', 'disable', 'delete'].includes(action)) throw new HttpError(400, 'bad_action', 'Ação inválida');
  for (let i = 0; i < keys.length; i += 40) {
    await Promise.all(
      keys.slice(i, i + 40).map(async (k) => {
        if (action === 'delete') return deleteCode(env, k);
        const c = await getCode(env, k);
        if (!c) return;
        c.active = action === 'enable';
        await putCode(env, c, codeSummary(c.reward));
      }),
    );
  }
  return json({ ok: true, count: keys.length });
});

/* ---- Desafios ---- */
route('GET', '/challenges', async (_req, env) => {
  const list = await listChallenges(env, true);
  const items = await Promise.all(
    list.map(async (c) => {
      const code = await getCode(env, c.codeKey);
      return { ...c, uses: code?.uses ?? 0, codeActive: code?.active ?? false, summary: codeSummary(c.reward), shareText: shareText(c) };
    }),
  );
  return json({ items });
});

route('POST', '/challenges', async (req, env) => {
  const body = await readJson(req);
  const title = text(body.title, 80);
  if (!title) throw new HttpError(400, 'no_title', 'Dê um título ao desafio.');
  const reward = requirePack(body.reward);
  const startsAt = optDate(body.startsAt);
  const endsAt = optDate(body.endsAt);
  if (startsAt && endsAt && endsAt <= startsAt) throw new HttpError(400, 'bad_dates', 'A data de fim precisa ser depois do início.');
  const id = randomId(8);
  const display = body.code ? displayCode(String(body.code)) : randomCode(displayCode(String(body.prefix ?? 'DESAFIO')).replace(/-/g, '').slice(0, 8));
  const active = body.active !== false;
  const maxUses = num(body.maxUses, 10_000_000);
  const code = await createOneCode(
    env,
    display,
    reward,
    { maxUses, startsAt, expiresAt: endsAt, active, notes: `Desafio: ${title}`.slice(0, 200) },
    { challengeId: id },
  );
  const ch: ChallengeRec = {
    id,
    title,
    description: text(body.description, 600),
    link: cleanLink(body.link),
    code: code.code,
    codeKey: code.key,
    reward,
    maxUses,
    startsAt,
    endsAt,
    active,
    createdAt: Date.now(),
  };
  await putChallenge(env, ch);
  return json({ challenge: ch, shareText: shareText(ch) });
});

route('PATCH', '/challenges/([^/]+)', async (req, env, [id]) => {
  const ch = await getChallenge(env, id);
  if (!ch) throw new HttpError(404, 'not_found', 'Desafio não encontrado');
  const body = await readJson(req);
  if ('title' in body) ch.title = text(body.title, 80) || ch.title;
  if ('description' in body) ch.description = text(body.description, 600);
  if ('link' in body) ch.link = cleanLink(body.link);
  if ('active' in body) ch.active = !!body.active;
  if ('startsAt' in body) ch.startsAt = optDate(body.startsAt);
  if ('endsAt' in body) ch.endsAt = optDate(body.endsAt);
  if ('maxUses' in body) ch.maxUses = num(body.maxUses, 10_000_000);
  if ('reward' in body) ch.reward = requirePack(body.reward);
  await putChallenge(env, ch);
  const code = await getCode(env, ch.codeKey);
  if (code) {
    Object.assign(code, { active: ch.active, startsAt: ch.startsAt, expiresAt: ch.endsAt, maxUses: ch.maxUses, reward: ch.reward });
    await putCode(env, code, codeSummary(code.reward));
  }
  return json({ challenge: ch, shareText: shareText(ch) });
});

route('DELETE', '/challenges/([^/]+)', async (_req, env, [id]) => {
  const ch = await getChallenge(env, id);
  if (ch) await deleteCode(env, ch.codeKey);
  await deleteChallenge(env, id);
  return json({ ok: true });
});

/* ---- Pacotes salvos ---- */
route('GET', '/presets', async (_req, env) => json({ items: await getPresets(env) }));

route('POST', '/presets', async (req, env) => {
  const body = await readJson(req);
  const name = text(body.name, 40);
  if (!name) throw new HttpError(400, 'no_name', 'Dê um nome ao pacote.');
  const pack = requirePack(body.pack);
  const list = await getPresets(env);
  const id = typeof body.id === 'string' && list.some((p) => p.id === body.id) ? body.id : randomId(8);
  const preset = { id, name, pack, updatedAt: Date.now() };
  const next = [...list.filter((p) => p.id !== id), preset].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 100);
  await putPresets(env, next);
  return json({ preset });
});

route('DELETE', '/presets/([^/]+)', async (_req, env, [id]) => {
  await putPresets(env, (await getPresets(env)).filter((p) => p.id !== id));
  return json({ ok: true });
});

/* ---- Ranking ---- */
route('GET', '/leaderboard', async (_req, env, _p, url) => {
  const scope = url.searchParams.get('scope') === 'week' ? 'week' : 'all';
  return json({ scope, ...(await adminLeaderboard(env, scope, url.searchParams.get('week') ?? undefined)) });
});

route('DELETE', '/leaderboard/([^/]+)', async (_req, env, [id], url) => {
  if (!PLAYER_ID_RE.test(id)) throw new HttpError(400, 'bad_id', 'id inválido');
  return json(await adminRemove(env, id, url.searchParams.get('ban') === '1'));
});

route('POST', '/leaderboard/unban/([^/]+)', async (_req, env, [id]) => {
  await adminUnban(env, id);
  return json({ ok: true });
});
