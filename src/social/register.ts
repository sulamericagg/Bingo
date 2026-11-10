/**
 * Ponto de entrada do SOCIAL. O lead chama registerSocial() uma vez (main.ts).
 * Registra os painéis do hub e liga os ouvintes leves; a UI é carregada sob demanda.
 *
 * API pública (para outros módulos):
 *   registerSocial()                          — painéis 'social' (navOrder 4) e 'campeonatos' (navOrder 3)
 *   openSocial(tab?)                          — abre Chat/Amigos/Ajustes
 *   openChampionshipsPanel()                  — abre Campeonatos
 *   openPlayerProfile(id?, {name, skin}?)     — cartão de perfil (ex.: do ranking)
 *   addFichas(n) / getFichas()                — Fichas de Campeonato (de ./store; NÃO compráveis)
 *   drawEmoteBubble / openEmoteWheel          — de ./emotes
 *   joinPresence                              — de ../services/presence
 */
import { bus } from '../core/events';
import { registerPanel, type RunReport } from '../hub/registry';
import { t } from '../i18n';
import { api } from './net';
import { installChampionshipListener } from './champ-context';
import { dailyFicha, persistSocial, social } from './store';
import { getPlayer } from '../services/online';
import { friendBadge, startFriendAlerts } from './friend-alerts';

export { addFichas, getFichas } from './store';

let champBadge = 0;

export function openSocial(tab: 'chat' | 'friends' | 'settings' = 'chat', prefillHandle?: string): void {
  const go = () => import('./chat-ui').then((m) => m.openSocialPanel(tab));
  if (prefillHandle) import('./friends-ui').then((f) => f.setFriendPrefill(prefillHandle)).then(go);
  else go();
}

/** Link/QR do @ de alguém: ?amigo=<handle> (web) ou bloopworld://amigo/<handle> e https://…/?amigo= (app). */
export function handleFromLink(url: string): string | null {
  try {
    const u = new URL(url);
    const raw = u.searchParams.get('amigo') ?? new URLSearchParams(u.hash.replace(/^#/, '')).get('amigo') ?? (u.protocol === 'bloopworld:' ? (u.host === 'amigo' ? u.pathname.slice(1) : null) : null);
    const h = (raw ?? '').trim().replace(/^@+/, '').toLowerCase();
    return /^[a-z0-9_.]{3,16}$/.test(h) ? h : null;
  } catch {
    return null;
  }
}

/** Abre Amigos com o @ do link preenchido (chamado no boot, depois do onboarding, e quando o app abre por link). */
export function openFriendLink(url: string): boolean {
  const h = handleFromLink(url);
  if (!h) return false;
  openSocial('friends', h);
  if (url === location.href) {
    // tira o ?amigo= da barra (recarregar não reabre)
    const u = new URL(location.href);
    u.searchParams.delete('amigo');
    history.replaceState(null, '', u.pathname + u.search + u.hash);
  }
  return true;
}
export function openChampionshipsPanel(): void {
  import('./champ-ui').then((m) => m.openChampionships());
}
export function openPlayerProfile(id?: string, fallback?: { name: string; skin: string }): void {
  import('./profile').then((m) => m.openProfile(id, fallback));
}

/** Quantos campeonatos pedem atenção (rodada para jogar ou prêmio/fichas para resgatar). */
async function refreshChampBadge(): Promise<void> {
  const pid = getPlayer()?.id;
  if (!pid) return;
  try {
    const r = await api<{ items: { me: { canPlay?: boolean; refund?: boolean; claimed?: boolean; prize?: number; attempts?: number } }[] }>('/champ/list?me=' + encodeURIComponent(pid));
    champBadge = r.items.filter((c) => (c.me.canPlay && (c.me.attempts ?? 0) === 0) || ((c.me.refund || (c.me.prize ?? 0) > 0) && !c.me.claimed)).length;
    bus.emit('hub-registry');
  } catch {
    /* offline */
  }
}

let done = false;
export function registerSocial(): void {
  if (done) return;
  done = true;
  registerPanel({
    id: 'campeonatos',
    get label() {
      return t('nav.champ', 'Campeonatos');
    },
    icon: 'trophy',
    navOrder: 60,
    open: openChampionshipsPanel,
    badge: () => champBadge,
  });
  registerPanel({
    id: 'social',
    get label() {
      return t('nav.social', 'Social');
    },
    icon: 'user',
    navOrder: 50,
    // pedido de amizade/convite pendente: abre direto em Amigos
    open: () => openSocial(friendBadge() > 0 ? 'friends' : 'chat'),
    badge: () => friendBadge(),
  });
  startFriendAlerts();
  dailyFicha();
  installChampionshipListener();
  // recordes por jogo (perfil)
  bus.on('run-end', (r: RunReport) => {
    if (!r?.game || !(r.score > 0)) return;
    if ((social.bests[r.game] ?? 0) < r.score) {
      social.bests[r.game] = Math.floor(r.score);
      persistSocial();
    }
  });
  // badge e perfil em segundo plano, sem atrasar a abertura
  setTimeout(() => {
    refreshChampBadge();
    import('./profile').then((m) => m.pushProfile());
  }, 4000);
  setInterval(refreshChampBadge, 5 * 60_000);
  bus.on('champ-score', refreshChampBadge);
}
