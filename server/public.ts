/** API pública usada pelo jogo. */
import { normalizeCode, type Gift, type PublicChallenge, type RedeemResult, type RewardPack } from '../shared/reward';
import { adminHub } from './admin-hub';
import { getGifts, getPlayer, importLegacyCode, listChallenges, pendingGiftsFor, putPlayer, type GiftRec, type PlayerRec } from './store';
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
  await env.FRIENDS.get(env.FRIENDS.idFromName('hub'))
    .touch(id)
    .catch(() => {});
  const inbox = p.banned ? [] : pendingGiftsFor(p, await getGifts(env)).map(giftOut);
  // status "entregue" no painel (só quando há algo na caixa: não custa nada no caso comum)
  if (inbox.length) await adminHub(env).markSeen(id, inbox.map((g) => g.id)).catch(() => {});
  return json({ name: p.name, inbox, flags: p.flags ?? [] });
}

const DAY = 86_400_000;

/** Efeitos de um pacote que o servidor também acompanha (Clube / Passe) para o painel. */
export function trackPack(p: PlayerRec, pack: RewardPack, now = Date.now()): void {
  if (pack.clubDays) p.clubUntil = Math.max(p.clubUntil ?? 0, now) + pack.clubDays * DAY;
  if (pack.passSeason !== undefined) p.passSeason = Math.max(p.passSeason ?? -1, pack.passSeason);
}

/** POST /api/inbox/claim { id, giftIds[] } → { rewards: RewardPack[], claimed: string[] } */
export async function claim(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req);
  const id = requireId(body.id);
  const ids: string[] = Array.isArray(body.giftIds) ? body.giftIds.map(String).slice(0, 200) : [];
  const p = await getPlayer(env, id);
  if (!p || !ids.length || p.banned) return json({ rewards: [], claimed: [] });
  const gifts = await getGifts(env, true);
  let pending = pendingGiftsFor(p, gifts).filter((g) => ids.includes(g.id));
  if (!pending.length) return json({ rewards: [], claimed: [] });
  // Atômico no AdminHub: dois aparelhos pegando ao mesmo tempo não recebem em dobro.
  const fresh = new Set(await adminHub(env).claimGifts(id, pending.map((g) => g.id)));
  pending = pending.filter((g) => fresh.has(g.id));
  // Mantém só ids de presentes que ainda existem (a lista não cresce para sempre).
  const live = new Set(gifts.map((g) => g.id));
  p.claimed = [...new Set([...p.claimed.filter((c) => live.has(c)), ...fresh])];
  p.lastSeen = Date.now();
  for (const g of pending) trackPack(p, g.reward);
  await putPlayer(env, p);
  return json({ rewards: pending.map((g) => withText(g.reward, g.title, g.message)), claimed: pending.map((g) => g.id) });
}

/** POST /api/redeem { id, code } → { ok, reward?, error? }  (regras e contagem atômicas no AdminHub) */
export async function redeem(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req);
  const id = requireId(body.id);
  const key = normalizeCode(String(body.code ?? ''));
  const ip = req.headers.get('cf-connecting-ip') ?? 'local';
  const fail = (error: NonNullable<RedeemResult['error']>) => json({ ok: false, error } satisfies RedeemResult);
  if (key.length < 3) return fail('invalid');
  const { p } = await loadOrCreate(env, id, body);
  if (p.banned) return fail('invalid');
  const hub = adminHub(env);
  let r = await hub.redeem(key, id, p.name, p.redeemed.includes(key), ip);
  if (!r.ok && r.error === 'missing' && (await importLegacyCode(env, key))) r = await hub.redeem(key, id, p.name, p.redeemed.includes(key), ip);
  if (!r.ok) {
    if (r.error === 'missing') await hub.noteFail(id, ip);
    return fail(r.error === 'missing' ? 'invalid' : r.error);
  }
  if (!p.redeemed.includes(key)) p.redeemed = [...p.redeemed, key].slice(-500);
  p.lastSeen = Date.now();
  trackPack(p, r.reward);
  await putPlayer(env, p);
  const reward: RewardPack = { ...r.reward };
  reward.title ??= 'Código resgatado!';
  return json({ ok: true, reward } satisfies RedeemResult);
}

/** GET /api/challenges → { challenges: PublicChallenge[] } */
export async function challenges(_req: Request, env: Env): Promise<Response> {
  const now = Date.now();
  const list: PublicChallenge[] = (await listChallenges(env))
    .filter((c) => c.active && (!c.startsAt || c.startsAt <= now) && (!c.endsAt || c.endsAt > now))
    .map((c) => ({ id: c.id, title: c.title, description: c.description, link: c.link, startsAt: c.startsAt, endsAt: c.endsAt, reward: c.reward }));
  // ajustes opcionais de anúncios (docs/ANUNCIOS.md): KV `cfg:ads` = JSON com os campos de AD_BREAKS
  const ads = await env.DATA.get('cfg:ads', 'json').catch(() => null);
  return json(ads ? { challenges: list, ads } : { challenges: list }, 200, { 'cache-control': 'public, max-age=60' });
}
