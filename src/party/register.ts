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
import { partyRoomFor, registerPartyGame, TOGETHER_GAMES } from './contract';

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
  // jogos de criar/explorar: o grupo abre junto e vê quem está ali (faixa "juntos" com emotes)
  for (const g of TOGETHER_GAMES) registerPartyGame(g, { mode: 'together' });
  let together: typeof import('./together') | null = null;
  bus.on('host-open', (id: string) => {
    if (TOGETHER_GAMES.includes(id) && partyRoomFor(id))
      void import('./together').then((m) => {
        together = m;
        void m.mountTogether(id);
      });
  });
  bus.on('host-close', () => together?.unmountTogether());
  void import('./lobby').then((m) => {
    m.mountLobby();
    // carrossel acompanha o líder ao vivo + votação (follow.ts)
    void import('./follow').then((f) => f.startFollow());
  });
  bus.on('notif-open', (n: Notif) => {
    if (n.invite) void import('../social/friends-ui').then((u) => u.acceptInvite(n.invite as Parameters<typeof u.acceptInvite>[0]));
    else void import('../social/register').then((r) => r.openSocial('friends'));
  });
}
