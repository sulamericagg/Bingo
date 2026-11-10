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

const KEY = 'bw-fr-seen';
const POLL_MS = 40_000;

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
export async function checkFriends(): Promise<void> {
  if (busy || document.hidden) return;
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
    notify(t('fr.n.req', '@{h} quer ser seu amigo!', { h: r.from.handle || r.from.name }), { icon: 'heart', kind: 'good', key: 'fr-req-' + k });
  }
  for (const i of invites) {
    const k = invKey(i);
    if (seen.inv.includes(k)) continue;
    seen.inv.push(k);
    void import('./friends-ui').then((u) => notify(u.inviteText(i), { icon: 'party', kind: 'good', ms: 4500, key: 'fr-inv-' + k }));
  }
  save();
  const on = new Set(friends.filter((f) => f.online).map((f) => f.id));
  if (wasOnline) {
    const fresh = friends.filter((f) => on.has(f.id) && !wasOnline!.has(f.id)).slice(0, 2);
    for (const f of fresh) notify(t('fr.n.online', '@{h} ficou online', { h: f.handle || f.name }), { icon: 'user', key: 'fr-on-' + f.id });
  }
  wasOnline = on;
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
    }, POLL_MS);
  };
  setTimeout(() => void checkFriends().then(loop), 5000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void checkFriends();
  });
  bus.on('app-resume', () => void checkFriends());
}
