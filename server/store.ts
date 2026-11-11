/**
 * Camada de dados sobre Workers KV (binding DATA).
 *
 * Chaves:
 *   player:<id>        → PlayerRec           (metadata PlayerMeta, para listar sem get)
 *   code:<NORMALIZADO> → CodeRec ANTIGO (legado). Códigos agora vivem no Durable Object AdminHub
 *                        (server/admin-hub.ts); os antigos são importados na primeira consulta.
 *   challenge:<id>     → ChallengeRec        (metadata ChallengeMeta)
 *   gifts              → GiftRec[]           (todos os presentes ativos; 1 leitura por sync)
 *   presets            → Preset[]
 *   rl:login:<ip>      → tentativas de login (expira sozinho)
 *
 * Presentes ficam num índice único em vez de uma caixa por jogador: enviar um
 * presente para "todos" custa 1 escrita, não 1 por jogador (o plano grátis do KV
 * permite só 1.000 escritas/dia). O jogador guarda em `claimed` os presentes já
 * resgatados e em `redeemed` os códigos já usados.
 */
import { type RewardPack } from '../shared/reward';
import { adminHub, type CodeDef, type CodeRec } from './admin-hub';

export type { CodeDef, CodeRec } from './admin-hub';

/** Permissões/selos que o painel pode dar a um jogador. */
export const PLAYER_FLAGS = ['beta', 'mod', 'vip', 'tester', 'creator'] as const;
export type PlayerFlag = (typeof PLAYER_FLAGS)[number];

export interface PlayerRec {
  id: string;
  name: string;
  platform: string;
  version: string;
  best: number;
  runs: number;
  coins: number;
  gems: number;
  created: number;
  lastSeen: number;
  claimed: string[];
  redeemed: string[];
  /** @nome atual (cópia; a fonte é ph:<id>) */
  handle?: string;
  flags?: string[];
  banned?: { reason: string; t: number } | null;
  /** Clube Bloop: maior validade conhecida (compra reportada ou presente do painel) */
  clubUntil?: number;
  /** Passe premium dado pelo painel (índice da temporada) */
  passSeason?: number;
  /** nº de compras reportadas pelo app */
  purchases?: number;
  notes?: string;
}

interface PlayerMeta {
  n: string;
  b: number;
  r: number;
  s: number;
  p: string;
  c: number;
  h?: string;
  f?: string;
  x?: 1;
  cu?: number;
  $?: number;
  co?: number;
  ge?: number;
}

export interface PlayerRow {
  id: string;
  name: string;
  best: number;
  runs: number;
  lastSeen: number;
  platform: string;
  created: number;
  handle: string;
  flags: string[];
  banned: boolean;
  clubUntil: number;
  purchases: number;
  coins: number;
  gems: number;
}

/** Formato antigo do KV (só para importar). */
interface LegacyCodeRec {
  code: string;
  key: string;
  reward: RewardPack;
  maxUses: number;
  uses: number;
  startsAt: number | null;
  expiresAt: number | null;
  active: boolean;
  notes: string;
  createdAt: number;
  batch?: string;
  challengeId?: string;
}

interface CodeMeta {
  d: string;
  u: number;
  m: number;
  a: 0 | 1;
  s: number | null;
  e: number | null;
  c: number;
  n?: string;
  b?: string;
  ch?: string;
  r?: string;
}

export type CodeRow = Omit<CodeRec, 'recent' | 'reward' | 'batch' | 'challengeId'> & { summary: string; batch: string | null; challengeId: string | null };

export interface ChallengeRec {
  id: string;
  title: string;
  description: string;
  link: string;
  code: string;
  codeKey: string;
  reward: RewardPack;
  maxUses: number;
  startsAt: number | null;
  endsAt: number | null;
  active: boolean;
  createdAt: number;
}

export interface GiftRec {
  id: string;
  title: string;
  message: string;
  reward: RewardPack;
  sentAt: number;
  expiresAt: number | null;
  /** 'all' = todos os jogadores cadastrados até `sentAt`; senão lista de ids. */
  to: 'all' | string[];
  label: string;
  count: number;
}

export interface Preset {
  id: string;
  name: string;
  pack: RewardPack;
  updatedAt: number;
}

/* ---------------- Jogadores ---------------- */

export async function getPlayer(env: Env, id: string): Promise<PlayerRec | null> {
  const p = await env.DATA.get<PlayerRec>('player:' + id, 'json');
  if (!p) return null;
  p.claimed ??= [];
  p.redeemed ??= [];
  p.flags ??= [];
  return p;
}

export async function putPlayer(env: Env, p: PlayerRec): Promise<void> {
  const meta: PlayerMeta = { n: p.name, b: p.best, r: p.runs, s: p.lastSeen, p: p.platform.slice(0, 12), c: p.created };
  if (p.handle) meta.h = p.handle;
  if (p.flags?.length) meta.f = p.flags.join(',');
  if (p.banned) meta.x = 1;
  if (p.clubUntil) meta.cu = p.clubUntil;
  if (p.purchases) meta.$ = p.purchases;
  if (p.coins) meta.co = p.coins;
  if (p.gems) meta.ge = p.gems;
  await env.DATA.put('player:' + p.id, JSON.stringify(p), { metadata: meta });
  playerCache = null;
}

let playerCache: { at: number; rows: PlayerRow[] } | null = null;

/** Lista todos os jogadores via list() + metadata (sem um get por jogador). */
export async function listPlayers(env: Env, fresh = false): Promise<PlayerRow[]> {
  if (!fresh && playerCache && Date.now() - playerCache.at < 15_000) return playerCache.rows;
  const rows: PlayerRow[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 100; page++) {
    const res: KVNamespaceListResult<PlayerMeta, string> = await env.DATA.list<PlayerMeta>({ prefix: 'player:', cursor, limit: 1000 });
    for (const k of res.keys) {
      const m = k.metadata;
      rows.push({
        id: k.name.slice(7),
        name: m?.n ?? '?',
        best: m?.b ?? 0,
        runs: m?.r ?? 0,
        lastSeen: m?.s ?? 0,
        platform: m?.p ?? '',
        created: m?.c ?? 0,
        handle: m?.h ?? '',
        flags: m?.f ? m.f.split(',') : [],
        banned: m?.x === 1,
        clubUntil: m?.cu ?? 0,
        purchases: m?.$ ?? 0,
        coins: m?.co ?? 0,
        gems: m?.ge ?? 0,
      });
    }
    if (res.list_complete) break;
    cursor = res.cursor;
  }
  playerCache = { at: Date.now(), rows };
  return rows;
}

/* ---------------- Códigos (Durable Object AdminHub) ---------------- */

function fromLegacy(c: LegacyCodeRec, summary: string): CodeDef {
  return {
    code: c.code,
    key: c.key,
    reward: c.reward,
    maxUses: c.maxUses ?? 0,
    perPlayer: 1,
    startsAt: c.startsAt ?? null,
    expiresAt: c.expiresAt ?? null,
    season: null,
    allow: [],
    allowHandles: [],
    active: c.active !== false,
    notes: c.notes ?? '',
    createdAt: c.createdAt ?? Date.now(),
    ...(c.batch ? { batch: c.batch } : {}),
    ...(c.challengeId ? { challengeId: c.challengeId } : {}),
    summary,
  };
}

/** Importa um código antigo do KV para o AdminHub (se existir). true = importado. */
export async function importLegacyCode(env: Env, key: string): Promise<boolean> {
  const old = await env.DATA.get<LegacyCodeRec>('code:' + key, 'json');
  if (!old) return false;
  await adminHub(env).putCodes([fromLegacy(old, '')], false, [old.uses ?? 0]);
  await env.DATA.delete('code:' + key);
  return true;
}

/** Migra aos poucos (até 100 por chamada) os códigos antigos do KV. */
export async function migrateLegacyCodes(env: Env): Promise<number> {
  const res = await env.DATA.list<CodeMeta>({ prefix: 'code:', limit: 100 });
  if (!res.keys.length) return 0;
  const recs = (await Promise.all(res.keys.map((k) => env.DATA.get<LegacyCodeRec>(k.name, 'json')))).filter((c): c is LegacyCodeRec => !!c);
  await adminHub(env).putCodes(
    recs.map((c, i) => fromLegacy(c, res.keys[i]?.metadata?.r ?? '')),
    false,
    recs.map((c) => c.uses ?? 0),
  );
  await Promise.all(res.keys.map((k) => env.DATA.delete(k.name)));
  return recs.length;
}

export async function getCode(env: Env, key: string): Promise<CodeRec | null> {
  if (!key) return null;
  const hub = adminHub(env);
  const c = await hub.getCode(key);
  if (c || !(await importLegacyCode(env, key))) return c;
  return hub.getCode(key);
}

/** Grava a definição (os usos ficam no DO e não mudam aqui). */
export async function putCode(env: Env, c: CodeDef, summary: string): Promise<void> {
  const { recent: _r, uses: _u, players: _p, ...def } = c as CodeRec;
  await adminHub(env).putCodes([{ ...def, summary: summary.slice(0, 200) }], false);
}

export async function deleteCode(env: Env, key: string): Promise<void> {
  await Promise.all([adminHub(env).deleteCodes([key]), env.DATA.delete('code:' + key)]);
}

export async function listCodes(env: Env): Promise<CodeRow[]> {
  await migrateLegacyCodes(env).catch(() => 0);
  return (await adminHub(env).listCodes()).map(({ recent: _r, reward: _w, ...c }) => ({
    ...c,
    summary: c.summary ?? '',
    batch: c.batch ?? null,
    challengeId: c.challengeId ?? null,
  }));
}

/* ---------------- Desafios ---------------- */

export async function getChallenge(env: Env, id: string): Promise<ChallengeRec | null> {
  return env.DATA.get<ChallengeRec>('challenge:' + id, 'json');
}

export async function putChallenge(env: Env, c: ChallengeRec): Promise<void> {
  await env.DATA.put('challenge:' + c.id, JSON.stringify(c), { metadata: { a: c.active ? 1 : 0, e: c.endsAt } });
  challengeCache = null;
}

export async function deleteChallenge(env: Env, id: string): Promise<void> {
  await env.DATA.delete('challenge:' + id);
  challengeCache = null;
}

let challengeCache: { at: number; list: ChallengeRec[] } | null = null;

export async function listChallenges(env: Env, fresh = false): Promise<ChallengeRec[]> {
  if (!fresh && challengeCache && Date.now() - challengeCache.at < 30_000) return challengeCache.list;
  const res = await env.DATA.list({ prefix: 'challenge:', limit: 1000 });
  const all = await Promise.all(res.keys.map((k) => env.DATA.get<ChallengeRec>(k.name, 'json')));
  const list = all.filter((c): c is ChallengeRec => !!c).sort((a, b) => b.createdAt - a.createdAt);
  challengeCache = { at: Date.now(), list };
  return list;
}

/* ---------------- Presentes ---------------- */

let giftCache: { at: number; list: GiftRec[] } | null = null;

export async function getGifts(env: Env, fresh = false): Promise<GiftRec[]> {
  if (!fresh && giftCache && Date.now() - giftCache.at < 10_000) return giftCache.list;
  const list = (await env.DATA.get<GiftRec[]>('gifts', 'json')) ?? [];
  giftCache = { at: Date.now(), list };
  return list;
}

export async function putGifts(env: Env, list: GiftRec[]): Promise<void> {
  await env.DATA.put('gifts', JSON.stringify(list));
  giftCache = { at: Date.now(), list };
}

/** Presentes que o jogador ainda pode resgatar. */
export function pendingGiftsFor(p: PlayerRec, gifts: GiftRec[], now = Date.now()): GiftRec[] {
  return gifts.filter(
    (g) =>
      (!g.expiresAt || g.expiresAt > now) &&
      !p.claimed.includes(g.id) &&
      (g.to === 'all' ? p.created <= g.sentAt : g.to.includes(p.id)),
  );
}

/* ---------------- Pacotes salvos ---------------- */

/** Pacotes de exemplo mostrados até o dono salvar os seus. */
const DEFAULT_PRESETS: Preset[] = [
  { id: 'iniciante', name: 'Pack Iniciante', pack: { coins: 500, gems: 20, boosts: { shield: 1 }, title: 'Pack Iniciante' }, updatedAt: 0 },
  { id: 'lendario', name: 'Pack Lendário', pack: { coins: 3000, gems: 150, skins: ['king'], trails: ['rainbow'], boosts: { shield: 3, magnet: 3, headstart: 3 }, title: 'Pack Lendário' }, updatedAt: 0 },
  { id: 'desculpas', name: 'Pedido de desculpas', pack: { coins: 300, gems: 10, title: 'Foi mal!', message: 'Tivemos um probleminha. Aqui vai um presente!' }, updatedAt: 0 },
];

export async function getPresets(env: Env): Promise<Preset[]> {
  return (await env.DATA.get<Preset[]>('presets', 'json')) ?? DEFAULT_PRESETS;
}

export async function putPresets(env: Env, list: Preset[]): Promise<void> {
  await env.DATA.put('presets', JSON.stringify(list));
}
