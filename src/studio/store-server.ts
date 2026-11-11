/* ============================================================
 *  BLOOP STUDIO — Loja de Criações no SERVIDOR (Worker: /api/ugc/*).
 *  Mesma interface do mock (store-api.ts). Sem rede: cai para o mock
 *  (criações iniciais + o que está no aparelho) e tenta de novo depois.
 *
 *  Tudo o que é publicado entra numa fila de revisão (moderação) e só
 *  aparece para os outros depois de aprovado — o autor vê "Em análise".
 *  Moedas de criador chegam pelo Correio (docs/LOJA-TV.md).
 * ============================================================ */
import { ONLINE } from '../config';
import { apiBase, ensurePlayer } from '../services/leaderboard';
import { validate, type Creation } from './format';
import { cachePut } from './library';
import { starters } from './starters';
import { localAuthor, MockStore } from './store-mock';
import type { BrowseQuery, Earnings, PublishError, PublishResult, ReportReason, ReviewTicket, ScoreEntry, StoreCategory, StoreListing, StorePage, StudioStoreApi, UseReceipt } from './store-api';

class Offline extends Error {}
class HttpErr extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

/** depois de uma falha de rede, usa o mock por 30 s (sem esperar o timeout a cada tela) */
const OFFLINE_MS = 30_000;

export class ServerStore implements StudioStoreApi {
  private offlineUntil = 0;
  private starterIds: Set<string> | null = null;
  constructor(private mock: MockStore) {}

  private isStarter(id: string): boolean {
    this.starterIds ??= new Set(starters().map((m) => m.c.id));
    return this.starterIds.has(id);
  }

  private async pid(): Promise<string> {
    return (await ensurePlayer(1500)).id;
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: Record<string, unknown>, timeout = ONLINE.timeoutMs): Promise<T> {
    if (Date.now() < this.offlineUntil) throw new Offline();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    let res: Response;
    try {
      res = await fetch(`${apiBase()}/api${path}`, {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
    } catch {
      this.offlineUntil = Date.now() + OFFLINE_MS;
      throw new Offline();
    } finally {
      clearTimeout(timer);
    }
    let data: any = null;
    try {
      data = await res.json();
    } catch {
      /* */
    }
    if (!res.ok) {
      // servidor sem a rota (versão antiga / estático): trata como offline
      if (res.status === 404 && data?.error === 'not_found' && /Rota/.test(data?.message ?? '')) {
        this.offlineUntil = Date.now() + OFFLINE_MS;
        throw new Offline();
      }
      throw new HttpErr(res.status, data?.error ?? 'http');
    }
    return data as T;
  }

  /** URLs relativas do servidor (/api/ugc/thumb...) → absolutas no app nativo. */
  private fix(l: StoreListing & { own?: boolean }): StoreListing {
    const abs = (u?: string) => (u && u.startsWith('/api/') ? apiBase() + u : u);
    const out: StoreListing = { ...l, thumb: abs(l.thumb) };
    if (l.game) out.game = { ...l.game, thumbs: l.game.thumbs.map((u) => abs(u)!) };
    if (l.own) out.author = { ...l.author, id: localAuthor().id };
    return out;
  }

  async browse(q: BrowseQuery): Promise<StorePage> {
    const pid = await this.pid();
    let server: StorePage;
    try {
      const sp = new URLSearchParams({ sort: q.sort, limit: String(q.limit ?? 24) });
      if (pid) sp.set('pid', pid);
      if (q.section) sp.set('section', q.section);
      if (q.tag) sp.set('tag', q.tag);
      if (q.category) sp.set('category', q.category);
      if (q.kind) sp.set('kind', q.kind);
      if (q.text) sp.set('text', q.text);
      if (q.favorites) sp.set('fav', '1');
      if (q.cursor) sp.set('cursor', q.cursor);
      server = await this.call<StorePage>('GET', '/ugc/browse?' + sp.toString());
    } catch (e) {
      if (e instanceof Offline) return this.mock.browse(q);
      throw e;
    }
    // criações da Equipe Bloop (no app) + o que veio do servidor, na mesma ordem
    const hidden = this.mock.localFilter();
    const items = server.items.map((l) => this.fix(l)).filter((l) => !hidden.authors.has(l.author.id) && !hidden.reported.has(l.id));
    if (q.cursor) return { items, next: server.next };
    const official = (await this.mock.browse({ ...q, limit: 200 })).items.filter((l) => l.official);
    const now = Date.now();
    const score = (l: StoreListing) => (l.likes + l.uses * 2 + l.plays + 1) / Math.pow(1 + (now - l.created) / 86400_000 / 7, 0.9);
    const all = [...items, ...official];
    if (q.sort === 'new') all.sort((a, b) => b.created - a.created);
    else if (q.sort === 'top') all.sort((a, b) => b.likes - a.likes);
    else all.sort((a, b) => score(b) - score(a));
    return { items: all.slice(0, q.limit ?? 24), next: server.next };
  }

  async get(id: string): Promise<{ listing: StoreListing; creation: Creation } | null> {
    if (this.isStarter(id)) return this.mock.get(id);
    const pid = await this.pid();
    try {
      const r = await this.call<{ listing: StoreListing; creation: unknown }>('GET', `/ugc/get?id=${encodeURIComponent(id)}${pid ? '&pid=' + encodeURIComponent(pid) : ''}`);
      const c = validate(r.creation).creation;
      if (!c) return null;
      void cachePut(c).catch(() => {});
      return { listing: this.fix(r.listing), creation: c };
    } catch (e) {
      if (e instanceof Offline) return this.mock.get(id);
      return null;
    }
  }

  async publish(c: Creation, category: StoreCategory, dailyLimit: number, thumbs?: string[]): Promise<PublishResult> {
    const pid = await this.pid();
    if (!pid) return { ok: false, error: 'offline' };
    const a = localAuthor();
    try {
      const r = await this.call<{ ok: boolean; listing?: StoreListing; error?: string }>('POST', '/ugc/publish', { id: pid, creation: { ...c, author: a.name, authorId: a.id }, category, thumbs: thumbs ?? [], dailyLimit }, 30_000);
      if (!r.ok || !r.listing) return { ok: false, error: (['name', 'invalid', 'daily-limit', 'too-big', 'empty'].includes(r.error ?? '') ? r.error : 'invalid') as PublishError };
      void cachePut(c).catch(() => {});
      return { ok: true, listing: this.fix(r.listing) };
    } catch (e) {
      if (e instanceof HttpErr && e.status === 413) return { ok: false, error: 'too-big' };
      return { ok: false, error: 'offline' };
    }
  }

  async like(id: string, on: boolean): Promise<number> {
    if (this.isStarter(id)) return this.mock.like(id, on);
    try {
      return (await this.call<{ likes: number }>('POST', '/ugc/like', { id: await this.pid(), item: id, on })).likes;
    } catch (e) {
      if (e instanceof Offline) return this.mock.like(id, on);
      throw e;
    }
  }

  async report(id: string, reason: ReportReason, note?: string): Promise<void> {
    // some da loja deste aparelho na hora; o servidor esconde para todos depois de várias denúncias
    await this.mock.report(id, reason);
    if (this.isStarter(id)) return;
    await this.call('POST', '/ugc/report', { id: await this.pid(), item: id, reason, note: note ?? '' }).catch(() => {});
  }

  hideAuthor(authorId: string): Promise<void> {
    return this.mock.hideAuthor(authorId);
  }
  unhideAuthor(authorId: string): Promise<void> {
    return this.mock.unhideAuthor(authorId);
  }
  hiddenAuthors(): Promise<string[]> {
    return this.mock.hiddenAuthors();
  }

  async recordUse(id: string, kind: 'place' | 'play'): Promise<UseReceipt> {
    if (this.isStarter(id)) return this.mock.recordUse(id, kind);
    try {
      return await this.call<UseReceipt>('POST', '/ugc/use', { id: await this.pid(), item: id, kind });
    } catch {
      return { counted: false, authorCoins: 0 };
    }
  }

  private mineCache: { at: number; items: StoreListing[]; today: number; earnings: Earnings } | null = null;
  private async mineData(): Promise<{ items: StoreListing[]; today: number; earnings: Earnings }> {
    if (this.mineCache && Date.now() - this.mineCache.at < 3000) return this.mineCache;
    const pid = await this.pid();
    const r = await this.call<{ items: StoreListing[]; today: number; earnings: Earnings }>('GET', `/ugc/mine?type=criacao&pid=${encodeURIComponent(pid)}`);
    this.mineCache = { at: Date.now(), items: r.items.map((l) => this.fix({ ...l, own: true })), today: r.today, earnings: r.earnings };
    return this.mineCache;
  }

  async mine(): Promise<StoreListing[]> {
    try {
      return (await this.mineData()).items;
    } catch {
      return this.mock.mine();
    }
  }

  async unpublish(id: string): Promise<void> {
    this.mineCache = null;
    await this.mock.unpublish(id);
    await this.call('POST', '/ugc/unpublish', { id: await this.pid(), item: id }).catch(() => {});
  }

  async earnings(): Promise<Earnings> {
    try {
      return (await this.mineData()).earnings;
    } catch {
      return this.mock.earnings();
    }
  }

  /** As moedas chegam pelo Correio (presente pessoal), não por aqui. */
  async claimEarnings(): Promise<number> {
    return 0;
  }

  async publishedToday(): Promise<number> {
    try {
      return (await this.mineData()).today;
    } catch {
      return this.mock.publishedToday();
    }
  }

  async submitForReview(c: Creation, thumbnails: string[], dailyLimit: number): Promise<ReviewTicket | { error: PublishError }> {
    if (!c.game) return { error: 'invalid' };
    const r = await this.publish(c, 'maps', dailyLimit, thumbnails);
    this.mineCache = null;
    if (!r.ok) return { error: r.error };
    return { id: r.listing.id, status: r.listing.review ?? 'pending', reason: r.listing.reviewReason };
  }

  async reviewStatus(id: string): Promise<ReviewTicket | null> {
    this.mineCache = null;
    const l = (await this.mine()).find((x) => x.id === id);
    return l ? { id, status: l.review ?? 'approved', reason: l.reviewReason } : null;
  }

  async favorite(id: string, on: boolean): Promise<number> {
    if (this.isStarter(id)) return this.mock.favorite(id, on);
    try {
      return (await this.call<{ favorites: number }>('POST', '/ugc/fav', { id: await this.pid(), item: id, on })).favorites;
    } catch (e) {
      if (e instanceof Offline) return this.mock.favorite(id, on);
      throw e;
    }
  }

  async submitScore(id: string, r: { score: number; timeSec: number }): Promise<{ rank: number }> {
    if (this.isStarter(id)) return this.mock.submitScore(id, r);
    try {
      return await this.call<{ rank: number }>('POST', '/ugc/score', { id: await this.pid(), item: id, score: r.score, timeSec: r.timeSec });
    } catch {
      return this.mock.submitScore(id, r);
    }
  }

  async leaderboard(id: string): Promise<ScoreEntry[]> {
    if (this.isStarter(id)) return this.mock.leaderboard(id);
    try {
      return (await this.call<{ items: ScoreEntry[] }>('GET', `/ugc/board?item=${encodeURIComponent(id)}&pid=${encodeURIComponent(await this.pid())}`)).items;
    } catch {
      return this.mock.leaderboard(id);
    }
  }
}

let inst: StudioStoreApi | null = null;
/** A loja em uso: servidor, com o mock como reserva sem internet. */
export function store(): StudioStoreApi {
  return (inst ??= new ServerStore(new MockStore()));
}
