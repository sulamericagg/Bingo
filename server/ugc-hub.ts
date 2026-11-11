/**
 * UgcHub — Durable Object (SQLite, instância única 'hub'): índice da LOJA DE CRIAÇÕES (Bloop Studio)
 * e da fila de MODERAÇÃO (criações + filmes da TV Bloop). docs/LOJA-TV.md.
 *
 *   items      metadados de cada envio (título, autor, estado da revisão, contadores, miniaturas pequenas)
 *              — o conteúdo grande (JSON da criação / filme + vozes) fica no KV: `ugc:c:<id>` / `ugc:f:<id>`
 *   likes      1 por jogador por item (a 1ª curtida de cada pessoa é a única que rende moedas)
 *   favs       favoritos
 *   uses       "Usar no meu mapa" (1× por pessoa) e "Jogar" (1× por pessoa por dia)
 *   reports    denúncias (1 por pessoa por item); `UGC.reportHide` pessoas → item some até a revisão
 *   pubs       publicações por autor/dia (limite diário que não volta ao apagar)
 *   earn       moedas do criador: acumulado a enviar + total enviado ao Correio
 *   earn_day   tetos diários (por criação e por autor: id = '*')
 *   scores     placar dos Jogos da Comunidade
 *   ubans      autores banidos da Loja/TV
 *
 * Contagens e tetos ficam aqui (atômicos, sem gastar escritas do KV). Métodos síncronos = sem corrida.
 */
import { DurableObject } from 'cloudflare:workers';
import { UGC, type UgcStatus, type UgcType } from '../shared/ugc';
import { brDay } from './admin-hub';

export interface ItemMeta {
  parts?: number;
  hash?: string;
  worldKind?: string;
  /** Jogo da Comunidade */
  game?: { title: string; desc: string; tags: string[]; maxPlayers: number };
  /** filme: duração (s) e modo */
  dur?: number;
  mode?: string;
  clips?: number;
  bytes?: number;
}

export interface PublishIn {
  id: string;
  type: UgcType;
  pid: string;
  aid: string;
  aname: string;
  title: string;
  descr: string;
  category: string;
  kind: string;
  tags: string[];
  meta: ItemMeta;
  thumbs: string[];
  flags: string[];
  dailyLimit: number;
}

type Row = {
  id: string;
  type: UgcType;
  author: string;
  aid: string;
  aname: string;
  title: string;
  descr: string;
  category: string;
  kind: string;
  tags: string;
  meta: string;
  thumbs: string;
  status: UgcStatus;
  reason: string;
  flags: string;
  created: number;
  updated: number;
  reviewed: number | null;
  reviewer: string;
  likes: number;
  uses: number;
  plays: number;
  favs: number;
  reports: number;
};

/** Como o app vê um item (formato de StoreListing em src/studio/store-api.ts). */
export interface ListingOut {
  id: string;
  type: UgcType;
  kind: string;
  name: string;
  author: { id: string; name: string };
  category: string;
  thumb?: string;
  hash: string;
  parts: number;
  likes: number;
  uses: number;
  plays: number;
  created: number;
  worldKind?: string;
  favorites: number;
  game?: { title: string; desc: string; tags: string[]; maxPlayers: number; thumbs: string[] };
  liked?: boolean;
  fav?: boolean;
  own?: boolean;
  review?: UgcStatus;
  reviewReason?: string;
  dur?: number;
}

export interface BrowseIn {
  sort: 'trending' | 'new' | 'top';
  section?: 'games' | 'creations';
  tag?: string;
  category?: string;
  kind?: string;
  text?: string;
  favorites?: boolean;
  limit: number;
  offset: number;
}

export type Grant = { pid: string; coins: number } | null;

const DAY = 86_400_000;
const COLS = 'id, type, author, aid, aname, title, descr, category, kind, tags, meta, thumbs, status, reason, flags, created, updated, reviewed, reviewer, likes, uses, plays, favs, reports';

/** URL relativa da miniatura (o app prefixa a base da API). */
export const thumbUrl = (r: { id: string; updated: number }, n = 0) => `/api/ugc/thumb?id=${encodeURIComponent(r.id)}&n=${n}&v=${r.updated.toString(36)}`;

export class UgcHub extends DurableObject<Env> {
  private rl = new Map<string, { n: number; t: number }>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const sql = ctx.storage.sql;
    sql.exec(`CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, type TEXT NOT NULL, author TEXT NOT NULL, aid TEXT NOT NULL, aname TEXT NOT NULL, title TEXT NOT NULL, descr TEXT NOT NULL, category TEXT NOT NULL, kind TEXT NOT NULL, tags TEXT NOT NULL, meta TEXT NOT NULL, thumbs TEXT NOT NULL, status TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', flags TEXT NOT NULL DEFAULT '[]', created INTEGER NOT NULL, updated INTEGER NOT NULL, reviewed INTEGER, reviewer TEXT NOT NULL DEFAULT '', likes INTEGER NOT NULL DEFAULT 0, uses INTEGER NOT NULL DEFAULT 0, plays INTEGER NOT NULL DEFAULT 0, favs INTEGER NOT NULL DEFAULT 0, reports INTEGER NOT NULL DEFAULT 0)`);
    sql.exec(`CREATE INDEX IF NOT EXISTS items_list ON items(type, status, created)`);
    sql.exec(`CREATE INDEX IF NOT EXISTS items_author ON items(author)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS likes (id TEXT NOT NULL, pid TEXT NOT NULL, onn INTEGER NOT NULL, t INTEGER NOT NULL, PRIMARY KEY (id, pid)) WITHOUT ROWID`);
    sql.exec(`CREATE TABLE IF NOT EXISTS favs (id TEXT NOT NULL, pid TEXT NOT NULL, t INTEGER NOT NULL, PRIMARY KEY (id, pid)) WITHOUT ROWID`);
    sql.exec(`CREATE INDEX IF NOT EXISTS favs_pid ON favs(pid)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS uses (id TEXT NOT NULL, pid TEXT NOT NULL, kind TEXT NOT NULL, day TEXT NOT NULL, t INTEGER NOT NULL, PRIMARY KEY (id, pid, kind, day)) WITHOUT ROWID`);
    sql.exec(`CREATE TABLE IF NOT EXISTS reports (id TEXT NOT NULL, pid TEXT NOT NULL, reason TEXT NOT NULL, note TEXT NOT NULL, t INTEGER NOT NULL, PRIMARY KEY (id, pid)) WITHOUT ROWID`);
    sql.exec(`CREATE TABLE IF NOT EXISTS pubs (pid TEXT NOT NULL, day TEXT NOT NULL, type TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (pid, day, type)) WITHOUT ROWID`);
    sql.exec(`CREATE TABLE IF NOT EXISTS earn (pid TEXT PRIMARY KEY, pending INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS earn_day (pid TEXT NOT NULL, day TEXT NOT NULL, id TEXT NOT NULL, coins INTEGER NOT NULL, PRIMARY KEY (pid, day, id)) WITHOUT ROWID`);
    sql.exec(`CREATE TABLE IF NOT EXISTS scores (id TEXT NOT NULL, pid TEXT NOT NULL, name TEXT NOT NULL, score INTEGER NOT NULL, time REAL NOT NULL, t INTEGER NOT NULL, PRIMARY KEY (id, pid)) WITHOUT ROWID`);
    sql.exec(`CREATE TABLE IF NOT EXISTS ubans (pid TEXT PRIMARY KEY, reason TEXT NOT NULL, t INTEGER NOT NULL, by TEXT NOT NULL)`);
  }

  /* ---------------- util ---------------- */

  /** true = pode; false = passou de `max` na janela. Em memória (zera se o DO dormir). */
  rate(key: string, max: number, windowMs: number): boolean {
    const now = Date.now();
    const r = this.rl.get(key);
    if (!r || now - r.t > windowMs) {
      this.rl.set(key, { n: 1, t: now });
      if (this.rl.size > 20000) for (const [k, v] of this.rl) if (now - v.t > 3600_000) this.rl.delete(k);
      return true;
    }
    r.n++;
    return r.n <= max;
  }

  private row(id: string): Row | undefined {
    return this.ctx.storage.sql.exec<Row>(`SELECT ${COLS} FROM items WHERE id = ?`, id).toArray()[0];
  }

  private out(r: Row, pid = '', allThumbs = false, inlineThumb = false): ListingOut {
    const meta = JSON.parse(r.meta) as ItemMeta;
    const thumbs = JSON.parse(r.thumbs) as string[];
    const own = !!pid && r.author === pid;
    const thumb = thumbs.length ? (inlineThumb ? thumbs[0] : thumbUrl(r)) : undefined;
    const tUrls = allThumbs ? thumbs.map((t, i) => (inlineThumb ? t : thumbUrl(r, i))) : thumb ? [thumb] : [];
    const o: ListingOut = {
      id: r.id,
      type: r.type,
      kind: r.kind,
      name: r.title,
      author: { id: r.aid, name: r.aname },
      category: r.category,
      thumb,
      hash: meta.hash ?? '',
      parts: meta.parts ?? 0,
      likes: r.likes,
      uses: r.uses,
      plays: r.plays,
      created: r.created,
      favorites: r.favs,
    };
    if (meta.worldKind) o.worldKind = meta.worldKind;
    if (meta.game) o.game = { ...meta.game, thumbs: tUrls };
    if (meta.dur) o.dur = meta.dur;
    if (own) {
      o.own = true;
      o.review = r.status;
      if (r.reason) o.reviewReason = r.reason;
    }
    return o;
  }

  isBanned(pid: string): boolean {
    return this.ctx.storage.sql.exec('SELECT 1 FROM ubans WHERE pid = ?', pid).toArray().length > 0;
  }

  /* ---------------- publicar ---------------- */

  publish(p: PublishIn): { ok: true; item: ListingOut; isNew: boolean } | { ok: false; error: 'banned' | 'taken' | 'daily-limit' } {
    const sql = this.ctx.storage.sql;
    if (this.isBanned(p.pid)) return { ok: false, error: 'banned' };
    const now = Date.now();
    const day = brDay(now);
    const cur = this.row(p.id);
    if (cur && cur.author !== p.pid) return { ok: false, error: 'taken' };
    if (cur && cur.type !== p.type) return { ok: false, error: 'taken' };
    const done = sql.exec<{ n: number }>('SELECT n FROM pubs WHERE pid = ? AND day = ? AND type = ?', p.pid, day, p.type).toArray()[0]?.n ?? 0;
    if (!cur && done >= p.dailyLimit) return { ok: false, error: 'daily-limit' };
    this.ctx.storage.transactionSync(() => {
      if (cur) {
        sql.exec(
          `UPDATE items SET aid = ?, aname = ?, title = ?, descr = ?, category = ?, kind = ?, tags = ?, meta = ?, thumbs = ?, status = 'pending', reason = '', flags = ?, updated = ?, reviewed = NULL, reviewer = '' WHERE id = ?`,
          p.aid, p.aname, p.title, p.descr, p.category, p.kind, JSON.stringify(p.tags), JSON.stringify(p.meta), JSON.stringify(p.thumbs), JSON.stringify(p.flags), now, p.id,
        );
      } else {
        sql.exec(
          `INSERT INTO items (id, type, author, aid, aname, title, descr, category, kind, tags, meta, thumbs, status, flags, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
          p.id, p.type, p.pid, p.aid, p.aname, p.title, p.descr, p.category, p.kind, JSON.stringify(p.tags), JSON.stringify(p.meta), JSON.stringify(p.thumbs), JSON.stringify(p.flags), now, now,
        );
        sql.exec('INSERT INTO pubs (pid, day, type, n) VALUES (?, ?, ?, 1) ON CONFLICT(pid, day, type) DO UPDATE SET n = n + 1', p.pid, day, p.type);
      }
    });
    return { ok: true, item: this.out(this.row(p.id)!, p.pid, true, true), isNew: !cur };
  }

  publishedToday(pid: string, type: UgcType): number {
    return this.ctx.storage.sql.exec<{ n: number }>('SELECT n FROM pubs WHERE pid = ? AND day = ? AND type = ?', pid, brDay(Date.now()), type).toArray()[0]?.n ?? 0;
  }

  /* ---------------- vitrine ---------------- */

  browse(q: BrowseIn, pid: string): { items: ListingOut[]; next?: string } {
    const sql = this.ctx.storage.sql;
    const w = [`i.type = 'criacao'`, `i.status = 'approved'`];
    const a: unknown[] = [];
    if (q.category) w.push('i.category = ?'), a.push(q.category);
    if (q.kind) w.push('i.kind = ?'), a.push(q.kind);
    if (q.text) w.push('(i.title LIKE ? OR i.aname LIKE ?)'), a.push('%' + q.text + '%', '%' + q.text + '%');
    if (q.tag) w.push('i.tags LIKE ?'), a.push('%"' + q.tag.replace(/[%_"]/g, '') + '"%');
    if (q.section === 'games') w.push(`i.meta LIKE '%"game":%'`);
    else if (q.section === 'creations') w.push(`i.meta NOT LIKE '%"game":%'`);
    const join = q.favorites ? 'JOIN favs f ON f.id = i.id AND f.pid = ?' : '';
    if (q.favorites) a.unshift(pid);
    // candidatos (os 800 mais novos que batem o filtro); a ordem "Em alta" é calculada aqui
    let rows = sql.exec<Row>(`SELECT ${COLS.split(', ').map((c) => 'i.' + c).join(', ')} FROM items i ${join} WHERE ${w.join(' AND ')} ORDER BY i.created DESC LIMIT 800`, ...a).toArray();
    const now = Date.now();
    // Em alta: curtidas + usos×2 + partidas, com decaimento pela idade (meia-vida ~1 mês, expoente 0.6)
    const hot = (r: Row) => (r.likes + r.uses * 2 + r.plays + 1) / Math.pow(1 + (now - r.created) / DAY / 7, 0.9);
    if (q.sort === 'top') rows.sort((x, y) => y.likes - x.likes || y.created - x.created);
    else if (q.sort === 'trending') rows.sort((x, y) => hot(y) - hot(x));
    const total = rows.length;
    rows = rows.slice(q.offset, q.offset + q.limit);
    const ids = rows.map((r) => r.id);
    const liked = new Set<string>();
    const faved = new Set<string>();
    if (pid && ids.length) {
      const qs = ids.map(() => '?').join(',');
      sql.exec<{ id: string }>(`SELECT id FROM likes WHERE pid = ? AND onn = 1 AND id IN (${qs})`, pid, ...ids).toArray().forEach((r) => liked.add(r.id));
      sql.exec<{ id: string }>(`SELECT id FROM favs WHERE pid = ? AND id IN (${qs})`, pid, ...ids).toArray().forEach((r) => faved.add(r.id));
    }
    const items = rows.map((r) => ({ ...this.out(r, pid), liked: liked.has(r.id), fav: faved.has(r.id) }));
    return { items, next: q.offset + q.limit < total ? String(q.offset + q.limit) : undefined };
  }

  /** Um item: aprovado para todos; o autor vê o seu em qualquer estado; `mod` vê tudo. */
  get(id: string, pid: string, mod = false): (ListingOut & { status: UgcStatus }) | null {
    const r = this.row(id);
    if (!r) return null;
    if (!mod && r.status !== 'approved' && r.author !== pid) return null;
    const liked = !!pid && this.ctx.storage.sql.exec('SELECT 1 FROM likes WHERE id = ? AND pid = ? AND onn = 1', id, pid).toArray().length > 0;
    const fav = !!pid && this.ctx.storage.sql.exec('SELECT 1 FROM favs WHERE id = ? AND pid = ?', id, pid).toArray().length > 0;
    return { ...this.out(r, pid, true), liked, fav, status: r.status };
  }

  /** Miniatura n (data URL) — só de itens aprovados, ou para o autor/moderação. */
  thumb(id: string, n: number, pid = '', mod = false): string | null {
    const r = this.ctx.storage.sql.exec<{ thumbs: string; status: string; author: string }>('SELECT thumbs, status, author FROM items WHERE id = ?', id).toArray()[0];
    if (!r || (!mod && r.status !== 'approved' && r.author !== pid)) return null;
    return (JSON.parse(r.thumbs) as string[])[n] ?? null;
  }

  /** Estado do item (para o Worker decidir se serve o conteúdo do KV). */
  access(id: string): { type: UgcType; status: UgcStatus; author: string; aname: string; title: string; meta: ItemMeta; updated: number } | null {
    const r = this.ctx.storage.sql.exec<{ type: UgcType; status: UgcStatus; author: string; aname: string; title: string; meta: string; updated: number }>('SELECT type, status, author, aname, title, meta, updated FROM items WHERE id = ?', id).toArray()[0];
    return r ? { ...r, meta: JSON.parse(r.meta) as ItemMeta } : null;
  }

  /* ---------------- interações ---------------- */

  /** Moedas para o autor, com os tetos do dia. Devolve um presente a entregar quando o acumulado chega a payoutMin. */
  private credit(author: string, id: string, coins: number): Grant {
    const sql = this.ctx.storage.sql;
    const R = UGC.reward;
    const day = brDay(Date.now());
    const got = (k: string) => sql.exec<{ coins: number }>('SELECT coins FROM earn_day WHERE pid = ? AND day = ? AND id = ?', author, day, k).toArray()[0]?.coins ?? 0;
    const give = Math.max(0, Math.min(coins, R.dailyCapPerCreation - got(id), R.dailyCapPerAuthor - got('*')));
    if (!give) return null;
    for (const k of [id, '*']) sql.exec('INSERT INTO earn_day (pid, day, id, coins) VALUES (?, ?, ?, ?) ON CONFLICT(pid, day, id) DO UPDATE SET coins = coins + excluded.coins', author, day, k, give);
    sql.exec('INSERT INTO earn (pid, pending, total) VALUES (?, ?, 0) ON CONFLICT(pid) DO UPDATE SET pending = pending + excluded.pending', author, give);
    if (Math.random() < 0.01) sql.exec('DELETE FROM earn_day WHERE day < ?', brDay(Date.now() - 7 * DAY));
    const pending = sql.exec<{ pending: number }>('SELECT pending FROM earn WHERE pid = ?', author).one().pending;
    if (pending < R.payoutMin) return null;
    sql.exec('UPDATE earn SET pending = 0, total = total + ? WHERE pid = ?', pending, author);
    return { pid: author, coins: pending };
  }

  /** Entrega ao Correio falhou: devolve ao acumulado. */
  refund(pid: string, coins: number): void {
    this.ctx.storage.sql.exec('UPDATE earn SET pending = pending + ?, total = MAX(0, total - ?) WHERE pid = ?', coins, coins, pid);
  }

  /** Curtir/descurtir. Autocurtida é ignorada. Só a PRIMEIRA curtida de cada pessoa rende moedas (trusted). */
  like(id: string, pid: string, on: boolean, trusted: boolean): { likes: number; liked: boolean; grant: Grant } | null {
    const sql = this.ctx.storage.sql;
    const r = this.row(id);
    if (!r || r.status !== 'approved') return null;
    if (r.author === pid) return { likes: r.likes, liked: false, grant: null };
    const cur = sql.exec<{ onn: number }>('SELECT onn FROM likes WHERE id = ? AND pid = ?', id, pid).toArray()[0];
    let grant: Grant = null;
    if (!cur) {
      if (!on) return { likes: r.likes, liked: false, grant: null };
      sql.exec('INSERT INTO likes (id, pid, onn, t) VALUES (?, ?, 1, ?)', id, pid, Date.now());
      sql.exec('UPDATE items SET likes = likes + 1 WHERE id = ?', id);
      if (trusted) grant = this.credit(r.author, id, UGC.reward.perLike);
    } else if (!!cur.onn !== on) {
      sql.exec('UPDATE likes SET onn = ? WHERE id = ? AND pid = ?', on ? 1 : 0, id, pid);
      sql.exec(`UPDATE items SET likes = MAX(0, likes ${on ? '+' : '-'} 1) WHERE id = ?`, id);
    }
    return { likes: this.row(id)!.likes, liked: on, grant };
  }

  favorite(id: string, pid: string, on: boolean): number {
    const sql = this.ctx.storage.sql;
    const r = this.row(id);
    if (!r || r.status !== 'approved') return 0;
    const had = sql.exec('SELECT 1 FROM favs WHERE id = ? AND pid = ?', id, pid).toArray().length > 0;
    if (on && !had) sql.exec('INSERT INTO favs (id, pid, t) VALUES (?, ?, ?)', id, pid, Date.now()), sql.exec('UPDATE items SET favs = favs + 1 WHERE id = ?', id);
    if (!on && had) sql.exec('DELETE FROM favs WHERE id = ? AND pid = ?', id, pid), sql.exec('UPDATE items SET favs = MAX(0, favs - 1) WHERE id = ?', id);
    return this.row(id)!.favs;
  }

  /** "Usar no meu mapa" (1× por pessoa) / "Jogar" (1× por pessoa por dia). */
  recordUse(id: string, pid: string, kind: 'place' | 'play', trusted: boolean): { counted: boolean; authorCoins: number; grant: Grant } {
    const sql = this.ctx.storage.sql;
    const r = this.row(id);
    const none = { counted: false, authorCoins: 0, grant: null };
    if (!r || r.status !== 'approved' || r.author === pid) return none;
    const day = kind === 'play' ? brDay(Date.now()) : '-';
    if (!sql.exec('INSERT OR IGNORE INTO uses (id, pid, kind, day, t) VALUES (?, ?, ?, ?, ?)', id, pid, kind, day, Date.now()).rowsWritten) return none;
    sql.exec(`UPDATE items SET ${kind === 'place' ? 'uses = uses + 1' : 'plays = plays + 1'} WHERE id = ?`, id);
    if (!trusted) return { counted: true, authorCoins: 0, grant: null };
    const coins = kind === 'place' ? UGC.reward.perUse : UGC.reward.perPlay;
    const before = this.earnings(r.author);
    const grant = this.credit(r.author, id, coins);
    const after = this.earnings(r.author);
    return { counted: true, authorCoins: after.pending + after.total - before.pending - before.total, grant };
  }

  /** Denúncia (1 por pessoa). Passou do limite: aprovado → 'hidden' (some das listas e volta para a fila). */
  report(id: string, pid: string, reason: string, note: string): { hidden: boolean; type: UgcType } | null {
    const sql = this.ctx.storage.sql;
    const r = this.row(id);
    if (!r) return null;
    if (r.author === pid) return { hidden: false, type: r.type };
    if (!sql.exec('INSERT OR IGNORE INTO reports (id, pid, reason, note, t) VALUES (?, ?, ?, ?, ?)', id, pid, reason, note, Date.now()).rowsWritten) return { hidden: false, type: r.type };
    sql.exec('UPDATE items SET reports = reports + 1 WHERE id = ?', id);
    if (r.status === 'approved' && r.reports + 1 >= UGC.reportHide) {
      sql.exec(`UPDATE items SET status = 'hidden', reason = 'denúncias' WHERE id = ?`, id);
      return { hidden: true, type: r.type };
    }
    return { hidden: false, type: r.type };
  }

  mine(pid: string, type: UgcType): ListingOut[] {
    return this.ctx.storage.sql
      .exec<Row>(`SELECT ${COLS} FROM items WHERE author = ? AND type = ? ORDER BY created DESC LIMIT 200`, pid, type)
      .toArray()
      .map((r) => this.out(r, pid, false, true));
  }

  unpublish(id: string, pid: string): UgcType | null {
    const r = this.row(id);
    if (!r || r.author !== pid) return null;
    this.ctx.storage.sql.exec('DELETE FROM items WHERE id = ?', id);
    return r.type;
  }

  earnings(pid: string): { pending: number; total: number } {
    return this.ctx.storage.sql.exec<{ pending: number; total: number }>('SELECT pending, total FROM earn WHERE pid = ?', pid).toArray()[0] ?? { pending: 0, total: 0 };
  }

  submitScore(id: string, pid: string, name: string, score: number, time: number): { rank: number } | null {
    const sql = this.ctx.storage.sql;
    const r = this.row(id);
    if (!r || r.status !== 'approved') return null;
    const prev = sql.exec<{ score: number; time: number }>('SELECT score, time FROM scores WHERE id = ? AND pid = ?', id, pid).toArray()[0];
    if (!prev || score > prev.score || (score === prev.score && time < prev.time)) {
      sql.exec('INSERT INTO scores (id, pid, name, score, time, t) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id, pid) DO UPDATE SET name = excluded.name, score = excluded.score, time = excluded.time, t = excluded.t', id, pid, name, score, time, Date.now());
    }
    const me = sql.exec<{ score: number; time: number }>('SELECT score, time FROM scores WHERE id = ? AND pid = ?', id, pid).one();
    const better = sql.exec<{ c: number }>('SELECT COUNT(*) AS c FROM scores WHERE id = ? AND (score > ? OR (score = ? AND time < ?))', id, me.score, me.score, me.time).one().c;
    return { rank: better + 1 };
  }

  leaderboard(id: string, pid: string): { name: string; score: number; timeSec: number; me?: boolean }[] {
    return this.ctx.storage.sql
      .exec<{ pid: string; name: string; score: number; time: number }>('SELECT pid, name, score, time FROM scores WHERE id = ? ORDER BY score DESC, time ASC LIMIT 20', id)
      .toArray()
      .map((r) => ({ name: r.name, score: r.score, timeSec: r.time, ...(r.pid === pid ? { me: true } : {}) }));
  }

  /* ---------------- moderação ---------------- */

  counts(): Record<string, Record<string, number>> {
    const out: Record<string, Record<string, number>> = { criacao: {}, filme: {} };
    for (const r of this.ctx.storage.sql.exec<{ type: string; status: string; c: number }>('SELECT type, status, COUNT(*) AS c FROM items GROUP BY type, status').toArray()) (out[r.type] ??= {})[r.status] = r.c;
    return out;
  }

  /** Fila: itens com miniaturas inline (data URL), filtros automáticos e denúncias. */
  queue(status: string, type: string, limit: number, before: number): unknown[] {
    const w: string[] = [];
    const a: unknown[] = [];
    if (status === 'review') w.push(`status IN ('pending', 'hidden')`);
    else if (status && status !== 'all') w.push('status = ?'), a.push(status);
    if (type) w.push('type = ?'), a.push(type);
    if (before) w.push('updated < ?'), a.push(before);
    const rows = this.ctx.storage.sql.exec<Row>(`SELECT ${COLS} FROM items ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY updated ${status === 'review' || status === 'pending' ? 'ASC' : 'DESC'} LIMIT ?`, ...a, Math.min(100, limit)).toArray();
    return rows.map((r) => this.modRow(r));
  }

  private modRow(r: Row) {
    return {
      id: r.id,
      type: r.type,
      title: r.title,
      descr: r.descr,
      category: r.category,
      kind: r.kind,
      tags: JSON.parse(r.tags),
      meta: JSON.parse(r.meta),
      thumbs: JSON.parse(r.thumbs),
      status: r.status,
      reason: r.reason,
      flags: JSON.parse(r.flags),
      author: r.author,
      aid: r.aid,
      aname: r.aname,
      created: r.created,
      updated: r.updated,
      reviewed: r.reviewed,
      reviewer: r.reviewer,
      likes: r.likes,
      uses: r.uses,
      plays: r.plays,
      reports: r.reports,
      authorBanned: this.isBanned(r.author),
    };
  }

  modItem(id: string): (ReturnType<UgcHub['modRow']> & { reportList: { reason: string; note: string; t: number }[] }) | null {
    const r = this.row(id);
    if (!r) return null;
    const reportList = this.ctx.storage.sql.exec<{ reason: string; note: string; t: number }>('SELECT reason, note, t FROM reports WHERE id = ? ORDER BY t DESC LIMIT 50', id).toArray();
    return { ...this.modRow(r), reportList };
  }

  /** Aprovar / recusar / esconder. Devolve o estado anterior (o Worker atualiza a TV para filmes). */
  review(id: string, status: UgcStatus, reason: string, reviewer: string): { type: UgcType; prev: UgcStatus; author: string } | null {
    const r = this.row(id);
    if (!r) return null;
    this.ctx.storage.sql.exec('UPDATE items SET status = ?, reason = ?, reviewed = ?, reviewer = ? WHERE id = ?', status, reason, Date.now(), reviewer, id);
    // aprovado de novo depois de denúncias: zera a contagem (as mesmas pessoas não conseguem esconder de novo sozinhas? conseguem: limpa a tabela)
    if (status === 'approved' && r.status === 'hidden') {
      this.ctx.storage.sql.exec('UPDATE items SET reports = 0 WHERE id = ?', id);
      this.ctx.storage.sql.exec('DELETE FROM reports WHERE id = ?', id);
    }
    return { type: r.type, prev: r.status, author: r.author };
  }

  /** Bane o autor da Loja/TV: tudo dele sai do ar (recusado) e ele não publica mais. */
  banAuthor(pid: string, reason: string, by: string): { id: string; type: UgcType }[] {
    const sql = this.ctx.storage.sql;
    sql.exec('INSERT INTO ubans (pid, reason, t, by) VALUES (?, ?, ?, ?) ON CONFLICT(pid) DO UPDATE SET reason = excluded.reason, t = excluded.t, by = excluded.by', pid, reason, Date.now(), by);
    const items = sql.exec<{ id: string; type: UgcType }>(`SELECT id, type FROM items WHERE author = ? AND status != 'rejected'`, pid).toArray();
    sql.exec(`UPDATE items SET status = 'rejected', reason = ?, reviewed = ?, reviewer = ? WHERE author = ? AND status != 'rejected'`, 'autor banido: ' + reason, Date.now(), by, pid);
    return items;
  }

  unbanAuthor(pid: string): boolean {
    return this.ctx.storage.sql.exec('DELETE FROM ubans WHERE pid = ?', pid).rowsWritten > 0;
  }

  bans(): { pid: string; reason: string; t: number; by: string; aname: string }[] {
    return this.ctx.storage.sql
      .exec<{ pid: string; reason: string; t: number; by: string; aname: string | null }>('SELECT b.pid AS pid, b.reason AS reason, b.t AS t, b.by AS by, (SELECT aname FROM items WHERE author = b.pid LIMIT 1) AS aname FROM ubans b ORDER BY b.t DESC LIMIT 200')
      .toArray()
      .map((r) => ({ ...r, aname: r.aname ?? '?' }));
  }
}

export const ugcHub = (env: Env): DurableObjectStub<UgcHub> => env.UGC.get(env.UGC.idFromName('hub'));
