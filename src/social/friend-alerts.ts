/**
 * Avisos de AMIGOS no app (sem servidor de push): enquanto o app está aberto e visível, a cada ~40 s
 * lê GET /api/friends (o mesmo que marca você "online") e:
 *   - pedido de amizade novo  → aviso pequeno (ui/notify) + badge no botão Social
 *   - convite novo (festa/casa/jogo) → aviso + badge (e Notificação local se o app estiver em 2º plano)
 *   - amigo ficou online → aviso discreto
 * O que já foi avisado fica em localStorage 'bw-fr-seen' (não repete depois de reabrir).
 */
import { bus } from '../core/events';
import { t } from '../i18n';
import { notify } from '../ui/notify';
import type { FriendInvite, FriendRequest, FriendInfo } from '../home/api';
import { isNative } from '../core/platform';
import { pushNotif } from '../party/bell';
import { wsUrl } from './net';

const KEY = 'bw-fr-seen';
const POLL_MS = 40_000;
/** com a conexão em tempo real aberta, a consulta é só uma garantia */
const POLL_LIVE_MS = 120_000;

interface Seen {
  req: string[];
  inv: string[];
}
function load(): Seen {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (o && Array.isArray(o.req) && Array.isArray(o.inv)) return o;
  } catch {
    /* */
  }
  return { req: [], inv: [] };
}
const seen = load();
function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ req: seen.req.slice(-80), inv: seen.inv.slice(-80) }));
  } catch {
    /* */
  }
}

let badge = 0;
/** Pedidos + convites pendentes (badge do botão Social). */
export const friendBadge = (): number => badge;

const reqKey = (r: FriendRequest) => r.from.id + ':' + r.at;
const invKey = (i: FriendInvite) => i.from.id + ':' + i.at;

let wasOnline: Set<string> | null = null;
let timer = 0;
let busy = false;

type HomeMod = typeof import('../services/home');
let mod: Promise<HomeMod> | null = null;
const homeMod = (): Promise<HomeMod> => (mod ??= import('../services/home'));

async function setBadge(n: number): Promise<void> {
  if (n === badge) return;
  badge = n;
  bus.emit('friend-badge', n);
  try {
    (await import('../hub/hub')).refreshNavBadges();
  } catch {
    /* hub ainda não montado */
  }
}

/** Uma checagem agora (também chamada ao voltar para o app). */
export async function checkFriends(force = false): Promise<void> {
  if (busy || (document.hidden && !force)) return;
  busy = true;
  try {
    const m = await homeMod();
    if (!(await m.refreshFriendsNow())) return;
    const { requests, invites, friends } = m.cachedSocial();
    apply(requests, invites, friends);
  } catch {
    /* offline */
  } finally {
    busy = false;
  }
}

function apply(requests: FriendRequest[], invites: FriendInvite[], friends: FriendInfo[]): void {
  void setBadge(requests.length + invites.length);
  for (const r of requests) {
    const k = reqKey(r);
    if (seen.req.includes(k)) continue;
    seen.req.push(k);
    const text = t('fr.n.req', '@{h} quer ser seu amigo!', { h: r.from.handle || r.from.name });
    notify(text, { icon: 'heart', kind: 'good', key: 'fr-req-' + k });
    pushNotif({ id: 'req-' + k, kind: 'request', text });
    if (document.hidden) void localNotif(text);
  }
  for (const i of invites) {
    const k = invKey(i);
    if (seen.inv.includes(k)) continue;
    seen.inv.push(k);
    void import('./friends-ui').then((u) => {
      const text = u.inviteText(i);
      notify(text, { icon: 'party', kind: 'good', ms: 4500, key: 'fr-inv-' + k });
      pushNotif({ id: 'inv-' + k, kind: i.kind === 'squad' ? 'squad' : 'invite', text, invite: i });
      // app em 2º plano mas a conexão ainda viva: notificação do sistema (sem servidor de push)
      if (document.hidden) void localNotif(text);
    });
  }
  save();
  const on = new Set(friends.filter((f) => f.online).map((f) => f.id));
  if (wasOnline) {
    const fresh = friends.filter((f) => on.has(f.id) && !wasOnline!.has(f.id)).slice(0, 2);
    for (const f of fresh) {
      const text = t('fr.n.online', '@{h} ficou online', { h: f.handle || f.name });
      notify(text, { icon: 'user', key: 'fr-on-' + f.id });
      pushNotif({ id: 'on-' + f.id + ':' + Math.floor(Date.now() / 600_000), kind: 'online', text });
    }
  }
  wasOnline = on;
}

/* ---------- notificação do sistema (Android) só enquanto a conexão ainda está viva ---------- */
let lnN = 0;
async function localNotif(body: string): Promise<void> {
  if (!isNative) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') return; // não pede permissão do nada; a Casa do bichinho pede com explicação
    await LocalNotifications.schedule({ notifications: [{ id: 7300 + (lnN++ % 90), title: 'Bloop World', body, smallIcon: 'ic_stat_bloop' }] });
  } catch {
    /* */
  }
}

/* ---------- tempo real: /api/friends/live manda {t:'ping'} quando chega pedido/convite ---------- */
let live: WebSocket | null = null;
let liveRetry = 0;
let liveHb = 0;
async function connectLive(): Promise<void> {
  if (live) return;
  const { me } = await import('./net');
  const p = await me().catch(() => null);
  if (!p?.id || live) return;
  let ws: WebSocket;
  try {
    ws = new WebSocket(wsUrl('/friends/live?id=' + encodeURIComponent(p.id)));
  } catch {
    return;
  }
  live = ws;
  ws.onopen = () => {
    liveRetry = 0;
    clearInterval(liveHb);
    liveHb = window.setInterval(() => ws.readyState === 1 && ws.send('hb'), 60_000);
  };
  ws.onmessage = () => void checkFriends(true);
  ws.onclose = () => {
    if (live === ws) live = null;
    clearInterval(liveHb);
    if (!document.hidden) setTimeout(() => void connectLive(), Math.min(60_000, 3000 * 2 ** liveRetry++));
  };
}

let started = false;
/** Liga os avisos (chamado pelo registerSocial). */
export function startFriendAlerts(): void {
  if (started) return;
  started = true;
  const loop = () => {
    clearTimeout(timer);
    timer = window.setTimeout(async () => {
      await checkFriends();
      loop();
    }, live?.readyState === 1 ? POLL_LIVE_MS : POLL_MS);
  };
  setTimeout(() => void connectLive(), 6000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void connectLive();
  });
  setTimeout(() => void checkFriends().then(loop), 5000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void checkFriends();
  });
  bus.on('app-resume', () => void checkFriends());
}
