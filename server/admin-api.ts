/** API do painel admin (/api/admin/*). Todas as rotas exigem token, exceto /login. */
import { CATALOG_BOOSTS, CATALOG_SKINS, CATALOG_TRAILS } from '../shared/catalog';
import { normalizeCode, packIsEmpty, sanitizePack, type RewardPack } from '../shared/reward';
import { nextSeasonIndex, seasonIndexAt, seasonWindow } from '../shared/season-calendar';
import { adminHub, type CodeDef } from './admin-hub';
import { handleLogin, requireAdmin } from './auth';
import { HANDLE_RE, myHandle, normalizeHandle, resetHandle } from './handles';
import { adminLeaderboard, adminRemove, adminUnban } from './leaderboard';
import { banKey } from './moderation';
import { PRODUCT_INFO } from './purchases';
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
  migrateLegacyCodes,
  pendingGiftsFor,
  PLAYER_FLAGS,
  putChallenge,
  putCode,
  putGifts,
  putPlayer,
  putPresets,
  type ChallengeRec,
  type GiftRec,
  type PlayerRow,
} from './store';
import { codeSummary } from './summary';
import { HttpError, json, num, optDate, PLAYER_ID_RE, randomCode, randomId, readJson } from './util';

const DAY = 86_400_000;
const MAX_BATCH = 1000;
const FILTER_LABEL: Record<string, string> = {
  all: 'todos',
  active1: 'ativos 24 h',
  active7: 'ativos 7 dias',
  active30: 'ativos 30 dias',
  subs: 'assinantes do Clube',
  payers: 'quem já comprou',
  beta: 'beta testers',
  mod: 'moderadores',
  vip: 'VIP',
  tester: 'testers internos',
  creator: 'criadores de conteúdo',
  banned: 'banidos',
};

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

route('GET', '/catalog', async () => json({ skins: CATALOG_SKINS, trails: CATALOG_TRAILS, boosts: CATALOG_BOOSTS, products: PRODUCT_INFO }));

/* ---- Painel ---- */
route('GET', '/stats', async (_req, env) => {
  const now = Date.now();
  const [players, codes, challenges, gifts, pur] = await Promise.all([
    listPlayers(env, true),
    listCodes(env),
    listChallenges(env, true),
    getGifts(env, true),
    adminHub(env).purchases({ from: now - 30 * DAY, limit: 1 }),
  ]);
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
    purchases30d: pur.total,
    payers30d: pur.payers,
    subscribers: players.filter((p) => p.clubUntil > now).length,
    banned: players.filter((p) => p.banned).length,
    season: seasonIndexAt(now),
    top,
  });
});

/* ---- Jogadores ---- */
const FILTERS = ['all', 'active1', 'active7', 'active30', 'subs', 'payers', 'beta', 'mod', 'vip', 'tester', 'creator', 'banned'] as const;

/** Filtros comuns da lista e dos destinatários de presentes. */
async function filterPlayers(env: Env, rows: PlayerRow[], q: string, filter: string, days = 0): Promise<PlayerRow[]> {
  const now = Date.now();
  let out = rows;
  if (days > 0) out = out.filter((p) => now - p.lastSeen < days * DAY);
  const f = (FILTERS as readonly string[]).includes(filter) ? filter : 'all';
  if (f.startsWith('active')) out = out.filter((p) => now - p.lastSeen < Number(f.slice(6)) * DAY);
  else if (f === 'subs') out = out.filter((p) => p.clubUntil > now);
  else if (f === 'payers') out = out.filter((p) => p.purchases > 0);
  else if (f === 'banned') out = out.filter((p) => p.banned);
  else if (f !== 'all') out = out.filter((p) => p.flags.includes(f));
  q = q.trim().toLowerCase();
  if (q) {
    const h = q.replace(/^@/, '');
    const ids = new Set<string>();
    // @nome: índice do KV por prefixo (pega quem ainda não tem o @ copiado no registro)
    if (h.length >= 2 && /^[a-z0-9_.]+$/.test(h)) {
      const res = await env.DATA.list({ prefix: 'handle:' + h, limit: 30 });
      const vals = await Promise.all(res.keys.map((k) => env.DATA.get(k.name)));
      vals.forEach((v) => v && ids.add(v));
    }
    out = out.filter(
      (p) =>
        ids.has(p.id) ||
        (q.startsWith('@') ? p.handle.startsWith(h) : p.handle.includes(h) || p.name.toLowerCase().includes(q) || p.id.toLowerCase().startsWith(q)),
    );
  }
  return out;
}

route('GET', '/players', async (_req, env, _p, url) => {
  const sp = url.searchParams;
  const rows = await filterPlayers(env, await listPlayers(env), sp.get('q') ?? '', sp.get('filter') ?? 'all', Number(sp.get('days') ?? 0));
  if (sp.get('ids') === '1') return json({ total: rows.length, ids: rows.slice(0, 20000).map((p) => p.id) });
  const sort = sp.get('sort') ?? 'lastSeen';
  const key = (['lastSeen', 'best', 'runs', 'created', 'name', 'coins', 'gems', 'purchases'] as const).find((k) => k === sort) ?? 'lastSeen';
  const sorted = [...rows].sort((a, b) => (key === 'name' ? a.name.localeCompare(b.name) : b[key] - a[key]));
  const size = Math.min(200, Math.max(1, Number(sp.get('size') ?? 50)));
  const page = Math.max(1, Number(sp.get('page') ?? 1));
  const items = sorted.slice((page - 1) * size, page * size);
  // @ de quem ainda não tem a cópia no registro (jogadores antigos): lê ph:<id> só da página
  await Promise.all(
    items.filter((p) => !p.handle).map(async (p) => {
      const cur = await myHandle(env, p.id);
      if (cur && (await env.DATA.get('handle:' + cur.h)) === p.id) p.handle = cur.h;
    }),
  );
  return json({ total: rows.length, page, size, items });
});

async function loadPlayer(env: Env, id: string) {
  if (!PLAYER_ID_RE.test(id)) throw new HttpError(400, 'bad_id', 'id inválido');
  const p = await getPlayer(env, id);
  if (!p) throw new HttpError(404, 'not_found', 'Jogador não encontrado');
  return p;
}

route('GET', '/players/([^/]+)', async (_req, env, [id]) => {
  const p = await loadPlayer(env, id);
  const hub = adminHub(env);
  const [gifts, cur, profile, codes, purchases, giftLog, chatBan, lb] = await Promise.all([
    getGifts(env, true),
    myHandle(env, id),
    env.DATA.get('prof:' + id, 'json'),
    hub.codesOf(id),
    hub.purchases({ pid: id, limit: 200 }),
    hub.giftsOf(id),
    env.DATA.get(banKey(id), 'json'),
    env.DATA.get<string[]>('lb:banned', 'json'),
  ]);
  const handle = cur && (await env.DATA.get('handle:' + cur.h)) === id ? cur.h : '';
  const byId = new Map(gifts.map((g) => [g.id, g]));
  const pendingIds = new Set(pendingGiftsFor(p, gifts).map((g) => g.id));
  const log = new Map(giftLog.map((g) => [g.gid, g]));
  // presentes: os ativos destinados a ele + os que ele já pegou (mesmo que o presente tenha sido apagado)
  const giftRows = [
    ...gifts
      .filter((g) => pendingIds.has(g.id) || log.has(g.id) || p.claimed.includes(g.id))
      .map((g) => ({ id: g.id, title: g.title, summary: codeSummary(g.reward), sentAt: g.sentAt, seen: log.get(g.id)?.seen ?? null, claimed: log.get(g.id)?.claimed ?? (p.claimed.includes(g.id) ? -1 : null) })),
    ...giftLog.filter((g) => !byId.has(g.gid)).map((g) => ({ id: g.gid, title: '(presente apagado)', summary: '', sentAt: 0, seen: g.seen, claimed: g.claimed })),
  ].sort((a, b) => (b.claimed ?? b.sentAt) - (a.claimed ?? a.sentAt));
  return json({
    player: p,
    handle,
    profile,
    pending: [...pendingIds].map((gid) => byId.get(gid)),
    gifts: giftRows,
    codes,
    purchases: purchases.items,
    chatBan,
    lbBanned: (lb ?? []).includes(id),
    flagsAvailable: PLAYER_FLAGS,
    season: seasonIndexAt(),
  });
});

route('POST', '/players/([^/]+)/flags', async (req, env, [id]) => {
  const p = await loadPlayer(env, id);
  const body = await readJson(req);
  const want = Array.isArray(body.flags) ? body.flags.map(String) : [];
  p.flags = (PLAYER_FLAGS as readonly string[]).filter((f) => want.includes(f));
  await putPlayer(env, p);
  return json({ ok: true, flags: p.flags });
});

route('POST', '/players/([^/]+)/notes', async (req, env, [id]) => {
  const p = await loadPlayer(env, id);
  p.notes = text((await readJson(req)).notes, 500);
  await putPlayer(env, p);
  return json({ ok: true });
});

/** Banir: sem presentes/códigos, fora do ranking (e bloqueado de enviar) e fora do chat. */
route('POST', '/players/([^/]+)/ban', async (req, env, [id]) => {
  const p = await loadPlayer(env, id);
  const reason = text((await readJson(req)).reason, 120) || 'banido pelo admin';
  p.banned = { reason, t: Date.now() };
  await putPlayer(env, p);
  await adminRemove(env, id, true);
  await env.DATA.put(banKey(id), JSON.stringify({ reason, t: Date.now(), until: 0 }));
  return json({ ok: true });
});

route('POST', '/players/([^/]+)/unban', async (_req, env, [id]) => {
  const p = await loadPlayer(env, id);
  p.banned = null;
  await putPlayer(env, p);
  await adminUnban(env, id);
  await env.DATA.delete(banKey(id));
  return json({ ok: true });
});

route('POST', '/players/([^/]+)/reset-handle', async (_req, env, [id]) => {
  await loadPlayer(env, id);
  return json({ ok: true, old: await resetHandle(env, id) });
});

/* ---- Temporadas (calendário replicado de src/creatures/seasons.ts) ---- */
route('GET', '/seasons', async () => {
  const now = Date.now();
  const cur = seasonIndexAt(now);
  const next = nextSeasonIndex(now);
  const list = [];
  for (let i = cur ?? next ?? 0, n = 0; n < 6; i++, n++) {
    const w = seasonWindow(i);
    if (w) list.push(w);
  }
  return json({ current: cur === null ? null : seasonWindow(cur), next: next === null ? null : seasonWindow(next), list });
});

/* ---- Pagamentos (compras reportadas pelo app — NÃO verificadas) ---- */
const priceNum = (s: string) => {
  const m = /([\d.]+),(\d{2})/.exec(s) ?? /(\d+)\.(\d{2})/.exec(s);
  return m ? Number(m[1].replace(/\./g, '')) + Number(m[2]) / 100 : 0;
};

route('GET', '/purchases', async (_req, env, _p, url) => {
  const sp = url.searchParams;
  const size = Math.min(500, Math.max(1, Number(sp.get('size') ?? 100)));
  const page = Math.max(1, Number(sp.get('page') ?? 1));
  const r = await adminHub(env).purchases({
    from: optDate(sp.get('from')) ?? undefined,
    to: optDate(sp.get('to')) ?? undefined,
    q: text(sp.get('q'), 60) || undefined,
    product: text(sp.get('product'), 64) || undefined,
    limit: size,
    offset: (page - 1) * size,
  });
  const byProduct = r.byProduct.map((x) => {
    const info = PRODUCT_INFO[x.product];
    return { ...x, name: info?.name ?? x.product, listPrice: info?.price ?? '', estimate: Math.round(x.n * priceNum(info?.price ?? '') * 100) / 100 };
  });
  return json({ ...r, byProduct, page, size, estimate: byProduct.reduce((s, x) => s + x.estimate, 0), products: PRODUCT_INFO, verified: false });
});

/* ---- Auditoria ---- */
route('GET', '/audit', async (_req, env, _p, url) => {
  const before = Number(url.searchParams.get('before') ?? 0) || null;
  return json({ items: await adminHub(env).auditList(before, 100, text(url.searchParams.get('q'), 60)) });
});

/* ---- Presentes ---- */
route('GET', '/gifts', async (_req, env) => {
  const list = await getGifts(env, true);
  const counts = await adminHub(env).giftCounts(list.map((g) => g.id));
  return json({ items: list.map((g) => ({ ...g, to: g.to === 'all' ? 'all' : g.to.length, ...counts[g.id] })).sort((a, b) => b.sentAt - a.sentAt) });
});

/** Destinatários com status: entregue (apareceu no Correio) / pego. */
route('GET', '/gifts/([^/]+)', async (_req, env, [id]) => {
  const g = (await getGifts(env, true)).find((x) => x.id === id);
  if (!g) throw new HttpError(404, 'not_found', 'Presente não encontrado (talvez cancelado ou expirado).');
  const [st, rows] = await Promise.all([adminHub(env).giftStatus(id), listPlayers(env)]);
  const byId = new Map(rows.map((p) => [p.id, p]));
  const ids = g.to === 'all' ? [...new Set([...Object.keys(st.seen), ...Object.keys(st.claimed)])] : g.to;
  const recipients = ids.slice(0, 2000).map((pid) => {
    const p = byId.get(pid);
    return { id: pid, name: p?.name ?? '?', handle: p?.handle ?? '', seen: st.seen[pid] ?? null, claimed: st.claimed[pid] ?? null };
  });
  return json({ gift: { ...g, to: g.to === 'all' ? 'all' : g.to.length }, recipients, claimed: Object.keys(st.claimed).length, seen: Object.keys(st.seen).length });
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
  } else if (target.type === 'filter') {
    const filter = String(target.filter ?? 'all');
    to = (await filterPlayers(env, await listPlayers(env, true), String(target.q ?? ''), filter)).map((p) => p.id);
    count = to.length;
    label = `Filtro: ${FILTER_LABEL[filter] ?? filter}${target.q ? ` + busca "${text(target.q, 30)}"` : ''}`;
  } else if (target.type === 'players') {
    to = [...new Set<string>((Array.isArray(target.ids) ? target.ids : []).map(String).filter((id: string) => PLAYER_ID_RE.test(id)))];
    count = to.length;
    label = count === 1 ? '1 jogador selecionado' : `${count} jogadores selecionados`;
  } else {
    throw new HttpError(400, 'bad_target', 'Escolha para quem enviar o presente.');
  }
  if (!count) throw new HttpError(400, 'no_players', 'Nenhum jogador recebe esse presente.');
  if (Array.isArray(to) && to.length > 20000) throw new HttpError(400, 'too_many', 'Muitos jogadores: use "Todos os jogadores".');
  if (Array.isArray(to)) {
    // banidos não recebem
    const banned = new Set((await listPlayers(env)).filter((p) => p.banned).map((p) => p.id));
    to = to.filter((pid) => !banned.has(pid));
    count = to.length;
    if (!count) throw new HttpError(400, 'no_players', 'Nenhum jogador recebe esse presente.');
  }
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

/** "@ana, @beto bia" → ids (erro listando os @ que não existem). */
async function resolveHandles(env: Env, raw: unknown): Promise<{ ids: string[]; handles: string[] }> {
  const parts = [...new Set(String(raw ?? '').split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))].slice(0, 500);
  const ids: string[] = [];
  const handles: string[] = [];
  const missing: string[] = [];
  await Promise.all(
    parts.map(async (part) => {
      if (/^[0-9a-f-]{32,36}$/i.test(part) && PLAYER_ID_RE.test(part)) return void (ids.push(part), handles.push(part.slice(0, 8)));
      const h = normalizeHandle(part.replace(/^@/, ''));
      const id = HANDLE_RE.test(h) ? await env.DATA.get('handle:' + h) : null;
      if (!id || id.startsWith('!')) missing.push('@' + h);
      else ids.push(id), handles.push('@' + h);
    }),
  );
  if (missing.length) throw new HttpError(400, 'bad_handles', 'Não encontrei: ' + missing.join(', '));
  return { ids: [...new Set(ids)], handles };
}

function seasonOpt(v: unknown): number | null {
  if (v === null || v === undefined || v === '' || v === false || v === 'none') return null;
  const now = Date.now();
  const i = v === 'current' || v === true ? seasonIndexAt(now) : v === 'next' ? nextSeasonIndex(now) : Math.floor(Number(v));
  if (i === null || !seasonWindow(i)) throw new HttpError(400, 'no_season', 'Não há temporada do passe ativa agora (a primeira começa em 01/12/2026). Escolha "a próxima".');
  return i;
}

async function codeOptions(env: Env, body: Record<string, any>) {
  const startsAt = optDate(body.startsAt);
  const expiresAt = optDate(body.expiresAt);
  if (startsAt && expiresAt && expiresAt <= startsAt) throw new HttpError(400, 'bad_dates', 'A data de fim precisa ser depois do início.');
  const oneShot = body.oneShot === true;
  const allow = body.allowHandles ? await resolveHandles(env, body.allowHandles) : { ids: [], handles: [] };
  return {
    maxUses: oneShot ? 1 : num(body.maxUses, 10_000_000),
    perPlayer: oneShot ? 1 : body.perPlayer === undefined ? 1 : num(body.perPlayer, 1000),
    startsAt,
    expiresAt,
    season: seasonOpt(body.season),
    allow: allow.ids,
    allowHandles: allow.handles,
    active: body.active !== false,
    notes: text(body.notes, 200),
  };
}

type CodeOpts = Awaited<ReturnType<typeof codeOptions>>;

async function createOneCode(env: Env, display: string, reward: RewardPack, opts: CodeOpts, extra: Partial<CodeDef> = {}) {
  const key = normalizeCode(display);
  if (key.length < 3) throw new HttpError(400, 'bad_code', 'O código precisa ter pelo menos 3 letras ou números.');
  await migrateLegacyCodes(env).catch(() => 0);
  if (await getCode(env, key)) throw new HttpError(409, 'exists', `O código ${display} já existe.`);
  const rec: CodeDef = { code: display, key, reward, createdAt: Date.now(), summary: codeSummary(reward), ...opts, ...extra };
  const r = await adminHub(env).putCodes([rec], true);
  if (r.exists.length) throw new HttpError(409, 'exists', `O código ${display} já existe.`);
  return rec;
}

route('POST', '/codes', async (req, env) => {
  const body = await readJson(req);
  const reward = requirePack(body.reward);
  const opts = await codeOptions(env, body);
  const count = Math.max(1, num(body.count, MAX_BATCH));
  const prefix = displayCode(String(body.prefix ?? 'BLP')).replace(/-/g, '').slice(0, 8);
  if (count === 1) {
    const display = body.code ? displayCode(String(body.code)) : randomCode(prefix);
    const rec = await createOneCode(env, display, reward, opts);
    return json({ codes: [rec.code], batch: null });
  }
  // Lote: N códigos únicos aleatórios — uma única chamada ao AdminHub (sem gastar escritas do KV).
  const batch = randomId(6);
  const now = Date.now();
  const summary = codeSummary(reward);
  const hub = adminHub(env);
  const set = new Set<string>();
  while (set.size < count) set.add(randomCode(prefix));
  let defs: CodeDef[] = [...set].map((display) => ({ code: display, key: normalizeCode(display), reward, createdAt: now, batch, summary, ...opts }));
  const r = await hub.putCodes(defs, true);
  if (r.exists.length) {
    // colisão rara com um código antigo: troca só os repetidos
    const clash = new Set(r.exists);
    const extra: CodeDef[] = [];
    while (extra.length < clash.size) {
      const d = randomCode(prefix);
      if (!set.has(d)) set.add(d), extra.push({ code: d, key: normalizeCode(d), reward, createdAt: now, batch, summary, ...opts });
    }
    await hub.putCodes(extra, true);
    defs = [...defs.filter((d) => !clash.has(d.code)), ...extra];
  }
  return json({ codes: defs.map((d) => d.code), batch });
});

route('PATCH', '/codes/([^/]+)', async (req, env, [k]) => {
  const c = await getCode(env, normalizeCode(k));
  if (!c) throw new HttpError(404, 'not_found', 'Código não encontrado');
  const body = await readJson(req);
  if ('active' in body) c.active = !!body.active;
  if ('maxUses' in body) c.maxUses = num(body.maxUses, 10_000_000);
  if ('perPlayer' in body) c.perPlayer = num(body.perPlayer, 1000);
  if ('expiresAt' in body) c.expiresAt = optDate(body.expiresAt);
  if ('startsAt' in body) c.startsAt = optDate(body.startsAt);
  if ('season' in body) c.season = seasonOpt(body.season);
  if ('allowHandles' in body) {
    const a = body.allowHandles ? await resolveHandles(env, body.allowHandles) : { ids: [], handles: [] };
    c.allow = a.ids;
    c.allowHandles = a.handles;
  }
  if ('notes' in body) c.notes = text(body.notes, 200);
  if ('reward' in body) c.reward = requirePack(body.reward);
  if (c.startsAt && c.expiresAt && c.expiresAt <= c.startsAt) throw new HttpError(400, 'bad_dates', 'A data de fim precisa ser depois do início.');
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
  const hub = adminHub(env);
  let keys: string[] = Array.isArray(body.keys) ? body.keys.map((k: unknown) => normalizeCode(String(k))) : [];
  if (body.batch) keys = await hub.keysOfBatch(String(body.batch));
  keys = [...new Set(keys.filter(Boolean))].slice(0, 10_000);
  const action = String(body.action);
  if (!['enable', 'disable', 'delete'].includes(action)) throw new HttpError(400, 'bad_action', 'Ação inválida');
  const n = action === 'delete' ? await hub.deleteCodes(keys) : await hub.setActive(keys, action === 'enable');
  return json({ ok: true, count: n });
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
    { maxUses, perPlayer: 1, startsAt, expiresAt: endsAt, season: null, allow: [], allowHandles: [], active, notes: `Desafio: ${title}`.slice(0, 200) },
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
