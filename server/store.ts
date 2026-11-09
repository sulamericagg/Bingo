/**
 * Camada de dados sobre Workers KV (binding DATA).
 *
 * Chaves:
 *   player:<id>        → PlayerRec           (metadata PlayerMeta, para listar sem get)
 *   code:<NORMALIZADO> → CodeRec             (metadata CodeMeta)
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
}

interface PlayerMeta {
  n: string;
  b: number;
  r: number;
  s: number;
  p: string;
  c: number;
}

export interface PlayerRow {
  id: string;
  name: string;
  best: number;
  runs: number;
  lastSeen: number;
  platform: string;
  created: number;
}

export interface CodeRec {
  code: string; // como exibido (ex.: BLP-7KQ2-M9XA)
  key: string; // normalizado (ex.: BLP7KQ2M9XA)
  reward: RewardPack;
  maxUses: number; // 0 = ilimitado
  uses: number;
  startsAt: number | null;
  expiresAt: number | null;
  active: boolean;
  notes: string;
  createdAt: number;
  batch?: string;
  challengeId?: string;
  recent: { p: string; n: string; t: number }[];
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

export interface CodeRow {
  code: string;
  key: string;
  uses: number;
  maxUses: number;
  active: boolean;
  startsAt: number | null;
  expiresAt: number | null;
  createdAt: number;
  notes: string;
  batch: string | null;
  challengeId: string | null;
  summary: string;
}

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
  return p;
}

export async function putPlayer(env: Env, p: PlayerRec): Promise<void> {
  const meta: PlayerMeta = { n: p.name, b: p.best, r: p.runs, s: p.lastSeen, p: p.platform.slice(0, 12), c: p.created };
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
      });
    }
    if (res.list_complete) break;
    cursor = res.cursor;
  }
  playerCache = { at: Date.now(), rows };
  return rows;
}

/* ---------------- Códigos ---------------- */

export async function getCode(env: Env, key: string): Promise<CodeRec | null> {
  if (!key) return null;
  return env.DATA.get<CodeRec>('code:' + key, 'json');
}

export async function putCode(env: Env, c: CodeRec, summary: string): Promise<void> {
  const meta: CodeMeta = { d: c.code, u: c.uses, m: c.maxUses, a: c.active ? 1 : 0, s: c.startsAt, e: c.expiresAt, c: c.createdAt };
  if (c.notes) meta.n = c.notes.slice(0, 80);
  if (c.batch) meta.b = c.batch;
  if (c.challengeId) meta.ch = c.challengeId;
  if (summary) meta.r = summary.slice(0, 160);
  // Metadata do KV tem limite de 1024 bytes.
  let s = JSON.stringify(meta);
  if (new TextEncoder().encode(s).length > 1000) {
    delete meta.r;
    meta.n = meta.n?.slice(0, 30);
    s = JSON.stringify(meta);
  }
  await env.DATA.put('code:' + c.key, JSON.stringify(c), { metadata: meta });
}

export async function deleteCode(env: Env, key: string): Promise<void> {
  await env.DATA.delete('code:' + key);
}

export async function listCodes(env: Env): Promise<CodeRow[]> {
  const rows: CodeRow[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 50; page++) {
    const res: KVNamespaceListResult<CodeMeta, string> = await env.DATA.list<CodeMeta>({ prefix: 'code:', cursor, limit: 1000 });
    for (const k of res.keys) {
      const m = k.metadata;
      const key = k.name.slice(5);
      rows.push({
        code: m?.d ?? key,
        key,
        uses: m?.u ?? 0,
        maxUses: m?.m ?? 0,
        active: m ? m.a === 1 : true,
        startsAt: m?.s ?? null,
        expiresAt: m?.e ?? null,
        createdAt: m?.c ?? 0,
        notes: m?.n ?? '',
        batch: m?.b ?? null,
        challengeId: m?.ch ?? null,
        summary: m?.r ?? '',
      });
    }
    if (res.list_complete) break;
    cursor = res.cursor;
  }
  rows.sort((a, b) => b.createdAt - a.createdAt || a.code.localeCompare(b.code));
  return rows;
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
