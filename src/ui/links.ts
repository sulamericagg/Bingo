/* ============================================================
 *  LINKS DO BLOOP WORLD (QR/convites): para onde cada um leva.
 *   ?voo=<CÓDIGO>     → abre o Pouso Forçado já entrando na sala
 *   ?grupo=<id>.<cod> → entra no grupo
 *   ?amigo=<@>        → Amigos com o @ preenchido
 *  (web: ?param na URL · app: bloopworld://tipo/código ou https://…/?param=)
 * ============================================================ */
import { bloopLink, parseBloopLink, type BloopLink } from './scan';

/** Executa um link já entendido. */
export async function openBloopLink(l: BloopLink): Promise<void> {
  if (l.type === 'amigo') {
    const r = await import('../social/register');
    r.openSocial('friends', l.code);
  } else if (l.type === 'grupo') {
    const p = await import('../party/register');
    p.openSquadLink(bloopLink('grupo', l.code));
  } else {
    const [{ setPendingVoo }, reg, hub] = await Promise.all([import('../games/voo/pending'), import('../hub/registry'), import('../hub/hub')]);
    setPendingVoo(l.code);
    const def = reg.listGames().find((g) => g.id === 'voo');
    if (def) await hub.launchGame(def);
  }
}

/** Link do Pouso Forçado na URL de abertura (?voo=). Tira da barra para recarregar não reabrir. */
export function openVooLink(url: string): boolean {
  const l = parseBloopLink(url);
  // ?voo= (web/https) e bloopworld://voo|grupo/… (app; ?grupo= e amigo já têm tratamento próprio)
  if (!l || !(l.type === 'voo' || (l.type === 'grupo' && url.startsWith('bloopworld:')))) return false;
  void openBloopLink(l);
  if (url === location.href) {
    const u = new URL(location.href);
    u.searchParams.delete('voo');
    history.replaceState(null, '', u.pathname + u.search + u.hash);
  }
  return true;
}
