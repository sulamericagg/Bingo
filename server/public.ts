/** API pública usada pelo jogo. */
import { normalizeCode, type Gift, type PublicChallenge, type RedeemResult, type RewardPack } from '../shared/reward';
import {
  getCode,
  getGifts,
  getPlayer,
  listChallenges,
  pendingGiftsFor,
  putCode,
  putPlayer,
  type GiftRec,
  type PlayerRec,
} from './store';
import { codeSummary } from './summary';
import { cleanName, HttpError, json, num, PLAYER_ID_RE, randomPlayerName, readJson } from './util';

/** Só regrava o jogador no sync se algo mudou ou o lastSeen está velho (economiza escritas do KV). */
const SEEN_REFRESH_MS = 30 * 60_000;

function giftOut(g: GiftRec): Gift {
  return { id: g.id, title: g.title, message: g.message, reward: withText(g.reward, g.title, g.message), sentAt: g.sentAt, expiresAt: g.expiresAt };
}

function withText(pack: RewardPack, title: string, message: string): RewardPack {
  const out = { ...pack };
  if (title && !out.title) out.title = title;
  if (message && !out.message) out.message = message;
  return out;
}

function newPlayer(id: string, name: string, platform: string, version: string): PlayerRec {
  const now = Date.now();
  return { id, name, platform, version, best: 0, runs: 0, coins: 0, gems: 0, created: now, lastSeen: now, claimed: [], redeemed: [] };
}

function requireId(v: unknown): string {
  const id = String(v ?? '');
  if (!PLAYER_ID_RE.test(id)) throw new HttpError(400, 'bad_id', 'id do jogador inválido');
  return id;
}

const cleanPlatform = (v: unknown) => String(v ?? 'web').replace(/[^a-z0-9_-]/gi, '').slice(0, 12) || 'web';
const cleanVersion = (v: unknown) => String(v ?? '').replace(/[^\w.+-]/g, '').slice(0, 20);

/** Busca o jogador ou cria um novo (o jogo pode chamar sync antes de register). */
async function loadOrCreate(env: Env, id: string, body: Record<string, any>): Promise<{ p: PlayerRec; created: boolean }> {
  const p = await getPlayer(env, id);
  if (p) return { p, created: false };
  return { p: newPlayer(id, cleanName(body.name) || randomPlayerName(), cleanPlatform(body.platform), cleanVersion(body.version)), created: true };
}

/** POST /api/player/register { id?, name?, platform, version } → { id, name } */
export async function register(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req);
  const id = body.id && PLAYER_ID_RE.test(String(body.id)) ? String(body.id) : crypto.randomUUID();
  const { p, created } = await loadOrCreate(env, id, body);
  let dirty = created;
  const platform = cleanPlatform(body.platform);
  const version = cleanVersion(body.version);
  const name = cleanName(body.name);
  if (name && name !== p.name) (p.name = name), (dirty = true);
  if (platform !== p.platform || version !== p.version) (p.platform = platform), (p.version = version), (dirty = true);
  if (Date.now() - p.lastSeen > SEEN_REFRESH_MS) (p.lastSeen = Date.now()), (dirty = true);
  if (dirty) await putPlayer(env, p);
  return json({ id: p.id, name: p.name });
}

/** POST /api/player/sync { id, best, runs, coins, gems, name? } → { name, inbox: Gift[] } */
export async function sync(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req);
  const id = requireId(body.id);
  const { p, created } = await loadOrCreate(env, id, body);
  let dirty = created;
  const best = Math.max(p.best, num(body.best, 1e9));
  const runs = Math.max(p.runs, num(body.runs, 1e9));
  const coins = num(body.coins, 1e12);
  const gems = num(body.gems, 1e12);
  if (best !== p.best || runs !== p.runs || coins !== p.coins || gems !== p.gems) {
    Object.assign(p, { best, runs, coins, gems });
    dirty = true;
  }
  const name = cleanName(body.name);
  if (name && name !== p.name) (p.name = name), (dirty = true);
  if (body.platform || body.version) {
    const platform = cleanPlatform(body.platform);
    const version = cleanVersion(body.version);
    if (platform !== p.platform || version !== p.version) (p.platform = platform), (p.version = version), (dirty = true);
  }
  const now = Date.now();
  if (dirty || now - p.lastSeen > SEEN_REFRESH_MS) {
    p.lastSeen = now;
    await putPlayer(env, p);
  }
  const inbox = pendingGiftsFor(p, await getGifts(env)).map(giftOut);
  return json({ name: p.name, inbox });
}

/** POST /api/inbox/claim { id, giftIds[] } → { rewards: RewardPack[], claimed: string[] } */
export async function claim(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req);
  const id = requireId(body.id);
  const ids: string[] = Array.isArray(body.giftIds) ? body.giftIds.map(String).slice(0, 200) : [];
  const p = await getPlayer(env, id);
  if (!p || !ids.length) return json({ rewards: [], claimed: [] });
  const gifts = await getGifts(env, true);
  const pending = pendingGiftsFor(p, gifts).filter((g) => ids.includes(g.id));
  if (!pending.length) return json({ rewards: [], claimed: [] });
  // Mantém só ids de presentes que ainda existem (a lista não cresce para sempre).
  const live = new Set(gifts.map((g) => g.id));
  p.claimed = [...p.claimed.filter((c) => live.has(c)), ...pending.map((g) => g.id)];
  p.lastSeen = Date.now();
  await putPlayer(env, p);
  return json({ rewards: pending.map((g) => withText(g.reward, g.title, g.message)), claimed: pending.map((g) => g.id) });
}

/** POST /api/redeem { id, code } → { ok, reward?, error? } */
export async function redeem(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req);
  const id = requireId(body.id);
  const key = normalizeCode(String(body.code ?? ''));
  const fail = (error: NonNullable<RedeemResult['error']>) => json({ ok: false, error } satisfies RedeemResult);
  if (key.length < 3) return fail('invalid');
  const code = await getCode(env, key);
  const now = Date.now();
  if (!code || !code.active) return fail('invalid');
  if (code.startsAt && code.startsAt > now) return fail('invalid');
  if (code.expiresAt && code.expiresAt <= now) return fail('expired');
  const { p } = await loadOrCreate(env, id, body);
  if (p.redeemed.includes(key)) return fail('used');
  if (code.maxUses > 0 && code.uses >= code.maxUses) return fail('limit');

  code.uses++;
  code.recent = [{ p: p.id, n: p.name, t: now }, ...(code.recent ?? [])].slice(0, 50);
  p.redeemed.push(key);
  p.lastSeen = now;
  await Promise.all([putCode(env, code, codeSummary(code.reward)), putPlayer(env, p)]);
  const reward: RewardPack = { ...code.reward };
  reward.title ??= 'Código resgatado!';
  return json({ ok: true, reward } satisfies RedeemResult);
}

/** GET /api/challenges → { challenges: PublicChallenge[] } */
export async function challenges(_req: Request, env: Env): Promise<Response> {
  const now = Date.now();
  const list: PublicChallenge[] = (await listChallenges(env))
    .filter((c) => c.active && (!c.startsAt || c.startsAt <= now) && (!c.endsAt || c.endsAt > now))
    .map((c) => ({ id: c.id, title: c.title, description: c.description, link: c.link, startsAt: c.startsAt, endsAt: c.endsAt, reward: c.reward }));
  return json({ challenges: list }, 200, { 'cache-control': 'public, max-age=60' });
}
