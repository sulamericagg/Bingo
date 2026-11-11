/**
 * AdminHub — Durable Object (SQLite, instância única 'hub') com tudo que precisa de
 * contagem ATÔMICA ou de consulta (sem gastar as 1.000 escritas/dia do KV grátis):
 *
 *   codes        definição dos códigos + usos (autoritativo; o KV `code:` antigo é importado sob demanda)
 *   code_uses    usos por jogador (limite "usos por jogador")
 *   gift_claims  quem pegou cada presente (resgate idempotente, sem corrida entre 2 aparelhos)
 *   gift_seen    quem já recebeu o presente na caixa (status "entregue")
 *   purchases    compras reportadas pelo app (NÃO verificadas no Google Play)
 *   audit        registro de ações do painel
 *
 * O DO processa uma chamada por vez: check + gravação dentro do mesmo método síncrono = atômico.
 * Limites de taxa ficam em memória (zeram se o DO dormir — aceitável para frear abuso).
 */
import { DurableObject } from 'cloudflare:workers';
import type { RewardPack } from '../shared/reward';
import { seasonWindow } from '../shared/season-calendar';

export interface CodeDef {
  code: string; // como exibido (ex.: BLP-7KQ2-M9XA)
  key: string; // normalizado (ex.: BLP7KQ2M9XA)
  reward: RewardPack;
  maxUses: number; // 0 = ilimitado (∞)
  perPlayer: number; // 0 = ilimitado; padrão 1
  startsAt: number | null;
  expiresAt: number | null;
  /** só vale durante esta temporada do passe (índice) */
  season: number | null;
  /** só estes jogadores (ids) podem usar; vazio = todos */
  allow: string[];
  /** @nomes digitados no painel (exibição) */
  allowHandles: string[];
  active: boolean;
  notes: string;
  createdAt: number;
  batch?: string;
  challengeId?: string;
  summary?: string;
}

export interface CodeRec extends CodeDef {
  uses: number;
  players: number;
  recent: { p: string; n: string; t: number }[];
}

export type RedeemOutcome =
  | { ok: true; reward: RewardPack; key: string }
  | { ok: false; error: 'invalid' | 'expired' | 'used' | 'limit' | 'rate' | 'missing' };

export interface PurchaseIn {
  tok: string; // hash do token da loja
  pid: string;
  name: string;
  product: string;
  kind: 'inapp' | 'subs';
  source: string;
  orderId: string;
  price: string;
  status: string;
  t: number;
  ip: string;
  expires: number | null;
}

export type PurchaseRow = {
  id: number;
  pid: string;
  name: string;
  product: string;
  kind: string;
  source: string;
  orderId: string;
  price: string;
  status: string;
  t: number;
  day: string;
  expires: number | null;
  verified: number;
};

export type AuditRow = {
  id: number;
  t: number;
  who: string;
  ip: string;
  action: string;
  detail: string;
  status: number;
};

const DAY = 86_400_000;
/** "AAAA-MM-DD" no horário de Brasília (UTC-3, sem horário de verão). */
export const brDay = (ms: number) => new Date(ms - 3 * 3600_000).toISOString().slice(0, 10);

function defOf(row: { def: string }): CodeDef {
  const d = JSON.parse(row.def) as CodeDef;
  d.perPlayer ??= 1;
  d.season ??= null;
  d.allow ??= [];
  d.allowHandles ??= [];
  return d;
}

export class AdminHub extends DurableObject<Env> {
  private rl = new Map<string, { n: number; t: number }>();
  private fails = new Map<string, { n: number; t: number }>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const sql = ctx.storage.sql;
    sql.exec(`CREATE TABLE IF NOT EXISTS codes (key TEXT PRIMARY KEY, def TEXT NOT NULL, uses INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, batch TEXT)`);
    sql.exec(`CREATE INDEX IF NOT EXISTS codes_batch ON codes(batch)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS code_uses (key TEXT NOT NULL, pid TEXT NOT NULL, n INTEGER NOT NULL, name TEXT NOT NULL, first INTEGER NOT NULL, last INTEGER NOT NULL, PRIMARY KEY (key, pid)) WITHOUT ROWID`);
    sql.exec(`CREATE INDEX IF NOT EXISTS code_uses_pid ON code_uses(pid)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS gift_claims (gid TEXT NOT NULL, pid TEXT NOT NULL, t INTEGER NOT NULL, PRIMARY KEY (gid, pid)) WITHOUT ROWID`);
    sql.exec(`CREATE INDEX IF NOT EXISTS gift_claims_pid ON gift_claims(pid)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS gift_seen (gid TEXT NOT NULL, pid TEXT NOT NULL, t INTEGER NOT NULL, PRIMARY KEY (gid, pid)) WITHOUT ROWID`);
    sql.exec(`CREATE TABLE IF NOT EXISTS purchases (id INTEGER PRIMARY KEY AUTOINCREMENT, tok TEXT NOT NULL UNIQUE, pid TEXT NOT NULL, name TEXT NOT NULL, product TEXT NOT NULL, kind TEXT NOT NULL, source TEXT NOT NULL, order_id TEXT NOT NULL, price TEXT NOT NULL, status TEXT NOT NULL, t INTEGER NOT NULL, day TEXT NOT NULL, ip TEXT NOT NULL, expires INTEGER, verified INTEGER NOT NULL DEFAULT 0)`);
    sql.exec(`CREATE INDEX IF NOT EXISTS purchases_t ON purchases(t)`);
    sql.exec(`CREATE INDEX IF NOT EXISTS purchases_pid ON purchases(pid)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER NOT NULL, who TEXT NOT NULL, ip TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL, status INTEGER NOT NULL)`);
  }

  /* ---------------- limite de taxa (memória) ---------------- */

  /** true = pode; false = passou de `max` chamadas na janela `windowMs`. */
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

  /** Erros de código (chute/força bruta): por jogador e por IP. */
  private tooManyFails(pid: string, ip: string): boolean {
    const now = Date.now();
    const over = (k: string, max: number) => {
      const r = this.fails.get(k);
      return !!r && now - r.t < 10 * 60_000 && r.n >= max;
    };
    return over('p:' + pid, 10) || over('ip:' + ip, 60);
  }

  noteFail(pid: string, ip: string): void {
    const now = Date.now();
    for (const k of ['p:' + pid, 'ip:' + ip]) {
      const r = this.fails.get(k);
      if (!r || now - r.t >= 10 * 60_000) this.fails.set(k, { n: 1, t: now });
      else r.n++;
    }
    if (this.fails.size > 20000) for (const [k, v] of this.fails) if (now - v.t > 10 * 60_000) this.fails.delete(k);
  }

  /* ---------------- códigos ---------------- */

  private recOf(row: { key: string; def: string; uses: number }, recentN = 0): CodeRec {
    const sql = this.ctx.storage.sql;
    const d = defOf(row);
    const players = sql.exec<{ c: number }>('SELECT COUNT(*) AS c FROM code_uses WHERE key = ?', row.key).one().c;
    const recent = recentN
      ? sql.exec<{ pid: string; name: string; last: number }>('SELECT pid, name, last FROM code_uses WHERE key = ? ORDER BY last DESC LIMIT ?', row.key, recentN).toArray().map((r) => ({ p: r.pid, n: r.name, t: r.last }))
      : [];
    return { ...d, uses: row.uses, players, recent };
  }

  getCode(key: string): CodeRec | null {
    const row = this.ctx.storage.sql.exec<{ key: string; def: string; uses: number }>('SELECT key, def, uses FROM codes WHERE key = ?', key).toArray()[0];
    return row ? this.recOf(row, 50) : null;
  }

  hasCode(key: string): boolean {
    return this.ctx.storage.sql.exec('SELECT 1 FROM codes WHERE key = ?', key).toArray().length > 0;
  }

  /** Cria (falha se já existir e `create`) ou substitui a definição; NÃO mexe nos usos. */
  putCodes(defs: CodeDef[], create: boolean, uses?: number[]): { created: number; exists: string[] } {
    const sql = this.ctx.storage.sql;
    const exists: string[] = [];
    let created = 0;
    this.ctx.storage.transactionSync(() => {
      defs.forEach((d, i) => {
        const cur = sql.exec('SELECT 1 FROM codes WHERE key = ?', d.key).toArray().length > 0;
        if (cur && create) return void exists.push(d.code);
        if (cur) sql.exec('UPDATE codes SET def = ?, batch = ? WHERE key = ?', JSON.stringify(d), d.batch ?? null, d.key);
        else {
          sql.exec('INSERT INTO codes (key, def, uses, created, batch) VALUES (?, ?, ?, ?, ?)', d.key, JSON.stringify(d), uses?.[i] ?? 0, d.createdAt, d.batch ?? null);
          created++;
        }
      });
    });
    return { created, exists };
  }

  deleteCodes(keys: string[]): number {
    const sql = this.ctx.storage.sql;
    let n = 0;
    this.ctx.storage.transactionSync(() => {
      for (const k of keys) {
        n += sql.exec('DELETE FROM codes WHERE key = ?', k).rowsWritten;
        sql.exec('DELETE FROM code_uses WHERE key = ?', k);
      }
    });
    return n;
  }

  setActive(keys: string[], active: boolean): number {
    const sql = this.ctx.storage.sql;
    let n = 0;
    this.ctx.storage.transactionSync(() => {
      for (const k of keys) {
        const row = sql.exec<{ def: string }>('SELECT def FROM codes WHERE key = ?', k).toArray()[0];
        if (!row) continue;
        const d = defOf(row);
        d.active = active;
        sql.exec('UPDATE codes SET def = ? WHERE key = ?', JSON.stringify(d), k);
        n++;
      }
    });
    return n;
  }

  keysOfBatch(batch: string): string[] {
    return this.ctx.storage.sql.exec<{ key: string }>('SELECT key FROM codes WHERE batch = ?', batch).toArray().map((r) => r.key);
  }

  /** Lista (sem a lista de resgates) com usos e nº de jogadores distintos. */
  listCodes(): CodeRec[] {
    const sql = this.ctx.storage.sql;
    const counts = new Map(sql.exec<{ key: string; c: number }>('SELECT key, COUNT(*) AS c FROM code_uses GROUP BY key').toArray().map((r) => [r.key, r.c]));
    return sql
      .exec<{ key: string; def: string; uses: number }>('SELECT key, def, uses FROM codes ORDER BY created DESC, key')
      .toArray()
      .map((row) => ({ ...defOf(row), uses: row.uses, players: counts.get(row.key) ?? 0, recent: [] }));
  }

  /** Resgate atômico: todas as regras conferidas e o uso gravado sem await no meio. */
  redeem(key: string, pid: string, name: string, legacyUsed: boolean, ip: string): RedeemOutcome {
    const now = Date.now();
    if (this.tooManyFails(pid, ip)) return { ok: false, error: 'rate' };
    const sql = this.ctx.storage.sql;
    const row = sql.exec<{ key: string; def: string; uses: number }>('SELECT key, def, uses FROM codes WHERE key = ?', key).toArray()[0];
    if (!row) return { ok: false, error: 'missing' };
    const d = defOf(row);
    const bad = (): RedeemOutcome => (this.noteFail(pid, ip), { ok: false, error: 'invalid' });
    if (!d.active) return bad();
    if (d.startsAt && d.startsAt > now) return { ok: false, error: 'invalid' };
    if (d.expiresAt && d.expiresAt <= now) return { ok: false, error: 'expired' };
    if (d.season !== null) {
      const w = seasonWindow(d.season);
      if (!w || now < w.start) return { ok: false, error: 'invalid' };
      if (now >= w.end) return { ok: false, error: 'expired' };
    }
    if (d.allow.length && !d.allow.includes(pid)) return bad();
    const mine = sql.exec<{ n: number }>('SELECT n FROM code_uses WHERE key = ? AND pid = ?', key, pid).toArray()[0]?.n ?? (legacyUsed ? 1 : 0);
    if (d.perPlayer > 0 && mine >= d.perPlayer) return { ok: false, error: 'used' };
    if (d.maxUses > 0 && row.uses >= d.maxUses) return { ok: false, error: 'limit' };
    sql.exec('UPDATE codes SET uses = uses + 1 WHERE key = ?', key);
    sql.exec(
      'INSERT INTO code_uses (key, pid, n, name, first, last) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(key, pid) DO UPDATE SET n = n + 1, name = excluded.name, last = excluded.last',
      key,
      pid,
      mine + 1,
      name,
      now,
      now,
    );
    this.fails.delete('p:' + pid);
    return { ok: true, reward: d.reward, key };
  }

  codesOf(pid: string): { key: string; code: string; n: number; first: number; last: number; summary: string }[] {
    const sql = this.ctx.storage.sql;
    return sql
      .exec<{ key: string; n: number; first: number; last: number; def: string | null }>(
        'SELECT u.key AS key, u.n AS n, u.first AS first, u.last AS last, c.def AS def FROM code_uses u LEFT JOIN codes c ON c.key = u.key WHERE u.pid = ? ORDER BY u.last DESC LIMIT 200',
        pid,
      )
      .toArray()
      .map((r) => {
        const d = r.def ? (JSON.parse(r.def) as CodeDef) : null;
        return { key: r.key, code: d?.code ?? r.key, n: r.n, first: r.first, last: r.last, summary: d?.summary ?? '' };
      });
  }

  /* ---------------- presentes ---------------- */

  /** Marca como pegos; devolve só os que ainda não tinham sido pegos por este jogador. */
  claimGifts(pid: string, gids: string[]): string[] {
    const sql = this.ctx.storage.sql;
    const now = Date.now();
    const out: string[] = [];
    this.ctx.storage.transactionSync(() => {
      for (const g of gids) {
        if (sql.exec('INSERT OR IGNORE INTO gift_claims (gid, pid, t) VALUES (?, ?, ?)', g, pid, now).rowsWritten) out.push(g);
      }
    });
    return out;
  }

  markSeen(pid: string, gids: string[]): void {
    const sql = this.ctx.storage.sql;
    const now = Date.now();
    this.ctx.storage.transactionSync(() => {
      for (const g of gids) sql.exec('INSERT OR IGNORE INTO gift_seen (gid, pid, t) VALUES (?, ?, ?)', g, pid, now);
    });
  }

  giftCounts(gids: string[]): Record<string, { claimed: number; seen: number }> {
    const sql = this.ctx.storage.sql;
    const out: Record<string, { claimed: number; seen: number }> = {};
    for (const g of gids) {
      out[g] = {
        claimed: sql.exec<{ c: number }>('SELECT COUNT(*) AS c FROM gift_claims WHERE gid = ?', g).one().c,
        seen: sql.exec<{ c: number }>('SELECT COUNT(*) AS c FROM gift_seen WHERE gid = ?', g).one().c,
      };
    }
    return out;
  }

  giftStatus(gid: string): { claimed: Record<string, number>; seen: Record<string, number> } {
    const sql = this.ctx.storage.sql;
    const m = (q: string) => Object.fromEntries(sql.exec<{ pid: string; t: number }>(q, gid).toArray().map((r) => [r.pid, r.t]));
    return { claimed: m('SELECT pid, t FROM gift_claims WHERE gid = ? LIMIT 20000'), seen: m('SELECT pid, t FROM gift_seen WHERE gid = ? LIMIT 20000') };
  }

  giftsOf(pid: string): { gid: string; claimed: number | null; seen: number | null }[] {
    const sql = this.ctx.storage.sql;
    const claimed = sql.exec<{ gid: string; t: number }>('SELECT gid, t FROM gift_claims WHERE pid = ?', pid).toArray();
    const seen = sql.exec<{ gid: string; t: number }>('SELECT gid, t FROM gift_seen WHERE pid = ?', pid).toArray();
    const map = new Map<string, { gid: string; claimed: number | null; seen: number | null }>();
    for (const s of seen) map.set(s.gid, { gid: s.gid, claimed: null, seen: s.t });
    for (const c of claimed) map.set(c.gid, { gid: c.gid, seen: map.get(c.gid)?.seen ?? null, claimed: c.t });
    return [...map.values()];
  }

  /* ---------------- compras ---------------- */

  /** Grava a compra reportada (deduplicada pelo token). 'dup' = já existia; 'rate' = abuso. */
  reportPurchase(p: PurchaseIn): 'new' | 'dup' | 'rate' {
    const sql = this.ctx.storage.sql;
    if (sql.exec('SELECT 1 FROM purchases WHERE tok = ?', p.tok).toArray().length) {
      // assinatura renovada / restaurada: atualiza a validade informada
      if (p.expires) sql.exec('UPDATE purchases SET expires = MAX(COALESCE(expires, 0), ?) WHERE tok = ?', p.expires, p.tok);
      return 'dup';
    }
    if (!this.rate('pur:' + p.pid, 20, 3600_000) || !this.rate('purip:' + p.ip, 60, 3600_000)) return 'rate';
    sql.exec(
      'INSERT INTO purchases (tok, pid, name, product, kind, source, order_id, price, status, t, day, ip, expires) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      p.tok,
      p.pid,
      p.name,
      p.product,
      p.kind,
      p.source,
      p.orderId,
      p.price,
      p.status,
      p.t,
      brDay(p.t),
      p.ip,
      p.expires,
    );
    return 'new';
  }

  private purchaseWhere(f: { from?: number; to?: number; q?: string; product?: string; pid?: string }): [string, unknown[]] {
    const w: string[] = [];
    const a: unknown[] = [];
    if (f.from) w.push('t >= ?'), a.push(f.from);
    if (f.to) w.push('t < ?'), a.push(f.to);
    if (f.product) w.push('product = ?'), a.push(f.product);
    if (f.pid) w.push('pid = ?'), a.push(f.pid);
    if (f.q) w.push('(pid LIKE ? OR name LIKE ? OR order_id LIKE ?)'), a.push(f.q + '%', '%' + f.q + '%', '%' + f.q + '%');
    return [w.length ? 'WHERE ' + w.join(' AND ') : '', a];
  }

  purchases(f: { from?: number; to?: number; q?: string; product?: string; pid?: string; limit?: number; offset?: number }): {
    items: PurchaseRow[];
    total: number;
    byDay: { day: string; n: number }[];
    byProduct: { product: string; n: number }[];
    payers: number;
  } {
    const sql = this.ctx.storage.sql;
    const [where, args] = this.purchaseWhere(f);
    const items = sql
      .exec<PurchaseRow>(
        `SELECT id, pid, name, product, kind, source, order_id AS orderId, price, status, t, day, expires, verified FROM purchases ${where} ORDER BY t DESC LIMIT ? OFFSET ?`,
        ...args,
        Math.min(500, f.limit ?? 100),
        f.offset ?? 0,
      )
      .toArray();
    const total = sql.exec<{ c: number }>(`SELECT COUNT(*) AS c FROM purchases ${where}`, ...args).one().c;
    const payers = sql.exec<{ c: number }>(`SELECT COUNT(DISTINCT pid) AS c FROM purchases ${where}`, ...args).one().c;
    const byDay = sql.exec<{ day: string; n: number }>(`SELECT day, COUNT(*) AS n FROM purchases ${where} GROUP BY day ORDER BY day DESC LIMIT 120`, ...args).toArray();
    const byProduct = sql.exec<{ product: string; n: number }>(`SELECT product, COUNT(*) AS n FROM purchases ${where} GROUP BY product ORDER BY n DESC`, ...args).toArray();
    return { items, total, byDay, byProduct, payers };
  }

  /** Por jogador: nº de compras, última e maior validade de assinatura reportada. */
  purchaseSummary(): Record<string, { n: number; last: number; subUntil: number }> {
    const rows = this.ctx.storage.sql
      .exec<{ pid: string; n: number; last: number; sub: number | null }>(
        "SELECT pid, COUNT(*) AS n, MAX(t) AS last, MAX(CASE WHEN kind = 'subs' THEN COALESCE(expires, t + ?) END) AS sub FROM purchases GROUP BY pid",
        31 * DAY,
      )
      .toArray();
    return Object.fromEntries(rows.map((r) => [r.pid, { n: r.n, last: r.last, subUntil: r.sub ?? 0 }]));
  }

  /* ---------------- auditoria ---------------- */

  audit(e: Omit<AuditRow, 'id'>): void {
    const sql = this.ctx.storage.sql;
    sql.exec('INSERT INTO audit (t, who, ip, action, detail, status) VALUES (?, ?, ?, ?, ?, ?)', e.t, e.who.slice(0, 40), e.ip.slice(0, 60), e.action.slice(0, 120), e.detail.slice(0, 600), e.status);
    // guarda ~1 ano / 20 mil entradas
    if (Math.random() < 0.02) sql.exec('DELETE FROM audit WHERE t < ? OR id < (SELECT MAX(id) FROM audit) - 20000', Date.now() - 365 * DAY);
  }

  auditList(before: number | null, limit: number, q: string): AuditRow[] {
    const w: string[] = [];
    const a: unknown[] = [];
    if (before) w.push('id < ?'), a.push(before);
    if (q) w.push('(action LIKE ? OR detail LIKE ? OR who LIKE ?)'), a.push('%' + q + '%', '%' + q + '%', '%' + q + '%');
    return this.ctx.storage.sql
      .exec<AuditRow>(`SELECT id, t, who, ip, action, detail, status FROM audit ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`, ...a, Math.min(200, limit))
      .toArray();
  }
}

export const adminHub = (env: Env): DurableObjectStub<AdminHub> => env.ADMIN.get(env.ADMIN.idFromName('hub'));
