/**
 * PROGRAMA BETA — relatórios de bug enviados pelo app (src/services/feedback.ts).
 *
 *   POST /api/feedback                      (público) guarda o relatório
 *   GET  /api/admin/feedback?status=&cat=   lista (resumos)
 *   GET  /api/admin/feedback/export         todos (até 500) em JSON, sem as fotos
 *   GET  /api/admin/feedback/item?key=      relatório completo (+ foto)
 *   POST /api/admin/feedback/resolve        { key, resolved, note? }
 *   POST /api/admin/feedback/delete         { key }
 *
 * KV:
 *   fb:<ts14>:<rand>   → JSON do relatório (sem a foto); metadata = resumo para a lista (≤ 1 KB)
 *   fbshot:<mesma>     → data URL da foto (JPEG ≤ ~220 KB)
 *   rl:fb:<pid|ip>     → contador do limite (10 por hora)
 * Tudo expira em 120 dias.
 */
import { requireAdmin } from './auth';
import { maskLongText } from './moderation';
import { HttpError, PLAYER_ID_RE, json, randomId, readJson } from './util';

const CATS = ['physics', 'crash', 'visual', 'sound', 'shop', 'other'] as const;
type Cat = (typeof CATS)[number];
const TTL = 120 * 86400;
const MAX_RAW = 320_000;
const MAX_SHOT = 220_000;
const RATE_PER_HOUR = 10;

const str = (v: unknown, n: number): string =>
  String(v ?? '')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f<>]/g, ' ')
    .slice(0, n);
const numOr = (v: unknown, d: number | null): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : d);

interface Summary {
  t: number;
  cat: Cat;
  pid: string;
  name: string;
  handle: string;
  v: string;
  plat: string;
  where: string;
  text: string;
  shot: boolean;
  errs: number;
  st: 'open' | 'resolved';
}

function cleanCtx(c: unknown): Record<string, unknown> {
  const o = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
  return {
    version: str(o.version, 20),
    platform: str(o.platform, 20),
    ua: str(o.ua, 300),
    screen: str(o.screen, 20),
    viewport: str(o.viewport, 20),
    dpr: numOr(o.dpr, null),
    lang: str(o.lang, 12),
    tier: numOr(o.tier, null),
    where: str(o.where, 80),
    online: o.online === true,
    mem: numOr(o.mem, null),
    cores: numOr(o.cores, null),
  };
}

function cleanErrors(e: unknown): { t: number; kind: string; msg: string; src?: string }[] {
  if (!Array.isArray(e)) return [];
  return e.slice(-30).map((x) => {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    return { t: numOr(o.t, 0) as number, kind: str(o.kind, 10), msg: str(o.msg, 400), ...(o.src ? { src: str(o.src, 160) } : {}) };
  });
}

/** POST /api/feedback */
export async function feedbackPost(req: Request, env: Env): Promise<Response> {
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > MAX_RAW) throw new HttpError(413, 'too_large', 'Relatório muito grande.');
  const b = await readJson(req);
  const pid = PLAYER_ID_RE.test(String(b.pid ?? '')) ? String(b.pid) : '';
  const who = pid || req.headers.get('cf-connecting-ip') || 'anon';
  const rl = 'rl:fb:' + who;
  const n = Number((await env.DATA.get(rl)) ?? 0);
  if (n >= RATE_PER_HOUR) return json({ error: 'rate_limited', message: 'Muitos relatórios em pouco tempo. Obrigado!' }, 429);

  const cat: Cat = (CATS as readonly string[]).includes(String(b.category)) ? (b.category as Cat) : 'other';
  const m = maskLongText(b.text, 1000);
  if (m.text.replace(/[#\s]/g, '').length < 3) throw new HttpError(400, 'empty', 'Descreva o problema.');
  let shot = typeof b.shot === 'string' ? b.shot : '';
  if (shot && (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(shot) || shot.length > MAX_SHOT)) shot = '';

  const now = Date.now();
  const key = `fb:${now.toString().padStart(14, '0')}:${randomId(6)}`;
  const ctx = cleanCtx(b.ctx);
  const errors = cleanErrors(b.errors);
  const report = {
    key,
    cid: str(b.id, 40),
    pid,
    name: str(b.name, 20),
    handle: str(b.handle, 16),
    category: cat,
    text: m.text,
    filtered: m.filtered,
    pii: m.pii,
    ctx,
    errors,
    clientT: numOr(b.t, null),
    t: now,
    status: 'open' as 'open' | 'resolved',
    note: '',
    hasShot: !!shot,
  };
  const meta: Summary = {
    t: now,
    cat,
    pid,
    name: report.name,
    handle: report.handle,
    v: String(ctx.version),
    plat: String(ctx.platform),
    where: String(ctx.where).slice(0, 40),
    text: m.text.slice(0, 120),
    shot: !!shot,
    errs: errors.length,
    st: 'open',
  };
  await env.DATA.put(key, JSON.stringify(report), { metadata: meta, expirationTtl: TTL });
  if (shot) await env.DATA.put('fbshot:' + key.slice(3), shot, { expirationTtl: TTL });
  await env.DATA.put(rl, String(n + 1), { expirationTtl: 3600 });
  return json({ ok: true, key });
}

const keyOk = (k: string): boolean => /^fb:\d{14}:[A-Za-z0-9]{6}$/.test(k);

async function listAll(env: Env, max = 500): Promise<{ key: string; meta: Summary }[]> {
  const out: { key: string; meta: Summary }[] = [];
  let cursor: string | undefined;
  do {
    const r = await env.DATA.list<Summary>({ prefix: 'fb:', limit: 1000, cursor });
    for (const k of r.keys) if (k.metadata) out.push({ key: k.name, meta: k.metadata });
    cursor = r.list_complete ? undefined : r.cursor;
  } while (cursor && out.length < max);
  return out.reverse().slice(0, max); // mais novos primeiro
}

/** /api/admin/feedback/* */
export async function handleFeedbackAdmin(req: Request, env: Env, url: URL): Promise<Response> {
  await requireAdmin(req, env);
  const path = url.pathname.replace(/^\/api\/admin\/feedback/, '').replace(/\/+$/, '');
  const m = req.method;

  if (m === 'GET' && path === '') {
    const st = url.searchParams.get('status') ?? 'open';
    const cat = url.searchParams.get('cat') ?? '';
    const all = await listAll(env);
    const items = all
      .filter((x) => (st === 'all' ? true : x.meta.st === st))
      .filter((x) => (cat ? x.meta.cat === cat : true))
      .map((x) => ({ key: x.key, ...x.meta }));
    const counts = { open: all.filter((x) => x.meta.st === 'open').length, resolved: all.filter((x) => x.meta.st === 'resolved').length };
    return json({ items: items.slice(0, 200), counts });
  }
  if (m === 'GET' && path === '/export') {
    const all = await listAll(env);
    const full = [];
    for (const x of all) {
      const v = await env.DATA.get(x.key, 'json');
      if (v) full.push(v);
    }
    return new Response(JSON.stringify({ exportedAt: Date.now(), count: full.length, reports: full }, null, 2), {
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'content-disposition': `attachment; filename="bloop-bugs-${new Date().toISOString().slice(0, 10)}.json"` },
    });
  }
  if (m === 'GET' && path === '/item') {
    const key = url.searchParams.get('key') ?? '';
    if (!keyOk(key)) throw new HttpError(400, 'bad_key');
    const v = await env.DATA.get(key, 'json');
    if (!v) throw new HttpError(404, 'not_found', 'Relatório não encontrado.');
    const shot = await env.DATA.get('fbshot:' + key.slice(3));
    return json({ ...(v as object), ...(shot ? { shot } : {}) });
  }
  if (m === 'POST' && path === '/resolve') {
    const b = await readJson(req);
    const key = String(b.key ?? '');
    if (!keyOk(key)) throw new HttpError(400, 'bad_key');
    const r = await env.DATA.getWithMetadata<Summary>(key);
    if (!r.value || !r.metadata) throw new HttpError(404, 'not_found', 'Relatório não encontrado.');
    const st: Summary['st'] = b.resolved === false ? 'open' : 'resolved';
    const rep = JSON.parse(r.value);
    rep.status = st;
    if (typeof b.note === 'string') rep.note = str(b.note, 300);
    await env.DATA.put(key, JSON.stringify(rep), { metadata: { ...r.metadata, st }, expirationTtl: TTL });
    return json({ ok: true, status: st });
  }
  if (m === 'POST' && path === '/delete') {
    const b = await readJson(req);
    const key = String(b.key ?? '');
    if (!keyOk(key)) throw new HttpError(400, 'bad_key');
    await env.DATA.delete(key);
    await env.DATA.delete('fbshot:' + key.slice(3));
    return json({ ok: true });
  }
  throw new HttpError(404, 'not_found', 'Rota não encontrada');
}
