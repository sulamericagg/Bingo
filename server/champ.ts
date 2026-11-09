/**
 * Campeonatos — Durable Object `Championship` (binding CHAMP, SQLite, plano grátis).
 *
 * Uma única instância ('hub') guarda todos os campeonatos (chave `c:<id>`) e usa UM alarme
 * marcado para o próximo evento (fim das inscrições / fim de rodada / próximo agendamento).
 * Toda leitura também chama advance(now), então nada depende só do alarme.
 *
 * Economia kid-safe: a inscrição custa "Fichas de Campeonato" (NÃO compráveis, ganhas jogando;
 * ficam no aparelho). O prêmio é em MOEDAS bancado pelo sistema: base + X por inscrito.
 * Nada de dinheiro real, gemas ou moedas apostadas.
 *
 * Regras do dono:
 *  - inscrições fecham com 0 ou 1 inscrito → cancelado, fichas devolvidas.
 *  - rodada 1 sem ninguém jogando → cancelado, fichas devolvidas.
 *  - só UM jogador joga → ele segue as rodadas restantes e leva o prêmio inteiro.
 *  - 2+ → eliminação: metade de cima avança (mín. 2) até a final; prêmio 50/30/20 (2 finalistas: 60/40).
 */
import { DurableObject } from 'cloudflare:workers';
import { cleanName, HttpError, json, num, PLAYER_ID_RE, readJson } from './util';
import { safeName } from './moderation';

export const CHAMP_GAMES = ['orbit', 'tubo', 'rally', 'tycoon'];
/** Teto absoluto e por segundo jogado (sanidade) — por jogo. */
const SCORE_CAP: Record<string, { max: number; perSec: number; base: number }> = {
  orbit: { max: 200_000, perSec: 60, base: 50 },
  tubo: { max: 100_000, perSec: 40, base: 50 },
  rally: { max: 500_000, perSec: 200, base: 100 },
  tycoon: { max: 10_000_000, perSec: 50_000, base: 1000 },
};
const DEFAULT_CAP = { max: 1_000_000, perSec: 1000, base: 100 };
const MAX_ATTEMPTS = 5;
const MAX_PLAYERS = 1000;
const H = 3600_000;
const REGULAR_EVERY = 3 * H;
const KEEP_DONE_MS = 48 * H;

export interface Round {
  game: string;
  seed: number;
  start: number;
  end: number;
}
export interface ChampPlayer {
  name: string;
  skin: string;
  at: number;
  out?: number; // rodada em que foi eliminado
  place?: number;
  prize?: number;
  refund?: boolean;
  claimed?: boolean;
}
export type ChampStatus = 'signup' | 'live' | 'done' | 'cancelled';
export interface Champ {
  id: string;
  name: string;
  special: boolean;
  entry: number;
  prizeBase: number;
  prizePer: number;
  signupOpen: number;
  rounds: Round[];
  status: ChampStatus;
  round: number;
  players: Record<string, ChampPlayer>;
  scores: Record<string, { s: number; n: number }>[];
  advancing: string[][];
  results?: { pid: string; name: string; skin: string; place: number; prize: number; score: number }[];
  cancelReason?: 'few_signups' | 'nobody_played' | 'admin';
  created: number;
}

const ROUND_NAMES = ['Classificatória', 'Semifinal', 'Final'];

function seedFor(id: string, r: number): number {
  let h = 2166136261 ^ r;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

function makeRounds(id: string, start: number, games: string[], roundMs: number[]): Round[] {
  let t = start;
  return games.map((game, i) => {
    const r = { game, seed: seedFor(id, i), start: t, end: t + roundMs[i] };
    t = r.end;
    return r;
  });
}

/** Campeonato regular do "slot" (a cada 3 h). Jogos giram pelo índice. */
function regularChamp(slot: number, now: number): Champ {
  const id = 'r' + slot;
  const start = slot * REGULAR_EVERY;
  const games = [CHAMP_GAMES[slot % 4], CHAMP_GAMES[(slot + 1) % 4], CHAMP_GAMES[(slot + 2) % 4]];
  const weekendCup = new Date(start).getUTCDay() === 6 && new Date(start).getUTCHours() === 15;
  return {
    id,
    name: weekendCup ? 'Copa de Fim de Semana' : 'Campeonato Relâmpago',
    special: weekendCup,
    entry: weekendCup ? 2 : 1,
    prizeBase: weekendCup ? 1000 : 100,
    prizePer: weekendCup ? 100 : 50,
    signupOpen: now,
    rounds: makeRounds(id, start, games, [20 * 60_000, 15 * 60_000, 15 * 60_000]),
    status: 'signup',
    round: -1,
    players: {},
    scores: games.map(() => ({})),
    advancing: [],
    created: now,
  };
}

/* ---------------- lógica pura (testável) ---------------- */

const byScore = (c: Champ, r: number) => (a: string, b: string) => (c.scores[r][b]?.s ?? -1) - (c.scores[r][a]?.s ?? -1) || c.players[a].at - c.players[b].at;

function cancel(c: Champ, reason: Champ['cancelReason']): void {
  c.status = 'cancelled';
  c.cancelReason = reason;
  for (const p of Object.values(c.players)) p.refund = true;
}

function finish(c: Champ, ranked: string[], r: number): void {
  c.status = 'done';
  const pool = c.prizeBase + c.prizePer * Object.keys(c.players).length;
  const shares = ranked.length === 1 ? [1] : ranked.length === 2 ? [0.6, 0.4] : [0.5, 0.3, 0.2];
  c.results = ranked.map((pid, i) => {
    const p = c.players[pid];
    p.place = i + 1;
    p.prize = Math.floor(pool * (shares[i] ?? 0));
    return { pid, name: p.name, skin: p.skin, place: i + 1, prize: p.prize, score: c.scores[r]?.[pid]?.s ?? 0 };
  });
}

/** Avança o campeonato até `now`. Devolve true se mudou. */
export function step(c: Champ, now: number): boolean {
  let changed = false;
  if (c.status === 'signup' && now >= c.rounds[0].start) {
    changed = true;
    const ids = Object.keys(c.players);
    if (ids.length <= 1) cancel(c, 'few_signups');
    else {
      c.status = 'live';
      c.round = 0;
      c.advancing = [ids];
    }
  }
  while (c.status === 'live' && now >= c.rounds[c.round].end) {
    changed = true;
    const r = c.round;
    const last = r === c.rounds.length - 1;
    const allowed = c.advancing[r];
    const played = allowed.filter((pid) => c.scores[r][pid]).sort(byScore(c, r));
    if (played.length === 0) {
      if (r === 0) {
        cancel(c, 'nobody_played');
        break;
      }
      // ninguém jogou esta rodada: vale a classificação da rodada anterior
      finish(c, [...allowed].sort(byScore(c, r - 1)), r - 1);
      break;
    }
    for (const pid of allowed) if (!c.scores[r][pid]) c.players[pid].out = r;
    if (last) {
      finish(c, played, r);
      break;
    }
    const keep = played.length === 1 ? 1 : Math.min(played.length, Math.max(2, Math.ceil(played.length / 2)));
    for (const pid of played.slice(keep)) c.players[pid].out = r;
    c.advancing[r + 1] = played.slice(0, keep);
    c.round = r + 1;
  }
  return changed;
}

/** Visão pública (sem ids de outros jogadores além do necessário). */
export function publicView(c: Champ, me = '', now = Date.now()) {
  const meP = me ? c.players[me] : undefined;
  const r = c.round;
  const standings = (ri: number) =>
    (c.advancing[ri] ?? [])
      .map((pid) => ({ pid, name: c.players[pid].name, skin: c.players[pid].skin, score: c.scores[ri][pid]?.s ?? null, out: c.players[pid].out === ri }))
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  return {
    id: c.id,
    name: c.name,
    special: c.special,
    entry: c.entry,
    prize: c.prizeBase + c.prizePer * Object.keys(c.players).length,
    prizePer: c.prizePer,
    signups: Object.keys(c.players).length,
    status: c.status,
    round: r,
    rounds: c.rounds.map((x, i) => ({ ...x, label: ROUND_NAMES[i] ?? `Rodada ${i + 1}` })),
    standings: c.rounds.map((_, i) => standings(i)),
    results: c.results ?? null,
    cancelReason: c.cancelReason ?? null,
    now,
    me: meP
      ? {
          signed: true,
          canPlay: c.status === 'live' && (c.advancing[r] ?? []).includes(me) && now >= c.rounds[r].start && now < c.rounds[r].end,
          attempts: c.status === 'live' ? (c.scores[r][me]?.n ?? 0) : 0,
          best: c.status === 'live' ? (c.scores[r][me]?.s ?? null) : null,
          out: meP.out ?? null,
          place: meP.place ?? null,
          prize: meP.prize ?? 0,
          refund: !!meP.refund,
          claimed: !!meP.claimed,
        }
      : { signed: false },
  };
}

/* ---------------- Durable Object ---------------- */

/** Erros atravessam o RPC do DO como objeto (a classe HttpError não sobrevive ao RPC). */
interface Fail {
  __fail: { status: number; code: string; message: string };
}
const fail = (status: number, code: string, message: string): Fail => ({ __fail: { status, code, message } });
function unwrap<T>(v: T | Fail): Exclude<T, Fail> {
  if (v && typeof v === 'object' && '__fail' in (v as object)) {
    const f = (v as Fail).__fail;
    throw new HttpError(f.status, f.code, f.message);
  }
  return v as Exclude<T, Fail>;
}

export class Championship extends DurableObject<Env> {
  private cache = new Map<string, Champ>();
  private index: string[] | null = null;

  private async ids(): Promise<string[]> {
    if (!this.index) this.index = (await this.ctx.storage.get<string[]>('index')) ?? [];
    return this.index;
  }

  private async load(id: string): Promise<Champ | null> {
    if (this.cache.has(id)) return this.cache.get(id)!;
    const c = await this.ctx.storage.get<Champ>('c:' + id);
    if (c) this.cache.set(id, c);
    return c ?? null;
  }

  private async saveChamp(c: Champ): Promise<void> {
    this.cache.set(c.id, c);
    await this.ctx.storage.put('c:' + c.id, c);
    const ids = await this.ids();
    if (!ids.includes(c.id)) {
      ids.push(c.id);
      await this.ctx.storage.put('index', ids);
    }
  }

  /** Cria os regulares que faltam, avança todos, limpa antigos e remarca o alarme. */
  private async tick(now = Date.now()): Promise<Champ[]> {
    const slot = Math.floor(now / REGULAR_EVERY);
    const ids = await this.ids();
    const disabled = (await this.ctx.storage.get<boolean>('regularOff')) ?? false;
    if (!disabled)
      for (const s of [slot + 1, slot + 2]) {
        if (!ids.includes('r' + s)) await this.saveChamp(regularChamp(s, now));
      }
    const out: Champ[] = [];
    let next = (slot + 1) * REGULAR_EVERY;
    for (const id of [...ids]) {
      const c = await this.load(id);
      if (!c) continue;
      if (step(c, now)) await this.saveChamp(c);
      const endsAt = c.rounds[c.rounds.length - 1].end;
      if ((c.status === 'done' || c.status === 'cancelled') && now - endsAt > KEEP_DONE_MS) {
        await this.ctx.storage.delete('c:' + id);
        this.cache.delete(id);
        this.index = ids.filter((x) => x !== id);
        await this.ctx.storage.put('index', this.index);
        continue;
      }
      if (c.status === 'signup') next = Math.min(next, c.rounds[0].start);
      if (c.status === 'live') next = Math.min(next, c.rounds[c.round].end);
      out.push(c);
    }
    await this.ctx.storage.setAlarm(Math.max(now + 1000, next + 200));
    return out;
  }

  async alarm(): Promise<void> {
    await this.tick();
  }

  async list(me: string) {
    const now = Date.now();
    const all = await this.tick(now);
    return all
      .sort((a, b) => a.rounds[0].start - b.rounds[0].start)
      .map((c) => publicView(c, me, now));
  }

  async get(id: string, me: string) {
    const now = Date.now();
    await this.tick(now);
    const c = await this.load(id);
    if (!c) return fail(404, 'not_found', 'Campeonato não encontrado.');
    return publicView(c, me, now);
  }

  async signup(id: string, pid: string, name: string, skin: string) {
    const now = Date.now();
    await this.tick(now);
    const c = await this.load(id);
    if (!c) return fail(404, 'not_found', 'Campeonato não encontrado.');
    if (c.status !== 'signup') return fail(409, 'closed', 'As inscrições já fecharam.');
    if (c.players[pid]) return { ok: true, already: true, entry: 0, champ: publicView(c, pid, now) };
    if (Object.keys(c.players).length >= MAX_PLAYERS) return fail(409, 'full', 'Campeonato lotado.');
    c.players[pid] = { name, skin, at: now };
    await this.saveChamp(c);
    return { ok: true, already: false, entry: c.entry, champ: publicView(c, pid, now) };
  }

  async score(id: string, pid: string, round: number, score: number, durationSec: number) {
    const now = Date.now();
    await this.tick(now);
    const c = await this.load(id);
    if (!c) return fail(404, 'not_found', 'Campeonato não encontrado.');
    if (c.status !== 'live' || c.round !== round) return fail(409, 'round_closed', 'Esta rodada já terminou.');
    const r = c.rounds[round];
    if (now < r.start || now >= r.end) return fail(409, 'round_closed', 'Esta rodada já terminou.');
    if (!c.advancing[round].includes(pid)) return fail(403, 'not_in_round', 'Você não está nesta rodada.');
    const cap = SCORE_CAP[r.game] ?? DEFAULT_CAP;
    const plausible = Math.min(cap.max, cap.base + cap.perSec * Math.max(0, durationSec));
    if (score > plausible) return fail(422, 'implausible', 'Pontuação recusada.');
    const cur = c.scores[round][pid] ?? { s: -1, n: 0 };
    if (cur.n >= MAX_ATTEMPTS) return fail(429, 'attempts', 'Você já usou todas as tentativas desta rodada.');
    c.scores[round][pid] = { s: Math.max(cur.s, score), n: cur.n + 1 };
    await this.saveChamp(c);
    return { ok: true, best: c.scores[round][pid].s, attempts: c.scores[round][pid].n, maxAttempts: MAX_ATTEMPTS };
  }

  async claim(id: string, pid: string) {
    await this.tick();
    const c = await this.load(id);
    const p = c?.players[pid];
    if (!c || !p) return fail(404, 'not_found', 'Nada para resgatar.');
    if (p.claimed) return { ok: true, coins: 0, fichas: 0, already: true };
    if (p.refund) {
      p.claimed = true;
      await this.saveChamp(c);
      return { ok: true, coins: 0, fichas: c.entry };
    }
    if (c.status === 'done' && p.prize) {
      p.claimed = true;
      await this.saveChamp(c);
      return { ok: true, coins: p.prize, fichas: 0 };
    }
    return { ok: true, coins: 0, fichas: 0 };
  }

  /* ----- admin ----- */

  async adminList() {
    const all = await this.tick();
    return {
      regularOff: (await this.ctx.storage.get<boolean>('regularOff')) ?? false,
      items: all
        .sort((a, b) => a.rounds[0].start - b.rounds[0].start)
        .map((c) => ({ ...publicView(c), players: Object.entries(c.players).map(([pid, p]) => ({ pid, ...p })) })),
    };
  }

  async adminCreate(input: { name: string; games: string[]; prizeBase: number; prizePer: number; entry: number; startAt: number; roundMs: number[] }) {
    const now = Date.now();
    const id = 's' + now.toString(36) + Math.floor(Math.random() * 1296).toString(36);
    const c: Champ = {
      id,
      name: input.name,
      special: true,
      entry: input.entry,
      prizeBase: input.prizeBase,
      prizePer: input.prizePer,
      signupOpen: now,
      rounds: makeRounds(id, input.startAt, input.games, input.roundMs),
      status: 'signup',
      round: -1,
      players: {},
      scores: input.games.map(() => ({})),
      advancing: [],
      created: now,
    };
    await this.saveChamp(c);
    await this.tick(now);
    return publicView(c, '', now);
  }

  async adminCancel(id: string) {
    const c = await this.load(id);
    if (!c) return fail(404, 'not_found', 'Campeonato não encontrado.');
    if (c.status === 'signup' || c.status === 'live') {
      cancel(c, 'admin');
      await this.saveChamp(c);
    }
    return publicView(c);
  }

  async adminRegular(off: boolean) {
    await this.ctx.storage.put('regularOff', off);
    if (off) {
      // remove os regulares ainda sem inscritos
      for (const id of [...(await this.ids())]) {
        const c = await this.load(id);
        if (c && !c.special && c.status === 'signup' && !Object.keys(c.players).length) {
          await this.ctx.storage.delete('c:' + id);
          this.cache.delete(id);
          this.index = (await this.ids()).filter((x) => x !== id);
          await this.ctx.storage.put('index', this.index);
        }
      }
    }
    return { regularOff: off };
  }
}

/* ---------------- rotas públicas ---------------- */

const hub = (env: Env) => env.CHAMP.get(env.CHAMP.idFromName('hub'));
const pidOf = (v: unknown) => {
  const s = String(v ?? '');
  if (!PLAYER_ID_RE.test(s)) throw new HttpError(400, 'bad_id', 'Jogador inválido.');
  return s;
};
const idOf = (v: unknown) => {
  const s = String(v ?? '');
  if (!/^[a-z0-9]{2,20}$/.test(s)) throw new HttpError(400, 'bad_champ', 'Campeonato inválido.');
  return s;
};

export async function champList(req: Request, env: Env): Promise<Response> {
  const me = new URL(req.url).searchParams.get('me') ?? '';
  return json({ items: await hub(env).list(PLAYER_ID_RE.test(me) ? me : '') });
}
export async function champGet(req: Request, env: Env): Promise<Response> {
  const u = new URL(req.url).searchParams;
  const me = u.get('me') ?? '';
  return json(unwrap(await hub(env).get(idOf(u.get('id')), PLAYER_ID_RE.test(me) ? me : '')));
}
export async function champSignup(req: Request, env: Env): Promise<Response> {
  const b = await readJson(req);
  return json(unwrap(await hub(env).signup(idOf(b.id), pidOf(b.pid), safeName(cleanName(b.name) || 'Bloop'), String(b.skin ?? 'bloop').slice(0, 24))));
}
export async function champScore(req: Request, env: Env): Promise<Response> {
  const b = await readJson(req);
  return json(unwrap(await hub(env).score(idOf(b.id), pidOf(b.pid), num(b.round, 10), num(b.score, 1e9), Math.min(3600, Number(b.duration) || 0))));
}
export async function champClaim(req: Request, env: Env): Promise<Response> {
  const b = await readJson(req);
  return json(unwrap(await hub(env).claim(idOf(b.id), pidOf(b.pid))));
}

export const champHub = hub;
export { unwrap as champUnwrap };
