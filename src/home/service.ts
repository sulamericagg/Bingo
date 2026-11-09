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

export function getApi(): Promise<HomeApi> {
  if (apiP) return apiP;
  apiP = (async () => {
    const load = mods['../services/home.ts'];
    if (load && !forceMock()) {
      try {
        const m = (await load()) as { homeApi?: HomeApi };
        if (m.homeApi) return wrap(m.homeApi);
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

/** API real com redes de segurança: festa e casa própria sempre funcionam. */
function wrap(real: HomeApi): HomeApi {
  return {
    ...real,
    checkHandle: (h) => real.checkHandle(h).catch(() => ({ ok: false, reason: 'network' as const })),
    claimHandle: (h) => real.claimHandle(h).catch(() => ({ ok: false, reason: 'network' as const })),
    friends: () => real.friends().catch(() => []),
    requests: () => real.requests().catch(() => []),
    searchPlayer: (h) => real.searchPlayer(h).catch(() => null),
    getHome: async (id) => {
      try {
        const r = await real.getHome(id);
        if (r || id) return r;
      } catch {
        if (id) return null;
      }
      return localHome();
    },
    saveDesign: (d) => real.saveDesign(d).catch(() => false),
    setMess: (o, m) => real.setMess(o, m).catch(() => false),
    joinParty: async (host, opts) => {
      try {
        const s = await real.joinParty(host, opts);
        if (s) return s;
      } catch {
        /* offline */
      }
      return new MockParty(host, opts?.botsIfAlone ?? 3);
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
  try {
    const j = JSON.parse(localStorage.getItem(CK) || 'null');
    if (j) return { ownerId: 'me', design: normalizeDesign(j.d), mess: j.mess || [], updatedAt: j.at };
  } catch {
    /* */
  }
  return null;
}
export async function loadMyHome(): Promise<HomeState> {
  const api = await getApi();
  let st: HomeState | null = null;
  try {
    st = await api.getHome();
  } catch {
    /* */
  }
  st = st ?? localHome();
  const design = normalizeDesign(st?.design ?? starterDesign());
  if (st?.design?.access) design.access = st.design.access;
  if (st?.design?.paint) design.paint = st.design.paint;
  return { ownerId: st?.ownerId ?? 'me', design, mess: st?.mess ?? [], updatedAt: st?.updatedAt ?? Date.now() };
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
export async function open3D(opts: Record<string, unknown>): Promise<boolean> {
  const l = mods3d['../home3d/index.ts'];
  if (!l) return false;
  try {
    const m = (await l()) as { open3D?: (o: Record<string, unknown>) => unknown };
    if (!m.open3D) return false;
    await m.open3D(opts);
    return true;
  } catch {
    return false;
  }
}
