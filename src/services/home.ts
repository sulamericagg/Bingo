/**
 * Implementação do contrato src/home/api.ts (HomeApi) — @nomes, amizades, casas e festas.
 *
 * - Nunca lança erro: falha de rede vira 'network' / false / null (o jogo segue offline).
 * - Cache local em localStorage 'bloop-home-v1': meu @nome, minha casa (getHome() sem id funciona
 *   offline), últimos amigos/pedidos. saveDesign() grava no cache NA HORA e tenta o servidor;
 *   se falhar, fica pendente e é reenviado na próxima chamada com rede.
 * - Amigos do servidor substituem a lista local antiga do social ('bloop-social-v1'): na 1ª
 *   sincronização, quem estava na lista local recebe um pedido (vale se jogaram juntos nos
 *   últimos 7 dias; senão, adicione pelo @nome).
 * - Festa: WebSocket /api/party/<hostId>. Recusado/offline → sessão local (online=false).
 *   botsIfAlone: bots LOCAIS (bot:true) passeiam pela casa quando não há outro humano.
 */
import { ONLINE } from '../config';
import type {
  FriendInfo,
  FriendRequest,
  HandleCheck,
  HomeApi,
  HomeDesign,
  HomeState,
  MessItem,
  PartyEvent,
  PartyPeer,
  PartySession,
} from '../home/api';
import { SKINS } from '../game/skins';
import { apiBase, me, wsUrl } from '../social/net';
import { persistSocial, social } from '../social/store';

const KEY = 'bloop-home-v1';
const ID_RE = /^[A-Za-z0-9-]{8,64}$/;

interface Cache {
  handle: string | null;
  home: HomeState | null;
  pendingDesign: HomeDesign | null;
  friends: FriendInfo[];
  requests: FriendRequest[];
  migrated: boolean;
}

function load(): Cache {
  const d: Cache = { handle: null, home: null, pendingDesign: null, friends: [], requests: [], migrated: false };
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (o && typeof o === 'object') return { ...d, ...o };
  } catch {
    /* */
  }
  return d;
}
const cache: Cache = load();
function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* cheio/privado */
  }
}

/* ---------------- rede ---------------- */

type Res<T> = { ok: true; status: number; data: T } | { ok: false; status: number; data: any };

/* Estado da rede da Casa: 'down' depois de uma falha (sem internet, timeout, servidor que não
 * responde JSON — ex.: backend ainda não publicado). Enquanto 'down', novas chamadas falham NA HORA
 * por 15 s (sem esperar o timeout de novo) — a interface nunca fica presa esperando a rede. */
export type HomeNet = 'unknown' | 'ok' | 'down';
let net: HomeNet = 'unknown';
let downAt = 0;
const netCbs = new Set<(s: HomeNet) => void>();
function setNet(s: HomeNet): void {
  if (s === 'down') downAt = Date.now();
  if (s === net) return;
  net = s;
  for (const cb of netCbs) {
    try {
      cb(s);
    } catch {
      /* */
    }
  }
}
export function homeNet(): HomeNet {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'down';
  return net;
}
export function onHomeNet(cb: (s: HomeNet) => void): () => void {
  netCbs.add(cb);
  return () => netCbs.delete(cb);
}

async function req<T>(method: string, path: string, body?: unknown, force = false): Promise<Res<T> | null> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return setNet('down'), null;
  if (!force && net === 'down' && Date.now() - downAt < 15_000) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.min(ONLINE.timeoutMs, 6000));
  try {
    const res = await fetch(`${apiBase()}/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    let data: any = null;
    let json = false;
    try {
      data = await res.json();
      json = data !== null && typeof data === 'object';
    } catch {
      /* */
    }
    // sem JSON (página de erro / 404 do provedor / index.html) = servidor indisponível, não "inválido"
    if (!json || res.status >= 500) {
      setNet('down');
      return null;
    }
    setNet('ok');
    return res.ok ? { ok: true, status: res.status, data: data as T } : { ok: false, status: res.status, data };
  } catch {
    setNet('down');
    return null; // sem rede / timeout
  } finally {
    clearTimeout(timer);
  }
}

async function myId(): Promise<string> {
  try {
    return (await me()).id;
  } catch {
    return '';
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------------- @nome ---------------- */

const norm = (h: string) => h.trim().replace(/^@+/, '').toLowerCase();

async function checkHandle(handle: string): Promise<HandleCheck> {
  const id = await myId();
  const r = await req<HandleCheck>('GET', `/handle/check?h=${encodeURIComponent(norm(handle))}${id ? '&id=' + id : ''}`);
  if (!r) return { ok: false, reason: 'network' };
  return r.ok ? r.data : { ok: false, reason: 'invalid' };
}

async function claimHandle(handle: string): Promise<HandleCheck> {
  const id = await myId();
  if (!id) return { ok: false, reason: 'network' };
  const r = await req<HandleCheck & { handle?: string }>('POST', '/handle/claim', { id, handle: norm(handle) });
  if (!r) return { ok: false, reason: 'network' };
  if (!r.ok) return { ok: false, reason: 'invalid' };
  if (r.data.ok && r.data.handle) {
    cache.handle = r.data.handle;
    persist();
  }
  return r.data;
}

/** Recupera o @nome do servidor (ex.: app reinstalado com o mesmo id). */
async function refreshHandle(): Promise<void> {
  const id = await myId();
  if (!id) return;
  const r = await req<{ handle: string | null }>('GET', '/handle/mine?id=' + id);
  if (r?.ok && cache.handle !== r.data.handle) {
    cache.handle = r.data.handle;
    persist();
  }
}

async function searchPlayer(handle: string): Promise<FriendInfo | null> {
  const r = await req<FriendInfo>('GET', '/player/by-handle?h=' + encodeURIComponent(norm(handle)));
  return r?.ok ? r.data : null;
}

/* ---------------- amizades ---------------- */

let lastFetch: { at: number; p: Promise<boolean> } | null = null;

/** Busca amigos + pedidos (1 chamada para os dois; reaproveita por 3 s). */
function fetchFriends(): Promise<boolean> {
  if (lastFetch && Date.now() - lastFetch.at < 3000) return lastFetch.p;
  const p = (async () => {
    const id = await myId();
    if (!id) return false;
    const r = await req<{ friends: FriendInfo[]; requests: FriendRequest[] }>('GET', '/friends?id=' + id);
    if (!r?.ok) return false;
    cache.friends = r.data.friends ?? [];
    cache.requests = r.data.requests ?? [];
    persist();
    await migrateLocalFriends(id);
    syncSocial();
    return true;
  })().catch(() => false);
  lastFetch = { at: Date.now(), p };
  return p;
}

/** Espelha a lista do servidor no social (perfil/aba Amigos usam social.friends). */
function syncSocial(): void {
  social.friends = cache.friends.map((f) => ({ id: f.id, name: f.name, skin: f.skin }));
  persistSocial();
}

/** 1x: amigos da lista local antiga viram pedidos no servidor (quando permitido). */
async function migrateLocalFriends(id: string): Promise<void> {
  if (cache.migrated) return;
  cache.migrated = true;
  persist();
  const known = new Set(cache.friends.map((f) => f.id));
  for (const f of social.friends.slice(0, 20)) if (!known.has(f.id) && f.id !== id) await req('POST', '/friends/request', { id, to: f.id });
}

async function friends(): Promise<FriendInfo[]> {
  await fetchFriends();
  return cache.friends;
}
async function requests(): Promise<FriendRequest[]> {
  await fetchFriends();
  return cache.requests;
}

async function addFriend(handleOrId: string): Promise<'sent' | 'already' | 'not_found' | 'limit' | 'network'> {
  const id = await myId();
  if (!id) return 'network';
  const raw = handleOrId.trim();
  const byId = !raw.startsWith('@') && raw.includes('-') && ID_RE.test(raw);
  const r = await req<{ result: string }>('POST', '/friends/request', byId ? { id, to: raw } : { id, handle: norm(raw) });
  if (!r) return 'network';
  lastFetch = null;
  const res = r.ok ? r.data.result : 'not_found';
  if (res === 'accepted') {
    await fetchFriends();
    return 'already';
  }
  if (res === 'sent' || res === 'already' || res === 'limit') return res;
  return 'not_found'; // not_found | not_met (ids só de quem jogou junto)
}

async function respond(fromId: string, accept: boolean): Promise<boolean> {
  const id = await myId();
  const r = id ? await req<{ ok: boolean }>('POST', '/friends/respond', { id, from: fromId, accept }) : null;
  if (!r?.ok || !r.data.ok) return false;
  cache.requests = cache.requests.filter((x) => x.from.id !== fromId);
  lastFetch = null;
  if (accept) await fetchFriends();
  else persist();
  return true;
}

async function removeFriend(fid: string): Promise<boolean> {
  const id = await myId();
  const r = id ? await req<{ ok: boolean }>('POST', '/friends/remove', { id, friend: fid }) : null;
  if (!r?.ok) return false;
  cache.friends = cache.friends.filter((f) => f.id !== fid);
  persist();
  syncSocial();
  lastFetch = null;
  return true;
}

async function blockPlayer(target: string, on: boolean): Promise<boolean> {
  const id = await myId();
  const r = id ? await req<{ ok: boolean }>('POST', '/friends/block', { id, target, on }) : null;
  if (!r?.ok) return false;
  if (on) {
    cache.friends = cache.friends.filter((f) => f.id !== target);
    cache.requests = cache.requests.filter((x) => x.from.id !== target);
    persist();
    syncSocial();
  }
  lastFetch = null;
  return true;
}

/* ---------------- casas ---------------- */

const live = new Map<string, PartyImpl>();

async function getHome(ownerId?: string): Promise<HomeState | null> {
  const id = await myId();
  const owner = ownerId || id;
  if (!owner) return cache.home;
  const mine = owner === id;
  if (mine) await flushPending(id);
  const r = await req<HomeState>('GET', `/home/${owner}?id=${id || owner}`);
  let st: HomeState | null = r?.ok ? r.data : null;
  if (mine) {
    if (st && !cache.pendingDesign) {
      cache.home = st;
      persist();
    } else st = cache.home; // offline, 404 (ainda não salva) ou design pendente
  }
  const p = live.get(owner);
  if (st && p?.online) st = { ...st, mess: p.messNow() };
  return st;
}

async function putDesign(body: Record<string, unknown>, force = false): Promise<boolean> {
  for (let tries = 0; tries < 2; tries++) {
    const r = await req<{ ok: boolean }>('PUT', '/home/design', body, force);
    if (!r) return false;
    if (r.ok) return true;
    if (r.status !== 429) return false;
    await sleep(3200); // o servidor aceita 1 gravação a cada 3 s por casa
  }
  return false;
}

async function flushPending(id: string): Promise<void> {
  if (!cache.pendingDesign || !id) return;
  const d = cache.pendingDesign;
  if (await putDesign({ id, design: d }, true)) {
    if (cache.pendingDesign === d) cache.pendingDesign = null;
    persist();
  }
}

async function saveDesign(design: HomeDesign): Promise<boolean> {
  // grava no aparelho ANTES de qualquer rede (otimista); o envio fica na fila se falhar
  cache.home = { ownerId: cache.home?.ownerId ?? '', mess: cache.home?.mess ?? [], ...(cache.home ?? {}), design, updatedAt: Date.now() } as HomeState;
  cache.pendingDesign = design;
  persist();
  const id = await myId();
  if (id && cache.home.ownerId !== id) (cache.home.ownerId = id), persist();
  if (!id) return false;
  const ok = await putDesign({ id, design });
  if (ok && cache.pendingDesign === design) {
    cache.pendingDesign = null;
    persist();
  }
  return ok;
}

async function saveFriendDesign(ownerId: string, design: HomeDesign): Promise<boolean> {
  const id = await myId();
  return !!id && putDesign({ id, ownerId, design });
}

/** Liga/desliga visitas com o dono offline (extra; o mesmo vale via design.access.visits). */
export async function setVisitsOpen(on: boolean): Promise<boolean> {
  const id = await myId();
  if (!id) return false;
  if (cache.home) (cache.home.visitsOpen = on), persist();
  return putDesign({ id, visitsOpen: on });
}

async function setMess(ownerId: string, mess: MessItem[]): Promise<boolean> {
  const id = await myId();
  if (ownerId === id && cache.home) {
    cache.home = { ...cache.home, mess: mess.slice(0, 300) };
    persist();
  }
  if (!id) return false;
  const r = await req<{ ok: boolean }>('PUT', '/home/mess', { id, ownerId, mess: mess.slice(0, 300) });
  return !!r?.ok;
}

/* ---------------- festa ---------------- */

const BOT_NAMES = ['Pipo', 'Luli', 'Zuzu', 'Miko', 'Tata', 'Kiki', 'Nino', 'Fefe'];
const BOT_SKINS = SKINS.filter((s) => s.id !== 'custom').map((s) => s.id);

class PartyImpl implements PartySession {
  online = false;
  reason?: string;
  private ws: WebSocket | null = null;
  private peers = new Map<string, PartyPeer>();
  private bots: PartyPeer[] = [];
  private peerCbs: ((p: PartyPeer[]) => void)[] = [];
  private evCbs: ((e: PartyEvent) => void)[] = [];
  private lastSend = 0;
  private pending: Partial<PartyPeer> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private botTimer: ReturnType<typeof setInterval> | null = null;
  private mess: MessItem[] = [];
  private me = '';
  private left = false;

  constructor(
    readonly hostId: string,
    private botsIfAlone: number,
  ) {}

  seedMess(m: MessItem[]): void {
    this.mess = m.slice();
  }
  messNow(): MessItem[] {
    return this.mess.slice();
  }

  async connect(): Promise<void> {
    const who = homeNet() === 'down' ? null : await me().catch(() => null);
    if (!who?.id) {
      this.reason = 'network';
      return this.updateBots();
    }
    this.me = who.id;
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (!done) (done = true), resolve();
      };
      setTimeout(() => {
        if (!this.online) this.reason ??= 'network';
        finish();
      }, 3500);
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl('/party/' + this.hostId));
      } catch {
        this.reason = 'network';
        return finish();
      }
      this.ws = ws;
      ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', id: who.id, name: who.name, handle: cache.handle ?? '', skin: who.skin, ...(who.avatar ? { avatar: who.avatar } : {}) }));
      ws.onmessage = (ev) => {
        let m: any;
        try {
          m = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (m.type === 'welcome') {
          this.online = true;
          this.mess = Array.isArray(m.mess) ? m.mess : [];
          for (const p of m.peers ?? []) this.peers.set(p.id, p);
          finish();
          this.changed();
        } else if (m.type === 'reject') {
          this.reason = String(m.reason ?? 'closed');
          this.online = false;
          finish();
          this.changed();
        } else this.onMsg(m);
      };
      ws.onclose = () => {
        this.ws = null;
        if (this.online) this.reason = 'network';
        this.online = false;
        this.peers.clear();
        finish();
        if (!this.left) this.changed();
      };
      ws.onerror = () => {};
    });
    this.updateBots();
  }

  private onMsg(m: any): void {
    if (m.type === 'join' && m.p?.id) this.peers.set(m.p.id, m.p);
    else if (m.type === 'leave') this.peers.delete(m.id);
    else if (m.type === 's') {
      const p = this.peers.get(m.id);
      if (p) Object.assign(p, m.s);
    } else if (m.type === 'ev' && m.e) {
      this.track(m.e);
      for (const cb of this.evCbs) cb(m.e);
      return;
    } else return;
    this.changed();
  }

  private track(e: PartyEvent): void {
    if (e.t === 'splat' && !this.mess.some((x) => x.id === e.mess.id)) this.mess.push(e.mess);
    else if (e.t === 'clean') this.mess = this.mess.filter((x) => x.id !== e.messId);
  }

  private changed(): void {
    this.updateBots();
    const list = [...this.peers.values(), ...this.bots];
    for (const cb of this.peerCbs) cb(list);
  }

  /** Bots locais quando não há outro humano (o servidor não simula bots). */
  private updateBots(): void {
    const alone = this.peers.size === 0 && !this.left;
    if (alone && this.botsIfAlone > 0 && !this.bots.length) {
      const n = Math.min(7, this.botsIfAlone);
      this.bots = Array.from({ length: n }, (_, i) => ({
        id: 'bot-' + i,
        name: BOT_NAMES[i % BOT_NAMES.length],
        handle: '',
        skin: BOT_SKINS[(i * 7) % BOT_SKINS.length] ?? 'bloop',
        // chão do cômodo 2D (parede até y=230): antes nasciam/andavam em y 0..300, dentro da parede
        x: 100 + Math.random() * 160,
        y: 280 + Math.random() * 110,
        room: '',
        bot: true,
      }));
      this.botTimer = setInterval(() => {
        for (const b of this.bots) {
          b.x = Math.max(30, Math.min(330, b.x + (Math.random() - 0.5) * 30));
          b.y = Math.max(262, Math.min(410, b.y + (Math.random() - 0.5) * 30));
          b.emote = Math.random() < 0.03 ? ['oi', 'festa', 'yum', 'rindo'][Math.floor(Math.random() * 4)] : undefined;
        }
        const list = [...this.peers.values(), ...this.bots];
        for (const cb of this.peerCbs) cb(list);
      }, 250);
    } else if (!alone && this.bots.length) {
      this.bots = [];
      if (this.botTimer) clearInterval(this.botTimer);
      this.botTimer = null;
    }
  }

  send(state: Partial<PartyPeer>): void {
    this.pending = { ...(this.pending ?? {}), ...state };
    const wait = 125 - (Date.now() - this.lastSend);
    if (wait > 0) {
      this.timer ??= setTimeout(() => {
        this.timer = null;
        this.send({});
      }, wait);
      return;
    }
    const s = this.pending;
    this.pending = null;
    this.lastSend = Date.now();
    if (this.ws && this.online) this.ws.send(JSON.stringify({ type: 's', s: { x: s.x, y: s.y, room: s.room, holding: s.holding ?? '', emote: s.emote } }));
  }

  event(e: PartyEvent): void {
    this.track(e);
    if (this.ws && this.online) this.ws.send(JSON.stringify({ type: 'ev', e }));
    else if (e.t === 'splat' || e.t === 'clean') {
      // offline: sujeira/limpeza da MINHA casa vai para o cache local
      if (this.hostId === this.me && cache.home) (cache.home.mess = this.messNow()), persist();
    }
  }

  onPeers(cb: (peers: PartyPeer[]) => void): void {
    this.peerCbs.push(cb);
    cb([...this.peers.values(), ...this.bots]);
  }
  onEvent(cb: (e: PartyEvent) => void): void {
    this.evCbs.push(cb);
  }

  leave(): void {
    this.left = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.botTimer) clearInterval(this.botTimer);
    this.bots = [];
    try {
      this.ws?.close(1000, 'bye');
    } catch {
      /* */
    }
    this.ws = null;
    this.online = false;
    if (live.get(this.hostId) === this) live.delete(this.hostId);
  }
}

async function joinParty(hostId: string, opts: { botsIfAlone?: number } = {}): Promise<PartySession> {
  live.get(hostId)?.leave();
  const p = new PartyImpl(hostId, Math.max(0, Math.floor(opts.botsIfAlone ?? 0)));
  live.set(hostId, p);
  try {
    if (hostId === (await myId()) && cache.home) p.seedMess(cache.home.mess);
    await p.connect();
  } catch {
    /* sessão offline */
  }
  return p;
}

/* ---------------- export ---------------- */

export const homeApi: HomeApi = {
  checkHandle,
  claimHandle,
  myHandle: () => cache.handle,
  searchPlayer,
  friends,
  requests,
  addFriend,
  respond,
  removeFriend,
  getHome,
  saveDesign,
  setMess,
  joinParty,
  saveFriendDesign,
  blockPlayer,
};
export default homeApi;

/** Há mudanças da casa ainda não enviadas ao servidor (ficam salvas no aparelho). */
export const hasPendingSync = (): boolean => !!cache.pendingDesign;

let syncing = false;
/** Fila de sincronização: reenvia o design pendente quando a rede volta. Nunca lança. */
export async function syncNow(): Promise<void> {
  if (syncing || !cache.pendingDesign) return;
  syncing = true;
  try {
    await flushPending(await myId());
  } catch {
    /* */
  } finally {
    syncing = false;
  }
}

// em segundo plano: recupera o @nome (outro aparelho/reinstalação) e reenvia design pendente
if (typeof window !== 'undefined') {
  setTimeout(() => {
    refreshHandle().catch(() => {});
    void syncNow();
  }, 4000);
  window.addEventListener('online', () => {
    downAt = 0;
    void syncNow();
  });
  setInterval(() => {
    if (cache.pendingDesign) void syncNow();
  }, 30_000);
}
