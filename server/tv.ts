/**
 * TV Bloop — Durable Object `TvChannel` (SQLite, instância única 'main'): um canal ao vivo com os
 * filmes APROVADOS do Bloop Cinema. docs/LOJA-TV.md.
 *
 * A grade é montada aqui (sempre `TV.queue` filmes à frente) e guardada: todos os espectadores recebem
 * o mesmo "agora passando" + a hora de início no relógio do servidor, e cada aparelho desenha o filme
 * localmente com o player do Cinema, pulando para o mesmo segundo. Nada de vídeo trafega.
 *
 * Sorteio do próximo filme: peso = (1 + votos)^0.8 × 2 se aprovado há < 3 dias × penalidade de repetição
 * (o último não repete se houver outro; os 5 últimos valem 15%).
 *
 *   films   filmes no ar (cópia dos metadados do UgcHub)
 *   votes   "Gostei": 1 por conta por filme
 *   vday    moedas de TV por autor/dia (teto)
 *   sched   grade (start ms, filme, duração)
 */
import { DurableObject } from 'cloudflare:workers';
import { TV, type TvNow, type TvSlot } from '../shared/ugc';
import { brDay } from './admin-hub';

type FilmRow = {
  id: string;
  author: string;
  aname: string;
  title: string;
  dur: number;
  votes: number;
  tvotes: number;
  approved: number;
  plays: number;
};

export class TvChannel extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const sql = ctx.storage.sql;
    sql.exec(`CREATE TABLE IF NOT EXISTS films (id TEXT PRIMARY KEY, author TEXT NOT NULL, aname TEXT NOT NULL, title TEXT NOT NULL, dur INTEGER NOT NULL, votes INTEGER NOT NULL DEFAULT 0, tvotes INTEGER NOT NULL DEFAULT 0, approved INTEGER NOT NULL, plays INTEGER NOT NULL DEFAULT 0)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS votes (id TEXT NOT NULL, pid TEXT NOT NULL, t INTEGER NOT NULL, trusted INTEGER NOT NULL, PRIMARY KEY (id, pid)) WITHOUT ROWID`);
    sql.exec(`CREATE TABLE IF NOT EXISTS vday (pid TEXT NOT NULL, day TEXT NOT NULL, coins INTEGER NOT NULL, PRIMARY KEY (pid, day)) WITHOUT ROWID`);
    sql.exec(`CREATE TABLE IF NOT EXISTS sched (start INTEGER PRIMARY KEY, id TEXT NOT NULL, dur INTEGER NOT NULL)`);
  }

  /* ---------------- filmes ---------------- */

  /** Entra no ar (aprovado). Reaprovar mantém os votos. */
  addFilm(f: { id: string; author: string; aname: string; title: string; durSec: number }): void {
    const dur = Math.round(Math.max(TV.minDurSec, Math.min(TV.maxDurSec, f.durSec)) * 1000);
    this.ctx.storage.sql.exec(
      'INSERT INTO films (id, author, aname, title, dur, approved) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET author = excluded.author, aname = excluded.aname, title = excluded.title, dur = excluded.dur',
      f.id, f.author, f.aname, f.title, dur, Date.now(),
    );
  }

  /** Sai do ar (recusado, denunciado, apagado). Se estiver passando, corta e a grade é refeita. */
  removeFilm(id: string): void {
    const sql = this.ctx.storage.sql;
    const now = Date.now();
    sql.exec('DELETE FROM films WHERE id = ?', id);
    const curRow = sql.exec<{ start: number; id: string }>('SELECT start, id FROM sched WHERE start <= ? AND start + dur > ? LIMIT 1', now, now).toArray()[0];
    // tira tudo o que ainda vai passar (e o atual, se for o removido); advance() refaz a grade
    sql.exec('DELETE FROM sched WHERE start > ?', now);
    if (curRow?.id === id) sql.exec('DELETE FROM sched WHERE start = ?', curRow.start);
  }

  list(): FilmRow[] {
    return this.ctx.storage.sql.exec<FilmRow>('SELECT id, author, aname, title, dur, votes, tvotes, approved, plays FROM films ORDER BY approved DESC').toArray();
  }

  /* ---------------- grade ---------------- */

  private pick(recent: string[]): FilmRow | null {
    const films = this.ctx.storage.sql.exec<FilmRow>('SELECT id, author, aname, title, dur, votes, tvotes, approved, plays FROM films').toArray();
    if (!films.length) return null;
    if (films.length === 1) return films[0];
    const now = Date.now();
    const last = recent[recent.length - 1];
    const last5 = new Set(recent.slice(-5));
    const weights = films.map((f) => {
      if (f.id === last) return 0;
      let w = Math.pow(1 + f.votes, 0.8);
      if (now - f.approved < 3 * 86_400_000) w *= 2;
      if (last5.has(f.id)) w *= 0.15;
      return w;
    });
    const sum = weights.reduce((s, w) => s + w, 0);
    let r = Math.random() * sum;
    for (let i = 0; i < films.length; i++) if ((r -= weights[i]) <= 0 && weights[i] > 0) return films[i];
    return films.find((f) => f.id !== last) ?? films[0];
  }

  /** Mantém a grade cheia até TV.queue filmes à frente. */
  private advance(now: number): void {
    const sql = this.ctx.storage.sql;
    sql.exec('DELETE FROM sched WHERE start + dur < ?', now - 10 * 60_000);
    const upcoming = () => sql.exec<{ c: number }>('SELECT COUNT(*) AS c FROM sched WHERE start + dur > ?', now).one().c;
    for (let guard = 0; guard < TV.queue + 2 && upcoming() < TV.queue; guard++) {
      const hist = sql.exec<{ id: string; start: number; dur: number }>('SELECT id, start, dur FROM sched ORDER BY start DESC LIMIT 6').toArray().reverse();
      const f = this.pick(hist.map((h) => h.id));
      if (!f) return;
      const tail = hist.length ? hist[hist.length - 1].start + hist[hist.length - 1].dur + TV.gapMs : 0;
      // canal parado (ninguém assistindo há um tempo): começa daqui a 2 s
      const start = Math.max(tail, now + 2000);
      sql.exec('INSERT INTO sched (start, id, dur) VALUES (?, ?, ?)', start, f.id, f.dur);
      sql.exec('UPDATE films SET plays = plays + 1 WHERE id = ?', f.id);
    }
  }

  now(): TvNow {
    const now = Date.now();
    this.advance(now);
    const sql = this.ctx.storage.sql;
    const rows = sql
      .exec<{ start: number; dur: number; id: string; title: string | null; aname: string | null; votes: number | null }>(
        'SELECT s.start AS start, s.dur AS dur, s.id AS id, f.title AS title, f.aname AS aname, f.votes AS votes FROM sched s LEFT JOIN films f ON f.id = s.id WHERE s.start + s.dur > ? ORDER BY s.start LIMIT ?',
        now,
        TV.queue + 1,
      )
      .toArray()
      .filter((r) => r.title !== null);
    const slots: TvSlot[] = rows.map((r) => ({ id: r.id, title: r.title!, author: r.aname!, start: r.start, dur: r.dur, votes: r.votes ?? 0 }));
    const films = sql.exec<{ c: number }>('SELECT COUNT(*) AS c FROM films').one().c;
    return { now: Date.now(), cur: slots[0] ?? null, next: slots.slice(1), films };
  }

  /* ---------------- votos ---------------- */

  /**
   * "Gostei" (1 por conta por filme; o autor não vota no próprio). A cada TV.votesPerReward votos de contas
   * confiáveis o autor ganha TV.coinsPerReward (teto diário por autor). Devolve o presente a entregar.
   */
  vote(id: string, pid: string, trusted: boolean): { ok: false; error: 'missing' | 'self' } | { ok: true; votes: number; voted: boolean; grant: { pid: string; coins: number } | null } {
    const sql = this.ctx.storage.sql;
    const f = sql.exec<FilmRow>('SELECT id, author, aname, title, dur, votes, tvotes, approved, plays FROM films WHERE id = ?', id).toArray()[0];
    if (!f) return { ok: false, error: 'missing' };
    if (f.author === pid) return { ok: false, error: 'self' };
    if (!sql.exec('INSERT OR IGNORE INTO votes (id, pid, t, trusted) VALUES (?, ?, ?, ?)', id, pid, Date.now(), trusted ? 1 : 0).rowsWritten) return { ok: true, votes: f.votes, voted: true, grant: null };
    sql.exec(`UPDATE films SET votes = votes + 1${trusted ? ', tvotes = tvotes + 1' : ''} WHERE id = ?`, id);
    let grant: { pid: string; coins: number } | null = null;
    const tv = f.tvotes + (trusted ? 1 : 0);
    if (trusted && tv % TV.votesPerReward === 0) {
      const day = brDay(Date.now());
      const got = sql.exec<{ coins: number }>('SELECT coins FROM vday WHERE pid = ? AND day = ?', f.author, day).toArray()[0]?.coins ?? 0;
      const give = Math.max(0, Math.min(TV.coinsPerReward, TV.dailyCapPerAuthor - got));
      if (give) {
        sql.exec('INSERT INTO vday (pid, day, coins) VALUES (?, ?, ?) ON CONFLICT(pid, day) DO UPDATE SET coins = coins + excluded.coins', f.author, day, give);
        grant = { pid: f.author, coins: give };
      }
    }
    return { ok: true, votes: f.votes + 1, voted: true, grant };
  }

  voted(id: string, pid: string): boolean {
    return this.ctx.storage.sql.exec('SELECT 1 FROM votes WHERE id = ? AND pid = ?', id, pid).toArray().length > 0;
  }
}

export const tvChannel = (env: Env): DurableObjectStub<TvChannel> => env.TV.get(env.TV.idFromName('main'));
