/**
 * API pública da LOJA DE CRIAÇÕES (Bloop Studio) e da TV BLOOP (filmes do Bloop Cinema). docs/LOJA-TV.md.
 *
 * Identidade = id do jogador (o mesmo do ranking/Correio, enviado no corpo ou em ?pid=). Nunca é exposto:
 * o autor aparece como @nome ou um apelido público derivado (aid).
 *
 * Armazenamento:
 *   KV  ugc:c:<id>  JSON da criação (≤ 512 KB)          ugc:f:<id>  filme { project, clips } (≤ 3 MB)
 *   DO  UgcHub      índice, fila de moderação, curtidas/usos/denúncias, moedas do criador
 *   DO  TvChannel   grade da TV, votos
 *   DO  AdminHub    Correio (presentes pessoais com as moedas)
 */
import { buildExtra, filterMessage, maskLongText, safeName, type Extra } from '../shared/moderation';
import { TV, UGC, UGC_REPORT_REASONS, type TvPayload, type UgcType } from '../shared/ugc';
import { hashCreation, jsonBytes, validate, type Creation } from '../src/studio/format';
import { adminHub } from './admin-hub';
import { loadExtraWords } from './moderation';
import { getPlayer } from './store';
import { tvChannel } from './tv';
import { ugcHub, type BrowseIn, type Grant } from './ugc-hub';
import { HttpError, json, PLAYER_ID_RE, sha256 } from './util';

const CATEGORIES = ['vehicles', 'buildings', 'nature', 'gadgets', 'furniture', 'maps', 'art'];
const GAME_TAGS = ['corrida', 'obstaculos', 'fisica', 'captura', 'enigma', 'festa', 'aventura', 'coleta'];
const THUMB_RE = /^data:image\/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$/;
const ITEM_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/* ---------------- util ---------------- */

/** Corpo JSON com teto próprio (as rotas comuns têm 512 KB; filmes chegam a 3 MB). */
async function readBody<T = Record<string, any>>(req: Request, max: number): Promise<T> {
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > max) throw new HttpError(413, 'too_big', 'Envio grande demais.');
  const text = await req.text();
  if (text.length > max) throw new HttpError(413, 'too_big', 'Envio grande demais.');
  try {
    const v = JSON.parse(text || '{}');
    if (!v || typeof v !== 'object') throw new Error();
    return v as T;
  } catch {
    throw new HttpError(400, 'bad_json', 'JSON inválido');
  }
}

const ip = (req: Request) => req.headers.get('cf-connecting-ip') ?? 'local';
const str = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

function itemId(v: unknown): string {
  const id = String(v ?? '');
  if (!ITEM_ID_RE.test(id)) throw new HttpError(400, 'bad_item', 'id do item inválido');
  return id;
}

interface Who {
  pid: string;
  /** id público do autor */
  aid: string;
  name: string;
  /** conta velha o bastante e não banida → gera moedas para criadores */
  trusted: boolean;
}

/** Idade mínima da conta (h) para gerar moedas. `UGC_MIN_AGE_H` (vars/.dev.vars) troca o padrão — 0 no teste local. */
function minAgeH(env: Env): number {
  const v = Number(env.UGC_MIN_AGE_H);
  return Number.isFinite(v) && env.UGC_MIN_AGE_H !== undefined && env.UGC_MIN_AGE_H !== '' ? v : UGC.reward.minAccountAgeH;
}

async function who(env: Env, rawId: unknown): Promise<Who> {
  const pid = String(rawId ?? '');
  if (!PLAYER_ID_RE.test(pid)) throw new HttpError(400, 'bad_id', 'Entre online primeiro.');
  const p = await getPlayer(env, pid);
  if (p?.banned) throw new HttpError(403, 'banned', 'Sua conta não pode publicar nem interagir.');
  const h = await sha256('bloop-ugc/aid:' + pid);
  const aid = p?.handle ? '@' + p.handle : 'u' + [...h.slice(0, 5)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const trusted = !!p && Date.now() - p.created >= minAgeH(env) * 3600_000;
  return { pid, aid, name: safeName(p?.name ?? 'Bloop'), trusted };
}

async function limit(env: Env, key: string, max: number, windowMs: number): Promise<void> {
  if (!(await ugcHub(env).rate(key, max, windowMs))) throw new HttpError(429, 'rate', 'Calma! Espere um pouquinho.');
}

/** Moedas do criador → Correio (presente pessoal). Falhou: devolve ao acumulado. */
async function deliver(env: Env, g: Grant, src: 'loja' | 'tv'): Promise<void> {
  if (!g || g.coins <= 0) return;
  const title = src === 'tv' ? 'TV Bloop: seu filme fez sucesso!' : 'Moedas de criador!';
  const msg = src === 'tv' ? 'Muita gente deu "Gostei" no seu filme na TV Bloop.' : 'Outras pessoas curtiram, usaram ou jogaram suas criações da Loja.';
  try {
    await adminHub(env).grantPersonal(g.pid, src, g.coins, title, msg);
  } catch (e) {
    console.error('ugc deliver', e);
    if (src === 'loja') await ugcHub(env).refund(g.pid, g.coins).catch(() => {});
  }
}

/* ---------------- filtro de texto ---------------- */

let extraCache: { at: number; ex: Extra } | null = null;
async function extra(env: Env): Promise<Extra> {
  if (extraCache && Date.now() - extraCache.at < 60_000) return extraCache.ex;
  const ex = buildExtra(await loadExtraWords(env));
  extraCache = { at: Date.now(), ex };
  return ex;
}

/** null = texto ok; senão o motivo (para a fila do moderador). */
function textProblem(s: string, ex: Extra): string | null {
  const t = s.trim();
  if (!t) return null;
  if ([...t].length <= 80) {
    const r = filterMessage(t, ex);
    if (!r.ok) return r.reason === 'pii' ? 'dado pessoal' : r.reason === 'bad' ? 'palavrão' : null;
    return r.filtered ? 'palavrão' : null;
  }
  const m = maskLongText(t, 2000, ex);
  return m.pii ? 'dado pessoal' : m.filtered ? 'palavrão' : null;
}

const SKIP_KEYS = new Set(['id', 'from', 'authorId', 'thumbnail', 'c', 'k', 't', 'ref', 'cast', 'audio', 'q', 'bg', 'song', 'shape', 'type', 'kind', 'pose', 'expr', 'ease', 'style', 'voice', 'creature', 'p3', 'focus', 'focus2', 'sfx', 'b', 'z', 'mode', 'format', 'template', 'light', 'worldKind']);

/** Todos os textos "humanos" dentro de um JSON (falas, placas, blocos "dizer", nomes de peças...). */
function collectTexts(v: unknown, out: string[], depth = 0, key = ''): void {
  if (out.length > 4000 || depth > 14) return;
  if (typeof v === 'string') {
    if (SKIP_KEYS.has(key) || v.length < 2 || /^data:/.test(v) || /^#[0-9a-f]{3,8}$/i.test(v) || !/\p{L}/u.test(v)) return;
    out.push(v.slice(0, 2000));
  } else if (Array.isArray(v)) for (const x of v) collectTexts(x, out, depth + 1, key);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) collectTexts(x, out, depth + 1, k);
}

function autoFlags(texts: string[], ex: Extra): string[] {
  const flags: string[] = [];
  const seen = new Set<string>();
  for (const s of texts) {
    if (seen.has(s)) continue;
    seen.add(s);
    const p = textProblem(s, ex);
    if (p) flags.push(`${p}: "${s.slice(0, 60)}"`);
    if (flags.length >= 20) break;
  }
  return flags;
}

/** A imagem começa com a assinatura do formato declarado? (base64 válido mas lixo virava imagem quebrada na Moderação) */
function realImage(t: string): boolean {
  const m = THUMB_RE.exec(t);
  if (!m) return false;
  let head: string;
  try {
    head = atob(t.slice(t.indexOf(',') + 1, t.indexOf(',') + 1 + 24));
  } catch {
    return false;
  }
  if (m[1] === 'jpeg') return head.charCodeAt(0) === 0xff && head.charCodeAt(1) === 0xd8;
  if (m[1] === 'png') return head.startsWith('\x89PNG');
  return head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP';
}

function cleanThumbs(v: unknown): string[] {
  return (Array.isArray(v) ? v : [])
    .map(String)
    .filter((t) => t.length > 64 && t.length <= UGC.maxThumbBytes * 1.37 && realImage(t))
    .slice(0, UGC.maxThumbs);
}

/* ================= LOJA ================= */

/** POST /api/ugc/publish { id, creation, category, thumbs[], dailyLimit } → { ok, listing } | { ok:false, error } */
export async function ugcPublish(req: Request, env: Env): Promise<Response> {
  const body = await readBody(req, UGC.maxCreationBytes + UGC.maxThumbs * UGC.maxThumbBytes * 1.4 + 64 * 1024);
  const w = await who(env, body.id);
  await limit(env, 'pub:' + w.pid, 10, 600_000);
  await limit(env, 'pubip:' + ip(req), 30, 600_000);
  const fail = (error: string) => json({ ok: false, error });
  const v = validate(body.creation);
  const c = v.creation;
  if (!c) return fail('invalid');
  if (!c.parts.length) return fail('empty');
  const ex = await extra(env);
  const name = str(c.game?.title ?? c.name, 32);
  if (!name || textProblem(name, ex) || textProblem(c.name, ex)) return fail('name');
  if (c.game && (textProblem(c.game.desc, ex) || c.game.tags.some((x) => textProblem(x, ex)))) return fail('name');
  const pc: Creation = { ...c, author: w.name, authorId: w.aid };
  if (pc.game) pc.game = { ...pc.game, tags: pc.game.tags.filter((x) => GAME_TAGS.includes(x)) };
  const bytes = jsonBytes(pc);
  if (bytes > UGC.maxCreationBytes) return fail('too-big');
  const category = CATEGORIES.includes(String(body.category)) ? String(body.category) : pc.kind === 'map' ? 'maps' : pc.kind === 'vehicle' ? 'vehicles' : 'gadgets';
  const texts: string[] = [];
  collectTexts({ ...pc, name: undefined, author: undefined }, texts);
  const flags = autoFlags(texts, ex);
  let thumbs = cleanThumbs(body.thumbs);
  if (!thumbs.length && pc.thumbnail) thumbs = cleanThumbs([pc.thumbnail]);
  const dailyLimit = Math.max(1, Math.min(UGC.maxPublishPerDay, Math.floor(Number(body.dailyLimit) || 3)));
  const r = await ugcHub(env).publish({
    id: pc.id,
    type: 'criacao',
    pid: w.pid,
    aid: w.aid,
    aname: w.name,
    title: name,
    descr: pc.game?.desc ?? '',
    category,
    kind: pc.kind,
    tags: pc.game?.tags ?? [],
    meta: { parts: pc.parts.length, hash: hashCreation(pc), worldKind: pc.worldKind, game: pc.game, bytes },
    thumbs,
    flags,
    dailyLimit,
  });
  if (!r.ok) return fail(r.error === 'taken' ? 'invalid' : r.error === 'banned' ? 'banned' : r.error);
  await env.DATA.put('ugc:c:' + pc.id, JSON.stringify(pc));
  return json({ ok: true, listing: r.item });
}

/** GET /api/ugc/browse?pid=&sort=&section=&tag=&category=&kind=&text=&fav=1&limit=&cursor= */
export async function ugcBrowse(req: Request, env: Env): Promise<Response> {
  const sp = new URL(req.url).searchParams;
  const pid = PLAYER_ID_RE.test(sp.get('pid') ?? '') ? sp.get('pid')! : '';
  const sort = (['trending', 'new', 'top'] as const).find((s) => s === sp.get('sort')) ?? 'trending';
  const section = sp.get('section') === 'games' ? 'games' : sp.get('section') === 'creations' ? 'creations' : undefined;
  const q: BrowseIn = {
    sort,
    section,
    tag: GAME_TAGS.includes(sp.get('tag') ?? '') ? sp.get('tag')! : undefined,
    category: CATEGORIES.includes(sp.get('category') ?? '') ? sp.get('category')! : undefined,
    kind: ['object', 'vehicle', 'map'].includes(sp.get('kind') ?? '') ? sp.get('kind')! : undefined,
    text: str(sp.get('text'), 30) || undefined,
    favorites: sp.get('fav') === '1' && !!pid,
    limit: Math.max(1, Math.min(60, Number(sp.get('limit')) || 24)),
    offset: Math.max(0, Math.min(10_000, Number(sp.get('cursor')) || 0)),
  };
  return json(await ugcHub(env).browse(q, pid));
}

/** GET /api/ugc/get?id=&pid= → { listing, creation } */
export async function ugcGet(req: Request, env: Env): Promise<Response> {
  const sp = new URL(req.url).searchParams;
  const id = itemId(sp.get('id'));
  const pid = PLAYER_ID_RE.test(sp.get('pid') ?? '') ? sp.get('pid')! : '';
  const listing = await ugcHub(env).get(id, pid);
  if (!listing || listing.type !== 'criacao') throw new HttpError(404, 'not_found', 'Criação não encontrada');
  const creation = await env.DATA.get('ugc:c:' + id, 'json');
  if (!creation) throw new HttpError(404, 'not_found', 'Criação não encontrada');
  return json({ listing, creation });
}

/** GET /api/ugc/thumb?id=&n= → imagem (só de itens aprovados; ?pid= do autor vê as suas) */
export async function ugcThumb(req: Request, env: Env): Promise<Response> {
  const sp = new URL(req.url).searchParams;
  const id = itemId(sp.get('id'));
  const n = Math.max(0, Math.min(UGC.maxThumbs - 1, Number(sp.get('n')) || 0));
  const pid = PLAYER_ID_RE.test(sp.get('pid') ?? '') ? sp.get('pid')! : '';
  const t = await ugcHub(env).thumb(id, n, pid);
  const m = t ? /^data:(image\/[a-z]+);base64,(.+)$/.exec(t) : null;
  if (!m) return new Response('não encontrado', { status: 404 });
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(bytes, { headers: { 'content-type': m[1], 'cache-control': pid ? 'private, max-age=60' : 'public, max-age=86400', 'x-content-type-options': 'nosniff' } });
}

/** POST /api/ugc/like { id, item, on } → { likes, liked } */
export async function ugcLike(req: Request, env: Env): Promise<Response> {
  const body = await readBody(req, 4096);
  const w = await who(env, body.id);
  await limit(env, 'like:' + w.pid, 60, 600_000);
  await limit(env, 'likeip:' + ip(req), 200, 600_000);
  const r = await ugcHub(env).like(itemId(body.item), w.pid, body.on !== false, w.trusted);
  if (!r) throw new HttpError(404, 'not_found', 'Item não encontrado');
  await deliver(env, r.grant, 'loja');
  return json({ likes: r.likes, liked: r.liked });
}

/** POST /api/ugc/fav { id, item, on } → { favorites } */
export async function ugcFav(req: Request, env: Env): Promise<Response> {
  const body = await readBody(req, 4096);
  const w = await who(env, body.id);
  await limit(env, 'fav:' + w.pid, 60, 600_000);
  return json({ favorites: await ugcHub(env).favorite(itemId(body.item), w.pid, body.on !== false) });
}

/** POST /api/ugc/use { id, item, kind: 'place'|'play' } → UseReceipt */
export async function ugcUse(req: Request, env: Env): Promise<Response> {
  const body = await readBody(req, 4096);
  const w = await who(env, body.id);
  await limit(env, 'use:' + w.pid, 60, 600_000);
  await limit(env, 'useip:' + ip(req), 200, 600_000);
  const r = await ugcHub(env).recordUse(itemId(body.item), w.pid, body.kind === 'play' ? 'play' : 'place', w.trusted);
  await deliver(env, r.grant, 'loja');
  return json({ counted: r.counted, authorCoins: r.authorCoins });
}

/** POST /api/ugc/report { id, item, reason, note? } (criações E filmes) */
export async function ugcReport(req: Request, env: Env): Promise<Response> {
  const body = await readBody(req, 8192);
  const w = await who(env, body.id);
  await limit(env, 'rep:' + w.pid, 20, 3600_000);
  const reason = UGC_REPORT_REASONS.includes(body.reason) ? String(body.reason) : 'other';
  const note = maskLongText(str(body.note, 200), 200).text;
  const id = itemId(body.item);
  const r = await ugcHub(env).report(id, w.pid, reason, note);
  if (r?.hidden && r.type === 'filme') await tvChannel(env).removeFilm(id);
  return json({ ok: true });
}

/** GET /api/ugc/mine?pid=&type=criacao|filme → { items } (com o estado da revisão) */
export async function ugcMine(req: Request, env: Env): Promise<Response> {
  const sp = new URL(req.url).searchParams;
  const pid = sp.get('pid') ?? '';
  if (!PLAYER_ID_RE.test(pid)) throw new HttpError(400, 'bad_id', 'id inválido');
  const type: UgcType = sp.get('type') === 'filme' ? 'filme' : 'criacao';
  const hub = ugcHub(env);
  const [items, today, earn] = await Promise.all([hub.mine(pid, type), hub.publishedToday(pid, type), hub.earnings(pid)]);
  return json({ items, today, earnings: earn });
}

/** POST /api/ugc/unpublish { id, item } */
export async function ugcUnpublish(req: Request, env: Env): Promise<Response> {
  const body = await readBody(req, 4096);
  const w = await who(env, body.id);
  const id = itemId(body.item);
  const type = await ugcHub(env).unpublish(id, w.pid);
  if (type) {
    await env.DATA.delete((type === 'filme' ? 'ugc:f:' : 'ugc:c:') + id);
    if (type === 'filme') await tvChannel(env).removeFilm(id);
  }
  return json({ ok: !!type });
}

/** GET /api/ugc/earnings?pid= → { pending, total } */
export async function ugcEarnings(req: Request, env: Env): Promise<Response> {
  const pid = new URL(req.url).searchParams.get('pid') ?? '';
  if (!PLAYER_ID_RE.test(pid)) throw new HttpError(400, 'bad_id', 'id inválido');
  return json(await ugcHub(env).earnings(pid));
}

/** POST /api/ugc/score { id, item, score, timeSec } → { rank } */
export async function ugcScore(req: Request, env: Env): Promise<Response> {
  const body = await readBody(req, 4096);
  const w = await who(env, body.id);
  await limit(env, 'score:' + w.pid, 30, 600_000);
  const score = Math.max(0, Math.min(1e7, Math.round(Number(body.score) || 0)));
  const time = Math.max(0, Math.min(36_000, Math.round((Number(body.timeSec) || 0) * 10) / 10));
  const r = await ugcHub(env).submitScore(itemId(body.item), w.pid, w.name, score, time);
  return json(r ?? { rank: 0 });
}

/** GET /api/ugc/board?item=&pid= → { items } */
export async function ugcBoard(req: Request, env: Env): Promise<Response> {
  const sp = new URL(req.url).searchParams;
  return json({ items: await ugcHub(env).leaderboard(itemId(sp.get('item')), sp.get('pid') ?? '') });
}

/* ================= TV BLOOP ================= */

/** GET /api/tv/now → TvNow (grade ao vivo: o mesmo para todo mundo) */
export async function tvNow(_req: Request, env: Env): Promise<Response> {
  return json(await tvChannel(env).now());
}

/** GET /api/tv/film?f=<id>[&pid=] → { title, author, payload } (só aprovados; o autor vê o seu) */
export async function tvFilm(req: Request, env: Env): Promise<Response> {
  const sp = new URL(req.url).searchParams;
  const id = itemId(sp.get('f'));
  const pid = sp.get('pid') ?? '';
  const a = await ugcHub(env).access(id);
  if (!a || a.type !== 'filme' || (a.status !== 'approved' && a.author !== pid)) throw new HttpError(404, 'not_found', 'Filme fora do ar');
  const payload = await env.DATA.get('ugc:f:' + id);
  if (!payload) throw new HttpError(404, 'not_found', 'Filme fora do ar');
  return new Response(`{"id":${JSON.stringify(id)},"title":${JSON.stringify(a.title)},"author":${JSON.stringify(a.aname)},"payload":${payload}}`, {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': a.status === 'approved' ? 'public, max-age=600' : 'no-store' },
  });
}

/** Duração (s) e textos de um projeto do Bloop Cinema — leitura tolerante (o app usa parseProject). */
function filmInfo(project: unknown): { title: string; dur: number; mode: string; texts: string[]; clipRefs: Set<string> } | null {
  if (!project || typeof project !== 'object') return null;
  const p = project as Record<string, any>;
  if (p.format !== 'bloop-cinema' || !Array.isArray(p.scenes)) return null;
  let dur = 0;
  const texts: string[] = [];
  const clipRefs = new Set<string>();
  for (const c of Array.isArray(p.cast) ? p.cast.slice(0, 8) : []) if (typeof c?.name === 'string') texts.push(c.name);
  for (const s of p.scenes.slice(0, 200)) {
    if (typeof s?.name === 'string') texts.push(s.name);
    for (const h of Array.isArray(s?.shots) ? s.shots.slice(0, 500) : []) {
      const d = Number(h?.dur);
      dur += Number.isFinite(d) ? Math.max(0.5, Math.min(60, d)) : 4;
      for (const l of Array.isArray(h?.lines) ? h.lines : []) {
        if (typeof l?.text === 'string') texts.push(l.text);
        if (typeof l?.audio === 'string') clipRefs.add(l.audio);
      }
    }
  }
  return { title: typeof p.title === 'string' ? p.title : '', dur, mode: p.mode === '3d' ? '3d' : '2d', texts, clipRefs };
}

/**
 * POST /api/tv/submit { id, project, clips: { <clipId>: { mime, b64, dur } }, thumbs[] } → { ok, listing } | { ok:false, error }
 * Vai para a MESMA fila de moderação (tipo "filme"); aprovado entra no canal.
 */
export async function tvSubmit(req: Request, env: Env): Promise<Response> {
  const body = await readBody(req, TV.maxBytes + 256 * 1024);
  const w = await who(env, body.id);
  await limit(env, 'tvsub:' + w.pid, 6, 3600_000);
  await limit(env, 'tvsubip:' + ip(req), 20, 3600_000);
  const fail = (error: string) => json({ ok: false, error });
  const info = filmInfo(body.project);
  if (!info) return fail('invalid');
  if (info.dur < TV.minDurSec) return fail('empty');
  if (info.dur > TV.maxDurSec + 0.01) return fail('too-long');
  const ex = await extra(env);
  const title = str(body.title ?? info.title, 60);
  if (!title || textProblem(title, ex)) return fail('name');
  // vozes: só as referenciadas, base64 limpo, tipo de áudio
  const clips: TvPayload['clips'] = {};
  let bytes = 0;
  const raw = body.clips && typeof body.clips === 'object' ? (body.clips as Record<string, any>) : {};
  for (const [k, c] of Object.entries(raw).slice(0, TV.maxClips)) {
    if (!info.clipRefs.has(k) || !/^[A-Za-z0-9_-]{1,40}$/.test(k)) continue;
    const mime = String(c?.mime ?? '');
    const b64 = String(c?.b64 ?? '');
    if (!/^audio\/[a-z0-9.+-]+(;\s*codecs=[a-z0-9.,"' -]+)?$/i.test(mime) || !/^[A-Za-z0-9+/=]+$/.test(b64)) continue;
    clips[k] = { mime: mime.slice(0, 60), b64, dur: Math.max(0, Math.min(60, Number(c?.dur) || 0)) };
    bytes += b64.length;
  }
  const projectJson = JSON.stringify(body.project);
  bytes += projectJson.length;
  if (bytes > TV.maxBytes) return fail('too-big');
  const id = String(body.project.id ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
  if (!id) return fail('invalid');
  const fid = 'tv_' + id;
  const flags = autoFlags(info.texts, ex);
  if (Object.keys(clips).length) flags.push(`🎙️ ${Object.keys(clips).length} gravação(ões) de voz — ouça antes de aprovar`);
  const r = await ugcHub(env).publish({
    id: fid,
    type: 'filme',
    pid: w.pid,
    aid: w.aid,
    aname: w.name,
    title,
    descr: '',
    category: 'filme',
    kind: info.mode,
    tags: [],
    meta: { dur: Math.round(info.dur * 10) / 10, mode: info.mode, clips: Object.keys(clips).length, bytes },
    thumbs: cleanThumbs(body.thumbs),
    flags,
    dailyLimit: TV.maxFilmsPerDay,
  });
  if (!r.ok) return fail(r.error === 'taken' ? 'invalid' : r.error);
  // reenviado: sai do ar até a nova revisão
  if (!r.isNew) await tvChannel(env).removeFilm(fid);
  await env.DATA.put('ugc:f:' + fid, JSON.stringify({ project: body.project, clips } satisfies TvPayload));
  return json({ ok: true, listing: r.item });
}

/** POST /api/tv/vote { id, film } → { votes, voted } */
export async function tvVote(req: Request, env: Env): Promise<Response> {
  const body = await readBody(req, 4096);
  const w = await who(env, body.id);
  await limit(env, 'vote:' + w.pid, 30, 600_000);
  await limit(env, 'voteip:' + ip(req), 120, 600_000);
  const r = await tvChannel(env).vote(itemId(body.film), w.pid, w.trusted);
  if (!r.ok) return json({ error: r.error, message: r.error === 'self' ? 'Não dá para votar no próprio filme.' : 'Filme fora do ar.' }, r.error === 'self' ? 400 : 404);
  await deliver(env, r.grant, 'tv');
  return json({ votes: r.votes, voted: r.voted });
}

/** GET /api/tv/voted?pid=&f= → { voted } */
export async function tvVoted(req: Request, env: Env): Promise<Response> {
  const sp = new URL(req.url).searchParams;
  const pid = sp.get('pid') ?? '';
  return json({ voted: PLAYER_ID_RE.test(pid) ? await tvChannel(env).voted(itemId(sp.get('f')), pid) : false });
}
