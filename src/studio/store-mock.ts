/* ============================================================
 *  BLOOP STUDIO — Loja de Criações MOCK (sem servidor).
 *  Fonte: 20+ criações iniciais da Equipe Bloop + o que ESTE aparelho
 *  publicou. Curtidas/denúncias/autores ocultos ficam no aparelho.
 *  Mesma interface que o servidor vai ter (store-api.ts).
 * ============================================================ */
import { filterMessage } from '../../shared/moderation';
import { dayNumber } from '../core/storage';
import { profile } from '../services/profile';
import { hashCreation, jsonBytes, LIMITS, validate, type Creation } from './format';
import { cachePut, preload, resolveSync } from './library';
import { starters, starterName, TEAM } from './starters';
import type { BrowseQuery, Earnings, PublishResult, ReportReason, StoreCategory, StoreListing, StorePage, StudioStoreApi, UseReceipt } from './store-api';

const KEY = 'bs-store';
interface MockState {
  pub: StoreListing[];
  likes: string[];
  used: string[];
  reported: { id: string; reason: ReportReason; at: number }[];
  hidden: string[];
  pubDay: number;
  pubCount: number;
  earned: number;
}

function load(): MockState {
  const d: MockState = { pub: [], likes: [], used: [], reported: [], hidden: [], pubDay: 0, pubCount: 0, earned: 0 };
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (o && typeof o === 'object') return { ...d, ...o };
  } catch {
    /* */
  }
  return d;
}

export function localAuthor(): { id: string; name: string } {
  let id = '';
  try {
    id = localStorage.getItem('bs-uid') || '';
    if (!id) {
      id = 'u_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('bs-uid', id);
    }
  } catch {
    id = 'u_local';
  }
  return { id: profile.handle ? '@' + profile.handle : id, name: profile.nick || 'Bloop' };
}

const delay = <T>(v: T, ms = 60): Promise<T> => new Promise((r) => setTimeout(() => r(v), ms));

export class MockStore implements StudioStoreApi {
  private s = load();
  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.s));
    } catch {
      /* */
    }
  }
  private starterListings(): StoreListing[] {
    return starters().map((m, i) => ({
      id: m.c.id,
      kind: m.c.kind,
      name: starterName(m.c.id, m.c.name),
      author: TEAM,
      category: m.category,
      hash: hashCreation(m.c),
      parts: m.c.parts.length,
      likes: m.likes,
      uses: m.uses,
      plays: m.c.kind === 'map' ? m.likes * 3 : 0,
      created: 1767225600000 + i * 3600_000,
      official: true,
      worldKind: m.c.worldKind,
    }));
  }
  private all(): StoreListing[] {
    const hidden = new Set(this.s.hidden);
    const rep = new Set(this.s.reported.map((r) => r.id));
    const liked = new Set(this.s.likes);
    return [...this.s.pub, ...this.starterListings()]
      .filter((l) => !hidden.has(l.author.id) && !rep.has(l.id))
      .map((l) => ({ ...l, liked: liked.has(l.id), likes: l.likes + (liked.has(l.id) ? 1 : 0) }));
  }

  async browse(q: BrowseQuery): Promise<StorePage> {
    let items = this.all();
    if (q.category) items = items.filter((l) => l.category === q.category);
    if (q.kind) items = items.filter((l) => l.kind === q.kind);
    if (q.text) {
      const t = q.text.toLowerCase();
      items = items.filter((l) => l.name.toLowerCase().includes(t) || l.author.name.toLowerCase().includes(t));
    }
    const now = Date.now();
    const score = (l: StoreListing) => (l.likes + l.uses * 2 + l.plays) / Math.pow(1 + (now - l.created) / 86400_000 / 30, 0.6);
    if (q.sort === 'new') items.sort((a, b) => b.created - a.created);
    else if (q.sort === 'top') items.sort((a, b) => b.likes - a.likes);
    else items.sort((a, b) => score(b) - score(a));
    const start = q.cursor ? parseInt(q.cursor, 10) || 0 : 0;
    const lim = q.limit ?? 24;
    const page = items.slice(start, start + lim);
    return delay({ items: page, next: start + lim < items.length ? String(start + lim) : undefined });
  }

  async get(id: string): Promise<{ listing: StoreListing; creation: Creation } | null> {
    const listing = this.all().find((l) => l.id === id) ?? this.s.pub.find((l) => l.id === id);
    if (!listing) return null;
    const st = starters().find((m) => m.c.id === id);
    let c: Creation | null | undefined = st ? st.c : resolveSync(id);
    if (!c) {
      await preload([id]);
      c = resolveSync(id);
    }
    if (!c) return null;
    const v = validate(c).creation;
    if (!v) return null;
    if (st) v.name = listing.name;
    return { listing, creation: v };
  }

  async publish(c: Creation, category: StoreCategory, dailyLimit: number): Promise<PublishResult> {
    const day = dayNumber();
    if (this.s.pubDay !== day) {
      this.s.pubDay = day;
      this.s.pubCount = 0;
    }
    const existing = this.s.pub.find((l) => l.id === c.id);
    if (!existing && this.s.pubCount >= dailyLimit) return { ok: false, error: 'daily-limit' };
    if (!c.parts.length) return { ok: false, error: 'empty' };
    const f = filterMessage(c.name);
    if (!f.ok || f.filtered) return { ok: false, error: 'name' };
    const v = validate(c);
    if (!v.creation) return { ok: false, error: 'invalid' };
    if (jsonBytes(v.creation) > LIMITS.bytes) return { ok: false, error: 'too-big' };
    const me = localAuthor();
    const pc: Creation = { ...v.creation, author: me.name, authorId: me.id };
    await cachePut(pc);
    const listing: StoreListing = {
      id: pc.id,
      kind: pc.kind,
      name: pc.name,
      author: me,
      category,
      thumb: pc.thumbnail,
      hash: hashCreation(pc),
      parts: pc.parts.length,
      likes: existing?.likes ?? 0,
      uses: existing?.uses ?? 0,
      plays: existing?.plays ?? 0,
      created: existing?.created ?? Date.now(),
      worldKind: pc.worldKind,
    };
    this.s.pub = [listing, ...this.s.pub.filter((l) => l.id !== pc.id)];
    if (!existing) this.s.pubCount++;
    this.save();
    return delay({ ok: true, listing });
  }

  async like(id: string, on: boolean): Promise<number> {
    this.s.likes = this.s.likes.filter((x) => x !== id);
    if (on) this.s.likes.push(id);
    this.save();
    const l = this.all().find((x) => x.id === id);
    return delay(l?.likes ?? 0);
  }
  async report(id: string, reason: ReportReason): Promise<void> {
    if (!this.s.reported.find((r) => r.id === id)) this.s.reported.push({ id, reason, at: Date.now() });
    this.save();
    return delay(undefined);
  }
  async hideAuthor(authorId: string): Promise<void> {
    if (authorId === TEAM.id) return;
    if (!this.s.hidden.includes(authorId)) this.s.hidden.push(authorId);
    this.save();
  }
  async unhideAuthor(authorId: string): Promise<void> {
    this.s.hidden = this.s.hidden.filter((x) => x !== authorId);
    this.save();
  }
  async hiddenAuthors(): Promise<string[]> {
    return [...this.s.hidden];
  }
  async recordUse(id: string, kind: 'place' | 'play'): Promise<UseReceipt> {
    const key = kind + ':' + id;
    const l = this.s.pub.find((x) => x.id === id);
    const mine = l?.author.id === localAuthor().id;
    if (this.s.used.includes(key) || mine) return { counted: false, authorCoins: 0 };
    this.s.used.push(key);
    if (l) {
      if (kind === 'place') l.uses++;
      else l.plays++;
    }
    this.save();
    // no servidor: credita CREATOR_REWARD.perUse/perPlay ao autor (com os tetos). Aqui o autor é outra pessoa.
    return { counted: true, authorCoins: 0 };
  }
  async mine(): Promise<StoreListing[]> {
    const me = localAuthor().id;
    return this.s.pub.filter((l) => l.author.id === me);
  }
  async unpublish(id: string): Promise<void> {
    this.s.pub = this.s.pub.filter((l) => l.id !== id);
    this.save();
  }
  async earnings(): Promise<Earnings> {
    // offline não há outros jogadores usando suas criações; o servidor preencherá isso.
    return { pending: 0, total: this.s.earned };
  }
  async claimEarnings(): Promise<number> {
    return 0;
  }
  async publishedToday(): Promise<number> {
    return this.s.pubDay === dayNumber() ? this.s.pubCount : 0;
  }
}

let inst: StudioStoreApi | null = null;
/** A loja em uso (mock hoje; o servidor troca aqui). */
export function store(): StudioStoreApi {
  return (inst ??= new MockStore());
}
