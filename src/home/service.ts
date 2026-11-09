/* ============================================================
 *  Acesso à API + estado local da Casa (posse de peças, cache, medalhas).
 *  O backend (src/services/home.ts) é carregado via import.meta.glob:
 *  se ainda não existir, ou se falhar, usamos a API local (mock-api).
 * ============================================================ */
import type { HomeAccess, HomeApi, HomeDesign, HomeRole, HomeState, MessItem, PartyEvent, PartySession } from './api';
import { normalizeDesign, starterDesign } from './catalog';
import { mockApi, MockParty } from './mock-api';

const mods = import.meta.glob('../services/home.ts');
let apiP: Promise<HomeApi> | null = null;
let usingMock = false;

function forceMock(): boolean {
  try {
    return new URLSearchParams(location.search).has('mock') || localStorage.getItem('bw-home-mock') === '1';
  } catch {
    return false;
  }
}

type HomeMod = { homeApi?: HomeApi; homeNet?: () => 'unknown' | 'ok' | 'down'; onHomeNet?: (cb: (s: string) => void) => () => void; hasPendingSync?: () => boolean };
let mod: HomeMod | null = null;

export function getApi(): Promise<HomeApi> {
  if (apiP) return apiP;
  apiP = (async () => {
    const load = mods['../services/home.ts'];
    if (load && !forceMock()) {
      try {
        // o import é de um chunk local; ainda assim, nunca esperamos mais que 4 s
        const m = (await withTimeout(load() as Promise<HomeMod>, 4000, null)) as HomeMod | null;
        if (m?.homeApi) {
          mod = m;
          m.onHomeNet?.(() => emitNet());
          return wrap(m.homeApi);
        }
      } catch {
        /* cai no mock */
      }
    }
    usingMock = true;
    return mockApi;
  })();
  return apiP;
}
export const isMock = (): boolean => usingMock;

/** Promessa com prazo: depois de `ms`, resolve com `fallback` (a chamada original segue em segundo plano). */
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((res) => {
    const tm = setTimeout(() => res(fallback), ms);
    p.then(
      (v) => (clearTimeout(tm), res(v)),
      () => (clearTimeout(tm), res(fallback)),
    );
  });
}

/* ---------------- estado da rede (chip "Offline") ---------------- */
export type NetState = 'online' | 'offline' | 'unknown';
const netCbs = new Set<() => void>();
function emitNet(): void {
  for (const cb of netCbs) {
    try {
      cb();
    } catch {
      /* */
    }
  }
}
export function netState(): NetState {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  if (usingMock) return 'offline';
  const s = mod?.homeNet?.() ?? 'unknown';
  return s === 'ok' ? 'online' : s === 'down' ? 'offline' : 'unknown';
}
export function onNet(cb: () => void): () => void {
  netCbs.add(cb);
  return () => netCbs.delete(cb);
}
export const hasPendingSync = (): boolean => !!mod?.hasPendingSync?.();
if (typeof window !== 'undefined') {
  window.addEventListener('online', emitNet);
  window.addEventListener('offline', emitNet);
}

/** API real com redes de segurança: nada trava a tela (prazo em tudo), festa e casa própria sempre funcionam. */
function wrap(real: HomeApi): HomeApi {
  const T = 7000;
  return {
    ...real,
    checkHandle: (h) => withTimeout(real.checkHandle(h), T, { ok: false, reason: 'network' as const }),
    claimHandle: (h) => withTimeout(real.claimHandle(h), T, { ok: false, reason: 'network' as const }),
    friends: () => withTimeout(real.friends(), T, []),
    requests: () => withTimeout(real.requests(), T, []),
    searchPlayer: (h) => withTimeout(real.searchPlayer(h), T, null),
    addFriend: (h) => withTimeout(real.addFriend(h), T, 'network' as const),
    respond: (f, a) => withTimeout(real.respond(f, a), T, false),
    removeFriend: (f) => withTimeout(real.removeFriend(f), T, false),
    blockPlayer: real.blockPlayer ? (x, on) => withTimeout(real.blockPlayer!(x, on), T, false) : undefined,
    getHome: async (id) => {
      const r = await withTimeout(real.getHome(id), T, null);
      if (r || id) return r;
      return localHome();
    },
    saveDesign: (d) => withTimeout(real.saveDesign(d), T, false),
    setMess: (o, m) => withTimeout(real.setMess(o, m), T, false),
    joinParty: async (host, opts) => {
      const bots = opts?.botsIfAlone ?? 3;
      // offline conhecido: festa com robôs NA HORA, sem esperar a rede
      if (netState() === 'offline') return new MockParty(host, bots);
      const p = real.joinParty(host, opts).catch(() => null);
      const s = await withTimeout(p, 4500, null);
      if (s) return s;
      void p.then((late) => late?.leave()); // chegou atrasada: descarta
      return new MockParty(host, bots);
    },
  };
}

/* ---------------- cache local ---------------- */
const CK = 'bw-home-cache-v1';
export function cacheHome(d: HomeDesign, mess: MessItem[]): void {
  try {
    localStorage.setItem(CK, JSON.stringify({ d, mess, at: Date.now() }));
  } catch {
    /* */
  }
}
export function localHome(): HomeState | null {
  let best: HomeState | null = null;
  try {
    const j = JSON.parse(localStorage.getItem(CK) || 'null');
    if (j?.d) best = { ownerId: 'me', design: normalizeDesign(j.d), mess: j.mess || [], updatedAt: j.at || 0 };
  } catch {
    /* */
  }
  // cache do serviço online (casa baixada do servidor em outra sessão)
  try {
    const o = JSON.parse(localStorage.getItem('bloop-home-v1') || 'null');
    const h = o?.home as HomeState | null;
    if (h?.design && (!best || (h.updatedAt || 0) > (best.updatedAt || 0))) best = { ...h, design: normalizeDesign(h.design), mess: h.mess || [] };
  } catch {
    /* */
  }
  return best;
}
function finishState(st: HomeState | null): HomeState {
  const design = normalizeDesign(st?.design ?? starterDesign());
  if (st?.design?.access) design.access = st.design.access;
  if (st?.design?.paint) design.paint = st.design.paint;
  return { ownerId: st?.ownerId ?? 'me', design, mess: st?.mess ?? [], updatedAt: st?.updatedAt ?? Date.now() };
}
/** Minha casa SEM rede: cache local (ou a casa inicial). Síncrono — a tela abre na hora. */
export function loadMyHomeLocal(): HomeState {
  return finishState(localHome());
}
/** Compatibilidade: igual a loadMyHomeLocal (não espera rede). */
export async function loadMyHome(): Promise<HomeState> {
  return loadMyHomeLocal();
}
/**
 * Em segundo plano: versão do servidor da minha casa, só se for MAIS NOVA que a local.
 * null = offline / sem novidade.
 */
export async function fetchMyHomeNewer(localAt: number): Promise<HomeState | null> {
  try {
    const api = await getApi();
    if (usingMock) return null;
    const st = await withTimeout(api.getHome(), 9000, null);
    if (!st?.design || (st.updatedAt || 0) <= localAt) return null;
    return finishState(st);
  } catch {
    return null;
  }
}

/* ---------------- posse de peças / medalhas ---------------- */
const OK = 'bw-home-own-v1';
interface Own {
  own: string[];
  helper: number; // medalha "Amigo Ajudante": casas que você ajudou a limpar
  cleaned: number;
  parties: number;
  lastDirtyPenalty: number;
}
let O: Own = { own: [], helper: 0, cleaned: 0, parties: 0, lastDirtyPenalty: 0 };
try {
  O = { ...O, ...JSON.parse(localStorage.getItem(OK) || '{}') };
} catch {
  /* */
}
const saveOwn = () => {
  try {
    localStorage.setItem(OK, JSON.stringify(O));
  } catch {
    /* */
  }
};
const ownSet = new Set(O.own);
export const owns = (key: string): boolean => ownSet.has(key);
export function grant(key: string): void {
  if (ownSet.has(key)) return;
  ownSet.add(key);
  O.own = [...ownSet];
  saveOwn();
}
export const stats = (): Readonly<Own> => O;
export function bump(k: 'helper' | 'cleaned' | 'parties', n = 1): number {
  O[k] += n;
  saveOwn();
  return O[k];
}
export function markDirtyPenalty(now: number): boolean {
  if (now - O.lastDirtyPenalty < 20 * 3600_000) return false;
  O.lastDirtyPenalty = now;
  saveOwn();
  return true;
}

/* ---------------- permissões ---------------- */
export const DEFAULT_ACCESS: HomeAccess = { visits: 'friends', defaultRole: 'clean', roles: {} };
export function roleFor(design: HomeDesign, friendId: string, isOwner: boolean): HomeRole {
  if (isOwner) return 'build';
  const a = design.access ?? DEFAULT_ACCESS;
  return a.roles[friendId] ?? a.defaultRole;
}
const RANK: Record<HomeRole, number> = { view: 0, clean: 1, decorate: 2, build: 3 };
export const can = (role: HomeRole, need: HomeRole): boolean => RANK[role] >= RANK[need];

/* ---------------- eventos locais extras da festa ---------------- */
/** Mudança de design enviada por quem tem permissão (o servidor valida o papel). */
export interface DesignEvent {
  t: 'design';
  by: string;
  room: string;
  items?: HomeDesign['rooms'][number]['items'];
  paint?: { wall: string; strokes?: string };
}
export function sendDesign(s: PartySession, e: DesignEvent): void {
  s.event(e as unknown as PartyEvent);
}

/* ---------------- 3D (outro agente) ---------------- */
const mods3d = import.meta.glob('../home3d/index.ts');
export const has3D = (): boolean => !!mods3d['../home3d/index.ts'];
/**
 * Abre o 3D. Resultado: 'ok' (abriu e fechou normalmente), 'none' (sem módulo / falhou ao carregar o
 * chunk), ou o motivo do fechamento ('webgl' | 'error' | 'timeout' | 'declined').
 * Nunca lança e nunca deixa uma tela presa: o carregamento do chunk tem prazo.
 */
export async function open3D(opts: Record<string, unknown>): Promise<string> {
  const l = mods3d['../home3d/index.ts'];
  if (!l) return 'none';
  try {
    const m = (await withTimeout(l() as Promise<{ open3D?: (o: Record<string, unknown>) => Promise<{ reason?: string }> }>, 15000, null)) ?? null;
    if (!m?.open3D) return 'none';
    const r = await m.open3D(opts);
    return r?.reason === 'exit' || !r?.reason ? 'ok' : r.reason;
  } catch {
    return 'none';
  }
}
