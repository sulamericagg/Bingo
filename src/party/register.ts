/**
 * GRUPO — ponto de entrada (main.ts chama registerParty() uma vez, depois do hub montado).
 *   - reconecta o grupo salvo e leva o grupo junto quando o líder abre um jogo (squad.ts)
 *   - saguão com os Bloops do grupo (lobby.ts) e sino de avisos (bell.ts) no hub
 *   - link/QR do grupo: ?grupo=<id>.<código>
 * Contrato para jogos: ./contract.ts (partyLaunch / partyRoomFor / registerPartyGame) — docs/PARTY.md.
 */
import { bus } from '../core/events';
import { mountBell, type Notif } from './bell';
import { initSquad, joinSquad, squadFromLink } from './squad';

export { partyLaunch, partyRoomFor, registerPartyGame } from './contract';

/** Link/QR de grupo: entra direto (o código do link vale como convite). */
export function openSquadLink(url: string): boolean {
  const g = squadFromLink(url);
  if (!g) return false;
  void joinSquad(g.sid, g.code).then((ok) => {
    if (ok) void import('./panel').then((p) => p.openSquadPanel());
  });
  if (url === location.href) {
    const u = new URL(location.href);
    u.searchParams.delete('grupo');
    history.replaceState(null, '', u.pathname + u.search + u.hash);
  }
  return true;
}

let done = false;
export function registerParty(): void {
  if (done) return;
  done = true;
  initSquad();
  mountBell();
  void import('./lobby').then((m) => m.mountLobby());
  bus.on('notif-open', (n: Notif) => {
    if (n.invite) void import('../social/friends-ui').then((u) => u.acceptInvite(n.invite as Parameters<typeof u.acceptInvite>[0]));
    else void import('../social/register').then((r) => r.openSocial('friends'));
  });
}
