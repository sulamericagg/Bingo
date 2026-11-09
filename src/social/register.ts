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

export { addFichas, getFichas } from './store';

let champBadge = 0;

export function openSocial(tab: 'chat' | 'friends' | 'settings' = 'chat'): void {
  import('./chat-ui').then((m) => m.openSocialPanel(tab));
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
    label: t('nav.champ', 'Campeonatos'),
    icon: 'trophy',
    navOrder: 60,
    open: openChampionshipsPanel,
    badge: () => champBadge,
  });
  registerPanel({
    id: 'social',
    label: t('nav.social', 'Social'),
    icon: 'user',
    navOrder: 50,
    open: () => openSocial('chat'),
  });
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
