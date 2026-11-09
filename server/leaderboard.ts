/**
 * Ranking global (Workers KV).
 *
 * Chaves:
 *   lb:all              → LbBlob  (top 200 de todos os tempos)
 *   lb:week:<AAAA-Wnn>  → LbBlob  (top 200 da semana; expira sozinho após ~3 semanas)
 *   lb:banned           → string[] (ids bloqueados pelo admin)
 *
 * Cada placar é UM valor no KV: ler o ranking custa 1 leitura e só gravamos quando
 * a pontuação entra no top 200 ou melhora o recorde do próprio jogador — essencial
 * no plano grátis (1.000 escritas/dia).
 */
import { CATALOG_SKINS } from '../shared/catalog';
import { isoWeek, plausibleMax, type LbResponse, type LbScope } from '../shared/leaderboard';
import { cleanName, HttpError, json, num, PLAYER_ID_RE, readJson } from './util';

export const LB_SIZE = 200;
export const LB_PUBLIC = 100;
const WEEK_TTL_S = 21 * 86400;
const MAX_SCORE = 100_000;

export interface LbEntry {
  id: string;
  name: string;
  score: number;
  skin: string;
  /** quando o recorde foi feito (ms) */
  t: number;
}

interface LbBlob {
  entries: LbEntry[];
  updated: number;
}


const keyFor = (scope: LbScope, week = isoWeek()) => (scope === 'all' ? 'lb:all' : `lb:week:${week}`);

const cache = new Map<string, { at: number; blob: LbBlob }>();

async function getBlob(env: Env, key: string, fresh = false): Promise<LbBlob> {
  const c = cache.get(key);
  if (!fresh && c && Date.now() - c.at < 10_000) return c.blob;
  const blob = (await env.DATA.get<LbBlob>(key, 'json')) ?? { entries: [], updated: 0 };
  cache.set(key, { at: Date.now(), blob });
  return blob;
}

async function putBlob(env: Env, key: string, blob: LbBlob): Promise<void> {
  blob.updated = Date.now();
  await env.DATA.put(key, JSON.stringify(blob), key.startsWith('lb:week:') ? { expirationTtl: WEEK_TTL_S } : undefined);
  cache.set(key, { at: Date.now(), blob });
}

const SKIN_IDS = new Set(CATALOG_SKINS.map((s) => s.id));

const sortEntries = (a: LbEntry, b: LbEntry) => b.score - a.score || a.t - b.t;

async function getBanned(env: Env): Promise<string[]> {
  return (await env.DATA.get<string[]>('lb:banned', 'json')) ?? [];
}

/**
 * Tenta colocar a pontuação no placar. Devolve a nova posição (1-based) ou null se
 * ficou fora do top. Só grava no KV se algo mudou.
 */
async function offer(env: Env, key: string, e: LbEntry): Promise<{ rank: number | null; best: number; wrote: boolean }> {
  const blob = await getBlob(env, key, true);
  const list = blob.entries;
  const i = list.findIndex((x) => x.id === e.id);
  const cur = i >= 0 ? list[i] : null;
  if (cur && cur.score >= e.score) {
    // não melhorou: só atualiza nome/skin se mudaram (raro)
    if (cur.name !== e.name || cur.skin !== e.skin) {
      cur.name = e.name;
      cur.skin = e.skin;
      await putBlob(env, key, blob);
    }
    return { rank: i + 1, best: cur.score, wrote: false };
  }
  if (!cur && list.length >= LB_SIZE && e.score <= list[list.length - 1].score) return { rank: null, best: e.score, wrote: false };
  if (cur) list.splice(i, 1);
  list.push(e);
  list.sort(sortEntries);
  if (list.length > LB_SIZE) list.length = LB_SIZE;
  await putBlob(env, key, blob);
  const r = list.findIndex((x) => x.id === e.id);
  return { rank: r >= 0 ? r + 1 : null, best: e.score, wrote: true };
}

/** POST /api/score { id, score, skin, name?, duration (ms) } */
export async function submitScore(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req);
  const id = String(body.id ?? '');
  if (!PLAYER_ID_RE.test(id)) throw new HttpError(400, 'bad_id', 'id do jogador inválido');
  const score = num(body.score, 1e9);
  const durSec = num(body.duration, 1e9) / 1000;
  if (score <= 0) throw new HttpError(400, 'bad_score', 'Pontuação inválida');
  if (score > MAX_SCORE || durSec < 1 || score > plausibleMax(durSec)) {
    console.warn('score rejeitado', { id, score, durSec });
    throw new HttpError(422, 'implausible', 'Pontuação rejeitada');
  }
  if ((await getBanned(env)).includes(id)) return json({ ok: false, error: 'banned' }, 403);
  const skin = SKIN_IDS.has(String(body.skin)) ? String(body.skin) : 'bloop';
  const name = cleanName(body.name) || 'Bloop';
  const e: LbEntry = { id, name, score, skin, t: Date.now() };
  const [all, week] = await Promise.all([offer(env, keyFor('all'), { ...e }), offer(env, keyFor('week'), { ...e })]);
  return json({ ok: true, rank: { all: all.rank, week: week.rank }, best: { all: all.best, week: week.best } });
}

/** GET /api/leaderboard?scope=all|week&me=<id> → top 100 + posição do jogador */
export async function getLeaderboard(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const scope: LbScope = url.searchParams.get('scope') === 'week' ? 'week' : 'all';
  const me = url.searchParams.get('me') ?? '';
  const week = isoWeek();
  const blob = await getBlob(env, keyFor(scope, week));
  // ids NÃO são expostos (o id funciona como credencial do jogador)
  const entries = blob.entries.slice(0, LB_PUBLIC).map((x, i) => ({ rank: i + 1, name: x.name, score: x.score, skin: x.skin, ...(x.id === me ? { me: true } : {}) }));
  const mi = me ? blob.entries.findIndex((x) => x.id === me) : -1;
  const mine = mi >= 0 ? { rank: mi + 1, score: blob.entries[mi].score, name: blob.entries[mi].name, skin: blob.entries[mi].skin } : null;
  return json({ scope, week, total: blob.entries.length, entries, me: mine } satisfies LbResponse);
}

/* ---------------- admin ---------------- */

export async function adminLeaderboard(env: Env, scope: LbScope, week?: string): Promise<{ week: string; entries: LbEntry[]; banned: string[] }> {
  const w = week && /^\d{4}-W\d{2}$/.test(week) ? week : isoWeek();
  const [blob, banned] = await Promise.all([getBlob(env, keyFor(scope, w), true), getBanned(env)]);
  return { week: w, entries: blob.entries, banned };
}

/** Remove o jogador do placar geral e da semana atual; opcionalmente bloqueia novos envios. */
export async function adminRemove(env: Env, id: string, ban: boolean): Promise<{ removed: number }> {
  let removed = 0;
  for (const key of [keyFor('all'), keyFor('week')]) {
    const blob = await getBlob(env, key, true);
    const n = blob.entries.length;
    blob.entries = blob.entries.filter((x) => x.id !== id);
    if (blob.entries.length !== n) {
      removed += n - blob.entries.length;
      await putBlob(env, key, blob);
    }
  }
  if (ban) {
    const list = await getBanned(env);
    if (!list.includes(id)) await env.DATA.put('lb:banned', JSON.stringify([...list, id].slice(-2000)));
  }
  return { removed };
}

export async function adminUnban(env: Env, id: string): Promise<void> {
  const list = await getBanned(env);
  if (list.includes(id)) await env.DATA.put('lb:banned', JSON.stringify(list.filter((x) => x !== id)));
}
