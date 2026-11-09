/**
 * CASAS — design (JSON livre, ≤16 KB) + sujeira persistente (≤300 itens).
 *
 * KV:
 *   home:<ownerId>       → { design, visitsOpen, updatedAt }   (só o dono grava; ≥3 s entre gravações)
 *   home:<ownerId>:mess  → { mess: MessItem[], updatedAt }     (separado: a festa grava sem tocar no design)
 *
 * Regras da sujeira (PUT /api/home/mess):
 *   - dono: substitui a lista inteira;
 *   - amigo: só pode REMOVER itens (limpar). ADICIONAR só vale se houver uma festa ativa na casa e
 *     ele estiver nela — nesse caso a mudança vai para o PartyRoom (autoritativo), que grava no KV
 *     no fim da festa e no máx. a cada 60 s (economiza escritas do KV: plano grátis = 1.000/dia).
 *   - outros: 403.
 */
import { hub, requireId } from './friends';
import { HttpError, json, readJson } from './util';

export const DESIGN_MAX_BYTES = 16 * 1024;
export const MESS_MAX = 300;
const DESIGN_MIN_MS = 3000;
export const MESS_KINDS = ['cake', 'frosting', 'juice', 'crumbs', 'confetti', 'tomato', 'pie', 'balloon-pop', 'mud'];

export interface MessItem {
  id: string;
  kind: string;
  room: string;
  x: number;
  y: number;
  r: number;
  rot?: number;
  moved?: { itemId: string; ox: number; oy: number };
}
export interface HomeRec {
  design: Record<string, unknown>;
  visitsOpen: boolean;
  updatedAt: number;
}
export interface MessRec {
  mess: MessItem[];
  updatedAt: number;
}

const homeKey = (id: string) => 'home:' + id;
const messKey = (id: string) => 'home:' + id + ':mess';
const fin = (v: unknown, lim = 1e6) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(-lim, Math.min(lim, Math.round(n * 100) / 100)) : NaN;
};
const str = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : null);

/** Valida/normaliza um item de sujeira; null se inválido. */
export function cleanMess(v: unknown): MessItem | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const id = str(o.id, 32);
  const room = str(o.room, 32);
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id) || room === null || !MESS_KINDS.includes(String(o.kind))) return null;
  const x = fin(o.x);
  const y = fin(o.y);
  const r = fin(o.r, 1000);
  if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(r)) return null;
  const m: MessItem = { id, kind: String(o.kind), room, x, y, r: Math.max(0, r) };
  if (o.rot !== undefined && !Number.isNaN(fin(o.rot))) m.rot = fin(o.rot);
  if (o.moved && typeof o.moved === 'object') {
    const mv = o.moved as Record<string, unknown>;
    const itemId = str(mv.itemId, 48);
    if (itemId && !Number.isNaN(fin(mv.ox)) && !Number.isNaN(fin(mv.oy))) m.moved = { itemId, ox: fin(mv.ox), oy: fin(mv.oy) };
  }
  return m;
}

export function cleanMessList(v: unknown): MessItem[] | null {
  if (!Array.isArray(v) || v.length > MESS_MAX) return null;
  const out: MessItem[] = [];
  const seen = new Set<string>();
  for (const x of v) {
    const m = cleanMess(x);
    if (m && !seen.has(m.id)) seen.add(m.id), out.push(m);
  }
  return out;
}

/** Validação rasa do HomeDesign (o servidor não interpreta o catálogo). */
export function validDesign(d: unknown): string | null {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return 'not_object';
  const o = d as Record<string, unknown>;
  if (o.v !== 1) return 'bad_version';
  const flat = (x: unknown) =>
    !!x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length <= 64 && Object.values(x).every((v) => typeof v === 'number' || (typeof v === 'string' && v.length <= 64));
  if (!flat(o.planet) || !flat(o.exterior)) return 'bad_planet_or_exterior';
  if (!Array.isArray(o.rooms) || o.rooms.length > 24) return 'bad_rooms';
  for (const r of o.rooms as unknown[]) {
    if (!r || typeof r !== 'object') return 'bad_room';
    const rr = r as Record<string, unknown>;
    if (!str(rr.id, 32) || typeof rr.floor !== 'string' || typeof rr.wall !== 'string' || !Array.isArray(rr.items) || rr.items.length > 300) return 'bad_room';
    for (const it of rr.items as unknown[]) {
      if (!it || typeof it !== 'object') return 'bad_item';
      const i = it as Record<string, unknown>;
      if (typeof i.id !== 'string' || !Number.isFinite(i.x) || !Number.isFinite(i.y)) return 'bad_item';
    }
  }
  return null;
}

export async function loadHome(env: Env, id: string): Promise<HomeRec | null> {
  return env.DATA.get<HomeRec>(homeKey(id), 'json');
}
export async function loadMess(env: Env, id: string): Promise<MessRec> {
  return (await env.DATA.get<MessRec>(messKey(id), 'json')) ?? { mess: [], updatedAt: 0 };
}
/** Grava a sujeira no KV e atualiza o "nível de bagunça" do cartão do dono (amigos veem). */
export async function saveMess(env: Env, id: string, mess: MessItem[]): Promise<number> {
  const updatedAt = Date.now();
  await env.DATA.put(messKey(id), JSON.stringify({ mess, updatedAt } satisfies MessRec));
  await hub(env).setMess(id, messLevel(mess.length));
  return updatedAt;
}
export const messLevel = (n: number) => Math.min(1, Math.round((n / 40) * 100) / 100);

const party = (env: Env, ownerId: string) => env.PARTY.get(env.PARTY.idFromName(ownerId));

/** GET /api/home/<ownerId>?id=<quem vê> → HomeState (dono ou amigos) */
export async function homeGet(req: Request, env: Env, ownerId: string): Promise<Response> {
  requireId(ownerId, 'owner');
  const viewer = requireId(new URL(req.url).searchParams.get('id'));
  if (viewer !== ownerId && !(await hub(env).areFriends(ownerId, viewer))) throw new HttpError(403, 'not_friend', 'Só amigos podem visitar esta casa.');
  const [home, mess] = await Promise.all([loadHome(env, ownerId), loadMess(env, ownerId)]);
  if (!home) return json({ error: 'not_found', message: 'Casa ainda não construída.' }, 404);
  return json({ ownerId, design: home.design, mess: mess.mess, updatedAt: Math.max(home.updatedAt, mess.updatedAt), visitsOpen: home.visitsOpen });
}

/** PUT /api/home/design { id, design, visitsOpen? } — só o dono */
export async function homePutDesign(req: Request, env: Env): Promise<Response> {
  const b = await readJson(req);
  const id = requireId(b.id);
  const size = new TextEncoder().encode(JSON.stringify(b.design ?? null)).length;
  if (size > DESIGN_MAX_BYTES) throw new HttpError(413, 'too_large', 'A casa ficou grande demais (máx. 16 KB).');
  const prev = await env.DATA.getWithMetadata<HomeRec, { t: number }>(homeKey(id), 'json');
  const design = b.design === undefined && prev.value ? prev.value.design : b.design;
  const bad = validDesign(design);
  if (bad) throw new HttpError(400, 'bad_design', 'Design inválido: ' + bad);
  if (prev.metadata && Date.now() - prev.metadata.t < DESIGN_MIN_MS) throw new HttpError(429, 'too_fast', 'Salvando rápido demais. Tente de novo em instantes.');
  const visitsOpen = typeof b.visitsOpen === 'boolean' ? b.visitsOpen : (prev.value?.visitsOpen ?? true);
  const rec: HomeRec = { design: design as Record<string, unknown>, visitsOpen, updatedAt: Date.now() };
  await env.DATA.put(homeKey(id), JSON.stringify(rec), { metadata: { t: rec.updatedAt } });
  return json({ ok: true, updatedAt: rec.updatedAt });
}

/** PUT /api/home/mess { id, ownerId, mess } — dono (substitui) ou amigo (limpar; adicionar só na festa) */
export async function homePutMess(req: Request, env: Env): Promise<Response> {
  const b = await readJson(req);
  const id = requireId(b.id);
  const ownerId = requireId(b.ownerId, 'owner');
  const mess = cleanMessList(b.mess);
  if (!mess) throw new HttpError(400, 'bad_mess', `Lista de sujeira inválida (máx. ${MESS_MAX}).`);
  const isOwner = id === ownerId;
  if (!isOwner && !(await hub(env).areFriends(ownerId, id))) throw new HttpError(403, 'not_friend', 'Só o dono e os amigos mexem nesta casa.');
  // festa ativa? o PartyRoom é a fonte da verdade
  const viaParty = await party(env, ownerId).applyMess(id, mess);
  if (viaParty) {
    if (!viaParty.ok) throw new HttpError(403, viaParty.error ?? 'forbidden', 'Só quem está na festa pode sujar a casa.');
    return json({ ok: true, count: viaParty.count, party: true });
  }
  if (isOwner) {
    await saveMess(env, ownerId, mess);
    return json({ ok: true, count: mess.length });
  }
  const cur = (await loadMess(env, ownerId)).mess;
  const curIds = new Set(cur.map((m) => m.id));
  if (mess.some((m) => !curIds.has(m.id))) throw new HttpError(403, 'not_in_party', 'Só quem está na festa pode sujar a casa.');
  const keep = new Set(mess.map((m) => m.id));
  const next = cur.filter((m) => keep.has(m.id));
  if (next.length !== cur.length) await saveMess(env, ownerId, next);
  return json({ ok: true, count: next.length, cleaned: cur.length - next.length });
}
